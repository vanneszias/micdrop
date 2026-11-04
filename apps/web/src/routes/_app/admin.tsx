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
			<PageHeader title="Administration">
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
						>
							<Link to={tab.to}>{tab.label}</Link>
						</Button>
					);
				})}
			</PageHeader>
			<Outlet />
		</>
	);
}
