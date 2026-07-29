import { DEFAULT_DELIMITERS } from "../../shared/constants";
import { PHONE_DISPLAY_LABEL, state } from "../state";

// Generates a safe HTML ID by hex-encoding the identifier part
export function getSafeId(prefix: string, name: string): string {
	let hex = "";
	for (let i = 0; i < name.length; i++) {
		hex += name.charCodeAt(i).toString(16);
	}
	return `${prefix}_${hex}`;
}

// Returns color styles representing track status
export function getStatusDot(track: any): string {
	const label = {
		missing: `${PHONE_DISPLAY_LABEL}に未存在 (新規)`,
		updated: "メタデータ変更あり",
		synced: "同期済",
		phone_only: `${PHONE_DISPLAY_LABEL}側のみに存在`,
	}[track.status as "missing" | "updated" | "synced" | "phone_only"];

	let pathWarnIcon = "";
	if (track.pathMismatch && (track.status === "synced" || track.status === "updated")) {
		pathWarnIcon = `<span class="warn-icon text-amber-500 font-bold ml-1 hover:scale-110 transition cursor-help select-none" data-track-id="${track.id}">⚠️</span>`;
	}

	return `<span class="flex items-center space-x-1.5" title="${label}">
		<span class="w-1.5 h-1.5 rounded-full bg-${track.status} inline-block shadow-sm"></span>
		${pathWarnIcon}
	</span>`;
}

// Check if a track is checked (should exist on the target comparing destination)
export function isTrackChecked(track: any): boolean {
	if (track.status === "missing" || track.status === "updated") {
		return state.checkedCopyTrackIds.has(track.id);
	}
	if (track.status === "synced" || track.status === "phone_only") {
		return !state.checkedDeleteTrackIds.has(track.id);
	}
	return false;
}

// Set track checked/unchecked state based on target presence requirements
export function setTrackCheckedState(track: any, checked: boolean) {
	if (checked) {
		if (track.status === "missing" || track.status === "updated") {
			state.checkedCopyTrackIds.add(track.id);
		}
		if (track.status === "updated" || track.status === "synced" || track.status === "phone_only") {
			state.checkedDeleteTrackIds.delete(track.id);
		}
		if (track.pathMismatch && (track.status === "synced" || track.status === "updated")) {
			state.checkedMoveTrackIds.add(track.id);
		}
	} else {
		if (track.status === "missing" || track.status === "updated") {
			state.checkedCopyTrackIds.delete(track.id);
		}
		if (track.status === "updated" || track.status === "synced" || track.status === "phone_only") {
			state.checkedDeleteTrackIds.add(track.id);
		}
		if (track.pathMismatch && (track.status === "synced" || track.status === "updated")) {
			state.checkedMoveTrackIds.delete(track.id);
		}
	}
}

// Helper to set indeterminate state for a dynamically rendered checkbox element
export function setCheckboxState(chkId: string, tracks: any[]) {
	const el = document.getElementById(chkId) as HTMLInputElement;
	if (!el) return;
	setCheckboxStateElement(el, tracks);
}

// Synchronous helper to set checkbox state using direct Element reference
export function setCheckboxStateElement(el: HTMLInputElement, tracks: any[]) {
	let checkedCount = 0;
	const total = tracks.length;

	tracks.forEach((t) => {
		if (isTrackChecked(t)) checkedCount++;
	});

	if (checkedCount === 0) {
		el.checked = false;
		el.indeterminate = false;
	} else if (checkedCount === total) {
		el.checked = true;
		el.indeterminate = false;
	} else {
		el.checked = false;
		el.indeterminate = true;
	}
}

// Generate warnings icon for parent headers (bubbles warning state up)
export function getParentWarningHtml(parentType: string, parentName: string, parentTracks: any[]): string {
	const warnCount = parentTracks.filter((t) => t.pathMismatch && (t.status === "synced" || t.status === "updated")).length;
	if (warnCount === 0) return "";
	return `<span class="warn-icon text-amber-500 font-bold ml-1.5 hover:scale-110 transition cursor-help select-none" data-parent-type="${parentType}" data-parent-name="${parentName}">⚠️</span>`;
}

