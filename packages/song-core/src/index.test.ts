import { describe, expect, test } from "bun:test";
import {
	balanceColumns,
	balanceSheet,
	displayTranspose,
	exportChordPro,
	keyAccidental,
	keyDistance,
	keyLabel,
	modeAccidental,
	normalizeSheet,
	rootInBass,
	sheetChords,
	sheetColumns,
	sheetLines,
	sheetMetadata,
	shiftKey,
	songMode,
	stripMetadata,
	transposeChord,
} from "./index";

describe("music transformations", () => {
	test("uses ChordPro aliases and current metadata in rendering and export", () => {
		const content = "{t: Old title}\n{soc}\n[C]One [G/B]two\n{eoc}";
		expect(
			sheetLines(content, 2).find((line) => line.type === "section")?.label,
		).toBe("chorus");
		expect(
			sheetLines(content, 2)
				.flatMap((line) => line.tokens)
				.filter((token) => token.chord)
				.map((token) => token.chord),
		).toEqual(["D", "A/C#"]);
		const exported = exportChordPro(content, {
			title: "Updated title",
			artist: "Artist",
			key: "C",
			sourceCapo: 0,
		});
		expect(exported).toContain("{title: Updated title}");
		expect(exported).not.toContain("Old title");
	});
	test("transposes both root and bass while preserving chord quality", () => {
		expect(transposeChord("C/E", 2)).toBe("D/F#");
		expect(transposeChord("Bm7", -2)).toBe("Am7");
		expect(transposeChord("N.C.", 2)).toBe("N.C.");
	});
	test("capo shapes retain the same sounding key", () => {
		expect(keyDistance("D", "E")).toBe(2);
		expect(transposeChord("D", keyDistance("D", "E") - 2)).toBe("D");
		expect(keyDistance("C#", "Db")).toBe(0);
		expect(transposeChord("D", displayTranspose("D", "D", 2))).toBe("C");
		expect(transposeChord("D", displayTranspose("D", "E", 2))).toBe("D");
	});
	test("converts copied spacing and keeps sections and instructions", () => {
		const { content } = normalizeSheet(
			"Verse1\r\nC       G\r\nOne and two\r\n\r\n(Repeat chorus)",
		);
		expect(content).toContain("[C]");
		expect(content).toContain("[G]");
		expect(content).toContain("Verse1");
		expect(content).toContain("Repeat chorus");
		expect(
			sheetLines(content)
				.flatMap((line) => line.tokens)
				.map((token) => token.text)
				.join(""),
		).toContain("One and two");
	});
	test("converts Ultimate Guitar sections, slash chords, alignment and repeats", () => {
		const { content, warnings } = normalizeSheet(`[Intro]
 
G  C  Em  D  x2
 
[Verse 1]
 
       G           D/F#             Em
Who am I? That the Lord of all the earth,
G/B       C              D         C/E                    D/F#
    Not because of who I am, but because of what You've done,
 
[Chorus]
 
G        D               Em            D               C
  I am a flower quickly fading, here today and gone tomorrow
 
[Instrumental]
 
G  C  Em  D  x2`);
		expect(warnings).toEqual([]);
		expect(content).toContain("Who am [G]I? That the [D/F#]Lord");
		expect(content).not.toContain("[x]");
		expect(content).not.toContain("[2]");
		expect(sheetChords(content)).toEqual([
			"G",
			"C",
			"Em",
			"D",
			"D/F#",
			"G/B",
			"C/E",
		]);
		const rows = sheetLines(content);
		expect(
			rows.filter((row) => row.type === "section").map((row) => row.label),
		).toEqual(["Intro", "Verse 1", "Chorus", "Instrumental"]);
		expect(rows.filter((row) => row.type === "comment")).toEqual([]);
		expect(
			rows.flatMap((row) => row.tokens).filter((token) => token.text === "x2"),
		).toHaveLength(2);
	});
	test("preserves inline ChordPro and the first chord line's indentation", () => {
		const inline = "{title: Song}\n{soc}\n[C]One [G/B]two\n{eoc}";
		expect(normalizeSheet(inline).content).toBe(inline);
		expect(
			normalizeSheet(
				"       G           D/F#             Em\nWho am I? That the Lord of all the earth,",
			).content,
		).toContain("Who am [G]I? That the [D/F#]Lord");
	});
});

