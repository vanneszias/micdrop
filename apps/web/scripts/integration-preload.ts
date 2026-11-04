// Local workerd can close sockets after rejecting unread request bodies.
// Disable Bun connection pooling for integration requests, without retries.
// Locally every request shares one client IP, so the sign-up and sign-in rate limits would
// trip across tests. Give each request its own documentation-range network unless a test sets one.
const originalFetch = globalThis.fetch;
globalThis.fetch = Object.assign(
	(input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
		const headers = new Headers(
			init?.headers ?? (input instanceof Request ? input.headers : undefined),
		);
		if (!headers.has("cf-connecting-ip"))
			headers.set(
				"cf-connecting-ip",
				// Better Auth groups IPv6 clients by /64, so randomize the prefix.
				`2001:db8:${[...crypto.getRandomValues(new Uint16Array(2))].map((part) => part.toString(16)).join(":")}::1`,
			);
		return originalFetch(input, { ...init, headers, keepalive: false });
	},
	{ preconnect: originalFetch.preconnect },
);
