import { isNotFound, isRedirect } from "@tanstack/react-router";
import {
	createCsrfMiddleware,
	createMiddleware,
	createStart,
} from "@tanstack/react-start";

// Start turns errors thrown by route handlers and SSR into plain 500 responses, so they never
// reach withSentry in server.ts. Report them here before rethrowing. Responses, redirects and
// not-found signals are control flow, not failures, so they are not reported.
const reportErrors = createMiddleware().server(async ({ next }) => {
	try {
		return await next();
	} catch (error) {
		if (
			!(error instanceof Response) &&
			!isRedirect(error) &&
			!isNotFound(error)
		) {
			const { reportError } = await import("./server/observability");
			reportError(error, "request");
		}
		throw error;
	}
});

export const startInstance = createStart(() => ({
	requestMiddleware: [
		createCsrfMiddleware({ filter: (ctx) => ctx.handlerType === "serverFn" }),
		reportErrors,
	],
}));
