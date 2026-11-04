import { Button } from "@chords/ui/components/button";
import { Switch } from "@chords/ui/components/switch";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import {
	ErrorText,
	OwnerLink,
	type Page,
	Pager,
	RecordLink,
	Rows,
	useAdmin,
	when,
} from "#/features/admin";
import { useApp } from "#/features/app-context";
import { api } from "#/lib/songs";

export const Route = createFileRoute("/_app/admin/links")({
	validateSearch: z.object({
		all: z.boolean().catch(false).default(false),
		offset: z.number().int().min(0).catch(0).default(0),
	}),
	component: Links,
});

type ShareLink = {
	ref: number;
	kind: "record" | "invite";
	target: string;
	targetName: string | null;
	role: string | null;
	createdAt: number;
	expiresAt: number | null;
	revoked: number;
	creatorId: string;
	creator: string;
};

function Links() {
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const { run, busy } = useApp();
	const queryClient = useQueryClient();
	const { data, error } = useAdmin<Page<ShareLink>>({
		view: "links",
		active: search.all ? "0" : "1",
		offset: search.offset,
	});
	return (
		<div className="w-full space-y-4 p-4">
			<div className="flex items-center gap-2 text-sm">
				<Switch
					id="admin-links-all"
					checked={search.all}
					onCheckedChange={(all) =>
						void navigate({ search: { all, offset: 0 } })
					}
				/>
				<label htmlFor="admin-links-all">
					Include revoked and expired links
				</label>
			</div>
			<ErrorText error={error} />
			<Rows
				rows={data?.rows ?? []}
				empty={data ? "No share links." : "Loading…"}
				columns={[
					[
						"Shares",
						(row) =>
							row.kind === "record" ? (
								<RecordLink id={row.target}>
									{row.targetName ?? "Deleted record"}
								</RecordLink>
							) : (
								<Link
									to="/admin/bands/$id"
									params={{ id: row.target }}
									className="font-medium underline-offset-4 hover:underline"
								>
									Invite to {row.targetName ?? "deleted band"}
									{row.role ? ` as ${row.role}` : ""}
								</Link>
							),
					],
					[
						"Created by",
						(row) => (
							<OwnerLink id={row.creatorId} kind="user" name={row.creator} />
						),
					],
					["Created", (row) => when(row.createdAt)],
					["Expires", (row) => (row.expiresAt ? when(row.expiresAt) : "never")],
					[
						"",
						(row) =>
							row.revoked ? (
								"revoked"
							) : (
								<Button
									size="sm"
									variant="outline"
									disabled={busy}
									onClick={() =>
										void run(async () => {
											await api("/api/admin", {
												action: "revoke_share",
												ref: row.ref,
											});
											await queryClient.invalidateQueries({
												queryKey: ["admin"],
											});
										}, "Link revoked")
									}
								>
									Revoke
								</Button>
							),
					],
				]}
			/>
			<Pager
				offset={search.offset}
				next={data?.next}
				onChange={(offset) =>
					void navigate({ search: (previous) => ({ ...previous, offset }) })
				}
			/>
		</div>
	);
}
