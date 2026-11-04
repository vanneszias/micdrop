import { env } from "cloudflare:workers";
import { logger } from "@sentry/cloudflare";
import { HttpError } from "./http-error";

const DAY = 86_400_000;
/** Accounts created from one IP within a day before the overview flags it. */
export const SIGNUP_BURST = 5;
export const PAGE_SIZE = 50;

/** Better Auth stores ISO text while our own tables store milliseconds; compare in milliseconds. */
const ms = (column: string) =>
	`(CASE WHEN typeof(${column})='text' THEN CAST(strftime('%s',${column}) AS INTEGER)*1000 ELSE ${column} END)`;

/** Records an administrator's access or change, so every look at private data leaves a trail. */
export function auditStatement(
	adminId: string,
	action: string,
	targetKind: string,
	targetId: string,
	data: Record<string, unknown> = {},
) {
	logger.info("admin.action", { adminId, action, targetKind, targetId });
	return env.DB.prepare(
		"INSERT INTO admin_actions (id,admin_id,action,target_kind,target_id,data,created_at) VALUES (?,?,?,?,?,?,?)",
	).bind(
		crypto.randomUUID(),
		adminId,
		action,
		targetKind,
		targetId,
		JSON.stringify(data),
		Date.now(),
	);
}

export async function overview(now = Date.now()) {
	const week = now - 7 * DAY;
	const day = now - DAY;
	const [totals, recentUsers, largestLibraries, pdfImporters, signupBursts] =
		await env.DB.batch([
			env.DB.prepare(`SELECT
				(SELECT COUNT(*) FROM user) AS users,
				(SELECT COUNT(*) FROM user WHERE ${ms("createdAt")}>=?1) AS newUsers,
				(SELECT COUNT(*) FROM user WHERE banned=1) AS bannedUsers,
				(SELECT COUNT(*) FROM organization) AS bands,
				(SELECT COUNT(*) FROM organization WHERE ${ms("createdAt")}>=?1) AS newBands,
				(SELECT COUNT(*) FROM records WHERE kind='arrangement' AND archived=0) AS songs,
				(SELECT COUNT(*) FROM records WHERE kind='setlist' AND archived=0) AS setlists,
				(SELECT COUNT(*) FROM records WHERE updated_at>=?3) AS changedRecords,
				(SELECT COUNT(*) FROM publications WHERE hidden=0 AND moderated=0) AS publications,
				(SELECT COUNT(*) FROM catalogue_reports WHERE resolved=0) AS openReports,
				(SELECT COUNT(*) FROM share_links WHERE revoked=0 AND (expires_at IS NULL OR expires_at>?4)) AS shareLinks,
				(SELECT COUNT(*) FROM oauthClient) AS oauthClients,
				(SELECT COUNT(*) FROM oauthClient WHERE userId IS NULL) AS anonymousClients,
				(SELECT COUNT(*) FROM pdf_import_jobs WHERE created_at>=?2) AS pdfImportsDay,
				(SELECT COUNT(*) FROM pdf_import_jobs WHERE created_at>=?1) AS pdfImportsWeek`).bind(
				week,
				day,
				new Date(week).toISOString(),
				now,
			),
			env.DB.prepare(
				"SELECT id,name,email,emailVerified,role,banned,createdAt FROM user ORDER BY createdAt DESC LIMIT 10",
			),
			env.DB.prepare(`SELECT r.owner AS id,COALESCE(u.name,o.name) AS name,CASE WHEN o.id IS NULL THEN 'user' ELSE 'band' END AS kind,
				COUNT(*) AS records,SUM(length(r.data)) AS bytes
				FROM records r LEFT JOIN user u ON u.id=r.owner LEFT JOIN organization o ON o.id=r.owner
				GROUP BY r.owner ORDER BY records DESC LIMIT 10`),
			env.DB.prepare(
				"SELECT u.id,u.name,u.email,COUNT(*) AS imports FROM pdf_import_jobs j JOIN user u ON u.id=j.user_id WHERE j.created_at>=? GROUP BY u.id ORDER BY imports DESC LIMIT 10",
			).bind(week),
			// Sessions expire, so this undercounts; it is a hint for where to look, not proof.
			env.DB.prepare(`SELECT s.ipAddress AS ip,COUNT(DISTINCT s.userId) AS accounts
				FROM session s JOIN user u ON u.id=s.userId
				WHERE ${ms("u.createdAt")}>=? AND COALESCE(s.ipAddress,'')!=''
				GROUP BY s.ipAddress HAVING accounts>=? ORDER BY accounts DESC LIMIT 10`).bind(
				day,
				SIGNUP_BURST,
			),
		]);
	return {
		totals: totals.results[0],
		recentUsers: recentUsers.results,
		largestLibraries: largestLibraries.results,
		pdfImporters: pdfImporters.results,
		signupBursts: signupBursts.results,
	};
}

const SORTS = {
	created: "u.createdAt DESC",
	seen: "lastSeen DESC NULLS LAST",
	records: "records DESC",
	imports: "pdfImports DESC",
} as const;
export type UserSort = keyof typeof SORTS;

