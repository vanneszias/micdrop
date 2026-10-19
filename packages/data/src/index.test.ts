import "fake-indexeddb/auto";
import { afterEach, expect, test } from "bun:test";
import {
	type Arrangement,
	createSongbookStore,
	type Operation,
	type Setlist,
	type SongbookStore,
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
	const duplicate = { ...row, id: crypto.randomUUID() };
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
test("songbook uniqueness is atomic across tabs and applies to edits and restores", async () => {
	const account = crypto.randomUUID();
	const store = await open(account);
	const otherTab = await open(account);
	const row = song(account);
	const duplicate = {
		...song(account),
		data: { ...row.data, title: "  OFFLINE SONG  " },
	};
	const results = await Promise.allSettled([
		store.save(row),
		otherTab.save(duplicate),
	]);
	expect(results.map((result) => result.status)).toEqual([
		"fulfilled",
		"rejected",
	]);
	expect(otherTab.getStatus().pending).toBe(0);
	await store.save({ ...row, data: { ...row.data, content: "[D]Edited" } });
	await store.save({
		...duplicate,
		id: crypto.randomUUID(),
		owner: "another-songbook",
	});
	await store.save({ ...duplicate, archived: true });
	await expect(store.save(duplicate)).rejects.toThrow("already exists");
	const different = {
		...song(account),
		data: { ...row.data, artist: "Another artist" },
	};
	await store.save(different);
	await expect(store.save({ ...different, data: row.data })).rejects.toThrow(
		"already exists",
	);
	await store.save({ ...row, archived: true });
	await store.save(duplicate);
	const reopened = await open(account);
	expect(
		[...reopened.records.values()].filter(
			(record) => record.owner === account && !record.archived,
		),
	).toHaveLength(2);
	expect(reopened.getStatus().pending).toBe(4);
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
