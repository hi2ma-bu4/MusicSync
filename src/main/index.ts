import { BrowserWindow } from "electron";
import Store from "electron-store";
import path from "node:path";

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
