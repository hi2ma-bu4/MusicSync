// src/main.ts
import { app as app3, protocol as protocol2 } from "electron";

// src/main/index.ts
import { BrowserWindow } from "electron";
import Store from "electron-store";
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
  const store2 = new Store();
  win.webContents.on("before-input-event", (event, input) => {
    if ((input.control || input.meta) && input.shift && input.key.toLowerCase() === "i") {
      const settings = store2.get("settings", {});
      if (settings && settings.devMode) {
        win.webContents.toggleDevTools();
        event.preventDefault();
      }
    }
  });
  win.setMenuBarVisibility(false);
  win.removeMenu();
  win.loadFile(path.join(process.cwd(), "dist", "index.html"));
}

// src/main/ipc.ts
import { app as app2, dialog as dialog2, ipcMain, Menu, MenuItem, net, protocol, shell } from "electron";
import Store2 from "electron-store";
import fs4 from "node:fs";
import path5 from "node:path";
import { pathToFileURL } from "node:url";

// src/shared/constants.ts
var DEFAULT_DELIMITERS = [",", "|", "feat.", ";", "\u3001", "\uFF0F"];

// src/main/scanner.ts
import { app, dialog } from "electron";
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
    console.error(`Failed to read directory: ${dir}`, e);
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
    let discStr = "";
    if (metadata.common.disk && metadata.common.disk.no !== null) {
      discStr = String(metadata.common.disk.no);
    }
    const genre = metadata.common.genre && metadata.common.genre[0] || "Unknown Genre";
    const picture = metadata.common.picture && metadata.common.picture[0];
    const hasCoverArt = !!picture;
    const coverArtSize = picture ? picture.data.length : 0;
    const albumartist = metadata.common.albumartist || "";
    const composer = metadata.common.composer && metadata.common.composer[0] || "";
    let yearStr = "";
    if (metadata.common.year) {
      yearStr = String(metadata.common.year);
    } else if (metadata.common.date) {
      const match = metadata.common.date.match(/\d{4}/);
      if (match) {
        yearStr = match[0];
      } else {
        yearStr = metadata.common.date;
      }
    }
    let commentStr = "";
    if (metadata.common.comment && metadata.common.comment.length > 0) {
      const c = metadata.common.comment[0];
      if (typeof c === "string") {
        commentStr = c;
      } else if (c && typeof c === "object" && "text" in c) {
        commentStr = c.text || "";
      }
    }
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
      coverArtSize,
      disc: discStr,
      albumartist,
      composer,
      year: yearStr,
      comment: commentStr
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
      coverArtSize: 0,
      disc: "",
      albumartist: "",
      composer: "",
      year: "",
      comment: ""
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
      const cache = JSON.parse(fs2.readFileSync(cachePath, "utf-8"));
      let hasFormatMismatch = false;
      const keys = Object.keys(cache);
      if (keys.length > 0) {
        const firstItem = cache[keys[0]];
        if (firstItem && firstItem.comment === void 0) {
          hasFormatMismatch = true;
        }
      }
      if (hasFormatMismatch) {
        const choice = dialog.showMessageBoxSync({
          type: "question",
          buttons: ["\u306F\u3044 (Yes)", "\u3044\u3044\u3048 (No)"],
          title: "\u30AD\u30E3\u30C3\u30B7\u30E5\u30D5\u30A9\u30FC\u30DE\u30C3\u30C8\u5909\u66F4\u306E\u78BA\u8A8D",
          message: "\u30A2\u30C3\u30D7\u30C7\u30FC\u30C8\u306B\u3088\u308A\u30AD\u30E3\u30C3\u30B7\u30E5\u30C7\u30FC\u30BF\u306E\u30D5\u30A9\u30FC\u30DE\u30C3\u30C8\u304C\u65B0\u3057\u304F\u306A\u308A\u307E\u3057\u305F\u3002\u53E4\u3044\u30AD\u30E3\u30C3\u30B7\u30E5\u3092\u524A\u9664\uFF08\u30EA\u30BB\u30C3\u30C8\uFF09\u3057\u3066\u518D\u69CB\u7BC9\u3057\u307E\u3059\u304B\uFF1F"
        });
        if (choice === 0) {
          try {
            fs2.unlinkSync(cachePath);
          } catch (e) {
          }
          return {};
        }
      }
      return cache;
    } catch (e) {
      console.error("Failed to parse cache", e);
      dialog.showMessageBoxSync({
        type: "warning",
        buttons: ["\u4E86\u89E3"],
        title: "\u30AD\u30E3\u30C3\u30B7\u30E5\u8AAD\u307F\u8FBC\u307F\u30A8\u30E9\u30FC",
        message: "\u30D7\u30ED\u30D5\u30A1\u30A4\u30EB\u306E\u30AD\u30E3\u30C3\u30B7\u30E5\u30D5\u30A1\u30A4\u30EB\u304C\u7834\u640D\u3057\u3066\u3044\u308B\u304B\u3001\u30D5\u30A9\u30FC\u30DE\u30C3\u30C8\u304C\u53E4\u3044\u305F\u3081\u8AAD\u307F\u8FBC\u3081\u307E\u305B\u3093\u3067\u3057\u305F\u3002\u30AD\u30E3\u30C3\u30B7\u30E5\u306F\u81EA\u52D5\u7684\u306B\u518D\u69CB\u7BC9\u3055\u308C\u307E\u3059\u3002"
      });
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
  sendProgress("phone_list", "\u6BD4\u8F03\u5148\u30D5\u30A9\u30EB\u30C0\u5185\u306E\u30D5\u30A1\u30A4\u30EB\u3092\u691C\u7D22\u4E2D...", 15);
  const phoneFiles = await findMusicFiles(profile.phonePath);
  const itunesCache = loadCache(profileId, "itunes");
  const phoneCache = loadCache(profileId, "phone");
  const buildSecondaryIndex = (cache) => {
    const index = /* @__PURE__ */ new Map();
    for (const key of Object.keys(cache)) {
      const meta = cache[key];
      if (meta && meta.size !== void 0 && meta.mtimeMs !== void 0) {
        index.set(`${meta.size}_${meta.mtimeMs}`, meta);
      }
    }
    return index;
  };
  const itunesSecondaryIndex = buildSecondaryIndex(itunesCache);
  const phoneSecondaryIndex = buildSecondaryIndex(phoneCache);
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
        const key = `${stats.size}_${stats.mtimeMs}`;
        const cachedMeta = itunesSecondaryIndex.get(key);
        if (cachedMeta) {
          meta = {
            ...cachedMeta,
            filePath: file.filePath,
            relativePath: file.relativePath
          };
          newItunesCache[file.relativePath] = meta;
        } else {
          meta = await getTrackMetadata(file.filePath, file.relativePath);
          newItunesCache[file.relativePath] = meta;
        }
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
      sendProgress("phone_parse", `\u6BD4\u8F03\u5148\u30D5\u30A9\u30EB\u30C0\u5185\u306E\u66F2\u60C5\u5831\u3092\u89E3\u6790\u4E2D... (${current}/${total})`, pct, { count: current, total });
    }
    try {
      const stats = await fs2.promises.stat(file.filePath);
      let meta = phoneCache[file.relativePath];
      if (meta && meta.mtimeMs === stats.mtimeMs && meta.size === stats.size) {
        newPhoneCache[file.relativePath] = meta;
      } else {
        const key = `${stats.size}_${stats.mtimeMs}`;
        const cachedMeta = phoneSecondaryIndex.get(key);
        if (cachedMeta) {
          meta = {
            ...cachedMeta,
            filePath: file.filePath,
            relativePath: file.relativePath
          };
          newPhoneCache[file.relativePath] = meta;
        } else {
          meta = await getTrackMetadata(file.filePath, file.relativePath);
          newPhoneCache[file.relativePath] = meta;
        }
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
      if ((I.albumartist || "") !== (bestMatch.albumartist || "")) {
        metadataMismatch = true;
      }
      if ((I.composer || "") !== (bestMatch.composer || "")) {
        metadataMismatch = true;
      }
      if ((I.year || "") !== (bestMatch.year || "")) {
        metadataMismatch = true;
      }
      if ((I.comment || "") !== (bestMatch.comment || "")) {
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
    console.warn(`Failed to clean empty directories recursively in ${dir}:`, e);
  }
}
async function copyFileWithRetry(source, target, retries = 3, delayMs = 1e3) {
  for (let i = 0; i < retries; i++) {
    try {
      await fs3.promises.copyFile(source, target);
      return;
    } catch (e) {
      if (i === retries - 1) {
        throw e;
      }
      console.warn(`Copy failed, retrying (${i + 2}/${retries + 1}) after ${delayMs}ms. Error: ${e.message}`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
async function moveFileWithRetry(source, target, retries = 3, delayMs = 1e3) {
  for (let i = 0; i < retries; i++) {
    try {
      try {
        await fs3.promises.rename(source, target);
      } catch (e) {
        console.warn(`Rename failed, falling back to copy/unlink: ${source} -> ${target}`, e);
        await fs3.promises.copyFile(source, target);
        await fs3.promises.unlink(source);
      }
      return;
    } catch (e) {
      if (i === retries - 1) {
        throw e;
      }
      console.warn(`Move failed, retrying (${i + 2}/${retries + 1}) after ${delayMs}ms. Error: ${e.message}`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
async function runSync(profile, options, event) {
  const profileId = profile.id;
  const { copyTrackIds, moveTrackIds, deleteTrackIds } = options;
  const scanItems = lastScanResults[profileId] || [];
  const failedTracksSet = /* @__PURE__ */ new Set();
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
    if (!fs3.existsSync(profile.phonePath)) {
      throw new Error(`\u6BD4\u8F03\u5148\u30D5\u30A9\u30EB\u30C0\u300C${profile.phonePath}\u300D\u306B\u30A2\u30AF\u30BB\u30B9\u3067\u304D\u307E\u305B\u3093\u3002\u63A5\u7D9A\u72B6\u6CC1\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002`);
    }
    if (deleteTrackIds.length > 0) {
      logAndSend(`\u6BD4\u8F03\u5148\u5074\u306E\u4F59\u5206\u306A\u66F2\u306E\u524A\u9664\u3092\u958B\u59CB\u3057\u307E\u3059... (\u5BFE\u8C61: ${deleteTrackIds.length}\u66F2)`, getPct());
      for (const id of deleteTrackIds) {
        if (!fs3.existsSync(profile.phonePath)) {
          throw new Error(`\u51E6\u7406\u4E2D\u306B\u6BD4\u8F03\u5148\u3068\u306E\u63A5\u7D9A\u304C\u5207\u65AD\u3055\u308C\u307E\u3057\u305F: ${profile.phonePath}`);
        }
        const item = scanItems.find((x) => x.id === id);
        if (item && item.phoneTrack) {
          try {
            if (fs3.existsSync(item.phoneTrack.filePath)) {
              await fs3.promises.unlink(item.phoneTrack.filePath);
            }
            logAndSend(`\u524A\u9664\u6210\u529F: ${item.phoneTrack.relativePath}`, getPct());
          } catch (e) {
            console.error(`Failed to delete file: ${item.phoneTrack.relativePath}`, e);
            logAndSend(`\u524A\u9664\u5931\u6557: ${item.phoneTrack.relativePath} - ${e.message}`, getPct());
          }
        }
        completed++;
      }
    }
    if (moveTrackIds.length > 0) {
      logAndSend(`\u6BD4\u8F03\u5148\u5074\u306E\u30D5\u30A1\u30A4\u30EB\u306E\u914D\u7F6E\u518D\u6574\u7406\u3092\u958B\u59CB\u3057\u307E\u3059... (\u5BFE\u8C61: ${moveTrackIds.length}\u66F2)`, getPct());
      for (const id of moveTrackIds) {
        if (!fs3.existsSync(profile.phonePath)) {
          throw new Error(`\u51E6\u7406\u4E2D\u306B\u6BD4\u8F03\u5148\u3068\u306E\u63A5\u7D9A\u304C\u5207\u65AD\u3055\u308C\u307E\u3057\u305F: ${profile.phonePath}`);
        }
        const item = scanItems.find((x) => x.id === id);
        if (item && item.itunesTrack && item.phoneTrack) {
          const oldPath = item.phoneTrack.filePath;
          const newRelative = item.itunesTrack.relativePath;
          const newPath = path4.join(profile.phonePath, newRelative);
          try {
            if (fs3.existsSync(oldPath)) {
              const targetDir = path4.dirname(newPath);
              await fs3.promises.mkdir(targetDir, { recursive: true });
              await moveFileWithRetry(oldPath, newPath, 3, 1e3);
              logAndSend(`\u79FB\u52D5\u6210\u529F: ${item.phoneTrack.relativePath} -> ${newRelative}`, getPct());
              item.phoneTrack.filePath = newPath;
              item.phoneTrack.relativePath = newRelative;
              item.pathMismatch = false;
            } else {
              logAndSend(`\u8B66\u544A: \u79FB\u52D5\u5143\u30D5\u30A1\u30A4\u30EB\u304C\u5B58\u5728\u3057\u307E\u305B\u3093: ${item.phoneTrack.relativePath}`, getPct());
              failedTracksSet.add(id);
            }
          } catch (e) {
            console.error(`Failed to move file: ${item.phoneTrack.relativePath}`, e);
            logAndSend(`\u79FB\u52D5\u5931\u6557: ${item.phoneTrack.relativePath} - ${e.message} (\u30EA\u30AB\u30D0\u30EA\u30FC\u51E6\u7406\u306E\u305F\u3081\u30B9\u30AD\u30C3\u30D7\u3057\u307E\u3059)`, getPct());
            failedTracksSet.add(id);
          }
        }
        completed++;
      }
    }
    if (copyTrackIds.length > 0) {
      logAndSend(`iTunes\u304B\u3089\u6BD4\u8F03\u5148\u3078\u306E\u66F2\u306E\u30B3\u30D4\u30FC\u3092\u958B\u59CB\u3057\u307E\u3059... (\u5BFE\u8C61: ${copyTrackIds.length}\u66F2)`, getPct());
      for (const id of copyTrackIds) {
        if (!fs3.existsSync(profile.phonePath)) {
          throw new Error(`\u51E6\u7406\u4E2D\u306B\u6BD4\u8F03\u5148\u3068\u306E\u63A5\u7D9A\u304C\u5207\u65AD\u3055\u308C\u307E\u3057\u305F: ${profile.phonePath}`);
        }
        const item = scanItems.find((x) => x.id === id);
        if (item && item.itunesTrack) {
          const sourcePath = item.itunesTrack.filePath;
          const relative = item.itunesTrack.relativePath;
          const targetPath = path4.join(profile.phonePath, relative);
          try {
            if (fs3.existsSync(sourcePath)) {
              const targetDir = path4.dirname(targetPath);
              await fs3.promises.mkdir(targetDir, { recursive: true });
              await copyFileWithRetry(sourcePath, targetPath, 3, 1e3);
              logAndSend(`\u30B3\u30D4\u30FC\u6210\u529F: ${relative}`, getPct());
            } else {
              logAndSend(`\u30A8\u30E9\u30FC: \u30B3\u30D4\u30FC\u5143\u30D5\u30A1\u30A4\u30EB\u304C\u5B58\u5728\u3057\u307E\u305B\u3093: ${relative}`, getPct());
              failedTracksSet.add(id);
            }
          } catch (e) {
            console.error(`Failed to copy file: ${relative}`, e);
            logAndSend(`\u30B3\u30D4\u30FC\u5931\u6557: ${relative} - ${e.message} (\u30EA\u30AB\u30D0\u30EA\u30FC\u51E6\u7406\u306E\u305F\u3081\u30B9\u30AD\u30C3\u30D7\u3057\u307E\u3059)`, getPct());
            failedTracksSet.add(id);
          }
        }
        completed++;
      }
    }
    logAndSend("\u6BD4\u8F03\u5148\u30D5\u30A9\u30EB\u30C0\u5185\u306E\u7A7A\u30D5\u30A9\u30EB\u30C0\u3092\u30AF\u30EA\u30FC\u30F3\u30A2\u30C3\u30D7\u4E2D...", getPct());
    await cleanEmptyDirsRecursive(profile.phonePath, profile.phonePath);
    logAndSend("\u7A7A\u30D5\u30A9\u30EB\u30C0\u306E\u30AF\u30EA\u30FC\u30F3\u30A2\u30C3\u30D7\u304C\u5B8C\u4E86\u3057\u307E\u3057\u305F\u3002", getPct());
    logAndSend("\u6700\u7D42\u6574\u5408\u6027\u30C1\u30A7\u30C3\u30AF\u3092\u5B9F\u884C\u4E2D...", getPct());
    let failedCheckCount = 0;
    let successCheckCount = 0;
    const verifyList = [...copyTrackIds.map((id) => ({ id, op: "\u30B3\u30D4\u30FC" })), ...moveTrackIds.map((id) => ({ id, op: "\u79FB\u52D5" }))];
    for (const task of verifyList) {
      const item = scanItems.find((x) => x.id === task.id);
      if (item && item.itunesTrack) {
        const relative = item.itunesTrack.relativePath;
        const targetPath = path4.join(profile.phonePath, relative);
        try {
          if (!fs3.existsSync(targetPath)) {
            logAndSend(`\u26A0\uFE0F \u6574\u5408\u6027\u30A8\u30E9\u30FC: \u6BD4\u8F03\u5148\u30D5\u30A1\u30A4\u30EB\u304C\u5B58\u5728\u3057\u307E\u305B\u3093: ${relative}`, getPct());
            failedCheckCount++;
            failedTracksSet.add(task.id);
          } else {
            const sourceStats = await fs3.promises.stat(item.itunesTrack.filePath);
            const targetStats = await fs3.promises.stat(targetPath);
            if (sourceStats.size !== targetStats.size) {
              logAndSend(`\u26A0\uFE0F \u6574\u5408\u6027\u30A8\u30E9\u30FC: \u30D5\u30A1\u30A4\u30EB\u30B5\u30A4\u30BA\u4E0D\u4E00\u81F4: ${relative} (\u30BD\u30FC\u30B9: ${sourceStats.size}B, \u6BD4\u8F03\u5148: ${targetStats.size}B)`, getPct());
              failedCheckCount++;
              failedTracksSet.add(task.id);
            } else {
              successCheckCount++;
            }
          }
        } catch (err) {
          logAndSend(`\u26A0\uFE0F \u6574\u5408\u6027\u78BA\u8A8D\u5931\u6557: ${relative} - ${err.message}`, getPct());
          failedCheckCount++;
          failedTracksSet.add(task.id);
        }
      }
    }
    if (failedCheckCount === 0) {
      logAndSend(`\u6574\u5408\u6027\u30C1\u30A7\u30C3\u30AF\u6210\u529F: \u5168\u3066\u306E\u540C\u671F\u5BFE\u8C61 (${successCheckCount}\u4EF6) \u304C\u6B63\u5E38\u306B\u78BA\u8A8D\u3055\u308C\u307E\u3057\u305F\u3002`, 100);
    } else {
      logAndSend(`\u26A0\uFE0F \u8B66\u544A: \u6574\u5408\u6027\u30C1\u30A7\u30C3\u30AF\u3092\u901A\u904E\u3067\u304D\u306A\u304B\u3063\u305F\u30D5\u30A1\u30A4\u30EB\u304C ${failedCheckCount} \u4EF6\u3042\u308A\u307E\u3059\u3002\u63A5\u7D9A\u306E\u5B89\u5B9A\u6027\u7B49\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002`, 100);
    }
    sendProgress("done", "\u540C\u671F\u5B8C\u4E86", 100, logs);
    return { failedTrackIds: Array.from(failedTracksSet) };
  } catch (e) {
    logs.push(`\u81F4\u547D\u7684\u306A\u30A8\u30E9\u30FC\u304C\u767A\u751F\u3057\u307E\u3057\u305F: ${e.message}`);
    sendProgress("error", "\u30A8\u30E9\u30FC\u7D42\u4E86", getPct(), logs);
    return { failedTrackIds: Array.from(failedTracksSet) };
  }
}

// src/main/ipc.ts
var store = new Store2();
function registerIpcHandlers() {
  protocol.handle("media", async (request) => {
    try {
      const url = new URL(request.url);
      const hexStr = url.pathname.slice(1);
      const decodedPath = Buffer.from(hexStr, "hex").toString("utf-8");
      if (!fs4.existsSync(decodedPath)) {
        console.error(`[media protocol] File not found on disk: "${decodedPath}"`);
        return new Response("Not Found", { status: 404 });
      }
      return await net.fetch(pathToFileURL(decodedPath).toString());
    } catch (e) {
      console.error("[media protocol] Failed to fetch media protocol file:", e);
      return new Response("Internal Server Error", { status: 500 });
    }
  });
  ipcMain.handle("show-item-in-folder", (_event, filePath) => {
    if (fs4.existsSync(filePath)) {
      shell.showItemInFolder(filePath);
      return true;
    }
    return false;
  });
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
      colorPhoneOnly: "#ef4444",
      delimiters: DEFAULT_DELIMITERS,
      exceptions: [],
      devMode: false
    });
  });
  ipcMain.handle("save-settings", (_event, settings) => {
    store.set("settings", settings);
  });
  ipcMain.handle("reset-cache", async () => {
    const cachesDir2 = path5.join(app2.getPath("userData"), "caches");
    if (fs4.existsSync(cachesDir2)) {
      try {
        fs4.rmSync(cachesDir2, { recursive: true, force: true });
      } catch (e) {
        console.error("Failed to delete caches directory", e);
      }
    }
    fs4.mkdirSync(cachesDir2, { recursive: true });
    for (const key of Object.keys(lastScanResults)) {
      delete lastScanResults[key];
    }
  });
  ipcMain.on(
    "show-context-menu",
    (event, params) => {
      const menu = new Menu();
      const sendCommand = (command, arg) => {
        event.sender.send("context-menu-command", { command, arg });
      };
      if (params.trackId) {
        menu.append(
          new MenuItem({
            label: "\u30D7\u30EC\u30D3\u30E5\u30FC\u518D\u751F",
            click: () => sendCommand("play-track", params.trackId)
          })
        );
        menu.append(new MenuItem({ type: "separator" }));
      }
      if (params.artist) {
        if (params.artists && params.artists.length > 1) {
          const submenu = new Menu();
          const sortedArtists = [...params.artists].sort((a, b) => a.localeCompare(b, "ja"));
          sortedArtists.forEach((art) => {
            submenu.append(
              new MenuItem({
                label: `\u300C${art}\u300D\u306E\u66F2\u3092\u8868\u793A`,
                click: () => sendCommand("jump-artist", art)
              })
            );
          });
          menu.append(
            new MenuItem({
              label: `\u300C${params.artist}\u300D\u306E\u66F2\u3092\u8868\u793A`,
              submenu
            })
          );
        } else {
          menu.append(
            new MenuItem({
              label: `\u300C${params.artist}\u300D\u306E\u66F2\u3092\u8868\u793A`,
              click: () => sendCommand("jump-artist", params.artist)
            })
          );
        }
      }
      if (params.album) {
        menu.append(
          new MenuItem({
            label: `\u30A2\u30EB\u30D0\u30E0\u300C${params.album}\u300D\u306E\u66F2\u3092\u8868\u793A`,
            click: () => sendCommand("jump-album", params.album)
          })
        );
      }
      if (params.genre) {
        menu.append(
          new MenuItem({
            label: `\u30B8\u30E3\u30F3\u30EB\u300C${params.genre}\u300D\u306E\u66F2\u3092\u8868\u793A`,
            click: () => sendCommand("jump-genre", params.genre)
          })
        );
      }
      let hasSeparator = false;
      if (params.itunesFilePath && fs4.existsSync(params.itunesFilePath)) {
        if (!hasSeparator) {
          menu.append(new MenuItem({ type: "separator" }));
          hasSeparator = true;
        }
        menu.append(
          new MenuItem({
            label: "\u30A8\u30AF\u30B9\u30D7\u30ED\u30FC\u30E9\u30FC\u3067\u8868\u793A (iTunes)",
            click: () => {
              shell.showItemInFolder(params.itunesFilePath);
            }
          })
        );
      }
      if (params.phoneFilePath && fs4.existsSync(params.phoneFilePath)) {
        if (!hasSeparator) {
          menu.append(new MenuItem({ type: "separator" }));
          hasSeparator = true;
        }
        menu.append(
          new MenuItem({
            label: "\u30A8\u30AF\u30B9\u30D7\u30ED\u30FC\u30E9\u30FC\u3067\u8868\u793A (\u6BD4\u8F03\u5148)",
            click: () => {
              shell.showItemInFolder(params.phoneFilePath);
            }
          })
        );
      }
      const win = event.sender.getOwnerBrowserWindow();
      if (win) {
        menu.popup({ window: win });
      } else {
        menu.popup();
      }
    }
  );
  ipcMain.handle("select-folder", async () => {
    const result = await dialog2.showOpenDialog({
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
    return await runSync(profile, options, event);
  });
  ipcMain.handle("get-thumbnail", async (_event, profileId, albumName) => {
    try {
      if (!profileId || !albumName) return null;
      const albumHex = Buffer.from(albumName).toString("hex");
      const thumbnailsDir = path5.join(app2.getPath("userData"), "caches", "thumbnails", profileId);
      if (!fs4.existsSync(thumbnailsDir)) {
        fs4.mkdirSync(thumbnailsDir, { recursive: true });
      }
      const pngPath = path5.join(thumbnailsDir, `${albumHex}.png`);
      const metaPath = path5.join(thumbnailsDir, `${albumHex}.meta.json`);
      const results = lastScanResults[profileId] || [];
      const trackItem = results.find((t) => {
        const meta = t.itunesTrack || t.phoneTrack;
        return meta && meta.album === albumName && meta.hasCoverArt;
      });
      if (!trackItem) {
        return null;
      }
      const track = trackItem.itunesTrack || trackItem.phoneTrack;
      if (!track) return null;
      let needRegenerate = true;
      if (fs4.existsSync(pngPath) && fs4.existsSync(metaPath)) {
        try {
          const meta = JSON.parse(fs4.readFileSync(metaPath, "utf-8"));
          if (meta.size === track.coverArtSize) {
            needRegenerate = false;
          }
        } catch (e) {
        }
      }
      if (needRegenerate) {
        const { parseFile: parseFile2 } = await import("music-metadata");
        const { nativeImage } = await import("electron");
        if (!fs4.existsSync(track.filePath)) {
          return null;
        }
        const metadata = await parseFile2(track.filePath, { skipCovers: false });
        const picture = metadata.common.picture && metadata.common.picture[0];
        if (!picture) {
          return null;
        }
        const img = nativeImage.createFromBuffer(Buffer.from(picture.data));
        const resized = img.resize({ width: 150, height: 150, quality: "better" });
        const pngBuf = resized.toPNG();
        fs4.writeFileSync(pngPath, Buffer.from(pngBuf));
        fs4.writeFileSync(metaPath, JSON.stringify({ size: track.coverArtSize }), "utf-8");
      }
      const cachedBuf = fs4.readFileSync(pngPath);
      return `data:image/png;base64,${cachedBuf.toString("base64")}`;
    } catch (e) {
      console.error("Failed to get or generate thumbnail", e);
      return null;
    }
  });
}

// src/main.ts
protocol2.registerSchemesAsPrivileged([
  {
    scheme: "media",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      bypassCSP: true,
      stream: true
    }
  }
]);
app3.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();
});
//# sourceMappingURL=main.js.map
