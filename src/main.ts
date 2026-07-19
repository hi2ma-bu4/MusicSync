import { app, BrowserWindow, dialog, ipcMain } from "electron";
import Store from "electron-store";
import { parseFile } from "music-metadata";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Initialize Electron Store
const store = new Store();

// Types
interface TrackMetadata {
	id: string;
	filePath: string;
	relativePath: string;
	title: string;
	artist: string;
	album: string;
	track: string;
	genre: string;
	size: number;
	mtimeMs: number;
	hasCoverArt: boolean;
	coverArtSize: number;
}

interface ScanResultItem {
	id: string;
	itunesTrack?: TrackMetadata;
	phoneTrack?: TrackMetadata;
	status: "missing" | "updated" | "synced" | "phone_only";
	pathMismatch: boolean;
}

// Global scan results cache in-memory
const lastScanResults: Record<string, ScanResultItem[]> = {};

function createWindow() {
	const win = new BrowserWindow({
		width: 1200,
		height: 800,
		webPreferences: {
			preload: path.join(process.cwd(), "dist", "preload.js"),
			contextIsolation: true,
		},
	});

	win.loadFile(path.join(process.cwd(), "dist", "index.html"));
}

app.whenReady().then(createWindow);

// Profile and Settings IPC Handlers
ipcMain.handle("get-profiles", () => {
	return store.get("profiles", []);
});

ipcMain.handle("save-profile", (_event, profile: any) => {
	const profiles: any[] = store.get("profiles", []) as any[];
	const index = profiles.findIndex((p) => p.id === profile.id);
	if (index > -1) {
		profiles[index] = profile;
	} else {
		profiles.push(profile);
	}
	store.set("profiles", profiles);
	return profiles;
});

ipcMain.handle("delete-profile", (_event, id: string) => {
	let profiles: any[] = store.get("profiles", []) as any[];
	profiles = profiles.filter((p) => p.id !== id);
	store.set("profiles", profiles);
	return profiles;
});

ipcMain.handle("get-settings", () => {
	return store.get("settings", {
		colorMissing: "#22c55e",
		colorUpdated: "#f59e0b",
		colorSynced: "#94a3b8",
		colorPhoneOnly: "#ef4444",
	});
});

ipcMain.handle("save-settings", (_event, settings: any) => {
	store.set("settings", settings);
});

ipcMain.handle("select-folder", async () => {
	const result = await dialog.showOpenDialog({
		properties: ["openDirectory"],
	});
	if (result.canceled) {
		return null;
	}
	return result.filePaths[0];
});

