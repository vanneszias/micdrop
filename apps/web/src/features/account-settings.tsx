import { Badge } from "@chords/ui/components/badge";
import { Button } from "@chords/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@chords/ui/components/dialog";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@chords/ui/components/field";
import { Input } from "@chords/ui/components/input";
import {
	Item,
	ItemActions,
	ItemContent,
	ItemDescription,
	ItemGroup,
	ItemTitle,
} from "@chords/ui/components/item";
import { Label } from "@chords/ui/components/label";
import { Spinner } from "@chords/ui/components/spinner";
import { Switch } from "@chords/ui/components/switch";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
	Copy,
	KeyRound,
	LogOut,
	Mail,
	Monitor,
	Plus,
	ShieldCheck,
	Smartphone,
	Trash2,
} from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";
import { toast } from "sonner";
import { renderSVG } from "uqr";
import { authClient } from "#/lib/auth-client";

type Result<T> = {
	data: T | null;
	error: { message?: string; code?: string; status?: number } | null;
};

/** Unwraps a Better Auth client result, turning its refusals into readable errors. */
async function must<T>(promise: Promise<Result<T>>) {
	const { data, error } = await promise;
	if (error) {
		if (
			error.code === "SESSION_EXPIRED" ||
			error.code === "SESSION_NOT_FRESH" ||
			error.code === "SESSION_IS_NOT_FRESH"
		)
			throw new Error(
				"For your security, sign out and sign back in, then try again.",
			);
		throw new Error(error.message || "Something went wrong. Try again.");
	}
	return data as T;
}

function useBusy() {
	const [busy, setBusy] = useState(false);
	const run = async (action: () => Promise<unknown>, success?: string) => {
		setBusy(true);
		try {
			await action();
			if (success) toast.success(success);
			return true;
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Something went wrong.",
			);
			return false;
		} finally {
			setBusy(false);
		}
	};
	return [busy, run] as const;
}

function Section({
	title,
	description,
	children,
}: {
	title: string;
	description?: ReactNode;
	children: ReactNode;
}) {
	return (
		<section className="space-y-3 rounded-xl border bg-card p-4 sm:p-5">
			<div className="space-y-1">
				<h2 className="font-semibold">{title}</h2>
				{description ? (
					<p className="text-sm text-muted-foreground">{description}</p>
				) : null}
			</div>
			{children}
		</section>
	);
}

function PasswordInput({
	id,
	label,
	autoComplete = "current-password",
	minLength,
}: {
	id: string;
	label: string;
	autoComplete?: string;
	minLength?: number;
}) {
	return (
		<Field>
			<FieldLabel htmlFor={id}>{label}</FieldLabel>
			<Input
				id={id}
				name={id}
				type="password"
				required
				minLength={minLength}
				autoComplete={autoComplete}
			/>
		</Field>
	);
}

const formValue = (event: FormEvent<HTMLFormElement>, name: string) =>
	String(new FormData(event.currentTarget).get(name) ?? "");

/** Everything about signing in, for the signed-in account itself. */
export function AccountSettings() {
	const { data: session, refetch } = authClient.useSession();
	const accounts = useQuery({
		queryKey: ["auth", "accounts"],
		queryFn: () => must(authClient.listAccounts()),
	});
	if (!session) return null;
	const user = session.user;
	const hasPassword = !!accounts.data?.some(
		(account) => account.providerId === "credential",
	);
	const refresh = async () => {
		await refetch();
	};
	return (
		<>
			<ProfileSection name={user.name} refresh={refresh} />
			<EmailSection
				email={user.email}
				verified={user.emailVerified}
				refresh={refresh}
			/>
			<PasswordSection
				email={user.email}
				hasPassword={hasPassword}
				loading={accounts.isPending}
			/>
			<SignInMethodsSection
				accounts={accounts.data ?? []}
				refreshAccounts={() => accounts.refetch()}
			/>
			<TwoFactorSection
				enabled={!!(user as { twoFactorEnabled?: boolean }).twoFactorEnabled}
				hasPassword={hasPassword}
				loading={accounts.isPending}
				refresh={refresh}
			/>
			<SessionsSection currentToken={session.session.token} />
			<DeleteAccountSection
				userId={user.id}
				email={user.email}
				hasPassword={hasPassword}
			/>
		</>
	);
}

