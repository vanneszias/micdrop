import { Button } from "@chords/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@chords/ui/components/card";
import { Spinner } from "@chords/ui/components/spinner";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { authClient } from "#/lib/auth-client";

export const Route = createFileRoute("/consent")({
	head: () => ({ meta: [{ title: "Connect an assistant · Mic Drop" }] }),
	component: Consent,
});

const SCOPES: Record<string, string> = {
	"songs:read": "Search and read songs in your songbooks",
	"songs:write": "Add, import, and edit songs",
	offline_access: "Stay connected until you revoke access",
};

function Consent() {
	const [client, setClient] = useState<{ name: string; uri?: string }>();
	const [scopes, setScopes] = useState<string[]>([]);
	const [busy, setBusy] = useState(false);
	useEffect(() => {
		const query = new URLSearchParams(window.location.search);
		const clientId = query.get("client_id") || "";
		setScopes((query.get("scope") || "").split(" ").filter((s) => SCOPES[s]));
		void authClient
			.$fetch<{ client_name?: string; client_uri?: string }>(
				"/oauth2/public-client",
				{ query: { client_id: clientId } },
			)
			.then(({ data }) =>
				setClient({
					name: data?.client_name || clientId,
					uri: data?.client_uri,
				}),
			);
	}, []);
	const decide = async (accept: boolean) => {
		setBusy(true);
		const { data, error } = await authClient.$fetch<{ url: string }>(
			"/oauth2/consent",
			{ method: "POST", body: { accept } },
		);
		if (data?.url) return window.location.assign(data.url);
		setBusy(false);
		toast.error(error?.message || "This request expired. Start again.");
	};
	return (
		<div className="flex min-h-svh items-center justify-center p-6">
			<Card className="w-full max-w-sm">
				<CardHeader>
					<CardTitle>Connect {client?.name ?? "an assistant"}</CardTitle>
					<CardDescription>
						{client?.uri ? `${new URL(client.uri).host} wants` : "It wants"}{" "}
						access to your Mic Drop songbooks.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<ul className="list-disc space-y-1 pl-5 text-sm">
						{scopes.map((scope) => (
							<li key={scope}>{SCOPES[scope]}</li>
						))}
					</ul>
				</CardContent>
				<CardFooter className="flex gap-2">
					<Button
						variant="outline"
						className="flex-1"
						disabled={busy}
						onClick={() => void decide(false)}
					>
						Deny
					</Button>
					<Button
						className="flex-1"
						disabled={busy || !client}
						onClick={() => void decide(true)}
					>
						{busy ? <Spinner /> : null}
						Allow
					</Button>
				</CardFooter>
			</Card>
		</div>
	);
}
