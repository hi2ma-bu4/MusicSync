import { app, dialog } from "electron";
import fs from "node:fs";
import path from "node:path";
import { activeScanCancelled, resetScanCancelled } from "./cancelState";
import { getStorageWrapper } from "./storageWrapper";
import type { ScanResultItem, TrackMetadata } from "./types";
import { findMusicFiles, getTrackMetadata, normText, normTrack, prefetchSequential } from "./utils";

// Global scan results cache in-memory
export const lastScanResults: Record<string, ScanResultItem[]> = {};

function isDistinctTrack(I: TrackMetadata, P: TrackMetadata): boolean {
	// 1. Compare track total (トラック最大数, e.g., "1/5" vs "1/15")
	const iTrackTotal = I.track?.split("/")[1]?.trim();
	const pTrackTotal = P.track?.split("/")[1]?.trim();
	if (iTrackTotal && pTrackTotal && iTrackTotal !== pTrackTotal) {
		return true;
	}

	// 2. Compare disc number (ディスク番号, e.g., "1" vs "2")
	const iDiscNo = I.disc?.split("/")[0]?.trim();
	const pDiscNo = P.disc?.split("/")[0]?.trim();
	if (iDiscNo && pDiscNo && iDiscNo !== pDiscNo) {
		return true;
	}

	// 3. Compare disc total (ディスク最大数, e.g., "1/1" vs "1/2")
	const iDiscTotal = I.disc?.split("/")[1]?.trim();
	const pDiscTotal = P.disc?.split("/")[1]?.trim();
	if (iDiscTotal && pDiscTotal && iDiscTotal !== pDiscTotal) {
		return true;
	}

	// 4. Compare Album Art (presence and size)
	if (I.hasCoverArt !== P.hasCoverArt) {
		return true;
	}
	if (I.hasCoverArt && P.hasCoverArt && I.coverArtSize !== P.coverArtSize) {
		return true;
	}

	return false;
}

const cachesDir = path.join(app.getPath("userData"), "caches");
if (!fs.existsSync(cachesDir)) {
	fs.mkdirSync(cachesDir, { recursive: true });
}

function getCachePath(profileId: string, suffix: string): string {
	return path.join(cachesDir, `${profileId}_${suffix}.json`);
}

function loadCache(profileId: string, suffix: string): Record<string, TrackMetadata> {
	const cachePath = getCachePath(profileId, suffix);
	if (fs.existsSync(cachePath)) {
		try {
			const cache = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
			// Check if cache needs conversion or is empty/corrupt
			let hasFormatMismatch = false;
			const keys = Object.keys(cache);
			if (keys.length > 0) {
				const firstItem = cache[keys[0]];
				if (firstItem && (firstItem.comment === undefined || firstItem.duration === undefined)) {
					hasFormatMismatch = true;
				}
			}
			if (hasFormatMismatch) {
				const choice = dialog.showMessageBoxSync({
					type: "question",
					buttons: ["はい (Yes)", "いいえ (No)"],
					title: "キャッシュフォーマット変更の確認",
					message: "アップデートによりキャッシュデータのフォーマットが新しくなりました。古いキャッシュを削除（リセット）して再構築しますか？",
				});
				if (choice === 0) {
					try {
						fs.unlinkSync(cachePath);
					} catch (e) {}
					return {};
				}
			}
			return cache;
		} catch (e) {
			console.error("Failed to parse cache", e);
			dialog.showMessageBoxSync({
				type: "warning",
				buttons: ["了解"],
				title: "キャッシュ読み込みエラー",
				message: "プロファイルのキャッシュファイルが破損しているか、フォーマットが古いため読み込めませんでした。キャッシュは自動的に再構築されます。",
			});
		}
	}
	return {};
}

function saveCache(profileId: string, suffix: string, cache: Record<string, TrackMetadata>) {
	const cachePath = getCachePath(profileId, suffix);
	try {
		fs.writeFileSync(cachePath, JSON.stringify(cache), "utf-8");
	} catch (e) {
		console.error("Failed to save cache", e);
	}
}

