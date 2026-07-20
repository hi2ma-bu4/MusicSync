import "lucide-static/font/lucide.css";
import "./style.css";

import { api, isMock } from "./renderer/api";
import { initModals, updateDynamicColors } from "./renderer/components/modals";
import { renderVirtualTracks } from "./renderer/components/tableView";
import { renderAlbumView, renderArtistView, renderGenreView, updateAllTreeCheckboxes } from "./renderer/components/treeView";
import { compareTracks, getSafeId, isTrackChecked, setTrackCheckedState, splitAndNormalizeArtist } from "./renderer/components/utils";
import { clearHistory, CONFIG, handleRedo, handleUndo, pushHistoryState, state } from "./renderer/state";

// DOM Elements
const elBtnProfileDropdown = document.getElementById("btn-profile-dropdown")!;
const elProfileDropdownMenu = document.getElementById("profile-dropdown-menu")!;
const elProfileDropdownList = document.getElementById("profile-dropdown-list")!;
const elLblActiveProfile = document.getElementById("lbl-active-profile")!;

const elBtnDropdownNewProfile = document.getElementById("btn-dropdown-new-profile")!;
const elBtnDropdownEditProfile = document.getElementById("btn-dropdown-edit-profile")!;
const elBtnDropdownDeleteProfile = document.getElementById("btn-dropdown-delete-profile")!;
const elBtnDropdownSettings = document.getElementById("btn-dropdown-settings")!;

const elHeaderPathsBadge = document.getElementById("header-paths-badge")!;
const elHeaderItunesPath = document.getElementById("header-itunes-path")!;
const elHeaderPhonePath = document.getElementById("header-phone-path")!;

const elNoProfileSelectedView = document.getElementById("no-profile-selected-view")!;
const elActiveWorkspace = document.getElementById("active-workspace")!;
const elPromptToScanView = document.getElementById("prompt-to-scan-view")!;

const elTxtSearch = document.getElementById("txt-search") as HTMLInputElement;
const elSearchCombobox = document.getElementById("search-combobox")!;
const elBtnScan = document.getElementById("btn-scan") as HTMLButtonElement;
const elBtnSyncExec = document.getElementById("btn-sync-exec") as HTMLButtonElement;

// Tab selectors (Desktop & Mobile)
const elBtnTabsDropdown = document.getElementById("btn-tabs-dropdown")!;
const elTabsDropdownMenu = document.getElementById("tabs-dropdown-menu")!;
const elLblActiveTab = document.getElementById("lbl-active-tab")!;

const elTabArtist = document.getElementById("tab-artist")!;
const elTabAlbum = document.getElementById("tab-album")!;
const elTabGenre = document.getElementById("tab-genre")!;
const elTabTrack = document.getElementById("tab-track")!;

// Container panels
const elTreeContainer = document.getElementById("tree-container")!;
const elTrackContainer = document.getElementById("track-container")!;
const elChkMaster = document.getElementById("chk-master") as HTMLInputElement;

let modalsController: any = null;

// Summary stats footer
const elCntTotal = document.getElementById("cnt-total")!;
const elCntMissing = document.getElementById("cnt-missing")!;
const elCntUpdated = document.getElementById("cnt-updated")!;
const elCntSynced = document.getElementById("cnt-synced")!;
const elCntPhoneOnly = document.getElementById("cnt-phone_only")!;
const elCntPathWarnings = document.getElementById("cnt-path-warnings")!;
const elCntCheckedCopy = document.getElementById("cnt-checked-copy")!;
const elCntCheckedDelete = document.getElementById("cnt-checked-delete")!;

// Modals
const elModalProfile = document.getElementById("modal-profile")!;
const elTxtProfileId = document.getElementById("txt-profile-id") as HTMLInputElement;
const elTxtProfileName = document.getElementById("txt-profile-name") as HTMLInputElement;
const elTxtProfileItunes = document.getElementById("txt-profile-itunes") as HTMLInputElement;
const elTxtProfilePhone = document.getElementById("txt-profile-phone") as HTMLInputElement;
const elProfileModalTitle = document.getElementById("profile-modal-title")!;

const elModalSettings = document.getElementById("modal-settings")!;
const elColorMissing = document.getElementById("color-missing") as HTMLInputElement;
const elColorUpdated = document.getElementById("color-updated") as HTMLInputElement;
const elColorSynced = document.getElementById("color-synced") as HTMLInputElement;
const elColorPhoneOnly = document.getElementById("color-phone_only") as HTMLInputElement;

// Reorganization Modal
const elModalMoveConfirm = document.getElementById("modal-move-confirm")!;
const elLblMoveCount = document.getElementById("lbl-move-count")!;
const elChkModalMoveMaster = document.getElementById("chk-modal-move-master") as HTMLInputElement;
const elMoveTargetList = document.getElementById("move-target-list")!;

// Progress Modal
const elModalProgress = document.getElementById("modal-progress")!;
const elProgressModalTitle = document.getElementById("progress-modal-title")!;
const elLblProgressStatus = document.getElementById("lbl-progress-status")!;
const elLblProgressPct = document.getElementById("lbl-progress-pct")!;
const elProgressBarFill = document.getElementById("progress-bar-fill")!;
const elProgressLogs = document.getElementById("progress-logs")!;
const elBtnProgressClose = document.getElementById("btn-progress-close") as HTMLButtonElement;

const vsViewport = document.getElementById("virtual-scroll-viewport")!;
const vsCanvas = document.getElementById("virtual-scroll-canvas")!;
const vsContent = document.getElementById("virtual-scroll-content")!;

async function init() {
	state.currentSettings = await api.getSettings();
	if (!state.currentSettings.delimiters) state.currentSettings.delimiters = [",", "|", "feat.", ";", "、", "／"];
	if (!state.currentSettings.exceptions) state.currentSettings.exceptions = [];
	updateDynamicColors(state.currentSettings);

	state.profiles = await api.getProfiles();
	renderProfileDropdown();

	api.onContextMenuCommand((command, arg) => {
		navigateToSuggestion(command === "jump-artist" ? "artist" : command === "jump-album" ? "album" : "genre", arg);
	});

	modalsController = initModals({
		renderProfileDropdown,
		selectProfile,
		renderActiveView,
		updateSummaryBar,
		startSyncExecution,
	});

	setupFilterButton("stat-btn-total", "total");
	setupFilterButton("stat-btn-missing", "missing");
	setupFilterButton("stat-btn-updated", "updated");
	setupFilterButton("stat-btn-synced", "synced");
	setupFilterButton("stat-btn-phone_only", "phone_only");
	setupFilterButton("stat-btn-path_warning", "path_warning");
	updateFilterUI();
	renderSortRules();

	setupEventListeners();
	setupColumnResize();
}

