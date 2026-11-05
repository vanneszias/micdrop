import { type Accidental, sheetColumns } from "@chords/song-core";
import { ChordDiagram, measurePieces, SongSheet } from "@chords/song-ui";
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
	const [layout, setLayout] = useState({
		size: baseSize,
		columns: 1,
		room: 0,
	});
	const [adjust, setAdjust] = useState(0);
	// The measurer's DOM changes with the song and settings, so they re-run the fit.
	// biome-ignore lint/correctness/useExhaustiveDependencies: see above.
	useLayoutEffect(() => {
		const element = measurer.current;
		if (!element) return;
		const narrow = width < 640;
		const paddingX = narrow ? 40 : 96;
		const available = width - paddingX;
		// Leave room for the control pill, so the last line is never under it.
		const room = height - (header.current?.offsetHeight ?? 56) - 88;
		// Desktop may go a little under the reading size when that buys even columns.
		const minimum = narrow ? Math.max(18, baseSize + 1) : 20;
		const maximum = narrow ? 24 : 52;
		const columnWidth = (columns: number, size: number) =>
			(available - GAP_EMS * size * (columns - 1)) / columns;
		const sheet = element.querySelector<HTMLElement>(".song-sheet");
		if (!sheet) return;
		const fill = room * 0.96;
		// Whole sections first; a section splits only when no whole layout fits the screen.
		const layoutAt = (columns: number, size: number, split: boolean) => {
			element.style.width = `${(columnWidth(columns, size) * REFERENCE) / size}px`;
			const pieces = measurePieces(sheet).map((piece) => ({
				...piece,
				height: (piece.height * size) / REFERENCE,
			}));
			const total = pieces.reduce((sum, piece) => sum + piece.height, 0);
			const { starts, tallest } = sheetColumns(
				pieces,
				columns,
				split ? fill : undefined,
			);
			// Even columns read better than one full column beside an empty one.
			const balance = total / starts.length / Math.max(1, tallest);
			return { tallest, columns: starts.length, balance };
		};
		const allowed = (columns: number, size: number) =>
			columns === 1 || columnWidth(columns, size) >= COLUMN_EMS * size;
		const search = (split: boolean) => {
			let best:
				| { size: number; columns: number; room: number; score: number }
				| undefined;
			for (let columns = 1; columns <= 3; columns++) {
				if (!allowed(columns, minimum)) break;
				if (layoutAt(columns, minimum, split).tallest > fill) continue;
				// Heights grow with size, so the largest fitting size is found by bisection.
				let low = minimum;
				let high = maximum;
				while (high - low > 1) {
					const middle = Math.floor((low + high) / 2);
					if (
						allowed(columns, middle) &&
						layoutAt(columns, middle, split).tallest <= fill
					)
						low = middle;
					else high = middle;
				}
				const result = layoutAt(columns, low, split);
				const score = low * (0.7 + 0.3 * result.balance);
				if (!best || score > best.score)
					best = { size: low, columns: result.columns, room, score };
			}
			return best;
		};
		let best: { size: number; columns: number; room: number } | undefined =
			search(false) ?? search(true);
		if (!best) {
			// Too long to fit: keep it readable, in as many columns as the width allows.
			let columns = 1;
			while (columns < 3 && allowed(columns + 1, minimum)) columns++;
			best = { size: minimum, columns, room };
		}
		setLayout(best);
	}, [width, height, content, semitones, accidental, chords, baseSize, notes]);

	const [visible, setVisible] = useState(true);
	// The first time the controls hide, say how to get them back.
	const [hint, setHint] = useState<"pending" | "shown" | "done">("pending");
	useEffect(() => {
		if (visible || hint !== "pending") return;
		setHint("shown");
		const done = setTimeout(() => setHint("done"), 2500);
		return () => clearTimeout(done);
	}, [visible, hint]);
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
	// A larger manual size gets fewer columns instead of being squeezed back down.
	const available = width - (width < 640 ? 40 : 96);
	let columns = layout.columns;
	while (
		columns > 1 &&
		(available - GAP_EMS * size * (columns - 1)) / columns < COLUMN_EMS * size
	)
		columns--;
	return (
		<div
			className={cn(
				// Phones keep a strip for the controls, so they never sit over a lyric.
				"fixed inset-0 z-40 flex flex-col bg-background max-sm:pb-[calc(4.5rem+env(safe-area-inset-bottom))]",
				!visible && "cursor-none",
			)}
			onPointerMove={(event) => event.pointerType === "mouse" && wake()}
		>
			{/* Always findable: a faint exit in the corner, full strength on hover. */}
			<Button
				variant="ghost"
				size="icon-sm"
				className={cn(
					"fixed top-3 right-3 z-10 rounded-full text-muted-foreground opacity-70 transition-opacity hover:opacity-100 focus-visible:opacity-100",
					// Only while the controls are hidden; otherwise their Exit is the one way out.
					visible && "pointer-events-none !opacity-0",
				)}
				aria-label="Exit stage mode (Esc)"
				title="Exit stage mode (Esc)"
				onClick={onExit}
			>
				<X />
			</Button>
			<section
				ref={scroller}
				className="flex min-h-0 flex-1 flex-col overflow-auto px-5 focus-visible:outline-none max-sm:[mask-image:linear-gradient(to_bottom,black_calc(100%-1.5rem),transparent)] sm:px-12"
				// biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users need to focus and scroll the chord sheet.
				tabIndex={0}
				aria-label="Chord sheet"
				// A tap always brings the controls back; they hide again on their own.
				onClick={wake}
				onKeyDown={() => {}}
			>
				{/* A song shorter than the screen sits in the middle, its title with it. */}
				<div className="my-auto">
					<header
						ref={header}
						className="flex flex-wrap items-baseline gap-x-3 pt-4 pb-3 text-muted-foreground"
					>
						{/* The title matches the lyric size, so it leads the stage. */}
						<h1
							className="font-semibold text-foreground"
							style={{ fontSize: Math.max(18, size) }}
						>
							{title}
						</h1>
						<span style={{ fontSize: Math.max(13, size * 0.6) }}>{meta}</span>
						{notes ? (
							<p className="basis-full text-sm text-foreground/80">{notes}</p>
						) : null}
					</header>
					<SongSheet
						content={content}
						semitones={semitones}
						accidental={accidental}
						fontSize={size}
						columns={columns}
						height={layout.room * 0.96 || undefined}
						chords={chords}
					/>
				</div>
				<div className="h-20" />
			</section>
			{hint === "shown" && !visible ? (
				<p
					aria-live="polite"
					className="pointer-events-none fixed inset-x-0 bottom-[max(1.5rem,env(safe-area-inset-bottom))] text-center text-sm text-muted-foreground animate-in fade-in-0"
				>
					{width < 640
						? "Tap the sheet to show controls"
						: "Move the mouse to show controls · Esc to exit"}
				</p>
			) : null}
			{/* Off screen at a fixed size: used to find the layout that fits. */}
			<div
				ref={measurer}
				aria-hidden
				className="stage-probe pointer-events-none invisible fixed top-0 -left-[10000px]"
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
