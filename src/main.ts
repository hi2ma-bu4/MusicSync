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

app.whenReady().then(() => {
	registerIpcHandlers();
	createWindow();
});
