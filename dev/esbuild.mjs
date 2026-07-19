import * as esbuild from "esbuild";

await esbuild.build({
	entryPoints: ["src/main.ts", "src/preload.ts", "src/renderer.ts"],
	outdir: "dist",
	bundle: true,
	platform: "node",
	format: "esm",
	sourcemap: true,
});
