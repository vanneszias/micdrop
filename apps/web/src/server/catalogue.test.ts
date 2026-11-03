import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { arrangementFingerprint } from "@chords/data";
import { catalogueSearchQuery } from "./catalogue-query";

const migrations = new URL("../../migrations/", import.meta.url);
async function database() {
	const db = new Database(":memory:");
	db.exec(await Bun.file(new URL("0001_songbook.sql", migrations)).text());
	return db;
}
const data = (title: string, extra: Record<string, unknown> = {}) =>
	JSON.stringify({
		title,
		artist: "Artist",
		content: "[C]Hello",
		key: "C",
		sourceCapo: 0,
		tags: [],
		sourceUrl: "",
		rawSource: "PRIVATE RAW",
		copiedFrom: "",
		...extra,
	});
test("catalogue migration preserves privacy, public snapshots, ids and votes", async () => {
	const db = await database();
	try {
		db.run("INSERT INTO user VALUES('owner','Owner','owner@test',0,NULL,0,0)");
		db.run(
			"INSERT INTO records VALUES('private','arrangement','owner',2,'now',0,?,'op1')",
			[data("Private")],
		);
		db.run(
			"INSERT INTO records VALUES('public','arrangement','owner',4,'now',0,?,'op2')",
			[data("Public", { privateNotes: "PRIVATE NOTES", performanceKey: "F#" })],
		);
		db.run(
			"INSERT INTO publications VALUES('publication','public','owner',?,'now',0)",
			[
				data("Last published", {
					privateNotes: "PRIVATE NOTES",
					performanceKey: "F#",
				}),
			],
		);
		db.run("INSERT INTO votes VALUES('publication','owner',1)");
		db.exec(await Bun.file(new URL("0005_catalogue.sql", migrations)).text());
		const privateRow = db
			.query<{ data: string; version: number }, []>(
				"SELECT data,version FROM records WHERE id='private'",
			)
			.get();
		if (!privateRow) throw new Error("Missing private fixture");
		expect(JSON.parse(privateRow.data).visibility).toBe("private");
		expect(privateRow.version).toBe(2);
		const pub = db
			.query<{ data: string; song_id: string }, []>(
				"SELECT data,song_id FROM publications WHERE id='publication'",
			)
			.get();
		if (!pub) throw new Error("Missing publication fixture");
		expect(JSON.parse(pub.data)).toMatchObject({
			title: "Last published",
			rawSource: "",
			songId: "public",
		});
		expect(JSON.parse(pub.data).privateNotes).toBeUndefined();
		expect(JSON.parse(pub.data).performanceKey).toBeUndefined();
		expect(db.query("SELECT * FROM publications").all()).toHaveLength(1);
		expect(db.query("SELECT * FROM votes").all()).toHaveLength(1);
	} finally {
		db.close();
	}
});
test("publication, draft, moderation and search indexes change atomically", async () => {
	const db = await database();
	try {
		db.exec(await Bun.file(new URL("0005_catalogue.sql", migrations)).text());
		const hash = await arrangementFingerprint("[C]Hello");
		db.run(
			"INSERT INTO records VALUES('sheet','arrangement','owner',1,'now',0,?,'op')",
			[
				data("Hallelujah", {
					visibility: "public",
					contentHash: hash,
					privateNotes: "SECRET",
				}),
			],
		);
		expect(
			db
				.query(
					"SELECT * FROM publication_search WHERE publication_search MATCH 'Hallelujah'",
				)
				.all(),
		).toHaveLength(1);
		expect(
			db
				.query(
					"SELECT * FROM catalogue_grams WHERE catalogue_grams MATCH 'alle'",
				)
				.all(),
		).toHaveLength(1);
		db.run(
			"UPDATE records SET data=json_set(data,'$.draft',1,'$.content','UNFINISHED') WHERE id='sheet'",
		);
		expect(
			db.query<{ data: string }, []>("SELECT data FROM publications").get()
				?.data,
		).not.toContain("UNFINISHED");
		db.run("UPDATE publications SET moderated=1 WHERE id='sheet'");
		expect(db.query("SELECT * FROM publication_search").all()).toHaveLength(0);
		db.run(
			"UPDATE records SET data=json_set(data,'$.draft',0,'$.content','FINISHED') WHERE id='sheet'",
		);
		expect(db.query("SELECT * FROM publication_search").all()).toHaveLength(0);
		db.run("UPDATE publications SET moderated=0 WHERE id='sheet'");
		expect(
			db
				.query(
					"SELECT * FROM publication_search WHERE publication_search MATCH 'FINISHED'",
				)
				.all(),
		).toHaveLength(1);
		db.run(
			"UPDATE records SET data=json_set(data,'$.visibility','private') WHERE id='sheet'",
		);
		expect(db.query("SELECT * FROM publication_search").all()).toHaveLength(0);
		expect(db.query("SELECT * FROM catalogue_grams").all()).toHaveLength(0);
	} finally {
		db.close();
	}
});

test("indexed catalogue search ranks and paginates a 10,000-song catalogue", async () => {
	const db = await database();
	try {
		db.exec(await Bun.file(new URL("0005_catalogue.sql", migrations)).text());
		const insert = db.prepare(
			"INSERT INTO records VALUES(?,'arrangement','owner',1,'now',0,?,'fixture')",
		);
		db.transaction(() => {
			for (let index = 0; index < 10_000; index++)
				insert.run(
					`fixture-${index}`,
					data(`Fixture song ${String(index).padStart(5, "0")}`, {
						visibility: "public",
						artist: `Artist ${index % 100}`,
						songId: `fixture-${index}`,
					}),
				);
			insert.run(
				"exact",
				data("Hallelujah", { visibility: "public", songId: "exact" }),
			);
			insert.run(
				"cover",
				data("Hallelujah", {
					visibility: "public",
					songId: "exact",
					artist: "Jeff Buckley",
					content: "[G]Cover",
				}),
			);
		})();
		const search = (q: string, offset = 0) => {
			const query = catalogueSearchQuery(q, offset);
			return db
				.query<
					{ id: string; relevance: number; count: number },
					(string | number)[]
				>(query.sql)
				.all(...query.params);
		};
		const started = performance.now();
		expect(search("hallelujah")[0]).toMatchObject({
			id: "exact",
			relevance: 1000,
			count: 2,
		});
		expect(search("halelujah")[0]?.id).toBe("exact");
		expect(search("jeff buckley")[0]?.id).toBe("exact");
		expect(search("unrelated xyz nonexistent")).toHaveLength(0);
		const first = search("fixture").slice(0, 30);
		const second = search("fixture", 30).slice(0, 30);
		expect(first).toHaveLength(30);
		expect(second).toHaveLength(30);
		expect(new Set([...first, ...second].map((row) => row.id)).size).toBe(60);
		expect(
			catalogueSearchQuery("abcdefghijklmnopqrstuvwxyz ".repeat(10)).params
				.length,
		).toBeLessThan(100);
		console.info(
			`Catalogue fixture: 10,000 songs; six searches in ${Math.round(performance.now() - started)}ms (local SQLite, not a production capacity measurement).`,
		);
	} finally {
		db.close();
	}
}, 30_000);
