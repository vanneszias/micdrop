import { env } from "cloudflare:workers";
import type { Arrangement } from "@chords/data";
import {
	keyDistance,
	normalizeSheet,
	transposeChordPro,
} from "@chords/song-core";
import {
	type CallToolResult,
	createMcpHandler,
	McpServer,
} from "@modelcontextprotocol/server";
import { z } from "zod";
import { HttpError } from "./http-error";
import { importFromUrl } from "./import-page";
import { listRecords, saveOperation } from "./sync";

type Caller = { userId: string; scopes: string[] };

function result(value: unknown): CallToolResult {
	return {
		content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
		structuredContent: value as Record<string, unknown>,
	};
}
function failure(message: string): CallToolResult {
	return { content: [{ type: "text", text: message }], isError: true };
}
/** Tool errors go back to the model as text so it can correct itself. */
function tool<A>(
	caller: Caller,
	scope: string,
	run: (args: A) => Promise<unknown>,
) {
	return async (args: A) => {
		if (!caller.scopes.includes(scope))
			return failure(
				`This connection lacks the ${scope} permission. Reconnect Mic Drop and allow it.`,
			);
		try {
			return result(await run(args));
		} catch (error) {
			if (error instanceof HttpError) return failure(error.message);
			throw error;
		}
	};
}

async function libraries(userId: string) {
	const { results } = await env.DB.prepare(
		"SELECT o.id, o.name, m.role FROM member m JOIN organization o ON o.id = m.organizationId WHERE m.userId = ? ORDER BY o.name",
	)
		.bind(userId)
		.all<{ id: string; name: string; role: string }>();
	return [{ id: userId, name: "Personal songbook", role: "owner" }, ...results];
}
async function songs(userId: string) {
	return (await listRecords(userId)).filter(
		(record): record is Arrangement =>
			record.kind === "arrangement" && !record.archived,
	);
}
function summary(song: Arrangement) {
	return {
		id: song.id,
		library: song.owner,
		title: song.data.title,
		artist: song.data.artist,
		key: song.data.key,
		tags: song.data.tags,
	};
}
async function findSong(userId: string, id: string) {
	const song = (await songs(userId)).find((record) => record.id === id);
	if (!song)
		throw new HttpError(404, `No song with id ${id} in your songbooks.`);
	return song;
}
async function save(userId: string, song: Arrangement) {
	const saved = await saveOperation(userId, {
		id: crypto.randomUUID(),
		record: song,
		baseVersion: song.version,
	});
	if ("conflict" in saved)
		throw new HttpError(
			409,
			`The song changed since version ${song.version}; it is now version ${saved.conflict.version}. Fetch it again with get_song and reapply your edit.`,
		);
	return saved.record as Arrangement;
}
function newSong(
	owner: string,
	input: { title: string; artist: string; key?: string; tags: string[] },
	raw: string,
	sourceUrl = "",
) {
	const { content, warnings } = normalizeSheet(raw);
	if (!content) throw new HttpError(400, "The song has no chord sheet text.");
	const song: Arrangement = {
		id: crypto.randomUUID(),
		kind: "arrangement",
		owner,
		version: 0,
		archived: false,
		updatedAt: new Date().toISOString(),
		data: {
			title: input.title.trim(),
			artist: input.artist.trim(),
			content,
			key: input.key || content.match(/\{key:\s*([^}]+)\}/i)?.[1].trim() || "C",
			sourceCapo: 0,
			tags: input.tags,
			sourceUrl,
			rawSource: raw,
			copiedFrom: "",
		},
	};
	return { song, warnings };
}

const SongFields = {
	title: z.string().min(1).max(200).describe("Song title"),
	artist: z.string().max(200).default("").describe("Artist or band"),
	key: z
		.string()
		.max(10)
		.optional()
		.describe(
			"Written key, e.g. G or F#m. Always set it; transposition depends on it. Falls back to {key:} in the sheet, then C.",
		),
	tags: z.array(z.string().max(50)).max(30).default([]),
	library: z
		.string()
		.optional()
		.describe(
			"Library id from list_libraries. Defaults to the personal songbook.",
		),
};

