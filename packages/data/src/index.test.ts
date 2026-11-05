import "fake-indexeddb/auto";
import { afterEach, expect, test } from "bun:test";
import {
	type Arrangement,
	addToSetlist,
	copyArrangement,
	copySetlist,
	createSongbookStore,
	type Operation,
	type Setlist,
	type SongbookStore,
	searchRelevance,
} from "./index";

const originalFetch = globalThis.fetch;
Object.defineProperty(globalThis, "navigator", {
	value: { onLine: true },
	configurable: true,
});
const stores: SongbookStore[] = [];
afterEach(() => {
	globalThis.fetch = originalFetch;
	for (const store of stores.splice(0)) store.dispose();
});
function song(owner: string): Arrangement {
	return {
		id: crypto.randomUUID(),
		owner,
		version: 0,
		updatedAt: new Date().toISOString(),
		archived: false,
		kind: "arrangement",
		data: {
			title: "Offline song",
			artist: "",
			content: "[C]Hello",
			key: "C",
			sourceCapo: 0,
			tags: [],
			sourceUrl: "",
			rawSource: "",
			copiedFrom: "",
		},
	};
}
async function open(account: string) {
	const store = createSongbookStore(account);
	stores.push(store);
	await store.init();
	return store;
}
test("atomic local records and pending edits survive a restart and remain account isolated", async () => {
	const account = crypto.randomUUID();
	const first = await open(account);
	const row = song(account);
	await first.save(row);
	first.dispose();
	const reopened = await open(account);
	expect(reopened.records.get(row.id)?.data.title).toBe("Offline song");
	expect(reopened.getStatus().pending).toBe(1);
	const other = await open(crypto.randomUUID());
	expect(other.records.get(row.id)).toBeUndefined();
});
test("PDF imports atomically retain songs, setlist, outbox and original file across restarts", async () => {
	const account = crypto.randomUUID();
	const store = await open(account);
	const row = song(account);
	const list: Setlist = {
		id: crypto.randomUUID(),
		owner: account,
		kind: "setlist",
		version: 0,
		archived: false,
		updatedAt: row.updatedAt,
		data: {
			title: "Imported",
			date: "",
			entries: [
				{ id: crypto.randomUUID(), arrangementId: row.id, key: "C", notes: "" },
			],
		},
	};
	const source = {
		id: list.id,
		file: new File(["%PDF-1.7\noriginal"], "original.pdf", {
			type: "application/pdf",
		}),
	};
	await store.saveImport([row, list], source);
	store.dispose();
	const reopened = await open(account);
	expect(reopened.records.get(row.id)).toMatchObject(row);
	expect(reopened.records.get(list.id)).toMatchObject(list);
	expect(reopened.getStatus().pending).toBe(2);
	expect(await (await reopened.getImportSource(list.id))?.text()).toBe(
		"%PDF-1.7\noriginal",
	);
	const other = await open(crypto.randomUUID());
	expect(await other.getImportSource(list.id)).toBeUndefined();
	const duplicate = { ...row };
	const secondList = { ...list, id: crypto.randomUUID() };
	await expect(
		reopened.saveImport([duplicate, secondList], {
			...source,
			id: secondList.id,
		}),
	).rejects.toThrow("already exists");
	expect(reopened.records.has(secondList.id)).toBe(false);
	expect(await reopened.getImportSource(secondList.id)).toBeUndefined();
	expect(reopened.getStatus().pending).toBe(2);
	// A source write failing after records were queued must roll the whole transaction back.
	const newSong = {
		...row,
		id: crypto.randomUUID(),
		data: { ...row.data, title: "Another song" },
	};
	await expect(
		reopened.saveImport([newSong, secondList], source),
	).rejects.toThrow();
	const afterFailure = await open(account);
	expect(afterFailure.records.has(newSong.id)).toBe(false);
	expect(afterFailure.records.has(secondList.id)).toBe(false);
	expect(afterFailure.getStatus().pending).toBe(2);
});
test("the songs list supports multiple arrangements of the same song and private stable copies", async () => {
	const account = crypto.randomUUID();
	const store = await open(account);
	const source = song(account);
	const acoustic = {
		...source,
		id: crypto.randomUUID(),
		data: {
			...source.data,
			songId: source.id,
			arrangementName: "Acoustic",
			content: "[G]Acoustic",
		},
	};
	await store.saveMany([source, acoustic]);
	const copy = copyArrangement(source, "band");
	await store.save(copy);
	await store.save({
		...source,
		data: { ...source.data, content: "[D]Updated public source" },
	});
	const reopened = await open(account);
	expect(reopened.records.get(copy.id)?.data).toMatchObject({
		visibility: "private",
		content: "[C]Hello",
		songId: source.id,
		copiedFrom: source.id,
	});
	expect(reopened.records.has(acoustic.id)).toBe(true);
});
test("setlist additions reuse the exact source, preserve versions, and save atomically", async () => {
	const account = crypto.randomUUID();
	const store = await open(account);
	const source = {
		...song("public"),
		data: {
			...song("public").data,
			performanceKey: "D",
			privateNotes: "Quiet bridge",
		},
	};
	const list: Setlist = {
		id: crypto.randomUUID(),
		owner: account,
		kind: "setlist",
		version: 0,
		archived: false,
		updatedAt: source.updatedAt,
		data: { title: "Show", date: "", entries: [] },
	};
	const addition = addToSetlist(list, source, []);
	await store.saveMany(addition.rows);
	expect(addition.song.data.visibility).toBe("private");
	const updated = addition.rows.at(-1) as Setlist;
	expect(updated.data.entries[0]).toMatchObject({
		key: "D",
		notes: "Quiet bridge",
		arrangementId: addition.song.id,
	});
	const repeated = addToSetlist(updated, source, [addition.song]);
	expect(repeated.rows).toHaveLength(1);
	expect(repeated.song.id).toBe(addition.song.id);
	const alternate = {
		...source,
		id: crypto.randomUUID(),
		data: { ...source.data, content: "[F]Different arrangement" },
	};
	expect(addToSetlist(updated, alternate, [addition.song]).song.id).not.toBe(
		addition.song.id,
	);
	store.dispose();
	const reopened = await open(account);
	expect(reopened.records.has(addition.song.id)).toBe(true);
	expect(reopened.records.get(list.id)?.data).toMatchObject(updated.data);
	expect(reopened.getStatus().pending).toBe(2);
});
test("search ranks exact matches over fuzzy candidates from saved songs and lyrics", () => {
	const data = song("test").data;
	expect(searchRelevance({ ...data, title: "Hallelujah" }, "Hallelujah")).toBe(
		1000,
	);
	expect(
		searchRelevance({ ...data, title: "Hallelujah" }, "Halelujah"),
	).toBeGreaterThan(400);
	expect(
		searchRelevance(
			{ ...data, title: "Other", content: "Hallelujah" },
			"Hallelujah",
		),
	).toBe(100);
	expect(searchRelevance(data, "unrelated")).toBe(0);
});
test("an edit made while a previous write is in flight is kept and rebased", async () => {
	const account = crypto.randomUUID();
	const store = await open(account);
	const row = song(account);
	await store.save(row);
	let release!: () => void;
	let started!: () => void;
	const wait = new Promise<void>((resolve) => {
		release = resolve;
	});
	const begin = new Promise<void>((resolve) => {
		started = resolve;
	});
	let server = { ...row, version: 1 };
	const sent: Operation[] = [];
	globalThis.fetch = Object.assign(
		async (_url: string | URL | Request, init?: RequestInit) => {
			if (init?.method === "POST") {
				const operation = JSON.parse(String(init.body)) as Operation;
				sent.push(operation);
				if (sent.length === 1) {
					started();
					await wait;
				}
				server = { ...operation.record, version: operation.baseVersion + 1 };
				return Response.json({ record: server });
			}
			return Response.json({ records: [server] });
		},
		{ preconnect: originalFetch.preconnect },
	);
	const syncing = store.sync();
	await begin;
	await store.save({
		...row,
		data: { ...row.data, content: "[G]Changed during sync" },
	});
	release();
	await syncing;
	expect(store.getStatus().pending).toBe(1);
	expect(store.records.get(row.id)?.data).toMatchObject({
		content: "[G]Changed during sync",
	});
	await store.sync();
	expect(sent[1].baseVersion).toBe(1);
	expect(store.getStatus().pending).toBe(0);
	await store.save({
		...row,
		data: { ...row.data, content: "[D]Another edit in same editor" },
	});
	await store.sync();
	expect(sent[2].baseVersion).toBe(2);
});
test("a conflict survives reopening, preserves local lyrics, and resolves explicitly", async () => {
	const account = crypto.randomUUID();
	const store = await open(account);
	const row = song(account);
	await store.save(row);
	const server = {
		...row,
		version: 2,
		data: { ...row.data, content: "[F]Other person’s lyrics" },
	};
	globalThis.fetch = Object.assign(
		async (_url: string | URL | Request, init?: RequestInit) =>
			init?.method === "POST"
				? Response.json({ server }, { status: 409 })
				: Response.json({ records: [server] }),
		{ preconnect: originalFetch.preconnect },
	);
	await store.sync();
	expect(store.records.get(row.id)?.data).toMatchObject({
		content: "[C]Hello",
	});
	store.dispose();
	const reopened = await open(account);
	expect(reopened.getStatus().conflicts).toHaveLength(1);
	await reopened.resolve(row.id, "server");
	expect(reopened.records.get(row.id)?.data).toMatchObject({
		content: "[F]Other person’s lyrics",
	});
	expect(reopened.getStatus().pending).toBe(0);
});

