import { Avatar, AvatarFallback } from "@chords/ui/components/avatar";
import { Badge } from "@chords/ui/components/badge";
import { Button } from "@chords/ui/components/button";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@chords/ui/components/card";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@chords/ui/components/dialog";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@chords/ui/components/empty";
import { Field, FieldLabel } from "@chords/ui/components/field";
import { Input } from "@chords/ui/components/input";
import { Label } from "@chords/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@chords/ui/components/select";
import { Spinner } from "@chords/ui/components/spinner";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Link2, Plus, Users, X } from "lucide-react";
import { useState } from "react";
import { PageBody, PageHeader } from "#/components/page-header";
import { useApp } from "#/features/app-context";
import { ShareDialog } from "#/features/share-dialog";
import { api, type Band } from "#/lib/songs";

export const Route = createFileRoute("/_app/bands")({ component: Bands });

function Bands() {
	const { account, bands, refetchBands, store, run, busy } = useApp();
	const [open, setOpen] = useState(false);
	const signedOut = account === "local";
	const changed = async () => {
		await refetchBands();
		await store.sync();
	};
	return (
		<>
			<PageHeader pageTitle title="Bands" />
			<PageBody
				title="Bands"
				description="Share a repertoire and setlists with the people you play with."
				actions={
					!signedOut ? (
						<Dialog open={open} onOpenChange={setOpen}>
							<DialogTrigger asChild>
								<Button size="sm">
									<Plus /> New band
								</Button>
							</DialogTrigger>
							<DialogContent>
								<form
									className="space-y-4"
									onSubmit={(event) => {
										event.preventDefault();
										const form = new FormData(event.currentTarget);
										void run(async () => {
											await api("/api/bands", {
												action: "create",
												name: form.get("name"),
											});
											await refetchBands();
											setOpen(false);
										}, "Band created");
									}}
								>
									<DialogHeader>
										<DialogTitle>New band</DialogTitle>
										<DialogDescription>
											A shared library of songs and setlists.
										</DialogDescription>
									</DialogHeader>
									<Field>
										<FieldLabel htmlFor="band-name">Name</FieldLabel>
										<Input
											id="band-name"
											name="name"
											required
											maxLength={100}
										/>
									</Field>
									<DialogFooter>
										<DialogClose asChild>
											<Button type="button" variant="outline">
												Cancel
											</Button>
										</DialogClose>
										<Button disabled={busy}>
											{busy ? <Spinner /> : null} Create band
										</Button>
									</DialogFooter>
								</form>
							</DialogContent>
						</Dialog>
					) : null
				}
			>
				{signedOut || !bands.length ? (
					<Empty className="border border-dashed">
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<Users />
							</EmptyMedia>
							<EmptyTitle>No bands</EmptyTitle>
							<EmptyDescription>
								{signedOut
									? "Sign in to share songs and setlists with your band."
									: "Create a band to share songs and setlists."}
							</EmptyDescription>
						</EmptyHeader>
						{signedOut ? (
							<EmptyContent>
								<Button asChild>
									<Link to="/login">Sign in</Link>
								</Button>
							</EmptyContent>
						) : null}
					</Empty>
				) : null}
				{bands.map((band) => (
					<BandCard key={band.id} band={band} changed={changed} run={run} />
				))}
			</PageBody>
		</>
	);
}

function BandCard({
	band,
	changed,
	run,
}: {
	band: Band;
	changed: () => Promise<void>;
	run: (fn: () => Promise<unknown>, success?: string) => Promise<boolean>;
}) {
	const [role, setRole] = useState("editor");
	const [inviting, setInviting] = useState(false);
	const owner = band.role === "owner";
	const { setOwner } = useApp();
	const navigate = useNavigate();
	return (
		<Card className="animate-in fade-in-0">
			<CardHeader className="max-sm:grid-cols-1! max-sm:px-4">
				<CardTitle>{band.name}</CardTitle>
				<CardDescription>
					{band.members.length}{" "}
					{band.members.length === 1 ? "member" : "members"}
				</CardDescription>
				<CardAction className="flex items-center gap-2 max-sm:col-start-1 max-sm:row-span-1 max-sm:row-start-3 max-sm:mt-2 max-sm:justify-self-start">
					<Button
						size="sm"
						variant="outline"
						onClick={() => {
							setOwner(band.id);
							void navigate({ to: "/songs" });
						}}
					>
						Open library <ArrowRight />
					</Button>
					{owner ? (
						<Button
							variant="outline"
							size="sm"
							onClick={() => setInviting(true)}
						>
							<Link2 /> Invite link
						</Button>
					) : null}
				</CardAction>
			</CardHeader>
			<CardContent className="divide-y max-sm:px-4">
				{band.members.map((member) => (
					<div key={member.id} className="flex items-center gap-3 py-2.5">
						<Avatar className="size-8">
							<AvatarFallback className="text-xs">
								{member.name[0]?.toUpperCase()}
							</AvatarFallback>
						</Avatar>
						<div className="min-w-0 flex-1">
							<div className="flex items-center gap-2 text-sm font-medium">
								<span className="truncate">{member.name}</span>
								<Badge variant="secondary" className="capitalize">
									{member.role}
								</Badge>
							</div>
							<div className="truncate text-xs text-muted-foreground">
								{member.email}
							</div>
						</div>
						{owner && member.role !== "owner" ? (
							<Button
								variant="ghost"
								size="icon-sm"
								aria-label={`Remove ${member.name}`}
								onClick={() =>
									void run(async () => {
										await api("/api/bands", {
											action: "remove",
											bandId: band.id,
											memberId: member.id,
										});
										await changed();
									})
								}
							>
								<X />
							</Button>
						) : null}
					</div>
				))}
			</CardContent>
			{owner ? (
				<CardFooter className="flex-col items-stretch gap-2 border-t max-sm:px-4">
					<div className="space-y-0.5">
						<Label htmlFor={`add-member-${band.id}`}>
							Add existing account
						</Label>
						<p className="text-[13px] text-muted-foreground">
							For someone who already uses Mic Drop. Anyone else gets an invite
							link.
						</p>
					</div>
					<form
						className="flex w-full flex-wrap gap-2"
						onSubmit={(event) => {
							event.preventDefault();
							const form = event.currentTarget;
							const email = new FormData(form).get("email");
							void run(async () => {
								await api("/api/bands", {
									action: "add",
									bandId: band.id,
									email,
									role,
								});
								await changed();
								form.reset();
							}, "Member added");
						}}
					>
						<Input
							id={`add-member-${band.id}`}
							name="email"
							type="email"
							placeholder="Their account email"
							required
							className="min-w-0 flex-1 max-sm:basis-full"
						/>
						<Select value={role} onValueChange={setRole}>
							<SelectTrigger className="w-24 sm:w-28" aria-label="Role">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="editor">Editor</SelectItem>
								<SelectItem value="viewer">Viewer</SelectItem>
							</SelectContent>
						</Select>
						<Button variant="outline">Add</Button>
					</form>
					<p className="text-xs text-muted-foreground">
						Editors can change the band's songs and setlists. Viewers can open
						and play them.
					</p>
				</CardFooter>
			) : null}
			{inviting ? (
				<ShareDialog
					kind="invite"
					target={band.id}
					title={band.name}
					open
					onOpenChange={setInviting}
				/>
			) : null}
		</Card>
	);
}
