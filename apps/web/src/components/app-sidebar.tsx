import { Avatar, AvatarFallback } from "@chords/ui/components/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@chords/ui/components/dropdown-menu";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuBadge,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarRail,
	useSidebar,
} from "@chords/ui/components/sidebar";
import { cn } from "@chords/ui/lib/utils";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
	Bot,
	Check,
	ChevronsUpDown,
	Cloud,
	CloudOff,
	Globe,
	HardDriveUpload,
	Heart,
	ListMusic,
	LogIn,
	LogOut,
	Monitor,
	Moon,
	Music,
	Settings2,
	Shield,
	Sun,
	User,
	Users,
} from "lucide-react";
import { useState } from "react";
import { useApp } from "#/features/app-context";
import { ConnectAssistantDialog } from "#/features/connect-assistant";
import { useImpersonator } from "#/features/impersonation";
import { usePlayingSetlist } from "#/features/setlist-overview";
import { authClient } from "#/lib/auth-client";
import { useTheme } from "#/lib/theme";

const items = [
	{ to: "/songs", label: "Repertoire", icon: Music },
	{ to: "/setlists", label: "Setlists", icon: ListMusic },
	{ to: "/community", label: "Catalogue", icon: Globe },
	{ to: "/bands", label: "Bands", icon: Users },
] as const;

// Playing a song is full screen on mobile, like a native performance mode.
export function showsBottomNav(pathname: string) {
	// Songs, the song editor and shared links get the full screen.
	return !/^\/(songs\/(?!new$)[^/]+(\/edit)?|shared\/[^/]+)$/.test(pathname);
}

function AccountMenu({
	children,
	side,
}: {
	children: React.ReactNode;
	side: "top" | "right";
}) {
	const { user, store, run, busy, online } = useApp();
	const [connecting, setConnecting] = useState(false);
	const impersonating = !!useImpersonator();
	const { theme, setTheme } = useTheme();
	const app = useApp();
	const navigate = useNavigate();
	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
				<DropdownMenuContent className="min-w-56" align="end" side={side}>
					<DropdownMenuLabel className="font-normal">
						<div className="truncate font-medium">{user?.name}</div>
						<div className="truncate text-xs text-muted-foreground">
							{user?.email}
						</div>
					</DropdownMenuLabel>
					<DropdownMenuSeparator />
					{side === "top" && app.bands.length ? (
						<>
							<DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
								Library
							</DropdownMenuLabel>
							{[
								{ id: app.account, name: "Personal", icon: User },
								...app.bands.map((band) => ({ ...band, icon: Users })),
							].map(({ id, name, icon: Icon }) => (
								<DropdownMenuItem
									key={id}
									onSelect={() => {
										app.setOwner(id);
										void navigate({ to: "/songs" });
									}}
								>
									<Icon /> {name}
									{app.owner === id ? <Check className="ml-auto" /> : null}
								</DropdownMenuItem>
							))}
							<DropdownMenuSeparator />
						</>
					) : null}
					<DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
						Appearance
					</DropdownMenuLabel>
					{(
						[
							["system", Monitor, "System"],
							["light", Sun, "Light"],
							["dark", Moon, "Dark"],
						] as const
					).map(([value, Icon, label]) => (
						<DropdownMenuItem
							key={value}
							onSelect={(event) => {
								event.preventDefault();
								setTheme(value);
							}}
						>
							<Icon /> {label}
							{theme === value ? <Check className="ml-auto" /> : null}
						</DropdownMenuItem>
					))}
					<DropdownMenuSeparator />
					<DropdownMenuItem
						// While impersonating, this would copy the administrator's own songs.
						disabled={busy || impersonating}
						onSelect={() =>
							void run(
								() => store.importLocal(),
								"Local songs copied to your account",
							)
						}
					>
						<HardDriveUpload /> Import this device’s songs
					</DropdownMenuItem>
					<DropdownMenuItem onSelect={() => setConnecting(true)}>
						<Bot /> Add to Claude or ChatGPT
					</DropdownMenuItem>
					{online && user?.role?.split(",").includes("admin") ? (
						<DropdownMenuItem asChild>
							<Link to="/admin">
								<Shield /> Administration
							</Link>
						</DropdownMenuItem>
					) : null}
					<DropdownMenuItem
						// The banner's "Stop impersonating" also clears their songbook.
						disabled={busy || impersonating}
						onSelect={() =>
							void run(async () => {
								await authClient.signOut();
								localStorage.removeItem("chords:account");
								window.location.assign("/");
							})
						}
					>
						<LogOut /> Sign out
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<ConnectAssistantDialog open={connecting} onOpenChange={setConnecting} />
		</>
	);
}