// Generates a fully generalized regular expression for any delimiter,
// respecting word boundaries for alphanumeric bounds while preserving exact characters like periods.
export function getDelimiterRegex(delim: string): RegExp {
	const escapedDelim = delim.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
	const startsWithWord = /^\w/.test(delim);
	const endsWithWord = /\w$/.test(delim);

	let pattern = "";
	if (startsWithWord && endsWithWord) {
		pattern = `\\b${escapedDelim}\\b`;
	} else if (startsWithWord) {
		pattern = `\\b${escapedDelim}`;
	} else if (endsWithWord) {
		pattern = `${escapedDelim}\\b`;
	} else {
		pattern = escapedDelim;
	}

	return new RegExp(`\\s*${pattern}\\s*`, "i");
}

// Split artist name based on settings delimiters and exceptions list
export function splitAndNormalizeArtist(artist: string | null | undefined, delimiters: string[], exceptions: string[]): string[] {
	if (!artist) return ["Unknown Artist"];
	const trimmedArtist = artist.trim();
	if (!trimmedArtist) return ["Unknown Artist"];

	const isException = exceptions.some((ex) => ex.trim().toLowerCase() === trimmedArtist.toLowerCase());
	if (isException) {
		return [trimmedArtist];
	}

	let parts = [trimmedArtist];
	const activeDelim = delimiters && delimiters.length > 0 ? delimiters : DEFAULT_DELIMITERS;
	for (const delim of activeDelim) {
		const newParts: string[] = [];
		const regex = getDelimiterRegex(delim);
		for (const part of parts) {
			newParts.push(...part.split(regex));
		}
		parts = newParts;
	}

	const finalParts = parts.map((p) => p.trim()).filter((p) => p.length > 0);
	return finalParts.length > 0 ? finalParts : ["Unknown Artist"];
}

export function getAlbumArtistInfo(albumTracks: any[]): { name: string; type: "normal" | "unknown" | "various" } {
	const albumartists = new Set<string>();
	const artists = new Set<string>();

	albumTracks.forEach((t) => {
		const meta = t.itunesTrack || t.phoneTrack;
		if (meta) {
			if (meta.albumartist && meta.albumartist.trim()) {
				albumartists.add(meta.albumartist.trim());
			}
			if (meta.artist && meta.artist.trim()) {
				artists.add(meta.artist.trim());
			}
		}
	});

	if (albumartists.size > 0) {
		if (albumartists.size === 1) {
			return { name: Array.from(albumartists)[0], type: "normal" };
		} else {
			return { name: "様々なアーティスト", type: "various" };
		}
	}

	if (artists.size === 1) {
		return { name: Array.from(artists)[0], type: "normal" };
	} else if (artists.size > 1) {
		return { name: "様々なアーティスト", type: "various" };
	} else {
		return { name: "不明なアーティスト", type: "unknown" };
	}
}

export function compareSortValues(valA: any, valB: any, field: string, direction: "asc" | "desc", isGroup = false, tracksA: any[] = [], tracksB: any[] = []): number {
	const isUnset = (v: any) => v === undefined || v === null || String(v).trim() === "";

	if (field === "artist" || field === "composer") {
		const unsetA = isUnset(valA);
		const unsetB = isUnset(valB);
		if (unsetA && unsetB) return 0;
		if (unsetA) return 1;
		if (unsetB) return -1;
	}

	if (field === "albumartist") {
		const getAlbumArtistCategory = (v: any, tracks: any[]) => {
			if (isGroup && tracks.length > 0) {
				const info = getAlbumArtistInfo(tracks);
				if (info.type === "various") return { cat: 3, name: info.name };
				if (info.type === "unknown") return { cat: 2, name: info.name };
				return { cat: 1, name: info.name };
			}
			const str = String(v || "").trim();
			if (str === "様々なアーティスト" || str === "Various Artists") {
				return { cat: 3, name: str };
			}
			if (str === "不明なアーティスト" || str === "Unknown Artist" || str === "") {
				return { cat: 2, name: str };
			}
			return { cat: 1, name: str };
		};

		const catA = getAlbumArtistCategory(valA, tracksA);
		const catB = getAlbumArtistCategory(valB, tracksB);

		if (catA.cat !== catB.cat) {
			return catA.cat - catB.cat;
		}
		valA = catA.name;
		valB = catB.name;
	}

	let cmp = 0;
	if (typeof valA === "number" && typeof valB === "number") {
		cmp = valA - valB;
	} else {
		cmp = String(valA || "").localeCompare(String(valB || ""), "ja");
	}

	return direction === "asc" ? cmp : -cmp;
}

