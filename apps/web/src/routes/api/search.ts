import { boundedText } from "@chords/imports";
import { createFileRoute } from "@tanstack/react-router";
import { endpoint, HttpError } from "#/server/auth";
export const Route = createFileRoute("/api/search")({
	server: {
		handlers: {
			GET: endpoint(async (request) => {
				const query = new URL(request.url).searchParams.get("q")?.trim();
				if (!query || query.length > 300)
					throw new HttpError(
						400,
						"Enter a song or artist, up to 300 characters.",
					);
				const key = process.env.BRAVE_SEARCH_API_KEY;
				if (!key)
					throw new HttpError(
						503,
						"Web search needs a Brave Search API key. You can still import a URL or paste chord text.",
					);
				const url = new URL("https://api.search.brave.com/res/v1/web/search");
				url.searchParams.set("q", `${query} chords`);
				url.searchParams.set("count", "10");
				const response = await fetch(url, {
					headers: { "X-Subscription-Token": key, Accept: "application/json" },
					signal: AbortSignal.timeout(10_000),
				});
				if (!response.ok)
					throw new HttpError(
						502,
						"Web search is temporarily unavailable. Try a URL or paste chord text.",
					);
				const data = JSON.parse(await boundedText(response)) as {
					web?: {
						results?: { title: string; url: string; description: string }[];
					};
				};
				return Response.json({ results: data.web?.results || [] });
			}),
		},
	},
});