function renderProfileDropdown() {
	elProfileDropdownList.innerHTML = "";
	if (state.profiles.length === 0) {
		elProfileDropdownList.innerHTML = '<p class="text-xxs text-gray-500 text-center p-3">プロファイルがありません</p>';
		return;
	}

	state.profiles.forEach((p) => {
		const btn = document.createElement("button");
		btn.className = `w-full text-left px-3 py-2 hover:bg-gray-700 transition flex items-center justify-between ${p.id === state.currentProfileId ? "bg-indigo-900 bg-opacity-40 text-indigo-300 font-bold" : "text-gray-300"}`;
		btn.innerHTML = `
			<span class="truncate flex-1">${p.name}</span>
			${p.id === state.currentProfileId ? '<i class="icon-check text-xs text-indigo-400"></i>' : ""}
		`;

		btn.addEventListener("click", () => selectProfile(p.id));
		elProfileDropdownList.appendChild(btn);
	});
}

function selectProfile(id: string) {
	state.currentProfileId = id;
	const p = state.profiles.find((x) => x.id === id);
	if (!p) return;

	renderProfileDropdown();

	elLblActiveProfile.textContent = p.name;
	elBtnDropdownEditProfile.classList.remove("hidden");
	elBtnDropdownDeleteProfile.classList.remove("hidden");

	elHeaderItunesPath.textContent = p.itunesPath;
	elHeaderPhonePath.textContent = p.phonePath;
	elHeaderPathsBadge.classList.remove("hidden");

	elNoProfileSelectedView.classList.add("hidden");
	elActiveWorkspace.classList.remove("hidden");
	elPromptToScanView.classList.remove("hidden");
	elBtnScan.disabled = false;

	state.scannedTracks = [];
	state.filteredTracks = [];
	elTxtSearch.value = "";
	state.searchQuery = "";

	switchTab("artist");
}

function switchTab(tabId: "artist" | "album" | "genre" | "track") {
	state.activeTab = tabId;
	elLblActiveTab.textContent = {
		artist: "アーティスト",
		album: "アルバム",
		genre: "ジャンル",
		track: "個別曲",
	}[tabId];

	const tabBtns = [
		{ id: "artist", el: elTabArtist },
		{ id: "album", el: elTabAlbum },
		{ id: "genre", el: elTabGenre },
		{ id: "track", el: elTabTrack },
	];

	tabBtns.forEach((t) => {
		if (t.id === tabId) {
			t.el.classList.add("border-indigo-500", "text-indigo-400", "font-semibold");
			t.el.classList.remove("border-transparent", "text-gray-400");
		} else {
			t.el.classList.remove("border-indigo-500", "text-indigo-400", "font-semibold");
			t.el.classList.add("border-transparent", "text-gray-400");
		}
	});

	if (state.activeTab === "track") {
		elTreeContainer.classList.add("hidden");
		elTrackContainer.classList.remove("hidden");
	} else {
		elTreeContainer.classList.remove("hidden");
		elTrackContainer.classList.add("hidden");
	}

	renderActiveView();
	updateMasterCheckboxState();
}

function renderSearchCombobox() {
	const query = state.searchQuery.trim().toLowerCase();
	if (!query) {
		elSearchCombobox.classList.add("hidden");
		elSearchCombobox.innerHTML = "";
		return;
	}

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
		elSearchCombobox.innerHTML = '<p class="text-xxs text-gray-500 text-center py-2">該当なし</p>';
		elSearchCombobox.classList.remove("hidden");
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

	elSearchCombobox.innerHTML = "";
	elSearchCombobox.classList.remove("hidden");

	activeCategories.forEach((cat) => {
		const allocCount = allocatedCounts.get(cat.name) || 0;
		if (allocCount === 0) return;

		const section = document.createElement("div");
		section.className = "px-3 py-1";

		// Header
		const header = document.createElement("div");
		header.className = "font-bold text-gray-400 border-b border-gray-700 pb-0.5 mb-1 flex items-center space-x-1.5";
		const iconClass = cat.name === "album" ? "icon-disc text-indigo-400" : cat.name === "artist" ? "icon-user text-indigo-400" : "icon-music text-indigo-400";
		header.innerHTML = `<i class="${iconClass}"></i><span>${cat.headerText}</span>`;
		section.appendChild(header);

		// Items list
		const listContainer = document.createElement("div");
		listContainer.className = "divide-y divide-gray-750/30";

		const visibleItems = cat.items.slice(0, allocCount);
		visibleItems.forEach((item) => {
			const row = document.createElement("div");
			row.className = "py-1 flex items-center justify-between hover:bg-gray-700/50 rounded px-1.5 transition cursor-pointer select-none text-gray-300 truncate";

			if (cat.name === "album") {
				row.innerHTML = `<span class="truncate">　${item}</span>`;
				row.addEventListener("click", (e) => {
					e.stopPropagation();
					navigateToSuggestion("album", item);
				});
			} else if (cat.name === "artist") {
				row.innerHTML = `<span class="truncate">　${item}</span>`;
				row.addEventListener("click", (e) => {
					e.stopPropagation();
					navigateToSuggestion("artist", item);
				});
			} else {
				const meta = item.itunesTrack || item.phoneTrack;
				row.innerHTML = `
					<div class="flex items-center space-x-1 truncate font-sans">
						<span class="text-gray-200 truncate">　${meta?.title}</span>
						<span class="text-gray-500 text-[10px] truncate">by ${meta?.artist}</span>
					</div>
				`;
				row.addEventListener("click", (e) => {
					e.stopPropagation();
					navigateToSuggestion("track", meta?.title || "");
				});
			}
			listContainer.appendChild(row);
		});

		if (cat.totalCount > allocCount) {
			const diff = cat.totalCount - allocCount;
			const moreRow = document.createElement("div");
			moreRow.className = "py-0.5 text-gray-500 italic text-[10px] pl-2.5";
			moreRow.textContent = `　...他 ${diff} 件`;
			listContainer.appendChild(moreRow);
		}

		section.appendChild(listContainer);
		elSearchCombobox.appendChild(section);
	});
}