export function getGroupSortValue(field: string, tracks: any[], groupName?: string): any {
	if (field === "artist" && groupName !== undefined) return groupName;
	if (field === "album" && groupName !== undefined) return groupName;
	if (field === "genre" && groupName !== undefined) return groupName;

	if (field === "size") {
		return tracks.reduce((sum, t) => sum + ((t.itunesTrack || t.phoneTrack)?.size || 0), 0);
	}
	if (field === "duration") {
		return tracks.reduce((sum, t) => sum + ((t.itunesTrack || t.phoneTrack)?.duration || 0), 0);
	}
	if (field === "year") {
		const years = tracks.map((t: any) => parseInt((t.itunesTrack || t.phoneTrack)?.year || "0", 10) || 0).filter((y: number) => y > 0);
		return years.length > 0 ? Math.min(...years) : 0;
	}
	if (field === "track") {
		const trackNos = tracks.map((t: any) => parseInt((t.itunesTrack || t.phoneTrack)?.track?.split("/")[0] || "0", 10) || 0).filter((n: number) => n > 0);
		return trackNos.length > 0 ? Math.min(...trackNos) : 0;
	}
	if (field === "albumartist") {
		const info = getAlbumArtistInfo(tracks);
		return info.name;
	}

	const firstMeta = tracks[0]?.itunesTrack || tracks[0]?.phoneTrack;
	if (!firstMeta) return "";

	if (field === "artist") return firstMeta.artist || "";
	if (field === "album") return firstMeta.album || "";
	if (field === "genre") return firstMeta.genre || "";
	if (field === "composer") return firstMeta.composer || "";
	if (field === "relativePath") return firstMeta.relativePath || "";
	if (field === "title") return firstMeta.title || "";
	if (field === "status") return tracks[0]?.status || "";

	return "";
}

export function compareGroups(tracksA: any[], tracksB: any[], rules: { field: string; direction: "asc" | "desc"; target?: "common" | "group" | "track" }[], groupNameA?: string, groupNameB?: string): number {
	const groupRules = rules.filter((r) => !r.target || r.target === "common" || r.target === "group");

	for (const rule of groupRules) {
		const valA = getGroupSortValue(rule.field, tracksA, groupNameA);
		const valB = getGroupSortValue(rule.field, tracksB, groupNameB);

		const cmp = compareSortValues(valA, valB, rule.field, rule.direction, true, tracksA, tracksB);
		if (cmp !== 0) {
			return cmp;
		}
	}

	const metaA = tracksA[0]?.itunesTrack || tracksA[0]?.phoneTrack;
	const metaB = tracksB[0]?.itunesTrack || tracksB[0]?.phoneTrack;
	if (metaA && metaB) {
		return (metaA.relativePath || "").localeCompare(metaB.relativePath || "", "ja");
	}
	return 0;
}

// Compare two track items using multi-column sort rules
export function compareTracks(a: any, b: any, rules: { field: string; direction: "asc" | "desc"; target?: "common" | "group" | "track" }[]): number {
	const ma = a.itunesTrack || a.phoneTrack;
	const mb = b.itunesTrack || b.phoneTrack;
	if (!ma && !mb) return 0;
	if (!ma) return 1;
	if (!mb) return -1;

	const trackRules = rules.filter((r) => !r.target || r.target === "common" || r.target === "track");

	for (const rule of trackRules) {
		let valA: any = "";
		let valB: any = "";

		if (rule.field === "title") {
			valA = ma.title || "";
			valB = mb.title || "";
		} else if (rule.field === "artist") {
			valA = ma.artist || "";
			valB = mb.artist || "";
		} else if (rule.field === "album") {
			valA = ma.album || "";
			valB = mb.album || "";
		} else if (rule.field === "albumartist") {
			valA = ma.albumartist || "";
			valB = mb.albumartist || "";
		} else if (rule.field === "genre") {
			valA = ma.genre || "";
			valB = mb.genre || "";
		} else if (rule.field === "composer") {
			valA = ma.composer || "";
			valB = mb.composer || "";
		} else if (rule.field === "year") {
			valA = parseInt(ma.year || "0", 10) || 0;
			valB = parseInt(mb.year || "0", 10) || 0;
		} else if (rule.field === "track") {
			valA = parseInt(ma.track || "0", 10) || 0;
			valB = parseInt(mb.track || "0", 10) || 0;
		} else if (rule.field === "size") {
			valA = ma.size || 0;
			valB = mb.size || 0;
		} else if (rule.field === "duration") {
			valA = ma.duration || 0;
			valB = mb.duration || 0;
		} else if (rule.field === "relativePath") {
			valA = ma.relativePath || "";
			valB = mb.relativePath || "";
		} else if (rule.field === "status") {
			valA = a.status || "";
			valB = b.status || "";
		}

		const cmp = compareSortValues(valA, valB, rule.field, rule.direction, false);
		if (cmp !== 0) {
			return cmp;
		}
	}

	return (ma.relativePath || "").localeCompare(mb.relativePath || "", "ja");
}

