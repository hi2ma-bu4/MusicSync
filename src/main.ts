import { app, protocol } from "electron";
import { createWindow } from "./main/index";
import { registerIpcHandlers } from "./main/ipc";

protocol.registerSchemesAsPrivileged([
	{
		scheme: "media",
		privileges: {
			standard: true,
			secure: true,
			supportFetchAPI: true,
			bypassCSP: true,
			stream: true,
		},
	},
]);

import { closeAllActiveMtpWrappers } from "./main/storageWrapper";

app.on("before-quit", (event) => {
	console.log("[App] before-quit triggered. Cleaning up MTP wrappers...");
	event.preventDefault();
	closeAllActiveMtpWrappers()
		.catch((err) => {
			console.error("[App] Error cleaning up MTP wrappers on exit:", err);
		})
		.finally(() => {
			app.exit();
		});
});

app.whenReady().then(() => {
	registerIpcHandlers();
	createWindow();
});
