import {
	type Arrangement,
	addToSetlist,
	type Setlist,
	type SongRecord,
} from "@chords/data";
import { keyDistance } from "@chords/song-core";
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
import { Calendar } from "@chords/ui/components/calendar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@chords/ui/components/dropdown-menu";
import { Field, FieldLabel } from "@chords/ui/components/field";
import { Input } from "@chords/ui/components/input";
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
	Download,
	GripVertical,
	MoreHorizontal,
	Play,
	Printer,
	Trash2,
	X,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { toast } from "sonner";
import { CapoSelect, KeySelect } from "#/components/key-select";
import { PageHeader } from "#/components/page-header";
import { useApp } from "./app-context";
import { CatalogueSearch } from "./catalogue-search";

export function SetlistEditor({
	list,
	getSource,
	songs,
	save,
	onClose,
}: {
	list: Setlist;
	getSource: (id: string) => Promise<File | undefined>;
	songs: Arrangement[];
	save: (row: SongRecord) => Promise<void>;
	onClose: () => void;
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
								{song.data.artist} · Key {entry.key}
							</p>
							<p>{entry.notes}</p>
							<SongSheet
								content={song.data.content}
								semitones={keyDistance(song.data.key, entry.key)}
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
	return (
		<>
			<PageHeader embedded title={list.data.title}>
				{source ? (
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label="Download original PDF"
						onClick={() => {
							const url = URL.createObjectURL(source);
							const link = document.createElement("a");
							link.href = url;
							link.download = source.name || "setlist.pdf";
							link.click();
							setTimeout(() => URL.revokeObjectURL(url), 1000);
						}}
					>
						<Download />
					</Button>
				) : null}
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label="Print setlist"
					onClick={print}
				>
					<Printer />
				</Button>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="ghost" size="icon-sm" aria-label="Setlist actions">
							<MoreHorizontal />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem
							variant="destructive"
							onSelect={() => setDeleting(true)}
						>
							<Trash2 /> Delete setlist
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
				<AlertDialog open={deleting} onOpenChange={setDeleting}>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>Delete this setlist?</AlertDialogTitle>
							<AlertDialogDescription>
								"{list.data.title}" will be removed. Your songs are not
								affected.
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
								Delete
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
				<Button
					size="sm"
					disabled={!list.data.entries.length}
					onClick={() => play(0)}
				>
					<Play /> Play
				</Button>
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label="Close"
					onClick={onClose}
				>
					<X />
				</Button>
			</PageHeader>
			<div className="w-full max-w-5xl space-y-6 p-4">
				<div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
					<Field>
						<FieldLabel htmlFor="name">Name</FieldLabel>
						<Input
							id="name"
							value={list.data.title}
							onChange={(event) =>
								update({
									...list.data,
									title: event.target.value || "Untitled setlist",
								})
							}
						/>
					</Field>
					<Field>
						<FieldLabel htmlFor="date">Date</FieldLabel>
						<SetlistDate
							value={list.data.date}
							onChange={(date) => update({ ...list.data, date })}
						/>
					</Field>
				</div>
				<DndContext
					sensors={sensors}
					collisionDetection={closestCenter}
					modifiers={[restrictToVerticalAxis]}
					onDragEnd={drop}
				>
					<SortableContext
						items={list.data.entries.map((entry) => entry.id)}
						strategy={verticalListSortingStrategy}
					>
						<ol className="divide-y rounded-lg border">
							{list.data.entries.map((entry, index) => {
								const song = songs.find(
									(value) => value.id === entry.arrangementId,
								);
								return (
									<SortableEntry
										key={entry.id}
										id={entry.id}
										label={`Reorder ${song?.data.title || `song ${index + 1}`}`}
									>
										<span className="w-5 font-mono text-xs text-muted-foreground">
											{index + 1}
										</span>
										<div className="min-w-40 flex-1">
											<Button
												variant="link"
												className="h-auto p-0"
												disabled={!song}
												onClick={() => play(index)}
											>
												{song?.data.title || "Song unavailable"}
											</Button>
											<Input
												aria-label={`Notes for song ${index + 1}`}
												placeholder="Notes"
												className="mt-1 h-7 border-0 bg-transparent px-0 text-xs shadow-none focus-visible:ring-0 dark:bg-transparent"
												value={entry.notes}
												onChange={(event) =>
													patch(entry.id, { notes: event.target.value })
												}
											/>
										</div>
										<div className="flex items-center gap-2 max-sm:w-full max-sm:pl-12">
											<KeySelect
												className="w-20"
												value={entry.key}
												onChange={(key) => patch(entry.id, { key })}
											/>
											<CapoSelect
												value={
													entry.capo ??
													song?.data.performanceCapo ??
													song?.data.sourceCapo ??
													0
												}
												onChange={(capo) => patch(entry.id, { capo })}
												className="w-28"
											/>
											<DropdownMenu>
												<DropdownMenuTrigger asChild>
													<Button
														variant="ghost"
														size="icon-sm"
														className="max-sm:ml-auto"
														aria-label={`More actions for ${song?.data.title || `song ${index + 1}`}`}
													>
														<MoreHorizontal />
													</Button>
												</DropdownMenuTrigger>
												<DropdownMenuContent align="end">
													<DropdownMenuItem
														disabled={index === 0}
														onSelect={() => move(index, index - 1)}
													>
														<ArrowUp /> Move up
													</DropdownMenuItem>
													<DropdownMenuItem
														disabled={index === list.data.entries.length - 1}
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
																entries: list.data.entries.filter(
																	(value) => value.id !== entry.id,
																),
															})
														}
													>
														<X /> Remove from setlist
													</DropdownMenuItem>
												</DropdownMenuContent>
											</DropdownMenu>
										</div>
									</SortableEntry>
								);
							})}
						</ol>
					</SortableContext>
				</DndContext>
				<div className="space-y-3">
					<h2 className="font-medium">Add songs</h2>
					<CatalogueSearch
						inSet={list.data.entries.map((entry) => entry.arrangementId)}
						onSelect={async (source) => {
							const { rows } = addToSetlist(list, source, songs);
							await saveMany(rows);
						}}
					/>
				</div>
			</div>
		</>
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
					variant="outline"
					className={cn(
						"w-full justify-start font-normal",
						!date && "text-muted-foreground",
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
			<PopoverContent className="w-auto p-0" align="end">
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
	children,
}: {
	id: string;
	label: string;
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
		<li
			ref={setNodeRef}
			style={{ transform: CSS.Translate.toString(transform), transition }}
			className={cn(
				"relative flex flex-wrap items-center gap-2 bg-background p-3 animate-in fade-in-0 slide-in-from-top-1 first:rounded-t-lg last:rounded-b-lg",
				isDragging && "z-10 rounded-lg shadow-lg ring-1 ring-border",
			)}
		>
			<button
				ref={setActivatorNodeRef}
				type="button"
				aria-label={label}
				className="-ml-1 cursor-grab touch-none rounded p-1 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:cursor-grabbing"
				{...attributes}
				{...listeners}
			>
				<GripVertical className="size-4" />
			</button>
			{children}
		</li>
	);
}
