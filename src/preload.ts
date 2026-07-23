import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("api", {
	showItemInFolder: (filePath: string) => ipcRenderer.invoke("show-item-in-folder", filePath),
	selectFolder: () => ipcRenderer.invoke("select-folder"),
	getProfiles: () => ipcRenderer.invoke("get-profiles"),
	saveProfile: (profile: any) => ipcRenderer.invoke("save-profile", profile),
	deleteProfile: (id: string) => ipcRenderer.invoke("delete-profile", id),
	getSettings: () => ipcRenderer.invoke("get-settings"),
	saveSettings: (settings: any) => ipcRenderer.invoke("save-settings", settings),
	resetCache: () => ipcRenderer.invoke("reset-cache"),
	showContextMenu: (params: any) => ipcRenderer.send("show-context-menu", params),
	getUsbDevices: () => ipcRenderer.invoke("get-usb-devices"),
	getMtpDeviceNames: () => ipcRenderer.invoke("get-mtp-device-names"),
	onContextMenuCommand: (callback: (command: string, arg: string) => void) => {
		const listener = (_event: any, payload: { command: string; arg: string }) => callback(payload.command, payload.arg);
		ipcRenderer.on("context-menu-command", listener);
		return () => {
			ipcRenderer.removeListener("context-menu-command", listener);
		};
	},
	startScan: (profileId: string) => ipcRenderer.invoke("start-scan", profileId),
	getScanResult: (profileId: string) => ipcRenderer.invoke("get-scan-result", profileId),
	executeSync: (profileId: string, options: any) => ipcRenderer.invoke("execute-sync", profileId, options),
	getThumbnail: (profileId: string, albumName: string) => ipcRenderer.invoke("get-thumbnail", profileId, albumName),
	onScanProgress: (callback: (progress: any) => void) => {
		const listener = (_event: any, progress: any) => callback(progress);
		ipcRenderer.on("scan-progress", listener);
		return () => {
			ipcRenderer.removeListener("scan-progress", listener);
		};
	},
	onSyncProgress: (callback: (progress: any) => void) => {
		const listener = (_event: any, progress: any) => callback(progress);
		ipcRenderer.on("sync-progress", listener);
		return () => {
			ipcRenderer.removeListener("sync-progress", listener);
		};
	},
});
