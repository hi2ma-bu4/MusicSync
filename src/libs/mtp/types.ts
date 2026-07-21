export interface UsbConfig {
	interface: any;
	outEPnum: number;
	inEPnum: number;
	outPacketSize: number;
	inPacketSize: number;
}

export interface MtpContainer {
	type: number;
	code: number;
	payload: number[];
}

export interface ParsedContainer {
	type: string;
	code: string;
	transactionID: number;
	payload: ArrayBuffer;
	parameters: number[];
	status?: string; // エラー時のフォールバック(babble検証等)用
}

export interface MtpCode {
	value: number;
	name: string;
}
