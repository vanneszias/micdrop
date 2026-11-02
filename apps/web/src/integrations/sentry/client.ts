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
