import { Button } from "@chords/ui/components/button";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@chords/ui/components/toggle-group";
import { createFileRoute } from "@tanstack/react-router";
import { Bot, HardDriveUpload, Monitor, Moon, Sun } from "lucide-react";
import { useState } from "react";
import { PageBody, PageHeader } from "#/components/page-header";
import { useApp } from "#/features/app-context";
import { ConnectAssistantDialog } from "#/features/connect-assistant";
import { useImpersonator } from "#/features/impersonation";
import { type Theme, useTheme } from "#/lib/theme";

export const Route = createFileRoute("/_app/settings")({
	component: Settings,
});

/** Things set once: appearance, moving this device's songs, and assistant access. */
function Settings() {
	const { store, run, busy, account } = useApp();
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
