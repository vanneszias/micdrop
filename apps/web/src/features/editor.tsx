import {
	type Arrangement,
	arrangementFingerprint,
	copyArrangement,
} from "@chords/data";
import { normalizeSheet, sheetDiagnostics } from "@chords/song-core";
import { SongSheet } from "@chords/song-ui";
import { Button } from "@chords/ui/components/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@chords/ui/components/collapsible";
import {
	Field,
	FieldDescription,
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
import { Switch } from "@chords/ui/components/switch";
import { Textarea } from "@chords/ui/components/textarea";
import { Toggle } from "@chords/ui/components/toggle";
import { useNavigate } from "@tanstack/react-router";
import { Check, ChevronRight, Columns2, Wand2 } from "lucide-react";
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

const visibilityOptions = [
	["public", "Public", "Saved edits are published"],
	["private", "Private", "Only in your repertoire"],
	["draft", "Draft", "Changes stay unpublished"],
] as const;

function EditorSection({
	title,
	summary,
	defaultOpen,
	children,
}: {
	title: string;
	summary?: string;
	defaultOpen?: boolean;
	children: React.ReactNode;
}) {
	return (
		<Collapsible
			defaultOpen={defaultOpen}
			className="group/section rounded-lg border bg-card/40"
		>
			<CollapsibleTrigger className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium outline-none hover:bg-accent/40 focus-visible:ring-[3px] focus-visible:ring-ring/50">
				<ChevronRight className="size-4 text-muted-foreground transition-transform group-data-[state=open]/section:rotate-90" />
				{title}
				{summary ? (
					<span className="ml-auto truncate text-xs font-normal text-muted-foreground">
						{summary}
					</span>
				) : null}
			</CollapsibleTrigger>
			<CollapsibleContent className="border-t px-3 py-3">
				{children}
			</CollapsibleContent>
		</Collapsible>
	);
}

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
				<div className="grid gap-3 sm:grid-cols-[2fr_2fr_2fr]">
					<Field>
						<FieldLabel htmlFor="arrangement-name">Version</FieldLabel>
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
						<Select
							value={state}
							onValueChange={(value) => {
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
							<SelectTrigger
								id="publication-state"
								aria-label="Visibility"
								className="w-full"
							>
								<SelectValue>
									{visibilityOptions.find(([value]) => value === state)?.[1]}
								</SelectValue>
							</SelectTrigger>
							<SelectContent>
								{visibilityOptions.map(([value, label, hint]) => (
									<SelectItem key={value} value={value}>
										{label}
										<span className="text-muted-foreground">{hint}</span>
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<FieldDescription className="text-xs">
							{draft.data.reviewRequired
								? "Nothing is published until you save."
								: state === "draft"
									? "Drafts work in setlists. Visitors keep seeing the last published version."
									: state === "public"
										? "Saved edits, including notes in the sheet, are visible to everyone."
										: "Only you or this band can see this arrangement."}
							{account === "local"
								? " Sign in to publish or sync; until then it stays on this device."
								: ""}
						</FieldDescription>
					</Field>
					<Field>
						<FieldLabel htmlFor="public-description">Description</FieldLabel>
						<Input
							id="public-description"
							placeholder="Shown in the public catalogue"
							value={draft.data.description || ""}
							onChange={(event) => update("description", event.target.value)}
						/>
					</Field>
				</div>
				<EditorSection
					title="Link to a catalogue song"
					summary={
						draft.data.songId && draft.data.songId !== draft.id
							? "Linked to an existing song"
							: "Not linked · new song"
					}
					defaultOpen={
						draft.data.reviewRequired && draft.data.title !== "Untitled song"
					}
				>
					<div className="space-y-3">
						<p className="text-xs text-muted-foreground">
							If this is another version of a song that already exists, link it
							so both versions are grouped together.
						</p>
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
				</EditorSection>
				<EditorSection title="My performance settings" summary="Private to you">
					<div className="grid gap-3 sm:grid-cols-2">
						<Field>
							<FieldLabel>I play it in</FieldLabel>
							<KeySelect
								value={draft.data.performanceKey || draft.data.key}
								onChange={(key) => update("performanceKey", key)}
							/>
						</Field>
						<Field>
							<FieldLabel>With capo</FieldLabel>
							<CapoSelect
								value={draft.data.performanceCapo ?? draft.data.sourceCapo}
								onChange={(capo) => update("performanceCapo", capo)}
							/>
						</Field>
						<Field className="sm:col-span-2">
							<FieldLabel htmlFor="private-notes">Rehearsal notes</FieldLabel>
							<Textarea
								id="private-notes"
								placeholder="Only you see these"
								value={draft.data.privateNotes || ""}
								onChange={(event) => update("privateNotes", event.target.value)}
							/>
						</Field>
						<label
							htmlFor="preferred-arrangement"
							className="flex items-center gap-3 text-sm sm:col-span-2"
						>
							<Switch
								id="preferred-arrangement"
								checked={!!draft.data.preferred}
								onCheckedChange={(preferred) => update("preferred", preferred)}
							/>
							Use this version by default when adding the song to a setlist
						</label>
					</div>
				</EditorSection>
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
