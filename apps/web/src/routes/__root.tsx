import type { QueryClient } from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	HeadContent,
	Scripts,
} from "@tanstack/react-router";
import appCss from "../styles.css?url";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
	{
		head: () => ({
			meta: [
				{ charSet: "utf-8" },
				{ name: "viewport", content: "width=device-width, initial-scale=1" },
				{ title: "Bobo — your little songbook" },
				{ name: "theme-color", content: "#faf7f0" },
				{
					name: "description",
					content:
						"A little room for your favorite songs. Keep your chords together, find your comfy key, and play something you love.",
				},
			],
			links: [
				{ rel: "stylesheet", href: appCss },
				{ rel: "manifest", href: "/manifest.webmanifest" },
				{ rel: "icon", href: "/icon.svg", type: "image/svg+xml" },
			],
		}),
		shellComponent: ({ children }) => (
			<html lang="en">
				<head>
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
