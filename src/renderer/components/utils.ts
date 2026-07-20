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
	setTimeout(() => {
		const el = document.getElementById(chkId) as HTMLInputElement;
		if (!el) return;

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
	}, 0);
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

// Compare two track items using multi-column sort rules
export function compareTracks(a: any, b: any, rules: { field: string; direction: "asc" | "desc" }[]): number {
	const ma = a.itunesTrack || a.phoneTrack;
	const mb = b.itunesTrack || b.phoneTrack;
	if (!ma && !mb) return 0;
	if (!ma) return 1;
	if (!mb) return -1;

	for (const rule of rules) {
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
		} else if (rule.field === "year") {
			valA = parseInt(ma.year || "0", 10) || 0;
			valB = parseInt(mb.year || "0", 10) || 0;
		} else if (rule.field === "track") {
			valA = parseInt(ma.track || "0", 10) || 0;
			valB = parseInt(mb.track || "0", 10) || 0;
		} else if (rule.field === "status") {
			valA = a.status || "";
			valB = b.status || "";
		}

		let cmp = 0;
		if (typeof valA === "number" && typeof valB === "number") {
			cmp = valA - valB;
		} else {
			cmp = String(valA).localeCompare(String(valB), "ja");
		}

		if (cmp !== 0) {
			return rule.direction === "asc" ? cmp : -cmp;
		}
	}
	return 0;
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
