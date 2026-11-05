import { Button } from "@chords/ui/components/button";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@chords/ui/components/toggle-group";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Bot, HardDriveUpload, Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageBody, PageHeader } from "#/components/page-header";
import { AccountSettings } from "#/features/account-settings";
import { useApp } from "#/features/app-context";
import { ConnectAssistantDialog } from "#/features/connect-assistant";
import { useImpersonator } from "#/features/impersonation";
import { type Theme, useTheme } from "#/lib/theme";

type Search = { email?: string; linked?: string; error?: string };

export const Route = createFileRoute("/_app/settings")({
	validateSearch: (search: Record<string, unknown>): Search => ({
		email: typeof search.email === "string" ? search.email : undefined,
		linked: typeof search.linked === "string" ? search.linked : undefined,
		error: typeof search.error === "string" ? search.error : undefined,
	}),
	component: Settings,
});

/** Email links and Google linking return here; say how it went, then tidy the address bar. */
function useReturnNotice() {
	const search = Route.useSearch();
	const navigate = useNavigate();
	useEffect(() => {
		if (!search.email && !search.linked && !search.error) return;
		if (search.error)
			toast.error(
				search.error === "TOKEN_EXPIRED" || search.error === "INVALID_TOKEN"
					? "This email link is invalid or expired. Request a new one."
					: search.error.includes("linked") ||
							search.error.includes("email_doesn't_match")
						? "That Google account can't be connected. Use the Google account with the same email address, one that isn't connected to another Mic Drop account."
						: "That didn't work. Try again.",
			);
		else if (search.linked) toast.success("Google connected");
		else if (search.email === "verified")
			toast.success("Your email address is verified");
		else if (search.email === "changed")
			toast.success(
				"Email link accepted. If we sent a link to your new address, confirm it there to finish.",
			);
		void navigate({ to: "/settings", search: {}, replace: true });
	}, [search, navigate]);
}

/** Your account and sign-in, appearance, moving this device's songs, and assistant access. */
function Settings() {
	const { store, run, busy, account, online } = useApp();
	useReturnNotice();
	const { theme, setTheme } = useTheme();
	const [connecting, setConnecting] = useState(false);
	const impersonating = !!useImpersonator();
	const signedOut = account === "local";
	return (
		<>
			<PageHeader
				back
				headingInBody
				title={<span className="max-md:sr-only">Settings</span>}
			/>
			<PageBody title="Settings">
				{signedOut || !online ? null : impersonating ? (
					<section className="rounded-xl border bg-card p-4 text-sm text-muted-foreground sm:p-5">
						Account and sign-in settings are hidden while you act as someone
						else.
					</section>
				) : (
					<AccountSettings />
				)}
				<section className="space-y-3 rounded-xl border bg-card p-4 sm:p-5">
					<div className="space-y-1">
						<h2 className="font-semibold">Appearance</h2>
						<p className="text-sm text-muted-foreground">
							System follows your device's light or dark setting as it changes.
						</p>
					</div>
					<ToggleGroup
						type="single"
						variant="outline"
						aria-label="Appearance"
						value={theme}
						onValueChange={(value) => value && setTheme(value as Theme)}
					>
						<ToggleGroupItem value="system">
							<Monitor /> System
						</ToggleGroupItem>
						<ToggleGroupItem value="light">
							<Sun /> Light
						</ToggleGroupItem>
						<ToggleGroupItem value="dark">
							<Moon /> Dark
						</ToggleGroupItem>
					</ToggleGroup>
				</section>
				<section className="space-y-3 rounded-xl border bg-card p-4 sm:p-5">
					<div className="space-y-1">
						<h2 className="font-semibold">Songs on this device</h2>
						<p className="text-sm text-muted-foreground">
							Songs you added before signing in stay on this device until you
							copy them to your account.
						</p>
					</div>
					<Button
						variant="outline"
						disabled={busy || impersonating || signedOut}
						onClick={() =>
							void run(
								() => store.importLocal(),
								"Local songs copied to your account",
							)
						}
					>
						<HardDriveUpload /> Copy this device's songs to my account
					</Button>
				</section>
				<section className="space-y-3 rounded-xl border bg-card p-4 sm:p-5">
					<div className="space-y-1">
						<h2 className="font-semibold">Assistants</h2>
						<p className="text-sm text-muted-foreground">
							Let Claude or ChatGPT search, add and update songs in your
							library.
						</p>
					</div>
					<Button
						variant="outline"
						disabled={signedOut}
						onClick={() => setConnecting(true)}
					>
						<Bot /> Add to Claude or ChatGPT
					</Button>
				</section>
			</PageBody>
			<ConnectAssistantDialog open={connecting} onOpenChange={setConnecting} />
		</>
	);
}
