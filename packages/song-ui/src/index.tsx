// biome-ignore-all lint/suspicious/noArrayIndexKey: Sheet tokens and SVG strings are stateless ordered positions.
import {
	type Accidental,
	balanceColumns,
	type SheetLine,
	sheetChords,
	sheetLines,
} from "@chords/song-core";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

// Measuring runs in the browser only; the server renders the first guess.
const useBrowserLayoutEffect =
	typeof window === "undefined" ? useEffect : useLayoutEffect;

export function SongSheet({
	content,
	semitones = 0,
	fontSize = 20,
	columns = 1,
	chords = true,
	accidental,
	onChord,
}: {
	content: string;
	semitones?: number;
	fontSize?: number;
	/** Up to this many columns; fewer when the sheet is too narrow for them. */
	columns?: number;
	chords?: boolean;
	accidental?: Accidental;
	/** Makes each chord a button, e.g. to show its diagram. */
	onChord?: (chord: string) => void;
}) {
	const lines = useMemo(
		() => sheetLines(content, semitones, accidental),
		[content, semitones, accidental],
	);
	const renderLine = (line: (typeof lines)[number], index: number) =>
		line.type === "blank" ? (
			<div key={`blank-${index}`} className="sheet-space" />
		) : line.type !== "lyrics" ? (
			<p
				key={`label-${index}`}
				className={line.type === "section" ? "sheet-section" : "sheet-note"}
			>
				{line.label}
			</p>
		) : !chords ? (
			// Lyrics-only view drops chord-only rows such as intros and riffs.
			line.tokens.some((token) => token.text.trim()) ? (
				<p key={`line-${index}`} className="sheet-text">
					{line.tokens.map((token) => token.text).join("")}
				</p>
			) : null
		) : (
			<div key={`line-${index}`} className="sheet-line">
				{sheetWords(line.tokens).map((word, w) => (
					<span key={`${index}-${w}`} className="sheet-word">
						{word.map((pair, i) => (
							<span
								key={i}
								className={
									pair.joined ? "sheet-pair sheet-pair-joined" : "sheet-pair"
								}
							>
								{pair.chord && onChord ? (
									<button
										type="button"
										className="sheet-chord"
										aria-label={`${pair.chord} chord diagram`}
										onClick={() => onChord(pair.chord as string)}
									>
										{pair.chord}
									</button>
								) : (
									<span
										className={
											pair.chord
												? "sheet-chord"
												: "sheet-chord sheet-chord-empty"
										}
									>
										{pair.chord || "\u200b"}
									</span>
								)}
								<span className="sheet-lyric">{pair.text || "\u00a0"}</span>
							</span>
						))}
					</span>
				))}
			</div>
		);
	// Each section is one block so multi-column layouts never split it from its heading.
	const blocks: { line: (typeof lines)[number]; index: number }[][] = [];
	lines.forEach((line, index) => {
		if (line.type === "section" || !blocks.length) blocks.push([]);
		const block = blocks[blocks.length - 1];
		// Blank lines at the top of a section only push it down; headings carry the spacing.
		if (line.type === "blank" && !block.length) return;
		block.push({ line, index });
	});
	for (let i = blocks.length - 1; i >= 0; i--)
		if (!blocks[i].length) blocks.splice(i, 1);
	const root = useRef<HTMLDivElement>(null);
	// Columns need at least 18em each; a narrower sheet uses fewer.
	const [fit, setFit] = useState(columns);
	const [starts, setStarts] = useState<number[]>(() =>
		balanceColumns(blocks.map(estimateHeight), columns),
	);
	const shown = Math.min(fit, columns, blocks.length || 1);
	useBrowserLayoutEffect(() => {
		const element = root.current;
		if (!element || columns <= 1) return;
		const measure = () => {
			const width = element.clientWidth;
			const em = Number.parseFloat(getComputedStyle(element).fontSize) || 16;
			const count = Math.max(
				1,
				Math.min(columns, Math.floor((width + 2.5 * em) / (20.5 * em))),
			);
			setFit(count);
			// Every column has the same width, so a block's height does not depend on its column.
			const heights = [
				...element.querySelectorAll<HTMLElement>(":scope .sheet-block"),
			].map((block) => block.offsetHeight);
			const next = balanceColumns(heights, count);
			setStarts((previous) =>
				previous.join() === next.join() ? previous : next,
			);
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(element);
		return () => observer.disconnect();
	}, [columns, lines, fontSize, chords, shown]);
	const renderBlock = (block: (typeof blocks)[number]) => (
		<div key={`block-${block[0].index}`} className="sheet-block">
			{block.map(({ line, index }) => renderLine(line, index))}
		</div>
	);
	if (shown <= 1)
		return (
			<div ref={root} className="song-sheet" style={{ fontSize }}>
				{blocks.map(renderBlock)}
			</div>
		);
	const groups = (
		starts.length === shown
			? starts
			: balanceColumns(blocks.map(estimateHeight), shown)
	).map((start, i, all) => blocks.slice(start, all[i + 1] ?? blocks.length));
	return (
		<div
			ref={root}
			className="song-sheet sheet-columns"
			style={{
				fontSize,
				gridTemplateColumns: `repeat(${shown}, minmax(0, 1fr))`,
			}}
		>
			{groups.map((group, i) => (
				<div
					key={`column-${group[0]?.[0].index ?? i}`}
					className="sheet-column"
				>
					{group.map(renderBlock)}
				</div>
			))}
		</div>
	);
}

/** A first guess at a section's height, in lines, before the browser can measure it. */
function estimateHeight(block: { line: SheetLine }[]) {
	return block.reduce(
		(sum, { line }) =>
			sum +
			(line.type === "blank"
				? 0.3
				: line.type === "lyrics"
					? line.tokens.some((token) => token.chord)
						? 2.2
						: 1.3
					: 1.4),
		0,
	);
}

type SheetPair = { chord?: string; text: string; joined?: boolean };

/**
 * Splits chord/lyric tokens into unbreakable words so a line wraps between words, never
 * between a chord and the syllable it sits on. Pairs that continue a word are marked
 * `joined` so the renderer can bridge the gap a wide chord leaves inside that word.
 */
function sheetWords(tokens: { chord?: string | null; text: string }[]) {
	const words: SheetPair[][] = [];
	let word: SheetPair[] = [];
	for (const token of tokens) {
		const parts = token.text.match(/\S*\s*/g)?.filter(Boolean) ?? [];
		(parts.length ? parts : [""]).forEach((text, i) => {
			const previous = word[word.length - 1]?.text;
			if (
				word.length &&
				(i > 0 || !text || !previous || /\s$/.test(previous))
			) {
				words.push(word);
				word = [];
			}
			word.push({
				chord: i === 0 ? token.chord || undefined : undefined,
				text,
			});
		});
	}
	if (word.length) words.push(word);
	for (const pairs of words)
		pairs.forEach((pair, i) => {
			pair.joined = i < pairs.length - 1 && /\S$/.test(pair.text);
		});
	return words;
}

type Fingering = {
	frets: number[];
	fingers: number[];
	baseFret: number;
	barres: number[];
};
type GuitarData = {
	chords: Record<
		string,
		{ key: string; suffix: string; positions: Fingering[] }[]
	>;
};
export function ChordDiagrams({
	content,
	semitones = 0,
	accidental,
}: {
	content: string;
	semitones?: number;
	accidental?: Accidental;
}) {
	const database = useGuitarDatabase();
	const chords = useMemo(
		() => sheetChords(content, semitones, accidental),
		[content, semitones, accidental],
	);
	if (!database) return <p className="muted">Loading guitar shapes…</p>;
	return (
		<div className="chord-diagrams">
			{chords.map((chord) => (
				<GuitarDiagram key={chord} chord={chord} database={database} />
			))}
		</div>
	);
}
let guitarDatabase: Promise<GuitarData> | undefined;
function useGuitarDatabase() {
	const [database, setDatabase] = useState<GuitarData | null>(null);
	useEffect(() => {
		guitarDatabase ??= import("@tombatossals/chords-db/lib/guitar.json").then(
			(module) => module.default as GuitarData,
		);
		let active = true;
		void guitarDatabase.then((value) => active && setDatabase(value));
		return () => {
			active = false;
		};
	}, []);
	return database;
}

/** One chord's guitar diagram on its own, e.g. enlarged in a sheet. */
export function ChordDiagram({ chord }: { chord: string }) {
	const database = useGuitarDatabase();
	if (!database) return <p className="muted">Loading guitar shapes…</p>;
	return <GuitarDiagram key={chord} chord={chord} database={database} />;
}

/**
 * A barre shape with no open strings reads as a nut chord when drawn from fret 1.
 * Start the grid at its lowest fret instead, so it gets a "2fr" position label.
 */
function fromLowestFret(shape: Fingering | undefined): Fingering | undefined {
	if (!shape || shape.baseFret !== 1 || shape.frets.includes(0)) return shape;
	const lowest = Math.min(...shape.frets.filter((fret) => fret > 0));
	if (!Number.isFinite(lowest) || lowest <= 1 || !shape.barres.length)
		return shape;
	const shift = lowest - 1;
	return {
		...shape,
		baseFret: lowest,
		frets: shape.frets.map((fret) => (fret > 0 ? fret - shift : fret)),
		barres: shape.barres.map((fret) => fret - shift),
	};
}

// Strings sit 14 apart; a radius of 6 keeps dots on neighbouring strings from touching.
const DOT = 6;

function GuitarDiagram({
	chord,
	database,
}: {
	chord: string;
	database: GuitarData;
}) {
	const [position, setPosition] = useState(0);
	const match = chord.match(/^([A-G][#b]?)(.*)$/);
	const aliases: Record<string, string> = {
		Db: "C#",
		"D#": "Eb",
		Gb: "F#",
		"G#": "Ab",
		"A#": "Bb",
		Cb: "B",
		Fb: "E",
	};
	const key = (match ? aliases[match[1]] || match[1] : "").replace(
		"#",
		"sharp",
	);
	const suffix =
		match?.[2] === "" ? "major" : match?.[2] === "m" ? "minor" : match?.[2];
	const shapes =
		database.chords[key]?.find((value) => value.suffix === suffix)?.positions ||
		[];
	const shape = fromLowestFret(shapes[position % Math.max(1, shapes.length)]);
	if (!shape)
		return (
			<div className="diagram-missing">
				<strong>{chord}</strong>
				<small>No shape available</small>
			</div>
		);
	return (
		<button
			type="button"
			className="diagram"
			onClick={() => setPosition((value) => value + 1)}
			title={`${chord}: tap for another shape`}
		>
			<strong>{chord}</strong>
			<svg
				viewBox="-14 0 114 112"
				role="img"
				aria-label={`${chord} guitar fingering, fret ${shape.baseFret}`}
			>
				{Array.from({ length: 6 }, (_, i) => (
					<line
						key={`string-${i}`}
						x1={15 + i * 14}
						x2={15 + i * 14}
						y1="23"
						y2="99"
						stroke="currentColor"
						strokeWidth="1"
					/>
				))}
				{Array.from({ length: 5 }, (_, i) => (
					<line
						key={`fret-${i}`}
						x1="15"
						x2="85"
						y1={23 + i * 19}
						y2={23 + i * 19}
						stroke="currentColor"
						strokeWidth={i === 0 && shape.baseFret === 1 ? 3 : 1}
					/>
				))}
				{shape.baseFret > 1 ? (
					<text x="3" y="37" fontSize="10" fontWeight="600" textAnchor="end">
						{shape.baseFret}fr
					</text>
				) : null}
				{shape.barres.map((fret) => {
					const strings = shape.frets.flatMap((value, i) =>
						value === fret ? [i] : [],
					);
					const from = 15 + Math.min(...strings) * 14;
					const to = 15 + Math.max(...strings) * 14;
					const finger = shape.fingers[strings[0]];
					// One bar with one finger number reads better than a row of identical dots.
					return (
						<g key={`barre-${fret}`}>
							<rect
								x={from - DOT}
								y={13.5 + fret * 19 - DOT}
								width={to - from + DOT * 2}
								height={DOT * 2}
								rx={DOT}
								className="diagram-barre"
							/>
							<text
								x={(from + to) / 2}
								y={16.5 + fret * 19}
								textAnchor="middle"
								fontSize="8.5"
								fontWeight="600"
								fill="white"
							>
								{finger || ""}
							</text>
						</g>
					);
				})}
				{shape.frets.map((fret, i) =>
					fret > 0 &&
					shape.barres.includes(fret) &&
					shape.fingers[i] ===
						shape.fingers[shape.frets.indexOf(fret)] ? null : fret > 0 ? (
						<g key={`dot-${i}`}>
							<circle
								className="diagram-dot"
								cx={15 + i * 14}
								cy={13.5 + fret * 19}
								r={DOT}
							/>
							<text
								x={15 + i * 14}
								y={16.5 + fret * 19}
								textAnchor="middle"
								fontSize="8.5"
								fontWeight="600"
								fill="white"
							>
								{shape.fingers[i] || ""}
							</text>
						</g>
					) : fret === 0 ? (
						<circle
							key={`open-${i}`}
							cx={15 + i * 14}
							cy="12"
							r="3.5"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.2"
						/>
					) : (
						<path
							key={`mute-${i}`}
							d={`M${11.5 + i * 14} 8.5l7 7m0 -7l-7 7`}
							stroke="currentColor"
							strokeWidth="1.2"
						/>
					),
				)}
			</svg>
			{shapes.length > 1 && position % shapes.length ? (
				<small>
					Shape {(position % shapes.length) + 1} of {shapes.length}
				</small>
			) : null}
		</button>
	);
}
