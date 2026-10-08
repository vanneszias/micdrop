import { normalizeSheet } from "@chords/song-core";

export function validateSourceUrl(input: string): URL {
	const url = new URL(input);
	const host = url.hostname.toLowerCase();
	// Only DNS hostnames are accepted. Literal addresses, credentials and local names are rejected.
	if (
		url.protocol !== "https:" ||
		url.username ||
		url.password ||
		url.port ||
		!host.includes(".") ||
		host.includes(":") ||
		/^\d+(?:\.\d+){3}$/.test(host) ||
		/(?:^|\.)(?:localhost|local|internal|test|invalid|example)$/.test(host)
	)
		throw new Error(
			"Use a public HTTPS website URL without credentials or a custom port.",
		);
	return url;
}

export async function boundedText(
	response: Response,
	limit = 1_000_000,
): Promise<string> {
	if (!response.body) return "";
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	try {
		for (;;) {
			const { value, done } = await reader.read();
			if (done) break;
			size += value.byteLength;
			if (size > limit)
				throw new Error(
					"This page is too large. Paste the chord text instead.",
				);
			chunks.push(value);
		}
	} finally {
		await reader.cancel();
	}
	const decoder = new TextDecoder();
	return (
		chunks.map((chunk) => decoder.decode(chunk, { stream: true })).join("") +
		decoder.decode()
	);
}

export function importedSheet(raw: string, sourceUrl: string, title = "") {
	const { content, warnings } = normalizeSheet(raw);
	const parts = title.split(/\s+[–—|−-]\s+/);
	return {
		content,
		rawSource: raw,
		sourceUrl,
		title: parts[0].replace(/\s+Chords$/i, "").trim(),
		artist:
			new URL(sourceUrl).hostname === "pnwchords.com"
				? (parts[1] || "").trim()
				: "",
		warnings,
	};
}
