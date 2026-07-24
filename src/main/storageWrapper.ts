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
				console.warn("[StorageWrapper] Error scanning single USB device:", e);
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
	findMusicFiles(onProgress?: (msg: string) => void): Promise<{ filePath: string; relativePath: string; size?: number; mtimeMs?: number }[]>;
	getTrackMetadata(filePath: string, relativePath: string): Promise<TrackMetadata>;
	copyFileFromLocal(localSrc: string, remoteDestRelativePath: string): Promise<void>;
	moveFile(oldRelativePath: string, newRelativePath: string): Promise<void>;
	deleteFile(relativePath: string): Promise<void>;
	cleanEmptyDirs(): Promise<void>;
	isConnected(): Promise<boolean>;
	executeBatchSync?(ops: { type: "copy" | "move" | "delete"; localSrc?: string; remoteDest?: string; oldRemoteSrc?: string; trackId: string }[], onProgress?: (msg: string, completed: number, total: number) => void, onConsecutiveFailures?: (failedCount: number) => Promise<boolean>): Promise<{ failedTrackIds: string[] }>;
	getFileSizes?(relativePaths: string[]): Promise<Record<string, number>>;
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

	async findMusicFiles(onProgress?: (msg: string) => void): Promise<{ filePath: string; relativePath: string; size?: number; mtimeMs?: number }[]> {
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

	async findMusicFiles(onProgress?: (msg: string) => void): Promise<{ filePath: string; relativePath: string; size?: number; mtimeMs?: number }[]> {
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

	async findMusicFiles(onProgress?: (msg: string) => void): Promise<{ filePath: string; relativePath: string; size?: number; mtimeMs?: number }[]> {
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

			if (onProgress && i % 50 === 0) {
				onProgress(`比較先ファイルをスキャン中... (${i}/${handles.length})`);
			}

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
					} catch (e) {
						console.error("[StorageWrapper] Failed to clean up temp file:", e);
					}
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

// Helper function to create temporary .ps1 and .json parameter files
async function createTempPs1AndParams(scriptBody: string, params: any): Promise<{ scriptPath: string; paramsPath: string }> {
	const rand = Math.random().toString(36).substring(2, 10);
	const paramsPath = path.join(os.tmpdir(), `musicsync_params_${rand}.json`);
	const scriptPath = path.join(os.tmpdir(), `musicsync_script_${rand}.ps1`);

	await fs.promises.writeFile(paramsPath, JSON.stringify(params), "utf8");

	const escapedParamsPath = paramsPath.replace(/\\/g, "\\\\");
	const wrapperScript = `
		[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
		$paramsJson = [System.IO.File]::ReadAllText("${escapedParamsPath}", [System.Text.Encoding]::UTF8)
		$params = $paramsJson | ConvertFrom-Json
		
		$phoneName = $params.deviceName
		$subPath = $params.subPath
		$localSrc = $params.localSrc
		$remoteDestRelativePath = $params.remoteDestRelativePath
		$relativePath = $params.relativePath
		$oldRelativePath = $params.oldRelativePath
		$newRelativePath = $params.newRelativePath
		$tempFilePath = $params.tempFilePath
		$relativePaths = $params.relativePaths

		# Shared helper to find a folder item on MTP device
		function Get-MtpFolderItem($deviceItem, $subPath) {
			$folder = $deviceItem.GetFolder
			if ($folder -eq $null) {
				[Console]::Error.WriteLine("[Get-MtpFolderItem] Error: Device item has no folder object.")
				return $null
			}
			$segments = $subPath -split "/"
			$current = $deviceItem
			$isTop = $true
			foreach ($seg in $segments) {
				if ($seg -eq "") { continue }
				$found = $null
				
				# 1. Search directly in the current folder's items
				$items = $current.GetFolder.Items()
				foreach ($item in $items) {
					if ($item.Name -eq $seg) {
						$found = $item
						break
					}
				}
				
				# 2. If not found and we are at the top level, search inside all storage volumes
				if ($found -eq $null -and $isTop) {
					foreach ($vol in $items) {
						$volFolder = $vol.GetFolder
						if ($volFolder) {
							foreach ($subItem in $volFolder.Items()) {
								if ($subItem.Name -eq $seg) {
									$found = $subItem
									break
								}
							}
						}
						if ($found -ne $null) { break }
					}
				}
				if ($found -eq $null) {
					[Console]::Error.WriteLine("[Get-MtpFolderItem] Warning: Segment '$seg' not found inside parent: " + $current.Name)
					return $null
				}
				$current = $found
				$isTop = $false
			}
			return $current
		}

		# Shared helper to ensure folder structure exists on MTP device
		function Ensure-MtpDirectory($parentItem, $relPath) {
			$segments = $relPath -split "/"
			$current = $parentItem
			$isTop = $true
			foreach ($seg in $segments) {
				if ($seg -eq "") { continue }
				$found = $null
				# 1. Try to find if the folder already exists
				$items = $current.GetFolder.Items()
				foreach ($item in $items) {
					if ($item.IsFolder -and $item.Name -eq $seg) {
						$found = $item
						break
					}
				}
				
				# 2. If at top-level (device root), search inside all volumes
				if ($found -eq $null -and $isTop) {
					foreach ($vol in $items) {
						$volFolder = $vol.GetFolder
						if ($volFolder) {
							foreach ($subItem in $volFolder.Items()) {
								if ($subItem.IsFolder -and $subItem.Name -eq $seg) {
									$found = $subItem
									break
								}
							}
						}
						if ($found -ne $null) { break }
					}
				}
				
				# 3. If not found, create it!
				if ($found -eq $null) {
					$targetFolderToCreateIn = $current.GetFolder
					if ($isTop) {
						$primaryVol = $items | Where-Object { $_.IsFolder } | Select-Object -First 1
						if ($primaryVol) {
							$targetFolderToCreateIn = $primaryVol.GetFolder
						}
					}
					
					if ($targetFolderToCreateIn) {
						$targetFolderToCreateIn.NewFolder($seg)
						# Poll for the newly created folder (up to 3 seconds)
						for ($try = 0; $try -lt 30; $try++) {
							# Re-query items
							foreach ($item in $targetFolderToCreateIn.Items()) {
								if ($item.IsFolder -and $item.Name -eq $seg) {
									$found = $item
									break
								}
							}
							if ($found) { break }
							Start-Sleep -Milliseconds 100
						}
					}
				}
				
				if ($found -eq $null) {
					throw "Failed to create remote directory: $seg"
				}
				$current = $found
				$isTop = $false
			}
			return $current
		}

		${scriptBody}
	`;

	const bom = Buffer.from([0xef, 0xbb, 0xbf]);
	const scriptBuffer = Buffer.concat([bom, Buffer.from(wrapperScript, "utf8")]);
	await fs.promises.writeFile(scriptPath, scriptBuffer);

	return { scriptPath, paramsPath };
}

// Helper function to run PowerShell scripts with JSON parameters using file arguments
async function runPowerShellWithParams(scriptText: string, params: any, onProgressLine?: (line: string) => void): Promise<string> {
	if (process.platform !== "win32") {
		return "[]";
	}
	const { scriptPath, paramsPath } = await createTempPs1AndParams(scriptText, params);

	try {
		return await runPowerShellFileCommand(scriptPath, onProgressLine);
	} finally {
		try {
			if (fs.existsSync(scriptPath)) await fs.promises.unlink(scriptPath);
			if (fs.existsSync(paramsPath)) await fs.promises.unlink(paramsPath);
		} catch (e) {
			console.error("[PowerShellMtp] Cleanup temp files failed:", e);
		}
	}
}

// Helper function to run PowerShell scripts interactively using file arguments
async function runPowerShellInteractive(scriptText: string, params: any, onProgressLine?: (line: string, writeStdin: (str: string) => void) => void): Promise<string> {
	if (process.platform !== "win32") {
		return "[]";
	}
	const { scriptPath, paramsPath } = await createTempPs1AndParams(scriptText, params);

	try {
		return await runPowerShellFileInteractive(scriptPath, onProgressLine);
	} finally {
		try {
			if (fs.existsSync(scriptPath)) await fs.promises.unlink(scriptPath);
			if (fs.existsSync(paramsPath)) await fs.promises.unlink(paramsPath);
		} catch (e) {
			console.error("[PowerShellMtp] Cleanup temp files failed:", e);
		}
	}
}

// Helper function to execute PowerShell from a temporary script file
async function runPowerShellFileCommand(scriptPath: string, onProgressLine?: (line: string) => void): Promise<string> {
	if (process.platform !== "win32") {
		return "[]";
	}
	const { spawn } = await import("node:child_process");
	return new Promise<string>((resolve, reject) => {
		const child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath]);

		let stdout = "";
		let stderr = "";

		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");

		let bufferLine = "";
		child.stdout.on("data", (chunk) => {
			stdout += chunk;
			bufferLine += chunk;
			const lines = bufferLine.split(/\r?\n/);
			bufferLine = lines.pop() || "";
			for (const line of lines) {
				if (onProgressLine) {
					onProgressLine(line);
				}
			}
		});

		child.stderr.on("data", (chunk) => {
			stderr += chunk;
		});

		child.on("close", (code) => {
			if (bufferLine && onProgressLine) {
				onProgressLine(bufferLine);
			}
			if (code !== 0) {
				console.error("[PowerShellMtp] Error:", stderr);
				reject(new Error(stderr));
			} else {
				resolve(stdout);
			}
		});
	});
}

