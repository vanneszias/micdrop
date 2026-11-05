import { env } from "cloudflare:workers";
import { logger } from "@sentry/cloudflare";
import { z } from "zod";
import { auditStatement, PAGE_SIZE } from "./admin";
import { HttpError } from "./http-error";
import { consumeQuota } from "./quotas";

export const FEEDBACK_KINDS = ["bug", "idea", "other"] as const;

const text = (max: number) => z.string().trim().max(max);

/** Where the user was when they wrote it. Every field is optional: the client fills what it knows. */
export const FeedbackContext = z
	.object({
		path: text(500),
		title: text(200),
		library: text(200),
		libraryName: text(200),
		release: text(100),
		online: z.boolean(),
		pending: z.number().int().min(0).max(1_000_000),
		viewport: text(40),
		standalone: z.boolean(),
		language: text(40),
		timeZone: text(80),
		theme: text(20),
	})
	.partial();

export const Feedback = z.object({
	kind: z.enum(FEEDBACK_KINDS),
	message: z.string().trim().min(3).max(4000),
	context: FeedbackContext.default({}),
});

export async function submitFeedback(
	request: Request,
	userId: string,
	input: z.infer<typeof Feedback>,
) {
	await consumeQuota(userId, "feedback");
	const id = crypto.randomUUID();
	// The server adds what the client can't be trusted to report about itself.
	const context = {
		...input.context,
		userAgent: request.headers.get("User-Agent")?.slice(0, 500) ?? "",
		country: request.headers.get("cf-ipcountry") ?? "",
	};
	await env.DB.prepare(
		"INSERT INTO feedback (id,user_id,kind,message,context,created_at) VALUES (?,?,?,?,?,?)",
	)
		.bind(
			id,
			userId,
			input.kind,
			input.message,
			JSON.stringify(context),
			Date.now(),
		)
		.run();
	logger.info("feedback.submitted", { id, userId, kind: input.kind });
	return { id };
}

export async function listFeedback({
	status = "open",
	offset = 0,
}: {
	status?: "open" | "resolved" | "all";
	offset?: number;
}) {
	const { results } =
		await env.DB.prepare(`SELECT f.id,f.kind,f.message,f.context,f.created_at AS createdAt,f.resolved_at AS resolvedAt,
		f.user_id AS userId,u.name AS userName,u.email AS userEmail,r.name AS resolverName
		FROM feedback f LEFT JOIN user u ON u.id=f.user_id LEFT JOIN user r ON r.id=f.resolved_by
		WHERE (?1='all' OR (?1='open')=(f.resolved_at IS NULL))
		ORDER BY f.created_at DESC,f.id LIMIT ?2 OFFSET ?3`)
			.bind(status, PAGE_SIZE + 1, offset)
			.all();
	return {
		rows: results.slice(0, PAGE_SIZE),
		next: results.length > PAGE_SIZE ? offset + PAGE_SIZE : null,
	};
}

export async function resolveFeedback(
	adminId: string,
	id: string,
	resolved: boolean,
) {
	const row = await env.DB.prepare("SELECT user_id FROM feedback WHERE id=?")
		.bind(id)
		.first<{ user_id: string }>();
	if (!row) throw new HttpError(404, "This feedback does not exist.");
	await env.DB.batch([
		env.DB.prepare(
			"UPDATE feedback SET resolved_at=?,resolved_by=? WHERE id=?",
		).bind(resolved ? Date.now() : null, resolved ? adminId : null, id),
		auditStatement(
			adminId,
			resolved ? "resolve_feedback" : "reopen_feedback",
			"feedback",
			id,
			{ userId: row.user_id },
		),
	]);
	return { ok: true };
}
