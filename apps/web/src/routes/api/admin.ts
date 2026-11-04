import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
	auditLog,
	bandDetail,
	listBands,
	listOAuthClients,
	listRecords,
	listShareLinks,
	listUsers,
	overview,
	recordDetail,
	userDetail,
} from "#/server/admin";
import { AdminAction, runAdminAction } from "#/server/admin-actions";
import { endpoint, requireAdmin } from "#/server/auth";

const offset = z.coerce.number().int().min(0).default(0);

const Query = z.discriminatedUnion("view", [
	z.object({ view: z.literal("overview") }),
	z.object({
		view: z.literal("users"),
		query: z.string().trim().max(200).default(""),
		sort: z.enum(["created", "seen", "records", "imports"]).default("created"),
		filter: z.enum(["all", "banned", "admin"]).default("all"),
		offset,
	}),
	z.object({ view: z.literal("user"), id: z.string().min(1).max(200) }),
	z.object({
		view: z.literal("bands"),
		query: z.string().trim().max(200).default(""),
		offset,
	}),
	z.object({ view: z.literal("band"), id: z.string().min(1).max(200) }),
	z.object({
		view: z.literal("records"),
		query: z.string().trim().max(200).default(""),
		kind: z.enum(["all", "arrangement", "setlist"]).default("all"),
		offset,
	}),
	z.object({
		view: z.literal("record"),
		id: z.string().min(1).max(200),
		version: z.coerce.number().int().min(0).optional(),
	}),
	z.object({ view: z.literal("clients"), offset }),
	z.object({
		view: z.literal("links"),
		active: z.enum(["1", "0"]).default("1"),
		offset,
	}),
	z.object({ view: z.literal("audit"), offset }),
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
				const body = await (() => {
					switch (input.view) {
						case "overview":
							return overview();
						case "users":
							return listUsers(input);
						case "user":
							return userDetail(admin.id, input.id);
						case "bands":
							return listBands(input);
						case "band":
							return bandDetail(admin.id, input.id);
						case "records":
							return listRecords(input);
						case "record":
							return recordDetail(admin.id, input.id, input.version);
						case "clients":
							return listOAuthClients(input);
						case "links":
							return listShareLinks({
								active: input.active === "1",
								offset: input.offset,
							});
						case "audit":
							return auditLog(input);
					}
				})();
				return Response.json(body, { headers });
			}),
			POST: endpoint(async (request) => {
				const admin = await requireAdmin(request);
				const input = AdminAction.parse(await request.json());
				return Response.json(await runAdminAction(request, admin.id, input));
			}),
		},
	},
});