function ProfileSection({
	name,
	refresh,
}: {
	name: string;
	refresh: () => Promise<void>;
}) {
	const [busy, run] = useBusy();
	return (
		<Section title="Profile" description="Your name shows to your bandmates.">
			<form
				className="flex flex-col gap-2 sm:flex-row sm:items-end"
				onSubmit={(event) => {
					event.preventDefault();
					const value = formValue(event, "name").trim();
					void run(async () => {
						await must(authClient.updateUser({ name: value }));
						await refresh();
					}, "Name saved");
				}}
			>
				<Field className="flex-1">
					<FieldLabel htmlFor="profile-name">Name</FieldLabel>
					<Input
						id="profile-name"
						name="name"
						defaultValue={name}
						required
						maxLength={100}
						autoComplete="name"
					/>
				</Field>
				<Button variant="outline" disabled={busy}>
					{busy ? <Spinner /> : null} Save name
				</Button>
			</form>
		</Section>
	);
}

function EmailSection({
	email,
	verified,
	refresh,
}: {
	email: string;
	verified: boolean;
	refresh: () => Promise<void>;
}) {
	const [busy, run] = useBusy();
	const [changing, setChanging] = useState(false);
	const [notice, setNotice] = useState("");
	return (
		<Section
			title="Email address"
			description="Used to sign in, recover your account and receive band invitations."
		>
			<div className="flex flex-wrap items-center gap-2 text-sm">
				<Mail className="size-4 text-muted-foreground" />
				<span className="font-medium break-all">{email}</span>
				{verified ? (
					<Badge variant="secondary">
						<ShieldCheck /> Verified
					</Badge>
				) : (
					<Badge variant="outline">Unverified</Badge>
				)}
			</div>
			{notice ? <output className="block text-sm">{notice}</output> : null}
			<div className="flex flex-wrap gap-2">
				{verified ? null : (
					<Button
						variant="outline"
						disabled={busy}
						onClick={() =>
							void run(async () => {
								await must(
									authClient.sendVerificationEmail({
										email,
										callbackURL: "/settings?email=verified",
									}),
								);
								setNotice(
									`We sent a verification link to ${email}. Check your inbox and spam folder.`,
								);
							})
						}
					>
						Send verification link
					</Button>
				)}
				{changing ? null : (
					<Button variant="outline" onClick={() => setChanging(true)}>
						Change email
					</Button>
				)}
			</div>
			{changing ? (
				<form
					className="flex flex-col gap-2 sm:flex-row sm:items-end"
					onSubmit={(event) => {
						event.preventDefault();
						const newEmail = formValue(event, "new-email").trim();
						void run(async () => {
							await must(
								authClient.changeEmail({
									newEmail,
									callbackURL: "/settings?email=changed",
								}),
							);
							setChanging(false);
							setNotice(
								verified
									? `To keep your account safe, approve the change from the link we sent to ${email}. Then confirm ${newEmail} from the link we send there.`
									: `Confirm ${newEmail} from the link we sent there. Your email changes once you do.`,
							);
							await refresh();
						});
					}}
				>
					<Field className="flex-1">
						<FieldLabel htmlFor="new-email">New email address</FieldLabel>
						<Input
							id="new-email"
							name="new-email"
							type="email"
							required
							autoComplete="email"
						/>
					</Field>
					<div className="flex gap-2">
						<Button disabled={busy}>
							{busy ? <Spinner /> : null} Send link
						</Button>
						<Button
							type="button"
							variant="ghost"
							onClick={() => setChanging(false)}
						>
							Cancel
						</Button>
					</div>
				</form>
			) : null}
		</Section>
	);
}

