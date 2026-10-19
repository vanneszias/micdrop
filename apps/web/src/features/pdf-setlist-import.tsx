import { type Setlist, type SongbookStore, songIdentity } from "@chords/data";
import {
	MAX_PDF_BYTES,
	normalizePdfSetlist,
	type PdfSetlist,
} from "@chords/imports/pdf";
import { KEYS, keyDistance } from "@chords/song-core";
import { SongSheet } from "@chords/song-ui";
import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@chords/ui/components/alert";
import { Button } from "@chords/ui/components/button";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@chords/ui/components/field";
import { Input } from "@chords/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@chords/ui/components/select";
import { Spinner } from "@chords/ui/components/spinner";
import { Textarea } from "@chords/ui/components/textarea";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { freshArrangement } from "#/lib/songs";

export function PdfSetlistImport({
	owner,
	online,
	signedIn,
	store,
}: {
	owner: string;
	online: boolean;
	signedIn: boolean;
	store: SongbookStore;
}) {
	const navigate = useNavigate();
	const [file, setFile] = useState<File | null>(null);
	const [draft, setDraft] = useState<PdfSetlist | null>(null);
	const [busy, setBusy] = useState(false);
	const [reviewIndex, setReviewIndex] = useState(0);
	async function extract() {
		if (!file) return;
		setBusy(true);
		try {
			const message = async (response: Response) => {
				const data = (await response.json().catch(() => null)) as {
					error?: unknown;
				} | null;
				return data && typeof data.error === "string"
					? data.error
					: "Could not import this PDF.";
			};
			const start = await fetch("/api/import-pdf", {
				method: "POST",
				headers: { "Content-Type": "application/pdf" },
				body: file,
			});
			if (!start.ok) throw new Error(await message(start));
			const { id } = (await start.json()) as { id: string };
			const deadline = Date.now() + 10 * 60_000;
			let data: unknown;
			for (;;) {
				if (Date.now() > deadline) throw new Error("The import timed out.");
				await new Promise((resolve) => setTimeout(resolve, 2000));
				const poll = await fetch(`/api/import-pdf/${id}`);
				if (!poll.ok) throw new Error(await message(poll));
				const job = (await poll.json()) as {
					status: string;
					error?: string;
					result?: unknown;
				};
				if (job.status === "failed")
					throw new Error(job.error || "Could not import this PDF.");
				if (job.status === "done") {
					data = job.result;
					break;
				}
			}
			setDraft(normalizePdfSetlist(data));
		} catch (reason) {
			toast.error(reason instanceof Error ? reason.message : String(reason));
		} finally {
			setBusy(false);
		}
	}
	async function save() {
		if (!draft || !file) return;
		setBusy(true);
		try {
			const checked = normalizePdfSetlist(draft);
			const songs: ReturnType<typeof freshArrangement>[] = [];
			const byIdentity = new Map<string, ReturnType<typeof freshArrangement>>();
			const list: Setlist = {
				id: crypto.randomUUID(),
				kind: "setlist",
				owner,
				version: 0,
				archived: false,
				updatedAt: new Date().toISOString(),
				data: {
					title: checked.title,
					date: "",
					entries: checked.songs.map((song) => {
						const arrangement = freshArrangement(owner, {
							...song,
							key: song.key || "C",
							tags: ["PDF import"],
							sourceUrl: "",
						});
						const identity = songIdentity(arrangement.data);
						const previous = byIdentity.get(identity);
						// Repeated appearances share an arrangement only when the extracted sheets match.
						if (
							previous &&
							(previous.data.content !== arrangement.data.content ||
								previous.data.key !== arrangement.data.key ||
								previous.data.sourceCapo !== arrangement.data.sourceCapo)
						)
							throw new Error(
								`Different sheets share the title “${song.title}”. Give each version a distinct title.`,
							);
						if (!previous) {
							songs.push(arrangement);
							byIdentity.set(identity, arrangement);
						}
						return {
							id: crypto.randomUUID(),
							arrangementId: previous?.id || arrangement.id,
							key: KEYS[
								(keyDistance("C", song.key || "C") + song.sourceCapo) % 12
							],
							notes: song.notes,
						};
					}),
				},
			};
			await store.saveImport([...songs, list], { id: list.id, file });
			void store.sync();
			toast.success("Songs and setlist saved");
			await navigate({ to: "/setlists/$id", params: { id: list.id } });
		} catch (reason) {
			toast.error(reason instanceof Error ? reason.message : String(reason));
		} finally {
			setBusy(false);
		}
	}
	const song = draft?.songs[reviewIndex];
	function updateSong(patch: Partial<PdfSetlist["songs"][number]>) {
		setDraft((current) =>
			current
				? {
						...current,
						songs: current.songs.map((value, index) =>
							index === reviewIndex ? { ...value, ...patch } : value,
						),
					}
				: current,
		);
	}
	if (!draft)
		return (
			<FieldGroup>
				<Field>
					<FieldLabel htmlFor="pdf">PDF file</FieldLabel>
					<Input
						id="pdf"
						type="file"
						accept=".pdf,application/pdf"
						disabled={busy}
						onChange={(event) => {
							const selected = event.target.files?.[0];
							setFile(null);
							if (
								selected &&
								(selected.size > MAX_PDF_BYTES ||
									!selected.name.toLowerCase().endsWith(".pdf"))
							) {
								toast.error("Choose a PDF smaller than 10 MB.");
								return;
							}
							setFile(selected || null);
						}}
					/>
					<FieldDescription>
						{!signedIn
							? "Sign in to import PDFs."
							: !online
								? "Importing needs a connection."
								: "Up to 10 MB. Each song can be reviewed before saving."}
					</FieldDescription>
				</Field>
				<Button
					disabled={busy || !file || !online || !signedIn}
					onClick={() => void extract()}
				>
					{busy ? <Spinner /> : null}
					{busy ? "Reading…" : "Extract"}
				</Button>
			</FieldGroup>
		);
	return (
		<FieldGroup>
			<Field>
				<FieldLabel htmlFor="setlist-name">Setlist name</FieldLabel>
				<Input
					id="setlist-name"
					value={draft.title}
					disabled={busy}
					maxLength={200}
					onChange={(event) =>
						setDraft({ ...draft, title: event.target.value })
					}
				/>
			</Field>
			{draft.warnings.length ? (
				<Alert>
					<AlertTitle>Check these details</AlertTitle>
					<AlertDescription>
						<ul className="list-inside list-disc">
							{[...new Set(draft.warnings)].map((warning) => (
								<li key={warning}>{warning}</li>
							))}
						</ul>
					</AlertDescription>
				</Alert>
			) : null}
			<Field>
				<FieldLabel>Song</FieldLabel>
				<Select
					value={String(reviewIndex)}
					disabled={busy}
					onValueChange={(value) => setReviewIndex(Number(value))}
				>
					<SelectTrigger>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{draft.songs.map((item, index) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: PDF occurrence order is fixed, including repeated songs.
							<SelectItem key={index} value={String(index)}>
								{index + 1}. {item.title}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</Field>
			{song ? (
				<>
					<div className="grid gap-3 sm:grid-cols-2">
						<Field>
							<FieldLabel htmlFor="song-title">Title</FieldLabel>
							<Input
								id="song-title"
								value={song.title}
								disabled={busy}
								maxLength={200}
								onChange={(event) => updateSong({ title: event.target.value })}
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor="song-artist">Artist</FieldLabel>
							<Input
								id="song-artist"
								value={song.artist}
								disabled={busy}
								maxLength={200}
								onChange={(event) => updateSong({ artist: event.target.value })}
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor="song-key">Key</FieldLabel>
							<Input
								id="song-key"
								value={song.key}
								placeholder="Defaults to C"
								disabled={busy}
								onChange={(event) => updateSong({ key: event.target.value })}
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor="song-capo">Capo</FieldLabel>
							<Input
								id="song-capo"
								type="number"
								min={0}
								max={12}
								value={song.sourceCapo}
								disabled={busy}
								onChange={(event) =>
									updateSong({ sourceCapo: Number(event.target.value) })
								}
							/>
						</Field>
					</div>
					<Field>
						<FieldLabel htmlFor="song-sheet">ChordPro</FieldLabel>
						<Textarea
							id="song-sheet"
							rows={10}
							className="font-mono"
							value={song.content}
							disabled={busy}
							onChange={(event) => updateSong({ content: event.target.value })}
						/>
						{!song.content.trim() ? (
							<FieldDescription>
								No chords found. Add them now or edit the song later.
							</FieldDescription>
						) : null}
					</Field>
					{song.content.trim() ? (
						<details className="rounded-lg border p-3">
							<summary className="cursor-pointer text-sm">Preview</summary>
							<div className="mt-3">
								<SongSheet content={song.content} />
							</div>
						</details>
					) : null}
					<details className="rounded-lg border p-3">
						<summary className="cursor-pointer text-sm">
							Original transcription
						</summary>
						<pre className="mt-3 text-xs whitespace-pre-wrap">
							{song.rawSource}
						</pre>
					</details>
					<Field>
						<FieldLabel htmlFor="song-notes">Notes</FieldLabel>
						<Textarea
							id="song-notes"
							value={song.notes}
							disabled={busy}
							onChange={(event) => updateSong({ notes: event.target.value })}
						/>
					</Field>
				</>
			) : null}
			<FieldDescription>
				{draft.songs.length} songs in PDF order. The PDF stays on this device.
			</FieldDescription>
			<div className="flex gap-2">
				<Button
					disabled={busy || !draft.title.trim()}
					onClick={() => void save()}
				>
					{busy ? <Spinner /> : null} Save
				</Button>
				<Button
					variant="ghost"
					disabled={busy}
					onClick={() => {
						setDraft(null);
						setReviewIndex(0);
					}}
				>
					Choose another PDF
				</Button>
			</div>
		</FieldGroup>
	);
}