export async function listUsers({
	query = "",
	sort = "created",
	filter = "all",
	offset = 0,
	now = Date.now(),
}: {
	query?: string;
	sort?: UserSort;
	filter?: "all" | "banned" | "admin";
	offset?: number;
	now?: number;
}) {
	const like = `%${query.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
	const { results } =
		await env.DB.prepare(`SELECT u.id,u.name,u.email,u.emailVerified,u.role,u.banned,u.createdAt,
		(SELECT COUNT(*) FROM records r WHERE r.owner=u.id) AS records,
		(SELECT COUNT(*) FROM member m WHERE m.userId=u.id) AS bands,
		(SELECT MAX(${ms("s.updatedAt")}) FROM session s WHERE s.userId=u.id) AS lastSeen,
		(SELECT COUNT(*) FROM pdf_import_jobs j WHERE j.user_id=u.id AND j.created_at>=?) AS pdfImports
		FROM user u
		WHERE (?='' OR u.name LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\' OR u.id=?)
		${filter === "banned" ? "AND u.banned=1" : filter === "admin" ? "AND ','||COALESCE(u.role,'')||',' LIKE '%,admin,%'" : ""}
		ORDER BY ${SORTS[sort]},u.id LIMIT ? OFFSET ?`)
			.bind(now - 7 * DAY, query, like, like, query, PAGE_SIZE + 1, offset)
			.all();
	return {
		users: results.slice(0, PAGE_SIZE),
		next: results.length > PAGE_SIZE ? offset + PAGE_SIZE : null,
	};
}

export async function userDetail(adminId: string, id: string) {
	const [
		user,
		accounts,
		sessions,
		bands,
		records,
		recordCount,
		publications,
		shareLinks,
		oauthClients,
		consents,
		imports,
		audit,
	] = await env.DB.batch([
		env.DB.prepare(
			"SELECT id,name,email,emailVerified,image,role,banned,banReason,banExpires,createdAt,updatedAt FROM user WHERE id=?",
		).bind(id),
		env.DB.prepare(
			"SELECT providerId,createdAt FROM account WHERE userId=? ORDER BY createdAt",
		).bind(id),
		// Never select the session token: it is a bearer credential.
		env.DB.prepare(
			"SELECT id,createdAt,updatedAt,expiresAt,ipAddress,userAgent,impersonatedBy FROM session WHERE userId=? ORDER BY updatedAt DESC LIMIT 50",
		).bind(id),
		env.DB.prepare(`SELECT o.id,o.name,m.role,
			(SELECT COUNT(*) FROM member x WHERE x.organizationId=o.id) AS members,
			(SELECT COUNT(*) FROM records r WHERE r.owner=o.id) AS records
			FROM member m JOIN organization o ON o.id=m.organizationId WHERE m.userId=? ORDER BY o.name`).bind(
			id,
		),
		env.DB.prepare(`SELECT id,kind,json_extract(data,'$.title') AS title,json_extract(data,'$.artist') AS artist,
			json_extract(data,'$.visibility') AS visibility,archived,version,updated_at AS updatedAt,length(data) AS bytes
			FROM records WHERE owner=? ORDER BY updated_at DESC LIMIT 200`).bind(id),
		env.DB.prepare(
			"SELECT COUNT(*) AS total,COALESCE(SUM(length(data)),0) AS bytes FROM records WHERE owner=?",
		).bind(id),
		env.DB.prepare(`SELECT p.id,json_extract(p.data,'$.title') AS title,p.hidden,p.moderated,p.updated_at AS updatedAt,
			(SELECT COALESCE(SUM(v.value),0) FROM votes v WHERE v.publication_id=p.id) AS score,
			(SELECT COUNT(*) FROM catalogue_reports c WHERE c.publication_id=p.id AND c.resolved=0) AS openReports
			FROM publications p WHERE p.owner=? ORDER BY p.updated_at DESC LIMIT 100`).bind(
			id,
		),
		// A share link's id is its secret, so the read-only view leaves it out.
		env.DB.prepare(
			"SELECT kind,target,role,created_at AS createdAt,expires_at AS expiresAt,revoked FROM share_links WHERE created_by=? ORDER BY created_at DESC LIMIT 100",
		).bind(id),
		env.DB.prepare(
			"SELECT clientId,name,uri,disabled,createdAt FROM oauthClient WHERE userId=? ORDER BY createdAt DESC",
		).bind(id),
		env.DB.prepare(
			"SELECT c.clientId,o.name,c.scopes,c.createdAt FROM oauthConsent c LEFT JOIN oauthClient o ON o.clientId=c.clientId WHERE c.userId=? ORDER BY c.createdAt DESC",
		).bind(id),
		env.DB.prepare(
			"SELECT id,status,error,created_at AS createdAt FROM pdf_import_jobs WHERE user_id=? ORDER BY created_at DESC LIMIT 20",
		).bind(id),
		env.DB.prepare(
			"SELECT a.id,a.action,a.data,a.created_at AS createdAt,u.name AS adminName FROM admin_actions a LEFT JOIN user u ON u.id=a.admin_id WHERE a.target_kind='user' AND a.target_id=? ORDER BY a.created_at DESC LIMIT 50",
		).bind(id),
	]);
	if (!user.results[0])
		throw new HttpError(404, "This account does not exist.");
	await auditStatement(adminId, "view_user", "user", id).run();
	return {
		user: user.results[0],
		accounts: accounts.results,
		sessions: sessions.results,
		bands: bands.results,
		records: records.results,
		recordTotals: recordCount.results[0],
		publications: publications.results,
		shareLinks: shareLinks.results,
		oauthClients: oauthClients.results,
		consents: consents.results,
		imports: imports.results,
		audit: audit.results,
	};
}
