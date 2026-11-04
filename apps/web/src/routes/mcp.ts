import { createFileRoute } from "@tanstack/react-router";
import { verifyJwsAccessToken } from "better-auth/oauth2";
import { blockedToken } from "#/server/admin";
import { getAuth, MCP_SCOPES, mcpResource } from "#/server/auth";
import { serveMcp } from "#/server/mcp";

const jwksCacheKey = {};

// requireMcpAuth fetches the JWKS over HTTP, and a Worker cannot fetch its own custom domain,
// so verify against the keys read in-process instead.
async function handle({ request }: { request: Request }) {
	const auth = getAuth();
	const resource = mcpResource();
	const token = request.headers
		.get("Authorization")
		?.match(/^Bearer\s+(\S+)$/i)?.[1];
	const claims = token
		? await verifyJwsAccessToken(token, {
				jwksFetch: () => auth.api.getJwks(),
				jwksCacheKey,
				verifyOptions: {
					issuer: new URL("/api/auth", resource).href,
					audience: resource,
					requiredClaims: ["azp"],
				},
			}).catch(() => undefined)
		: undefined;
	// Access tokens are self-contained JWTs, so bans and disabled clients are checked on every call.
	if (claims?.sub && (await blockedToken(claims.sub, String(claims.azp))))
		return Response.json(
			{
				jsonrpc: "2.0",
				error: {
					code: -32000,
					message: "This account or assistant is suspended.",
				},
				id: null,
			},
			{ status: 403 },
		);
	if (claims) return serveMcp(request, claims);
	const metadata = new URL(
		"/.well-known/oauth-protected-resource/mcp",
		resource,
	);
	return Response.json(
		{
			jsonrpc: "2.0",
			error: { code: -32000, message: "Sign in to Mic Drop to continue." },
			id: null,
		},
		{
			status: 401,
			headers: {
				"WWW-Authenticate": `Bearer ${token ? 'error="invalid_token", ' : ""}resource_metadata="${metadata}", scope="${MCP_SCOPES.join(" ")}"`,
			},
		},
	);
}
export const Route = createFileRoute("/mcp")({
	server: { handlers: { POST: handle, GET: handle, DELETE: handle } },
});
