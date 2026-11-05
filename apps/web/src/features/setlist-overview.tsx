import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@chords/ui/components/sheet";
import { cn } from "@chords/ui/lib/utils";
import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronDown, ListMusic } from "lucide-react";
import { useRef, useState } from "react";
import { useApp } from "#/features/app-context";
import { displayKey } from "#/lib/songs";

// The setlist the current song was opened from, with each entry's song resolved.
export function usePlayingSetlist() {
	const { setlists, arrangements } = useApp();
	const location = useRouterState({ select: (state) => state.location });
	const search = location.search as { setlist?: string; index?: number };
	const list = /^\/songs\/[^/]+$/.test(location.pathname)
		? setlists.find((row) => row.id === search.setlist)
		: undefined;
	if (!list) return null;
	return {
		list,
		current: search.index ?? 0,
		entries: list.data.entries.map((entry) => ({
			...entry,
			title:
				arrangements.find((row) => row.id === entry.arrangementId)?.data
					.title ?? "Missing song",
			keyName: (() => {
				const song = arrangements.find((row) => row.id === entry.arrangementId);
				return song && entry.key ? displayKey(song.data, entry.key) : entry.key;
			})(),
		})),
	};
}

// The header title shows the setlist position and opens the full setlist.
export function SetlistSheet({ title }: { title: string }) {
	const playing = usePlayingSetlist();
	const [open, setOpen] = useState(false);
	const trigger = useRef<HTMLButtonElement>(null);
	if (!playing) return title;
	const { list, current, entries } = playing;
	return (
		<Sheet open={open} onOpenChange={setOpen}>
			<SheetTrigger asChild>
				<button
					ref={trigger}
					type="button"
					className="flex max-w-full min-w-0 flex-col items-start rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
					aria-label={`Song ${current + 1} of ${entries.length} in ${list.data.title}, show setlist`}
				>
					{/* The sheet below names the song; the bar says where it sits in the set. */}
					<span className="flex w-full min-w-0 items-center gap-1.5">
						<span className="truncate">{list.data.title}</span>
						<span className="shrink-0 text-xs font-normal text-muted-foreground tabular-nums">
							{current + 1} of {entries.length}
						</span>
						<ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
					</span>
				</button>
			</SheetTrigger>
			<SheetContent
				side="bottom"
				className="max-h-[75svh] gap-0 rounded-t-3xl pb-[env(safe-area-inset-bottom)] sm:inset-auto sm:top-1/2 sm:left-1/2 sm:w-[28rem] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border"
				onCloseAutoFocus={(event) => {
					// Back to the trigger, without a keyboard ring after a tap.
					event.preventDefault();
					trigger.current?.focus({ focusVisible: false } as FocusOptions);
				}}
				onOpenAutoFocus={(event) => {
					// Focus the current song, not the close button.
					event.preventDefault();
					(event.currentTarget as HTMLElement)
						.querySelector<HTMLElement>('[aria-current="page"]')
						// A pointer opened the sheet, so no keyboard ring on the current row.
						?.focus({
							preventScroll: true,
							focusVisible: false,
						} as FocusOptions);
				}}
			>
				<SheetHeader className="border-b">
					<SheetTitle className="flex items-center gap-2">
						<ListMusic className="size-4" />
						<Link
							to="/setlists/$id"
							params={{ id: list.id }}
							className="truncate underline-offset-4 hover:underline"
						>
							{list.data.title}
						</Link>
					</SheetTitle>
					<SheetDescription>
						{entries.length} songs · playing {current + 1}
					</SheetDescription>
				</SheetHeader>
				<ol className="overflow-y-auto p-2">
					{entries.map((entry, position) => (
						<li key={entry.id}>
							<Link
								to="/songs/$id"
								params={{ id: entry.arrangementId }}
								search={{ setlist: list.id, index: position }}
								replace
								onClick={() => setOpen(false)}
								aria-current={position === current ? "page" : undefined}
								className={cn(
									"flex h-12 items-center gap-3 rounded-2xl px-3 text-sm transition-colors active:scale-[0.98]",
									position === current
										? "bg-accent font-medium text-accent-foreground"
										: "hover:bg-accent/50",
								)}
							>
								<span className="w-5 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
									{position + 1}
								</span>
								<span className="truncate">{entry.title}</span>
								{entry.key ? (
									<span className="ml-auto inline-flex h-6 min-w-8 shrink-0 items-center justify-center rounded bg-chord px-1.5 font-mono text-xs font-semibold text-chord-foreground">
										{entry.keyName}
									</span>
								) : null}
							</Link>
						</li>
					))}
				</ol>
			</SheetContent>
		</Sheet>
	);
}
