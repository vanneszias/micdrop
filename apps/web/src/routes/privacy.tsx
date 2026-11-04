import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
	head: () => ({ meta: [{ title: "Privacy · Mic Drop" }] }),
	component: Privacy,
});

function Privacy() {
	return (
		<main className="mx-auto max-w-2xl space-y-6 px-4 py-10 text-sm leading-relaxed">
			<Link
				to="/songs"
				className="font-medium underline-offset-4 hover:underline"
			>
				← Mic Drop
			</Link>
			<h1 className="text-2xl font-bold">Privacy</h1>
			<section className="space-y-2">
				<h2 className="text-base font-semibold">What Mic Drop stores</h2>
				<p>
					Without an account, your songbook stays in this browser and nothing is
					sent to Mic Drop except pages you ask it to import.
				</p>
				<p>
					With an account, Mic Drop stores your name, email address and password
					hash (or your Google sign-in), the songs and setlists you sync with
					their earlier versions, your bands and their members, what you publish
					to the catalogue, your votes and reports, the assistants you connect,
					and your sign-in sessions, including the IP address and browser they
					came from.
				</p>
			</section>
			<section className="space-y-2">
				<h2 className="text-base font-semibold">Who can see it</h2>
				<p>
					Your personal library is yours. A band's library is shared with its
					members. Anything you publish to the catalogue, or share with a link,
					can be read by anyone who has it.
				</p>
				<p>
					The operator of Mic Drop can open any account, band, song or setlist,
					and can act as an account, to prevent and fix misuse such as spam,
					abuse or excessive use. Every time this happens it is recorded in an
					audit log. Accounts that misuse Mic Drop can be banned or deleted.
				</p>
			</section>
			<section className="space-y-2">
				<h2 className="text-base font-semibold">Services involved</h2>
				<ul className="list-disc space-y-1 pl-5">
					<li>
						Cloudflare hosts Mic Drop, stores its data, renders pages you import
						and runs the bot check on sign-up.
					</li>
					<li>Google, if you sign in with Google.</li>
					<li>
						An AI provider reads PDFs you import, to turn them into chord
						sheets.
					</li>
					<li>Brave Search answers the web searches you make for songs.</li>
					<li>
						Error reports go to a Sentry server run by the operator, so problems
						can be fixed.
					</li>
				</ul>
			</section>
			<section className="space-y-2">
				<h2 className="text-base font-semibold">Limits</h2>
				<p>
					To keep costs and misuse in check, imports, library sizes, bands and
					sign-in attempts have daily or total limits. Mic Drop counts your
					imports to enforce them.
				</p>
			</section>
			<section className="space-y-2">
				<h2 className="text-base font-semibold">Questions or deletion</h2>
				<p>
					To have your account and everything in it deleted, or to ask anything
					about your data, contact the operator through{" "}
					<a
						href="https://zias.be"
						className="underline underline-offset-4"
						target="_blank"
						rel="noreferrer"
					>
						zias.be
					</a>
					.
				</p>
			</section>
		</main>
	);
}
