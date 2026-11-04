// biome-ignore-all lint/suspicious/noArrayIndexKey: Sheet tokens and SVG strings are stateless ordered positions.
import { type Accidental, sheetChords, sheetLines } from "@chords/song-core";
import { useEffect, useMemo, useState } from "react";

export function SongSheet({
	content,
	semitones = 0,
	fontSize = 20,
	columns = 1,
	chords = true,
	accidental,
}: {
	content: string;
	semitones?: number;
	fontSize?: number;
	columns?: number;
	chords?: boolean;
	accidental?: Accidental;
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
								<span
									className={
										pair.chord ? "sheet-chord" : "sheet-chord sheet-chord-empty"
									}
								>
									{pair.chord || "\u200b"}
								</span>
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
		blocks[blocks.length - 1].push({ line, index });
	});
	return (
		<div
			className="song-sheet"
			style={{
				fontSize,
				columnCount: columns,
				columnWidth: columns > 1 ? "20em" : undefined,
				columnGap: "2em",
			}}
		>
			{blocks.map((block) => (
				<div key={`block-${block[0].index}`} className="sheet-block">
					{block.map(({ line, index }) => renderLine(line, index))}
				</div>
			))}
		</div>
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
	const [database, setDatabase] = useState<GuitarData | null>(null);
	const chords = useMemo(
		() => sheetChords(content, semitones, accidental),
		[content, semitones, accidental],
	);
	useEffect(() => {
		void import("@tombatossals/chords-db/lib/guitar.json").then((module) =>
			setDatabase(module.default),
		);
	}, []);
	if (!database) return <p className="muted">Loading guitar shapes…</p>;
	return (
		<div className="chord-diagrams">
			{chords.map((chord) => (
				<GuitarDiagram key={chord} chord={chord} database={database} />
			))}
		</div>
	);
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
				viewBox="0 0 100 112"
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
					<text x="0" y="36" fontSize="10" fontWeight="600">
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
							<line
								x1={from}
								x2={to}
								y1={13.5 + fret * 19}
								y2={13.5 + fret * 19}
								className="diagram-barre"
								strokeWidth="14"
								strokeLinecap="round"
							/>
							<text
								x={(from + to) / 2}
								y={16.5 + fret * 19}
								textAnchor="middle"
								fontSize="9.5"
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
								r="7"
							/>
							<text
								x={15 + i * 14}
								y={16.5 + fret * 19}
								textAnchor="middle"
								fontSize="9.5"
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
