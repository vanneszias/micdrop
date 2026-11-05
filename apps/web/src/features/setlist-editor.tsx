import {
	type Arrangement,
	addToSetlist,
	type Setlist,
	type SongRecord,
} from "@chords/data";
import {
	KEYS,
	keyDistance,
	keyLabel,
	type Mode,
	modeAccidental,
	songMode,
} from "@chords/song-core";
import { SongSheet } from "@chords/song-ui";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@chords/ui/components/alert-dialog";
import { Button } from "@chords/ui/components/button";
import { ButtonGroup } from "@chords/ui/components/button-group";
import { Calendar } from "@chords/ui/components/calendar";
import {
	DropdownMenuItem,
	DropdownMenuSeparator,
} from "@chords/ui/components/dropdown-menu";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@chords/ui/components/empty";
import { Input } from "@chords/ui/components/input";
import { Label } from "@chords/ui/components/label";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@chords/ui/components/popover";
import { cn } from "@chords/ui/lib/utils";
import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
	arrayMove,
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useNavigate } from "@tanstack/react-router";
import {
	ArrowDown,
	ArrowUp,
	CalendarDays,
	Check,
	ChevronDown,
	CopyPlus,
	Download,
	GripVertical,
	ListMusic,
	LoaderCircle,
	Minus,
	Play,
	Plus,
	Printer,
	StickyNote,
	Trash2,
	X,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { toast } from "sonner";
import { CapoSelect, KeySelect } from "#/components/key-select";
import { PageBody, PageHeader } from "#/components/page-header";
import {
	KeyBadge,
	OverflowMenu,
	rowTarget,
	SongList,
	SongRow,
} from "#/components/song-row";
import { displayKey } from "#/lib/songs";
import { useApp } from "./app-context";
import { CatalogueSearch } from "./catalogue-search";

export function SetlistEditor({
	list,
	getSource,
	songs,
	save: store,
}: {
	list: Setlist;
	getSource: (id: string) => Promise<File | undefined>;
	songs: Arrangement[];
	save: (row: SongRecord) => Promise<void>;
}) {
	const navigate = useNavigate();
	const { saveMany } = useApp();
	const [source, setSource] = useState<File | undefined>();
	useEffect(() => {
		let active = true;
		setSource(undefined);
		void getSource(list.id)
			.then((file) => {
				if (active) setSource(file);
			})
			.catch(() => {});
		return () => {
			active = false;
		};
	}, [list.id, getSource]);
	const [pending, setPending] = useState(0);
	const saving = pending > 0;
	// Every change saves at once; the header shows when the last one has landed.
	function persist<T>(work: Promise<T>) {
		setPending((count) => count + 1);
		return work.finally(() => setPending((count) => count - 1));
	}
	const save = (row: SongRecord) => persist(store(row));
	function update(data: Setlist["data"]) {
		save({ ...list, data }).catch((reason) => toast.error(String(reason)));
	}
	function patch(
		id: string,
		change: Partial<Setlist["data"]["entries"][number]>,
	) {
		update({
			...list.data,
			entries: list.data.entries.map((value) =>
				value.id === id ? { ...value, ...change } : value,
			),
		});
	}
	function move(from: number, to: number) {
		update({ ...list.data, entries: arrayMove(list.data.entries, from, to) });
	}
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);
	function drop({ active, over }: DragEndEvent) {
		if (!over || active.id === over.id) return;
		const ids = list.data.entries.map((entry) => entry.id);
		move(ids.indexOf(String(active.id)), ids.indexOf(String(over.id)));
	}
	function play(index: number) {
		void navigate({
			to: "/songs/$id",
			params: { id: list.data.entries[index].arrangementId },
			search: { setlist: list.id, index },
		});
	}
	function print() {
		const popup = window.open("", "_blank");
		if (!popup) return toast.error("Allow pop-ups to print.");
		popup.document.title = list.data.title;
		popup.document.documentElement.className = "dark";
		for (const stylesheet of document.querySelectorAll(
			'link[rel="stylesheet"]',
		))
			popup.document.head.appendChild(stylesheet.cloneNode(true));
		const container = popup.document.createElement("main");
		popup.document.body.appendChild(container);
		flushSync(() =>
			createRoot(container).render(
				list.data.entries.map((entry) => {
					const song = songs.find((value) => value.id === entry.arrangementId);
					return song ? (
						<article key={entry.id} className="print-song p-6">
							<h1 className="text-2xl font-semibold">{song.data.title}</h1>
							<p>
								{song.data.artist} · Key {displayKey(song.data, entry.key)}
							</p>
							<p>{entry.notes}</p>
							<SongSheet
								content={song.data.content}
								semitones={keyDistance(song.data.key, entry.key)}
								accidental={modeAccidental(
									entry.key,
									songMode(song.data.content, song.data.key),
								)}
							/>
						</article>
					) : (
						<p key={entry.id}>Arrangement unavailable</p>
					);
				}),
			),
		);
		void popup.document.fonts.ready.then(() =>
			popup.requestAnimationFrame(() => popup.print()),
		);
	}
	const [deleting, setDeleting] = useState(false);
	const [noting, setNoting] = useState<string>();
	const [title, setTitle] = useState(list.data.title);
	// The name saves after a pause, so each keystroke is not its own revision.
	useEffect(() => {
		if (title.trim() === list.data.title || !title.trim()) return;
		const timer = setTimeout(
			() => update({ ...list.data, title: title.trim() }),
			500,
		);
		return () => clearTimeout(timer);
	});
	const entries = list.data.entries;
	const songCount = `${entries.length} ${entries.length === 1 ? "song" : "songs"}`;
	return (
		<>
			<PageHeader
				back
				headingInBody
				crumbs={[{ label: "Setlists", to: "/setlists" }]}
				title={title || "Untitled setlist"}
			>
				<SaveState saving={saving || title.trim() !== list.data.title} />
				<Button
					variant="outline"
					size="sm"
					onClick={print}
					disabled={!entries.length}
					className="max-sm:hidden"
				>
					<Printer /> Print
				</Button>
				<Button size="sm" disabled={!entries.length} onClick={() => play(0)}>
					<Play /> Play
				</Button>
				<OverflowMenu label="Setlist actions">
					<DropdownMenuItem
						className="sm:hidden"
						disabled={!entries.length}
						onSelect={print}
					>
						<Printer /> Print
					</DropdownMenuItem>
					{source ? (
						<DropdownMenuItem
							onSelect={() => {
								const url = URL.createObjectURL(source);
								const link = document.createElement("a");
								link.href = url;
								link.download = source.name || "setlist.pdf";
								link.click();
								setTimeout(() => URL.revokeObjectURL(url), 1000);
							}}
						>
							<Download /> Download original PDF
						</DropdownMenuItem>
					) : null}
					<DropdownMenuSeparator className="sm:hidden" />
					<DropdownMenuItem
						variant="destructive"
						onSelect={() => setDeleting(true)}
					>
						<Trash2 /> Delete setlist
					</DropdownMenuItem>
				</OverflowMenu>
			</PageHeader>
			<AlertDialog open={deleting} onOpenChange={setDeleting}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete this setlist?</AlertDialogTitle>
						<AlertDialogDescription>
							"{list.data.title}" will be removed. Your songs are not affected.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							onClick={() =>
								save({ ...list, archived: true })
									.then(() => navigate({ to: "/setlists" }))
									.catch((reason) => toast.error(String(reason)))
							}
						>
							<Trash2 /> Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
			<PageBody width="workspace">
				<div className="grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_24rem]">
					<section aria-labelledby="setlist-name" className="min-w-0 space-y-5">
						<div className="space-y-2">
							<label htmlFor="setlist-name" className="sr-only">
								Setlist name
							</label>
							<input
								id="setlist-name"
								value={title}
								onChange={(event) => setTitle(event.target.value)}
								onBlur={() => {
									if (!title.trim()) setTitle(list.data.title);
								}}
								className="-mx-2 w-[calc(100%+1rem)] rounded-md border border-transparent bg-transparent px-2 py-0.5 text-2xl font-semibold tracking-tight outline-none hover:border-input hover:border-dashed focus-visible:border-input focus-visible:border-solid focus-visible:ring-[3px] focus-visible:ring-ring/50"
							/>
							<div className="flex flex-wrap items-center gap-x-1.5 gap-y-2 text-sm text-muted-foreground">
								<SetlistDate
									value={list.data.date}
									onChange={(date) => update({ ...list.data, date })}
								/>
								<span aria-hidden>·</span>
								<span>{songCount}</span>
							</div>
						</div>
						{entries.length ? (
							<DndContext
								sensors={sensors}
								collisionDetection={closestCenter}
								modifiers={[restrictToVerticalAxis]}
								onDragEnd={drop}
							>
								<SortableContext
									items={entries.map((entry) => entry.id)}
									strategy={verticalListSortingStrategy}
								>
									<SongList>
										{entries.map((entry, index) => {
											const song = songs.find(
												(value) => value.id === entry.arrangementId,
											);
											const name = song?.data.title || `song ${index + 1}`;
											const capo =
												entry.capo ??
												song?.data.performanceCapo ??
												song?.data.sourceCapo ??
												0;
											return (
												<SortableEntry
													key={entry.id}
													id={entry.id}
													label={`Reorder ${name}`}
													index={index}
													title={song?.data.title || "Song unavailable"}
													meta={song?.data.artist || "Unknown artist"}
													onOpen={song ? () => play(index) : undefined}
													note={
														entry.notes || noting === entry.id ? (
															<Input
																aria-label={`Note for ${name}`}
																placeholder="Add a note…"
																id={`note-${entry.id}`}
																onBlur={() => setNoting(undefined)}
																className="h-7 w-full max-w-md rounded-md border-transparent bg-transparent px-2 text-[13px] text-muted-foreground shadow-none hover:border-input hover:border-dashed focus-visible:border-input focus-visible:text-foreground focus-visible:ring-0 dark:bg-transparent"
																value={entry.notes}
																onChange={(event) =>
																	patch(entry.id, {
																		notes: event.target.value,
																	})
																}
															/>
														) : null
													}
												>
													<KeyCapoPicker
														name={name}
														mode={
															song
																? songMode(song.data.content, song.data.key)
																: undefined
														}
														value={entry.key}
														capo={capo}
														onKey={(key) => patch(entry.id, { key })}
														onCapo={(value) => patch(entry.id, { capo: value })}
													/>
													<OverflowMenu
														label={`More actions for ${name}`}
														onCloseAutoFocus={(event) => {
															// Send focus to the note field that "Add note" just revealed.
															const field = document.getElementById(
																`note-${entry.id}`,
															);
															if (noting === entry.id && field) {
																event.preventDefault();
																field.focus();
															}
														}}
													>
														<DropdownMenuItem
															onSelect={() => setNoting(entry.id)}
														>
															<StickyNote />{" "}
															{entry.notes ? "Edit note" : "Add note"}
														</DropdownMenuItem>
														<DropdownMenuItem
															onSelect={() =>
																update({
																	...list.data,
																	entries: [
																		...entries.slice(0, index + 1),
																		{ ...entry, id: crypto.randomUUID() },
																		...entries.slice(index + 1),
																	],
																})
															}
														>
															<CopyPlus /> Add again
														</DropdownMenuItem>
														<DropdownMenuSeparator />
														<DropdownMenuItem
															disabled={index === 0}
															onSelect={() => move(index, index - 1)}
														>
															<ArrowUp /> Move up
														</DropdownMenuItem>
														<DropdownMenuItem
															disabled={index === entries.length - 1}
															onSelect={() => move(index, index + 1)}
														>
															<ArrowDown /> Move down
														</DropdownMenuItem>
														<DropdownMenuSeparator />
														<DropdownMenuItem
															variant="destructive"
															onSelect={() =>
																update({
																	...list.data,
																	entries: entries.filter(
																		(value) => value.id !== entry.id,
																	),
																})
															}
														>
															<X /> Remove from setlist
														</DropdownMenuItem>
													</OverflowMenu>
												</SortableEntry>
											);
										})}
									</SongList>
								</SortableContext>
							</DndContext>
						) : (
							<Empty className="border border-dashed py-10">
								<EmptyHeader>
									<EmptyMedia variant="icon">
										<ListMusic />
									</EmptyMedia>
									<EmptyTitle>No songs in this set yet</EmptyTitle>
									<EmptyDescription>
										Search for songs below and add them in the order you will
										play them.
									</EmptyDescription>
								</EmptyHeader>
							</Empty>
						)}
					</section>
					<section
						aria-labelledby="add-songs"
						className="min-w-0 space-y-3 lg:sticky lg:top-20 lg:self-start"
					>
						<div className="space-y-1">
							<h2 id="add-songs" className="text-base font-semibold">
								Add songs
							</h2>
							<p className="text-sm text-muted-foreground">
								Each song joins the end of the set in your key and capo.
							</p>
						</div>
						<CatalogueSearch
							compact
							inSet={entries.map((entry) => entry.arrangementId)}
							onSelect={async (source) => {
								const { rows } = addToSetlist(list, source, songs);
								await persist(saveMany(rows));
							}}
						/>
					</section>
				</div>
			</PageBody>
		</>
	);
}

