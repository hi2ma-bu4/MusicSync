var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/libs/mtp/constants.ts
var TYPE, CODE;
var init_constants = __esm({
  "src/libs/mtp/constants.ts"() {
    "use strict";
    TYPE = ["undefined", "Command Block", "Data Block", "Response Block", "Event Block"];
    CODE = {
      OPEN_SESSION: { value: 4098, name: "OpenSession" },
      CLOSE_SESSION: { value: 4099, name: "CloseSession" },
      GET_OBJECT_HANDLES: { value: 4103, name: "GetObjectHandles" },
      GET_OBJECT: { value: 4105, name: "GetObject" },
      OK: { value: 8193, name: "OK" },
      INVALID_PARAMETER: { value: 8221, name: "Invalid parameter" },
      INVALID_OBJECTPROP_FORMAT: { value: 43010, name: "Invalid_ObjectProp_Format" },
      OBJECT_FILE_NAME: { value: 56327, name: "Object file name" },
      GET_OBJECT_PROP_VALUE: { value: 38915, name: "GetObjectPropValue" }
    };
  }
});

// node_modules/is-electron/index.js
function isElectron() {
  if (typeof window !== "undefined" && typeof window.process === "object" && window.process.type === "renderer") {
    return true;
  }
  if (typeof process !== "undefined" && typeof process.versions === "object" && !!process.versions.electron) {
    return true;
  }
  if (typeof navigator === "object" && typeof navigator.userAgent === "string" && navigator.userAgent.indexOf("Electron") >= 0) {
    return true;
  }
  return false;
}
var exports, module, is_electron_default;
var init_is_electron = __esm({
  "node_modules/is-electron/index.js"() {
    exports = {};
    module = {
      get exports() {
        return exports;
      },
      set exports(value) {
        exports = value;
      }
    };
    module.exports = isElectron;
    is_electron_default = module.exports;
  }
});

// src/libs/mtp/utils.ts
var is_electron, is_node;
var init_utils = __esm({
  "src/libs/mtp/utils.ts"() {
    "use strict";
    init_is_electron();
    is_electron = is_electron_default();
    is_node = globalThis.process?.versions?.node != null;
  }
});