test("a copied setlist and its new songs save together", async () => {
	const account = crypto.randomUUID();
	const band = crypto.randomUUID();
	const store = await open(account);
	const source = song(account);
	const list: Setlist = {
		id: crypto.randomUUID(),
		kind: "setlist",
		owner: account,
		version: 0,
		updatedAt: new Date().toISOString(),
		archived: false,
		data: {
			title: "Friday",
			date: "",
			entries: [
				{ id: "a", arrangementId: source.id, key: "D", notes: "" },
				{ id: "b", arrangementId: source.id, key: "C", notes: "" },
			],
		},
	};
	await store.saveMany([source, list]);
	const copy = copySetlist(list, [source], band, []);
	expect(copy.songs).toHaveLength(1);
	expect(copy.list.data.entries.map((entry) => entry.arrangementId)).toEqual([
		copy.songs[0].id,
		copy.songs[0].id,
	]);
	await store.saveMany([...copy.songs, copy.list, { ...list, archived: true }]);
	expect(store.records.get(copy.songs[0].id)).toMatchObject({
		owner: band,
		data: { copiedFrom: source.id },
	});
	expect(store.records.get(copy.list.id)).toMatchObject({
		owner: band,
		data: { title: "Friday" },
	});
	expect(store.records.get(list.id)?.archived).toBe(true);
	const bandSongs = [...store.records.values()].filter(
		(row) => row.kind === "arrangement" && row.owner === band,
	);
	expect(bandSongs).toHaveLength(1);
});

test("copying a setlist reuses songs the destination already has", async () => {
	const account = crypto.randomUUID();
	const band = crypto.randomUUID();
	const source = song(account);
	const existing = copyArrangement(source, band);
	const list: Setlist = {
		id: crypto.randomUUID(),
		kind: "setlist",
		owner: account,
		version: 0,
		updatedAt: new Date().toISOString(),
		archived: false,
		data: {
			title: "Friday",
			date: "",
			entries: [{ id: "a", arrangementId: source.id, key: "C", notes: "" }],
		},
	};
	const copy = copySetlist(list, [source], band, [existing]);
	expect(copy.songs).toHaveLength(0);
	expect(copy.list.data.entries[0].arrangementId).toBe(existing.id);
});
