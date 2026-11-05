import { env } from "cloudflare:workers";
import { logger } from "@sentry/cloudflare";
import { HttpError } from "./http-error";

const DAY = 86_400_000;

/** Daily caps on work that costs money per call. Generous for a band, tight for a script. */
export const QUOTAS = {
	pdf_import: { limit: 20, label: "PDF imports" },
	url_import: { limit: 100, label: "page imports" },
	anonymous_url_import: { limit: 30, label: "page imports without an account" },
	feedback: { limit: 20, label: "feedback messages" },
} as const;
export type QuotaKind = keyof typeof QUOTAS;
export const RECORD_LIMIT = 5000;
export const BAND_LIMIT = 10;

/** Who a signed-out request is counted against. Cloudflare sets this header; clients cannot. */
export function anonymousSubject(request: Request) {
	return `ip:${request.headers.get("cf-connecting-ip") || "unknown"}`;
}

/** Counts one use, or refuses with 429 once today's cap is reached. Atomic under concurrency. */
export async function consumeQuota(
	subject: string,
	kind: QuotaKind,
	now = Date.now(),
) {
	const { limit, label } = QUOTAS[kind];
	const result = await env.DB.prepare(
		`INSERT INTO usage_events (subject,kind,created_at) SELECT ?1,?2,?3
		WHERE (SELECT COUNT(*) FROM usage_events WHERE subject=?1 AND kind=?2 AND created_at>?4) < ?5`,
	)
		.bind(subject, kind, now, now - DAY, limit)
		.run();
	// Old events only matter for the overview; drop them now and then.
	if (Math.random() < 0.01)
		await env.DB.prepare("DELETE FROM usage_events WHERE created_at<?")
			.bind(now - 30 * DAY)
			.run();
	if (result.meta.changes) return;
	logger.warn("quota.exceeded", { subject, kind, limit });
	throw new HttpError(
		429,
		`You've reached the limit of ${limit} ${label} per day. Try again tomorrow.`,
	);
}

/** Refuses a new record once a library holds RECORD_LIMIT songs and setlists. */
export async function checkRecordLimit(owner: string) {
	const row = await env.DB.prepare(
		"SELECT COUNT(*) AS count FROM records WHERE owner=?",
	)
		.bind(owner)
		.first<{ count: number }>();
	if ((row?.count ?? 0) < RECORD_LIMIT) return;
	logger.warn("quota.exceeded", {
		subject: owner,
		kind: "records",
		limit: RECORD_LIMIT,
	});
	throw new HttpError(
		429,
		`This library holds the maximum of ${RECORD_LIMIT} songs and setlists. Delete some to add more.`,
	);
}

/** Whether a user already owns BAND_LIMIT bands. */
export async function reachedBandLimit(userId: string) {
	const row = await env.DB.prepare(
		"SELECT COUNT(*) AS count FROM member WHERE userId=? AND ','||role||',' LIKE '%,owner,%'",
	)
		.bind(userId)
		.first<{ count: number }>();
	const reached = (row?.count ?? 0) >= BAND_LIMIT;
	if (reached)
		logger.warn("quota.exceeded", {
			subject: userId,
			kind: "bands",
			limit: BAND_LIMIT,
		});
	return reached;
}