// Helper function to run PowerShell scripts interactively from a temporary script file
async function runPowerShellFileInteractive(scriptPath: string, onProgressLine?: (line: string, writeStdin: (str: string) => void) => void): Promise<string> {
	if (process.platform !== "win32") {
		return "[]";
	}
	const { spawn } = await import("node:child_process");
	return new Promise<string>((resolve, reject) => {
		const child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath]);

		let stdout = "";
		let stderr = "";

		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");

		const writeStdin = (str: string) => {
			child.stdin.write(str);
		};

		let bufferLine = "";
		child.stdout.on("data", (chunk) => {
			stdout += chunk;
			bufferLine += chunk;
			const lines = bufferLine.split(/\r?\n/);
			bufferLine = lines.pop() || "";
			for (const line of lines) {
				if (onProgressLine) {
					onProgressLine(line, writeStdin);
				}
			}
		});

		child.stderr.on("data", (chunk) => {
			stderr += chunk;
		});

		child.on("close", (code) => {
			if (bufferLine && onProgressLine) {
				onProgressLine(bufferLine, writeStdin);
			}
			if (code !== 0) {
				console.error("[PowerShellMtp] Interactive Error:", stderr);
				reject(new Error(stderr));
			} else {
				resolve(stdout);
			}
		});
	});
}

// ============================================================================
// 4. PowerShell MTP Storage Wrapper (Using Windows Native Shell COM via PowerShell)
// ============================================================================
export class PowerShellMtpStorageWrapper implements TargetStorageWrapper {
	private deviceName: string;
	private subPath: string;
	private fileMap: Map<string, { size: number; mtimeMs: number }> = new Map();

	constructor(deviceName: string, subPath: string) {
		this.deviceName = deviceName || "Mock Device";
		this.subPath = subPath || "Music";
	}

	private getRelPathInsideSub(p: string): string {
		const normalized = p.replace(/\\/g, "/");
		const prefix = this.subPath + "/";
		if (normalized.startsWith(prefix)) {
			return normalized.substring(prefix.length);
		}
		return normalized;
	}

