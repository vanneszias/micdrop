import { Badge } from "@chords/ui/components/badge";
import { Button } from "@chords/ui/components/button";
import { Skeleton } from "@chords/ui/components/skeleton";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import {
	bytes,
	isAdmin,
	Rows,
	Section,
	useAdmin,
	when,
} from "#/features/admin";

export const Route = createFileRoute("/_app/admin/users/$id")({
	component: UserDetail,
});

type Detail = {
	user: {
		id: string;
		name: string;
		email: string;
		emailVerified: number;
		role: string | null;
		banned: number | null;
		banReason: string | null;
		banExpires: number | string | null;
		createdAt: string;
		updatedAt: string;
	};
	accounts: { providerId: string; createdAt: string }[];
	sessions: {
		id: string;
		createdAt: string;
		updatedAt: string;
		expiresAt: string;
		ipAddress: string | null;
		userAgent: string | null;
		impersonatedBy: string | null;
	}[];
	bands: {
		id: string;
		name: string;
		role: string;
		members: number;
		records: number;
	}[];
	records: {
		id: string;
		kind: "arrangement" | "setlist";
		title: string | null;
		artist: string | null;
		visibility: string | null;
		archived: number;
		version: number;
		updatedAt: string;
		bytes: number;
	}[];
	recordTotals: { total: number; bytes: number };
	publications: {
		id: string;
		title: string;
		hidden: number;
		moderated: number;
		updatedAt: string;
		score: number;
		openReports: number;
	}[];
	shareLinks: {
		kind: string;
		target: string;
		role: string | null;
		createdAt: number;
		expiresAt: number | null;
		revoked: number;
	}[];
	oauthClients: {
		clientId: string;
		name: string | null;
		uri: string | null;
		disabled: number | null;
		createdAt: string;
	}[];
	consents: {
		clientId: string;
		name: string | null;
		scopes: string;
		createdAt: string;
	}[];
	imports: {
		id: string;
		status: string;
		error: string | null;
		createdAt: number;
	}[];
	audit: {
		id: string;
		action: string;
		data: string;
		createdAt: number;
		adminName: string | null;
	}[];
};

