import { useLiveQuery } from "@tanstack/react-db";
import {
	createContext,
	useContext,
	useEffect,
	useState,
	useSyncExternalStore,
} from "react";
import {
	createSongbookStore,
	type SongbookStore,
	type SongRecord,
} from "./index";

const Context = createContext<SongbookStore | null>(null);
export function SongbookProvider({
	account,
	children,
}: {
	account: string;
	children: React.ReactNode;
}) {
	const [store, setStore] = useState<SongbookStore | null>(null);
	const [error, setError] = useState("");
	useEffect(() => {
		let active = true;
		const next = createSongbookStore(account);
		void next
			.init()
			.then(() => {
				if (active) {
					setStore(next);
					void next.sync();
				}
			})
			.catch((reason) => {
				if (active) setError(String(reason));
			});
		const sync = () => void next.sync();
		window.addEventListener("online", sync);
		window.addEventListener("focus", sync);
		const interval = window.setInterval(sync, 30_000);
		return () => {
			active = false;
			setStore(null);
			next.dispose();
			window.clearInterval(interval);
			window.removeEventListener("online", sync);
			window.removeEventListener("focus", sync);
		};
	}, [account]);
	if (error)
		return (
			<main className="startup">
				<h1>Could not open your songbook</h1>
				<p>{error}</p>
				<p>Allow browser storage, then reload this page.</p>
			</main>
		);
	if (!store)
		return (
			<main className="startup" aria-busy="true">
				Opening your songbook…
			</main>
		);
	return <Context.Provider value={store}>{children}</Context.Provider>;
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
