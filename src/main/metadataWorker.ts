import { parseFile } from "music-metadata";
import { parentPort } from "node:worker_threads";

if (parentPort) {
	parentPort.on("message", async (msg: { filePath: string; taskId: string }) => {
		try {
			const metadata = await parseFile(msg.filePath, { skipCovers: false });
			const picture = metadata.common.picture && metadata.common.picture[0];
			if (picture) {
				parentPort!.postMessage({
					taskId: msg.taskId,
					success: true,
					pictureData: picture.data,
					pictureFormat: picture.format,
				});
			} else {
				parentPort!.postMessage({
					taskId: msg.taskId,
					success: true,
					pictureData: null,
				});
			}
		} catch (e: any) {
			parentPort!.postMessage({
				taskId: msg.taskId,
				success: false,
				error: e.message || String(e),
			});
		}
	});
}
