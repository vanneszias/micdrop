import { env } from "cloudflare:workers";
import {
	arrangementFingerprint,
	RecordSchema,
	type SongRecord,
} from "@chords/data";
import { z } from "zod";
import { canAccess, HttpError, requireUser } from "./auth";
import { checkRecordLimit } from "./quotas";

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
	if (!existing) await checkRecordLimit(record.owner);
	const now = new Date().toISOString();
	if (record.kind === "arrangement") {
		record.data.songId ||= record.id;
		const group = await env.DB.prepare(
			"SELECT COALESCE(merged_into,id) AS id FROM catalogue_songs WHERE id=?",
		)
			.bind(record.data.songId)
			.first<{ id: string }>();
		record.data.songId = group?.id || record.data.songId;
		if (
			record.data.visibility === "public" &&
			!record.data.draft &&
			!record.data.reviewRequired &&
			!record.data.content.trim()
		)
			throw new HttpError(
				422,
				"Add a chord sheet before publishing, or save privately / as a draft.",
			);
		record.data.contentHash = await arrangementFingerprint(record.data.content);
		if (
			record.data.copiedFrom &&
			record.data.sourceContentHash === record.data.contentHash &&
			record.data.visibility === "public"
		)
			record.data.visibility = "private";
	}
	const data = JSON.stringify(record.data);
	const mutation = existing
		? env.DB.prepare(
				`UPDATE records SET data = ?, version = version + 1, updated_at = ?, archived = ?, last_operation = ? WHERE id = ? AND version = ?`,
			).bind(data, now, Number(record.archived), id, record.id, baseVersion)
		: env.DB.prepare(
				`INSERT OR IGNORE INTO records (id,kind,owner,version,updated_at,archived,data,last_operation) SELECT ?,?,?,1,?,?,?,? WHERE ? = 0`,
			).bind(
				record.id,
				record.kind,
				record.owner,
				now,
				Number(record.archived),
				data,
				id,
				baseVersion,
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

	if (!current)
		throw new HttpError(
			400,
			"Cannot create a record from an existing revision.",
		);
	if (!accepted) return { conflict: decode(current) };
	return { record: decode(current) };
}
