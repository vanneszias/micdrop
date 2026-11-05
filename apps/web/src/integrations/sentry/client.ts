import * as Sentry from "@sentry/react";

export function initSentryClient(router: unknown) {
	Sentry.init({
		dsn: import.meta.env.VITE_SENTRY_DSN,
		enabled: !import.meta.env.DEV,
		release: import.meta.env.VITE_SENTRY_RELEASE,
		tracesSampleRate: 1,
		integrations: [Sentry.tanstackRouterBrowserTracingIntegration(router)],
	});
}

export const captureClientError = Sentry.captureException;

/**
 * Reports a failure the app handles itself (a toast, a retry, a fallback), so it is still
 * visible. `operation` names the action, so issues can be filtered and grouped by it.
 */
export function reportClientError(error: unknown, operation: string) {
	Sentry.captureException(error, { tags: { operation } });
}

/** Times a user action or a request as a span, so its duration shows up in performance data. */
export function traceClient<T>(
	name: string,
	op: string,
	work: () => Promise<T>,
): Promise<T> {
	return Sentry.startSpan({ name, op }, work);
}
