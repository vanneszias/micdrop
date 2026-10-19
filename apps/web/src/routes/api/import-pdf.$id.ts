import { createFileRoute } from "@tanstack/react-router";
import { endpoint, requireUser } from "#/server/auth";
import { readPdfJob } from "#/server/pdf-import-job";

export const Route = createFileRoute("/api/import-pdf/$id")({
	server: {
		handlers: {
			GET: endpoint(async (request) => {
				const user = await requireUser(request);
				const id = new URL(request.url).pathname.split("/").pop() || "";
				return Response.json(await readPdfJob(id, user.id), {
					headers: { "Cache-Control": "no-store" },
				});
			}),
		},
	},
});
