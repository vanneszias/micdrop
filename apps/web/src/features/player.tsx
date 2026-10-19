import type { Arrangement } from "@chords/data";
import { displayTranspose, KEYS, keyDistance } from "@chords/song-core";
import { ChordDiagrams, SongSheet } from "@chords/song-ui";
import { Button } from "@chords/ui/components/button";
import { Label } from "@chords/ui/components/label";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@chords/ui/components/popover";
import { Slider } from "@chords/ui/components/slider";
import { Switch } from "@chords/ui/components/switch";
import { Toggle } from "@chords/ui/components/toggle";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@chords/ui/components/toggle-group";
import { Link } from "@tanstack/react-router";
import {
	ChevronLeft,
	ChevronRight,
	Guitar,
	Pause,
	Pencil,
	Play,
	Printer,
	SlidersHorizontal,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { CapoSelect, KeySelect } from "#/components/key-select";
import { PageHeader } from "#/components/page-header";

const preferences = z.object({
	shapes: z.boolean().default(true),
	fontSize: z.number().min(14).max(40).default(23),
	columns: z.number().int().min(1).max(3).default(1),
	diagrams: z.boolean().default(false),
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
	notes,
	next,
	previous,
}: {
	arrangement: Arrangement;
	account: string;
	performanceKey?: string;
	notes?: string;
	next?: () => void;
	previous?: () => void;
}) {
	const [shown, setShown] = useState(arrangement);
	const preferenceKey = `chords:player:${account}`;
	const songPreferenceKey = `${preferenceKey}:${arrangement.id}`;
	const [saved] = useState(() => load(preferences, preferenceKey));
	const [savedSong] = useState(() => load(songPreferences, songPreferenceKey));
	const [key, setKey] = useState(
		performanceKey ||
			savedSong?.key ||
			KEYS[
				(keyDistance("C", arrangement.data.key) + arrangement.data.sourceCapo) %
					12
			],
	);
	const [capo, setCapo] = useState(
		savedSong?.capo ?? arrangement.data.sourceCapo,
	);
	const [shapes, setShapes] = useState(saved?.shapes ?? true);
	const [fontSize, setFontSize] = useState(saved?.fontSize ?? 23);
	const [columns, setColumns] = useState(saved?.columns ?? 1);
	const [diagrams, setDiagrams] = useState(saved?.diagrams ?? false);
	const [scrolling, setScrolling] = useState(false);
	const [speed, setSpeed] = useState(saved?.speed ?? 25);
	useEffect(() => {
		try {
			localStorage.setItem(
				preferenceKey,
				JSON.stringify({ shapes, fontSize, columns, diagrams, speed }),
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
		fontSize,
		columns,
		diagrams,
		speed,
	]);
	const sheet = useRef<HTMLElement>(null);
	const delta = displayTranspose(shown.data.key, key, shapes ? capo : 0);
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
			<PageHeader title={shown.data.title} back>
				<Button variant="ghost" size="icon-sm" asChild>
					<Link
						to="/songs/$id/edit"
						params={{ id: arrangement.id }}
						aria-label="Edit song"
					>
						<Pencil />
					</Link>
				</Button>
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label="Print"
					onClick={() => window.print()}
				>
					<Printer />
				</Button>
			</PageHeader>
			<div
				data-print="hide"
				className="flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-2"
			>
				<KeySelect value={key} onChange={setKey} label="Key" className="w-20" />
				<CapoSelect value={capo} onChange={setCapo} className="w-28" />
				<Popover>
					<PopoverTrigger asChild>
						<Button variant="outline" size="icon" aria-label="View options">
							<SlidersHorizontal />
						</Button>
					</PopoverTrigger>
					<PopoverContent align="start" className="w-64 space-y-4">
						<div className="flex items-center justify-between">
							<Label htmlFor="shapes">Guitar shapes</Label>
							<Switch
								id="shapes"
								checked={shapes}
								onCheckedChange={setShapes}
							/>
						</div>
						<div className="space-y-2">
							<Label>Columns</Label>
							<ToggleGroup
								type="single"
								variant="outline"
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
								value={[fontSize]}
								onValueChange={([value]) => setFontSize(value)}
							/>
						</div>
					</PopoverContent>
				</Popover>
				<Toggle
					variant="outline"
					pressed={diagrams}
					onPressedChange={setDiagrams}
					aria-label="Chord diagrams"
				>
					<Guitar />
				</Toggle>
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
				<article
					className="mx-auto px-6 py-8 pb-24"
					style={{
						maxWidth: columns === 1 ? 800 : columns === 2 ? 1480 : 2100,
					}}
				>
					<h2 className="text-3xl font-semibold tracking-tight">
						{shown.data.title}
					</h2>
					<p className="text-muted-foreground">{shown.data.artist}</p>
					<p className="mt-3 mb-8 font-mono text-xs text-muted-foreground">
						Key {key} · Capo {capo && shapes ? capo : "none"}
					</p>
					{notes ? (
						<p className="mb-6 rounded-md border bg-muted/30 p-3 text-sm">
							{notes}
						</p>
					) : null}
					<SongSheet
						content={shown.data.content}
						semitones={delta}
						fontSize={fontSize}
						columns={columns}
					/>
				</article>
			</section>
			{diagrams ? (
				<div data-print="hide" className="shrink-0 border-t px-4 py-3">
					<ChordDiagrams content={shown.data.content} semitones={delta} />
				</div>
			) : null}
			<footer
				data-print="hide"
				className="flex shrink-0 items-center gap-2 border-t px-4 py-2"
			>
				<Button
					variant="ghost"
					size="sm"
					onClick={previous}
					disabled={!previous}
					className={previous || next ? "" : "invisible"}
				>
					<ChevronLeft /> Prev
				</Button>
				<div className="mx-auto flex items-center gap-3">
					<Button
						variant={scrolling ? "secondary" : "default"}
						size="sm"
						aria-pressed={scrolling}
						onClick={() => setScrolling((value) => !value)}
					>
						{scrolling ? <Pause /> : <Play />}
						{scrolling ? "Pause" : "Scroll"}
					</Button>
					<Slider
						className="w-24"
						aria-label="Scroll speed"
						min={5}
						max={80}
						value={[speed]}
						onValueChange={([value]) => setSpeed(value)}
					/>
				</div>
				<Button
					variant="ghost"
					size="sm"
					onClick={next}
					disabled={!next}
					className={previous || next ? "" : "invisible"}
				>
					Next <ChevronRight />
				</Button>
			</footer>
		</div>
	);
}
