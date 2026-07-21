import { MtpCode } from "./types";

export const TYPE: readonly string[] = ["undefined", "Command Block", "Data Block", "Response Block", "Event Block"];

export const CODE: Record<string, MtpCode> = {
	OPEN_SESSION: { value: 0x1002, name: "OpenSession" },
	CLOSE_SESSION: { value: 0x1003, name: "CloseSession" },
	GET_OBJECT_HANDLES: { value: 0x1007, name: "GetObjectHandles" },
	GET_OBJECT: { value: 0x1009, name: "GetObject" },
	OK: { value: 0x2001, name: "OK" },
	INVALID_PARAMETER: { value: 0x201d, name: "Invalid parameter" },
	INVALID_OBJECTPROP_FORMAT: { value: 0xa802, name: "Invalid_ObjectProp_Format" },
	OBJECT_FILE_NAME: { value: 0xdc07, name: "Object file name" },
	GET_OBJECT_PROP_VALUE: { value: 0x9803, name: "GetObjectPropValue" },
};