function PasswordSection({
	email,
	hasPassword,
	loading,
}: {
	email: string;
	hasPassword: boolean;
	loading: boolean;
}) {
	const [busy, run] = useBusy();
	const [signOutOthers, setSignOutOthers] = useState(true);
	const [sent, setSent] = useState(false);
	if (loading)
		return (
			<Section title="Password">
				<Spinner />
			</Section>
		);
	if (!hasPassword)
		return (
			<Section
				title="Password"
				description="You sign in with Google or a passkey. Add a password to also sign in with your email address."
			>
				{sent ? (
					<output className="block text-sm">
						We sent a link to {email}. Choosing a password there signs you out
						everywhere, so sign back in with your new password afterwards.
					</output>
				) : (
					<Button
						variant="outline"
						disabled={busy}
						onClick={() =>
							void run(async () => {
								await must(
									authClient.requestPasswordReset({
										email,
										redirectTo: "/login?action=reset",
									}),
								);
								setSent(true);
							})
						}
					>
						<KeyRound /> Email me a link to set a password
					</Button>
				)}
			</Section>
		);
	return (
		<Section title="Password" description="Use at least 10 characters.">
			<form
				className="space-y-3"
				onSubmit={(event) => {
					event.preventDefault();
					const form = event.currentTarget;
					const currentPassword = formValue(event, "current-password");
					const newPassword = formValue(event, "new-password");
					void run(async () => {
						await must(
							authClient.changePassword({
								currentPassword,
								newPassword,
								revokeOtherSessions: signOutOthers,
							}),
						);
						form.reset();
					}, "Password changed");
				}}
			>
				<FieldGroup className="gap-3 sm:grid sm:grid-cols-2">
					<PasswordInput id="current-password" label="Current password" />
					<PasswordInput
						id="new-password"
						label="New password"
						autoComplete="new-password"
						minLength={10}
					/>
				</FieldGroup>
				<div className="flex items-center gap-2">
					<Switch
						id="sign-out-others"
						checked={signOutOthers}
						onCheckedChange={setSignOutOthers}
					/>
					<Label htmlFor="sign-out-others">Sign out my other devices</Label>
				</div>
				<Button variant="outline" disabled={busy}>
					{busy ? <Spinner /> : null} Change password
				</Button>
			</form>
		</Section>
	);
}

function GoogleIcon() {
	return (
		<svg viewBox="0 0 24 24" aria-hidden="true" className="size-4">
			<path
				d="M12.48 10.92v3.28h7.84c-.24 1.84-.85 3.18-1.73 4.1-1.05 1.05-2.7 2.2-5.54 2.2-4.4 0-7.84-3.55-7.84-7.95s3.44-7.95 7.84-7.95c2.38 0 4.12.93 5.4 2.13l2.31-2.31C18.78 1.25 16.4 0 12.48 0 5.87 0 .31 5.39.31 12s5.56 12 12.17 12c3.57 0 6.26-1.17 8.37-3.36 2.16-2.16 2.84-5.21 2.84-7.67 0-.76-.05-1.46-.18-2.05z"
				fill="currentColor"
			/>
		</svg>
	);
}

const dateFormat = new Intl.DateTimeFormat(undefined, {
	dateStyle: "medium",
	timeStyle: "short",
});
const when = (value: Date | string | null | undefined) =>
	value ? dateFormat.format(new Date(value)) : "unknown";