function navigateToSuggestion(tabId: "artist" | "album" | "genre" | "track", targetName: string) {
	// 1. Preserve search input and query, just hide combobox
	elSearchCombobox.classList.add("hidden");

	if (state.searchQuery) {
		addSearchHistory(state.searchQuery);
	}

	// 2. Switch tab and auto-expand target group
	if (tabId === "artist") {
		const artistKey = getSafeId("artist", targetName);
		state.expandedGroups.add(artistKey);
		switchTab("artist");
		// 3. Scroll to target element
		setTimeout(() => {
			const el = document.getElementById(`hdr-${artistKey}`);
			if (el) {
				el.scrollIntoView({ behavior: "smooth", block: "center" });
			}
		}, 100);
	} else if (tabId === "album") {
		const albumKey = getSafeId("album", targetName);
		state.expandedGroups.add(albumKey);
		switchTab("album");
		// 3. Scroll to target element
		setTimeout(() => {
			const el = document.getElementById(`hdr-${albumKey}`);
			if (el) {
				el.scrollIntoView({ behavior: "smooth", block: "center" });
			}
		}, 100);
	} else if (tabId === "genre") {
		const genreKey = getSafeId("genre", targetName);
		state.expandedGroups.add(genreKey);
		switchTab("genre");
		// 3. Scroll to target element
		setTimeout(() => {
			const el = document.getElementById(`hdr-${genreKey}`);
			if (el) {
				el.scrollIntoView({ behavior: "smooth", block: "center" });
			}
		}, 100);
	} else if (tabId === "track") {
		switchTab("track");
		// 3. Scroll to target item index in the virtual scroll viewport
		setTimeout(() => {
			const idx = state.filteredTracks.findIndex((t) => (t.itunesTrack || t.phoneTrack)?.title === targetName);
			if (idx !== -1) {
				vsViewport.scrollTop = idx * 30; // Row height is 30px
			}
		}, 100);
	}
}
(window as any).navigateToSuggestion = navigateToSuggestion;

function renderActiveView() {
	updateStatsSummary();
	updateSummaryBar();

	const callbacks = {
		updateSummaryBar,
		updateMasterCheckboxState,
		renderActiveView,
	};

	if (state.activeTab === "track") {
		elTreeContainer.classList.add("hidden");
		elTrackContainer.classList.remove("hidden");
	} else {
		elTreeContainer.classList.remove("hidden");
		elTrackContainer.classList.add("hidden");
	}

	if (state.activeTab === "artist") renderArtistView(elTreeContainer, callbacks);
	else if (state.activeTab === "album") renderAlbumView(elTreeContainer, callbacks);
	else if (state.activeTab === "genre") renderGenreView(elTreeContainer, callbacks);
	else if (state.activeTab === "track") renderVirtualTracks(vsViewport, vsCanvas, vsContent, callbacks);

	updateAllTreeCheckboxes();
}

function updateStatsSummary() {
	let total = 0;
	let missing = 0;
	let updated = 0;
	let synced = 0;
	let phoneOnly = 0;
	let pathWarnings = 0;

	state.scannedTracks.forEach((t) => {
		if (t.status === "phone_only") {
			phoneOnly++;
		} else {
			total++;
			if (t.status === "missing") missing++;
			else if (t.status === "updated") updated++;
			else if (t.status === "synced") synced++;
		}
		if (t.pathMismatch) {
			pathWarnings++;
		}
	});

	elCntTotal.textContent = String(total);
	elCntMissing.textContent = String(missing);
	elCntUpdated.textContent = String(updated);
	elCntSynced.textContent = String(synced);
	elCntPhoneOnly.textContent = String(phoneOnly);

	const elStatBtnPathWarning = document.getElementById("stat-btn-path_warning");
	if (pathWarnings > 0) {
		elCntPathWarnings.textContent = String(pathWarnings);
		if (elStatBtnPathWarning) {
			elStatBtnPathWarning.classList.remove("hidden");
			elStatBtnPathWarning.classList.add("flex");
		}
	} else {
		if (elStatBtnPathWarning) {
			elStatBtnPathWarning.classList.add("hidden");
			elStatBtnPathWarning.classList.remove("flex");
		}
	}
}

function updateSummaryBar() {
	elCntCheckedCopy.textContent = String(state.checkedCopyTrackIds.size);
	elCntCheckedDelete.textContent = String(state.checkedDeleteTrackIds.size);

	const hasCheckedWarning = state.scannedTracks.some((t) => {
		const hasWarn = (t.pathMismatch && (t.status === "synced" || t.status === "updated")) || t.status === "updated";
		return hasWarn && isTrackChecked(t);
	});

	const totalChecks = state.checkedCopyTrackIds.size + state.checkedMoveTrackIds.size + state.checkedDeleteTrackIds.size;
	elBtnSyncExec.disabled = totalChecks === 0 && !hasCheckedWarning;
}

function updateMasterCheckboxState() {
	if (state.filteredTracks.length === 0) {
		elChkMaster.checked = false;
		elChkMaster.indeterminate = false;
		elChkMaster.disabled = true;
		return;
	}
	elChkMaster.disabled = false;

	let checkedCount = 0;
	let totalTracks = state.filteredTracks.length;

	for (const track of state.filteredTracks) {
		if (isTrackChecked(track)) checkedCount++;
	}

	if (checkedCount === 0) {
		elChkMaster.checked = false;
		elChkMaster.indeterminate = false;
	} else if (checkedCount === totalTracks) {
		elChkMaster.checked = true;
		elChkMaster.indeterminate = false;
	} else {
		elChkMaster.checked = false;
		elChkMaster.indeterminate = true;
	}
}

