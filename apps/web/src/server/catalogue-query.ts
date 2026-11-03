import { searchGrams } from "@chords/data";

export function catalogueSearchQuery(
	q: string,
	offset = 0,
	song: string | null = null,
) {
	const words = q.match(/[\p{L}\p{N}]+/gu)?.slice(0, 20) || [];
	if (q && !words.length)
		return { sql: "SELECT id FROM catalogue_songs WHERE 0", params: [] };
	const grams = searchGrams(q);
	const fts = words.map((word) => `"${word}"*`).join(" AND ");
	const fuzzy = grams.map((gram) => `"${gram}"`).join(" OR ");
	const candidates =
		q && words.length
			? `p.id IN (SELECT publication_id FROM publication_search WHERE publication_search MATCH ? ${fuzzy ? "UNION SELECT publication_id FROM catalogue_grams WHERE catalogue_grams MATCH ?" : ""})`
			: "1";
	const bindings: (string | number)[] =
		q && words.length ? [fts, ...(fuzzy ? [fuzzy] : [])] : [];
	const metadata =
		"lower(json_extract(p.data,'$.title') || ' ' || json_extract(p.data,'$.artist') || ' ' || COALESCE(json_extract(p.data,'$.arrangementName'),''))";
	const overlap = grams.length
		? `(${grams.map(() => `(instr(${metadata},?)>0)`).join("+")}) * 1.0 / ${grams.length}`
		: "0";
	const rank = q
		? `CASE WHEN lower(trim(json_extract(p.data,'$.title')))=? THEN 1000 WHEN lower(trim(json_extract(p.data,'$.artist')))=? THEN 900 WHEN lower(json_extract(p.data,'$.title')) LIKE ? ESCAPE '\\' THEN 800 WHEN ${words.length ? words.map(() => `instr(${metadata},?)>0`).join(" AND ") : "0"} THEN 700 WHEN ${overlap}>=0.4 THEN 400+200*${overlap} WHEN p.id IN (SELECT publication_id FROM publication_search WHERE publication_search MATCH ?) THEN 100 ELSE 0 END`
		: "1";
	const rankBindings = q
		? [
				q,
				q,
				`${q.replace(/[\\%_]/g, "\\$&")}%`,
				...words,
				...grams,
				...grams,
				fts,
			]
		: [];

	return {
		sql: `WITH matches AS (
		SELECT p.song_id,${rank} AS relevance,json_extract(p.data,'$.artist') AS artist,json_extract(p.data,'$.title') AS title FROM publications p
		WHERE p.hidden=0 AND p.moderated=0 AND ${candidates} ${song ? "AND p.song_id=?" : ""}
	) SELECT s.id,MIN(m.title) AS title,MAX(m.relevance) AS relevance,COUNT(*) AS count,GROUP_CONCAT(DISTINCT m.artist) AS artists
	FROM matches m JOIN catalogue_songs s ON s.id=m.song_id WHERE m.relevance>0 GROUP BY s.id ORDER BY relevance DESC,title COLLATE NOCASE,s.id LIMIT 31 OFFSET ?`,
		params: [...rankBindings, ...bindings, ...(song ? [song] : []), offset],
	};
}
