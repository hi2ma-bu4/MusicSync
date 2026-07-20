import { api } from "../api";
import { CONFIG, pushHistoryState, state } from "../state";
import { getParentWarningHtml, getSafeId, getStatusDot, isTrackChecked, setCheckboxState, setTrackCheckedState } from "./utils";

function applyAlbumArtBackground(elementId: string, albumName: string) {
	if (!state.currentProfileId) return;
	api.getThumbnail(state.currentProfileId, albumName).then((dataUri) => {
		if (dataUri) {
			const el = document.getElementById(elementId);
			if (el) {
				const bgOverlay = document.createElement("div");
				bgOverlay.className = "absolute inset-0 pointer-events-none bg-cover bg-center z-0";
				bgOverlay.style.backgroundImage = `url("${dataUri}")`;
				bgOverlay.style.opacity = "0.8"; // 80% transparency
				el.prepend(bgOverlay);

				Array.from(el.children).forEach((child) => {
					if (child !== bgOverlay) {
						const htmlChild = child as HTMLElement;
						htmlChild.classList.add("relative", "z-10");
						if (htmlChild.classList.contains("accordion-content")) {
							htmlChild.style.backgroundColor = "rgba(17, 24, 39, 0.4)";
						}
					}
				});
			}
		}
	});
}

