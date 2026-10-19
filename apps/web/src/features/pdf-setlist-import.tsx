import { type Setlist, type SongbookStore, songIdentity } from "@chords/data";
import {
	MAX_PDF_BYTES,
	normalizePdfSetlist,
	type PdfSetlist,
} from "@chords/imports/pdf";
import { KEYS, keyDistance } from "@chords/song-core";
import { SongSheet } from "@chords/song-ui";
import { Button } from "@chords/ui/components/button";
import { Input } from "@chords/ui/components/input";
import { Textarea } from "@chords/ui/components/textarea";
import { LoaderCircle } from "lucide-react";
import { useState } from "react";
import { freshArrangement } from "./songbook";

export function PdfSetlistImport({
	owner,
	online,
	signedIn,
	store,
	complete,
}: {
	owner: string;
	online: boolean;
	signedIn: boolean;
	store: SongbookStore;
	complete: (id: string) => void;
}) {
	const [file, setFile] = useState<File | null>(null);
	const [draft, setDraft] = useState<PdfSetlist | null>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const [reviewIndex, setReviewIndex] = useState(0);
	async function extract() {
		if (!file) return;
		setBusy(true);
		setError("");
		try {
			const response = await fetch("/api/import-pdf", {
				method: "POST",
				headers: { "Content-Type": "application/pdf" },
				body: file,
			});
			const data = await response.json();
			if (!response.ok)
				throw new Error(
					data &&
						typeof data === "object" &&
						"error" in data &&
						typeof data.error === "string"
						? data.error
						: "Could not import this PDF.",
				);
			setDraft(normalizePdfSetlist(data));
		} catch (reason) {
			setError(reason instanceof Error ? reason.message : String(reason));
		} finally {
			setBusy(false);
		}
	}
	async function save() {
		if (!draft || !file) return;
		setBusy(true);
		setError("");
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
			complete(list.id);
		} catch (reason) {
			setError(reason instanceof Error ? reason.message : String(reason));
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
	return (
		<div className="dialog-stack">
			{error ? (
				<p role="alert" className="error-message">
					{error}
				</p>
			) : null}
			{!draft ? (
				<>
					<p className="muted">
						Upload a chord-sheet PDF (up to 10 MB). OpenAI reads its text and
						page images, including scanned sheets. You can check and edit each
						song before saving.
					</p>
					<label>
						PDF file
						<Input
							type="file"
							accept=".pdf,application/pdf"
							disabled={busy}
							onChange={(event) => {
								const selected = event.target.files?.[0];
								setFile(null);
								setError("");
								if (
									selected &&
									(selected.size > MAX_PDF_BYTES ||
										!selected.name.toLowerCase().endsWith(".pdf"))
								) {
									setError("Choose a PDF smaller than 10 MB.");
									return;
								}
								setFile(selected || null);
							}}
						/>
					</label>
					{!signedIn ? (
						<p className="muted">Sign in to use AI PDF import.</p>
					) : !online ? (
						<p className="muted">PDF import needs an internet connection.</p>
					) : null}
					<Button
						disabled={busy || !file || !online || !signedIn}
						onClick={() => void extract()}
					>
						{busy ? <LoaderCircle className="spin" size={16} /> : null}
						{busy ? "Reading your PDF…" : "Extract and review setlist"}
					</Button>
				</>
			) : (
				<>
					<label>
						Setlist name
						<Input
							value={draft.title}
							disabled={busy}
							maxLength={200}
							onChange={(event) =>
								setDraft({ ...draft, title: event.target.value })
							}
						/>
					</label>
					{draft.warnings.length ? (
						<div>
							<strong>Check these details</strong>
							<ul>
								{[...new Set(draft.warnings)].map((warning) => (
									<li key={warning}>{warning}</li>
								))}
							</ul>
						</div>
					) : null}
					<label>
						Song order
						<select
							value={reviewIndex}
							disabled={busy}
							onChange={(event) => setReviewIndex(Number(event.target.value))}
						>
							{draft.songs.map((item, index) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: PDF occurrence order is fixed, including repeated songs.
								<option key={index} value={index}>
									{index + 1}. {item.title}
								</option>
							))}
						</select>
					</label>
					{song ? (
						<>
							<label>
								Song title
								<Input
									value={song.title}
									disabled={busy}
									maxLength={200}
									onChange={(event) =>
										updateSong({ title: event.target.value })
									}
								/>
							</label>
							<label>
								Artist
								<Input
									value={song.artist}
									disabled={busy}
									maxLength={200}
									onChange={(event) =>
										updateSong({ artist: event.target.value })
									}
								/>
							</label>
							<div className="metadata-grid">
								<label>
									Written key
									<Input
										value={song.key}
										placeholder="Unknown; defaults to C"
										disabled={busy}
										onChange={(event) =>
											updateSong({ key: event.target.value })
										}
									/>
								</label>
								<label>
									Source capo
									<Input
										type="number"
										min={0}
										max={12}
										value={song.sourceCapo}
										disabled={busy}
										onChange={(event) =>
											updateSong({ sourceCapo: Number(event.target.value) })
										}
									/>
								</label>
							</div>
							<label>
								ChordPro sheet
								<Textarea
									rows={8}
									value={song.content}
									disabled={busy}
									onChange={(event) =>
										updateSong({ content: event.target.value })
									}
								/>
							</label>
							{!song.content.trim() ? (
								<p className="muted">
									This song has no chord sheet. Add chords now or edit it later
									in your songbook.
								</p>
							) : (
								<details>
									<summary>Preview chord sheet</summary>
									<SongSheet content={song.content} />
								</details>
							)}
							<details>
								<summary>Original transcription</summary>
								<pre className="whitespace-pre-wrap">{song.rawSource}</pre>
							</details>
							<label>
								Performance notes
								<Textarea
									value={song.notes}
									disabled={busy}
									onChange={(event) =>
										updateSong({ notes: event.target.value })
									}
								/>
							</label>
						</>
					) : null}
					<p className="muted">
						{draft.songs.length} songs in PDF order. The original PDF stays on
						this device; songs and setlist sync to your account.
					</p>
					<div className="actions">
						<Button
							disabled={busy || !draft.title.trim()}
							onClick={() => void save()}
						>
							{busy ? "Saving…" : "Save songs and setlist"}
						</Button>
						<Button
							variant="ghost"
							disabled={busy}
							onClick={() => {
								setDraft(null);
								setReviewIndex(0);
								setError("");
							}}
						>
							Choose another PDF
						</Button>
					</div>
				</>
			)}
		</div>
	);
}
