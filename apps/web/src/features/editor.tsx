import type { Arrangement } from "@chords/data";
import { normalizeSheet, sheetDiagnostics } from "@chords/song-core";
import { SongSheet } from "@chords/song-ui";
import { Button } from "@chords/ui/components/button";
import { Field, FieldLabel } from "@chords/ui/components/field";
import { Input } from "@chords/ui/components/input";
import { Textarea } from "@chords/ui/components/textarea";
import { Toggle } from "@chords/ui/components/toggle";
import { Link } from "@tanstack/react-router";
import { Check, Columns2, Wand2 } from "lucide-react";
import { useDeferredValue, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CapoSelect, KeySelect } from "#/components/key-select";
import { PageHeader } from "#/components/page-header";

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
	const [saved, setSaved] = useState(true);
	const [preview, setPreview] = useState(true);
	const text = useRef<HTMLTextAreaElement>(null);
	const lastSaved = useRef(JSON.stringify(arrangement.data));
	const content = useDeferredValue(draft.data.content);
	useEffect(() => {
		if (
			JSON.stringify(draft.data) === lastSaved.current ||
			!draft.data.title.trim()
		)
			return;
		const timer = window.setTimeout(() => {
			const snapshot = JSON.stringify(draft.data);
			void save(draft)
				.then(() => {
					lastSaved.current = snapshot;
					setSaved(true);
				})
				.catch((reason) => toast.error(String(reason)));
		}, 700);
		return () => window.clearTimeout(timer);
	}, [draft, save]);
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
					asChild
					onClick={() => void save(draft)}
					disabled={!draft.data.title.trim()}
				>
					<Link to="/songs/$id" params={{ id: arrangement.id }}>
						Done
					</Link>
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
