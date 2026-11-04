import { env } from "cloudflare:workers";
import { z } from "zod";
import { auditStatement, BAN_HIDDEN, revokeOAuthStatements } from "./admin";
import { getAuth, HttpError, isAdminRole } from "./auth";

export const AdminAction = z.discriminatedUnion("action", [
	z.object({
		action: z.literal("ban"),
		userId: z.string().min(1),
		reason: z.string().trim().min(3).max(500),
		/** Omitted for a ban without an end date. */
		days: z.number().int().min(1).max(3650).optional(),
	}),
	z.object({ action: z.literal("unban"), userId: z.string().min(1) }),
	z.object({ action: z.literal("sign_out"), userId: z.string().min(1) }),
]);
export type AdminAction = z.infer<typeof AdminAction>;

export async function runAdminAction(
	request: Request,
	adminId: string,
	input: AdminAction,
) {
	const target = await env.DB.prepare("SELECT id,role FROM user WHERE id=?")
		.bind(input.userId)
		.first<{ id: string; role: string | null }>();
	if (!target) throw new HttpError(404, "This account does not exist.");
	const auth = getAuth();
	const headers = request.headers;
	if (input.action === "ban") {
		if (target.id === adminId)
			throw new HttpError(400, "You can't ban your own account.");
		if (isAdminRole(target.role))
			throw new HttpError(
				403,
				"Remove the administrator role in SQL before banning this account.",
			);
		// Better Auth sets the ban and deletes every session of the account.
		await auth.api.banUser({
			headers,
			body: {
				userId: target.id,
				banReason: input.reason,
				banExpiresIn: input.days ? input.days * 86_400 : undefined,
			},
		});
		await env.DB.batch([
			...revokeOAuthStatements(target.id),
			env.DB.prepare(
				"UPDATE publications SET moderated=? WHERE owner=? AND moderated=0",
			).bind(BAN_HIDDEN, target.id),
			auditStatement(adminId, "ban", "user", target.id, {
				reason: input.reason,
				days: input.days ?? null,
			}),
		]);
	} else if (input.action === "unban") {
		await auth.api.unbanUser({ headers, body: { userId: target.id } });
		await env.DB.batch([
			env.DB.prepare(
				"UPDATE publications SET moderated=0 WHERE owner=? AND moderated=?",
			).bind(target.id, BAN_HIDDEN),
			auditStatement(adminId, "unban", "user", target.id),
		]);
	} else {
		await auth.api.revokeUserSessions({
			headers,
			body: { userId: target.id },
		});
		await env.DB.batch([
			...revokeOAuthStatements(target.id),
			auditStatement(adminId, "sign_out", "user", target.id),
		]);
	}
	return { ok: true };
}
