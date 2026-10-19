import {
	createCollection,
	localOnlyCollectionOptions,
} from "@tanstack/react-db";
import { z } from "zod";

export const ArrangementData = z.object({
	title: z.string().min(1).max(200),
	artist: z.string().max(200),
	content: z.string().max(200_000),
	key: z.string().max(10),
	sourceCapo: z.number().int().min(0).max(12).default(0),
	tags: z.array(z.string().max(50)).max(30),
	sourceUrl: z.string().max(2000).default(""),
	rawSource: z.string().max(200_000).default(""),
	copiedFrom: z.string().default(""),
});
export const SetlistData = z.object({
	title: z.string().min(1).max(200),
	date: z.string(),
	entries: z
		.array(
			z.object({
				id: z.string(),
				arrangementId: z.string(),
				key: z.string().max(10),
				notes: z.string().max(2000),
			}),
		)
		.max(200),
});
const base = {
	id: z.string().min(1).max(100),
	owner: z.string().min(1).max(100),
	version: z.number().int().min(0),
	updatedAt: z.string(),
	archived: z.boolean(),
};
export const RecordSchema = z.discriminatedUnion("kind", [
	z.object({ ...base, kind: z.literal("arrangement"), data: ArrangementData }),
	z.object({ ...base, kind: z.literal("setlist"), data: SetlistData }),
]);
export type SongRecord = z.infer<typeof RecordSchema>;
export type Arrangement = Extract<SongRecord, { kind: "arrangement" }>;
export type Setlist = Extract<SongRecord, { kind: "setlist" }>;
export type Operation = { id: string; record: SongRecord; baseVersion: number };
export type Conflict = { operation: Operation; server: SongRecord };

// Match SQLite's lower(trim(...)) so offline and server saves agree.
export function songIdentity(data: Arrangement["data"]) {
	const normalize = (value: string) =>
		value
			.replace(/^ +| +$/g, "")
			.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
	return JSON.stringify([normalize(data.title), normalize(data.artist)]);
}

export const duplicateSongMessage =
	"A song with this title and artist already exists in this songbook.";

