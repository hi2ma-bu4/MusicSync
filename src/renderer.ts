import "lucide-static/font/lucide.css";
import "./style.css";

// Renderer Process
declare global {
	interface Window {
		api: {
			selectFolder: () => Promise<string | null>;
			getProfiles: () => Promise<any[]>;
			saveProfile: (profile: any) => Promise<any[]>;
			deleteProfile: (id: string) => Promise<any[]>;
			getSettings: () => Promise<any>;
			saveSettings: (settings: any) => Promise<void>;
			startScan: (profileId: string) => Promise<void>;
			getScanResult: (profileId: string) => Promise<any[]>;
			executeSync: (profileId: string, options: any) => Promise<void>;
			onScanProgress: (callback: (progress: any) => void) => () => void;
			onSyncProgress: (callback: (progress: any) => void) => () => void;
		};
	}
}
export {};

// Mock API for local browser / Playwright testing environments (Graceful Degradation)
if (!window.api) {
	console.warn("window.api is not defined. Initializing mock API for web development/testing.");
	(window as any).api = {
		__isMock: true,
		selectFolder: async () => {
			return "/mock/selected/path";
		},
		getProfiles: async () => {
			const data = localStorage.getItem("mock_profiles");
			return data ? JSON.parse(data) : [];
		},
		saveProfile: async (profile: any) => {
			const data = localStorage.getItem("mock_profiles");
			const profiles2 = data ? JSON.parse(data) : [];
			const idx = profiles2.findIndex((p: any) => p.id === profile.id);
			if (idx > -1) profiles2[idx] = profile;
			else profiles2.push(profile);
			localStorage.setItem("mock_profiles", JSON.stringify(profiles2));
			return profiles2;
		},
		deleteProfile: async (id: string) => {
			const data = localStorage.getItem("mock_profiles");
			let profiles2 = data ? JSON.parse(data) : [];
			profiles2 = profiles2.filter((p: any) => p.id !== id);
			localStorage.setItem("mock_profiles", JSON.stringify(profiles2));
			return profiles2;
		},
		getSettings: async () => {
			const data = localStorage.getItem("mock_settings");
			return data
				? JSON.parse(data)
				: {
						colorMissing: "#22c55e",
						colorUpdated: "#f59e0b",
						colorSynced: "#94a3b8",
						colorPhoneOnly: "#ef4444",
					};
		},
		saveSettings: async (settings: any) => {
			localStorage.setItem("mock_settings", JSON.stringify(settings));
		},
		startScan: async (_profileId: string) => {
			console.log("Mock scan started");
		},
		getScanResult: async (_profileId: string) => {
			return [
				{
					id: "mock_1",
					status: "missing",
					pathMismatch: false,
					itunesTrack: {
						title: "Dynamite",
						artist: "BTS",
						album: "BE",
						track: "1",
						genre: "K-Pop",
					},
				},
				{
					id: "mock_2",
					status: "updated",
					pathMismatch: true,
					itunesTrack: {
						title: "Stay",
						artist: "The Kid LAROI & Justin Bieber",
						album: "F*CK LOVE 3: OVER YOU",
						track: "1",
						genre: "Pop",
						relativePath: "Pop/Stay.mp3",
					},
					phoneTrack: {
						title: "Stay",
						artist: "The Kid LAROI",
						album: "Stay - Single",
						track: "1",
						genre: "Pop",
						relativePath: "Stay.mp3",
					},
				},
				{
					id: "mock_3",
					status: "synced",
					pathMismatch: false,
					itunesTrack: {
						title: "Blinding Lights",
						artist: "The Weeknd",
						album: "After Hours",
						track: "3",
						genre: "R&B",
						relativePath: "R&B/The Weeknd/After Hours/03 Blinding Lights.mp3",
					},
					phoneTrack: {
						title: "Blinding Lights",
						artist: "The Weeknd",
						album: "After Hours",
						track: "3",
						genre: "R&B",
						relativePath: "R&B/The Weeknd/After Hours/03 Blinding Lights.mp3",
					},
				},
				{
					id: "mock_4",
					status: "phone_only",
					pathMismatch: false,
					phoneTrack: {
						title: "Old Town Road",
						artist: "Lil Nas X",
						album: "7 EP",
						track: "1",
						genre: "Country",
						relativePath: "Lil Nas X/Old Town Road.mp3",
					},
				},
			];
		},
		executeSync: async (_profileId: string, _options: any) => {
			console.log("Mock executeSync");
		},
		onScanProgress: (callback: any) => {
			setTimeout(() => callback({ step: "itunes_list", message: "iTunesフォルダを検索中...", progress: 10 }), 100);
			setTimeout(() => callback({ step: "itunes_parse", message: "iTunesの曲情報を解析中...", progress: 40 }), 300);
			setTimeout(() => callback({ step: "phone_list", message: "スマホフォルダを検索中...", progress: 60 }), 500);
			setTimeout(() => callback({ step: "comparing", message: "曲情報の差分を比較中...", progress: 90 }), 700);
			setTimeout(() => callback({ step: "done", message: "比較完了", progress: 100 }), 900);
			return () => {};
		},
		onSyncProgress: (callback: any) => {
			setTimeout(() => callback({ status: "running", message: "コピー中...", progress: 50, logs: ["コピー成功: Dynamite.mp3"] }), 200);
			setTimeout(() => callback({ status: "done", message: "同期完了", progress: 100, logs: ["コピー成功: Dynamite.mp3", "同期完了"] }), 500);
			return () => {};
		},
	};
}

const { api } = window;

// State management
let profiles: any[] = [];
let currentProfileId: string | null = null;
let currentSettings: any = {};
let activeTab: "artist" | "album" | "genre" | "track" = "artist";
let searchQuery = "";

// Scanned results
let scannedTracks: any[] = [];
let filteredTracks: any[] = [];

// Selection sets
let checkedCopyTrackIds = new Set<string>(); // For missing & updated tracks (to copy)
let checkedMoveTrackIds = new Set<string>(); // For different path tracks (to reorganize)
let checkedDeleteTrackIds = new Set<string>(); // For phone-only tracks (to delete)

