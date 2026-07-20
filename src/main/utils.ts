import { parseFile } from "music-metadata";
import fs from "node:fs";
import path from "node:path";
import { TrackMetadata } from "./types";

export function normText(val: string | null | undefined): string {
	if (!val) return "";
	return String(val)
		.trim()
		.toLowerCase()
		.normalize("NFKC")
		.replace(/[\s\-_]+/g, " ");
}

export function normTrack(val: string | null | undefined): string {
	if (!val) return "";
	const s = String(val).trim();
	const firstPart = s.split("/")[0].trim();
	const num = parseInt(firstPart, 10);
	if (!isNaN(num)) {
		return String(num);
	}
	return firstPart.toLowerCase();
}

export async function findMusicFiles(dir: string, baseDir: string = dir): Promise<{ filePath: string; relativePath: string }[]> {
	const results: { filePath: string; relativePath: string }[] = [];
	let list: fs.Dirent[] = [];
	try {
		list = await fs.promises.readdir(dir, { withFileTypes: true });
	} catch (e) {
		console.error(`Failed to read directory: ${dir}`, e);
		return [];
	}

	const validExtensions = new Set([".mp3", ".m4a", ".aac", ".flac", ".wav", ".ogg", ".wma"]);

	for (const item of list) {
		const resPath = path.join(dir, item.name);
		if (item.isDirectory()) {
			const subFiles = await findMusicFiles(resPath, baseDir);
			results.push(...subFiles);
		} else {
			const ext = path.extname(item.name).toLowerCase();
			if (validExtensions.has(ext)) {
				const relativePath = path.relative(baseDir, resPath).replace(/\\/g, "/");
				results.push({ filePath: resPath, relativePath });
			}
		}
	}
	return results;
}

export async function getTrackMetadata(filePath: string, relativePath: string): Promise<TrackMetadata> {
	try {
		const stats = await fs.promises.stat(filePath);
		const metadata = await parseFile(filePath, { skipCovers: false });
		const title = metadata.common.title || path.basename(filePath, path.extname(filePath));
		const artist = metadata.common.artist || "Unknown Artist";
		const album = metadata.common.album || "Unknown Album";

		let trackStr = "";
		if (metadata.common.track && metadata.common.track.no !== null) {
			trackStr = String(metadata.common.track.no);
		}

		let discStr = "";
		if (metadata.common.disk && metadata.common.disk.no !== null) {
			discStr = String(metadata.common.disk.no);
		}

		const genre = (metadata.common.genre && metadata.common.genre[0]) || "Unknown Genre";
		const picture = metadata.common.picture && metadata.common.picture[0];
		const hasCoverArt = !!picture;
		const coverArtSize = picture ? picture.data.length : 0;

		const albumartist = metadata.common.albumartist || "";
		const composer = (metadata.common.composer && metadata.common.composer[0]) || "";

		// Year can be stored in metadata.common.year or metadata.common.date
		let yearStr = "";
		if (metadata.common.year) {
			yearStr = String(metadata.common.year);
		} else if (metadata.common.date) {
			// Extract year from date string if present
			const match = metadata.common.date.match(/\d{4}/);
			if (match) {
				yearStr = match[0];
			} else {
				yearStr = metadata.common.date;
			}
		}

		let commentStr = "";
		if (metadata.common.comment && metadata.common.comment.length > 0) {
			const c = metadata.common.comment[0];
			if (typeof c === "string") {
				commentStr = c;
			} else if (c && typeof c === "object" && "text" in c) {
				commentStr = (c as any).text || "";
			}
		}

		return {
			id: "",
			filePath,
			relativePath,
			title,
			artist,
			album,
			track: trackStr,
			genre,
			size: stats.size,
			mtimeMs: stats.mtimeMs,
			hasCoverArt,
			coverArtSize,
			disc: discStr,
			albumartist,
			composer,
			year: yearStr,
			comment: commentStr,
		};
	} catch (err) {
		const stats = await fs.promises.stat(filePath);
		return {
			id: "",
			filePath,
			relativePath,
			title: path.basename(filePath, path.extname(filePath)),
			artist: "Unknown Artist",
			album: "Unknown Album",
			track: "",
			genre: "Unknown Genre",
			size: stats.size,
			mtimeMs: stats.mtimeMs,
			hasCoverArt: false,
			coverArtSize: 0,
			disc: "",
			albumartist: "",
			composer: "",
			year: "",
			comment: "",
		};
	}
}
