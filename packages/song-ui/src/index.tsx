// biome-ignore-all lint/suspicious/noArrayIndexKey: Sheet tokens and SVG strings are stateless ordered positions.
import { sheetChords, sheetLines } from "@chords/song-core";
import { useEffect, useMemo, useState } from "react";

export function SongSheet({
	content,
	semitones = 0,
	fontSize = 20,
	columns = 1,
}: {
	content: string;
	semitones?: number;
	fontSize?: number;
	columns?: number;
}) {
	const lines = useMemo(
		() => sheetLines(content, semitones),
		[content, semitones],
	);
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
			{lines.map((line, index) =>
				line.type === "blank" ? (
					<div key={`blank-${index}`} className="sheet-space" />
				) : line.type !== "lyrics" ? (
					<p
						key={`label-${index}`}
						className={line.type === "section" ? "sheet-section" : "sheet-note"}
					>
						{line.label}
					</p>
				) : (
					<div key={`line-${index}`} className="sheet-line">
						{line.tokens.map((token, i) => (
							<span key={`${index}-${i}`} className="sheet-pair">
								<span
									className={
										token.chord
											? "sheet-chord"
											: "sheet-chord sheet-chord-empty"
									}
								>
									{token.chord || "\u00a0"}
								</span>
								<span className="sheet-lyric">{token.text || "\u00a0"}</span>
							</span>
						))}
					</div>
				),
			)}
		</div>
	);
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
}: {
	content: string;
	semitones?: number;
}) {
	const [database, setDatabase] = useState<GuitarData | null>(null);
	const chords = useMemo(
		() => sheetChords(content, semitones),
		[content, semitones],
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
	const key = match ? aliases[match[1]] || match[1] : "";
	const suffix =
		match?.[2] === "" ? "major" : match?.[2] === "m" ? "minor" : match?.[2];
	const shapes =
		database.chords[key]?.find((value) => value.suffix === suffix)?.positions ||
		[];
	const shape = shapes[position % Math.max(1, shapes.length)];
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
			title={`${chord}: change fingering`}
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
						x1={20 + i * 12}
						x2={20 + i * 12}
						y1="23"
						y2="99"
						stroke="currentColor"
						strokeWidth="1"
					/>
				))}
				{Array.from({ length: 5 }, (_, i) => (
					<line
						key={`fret-${i}`}
						x1="20"
						x2="80"
						y1={23 + i * 19}
						y2={23 + i * 19}
						stroke="currentColor"
						strokeWidth={i === 0 && shape.baseFret === 1 ? 3 : 1}
					/>
				))}
				{shape.baseFret > 1 ? (
					<text x="3" y="38" fontSize="10">
						{shape.baseFret}
					</text>
				) : null}
				{shape.barres.map((fret) => {
					const strings = shape.frets.flatMap((value, i) =>
						value === fret ? [i] : [],
					);
					return (
						<line
							key={`barre-${fret}`}
							x1={20 + Math.min(...strings) * 12}
							x2={20 + Math.max(...strings) * 12}
							y1={13.5 + fret * 19}
							y2={13.5 + fret * 19}
							stroke="currentColor"
							strokeWidth="9"
							strokeLinecap="round"
						/>
					);
				})}
				{shape.frets.map((fret, i) =>
					fret > 0 ? (
						<g key={`dot-${i}`}>
							<circle
								cx={20 + i * 12}
								cy={13.5 + fret * 19}
								r="5.5"
								fill="currentColor"
							/>
							<text
								x={20 + i * 12}
								y={16.5 + fret * 19}
								textAnchor="middle"
								fontSize="8"
								fill="white"
							>
								{shape.fingers[i] || ""}
							</text>
						</g>
					) : (
						<text
							key={`open-${i}`}
							x={20 + i * 12}
							y="16"
							textAnchor="middle"
							fontSize="12"
						>
							{fret === 0 ? "○" : "×"}
						</text>
					),
				)}
			</svg>
			<small>
				{(position % shapes.length) + 1}/{shapes.length}
			</small>
		</button>
	);
}