// Accordion states
const expandedGroups = new Set<string>();

// Undo/Redo Selection History Stacks (Ctrl+Z / Ctrl+Y)
interface HistoryState {
	checkedCopy: Set<string>;
	checkedMove: Set<string>;
	checkedDelete: Set<string>;
}
const historyUndo: HistoryState[] = [];
const historyRedo: HistoryState[] = [];
const maxHistorySize = 50;

function pushHistoryState() {
	if (historyUndo.length >= maxHistorySize) {
		historyUndo.shift();
	}
	historyUndo.push({
		checkedCopy: new Set(checkedCopyTrackIds),
		checkedMove: new Set(checkedMoveTrackIds),
		checkedDelete: new Set(checkedDeleteTrackIds),
	});
	historyRedo.length = 0; // Clear redo stack on new action
}

function handleUndo() {
	if (historyUndo.length === 0) return;
	const current = {
		checkedCopy: new Set(checkedCopyTrackIds),
		checkedMove: new Set(checkedMoveTrackIds),
		checkedDelete: new Set(checkedDeleteTrackIds),
	};
	historyRedo.push(current);

	const prev = historyUndo.pop()!;
	checkedCopyTrackIds = prev.checkedCopy;
	checkedMoveTrackIds = prev.checkedMove;
	checkedDeleteTrackIds = prev.checkedDelete;

	renderActiveView();
}

function handleRedo() {
	if (historyRedo.length === 0) return;
	const current = {
		checkedCopy: new Set(checkedCopyTrackIds),
		checkedMove: new Set(checkedMoveTrackIds),
		checkedDelete: new Set(checkedDeleteTrackIds),
	};
	historyUndo.push(current);

	const next = historyRedo.pop()!;
	checkedCopyTrackIds = next.checkedCopy;
	checkedMoveTrackIds = next.checkedMove;
	checkedDeleteTrackIds = next.checkedDelete;

	renderActiveView();
}

// Virtual Scrolling variables
const rowHeight = 30; // 30px per row
const vsViewport = document.getElementById("virtual-scroll-viewport")!;
const vsCanvas = document.getElementById("virtual-scroll-canvas")!;
const vsContent = document.getElementById("virtual-scroll-content")!;

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
const elFormProfile = document.getElementById("form-profile") as HTMLFormElement;
const elTxtProfileId = document.getElementById("txt-profile-id") as HTMLInputElement;
const elTxtProfileName = document.getElementById("txt-profile-name") as HTMLInputElement;
const elTxtProfileItunes = document.getElementById("txt-profile-itunes") as HTMLInputElement;
const elTxtProfilePhone = document.getElementById("txt-profile-phone") as HTMLInputElement;
const elBtnChooseItunes = document.getElementById("btn-choose-itunes")!;
const elBtnChoosePhone = document.getElementById("btn-choose-phone")!;
const elBtnProfileCancel = document.getElementById("btn-profile-cancel")!;
const elProfileModalTitle = document.getElementById("profile-modal-title")!;

const elModalSettings = document.getElementById("modal-settings")!;
const elColorMissing = document.getElementById("color-missing") as HTMLInputElement;
const elColorUpdated = document.getElementById("color-updated") as HTMLInputElement;
const elColorSynced = document.getElementById("color-synced") as HTMLInputElement;
const elColorPhoneOnly = document.getElementById("color-phone-only") as HTMLInputElement;
const elBtnSettingsCancel = document.getElementById("btn-settings-cancel")!;
const elBtnSettingsSave = document.getElementById("btn-settings-save")!;

const elModalDeleteConfirm = document.getElementById("modal-delete-confirm")!;
const elDeleteTargetList = document.getElementById("delete-target-list")!;
const elLblDelCount = document.getElementById("lbl-del-count")!;
const elTxtDeleteVerify = document.getElementById("txt-delete-verify") as HTMLInputElement;
const elBtnDeleteCancel = document.getElementById("btn-delete-cancel")!;
const elBtnDeleteConfirmSubmit = document.getElementById("btn-delete-confirm-submit") as HTMLButtonElement;

// Reorganization Modal
const elModalMoveConfirm = document.getElementById("modal-move-confirm")!;
const elLblMoveCount = document.getElementById("lbl-move-count")!;
const elChkModalMoveMaster = document.getElementById("chk-modal-move-master") as HTMLInputElement;
const elMoveTargetList = document.getElementById("move-target-list")!;
const elBtnMoveCancel = document.getElementById("btn-move-cancel")!;
const elBtnMoveConfirmSubmit = document.getElementById("btn-move-confirm-submit")!;

const elModalProgress = document.getElementById("modal-progress")!;
const elProgressModalTitle = document.getElementById("progress-modal-title")!;
const elLblProgressStatus = document.getElementById("lbl-progress-status")!;
const elLblProgressPct = document.getElementById("lbl-progress-pct")!;
const elProgressBarFill = document.getElementById("progress-bar-fill")!;
const elProgressLogs = document.getElementById("progress-logs")!;
const elBtnProgressClose = document.getElementById("btn-progress-close") as HTMLButtonElement;

// --- Initialization ---
async function init() {
	// 1. Load settings and apply colors
	currentSettings = await api.getSettings();
	updateDynamicColors(currentSettings);

	// 2. Load Profiles
	profiles = await api.getProfiles();
	renderProfileDropdown();

	// 3. Event Listeners
	setupEventListeners();
	setupColumnResize();
}