function applyFilterAndRender() {
	let tracks = state.scannedTracks;

	// 1. Filter by search query
	if (state.searchQuery !== "") {
		const q = state.searchQuery.toLowerCase();
		tracks = tracks.filter((t) => {
			const meta = t.itunesTrack || t.phoneTrack;
			if (!meta) return false;
			return (meta.title || "").toLowerCase().includes(q) || (meta.artist || "").toLowerCase().includes(q) || (meta.album || "").toLowerCase().includes(q);
		});
	}

	// 2. Filter by bottom status filters
	tracks = tracks.filter((t) => {
		if (!state.activeStatusFilters.has(t.status)) {
			return false;
		}
		if (t.pathMismatch && !state.activeStatusFilters.has("path_warning")) {
			return false;
		}
		return true;
	});

	state.filteredTracks = tracks.sort((a, b) => compareTracks(a, b, state.sortRules));
	renderActiveView();
	updateMasterCheckboxState();
}

function setupEventListeners() {
	const btnSortToggle = document.getElementById("btn-sort-toggle")!;
	const sortDropdownPanel = document.getElementById("sort-dropdown-panel")!;
	const btnSortAddRule = document.getElementById("btn-sort-add-rule")!;
	const btnSortClear = document.getElementById("btn-sort-clear")!;

	btnSortToggle.addEventListener("click", (e) => {
		e.stopPropagation();
		sortDropdownPanel.classList.toggle("hidden");
		sortDropdownPanel.classList.toggle("flex");
	});

	// Close when clicking outside
	document.addEventListener("click", (e) => {
		if (sortDropdownPanel && !sortDropdownPanel.contains(e.target as Node) && e.target !== btnSortToggle) {
			sortDropdownPanel.classList.add("hidden");
			sortDropdownPanel.classList.remove("flex");
		}
	});

	btnSortAddRule.addEventListener("click", (e) => {
		e.stopPropagation();
		state.sortRules.push({ field: "title", direction: "asc" });
		renderSortRules();
		applyFilterAndRender();
	});

	btnSortClear.addEventListener("click", (e) => {
		e.stopPropagation();
		state.sortRules = [];
		renderSortRules();
		applyFilterAndRender();
	});

	elBtnProfileDropdown.addEventListener("click", (e) => {
		e.stopPropagation();
		elProfileDropdownMenu.classList.toggle("hidden");
	});

	document.addEventListener("click", () => {
		elProfileDropdownMenu.classList.add("hidden");
		elTabsDropdownMenu.classList.add("hidden");
		elSearchCombobox.classList.add("hidden");
	});

	elBtnDropdownNewProfile.addEventListener("click", () => {
		elProfileModalTitle.textContent = "同期プロファイルの作成";
		elTxtProfileId.value = "";
		elTxtProfileName.value = "";
		elTxtProfileItunes.value = "";
		elTxtProfilePhone.value = "";
		elModalProfile.classList.remove("hidden");
	});

	elBtnDropdownEditProfile.addEventListener("click", () => {
		const p = state.profiles.find((x) => x.id === state.currentProfileId);
		if (!p) return;
		elProfileModalTitle.textContent = "同期プロファイルの編集";
		elTxtProfileId.value = p.id;
		elTxtProfileName.value = p.name;
		elTxtProfileItunes.value = p.itunesPath;
		elTxtProfilePhone.value = p.phonePath;
		elModalProfile.classList.remove("hidden");
	});

	elBtnDropdownDeleteProfile.addEventListener("click", async () => {
		const p = state.profiles.find((x) => x.id === state.currentProfileId);
		if (!p) return;
		if (confirm(`プロファイル「${p.name}」を削除してもよろしいですか？`)) {
			state.profiles = await api.deleteProfile(p.id);
			state.currentProfileId = null;
			state.scannedTracks = [];
			state.filteredTracks = [];
			elNoProfileSelectedView.classList.remove("hidden");
			elActiveWorkspace.classList.add("hidden");
			elHeaderPathsBadge.classList.add("hidden");
			elLblActiveProfile.textContent = "プロファイルを選択...";
			elBtnDropdownEditProfile.classList.add("hidden");
			elBtnDropdownDeleteProfile.classList.add("hidden");
			elBtnScan.disabled = true;
			renderProfileDropdown();
		}
	});

	elBtnDropdownSettings.addEventListener("click", () => {
		elColorMissing.value = state.currentSettings.colorMissing || "#22c55e";
		elColorUpdated.value = state.currentSettings.colorUpdated || "#f59e0b";
		elColorSynced.value = state.currentSettings.colorSynced || "#94a3b8";
		elColorPhoneOnly.value = state.currentSettings.colorPhoneOnly || "#ef4444";

		if (modalsController) {
			modalsController.loadSettings(state.currentSettings.delimiters || [], state.currentSettings.exceptions || []);
		}

		elModalSettings.classList.remove("hidden");
	});

	elBtnScan.addEventListener("click", async () => {
		if (!state.currentProfileId) return;

		elProgressModalTitle.textContent = "ライブラリを解析中...";
		elLblProgressStatus.textContent = "比較処理を開始しています...";
		elLblProgressPct.textContent = "0%";
		elProgressBarFill.style.width = "0%";
		elProgressLogs.innerHTML = "";
		elBtnProgressClose.disabled = true;
		elModalProgress.classList.remove("hidden");

		const cancelProgress = api.onScanProgress((progress: any) => {
			elLblProgressStatus.textContent = progress.message || "処理中...";
			elLblProgressPct.textContent = `${progress.progress}%`;
			elProgressBarFill.style.width = `${progress.progress}%`;

			const logItem = document.createElement("div");
			logItem.className = "text-gray-400";
			logItem.textContent = `[${progress.step}] ${progress.message}`;
			elProgressLogs.appendChild(logItem);
			elProgressLogs.scrollTop = elProgressLogs.scrollHeight;
		});

		try {
			await api.startScan(state.currentProfileId);

			// ==========================================
			// 【デバッグ・開発環境用フォールバック / DEBUG FALLBACK】
			// ==========================================
			if (isMock) {
				await new Promise((resolve) => setTimeout(resolve, 1100));
			}

			cancelProgress();
			elModalProgress.classList.add("hidden");

			state.scannedTracks = await api.getScanResult(state.currentProfileId);

			elPromptToScanView.classList.add("hidden");

			state.checkedCopyTrackIds.clear();
			state.checkedMoveTrackIds.clear();
			state.checkedDeleteTrackIds.clear();
			state.expandedGroups.clear();
			clearHistory();

			// Default check specs:
			// Existing tracks (synced, updated, phone_only) checked by default.
			// Non-existing tracks (missing) unchecked by default.
			// Relocate / pathMismatch (move) checkboxes unchecked by default.
			for (const track of state.scannedTracks) {
				if (track.status === "updated") {
					state.checkedCopyTrackIds.add(track.id);
				}
				// Note: synced and phone_only do not require checkedCopyTrackIds since they already exist,
				// they are checked by default because checkedDeleteTrackIds does not contain them.
				if (track.pathMismatch && (track.status === "synced" || track.status === "updated")) {
					state.checkedMoveTrackIds.add(track.id);
				}
			}

			applyFilterAndRender();
		} catch (e: any) {
			console.error("Error during scan:", e);
			cancelProgress();
			alert("スキャン中にエラーが発生しました: " + e.message);
			elModalProgress.classList.add("hidden");
		}
	});

	elBtnSyncExec.addEventListener("click", () => {
		if (!state.currentProfileId) return;

		const copyCount = state.checkedCopyTrackIds.size;
		const moveCount = state.checkedMoveTrackIds.size;
		const deleteItunesCount = state.scannedTracks.filter((t) => (t.status === "synced" || t.status === "updated") && state.checkedDeleteTrackIds.has(t.id)).length;
		const deletePhoneOnlyCount = state.scannedTracks.filter((t) => t.status === "phone_only" && state.checkedDeleteTrackIds.has(t.id)).length;

		document.getElementById("lbl-confirm-copy-count")!.textContent = `${copyCount} 件`;
		document.getElementById("lbl-confirm-move-count")!.textContent = `${moveCount} 件`;
		document.getElementById("lbl-confirm-delete-itunes-count")!.textContent = `${deleteItunesCount} 件`;
		document.getElementById("lbl-confirm-delete-count")!.textContent = `${deletePhoneOnlyCount} 件`;

		const pathsMismatchedSelected = state.scannedTracks.filter((t) => (t.status === "missing" || t.status === "updated" || t.status === "synced") && t.pathMismatch && (state.checkedCopyTrackIds.has(t.id) || state.checkedMoveTrackIds.has(t.id)));

		const subsequentModals: string[] = [];
		if (pathsMismatchedSelected.length > 0) {
			subsequentModals.push("ファイル配置の自動移動確認");
		}
		if (deleteItunesCount > 0) {
			subsequentModals.push("比較先ファイル削除（iTunesに存在する曲）のチェックリスト確認");
		}
		if (deletePhoneOnlyCount > 0) {
			subsequentModals.push("比較先ファイル削除（比較先側のみ存在）の厳重確認（安全ロック入力付）");
		}

		let helperText = "";
		if (subsequentModals.length > 0) {
			helperText = `※この後、${subsequentModals.join("、および")}ダイアログが順に表示されます。`;
		} else {
			helperText = "※この後、直接同期処理を実行します。";
		}
		document.getElementById("lbl-confirm-next-info")!.textContent = helperText;

		document.getElementById("modal-sync-confirm-count")!.classList.remove("hidden");
	});

	elBtnProgressClose.addEventListener("click", () => {
		elModalProgress.classList.add("hidden");
		elBtnScan.click();
	});

	let searchDebounceTimeout: any = null;

	const showPredictionsIfQuery = () => {
		const query = elTxtSearch.value.trim().toLowerCase();
		if (query.length >= 1) {
			state.searchQuery = query;
			renderSearchCombobox();
		} else {
			renderSearchHistory();
		}
	};

	elTxtSearch.addEventListener("input", () => {
		const query = elTxtSearch.value.trim().toLowerCase();
		state.searchQuery = query;

		// Show search/loading indicator immediately in prediction box if at least 1 character is entered
		if (query.length >= 1) {
			elSearchCombobox.innerHTML = `
				<div class="flex items-center justify-center space-x-2 py-4 text-gray-400 font-medium">
					<i class="icon-refresh-cw animate-spin text-indigo-400"></i>
					<span>検索中...</span>
				</div>
			`;
			elSearchCombobox.classList.remove("hidden");
		} else {
			renderSearchHistory();
		}

		if (searchDebounceTimeout) {
			clearTimeout(searchDebounceTimeout);
		}

		searchDebounceTimeout = setTimeout(() => {
			applyFilterAndRender();
			if (state.searchQuery.length >= 1) {
				renderSearchCombobox();
				addSearchHistory(state.searchQuery);
			}
		}, 250); // 250ms debouncing delay
	});

	elTxtSearch.addEventListener("click", (e) => {
		e.stopPropagation();
		showPredictionsIfQuery();
	});

	elTxtSearch.addEventListener("focus", (e) => {
		e.stopPropagation();
		showPredictionsIfQuery();
	});

	elChkMaster.addEventListener("change", () => {
		pushHistoryState();
		const isChecked = elChkMaster.checked;
		for (const track of state.filteredTracks) {
			setTrackCheckedState(track, isChecked);
		}
		renderActiveView();
	});

	const tabBtns = [
		{ id: "artist", el: elTabArtist },
		{ id: "album", el: elTabAlbum },
		{ id: "genre", el: elTabGenre },
		{ id: "track", el: elTabTrack },
	];

	tabBtns.forEach((tab) => {
		tab.el.addEventListener("click", () => {
			switchTab(tab.id as any);
		});
	});

	elBtnTabsDropdown.addEventListener("click", (e) => {
		e.stopPropagation();
		elTabsDropdownMenu.classList.toggle("hidden");
	});

	document.querySelectorAll(".tab-opt").forEach((el) => {
		el.addEventListener("click", () => {
			const targetTab = el.getAttribute("data-tab") as any;
			switchTab(targetTab);
		});
	});

	vsViewport.addEventListener("scroll", () => {
		if (state.activeTab === "track") {
			renderVirtualTracks(vsViewport, vsCanvas, vsContent, {
				updateSummaryBar,
				updateMasterCheckboxState,
			});
		}
	});

	window.addEventListener("keydown", (e) => {
		const activeEl = document.activeElement;
		if (activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA")) {
			return;
		}

		if (e.ctrlKey) {
			if (e.key.toLowerCase() === "z") {
				e.preventDefault();
				handleUndo(renderActiveView);
			} else if (e.key.toLowerCase() === "y") {
				e.preventDefault();
				handleRedo(renderActiveView);
			}
		}
	});

	// Custom Warning Popover logic (delegated)
	let closeTimeout: any = null;
	const popoverEl = (() => {
		let el = document.getElementById("custom-warning-popover");
		if (!el) {
			el = document.createElement("div");
			el.id = "custom-warning-popover";
			el.className = "absolute hidden bg-gray-950 border border-gray-750 text-gray-200 text-xxs p-3 rounded shadow-2xl z-50 max-w-sm pointer-events-auto select-text font-sans leading-relaxed whitespace-pre-line";
			document.body.appendChild(el);

			el.addEventListener("mouseenter", () => {
				if (closeTimeout) clearTimeout(closeTimeout);
			});
			el.addEventListener("mouseleave", () => {
				startCloseTimer();
			});
		}
		return el;
	})();

	const startCloseTimer = () => {
		if (closeTimeout) clearTimeout(closeTimeout);
		closeTimeout = setTimeout(() => {
			popoverEl.classList.add("hidden");
		}, 500);
	};

	const cancelCloseTimer = () => {
		if (closeTimeout) clearTimeout(closeTimeout);
	};

	const getWarningTracksForParent = (type: string, name: string): any[] => {
		return state.scannedTracks.filter((t) => {
			if (!t.pathMismatch || !(t.status === "synced" || t.status === "updated")) return false;
			const meta = t.itunesTrack || t.phoneTrack;
			if (!meta) return false;
			if (type === "artist") return meta.artist === name;
			if (type === "album") return meta.album === name;
			if (type === "genre") return meta.genre === name;
			return false;
		});
	};

	document.addEventListener("mouseover", (e) => {
		const warnTrigger = (e.target as HTMLElement).closest(".warn-icon");
		if (warnTrigger) {
			cancelCloseTimer();
			const trackId = warnTrigger.getAttribute("data-track-id");
			const parentType = warnTrigger.getAttribute("data-parent-type");
			const parentName = warnTrigger.getAttribute("data-parent-name");

			let content = "";
			if (trackId) {
				const track = state.scannedTracks.find((t) => t.id === trackId);
				if (track) {
					const pt = track.phoneTrack || track.itunesTrack;
					const it = track.itunesTrack!;
					content = `⚠️ 【位置不一致の警告】\n曲名: ${it.title}\nアーティスト: ${it.artist}\n\n[現在(比較先)の保存パス]:\n${pt?.relativePath || ""}\n\n[iTunesの保存パス]:\n${it.relativePath}`;
				}
			} else if (parentType && parentName) {
				const warnTracks = getWarningTracksForParent(parentType, parentName);
				content = `⚠️ 【グループ警告件数: ${warnTracks.length}件】\n`;
				warnTracks.slice(0, 10).forEach((t, i) => {
					const it = t.itunesTrack || t.phoneTrack;
					content += `\n${i + 1}. ${it.artist} - ${it.title}\n   (配置不一致)`;
				});
				if (warnTracks.length > 10) {
					content += `\n...他 ${warnTracks.length - 10} 件`;
				}
			}

			if (content) {
				popoverEl.innerHTML = content.replace(/\n/g, "<br>");
				popoverEl.classList.remove("hidden");

				const rect = warnTrigger.getBoundingClientRect();
				const top = rect.bottom + window.scrollY + 5;
				const left = Math.max(10, Math.min(window.innerWidth - 350, rect.left + window.scrollX));
				popoverEl.style.top = `${top}px`;
				popoverEl.style.left = `${left}px`;
			}
		}
	});

	document.addEventListener("mouseout", (e) => {
		const warnTrigger = (e.target as HTMLElement).closest(".warn-icon");
		if (warnTrigger) {
			startCloseTimer();
		}
	});

	document.addEventListener("click", (e) => {
		const warnTrigger = (e.target as HTMLElement).closest(".warn-icon");
		if (warnTrigger) {
			cancelCloseTimer();
			const isHidden = popoverEl.classList.contains("hidden");
			if (isHidden) {
				const mouseOverEvent = new MouseEvent("mouseover", { bubbles: true });
				warnTrigger.dispatchEvent(mouseOverEvent);
			} else {
				popoverEl.classList.add("hidden");
			}
		} else {
			const isClickInsidePopover = (e.target as HTMLElement).closest("#custom-warning-popover");
			if (!isClickInsidePopover) {
				popoverEl.classList.add("hidden");
			}
		}
	});

	// Custom Context Menu logic (delegated to Electron Native Menu)
	document.addEventListener("contextmenu", (e) => {
		const trackRow = (e.target as HTMLElement).closest(".context-track");
		const albumRow = (e.target as HTMLElement).closest(".context-album");

		if (trackRow) {
			e.preventDefault();
			const trackId = trackRow.getAttribute("data-track-id");
			const track = state.scannedTracks.find((t) => t.id === trackId);

			const title = trackRow.getAttribute("data-title") || "";
			const artist = trackRow.getAttribute("data-artist") || "";
			const album = trackRow.getAttribute("data-album") || "";
			const genre = trackRow.getAttribute("data-genre") || "";

			const artists = splitAndNormalizeArtist(artist, state.currentSettings.delimiters || [], state.currentSettings.exceptions || []);

			api.showContextMenu({
				trackId,
				title,
				artist,
				artists,
				album,
				genre,
				itunesFilePath: track?.itunesTrack?.filePath,
				phoneFilePath: track?.phoneTrack?.filePath,
			});
		} else if (albumRow) {
			e.preventDefault();
			const artist = albumRow.getAttribute("data-artist") || "";
			const album = albumRow.getAttribute("data-album") || "";
			const genre = albumRow.getAttribute("data-genre") || "";

			const artists = splitAndNormalizeArtist(artist, state.currentSettings.delimiters || [], state.currentSettings.exceptions || []);

			api.showContextMenu({
				artist,
				artists,
				album,
				genre,
			});
		}
	});
}

