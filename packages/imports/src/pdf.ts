import { normalizeSheet } from "@chords/song-core";
import { z } from "zod";

export const MAX_PDF_BYTES = 10_000_000;
export const PdfSetlist = z.object({
	title: z.string().trim().min(1).max(200),
	songs: z
		.array(
			z.object({
				title: z.string().trim().min(1).max(200),
				artist: z.string().max(200),
				key: z
					.string()
					.regex(/^[A-G](?:#|b)?$/)
					.or(z.literal("")),
				sourceCapo: z.number().int().min(0).max(12),
				rawSource: z.string().max(200_000),
				content: z.string().max(200_000),
				notes: z.string().max(2000),
			}),
		)
		.max(200),
	warnings: z.array(z.string().max(2000)).max(200),
});
export type PdfSetlist = z.infer<typeof PdfSetlist>;

export function normalizePdfSetlist(input: unknown): PdfSetlist {
	const result = PdfSetlist.parse(input);
	if (!result.songs.length) throw new Error("No songs were found in this PDF.");
	return {
		...result,
		songs: result.songs.map((song) => {
			const normalized = normalizeSheet(song.content);
			return { ...song, content: normalized.content };
		}),
	};
}

export function validatePdf(bytes: Uint8Array) {
	if (!bytes.length || bytes.length > MAX_PDF_BYTES)
		throw new Error("Choose a PDF smaller than 10 MB.");
	if (new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-")
		throw new Error("This file is not a PDF.");
}
