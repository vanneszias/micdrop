import type { Arrangement } from "@chords/data";
import {
	displayTranspose,
	KEYS,
	keyDistance,
	keyLabel,
	modeAccidental,
	sheetChords,
	shiftKey,
	songMode,
} from "@chords/song-core";
import { ChordDiagrams, SongSheet } from "@chords/song-ui";
import { Button } from "@chords/ui/components/button";
import { ButtonGroup } from "@chords/ui/components/button-group";
import { DropdownMenuItem } from "@chords/ui/components/dropdown-menu";
import { Label } from "@chords/ui/components/label";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@chords/ui/components/popover";
import { useSidebar } from "@chords/ui/components/sidebar";
import { Slider } from "@chords/ui/components/slider";
import { Switch } from "@chords/ui/components/switch";
import { Toggle } from "@chords/ui/components/toggle";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@chords/ui/components/toggle-group";
import { cn } from "@chords/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import {
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	Download,
	Gauge,
	Guitar,
	Maximize2,
	Minus,
	Pause,
	Pencil,
	Play,
	Plus,
	Printer,
	SlidersHorizontal,
} from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { z } from "zod";
import { IconTip } from "#/components/icon-tip";
import { CapoSelect, KeySelect } from "#/components/key-select";
import { PageHeader } from "#/components/page-header";
import { OverflowMenu } from "#/components/song-row";
import { SetlistSheet, usePlayingSetlist } from "#/features/setlist-overview";
import { ChordSheet, Stage } from "#/features/stage";
import { exportSheet } from "#/lib/songs";

const preferences = z.object({
	shapes: z.boolean().default(true),
	// Absent until the player picks a size; until then it follows the screen width.
	fontSize: z.number().min(14).max(40).optional(),
	columns: z.number().int().min(1).max(3).default(1),
	diagrams: z.boolean().default(false),
	lyricsOnly: z.boolean().default(false),
	speed: z.number().min(5).max(80).default(25),
});
const songPreferences = z.object({
	key: z.string(),
	capo: z.number().int().min(0).max(12),
});

function load<T>(schema: z.ZodType<T>, key: string): T | null {
	try {
		return schema.parse(JSON.parse(localStorage.getItem(key) || "{}"));
	} catch {
		return null;
	}
}