export async function runScan(profile: any, event: Electron.IpcMainInvokeEvent): Promise<void> {
	resetScanCancelled();
	const profileId = profile.id;
	const sendProgress = (step: string, message: string, progress: number, details?: any) => {
		event.sender.send("scan-progress", { step, message, progress, ...details });
	};

	const storage = getStorageWrapper(profile);
	if (!(await storage.isConnected())) {
		throw new Error(`比較先「${profile.name}」にアクセスできません。接続状況を確認してください。`);
	}

	sendProgress("itunes_list", "iTunesフォルダ内のファイルを検索中...", 5);
	const itunesFiles = await findMusicFiles(profile.itunesPath);
	if (activeScanCancelled) {
		throw new Error("スキャン処理がユーザーによりキャンセルされました。");
	}

	sendProgress("phone_list", "比較先フォルダ内のファイルを検索中...", 15);
	const phoneFiles = await storage.findMusicFiles((msg) => {
		if (activeScanCancelled) {
			// We can trigger an error/interrupt inside the progress callback
			throw new Error("スキャン処理がユーザーによりキャンセルされました。");
		}
		sendProgress("phone_list", msg, 15);
	});
	if (activeScanCancelled) {
		throw new Error("スキャン処理がユーザーによりキャンセルされました。");
	}

	// Load caches
	const itunesCache = loadCache(profileId, "itunes");
	const phoneCache = loadCache(profileId, "phone");

	// Build indices for path-independent lookup
	const buildSecondaryIndex = (cache: Record<string, TrackMetadata>) => {
		const index = new Map<string, TrackMetadata>();
		for (const key of Object.keys(cache)) {
			const meta = cache[key];
			if (meta && meta.size !== undefined && meta.mtimeMs !== undefined) {
				index.set(`${meta.size}_${meta.mtimeMs}`, meta);
			}
		}
		return index;
	};

	const buildInoIndex = (cache: Record<string, TrackMetadata>) => {
		const index = new Map<number, TrackMetadata>();
		for (const key of Object.keys(cache)) {
			const meta = cache[key];
			if (meta && meta.ino !== undefined) {
				index.set(meta.ino, meta);
			}
		}
		return index;
	};

	const itunesSecondaryIndex = buildSecondaryIndex(itunesCache);
	const phoneSecondaryIndex = buildSecondaryIndex(phoneCache);

	const itunesInoIndex = buildInoIndex(itunesCache);
	const phoneInoIndex = buildInoIndex(phoneCache);

	const newItunesCache: Record<string, TrackMetadata> = {};
	const newPhoneCache: Record<string, TrackMetadata> = {};

	const itunesTracks: TrackMetadata[] = [];
	const phoneTracks: TrackMetadata[] = [];

	// ==========================================
	// 1. Process iTunes tracks (Local)
	// ==========================================
	sendProgress("itunes_parse", "iTunesファイルのステータス情報を先読み中...", 15);
	// Prefetch sequential stats with lookahead 4 to hide I/O latency
	const itunesStatted = await prefetchSequential(
		itunesFiles,
		async (file) => {
			if (activeScanCancelled) throw new Error("スキャン処理がユーザーによりキャンセルされました。");
			try {
				const stats = await fs.promises.stat(file.filePath);
				return { ...file, stats, valid: true };
			} catch (e) {
				console.error("Error statting iTunes file", file.filePath, e);
				return { ...file, stats: null as any, valid: false };
			}
		},
		4
	);
	if (activeScanCancelled) throw new Error("スキャン処理がユーザーによりキャンセルされました。");

	const itunesValid = itunesStatted.filter((f) => f.valid);
	// LBA Sort: sort by inode ascending to minimize head seeks on mechanical drives
	itunesValid.sort((a, b) => a.stats.ino - b.stats.ino);

	// Parse in LBA order with lookahead 2 prefetching
	const itunesParsedResults = await prefetchSequential(
		itunesValid,
		async (item) => {
			if (activeScanCancelled) throw new Error("スキャン処理がユーザーによりキャンセルされました。");
			const file = { filePath: item.filePath, relativePath: item.relativePath };
			const stats = item.stats;
			let meta: TrackMetadata | undefined = itunesCache[file.relativePath];

			if (meta && meta.mtimeMs === stats.mtimeMs && meta.size === stats.size) {
				// Direct cache hit
				meta.ino = stats.ino;
				return { file, meta };
			}

			// Inode cache hit (rename/move)
			const cachedByIno = itunesInoIndex.get(stats.ino);
			if (cachedByIno && cachedByIno.mtimeMs === stats.mtimeMs && cachedByIno.size === stats.size) {
				meta = {
					...cachedByIno,
					filePath: file.filePath,
					relativePath: file.relativePath,
					ino: stats.ino,
				};
				return { file, meta };
			}

			// Secondary index cache hit (mtime + size)
			const key = `${stats.size}_${stats.mtimeMs}`;
			const cachedMeta = itunesSecondaryIndex.get(key);
			if (cachedMeta) {
				meta = {
					...cachedMeta,
					filePath: file.filePath,
					relativePath: file.relativePath,
					ino: stats.ino,
				};
				return { file, meta };
			}

			// Cache miss - parse metadata
			try {
				meta = await getTrackMetadata(file.filePath, file.relativePath);
				meta.ino = stats.ino;
				return { file, meta };
			} catch (err) {
				console.error("Failed to parse iTunes track:", file.filePath, err);
				const fallback: TrackMetadata = {
					id: "",
					filePath: file.filePath,
					relativePath: file.relativePath,
					title: path.basename(file.filePath, path.extname(file.filePath)),
					artist: "Unknown Artist",
					album: "Unknown Album",
					track: "",
					genre: "Unknown Genre",
					size: stats.size,
					mtimeMs: stats.mtimeMs,
					hasCoverArt: false,
					coverArtSize: 0,
					disc: "",
					albumartist: "",
					composer: "",
					year: "",
					comment: "",
					duration: 0,
					ino: stats.ino,
				};
				return { file, meta: fallback };
			}
		},
		2
	);

	let itunesCurrent = 0;
	let itunesTotal = itunesParsedResults.length;
	for (const res of itunesParsedResults) {
		if (activeScanCancelled) throw new Error("スキャン処理がユーザーによりキャンセルされました。");
		itunesCurrent++;
		if (itunesCurrent % 100 === 0 || itunesCurrent === itunesTotal) {
			const pct = 15 + Math.round((itunesCurrent / itunesTotal) * 35);
			sendProgress("itunes_parse", `iTunesの曲情報を解析中... (${itunesCurrent}/${itunesTotal})`, pct, { count: itunesCurrent, total: itunesTotal });
		}
		const meta = res.meta;
		meta.id = `itunes_${res.file.relativePath}`;
		itunesTracks.push(meta);
		newItunesCache[res.file.relativePath] = meta;
	}
	saveCache(profileId, "itunes", newItunesCache);

	// ==========================================
	// 2. Process Phone tracks
	// ==========================================
	if (profile.storageType === "local") {
		sendProgress("phone_parse", "比較先ファイルのステータス情報を先読み中...", 50);
		// Prefetch sequential stats with lookahead 4
		const phoneStatted = await prefetchSequential(
			phoneFiles,
			async (file) => {
				if (activeScanCancelled) throw new Error("スキャン処理がユーザーによりキャンセルされました。");
				try {
					const stats = await fs.promises.stat(file.filePath);
					return { ...file, stats, valid: true };
				} catch (e) {
					console.error("Error statting Phone file", file.filePath, e);
					return { ...file, stats: null as any, valid: false };
				}
			},
			4
		);
		if (activeScanCancelled) throw new Error("スキャン処理がユーザーによりキャンセルされました。");

		const phoneValid = phoneStatted.filter((f) => f.valid);
		// LBA Sort: sort by inode ascending
		phoneValid.sort((a, b) => a.stats.ino - b.stats.ino);

		// Parse in LBA order with lookahead 2 prefetching
		const phoneParsedResults = await prefetchSequential(
			phoneValid,
			async (item) => {
				if (activeScanCancelled) throw new Error("スキャン処理がユーザーによりキャンセルされました。");
				const file = { filePath: item.filePath, relativePath: item.relativePath };
				const stats = item.stats;
				let meta: TrackMetadata | undefined = phoneCache[file.relativePath];

				if (meta && meta.mtimeMs === stats.mtimeMs && meta.size === stats.size) {
					// Direct cache hit
					meta.ino = stats.ino;
					return { file, meta };
				}

				// Inode cache hit (rename/move)
				const cachedByIno = phoneInoIndex.get(stats.ino);
				if (cachedByIno && cachedByIno.mtimeMs === stats.mtimeMs && cachedByIno.size === stats.size) {
					meta = {
						...cachedByIno,
						filePath: file.filePath,
						relativePath: file.relativePath,
						ino: stats.ino,
					};
					return { file, meta };
				}

				// Secondary index cache hit (mtime + size)
				const key = `${stats.size}_${stats.mtimeMs}`;
				const cachedMeta = phoneSecondaryIndex.get(key);
				if (cachedMeta) {
					meta = {
						...cachedMeta,
						filePath: file.filePath,
						relativePath: file.relativePath,
						ino: stats.ino,
					};
					return { file, meta };
				}

				// Cache miss - parse metadata
				try {
					meta = await storage.getTrackMetadata(file.filePath, file.relativePath);
					meta.ino = stats.ino;
					return { file, meta };
				} catch (err) {
					console.error("Failed to parse Phone track:", file.filePath, err);
					const fallback: TrackMetadata = {
						id: "",
						filePath: file.filePath,
						relativePath: file.relativePath,
						title: path.basename(file.filePath, path.extname(file.filePath)),
						artist: "Unknown Artist",
						album: "Unknown Album",
						track: "",
						genre: "Unknown Genre",
						size: stats.size,
						mtimeMs: stats.mtimeMs,
						hasCoverArt: false,
						coverArtSize: 0,
						disc: "",
						albumartist: "",
						composer: "",
						year: "",
						comment: "",
						duration: 0,
						ino: stats.ino,
					};
					return { file, meta: fallback };
				}
			},
			2
		);

		let phoneCurrent = 0;
		let phoneTotal = phoneParsedResults.length;
		for (const res of phoneParsedResults) {
			if (activeScanCancelled) throw new Error("スキャン処理がユーザーによりキャンセルされました。");
			phoneCurrent++;
			if (phoneCurrent % 100 === 0 || phoneCurrent === phoneTotal) {
				const pct = 50 + Math.round((phoneCurrent / phoneTotal) * 35);
				sendProgress("phone_parse", `比較先フォルダ内の曲情報を解析中... (${phoneCurrent}/${phoneTotal})`, pct, { count: phoneCurrent, total: phoneTotal });
			}
			const meta = res.meta;
			meta.id = `phone_${res.file.relativePath}`;
			phoneTracks.push(meta);
			newPhoneCache[res.file.relativePath] = meta;
		}
	} else {
		// Non-local storage (MTP devices) - Use standard sequential loop unmodified for complete safety
		let current = 0;
		let total = phoneFiles.length;
		for (const file of phoneFiles) {
			if (activeScanCancelled) {
				throw new Error("スキャン処理がユーザーによりキャンセルされました。");
			}
			current++;
			if (current % 100 === 0 || current === total) {
				const pct = 50 + Math.round((current / total) * 35);
				sendProgress("phone_parse", `比較先フォルダ内の曲情報を解析中... (${current}/${total})`, pct, { count: current, total });
			}

			try {
				let size = file.size;
				let mtimeMs = file.mtimeMs;
				if (size === undefined || mtimeMs === undefined) {
					const stats = await fs.promises.stat(file.filePath);
					size = stats.size;
					mtimeMs = stats.mtimeMs;
				}
				let meta: TrackMetadata | undefined = phoneCache[file.relativePath];

				if (meta && meta.mtimeMs === mtimeMs && meta.size === size) {
					// Cache hit
					newPhoneCache[file.relativePath] = meta;
				} else {
					// Try secondary index lookup by size + mtimeMs
					const key = `${size}_${mtimeMs}`;
					const cachedMeta = phoneSecondaryIndex.get(key);
					if (cachedMeta) {
						// Cache hit via size + mtimeMs (path reorganized)
						meta = {
							...cachedMeta,
							filePath: file.filePath,
							relativePath: file.relativePath,
						};
						newPhoneCache[file.relativePath] = meta;
					} else {
						// Parse
						meta = await storage.getTrackMetadata(file.filePath, file.relativePath);
						newPhoneCache[file.relativePath] = meta;
					}
				}
				meta.id = `phone_${file.relativePath}`;
				phoneTracks.push(meta);
			} catch (e) {
				console.error("Error stats phone file", file.filePath, e);
			}
		}
	}
	saveCache(profileId, "phone", newPhoneCache);

	sendProgress("comparing", "曲情報の差分を比較中...", 90);

	// Index Phone tracks for N-1 O(1) matching
	const phoneByTitle = new Map<string, TrackMetadata[]>();
	const phoneByArtistAlbumTrack = new Map<string, TrackMetadata[]>();
	const phoneByRelativePath = new Map<string, TrackMetadata>();

	for (const p of phoneTracks) {
		phoneByRelativePath.set(p.relativePath, p);

		const tNorm = normText(p.title);
		if (tNorm) {
			if (!phoneByTitle.has(tNorm)) phoneByTitle.set(tNorm, []);
			phoneByTitle.get(tNorm)!.push(p);
		}

		const aNorm = normText(p.artist);
		const albNorm = normText(p.album);
		const trkNorm = normTrack(p.track);
		const key = `${aNorm}|${albNorm}|${trkNorm}`;
		if (aNorm || albNorm || trkNorm) {
			if (!phoneByArtistAlbumTrack.has(key)) phoneByArtistAlbumTrack.set(key, []);
			phoneByArtistAlbumTrack.get(key)!.push(p);
		}
	}

	const matchedPhoneIds = new Set<string>();
	const results: ScanResultItem[] = [];

	// Match iTunes tracks to Phone tracks
	for (const I of itunesTracks) {
		const candidates = new Set<TrackMetadata>();

		// 1. Direct path match
		const directPathMatch = phoneByRelativePath.get(I.relativePath);
		if (directPathMatch) {
			candidates.add(directPathMatch);
		}

		// 2. Title lookups
		const iTitleNorm = normText(I.title);
		if (iTitleNorm) {
			const list = phoneByTitle.get(iTitleNorm) || [];
			for (const p of list) {
				candidates.add(p);
			}
		}

		// 3. Artist/Album/Track lookups
		const iArtistNorm = normText(I.artist);
		const iAlbumNorm = normText(I.album);
		const iTrackNorm = normTrack(I.track);
		const key = `${iArtistNorm}|${iAlbumNorm}|${iTrackNorm}`;
		if (iArtistNorm || iAlbumNorm || iTrackNorm) {
			const list = phoneByArtistAlbumTrack.get(key) || [];
			for (const p of list) {
				candidates.add(p);
			}
		}

		// Calculate N-1 match scores and select best candidate
		let bestMatch: TrackMetadata | null = null;
		let bestScore = 0;

		const nonEmptyCount = (iArtistNorm !== "" ? 1 : 0) + (iAlbumNorm !== "" ? 1 : 0) + (iTitleNorm !== "" ? 1 : 0) + (iTrackNorm !== "" ? 1 : 0);

		for (const P of candidates) {
			if (matchedPhoneIds.has(P.id)) continue;
			if (isDistinctTrack(I, P)) continue;

			let score = 0;

			// Artist
			const pArtistNorm = normText(P.artist);
			if (iArtistNorm === pArtistNorm && iArtistNorm !== "") {
				score++;
			} else if (iArtistNorm === "" && pArtistNorm === "") {
				score++;
			}

			// Album
			const pAlbumNorm = normText(P.album);
			if (iAlbumNorm === pAlbumNorm && iAlbumNorm !== "") {
				score++;
			} else if (iAlbumNorm === "" && pAlbumNorm === "") {
				score++;
			}

			// Title
			const pTitleNorm = normText(P.title);
			if (iTitleNorm === pTitleNorm && iTitleNorm !== "") {
				score++;
			} else if (iTitleNorm === "" && pTitleNorm === "") {
				score++;
			}

			// Track
			const pTrackNorm = normTrack(P.track);
			if (iTrackNorm === pTrackNorm && iTrackNorm !== "") {
				score++;
			} else if (iTrackNorm === "" && pTrackNorm === "") {
				score++;
			}

			// N-1 matching rule: 3 or 4 fields match
			// But protect against false positives (e.g. mostly empty metadata matching other mostly empty metadata)
			let isValidMatch = false;
			if (nonEmptyCount < 2) {
				// Too empty. Only match if relative path matches exactly or if title matches exactly and there is at least one other metadata.
				if (I.relativePath === P.relativePath) {
					isValidMatch = true;
				}
			} else {
				if (score >= 3) {
					isValidMatch = true;
				}
			}

			if (isValidMatch) {
				// Best candidate criteria
				if (!bestMatch) {
					bestMatch = P;
					bestScore = score;
				} else {
					// Tie breaks:
					// 1. Direct relative path match
					if (P.relativePath === I.relativePath) {
						bestMatch = P;
						bestScore = score;
					} else if (bestMatch.relativePath !== I.relativePath) {
						// 2. Higher score
						if (score > bestScore) {
							bestMatch = P;
							bestScore = score;
						}
					}
				}
			}
		}

		if (bestMatch) {
			matchedPhoneIds.add(bestMatch.id);

			// In MTP mode, files are stored flat or directly matching.
			// Path mismatch checks are disabled/set to false to prevent endless reorganizations.
			const pathMismatch = profile.storageType === "mtp" || profile.storageType === "mtp_powershell" ? false : I.relativePath !== bestMatch.relativePath;

			// Determine if metadata changed (any mismatching field out of the 4, or cover art difference)
			let metadataMismatch = false;
			if (bestScore < 4) {
				metadataMismatch = true;
			}
			if (I.hasCoverArt !== bestMatch.hasCoverArt || I.coverArtSize !== bestMatch.coverArtSize) {
				metadataMismatch = true;
			}
			if (I.genre !== bestMatch.genre) {
				metadataMismatch = true;
			}

			// Check the new fields: albumartist, composer, year, comment
			if ((I.albumartist || "") !== (bestMatch.albumartist || "")) {
				metadataMismatch = true;
			}
			if ((I.composer || "") !== (bestMatch.composer || "")) {
				metadataMismatch = true;
			}
			if ((I.year || "") !== (bestMatch.year || "")) {
				metadataMismatch = true;
			}
			if ((I.comment || "") !== (bestMatch.comment || "")) {
				metadataMismatch = true;
			}

			results.push({
				id: I.id,
				itunesTrack: I,
				phoneTrack: bestMatch,
				status: metadataMismatch ? "updated" : "synced",
				pathMismatch,
			});
		} else {
			results.push({
				id: I.id,
				itunesTrack: I,
				status: "missing",
				pathMismatch: false,
			});
		}
	}

	// Any Phone tracks not matched are Phone Only
	for (const P of phoneTracks) {
		if (!matchedPhoneIds.has(P.id)) {
			results.push({
				id: P.id,
				phoneTrack: P,
				status: "phone_only",
				pathMismatch: false,
			});
		}
	}

	lastScanResults[profileId] = results;

	sendProgress("done", "比較完了", 100);
}
