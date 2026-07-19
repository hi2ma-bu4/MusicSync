import { pushHistoryState, state } from "../state";
import { getStatusDot, setCheckboxState, toggleCopyTrackSelection, toggleDeleteTrackSelection } from "./utils";

interface RenderCallbacks {
	updateSummaryBar: () => void;
	updateMasterCheckboxState: () => void;
	renderActiveView: () => void;
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
		const artistKey = `artist_${artistName}`;
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
		divArtist.className = "bg-gray-800 rounded overflow-hidden border border-gray-750 shadow-sm text-xxs mb-2";

		divArtist.innerHTML = `
			<div class="px-3 py-1.5 flex items-center justify-between hover:bg-gray-750 transition cursor-pointer select-none" id="hdr-${artistKey}">
				<div class="flex items-center space-x-2 flex-1 min-w-0">
					<input type="checkbox" id="chk-${artistKey}" class="rounded bg-gray-700 border-gray-650 text-indigo-650 focus:ring-indigo-500 h-3.5 w-3.5">
					<div class="flex items-center space-x-1 truncate">
						<i class="lucide-user text-indigo-400 text-xxs"></i>
						<span class="font-bold text-gray-200">${artistName}</span>
						<span class="text-xxs text-gray-500">(${artistTracks.length}曲)</span>
					</div>
				</div>
				<i class="lucide-chevron-right text-gray-400 text-xxs transition-transform duration-150 ${isArtistOpen ? "transform rotate-90" : ""}"></i>
			</div>
			<div class="accordion-content ${isArtistOpen ? "open" : ""} border-t border-gray-750 bg-gray-850 p-2.5 space-y-2.5">
				<div id="children-${artistKey}"></div>
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
				if (t.status === "missing" || t.status === "updated") {
					if (isChecked) state.checkedCopyTrackIds.add(t.id);
					else state.checkedCopyTrackIds.delete(t.id);
				} else if (t.status === "phone_only") {
					if (isChecked) state.checkedDeleteTrackIds.add(t.id);
					else state.checkedDeleteTrackIds.delete(t.id);
				}
			});
			cb.renderActiveView();
		});

		document.getElementById(`hdr-${artistKey}`)!.addEventListener("click", () => {
			if (isArtistOpen) state.expandedGroups.delete(artistKey);
			else state.expandedGroups.add(artistKey);
			cb.renderActiveView();
		});

		if (isArtistOpen) {
			const elChildren = document.getElementById(`children-${artistKey}`)!;
			sortedAlbums.forEach((albumName) => {
				const albumTracks = albumMap.get(albumName)!;
				const albumKey = `artist_${artistName}_album_${albumName}`;
				const isAlbumOpen = state.expandedGroups.has(albumKey);

				const divAlbum = document.createElement("div");
				divAlbum.className = "border border-gray-700 rounded bg-gray-800 overflow-hidden mb-1.5 last:mb-0";
				divAlbum.innerHTML = `
					<div class="px-2.5 py-1.5 flex items-center justify-between hover:bg-gray-750 transition cursor-pointer select-none" id="hdr-${albumKey}">
						<div class="flex items-center space-x-2 flex-1 min-w-0">
							<input type="checkbox" id="chk-${albumKey}" class="rounded bg-gray-700 border-gray-650 text-indigo-650 focus:ring-indigo-500 h-3.5 w-3.5">
							<div class="flex items-center space-x-1.5 truncate">
								<i class="lucide-disc text-indigo-300 text-xxs"></i>
								<span class="font-semibold text-gray-300">${albumName}</span>
								<span class="text-xxs text-gray-500">(${albumTracks.length}曲)</span>
							</div>
						</div>
						<i class="lucide-chevron-right text-gray-400 text-xxs transition-transform duration-150 ${isAlbumOpen ? "transform rotate-90" : ""}"></i>
					</div>
					<div class="accordion-content ${isAlbumOpen ? "open" : ""} bg-gray-900 border-t border-gray-700 divide-y divide-gray-800">
						<div id="children-${albumKey}"></div>
					</div>
				`;

				elChildren.appendChild(divAlbum);
				setCheckboxState(`chk-${albumKey}`, albumTracks);

				const chkAlbum = document.getElementById(`chk-${albumKey}`) as HTMLInputElement;
				chkAlbum.addEventListener("click", (e) => {
					e.stopPropagation();
					pushHistoryState();
					const isChecked = chkAlbum.checked;
					albumTracks.forEach((t) => {
						if (t.status === "missing" || t.status === "updated") {
							if (isChecked) state.checkedCopyTrackIds.add(t.id);
							else state.checkedCopyTrackIds.delete(t.id);
						} else if (t.status === "phone_only") {
							if (isChecked) state.checkedDeleteTrackIds.add(t.id);
							else state.checkedDeleteTrackIds.delete(t.id);
						}
					});
					cb.renderActiveView();
				});

				document.getElementById(`hdr-${albumKey}`)!.addEventListener("click", () => {
					if (isAlbumOpen) state.expandedGroups.delete(albumKey);
					else state.expandedGroups.add(albumKey);
					cb.renderActiveView();
				});

				if (isAlbumOpen) {
					const elTracksChildren = document.getElementById(`children-${albumKey}`)!;
					albumTracks.forEach((t) => {
						const meta = t.itunesTrack || t.phoneTrack;
						if (!meta) return;
						const isCopiable = t.status === "missing" || t.status === "updated";
						const isPhoneOnly = t.status === "phone_only";

						const row = document.createElement("div");
						row.className = `px-3 py-1 flex items-center justify-between hover:bg-gray-850 gap-2 bg-${t.status}`;

						row.innerHTML = `
							<div class="flex items-center space-x-2 flex-1 min-w-0">
								<input type="checkbox" id="chk-track-${t.id}" class="rounded bg-gray-700 border-gray-650 text-indigo-650 focus:ring-indigo-500 h-3.5 w-3.5" ${isCopiable && state.checkedCopyTrackIds.has(t.id) ? "checked" : ""} ${isPhoneOnly && state.checkedDeleteTrackIds.has(t.id) ? "checked" : ""}>
								<div class="flex items-center space-x-1 truncate">
									<span class="text-gray-500 font-mono w-4 inline-block text-right">${meta.track ? meta.track + "." : ""}</span>
									<span class="font-medium text-gray-200 truncate" title="${meta.title}">${meta.title}</span>
								</div>
							</div>
							<div class="flex items-center pl-6">
								${getStatusDot(t)}
							</div>
						`;

						elTracksChildren.appendChild(row);

						const chkTrack = document.getElementById(`chk-track-${t.id}`) as HTMLInputElement;
						chkTrack.addEventListener("change", () => {
							if (isCopiable) {
								toggleCopyTrackSelection(t.id, chkTrack.checked, cb.updateSummaryBar, cb.updateMasterCheckboxState);
							} else if (isPhoneOnly) {
								toggleDeleteTrackSelection(t.id, chkTrack.checked, cb.updateSummaryBar, cb.updateMasterCheckboxState);
							}
							setCheckboxState(`chk-${albumKey}`, albumTracks);
							setCheckboxState(`chk-${artistKey}`, artistTracks);
						});
					});
				}
			});
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
		const albumKey = `album_${albumName}`;
		const isAlbumOpen = state.expandedGroups.has(albumKey);

		const div = document.createElement("div");
		div.className = "bg-gray-800 rounded overflow-hidden border border-gray-750 shadow-sm text-xxs mb-2";

		div.innerHTML = `
			<div class="px-3 py-1.5 flex items-center justify-between hover:bg-gray-750 transition cursor-pointer select-none" id="hdr-${albumKey}">
				<div class="flex items-center space-x-2 flex-1 min-w-0">
					<input type="checkbox" id="chk-${albumKey}" class="rounded bg-gray-700 border-gray-650 text-indigo-650 focus:ring-indigo-500 h-3.5 w-3.5">
					<div class="flex items-center space-x-1 truncate">
						<i class="lucide-disc text-indigo-400 text-xxs"></i>
						<span class="font-bold text-gray-200">${albumName}</span>
						<span class="text-xxs text-gray-500">(${albumTracks.length}曲)</span>
					</div>
				</div>
				<i class="lucide-chevron-right text-gray-400 text-xxs transition-transform duration-150 ${isAlbumOpen ? "transform rotate-90" : ""}"></i>
			</div>
			<div class="accordion-content ${isAlbumOpen ? "open" : ""} border-t border-gray-750 bg-gray-850 p-2.5 divide-y divide-gray-700 space-y-1">
				<div id="children-${albumKey}" class="divide-y divide-gray-800"></div>
			</div>
		`;

		container.appendChild(div);
		setCheckboxState(`chk-${albumKey}`, albumTracks);

		const chkAlbum = document.getElementById(`chk-${albumKey}`) as HTMLInputElement;
		chkAlbum.addEventListener("click", (e) => {
			e.stopPropagation();
			pushHistoryState();
			const isChecked = chkAlbum.checked;
			albumTracks.forEach((t) => {
				if (t.status === "missing" || t.status === "updated") {
					if (isChecked) state.checkedCopyTrackIds.add(t.id);
					else state.checkedCopyTrackIds.delete(t.id);
				} else if (t.status === "phone_only") {
					if (isChecked) state.checkedDeleteTrackIds.add(t.id);
					else state.checkedDeleteTrackIds.delete(t.id);
				}
			});
			cb.renderActiveView();
		});

		document.getElementById(`hdr-${albumKey}`)!.addEventListener("click", () => {
			if (isAlbumOpen) state.expandedGroups.delete(albumKey);
			else state.expandedGroups.add(albumKey);
			cb.renderActiveView();
		});

		if (isAlbumOpen) {
			const elChildren = document.getElementById(`children-${albumKey}`)!;
			albumTracks.forEach((t) => {
				const meta = t.itunesTrack || t.phoneTrack;
				if (!meta) return;
				const isCopiable = t.status === "missing" || t.status === "updated";
				const isPhoneOnly = t.status === "phone_only";

				const row = document.createElement("div");
				row.className = `px-3 py-1 flex items-center justify-between hover:bg-gray-900 gap-2 bg-${t.status}`;

				row.innerHTML = `
					<div class="flex items-center space-x-2 flex-1 min-w-0">
						<input type="checkbox" id="chk-track-${t.id}" class="rounded bg-gray-700 border-gray-650 text-indigo-650 focus:ring-indigo-500 h-3.5 w-3.5" ${isCopiable && state.checkedCopyTrackIds.has(t.id) ? "checked" : ""} ${isPhoneOnly && state.checkedDeleteTrackIds.has(t.id) ? "checked" : ""}>
						<div class="flex items-center space-x-1.5 truncate">
							<span class="text-gray-500 font-mono w-4 inline-block text-right">${meta.track ? meta.track + "." : ""}</span>
							<span class="font-medium text-gray-200 truncate" title="${meta.title}">${meta.title}</span>
							<span class="text-gray-500 text-xxs truncate">by ${meta.artist}</span>
						</div>
					</div>
					<div class="flex items-center pl-6">
						${getStatusDot(t)}
					</div>
				`;

				elChildren.appendChild(row);

				const chkTrack = document.getElementById(`chk-track-${t.id}`) as HTMLInputElement;
				chkTrack.addEventListener("change", () => {
					if (isCopiable) {
						toggleCopyTrackSelection(t.id, chkTrack.checked, cb.updateSummaryBar, cb.updateMasterCheckboxState);
					} else if (isPhoneOnly) {
						toggleDeleteTrackSelection(t.id, chkTrack.checked, cb.updateSummaryBar, cb.updateMasterCheckboxState);
					}
					setCheckboxState(`chk-${albumKey}`, albumTracks);
				});
			});
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
		const genreKey = `genre_${genreName}`;
		const isGenreOpen = state.expandedGroups.has(genreKey);

		const div = document.createElement("div");
		div.className = "bg-gray-800 rounded overflow-hidden border border-gray-750 shadow-sm text-xxs mb-2";

		div.innerHTML = `
			<div class="px-3 py-1.5 flex items-center justify-between hover:bg-gray-750 transition cursor-pointer select-none" id="hdr-${genreKey}">
				<div class="flex items-center space-x-2 flex-1 min-w-0">
					<input type="checkbox" id="chk-${genreKey}" class="rounded bg-gray-700 border-gray-650 text-indigo-650 focus:ring-indigo-500 h-3.5 w-3.5">
					<div class="flex items-center space-x-1 truncate">
						<i class="lucide-tags text-indigo-400 text-xxs"></i>
						<span class="font-bold text-gray-200">${genreName}</span>
						<span class="text-xxs text-gray-500">(${genreTracks.length}曲)</span>
					</div>
				</div>
				<i class="lucide-chevron-right text-gray-400 text-xxs transition-transform duration-150 ${isGenreOpen ? "transform rotate-90" : ""}"></i>
			</div>
			<div class="accordion-content ${isGenreOpen ? "open" : ""} border-t border-gray-750 bg-gray-850 p-2.5 divide-y divide-gray-700 space-y-1">
				<div id="children-${genreKey}" class="divide-y divide-gray-800"></div>
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
				if (t.status === "missing" || t.status === "updated") {
					if (isChecked) state.checkedCopyTrackIds.add(t.id);
					else state.checkedCopyTrackIds.delete(t.id);
				} else if (t.status === "phone_only") {
					if (isChecked) state.checkedDeleteTrackIds.add(t.id);
					else state.checkedDeleteTrackIds.delete(t.id);
				}
			});
			cb.renderActiveView();
		});

		document.getElementById(`hdr-${genreKey}`)!.addEventListener("click", () => {
			if (isGenreOpen) state.expandedGroups.delete(genreKey);
			else state.expandedGroups.add(genreKey);
			cb.renderActiveView();
		});

		if (isGenreOpen) {
			const elChildren = document.getElementById(`children-${genreKey}`)!;
			genreTracks.forEach((t) => {
				const meta = t.itunesTrack || t.phoneTrack;
				if (!meta) return;
				const isCopiable = t.status === "missing" || t.status === "updated";
				const isPhoneOnly = t.status === "phone_only";

				const row = document.createElement("div");
				row.className = `px-3 py-1 flex items-center justify-between hover:bg-gray-900 gap-2 bg-${t.status}`;

				row.innerHTML = `
					<div class="flex items-center space-x-2 flex-1 min-w-0">
						<input type="checkbox" id="chk-track-${t.id}" class="rounded bg-gray-700 border-gray-650 text-indigo-650 focus:ring-indigo-500 h-3.5 w-3.5" ${isCopiable && state.checkedCopyTrackIds.has(t.id) ? "checked" : ""} ${isPhoneOnly && state.checkedDeleteTrackIds.has(t.id) ? "checked" : ""}>
						<div class="flex items-center space-x-1.5 truncate">
							<span class="font-medium text-gray-200 truncate" title="${meta.title}">${meta.title}</span>
							<span class="text-gray-500 truncate">by ${meta.artist}</span>
							<span class="text-gray-500 text-xxs truncate">on ${meta.album}</span>
						</div>
					</div>
					<div class="flex items-center pl-6">
						${getStatusDot(t)}
					</div>
				`;

				elChildren.appendChild(row);

				const chkTrack = document.getElementById(`chk-track-${t.id}`) as HTMLInputElement;
				chkTrack.addEventListener("change", () => {
					if (isCopiable) {
						toggleCopyTrackSelection(t.id, chkTrack.checked, cb.updateSummaryBar, cb.updateMasterCheckboxState);
					} else if (isPhoneOnly) {
						toggleDeleteTrackSelection(t.id, chkTrack.checked, cb.updateSummaryBar, cb.updateMasterCheckboxState);
					}
					setCheckboxState(`chk-${genreKey}`, genreTracks);
				});
			});
		}
	});
}
