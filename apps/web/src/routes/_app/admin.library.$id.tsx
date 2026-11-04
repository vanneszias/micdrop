import { Badge } from "@chords/ui/components/badge";
import { Button } from "@chords/ui/components/button";
import { Skeleton } from "@chords/ui/components/skeleton";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { z } from "zod";
import {
	bytes,
	ErrorText,
	OwnerLink,
	Rows,
	Section,
	useAdmin,
	when,
} from "#/features/admin";

export const Route = createFileRoute("/_app/admin/library/$id")({
	validateSearch: z.object({
		version: z.number().int().min(0).optional().catch(undefined),
	}),
	component: RecordDetail,
});

type Detail = {
	record: {
		id: string;
		kind: "arrangement" | "setlist";
		owner: string;
		ownerName: string | null;
		ownerKind: "user" | "band";
		archived: number;
		version: number;
		updatedAt: string;
		data: Record<string, unknown> & {
			title?: string;
			artist?: string;
			content?: string;
			privateNotes?: string;
		};
	};
	shownVersion: number | null;
	revisions: { version: number; updatedAt: string; bytes: number }[];
	publication: {
		id: string;
		hidden: number;
		moderated: number;
		openReports: number;
	} | null;
};

function RecordDetail() {
	const { id } = Route.useParams();
	const { version } = Route.useSearch();
	const { data, error } = useAdmin<Detail>({
		view: "record",
		id,
		...(version === undefined ? {} : { version }),
	});
	const back = (
		<Button asChild variant="ghost" size="sm" className="-ml-2">
			<Link to="/admin/library">
				<ChevronLeft /> Songs & setlists
			</Link>
		</Button>
	);
	if (
		error ||
		!data ||
		data.record.id !== id ||
		data.shownVersion !== (version ?? null)
	)
		return (
			<div className="space-y-4 p-4">
				{back}
				{error ? <ErrorText error={error} /> : <Skeleton className="h-64" />}
			</div>
		);
	const { record, publication } = data;
	const content = record.data;
	return (
		<div className="w-full space-y-4 p-4">
			{back}
			<div className="space-y-1">
				<h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
					{content.title || "Untitled"}
					<Badge variant="outline">
						{record.kind === "arrangement" ? "song" : "setlist"}
					</Badge>
					{record.archived ? <Badge variant="secondary">archived</Badge> : null}
					{publication ? (
						<Badge
							variant={
								publication.moderated || publication.hidden
									? "secondary"
									: "default"
							}
						>
							{publication.moderated
								? "public, moderated"
								: publication.hidden
									? "public copy hidden"
									: "public"}
						</Badge>
					) : null}
				</h2>
				<p className="text-sm">
					{content.artist ? `${content.artist} · ` : ""}
					<OwnerLink
						id={record.owner}
						kind={record.ownerKind}
						name={record.ownerName}
					/>
				</p>
				<p className="break-all text-xs text-muted-foreground">
					{record.id} · version {record.version} · updated{" "}
					{when(record.updatedAt)}
					{publication?.openReports
						? ` · ${publication.openReports} open report(s)`
						: ""}
				</p>
				<p className="text-xs text-muted-foreground">
					Opening this record is recorded in the audit log.
				</p>
			</div>
			<div className="grid gap-4 xl:grid-cols-[1fr_20rem]">
				<Section
					title={
						data.shownVersion === null
							? "Current version"
							: `Revision ${data.shownVersion}`
					}
				>
					{typeof content.content === "string" ? (
						<pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 font-mono text-xs">
							{content.content}
						</pre>
					) : null}
					{content.privateNotes ? (
						<p className="mt-3 whitespace-pre-wrap text-sm">
							<span className="font-medium">Private notes: </span>
							{content.privateNotes}
						</p>
					) : null}
					<details className="mt-3">
						<summary className="cursor-pointer text-sm text-muted-foreground">
							All stored fields
						</summary>
						<pre className="mt-2 max-h-[50vh] overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 font-mono text-xs">
							{JSON.stringify(content, null, 2)}
						</pre>
					</details>
				</Section>
				<Section title="Revisions" count={data.revisions.length}>
					{data.shownVersion !== null ? (
						<Button asChild size="sm" variant="outline" className="mb-2">
							<Link to="/admin/library/$id" params={{ id }} search={{}}>
								Show current version
							</Link>
						</Button>
					) : null}
					<Rows
						rows={data.revisions}
						empty="No earlier revisions."
						columns={[
							[
								"Version",
								(row) => (
									<Link
										to="/admin/library/$id"
										params={{ id }}
										search={{ version: row.version }}
										className="font-medium underline-offset-4 hover:underline"
									>
										{row.version}
									</Link>
								),
							],
							["Saved", (row) => when(row.updatedAt)],
							["Size", (row) => bytes(row.bytes)],
						]}
					/>
				</Section>
			</div>
		</div>
	);
}
