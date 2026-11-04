import { Badge } from "@chords/ui/components/badge";
import { Button } from "@chords/ui/components/button";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
	ErrorText,
	OwnerLink,
	type Page,
	Pager,
	Rows,
	useAdmin,
	when,
} from "#/features/admin";
import { useApp } from "#/features/app-context";
import { api } from "#/lib/songs";

export const Route = createFileRoute("/_app/admin/clients")({
	validateSearch: z.object({
		offset: z.number().int().min(0).catch(0).default(0),
	}),
	component: Clients,
});

type Client = {
	clientId: string;
	name: string | null;
	uri: string | null;
	redirectUris: string;
	userId: string | null;
	ownerName: string | null;
	disabled: number | null;
	createdAt: string;
	activeUsers: number;
	lastUsed: number | null;
};

function Clients() {
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const { run, busy } = useApp();
	const queryClient = useQueryClient();
	const { data, error } = useAdmin<Page<Client>>({
		view: "clients",
		offset: search.offset,
	});
	const toggle = (client: Client) =>
		run(
			async () => {
				await api("/api/admin", {
					action: "disable_client",
					clientId: client.clientId,
					disabled: !client.disabled,
				});
				await queryClient.invalidateQueries({ queryKey: ["admin"] });
			},
			client.disabled ? "Assistant enabled" : "Assistant disabled",
		);
	return (
		<div className="w-full space-y-4 p-4">
			<p className="text-sm text-muted-foreground">
				OAuth clients that connect assistants through MCP. Most register
				themselves without an account. Disabling one revokes its tokens and
				refuses its calls.
			</p>
			<ErrorText error={error} />
			<Rows
				rows={data?.rows ?? []}
				empty={data ? "No assistants have registered." : "Loading…"}
				columns={[
					[
						"Client",
						(row) => (
							<span title={row.clientId}>
								{row.name || row.clientId}{" "}
								{row.disabled ? (
									<Badge variant="destructive">disabled</Badge>
								) : null}
							</span>
						),
					],
					[
						"Redirects to",
						(row) => (
							<span title={row.redirectUris}>
								{row.uri || row.redirectUris}
							</span>
						),
					],
					[
						"Registered by",
						(row) =>
							row.userId ? (
								<OwnerLink id={row.userId} kind="user" name={row.ownerName} />
							) : (
								<Badge variant="outline">no account</Badge>
							),
					],
					["Connected users", (row) => row.activeUsers],
					["Last token", (row) => when(row.lastUsed)],
					["Registered", (row) => when(row.createdAt)],
					[
						"",
						(row) => (
							<Button
								size="sm"
								variant={row.disabled ? "outline" : "destructive"}
								disabled={busy}
								onClick={() => void toggle(row)}
							>
								{row.disabled ? "Enable" : "Disable"}
							</Button>
						),
					],
				]}
			/>
			<Pager
				offset={search.offset}
				next={data?.next}
				onChange={(offset) => void navigate({ search: { offset } })}
			/>
		</div>
	);
}
