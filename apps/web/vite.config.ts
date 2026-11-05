import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// Workers Builds names the commit it builds; Sentry uses it as the release.
// Assigning undefined to process.env stores the string "undefined", so only set a real SHA.
if (process.env.WORKERS_CI_COMMIT_SHA)
	process.env.VITE_SENTRY_RELEASE ||= process.env.WORKERS_CI_COMMIT_SHA;

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
				name: "Mic Drop",
				short_name: "Mic Drop",
				description: "Your chord sheets, in your key. Works offline.",
				theme_color: "#141210",
				background_color: "#141210",
				display: "standalone",
				start_url: "/",
				icons: [
					{
						src: "/icon.svg",
						sizes: "any",
						type: "image/svg+xml",
						purpose: "any",
					},
					{ src: "/icon-192.png", sizes: "192x192", type: "image/png" },
					{ src: "/icon-512.png", sizes: "512x512", type: "image/png" },
					{
						src: "/icon-maskable-512.png",
						sizes: "512x512",
						type: "image/png",
						purpose: "maskable",
					},
				],
			},
			workbox: {
				navigateFallback: "/offline.html",
				globPatterns: ["**/*.{js,css,svg,png,ico,html,woff2}"],
				navigateFallbackDenylist: [/^\/api\//, /^\/admin(\/|$)/],
			},
		}),
	],
});
