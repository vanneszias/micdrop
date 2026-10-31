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

export function transposeChord(value: string, semitones: number): string {
	const chord = Chord.parse(value);
	return chord ? chord.transpose(semitones).normalize().toString() : value;
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
export function sheetLines(content: string, semitones = 0): SheetLine[] {
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
							chord: item.annotation || transposeChord(item.chords, semitones),
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

export function sheetChords(content: string, semitones = 0): string[] {
	return [
		...new Set(
			sheetLines(content, semitones)
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
