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
	} else {
		if (track.status === "missing" || track.status === "updated") {
			state.checkedCopyTrackIds.delete(track.id);
		}
		if (track.status === "updated" || track.status === "synced" || track.status === "phone_only") {
			state.checkedDeleteTrackIds.add(track.id);
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
