import { expect, test } from "bun:test";
import { localSql } from "./test-db";

const base = process.env.CHORDS_TEST_URL || "";
const password = "account-integration-password-2026";

const cookieOf = (response: Response) =>
	response.headers
		.getSetCookie()
		.map((value) => value.split(";")[0])
		.join("; ");

function post(path: string, body: unknown, cookie = "") {
	return fetch(`${base}${path}`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Origin: base,
			Cookie: cookie,
		},
		body: JSON.stringify(body),
	});
}

async function account(name: string) {
	const email = `${crypto.randomUUID()}@chords.test`;
	const response = await post("/api/auth/sign-up/email", {
		name,
		email,
		password,
	});
	expect(response.status).toBe(200);
	const { user } = (await response.json()) as { user: { id: string } };
	if (!/^[a-zA-Z0-9_-]+$/.test(user.id))
		throw new Error("Unexpected fixture user id.");
	return { id: user.id, email, cookie: cookieOf(response) };
}

const session = async (cookie: string) =>
	(await (
		await fetch(`${base}/api/auth/get-session`, { headers: { Cookie: cookie } })
	).json()) as {
		user: { name: string; email: string; twoFactorEnabled?: boolean };
	} | null;

/** RFC 6238 code for a base32 secret, as an authenticator app computes it. */
async function totp(secret: string, now = Date.now()) {
	const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
	let bits = "";
	for (const character of secret.replace(/=+$/, "").toUpperCase())
		bits += alphabet.indexOf(character).toString(2).padStart(5, "0");
	const key = new Uint8Array(Math.floor(bits.length / 8));
	for (let index = 0; index < key.length; index++)
		key[index] = Number.parseInt(bits.slice(index * 8, index * 8 + 8), 2);
	const counter = new DataView(new ArrayBuffer(8));
	counter.setBigUint64(0, BigInt(Math.floor(now / 30_000)));
	const hmac = new Uint8Array(
		await crypto.subtle.sign(
			"HMAC",
			await crypto.subtle.importKey(
				"raw",
				key,
				{ name: "HMAC", hash: "SHA-1" },
				false,
				["sign"],
			),
			counter.buffer,
		),
	);
	const offset = hmac[hmac.length - 1] & 15;
	const value =
		((hmac[offset] & 127) << 24) |
		(hmac[offset + 1] << 16) |
		(hmac[offset + 2] << 8) |
		hmac[offset + 3];
	return String(value % 1_000_000).padStart(6, "0");
}

test.skipIf(!base)(
	"people manage their profile, two-factor sign-in, passkeys and email themselves",
	async () => {
		const me = await account("Settings fixture");
		expect(
			(await post("/api/auth/update-user", { name: "Renamed" }, me.cookie))
				.status,
		).toBe(200);
		expect((await session(me.cookie))?.user.name).toBe("Renamed");

		// The passkey plugin is wired up: a fresh session may start a registration.
		expect(
			(
				await fetch(`${base}/api/auth/passkey/generate-register-options`, {
					headers: { Cookie: me.cookie },
				})
			).status,
		).toBe(200);
		expect(
			await (
				await fetch(`${base}/api/auth/passkey/list-user-passkeys`, {
					headers: { Cookie: me.cookie },
				})
			).json<unknown[]>(),
		).toEqual([]);

		// Enabling needs the password, and only a verified app code switches it on.
		expect(
			(
				await post(
					"/api/auth/two-factor/enable",
					{ password: "wrong" },
					me.cookie,
				)
			).status,
		).toBe(400);
		const enabled = await post(
			"/api/auth/two-factor/enable",
			{ password },
			me.cookie,
		);
		expect(enabled.status).toBe(200);
		const { totpURI, backupCodes } = (await enabled.json()) as {
			totpURI: string;
			backupCodes: string[];
		};
		expect(backupCodes.length).toBeGreaterThan(5);
		expect((await session(me.cookie))?.user.twoFactorEnabled).toBeFalsy();
		const secret = new URL(totpURI).searchParams.get("secret") ?? "";
		const activated = await post(
			"/api/auth/two-factor/verify-totp",
			{ code: await totp(secret) },
			me.cookie,
		);
		expect(activated.status).toBe(200);
		// Turning it on replaces the session with a new one.
		me.cookie = cookieOf(activated);
		expect((await session(me.cookie))?.user.twoFactorEnabled).toBe(true);

		// Password sign-in now stops at the code step, without a session.
		const signIn = async () => {
			const response = await post("/api/auth/sign-in/email", {
				email: me.email,
				password,
			});
			expect(response.status).toBe(200);
			expect(await response.json()).toMatchObject({ twoFactorRedirect: true });
			const pending = cookieOf(response);
			expect(await session(pending)).toBeNull();
			return pending;
		};
		const pending = await signIn();
		expect(
			(
				await post(
					"/api/auth/two-factor/verify-backup-code",
					{ code: "not-a-code" },
					pending,
				)
			).status,
		).toBe(401);
		const verified = await post(
			"/api/auth/two-factor/verify-backup-code",
			{ code: backupCodes[0] },
			pending,
		);
		expect(verified.status).toBe(200);
		const signedIn = cookieOf(verified);
		expect((await session(signedIn))?.user.email).toBe(me.email);
		// Each backup code works once.
		expect(
			(
				await post(
					"/api/auth/two-factor/verify-backup-code",
					{ code: backupCodes[0] },
					await signIn(),
				)
			).status,
		).toBe(401);

		// An unverified address changes only once the new one is confirmed by its link.
		const newEmail = `${crypto.randomUUID()}@chords.test`;
		expect(
			(
				await post(
					"/api/auth/change-email",
					{ newEmail, callbackURL: "/settings?email=changed" },
					signedIn,
				)
			).status,
		).toBe(200);
		expect((await session(signedIn))?.user.email).toBe(me.email);

		const sessions = (await (
			await fetch(`${base}/api/auth/list-sessions`, {
				headers: { Cookie: signedIn },
			})
		).json()) as { token: string }[];
		expect(sessions.length).toBeGreaterThanOrEqual(2);
		expect(
			(await post("/api/auth/revoke-other-sessions", {}, signedIn)).status,
		).toBe(200);
		expect(await session(me.cookie)).toBeNull();
		const disabled = await post(
			"/api/auth/two-factor/disable",
			{ password },
			signedIn,
		);
		expect(disabled.status).toBe(200);
		expect((await session(cookieOf(disabled)))?.user.twoFactorEnabled).toBe(
			false,
		);
	},
	60_000,
);

