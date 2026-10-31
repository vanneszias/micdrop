import { requireMcpAuth } from "@better-auth/mcp";
import { createFileRoute } from "@tanstack/react-router";
import { getAuth, MCP_SCOPES, mcpResource } from "#/server/auth";
import { serveMcp } from "#/server/mcp";

function handle({ request }: { request: Request }) {
	return requireMcpAuth(getAuth(), serveMcp, {
		resource: mcpResource(),
		challengeScopes: MCP_SCOPES,
	})(request);
}
export const Route = createFileRoute("/mcp")({
	server: { handlers: { POST: handle, GET: handle, DELETE: handle } },
});
