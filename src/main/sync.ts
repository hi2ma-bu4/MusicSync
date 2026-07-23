import fs from "node:fs";
import path from "node:path";
import { lastScanResults } from "./scanner";
import { getStorageWrapper } from "./storageWrapper";
import { SyncOptions } from "./types";

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

	const storage = getStorageWrapper(profile);

	try {
		// Connection Check: Ensure phonePath is accessible initially
		if (!(await storage.isConnected())) {
			throw new Error(`比較先「${profile.name}」にアクセスできません。接続状況を確認してください。`);
		}

		// 1. DELETE OPERATIONS
		if (deleteTrackIds.length > 0) {
			logAndSend(`比較先側の余分な曲の削除を開始します... (対象: ${deleteTrackIds.length}曲)`, getPct());
			for (const id of deleteTrackIds) {
				// Periodically check connection
				if (!(await storage.isConnected())) {
					throw new Error("処理中に比較先との接続が切断されました。");
				}

				const item = scanItems.find((x) => x.id === id);
				if (item && item.phoneTrack) {
					try {
						if (await storage.exists(item.phoneTrack.relativePath)) {
							await storage.deleteFile(item.phoneTrack.relativePath);
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
				if (!(await storage.isConnected())) {
					throw new Error("処理中に比較先との接続が切断されました。");
				}

				const item = scanItems.find((x) => x.id === id);
				if (item && item.itunesTrack && item.phoneTrack) {
					const oldRelative = item.phoneTrack.relativePath;
					const newRelative = item.itunesTrack.relativePath;

					try {
						if (await storage.exists(oldRelative)) {
							// Move file using storage wrapper
							await storage.moveFile(oldRelative, newRelative);

							logAndSend(`移動成功: ${oldRelative} -> ${newRelative}`, getPct());
							// Update phone track info in our results
							if (profile.storageType === "mtp") {
								item.phoneTrack.filePath = `mtp://${profile.usbVendorId}/${profile.usbProductId}/${newRelative}`;
							} else if (profile.storageType === "mtp_powershell") {
								item.phoneTrack.filePath = `mtp_powershell://${encodeURIComponent(profile.mtpDeviceName)}/${newRelative}`;
							} else {
								item.phoneTrack.filePath = path.join(profile.phonePath, newRelative);
							}
							item.phoneTrack.relativePath = newRelative;
							item.pathMismatch = false;
						} else {
							logAndSend(`警告: 移動元ファイルが存在しません: ${oldRelative}`, getPct());
							failedTracksSet.add(id);
						}
					} catch (e: any) {
						console.error(`Failed to move file: ${oldRelative}`, e);
						logAndSend(`移動失敗: ${oldRelative} - ${e.message} (リカバリー処理のためスキップします)`, getPct());
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
				if (!(await storage.isConnected())) {
					throw new Error("処理中に比較先との接続が切断されました。");
				}

				const item = scanItems.find((x) => x.id === id);
				if (item && item.itunesTrack) {
					const sourcePath = item.itunesTrack.filePath;
					const relative = item.itunesTrack.relativePath;

					try {
						if (fs.existsSync(sourcePath)) {
							// Copy file from local to storage using storage wrapper
							await storage.copyFileFromLocal(sourcePath, relative);

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
		await storage.cleanEmptyDirs();
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

				try {
					if (!(await storage.exists(relative))) {
						logAndSend(`⚠️ 整合性エラー: 比較先ファイルが存在しません: ${relative}`, getPct());
						failedCheckCount++;
						failedTracksSet.add(task.id);
					} else {
						const sourceStats = await fs.promises.stat(item.itunesTrack.filePath);

						let remotePath = "";
						if (profile.storageType === "mtp") {
							remotePath = `mtp://${profile.usbVendorId}/${profile.usbProductId}/${relative}`;
						} else if (profile.storageType === "mtp_powershell") {
							remotePath = `mtp_powershell://${encodeURIComponent(profile.mtpDeviceName)}/${relative}`;
						} else {
							remotePath = path.join(profile.phonePath, relative);
						}
						const remoteMeta = await storage.getTrackMetadata(remotePath, relative);

						if (sourceStats.size !== remoteMeta.size) {
							logAndSend(`⚠️ 整合性エラー: ファイルサイズ不一致: ${relative} (ソース: ${sourceStats.size}B, 比較先: ${remoteMeta.size}B)`, getPct());
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
