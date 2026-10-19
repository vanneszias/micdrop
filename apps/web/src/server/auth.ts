import { env } from "cloudflare:workers";
import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { D1Dialect } from "kysely-d1";
import { HttpError } from "./http-error";

export { HttpError } from "./http-error";

export function getAuth() {
	const secret = process.env.BETTER_AUTH_SECRET;
	return betterAuth({
		secret,
		baseURL: process.env.BETTER_AUTH_URL || env.BETTER_AUTH_URL,
		database: { dialect: new D1Dialect({ database: env.DB }), type: "sqlite" },
		emailAndPassword: { enabled: true, minPasswordLength: 10 },
		socialProviders:
			process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
				? {
						google: {
							clientId: process.env.GOOGLE_CLIENT_ID,
							clientSecret: process.env.GOOGLE_CLIENT_SECRET,
						},
					}
				: {},
		plugins: [
			organization({ requireEmailVerificationOnInvitation: true }),
			tanstackStartCookies(),
		],
	});
}
export async function requireUser(request: Request) {
	const session = await getAuth().api.getSession({ headers: request.headers });
	if (!session) throw new HttpError(401, "Sign in to use your cloud songbook.");
	return session.user;
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
