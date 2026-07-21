import isElectron from "is-electron";

export const is_electron = isElectron();
export const is_node = globalThis.process?.versions?.node != null;

// 元のコードで定義されていたヘルパー関数
export const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
