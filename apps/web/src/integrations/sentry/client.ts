import * as Sentry from "@sentry/react";

export function initSentryClient() {
	Sentry.init({
		dsn: import.meta.env.VITE_SENTRY_DSN,
		enabled: !import.meta.env.DEV,
		release: import.meta.env.VITE_SENTRY_RELEASE,
	});
}

export const captureClientError = Sentry.captureException;