function SignInMethodsSection({
	accounts,
	refreshAccounts,
}: {
	accounts: { id: string; providerId: string }[];
	refreshAccounts: () => Promise<unknown>;
}) {
	const [busy, run] = useBusy();
	const [adding, setAdding] = useState(false);
	const queryClient = useQueryClient();
	const passkeys = useQuery({
		queryKey: ["auth", "passkeys"],
		queryFn: () => must(authClient.passkey.listUserPasskeys()),
	});
	const google = accounts.find((account) => account.providerId === "google");
	// Better Auth refuses to unlink the last account, so Google stays until a password exists.
	const lastAccount = accounts.length <= 1;
	return (
		<Section
			title="Sign-in methods"
			description="Ways you can sign in besides your email and password."
		>
			<ItemGroup className="gap-2">
				<Item variant="outline" size="sm">
					<GoogleIcon />
					<ItemContent>
						<ItemTitle>Google</ItemTitle>
						<ItemDescription>
							{google
								? "Connected"
								: "Sign in with the Google account that uses your email address."}
						</ItemDescription>
					</ItemContent>
					<ItemActions>
						{google ? (
							<Button
								size="sm"
								variant="outline"
								disabled={busy || lastAccount}
								title={
									lastAccount
										? "Add a password before disconnecting Google."
										: undefined
								}
								onClick={() =>
									void run(async () => {
										await must(
											authClient.unlinkAccount({ accountId: google.id }),
										);
										await refreshAccounts();
									}, "Google disconnected")
								}
							>
								Disconnect
							</Button>
						) : (
							<Button
								size="sm"
								variant="outline"
								disabled={busy}
								onClick={() =>
									void run(async () => {
										await must(
											authClient.linkSocial({
												provider: "google",
												callbackURL: "/settings?linked=google",
												errorCallbackURL: "/settings",
											}),
										);
									})
								}
							>
								Connect
							</Button>
						)}
					</ItemActions>
				</Item>
				{passkeys.data?.map((passkey) => (
					<Item key={passkey.id} variant="outline" size="sm">
						<KeyRound className="size-4" />
						<ItemContent>
							<ItemTitle>{passkey.name || "Passkey"}</ItemTitle>
							<ItemDescription>Added {when(passkey.createdAt)}</ItemDescription>
						</ItemContent>
						<ItemActions>
							<Button
								size="icon-sm"
								variant="ghost"
								aria-label={`Remove passkey ${passkey.name || ""}`}
								disabled={busy}
								onClick={() =>
									void run(async () => {
										await must(
											authClient.passkey.deletePasskey({ id: passkey.id }),
										);
										await queryClient.invalidateQueries({
											queryKey: ["auth", "passkeys"],
										});
									}, "Passkey removed")
								}
							>
								<Trash2 />
							</Button>
						</ItemActions>
					</Item>
				))}
			</ItemGroup>
			<Button variant="outline" onClick={() => setAdding(true)}>
				<Plus /> Add a passkey
			</Button>
			<p className="text-sm text-muted-foreground">
				Passkeys let you sign in with your fingerprint, face or device PIN
				instead of a password.
			</p>
			<AddPasskeyDialog
				open={adding}
				onOpenChange={setAdding}
				onAdded={() =>
					queryClient.invalidateQueries({ queryKey: ["auth", "passkeys"] })
				}
			/>
		</Section>
	);
}

