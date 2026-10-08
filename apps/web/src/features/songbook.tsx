import type { Arrangement, Setlist, SongRecord } from "@chords/data";
import { SongbookProvider, useSongbook } from "@chords/data/react";
import {
	EXAMPLE,
	exportChordPro,
	KEYS,
	keyDistance,
	normalizeSheet,
} from "@chords/song-core";
import { SongSheet } from "@chords/song-ui";
import { Badge } from "@chords/ui/components/badge";
import { Button } from "@chords/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@chords/ui/components/dialog";
import { Input } from "@chords/ui/components/input";
import { Textarea } from "@chords/ui/components/textarea";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
	ArrowDown,
	ArrowUp,
	BookOpen,
	Check,
	ChevronDown,
	Cloud,
	Copy,
	Download,
	ExternalLink,
	Globe2,
	Guitar,
	ListMusic,
	LoaderCircle,
	LogOut,
	Music2,
	Plus,
	Search,
	Settings2,
	Trash2,
	Users,
	WifiOff,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { authClient } from "#/lib/auth-client";
import { Editor } from "./editor";
import { Player } from "./player";
import { ThemeToggle } from "./theme-toggle";

type Band = {
	id: string;
	name: string;
	role: string;
	members: { id: string; name: string; email: string; role: string }[];
};
type Publication = {
	id: string;
	record_id: string;
	data: Arrangement["data"];
	score: number;
	upvotes: number;
	downvotes: number;
	myVote: number;
};
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
function freshArrangement(
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

export function Songbook() {
	const { data: session, isPending, error } = authClient.useSession();
	const [cachedAccount, setCachedAccount] = useState("local");
	const [online, setOnline] = useState(true);
	useEffect(() => {
		setCachedAccount(localStorage.getItem("chords:account") || "local");
		const update = () => setOnline(navigator.onLine);
		update();
		window.addEventListener("online", update);
		window.addEventListener("offline", update);
		return () => {
			window.removeEventListener("online", update);
			window.removeEventListener("offline", update);
		};
	}, []);
	useEffect(() => {
		if (session?.user.id) {
			localStorage.setItem("chords:account", session.user.id);
			setCachedAccount(session.user.id);
		}
	}, [session?.user.id]);
	const account =
		session?.user.id ||
		(!online || isPending || error ? cachedAccount : "local");
	return (
		<>
			<SongbookProvider key={account} account={account}>
				<Workspace account={account} online={online} user={session?.user} />
			</SongbookProvider>
			<AppUpdate />
		</>
	);
}

function AppUpdate() {
	const [update, setUpdate] = useState<(() => void) | null>(null);
	useEffect(() => {
		if (import.meta.env.DEV || !("serviceWorker" in navigator)) return;
		void navigator.serviceWorker
			.register("/sw.js")
			.then((registration) => {
				const ready = () => {
					if (!registration.waiting || !navigator.serviceWorker.controller)
						return;
					setUpdate(() => () => {
						navigator.serviceWorker.addEventListener(
							"controllerchange",
							() => window.location.reload(),
							{ once: true },
						);
						registration.waiting?.postMessage({ type: "SKIP_WAITING" });
					});
				};
				ready();
				registration.addEventListener("updatefound", () =>
					registration.installing?.addEventListener("statechange", ready),
				);
			})
			.catch(() => {
				/* The next online visit retries offline installation. */
			});
	}, []);
	return update ? (
		<div className="pwa-update">
			A new app version is ready.
			<Button size="sm" onClick={update}>
				Reload app
			</Button>
			<Button variant="ghost" size="sm" onClick={() => setUpdate(null)}>
				Later
			</Button>
		</div>
	) : null;
}

function Workspace({
	account,
	online,
	user,
}: {
	account: string;
	online: boolean;
	user?: { name: string; email: string; id: string };
}) {
	const {
		store,
		records,
		pending,
		syncing,
		conflicts,
		error: syncError,
	} = useSongbook();
	const queryClient = useQueryClient();
	const [section, setSection] = useState("library");
	const [owner, setOwner] = useState(account);
	const [search, setSearch] = useState("");
	const [editing, setEditing] = useState<Arrangement | null>(null);
	const [playing, setPlaying] = useState<{
		id: string;
		setlistId?: string;
		index?: number;
	} | null>(null);
	const [selectedList, setSelectedList] = useState<string | null>(null);
	const [dialog, setDialog] = useState<"import" | "account" | "band" | null>(
		null,
	);
	const [message, setMessage] = useState("");
	const [error, setError] = useState("");
	const [importUrl, setImportUrl] = useState("");
	const [importText, setImportText] = useState("");
	const [busy, setBusy] = useState(false);
	const [webSearch, setWebSearch] = useState("");
	const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
	const [authEmail, setAuthEmail] = useState("");
	const [authPassword, setAuthPassword] = useState("");
	const [authName, setAuthName] = useState("");
	const bands = useQuery({
		queryKey: ["bands", account],
		queryFn: () => api<{ bands: Band[] }>("/api/bands"),
		enabled: account !== "local" && online,
	});
	const publications = useQuery({
		queryKey: ["publications", search],
		queryFn: () =>
			api<{ publications: Publication[] }>(
				`/api/publications?q=${encodeURIComponent(search)}`,
			),
		enabled: section === "public" && online,
	});
	const web = useQuery({
		queryKey: ["web", webSearch],
		queryFn: () =>
			api<{ results: { title: string; url: string; description: string }[] }>(
				`/api/search?q=${encodeURIComponent(webSearch)}`,
			),
		enabled: section === "web" && !!webSearch && online,
		retry: false,
	});
	const arrangements = records.filter(
		(row): row is Arrangement => row.kind === "arrangement" && !row.archived,
	);
	const setlists = records.filter(
		(row): row is Setlist =>
			row.kind === "setlist" && !row.archived && row.owner === owner,
	);
	const visibleSongs = useMemo(
		() =>
			arrangements
				.filter(
					(row) =>
						row.owner === owner &&
						`${row.data.title} ${row.data.artist} ${row.data.tags.join(" ")} ${row.data.content}`
							.toLowerCase()
							.includes(search.toLowerCase()),
				)
				.sort((a, b) => a.data.title.localeCompare(b.data.title)),
		[arrangements, owner, search],
	);
	const save = useCallback(
		async (row: SongRecord) => {
			await store.save(row);
			void store.sync();
		},
		[store],
	);
	async function action(fn: () => Promise<unknown>, success?: string) {
		setError("");
		setBusy(true);
		try {
			await fn();
			if (success) setMessage(success);
		} catch (reason) {
			setError(reason instanceof Error ? reason.message : String(reason));
		} finally {
			setBusy(false);
		}
	}
	useEffect(() => {
		if (!message) return;
		const timer = setTimeout(() => setMessage(""), 5000);
		return () => clearTimeout(timer);
	}, [message]);
	async function createSong(data?: Partial<Arrangement["data"]>) {
		const row = freshArrangement(owner, data);
		await save(row);
		setEditing(row);
		setDialog(null);
	}
	async function importPage(rendered = false) {
		await action(async () => {
			const imported = await api<{
				title: string;
				content: string;
				rawSource: string;
				sourceUrl: string;
				warnings: string[];
			}>("/api/import", { url: importUrl, rendered });
			await createSong(imported);
			if (imported.warnings.length) setMessage(imported.warnings.join(" "));
		});
	}
	const activeList = setlists.find((row) => row.id === selectedList);
	const playingList = setlists.find((row) => row.id === playing?.setlistId);
	const entry = playingList?.data.entries[playing?.index || 0];
	const playingSong = arrangements.find((row) => row.id === playing?.id);
	if (editing)
		return (
			<Editor
				key={editing.id}
				arrangement={editing}
				save={save}
				close={() => setEditing(null)}
			/>
		);
	if (playingSong)
		return (
			<Player
				account={account}
				key={`${playingSong.id}-${playing?.index}`}
				arrangement={playingSong}
				performanceKey={entry?.key}
				notes={entry?.notes}
				close={() => setPlaying(null)}
				previous={
					playingList && (playing?.index || 0) > 0
						? () => {
								const i = (playing?.index || 0) - 1;
								setPlaying({
									id: playingList.data.entries[i].arrangementId,
									setlistId: playingList.id,
									index: i,
								});
							}
						: undefined
				}
				next={
					playingList &&
					(playing?.index || 0) < playingList.data.entries.length - 1
						? () => {
								const i = (playing?.index || 0) + 1;
								setPlaying({
									id: playingList.data.entries[i].arrangementId,
									setlistId: playingList.id,
									index: i,
								});
							}
						: undefined
				}
			/>
		);
	return (
		<div className="app-shell">
			<aside className="sidebar">
				<button
					type="button"
					className="wordmark"
					onClick={() => setSection("library")}
				>
					<span className="brand-icon">
						<Music2 size={22} />
					</span>
					chords<span className="wordmark-dot">.</span>
				</button>
				<div className="workspace-picker">
					<span className="eyebrow">Your workspace</span>
					<div className="select-wrap">
						<select
							aria-label="Library workspace"
							value={owner}
							onChange={(event) => {
								setOwner(event.target.value);
								setSelectedList(null);
							}}
						>
							<option value={account}>Personal songbook</option>
							{bands.data?.bands.map((band) => (
								<option key={band.id} value={band.id}>
									{band.name}
								</option>
							))}
						</select>
						<ChevronDown size={14} />
					</div>
				</div>
				<nav aria-label="Main navigation">
					{[
						{ id: "library", label: "Song library", icon: BookOpen },
						{ id: "setlists", label: "Setlists", icon: ListMusic },
						{ id: "bands", label: "Bands", icon: Users },
						{ id: "public", label: "Community", icon: Globe2 },
						{ id: "web", label: "Search the web", icon: Search },
					].map((item) => (
						<button
							type="button"
							key={item.id}
							className={`nav-item ${section === item.id ? "active" : ""}`}
							onClick={() => {
								setSection(item.id);
								setSearch("");
							}}
						>
							<item.icon size={19} />
							{item.label}
							{item.id === "library" ? (
								<span className="nav-count">
									{arrangements.filter((row) => row.owner === owner).length}
								</span>
							) : null}
						</button>
					))}
				</nav>
				<div className="sidebar-bottom">
					<div className="sync-indicator">
						{online ? <Cloud size={16} /> : <WifiOff size={16} />}
						<span>
							{!online
								? "Working offline"
								: syncing
									? "Synchronizing…"
									: account === "local"
										? "Saved on this device"
										: pending
											? `${pending} pending changes`
											: "All changes synced"}
						</span>
					</div>
					<Button
						className="account-button"
						variant="ghost"
						onClick={() => setDialog("account")}
					>
						<span className="avatar">{user?.name?.[0] || "Y"}</span>
						<span>
							{user?.name || "Your songbook"}
							<small>{user ? "Account settings" : "Sign in to sync"}</small>
						</span>
						<Settings2 size={16} />
					</Button>
				</div>
			</aside>
			<main className="main-content">
				<header className="topbar">
					<span>
						{owner === account
							? "Personal songbook"
							: bands.data?.bands.find((band) => band.id === owner)?.name}
					</span>
					<div className="actions">
						<span className="private-label">
							{owner === account
								? "Private by default"
								: "Shared with your band"}
						</span>
						<ThemeToggle />
						<Button
							variant="outline"
							size="sm"
							onClick={() => void action(() => store.sync(), "Sync checked")}
							disabled={!online || account === "local"}
						>
							<Cloud size={15} /> Sync
						</Button>
						<Button
							className="mobile-account"
							variant="ghost"
							size="sm"
							onClick={() => setDialog("account")}
						>
							Account
						</Button>
					</div>
				</header>
				<div className="content-wrap">
					{error || syncError ? (
						<div role="alert" className="error-message">
							{error || syncError}
							<button
								type="button"
								onClick={() => {
									setError("");
									void store.sync();
								}}
							>
								Retry
							</button>
						</div>
					) : null}
					{message ? (
						<output className="success-message">
							<Check size={16} />
							{message}
						</output>
					) : null}
					{conflicts.map((conflict) => (
						<div className="conflict-panel" key={conflict.operation.record.id}>
							<h3>Two versions of “{conflict.operation.record.data.title}”</h3>
							<p>
								Compare both versions before choosing which should be shared.
							</p>
							<div className="conflict-columns">
								<div>
									<strong>Your version</strong>
									<pre>
										{conflict.operation.record.kind === "arrangement"
											? conflict.operation.record.data.content
											: JSON.stringify(
													conflict.operation.record.data.entries,
													null,
													2,
												)}
									</pre>
								</div>
								<div>
									<strong>Cloud version</strong>
									<pre>
										{conflict.server.kind === "arrangement"
											? conflict.server.data.content
											: JSON.stringify(conflict.server.data.entries, null, 2)}
									</pre>
								</div>
							</div>
							<div className="actions">
								<Button
									variant="outline"
									onClick={() =>
										void action(() =>
											store.resolve(conflict.operation.record.id, "server"),
										)
									}
								>
									Use cloud version
								</Button>
								<Button
									onClick={() =>
										void action(() =>
											store.resolve(conflict.operation.record.id, "local"),
										)
									}
								>
									Use my version
								</Button>
								<Button
									variant="outline"
									onClick={() =>
										void action(async () => {
											if (conflict.operation.record.kind === "arrangement") {
												await createSong({
													...conflict.operation.record.data,
													title: `${conflict.operation.record.data.title} — my version`,
												});
												await store.resolve(
													conflict.operation.record.id,
													"server",
												);
											}
										})
									}
								>
									Save a separate copy
								</Button>
							</div>
						</div>
					))}
					{section === "library" ? (
						<>
							<div className="page-heading">
								<div>
									<div className="eyebrow">Your music, in one place</div>
									<h1>Song library</h1>
									<p className="muted">
										Find your next song. Make it your own.
									</p>
								</div>
								<div className="actions">
									<Button
										variant="outline"
										onClick={() => {
											setError("");
											setDialog("import");
										}}
									>
										<Download size={16} /> Import chords
									</Button>
									<Button onClick={() => void action(() => createSong())}>
										<Plus size={16} /> New song
									</Button>
								</div>
							</div>
							<div className="library-tools">
								<div className="search-field">
									<Search size={18} />
									<Input
										aria-label="Search song library"
										placeholder="Search songs, artists, lyrics…"
										value={search}
										onChange={(event) => setSearch(event.target.value)}
									/>
								</div>
								<span className="muted">
									{visibleSongs.length}{" "}
									{visibleSongs.length === 1 ? "arrangement" : "arrangements"}
								</span>
							</div>
							{visibleSongs.length ? (
								<div className="song-table">
									<div className="song-table-heading">
										<span>Song / artist</span>
										<span>Key</span>
										<span>Tags</span>
										<span>Actions</span>
									</div>
									{visibleSongs.map((song) => (
										<div className="song-row" key={song.id}>
											<button
												type="button"
												className="song-title-button"
												onClick={() => setPlaying({ id: song.id })}
											>
												<span className="song-symbol">
													<Music2 size={20} />
												</span>
												<span>
													<strong>{song.data.title}</strong>
													<small>{song.data.artist || "Unknown artist"}</small>
												</span>
											</button>
											<span className="key-label">{song.data.key}</span>
											<div className="song-tags">
												{song.data.tags
													.filter(Boolean)
													.slice(0, 2)
													.map((tag) => (
														<Badge variant="secondary" key={tag}>
															{tag}
														</Badge>
													))}
											</div>
											<div className="row-actions">
												<Button
													variant="ghost"
													size="sm"
													onClick={() => setEditing(song)}
												>
													Edit
												</Button>
												<Button
													variant="ghost"
													size="icon"
													aria-label={`Copy ${song.data.title}`}
													onClick={() =>
														void action(() =>
															createSong({
																...song.data,
																title: `${song.data.title} — copy`,
																copiedFrom: song.id,
															}),
														)
													}
												>
													<Copy size={16} />
												</Button>
												<details className="song-menu">
													<summary
														aria-label={`More actions for ${song.data.title}`}
													>
														•••
													</summary>
													<div>
														<button
															type="button"
															onClick={() =>
																void action(async () => {
																	await store.sync();
																	await api("/api/publications", {
																		action: "publish",
																		recordId: song.id,
																	});
																	await queryClient.invalidateQueries({
																		queryKey: ["publications"],
																	});
																}, "Published arrangement")
															}
															disabled={account === "local"}
														>
															Publish / update public version
														</button>
														{owner !== account ? (
															<button
																type="button"
																onClick={() =>
																	void action(
																		() =>
																			save({
																				...freshArrangement(account, {
																					...song.data,
																					copiedFrom: song.id,
																				}),
																			}),
																		"Copied to your personal songbook",
																	)
																}
															>
																Copy to personal songbook
															</button>
														) : (
															bands.data?.bands.map((band) => (
																<button
																	type="button"
																	key={band.id}
																	onClick={() =>
																		void action(
																			() =>
																				save(
																					freshArrangement(band.id, {
																						...song.data,
																						copiedFrom: song.id,
																					}),
																				),
																			`Copied to ${band.name}`,
																		)
																	}
																>
																	Copy to {band.name}
																</button>
															))
														)}
														<button
															type="button"
															onClick={() => exportSheet(song)}
														>
															Export ChordPro
														</button>
														<button
															type="button"
															onClick={() =>
																void action(
																	() => save({ ...song, archived: true }),
																	"Arrangement archived",
																)
															}
														>
															Archive arrangement
														</button>
													</div>
												</details>
											</div>
										</div>
									))}
								</div>
							) : (
								<div className="empty-state">
									<div className="empty-staff">
										<Music2 size={44} />
									</div>
									<h2>
										{search
											? "No matching songs"
											: "A little space for your music"}
									</h2>
									<p>
										{search
											? "Try another title, artist, or lyric."
											: "Paste a chord sheet, import a page, or write your first arrangement."}
									</p>
									{!search ? (
										<div className="actions">
											<Button onClick={() => setDialog("import")}>
												Import your first song
											</Button>
											<Button
												variant="outline"
												onClick={() =>
													void action(() =>
														createSong({
															title: "Evening rehearsal",
															artist: "Original practice sheet",
															key: "D",
															content: EXAMPLE,
														}),
													)
												}
											>
												Try a practice sheet
											</Button>
										</div>
									) : null}
								</div>
							)}
							<div className="library-footer">
								<Guitar size={18} />
								<p>One chord sheet. Your key, your capo, your way to play.</p>
								<span>Available offline on this device</span>
							</div>
						</>
					) : null}
					{section === "setlists" ? (
						<>
							<div className="page-heading">
								<div>
									<div className="eyebrow">Ready for rehearsal</div>
									<h1>Setlists</h1>
									<p className="muted">
										Arrange the evening. Keep each song in the right key.
									</p>
								</div>
								<Button
									onClick={() =>
										void action(async () => {
											const row: Setlist = {
												id: crypto.randomUUID(),
												kind: "setlist",
												owner,
												version: 0,
												archived: false,
												updatedAt: new Date().toISOString(),
												data: { title: "New setlist", date: "", entries: [] },
											};
											await save(row);
											setSelectedList(row.id);
										})
									}
								>
									<Plus size={16} /> New setlist
								</Button>
							</div>
							<div className="setlist-layout">
								<div className="setlist-sidebar">
									{setlists.map((list) => (
										<button
											type="button"
											key={list.id}
											className={selectedList === list.id ? "selected" : ""}
											onClick={() => setSelectedList(list.id)}
										>
											<ListMusic size={18} />
											<span>
												{list.data.title}
												<small>
													{list.data.entries.length} songs{" "}
													{list.data.date ? `· ${list.data.date}` : ""}
												</small>
											</span>
										</button>
									))}
								</div>
								{activeList ? (
									<SetlistEditor
										list={activeList}
										songs={arrangements}
										available={arrangements.filter(
											(song) => song.owner === owner,
										)}
										save={save}
										play={(index) =>
											setPlaying({
												id: activeList.data.entries[index].arrangementId,
												setlistId: activeList.id,
												index,
											})
										}
										notify={setMessage}
									/>
								) : (
									<div className="empty-state">
										<ListMusic size={40} />
										<h2>Your next rehearsal starts here</h2>
										<p>Create or select a setlist to add songs.</p>
									</div>
								)}
							</div>
						</>
					) : null}
					{section === "public" ? (
						<>
							<div className="page-heading">
								<div>
									<div className="eyebrow">Made to be shared</div>
									<h1>Community songbook</h1>
									<p className="muted">
										Discover arrangements. Save a copy and make it your own.
									</p>
								</div>
							</div>
							<div className="search-field">
								<Search size={18} />
								<Input
									aria-label="Search community"
									placeholder="Search public arrangements…"
									value={search}
									onChange={(event) => setSearch(event.target.value)}
								/>
							</div>
							{publications.error ? (
								<p role="alert" className="error-message">
									{publications.error.message}
								</p>
							) : null}
							{publications.isFetching ? (
								<p className="muted">Searching arrangements…</p>
							) : null}
							<div className="public-grid">
								{publications.data?.publications.map((publication) => (
									<article className="publication-card" key={publication.id}>
										<div className="eyebrow">Key {publication.data.key}</div>
										<h2>{publication.data.title}</h2>
										<p className="muted">{publication.data.artist}</p>
										<div className="actions">
											<Button
												variant={
													publication.myVote === 1 ? "secondary" : "ghost"
												}
												size="icon"
												aria-label="Upvote"
												disabled={account === "local"}
												onClick={() =>
													void action(async () => {
														await api("/api/publications", {
															action: "vote",
															id: publication.id,
															value: publication.myVote === 1 ? 0 : 1,
														});
														await publications.refetch();
													})
												}
											>
												<ArrowUp size={17} />
											</Button>
											<strong>{publication.score}</strong>
											<Button
												variant={
													publication.myVote === -1 ? "secondary" : "ghost"
												}
												size="icon"
												aria-label="Downvote"
												disabled={account === "local"}
												onClick={() =>
													void action(async () => {
														await api("/api/publications", {
															action: "vote",
															id: publication.id,
															value: publication.myVote === -1 ? 0 : -1,
														});
														await publications.refetch();
													})
												}
											>
												<ArrowDown size={17} />
											</Button>
											<small className="muted">
												{publication.upvotes} up · {publication.downvotes} down
											</small>
										</div>
										<Button
											variant="outline"
											onClick={() =>
												void action(() =>
													createSong({
														...publication.data,
														copiedFrom: publication.id,
													}),
												)
											}
										>
											<Copy size={15} /> Save a copy
										</Button>
										{arrangements.some(
											(song) => song.id === publication.record_id,
										) ? (
											<Button
												variant="ghost"
												onClick={() =>
													void action(async () => {
														await api("/api/publications", {
															action: "unpublish",
															id: publication.id,
														});
														await publications.refetch();
													})
												}
											>
												Unpublish
											</Button>
										) : null}
									</article>
								))}
							</div>
							{publications.data?.publications.length === 0 ? (
								<div className="empty-state">
									<Globe2 size={40} />
									<h2>No published arrangements yet</h2>
									<p>
										Publish a song from your library to start the collection.
									</p>
								</div>
							) : null}
						</>
					) : null}
					{section === "web" ? (
						<>
							<div className="page-heading">
								<div>
									<div className="eyebrow">Bring your music home</div>
									<h1>Search the web</h1>
									<p className="muted">
										Find a chord page, then turn it into your own arrangement.
									</p>
								</div>
								<Button variant="outline" onClick={() => setDialog("import")}>
									Import a URL
								</Button>
							</div>
							<form
								className="web-search"
								onSubmit={(event) => {
									event.preventDefault();
									setWebSearch(search);
								}}
							>
								<div className="search-field">
									<Search size={18} />
									<Input
										aria-label="Search web"
										placeholder="Song title or artist…"
										value={search}
										onChange={(event) => setSearch(event.target.value)}
									/>
								</div>
								<Button disabled={!online || !search.trim()}>Search</Button>
							</form>
							{web.error ? (
								<p role="alert" className="error-message">
									{web.error.message}
								</p>
							) : null}
							{web.isFetching ? <p>Searching the web…</p> : null}
							<div className="web-results">
								{web.data?.results.map((result) => (
									<article key={result.url}>
										<a href={result.url} target="_blank" rel="noreferrer">
											<span className="eyebrow">
												{new URL(result.url).hostname}
											</span>
											<h2>
												{result.title}
												<ExternalLink size={15} />
											</h2>
										</a>
										<p className="muted">
											{result.description.replace(/<[^>]*>/g, "")}
										</p>
										<Button
											variant="outline"
											onClick={() => {
												setImportUrl(result.url);
												setDialog("import");
											}}
										>
											Import chords
										</Button>
									</article>
								))}
							</div>
						</>
					) : null}
					{section === "bands" ? (
						<>
							<div className="page-heading">
								<div>
									<div className="eyebrow">Play together</div>
									<h1>Your bands</h1>
									<p className="muted">
										Shared arrangements, setlists, and room for your own
										preferences.
									</p>
								</div>
								<Button
									disabled={account === "local"}
									onClick={() => setDialog("band")}
								>
									<Plus size={16} /> Create a band
								</Button>
							</div>
							{account === "local" ? (
								<div className="empty-state">
									<Users size={40} />
									<h2>A songbook for the whole band</h2>
									<p>Sign in to create a band and share your music.</p>
									<Button onClick={() => setDialog("account")}>Sign in</Button>
								</div>
							) : null}
							{bands.error ? (
								<p role="alert" className="error-message">
									{bands.error.message}
								</p>
							) : null}
							{bands.data?.bands.map((band) => (
								<BandCard
									key={band.id}
									band={band}
									changed={async () => {
										await bands.refetch();
										await store.sync();
									}}
									error={setError}
								/>
							))}
						</>
					) : null}
				</div>
			</main>
			<Dialog
				open={dialog !== null}
				onOpenChange={(open) => {
					if (!open) setDialog(null);
				}}
			>
				<DialogContent className="app-dialog">
					<DialogHeader>
						<DialogTitle>
							{dialog === "import"
								? "Bring in a chord sheet"
								: dialog === "band"
									? "Create a band"
									: user
										? "Your account"
										: "Your songbook, everywhere"}
						</DialogTitle>
						<DialogDescription>
							{dialog === "import"
								? "Import a webpage or paste text. You’ll review the result before playing."
								: dialog === "band"
									? "Start a shared library for your band."
									: "Local edits stay on this device. Sign in to sync them across devices."}
						</DialogDescription>
					</DialogHeader>
					{error ? (
						<p role="alert" className="error-message">
							{error}
						</p>
					) : null}
					{dialog === "import" ? (
						<div className="dialog-stack">
							<label>
								Chord-page URL
								<Input
									value={importUrl}
									onChange={(event) => setImportUrl(event.target.value)}
									placeholder="https://pnwchords.com/…"
									type="url"
								/>
							</label>
							<div className="actions">
								<Button
									disabled={busy || !importUrl || !online}
									onClick={() => void importPage()}
								>
									{busy ? (
										<LoaderCircle className="spin" size={16} />
									) : (
										<Download size={16} />
									)}{" "}
									Import page
								</Button>
								<Button
									variant="outline"
									disabled={busy || !importUrl || !online}
									onClick={() => void importPage(true)}
								>
									Try rendered page
								</Button>
							</div>
							<div className="dialog-divider">or paste your chord sheet</div>
							<Textarea
								aria-label="Paste chord text"
								placeholder={"Verse 1\nD         G\nLyrics go here…"}
								value={importText}
								onChange={(event) => setImportText(event.target.value)}
								rows={8}
							/>
							<Button
								disabled={busy || !importText.trim()}
								onClick={() =>
									void action(() =>
										createSong({
											content: normalizeSheet(importText).content,
											rawSource: importText,
										}),
									)
								}
							>
								Convert and review
							</Button>
							<label className="file-label">
								Or import a ChordPro/text file
								<input
									type="file"
									accept=".cho,.chopro,.crd,.pro,.txt"
									onChange={(event) => {
										const file = event.target.files?.[0];
										if (file && file.size <= 200_000)
											void file.text().then(setImportText);
										else setError("Choose a text file smaller than 200 KB.");
									}}
								/>
							</label>
						</div>
					) : null}
					{dialog === "account" ? (
						user ? (
							<div className="dialog-stack">
								<p>
									Signed in as <strong>{user.email}</strong>
								</p>
								<Button
									variant="outline"
									onClick={() =>
										void action(
											() => store.importLocal(),
											"Local arrangements copied into your account",
										)
									}
								>
									Import this device’s local songbook
								</Button>
								<Button
									variant="outline"
									onClick={() =>
										void action(async () => {
											await authClient.signOut();
											localStorage.removeItem("chords:account");
											window.location.reload();
										})
									}
								>
									<LogOut size={16} /> Sign out
								</Button>
							</div>
						) : (
							<form
								className="dialog-stack"
								onSubmit={(event) => {
									event.preventDefault();
									void action(async () => {
										const result =
											authMode === "signup"
												? await authClient.signUp.email({
														email: authEmail,
														password: authPassword,
														name: authName,
													})
												: await authClient.signIn.email({
														email: authEmail,
														password: authPassword,
													});
										if (result.error) throw new Error(result.error.message);
										setDialog(null);
									});
								}}
							>
								{authMode === "signup" ? (
									<label>
										Your name
										<Input
											value={authName}
											onChange={(event) => setAuthName(event.target.value)}
											required
											autoComplete="name"
										/>
									</label>
								) : null}
								<label>
									Email
									<Input
										type="email"
										value={authEmail}
										onChange={(event) => setAuthEmail(event.target.value)}
										required
										autoComplete="email"
									/>
								</label>
								<label>
									Password
									<Input
										type="password"
										value={authPassword}
										onChange={(event) => setAuthPassword(event.target.value)}
										required
										minLength={10}
										autoComplete={
											authMode === "signup"
												? "new-password"
												: "current-password"
										}
									/>
								</label>
								<Button disabled={busy}>
									{authMode === "signup" ? "Create account" : "Sign in"}
								</Button>
								<Button
									type="button"
									variant="outline"
									onClick={() =>
										void action(async () => {
											const result = await authClient.signIn.social({
												provider: "google",
												callbackURL: "/",
											});
											if (result.error)
												throw new Error(
													"Google sign-in needs OAuth credentials configured on the server.",
												);
										})
									}
								>
									Continue with Google
								</Button>
								<button
									type="button"
									className="text-link"
									onClick={() =>
										setAuthMode((value) =>
											value === "signin" ? "signup" : "signin",
										)
									}
								>
									{authMode === "signin"
										? "New here? Create an account"
										: "Already have an account? Sign in"}
								</button>
							</form>
						)
					) : null}
					{dialog === "band" ? (
						<form
							className="dialog-stack"
							onSubmit={(event) => {
								event.preventDefault();
								const form = new FormData(event.currentTarget);
								void action(async () => {
									await api("/api/bands", {
										action: "create",
										name: form.get("name"),
									});
									await bands.refetch();
									setDialog(null);
								});
							}}
						>
							<label>
								Band name
								<Input name="name" required maxLength={100} />
							</label>
							<Button disabled={busy}>Create band</Button>
						</form>
					) : null}
				</DialogContent>
			</Dialog>
		</div>
	);
}

function SetlistEditor({
	list,
	songs,
	available,
	save,
	play,
	notify,
}: {
	list: Setlist;
	songs: Arrangement[];
	available: Arrangement[];
	save: (row: SongRecord) => Promise<void>;
	play: (index: number) => void;
	notify: (value: string) => void;
}) {
	const [error, setError] = useState("");
	async function update(data: Setlist["data"]) {
		try {
			await save({ ...list, data });
			setError("");
		} catch (reason) {
			setError(String(reason));
		}
	}
	function move(index: number, delta: number) {
		const entries = [...list.data.entries];
		[entries[index], entries[index + delta]] = [
			entries[index + delta],
			entries[index],
		];
		void update({ ...list.data, entries });
	}
	return (
		<div className="setlist-editor">
			<div className="metadata-grid">
				<label>
					Setlist name
					<Input
						value={list.data.title}
						onChange={(event) =>
							void update({
								...list.data,
								title: event.target.value || "Untitled setlist",
							})
						}
					/>
				</label>
				<label>
					Date
					<Input
						type="date"
						value={list.data.date}
						onChange={(event) =>
							void update({ ...list.data, date: event.target.value })
						}
					/>
				</label>
			</div>
			{error ? (
				<p role="alert" className="error-message">
					{error}
				</p>
			) : null}
			<div className="actions">
				<Button disabled={!list.data.entries.length} onClick={() => play(0)}>
					Play setlist
				</Button>
				<Button
					variant="outline"
					onClick={() =>
						notify(
							"This setlist and its synchronized songs are saved on this device for offline playing and editing.",
						)
					}
				>
					<Download size={15} /> Available offline
				</Button>
				<Button
					variant="outline"
					onClick={() => {
						const popup = window.open("", "_blank");
						if (popup) {
							popup.document.title = list.data.title;
							for (const stylesheet of document.querySelectorAll(
								'link[rel="stylesheet"]',
							))
								popup.document.head.appendChild(stylesheet.cloneNode(true));
							const container = popup.document.createElement("main");
							popup.document.body.appendChild(container);
							flushSync(() =>
								createRoot(container).render(
									list.data.entries.map((entry) => {
										const song = songs.find(
											(value) => value.id === entry.arrangementId,
										);
										return song ? (
											<article
												key={entry.id}
												className="performance-sheet print-song"
											>
												<h1>{song.data.title}</h1>
												<p>
													{song.data.artist} · Key {entry.key}
												</p>
												<p>{entry.notes}</p>
												<SongSheet
													content={song.data.content}
													semitones={keyDistance(song.data.key, entry.key)}
												/>
											</article>
										) : (
											<p key={entry.id}>Arrangement unavailable</p>
										);
									}),
								),
							);
							void popup.document.fonts.ready.then(() =>
								popup.requestAnimationFrame(() => popup.print()),
							);
						}
					}}
				>
					Print setlist
				</Button>
			</div>
			<div className="setlist-entries">
				{list.data.entries.map((entry, index) => {
					const song = songs.find((value) => value.id === entry.arrangementId);
					return (
						// biome-ignore lint/a11y/noStaticElementInteractions: Drag reordering has equivalent labeled up/down buttons.
						<div
							className="setlist-entry"
							key={entry.id}
							draggable
							onDragStart={(event) =>
								event.dataTransfer.setData("text/plain", String(index))
							}
							onDragOver={(event) => event.preventDefault()}
							onDrop={(event) => {
								event.preventDefault();
								const from = Number(event.dataTransfer.getData("text/plain"));
								if (
									!Number.isInteger(from) ||
									from < 0 ||
									from >= list.data.entries.length
								)
									return;
								const entries = [...list.data.entries];
								const [item] = entries.splice(from, 1);
								entries.splice(index, 0, item);
								void update({ ...list.data, entries });
							}}
						>
							<span className="entry-number">{index + 1}</span>
							<div>
								<button
									type="button"
									className="text-link"
									disabled={!song}
									onClick={() => play(index)}
								>
									{song?.data.title || "Arrangement unavailable"}
								</button>
								<Input
									aria-label={`Notes for song ${index + 1}`}
									placeholder="Band notes…"
									value={entry.notes}
									onChange={(event) =>
										void update({
											...list.data,
											entries: list.data.entries.map((value) =>
												value.id === entry.id
													? { ...value, notes: event.target.value }
													: value,
											),
										})
									}
								/>
							</div>
							<label>
								Key
								<select
									value={entry.key}
									onChange={(event) =>
										void update({
											...list.data,
											entries: list.data.entries.map((value) =>
												value.id === entry.id
													? { ...value, key: event.target.value }
													: value,
											),
										})
									}
								>
									{KEYS.map((key) => (
										<option key={key}>{key}</option>
									))}
								</select>
							</label>
							<div className="actions">
								<Button
									variant="ghost"
									size="icon"
									aria-label="Move up"
									disabled={index === 0}
									onClick={() => move(index, -1)}
								>
									<ArrowUp size={15} />
								</Button>
								<Button
									variant="ghost"
									size="icon"
									aria-label="Move down"
									disabled={index === list.data.entries.length - 1}
									onClick={() => move(index, 1)}
								>
									<ArrowDown size={15} />
								</Button>
								<Button
									variant="ghost"
									size="icon"
									aria-label="Remove song"
									onClick={() =>
										void update({
											...list.data,
											entries: list.data.entries.filter(
												(value) => value.id !== entry.id,
											),
										})
									}
								>
									<Trash2 size={15} />
								</Button>
							</div>
						</div>
					);
				})}
			</div>
			<label>
				Add a song
				<select
					value=""
					onChange={(event) => {
						const song = available.find(
							(value) => value.id === event.target.value,
						);
						if (song)
							void update({
								...list.data,
								entries: [
									...list.data.entries,
									{
										id: crypto.randomUUID(),
										arrangementId: song.id,
										key: KEYS[
											(keyDistance("C", song.data.key) + song.data.sourceCapo) %
												12
										],
										notes: "",
									},
								],
							});
					}}
				>
					<option value="">Choose from your library…</option>
					{available.map((song) => (
						<option key={song.id} value={song.id}>
							{song.data.title}
						</option>
					))}
				</select>
			</label>
		</div>
	);
}
function BandCard({
	band,
	changed,
	error,
}: {
	band: Band;
	changed: () => Promise<void>;
	error: (value: string) => void;
}) {
	return (
		<article className="band-card">
			<div className="page-heading">
				<h2>{band.name}</h2>
				<Badge variant="secondary">{band.role}</Badge>
			</div>
			{band.members.map((member) => (
				<div className="band-member" key={member.id}>
					<span>
						<strong>{member.name}</strong>
						<small>{member.email}</small>
					</span>
					<span>{member.role}</span>
					{band.role === "owner" && member.role !== "owner" ? (
						<Button
							variant="ghost"
							size="icon"
							aria-label={`Remove ${member.name}`}
							onClick={() =>
								void api("/api/bands", {
									action: "remove",
									bandId: band.id,
									memberId: member.id,
								})
									.then(changed)
									.catch((reason) => error(String(reason)))
							}
						>
							<Trash2 size={15} />
						</Button>
					) : null}
				</div>
			))}
			{band.role === "owner" ? (
				<form
					className="band-add"
					onSubmit={(event) => {
						event.preventDefault();
						const form = new FormData(event.currentTarget);
						void api("/api/bands", {
							action: "add",
							bandId: band.id,
							email: form.get("email"),
							role: form.get("role"),
						})
							.then(changed)
							.catch((reason) => error(String(reason)));
					}}
				>
					<Input
						aria-label="Member email"
						name="email"
						type="email"
						placeholder="Member’s account email"
						required
					/>
					<select name="role" aria-label="Member role">
						<option value="editor">Editor</option>
						<option value="viewer">Viewer</option>
					</select>
					<Button variant="outline">Add member</Button>
				</form>
			) : null}
		</article>
	);
}
function exportSheet(song: Arrangement) {
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
