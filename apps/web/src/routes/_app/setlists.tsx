import type { Setlist } from "@chords/data";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@chords/ui/components/alert-dialog";
import { Button } from "@chords/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@chords/ui/components/dropdown-menu";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@chords/ui/components/empty";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@chords/ui/components/table";
import {
	createFileRoute,
	Link,
	Outlet,
	useNavigate,
} from "@tanstack/react-router";
import { EllipsisVertical, FileUp, ListMusic, Plus } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "#/components/page-header";
import { useApp } from "#/features/app-context";

export const Route = createFileRoute("/_app/setlists")({
	component: Setlists,
});

function Setlists() {
	const { setlists, owner, save, run } = useApp();
	const navigate = useNavigate();
	const [removing, setRemoving] = useState<Setlist>();
	const create = () =>
		run(async () => {
			const row: Setlist = {
				id: crypto.randomUUID(),
				kind: "setlist",
				owner,
				version: 0,
				archived: false,
				updatedAt: new Date().toISOString(),
				data: { title: "New setlist", date: "", entries: [] },
			};
			await save(row);
			await navigate({ to: "/setlists/$id", params: { id: row.id } });
		});
	const sorted = [...setlists].sort(
		(a, b) =>
			b.data.date.localeCompare(a.data.date) ||
			b.updatedAt.localeCompare(a.updatedAt),
	);
	const actions = (
		<>
			<Button variant="outline" size="sm" asChild>
				<Link to="/setlists/import">
					<FileUp /> Import PDF
				</Link>
			</Button>
			<Button size="sm" onClick={() => void create()}>
				<Plus /> New
			</Button>
		</>
	);
	return (
		<>
			<PageHeader title="Setlists">
				{setlists.length ? actions : null}
			</PageHeader>
			<div className="w-full space-y-4 p-4">
				{setlists.length ? (
					<>
						<div className="rounded-lg border">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Setlist</TableHead>
										<TableHead className="w-28">Date</TableHead>
										<TableHead className="w-20 text-right">Songs</TableHead>
										<TableHead className="w-12" />
									</TableRow>
								</TableHeader>
								<TableBody>
									{sorted.map((list) => (
										<TableRow key={list.id} className="relative">
											<TableCell>
												<Link
													to="/setlists/$id"
													params={{ id: list.id }}
													className="block font-medium after:absolute after:inset-0 hover:underline"
												>
													{list.data.title}
												</Link>
											</TableCell>
											<TableCell className="text-muted-foreground">
												{list.data.date || "—"}
											</TableCell>
											<TableCell className="text-right tabular-nums">
												{list.data.entries.length}
											</TableCell>
											<TableCell className="relative z-[1] text-right">
												<DropdownMenu>
													<DropdownMenuTrigger asChild>
														<Button
															variant="ghost"
															size="icon-sm"
															aria-label={`Actions for ${list.data.title}`}
														>
															<EllipsisVertical />
														</Button>
													</DropdownMenuTrigger>
													<DropdownMenuContent align="end">
														<DropdownMenuItem asChild>
															<Link to="/setlists/$id" params={{ id: list.id }}>
																Open
															</Link>
														</DropdownMenuItem>
														<DropdownMenuSeparator />
														<DropdownMenuItem
															variant="destructive"
															onClick={() => setRemoving(list)}
														>
															Delete
														</DropdownMenuItem>
													</DropdownMenuContent>
												</DropdownMenu>
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					</>
				) : (
					<Empty className="border">
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<ListMusic />
							</EmptyMedia>
							<EmptyTitle>No setlists yet</EmptyTitle>
							<EmptyDescription>
								Order your songs, set a key for each, and play them in sequence.
							</EmptyDescription>
						</EmptyHeader>
						<EmptyContent className="flex-row justify-center">
							{actions}
						</EmptyContent>
					</Empty>
				)}
			</div>
			<AlertDialog
				open={!!removing}
				onOpenChange={(open) => !open && setRemoving(undefined)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete this setlist?</AlertDialogTitle>
						<AlertDialogDescription>
							"{removing?.data.title}" will be removed. Your songs are not
							affected.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							onClick={() =>
								removing &&
								void run(() => save({ ...removing, archived: true }), "Deleted")
							}
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
			<Outlet />
		</>
	);
}