test("sheetMetadata reads directives and omits missing values", () => {
	expect(
		sheetMetadata(
			"{title: Amazing Grace}\n{artist: John Newton}\n{key: G}\n{capo: 2}\n[G]A",
		),
	).toEqual({
		title: "Amazing Grace",
		artist: "John Newton",
		key: "G",
		sourceCapo: 2,
	});
	expect(sheetMetadata("{key: Am}\n[Am]Line")).not.toHaveProperty("key");
	expect(sheetMetadata("[C]No directives")).not.toHaveProperty("title");
});

test("transposed chords use the target key's accidentals", () => {
	const flat = keyAccidental(shiftKey("G", 1));
	expect(["G", "C", "D", "G7"].map((c) => transposeChord(c, 1, flat))).toEqual([
		"Ab",
		"Db",
		"Eb",
		"Ab7",
	]);
	expect(transposeChord("G", 2, keyAccidental(shiftKey("G", 2)))).toBe("A");
	expect(transposeChord("D", 4, keyAccidental(shiftKey("D", 4)))).toBe("F#");
	expect(keyAccidental("F")).toBe("b");
	// Capo 2 on a D song shows C shapes, never B# or E#.
	const shapes = keyAccidental(shiftKey("D", -2));
	expect(
		["D", "D7", "G", "A"].map((c) => transposeChord(c, -2, shapes)),
	).toEqual(["C", "C7", "F", "G"]);
});

test("stripMetadata keeps everything but record-owned directives", () => {
	expect(
		stripMetadata("{title: A}\n{artist: B}\n{key: G}\n{tempo: 72}\n\n[G]Line"),
	).toBe("{tempo: 72}\n\n[G]Line");
});

describe("balanced columns", () => {
	test("splits sections so the tallest column is as short as possible", () => {
		// Verse, chorus, verse, chorus, bridge: [6, 4, 6, 4, 2] splits 10 | 12 → 10 | 10 | 2 is worse.
		expect(balanceColumns([6, 4, 6, 4, 2], 2)).toEqual([0, 2]);
		expect(balanceColumns([6, 4, 6, 4, 2], 3)).toEqual([0, 2, 3]);
	});
	test("keeps one long section whole instead of splitting it", () => {
		expect(balanceColumns([2, 20, 2], 2)).toEqual([0, 2]);
	});
	test("never makes more columns than sections, and one column starts at zero", () => {
		expect(balanceColumns([5, 5], 3)).toEqual([0, 1]);
		expect(balanceColumns([5, 5, 5], 1)).toEqual([0]);
		expect(balanceColumns([], 2)).toEqual([0]);
	});
	test("prefers fuller early columns on a tie", () => {
		expect(balanceColumns([3, 3, 3, 3], 2)).toEqual([0, 2]);
		expect(balanceColumns([4, 2, 2], 2)).toEqual([0, 1]);
	});
});

describe("minor keys", () => {
	test("a song starting on the root's minor chord is in the minor key", () => {
		expect(songMode("[Am]There is a [C]house", "A")).toBe("minor");
		expect(songMode("[Am7]Soft [G]start", "A")).toBe("minor");
		expect(songMode("[G]Amazing [Em]grace", "G")).toBe("major");
		// A minor chord on another root is not the key's own minor.
		expect(songMode("[Em]Down [G]low", "G")).toBe("major");
		expect(songMode("no chords", "C")).toBe("major");
	});
	test("labels and spells minor keys like players do", () => {
		expect(keyLabel("A", "minor")).toBe("Am");
		expect(keyLabel("A")).toBe("A");
		// C minor shares Eb major's flats; D minor shares F major's flat.
		expect(modeAccidental("C", "minor")).toBe("b");
		expect(modeAccidental("D", "minor")).toBe("b");
		expect(modeAccidental("E", "minor")).toBe("#");
		expect(modeAccidental("C")).toBe("#");
		expect(
			transposeChord("Bm", 1, modeAccidental(shiftKey("B", 1), "minor")),
		).toBe("Cm");
		expect(
			transposeChord("F#", -1, modeAccidental(shiftKey("A", 2), "minor")),
		).toBe("F");
	});
});

