import { type Accidental, balanceColumns } from "@chords/song-core";
import { ChordDiagram, SongSheet } from "@chords/song-ui";
import { Button } from "@chords/ui/components/button";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@chords/ui/components/sheet";
import { cn } from "@chords/ui/lib/utils";
import {
	ChevronLeft,
	ChevronRight,
	Minus,
	Pause,
	Play,
	Plus,
	X,
} from "lucide-react";
import {
	type RefObject,
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";

/** The text size sheets are measured at; heights scale with size at equal words per line. */
const REFERENCE = 20;
/** Matches the sheet's own minimum column width, so it never drops a column we chose. */
const COLUMN_EMS = 18;
const GAP_EMS = 2.5;

function useViewport() {
	const [size, setSize] = useState(() => ({
		width: window.innerWidth,
		height: window.innerHeight,
	}));
	useEffect(() => {
		const update = () =>
			setSize({ width: window.innerWidth, height: window.innerHeight });
		window.addEventListener("resize", update);
		return () => window.removeEventListener("resize", update);
	}, []);
	return size;
}

/**
 * Full-screen performance view. It picks the column count and the largest text size at
 * which the whole song fits on screen; a song too long to fit keeps a readable size and
 * scrolls. The controls hide after a moment and come back on a tap or mouse move.
 */
export function Stage({
	scroller,
	title,
	meta,
	notes,
	content,
	semitones,
	accidental,
	chords,
	baseSize,
	scrolling,
	onScrolling,
	previous,
	next,
	previousTitle,
	nextTitle,
	onExit,
}: {
	scroller: RefObject<HTMLElement | null>;
	title: string;
	meta: string;
	notes?: string;
	content: string;
	semitones: number;
	accidental: Accidental;
	chords: boolean;
	baseSize: number;
	scrolling: boolean;
	onScrolling: (value: boolean | ((value: boolean) => boolean)) => void;
	previous?: () => void;
	next?: () => void;
	previousTitle?: string;
	nextTitle?: string;
	onExit: () => void;
}) {
	const { width, height } = useViewport();
	const measurer = useRef<HTMLDivElement>(null);
	const header = useRef<HTMLElement>(null);
	const [layout, setLayout] = useState({ size: baseSize, columns: 1 });
	const [adjust, setAdjust] = useState(0);
	// The measurer's DOM changes with the song and settings, so they re-run the fit.
	// biome-ignore lint/correctness/useExhaustiveDependencies: see above.
	useLayoutEffect(() => {
		const element = measurer.current;
		if (!element) return;
		const narrow = width < 640;
		const paddingX = narrow ? 40 : 96;
		const available = width - paddingX;
		const room = height - (header.current?.offsetHeight ?? 56) - 32;
		const minimum = Math.max(narrow ? 18 : 22, baseSize);
		const maximum = narrow ? 30 : 52;
		const columnWidth = (columns: number, size: number) =>
			(available - GAP_EMS * size * (columns - 1)) / columns;
		const tallest = (columns: number, size: number) => {
			element.style.width = `${(columnWidth(columns, size) * REFERENCE) / size}px`;
			const heights = [
				...element.querySelectorAll<HTMLElement>(".sheet-block"),
			].map((block) => (block.offsetHeight * size) / REFERENCE);
			const starts = balanceColumns(heights, columns);
			return Math.max(
				...starts.map((start, i) =>
					heights
						.slice(start, starts[i + 1] ?? heights.length)
						.reduce((sum, value) => sum + value, 0),
				),
			);
		};
		const allowed = (columns: number, size: number) =>
			columns === 1 || columnWidth(columns, size) >= COLUMN_EMS * size;
		let best: { size: number; columns: number } | undefined;
		for (let columns = 1; columns <= 3; columns++) {
			if (!allowed(columns, minimum)) break;
			// Heights grow with size, so the largest fitting size is found by bisection.
			let low = minimum;
			let high = maximum;
			if (tallest(columns, low) > room * 0.96) continue;
			while (high - low > 1) {
				const middle = Math.floor((low + high) / 2);
				if (allowed(columns, middle) && tallest(columns, middle) <= room * 0.96)
					low = middle;
				else high = middle;
			}
			if (!best || low > best.size) best = { size: low, columns };
		}
		if (!best) {
			// Too long to fit: keep it readable, in as many columns as the width allows.
			let columns = 1;
			while (columns < 3 && allowed(columns + 1, minimum)) columns++;
			best = { size: minimum, columns };
		}
		setLayout(best);
	}, [width, height, content, semitones, accidental, chords, baseSize, notes]);

	const [visible, setVisible] = useState(true);
	const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
	const holding = useRef(false);
	const wake = useCallback(() => {
		setVisible(true);
		clearTimeout(timer.current);
		timer.current = setTimeout(() => {
			if (!holding.current) setVisible(false);
		}, 2500);
	}, []);
	useEffect(() => {
		wake();
		return () => clearTimeout(timer.current);
	}, [wake]);
	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape" && !document.fullscreenElement) onExit();
			else wake();
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [onExit, wake]);
	const size = Math.max(14, layout.size + adjust);
	return (
		<div
			className={cn(
				"fixed inset-0 z-40 flex flex-col bg-background",
				!visible && "cursor-none",
			)}
			onPointerMove={(event) => event.pointerType === "mouse" && wake()}
		>
			<section
				ref={scroller}
				className="min-h-0 flex-1 overflow-auto px-5 focus-visible:outline-none sm:px-12"
				// biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users need to focus and scroll the chord sheet.
				tabIndex={0}
				aria-label="Chord sheet"
				onClick={() => {
					if (visible) {
						clearTimeout(timer.current);
						setVisible(false);
					} else wake();
				}}
				onKeyDown={() => {}}
			>
				<header
					ref={header}
					className="flex flex-wrap items-baseline gap-x-3 pt-4 pb-3 text-muted-foreground"
				>
					<h1 className="text-lg font-semibold text-foreground">{title}</h1>
					<span className="text-sm">{meta}</span>
					{notes ? (
						<p className="basis-full text-sm text-foreground/80">{notes}</p>
					) : null}
				</header>
				<SongSheet
					content={content}
					semitones={semitones}
					accidental={accidental}
					fontSize={size}
					columns={layout.columns}
					chords={chords}
				/>
				<div className="h-20" />
			</section>
			{/* Off screen at a fixed size: used to find the layout that fits. */}
			<div
				ref={measurer}
				aria-hidden
				className="pointer-events-none invisible fixed top-0 -left-[10000px]"
			>
				<SongSheet
					content={content}
					semitones={semitones}
					accidental={accidental}
					fontSize={REFERENCE}
					chords={chords}
				/>
			</div>
			<div
				className={cn(
					"pointer-events-none fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] flex justify-center px-3 transition-opacity duration-300",
					visible ? "opacity-100" : "opacity-0",
				)}
			>
				<div
					role="toolbar"
					aria-label="Stage controls"
					className={cn(
						"flex items-center gap-1 rounded-full border bg-popover/95 p-1.5 shadow-lg backdrop-blur",
						visible && "pointer-events-auto",
					)}
					onPointerEnter={() => {
						holding.current = true;
					}}
					onPointerLeave={() => {
						holding.current = false;
						wake();
					}}
					onFocus={() => {
						holding.current = true;
						wake();
					}}
					onBlur={() => {
						holding.current = false;
					}}
				>
					{previous || next ? (
						<Button
							variant="ghost"
							size="icon"
							className="rounded-full"
							disabled={!previous}
							onClick={previous}
							aria-label={
								previousTitle ? `Previous: ${previousTitle}` : "Previous song"
							}
						>
							<ChevronLeft />
						</Button>
					) : null}
					<Button
						size="sm"
						variant={scrolling ? "secondary" : "default"}
						className="rounded-full"
						aria-pressed={scrolling}
						onClick={() => onScrolling((value) => !value)}
					>
						{scrolling ? <Pause /> : <Play />}
						{scrolling ? "Pause" : "Scroll"}
					</Button>
					<fieldset className="m-0 flex items-center border-0 p-0">
						<legend className="sr-only">Text size</legend>
						<Button
							variant="ghost"
							size="icon"
							className="rounded-full"
							aria-label="Smaller text"
							onClick={() => setAdjust((value) => value - 2)}
						>
							<Minus />
						</Button>
						<span className="w-7 text-center text-sm font-semibold" aria-hidden>
							Aa
						</span>
						<Button
							variant="ghost"
							size="icon"
							className="rounded-full"
							aria-label="Larger text"
							onClick={() => setAdjust((value) => value + 2)}
						>
							<Plus />
						</Button>
					</fieldset>
					{previous || next ? (
						<Button
							variant="ghost"
							size="icon"
							className="rounded-full"
							disabled={!next}
							onClick={next}
							aria-label={nextTitle ? `Next: ${nextTitle}` : "Next song"}
						>
							<ChevronRight />
						</Button>
					) : null}
					<span className="mx-1 h-5 w-px bg-border" aria-hidden />
					<Button
						variant="ghost"
						size="sm"
						className="rounded-full"
						onClick={onExit}
					>
						<X /> Exit
					</Button>
				</div>
			</div>
		</div>
	);
}

