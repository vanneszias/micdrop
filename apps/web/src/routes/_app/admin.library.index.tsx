import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@chords/ui/components/select";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { SearchInput } from "#/components/search-input";
import {
	bytes,
	ErrorText,
	OwnerLink,
	type Page,
	Pager,
	RecordLink,
	Rows,
	useAdmin,
	when,
} from "#/features/admin";

const Kind = z.enum(["all", "arrangement", "setlist"]);

export const Route = createFileRoute("/_app/admin/library/")({
	validateSearch: z.object({
		q: z.string().catch("").default(""),
		kind: Kind.catch("all").default("all"),
		offset: z.number().int().min(0).catch(0).default(0),
	}),
	component: Library,
});

type RecordRow = {
	id: string;
	kind: "arrangement" | "setlist";
	title: string | null;
	artist: string | null;
	visibility: string | null;
	owner: string;
	ownerName: string | null;
	ownerKind: "user" | "band";
	archived: number;
	version: number;
	updatedAt: string;
	bytes: number;
};

function Library() {
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const [text, setText] = useState(search.q);
	useEffect(() => {
		if (text === search.q) return;
		const timer = setTimeout(
			() =>
				void navigate({
					search: (previous) => ({ ...previous, q: text, offset: 0 }),
					replace: true,
				}),
			300,
		);
		return () => clearTimeout(timer);
	}, [text, search.q, navigate]);
	const { data, error } = useAdmin<Page<RecordRow>>({
		view: "records",
		query: search.q,
		kind: search.kind,
		offset: search.offset,
	});
	return (
		<div className="w-full space-y-4 p-4">
			<div className="flex flex-wrap gap-2">
				<div className="min-w-56 flex-1">
					<SearchInput
						value={text}
						onChange={(event) => setText(event.target.value)}
						placeholder="Search title, artist or id"
						aria-label="Search songs and setlists"
					/>
				</div>
				<Select
					value={search.kind}
					onValueChange={(kind) =>
						void navigate({
							search: (previous) => ({
								...previous,
								kind: Kind.parse(kind),
								offset: 0,
							}),
						})
					}
				>
					<SelectTrigger className="w-36" aria-label="Kind">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">Everything</SelectItem>
						<SelectItem value="arrangement">Songs</SelectItem>
						<SelectItem value="setlist">Setlists</SelectItem>
					</SelectContent>
				</Select>
			</div>
			<ErrorText error={error} />
			<Rows
				rows={data?.rows ?? []}
				empty={data ? "Nothing matches." : "Loading…"}
				columns={[
					[
						"Title",
						(row) => (
							<RecordLink id={row.id}>
								<span className={row.archived ? "line-through" : undefined}>
									{row.title || "Untitled"}
								</span>
							</RecordLink>
						),
					],
					["Artist", (row) => row.artist ?? ""],
					["Kind", (row) => (row.kind === "arrangement" ? "song" : "setlist")],
					[
						"Owner",
						(row) => (
							<OwnerLink
								id={row.owner}
								kind={row.ownerKind}
								name={row.ownerName}
							/>
						),
					],
					["Visibility", (row) => row.visibility ?? "private"],
					["Size", (row) => bytes(row.bytes)],
					["Updated", (row) => when(row.updatedAt)],
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
