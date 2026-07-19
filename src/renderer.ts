import "lucide-static/font/lucide.css";
import "./style.css";

import { api, isMock } from "./renderer/api";
import { initModals, updateDynamicColors } from "./renderer/components/modals";
import { renderVirtualTracks } from "./renderer/components/tableView";
import { renderAlbumView, renderArtistView, renderGenreView } from "./renderer/components/treeView";
import { clearHistory, handleRedo, handleUndo, pushHistoryState, state } from "./renderer/state";

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

// Summary stats footer
const elCntTotal = document.getElementById("cnt-total")!;
const elCntMissing = document.getElementById("cnt-missing")!;
const elCntUpdated = document.getElementById("cnt-updated")!;
const elCntSynced = document.getElementById("cnt-synced")!;
const elCntPhoneOnly = document.getElementById("cnt-phone-only")!;
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
const elColorPhoneOnly = document.getElementById("color-phone-only") as HTMLInputElement;

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
	updateDynamicColors(state.currentSettings);

	state.profiles = await api.getProfiles();
	renderProfileDropdown();

	initModals({
		renderProfileDropdown,
		selectProfile,
		renderActiveView,
		updateSummaryBar,
		startSyncExecution,
	});

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
			${p.id === state.currentProfileId ? '<i class="lucide-check text-xs text-indigo-400"></i>' : ""}
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

function renderActiveView() {
	updateStatsSummary();
	updateSummaryBar();

	const callbacks = {
		updateSummaryBar,
		updateMasterCheckboxState,
		renderActiveView,
	};

	if (state.activeTab === "artist") renderArtistView(elTreeContainer, callbacks);
	else if (state.activeTab === "album") renderAlbumView(elTreeContainer, callbacks);
	else if (state.activeTab === "genre") renderGenreView(elTreeContainer, callbacks);
	else if (state.activeTab === "track") renderVirtualTracks(vsViewport, vsCanvas, vsContent, callbacks);
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

	if (pathWarnings > 0) {
		elCntPathWarnings.textContent = `⚠️ 配置不一致: ${pathWarnings}`;
		elCntPathWarnings.classList.remove("hidden");
	} else {
		elCntPathWarnings.classList.add("hidden");
	}
}

function updateSummaryBar() {
	elCntCheckedCopy.textContent = String(state.checkedCopyTrackIds.size);
	elCntCheckedDelete.textContent = String(state.checkedDeleteTrackIds.size);

	const totalChecks = state.checkedCopyTrackIds.size + state.checkedMoveTrackIds.size + state.checkedDeleteTrackIds.size;
	elBtnSyncExec.disabled = totalChecks === 0;
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
	let totalCopiableOrDeletable = 0;

	for (const track of state.filteredTracks) {
		if (track.status === "missing" || track.status === "updated") {
			totalCopiableOrDeletable++;
			if (state.checkedCopyTrackIds.has(track.id)) checkedCount++;
		} else if (track.status === "phone_only") {
			totalCopiableOrDeletable++;
			if (state.checkedDeleteTrackIds.has(track.id)) checkedCount++;
		}
	}

	if (checkedCount === 0) {
		elChkMaster.checked = false;
		elChkMaster.indeterminate = false;
	} else if (checkedCount === totalCopiableOrDeletable) {
		elChkMaster.checked = true;
		elChkMaster.indeterminate = false;
	} else {
		elChkMaster.checked = false;
		elChkMaster.indeterminate = true;
	}
}

function applyFilterAndRender() {
	if (state.searchQuery === "") {
		state.filteredTracks = state.scannedTracks;
	} else {
		state.filteredTracks = state.scannedTracks.filter((t) => {
			const meta = t.itunesTrack || t.phoneTrack;
			if (!meta) return false;
			return (meta.title || "").toLowerCase().includes(state.searchQuery) || (meta.artist || "").toLowerCase().includes(state.searchQuery) || (meta.album || "").toLowerCase().includes(state.searchQuery);
		});
	}

	renderActiveView();
	updateMasterCheckboxState();
}

