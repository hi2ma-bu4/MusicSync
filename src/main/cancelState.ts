export let activeScanCancelled = false;
export let activeSyncCancelled = false;
export let currentProcessingRelativePath: string | null = null;
export let currentStorageWrapper: any = null;

export function resetScanCancelled() {
	activeScanCancelled = false;
}

export function setScanCancelled(val: boolean) {
	activeScanCancelled = val;
}

export function resetSyncCancelled() {
	activeSyncCancelled = false;
}

export function setSyncCancelled(val: boolean) {
	activeSyncCancelled = val;
}

export function setProcessingRelativePath(p: string | null, storage: any = null) {
	currentProcessingRelativePath = p;
	currentStorageWrapper = storage;
}
