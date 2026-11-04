import { Badge } from "@chords/ui/components/badge";
import { Button } from "@chords/ui/components/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@chords/ui/components/select";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { SearchInput } from "#/components/search-input";
import { isAdmin, Rows, useAdmin, when } from "#/features/admin";

const Search = z.object({
	q: z.string().catch("").default(""),
	sort: z
		.enum(["created", "seen", "records", "imports"])
		.catch("created")
		.default("created"),
	filter: z.enum(["all", "banned", "admin"]).catch("all").default("all"),
	offset: z.number().int().min(0).catch(0).default(0),
});

export const Route = createFileRoute("/_app/admin/users/")({
	validateSearch: Search,
	component: Users,
});

type UserRow = {
	id: string;
	name: string;
	email: string;
	emailVerified: number;
	role: string | null;
	banned: number | null;
	createdAt: string;
	records: number;
	bands: number;
	lastSeen: number | null;
	pdfImports: number;
};

function Users() {
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
	const { data, error, isFetching } = useAdmin<{
		users: UserRow[];
		next: number | null;
	}>({
		view: "users",
		query: search.q,
		sort: search.sort,
		filter: search.filter,
		offset: search.offset,
	});
	return (
		<div className="w-full space-y-4 p-4">
			<div className="flex flex-wrap gap-2">
				<div className="min-w-56 flex-1">
					<SearchInput
						value={text}
						onChange={(event) => setText(event.target.value)}
						placeholder="Search name, email or account id"
						aria-label="Search users"
					/>
				</div>
				<Select
					value={search.filter}
					onValueChange={(filter) =>
						void navigate({
							search: (previous) => ({
								...previous,
								filter: filter as typeof search.filter,
								offset: 0,
							}),
						})
					}
				>
					<SelectTrigger className="w-36" aria-label="Filter">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All accounts</SelectItem>
						<SelectItem value="banned">Banned</SelectItem>
						<SelectItem value="admin">Administrators</SelectItem>
					</SelectContent>
				</Select>
				<Select
					value={search.sort}
					onValueChange={(sort) =>
						void navigate({
							search: (previous) => ({
								...previous,
								sort: sort as typeof search.sort,
								offset: 0,
							}),
						})
					}
				>
					<SelectTrigger className="w-44" aria-label="Sort">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="created">Newest first</SelectItem>
						<SelectItem value="seen">Recently active</SelectItem>
						<SelectItem value="records">Most records</SelectItem>
						<SelectItem value="imports">Most PDF imports</SelectItem>
					</SelectContent>
				</Select>
			</div>
			{error ? (
				<p role="alert" className="text-sm text-destructive">
					{error.message}
				</p>
			) : null}
			<div className={isFetching ? "opacity-60 transition-opacity" : undefined}>
				<Rows
					rows={data?.users ?? []}
					empty={data ? "No accounts match." : "Loading…"}
					columns={[
						[
							"Name",
							(row) => (
								<Link
									to="/admin/users/$id"
									params={{ id: row.id }}
									className="font-medium underline-offset-4 hover:underline"
								>
									{row.name}
								</Link>
							),
						],
						[
							"Email",
							(row) => (
								<span className="inline-flex items-center gap-1">
									{row.email}
									{row.emailVerified ? null : (
										<Badge variant="outline">unverified</Badge>
									)}
								</span>
							),
						],
						[
							"Status",
							(row) => (
								<span className="inline-flex gap-1">
									{row.banned ? (
										<Badge variant="destructive">banned</Badge>
									) : null}
									{isAdmin(row.role) ? <Badge>admin</Badge> : null}
								</span>
							),
						],
						["Records", (row) => row.records],
						["Bands", (row) => row.bands],
						["PDF imports (7d)", (row) => row.pdfImports],
						["Last active", (row) => when(row.lastSeen)],
						["Joined", (row) => when(row.createdAt)],
					]}
				/>
			</div>
			<div className="flex justify-end gap-2">
				<Button
					variant="outline"
					size="sm"
					disabled={!search.offset}
					onClick={() =>
						void navigate({
							search: (previous) => ({
								...previous,
								offset: Math.max(0, search.offset - 50),
							}),
						})
					}
				>
					Previous
				</Button>
				<Button
					variant="outline"
					size="sm"
					disabled={data?.next == null}
					onClick={() =>
						void navigate({
							search: (previous) => ({
								...previous,
								offset: data?.next ?? previous.offset,
							}),
						})
					}
				>
					Next
				</Button>
			</div>
		</div>
	);
}
