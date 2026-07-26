import { app, clipboard, dialog, ipcMain, Menu, MenuItem, nativeImage, protocol, shell } from "electron";
import Store from "electron-store";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { DEFAULT_DELIMITERS } from "../shared/constants";
import { lastScanResults, runScan } from "./scanner";
import { runSync } from "./sync";

const store = new Store();

export function registerIpcHandlers() {
	protocol.handle("media", async (request) => {
		try {
			const url = new URL(request.url);
			const hexStr = url.pathname.slice(1);
			const decodedPath = Buffer.from(hexStr, "hex").toString("utf-8");

			if (!fs.existsSync(decodedPath)) {
				console.error(`[media protocol] File not found on disk: "${decodedPath}"`);
				return new Response("Not Found", { status: 404 });
			}

			const stat = fs.statSync(decodedPath);
			const fileSize = stat.size;

			const ext = path.extname(decodedPath).toLowerCase();
			let contentType = "audio/mpeg";
			if (ext === ".m4a") {
				contentType = "audio/mp4";
			} else if (ext === ".wav") {
				contentType = "audio/wav";
			} else if (ext === ".flac") {
				contentType = "audio/flac";
			} else if (ext === ".ogg") {
				contentType = "audio/ogg";
			}

			const rangeHeader = request.headers.get("range") || request.headers.get("Range");

			if (rangeHeader) {
				const parts = rangeHeader.replace(/bytes=/, "").split("-");
				const start = parseInt(parts[0], 10);
				const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
				const chunkSize = end - start + 1;

				const nodeStream = fs.createReadStream(decodedPath, { start, end });
				const webStream = Readable.toWeb(nodeStream);

				return new Response(webStream as any, {
					status: 206,
					statusText: "Partial Content",
					headers: {
						"Content-Range": `bytes ${start}-${end}/${fileSize}`,
						"Accept-Ranges": "bytes",
						"Content-Length": String(chunkSize),
						"Content-Type": contentType,
					},
				});
			} else {
				const nodeStream = fs.createReadStream(decodedPath);
				const webStream = Readable.toWeb(nodeStream);

				return new Response(webStream as any, {
					status: 200,
					headers: {
						"Content-Length": String(fileSize),
						"Content-Type": contentType,
						"Accept-Ranges": "bytes",
					},
				});
			}
		} catch (e) {
			console.error("[media protocol] Failed to fetch media protocol file:", e);
			return new Response("Internal Server Error", { status: 500 });
		}
	});

	ipcMain.handle("show-item-in-folder", (_event, filePath: string) => {
		if (fs.existsSync(filePath)) {
			shell.showItemInFolder(filePath);
			return true;
		}
		return false;
	});

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
			delimiters: DEFAULT_DELIMITERS,
			exceptions: [],
			devMode: false,
		});
	});

	ipcMain.handle("save-settings", (_event, settings: any) => {
		store.set("settings", settings);
	});

	ipcMain.handle("reset-cache", async () => {
		const cachesDir = path.join(app.getPath("userData"), "caches");
		if (fs.existsSync(cachesDir)) {
			try {
				fs.rmSync(cachesDir, { recursive: true, force: true });
			} catch (e) {
				console.error("Failed to delete caches directory", e);
			}
		}
		// Re-create the empty caches directory
		fs.mkdirSync(cachesDir, { recursive: true });

		// Clear scan results cache in-memory
		for (const key of Object.keys(lastScanResults)) {
			delete lastScanResults[key];
		}
	});

	ipcMain.on(
		"show-context-menu",
		(
			event,
			params: {
				trackId?: string;
				title?: string;
				artist?: string;
				artists?: string[];
				album?: string;
				genre?: string;
				itunesFilePath?: string;
				phoneFilePath?: string;
				albumSelectionState?: {
					canSelectAll: boolean;
					canDeselectAll: boolean;
				};
				artistSelectionState?: {
					canSelectAll: boolean;
					canDeselectAll: boolean;
					canSelectAllAlbums: boolean;
					canDeselectAllAlbums: boolean;
				};
			},
		) => {
			const menu = new Menu();

			const sendCommand = (command: string, arg: string) => {
				event.sender.send("context-menu-command", { command, arg });
			};

			if (params.trackId) {
				menu.append(
					new MenuItem({
						label: "プレビュー再生",
						click: () => sendCommand("play-track", params.trackId!),
					}),
				);
				menu.append(new MenuItem({ type: "separator" }));
			}

			if (params.artistSelectionState) {
				menu.append(
					new MenuItem({
						label: "すべて選択",
						enabled: params.artistSelectionState.canSelectAll,
						click: () => sendCommand("select-all-artist", params.artist!),
					}),
				);
				menu.append(
					new MenuItem({
						label: "すべて解除",
						enabled: params.artistSelectionState.canDeselectAll,
						click: () => sendCommand("deselect-all-artist", params.artist!),
					}),
				);
				menu.append(new MenuItem({ type: "separator" }));
				menu.append(
					new MenuItem({
						label: "含まれる全アルバムを選択",
						enabled: params.artistSelectionState.canSelectAllAlbums,
						click: () => sendCommand("select-albums-artist", params.artist!),
					}),
				);
				menu.append(
					new MenuItem({
						label: "含まれる全アルバムを解除",
						enabled: params.artistSelectionState.canDeselectAllAlbums,
						click: () => sendCommand("deselect-albums-artist", params.artist!),
					}),
				);
			} else if (params.albumSelectionState) {
				menu.append(
					new MenuItem({
						label: "すべて選択",
						enabled: params.albumSelectionState.canSelectAll,
						click: () => sendCommand("select-all-album", params.album!),
					}),
				);
				menu.append(
					new MenuItem({
						label: "すべて解除",
						enabled: params.albumSelectionState.canDeselectAll,
						click: () => sendCommand("deselect-all-album", params.album!),
					}),
				);
			}

			if (params.artistSelectionState || params.albumSelectionState) {
				menu.append(new MenuItem({ type: "separator" }));
			}

			if (params.artist && !params.artistSelectionState) {
				if (params.artists && params.artists.length > 1) {
					const submenu = new Menu();
					const sortedArtists = [...params.artists].sort((a, b) => a.localeCompare(b, "ja"));
					sortedArtists.forEach((art) => {
						submenu.append(
							new MenuItem({
								label: `「${art}」の曲を表示`,
								click: () => sendCommand("jump-artist", art),
							}),
						);
					});
					menu.append(
						new MenuItem({
							label: `「${params.artist}」の曲を表示`,
							submenu: submenu,
						}),
					);
				} else {
					menu.append(
						new MenuItem({
							label: `「${params.artist}」の曲を表示`,
							click: () => sendCommand("jump-artist", params.artist!),
						}),
					);
				}
			}

			if (params.album && !params.albumSelectionState) {
				menu.append(
					new MenuItem({
						label: `アルバム「${params.album}」の曲を表示`,
						click: () => sendCommand("jump-album", params.album!),
					}),
				);
			}

			if (params.genre) {
				menu.append(
					new MenuItem({
						label: `ジャンル「${params.genre}」の曲を表示`,
						click: () => sendCommand("jump-genre", params.genre!),
					}),
				);
			}

			let hasSeparator = false;
			if (params.itunesFilePath && fs.existsSync(params.itunesFilePath)) {
				if (!hasSeparator) {
					menu.append(new MenuItem({ type: "separator" }));
					hasSeparator = true;
				}
				menu.append(
					new MenuItem({
						label: "エクスプローラーで表示 (iTunes)",
						click: () => {
							shell.showItemInFolder(params.itunesFilePath!);
						},
					}),
				);
			}
			if (params.phoneFilePath && fs.existsSync(params.phoneFilePath)) {
				if (!hasSeparator) {
					menu.append(new MenuItem({ type: "separator" }));
					hasSeparator = true;
				}
				menu.append(
					new MenuItem({
						label: "エクスプローラーで表示 (比較先)",
						click: () => {
							shell.showItemInFolder(params.phoneFilePath!);
						},
					}),
				);
			}

			// Add Detailed Information MenuItem at the bottom
			menu.append(new MenuItem({ type: "separator" }));
			if (params.trackId) {
				menu.append(
					new MenuItem({
						label: "詳細情報を表示",
						click: () => sendCommand("show-track-detail", params.trackId!),
					}),
				);
			} else if (params.album) {
				// If right-clicked on the album art inside the Detail Modal
				if ((params as any).isDetailArt) {
					menu.append(
						new MenuItem({
							label: "アルバムアートをコピー",
							click: () => sendCommand("copy-album-art-command", params.album!),
						}),
					);
				} else {
					// Otherwise, it is the album row in the tree view
					menu.append(
						new MenuItem({
							label: "アルバム詳細情報を表示",
							click: () => sendCommand("show-album-detail", params.album!),
						}),
					);
				}
			}

			const win = (event as any).sender.getOwnerBrowserWindow();
			if (win) {
				menu.popup({ window: win });
			} else {
				menu.popup();
			}
		},
	);

	ipcMain.handle("select-folder", async () => {
		const result = await dialog.showOpenDialog({
			properties: ["openDirectory"],
		});
		if (result.canceled) {
			return null;
		}
		return result.filePaths[0];
	});

	ipcMain.handle("get-usb-devices", async () => {
		const list: { vendorId: number; productId: number; name: string }[] = [];
		try {
			const usb = (await import("usb")).default;
			if (usb && usb.usb) {
				// if (typeof usb.usb.loadDevices === "function") {
				// 	await usb.usb.loadDevices();
				// }
				if (typeof usb.usb.getDevices === "function") {
					const devices = await usb.usb.getDevices();
					for (const d of devices) {
						try {
							const mName = d.manufacturerName || "";
							const pName = d.productName || "";
							const displayName = mName || pName ? `${mName} ${pName}`.trim() : `USB Device (VID: 0x${d.vendorId.toString(16).padStart(4, "0")}, PID: 0x${d.productId.toString(16).padStart(4, "0")})`;
							list.push({
								vendorId: d.vendorId,
								productId: d.productId,
								name: displayName,
							});
						} catch (e) {
							console.error("[get-usb-devices] Error processing USB device:", e);
						}
					}
				}
			}
		} catch (e: any) {
			console.error("[get-usb-devices] Error listing physical USB devices:", e);
		}

		return list;
	});

	ipcMain.handle("get-mtp-device-names", async () => {
		if (process.platform !== "win32") {
			return [];
		}
		try {
			const { execFile } = await import("node:child_process");
			const scriptText = `
				[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
				$shell = New-Object -ComObject Shell.Application
				$drives = $shell.NameSpace(17)
				if ($drives) {
					$names = $drives.Items() | Where-Object { $_.Path -notmatch '^[A-Z]:\\\\$' } | ForEach-Object { [string]$_.Name }
					if ($names) {
						,@($names) | ConvertTo-Json -Compress
					} else {
						"[]"
					}
				} else {
					"[]"
				}
			`;
			const buffer = Buffer.from(scriptText, "utf16le");
			const base64 = buffer.toString("base64");

			return new Promise<string[]>((resolve) => {
				execFile("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", base64], { maxBuffer: 10 * 1024 * 1024, encoding: "utf8" }, (error, stdout, stderr) => {
					if (error) {
						console.error("[get-mtp-device-names] Error:", stderr || error.message);
						resolve([]);
					} else {
						try {
							const res = stdout.trim();
							if (!res || res === "[]") {
								resolve([]);
							} else {
								const parsed = JSON.parse(res);
								const list = Array.isArray(parsed) ? parsed : [parsed];
								const names = list.map((item: any) => {
									if (typeof item === "string") {
										return item;
									}
									if (item && typeof item === "object") {
										return item.Name || item.name || item.value || JSON.stringify(item);
									}
									return String(item);
								});
								resolve(names);
							}
						} catch (e) {
							console.error("[get-mtp-device-names] Parse error:", e);
							resolve([]);
						}
					}
				});
			});
		} catch (e) {
			console.error("[get-mtp-device-names] Unexpected error:", e);
			return [];
		}
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
		return await runSync(profile, options, event);
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

	ipcMain.handle("copy-album-art", async (_event, profileId: string, albumName: string) => {
		try {
			if (!profileId || !albumName) return false;

			// Find track in scan results
			const results = lastScanResults[profileId] || [];
			const trackItem = results.find((t) => {
				const meta = t.itunesTrack || t.phoneTrack;
				return meta && meta.album === albumName && meta.hasCoverArt;
			});

			if (!trackItem) {
				return false;
			}

			const track = trackItem.itunesTrack || trackItem.phoneTrack;
			if (!track || !fs.existsSync(track.filePath)) return false;

			const { parseFile } = await import("music-metadata");
			const metadata = await parseFile(track.filePath, { skipCovers: false });
			const picture = metadata.common.picture && metadata.common.picture[0];
			if (!picture) {
				return false;
			}

			// Determine actual embedded image extension
			let ext = "png";
			if (picture.format) {
				if (picture.format.includes("jpeg") || picture.format.includes("jpg")) {
					ext = "jpg";
				} else if (picture.format.includes("png")) {
					ext = "png";
				} else if (picture.format.includes("gif")) {
					ext = "gif";
				} else if (picture.format.includes("webp")) {
					ext = "webp";
				} else if (picture.format.includes("bmp")) {
					ext = "bmp";
				}
			}

			// Clean albumName for use as filename (strip invalid OS characters)
			// Windows invalid characters: \ / : * ? " < > |
			// Let's replace any invalid characters with underscores
			const safeFilename = albumName.replace(/[\\/:*?"<>|]/g, "_");
			const filename = `${safeFilename}.${ext}`;

			const tempDir = path.join(app.getPath("userData"), "caches", "temp_copies");
			if (!fs.existsSync(tempDir)) {
				fs.mkdirSync(tempDir, { recursive: true });
			}

			const filePath = path.join(tempDir, filename);
			fs.writeFileSync(filePath, Buffer.from(picture.data));

			// Copy to clipboard
			const img = nativeImage.createFromBuffer(Buffer.from(picture.data));

			// Clear first
			clipboard.clear();

			// 1. Write the NativeImage to clipboard
			clipboard.write({
				image: img,
				text: filePath, // Fallback text as path
			});

			// 2. Add platform-specific file path copy descriptors so it can be pasted as file in Windows Explorer or macOS Finder
			if (process.platform === "win32") {
				// Windows explorer looks for 'FileNameW' (UNICODE null-terminated path)
				clipboard.writeBuffer("FileNameW", Buffer.concat([Buffer.from(filePath, "ucs2"), Buffer.from([0, 0])]));
			} else if (process.platform === "darwin") {
				// macOS Finder looks for 'public.file-url'
				const fileUrl = `file://${filePath}`;
				clipboard.writeBuffer("public.file-url", Buffer.from(fileUrl, "utf-8"));
			}

			return true;
		} catch (e) {
			console.error("Failed to copy album art", e);
			return false;
		}
	});
}
