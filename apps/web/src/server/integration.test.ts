import { expect, test } from "bun:test";
import {
	type Arrangement,
	type CataloguePage,
	type CatalogueSummary,
	copyArrangement,
} from "@chords/data";

const base = process.env.CHORDS_TEST_URL || "";
test.skipIf(!base)(
	"catalogue, stable repertoire copies, drafts, revisions, and band permissions",
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
			return { ...user, email, cookie };
		}
		const alice = await account("Catalogue owner");
		const bob = await account("Catalogue viewer");
		async function call(path: string, cookie = "", body?: unknown) {
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
		async function save(row: Arrangement, cookie = alice.cookie) {
			const response = await call("/api/sync", cookie, {
				id: crypto.randomUUID(),
				baseVersion: row.version,
				record: row,
			});
			expect(response.status).toBe(200);
			return ((await response.json()) as { record: Arrangement }).record;
		}
		const title = `Hallelujah ${crypto.randomUUID()}`;
		let source: Arrangement = {
			id: crypto.randomUUID(),
			owner: alice.id,
			kind: "arrangement",
			version: 0,
			archived: false,
			updatedAt: new Date().toISOString(),
			data: {
				title,
				artist: "Leonard Cohen",
				content: "[C]Unique lyric fragment",
				key: "C",
				sourceCapo: 0,
				tags: ["wedding"],
				sourceUrl: "",
				rawSource: "PRIVATE ORIGINAL IMPORT",
				copiedFrom: "",
				visibility: "public",
				privateNotes: "PRIVATE REHEARSAL",
				performanceKey: "F#",
			},
		};
		const firstOperation = {
			id: crypto.randomUUID(),
			baseVersion: 0,
			record: source,
		};
		const first = await call("/api/sync", alice.cookie, firstOperation);
		expect(first.status).toBe(200);
		source = ((await first.json()) as { record: Arrangement }).record;
		const replay = await call("/api/sync", alice.cookie, firstOperation);
		expect(
			((await replay.json()) as { record: Arrangement }).record.version,
		).toBe(1);
		const published = await call(`/api/publications?id=${source.id}`);
		expect(published.status).toBe(200);
		const detail = (
			(await published.json()) as { publication: CatalogueSummary }
		).publication;
		expect(detail.data.content).toBe(source.data.content);
		expect(detail.data.rawSource).toBe("");
		expect(detail.data.privateNotes).toBeUndefined();
		expect(detail.data.performanceKey).toBeUndefined();
		let cover = await save({
			...source,
			id: crypto.randomUUID(),
			version: 0,
			data: {
				...source.data,
				songId: source.id,
				artist: "Jeff Buckley",
				arrangementName: "Acoustic",
				content: "[G]Cover arrangement",
			},
		});
		const grouped = await call(
			`/api/publications?q=${encodeURIComponent(title)}`,
		);
		const page = (await grouped.json()) as CataloguePage;
		expect(page.groups[0]?.id).toBe(source.id);
		expect(page.groups[0]).toMatchObject({ id: source.id, count: 2 });
		expect(page.groups[0].artists).toContain("Jeff Buckley");
		const versions = await call(`/api/publications?song=${source.id}`);
		expect(
			((await versions.json()) as CataloguePage).publications.every(
				(p) => !p.data.content && !p.data.rawSource,
			),
		).toBe(true);
		const fuzzy = await call("/api/publications?q=Halelujah");
		expect(
			((await fuzzy.json()) as CataloguePage).groups.some(
				(group) => group.id === source.id,
			),
		).toBe(true);
		const lyrics = await call("/api/publications?q=Unique%20lyric%20fragment");
		expect(
			((await lyrics.json()) as CataloguePage).groups.some(
				(group) => group.id === source.id,
			),
		).toBe(true);
		const privateCopy = await save(copyArrangement(source, bob.id), bob.cookie);
		expect(privateCopy.data.visibility).toBe("private");
		expect((await call(`/api/publications?id=${privateCopy.id}`)).status).toBe(
			404,
		);
		await call("/api/publications", bob.cookie, {
			action: "publish",
			recordId: privateCopy.id,
		});
		const unchanged = await call(`/api/publications?song=${source.id}`);
		expect(
			((await unchanged.json()) as CataloguePage).publications,
		).toHaveLength(2);
		source = await save({
			...source,
			data: { ...source.data, content: "[D]Public updated version" },
		});
		expect(
			(
				(await (await call(`/api/publications?id=${source.id}`)).json()) as {
					publication: CatalogueSummary;
				}
			).publication.data.content,
		).toBe("[D]Public updated version");
		source = await save({
			...source,
			data: {
				...source.data,
				draft: true,
				content: "[F]Unfinished private revision",
			},
		});
		expect(
			(
				(await (await call(`/api/publications?id=${source.id}`)).json()) as {
					publication: CatalogueSummary;
				}
			).publication.data.content,
		).toBe("[D]Public updated version");
		const stale = await call("/api/sync", alice.cookie, {
			id: crypto.randomUUID(),
			baseVersion: 1,
			record: {
				...source,
				data: { ...source.data, draft: false, content: "REJECTED" },
			},
		});
		expect(stale.status).toBe(409);
		expect(
			(
				(await (await call(`/api/publications?id=${source.id}`)).json()) as {
					publication: CatalogueSummary;
				}
			).publication.data.content,
		).not.toBe("REJECTED");
		source = await save({ ...source, data: { ...source.data, draft: false } });
		expect(
			(
				(await (await call(`/api/publications?id=${source.id}`)).json()) as {
					publication: CatalogueSummary;
				}
			).publication.data.content,
		).toBe("[F]Unfinished private revision");
		const forbidden = await call("/api/sync", bob.cookie, {
			id: crypto.randomUUID(),
			baseVersion: source.version,
			record: source,
		});
		expect(forbidden.status).toBe(403);
		const bobRows = (
			(await (await call("/api/sync", bob.cookie)).json()) as {
				records: Arrangement[];
			}
		).records;
		expect(bobRows.find((row) => row.id === privateCopy.id)?.data.content).toBe(
			"[C]Unique lyric fragment",
		);
		expect(bobRows.some((row) => row.id === source.id)).toBe(false);
		expect(
			(
				await call("/api/publications", bob.cookie, {
					action: "vote",
					id: cover.id,
					value: -1,
				})
			).status,
		).toBe(200);
		const votes = (await (
			await call(`/api/publications?song=${source.id}`, bob.cookie)
		).json()) as CataloguePage;
		expect(votes.publications.find((p) => p.id === cover.id)).toMatchObject({
			score: -1,
			myVote: -1,
		});
		expect(
			(
				await call("/api/publications", bob.cookie, {
					action: "report",
					id: cover.id,
					reason: "Incorrect song group",
				})
			).status,
		).toBe(200);
		expect((await call("/api/publications?admin=1", bob.cookie)).status).toBe(
			403,
		);
		expect(
			(
				await call("/api/publications", bob.cookie, {
					action: "hide",
					id: cover.id,
					hidden: true,
				})
			).status,
		).toBe(403);
		const bandResponse = await call("/api/bands", alice.cookie, {
			action: "create",
			name: "Catalogue band",
		});
		const { band } = (await bandResponse.json()) as { band: { id: string } };
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
		let bandSong = await save(copyArrangement(cover, band.id));
		expect(
			(
				await call("/api/publications", bob.cookie, {
					action: "publish",
					recordId: bandSong.id,
				})
			).status,
		).toBe(403);
		// Promote the same member; editors can edit and publish their band's own arrangements.
		expect(
			(
				await call("/api/bands", alice.cookie, {
					action: "add",
					bandId: band.id,
					email: bob.email,
					role: "editor",
				})
			).status,
		).toBe(200);
		bandSong = await save(
			{
				...bandSong,
				data: {
					...bandSong.data,
					content: "[A]Band bridge",
					visibility: "public",
				},
			},
			bob.cookie,
		);
		expect((await call(`/api/publications?id=${bandSong.id}`)).status).toBe(
			200,
		);
		expect(
			(
				await call("/api/publications", alice.cookie, {
					action: "unpublish",
					id: source.id,
				})
			).status,
		).toBe(200);
		expect((await call(`/api/publications?id=${source.id}`)).status).toBe(404);
		const after = (
			(await (await call("/api/sync", bob.cookie)).json()) as {
				records: Arrangement[];
			}
		).records;
		expect(after.find((row) => row.id === privateCopy.id)?.data.content).toBe(
			"[C]Unique lyric fragment",
		);
		// A new unreviewed draft never leaks into anonymous search or direct reads.
		cover = await save({
			...cover,
			data: { ...cover.data, visibility: "private" },
		});
		const draft = await save({
			...source,
			id: crypto.randomUUID(),
			version: 0,
			data: {
				...source.data,
				title: `Private draft ${crypto.randomUUID()}`,
				visibility: "public",
				draft: true,
			},
		});
		expect((await call(`/api/publications?id=${draft.id}`)).status).toBe(404);
		expect((await call(`/api/publications?id=${cover.id}`)).status).toBe(404);
		// Provision only this test's account in the local D1 fixture; never grant real users access.
		if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
			throw new Error("Integration checks must use a local app.");
		if (!/^[a-zA-Z0-9_-]+$/.test(alice.id))
			throw new Error("Unexpected fixture user id.");
		const root = new URL("../../../../", import.meta.url).pathname;
		const provision = Bun.spawn(
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
				`INSERT INTO catalogue_admins(user_id) VALUES('${alice.id}')`,
			],
			{ cwd: root, stdout: "pipe", stderr: "pipe" },
		);
		const [exit, stderr] = await Promise.all([
			provision.exited,
			new Response(provision.stderr).text(),
		]);
		if (exit) throw new Error(`Local fixture provisioning failed: ${stderr}`);
		const reports = (await (
			await call("/api/publications?admin=1", alice.cookie)
		).json()) as { reports: { id: string; publication_id: string }[] };
		expect(
			reports.reports.some((report) => report.publication_id === cover.id),
		).toBe(true);
		expect(
			(
				await call("/api/publications", alice.cookie, {
					action: "hide",
					id: bandSong.id,
					hidden: true,
				})
			).status,
		).toBe(200);
		expect((await call(`/api/publications?id=${bandSong.id}`)).status).toBe(
			404,
		);
		bandSong = await save(
			{
				...bandSong,
				data: { ...bandSong.data, content: "[G]Still moderated" },
			},
			bob.cookie,
		);
		expect((await call(`/api/publications?id=${bandSong.id}`)).status).toBe(
			404,
		);
		expect(
			(
				await call("/api/publications", alice.cookie, {
					action: "hide",
					id: bandSong.id,
					hidden: false,
				})
			).status,
		).toBe(200);
		expect((await call(`/api/publications?id=${bandSong.id}`)).status).toBe(
			200,
		);
		const target = await save({
			...source,
			id: crypto.randomUUID(),
			version: 0,
			data: {
				...source.data,
				songId: undefined,
				title: "Merge target",
				visibility: "private",
				draft: false,
			},
		});
		expect(
			(
				await call("/api/publications", alice.cookie, {
					action: "merge",
					source: source.id,
					target: target.id,
				})
			).status,
		).toBe(200);
		const merged = (
			(await (await call("/api/sync", bob.cookie)).json()) as {
				records: Arrangement[];
			}
		).records;
		expect(merged.find((row) => row.id === privateCopy.id)?.data).toMatchObject(
			{ songId: target.id, content: "[C]Unique lyric fragment" },
		);
		const alias = (await (
			await call(`/api/publications?song=${source.id}`)
		).json()) as CataloguePage;
		expect(alias.publications.some((row) => row.id === bandSong.id)).toBe(true);
		const savedBand = await save(
			copyArrangement(
				{ ...bandSong, data: { ...bandSong.data, songId: target.id } },
				bob.id,
			),
			bob.cookie,
		);
		const destination = await save({
			...draft,
			id: crypto.randomUUID(),
			version: 0,
			data: { ...draft.data, songId: undefined },
		});
		expect(
			(
				await call("/api/publications", alice.cookie, {
					action: "regroup",
					id: bandSong.id,
					target: destination.id,
				})
			).status,
		).toBe(200);
		const regrouped = (
			(await (await call("/api/sync", bob.cookie)).json()) as {
				records: Arrangement[];
			}
		).records;
		expect(regrouped.find((row) => row.id === savedBand.id)?.data.songId).toBe(
			destination.id,
		);
		expect(
			(
				await call("/api/publications", alice.cookie, {
					action: "resolve",
					id: reports.reports.find(
						(report) => report.publication_id === cover.id,
					)?.id,
				})
			).status,
		).toBe(200);
	},
	60_000,
);