	async isConnected(): Promise<boolean> {
		if (process.platform !== "win32") {
			throw new Error("PowerShell MTP is only supported on Windows.");
		}
		try {
			const script = `
				$shell = New-Object -ComObject Shell.Application
				$phone = $shell.NameSpace(17).Items() | Where-Object { $_.Name -eq $phoneName } | Select-Object -First 1
				if (-not $phone) {
					$phone = $shell.NameSpace(17).Items() | Where-Object { $_.Name -like "*$phoneName*" } | Select-Object -First 1
				}
				if ($phone) { "CONNECTED" } else { "NOT_CONNECTED" }
			`;
			const res = await runPowerShellWithParams(script, { deviceName: this.deviceName });
			return res.trim() === "CONNECTED";
		} catch (e) {
			console.error("[PowerShellMtp] isConnected failed:", e);
			return false;
		}
	}

	async exists(relativePath: string): Promise<boolean> {
		if (this.fileMap.size === 0) {
			await this.findMusicFiles();
		}
		const rel = this.getRelPathInsideSub(relativePath);
		const fullRel = `${this.subPath}/${rel}`.replace(/\\/g, "/");
		return this.fileMap.has(fullRel);
	}

	async findMusicFiles(onProgress?: (msg: string) => void): Promise<{ filePath: string; relativePath: string; size?: number; mtimeMs?: number }[]> {
		if (process.platform !== "win32") {
			throw new Error("PowerShell MTP is only supported on Windows.");
		}

		// Since running full PowerShell commands sequentially for progress updates is extremely slow,
		// we print stdout progress lines from PowerShell during its execution so the Node side gets real-time updates!
		const script = `
			$shell = New-Object -ComObject Shell.Application
			$drives = $shell.NameSpace(17)
			if (-not $drives) {
				Write-Output "JSON_RESULTS_START"
				Write-Output "[]"
				Write-Output "JSON_RESULTS_END"
				exit 0
			}

			$phoneItem = $drives.Items() | Where-Object { $_.Name -eq $phoneName } | Select-Object -First 1
			if (-not $phoneItem) {
				$phoneItem = $drives.Items() | Where-Object { $_.Name -like "*$phoneName*" } | Select-Object -First 1
			}

			if (-not $phoneItem) {
				Write-Output "JSON_RESULTS_START"
				Write-Output "[]"
				Write-Output "JSON_RESULTS_END"
				exit 0
			}

			$targetItem = Get-MtpFolderItem $phoneItem $subPath
			if (-not $targetItem) {
				[Console]::Error.WriteLine("[findMusicFiles] Subpath '$subPath' not found on device.")
				Write-Output "JSON_RESULTS_START"
				Write-Output "[]"
				Write-Output "JSON_RESULTS_END"
				exit 0
			}

			$global:scannedCount = 0
			function Scan-Folder($folderItem, $relPath) {
				$folder = $folderItem.GetFolder
				if (-not $folder) { return }
				foreach ($item in $folder.Items()) {
					$name = $item.Name
					$subRelPath = if ($relPath -eq "") { $name } else { "$relPath/$name" }
					
					if ($item.IsFolder) {
						Scan-Folder $item $subRelPath
					} else {
						$ext = ""
						if ($name -match '\\.([a-zA-Z0-9]+)$') {
							$ext = "." + $Matches[1].ToLower()
						}
						if ($ext -in ".mp3", ".m4a", ".aac", ".flac", ".wav", ".ogg", ".wma") {
							$global:scannedCount++
							if ($global:scannedCount % 5 -eq 0) {
								Write-Output "PROGRESS_UPDATE:比較先ファイルをスキャン中... (\${global:scannedCount}曲)"
							}
							# Retrieve size and modification date using GetDetailsOf as direct properties are empty/0
							$sizeStr = $folder.GetDetailsOf($item, 2)
							$size = 0
							if ($sizeStr -and $sizeStr -match '([\\d\\.,\\s]+)\\s*(KB|MB|GB|B|バイト)?') {
								$val = [double]($Matches[1].Replace(",", "").Replace(" ", ""))
								$unit = $Matches[2]
								if ($unit -eq "KB") { $size = [int64]($val * 1024) }
								elseif ($unit -eq "MB") { $size = [int64]($val * 1024 * 1024) }
								elseif ($unit -eq "GB") { $size = [int64]($val * 1024 * 1024 * 1024) }
								else { $size = [int64]$val }
							} else {
								$size = $item.Size
							}

							$mtimeMs = 0
							$dateStr = $folder.GetDetailsOf($item, 3)
							if ($dateStr) {
								try {
									$date = Get-Date $dateStr
									$mtimeMs = [System.DateTimeOffset]::new($date).ToUnixTimeMilliseconds()
								} catch {
									Write-Warning "Failed to parse date string '$dateStr' for $name : $_"
								}
							}
							if ($mtimeMs -eq 0 -and $item.ModifyDate) {
								try {
									$date = Get-Date $item.ModifyDate
									$mtimeMs = [System.DateTimeOffset]::new($date).ToUnixTimeMilliseconds()
								} catch {
									Write-Warning "Failed to parse direct ModifyDate for $name : $_"
								}
							}
							[PSCustomObject]@{
								relativePath = $subRelPath
								size = $size
								mtimeMs = $mtimeMs
							}
						}
					}
				}
			}

			$results = Scan-Folder $targetItem ""
			if ($results -eq $null) {
				Write-Output "JSON_RESULTS_START"
				Write-Output "[]"
				Write-Output "JSON_RESULTS_END"
			} else {
				Write-Output "JSON_RESULTS_START"
				$arr = @($results)
				if ($arr.Count -eq 1) {
					"[" + ($arr[0] | ConvertTo-Json -Compress) + "]"
				} else {
					$arr | ConvertTo-Json -Compress
				}
				Write-Output "JSON_RESULTS_END"
			}
		`;

		try {
			const progressHandler = (line: string) => {
				const trimmed = line.trim();
				if (trimmed.startsWith("PROGRESS_UPDATE:") && onProgress) {
					onProgress(trimmed.substring("PROGRESS_UPDATE:".length));
				}
			};

			const rawStdout = await runPowerShellWithParams(script, { deviceName: this.deviceName, subPath: this.subPath }, progressHandler);

			// Extract the JSON results between custom tags
			let jsonPart = "[]";
			const startIndex = rawStdout.indexOf("JSON_RESULTS_START");
			const endIndex = rawStdout.indexOf("JSON_RESULTS_END");
			if (startIndex !== -1 && endIndex !== -1) {
				jsonPart = rawStdout.substring(startIndex + "JSON_RESULTS_START".length, endIndex).trim();
			} else {
				jsonPart = rawStdout.trim();
			}

			const parsed = JSON.parse(jsonPart || "[]");

			let rawList: any[] = [];
			if (Array.isArray(parsed)) {
				rawList = parsed;
			} else if (parsed && parsed.value !== undefined && Array.isArray(parsed.value)) {
				rawList = parsed.value;
			} else if (parsed && typeof parsed === "object" && Object.keys(parsed).length > 0) {
				// Single object
				if (parsed.relativePath !== undefined) {
					rawList = [parsed];
				}
			}

			this.fileMap.clear();

			const results: any[] = [];
			for (const item of rawList) {
				if (!item || !item.relativePath) {
					continue;
				}
				const relativePath = `${this.subPath}/${item.relativePath}`.replace(/\\/g, "/");
				const size = parseInt(item.size, 10) || 0;
				const mtimeMs = parseInt(item.mtimeMs, 10) || Date.now();

				this.fileMap.set(relativePath, { size, mtimeMs });

				results.push({
					filePath: `mtp_powershell://${encodeURIComponent(this.deviceName)}/${relativePath}`,
					relativePath,
					size,
					mtimeMs,
				});
			}
			return results;
		} catch (e) {
			console.error("[PowerShellMtp] findMusicFiles error:", e);
			throw e;
		}
	}

