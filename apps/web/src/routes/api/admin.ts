import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { listUsers, overview, userDetail } from "#/server/admin";
import { AdminAction, runAdminAction } from "#/server/admin-actions";
import { endpoint, requireAdmin } from "#/server/auth";

const Query = z.discriminatedUnion("view", [
	z.object({ view: z.literal("overview") }),
	z.object({
		view: z.literal("users"),
		query: z.string().trim().max(200).default(""),
		sort: z.enum(["created", "seen", "records", "imports"]).default("created"),
		filter: z.enum(["all", "banned", "admin"]).default("all"),
		offset: z.coerce.number().int().min(0).default(0),
	}),
	z.object({ view: z.literal("user"), id: z.string().min(1).max(200) }),
]);

export const Route = createFileRoute("/api/admin")({
	server: {
		handlers: {
			GET: endpoint(async (request) => {
				const admin = await requireAdmin(request);
				const input = Query.parse(
					Object.fromEntries(new URL(request.url).searchParams),
				);
				const headers = { "Cache-Control": "no-store" };
				if (input.view === "overview")
					return Response.json(await overview(), { headers });
				if (input.view === "users")
					return Response.json(await listUsers(input), { headers });
				return Response.json(await userDetail(admin.id, input.id), {
					headers,
				});
			}),
			POST: endpoint(async (request) => {
				const admin = await requireAdmin(request);
				const input = AdminAction.parse(await request.json());
				return Response.json(await runAdminAction(request, admin.id, input));
			}),
		},
	},
});
