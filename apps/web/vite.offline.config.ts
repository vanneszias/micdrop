import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	resolve: { tsconfigPaths: true },
	plugins: [
		// The offline shell has no server, so its route tree skips src/routes/api.
		tanstackRouter({
			target: "react",
			routesDirectory: "./src/routes",
			generatedRouteTree: "./src/routeTree.offline.gen.ts",
			routeFileIgnorePattern: "api",
			autoCodeSplitting: false,
		}),
		react(),
		tailwindcss(),
	],
	publicDir: false,
	build: {
		outDir: "dist/client",
		emptyOutDir: false,
		assetsDir: "offline-assets",
		rolldownOptions: { input: "offline.html" },
	},
});
