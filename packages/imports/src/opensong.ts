import { isChord } from "@chords/song-core";

const SECTIONS: Record<string, string> = {
	V: "Verse",
	C: "Chorus",
	B: "Bridge",
	P: "Pre-chorus",
	I: "Intro",
	O: "Outro",
	T: "Tag",
};
const LABEL =
	/^\[?((?:verse|chorus|bridge|pre[- ]?chorus|intro|outro|tag|ending|interlude|instrumental)(?: *\d+)?):?\]?$/i;
// Hymns often number their verses on a line of their own.
const VERSE_NUMBER = /^(\d{1,2})\.?$/;
const BREAK = /^(?:-{2,}!*|-!!|!--)$/;

function decode(value: string) {
	return value
		.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
		.replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
			String.fromCodePoint(Number.parseInt(hex, 16)),
		)
		.replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&amp;/g, "&");
}

function field(xml: string, name: string) {
	const match = xml.match(
		new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`),
	);
	return match ? decode(match[1]).trim() : "";
}

// Lyrics must not be read as ChordPro chords or directives.
const plain = (text: string) =>
	text.replace(/\\/g, "\\\\").replace(/[[{]/g, "(").replace(/[\]}]/g, ")");
const indent = (line: string) => line.length - line.trimStart().length;
const environment = (label: string) =>
	/^(verse|chorus|bridge)\b/i.exec(label)?.[1].toLowerCase() || "part";

/** Chords stay as written; other chord-line text (x2, bars, notes) becomes an annotation. */
function chordMarkup(token: string) {
	const core = token.replace(/^\(+|[),.;:]+$/g, "");
	if (isChord(core)) return `[${core}]`;
	// Common chart shorthands, rewritten so they can be transposed.
	const spelled = token
		.replace(/^\(+|[,.;:]+$/g, "")
		.replace(/\*+$/, "")
		.replace(/^([A-G][#b]?)\(9\)/, "$1add9")
		.replace(/^([A-G][#b]?)\(4\)/, "$1sus4")
		.replace(/^([A-G][#b]?)2\(no3\)/, "$1sus2");
	return isChord(spelled) ? `[${spelled}]` : `[*${plain(token)}]`;
}

/** Places each chord at its column in the lyric line, as OpenSong lays them out. */
function merge(chordLine: string, lyricLine: string) {
	const shift = lyricLine.trim()
		? Math.min(indent(chordLine), indent(lyricLine))
		: indent(chordLine);
	const chords = chordLine.slice(shift).trimEnd();
	// Bars split projector slides; blank them in place to keep columns.
	const text = plain(lyricLine.slice(shift).replace(/\|/g, " ")).trimEnd();
	let out = "";
	let position = 0;
	for (const match of chords.matchAll(/\S+/g)) {
		const markup = chordMarkup(match[0]);
		if (!text) {
			// Chord-only line: keep the spacing between chords.
			out += `${chords.slice(position, match.index)}${markup}`;
			position = match.index + match[0].length;
		} else if (match.index >= text.length) {
			out += `${text.slice(position)} ${markup}`;
			position = text.length;
		} else {
			out += text.slice(position, match.index) + markup;
			position = match.index;
		}
	}
	// Underscores only stretch lyrics under long chords.
	return (text ? out + text.slice(position) : out).replace(/_/g, "");
}

/** Converts OpenSong lyrics to ChordPro. */
export function openSongChordPro(lyrics: string) {
	const lines = lyrics.replace(/\r\n?/g, "\n").split("\n");
	const out: string[] = [];
	let open = "";
	const close = () => {
		while (out.length && !out[out.length - 1]) out.pop();
		if (open) out.push(`{end_of_${open}}`);
		if (out.length) out.push("");
		open = "";
	};
	const start = (label: string) => {
		close();
		open = environment(label);
		out.push(`{start_of_${open}: ${plain(label)}}`);
	};
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const trimmed = line.trim();
		const header = line.startsWith("[") && /^\[([^\]]+)\]$/.exec(trimmed);
		if (header) {
			// Many files number slides [V1], [V2]... and name the real section on its first line.
			const first = lines
				.slice(i + 1)
				.find((next) => next.trim())
				?.trim();
			if (first && (LABEL.test(first) || VERSE_NUMBER.test(first))) continue;
			const [, type, number] = /^([A-Za-z])(\d*)$/.exec(header[1]) || [];
			const name = type && SECTIONS[type.toUpperCase()];
			start(name ? `${name}${number ? ` ${number}` : ""}` : header[1]);
		} else if (line.startsWith(".")) {
			const next = (lines[i + 1] || "").trim();
			const lyric =
				/^[ \d]/.test(lines[i + 1] || "") &&
				next &&
				!LABEL.test(next) &&
				!VERSE_NUMBER.test(next);
			out.push(merge(line.slice(1), lyric ? lines[++i].slice(1) : ""));
		} else if (line.startsWith(";")) {
			if (trimmed.slice(1).trim())
				out.push(`{comment: ${plain(trimmed.slice(1).trim())}}`);
		} else if (!trimmed) out.push("");
		else if (VERSE_NUMBER.test(trimmed))
			start(`Verse ${VERSE_NUMBER.exec(trimmed)?.[1]}`);
		else if (LABEL.test(trimmed)) {
			const label = LABEL.exec(trimmed)?.[1] || trimmed;
			// "[Chorus]" inside a section asks to repeat it.
			if (trimmed.startsWith("[")) {
				close();
				out.push(`{comment: ${label}}`);
			} else start(label);
		} else if (!BREAK.test(trimmed))
			out.push(merge("", line.slice(1)).trim() || "");
	}
	close();
	return out
		.join("\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

/** Parses one OpenSong XML song. The XML is kept verbatim as the raw import. */
export function parseOpenSong(xml: string, fallbackTitle = "") {
	if (!/<song[\s>]/.test(xml)) throw new Error("This is not an OpenSong file.");
	const lyrics = field(xml, "lyrics");
	const content = openSongChordPro(lyrics);
	const copyright = field(xml, "copyright");
	const ccli = field(xml, "ccli");
	const notice = [
		copyright &&
			(/^©|^\(c\)|public domain/i.test(copyright)
				? copyright
				: `© ${copyright}`),
		ccli && `CCLI ${ccli}`,
	]
		.filter(Boolean)
		.join(" · ");
	const first = /\[([A-G][#b]?)(m(?!aj))?/.exec(content);
	const firstChord = first ? first[1] + (first[2] || "") : "";
	const key = field(xml, "key").replace(/\s+/g, "").slice(0, 10);
	const capo = Number.parseInt(field(xml, "capo"), 10);
	const aka = field(xml, "aka");
	return {
		title: (field(xml, "title") || fallbackTitle).slice(0, 200),
		artist: field(xml, "author").slice(0, 200),
		content: notice ? `${content}\n\n{comment: ${plain(notice)}}` : content,
		key: key || firstChord || "C",
		sourceCapo: capo >= 0 && capo <= 12 ? capo : 0,
		tags: aka ? [aka.slice(0, 50)] : [],
		description: notice.slice(0, 2000),
		rawSource: xml,
		warnings: key ? [] : ["No key was given; check it."],
	};
}
