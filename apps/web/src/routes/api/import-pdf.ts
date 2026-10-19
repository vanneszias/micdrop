import { createFileRoute } from "@tanstack/react-router";
import { endpoint, requireUser } from "#/server/auth";
import { startPdfJob } from "#/server/pdf-import-job";

export const Route = createFileRoute("/api/import-pdf")({
	server: {
		handlers: {
			POST: endpoint(
				async (request) => {
					const user = await requireUser(request);
					return Response.json(
						{ id: await startPdfJob(request, user.id) },
						{ status: 202 },
					);
				},
				{ contentType: "application/pdf", maxBytes: 10_000_000 },
			),
		},
	},
});
