import type { Arrangement, Setlist, SongRecord } from "@chords/data";
import { useSongbook } from "@chords/data/react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import { toast } from "sonner";
import { reportClientError } from "#/integrations/sentry/client";
import { api, type Band, freshArrangement } from "#/lib/songs";

type User = {
	name: string;
	email: string;
	emailVerified: boolean;
	id: string;
	role?: string | null;
};
type App = ReturnType<typeof useSongbook> & {
	account: string;
	online: boolean;
	user?: User;
	owner: string;
	setOwner: (id: string) => void;
	bands: Band[];
	refetchBands: () => Promise<unknown>;
	arrangements: Arrangement[];
	songs: Arrangement[];
	setlists: Setlist[];
	busy: boolean;
	save: (row: SongRecord) => Promise<void>;
	saveMany: (rows: SongRecord[]) => Promise<void>;
	run: (fn: () => Promise<unknown>, success?: string) => Promise<boolean>;
	createSong: (data?: Partial<Arrangement["data"]>) => Promise<void>;
};

const Context = createContext<App | null>(null);

export function AppProvider({
	account,
	online,
	user,
	children,
}: {
	account: string;
	online: boolean;
	user?: User;
	children: React.ReactNode;
}) {
	const songbook = useSongbook();
	const { store, records } = songbook;
	const navigate = useNavigate();
	const ownerKey = `chords:owner:${account}`;
	const [owner, setOwnerState] = useState(
		() =>
			(typeof localStorage === "undefined"
				? null
				: localStorage.getItem(ownerKey)) || account,
	);
	const setOwner = useCallback(
		(id: string) => {
			setOwnerState(id);
			if (id === account) localStorage.removeItem(ownerKey);
			else localStorage.setItem(ownerKey, id);
		},
		[account, ownerKey],
	);
	const [busy, setBusy] = useState(false);
	const [cachedBands, setCachedBands] = useState<Band[]>(() => {
		try {
			return typeof localStorage === "undefined"
				? []
				: JSON.parse(localStorage.getItem(`chords:bands:${account}`) || "[]");
		} catch {
			return [];
		}
	});
	const bandsQuery = useQuery({
		queryKey: ["bands", account],
		queryFn: () => api<{ bands: Band[] }>("/api/bands"),
		enabled: account !== "local" && online,
	});
	useEffect(() => {
		if (bandsQuery.data) {
			setCachedBands(bandsQuery.data.bands);
			localStorage.setItem(
				`chords:bands:${account}`,
				JSON.stringify(bandsQuery.data.bands),
			);
		}
	}, [bandsQuery.data, account]);
	useEffect(() => {
		// Fall back to Personal when the remembered band is gone (left or deleted).
		if (
			owner !== account &&
			bandsQuery.isSuccess &&
			!bandsQuery.data.bands.some((band) => band.id === owner)
		)
			setOwner(account);
	}, [owner, account, bandsQuery.isSuccess, bandsQuery.data, setOwner]);
	const arrangements = useMemo(
		() =>
			records.filter(
				(row): row is Arrangement =>
					row.kind === "arrangement" && !row.archived,
			),
		[records],
	);
	const songs = useMemo(
		() =>
			arrangements
				.filter((row) => row.owner === owner)
				.sort((a, b) => a.data.title.localeCompare(b.data.title)),
		[arrangements, owner],
	);
	const setlists = useMemo(
		() =>
			records.filter(
				(row): row is Setlist =>
					row.kind === "setlist" && !row.archived && row.owner === owner,
			),
		[records, owner],
	);
	const save = useCallback(
		async (row: SongRecord) => {
			if (row.kind === "arrangement" && row.data.preferred) {
				const others = arrangements.filter(
					(song) =>
						song.owner === row.owner &&
						song.id !== row.id &&
						(song.data.songId || song.id) === (row.data.songId || row.id) &&
						song.data.preferred,
				);
				await store.saveMany([
					...others.map((song) => ({
						...song,
						data: { ...song.data, preferred: false },
					})),
					row,
				]);
			} else await store.save(row);
			void store.sync();
		},
		[store, arrangements],
	);
	const saveMany = useCallback(
		async (rows: SongRecord[]) => {
			await store.saveMany(rows);
			void store.sync();
		},
		[store],
	);
	const run = useCallback(
		async (fn: () => Promise<unknown>, success?: string) => {
			setBusy(true);
			try {
				await fn();
				if (success) toast.success(success);
				return true;
			} catch (reason) {
				reportClientError(reason, "app.action");
				toast.error(reason instanceof Error ? reason.message : String(reason));
				return false;
			} finally {
				setBusy(false);
			}
		},
		[],
	);
	const createSong = useCallback(
		async (data?: Partial<Arrangement["data"]>) => {
			const row = freshArrangement(owner, {
				...data,
				draft: true,
				reviewRequired: true,
			});
			await save(row);
			await navigate({ to: "/songs/$id/edit", params: { id: row.id } });
		},
		[owner, save, navigate],
	);
	const value: App = {
		...songbook,
		account,
		online,
		user,
		owner,
		setOwner,
		bands: bandsQuery.data?.bands ?? cachedBands,
		refetchBands: bandsQuery.refetch,
		arrangements,
		songs,
		setlists,
		busy,
		save,
		saveMany,
		run,
		createSong,
	};
	return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useApp() {
	const value = useContext(Context);
	if (!value) throw new Error("AppProvider is missing");
	return value;
}
