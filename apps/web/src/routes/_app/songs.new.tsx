import { normalizeSheet } from "@chords/song-core";
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
import { Link2, PenLine, Search } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "#/components/page-header";
import { useApp } from "#/features/app-context";
import { api } from "#/lib/songs";

export const Route = createFileRoute("/_app/songs/new")({ component: NewSong });

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
	const importPage = (target: string, rendered = false) =>
		run(async () => {
			const imported = await api<{
				title: string;
				content: string;
				rawSource: string;
				sourceUrl: string;
				warnings: string[];
			}>("/api/import", { url: target, rendered });
			await createSong(imported);
			if (imported.warnings.length) toast.warning(imported.warnings.join(" "));
		});
	return (
		<>
			<PageHeader title="Add song">
				<Button
					variant="outline"
					size="sm"
					disabled={busy}
					onClick={() => void run(() => createSong())}
				>
					<PenLine /> Blank song
				</Button>
			</PageHeader>
			<div className="w-full max-w-3xl p-4">
				<Tabs defaultValue="paste">
					<TabsList>
						<TabsTrigger value="paste">Paste</TabsTrigger>
						<TabsTrigger value="link">Link</TabsTrigger>
						<TabsTrigger value="file">File</TabsTrigger>
					</TabsList>
					<TabsContent value="paste" className="mt-4">
						<FieldGroup>
							<Field>
								<FieldLabel htmlFor="paste">Chord sheet</FieldLabel>
								<Textarea
									id="paste"
									rows={12}
									className="font-mono"
									placeholder={"Verse 1\nD         G\nLyrics go here…"}
									value={text}
									onChange={(event) => setText(event.target.value)}
								/>
								<FieldDescription>
									Plain text or ChordPro. You can review it before playing.
								</FieldDescription>
							</Field>
							<Button
								disabled={busy || !text.trim()}
								onClick={() =>
									void run(() =>
										createSong({
											content: normalizeSheet(text).content,
											rawSource: text,
										}),
									)
								}
							>
								{busy ? <Spinner /> : null} Convert
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
									{online ? (
										<>
											Page empty?{" "}
											<button
												type="button"
												className="underline underline-offset-4"
												disabled={busy || !url}
												onClick={() => void importPage(url, true)}
											>
												Try the rendered page
											</button>
										</>
									) : (
										"Importing needs a connection."
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
											.then((content) =>
												createSong({
													content: normalizeSheet(content).content,
													rawSource: content,
												}),
											)
											.catch(() => toast.error("Could not read this file."));
									}}
								/>
							</Field>
						</FieldGroup>
					</TabsContent>
				</Tabs>
			</div>
		</>
	);
}
