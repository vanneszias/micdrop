import { env } from "cloudflare:workers";
import { ArrangementData } from "@chords/data";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { canAccess, endpoint, HttpError, requireUser } from "#/server/auth";

export const Route = createFileRoute("/api/publications")({
	server: {
		handlers: {
			GET: endpoint(async (request) => {
				const q =
					new URL(request.url).searchParams.get("q")?.slice(0, 300).trim() ||
					"";
				const user = await requireUser(request).catch(() => null);
				const filter = q
					? `AND p.id IN (SELECT publication_id FROM publication_search WHERE publication_search MATCH ?)`
					: "";
				const statement = env.DB.prepare(
					`SELECT p.id,p.record_id,p.data,p.updated_at,COALESCE(SUM(v.value),0) AS score,COUNT(CASE WHEN v.value=1 THEN 1 END) AS upvotes,COUNT(CASE WHEN v.value=-1 THEN 1 END) AS downvotes,COALESCE(MAX(CASE WHEN v.user_id=? THEN v.value END),0) AS myVote FROM publications p LEFT JOIN votes v ON v.publication_id=p.id WHERE p.hidden=0 ${filter} GROUP BY p.id ORDER BY score DESC,p.updated_at DESC LIMIT 50`,
				);
				const params = q
					? [
							user?.id || "",
							q
								.split(/\s+/)
								.map((word) => `"${word.replaceAll('"', '""')}"`)
								.join(" AND "),
						]
					: [user?.id || ""];
				const { results } = await statement.bind(...params).all<{
					id: string;
					record_id: string;
					data: string;
					score: number;
					upvotes: number;
					downvotes: number;
					myVote: number;
				}>();
				return Response.json({
					publications: results.map((row) => ({
						...row,
						data: ArrangementData.parse(JSON.parse(row.data)),
					})),
				});
			}),
			POST: endpoint(async (request) => {
				const user = await requireUser(request);
				const input = z
					.discriminatedUnion("action", [
						z.object({ action: z.literal("publish"), recordId: z.string() }),
						z.object({ action: z.literal("unpublish"), id: z.string() }),
						z.object({
							action: z.literal("vote"),
							id: z.string(),
							value: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
						}),
					])
					.parse(await request.json());
				if (input.action === "vote") {
					const publication = await env.DB.prepare(
						"SELECT id FROM publications WHERE id=? AND hidden=0",
					)
						.bind(input.id)
						.first();
					if (!publication)
						throw new HttpError(404, "This arrangement is no longer public.");
					if (input.value === 0)
						await env.DB.prepare(
							"DELETE FROM votes WHERE publication_id=? AND user_id=?",
						)
							.bind(input.id, user.id)
							.run();
					else
						await env.DB.prepare(
							"INSERT INTO votes VALUES (?,?,?) ON CONFLICT(publication_id,user_id) DO UPDATE SET value=excluded.value",
						)
							.bind(input.id, user.id, input.value)
							.run();
					return Response.json({ ok: true });
				}
				if (input.action === "unpublish") {
					const publication = await env.DB.prepare(
						"SELECT owner FROM publications WHERE id=?",
					)
						.bind(input.id)
						.first<{ owner: string }>();
					if (
						!publication ||
						!(await canAccess(publication.owner, user.id, false, true))
					)
						throw new HttpError(
							403,
							"Only the owner can unpublish this arrangement.",
						);
					await env.DB.batch([
						env.DB.prepare("UPDATE publications SET hidden=1 WHERE id=?").bind(
							input.id,
						),
						env.DB.prepare(
							"DELETE FROM publication_search WHERE publication_id=?",
						).bind(input.id),
					]);
					return Response.json({ ok: true });
				}
				const record = await env.DB.prepare(
					"SELECT owner,data FROM records WHERE id=? AND kind='arrangement' AND archived=0",
				)
					.bind(input.recordId)
					.first<{ owner: string; data: string }>();
				if (!record || !(await canAccess(record.owner, user.id, false, true)))
					throw new HttpError(
						403,
						"Only the library owner can publish this arrangement.",
					);
				const data = ArrangementData.parse(JSON.parse(record.data));
				const previous = await env.DB.prepare(
					"SELECT id FROM publications WHERE record_id=?",
				)
					.bind(input.recordId)
					.first<{ id: string }>();
				const id = previous?.id || crypto.randomUUID();
				await env.DB.batch([
					env.DB.prepare(
						"INSERT INTO publications VALUES (?,?,?,?,?,0) ON CONFLICT(record_id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at,hidden=0",
					).bind(
						id,
						input.recordId,
						record.owner,
						record.data,
						new Date().toISOString(),
					),
					env.DB.prepare(
						"DELETE FROM publication_search WHERE publication_id=?",
					).bind(id),
					env.DB.prepare(
						"INSERT INTO publication_search VALUES (?,?,?,?,?)",
					).bind(
						id,
						data.title,
						data.artist,
						data.content,
						data.tags.join(" "),
					),
				]);
				return Response.json({ id });
			}),
		},
	},
});
