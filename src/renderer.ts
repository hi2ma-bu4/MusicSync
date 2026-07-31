import "lucide-static/font/lucide.css";
import "./style.css";

import { api, isMock } from "./renderer/api";
import { initModals, showCustomAlert, showCustomConfirm, updateDynamicColors } from "./renderer/components/modals";
import { renderVirtualTracks } from "./renderer/components/tableView";
import { alignGridDrawer, clearIndexMapsCache, renderAlbumView, renderArtistView, renderGenreView, updateAllTreeCheckboxes } from "./renderer/components/treeView";
import { compareGroups, compareTracks, formatBytes, formatDeltaBytes, formatDeltaDurationHHMMSS, formatDurationHHMMSS, getCheckboxChangesCount, getSafeId, isTrackChecked, normalizeArtistForIntegration, resetCheckboxesToDefault, setTrackCheckedState, splitAndNormalizeArtist } from "./renderer/components/utils";
import { clearHistory, CONFIG, handleRedo, handleUndo, pushHistoryState, state } from "./renderer/state";
import { ScanResultItem } from "./renderer/types";
import { DEFAULT_DELIMITERS } from "./shared/constants";

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
const elBtnSearchClear = document.getElementById("btn-search-clear") as HTMLButtonElement;
const elSearchCombobox = document.getElementById("search-combobox")!;
const elBtnScan = document.getElementById("btn-scan") as HTMLButtonElement;

// Sync/Change Target Only filter DOM elements
const elBtnFilterSyncOnly = document.getElementById("btn-filter-sync-only")!;
const elIconFilterSyncOnly = document.getElementById("icon-filter-sync-only")!;
const elBtnSyncExec = document.getElementById("btn-sync-exec") as HTMLButtonElement;
const elBtnViewToggle = document.getElementById("btn-view-toggle") as HTMLButtonElement;
const elIconViewToggle = document.getElementById("icon-view-toggle")!;

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
const elValTotalStats = document.getElementById("val-total-stats")!;

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

// Progress Modal
const elModalProgress = document.getElementById("modal-progress")!;
const elProgressModalTitle = document.getElementById("progress-modal-title")!;
const elLblProgressStatus = document.getElementById("lbl-progress-status")!;
const elLblProgressPct = document.getElementById("lbl-progress-pct")!;
const elLblProgressTime = document.getElementById("lbl-progress-time")!;
const elProgressBarFill = document.getElementById("progress-bar-fill")!;
const elProgressLogs = document.getElementById("progress-logs")!;
const elBtnProgressClose = document.getElementById("btn-progress-close") as HTMLButtonElement;
const elBtnProgressCancel = document.getElementById("btn-progress-cancel") as HTMLButtonElement;

let progressStartTime = 0;

function formatTimeEstimation(seconds: number): string {
	if (seconds <= 0 || isNaN(seconds) || !isFinite(seconds)) {
		return "0秒";
	}
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = Math.floor(seconds % 60);

	const parts: string[] = [];
	if (h > 0) parts.push(`${h}時間`);
	if (m > 0) parts.push(`${m}分`);
	if (s > 0 || parts.length === 0) parts.push(`${s}秒`);

	return parts.join("");
}

function updateProgressTimeAndPct(progressPct: number) {
	elLblProgressPct.textContent = `${progressPct}%`;
	if (!elLblProgressTime) return;

	if (progressPct <= 0) {
		elLblProgressTime.textContent = "";
		return;
	}

	const elapsedMs = Date.now() - progressStartTime;
	const elapsedSec = Math.floor(elapsedMs / 1000);

	if (progressPct >= 100) {
		elLblProgressTime.textContent = `経過時間: ${formatTimeEstimation(elapsedSec)}`;
		return;
	}

	const estimatedTotalSec = elapsedSec / (progressPct / 100);
	const remainingSec = Math.max(0, Math.floor(estimatedTotalSec - elapsedSec));

	const elapsedStr = formatTimeEstimation(elapsedSec);
	const remainingStr = formatTimeEstimation(remainingSec);

	elLblProgressTime.textContent = `経過: ${elapsedStr} / 残り: ${remainingStr}`;
}

const vsViewport = document.getElementById("virtual-scroll-viewport")!;
const vsCanvas = document.getElementById("virtual-scroll-canvas")!;
const vsContent = document.getElementById("virtual-scroll-content")!;

const showStatusContextMenu = (e: MouseEvent, statusId: string, statusLabel: string) => {
	e.preventDefault();
	e.stopPropagation();
	api.showContextMenu({
		isStatus: true,
		statusId,
		statusLabel,
	});
};

