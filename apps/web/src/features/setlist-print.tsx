import type { Arrangement, Setlist } from "@chords/data";
import { keyDistance, modeAccidental, songMode } from "@chords/song-core";
import { SongSheet } from "@chords/song-ui";
import { Button } from "@chords/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@chords/ui/components/dialog";
import { Label } from "@chords/ui/components/label";
import { Switch } from "@chords/ui/components/switch";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@chords/ui/components/toggle-group";
import { cn } from "@chords/ui/lib/utils";
import { Printer } from "lucide-react";
import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { toast } from "sonner";
import { z } from "zod";
import { displayKey } from "#/lib/songs";

const options = z.object({
	lyricsOnly: z.boolean().default(false),
	pagePerSong: z.boolean().default(true),
	artist: z.boolean().default(true),
	key: z.boolean().default(true),
	notes: z.boolean().default(true),
	sections: z.boolean().default(true),
	comments: z.boolean().default(true),
});
type PrintOptions = z.infer<typeof options>;
const storageKey = "chords:setlist-print";

function loadOptions(): PrintOptions {
	try {
		return options.parse(JSON.parse(localStorage.getItem(storageKey) || "{}"));
	} catch {
		return options.parse({});
	}
}

/** Opens the setlist in a new window and prints it with the chosen options. */
function printSetlist(
	list: Setlist,
	songs: Arrangement[],
	choice: PrintOptions,
) {
	const popup = window.open("", "_blank");
	if (!popup) return toast.error("Allow pop-ups to print.");
	popup.document.title = list.data.title;
	popup.document.documentElement.className = "dark";
	for (const stylesheet of document.querySelectorAll('link[rel="stylesheet"]'))
		popup.document.head.appendChild(stylesheet.cloneNode(true));
	const container = popup.document.createElement("main");
	container.className = cn(
		!choice.pagePerSong && "print-flow",
		!choice.sections && "print-no-sections",
		!choice.comments && "print-no-comments",
	);
	popup.document.body.appendChild(container);
	flushSync(() =>
		createRoot(container).render(
			list.data.entries.map((entry) => {
				const song = songs.find((value) => value.id === entry.arrangementId);
				if (!song) return <p key={entry.id}>Arrangement unavailable</p>;
				const details = [
					choice.artist && song.data.artist,
					choice.key && `Key ${displayKey(song.data, entry.key)}`,
				].filter(Boolean);
				return (
					<article key={entry.id} className="print-song p-6">
						<h1 className="text-2xl font-semibold">{song.data.title}</h1>
						{details.length ? <p>{details.join(" · ")}</p> : null}
						{choice.notes && entry.notes ? <p>{entry.notes}</p> : null}
						<SongSheet
							content={song.data.content}
							chords={!choice.lyricsOnly}
							semitones={keyDistance(song.data.key, entry.key)}
							accidental={modeAccidental(
								entry.key,
								songMode(song.data.content, song.data.key),
							)}
						/>
					</article>
				);
			}),
		),
	);
	void popup.document.fonts.ready.then(() =>
		popup.requestAnimationFrame(() => popup.print()),
	);
}

export function SetlistPrintDialog({
	list,
	songs,
	open,
	onOpenChange,
}: {
	list: Setlist;
	songs: Arrangement[];
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const [choice, setChoice] = useState(loadOptions);
	useEffect(() => {
		try {
			localStorage.setItem(storageKey, JSON.stringify(choice));
		} catch {
			/* Printing works without remembering the last choice. */
		}
	}, [choice]);
	const toggle = (
		id: Exclude<keyof PrintOptions, "lyricsOnly">,
		label: string,
	) => (
		<div className="flex items-center justify-between gap-4">
			<Label htmlFor={`print-${id}`}>{label}</Label>
			<Switch
				id={`print-${id}`}
				checked={choice[id]}
				onCheckedChange={(value) =>
					setChoice((current) => ({ ...current, [id]: value }))
				}
			/>
		</div>
	);
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-sm">
				<DialogHeader>
					<DialogTitle>Print setlist</DialogTitle>
					<DialogDescription>
						Choose what goes on paper for {list.data.title || "this setlist"}.
					</DialogDescription>
				</DialogHeader>
				<div className="grid gap-4">
					<ToggleGroup
						type="single"
						variant="outline"
						aria-label="Content"
						className="w-full"
						value={choice.lyricsOnly ? "lyrics" : "chords"}
						onValueChange={(value) =>
							value &&
							setChoice((current) => ({
								...current,
								lyricsOnly: value === "lyrics",
							}))
						}
					>
						<ToggleGroupItem value="chords" className="flex-1">
							Chords
						</ToggleGroupItem>
						<ToggleGroupItem value="lyrics" className="flex-1">
							Lyrics only
						</ToggleGroupItem>
					</ToggleGroup>
					{toggle("pagePerSong", "Each song on a new page")}
					{toggle("artist", "Artist")}
					{toggle("key", "Key")}
					{toggle("notes", "Setlist notes")}
					{toggle("sections", "Section labels")}
					{toggle("comments", "Comments")}
				</div>
				<DialogFooter>
					<Button
						onClick={() => {
							printSetlist(list, songs, choice);
							onOpenChange(false);
						}}
					>
						<Printer /> Print
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
