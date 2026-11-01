// Local workerd can close sockets after rejecting unread request bodies.
// Disable Bun connection pooling for integration requests, without retries.
const originalFetch = globalThis.fetch;
globalThis.fetch = Object.assign(
	(input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
		originalFetch(input, { ...init, keepalive: false }),
	{ preconnect: originalFetch.preconnect },
);
