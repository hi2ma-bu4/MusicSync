export interface Profile {
	id: string;
	name: string;
	itunesPath: string;
	phonePath: string;
	searchHistory?: string[];
}

export interface Settings {
	colorMissing: string;
	colorUpdated: string;
	colorSynced: string;
	colorPhoneOnly: string;
	delimiters?: string[];
	exceptions?: string[];
}

export interface TrackMetadata {
	id: string;
	filePath: string;
	relativePath: string;
	title: string;
	artist: string;
	album: string;
	track: string;
	genre: string;
	size: number;
	mtimeMs: number;
	hasCoverArt: boolean;
	coverArtSize: number;
	disc?: string;
	albumartist?: string;
	composer?: string;
	year?: string;
	comment?: string;
}

export interface ScanResultItem {
	id: string;
	status: "missing" | "updated" | "synced" | "phone_only";
	pathMismatch: boolean;
	itunesTrack?: TrackMetadata;
	phoneTrack?: TrackMetadata;
}

export interface SyncOptions {
	copyTrackIds: string[];
	moveTrackIds: string[];
	deleteTrackIds: string[];
}

export interface ProgressPayload {
	step?: string;
	status?: "running" | "done" | "error";
	message: string;
	progress: number;
	logs?: string[];
}

export interface WindowAPI {
	showItemInFolder: (filePath: string) => Promise<boolean>;
	selectFolder: () => Promise<string | null>;
	getProfiles: () => Promise<Profile[]>;
	saveProfile: (profile: Profile) => Promise<Profile[]>;
	deleteProfile: (id: string) => Promise<Profile[]>;
	getSettings: () => Promise<Settings>;
	saveSettings: (settings: Settings) => Promise<void>;
	resetCache: () => Promise<void>;
	showContextMenu: (params: any) => void;
	onContextMenuCommand: (callback: (command: string, arg: string) => void) => () => void;
	startScan: (profileId: string) => Promise<void>;
	getScanResult: (profileId: string) => Promise<ScanResultItem[]>;
	executeSync: (profileId: string, options: SyncOptions) => Promise<void>;
	getThumbnail: (profileId: string, albumName: string) => Promise<string | null>;
	onScanProgress: (callback: (progress: ProgressPayload) => void) => () => void;
	onSyncProgress: (callback: (progress: ProgressPayload) => void) => () => void;
}

declare global {
	interface Window {
		api: WindowAPI;
	}
}
