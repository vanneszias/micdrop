import { Button } from "@chords/ui/components/button";
import {
	Item,
	ItemContent,
	ItemDescription,
	ItemGroup,
	ItemMedia,
	ItemTitle,
} from "@chords/ui/components/item";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, FileUp, ListMusic, Music, Plus } from "lucide-react";
import { PageHeader } from "#/components/page-header";
import { useApp } from "#/features/app-context";

export const Route = createFileRoute("/_app/")({
	head: () => ({ meta: [{ title: "Mic Drop" }] }),
	component: Home,
});

function Home() {
	const { songs, setlists, user } = useApp();
	const recent = [...songs]
		.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
		.slice(0, 5);
	const upcoming = [...setlists]
		.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
		.slice(0, 3);
	return (
		<>
			<PageHeader title="Home" />
			<div className="mx-auto w-full max-w-3xl space-y-8 p-4 md:p-8">
				<div className="space-y-1">
					<h2 className="text-2xl font-semibold tracking-tight">
						{user ? `Welcome back, ${user.name.split(" ")[0]}` : "Mic Drop"}
					</h2>
					<p className="text-muted-foreground">
						Your chord sheets, in your key. Works offline.
					</p>
				</div>
				<div className="flex flex-wrap gap-2">
					<Button asChild>
						<Link to="/songs/new">
							<Plus /> Add song
						</Link>
					</Button>
					<Button asChild variant="outline">
						<Link to="/setlists/import">
							<FileUp /> Import setlist
						</Link>
					</Button>
				</div>
				<section className="space-y-3">
					<div className="flex items-center justify-between">
						<h3 className="text-sm font-medium">Recent songs</h3>
						<Link
							to="/songs"
							className="text-sm text-muted-foreground hover:underline"
						>
							View all
						</Link>
					</div>
					{recent.length ? (
						<ItemGroup>
							{recent.map((song) => (
								<Item key={song.id} variant="outline" size="sm" asChild>
									<Link to="/songs/$id" params={{ id: song.id }}>
										<ItemMedia variant="icon">
											<Music />
										</ItemMedia>
										<ItemContent>
											<ItemTitle>{song.data.title}</ItemTitle>
											<ItemDescription>
												{song.data.artist || "Unknown artist"}
											</ItemDescription>
										</ItemContent>
										<ChevronRight className="size-4 text-muted-foreground" />
									</Link>
								</Item>
							))}
						</ItemGroup>
					) : (
						<p className="text-sm text-muted-foreground">
							No songs yet. Add one to get started. No account needed.
						</p>
					)}
				</section>
				{upcoming.length ? (
					<section className="space-y-3">
						<div className="flex items-center justify-between">
							<h3 className="text-sm font-medium">Setlists</h3>
							<Link
								to="/setlists"
								className="text-sm text-muted-foreground hover:underline"
							>
								View all
							</Link>
						</div>
						<ItemGroup>
							{upcoming.map((setlist) => (
								<Item key={setlist.id} variant="outline" size="sm" asChild>
									<Link to="/setlists/$id" params={{ id: setlist.id }}>
										<ItemMedia variant="icon">
											<ListMusic />
										</ItemMedia>
										<ItemContent>
											<ItemTitle>{setlist.data.title}</ItemTitle>
											<ItemDescription>
												{setlist.data.entries.length} songs
											</ItemDescription>
										</ItemContent>
										<ChevronRight className="size-4 text-muted-foreground" />
									</Link>
								</Item>
							))}
						</ItemGroup>
					</section>
				) : null}
			</div>
		</>
	);
}