// src/libs/mtp/Mtp.ts
var Mtp_exports = {};
__export(Mtp_exports, {
  default: () => Mtp
});
var usb, Mtp;
var init_Mtp = __esm({
  "src/libs/mtp/Mtp.ts"() {
    "use strict";
    init_constants();
    init_utils();
    usb = null;
    Mtp = class extends EventTarget {
      state;
      transactionID;
      device;
      // w3c-webusbのUSBDevice型への互換性を保つためany許容
      usbConfig = null;
      // デバイスオブジェクトの汚染を防ぐためのプロパティ
      constructor(vendorId, productId, device) {
        super();
        this.state = "open";
        this.transactionID = 0;
        this.device = device || null;
        (async () => {
          if (is_node && is_electron) {
            const { webusb } = await import("usb");
            usb = webusb;
          } else {
            usb = navigator.usb;
          }
          if (this.device == null) {
            const devices = await usb.getDevices();
            for (const device2 of devices) {
              if (device2.productId === productId && device2.vendorId === vendorId) {
                this.device = device2;
              }
            }
          }
          if (this.device == null) {
            this.device = await usb.requestDevice({
              filters: [
                {
                  vendorId,
                  productId
                }
              ]
            });
          }
          if (this.device != null) {
            if (this.device.opened) {
              console.log("Already open");
              await this.device.close();
            }
            await this.device.open();
            console.log("Opened:", this.device.opened);
            console.log(JSON.stringify(this.device.configuration, null, 4));
            await this.device.selectConfiguration(1);
            const iface = this.device.configuration.interfaces[0];
            await this.device.claimInterface(iface.interfaceNumber);
            const epOut = iface.alternate.endpoints.find((ep) => ep.direction === "out");
            const epIn = iface.alternate.endpoints.find((ep) => ep.direction === "in");
            this.usbConfig = {
              interface: iface,
              outEPnum: epOut.endpointNumber,
              inEPnum: epIn.endpointNumber,
              outPacketSize: epOut.packetSize || 1024,
              inPacketSize: epIn.packetSize || 1024
            };
            this.dispatchEvent(new Event("ready"));
          } else {
            throw new Error("No device available.");
          }
        })().catch((error) => {
          console.log("Error during MTP setup:", error);
          this.dispatchEvent(new Event("error"));
        });
      }
      getName(list, idx) {
        for (const key in list) {
          if (list[key].value === idx) {
            return list[key].name;
          }
        }
        return "unknown";
      }
      buildContainerPacket(container) {
        const packetLength = 12 + container.payload.length * 4;
        const buf = new ArrayBuffer(packetLength);
        const bytes = new DataView(buf);
        bytes.setUint32(0, packetLength, true);
        bytes.setUint16(4, container.type, true);
        bytes.setUint16(6, container.code, true);
        bytes.setUint32(8, this.transactionID, true);
        container.payload.forEach((element, index) => {
          bytes.setUint32(12 + index * 4, element, true);
        });
        this.transactionID += 1;
        console.log("Sending", buf);
        return buf;
      }
      parseContainerPacket(bytes, length) {
        const fields = {
          type: TYPE[bytes.getUint16(4, true)] || "unknown",
          code: this.getName(CODE, bytes.getUint16(6, true)),
          transactionID: bytes.getUint32(8, true),
          payload: bytes.buffer.slice(12),
          parameters: []
        };
        for (let i = 12; i < length; i += 4) {
          if (i <= length - 4) {
            fields.parameters.push(bytes.getUint32(i, true));
          }
        }
        console.log(fields);
        return fields;
      }
      async read() {
        if (!this.usbConfig) throw new Error("USB configuration is missing");
        try {
          let result = await this.device.transferIn(this.usbConfig.inEPnum, this.usbConfig.inPacketSize);
          if (result && result.data && result.data.byteLength && result.data.byteLength > 0) {
            let raw = new Uint8Array(result.data.buffer);
            const bytes = new DataView(result.data.buffer);
            const containerLength = bytes.getUint32(0, true);
            console.log("Container Length:", containerLength);
            console.log("Length:", raw.byteLength);
            while (raw.byteLength !== containerLength) {
              result = await this.device.transferIn(this.usbConfig.inEPnum, this.usbConfig.inPacketSize);
              console.log(`Adding ${result.data.byteLength} bytes`);
              const uint8array = raw.slice();
              raw = new Uint8Array(uint8array.byteLength + result.data.byteLength);
              raw.set(uint8array);
              raw.set(new Uint8Array(result.data.buffer), uint8array.byteLength);
            }
            return this.parseContainerPacket(new DataView(raw.buffer), containerLength);
          }
          return result;
        } catch (error) {
          if (error instanceof Error && error.message.includes("LIBUSB_TRANSFER_NO_DEVICE")) {
            console.log("Device disconnected");
          } else {
            console.log("Error reading data:", error);
            throw error;
          }
        }
      }
      async readData() {
        let type = null;
        let result = null;
        while (type !== "Data Block") {
          result = await this.read();
          if (result) {
            if (result.status === "babble") {
              result = await this.read();
            }
            type = result.type;
          } else {
            throw new Error("No data returned");
          }
        }
        return result;
      }
      async write(buffer) {
        if (!this.usbConfig) throw new Error("USB configuration is missing");
        return await this.device.transferOut(this.usbConfig.outEPnum, buffer);
      }
      async close() {
        try {
          console.log("Closing session..");
          const closeSession = {
            type: 1,
            // command block
            code: CODE.CLOSE_SESSION.value,
            payload: [1]
            // session ID
          };
          await this.write(this.buildContainerPacket(closeSession));
          await this.device.releaseInterface(0);
          await this.device.close();
          console.log("Closed device");
        } catch (err) {
          console.log("Error:", err);
        }
      }
      async openSession() {
        console.log("Opening session..");
        const openSession = {
          type: 1,
          // command block
          code: CODE.OPEN_SESSION.value,
          payload: [1]
          // session ID
        };
        const data = this.buildContainerPacket(openSession);
        const result = await this.write(data);
        console.log("Result:", result);
        console.log(await this.read());
      }
      async getObjectHandles() {
        console.log("Getting object handles..");
        const getObjectHandles = {
          type: 1,
          // command block
          code: CODE.GET_OBJECT_HANDLES.value,
          payload: [4294967295, 0, 4294967295]
          // get all
        };
        await this.write(this.buildContainerPacket(getObjectHandles));
        const data = await this.readData();
        data.parameters.shift();
        data.parameters.forEach((element) => {
          console.log("Object handle", element);
        });
        return data.parameters;
      }
      async getFileName(objectHandle) {
        console.log("Getting file name with object handle", objectHandle);
        const getFilename = {
          type: 1,
          code: CODE.GET_OBJECT_PROP_VALUE.value,
          payload: [objectHandle, CODE.OBJECT_FILE_NAME.value]
          // objectHandle and objectPropCode
        };
        await this.write(this.buildContainerPacket(getFilename));
        const data = await this.readData();
        const array = new Uint8Array(data.payload);
        const decoder = new TextDecoder("utf-16le");
        const filename = decoder.decode(array.subarray(1, array.byteLength - 2));
        console.log("Filename:", filename);
        return filename;
      }
      async getFile(objectHandle, filename) {
        console.log(`Getting file with object handle ${objectHandle} as ${filename}`);
        const getFile = {
          type: 1,
          code: CODE.GET_OBJECT.value,
          payload: [objectHandle]
        };
        await this.write(this.buildContainerPacket(getFile));
        const data = await this.readData();
        return new Uint8Array(data.payload);
      }
    };
  }
});

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
import fs5 from "node:fs";
import path6 from "node:path";
import { pathToFileURL } from "node:url";

