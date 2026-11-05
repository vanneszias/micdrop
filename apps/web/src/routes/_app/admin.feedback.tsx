import { Badge } from "@chords/ui/components/badge";
import { Button } from "@chords/ui/components/button";
import { Card, CardContent } from "@chords/ui/components/card";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@chords/ui/components/toggle-group";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import {
	ErrorText,
	OwnerLink,
	type Page,
	Pager,
	RecordLink,
	useAdmin,
	when,
} from "#/features/admin";
import { useApp } from "#/features/app-context";
import { api } from "#/lib/songs";

const STATUSES = ["open", "resolved", "all"] as const;

export const Route = createFileRoute("/_app/admin/feedback")({
	validateSearch: z.object({
		status: z.enum(STATUSES).catch("open").default("open"),
		offset: z.number().int().min(0).catch(0).default(0),
	}),
	component: FeedbackList,
});

type Context = Partial<{
	path: string;
	title: string;
	library: string;
	libraryName: string;
	release: string;
	online: boolean;
	pending: number;
	viewport: string;
	standalone: boolean;
	language: string;
	timeZone: string;
	theme: string;
	userAgent: string;
	country: string;
}>;

type Item = {
	id: string;
	kind: "bug" | "idea" | "other";
	message: string;
	context: string;
	createdAt: number;
	resolvedAt: number | null;
	userId: string;
	userName: string | null;
	userEmail: string | null;
	resolverName: string | null;
};

const KIND_LABEL = { bug: "Bug", idea: "Idea", other: "Other" } as const;

function parse(context: string): Context {
	try {
		return JSON.parse(context) as Context;
	} catch {
		return {};
	}
}

/** The song or setlist the user had open, opened in the audited admin view. */
function PageLink({ context }: { context: Context }) {
	if (!context.path) return <>—</>;
	const record = context.path.match(/^\/(?:songs|setlists)\/([^/?]+)/)?.[1];
	return (
		<span className="break-all">
			<span className="font-mono text-xs">{context.path}</span>
			{record && record !== "new" ? (
				<>
					{" "}
					· <RecordLink id={record}>open record</RecordLink>
				</>
			) : null}
		</span>
	);
}

function Detail({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<>
			<dt className="text-muted-foreground">{label}</dt>
			<dd className="min-w-0">{children}</dd>
		</>
	);
}

function FeedbackCard({ item }: { item: Item }) {
	const { run, busy } = useApp();
	const queryClient = useQueryClient();
	const context = parse(item.context);
	const band = context.library && context.library !== item.userId;
	return (
		<Card className="py-4">
			<CardContent className="space-y-3 px-4">
				<div className="flex flex-wrap items-center gap-2 text-sm">
					<Badge variant={item.kind === "bug" ? "destructive" : "secondary"}>
						{KIND_LABEL[item.kind] ?? item.kind}
					</Badge>
					<OwnerLink id={item.userId} kind="user" name={item.userName} />
					<span className="text-muted-foreground">{item.userEmail}</span>
					<span className="text-muted-foreground">
						· {when(item.createdAt)}
					</span>
					<Button
						size="sm"
						variant={item.resolvedAt ? "ghost" : "outline"}
						className="ml-auto"
						disabled={busy}
						onClick={() =>
							void run(
								async () => {
									await api("/api/admin", {
										action: "resolve_feedback",
										id: item.id,
										resolved: !item.resolvedAt,
									});
									await queryClient.invalidateQueries({ queryKey: ["admin"] });
								},
								item.resolvedAt ? "Feedback reopened" : "Feedback resolved",
							)
						}
					>
						{item.resolvedAt ? "Reopen" : "Resolve"}
					</Button>
				</div>
				<p className="whitespace-pre-wrap break-words">{item.message}</p>
				<dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-xs">
					<Detail label="Page">
						<PageLink context={context} />
					</Detail>
					{context.title ? (
						<Detail label="Title">{context.title}</Detail>
					) : null}
					<Detail label="Library">
						{band && context.library ? (
							<OwnerLink
								id={context.library}
								kind="band"
								name={context.libraryName || null}
							/>
						) : (
							"Personal"
						)}
					</Detail>
					<Detail label="App">
						{context.release ?? "—"}
						{context.standalone ? " · installed" : ""}
						{context.online === false ? " · offline" : ""}
						{context.pending ? ` · ${context.pending} unsynced changes` : ""}
					</Detail>
					<Detail label="Device">
						<span className="break-all">
							{[
								context.viewport,
								context.theme,
								context.language,
								context.timeZone,
								context.country,
							]
								.filter(Boolean)
								.join(" · ") || "—"}
						</span>
					</Detail>
					{context.userAgent ? (
						<Detail label="Browser">
							<span className="break-all">{context.userAgent}</span>
						</Detail>
					) : null}
					{item.resolvedAt ? (
						<Detail label="Resolved">
							{when(item.resolvedAt)} by{" "}
							{item.resolverName ?? "deleted account"}
						</Detail>
					) : null}
				</dl>
			</CardContent>
		</Card>
	);
}

function FeedbackList() {
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const { data, error } = useAdmin<Page<Item>>({
		view: "feedback",
		status: search.status,
		offset: search.offset,
	});
	return (
		<div className="w-full max-w-4xl space-y-4 p-4">
			<ToggleGroup
				type="single"
				variant="outline"
				size="sm"
				value={search.status}
				onValueChange={(status) =>
					status &&
					void navigate({
						search: {
							status: status as (typeof STATUSES)[number],
							offset: 0,
						},
					})
				}
				aria-label="Status"
			>
				{STATUSES.map((status) => (
					<ToggleGroupItem key={status} value={status} className="px-3">
						{status[0].toUpperCase() + status.slice(1)}
					</ToggleGroupItem>
				))}
			</ToggleGroup>
			<ErrorText error={error} />
			{data && !data.rows.length ? (
				<p className="text-sm text-muted-foreground">
					{search.status === "open"
						? "No open feedback. "
						: "No feedback yet. "}
					Users send it from the account menu.{" "}
					{search.status === "open" ? (
						<Link
							to="/admin/feedback"
							search={{ status: "all", offset: 0 }}
							className="underline underline-offset-4"
						>
							Show all
						</Link>
					) : null}
				</p>
			) : null}
			{!data && !error ? (
				<p className="text-sm text-muted-foreground">Loading…</p>
			) : null}
			{data?.rows.map((item) => (
				<FeedbackCard key={item.id} item={item} />
			))}
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