export function renderEnhancedSearchView(container: HTMLElement, onNavigate: (tab: "artist" | "album" | "genre" | "track", targetName: string) => void) {
	container.innerHTML = "";

	const query = state.searchQuery.trim().toLowerCase();
	if (!query) return;

	const matchedAlbums: string[] = [];
	const matchedArtists: string[] = [];
	const matchedTracks: any[] = [];

	const albumSet = new Set<string>();
	const artistSet = new Set<string>();

	state.scannedTracks.forEach((t) => {
		const meta = t.itunesTrack || t.phoneTrack;
		if (!meta) return;
		const title = meta.title || "";
		const artist = meta.artist || "";
		const album = meta.album || "";

		if (title.toLowerCase().includes(query)) {
			matchedTracks.push(t);
		}
		if (album.toLowerCase().includes(query) && !albumSet.has(album)) {
			albumSet.add(album);
			matchedAlbums.push(album);
		}
		if (artist.toLowerCase().includes(query) && !artistSet.has(artist)) {
			artistSet.add(artist);
			matchedArtists.push(artist);
		}
	});

	matchedAlbums.sort();
	matchedArtists.sort();
	matchedTracks.sort((a, b) => {
		const ma = a.itunesTrack || a.phoneTrack;
		const mb = b.itunesTrack || b.phoneTrack;
		return (ma?.title || "").localeCompare(mb?.title || "");
	});

	const activeCategories: { name: "album" | "artist" | "track"; headerText: string; totalCount: number; items: any[] }[] = [];
	if (matchedAlbums.length > 0) {
		activeCategories.push({ name: "album", headerText: `アルバム (${matchedAlbums.length}件)`, totalCount: matchedAlbums.length, items: matchedAlbums });
	}
	if (matchedArtists.length > 0) {
		activeCategories.push({ name: "artist", headerText: `アーティスト (${matchedArtists.length}件)`, totalCount: matchedArtists.length, items: matchedArtists });
	}
	if (matchedTracks.length > 0) {
		activeCategories.push({ name: "track", headerText: `曲 (${matchedTracks.length}件)`, totalCount: matchedTracks.length, items: matchedTracks });
	}

	if (activeCategories.length === 0) {
		container.innerHTML = '<p class="text-xxs text-gray-500 text-center py-6">該当する結果がありません</p>';
		return;
	}

	const maxRows = CONFIG.MAX_SEARCH_ROWS;
	const headerCount = activeCategories.length;
	const remainingRows = Math.max(0, maxRows - headerCount);

	const allocatedCounts = new Map<string, number>();
	activeCategories.forEach((cat) => allocatedCounts.set(cat.name, 0));

	let distributed = 0;
	let changed = true;
	while (distributed < remainingRows && changed) {
		changed = false;
		for (const cat of activeCategories) {
			if (distributed >= remainingRows) break;
			const currentAllocated = allocatedCounts.get(cat.name)!;
			if (currentAllocated < cat.totalCount) {
				allocatedCounts.set(cat.name, currentAllocated + 1);
				distributed++;
				changed = true;
			}
		}
	}

	const divSearch = document.createElement("div");
	divSearch.className = "bg-gray-800 rounded p-4 border border-gray-750 shadow-sm text-xxs space-y-4 max-w-2xl mx-auto";

	activeCategories.forEach((cat) => {
		const allocCount = allocatedCounts.get(cat.name) || 0;
		if (allocCount === 0) return;

		const section = document.createElement("div");
		section.className = "space-y-1.5";

		const header = document.createElement("div");
		header.className = "font-bold text-gray-400 border-b border-gray-700 pb-1 flex items-center space-x-1.5";
		const iconClass = cat.name === "album" ? "icon-disc text-indigo-400" : cat.name === "artist" ? "icon-user text-indigo-400" : "icon-music text-indigo-400";
		header.innerHTML = `<i class="${iconClass} text-xxs"></i><span>${cat.headerText}</span>`;
		section.appendChild(header);

		const listContainer = document.createElement("div");
		listContainer.className = "divide-y divide-gray-750/50 pl-2.5";

		const visibleItems = cat.items.slice(0, allocCount);
		visibleItems.forEach((item) => {
			const row = document.createElement("div");
			row.className = "py-1.5 flex items-center justify-between hover:bg-gray-750/30 rounded px-2 transition cursor-pointer select-none text-gray-300";

			if (cat.name === "album") {
				row.innerHTML = `
					<span class="truncate font-semibold text-gray-200">　${item}</span>
					<i class="icon-chevron-right text-gray-500 text-xxs"></i>
				`;
				row.addEventListener("click", () => onNavigate("album", item));
			} else if (cat.name === "artist") {
				row.innerHTML = `
					<span class="truncate font-semibold text-gray-200">　${item}</span>
					<i class="icon-chevron-right text-gray-500 text-xxs"></i>
				`;
				row.addEventListener("click", () => onNavigate("artist", item));
			} else {
				const meta = item.itunesTrack || item.phoneTrack;
				row.innerHTML = `
					<div class="flex items-center space-x-1 truncate">
						<span class="text-gray-200 truncate">　${meta?.title}</span>
						<span class="text-gray-500 text-[10px] truncate">by ${meta?.artist}</span>
					</div>
					<i class="icon-chevron-right text-gray-500 text-xxs"></i>
				`;
				row.addEventListener("click", () => onNavigate("track", meta?.title || ""));
			}
			listContainer.appendChild(row);
		});

		if (cat.totalCount > allocCount) {
			const diff = cat.totalCount - allocCount;
			const moreRow = document.createElement("div");
			moreRow.className = "py-1 pl-2.5 text-gray-500 italic text-[10px]";
			moreRow.textContent = `　... 他 ${diff} 件`;
			listContainer.appendChild(moreRow);
		}

		section.appendChild(listContainer);
		divSearch.appendChild(section);
	});

	container.appendChild(divSearch);
}

interface RenderCallbacks {
	updateSummaryBar: () => void;
	updateMasterCheckboxState: () => void;
	renderActiveView: () => void;
}

