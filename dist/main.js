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
            await this.device.selectConfiguration(1);
            const iface = this.device.configuration.interfaces[0];
            try {
              await this.device.claimInterface(iface.interfaceNumber);
            } catch (claimErr) {
              console.warn(`Initial claimInterface failed: ${claimErr.message}. Attempting device reset to reclaim...`);
              try {
                await this.device.reset();
                console.log("Device reset completed. Re-opening device and reclaiming interface...");
                await this.device.open();
                await this.device.selectConfiguration(1);
                await this.device.claimInterface(iface.interfaceNumber);
                console.log("Successfully reclaimed interface after device reset.");
              } catch (resetErr) {
                console.error("Reclaiming interface failed after device reset:", resetErr);
                throw claimErr;
              }
            }
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
        })().catch(async (error) => {
          console.log("Error during MTP setup:", error);
          if (this.device) {
            try {
              const ifaceNumber = this.usbConfig?.interface?.interfaceNumber ?? 0;
              await this.device.releaseInterface(ifaceNumber);
            } catch (e) {
            }
            try {
              await this.device.close();
            } catch (e) {
            }
          }
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
          try {
            await this.write(this.buildContainerPacket(closeSession));
          } catch (e) {
            console.log("Error closing MTP session:", e);
          }
          const ifaceNumber = this.usbConfig?.interface?.interfaceNumber ?? 0;
          try {
            await this.device.releaseInterface(ifaceNumber);
          } catch (e) {
            console.log("Error releasing interface:", e);
          }
          try {
            await this.device.close();
          } catch (e) {
            console.log("Error closing device:", e);
          }
          console.log("Closed device");
        } catch (err) {
          console.log("Error during close:", err);
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
import path3 from "node:path";

// src/main/storageWrapper.ts
import { dialog } from "electron";
import fs2 from "node:fs";
import os from "node:os";
import path2 from "node:path";

// src/main/utils.ts
import { parseFile } from "music-metadata";
import fs from "node:fs";
import path from "node:path";
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
    const resPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      const subFiles = await findMusicFiles(resPath, baseDir);
      results.push(...subFiles);
    } else {
      const ext = path.extname(item.name).toLowerCase();
      if (validExtensions.has(ext)) {
        const relativePath = path.relative(baseDir, resPath).replace(/\\/g, "/");
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
    const title = metadata.common.title || path.basename(filePath, path.extname(filePath));
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
      title: path.basename(filePath, path.extname(filePath)),
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
var activeMtpWrappers = /* @__PURE__ */ new Set();
var MtpUserCancelledError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "MtpUserCancelledError";
  }
};
async function closeAllActiveMtpWrappers() {
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
async function promptDeviceSelection(currentVendorId, currentProductId, profileId) {
  try {
    const usb2 = (await import("usb")).default;
    if (!usb2 || !usb2.usb || typeof usb2.usb.getDevices !== "function") {
      return null;
    }
    const devices = await usb2.usb.getDevices();
    const currentDevice = devices.find((d) => d.vendorId === currentVendorId && d.productId === currentProductId);
    if (currentDevice) {
      const mName = currentDevice.manufacturerName || "";
      const pName = currentDevice.productName || "";
      const displayName = mName || pName ? `${mName} ${pName}`.trim() : `MTP Device (VID: 0x${currentVendorId.toString(16).padStart(4, "0")}, PID: 0x${currentProductId.toString(16).padStart(4, "0")})`;
      const choice2 = dialog.showMessageBoxSync({
        type: "question",
        buttons: ["\u518D\u8A66\u884C (Retry)", "\u30AD\u30E3\u30F3\u30BB\u30EB (Cancel)"],
        title: "MTP\u30C7\u30D0\u30A4\u30B9\u306E\u63A5\u7D9A\u518D\u8A66\u884C",
        message: `\u30C7\u30D0\u30A4\u30B9\u300C${displayName}\u300D\u3078\u306E\u63A5\u7D9A\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002\u518D\u63A5\u7D9A\u3057\u307E\u3059\u304B\uFF1F`,
        cancelId: 1
      });
      if (choice2 === 0) {
        return { vendorId: currentVendorId, productId: currentProductId };
      } else {
        console.log("[promptDeviceSelection] User selected Cancel in retry dialog.");
        return null;
      }
    }
    const list = [];
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
        console.warn("[StorageWrapper] Error scanning single USB device:", e);
      }
    }
    if (list.length === 0) {
      dialog.showMessageBoxSync({
        type: "warning",
        buttons: ["\u4E86\u89E3"],
        title: "\u30C7\u30D0\u30A4\u30B9\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093",
        message: "\u63A5\u7D9A\u53EF\u80FD\u306AUSB\u30C7\u30D0\u30A4\u30B9\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3067\u3057\u305F\u3002\u63A5\u7D9A\u72B6\u6CC1\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002"
      });
      return null;
    }
    const buttons = list.map((d) => d.name).concat(["\u30AD\u30E3\u30F3\u30BB\u30EB"]);
    const choice = dialog.showMessageBoxSync({
      type: "question",
      buttons,
      title: "MTP\u30C7\u30D0\u30A4\u30B9\u306E\u9078\u629E",
      message: "\u63A5\u7D9A\u3059\u308BMTP\u30C7\u30D0\u30A4\u30B9\u3092\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044\uFF1A",
      cancelId: buttons.length - 1
    });
    if (choice >= 0 && choice < list.length) {
      const selected = list[choice];
      if (profileId) {
        const Store3 = (await import("electron-store")).default;
        const store2 = new Store3();
        const profiles = store2.get("profiles", []);
        const index = profiles.findIndex((p) => p.id === profileId);
        if (index > -1) {
          profiles[index].usbVendorId = selected.vendorId;
          profiles[index].usbProductId = selected.productId;
          const subPath = profiles[index].mtpSubPath || "Music";
          profiles[index].phonePath = `mtp://${selected.vendorId}/${selected.productId}/${subPath}`;
          store2.set("profiles", profiles);
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
    const targetPath = path2.join(this.phonePath, relativePath);
    return fs2.existsSync(targetPath);
  }
  async findMusicFiles(onProgress) {
    return findMusicFiles(this.phonePath, this.phonePath);
  }
  async getTrackMetadata(filePath, relativePath) {
    return getTrackMetadata(filePath, relativePath);
  }
  async copyFileFromLocal(localSrc, remoteDestRelativePath) {
    const targetPath = path2.join(this.phonePath, remoteDestRelativePath);
    const targetDir = path2.dirname(targetPath);
    await fs2.promises.mkdir(targetDir, { recursive: true });
    await copyFileWithRetry(localSrc, targetPath);
  }
  async moveFile(oldRelativePath, newRelativePath) {
    const oldPath = path2.join(this.phonePath, oldRelativePath);
    const newPath = path2.join(this.phonePath, newRelativePath);
    const targetDir = path2.dirname(newPath);
    await fs2.promises.mkdir(targetDir, { recursive: true });
    await moveFileWithRetry(oldPath, newPath);
  }
  async deleteFile(relativePath) {
    const targetPath = path2.join(this.phonePath, relativePath);
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
            const sub = path2.join(dir, item.name);
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
  async findMusicFiles(onProgress) {
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
      title: path2.basename(relativePath, path2.extname(relativePath)),
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
          title: path2.basename(remoteDestRelativePath, path2.extname(remoteDestRelativePath))
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
  profileId;
  // Dynamic, adaptive delay parameters
  currentDelayMs = 20;
  minDelayMs = 5;
  maxDelayMs = 200;
  constructor(vendorId, productId, subPath, profileId) {
    this.vendorId = vendorId;
    this.productId = productId;
    this.subPath = subPath || "Music";
    this.profileId = profileId;
    activeMtpWrappers.add(this);
  }
  async disconnect() {
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
  async connectMtp(attemptReconnect = false) {
    if (attemptReconnect) {
      await this.disconnect();
    }
    if (this.mtpInstance) return this.mtpInstance;
    let vId = this.vendorId;
    let pId = this.productId;
    const connectWithSpecificDevice = async (v, p) => {
      const MtpClass = (await Promise.resolve().then(() => (init_Mtp(), Mtp_exports))).default;
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
        const onError = (err) => {
          reject(new Error(`MTP connection error: ${err?.message || "Unknown error"}`));
        };
        mtp.addEventListener("ready", onReady);
        mtp.addEventListener("error", onError);
        setTimeout(() => {
          reject(new Error("MTP connection timed out."));
        }, 1e4);
      });
    };
    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        return await connectWithSpecificDevice(vId, pId);
      } catch (e) {
        lastError = e;
        console.warn(`[StorageWrapper] Connection attempt ${attempt}/3 failed: ${e.message}`);
        if (attempt < 3) {
          await new Promise((r) => setTimeout(r, 1e3));
        }
      }
    }
    console.error(`[StorageWrapper] All 3 automatic connection attempts failed. Prompting user...`);
    const selected = await promptDeviceSelection(vId, pId, this.profileId);
    if (selected) {
      this.vendorId = selected.vendorId;
      this.productId = selected.productId;
      try {
        return await connectWithSpecificDevice(selected.vendorId, selected.productId);
      } catch (e) {
        throw new MtpUserCancelledError(`MTP\u63A5\u7D9A\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002\u518D\u8A66\u884C\u30A8\u30E9\u30FC: ${e.message}`);
      }
    } else {
      throw new MtpUserCancelledError(`MTP\u63A5\u7D9A\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002\u30E6\u30FC\u30B6\u30FC\u306B\u3088\u308A\u9078\u629E\u307E\u305F\u306F\u518D\u8A66\u884C\u304C\u30AD\u30E3\u30F3\u30BB\u30EB\u3055\u308C\u307E\u3057\u305F\u3002`);
    }
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
  async applyAdaptiveDelay(success) {
    if (success) {
      this.currentDelayMs = Math.max(this.minDelayMs, this.currentDelayMs - 2);
    } else {
      this.currentDelayMs = Math.min(this.maxDelayMs, this.currentDelayMs + 30);
    }
    if (this.currentDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.currentDelayMs));
    }
  }
  async findMusicFiles(onProgress) {
    const mtp = await this.connectMtp();
    const handles = await mtp.getObjectHandles();
    this.deviceObjectHandles = handles;
    const results = [];
    this.fileMap.clear();
    const validExtensions = /* @__PURE__ */ new Set([".mp3", ".m4a", ".aac", ".flac", ".wav", ".ogg", ".wma"]);
    let failureCount = 0;
    let lastFailedIndex = -1;
    for (let i = 0; i < handles.length; i++) {
      const handle = handles[i];
      let success = false;
      let attempts = 0;
      if (onProgress && i % 50 === 0) {
        onProgress(`\u6BD4\u8F03\u5148\u30D5\u30A1\u30A4\u30EB\u3092\u30B9\u30AD\u30E3\u30F3\u4E2D... (${i}/${handles.length})`);
      }
      while (!success && attempts < 3) {
        attempts++;
        try {
          if (this.currentDelayMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, this.currentDelayMs));
          }
          const fileName = await mtp.getFileName(handle);
          const ext = path2.extname(fileName).toLowerCase();
          if (validExtensions.has(ext)) {
            const relativePath = path2.join(this.subPath, fileName).replace(/\\/g, "/");
            this.fileMap.set(relativePath, handle);
            results.push({
              filePath: `mtp://${this.vendorId}/${this.productId}/${handle}`,
              relativePath,
              size: 1e6,
              // Default fallback size
              mtimeMs: Date.now()
              // Default fallback mtime
            });
          }
          success = true;
          await this.applyAdaptiveDelay(true);
          if (lastFailedIndex !== i) {
            failureCount = 0;
          }
        } catch (e) {
          if (e instanceof MtpUserCancelledError) {
            throw e;
          }
          console.warn(`[findMusicFiles] Error for object handle ${handle} (attempt ${attempts}): ${e.message}`);
          await this.applyAdaptiveDelay(false);
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
          throw new Error(`\u9023\u7D9A\u3057\u30663\u500B\u306E\u30D5\u30A1\u30A4\u30EB\u306E\u8AAD\u307F\u8FBC\u307F\u306B\u5931\u6557\u3057\u305F\u305F\u3081\u3001\u51E6\u7406\u3092\u4E2D\u65AD\u3057\u307E\u3059\u3002\u63A5\u7D9A\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002`);
        }
      }
    }
    return results;
  }
  async runWithRetryAndReconnect(operation) {
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
      } catch (e) {
        if (e instanceof MtpUserCancelledError) {
          throw e;
        }
        console.error(`[MtpStorageWrapper] Operation failed on attempt ${attempts}/3: ${e.message}`);
        await this.applyAdaptiveDelay(false);
        if (attempts === 3) {
          await this.disconnect();
          throw e;
        }
        await this.disconnect();
      }
    }
    throw new Error("MTP operation failed after retries.");
  }
  async getTrackMetadata(filePath, relativePath) {
    const handle = this.fileMap.get(relativePath);
    if (handle === void 0) {
      throw new Error(`File not found on MTP device: ${relativePath}`);
    }
    return this.runWithRetryAndReconnect(async (mtp) => {
      const fileName = await mtp.getFileName(handle);
      const tempDir = path2.join(os.tmpdir(), "musicsync-mtp-temp");
      if (!fs2.existsSync(tempDir)) {
        fs2.mkdirSync(tempDir, { recursive: true });
      }
      const tempFilePath = path2.join(tempDir, `${handle}_${fileName}`);
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
            console.error("[StorageWrapper] Failed to clean up temp file:", e);
          }
        }
      }
    });
  }
  async copyFileFromLocal(localSrc, remoteDestRelativePath) {
    const fileData = await fs2.promises.readFile(localSrc);
    const fileName = path2.basename(remoteDestRelativePath);
    await this.runWithRetryAndReconnect(async (mtp) => {
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
    });
  }
  async moveFile(oldRelativePath, newRelativePath) {
    const handle = this.fileMap.get(oldRelativePath);
    if (handle === void 0) return;
    const fileData = await this.runWithRetryAndReconnect(async (mtp) => {
      const fileName2 = await mtp.getFileName(handle);
      return await mtp.getFile(handle, fileName2);
    });
    const fileName = path2.basename(newRelativePath);
    await this.runWithRetryAndReconnect(async (mtp) => {
      if (typeof mtp.sendFile === "function") {
        await mtp.sendFile(fileData, fileName);
      } else {
        console.log(`Writing moved file ${fileName} to MTP device via bulk transfer packets...`);
        const sendObjectCmd = {
          type: 1,
          code: 4109,
          payload: []
        };
        const container = mtp.buildContainerPacket(sendObjectCmd);
        await mtp.write(container);
        await mtp.write(fileData.buffer);
        const response = await mtp.read();
        console.log("SendObject (moved) MTP response:", response);
      }
    });
    await this.deleteFile(oldRelativePath);
  }
  async deleteFile(relativePath) {
    const handle = this.fileMap.get(relativePath);
    if (handle === void 0) return;
    await this.runWithRetryAndReconnect(async (mtp) => {
      const deleteObjectCmd = {
        type: 1,
        code: 4107,
        // DeleteObject
        payload: [handle]
      };
      await mtp.write(mtp.buildContainerPacket(deleteObjectCmd));
      const response = await mtp.read();
      console.log("DeleteObject response:", response);
    });
    this.fileMap.delete(relativePath);
  }
  async cleanEmptyDirs() {
  }
};
async function runPowerShellWithParams(scriptText, params, onProgressLine) {
  if (process.platform !== "win32") {
    return "[]";
  }
  const base64Params = Buffer.from(JSON.stringify(params), "utf8").toString("base64");
  const fullScript = `
		[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
		$paramsJsonBytes = [System.Convert]::FromBase64String("${base64Params}")
		$paramsJson = [System.Text.Encoding]::UTF8.GetString($paramsJsonBytes)
		$params = $paramsJson | ConvertFrom-Json
		
		$phoneName = $params.deviceName
		$subPath = $params.subPath
		$localSrc = $params.localSrc
		$remoteDestRelativePath = $params.remoteDestRelativePath
		$relativePath = $params.relativePath
		$oldRelativePath = $params.oldRelativePath
		$newRelativePath = $params.newRelativePath
		$tempFilePath = $params.tempFilePath

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

		${scriptText}
	`;
  return runPowerShellCommand(fullScript, onProgressLine);
}
async function runPowerShellCommand(scriptText, onProgressLine) {
  if (process.platform !== "win32") {
    return "[]";
  }
  const { spawn } = await import("node:child_process");
  return new Promise((resolve, reject) => {
    const buffer = Buffer.from(scriptText, "utf16le");
    const base64 = buffer.toString("base64");
    const child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", base64]);
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
var PowerShellMtpStorageWrapper = class {
  deviceName;
  subPath;
  fileMap = /* @__PURE__ */ new Map();
  constructor(deviceName, subPath) {
    this.deviceName = deviceName || "Mock Device";
    this.subPath = subPath || "Music";
  }
  getRelPathInsideSub(p) {
    const normalized = p.replace(/\\/g, "/");
    const prefix = this.subPath + "/";
    if (normalized.startsWith(prefix)) {
      return normalized.substring(prefix.length);
    }
    return normalized;
  }
  async isConnected() {
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
  async exists(relativePath) {
    if (this.fileMap.size === 0) {
      await this.findMusicFiles();
    }
    const rel = this.getRelPathInsideSub(relativePath);
    const fullRel = `${this.subPath}/${rel}`.replace(/\\/g, "/");
    return this.fileMap.has(fullRel);
  }
  async findMusicFiles(onProgress) {
    if (process.platform !== "win32") {
      throw new Error("PowerShell MTP is only supported on Windows.");
    }
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
								Write-Output "PROGRESS_UPDATE:\u6BD4\u8F03\u5148\u30D5\u30A1\u30A4\u30EB\u3092\u30B9\u30AD\u30E3\u30F3\u4E2D... (\${global:scannedCount}\u66F2)"
							}
							# Retrieve size and modification date using GetDetailsOf as direct properties are empty/0
							$sizeStr = $folder.GetDetailsOf($item, 2)
							$size = 0
							if ($sizeStr -and $sizeStr -match '([\\d\\.,\\s]+)\\s*(KB|MB|GB|B|\u30D0\u30A4\u30C8)?') {
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
      const progressHandler = (line) => {
        const trimmed = line.trim();
        if (trimmed.startsWith("PROGRESS_UPDATE:") && onProgress) {
          onProgress(trimmed.substring("PROGRESS_UPDATE:".length));
        }
      };
      const rawStdout = await runPowerShellWithParams(script, { deviceName: this.deviceName, subPath: this.subPath }, progressHandler);
      let jsonPart = "[]";
      const startIndex = rawStdout.indexOf("JSON_RESULTS_START");
      const endIndex = rawStdout.indexOf("JSON_RESULTS_END");
      if (startIndex !== -1 && endIndex !== -1) {
        jsonPart = rawStdout.substring(startIndex + "JSON_RESULTS_START".length, endIndex).trim();
      } else {
        jsonPart = rawStdout.trim();
      }
      const parsed = JSON.parse(jsonPart || "[]");
      let rawList = [];
      if (Array.isArray(parsed)) {
        rawList = parsed;
      } else if (parsed && parsed.value !== void 0 && Array.isArray(parsed.value)) {
        rawList = parsed.value;
      } else if (parsed && typeof parsed === "object" && Object.keys(parsed).length > 0) {
        if (parsed.relativePath !== void 0) {
          rawList = [parsed];
        }
      }
      this.fileMap.clear();
      const results = [];
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
          mtimeMs
        });
      }
      return results;
    } catch (e) {
      console.error("[PowerShellMtp] findMusicFiles error:", e);
      throw e;
    }
  }
  async getTrackMetadata(filePath, relativePath) {
    if (process.platform !== "win32") {
      throw new Error("PowerShell MTP is only supported on Windows.");
    }
    const randSuffix = Math.random().toString(36).substring(2, 10);
    const trackTempDir = path2.join(os.tmpdir(), "musicsync-mtp-temp", randSuffix);
    if (!fs2.existsSync(trackTempDir)) {
      fs2.mkdirSync(trackTempDir, { recursive: true });
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
        tempFilePath: trackTempDir
      });
      if (res.trim() !== "SUCCESS") {
        throw new Error(`Failed to download file from MTP for metadata parsing: ${relativePath}`);
      }
      const filesInTemp = await fs2.promises.readdir(trackTempDir);
      if (filesInTemp.length === 0) {
        throw new Error(`Temp folder is empty. File was not downloaded: ${relativePath}`);
      }
      const downloadedFileName = filesInTemp[0];
      const actualDownloadedFilePath = path2.join(trackTempDir, downloadedFileName);
      const meta = await getTrackMetadata(actualDownloadedFilePath, relativePath);
      meta.filePath = filePath;
      return meta;
    } finally {
      if (fs2.existsSync(trackTempDir)) {
        try {
          const files = await fs2.promises.readdir(trackTempDir);
          for (const file of files) {
            await fs2.promises.unlink(path2.join(trackTempDir, file));
          }
          await fs2.promises.rmdir(trackTempDir);
        } catch (e) {
          console.error("[PowerShellMtp] Failed to delete trackTempDir:", e);
        }
      }
    }
  }
  async copyFileFromLocal(localSrc, remoteDestRelativePath) {
    if (process.platform !== "win32") {
      throw new Error("PowerShell MTP is only supported on Windows.");
    }
    const relPathInsideSub = this.getRelPathInsideSub(remoteDestRelativePath);
    const relativeDestDir = path2.dirname(relPathInsideSub).replace(/\\/g, "/");
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
      localSrc,
      relativePath: destDirInSub
    });
    if (res.trim() !== "SUCCESS") {
      throw new Error(`Failed to copy file to MTP device: ${remoteDestRelativePath}`);
    }
  }
  async moveFile(oldRelativePath, newRelativePath) {
    if (process.platform !== "win32") {
      throw new Error("PowerShell MTP is only supported on Windows.");
    }
    const oldRelPathInsideSub = this.getRelPathInsideSub(oldRelativePath);
    const newRelPathInsideSub = this.getRelPathInsideSub(newRelativePath);
    const newRelDirInsideSub = path2.dirname(newRelPathInsideSub).replace(/\\/g, "/");
    const newFileName = path2.basename(newRelPathInsideSub);
    const oldFileName = path2.basename(oldRelPathInsideSub);
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
      tempFilePath: newRelDirInsideSub
    });
    if (res.trim() !== "SUCCESS") {
      throw new Error(`Failed to move file: ${oldRelativePath} -> ${newRelativePath}`);
    }
  }
  async deleteFile(relativePath) {
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
      relativePath: relPathInsideSub
    });
    this.fileMap.delete(relativePath);
  }
  async cleanEmptyDirs() {
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
      subPath: this.subPath
    });
  }
};
function getStorageWrapper(profile) {
  if (!profile) {
    throw new Error("No active profile provided");
  }
  const storageType = profile.storageType || "local";
  if (storageType === "mtp_powershell") {
    console.log(`[StorageWrapper] Initializing PowerShell MTP Wrapper for Device: ${profile.mtpDeviceName}, Subpath: ${profile.mtpSubPath}...`);
    return new PowerShellMtpStorageWrapper(profile.mtpDeviceName || "Mock Device", profile.mtpSubPath || "Music");
  }
  if (storageType === "mtp") {
    if (profile.id.startsWith("mock") || profile.phonePath === "mock_mtp" || profile.usbVendorId === 0 && profile.usbProductId === 0) {
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

// src/main/index.ts
function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path3.join(process.cwd(), "dist", "preload.js"),
      contextIsolation: true
    }
  });
  const store2 = new Store();
  win.on("close", () => {
    console.log("[Window] Window is closing. Cleaning up MTP wrappers...");
    closeAllActiveMtpWrappers().catch((err) => {
      console.error("[Window] Error during MTP wrapper close cleanup:", err);
    });
  });
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
  win.loadFile(path3.join(process.cwd(), "dist", "index.html"));
}

