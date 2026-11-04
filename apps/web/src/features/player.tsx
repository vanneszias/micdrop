import type { Arrangement } from "@chords/data";
import {
	displayTranspose,
	KEYS,
	keyAccidental,
	keyDistance,
	shiftKey,
} from "@chords/song-core";
import { ChordDiagrams, SongSheet } from "@chords/song-ui";
import { Button } from "@chords/ui/components/button";
import { ButtonGroup } from "@chords/ui/components/button-group";
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
	Gauge,
	Guitar,
	Maximize2,
	Minimize2,
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
import { SetlistSheet, usePlayingSetlist } from "#/features/setlist-overview";

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
		const change = () => {
			setStage(!!document.fullscreenElement);
			if (!document.fullscreenElement) setOpen(true);
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
	const accidental = keyAccidental(shiftKey(shown.data.key, delta));
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
	}, [scrolling, speed]);
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
					<IconTip label="Edit song">
						<Button variant="ghost" size="icon-sm" asChild>
							<Link
								to="/songs/$id/edit"
								params={{ id: arrangement.id }}
								aria-label="Edit song"
							>
								<Pencil />
							</Link>
						</Button>
					</IconTip>
				)}
				<IconTip label={stage ? "Leave stage mode" : "Stage mode"}>
					<Button
						variant="ghost"
						size="icon-sm"
						className="max-sm:hidden"
						aria-label={stage ? "Leave stage mode" : "Stage mode"}
						aria-pressed={stage}
						onClick={() => {
							// Stage mode hides the app around the sheet: full screen, no sidebar.
							if (document.fullscreenElement) {
								void document.exitFullscreen();
								setOpen(true);
							} else {
								setOpen(false);
								void document.documentElement.requestFullscreen?.();
							}
						}}
					>
						{stage ? <Minimize2 /> : <Maximize2 />}
					</Button>
				</IconTip>
				<IconTip label="Print">
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label="Print"
						onClick={() => window.print()}
					>
						<Printer />
					</Button>
				</IconTip>
			</PageHeader>
			<div
				data-print="hide"
				className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b px-4 py-2 sm:justify-center sm:gap-2 [&>*]:shrink-0"
			>
				<div className="flex items-center gap-2 max-sm:hidden">
					<ButtonGroup aria-label="Key">
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
							label="Key"
							prefix="Key"
							original={shiftKey(shown.data.key, shown.data.sourceCapo)}
							className="w-24 justify-between"
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
					{lyricsOnly ? null : (
						<CapoSelect
							value={capo}
							onChange={setCapo}
							prefix="Capo"
							soundingKey={key}
							className="w-36 justify-between"
						/>
					)}
				</div>
				<Popover>
					<PopoverTrigger asChild>
						<Button variant="outline" className="sm:hidden">
							<span className="sr-only">Key</span>
							{key}
							{lyricsOnly ? null : (
								<>
									<span className="text-muted-foreground">·</span>
									{capo ? `Capo ${capo}` : "No capo"}
								</>
							)}
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
									className="w-full justify-between"
								/>
							</div>
						)}
					</PopoverContent>
				</Popover>
				<Popover>
					<IconTip label="View options">
						<PopoverTrigger asChild>
							<Button
								variant="outline"
								aria-label="View options"
								className="max-sm:px-2.5"
							>
								<SlidersHorizontal />
								View
							</Button>
						</PopoverTrigger>
					</IconTip>
					<PopoverContent align="start" className="w-72 space-y-4">
						<div className="flex items-center justify-between gap-4">
							<Label htmlFor="lyrics-only">Lyrics only</Label>
							<Switch
								id="lyrics-only"
								checked={lyricsOnly}
								onCheckedChange={setLyricsOnly}
							/>
						</div>
						{lyricsOnly ? null : (
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
				{lyricsOnly ? null : (
					<IconTip
						label={diagrams ? "Hide chord diagrams" : "Show chord diagrams"}
					>
						<Toggle
							variant="outline"
							pressed={diagrams}
							onPressedChange={setDiagrams}
							aria-label="Chord diagrams"
							className="px-2.5 sm:px-3"
						>
							<Guitar />
							Diagrams
						</Toggle>
					</IconTip>
				)}
				{arrangement.updatedAt !== shown.updatedAt ? (
					<Button
						variant="secondary"
						size="sm"
						className="ml-auto"
						onClick={() => setShown(arrangement)}
					>
						Load latest version
					</Button>
				) : null}
			</div>
			<section
				ref={sheet}
				className="print-scroll min-h-0 flex-1 overflow-auto focus-visible:outline-none"
				// biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users need to focus and scroll the chord sheet.
				tabIndex={0}
				aria-label="Chord sheet"
			>
				<div className="flex justify-center gap-10">
					<article
						className={cn(
							"min-w-0 px-5 py-6 pb-24 max-sm:w-full max-xl:mx-auto sm:px-6 sm:py-8",
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
									`Key ${key}`,
									lyricsOnly ? null : capo && shapes ? `Capo ${capo}` : null,
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
						/>
					</article>
					{diagrams && !lyricsOnly ? (
						// Wide screens keep the diagrams beside the sheet instead of under it.
						<aside
							data-print="hide"
							aria-label="Chord diagrams"
							className="diagram-rail sticky top-0 hidden h-fit w-60 shrink-0 pt-10 xl:block"
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
					<div className="mx-auto max-w-[800px] px-6">
						<ChordDiagrams
							content={shown.data.content}
							semitones={delta}
							accidental={accidental}
						/>
					</div>
				</div>
			) : null}
			{nextTitle ? (
				<button
					type="button"
					data-print="hide"
					onClick={next}
					className="flex shrink-0 items-center gap-2 border-t px-4 py-2 text-left text-xs text-muted-foreground sm:hidden"
				>
					Up next
					<span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
						{nextTitle}
					</span>
					<ChevronRight className="size-4" />
				</button>
			) : null}
			<footer
				data-print="hide"
				className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 border-t px-4 py-2"
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
								className="font-mono tabular-nums sm:hidden"
								aria-label={`Scroll speed ${speed}`}
							>
								<Gauge /> {(speed / 25).toFixed(1)}×
							</Button>
						</PopoverTrigger>
						<PopoverContent side="top" className="w-56 space-y-3">
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
					<span className={cn("truncate", !diagrams && "max-sm:hidden")}>
						{nextTitle ? (
							<>
								<span className="text-muted-foreground max-sm:hidden">
									Next:{" "}
								</span>
								{nextTitle}
							</>
						) : (
							"Next"
						)}
					</span>
					<ChevronRight />
				</Button>
			</footer>
		</div>
	);
}