function renderSingleTrackRow(elTracksChildren: HTMLElement, t: any, albumKey: string, parentUpdateId: string, parentTracks: any[], albumTracks: any[], cb: RenderCallbacks, hasMultipleDiscs: boolean, discNum: number, discTracks: any[]) {
	const meta = t.itunesTrack || t.phoneTrack;
	if (!meta) return;

	const row = document.createElement("div");
	row.className = `px-3 py-1 flex items-center justify-between hover:bg-gray-900/60 gap-2 bg-${t.status} context-track`;
	row.setAttribute("data-track-id", t.id);
	row.setAttribute("data-title", meta.title || "");
	row.setAttribute("data-artist", meta.artist || "");
	row.setAttribute("data-album", meta.album || "");
	row.setAttribute("data-genre", meta.genre || "");

	row.innerHTML = `
		<label for="chk-track-${t.id}" class="flex items-center space-x-2 flex-1 min-w-0 cursor-pointer select-none">
			<input type="checkbox" id="chk-track-${t.id}" class="rounded bg-gray-700 border-gray-650 text-indigo-650 focus:ring-indigo-500 h-3.5 w-3.5" ${isTrackChecked(t) ? "checked" : ""}>
			<div class="flex items-center space-x-1 truncate">
				<span class="text-gray-500 font-mono w-4 inline-block text-right">${meta.track ? meta.track + "." : ""}</span>
				<span class="font-medium text-gray-200 truncate" title="${meta.title}">${meta.title}</span>
				${state.activeTab === "album" ? `<span class="text-gray-500 text-xxs truncate">by ${meta.artist}</span>` : ""}
				${state.activeTab === "genre" ? `<span class="text-gray-500 truncate">by ${meta.artist}</span> <span class="text-gray-500 text-xxs truncate">on ${meta.album}</span>` : ""}
			</div>
		</label>
		<div class="flex items-center pl-6">
			${getStatusDot(t)}
		</div>
	`;

	elTracksChildren.appendChild(row);

	const chkTrack = document.getElementById(`chk-track-${t.id}`) as HTMLInputElement;
	chkTrack.addEventListener("change", () => {
		pushHistoryState();
		setTrackCheckedState(t, chkTrack.checked);
		cb.updateSummaryBar();
		cb.updateMasterCheckboxState();

		if (hasMultipleDiscs) {
			setCheckboxState(`chk-disc-${albumKey}-${discNum}`, discTracks);
		}

		setCheckboxState(`chk-${albumKey}`, albumTracks);
		if (parentUpdateId) {
			setCheckboxState(`chk-${parentUpdateId}`, parentTracks);
		}
	});
}

// Lazy renders tracks inside an Album
function renderAlbumTracks(elTracksChildren: HTMLElement, albumTracks: any[], albumKey: string, parentUpdateId: string, parentTracks: any[], cb: RenderCallbacks) {
	elTracksChildren.innerHTML = "";

	// Sort albumTracks by disc, then track
	albumTracks.sort((a, b) => {
		const ma = a.itunesTrack || a.phoneTrack;
		const mb = b.itunesTrack || b.phoneTrack;
		const discA = parseInt(ma?.disc || "1", 10) || 1;
		const discB = parseInt(mb?.disc || "1", 10) || 1;
		if (discA !== discB) {
			return discA - discB;
		}
		const trkA = parseInt(ma?.track || "0", 10) || 0;
		const trkB = parseInt(mb?.track || "0", 10) || 0;
		return trkA - trkB;
	});

	// Find the maximum disc number to determine if we should group
	const maxDisc = albumTracks.reduce((max, t) => {
		const meta = t.itunesTrack || t.phoneTrack;
		const discNum = parseInt(meta?.disc || "1", 10) || 1;
		return Math.max(max, discNum);
	}, 1);

	const hasMultipleDiscs = maxDisc >= 2;

	if (hasMultipleDiscs) {
		// Group tracks by disc
		const discGroups = new Map<number, any[]>();
		albumTracks.forEach((t) => {
			const meta = t.itunesTrack || t.phoneTrack;
			const discNum = parseInt(meta?.disc || "1", 10) || 1;
			if (!discGroups.has(discNum)) {
				discGroups.set(discNum, []);
			}
			discGroups.get(discNum)!.push(t);
		});

		// Render groups
		const sortedDiscs = Array.from(discGroups.keys()).sort((a, b) => a - b);
		sortedDiscs.forEach((discNum) => {
			const discTracks = discGroups.get(discNum)!;

			// Add Disc Header
			const discHeader = document.createElement("div");
			discHeader.className = "px-3 py-1 bg-gray-900/40 text-[10px] text-gray-400 flex items-center space-x-2 border-b border-gray-800/60 select-none";
			discHeader.innerHTML = `
				<input type="checkbox" id="chk-disc-${albumKey}-${discNum}" class="rounded bg-gray-700 border-gray-650 text-indigo-650 focus:ring-indigo-500 h-3 w-3 cursor-pointer">
				<span class="font-semibold text-gray-400">ディスク ${discNum}</span>
			`;
			elTracksChildren.appendChild(discHeader);

			// Render tracks of this disc
			discTracks.forEach((t) => {
				renderSingleTrackRow(elTracksChildren, t, albumKey, parentUpdateId, parentTracks, albumTracks, cb, hasMultipleDiscs, discNum, discTracks);
			});

			// Setup Disc Checkbox Listener
			const chkDisc = document.getElementById(`chk-disc-${albumKey}-${discNum}`) as HTMLInputElement;
			chkDisc.addEventListener("click", (e) => {
				e.stopPropagation();
				pushHistoryState();
				const isChecked = chkDisc.checked;
				discTracks.forEach((t) => {
					setTrackCheckedState(t, isChecked);
					const chkTrack = document.getElementById(`chk-track-${t.id}`) as HTMLInputElement;
					if (chkTrack) chkTrack.checked = isChecked;
				});

				setCheckboxState(`chk-${albumKey}`, albumTracks);
				if (parentUpdateId) {
					setCheckboxState(`chk-${parentUpdateId}`, parentTracks);
				}
				cb.updateSummaryBar();
				cb.updateMasterCheckboxState();
			});

			// Set initial state
			setCheckboxState(`chk-disc-${albumKey}-${discNum}`, discTracks);
		});
	} else {
		// Just render normally
		albumTracks.forEach((t) => {
			renderSingleTrackRow(elTracksChildren, t, albumKey, parentUpdateId, parentTracks, albumTracks, cb, false, 1, []);
		});
	}
}

