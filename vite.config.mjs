import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
	root: "src",
	base: "./",

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
	plugins: [tailwindcss()],
});