const hwKatakanaMap: { [key: string]: string } = {
	ｦ: "ヲ",
	ｧ: "ァ",
	ｨ: "ィ",
	ｩ: "ゥ",
	ｪ: "ェ",
	ｫ: "ォ",
	ｬ: "ャ",
	ｭ: "ュ",
	ｮ: "ョ",
	ｯ: "ッ",
	ｰ: "ー",
	ｱ: "ア",
	ｲ: "イ",
	ｳ: "ウ",
	ｴ: "エ",
	ｵ: "オ",
	ｶ: "カ",
	ｷ: "キ",
	ｸ: "ク",
	ｹ: "ケ",
	ｺ: "コ",
	ｻ: "サ",
	ｼ: "シ",
	ｽ: "ス",
	ｾ: "セ",
	ｿ: "ソ",
	ﾀ: "タ",
	ﾁ: "チ",
	ﾂ: "ツ",
	ﾃ: "テ",
	ﾄ: "ト",
	ﾅ: "ナ",
	ﾆ: "ニ",
	ﾇ: "ヌ",
	ﾈ: "ネ",
	ﾉ: "ノ",
	ﾊ: "ハ",
	ﾋ: "ヒ",
	ﾌ: "フ",
	ﾍ: "ヘ",
	ﾎ: "ホ",
	ﾏ: "マ",
	ﾐ: "ミ",
	ﾑ: "ム",
	ﾒ: "メ",
	ﾓ: "モ",
	ﾔ: "ヤ",
	ﾕ: "ユ",
	ﾖ: "ヨ",
	ﾗ: "ラ",
	ﾘ: "リ",
	ﾙ: "ル",
	ﾚ: "レ",
	ﾛ: "ロ",
	ﾜ: "ワ",
	ﾝ: "ン",
};

const voicedHwMap: { [key: string]: string } = {
	ｶﾞ: "ガ",
	ｷﾞ: "ギ",
	ｸﾞ: "グ",
	ｹﾞ: "ゲ",
	ｺﾞ: "ゴ",
	ｻﾞ: "ザ",
	ｼﾞ: "ジ",
	ｽﾞ: "ズ",
	ｾﾞ: "ゼ",
	ｿﾞ: "ゾ",
	ﾀﾞ: "ダ",
	ﾁﾞ: "ヂ",
	ﾂﾞ: "ヅ",
	ﾃﾞ: "デ",
	ﾄﾞ: "ド",
	ﾊﾞ: "バ",
	ﾋﾞ: "ビ",
	ﾌﾞ: "ブ",
	ﾍﾞ: "ベ",
	ﾎﾞ: "ボ",
	ｳﾞ: "ヴ",
	ﾜﾞ: "ヷ",
	ｦﾞ: "ヺ",
};

const semiVoicedHwMap: { [key: string]: string } = {
	ﾊﾟ: "パ",
	ﾋﾟ: "ピ",
	ﾌﾟ: "プ",
	ﾍﾟ: "ペ",
	ﾎﾟ: "ポ",
};

