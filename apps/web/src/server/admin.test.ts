import { expect, test } from "bun:test";
import { localSql } from "./test-db";

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
		await localSql(`UPDATE user SET role='admin' WHERE id='${operator.id}'`);

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

/** Better Auth clears a cookie and sets it again in one response; the last value wins. */
function cookiesFrom(response: Response) {
	const jar = new Map<string, string>();
	for (const header of response.headers.getSetCookie()) {
		const [pair = ""] = header.split(";");
		const name = pair.slice(0, pair.indexOf("="));
		if (/max-age=0/i.test(header)) jar.delete(name);
		else jar.set(name, pair);
	}
	return [...jar.values()].join("; ");
}

async function post(path: string, cookie: string, body: unknown) {
	return fetch(`${base}${path}`, {
		method: "POST",
		headers: {
			Cookie: cookie,
			Origin: base,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(body),
	});
}

const signIn = (email: string) =>
	post("/api/auth/sign-in/email", "", {
		email,
		password: "integration-test-password-2026",
	});

function arrangement(owner: string, title: string) {
	return {
		id: crypto.randomUUID(),
		owner,
		kind: "arrangement",
		version: 0,
		archived: false,
		updatedAt: new Date().toISOString(),
		data: {
			title,
			artist: "Ban Test",
			content: `[G]${crypto.randomUUID()}`,
			key: "G",
			sourceCapo: 0,
			tags: [],
			sourceUrl: "",
			rawSource: "",
			copiedFrom: "",
			visibility: "public",
		},
	};
}

test.skipIf(!base)(
	"bans, sign-outs and impersonation are enforced and logged",
	async () => {
		const operator = await account("Ban operator");
		const target = await account("Ban target");
		const colleague = await account("Fellow operator");
		for (const id of [operator.id, colleague.id])
			if (!/^[a-zA-Z0-9_-]+$/.test(id))
				throw new Error("Unexpected fixture user id.");
		await localSql(
			`UPDATE user SET role='admin' WHERE id IN ('${operator.id}','${colleague.id}')`,
		);
		const song = arrangement(target.id, `Banned song ${crypto.randomUUID()}`);
		const saved = await post("/api/sync", target.cookie, {
			id: crypto.randomUUID(),
			baseVersion: 0,
			record: song,
		});
		expect(saved.status).toBe(200);
		const published = () =>
			fetch(`${base}/api/publications?id=${song.id}`).then((r) => r.status);
		expect(await published()).toBe(200);

		const act = (cookie: string, body: Record<string, unknown>) =>
			post("/api/admin", cookie, body).then((r) => r.status);
		expect(
			await act(target.cookie, {
				action: "ban",
				userId: operator.id,
				reason: "Not allowed",
			}),
		).toBe(403);
		expect(
			await act(operator.cookie, {
				action: "ban",
				userId: colleague.id,
				reason: "Administrators are protected",
			}),
		).toBe(403);
		expect(
			await act(operator.cookie, {
				action: "ban",
				userId: operator.id,
				reason: "Not myself",
			}),
		).toBe(400);

		// Only administrators impersonate, and an impersonated session is not an administrator.
		expect(
			(
				await post("/api/auth/admin/impersonate-user", target.cookie, {
					userId: operator.id,
				})
			).status,
		).toBe(403);
		const impersonation = await post(
			"/api/auth/admin/impersonate-user",
			operator.cookie,
			{ userId: target.id },
		);
		expect(impersonation.status).toBe(200);
		const actingAs = cookiesFrom(impersonation);
		const session = (await (
			await fetch(`${base}/api/auth/get-session`, {
				headers: { Cookie: actingAs },
			})
		).json()) as { user: { id: string }; session: { impersonatedBy: string } };
		expect(session.user.id).toBe(target.id);
		expect(session.session.impersonatedBy).toBe(operator.id);
		expect((await admin("view=overview", actingAs)).status).toBe(403);
		const written = await post("/api/sync", actingAs, {
			id: crypto.randomUUID(),
			baseVersion: 0,
			record: arrangement(target.id, "Written while impersonating"),
		});
		expect(written.status).toBe(200);

		expect(
			await act(operator.cookie, {
				action: "ban",
				userId: target.id,
				reason: "Spam",
				days: 1,
			}),
		).toBe(200);
		expect(
			(await fetch(`${base}/api/bands`, { headers: { Cookie: target.cookie } }))
				.status,
		).toBe(401);
		expect(
			(await fetch(`${base}/api/bands`, { headers: { Cookie: actingAs } }))
				.status,
		).toBe(401);
		const refused = await signIn(target.email);
		expect(refused.status).toBe(403);
		expect(((await refused.json()) as { code: string }).code).toBe(
			"BANNED_USER",
		);
		expect(await published()).toBe(404);

		const { audit } = (await (
			await admin(`view=user&id=${target.id}`, operator.cookie)
		).json()) as { audit: { action: string }[] };
		const actions = audit.map((entry) => entry.action);
		for (const action of ["ban", "impersonated_write", "impersonate"])
			expect(actions).toContain(action);

		expect(
			await act(operator.cookie, { action: "unban", userId: target.id }),
		).toBe(200);
		expect(await published()).toBe(200);
		const back = await signIn(target.email);
		expect(back.status).toBe(200);
		const fresh = cookiesFrom(back);
		expect(
			await act(operator.cookie, { action: "sign_out", userId: target.id }),
		).toBe(200);
		expect(
			(await fetch(`${base}/api/bands`, { headers: { Cookie: fresh } })).status,
		).toBe(401);
	},
	60_000,
);
