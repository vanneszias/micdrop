import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { endpoint, getAuth, HttpError, requireUser } from "#/server/auth";
export const Route = createFileRoute("/api/bands")({
	server: {
		handlers: {
			GET: endpoint(async (request) => {
				const user = await requireUser(request);
				const { results: bands } = await env.DB.prepare(
					"SELECT o.id,o.name,m.role FROM organization o JOIN member m ON m.organizationId=o.id WHERE m.userId=?",
				)
					.bind(user.id)
					.all<{ id: string; name: string; role: string }>();
				const members = await Promise.all(
					bands.map(async (band) => {
						const { results } = await env.DB.prepare(
							"SELECT m.id,m.role,u.name,u.email FROM member m JOIN user u ON u.id=m.userId WHERE m.organizationId=?",
						)
							.bind(band.id)
							.all();
						return { ...band, members: results };
					}),
				);
				return Response.json({ bands: members });
			}),
			POST: endpoint(async (request) => {
				const user = await requireUser(request);
				const input = z
					.discriminatedUnion("action", [
						z.object({
							action: z.literal("create"),
							name: z.string().min(1).max(100),
						}),
						z.object({
							action: z.literal("add"),
							bandId: z.string(),
							email: z.email(),
							role: z.enum(["editor", "viewer"]),
						}),
						z.object({
							action: z.literal("remove"),
							bandId: z.string(),
							memberId: z.string(),
						}),
					])
					.parse(await request.json());
				if (input.action === "create") {
					const band = await getAuth().api.createOrganization({
						headers: request.headers,
						body: {
							name: input.name,
							slug: `${input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${crypto.randomUUID().slice(0, 8)}`,
						},
					});
					return Response.json({ band });
				}
				const owner = await env.DB.prepare(
					"SELECT id FROM member WHERE organizationId=? AND userId=? AND role='owner'",
				)
					.bind(input.bandId, user.id)
					.first();
				if (!owner)
					throw new HttpError(403, "Only the band owner can manage members.");
				if (input.action === "remove") {
					await env.DB.prepare(
						"DELETE FROM member WHERE id=? AND organizationId=? AND role!='owner'",
					)
						.bind(input.memberId, input.bandId)
						.run();
				} else {
					const member = await env.DB.prepare(
						"SELECT id FROM user WHERE lower(email)=lower(?)",
					)
						.bind(input.email)
						.first<{ id: string }>();
					if (!member)
						throw new HttpError(
							422,
							"Ask this person to create an account first, then add their email here.",
						);
					await env.DB.prepare(
						"INSERT INTO member VALUES (?,?,?,?,?) ON CONFLICT(organizationId,userId) DO UPDATE SET role=CASE WHEN member.role='owner' THEN member.role ELSE excluded.role END",
					)
						.bind(
							crypto.randomUUID(),
							input.bandId,
							member.id,
							input.role,
							Date.now(),
						)
						.run();
				}
				return Response.json({ ok: true });
			}),
		},
	},
});
