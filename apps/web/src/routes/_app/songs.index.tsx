import {
	type Arrangement,
	arrangementFingerprint,
	copyArrangement,
} from "@chords/data";
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
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
	Archive,
	ArrowRightLeft,
	Copy,
	CopyPlus,
	Download,
	EllipsisVertical,
	Globe,
	Music,
	Pencil,
	Plus,
	SearchX,
	Share2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { PageBody, PageHeader } from "#/components/page-header";
import { SearchInput } from "#/components/search-input";
import { useApp } from "#/features/app-context";
import { ShareDialog } from "#/features/share-dialog";
import {
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
	const { songs, owner, account, bands, setlists, save, saveMany, run } = app;
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
			<PageHeader title="Repertoire">{songs.length ? add : null}</PageHeader>
			<PageBody
				title={
					owner === account
						? "Repertoire"
						: `${bands.find((band) => band.id === owner)?.name ?? "Band"} repertoire`
				}
				description={
					songs.length
						? `${songs.length} ${songs.length === 1 ? "song" : "songs"} ready to play in your own key and capo.`
						: undefined
				}
			>
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
											<div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
												<span className="truncate">
													{[
														song.data.artist || "Unknown artist",
														song.data.arrangementName,
													]
														.filter(Boolean)
														.join(" · ")}
												</span>
												{song.data.draft ||
												song.data.visibility === "public" ? (
													<Badge
														variant="outline"
														className="h-4 px-1.5 text-[10px] font-normal text-muted-foreground"
													>
														{song.data.draft ? "Draft" : "Public"}
													</Badge>
												) : null}
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
															<Pencil /> Edit
														</Link>
													</DropdownMenuItem>
													<DropdownMenuItem
														onClick={() =>
															void run(
																() =>
																	save(
																		freshArrangement(owner, {
																			...song.data,
																			arrangementName: `${song.data.arrangementName || "Standard"} (copy)`,
																			visibility: "private",
																			songId: song.data.songId || song.id,
																			copiedFrom: song.id,
																		}),
																	),
																"Copied",
															)
														}
													>
														<CopyPlus /> Duplicate
													</DropdownMenuItem>
													<DropdownMenuItem onClick={() => exportSheet(song)}>
														<Download /> Export ChordPro
													</DropdownMenuItem>
													<DropdownMenuItem
														disabled={
															account === "local" ||
															!movable ||
															!!song.data.reviewRequired
														}
														onClick={() =>
															void run(async () => {
																if (
																	song.data.copiedFrom &&
																	song.data.sourceContentHash ===
																		(await arrangementFingerprint(
																			song.data.content,
																		))
																) {
																	toast.info(
																		"This arrangement is already public. Your unchanged copy stays private.",
																	);
																	return;
																}
																await save({
																	...song,
																	data: {
																		...song.data,
																		visibility: "public",
																		draft: false,
																	},
																});
																toast.success("Publication saved");
															})
														}
													>
														<Globe /> Publish
													</DropdownMenuItem>
													<DropdownMenuItem
														disabled={account === "local"}
														onClick={() => setSharing(song)}
													>
														<Share2 /> Share link
													</DropdownMenuItem>
													{targets.length ? (
														<DropdownMenuSub>
															<DropdownMenuSubTrigger>
																<Copy /> Copy to
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
																<ArrowRightLeft /> Move to
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
														<Archive /> Archive
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
					<Empty className="border border-dashed">
						<EmptyHeader>
							<EmptyMedia variant="icon">
								{q ? <SearchX /> : <Music />}
							</EmptyMedia>
							<EmptyTitle>
								{q ? `No songs match “${q}”` : "No songs yet"}
							</EmptyTitle>
							<EmptyDescription>
								{q
									? "Check the spelling, or try the artist or a line of the lyrics."
									: owner !== account
										? `Songs added here are shared with everyone in ${bands.find((band) => band.id === owner)?.name ?? "this band"}.`
										: account === "local"
											? "Paste a chord sheet or import one from a link. No account needed."
											: "Paste a chord sheet, import one from a link, or save one from the catalogue."}
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
			</PageBody>
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
