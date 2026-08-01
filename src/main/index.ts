import { BrowserWindow, dialog } from "electron";
import Store from "electron-store";
import path from "node:path";

import { getAppCloseStates } from "./ipc";
import { closeAllActiveMtpWrappers } from "./storageWrapper";

export function createWindow() {
	const win = new BrowserWindow({
		width: 1200,
		height: 800,
		webPreferences: {
			preload: path.join(process.cwd(), "dist", "preload.js"),
			contextIsolation: true,
		},
	});

	const store = new Store();

	win.on("close", (e) => {
		const { isScanRunning, isSyncRunning, unsyncedChangesCount } = getAppCloseStates();

		if (isScanRunning || isSyncRunning) {
			const choice = dialog.showMessageBoxSync(win, {
				type: "question",
				buttons: ["終了する", "キャンセル"],
				defaultId: 1,
				cancelId: 1,
				title: "処理実行中の確認",
				message: "現在、スキャンまたは同期処理が実行中です。途中で終了するとデータが破損する恐れがあります。本当にアプリを終了しますか？",
			});
			if (choice !== 0) {
				e.preventDefault();
				return;
			}
		} else if (unsyncedChangesCount > 0) {
			const choice = dialog.showMessageBoxSync(win, {
				type: "question",
				buttons: ["終了する", "キャンセル"],
				defaultId: 1,
				cancelId: 1,
				title: "未同期の変更あり",
				message: "同期されていない変更（選択状態の変更）があります。終了すると現在の変更状態は破棄されます。本当にアプリを終了しますか？",
			});
			if (choice !== 0) {
				e.preventDefault();
				return;
			}
		}

		console.log("[Window] Window is closing. Cleaning up MTP wrappers...");
		closeAllActiveMtpWrappers().catch((err) => {
			console.error("[Window] Error during MTP wrapper close cleanup:", err);
		});
	});

	win.webContents.on("before-input-event", (event, input) => {
		if ((input.control || input.meta) && input.shift && input.key.toLowerCase() === "i") {
			const settings = store.get("settings", {}) as any;
			if (settings && settings.devMode) {
				win.webContents.toggleDevTools();
				event.preventDefault();
			}
		}
	});

	win.setMenuBarVisibility(false);
	win.removeMenu();

	win.loadFile(path.join(process.cwd(), "dist", "index.html"));

	// win.webContents.openDevTools();
}
