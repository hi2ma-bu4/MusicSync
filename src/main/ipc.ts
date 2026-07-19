import { app, dialog, ipcMain } from "electron";
import Store from "electron-store";
import fs from "node:fs";
import path from "node:path";
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

	ipcMain.handle("get-thumbnail", async (_event, profileId: string, albumName: string) => {
		try {
			if (!profileId || !albumName) return null;
			const albumHex = Buffer.from(albumName).toString("hex");
			const thumbnailsDir = path.join(app.getPath("userData"), "caches", "thumbnails", profileId);
			if (!fs.existsSync(thumbnailsDir)) {
				fs.mkdirSync(thumbnailsDir, { recursive: true });
			}

			const pngPath = path.join(thumbnailsDir, `${albumHex}.png`);
			const metaPath = path.join(thumbnailsDir, `${albumHex}.meta.json`);

			// Find track in scan results
			const results = lastScanResults[profileId] || [];
			const trackItem = results.find((t) => {
				const meta = t.itunesTrack || t.phoneTrack;
				return meta && meta.album === albumName && meta.hasCoverArt;
			});

			if (!trackItem) {
				return null; // No cover art for this album
			}

			const track = trackItem.itunesTrack || trackItem.phoneTrack;
			if (!track) return null;

			let needRegenerate = true;

			if (fs.existsSync(pngPath) && fs.existsSync(metaPath)) {
				try {
					const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
					if (meta.size === track.coverArtSize) {
						needRegenerate = false;
					}
				} catch (e) {
					// Ignore
				}
			}

			if (needRegenerate) {
				const { parseFile } = await import("music-metadata");
				const { nativeImage } = await import("electron");

				if (!fs.existsSync(track.filePath)) {
					return null;
				}

				const metadata = await parseFile(track.filePath, { skipCovers: false });
				const picture = metadata.common.picture && metadata.common.picture[0];
				if (!picture) {
					return null;
				}

				const img = nativeImage.createFromBuffer(Buffer.from(picture.data));
				const resized = img.resize({ width: 150, height: 150, quality: "better" });
				const pngBuf = resized.toPNG();

				fs.writeFileSync(pngPath, Buffer.from(pngBuf));
				fs.writeFileSync(metaPath, JSON.stringify({ size: track.coverArtSize }), "utf-8");
			}

			const cachedBuf = fs.readFileSync(pngPath);
			return `data:image/png;base64,${cachedBuf.toString("base64")}`;
		} catch (e) {
			console.error("Failed to get or generate thumbnail", e);
			return null;
		}
	});
}