// While playing from a setlist, list its songs so any of them is one click away.
function SetlistOverview({ onNavigate }: { onNavigate: () => void }) {
	const playing = usePlayingSetlist();
	if (!playing) return null;
	const { list, current, entries } = playing;
	return (
		<SidebarGroup>
			<SidebarGroupLabel asChild>
				<Link to="/setlists/$id" params={{ id: list.id }} onClick={onNavigate}>
					<ListMusic className="mr-2" />
					<span className="truncate">{list.data.title}</span>
				</Link>
			</SidebarGroupLabel>
			<SidebarGroupContent>
				<SidebarMenu>
					{entries.map((entry, position) => {
						const title = entry.title;
						return (
							<SidebarMenuItem key={entry.id}>
								<SidebarMenuButton
									asChild
									tooltip={`${position + 1}. ${title}`}
									isActive={position === current}
								>
									<Link
										to="/songs/$id"
										params={{ id: entry.arrangementId }}
										search={{ setlist: list.id, index: position }}
										replace
										onClick={onNavigate}
										aria-current={position === current ? "page" : undefined}
									>
										<span className="flex size-4 shrink-0 items-center justify-center font-mono text-xs tabular-nums text-muted-foreground">
											{position + 1}
										</span>
										<span className="truncate">{title}</span>
										{entry.key ? (
											<span className="ml-auto font-mono text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
												{entry.key}
											</span>
										) : null}
									</Link>
								</SidebarMenuButton>
							</SidebarMenuItem>
						);
					})}
				</SidebarMenu>
			</SidebarGroupContent>
		</SidebarGroup>
	);
}

