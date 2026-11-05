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
	const root =
		Chord.parse(key)?.normalize().useAccidental("b").toString() ?? key;
	return ["F", "Bb", "Eb", "Ab", "Db"].some((flat) => root.startsWith(flat))
		? "b"
		: "#";
}

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
 * Splits consecutive sections into at most `columns` groups so a multi-column sheet ends
 * evenly and every column starts on a section heading. Sections never split and keep
 * their order. The tallest group is as short as possible; among equal choices the
 * groups are as even as possible, then earlier groups are fuller. Returns the start
 * index of each group.
 */
export function balanceColumns(heights: number[], columns: number): number[] {
	const count = Math.min(Math.max(1, Math.floor(columns)), heights.length);
	if (count <= 1) return [0];
	const prefix = [0];
	for (const height of heights)
		prefix.push(prefix[prefix.length - 1] + Math.max(0, height));
	const n = heights.length;
	let best: { starts: number[]; tallest: number; spread: number } | undefined;
	// Sheets have a few dozen sections and at most three columns, so try every split.
	const visit = (starts: number[]) => {
		if (starts.length === count) {
			const sizes = starts.map(
				(start, i) => prefix[starts[i + 1] ?? n] - prefix[start],
			);
			const tallest = Math.max(...sizes);
			const spread = sizes.reduce((sum, size) => sum + size * size, 0);
			const better =
				!best ||
				tallest < best.tallest - 1e-9 ||
				(Math.abs(tallest - best.tallest) <= 1e-9 &&
					(spread < best.spread - 1e-9 ||
						(Math.abs(spread - best.spread) <= 1e-9 &&
							starts.some(
								(start, i) =>
									start > (best?.starts[i] ?? 0) &&
									starts.slice(0, i).every((s, j) => s === best?.starts[j]),
							))));
			if (better) best = { starts: [...starts], tallest, spread };
			return;
		}
		const from = starts[starts.length - 1] + 1;
		for (let start = from; start <= n - (count - starts.length); start++)
			visit([...starts, start]);
	};
	visit([0]);
	return best?.starts ?? [0];
}
