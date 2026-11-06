import {
	type Arrangement,
	copyArrangement,
	copySetlist,
	type Setlist,
	songIdentity,
} from "@chords/data";
import { Badge } from "@chords/ui/components/badge";
import { Button } from "@chords/ui/components/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@chords/ui/components/empty";
import {
	Item,
	ItemActions,
	ItemContent,
	ItemDescription,
	ItemGroup,
	ItemTitle,
} from "@chords/ui/components/item";
import { Skeleton } from "@chords/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronRight, Copy, Link2Off } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { PageHeader } from "#/components/page-header";
import { useApp } from "#/features/app-context";
import { Player } from "#/features/player";
import { api, canMoveFrom } from "#/lib/songs";

type Share =
	| { kind: "song"; record: Arrangement }
	| { kind: "setlist"; record: Setlist; songs: Arrangement[] };

export const Route = createFileRoute("/_app/shared/$token")({
	head: () => ({ meta: [{ title: "Shared with you · Mic Drop" }] }),
	validateSearch: z.object({ index: z.number().int().min(0).optional() }),
	component: Shared,
});

function Shared() {
	const { token } = Route.useParams();
	const { index } = Route.useSearch();
	const { account, online } = useApp();
	const navigate = useNavigate({ from: Route.fullPath });
	// Player remounts per song, so stage mode lives here to survive a song change.
	const [stage, setStage] = useState(false);
	const share = useQuery({
		queryKey: ["share", token],
		queryFn: () =>
			api<{ share: Share }>(
				`/api/shares?${new URLSearchParams({ token })}`,
			).then((data) => data.share),
		enabled: online,
		retry: false,
	});
	if (!online || share.error)
		return (
			<Unavailable
				message={
					!online
						? "Shared songs need a connection."
						: share.error?.message || ""
				}
			/>
		);
	if (!share.data)
		return (
			<>
				<PageHeader title="Shared with you" />
				<div className="space-y-4 p-4">
					<Skeleton className="h-10 w-64" />
					<Skeleton className="h-64 w-full" />
				</div>
			</>
		);
	const { data } = share;
	if (data.kind === "song")
		return (
			<Player
				account={account}
				arrangement={data.record}
				readOnly
				actions={<SaveCopy share={data} />}
			/>
		);
	const entries = data.record.data.entries.filter((entry) =>
		data.songs.some((song) => song.id === entry.arrangementId),
	);
	const go = (to?: number) =>
		void navigate({ search: { index: to }, replace: to !== undefined });
	const entry = index === undefined ? undefined : entries[index];
	const song = data.songs.find((row) => row.id === entry?.arrangementId);
	if (index !== undefined && entry && song)
		return (
			<Player
				key={`${song.id}-${index}`}
				account={account}
				arrangement={song}
				performanceKey={entry.key}
				notes={entry.notes}
				readOnly
				actions={
					<Button variant="ghost" size="sm" onClick={() => go()}>
						{data.record.data.title}
					</Button>
				}
				previous={index > 0 ? () => go(index - 1) : undefined}
				next={index < entries.length - 1 ? () => go(index + 1) : undefined}
				stage={stage}
				onStageChange={setStage}
			/>
		);
	return (
		<>
			<PageHeader title={data.record.data.title}>
				<SaveCopy share={data} />
			</PageHeader>
			<div className="w-full space-y-4 p-4">
				<div>
					<h2 className="text-2xl font-semibold tracking-tight">
						{data.record.data.title}
					</h2>
					<p className="text-sm text-muted-foreground">
						{[
							data.record.data.date,
							`${entries.length} ${entries.length === 1 ? "song" : "songs"}`,
						]
							.filter(Boolean)
							.join(" · ")}
					</p>
				</div>
				<ItemGroup className="gap-2">
					{entries.map((entry, position) => {
						const song = data.songs.find(
							(row) => row.id === entry.arrangementId,
						);
						return (
							<Item key={entry.id} variant="outline" asChild>
								<Link
									to="/shared/$token"
									params={{ token }}
									search={{ index: position }}
								>
									<span className="w-6 font-mono text-sm text-muted-foreground tabular-nums">
										{position + 1}
									</span>
									<ItemContent>
										<ItemTitle>{song?.data.title}</ItemTitle>
										<ItemDescription>
											{entry.notes || song?.data.artist || "Unknown artist"}
										</ItemDescription>
									</ItemContent>
									<ItemActions>
										<Badge variant="secondary" className="font-mono">
											{entry.key || song?.data.key}
										</Badge>
										<ChevronRight className="size-4" />
									</ItemActions>
								</Link>
							</Item>
						);
					})}
				</ItemGroup>
				{entries.length ? (
					<Button onClick={() => go(0)}>Play from the start</Button>
				) : null}
			</div>
		</>
	);
}

/** Copies what was shared into the library you're viewing, or your own if you can't edit it. */
function SaveCopy({ share }: { share: Share }) {
	const app = useApp();
	const { account, owner, bands, arrangements, save, saveMany, setOwner, run } =
		app;
	const navigate = useNavigate();
	const library = canMoveFrom(account, owner, bands) ? owner : account;
	const existing = arrangements.filter((song) => song.owner === library);
	const copy = () =>
		run(async () => {
			setOwner(library);
			if (share.kind === "song") {
				const identity = songIdentity(share.record.data);
				const match = existing.find(
					(song) => songIdentity(song.data) === identity,
				);
				const row = match ?? copyArrangement(share.record, library);
				if (!match) await save(row);
				await navigate({ to: "/songs/$id", params: { id: row.id } });
				return;
			}
			const result = copySetlist(share.record, share.songs, library, existing);
			await saveMany([...result.songs, result.list]);
			await navigate({ to: "/setlists/$id", params: { id: result.list.id } });
		}, "Saved to your songbook");
	return (
		<Button size="sm" onClick={() => void copy()}>
			<Copy /> Save copy
		</Button>
	);
}

function Unavailable({ message }: { message: string }) {
	return (
		<>
			<PageHeader title="Shared with you" />
			<Empty>
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<Link2Off />
					</EmptyMedia>
					<EmptyTitle>This link isn’t available</EmptyTitle>
					<EmptyDescription>{message}</EmptyDescription>
				</EmptyHeader>
				<EmptyContent>
					<Button asChild variant="outline">
						<Link to="/songs">Go to your songs</Link>
					</Button>
				</EmptyContent>
			</Empty>
		</>
	);
}