// Lazy renders albums inside an Artist
function renderArtistAlbums(elChildren: HTMLElement, artistName: string, albumMap: Map<string, any[]>, sortedAlbums: string[], cb: RenderCallbacks, artistKey: string, artistTracks: any[]) {
	elChildren.innerHTML = "";
	sortedAlbums.forEach((albumName) => {
		const albumTracks = albumMap.get(albumName)!;
		const albumKey = getSafeId("artist_" + artistName + "_album", albumName);
		const isAlbumOpen = state.expandedGroups.has(albumKey);

		const firstMeta = albumTracks[0]?.itunesTrack || albumTracks[0]?.phoneTrack;
		const firstArtist = firstMeta?.artist || "";
		const firstGenre = firstMeta?.genre || "";

		const divAlbum = document.createElement("div");
		divAlbum.id = `album-card-${albumKey}`;
		divAlbum.className = "relative border border-gray-700 rounded bg-gray-800 overflow-hidden mb-1.5 last:mb-0 context-album";
		divAlbum.setAttribute("data-album", albumName);
		divAlbum.setAttribute("data-artist", firstArtist);
		divAlbum.setAttribute("data-genre", firstGenre);

		divAlbum.innerHTML = `
			<div class="px-2.5 py-1.5 flex items-center justify-between hover:bg-gray-700 transition cursor-pointer select-none" id="hdr-${albumKey}">
				<div class="flex items-center space-x-2 flex-1 min-w-0">
					<input type="checkbox" id="chk-${albumKey}" class="rounded bg-gray-700 border-gray-650 text-indigo-650 focus:ring-indigo-500 h-3.5 w-3.5">
					<div class="flex items-center space-x-1.5 truncate">
						<i class="icon-disc text-indigo-300 text-xxs"></i>
						<span class="font-semibold text-gray-300">${albumName}</span>
						<span class="text-xxs text-gray-500">(${albumTracks.length}曲)</span>
						${getParentWarningHtml("album", albumName, albumTracks)}
					</div>
				</div>
				<i class="icon-chevron-right text-gray-400 text-xxs transition-transform duration-150 ${isAlbumOpen ? "transform rotate-90" : ""}"></i>
			</div>
			<div class="accordion-content ${isAlbumOpen ? "open" : ""}">
				<div id="children-${albumKey}" class="bg-gray-900 border-t border-gray-700 divide-y divide-gray-800"></div>
			</div>
		`;

		elChildren.appendChild(divAlbum);
		setCheckboxState(`chk-${albumKey}`, albumTracks);
		applyAlbumArtBackground(`album-card-${albumKey}`, albumName);

		const chkAlbum = document.getElementById(`chk-${albumKey}`) as HTMLInputElement;
		chkAlbum.addEventListener("click", (e) => {
			e.stopPropagation();
			pushHistoryState();
			const isChecked = chkAlbum.checked;
			albumTracks.forEach((t) => {
				setTrackCheckedState(t, isChecked);
			});

			// Directly update DOM elements without full re-render
			albumTracks.forEach((t) => {
				const chkTrack = document.getElementById(`chk-track-${t.id}`) as HTMLInputElement;
				if (chkTrack) chkTrack.checked = isChecked;
			});
			setCheckboxState(`chk-${artistKey}`, artistTracks);

			cb.updateSummaryBar();
			cb.updateMasterCheckboxState();
		});

		document.getElementById(`hdr-${albumKey}`)!.addEventListener("click", () => {
			const isOpenNow = state.expandedGroups.has(albumKey);
			const newOpenState = !isOpenNow;
			if (newOpenState) state.expandedGroups.add(albumKey);
			else state.expandedGroups.delete(albumKey);

			const chevron = document.querySelector(`#hdr-${albumKey} .icon-chevron-right`);
			const content = document.querySelector(`#hdr-${albumKey} + .accordion-content`);
			if (chevron) chevron.classList.toggle("rotate-90", newOpenState);
			if (content) content.classList.toggle("open", newOpenState);

			if (newOpenState) {
				const elTracksChildren = document.getElementById(`children-${albumKey}`)!;
				if (elTracksChildren.innerHTML === "") {
					renderAlbumTracks(elTracksChildren, albumTracks, albumKey, artistKey, artistTracks, cb);
				}
			}
		});

		if (isAlbumOpen) {
			const elTracksChildren = document.getElementById(`children-${albumKey}`)!;
			renderAlbumTracks(elTracksChildren, albumTracks, albumKey, artistKey, artistTracks, cb);
		}
	});
}

