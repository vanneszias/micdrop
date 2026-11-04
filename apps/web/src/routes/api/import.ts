import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { endpoint, requireUser } from "#/server/auth";
import { importFromUrl } from "#/server/import-page";
import { anonymousSubject, consumeQuota } from "#/server/quotas";

async function importPage(request: Request) {
	const { url, rendered } = z
		.object({ url: z.string().max(2000), rendered: z.boolean().default(false) })
		.parse(await request.json());
	// Signed-out songbooks can import too, so they are counted per IP instead.
	const user = await requireUser(request).catch(() => null);
	await consumeQuota(
		user ? user.id : anonymousSubject(request),
		user ? "url_import" : "anonymous_url_import",
	);
	return Response.json(await importFromUrl(url, rendered));
}
export const Route = createFileRoute("/api/import")({
	server: { handlers: { POST: endpoint(importPage) } },
});
