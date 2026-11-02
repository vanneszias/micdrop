import { consoleLoggingIntegration, withSentry } from "@sentry/cloudflare";
import {
	createStartHandler,
	defaultStreamHandler,
} from "@tanstack/react-start/server";
import { createServerEntry } from "@tanstack/react-start/server-entry";

const fetch = createStartHandler(defaultStreamHandler);
const serverEntry = createServerEntry({ fetch }) as ExportedHandler<Env>;

export default withSentry<Env>(
	(env) => ({
		dsn: env.SENTRY_DSN,
		enabled: !import.meta.env.DEV,
		release: import.meta.env.VITE_SENTRY_RELEASE,
		tracesSampleRate: 1,
		integrations: [consoleLoggingIntegration({ levels: ["warn", "error"] })],
	}),
	serverEntry,
);
