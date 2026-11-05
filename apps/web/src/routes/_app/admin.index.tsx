import { Card, CardContent } from "@chords/ui/components/card";
import { Skeleton } from "@chords/ui/components/skeleton";
import { cn } from "@chords/ui/lib/utils";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	bytes,
	OwnerLink,
	Rows,
	Section,
	useAdmin,
	when,
} from "#/features/admin";

export const Route = createFileRoute("/_app/admin/")({ component: Overview });

type Totals = Record<
	| "users"
	| "newUsers"
	| "bannedUsers"
	| "bands"
	| "newBands"
	| "songs"
	| "setlists"
	| "changedRecords"
	| "publications"
	| "openReports"
	| "openFeedback"
	| "shareLinks"
	| "oauthClients"
	| "anonymousClients"
	| "pdfImportsDay"
	| "pdfImportsWeek",
	number
>;
type UserRow = {
	id: string;
	name: string;
	email: string;
	emailVerified: number;
	role: string | null;
	banned: number | null;
	createdAt: string;
};
type OverviewData = {
	totals: Totals;
	recentUsers: UserRow[];
	largestLibraries: {
		id: string;
		name: string | null;
		kind: "user" | "band";
		records: number;
		bytes: number;
	}[];
	pdfImporters: { id: string; name: string; email: string; imports: number }[];
	signupBursts: { ip: string; accounts: number }[];
	recordLimit: number;
	quotaUsage: {
		subject: string;
		kind: string;
		used: number;
		limit: number;
		name: string | null;
	}[];
};

function UserLink({ id, children }: { id: string; children: React.ReactNode }) {
	return (
		<Link
			to="/admin/users/$id"
			params={{ id }}
			className="font-medium underline-offset-4 hover:underline"
		>
			{children}
		</Link>
	);
}

function Overview() {
	const { data, error } = useAdmin<OverviewData>({ view: "overview" });
	if (error)
		return (
			<p role="alert" className="p-4 text-sm text-destructive">
				{error.message}
			</p>
		);
	if (!data)
		return (
			<div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
				{Array.from({ length: 8 }, (_, index) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: static placeholders.
					<Skeleton key={index} className="h-20" />
				))}
			</div>
		);
	const { totals } = data;
	const stats: [string, number, string?, boolean?][] = [
		["Users", totals.users, `+${totals.newUsers} this week`],
		["Banned", totals.bannedUsers],
		["Bands", totals.bands, `+${totals.newBands} this week`],
		[
			"Songs",
			totals.songs,
			`${totals.changedRecords} records changed this week`,
		],
		["Setlists", totals.setlists],
		["Public arrangements", totals.publications],
		["Open reports", totals.openReports, undefined, totals.openReports > 0],
		["Open feedback", totals.openFeedback, undefined, totals.openFeedback > 0],
		["Active share links", totals.shareLinks],
		[
			"OAuth clients",
			totals.oauthClients,
			`${totals.anonymousClients} registered without an account`,
		],
		[
			"PDF imports today",
			totals.pdfImportsDay,
			`${totals.pdfImportsWeek} this week`,
		],
	];
	return (
		<div className="w-full space-y-4 p-4">
			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
				{stats.map(([label, value, hint, alert]) => (
					<Card
						key={label}
						className={cn("py-4", alert && "border-destructive")}
					>
						<CardContent className="px-4">
							<p className="text-xs text-muted-foreground">{label}</p>
							<p className="text-2xl font-semibold tabular-nums">{value}</p>
							{hint ? (
								<p className="text-xs text-muted-foreground">{hint}</p>
							) : null}
						</CardContent>
					</Card>
				))}
			</div>
			{totals.openReports ? (
				<p className="text-sm">
					{totals.openReports} catalogue report
					{totals.openReports === 1 ? " is" : "s are"} waiting.{" "}
					<Link to="/community" className="underline underline-offset-4">
						Review them in the catalogue
					</Link>
					.
				</p>
			) : null}
			{totals.openFeedback ? (
				<p className="text-sm">
					{totals.openFeedback} feedback message
					{totals.openFeedback === 1 ? " is" : "s are"} open.{" "}
					<Link to="/admin/feedback" className="underline underline-offset-4">
						Read them
					</Link>
					.
				</p>
			) : null}
			<div className="grid gap-4 lg:grid-cols-2">
				<Section title="Sign-up bursts (last 24 hours)">
					<Rows
						rows={data.signupBursts}
						empty="No IP address created several accounts today."
						columns={[
							["IP address", (row) => row.ip],
							["New accounts", (row) => row.accounts],
						]}
					/>
				</Section>
				<Section title="Daily limits, closest to their cap">
					<Rows
						rows={data.quotaUsage}
						empty="Nothing counted against a daily limit in the last 24 hours."
						columns={[
							[
								"Who",
								(row) =>
									row.subject.startsWith("ip:") ? (
										`Signed out, ${row.subject.slice(3)}`
									) : (
										<OwnerLink id={row.subject} kind="user" name={row.name} />
									),
							],
							["Kind", (row) => row.kind.replaceAll("_", " ")],
							[
								"Used",
								(row) => (
									<span
										className={
											row.used >= row.limit
												? "font-medium text-destructive"
												: undefined
										}
									>
										{row.used} / {row.limit}
									</span>
								),
							],
						]}
					/>
				</Section>
				<Section title="Most PDF imports (last 7 days)">
					<Rows
						rows={data.pdfImporters}
						empty="No PDF imports this week."
						columns={[
							["User", (row) => <UserLink id={row.id}>{row.name}</UserLink>],
							["Email", (row) => row.email],
							["Imports", (row) => row.imports],
						]}
					/>
				</Section>
				<Section
					title={`Largest libraries (limit ${data.recordLimit.toLocaleString()})`}
				>
					<Rows
						rows={data.largestLibraries}
						columns={[
							[
								"Owner",
								(row) => (
									<OwnerLink id={row.id} kind={row.kind} name={row.name} />
								),
							],
							["Records", (row) => row.records],
							["Size", (row) => bytes(row.bytes)],
						]}
					/>
				</Section>
				<Section title="Newest accounts">
					<Rows
						rows={data.recentUsers}
						columns={[
							["Name", (row) => <UserLink id={row.id}>{row.name}</UserLink>],
							["Email", (row) => row.email],
							["Joined", (row) => when(row.createdAt)],
						]}
					/>
				</Section>
			</div>
		</div>
	);
}