function startSyncExecution() {
	if (!state.currentProfileId) return;

	elProgressModalTitle.textContent = "同期実行処理中...";
	elLblProgressStatus.textContent = "同期処理を実行しています...";
	elLblProgressPct.textContent = "0%";
	elProgressBarFill.style.width = "0%";
	elProgressLogs.innerHTML = "";
	elBtnProgressClose.disabled = true;
	elModalProgress.classList.remove("hidden");

	const copyTrackIds = Array.from(state.checkedCopyTrackIds);
	const moveTrackIds = Array.from(state.checkedMoveTrackIds);
	const deleteTrackIds = [...state.scannedTracks.filter((t) => t.status === "phone_only" && state.checkedDeleteTrackIds.has(t.id)).map((t) => t.id), ...Array.from(state.checkedDeleteItunesTrackIds)];

	const cancelProgress = api.onSyncProgress((progress: any) => {
		elLblProgressStatus.textContent = progress.message;
		elLblProgressPct.textContent = `${progress.progress}%`;
		elProgressBarFill.style.width = `${progress.progress}%`;

		elProgressLogs.innerHTML = "";
		if (progress.logs) {
			progress.logs.forEach((log: string) => {
				const logItem = document.createElement("div");
				logItem.className = "py-0.5 border-b border-gray-800 text-gray-300 font-mono";

				if (log.includes("成功")) logItem.classList.add("text-green-400");
				else if (log.includes("失敗") || log.includes("エラー")) logItem.classList.add("text-red-400");
				else if (log.includes("警告")) logItem.classList.add("text-amber-400");

				logItem.textContent = log;
				elProgressLogs.appendChild(logItem);
			});
			elProgressLogs.scrollTop = elProgressLogs.scrollHeight;
		}

		if (progress.status === "done" || progress.status === "error") {
			elBtnProgressClose.disabled = false;
		}
	});

	api.executeSync(state.currentProfileId, {
		copyTrackIds,
		moveTrackIds,
		deleteTrackIds,
	})
		.then(() => {
			// ==========================================
			// 【デバッグ・開発環境用フォールバック / DEBUG FALLBACK】
			// ==========================================
			if (isMock) {
				setTimeout(() => {
					elBtnProgressClose.disabled = false;
				}, 600);
			}
		})
		.catch((e: any) => {
			console.error("Error during sync execution:", e);
			cancelProgress();
			alert("同期処理中に重大なエラーが発生しました: " + e.message);
			elModalProgress.classList.add("hidden");
		});
}

