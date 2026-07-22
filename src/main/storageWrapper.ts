import { dialog } from "electron";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { TrackMetadata } from "./types";
import { findMusicFiles as findLocalMusicFiles, getTrackMetadata as getLocalTrackMetadata } from "./utils";

export const activeMtpWrappers = new Set<MtpStorageWrapper>();

export class MtpUserCancelledError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "MtpUserCancelledError";
	}
}

export async function closeAllActiveMtpWrappers(): Promise<void> {
	console.log(`[StorageWrapper] Closing all ${activeMtpWrappers.size} active MTP wrappers...`);
	for (const wrapper of activeMtpWrappers) {
		try {
			await wrapper.disconnect();
		} catch (e) {
			console.error("[StorageWrapper] Error closing MTP wrapper:", e);
		}
	}
	activeMtpWrappers.clear();
}

async function promptDeviceSelection(currentVendorId: number, currentProductId: number, profileId?: string): Promise<{ vendorId: number; productId: number } | null> {
	try {
		const usb = (await import("usb")).default;
		if (!usb || !usb.usb || typeof usb.usb.getDevices !== "function") {
			return null;
		}

		const devices = await usb.usb.getDevices();

		// Check if the current device is still connected to simplify selection
		const currentDevice = devices.find((d) => d.vendorId === currentVendorId && d.productId === currentProductId);
		if (currentDevice) {
			const mName = currentDevice.manufacturerName || "";
			const pName = currentDevice.productName || "";
			const displayName = mName || pName ? `${mName} ${pName}`.trim() : `MTP Device (VID: 0x${currentVendorId.toString(16).padStart(4, "0")}, PID: 0x${currentProductId.toString(16).padStart(4, "0")})`;

			const choice = dialog.showMessageBoxSync({
				type: "question",
				buttons: ["再試行 (Retry)", "キャンセル (Cancel)"],
				title: "MTPデバイスの接続再試行",
				message: `デバイス「${displayName}」への接続に失敗しました。再接続しますか？`,
				cancelId: 1,
			});

			if (choice === 0) {
				return { vendorId: currentVendorId, productId: currentProductId };
			} else {
				console.log("[promptDeviceSelection] User selected Cancel in retry dialog.");
				return null; // User cancelled
			}
		}

		const list: { vendorId: number; productId: number; name: string }[] = [];
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
				// Ignore
			}
		}

		if (list.length === 0) {
			dialog.showMessageBoxSync({
				type: "warning",
				buttons: ["了解"],
				title: "デバイスが見つかりません",
				message: "接続可能なUSBデバイスが見つかりませんでした。接続状況を確認してください。",
			});
			return null;
		}

		const buttons = list.map((d) => d.name).concat(["キャンセル"]);
		const choice = dialog.showMessageBoxSync({
			type: "question",
			buttons,
			title: "MTPデバイスの選択",
			message: "接続するMTPデバイスを選択してください：",
			cancelId: buttons.length - 1,
		});

		if (choice >= 0 && choice < list.length) {
			const selected = list[choice];
			if (profileId) {
				const Store = (await import("electron-store")).default;
				const store = new Store();
				const profiles = store.get("profiles", []) as any[];
				const index = profiles.findIndex((p) => p.id === profileId);
				if (index > -1) {
					profiles[index].usbVendorId = selected.vendorId;
					profiles[index].usbProductId = selected.productId;
					const subPath = profiles[index].mtpSubPath || "Music";
					profiles[index].phonePath = `mtp://${selected.vendorId}/${selected.productId}/${subPath}`;
					store.set("profiles", profiles);
					console.log(`Saved updated VID/PID for profile ${profileId}: VID: ${selected.vendorId}, PID: ${selected.productId}`);
				}
			}
			return { vendorId: selected.vendorId, productId: selected.productId };
		}
	} catch (e) {
		console.error("Error prompting device selection:", e);
	}
	return null;
}

// Highly resilient file-copy with retries
async function copyFileWithRetry(source: string, target: string, retries = 3, delayMs = 1000): Promise<void> {
	for (let i = 0; i < retries; i++) {
		try {
			await fs.promises.copyFile(source, target);
			return;
		} catch (e: any) {
			if (i === retries - 1) {
				throw e;
			}
			console.warn(`Copy failed, retrying (${i + 2}/${retries + 1}) after ${delayMs}ms. Error: ${e.message}`);
			await new Promise((resolve) => setTimeout(resolve, delayMs));
		}
	}
}

