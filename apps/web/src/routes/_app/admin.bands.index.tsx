import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { SearchInput } from "#/components/search-input";
import {
	ErrorText,
	type Page,
	Pager,
	Rows,
	useAdmin,
	when,
} from "#/features/admin";

export const Route = createFileRoute("/_app/admin/bands/")({
	validateSearch: z.object({
		q: z.string().catch("").default(""),
		offset: z.number().int().min(0).catch(0).default(0),
	}),
	component: Bands,
});

type BandRow = {
	id: string;
	name: string;
	createdAt: string;
	members: number;
	records: number;
	owners: string | null;
};

function Bands() {
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const [text, setText] = useState(search.q);
	useEffect(() => {
		if (text === search.q) return;
		const timer = setTimeout(
			() =>
				void navigate({
					search: { q: text, offset: 0 },
					replace: true,
				}),
			300,
		);
		return () => clearTimeout(timer);
	}, [text, search.q, navigate]);
	const { data, error } = useAdmin<Page<BandRow>>({
		view: "bands",
		query: search.q,
		offset: search.offset,
	});
	return (
		<div className="w-full space-y-4 p-4">
			<SearchInput
				value={text}
				onChange={(event) => setText(event.target.value)}
				placeholder="Search band name or id"
				aria-label="Search bands"
			/>
			<ErrorText error={error} />
			<Rows
				rows={data?.rows ?? []}
				empty={data ? "No bands match." : "Loading…"}
				columns={[
					[
						"Band",
						(row) => (
							<Link
								to="/admin/bands/$id"
								params={{ id: row.id }}
								className="font-medium underline-offset-4 hover:underline"
							>
								{row.name}
							</Link>
						),
					],
					["Owners", (row) => row.owners ?? "—"],
					["Members", (row) => row.members],
					["Records", (row) => row.records],
					["Created", (row) => when(row.createdAt)],
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