function UserDetail() {
	const { id } = Route.useParams();
	const { data, error } = useAdmin<Detail>({ view: "user", id });
	const back = (
		<Button asChild variant="ghost" size="sm" className="-ml-2">
			<Link to="/admin/users">
				<ChevronLeft /> Users
			</Link>
		</Button>
	);
	if (error)
		return (
			<div className="space-y-2 p-4">
				{back}
				<p role="alert" className="text-sm text-destructive">
					{error.message}
				</p>
			</div>
		);
	if (!data || data.user.id !== id)
		return (
			<div className="space-y-4 p-4">
				{back}
				<Skeleton className="h-24" />
				<Skeleton className="h-48" />
			</div>
		);
	const { user } = data;
	return (
		<div className="w-full space-y-4 p-4">
			{back}
			<div className="space-y-1">
				<h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
					{user.name}
					{isAdmin(user.role) ? <Badge>admin</Badge> : null}
					{user.banned ? <Badge variant="destructive">banned</Badge> : null}
					{user.emailVerified ? null : (
						<Badge variant="outline">unverified email</Badge>
					)}
				</h2>
				<p className="text-sm">{user.email}</p>
				<p className="break-all text-xs text-muted-foreground">
					{user.id} · joined {when(user.createdAt)} · sign-in with{" "}
					{data.accounts.map((account) => account.providerId).join(", ") ||
						"nothing"}
				</p>
				{user.banned ? (
					<p className="text-sm text-destructive">
						Banned{user.banReason ? `: ${user.banReason}` : ""}
						{user.banExpires ? ` until ${when(user.banExpires)}` : ""}
					</p>
				) : null}
				<p className="text-xs text-muted-foreground">
					Opening this page is recorded in the audit log.
				</p>
			</div>
			<div className="grid gap-4 xl:grid-cols-2">
				<Section
					title={`Personal library · ${bytes(data.recordTotals.bytes)}`}
					count={data.recordTotals.total}
				>
					<Rows
						rows={data.records}
						empty="No songs or setlists."
						columns={[
							[
								"Title",
								(row) => (
									<span className={row.archived ? "line-through" : undefined}>
										{row.title || "Untitled"}
									</span>
								),
							],
							["Artist", (row) => row.artist ?? ""],
							[
								"Kind",
								(row) => (row.kind === "arrangement" ? "song" : "setlist"),
							],
							["Visibility", (row) => row.visibility ?? "private"],
							["Version", (row) => row.version],
							["Size", (row) => bytes(row.bytes)],
							["Updated", (row) => when(row.updatedAt)],
						]}
					/>
					{data.recordTotals.total > data.records.length ? (
						<p className="mt-2 text-xs text-muted-foreground">
							Showing the {data.records.length} most recently changed.
						</p>
					) : null}
				</Section>
				<Section title="Bands" count={data.bands.length}>
					<Rows
						rows={data.bands}
						empty="Not in any band."
						columns={[
							["Band", (row) => row.name],
							["Role", (row) => row.role],
							["Members", (row) => row.members],
							["Records", (row) => row.records],
						]}
					/>
				</Section>
				<Section title="Public arrangements" count={data.publications.length}>
					<Rows
						rows={data.publications}
						empty="Nothing published."
						columns={[
							["Title", (row) => row.title],
							[
								"State",
								(row) =>
									row.moderated
										? "moderated"
										: row.hidden
											? "hidden"
											: "public",
							],
							["Score", (row) => row.score],
							["Open reports", (row) => row.openReports],
							["Updated", (row) => when(row.updatedAt)],
						]}
					/>
				</Section>
				<Section title="Sessions" count={data.sessions.length}>
					<Rows
						rows={data.sessions}
						empty="No sessions."
						columns={[
							["Last active", (row) => when(row.updatedAt)],
							["IP address", (row) => row.ipAddress ?? "—"],
							[
								"Device",
								(row) => (
									<span title={row.userAgent ?? ""}>
										{row.userAgent ?? "—"}
									</span>
								),
							],
							["Expires", (row) => when(row.expiresAt)],
							["Impersonated", (row) => (row.impersonatedBy ? "yes" : "")],
						]}
					/>
				</Section>
				<Section title="PDF imports" count={data.imports.length}>
					<Rows
						rows={data.imports}
						empty="No PDF imports."
						columns={[
							["Started", (row) => when(row.createdAt)],
							["Status", (row) => row.status],
							["Error", (row) => row.error ?? ""],
						]}
					/>
				</Section>
				<Section title="Share links created" count={data.shareLinks.length}>
					<Rows
						rows={data.shareLinks}
						empty="No share links."
						columns={[
							["Kind", (row) => row.kind],
							["Target", (row) => row.target],
							[
								"State",
								(row) =>
									row.revoked
										? "revoked"
										: row.expiresAt && row.expiresAt < Date.now()
											? "expired"
											: "active",
							],
							["Created", (row) => when(row.createdAt)],
						]}
					/>
				</Section>
				<Section
					title="Assistant connections"
					count={data.consents.length + data.oauthClients.length}
				>
					<Rows
						rows={data.consents}
						empty="No assistant has been granted access."
						columns={[
							["Client", (row) => row.name ?? row.clientId],
							["Scopes", (row) => row.scopes],
							["Granted", (row) => when(row.createdAt)],
						]}
					/>
					{data.oauthClients.length ? (
						<div className="mt-4">
							<p className="mb-1 text-xs text-muted-foreground">
								OAuth clients registered by this account
							</p>
							<Rows
								rows={data.oauthClients}
								columns={[
									["Client", (row) => row.name ?? row.clientId],
									["URI", (row) => row.uri ?? ""],
									["Disabled", (row) => (row.disabled ? "yes" : "")],
									["Registered", (row) => when(row.createdAt)],
								]}
							/>
						</div>
					) : null}
				</Section>
				<Section title="Administrator activity" count={data.audit.length}>
					<Rows
						rows={data.audit}
						empty="No administrator has opened or changed this account before."
						columns={[
							["When", (row) => when(row.createdAt)],
							["Administrator", (row) => row.adminName ?? "deleted account"],
							["Action", (row) => row.action.replaceAll("_", " ")],
						]}
					/>
				</Section>
			</div>
		</div>
	);
}
