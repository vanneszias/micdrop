import type { Arrangement } from "@chords/data";
import { exportChordPro } from "@chords/song-core";

export async function api<T>(path: string, body?: unknown): Promise<T> {
	const response = await fetch(
		path,
		body
			? {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(body),
				}
			: undefined,
	);
	const data = (await response.json()) as T & { error?: string };
	if (!response.ok)
		throw new Error(data.error || "Could not complete this request");
	return data;
}

export function freshArrangement(
	owner: string,
	data?: Partial<Arrangement["data"]>,
): Arrangement {
	return {
		id: crypto.randomUUID(),
		kind: "arrangement",
		owner,
		version: 0,
		archived: false,
		updatedAt: new Date().toISOString(),
		data: {
			title: "Untitled song",
			artist: "",
			content: "",
			key: "C",
			sourceCapo: 0,
			tags: [],
			sourceUrl: "",
			rawSource: "",
			copiedFrom: "",
			...data,
		},
	};
}

export function exportSheet(song: Arrangement) {
	const blob = new Blob([exportChordPro(song.data.content, song.data)], {
		type: "text/plain",
	});
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = `${song.data.title}.cho`;
	link.click();
	URL.revokeObjectURL(url);
}

export type Band = {
	id: string;
	name: string;
	role: string;
	members: { id: string; name: string; email: string; role: string }[];
};