function buildServer(caller: Caller) {
	const { userId } = caller;
	const server = new McpServer(
		{ name: "mic-drop", version: "1.0.0" },
		{
			instructions:
				"Mic Drop is a chord-sheet songbook. Songs are stored as ChordPro (chords inline in square brackets, e.g. [G]Amazing [C]grace). Search before adding to avoid duplicates; a library cannot hold two songs with the same title and artist.",
		},
	);
	server.registerTool(
		"list_libraries",
		{
			title: "List songbooks",
			description:
				"List the songbooks you can use: your personal songbook and your bands.",
			annotations: { readOnlyHint: true },
		},
		tool(caller, "songs:read", async () => ({
			libraries: await libraries(userId),
		})),
	);
	server.registerTool(
		"search_songs",
		{
			title: "Search songs",
			description:
				"Find songs by title, artist, tag, or lyric text. Leave the query empty to list songs.",
			inputSchema: z.object({
				query: z.string().max(200).default(""),
				library: SongFields.library,
				limit: z.number().int().min(1).max(100).default(25),
			}),
			annotations: { readOnlyHint: true },
		},
		tool(caller, "songs:read", async ({ query, library, limit }) => {
			const needle = query.trim().toLowerCase();
			const rank = (song: Arrangement) => {
				const { title, artist, tags, content } = song.data;
				if (!needle) return 1;
				if (title.toLowerCase().includes(needle)) return 4;
				if (artist.toLowerCase().includes(needle)) return 3;
				if (tags.some((tag) => tag.toLowerCase().includes(needle))) return 2;
				return content.toLowerCase().includes(needle) ? 1 : 0;
			};
			const matches = (await songs(userId))
				.filter((song) => !library || song.owner === library)
				.map((song) => ({ song, score: rank(song) }))
				.filter(({ score }) => score > 0)
				.sort(
					(a, b) =>
						b.score - a.score ||
						a.song.data.title.localeCompare(b.song.data.title),
				);
			return {
				total: matches.length,
				songs: matches.slice(0, limit).map(({ song }) => summary(song)),
			};
		}),
	);
	server.registerTool(
		"get_song",
		{
			title: "Get song",
			description:
				"Get a song's ChordPro sheet. Optionally transpose the chords to another key; this does not change the saved song.",
			inputSchema: z.object({
				id: z.string(),
				transpose_to: z
					.string()
					.max(10)
					.optional()
					.describe("Key to transpose the chords to, e.g. A"),
			}),
			annotations: { readOnlyHint: true },
		},
		tool(caller, "songs:read", async ({ id, transpose_to }) => {
			const song = await findSong(userId, id);
			const semitones = transpose_to
				? keyDistance(song.data.key, transpose_to)
				: 0;
			return {
				...summary(song),
				version: song.version,
				capo: song.data.sourceCapo,
				sourceUrl: song.data.sourceUrl,
				...(transpose_to ? { transposedTo: transpose_to } : {}),
				content: transposeChordPro(song.data.content, semitones),
			};
		}),
	);
	server.registerTool(
		"add_song",
		{
			title: "Add song",
			description:
				"Add a song. Content may be ChordPro or plain chords written above the lyrics; it is converted to ChordPro and the original text is kept.",
			inputSchema: z.object({
				...SongFields,
				content: z.string().min(1).max(200_000).describe("Chord sheet text"),
			}),
		},
		tool(caller, "songs:write", async ({ library, content, ...input }) => {
			const { song, warnings } = newSong(library || userId, input, content);
			return { song: summary(await save(userId, song)), warnings };
		}),
	);
	server.registerTool(
		"import_song_from_url",
		{
			title: "Import song from URL",
			description:
				"Fetch a public chord page and add its chord sheet as a song. Use rendered: true for pages that build the sheet with JavaScript.",
			inputSchema: z.object({
				url: z.string().url().max(2000),
				rendered: z.boolean().default(false),
				title: SongFields.title.optional().describe("Overrides the page title"),
				artist: z.string().max(200).optional(),
				key: SongFields.key,
				tags: SongFields.tags,
				library: SongFields.library,
			}),
		},
		tool(
			caller,
			"songs:write",
			async ({ url, rendered, library, ...input }) => {
				const page = await importFromUrl(url, rendered);
				const { song, warnings } = newSong(
					library || userId,
					{
						...input,
						title: input.title || page.title || "Untitled song",
						artist: input.artist ?? page.artist,
					},
					page.rawSource,
					url,
				);
				return {
					song: summary(await save(userId, song)),
					warnings: [...page.warnings, ...warnings],
				};
			},
		),
	);
	server.registerTool(
		"update_song",
		{
			title: "Update song",
			description:
				"Change a song. Pass the version from get_song; if someone edited it since, the update is refused so nothing is overwritten.",
			inputSchema: z.object({
				id: z.string(),
				version: z.number().int().min(1),
				title: SongFields.title.optional(),
				artist: z.string().max(200).optional(),
				key: SongFields.key,
				capo: z.number().int().min(0).max(12).optional(),
				tags: z.array(z.string().max(50)).max(30).optional(),
				content: z
					.string()
					.min(1)
					.max(200_000)
					.optional()
					.describe("Full replacement ChordPro sheet"),
			}),
			annotations: { destructiveHint: false, idempotentHint: true },
		},
		tool(caller, "songs:write", async ({ id, version, capo, ...changes }) => {
			const current = await findSong(userId, id);
			const content =
				changes.content === undefined
					? undefined
					: normalizeSheet(changes.content).content;
			const saved = await save(userId, {
				...current,
				version,
				data: {
					...current.data,
					...Object.fromEntries(
						Object.entries(changes).filter(([, value]) => value !== undefined),
					),
					...(content === undefined ? {} : { content }),
					...(capo === undefined ? {} : { sourceCapo: capo }),
				},
			});
			return { song: { ...summary(saved), version: saved.version } };
		}),
	);
	return server;
}

const handler = createMcpHandler(({ authInfo }) =>
	buildServer({
		userId: String(authInfo?.extra?.userId),
		scopes: authInfo?.scopes ?? [],
	}),
);

export function serveMcp(
	request: Request,
	claims: { sub?: string; azp?: unknown; scope?: unknown },
) {
	if (!claims.sub) throw new HttpError(401, "The token has no user.");
	return handler.fetch(request, {
		authInfo: {
			token: "",
			clientId: String(claims.azp),
			scopes: typeof claims.scope === "string" ? claims.scope.split(" ") : [],
			extra: { userId: claims.sub },
		},
	});
}
