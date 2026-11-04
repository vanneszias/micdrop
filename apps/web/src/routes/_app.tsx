import { SongbookProvider } from "@chords/data/react";
import { SidebarInset, SidebarProvider } from "@chords/ui/components/sidebar";
import { Skeleton } from "@chords/ui/components/skeleton";
import { Toaster } from "@chords/ui/components/sonner";
import { TooltipProvider } from "@chords/ui/components/tooltip";
import { cn } from "@chords/ui/lib/utils";
import {
	createFileRoute,
	Outlet,
	useRouterState,
} from "@tanstack/react-router";
import { Suspense, useEffect, useState } from "react";
import { toast } from "sonner";
import { AppSidebar, showsBottomNav } from "#/components/app-sidebar";
import { AppProvider, useApp } from "#/features/app-context";
import { Conflicts } from "#/features/conflicts";
import {
	ImpersonationBanner,
	usePurgeImpersonatedSongbook,
} from "#/features/impersonation";
import { authClient } from "#/lib/auth-client";

export const Route = createFileRoute("/_app")({ component: Layout });

function Layout() {
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
	useEffect(() => {
		if (import.meta.env.DEV || !("serviceWorker" in navigator)) return;
		void navigator.serviceWorker
			.register("/sw.js")
			.then((registration) => {
				const ready = () => {
					if (!registration.waiting || !navigator.serviceWorker.controller)
						return;
					toast("A new version is ready", {
						duration: Number.POSITIVE_INFINITY,
						action: {
							label: "Reload",
							onClick: () => {
								navigator.serviceWorker.addEventListener(
									"controllerchange",
									() => window.location.reload(),
									{ once: true },
								);
								registration.waiting?.postMessage({ type: "SKIP_WAITING" });
							},
						},
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
	const account =
		session?.user.id ||
		(!online || isPending || error ? cachedAccount : "local");
	usePurgeImpersonatedSongbook(account);
	return (
		<TooltipProvider>
			<Suspense fallback={<ShellSkeleton />}>
				<SongbookProvider key={account} account={account}>
					<AppProvider account={account} online={online} user={session?.user}>
						<Shell />
					</AppProvider>
				</SongbookProvider>
			</Suspense>
			<Toaster position="bottom-right" />
		</TooltipProvider>
	);
}

function ShellSkeleton() {
	return (
		<div className="flex min-h-svh gap-2 bg-background p-2" aria-busy="true">
			<div className="hidden w-64 shrink-0 flex-col gap-3 p-3 md:flex">
				<Skeleton className="h-8 w-32" />
				<Skeleton className="h-8 w-full" />
				<Skeleton className="h-8 w-full" />
				<Skeleton className="h-8 w-full" />
			</div>
			<div className="flex flex-1 flex-col gap-4 rounded-3xl bg-card p-6">
				<Skeleton className="h-8 w-48" />
				<Skeleton className="h-16 w-full" />
				<Skeleton className="h-16 w-full" />
				<Skeleton className="h-16 w-full" />
			</div>
		</div>
	);
}

function Shell() {
	const { error, bands } = useApp();
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	useEffect(() => {
		if (error) toast.error(error);
	}, [error]);
	return (
		<SidebarProvider className="has-data-[variant=inset]:bg-background">
			<AppSidebar />
			<SidebarInset className="min-w-0 overflow-hidden bg-card md:peer-data-[variant=inset]:rounded-3xl">
				<ImpersonationBanner />
				<div
					key={pathname}
					className={cn(
						"flex min-h-0 flex-1 flex-col animate-in fade-in-0 slide-in-from-bottom-1 duration-200",
						showsBottomNav(pathname) &&
							(bands.length
								? "pb-[calc(6.25rem+env(safe-area-inset-bottom))] md:pb-0"
								: "pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0"),
					)}
				>
					<Outlet />
				</div>
			</SidebarInset>
			<Conflicts />
		</SidebarProvider>
	);
}
