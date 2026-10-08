import { createFileRoute } from "@tanstack/react-router";
import { endpoint } from "#/server/auth";
import { getRecords, saveRecord } from "#/server/sync";
export const Route = createFileRoute("/api/sync")({
	server: {
		handlers: { GET: endpoint(getRecords), POST: endpoint(saveRecord) },
	},
});
