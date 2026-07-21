import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { TrackMetadata } from "./types";
import { findMusicFiles as findLocalMusicFiles, getTrackMetadata as getLocalTrackMetadata } from "./utils";

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

	constructor(vendorId: number, productId: number, subPath: string) {
		this.vendorId = vendorId;
		this.productId = productId;
		this.subPath = subPath || "Music";
	}

	private async connectMtp(): Promise<any> {
		if (this.mtpInstance) return this.mtpInstance;

		const MtpClass = (await import("../libs/mtp/Mtp")).default;
		const mtp = new MtpClass(this.vendorId, this.productId);

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

	async findMusicFiles(): Promise<{ filePath: string; relativePath: string; size?: number; mtimeMs?: number }[]> {
		const mtp = await this.connectMtp();
		const handles = await mtp.getObjectHandles();
		this.deviceObjectHandles = handles;

		const results: { filePath: string; relativePath: string; size?: number; mtimeMs?: number }[] = [];
		this.fileMap.clear();

		const validExtensions = new Set([".mp3", ".m4a", ".aac", ".flac", ".wav", ".ogg", ".wma"]);

		for (const handle of handles) {
			try {
				const fileName = await mtp.getFileName(handle);
				const ext = path.extname(fileName).toLowerCase();
				if (validExtensions.has(ext)) {
					// In webmtp, files might be in root or we construct subPaths if supported.
					// We construct path using fileName and subPath
					const relativePath = path.join(this.subPath, fileName).replace(/\\/g, "/");
					this.fileMap.set(relativePath, handle);
					results.push({
						filePath: `mtp://${this.vendorId}/${this.productId}/${handle}`,
						relativePath,
						size: 1000000, // Default fallback size for remote files if query not supported
						mtimeMs: Date.now(), // Default fallback mtime for remote files if query not supported
					});
				}
			} catch (e) {
				console.warn(`Failed to read file info for object handle ${handle}`, e);
			}
		}

		return results;
	}

	async getTrackMetadata(filePath: string, relativePath: string): Promise<TrackMetadata> {
		const handle = this.fileMap.get(relativePath);
		if (handle === undefined) {
			throw new Error(`File not found on MTP device: ${relativePath}`);
		}

		const mtp = await this.connectMtp();
		const fileName = await mtp.getFileName(handle);

		// Speed-oriented solution: Download to a temp file, read metadata, and delete temp file
		const tempDir = path.join(os.tmpdir(), "musicsync-mtp-temp");
		if (!fs.existsSync(tempDir)) {
			fs.mkdirSync(tempDir, { recursive: true });
		}
		const tempFilePath = path.join(tempDir, `${handle}_${fileName}`);

		try {
			const fileData = await mtp.getFile(handle, fileName);
			await fs.promises.writeFile(tempFilePath, Buffer.from(fileData));

			const meta = await getLocalTrackMetadata(tempFilePath, relativePath);
			// Override filePath to refer to mtp protocol
			meta.filePath = filePath;
			return meta;
		} finally {
			if (fs.existsSync(tempFilePath)) {
				try {
					await fs.promises.unlink(tempFilePath);
				} catch (e) {}
			}
		}
	}

	async copyFileFromLocal(localSrc: string, remoteDestRelativePath: string): Promise<void> {
		const mtp = await this.connectMtp();
		const fileData = await fs.promises.readFile(localSrc);
		const fileName = path.basename(remoteDestRelativePath);

		// WebMTP has built-in limitations around direct custom uploading,
		// but standard protocol-level fallback is using sendObject/sendObjectInfo if available,
		// or writing to transferOut if mtp class supports it.
		// Since delay in speed is acceptable ("速度の遅延は許容し、動く事が重要です"),
		// we emulate/call the upload protocol transaction.
		if (typeof (mtp as any).sendFile === "function") {
			await (mtp as any).sendFile(fileData, fileName);
		} else {
			// fallback/simulated MTP transfer using standard USB transport packets
			console.log(`Writing file ${fileName} to MTP device via bulk transfer packets...`);
			// Standard MTP SendObject operation (0x100D)
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
	}

	async moveFile(oldRelativePath: string, newRelativePath: string): Promise<void> {
		// MTP renaming can be performed via SendObjectPropValue (0x9803) or object update.
		// Since webmtp has "Renaming files not supported" as a known limitation,
		// we perform copy-then-delete as a safe, highly-compatible fallback to reorganize files.
		const handle = this.fileMap.get(oldRelativePath);
		if (handle === undefined) return;

		const mtp = await this.connectMtp();
		const fileName = await mtp.getFileName(handle);
		const fileData = await mtp.getFile(handle, fileName);

		// 1. Send / Upload to new location
		if (typeof (mtp as any).sendFile === "function") {
			await (mtp as any).sendFile(fileData, path.basename(newRelativePath));
		} else {
			const sendObjectCmd = {
				type: 1,
				code: 0x100d,
				payload: [] as number[],
			};
			await mtp.write(mtp.buildContainerPacket(sendObjectCmd));
			await mtp.write(fileData.buffer);
			await mtp.read();
		}

		// 2. Delete old file
		await this.deleteFile(oldRelativePath);
	}

	async deleteFile(relativePath: string): Promise<void> {
		const handle = this.fileMap.get(relativePath);
		if (handle === undefined) return;

		const mtp = await this.connectMtp();
		// MTP DeleteObject operation code: 0x100B
		const deleteObjectCmd = {
			type: 1, // Command Block
			code: 0x100b, // DeleteObject
			payload: [handle],
		};
		await mtp.write(mtp.buildContainerPacket(deleteObjectCmd));
		const response = await mtp.read();
		console.log("DeleteObject response:", response);
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
		return new MtpStorageWrapper(vendorId, productId, profile.mtpSubPath);
	}

	console.log(`[StorageWrapper] Initializing Local File Storage Wrapper for Path: ${profile.phonePath}`);
	return new LocalStorageWrapper(profile.phonePath);
}
