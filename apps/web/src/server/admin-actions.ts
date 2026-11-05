import { env } from "cloudflare:workers";
import { logger } from "@sentry/cloudflare";
import { z } from "zod";
import { deleteAccountStatements, sendVerificationReminder } from "./account";
import {
	auditStatement,
	BAN_HIDDEN,
	deleteRecordsStatements,
	revokeOAuthStatements,
	UNVERIFIED_USERS,
} from "./admin";
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
	z.object({
		action: z.literal("resend_verification"),
		userId: z.string().min(1),
	}),
	/** Reminds unverified accounts in batches; pass the returned `next` until it is null. */
	z.object({
		action: z.literal("remind_unverified"),
		after: z.string().default(""),
	}),
	z.object({
		action: z.literal("disable_client"),
		clientId: z.string().min(1),
		disabled: z.boolean(),
	}),
	z.object({ action: z.literal("revoke_share"), ref: z.number().int() }),
	/** Hard deletes need the account's email or the band's name typed back. */
	z.object({
		action: z.literal("delete_user"),
		userId: z.string().min(1),
		confirm: z.string(),
	}),
	z.object({
		action: z.literal("delete_band"),
		bandId: z.string().min(1),
		confirm: z.string(),
	}),
]);
export type AdminAction = z.infer<typeof AdminAction>;

export async function runAdminAction(
	request: Request,
	adminId: string,
	input: AdminAction,
) {
	if (input.action === "disable_client") return disableClient(adminId, input);
	if (input.action === "revoke_share") return revokeShare(adminId, input.ref);
	if (input.action === "delete_band") return deleteBand(adminId, input);
	if (input.action === "delete_user") return deleteUser(adminId, input);
	if (input.action === "remind_unverified")
		return remindUnverified(adminId, input.after);
	const target = await env.DB.prepare(
		"SELECT id,role,email,emailVerified FROM user WHERE id=?",
	)
		.bind(input.userId)
		.first<{
			id: string;
			role: string | null;
			email: string;
			emailVerified: number;
		}>();
	if (!target) throw new HttpError(404, "This account does not exist.");
	if (input.action === "resend_verification") {
		if (target.emailVerified)
			throw new HttpError(400, "This email address is already verified.");
		await sendVerificationReminder(target.email);
		await auditStatement(
			adminId,
			"resend_verification",
			"user",
			target.id,
		).run();
		return { ok: true };
	}
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
		logger.warn("user.banned", {
			adminId,
			userId: target.id,
			days: input.days ?? null,
		});
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

async function disableClient(
	adminId: string,
	input: { clientId: string; disabled: boolean },
) {
	const client = await env.DB.prepare(
		"SELECT clientId FROM oauthClient WHERE clientId=?",
	)
		.bind(input.clientId)
		.first();
	if (!client) throw new HttpError(404, "This client does not exist.");
	const revoked = new Date().toISOString();
	await env.DB.batch([
		env.DB.prepare("UPDATE oauthClient SET disabled=? WHERE clientId=?").bind(
			input.disabled ? 1 : 0,
			input.clientId,
		),
		...(input.disabled
			? ["oauthRefreshToken", "oauthAccessToken"].map((table) =>
					env.DB.prepare(
						`UPDATE ${table} SET revoked=? WHERE clientId=? AND (revoked IS NULL OR revoked=0)`,
					).bind(revoked, input.clientId),
				)
			: []),
		auditStatement(
			adminId,
			input.disabled ? "disable_client" : "enable_client",
			"client",
			input.clientId,
		),
	]);
	return { ok: true };
}

async function revokeShare(adminId: string, ref: number) {
	const link = await env.DB.prepare(
		"SELECT kind,target FROM share_links WHERE rowid=?",
	)
		.bind(ref)
		.first<{ kind: string; target: string }>();
	if (!link) throw new HttpError(404, "This link does not exist.");
	await env.DB.batch([
		env.DB.prepare("UPDATE share_links SET revoked=1 WHERE rowid=?").bind(ref),
		auditStatement(adminId, "revoke_share", link.kind, link.target),
	]);
	return { ok: true };
}

async function deleteBand(
	adminId: string,
	input: { bandId: string; confirm: string },
) {
	const band = await env.DB.prepare(
		"SELECT id,name FROM organization WHERE id=?",
	)
		.bind(input.bandId)
		.first<{ id: string; name: string }>();
	if (!band) throw new HttpError(404, "This band does not exist.");
	if (input.confirm.trim() !== band.name)
		throw new HttpError(422, "Type the band's name exactly to delete it.");
	await env.DB.batch([
		...deleteRecordsStatements(band.id),
		env.DB.prepare(
			"DELETE FROM share_links WHERE kind='invite' AND target=?",
		).bind(band.id),
		env.DB.prepare(
			"UPDATE session SET activeOrganizationId=NULL WHERE activeOrganizationId=?",
		).bind(band.id),
		// Members and invitations cascade with the organization.
		env.DB.prepare("DELETE FROM organization WHERE id=?").bind(band.id),
		auditStatement(adminId, "delete_band", "band", band.id, {
			name: band.name,
		}),
	]);
	return { ok: true };
}

async function deleteUser(
	adminId: string,
	input: { userId: string; confirm: string },
) {
	const user = await env.DB.prepare(
		"SELECT id,name,email,role FROM user WHERE id=?",
	)
		.bind(input.userId)
		.first<{ id: string; name: string; email: string; role: string | null }>();
	if (!user) throw new HttpError(404, "This account does not exist.");
	if (input.confirm.trim().toLowerCase() !== user.email.toLowerCase())
		throw new HttpError(422, "Type the account's email exactly to delete it.");
	if (user.id === adminId || isAdminRole(user.role))
		throw new HttpError(
			403,
			"Remove the administrator role in SQL before deleting this account.",
		);
	await env.DB.batch([
		...(await deleteAccountStatements(user.id)),
		auditStatement(adminId, "delete_user", "user", user.id, {
			name: user.name,
			email: user.email,
		}),
	]);
	return { ok: true };
}

/** Accounts reminded per request, which keeps one request well inside Workers' subrequest limit. */
const REMINDER_BATCH = 50;

async function remindUnverified(adminId: string, after: string) {
	const { results } = await env.DB.prepare(
		`SELECT id,email ${UNVERIFIED_USERS} AND id>? ORDER BY id LIMIT ?`,
	)
		.bind(after, REMINDER_BATCH)
		.all<{ id: string; email: string }>();
	let sent = 0;
	const failed: string[] = [];
	for (const user of results) {
		try {
			await sendVerificationReminder(user.email);
			sent++;
		} catch (error) {
			failed.push(user.id);
			logger.error("verification_reminder.failed", {
				userId: user.id,
				message: error instanceof Error ? error.message : String(error),
			});
		}
	}
	if (results.length)
		await auditStatement(adminId, "remind_unverified", "user", "*", {
			sent,
			failed,
		}).run();
	const next =
		results.length === REMINDER_BATCH ? results[results.length - 1].id : null;
	return { sent, failed: failed.length, next };
}
