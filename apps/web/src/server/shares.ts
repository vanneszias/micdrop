import { env } from "cloudflare:workers";
import type { Arrangement, Setlist, SongRecord } from "@chords/data";
import { canAccess, HttpError } from "./auth";
import { decode } from "./sync";

export const INVITE_TTL = 7 * 24 * 60 * 60 * 1000;
export const INVITE_ROLES = ["editor", "viewer"] as const;

type ShareKind = "record" | "invite";
type Link = {
	id: string;
	kind: ShareKind;
	target: string;
	role: string | null;
	created_by: string;
	expires_at: number | null;
};
export type ShareLink = {
	id: string;
	role: string | null;
	expiresAt: number | null;
};
export type ResolvedShare =
	| { kind: "song"; record: Arrangement }
	| { kind: "setlist"; record: Setlist; songs: Arrangement[] }
	| {
			kind: "invite";
			band: { id: string; name: string };
			role: string;
			inviter: string;
			expiresAt: number | null;
	  };

const ACTIVE = "revoked = 0 AND (expires_at IS NULL OR expires_at > ?)";
const gone = () =>
	new HttpError(404, "This link has expired or sharing was turned off.");

/** 192 random bits, so links can't be guessed or enumerated. */
function token() {
	const bytes = crypto.getRandomValues(new Uint8Array(24));
	return btoa(String.fromCharCode(...bytes))
		.replaceAll("+", "-")
		.replaceAll("/", "_");
}

async function authorize(kind: ShareKind, target: string, userId: string) {
	if (kind === "invite") {
		if (!(await canAccess(target, userId, false, true)))
			throw new HttpError(403, "Only the band owner can create invite links.");
		return;
	}
	const record = await env.DB.prepare("SELECT owner FROM records WHERE id = ?")
		.bind(target)
		.first<{ owner: string }>();
	if (!record)
		throw new HttpError(404, "Sync this item to the cloud before sharing it.");
	if (!(await canAccess(record.owner, userId, true)))
		throw new HttpError(403, "Only editors of this library can share it.");
}

const toLink = (row: Link): ShareLink => ({
	id: row.id,
	role: row.role,
	expiresAt: row.expires_at,
});

export async function listShares(
	userId: string,
	kind: ShareKind,
	target: string,
) {
	await authorize(kind, target, userId);
	const { results } = await env.DB.prepare(
		`SELECT * FROM share_links WHERE target = ? AND kind = ? AND ${ACTIVE} ORDER BY created_at`,
	)
		.bind(target, kind, Date.now())
		.all<Link>();
	return results.map(toLink);
}

/** Returns the active link for this target (and role), creating one if needed. */
export async function createShare(
	userId: string,
	kind: ShareKind,
	target: string,
	role: string | null = null,
) {
	await authorize(kind, target, userId);
	const now = Date.now();
	const existing = await env.DB.prepare(
		`SELECT * FROM share_links WHERE target = ? AND kind = ? AND role IS ? AND ${ACTIVE}`,
	)
		.bind(target, kind, role, now)
		.first<Link>();
	if (existing) return toLink(existing);
	const link: Link = {
		id: token(),
		kind,
		target,
		role,
		created_by: userId,
		expires_at: kind === "invite" ? now + INVITE_TTL : null,
	};
	await env.DB.prepare(
		"INSERT INTO share_links (id,kind,target,role,created_by,created_at,expires_at) VALUES (?,?,?,?,?,?,?)",
	)
		.bind(link.id, kind, target, role, userId, now, link.expires_at)
		.run();
	return toLink(link);
}

export async function revokeShare(userId: string, id: string) {
	const link = await env.DB.prepare("SELECT * FROM share_links WHERE id = ?")
		.bind(id)
		.first<Link>();
	if (!link) throw gone();
	await authorize(link.kind, link.target, userId);
	await env.DB.prepare("UPDATE share_links SET revoked = 1 WHERE id = ?")
		.bind(id)
		.run();
}

async function activeLink(id: string) {
	const link = await env.DB.prepare(
		`SELECT * FROM share_links WHERE id = ? AND ${ACTIVE}`,
	)
		.bind(id, Date.now())
		.first<Link>();
	if (!link) throw gone();
	return link;
}

// Recipients get the sheet, not the library it lives in or the page it was imported from.
function shared<T extends SongRecord>(record: T): T {
	return record.kind === "arrangement"
		? { ...record, owner: "shared", data: { ...record.data, rawSource: "" } }
		: { ...record, owner: "shared" };
}

/** Anyone holding the link can read it; no account needed. */
export async function resolveShare(id: string): Promise<ResolvedShare> {
	const link = await activeLink(id);
	if (link.kind === "invite") {
		const band = await env.DB.prepare(
			"SELECT o.id, o.name, u.name AS inviter FROM organization o, user u WHERE o.id = ? AND u.id = ?",
		)
			.bind(link.target, link.created_by)
			.first<{ id: string; name: string; inviter: string }>();
		if (!band) throw gone();
		return {
			kind: "invite",
			band: { id: band.id, name: band.name },
			role: link.role || "viewer",
			inviter: band.inviter,
			expiresAt: link.expires_at,
		};
	}
	const row = await env.DB.prepare(
		"SELECT * FROM records WHERE id = ? AND archived = 0",
	)
		.bind(link.target)
		.first<Parameters<typeof decode>[0]>();
	if (!row) throw gone();
	const record = decode(row);
	if (record.kind === "arrangement")
		return { kind: "song", record: shared(record) };
	// Only songs from the setlist's own library, so a crafted entry can't expose another one.
	const { results } = await env.DB.prepare(
		"SELECT * FROM records WHERE owner = ? AND kind = 'arrangement' AND archived = 0 AND id IN (SELECT value FROM json_each(?))",
	)
		.bind(
			record.owner,
			JSON.stringify(record.data.entries.map((entry) => entry.arrangementId)),
		)
		.all<Parameters<typeof decode>[0]>();
	return {
		kind: "setlist",
		record: shared(record),
		songs: results.map((song) => shared(decode(song) as Arrangement)),
	};
}

/** Joins the band behind an invite link. Existing members keep their role. */
export async function acceptInvite(userId: string, id: string) {
	const link = await activeLink(id);
	if (link.kind !== "invite") throw gone();
	await env.DB.prepare(
		"INSERT INTO member (id,organizationId,userId,role,createdAt) VALUES (?,?,?,?,?) ON CONFLICT(organizationId,userId) DO NOTHING",
	)
		.bind(
			crypto.randomUUID(),
			link.target,
			userId,
			link.role || "viewer",
			Date.now(),
		)
		.run();
	return { bandId: link.target };
}