/** "Saving…" while a change is on its way, "Saved" once it is stored, like the song editor. */
export function SaveState({ saving }: { saving: boolean }) {
	return (
		<output
			aria-live="polite"
			className="flex items-center gap-1 text-[13px] text-muted-foreground"
		>
			{saving ? (
				<LoaderCircle className="size-3.5 animate-spin" />
			) : (
				<Check className="size-3.5" />
			)}
			{saving ? "Saving…" : "Saved"}
		</output>
	);
}

/** One compact chip per song for its performance key and capo. */
function KeyCapoPicker({
	name,
	mode,
	value,
	capo,
	onKey,
	onCapo,
}: {
	name: string;
	mode?: Mode;
	value: string;
	capo: number;
	onKey: (key: string) => void;
	onCapo: (capo: number) => void;
}) {
	const step = (semitones: number) => {
		const index = KEYS.indexOf(value as (typeof KEYS)[number]);
		if (index >= 0) onKey(KEYS[(index + semitones + 12) % 12]);
	};
	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					size="sm"
					className="h-8 gap-1.5 px-2.5 font-normal"
					aria-label={`Key and capo for ${name}: ${keyLabel(value, mode)}, ${capo ? `capo ${capo}` : "no capo"}`}
				>
					<span className="font-mono font-semibold text-chord-foreground">
						{keyLabel(value, mode)}
					</span>
					<span className="text-muted-foreground max-sm:hidden">
						{capo ? `Capo ${capo}` : "No capo"}
					</span>
					{capo ? (
						<span className="text-muted-foreground sm:hidden">·{capo}</span>
					) : null}
					<ChevronDown className="text-muted-foreground" />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-64 space-y-4">
				<div className="space-y-2">
					<Label>Key</Label>
					<ButtonGroup className="w-full">
						<Button
							variant="outline"
							size="icon"
							aria-label="Transpose down a semitone"
							onClick={() => step(-1)}
						>
							<Minus />
						</Button>
						<KeySelect
							value={value}
							mode={mode}
							onChange={onKey}
							className="flex-1 justify-between"
						/>
						<Button
							variant="outline"
							size="icon"
							aria-label="Transpose up a semitone"
							onClick={() => step(1)}
						>
							<Plus />
						</Button>
					</ButtonGroup>
				</div>
				<div className="space-y-2">
					<Label>Capo</Label>
					<CapoSelect
						value={capo}
						onChange={onCapo}
						soundingKey={value}
						mode={mode}
						className="w-full justify-between"
					/>
				</div>
			</PopoverContent>
		</Popover>
	);
}

