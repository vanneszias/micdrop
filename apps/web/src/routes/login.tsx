import { SongSheet } from "@chords/song-ui";
import { Button } from "@chords/ui/components/button";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
	FieldSeparator,
} from "@chords/ui/components/field";
import { Input } from "@chords/ui/components/input";
import { Spinner } from "@chords/ui/components/spinner";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, Music } from "lucide-react";
import { useCallback, useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { TURNSTILE_SITE_KEY, Turnstile } from "#/features/turnstile";
import { reportClientError } from "#/integrations/sentry/client";
import {
	authClient,
	pendingAuthorization,
	returnPath,
} from "#/lib/auth-client";

export const Route = createFileRoute("/login")({
	validateSearch: (
		search: Record<string, unknown>,
	): { token?: string; error?: string; action?: string } => ({
		token: typeof search.token === "string" ? search.token : undefined,
		error: typeof search.error === "string" ? search.error : undefined,
		action: typeof search.action === "string" ? search.action : undefined,
	}),
	head: () => ({ meta: [{ title: "Sign in · Mic Drop" }] }),
	component: Login,
});

const NOTE_PATHS = {
	eighth: (
		<>
			<ellipse cx="0" cy="18" rx="8" ry="6" stroke="none" />
			<path d="M7 18V-10q2 10 12 14" fill="none" />
		</>
	),
	quarter: (
		<>
			<ellipse cx="0" cy="18" rx="8" ry="6" stroke="none" />
			<path d="M7 18V-14" fill="none" />
		</>
	),
	beamed: (
		<>
			<ellipse cx="0" cy="18" rx="8" ry="6" stroke="none" />
			<ellipse cx="24" cy="12" rx="8" ry="6" stroke="none" />
			<path d="M7 18V-6L31 -12V12M7 -6v6l24-6v-6z" fill="none" />
		</>
	),
};

const TILE = 900;
const CELL = 75;

// Seeded so server and client render the same scatter.
function scatter() {
	let seed = 7;
	const random = () => {
		seed = (seed * 1664525 + 1013904223) % 4294967296;
		return seed / 4294967296;
	};
	const kinds = Object.keys(NOTE_PATHS) as (keyof typeof NOTE_PATHS)[];
	const notes: {
		kind: keyof typeof NOTE_PATHS;
		x: number;
		y: number;
		r: number;
		k: number;
	}[] = [];
	for (let row = 0; row < TILE / CELL; row++) {
		for (let col = 0; col < TILE / CELL; col++) {
			if (random() < 0.45) continue;
			notes.push({
				kind: kinds[Math.floor(random() * kinds.length)],
				x: col * CELL + random() * CELL * 0.8,
				y: row * CELL + random() * CELL * 0.8,
				r: random() * 70 - 35,
				k: 0.28 + random() * 0.18,
			});
		}
	}
	return notes;
}

const NOTES = scatter();

function NotesBackground({ className }: { className?: string }) {
	const id = useId();
	return (
		<svg
			aria-hidden="true"
			className={`pointer-events-none absolute inset-0 size-full text-foreground opacity-[0.07] ${className ?? ""}`}
		>
			<defs>
				<pattern
					id={id}
					width={TILE}
					height={TILE}
					patternUnits="userSpaceOnUse"
				>
					<g fill="currentColor" stroke="currentColor" strokeWidth="2.5">
						{NOTES.map(({ kind, x, y, r, k }) => (
							<g
								key={`${x}-${y}`}
								transform={`translate(${x} ${y}) rotate(${r}) scale(${k})`}
							>
								{NOTE_PATHS[kind]}
							</g>
						))}
					</g>
				</pattern>
			</defs>
			<rect width="100%" height="100%" fill={`url(#${id})`} />
		</svg>
	);
}

function Login() {
	const navigate = useNavigate();
	const { data: session } = authClient.useSession();
	const search = Route.useSearch();
	const [mode, setMode] = useState<
		"signin" | "signup" | "forgot" | "reset" | "verify"
	>(
		search.action === "reset"
			? "reset"
			: search.action === "verify" || search.error
				? "verify"
				: "signin",
	);
	const [notice, setNotice] = useState(
		search.error
			? "This email link is invalid or expired. Request a new one."
			: search.action === "verified"
				? "Your email address is verified. You can sign in."
				: "",
	);
	const authenticating = mode === "signin" || mode === "signup";
	const [busy, setBusy] = useState(false);
	const [reveal, setReveal] = useState(false);
	const [captcha, setCaptcha] = useState("");
	const [attempt, setAttempt] = useState(0);
	const needsCaptcha = mode === "signup" && !!TURNSTILE_SITE_KEY;
	// An assistant connecting over MCP sent the user here; resume its authorization.
	const done = useCallback(async () => {
		const authorization = pendingAuthorization();
		if (authorization) window.location.assign(authorization);
		else await navigate({ href: returnPath() ?? "/songs", replace: true });
	}, [navigate]);
	useEffect(() => {
		if (session && authenticating) void done();
	}, [session, done, authenticating]);
	const run = async (action: () => Promise<void>) => {
		setBusy(true);
		try {
			await action();
		} catch (error) {
			reportClientError(error, "auth.sign_in");
			toast.error(error instanceof Error ? error.message : "Sign-in failed.");
		} finally {
			setBusy(false);
		}
	};
	return (
		<div className="relative grid min-h-svh overflow-hidden lg:grid-cols-2">
			<div className="relative flex flex-col gap-4 p-6 md:p-10">
				<Link to="/songs" className="flex items-center gap-2 font-semibold">
					<span className="flex size-8 items-center justify-center rounded-lg bg-brand text-brand-foreground">
						<Music className="size-4" />
					</span>
					Mic Drop
				</Link>
				<div className="flex flex-1 items-center justify-center">
					<form
						className="w-full max-w-xs"
						onSubmit={(event) => {
							event.preventDefault();
							const form = new FormData(event.currentTarget);
							const email = String(form.get("email"));
							const password = String(form.get("password"));
							void run(async () => {
								setNotice("");
								if (mode === "forgot" || mode === "verify") {
									const result =
										mode === "forgot"
											? await authClient.requestPasswordReset({
													email,
													redirectTo: "/login?action=reset",
												})
											: await authClient.sendVerificationEmail({
													email,
													callbackURL: "/login?action=verified",
												});
									if (result.error) throw new Error(result.error.message);
									setNotice(
										"If this address has an eligible account, an email is on its way. Check your inbox and spam folder.",
									);
									return;
								}
								if (mode === "reset") {
									if (!search.token || search.error)
										throw new Error(
											"This reset link is invalid or expired. Request a new one.",
										);
									const result = await authClient.resetPassword({
										newPassword: password,
										token: search.token,
									});
									if (result.error) throw new Error(result.error.message);
									// Clear the spent token, and the session revoked by the reset.
									window.location.replace("/login");
									return;
								}
								const result =
									mode === "signup"
										? await authClient.signUp.email({
												email,
												password,
												name: String(form.get("name")),
												callbackURL: "/login?action=verified",
												fetchOptions: {
													headers: { "x-captcha-response": captcha },
												},
											})
										: await authClient.signIn.email({ email, password });
								if (result.error) {
									// Turnstile tokens work once; get a fresh one for the retry.
									if (needsCaptcha) {
										setCaptcha("");
										setAttempt((value) => value + 1);
									}
									throw new Error(result.error.message);
								}
								if (mode === "signup")
									toast.success(
										"Welcome! Check your inbox to verify your email address.",
									);
								await done();
							});
						}}
					>
						<FieldGroup>
							{/* Phones get a small taste of the chord sheet the desktop panel shows. */}
							<figure className="order-last rounded-xl border bg-card px-4 py-3 lg:hidden">
								<figcaption className="mb-2 flex items-baseline justify-between gap-3">
									<span className="text-sm font-semibold">Amazing Grace</span>
									<span className="text-[13px] text-muted-foreground">
										Key G · Verse 1
									</span>
								</figcaption>
								<SongSheet
									fontSize={15}
									content={
										"A[G]mazing [G7]grace, how [C]sweet the [G]sound\nThat [G]saved a [Em]wretch like [D]me"
									}
								/>
							</figure>
							<div className="flex flex-col items-center gap-1 text-center">
								<h1 className="text-2xl font-bold">
									{
										{
											signin: "Sign in to Mic Drop",
											signup: "Create your account",
											forgot: "Forgot your password?",
											reset: "Choose a new password",
											verify: "Verify your email",
										}[mode]
									}
								</h1>
								<p className="text-sm text-balance text-muted-foreground">
									{authenticating
										? "Songs stay on this device. Sign in to sync them."
										: mode === "reset"
											? "Use at least 10 characters for your new password."
											: "Enter your account email and we’ll send you a link."}
								</p>
							</div>
							{mode === "signup" ? (
								<Field>
									<FieldLabel htmlFor="name">Name</FieldLabel>
									<Input id="name" name="name" required autoComplete="name" />
								</Field>
							) : null}
							{notice ? <output className="text-sm">{notice}</output> : null}
							{mode !== "reset" ? (
								<Field>
									<FieldLabel htmlFor="email">Email</FieldLabel>
									<Input
										id="email"
										name="email"
										type="email"
										placeholder="you@example.com"
										required
										autoComplete="email"
									/>
								</Field>
							) : null}
							{authenticating || mode === "reset" ? (
								<Field>
									<FieldLabel htmlFor="password">Password</FieldLabel>
									<div className="relative">
										<Input
											id="password"
											name="password"
											type={reveal ? "text" : "password"}
											required
											minLength={10}
											className="pr-10"
											autoComplete={
												mode !== "signin" ? "new-password" : "current-password"
											}
										/>
										<Button
											type="button"
											variant="ghost"
											size="icon-sm"
											className="absolute top-1/2 right-1 -translate-y-1/2 text-muted-foreground"
											aria-label={reveal ? "Hide password" : "Show password"}
											aria-pressed={reveal}
											onClick={() => setReveal((value) => !value)}
										>
											{reveal ? <EyeOff /> : <Eye />}
										</Button>
									</div>
									{mode === "signup" ? (
										<FieldDescription>
											Must be at least 10 characters long.
										</FieldDescription>
									) : null}
								</Field>
							) : null}
							{needsCaptcha ? (
								<Turnstile key={attempt} onToken={setCaptcha} />
							) : null}
							<Field>
								<Button disabled={busy || (needsCaptcha && !captcha)}>
									{busy ? <Spinner /> : null}
									{
										{
											signin: "Sign in",
											signup: "Create account",
											forgot: "Send reset link",
											reset: "Save new password",
											verify: "Send verification link",
										}[mode]
									}
								</Button>
							</Field>
							{mode === "signin" || !authenticating ? (
								<FieldDescription className="flex flex-wrap justify-center gap-3">
									{mode !== "forgot" ? (
										<button
											type="button"
											disabled={busy}
											className="underline underline-offset-4"
											onClick={() => {
												setMode("forgot");
												setNotice("");
											}}
										>
											Forgot password?
										</button>
									) : null}
									{mode === "signin" ? (
										<button
											type="button"
											disabled={busy}
											className="underline underline-offset-4"
											onClick={() => {
												setMode("verify");
												setNotice("");
											}}
										>
											Resend verification email
										</button>
									) : (
										<button
											type="button"
											disabled={busy}
											className="underline underline-offset-4"
											onClick={() => {
												setMode("signin");
												setNotice("");
											}}
										>
											Back to sign in
										</button>
									)}
								</FieldDescription>
							) : null}
							{authenticating ? (
								<>
									<FieldSeparator>Or continue with</FieldSeparator>
									<Field>
										<Button
											type="button"
											variant="outline"
											disabled={busy}
											onClick={() =>
												void run(async () => {
													const result = await authClient.signIn.social({
														provider: "google",
														callbackURL: pendingAuthorization()
															? window.location.href
															: (returnPath() ?? "/songs"),
													});
													if (result.error)
														throw new Error(
															"Google sign-in isn’t configured on the server.",
														);
												})
											}
										>
											<svg viewBox="0 0 24 24" aria-hidden="true">
												<path
													d="M12.48 10.92v3.28h7.84c-.24 1.84-.85 3.18-1.73 4.1-1.05 1.05-2.7 2.2-5.54 2.2-4.4 0-7.84-3.55-7.84-7.95s3.44-7.95 7.84-7.95c2.38 0 4.12.93 5.4 2.13l2.31-2.31C18.78 1.25 16.4 0 12.48 0 5.87 0 .31 5.39.31 12s5.56 12 12.17 12c3.57 0 6.26-1.17 8.37-3.36 2.16-2.16 2.84-5.21 2.84-7.67 0-.76-.05-1.46-.18-2.05z"
													fill="currentColor"
												/>
											</svg>
											Continue with Google
										</Button>
										<FieldDescription className="text-center">
											{mode === "signin"
												? "New here? "
												: "Already have an account? "}
											<button
												type="button"
												className="underline underline-offset-4"
												onClick={() =>
													setMode(mode === "signin" ? "signup" : "signin")
												}
											>
												{mode === "signin" ? "Create an account" : "Sign in"}
											</button>
										</FieldDescription>
										<FieldDescription className="text-center text-xs">
											<Link
												to="/privacy"
												className="underline underline-offset-4"
											>
												How Mic Drop handles your data
											</Link>
										</FieldDescription>
									</Field>
								</>
							) : null}
						</FieldGroup>
					</form>
				</div>
			</div>
			<div className="relative hidden items-center justify-center overflow-hidden bg-muted/40 p-10 lg:flex">
				<NotesBackground />
				<figure className="relative w-full max-w-md rounded-2xl border bg-card p-8 shadow-xl shadow-black/5">
					<figcaption className="mb-5">
						<p className="text-xl font-semibold tracking-tight">
							Amazing Grace
						</p>
						<p className="text-sm text-muted-foreground">John Newton · Key G</p>
					</figcaption>
					<SongSheet
						fontSize={17}
						content={
							"{start_of_verse: Verse 1}\nA[G]mazing [G7]grace, how [C]sweet the [G]sound\nThat [G]saved a [Em]wretch like [D]me\nI [G]once was [G7]lost, but [C]now am [G]found\nWas [Em]blind but [D]now I [G]see\n{end_of_verse}"
						}
					/>
				</figure>
				<ul className="absolute right-10 bottom-10 left-10 flex justify-center gap-6 text-sm text-muted-foreground">
					<li>Any key, any capo</li>
					<li aria-hidden>·</li>
					<li>Setlists for the gig</li>
					<li aria-hidden>·</li>
					<li>Works offline</li>
				</ul>
			</div>
		</div>
	);
}