// Highly resilient file-move with retries
async function moveFileWithRetry(source: string, target: string, retries = 3, delayMs = 1000): Promise<void> {
	for (let i = 0; i < retries; i++) {
		try {
			try {
				await fs.promises.rename(source, target);
			} catch (e) {
				console.warn(`Rename failed, falling back to copy/unlink: ${source} -> ${target}`, e);
				await fs.promises.copyFile(source, target);
				await fs.promises.unlink(source);
			}
			return;
		} catch (e: any) {
			if (i === retries - 1) {
				throw e;
			}
			console.warn(`Move failed, retrying (${i + 2}/${retries + 1}) after ${delayMs}ms. Error: ${e.message}`);
			await new Promise((resolve) => setTimeout(resolve, delayMs));
		}
	}
}

export interface TargetStorageWrapper {
	exists(relativePath: string): Promise<boolean>;
	findMusicFiles(): Promise<{ filePath: string; relativePath: string; size?: number; mtimeMs?: number }[]>;
	getTrackMetadata(filePath: string, relativePath: string): Promise<TrackMetadata>;
	copyFileFromLocal(localSrc: string, remoteDestRelativePath: string): Promise<void>;
	moveFile(oldRelativePath: string, newRelativePath: string): Promise<void>;
	deleteFile(relativePath: string): Promise<void>;
	cleanEmptyDirs(): Promise<void>;
	isConnected(): Promise<boolean>;
}

// ============================================================================
// 1. Local Filesystem Storage Wrapper
// ============================================================================
export class LocalStorageWrapper implements TargetStorageWrapper {
	private phonePath: string;

	constructor(phonePath: string) {
		this.phonePath = phonePath;
	}

	async isConnected(): Promise<boolean> {
		return fs.existsSync(this.phonePath);
	}

	async exists(relativePath: string): Promise<boolean> {
		const targetPath = path.join(this.phonePath, relativePath);
		return fs.existsSync(targetPath);
	}

	async findMusicFiles(): Promise<{ filePath: string; relativePath: string; size?: number; mtimeMs?: number }[]> {
		return findLocalMusicFiles(this.phonePath, this.phonePath);
	}

	async getTrackMetadata(filePath: string, relativePath: string): Promise<TrackMetadata> {
		return getLocalTrackMetadata(filePath, relativePath);
	}

	async copyFileFromLocal(localSrc: string, remoteDestRelativePath: string): Promise<void> {
		const targetPath = path.join(this.phonePath, remoteDestRelativePath);
		const targetDir = path.dirname(targetPath);
		await fs.promises.mkdir(targetDir, { recursive: true });
		await copyFileWithRetry(localSrc, targetPath);
	}

	async moveFile(oldRelativePath: string, newRelativePath: string): Promise<void> {
		const oldPath = path.join(this.phonePath, oldRelativePath);
		const newPath = path.join(this.phonePath, newRelativePath);
		const targetDir = path.dirname(newPath);
		await fs.promises.mkdir(targetDir, { recursive: true });
		await moveFileWithRetry(oldPath, newPath);
	}

	async deleteFile(relativePath: string): Promise<void> {
		const targetPath = path.join(this.phonePath, relativePath);
		if (fs.existsSync(targetPath)) {
			await fs.promises.unlink(targetPath);
		}
	}

	async cleanEmptyDirs(): Promise<void> {
		const clean = async (dir: string) => {
			try {
				const list = await fs.promises.readdir(dir, { withFileTypes: true });
				for (const item of list) {
					if (item.isDirectory()) {
						const sub = path.join(dir, item.name);
						await clean(sub);
					}
				}

				if (dir !== this.phonePath) {
					const files = await fs.promises.readdir(dir);
					if (files.length === 0) {
						await fs.promises.rmdir(dir);
					}
				}
			} catch (e) {
				console.warn(`Failed to clean empty directory recursively in ${dir}:`, e);
			}
		};
		await clean(this.phonePath);
	}
}

// ============================================================================
// 2. Mock MTP Storage Wrapper (Strictly for development, debugging, and testing)
// ============================================================================
export class MockMtpStorageWrapper implements TargetStorageWrapper {
	private mockFiles: Map<string, { size: number; mtimeMs: number; metadata: Partial<TrackMetadata> }> = new Map();
	private subPath: string;

