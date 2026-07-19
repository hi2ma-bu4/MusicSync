// src/main.ts
import { app as app2 } from "electron";

// src/main/index.ts
import { BrowserWindow } from "electron";
import path from "node:path";
function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(process.cwd(), "dist", "preload.js"),
      contextIsolation: true
    }
  });
  win.loadFile(path.join(process.cwd(), "dist", "index.html"));
}

// src/main/ipc.ts
import { dialog, ipcMain } from "electron";
import Store from "electron-store";

// src/main/scanner.ts
import { app } from "electron";
import fs2 from "node:fs";
import path3 from "node:path";

// src/main/utils.ts
import { parseFile } from "music-metadata";
import fs from "node:fs";
import path2 from "node:path";
function normText(val) {
  if (!val) return "";
  return String(val).trim().toLowerCase().normalize("NFKC").replace(/[\s\-_]+/g, " ");
}
function normTrack(val) {
  if (!val) return "";
  const s = String(val).trim();
  const firstPart = s.split("/")[0].trim();
  const num = parseInt(firstPart, 10);
  if (!isNaN(num)) {
    return String(num);
  }
  return firstPart.toLowerCase();
}
async function findMusicFiles(dir, baseDir = dir) {
  const results = [];
  let list = [];
  try {
    list = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch (e) {
    return [];
  }
  const validExtensions = /* @__PURE__ */ new Set([".mp3", ".m4a", ".aac", ".flac", ".wav", ".ogg", ".wma"]);
  for (const item of list) {
    const resPath = path2.join(dir, item.name);
    if (item.isDirectory()) {
      const subFiles = await findMusicFiles(resPath, baseDir);
      results.push(...subFiles);
    } else {
      const ext = path2.extname(item.name).toLowerCase();
      if (validExtensions.has(ext)) {
        const relativePath = path2.relative(baseDir, resPath).replace(/\\/g, "/");
        results.push({ filePath: resPath, relativePath });
      }
    }
  }
  return results;
}
async function getTrackMetadata(filePath, relativePath) {
  try {
    const stats = await fs.promises.stat(filePath);
    const metadata = await parseFile(filePath, { skipCovers: false });
    const title = metadata.common.title || path2.basename(filePath, path2.extname(filePath));
    const artist = metadata.common.artist || "Unknown Artist";
    const album = metadata.common.album || "Unknown Album";
    let trackStr = "";
    if (metadata.common.track && metadata.common.track.no !== null) {
      trackStr = String(metadata.common.track.no);
    }
    const genre = metadata.common.genre && metadata.common.genre[0] || "Unknown Genre";
    const picture = metadata.common.picture && metadata.common.picture[0];
    const hasCoverArt = !!picture;
    const coverArtSize = picture ? picture.data.length : 0;
    return {
      id: "",
      filePath,
      relativePath,
      title,
      artist,
      album,
      track: trackStr,
      genre,
      size: stats.size,
      mtimeMs: stats.mtimeMs,
      hasCoverArt,
      coverArtSize
    };
  } catch (err) {
    const stats = await fs.promises.stat(filePath);
    return {
      id: "",
      filePath,
      relativePath,
      title: path2.basename(filePath, path2.extname(filePath)),
      artist: "Unknown Artist",
      album: "Unknown Album",
      track: "",
      genre: "Unknown Genre",
      size: stats.size,
      mtimeMs: stats.mtimeMs,
      hasCoverArt: false,
      coverArtSize: 0
    };
  }
}

// src/main/scanner.ts
var lastScanResults = {};
var cachesDir = path3.join(app.getPath("userData"), "caches");
if (!fs2.existsSync(cachesDir)) {
  fs2.mkdirSync(cachesDir, { recursive: true });
}
function getCachePath(profileId, suffix) {
  return path3.join(cachesDir, `${profileId}_${suffix}.json`);
}
function loadCache(profileId, suffix) {
  const cachePath = getCachePath(profileId, suffix);
  if (fs2.existsSync(cachePath)) {
    try {
      return JSON.parse(fs2.readFileSync(cachePath, "utf-8"));
    } catch (e) {
      console.error("Failed to parse cache", e);
    }
  }
  return {};
}
function saveCache(profileId, suffix, cache) {
  const cachePath = getCachePath(profileId, suffix);
  try {
    fs2.writeFileSync(cachePath, JSON.stringify(cache), "utf-8");
  } catch (e) {
    console.error("Failed to save cache", e);
  }
}
async function runScan(profile, event) {
  const profileId = profile.id;
  const sendProgress = (step, message, progress, details) => {
    event.sender.send("scan-progress", { step, message, progress, ...details });
  };
  sendProgress("itunes_list", "iTunes\u30D5\u30A9\u30EB\u30C0\u5185\u306E\u30D5\u30A1\u30A4\u30EB\u3092\u691C\u7D22\u4E2D...", 5);
  const itunesFiles = await findMusicFiles(profile.itunesPath);
  sendProgress("phone_list", "\u30B9\u30DE\u30DB\u30D5\u30A9\u30EB\u30C0\u5185\u306E\u30D5\u30A1\u30A4\u30EB\u3092\u691C\u7D22\u4E2D...", 15);
  const phoneFiles = await findMusicFiles(profile.phonePath);
  const itunesCache = loadCache(profileId, "itunes");
  const phoneCache = loadCache(profileId, "phone");
  const newItunesCache = {};
  const newPhoneCache = {};
  const itunesTracks = [];
  const phoneTracks = [];
  let current = 0;
  let total = itunesFiles.length;
  for (const file of itunesFiles) {
    current++;
    if (current % 100 === 0 || current === total) {
      const pct = 15 + Math.round(current / total * 35);
      sendProgress("itunes_parse", `iTunes\u306E\u66F2\u60C5\u5831\u3092\u89E3\u6790\u4E2D... (${current}/${total})`, pct, { count: current, total });
    }
    try {
      const stats = await fs2.promises.stat(file.filePath);
      let meta = itunesCache[file.relativePath];
      if (meta && meta.mtimeMs === stats.mtimeMs && meta.size === stats.size) {
        newItunesCache[file.relativePath] = meta;
      } else {
        meta = await getTrackMetadata(file.filePath, file.relativePath);
        newItunesCache[file.relativePath] = meta;
      }
      meta.id = `itunes_${file.relativePath}`;
      itunesTracks.push(meta);
    } catch (e) {
      console.error("Error stats itunes file", file.filePath, e);
    }
  }
  saveCache(profileId, "itunes", newItunesCache);
  current = 0;
  total = phoneFiles.length;
  for (const file of phoneFiles) {
    current++;
    if (current % 100 === 0 || current === total) {
      const pct = 50 + Math.round(current / total * 35);
      sendProgress("phone_parse", `\u30B9\u30DE\u30DB\u306E\u66F2\u60C5\u5831\u3092\u89E3\u6790\u4E2D... (${current}/${total})`, pct, { count: current, total });
    }
    try {
      const stats = await fs2.promises.stat(file.filePath);
      let meta = phoneCache[file.relativePath];
      if (meta && meta.mtimeMs === stats.mtimeMs && meta.size === stats.size) {
        newPhoneCache[file.relativePath] = meta;
      } else {
        meta = await getTrackMetadata(file.filePath, file.relativePath);
        newPhoneCache[file.relativePath] = meta;
      }
      meta.id = `phone_${file.relativePath}`;
      phoneTracks.push(meta);
    } catch (e) {
      console.error("Error stats phone file", file.filePath, e);
    }
  }
  saveCache(profileId, "phone", newPhoneCache);
  sendProgress("comparing", "\u66F2\u60C5\u5831\u306E\u5DEE\u5206\u3092\u6BD4\u8F03\u4E2D...", 90);
  const phoneByTitle = /* @__PURE__ */ new Map();
  const phoneByArtistAlbumTrack = /* @__PURE__ */ new Map();
  const phoneByRelativePath = /* @__PURE__ */ new Map();
  for (const p of phoneTracks) {
    phoneByRelativePath.set(p.relativePath, p);
    const tNorm = normText(p.title);
    if (tNorm) {
      if (!phoneByTitle.has(tNorm)) phoneByTitle.set(tNorm, []);
      phoneByTitle.get(tNorm).push(p);
    }
    const aNorm = normText(p.artist);
    const albNorm = normText(p.album);
    const trkNorm = normTrack(p.track);
    const key = `${aNorm}|${albNorm}|${trkNorm}`;
    if (aNorm || albNorm || trkNorm) {
      if (!phoneByArtistAlbumTrack.has(key)) phoneByArtistAlbumTrack.set(key, []);
      phoneByArtistAlbumTrack.get(key).push(p);
    }
  }
  const matchedPhoneIds = /* @__PURE__ */ new Set();
  const results = [];
  for (const I of itunesTracks) {
    const candidates = /* @__PURE__ */ new Set();
    const directPathMatch = phoneByRelativePath.get(I.relativePath);
    if (directPathMatch) {
      candidates.add(directPathMatch);
    }
    const iTitleNorm = normText(I.title);
    if (iTitleNorm) {
      const list = phoneByTitle.get(iTitleNorm) || [];
      for (const p of list) {
        candidates.add(p);
      }
    }
    const iArtistNorm = normText(I.artist);
    const iAlbumNorm = normText(I.album);
    const iTrackNorm = normTrack(I.track);
    const key = `${iArtistNorm}|${iAlbumNorm}|${iTrackNorm}`;
    if (iArtistNorm || iAlbumNorm || iTrackNorm) {
      const list = phoneByArtistAlbumTrack.get(key) || [];
      for (const p of list) {
        candidates.add(p);
      }
    }
    let bestMatch = null;
    let bestScore = 0;
    let bestMatchesFields = [];
    const nonEmptyCount = (iArtistNorm !== "" ? 1 : 0) + (iAlbumNorm !== "" ? 1 : 0) + (iTitleNorm !== "" ? 1 : 0) + (iTrackNorm !== "" ? 1 : 0);
    for (const P of candidates) {
      if (matchedPhoneIds.has(P.id)) continue;
      let score = 0;
      const fields = [];
      const pArtistNorm = normText(P.artist);
      if (iArtistNorm === pArtistNorm && iArtistNorm !== "") {
        score++;
        fields.push("artist");
      } else if (iArtistNorm === "" && pArtistNorm === "") {
        score++;
        fields.push("artist");
      }
      const pAlbumNorm = normText(P.album);
      if (iAlbumNorm === pAlbumNorm && iAlbumNorm !== "") {
        score++;
        fields.push("album");
      } else if (iAlbumNorm === "" && pAlbumNorm === "") {
        score++;
        fields.push("album");
      }
      const pTitleNorm = normText(P.title);
      if (iTitleNorm === pTitleNorm && iTitleNorm !== "") {
        score++;
        fields.push("title");
      } else if (iTitleNorm === "" && pTitleNorm === "") {
        score++;
        fields.push("title");
      }
      const pTrackNorm = normTrack(P.track);
      if (iTrackNorm === pTrackNorm && iTrackNorm !== "") {
        score++;
        fields.push("track");
      } else if (iTrackNorm === "" && pTrackNorm === "") {
        score++;
        fields.push("track");
      }
      let isValidMatch = false;
      if (nonEmptyCount < 2) {
        if (I.relativePath === P.relativePath) {
          isValidMatch = true;
        }
      } else {
        if (score >= 3) {
          isValidMatch = true;
        }
      }
      if (isValidMatch) {
        if (!bestMatch) {
          bestMatch = P;
          bestScore = score;
          bestMatchesFields = fields;
        } else {
          if (P.relativePath === I.relativePath) {
            bestMatch = P;
            bestScore = score;
            bestMatchesFields = fields;
          } else if (bestMatch.relativePath !== I.relativePath) {
            if (score > bestScore) {
              bestMatch = P;
              bestScore = score;
              bestMatchesFields = fields;
            }
          }
        }
      }
    }
    if (bestMatch) {
      matchedPhoneIds.add(bestMatch.id);
      const pathMismatch = I.relativePath !== bestMatch.relativePath;
      let metadataMismatch = false;
      if (bestScore < 4) {
        metadataMismatch = true;
      }
      if (I.hasCoverArt !== bestMatch.hasCoverArt || I.coverArtSize !== bestMatch.coverArtSize) {
        metadataMismatch = true;
      }
      if (I.genre !== bestMatch.genre) {
        metadataMismatch = true;
      }
      results.push({
        id: I.id,
        itunesTrack: I,
        phoneTrack: bestMatch,
        status: metadataMismatch ? "updated" : "synced",
        pathMismatch
      });
    } else {
      results.push({
        id: I.id,
        itunesTrack: I,
        status: "missing",
        pathMismatch: false
      });
    }
  }
  for (const P of phoneTracks) {
    if (!matchedPhoneIds.has(P.id)) {
      results.push({
        id: P.id,
        phoneTrack: P,
        status: "phone_only",
        pathMismatch: false
      });
    }
  }
  lastScanResults[profileId] = results;
  sendProgress("done", "\u6BD4\u8F03\u5B8C\u4E86", 100);
}

// src/main/sync.ts
import fs3 from "node:fs";
import path4 from "node:path";
async function cleanEmptyDirsRecursive(dir, rootDir) {
  try {
    const list = await fs3.promises.readdir(dir, { withFileTypes: true });
    for (const item of list) {
      if (item.isDirectory()) {
        const sub = path4.join(dir, item.name);
        await cleanEmptyDirsRecursive(sub, rootDir);
      }
    }
    if (dir !== rootDir) {
      const files = await fs3.promises.readdir(dir);
      if (files.length === 0) {
        await fs3.promises.rmdir(dir);
      }
    }
  } catch (e) {
  }
}
async function runSync(profile, options, event) {
  const profileId = profile.id;
  const { copyTrackIds, moveTrackIds, deleteTrackIds } = options;
  const scanItems = lastScanResults[profileId] || [];
  const sendProgress = (status, message, progress, logs2) => {
    event.sender.send("sync-progress", { status, message, progress, logs: logs2 });
  };
  const logs = [];
  const logAndSend = (msg, pct) => {
    logs.push(msg);
    sendProgress("running", msg, pct, logs);
  };
  const totalOperations = copyTrackIds.length + moveTrackIds.length + deleteTrackIds.length;
  let completed = 0;
  const getPct = () => {
    if (totalOperations === 0) return 100;
    return Math.round(completed / totalOperations * 100);
  };
  try {
    if (deleteTrackIds.length > 0) {
      logAndSend(`\u30B9\u30DE\u30DB\u5074\u306E\u4F59\u5206\u306A\u66F2\u306E\u524A\u9664\u3092\u958B\u59CB\u3057\u307E\u3059... (\u5BFE\u8C61: ${deleteTrackIds.length}\u66F2)`, getPct());
      for (const id of deleteTrackIds) {
        const item = scanItems.find((x) => x.id === id);
        if (item && item.phoneTrack) {
          try {
            if (fs3.existsSync(item.phoneTrack.filePath)) {
              await fs3.promises.unlink(item.phoneTrack.filePath);
            }
            logAndSend(`\u524A\u9664\u6210\u529F: ${item.phoneTrack.relativePath}`, getPct());
          } catch (e) {
            logAndSend(`\u524A\u9664\u5931\u6557: ${item.phoneTrack.relativePath} - ${e.message}`, getPct());
          }
        }
        completed++;
      }
    }
    if (moveTrackIds.length > 0) {
      logAndSend(`\u30B9\u30DE\u30DB\u5074\u306E\u30D5\u30A1\u30A4\u30EB\u306E\u914D\u7F6E\u518D\u6574\u7406\u3092\u958B\u59CB\u3057\u307E\u3059... (\u5BFE\u8C61: ${moveTrackIds.length}\u66F2)`, getPct());
      for (const id of moveTrackIds) {
        const item = scanItems.find((x) => x.id === id);
        if (item && item.itunesTrack && item.phoneTrack) {
          const oldPath = item.phoneTrack.filePath;
          const newRelative = item.itunesTrack.relativePath;
          const newPath = path4.join(profile.phonePath, newRelative);
          try {
            if (fs3.existsSync(oldPath)) {
              const targetDir = path4.dirname(newPath);
              await fs3.promises.mkdir(targetDir, { recursive: true });
              try {
                await fs3.promises.rename(oldPath, newPath);
              } catch (e) {
                await fs3.promises.copyFile(oldPath, newPath);
                await fs3.promises.unlink(oldPath);
              }
              logAndSend(`\u79FB\u52D5\u6210\u529F: ${item.phoneTrack.relativePath} -> ${newRelative}`, getPct());
              item.phoneTrack.filePath = newPath;
              item.phoneTrack.relativePath = newRelative;
              item.pathMismatch = false;
            } else {
              logAndSend(`\u8B66\u544A: \u79FB\u52D5\u5143\u30D5\u30A1\u30A4\u30EB\u304C\u5B58\u5728\u3057\u307E\u305B\u3093: ${item.phoneTrack.relativePath}`, getPct());
            }
          } catch (e) {
            logAndSend(`\u79FB\u52D5\u5931\u6557: ${item.phoneTrack.relativePath} - ${e.message}`, getPct());
          }
        }
        completed++;
      }
    }
    if (copyTrackIds.length > 0) {
      logAndSend(`iTunes\u304B\u3089\u30B9\u30DE\u30DB\u3078\u306E\u66F2\u306E\u30B3\u30D4\u30FC\u3092\u958B\u59CB\u3057\u307E\u3059... (\u5BFE\u8C61: ${copyTrackIds.length}\u66F2)`, getPct());
      for (const id of copyTrackIds) {
        const item = scanItems.find((x) => x.id === id);
        if (item && item.itunesTrack) {
          const sourcePath = item.itunesTrack.filePath;
          const relative = item.itunesTrack.relativePath;
          const targetPath = path4.join(profile.phonePath, relative);
          try {
            if (fs3.existsSync(sourcePath)) {
              const targetDir = path4.dirname(targetPath);
              await fs3.promises.mkdir(targetDir, { recursive: true });
              await fs3.promises.copyFile(sourcePath, targetPath);
              logAndSend(`\u30B3\u30D4\u30FC\u6210\u529F: ${relative}`, getPct());
            } else {
              logAndSend(`\u30A8\u30E9\u30FC: \u30B3\u30D4\u30FC\u5143\u30D5\u30A1\u30A4\u30EB\u304C\u5B58\u5728\u3057\u307E\u305B\u3093: ${relative}`, getPct());
            }
          } catch (e) {
            logAndSend(`\u30B3\u30D4\u30FC\u5931\u6557: ${relative} - ${e.message}`, getPct());
          }
        }
        completed++;
      }
    }
    logAndSend("\u30B9\u30DE\u30DB\u30D5\u30A9\u30EB\u30C0\u5185\u306E\u7A7A\u30D5\u30A9\u30EB\u30C0\u3092\u30AF\u30EA\u30FC\u30F3\u30A2\u30C3\u30D7\u4E2D...", getPct());
    await cleanEmptyDirsRecursive(profile.phonePath, profile.phonePath);
    logAndSend("\u7A7A\u30D5\u30A9\u30EB\u30C0\u306E\u30AF\u30EA\u30FC\u30F3\u30A2\u30C3\u30D7\u304C\u5B8C\u4E86\u3057\u307E\u3057\u305F\u3002", 100);
    sendProgress("done", "\u540C\u671F\u5B8C\u4E86", 100, logs);
  } catch (e) {
    logs.push(`\u81F4\u547D\u7684\u306A\u30A8\u30E9\u30FC\u304C\u767A\u751F\u3057\u307E\u3057\u305F: ${e.message}`);
    sendProgress("error", "\u30A8\u30E9\u30FC\u7D42\u4E86", getPct(), logs);
  }
}

// src/main/ipc.ts
var store = new Store();
function registerIpcHandlers() {
  ipcMain.handle("get-profiles", () => {
    return store.get("profiles", []);
  });
  ipcMain.handle("save-profile", (_event, profile) => {
    const profiles = store.get("profiles", []);
    const index = profiles.findIndex((p) => p.id === profile.id);
    if (index > -1) {
      profiles[index] = profile;
    } else {
      profiles.push(profile);
    }
    store.set("profiles", profiles);
    return profiles;
  });
  ipcMain.handle("delete-profile", (_event, id) => {
    let profiles = store.get("profiles", []);
    profiles = profiles.filter((p) => p.id !== id);
    store.set("profiles", profiles);
    return profiles;
  });
  ipcMain.handle("get-settings", () => {
    return store.get("settings", {
      colorMissing: "#22c55e",
      colorUpdated: "#f59e0b",
      colorSynced: "#94a3b8",
      colorPhoneOnly: "#ef4444"
    });
  });
  ipcMain.handle("save-settings", (_event, settings) => {
    store.set("settings", settings);
  });
  ipcMain.handle("select-folder", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory"]
    });
    if (result.canceled) {
      return null;
    }
    return result.filePaths[0];
  });
  ipcMain.handle("start-scan", async (event, profileId) => {
    const profiles = store.get("profiles", []);
    const profile = profiles.find((p) => p.id === profileId);
    if (!profile) {
      throw new Error("Profile not found");
    }
    await runScan(profile, event);
  });
  ipcMain.handle("get-scan-result", (_event, profileId) => {
    return lastScanResults[profileId] || [];
  });
  ipcMain.handle("execute-sync", async (event, profileId, options) => {
    const profiles = store.get("profiles", []);
    const profile = profiles.find((p) => p.id === profileId);
    if (!profile) {
      throw new Error("Profile not found");
    }
    await runSync(profile, options, event);
  });
}

// src/main.ts
app2.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();
});
//# sourceMappingURL=main.js.map
