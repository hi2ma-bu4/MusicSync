import { BrowserWindow } from "electron";
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

	win.setMenuBarVisibility(false);
	win.removeMenu();

	win.loadFile(path.join(process.cwd(), "dist", "index.html"));
}
