import { app } from "electron";
import { createWindow } from "./main/index";
import { registerIpcHandlers } from "./main/ipc";

app.whenReady().then(() => {
	registerIpcHandlers();
	createWindow();
});
