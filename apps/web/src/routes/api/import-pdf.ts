import { createFileRoute } from "@tanstack/react-router";
import { endpoint, requireUser } from "#/server/auth";
import { importPdf } from "#/server/pdf-import";

export const Route = createFileRoute("/api/import-pdf")({
	server: {
		handlers: {
			POST: endpoint(
				async (request) => {
					await requireUser(request);
					return Response.json(
						await importPdf(
							request,
							process.env.OPENAI_API_KEY,
							process.env.OPENAI_PDF_MODEL,
						),
					);
				},
				{ contentType: "application/pdf", maxBytes: 10_000_000 },
			),
		},
	},
});
