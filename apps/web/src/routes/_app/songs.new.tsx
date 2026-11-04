import {
	normalizeSheet,
	sheetMetadata,
	stripMetadata,
} from "@chords/song-core";
import { Button } from "@chords/ui/components/button";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@chords/ui/components/field";
import { Input } from "@chords/ui/components/input";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupInput,
} from "@chords/ui/components/input-group";
import {
	Item,
	ItemActions,
	ItemContent,
	ItemDescription,
	ItemGroup,
	ItemTitle,
} from "@chords/ui/components/item";
import { Spinner } from "@chords/ui/components/spinner";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@chords/ui/components/tabs";
import { Textarea } from "@chords/ui/components/textarea";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ClipboardPaste, FileText, Link2, PenLine, Search } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PageBody, PageHeader } from "#/components/page-header";
import { useApp } from "#/features/app-context";
import { api } from "#/lib/songs";

export const Route = createFileRoute("/_app/songs/new")({ component: NewSong });

function fromSheet(raw: string) {
	const content = normalizeSheet(raw).content;
	// The form fields own title, artist, key and capo; the raw import keeps the directives.
	return {
		...sheetMetadata(content),
		content: stripMetadata(content),
		rawSource: raw,
	};
}

function NewSong() {
	const { createSong, run, busy, online } = useApp();
	const [text, setText] = useState("");
	const [url, setUrl] = useState("");
	const [query, setQuery] = useState("");
	const [submitted, setSubmitted] = useState("");
	const web = useQuery({
		queryKey: ["web", submitted],
		queryFn: () =>
			api<{ results: { title: string; url: string; description: string }[] }>(
				`/api/search?q=${encodeURIComponent(submitted)}`,
			),
		enabled: !!submitted && online,
		retry: false,
	});
	const [failed, setFailed] = useState(false);
	const importPage = (target: string, rendered = false) =>
		run(async () => {
			setFailed(false);
			const imported = await api<{
				title: string;
				content: string;
				rawSource: string;
				sourceUrl: string;
				warnings: string[];
			}>("/api/import", { url: target, rendered }).catch((reason) => {
				setFailed(true);
				throw reason;
			});
			if (!imported.content.trim()) {
				setFailed(true);
				throw new Error("No chord sheet was found on that page.");
			}
			await createSong(imported);
			if (imported.warnings.length) toast.warning(imported.warnings.join(" "));
		});
	return (
		<>
			<PageHeader back pageTitle title="Add song" />
			<PageBody
				title="Add a song"
				description="Paste a chord sheet, import a page, or open a ChordPro file. You review everything before saving."
				actions={
					<Button
						variant="outline"
						size="sm"
						disabled={busy}
						onClick={() => void run(() => createSong())}
					>
						<PenLine /> Blank song
					</Button>
				}
			>
				<Tabs defaultValue="paste">
					<TabsList className="h-10 w-full sm:w-auto">
						<TabsTrigger value="paste" className="px-4">
							<ClipboardPaste /> Paste
						</TabsTrigger>
						<TabsTrigger value="link" className="px-4">
							<Link2 /> Link
						</TabsTrigger>
						<TabsTrigger value="file" className="px-4">
							<FileText /> File
						</TabsTrigger>
					</TabsList>
					<TabsContent value="paste" className="mt-4">
						<FieldGroup>
							<Field>
								<FieldLabel htmlFor="paste">Chord sheet</FieldLabel>
								<Textarea
									id="paste"
									rows={14}
									className="min-h-56 font-mono placeholder:text-muted-foreground/60 sm:min-h-[45vh]"
									placeholder={
										"Example:\n\n[Verse 1]\nG              C          G\nAmazing grace, how sweet the sound\n          Em      D\nThat saved a wretch like me"
									}
									value={text}
									onChange={(event) => setText(event.target.value)}
								/>
								<FieldDescription>
									Plain text or ChordPro. You can review it before playing.
								</FieldDescription>
							</Field>
							<Button
								className="self-end"
								disabled={busy || !text.trim()}
								onClick={() => void run(() => createSong(fromSheet(text)))}
							>
								{busy ? <Spinner /> : null} Convert and review
							</Button>
						</FieldGroup>
					</TabsContent>
					<TabsContent value="link" className="mt-4">
						<FieldGroup>
							<Field>
								<FieldLabel htmlFor="url">Page URL</FieldLabel>
								<InputGroup>
									<InputGroupAddon>
										<Link2 />
									</InputGroupAddon>
									<InputGroupInput
										id="url"
										type="url"
										placeholder="https://…"
										value={url}
										onChange={(event) => setUrl(event.target.value)}
									/>
									<InputGroupAddon align="inline-end">
										<InputGroupButton
											variant="default"
											disabled={busy || !url || !online}
											onClick={() => void importPage(url)}
										>
											{busy ? <Spinner /> : null} Import
										</InputGroupButton>
									</InputGroupAddon>
								</InputGroup>
								<FieldDescription>
									{!online ? (
										"Importing needs a connection."
									) : failed ? (
										<>
											Some sites draw their chords with scripts.{" "}
											<button
												type="button"
												className="underline underline-offset-4"
												disabled={busy || !url}
												onClick={() => void importPage(url, true)}
											>
												Load the page fully and try again
											</button>
										</>
									) : (
										"Paste a link to a page with a chord sheet, such as a song on a chords site."
									)}
								</FieldDescription>
							</Field>
							<form
								onSubmit={(event) => {
									event.preventDefault();
									setSubmitted(query.trim());
								}}
							>
								<Field>
									<FieldLabel htmlFor="search">Or search the web</FieldLabel>
									<InputGroup>
										<InputGroupAddon>
											<Search />
										</InputGroupAddon>
										<InputGroupInput
											id="search"
											placeholder="Song title or artist"
											value={query}
											onChange={(event) => setQuery(event.target.value)}
										/>
										<InputGroupAddon align="inline-end">
											<InputGroupButton
												type="submit"
												variant="secondary"
												disabled={!online || !query.trim() || web.isFetching}
											>
												{web.isFetching ? <Spinner /> : null} Search
											</InputGroupButton>
										</InputGroupAddon>
									</InputGroup>
								</Field>
							</form>
							{web.error ? (
								<p role="alert" className="text-sm text-destructive">
									{web.error.message}
								</p>
							) : null}
							{web.data?.results.length === 0 ? (
								<p className="text-sm text-muted-foreground">No results.</p>
							) : null}
							<ItemGroup className="gap-2">
								{web.data?.results.map((result) => (
									<Item key={result.url} variant="outline" size="sm">
										<ItemContent>
											<ItemTitle>{result.title}</ItemTitle>
											<ItemDescription>
												{new URL(result.url).hostname}
											</ItemDescription>
										</ItemContent>
										<ItemActions>
											<Button
												variant="outline"
												size="sm"
												disabled={busy}
												onClick={() => void importPage(result.url)}
											>
												Import
											</Button>
										</ItemActions>
									</Item>
								))}
							</ItemGroup>
						</FieldGroup>
					</TabsContent>
					<TabsContent value="file" className="mt-4">
						<FieldGroup>
							<Field>
								<FieldLabel htmlFor="file">ChordPro or text file</FieldLabel>
								<Input
									id="file"
									type="file"
									accept=".cho,.chopro,.crd,.pro,.txt"
									onChange={(event) => {
										const file = event.target.files?.[0];
										if (!file) return;
										if (file.size > 200_000)
											return void toast.error("Choose a file under 200 KB.");
										void file
											.text()
											.then((content) => createSong(fromSheet(content)))
											.catch(() => toast.error("Could not read this file."));
									}}
								/>
							</Field>
						</FieldGroup>
					</TabsContent>
				</Tabs>
			</PageBody>
		</>
	);
}
