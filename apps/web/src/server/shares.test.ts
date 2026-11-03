import { expect, test } from "bun:test";
import type { Arrangement, Setlist } from "@chords/data";

const base = process.env.CHORDS_TEST_URL || "";
test.skipIf(!base)(
	"share links expose records read-only and invite links join bands",
	async () => {
		async function account(name: string) {
			const response = await fetch(`${base}/api/auth/sign-up/email`, {
				method: "POST",
				headers: { "Content-Type": "application/json", Origin: base },
				body: JSON.stringify({
					name,
					email: `${crypto.randomUUID()}@chords.test`,
					password: "integration-test-password-2026",
				}),
			});
			expect(response.status).toBe(200);
			const cookie = response.headers
				.getSetCookie()
				.map((value) => value.split(";")[0])
				.join("; ");
			const { user } = (await response.json()) as { user: { id: string } };
			return { id: user.id, cookie };
		}
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
		const alice = await account("Share owner");
		const bob = await account("Share recipient");
		const song = (owner: string, title: string): Arrangement => ({
			id: crypto.randomUUID(),
			kind: "arrangement",
			owner,
			version: 0,
			updatedAt: new Date().toISOString(),
			archived: false,
			data: {
				title,
				artist: "Share test",
				content: "[G]Shared lyrics",
				key: "G",
				sourceCapo: 0,
				tags: [],
				sourceUrl: "",
				rawSource: "private import source",
				privateNotes: "private rehearsal notes",
				performanceKey: "F#",
				performanceCapo: 4,
				copiedFrom: "",
			},
		});
		const sync = (cookie: string, record: Arrangement | Setlist) =>
			call("/api/sync", cookie, {
				id: crypto.randomUUID(),
				baseVersion: 0,
				record,
			});
		const mine = song(alice.id, `Shared ${crypto.randomUUID()}`);
		const theirs = song(bob.id, `Private ${crypto.randomUUID()}`);
		expect((await sync(alice.cookie, mine)).status).toBe(200);
		expect((await sync(bob.cookie, theirs)).status).toBe(200);
		const list: Setlist = {
			id: crypto.randomUUID(),
			kind: "setlist",
			owner: alice.id,
			version: 0,
			updatedAt: new Date().toISOString(),
			archived: false,
			data: {
				title: "Shared setlist",
				date: "",
				entries: [mine, theirs].map((row) => ({
					id: crypto.randomUUID(),
					arrangementId: row.id,
					key: "A",
					notes: "",
				})),
			},
		};
		expect((await sync(alice.cookie, list)).status).toBe(200);

		// Only editors of the library can share; the link is reused until revoked.
		expect(
			(
				await call("/api/shares", bob.cookie, {
					action: "share",
					recordId: mine.id,
				})
			).status,
		).toBe(403);
		const share = async (recordId: string) => {
			const response = await call("/api/shares", alice.cookie, {
				action: "share",
				recordId,
			});
			expect(response.status).toBe(200);
			return ((await response.json()) as { link: { id: string } }).link.id;
		};
		const songLink = await share(mine.id);
		expect(await share(mine.id)).toBe(songLink);

		// Anyone with the link can read it, without the raw import or owner.
		const resolve = (token: string) =>
			call(`/api/shares?token=${encodeURIComponent(token)}`);
		const shared = (await (await resolve(songLink)).json()) as {
			share: { kind: string; record: Arrangement };
		};
		expect(shared.share.kind).toBe("song");
		expect(shared.share.record.data.title).toBe(mine.data.title);
		expect(shared.share.record.data.rawSource).toBe("");
		expect(shared.share.record.data.privateNotes).toBeUndefined();
		expect(shared.share.record.data.performanceKey).toBeUndefined();
		expect(shared.share.record.data.performanceCapo).toBeUndefined();
		expect(shared.share.record.owner).toBe("shared");

		// A setlist only carries songs from its own library.
		const setlist = (await (await resolve(await share(list.id))).json()) as {
			share: { kind: string; songs: Arrangement[] };
		};
		expect(setlist.share.kind).toBe("setlist");
		expect(setlist.share.songs.map((row) => row.id)).toEqual([mine.id]);

		expect(
			(
				await call("/api/shares", bob.cookie, {
					action: "revoke",
					id: songLink,
				})
			).status,
		).toBe(403);
		expect(
			(
				await call("/api/shares", alice.cookie, {
					action: "revoke",
					id: songLink,
				})
			).status,
		).toBe(200);
		expect((await resolve(songLink)).status).toBe(404);
		expect(await share(mine.id)).not.toBe(songLink);
		expect((await resolve("not-a-real-token")).status).toBe(404);

		// Band invites: owner only, and joining is idempotent.
		const band = (await (
			await call("/api/bands", alice.cookie, {
				action: "create",
				name: "Share band",
			})
		).json()) as { band: { id: string } };
		const bandId = band.band.id;
		expect(
			(
				await call("/api/shares", bob.cookie, {
					action: "invite",
					bandId,
					role: "editor",
				})
			).status,
		).toBe(403);
		const invite = (await (
			await call("/api/shares", alice.cookie, {
				action: "invite",
				bandId,
				role: "editor",
			})
		).json()) as { link: { id: string; expiresAt: number } };
		expect(invite.link.expiresAt).toBeGreaterThan(Date.now());
		const preview = (await (await resolve(invite.link.id)).json()) as {
			share: { kind: string; band: { name: string }; role: string };
		};
		expect(preview.share).toMatchObject({
			kind: "invite",
			band: { name: "Share band" },
			role: "editor",
		});
		expect(
			(await call("/api/shares", "", { action: "accept", id: invite.link.id }))
				.status,
		).toBe(401);
		for (let attempt = 0; attempt < 2; attempt++)
			expect(
				(
					await call("/api/shares", bob.cookie, {
						action: "accept",
						id: invite.link.id,
					})
				).status,
			).toBe(200);
		const bands = (await (await call("/api/bands", bob.cookie)).json()) as {
			bands: { id: string; role: string }[];
		};
		expect(bands.bands.find((row) => row.id === bandId)?.role).toBe("editor");
		// Accepting an invite never changes the owner's role.
		await call("/api/shares", alice.cookie, {
			action: "accept",
			id: invite.link.id,
		});
		const owners = (await (await call("/api/bands", alice.cookie)).json()) as {
			bands: { id: string; role: string }[];
		};
		expect(owners.bands.find((row) => row.id === bandId)?.role).toBe("owner");
	},
);
