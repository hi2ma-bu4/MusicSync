// src/main/metadataWorker.ts
import { parseFile } from "music-metadata";
import { parentPort } from "node:worker_threads";
if (parentPort) {
  parentPort.on("message", async (msg) => {
    try {
      const metadata = await parseFile(msg.filePath, { skipCovers: false });
      const picture = metadata.common.picture && metadata.common.picture[0];
      if (picture) {
        parentPort.postMessage({
          taskId: msg.taskId,
          success: true,
          pictureData: picture.data,
          pictureFormat: picture.format
        });
      } else {
        parentPort.postMessage({
          taskId: msg.taskId,
          success: true,
          pictureData: null
        });
      }
    } catch (e) {
      parentPort.postMessage({
        taskId: msg.taskId,
        success: false,
        error: e.message || String(e)
      });
    }
  });
}
//# sourceMappingURL=metadataWorker.js.map
