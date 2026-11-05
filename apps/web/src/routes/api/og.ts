import { createFileRoute } from "@tanstack/react-router";
import { endpoint } from "#/server/auth";
import { DEFAULT_CARD, shareCard } from "#/server/shares";

/** Link-preview image: `/api/og` for the site, `/api/og?token=…` for a share or invite link. */
export const Route = createFileRoute("/api/og")({
	server: {
		handlers: {
			GET: endpoint(async (request) => {
				// Rendering costs CPU, so each image is kept in this colo's cache for an hour.
				// The DOM lib hides Workers' default cache from the type.
				const cache = (caches as unknown as { default: Cache }).default;
				const cached = await cache.match(request);
				if (cached) return cached;
				const url = new URL(request.url);
				const token = url.searchParams.get("token");
				const card = (token && (await shareCard(token))) || DEFAULT_CARD;
				// Loaded on demand so other requests skip the WebAssembly renderer.
				const { renderCard } = await import("#/server/og");
				const response = new Response(await renderCard(card, url.host), {
					headers: {
						"Content-Type": "image/png",
						"Cache-Control": "public, max-age=3600",
					},
				});
				await cache.put(request, response.clone());
				return response;
			}),
		},
	},
});
