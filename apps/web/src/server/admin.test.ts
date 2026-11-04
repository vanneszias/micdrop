import { expect, test } from "bun:test";

const base = process.env.CHORDS_TEST_URL || "";

async function account(name: string, extra: Record<string, unknown> = {}) {
	const email = `${crypto.randomUUID()}@chords.test`;
	const response = await fetch(`${base}/api/auth/sign-up/email`, {
		method: "POST",
		headers: { "Content-Type": "application/json", Origin: base },
		body: JSON.stringify({
			name,
			email,
			password: "integration-test-password-2026",
			...extra,
		}),
	});
	const cookie = response.headers
		.getSetCookie()
		.map((value) => value.split(";")[0])
		.join("; ");
	const body = (await response.json()) as { user?: { id: string } };
	return { status: response.status, id: body.user?.id ?? "", email, cookie };
}

const admin = (path: string, cookie = "") =>
	fetch(`${base}/api/admin?${path}`, { headers: { Cookie: cookie } });

/** Grants a role in the local D1 fixture only; never against a deployed database. */
async function sql(command: string) {
	if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
		throw new Error("Integration checks must use a local app.");
	const root = new URL("../../../../", import.meta.url).pathname;
	const process_ = Bun.spawn(
		[
			`${root}apps/web/node_modules/.bin/wrangler`,
			"d1",
			"execute",
			"chords",
			"--cwd",
			"apps/web",
			"--local",
			"--persist-to",
			process.env.CHORDS_TEST_D1_STATE || `${root}apps/web/.wrangler/state`,
			"--command",
			command,
		],
		{ cwd: root, stdout: "pipe", stderr: "pipe" },
	);
	const [exit, stderr] = await Promise.all([
		process_.exited,
		new Response(process_.stderr).text(),
	]);
	if (exit) throw new Error(`Local fixture provisioning failed: ${stderr}`);
}

test.skipIf(!base)(
	"platform administration is gated, audited and never leaks session tokens",
	async () => {
		const operator = await account("Platform operator");
		const regular = await account("Regular musician");
		// Better Auth marks role as non-input, so sign-up cannot self-promote.
		const sneaky = await account("Sneaky", { role: "admin" });
		for (const created of [operator, regular]) expect(created.status).toBe(200);
		expect([200, 400]).toContain(sneaky.status);

		expect((await admin("view=overview")).status).toBe(401);
		expect((await admin("view=overview", regular.cookie)).status).toBe(403);
		if (sneaky.cookie)
			expect((await admin("view=overview", sneaky.cookie)).status).toBe(403);

		if (!/^[a-zA-Z0-9_-]+$/.test(operator.id))
			throw new Error("Unexpected fixture user id.");
		await sql(`UPDATE user SET role='admin' WHERE id='${operator.id}'`);

		const overview = await admin("view=overview", operator.cookie);
		expect(overview.status).toBe(200);
		expect(overview.headers.get("Cache-Control")).toBe("no-store");
		const { totals } = (await overview.json()) as {
			totals: { users: number };
		};
		expect(totals.users).toBeGreaterThanOrEqual(2);

		const found = (await (
			await admin(
				`view=users&query=${encodeURIComponent(regular.email)}`,
				operator.cookie,
			)
		).json()) as { users: { id: string }[] };
		expect(found.users.map((user) => user.id)).toEqual([regular.id]);
		// LIKE wildcards in the search are literal, so "%" does not list everyone.
		const wildcard = (await (
			await admin("view=users&query=%25", operator.cookie)
		).json()) as { users: unknown[] };
		expect(wildcard.users).toEqual([]);
		expect((await admin("view=users&sort=drop", operator.cookie)).status).toBe(
			400,
		);

		const first = await admin(`view=user&id=${regular.id}`, operator.cookie);
		expect(first.status).toBe(200);
		const text = await first.text();
		const token = decodeURIComponent(
			regular.cookie.split("=")[1]?.split(".")[0] ?? "",
		);
		expect(token.length).toBeGreaterThan(10);
		expect(text).not.toContain(token);
		expect(JSON.parse(text).sessions.length).toBeGreaterThan(0);

		const second = (await (
			await admin(`view=user&id=${regular.id}`, operator.cookie)
		).json()) as { audit: { action: string; adminName: string }[] };
		expect(second.audit[0]).toMatchObject({
			action: "view_user",
			adminName: "Platform operator",
		});
		expect((await admin("view=user&id=missing", operator.cookie)).status).toBe(
			404,
		);

		// Platform administrators moderate the catalogue as well.
		const catalogue = (await (
			await fetch(`${base}/api/publications`, {
				headers: { Cookie: operator.cookie },
			})
		).json()) as { admin: boolean };
		expect(catalogue.admin).toBe(true);
	},
	60_000,
);
