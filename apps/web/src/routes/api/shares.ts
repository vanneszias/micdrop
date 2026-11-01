import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { endpoint, requireUser } from "#/server/auth";
import {
	acceptInvite,
	createShare,
	INVITE_ROLES,
	listShares,
	resolveShare,
	revokeShare,
} from "#/server/shares";

const Kind = z.enum(["record", "invite"]);

export const Route = createFileRoute("/api/shares")({
	server: {
		handlers: {
			GET: endpoint(async (request) => {
				const query = new URL(request.url).searchParams;
				const token = query.get("token");
				if (token) return Response.json({ share: await resolveShare(token) });
				const user = await requireUser(request);
				const links = await listShares(
					user.id,
					Kind.parse(query.get("kind")),
					z.string().min(1).parse(query.get("target")),
				);
				return Response.json({ links });
			}),
			POST: endpoint(async (request) => {
				const user = await requireUser(request);
				const input = z
					.discriminatedUnion("action", [
						z.object({
							action: z.literal("share"),
							recordId: z.string().min(1),
						}),
						z.object({
							action: z.literal("invite"),
							bandId: z.string().min(1),
							role: z.enum(INVITE_ROLES),
						}),
						z.object({ action: z.literal("revoke"), id: z.string() }),
						z.object({ action: z.literal("accept"), id: z.string() }),
					])
					.parse(await request.json());
				if (input.action === "share")
					return Response.json({
						link: await createShare(user.id, "record", input.recordId),
					});
				if (input.action === "invite")
					return Response.json({
						link: await createShare(
							user.id,
							"invite",
							input.bandId,
							input.role,
						),
					});
				if (input.action === "accept")
					return Response.json(await acceptInvite(user.id, input.id));
				await revokeShare(user.id, input.id);
				return Response.json({ ok: true });
			}),
		},
	},
});
