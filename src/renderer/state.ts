import { Profile, ScanResultItem, Settings } from "./types";

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

	// Selection sets
	checkedCopyTrackIds: new Set<string>(), // missing & updated
	checkedMoveTrackIds: new Set<string>(), // mismatch path
	checkedDeleteTrackIds: new Set<string>(), // phone_only

	// Accordion states
	expandedGroups: new Set<string>(),
};

// Undo/Redo Selection History Stacks
interface HistoryState {
	checkedCopy: Set<string>;
	checkedMove: Set<string>;
	checkedDelete: Set<string>;
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
	});
	historyRedo.length = 0; // Clear redo stack on new action
}

export function handleUndo(renderCallback: () => void) {
	if (historyUndo.length === 0) return;
	const current = {
		checkedCopy: new Set(state.checkedCopyTrackIds),
		checkedMove: new Set(state.checkedMoveTrackIds),
		checkedDelete: new Set(state.checkedDeleteTrackIds),
	};
	historyRedo.push(current);

	const prev = historyUndo.pop()!;
	state.checkedCopyTrackIds = prev.checkedCopy;
	state.checkedMoveTrackIds = prev.checkedMove;
	state.checkedDeleteTrackIds = prev.checkedDelete;

	renderCallback();
}

export function handleRedo(renderCallback: () => void) {
	if (historyRedo.length === 0) return;
	const current = {
		checkedCopy: new Set(state.checkedCopyTrackIds),
		checkedMove: new Set(state.checkedMoveTrackIds),
		checkedDelete: new Set(state.checkedDeleteTrackIds),
	};
	historyUndo.push(current);

	const next = historyRedo.pop()!;
	state.checkedCopyTrackIds = next.checkedCopy;
	state.checkedMoveTrackIds = next.checkedMove;
	state.checkedDeleteTrackIds = next.checkedDelete;

	renderCallback();
}

export function clearHistory() {
	historyUndo.length = 0;
	historyRedo.length = 0;
}
