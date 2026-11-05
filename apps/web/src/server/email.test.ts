import { expect, test } from "bun:test";
import { authEmail, sendEmail } from "./email";
import { localSql } from "./test-db";

test("auth mail is branded, contains text and escaped HTML links, uses the Mic Drop sender, and propagates delivery errors", async () => {
	const expected = {
		welcome: ["Welcome", "24 hours"],
		verify: ["Confirm", "24 hours"],
		reminder: ["Confirm", "7 days"],
		change: ["Approve", "24 hours"],
		reset: ["Reset", "one hour"],
	} as const;
	for (const [kind, [subject, expiry]] of Object.entries(expected) as [
		keyof typeof expected,
		(typeof expected)[keyof typeof expected],
	][]) {
		const url =
			'https://micdrop.day/api/auth/link?token=fixture&callbackURL="quoted"';
		const template = authEmail(kind, url, { newEmail: "<new@chords.test>" });
		expect(template.text).toContain(url);
		expect(template.html).toContain("&#38;callbackURL=&#34;quoted&#34;");
		expect(template.text).toContain(`expires in ${expiry}`);
		expect(template.subject).toContain(subject);
		// Branded layout: the logo and footer come from the deployment that sent the link.
		expect(template.html).toContain('src="https://micdrop.day/icon-192.png"');
		expect(template.html).toContain("Your chord sheets, in your key.");
		if (kind === "change") {
			expect(template.text).toContain("<new@chords.test>");
			expect(template.html).toContain("&#60;new@chords.test&#62;");
		}
		const message = { to: "fixture@chords.test", ...template };
		const result = await sendEmail(
			{
				send: async (sent) => {
					expect(sent).toEqual({ ...message, from: "welcome@micdrop.day" });
					return { messageId: "fixture-id" };
				},
			},
			message,
		);
		expect(result.messageId).toBe("fixture-id");
		await expect(
			sendEmail(
				{
					send: async () => {
						throw new Error("Delivery failed");
					},
				},
				message,
			),
		).rejects.toThrow("Delivery failed");
	}
});

const base = process.env.CHORDS_TEST_URL || "";
test.skipIf(!base)(
	"verification and recovery endpoints work; reset links expire, are single use and revoke sessions",
	async () => {
		const post = (path: string, body: unknown) =>
			fetch(`${base}/api/auth/${path}`, {
				method: "POST",
				headers: { "Content-Type": "application/json", Origin: base },
				body: JSON.stringify(body),
			});
		const email = `${crypto.randomUUID()}@chords.test`;
		const password = "email-integration-password-2026";
		const signup = await post("sign-up/email", {
			email,
			password,
			name: "Email fixture",
			callbackURL: "/login?action=verified",
		});
		expect(signup.status).toBe(200);
		const { user } = (await signup.json()) as {
			user: { id: string; emailVerified: boolean };
		};
		expect(user.emailVerified).toBe(false);
		const cookie = signup.headers
			.getSetCookie()
			.map((value) => value.split(";")[0])
			.join("; ");
		for (const address of [email, `${crypto.randomUUID()}@chords.test`]) {
			expect(
				(
					await post("send-verification-email", {
						email: address,
						callbackURL: "/login?action=verified",
					})
				).status,
			).toBe(200);
			expect(
				(
					await post("request-password-reset", {
						email: address,
						redirectTo: "/login?action=reset",
					})
				).status,
			).toBe(200);
		}
		expect(
			(
				await post("request-password-reset", {
					email,
					redirectTo: "https://evil.example/reset",
				})
			).status,
		).toBe(403);
		const invalid = await fetch(
			`${base}/api/auth/verify-email?token=invalid&callbackURL=/login?action=verified`,
			{ redirect: "manual" },
		);
		expect(invalid.headers.get("location")).toContain("error=");
		// Seed known local-only tokens so expiry/replay checks do not depend on an inbox or a secret.
		if (!/^[a-zA-Z0-9_-]+$/.test(user.id))
			throw new Error("Unexpected fixture user id");
		const token = crypto.randomUUID();
		const expired = crypto.randomUUID();
		await localSql(
			`INSERT INTO verification (id,identifier,value,expiresAt) VALUES ('${token}','reset-password:${token}','${user.id}','${new Date(Date.now() + 3600000).toISOString()}'), ('${expired}','reset-password:${expired}','${user.id}','1970-01-01T00:00:00.000Z')`,
		);
		const newPassword = "changed-integration-password-2026";
		for (const badToken of ["invalid", expired])
			expect(
				(await post("reset-password", { token: badToken, newPassword })).status,
			).toBe(400);
		expect(
			(await post("reset-password", { token, newPassword: "short" })).status,
		).toBe(400);
		const callback = await fetch(
			`${base}/api/auth/reset-password/${token}?callbackURL=${encodeURIComponent("/login?action=reset")}`,
			{ redirect: "manual" },
		);
		expect(callback.headers.get("location")).toContain(`token=${token}`);
		expect((await post("reset-password", { token, newPassword })).status).toBe(
			200,
		);
		expect((await post("reset-password", { token, newPassword })).status).toBe(
			400,
		);
		const session = await fetch(`${base}/api/auth/get-session`, {
			headers: { Cookie: cookie },
		});
		expect(await session.json()).toBeNull();
		expect((await post("sign-in/email", { email, password })).status).toBe(401);
		expect(
			(await post("sign-in/email", { email, password: newPassword })).status,
		).toBe(200);
	},
	60_000,
);