export function Player({
	arrangement,
	account,
	performanceKey,
	performanceCapo,
	notes,
	next,
	previous,
	readOnly,
	actions,
}: {
	arrangement: Arrangement;
	account: string;
	performanceKey?: string;
	performanceCapo?: number;
	notes?: string;
	next?: () => void;
	previous?: () => void;
	readOnly?: boolean;
	actions?: React.ReactNode;
}) {
	const [shown, setShown] = useState(arrangement);
	const playing = usePlayingSetlist();
	const nextTitle = playing?.entries[playing.current + 1]?.title;
	const previousTitle = playing?.entries[playing.current - 1]?.title;
	const preferenceKey = `chords:player:${account}`;
	const songPreferenceKey = `${preferenceKey}:${arrangement.id}`;
	const [saved] = useState(() => load(preferences, preferenceKey));
	const [savedSong] = useState(() => load(songPreferences, songPreferenceKey));
	const [key, setKey] = useState(
		performanceKey ||
			arrangement.data.performanceKey ||
			savedSong?.key ||
			KEYS[
				(keyDistance("C", arrangement.data.key) + arrangement.data.sourceCapo) %
					12
			],
	);
	const [capo, setCapo] = useState(
		performanceCapo ??
			arrangement.data.performanceCapo ??
			savedSong?.capo ??
			arrangement.data.sourceCapo,
	);
	const [shapes, setShapes] = useState(saved?.shapes ?? true);
	const [chosenSize, setFontSize] = useState(saved?.fontSize);
	const narrow = useSyncExternalStore(
		(change) => {
			const media = window.matchMedia("(max-width: 640px)");
			media.addEventListener("change", change);
			return () => media.removeEventListener("change", change);
		},
		() => window.matchMedia("(max-width: 640px)").matches,
		() => false,
	);
	const fontSize = chosenSize ?? (narrow ? 17 : 23);
	const [columns, setColumns] = useState(saved?.columns ?? 1);
	const [diagrams, setDiagrams] = useState(saved?.diagrams ?? false);
	const [lyricsOnly, setLyricsOnly] = useState(saved?.lyricsOnly ?? false);
	const [scrolling, setScrolling] = useState(false);
	const [speed, setSpeed] = useState(saved?.speed ?? 25);
	useEffect(() => {
		try {
			localStorage.setItem(
				preferenceKey,
				JSON.stringify({
					shapes,
					fontSize: chosenSize,
					columns,
					diagrams,
					lyricsOnly,
					speed,
				}),
			);
			localStorage.setItem(songPreferenceKey, JSON.stringify({ key, capo }));
		} catch {
			/* Playing remains available when preference storage is full. */
		}
	}, [
		preferenceKey,
		songPreferenceKey,
		key,
		capo,
		shapes,
		chosenSize,
		columns,
		diagrams,
		lyricsOnly,
		speed,
	]);
	const sheet = useRef<HTMLElement>(null);
	const { setOpen } = useSidebar();
	const [stage, setStage] = useState(false);
	useEffect(() => {
		// Leaving full screen with Esc also leaves stage mode.
		const change = () => {
			if (document.fullscreenElement) return;
			setStage(false);
			setOpen(true);
		};
		document.addEventListener("fullscreenchange", change);
		return () => document.removeEventListener("fullscreenchange", change);
	}, [setOpen]);
	const step = (semitones: number) => {
		const index = KEYS.indexOf(key as (typeof KEYS)[number]);
		if (index >= 0) setKey(KEYS[(index + semitones + 12) % 12]);
	};
	const delta = displayTranspose(shown.data.key, key, shapes ? capo : 0);
	// Spell chords for the key they are shown in, so Ab shows Db rather than C#.
	const mode = songMode(shown.data.content, shown.data.key);
	const accidental = modeAccidental(shiftKey(shown.data.key, delta), mode);
	const keyName = keyLabel(key, mode);
	// "Capo 3 · E shapes": the chords shown are the shapes played above the capo.
	const capoLabel = `Capo ${capo} · ${keyLabel(shiftKey(key, -capo), mode)} shapes`;
	// Stage mode swaps the scrolling element, so autoscroll rebinds when it changes.
	// biome-ignore lint/correctness/useExhaustiveDependencies: see above.
	useEffect(() => {
		if (!scrolling) return;
		let frame: number;
		let last = performance.now();
		let position = sheet.current?.scrollTop || 0;
		let held = false;
		let resume: ReturnType<typeof setTimeout>;
		// Manual scrolling takes over, then autoscroll continues from the new position.
		const hold = () => {
			held = true;
			clearTimeout(resume);
			resume = setTimeout(() => {
				position = sheet.current?.scrollTop || 0;
				held = false;
			}, 500);
		};
		const events = [
			"wheel",
			"touchstart",
			"touchmove",
			"pointerdown",
			"keydown",
		];
		const element = sheet.current;
		for (const name of events)
			element?.addEventListener(name, hold, { passive: true });
		const tick = (now: number) => {
			if (element && !held) {
				position += (Math.min(now - last, 100) * speed) / 1000;
				element.scrollTop = position;
				if (element.scrollTop + element.clientHeight >= element.scrollHeight)
					setScrolling(false);
			}
			last = now;
			frame = requestAnimationFrame(tick);
		};
		frame = requestAnimationFrame(tick);
		return () => {
			cancelAnimationFrame(frame);
			clearTimeout(resume);
			for (const name of events) element?.removeEventListener(name, hold);
		};
	}, [scrolling, speed, stage]);
	useEffect(() => {
		const pause = () => {
			if (document.hidden) setScrolling(false);
		};
		document.addEventListener("visibilitychange", pause);
		return () => document.removeEventListener("visibilitychange", pause);
	}, []);
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.code !== "Space" || event.repeat) return;
			if (event.ctrlKey || event.metaKey || event.altKey) return;
			const target = event.target as HTMLElement | null;
			if (
				target?.closest(
					"input, textarea, select, button, a, [role], [contenteditable]",
				)
			)
				return;
			const go = event.shiftKey ? previous : next;
			if (!go) return;
			event.preventDefault();
			go();
		};
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [next, previous]);
	const enterStage = () => {
		// Stage mode hides the app around the sheet: full screen, no sidebar.
		setOpen(false);
		setStage(true);
		void document.documentElement.requestFullscreen?.().catch(() => {});
	};
	const leaveStage = () => {
		if (document.fullscreenElement) void document.exitFullscreen();
		setStage(false);
		setOpen(true);
	};
	const [chord, setChord] = useState<string>();
	const [fit, setFit] = useState<{ size: number; columns: number }>();
	// Sections split across columns only when whole ones would run past the screen.
	const [sheetHeight, setSheetHeight] = useState<number>();
	// Leaving stage mode mounts a new scroller, so the observer rebinds.
	// biome-ignore lint/correctness/useExhaustiveDependencies: see above.
	useEffect(() => {
		const element = sheet.current;
		if (!element) return;
		const observer = new ResizeObserver(() =>
			setSheetHeight(Math.max(240, element.clientHeight - 180)),
		);
		observer.observe(element);
		return () => observer.disconnect();
	}, [stage]);
	const songChords = sheetChords(shown.data.content, delta, accidental);
	if (stage)
		return (
			<Stage
				scroller={sheet}
				title={shown.data.title}
				meta={[
					`Key ${keyName}`,
					lyricsOnly ? null : capo && shapes ? capoLabel : null,
				]
					.filter(Boolean)
					.join(" · ")}
				notes={notes}
				content={shown.data.content}
				semitones={delta}
				accidental={accidental}
				chords={!lyricsOnly}
				baseSize={fontSize}
				scrolling={scrolling}
				onScrolling={setScrolling}
				previous={previous}
				next={next}
				previousTitle={previousTitle}
				nextTitle={nextTitle}
				onExit={leaveStage}
			/>
		);
	return (
		<div className="flex h-svh flex-col md:h-[calc(100svh-1.5rem)]">
			<PageHeader
				back
				headingInBody
				crumbs={[
					playing
						? { label: "Setlists", to: "/setlists" }
						: { label: "Repertoire", to: "/songs" },
				]}
				title={
					playing ? <SetlistSheet title={shown.data.title} /> : shown.data.title
				}
			>
				{actions}
				{readOnly ? null : (
					<Button variant="outline" size="sm" asChild className="max-sm:hidden">
						<Link
							to="/songs/$id/edit"
							params={{ id: arrangement.id }}
							aria-label="Edit"
						>
							<Pencil /> <span className="max-sm:hidden">Edit</span>
						</Link>
					</Button>
				)}
				<Button
					variant="outline"
					size="sm"
					aria-label="Stage mode"
					onClick={enterStage}
				>
					<Maximize2 /> Stage
				</Button>
				<OverflowMenu label="More song actions" variant="outline">
					{readOnly ? null : (
						// Phones keep the header to Stage and this menu, so the title has room.
						<DropdownMenuItem asChild className="sm:hidden">
							<Link to="/songs/$id/edit" params={{ id: arrangement.id }}>
								<Pencil /> Edit
							</Link>
						</DropdownMenuItem>
					)}
					<DropdownMenuItem onSelect={() => exportSheet(shown)}>
						<Download /> Export ChordPro
					</DropdownMenuItem>
					<DropdownMenuItem onSelect={() => window.print()}>
						<Printer /> Print
					</DropdownMenuItem>
				</OverflowMenu>
			</PageHeader>
			<div
				data-print="hide"
				className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b px-4 py-2 sm:justify-center sm:gap-2 [&>*]:shrink-0"
			>
				<div className="flex items-center gap-2 max-sm:hidden">
					{/* Lyrics only has no chords to transpose, so key and capo rest together. */}
					<ButtonGroup aria-label="Key">
						<Button
							variant="outline"
							size="icon"
							aria-label="Transpose down a semitone"
							disabled={lyricsOnly}
							onClick={() => step(-1)}
						>
							<Minus />
						</Button>
						<KeySelect
							value={key}
							onChange={setKey}
							disabled={lyricsOnly}
							label="Key"
							prefix="Key"
							original={shiftKey(shown.data.key, shown.data.sourceCapo)}
							mode={mode}
							className="w-28 justify-between"
						/>
						<Button
							variant="outline"
							size="icon"
							aria-label="Transpose up a semitone"
							disabled={lyricsOnly}
							onClick={() => step(1)}
						>
							<Plus />
						</Button>
					</ButtonGroup>
					{/* Lyrics only keeps the controls in place, disabled, so the bar does not jump. */}
					<CapoSelect
						value={capo}
						onChange={setCapo}
						prefix="Capo"
						soundingKey={key}
						mode={mode}
						disabled={lyricsOnly}
						className="w-36 justify-between"
					/>
				</div>
				<Popover>
					<PopoverTrigger asChild>
						<Button variant="outline" className="sm:hidden">
							<span className="sr-only">Key</span>
							{keyName}
							{/* Lyrics only dims the capo instead of dropping it, so the bar keeps its width. */}
							<span className="text-muted-foreground">·</span>
							<span
								className={lyricsOnly ? "text-muted-foreground" : undefined}
							>
								{capo ? `Capo ${capo}` : "No capo"}
							</span>
							<ChevronDown className="text-muted-foreground" />
						</Button>
					</PopoverTrigger>
					<PopoverContent align="start" className="w-72 space-y-4">
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
									value={key}
									onChange={setKey}
									original={shiftKey(shown.data.key, shown.data.sourceCapo)}
									mode={mode}
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
						{lyricsOnly ? null : (
							<div className="space-y-2">
								<Label>Capo</Label>
								<CapoSelect
									value={capo}
									onChange={setCapo}
									soundingKey={key}
									mode={mode}
									className="w-full justify-between"
								/>
							</div>
						)}
					</PopoverContent>
				</Popover>
				<Popover>
					{/* No tooltip: the label says it, and a tooltip on a popover trigger fights it for focus. */}
					<PopoverTrigger asChild>
						<Button
							variant="outline"
							aria-label="View options"
							className="relative max-sm:px-2.5"
						>
							<SlidersHorizontal />
							View
							{lyricsOnly || columns > 1 ? (
								// Shows that a view option changes the sheet.
								<span
									className="absolute top-1 right-1 size-1.5 rounded-full bg-primary"
									aria-hidden
								/>
							) : null}
						</Button>
					</PopoverTrigger>
					<PopoverContent align="start" className="w-72 space-y-4">
						<div className="flex items-center justify-between gap-4">
							<Label htmlFor="lyrics-only">Lyrics only</Label>
							<Switch
								id="lyrics-only"
								checked={lyricsOnly}
								onCheckedChange={setLyricsOnly}
							/>
						</div>
						{lyricsOnly || !capo ? null : (
							<div className="flex items-center justify-between gap-4">
								<Label htmlFor="shapes">Show chord shapes for capo</Label>
								<Switch
									id="shapes"
									checked={shapes}
									onCheckedChange={setShapes}
								/>
							</div>
						)}
						<div className="space-y-2 max-md:hidden">
							<Label>Columns</Label>
							<ToggleGroup
								type="single"
								variant="outline"
								aria-label="Columns"
								value={String(columns)}
								onValueChange={(value) => value && setColumns(Number(value))}
							>
								{[1, 2, 3].map((value) => (
									<ToggleGroupItem key={value} value={String(value)}>
										{value}
									</ToggleGroupItem>
								))}
							</ToggleGroup>
						</div>
						<div className="space-y-2">
							<Label>Text size · {fontSize}px</Label>
							{fit && columns > 1 && fit.columns < columns ? (
								<p className="text-xs text-muted-foreground">
									Only{" "}
									{fit.columns === 1
										? "one column fits"
										: `${fit.columns} columns fit`}{" "}
									at this size and width.
								</p>
							) : fit && fit.size < fontSize ? (
								<p className="text-xs text-muted-foreground">
									Shown at {fit.size}px so {fit.columns} columns fit.
								</p>
							) : null}
							<Slider
								min={14}
								max={40}
								step={2}
								aria-label="Text size"
								value={[fontSize]}
								onValueChange={([value]) => setFontSize(value)}
							/>
						</div>
					</PopoverContent>
				</Popover>
				{
					<IconTip
						label={diagrams ? "Hide chord diagrams" : "Show chord diagrams"}
					>
						<Toggle
							variant="outline"
							disabled={lyricsOnly}
							pressed={diagrams && !lyricsOnly}
							onPressedChange={setDiagrams}
							aria-label="Chord diagrams"
							className="px-2.5 sm:px-3"
						>
							<Guitar />
							Diagrams
						</Toggle>
					</IconTip>
				}
			</div>
			{arrangement.updatedAt !== shown.updatedAt ? (
				// A newer revision never hides at the end of a scrolling toolbar.
				<output
					data-print="hide"
					className="flex shrink-0 items-center gap-3 border-b bg-chord/60 px-4 py-2 text-sm sm:justify-center"
				>
					<span className="min-w-0 flex-1 sm:flex-none">
						This song was edited since you opened it.
					</span>
					<Button
						size="sm"
						variant="outline"
						onClick={() => setShown(arrangement)}
					>
						Load latest version
					</Button>
				</output>
			) : null}
			<section
				ref={sheet}
				className="print-scroll min-h-0 flex-1 overflow-auto focus-visible:outline-none"
				// biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users need to focus and scroll the chord sheet.
				tabIndex={0}
				aria-label="Chord sheet"
			>
				{/* Three columns keep the sheet centred whether or not the diagram rail shows. */}
				<div
					className={cn(
						"flex justify-center",
						// One column centres in a three-column grid; wider layouts take the room they need.
						columns === 1
							? "xl:grid xl:grid-cols-[1fr_auto_1fr] xl:gap-10"
							: "gap-8 px-2",
					)}
				>
					{columns === 1 ? <div className="max-xl:hidden" /> : null}
					<article
						className={cn(
							"min-w-0 px-5 py-6 pb-24 max-sm:w-full max-xl:mx-auto sm:px-6 sm:py-8 xl:min-w-[36rem]",
							columns > 1 && "flex-1",
							// One column hugs its content so the sheet sits centred, not left-aligned.
							columns === 1 && "sm:w-fit sm:min-w-[min(100%,36rem)]",
						)}
						style={{
							maxWidth: columns === 1 ? 800 : columns === 2 ? 1480 : 2100,
						}}
					>
						<header className="mb-5 sm:mb-7">
							<h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
								{shown.data.title}
							</h1>
							<p className="mt-0.5 text-sm text-muted-foreground sm:text-base">
								{[
									shown.data.artist,
									`Key ${keyName}`,
									lyricsOnly ? null : capo && shapes ? capoLabel : null,
								]
									.filter(Boolean)
									.join(" · ")}
							</p>
						</header>
						{notes ? (
							<p className="mb-6 rounded-md border bg-muted/30 p-3 text-sm">
								{notes}
							</p>
						) : null}
						<SongSheet
							content={shown.data.content}
							semitones={delta}
							accidental={accidental}
							fontSize={fontSize}
							columns={columns}
							chords={!lyricsOnly}
							onChord={setChord}
							onFit={setFit}
							height={sheetHeight}
						/>
					</article>
					{diagrams && !lyricsOnly ? (
						// Wide screens keep the diagrams beside the sheet instead of under it.
						<aside
							data-print="hide"
							aria-label="Chord diagrams"
							className="diagram-rail sticky top-0 hidden h-fit w-60 shrink-0 justify-self-start pt-10 xl:block"
						>
							<ChordDiagrams
								content={shown.data.content}
								semitones={delta}
								accidental={accidental}
							/>
						</aside>
					) : null}
				</div>
			</section>
			{diagrams && !lyricsOnly ? (
				<div
					data-print="hide"
					className="shrink-0 border-t bg-card/50 py-3 xl:hidden"
				>
					<div className="mx-auto max-w-[800px] px-6 max-sm:px-4">
						{narrow ? (
							// Phones get a compact launcher; each chord opens its diagram full size.
							<div className="flex items-center gap-1.5 overflow-x-auto">
								<span className="shrink-0 text-xs text-muted-foreground">
									Tap a chord
								</span>
								{songChords.map((value) => (
									<Button
										key={value}
										variant="outline"
										size="sm"
										className="shrink-0 font-mono"
										onClick={() => setChord(value)}
									>
										{value}
									</Button>
								))}
							</div>
						) : (
							<ChordDiagrams
								content={shown.data.content}
								semitones={delta}
								accidental={accidental}
							/>
						)}
					</div>
				</div>
			) : null}
			<footer
				data-print="hide"
				className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 border-t px-4 py-2 max-sm:px-2"
			>
				<Button
					variant="ghost"
					size="sm"
					onClick={previous}
					disabled={!previous}
					className={cn(
						"min-w-0 max-w-full justify-self-start",
						previous || next ? "" : "invisible",
					)}
					aria-label={
						previousTitle ? `Previous: ${previousTitle}` : "Previous song"
					}
				>
					<ChevronLeft />
					{/* Both directions read the same: a title on wide screens, a word on phones. */}
					<span className="sm:hidden">Prev</span>
					<span className="truncate max-sm:hidden">
						{previousTitle || "Previous"}
					</span>
				</Button>
				<div className="flex items-center gap-3">
					<Button
						variant={scrolling ? "secondary" : "default"}
						size="sm"
						aria-pressed={scrolling}
						onClick={() => setScrolling((value) => !value)}
					>
						{scrolling ? <Pause /> : <Play />}
						{scrolling ? "Pause" : "Scroll"}
					</Button>
					<Popover>
						<PopoverTrigger asChild>
							<Button
								variant="outline"
								size="sm"
								className="tabular-nums sm:hidden"
								aria-label={`Scroll speed ${(speed / 25).toFixed(1)}×`}
							>
								<Gauge /> {(speed / 25).toFixed(1)}×
							</Button>
						</PopoverTrigger>
						<PopoverContent
							side="top"
							align="center"
							className="w-56 space-y-3"
						>
							<Label>Scroll speed · {(speed / 25).toFixed(1)}×</Label>
							<Slider
								min={5}
								max={80}
								value={[speed]}
								onValueChange={([value]) => setSpeed(value)}
								aria-label="Scroll speed"
							/>
						</PopoverContent>
					</Popover>
					<div className="flex items-center gap-2 max-sm:hidden">
						<span className="text-xs text-muted-foreground">Speed</span>
						<Slider
							className="w-24"
							aria-label="Scroll speed"
							min={5}
							max={80}
							value={[speed]}
							onValueChange={([value]) => setSpeed(value)}
						/>
						<span className="w-8 text-right font-mono text-xs tabular-nums text-muted-foreground">
							{(speed / 25).toFixed(1)}×
						</span>
					</div>
				</div>
				<Button
					variant="ghost"
					size="sm"
					onClick={next}
					disabled={!next}
					className={cn(
						"min-w-0 max-w-full justify-self-end",
						previous || next ? "" : "invisible",
					)}
					aria-label={nextTitle ? `Next: ${nextTitle}` : "Next song"}
				>
					<span className="sm:hidden">Next</span>
					<span className="truncate max-sm:hidden">{nextTitle || "Next"}</span>
					<ChevronRight />
				</Button>
			</footer>
			<ChordSheet
				chord={chord}
				chords={songChords}
				onChord={setChord}
				onClose={() => setChord(undefined)}
			/>
		</div>
	);
}
