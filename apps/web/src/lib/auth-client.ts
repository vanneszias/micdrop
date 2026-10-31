import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
	plugins: [organizationClient(), oauthProviderClient()],
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
