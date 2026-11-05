import { Button } from "@chords/ui/components/button";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, FileUp, Globe, ListMusic, Plus } from "lucide-react";
import { PageBody, PageHeader } from "#/components/page-header";
import { KeyBadge, rowTarget, SongList, SongRow } from "#/components/song-row";
import { useApp } from "#/features/app-context";
import { displayKey } from "#/lib/songs";

export const Route = createFileRoute("/_app/")({
	head: () => ({ meta: [{ title: "Mic Drop" }] }),
	component: Home,
});

function SectionHeading({ title, to }: { title: string; to: string }) {
	return (
		<div className="flex items-center justify-between">
			<h2 className="text-base font-semibold">{title}</h2>
			<Link
				to={to}
				className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
			>
				View all
			</Link>
		</div>
	);
}

/** Recent songs and setlists, in the same rows as Repertoire and Setlists. */
function Home() {
	const { songs, setlists, user } = useApp();
	const recent = [...songs]
		.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
		.slice(0, 5);
	const upcoming = [...setlists]
		.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
		.slice(0, 3);
	const chevron = (
		<ChevronRight className="pointer-events-none size-4 text-muted-foreground" />
	);
	return (
		<>
			<PageHeader pageTitle title="Home" />
			<PageBody
				title={user ? `Welcome back, ${user.name.split(" ")[0]}` : "Mic Drop"}
				description="Your chord sheets, in your key. Works offline."
				actions={
					<>
						<Button asChild variant="outline" size="sm">
							<Link to="/community">
								<Globe /> Search catalogue
							</Link>
						</Button>
						<Button asChild variant="outline" size="sm">
							<Link to="/setlists/import">
								<FileUp /> Import setlist
							</Link>
						</Button>
						<Button asChild size="sm">
							<Link to="/songs/new">
								<Plus /> Add song
							</Link>
						</Button>
					</>
				}
			>
				<section className="space-y-3">
					<SectionHeading title="Recent songs" to="/songs" />
					{recent.length ? (
						<SongList>
							{recent.map((song) => (
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
									trailing={chevron}
								/>
							))}
						</SongList>
					) : (
						<p className="text-sm text-muted-foreground">
							No songs yet. Add one to get started. No account needed.
						</p>
					)}
				</section>
				{upcoming.length ? (
					<section className="space-y-3">
						<SectionHeading title="Setlists" to="/setlists" />
						<SongList>
							{upcoming.map((setlist) => (
								<SongRow
									key={setlist.id}
									leading={
										<KeyBadge className="bg-secondary text-muted-foreground">
											<ListMusic className="size-4" />
										</KeyBadge>
									}
									title={setlist.data.title}
									meta={`${setlist.data.entries.length} ${setlist.data.entries.length === 1 ? "song" : "songs"}`}
									main={(content) => (
										<Link
											to="/setlists/$id"
											params={{ id: setlist.id }}
											className={rowTarget}
										>
											{content}
										</Link>
									)}
									trailing={chevron}
								/>
							))}
						</SongList>
					</section>
				) : null}
			</PageBody>
		</>
	);
}
