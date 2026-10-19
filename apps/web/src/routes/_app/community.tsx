import type { Arrangement } from "@chords/data";
import { Badge } from "@chords/ui/components/badge";
import { Button } from "@chords/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@chords/ui/components/card";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@chords/ui/components/empty";
import { Skeleton } from "@chords/ui/components/skeleton";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@chords/ui/components/toggle-group";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, Copy, Globe } from "lucide-react";
import { z } from "zod";
import { PageHeader } from "#/components/page-header";
import { SearchInput } from "#/components/search-input";
import { useApp } from "#/features/app-context";
import { api } from "#/lib/songs";

type Publication = {
	id: string;
	record_id: string;
	data: Arrangement["data"];
	score: number;
	upvotes: number;
	downvotes: number;
	myVote: number;
};

export const Route = createFileRoute("/_app/community")({
	validateSearch: z.object({ q: z.string().optional() }),
	component: Community,
});

function Community() {
	const { account, online, arrangements, createSong, run } = useApp();
	const { q = "" } = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	const publications = useQuery({
		queryKey: ["publications", q],
		queryFn: () =>
			api<{ publications: Publication[] }>(
				`/api/publications?q=${encodeURIComponent(q)}`,
			),
		enabled: online,
	});
	const list = publications.data?.publications;
	const act = (body: unknown) =>
		run(async () => {
			await api("/api/publications", body);
			await publications.refetch();
		});
	return (
		<>
			<PageHeader title="Community" />
			<div className="w-full space-y-4 p-4">
				<SearchInput
					aria-label="Search community"
					placeholder="Search shared arrangements"
					value={q}
					onChange={(event) =>
						void navigate({
							search: { q: event.target.value || undefined },
							replace: true,
						})
					}
				/>
				{publications.error ? (
					<p role="alert" className="text-sm text-destructive">
						{publications.error.message}
					</p>
				) : null}
				{publications.isPending && online ? (
					<div className="grid gap-4 sm:grid-cols-2">
						<Skeleton className="h-36" />
						<Skeleton className="h-36" />
					</div>
				) : null}
				{list?.length === 0 || !online ? (
					<Empty className="border">
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<Globe />
							</EmptyMedia>
							<EmptyTitle>
								{!online
									? "You’re offline"
									: q
										? "No matches"
										: "Nothing shared yet"}
							</EmptyTitle>
							<EmptyDescription>
								{!online
									? "Community needs a connection."
									: "Publish a song from your library to start the collection."}
							</EmptyDescription>
						</EmptyHeader>
					</Empty>
				) : null}
				<div className="grid gap-4 sm:grid-cols-2">
					{list?.map((publication) => (
						<Card key={publication.id} className="animate-in fade-in-0">
							<CardHeader>
								<CardTitle>{publication.data.title}</CardTitle>
								<CardDescription>
									{publication.data.artist || "Unknown artist"}
								</CardDescription>
							</CardHeader>
							<CardContent>
								<Badge variant="secondary" className="font-mono">
									{publication.data.key}
								</Badge>
							</CardContent>
							<CardFooter className="gap-2">
								<ToggleGroup
									type="single"
									variant="outline"
									size="sm"
									disabled={account === "local"}
									value={String(publication.myVote)}
									onValueChange={(value) =>
										void act({
											action: "vote",
											id: publication.id,
											value: Number(value || 0),
										})
									}
								>
									<ToggleGroupItem value="1" aria-label="Upvote">
										<ArrowUp />
									</ToggleGroupItem>
									<ToggleGroupItem value="-1" aria-label="Downvote">
										<ArrowDown />
									</ToggleGroupItem>
								</ToggleGroup>
								<span className="font-mono text-sm">{publication.score}</span>
								{arrangements.some(
									(song) => song.id === publication.record_id,
								) ? (
									<Button
										variant="ghost"
										size="sm"
										onClick={() =>
											void act({ action: "unpublish", id: publication.id })
										}
									>
										Unpublish
									</Button>
								) : null}
								<Button
									variant="outline"
									size="sm"
									className="ml-auto"
									onClick={() =>
										void run(() =>
											createSong({
												...publication.data,
												copiedFrom: publication.id,
											}),
										)
									}
								>
									<Copy /> Save copy
								</Button>
							</CardFooter>
						</Card>
					))}
				</div>
			</div>
		</>
	);
}
