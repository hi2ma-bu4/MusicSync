import { api } from "../api";
import { state } from "../state";

// DOM Elements inside dialogs are registered and managed here
export function initModals(cb: { renderProfileDropdown: () => void; selectProfile: (id: string) => void; renderActiveView: () => void; updateSummaryBar: () => void; startSyncExecution: () => void }) {
	const elModalSyncConfirmCount = document.getElementById("modal-sync-confirm-count")!;
	const elBtnSyncConfirmCancel = document.getElementById("btn-sync-confirm-cancel")!;
	const elBtnSyncConfirmSubmit = document.getElementById("btn-sync-confirm-submit")!;

	const elModalDeleteItunesConfirm = document.getElementById("modal-delete-itunes-confirm")!;
	const elLblDelItunesCount = document.getElementById("lbl-del-itunes-count")!;
	const elChkModalDelItunesMaster = document.getElementById("chk-modal-del-itunes-master") as HTMLInputElement;
	const elDeleteItunesTargetList = document.getElementById("delete-itunes-target-list")!;
	const elBtnDelItunesCancel = document.getElementById("btn-del-itunes-cancel")!;
	const elBtnDelItunesConfirmSubmit = document.getElementById("btn-del-itunes-confirm-submit")!;

	const elModalProfile = document.getElementById("modal-profile")!;
	const elFormProfile = document.getElementById("form-profile") as HTMLFormElement;
	const elTxtProfileId = document.getElementById("txt-profile-id") as HTMLInputElement;
	const elTxtProfileName = document.getElementById("txt-profile-name") as HTMLInputElement;
	const elTxtProfileItunes = document.getElementById("txt-profile-itunes") as HTMLInputElement;
	const elTxtProfilePhone = document.getElementById("txt-profile-phone") as HTMLInputElement;
	const elBtnChooseItunes = document.getElementById("btn-choose-itunes")!;
	const elBtnChoosePhone = document.getElementById("btn-choose-phone")!;
	const elBtnProfileCancel = document.getElementById("btn-profile-cancel")!;

	const elModalSettings = document.getElementById("modal-settings")!;
	const elColorMissing = document.getElementById("color-missing") as HTMLInputElement;
	const elColorUpdated = document.getElementById("color-updated") as HTMLInputElement;
	const elColorSynced = document.getElementById("color-synced") as HTMLInputElement;
	const elColorPhoneOnly = document.getElementById("color-phone_only") as HTMLInputElement;
	const elChkSettingsDevMode = document.getElementById("chk-settings-devmode") as HTMLInputElement;
	const elBtnSettingsResetCache = document.getElementById("btn-settings-reset-cache")!;
	const elBtnSettingsCancel = document.getElementById("btn-settings-cancel")!;
	const elBtnSettingsSave = document.getElementById("btn-settings-save")!;

	const elDelimsContainer = document.getElementById("settings-delims-container")!;
	const elExceptionsContainer = document.getElementById("settings-exceptions-container")!;
	const elBtnAddDelim = document.getElementById("btn-settings-add-delim")!;
	const elBtnAddException = document.getElementById("btn-settings-add-exception")!;

	let activeDelims: string[] = [];
	let activeExceptions: string[] = [];

	function renderDelimsInputs() {
		elDelimsContainer.innerHTML = "";
		if (activeDelims.length === 0) {
			elDelimsContainer.innerHTML = '<p class="text-xxs text-gray-500 italic p-1">区切り文字が設定されていません</p>';
			return;
		}
		activeDelims.forEach((delim, idx) => {
			const div = document.createElement("div");
			div.className = "flex items-center space-x-2";
			div.innerHTML = `
				<input type="text" data-idx="${idx}" class="settings-delim-input flex-1 bg-gray-700 border border-gray-650 rounded px-2 py-1 text-white text-xxs font-mono" value="${delim.replace(/"/g, "&quot;")}">
				<button type="button" class="btn-settings-del-delim text-gray-500 hover:text-red-400 p-1 cursor-pointer focus:outline-none" data-idx="${idx}">
					<i class="icon-trash-2 text-xxs"></i>
				</button>
			`;
			elDelimsContainer.appendChild(div);
		});

		elDelimsContainer.querySelectorAll(".settings-delim-input").forEach((el: any) => {
			el.addEventListener("input", () => {
				const idx = parseInt(el.getAttribute("data-idx")!, 10);
				activeDelims[idx] = el.value;
			});
		});

		elDelimsContainer.querySelectorAll(".btn-settings-del-delim").forEach((el: any) => {
			el.addEventListener("click", () => {
				const idx = parseInt(el.getAttribute("data-idx")!, 10);
				activeDelims.splice(idx, 1);
				renderDelimsInputs();
			});
		});
	}

	function renderExceptionsInputs() {
		elExceptionsContainer.innerHTML = "";
		if (activeExceptions.length === 0) {
			elExceptionsContainer.innerHTML = '<p class="text-xxs text-gray-500 italic p-1">例外アーティストが設定されていません</p>';
			return;
		}
		activeExceptions.forEach((exc, idx) => {
			const div = document.createElement("div");
			div.className = "flex items-center space-x-2";
			div.innerHTML = `
				<input type="text" data-idx="${idx}" class="settings-exception-input flex-1 bg-gray-700 border border-gray-650 rounded px-2 py-1 text-white text-xxs" value="${exc.replace(/"/g, "&quot;")}">
				<button type="button" class="btn-settings-del-exception text-gray-500 hover:text-red-400 p-1 cursor-pointer focus:outline-none" data-idx="${idx}">
					<i class="icon-trash-2 text-xxs"></i>
				</button>
			`;
			elExceptionsContainer.appendChild(div);
		});

		elExceptionsContainer.querySelectorAll(".settings-exception-input").forEach((el: any) => {
			el.addEventListener("input", () => {
				const idx = parseInt(el.getAttribute("data-idx")!, 10);
				activeExceptions[idx] = el.value;
			});
		});

		elExceptionsContainer.querySelectorAll(".btn-settings-del-exception").forEach((el: any) => {
			el.addEventListener("click", () => {
				const idx = parseInt(el.getAttribute("data-idx")!, 10);
				activeExceptions.splice(idx, 1);
				renderExceptionsInputs();
			});
		});
	}

	elBtnAddDelim.addEventListener("click", () => {
		activeDelims.push("");
		renderDelimsInputs();
		setTimeout(() => {
			const inputs = elDelimsContainer.querySelectorAll(".settings-delim-input");
			if (inputs.length > 0) {
				(inputs[inputs.length - 1] as HTMLInputElement).focus();
			}
		}, 50);
	});

	elBtnAddException.addEventListener("click", () => {
		activeExceptions.push("");
		renderExceptionsInputs();
		setTimeout(() => {
			const inputs = elExceptionsContainer.querySelectorAll(".settings-exception-input");
			if (inputs.length > 0) {
				(inputs[inputs.length - 1] as HTMLInputElement).focus();
			}
		}, 50);
	});

	const elModalDeleteConfirm = document.getElementById("modal-delete-confirm")!;
	const elDeleteTargetList = document.getElementById("delete-target-list")!;
	const elLblDelCount = document.getElementById("lbl-del-count")!;
	const elTxtDeleteVerify = document.getElementById("txt-delete-verify") as HTMLInputElement;
	const elBtnDeleteCancel = document.getElementById("btn-delete-cancel")!;
	const elBtnDeleteConfirmSubmit = document.getElementById("btn-delete-confirm-submit") as HTMLButtonElement;

	const elModalMoveConfirm = document.getElementById("modal-move-confirm")!;
	const elLblMoveCount = document.getElementById("lbl-move-count")!;
	const elChkModalMoveMaster = document.getElementById("chk-modal-move-master") as HTMLInputElement;
	const elMoveTargetList = document.getElementById("move-target-list")!;
	const elBtnMoveCancel = document.getElementById("btn-move-cancel")!;
	const elBtnMoveConfirmSubmit = document.getElementById("btn-move-confirm-submit")!;

	const elModalOverwriteConfirm = document.getElementById("modal-overwrite-confirm")!;
	const elLblOverwriteCount = document.getElementById("lbl-overwrite-count")!;
	const elChkModalOverwriteMaster = document.getElementById("chk-modal-overwrite-master") as HTMLInputElement;
	const elOverwriteTargetList = document.getElementById("overwrite-target-list")!;
	const elBtnOverwriteCancel = document.getElementById("btn-overwrite-cancel")!;
	const elBtnOverwriteConfirmSubmit = document.getElementById("btn-overwrite-confirm-submit")!;

	// Profile choosing
	elBtnChooseItunes.addEventListener("click", async () => {
		const path = await api.selectFolder();
		if (path) elTxtProfileItunes.value = path;
	});

	elBtnChoosePhone.addEventListener("click", async () => {
		const path = await api.selectFolder();
		if (path) elTxtProfilePhone.value = path;
	});

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

		state.profiles = await api.saveProfile(profile);
		elModalProfile.classList.add("hidden");
		cb.renderProfileDropdown();
		cb.selectProfile(id);
	});

	// Colors and Extra Settings
	elBtnSettingsCancel.addEventListener("click", () => {
		elModalSettings.classList.add("hidden");
	});

	elBtnSettingsSave.addEventListener("click", async () => {
		const delimiters = activeDelims.map((s) => s.trim()).filter((s) => s.length > 0);
		const exceptions = activeExceptions.map((s) => s.trim()).filter((s) => s.length > 0);

		const newSettings = {
			colorMissing: elColorMissing.value,
			colorUpdated: elColorUpdated.value,
			colorSynced: elColorSynced.value,
			colorPhoneOnly: elColorPhoneOnly.value,
			delimiters,
			exceptions,
			devMode: elChkSettingsDevMode.checked,
		};
		await api.saveSettings(newSettings);
		state.currentSettings = newSettings;
		updateDynamicColors(newSettings);
		elModalSettings.classList.add("hidden");
		cb.renderActiveView();
	});

	elBtnSettingsResetCache.addEventListener("click", async () => {
		if (confirm("スキャン結果キャッシュおよびサムネイル画像を全て削除（リセット）します。よろしいですか？")) {
			try {
				await api.resetCache();
				alert("キャッシュの全削除が完了しました。");
				elModalSettings.classList.add("hidden");
				if (state.currentProfileId) {
					const btnScan = document.getElementById("btn-scan");
					if (btnScan) {
						(btnScan as HTMLButtonElement).click();
					}
				}
			} catch (e: any) {
				alert("キャッシュ削除中にエラーが発生しました: " + e.message);
			}
		}
	});

	// Sync count confirm modal
	elBtnSyncConfirmCancel.addEventListener("click", () => {
		elModalSyncConfirmCount.classList.add("hidden");
	});

	elBtnSyncConfirmSubmit.addEventListener("click", () => {
		elModalSyncConfirmCount.classList.add("hidden");

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
				row.className = "py-2 flex items-center justify-between text-xxs hover:bg-gray-900/60 gap-3 border-b border-gray-800";

				row.innerHTML = `
					<label for="chk-modal-move-${t.id}" class="flex items-center space-x-2 flex-1 min-w-0 cursor-pointer select-none">
						<input type="checkbox" id="chk-modal-move-${t.id}" class="chk-modal-move-item rounded bg-gray-700 border-gray-650 text-indigo-500 focus:ring-indigo-400 h-3.5 w-3.5" ${state.checkedMoveTrackIds.has(t.id) ? "checked" : ""}>
						<div class="truncate flex-1">
							<div class="font-semibold text-gray-200">${it.artist} - ${it.title}</div>
							<div class="text-gray-500 truncate font-mono text-xxs">現在: ${pt.relativePath} -> iTunes: ${it.relativePath}</div>
						</div>
					</label>
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
					cb.updateSummaryBar();
				});
			});

			elModalMoveConfirm.classList.remove("hidden");
		} else {
			proceedWithOverwriteConfirmOrDelete();
		}
	});

	// Reorganization move modal
	elChkModalMoveMaster.addEventListener("change", () => {
		const isChecked = elChkModalMoveMaster.checked;
		const pathsMismatchedSelected = state.scannedTracks.filter((t) => (t.status === "missing" || t.status === "updated" || t.status === "synced") && t.pathMismatch && (state.checkedCopyTrackIds.has(t.id) || state.checkedMoveTrackIds.has(t.id)));

		pathsMismatchedSelected.forEach((t) => {
			if (isChecked) {
				state.checkedMoveTrackIds.add(t.id);
			} else {
				state.checkedMoveTrackIds.delete(t.id);
			}
			const chk = document.getElementById(`chk-modal-move-${t.id}`) as HTMLInputElement;
			if (chk) chk.checked = isChecked;
		});
		cb.updateSummaryBar();
	});

	elBtnMoveCancel.addEventListener("click", () => {
		elModalMoveConfirm.classList.add("hidden");
	});

	elBtnMoveConfirmSubmit.addEventListener("click", () => {
		elModalMoveConfirm.classList.add("hidden");
		proceedWithOverwriteConfirmOrDelete();
	});

	// Overwrite/Metadata Update modal listeners
	elChkModalOverwriteMaster.addEventListener("change", () => {
		const isChecked = elChkModalOverwriteMaster.checked;
		const overwriteTracksSelected = state.scannedTracks.filter((t) => t.status === "updated" && state.checkedCopyTrackIds.has(t.id));

		overwriteTracksSelected.forEach((t) => {
			if (isChecked) {
				state.checkedCopyTrackIds.add(t.id);
			} else {
				state.checkedCopyTrackIds.delete(t.id);
			}
			const chk = document.getElementById(`chk-modal-overwrite-${t.id}`) as HTMLInputElement;
			if (chk) chk.checked = isChecked;
		});
		cb.updateSummaryBar();
	});

	elBtnOverwriteCancel.addEventListener("click", () => {
		elModalOverwriteConfirm.classList.add("hidden");
	});

	elBtnOverwriteConfirmSubmit.addEventListener("click", () => {
		elModalOverwriteConfirm.classList.add("hidden");
		proceedWithDeleteOrSync();
	});

	function proceedWithOverwriteConfirmOrDelete() {
		const overwriteTracksSelected = state.scannedTracks.filter((t) => t.status === "updated" && state.checkedCopyTrackIds.has(t.id));

		if (overwriteTracksSelected.length > 0) {
			elLblOverwriteCount.textContent = String(overwriteTracksSelected.length);
			elOverwriteTargetList.innerHTML = "";

			let allChecked = true;
			overwriteTracksSelected.forEach((t) => {
				if (!state.checkedCopyTrackIds.has(t.id)) allChecked = false;
			});
			elChkModalOverwriteMaster.checked = allChecked;

			overwriteTracksSelected.forEach((t) => {
				const it = t.itunesTrack!;
				const row = document.createElement("div");
				row.className = "py-2 flex items-center justify-between text-xxs hover:bg-gray-900/60 gap-3 border-b border-gray-800";

				row.innerHTML = `
					<label for="chk-modal-overwrite-${t.id}" class="flex items-center space-x-2 flex-1 min-w-0 cursor-pointer select-none">
						<input type="checkbox" id="chk-modal-overwrite-${t.id}" class="chk-modal-overwrite-item rounded bg-gray-700 border-gray-650 text-indigo-500 focus:ring-indigo-400 h-3.5 w-3.5" ${state.checkedCopyTrackIds.has(t.id) ? "checked" : ""}>
						<div class="truncate flex-1">
							<div class="font-semibold text-gray-200">${it.artist} - ${it.title}</div>
							<div class="text-gray-500 truncate font-mono text-xxs">${it.relativePath}</div>
						</div>
					</label>
				`;
				elOverwriteTargetList.appendChild(row);

				const chkOverwrite = document.getElementById(`chk-modal-overwrite-${t.id}`) as HTMLInputElement;
				chkOverwrite.addEventListener("change", () => {
					if (chkOverwrite.checked) {
						state.checkedCopyTrackIds.add(t.id);
					} else {
						state.checkedCopyTrackIds.delete(t.id);
					}
					let allCheckState = true;
					document.querySelectorAll(".chk-modal-overwrite-item").forEach((el: any) => {
						if (!el.checked) allCheckState = false;
					});
					elChkModalOverwriteMaster.checked = allCheckState;
					cb.updateSummaryBar();
				});
			});

			elModalOverwriteConfirm.classList.remove("hidden");
		} else {
			proceedWithDeleteOrSync();
		}
	}

	// iTunes-side delete checklist modal listeners
	elChkModalDelItunesMaster.addEventListener("change", () => {
		const isChecked = elChkModalDelItunesMaster.checked;
		const deleteItunesTracks = state.scannedTracks.filter((t) => (t.status === "synced" || t.status === "updated") && state.checkedDeleteTrackIds.has(t.id));

		deleteItunesTracks.forEach((t) => {
			if (isChecked) {
				state.checkedDeleteItunesTrackIds.add(t.id);
			} else {
				state.checkedDeleteItunesTrackIds.delete(t.id);
			}
			const chk = document.getElementById(`chk-modal-del-itunes-${t.id}`) as HTMLInputElement;
			if (chk) chk.checked = isChecked;
		});
		cb.updateSummaryBar();
	});

	elBtnDelItunesCancel.addEventListener("click", () => {
		elModalDeleteItunesConfirm.classList.add("hidden");
	});

	elBtnDelItunesConfirmSubmit.addEventListener("click", () => {
		elModalDeleteItunesConfirm.classList.add("hidden");
		proceedWithPhoneOnlyDeleteOrSync();
	});

	// Delete confirm
	elBtnDeleteCancel.addEventListener("click", () => {
		elModalDeleteConfirm.classList.add("hidden");
	});

	elBtnDeleteConfirmSubmit.addEventListener("click", () => {
		elModalDeleteConfirm.classList.add("hidden");
		cb.startSyncExecution();
	});

	elTxtDeleteVerify.addEventListener("input", () => {
		elBtnDeleteConfirmSubmit.disabled = elTxtDeleteVerify.value.trim() !== "DELETE";
	});

	function proceedWithDeleteOrSync() {
		const deleteItunesTracks = state.scannedTracks.filter((t) => (t.status === "synced" || t.status === "updated") && state.checkedDeleteTrackIds.has(t.id));

		if (deleteItunesTracks.length > 0) {
			elLblDelItunesCount.textContent = String(deleteItunesTracks.length);
			elDeleteItunesTargetList.innerHTML = "";

			elChkModalDelItunesMaster.checked = false;
			state.checkedDeleteItunesTrackIds.clear();

			deleteItunesTracks.forEach((t) => {
				const pt = t.phoneTrack!;
				const row = document.createElement("div");
				row.className = "py-2 flex items-center justify-between text-xxs hover:bg-gray-900/60 gap-3 border-b border-gray-800";

				row.innerHTML = `
					<label for="chk-modal-del-itunes-${t.id}" class="flex items-center space-x-2 flex-1 min-w-0 cursor-pointer select-none">
						<input type="checkbox" id="chk-modal-del-itunes-${t.id}" class="chk-modal-del-itunes-item rounded bg-gray-700 border-gray-650 text-red-500 focus:ring-red-400 h-3.5 w-3.5">
						<div class="truncate flex-1">
							<div class="font-semibold text-gray-200">${pt.artist || "Unknown"} - ${pt.title || "Unknown"}</div>
							<div class="text-gray-500 truncate font-mono text-xxs">${pt.relativePath}</div>
						</div>
					</label>
				`;
				elDeleteItunesTargetList.appendChild(row);

				const chkDel = document.getElementById(`chk-modal-del-itunes-${t.id}`) as HTMLInputElement;
				chkDel.addEventListener("change", () => {
					if (chkDel.checked) {
						state.checkedDeleteItunesTrackIds.add(t.id);
					} else {
						state.checkedDeleteItunesTrackIds.delete(t.id);
					}
					let allCheckState = true;
					document.querySelectorAll(".chk-modal-del-itunes-item").forEach((el: any) => {
						if (!el.checked) allCheckState = false;
					});
					elChkModalDelItunesMaster.checked = allCheckState;
					cb.updateSummaryBar();
				});
			});

			elModalDeleteItunesConfirm.classList.remove("hidden");
		} else {
			proceedWithPhoneOnlyDeleteOrSync();
		}
	}

	function proceedWithPhoneOnlyDeleteOrSync() {
		const deletePhoneOnlyTracks = state.scannedTracks.filter((t) => t.status === "phone_only" && state.checkedDeleteTrackIds.has(t.id));

		if (deletePhoneOnlyTracks.length > 0) {
			elLblDelCount.textContent = String(deletePhoneOnlyTracks.length);
			elDeleteTargetList.innerHTML = "";

			for (const t of deletePhoneOnlyTracks) {
				const pt = t.phoneTrack!;
				const div = document.createElement("div");
				div.className = "py-0.5 border-b border-gray-800 text-red-400";
				div.textContent = `${pt.artist || "Unknown"} - ${pt.title || "Unknown"} [${pt.relativePath}]`;
				elDeleteTargetList.appendChild(div);
			}

			elTxtDeleteVerify.value = "";
			elBtnDeleteConfirmSubmit.disabled = true;
			elModalDeleteConfirm.classList.remove("hidden");
		} else {
			cb.startSyncExecution();
		}
	}

	return {
		loadSettings(delimiters: string[], exceptions: string[], devMode: boolean) {
			activeDelims = [...delimiters];
			activeExceptions = [...exceptions];
			if (elChkSettingsDevMode) {
				elChkSettingsDevMode.checked = !!devMode;
			}
			renderDelimsInputs();
			renderExceptionsInputs();
		},
	};
}

export function updateDynamicColors(settings: any) {
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

		.bg-phone_only { background-color: rgba(239, 68, 68, 0.12) !important; }
		.text-phone_only { color: var(--color-phone-only) !important; }
		.border-phone_only { border-color: var(--color-phone-only) !important; }
	`;
}
