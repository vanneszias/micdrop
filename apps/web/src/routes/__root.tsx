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
				{
					name: "viewport",
					content: "width=device-width, initial-scale=1, viewport-fit=cover",
				},
				{ title: "Mic Drop" },
				{ name: "theme-color", content: "#0a0a0a" },
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
			<html lang="en" className="dark">
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
