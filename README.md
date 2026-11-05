# Chords

A shared song catalogue with personal and band repertoires. Discover published arrangements, save independent private copies, build setlists, and play in your own key and capo.

## Run locally

```sh
bun install
cp .env.example .env.local
# Set BETTER_AUTH_SECRET to a random value of at least 32 characters.
bun run db:migrate
bun run dev
```

Open http://localhost:3000. The personal songbook works without signing in. Local saves use IndexedDB and persist across reloads. Sign in to sync to D1; use **Account → Import this device’s local songbook** to copy your unsigned-in arrangements into your account.

Keep existing `.env.local` values when updating configuration. Secrets are read server-side; never prefix them with `VITE_`.

## Workspace

| Path | Responsibility |
| --- | --- |
| `apps/web` | Routes, product features, Worker endpoints, auth, migrations |
| `packages/ui` | Shared shadcn components |
| `packages/song-core` | ChordPro, pasted text conversion, chord transformations |
| `packages/song-ui` | Shared screen/print renderer and guitar diagrams |
| `packages/data` | Validated records, reactive collections, atomic local saves, outbox, conflicts |
| `packages/imports` | Bounded input reads, URL validation, import normalization |

## Available workflows

- Create, edit, search, copy, archive, import/export arrangements.
- Paste chords-over-lyrics or ChordPro; import a public HTTPS page containing a preformatted chord sheet, including PNW Chords.
- Import a PDF of chord sheets as a setlist using **Setlists → Import PDF with AI** (also available under **Add a song**). Review/edit the extracted songs, keys, capo, notes and ChordPro before saving. Supports scanned PDFs through vision; maximum 10 MB, 200 entries. Requires sign-in and an internet connection.
- Live preview, section/chord/note helpers, local autosave, and explicit error reporting.
- Transpose, separate sounding chords from capo shapes, guitar diagrams with alternative fingerings, adjustable text, and autoscroll.
- Personal and band setlists, ordering, repeated songs, performance keys, band notes, playing navigation, and standardized print layouts.
- Bands with owner/editor/viewer permissions. For this initial release, owners add an existing account by email; invitation email delivery is not configured.
- Public catalogue reading without an account, grouped songs and covers, version previews, typo-tolerant title/artist search, and lower-priority lyrics/tag matches.
- New arrangements are public after review and final save unless marked private or draft. Normal public edits update on save; draft revisions preserve the last published snapshot.
- Independent private repertoire copies, multiple arrangements and a preferred version per song, private performance settings and rehearsal notes.
- Setlist search combines the active repertoire, personal songs, and the public catalogue. Saving and adding a new repertoire copy is atomic locally. Publisher changes never alter saved copies.
- Reports and catalogue admin tools for hiding entries, moving arrangements and merging song groups. One changeable up/downvote per account.
- Account-isolated offline storage, durable pending edits, idempotent server writes, revision conflicts with both versions preserved.

All synchronized records in an accessible library are retained locally; a separate selective-download policy is not implemented yet. Band records follow the latest synchronized version, while an active playing view offers an update notice. Independent copies keep their attribution.

## Optional integrations