	async getTrackMetadata(filePath: string, relativePath: string): Promise<TrackMetadata> {
		if (process.platform !== "win32") {
			throw new Error("PowerShell MTP is only supported on Windows.");
		}

		// Create a completely separate, unique subdirectory to completely prevent lock and prompt-override issues
		const randSuffix = Math.random().toString(36).substring(2, 10);
		const trackTempDir = path.join(os.tmpdir(), "musicsync-mtp-temp", randSuffix);
		if (!fs.existsSync(trackTempDir)) {
			fs.mkdirSync(trackTempDir, { recursive: true });
		}

		const relPathInsideSub = this.getRelPathInsideSub(relativePath);

		const script = `
			$shell = New-Object -ComObject Shell.Application
			$phoneItem = $shell.NameSpace(17).Items() | Where-Object { $_.Name -eq $phoneName } | Select-Object -First 1
			if (-not $phoneItem) {
				$phoneItem = $shell.NameSpace(17).Items() | Where-Object { $_.Name -like "*$phoneName*" } | Select-Object -First 1
			}
			if (-not $phoneItem) { exit 1 }

			$fullPath = "$subPath/$relativePath"
			$fileItem = Get-MtpFolderItem $phoneItem $fullPath
			if (-not $fileItem) {
				[Console]::Error.WriteLine("[getTrackMetadata] File not found: " + $fullPath)
				exit 1
			}

			$localFolder = $shell.NameSpace($tempFilePath)
			# 16: Respond with "Yes to All" to any dialogs, 1024: Disable dialog UI completely
			$localFolder.CopyHere($fileItem, 16 + 1024)

			$tempCreatedFile = [System.IO.Path]::Combine($tempFilePath, $fileItem.Name)
			$success = $false
			for ($i = 0; $i -lt 100; $i++) {
				if (Test-Path -LiteralPath $tempCreatedFile) {
					# Short delay to ensure Windows is done writing to disk
					Start-Sleep -Milliseconds 150
					$success = $true
					break
				}
				Start-Sleep -Milliseconds 100
			}

			if ($success) {
				"SUCCESS"
			} else {
				"FAILED"
			}
		`;

		try {
			const res = await runPowerShellWithParams(script, {
				deviceName: this.deviceName,
				subPath: this.subPath,
				relativePath: relPathInsideSub,
				tempFilePath: trackTempDir,
			});
			if (res.trim() !== "SUCCESS") {
				throw new Error(`Failed to download file from MTP for metadata parsing: ${relativePath}`);
			}

			// Read directory files to dynamically identify the exact file name (handles matching, extensions, etc.)
			const filesInTemp = await fs.promises.readdir(trackTempDir);
			if (filesInTemp.length === 0) {
				throw new Error(`Temp folder is empty. File was not downloaded: ${relativePath}`);
			}

			const downloadedFileName = filesInTemp[0];
			const actualDownloadedFilePath = path.join(trackTempDir, downloadedFileName);

			const meta = await getLocalTrackMetadata(actualDownloadedFilePath, relativePath);
			meta.filePath = filePath;
			return meta;
		} finally {
			if (fs.existsSync(trackTempDir)) {
				try {
					const files = await fs.promises.readdir(trackTempDir);
					for (const file of files) {
						await fs.promises.unlink(path.join(trackTempDir, file));
					}
					await fs.promises.rmdir(trackTempDir);
				} catch (e) {
					console.error("[PowerShellMtp] Failed to delete trackTempDir:", e);
				}
			}
		}
	}