function setupEventListeners() {
	elBtnProfileDropdown.addEventListener("click", (e) => {
		e.stopPropagation();
		elProfileDropdownMenu.classList.toggle("hidden");
	});

	document.addEventListener("click", () => {
		elProfileDropdownMenu.classList.add("hidden");
		elTabsDropdownMenu.classList.add("hidden");
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

			// Auto check Missing & Updated tracks by default
			for (const track of state.scannedTracks) {
				if (track.status === "missing" || track.status === "updated") {
					state.checkedCopyTrackIds.add(track.id);
				}
				if (track.pathMismatch && (track.status === "synced" || track.status === "updated")) {
					state.checkedMoveTrackIds.add(track.id);
				}
			}

			applyFilterAndRender();
		} catch (e: any) {
			cancelProgress();
			alert("スキャン中にエラーが発生しました: " + e.message);
			elModalProgress.classList.add("hidden");
		}
	});

	elBtnSyncExec.addEventListener("click", () => {
		if (!state.currentProfileId) return;

		const pathsMismatchedSelected = state.scannedTracks.filter((t) => (t.status === "missing" || t.status === "updated" || t.status === "synced") && t.pathMismatch && (state.checkedCopyTrackIds.has(t.id) || state.checkedMoveTrackIds.has(t.id)));

		if (pathsMismatchedSelected.length > 0) {
			elLblMoveCount.textContent = String(pathsMismatchedSelected.length);
			elMoveTargetList.innerHTML = "";

			let allChecked = true;
			pathsMismatchedSelected.forEach((t) => {
				if (!state.checkedMoveTrackIds.has(t.id)) allChecked = false;
			});
			elChkModalMoveMaster.checked = allChecked;

			pathsMismatchedSelected.forEach((t) => {
				const it = t.itunesTrack!;
				const pt = t.phoneTrack || it;
				const row = document.createElement("div");
				row.className = "py-2 flex items-center justify-between text-xxs hover:bg-gray-850 gap-3 border-b border-gray-800";

				row.innerHTML = `
					<div class="flex items-center space-x-2 flex-1 min-w-0">
						<input type="checkbox" id="chk-modal-move-${t.id}" class="chk-modal-move-item rounded bg-gray-700 border-gray-650 text-indigo-500 focus:ring-indigo-400 h-3.5 w-3.5" ${state.checkedMoveTrackIds.has(t.id) ? "checked" : ""}>
						<div class="truncate flex-1">
							<div class="font-semibold text-gray-200">${it.artist} - ${it.title}</div>
							<div class="text-gray-500 truncate font-mono text-xxs">現在: ${pt.relativePath} -> iTunes: ${it.relativePath}</div>
						</div>
					</div>
				`;
				elMoveTargetList.appendChild(row);

				const chkMove = document.getElementById(`chk-modal-move-${t.id}`) as HTMLInputElement;
				chkMove.addEventListener("change", () => {
					if (chkMove.checked) {
						state.checkedMoveTrackIds.add(t.id);
					} else {
						state.checkedMoveTrackIds.delete(t.id);
					}
					let allCheckState = true;
					document.querySelectorAll(".chk-modal-move-item").forEach((el: any) => {
						if (!el.checked) allCheckState = false;
					});
					elChkModalMoveMaster.checked = allCheckState;
					updateSummaryBar();
				});
			});

			elModalMoveConfirm.classList.remove("hidden");
		} else {
			// Trigger click on verify submit if direct
			const elSubmit = document.getElementById("btn-move-confirm-submit")!;
			elSubmit.dispatchEvent(new Event("click"));
		}
	});

	elBtnProgressClose.addEventListener("click", () => {
		elModalProgress.classList.add("hidden");
		elBtnScan.click();
	});

	elTxtSearch.addEventListener("input", () => {
		state.searchQuery = elTxtSearch.value.trim().toLowerCase();
		applyFilterAndRender();
	});

	elChkMaster.addEventListener("change", () => {
		pushHistoryState();
		const isChecked = elChkMaster.checked;
		for (const track of state.filteredTracks) {
			if (track.status === "missing" || track.status === "updated") {
				if (isChecked) state.checkedCopyTrackIds.add(track.id);
				else state.checkedCopyTrackIds.delete(track.id);
			} else if (track.status === "phone_only") {
				if (isChecked) state.checkedDeleteTrackIds.add(track.id);
				else state.checkedDeleteTrackIds.delete(track.id);
			}
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
	const deleteTrackIds = Array.from(state.checkedDeleteTrackIds);

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
			if (isMock) {
				setTimeout(() => {
					elBtnProgressClose.disabled = false;
				}, 600);
			}
		})
		.catch((e: any) => {
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

// Start everything
init();