// src/shared/constants.ts
var DEFAULT_DELIMITERS = [",", "|", "feat.", ";", "\u3001", "\uFF0F"];

// src/main/scanner.ts
import { app, dialog } from "electron";
import fs3 from "node:fs";
import path4 from "node:path";

// src/main/storageWrapper.ts
import fs2 from "node:fs";
import os from "node:os";
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

// src/main/storageWrapper.ts
async function copyFileWithRetry(source, target, retries = 3, delayMs = 1e3) {
  for (let i = 0; i < retries; i++) {
    try {
      await fs2.promises.copyFile(source, target);
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
        await fs2.promises.rename(source, target);
      } catch (e) {
        console.warn(`Rename failed, falling back to copy/unlink: ${source} -> ${target}`, e);
        await fs2.promises.copyFile(source, target);
        await fs2.promises.unlink(source);
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
var LocalStorageWrapper = class {
  phonePath;
  constructor(phonePath) {
    this.phonePath = phonePath;
  }
  async isConnected() {
    return fs2.existsSync(this.phonePath);
  }
  async exists(relativePath) {
    const targetPath = path3.join(this.phonePath, relativePath);
    return fs2.existsSync(targetPath);
  }
  async findMusicFiles() {
    return findMusicFiles(this.phonePath, this.phonePath);
  }
  async getTrackMetadata(filePath, relativePath) {
    return getTrackMetadata(filePath, relativePath);
  }
  async copyFileFromLocal(localSrc, remoteDestRelativePath) {
    const targetPath = path3.join(this.phonePath, remoteDestRelativePath);
    const targetDir = path3.dirname(targetPath);
    await fs2.promises.mkdir(targetDir, { recursive: true });
    await copyFileWithRetry(localSrc, targetPath);
  }
  async moveFile(oldRelativePath, newRelativePath) {
    const oldPath = path3.join(this.phonePath, oldRelativePath);
    const newPath = path3.join(this.phonePath, newRelativePath);
    const targetDir = path3.dirname(newPath);
    await fs2.promises.mkdir(targetDir, { recursive: true });
    await moveFileWithRetry(oldPath, newPath);
  }
  async deleteFile(relativePath) {
    const targetPath = path3.join(this.phonePath, relativePath);
    if (fs2.existsSync(targetPath)) {
      await fs2.promises.unlink(targetPath);
    }
  }
  async cleanEmptyDirs() {
    const clean = async (dir) => {
      try {
        const list = await fs2.promises.readdir(dir, { withFileTypes: true });
        for (const item of list) {
          if (item.isDirectory()) {
            const sub = path3.join(dir, item.name);
            await clean(sub);
          }
        }
        if (dir !== this.phonePath) {
          const files = await fs2.promises.readdir(dir);
          if (files.length === 0) {
            await fs2.promises.rmdir(dir);
          }
        }
      } catch (e) {
        console.warn(`Failed to clean empty directory recursively in ${dir}:`, e);
      }
    };
    await clean(this.phonePath);
  }
};
var MockMtpStorageWrapper = class {
  mockFiles = /* @__PURE__ */ new Map();
  subPath;
  constructor(subPath) {
    this.subPath = subPath || "Music";
    this.mockFiles.set(`${this.subPath}/The Weeknd/After Hours/03 Blinding Lights.mp3`, {
      size: 45e5,
      mtimeMs: Date.now() - 36e5,
      metadata: {
        title: "Blinding Lights",
        artist: "The Weeknd",
        album: "After Hours",
        track: "3",
        genre: "R&B",
        disc: "1",
        hasCoverArt: true,
        coverArtSize: 5e4
      }
    });
    this.mockFiles.set(`${this.subPath}/Lil Nas X/Old Town Road.mp3`, {
      size: 3e6,
      mtimeMs: Date.now() - 72e5,
      metadata: {
        title: "Old Town Road",
        artist: "Lil Nas X",
        album: "7 EP",
        track: "1",
        genre: "Country",
        disc: "1",
        hasCoverArt: false,
        coverArtSize: 0
      }
    });
  }
  async isConnected() {
    return true;
  }
  async exists(relativePath) {
    return this.mockFiles.has(relativePath);
  }
  async findMusicFiles() {
    const results = [];
    for (const [key, val] of this.mockFiles.entries()) {
      results.push({
        filePath: `mock_mtp://${key}`,
        relativePath: key,
        size: val.size,
        mtimeMs: val.mtimeMs
      });
    }
    return results;
  }
  async getTrackMetadata(filePath, relativePath) {
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
        comment: file.metadata.comment || ""
      };
    }
    return {
      id: `phone_${relativePath}`,
      filePath,
      relativePath,
      title: path3.basename(relativePath, path3.extname(relativePath)),
      artist: "Unknown Artist",
      album: "Unknown Album",
      track: "",
      genre: "Unknown Genre",
      size: 0,
      mtimeMs: Date.now(),
      hasCoverArt: false,
      coverArtSize: 0
    };
  }
  async copyFileFromLocal(localSrc, remoteDestRelativePath) {
    try {
      const meta = await getTrackMetadata(localSrc, remoteDestRelativePath);
      const stats = await fs2.promises.stat(localSrc);
      this.mockFiles.set(remoteDestRelativePath, {
        size: stats.size,
        mtimeMs: stats.mtimeMs,
        metadata: meta
      });
    } catch (e) {
      this.mockFiles.set(remoteDestRelativePath, {
        size: 1e5,
        mtimeMs: Date.now(),
        metadata: {
          title: path3.basename(remoteDestRelativePath, path3.extname(remoteDestRelativePath))
        }
      });
    }
  }
  async moveFile(oldRelativePath, newRelativePath) {
    const file = this.mockFiles.get(oldRelativePath);
    if (file) {
      this.mockFiles.delete(oldRelativePath);
      this.mockFiles.set(newRelativePath, file);
    }
  }
  async deleteFile(relativePath) {
    this.mockFiles.delete(relativePath);
  }
  async cleanEmptyDirs() {
  }
};
var MtpStorageWrapper = class {
  vendorId;
  productId;
  subPath;
  mtpInstance = null;
  deviceObjectHandles = [];
  fileMap = /* @__PURE__ */ new Map();
  // relativePath -> objectHandle
  constructor(vendorId, productId, subPath) {
    this.vendorId = vendorId;
    this.productId = productId;
    this.subPath = subPath || "Music";
  }
  async connectMtp() {
    if (this.mtpInstance) return this.mtpInstance;
    const MtpClass = (await Promise.resolve().then(() => (init_Mtp(), Mtp_exports))).default;
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
      const onError = (err) => {
        reject(new Error(`MTP connection error: ${err?.message || "Unknown error"}`));
      };
      mtp.addEventListener("ready", onReady);
      mtp.addEventListener("error", onError);
      setTimeout(() => {
        reject(new Error("MTP connection timed out."));
      }, 1e4);
    });
  }
  async isConnected() {
    try {
      const mtp = await this.connectMtp();
      return !!mtp;
    } catch (e) {
      return false;
    }
  }
  async exists(relativePath) {
    await this.findMusicFiles();
    return this.fileMap.has(relativePath);
  }
  async findMusicFiles() {
    const mtp = await this.connectMtp();
    const handles = await mtp.getObjectHandles();
    this.deviceObjectHandles = handles;
    const results = [];
    this.fileMap.clear();
    const validExtensions = /* @__PURE__ */ new Set([".mp3", ".m4a", ".aac", ".flac", ".wav", ".ogg", ".wma"]);
    for (const handle of handles) {
      try {
        const fileName = await mtp.getFileName(handle);
        const ext = path3.extname(fileName).toLowerCase();
        if (validExtensions.has(ext)) {
          const relativePath = path3.join(this.subPath, fileName).replace(/\\/g, "/");
          this.fileMap.set(relativePath, handle);
          results.push({
            filePath: `mtp://${this.vendorId}/${this.productId}/${handle}`,
            relativePath,
            size: 1e6,
            // Default fallback size for remote files if query not supported
            mtimeMs: Date.now()
            // Default fallback mtime for remote files if query not supported
          });
        }
      } catch (e) {
        console.warn(`Failed to read file info for object handle ${handle}`, e);
      }
    }
    return results;
  }
  async getTrackMetadata(filePath, relativePath) {
    const handle = this.fileMap.get(relativePath);
    if (handle === void 0) {
      throw new Error(`File not found on MTP device: ${relativePath}`);
    }
    const mtp = await this.connectMtp();
    const fileName = await mtp.getFileName(handle);
    const tempDir = path3.join(os.tmpdir(), "musicsync-mtp-temp");
    if (!fs2.existsSync(tempDir)) {
      fs2.mkdirSync(tempDir, { recursive: true });
    }
    const tempFilePath = path3.join(tempDir, `${handle}_${fileName}`);
    try {
      const fileData = await mtp.getFile(handle, fileName);
      await fs2.promises.writeFile(tempFilePath, Buffer.from(fileData));
      const meta = await getTrackMetadata(tempFilePath, relativePath);
      meta.filePath = filePath;
      return meta;
    } finally {
      if (fs2.existsSync(tempFilePath)) {
        try {
          await fs2.promises.unlink(tempFilePath);
        } catch (e) {
        }
      }
    }
  }
  async copyFileFromLocal(localSrc, remoteDestRelativePath) {
    const mtp = await this.connectMtp();
    const fileData = await fs2.promises.readFile(localSrc);
    const fileName = path3.basename(remoteDestRelativePath);
    if (typeof mtp.sendFile === "function") {
      await mtp.sendFile(fileData, fileName);
    } else {
      console.log(`Writing file ${fileName} to MTP device via bulk transfer packets...`);
      const sendObjectCmd = {
        type: 1,
        // Command Block
        code: 4109,
        // SendObject
        payload: []
      };
      const container = mtp.buildContainerPacket(sendObjectCmd);
      await mtp.write(container);
      await mtp.write(fileData.buffer);
      const response = await mtp.read();
      console.log("SendObject MTP response:", response);
    }
  }
  async moveFile(oldRelativePath, newRelativePath) {
    const handle = this.fileMap.get(oldRelativePath);
    if (handle === void 0) return;
    const mtp = await this.connectMtp();
    const fileName = await mtp.getFileName(handle);
    const fileData = await mtp.getFile(handle, fileName);
    if (typeof mtp.sendFile === "function") {
      await mtp.sendFile(fileData, path3.basename(newRelativePath));
    } else {
      const sendObjectCmd = {
        type: 1,
        code: 4109,
        payload: []
      };
      await mtp.write(mtp.buildContainerPacket(sendObjectCmd));
      await mtp.write(fileData.buffer);
      await mtp.read();
    }
    await this.deleteFile(oldRelativePath);
  }
  async deleteFile(relativePath) {
    const handle = this.fileMap.get(relativePath);
    if (handle === void 0) return;
    const mtp = await this.connectMtp();
    const deleteObjectCmd = {
      type: 1,
      // Command Block
      code: 4107,
      // DeleteObject
      payload: [handle]
    };
    await mtp.write(mtp.buildContainerPacket(deleteObjectCmd));
    const response = await mtp.read();
    console.log("DeleteObject response:", response);
    this.fileMap.delete(relativePath);
  }
  async cleanEmptyDirs() {
  }
};
function getStorageWrapper(profile) {
  if (!profile) {
    throw new Error("No active profile provided");
  }
  const storageType = profile.storageType || "local";
  if (storageType === "mtp") {
    if (profile.id.startsWith("mock") || profile.phonePath === "mock_mtp" || profile.usbVendorId === 0 && profile.usbProductId === 0) {
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

// src/main/scanner.ts
var lastScanResults = {};
var cachesDir = path4.join(app.getPath("userData"), "caches");
if (!fs3.existsSync(cachesDir)) {
  fs3.mkdirSync(cachesDir, { recursive: true });
}
function getCachePath(profileId, suffix) {
  return path4.join(cachesDir, `${profileId}_${suffix}.json`);
}
function loadCache(profileId, suffix) {
  const cachePath = getCachePath(profileId, suffix);
  if (fs3.existsSync(cachePath)) {
    try {
      const cache = JSON.parse(fs3.readFileSync(cachePath, "utf-8"));
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
            fs3.unlinkSync(cachePath);
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
    fs3.writeFileSync(cachePath, JSON.stringify(cache), "utf-8");
  } catch (e) {
    console.error("Failed to save cache", e);
  }
}
async function runScan(profile, event) {
  const profileId = profile.id;
  const sendProgress = (step, message, progress, details) => {
    event.sender.send("scan-progress", { step, message, progress, ...details });
  };
  const storage = getStorageWrapper(profile);
  if (!await storage.isConnected()) {
    throw new Error(`\u6BD4\u8F03\u5148\u300C${profile.name}\u300D\u306B\u30A2\u30AF\u30BB\u30B9\u3067\u304D\u307E\u305B\u3093\u3002\u63A5\u7D9A\u72B6\u6CC1\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002`);
  }
  sendProgress("itunes_list", "iTunes\u30D5\u30A9\u30EB\u30C0\u5185\u306E\u30D5\u30A1\u30A4\u30EB\u3092\u691C\u7D22\u4E2D...", 5);
  const itunesFiles = await findMusicFiles(profile.itunesPath);
  sendProgress("phone_list", "\u6BD4\u8F03\u5148\u30D5\u30A9\u30EB\u30C0\u5185\u306E\u30D5\u30A1\u30A4\u30EB\u3092\u691C\u7D22\u4E2D...", 15);
  const phoneFiles = await storage.findMusicFiles();
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
      const stats = await fs3.promises.stat(file.filePath);
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
      let size = file.size;
      let mtimeMs = file.mtimeMs;
      if (size === void 0 || mtimeMs === void 0) {
        const stats = await fs3.promises.stat(file.filePath);
        size = stats.size;
        mtimeMs = stats.mtimeMs;
      }
      let meta = phoneCache[file.relativePath];
      if (meta && meta.mtimeMs === mtimeMs && meta.size === size) {
        newPhoneCache[file.relativePath] = meta;
      } else {
        const key = `${size}_${mtimeMs}`;
        const cachedMeta = phoneSecondaryIndex.get(key);
        if (cachedMeta) {
          meta = {
            ...cachedMeta,
            filePath: file.filePath,
            relativePath: file.relativePath
          };
          newPhoneCache[file.relativePath] = meta;
        } else {
          meta = await storage.getTrackMetadata(file.filePath, file.relativePath);
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
import fs4 from "node:fs";
import path5 from "node:path";
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
  const storage = getStorageWrapper(profile);
  try {
    if (!await storage.isConnected()) {
      throw new Error(`\u6BD4\u8F03\u5148\u300C${profile.name}\u300D\u306B\u30A2\u30AF\u30BB\u30B9\u3067\u304D\u307E\u305B\u3093\u3002\u63A5\u7D9A\u72B6\u6CC1\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002`);
    }
    if (deleteTrackIds.length > 0) {
      logAndSend(`\u6BD4\u8F03\u5148\u5074\u306E\u4F59\u5206\u306A\u66F2\u306E\u524A\u9664\u3092\u958B\u59CB\u3057\u307E\u3059... (\u5BFE\u8C61: ${deleteTrackIds.length}\u66F2)`, getPct());
      for (const id of deleteTrackIds) {
        if (!await storage.isConnected()) {
          throw new Error("\u51E6\u7406\u4E2D\u306B\u6BD4\u8F03\u5148\u3068\u306E\u63A5\u7D9A\u304C\u5207\u65AD\u3055\u308C\u307E\u3057\u305F\u3002");
        }
        const item = scanItems.find((x) => x.id === id);
        if (item && item.phoneTrack) {
          try {
            if (await storage.exists(item.phoneTrack.relativePath)) {
              await storage.deleteFile(item.phoneTrack.relativePath);
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
        if (!await storage.isConnected()) {
          throw new Error("\u51E6\u7406\u4E2D\u306B\u6BD4\u8F03\u5148\u3068\u306E\u63A5\u7D9A\u304C\u5207\u65AD\u3055\u308C\u307E\u3057\u305F\u3002");
        }
        const item = scanItems.find((x) => x.id === id);
        if (item && item.itunesTrack && item.phoneTrack) {
          const oldRelative = item.phoneTrack.relativePath;
          const newRelative = item.itunesTrack.relativePath;
          try {
            if (await storage.exists(oldRelative)) {
              await storage.moveFile(oldRelative, newRelative);
              logAndSend(`\u79FB\u52D5\u6210\u529F: ${oldRelative} -> ${newRelative}`, getPct());
              if (profile.storageType === "mtp") {
                item.phoneTrack.filePath = `mtp://${profile.usbVendorId}/${profile.usbProductId}/${newRelative}`;
              } else {
                item.phoneTrack.filePath = path5.join(profile.phonePath, newRelative);
              }
              item.phoneTrack.relativePath = newRelative;
              item.pathMismatch = false;
            } else {
              logAndSend(`\u8B66\u544A: \u79FB\u52D5\u5143\u30D5\u30A1\u30A4\u30EB\u304C\u5B58\u5728\u3057\u307E\u305B\u3093: ${oldRelative}`, getPct());
              failedTracksSet.add(id);
            }
          } catch (e) {
            console.error(`Failed to move file: ${oldRelative}`, e);
            logAndSend(`\u79FB\u52D5\u5931\u6557: ${oldRelative} - ${e.message} (\u30EA\u30AB\u30D0\u30EA\u30FC\u51E6\u7406\u306E\u305F\u3081\u30B9\u30AD\u30C3\u30D7\u3057\u307E\u3059)`, getPct());
            failedTracksSet.add(id);
          }
        }
        completed++;
      }
    }
    if (copyTrackIds.length > 0) {
      logAndSend(`iTunes\u304B\u3089\u6BD4\u8F03\u5148\u3078\u306E\u66F2\u306E\u30B3\u30D4\u30FC\u3092\u958B\u59CB\u3057\u307E\u3059... (\u5BFE\u8C61: ${copyTrackIds.length}\u66F2)`, getPct());
      for (const id of copyTrackIds) {
        if (!await storage.isConnected()) {
          throw new Error("\u51E6\u7406\u4E2D\u306B\u6BD4\u8F03\u5148\u3068\u306E\u63A5\u7D9A\u304C\u5207\u65AD\u3055\u308C\u307E\u3057\u305F\u3002");
        }
        const item = scanItems.find((x) => x.id === id);
        if (item && item.itunesTrack) {
          const sourcePath = item.itunesTrack.filePath;
          const relative = item.itunesTrack.relativePath;
          try {
            if (fs4.existsSync(sourcePath)) {
              await storage.copyFileFromLocal(sourcePath, relative);
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
    await storage.cleanEmptyDirs();
    logAndSend("\u7A7A\u30D5\u30A9\u30EB\u30C0\u306E\u30AF\u30EA\u30FC\u30F3\u30A2\u30C3\u30D7\u304C\u5B8C\u4E86\u3057\u307E\u3057\u305F\u3002", getPct());
    logAndSend("\u6700\u7D42\u6574\u5408\u6027\u30C1\u30A7\u30C3\u30AF\u3092\u5B9F\u884C\u4E2D...", getPct());
    let failedCheckCount = 0;
    let successCheckCount = 0;
    const verifyList = [...copyTrackIds.map((id) => ({ id, op: "\u30B3\u30D4\u30FC" })), ...moveTrackIds.map((id) => ({ id, op: "\u79FB\u52D5" }))];
    for (const task of verifyList) {
      const item = scanItems.find((x) => x.id === task.id);
      if (item && item.itunesTrack) {
        const relative = item.itunesTrack.relativePath;
        try {
          if (!await storage.exists(relative)) {
            logAndSend(`\u26A0\uFE0F \u6574\u5408\u6027\u30A8\u30E9\u30FC: \u6BD4\u8F03\u5148\u30D5\u30A1\u30A4\u30EB\u304C\u5B58\u5728\u3057\u307E\u305B\u3093: ${relative}`, getPct());
            failedCheckCount++;
            failedTracksSet.add(task.id);
          } else {
            const sourceStats = await fs4.promises.stat(item.itunesTrack.filePath);
            let remotePath = "";
            if (profile.storageType === "mtp") {
              remotePath = `mtp://${profile.usbVendorId}/${profile.usbProductId}/${relative}`;
            } else {
              remotePath = path5.join(profile.phonePath, relative);
            }
            const remoteMeta = await storage.getTrackMetadata(remotePath, relative);
            if (sourceStats.size !== remoteMeta.size) {
              logAndSend(`\u26A0\uFE0F \u6574\u5408\u6027\u30A8\u30E9\u30FC: \u30D5\u30A1\u30A4\u30EB\u30B5\u30A4\u30BA\u4E0D\u4E00\u81F4: ${relative} (\u30BD\u30FC\u30B9: ${sourceStats.size}B, \u6BD4\u8F03\u5148: ${remoteMeta.size}B)`, getPct());
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
      if (!fs5.existsSync(decodedPath)) {
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
    if (fs5.existsSync(filePath)) {
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
    const cachesDir2 = path6.join(app2.getPath("userData"), "caches");
    if (fs5.existsSync(cachesDir2)) {
      try {
        fs5.rmSync(cachesDir2, { recursive: true, force: true });
      } catch (e) {
        console.error("Failed to delete caches directory", e);
      }
    }
    fs5.mkdirSync(cachesDir2, { recursive: true });
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
      if (params.itunesFilePath && fs5.existsSync(params.itunesFilePath)) {
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
      if (params.phoneFilePath && fs5.existsSync(params.phoneFilePath)) {
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
  ipcMain.handle("get-usb-devices", async () => {
    const list = [];
    try {
      const usb2 = (await import("usb")).default;
      if (usb2 && usb2.usb) {
        if (typeof usb2.usb.getDevices === "function") {
          const devices = await usb2.usb.getDevices();
          for (const d of devices) {
            try {
              const mName = d.manufacturerName || "";
              const pName = d.productName || "";
              const displayName = mName || pName ? `${mName} ${pName}`.trim() : `USB Device (VID: 0x${d.vendorId.toString(16).padStart(4, "0")}, PID: 0x${d.productId.toString(16).padStart(4, "0")})`;
              list.push({
                vendorId: d.vendorId,
                productId: d.productId,
                name: displayName
              });
            } catch (e) {
              console.error("[get-usb-devices] Error processing USB device:", e);
            }
          }
        }
      }
    } catch (e) {
      console.error("[get-usb-devices] Error listing physical USB devices:", e);
    }
    return list;
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
      const thumbnailsDir = path6.join(app2.getPath("userData"), "caches", "thumbnails", profileId);
      if (!fs5.existsSync(thumbnailsDir)) {
        fs5.mkdirSync(thumbnailsDir, { recursive: true });
      }
      const pngPath = path6.join(thumbnailsDir, `${albumHex}.png`);
      const metaPath = path6.join(thumbnailsDir, `${albumHex}.meta.json`);
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
      if (fs5.existsSync(pngPath) && fs5.existsSync(metaPath)) {
        try {
          const meta = JSON.parse(fs5.readFileSync(metaPath, "utf-8"));
          if (meta.size === track.coverArtSize) {
            needRegenerate = false;
          }
        } catch (e) {
        }
      }
      if (needRegenerate) {
        const { parseFile: parseFile2 } = await import("music-metadata");
        const { nativeImage } = await import("electron");
        if (!fs5.existsSync(track.filePath)) {
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
        fs5.writeFileSync(pngPath, Buffer.from(pngBuf));
        fs5.writeFileSync(metaPath, JSON.stringify({ size: track.coverArtSize }), "utf-8");
      }
      const cachedBuf = fs5.readFileSync(pngPath);
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
