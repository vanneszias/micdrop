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

test.skipIf(!base)(
	"administrators browse everything, revoke links, disable clients and hard delete",
	async () => {
		const operator = await account("Cleanup operator");
		const alice = await account("Spammy Alice");
		const bob = await account("Bystander Bob");
		if (!/^[a-zA-Z0-9_-]+$/.test(operator.id))
			throw new Error("Unexpected fixture user id.");
		await localSql(`UPDATE user SET role='admin' WHERE id='${operator.id}'`);
		const json = async <T>(response: Response | Promise<Response>) => {
			const resolved = await response;
			expect(resolved.status).toBe(200);
			return (await resolved.json()) as T;
		};
		const bandName = `Spam band ${crypto.randomUUID()}`;
		const { band } = await json<{ band: { id: string } }>(
			post("/api/bands", alice.cookie, { action: "create", name: bandName }),
		);
		const save = (record: ReturnType<typeof arrangement>) =>
			json(
				post("/api/sync", alice.cookie, {
					id: crypto.randomUUID(),
					baseVersion: 0,
					record,
				}),
			);
		const personal = arrangement(alice.id, `Spam ${crypto.randomUUID()}`);
		const bandSong = arrangement(band.id, `Band spam ${crypto.randomUUID()}`);
		await save(personal);
		await save(bandSong);
		const { link } = await json<{ link: { id: string } }>(
			post("/api/shares", alice.cookie, {
				action: "share",
				recordId: personal.id,
			}),
		);
		await json(
			post("/api/publications", bob.cookie, {
				action: "vote",
				id: personal.id,
				value: 1,
			}),
		);
		await json(
			post("/api/publications", bob.cookie, {
				action: "report",
				id: personal.id,
				reason: "Looks like spam",
			}),
		);

		const view = <T>(query: string) => json<T>(admin(query, operator.cookie));
		const bands = await view<{ rows: { id: string }[] }>(
			`view=bands&query=${encodeURIComponent(bandName)}`,
		);
		expect(bands.rows.map((row) => row.id)).toEqual([band.id]);
		const bandView = await view<{ records: { id: string }[] }>(
			`view=band&id=${band.id}`,
		);
		expect(bandView.records.map((row) => row.id)).toEqual([bandSong.id]);
		const records = await view<{ rows: { id: string }[] }>(
			`view=records&query=${encodeURIComponent(personal.data.title)}`,
		);
		expect(records.rows.map((row) => row.id)).toEqual([personal.id]);
		const opened = await view<{
			record: { data: { content: string } };
			revisions: unknown[];
		}>(`view=record&id=${personal.id}`);
		expect(opened.record.data.content).toBe(personal.data.content);

		// Share links are listed by rowid, never by the secret in their URL.
		const linksResponse = await admin("view=links", operator.cookie);
		const linksText = await linksResponse.text();
		expect(linksText).not.toContain(link.id);
		const shared = (
			JSON.parse(linksText) as {
				rows: { ref: number; target: string }[];
			}
		).rows.find((row) => row.target === personal.id);
		expect(shared).toBeDefined();
		expect(
			(
				await post("/api/admin", operator.cookie, {
					action: "revoke_share",
					ref: shared?.ref,
				})
			).status,
		).toBe(200);
		expect(
			(await fetch(`${base}/api/shares?token=${encodeURIComponent(link.id)}`))
				.status,
		).toBe(404);

		const registered = await post("/api/auth/oauth2/register", "", {
			client_name: "Spam assistant",
			redirect_uris: ["https://spam.chords.test/callback"],
			token_endpoint_auth_method: "none",
			grant_types: ["authorization_code"],
			response_types: ["code"],
		});
		expect(registered.status).toBe(201);
		const registration = (await registered.json()) as { client_id: string };
		expect(
			(
				await post("/api/admin", operator.cookie, {
					action: "disable_client",
					clientId: registration.client_id,
					disabled: true,
				})
			).status,
		).toBe(200);
		const clients = await view<{
			rows: { clientId: string; disabled: number; userId: string | null }[];
		}>("view=clients");
		expect(
			clients.rows.find((row) => row.clientId === registration.client_id),
		).toMatchObject({ disabled: 1, userId: null });

		const remove = (body: Record<string, unknown>) =>
			post("/api/admin", operator.cookie, body).then((r) => r.status);
		expect(
			await remove({ action: "delete_user", userId: alice.id, confirm: "no" }),
		).toBe(422);
		// Alice is the only owner of her band, so the band has to go first.
		expect(
			await remove({
				action: "delete_user",
				userId: alice.id,
				confirm: alice.email.toUpperCase(),
			}),
		).toBe(409);
		expect(
			await remove({ action: "delete_band", bandId: band.id, confirm: "x" }),
		).toBe(422);
		expect(
			await remove({
				action: "delete_band",
				bandId: band.id,
				confirm: bandName,
			}),
		).toBe(200);
		expect(
			(await admin(`view=band&id=${band.id}`, operator.cookie)).status,
		).toBe(404);
		expect(
			(await admin(`view=record&id=${bandSong.id}`, operator.cookie)).status,
		).toBe(404);
		expect(
			await remove({
				action: "delete_user",
				userId: alice.id,
				confirm: alice.email,
			}),
		).toBe(200);
		expect(
			(await fetch(`${base}/api/bands`, { headers: { Cookie: alice.cookie } }))
				.status,
		).toBe(401);
		expect(
			(await admin(`view=record&id=${personal.id}`, operator.cookie)).status,
		).toBe(404);
		expect(
			(await fetch(`${base}/api/publications?id=${personal.id}`)).status,
		).toBe(404);
		// Bob, who voted on and reported her song, is untouched.
		expect(
			(await fetch(`${base}/api/bands`, { headers: { Cookie: bob.cookie } }))
				.status,
		).toBe(200);
		const audit = await view<{ rows: { action: string; targetId: string }[] }>(
			"view=audit",
		);
		const recent = audit.rows.map((row) => `${row.action}:${row.targetId}`);
		expect(recent).toContain(`delete_user:${alice.id}`);
		expect(recent).toContain(`delete_band:${band.id}`);
		expect(recent).toContain(`disable_client:${registration.client_id}`);
	},
	60_000,
);