export function renderArtistView(container: HTMLElement, cb: RenderCallbacks) {
	container.innerHTML = "";
	if (state.filteredTracks.length === 0) {
		container.innerHTML = '<p class="text-xxs text-gray-500 text-center py-6">該当する曲がありません</p>';
		return;
	}

	const artistMap = new Map<string, any[]>();
	state.filteredTracks.forEach((t) => {
		const meta = t.itunesTrack || t.phoneTrack;
		const artistName = (meta && meta.artist) || "Unknown Artist";
		if (!artistMap.has(artistName)) artistMap.set(artistName, []);
		artistMap.get(artistName)!.push(t);
	});

	const sortedArtists = Array.from(artistMap.keys()).sort();

	sortedArtists.forEach((artistName) => {
		const artistTracks = artistMap.get(artistName)!;
		const artistKey = getSafeId("artist", artistName);
		const isArtistOpen = state.expandedGroups.has(artistKey);

		const albumMap = new Map<string, any[]>();
		artistTracks.forEach((t) => {
			const meta = t.itunesTrack || t.phoneTrack;
			const albumName = (meta && meta.album) || "Unknown Album";
			if (!albumMap.has(albumName)) albumMap.set(albumName, []);
			albumMap.get(albumName)!.push(t);
		});

		const sortedAlbums = Array.from(albumMap.keys()).sort();

		const divArtist = document.createElement("div");
		divArtist.className = "bg-gray-800 rounded overflow-hidden border border-gray-700 shadow-sm text-xxs mb-2";

		divArtist.innerHTML = `
			<div class="px-3 py-1.5 flex items-center justify-between hover:bg-gray-700 transition cursor-pointer select-none" id="hdr-${artistKey}">
				<div class="flex items-center space-x-2 flex-1 min-w-0">
					<input type="checkbox" id="chk-${artistKey}" class="rounded bg-gray-700 border-gray-650 text-indigo-650 focus:ring-indigo-500 h-3.5 w-3.5">
					<div class="flex items-center space-x-1 truncate">
						<i class="icon-user text-indigo-400 text-xxs"></i>
						<span class="font-bold text-gray-200">${artistName}</span>
						<span class="text-xxs text-gray-500">(${artistTracks.length}曲)</span>
						${getParentWarningHtml("artist", artistName, artistTracks)}
					</div>
				</div>
				<i class="icon-chevron-right text-gray-400 text-xxs transition-transform duration-150 ${isArtistOpen ? "transform rotate-90" : ""}"></i>
			</div>
			<div class="accordion-content ${isArtistOpen ? "open" : ""}">
				<div id="children-${artistKey}" class="border-t border-gray-700 bg-gray-900/40 p-2.5 space-y-2.5"></div>
			</div>
		`;

		container.appendChild(divArtist);
		setCheckboxState(`chk-${artistKey}`, artistTracks);

		const chkArtist = document.getElementById(`chk-${artistKey}`) as HTMLInputElement;
		chkArtist.addEventListener("click", (e) => {
			e.stopPropagation();
			pushHistoryState();
			const isChecked = chkArtist.checked;
			artistTracks.forEach((t) => {
				setTrackCheckedState(t, isChecked);
			});

			// Directly update DOM checkboxes of Artist tree
			sortedAlbums.forEach((albumName) => {
				const albumKey = getSafeId("artist_" + artistName + "_album", albumName);
				const chkAlbum = document.getElementById(`chk-${albumKey}`) as HTMLInputElement;
				if (chkAlbum) {
					chkAlbum.checked = isChecked;
					chkAlbum.indeterminate = false;
				}
				const albumTracks = albumMap.get(albumName)!;
				albumTracks.forEach((t) => {
					const chkTrack = document.getElementById(`chk-track-${t.id}`) as HTMLInputElement;
					if (chkTrack) chkTrack.checked = isChecked;
				});
			});

			cb.updateSummaryBar();
			cb.updateMasterCheckboxState();
		});

		document.getElementById(`hdr-${artistKey}`)!.addEventListener("click", () => {
			const isOpenNow = state.expandedGroups.has(artistKey);
			const newOpenState = !isOpenNow;
			if (newOpenState) state.expandedGroups.add(artistKey);
			else state.expandedGroups.delete(artistKey);

			const chevron = document.querySelector(`#hdr-${artistKey} .icon-chevron-right`);
			const content = document.querySelector(`#hdr-${artistKey} + .accordion-content`);
			if (chevron) chevron.classList.toggle("rotate-90", newOpenState);
			if (content) content.classList.toggle("open", newOpenState);

			if (newOpenState) {
				const elChildren = document.getElementById(`children-${artistKey}`)!;
				if (elChildren.innerHTML === "") {
					renderArtistAlbums(elChildren, artistName, albumMap, sortedAlbums, cb, artistKey, artistTracks);
				}
			}
		});

		if (isArtistOpen) {
			const elChildren = document.getElementById(`children-${artistKey}`)!;
			renderArtistAlbums(elChildren, artistName, albumMap, sortedAlbums, cb, artistKey, artistTracks);
		}
	});
}