function LibrarySwitcher() {
	const app = useApp();
	const navigate = useNavigate();
	const workspace =
		app.owner === app.account
			? "Personal"
			: app.bands.find((band) => band.id === app.owner)?.name || "Band";
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<SidebarMenuButton
					tooltip={workspace}
					aria-label={`Switch library, current: ${workspace}`}
				>
					{app.owner === app.account ? <User /> : <Users />}
					<span className="truncate group-data-[collapsible=icon]:hidden">
						{workspace}
					</span>
					<ChevronsUpDown className="ml-auto group-data-[collapsible=icon]:hidden" />
				</SidebarMenuButton>
			</DropdownMenuTrigger>
			<DropdownMenuContent className="min-w-56" align="start" side="right">
				<DropdownMenuLabel className="text-xs text-muted-foreground">
					Library
				</DropdownMenuLabel>
				<DropdownMenuRadioGroup
					value={app.owner}
					onValueChange={(value) => {
						app.setOwner(value);
						void navigate({ to: "/songs" });
					}}
				>
					<DropdownMenuRadioItem value={app.account}>
						Personal
					</DropdownMenuRadioItem>
					{app.bands.map((band) => (
						<DropdownMenuRadioItem key={band.id} value={band.id}>
							{band.name}
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
				<DropdownMenuSeparator />
				<DropdownMenuItem asChild>
					<Link to="/bands">
						<Settings2 /> Manage bands
					</Link>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export function BottomNav() {
	const { user } = useApp();
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	if (!showsBottomNav(pathname)) return null;
	const tabs = user
		? items
		: [...items, { to: "/login", label: "Sign in", icon: User }];
	const tabClass =
		"flex h-14 flex-col items-center justify-center gap-1 text-[11px] text-muted-foreground transition-all active:scale-90";
	return (
		<nav
			data-print="hide"
			aria-label="Main"
			className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/90 pb-[env(safe-area-inset-bottom)] backdrop-blur"
		>
			<div className="grid grid-cols-5">
				{tabs.map((item) => {
					const active = pathname.startsWith(item.to);
					return (
						<Link
							key={item.to}
							to={item.to}
							aria-current={active ? "page" : undefined}
							className={cn(
								"flex h-14 flex-col items-center justify-center gap-1 text-[11px] transition-all active:scale-90",
								active ? "text-foreground" : "text-muted-foreground",
							)}
						>
							<item.icon
								className={cn(
									"size-5 transition-transform",
									active && "scale-110",
								)}
							/>
							{item.label}
						</Link>
					);
				})}
				{user ? (
					<AccountMenu side="top">
						<button type="button" className={tabClass}>
							<User className="size-5" />
							Account
						</button>
					</AccountMenu>
				) : null}
			</div>
		</nav>
	);
}

export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
	const app = useApp();
	const { isMobile, setOpenMobile } = useSidebar();
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	const status = !app.online
		? "Offline"
		: app.syncing
			? "Syncing…"
			: app.account === "local"
				? "Saved on this device"
				: app.pending
					? `${app.pending} pending`
					: "Synced";
	const playing = usePlayingSetlist();
	// A song opened from a setlist belongs to Setlists, not Repertoire.
	const section = playing ? "/setlists" : pathname;
	if (isMobile) return <BottomNav />;
	return (
		<Sidebar
			collapsible="icon"
			variant="inset"
			className="[&_[data-sidebar=menu-button]]:rounded-2xl [&_[data-sidebar=sidebar]]:rounded-3xl"
			{...props}
		>
			<SidebarHeader>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton
							asChild
							size="lg"
							tooltip="Mic Drop"
							isActive={pathname === "/"}
						>
							<Link to="/" onClick={() => setOpenMobile(false)}>
								<div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
									<Music className="size-4" />
								</div>
								<span className="truncate font-semibold group-data-[collapsible=icon]:hidden">
									Mic Drop
								</span>
							</Link>
						</SidebarMenuButton>
					</SidebarMenuItem>
					{app.bands.length ? (
						<SidebarMenuItem>
							<LibrarySwitcher />
						</SidebarMenuItem>
					) : null}
				</SidebarMenu>
			</SidebarHeader>
			<SidebarContent>
				<SidebarGroup>
					<SidebarGroupContent>
						<SidebarMenu>
							{items.map((item) => (
								<SidebarMenuItem key={item.to}>
									<SidebarMenuButton
										asChild
										tooltip={item.label}
										isActive={section.startsWith(item.to)}
									>
										<Link to={item.to} onClick={() => setOpenMobile(false)}>
											<item.icon />
											<span className="group-data-[collapsible=icon]:hidden">
												{item.label}
											</span>
										</Link>
									</SidebarMenuButton>
									{item.to === "/songs" || item.to === "/setlists" ? (
										<SidebarMenuBadge>
											{item.to === "/songs"
												? app.songs.length
												: app.setlists.length}
										</SidebarMenuBadge>
									) : null}
								</SidebarMenuItem>
							))}
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
				<SetlistOverview onNavigate={() => setOpenMobile(false)} />
			</SidebarContent>
			<SidebarFooter>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton
							size="sm"
							tooltip={status}
							className="text-muted-foreground"
							disabled={!app.online || app.account === "local"}
							onClick={() => void app.store.sync()}
						>
							{app.online ? <Cloud /> : <CloudOff />}
							<span className="group-data-[collapsible=icon]:hidden">
								{status}
							</span>
						</SidebarMenuButton>
					</SidebarMenuItem>
					<SidebarMenuItem>
						{app.user ? (
							<AccountMenu side="right">
								<SidebarMenuButton size="lg" tooltip={app.user.name}>
									<Avatar className="size-8 rounded-lg">
										<AvatarFallback className="rounded-lg">
											{app.user.name[0]?.toUpperCase()}
										</AvatarFallback>
									</Avatar>
									<div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
										<span className="truncate font-medium">
											{app.user.name}
										</span>
										<span className="truncate text-xs text-muted-foreground">
											{app.user.email}
										</span>
									</div>
									<ChevronsUpDown className="ml-auto group-data-[collapsible=icon]:hidden" />
								</SidebarMenuButton>
							</AccountMenu>
						) : (
							<SidebarMenuButton
								asChild
								size="lg"
								tooltip="Sign in"
								isActive={pathname.startsWith("/login")}
							>
								<Link to="/login" onClick={() => setOpenMobile(false)}>
									<LogIn />
									<span className="group-data-[collapsible=icon]:hidden">
										Sign in to sync
									</span>
								</Link>
							</SidebarMenuButton>
						)}
					</SidebarMenuItem>
				</SidebarMenu>
				<p className="px-2 pt-1 pb-0.5 text-center text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
					Made with{" "}
					<Heart className="inline size-3 align-[-1px] fill-rose-500 text-rose-500" />{" "}
					by{" "}
					<a
						href="https://zias.be"
						target="_blank"
						rel="noreferrer"
						className="font-medium text-foreground underline-offset-4 transition-colors hover:text-rose-500 hover:underline"
					>
						zias.be
					</a>{" "}
					·{" "}
					<Link
						to="/privacy"
						className="underline-offset-4 transition-colors hover:text-foreground hover:underline"
					>
						Privacy
					</Link>
				</p>
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	);
}
