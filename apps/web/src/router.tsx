import {
	createRouter as createTanStackRouter,
	Link,
} from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import {
	captureClientError,
	initSentryClient,
} from "./integrations/sentry/client";
import { getContext } from "./integrations/tanstack-query/root-provider";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
	const context = getContext();

	const router = createTanStackRouter({
		routeTree,
		context,
		scrollRestoration: true,
		defaultPreload: "intent",
		defaultPreloadStaleTime: 0,
		defaultOnCatch: (error) => {
			if (!import.meta.env.SSR) captureClientError(error);
		},
		defaultNotFoundComponent: () => (
			<div className="grid min-h-svh place-content-center gap-2 p-6 text-center">
				<p className="font-medium">This page isn’t here</p>
				<Link to="/" className="text-muted-foreground underline">
					Go home
				</Link>
			</div>
		),
	});

	setupRouterSsrQueryIntegration({ router, queryClient: context.queryClient });
	if (!import.meta.env.SSR) initSentryClient(router);

	return router;
}

declare module "@tanstack/react-router" {
	interface Register {
		router: ReturnType<typeof getRouter>;
	}
}