- `BRAVE_SEARCH_API_KEY`: enables in-app external web results.
- `PDF_IMPORT_PROVIDER` (`openai` default, `gemini` or `mistral`) plus that provider's key (`OPENAI_API_KEY`, `GEMINI_API_KEY`, `MISTRAL_API_KEY`) enables AI PDF import as a background job (progress is logged as `pdf_import.*` JSON lines). `PDF_IMPORT_MODEL` optionally overrides the default (`gpt-4.1`, `gemini-3.8-flash`, `mistral-small-latest`); choose a model supporting PDF inputs and structured outputs. The PDF is sent to the chosen provider (OpenAI with response storage disabled). Jev/TypeSafe's current choice/score API does not generate transcriptions, so it cannot perform this import.
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`: enables Google sign-in; configure the callback `/api/auth/callback/google` in Google.
- The `BROWSER` binding enables rendered-page import on Cloudflare. Local plain-HTML import works without this service. Rendered extraction needs access to Cloudflare Browser Run.

Import previews retain raw text and the source URL. Extraction currently targets `<pre>` blocks. Pages with other structures may need a source adapter or paste fallback. Imported key/capo metadata must be reviewed in the editor.

PDF imports save songs, the setlist, pending sync operations, and the original PDF in one local transaction. The original PDF remains on the importing device and can be downloaded from its setlist; it is not synchronized. Each song retains the AI's unedited source transcription. Review content, grouping and visibility for every extracted entry before saving. Existing songs are never overwritten; choose an existing arrangement, link a new arrangement to an existing song, or keep a distinct song group. Repeated identical sheets share an arrangement and keep separate setlist entries. Unknown keys default to C after review; AI extraction can need corrections, especially for chord placement and capo notation.

## Offline production check

```sh
bun run build
bun run preview
```

The production build precaches a standalone client-only offline shell and its assets. Open the app online once and wait for service-worker activation before disconnecting. Browser storage can be removed by the browser or user; use ChordPro exports for portable copies. App updates are prompted rather than reloading during editing or playing.

The default developer server does not install the production service worker. Local record editing still works when connectivity is unavailable while the app remains open.

## Verification

```sh
bun run typecheck
bun run check
bun run test
bun run build
# With the development server running:
CHORDS_TEST_URL=http://localhost:3000 bun test --preload ./apps/web/scripts/integration-preload.ts apps/web/src/server
```

Tests cover music conversion/transposition, bounded imports, atomic saves, restart recovery, changes during synchronization, and durable conflicts. The opt-in integration test creates fixture accounts in local D1 and exercises replay, revisions, private access, band permissions, publishing, search, and voting.

## Cloudflare deployment

The checked-in configuration targets the `chords` Worker and D1 database in account `6495d15c9d09b19ddc65f0a01892a183`, served at `https://micdrop.day`. The D1 ID is the existing production database; local commands simulate it without accessing production data. Configure runtime secrets (including `BETTER_AUTH_SECRET`) on the Worker with Wrangler; deployment preserves existing secrets.

To guard email sign-up with Cloudflare Turnstile, create a widget for `micdrop.day`, set its secret with `wrangler secret put TURNSTILE_SECRET_KEY`, and build with `VITE_TURNSTILE_SITE_KEY=<site key>`. Without the secret, sign-up has no bot check.

### GitHub Actions

`.github/workflows/ci.yml` uses GitHub-hosted Ubuntu runners and Bun 1.4.4. Pull requests and pushes to `master` run typecheck, Biome, unit tests, local D1 migrations, a production build, deployment dry run, and server integration tests against a local production preview. Integration tests use a fixed test-only auth secret, an explicit local storage path, and a localhost upstream; they never use production credentials or data.

After checks pass on `master`, the deployment job builds the app, applies pending **remote production D1 migrations**, then deploys the Worker. Deployments are serialized and an in-progress deployment is never cancelled. Manual runs are available through Actions → CI and deployment → Run workflow; only `master` can deploy. Keep migrations compatible with the currently deployed Worker, since they run before the new code is deployed. Rolling back Worker code does not roll back D1 changes.

One-time GitHub setup:

1. Create a `production` environment limited to the `master` branch.
2. Set its `CLOUDFLARE_ACCOUNT_ID` variable to `6495d15c9d09b19ddc65f0a01892a183`.
3. Add its `CLOUDFLARE_API_TOKEN` secret. Start with Cloudflare's **Edit Cloudflare Workers** token template, scoped to this account and the `micdrop.day` zone, and include **D1: Edit** for migrations. Ensure the token can deploy the Worker's Browser Run binding. Use a dedicated CI token, separate from local OAuth credentials.
4. Merge the workflow into `master` to activate automatic deployment. If Cloudflare Workers Builds is also connected to this repository, disable its automatic builds so only this workflow deploys.