	constructor(subPath: string) {
		this.subPath = subPath || "Music";
		// Seed with some mock files in MTP mode
		this.mockFiles.set(`${this.subPath}/The Weeknd/After Hours/03 Blinding Lights.mp3`, {
			size: 4500000,
			mtimeMs: Date.now() - 3600000,
			metadata: {
				title: "Blinding Lights",
				artist: "The Weeknd",
				album: "After Hours",
				track: "3",
				genre: "R&B",
				disc: "1",
				hasCoverArt: true,
				coverArtSize: 50000,
			},
		});
		this.mockFiles.set(`${this.subPath}/Lil Nas X/Old Town Road.mp3`, {
			size: 3000000,
			mtimeMs: Date.now() - 7200000,
			metadata: {
				title: "Old Town Road",
				artist: "Lil Nas X",
				album: "7 EP",
				track: "1",
				genre: "Country",
				disc: "1",
				hasCoverArt: false,
				coverArtSize: 0,
			},
		});
	}

	async isConnected(): Promise<boolean> {
		return true;
	}

	async exists(relativePath: string): Promise<boolean> {
		return this.mockFiles.has(relativePath);
	}

	async findMusicFiles(): Promise<{ filePath: string; relativePath: string; size?: number; mtimeMs?: number }[]> {
		const results: { filePath: string; relativePath: string; size?: number; mtimeMs?: number }[] = [];
		for (const [key, val] of this.mockFiles.entries()) {
			results.push({
				filePath: `mock_mtp://${key}`,
				relativePath: key,
				size: val.size,
				mtimeMs: val.mtimeMs,
			});
		}
		return results;
	}

	async getTrackMetadata(filePath: string, relativePath: string): Promise<TrackMetadata> {
		const file = this.mockFiles.get(relativePath);
		if (file) {
			return {
				id: `phone_${relativePath}`,
				filePath,
				relativePath,
				title: file.metadata.title || "Unknown Title",
				artist: file.metadata.artist || "Unknown Artist",
				album: file.metadata.album || "Unknown Album",
				track: file.metadata.track || "",
				genre: file.metadata.genre || "Unknown Genre",
				size: file.size,
				mtimeMs: file.mtimeMs,
				hasCoverArt: file.metadata.hasCoverArt || false,
				coverArtSize: file.metadata.coverArtSize || 0,
				disc: file.metadata.disc || "1",
				albumartist: file.metadata.albumartist || "",
				composer: file.metadata.composer || "",
				year: file.metadata.year || "",
				comment: file.metadata.comment || "",
			};
		}
		return {
			id: `phone_${relativePath}`,
			filePath,
			relativePath,
			title: path.basename(relativePath, path.extname(relativePath)),
			artist: "Unknown Artist",
			album: "Unknown Album",
			track: "",
			genre: "Unknown Genre",
			size: 0,
			mtimeMs: Date.now(),
			hasCoverArt: false,
			coverArtSize: 0,
		};
	}

	async copyFileFromLocal(localSrc: string, remoteDestRelativePath: string): Promise<void> {
		// Try to read metadata from the local file to simulate uploading properly
		try {
			const meta = await getLocalTrackMetadata(localSrc, remoteDestRelativePath);
			const stats = await fs.promises.stat(localSrc);
			this.mockFiles.set(remoteDestRelativePath, {
				size: stats.size,
				mtimeMs: stats.mtimeMs,
				metadata: meta,
			});
		} catch (e) {
			this.mockFiles.set(remoteDestRelativePath, {
				size: 100000,
				mtimeMs: Date.now(),
				metadata: {
					title: path.basename(remoteDestRelativePath, path.extname(remoteDestRelativePath)),
				},
			});
		}
	}

	async moveFile(oldRelativePath: string, newRelativePath: string): Promise<void> {
		const file = this.mockFiles.get(oldRelativePath);
		if (file) {
			this.mockFiles.delete(oldRelativePath);
			this.mockFiles.set(newRelativePath, file);
		}
	}

	async deleteFile(relativePath: string): Promise<void> {
		this.mockFiles.delete(relativePath);
	}

	async cleanEmptyDirs(): Promise<void> {
		// Mock implementation no-op
	}
}

// ============================================================================
// 3. Real MTP Device Storage Wrapper (Using webmtp & node-usb)
// ============================================================================
export class MtpStorageWrapper implements TargetStorageWrapper {
	private vendorId: number;
	private productId: number;
	private subPath: string;
	private mtpInstance: any = null;
	private deviceObjectHandles: number[] = [];
	private fileMap: Map<string, number> = new Map(); // relativePath -> objectHandle
	private profileId?: string;

