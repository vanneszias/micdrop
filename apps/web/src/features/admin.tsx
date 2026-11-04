import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@chords/ui/components/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@chords/ui/components/table";
import { useQuery } from "@tanstack/react-query";
import { api } from "#/lib/songs";
import { useApp } from "./app-context";

export function isAdmin(role: string | null | undefined) {
	return !!role?.split(",").includes("admin");
}

/** Reads one view of /api/admin. Never cached across visits, so the data is always current. */
export function useAdmin<T>(params: Record<string, string | number>) {
	const { user, online } = useApp();
	const query = new URLSearchParams(
		Object.entries(params).map(([key, value]) => [key, String(value)]),
	);
	return useQuery({
		queryKey: ["admin", params],
		queryFn: () => api<T>(`/api/admin?${query}`),
		enabled: online && isAdmin(user?.role),
		gcTime: 0,
		placeholderData: (previous) => previous,
	});
}

/** Better Auth stores ISO text, our tables store milliseconds. */
export function when(value: unknown) {
	if (value === null || value === undefined || value === "") return "—";
	const date = new Date(
		typeof value === "string" && !/^\d+$/.test(value) ? value : Number(value),
	);
	return Number.isNaN(date.getTime())
		? String(value)
		: date.toLocaleString(undefined, {
				dateStyle: "medium",
				timeStyle: "short",
			});
}

export function bytes(value: unknown) {
	const size = Number(value) || 0;
	if (size < 1024) return `${size} B`;
	if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
	return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export function Section({
	title,
	count,
	children,
}: {
	title: string;
	count?: number;
	children: React.ReactNode;
}) {
	return (
		<Card className="gap-3">
			<CardHeader>
				<CardTitle className="text-sm">
					{title}
					{count === undefined ? null : (
						<span className="ml-2 font-normal text-muted-foreground">
							{count}
						</span>
					)}
				</CardTitle>
			</CardHeader>
			<CardContent>{children}</CardContent>
		</Card>
	);
}

/** A compact table that says so when there is nothing to show. */
export function Rows<T>({
	rows,
	columns,
	empty = "Nothing here.",
}: {
	rows: T[];
	columns: [string, (row: T) => React.ReactNode][];
	empty?: string;
}) {
	if (!rows.length)
		return <p className="text-sm text-muted-foreground">{empty}</p>;
	return (
		<Table>
			<TableHeader>
				<TableRow>
					{columns.map(([label]) => (
						<TableHead key={label}>{label}</TableHead>
					))}
				</TableRow>
			</TableHeader>
			<TableBody>
				{rows.map((row, index) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: rows are read-only snapshots.
					<TableRow key={index}>
						{columns.map(([label, cell]) => (
							<TableCell key={label} className="max-w-72 truncate">
								{cell(row)}
							</TableCell>
						))}
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}
