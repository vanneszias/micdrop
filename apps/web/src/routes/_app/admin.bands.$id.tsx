import { Button } from "@chords/ui/components/button";
import { Skeleton } from "@chords/ui/components/skeleton";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import {
	bytes,
	ErrorText,
	OwnerLink,
	RecordLink,
	Rows,
	Section,
	TypedConfirm,
	useAdmin,
	when,
} from "#/features/admin";
import { useApp } from "#/features/app-context";
import { api } from "#/lib/songs";

export const Route = createFileRoute("/_app/admin/bands/$id")({
	component: BandDetail,
});

type Detail = {
	band: { id: string; name: string; slug: string; createdAt: string };
	members: {
		id: string;
		name: string;
		email: string;
		role: string;
		createdAt: string | number;
	}[];
	invitations: {
		email: string;
		role: string | null;
		status: string;
		expiresAt: string;
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
	shareLinks: {
		ref: number;
		kind: string;
		role: string | null;
		createdAt: number;
		expiresAt: number | null;
		revoked: number;
		creator: string;
	}[];
	audit: {
		id: string;
		action: string;
		createdAt: number;
		adminName: string | null;
	}[];
};

function BandDetail() {
	const { id } = Route.useParams();
	const { run } = useApp();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const { data, error } = useAdmin<Detail>({ view: "band", id });
	const back = (
		<Button asChild variant="ghost" size="sm" className="-ml-2">
			<Link to="/admin/bands">
				<ChevronLeft /> Bands
			</Link>
		</Button>
	);
	if (error || !data || data.band.id !== id)
		return (
			<div className="space-y-4 p-4">
				{back}
				{error ? <ErrorText error={error} /> : <Skeleton className="h-48" />}
			</div>
		);
	const { band } = data;
	return (
		<div className="w-full space-y-4 p-4">
			{back}
			<div className="space-y-1">
				<h2 className="text-lg font-semibold">{band.name}</h2>
				<p className="break-all text-xs text-muted-foreground">
					{band.id} · created {when(band.createdAt)}
				</p>
				<p className="text-xs text-muted-foreground">
					Opening this page is recorded in the audit log.
				</p>
			</div>
			<TypedConfirm
				label="Delete band"
				title={`Delete ${band.name}?`}
				description="Permanently deletes the band, its memberships, invitations, share links and every song and setlist it owns, including their revisions and public arrangements. This cannot be undone."
				phrase={band.name}
				onConfirm={() =>
					run(async () => {
						await api("/api/admin", {
							action: "delete_band",
							bandId: band.id,
							confirm: band.name,
						});
						await queryClient.invalidateQueries({ queryKey: ["admin"] });
						await navigate({ to: "/admin/bands" });
					}, "Band deleted")
				}
			/>
			<div className="grid gap-4 xl:grid-cols-2">
				<Section title="Members" count={data.members.length}>
					<Rows
						rows={data.members}
						columns={[
							[
								"Name",
								(row) => <OwnerLink id={row.id} kind="user" name={row.name} />,
							],
							["Email", (row) => row.email],
							["Role", (row) => row.role],
							["Joined", (row) => when(row.createdAt)],
						]}
					/>
				</Section>
				<Section title="Library" count={data.records.length}>
					<Rows
						rows={data.records}
						empty="No songs or setlists."
						columns={[
							[
								"Title",
								(row) => (
									<RecordLink id={row.id}>{row.title || "Untitled"}</RecordLink>
								),
							],
							[
								"Kind",
								(row) => (row.kind === "arrangement" ? "song" : "setlist"),
							],
							["Visibility", (row) => row.visibility ?? "private"],
							["Size", (row) => bytes(row.bytes)],
							["Updated", (row) => when(row.updatedAt)],
						]}
					/>
				</Section>
				<Section title="Share and invite links" count={data.shareLinks.length}>
					<Rows
						rows={data.shareLinks}
						empty="No links."
						columns={[
							["Kind", (row) => row.kind],
							["Created by", (row) => row.creator],
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
				<Section title="Pending invitations" count={data.invitations.length}>
					<Rows
						rows={data.invitations}
						empty="No invitations."
						columns={[
							["Email", (row) => row.email],
							["Role", (row) => row.role ?? ""],
							["Status", (row) => row.status],
							["Expires", (row) => when(row.expiresAt)],
						]}
					/>
				</Section>
				<Section title="Administrator activity" count={data.audit.length}>
					<Rows
						rows={data.audit}
						empty="No administrator has opened or changed this band before."
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
