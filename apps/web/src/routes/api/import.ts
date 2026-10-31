import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { endpoint } from "#/server/auth";
import { importFromUrl } from "#/server/import-page";

async function importPage(request: Request) {
	const { url, rendered } = z
		.object({ url: z.string().max(2000), rendered: z.boolean().default(false) })
		.parse(await request.json());
	return Response.json(await importFromUrl(url, rendered));
}
export const Route = createFileRoute("/api/import")({
	server: { handlers: { POST: endpoint(importPage) } },
});
