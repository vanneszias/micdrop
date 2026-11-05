import {
	type Arrangement,
	type CatalogueGroup,
	type CataloguePage,
	type CatalogueSummary,
	copyArrangement,
	searchRelevance,
	songGroup,
} from "@chords/data";
import { keyLabel } from "@chords/song-core";
import { SongSheet } from "@chords/song-ui";
import { Button } from "@chords/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
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
import { Input } from "@chords/ui/components/input";
import { cn } from "@chords/ui/lib/utils";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
	Check,
	ChevronDown,
	ChevronRight,
	Eye,
	Flag,
	Globe,
	MoreHorizontal,
	Plus,
	SearchX,
	ThumbsDown,
	ThumbsUp,
} from "lucide-react";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { SearchInput } from "#/components/search-input";
import {
	KeyBadge,
	rowTarget,
	SongList,
	SongRow,
	StatusBadge,
} from "#/components/song-row";
import { api, canEditRole, displayKey } from "#/lib/songs";
import { useApp } from "./app-context";

type Group = CatalogueGroup & { local: Arrangement[] };
export function CatalogueSearch({
	onSelect,
	initialQuery = "",
	publicOnly = false,
	chooseGroup,
	excludeId,
	inSet,
	compact = false,
}: {
	/** Narrow side panel: skips the source explanation under the search field. */
	compact?: boolean;
	onSelect?: (song: Arrangement) => Promise<void>;
	initialQuery?: string;
	publicOnly?: boolean;
	chooseGroup?: (group: { id: string; title: string }) => void;
	excludeId?: string;
	/** Arrangement ids already in the setlist being edited. */
	inSet?: string[];
}) {
	const { account, owner, online, arrangements, bands, save, busy, run } =
		useApp();
	const editable =
		owner === account ||
		canEditRole(bands.find((band) => band.id === owner)?.role);
	const [query, setQuery] = useState(initialQuery);
	useEffect(() => setQuery(initialQuery), [initialQuery]);
	const [debounced, setDebounced] = useState(initialQuery);
	const [selected, setSelected] = useState<string>();
	useEffect(() => {
		const timer = setTimeout(() => setDebounced(query), 250);
		return () => clearTimeout(timer);
	}, [query]);
	const catalogue = useInfiniteQuery({
		queryKey: ["catalogue", debounced, account],
		initialPageParam: 0,
		queryFn: ({ pageParam }) =>
			api<CataloguePage>(
				`/api/publications?q=${encodeURIComponent(debounced)}&offset=${pageParam}`,
			),
		getNextPageParam: (page) => page.next ?? undefined,
		enabled: online,
	});
	const local = useMemo(
		() =>
			publicOnly
				? []
				: arrangements.filter(
						(song) =>
							song.id !== excludeId &&
							(song.owner === owner || song.owner === account),
					),
		[arrangements, owner, account, publicOnly, excludeId],
	);
	// The catalogue lists public arrangements only; point at matching songs you already have.
	const ownMatches = useMemo(
		() =>
			publicOnly && debounced.trim()
				? arrangements
						.filter(
							(song) =>
								song.owner === owner &&
								searchRelevance(song.data, debounced) &&
								// Songs that also appear in the public results are marked there already.
								!catalogue.data?.pages.some((page) =>
									page.groups.some((group) => group.id === songGroup(song)),
								),
						)
						.slice(0, 3)
				: [],
		[publicOnly, debounced, arrangements, owner, catalogue.data],
	);
	const groups = useMemo(() => {
		const map = new Map<string, Group>();
		for (const page of (online ? catalogue.data?.pages : []) || [])
			for (const group of page.groups)
				map.set(group.id, { ...group, local: [] });
		for (const song of local) {
			const relevance = searchRelevance(song.data, debounced);
			if (!relevance) continue;
			const id = songGroup(song);
			const group = map.get(id) || {
				id,
				title: song.data.title,
				relevance,
				count: 0,
				artists: song.data.artist,
				local: [],
			};
			group.local.push(song);
			group.relevance = Math.max(group.relevance, relevance);
			map.set(id, group);
		}
		return [...map.values()].sort(
			(a, b) =>
				b.relevance +
					(b.local.some((song) => song.owner === owner) ? 20 : 0) -
					(a.relevance +
						(a.local.some((song) => song.owner === owner) ? 20 : 0)) ||
				a.title.localeCompare(b.title),
		);
	}, [catalogue.data, local, debounced, owner, online]);
	async function select(song: Arrangement) {
		if (onSelect) return onSelect(song);
		const existing = arrangements.find(
			(row) =>
				row.owner === owner &&
				(row.id === song.id || row.data.copiedFrom === song.id),
		);
		if (existing) {
			toast.info("Already saved in this repertoire");
			return;
		}
		await save(copyArrangement(song, owner));
		toast.success("Saved privately to repertoire");
	}
	return (
		<div className="space-y-3">
			<SearchInput
				aria-label={
					publicOnly
						? "Search the public catalogue"
						: "Search songs, artists or lyrics"
				}
				placeholder="Search songs, artists or lyrics…"
				value={query}
				onChange={(event) => {
					setQuery(event.target.value);
					setSelected(undefined);
				}}
				onClear={() => {
					setQuery("");
					setDebounced("");
					setSelected(undefined);
				}}
			/>
			<p
				className="text-xs text-muted-foreground"
				hidden={
					compact ||
					(!groups.length && !catalogue.isFetching) ||
					(publicOnly && !!debounced.trim())
				}
			>
				{online
					? publicOnly
						? "Public catalogue · choose a song to see its arrangements"
						: "Your repertoire, personal songs and the public catalogue"
					: "Offline · searching saved songs only"}
			</p>
			{ownMatches.length ? (
				<section aria-labelledby="own-matches" className="space-y-2">
					<h2
						id="own-matches"
						className="pt-2 text-[13px] text-muted-foreground"
					>
						Already in your repertoire
					</h2>
					<SongList>
						{ownMatches.map((song) => (
							<SongRow
								key={song.id}
								leading={<KeyBadge>{displayKey(song.data)}</KeyBadge>}
								title={song.data.title}
								meta={song.data.artist || "Unknown artist"}
								main={(content) => (
									<Link
										to="/songs/$id"
										params={{ id: song.id }}
										className={rowTarget}
									>
										{content}
									</Link>
								)}
								trailing={
									<ChevronRight className="pointer-events-none size-4 text-muted-foreground" />
								}
							/>
						))}
					</SongList>
					<h2 className="pt-3 text-[13px] text-muted-foreground">
						Public catalogue
					</h2>
				</section>
			) : null}
			{catalogue.isFetching && online ? (
				<output className="text-sm">Searching…</output>
			) : null}
			{catalogue.error && online ? (
				<p role="alert" className="text-sm text-destructive">
					{catalogue.error.message} Your saved songs remain available.
				</p>
			) : null}
			{!groups.length && !catalogue.isFetching && ownMatches.length ? (
				// Your repertoire matched, so the empty public result is a quiet note, not an error.
				<p className="text-sm text-muted-foreground">
					No public arrangements match “{debounced.trim()}”.
				</p>
			) : !groups.length && !catalogue.isFetching ? (
				<Empty
					className={
						chooseGroup
							? "border border-dashed p-4 md:p-4"
							: "border border-dashed py-10"
					}
				>
					<EmptyHeader>
						{chooseGroup ? null : (
							<EmptyMedia variant="icon">
								{debounced.trim() ? <SearchX /> : <Globe />}
							</EmptyMedia>
						)}
						<EmptyTitle className={chooseGroup ? "text-sm" : "text-base"}>
							{chooseGroup
								? "No other versions found"
								: debounced.trim()
									? publicOnly
										? `No public arrangements match “${debounced.trim()}”`
										: `No songs match “${debounced.trim()}”`
									: publicOnly
										? "Browse the public catalogue"
										: "Nothing to add yet"}
						</EmptyTitle>
						<EmptyDescription>
							{chooseGroup
								? "Search for another title if this song is known by a different name."
								: debounced.trim()
									? "Check the spelling, or try the artist or a line of the lyrics."
									: publicOnly
										? "Search by title, artist or a line of the lyrics to find arrangements shared by other players."
										: "Search by title, artist or a line of the lyrics."}
						</EmptyDescription>
					</EmptyHeader>
					{debounced.trim() && !chooseGroup ? (
						<EmptyContent>
							<Button
								variant="outline"
								size="sm"
								onClick={() => {
									setQuery("");
									setDebounced("");
								}}
							>
								Clear search
							</Button>
						</EmptyContent>
					) : null}
				</Empty>
			) : null}
			<SongList
				hidden={!groups.length}
				className={chooseGroup ? "max-h-80 overflow-y-auto" : undefined}
			>
				{groups.map((group) => {
					const own = group.local
						.filter((song) => song.owner === owner)
						.sort(
							(a, b) => Number(!!b.data.preferred) - Number(!!a.data.preferred),
						);
					const inRepertoire =
						own.length > 0 ||
						arrangements.some(
							(song) => song.owner === owner && songGroup(song) === group.id,
						);
					const placed =
						!!inSet && group.local.some((song) => inSet.includes(song.id));
					const open = selected === group.id;
					return (
						<SongRow
							key={group.id}
							leading={
								own[0] ? (
									<KeyBadge>{displayKey(own[0].data)}</KeyBadge>
								) : group.key ? (
									<KeyBadge>{keyLabel(group.key, group.mode)}</KeyBadge>
								) : (
									<KeyBadge className="bg-secondary text-muted-foreground">
										<Globe className="size-4" />
									</KeyBadge>
								)
							}
							title={group.title}
							meta={
								<>
									{[group.artists || "Unknown artist"]
										.filter(Boolean)
										.join(" · ")}
									{group.count > 1
										? ` · ${group.count} ${group.count === 1 ? "version" : "versions"}`
										: null}
									{inRepertoire && !onSelect && !placed ? (
										// Phones put the same pill under the artist, so the title keeps its width.
										<span className="mt-1 flex sm:hidden">
											<StatusBadge>
												<Check />
												<span>In repertoire</span>
											</StatusBadge>
										</span>
									) : null}
								</>
							}
							main={(content) => (
								<button
									type="button"
									className={rowTarget}
									aria-expanded={open}
									onClick={() => setSelected(open ? undefined : group.id)}
								>
									{content}
								</button>
							)}
							trailing={
								<>
									{/* Status sits where an action would, on every viewport. */}
									{placed ? (
										// Same height and shape as the Add button it stands in for.
										<StatusBadge>
											<Check />
											<span>In set</span>
										</StatusBadge>
									) : inRepertoire && !onSelect ? (
										// The same labelled pill as "In set"; phones show it under the artist.
										<span className="max-sm:hidden">
											<StatusBadge>
												<Check />
												<span>In repertoire</span>
											</StatusBadge>
										</span>
									) : null}
									{/* Add stays in the row when it is expanded, so the action never moves. */}
									{onSelect && own[0] && !placed ? (
										<Button
											type="button"
											size="sm"
											variant="outline"
											disabled={busy || !editable}
											onClick={() =>
												void run(() => select(own[0]), "Added to the set")
											}
										>
											<Plus /> Add
										</Button>
									) : null}
									{chooseGroup ? (
										<Button
											type="button"
											size="sm"
											variant="outline"
											onClick={() => chooseGroup(group)}
										>
											Use song group
										</Button>
									) : null}
									<ChevronDown
										aria-hidden
										className={cn(
											"pointer-events-none size-4 text-muted-foreground transition-transform",
											open && "rotate-180",
										)}
									/>
								</>
							}
						>
							{open ? (
								<div className="px-3 pb-3 sm:px-4">
									<ArrangementChoices
										group={group}
										onSelect={select}
										busy={busy}
										picking={!!onSelect}
									/>
								</div>
							) : null}
						</SongRow>
					);
				})}
			</SongList>
			{catalogue.hasNextPage && online ? (
				<Button
					variant="outline"
					disabled={catalogue.isFetchingNextPage}
					onClick={() => void catalogue.fetchNextPage()}
				>
					More songs
				</Button>
			) : null}
		</div>
	);
}

