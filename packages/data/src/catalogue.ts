import type { Arrangement } from "./index";

export function searchText(value: string) {
	return value
		.normalize("NFKD")
		.replace(/\p{M}/gu, "")
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, " ")
		.trim();
}

export function searchGrams(value: string) {
	return [
		...new Set(
			searchText(value)
				.split(" ")
				.flatMap((word) =>
					word.length < 3
						? []
						: Array.from({ length: word.length - 2 }, (_, i) =>
								word.slice(i, i + 3),
							),
				),
		),
	].slice(0, 20);
}

export function searchRelevance(
	data: Pick<
		Arrangement["data"],
		"title" | "artist" | "tags" | "content" | "arrangementName"
	>,
	query: string,
) {
	const q = searchText(query);
	if (!q) return 1;
	const title = searchText(data.title);
	const artist = searchText(data.artist);
	const metadata = `${title} ${artist} ${searchText(data.arrangementName || "")}`;
	if (title === q) return 1000;
	if (artist === q) return 900;
	if (title.startsWith(q)) return 800;
	const words = q.split(" ");
	if (words.every((word) => metadata.includes(word))) return 700;
	const grams = searchGrams(q);
	const overlap =
		grams.filter((gram) => metadata.includes(gram)).length /
		(grams.length || 1);
	if (grams.length >= 2 && overlap >= 0.4) return 400 + overlap * 200;
	if (
		words.every((word) =>
			searchText(`${data.content} ${data.tags.join(" ")}`).includes(word),
		)
	)
		return 100;
	return 0;
}

export type CatalogueSummary = {
	id: string;
	record_id: string;
	song_id: string;
	data: Arrangement["data"];
	/** Major or minor, read from the sheet's first chord; list pages omit the sheet itself. */
	mode?: "major" | "minor";
	score: number;
	upvotes: number;
	downvotes: number;
	myVote: number;
	relevance: number;
};
export type CatalogueGroup = {
	id: string;
	title: string;
	relevance: number;
	count: number;
	artists: string;
	/** Key and mode of one public version, for the row's key tile. */
	key?: string;
	mode?: "major" | "minor";
};
export type CataloguePage = {
	groups: CatalogueGroup[];
	publications: CatalogueSummary[];
	next: number | null;
};

/** Ignore transport whitespace and key/capo headers; performance settings aren't new versions. */
export async function arrangementFingerprint(content: string) {
	const canonical = content
		.replace(/\r\n?/g, "\n")
		.replace(/\{(?:key|capo):[^}]*\}/gi, "")
		.trim();
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(canonical),
	);
	return Array.from(new Uint8Array(digest), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
}
