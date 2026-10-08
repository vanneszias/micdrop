# Chords

A private-first songbook for individuals and bands. Import chord sheets, edit a standardized arrangement, build setlists, and play in your own key and capo.

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
- Live preview, section/chord/note helpers, local autosave, and explicit error reporting.
- Transpose, separate sounding chords from capo shapes, guitar diagrams with alternative fingerings, adjustable text, and autoscroll.
- Personal and band setlists, ordering, repeated songs, performance keys, band notes, playing navigation, and standardized print layouts.
- Bands with owner/editor/viewer permissions. For this initial release, owners add an existing account by email; invitation email delivery is not configured.
- Explicit publication/update/unpublication and one changeable up/downvote per account.
- Account-isolated offline storage, durable pending edits, idempotent server writes, revision conflicts with both versions preserved.

All synchronized records in an accessible library are retained locally; a separate selective-download policy is not implemented yet. Band records follow the latest synchronized version, while an active playing view offers an update notice. Independent copies keep their attribution.

## Optional integrations

- `BRAVE_SEARCH_API_KEY`: enables in-app external web results.
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`: enables Google sign-in; configure the callback `/api/auth/callback/google` in Google.
- The `BROWSER` binding enables rendered-page import on Cloudflare. Local plain-HTML import works without this service. Rendered extraction needs access to Cloudflare Browser Run.

Import previews retain raw text and the source URL. Extraction currently targets `<pre>` blocks. Pages with other structures may need a source adapter or paste fallback. Imported key/capo metadata must be reviewed in the editor.

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
CHORDS_TEST_URL=http://localhost:3000 bun test apps/web/src/server
```

Tests cover music conversion/transposition, bounded imports, atomic saves, restart recovery, changes during synchronization, and durable conflicts. The opt-in integration test creates fixture accounts in local D1 and exercises replay, revisions, private access, band permissions, publishing, search, and voting.

## Cloudflare deployment

The checked-in D1 ID is a **local-development placeholder**. Before deployment, create a D1 database and replace `database_id` in `apps/web/wrangler.jsonc`. Set `BETTER_AUTH_URL` to the deployed origin and configure secrets with Wrangler. Apply migrations to that database, regenerate types with `bun run --filter @chords/web cf:typegen`, then deploy.

No Cloudflare resources are created or deployed by the local setup commands.

## Current boundaries

- Conflict handling is revision-based, with explicit resolution rather than real-time text merging.
- Guitar diagrams use the MIT-licensed `@tombatossals/chords-db` dataset; unsupported shapes remain readable as chord names.
- Local player preferences are stored per account and arrangement. They do not yet synchronize between devices.
- Email verification/recovery delivery, invite emails, catalog moderation, selective downloads, and additional site adapters remain follow-up work.
