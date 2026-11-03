import {
	type Arrangement,
	arrangementFingerprint,
	copyArrangement,
} from "@chords/data";
import { normalizeSheet, sheetDiagnostics } from "@chords/song-core";
import { SongSheet } from "@chords/song-ui";
import { Button } from "@chords/ui/components/button";
import { Field, FieldLabel } from "@chords/ui/components/field";
import { Input } from "@chords/ui/components/input";
import { Textarea } from "@chords/ui/components/textarea";
import { Toggle } from "@chords/ui/components/toggle";
import { useNavigate } from "@tanstack/react-router";
import { Check, Columns2, Wand2 } from "lucide-react";
import {
	useCallback,
	useDeferredValue,
	useEffect,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";
import { CapoSelect, KeySelect } from "#/components/key-select";
import { PageHeader } from "#/components/page-header";
import { useApp } from "./app-context";
import { CatalogueSearch } from "./catalogue-search";

const snippets = [
	["Chord", "[D]"],
	["Section", "\n{start_of_chorus: Chorus}\n\n{end_of_chorus}\n"],
	["Note", "\n{comment: Play softly}\n"],
] as const;

export function Editor({
	arrangement,
	save,
}: {
	arrangement: Arrangement;
	save: (value: Arrangement) => Promise<void>;
}) {
	const [draft, setDraft] = useState(arrangement);
	const navigate = useNavigate();
	const { account, owner, saveMany, arrangements } = useApp();
	const [state, setState] = useState(
		arrangement.data.reviewRequired
			? arrangement.data.visibility || "public"
			: arrangement.data.draft
				? "draft"
				: arrangement.data.visibility || "private",
	);
	const [finishing, setFinishing] = useState(false);
	const saving = useRef(Promise.resolve());
	const persist = useCallback(
		(value: Arrangement) => {
			saving.current = saving.current.catch(() => {}).then(() => save(value));
			return saving.current;
		},
		[save],
	);
	async function finish() {
		setFinishing(true);
		try {
			if (state === "public" && !draft.data.content.trim())
				throw new Error(
					"Add a chord sheet, or save this song as private or draft.",
				);
			await persist({
				...draft,
				data: {
					...draft.data,
					reviewRequired: false,
					visibility:
						state === "private" ||
						(draft.data.copiedFrom &&
							draft.data.sourceContentHash ===
								(await arrangementFingerprint(draft.data.content)))
							? "private"
							: "public",
					draft: state === "draft",
				},
			});
			if (
				state === "public" &&
				draft.data.copiedFrom &&
				draft.data.sourceContentHash ===
					(await arrangementFingerprint(draft.data.content))
			)
				toast.info(
					"This arrangement is already public. Your unchanged repertoire copy stays private.",
				);
			await navigate({ to: "/songs/$id", params: { id: arrangement.id } });
		} catch (reason) {
			toast.error(String(reason));
		} finally {
			setFinishing(false);
		}
	}

	const [saved, setSaved] = useState(true);
	const [preview, setPreview] = useState(true);
	const text = useRef<HTMLTextAreaElement>(null);
	const lastSaved = useRef(JSON.stringify(arrangement.data));
	const content = useDeferredValue(draft.data.content);
	useEffect(() => {
		if (
			JSON.stringify(draft.data) === lastSaved.current ||
			!draft.data.title.trim() ||
			finishing
		)
			return;
		const timer = window.setTimeout(() => {
			const snapshot = JSON.stringify(draft.data);
			void persist(draft)
				.then(() => {
					lastSaved.current = snapshot;
					setSaved(true);
				})
				.catch((reason) => toast.error(String(reason)));
		}, 700);
		return () => window.clearTimeout(timer);
	}, [draft, persist, finishing]);
	function update<K extends keyof Arrangement["data"]>(
		key: K,
		value: Arrangement["data"][K],
	) {
		setDraft((previous) => ({
			...previous,
			data: { ...previous.data, [key]: value },
		}));
		setSaved(false);
	}
	function insert(value: string) {
		const element = text.current;
		const start = element?.selectionStart ?? draft.data.content.length;
		const end = element?.selectionEnd ?? start;
		update(
			"content",
			draft.data.content.slice(0, start) +
				value +
				draft.data.content.slice(end),
		);
		requestAnimationFrame(() => {
			element?.focus();
			element?.setSelectionRange(start + value.length, start + value.length);
		});
	}
	return (
		<>
			<PageHeader title={draft.data.title || "Untitled song"}>
				<span className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
					<Check className="size-3" />
					{saved ? "Saved" : "Saving…"}
				</span>
				<Toggle
					size="sm"
					variant="outline"
					pressed={preview}
					onPressedChange={setPreview}
					aria-label="Toggle preview"
				>
					<Columns2 />
				</Toggle>
				<Button
					size="sm"
					onClick={() => void finish()}
					disabled={!draft.data.title.trim() || finishing}
				>
					{draft.data.reviewRequired
						? state === "public"
							? "Save and publish"
							: "Save song"
						: "Done"}
				</Button>
			</PageHeader>
			<div className="w-full space-y-4 p-4">
				<div className="grid gap-3 sm:grid-cols-[2fr_2fr_1fr_1fr]">
					<Field>
						<FieldLabel htmlFor="title">Title</FieldLabel>
						<Input
							id="title"
							value={draft.data.title}
							onChange={(event) => update("title", event.target.value)}
						/>
					</Field>
					<Field>
						<FieldLabel htmlFor="artist">Artist</FieldLabel>
						<Input
							id="artist"
							value={draft.data.artist}
							onChange={(event) => update("artist", event.target.value)}
						/>
					</Field>
					<Field>
						<FieldLabel>Key</FieldLabel>
						<KeySelect
							value={draft.data.key}
							onChange={(key) => update("key", key)}
						/>
					</Field>
					<Field>
						<FieldLabel>Capo</FieldLabel>
						<CapoSelect
							value={draft.data.sourceCapo}
							onChange={(capo) => update("sourceCapo", capo)}
						/>
					</Field>
				</div>
				<div className="grid gap-3 sm:grid-cols-2">
					<Field>
						<FieldLabel htmlFor="arrangement-name">
							Arrangement / version
						</FieldLabel>
						<Input
							id="arrangement-name"
							placeholder="Acoustic, live, full band…"
							value={draft.data.arrangementName || ""}
							onChange={(event) =>
								update("arrangementName", event.target.value)
							}
						/>
					</Field>
					<Field>
						<FieldLabel htmlFor="publication-state">Visibility</FieldLabel>
						<select
							id="publication-state"
							className="h-9 w-full rounded-md border bg-background px-3 text-sm"
							value={state}
							onChange={(event) => {
								const value = event.target.value;
								setState(value);
								setSaved(false);
								setDraft((previous) => ({
									...previous,
									data: {
										...previous.data,
										visibility: value === "private" ? "private" : "public",
										draft: previous.data.reviewRequired || value === "draft",
									},
								}));
							}}
						>
							<option value="public">Public — saved edits are published</option>
							<option value="private">Private — this repertoire only</option>
							<option value="draft">Draft — keep changes unpublished</option>
						</select>
					</Field>
				</div>
				<p className="text-xs text-muted-foreground">
					{draft.data.reviewRequired
						? "Review this song and any matches before saving. Public is selected by default; nothing is published until you finish."
						: state === "draft"
							? "Drafts work in setlists. Visitors keep seeing the last published version, if any."
							: state === "public"
								? "Saved chord-sheet edits are visible to everyone. Notes written into the chord sheet are public too."
								: "Only you or this band can access this arrangement."}
					{account === "local"
						? " Sign in to publish or sync; this song stays on this device until then."
						: ""}
				</p>
				<Field>
					<FieldLabel htmlFor="public-description">
						Public description
					</FieldLabel>
					<Input
						id="public-description"
						value={draft.data.description || ""}
						onChange={(event) => update("description", event.target.value)}
					/>
				</Field>
				<details
					className="rounded-lg border p-3"
					open={
						(draft.data.reviewRequired &&
							draft.data.title !== "Untitled song") ||
						undefined
					}
				>
					<summary className="cursor-pointer text-sm">
						Song group:{" "}
						{draft.data.songId ? "linked to an existing song" : "new song"} ·
						find existing matches
					</summary>
					<div className="mt-3 space-y-3">
						<CatalogueSearch
							initialQuery={
								draft.data.title === "Untitled song" ? "" : draft.data.title
							}
							excludeId={draft.id}
							chooseGroup={(group) => {
								update("songId", group.id);
								toast.success(`Grouped under ${group.title}`);
							}}
							onSelect={async (source) => {
								if (source.id === draft.id) return;
								setFinishing(true);
								try {
									await persist(draft);
									const existing = arrangements.find(
										(song) =>
											song.owner === owner &&
											(song.id === source.id ||
												song.data.copiedFrom === source.id),
									);
									const copy = existing || copyArrangement(source, owner);
									await saveMany([
										copy,
										...(draft.data.reviewRequired
											? [{ ...draft, archived: true }]
											: []),
									]);
									await navigate({ to: "/songs/$id", params: { id: copy.id } });
								} finally {
									setFinishing(false);
								}
							}}
						/>
						<Button
							type="button"
							size="sm"
							variant="outline"
							onClick={() => update("songId", draft.id)}
						>
							This is a different song
						</Button>
					</div>
				</details>
				<details className="rounded-lg border p-3">
					<summary className="cursor-pointer text-sm">
						Private repertoire settings
					</summary>
					<div className="mt-3 grid gap-3 sm:grid-cols-2">
						<Field>
							<FieldLabel>Preferred performance key</FieldLabel>
							<KeySelect
								value={draft.data.performanceKey || draft.data.key}
								onChange={(key) => update("performanceKey", key)}
							/>
						</Field>
						<Field>
							<FieldLabel>Performance capo</FieldLabel>
							<CapoSelect
								value={draft.data.performanceCapo ?? draft.data.sourceCapo}
								onChange={(capo) => update("performanceCapo", capo)}
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor="private-notes">
								Private rehearsal notes
							</FieldLabel>
							<Textarea
								id="private-notes"
								value={draft.data.privateNotes || ""}
								onChange={(event) => update("privateNotes", event.target.value)}
							/>
						</Field>
						<label className="flex items-center gap-2 text-sm">
							<input
								type="checkbox"
								checked={!!draft.data.preferred}
								onChange={(event) => {
									const preferred = event.target.checked;
									update("preferred", preferred);
								}}
							/>
							Preferred arrangement for this song
						</label>
					</div>
				</details>
				<div className={preview ? "grid gap-4 lg:grid-cols-2" : ""}>
					<div className="space-y-2">
						<div className="flex flex-wrap items-center gap-1">
							{snippets.map(([label, value]) => (
								<Button
									key={label}
									variant="outline"
									size="sm"
									onClick={() => insert(value)}
								>
									{label}
								</Button>
							))}
							<Button
								variant="ghost"
								size="sm"
								className="ml-auto"
								onClick={() =>
									update("content", normalizeSheet(draft.data.content).content)
								}
							>
								<Wand2 /> Convert pasted text
							</Button>
						</div>
						<Textarea
							ref={text}
							className="min-h-[60vh] font-mono leading-relaxed"
							value={draft.data.content}
							onChange={(event) => update("content", event.target.value)}
							spellCheck={false}
							aria-label="Chord sheet"
							placeholder="Put chords before a syllable: [D]Hello [G]world"
						/>
						{sheetDiagnostics(content).map((message) => (
							<p className="text-xs text-muted-foreground" key={message}>
								{message}
							</p>
						))}
						{draft.data.sourceUrl ? (
							<a
								className="text-xs text-muted-foreground underline underline-offset-4"
								href={draft.data.sourceUrl}
								target="_blank"
								rel="noreferrer"
							>
								Original source
							</a>
						) : null}
					</div>
					{preview ? (
						<div className="min-w-0 rounded-lg border p-4">
							<SongSheet content={content} fontSize={18} />
						</div>
					) : null}
				</div>
			</div>
		</>
	);
}