export function normalizeArtistForIntegration(name: string): string {
	// 1. Remove all whitespace characters (half-width and full-width)
	let res = name.replace(/[\s\u3000]+/g, "");

	// 2. Convert half-width katakana (voiced/semi-voiced first, then single characters) to full-width katakana
	for (const [hw, fw] of Object.entries(voicedHwMap)) {
		res = res.replace(new RegExp(hw, "g"), fw);
	}
	for (const [hw, fw] of Object.entries(semiVoicedHwMap)) {
		res = res.replace(new RegExp(hw, "g"), fw);
	}
	res = res.replace(/[\uFF61-\uFF9F]/g, (ch) => hwKatakanaMap[ch] || ch);

	// 3. Convert full-width katakana to hiragana
	res = res.replace(/[\u30A1-\u30F6]/g, (ch) => {
		return String.fromCharCode(ch.charCodeAt(0) - 0x60);
	});

	// 4. Convert full-width alphanumeric/symbols in range FF01-FF5E to half-width ASCII
	res = res.replace(/[\uFF01-\uFF5E]/g, (ch) => {
		return String.fromCharCode(ch.charCodeAt(0) - 0xfee0);
	});

	// 5. Convert to lowercase
	return res.toLowerCase();
}

export function normalizeForSearch(name: string): string {
	// 1. Convert all whitespace characters (half-width and full-width) to single half-width spaces
	let res = name.replace(/[\s\u3000]+/g, " ");

	// 2. Convert half-width katakana to full-width katakana
	for (const [hw, fw] of Object.entries(voicedHwMap)) {
		res = res.replace(new RegExp(hw, "g"), fw);
	}
	for (const [hw, fw] of Object.entries(semiVoicedHwMap)) {
		res = res.replace(new RegExp(hw, "g"), fw);
	}
	res = res.replace(/[\uFF61-\uFF9F]/g, (ch) => hwKatakanaMap[ch] || ch);

	// 3. Convert full-width katakana to hiragana
	res = res.replace(/[\u30A1-\u30F6]/g, (ch) => {
		return String.fromCharCode(ch.charCodeAt(0) - 0x60);
	});

	// 4. Convert full-width alphanumeric/symbols in range FF01-FF5E to half-width ASCII
	res = res.replace(/[\uFF01-\uFF5E]/g, (ch) => {
		return String.fromCharCode(ch.charCodeAt(0) - 0xfee0);
	});

	// 5. Convert to lowercase
	return res.toLowerCase().trim();
}

export function getCheckboxChangesCount(): number {
	let changes = 0;
	state.scannedTracks.forEach((track) => {
		if (track.status === "missing") {
			if (state.checkedCopyTrackIds.has(track.id)) {
				changes++;
			}
		} else if (track.status === "updated") {
			if (!state.checkedCopyTrackIds.has(track.id)) {
				changes++;
			}
		} else if (track.status === "synced" || track.status === "phone_only") {
			if (state.checkedDeleteTrackIds.has(track.id)) {
				changes++;
			}
		}

		const defaultMove = !!(track.pathMismatch && (track.status === "synced" || track.status === "updated"));
		const currentMove = state.checkedMoveTrackIds.has(track.id);
		if (defaultMove !== currentMove) {
			changes++;
		}
	});
	return changes;
}

export function resetCheckboxesToDefault() {
	state.checkedCopyTrackIds.clear();
	state.checkedMoveTrackIds.clear();
	state.checkedDeleteTrackIds.clear();
	state.checkedDeleteItunesTrackIds.clear();

	for (const track of state.scannedTracks) {
		if (track.status === "updated") {
			state.checkedCopyTrackIds.add(track.id);
		}
		if (track.pathMismatch && (track.status === "synced" || track.status === "updated")) {
			state.checkedMoveTrackIds.add(track.id);
		}
	}
}

// Format bytes into GB, MB, etc.
export function formatBytes(bytes: number): string {
	if (bytes === 0) return "0 B";
	const k = 1024;
	const sizes = ["B", "KB", "MB", "GB", "TB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

// Format duration into HH:MM:SS (e.g. 1850:20:10)
export function formatDurationHHMMSS(seconds: number): string {
	if (isNaN(seconds) || seconds < 0) return "00:00:00";
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = Math.round(seconds % 60);
	return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// Format signed delta bytes (+1.23 GB, -45.6 MB, ±0 B)
export function formatDeltaBytes(bytes: number): string {
	if (bytes === 0) return "±0 B";
	const prefix = bytes > 0 ? "+" : "-";
	return prefix + formatBytes(Math.abs(bytes));
}

// Format signed delta duration (+02:15:30, -00:45:00, ±00:00:00)
export function formatDeltaDurationHHMMSS(seconds: number): string {
	if (seconds === 0) return "±00:00:00";
	const sign = seconds > 0 ? "+" : "-";
	const absSec = Math.abs(seconds);
	return sign + formatDurationHHMMSS(absSec);
}
