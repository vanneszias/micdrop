import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@chords/ui/components/alert-dialog";
import { Button } from "@chords/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@chords/ui/components/dialog";
import { Field, FieldLabel } from "@chords/ui/components/field";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@chords/ui/components/select";
import { Spinner } from "@chords/ui/components/spinner";
import { Textarea } from "@chords/ui/components/textarea";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "#/lib/songs";
import { isAdmin } from "./admin";
import { useApp } from "./app-context";
import { impersonate } from "./impersonation";

type Target = {
	id: string;
	name: string;
	role: string | null;
	banned: number | null;
};

function Confirm({
	trigger,
	title,
	description,
	action,
	onConfirm,
}: {
	trigger: React.ReactNode;
	title: string;
	description: string;
	action: string;
	onConfirm: () => void;
}) {
	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{title}</AlertDialogTitle>
					<AlertDialogDescription>{description}</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction onClick={onConfirm}>{action}</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

export function AccountActions({ target }: { target: Target }) {
	const { user, run, busy } = useApp();
	const queryClient = useQueryClient();
	const [banning, setBanning] = useState(false);
	const [days, setDays] = useState("7");
	const self = target.id === user?.id;
	const protectedAccount = self || isAdmin(target.role);
	const act = (body: Record<string, unknown>, success: string) =>
		run(async () => {
			await api("/api/admin", { ...body, userId: target.id });
			await queryClient.invalidateQueries({ queryKey: ["admin"] });
		}, success);
	return (
		<div className="flex flex-wrap gap-2">
			<Confirm
				trigger={
					<Button
						size="sm"
						variant="outline"
						disabled={busy || protectedAccount || !!target.banned}
					>
						Impersonate
					</Button>
				}
				title={`Act as ${target.name}?`}
				description="You get full access to their account for up to an hour. Everything you change is saved to their account and logged. Their songbook is removed from this browser when you stop."
				action="Impersonate"
				onConfirm={() => void run(() => impersonate(target.id))}
			/>
			<Confirm
				trigger={
					<Button size="sm" variant="outline" disabled={busy}>
						Sign out everywhere
					</Button>
				}
				title={`Sign ${target.name} out everywhere?`}
				description="Ends every browser session and revokes every assistant connection. They can sign in again."
				action="Sign out everywhere"
				onConfirm={() =>
					void act({ action: "sign_out" }, "Signed out everywhere")
				}
			/>
			{target.banned ? (
				<Confirm
					trigger={
						<Button size="sm" variant="outline" disabled={busy}>
							Lift ban
						</Button>
					}
					title={`Lift the ban on ${target.name}?`}
					description="They can sign in again, and the public arrangements the ban hid return to the catalogue."
					action="Lift ban"
					onConfirm={() => void act({ action: "unban" }, "Ban lifted")}
				/>
			) : (
				<Dialog open={banning} onOpenChange={setBanning}>
					<DialogTrigger asChild>
						<Button
							size="sm"
							variant="destructive"
							disabled={busy || protectedAccount}
						>
							Ban
						</Button>
					</DialogTrigger>
					<DialogContent>
						<form
							className="space-y-4"
							onSubmit={(event) => {
								event.preventDefault();
								const reason = new FormData(event.currentTarget).get("reason");
								void act(
									{
										action: "ban",
										reason,
										days: days === "forever" ? undefined : Number(days),
									},
									"Account banned",
								).then((done) => done && setBanning(false));
							}}
						>
							<DialogHeader>
								<DialogTitle>Ban {target.name}</DialogTitle>
								<DialogDescription>
									Signs them out everywhere, revokes assistant connections and
									hides their public arrangements until the ban ends.
								</DialogDescription>
							</DialogHeader>
							<Field>
								<FieldLabel htmlFor="ban-reason">Reason</FieldLabel>
								<Textarea
									id="ban-reason"
									name="reason"
									required
									minLength={3}
									maxLength={500}
									placeholder="Shown to them when they try to sign in"
								/>
							</Field>
							<Field>
								<FieldLabel htmlFor="ban-days">Duration</FieldLabel>
								<Select value={days} onValueChange={setDays}>
									<SelectTrigger id="ban-days" className="w-40">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="1">1 day</SelectItem>
										<SelectItem value="7">7 days</SelectItem>
										<SelectItem value="30">30 days</SelectItem>
										<SelectItem value="forever">Until lifted</SelectItem>
									</SelectContent>
								</Select>
							</Field>
							<DialogFooter>
								<Button variant="destructive" disabled={busy}>
									{busy ? <Spinner /> : null} Ban account
								</Button>
							</DialogFooter>
						</form>
					</DialogContent>
				</Dialog>
			)}
		</div>
	);
}
