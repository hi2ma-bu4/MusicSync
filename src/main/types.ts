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
}

export interface ScanResultItem {
	id: string;
	itunesTrack?: TrackMetadata;
	phoneTrack?: TrackMetadata;
	status: "missing" | "updated" | "synced" | "phone_only";
	pathMismatch: boolean;
}

export interface SyncOptions {
	copyTrackIds: string[];
	moveTrackIds: string[];
	deleteTrackIds: string[];
}
