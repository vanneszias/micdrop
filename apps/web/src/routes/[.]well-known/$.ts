import {
	oauthProviderAuthServerMetadata,
	oauthProviderOpenIdConfigMetadata,
} from "@better-auth/oauth-provider";
import { createFileRoute } from "@tanstack/react-router";
import { getAuth } from "#/server/auth";

// MCP clients look for OAuth discovery at the origin root, outside the /api/auth base path.
export const Route = createFileRoute("/.well-known/$")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const { pathname } = new URL(request.url);
				const auth = getAuth();
				if (pathname.startsWith("/.well-known/oauth-protected-resource"))
					return auth.handler(request);
				if (pathname.startsWith("/.well-known/oauth-authorization-server"))
					return oauthProviderAuthServerMetadata(auth)(request);
				if (pathname.startsWith("/.well-known/openid-configuration"))
					return oauthProviderOpenIdConfigMetadata(auth)(request);
				return new Response("Not found", { status: 404 });
			},
		},
	},
});
