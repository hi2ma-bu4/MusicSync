import commonjs from "@chialab/esbuild-plugin-commonjs";
import { build } from "esbuild";
import fs from "fs/promises";
import iconv from "iconv-lite";

const ps1Loader = {
	name: "ps1-loader",
	setup(build) {
		build.onLoad({ filter: /\.ps1$/ }, async (args) => {
			const buffer = await fs.readFile(args.path);
			let text = iconv.decode(buffer, "cp932");

			if (text.charCodeAt(0) === 0xfeff) {
				text = text.slice(1);
			}

			return {
				contents: text,
				loader: "text",
			};
		});
	},
};

const common = {
	plugins: [ps1Loader, commonjs()],
	bundle: true,
	platform: "node",
	sourcemap: true,
	external: ["electron", "electron-store", "music-metadata", "usb"],
};

await build({
	...common,
	format: "esm",
	entryPoints: ["src/main.ts"],
	outfile: "dist/main.js",
});

await build({
	...common,
	format: "cjs",
	entryPoints: ["src/preload.ts"],
	outfile: "dist/preload.js",
});