export function createSongbookStore(account: string) {
	const records = createCollection(
		localOnlyCollectionOptions<SongRecord>({
			id: `songbook-${account}`,
			getKey: (row) => row.id,
		}),
	);
	let database: IDBDatabase;
	const acknowledged = new Map<string, number>();
	let disposed = false;
	const abort = new AbortController();
	let channel: BroadcastChannel | undefined;
	const listeners = new Set<() => void>();
	let pending = 0;
	let conflicts: Conflict[] = [];
	let syncing = false;
	let error = "";
	let status = { pending, conflicts, syncing, error };
	function notify() {
		status = { pending, conflicts: [...conflicts], syncing, error };
		for (const listener of listeners) listener();
	}
	const request = <T>(req: IDBRequest<T>) =>
		new Promise<T>((resolve, reject) => {
			req.onsuccess = () => resolve(req.result);
			req.onerror = () => reject(req.error);
		});
	const transactionDone = (tx: IDBTransaction) =>
		new Promise<void>((resolve, reject) => {
			tx.oncomplete = () => resolve();
			tx.onabort = () =>
				reject(tx.error || new Error("Local save was aborted"));
			tx.onerror = () => reject(tx.error);
		});
	function apply(record: SongRecord) {
		if (records.has(record.id))
			records.update(record.id, (draft) => Object.assign(draft, record));
		else records.insert(record);
	}
	async function refresh() {
		const tx = database.transaction(["records", "outbox", "conflicts"]);
		const [rows, operations, storedConflicts] = await Promise.all([
			request<SongRecord[]>(tx.objectStore("records").getAll()),
			request<Operation[]>(tx.objectStore("outbox").getAll()),
			request<Conflict[]>(tx.objectStore("conflicts").getAll()),
		]);
		for (const row of rows) apply(row);
		pending = operations.length;
		conflicts = storedConflicts.map((conflict) => ({
			...conflict,
			operation: {
				...conflict.operation,
				record:
					rows.find((row) => row.id === conflict.operation.record.id) ||
					conflict.operation.record,
			},
		}));
		notify();
	}
	async function init() {
		const opening = indexedDB.open(`chords:${account}`, 2);
		opening.onupgradeneeded = () => {
			for (const store of ["records", "outbox", "conflicts", "sources"])
				if (!opening.result.objectStoreNames.contains(store))
					opening.result.createObjectStore(store, {
						keyPath:
							store === "conflicts"
								? "operation.record.id"
								: store === "outbox"
									? "record.id"
									: "id",
					});
		};
		database = await request(opening);
		if (disposed) {
			database.close();
			return;
		}
		await records.preload();
		await refresh();
		if (typeof BroadcastChannel !== "undefined") {
			channel = new BroadcastChannel(`chords:${account}`);
			channel.onmessage = () => void refresh().catch(report);
		}
	}
	function report(reason: unknown) {
		error = reason instanceof Error ? reason.message : "Could not save changes";
		notify();
	}
	async function save(input: SongRecord, baseVersion?: number) {
		const record = RecordSchema.parse({
			...input,
			updatedAt: new Date().toISOString(),
		});
		const tx = database.transaction(["records", "outbox"], "readwrite");
		const done = transactionDone(tx);
		if (record.kind === "arrangement" && !record.archived) {
			const rows = await request<SongRecord[]>(
				tx.objectStore("records").getAll(),
			);
			if (
				rows.some(
					(row) =>
						row.id !== record.id &&
						row.owner === record.owner &&
						row.kind === "arrangement" &&
						!row.archived &&
						songIdentity(row.data) === songIdentity(record.data),
				)
			) {
				await done;
				throw new Error(duplicateSongMessage);
			}
		}
		const previous = await request<Operation | undefined>(
			tx.objectStore("outbox").get(record.id),
		);
		tx.objectStore("records").put(record);
		tx.objectStore("outbox").put({
			id: crypto.randomUUID(),
			record,
			baseVersion:
				baseVersion ??
				previous?.baseVersion ??
				acknowledged.get(`${record.id}:${record.version}`) ??
				record.version,
		} satisfies Operation);
		await done;
		apply(record);
		error = "";
		await refresh();
		channel?.postMessage("changed");
	}
	async function mergeRemote(rows: SongRecord[]) {
		const tx = database.transaction(["records", "outbox"], "readwrite");
		const done = transactionDone(tx);
		const queued = await request<Operation[]>(
			tx.objectStore("outbox").getAll(),
		);
		const queuedIds = new Set(queued.map((operation) => operation.record.id));
		for (const row of rows)
			if (!queuedIds.has(row.id)) tx.objectStore("records").put(row);
		await done;
		await refresh();
		channel?.postMessage("changed");
	}
	async function saveImport(
		inputs: SongRecord[],
		source: { id: string; file: File },
	) {
		const rows = inputs.map((row) => RecordSchema.parse(row));
		const tx = database.transaction(
			["records", "outbox", "sources"],
			"readwrite",
		);
		const done = transactionDone(tx);
		const existing = await request<SongRecord[]>(
			tx.objectStore("records").getAll(),
		);
		const ids = new Set(existing.map((row) => row.id));
		const identities = new Set(
			existing
				.filter(
					(row): row is Arrangement =>
						row.kind === "arrangement" && !row.archived,
				)
				.map((row) => `${row.owner}:${songIdentity(row.data)}`),
		);
		for (const row of rows) {
			const identity =
				row.kind === "arrangement"
					? `${row.owner}:${songIdentity(row.data)}`
					: "";
			if (ids.has(row.id) || (identity && identities.has(identity))) {
				await done;
				throw new Error(
					identity && identities.has(identity)
						? `${duplicateSongMessage} Rename the imported song before saving.`
						: "This import already exists.",
				);
			}
			ids.add(row.id);
			if (identity) identities.add(identity);
		}
		for (const record of rows) {
			tx.objectStore("records").add(record);
			tx.objectStore("outbox").add({
				id: crypto.randomUUID(),
				record,
				baseVersion: 0,
			} satisfies Operation);
		}
		tx.objectStore("sources").add(source);
		await done;
		await refresh();
		channel?.postMessage("changed");
	}
	async function getImportSource(id: string) {
		return (
			await request<{ id: string; file: File } | undefined>(
				database.transaction("sources").objectStore("sources").get(id),
			)
		)?.file;
	}
	async function sync() {
		if (
			!database ||
			disposed ||
			syncing ||
			account === "local" ||
			!navigator.onLine
		)
			return;
		syncing = true;
		error = "";
		notify();
		try {
			const operations = await request<Operation[]>(
				database.transaction("outbox").objectStore("outbox").getAll(),
			);
			for (const operation of operations) {
				if (
					conflicts.some(
						(conflict) => conflict.operation.record.id === operation.record.id,
					)
				)
					continue;
				const response = await fetch("/api/sync", {
					signal: abort.signal,
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(operation),
				});
				if (response.status === 409) {
					const { server } = (await response.json()) as { server: SongRecord };
					const tx = database.transaction("conflicts", "readwrite");
					const done = transactionDone(tx);
					tx.objectStore("conflicts").put({ operation, server });
					await done;
					continue;
				}
				if (!response.ok)
					throw new Error(
						((await response.json()) as { error?: string }).error ||
							"Could not synchronize",
					);
				const { record: confirmed } = (await response.json()) as {
					record: SongRecord;
				};
				for (const [key, version] of acknowledged)
					if (
						key.startsWith(`${operation.record.id}:`) &&
						version === operation.baseVersion
					)
						acknowledged.set(key, confirmed.version);
				acknowledged.set(
					`${operation.record.id}:${operation.record.version}`,
					confirmed.version,
				);
				const tx = database.transaction(["outbox", "records"], "readwrite");
				const done = transactionDone(tx);
				const current = await request<Operation | undefined>(
					tx.objectStore("outbox").get(operation.record.id),
				);
				if (current?.id === operation.id) {
					tx.objectStore("outbox").delete(operation.record.id);
					tx.objectStore("records").put(confirmed);
				} else if (current) {
					tx.objectStore("outbox").put({
						...current,
						baseVersion: confirmed.version,
					});
					tx.objectStore("records").put({
						...current.record,
						version: confirmed.version,
					});
				}
				await done;
			}
			const response = await fetch("/api/sync", { signal: abort.signal });
			if (!response.ok)
				throw new Error(
					"Sign in again to synchronize. Your local edits are safe.",
				);
			const { records: rows } = (await response.json()) as {
				records: SongRecord[];
			};
			await mergeRemote(rows);
		} catch (reason) {
			if (!disposed) report(reason);
		} finally {
			syncing = false;
			if (!disposed) await refresh();
		}
	}
	async function resolve(id: string, choice: "local" | "server") {
		const conflict = conflicts.find(
			(value) => value.operation.record.id === id,
		);
		if (!conflict) return;
		const tx = database.transaction(
			["records", "outbox", "conflicts"],
			"readwrite",
		);
		const done = transactionDone(tx);
		tx.objectStore("conflicts").delete(id);
		if (choice === "server") {
			tx.objectStore("outbox").delete(id);
			tx.objectStore("records").put(conflict.server);
		} else {
			const current = records.get(id) || conflict.operation.record;
			tx.objectStore("outbox").put({
				id: crypto.randomUUID(),
				baseVersion: conflict.server.version,
				record: { ...current, version: conflict.server.version },
			});
		}
		await done;
		await refresh();
		await sync();
	}
	async function importLocal() {
		const local = createSongbookStore("local");
		await local.init();
		for (const row of local.records.values())
			if (row.owner === "local")
				await save({
					...row,
					id: crypto.randomUUID(),
					owner: account,
					version: 0,
				});
		local.dispose();
	}
	function dispose() {
		disposed = true;
		abort.abort();
		channel?.close();
		database?.close();
		void records.cleanup();
	}
	return {
		records,
		init,
		save,
		saveImport,
		getImportSource,
		sync,
		resolve,
		importLocal,
		dispose,
		getStatus: () => status,
		subscribe: (callback: () => void) => {
			listeners.add(callback);
			return () => {
				listeners.delete(callback);
			};
		},
	};
}
export type SongbookStore = ReturnType<typeof createSongbookStore>;
