import { env } from "cloudflare:workers";
import { cimd } from "@better-auth/cimd";
import { mcp } from "@better-auth/mcp";
import { validateSourceUrl } from "@chords/imports";
import { captureException, logger } from "@sentry/cloudflare";
import { betterAuth } from "better-auth";
import { isAPIError } from "better-auth/api";
import { admin, jwt, organization } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { D1Dialect } from "kysely-d1";
import { auditStatement, BAN_HIDDEN } from "./admin";
import { HttpError } from "./http-error";

export { HttpError } from "./http-error";

export const MCP_SCOPES = ["songs:read", "songs:write"];

export function mcpResource() {
	return new URL("/mcp", process.env.BETTER_AUTH_URL || env.BETTER_AUTH_URL)
		.href;
}

// Workers cannot reach private networks, so a public-hostname check plus refusing redirects
// covers what CIMD requires of the transport.
async function fetchClientMetadataResource(
	input: RequestInfo | URL,
	init?: RequestInit,
) {
	validateSourceUrl(input instanceof Request ? input.url : String(input));
	return fetch(input, { ...init, redirect: "manual" });
}

export function getAuth() {
	const secret = process.env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET;
	const googleId = process.env.GOOGLE_CLIENT_ID || env.GOOGLE_CLIENT_ID;
	const googleSecret =
		process.env.GOOGLE_CLIENT_SECRET || env.GOOGLE_CLIENT_SECRET;
	return betterAuth({
		secret,
		baseURL: process.env.BETTER_AUTH_URL || env.BETTER_AUTH_URL,
		database: { dialect: new D1Dialect({ database: env.DB }), type: "sqlite" },
		emailAndPassword: { enabled: true, minPasswordLength: 10 },
		databaseHooks: {
			user: {
				create: {
					after: async (user) => {
						logger.info("user.signed_up", { userId: user.id });
					},
				},
			},
			session: {
				create: {
					after: async (session) => {
						const impersonator = (session as { impersonatedBy?: string | null })
							.impersonatedBy;
						if (impersonator) {
							await auditStatement(
								impersonator,
								"impersonate",
								"user",
								session.userId,
							).run();
							return;
						}
						// A ban that expired is lifted at sign-in; bring back what it hid.
						await env.DB.prepare(
							"UPDATE publications SET moderated=0 WHERE owner=?1 AND moderated=?2 AND EXISTS(SELECT 1 FROM user WHERE id=?1 AND COALESCE(banned,0)=0)",
						)
							.bind(session.userId, BAN_HIDDEN)
							.run();
					},
				},
			},
		},
		socialProviders:
			googleId && googleSecret
				? {
						google: {
							clientId: googleId,
							clientSecret: googleSecret,
						},
					}
				: {},
		plugins: [
			organization({ requireEmailVerificationOnInvitation: true }),
			// Roles are granted by hand in SQL; there is no self-promotion endpoint.
			admin(),
			jwt(),
			mcp({
				resource: mcpResource(),
				loginPage: "/login",
				consentPage: "/consent",
				scopes: ["openid", "profile", "email", "offline_access", ...MCP_SCOPES],
				// ChatGPT registers dynamically; Claude uses client metadata documents.
				allowDynamicClientRegistration: true,
				allowUnauthenticatedClientRegistration: true,
			}),
			cimd({ fetchClientMetadataResource, metadataProfile: "mcp-2026-07-28" }),
			tanstackStartCookies(),
		],
		onAPIError: {
			// Better Auth answers its own failures with a 500, so report them before they vanish.
			onError(error, ctx) {
				if (isAPIError(error) && error.statusCode < 500) return;
				captureException(error);
				ctx.logger.error("auth_error", error);
			},
		},
	});
}
export async function requireUser(request: Request) {
	const session = await getAuth().api.getSession({ headers: request.headers });
	if (!session) throw new HttpError(401, "Sign in to use your cloud songbook.");
	// Impersonation has full access, so every change made through it is attributed.
	const impersonator = session.session.impersonatedBy;
	if (impersonator && request.method !== "GET" && request.method !== "HEAD")
		await auditStatement(
			impersonator,
			"impersonated_write",
			"user",
			session.user.id,
			{ path: new URL(request.url).pathname },
		).run();
	return session.user;
}
export function isAdminRole(role: string | null | undefined) {
	return !!role?.split(",").includes("admin");
}
export async function requireAdmin(request: Request) {
	const user = await requireUser(request);
	if (!isAdminRole(user.role))
		throw new HttpError(403, "Administrator access required.");
	return user;
}
export function endpoint(
	handler: (request: Request) => Promise<Response>,
	options = { contentType: "application/json", maxBytes: 500_000 },
) {
	return async ({ request }: { request: Request }) => {
		try {
			if (request.method !== "GET" && request.method !== "HEAD") {
				const origin = request.headers.get("Origin");
				if (origin && origin !== new URL(request.url).origin)
					throw new HttpError(403, "Cross-origin writes are not allowed.");
				if (
					!request.headers.get("Content-Type")?.startsWith(options.contentType)
				)
					throw new HttpError(415, `Use ${options.contentType}.`);
				const length = Number(request.headers.get("Content-Length") || 0);
				if (length > options.maxBytes)
					throw new HttpError(413, "This request is too large.");
			}
			return await handler(request);
		} catch (error) {
			// Local workerd drops the next request when an error leaves this body unread, so read
			// small bodies to the end and cancel the rest.
			if (request.body && !request.bodyUsed) {
				const length = Number(request.headers.get("Content-Length") || 0);
				await (length && length <= options.maxBytes
					? request.arrayBuffer()
					: request.body.cancel()
				).catch(() => {});
			}
			if (error instanceof HttpError)
				return Response.json(
					{ error: error.message },
					{ status: error.status },
				);
			if (error instanceof Error && error.name === "ZodError")
				return Response.json(
					{ error: "Invalid input. Check your changes and try again." },
					{ status: 400 },
				);
			captureException(error);
			console.error(
				JSON.stringify({
					event: "endpoint_error",
					path: new URL(request.url).pathname,
					message: error instanceof Error ? error.message : String(error),
				}),
			);
			return Response.json(
				{
					error:
						"The request could not be completed. Your local edits are safe.",
				},
				{ status: 500 },
			);
		}
	};
}
export async function canAccess(
	owner: string,
	userId: string,
	editing = false,
	publishing = false,
) {
	if (owner === userId) return true;
	const membership = await env.DB.prepare(
		"SELECT role FROM member WHERE organizationId = ? AND userId = ?",
	)
		.bind(owner, userId)
		.first<{ role: string }>();
	if (!membership) return false;
	if (publishing) return membership.role.split(",").includes("owner");
	return (
		!editing ||
		membership.role
			.split(",")
			.some((role) => ["owner", "admin", "member", "editor"].includes(role))
	);
}
