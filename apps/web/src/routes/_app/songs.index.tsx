import { type Arrangement, copyArrangement } from "@chords/data";
import { Badge } from "@chords/ui/components/badge";
import { Button } from "@chords/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
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
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { EllipsisVertical, Music, Plus } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { PageHeader } from "#/components/page-header";
import { SearchInput } from "#/components/search-input";
import { useApp } from "#/features/app-context";
import { ShareDialog } from "#/features/share-dialog";
import {
	api,
	canMoveFrom,
	destinations,
	exportSheet,
	freshArrangement,
	type Library,
} from "#/lib/songs";

export const Route = createFileRoute("/_app/songs/")({
	validateSearch: z.object({ q: z.string().optional() }),
	component: Songs,
});

function Songs() {
	const app = useApp();
	const { songs, owner, account, bands, setlists, store, save, saveMany, run } =
		app;
	const { q = "" } = Route.useSearch();
	const targets = destinations(account, owner, bands);
	const movable = canMoveFrom(account, owner, bands);
	const move = (song: Arrangement, target: Library) => {
		if (
			setlists.some((list) =>
				list.data.entries.some((entry) => entry.arrangementId === song.id),
			)
		)
			throw new Error("Remove this song from its setlists before moving it.");
		return saveMany([
			copyArrangement(song, target.id),
			{ ...song, archived: true },
		]);
	};
	const [sharing, setSharing] = useState<Arrangement>();
	const navigate = useNavigate({ from: Route.fullPath });
	const queryClient = useQueryClient();
	const shown = songs.filter((song) =>
		`${song.data.title} ${song.data.artist} ${song.data.tags.join(" ")} ${song.data.content}`
			.toLowerCase()
			.includes(q.toLowerCase()),
	);
	const add = (
		<Button asChild size="sm">
			<Link to="/songs/new">
				<Plus /> Add song
			</Link>
		</Button>
	);
	return (
		<>
			<PageHeader title="Songs">{songs.length ? add : null}</PageHeader>
			<div className="w-full space-y-4 p-4">
				{songs.length ? (
					<SearchInput
						aria-label="Search songs"
						placeholder="Search title, artist or lyrics"
						value={q}
						onChange={(event) =>
							void navigate({
								search: { q: event.target.value || undefined },
								replace: true,
							})
						}
					/>
				) : null}
				{shown.length ? (
					<div className="rounded-lg border">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Song</TableHead>
									<TableHead className="w-16">Key</TableHead>
									<TableHead className="w-12" />
								</TableRow>
							</TableHeader>
							<TableBody>
								{shown.map((song) => (
									<TableRow key={song.id} className="relative">
										<TableCell>
											<Link
												to="/songs/$id"
												params={{ id: song.id }}
												className="block font-medium after:absolute after:inset-0 hover:underline"
											>
												{song.data.title}
											</Link>
											<div className="text-xs text-muted-foreground">
												{song.data.artist || "Unknown artist"}
											</div>
										</TableCell>
										<TableCell>
											<Badge variant="secondary" className="font-mono">
												{song.data.key}
											</Badge>
										</TableCell>
										<TableCell className="relative z-[1] text-right">
											<DropdownMenu>
												<DropdownMenuTrigger asChild>
													<Button
														variant="ghost"
														size="icon-sm"
														aria-label={`Actions for ${song.data.title}`}
													>
														<EllipsisVertical />
													</Button>
												</DropdownMenuTrigger>
												<DropdownMenuContent align="end">
													<DropdownMenuItem asChild>
														<Link to="/songs/$id/edit" params={{ id: song.id }}>
															Edit
														</Link>
													</DropdownMenuItem>
													<DropdownMenuItem
														onClick={() =>
															void run(
																() =>
																	save(
																		freshArrangement(owner, {
																			...song.data,
																			title: `${song.data.title} (copy)`,
																			copiedFrom: song.id,
																		}),
																	),
																"Copied",
															)
														}
													>
														Duplicate
													</DropdownMenuItem>
													<DropdownMenuItem onClick={() => exportSheet(song)}>
														Export ChordPro
													</DropdownMenuItem>
													<DropdownMenuItem
														disabled={account === "local"}
														onClick={() =>
															void run(async () => {
																await store.sync();
																await api("/api/publications", {
																	action: "publish",
																	recordId: song.id,
																});
																await queryClient.invalidateQueries({
																	queryKey: ["publications"],
																});
															}, "Published to community")
														}
													>
														Publish
													</DropdownMenuItem>
													<DropdownMenuItem
														disabled={account === "local"}
														onClick={() => setSharing(song)}
													>
														Share link
													</DropdownMenuItem>
													{targets.length ? (
														<DropdownMenuSub>
															<DropdownMenuSubTrigger>
																Copy to
															</DropdownMenuSubTrigger>
															<DropdownMenuSubContent>
																{targets.map((target) => (
																	<DropdownMenuItem
																		key={target.id}
																		onClick={() =>
																			void run(
																				() =>
																					save(
																						copyArrangement(song, target.id),
																					),
																				`Copied to ${target.name}`,
																			)
																		}
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
																Move to
															</DropdownMenuSubTrigger>
															<DropdownMenuSubContent>
																{targets.map((target) => (
																	<DropdownMenuItem
																		key={target.id}
																		onClick={() =>
																			void run(
																				() => move(song, target),
																				`Moved to ${target.name}`,
																			)
																		}
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
														onClick={() =>
															void run(
																() => save({ ...song, archived: true }),
																"Archived",
															)
														}
													>
														Archive
													</DropdownMenuItem>
												</DropdownMenuContent>
											</DropdownMenu>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
				) : (
					<Empty className="border">
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<Music />
							</EmptyMedia>
							<EmptyTitle>{q ? "No matches" : "No songs yet"}</EmptyTitle>
							<EmptyDescription>
								{q
									? "Try another title, artist or lyric."
									: "Add a song to get started. No account needed."}
							</EmptyDescription>
						</EmptyHeader>
						<EmptyContent>
							{q ? (
								<Button
									variant="outline"
									onClick={() => void navigate({ search: {}, replace: true })}
								>
									Clear search
								</Button>
							) : (
								add
							)}
						</EmptyContent>
					</Empty>
				)}
			</div>
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
