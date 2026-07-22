import { CODE, TYPE } from "./constants";
import { MtpCode, MtpContainer, ParsedContainer, UsbConfig } from "./types";
import { is_electron, is_node } from "./utils";

let usb: any = null;

export default class Mtp extends EventTarget {
	public state: string;
	public transactionID: number;
	public device: any; // w3c-webusbのUSBDevice型への互換性を保つためany許容
	private usbConfig: UsbConfig | null = null; // デバイスオブジェクトの汚染を防ぐためのプロパティ

	constructor(vendorId: number, productId: number, device?: any) {
		super();
		this.state = "open";
		this.transactionID = 0;
		this.device = device || null;

		// 元コード通りの非同期初期化処理（IIFE）
		(async () => {
			if (is_node && is_electron) {
				// Node.js環境用
				const { webusb } = await import("usb");
				usb = webusb;
			} else {
				usb = (navigator as any).usb; // WebUSB環境用
			}

			if (this.device == null) {
				const devices = await usb.getDevices();
				for (const device of devices) {
					if (device.productId === productId && device.vendorId === vendorId) {
						this.device = device;
					}
				}
			}

			if (this.device == null) {
				this.device = await usb.requestDevice({
					filters: [
						{
							vendorId,
							productId,
						},
					],
				});
			}

			if (this.device != null) {
				if (this.device.opened) {
					console.log("Already open");
					await this.device.close();
				}
				await this.device.open();
				console.log("Opened:", this.device.opened);

				//console.log(JSON.stringify(this.device.configuration, null, 4));

				await this.device.selectConfiguration(1);

				const iface = this.device.configuration.interfaces[0];
				try {
					await this.device.claimInterface(iface.interfaceNumber);
				} catch (claimErr: any) {
					// Check for "failed to open device (error 5)" or busy/access denied errors
					console.warn(`Initial claimInterface failed: ${claimErr.message}. Attempting device reset to reclaim...`);
					try {
						await this.device.reset();
						console.log("Device reset completed. Re-opening device and reclaiming interface...");
						await this.device.open();
						await this.device.selectConfiguration(1);
						await this.device.claimInterface(iface.interfaceNumber);
						console.log("Successfully reclaimed interface after device reset.");
					} catch (resetErr: any) {
						console.error("Reclaiming interface failed after device reset:", resetErr);
						throw claimErr; // Throw original claim interface error if reset reclamation failed
					}
				}

				const epOut = iface.alternate.endpoints.find((ep: any) => ep.direction === "out");
				const epIn = iface.alternate.endpoints.find((ep: any) => ep.direction === "in");

				this.usbConfig = {
					interface: iface,
					outEPnum: epOut.endpointNumber,
					inEPnum: epIn.endpointNumber,
					outPacketSize: epOut.packetSize || 1024,
					inPacketSize: epIn.packetSize || 1024,
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
				} catch (e) {}
				try {
					await this.device.close();
				} catch (e) {}
			}
			this.dispatchEvent(new Event("error"));
		});
	}

	private getName(list: Record<string, MtpCode>, idx: number): string {
		for (const key in list) {
			if (list[key].value === idx) {
				return list[key].name;
			}
		}
		return "unknown";
	}

	private buildContainerPacket(container: MtpContainer): ArrayBuffer {
		// payload parameters are always 4 bytes in length
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

	private parseContainerPacket(bytes: DataView, length: number): ParsedContainer {
		const fields: ParsedContainer = {
			type: TYPE[bytes.getUint16(4, true)] || "unknown",
			code: this.getName(CODE, bytes.getUint16(6, true)),
			transactionID: bytes.getUint32(8, true),
			payload: bytes.buffer.slice(12) as ArrayBuffer,
			parameters: [],
		};

		for (let i = 12; i < length; i += 4) {
			if (i <= length - 4) {
				fields.parameters.push(bytes.getUint32(i, true));
			}
		}

		console.log(fields);
		return fields;
	}

	async read(): Promise<ParsedContainer | any> {
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
		} catch (error: any) {
			// 修正: indexOf の判定ロジックの不具合解消のため、includesを使用
			if (error instanceof Error && error.message.includes("LIBUSB_TRANSFER_NO_DEVICE")) {
				console.log("Device disconnected");
			} else {
				console.log("Error reading data:", error);
				throw error;
			}
		}
	}

	async readData(): Promise<ParsedContainer> {
		let type: string | null = null;
		let result: any = null;

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

	async write(buffer: ArrayBuffer): Promise<any> {
		if (!this.usbConfig) throw new Error("USB configuration is missing");
		return await this.device.transferOut(this.usbConfig.outEPnum, buffer);
	}

	async close(): Promise<void> {
		try {
			console.log("Closing session..");
			const closeSession: MtpContainer = {
				type: 1, // command block
				code: CODE.CLOSE_SESSION.value,
				payload: [1], // session ID
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

	async openSession(): Promise<void> {
		console.log("Opening session..");
		const openSession: MtpContainer = {
			type: 1, // command block
			code: CODE.OPEN_SESSION.value,
			payload: [1], // session ID
		};
		const data = this.buildContainerPacket(openSession);
		const result = await this.write(data);
		console.log("Result:", result);
		console.log(await this.read());
	}

	async getObjectHandles(): Promise<number[]> {
		console.log("Getting object handles..");
		const getObjectHandles: MtpContainer = {
			type: 1, // command block
			code: CODE.GET_OBJECT_HANDLES.value,
			payload: [0xffffffff, 0, 0xffffffff], // get all
		};

		// 修正: buildContainerPacket は第2引数を取らないため削除
		await this.write(this.buildContainerPacket(getObjectHandles));
		const data = await this.readData();

		data.parameters.shift(); // Remove length element

		data.parameters.forEach((element: number) => {
			console.log("Object handle", element);
		});

		return data.parameters;
	}

	async getFileName(objectHandle: number): Promise<string> {
		console.log("Getting file name with object handle", objectHandle);
		const getFilename: MtpContainer = {
			type: 1,
			code: CODE.GET_OBJECT_PROP_VALUE.value,
			payload: [objectHandle, CODE.OBJECT_FILE_NAME.value], // objectHandle and objectPropCode
		};
		await this.write(this.buildContainerPacket(getFilename));
		const data = await this.readData();

		const array = new Uint8Array(data.payload);
		const decoder = new TextDecoder("utf-16le");
		const filename = decoder.decode(array.subarray(1, array.byteLength - 2));
		console.log("Filename:", filename);
		return filename;
	}

	async getFile(objectHandle: number, filename: string): Promise<Uint8Array> {
		console.log(`Getting file with object handle ${objectHandle} as ${filename}`);
		const getFile: MtpContainer = {
			type: 1,
			code: CODE.GET_OBJECT.value,
			payload: [objectHandle],
		};
		await this.write(this.buildContainerPacket(getFile));
		const data = await this.readData();

		return new Uint8Array(data.payload);
	}
}
