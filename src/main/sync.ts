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
		console.warn(`Failed to clean empty directories recursively in ${dir}:`, e);
	}
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

export async function runSync(profile: any, options: SyncOptions, event: Electron.IpcMainInvokeEvent): Promise<{ failedTrackIds: string[] }> {
	const profileId = profile.id;
	const { copyTrackIds, moveTrackIds, deleteTrackIds } = options;
	const scanItems = lastScanResults[profileId] || [];
	const failedTracksSet = new Set<string>();

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
		// Connection Check: Ensure phonePath is accessible initially
		if (!fs.existsSync(profile.phonePath)) {
			throw new Error(`比較先フォルダ「${profile.phonePath}」にアクセスできません。接続状況を確認してください。`);
		}

		// 1. DELETE OPERATIONS
		if (deleteTrackIds.length > 0) {
			logAndSend(`比較先側の余分な曲の削除を開始します... (対象: ${deleteTrackIds.length}曲)`, getPct());
			for (const id of deleteTrackIds) {
				// Periodically check connection
				if (!fs.existsSync(profile.phonePath)) {
					throw new Error(`処理中に比較先との接続が切断されました: ${profile.phonePath}`);
				}

				const item = scanItems.find((x) => x.id === id);
				if (item && item.phoneTrack) {
					try {
						if (fs.existsSync(item.phoneTrack.filePath)) {
							await fs.promises.unlink(item.phoneTrack.filePath);
						}
						logAndSend(`削除成功: ${item.phoneTrack.relativePath}`, getPct());
					} catch (e: any) {
						console.error(`Failed to delete file: ${item.phoneTrack.relativePath}`, e);
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
				// Periodically check connection
				if (!fs.existsSync(profile.phonePath)) {
					throw new Error(`処理中に比較先との接続が切断されました: ${profile.phonePath}`);
				}

				const item = scanItems.find((x) => x.id === id);
				if (item && item.itunesTrack && item.phoneTrack) {
					const oldPath = item.phoneTrack.filePath;
					const newRelative = item.itunesTrack.relativePath;
					const newPath = path.join(profile.phonePath, newRelative);

					try {
						if (fs.existsSync(oldPath)) {
							const targetDir = path.dirname(newPath);
							await fs.promises.mkdir(targetDir, { recursive: true });

							// Move with robust retries
							await moveFileWithRetry(oldPath, newPath, 3, 1000);

							logAndSend(`移動成功: ${item.phoneTrack.relativePath} -> ${newRelative}`, getPct());
							// Update phone track info in our results
							item.phoneTrack.filePath = newPath;
							item.phoneTrack.relativePath = newRelative;
							item.pathMismatch = false;
						} else {
							logAndSend(`警告: 移動元ファイルが存在しません: ${item.phoneTrack.relativePath}`, getPct());
							failedTracksSet.add(id);
						}
					} catch (e: any) {
						console.error(`Failed to move file: ${item.phoneTrack.relativePath}`, e);
						logAndSend(`移動失敗: ${item.phoneTrack.relativePath} - ${e.message} (リカバリー処理のためスキップします)`, getPct());
						failedTracksSet.add(id);
					}
				}
				completed++;
			}
		}

		// 3. COPY OPERATIONS
		if (copyTrackIds.length > 0) {
			logAndSend(`iTunesから比較先への曲のコピーを開始します... (対象: ${copyTrackIds.length}曲)`, getPct());
			for (const id of copyTrackIds) {
				// Periodically check connection
				if (!fs.existsSync(profile.phonePath)) {
					throw new Error(`処理中に比較先との接続が切断されました: ${profile.phonePath}`);
				}

				const item = scanItems.find((x) => x.id === id);
				if (item && item.itunesTrack) {
					const sourcePath = item.itunesTrack.filePath;
					const relative = item.itunesTrack.relativePath;
					const targetPath = path.join(profile.phonePath, relative);

					try {
						if (fs.existsSync(sourcePath)) {
							const targetDir = path.dirname(targetPath);
							await fs.promises.mkdir(targetDir, { recursive: true });

							// Copy with robust retries
							await copyFileWithRetry(sourcePath, targetPath, 3, 1000);

							logAndSend(`コピー成功: ${relative}`, getPct());
						} else {
							logAndSend(`エラー: コピー元ファイルが存在しません: ${relative}`, getPct());
							failedTracksSet.add(id);
						}
					} catch (e: any) {
						console.error(`Failed to copy file: ${relative}`, e);
						logAndSend(`コピー失敗: ${relative} - ${e.message} (リカバリー処理のためスキップします)`, getPct());
						failedTracksSet.add(id);
					}
				}
				completed++;
			}
		}

		// 4. CLEAN UP EMPTY DIRECTORIES
		logAndSend("比較先フォルダ内の空フォルダをクリーンアップ中...", getPct());
		await cleanEmptyDirsRecursive(profile.phonePath, profile.phonePath);
		logAndSend("空フォルダのクリーンアップが完了しました。", getPct());

		// 5. POST-SYNC INTEGRITY CHECK / FINAL VERIFICATION
		logAndSend("最終整合性チェックを実行中...", getPct());
		let failedCheckCount = 0;
		let successCheckCount = 0;

		const verifyList = [...copyTrackIds.map((id) => ({ id, op: "コピー" })), ...moveTrackIds.map((id) => ({ id, op: "移動" }))];

		for (const task of verifyList) {
			const item = scanItems.find((x) => x.id === task.id);
			if (item && item.itunesTrack) {
				const relative = item.itunesTrack.relativePath;
				const targetPath = path.join(profile.phonePath, relative);

				try {
					if (!fs.existsSync(targetPath)) {
						logAndSend(`⚠️ 整合性エラー: 比較先ファイルが存在しません: ${relative}`, getPct());
						failedCheckCount++;
						failedTracksSet.add(task.id);
					} else {
						const sourceStats = await fs.promises.stat(item.itunesTrack.filePath);
						const targetStats = await fs.promises.stat(targetPath);

						if (sourceStats.size !== targetStats.size) {
							logAndSend(`⚠️ 整合性エラー: ファイルサイズ不一致: ${relative} (ソース: ${sourceStats.size}B, 比較先: ${targetStats.size}B)`, getPct());
							failedCheckCount++;
							failedTracksSet.add(task.id);
						} else {
							successCheckCount++;
						}
					}
				} catch (err: any) {
					logAndSend(`⚠️ 整合性確認失敗: ${relative} - ${err.message}`, getPct());
					failedCheckCount++;
					failedTracksSet.add(task.id);
				}
			}
		}

		if (failedCheckCount === 0) {
			logAndSend(`整合性チェック成功: 全ての同期対象 (${successCheckCount}件) が正常に確認されました。`, 100);
		} else {
			logAndSend(`⚠️ 警告: 整合性チェックを通過できなかったファイルが ${failedCheckCount} 件あります。接続の安定性等を確認してください。`, 100);
		}

		sendProgress("done", "同期完了", 100, logs);
		return { failedTrackIds: Array.from(failedTracksSet) };
	} catch (e: any) {
		logs.push(`致命的なエラーが発生しました: ${e.message}`);
		sendProgress("error", "エラー終了", getPct(), logs);
		return { failedTrackIds: Array.from(failedTracksSet) };
	}
}
