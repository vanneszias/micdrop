import type { QueryClient } from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	HeadContent,
	Scripts,
} from "@tanstack/react-router";
import { THEME_SCRIPT } from "#/lib/theme";
import appCss from "../styles.css?url";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
	{
		head: () => ({
			meta: [
				{ charSet: "utf-8" },
				{
					name: "viewport",
					content: "width=device-width, initial-scale=1, viewport-fit=cover",
				},
				{ title: "Mic Drop" },
				{
					name: "theme-color",
					content: "#faf9f6",
					media: "(prefers-color-scheme: light)",
				},
				{
					name: "theme-color",
					content: "#141210",
					media: "(prefers-color-scheme: dark)",
				},
				{
					name: "description",
					content: "Your chord sheets, in your key. Works offline.",
				},
			],
			links: [
				{ rel: "stylesheet", href: appCss },
				{ rel: "manifest", href: "/manifest.webmanifest" },
				{ rel: "icon", href: "/icon.svg", type: "image/svg+xml" },
			],
		}),
		shellComponent: ({ children }) => (
			// The theme script sets the class before paint, so the server markup differs on purpose.
			<html lang="en" suppressHydrationWarning>
				<head>
					{/* biome-ignore lint/security/noDangerouslySetInnerHtml: Static pre-paint theme script. */}
					<script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
					<HeadContent />
				</head>
				<body>
					{children}
					<Scripts />
				</body>
			</html>
		),
	},
);
