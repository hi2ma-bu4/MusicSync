// src/preload.ts
import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("api", {
  selectFolder: () => ipcRenderer.invoke("select-folder"),
  getProfiles: () => ipcRenderer.invoke("get-profiles"),
  saveProfile: (profile) => ipcRenderer.invoke("save-profile", profile),
  deleteProfile: (id) => ipcRenderer.invoke("delete-profile", id),
  getSettings: () => ipcRenderer.invoke("get-settings"),
  saveSettings: (settings) => ipcRenderer.invoke("save-settings", settings),
  startScan: (profileId) => ipcRenderer.invoke("start-scan", profileId),
  getScanResult: (profileId) => ipcRenderer.invoke("get-scan-result", profileId),
  executeSync: (profileId, options) => ipcRenderer.invoke("execute-sync", profileId, options),
  getThumbnail: (profileId, albumName) => ipcRenderer.invoke("get-thumbnail", profileId, albumName),
  onScanProgress: (callback) => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on("scan-progress", listener);
    return () => {
      ipcRenderer.removeListener("scan-progress", listener);
    };
  },
  onSyncProgress: (callback) => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on("sync-progress", listener);
    return () => {
      ipcRenderer.removeListener("sync-progress", listener);
    };
  }
});
//# sourceMappingURL=preload.js.map
