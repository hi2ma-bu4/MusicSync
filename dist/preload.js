"use strict";

// src/preload.ts
var import_electron = require("electron");
import_electron.contextBridge.exposeInMainWorld("api", {
  showItemInFolder: (filePath) => import_electron.ipcRenderer.invoke("show-item-in-folder", filePath),
  selectFolder: () => import_electron.ipcRenderer.invoke("select-folder"),
  getProfiles: () => import_electron.ipcRenderer.invoke("get-profiles"),
  saveProfile: (profile) => import_electron.ipcRenderer.invoke("save-profile", profile),
  deleteProfile: (id) => import_electron.ipcRenderer.invoke("delete-profile", id),
  getSettings: () => import_electron.ipcRenderer.invoke("get-settings"),
  saveSettings: (settings) => import_electron.ipcRenderer.invoke("save-settings", settings),
  resetCache: (profileId) => import_electron.ipcRenderer.invoke("reset-cache", profileId),
  showContextMenu: (params) => import_electron.ipcRenderer.send("show-context-menu", params),
  getUsbDevices: () => import_electron.ipcRenderer.invoke("get-usb-devices"),
  getMtpDeviceNames: () => import_electron.ipcRenderer.invoke("get-mtp-device-names"),
  cancelActiveTask: () => import_electron.ipcRenderer.invoke("cancel-active-task"),
  onContextMenuCommand: (callback) => {
    const listener = (_event, payload) => callback(payload.command, payload.arg);
    import_electron.ipcRenderer.on("context-menu-command", listener);
    return () => {
      import_electron.ipcRenderer.removeListener("context-menu-command", listener);
    };
  },
  startScan: (profileId) => import_electron.ipcRenderer.invoke("start-scan", profileId),
  getScanResult: (profileId) => import_electron.ipcRenderer.invoke("get-scan-result", profileId),
  executeSync: (profileId, options) => import_electron.ipcRenderer.invoke("execute-sync", profileId, options),
  updateUnsyncedChangesCount: (count) => import_electron.ipcRenderer.send("update-unsynced-changes-count", count),
  getThumbnail: (profileId, albumName) => import_electron.ipcRenderer.invoke("get-thumbnail", profileId, albumName),
  copyAlbumArt: (profileId, albumName) => import_electron.ipcRenderer.invoke("copy-album-art", profileId, albumName),
  onScanProgress: (callback) => {
    const listener = (_event, progress) => callback(progress);
    import_electron.ipcRenderer.on("scan-progress", listener);
    return () => {
      import_electron.ipcRenderer.removeListener("scan-progress", listener);
    };
  },
  onSyncProgress: (callback) => {
    const listener = (_event, progress) => callback(progress);
    import_electron.ipcRenderer.on("sync-progress", listener);
    return () => {
      import_electron.ipcRenderer.removeListener("sync-progress", listener);
    };
  }
});
//# sourceMappingURL=preload.js.map
