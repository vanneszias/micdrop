import { Button } from "@chords/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@chords/ui/components/dialog";
import { Field, FieldLabel } from "@chords/ui/components/field";
import { Spinner } from "@chords/ui/components/spinner";
import { Textarea } from "@chords/ui/components/textarea";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@chords/ui/components/toggle-group";
import { useRouterState } from "@tanstack/react-router";
import { Bug, Lightbulb, MessageSquare } from "lucide-react";
import { useId, useRef, useState } from "react";
import { api } from "#/lib/songs";
import { useTheme } from "#/lib/theme";
import { useApp } from "./app-context";

const KINDS = [
	["bug", Bug, "Something's wrong"],
	["idea", Lightbulb, "Idea"],
	["other", MessageSquare, "Other"],
] as const;
type Kind = (typeof KINDS)[number][0];

/** What admins see next to the message, so a report needs no back-and-forth to reproduce. */
function useFeedbackContext() {
	const app = useApp();
	const { theme } = useTheme();
	const location = useRouterState({ select: (state) => state.location });
	return () => ({
		path: `${location.pathname}${location.searchStr}`.slice(0, 500),
		title: document.title.slice(0, 200),
		library: app.owner,
		libraryName:
			app.owner === app.account
				? "Personal"
				: (app.bands.find((band) => band.id === app.owner)?.name ?? ""),
		release: import.meta.env.VITE_SENTRY_RELEASE || "dev",
		online: app.online,
		pending: app.pending,
		viewport: `${window.innerWidth}x${window.innerHeight}@${window.devicePixelRatio}`,
		standalone: window.matchMedia("(display-mode: standalone)").matches,
		language: navigator.language,
		timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
		theme,
	});
}

export function FeedbackDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const { run, busy, online } = useApp();
	const context = useFeedbackContext();
	const [kind, setKind] = useState<Kind>("bug");
	const [message, setMessage] = useState("");
	const id = useId();
	const textarea = useRef<HTMLTextAreaElement>(null);
	const submit = () =>
		void run(async () => {
			await api("/api/feedback", { kind, message, context: context() });
			setMessage("");
			setKind("bug");
			onOpenChange(false);
		}, "Thanks! Your feedback was sent.");
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				// Opened from a menu, which would otherwise hand focus back to its trigger.
				onOpenAutoFocus={(event) => {
					event.preventDefault();
					textarea.current?.focus();
				}}
			>
				<form
					className="space-y-4"
					onSubmit={(event) => {
						event.preventDefault();
						submit();
					}}
				>
					<DialogHeader>
						<DialogTitle>Send feedback</DialogTitle>
						<DialogDescription>
							The page you're on, your library, the app version and your device
							details are sent along, so we can see what you saw.
						</DialogDescription>
					</DialogHeader>
					<ToggleGroup
						type="single"
						variant="outline"
						size="sm"
						value={kind}
						onValueChange={(value) => value && setKind(value as Kind)}
						aria-label="Kind of feedback"
					>
						{KINDS.map(([value, Icon, label]) => (
							<ToggleGroupItem key={value} value={value} className="px-3">
								<Icon /> {label}
							</ToggleGroupItem>
						))}
					</ToggleGroup>
					<Field>
						<FieldLabel htmlFor={id}>
							{kind === "bug"
								? "What happened, and what did you expect?"
								: "Your message"}
						</FieldLabel>
						<Textarea
							id={id}
							ref={textarea}
							rows={5}
							maxLength={4000}
							value={message}
							onChange={(event) => setMessage(event.target.value)}
							onKeyDown={(event) => {
								if (
									event.key === "Enter" &&
									(event.metaKey || event.ctrlKey) &&
									message.trim().length >= 3
								) {
									event.preventDefault();
									submit();
								}
							}}
						/>
					</Field>
					<DialogFooter>
						<Button
							type="submit"
							disabled={busy || !online || message.trim().length < 3}
						>
							{busy ? <Spinner /> : null}
							{online ? "Send" : "You are offline"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