	// Dynamic, adaptive delay parameters
	private currentDelayMs = 20;
	private readonly minDelayMs = 5;
	private readonly maxDelayMs = 200;

	constructor(vendorId: number, productId: number, subPath: string, profileId?: string) {
		this.vendorId = vendorId;
		this.productId = productId;
		this.subPath = subPath || "Music";
		this.profileId = profileId;
		activeMtpWrappers.add(this);
	}

	async disconnect(): Promise<void> {
		if (this.mtpInstance) {
			console.log(`[StorageWrapper] Disconnecting MTP Instance for VID: ${this.vendorId}, PID: ${this.productId}`);
			try {
				await this.mtpInstance.close();
			} catch (e) {
				console.error("[StorageWrapper] Error closing MTP Instance:", e);
			} finally {
				this.mtpInstance = null;
			}
		}
	}

	private async connectMtp(attemptReconnect = false): Promise<any> {
		if (attemptReconnect) {
			await this.disconnect();
		}
		if (this.mtpInstance) return this.mtpInstance;

		let vId = this.vendorId;
		let pId = this.productId;

		const connectWithSpecificDevice = async (v: number, p: number): Promise<any> => {
			const MtpClass = (await import("../libs/mtp/Mtp")).default;
			const mtp = new MtpClass(v, p);

			return new Promise((resolve, reject) => {
				const onReady = async () => {
					try {
						await mtp.openSession();
						this.mtpInstance = mtp;
						resolve(mtp);
					} catch (e) {
						reject(e);
					}
				};

				const onError = (err: any) => {
					reject(new Error(`MTP connection error: ${err?.message || "Unknown error"}`));
				};

				mtp.addEventListener("ready", onReady);
				mtp.addEventListener("error", onError);

				// Safeguard timeout
				setTimeout(() => {
					reject(new Error("MTP connection timed out."));
				}, 10000);
			});
		};

		// 1. Attempt initial automatic connection (up to 3 automatic retries if busy/claimed)
		let lastError: any = null;
		for (let attempt = 1; attempt <= 3; attempt++) {
			try {
				return await connectWithSpecificDevice(vId, pId);
			} catch (e: any) {
				lastError = e;
				console.warn(`[StorageWrapper] Connection attempt ${attempt}/3 failed: ${e.message}`);
				if (attempt < 3) {
					await new Promise((r) => setTimeout(r, 1000));
				}
			}
		}

		// 2. Prompt user for retry or alternative device
		console.error(`[StorageWrapper] All 3 automatic connection attempts failed. Prompting user...`);
		const selected = await promptDeviceSelection(vId, pId, this.profileId);
		if (selected) {
			this.vendorId = selected.vendorId;
			this.productId = selected.productId;
			try {
				return await connectWithSpecificDevice(selected.vendorId, selected.productId);
			} catch (e: any) {
				throw new MtpUserCancelledError(`MTP接続に失敗しました。再試行エラー: ${e.message}`);
			}
		} else {
			throw new MtpUserCancelledError(`MTP接続に失敗しました。ユーザーにより選択または再試行がキャンセルされました。`);
		}
	}

	async isConnected(): Promise<boolean> {
		try {
			const mtp = await this.connectMtp();
			return !!mtp;
		} catch (e) {
			return false;
		}
	}

	async exists(relativePath: string): Promise<boolean> {
		await this.findMusicFiles(); // populate fileMap
		return this.fileMap.has(relativePath);
	}

	private async applyAdaptiveDelay(success: boolean): Promise<void> {
		if (success) {
			// Decay delay slightly down to minDelayMs
			this.currentDelayMs = Math.max(this.minDelayMs, this.currentDelayMs - 2);
		} else {
			// Back-off delay on error up to maxDelayMs
			this.currentDelayMs = Math.min(this.maxDelayMs, this.currentDelayMs + 30);
		}
		if (this.currentDelayMs > 0) {
			await new Promise((resolve) => setTimeout(resolve, this.currentDelayMs));
		}
	}

