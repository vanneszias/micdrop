import { describe, expect, test } from "bun:test";
import {
	balanceColumns,
	displayTranspose,
	exportChordPro,
	keyAccidental,
	keyDistance,
	normalizeSheet,
	sheetChords,
	sheetLines,
	sheetMetadata,
	shiftKey,
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
