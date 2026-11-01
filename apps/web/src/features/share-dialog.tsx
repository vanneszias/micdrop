import { Button } from "@chords/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@chords/ui/components/dialog";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupInput,
} from "@chords/ui/components/input-group";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@chords/ui/components/select";
import { Skeleton } from "@chords/ui/components/skeleton";
import { Spinner } from "@chords/ui/components/spinner";
import { useQuery } from "@tanstack/react-query";
import { Copy, Link2, Share, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useApp } from "#/features/app-context";
import { api } from "#/lib/songs";

type ShareLink = { id: string; role: string | null; expiresAt: number | null };

export function shareUrl(kind: "record" | "invite", id: string) {
	const origin = typeof window === "undefined" ? "" : window.location.origin;
	return `${origin}/${kind === "invite" ? "invite" : "shared"}/${id}`;
}

/** Shares a song or setlist, or invites people to a band, with a link. */
export function ShareDialog({
	kind,
	target,
	title,
	open,
	onOpenChange,
}: {
	kind: "record" | "invite";
	target: string;
	title: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const { store, run, busy } = useApp();
	const [role, setRole] = useState("viewer");
	const links = useQuery({
		queryKey: ["shares", kind, target],
		queryFn: () =>
			api<{ links: ShareLink[] }>(
				`/api/shares?${new URLSearchParams({ kind, target })}`,
			),
		enabled: open,
	});
	const create = () =>
		run(async () => {
			if (kind === "record") await store.sync();
			await api(
				"/api/shares",
				kind === "record"
					? { action: "share", recordId: target }
					: { action: "invite", bandId: target, role },
			);
			await links.refetch();
		});
	const revoke = (id: string) =>
		run(async () => {
			await api("/api/shares", { action: "revoke", id });
			await links.refetch();
		}, "Link turned off");
	const list = links.data?.links ?? [];
	const invite = kind === "invite";
	const linked = list.some((link) => !invite || link.role === role);
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>
						{invite ? `Invite to ${title}` : `Share ${title}`}
					</DialogTitle>
					<DialogDescription>
						{invite
							? "Anyone with an account and this link can join the band for 7 days."
							: "Anyone with this link can view it and save a copy. Edits you make show up for them."}
					</DialogDescription>
				</DialogHeader>
				{links.error ? (
					<p role="alert" className="text-sm text-destructive">
						{links.error.message}
					</p>
				) : null}
				{links.isPending ? <Skeleton className="h-9" /> : null}
				<div className="space-y-3">
					{list.map((link) => (
						<LinkRow
							key={link.id}
							url={shareUrl(kind, link.id)}
							label={
								invite
									? `${link.role === "editor" ? "Editors" : "Viewers"} · expires ${new Date(link.expiresAt ?? 0).toLocaleDateString()}`
									: undefined
							}
							disabled={busy}
							onRevoke={() => void revoke(link.id)}
						/>
					))}
				</div>
				{links.isSuccess && (invite || !list.length) ? (
					<div className="flex gap-2">
						{invite ? (
							<Select value={role} onValueChange={setRole}>
								<SelectTrigger className="w-28" aria-label="Role">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="viewer">Viewer</SelectItem>
									<SelectItem value="editor">Editor</SelectItem>
								</SelectContent>
							</Select>
						) : null}
						<Button
							className="flex-1"
							disabled={busy || linked}
							onClick={() => void create()}
						>
							{busy ? <Spinner /> : <Link2 />}
							{invite ? "Create invite link" : "Create link"}
						</Button>
					</div>
				) : null}
			</DialogContent>
		</Dialog>
	);
}

function LinkRow({
	url,
	label,
	disabled,
	onRevoke,
}: {
	url: string;
	label?: string;
	disabled: boolean;
	onRevoke: () => void;
}) {
	const copy = async () => {
		await navigator.clipboard.writeText(url);
		toast.success("Link copied");
	};
	return (
		<div className="space-y-1.5">
			{label ? (
				<div className="text-xs text-muted-foreground">{label}</div>
			) : null}
			<div className="flex gap-2">
				<InputGroup>
					<InputGroupInput
						readOnly
						value={url}
						aria-label="Share link"
						onFocus={(event) => event.currentTarget.select()}
					/>
					<InputGroupAddon align="inline-end">
						{typeof navigator !== "undefined" && "share" in navigator ? (
							<InputGroupButton
								size="icon-xs"
								aria-label="Send link"
								onClick={() => void navigator.share({ url }).catch(() => {})}
							>
								<Share />
							</InputGroupButton>
						) : null}
						<InputGroupButton
							size="icon-xs"
							aria-label="Copy link"
							onClick={() => void copy()}
						>
							<Copy />
						</InputGroupButton>
					</InputGroupAddon>
				</InputGroup>
				<Button
					variant="outline"
					size="icon"
					aria-label="Turn off link"
					disabled={disabled}
					onClick={onRevoke}
				>
					<X />
				</Button>
			</div>
		</div>
	);
}
