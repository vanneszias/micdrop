import type { Arrangement } from "@chords/data";
import {
	CAPO_FRETS,
	KEYS,
	normalizeSheet,
	sheetDiagnostics,
} from "@chords/song-core";
import { SongSheet } from "@chords/song-ui";
import { Button } from "@chords/ui/components/button";
import { Input } from "@chords/ui/components/input";
import { Textarea } from "@chords/ui/components/textarea";
import { ArrowLeft, Check, Columns2, Plus, Save } from "lucide-react";
import { useDeferredValue, useEffect, useRef, useState } from "react";

export function Editor({
	arrangement,
	save,
	close,
}: {
	arrangement: Arrangement;
	save: (value: Arrangement) => Promise<void>;
	close: () => void;
}) {
	const [draft, setDraft] = useState(arrangement);
	const [status, setStatus] = useState("");
	const [error, setError] = useState("");
	const [preview, setPreview] = useState(true);
	const text = useRef<HTMLTextAreaElement>(null);
	const lastSaved = useRef(JSON.stringify(arrangement.data));
	const content = useDeferredValue(draft.data.content);
	const diagnostics = sheetDiagnostics(content);
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
					setStatus("Saved on device");
					setError("");
				})
				.catch((reason) => setError(String(reason)));
		}, 900);
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
		setStatus("Saving…");
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
	async function finish() {
		try {
			await save(draft);
			close();
		} catch (reason) {
			setError(String(reason));
		}
	}
	return (
		<section className="editor-screen">
			<div className="page-heading">
				<div>
					<button
						type="button"
						className="back-link"
						onClick={() => void finish()}
					>
						<ArrowLeft size={16} /> Songbook
					</button>
					<h1>Edit arrangement</h1>
				</div>
				<div className="actions">
					<span className="save-status">
						<Check size={14} />
						{status || "Saved on device"}
					</span>
					<Button
						variant="outline"
						onClick={() => setPreview((value) => !value)}
					>
						<Columns2 size={16} /> Preview
					</Button>
					<Button
						onClick={() => void finish()}
						disabled={!draft.data.title.trim()}
					>
						<Save size={16} /> Done
					</Button>
				</div>
			</div>
			{error ? (
				<p role="alert" className="error-message">
					{error}
				</p>
			) : null}
			<div className="metadata-grid">
				<label>
					Song title
					<Input
						value={draft.data.title}
						onChange={(event) => update("title", event.target.value)}
					/>
				</label>
				<label>
					Artist
					<Input
						value={draft.data.artist}
						onChange={(event) => update("artist", event.target.value)}
					/>
				</label>
				<label>
					Written key
					<select
						value={draft.data.key}
						onChange={(event) => update("key", event.target.value)}
					>
						{KEYS.map((key) => (
							<option key={key}>{key}</option>
						))}
					</select>
				</label>
				<label>
					Source capo
					<select
						value={draft.data.sourceCapo}
						onChange={(event) =>
							update("sourceCapo", Number(event.target.value))
						}
					>
						{CAPO_FRETS.map((i) => (
							<option key={i} value={i}>
								{i === 0 ? "None" : `Fret ${i}`}
							</option>
						))}
					</select>
				</label>
				<label>
					Tags
					<Input
						value={draft.data.tags.join(", ")}
						onChange={(event) =>
							update(
								"tags",
								event.target.value.split(",").map((tag) => tag.trim()),
							)
						}
						placeholder="Worship, acoustic…"
					/>
				</label>
			</div>
			<div className={`editor-columns ${preview ? "" : "without-preview"}`}>
				<div className="editor-source">
					<div className="editor-toolbar">
						<span>Chord sheet</span>
						<div className="actions">
							<Button variant="ghost" size="sm" onClick={() => insert("[D]")}>
								<Plus size={14} /> Chord
							</Button>
							<Button
								variant="ghost"
								size="sm"
								onClick={() =>
									insert("\n{start_of_chorus: Chorus}\n\n{end_of_chorus}\n")
								}
							>
								Section
							</Button>
							<Button
								variant="ghost"
								size="sm"
								onClick={() => insert("\n{comment: Play softly}\n")}
							>
								Note
							</Button>
						</div>
					</div>
					<Textarea
						ref={text}
						className="chord-editor"
						value={draft.data.content}
						onChange={(event) => update("content", event.target.value)}
						spellCheck={false}
						aria-label="Chord sheet text"
					/>
					<div className="editor-help">
						<span>
							Put chords before their syllable: <code>[D]Hello [G]world</code>
						</span>
						<Button
							variant="outline"
							size="sm"
							onClick={() =>
								update("content", normalizeSheet(draft.data.content).content)
							}
						>
							Convert pasted text
						</Button>
					</div>
					{diagnostics.map((message) => (
						<p className="diagnostic" key={message}>
							{message}
						</p>
					))}
					{draft.data.sourceUrl ? (
						<a
							className="source-link"
							href={draft.data.sourceUrl}
							target="_blank"
							rel="noreferrer"
						>
							Original source ↗
						</a>
					) : null}
				</div>
				{preview ? (
					<div className="editor-preview">
						<div className="eyebrow">Live preview</div>
						<h2>{draft.data.title}</h2>
						<p className="muted">{draft.data.artist}</p>
						<SongSheet content={content} fontSize={19} />
					</div>
				) : null}
			</div>
		</section>
	);
}
