import { Button } from "@chords/ui/components/button";
import { Spinner } from "@chords/ui/components/spinner";
import { useEffect } from "react";
import { authClient } from "#/lib/auth-client";
import { useApp } from "./app-context";

const PURGE = "chords:purge";

/** Whether the current session is an administrator acting as someone else. */
export function useImpersonator() {
	const { data } = authClient.useSession();
	return data?.session.impersonatedBy || undefined;
}

/**
 * Starts acting as another account. A full reload opens that account's songbook from scratch.
 */
export async function impersonate(userId: string) {
	const { error } = await authClient.admin.impersonateUser({ userId });
	if (error) throw new Error(error.message || "Could not impersonate.");
	window.location.assign("/songs");
}

/** Removes the songbook an ended impersonation left in this browser. */
export function usePurgeImpersonatedSongbook(account: string) {
	useEffect(() => {
		let target: string | null = null;
		try {
			target = localStorage.getItem(PURGE);
		} catch {
			return;
		}
		if (!target || target === account) return;
		indexedDB.deleteDatabase(`chords:${target}`);
		localStorage.removeItem(PURGE);
	}, [account]);
}

export function ImpersonationBanner() {
	const impersonator = useImpersonator();
	const { user, store, run, busy } = useApp();
	if (!impersonator || !user) return null;
	const stop = () =>
		run(async () => {
			await store.sync();
			const { pending } = store.getStatus();
			if (
				pending &&
				!window.confirm(
					`${pending} change${pending === 1 ? " hasn't" : "s haven't"} synced and will be discarded. Stop impersonating anyway?`,
				)
			)
				return;
			const { error } = await authClient.admin.stopImpersonating();
			if (error) throw new Error(error.message || "Could not stop.");
			// Never keep someone else's songbook in the administrator's browser.
			localStorage.setItem(PURGE, user.id);
			localStorage.removeItem(`chords:owner:${user.id}`);
			localStorage.setItem("chords:account", impersonator);
			window.location.assign(`/admin/users/${user.id}`);
		});
	return (
		<aside
			aria-label="Impersonation"
			data-print="hide"
			className="sticky top-0 z-50 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-destructive px-4 py-2 text-sm text-white"
		>
			<span>
				You are signed in as <strong>{user.name}</strong> ({user.email}).
				Changes are saved to their account and logged.
			</span>
			<Button size="sm" variant="secondary" disabled={busy} onClick={stop}>
				{busy ? <Spinner /> : null} Stop impersonating
			</Button>
		</aside>
	);
}
