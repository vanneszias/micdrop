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
import { Button } from "@chords/ui/components/button";
import { Input } from "@chords/ui/components/input";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
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
}: {
	onSelect?: (song: Arrangement) => Promise<void>;
	initialQuery?: string;
	publicOnly?: boolean;
	chooseGroup?: (group: { id: string; title: string }) => void;
	excludeId?: string;
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
				aria-label="Search catalogue and repertoire"
				placeholder="Search songs, artists or lyrics…"
				value={query}
				onChange={(event) => {
					setQuery(event.target.value);
					setSelected(undefined);
				}}
			/>
			<p className="text-xs text-muted-foreground">
				{online
					? publicOnly
						? "Public catalogue · choose a song to see its arrangements"
						: "Your repertoire, personal songs and the public catalogue"
					: "Offline · searching saved songs only"}
			</p>
			{catalogue.isFetching && online ? (
				<output className="text-sm">Searching…</output>
			) : null}
			{catalogue.error && online ? (
				<p role="alert" className="text-sm text-destructive">
					{catalogue.error.message} Your saved songs remain available.
				</p>
			) : null}
			{!groups.length && !catalogue.isFetching ? (
				<p className="py-6 text-sm text-muted-foreground">
					No songs found. Try a title, performing artist or lyric.
				</p>
			) : null}
			<ul
				className={`divide-y rounded-lg border ${chooseGroup ? "max-h-80 overflow-y-auto" : ""}`}
			>
				{groups.map((group) => (
					<li key={group.id} className="p-3">
						<div className="flex items-center gap-2">
							<button
								type="button"
								className="min-w-0 flex-1 text-left focus-visible:outline-2"
								aria-expanded={selected === group.id}
								onClick={() =>
									setSelected(selected === group.id ? undefined : group.id)
								}
							>
								<span className="block font-medium">{group.title}</span>
								<span className="block text-xs text-muted-foreground">
									{group.artists || "Artist not specified"}
									{group.local.some((song) => song.owner === owner)
										? " · In repertoire"
										: ""}{" "}
									· {group.count} public · {group.local.length} saved
								</span>
							</button>
							{onSelect && group.local.some((song) => song.owner === owner) ? (
								<Button
									type="button"
									size="sm"
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
									Add preferred
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
							<ArrangementChoices group={group} onSelect={select} busy={busy} />
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
}: {
	group: Group;
	onSelect: (song: Arrangement) => Promise<void>;
	busy: boolean;
}) {
	const { account, owner, online, bands, run } = useApp();
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
					score: 0,
					myVote: 0,
				})),
				...publicVersions
					.filter((p) => !local.some((song) => song.id === p.record_id))
					.map((p) => ({
						id: p.id,
						data: p.data,
						local: undefined,
						score: p.score,
						myVote: p.myVote,
					})),
			].map((version, index) => (
				<div key={version.id} className="space-y-2">
					<div className="flex flex-wrap items-center gap-2">
						<div className="min-w-0 flex-1 text-sm">
							<span className="font-medium">
								{version.data.artist || "Unknown artist"} ·{" "}
								{version.data.arrangementName || "Standard arrangement"}
							</span>
							<p className="text-xs text-muted-foreground">
								{version.local
									? version.local.owner === owner
										? "Repertoire"
										: "Personal"
									: `Public · score ${version.score}`}
								{version.data.preferred
									? " · Preferred"
									: index === 0
										? " · Recommended"
										: ""}
								{version.data.draft ? " · Draft" : ""}
							</p>
						</div>
						<Button
							type="button"
							size="sm"
							variant="ghost"
							onClick={() =>
								setPreview(preview === version.id ? undefined : version.id)
							}
						>
							Preview
						</Button>
						{account === "local" ? (
							<Button size="sm" variant="outline" asChild>
								<Link to="/login">Sign in to save</Link>
							</Button>
						) : (
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
								{([1, -1] as const).map((value) => (
									<Button
										key={value}
										type="button"
										size="sm"
										variant="ghost"
										aria-pressed={version.myVote === value}
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
										{value === 1 ? "Useful" : "Not useful"}
									</Button>
								))}
								<Button
									size="sm"
									variant="ghost"
									onClick={() => setReport(version.id)}
								>
									Report
								</Button>
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
