import { expect, test } from "bun:test";
import { parseOpenSong } from "./opensong";

const song = (lyrics: string, extra = "") =>
	`<?xml version="1.0" encoding="UTF-8"?><song><title>You are</title><author>Hillsong</author>${extra}<lyrics>${lyrics}</lyrics></song>`;

test("OpenSong chord lines become aligned ChordPro chords", () => {
	const result = parseOpenSong(
		song(
			"[V1]\r\n.F                  Dm\r\n You are my light &amp; salvation\r\n\r\n[C]\r\n.       Bb\r\n   I'll bless Your name\r\n;softly",
			"<key>F</key><capo>2</capo><copyright>2005 Hillsong Publishing</copyright><aka>Lord</aka>",
		),
	);
	expect(result.content).toBe(
		"{start_of_verse: Verse 1}\n[F]You are my light & [Dm]salvation\n{end_of_verse}\n\n{start_of_chorus: Chorus}\nI'll [Bb]bless Your name\n{comment: softly}\n{end_of_chorus}\n\n{comment: © 2005 Hillsong Publishing}",
	);
	expect(result).toMatchObject({
		title: "You are",
		artist: "Hillsong",
		key: "F",
		sourceCapo: 2,
		tags: ["Lord"],
		description: "© 2005 Hillsong Publishing",
		warnings: [],
	});
	expect(result.rawSource).toContain("<aka>Lord</aka>");
});

test("OpenSong chords stay as written and notes are not read as chords", () => {
	const result = parseOpenSong(
		song(
			"[V1]\n Pre-chorus\n.Gaug  Emaj7     A(9) x2\n Lift up\n.D    G2(no3) | C\n\n[V2]\n [Chorus]\n\n[V3]\n 2\n Wave\\beat [shore] {x}",
		),
	);
	expect(result.content).toBe(
		"{start_of_part: Pre-chorus}\n[Gaug]Lift u[Emaj7]p [Aadd9] [*x2]\n[D]    [Gsus2] [*|] [C]\n{end_of_part}\n\n{comment: Chorus}\n\n{start_of_verse: Verse 2}\nWave\\\\beat (shore) (x)\n{end_of_verse}",
	);
	expect(result.key).toBe("G");
	expect(result.warnings).toEqual(["No key was given; check it."]);
});

test("OpenSong rejects other XML", () => {
	expect(() => parseOpenSong("<html></html>")).toThrow("not an OpenSong");
});
