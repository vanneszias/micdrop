import {
	Chord,
	ChordLyricsPair,
	ChordProFormatter,
	ChordProParser,
	ChordsOverWordsParser,
	Tag,
	UltimateGuitarParser,
} from "chordsheetjs";

export const KEYS = [
	"C",
	"Db",
	"D",
	"Eb",
	"E",
	"F",
	"F#",
	"G",
	"Ab",
	"A",
	"Bb",
	"B",
] as const;
export const CAPO_FRETS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
export type SheetToken = { chord: string; text: string };
export type SheetLine = {
	type: "lyrics" | "section" | "comment" | "blank";
	label?: string;
	tokens: SheetToken[];
};

const SECTION_LINE =
	/^\[?((?:verse|chorus|bridge|intro|outro|pre[- ]?chorus|instrumental|interlude|solo)\s*\d*)\]?$/i;

/** ChordPro is the storage format. All input paths go through this conversion. */
export function normalizeSheet(raw: string): {
	content: string;
	warnings: string[];
} {
	const text = raw
		.replace(/\r\n?/g, "\n")
		.replace(/\t/g, "    ")
		.replace(/^(?: *\n)+/, "")
		.trimEnd();
	if (!text.trim()) return { content: "", warnings: [] };
	const warnings: string[] = [];
	const lines = text.split("\n");
	// Bracketed section names such as [Chorus] are not inline chords.
	const body = lines
		.filter((line) => !SECTION_LINE.test(line.trim()))
		.join("\n");
	const hasChordPro =
		/\{(?:title|t|key|start_of_\w+|comment):?/i.test(body) ||
		/\[[A-G][#b]?[^\]]*\]/.test(body);
	if (hasChordPro) {
		try {
			new ChordProParser().parse(text);
		} catch {
			warnings.push(
				"Some markup could not be parsed. Your original text has been kept.",
			);
		}
		return { content: text, warnings };
	}
	const prepared = lines
		.map((line) => {
			const section = line.trim().match(SECTION_LINE);
			return section
				? `{comment: ${section[1]}}`
				: /^\([^)]*\)/.test(line.trim())
					? `{comment: ${line.trim()}}`
					: line;
		})
		.join("\n");
	try {
		const isUltimateGuitar = lines.some(
			(line) => line.trim().startsWith("[") && SECTION_LINE.test(line.trim()),
		);
		const song = isUltimateGuitar
			? new UltimateGuitarParser().parse(text)
			: new ChordsOverWordsParser().parse(prepared);
		return { content: new ChordProFormatter().format(song), warnings };
	} catch {
		return {
			content: prepared,
			warnings: [
				"Conversion was incomplete. Check chord positions in the preview.",
			],
		};
	}
}

const METADATA_DIRECTIVE = /^\s*\{(?:title|t|artist|a|key|capo):[^}]*\}\s*$/i;

/** Removes title/artist/key/capo directives; the song record owns those fields. */
export function stripMetadata(content: string): string {
	return content
		.split("\n")
		.filter((line) => !METADATA_DIRECTIVE.test(line))
		.join("\n")
		.replace(/^\n+/, "");
}

/** Title, artist, key and capo declared in ChordPro directives, when present and valid. */
export function sheetMetadata(content: string): {
	title?: string;
	artist?: string;
	key?: string;
	sourceCapo?: number;
} {
	try {
		const song = new ChordProParser().parse(content);
		const artist = song.artist;
		const capo = Number(song.capo);
		const found = {
			title: song.title?.trim() || undefined,
			artist:
				(Array.isArray(artist) ? artist.join(", ") : artist)?.trim() ||
				undefined,
			key: KEYS.find((key) => key === song.key),
			sourceCapo: CAPO_FRETS.find((fret) => fret === capo),
		};
		// Omit absent values so callers can spread this over defaults.
		return Object.fromEntries(
			Object.entries(found).filter(([, value]) => value !== undefined),
		);
	} catch {
		return {};
	}
}

export function keyDistance(from: string, to: string): number {
	const source = Chord.parse(from);
	const target = Chord.parse(to);
	if (!source || !target) return 0;
	for (let i = 0; i < 12; i++) {
		const candidate = source
			.transpose(i)
			.normalize()
			.useAccidental("#")
			.toString();
		if (candidate === target.normalize().useAccidental("#").toString())
			return i;
	}
	return 0;
}

export function isChord(value: string): boolean {
	return !!Chord.parse(value);
}

export type Accidental = "#" | "b";

/** Flat keys spell their chords with flats (Ab, Db, Eb), the rest with sharps. */
export function keyAccidental(key: string): Accidental {
	// By pitch class: spelling the root with flats first would turn E into Fb (and B into
	// Cb), which then read as flat keys.
	const root = key.match(/^[A-G][#b]?/)?.[0];
	if (!root || !Chord.parse(root)) return "#";
	return FLAT_KEYS.has(keyDistance("C", root)) ? "b" : "#";
}

/** F, Bb, Eb, Ab and Db, as semitones above C. */
const FLAT_KEYS = new Set([5, 10, 3, 8, 1]);

/** The key the displayed chords are in, `semitones` away from `key`. */
export function shiftKey(key: string, semitones: number): string {
	return KEYS[(((keyDistance("C", key) + semitones) % 12) + 12) % 12];
}

export function transposeChord(
	value: string,
	semitones: number,
	accidental?: Accidental,
): string {
	const chord = Chord.parse(value);
	if (!chord) return value;
	const moved = chord.transpose(semitones).normalize();
	// useAccidental alone turns C into B#, so normalize again afterwards.
	return (
		accidental && semitones
			? moved.useAccidental(accidental).normalize()
			: moved
	).toString();
}

export function displayTranspose(
	writtenKey: string,
	soundingKey: string,
	capo: number,
): number {
	return keyDistance(writtenKey, soundingKey) - capo;
}

export function exportChordPro(
	content: string,
	metadata: { title: string; artist: string; key: string; sourceCapo: number },
): string {
	const song = new ChordProParser().parse(content);
	for (const line of song.lines)
		line.items = line.items.filter(
			(item) =>
				!(
					item instanceof Tag &&
					["title", "artist", "key", "capo"].includes(item.name)
				),
		);
	const safe = (value: string) => value.replace(/[{}\r\n]/g, " ");
	return `{title: ${safe(metadata.title)}}\n{artist: ${safe(metadata.artist)}}\n{key: ${safe(metadata.key)}}\n{capo: ${metadata.sourceCapo}}\n\n${new ChordProFormatter().format(song).trim()}`;
}

/** Rewrites every chord in a ChordPro sheet by a number of semitones. */
export function transposeChordPro(content: string, semitones: number): string {
	if (!semitones) return content;
	return new ChordProFormatter().format(
		new ChordProParser().parse(content).transpose(semitones),
	);
}

/** Project ChordSheetJS's AST into renderer rows. Incomplete edits stay visible as text. */
export function sheetLines(
	content: string,
	semitones = 0,
	accidental?: Accidental,
): SheetLine[] {
	try {
		return new ChordProParser()
			.parse(content)
			.lines.flatMap((line): SheetLine[] => {
				if (!line.items.length) return [{ type: "blank", tokens: [] }];
				const rows: SheetLine[] = [];
				let tokens: SheetToken[] = [];
				const flush = () => {
					if (tokens.length) rows.push({ type: "lyrics", tokens });
					tokens = [];
				};
				for (const item of line.items) {
					if (item instanceof ChordLyricsPair)
						tokens.push({
							chord:
								item.annotation ||
								transposeChord(item.chords, semitones, accidental),
							text: item.lyrics || "",
						});
					else if (item instanceof Tag) {
						if (item.isMetaTag() || item.isSectionEnd()) continue;
						flush();
						const label =
							item.label || item.value || item.name.replace("start_of_", "");
						rows.push({
							type:
								item.isSectionStart() ||
								/^(verse|chorus|bridge|intro|outro|pre[- ]?chorus|interlude)\s*\d*$/i.test(
									label,
								)
									? "section"
									: "comment",
							label:
								item.isComment() || item.isSectionStart()
									? label
									: item.toString(),
							tokens: [],
						});
					} else {
						flush();
						rows.push({ type: "comment", label: item.toString(), tokens: [] });
					}
				}
				flush();
				return rows;
			});
	} catch {
		return content.split("\n").map((text) => ({
			type: text ? "lyrics" : "blank",
			tokens: text ? [{ chord: "", text }] : [],
		}));
	}
}

export function sheetChords(
	content: string,
	semitones = 0,
	accidental?: Accidental,
): string[] {
	return [
		...new Set(
			sheetLines(content, semitones, accidental)
				.flatMap((line) => line.tokens.map((token) => token.chord))
				.filter((chord) => chord && Chord.parse(chord)),
		),
	];
}

export function sheetDiagnostics(content: string): string[] {
	const unknown = [...content.matchAll(/\[([^\]]+)\]/g)]
		.map((match) => match[1])
		.filter(
			(value) =>
				!value.startsWith("*") &&
				!Chord.parse(value) &&
				!/^(?:N\.?C\.?|[|/:x-]+|\(\d+x\))$/.test(value),
		);
	return [...new Set(unknown)].map(
		(value) => `“${value}” is displayed as written and will not be transposed.`,
	);
}

export const EXAMPLE = `{title: Evening rehearsal}
{artist: Original practice sheet}
{key: D}

{start_of_verse: Verse 1}
[D]Find a little [G]space to [D]play
[Bm]Let the [G]noise fall a[A]way
{end_of_verse}

{start_of_chorus: Chorus}
[G]One more [D]song before we [A]go
[G]Take it [Bm]easy, take it [A]slow
{end_of_chorus}

{comment: Repeat chorus, then end on D}`;

/**
 * Splits consecutive pieces of a sheet into at most `columns` groups so a multi-column
 * sheet ends evenly. Order is kept and pieces never split. `breakCost[i]` is added when
 * a group starts at piece `i`, so starting a column mid-section can be discouraged.
 * The tallest group plus break costs is minimised; among equal choices the groups are
 * as even as possible, then earlier groups are fuller. Returns each group's start.
 */
export function balanceColumns(
	heights: number[],
	columns: number,
	breakCost: number[] = [],
): number[] {
	const count = Math.min(Math.max(1, Math.floor(columns)), heights.length);
	if (count <= 1) return [0];
	const prefix = [0];
	for (const height of heights)
		prefix.push(prefix[prefix.length - 1] + Math.max(0, height));
	const n = heights.length;
	let best: { starts: number[]; cost: number; spread: number } | undefined;
	const same = (a: number, b: number) => Math.abs(a - b) <= 1e-9;
	// Sheets have a few dozen pieces and at most three columns, so try every split.
	const visit = (starts: number[]) => {
		if (starts.length === count) {
			const sizes = starts.map(
				(start, i) => prefix[starts[i + 1] ?? n] - prefix[start],
			);
			const cost =
				Math.max(...sizes) +
				starts
					.slice(1)
					.reduce((sum, start) => sum + (breakCost[start] ?? 0), 0);
			const spread = sizes.reduce((sum, size) => sum + size * size, 0);
			const later = () => {
				const i = starts.findIndex((start, k) => start !== best?.starts[k]);
				return i >= 0 && starts[i] > (best?.starts[i] ?? 0);
			};
			if (
				!best ||
				cost < best.cost - 1e-9 ||
				(same(cost, best.cost) &&
					(spread < best.spread - 1e-9 ||
						(same(spread, best.spread) && later())))
			)
				best = { starts: [...starts], cost, spread };
			return;
		}
		const from = starts[starts.length - 1] + 1;
		for (let start = from; start <= n - (count - starts.length); start++)
			visit([...starts, start]);
	};
	visit([0]);
	return best?.starts ?? [0];
}

/** How much taller a column may get to avoid starting it in the middle of a section. */
export const MID_SECTION_COST = 0.08;

/**
 * Balances sheet pieces (a section's heading with its first line, then one line each)
 * into columns. Columns prefer to start on a section, but split one when that evens
 * them out by more than {@link MID_SECTION_COST} of the sheet's height. A split never
 * leaves a single line of a section on either side unless nothing else fits.
 */
export function balanceSheet(
	pieces: { height: number; start: boolean }[],
	columns: number,
): number[] {
	const total = pieces.reduce((sum, piece) => sum + piece.height, 0);
	const section: number[] = [];
	for (const piece of pieces)
		section.push((section[section.length - 1] ?? -1) + (piece.start ? 1 : 0));
	const size = (id: number) => section.filter((value) => value === id).length;
	const before = (i: number) =>
		section.slice(0, i).filter((value) => value === section[i]).length;
	return balanceColumns(
		pieces.map((piece) => piece.height),
		columns,
		pieces.map((piece, i) =>
			piece.start
				? 0
				: before(i) < 2 || size(section[i]) - before(i) < 2
					? total
					: total * MID_SECTION_COST,
		),
	);
}

/**
 * Lays sheet pieces out in columns. Sections stay whole, because a performer reads a
 * section best in one place; only a section taller than `height` on its own is split.
 */
export function sheetColumns(
	pieces: { height: number; start: boolean }[],
	columns: number,
	height?: number,
): { starts: number[]; tallest: number } {
	const heights = pieces.map((piece) => piece.height);
	const total = heights.reduce((sum, value) => sum + value, 0);
	const tallest = (starts: number[]) =>
		Math.max(
			0,
			...starts.map((start, i) =>
				heights
					.slice(start, starts[i + 1] ?? heights.length)
					.reduce((sum, value) => sum + value, 0),
			),
		);
	const whole = balanceColumns(
		heights,
		Math.min(columns, pieces.filter((piece) => piece.start).length || 1),
		pieces.map((piece) => (piece.start ? 0 : total * 10)),
	);
	// Split only when a single section is taller than the space: a verse read across two
	// columns costs more than columns of uneven length.
	const sections: number[] = [];
	for (const piece of pieces)
		if (piece.start || !sections.length) sections.push(piece.height);
		else sections[sections.length - 1] += piece.height;
	if (height === undefined || Math.max(...sections) <= height)
		return { starts: whole, tallest: tallest(whole) };
	const split = balanceSheet(pieces, columns);
	return { starts: split, tallest: tallest(split) };
}

export type Mode = "major" | "minor";

/**
 * Keys are stored as roots. A song whose first chord is the minor chord on that root
 * (Am in A) is in the minor key, so it is labelled and spelled as one.
 */
export function songMode(content: string, key: string): Mode {
	const first = sheetChords(content)[0];
	const chord = first ? Chord.parse(first) : null;
	const root = first?.match(/^[A-G][#b]?/)?.[0];
	return chord?.isMinor() &&
		root &&
		keyDistance(key, root) === 0 &&
		Chord.parse(key)
		? "minor"
		: "major";
}

/** "A" or "Am": the key as players name it. */
export function keyLabel(key: string, mode: Mode = "major"): string {
	return mode === "minor" ? `${key}m` : key;
}

/** Minor keys spell like their relative major: C minor uses Eb, not D#. */
export function modeAccidental(key: string, mode: Mode = "major"): Accidental {
	return keyAccidental(mode === "minor" ? shiftKey(key, 3) : key);
}
