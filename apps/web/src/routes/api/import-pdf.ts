import { createFileRoute } from "@tanstack/react-router";
import { endpoint, requireUser } from "#/server/auth";
import { startPdfJob } from "#/server/pdf-import-job";
import { consumeQuota } from "#/server/quotas";

export const Route = createFileRoute("/api/import-pdf")({
	server: {
		handlers: {
			POST: endpoint(
				async (request) => {
					const user = await requireUser(request);
					await consumeQuota(user.id, "pdf_import");
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
