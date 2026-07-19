import { pushHistoryState, state } from "../state";

// Returns color styles representing track status
export function getStatusDot(track: any): string {
	const label = {
		missing: "スマホに未存在 (新規)",
		updated: "メタデータ変更あり",
		synced: "同期済",
		phone_only: "スマホ側のみに存在",
	}[track.status as "missing" | "updated" | "synced" | "phone_only"];

	let pathWarnIcon = "";
	if (track.pathMismatch && (track.status === "synced" || track.status === "updated")) {
		const pt = track.phoneTrack || track.itunesTrack;
		const it = track.itunesTrack;
		const tooltipText = `位置不一致\\n現在: ${pt.relativePath}\\niTunes: ${it.relativePath}`;
		pathWarnIcon = `<span class="text-amber-500 font-bold ml-1 hover:scale-110 transition cursor-help" title="${tooltipText}">⚠️</span>`;
	}

	return `<span class="flex items-center space-x-1.5" title="${label}">
		<span class="w-1.5 h-1.5 rounded-full bg-${track.status} inline-block shadow-sm"></span>
		${pathWarnIcon}
	</span>`;
}

// Helper to set indeterminate state for a dynamically rendered checkbox element
export function setCheckboxState(chkId: string, tracks: any[]) {
	setTimeout(() => {
		const el = document.getElementById(chkId) as HTMLInputElement;
		if (!el) return;

		let checkedCount = 0;
		let totalCopiableOrDeletable = 0;

		tracks.forEach((t) => {
			if (t.status === "missing" || t.status === "updated") {
				totalCopiableOrDeletable++;
				if (state.checkedCopyTrackIds.has(t.id)) checkedCount++;
			} else if (t.status === "phone_only") {
				totalCopiableOrDeletable++;
				if (state.checkedDeleteTrackIds.has(t.id)) checkedCount++;
			}
		});

		if (checkedCount === 0) {
			el.checked = false;
			el.indeterminate = false;
		} else if (checkedCount === totalCopiableOrDeletable) {
			el.checked = true;
			el.indeterminate = false;
		} else {
			el.checked = false;
			el.indeterminate = true;
		}
	}, 0);
}

// Track selection handlers
export function toggleCopyTrackSelection(trackId: string, isChecked: boolean, updateSummaryBar: () => void, updateMasterCheckboxState: () => void) {
	pushHistoryState();
	if (isChecked) state.checkedCopyTrackIds.add(trackId);
	else state.checkedCopyTrackIds.delete(trackId);
	updateSummaryBar();
	updateMasterCheckboxState();
}

export function toggleDeleteTrackSelection(trackId: string, isChecked: boolean, updateSummaryBar: () => void, updateMasterCheckboxState: () => void) {
	pushHistoryState();
	if (isChecked) state.checkedDeleteTrackIds.add(trackId);
	else state.checkedDeleteTrackIds.delete(trackId);
	updateSummaryBar();
	updateMasterCheckboxState();
}