test.skipIf(!base)(
	"paid imports, libraries and bands stop at their quotas and show up for administrators",
	async () => {
		const operator = await account("Quota operator");
		const heavy = await account("Heavy importer");
		for (const id of [operator.id, heavy.id])
			if (!/^[a-zA-Z0-9_-]+$/.test(id))
				throw new Error("Unexpected fixture user id.");
		const now = Date.now();
		const fill = (kind: string, count: number) =>
			`WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i<${count}) INSERT INTO usage_events SELECT '${heavy.id}','${kind}',${now} FROM n;`;
		await localSql(
			[
				`UPDATE user SET role='admin' WHERE id='${operator.id}';`,
				fill("pdf_import", 20),
				fill("url_import", 100),
				`WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i<5000) INSERT INTO records (id,kind,owner,version,updated_at,archived,data,last_operation) SELECT '${heavy.id}-'||i,'setlist','${heavy.id}',1,'2026-01-01T00:00:00.000Z',0,'{"title":"Filler","songs":[]}','fixture' FROM n;`,
				`WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i<10) INSERT INTO organization (id,name,slug,createdAt) SELECT '${heavy.id}-band-'||i,'Filler band','${heavy.id}-band-'||i,'2026-01-01T00:00:00.000Z' FROM n;`,
				`WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i<10) INSERT INTO member (id,organizationId,userId,role,createdAt) SELECT '${heavy.id}-member-'||i,'${heavy.id}-band-'||i,'${heavy.id}','owner','2026-01-01T00:00:00.000Z' FROM n;`,
			].join(" "),
		);

		const pdf = await fetch(`${base}/api/import-pdf`, {
			method: "POST",
			headers: {
				Cookie: heavy.cookie,
				Origin: base,
				"Content-Type": "application/pdf",
			},
			body: "%PDF-1.4 not really",
		});
		expect(pdf.status).toBe(429);
		const page = await post("/api/import", heavy.cookie, {
			url: "https://example.com/song",
		});
		expect(page.status).toBe(429);
		expect(((await page.json()) as { error: string }).error).toContain(
			"100 page imports per day",
		);
		const record = await post("/api/sync", heavy.cookie, {
			id: crypto.randomUUID(),
			baseVersion: 0,
			record: arrangement(heavy.id, "One too many"),
		});
		expect(record.status).toBe(429);
		const band = await post("/api/bands", heavy.cookie, {
			action: "create",
			name: "Eleventh band",
		});
		expect(band.status).toBe(403);
		// Better Auth's own endpoint applies the same band limit.
		expect(
			(
				await post("/api/auth/organization/create", heavy.cookie, {
					name: "Eleventh band",
					slug: `eleventh-${crypto.randomUUID()}`,
				})
			).status,
		).toBe(403);

		const overview = (await (
			await admin("view=overview", operator.cookie)
		).json()) as {
			quotaUsage: { subject: string; kind: string; used: number }[];
		};
		expect(overview.quotaUsage).toContainEqual(
			expect.objectContaining({
				subject: heavy.id,
				kind: "pdf_import",
				used: 20,
				limit: 20,
			}),
		);
		const detail = (await (
			await admin(`view=user&id=${heavy.id}`, operator.cookie)
		).json()) as {
			usage: { kind: string; used: number; limit: number }[];
			recordTotals: { total: number };
		};
		expect(detail.recordTotals.total).toBe(5000);
		expect(detail.usage).toContainEqual({
			kind: "url_import",
			used: 100,
			limit: 100,
		});
	},
	120_000,
);

test.skipIf(!base)(
	"sign-in attempts are rate limited per client IP",
	async () => {
		// Cloudflare sets cf-connecting-ip in production; locally the test supplies it.
		const ip = `198.51.100.${Math.floor(Math.random() * 250) + 1}`;
		const attempt = () =>
			fetch(`${base}/api/auth/sign-in/email`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Origin: base,
					"cf-connecting-ip": ip,
				},
				body: JSON.stringify({
					email: `${crypto.randomUUID()}@chords.test`,
					password: "wrong-password-attempt",
				}),
			}).then((response) => response.status);
		const statuses: number[] = [];
		for (let index = 0; index < 11; index++) statuses.push(await attempt());
		expect(statuses.slice(0, 10).every((status) => status === 401)).toBe(true);
		expect(statuses[10]).toBe(429);
	},
	60_000,
);
