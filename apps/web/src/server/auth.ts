import { env, waitUntil } from "cloudflare:workers";
import { cimd } from "@better-auth/cimd";
import { mcp } from "@better-auth/mcp";
import { passkey } from "@better-auth/passkey";
import { validateSourceUrl } from "@chords/imports";
import { captureException, logger } from "@sentry/cloudflare";
import { betterAuth } from "better-auth";
import { APIError, isAPIError } from "better-auth/api";
import {
	admin,
	captcha,
	jwt,
	organization,
	twoFactor,
} from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { D1Dialect } from "kysely-d1";
import { deleteAccountStatements } from "./account";
import { auditStatement, BAN_HIDDEN, SIGNUP_BURST } from "./admin";
import {
	type AuthEmailKind,
	authEmail,
	sendEmail,
	VERIFICATION_EXPIRES_IN,
} from "./email";
import { HttpError } from "./http-error";
import { reachedBandLimit } from "./quotas";

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
	const turnstileSecret =
		process.env.TURNSTILE_SECRET_KEY || env.TURNSTILE_SECRET_KEY;
	return betterAuth({
		secret,
		baseURL: process.env.BETTER_AUTH_URL || env.BETTER_AUTH_URL,
		database: { dialect: new D1Dialect({ database: env.DB }), type: "sqlite" },
		emailAndPassword: {
			enabled: true,
			minPasswordLength: 10,
			revokeSessionsOnPasswordReset: true,
			sendResetPassword: async ({ user, url }) => {
				queueAuthEmail(user.email, "reset", url);
			},
		},
		emailVerification: {
			sendOnSignUp: true,
			expiresIn: VERIFICATION_EXPIRES_IN,
			// Existing accounts can keep signing in while they verify their address.
			sendVerificationEmail: async ({ user, url }) => {
				// Only a fresh sign-up gets the welcome; a resend or a new address gets a plain request.
				const fresh =
					!user.emailVerified &&
					Date.now() - new Date(user.createdAt).getTime() < 3_600_000;
				queueAuthEmail(user.email, fresh ? "welcome" : "verify", url);
			},
		},
		user: {
			changeEmail: {
				enabled: true,
				// A verified address approves the move first; the new one is then verified itself.
				sendChangeEmailConfirmation: async ({ user, newEmail, url }) => {
					queueAuthEmail(user.email, "change", url, { newEmail });
				},
			},
			deleteUser: {
				enabled: true,
				// Removes the account with its songs, setlists and grants in one batch; Better Auth's
				// own delete that follows finds nothing left.
				beforeDelete: async (user) => {
					if (isAdminRole((user as { role?: string | null }).role))
						throw new APIError("FORBIDDEN", {
							message: "Administrator accounts can't be deleted from settings.",
						});
					try {
						await env.DB.batch(await deleteAccountStatements(user.id));
					} catch (error) {
						if (error instanceof HttpError)
							throw new APIError(
								error.status === 409 ? "CONFLICT" : "BAD_REQUEST",
								{
									message: error.message,
								},
							);
						throw error;
					}
					logger.info("user.deleted_self", { userId: user.id });
				},
			},
		},
		// Cloudflare sets cf-connecting-ip itself; x-forwarded-for can be supplied by the client.
		advanced: { ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] } },
		rateLimit: {
			// Better Auth only enables this when NODE_ENV says production, which Workers don't set.
			enabled: !import.meta.env.DEV,
			// Per-isolate memory would let each Worker instance count separately.
			storage: "database",
			customRules: {
				"/sign-up/email": { window: 3600, max: 10 },
				"/sign-in/email": { window: 60, max: 10 },
				"/request-password-reset": { window: 60, max: 3 },
				"/send-verification-email": { window: 60, max: 3 },
				"/change-email": { window: 3600, max: 5 },
				"/passkey/verify-authentication": { window: 60, max: 10 },
				"/oauth2/register": { window: 3600, max: 20 },
			},
		},
		databaseHooks: {
			user: {
				create: {
					after: async (user, context) => {
						logger.info("user.signed_up", { userId: user.id });
						const ip = context?.request?.headers.get("cf-connecting-ip");
						if (!ip) return;
						const recent = await env.DB.prepare(
							"SELECT COUNT(DISTINCT userId) AS accounts FROM session WHERE ipAddress=? AND createdAt>=?",
						)
							.bind(ip, new Date(Date.now() - 3_600_000).toISOString())
							.first<{ accounts: number }>();
						// This account's own session is not stored yet, so it counts as one more.
						const accounts = (recent?.accounts ?? 0) + 1;
						if (accounts >= SIGNUP_BURST)
							logger.warn("signup.burst", { ip, accounts, userId: user.id });
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
			organization({
				requireEmailVerificationOnInvitation: true,
				organizationLimit: (user) => reachedBandLimit(user.id),
			}),
			// Turnstile guards email sign-up wherever a secret is configured. It adds no
			// types, so the cast keeps the other plugins' inferred fields intact.
			...((turnstileSecret
				? [
						captcha({
							provider: "cloudflare-turnstile",
							secretKey: turnstileSecret,
							endpoints: ["/sign-up/email"],
						}),
					]
				: []) as []),
			// Roles are granted by hand in SQL; there is no self-promotion endpoint.
			admin(),
			// Authenticator-app codes with backup codes. They guard password sign-in; Google and
			// passkeys bring their own second factor.
			twoFactor({ issuer: "Mic Drop" }),
			passkey({ rpName: "Mic Drop" }),
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
function queueAuthEmail(
	to: string,
	kind: AuthEmailKind,
	url: string,
	details?: { newEmail?: string },
) {
	// Keep delivery alive after the response without revealing account existence through latency.
	waitUntil(
		sendEmail(env.EMAIL, { to, ...authEmail(kind, url, details) }).catch(
			(error) => {
				captureException(error, { tags: { operation: "auth.email", kind } });
				logger.error("auth.email_failed", { kind });
			},
		),
	);
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
			// Better Auth's own refusals, such as the band limit, are meant for the user.
			if (isAPIError(error) && error.statusCode < 500)
				return Response.json(
					{ error: error.message },
					{ status: error.statusCode },
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
