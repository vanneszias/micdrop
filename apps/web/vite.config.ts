import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
	envDir: "../..",
	resolve: { tsconfigPaths: true },
	plugins: [
		cloudflare({ viteEnvironment: { name: "ssr" } }),
		tailwindcss(),
		tanstackStart(),
		react(),
		VitePWA({
			injectRegister: false,
			registerType: "prompt",
			manifest: {
				name: "Bobo — your little songbook",
				short_name: "Bobo",
				theme_color: "#faf7f0",
				background_color: "#faf7f0",
				display: "standalone",
				start_url: "/",
				icons: [
					{
						src: "/icon.svg",
						sizes: "any",
						type: "image/svg+xml",
						purpose: "any",
					},
				],
			},
			workbox: {
				navigateFallback: "/offline.html",
				globPatterns: ["**/*.{js,css,svg,html,woff2}"],
				navigateFallbackDenylist: [/^\/api\//],
			},
		}),
	],
});