	async copyFileFromLocal(localSrc: string, remoteDestRelativePath: string): Promise<void> {
		if (process.platform !== "win32") {
			throw new Error("PowerShell MTP is only supported on Windows.");
		}

		const relPathInsideSub = this.getRelPathInsideSub(remoteDestRelativePath);
		const relativeDestDir = path.dirname(relPathInsideSub).replace(/\\/g, "/");
		const destDirInSub = relativeDestDir === "." ? "" : relativeDestDir;

		const script = `
			$shell = New-Object -ComObject Shell.Application
			$phoneItem = $shell.NameSpace(17).Items() | Where-Object { $_.Name -eq $phoneName } | Select-Object -First 1
			if (-not $phoneItem) {
				$phoneItem = $shell.NameSpace(17).Items() | Where-Object { $_.Name -like "*$phoneName*" } | Select-Object -First 1
			}
			if (-not $phoneItem) { throw "Phone not found" }

			$fullPath = if ($relativePath -eq "" -or $relativePath -eq ".") { $subPath } else { "$subPath/$relativePath" }
			$destFolderItem = Get-MtpFolderItem $phoneItem $fullPath
			if (-not $destFolderItem) {
				$destFolderItem = Ensure-MtpDirectory $phoneItem $fullPath
			}

			$destFolder = $destFolderItem.GetFolder
			$destFolder.CopyHere($localSrc, 16)

			$fileName = [System.IO.Path]::GetFileName($localSrc)
			$success = $false
			
			# Poll with refreshing and re-querying the target folder
			for ($i = 0; $i -lt 50; $i++) {
				$phoneItem = $shell.NameSpace(17).Items() | Where-Object { $_.Name -eq $phoneName } | Select-Object -First 1
				if (-not $phoneItem) {
					$phoneItem = $shell.NameSpace(17).Items() | Where-Object { $_.Name -like "*$phoneName*" } | Select-Object -First 1
				}
				$destFolderItem = Get-MtpFolderItem $phoneItem $fullPath
				
				if ($destFolderItem) {
					$item = $destFolderItem.GetFolder.Items() | Where-Object { $_.Name -eq $fileName } | Select-Object -First 1
					if ($item) {
						Start-Sleep -Milliseconds 500
						$success = $true
						break
					}
				}
				Start-Sleep -Milliseconds 200
			}

			if ($success) { "SUCCESS" } else { "FAILED" }
		`;

		const res = await runPowerShellWithParams(script, {
			deviceName: this.deviceName,
			subPath: this.subPath,
			localSrc: localSrc,
			relativePath: destDirInSub,
		});
		if (res.trim() !== "SUCCESS") {
			throw new Error(`Failed to copy file to MTP device: ${remoteDestRelativePath}`);
		}
	}

	async moveFile(oldRelativePath: string, newRelativePath: string): Promise<void> {
		if (process.platform !== "win32") {
			throw new Error("PowerShell MTP is only supported on Windows.");
		}

		const oldRelPathInsideSub = this.getRelPathInsideSub(oldRelativePath);
		const newRelPathInsideSub = this.getRelPathInsideSub(newRelativePath);

		const newRelDirInsideSub = path.dirname(newRelPathInsideSub).replace(/\\/g, "/");
		const newFileName = path.basename(newRelPathInsideSub);
		const oldFileName = path.basename(oldRelPathInsideSub);

		const script = `
			$shell = New-Object -ComObject Shell.Application
			$phoneItem = $shell.NameSpace(17).Items() | Where-Object { $_.Name -eq $phoneName } | Select-Object -First 1
			if (-not $phoneItem) {
				$phoneItem = $shell.NameSpace(17).Items() | Where-Object { $_.Name -like "*$phoneName*" } | Select-Object -First 1
			}
			if (-not $phoneItem) { throw "Phone not found" }

			$fullOldPath = "$subPath/$relativePath"
			$fileItem = Get-MtpFolderItem $phoneItem $fullOldPath
			if (-not $fileItem) { throw "Source file not found: $fullOldPath" }

			$fullNewDir = if ($tempFilePath -eq "" -or $tempFilePath -eq ".") { $subPath } else { "$subPath/$tempFilePath" }
			$destFolderItem = Get-MtpFolderItem $phoneItem $fullNewDir
			if (-not $destFolderItem) {
				$destFolderItem = Ensure-MtpDirectory $phoneItem $fullNewDir
			}

			if ($destFolderItem.Path -ne $fileItem.Parent.Path) {
				$destFolderItem.GetFolder.MoveHere($fileItem, 16)
				Start-Sleep -Milliseconds 250
				$fileItem = $destFolderItem.GetFolder.Items() | Where-Object { $_.Name -eq $oldRelativePath } | Select-Object -First 1
			}

			if ($fileItem -and $oldRelativePath -ne $newRelativePath) {
				$fileItem.Name = $newRelativePath
				Start-Sleep -Milliseconds 150
			}

			"SUCCESS"
		`;

		const res = await runPowerShellWithParams(script, {
			deviceName: this.deviceName,
			subPath: this.subPath,
			oldRelativePath: oldFileName,
			newRelativePath: newFileName,
			relativePath: oldRelPathInsideSub,
			tempFilePath: newRelDirInsideSub,
		});
		if (res.trim() !== "SUCCESS") {
			throw new Error(`Failed to move file: ${oldRelativePath} -> ${newRelativePath}`);
		}
	}

