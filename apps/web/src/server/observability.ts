import { captureException } from "@sentry/cloudflare";
import { HttpError } from "./http-error";

/** The HTTP status an error is answered with: an HttpError's own, otherwise a 500. */
export function statusOf(error: unknown): number {
	return error instanceof HttpError ? error.status : 500;
}

/**
 * Reports an error that is about to become a response or a log line. Every error is
 * reported. A 4xx is a warning (the app refused something the user asked for), a 5xx
 * or an unexpected throw is an error. `operation` names where it happened, so issues
 * can be filtered and grouped by it.
 */
export function reportError(
	error: unknown,
	operation: string,
	status: number = statusOf(error),
) {
	captureException(error, {
		level: status < 500 ? "warning" : "error",
		tags: { operation, status: String(status) },
	});
}