See [Cloudflare's GitHub Actions authentication guide](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/) and [Wrangler permissions](https://developers.cloudflare.com/workers/authorization/workers/). Actions are pinned to commit SHAs, dependencies use the frozen Bun lockfile, the GitHub token has read-only repository access, and Cloudflare credentials are available only to production deployment steps.

No Cloudflare resources are created or deployed by the local setup commands.

## Transactional email

Better Auth sends a welcome email with a verification link on email signup and handles verification resends and password recovery. The sign-in page offers **Forgot password?** and **Resend verification email**; signed-in users can choose **Verify email address** from their account menu. Verification is available without blocking existing accounts from signing in. Verification and reset links expire after one hour. Reset links are single use, and resetting a password revokes existing sessions.

The server uses Cloudflare Email Service through the `EMAIL` binding, with `welcome@micdrop.day` as its allowed sender. The binding is configured for production and Workers Previews; sending must be enabled for `micdrop.day` in the target Cloudflare account before deployment. No email API key is needed. Preview emails contain links to their preview's auth URL.

Local development and integration tests simulate delivery without sending real mail. Wrangler logs paths to the generated text and HTML files for inspection. Keep the email binding local (do not set `remote: true`) during testing. Delivery runs under `waitUntil`; failures are reported to Sentry as `auth.email_failed` without logging recipients or email links. Recovery and resend requests return a generic confirmation to avoid disclosing whether an account exists, and are rate limited per IP.

Regenerate Worker types with `bun run --filter @chords/web cf:typegen`; this reads the checked-in `.env.example` for secret names, without requiring real secret values.

See the [Cloudflare Workers email API](https://developers.cloudflare.com/email-service/api/send-emails/workers-api/) and [Better Auth email flows](https://better-auth.com/docs/concepts/email).

## Current boundaries

- Conflict handling is revision-based, with explicit resolution rather than real-time text merging.
- Guitar diagrams use the MIT-licensed `@tombatossals/chords-db` dataset; unsupported shapes remain readable as chord names.
- Local player preferences are stored per account and arrangement. They do not yet synchronize between devices.
- Invite emails, selective downloads, and additional site adapters remain follow-up work.

## Catalogue administration

Migration `0005_catalogue.sql` preserves existing private libraries and published snapshots; it does not publish old private records. Legacy song groups remain separate until explicitly merged. Public result pages contain summaries; full sheets are loaded only for previewing or saving. The public catalogue is not synchronized wholesale to devices.

Platform administrators are granted by hand with `UPDATE user SET role='admin' WHERE email='<email>';` in the intended database. They get the **Administration** entry in the account menu (`/admin`): misuse signals, every account, band, song, setlist, assistant connection and share link, and a combined audit log. Administrators can ban, sign out, impersonate and delete accounts, delete bands, disable assistants and revoke links. Every look at private data and every change is recorded in `admin_actions`. Platform administrators also moderate the catalogue.

Limits against misuse: 20 PDF imports and 100 page imports per account per day (30 page imports per IP when signed out), 5,000 songs and setlists per library and 10 owned bands per account. Better Auth rate-limits sign-up, sign-in and assistant registration per client IP, stored in D1. Quota breaches, bans, catalogue reports and sign-up bursts are logged as `quota.exceeded`, `user.banned`, `report.created` and `signup.burst` for Sentry alert rules.

Catalogue-only moderator access is explicitly granted through the `catalogue_admins` table. Band ownership does not grant catalogue-wide privileges. An authorised operator can grant access with `INSERT INTO catalogue_admins(user_id) VALUES ('<account-id>');` in the intended database; there is no self-promotion endpoint. The Catalogue page then displays reporting and maintenance tools. Actions are recorded in `catalogue_actions`. Merges and regrouping preserve revision history and saved copies; merging also preserves old group IDs as aliases.

Local integration tests provision their own temporary admin account using the local Wrangler binary. Set `CHORDS_TEST_D1_STATE` when using a nondefault local persistence directory. Never point integration tests at production.

The search regression fixture exercises 10,000 songs, exact and typo matches, performing artists and pagination. Local SQLite timings are not a production capacity guarantee. Admin tools currently use explicit group/publication IDs; their scope is deliberately small.

### Seeding the catalogue from OpenSong

`apps/web/scripts/import-opensong.ts` converts a folder of OpenSong XML files to ChordPro and writes SQL that inserts them as public arrangements owned by one account; the catalogue triggers publish them. Use a dedicated account: its owner syncs every record it owns to their devices.

```sh
bun run apps/web/scripts/import-opensong.ts ~/Downloads/en --owner <account-id> --out opensong.sql
cd apps/web && bunx wrangler d1 execute chords --local --file ../../opensong.sql
```

Chord lines are placed onto their lyric lines by column, as OpenSong lays them out; chords are kept as written, except that the shorthands `X(9)`, `X(4)` and `X2(no3)` become `Xadd9`, `Xsus4` and `Xsus2` so they transpose. Other chord-line text (`x2`, bar lines, notes) becomes ChordPro annotations, and `[V1]`-style headers become verse/chorus/bridge sections. The original XML is kept as each record's raw import. Identical sheets saved under other titles are imported once, with the other titles as tags. Copyright and CCLI notices are shown in the sheet and description. Files without a key use their first chord (or C). Record IDs derive from the owner and file name, so re-running skips songs that already exist and never overwrites edits. The SQL only inserts when the owner account exists. Running it against the production database (`--remote`) publishes the songs immediately.

See [the agreed product plan](docs/catalogue-and-repertoire-plan.md) for the complete model and acceptance scenarios.