// Cache directories setup
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
			return JSON.parse(fs.readFileSync(cachePath, "utf-8"));
		} catch (e) {
			console.error("Failed to parse cache", e);
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

// Normalizer utilities
function normText(val: string | null | undefined): string {
	if (!val) return "";
	return String(val)
		.trim()
		.toLowerCase()
		.normalize("NFKC")
		.replace(/[\s\-_]+/g, " ");
}

function normTrack(val: string | null | undefined): string {
	if (!val) return "";
	const s = String(val).trim();
	const firstPart = s.split("/")[0].trim();
	const num = parseInt(firstPart, 10);
	if (!isNaN(num)) {
		return String(num);
	}
	return firstPart.toLowerCase();
}

async function findMusicFiles(dir: string, baseDir: string = dir): Promise<{ filePath: string; relativePath: string }[]> {
	const results: { filePath: string; relativePath: string }[] = [];
	let list: fs.Dirent[] = [];
	try {
		list = await fs.promises.readdir(dir, { withFileTypes: true });
	} catch (e) {
		return [];
	}

	const validExtensions = new Set([".mp3", ".m4a", ".aac", ".flac", ".wav", ".ogg", ".wma"]);

	for (const item of list) {
		const resPath = path.join(dir, item.name);
		if (item.isDirectory()) {
			const subFiles = await findMusicFiles(resPath, baseDir);
			results.push(...subFiles);
		} else {
			const ext = path.extname(item.name).toLowerCase();
			if (validExtensions.has(ext)) {
				const relativePath = path.relative(baseDir, resPath).replace(/\\/g, "/");
				results.push({ filePath: resPath, relativePath });
			}
		}
	}
	return results;
}

async function getTrackMetadata(filePath: string, relativePath: string): Promise<TrackMetadata> {
	try {
		const stats = await fs.promises.stat(filePath);
		const metadata = await parseFile(filePath, { skipCovers: false });
		const title = metadata.common.title || path.basename(filePath, path.extname(filePath));
		const artist = metadata.common.artist || "Unknown Artist";
		const album = metadata.common.album || "Unknown Album";

		let trackStr = "";
		if (metadata.common.track && metadata.common.track.no !== null) {
			trackStr = String(metadata.common.track.no);
		}

		const genre = (metadata.common.genre && metadata.common.genre[0]) || "Unknown Genre";
		const picture = metadata.common.picture && metadata.common.picture[0];
		const hasCoverArt = !!picture;
		const coverArtSize = picture ? picture.data.length : 0;

		return {
			id: "",
			filePath,
			relativePath,
			title,
			artist,
			album,
			track: trackStr,
			genre,
			size: stats.size,
			mtimeMs: stats.mtimeMs,
			hasCoverArt,
			coverArtSize,
		};
	} catch (err) {
		const stats = await fs.promises.stat(filePath);
		return {
			id: "",
			filePath,
			relativePath,
			title: path.basename(filePath, path.extname(filePath)),
			artist: "Unknown Artist",
			album: "Unknown Album",
			track: "",
			genre: "Unknown Genre",
			size: stats.size,
			mtimeMs: stats.mtimeMs,
			hasCoverArt: false,
			coverArtSize: 0,
		};
	}
}

// Scanning and Matching IPC Handler
ipcMain.handle("start-scan", async (event, profileId: string) => {
	const profiles: any[] = store.get("profiles", []) as any[];
	const profile = profiles.find((p) => p.id === profileId);
	if (!profile) {
		throw new Error("Profile not found");
	}

	const sendProgress = (step: string, message: string, progress: number, details?: any) => {
		event.sender.send("scan-progress", { step, message, progress, ...details });
	};

	sendProgress("itunes_list", "iTunesフォルダ内のファイルを検索中...", 5);
	const itunesFiles = await findMusicFiles(profile.itunesPath);

	sendProgress("phone_list", "スマホフォルダ内のファイルを検索中...", 15);
	const phoneFiles = await findMusicFiles(profile.phonePath);

	// Load caches
	const itunesCache = loadCache(profileId, "itunes");
	const phoneCache = loadCache(profileId, "phone");

	const newItunesCache: Record<string, TrackMetadata> = {};
	const newPhoneCache: Record<string, TrackMetadata> = {};

	const itunesTracks: TrackMetadata[] = [];
	const phoneTracks: TrackMetadata[] = [];

	// Parse iTunes tracks with cache
	let current = 0;
	let total = itunesFiles.length;
	for (const file of itunesFiles) {
		current++;
		if (current % 100 === 0 || current === total) {
			const pct = 15 + Math.round((current / total) * 35);
			sendProgress("itunes_parse", `iTunesの曲情報を解析中... (${current}/${total})`, pct, { count: current, total });
		}

		try {
			const stats = await fs.promises.stat(file.filePath);
			let meta: TrackMetadata | undefined = itunesCache[file.relativePath];

			if (meta && meta.mtimeMs === stats.mtimeMs && meta.size === stats.size) {
				// Cache hit
				newItunesCache[file.relativePath] = meta;
			} else {
				// Parse
				meta = await getTrackMetadata(file.filePath, file.relativePath);
				newItunesCache[file.relativePath] = meta;
			}
			meta.id = `itunes_${file.relativePath}`;
			itunesTracks.push(meta);
		} catch (e) {
			console.error("Error stats itunes file", file.filePath, e);
		}
	}
	saveCache(profileId, "itunes", newItunesCache);

	// Parse Phone tracks with cache
	current = 0;
	total = phoneFiles.length;
	for (const file of phoneFiles) {
		current++;
		if (current % 100 === 0 || current === total) {
			const pct = 50 + Math.round((current / total) * 35);
			sendProgress("phone_parse", `スマホの曲情報を解析中... (${current}/${total})`, pct, { count: current, total });
		}

		try {
			const stats = await fs.promises.stat(file.filePath);
			let meta: TrackMetadata | undefined = phoneCache[file.relativePath];

			if (meta && meta.mtimeMs === stats.mtimeMs && meta.size === stats.size) {
				// Cache hit
				newPhoneCache[file.relativePath] = meta;
			} else {
				// Parse
				meta = await getTrackMetadata(file.filePath, file.relativePath);
				newPhoneCache[file.relativePath] = meta;
			}
			meta.id = `phone_${file.relativePath}`;
			phoneTracks.push(meta);
		} catch (e) {
			console.error("Error stats phone file", file.filePath, e);
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
		let bestMatchesFields: string[] = [];

		const nonEmptyCount = (iArtistNorm !== "" ? 1 : 0) + (iAlbumNorm !== "" ? 1 : 0) + (iTitleNorm !== "" ? 1 : 0) + (iTrackNorm !== "" ? 1 : 0);

		for (const P of candidates) {
			if (matchedPhoneIds.has(P.id)) continue;

			let score = 0;
			const fields: string[] = [];

			// Artist
			const pArtistNorm = normText(P.artist);
			if (iArtistNorm === pArtistNorm && iArtistNorm !== "") {
				score++;
				fields.push("artist");
			} else if (iArtistNorm === "" && pArtistNorm === "") {
				score++;
				fields.push("artist");
			}

			// Album
			const pAlbumNorm = normText(P.album);
			if (iAlbumNorm === pAlbumNorm && iAlbumNorm !== "") {
				score++;
				fields.push("album");
			} else if (iAlbumNorm === "" && pAlbumNorm === "") {
				score++;
				fields.push("album");
			}

			// Title
			const pTitleNorm = normText(P.title);
			if (iTitleNorm === pTitleNorm && iTitleNorm !== "") {
				score++;
				fields.push("title");
			} else if (iTitleNorm === "" && pTitleNorm === "") {
				score++;
				fields.push("title");
			}

			// Track
			const pTrackNorm = normTrack(P.track);
			if (iTrackNorm === pTrackNorm && iTrackNorm !== "") {
				score++;
				fields.push("track");
			} else if (iTrackNorm === "" && pTrackNorm === "") {
				score++;
				fields.push("track");
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
					bestMatchesFields = fields;
				} else {
					// Tie breaks:
					// 1. Direct relative path match
					if (P.relativePath === I.relativePath) {
						bestMatch = P;
						bestScore = score;
						bestMatchesFields = fields;
					} else if (bestMatch.relativePath !== I.relativePath) {
						// 2. Higher score
						if (score > bestScore) {
							bestMatch = P;
							bestScore = score;
							bestMatchesFields = fields;
						}
					}
				}
			}
		}

		if (bestMatch) {
			matchedPhoneIds.add(bestMatch.id);

			const pathMismatch = I.relativePath !== bestMatch.relativePath;

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
});

ipcMain.handle("get-scan-result", (_event, profileId: string) => {
	return lastScanResults[profileId] || [];
});

async function cleanEmptyDirsRecursive(dir: string, rootDir: string) {
	try {
		const list = await fs.promises.readdir(dir, { withFileTypes: true });
		for (const item of list) {
			if (item.isDirectory()) {
				const sub = path.join(dir, item.name);
				await cleanEmptyDirsRecursive(sub, rootDir);
			}
		}

		if (dir !== rootDir) {
			const files = await fs.promises.readdir(dir);
			if (files.length === 0) {
				await fs.promises.rmdir(dir);
			}
		}
	} catch (e) {
		// Ignore
	}
}

// Sync Execution IPC Handler
ipcMain.handle("execute-sync", async (event, profileId: string, options: any) => {
	const profiles: any[] = store.get("profiles", []) as any[];
	const profile = profiles.find((p) => p.id === profileId);
	if (!profile) {
		throw new Error("Profile not found");
	}

	const { copyTrackIds, moveTrackIds, deleteTrackIds } = options;
	const scanItems = lastScanResults[profileId] || [];

	const sendProgress = (status: "running" | "done" | "error", message: string, progress: number, logs: string[]) => {
		event.sender.send("sync-progress", { status, message, progress, logs });
	};

	const logs: string[] = [];
	const logAndSend = (msg: string, pct: number) => {
		logs.push(msg);
		sendProgress("running", msg, pct, logs);
	};

	const totalOperations = copyTrackIds.length + moveTrackIds.length + deleteTrackIds.length;
	let completed = 0;

	const getPct = () => {
		if (totalOperations === 0) return 100;
		return Math.round((completed / totalOperations) * 100);
	};
	try {
		// 1. DELETE OPERATIONS
		if (deleteTrackIds.length > 0) {
			logAndSend(`スマホ側の余分な曲の削除を開始します... (対象: ${deleteTrackIds.length}曲)`, getPct());
			for (const id of deleteTrackIds) {
				const item = scanItems.find((x) => x.id === id);
				if (item && item.phoneTrack) {
					try {
						if (fs.existsSync(item.phoneTrack.filePath)) {
							await fs.promises.unlink(item.phoneTrack.filePath);
						}
						logAndSend(`削除成功: ${item.phoneTrack.relativePath}`, getPct());
					} catch (e: any) {
						logAndSend(`削除失敗: ${item.phoneTrack.relativePath} - ${e.message}`, getPct());
					}
				}
				completed++;
			}
		}

		// 2. MOVE (REORGANIZE) OPERATIONS
		if (moveTrackIds.length > 0) {
			logAndSend(`スマホ側のファイルの配置再整理を開始します... (対象: ${moveTrackIds.length}曲)`, getPct());
			for (const id of moveTrackIds) {
				const item = scanItems.find((x) => x.id === id);
				if (item && item.itunesTrack && item.phoneTrack) {
					const oldPath = item.phoneTrack.filePath;
					const newRelative = item.itunesTrack.relativePath;
					const newPath = path.join(profile.phonePath, newRelative);

					try {
						if (fs.existsSync(oldPath)) {
							const targetDir = path.dirname(newPath);
							await fs.promises.mkdir(targetDir, { recursive: true });

							// Safely rename or fallback to copy/unlink
							try {
								await fs.promises.rename(oldPath, newPath);
							} catch (e) {
								await fs.promises.copyFile(oldPath, newPath);
								await fs.promises.unlink(oldPath);
							}

							logAndSend(`移動成功: ${item.phoneTrack.relativePath} -> ${newRelative}`, getPct());
							// Update phone track info in our results
							item.phoneTrack.filePath = newPath;
							item.phoneTrack.relativePath = newRelative;
							item.pathMismatch = false;
						} else {
							logAndSend(`警告: 移動元ファイルが存在しません: ${item.phoneTrack.relativePath}`, getPct());
						}
					} catch (e: any) {
						logAndSend(`移動失敗: ${item.phoneTrack.relativePath} - ${e.message}`, getPct());
					}
				}
				completed++;
			}
		}

		// 3. COPY OPERATIONS
		if (copyTrackIds.length > 0) {
			logAndSend(`iTunesからスマホへの曲のコピーを開始します... (対象: ${copyTrackIds.length}曲)`, getPct());
			for (const id of copyTrackIds) {
				const item = scanItems.find((x) => x.id === id);
				if (item && item.itunesTrack) {
					const sourcePath = item.itunesTrack.filePath;
					const relative = item.itunesTrack.relativePath;
					const targetPath = path.join(profile.phonePath, relative);

					try {
						if (fs.existsSync(sourcePath)) {
							const targetDir = path.dirname(targetPath);
							await fs.promises.mkdir(targetDir, { recursive: true });
							await fs.promises.copyFile(sourcePath, targetPath);
							logAndSend(`コピー成功: ${relative}`, getPct());
						} else {
							logAndSend(`エラー: コピー元ファイルが存在しません: ${relative}`, getPct());
						}
					} catch (e: any) {
						logAndSend(`コピー失敗: ${relative} - ${e.message}`, getPct());
					}
				}
				completed++;
			}
		}

		// 4. CLEAN UP EMPTY DIRECTORIES
		logAndSend("スマホフォルダ内の空フォルダをクリーンアップ中...", getPct());
		await cleanEmptyDirsRecursive(profile.phonePath, profile.phonePath);
		logAndSend("空フォルダのクリーンアップが完了しました。", 100);

		sendProgress("done", "同期完了", 100, logs);
	} catch (e: any) {
		logs.push(`致命的なエラーが発生しました: ${e.message}`);
		sendProgress("error", "エラー終了", getPct(), logs);
	}
});