function AddPasskeyDialog({
	open,
	onOpenChange,
	onAdded,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onAdded: () => Promise<unknown>;
}) {
	const [busy, run] = useBusy();
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-sm">
				<DialogHeader>
					<DialogTitle>Add a passkey</DialogTitle>
					<DialogDescription>
						Name it after the device or password manager that keeps it, so you
						can tell your passkeys apart.
					</DialogDescription>
				</DialogHeader>
				<form
					className="space-y-4"
					onSubmit={(event) => {
						event.preventDefault();
						const name = formValue(event, "passkey-name").trim();
						void run(async () => {
							await must(
								authClient.passkey.addPasskey({ name: name || undefined }),
							);
							await onAdded();
							onOpenChange(false);
						}, "Passkey added");
					}}
				>
					<Field>
						<FieldLabel htmlFor="passkey-name">Name</FieldLabel>
						<Input
							id="passkey-name"
							name="passkey-name"
							placeholder="My phone"
							maxLength={100}
						/>
					</Field>
					<DialogFooter>
						<Button disabled={busy}>
							{busy ? <Spinner /> : null} Continue
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function BackupCodes({ codes }: { codes: string[] }) {
	return (
		<div className="space-y-2">
			<ul className="grid grid-cols-2 gap-1 rounded-lg border bg-muted/40 p-3 font-mono text-sm">
				{codes.map((code) => (
					<li key={code}>{code}</li>
				))}
			</ul>
			<Button
				type="button"
				variant="outline"
				size="sm"
				onClick={() =>
					void navigator.clipboard
						.writeText(codes.join("\n"))
						.then(() => toast.success("Backup codes copied"))
				}
			>
				<Copy /> Copy codes
			</Button>
			<p className="text-sm text-muted-foreground">
				Each code works once. Keep them somewhere safe, such as your password
				manager, in case you lose your authenticator.
			</p>
		</div>
	);
}

type TwoFactorStep =
	| { kind: "closed" }
	| { kind: "password"; purpose: "enable" | "disable" | "codes" }
	| { kind: "scan"; totpURI: string; backupCodes: string[] }
	| { kind: "codes"; backupCodes: string[] };

function TwoFactorSection({
	enabled,
	hasPassword,
	loading,
	refresh,
}: {
	enabled: boolean;
	hasPassword: boolean;
	loading: boolean;
	refresh: () => Promise<void>;
}) {
	const [busy, run] = useBusy();
	const [step, setStep] = useState<TwoFactorStep>({ kind: "closed" });
	const close = () => setStep({ kind: "closed" });
	const secret =
		step.kind === "scan"
			? (new URL(step.totpURI).searchParams.get("secret") ?? "")
			: "";
	return (
		<Section
			title="Two-factor authentication"
			description="Ask for a code from an authenticator app, such as 1Password, Google Authenticator or Authy, when you sign in with your password."
		>
			<div className="flex flex-wrap items-center gap-2">
				{enabled ? (
					<Badge variant="secondary">
						<ShieldCheck /> On
					</Badge>
				) : (
					<Badge variant="outline">Off</Badge>
				)}
			</div>
			{loading ? null : !hasPassword ? (
				<p className="text-sm text-muted-foreground">
					Add a password first. Codes protect password sign-in; Google and
					passkeys already check a second factor themselves.
				</p>
			) : enabled ? (
				<div className="flex flex-wrap gap-2">
					<Button
						variant="outline"
						onClick={() => setStep({ kind: "password", purpose: "codes" })}
					>
						New backup codes
					</Button>
					<Button
						variant="outline"
						onClick={() => setStep({ kind: "password", purpose: "disable" })}
					>
						Turn off
					</Button>
				</div>
			) : (
				<Button
					variant="outline"
					onClick={() => setStep({ kind: "password", purpose: "enable" })}
				>
					<Smartphone /> Set up authenticator app
				</Button>
			)}
			<Dialog
				open={step.kind !== "closed"}
				onOpenChange={(open) => {
					if (!open) close();
				}}
			>
				<DialogContent className="sm:max-w-md">
					{step.kind === "password" ? (
						<form
							className="space-y-4"
							onSubmit={(event) => {
								event.preventDefault();
								const password = formValue(event, "2fa-password");
								void run(async () => {
									if (step.purpose === "enable") {
										const result = await must(
											authClient.twoFactor.enable({ password }),
										);
										if (result.method !== "totp")
											throw new Error("Authenticator setup is unavailable.");
										setStep({
											kind: "scan",
											totpURI: result.totpURI,
											backupCodes: result.backupCodes,
										});
									} else if (step.purpose === "disable") {
										await must(authClient.twoFactor.disable({ password }));
										await refresh();
										close();
										toast.success("Two-factor authentication is off");
									} else {
										const result = await must(
											authClient.twoFactor.generateBackupCodes({ password }),
										);
										setStep({ kind: "codes", backupCodes: result.backupCodes });
									}
								});
							}}
						>
							<DialogHeader>
								<DialogTitle>Confirm your password</DialogTitle>
								<DialogDescription>
									{
										{
											enable:
												"Enter your password to set up an authenticator app.",
											disable:
												"Enter your password to stop asking for codes at sign-in.",
											codes:
												"Enter your password to replace your backup codes. The old ones stop working.",
										}[step.purpose]
									}
								</DialogDescription>
							</DialogHeader>
							<PasswordInput id="2fa-password" label="Password" />
							<DialogFooter>
								<Button disabled={busy}>
									{busy ? <Spinner /> : null} Continue
								</Button>
							</DialogFooter>
						</form>
					) : step.kind === "scan" ? (
						<form
							className="space-y-4"
							onSubmit={(event) => {
								event.preventDefault();
								const code = formValue(event, "totp-code").trim();
								void run(async () => {
									await must(authClient.twoFactor.verifyTotp({ code }));
									await refresh();
									setStep({ kind: "codes", backupCodes: step.backupCodes });
								}, "Two-factor authentication is on");
							}}
						>
							<DialogHeader>
								<DialogTitle>Scan with your authenticator app</DialogTitle>
								<DialogDescription>
									Scan the code, or enter the key by hand, then type the 6-digit
									code the app shows.
								</DialogDescription>
							</DialogHeader>
							<div
								role="img"
								aria-label="QR code for your authenticator app"
								className="mx-auto size-48 rounded-lg bg-white p-2 text-black [&_svg]:size-full"
								// The SVG is generated locally from the setup link; it contains no user input.
								// biome-ignore lint/security/noDangerouslySetInnerHtml: generated QR code
								dangerouslySetInnerHTML={{
									__html: renderSVG(step.totpURI, { border: 1 }),
								}}
							/>
							<p className="text-center font-mono text-xs break-all text-muted-foreground">
								{secret}
							</p>
							<Field>
								<FieldLabel htmlFor="totp-code">Code</FieldLabel>
								<Input
									id="totp-code"
									name="totp-code"
									inputMode="numeric"
									autoComplete="one-time-code"
									pattern="[0-9]{6}"
									maxLength={6}
									required
								/>
							</Field>
							<DialogFooter>
								<Button disabled={busy}>
									{busy ? <Spinner /> : null} Turn on
								</Button>
							</DialogFooter>
						</form>
					) : step.kind === "codes" ? (
						<div className="space-y-4">
							<DialogHeader>
								<DialogTitle>Save your backup codes</DialogTitle>
								<DialogDescription>
									Use one instead of an app code if you lose your phone.
								</DialogDescription>
							</DialogHeader>
							<BackupCodes codes={step.backupCodes} />
							<DialogFooter>
								<Button onClick={close}>Done</Button>
							</DialogFooter>
						</div>
					) : null}
				</DialogContent>
			</Dialog>
		</Section>
	);
}

/** A readable device label from a user agent, such as "Safari on iPhone". */
function device(userAgent: string | null | undefined) {
	if (!userAgent) return "Unknown device";
	const browser = /Edg\//.test(userAgent)
		? "Edge"
		: /Firefox\//.test(userAgent)
			? "Firefox"
			: /Chrome\//.test(userAgent)
				? "Chrome"
				: /Safari\//.test(userAgent)
					? "Safari"
					: "";
	const system = /iPhone/.test(userAgent)
		? "iPhone"
		: /iPad/.test(userAgent)
			? "iPad"
			: /Android/.test(userAgent)
				? "Android"
				: /Mac OS X/.test(userAgent)
					? "Mac"
					: /Windows/.test(userAgent)
						? "Windows"
						: /Linux/.test(userAgent)
							? "Linux"
							: "";
	if (browser && system) return `${browser} on ${system}`;
	return browser || system || "Unknown device";
}

function SessionsSection({ currentToken }: { currentToken: string }) {
	const [busy, run] = useBusy();
	const sessions = useQuery({
		queryKey: ["auth", "sessions"],
		queryFn: () => must(authClient.listSessions()),
	});
	const sorted = [...(sessions.data ?? [])].sort(
		(a, b) =>
			Number(b.token === currentToken) - Number(a.token === currentToken) ||
			new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
	);
	const others = sorted.filter((row) => row.token !== currentToken);
	return (
		<Section
			title="Where you're signed in"
			description="Sign out a device you don't recognise or no longer use."
		>
			{sessions.isPending ? <Spinner /> : null}
			<ItemGroup className="gap-2">
				{sorted.map((row) => {
					const current = row.token === currentToken;
					return (
						<Item key={row.id} variant="outline" size="sm">
							<Monitor className="size-4" />
							<ItemContent>
								<ItemTitle>
									{device(row.userAgent)}
									{current ? (
										<Badge variant="secondary">This device</Badge>
									) : null}
								</ItemTitle>
								<ItemDescription>
									Active {when(row.updatedAt)}
									{row.ipAddress ? ` · ${row.ipAddress}` : ""}
								</ItemDescription>
							</ItemContent>
							{current ? null : (
								<ItemActions>
									<Button
										size="sm"
										variant="outline"
										disabled={busy}
										onClick={() =>
											void run(async () => {
												await must(
													authClient.revokeSession({ token: row.token }),
												);
												await sessions.refetch();
											}, "Device signed out")
										}
									>
										Sign out
									</Button>
								</ItemActions>
							)}
						</Item>
					);
				})}
			</ItemGroup>
			{others.length > 1 ? (
				<Button
					variant="outline"
					disabled={busy}
					onClick={() =>
						void run(async () => {
							await must(authClient.revokeOtherSessions());
							await sessions.refetch();
						}, "Other devices signed out")
					}
				>
					<LogOut /> Sign out all other devices
				</Button>
			) : null}
		</Section>
	);
}

function DeleteAccountSection({
	userId,
	email,
	hasPassword,
}: {
	userId: string;
	email: string;
	hasPassword: boolean;
}) {
	const [busy, run] = useBusy();
	const [open, setOpen] = useState(false);
	const [confirm, setConfirm] = useState("");
	return (
		<Section
			title="Delete account"
			description="Removes your account with your personal songs and setlists. Bands you own alone have to be deleted or handed over first."
		>
			<Button variant="destructive" onClick={() => setOpen(true)}>
				<Trash2 /> Delete my account
			</Button>
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="sm:max-w-md">
					<form
						className="space-y-4"
						onSubmit={(event) => {
							event.preventDefault();
							const password = hasPassword
								? formValue(event, "delete-password")
								: undefined;
							void run(async () => {
								await must(authClient.deleteUser({ password }));
								// Forget this device's copy of the deleted songbook too.
								try {
									localStorage.removeItem("chords:account");
									indexedDB.deleteDatabase(`chords:${userId}`);
								} catch {
									/* Storage may be unavailable; the account is gone either way. */
								}
								window.location.assign("/");
							});
						}}
					>
						<DialogHeader>
							<DialogTitle>Delete your account?</DialogTitle>
							<DialogDescription>
								This can't be undone. Your songs, setlists, passkeys and
								assistant connections are removed. Songs you shared with a band
								stay with that band.
							</DialogDescription>
						</DialogHeader>
						<FieldGroup className="gap-3">
							<Field>
								<FieldLabel htmlFor="delete-confirm">
									Type your email address to confirm
								</FieldLabel>
								<Input
									id="delete-confirm"
									value={confirm}
									onChange={(event) => setConfirm(event.target.value)}
									autoComplete="off"
									placeholder={email}
								/>
							</Field>
							{hasPassword ? (
								<PasswordInput id="delete-password" label="Password" />
							) : (
								<FieldDescription>
									If you signed in more than a day ago, sign out and back in
									first.
								</FieldDescription>
							)}
						</FieldGroup>
						<DialogFooter>
							<Button
								variant="destructive"
								disabled={
									busy || confirm.trim().toLowerCase() !== email.toLowerCase()
								}
							>
								{busy ? <Spinner /> : null} Delete account
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>
		</Section>
	);
}