// Update customizable colors dynamically using CSS variables
function updateDynamicColors(settings: any) {
	let styleEl = document.getElementById("dynamic-colors-block");
	if (!styleEl) {
		styleEl = document.createElement("style");
		styleEl.id = "dynamic-colors-block";
		document.head.appendChild(styleEl);
	}
	styleEl.textContent = `
		:root {
			--color-missing: ${settings.colorMissing || "#22c55e"};
			--color-updated: ${settings.colorUpdated || "#f59e0b"};
			--color-synced: ${settings.colorSynced || "#94a3b8"};
			--color-phone-only: ${settings.colorPhoneOnly || "#ef4444"};
		}
		.bg-missing { background-color: rgba(34, 197, 94, 0.12) !important; }
		.text-missing { color: var(--color-missing) !important; }
		.border-missing { border-color: var(--color-missing) !important; }

		.bg-updated { background-color: rgba(245, 158, 11, 0.12) !important; }
		.text-updated { color: var(--color-updated) !important; }
		.border-updated { border-color: var(--color-updated) !important; }

		.bg-synced { background-color: transparent !important; }
		.text-synced { color: var(--color-synced) !important; }
		.border-synced { border-color: var(--color-synced) !important; }

		.bg-phone-only { background-color: rgba(239, 68, 68, 0.12) !important; }
		.text-phone-only { color: var(--color-phone-only) !important; }
		.border-phone-only { border-color: var(--color-phone-only) !important; }
	`;
}

// Setup Column Resizing
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
				// Trigger virtual scroll re-render to align cells perfectly
				renderVirtualTracks();
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