export function renderAlbumView(container: HTMLElement, cb: RenderCallbacks) {
	container.innerHTML = "";
	if (state.filteredTracks.length === 0) {
		container.innerHTML = '<p class="text-xxs text-gray-500 text-center py-6">該当するアルバムがありません</p>';
		return;
	}

	const albumMap = new Map<string, any[]>();
	state.filteredTracks.forEach((t) => {
		const meta = t.itunesTrack || t.phoneTrack;
		const albumName = (meta && meta.album) || "Unknown Album";
		if (!albumMap.has(albumName)) albumMap.set(albumName, []);
		albumMap.get(albumName)!.push(t);
	});

	const sortedAlbums = Array.from(albumMap.keys()).sort();

	sortedAlbums.forEach((albumName) => {
		const albumTracks = albumMap.get(albumName)!;
		const albumKey = getSafeId("album", albumName);
		const isAlbumOpen = state.expandedGroups.has(albumKey);

		const firstMeta = albumTracks[0]?.itunesTrack || albumTracks[0]?.phoneTrack;
		const firstArtist = firstMeta?.artist || "";
		const firstGenre = firstMeta?.genre || "";

		const div = document.createElement("div");
		div.id = `album-card-${albumKey}`;
		div.className = "relative bg-gray-800 rounded overflow-hidden border border-gray-700 shadow-sm text-xxs mb-2 context-album";
		div.setAttribute("data-album", albumName);
		div.setAttribute("data-artist", firstArtist);
		div.setAttribute("data-genre", firstGenre);

		div.innerHTML = `
			<div class="px-3 py-1.5 flex items-center justify-between hover:bg-gray-700 transition cursor-pointer select-none" id="hdr-${albumKey}">
				<div class="flex items-center space-x-2 flex-1 min-w-0">
					<input type="checkbox" id="chk-${albumKey}" class="rounded bg-gray-700 border-gray-650 text-indigo-650 focus:ring-indigo-500 h-3.5 w-3.5">
					<div class="flex items-center space-x-1 truncate">
						<i class="icon-disc text-indigo-400 text-xxs"></i>
						<span class="font-bold text-gray-200">${albumName}</span>
						<span class="text-xxs text-gray-500">(${albumTracks.length}曲)</span>
						${getParentWarningHtml("album", albumName, albumTracks)}
					</div>
				</div>
				<i class="icon-chevron-right text-gray-400 text-xxs transition-transform duration-150 ${isAlbumOpen ? "transform rotate-90" : ""}"></i>
			</div>
			<div class="accordion-content ${isAlbumOpen ? "open" : ""}">
				<div id="children-${albumKey}" class="border-t border-gray-700 bg-gray-900/40 p-2.5 divide-y divide-gray-800"></div>
			</div>
		`;

		container.appendChild(div);
		setCheckboxState(`chk-${albumKey}`, albumTracks);
		applyAlbumArtBackground(`album-card-${albumKey}`, albumName);

		const chkAlbum = document.getElementById(`chk-${albumKey}`) as HTMLInputElement;
		chkAlbum.addEventListener("click", (e) => {
			e.stopPropagation();
			pushHistoryState();
			const isChecked = chkAlbum.checked;
			albumTracks.forEach((t) => {
				setTrackCheckedState(t, isChecked);
			});

			albumTracks.forEach((t) => {
				const chkTrack = document.getElementById(`chk-track-${t.id}`) as HTMLInputElement;
				if (chkTrack) chkTrack.checked = isChecked;
			});

			cb.updateSummaryBar();
			cb.updateMasterCheckboxState();
		});

		document.getElementById(`hdr-${albumKey}`)!.addEventListener("click", () => {
			const isOpenNow = state.expandedGroups.has(albumKey);
			const newOpenState = !isOpenNow;
			if (newOpenState) state.expandedGroups.add(albumKey);
			else state.expandedGroups.delete(albumKey);

			const chevron = document.querySelector(`#hdr-${albumKey} .icon-chevron-right`);
			const content = document.querySelector(`#hdr-${albumKey} + .accordion-content`);
			if (chevron) chevron.classList.toggle("rotate-90", newOpenState);
			if (content) content.classList.toggle("open", newOpenState);

			if (newOpenState) {
				const elChildren = document.getElementById(`children-${albumKey}`)!;
				if (elChildren.innerHTML === "") {
					renderAlbumTracks(elChildren, albumTracks, albumKey, "", [], cb);
				}
			}
		});

		if (isAlbumOpen) {
			const elChildren = document.getElementById(`children-${albumKey}`)!;
			renderAlbumTracks(elChildren, albumTracks, albumKey, "", [], cb);
		}
	});
}

