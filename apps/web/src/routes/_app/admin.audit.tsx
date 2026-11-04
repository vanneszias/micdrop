import { Badge } from "@chords/ui/components/badge";
import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import {
	ErrorText,
	type Page,
	Pager,
	RecordLink,
	Rows,
	useAdmin,
	when,
} from "#/features/admin";

export const Route = createFileRoute("/_app/admin/audit")({
	validateSearch: z.object({
		offset: z.number().int().min(0).catch(0).default(0),
	}),
	component: Audit,
});

type Entry = {
	id: string;
	action: string;
	targetKind: string;
	targetId: string | null;
	data: string;
	createdAt: number;
	adminId: string;
	adminName: string | null;
	source: "platform" | "catalogue";
};

function Target({ entry }: { entry: Entry }) {
	const { targetKind: kind, targetId: id } = entry;
	if (!id) return null;
	if (kind === "user")
		return (
			<Link
				to="/admin/users/$id"
				params={{ id }}
				className="underline-offset-4 hover:underline"
			>
				account
			</Link>
		);
	if (kind === "band" || kind === "invite")
		return (
			<Link
				to="/admin/bands/$id"
				params={{ id }}
				className="underline-offset-4 hover:underline"
			>
				band
			</Link>
		);
	if (kind === "record") return <RecordLink id={id}>record</RecordLink>;
	return <span className="break-all">{id}</span>;
}

function Audit() {
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const { data, error } = useAdmin<Page<Entry>>({
		view: "audit",
		offset: search.offset,
	});
	return (
		<div className="w-full space-y-4 p-4">
			<ErrorText error={error} />
			<Rows
				rows={data?.rows ?? []}
				empty={data ? "Nothing has been recorded yet." : "Loading…"}
				columns={[
					["When", (row) => when(row.createdAt)],
					["Administrator", (row) => row.adminName ?? "deleted account"],
					[
						"Action",
						(row) => (
							<span className="inline-flex items-center gap-1">
								{row.action.replaceAll("_", " ")}
								{row.source === "catalogue" ? (
									<Badge variant="outline">catalogue</Badge>
								) : null}
							</span>
						),
					],
					["Target", (row) => <Target entry={row} />],
					[
						"Details",
						(row) =>
							row.data === "{}" ? (
								""
							) : (
								<span title={row.data} className="font-mono text-xs">
									{row.data}
								</span>
							),
					],
				]}
			/>
			<Pager
				offset={search.offset}
				next={data?.next}
				onChange={(offset) => void navigate({ search: { offset } })}
			/>
		</div>
	);
}
