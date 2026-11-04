import { env } from "cloudflare:workers";
import { logger } from "@sentry/cloudflare";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { canAccess, endpoint, HttpError, requireUser } from "#/server/auth";
import { catalogue, isCatalogueAdmin } from "#/server/catalogue";
import { decode, saveOperation } from "#/server/sync";

const Input = z.discriminatedUnion("action", [
	z.object({ action: z.literal("publish"), recordId: z.string() }),
	z.object({ action: z.literal("unpublish"), id: z.string() }),
	z.object({
		action: z.literal("vote"),
		id: z.string(),
		value: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
	}),
	z.object({
		action: z.literal("report"),
		id: z.string(),
		reason: z.string().trim().min(3).max(2000),
	}),
	z.object({ action: z.literal("hide"), id: z.string(), hidden: z.boolean() }),
	z.object({ action: z.literal("resolve"), id: z.string() }),
	z.object({
		action: z.literal("merge"),
		source: z.string(),
		target: z.string(),
	}),
	z.object({
		action: z.literal("regroup"),
		id: z.string(),
		target: z.string(),
	}),
]);

export const Route = createFileRoute("/api/publications")({
	server: {
		handlers: {
			GET: endpoint(async (request) => {
				const user = await requireUser(request).catch(() => null);
				if (new URL(request.url).searchParams.has("admin")) {
					if (!user || !(await isCatalogueAdmin(user.id)))
						throw new HttpError(
							403,
							"Catalogue administrator access required.",
						);
					const reports = await env.DB.prepare(
						"SELECT r.*,json_extract(p.data,'$.title') AS title,p.song_id,p.moderated FROM catalogue_reports r JOIN publications p ON p.id=r.publication_id WHERE r.resolved=0 ORDER BY r.created_at LIMIT 100",
					).all();
					return Response.json({ reports: reports.results });
				}
				return Response.json({
					...(await catalogue(request, user?.id || "")),
					admin: user ? await isCatalogueAdmin(user.id) : false,
				});
			}),
			POST: endpoint(async (request) => {
				const user = await requireUser(request);
				const input = Input.parse(await request.json());
				if (input.action === "publish" || input.action === "unpublish") {
					const row = await env.DB.prepare(
						input.action === "publish"
							? "SELECT * FROM records WHERE id=? AND kind='arrangement' AND archived=0"
							: "SELECT r.* FROM records r JOIN publications p ON p.record_id=r.id WHERE p.id=?",
					)
						.bind(input.action === "publish" ? input.recordId : input.id)
						.first<Parameters<typeof decode>[0]>();
					if (!row || !(await canAccess(row.owner, user.id, true)))
						throw new HttpError(
							403,
							"Only the creator or band editors can publish this arrangement.",
						);
					const record = decode(row);
					if (record.kind !== "arrangement")
						throw new HttpError(400, "Choose an arrangement.");
					record.data = {
						...record.data,
						visibility: input.action === "publish" ? "public" : "private",
						draft: false,
					};
					const result = await saveOperation(user.id, {
						record,
						baseVersion: record.version,
						id: crypto.randomUUID(),
					});
					if ("conflict" in result)
						return Response.json({ server: result.conflict }, { status: 409 });
					const publication = await env.DB.prepare(
						"SELECT id FROM publications WHERE record_id=? AND hidden=0 AND moderated=0",
					)
						.bind(record.id)
						.first<{ id: string }>();
					return Response.json({
						ok: true,
						id: publication?.id,
						record: result.record,
						alreadyPublic: input.action === "publish" && !publication,
					});
				}
				if (input.action === "vote" || input.action === "report") {
					const row = await env.DB.prepare(
						"SELECT id FROM publications WHERE id=? AND hidden=0 AND moderated=0",
					)
						.bind(input.id)
						.first();
					if (!row)
						throw new HttpError(404, "This arrangement is no longer public.");
					if (input.action === "report") {
						await env.DB.prepare(
							"INSERT INTO catalogue_reports(id,publication_id,user_id,reason,created_at) VALUES(?,?,?,?,?)",
						)
							.bind(
								crypto.randomUUID(),
								input.id,
								user.id,
								input.reason,
								new Date().toISOString(),
							)
							.run();
						logger.warn("report.created", {
							publicationId: input.id,
							userId: user.id,
						});
					} else if (!input.value) {
						await env.DB.prepare(
							"DELETE FROM votes WHERE publication_id=? AND user_id=?",
						)
							.bind(input.id, user.id)
							.run();
					} else {
						await env.DB.prepare(
							"INSERT INTO votes VALUES(?,?,?) ON CONFLICT(publication_id,user_id) DO UPDATE SET value=excluded.value",
						)
							.bind(input.id, user.id, input.value)
							.run();
					}
					return Response.json({ ok: true });
				}
				if (!(await isCatalogueAdmin(user.id)))
					throw new HttpError(403, "Catalogue administrator access required.");
				const statements = [];
				if (input.action === "hide")
					statements.push(
						env.DB.prepare(
							"UPDATE publications SET moderated=? WHERE id=?",
						).bind(Number(input.hidden), input.id),
					);
				if (input.action === "resolve")
					statements.push(
						env.DB.prepare(
							"UPDATE catalogue_reports SET resolved=1 WHERE id=?",
						).bind(input.id),
					);
				if (input.action === "merge" || input.action === "regroup") {
					const target = await env.DB.prepare(
						"SELECT id FROM catalogue_songs WHERE id=? AND merged_into IS NULL",
					)
						.bind(input.target)
						.first();
					if (!target)
						throw new HttpError(
							400,
							"Choose an active destination song group.",
						);
					if (input.action === "merge" && input.source === input.target)
						throw new HttpError(400, "Choose two different groups.");
					const now = new Date().toISOString();
					const operation = crypto.randomUUID();
					const filter =
						input.action === "merge"
							? "json_extract(data,'$.songId')=?"
							: `id IN (WITH RECURSIVE lineage(id) AS (
						SELECT record_id FROM publications WHERE id=?
						UNION SELECT r.id FROM records r JOIN lineage l ON json_extract(r.data,'$.copiedFrom')=l.id OR json_extract(r.data,'$.copiedFrom')=(SELECT id FROM publications WHERE record_id=l.id)
					) SELECT id FROM lineage)`;
					statements.push(
						env.DB.prepare(
							`UPDATE records SET data=json_set(data,'$.songId',?),version=version+1,updated_at=?,last_operation=? WHERE kind='arrangement' AND ${filter}`,
						).bind(
							input.target,
							now,
							operation,
							input.action === "merge" ? input.source : input.id,
						),
					);
					statements.push(
						env.DB.prepare(
							"INSERT INTO revisions SELECT id,version,data,updated_at FROM records WHERE last_operation=?",
						).bind(operation),
					);
					// Draft publications must move too; their last published content remains unchanged.
					statements.push(
						env.DB.prepare(
							`UPDATE publications SET song_id=?,data=json_set(data,'$.songId',?) WHERE ${input.action === "merge" ? "song_id=?" : "record_id IN (SELECT id FROM records WHERE last_operation=?)"}`,
						).bind(
							input.target,
							input.target,
							input.action === "merge" ? input.source : operation,
						),
					);
					if (input.action === "merge") {
						statements.push(
							env.DB.prepare(
								"UPDATE catalogue_songs SET merged_into=? WHERE id=? OR merged_into=?",
							).bind(input.target, input.source, input.source),
						);
					}
				}
				statements.push(
					env.DB.prepare(
						"INSERT INTO catalogue_actions VALUES(?,?,?,?,?)",
					).bind(
						crypto.randomUUID(),
						user.id,
						input.action,
						JSON.stringify(input),
						new Date().toISOString(),
					),
				);
				await env.DB.batch(statements);
				return Response.json({ ok: true });
			}),
		},
	},
});
