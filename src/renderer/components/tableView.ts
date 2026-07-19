import { state } from "../state";
import { getStatusDot, toggleCopyTrackSelection, toggleDeleteTrackSelection } from "./utils";

const rowHeight = 30; // 30px per row

interface RenderCallbacks {
	updateSummaryBar: () => void;
	updateMasterCheckboxState: () => void;
}

export function renderVirtualTracks(vsViewport: HTMLElement, vsCanvas: HTMLElement, vsContent: HTMLElement, cb: RenderCallbacks) {
	if (state.activeTab !== "track") return;

	if (state.filteredTracks.length === 0) {
		vsCanvas.style.height = "0px";
		vsContent.innerHTML = `
			<div class="flex items-center justify-center py-8 text-xxs text-gray-500">
				該当する曲がありません
			</div>
		`;
		return;
	}

	const totalItems = state.filteredTracks.length;
	const canvasHeight = totalItems * rowHeight;
	vsCanvas.style.height = `${canvasHeight}px`;

	const scrollTop = vsViewport.scrollTop;
	const viewportHeight = vsViewport.offsetHeight || 500;

	let startIdx = Math.floor(scrollTop / rowHeight);
	let endIdx = Math.min(startIdx + Math.ceil(viewportHeight / rowHeight) + 10, totalItems);
	startIdx = Math.max(startIdx - 5, 0);

	const offsetY = startIdx * rowHeight;
	vsContent.style.transform = `translateY(${offsetY}px)`;

	const visibleSlice = state.filteredTracks.slice(startIdx, endIdx);

	const widthTitle = document.getElementById("th-title")!.style.width || "250px";
	const widthArtist = document.getElementById("th-artist")!.style.width || "180px";
	const widthAlbum = document.getElementById("th-album")!.style.width || "180px";
	const widthTrack = document.getElementById("th-track")!.style.width || "60px";
	const widthGenre = document.getElementById("th-genre")!.style.width || "130px";

	let rowsHtml = "";

	visibleSlice.forEach((t, i) => {
		const meta = t.itunesTrack || t.phoneTrack;
		if (!meta) return;

		const isCopiable = t.status === "missing" || t.status === "updated";
		const isPhoneOnly = t.status === "phone_only";

		const rowChecked = (isCopiable && state.checkedCopyTrackIds.has(t.id)) || (isPhoneOnly && state.checkedDeleteTrackIds.has(t.id));

		rowsHtml += `
			<div class="flex items-center text-xxs border-b border-gray-800 hover:bg-gray-800 hover:bg-opacity-40 transition-colors bg-${t.status} select-none pointer-events-auto" style="height: ${rowHeight}px;">
				<div class="shrink-0 text-center flex items-center justify-center" style="width: 50px;">
					<input type="checkbox" data-id="${t.id}" class="vs-row-checkbox rounded bg-gray-700 border-gray-650 text-indigo-500 focus:ring-indigo-400 h-3.5 w-3.5" ${rowChecked ? "checked" : ""}>
				</div>
				<div class="shrink-0 px-2 truncate-cell font-medium text-gray-200" style="width: ${widthTitle}; min-width: ${widthTitle}; max-width: ${widthTitle};" title="${meta.title}">${meta.title}</div>
				<div class="shrink-0 px-2 truncate-cell text-gray-400" style="width: ${widthArtist}; min-width: ${widthArtist}; max-width: ${widthArtist};" title="${meta.artist}">${meta.artist}</div>
				<div class="shrink-0 px-2 truncate-cell text-gray-400" style="width: ${widthAlbum}; min-width: ${widthAlbum}; max-width: ${widthAlbum};" title="${meta.album}">${meta.album}</div>
				<div class="shrink-0 px-2 truncate-cell text-center font-mono text-gray-500" style="width: ${widthTrack}; min-width: ${widthTrack}; max-width: ${widthTrack};">${meta.track || ""}</div>
				<div class="shrink-0 px-2 truncate-cell text-gray-500" style="width: ${widthGenre}; min-width: ${widthGenre}; max-width: ${widthGenre};" title="${meta.genre}">${meta.genre}</div>
				<div class="flex-1 px-2 flex items-center justify-start h-full">
					${getStatusDot(t)}
				</div>
			</div>
		`;
	});

	vsContent.innerHTML = rowsHtml;

	document.querySelectorAll(".vs-row-checkbox").forEach((el: any) => {
		el.addEventListener("change", () => {
			const id = el.getAttribute("data-id");
			const track = state.filteredTracks.find((x) => x.id === id);
			if (!track) return;

			const isCopiable = track.status === "missing" || track.status === "updated";
			const isPhoneOnly = track.status === "phone_only";

			if (isCopiable) {
				toggleCopyTrackSelection(track.id, el.checked, cb.updateSummaryBar, cb.updateMasterCheckboxState);
			} else if (isPhoneOnly) {
				toggleDeleteTrackSelection(track.id, el.checked, cb.updateSummaryBar, cb.updateMasterCheckboxState);
			}
		});
	});
}