function setupColumnResize() {
	const cols = [
		{ th: document.getElementById("th-title")!, resizer: document.getElementById("resizer-title")! },
		{ th: document.getElementById("th-artist")!, resizer: document.getElementById("resizer-artist")! },
		{ th: document.getElementById("th-album")!, resizer: document.getElementById("resizer-album")! },
		{ th: document.getElementById("th-track")!, resizer: document.getElementById("resizer-track")! },
		{ th: document.getElementById("th-genre")!, resizer: document.getElementById("resizer-genre")! },
	];

	cols.forEach((col) => {
		let startX = 0;
		let startWidth = 0;

		const onMouseMove = (e: MouseEvent) => {
			const width = startWidth + (e.clientX - startX);
			if (width > 40) {
				col.th.style.width = `${width}px`;
				col.th.style.minWidth = `${width}px`;
				col.th.style.maxWidth = `${width}px`;
				if (state.activeTab === "track") {
					renderVirtualTracks(vsViewport, vsCanvas, vsContent, {
						updateSummaryBar,
						updateMasterCheckboxState,
					});
				}
			}
		};

		const onMouseUp = () => {
			document.removeEventListener("mousemove", onMouseMove);
			document.removeEventListener("mouseup", onMouseUp);
		};

		col.resizer.addEventListener("mousedown", (e) => {
			startX = e.clientX;
			startWidth = col.th.offsetWidth;
			document.addEventListener("mousemove", onMouseMove);
			document.addEventListener("mouseup", onMouseUp);
			e.preventDefault();
		});
	});
}

