import commonjs from "@chialab/esbuild-plugin-commonjs";
import { build } from "esbuild";

const common = {
	plugins: [commonjs()],
	bundle: true,
	platform: "node",
	sourcemap: true,
	external: ["electron", "electron-store", "music-metadata"],
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
