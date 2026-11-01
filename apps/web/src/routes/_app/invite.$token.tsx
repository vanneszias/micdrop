import { Button } from "@chords/ui/components/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@chords/ui/components/empty";
import { Skeleton } from "@chords/ui/components/skeleton";
import { Spinner } from "@chords/ui/components/spinner";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Link2Off, Users } from "lucide-react";
import { PageHeader } from "#/components/page-header";
import { useApp } from "#/features/app-context";
import { api } from "#/lib/songs";

type Invite = {
	kind: "invite";
	band: { id: string; name: string };
	role: string;
	inviter: string;
};

export const Route = createFileRoute("/_app/invite/$token")({
	head: () => ({ meta: [{ title: "Band invite · Mic Drop" }] }),
	component: InvitePage,
});

function InvitePage() {
	const { token } = Route.useParams();
	const { user, online, bands, refetchBands, store, setOwner, run, busy } =
		useApp();
	const navigate = useNavigate();
	const invite = useQuery({
		queryKey: ["share", token],
		queryFn: () =>
			api<{ share: Invite }>(
				`/api/shares?${new URLSearchParams({ token })}`,
			).then((data) => data.share),
		enabled: online,
		retry: false,
	});
	const data = invite.data?.kind === "invite" ? invite.data : undefined;
	const open = async (bandId: string) => {
		setOwner(bandId);
		await navigate({ to: "/songs" });
	};
	const join = (bandId: string) =>
		run(async () => {
			await api("/api/shares", { action: "accept", id: token });
			await refetchBands();
			await store.sync();
			await open(bandId);
		}, "Welcome to the band");
	const member = data && bands.some((band) => band.id === data.band.id);
	return (
		<>
			<PageHeader title="Band invite" />
			{invite.isPending && online ? (
				<div className="flex flex-col items-center gap-3 p-12">
					<Skeleton className="size-12 rounded-md" />
					<Skeleton className="h-6 w-48" />
					<Skeleton className="h-4 w-64" />
				</div>
			) : !data ? (
				<Empty>
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<Link2Off />
						</EmptyMedia>
						<EmptyTitle>This invite isn’t available</EmptyTitle>
						<EmptyDescription>
							{!online
								? "Joining a band needs a connection."
								: invite.error?.message || "Ask the band owner for a new link."}
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			) : (
				<Empty>
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<Users />
						</EmptyMedia>
						<EmptyTitle>Join {data.band.name}</EmptyTitle>
						<EmptyDescription>
							{data.inviter} invited you as{" "}
							{data.role === "editor" ? "an editor" : "a viewer"}.{" "}
							{data.role === "editor"
								? "You can play and edit the band’s songs and setlists."
								: "You can play the band’s songs and setlists."}
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						{!user ? (
							<Button asChild>
								<a
									href={`/login?${new URLSearchParams({ redirect: `/invite/${token}` })}`}
								>
									Sign in to join
								</a>
							</Button>
						) : member ? (
							<Button onClick={() => void open(data.band.id)}>
								You’re in this band · Open songs
							</Button>
						) : (
							<Button disabled={busy} onClick={() => void join(data.band.id)}>
								{busy ? <Spinner /> : null} Join band
							</Button>
						)}
						<Button asChild variant="ghost">
							<Link to="/songs">Not now</Link>
						</Button>
					</EmptyContent>
				</Empty>
			)}
		</>
	);
}
