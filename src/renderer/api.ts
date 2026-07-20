import { WindowAPI } from "./types";

export type { WindowAPI };

// ============================================================================
// 【デバッグ用フォールバック処理 / DEV DEBUGGING FALLBACK】
// ※本番のElectron動作時は window.api が存在するため、以下のモックは実行されません。
// ※This mock is strictly for local browser / Playwright web development and testing.
// ============================================================================
if (!window.api) {
	console.warn("window.api is not defined. Initializing mock API for web development/testing.");
	(window as any).api = {
		__isMock: true,
		showItemInFolder: async (filePath: string) => {
			console.log("Mock showItemInFolder:", filePath);
			return true;
		},
		selectFolder: async () => {
			return "/mock/selected/path";
		},
		getProfiles: async () => {
			const data = localStorage.getItem("mock_profiles");
			return data ? JSON.parse(data) : [];
		},
		saveProfile: async (profile: any) => {
			const data = localStorage.getItem("mock_profiles");
			const profiles = data ? JSON.parse(data) : [];
			const idx = profiles.findIndex((p: any) => p.id === profile.id);
			if (idx > -1) profiles[idx] = profile;
			else profiles.push(profile);
			localStorage.setItem("mock_profiles", JSON.stringify(profiles));
			return profiles;
		},
		deleteProfile: async (id: string) => {
			const data = localStorage.getItem("mock_profiles");
			let profiles = data ? JSON.parse(data) : [];
			profiles = profiles.filter((p: any) => p.id !== id);
			localStorage.setItem("mock_profiles", JSON.stringify(profiles));
			return profiles;
		},
		getSettings: async () => {
			const data = localStorage.getItem("mock_settings");
			return data
				? JSON.parse(data)
				: {
						colorMissing: "#22c55e",
						colorUpdated: "#f59e0b",
						colorSynced: "#94a3b8",
						colorPhoneOnly: "#ef4444",
						delimiters: [",", "|", "feat.", ";", "、", "／"],
						exceptions: [],
					};
		},
		saveSettings: async (settings: any) => {
			localStorage.setItem("mock_settings", JSON.stringify(settings));
		},
		resetCache: async () => {
			console.log("Mock resetCache");
		},
		showContextMenu: (params: any) => {
			console.log("Mock showContextMenu:", params);
		},
		onContextMenuCommand: (callback: any) => {
			return () => {};
		},
		startScan: async (_profileId: string) => {
			console.log("Mock scan started");
		},
		getScanResult: async (_profileId: string) => {
			return [
				{
					id: "mock_1",
					status: "missing",
					pathMismatch: false,
					itunesTrack: {
						title: "Dynamite",
						artist: "BTS",
						album: "BE",
						track: "1",
						genre: "K-Pop",
						disc: "1",
					},
				},
				{
					id: "mock_1_disc2",
					status: "missing",
					pathMismatch: false,
					itunesTrack: {
						title: "Life Goes On",
						artist: "BTS",
						album: "BE",
						track: "1",
						genre: "K-Pop",
						disc: "2",
					},
				},
				{
					id: "mock_2",
					status: "updated",
					pathMismatch: true,
					itunesTrack: {
						title: "Stay",
						artist: "The Kid LAROI & Justin Bieber",
						album: "F*CK LOVE 3: OVER YOU",
						track: "1",
						genre: "Pop",
						relativePath: "Pop/Stay.mp3",
					},
					phoneTrack: {
						title: "Stay",
						artist: "The Kid LAROI",
						album: "Stay - Single",
						track: "1",
						genre: "Pop",
						relativePath: "Stay.mp3",
					},
				},
				{
					id: "mock_3",
					status: "synced",
					pathMismatch: false,
					itunesTrack: {
						title: "Blinding Lights",
						artist: "The Weeknd",
						album: "After Hours",
						track: "3",
						genre: "R&B",
						relativePath: "R&B/The Weeknd/After Hours/03 Blinding Lights.mp3",
					},
					phoneTrack: {
						title: "Blinding Lights",
						artist: "The Weeknd",
						album: "After Hours",
						track: "3",
						genre: "R&B",
						relativePath: "R&B/The Weeknd/After Hours/03 Blinding Lights.mp3",
					},
				},
				{
					id: "mock_4",
					status: "phone_only",
					pathMismatch: false,
					phoneTrack: {
						title: "Old Town Road",
						artist: "Lil Nas X",
						album: "7 EP",
						track: "1",
						genre: "Country",
						relativePath: "Lil Nas X/Old Town Road.mp3",
					},
				},
			];
		},
		executeSync: async (_profileId: string, _options: any) => {
			console.log("Mock executeSync");
		},
		getThumbnail: async (_profileId: string, _albumName: string) => {
			// デバッグ用フォールバック処理 (サムネイル画像モック)
			return null;
		},
		onScanProgress: (callback: any) => {
			setTimeout(() => callback({ step: "itunes_list", message: "iTunesフォルダを検索中...", progress: 10 }), 100);
			setTimeout(() => callback({ step: "itunes_parse", message: "iTunesの曲情報を解析中...", progress: 40 }), 300);
			setTimeout(() => callback({ step: "phone_list", message: "スマホフォルダを検索中...", progress: 60 }), 500);
			setTimeout(() => callback({ step: "comparing", message: "曲情報の差分を比較中...", progress: 90 }), 700);
			setTimeout(() => callback({ step: "done", message: "比較完了", progress: 100 }), 900);
			return () => {};
		},
		onSyncProgress: (callback: any) => {
			setTimeout(() => callback({ status: "running", message: "コピー中...", progress: 50, logs: ["コピー成功: Dynamite.mp3"] }), 200);
			setTimeout(() => callback({ status: "done", message: "同期完了", progress: 100, logs: ["コピー成功: Dynamite.mp3", "同期完了"] }), 500);
			return () => {};
		},
	};
}

export const api = window.api;
export const isMock = (window.api as any).__isMock === true;
