import fs from "node:fs";
import path from "node:path";
import { lastScanResults } from "./scanner";
import { SyncOptions } from "./types";

async function cleanEmptyDirsRecursive(dir: string, rootDir: string) {
	try {
		const list = await fs.promises.readdir(dir, { withFileTypes: true });
		for (const item of list) {
			if (item.isDirectory()) {
				const sub = path.join(dir, item.name);
				await cleanEmptyDirsRecursive(sub, rootDir);
			}
		}

		if (dir !== rootDir) {
			const files = await fs.promises.readdir(dir);
			if (files.length === 0) {
				await fs.promises.rmdir(dir);
			}
		}
	} catch (e) {
		// Ignore
	}
}

export async function runSync(profile: any, options: SyncOptions, event: Electron.IpcMainInvokeEvent): Promise<void> {
	const profileId = profile.id;
	const { copyTrackIds, moveTrackIds, deleteTrackIds } = options;
	const scanItems = lastScanResults[profileId] || [];

	const sendProgress = (status: "running" | "done" | "error", message: string, progress: number, logs: string[]) => {
		event.sender.send("sync-progress", { status, message, progress, logs });
	};

	const logs: string[] = [];
	const logAndSend = (msg: string, pct: number) => {
		logs.push(msg);
		sendProgress("running", msg, pct, logs);
	};

	const totalOperations = copyTrackIds.length + moveTrackIds.length + deleteTrackIds.length;
	let completed = 0;

	const getPct = () => {
		if (totalOperations === 0) return 100;
		return Math.round((completed / totalOperations) * 100);
	};

	try {
		// 1. DELETE OPERATIONS
		if (deleteTrackIds.length > 0) {
			logAndSend(`比較先側の余分な曲の削除を開始します... (対象: ${deleteTrackIds.length}曲)`, getPct());
			for (const id of deleteTrackIds) {
				const item = scanItems.find((x) => x.id === id);
				if (item && item.phoneTrack) {
					try {
						if (fs.existsSync(item.phoneTrack.filePath)) {
							await fs.promises.unlink(item.phoneTrack.filePath);
						}
						logAndSend(`削除成功: ${item.phoneTrack.relativePath}`, getPct());
					} catch (e: any) {
						logAndSend(`削除失敗: ${item.phoneTrack.relativePath} - ${e.message}`, getPct());
					}
				}
				completed++;
			}
		}

		// 2. MOVE (REORGANIZE) OPERATIONS
		if (moveTrackIds.length > 0) {
			logAndSend(`比較先側のファイルの配置再整理を開始します... (対象: ${moveTrackIds.length}曲)`, getPct());
			for (const id of moveTrackIds) {
				const item = scanItems.find((x) => x.id === id);
				if (item && item.itunesTrack && item.phoneTrack) {
					const oldPath = item.phoneTrack.filePath;
					const newRelative = item.itunesTrack.relativePath;
					const newPath = path.join(profile.phonePath, newRelative);

					try {
						if (fs.existsSync(oldPath)) {
							const targetDir = path.dirname(newPath);
							await fs.promises.mkdir(targetDir, { recursive: true });

							// Safely rename or fallback to copy/unlink
							try {
								await fs.promises.rename(oldPath, newPath);
							} catch (e) {
								await fs.promises.copyFile(oldPath, newPath);
								await fs.promises.unlink(oldPath);
							}

							logAndSend(`移動成功: ${item.phoneTrack.relativePath} -> ${newRelative}`, getPct());
							// Update phone track info in our results
							item.phoneTrack.filePath = newPath;
							item.phoneTrack.relativePath = newRelative;
							item.pathMismatch = false;
						} else {
							logAndSend(`警告: 移動元ファイルが存在しません: ${item.phoneTrack.relativePath}`, getPct());
						}
					} catch (e: any) {
						logAndSend(`移動失敗: ${item.phoneTrack.relativePath} - ${e.message}`, getPct());
					}
				}
				completed++;
			}
		}

		// 3. COPY OPERATIONS
		if (copyTrackIds.length > 0) {
			logAndSend(`iTunesから比較先への曲のコピーを開始します... (対象: ${copyTrackIds.length}曲)`, getPct());
			for (const id of copyTrackIds) {
				const item = scanItems.find((x) => x.id === id);
				if (item && item.itunesTrack) {
					const sourcePath = item.itunesTrack.filePath;
					const relative = item.itunesTrack.relativePath;
					const targetPath = path.join(profile.phonePath, relative);

					try {
						if (fs.existsSync(sourcePath)) {
							const targetDir = path.dirname(targetPath);
							await fs.promises.mkdir(targetDir, { recursive: true });
							await fs.promises.copyFile(sourcePath, targetPath);
							logAndSend(`コピー成功: ${relative}`, getPct());
						} else {
							logAndSend(`エラー: コピー元ファイルが存在しません: ${relative}`, getPct());
						}
					} catch (e: any) {
						logAndSend(`コピー失敗: ${relative} - ${e.message}`, getPct());
					}
				}
				completed++;
			}
		}

		// 4. CLEAN UP EMPTY DIRECTORIES
		logAndSend("比較先フォルダ内の空フォルダをクリーンアップ中...", getPct());
		await cleanEmptyDirsRecursive(profile.phonePath, profile.phonePath);
		logAndSend("空フォルダのクリーンアップが完了しました。", 100);

		sendProgress("done", "同期完了", 100, logs);
	} catch (e: any) {
		logs.push(`致命的なエラーが発生しました: ${e.message}`);
		sendProgress("error", "エラー終了", getPct(), logs);
	}
}
