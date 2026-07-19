import { dialog, ipcMain } from "electron";
import Store from "electron-store";
import { lastScanResults, runScan } from "./scanner";
import { runSync } from "./sync";

const store = new Store();

export function registerIpcHandlers() {
	ipcMain.handle("get-profiles", () => {
		return store.get("profiles", []);
	});

	ipcMain.handle("save-profile", (_event, profile: any) => {
		const profiles: any[] = store.get("profiles", []) as any[];
		const index = profiles.findIndex((p) => p.id === profile.id);
		if (index > -1) {
			profiles[index] = profile;
		} else {
			profiles.push(profile);
		}
		store.set("profiles", profiles);
		return profiles;
	});

	ipcMain.handle("delete-profile", (_event, id: string) => {
		let profiles: any[] = store.get("profiles", []) as any[];
		profiles = profiles.filter((p) => p.id !== id);
		store.set("profiles", profiles);
		return profiles;
	});

	ipcMain.handle("get-settings", () => {
		return store.get("settings", {
			colorMissing: "#22c55e",
			colorUpdated: "#f59e0b",
			colorSynced: "#94a3b8",
			colorPhoneOnly: "#ef4444",
		});
	});

	ipcMain.handle("save-settings", (_event, settings: any) => {
		store.set("settings", settings);
	});

	ipcMain.handle("select-folder", async () => {
		const result = await dialog.showOpenDialog({
			properties: ["openDirectory"],
		});
		if (result.canceled) {
			return null;
		}
		return result.filePaths[0];
	});

	ipcMain.handle("start-scan", async (event, profileId: string) => {
		const profiles: any[] = store.get("profiles", []) as any[];
		const profile = profiles.find((p) => p.id === profileId);
		if (!profile) {
			throw new Error("Profile not found");
		}
		await runScan(profile, event);
	});

	ipcMain.handle("get-scan-result", (_event, profileId: string) => {
		return lastScanResults[profileId] || [];
	});

	ipcMain.handle("execute-sync", async (event, profileId: string, options: any) => {
		const profiles: any[] = store.get("profiles", []) as any[];
		const profile = profiles.find((p) => p.id === profileId);
		if (!profile) {
			throw new Error("Profile not found");
		}
		await runSync(profile, options, event);
	});
}