// Setup Event listeners
function setupEventListeners() {
	// Profile selection dropdown toggler
	elBtnProfileDropdown.addEventListener("click", (e) => {
		e.stopPropagation();
		elProfileDropdownMenu.classList.toggle("hidden");
	});

	// Close dropdown when clicking elsewhere
	document.addEventListener("click", () => {
		elProfileDropdownMenu.classList.add("hidden");
		elTabsDropdownMenu.classList.add("hidden");
	});

	// Profile Modal Action Links inside dropdown
	elBtnDropdownNewProfile.addEventListener("click", () => {
		elProfileModalTitle.textContent = "同期プロファイルの作成";
		elTxtProfileId.value = "";
		elTxtProfileName.value = "";
		elTxtProfileItunes.value = "";
		elTxtProfilePhone.value = "";
		elModalProfile.classList.remove("hidden");
	});

	elBtnDropdownEditProfile.addEventListener("click", () => {
		const p = profiles.find((x) => x.id === currentProfileId);
		if (!p) return;
		elProfileModalTitle.textContent = "同期プロファイルの編集";
		elTxtProfileId.value = p.id;
		elTxtProfileName.value = p.name;
		elTxtProfileItunes.value = p.itunesPath;
		elTxtProfilePhone.value = p.phonePath;
		elModalProfile.classList.remove("hidden");
	});

	elBtnDropdownDeleteProfile.addEventListener("click", async () => {
		const p = profiles.find((x) => x.id === currentProfileId);
		if (!p) return;
		if (confirm(`プロファイル「${p.name}」を削除してもよろしいですか？`)) {
			profiles = await api.deleteProfile(p.id);
			currentProfileId = null;
			scannedTracks = [];
			filteredTracks = [];
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
		elColorMissing.value = currentSettings.colorMissing || "#22c55e";
		elColorUpdated.value = currentSettings.colorUpdated || "#f59e0b";
		elColorSynced.value = currentSettings.colorSynced || "#94a3b8";
		elColorPhoneOnly.value = currentSettings.colorPhoneOnly || "#ef4444";
		elModalSettings.classList.remove("hidden");
	});

	// Choose Directory Dialogues in modal
	elBtnChooseItunes.addEventListener("click", async () => {
		const path = await api.selectFolder();
		if (path) elTxtProfileItunes.value = path;
	});

	elBtnChoosePhone.addEventListener("click", async () => {
		const path = await api.selectFolder();
		if (path) elTxtProfilePhone.value = path;
	});

	// Cancel/Submit Profile Form
	elBtnProfileCancel.addEventListener("click", () => {
		elModalProfile.classList.add("hidden");
	});

	elFormProfile.addEventListener("submit", async (e) => {
		e.preventDefault();
		const id = elTxtProfileId.value || "profile_" + Date.now();
		const profile = {
			id,
			name: elTxtProfileName.value.trim(),
			itunesPath: elTxtProfileItunes.value.trim(),
			phonePath: elTxtProfilePhone.value.trim(),
		};

		profiles = await api.saveProfile(profile);
		elModalProfile.classList.add("hidden");
		renderProfileDropdown();
		selectProfile(id);
	});

	// Colors Settings modal Cancel / Save
	elBtnSettingsCancel.addEventListener("click", () => {
		elModalSettings.classList.add("hidden");
	});

	elBtnSettingsSave.addEventListener("click", async () => {
		const newSettings = {
			colorMissing: elColorMissing.value,
			colorUpdated: elColorUpdated.value,
			colorSynced: elColorSynced.value,
			colorPhoneOnly: elColorPhoneOnly.value,
		};
		await api.saveSettings(newSettings);
		currentSettings = newSettings;
		updateDynamicColors(currentSettings);
		elModalSettings.classList.add("hidden");
		renderActiveView();
	});

	// Scanning comparison
	elBtnScan.addEventListener("click", async () => {
		if (!currentProfileId) return;

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
			await api.startScan(currentProfileId);

			if (window.api.hasOwnProperty("__isMock")) {
				await new Promise((resolve) => setTimeout(resolve, 1100));
			}

			cancelProgress();
			elModalProgress.classList.add("hidden");

			scannedTracks = await api.getScanResult(currentProfileId);

			elPromptToScanView.classList.add("hidden");

			checkedCopyTrackIds.clear();
			checkedMoveTrackIds.clear();
			checkedDeleteTrackIds.clear();
			expandedGroups.clear();
			historyUndo.length = 0;
			historyRedo.length = 0;

			// Auto check Missing & Updated tracks by default
			for (const track of scannedTracks) {
				if (track.status === "missing" || track.status === "updated") {
					checkedCopyTrackIds.add(track.id);
				}
				if (track.pathMismatch && (track.status === "synced" || track.status === "updated")) {
					checkedMoveTrackIds.add(track.id);
				}
			}

			applyFilterAndRender();
		} catch (e: any) {
			cancelProgress();
			alert("スキャン中にエラーが発生しました: " + e.message);
			elModalProgress.classList.add("hidden");
		}
	});

	// Sync execution button click
	elBtnSyncExec.addEventListener("click", () => {
		if (!currentProfileId) return;

		// Get tracks selected for copy/update that have different relative paths
		const pathsMismatchedSelected = scannedTracks.filter((t) => (t.status === "missing" || t.status === "updated" || t.status === "synced") && t.pathMismatch && (checkedCopyTrackIds.has(t.id) || checkedMoveTrackIds.has(t.id)));

		if (pathsMismatchedSelected.length > 0) {
			// Show Reorganization Move Confirmation Modal
			elLblMoveCount.textContent = String(pathsMismatchedSelected.length);
			elMoveTargetList.innerHTML = "";

			// Modal Master checkbox
			let allChecked = true;
			pathsMismatchedSelected.forEach((t) => {
				if (!checkedMoveTrackIds.has(t.id)) allChecked = false;
			});
			elChkModalMoveMaster.checked = allChecked;

			pathsMismatchedSelected.forEach((t) => {
				const it = t.itunesTrack;
				const pt = t.phoneTrack || it;
				const row = document.createElement("div");
				row.className = "py-2 flex items-center justify-between text-xxs hover:bg-gray-850 gap-3 border-b border-gray-800";

				row.innerHTML = `
					<div class="flex items-center space-x-2 flex-1 min-w-0">
						<input type="checkbox" id="chk-modal-move-${t.id}" class="chk-modal-move-item rounded bg-gray-700 border-gray-650 text-indigo-500 focus:ring-indigo-400 h-3.5 w-3.5" ${checkedMoveTrackIds.has(t.id) ? "checked" : ""}>
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
						checkedMoveTrackIds.add(t.id);
					} else {
						checkedMoveTrackIds.delete(t.id);
					}
					// Update modal master checkbox state
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
			proceedWithDeleteOrSync();
		}
	});

	// Reorganization Modal Move Master Toggle
	elChkModalMoveMaster.addEventListener("change", () => {
		const isChecked = elChkModalMoveMaster.checked;
		const pathsMismatchedSelected = scannedTracks.filter((t) => (t.status === "missing" || t.status === "updated" || t.status === "synced") && t.pathMismatch && (checkedCopyTrackIds.has(t.id) || checkedMoveTrackIds.has(t.id)));

		pathsMismatchedSelected.forEach((t) => {
			if (isChecked) {
				checkedMoveTrackIds.add(t.id);
			} else {
				checkedMoveTrackIds.delete(t.id);
			}
			const chk = document.getElementById(`chk-modal-move-${t.id}`) as HTMLInputElement;
			if (chk) chk.checked = isChecked;
		});
		updateSummaryBar();
	});

	elBtnMoveCancel.addEventListener("click", () => {
		elModalMoveConfirm.classList.add("hidden");
	});

	elBtnMoveConfirmSubmit.addEventListener("click", () => {
		elModalMoveConfirm.classList.add("hidden");
		proceedWithDeleteOrSync();
	});

	// Secure Deletion Confirm Submit Click
	elBtnDeleteConfirmSubmit.addEventListener("click", () => {
		elModalDeleteConfirm.classList.add("hidden");
		startSyncExecution();
	});

	elBtnDeleteCancel.addEventListener("click", () => {
		elModalDeleteConfirm.classList.add("hidden");
	});

	// Strict Deletion verify input change
	elTxtDeleteVerify.addEventListener("input", () => {
		elBtnDeleteConfirmSubmit.disabled = elTxtDeleteVerify.value.trim() !== "削除";
	});

	// Modal sync progress close click
	elBtnProgressClose.addEventListener("click", () => {
		elModalProgress.classList.add("hidden");
		elBtnScan.click(); // Re-scan to reload workspace with fresh state
	});

	// Search text input change
	elTxtSearch.addEventListener("input", () => {
		searchQuery = elTxtSearch.value.trim().toLowerCase();
		applyFilterAndRender();
	});

	// Table Master checkbox change
	elChkMaster.addEventListener("change", () => {
		pushHistoryState();
		const isChecked = elChkMaster.checked;
		for (const track of filteredTracks) {
			if (track.status === "missing" || track.status === "updated") {
				if (isChecked) checkedCopyTrackIds.add(track.id);
				else checkedCopyTrackIds.delete(track.id);
			} else if (track.status === "phone_only") {
				if (isChecked) checkedDeleteTrackIds.add(track.id);
				else checkedDeleteTrackIds.delete(track.id);
			}
		}
		renderActiveView();
		updateSummaryBar();
	});

	// Tabs Navigation Buttons (Desktop)
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

	// Responsive tabs dropdown selectors
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

	// Virtual scroll container scrolling action
	vsViewport.addEventListener("scroll", () => {
		renderVirtualTracks();
	});

	// Global Keyboard Shortcuts for Undo/Redo (Ctrl+Z / Ctrl+Y)
	window.addEventListener("keydown", (e) => {
		const activeEl = document.activeElement;
		if (activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA")) {
			return;
		}

		if (e.ctrlKey) {
			if (e.key.toLowerCase() === "z") {
				e.preventDefault();
				handleUndo();
			} else if (e.key.toLowerCase() === "y") {
				e.preventDefault();
				handleRedo();
			}
		}
	});
}

// Switch tabs and load view panels
function switchTab(tabId: "artist" | "album" | "genre" | "track") {
	activeTab = tabId;
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

	if (activeTab === "track") {
		elTreeContainer.classList.add("hidden");
		elTrackContainer.classList.remove("hidden");
	} else {
		elTreeContainer.classList.remove("hidden");
		elTrackContainer.classList.add("hidden");
	}

	renderActiveView();
	updateMasterCheckboxState();
}

function proceedWithDeleteOrSync() {
	const deleteTracks = scannedTracks.filter((t) => t.status === "phone_only" && checkedDeleteTrackIds.has(t.id));

	if (deleteTracks.length > 0) {
		elLblDelCount.textContent = String(deleteTracks.length);
		elDeleteTargetList.innerHTML = "";

		for (const t of deleteTracks) {
			const pt = t.phoneTrack;
			const div = document.createElement("div");
			div.className = "py-0.5 border-b border-gray-800 text-red-400";
			div.textContent = `${pt.artist || "Unknown"} - ${pt.title || "Unknown"} [${pt.relativePath}]`;
			elDeleteTargetList.appendChild(div);
		}

		elTxtDeleteVerify.value = "";
		elBtnDeleteConfirmSubmit.disabled = true;
		elModalDeleteConfirm.classList.remove("hidden");
	} else {
		startSyncExecution();
	}
}

// Sync counts and totals inside footer summary
function updateSummaryBar() {
	elCntCheckedCopy.textContent = String(checkedCopyTrackIds.size);
	elCntCheckedDelete.textContent = String(checkedDeleteTrackIds.size);

	const totalChecks = checkedCopyTrackIds.size + checkedMoveTrackIds.size + checkedDeleteTrackIds.size;
	elBtnSyncExec.disabled = totalChecks === 0;
}

// Master Checkbox visual state checker with indeterminate support
function updateMasterCheckboxState() {
	if (filteredTracks.length === 0) {
		elChkMaster.checked = false;
		elChkMaster.indeterminate = false;
		elChkMaster.disabled = true;
		return;
	}
	elChkMaster.disabled = false;

	let checkedCount = 0;
	let totalCopiableOrDeletable = 0;

	for (const track of filteredTracks) {
		if (track.status === "missing" || track.status === "updated") {
			totalCopiableOrDeletable++;
			if (checkedCopyTrackIds.has(track.id)) checkedCount++;
		} else if (track.status === "phone_only") {
			totalCopiableOrDeletable++;
			if (checkedDeleteTrackIds.has(track.id)) checkedCount++;
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

// Sync Execution Trigger
function startSyncExecution() {
	if (!currentProfileId) return;

	elProgressModalTitle.textContent = "同期実行処理中...";
	elLblProgressStatus.textContent = "同期処理を実行しています...";
	elLblProgressPct.textContent = "0%";
	elProgressBarFill.style.width = "0%";
	elProgressLogs.innerHTML = "";
	elBtnProgressClose.disabled = true;
	elModalProgress.classList.remove("hidden");

	const copyTrackIds = Array.from(checkedCopyTrackIds);
	const moveTrackIds = Array.from(checkedMoveTrackIds);
	const deleteTrackIds = Array.from(checkedDeleteTrackIds);

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

	api.executeSync(currentProfileId, {
		copyTrackIds,
		moveTrackIds,
		deleteTrackIds,
	})
		.then(() => {
			if (localStorage.getItem("mock_profiles")) {
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

// Render Profiles Dropdown List
function renderProfileDropdown() {
	elProfileDropdownList.innerHTML = "";
	if (profiles.length === 0) {
		elProfileDropdownList.innerHTML = '<p class="text-xxs text-gray-500 text-center p-3">プロファイルがありません</p>';
		return;
	}

	profiles.forEach((p) => {
		const btn = document.createElement("button");
		btn.className = `w-full text-left px-3 py-2 hover:bg-gray-700 transition flex items-center justify-between ${p.id === currentProfileId ? "bg-indigo-900 bg-opacity-40 text-indigo-300 font-bold" : "text-gray-300"}`;
		btn.innerHTML = `
			<span class="truncate flex-1">${p.name}</span>
			${p.id === currentProfileId ? '<i class="lucide-check text-xs text-indigo-400"></i>' : ""}
		`;

		btn.addEventListener("click", () => selectProfile(p.id));
		elProfileDropdownList.appendChild(btn);
	});
}

// Select Profile and load its view
function selectProfile(id: string) {
	currentProfileId = id;
	const p = profiles.find((x) => x.id === id);
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

	scannedTracks = [];
	filteredTracks = [];
	elTxtSearch.value = "";
	searchQuery = "";

	switchTab("artist");
}

// Filtering core tracks by search query
function applyFilterAndRender() {
	if (searchQuery === "") {
		filteredTracks = scannedTracks;
	} else {
		filteredTracks = scannedTracks.filter((t) => {
			const meta = t.itunesTrack || t.phoneTrack;
			if (!meta) return false;
			return (meta.title || "").toLowerCase().includes(searchQuery) || (meta.artist || "").toLowerCase().includes(searchQuery) || (meta.album || "").toLowerCase().includes(searchQuery);
		});
	}

	renderActiveView();
	updateMasterCheckboxState();
}

// Sync counts and totals inside statistical summary bar
function updateStatsSummary() {
	let total = 0;
	let missing = 0;
	let updated = 0;
	let synced = 0;
	let phoneOnly = 0;
	let pathWarnings = 0;

	scannedTracks.forEach((t) => {
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

// Main Tab rendering trigger
function renderActiveView() {
	updateStatsSummary();
	updateSummaryBar();

	if (activeTab === "artist") renderArtistView();
	else if (activeTab === "album") renderAlbumView();
	else if (activeTab === "genre") renderGenreView();
	else if (activeTab === "track") renderVirtualTracks();
}

// Checkbox togglers with history tracking
function toggleCopyTrackSelection(trackId: string, isChecked: boolean) {
	pushHistoryState();
	if (isChecked) checkedCopyTrackIds.add(trackId);
	else checkedCopyTrackIds.delete(trackId);
	updateSummaryBar();
	updateMasterCheckboxState();
}

function toggleDeleteTrackSelection(trackId: string, isChecked: boolean) {
	pushHistoryState();
	if (isChecked) checkedDeleteTrackIds.add(trackId);
	else checkedDeleteTrackIds.delete(trackId);
	updateSummaryBar();
	updateMasterCheckboxState();
}

// Return color styles representing track status
function getStatusDot(track: any): string {
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
		pathWarnIcon = `<span class="text-amber-500 font-bold ml-1" title="${tooltipText}">⚠️</span>`;
	}

	return `<span class="flex items-center space-x-1.5" title="${label}">
		<span class="w-1.5 h-1.5 rounded-full bg-${track.status} inline-block"></span>
		${pathWarnIcon}
	</span>`;
}

// Helper to set indeterminate state for a dynamically rendered checkbox element
function setCheckboxState(chkId: string, tracks: any[]) {
	setTimeout(() => {
		const el = document.getElementById(chkId) as HTMLInputElement;
		if (!el) return;

		let checkedCount = 0;
		let totalCopiableOrDeletable = 0;

		tracks.forEach((t) => {
			if (t.status === "missing" || t.status === "updated") {
				totalCopiableOrDeletable++;
				if (checkedCopyTrackIds.has(t.id)) checkedCount++;
			} else if (t.status === "phone_only") {
				totalCopiableOrDeletable++;
				if (checkedDeleteTrackIds.has(t.id)) checkedCount++;
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

// --- RENDER ARTIST TREE VIEW ---
function renderArtistView() {
	elTreeContainer.innerHTML = "";
	if (filteredTracks.length === 0) {
		elTreeContainer.innerHTML = '<p class="text-xxs text-gray-500 text-center py-6">該当する曲がありません</p>';
		return;
	}

	const artistMap = new Map<string, any[]>();
	filteredTracks.forEach((t) => {
		const meta = t.itunesTrack || t.phoneTrack;
		const artistName = meta.artist || "Unknown Artist";
		if (!artistMap.has(artistName)) artistMap.set(artistName, []);
		artistMap.get(artistName)!.push(t);
	});

	const sortedArtists = Array.from(artistMap.keys()).sort();

	sortedArtists.forEach((artistName) => {
		const artistTracks = artistMap.get(artistName)!;
		const artistKey = `artist_${artistName}`;
		const isArtistOpen = expandedGroups.has(artistKey);

		const albumMap = new Map<string, any[]>();
		artistTracks.forEach((t) => {
			const meta = t.itunesTrack || t.phoneTrack;
			const albumName = meta.album || "Unknown Album";
			if (!albumMap.has(albumName)) albumMap.set(albumName, []);
			albumMap.get(albumName)!.push(t);
		});

		const sortedAlbums = Array.from(albumMap.keys()).sort();

		const divArtist = document.createElement("div");
		divArtist.className = "bg-gray-800 rounded overflow-hidden border border-gray-750 shadow-sm text-xxs";

		divArtist.innerHTML = `
			<div class="px-3 py-1.5 flex items-center justify-between hover:bg-gray-750 transition cursor-pointer select-none" id="hdr-${artistKey}">
				<div class="flex items-center space-x-2 flex-1 min-w-0">
					<input type="checkbox" id="chk-${artistKey}" class="rounded bg-gray-700 border-gray-650 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5">
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

		elTreeContainer.appendChild(divArtist);
		setCheckboxState(`chk-${artistKey}`, artistTracks);

		const chkArtist = document.getElementById(`chk-${artistKey}`) as HTMLInputElement;
		chkArtist.addEventListener("click", (e) => {
			e.stopPropagation();
			pushHistoryState();
			const isChecked = chkArtist.checked;
			artistTracks.forEach((t) => {
				if (t.status === "missing" || t.status === "updated") {
					if (isChecked) checkedCopyTrackIds.add(t.id);
					else checkedCopyTrackIds.delete(t.id);
				} else if (t.status === "phone_only") {
					if (isChecked) checkedDeleteTrackIds.add(t.id);
					else checkedDeleteTrackIds.delete(t.id);
				}
			});
			renderArtistView();
			updateSummaryBar();
		});

		document.getElementById(`hdr-${artistKey}`)!.addEventListener("click", () => {
			if (isArtistOpen) expandedGroups.delete(artistKey);
			else expandedGroups.add(artistKey);
			renderArtistView();
		});

		if (isArtistOpen) {
			const elChildren = document.getElementById(`children-${artistKey}`)!;
			sortedAlbums.forEach((albumName) => {
				const albumTracks = albumMap.get(albumName)!;
				const albumKey = `artist_${artistName}_album_${albumName}`;
				const isAlbumOpen = expandedGroups.has(albumKey);

				const divAlbum = document.createElement("div");
				divAlbum.className = "border border-gray-700 rounded bg-gray-800 overflow-hidden";
				divAlbum.innerHTML = `
					<div class="px-2.5 py-1.5 flex items-center justify-between hover:bg-gray-750 transition cursor-pointer select-none" id="hdr-${albumKey}">
						<div class="flex items-center space-x-2 flex-1 min-w-0">
							<input type="checkbox" id="chk-${albumKey}" class="rounded bg-gray-700 border-gray-650 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5">
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
							if (isChecked) checkedCopyTrackIds.add(t.id);
							else checkedCopyTrackIds.delete(t.id);
						} else if (t.status === "phone_only") {
							if (isChecked) checkedDeleteTrackIds.add(t.id);
							else checkedDeleteTrackIds.delete(t.id);
						}
					});
					renderArtistView();
					updateSummaryBar();
				});

				document.getElementById(`hdr-${albumKey}`)!.addEventListener("click", () => {
					if (isAlbumOpen) expandedGroups.delete(albumKey);
					else expandedGroups.add(albumKey);
					renderArtistView();
				});

				if (isAlbumOpen) {
					const elTracksChildren = document.getElementById(`children-${albumKey}`)!;
					albumTracks.forEach((t) => {
						const meta = t.itunesTrack || t.phoneTrack;
						const isCopiable = t.status === "missing" || t.status === "updated";
						const isPhoneOnly = t.status === "phone_only";

						const row = document.createElement("div");
						row.className = `px-3 py-1 flex items-center justify-between hover:bg-gray-850 gap-2 bg-${t.status}`;

						row.innerHTML = `
							<div class="flex items-center space-x-2 flex-1 min-w-0">
								<input type="checkbox" id="chk-track-${t.id}" class="rounded bg-gray-700 border-gray-650 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5" ${isCopiable && checkedCopyTrackIds.has(t.id) ? "checked" : ""} ${isPhoneOnly && checkedDeleteTrackIds.has(t.id) ? "checked" : ""}>
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
								toggleCopyTrackSelection(t.id, chkTrack.checked);
							} else if (isPhoneOnly) {
								toggleDeleteTrackSelection(t.id, chkTrack.checked);
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

// --- RENDER ALBUM ACCORDION VIEW ---
function renderAlbumView() {
	elTreeContainer.innerHTML = "";
	if (filteredTracks.length === 0) {
		elTreeContainer.innerHTML = '<p class="text-xxs text-gray-500 text-center py-6">該当するアルバムがありません</p>';
		return;
	}

	const albumMap = new Map<string, any[]>();
	filteredTracks.forEach((t) => {
		const meta = t.itunesTrack || t.phoneTrack;
		const albumName = meta.album || "Unknown Album";
		if (!albumMap.has(albumName)) albumMap.set(albumName, []);
		albumMap.get(albumName)!.push(t);
	});

	const sortedAlbums = Array.from(albumMap.keys()).sort();

	sortedAlbums.forEach((albumName) => {
		const albumTracks = albumMap.get(albumName)!;
		const albumKey = `album_${albumName}`;
		const isAlbumOpen = expandedGroups.has(albumKey);

		const div = document.createElement("div");
		div.className = "bg-gray-800 rounded overflow-hidden border border-gray-750 shadow-sm text-xxs";

		div.innerHTML = `
			<div class="px-3 py-1.5 flex items-center justify-between hover:bg-gray-750 transition cursor-pointer select-none" id="hdr-${albumKey}">
				<div class="flex items-center space-x-2 flex-1 min-w-0">
					<input type="checkbox" id="chk-${albumKey}" class="rounded bg-gray-700 border-gray-650 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5">
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

		elTreeContainer.appendChild(div);
		setCheckboxState(`chk-${albumKey}`, albumTracks);

		const chkAlbum = document.getElementById(`chk-${albumKey}`) as HTMLInputElement;
		chkAlbum.addEventListener("click", (e) => {
			e.stopPropagation();
			pushHistoryState();
			const isChecked = chkAlbum.checked;
			albumTracks.forEach((t) => {
				if (t.status === "missing" || t.status === "updated") {
					if (isChecked) checkedCopyTrackIds.add(t.id);
					else checkedCopyTrackIds.delete(t.id);
				} else if (t.status === "phone_only") {
					if (isChecked) checkedDeleteTrackIds.add(t.id);
					else checkedDeleteTrackIds.delete(t.id);
				}
			});
			renderAlbumView();
			updateSummaryBar();
		});

		document.getElementById(`hdr-${albumKey}`)!.addEventListener("click", () => {
			if (isAlbumOpen) expandedGroups.delete(albumKey);
			else expandedGroups.add(albumKey);
			renderAlbumView();
		});

		if (isAlbumOpen) {
			const elChildren = document.getElementById(`children-${albumKey}`)!;
			albumTracks.forEach((t) => {
				const meta = t.itunesTrack || t.phoneTrack;
				const isCopiable = t.status === "missing" || t.status === "updated";
				const isPhoneOnly = t.status === "phone_only";

				const row = document.createElement("div");
				row.className = `px-3 py-1 flex items-center justify-between hover:bg-gray-900 gap-2 bg-${t.status}`;

				row.innerHTML = `
					<div class="flex items-center space-x-2 flex-1 min-w-0">
						<input type="checkbox" id="chk-track-${t.id}" class="rounded bg-gray-700 border-gray-650 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5" ${isCopiable && checkedCopyTrackIds.has(t.id) ? "checked" : ""} ${isPhoneOnly && checkedDeleteTrackIds.has(t.id) ? "checked" : ""}>
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
						toggleCopyTrackSelection(t.id, chkTrack.checked);
					} else if (isPhoneOnly) {
						toggleDeleteTrackSelection(t.id, chkTrack.checked);
					}
					setCheckboxState(`chk-${albumKey}`, albumTracks);
				});
			});
		}
	});
}

// --- RENDER GENRE ACCORDION VIEW ---
function renderGenreView() {
	elTreeContainer.innerHTML = "";
	if (filteredTracks.length === 0) {
		elTreeContainer.innerHTML = '<p class="text-xxs text-gray-500 text-center py-6">該当するジャンルがありません</p>';
		return;
	}

	const genreMap = new Map<string, any[]>();
	filteredTracks.forEach((t) => {
		const meta = t.itunesTrack || t.phoneTrack;
		const genreName = meta.genre || "Unknown Genre";
		if (!genreMap.has(genreName)) genreMap.set(genreName, []);
		genreMap.get(genreName)!.push(t);
	});

	const sortedGenres = Array.from(genreMap.keys()).sort();

	sortedGenres.forEach((genreName) => {
		const genreTracks = genreMap.get(genreName)!;
		const genreKey = `genre_${genreName}`;
		const isGenreOpen = expandedGroups.has(genreKey);

		const div = document.createElement("div");
		div.className = "bg-gray-800 rounded overflow-hidden border border-gray-750 shadow-sm text-xxs";

		div.innerHTML = `
			<div class="px-3 py-1.5 flex items-center justify-between hover:bg-gray-750 transition cursor-pointer select-none" id="hdr-${genreKey}">
				<div class="flex items-center space-x-2 flex-1 min-w-0">
					<input type="checkbox" id="chk-${genreKey}" class="rounded bg-gray-700 border-gray-650 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5">
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

		elTreeContainer.appendChild(div);
		setCheckboxState(`chk-${genreKey}`, genreTracks);

		const chkGenre = document.getElementById(`chk-${genreKey}`) as HTMLInputElement;
		chkGenre.addEventListener("click", (e) => {
			e.stopPropagation();
			pushHistoryState();
			const isChecked = chkGenre.checked;
			genreTracks.forEach((t) => {
				if (t.status === "missing" || t.status === "updated") {
					if (isChecked) checkedCopyTrackIds.add(t.id);
					else checkedCopyTrackIds.delete(t.id);
				} else if (t.status === "phone_only") {
					if (isChecked) checkedDeleteTrackIds.add(t.id);
					else checkedDeleteTrackIds.delete(t.id);
				}
			});
			renderGenreView();
			updateSummaryBar();
		});

		document.getElementById(`hdr-${genreKey}`)!.addEventListener("click", () => {
			if (isGenreOpen) expandedGroups.delete(genreKey);
			else expandedGroups.add(genreKey);
			renderGenreView();
		});

		if (isGenreOpen) {
			const elChildren = document.getElementById(`children-${genreKey}`)!;
			genreTracks.forEach((t) => {
				const meta = t.itunesTrack || t.phoneTrack;
				const isCopiable = t.status === "missing" || t.status === "updated";
				const isPhoneOnly = t.status === "phone_only";

				const row = document.createElement("div");
				row.className = `px-3 py-1 flex items-center justify-between hover:bg-gray-900 gap-2 bg-${t.status}`;

				row.innerHTML = `
					<div class="flex items-center space-x-2 flex-1 min-w-0">
						<input type="checkbox" id="chk-track-${t.id}" class="rounded bg-gray-700 border-gray-650 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5" ${isCopiable && checkedCopyTrackIds.has(t.id) ? "checked" : ""} ${isPhoneOnly && checkedDeleteTrackIds.has(t.id) ? "checked" : ""}>
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
						toggleCopyTrackSelection(t.id, chkTrack.checked);
					} else if (isPhoneOnly) {
						toggleDeleteTrackSelection(t.id, chkTrack.checked);
					}
					setCheckboxState(`chk-${genreKey}`, genreTracks);
				});
			});
		}
	});
}