export function renderGenreView(container: HTMLElement, cb: RenderCallbacks) {
	container.innerHTML = "";
	if (state.filteredTracks.length === 0) {
		container.innerHTML = '<p class="text-xxs text-gray-500 text-center py-6">該当するジャンルがありません</p>';
		return;
	}

	const genreMap = new Map<string, any[]>();
	state.filteredTracks.forEach((t) => {
		const meta = t.itunesTrack || t.phoneTrack;
		const genreName = (meta && meta.genre) || "Unknown Genre";
		if (!genreMap.has(genreName)) genreMap.set(genreName, []);
		genreMap.get(genreName)!.push(t);
	});

	const sortedGenres = Array.from(genreMap.keys()).sort();

	sortedGenres.forEach((genreName) => {
		const genreTracks = genreMap.get(genreName)!;
		const genreKey = getSafeId("genre", genreName);
		const isGenreOpen = state.expandedGroups.has(genreKey);

		const div = document.createElement("div");
		div.className = "bg-gray-800 rounded overflow-hidden border border-gray-700 shadow-sm text-xxs mb-2";

		div.innerHTML = `
			<div class="px-3 py-1.5 flex items-center justify-between hover:bg-gray-700 transition cursor-pointer select-none" id="hdr-${genreKey}">
				<div class="flex items-center space-x-2 flex-1 min-w-0">
					<input type="checkbox" id="chk-${genreKey}" class="rounded bg-gray-700 border-gray-650 text-indigo-650 focus:ring-indigo-500 h-3.5 w-3.5">
					<div class="flex items-center space-x-1 truncate">
						<i class="icon-tags text-indigo-400 text-xxs"></i>
						<span class="font-bold text-gray-200">${genreName}</span>
						<span class="text-xxs text-gray-500">(${genreTracks.length}曲)</span>
						${getParentWarningHtml("genre", genreName, genreTracks)}
					</div>
				</div>
				<i class="icon-chevron-right text-gray-400 text-xxs transition-transform duration-150 ${isGenreOpen ? "transform rotate-90" : ""}"></i>
			</div>
			<div class="accordion-content ${isGenreOpen ? "open" : ""}">
				<div id="children-${genreKey}" class="border-t border-gray-700 bg-gray-900/40 p-2.5 divide-y divide-gray-800"></div>
			</div>
		`;

		container.appendChild(div);
		setCheckboxState(`chk-${genreKey}`, genreTracks);

		const chkGenre = document.getElementById(`chk-${genreKey}`) as HTMLInputElement;
		chkGenre.addEventListener("click", (e) => {
			e.stopPropagation();
			pushHistoryState();
			const isChecked = chkGenre.checked;
			genreTracks.forEach((t) => {
				setTrackCheckedState(t, isChecked);
			});

			genreTracks.forEach((t) => {
				const chkTrack = document.getElementById(`chk-track-${t.id}`) as HTMLInputElement;
				if (chkTrack) chkTrack.checked = isChecked;
			});

			cb.updateSummaryBar();
			cb.updateMasterCheckboxState();
		});

		document.getElementById(`hdr-${genreKey}`)!.addEventListener("click", () => {
			const isOpenNow = state.expandedGroups.has(genreKey);
			const newOpenState = !isOpenNow;
			if (newOpenState) state.expandedGroups.add(genreKey);
			else state.expandedGroups.delete(genreKey);

			const chevron = document.querySelector(`#hdr-${genreKey} .icon-chevron-right`);
			const content = document.querySelector(`#hdr-${genreKey} + .accordion-content`);
			if (chevron) chevron.classList.toggle("rotate-90", newOpenState);
			if (content) content.classList.toggle("open", newOpenState);

			if (newOpenState) {
				const elChildren = document.getElementById(`children-${genreKey}`)!;
				if (elChildren.innerHTML === "") {
					renderAlbumTracks(elChildren, genreTracks, genreKey, "", [], cb);
				}
			}
		});

		if (isGenreOpen) {
			const elChildren = document.getElementById(`children-${genreKey}`)!;
			renderAlbumTracks(elChildren, genreTracks, genreKey, "", [], cb);
		}
	});
}