	async deleteFile(relativePath: string): Promise<void> {
		if (process.platform !== "win32") {
			throw new Error("PowerShell MTP is only supported on Windows.");
		}

		const relPathInsideSub = this.getRelPathInsideSub(relativePath);

		const script = `
			$shell = New-Object -ComObject Shell.Application
			$phoneItem = $shell.NameSpace(17).Items() | Where-Object { $_.Name -eq $phoneName } | Select-Object -First 1
			if (-not $phoneItem) {
				$phoneItem = $shell.NameSpace(17).Items() | Where-Object { $_.Name -like "*$phoneName*" } | Select-Object -First 1
			}
			if (-not $phoneItem) { exit 0 }

			$fullPath = "$subPath/$relativePath"
			$fileItem = Get-MtpFolderItem $phoneItem $fullPath
			if ($fileItem) {
				$tempDir = [System.IO.Path]::Combine($env:TEMP, [System.IO.Path]::GetRandomFileName())
				$null = New-Item -ItemType Directory -Path $tempDir -Force

				$tempFolder = $shell.NameSpace($tempDir)
				$tempFolder.MoveHere($fileItem, 16 + 1024)

				for ($i = 0; $i -lt 50; $i++) {
					if ((Get-ChildItem -Path $tempDir).Count -gt 0) { break }
					Start-Sleep -Milliseconds 100
				}

				Remove-Item $tempDir -Recurse -Force
			}
			"SUCCESS"
		`;

		await runPowerShellWithParams(script, {
			deviceName: this.deviceName,
			subPath: this.subPath,
			relativePath: relPathInsideSub,
		});
		this.fileMap.delete(relativePath);
	}

	async cleanEmptyDirs(): Promise<void> {
		if (process.platform !== "win32") {
			throw new Error("PowerShell MTP is only supported on Windows.");
		}

		const script = `
			$shell = New-Object -ComObject Shell.Application
			$phoneItem = $shell.NameSpace(17).Items() | Where-Object { $_.Name -eq $phoneName } | Select-Object -First 1
			if (-not $phoneItem) {
				$phoneItem = $shell.NameSpace(17).Items() | Where-Object { $_.Name -like "*$phoneName*" } | Select-Object -First 1
			}
			if (-not $phoneItem) { exit 0 }

			$targetRootItem = Get-MtpFolderItem $phoneItem $subPath
			if (-not $targetRootItem) { exit 0 }

			function Clean-EmptyMtpFolders($folderItem) {
				$folder = $folderItem.GetFolder
				if (-not $folder) { return }

				foreach ($item in $folder.Items()) {
					if ($item.GetFolder) {
						Clean-EmptyMtpFolders $item
					}
				}

				if ($folderItem.Path -ne $targetRootItem.Path) {
					if ($folder.Items().Count -eq 0) {
						$tempDir = [System.IO.Path]::Combine($env:TEMP, [System.IO.Path]::GetRandomFileName())
						$null = New-Item -ItemType Directory -Path $tempDir -Force
						$shell.NameSpace($tempDir).MoveHere($folderItem, 16 + 1024)
						Start-Sleep -Milliseconds 150
						Remove-Item $tempDir -Recurse -Force
					}
				}
			}

			Clean-EmptyMtpFolders $targetRootItem
			"SUCCESS"
		`;

		await runPowerShellWithParams(script, {
			deviceName: this.deviceName,
			subPath: this.subPath,
		});
	}

