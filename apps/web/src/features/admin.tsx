import { Badge } from "@chords/ui/components/badge";
import { Button } from "@chords/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@chords/ui/components/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@chords/ui/components/dialog";
import { Field, FieldLabel } from "@chords/ui/components/field";
import { Input } from "@chords/ui/components/input";
import { Spinner } from "@chords/ui/components/spinner";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@chords/ui/components/table";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useId, useState } from "react";
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

export type Page<T> = { rows: T[]; next: number | null };

export function Pager({
	offset,
	next,
	onChange,
}: {
	offset: number;
	next: number | null | undefined;
	onChange: (offset: number) => void;
}) {
	return (
		<div className="flex justify-end gap-2">
			<Button
				variant="outline"
				size="sm"
				disabled={!offset}
				onClick={() => onChange(Math.max(0, offset - 50))}
			>
				Previous
			</Button>
			<Button
				variant="outline"
				size="sm"
				disabled={next == null}
				onClick={() => next != null && onChange(next)}
			>
				Next
			</Button>
		</div>
	);
}

const linkClass = "font-medium underline-offset-4 hover:underline";

/** Links a record owner to its admin page, whether it is a person or a band. */
export function OwnerLink({
	id,
	kind,
	name,
}: {
	id: string;
	kind: "user" | "band";
	name: string | null;
}) {
	return kind === "user" ? (
		<Link to="/admin/users/$id" params={{ id }} className={linkClass}>
			{name ?? id}
		</Link>
	) : (
		<Link to="/admin/bands/$id" params={{ id }} className={linkClass}>
			{name ?? id} <Badge variant="outline">band</Badge>
		</Link>
	);
}

export function RecordLink({
	id,
	children,
}: {
	id: string;
	children: React.ReactNode;
}) {
	return (
		<Link to="/admin/library/$id" params={{ id }} className={linkClass}>
			{children}
		</Link>
	);
}

export function ErrorText({ error }: { error: Error | null }) {
	return error ? (
		<p role="alert" className="text-sm text-destructive">
			{error.message}
		</p>
	) : null;
}

/** An irreversible action that asks for a phrase to be typed back first. */
export function TypedConfirm({
	label,
	title,
	description,
	phrase,
	onConfirm,
}: {
	label: string;
	title: string;
	description: string;
	phrase: string;
	onConfirm: () => Promise<boolean>;
}) {
	const { busy } = useApp();
	const [open, setOpen] = useState(false);
	const [typed, setTyped] = useState("");
	const id = useId();
	return (
		<Dialog
			open={open}
			onOpenChange={(value) => {
				setOpen(value);
				setTyped("");
			}}
		>
			<DialogTrigger asChild>
				<Button size="sm" variant="destructive" disabled={busy}>
					{label}
				</Button>
			</DialogTrigger>
			<DialogContent>
				<form
					className="space-y-4"
					onSubmit={(event) => {
						event.preventDefault();
						void onConfirm().then((done) => done && setOpen(false));
					}}
				>
					<DialogHeader>
						<DialogTitle>{title}</DialogTitle>
						<DialogDescription>{description}</DialogDescription>
					</DialogHeader>
					<Field>
						<FieldLabel htmlFor={id}>
							Type <strong className="select-all">{phrase}</strong> to confirm
						</FieldLabel>
						<Input
							id={id}
							value={typed}
							autoComplete="off"
							onChange={(event) => setTyped(event.target.value)}
						/>
					</Field>
					<DialogFooter>
						<Button
							variant="destructive"
							disabled={busy || typed.trim() !== phrase}
						>
							{busy ? <Spinner /> : null} {label}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
