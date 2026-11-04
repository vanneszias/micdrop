import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { adminClient, organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
	plugins: [organizationClient(), adminClient(), oauthProviderClient()],
});

/** When an MCP client sent the user here to sign in, returns where to resume authorization. */
export function pendingAuthorization() {
	if (typeof window === "undefined") return;
	const query = new URLSearchParams(window.location.search);
	if (!query.has("sig") || !query.has("client_id")) return;
	query.delete("sig");
	query.delete("exp");
	return `/api/auth/oauth2/authorize?${query}`;
}

/** Where to go after signing in, when a page such as an invite sent the user here. */
export function returnPath() {
	if (typeof window === "undefined") return;
	const path = new URLSearchParams(window.location.search).get("redirect");
	if (!path) return;
	// Same-origin paths only, so the login page can't bounce users to another site.
	const url = new URL(path, window.location.origin);
	if (url.origin !== window.location.origin) return;
	return `${url.pathname}${url.search}${url.hash}`;
}
