import { Profile, ScanResultItem, Settings } from "./types";

export const PHONE_DISPLAY_LABEL = "比較先";

export const CONFIG = {
	MAX_SEARCH_ROWS: 15,
};

// App Core State
export const state = {
	profiles: [] as Profile[],
	currentProfileId: null as string | null,
	currentSettings: {} as Settings,
	activeTab: "artist" as "artist" | "album" | "genre" | "track",
	searchQuery: "",

	// Scanned results
	scannedTracks: [] as ScanResultItem[],
	filteredTracks: [] as ScanResultItem[],
	activeStatusFilters: new Set<string>(["missing", "updated", "synced", "phone_only", "path_warning"]),
	sortRules: [
		{ field: "artist", direction: "asc" },
		{ field: "album", direction: "asc" },
		{ field: "track", direction: "asc" },
	] as { field: string; direction: "asc" | "desc" }[],

	// Selection sets
	checkedCopyTrackIds: new Set<string>(), // missing & updated
	checkedMoveTrackIds: new Set<string>(), // mismatch path
	checkedDeleteTrackIds: new Set<string>(), // phone_only, synced, updated (unchecked from main list)
	checkedDeleteItunesTrackIds: new Set<string>(), // synced, updated (explicitly checked for deletion in modal)

	// Accordion states
	expandedGroups: new Set<string>(),
};

// Undo/Redo Selection History Stacks
interface HistoryState {
	checkedCopy: Set<string>;
	checkedMove: Set<string>;
	checkedDelete: Set<string>;
	checkedDeleteItunes: Set<string>;
}

const historyUndo: HistoryState[] = [];
const historyRedo: HistoryState[] = [];
const maxHistorySize = 50;

export function pushHistoryState() {
	if (historyUndo.length >= maxHistorySize) {
		historyUndo.shift();
	}
	historyUndo.push({
		checkedCopy: new Set(state.checkedCopyTrackIds),
		checkedMove: new Set(state.checkedMoveTrackIds),
		checkedDelete: new Set(state.checkedDeleteTrackIds),
		checkedDeleteItunes: new Set(state.checkedDeleteItunesTrackIds),
	});
	historyRedo.length = 0; // Clear redo stack on new action
}

export function handleUndo(renderCallback: () => void) {
	if (historyUndo.length === 0) return;
	const current = {
		checkedCopy: new Set(state.checkedCopyTrackIds),
		checkedMove: new Set(state.checkedMoveTrackIds),
		checkedDelete: new Set(state.checkedDeleteTrackIds),
		checkedDeleteItunes: new Set(state.checkedDeleteItunesTrackIds),
	};
	historyRedo.push(current);

	const prev = historyUndo.pop()!;
	state.checkedCopyTrackIds = prev.checkedCopy;
	state.checkedMoveTrackIds = prev.checkedMove;
	state.checkedDeleteTrackIds = prev.checkedDelete;
	state.checkedDeleteItunesTrackIds = prev.checkedDeleteItunes;

	renderCallback();
}

export function handleRedo(renderCallback: () => void) {
	if (historyRedo.length === 0) return;
	const current = {
		checkedCopy: new Set(state.checkedCopyTrackIds),
		checkedMove: new Set(state.checkedMoveTrackIds),
		checkedDelete: new Set(state.checkedDeleteTrackIds),
		checkedDeleteItunes: new Set(state.checkedDeleteItunesTrackIds),
	};
	historyUndo.push(current);

	const next = historyRedo.pop()!;
	state.checkedCopyTrackIds = next.checkedCopy;
	state.checkedMoveTrackIds = next.checkedMove;
	state.checkedDeleteTrackIds = next.checkedDelete;
	state.checkedDeleteItunesTrackIds = next.checkedDeleteItunes;

	renderCallback();
}

export function clearHistory() {
	historyUndo.length = 0;
	historyRedo.length = 0;
}
