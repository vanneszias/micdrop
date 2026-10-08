import { expect, test } from "bun:test";
import type { Arrangement } from "@chords/data";

const base = process.env.CHORDS_TEST_URL || "";
test.skipIf(!base)(
	"D1 sync enforces revisions, replay, permissions, publishing, and voting",
	async () => {
		async function account(name: string) {
			const email = `${crypto.randomUUID()}@chords.test`;
			const response = await fetch(`${base}/api/auth/sign-up/email`, {
				method: "POST",
				headers: { "Content-Type": "application/json", Origin: base },
				body: JSON.stringify({
					name,
					email,
					password: "integration-test-password-2026",
				}),
			});
			expect(response.status).toBe(200);
			const cookie = response.headers
				.getSetCookie()
				.map((value) => value.split(";")[0])
				.join("; ");
			const { user } = (await response.json()) as { user: { id: string } };
			return { id: user.id, cookie, email };
		}
		const alice = await account("Integration owner");
		const bob = await account("Integration viewer");
		async function call(path: string, cookie: string, body?: unknown) {
			return fetch(`${base}${path}`, {
				method: body ? "POST" : "GET",
				headers: {
					Cookie: cookie,
					Origin: base,
					"Content-Type": "application/json",
				},
				body: body ? JSON.stringify(body) : undefined,
			});
		}
		const row: Arrangement = {
			id: crypto.randomUUID(),
			kind: "arrangement",
			owner: alice.id,
			version: 0,
			updatedAt: new Date().toISOString(),
			archived: false,
			data: {
				title: `Fixture ${crypto.randomUUID()}`,
				artist: "Original test sheet",
				content: "[D]Original lyrics",
				key: "D",
				sourceCapo: 0,
				tags: [],
				sourceUrl: "",
				rawSource: "",
				copiedFrom: "",
			},
		};
		const operation = { id: crypto.randomUUID(), baseVersion: 0, record: row };
		const first = await call("/api/sync", alice.cookie, operation);
		expect(first.status).toBe(200);
		expect(
			((await first.json()) as { record: Arrangement }).record.version,
		).toBe(1);
		const replay = await call("/api/sync", alice.cookie, operation);
		expect(
			((await replay.json()) as { record: Arrangement }).record.version,
		).toBe(1);
		const duplicate = await call("/api/sync", alice.cookie, {
			id: crypto.randomUUID(),
			baseVersion: 0,
			record: {
				...row,
				id: crypto.randomUUID(),
				data: { ...row.data, title: `  ${row.data.title.toUpperCase()}  ` },
			},
		});
		expect(duplicate.status).toBe(422);
		const concurrentRow = {
			...row,
			data: { ...row.data, title: `Concurrent ${crypto.randomUUID()}` },
		};
		const concurrent = await Promise.all(
			[0, 1].map(() =>
				call("/api/sync", alice.cookie, {
					id: crypto.randomUUID(),
					baseVersion: 0,
					record: { ...concurrentRow, id: crypto.randomUUID() },
				}),
			),
		);
		expect(concurrent.map((response) => response.status).sort()).toEqual([
			200, 422,
		]);
		const winner = concurrent.find((response) => response.status === 200);
		const { record: concurrentSong } = (await winner?.json()) as {
			record: Arrangement;
		};
		const duplicateEdit = await call("/api/sync", alice.cookie, {
			id: crypto.randomUUID(),
			baseVersion: concurrentSong.version,
			record: { ...concurrentSong, data: row.data },
		});
		expect(duplicateEdit.status).toBe(422);
		const savedRows = await call("/api/sync", alice.cookie);
		expect(
			((await savedRows.json()) as { records: Arrangement[] }).records.find(
				(record) => record.id === concurrentSong.id,
			),
		).toMatchObject({ version: 1, data: concurrentRow.data });
		const stale = await call("/api/sync", alice.cookie, {
			...operation,
			id: crypto.randomUUID(),
			record: { ...row, data: { ...row.data, content: "[G]Stale edit" } },
		});
		expect(stale.status).toBe(409);
		expect(
			((await stale.json()) as { server: Arrangement }).server.data.content,
		).toBe("[D]Original lyrics");
		const forbidden = await call("/api/sync", bob.cookie, {
			...operation,
			id: crypto.randomUUID(),
			baseVersion: 1,
		});
		expect(forbidden.status).toBe(403);
		const privateRows = await call("/api/sync", bob.cookie);
		expect(
			((await privateRows.json()) as { records: Arrangement[] }).records.some(
				(record) => record.id === row.id,
			),
		).toBe(false);
		const published = await call("/api/publications", alice.cookie, {
			action: "publish",
			recordId: row.id,
		});
		expect(published.status).toBe(200);
		const { id } = (await published.json()) as { id: string };
		expect(
			(
				await call("/api/publications", bob.cookie, {
					action: "vote",
					id,
					value: 1,
				})
			).status,
		).toBe(200);
		expect(
			(
				await call("/api/publications", bob.cookie, {
					action: "vote",
					id,
					value: -1,
				})
			).status,
		).toBe(200);
		const catalog = await call(
			`/api/publications?q=${encodeURIComponent(row.data.title)}`,
			bob.cookie,
		);
		const { publications } = (await catalog.json()) as {
			publications: { id: string; score: number; myVote: number }[];
		};
		expect(
			publications.find((publication) => publication.id === id),
		).toMatchObject({ score: -1, myVote: -1 });
		const created = await call("/api/bands", alice.cookie, {
			action: "create",
			name: "Integration band",
		});
		expect(created.status).toBe(200);
		const { band } = (await created.json()) as { band: { id: string } };
		expect(
			(
				await call("/api/bands", alice.cookie, {
					action: "add",
					bandId: band.id,
					email: bob.email,
					role: "viewer",
				})
			).status,
		).toBe(200);
		const bandRow = { ...row, id: crypto.randomUUID(), owner: band.id };
		expect(
			(
				await call("/api/sync", alice.cookie, {
					id: crypto.randomUUID(),
					baseVersion: 0,
					record: bandRow,
				})
			).status,
		).toBe(200);
		expect(
			(
				await call("/api/sync", bob.cookie, {
					id: crypto.randomUUID(),
					baseVersion: 1,
					record: bandRow,
				})
			).status,
		).toBe(403);
		expect(
			(
				await call("/api/publications", bob.cookie, {
					action: "publish",
					recordId: bandRow.id,
				})
			).status,
		).toBe(403);
	},
	30_000,
);
