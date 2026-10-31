import { env } from "cloudflare:workers";
import {
	duplicateSongMessage,
	RecordSchema,
	type SongRecord,
} from "@chords/data";
import { z } from "zod";
import { canAccess, HttpError, requireUser } from "./auth";

type Stored = {
	id: string;
	kind: string;
	owner: string;
	version: number;
	updated_at: string;
	archived: number;
	data: string;
};
export function decode(row: Stored): SongRecord {
	return RecordSchema.parse({
		...row,
		updatedAt: row.updated_at,
		archived: Boolean(row.archived),
		data: JSON.parse(row.data),
	});
}
export async function listRecords(userId: string) {
	const { results } = await env.DB.prepare(
		"SELECT * FROM records WHERE owner = ? OR owner IN (SELECT organizationId FROM member WHERE userId = ?)",
	)
		.bind(userId, userId)
		.all<Stored>();
	return results.map(decode);
}
export async function getRecords(request: Request) {
	const user = await requireUser(request);
	return Response.json({ records: await listRecords(user.id) });
}
const OperationSchema = z.object({
	id: z.string().uuid(),
	record: RecordSchema,
	baseVersion: z.number().int().min(0),
});
export async function saveRecord(request: Request) {
	const user = await requireUser(request);
	const result = await saveOperation(
		user.id,
		OperationSchema.parse(await request.json()),
	);
	return "conflict" in result
		? Response.json({ server: result.conflict }, { status: 409 })
		: Response.json(result);
}
/** Applies one idempotent operation. A stale baseVersion yields the server copy, never an overwrite. */
export async function saveOperation(
	userId: string,
	{ record, baseVersion, id }: z.infer<typeof OperationSchema>,
): Promise<{ record: SongRecord } | { conflict: SongRecord }> {
	if (!(await canAccess(record.owner, userId, true)))
		throw new HttpError(
			403,
			"You no longer have permission to edit this library. Save your work as a personal copy.",
		);
	const completed = await env.DB.prepare(
		"SELECT * FROM operations WHERE id = ? AND user_id = ?",
	)
		.bind(id, userId)
		.first<{ record_id: string; version: number }>();
	if (completed) {
		const row = await env.DB.prepare("SELECT * FROM records WHERE id = ?")
			.bind(completed.record_id)
			.first<Stored>();
		if (!row) throw new HttpError(404, "Arrangement not found");
		return { record: decode(row) };
	}
	const existing = await env.DB.prepare("SELECT * FROM records WHERE id = ?")
		.bind(record.id)
		.first<Stored>();
	if (
		existing &&
		(existing.owner !== record.owner || existing.kind !== record.kind)
	)
		throw new HttpError(
			403,
			"Ownership cannot be changed. Make a copy into the destination library.",
		);
	const now = new Date().toISOString();
	const data = JSON.stringify(record.data);
	// The guard is part of the write, so simultaneous imports cannot both succeed.
	const uniqueSong = `NOT EXISTS (
		SELECT 1 FROM records WHERE owner = ? AND kind = 'arrangement'
		AND archived = 0 AND id != ?
		AND lower(trim(json_extract(data, '$.title'))) = lower(trim(?))
		AND lower(trim(json_extract(data, '$.artist'))) = lower(trim(?))
	)`;
	const guard =
		record.kind === "arrangement" && !record.archived ? uniqueSong : "1";
	const guardValues =
		record.kind === "arrangement" && !record.archived
			? [record.owner, record.id, record.data.title, record.data.artist]
			: [];
	const mutation = existing
		? env.DB.prepare(
				`UPDATE records SET data = ?, version = version + 1, updated_at = ?, archived = ?, last_operation = ? WHERE id = ? AND version = ? AND ${guard}`,
			).bind(
				data,
				now,
				Number(record.archived),
				id,
				record.id,
				baseVersion,
				...guardValues,
			)
		: env.DB.prepare(
				`INSERT OR IGNORE INTO records (id,kind,owner,version,updated_at,archived,data,last_operation) SELECT ?,?,?,1,?,?,?,? WHERE ? = 0 AND ${guard}`,
			).bind(
				record.id,
				record.kind,
				record.owner,
				now,
				Number(record.archived),
				data,
				id,
				baseVersion,
				...guardValues,
			);
	await env.DB.batch([
		mutation,
		env.DB.prepare(
			"INSERT OR IGNORE INTO revisions SELECT id,version,data,updated_at FROM records WHERE id = ? AND last_operation = ?",
		).bind(record.id, id),
		env.DB.prepare(
			"INSERT OR IGNORE INTO operations SELECT ?,?,id,version FROM records WHERE id = ? AND last_operation = ?",
		).bind(id, userId, record.id, id),
	]);
	const accepted = await env.DB.prepare(
		"SELECT id FROM operations WHERE id = ? AND user_id = ?",
	)
		.bind(id, userId)
		.first();
	const current = await env.DB.prepare("SELECT * FROM records WHERE id = ?")
		.bind(record.id)
		.first<Stored>();
	if (
		!accepted &&
		guardValues.length &&
		(!current || current.version === baseVersion)
	) {
		const duplicate = await env.DB.prepare(`SELECT ${uniqueSong} AS available`)
			.bind(...guardValues)
			.first<{ available: number }>();
		if (!duplicate?.available) throw new HttpError(422, duplicateSongMessage);
	}
	if (!current)
		throw new HttpError(
			400,
			"Cannot create a record from an existing revision.",
		);
	if (!accepted) return { conflict: decode(current) };
	return { record: decode(current) };
}