function ArrangementChoices({
	group,
	onSelect,
	busy,
	picking,
}: {
	group: Group;
	onSelect: (song: Arrangement) => Promise<void>;
	busy: boolean;
	/** True when choosing for a setlist or song group rather than saving to the repertoire. */
	picking: boolean;
}) {
	// Phone previews use the player's phone size.
	const narrow = useSyncExternalStore(
		(change) => {
			const media = window.matchMedia("(max-width: 640px)");
			media.addEventListener("change", change);
			return () => media.removeEventListener("change", change);
		},
		() => window.matchMedia("(max-width: 640px)").matches,
		() => false,
	);
	const { account, owner, online, bands, run, arrangements } = useApp();
	const editable =
		owner === account ||
		canEditRole(bands.find((band) => band.id === owner)?.role);
	const [preview, setPreview] = useState<string>();
	const [report, setReport] = useState<string>();
	const [reason, setReason] = useState("");
	const versions = useInfiniteQuery({
		queryKey: ["catalogue-versions", group.id, account],
		initialPageParam: 0,
		queryFn: ({ pageParam }) =>
			api<CataloguePage>(
				`/api/publications?song=${encodeURIComponent(group.id)}&offset=${pageParam}`,
			),
		getNextPageParam: (page) => page.next ?? undefined,
		enabled: online && group.count > 0,
	});
	const publicVersions =
		versions.data?.pages.flatMap((page) => page.publications) || [];
	const local = [...group.local].sort(
		(a, b) =>
			Number(b.owner === owner) - Number(a.owner === owner) ||
			Number(!!b.data.preferred) - Number(!!a.data.preferred),
	);
	const detail = useQuery({
		queryKey: ["catalogue-sheet", preview],
		queryFn: () =>
			api<{ publication: CatalogueSummary }>(
				`/api/publications?id=${encodeURIComponent(preview || "")}`,
			),
		enabled: !!preview && !local.some((song) => song.id === preview) && online,
	});
	const localPreview = local.find((song) => song.id === preview);
	const data = localPreview?.data || detail.data?.publication.data;
	const toSong = (publication: CatalogueSummary): Arrangement => ({
		id: publication.record_id,
		owner: "public",
		kind: "arrangement",
		version: 0,
		archived: false,
		updatedAt: new Date().toISOString(),
		data: { ...publication.data, songId: publication.song_id },
	});
	const add = async (id: string, localSong?: Arrangement) => {
		if (localSong) return onSelect(localSong);
		const response = await api<{ publication: CatalogueSummary }>(
			`/api/publications?id=${encodeURIComponent(id)}`,
		);
		await onSelect(toSong(response.publication));
	};
	const action = (localSong?: Arrangement) =>
		localSong?.owner === owner
			? "Add"
			: localSong
				? "Copy and add"
				: picking
					? "Add"
					: "Save";
	return (
		<div className="mt-3 space-y-3 border-t pt-3">
			{versions.isPending && online && group.count > 0 ? (
				<output>Loading arrangements…</output>
			) : null}
			{versions.error ? <p role="alert">{versions.error.message}</p> : null}
			{[
				...local.map((song) => ({
					id: song.id,
					data: song.data,
					mode: undefined,
					mine: false,
					local: song,
					saved: false,
					score: 0,
					myVote: 0,
				})),
				...publicVersions
					.filter((p) => !local.some((song) => song.id === p.record_id))
					.map((p) => ({
						id: p.id,
						data: p.data,
						mode: p.mode,
						local: undefined,
						saved: arrangements.some(
							(song) =>
								song.owner === owner &&
								(song.id === p.record_id ||
									song.data.copiedFrom === p.record_id),
						),
						// The player's own published arrangement: nothing to vote on.
						mine: arrangements.some(
							(song) => song.id === p.record_id && song.owner === account,
						),
						score: p.score,
						myVote: p.myVote,
					})),
			].map((version, index) => (
				<div key={version.id} className="space-y-2">
					{/* Versions sit under their song's tile; each names its key in the meta line. */}
					<div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pl-12">
						<div className="min-w-0 flex-1">
							<span className="flex min-w-0 items-center gap-2 text-sm font-medium">
								<span className="truncate">
									{version.data.arrangementName || "Standard version"}
								</span>
								{/* The song row above already says it is in the repertoire. */}
							</span>
							<p className="text-[13px] text-muted-foreground empty:hidden">
								{[
									`Key ${version.mode ? keyLabel(version.data.key, version.mode) : displayKey(version.data)}`,
									version.mine ? "Your published arrangement" : null,
									version.local
										? version.local.owner === owner
											? "Your repertoire"
											: "Personal"
										: picking
											? "Public"
											: null,
									version.score
										? `${version.score > 0 ? "+" : ""}${version.score} from players`
										: null,
									version.data.preferred
										? "Your preferred version"
										: index === 0 && version.score > 0
											? "Top rated"
											: null,
									version.data.draft ? "Draft" : null,
								]
									.filter(Boolean)
									.join(" · ")}
							</p>
						</div>
						<div
							className={cn(
								"flex shrink-0 items-center gap-1.5 max-sm:basis-full",
								// The narrow setlist panel gives the actions their own line.
								picking && "basis-full",
							)}
						>
							<Button
								type="button"
								size="sm"
								variant="ghost"
								className="max-sm:-ml-2.5"
								aria-expanded={preview === version.id}
								onClick={() =>
									setPreview(preview === version.id ? undefined : version.id)
								}
							>
								<Eye />
								{preview === version.id ? "Hide" : "Preview"}
							</Button>
							{account === "local" ? (
								<Button size="sm" variant="outline" asChild>
									<Link to="/login">Sign in to save</Link>
								</Button>
							) : version.saved && !picking ? null : (
								<Button
									type="button"
									size="sm"
									// Adding to a set matches the row's outline Add; saving is the page's primary.
									variant={picking ? "outline" : "default"}
									disabled={busy || !editable}
									onClick={() =>
										void run(
											() => add(version.id, version.local),
											"Arrangement selected",
										)
									}
								>
									{picking ? <Plus /> : null}
									{action(version.local)}
								</Button>
							)}
						</div>
					</div>
					{/* Voting is secondary: a quiet line under the version it rates. */}
					{version.mine ? null : !version.local && account !== "local" ? (
						<div className="flex items-center gap-1 pl-12 text-muted-foreground">
							<fieldset className="flex items-center">
								<legend className="float-left mr-0.5 text-xs text-muted-foreground">
									Useful?
								</legend>
								{([1, -1] as const).map((value) => (
									<Button
										key={value}
										type="button"
										size="icon-sm"
										variant="ghost"
										aria-label={value === 1 ? "Useful" : "Not useful"}
										aria-pressed={version.myVote === value}
										className="text-muted-foreground aria-pressed:bg-accent aria-pressed:text-foreground"
										onClick={() =>
											void run(async () => {
												await api("/api/publications", {
													action: "vote",
													id: version.id,
													value: version.myVote === value ? 0 : value,
												});
												await versions.refetch();
											})
										}
									>
										{value === 1 ? <ThumbsUp /> : <ThumbsDown />}
									</Button>
								))}
							</fieldset>
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button
										type="button"
										size="icon-sm"
										variant="ghost"
										aria-label="More actions"
									>
										<MoreHorizontal />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end">
									<DropdownMenuItem onSelect={() => setReport(version.id)}>
										<Flag /> Report a problem
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						</div>
					) : null}
					{report === version.id ? (
						<form
							className="flex gap-2"
							onSubmit={(event) => {
								event.preventDefault();
								void run(async () => {
									await api("/api/publications", {
										action: "report",
										id: version.id,
										reason,
									});
									setReport(undefined);
									setReason("");
								}, "Report submitted");
							}}
						>
							<Input
								aria-label="Reason for reporting"
								required
								minLength={3}
								maxLength={2000}
								value={reason}
								onChange={(event) => setReason(event.target.value)}
							/>
							<Button size="sm" type="submit">
								Submit report
							</Button>
						</form>
					) : null}
				</div>
			))}
			{versions.hasNextPage ? (
				<Button
					variant="outline"
					size="sm"
					disabled={versions.isFetchingNextPage}
					onClick={() => void versions.fetchNextPage()}
				>
					More arrangements
				</Button>
			) : null}
			{preview ? (
				// Indented to the versions' column, at the player's phone size.
				<div className="max-h-96 overflow-auto rounded-md border p-3 sm:ml-12 max-sm:max-h-none">
					{detail.isFetching && !localPreview ? (
						<output>Loading preview…</output>
					) : null}
					{detail.error ? <p role="alert">{detail.error.message}</p> : null}
					{data ? (
						<>
							<p className="mb-3 text-sm text-muted-foreground">
								{data.description}
							</p>
							{/^https?:\/\//i.test(data.sourceUrl) ? (
								<a
									className="mb-3 block text-xs underline"
									href={data.sourceUrl}
									target="_blank"
									rel="noreferrer"
								>
									Original source
								</a>
							) : null}
							<SongSheet content={data.content} fontSize={narrow ? 17 : 20} />
						</>
					) : null}
				</div>
			) : null}
		</div>
	);
}