/** A tapped chord's diagram at full size, with the song's other chords one tap away. */
export function ChordSheet({
	chord,
	chords,
	onChord,
	onClose,
}: {
	chord?: string;
	chords: string[];
	onChord: (chord: string) => void;
	onClose: () => void;
}) {
	return (
		<Sheet open={!!chord} onOpenChange={(open) => !open && onClose()}>
			<SheetContent
				side="bottom"
				className="mx-auto max-h-[85svh] w-full max-w-lg gap-0 rounded-t-2xl pb-[max(1rem,env(safe-area-inset-bottom))]"
			>
				<SheetHeader className="pb-0">
					<SheetTitle className="font-mono text-2xl">{chord}</SheetTitle>
					<SheetDescription>
						Tap the diagram for another shape.
					</SheetDescription>
				</SheetHeader>
				<div className="chord-sheet flex justify-center px-4 py-2">
					{chord ? <ChordDiagram chord={chord} /> : null}
				</div>
				{chords.length > 1 ? (
					<div className="flex gap-1.5 overflow-x-auto px-4 pt-2 pb-1">
						{chords.map((value) => (
							<Button
								key={value}
								variant={value === chord ? "default" : "outline"}
								size="sm"
								className="shrink-0 font-mono"
								aria-pressed={value === chord}
								onClick={() => onChord(value)}
							>
								{value}
							</Button>
						))}
					</div>
				) : null}
			</SheetContent>
		</Sheet>
	);
}
