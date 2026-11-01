import * as Sentry from "@sentry/react";

export function initSentryClient() {
	Sentry.init({
		dsn: import.meta.env.VITE_SENTRY_DSN,
	});
}

export const captureClientError = Sentry.captureException;