async function init() {
	state.currentSettings = await api.getSettings();
	if (!state.currentSettings.delimiters) state.currentSettings.delimiters = DEFAULT_DELIMITERS;
	if (!state.currentSettings.exceptions) state.currentSettings.exceptions = [];
	updateDynamicColors(state.currentSettings);

	state.profiles = await api.getProfiles();
	renderProfileDropdown();

	// Advanced Copy/Update and Delete filters
	const elToggleFilterCopyUpdate = document.getElementById("toggle-filter-copy-update")!;
	const elToggleFilterDelete = document.getElementById("toggle-filter-delete")!;

	const updateAdvancedFilterButtonsUI = () => {
		if (state.filterCopyUpdateActive) {
			elToggleFilterCopyUpdate.className = "transition-all px-1.5 py-0.5 rounded text-[10px] bg-indigo-950/60 border border-indigo-500/80 text-indigo-300 font-bold shadow-[0_0_8px_rgba(99,102,241,0.4)] cursor-pointer focus:outline-none";
		} else {
			elToggleFilterCopyUpdate.className = "transition-all px-1.5 py-0.5 rounded text-[10px] bg-gray-800/20 border border-gray-700/40 text-gray-400 hover:text-white cursor-pointer focus:outline-none";
		}

		if (state.filterDeleteActive) {
			elToggleFilterDelete.className = "transition-all px-1.5 py-0.5 rounded text-[10px] bg-red-950/60 border border-red-500/80 text-red-300 font-bold shadow-[0_0_8px_rgba(239,68,68,0.4)] cursor-pointer focus:outline-none";
		} else {
			elToggleFilterDelete.className = "transition-all px-1.5 py-0.5 rounded text-[10px] bg-gray-800/20 border border-gray-700/40 text-gray-400 hover:text-white cursor-pointer focus:outline-none";
		}
	};

	const updateFilterSyncOnlyButtonUI = () => {
		if (state.filterSyncTargetOnlyActive) {
			elBtnFilterSyncOnly.className = "flex items-center space-x-1.5 bg-indigo-950/60 border border-indigo-500/80 text-indigo-300 shadow-[0_0_8px_rgba(99,102,241,0.4)] px-2.5 py-1 rounded text-xxs font-bold transition focus:outline-none cursor-pointer";
			elIconFilterSyncOnly.className = "icon-check-square text-xxs";
		} else {
			elBtnFilterSyncOnly.className = "flex items-center space-x-1.5 bg-gray-700 hover:bg-gray-650 border border-gray-650 px-2.5 py-1 rounded text-xxs font-semibold text-gray-200 transition focus:outline-none cursor-pointer";
			elIconFilterSyncOnly.className = "icon-square text-xxs";
		}
	};

	elToggleFilterCopyUpdate.addEventListener("click", () => {
		state.filterCopyUpdateActive = !state.filterCopyUpdateActive;
		updateAdvancedFilterButtonsUI();
		applyFilterAndRender();
	});

	elBtnFilterSyncOnly.addEventListener("click", () => {
		state.filterSyncTargetOnlyActive = !state.filterSyncTargetOnlyActive;
		updateFilterSyncOnlyButtonUI();
		applyFilterAndRender();
	});

	elToggleFilterDelete.addEventListener("click", () => {
		state.filterDeleteActive = !state.filterDeleteActive;
		updateAdvancedFilterButtonsUI();
		applyFilterAndRender();
	});

	// Right click menus for status badges
	const setupStatusRightClick = (elId: string, statusId: string, statusLabel: string) => {
		const el = document.getElementById(elId);
		if (el) {
			el.addEventListener("contextmenu", (e) => {
				showStatusContextMenu(e, statusId, statusLabel);
			});
		}
	};

	setupStatusRightClick("stat-btn-total", "total", "全件");
	setupStatusRightClick("stat-btn-missing", "missing", "未存在");
	setupStatusRightClick("stat-btn-updated", "updated", "更新あり");
	setupStatusRightClick("stat-btn-synced", "synced", "同期済");
	setupStatusRightClick("stat-btn-phone_only", "phone_only", "比較先のみ");
	setupStatusRightClick("stat-btn-path_warning", "path_warning", "配置不一致");

	api.onContextMenuCommand((command, arg) => {
		if (command === "hide-all-status") {
			state.activeStatusFilters.clear();
			updateFilterUI();
			applyFilterAndRender();
		} else if (command === "isolate-status") {
			state.activeStatusFilters = new Set([arg]);
			updateFilterUI();
			applyFilterAndRender();
		} else if (command === "play-track") {
			const track = state.scannedTracks.find((t) => t.id === arg);
			if (track) {
				playTrack(track);
			}
		} else if (command === "select-all-artist") {
			pushHistoryState();
			const tracks = getArtistTracks(arg);
			tracks.forEach((t) => setTrackCheckedState(t, true));
			updateAllTreeCheckboxes();
			updateSummaryBar();
			updateMasterCheckboxState();
		} else if (command === "deselect-all-artist") {
			pushHistoryState();
			const tracks = getArtistTracks(arg);
			tracks.forEach((t) => setTrackCheckedState(t, false));
			updateAllTreeCheckboxes();
			updateSummaryBar();
			updateMasterCheckboxState();
		} else if (command === "select-albums-artist") {
			pushHistoryState();
			const tracks = getTracksOfAlbumsContainingArtist(arg);
			tracks.forEach((t) => setTrackCheckedState(t, true));
			updateAllTreeCheckboxes();
			updateSummaryBar();
			updateMasterCheckboxState();
		} else if (command === "deselect-albums-artist") {
			pushHistoryState();
			const tracks = getTracksOfAlbumsContainingArtist(arg);
			tracks.forEach((t) => setTrackCheckedState(t, false));
			updateAllTreeCheckboxes();
			updateSummaryBar();
			updateMasterCheckboxState();
		} else if (command === "select-all-album") {
			pushHistoryState();
			const tracks = getAlbumTracks(arg);
			tracks.forEach((t) => setTrackCheckedState(t, true));
			updateAllTreeCheckboxes();
			updateSummaryBar();
			updateMasterCheckboxState();
		} else if (command === "deselect-all-album") {
			pushHistoryState();
			const tracks = getAlbumTracks(arg);
			tracks.forEach((t) => setTrackCheckedState(t, false));
			updateAllTreeCheckboxes();
			updateSummaryBar();
			updateMasterCheckboxState();
		} else if (command === "select-all-genre") {
			pushHistoryState();
			const tracks = getGenreTracks(arg);
			tracks.forEach((t) => setTrackCheckedState(t, true));
			updateAllTreeCheckboxes();
			updateSummaryBar();
			updateMasterCheckboxState();
		} else if (command === "deselect-all-genre") {
			pushHistoryState();
			const tracks = getGenreTracks(arg);
			tracks.forEach((t) => setTrackCheckedState(t, false));
			updateAllTreeCheckboxes();
			updateSummaryBar();
			updateMasterCheckboxState();
		} else if (command === "show-track-detail") {
			const track = state.scannedTracks.find((t) => t.id === arg);
			if (track) {
				showDetailedModal("track", track);
			}
		} else if (command === "show-album-detail") {
			showDetailedModal("album", arg);
		} else if (command === "copy-album-art-command") {
			if (state.currentProfileId && arg) {
				api.copyAlbumArt(state.currentProfileId, arg).then((success) => {
					if (success) {
						const artContainer = document.getElementById("detail-album-art-container");
						if (artContainer) {
							const originalBorder = artContainer.style.borderColor;
							artContainer.style.borderColor = "#6366f1"; // Highlight with indigo ring color
							setTimeout(() => {
								artContainer.style.borderColor = originalBorder;
							}, 500);
						}
					}
				});
			}
		} else {
			navigateToSuggestion(command === "jump-artist" ? "artist" : command === "jump-album" ? "album" : "genre", arg);
		}
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

	// Setup view toggle event listener
	if (elBtnViewToggle) {
		elBtnViewToggle.addEventListener("click", () => {
			if (state.activeTab !== "artist" && state.activeTab !== "album") return;

			// Before toggling, calculate which album/artist card is closest to the top of the container
			const container = elTreeContainer;
			const cards = Array.from(container.querySelectorAll(".context-album, .context-artist, .grid-card-album"));
			let closestCardId: string | null = null;
			let minDiff = Infinity;
			const containerRect = container.getBoundingClientRect();

			cards.forEach((card) => {
				const rect = card.getBoundingClientRect();
				const diff = Math.abs(rect.top - containerRect.top);
				if (diff < minDiff) {
					minDiff = diff;
					closestCardId = card.id || null;
				}
			});

			// If switching from grid to list, or vice versa, and multiple accordion items might be open,
			// handle grid closure rule: only keep the last-opened album/artist open.
			if (state.viewMode === "list") {
				// Switching to GRID. Ensure at most 1 album is expanded.
				const expandedList = Array.from(state.expandedGroups);
				if (expandedList.length > 1) {
					// Keep only the last expanded group
					const lastExpanded = expandedList[expandedList.length - 1];
					state.expandedGroups.clear();
					state.expandedGroups.add(lastExpanded);
				}
			}

			state.isTogglingViewMode = true;
			state.closestCardId = closestCardId;

			// Toggle the mode
			state.viewMode = state.viewMode === "list" ? "grid" : "list";

			// Persist in profile
			if (state.currentProfileId) {
				const p = state.profiles.find((x) => x.id === state.currentProfileId);
				if (p) {
					p.viewMode = state.viewMode;
					api.saveProfile(p).then((updatedProfiles) => {
						state.profiles = updatedProfiles;
					});
				}
			}

			updateViewToggleUI();
			applyFilterAndRender();
		});
	}

	setupEventListeners();
	setupColumnResize();
	setupPlayerEventListeners();

	elBtnScan.disabled = !state.currentProfileId;
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

		btn.addEventListener("click", async () => {
			if (p.id !== state.currentProfileId && getCheckboxChangesCount() > 0) {
				const confirmed = await showCustomConfirm("プロファイルの切り替え", "選択状態に変更がありますが、破棄してプロファイルを切り替えますか？");
				if (!confirmed) return;
				resetCheckboxesToDefault();
			}
			selectProfile(p.id);
		});
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
	state.filterSyncTargetOnlyActive = false;
	if (elBtnFilterSyncOnly && elIconFilterSyncOnly) {
		elBtnFilterSyncOnly.className = "flex items-center space-x-1.5 bg-gray-700 hover:bg-gray-650 border border-gray-650 px-2.5 py-1 rounded text-xxs font-semibold text-gray-200 transition focus:outline-none cursor-pointer";
		elIconFilterSyncOnly.className = "icon-square text-xxs";
	}
	elTxtSearch.value = "";
	state.searchQuery = "";

	// Clear stats and map caches when profile changes
	clearStatsSummaryCache();
	clearIndexMapsCache();

	// Restore tab sort rules and populate defaults if missing
	const initialDefaultSortRules = {
		artist: [
			{ field: "artist", direction: "asc" as const, target: "group" as const },
			{ field: "album", direction: "asc" as const, target: "group" as const },
			{ field: "track", direction: "asc" as const, target: "track" as const },
		],
		album: [
			{ field: "albumartist", direction: "asc" as const, target: "group" as const },
			{ field: "album", direction: "asc" as const, target: "group" as const },
			{ field: "track", direction: "asc" as const, target: "track" as const },
		],
		genre: [
			{ field: "genre", direction: "asc" as const, target: "group" as const },
			{ field: "title", direction: "asc" as const, target: "track" as const },
		],
		track: [{ field: "title", direction: "asc" as const, target: "track" as const }],
	};

	let needsSave = false;
	if (!p.tabSortRules) {
		p.tabSortRules = JSON.parse(JSON.stringify(initialDefaultSortRules));
		needsSave = true;
	}
	state.tabSortRules = JSON.parse(JSON.stringify(p.tabSortRules));

	if (!p.defaultSortRules) {
		p.defaultSortRules = JSON.parse(JSON.stringify(initialDefaultSortRules));
		needsSave = true;
	}

	if (needsSave) {
		api.saveProfile(p).then((updatedProfiles) => {
			state.profiles = updatedProfiles;
		});
	}

	// Restore playback settings
	if (p.playMode) {
		loopMode = p.playMode;
	} else {
		loopMode = "once";
	}
	updateLoopModeUI();

	// Restore view mode settings
	if (p.viewMode) {
		state.viewMode = p.viewMode;
	} else {
		state.viewMode = "list";
	}
	updateViewToggleUI();

	const volumeInput = document.getElementById("player-volume") as HTMLInputElement;
	const tooltip = document.getElementById("player-volume-tooltip")!;
	if (volumeInput) {
		const vol = p.playVolume !== undefined ? p.playVolume : 1;
		volumeInput.value = String(vol);
		if (audioElement) {
			audioElement.volume = vol;
		}
		updateVolumeIconUI(vol);
		if (tooltip) {
			tooltip.textContent = String(Math.round(vol * 100));
		}
	}

	state.activeTab = "" as any;
	switchTab("artist");
}

function switchTab(tabId: "artist" | "album" | "genre" | "track") {
	if (state.activeTab) {
		state.tabSortRules[state.activeTab] = JSON.parse(JSON.stringify(state.sortRules));
	}

	state.activeTab = tabId;
	elLblActiveTab.textContent = {
		artist: "アーティスト",
		album: "アルバム",
		genre: "ジャンル",
		track: "個別曲",
	}[tabId];

	state.sortRules = JSON.parse(JSON.stringify(state.tabSortRules[tabId] || []));
	renderSortRules();

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

	updateViewToggleUI();
	applyFilterAndRender();
}

function updateViewToggleUI() {
	if (!elBtnViewToggle || !elIconViewToggle) return;

	// View toggle is only valid on "artist" and "album" tabs.
	const isEnabledTab = state.activeTab === "artist" || state.activeTab === "album";
	elBtnViewToggle.disabled = !isEnabledTab;

	if (state.viewMode === "grid") {
		elIconViewToggle.className = "icon-list text-xxs";
		elBtnViewToggle.title = "リスト表示に切り替え";
	} else {
		elIconViewToggle.className = "icon-layout-grid text-xxs";
		elBtnViewToggle.title = "グリッド表示に切り替え";
	}
}

import { normalizeForSearch } from "./renderer/components/utils";

function renderSearchCombobox() {
	const query = state.searchQuery.trim();
	if (!query) {
		elSearchCombobox.classList.add("hidden");
		elSearchCombobox.innerHTML = "";
		return;
	}
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
			row.className = "py-1 flex items-center justify-between hover:bg-gray-700/50 rounded px-1.5 transition cursor-pointer select-none text-gray-300 gap-2";

			if (cat.name === "album") {
				row.innerHTML = `
					<div class="flex items-center space-x-2 min-w-0 flex-1">
						<div class="w-6 h-6 rounded bg-gray-900 border border-gray-700 flex items-center justify-center shrink-0 overflow-hidden relative shadow-sm">
							<img class="search-combobox-album-art w-full h-full object-cover hidden" data-album-name="${item}" src="" alt="">
							<i class="search-combobox-art-placeholder icon-music text-gray-600 text-[10px]"></i>
						</div>
						<span class="truncate font-semibold text-gray-200">${item}</span>
					</div>
				`;
				row.addEventListener("click", (e) => {
					e.stopPropagation();
					navigateToSuggestion("album", item);
				});

				// Lazy load album art
				setTimeout(() => {
					const img = row.querySelector(".search-combobox-album-art") as HTMLImageElement;
					const placeholder = row.querySelector(".search-combobox-art-placeholder") as HTMLElement;
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
					`;
				} else {
					row.innerHTML = `
						<span class="truncate font-semibold text-gray-200">${artistText}</span>
					`;
				}
				row.addEventListener("click", (e) => {
					e.stopPropagation();
					navigateToSuggestion("artist", item.splitName);
				});
			} else {
				const meta = item.itunesTrack || item.phoneTrack;
				const trackAlbum = meta?.album || "";
				row.innerHTML = `
					<div class="flex items-center space-x-2 min-w-0 flex-1">
						<div class="w-6 h-6 rounded bg-gray-900 border border-gray-700 flex items-center justify-center shrink-0 overflow-hidden relative shadow-sm">
							<img class="search-combobox-track-art w-full h-full object-cover hidden" data-album-name="${trackAlbum.replace(/"/g, "&quot;")}" src="" alt="">
							<i class="search-combobox-track-placeholder icon-music text-gray-600 text-[10px]"></i>
						</div>
						<div class="flex items-center space-x-1 truncate font-sans min-w-0 flex-1">
							<span class="text-gray-200 truncate font-semibold">${meta?.title}</span>
							<span class="text-gray-500 text-[10px] truncate">by ${meta?.artist}</span>
						</div>
					</div>
				`;
				row.addEventListener("click", (e) => {
					e.stopPropagation();
					navigateToSuggestion("track", meta?.title || "");
				});

				// Lazy load track album art
				setTimeout(() => {
					const img = row.querySelector(".search-combobox-track-art") as HTMLImageElement;
					const placeholder = row.querySelector(".search-combobox-track-placeholder") as HTMLElement;
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
			moreRow.className = "py-0.5 text-gray-500 italic text-[10px] pl-2.5";
			moreRow.textContent = `　...他 ${diff} 件`;
			listContainer.appendChild(moreRow);
		}

		section.appendChild(listContainer);
		elSearchCombobox.appendChild(section);
	});
}

function navigateToSuggestion(tabId: "artist" | "album" | "genre" | "track", targetName: string) {
	// Close detailed metadata modal if open
	const modalDetail = document.getElementById("modal-detail");
	if (modalDetail) {
		modalDetail.classList.add("hidden");
	}

	// Clear search query on jump navigation
	elTxtSearch.value = "";
	state.searchQuery = "";
	elBtnSearchClear.classList.add("hidden");
	elSearchCombobox.classList.add("hidden");

	// Reset stored scroll positions to avoid scroll restore conflicts on jump target
	state.tabScrollPositions[tabId] = 0;

	// Reset filter and render instantly so the element exists on screen
	applyFilterAndRender();

	// 2. Switch tab and auto-expand target group
	if (tabId === "artist") {
		// Try to find normalized artist key in all tracks
		let normalizedKey = normalizeArtistForIntegration(targetName);
		const artistKey = getSafeId("artist", normalizedKey);
		state.expandedGroups.add(artistKey);
		switchTab("artist");
		// 3. Scroll to target element instantly
		setTimeout(() => {
			const el = document.getElementById(`hdr-${artistKey}`);
			if (el) {
				el.scrollIntoView({ behavior: "auto", block: "center" });
			}
		}, 50);
	} else if (tabId === "album") {
		const albumKey = getSafeId("album", targetName);
		state.expandedGroups.add(albumKey);
		switchTab("album");
		// 3. Scroll to target element instantly
		setTimeout(() => {
			const el = document.getElementById(`hdr-${albumKey}`);
			if (el) {
				el.scrollIntoView({ behavior: "auto", block: "center" });
			}
		}, 50);
	} else if (tabId === "genre") {
		const genreKey = getSafeId("genre", targetName);
		state.expandedGroups.add(genreKey);
		switchTab("genre");
		// 3. Scroll to target element instantly
		setTimeout(() => {
			const el = document.getElementById(`hdr-${genreKey}`);
			if (el) {
				el.scrollIntoView({ behavior: "auto", block: "center" });
			}
		}, 50);
	} else if (tabId === "track") {
		switchTab("track");
		// 3. Scroll to target item index in the virtual scroll viewport instantly
		setTimeout(() => {
			const idx = state.filteredTracks.findIndex((t) => (t.itunesTrack || t.phoneTrack)?.title === targetName);
			if (idx !== -1) {
				vsViewport.scrollTop = idx * 30; // Row height is 30px
			}
		}, 50);
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
		elTreeContainer.innerHTML = ""; // Clear inactive tree container DOM
		elTreeContainer.onscroll = null; // Clear tree container scroll listener
		elTrackContainer.classList.remove("hidden");
		if (state.tabScrollPositions.track) {
			vsViewport.scrollTop = state.tabScrollPositions.track;
		}
	} else {
		elTreeContainer.classList.remove("hidden");
		elTrackContainer.classList.add("hidden");
		vsCanvas.style.height = "0px"; // Clear inactive track container DOM
		vsContent.innerHTML = "";
	}

	if (state.activeTab === "artist") renderArtistView(elTreeContainer, callbacks);
	else if (state.activeTab === "album") renderAlbumView(elTreeContainer, callbacks);
	else if (state.activeTab === "genre") renderGenreView(elTreeContainer, callbacks);
	else if (state.activeTab === "track") renderVirtualTracks(vsViewport, vsCanvas, vsContent, callbacks);

	updateAllTreeCheckboxes();
}

// One-pass status stats generator to optimize performance on 20000+ tracks
function getGroupsAllStatusStats(groups: Map<string, any[]>) {
	const statsMap = new Map<string, { complete: number; partial: number }>();
	const statuses = ["missing", "updated", "synced", "phone_only"];
	statuses.forEach((s) => statsMap.set(s, { complete: 0, partial: 0 }));

	groups.forEach((tracks) => {
		const counts = new Map<string, number>();
		statuses.forEach((s) => counts.set(s, 0));

		tracks.forEach((t) => {
			if (counts.has(t.status)) {
				counts.set(t.status, counts.get(t.status)! + 1);
			}
		});

		const len = tracks.length;
		statuses.forEach((s) => {
			const count = counts.get(s) || 0;
			const stat = statsMap.get(s)!;
			if (count === len) {
				stat.complete++;
			} else if (count > 0) {
				stat.partial++;
			}
		});
	});

	return statsMap;
}

function formatStatusStatTextMulti(trackCount: number, status: string, statsMap: Map<string, { complete: number; partial: number }> | null) {
	if (!statsMap || state.activeTab === "track") {
		return String(trackCount);
	}

	const stat = statsMap.get(status);
	if (!stat) {
		return String(trackCount);
	}

	const { complete, partial } = stat;
	if (partial > 0) {
		return `${trackCount} <span class="font-sans text-[10px] text-gray-400">(${complete},<span class="text-gray-500 font-normal opacity-70 text-[9px]">${partial}(一部)</span>)</span>`;
	} else {
		return `${trackCount} <span class="font-sans text-[10px] text-gray-400">(${complete})</span>`;
	}
}

// Caching stats summary per tab and scanned tracks reference to avoid O(N) recalculations on checkbox click
let lastScannedTracksRef: any[] | null = null;
let lastActiveTabStats: string | null = null;
const cachedStatsSummary = {
	total: 0,
	missing: 0,
	updated: 0,
	synced: 0,
	phoneOnly: 0,
	pathWarnings: 0,
	phoneTotalSize: 0,
	phoneTotalDuration: 0,
	itunesTotalSize: 0,
	itunesTotalDuration: 0,
	groupsStatsMap: null as Map<string, { complete: number; partial: number }> | null,
};

function rebuildStatsSummaryIfNeeded() {
	if (lastScannedTracksRef === state.scannedTracks && lastActiveTabStats === state.activeTab) {
		return;
	}

	lastScannedTracksRef = state.scannedTracks;
	lastActiveTabStats = state.activeTab;

	cachedStatsSummary.total = 0;
	cachedStatsSummary.missing = 0;
	cachedStatsSummary.updated = 0;
	cachedStatsSummary.synced = 0;
	cachedStatsSummary.phoneOnly = 0;
	cachedStatsSummary.pathWarnings = 0;
	cachedStatsSummary.phoneTotalSize = 0;
	cachedStatsSummary.phoneTotalDuration = 0;
	cachedStatsSummary.itunesTotalSize = 0;
	cachedStatsSummary.itunesTotalDuration = 0;

	state.scannedTracks.forEach((t) => {
		if (t.status === "phone_only") {
			cachedStatsSummary.phoneOnly++;
		} else {
			cachedStatsSummary.total++;
			if (t.status === "missing") cachedStatsSummary.missing++;
			else if (t.status === "updated") cachedStatsSummary.updated++;
			else if (t.status === "synced") cachedStatsSummary.synced++;
		}
		if (t.pathMismatch) {
			cachedStatsSummary.pathWarnings++;
		}

		if (t.status !== "missing") {
			cachedStatsSummary.phoneTotalSize += t.phoneTrack?.size ?? t.itunesTrack?.size ?? 0;
			cachedStatsSummary.phoneTotalDuration += t.phoneTrack?.duration ?? t.itunesTrack?.duration ?? 0;
		}
		if (t.status !== "phone_only") {
			cachedStatsSummary.itunesTotalSize += t.itunesTrack?.size ?? t.phoneTrack?.size ?? 0;
			cachedStatsSummary.itunesTotalDuration += t.itunesTrack?.duration ?? t.phoneTrack?.duration ?? 0;
		}
	});

	let groups: Map<string, any[]> | null = null;
	if (state.activeTab === "artist") {
		groups = new Map<string, any[]>();
		state.scannedTracks.forEach((t) => {
			const meta = t.itunesTrack || t.phoneTrack;
			const artistName = (meta && meta.artist) || "Unknown Artist";
			const splitNames = splitAndNormalizeArtist(artistName, state.currentSettings.delimiters || [], state.currentSettings.exceptions || []);
			splitNames.forEach((name) => {
				const key = normalizeArtistForIntegration(name);
				if (!groups!.has(key)) groups!.set(key, []);
				groups!.get(key)!.push(t);
			});
		});
	} else if (state.activeTab === "album") {
		groups = new Map<string, any[]>();
		state.scannedTracks.forEach((t) => {
			const meta = t.itunesTrack || t.phoneTrack;
			const albumName = (meta && meta.album) || "Unknown Album";
			if (!groups!.has(albumName)) groups!.set(albumName, []);
			groups!.get(albumName)!.push(t);
		});
	} else if (state.activeTab === "genre") {
		groups = new Map<string, any[]>();
		state.scannedTracks.forEach((t) => {
			const meta = t.itunesTrack || t.phoneTrack;
			const genreName = (meta && meta.genre) || "Unknown Genre";
			if (!groups!.has(genreName)) groups!.set(genreName, []);
			groups!.get(genreName)!.push(t);
		});
	}

	cachedStatsSummary.groupsStatsMap = groups ? getGroupsAllStatusStats(groups) : null;
}

export function clearStatsSummaryCache() {
	lastScannedTracksRef = null;
	lastActiveTabStats = null;
}

function updateStatsSummary() {
	rebuildStatsSummaryIfNeeded();

	const { total, missing, updated, synced, phoneOnly, pathWarnings, phoneTotalSize, phoneTotalDuration, itunesTotalSize, itunesTotalDuration, groupsStatsMap } = cachedStatsSummary;

	elCntTotal.textContent = String(total);
	elCntMissing.innerHTML = formatStatusStatTextMulti(missing, "missing", groupsStatsMap);
	elCntUpdated.innerHTML = formatStatusStatTextMulti(updated, "updated", groupsStatsMap);
	elCntSynced.innerHTML = formatStatusStatTextMulti(synced, "synced", groupsStatsMap);
	elCntPhoneOnly.innerHTML = formatStatusStatTextMulti(phoneOnly, "phone_only", groupsStatsMap);

	if (elValTotalStats) {
		elValTotalStats.textContent = `${formatBytes(phoneTotalSize)}/${formatBytes(itunesTotalSize)} (${formatDurationHHMMSS(phoneTotalDuration)}/${formatDurationHHMMSS(itunesTotalDuration)})`;
	}

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

function updateResetChangesButtonState() {
	const btnReset = document.getElementById("btn-reset-changes") as HTMLButtonElement;
	if (!btnReset) return;

	const changes = getCheckboxChangesCount();
	btnReset.disabled = changes === 0;
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

	updateResetChangesButtonState();
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
	// 0. Update priority cache based on the current checked states
	state.trackPriorityCache.clear();
	state.scannedTracks.forEach((track) => {
		let pri = 0;
		if ((track.status === "missing" || track.status === "updated") && state.checkedCopyTrackIds.has(track.id)) {
			pri = 1;
		} else if ((track.status === "synced" || track.status === "updated" || track.status === "phone_only") && state.checkedDeleteTrackIds.has(track.id)) {
			pri = 2;
		} else if (track.pathMismatch && (track.status === "synced" || track.status === "updated") && state.checkedMoveTrackIds.has(track.id)) {
			pri = 3;
		}
		state.trackPriorityCache.set(track.id, pri);
	});

	let tracks = state.scannedTracks;

	// 0. Filter by "同期・変更のみ" (Sync/Change Target Only)
	if (state.filterSyncTargetOnlyActive) {
		tracks = tracks.filter((t) => {
			// Exclude missing tracks that are unchecked
			if (t.status === "missing" && !isTrackChecked(t)) {
				return false;
			}
			return true;
		});
	}

	// 1. Filter by search query based on active tab
	if (state.searchQuery !== "") {
		const qNorm = normalizeForSearch(state.searchQuery);
		tracks = tracks.filter((t) => {
			const meta = t.itunesTrack || t.phoneTrack;
			if (!meta) return false;

			if (state.activeTab === "artist") {
				const artist = meta.artist || "";
				// Check split artists
				const splitNames = splitAndNormalizeArtist(artist, state.currentSettings.delimiters || [], state.currentSettings.exceptions || []);
				const matchedAnySplit = splitNames.some((name) => {
					const normSplit = normalizeForSearch(name);
					return normSplit.includes(qNorm);
				});
				if (matchedAnySplit) return true;

				const artistNorm = normalizeForSearch(artist);
				return artistNorm.includes(qNorm);
			} else if (state.activeTab === "album") {
				const albumNorm = normalizeForSearch(meta.album || "");
				return albumNorm.includes(qNorm);
			} else if (state.activeTab === "genre") {
				const genreNorm = normalizeForSearch(meta.genre || "");
				return genreNorm.includes(qNorm);
			} else if (state.activeTab === "track") {
				const titleNorm = normalizeForSearch(meta.title || "");
				return titleNorm.includes(qNorm);
			}
			return false;
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

	// 3. Filter by advanced selection filters (Copy/Update Active and Delete Active)
	if (state.filterCopyUpdateActive || state.filterDeleteActive) {
		tracks = tracks.filter((t) => {
			let matchCopyUpdate = false;
			let matchDelete = false;

			if (state.filterCopyUpdateActive) {
				if (t.status === "missing" && isTrackChecked(t)) {
					matchCopyUpdate = true;
				} else if (t.status === "updated" && isTrackChecked(t)) {
					matchCopyUpdate = true;
				} else if (t.pathMismatch && isTrackChecked(t)) {
					matchCopyUpdate = true;
				}
			}

			if (state.filterDeleteActive) {
				if ((t.status === "synced" || t.status === "phone_only" || t.status === "updated") && !isTrackChecked(t)) {
					matchDelete = true;
				}
			}

			return matchCopyUpdate || matchDelete;
		});
	}

	state.filteredTracks = tracks.sort((a, b) => compareTracks(a, b, state.sortRules));
	renderActiveView();
	updateMasterCheckboxState();
}

function getArtistTracks(artistName: string): any[] {
	return state.filteredTracks.filter((t) => {
		const meta = t.itunesTrack || t.phoneTrack;
		if (!meta) return false;
		const splitNames = splitAndNormalizeArtist(meta.artist, state.currentSettings.delimiters || [], state.currentSettings.exceptions || []);
		const normalizedTarget = normalizeArtistForIntegration(artistName);
		return splitNames.some((name) => normalizeArtistForIntegration(name) === normalizedTarget);
	});
}

function getAlbumTracks(albumName: string): any[] {
	return state.filteredTracks.filter((t) => {
		const meta = t.itunesTrack || t.phoneTrack;
		return meta && meta.album === albumName;
	});
}

function getGenreTracks(genreName: string): any[] {
	return state.filteredTracks.filter((t) => {
		const meta = t.itunesTrack || t.phoneTrack;
		return meta && meta.genre === genreName;
	});
}

function getTracksOfAlbumsContainingArtist(artistName: string): any[] {
	const artistTracks = getArtistTracks(artistName);
	const albumNames = new Set<string>();
	artistTracks.forEach((t) => {
		const meta = t.itunesTrack || t.phoneTrack;
		if (meta && meta.album) {
			albumNames.add(meta.album);
		}
	});

	return state.filteredTracks.filter((t) => {
		const meta = t.itunesTrack || t.phoneTrack;
		return meta && meta.album && albumNames.has(meta.album);
	});
}

function setupEventListeners() {
	const btnResetChanges = document.getElementById("btn-reset-changes")!;
	btnResetChanges.addEventListener("click", async () => {
		const confirmed = await showCustomConfirm("変更のリセット", "すべてのチェックボックスの選択状態を初期状態（比較直後の状態）に戻しますか？");
		if (confirmed) {
			pushHistoryState();
			resetCheckboxesToDefault();
			applyFilterAndRender();
		}
	});

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
		const target = e.target as Node;
		// If the clicked element is no longer in the document, it was dynamically removed during re-rendering (like the toggle button). Do not close.
		if (!document.body.contains(target)) {
			return;
		}
		if (sortDropdownPanel && !sortDropdownPanel.contains(target) && target !== btnSortToggle) {
			sortDropdownPanel.classList.add("hidden");
			sortDropdownPanel.classList.remove("flex");
		}
	});

	btnSortAddRule.addEventListener("click", (e) => {
		e.stopPropagation();
		state.sortRules.push({ field: "title", direction: "asc", target: "common" });
		saveProfileTabSortRules();
		renderSortRules();
		applyFilterAndRender();
	});

	btnSortClear.addEventListener("click", (e) => {
		e.stopPropagation();
		state.sortRules = [];
		saveProfileTabSortRules();
		renderSortRules();
		applyFilterAndRender();
	});

	const btnSortSaveDefault = document.getElementById("btn-sort-save-default");
	if (btnSortSaveDefault) {
		btnSortSaveDefault.addEventListener("click", (e) => {
			e.stopPropagation();
			if (!state.currentProfileId) return;
			const p = state.profiles.find((x) => x.id === state.currentProfileId);
			if (!p) return;

			if (!p.defaultSortRules) {
				p.defaultSortRules = {};
			}
			p.defaultSortRules[state.activeTab] = JSON.parse(JSON.stringify(state.sortRules));

			api.saveProfile(p).then((updatedProfiles) => {
				state.profiles = updatedProfiles;
				showCustomAlert("デフォルトソート保存", `${elLblActiveTab.textContent}タブの現在のソート設定をデフォルトとして保存しました。`);
			});
		});
	}

	const btnSortRestoreDefault = document.getElementById("btn-sort-restore-default");
	if (btnSortRestoreDefault) {
		btnSortRestoreDefault.addEventListener("click", (e) => {
			e.stopPropagation();
			if (!state.currentProfileId) return;
			const p = state.profiles.find((x) => x.id === state.currentProfileId);
			if (!p) return;

			const defaultRules = p.defaultSortRules && p.defaultSortRules[state.activeTab];
			if (defaultRules) {
				state.sortRules = JSON.parse(JSON.stringify(defaultRules));
				saveProfileTabSortRules();
				renderSortRules();
				applyFilterAndRender();
				showCustomAlert("デフォルトソート復元", `${elLblActiveTab.textContent}タブのデフォルトソート設定を適用しました。`);
			} else {
				showCustomAlert("デフォルト復元", "このタブのデフォルトソート設定がまだ保存されていません。");
			}
		});
	}

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
		if (modalsController && typeof modalsController.setupProfileFields === "function") {
			modalsController.setupProfileFields();
		}
		elModalProfile.classList.remove("hidden");
	});

	elBtnDropdownEditProfile.addEventListener("click", () => {
		const p = state.profiles.find((x) => x.id === state.currentProfileId);
		if (!p) return;
		elProfileModalTitle.textContent = "同期プロファイルの編集";
		elTxtProfileId.value = p.id;
		elTxtProfileName.value = p.name;
		elTxtProfileItunes.value = p.itunesPath;
		elTxtProfilePhone.value = p.storageType === "mtp" || p.storageType === "mtp_powershell" ? "" : p.phonePath;
		if (modalsController && typeof modalsController.setupProfileFields === "function") {
			modalsController.setupProfileFields(p);
		}
		elModalProfile.classList.remove("hidden");
	});

	elBtnDropdownDeleteProfile.addEventListener("click", async () => {
		const p = state.profiles.find((x) => x.id === state.currentProfileId);
		if (!p) return;
		const confirmed = await showCustomConfirm("プロファイルの削除", `プロファイル「${p.name}」を削除してもよろしいですか？`);
		if (confirmed) {
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
			modalsController.loadSettings(state.currentSettings.delimiters || [], state.currentSettings.exceptions || [], state.currentSettings.devMode || false);
		}

		elModalSettings.classList.remove("hidden");
	});

	async function executeScan(forceBypassConfirm = false) {
		if (!state.currentProfileId) return;

		if (!forceBypassConfirm && !elBtnSyncExec.disabled) {
			const confirmed = await showCustomConfirm("比較の再実行確認", "同期可能な変更がありますが、本当に再比較を実行しますか？（現在の選択状態はリセットされます）");
			if (!confirmed) return;
		}

		elProgressModalTitle.textContent = "ライブラリを解析中...";
		elLblProgressStatus.textContent = "比較処理を開始しています...";
		elLblProgressPct.textContent = "0%";
		elLblProgressTime.textContent = "";
		progressStartTime = Date.now();
		elProgressBarFill.style.width = "0%";
		elProgressLogs.innerHTML = "";
		elBtnProgressClose.disabled = true;
		elBtnProgressClose.classList.add("hidden");
		elBtnProgressCancel.disabled = false;
		elBtnProgressCancel.classList.remove("hidden");
		elModalProgress.classList.remove("hidden");

		const cancelProgress = api.onScanProgress((progress: any) => {
			elLblProgressStatus.textContent = progress.message || "処理中...";
			updateProgressTimeAndPct(progress.progress);
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

			// Clear stats summary and index map caches on scan or profile load
			clearStatsSummaryCache();
			clearIndexMapsCache();

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
			if (e.message && e.message.includes("キャンセル")) {
				await showCustomAlert("処理中断", "比較処理を中断しました。");
			} else {
				await showCustomAlert("スキャンエラー", "スキャン中にエラーが発生しました: " + e.message);
			}
			elModalProgress.classList.add("hidden");
		}
	}

	elBtnScan.addEventListener("click", () => {
		executeScan(false);
	});

	elBtnSyncExec.addEventListener("click", () => {
		if (!state.currentProfileId) return;

		const copyCount = state.checkedCopyTrackIds.size;
		const moveCount = state.checkedMoveTrackIds.size;
		const deleteItunesCount = state.scannedTracks.filter((t) => (t.status === "synced" || t.status === "updated") && state.checkedDeleteTrackIds.has(t.id)).length;
		const deletePhoneOnlyCount = state.scannedTracks.filter((t) => t.status === "phone_only" && state.checkedDeleteTrackIds.has(t.id)).length;

		const getUniqueAlbumsCount = (trackFilter: (t: ScanResultItem) => boolean) => {
			const albums = new Set<string>();
			state.scannedTracks.forEach((t) => {
				if (trackFilter(t)) {
					const meta = t.itunesTrack || t.phoneTrack;
					if (meta && meta.album) {
						albums.add(meta.album);
					} else {
						albums.add("Unknown Album");
					}
				}
			});
			return albums.size;
		};

		const copyAlbums = getUniqueAlbumsCount((t) => (t.status === "missing" || t.status === "updated") && state.checkedCopyTrackIds.has(t.id));
		const moveAlbums = getUniqueAlbumsCount((t) => t.pathMismatch && (t.status === "synced" || t.status === "updated") && state.checkedMoveTrackIds.has(t.id));
		const deleteItunesAlbums = getUniqueAlbumsCount((t) => (t.status === "synced" || t.status === "updated") && state.checkedDeleteTrackIds.has(t.id));
		const deletePhoneOnlyAlbums = getUniqueAlbumsCount((t) => t.status === "phone_only" && state.checkedDeleteTrackIds.has(t.id));

		document.getElementById("lbl-confirm-copy-count")!.innerHTML = `${copyCount} 件 <span class="text-gray-500 font-normal ml-1">(${copyAlbums} アルバム)</span>`;
		document.getElementById("lbl-confirm-move-count")!.innerHTML = `${moveCount} 件 <span class="text-gray-500 font-normal ml-1">(${moveAlbums} アルバム)</span>`;
		document.getElementById("lbl-confirm-delete-itunes-count")!.innerHTML = `${deleteItunesCount} 件 <span class="text-gray-500 font-normal ml-1">(${deleteItunesAlbums} アルバム)</span>`;
		document.getElementById("lbl-confirm-delete-count")!.innerHTML = `${deletePhoneOnlyCount} 件 <span class="text-gray-500 font-normal ml-1">(${deletePhoneOnlyAlbums} アルバム)</span>`;

		let deltaSize = 0;
		let deltaDuration = 0;
		let currentPhoneSize = 0;
		let currentPhoneDuration = 0;

		state.scannedTracks.forEach((t) => {
			if (t.status !== "missing") {
				currentPhoneSize += t.phoneTrack?.size ?? 0;
				currentPhoneDuration += t.phoneTrack?.duration ?? 0;
			}

			if (t.status === "missing" && state.checkedCopyTrackIds.has(t.id)) {
				deltaSize += t.itunesTrack?.size ?? 0;
				deltaDuration += t.itunesTrack?.duration ?? 0;
			} else if (t.status === "updated" && state.checkedCopyTrackIds.has(t.id)) {
				deltaSize += (t.itunesTrack?.size ?? 0) - (t.phoneTrack?.size ?? 0);
				deltaDuration += (t.itunesTrack?.duration ?? 0) - (t.phoneTrack?.duration ?? 0);
			}

			// Deleted tracks
			const isDeleted = state.checkedDeleteTrackIds.has(t.id);
			if (isDeleted && (t.status === "synced" || t.status === "updated" || t.status === "phone_only")) {
				deltaSize -= t.phoneTrack?.size ?? 0;
				deltaDuration -= t.phoneTrack?.duration ?? 0;
			}
		});

		const afterPhoneSize = Math.max(0, currentPhoneSize + deltaSize);
		const afterPhoneDuration = Math.max(0, currentPhoneDuration + deltaDuration);

		document.getElementById("lbl-confirm-delta-size")!.innerHTML = `${formatDeltaBytes(deltaSize)} <span class="text-[10px] text-gray-400 font-sans ml-1">(増減後: ${formatBytes(afterPhoneSize)})</span>`;
		document.getElementById("lbl-confirm-delta-duration")!.innerHTML = `${formatDeltaDurationHHMMSS(deltaDuration)} <span class="text-[10px] text-gray-400 font-sans ml-1">(増減後: ${formatDurationHHMMSS(afterPhoneDuration)})</span>`;

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
		executeScan(true);
	});

	elBtnProgressCancel.addEventListener("click", async () => {
		const confirmed = await showCustomConfirm("処理の中断", "現在実行中の処理を中断してもよろしいですか？");
		if (confirmed) {
			elBtnProgressCancel.disabled = true;
			elLblProgressStatus.textContent = "処理を中断中...";
			await api.cancelActiveTask();
			// Re-enable close button and hide cancel button
			elBtnProgressClose.disabled = false;
			elBtnProgressClose.classList.remove("hidden");
			elBtnProgressCancel.classList.add("hidden");
		}
	});

	let searchDebounceTimeout: any = null;
	let isComposing = false;

	const showPredictionsIfQuery = () => {
		const query = elTxtSearch.value.trim().toLowerCase();
		if (query.length >= 1) {
			state.searchQuery = query;
			renderSearchCombobox();
		} else {
			renderSearchHistory();
		}
	};

	elBtnSearchClear.addEventListener("click", (e) => {
		e.stopPropagation();
		elTxtSearch.value = "";
		state.searchQuery = "";
		elBtnSearchClear.classList.add("hidden");
		elSearchCombobox.classList.add("hidden");
		applyFilterAndRender();
	});

	elTxtSearch.addEventListener("compositionstart", () => {
		isComposing = true;
	});

	elTxtSearch.addEventListener("compositionend", () => {
		isComposing = false;
		// Immediately fire query update on composition end
		const query = elTxtSearch.value.trim().toLowerCase();
		state.searchQuery = query;

		if (query.length >= 1) {
			elBtnSearchClear.classList.remove("hidden");
		} else {
			elBtnSearchClear.classList.add("hidden");
		}

		if (searchDebounceTimeout) {
			clearTimeout(searchDebounceTimeout);
		}

		applyFilterAndRender();
		if (state.searchQuery.length >= 1) {
			renderSearchCombobox();
			addSearchHistory(state.searchQuery);
		} else {
			renderSearchHistory();
		}
	});

	elTxtSearch.addEventListener("input", () => {
		if (isComposing) {
			// Do absolutely nothing during IME composition
			return;
		}

		const query = elTxtSearch.value.trim().toLowerCase();
		state.searchQuery = query;

		if (query.length >= 1) {
			elBtnSearchClear.classList.remove("hidden");
			elSearchCombobox.innerHTML = `
				<div class="flex items-center justify-center space-x-2 py-4 text-gray-400 font-medium">
					<i class="icon-refresh-cw animate-spin text-indigo-400"></i>
					<span>検索中...</span>
				</div>
			`;
			elSearchCombobox.classList.remove("hidden");
		} else {
			elBtnSearchClear.classList.add("hidden");
			renderSearchHistory();
		}

		if (searchDebounceTimeout) {
			clearTimeout(searchDebounceTimeout);
		}

		searchDebounceTimeout = setTimeout(() => {
			if (isComposing) return;
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
			state.tabScrollPositions.track = vsViewport.scrollTop;
			renderVirtualTracks(vsViewport, vsCanvas, vsContent, {
				updateSummaryBar,
				updateMasterCheckboxState,
			});
		}
	});

	window.addEventListener("keydown", (e) => {
		if (e.key === "Escape") {
			const modalDetail = document.getElementById("modal-detail");
			if (modalDetail && !modalDetail.classList.contains("hidden")) {
				modalDetail.classList.add("hidden");
				return;
			}
		}

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

	window.addEventListener(
		"keydown",
		(e) => {
			if ((e.ctrlKey && e.key.toLowerCase() === "r") || e.key === "F5") {
				e.preventDefault();
				e.stopPropagation();
			}
		},
		true,
	);

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
		const artistRow = (e.target as HTMLElement).closest(".context-artist");
		const genreRow = (e.target as HTMLElement).closest(".context-genre");

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

			const albumTracks = getAlbumTracks(album);
			const allChecked = albumTracks.length > 0 && albumTracks.every((t) => isTrackChecked(t));
			const noneChecked = albumTracks.length > 0 && albumTracks.every((t) => !isTrackChecked(t));

			api.showContextMenu({
				artist,
				artists,
				album,
				genre,
				albumSelectionState: {
					canSelectAll: !allChecked,
					canDeselectAll: !noneChecked,
				},
			});
		} else if (artistRow) {
			e.preventDefault();
			const artistName = artistRow.getAttribute("data-artist") || "";

			const artistTracks = getArtistTracks(artistName);
			const artistAllChecked = artistTracks.length > 0 && artistTracks.every((t) => isTrackChecked(t));
			const artistNoneChecked = artistTracks.length > 0 && artistTracks.every((t) => !isTrackChecked(t));

			const containingAlbumTracks = getTracksOfAlbumsContainingArtist(artistName);
			const albumsAllChecked = containingAlbumTracks.length > 0 && containingAlbumTracks.every((t) => isTrackChecked(t));
			const albumsNoneChecked = containingAlbumTracks.length > 0 && containingAlbumTracks.every((t) => !isTrackChecked(t));

			api.showContextMenu({
				artist: artistName,
				artistSelectionState: {
					canSelectAll: !artistAllChecked,
					canDeselectAll: !artistNoneChecked,
					canSelectAllAlbums: !albumsAllChecked,
					canDeselectAllAlbums: !albumsNoneChecked,
				},
			});
		} else if (genreRow) {
			e.preventDefault();
			const genreName = genreRow.getAttribute("data-genre") || "";

			const genreTracks = getGenreTracks(genreName);
			const genreAllChecked = genreTracks.length > 0 && genreTracks.every((t) => isTrackChecked(t));
			const genreNoneChecked = genreTracks.length > 0 && genreTracks.every((t) => !isTrackChecked(t));

			api.showContextMenu({
				genre: genreName,
				genreSelectionState: {
					canSelectAll: !genreAllChecked,
					canDeselectAll: !genreNoneChecked,
				},
			});
		}
	});

	document.addEventListener("click", (e) => {
		const playBtn = (e.target as HTMLElement).closest(".track-play-btn") as HTMLElement;
		if (playBtn) {
			e.stopPropagation();
			e.preventDefault();
			const row = playBtn.closest(".track-row, .vs-row") as HTMLElement;
			const trackId = row ? row.getAttribute("data-track-id") : null;
			const rowKey = playBtn.getAttribute("data-row-key");
			if (trackId && rowKey) {
				const track = state.scannedTracks.find((x) => x.id === trackId);
				if (track && typeof (window as any).playTrackWithRowKey === "function") {
					(window as any).playTrackWithRowKey(track, rowKey);
				}
			}
			return;
		}

		const pauseBtn = (e.target as HTMLElement).closest(".track-pause-btn") as HTMLElement;
		if (pauseBtn) {
			e.stopPropagation();
			e.preventDefault();
			if (typeof (window as any).togglePlayPause === "function") {
				(window as any).togglePlayPause();
			}
			return;
		}
	});

	document.addEventListener("mouseover", (e) => {
		const row = (e.target as HTMLElement).closest(".track-row, .vs-row") as HTMLElement;
		if (row) {
			if (typeof (window as any).updateTrackRowButtons === "function") {
				(window as any).updateTrackRowButtons(row);
			}
		}
	});

	document.addEventListener("mouseout", (e) => {
		const row = (e.target as HTMLElement).closest(".track-row, .vs-row") as HTMLElement;
		if (row) {
			if (typeof (window as any).updateTrackRowButtons === "function") {
				(window as any).updateTrackRowButtons(row);
			}
		}
	});
}

function startSyncExecution() {
	if (!state.currentProfileId) return;

	elProgressModalTitle.textContent = "同期実行処理中...";
	elLblProgressStatus.textContent = "同期処理を実行しています...";
	elLblProgressPct.textContent = "0%";
	elLblProgressTime.textContent = "";
	progressStartTime = Date.now();
	elProgressBarFill.style.width = "0%";
	elProgressLogs.innerHTML = "";
	elBtnProgressClose.disabled = true;
	elBtnProgressClose.classList.add("hidden");
	elBtnProgressCancel.disabled = false;
	elBtnProgressCancel.classList.remove("hidden");
	elModalProgress.classList.remove("hidden");

	const copyTrackIds = Array.from(state.checkedCopyTrackIds);
	const moveTrackIds = Array.from(state.checkedMoveTrackIds);
	const deleteTrackIds = [...state.scannedTracks.filter((t) => t.status === "phone_only" && state.checkedDeleteTrackIds.has(t.id)).map((t) => t.id), ...Array.from(state.checkedDeleteItunesTrackIds)];

	const cancelProgress = api.onSyncProgress((progress: any) => {
		elLblProgressStatus.textContent = progress.message;
		updateProgressTimeAndPct(progress.progress);
		elProgressBarFill.style.width = `${progress.progress}%`;

		elProgressLogs.innerHTML = "";
		if (progress.logs) {
			progress.logs.forEach((log: string) => {
				const logItem = document.createElement("div");
				logItem.className = "py-0.5 border-b border-gray-800 text-gray-300 font-mono select-text";

				if (/^(コピー成功|移動成功|削除成功|整合性チェック成功)/.test(log)) {
					logItem.classList.add("text-green-400");
				} else if (/^(コピー失敗|移動失敗|削除失敗|エラー|致命的なエラー|⚠️)/.test(log)) {
					logItem.classList.add("text-red-400");
				} else if (/^(警告)/.test(log)) {
					logItem.classList.add("text-amber-400");
				}

				logItem.textContent = log;
				elProgressLogs.appendChild(logItem);
			});
			elProgressLogs.scrollTop = elProgressLogs.scrollHeight;
		}

		if (progress.status === "done" || progress.status === "error") {
			elBtnProgressClose.disabled = false;
			elBtnProgressClose.classList.remove("hidden");
			elBtnProgressCancel.classList.add("hidden");
		}
	});

	api.executeSync(state.currentProfileId, {
		copyTrackIds,
		moveTrackIds,
		deleteTrackIds,
	})
		.then((result: any) => {
			const failedTrackIds = result?.failedTrackIds || [];
			if (failedTrackIds.length > 0) {
				setTimeout(() => {
					showRetryFailedModal(failedTrackIds, copyTrackIds, moveTrackIds);
				}, 500);
			} else {
				if (isMock) {
					setTimeout(() => {
						elBtnProgressClose.disabled = false;
						elBtnProgressClose.classList.remove("hidden");
						elBtnProgressCancel.classList.add("hidden");
					}, 600);
				} else {
					elBtnProgressClose.disabled = false;
					elBtnProgressClose.classList.remove("hidden");
					elBtnProgressCancel.classList.add("hidden");
				}
			}
		})
		.catch(async (e: any) => {
			console.error("Error during sync execution:", e);
			cancelProgress();
			elBtnProgressClose.disabled = false;
			elBtnProgressClose.classList.remove("hidden");
			elBtnProgressCancel.classList.add("hidden");
			if (e.message && e.message.includes("キャンセル")) {
				await showCustomAlert("処理中断", "同期処理を中断しました。書き込み途中の破損ファイルがある場合は自動クリーンアップされます。");
			} else {
				await showCustomAlert("同期エラー", "同期処理中に重大なエラーが発生しました: " + e.message);
			}
		});
}

function showRetryFailedModal(failedTrackIds: string[], originalCopyTrackIds: string[], originalMoveTrackIds: string[]) {
	const elModalRetryFailedConfirm = document.getElementById("modal-retry-failed-confirm")!;
	const elLblRetryFailedCount = document.getElementById("lbl-retry-failed-count")!;
	const elChkModalRetryFailedMaster = document.getElementById("chk-modal-retry-failed-master") as HTMLInputElement;
	const elRetryFailedTargetList = document.getElementById("retry-failed-target-list")!;
	const elBtnRetryFailedCancel = document.getElementById("btn-retry-failed-cancel")!;
	const elBtnRetryFailedConfirmSubmit = document.getElementById("btn-retry-failed-confirm-submit")!;

	elLblRetryFailedCount.textContent = String(failedTrackIds.length);
	elRetryFailedTargetList.innerHTML = "";
	elChkModalRetryFailedMaster.checked = true;

	const selectedRetryTrackIds = new Set<string>(failedTrackIds);

	failedTrackIds.forEach((id) => {
		const item = state.scannedTracks.find((x) => x.id === id);
		if (!item) return;

		const meta = item.itunesTrack || item.phoneTrack;
		if (!meta) return;

		const row = document.createElement("div");
		row.className = "py-2 flex items-center justify-between text-xxs hover:bg-gray-900/60 gap-3 border-b border-gray-800";

		row.innerHTML = `
			<label for="chk-modal-retry-${id}" class="flex items-center space-x-2 flex-1 min-w-0 cursor-pointer select-none">
				<input type="checkbox" id="chk-modal-retry-${id}" class="chk-modal-retry-item rounded bg-gray-700 border-gray-650 text-red-500 focus:ring-red-400 h-3.5 w-3.5" checked>
				<div class="truncate flex-1">
					<div class="font-semibold text-gray-200">${meta.artist || "Unknown"} - ${meta.title || "Unknown"}</div>
					<div class="text-gray-500 truncate font-mono text-[10px]">${meta.relativePath || ""}</div>
				</div>
			</label>
		`;
		elRetryFailedTargetList.appendChild(row);

		const chk = document.getElementById(`chk-modal-retry-${id}`) as HTMLInputElement;
		chk.addEventListener("change", () => {
			if (chk.checked) {
				selectedRetryTrackIds.add(id);
			} else {
				selectedRetryTrackIds.delete(id);
			}
			let allChecked = true;
			elRetryFailedTargetList.querySelectorAll(".chk-modal-retry-item").forEach((el: any) => {
				if (!el.checked) allChecked = false;
			});
			elChkModalRetryFailedMaster.checked = allChecked;
		});
	});

	const onMasterChange = () => {
		const isChecked = elChkModalRetryFailedMaster.checked;
		elRetryFailedTargetList.querySelectorAll(".chk-modal-retry-item").forEach((el: any) => {
			el.checked = isChecked;
			const id = el.id.substring("chk-modal-retry-".length);
			if (isChecked) {
				selectedRetryTrackIds.add(id);
			} else {
				selectedRetryTrackIds.delete(id);
			}
		});
	};
	elChkModalRetryFailedMaster.onclick = onMasterChange;

	const onCancel = () => {
		elModalRetryFailedConfirm.classList.add("hidden");
		elBtnProgressClose.disabled = false;
		elBtnProgressClose.classList.remove("hidden");
		elBtnProgressCancel.classList.add("hidden");
	};
	elBtnRetryFailedCancel.onclick = onCancel;

	const onSubmit = () => {
		elModalRetryFailedConfirm.classList.add("hidden");

		state.checkedCopyTrackIds = new Set(originalCopyTrackIds.filter((id) => selectedRetryTrackIds.has(id)));
		state.checkedMoveTrackIds = new Set(originalMoveTrackIds.filter((id) => selectedRetryTrackIds.has(id)));
		state.checkedDeleteTrackIds.clear();
		state.checkedDeleteItunesTrackIds.clear();

		elModalProgress.classList.add("hidden");
		startSyncExecution();
	};
	elBtnRetryFailedConfirmSubmit.onclick = onSubmit;

	elModalRetryFailedConfirm.classList.remove("hidden");
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
		{ val: "title", label: "曲名" },
		{ val: "artist", label: "アーティスト" },
		{ val: "album", label: "アルバム" },
		{ val: "albumartist", label: "アルバムアーティスト" },
		{ val: "genre", label: "ジャンル" },
		{ val: "composer", label: "作曲者" },
		{ val: "year", label: "発売年" },
		{ val: "track", label: "トラック" },
		{ val: "size", label: "ファイルサイズ" },
		{ val: "duration", label: "再生時間" },
		{ val: "relativePath", label: "相対パス" },
		{ val: "status", label: "ステータス" },
	];

	const targets = [
		{ val: "common", label: "共通" },
		{ val: "group", label: "グループ" },
		{ val: "track", label: "個別曲" },
	];

	state.sortRules.forEach((rule, idx) => {
		const row = document.createElement("div");
		row.className = "flex items-center space-x-1.5 bg-gray-900/50 p-1.5 rounded border border-gray-750 gap-1.5";

		// 1. Priority Indicator / Index
		const priorityLabel = document.createElement("span");
		priorityLabel.className = "text-[10px] text-gray-500 font-mono w-4 text-center select-none";
		priorityLabel.textContent = `${idx + 1}`;
		row.appendChild(priorityLabel);

		// 2. Target Select (common, group, track)
		const selTarget = document.createElement("select");
		selTarget.className = "bg-gray-800 text-white rounded px-1 px-0.5 border border-gray-650 focus:outline-none font-semibold text-[10px] shrink-0";
		selTarget.style.width = "72px";
		targets.forEach((t) => {
			const opt = document.createElement("option");
			opt.value = t.val;
			opt.textContent = t.label;
			if ((rule.target || "common") === t.val) opt.selected = true;
			selTarget.appendChild(opt);
		});
		selTarget.addEventListener("change", () => {
			rule.target = selTarget.value as "common" | "group" | "track";
			saveProfileTabSortRules();
			applyFilterAndRender();
		});
		row.appendChild(selTarget);

		// 3. Select Field
		const selField = document.createElement("select");
		selField.className = "bg-gray-800 text-white rounded px-1.5 py-0.5 border border-gray-650 focus:outline-none flex-1 font-semibold text-[10px] min-w-0";
		selField.style.minWidth = "120px";
		fields.forEach((f) => {
			const opt = document.createElement("option");
			opt.value = f.val;
			opt.textContent = f.label;
			if (rule.field === f.val) opt.selected = true;
			selField.appendChild(opt);
		});
		selField.addEventListener("change", () => {
			rule.field = selField.value;
			saveProfileTabSortRules();
			renderSortRules();
			applyFilterAndRender();
		});
		row.appendChild(selField);

		// 4. Direction Toggle Button
		const isNumericField = ["year", "track", "size", "duration"].includes(rule.field);
		const toggleBtn = document.createElement("button");
		toggleBtn.type = "button";
		toggleBtn.className = "w-8 h-6 flex items-center justify-center rounded border border-gray-650 bg-gray-800 text-[9px] font-bold text-indigo-400 hover:bg-gray-700 active:scale-95 transition cursor-pointer shrink-0";
		toggleBtn.textContent = rule.direction === "asc" ? (isNumericField ? "0→9" : "A→Z") : isNumericField ? "9→0" : "Z→A";
		toggleBtn.title = rule.direction === "asc" ? "昇順 (クリックで降順に変更)" : "降順 (クリックで昇順に変更)";
		toggleBtn.addEventListener("click", () => {
			rule.direction = rule.direction === "asc" ? "desc" : "asc";
			saveProfileTabSortRules();
			renderSortRules();
			applyFilterAndRender();
		});
		row.appendChild(toggleBtn);

		// 5. Move Up / Move Down buttons
		const moveBtnContainer = document.createElement("div");
		moveBtnContainer.className = "flex flex-col space-y-0.5 shrink-0";

		const btnUp = document.createElement("button");
		btnUp.className = `text-[8px] text-gray-500 hover:text-white transition focus:outline-none px-0.5 ${idx === 0 ? "opacity-30 pointer-events-none" : ""}`;
		btnUp.innerHTML = "▲";
		btnUp.addEventListener("click", (e) => {
			e.stopPropagation();
			const tmp = state.sortRules[idx];
			state.sortRules[idx] = state.sortRules[idx - 1];
			state.sortRules[idx - 1] = tmp;
			saveProfileTabSortRules();
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
			saveProfileTabSortRules();
			renderSortRules();
			applyFilterAndRender();
		});
		moveBtnContainer.appendChild(btnDown);

		row.appendChild(moveBtnContainer);

		// 6. Delete Button
		const btnDel = document.createElement("button");
		btnDel.className = "text-gray-500 hover:text-red-400 transition focus:outline-none px-1 py-0.5 shrink-0";
		btnDel.innerHTML = '<i class="icon-trash-2 text-[10px]"></i>';
		btnDel.addEventListener("click", (e) => {
			e.stopPropagation();
			state.sortRules.splice(idx, 1);
			saveProfileTabSortRules();
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
		const targetFilters = ["missing", "updated", "synced", "phone_only"];
		const allEnabled = targetFilters.every((f) => state.activeStatusFilters.has(f));
		if (allEnabled) {
			targetFilters.forEach((f) => state.activeStatusFilters.delete(f));
		} else {
			targetFilters.forEach((f) => state.activeStatusFilters.add(f));
		}
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

function saveProfileTabSortRules() {
	if (!state.currentProfileId) return;
	const p = state.profiles.find((x) => x.id === state.currentProfileId);
	if (!p) return;

	state.tabSortRules[state.activeTab] = JSON.parse(JSON.stringify(state.sortRules));
	p.tabSortRules = JSON.parse(JSON.stringify(state.tabSortRules));

	api.saveProfile(p).then((updatedProfiles) => {
		state.profiles = updatedProfiles;
	});
}

// ==========================================
// 【プレビュー・プレイヤー機能 / PREVIEW PLAYER CONTROLLER】
// ==========================================
let audioElement: HTMLAudioElement | null = null;
let currentPlayingTrack: ScanResultItem | null = null;
let currentPlaylist: ScanResultItem[] = [];
let currentPlaylistIndex = -1;
let loopMode: "once" | "loop" | "advance" = "once";

const SKIP_TICK_INTERVAL_MS = 200;
const SKIP_AMOUNT_SECONDS = 5;

let holdTimer: any = null;
let tickTimer: any = null;
let isHoldingAction = false;

function updateVolumeIconUI(vol: number) {
	const iconVolume = document.getElementById("icon-player-volume")!;
	if (!iconVolume) return;

	if (vol === 0) {
		iconVolume.className = "icon-volume-x text-xs text-gray-500";
	} else if (vol < 0.5) {
		iconVolume.className = "icon-volume-1 text-xs text-indigo-400";
	} else {
		iconVolume.className = "icon-volume-2 text-xs text-indigo-400";
	}
}

function setupPlayerEventListeners() {
	const btnPlay = document.getElementById("btn-player-play")!;
	const btnLoop = document.getElementById("btn-player-loop")!;
	const seekbar = document.getElementById("player-seekbar") as HTMLInputElement;

	const btnVolume = document.getElementById("btn-player-volume")!;
	const volumeInput = document.getElementById("player-volume") as HTMLInputElement;
	const popover = document.getElementById("volume-popover")!;
	const tooltip = document.getElementById("player-volume-tooltip")!;

	btnPlay.addEventListener("click", () => {
		togglePlayPause();
	});

	btnLoop.addEventListener("click", () => {
		toggleLoopMode();
	});

	seekbar.addEventListener("input", () => {
		if (audioElement && !isNaN(audioElement.duration)) {
			const pct = parseFloat(seekbar.value);
			audioElement.currentTime = (pct / 100) * audioElement.duration;
		}
	});

	if (btnVolume && volumeInput && popover) {
		volumeInput.addEventListener("input", () => {
			const vol = parseFloat(volumeInput.value);
			if (audioElement) {
				audioElement.volume = vol;
			}
			updateVolumeIconUI(vol);
			if (tooltip) {
				tooltip.textContent = String(Math.round(vol * 100));
			}
		});

		volumeInput.addEventListener("change", () => {
			saveProfilePlaybackSettings();
		});

		btnVolume.addEventListener("click", (e) => {
			e.stopPropagation();
			popover.classList.toggle("hidden");
		});

		popover.addEventListener("click", (e) => {
			e.stopPropagation();
		});

		document.addEventListener("click", (e) => {
			if (popover && !popover.contains(e.target as Node) && e.target !== btnVolume) {
				popover.classList.add("hidden");
			}
		});

		// Set initial icon and tooltip state
		const initialVol = parseFloat(volumeInput.value);
		updateVolumeIconUI(initialVol);
		if (tooltip) {
			tooltip.textContent = String(Math.round(initialVol * 100));
		}
	}

	setupLongPressHandlers();

	const showPlayerContextMenu = (e: MouseEvent) => {
		if (!currentPlayingTrack) return;
		e.preventDefault();

		const meta = currentPlayingTrack.itunesTrack || currentPlayingTrack.phoneTrack;
		if (!meta) return;

		const trackId = currentPlayingTrack.id;
		const title = meta.title || "";
		const artist = meta.artist || "";
		const album = meta.album || "";
		const genre = meta.genre || "";

		const artists = splitAndNormalizeArtist(artist, state.currentSettings.delimiters || [], state.currentSettings.exceptions || []);

		api.showContextMenu({
			trackId,
			title,
			artist,
			artists,
			album,
			genre,
			itunesFilePath: currentPlayingTrack.itunesTrack?.filePath,
			phoneFilePath: currentPlayingTrack.phoneTrack?.filePath,
			isPlayer: true,
		});
	};

	const playerArtContainer = document.getElementById("player-album-art-container");
	const playerTitle = document.getElementById("player-title");
	const playerArtist = document.getElementById("player-artist");

	if (playerArtContainer) playerArtContainer.addEventListener("contextmenu", showPlayerContextMenu);
	if (playerTitle) playerTitle.addEventListener("contextmenu", showPlayerContextMenu);
	if (playerArtist) playerArtist.addEventListener("contextmenu", showPlayerContextMenu);
}

function setupLongPressHandlers() {
	const btnPrev = document.getElementById("btn-player-prev")!;
	const btnNext = document.getElementById("btn-player-next")!;
	const iconPrev = document.getElementById("icon-player-prev")!;
	const iconNext = document.getElementById("icon-player-next")!;

	// --- PREV BUTTON ---
	btnPrev.addEventListener("mousedown", (e) => {
		if (e.button !== 0) return;
		isHoldingAction = false;

		holdTimer = setTimeout(() => {
			isHoldingAction = true;
			iconPrev.className = "icon-rewind text-xs"; // Change icon to rewind

			tickTimer = setInterval(() => {
				if (audioElement) {
					audioElement.currentTime = Math.max(0, audioElement.currentTime - SKIP_AMOUNT_SECONDS);
				}
			}, SKIP_TICK_INTERVAL_MS);
		}, 500);
	});

	const clearPrevHold = () => {
		if (holdTimer) {
			clearTimeout(holdTimer);
			holdTimer = null;
		}
		if (tickTimer) {
			clearInterval(tickTimer);
			tickTimer = null;
		}
		iconPrev.className = "icon-skip-back text-xs"; // Restore default icon
	};

	btnPrev.addEventListener("mouseup", (e) => {
		if (e.button !== 0) return;
		if (!isHoldingAction) {
			playPrevTrack();
		}
		clearPrevHold();
		isHoldingAction = false;
	});

	btnPrev.addEventListener("mouseleave", () => {
		if (isHoldingAction) {
			clearPrevHold();
			isHoldingAction = false;
		} else {
			clearTimeout(holdTimer);
			holdTimer = null;
		}
	});

	// --- NEXT BUTTON ---
	btnNext.addEventListener("mousedown", (e) => {
		if (e.button !== 0) return;
		isHoldingAction = false;

		holdTimer = setTimeout(() => {
			isHoldingAction = true;
			iconNext.className = "icon-fast-forward text-xs"; // Change icon to fast-forward

			tickTimer = setInterval(() => {
				if (audioElement && !isNaN(audioElement.duration)) {
					audioElement.currentTime = Math.min(audioElement.duration - 0.5, audioElement.currentTime + SKIP_AMOUNT_SECONDS);
				}
			}, SKIP_TICK_INTERVAL_MS);
		}, 500);
	});

	const clearNextHold = () => {
		if (holdTimer) {
			clearTimeout(holdTimer);
			holdTimer = null;
		}
		if (tickTimer) {
			clearInterval(tickTimer);
			tickTimer = null;
		}
		iconNext.className = "icon-skip-forward text-xs"; // Restore default icon
	};

	btnNext.addEventListener("mouseup", (e) => {
		if (e.button !== 0) return;
		if (!isHoldingAction) {
			playNextTrack();
		}
		clearNextHold();
		isHoldingAction = false;
	});

	btnNext.addEventListener("mouseleave", () => {
		if (isHoldingAction) {
			clearNextHold();
			isHoldingAction = false;
		} else {
			clearTimeout(holdTimer);
			holdTimer = null;
		}
	});
}

let currentPlaylistRowKeys: string[] = [];

function getActiveTabPlaylist(): { playlist: ScanResultItem[]; rowKeys: string[] } {
	const playlist: ScanResultItem[] = [];
	const rowKeys: string[] = [];

	if (state.activeTab === "track") {
		state.filteredTracks.forEach((t) => {
			playlist.push(t);
			rowKeys.push(`chk-track-table-${t.id}`);
		});
		return { playlist, rowKeys };
	}

	if (state.activeTab === "artist") {
		const artistMap = new Map<string, { displayName: string; tracks: ScanResultItem[] }>();
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
			const nameA = artistMap.get(keyA)!.displayName;
			const nameB = artistMap.get(keyB)!.displayName;
			return compareGroups(tracksA, tracksB, state.sortRules, nameA, nameB);
		});

		sortedArtistKeys.forEach((normalizedKey) => {
			const group = artistMap.get(normalizedKey)!;
			const artistName = group.displayName;
			const artistTracks = group.tracks;

			const albumMap = new Map<string, ScanResultItem[]>();
			artistTracks.forEach((t) => {
				const meta = t.itunesTrack || t.phoneTrack;
				const albumName = (meta && meta.album) || "Unknown Album";
				if (!albumMap.has(albumName)) albumMap.set(albumName, []);
				albumMap.get(albumName)!.push(t);
			});

			const sortedAlbums = Array.from(albumMap.keys()).sort((a, b) => {
				const tracksA = albumMap.get(a)!;
				const tracksB = albumMap.get(b)!;
				return compareGroups(tracksA, tracksB, state.sortRules, a, b);
			});

			sortedAlbums.forEach((albumName) => {
				const albumTracks = albumMap.get(albumName)!;
				albumTracks.sort((a, b) => compareTracks(a, b, state.sortRules));

				const albumKey = getSafeId("artistalbum", artistName + "_" + albumName);
				const maxDisc = albumTracks.reduce((max, t) => {
					const meta = t.itunesTrack || t.phoneTrack;
					const discNum = parseInt(meta?.disc || "1", 10) || 1;
					return Math.max(max, discNum);
				}, 1);
				const hasMultipleDiscs = maxDisc >= 2;

				albumTracks.forEach((t) => {
					const meta = t.itunesTrack || t.phoneTrack;
					const discNum = parseInt(meta?.disc || "1", 10) || 1;
					const rowKey = hasMultipleDiscs ? `chk-track-${albumKey}-${discNum}-${t.id}` : `chk-track-${albumKey}-${t.id}`;

					playlist.push(t);
					rowKeys.push(rowKey);
				});
			});
		});
	} else if (state.activeTab === "album") {
		const albumMap = new Map<string, ScanResultItem[]>();
		state.filteredTracks.forEach((t) => {
			const meta = t.itunesTrack || t.phoneTrack;
			const albumName = (meta && meta.album) || "Unknown Album";
			if (!albumMap.has(albumName)) albumMap.set(albumName, []);
			albumMap.get(albumName)!.push(t);
		});

		const sortedAlbums = Array.from(albumMap.keys()).sort((a, b) => {
			const tracksA = albumMap.get(a)!;
			const tracksB = albumMap.get(b)!;
			return compareGroups(tracksA, tracksB, state.sortRules, a, b);
		});

		sortedAlbums.forEach((albumName) => {
			const albumTracks = albumMap.get(albumName)!;
			albumTracks.sort((a, b) => compareTracks(a, b, state.sortRules));

			const albumKey = getSafeId("album", albumName);
			const maxDisc = albumTracks.reduce((max, t) => {
				const meta = t.itunesTrack || t.phoneTrack;
				const discNum = parseInt(meta?.disc || "1", 10) || 1;
				return Math.max(max, discNum);
			}, 1);
			const hasMultipleDiscs = maxDisc >= 2;

			albumTracks.forEach((t) => {
				const meta = t.itunesTrack || t.phoneTrack;
				const discNum = parseInt(meta?.disc || "1", 10) || 1;
				const rowKey = hasMultipleDiscs ? `chk-track-${albumKey}-${discNum}-${t.id}` : `chk-track-${albumKey}-${t.id}`;

				playlist.push(t);
				rowKeys.push(rowKey);
			});
		});
	} else if (state.activeTab === "genre") {
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
			return compareGroups(tracksA, tracksB, state.sortRules, a, b);
		});

		sortedGenres.forEach((genreName) => {
			const genreTracks = genreMap.get(genreName)!;
			genreTracks.sort((a, b) => compareTracks(a, b, state.sortRules));

			const genreKey = getSafeId("genre", genreName);
			const maxDisc = genreTracks.reduce((max, t) => {
				const meta = t.itunesTrack || t.phoneTrack;
				const discNum = parseInt(meta?.disc || "1", 10) || 1;
				return Math.max(max, discNum);
			}, 1);
			const hasMultipleDiscs = maxDisc >= 2;

			genreTracks.forEach((t) => {
				const meta = t.itunesTrack || t.phoneTrack;
				const discNum = parseInt(meta?.disc || "1", 10) || 1;
				const rowKey = hasMultipleDiscs ? `chk-track-${genreKey}-${discNum}-${t.id}` : `chk-track-${genreKey}-${t.id}`;

				playlist.push(t);
				rowKeys.push(rowKey);
			});
		});
	}

	return { playlist, rowKeys };
}

function playTrack(track: ScanResultItem, preferredRowKey?: string) {
	// Snapshot the current active tab's playlist state at the moment of playing
	const res = getActiveTabPlaylist();
	currentPlaylist = res.playlist;
	currentPlaylistRowKeys = res.rowKeys;

	if (preferredRowKey) {
		currentPlaylistIndex = currentPlaylistRowKeys.indexOf(preferredRowKey);
	} else {
		currentPlaylistIndex = currentPlaylist.findIndex((t) => t.id === track.id);
	}

	if (currentPlaylistIndex === -1) {
		currentPlaylist = [track];
		currentPlaylistRowKeys = [preferredRowKey || `chk-track-table-${track.id}`];
		currentPlaylistIndex = 0;
	}

	state.currentPlayingRowKey = currentPlaylistRowKeys[currentPlaylistIndex] || null;
	state.isPlaying = true;

	playTrackInternal(track);
}

function playTrackWithRowKey(track: ScanResultItem, rowKey: string) {
	playTrack(track, rowKey);
}
(window as any).playTrackWithRowKey = playTrackWithRowKey;
(window as any).togglePlayPause = togglePlayPause;

function encodeHex(str: string): string {
	return Array.from(new TextEncoder().encode(str))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

function playTrackInternal(track: ScanResultItem) {
	const meta = track.itunesTrack || track.phoneTrack;
	if (!meta || !meta.filePath) return;

	// Use custom media:// protocol to load file safely
	const fileUrl = `media://local-file/${encodeHex(meta.filePath)}`;

	if (audioElement) {
		audioElement.pause();
		audioElement.src = "";
	} else {
		audioElement = new Audio();
		setupAudioEventListeners(audioElement);
	}

	const volumeInput = document.getElementById("player-volume") as HTMLInputElement;
	if (volumeInput && audioElement) {
		audioElement.volume = parseFloat(volumeInput.value);
	}

	currentPlayingTrack = track;
	audioElement.src = fileUrl;

	const elArt = document.getElementById("player-album-art") as HTMLImageElement;
	const elArtPlaceholder = document.getElementById("player-art-placeholder")!;
	elArt.classList.add("hidden");
	elArtPlaceholder.classList.remove("hidden");

	if (meta.album && state.currentProfileId) {
		api.getThumbnail(state.currentProfileId, meta.album).then((dataUri) => {
			if (dataUri && currentPlayingTrack === track) {
				elArt.src = dataUri;
				elArt.classList.remove("hidden");
				elArtPlaceholder.classList.add("hidden");
			}
		});
	}

	document.getElementById("player-title")!.textContent = meta.title || "Unknown Title";
	document.getElementById("player-artist")!.textContent = meta.artist || "Unknown Artist";

	audioElement.play().catch((e) => {
		console.error("Playback failed:", e);
	});

	updatePlayPauseButtonUI();
}

function updateTrackRowButtons(row: HTMLElement) {
	const container = row.querySelector(".track-play-btn-container") as HTMLElement;
	if (!container) return;

	const rowKey = container.getAttribute("data-row-key");
	if (!rowKey) return;

	const isHovered = row.matches(":hover");
	const isActive = state.currentPlayingRowKey === rowKey;

	const needsButtons = isHovered || isActive;

	if (needsButtons) {
		let btnPlay = container.querySelector(".track-play-btn") as HTMLElement;
		let btnPause = container.querySelector(".track-pause-btn") as HTMLElement;

		if (!btnPlay) {
			btnPlay = document.createElement("button");
			btnPlay.setAttribute("type", "button");
			btnPlay.className = "track-play-btn hidden text-indigo-400 hover:text-indigo-300 transition focus:outline-none cursor-pointer flex items-center justify-center w-4 h-4";
			btnPlay.setAttribute("title", "再生");
			btnPlay.setAttribute("data-row-key", rowKey);
			btnPlay.innerHTML = `<svg class="w-4 h-4 fill-current text-indigo-400" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;

			btnPause = document.createElement("button");
			btnPause.setAttribute("type", "button");
			btnPause.className = "track-pause-btn hidden text-indigo-400 hover:text-indigo-300 transition focus:outline-none cursor-pointer flex items-center justify-center w-4 h-4";
			btnPause.setAttribute("title", "一時停止");
			btnPause.setAttribute("data-row-key", rowKey);
			btnPause.innerHTML = `<svg class="w-4 h-4 fill-current text-indigo-400" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;

			container.appendChild(btnPlay);
			container.appendChild(btnPause);
		}

		const lblNum = container.querySelector(".track-number-lbl") as HTMLElement;
		if (lblNum) {
			lblNum.classList.add("hidden");
		}

		const isPlaying = isActive && state.isPlaying;
		if (isPlaying) {
			btnPlay.classList.add("hidden");
			btnPause.classList.remove("hidden");
		} else {
			btnPlay.classList.remove("hidden");
			btnPause.classList.add("hidden");
		}
	} else {
		const btnPlay = container.querySelector(".track-play-btn");
		const btnPause = container.querySelector(".track-pause-btn");
		if (btnPlay) btnPlay.remove();
		if (btnPause) btnPause.remove();

		const lblNum = container.querySelector(".track-number-lbl") as HTMLElement;
		if (lblNum) {
			lblNum.classList.remove("hidden");
		}
	}
}
(window as any).updateTrackRowButtons = updateTrackRowButtons;

function updatePlayingRowUI() {
	const previouslyPlayingRows: HTMLElement[] = [];
	document.querySelectorAll(".track-row.is-playing, .track-row.is-paused, .vs-row.is-playing, .vs-row.is-paused").forEach((el: any) => {
		previouslyPlayingRows.push(el);
		el.classList.remove("is-playing", "is-paused");
	});

	let currentlyPlayingRow: HTMLElement | null = null;
	if (state.currentPlayingRowKey) {
		const container = document.querySelector(`.track-play-btn-container[data-row-key="${state.currentPlayingRowKey}"]`);
		if (container) {
			const row = container.closest(".track-row, .vs-row") as HTMLElement;
			if (row) {
				currentlyPlayingRow = row;
				if (state.isPlaying) {
					row.classList.add("is-playing");
				} else {
					row.classList.add("is-paused");
				}
			}
		}
	}

	previouslyPlayingRows.forEach((row) => {
		updateTrackRowButtons(row);
	});
	if (currentlyPlayingRow && !previouslyPlayingRows.includes(currentlyPlayingRow)) {
		updateTrackRowButtons(currentlyPlayingRow);
	}
}

function setupAudioEventListeners(audio: HTMLAudioElement) {
	const seekbar = document.getElementById("player-seekbar") as HTMLInputElement;
	const txtCurrent = document.getElementById("player-time-current")!;
	const txtTotal = document.getElementById("player-time-total")!;

	audio.addEventListener("timeupdate", () => {
		if (!audio.duration || isNaN(audio.duration)) return;
		const pct = (audio.currentTime / audio.duration) * 100;
		seekbar.value = String(pct);
		txtCurrent.textContent = formatTime(audio.currentTime);
	});

	audio.addEventListener("durationchange", () => {
		txtTotal.textContent = formatTime(audio.duration || 0);
	});

	audio.addEventListener("ended", () => {
		handleTrackEnded();
	});

	audio.addEventListener("play", () => {
		state.isPlaying = true;
		updatePlayPauseButtonUI();
		updatePlayingRowUI();
	});

	audio.addEventListener("pause", () => {
		state.isPlaying = false;
		updatePlayPauseButtonUI();
		updatePlayingRowUI();
	});

	audio.addEventListener("error", (e) => {
		console.error("Audio element error occurred:", audio.error || e);
	});
}

function formatTime(seconds: number): string {
	if (isNaN(seconds) || seconds < 0) return "00:00";
	const mins = Math.floor(seconds / 60);
	const secs = Math.floor(seconds % 60);
	return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function handleTrackEnded() {
	if (loopMode === "loop" && audioElement) {
		audioElement.currentTime = 0;
		audioElement.play().catch((e) => console.error("Playback repeat failed:", e));
	} else if (loopMode === "advance") {
		playNextTrack();
	} else {
		if (audioElement) {
			audioElement.currentTime = 0;
			audioElement.pause();
		}
		state.isPlaying = false;
		updatePlayPauseButtonUI();
		updatePlayingRowUI();
	}
}

function playNextTrack() {
	if (currentPlaylist.length === 0) return;
	currentPlaylistIndex++;
	if (currentPlaylistIndex >= currentPlaylist.length) {
		currentPlaylistIndex = 0;
	}
	const nextTrack = currentPlaylist[currentPlaylistIndex];
	if (nextTrack) {
		state.currentPlayingRowKey = currentPlaylistRowKeys[currentPlaylistIndex] || null;
		playTrackInternal(nextTrack);
	}
}

function playPrevTrack() {
	if (!audioElement) return;

	if (audioElement.currentTime >= 2) {
		audioElement.currentTime = 0;
	} else {
		if (currentPlaylist.length === 0) return;
		currentPlaylistIndex--;
		if (currentPlaylistIndex < 0) {
			currentPlaylistIndex = currentPlaylist.length - 1;
		}
		const prevTrack = currentPlaylist[currentPlaylistIndex];
		if (prevTrack) {
			state.currentPlayingRowKey = currentPlaylistRowKeys[currentPlaylistIndex] || null;
			playTrackInternal(prevTrack);
		}
	}
}

function togglePlayPause() {
	if (!audioElement || !currentPlayingTrack) {
		// Play first song in list
		if (state.filteredTracks.length > 0) {
			playTrack(state.filteredTracks[0]);
		}
		return;
	}

	if (audioElement.paused) {
		audioElement.play().catch((e) => console.error("Playback resume failed:", e));
	} else {
		audioElement.pause();
	}
	updatePlayPauseButtonUI();
}

function updatePlayPauseButtonUI() {
	const iconPlay = document.getElementById("icon-player-play")!;
	if (audioElement && !audioElement.paused) {
		iconPlay.className = "icon-pause text-sm";
	} else {
		iconPlay.className = "icon-play text-sm";
	}
}

function saveProfilePlaybackSettings() {
	if (!state.currentProfileId) return;
	const p = state.profiles.find((x) => x.id === state.currentProfileId);
	if (!p) return;

	const volumeInput = document.getElementById("player-volume") as HTMLInputElement;
	const vol = volumeInput ? parseFloat(volumeInput.value) : 1;

	p.playMode = loopMode;
	p.playVolume = vol;

	api.saveProfile(p).then((updatedProfiles) => {
		state.profiles = updatedProfiles;
	});
}

function updateLoopModeUI() {
	const btnLoop = document.getElementById("btn-player-loop");
	const iconLoop = document.getElementById("icon-player-loop");
	if (!btnLoop || !iconLoop) return;

	if (loopMode === "once") {
		iconLoop.className = "icon-repeat-off text-xs text-gray-400";
		btnLoop.title = "1曲再生して停止";
	} else if (loopMode === "loop") {
		iconLoop.className = "icon-repeat-1 text-xs text-indigo-400";
		btnLoop.title = "1曲リピート再生中";
	} else if (loopMode === "advance") {
		iconLoop.className = "icon-repeat text-xs text-indigo-400";
		btnLoop.title = "リスト順次再生中";
	}
}

function toggleLoopMode() {
	if (loopMode === "once") {
		loopMode = "loop";
	} else if (loopMode === "loop") {
		loopMode = "advance";
	} else {
		loopMode = "once";
	}
	updateLoopModeUI();
	saveProfilePlaybackSettings();
}

// ==========================================
// 【詳細情報モーダル機能 / DETAILED METADATA MODAL CONTROLLER】
// ==========================================
function showDetailedModal(type: "track" | "album", data: any) {
	const modal = document.getElementById("modal-detail")!;
	const titleEl = document.getElementById("detail-modal-title")!;

	// Clone/replace container to clean up previous listeners *before* querying inner elements
	const artContainer = document.getElementById("detail-album-art-container")!;
	const artContainerClone = artContainer.cloneNode(true) as HTMLDivElement;
	artContainer.parentNode!.replaceChild(artContainerClone, artContainer);

	const artImg = document.getElementById("detail-album-art") as HTMLImageElement;
	const artPlaceholder = document.getElementById("detail-art-placeholder")!;

	const txtAlbumName = document.getElementById("detail-album-name") as HTMLInputElement;
	const txtYear = document.getElementById("detail-year") as HTMLInputElement;
	const txtGenre = document.getElementById("detail-genre") as HTMLInputElement;
	const divTitleContainer = document.getElementById("detail-title-container")!;
	const txtTitle = document.getElementById("detail-title") as HTMLInputElement;

	const txtAlbumArtist = document.getElementById("detail-album-artist") as HTMLInputElement;
	const txtArtist = document.getElementById("detail-artist") as HTMLInputElement;
	const txtComposer = document.getElementById("detail-composer") as HTMLInputElement;

	const txtTrackNo = document.getElementById("detail-track-no") as HTMLInputElement;
	const txtTrackTotal = document.getElementById("detail-track-total") as HTMLInputElement;
	const txtDiscNo = document.getElementById("detail-disc-no") as HTMLInputElement;
	const txtDiscTotal = document.getElementById("detail-disc-total") as HTMLInputElement;

	const lblSizeLabel = document.getElementById("lbl-detail-size-label")!;
	const txtSize = document.getElementById("detail-size") as HTMLInputElement;
	const lblDurationLabel = document.getElementById("lbl-detail-duration-label")!;
	const txtDuration = document.getElementById("detail-duration") as HTMLInputElement;

	const divPathsContainer = document.getElementById("detail-paths-container")!;
	const txtItunesPath = document.getElementById("detail-itunes-path") as HTMLInputElement;
	const txtPhonePath = document.getElementById("detail-phone-path") as HTMLInputElement;

	const btnItunesExplorer = document.getElementById("btn-detail-itunes-explorer") as HTMLButtonElement;
	const btnPhoneExplorer = document.getElementById("btn-detail-phone-explorer") as HTMLButtonElement;
	const btnClose = document.getElementById("btn-detail-close")!;

	// Reset state
	artImg.classList.add("hidden");
	artImg.src = "";
	artPlaceholder.classList.remove("hidden");

	// Reset inputs text colors
	const resetColorsAndStyle = (el: HTMLInputElement) => {
		el.classList.remove("text-gray-500", "placeholder-gray-500", "italic", "opacity-50");
		el.classList.add("text-white");
		el.value = "";
		el.placeholder = "";
	};
	[txtAlbumName, txtYear, txtGenre, txtTitle, txtAlbumArtist, txtArtist, txtComposer, txtTrackNo, txtTrackTotal, txtDiscNo, txtDiscTotal, txtSize, txtDuration, txtItunesPath, txtPhonePath].forEach(resetColorsAndStyle);

	const applyPlaceholderMixOrHyphen = (el: HTMLInputElement, value: "ミックス" | "-") => {
		el.classList.add("text-gray-500", "placeholder-gray-500", "italic", "opacity-50");
		el.classList.remove("text-white");
		el.value = value;
	};

	if (type === "track") {
		titleEl.textContent = "曲の詳細情報";
		divTitleContainer.classList.remove("hidden");
		divPathsContainer.classList.remove("hidden");
		lblSizeLabel.textContent = "ファイルサイズ";
		lblDurationLabel.textContent = "再生時間";

		const track = data as ScanResultItem;
		const meta = track.itunesTrack || track.phoneTrack;
		if (!meta) return;

		// Load Album Art
		if (meta.album && state.currentProfileId) {
			api.getThumbnail(state.currentProfileId, meta.album).then((dataUri) => {
				if (dataUri) {
					artImg.src = dataUri;
					artImg.classList.remove("hidden");
					artPlaceholder.classList.add("hidden");
				}
			});
		}

		txtAlbumName.value = meta.album || "";
		txtYear.value = meta.year || "";
		txtGenre.value = meta.genre || "";
		txtTitle.value = meta.title || "";
		txtAlbumArtist.value = meta.albumartist || "";
		txtArtist.value = meta.artist || "";
		txtComposer.value = meta.composer || "";

		// Parse track layout [1] / [6]
		if (meta.track) {
			const parts = meta.track.split("/");
			txtTrackNo.value = parts[0] || "";
			if (parts[1]) {
				txtTrackTotal.value = parts[1];
			} else {
				// Search if there are other tracks in the same album to find max track number
				const albumTracks = state.scannedTracks.filter((t) => (t.itunesTrack || t.phoneTrack)?.album === meta.album);
				let maxTrack = 0;
				albumTracks.forEach((t) => {
					const mt = t.itunesTrack || t.phoneTrack;
					if (mt && mt.track) {
						const num = parseInt(mt.track.split("/")[0], 10);
						if (!isNaN(num) && num > maxTrack) maxTrack = num;
					}
				});
				txtTrackTotal.value = maxTrack > 0 ? String(maxTrack) : "";
			}
		}

		// Disc Number [1] / [2]
		if (meta.disc) {
			const parts = meta.disc.split("/");
			txtDiscNo.value = parts[0] || "";
			if (parts[1]) {
				txtDiscTotal.value = parts[1];
			} else {
				const albumTracks = state.scannedTracks.filter((t) => (t.itunesTrack || t.phoneTrack)?.album === meta.album);
				let maxDisc = 0;
				albumTracks.forEach((t) => {
					const mt = t.itunesTrack || t.phoneTrack;
					if (mt && mt.disc) {
						const num = parseInt(mt.disc.split("/")[0], 10);
						if (!isNaN(num) && num > maxDisc) maxDisc = num;
					}
				});
				txtDiscTotal.value = maxDisc > 0 ? String(maxDisc) : "";
			}
		} else {
			applyPlaceholderMixOrHyphen(txtDiscNo, "-");
			applyPlaceholderMixOrHyphen(txtDiscTotal, "-");
		}

		txtSize.value = formatBytes(meta.size || 0);
		txtDuration.value = formatDurationHHMMSS(meta.duration || 0);

		// Path fields
		const itunesPathExists = track.itunesTrack && track.itunesTrack.filePath;
		const phonePathExists = track.phoneTrack && track.phoneTrack.filePath;

		txtItunesPath.value = track.itunesTrack?.filePath || "";
		txtPhonePath.value = track.phoneTrack?.filePath || "";

		// Enable/Disable explorer buttons
		// If path is empty, or not technically representable (like mock mtp or simulated mtp targets where physical file opening isn't possible), disable it
		const activeProfile = state.profiles.find((p) => p.id === state.currentProfileId);
		const storageType = activeProfile ? activeProfile.storageType || "local" : "local";
		const canShowItunes = !!itunesPathExists;
		const canShowPhone = !!(phonePathExists && storageType === "local");

		btnItunesExplorer.disabled = !canShowItunes;
		btnPhoneExplorer.disabled = !canShowPhone;

		// Clean up previous event listeners by cloning button
		const btnItunesClone = btnItunesExplorer.cloneNode(true) as HTMLButtonElement;
		btnItunesExplorer.parentNode!.replaceChild(btnItunesClone, btnItunesExplorer);
		btnItunesClone.addEventListener("click", () => {
			if (track.itunesTrack?.filePath) {
				api.showItemInFolder(track.itunesTrack.filePath);
			}
		});

		const btnPhoneClone = btnPhoneExplorer.cloneNode(true) as HTMLButtonElement;
		btnPhoneExplorer.parentNode!.replaceChild(btnPhoneClone, btnPhoneExplorer);
		btnPhoneClone.addEventListener("click", () => {
			if (track.phoneTrack?.filePath) {
				api.showItemInFolder(track.phoneTrack.filePath);
			}
		});
	} else {
		// Album detailed mode
		const albumName = data as string;
		titleEl.textContent = "アルバムの詳細情報";
		divTitleContainer.classList.add("hidden");
		divPathsContainer.classList.add("hidden");
		lblSizeLabel.textContent = "合計アルバムファイルサイズ";
		lblDurationLabel.textContent = "合計再生時間";

		const albumTracks = state.scannedTracks.filter((t) => (t.itunesTrack || t.phoneTrack)?.album === albumName);
		if (albumTracks.length === 0) return;

		// Load Album Art (Check any track in album)
		if (state.currentProfileId) {
			api.getThumbnail(state.currentProfileId, albumName).then((dataUri) => {
				if (dataUri) {
					artImg.src = dataUri;
					artImg.classList.remove("hidden");
					artPlaceholder.classList.add("hidden");
				}
			});
		}

		txtAlbumName.value = albumName;

		// Gather metadata lists from album tracks to determine "Mix" (ミックス) or distinct years/genres
		const years = new Set<string>();
		const genres = new Set<string>();
		const albumartists = new Set<string>();
		const artists = new Set<string>();
		const composers = new Set<string>();
		const discs = new Set<number>();

		let totalSize = 0;
		let totalDuration = 0;

		albumTracks.forEach((t) => {
			const mt = t.itunesTrack || t.phoneTrack;
			if (!mt) return;

			if (mt.year) years.add(mt.year);
			if (mt.genre) genres.add(mt.genre);
			if (mt.albumartist) albumartists.add(mt.albumartist);
			if (mt.artist) artists.add(mt.artist);
			if (mt.composer) composers.add(mt.composer);

			const discNum = parseInt(mt.disc?.split("/")[0] || "1", 10) || 1;
			discs.add(discNum);

			totalSize += mt.size || 0;
			totalDuration += mt.duration || 0;
		});

		// Multiple years -> "Mix" in placeholder style
		if (years.size > 1) {
			applyPlaceholderMixOrHyphen(txtYear, "ミックス");
		} else {
			txtYear.value = years.size === 1 ? Array.from(years)[0] : "";
		}

		// Multiple genres -> "Mix" in placeholder style
		if (genres.size > 1) {
			applyPlaceholderMixOrHyphen(txtGenre, "ミックス");
		} else {
			txtGenre.value = genres.size === 1 ? Array.from(genres)[0] : "";
		}

		// Multiple album artists -> "Mix" in placeholder style
		if (albumartists.size > 1) {
			applyPlaceholderMixOrHyphen(txtAlbumArtist, "ミックス");
		} else {
			txtAlbumArtist.value = albumartists.size === 1 ? Array.from(albumartists)[0] : "";
		}

		// Multiple artists -> "Mix" in placeholder style
		if (artists.size > 1) {
			applyPlaceholderMixOrHyphen(txtArtist, "ミックス");
		} else {
			txtArtist.value = artists.size === 1 ? Array.from(artists)[0] : "";
		}

		// Multiple composers -> "Mix" in placeholder style
		if (composers.size > 1) {
			applyPlaceholderMixOrHyphen(txtComposer, "ミックス");
		} else {
			txtComposer.value = composers.size === 1 ? Array.from(composers)[0] : "";
		}

		// Tracks count handling: tracks split across accordion or flat lists
		// Left: "-" (hyphen), Right: total count of tracks in this album
		applyPlaceholderMixOrHyphen(txtTrackNo, "-");
		txtTrackTotal.value = String(albumTracks.length);

		// Disc count handling: if multiple discs exist, left is "-" (hyphen), right is max disc number
		const maxDiscNum = discs.size > 0 ? Math.max(...Array.from(discs)) : 1;
		if (discs.size > 1) {
			applyPlaceholderMixOrHyphen(txtDiscNo, "-");
			txtDiscTotal.value = String(maxDiscNum);
		} else {
			txtDiscNo.value = String(maxDiscNum);
			txtDiscTotal.value = String(maxDiscNum);
		}

		txtSize.value = formatBytes(totalSize);
		txtDuration.value = formatDurationHHMMSS(totalDuration);
	}

	// Setup Copy album art functionality
	const triggerCopy = async () => {
		// Only copy if art is actually shown (not placeholder)
		if (artImg.classList.contains("hidden")) return;
		const targetAlbum = txtAlbumName.value;
		if (targetAlbum && state.currentProfileId) {
			const success = await api.copyAlbumArt(state.currentProfileId, targetAlbum);
			if (success) {
				// Show custom feedback or status notification
				const originalBorder = artContainerClone.style.borderColor;
				artContainerClone.style.borderColor = "#6366f1"; // Highlight with indigo ring color
				setTimeout(() => {
					artContainerClone.style.borderColor = originalBorder;
				}, 500);
			}
		}
	};

	artContainerClone.addEventListener("keydown", (e: KeyboardEvent) => {
		if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
			e.preventDefault();
			triggerCopy();
		}
	});

	artContainerClone.addEventListener("contextmenu", (e: MouseEvent) => {
		e.preventDefault();
		// Show customized context menu to copy the image
		api.showContextMenu({
			album: txtAlbumName.value,
			isDetailArt: true,
		});
	});

	btnClose.onclick = () => {
		modal.classList.add("hidden");
	};

	modal.classList.remove("hidden");
}

window.addEventListener("resize", () => {
	if (state.viewMode === "grid") {
		const gridContainers = document.querySelectorAll(".grid");
		gridContainers.forEach((gridContainer) => {
			alignGridDrawer(gridContainer as HTMLElement);
		});
	}
});

// Start everything
init();
