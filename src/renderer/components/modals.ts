import { api } from "../api";
import { state } from "../state";

// DOM Elements inside dialogs are registered and managed here
export function initModals(cb: { renderProfileDropdown: () => void; selectProfile: (id: string) => void; renderActiveView: () => void; updateSummaryBar: () => void; startSyncExecution: () => void }) {
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
	const elColorPhoneOnly = document.getElementById("color-phone-only") as HTMLInputElement;
	const elBtnSettingsCancel = document.getElementById("btn-settings-cancel")!;
	const elBtnSettingsSave = document.getElementById("btn-settings-save")!;

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

	// Colors
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
		state.currentSettings = newSettings;
		updateDynamicColors(newSettings);
		elModalSettings.classList.add("hidden");
		cb.renderActiveView();
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
		proceedWithDeleteOrSync();
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
		elBtnDeleteConfirmSubmit.disabled = elTxtDeleteVerify.value.trim() !== "削除";
	});

	function proceedWithDeleteOrSync() {
		const deleteTracks = state.scannedTracks.filter((t) => t.status === "phone_only" && state.checkedDeleteTrackIds.has(t.id));

		if (deleteTracks.length > 0) {
			elLblDelCount.textContent = String(deleteTracks.length);
			elDeleteTargetList.innerHTML = "";

			for (const t of deleteTracks) {
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

		.bg-phone-only { background-color: rgba(239, 68, 68, 0.12) !important; }
		.text-phone-only { color: var(--color-phone-only) !important; }
		.border-phone-only { border-color: var(--color-phone-only) !important; }
	`;
}