	async findMusicFiles(): Promise<{ filePath: string; relativePath: string; size?: number; mtimeMs?: number }[]> {
		const mtp = await this.connectMtp();
		const handles = await mtp.getObjectHandles();
		this.deviceObjectHandles = handles;

		const results: { filePath: string; relativePath: string; size?: number; mtimeMs?: number }[] = [];
		this.fileMap.clear();

		const validExtensions = new Set([".mp3", ".m4a", ".aac", ".flac", ".wav", ".ogg", ".wma"]);

		let failureCount = 0;
		let lastFailedIndex = -1;

		for (let i = 0; i < handles.length; i++) {
			const handle = handles[i];
			let success = false;
			let attempts = 0;

			while (!success && attempts < 3) {
				attempts++;
				try {
					if (this.currentDelayMs > 0) {
						await new Promise((resolve) => setTimeout(resolve, this.currentDelayMs));
					}

					const fileName = await mtp.getFileName(handle);
					const ext = path.extname(fileName).toLowerCase();
					if (validExtensions.has(ext)) {
						const relativePath = path.join(this.subPath, fileName).replace(/\\/g, "/");
						this.fileMap.set(relativePath, handle);
						results.push({
							filePath: `mtp://${this.vendorId}/${this.productId}/${handle}`,
							relativePath,
							size: 1000000, // Default fallback size
							mtimeMs: Date.now(), // Default fallback mtime
						});
					}
					success = true;
					await this.applyAdaptiveDelay(true);

					// If we successfully processed a file, reset consecutive failures at single index
					if (lastFailedIndex !== i) {
						failureCount = 0;
					}
				} catch (e: any) {
					if (e instanceof MtpUserCancelledError) {
						throw e; // Propagate user cancellation immediately
					}
					console.warn(`[findMusicFiles] Error for object handle ${handle} (attempt ${attempts}): ${e.message}`);
					await this.applyAdaptiveDelay(false);

					// Force reconnect if cancelled or USB device issue
					if (e.message.includes("Cancelled") || e.message.includes("transfer") || e.message.includes("device")) {
						console.log("[findMusicFiles] Connection problem detected. Reconnecting MTP...");
						try {
							await this.connectMtp(true);
						} catch (reconnectErr) {
							if (reconnectErr instanceof MtpUserCancelledError) {
								throw reconnectErr;
							}
							console.error("[findMusicFiles] Reconnection failed:", reconnectErr);
						}
					}
				}
			}

			if (!success) {
				if (lastFailedIndex === i - 1) {
					failureCount++;
				} else {
					failureCount = 1;
				}
				lastFailedIndex = i;

				console.error(`[findMusicFiles] Failed to read file info for object handle ${handle} after 3 attempts. Consecutive failed indices: ${failureCount}`);

				if (failureCount >= 3) {
					await this.disconnect();
					throw new Error(`連続して3個のファイルの読み込みに失敗したため、処理を中断します。接続を確認してください。`);
				}
			}
		}

		return results;
	}

	private async runWithRetryAndReconnect<T>(operation: (mtp: any) => Promise<T>): Promise<T> {
		let attempts = 0;
		while (attempts < 3) {
			attempts++;
			try {
				const mtp = await this.connectMtp(attempts > 1);
				if (this.currentDelayMs > 0) {
					await new Promise((resolve) => setTimeout(resolve, this.currentDelayMs));
				}
				const result = await operation(mtp);
				await this.applyAdaptiveDelay(true);
				return result;
			} catch (e: any) {
				if (e instanceof MtpUserCancelledError) {
					throw e; // Intercept and abort immediately on user cancellation
				}
				console.error(`[MtpStorageWrapper] Operation failed on attempt ${attempts}/3: ${e.message}`);
				await this.applyAdaptiveDelay(false);

				if (attempts === 3) {
					await this.disconnect();
					throw e;
				}
				// Force reconnect on next attempt
				await this.disconnect();
			}
		}
		throw new Error("MTP operation failed after retries.");
	}

	async getTrackMetadata(filePath: string, relativePath: string): Promise<TrackMetadata> {
		const handle = this.fileMap.get(relativePath);
		if (handle === undefined) {
			throw new Error(`File not found on MTP device: ${relativePath}`);
		}

		return this.runWithRetryAndReconnect(async (mtp) => {
			const fileName = await mtp.getFileName(handle);

			// Download to a temp file, read metadata, and delete temp file
			const tempDir = path.join(os.tmpdir(), "musicsync-mtp-temp");
			if (!fs.existsSync(tempDir)) {
				fs.mkdirSync(tempDir, { recursive: true });
			}
			const tempFilePath = path.join(tempDir, `${handle}_${fileName}`);

			try {
				const fileData = await mtp.getFile(handle, fileName);
				await fs.promises.writeFile(tempFilePath, Buffer.from(fileData));

				const meta = await getLocalTrackMetadata(tempFilePath, relativePath);
				meta.filePath = filePath;
				return meta;
			} finally {
				if (fs.existsSync(tempFilePath)) {
					try {
						await fs.promises.unlink(tempFilePath);
					} catch (e) {}
				}
			}
		});
	}

