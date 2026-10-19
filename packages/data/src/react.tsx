import { useLiveQuery } from "@tanstack/react-db";
import {
	createContext,
	use,
	useContext,
	useEffect,
	useSyncExternalStore,
} from "react";
import {
	createSongbookStore,
	type SongbookStore,
	type SongRecord,
} from "./index";

const Context = createContext<SongbookStore | null>(null);

type Opened =
	| { store: SongbookStore; error?: undefined }
	| { store?: undefined; error: string };
const opened = new Map<
	string,
	{ store: SongbookStore; promise: Promise<Opened> }
>();

function open(account: string) {
	let entry = opened.get(account);
	if (!entry) {
		const store = createSongbookStore(account);
		const promise = store.init().then(
			(): Opened => ({ store }),
			(reason): Opened => ({ error: String(reason) }),
		);
		entry = { store, promise };
		opened.set(account, entry);
	}
	return entry;
}

/** Suspends until the account's local database is open. */
export function SongbookProvider({
	account,
	children,
}: {
	account: string;
	children: React.ReactNode;
}) {
	const result = use(open(account).promise);
	useEffect(() => {
		for (const [key, entry] of opened) {
			if (key === account) continue;
			entry.store.dispose();
			opened.delete(key);
		}
	}, [account]);
	useEffect(() => {
		if (!result.store) return;
		const { store } = result;
		void store.sync();
		const sync = () => void store.sync();
		window.addEventListener("online", sync);
		window.addEventListener("focus", sync);
		const interval = window.setInterval(sync, 30_000);
		return () => {
			window.clearInterval(interval);
			window.removeEventListener("online", sync);
			window.removeEventListener("focus", sync);
		};
	}, [result]);
	if (!result.store)
		return (
			<main className="flex min-h-svh flex-col items-center justify-center gap-2 p-6 text-center">
				<h1 className="font-semibold text-lg">Could not open your songbook</h1>
				<p className="text-muted-foreground text-sm">{result.error}</p>
				<p className="text-muted-foreground text-sm">
					Allow browser storage, then reload this page.
				</p>
			</main>
		);
	return <Context.Provider value={result.store}>{children}</Context.Provider>;
}
export function useSongbook() {
	const store = useContext(Context);
	if (!store) throw new Error("SongbookProvider is missing");
	const { data } = useLiveQuery((query) =>
		query.from({ record: store.records }),
	);
	const status = useSyncExternalStore(
		store.subscribe,
		store.getStatus,
		store.getStatus,
	);
	const rows: SongRecord[] = data;
	return { store, records: rows, ...status };
}