// --- RENDER FLAT SONGS TABLE VIEW (VIRTUAL SCROLLER) ---
function renderVirtualTracks() {
	if (activeTab !== "track") return;

	if (filteredTracks.length === 0) {
		vsCanvas.style.height = "0px";
		vsContent.innerHTML = `
			<div class="flex items-center justify-center py-8 text-xxs text-gray-500">
				該当する曲がありません
			</div>
		`;
		return;
	}

	const totalItems = filteredTracks.length;
	const canvasHeight = totalItems * rowHeight;
	vsCanvas.style.height = `${canvasHeight}px`;

	const scrollTop = vsViewport.scrollTop;
	const viewportHeight = vsViewport.offsetHeight || 500;

	let startIdx = Math.floor(scrollTop / rowHeight);
	let endIdx = Math.min(startIdx + Math.ceil(viewportHeight / rowHeight) + 10, totalItems);
	startIdx = Math.max(startIdx - 5, 0);

	const offsetY = startIdx * rowHeight;
	vsContent.style.transform = `translateY(${offsetY}px)`;

	const visibleSlice = filteredTracks.slice(startIdx, endIdx);

	const widthTitle = document.getElementById("th-title")!.style.width || "250px";
	const widthArtist = document.getElementById("th-artist")!.style.width || "180px";
	const widthAlbum = document.getElementById("th-album")!.style.width || "180px";
	const widthTrack = document.getElementById("th-track")!.style.width || "60px";
	const widthGenre = document.getElementById("th-genre")!.style.width || "130px";

	let rowsHtml = "";

	visibleSlice.forEach((t, i) => {
		const idx = startIdx + i;
		const meta = t.itunesTrack || t.phoneTrack;
		const isCopiable = t.status === "missing" || t.status === "updated";
		const isPhoneOnly = t.status === "phone_only";

		const rowChecked = (isCopiable && checkedCopyTrackIds.has(t.id)) || (isPhoneOnly && checkedDeleteTrackIds.has(t.id));

		rowsHtml += `
			<div class="flex items-center text-xxs border-b border-gray-800 hover:bg-gray-800 hover:bg-opacity-40 transition-colors bg-${t.status} select-none pointer-events-auto" style="height: ${rowHeight}px;">
				<div class="flex-shrink-0 text-center flex items-center justify-center" style="width: 50px;">
					<input type="checkbox" data-id="${t.id}" class="vs-row-checkbox rounded bg-gray-700 border-gray-650 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5" ${rowChecked ? "checked" : ""}>
				</div>
				<div class="flex-shrink-0 px-2 truncate-cell font-medium text-gray-200" style="width: ${widthTitle}; min-width: ${widthTitle}; max-width: ${widthTitle};" title="${meta.title}">${meta.title}</div>
				<div class="flex-shrink-0 px-2 truncate-cell text-gray-400" style="width: ${widthArtist}; min-width: ${widthArtist}; max-width: ${widthArtist};" title="${meta.artist}">${meta.artist}</div>
				<div class="flex-shrink-0 px-2 truncate-cell text-gray-400" style="width: ${widthAlbum}; min-width: ${widthAlbum}; max-width: ${widthAlbum};" title="${meta.album}">${meta.album}</div>
				<div class="flex-shrink-0 px-2 truncate-cell text-center font-mono text-gray-500" style="width: ${widthTrack}; min-width: ${widthTrack}; max-width: ${widthTrack};">${meta.track || ""}</div>
				<div class="flex-shrink-0 px-2 truncate-cell text-gray-500" style="width: ${widthGenre}; min-width: ${widthGenre}; max-width: ${widthGenre};" title="${meta.genre}">${meta.genre}</div>
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
			const track = filteredTracks.find((x) => x.id === id);
			if (!track) return;

			const isCopiable = track.status === "missing" || track.status === "updated";
			const isPhoneOnly = track.status === "phone_only";

			if (isCopiable) {
				toggleCopyTrackSelection(track.id, el.checked);
			} else if (isPhoneOnly) {
				toggleDeleteTrackSelection(track.id, el.checked);
			}
		});
	});
}

// Start everything
init();