function SetlistDate({
	value,
	onChange,
}: {
	value: string;
	onChange: (date: string) => void;
}) {
	const [open, setOpen] = useState(false);
	const date = value ? new Date(`${value}T00:00:00`) : undefined;
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					id="date"
					variant="ghost"
					size="sm"
					aria-label={date ? "Change date" : "Pick a date"}
					className={cn(
						"-ml-2 h-7 px-2 font-normal text-muted-foreground hover:text-foreground",
						!date && "border border-dashed",
					)}
				>
					<CalendarDays />
					{date
						? date.toLocaleDateString(undefined, {
								weekday: "short",
								day: "numeric",
								month: "short",
								year: "numeric",
							})
						: "Pick a date"}
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-auto p-0" align="start">
				<Calendar
					mode="single"
					selected={date}
					defaultMonth={date}
					onSelect={(day) => {
						onChange(
							day
								? `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`
								: "",
						);
						setOpen(false);
					}}
				/>
			</PopoverContent>
		</Popover>
	);
}

function SortableEntry({
	id,
	label,
	index,
	title,
	meta,
	note,
	onOpen,
	children,
}: {
	id: string;
	label: string;
	index: number;
	title: string;
	meta: string;
	note?: ReactNode;
	onOpen?: () => void;
	children: ReactNode;
}) {
	const {
		attributes,
		listeners,
		setNodeRef,
		setActivatorNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id });
	return (
		<SongRow
			ref={setNodeRef}
			style={{ transform: CSS.Translate.toString(transform), transition }}
			className={cn(
				"group/entry bg-card",
				isDragging && "relative z-10 rounded-xl shadow-lg ring-1 ring-border",
			)}
			leading={
				<span className="flex items-center">
					<button
						ref={setActivatorNodeRef}
						type="button"
						aria-label={label}
						className="relative z-[1] -ml-1.5 cursor-grab touch-none rounded p-1 text-muted-foreground/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:cursor-grabbing"
						{...attributes}
						{...listeners}
					>
						<GripVertical className="size-4" />
					</button>
					<KeyBadge muted className="min-w-6 px-0">
						{index + 1}
					</KeyBadge>
				</span>
			}
			title={title}
			meta={meta}
			main={
				onOpen
					? (content) => (
							<button
								type="button"
								className={rowTarget}
								onClick={onOpen}
								aria-label={`Play ${title}`}
							>
								{content}
							</button>
						)
					: undefined
			}
			trailing={children}
		>
			{note ? <div className="-mt-2 pr-4 pb-2 pl-[4.75rem]">{note}</div> : null}
		</SongRow>
	);
}