describe("balanced sheets", () => {
	const piece = (height: number, start = false) => ({ height, start });
	// Three sections of four lines; the last section is taller.
	const song = [
		piece(2, true),
		piece(2),
		piece(2),
		piece(2),
		piece(2, true),
		piece(2),
		piece(2),
		piece(2),
		piece(2, true),
		piece(2),
		piece(2),
		piece(2),
		piece(2),
		piece(2),
	];
	test("starts columns on sections when that is even enough", () => {
		expect(balanceSheet(song, 3)).toEqual([0, 4, 8]);
	});
	test("splits a section when whole sections would leave a column far shorter", () => {
		// Whole sections give 8 | 16 at best; splitting the middle verse gives 12 | 12.
		expect(balanceSheet(song.slice(0, 12), 2)).toEqual([0, 6]);
		// Here whole sections already reach 16 | 12, close enough to keep.
		expect(balanceSheet(song, 2)).toEqual([0, 8]);
	});
	test("never strands a single line of a section", () => {
		// Two four-line verses in three columns: split the second verse 2 + 2, not 3 + 1.
		const short = [
			piece(2, true),
			piece(2),
			piece(2),
			piece(2),
			piece(2, true),
			piece(2),
			piece(2),
			piece(2),
		];
		expect(balanceSheet(short, 3)).toEqual([0, 4, 6]);
	});
	test("a large break cost keeps whole sections", () => {
		expect(balanceColumns([8, 4, 4, 12], 2, [0, 0, 100, 0])).toEqual([0, 3]);
	});
});

describe("sheet columns", () => {
	const piece = (height: number, start = false) => ({ height, start });
	const song = [
		piece(2, true),
		piece(2),
		piece(2),
		piece(2),
		piece(2, true),
		piece(2),
		piece(2),
		piece(2),
		piece(2, true),
		piece(2),
		piece(2),
		piece(2),
	];
	test("keeps whole sections when they fit", () => {
		expect(sheetColumns(song, 2)).toEqual({ starts: [0, 8], tallest: 16 });
		expect(sheetColumns(song, 2, 16).starts).toEqual([0, 8]);
	});
	test("keeps sections whole even when the sheet then scrolls", () => {
		// Whole sections need 16 of 14; every section (8) fits, so none is split.
		expect(sheetColumns(song, 2, 14).starts).toEqual([0, 8]);
	});
	test("splits only a section taller than the space", () => {
		const long = [piece(2, true), ...Array.from({ length: 9 }, () => piece(2))];
		expect(sheetColumns([...song.slice(0, 4), ...long], 2, 12).starts).toEqual([
			0, 7,
		]);
	});
	test("splits across sections when asked, for stage mode", () => {
		// Three sections of 8 in 2 columns: whole sections give 16 beside 8; splitting the
		// middle one evens them to 12 and 12.
		expect(sheetColumns(song, 2, 20).tallest).toBe(16);
		expect(sheetColumns(song, 2, 20, true)).toEqual({
			starts: [0, 6],
			tallest: 12,
		});
	});
	test("never makes more columns than sections without needing to", () => {
		expect(sheetColumns(song.slice(0, 8), 3).starts).toEqual([0, 4]);
	});
});

describe("key spelling", () => {
	test("sharp keys spell sharps, flat keys flats", () => {
		for (const key of ["C", "G", "D", "A", "E", "B", "F#"])
			expect(keyAccidental(key)).toBe("#");
		for (const key of ["F", "Bb", "Eb", "Ab", "Db"])
			expect(keyAccidental(key)).toBe("b");
		expect(keyAccidental("A#")).toBe("b");
	});
	test("capo 3 in G shows E shapes with sharps (C#m, not Dbm)", () => {
		const delta = displayTranspose("G", "G", 3);
		const accidental = modeAccidental(shiftKey("G", delta));
		expect(
			["Em", "Bm", "F#m"].map((chord) =>
				transposeChord(chord, delta, accidental),
			),
		).toEqual(["C#m", "G#m", "D#m"]);
	});
});

describe("chord shapes", () => {
	test("voices B as x24442 instead of putting F# in the bass", () => {
		const barre = {
			frets: [2, 2, 4, 4, 4, 2],
			fingers: [1, 1, 2, 3, 4, 1],
			midi: [42, 47, 54, 59, 63, 66],
		};
		const shape = rootInBass(barre, "B");
		expect(shape.frets).toEqual([-1, 2, 4, 4, 4, 2]);
		expect(shape.fingers[0]).toBe(0);
	});
	test("leaves shapes that already have the root in the bass", () => {
		const g = {
			frets: [3, 2, 0, 0, 0, 3],
			fingers: [2, 1, 0, 0, 0, 3],
			midi: [43, 47, 50, 55, 59, 67],
		};
		expect(rootInBass(g, "G")).toBe(g);
		// C/G style: neither low string is the root, so nothing changes.
		const inversion = {
			frets: [3, 3, 2, 0, 1, 0],
			fingers: [3, 4, 2, 0, 1, 0],
			midi: [43, 48, 52, 55, 60, 64],
		};
		expect(rootInBass(inversion, "A")).toBe(inversion);
	});
});