	async executeBatchSync(ops: { type: "copy" | "move" | "delete"; localSrc?: string; remoteDest?: string; oldRemoteSrc?: string; trackId: string }[], onProgress?: (msg: string, completed: number, total: number) => void, onConsecutiveFailures?: (failedCount: number) => Promise<boolean>): Promise<{ failedTrackIds: string[] }> {
		if (process.platform !== "win32") {
			console.log("[PowerShellMtp] executeBatchSync: simulated fallback mode on macOS/Linux.");
			const failedTrackIds: string[] = [];
			const total = ops.length;
			for (let i = 0; i < total; i++) {
				const op = ops[i];
				if (onProgress) {
					onProgress(`[Mock] Processing ${op.type} for ${op.trackId}`, i + 1, total);
				}
				await new Promise((resolve) => setTimeout(resolve, 50));
			}
			return { failedTrackIds };
		}

		const script = `
			$ops = $params.operations

			$shell = New-Object -ComObject Shell.Application
			$phoneItem = $shell.NameSpace(17).Items() | Where-Object { $_.Name -eq $phoneName } | Select-Object -First 1
			if (-not $phoneItem) {
				$phoneItem = $shell.NameSpace(17).Items() | Where-Object { $_.Name -like "*$phoneName*" } | Select-Object -First 1
			}
			if (-not $phoneItem) {
				throw "Phone not found: $phoneName"
			}

			$consecutiveFailures = 0
			$failedTrackIds = @()
			$total = $ops.Count
			$completed = 0

			foreach ($op in $ops) {
				$completed++
				$type = $op.type
				$trackId = $op.trackId
				$success = $false
				$errorMsg = ""

				try {
					if ($type -eq "delete") {
						$remoteDest = $op.remoteDest
						Write-Output "PROGRESS_UPDATE:STATUS:削除中 ($completed/$total): $remoteDest"
						
						$relPathInsideSub = $remoteDest
						if ($relPathInsideSub -match "^$subPath/(.*)$") {
							$relPathInsideSub = $Matches[1]
						}
						$fullPath = "$subPath/$relPathInsideSub"
						$fileItem = Get-MtpFolderItem $phoneItem $fullPath
						if ($fileItem) {
							$tempDir = [System.IO.Path]::Combine($env:TEMP, [System.IO.Path]::GetRandomFileName())
							$null = New-Item -ItemType Directory -Path $tempDir -Force

							$tempFolder = $shell.NameSpace($tempDir)
							$tempFolder.MoveHere($fileItem, 16 + 1024)

							for ($i = 0; $i -lt 50; $i++) {
								if ((Get-ChildItem -Path $tempDir).Count -gt 0) { break }
								Start-Sleep -Milliseconds 50
							}
							Remove-Item $tempDir -Recurse -Force
						}
						$success = $true
					}
					elseif ($type -eq "move") {
						$oldRemoteSrc = $op.oldRemoteSrc
						$remoteDest = $op.remoteDest
						Write-Output "PROGRESS_UPDATE:STATUS:配置整理中 ($completed/$total): $oldRemoteSrc"
						
						$oldRelPath = $oldRemoteSrc
						if ($oldRelPath -match "^$subPath/(.*)$") { $oldRelPath = $Matches[1] }
						$newRelPath = $remoteDest
						if ($newRelPath -match "^$subPath/(.*)$") { $newRelPath = $Matches[1] }

						$newRelDir = Split-Path $newRelPath
						$newRelDir = $newRelDir.Replace("\\", "/")
						if ($newRelDir -eq ".") { $newRelDir = "" }
						$newFileName = Split-Path $newRelPath -Leaf
						$oldFileName = Split-Path $oldRelPath -Leaf

						$fullOldPath = "$subPath/$oldRelPath"
						$fileItem = Get-MtpFolderItem $phoneItem $fullOldPath
						if (-not $fileItem) {
							throw "Source file not found: $fullOldPath"
						}

						$fullNewDir = if ($newRelDir -eq "" -or $newRelDir -eq ".") { $subPath } else { "$subPath/$newRelDir" }
						$destFolderItem = Get-MtpFolderItem $phoneItem $fullNewDir
						if (-not $destFolderItem) {
							$destFolderItem = Ensure-MtpDirectory $phoneItem $fullNewDir
						}

						if ($destFolderItem.Path -ne $fileItem.Parent.Path) {
							$destFolderItem.GetFolder.MoveHere($fileItem, 16)
							Start-Sleep -Milliseconds 150
							$fileItem = $destFolderItem.GetFolder.Items() | Where-Object { $_.Name -eq $oldFileName } | Select-Object -First 1
						}

						if ($fileItem -and $oldFileName -ne $newFileName) {
							$fileItem.Name = $newFileName
							Start-Sleep -Milliseconds 100
						}
						$success = $true
					}
					elseif ($type -eq "copy") {
						$localSrc = $op.localSrc
						$remoteDest = $op.remoteDest
						Write-Output "PROGRESS_UPDATE:STATUS:コピー中 ($completed/$total): $remoteDest"

						$relPath = $remoteDest
						if ($relPath -match "^$subPath/(.*)$") { $relPath = $Matches[1] }
						$relativeDestDir = Split-Path $relPath
						$relativeDestDir = $relativeDestDir.Replace("\\", "/")
						$destDirInSub = if ($relativeDestDir -eq "." -or $relativeDestDir -eq "") { "" } else { $relativeDestDir }

						$fullPath = if ($destDirInSub -eq "" -or $destDirInSub -eq ".") { $subPath } else { "$subPath/$destDirInSub" }
						$destFolderItem = Get-MtpFolderItem $phoneItem $fullPath
						if (-not $destFolderItem) {
							$destFolderItem = Ensure-MtpDirectory $phoneItem $fullPath
						}

						$destFolder = $destFolderItem.GetFolder
						$destFolder.CopyHere($localSrc, 16)

						$fileName = [System.IO.Path]::GetFileName($localSrc)
						$pollSuccess = $false
						
						for ($i = 0; $i -lt 50; $i++) {
							$phoneItem = $shell.NameSpace(17).Items() | Where-Object { $_.Name -eq $phoneName } | Select-Object -First 1
							if (-not $phoneItem) {
								$phoneItem = $shell.NameSpace(17).Items() | Where-Object { $_.Name -like "*$phoneName*" } | Select-Object -First 1
							}
							$destFolderItem = Get-MtpFolderItem $phoneItem $fullPath
							
							if ($destFolderItem) {
								$item = $destFolderItem.GetFolder.Items() | Where-Object { $_.Name -eq $fileName } | Select-Object -First 1
								if ($item) {
									Start-Sleep -Milliseconds 250
									$pollSuccess = $true
									break
								}
							}
							Start-Sleep -Milliseconds 100
						}

						if ($pollSuccess) {
							$success = $true
						} else {
							throw "Copy failed or verification timed out for: $fileName"
						}
					}
				} catch {
					$errorMsg = $_.ToString()
					$success = $false
				}

				if ($success) {
					$consecutiveFailures = 0
					Write-Output "PROGRESS_UPDATE:SUCCESS_OP:$trackId"
				} else {
					$consecutiveFailures++
					$failedTrackIds += $trackId
					Write-Output "PROGRESS_UPDATE:FAILED_OP:\${trackId}:$errorMsg"
					
					if ($consecutiveFailures -ge 3) {
						Write-Output "PROGRESS_UPDATE:CONSECUTIVE_FAILURES:$consecutiveFailures"
						# Wait for Node.js reply on stdin
						$reply = [Console]::In.ReadLine()
						if ($reply -eq "ABORT") {
							Write-Output "PROGRESS_UPDATE:STATUS:ユーザーにより中断されました。"
							break
						} else {
							$consecutiveFailures = 0
						}
					}
				}
			}

			Write-Output "JSON_RESULTS_START"
			if ($failedTrackIds.Count -eq 0) {
				"[]"
			} elseif ($failedTrackIds.Count -eq 1) {
				"[" + ($failedTrackIds[0] | ConvertTo-Json -Compress) + "]"
			} else {
				$failedTrackIds | ConvertTo-Json -Compress
			}
			Write-Output "JSON_RESULTS_END"
		`;

		const total = ops.length;
		let completed = 0;

		const progressHandler = (line: string, writeStdin: (str: string) => void) => {
			const trimmed = line.trim();
			if (trimmed.startsWith("PROGRESS_UPDATE:STATUS:")) {
				const msg = trimmed.substring("PROGRESS_UPDATE:STATUS:".length);
				if (onProgress) {
					onProgress(msg, completed, total);
				}
			} else if (trimmed.startsWith("PROGRESS_UPDATE:SUCCESS_OP:")) {
				completed++;
				if (onProgress) {
					onProgress(`処理成功: ${completed}/${total}`, completed, total);
				}
			} else if (trimmed.startsWith("PROGRESS_UPDATE:FAILED_OP:")) {
				completed++;
				const parts = trimmed.substring("PROGRESS_UPDATE:FAILED_OP:".length).split(":");
				const errorMsg = parts.slice(1).join(":");
				if (onProgress) {
					onProgress(`処理失敗: ${completed}/${total} (${errorMsg})`, completed, total);
				}
			} else if (trimmed.startsWith("PROGRESS_UPDATE:CONSECUTIVE_FAILURES:")) {
				const failedCount = parseInt(trimmed.substring("PROGRESS_UPDATE:CONSECUTIVE_FAILURES:".length), 10);
				if (onConsecutiveFailures) {
					onConsecutiveFailures(failedCount).then((shouldContinue) => {
						if (shouldContinue) {
							writeStdin("CONTINUE\r\n");
						} else {
							writeStdin("ABORT\r\n");
						}
					});
				} else {
					writeStdin("CONTINUE\r\n");
				}
			}
		};

		try {
			const rawStdout = await runPowerShellInteractive(
				script,
				{
					deviceName: this.deviceName,
					subPath: this.subPath,
					operations: ops,
				},
				progressHandler,
			);

			let jsonPart = "[]";
			const startIndex = rawStdout.indexOf("JSON_RESULTS_START");
			const endIndex = rawStdout.indexOf("JSON_RESULTS_END");
			if (startIndex !== -1 && endIndex !== -1) {
				jsonPart = rawStdout.substring(startIndex + "JSON_RESULTS_START".length, endIndex).trim();
			} else {
				jsonPart = rawStdout.trim();
			}

			const parsed = JSON.parse(jsonPart || "[]");
			const failedTrackIds: string[] = Array.isArray(parsed) ? parsed : [parsed];
			return { failedTrackIds };
		} catch (e) {
			console.error("[PowerShellMtp] executeBatchSync error:", e);
			throw e;
		}
	}

