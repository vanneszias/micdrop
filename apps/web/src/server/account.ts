import { env } from "cloudflare:workers";
import { createEmailVerificationToken } from "better-auth/api";
import { deleteRecordsStatements } from "./admin";
import { authEmail, REMINDER_EXPIRES_IN, sendEmail } from "./email";
import { HttpError } from "./http-error";

/**
 * Checks that an account can go and returns the statements that remove it with everything it
 * owns. Callers run them in one batch, so a refusal or failure leaves the account intact.
 */
export async function deleteAccountStatements(userId: string) {
	const { results: soleOwned } = await env.DB.prepare(
		`SELECT o.name FROM member m JOIN organization o ON o.id=m.organizationId
		WHERE m.userId=?1 AND ','||m.role||',' LIKE '%,owner,%'
		AND NOT EXISTS(SELECT 1 FROM member x WHERE x.organizationId=o.id AND x.userId!=?1 AND ','||x.role||',' LIKE '%,owner,%')`,
	)
		.bind(userId)
		.all<{ name: string }>();
	if (soleOwned.length)
		throw new HttpError(
			409,
			`Delete these bands or hand them to another owner first; this account is their only owner: ${soleOwned.map((band) => band.name).join(", ")}.`,
		);
	// Catalogue moderation history references the account, and it must not be erased.
	if (
		await env.DB.prepare("SELECT 1 FROM catalogue_actions WHERE user_id=?")
			.bind(userId)
			.first()
	)
		throw new HttpError(
			409,
			"This account has catalogue moderation history and can't be deleted.",
		);
	const own = (sql: string) => env.DB.prepare(sql).bind(userId);
	const clients = "SELECT clientId FROM oauthClient WHERE userId=?1";
	return [
		...deleteRecordsStatements(userId),
		own("DELETE FROM votes WHERE user_id=?1"),
		own("DELETE FROM catalogue_reports WHERE user_id=?1"),
		own("DELETE FROM operations WHERE user_id=?1"),
		own("DELETE FROM catalogue_admins WHERE user_id=?1"),
		own("DELETE FROM invitation WHERE inviterId=?1"),
		own(
			`DELETE FROM oauthAccessToken WHERE userId=?1 OR clientId IN (${clients})`,
		),
		own(
			`DELETE FROM oauthRefreshToken WHERE userId=?1 OR clientId IN (${clients})`,
		),
		own(`DELETE FROM oauthConsent WHERE userId=?1 OR clientId IN (${clients})`),
		own("DELETE FROM oauthClient WHERE userId=?1"),
		// Sessions, accounts, memberships, imports, share links, passkeys and 2FA cascade.
		own("DELETE FROM user WHERE id=?1"),
	];
}

/**
 * Emails a verification link that stays valid for a week, for accounts that signed up before
 * Mic Drop sent mail. Delivery is awaited so the caller can report failures.
 */
export async function sendVerificationReminder(email: string) {
	const baseURL = process.env.BETTER_AUTH_URL || env.BETTER_AUTH_URL;
	const secret = process.env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET;
	const token = await createEmailVerificationToken(
		secret,
		email,
		undefined,
		REMINDER_EXPIRES_IN,
	);
	const url = `${new URL("/api/auth/verify-email", baseURL)}?token=${token}&callbackURL=${encodeURIComponent("/login?action=verified")}`;
	await sendEmail(env.EMAIL, { to: email, ...authEmail("reminder", url) });
}