function renderSortRules() {
	const elList = document.getElementById("sort-rules-list")!;
	const elBadge = document.getElementById("sort-badge")!;
	if (!elList) return;

	elList.innerHTML = "";
	elBadge.textContent = String(state.sortRules.length);

	const fields = [
		{ val: "artist", label: "アーティスト" },
		{ val: "album", label: "アルバム" },
		{ val: "title", label: "曲名" },
		{ val: "year", label: "発売年" },
		{ val: "track", label: "トラック" },
		{ val: "status", label: "ステータス" },
	];

	state.sortRules.forEach((rule, idx) => {
		const row = document.createElement("div");
		row.className = "flex items-center space-x-1 bg-gray-900/50 p-1.5 rounded border border-gray-750 gap-1";

		// 1. Priority Indicator / Index
		const priorityLabel = document.createElement("span");
		priorityLabel.className = "text-[10px] text-gray-500 font-mono w-4 text-center select-none";
		priorityLabel.textContent = `${idx + 1}`;
		row.appendChild(priorityLabel);

		// 2. Select Field
		const selField = document.createElement("select");
		selField.className = "bg-gray-800 text-white rounded px-1.5 py-0.5 border border-gray-650 focus:outline-none flex-1 font-semibold text-[10px]";
		fields.forEach((f) => {
			const opt = document.createElement("option");
			opt.value = f.val;
			opt.textContent = f.label;
			if (rule.field === f.val) opt.selected = true;
			selField.appendChild(opt);
		});
		selField.addEventListener("change", () => {
			rule.field = selField.value;
			applyFilterAndRender();
		});
		row.appendChild(selField);

		// 3. Select Direction
		const selDir = document.createElement("select");
		selDir.className = "bg-gray-800 text-white rounded px-1.5 py-0.5 border border-gray-650 focus:outline-none w-16 text-[10px]";
		const optAsc = document.createElement("option");
		optAsc.value = "asc";
		optAsc.textContent = "昇順";
		if (rule.direction === "asc") optAsc.selected = true;
		selDir.appendChild(optAsc);

		const optDesc = document.createElement("option");
		optDesc.value = "desc";
		optDesc.textContent = "降順";
		if (rule.direction === "desc") optDesc.selected = true;
		selDir.appendChild(optDesc);

		selDir.addEventListener("change", () => {
			rule.direction = selDir.value as "asc" | "desc";
			applyFilterAndRender();
		});
		row.appendChild(selDir);

		// 4. Move Up / Move Down buttons
		const moveBtnContainer = document.createElement("div");
		moveBtnContainer.className = "flex flex-col space-y-0.5";

		const btnUp = document.createElement("button");
		btnUp.className = `text-[8px] text-gray-500 hover:text-white transition focus:outline-none px-0.5 ${idx === 0 ? "opacity-30 pointer-events-none" : ""}`;
		btnUp.innerHTML = "▲";
		btnUp.addEventListener("click", (e) => {
			e.stopPropagation();
			const tmp = state.sortRules[idx];
			state.sortRules[idx] = state.sortRules[idx - 1];
			state.sortRules[idx - 1] = tmp;
			renderSortRules();
			applyFilterAndRender();
		});
		moveBtnContainer.appendChild(btnUp);

		const btnDown = document.createElement("button");
		btnDown.className = `text-[8px] text-gray-500 hover:text-white transition focus:outline-none px-0.5 ${idx === state.sortRules.length - 1 ? "opacity-30 pointer-events-none" : ""}`;
		btnDown.innerHTML = "▼";
		btnDown.addEventListener("click", (e) => {
			e.stopPropagation();
			const tmp = state.sortRules[idx];
			state.sortRules[idx] = state.sortRules[idx + 1];
			state.sortRules[idx + 1] = tmp;
			renderSortRules();
			applyFilterAndRender();
		});
		moveBtnContainer.appendChild(btnDown);

		row.appendChild(moveBtnContainer);

		// 5. Delete Button
		const btnDel = document.createElement("button");
		btnDel.className = "text-gray-500 hover:text-red-400 transition focus:outline-none px-1 py-0.5";
		btnDel.innerHTML = '<i class="icon-trash-2 text-[10px]"></i>';
		btnDel.addEventListener("click", (e) => {
			e.stopPropagation();
			state.sortRules.splice(idx, 1);
			renderSortRules();
			applyFilterAndRender();
		});
		row.appendChild(btnDel);

		elList.appendChild(row);
	});
}