	async getFileSizes(relativePaths: string[]): Promise<Record<string, number>> {
		if (process.platform !== "win32") {
			console.log("[PowerShellMtp] getFileSizes: simulated fallback mode on macOS/Linux.");
			const mockSizes: Record<string, number> = {};
			relativePaths.forEach((rel) => {
				mockSizes[rel] = 1000000;
			});
			return mockSizes;
		}

		const script = `
			$relativePaths = $params.relativePaths

			$shell = New-Object -ComObject Shell.Application
			$phoneItem = $shell.NameSpace(17).Items() | Where-Object { $_.Name -eq $phoneName } | Select-Object -First 1
			if (-not $phoneItem) {
				$phoneItem = $shell.NameSpace(17).Items() | Where-Object { $_.Name -like "*$phoneName*" } | Select-Object -First 1
			}

			if (-not $phoneItem) {
				Write-Output "JSON_RESULTS_START"
				Write-Output "{}"
				Write-Output "JSON_RESULTS_END"
				exit 0
			}

			# Group paths by parent folder
			$grouped = @{}
			foreach ($rel in $relativePaths) {
				$normalized = $rel.Replace("\\", "/")
				$segments = $normalized -split "/"
				if ($segments.Count -le 1) {
					$parent = ""
					$file = $normalized
				} else {
					$parent = ($segments[0..($segments.Count-2)] -join "/")
					$file = $segments[-1]
				}
				if (-not $grouped.ContainsKey($parent)) {
					$grouped[$parent] = @()
				}
				$grouped[$parent] += $file
			}

			$results = @{}
			foreach ($parent in $grouped.Keys) {
				$fullParentPath = if ($parent -eq "") { $subPath } else { "$subPath/$parent" }
				$folderItem = Get-MtpFolderItem $phoneItem $fullParentPath
				if ($folderItem) {
					$folder = $folderItem.GetFolder
					if ($folder) {
						$files = $grouped[$parent]
						foreach ($item in $folder.Items()) {
							if ($item.Name -in $files) {
								$sizeStr = $folder.GetDetailsOf($item, 2)
								$size = 0
								if ($sizeStr -and $sizeStr -match '([\\d\\.,\\s]+)\\s*(KB|MB|GB|B|バイト)?') {
									$val = [double]($Matches[1].Replace(",", "").Replace(" ", ""))
									$unit = $Matches[2]
									if ($unit -eq "KB") { $size = [int64]($val * 1024) }
									elseif ($unit -eq "MB") { $size = [int64]($val * 1024 * 1024) }
									elseif ($unit -eq "GB") { $size = [int64]($val * 1024 * 1024 * 1024) }
									else { $size = [int64]$val }
								} else {
									$size = $item.Size
								}
								$fullRelPath = if ($parent -eq "") { $item.Name } else { "$parent/$($item.Name)" }
								$results[$fullRelPath] = $size
							}
						}
					}
				}
			}

			Write-Output "JSON_RESULTS_START"
			$results | ConvertTo-Json -Compress
			Write-Output "JSON_RESULTS_END"
		`;

		try {
			const rawStdout = await runPowerShellWithParams(script, {
				deviceName: this.deviceName,
				subPath: this.subPath,
				relativePaths,
			});

			let jsonPart = "{}";
			const startIndex = rawStdout.indexOf("JSON_RESULTS_START");
			const endIndex = rawStdout.indexOf("JSON_RESULTS_END");
			if (startIndex !== -1 && endIndex !== -1) {
				jsonPart = rawStdout.substring(startIndex + "JSON_RESULTS_START".length, endIndex).trim();
			} else {
				jsonPart = rawStdout.trim();
			}

			const parsed = JSON.parse(jsonPart || "{}");
			return parsed;
		} catch (e) {
			console.error("[PowerShellMtp] getFileSizes error:", e);
			return {};
		}
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

	if (storageType === "mtp_powershell") {
		console.log(`[StorageWrapper] Initializing PowerShell MTP Wrapper for Device: ${profile.mtpDeviceName}, Subpath: ${profile.mtpSubPath}...`);
		return new PowerShellMtpStorageWrapper(profile.mtpDeviceName || "Mock Device", profile.mtpSubPath || "Music");
	}

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
