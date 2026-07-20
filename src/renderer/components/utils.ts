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
	const activeDelim = delimiters && delimiters.length > 0 ? delimiters : [",", "|", "feat.", ";", "、", "／"];
	for (const delim of activeDelim) {
		const newParts: string[] = [];
		for (const part of parts) {
			if (delim.toLowerCase() === "feat.") {
				const regex = new RegExp(`\\s+feat\\.\\s+|\\s+feat\\s+|\\s*feat\\.\\s*|\\s*feat\\s*`, "i");
				newParts.push(...part.split(regex));
			} else {
				const escapedDelim = delim.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
				const regex = new RegExp(`\\s*${escapedDelim}\\s*`, "i");
				newParts.push(...part.split(regex));
			}
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
