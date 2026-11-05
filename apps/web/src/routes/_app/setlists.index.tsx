import { copySetlist, type Setlist } from "@chords/data";
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
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
} from "@chords/ui/components/dropdown-menu";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@chords/ui/components/empty";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
	ArrowRightLeft,
	FileUp,
	FolderInput,
	ListMusic,
	Plus,
	Share2,
	Trash2,
} from "lucide-react";
import { useState } from "react";
import { PageBody, PageHeader } from "#/components/page-header";
import {
	KeyBadge,
	OverflowMenu,
	rowTarget,
	SongList,
	SongRow,
} from "#/components/song-row";
import { useApp } from "#/features/app-context";
import { freshSetlists } from "#/features/setlist-editor";
import { ShareDialog } from "#/features/share-dialog";
import { canMoveFrom, destinations, type Library } from "#/lib/songs";

export const Route = createFileRoute("/_app/setlists/")({
	component: Setlists,
});

function Setlists() {
	const {
		setlists,
		songs,
		arrangements,
		owner,
		account,
		bands,
		save,
		saveMany,
		run,
	} = useApp();
	const navigate = useNavigate();
	const [removing, setRemoving] = useState<Setlist>();
	const [sharing, setSharing] = useState<Setlist>();
	const targets = destinations(account, owner, bands);
	const movable = canMoveFrom(account, owner, bands);
	const transfer = (list: Setlist, target: Library, move: boolean) =>
		run(
			() => {
				const copy = copySetlist(
					list,
					songs,
					target.id,
					arrangements.filter((song) => song.owner === target.id),
				);
				return saveMany([
					...copy.songs,
					copy.list,
					...(move ? [{ ...list, archived: true }] : []),
				]);
			},
			`${move ? "Moved" : "Copied"} to ${target.name}`,
		);
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
			freshSetlists.add(row.id);
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
				<Link to="/setlists/import" aria-label="Import PDF">
					<FileUp /> <span className="sm:hidden">PDF</span>
					<span className="max-sm:hidden">Import PDF</span>
				</Link>
			</Button>
			<Button size="sm" onClick={() => void create()}>
				<Plus /> New setlist
			</Button>
		</>
	);
	return (
		<>
			<PageHeader pageTitle title="Setlists" />
			<PageBody
				title="Setlists"
				description="Put songs in order, set a key for each, then play straight through."
				actions={<>{setlists.length ? actions : null}</>}
			>
				{setlists.length ? (
					<SongList>
						{sorted.map((list) => (
							<SongRow
								key={list.id}
								leading={
									<KeyBadge className="bg-secondary text-muted-foreground">
										<ListMusic className="size-4" />
									</KeyBadge>
								}
								title={list.data.title}
								meta={[
									list.data.date
										? new Date(`${list.data.date}T00:00:00`).toLocaleDateString(
												undefined,
												{
													weekday: "short",
													day: "numeric",
													month: "short",
													year: "numeric",
												},
											)
										: "No date",
									`${list.data.entries.length} ${list.data.entries.length === 1 ? "song" : "songs"}`,
								].join(" · ")}
								main={(content) => (
									<Link
										to="/setlists/$id"
										params={{ id: list.id }}
										className={rowTarget}
									>
										{content}
									</Link>
								)}
								trailing={
									<OverflowMenu label={`Actions for ${list.data.title}`}>
										<DropdownMenuItem asChild>
											<Link to="/setlists/$id" params={{ id: list.id }}>
												<ListMusic /> Open
											</Link>
										</DropdownMenuItem>
										<DropdownMenuItem
											disabled={account === "local"}
											onClick={() => setSharing(list)}
										>
											<Share2 /> Share link
										</DropdownMenuItem>
										{targets.length ? (
											<DropdownMenuSub>
												<DropdownMenuSubTrigger>
													<FolderInput /> Copy to
												</DropdownMenuSubTrigger>
												<DropdownMenuSubContent>
													{targets.map((target) => (
														<DropdownMenuItem
															key={target.id}
															onClick={() => void transfer(list, target, false)}
														>
															{target.name}
														</DropdownMenuItem>
													))}
												</DropdownMenuSubContent>
											</DropdownMenuSub>
										) : null}
										{targets.length && movable ? (
											<DropdownMenuSub>
												<DropdownMenuSubTrigger>
													<ArrowRightLeft /> Move to
												</DropdownMenuSubTrigger>
												<DropdownMenuSubContent>
													{targets.map((target) => (
														<DropdownMenuItem
															key={target.id}
															onClick={() => void transfer(list, target, true)}
														>
															{target.name}
														</DropdownMenuItem>
													))}
												</DropdownMenuSubContent>
											</DropdownMenuSub>
										) : null}
										<DropdownMenuSeparator />
										<DropdownMenuItem
											variant="destructive"
											onClick={() => setRemoving(list)}
										>
											<Trash2 /> Delete
										</DropdownMenuItem>
									</OverflowMenu>
								}
							/>
						))}
					</SongList>
				) : (
					<Empty className="border border-dashed">
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
			</PageBody>
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
							<Trash2 /> Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
			{sharing ? (
				<ShareDialog
					key={sharing.id}
					kind="record"
					target={sharing.id}
					title={sharing.data.title}
					open
					onOpenChange={(open) => !open && setSharing(undefined)}
				/>
			) : null}
		</>
	);
}
