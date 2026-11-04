import {
	type Arrangement,
	type CatalogueGroup,
	type CataloguePage,
	type CatalogueSummary,
	copyArrangement,
	searchRelevance,
	songGroup,
} from "@chords/data";
import { SongSheet } from "@chords/song-ui";
import { Badge } from "@chords/ui/components/badge";
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
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
	Check,
	ChevronDown,
	Eye,
	Flag,
	Globe,
	MoreHorizontal,
	Plus,
	SearchX,
	ThumbsDown,
	ThumbsUp,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { SearchInput } from "#/components/search-input";
import { api, canEditRole } from "#/lib/songs";
import { useApp } from "./app-context";

type Group = CatalogueGroup & { local: Arrangement[] };
export function CatalogueSearch({
	onSelect,
	initialQuery = "",
	publicOnly = false,
	chooseGroup,
	excludeId,
	inSet,
}: {
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
								song.owner === owner && searchRelevance(song.data, debounced),
						)
						.slice(0, 3)
				: [],
		[publicOnly, debounced, arrangements, owner],
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
						: "Search catalogue and repertoire"
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
				hidden={!groups.length && !catalogue.isFetching}
			>
				{online
					? publicOnly
						? "Public catalogue · choose a song to see its arrangements"
						: "Your repertoire, personal songs and the public catalogue"
					: "Offline · searching saved songs only"}
			</p>
			{ownMatches.length ? (
				<p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
					<span className="text-muted-foreground">In your repertoire:</span>
					{ownMatches.map((song) => (
						<Link
							key={song.id}
							to="/songs/$id"
							params={{ id: song.id }}
							className="font-medium underline-offset-4 hover:underline"
						>
							{song.data.title}
						</Link>
					))}
				</p>
			) : null}
			{catalogue.isFetching && online ? (
				<output className="text-sm">Searching…</output>
			) : null}
			{catalogue.error && online ? (
				<p role="alert" className="text-sm text-destructive">
					{catalogue.error.message} Your saved songs remain available.
				</p>
			) : null}
			{!groups.length && !catalogue.isFetching ? (
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
			<ul
				hidden={!groups.length}
				className={`divide-y rounded-lg border ${chooseGroup ? "max-h-80 overflow-y-auto" : ""}`}
			>
				{groups.map((group) => (
					<li key={group.id} className="p-3">
						<div className="flex items-center gap-2">
							<button
								type="button"
								className="group/row flex min-w-0 flex-1 items-center gap-3 rounded-md text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
								aria-expanded={selected === group.id}
								onClick={() =>
									setSelected(selected === group.id ? undefined : group.id)
								}
							>
								<span className="min-w-0 flex-1">
									<span className="flex items-center gap-2 text-sm font-medium">
										{group.title}
										{inSet &&
										group.local.some((song) => inSet.includes(song.id)) ? (
											<Badge variant="secondary" className="font-normal">
												<Check /> In set
											</Badge>
										) : null}
									</span>
									<span className="block text-xs text-muted-foreground">
										{[
											group.artists || "Unknown artist",
											group.local.some((song) => song.owner === owner)
												? "In your repertoire"
												: null,
											group.count
												? `${group.count} public ${group.count === 1 ? "version" : "versions"}`
												: null,
										]
											.filter(Boolean)
											.join(" · ")}
									</span>
								</span>
								<ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-aria-expanded/row:rotate-180" />
							</button>
							{onSelect && group.local.some((song) => song.owner === owner) ? (
								<Button
									type="button"
									size="sm"
									// Songs already in the set get a quiet "add again" so duplicates stay deliberate.
									variant={
										inSet && group.local.some((song) => inSet.includes(song.id))
											? "ghost"
											: "outline"
									}
									className="min-w-28 data-[variant=ghost]:text-muted-foreground"
									disabled={busy || !editable}
									onClick={() => {
										const preferred = [...group.local]
											.filter((song) => song.owner === owner)
											.sort(
												(a, b) =>
													Number(!!b.data.preferred) -
													Number(!!a.data.preferred),
											)[0];
										void run(() => select(preferred), "Arrangement selected");
									}}
								>
									<Plus />{" "}
									{inSet && group.local.some((song) => inSet.includes(song.id))
										? "Add again"
										: "Add"}
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
						</div>
						{selected === group.id ? (
							<ArrangementChoices
								group={group}
								onSelect={select}
								busy={busy}
								picking={!!onSelect}
							/>
						) : null}
					</li>
				))}
			</ul>
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
			? "Use arrangement"
			: localSong
				? "Copy to band and add"
				: "Save arrangement";
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
						local: undefined,
						saved: arrangements.some(
							(song) =>
								song.owner === owner &&
								(song.id === p.record_id ||
									song.data.copiedFrom === p.record_id),
						),
						score: p.score,
						myVote: p.myVote,
					})),
			].map((version, index) => (
				<div key={version.id} className="space-y-2">
					<div className="flex flex-wrap items-center gap-2">
						<div className="min-w-0 flex-1 basis-full text-sm sm:basis-0">
							<span className="flex items-center gap-2 font-medium">
								<Badge
									variant="secondary"
									className="min-w-7 justify-center font-mono text-xs"
								>
									{version.data.key}
								</Badge>
								{version.data.arrangementName || "Standard version"}
								{version.saved && !picking ? (
									<Badge variant="secondary" className="font-normal">
										<Check /> In your repertoire
									</Badge>
								) : null}
							</span>
							<p className="text-xs text-muted-foreground empty:hidden">
								{[
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
						<Button
							type="button"
							size="sm"
							variant="ghost"
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
								disabled={busy || !editable}
								onClick={() =>
									void run(
										() => add(version.id, version.local),
										"Arrangement selected",
									)
								}
							>
								{action(version.local)}
							</Button>
						)}
						{!version.local && account !== "local" ? (
							<>
								<fieldset className="flex items-center">
									<legend className="float-left mr-1 text-xs text-muted-foreground">
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
							</>
						) : null}
					</div>
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
				<div className="max-h-96 overflow-auto rounded-md border p-3">
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
							<SongSheet content={data.content} />
						</>
					) : null}
				</div>
			) : null}
		</div>
	);
}
