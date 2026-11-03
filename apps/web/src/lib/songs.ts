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
			visibility: "public",
			draft: false,
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

export type Library = { id: string; name: string };

const EDITOR_ROLES = ["owner", "admin", "member", "editor"];

export function canEditRole(role?: string) {
	return (
		!!role && role.split(",").some((value) => EDITOR_ROLES.includes(value))
	);
}

/** Libraries songs and setlists can be copied or moved to: yours, and bands you can edit. */
export function destinations(account: string, owner: string, bands: Band[]) {
	const libraries: Library[] = [
		{ id: account, name: "Personal" },
		...bands
			.filter((band) => canEditRole(band.role))
			.map(({ id, name }) => ({ id, name })),
	];
	return libraries.filter((library) => library.id !== owner);
}

/** Moving takes songs out of the current library, so it must be editable too. */
export function canMoveFrom(account: string, owner: string, bands: Band[]) {
	return (
		owner === account ||
		canEditRole(bands.find((band) => band.id === owner)?.role)
	);
}