	async copyFileFromLocal(localSrc: string, remoteDestRelativePath: string): Promise<void> {
		const fileData = await fs.promises.readFile(localSrc);
		const fileName = path.basename(remoteDestRelativePath);

		await this.runWithRetryAndReconnect(async (mtp) => {
			if (typeof (mtp as any).sendFile === "function") {
				await (mtp as any).sendFile(fileData, fileName);
			} else {
				console.log(`Writing file ${fileName} to MTP device via bulk transfer packets...`);
				const sendObjectCmd = {
					type: 1, // Command Block
					code: 0x100d, // SendObject
					payload: [] as number[],
				};
				const container = mtp.buildContainerPacket(sendObjectCmd);
				await mtp.write(container);
				await mtp.write(fileData.buffer);
				const response = await mtp.read();
				console.log("SendObject MTP response:", response);
			}
		});
	}

	async moveFile(oldRelativePath: string, newRelativePath: string): Promise<void> {
		const handle = this.fileMap.get(oldRelativePath);
		if (handle === undefined) return;

		const fileData = await this.runWithRetryAndReconnect(async (mtp) => {
			const fileName = await mtp.getFileName(handle);
			return await mtp.getFile(handle, fileName);
		});

		// 1. Send / Upload file buffer to new location inside MTP device
		const fileName = path.basename(newRelativePath);
		await this.runWithRetryAndReconnect(async (mtp) => {
			if (typeof (mtp as any).sendFile === "function") {
				await (mtp as any).sendFile(fileData, fileName);
			} else {
				console.log(`Writing moved file ${fileName} to MTP device via bulk transfer packets...`);
				const sendObjectCmd = {
					type: 1,
					code: 0x100d,
					payload: [] as number[],
				};
				const container = mtp.buildContainerPacket(sendObjectCmd);
				await mtp.write(container);
				await mtp.write(fileData.buffer);
				const response = await mtp.read();
				console.log("SendObject (moved) MTP response:", response);
			}
		});

		// 2. Delete old file
		await this.deleteFile(oldRelativePath);
	}

	async deleteFile(relativePath: string): Promise<void> {
		const handle = this.fileMap.get(relativePath);
		if (handle === undefined) return;

		await this.runWithRetryAndReconnect(async (mtp) => {
			const deleteObjectCmd = {
				type: 1,
				code: 0x100b, // DeleteObject
				payload: [handle],
			};
			await mtp.write(mtp.buildContainerPacket(deleteObjectCmd));
			const response = await mtp.read();
			console.log("DeleteObject response:", response);
		});

		this.fileMap.delete(relativePath);
	}

	async cleanEmptyDirs(): Promise<void> {
		// MTP uses virtual folders or flat hierarchy. No empty directories to clean up.
	}
}

// ============================================================================
// Factory Function
// ============================================================================
export function getStorageWrapper(profile: any): TargetStorageWrapper {
	if (!profile) {
		throw new Error("No active profile provided");
	}

	const storageType = profile.storageType || "local";

	if (storageType === "mtp") {
		// Detect if it is explicitly a Mock profile or configured as mock
		if (profile.id.startsWith("mock") || profile.phonePath === "mock_mtp" || (profile.usbVendorId === 0 && profile.usbProductId === 0)) {
			console.log("[StorageWrapper] Initializing simulated Debug/Mock MTP Wrapper...");
			return new MockMtpStorageWrapper(profile.mtpSubPath);
		}
		const vendorId = parseInt(profile.usbVendorId, 10) || 0;
		const productId = parseInt(profile.usbProductId, 10) || 0;
		console.log(`[StorageWrapper] Initializing physical MTP Wrapper for Device (VID: ${vendorId}, PID: ${productId})...`);
		return new MtpStorageWrapper(vendorId, productId, profile.mtpSubPath, profile.id);
	}

	console.log(`[StorageWrapper] Initializing Local File Storage Wrapper for Path: ${profile.phonePath}`);
	return new LocalStorageWrapper(profile.phonePath);
}