// src/main/ipc.ts
import { app as app2, dialog as dialog3, ipcMain, Menu, MenuItem, net, protocol, shell } from "electron";
import Store2 from "electron-store";
import fs5 from "node:fs";
import path6 from "node:path";
import { pathToFileURL } from "node:url";

// src/shared/constants.ts
var DEFAULT_DELIMITERS = [",", "|", "feat.", ";", "\u3001", "\uFF0F"];

// src/main/scanner.ts
import { app, dialog as dialog2 } from "electron";
import fs3 from "node:fs";
import path4 from "node:path";
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
        const choice = dialog2.showMessageBoxSync({
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
      dialog2.showMessageBoxSync({
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
  const phoneFiles = await storage.findMusicFiles((msg) => {
    sendProgress("phone_list", msg, 15);
  });
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
      const pathMismatch = profile.storageType === "mtp" || profile.storageType === "mtp_powershell" ? false : I.relativePath !== bestMatch.relativePath;
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
              } else if (profile.storageType === "mtp_powershell") {
                item.phoneTrack.filePath = `mtp_powershell://${encodeURIComponent(profile.mtpDeviceName)}/${newRelative}`;
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
            } else if (profile.storageType === "mtp_powershell") {
              remotePath = `mtp_powershell://${encodeURIComponent(profile.mtpDeviceName)}/${relative}`;
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
    const result = await dialog3.showOpenDialog({
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
  ipcMain.handle("get-mtp-device-names", async () => {
    if (process.platform !== "win32") {
      return [];
    }
    try {
      const { execFile } = await import("node:child_process");
      const scriptText = `
				[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
				$shell = New-Object -ComObject Shell.Application
				$drives = $shell.NameSpace(17)
				if ($drives) {
					$names = $drives.Items() | Where-Object { $_.Path -notmatch '^[A-Z]:\\\\$' } | ForEach-Object { [string]$_.Name }
					if ($names) {
						,@($names) | ConvertTo-Json -Compress
					} else {
						"[]"
					}
				} else {
					"[]"
				}
			`;
      const buffer = Buffer.from(scriptText, "utf16le");
      const base64 = buffer.toString("base64");
      return new Promise((resolve) => {
        execFile("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", base64], { maxBuffer: 10 * 1024 * 1024, encoding: "utf8" }, (error, stdout, stderr) => {
          if (error) {
            console.error("[get-mtp-device-names] Error:", stderr || error.message);
            resolve([]);
          } else {
            try {
              const res = stdout.trim();
              if (!res || res === "[]") {
                resolve([]);
              } else {
                const parsed = JSON.parse(res);
                const list = Array.isArray(parsed) ? parsed : [parsed];
                const names = list.map((item) => {
                  if (typeof item === "string") {
                    return item;
                  }
                  if (item && typeof item === "object") {
                    return item.Name || item.name || item.value || JSON.stringify(item);
                  }
                  return String(item);
                });
                resolve(names);
              }
            } catch (e) {
              console.error("[get-mtp-device-names] Parse error:", e);
              resolve([]);
            }
          }
        });
      });
    } catch (e) {
      console.error("[get-mtp-device-names] Unexpected error:", e);
      return [];
    }
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
app3.on("before-quit", (event) => {
  console.log("[App] before-quit triggered. Cleaning up MTP wrappers...");
  event.preventDefault();
  closeAllActiveMtpWrappers().catch((err) => {
    console.error("[App] Error cleaning up MTP wrappers on exit:", err);
  }).finally(() => {
    app3.exit();
  });
});
app3.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();
});
//# sourceMappingURL=main.js.map
