// Generates D1 SQL that publishes a folder of OpenSong files to the catalogue.
// Usage: bun run apps/web/scripts/import-opensong.ts <folder> --owner <user-id> [--out file.sql]
// Then: cd apps/web && bunx wrangler d1 execute chords --local --file <file.sql>
// Records are inserted as public arrangements; the catalogue triggers publish them.
// Re-running is safe: record IDs derive from the owner and file name, and existing rows are kept.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { ArrangementData, arrangementFingerprint } from "@chords/data";
import { parseOpenSong } from "@chords/imports/opensong";

const { values, positionals } = parseArgs({
	allowPositionals: true,
	options: { owner: { type: "string" }, out: { type: "string" } },
});
const [folder] = positionals;
if (!folder || !values.owner) {
	console.error(
		"Usage: bun run apps/web/scripts/import-opensong.ts <folder> --owner <user-id> [--out file.sql]",
	);
	process.exit(1);
}
const owner = values.owner;
const out = values.out || "opensong-import.sql";
const sql = (value: string) => `'${value.replaceAll("'", "''")}'`;
const uuid = (seed: string) => {
	const hex = createHash("sha256").update(seed).digest("hex");
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};

const now = new Date().toISOString();
const songs = new Map<
	string,
	{ file: string; song: ReturnType<typeof parseOpenSong> }
>();
const duplicates: string[] = [];
for (const file of readdirSync(folder).sort()) {
	const path = join(folder, file);
	if (file.startsWith(".") || !statSync(path).isFile()) continue;
	const song = parseOpenSong(readFileSync(path, "utf8"), file);
	const contentHash = await arrangementFingerprint(song.content);
	const first = songs.get(contentHash);
	if (!first) {
		songs.set(contentHash, { file, song });
		continue;
	}
	// The same sheet saved under another title: keep that title searchable.
	duplicates.push(`${file} (same sheet as ${first.file})`);
	const tags = first.song.tags;
	if (song.title !== first.song.title && !tags.includes(song.title))
		tags.push(song.title.slice(0, 50));
	first.song.tags = tags.slice(0, 30);
}
const statements: string[] = [];
let warnings = 0;
for (const [contentHash, { file, song }] of songs) {
	if (song.warnings.length) warnings++;
	const id = uuid(`opensong:${owner}:${file}`);
	const operation = uuid(`opensong-operation:${owner}:${file}`);
	const data = ArrangementData.parse({
		title: song.title,
		artist: song.artist,
		content: song.content,
		key: song.key,
		sourceCapo: song.sourceCapo,
		tags: song.tags,
		rawSource: song.rawSource,
		songId: id,
		contentHash,
		description: song.description,
		visibility: "public",
	});
	statements.push(
		`INSERT OR IGNORE INTO records (id,kind,owner,version,updated_at,archived,data,last_operation) SELECT ${sql(id)},'arrangement',${sql(owner)},1,${sql(now)},0,${sql(JSON.stringify(data))},${sql(operation)} WHERE EXISTS (SELECT 1 FROM user WHERE id=${sql(owner)});`,
		`INSERT OR IGNORE INTO revisions SELECT id,version,data,updated_at FROM records WHERE id=${sql(id)} AND last_operation=${sql(operation)};`,
	);
}
writeFileSync(out, `${statements.join("\n")}\n`);
console.log(
	`Wrote ${songs.size} songs to ${out} (${warnings} had no key; their first chord or C was used).`,
);
if (duplicates.length)
	console.log(
		`Merged ${duplicates.length} identical sheets as alternative titles:\n  ${duplicates.join("\n  ")}`,
	);
