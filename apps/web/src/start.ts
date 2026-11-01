import {
	createCsrfMiddleware,
	createMiddleware,
	createStart,
} from "@tanstack/react-start";

// Start turns errors thrown by route handlers and SSR into plain 500 responses, so they never
// reach withSentry in server.ts. Report them here before rethrowing.
const reportErrors = createMiddleware().server(async ({ next }) => {
	try {
		return await next();
	} catch (error) {
		if (!(error instanceof Response)) {
			const { captureException } = await import("@sentry/cloudflare");
			captureException(error);
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
