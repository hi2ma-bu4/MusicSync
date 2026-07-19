import tailwindcss from "@tailwindcss/vite";
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));

export default defineConfig({
	root: "src",
	base: "./",

	define: {
		__APP_VERSION__: JSON.stringify(pkg.version),
	},
	build: {
		outDir: "../dist",
		emptyOutDir: true,
		sourcemap: true,
		rollupOptions: {
			output: {
				entryFileNames: "assets/js/[name]-[hash].js",
				chunkFileNames: "assets/js/chunk/[name]-[hash].js",
				assetFileNames: (assetInfo) => {
					const ext = assetInfo.name?.split(".").pop();

					if (ext === "css") {
						return "assets/css/[name]-[hash][extname]";
					}
					if (["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(ext ?? "")) {
						return "assets/img/[name]-[hash][extname]";
					}
					if (["ttf", "woff", "woff2", "eot"].includes(ext ?? "")) {
						return "assets/fonts/[name][extname]";
					}

					return "assets/[name]-[hash][extname]";
				},
			},
		},
	},
	plugins: [
		{
			name: "html-version",
			transformIndexHtml(html) {
				return html.replace("__APP_VERSION__", pkg.version);
			},
		},
		tailwindcss(),
	],
});
