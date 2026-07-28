import { api } from "../api";
import { CONFIG, pushHistoryState, state } from "../state";
import { compareGroups, compareTracks, getParentWarningHtml, getSafeId, getStatusDot, isTrackChecked, normalizeArtistForIntegration, normalizeForSearch, setCheckboxState, setTrackCheckedState, splitAndNormalizeArtist } from "./utils";

let currentTreeViewRenderId = 0;

function applyAlbumArtBackground(elementId: string, albumName: string) {
	if (!state.currentProfileId) return;
	api.getThumbnail(state.currentProfileId, albumName).then((dataUri) => {
		if (dataUri) {
			const el = document.getElementById(elementId);
			if (el) {
				const bgOverlay = document.createElement("div");
				bgOverlay.className = "absolute inset-0 pointer-events-none bg-contain bg-top-right bg-no-repeat opacity-85 z-0";
				bgOverlay.style.backgroundImage = `linear-gradient(to right, rgba(31, 41, 55, 1) 0%, rgba(31, 41, 55, 0.9) 40%, rgba(31, 41, 55, 0.2) 85%, rgba(31, 41, 55, 0) 100%), url("${dataUri}")`;
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

export function restoreScrollPosition(container: HTMLElement, targetScrollTop: number) {
	if (!targetScrollTop) return;
	let attempts = 0;
	const attemptRestore = () => {
		container.scrollTop = targetScrollTop;
		if (container.scrollTop === targetScrollTop || attempts > 20) {
			return;
		}
		attempts++;
		requestAnimationFrame(attemptRestore);
	};
	requestAnimationFrame(attemptRestore);
}

// Synchronizes and updates all checkbox elements (tracks, discs, albums, artists, genres) in the tree view to match the state
export function updateAllTreeCheckboxes() {
	// 1. Build high-performance lookup indexes for track ID and parent groupings
	const trackMap = new Map<string, any>();
	const artistMap = new Map<string, any[]>();
	const artistAlbumMap = new Map<string, any[]>();
	const albumMap = new Map<string, any[]>();
	const genreMap = new Map<string, any[]>();
	const discMap = new Map<string, any[]>();

	state.filteredTracks.forEach((t) => {
		trackMap.set(t.id, t);

		const meta = t.itunesTrack || t.phoneTrack;
		if (!meta) return;

		// 1. Artist and Artist-Album mappings
		const artistName = meta.artist || "Unknown Artist";
		const splitNames = splitAndNormalizeArtist(artistName, state.currentSettings.delimiters || [], state.currentSettings.exceptions || []);
		splitNames.forEach((name) => {
			const normalizedArtist = normalizeArtistForIntegration(name);

			if (!artistMap.has(normalizedArtist)) artistMap.set(normalizedArtist, []);
			artistMap.get(normalizedArtist)!.push(t);

			if (meta.album) {
				const artistAlbumKey = `${normalizedArtist}_${meta.album}`;
				if (!artistAlbumMap.has(artistAlbumKey)) artistAlbumMap.set(artistAlbumKey, []);
				artistAlbumMap.get(artistAlbumKey)!.push(t);
			}
		});

		// 2. Album mapping
		if (meta.album) {
			if (!albumMap.has(meta.album)) albumMap.set(meta.album, []);
			albumMap.get(meta.album)!.push(t);
		}

		// 3. Genre mapping
		const genreName = meta.genre || "Unknown Genre";
		if (!genreMap.has(genreName)) genreMap.set(genreName, []);
		genreMap.get(genreName)!.push(t);

		// 4. Disc mapping
		if (meta.album) {
			const discNum = parseInt(meta.disc || "1", 10) || 1;
			const discKey = `${meta.album}_${discNum}`;
			if (!discMap.has(discKey)) discMap.set(discKey, []);
			discMap.get(discKey)!.push(t);
		}
	});

	// 2. Sync all track checkboxes
	const trackInputs = document.querySelectorAll(`input[id^="chk-track-"]`);
	trackInputs.forEach((el: any) => {
		const trackId = el.getAttribute("data-track-id");
		if (trackId) {
			const track = trackMap.get(trackId);
			if (track) {
				el.checked = isTrackChecked(track);
			}
		}
	});

	// 3. Sync all disc, album, genre, and artist checkboxes directly from the index Maps
	const parentInputs = document.querySelectorAll(`input[id^="chk-"]:not([id^="chk-track-"])`);
	parentInputs.forEach((el: any) => {
		const dataType = el.getAttribute("data-type");
		if (!dataType) return;

		let tracks: any[] = [];

		if (dataType === "artist") {
			const artistName = el.getAttribute("data-artist");
			if (artistName) {
				const normalizedTarget = normalizeArtistForIntegration(artistName);
				tracks = artistMap.get(normalizedTarget) || [];
			}
		} else if (dataType === "artistalbum") {
			const artistName = el.getAttribute("data-artist");
			const albumName = el.getAttribute("data-album");
			if (artistName && albumName) {
				const normalizedTarget = normalizeArtistForIntegration(artistName);
				const artistAlbumKey = `${normalizedTarget}_${albumName}`;
				tracks = artistAlbumMap.get(artistAlbumKey) || [];
			}
		} else if (dataType === "album") {
			const albumName = el.getAttribute("data-album");
			if (albumName) {
				tracks = albumMap.get(albumName) || [];
			}
		} else if (dataType === "genre") {
			const genreName = el.getAttribute("data-genre");
			if (genreName) {
				tracks = genreMap.get(genreName) || [];
			}
		} else if (dataType === "disc") {
			const albumName = el.getAttribute("data-album");
			const discVal = el.getAttribute("data-disc");
			if (albumName && discVal) {
				const discNum = parseInt(discVal, 10) || 1;
				const discKey = `${albumName}_${discNum}`;
				tracks = discMap.get(discKey) || [];
			}
		}

		if (tracks.length > 0) {
			let checkedCount = 0;
			tracks.forEach((t) => {
				if (isTrackChecked(t)) checkedCount++;
			});
			if (checkedCount === 0) {
				el.checked = false;
				el.indeterminate = false;
			} else if (checkedCount === tracks.length) {
				el.checked = true;
				el.indeterminate = false;
			} else {
				el.checked = false;
				el.indeterminate = true;
			}
		}
	});
}

export function renderEnhancedSearchView(container: HTMLElement, onNavigate: (tab: "artist" | "album" | "genre" | "track", targetName: string) => void) {
	container.innerHTML = "";

	const query = state.searchQuery.trim();
	if (!query) return;
	const normQuery = normalizeForSearch(query);

	const matchedAlbums: string[] = [];
	const matchedArtists: { splitName: string; originalArtist?: string; albumNames: string[] }[] = [];
	const matchedTracks: any[] = [];

	const albumSet = new Set<string>();

	// Track artist matches to prioritize split ones over non-split ones, and collect associated album names
	const matchedArtistsMap = new Map<string, { splitName: string; originalArtist?: string; albumNames: Set<string> }>();

	state.scannedTracks.forEach((t) => {
		const meta = t.itunesTrack || t.phoneTrack;
		if (!meta) return;
		const title = meta.title || "";
		const artist = meta.artist || "";
		const album = meta.album || "";

		const normTitle = normalizeForSearch(title);
		const normAlbum = normalizeForSearch(album);
		const normArtist = normalizeForSearch(artist);

		if (normTitle.includes(normQuery)) {
			matchedTracks.push(t);
		}
		if (normAlbum.includes(normQuery) && !albumSet.has(album)) {
			albumSet.add(album);
			matchedAlbums.push(album);
		}

		// Artist matching: search in split artists (high priority) and full artist (low priority)
		const splitNames = splitAndNormalizeArtist(artist, state.currentSettings.delimiters || [], state.currentSettings.exceptions || []);
		let matchedAnySplit = false;
		splitNames.forEach((name) => {
			const normSplit = normalizeForSearch(name);
			if (normSplit.includes(normQuery)) {
				matchedAnySplit = true;
				const key = `split:${normSplit}`;
				if (!matchedArtistsMap.has(key)) {
					matchedArtistsMap.set(key, { splitName: name, albumNames: new Set() });
				}
				if (album) {
					matchedArtistsMap.get(key)!.albumNames.add(album);
				}
			}
		});

		// Low priority overall artist name fallback if no split name matches
		if (!matchedAnySplit && normArtist.includes(normQuery)) {
			const key = `full:${normArtist}`;
			if (!matchedArtistsMap.has(key)) {
				matchedArtistsMap.set(key, { splitName: artist, originalArtist: artist, albumNames: new Set() });
			}
			if (album) {
				matchedArtistsMap.get(key)!.albumNames.add(album);
			}
		}
	});

	// Convert map to sorted arrays (split artists first, then full artists)
	const splitArtistsList: { splitName: string; originalArtist?: string; albumNames: string[] }[] = [];
	const fullArtistsList: { splitName: string; originalArtist?: string; albumNames: string[] }[] = [];

	matchedArtistsMap.forEach((val, key) => {
		const obj = {
			splitName: val.splitName,
			originalArtist: val.originalArtist,
			albumNames: Array.from(val.albumNames).sort(),
		};
		if (key.startsWith("split:")) {
			splitArtistsList.push(obj);
		} else {
			fullArtistsList.push(obj);
		}
	});

	splitArtistsList.sort((a, b) => a.splitName.localeCompare(b.splitName, "ja"));
	fullArtistsList.sort((a, b) => a.splitName.localeCompare(b.splitName, "ja"));

	const finalMatchedArtists = [...splitArtistsList, ...fullArtistsList];

	matchedAlbums.sort();
	matchedTracks.sort((a, b) => {
		const ma = a.itunesTrack || a.phoneTrack;
		const mb = b.itunesTrack || b.phoneTrack;
		return (ma?.title || "").localeCompare(mb?.title || "");
	});

	const activeCategories: { name: "album" | "artist" | "track"; headerText: string; totalCount: number; items: any[] }[] = [];
	if (matchedAlbums.length > 0) {
		activeCategories.push({ name: "album", headerText: `アルバム (${matchedAlbums.length}件)`, totalCount: matchedAlbums.length, items: matchedAlbums });
	}
	if (finalMatchedArtists.length > 0) {
		activeCategories.push({ name: "artist", headerText: `アーティスト (${finalMatchedArtists.length}件)`, totalCount: finalMatchedArtists.length, items: finalMatchedArtists });
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
			row.className = "py-1.5 flex items-center justify-between hover:bg-gray-750/30 rounded px-2 transition cursor-pointer select-none text-gray-300 gap-2";

			if (cat.name === "album") {
				row.innerHTML = `
					<div class="flex items-center space-x-2 min-w-0 flex-1">
						<div class="w-6 h-6 rounded bg-gray-900 border border-gray-700 flex items-center justify-center shrink-0 overflow-hidden relative shadow-sm">
							<img class="search-album-art w-full h-full object-cover hidden" data-album-name="${item}" src="" alt="">
							<i class="search-art-placeholder icon-music text-gray-600 text-[10px]"></i>
						</div>
						<span class="truncate font-semibold text-gray-200">${item}</span>
					</div>
					<i class="icon-chevron-right text-gray-500 text-xxs shrink-0"></i>
				`;
				row.addEventListener("click", () => onNavigate("album", item));

				// Lazy load album art
				setTimeout(() => {
					const img = row.querySelector(".search-album-art") as HTMLImageElement;
					const placeholder = row.querySelector(".search-art-placeholder") as HTMLElement;
					if (img && state.currentProfileId) {
						api.getThumbnail(state.currentProfileId, item).then((dataUri) => {
							if (dataUri) {
								img.src = dataUri;
								img.classList.remove("hidden");
								if (placeholder) placeholder.classList.add("hidden");
							}
						});
					}
				}, 10);
			} else if (cat.name === "artist") {
				let artistText = item.splitName;
				if (item.originalArtist) {
					// Low priority overall artist name fallback
					let albumTag = "";
					if (item.albumNames && item.albumNames.length > 0) {
						const safeAlbums = item.albumNames.filter((a: string) => a && a !== "Unknown Album");
						if (safeAlbums.length === 1) {
							albumTag = ` <span class="text-gray-500 font-normal text-[10px]">(${safeAlbums[0]})</span>`;
						} else if (safeAlbums.length > 1) {
							albumTag = ` <span class="text-gray-500 font-normal text-[10px]">(${safeAlbums[0]}、...)</span>`;
						}
					}
					row.innerHTML = `
						<div class="flex items-center space-x-1 min-w-0 flex-1">
							<span class="truncate font-semibold text-gray-400 italic">${artistText}</span>
							${albumTag}
						</div>
						<i class="icon-chevron-right text-gray-500 text-xxs shrink-0"></i>
					`;
				} else {
					row.innerHTML = `
						<span class="truncate font-semibold text-gray-200">${artistText}</span>
						<i class="icon-chevron-right text-gray-500 text-xxs shrink-0"></i>
					`;
				}
				row.addEventListener("click", () => onNavigate("artist", item.splitName));
			} else {
				const meta = item.itunesTrack || item.phoneTrack;
				const trackAlbum = meta?.album || "";
				row.innerHTML = `
					<div class="flex items-center space-x-2 min-w-0 flex-1">
						<div class="w-6 h-6 rounded bg-gray-900 border border-gray-700 flex items-center justify-center shrink-0 overflow-hidden relative shadow-sm">
							<img class="search-track-art w-full h-full object-cover hidden" data-album-name="${trackAlbum.replace(/"/g, "&quot;")}" src="" alt="">
							<i class="search-track-placeholder icon-music text-gray-600 text-[10px]"></i>
						</div>
						<div class="flex items-center space-x-1 truncate min-w-0 flex-1">
							<span class="text-gray-200 truncate font-semibold">${meta?.title}</span>
							<span class="text-gray-500 text-[10px] truncate">by ${meta?.artist}</span>
						</div>
					</div>
					<i class="icon-chevron-right text-gray-500 text-xxs shrink-0"></i>
				`;
				row.addEventListener("click", () => onNavigate("track", meta?.title || ""));

				// Lazy load track album art
				setTimeout(() => {
					const img = row.querySelector(".search-track-art") as HTMLImageElement;
					const placeholder = row.querySelector(".search-track-placeholder") as HTMLElement;
					if (img && trackAlbum && state.currentProfileId) {
						api.getThumbnail(state.currentProfileId, trackAlbum).then((dataUri) => {
							if (dataUri) {
								img.src = dataUri;
								img.classList.remove("hidden");
								if (placeholder) placeholder.classList.add("hidden");
							}
						});
					}
				}, 10);
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

function renderSingleTrackRow(elTracksChildren: HTMLElement, t: any, albumKey: string, cb: RenderCallbacks, discNum?: number) {
	const meta = t.itunesTrack || t.phoneTrack;
	if (!meta) return;

	const trackCheckboxId = discNum !== undefined ? `chk-track-${albumKey}-${discNum}-${t.id}` : `chk-track-${albumKey}-${t.id}`;

	const row = document.createElement("div");
	row.className = `px-3 py-1 flex items-center justify-between hover:bg-gray-900/60 gap-2 bg-${t.status} context-track track-row`;
	row.setAttribute("data-track-id", t.id);
	row.setAttribute("data-title", meta.title || "");
	row.setAttribute("data-artist", meta.artist || "");
	row.setAttribute("data-album", meta.album || "");
	row.setAttribute("data-genre", meta.genre || "");

	if (state.currentPlayingRowKey === trackCheckboxId) {
		if (state.isPlaying) {
			row.classList.add("is-playing");
		} else {
			row.classList.add("is-paused");
		}
	}

	row.innerHTML = `
		<div class="flex items-center space-x-2 flex-1 min-w-0">
			<input type="checkbox" id="${trackCheckboxId}" data-track-id="${t.id}" class="rounded bg-gray-700 border-gray-650 text-indigo-650 focus:ring-indigo-500 h-3.5 w-3.5 cursor-pointer" ${isTrackChecked(t) ? "checked" : ""}>
			<div class="track-play-btn-container w-4 h-4 flex items-center justify-center shrink-0" data-row-key="${trackCheckboxId}">
				<span class="track-number-lbl text-gray-500 font-mono text-right w-full">${meta.track ? meta.track + "." : ""}</span>
			</div>
			<label for="${trackCheckboxId}" class="flex-1 truncate cursor-pointer select-none">
				<span class="font-medium text-gray-200 truncate" title="${meta.title}">${meta.title}</span>
				${state.activeTab === "album" ? `<span class="text-gray-500 text-xxs truncate">by ${meta.artist}</span>` : ""}
				${state.activeTab === "genre" ? `<span class="text-gray-500 truncate">by ${meta.artist}</span> <span class="text-gray-500 text-xxs truncate">on ${meta.album}</span>` : ""}
			</label>
		</div>
		<div class="flex items-center pl-6">
			${getStatusDot(t)}
		</div>
	`;

	elTracksChildren.appendChild(row);

	if (typeof (window as any).updateTrackRowButtons === "function") {
		(window as any).updateTrackRowButtons(row);
	}

	const chkTrack = document.getElementById(trackCheckboxId) as HTMLInputElement;
	chkTrack.addEventListener("change", () => {
		pushHistoryState();
		setTrackCheckedState(t, chkTrack.checked);
		updateAllTreeCheckboxes();
		cb.updateSummaryBar();
		cb.updateMasterCheckboxState();
	});
}

// Lazy renders tracks inside an Album
function renderAlbumTracks(elTracksChildren: HTMLElement, albumTracks: any[], albumKey: string, cb: RenderCallbacks) {
	elTracksChildren.innerHTML = "";

	// Sort albumTracks using active sort rules
	albumTracks.sort((a, b) => compareTracks(a, b, state.sortRules));

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
			const firstTrackMeta = discTracks[0]?.itunesTrack || discTracks[0]?.phoneTrack;
			const albumName = firstTrackMeta?.album || "";

			// Add Disc Header
			const discHeader = document.createElement("div");
			discHeader.className = "px-3 py-1 bg-gray-900/40 text-[10px] text-gray-400 flex items-center space-x-2 border-b border-gray-800/60 select-none";
			discHeader.innerHTML = `
				<input type="checkbox" id="chk-disc-${albumKey}-${discNum}" class="rounded bg-gray-700 border-gray-650 text-indigo-650 focus:ring-indigo-500 h-3 w-3 cursor-pointer" data-type="disc" data-album="${albumName}" data-disc="${discNum}">
				<span class="font-semibold text-gray-400">ディスク ${discNum}</span>
			`;
			elTracksChildren.appendChild(discHeader);

			// Render tracks of this disc
			discTracks.forEach((t) => {
				renderSingleTrackRow(elTracksChildren, t, albumKey, cb, discNum);
			});

			// Setup Disc Checkbox Listener
			const chkDisc = document.getElementById(`chk-disc-${albumKey}-${discNum}`) as HTMLInputElement;
			chkDisc.addEventListener("click", (e) => {
				e.stopPropagation();
				pushHistoryState();
				const isChecked = chkDisc.checked;
				discTracks.forEach((t) => {
					setTrackCheckedState(t, isChecked);
				});
				updateAllTreeCheckboxes();
				cb.updateSummaryBar();
				cb.updateMasterCheckboxState();
			});
		});
	} else {
		// Just render normally
		albumTracks.forEach((t) => {
			renderSingleTrackRow(elTracksChildren, t, albumKey, cb);
		});
	}
}

// Lazy renders albums inside an Artist
function renderArtistAlbums(elChildren: HTMLElement, artistName: string, albumMap: Map<string, any[]>, sortedAlbums: string[], cb: RenderCallbacks) {
	elChildren.innerHTML = "";
	sortedAlbums.forEach((albumName) => {
		const albumTracks = albumMap.get(albumName)!;
		const albumKey = getSafeId("artistalbum", artistName + "_" + albumName);
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
			<div class="px-2.5 py-1.5 flex items-center justify-between hover:bg-gray-700 transition cursor-pointer select-none" id="hdr-${albumKey}" tabindex="0">
				<div class="flex items-center space-x-2 flex-1 min-w-0">
					<input type="checkbox" id="chk-${albumKey}" class="rounded bg-gray-700 border-gray-650 text-indigo-650 focus:ring-indigo-500 h-3.5 w-3.5" tabindex="0" data-type="artistalbum" data-artist="${artistName}" data-album="${albumName}">
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
			updateAllTreeCheckboxes();
			cb.updateSummaryBar();
			cb.updateMasterCheckboxState();
		});

		const elHdr = document.getElementById(`hdr-${albumKey}`)!;
		elHdr.addEventListener("keydown", (e) => {
			if (e.key === "Enter" || e.key === " ") {
				if (e.target === chkAlbum) return; // Prevent double toggling if checking the checkbox directly
				e.preventDefault();
				elHdr.click();
			}
		});

		elHdr.addEventListener("click", () => {
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
					renderAlbumTracks(elTracksChildren, albumTracks, albumKey, cb);
					updateAllTreeCheckboxes();
				}
			}
		});

		if (isAlbumOpen) {
			const elTracksChildren = document.getElementById(`children-${albumKey}`)!;
			renderAlbumTracks(elTracksChildren, albumTracks, albumKey, cb);
		}
	});
}

export function renderArtistView(container: HTMLElement, cb: RenderCallbacks) {
	container.innerHTML = "";
	container.onscroll = null;

	if (state.filteredTracks.length === 0) {
		container.innerHTML = '<p class="text-xxs text-gray-500 text-center py-6">該当する曲がありません</p>';
		return;
	}

	const artistMap = new Map<string, { displayName: string; tracks: any[] }>();
	state.filteredTracks.forEach((t) => {
		const meta = t.itunesTrack || t.phoneTrack;
		const artistName = (meta && meta.artist) || "Unknown Artist";
		const splitNames = splitAndNormalizeArtist(artistName, state.currentSettings.delimiters || [], state.currentSettings.exceptions || []);
		splitNames.forEach((name) => {
			const normalizedKey = normalizeArtistForIntegration(name);
			if (!artistMap.has(normalizedKey)) {
				artistMap.set(normalizedKey, { displayName: name, tracks: [] });
			}
			artistMap.get(normalizedKey)!.tracks.push(t);
		});
	});

	const sortedArtistKeys = Array.from(artistMap.keys()).sort((keyA, keyB) => {
		const tracksA = artistMap.get(keyA)!.tracks;
		const tracksB = artistMap.get(keyB)!.tracks;
		return compareGroups(tracksA, tracksB, state.sortRules);
	});

	const renderId = ++currentTreeViewRenderId;
	const chunkSize = 50;
	let index = 0;

	function nextChunk() {
		if (renderId !== currentTreeViewRenderId) {
			return; // Aborted
		}

		const end = Math.min(index + chunkSize, sortedArtistKeys.length);
		const fragment = document.createDocumentFragment();

		for (let i = index; i < end; i++) {
			const normalizedKey = sortedArtistKeys[i];
			const group = artistMap.get(normalizedKey)!;
			const artistName = group.displayName;
			const artistTracks = group.tracks;
			const artistKey = getSafeId("artist", normalizedKey);
			const isArtistOpen = state.expandedGroups.has(artistKey);

			const albumMap = new Map<string, any[]>();
			artistTracks.forEach((t) => {
				const meta = t.itunesTrack || t.phoneTrack;
				const albumName = (meta && meta.album) || "Unknown Album";
				if (!albumMap.has(albumName)) albumMap.set(albumName, []);
				albumMap.get(albumName)!.push(t);
			});

			const sortedAlbums = Array.from(albumMap.keys()).sort((a, b) => {
				const tracksA = albumMap.get(a)!;
				const tracksB = albumMap.get(b)!;
				return compareGroups(tracksA, tracksB, state.sortRules);
			});

			const divArtist = document.createElement("div");
			divArtist.className = "bg-gray-800 rounded overflow-hidden border border-gray-700 shadow-sm text-xxs mb-2 context-artist";
			divArtist.setAttribute("data-artist", artistName);

			divArtist.innerHTML = `
				<div class="px-3 py-1.5 flex items-center justify-between hover:bg-gray-700 transition cursor-pointer select-none" id="hdr-${artistKey}" tabindex="0">
					<div class="flex items-center space-x-2 flex-1 min-w-0">
						<input type="checkbox" id="chk-${artistKey}" class="rounded bg-gray-700 border-gray-650 text-indigo-650 focus:ring-indigo-500 h-3.5 w-3.5" tabindex="0" data-type="artist" data-artist="${artistName}">
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

			fragment.appendChild(divArtist);

			// Setup listeners inside setTimeout to ensure the DOM nodes are rendered
			setTimeout(() => {
				const chkArtist = document.getElementById(`chk-${artistKey}`) as HTMLInputElement;
				if (chkArtist) {
					setCheckboxState(`chk-${artistKey}`, artistTracks);
					chkArtist.addEventListener("click", (e) => {
						e.stopPropagation();
						pushHistoryState();
						const isChecked = chkArtist.checked;
						artistTracks.forEach((t) => {
							setTrackCheckedState(t, isChecked);
						});
						updateAllTreeCheckboxes();
						cb.updateSummaryBar();
						cb.updateMasterCheckboxState();
					});
				}

				const elHdr = document.getElementById(`hdr-${artistKey}`);
				if (elHdr) {
					elHdr.addEventListener("keydown", (e) => {
						if (e.key === "Enter" || e.key === " ") {
							if (e.target === chkArtist) return;
							e.preventDefault();
							elHdr.click();
						}
					});

					elHdr.addEventListener("click", () => {
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
							if (elChildren && elChildren.innerHTML === "") {
								renderArtistAlbums(elChildren, artistName, albumMap, sortedAlbums, cb);
								updateAllTreeCheckboxes();
							}
						}
					});
				}

				if (isArtistOpen) {
					const elChildren = document.getElementById(`children-${artistKey}`)!;
					if (elChildren) {
						renderArtistAlbums(elChildren, artistName, albumMap, sortedAlbums, cb);
					}
				}
			}, 0);
		}

		container.appendChild(fragment);
		index = end;

		if (index < sortedArtistKeys.length) {
			requestAnimationFrame(nextChunk);
		} else {
			if (state.tabScrollPositions.artist) {
				restoreScrollPosition(container, state.tabScrollPositions.artist);
			}

			container.onscroll = () => {
				state.tabScrollPositions.artist = container.scrollTop;
			};
		}
	}

	nextChunk();
}

export function renderAlbumView(container: HTMLElement, cb: RenderCallbacks) {
	container.innerHTML = "";
	container.onscroll = null;

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

	const sortedAlbums = Array.from(albumMap.keys()).sort((a, b) => {
		const tracksA = albumMap.get(a)!;
		const tracksB = albumMap.get(b)!;
		return compareGroups(tracksA, tracksB, state.sortRules);
	});

	const renderId = ++currentTreeViewRenderId;
	const chunkSize = 50;
	let index = 0;

	function nextChunk() {
		if (renderId !== currentTreeViewRenderId) {
			return; // Aborted
		}

		const end = Math.min(index + chunkSize, sortedAlbums.length);
		const fragment = document.createDocumentFragment();

		for (let i = index; i < end; i++) {
			const albumName = sortedAlbums[i];
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
				<div class="px-3 py-1.5 flex items-center justify-between hover:bg-gray-700 transition cursor-pointer select-none" id="hdr-${albumKey}" tabindex="0">
					<div class="flex items-center space-x-2 flex-1 min-w-0">
						<input type="checkbox" id="chk-${albumKey}" class="rounded bg-gray-700 border-gray-650 text-indigo-650 focus:ring-indigo-500 h-3.5 w-3.5" tabindex="0" data-type="album" data-album="${albumName}">
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

			fragment.appendChild(div);

			setTimeout(() => {
				const cardId = `album-card-${albumKey}`;
				if (document.getElementById(cardId)) {
					setCheckboxState(`chk-${albumKey}`, albumTracks);
					applyAlbumArtBackground(cardId, albumName);
				}

				const chkAlbum = document.getElementById(`chk-${albumKey}`) as HTMLInputElement;
				if (chkAlbum) {
					chkAlbum.addEventListener("click", (e) => {
						e.stopPropagation();
						pushHistoryState();
						const isChecked = chkAlbum.checked;
						albumTracks.forEach((t) => {
							setTrackCheckedState(t, isChecked);
						});
						updateAllTreeCheckboxes();
						cb.updateSummaryBar();
						cb.updateMasterCheckboxState();
					});
				}

				const elHdr = document.getElementById(`hdr-${albumKey}`);
				if (elHdr) {
					elHdr.addEventListener("keydown", (e) => {
						if (e.key === "Enter" || e.key === " ") {
							if (e.target === chkAlbum) return;
							e.preventDefault();
							elHdr.click();
						}
					});

					elHdr.addEventListener("click", () => {
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
							if (elChildren && elChildren.innerHTML === "") {
								renderAlbumTracks(elChildren, albumTracks, albumKey, cb);
								updateAllTreeCheckboxes();
							}
						}
					});
				}

				if (isAlbumOpen) {
					const elChildren = document.getElementById(`children-${albumKey}`)!;
					if (elChildren) {
						renderAlbumTracks(elChildren, albumTracks, albumKey, cb);
					}
				}
			}, 0);
		}

		container.appendChild(fragment);
		index = end;

		if (index < sortedAlbums.length) {
			requestAnimationFrame(nextChunk);
		} else {
			if (state.tabScrollPositions.album) {
				restoreScrollPosition(container, state.tabScrollPositions.album);
			}

			container.onscroll = () => {
				state.tabScrollPositions.album = container.scrollTop;
			};
		}
	}

	nextChunk();
}

export function renderGenreView(container: HTMLElement, cb: RenderCallbacks) {
	container.innerHTML = "";
	container.onscroll = null;

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

	const sortedGenres = Array.from(genreMap.keys()).sort((a, b) => {
		const tracksA = genreMap.get(a)!;
		const tracksB = genreMap.get(b)!;
		return compareGroups(tracksA, tracksB, state.sortRules);
	});

	const renderId = ++currentTreeViewRenderId;
	const chunkSize = 50;
	let index = 0;

	function nextChunk() {
		if (renderId !== currentTreeViewRenderId) {
			return; // Aborted
		}

		const end = Math.min(index + chunkSize, sortedGenres.length);
		const fragment = document.createDocumentFragment();

		for (let i = index; i < end; i++) {
			const genreName = sortedGenres[i];
			const genreTracks = genreMap.get(genreName)!;
			const genreKey = getSafeId("genre", genreName);
			const isGenreOpen = state.expandedGroups.has(genreKey);

			const div = document.createElement("div");
			div.className = "bg-gray-800 rounded overflow-hidden border border-gray-700 shadow-sm text-xxs mb-2 context-genre";
			div.setAttribute("data-genre", genreName);

			div.innerHTML = `
				<div class="px-3 py-1.5 flex items-center justify-between hover:bg-gray-700 transition cursor-pointer select-none" id="hdr-${genreKey}" tabindex="0">
					<div class="flex items-center space-x-2 flex-1 min-w-0">
						<input type="checkbox" id="chk-${genreKey}" class="rounded bg-gray-700 border-gray-650 text-indigo-650 focus:ring-indigo-500 h-3.5 w-3.5" tabindex="0" data-type="genre" data-genre="${genreName}">
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

			fragment.appendChild(div);

			setTimeout(() => {
				const chkGenre = document.getElementById(`chk-${genreKey}`) as HTMLInputElement;
				if (chkGenre) {
					setCheckboxState(`chk-${genreKey}`, genreTracks);
					chkGenre.addEventListener("click", (e) => {
						e.stopPropagation();
						pushHistoryState();
						const isChecked = chkGenre.checked;
						genreTracks.forEach((t) => {
							setTrackCheckedState(t, isChecked);
						});
						updateAllTreeCheckboxes();
						cb.updateSummaryBar();
						cb.updateMasterCheckboxState();
					});
				}

				const elHdr = document.getElementById(`hdr-${genreKey}`);
				if (elHdr) {
					elHdr.addEventListener("keydown", (e) => {
						if (e.key === "Enter" || e.key === " ") {
							if (e.target === chkGenre) return;
							e.preventDefault();
							elHdr.click();
						}
					});

					elHdr.addEventListener("click", () => {
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
							if (elChildren && elChildren.innerHTML === "") {
								renderAlbumTracks(elChildren, genreTracks, genreKey, cb);
								updateAllTreeCheckboxes();
							}
						}
					});
				}

				if (isGenreOpen) {
					const elChildren = document.getElementById(`children-${genreKey}`)!;
					if (elChildren) {
						renderAlbumTracks(elChildren, genreTracks, genreKey, cb);
					}
				}
			}, 0);
		}

		container.appendChild(fragment);
		index = end;

		if (index < sortedGenres.length) {
			requestAnimationFrame(nextChunk);
		} else {
			if (state.tabScrollPositions.genre) {
				restoreScrollPosition(container, state.tabScrollPositions.genre);
			}

			container.onscroll = () => {
				state.tabScrollPositions.genre = container.scrollTop;
			};
		}
	}

	nextChunk();
}