test.skipIf(!base)(
	"people delete their own account, unless they alone own a band",
	async () => {
		const me = await account("Leaving fixture");
		const bandName = `Solo band ${crypto.randomUUID()}`;
		const created = await post(
			"/api/bands",
			{ action: "create", name: bandName },
			me.cookie,
		);
		expect(created.status).toBe(200);
		const { band } = (await created.json()) as { band: { id: string } };

		expect(
			(await post("/api/auth/delete-user", { password: "wrong" }, me.cookie))
				.status,
		).toBe(400);
		const refused = await post(
			"/api/auth/delete-user",
			{ password },
			me.cookie,
		);
		expect(refused.status).toBe(409);
		expect(((await refused.json()) as { message: string }).message).toContain(
			bandName,
		);
		expect(await session(me.cookie)).not.toBeNull();

		await localSql(`DELETE FROM organization WHERE id='${band.id}'`);
		await localSql(
			`INSERT INTO twoFactor (id,secret,backupCodes,userId) VALUES ('${crypto.randomUUID()}','fixture','fixture','${me.id}')`,
		);
		expect(
			(await post("/api/auth/delete-user", { password }, me.cookie)).status,
		).toBe(200);
		expect(await session(me.cookie)).toBeNull();
		expect(
			(
				await post("/api/auth/sign-in/email", {
					email: me.email,
					password,
				})
			).status,
		).toBe(401);
	},
	60_000,
);

test.skipIf(!base)(
	"administrators email verification links to unverified accounts",
	async () => {
		const operator = await account("Reminder operator");
		const pending = await account("Unverified fixture");
		const done = await account("Verified fixture");
		await localSql(
			`UPDATE user SET role='admin', emailVerified=1 WHERE id='${operator.id}'; UPDATE user SET emailVerified=1 WHERE id='${done.id}'`,
		);
		const act = (body: Record<string, unknown>, cookie = operator.cookie) =>
			post("/api/admin", body, cookie);

		expect(
			(await act({ action: "remind_unverified" }, pending.cookie)).status,
		).toBe(403);
		const listed = (await (
			await fetch(`${base}/api/admin?view=users&filter=unverified`, {
				headers: { Cookie: operator.cookie },
			})
		).json()) as { users: { id: string }[]; unverified: number };
		expect(listed.unverified).toBeGreaterThanOrEqual(1);
		expect(listed.users.map((user) => user.id)).not.toContain(done.id);

		expect(
			(await act({ action: "resend_verification", userId: done.id })).status,
		).toBe(400);
		expect(
			(await act({ action: "resend_verification", userId: pending.id })).status,
		).toBe(200);

		let after = "";
		let sent = 0;
		for (;;) {
			const response = await act({ action: "remind_unverified", after });
			expect(response.status).toBe(200);
			const batch = (await response.json()) as {
				sent: number;
				failed: number;
				next: string | null;
			};
			expect(batch.failed).toBe(0);
			sent += batch.sent;
			if (!batch.next) break;
			after = batch.next;
		}
		expect(sent).toBeGreaterThanOrEqual(1);
		const audit = (await (
			await fetch(`${base}/api/admin?view=audit`, {
				headers: { Cookie: operator.cookie },
			})
		).json()) as { entries?: { action: string }[] };
		expect(JSON.stringify(audit)).toContain("remind_unverified");
	},
	120_000,
);
