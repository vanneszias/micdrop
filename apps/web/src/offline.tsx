import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { createRoot } from "react-dom/client";
import { applyStoredTheme } from "./lib/theme";
import { routeTree } from "./routeTree.offline.gen";
import "./styles.css";

applyStoredTheme();

const queryClient = new QueryClient();
const router = createRouter({
	routeTree,
	context: { queryClient },
	defaultPreload: "intent",
});
// The root route renders <html> itself, so the document is the React root.
// Mounted inside a <div>, React claims <body> around its own container and
// events reaching a portal on <body> loop forever, freezing the tab.
createRoot(document).render(
	<QueryClientProvider client={queryClient}>
		<RouterProvider router={router} />
	</QueryClientProvider>,
);
