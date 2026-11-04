import { Button } from "@chords/ui/components/button";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@chords/ui/components/empty";
import {
	createFileRoute,
	Link,
	Outlet,
	useRouterState,
} from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { PageHeader } from "#/components/page-header";
import { isAdmin } from "#/features/admin";
import { useApp } from "#/features/app-context";

export const Route = createFileRoute("/_app/admin")({ component: AdminLayout });

const tabs = [
	{ to: "/admin", label: "Overview", exact: true },
	{ to: "/admin/users", label: "Users", exact: false },
	{ to: "/admin/bands", label: "Bands", exact: false },
	{ to: "/admin/library", label: "Songs & setlists", exact: false },
	{ to: "/admin/clients", label: "Assistants", exact: false },
	{ to: "/admin/links", label: "Share links", exact: false },
	{ to: "/admin/audit", label: "Audit log", exact: false },
] as const;

function AdminLayout() {
	const { user, online } = useApp();
	const pathname = useRouterState({
		select: (state) => state.location.pathname.replace(/\/$/, ""),
	});
	if (!isAdmin(user?.role) || !online)
		return (
			<>
				<PageHeader title="Administration" />
				<div className="p-4">
					<Empty className="border">
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<ShieldAlert />
							</EmptyMedia>
							<EmptyTitle>
								{online ? "Administrator access required" : "You are offline"}
							</EmptyTitle>
							<EmptyDescription>
								{online
									? "This area is only available to platform administrators."
									: "Administration needs a connection to show current data."}
							</EmptyDescription>
						</EmptyHeader>
					</Empty>
				</div>
			</>
		);
	return (
		<>
			<PageHeader title="Administration" />
			<nav
				aria-label="Administration"
				className="flex gap-1 overflow-x-auto border-b px-4 py-2"
			>
				{tabs.map((tab) => {
					const active = tab.exact
						? pathname === tab.to
						: pathname.startsWith(tab.to);
					return (
						<Button
							key={tab.to}
							asChild
							size="sm"
							variant={active ? "secondary" : "ghost"}
							className="shrink-0"
						>
							<Link to={tab.to} aria-current={active ? "page" : undefined}>
								{tab.label}
							</Link>
						</Button>
					);
				})}
			</nav>
			<Outlet />
		</>
	);
}