function updateFilterUI() {
	const filters = [
		{ id: "missing", el: document.getElementById("stat-btn-missing") },
		{ id: "updated", el: document.getElementById("stat-btn-updated") },
		{ id: "synced", el: document.getElementById("stat-btn-synced") },
		{ id: "phone_only", el: document.getElementById("stat-btn-phone_only") },
		{ id: "path_warning", el: document.getElementById("stat-btn-path_warning") },
	];

	filters.forEach((f) => {
		if (!f.el) return;
		const isActive = state.activeStatusFilters.has(f.id);
		if (isActive) {
			f.el.classList.remove("opacity-40", "bg-gray-800/20");
			f.el.classList.add("opacity-100", "bg-gray-700/30");
		} else {
			f.el.classList.remove("opacity-100", "bg-gray-700/30");
			f.el.classList.add("opacity-40", "bg-gray-800/20");
		}
	});
}

function toggleStatusFilter(filterId: string) {
	if (filterId === "total") {
		state.activeStatusFilters = new Set(["missing", "updated", "synced", "phone_only", "path_warning"]);
	} else {
		if (state.activeStatusFilters.has(filterId)) {
			state.activeStatusFilters.delete(filterId);
		} else {
			state.activeStatusFilters.add(filterId);
		}
	}
	updateFilterUI();
	applyFilterAndRender();
}

function setupFilterButton(elId: string, filterId: string) {
	const el = document.getElementById(elId);
	if (!el) return;
	el.addEventListener("click", () => {
		toggleStatusFilter(filterId);
	});
	el.addEventListener("keydown", (e: KeyboardEvent) => {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			toggleStatusFilter(filterId);
		}
	});
}

function renderSearchHistory() {
	if (!state.currentProfileId) return;
	const p = state.profiles.find((x) => x.id === state.currentProfileId);
	if (!p) return;

	const history = p.searchHistory || [];
	if (history.length === 0) {
		elSearchCombobox.classList.add("hidden");
		elSearchCombobox.innerHTML = "";
		return;
	}

	elSearchCombobox.innerHTML = "";
	elSearchCombobox.classList.remove("hidden");

	const section = document.createElement("div");
	section.className = "px-3 py-1.5";

	const header = document.createElement("div");
	header.className = "font-bold text-gray-400 border-b border-gray-700 pb-1 mb-1.5 flex items-center space-x-1.5";
	header.innerHTML = `<i class="icon-history text-indigo-400"></i><span>検索履歴 (最近の5件)</span>`;
	section.appendChild(header);

	const listContainer = document.createElement("div");
	listContainer.className = "divide-y divide-gray-750/30";

	history.forEach((q) => {
		const row = document.createElement("div");
		row.className = "py-1.5 flex items-center justify-between hover:bg-gray-750/30 rounded px-2 transition cursor-pointer select-none text-gray-300 truncate font-sans text-xxs";
		row.innerHTML = `
			<span class="truncate flex-1">　${q}</span>
			<i class="icon-corner-down-left text-gray-500 text-[10px]"></i>
		`;
		row.addEventListener("mousedown", (e) => {
			e.preventDefault();
			e.stopPropagation();
			elTxtSearch.value = q;
			state.searchQuery = q;
			applyFilterAndRender();
			renderSearchCombobox();
			addSearchHistory(q);
		});
		listContainer.appendChild(row);
	});

	section.appendChild(listContainer);
	elSearchCombobox.appendChild(section);
}

function addSearchHistory(query: string) {
	const q = query.trim();
	if (!q || !state.currentProfileId) return;

	const p = state.profiles.find((x) => x.id === state.currentProfileId);
	if (!p) return;

	let history = p.searchHistory || [];
	history = history.filter((x) => x.toLowerCase() !== q.toLowerCase());
	history.unshift(q);
	p.searchHistory = history.slice(0, 5);

	api.saveProfile(p).then((updatedProfiles) => {
		state.profiles = updatedProfiles;
	});
}

// Start everything
init();
