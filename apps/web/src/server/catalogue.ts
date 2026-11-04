import { env } from "cloudflare:workers";
import {
	ArrangementData,
	arrangementFingerprint,
	type CatalogueGroup,
	type CatalogueSummary,
} from "@chords/data";
import { HttpError } from "./auth";
import { catalogueSearchQuery } from "./catalogue-query";

export async function catalogue(request: Request, userId: string) {
	const params = new URL(request.url).searchParams;
	const id = params.get("id");
	if (id) {
		const row = await env.DB.prepare(
			"SELECT id,record_id,song_id,data FROM publications WHERE id=? AND hidden=0 AND moderated=0",
		)
			.bind(id)
			.first<{
				id: string;
				record_id: string;
				song_id: string;
				data: string;
			}>();
		if (!row) throw new HttpError(404, "This arrangement is no longer public.");
		const data = ArrangementData.parse(JSON.parse(row.data));
		data.contentHash ||= await arrangementFingerprint(data.content);
		return {
			publication: {
				...row,
				data,
			},
		};
	}
	const q = (params.get("q") || "").trim().slice(0, 300).toLowerCase();
	const offset = Math.min(
		100_000,
		Math.max(0, Math.trunc(Number(params.get("offset"))) || 0),
	);
	let song = params.get("song");
	if (song) {
		const group = await env.DB.prepare(
			"SELECT COALESCE(merged_into,id) AS id FROM catalogue_songs WHERE id=?",
		)
			.bind(song)
			.first<{ id: string }>();
		song = group?.id || song;
	}
	const query = catalogueSearchQuery(q, offset, song);
	const { results: groups } = await env.DB.prepare(query.sql)
		.bind(...query.params)
		.all<CatalogueGroup>();
	const page = groups.slice(0, 30);
	// Return summaries, never full sheets or raw imports in catalogue result pages.
	let publications: CatalogueSummary[] = [];
	if (song) {
		const { results } =
			await env.DB.prepare(`SELECT p.id,p.record_id,p.song_id,json_remove(p.data,'$.content','$.rawSource') AS data,
		COALESCE(SUM(v.value),0) AS score,COUNT(CASE WHEN v.value=1 THEN 1 END) AS upvotes,COUNT(CASE WHEN v.value=-1 THEN 1 END) AS downvotes,COALESCE(MAX(CASE WHEN v.user_id=? THEN v.value END),0) AS myVote,1 AS relevance
		FROM publications p LEFT JOIN votes v ON v.publication_id=p.id WHERE p.song_id=? AND p.hidden=0 AND p.moderated=0 GROUP BY p.id ORDER BY score DESC,p.id LIMIT 31 OFFSET ?`)
				.bind(userId, song, offset)
				.all<Omit<CatalogueSummary, "data"> & { data: string }>();
		publications = results.slice(0, 30).map((row) => ({
			...row,
			data: ArrangementData.parse({ ...JSON.parse(row.data), content: "" }),
		}));
		return {
			groups: page,
			publications,
			next: results.length > 30 ? offset + 30 : null,
		};
	}
	return {
		groups: page,
		publications,
		next: groups.length > 30 ? offset + 30 : null,
	};
}

/** Platform administrators moderate the catalogue too; catalogue_admins is the narrower role. */
export async function isCatalogueAdmin(userId: string) {
	return !!(await env.DB.prepare(
		"SELECT 1 FROM user u WHERE u.id=? AND (','||COALESCE(u.role,'')||',' LIKE '%,admin,%' OR EXISTS(SELECT 1 FROM catalogue_admins c WHERE c.user_id=u.id))",
	)
		.bind(userId)
		.first());
}
