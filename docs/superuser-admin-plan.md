# Superuser admin view

A platform-wide `/admin` area where operators see every user, band, song, setlist,
publication, share link, import job and OAuth client, and can act on misuse.

## Decisions

| Topic | Decision |
| --- | --- |
| Admin role | Better Auth `admin` plugin, `user.role = 'admin'`, granted by SQL only. No self-promotion endpoint. |
| Catalogue moderation | `role = 'admin'` implies catalogue moderator. `catalogue_admins` stays as the narrower moderator-only role. |
| Private content | Full read access to any user's or band's records. Every admin read of private content is audit-logged. |
| Actions | Suspend/ban, hard delete user or band, revoke OAuth clients and share links, impersonate (full access). |
| Limits | Enforced quotas plus Better Auth rate limiting; dashboard shows usage against quotas. |
| Alerts | Structured `logger` events to Sentry; alert rules are configured there. |
| Sign-up spam | Cloudflare Turnstile on email sign-up. Email verification is out of scope for v1. |
| Disclosure | Privacy note: operators can access account data to prevent abuse, and all access is logged. |

## Data model (migration `0006_platform_admin.sql`)

- Admin plugin columns: `user.role`, `user.banned`, `user.banReason`, `user.banExpires`,
  `session.impersonatedBy`.
- `admin_actions (id, admin_id, action, target_kind, target_id, data, created_at)`: the audit
  log for every admin read of private content and every admin mutation. Writes made while
  impersonating are tagged with `session.impersonatedBy`.
- `usage_events (user_id, kind, created_at)` with an index on `(user_id, kind, created_at)`.
  `kind` is one of `pdf_import`, `url_import` or `mcp_call`. These rows drive both the daily
  quotas and the leaderboards; prune rows older than 30 days.
- Grant: `UPDATE user SET role='admin' WHERE email='…';`

`catalogue_actions` stays for catalogue moderation. `admin_actions` covers everything else.

## Server

- `getAuth()` adds `admin()` from `better-auth/plugins`. Ban is checked at sign-in and
  session creation. Banning also revokes sessions, and we add these steps ourselves:
  - revoke `oauthAccessToken` and `oauthRefreshToken` rows, so MCP access stops too;
  - hide the user's publications (`moderated=1`).
- `requireAdmin(request)` mirrors `requireUser`: it returns 403 unless `role='admin'`.
- `isCatalogueAdmin` becomes `role='admin' OR in catalogue_admins`.
- `/api/admin/*` endpoints use the existing `endpoint()` wrapper and the read-only aggregate
  SQL listed under Views. Each mutation and each private read writes `admin_actions`.
- Rate limiting: turn on Better Auth `rateLimit` with `storage: "database"`, because
  per-isolate memory is useless on Workers. Apply it to sign-in, sign-up and OAuth client
  registration.
- Quotas: a `checkQuota(userId, kind)` helper runs before Gemini and Browser calls, and a
  count check runs on record and band creation in `sync.ts` and `/api/bands`. It returns 429
  with a readable message and emits `logger.warn("quota.exceeded", …)`.
- Turnstile: verify the token server-side in a `before` hook on `/sign-up/email`.
- Sentry events: `admin.action`, `quota.exceeded`, `user.banned`, `report.created`,
  `signup.burst` (more than N sign-ups from one IP per hour, taken from `session.ipAddress`).

## Default quotas

20 PDF imports/day, 100 URL imports/day, 5,000 records, 10 owned bands.

## Views (`/admin`, shown in the sidebar only for admins)

1. **Overview**: totals and 7-day deltas for users, bands, records, publications, open
   reports and import usage. Highlights accounts near or over a quota, sign-up bursts and
   open reports.
2. **Users**: search by name or email; sort by created date, record count or import usage.
   - Detail page: sessions (IP, user agent), bands, records, publications, share links,
     OAuth clients and consents, import jobs and usage, and the audit trail.
   - Actions: ban/unban with reason and expiry, revoke sessions, impersonate, delete.
3. **Bands**: members and roles, invitations, records, share links. Delete action.
4. **Songs and setlists**: all `records` filtered by owner, kind and archived. Opening one
   shows the ChordPro (logged) and revision history.
5. **Catalogue**: the existing reports queue and merge tools, moved here.
6. **OAuth clients**: every registered client, flagging unauthenticated registrations
   (`userId IS NULL`), plus token counts and last use. Disable action.
7. **Share links**: active links with creator, target and expiry. Revoke action.
8. **Audit log**: `admin_actions` and `catalogue_actions`, newest first.

While impersonating, a persistent banner in the app shell names the user and has a "Stop
impersonating" button.

## Deletes

- A hard delete needs the target's email or band name typed as confirmation.
- Records are owned by a text `owner` with no foreign key, so user and band deletes remove
  the following explicitly, in one `DB.batch` alongside the user/organization row:
  `records`, `revisions`, `publications`, `votes`, `publication_search`, `catalogue_grams`
  and `operations`.
- A user who is the sole owner of a band blocks the delete until that band is deleted or
  transferred.

## Build order

1. Migration, admin plugin, `requireAdmin`, audit log, Overview and Users (read-only).
2. Ban, revoke sessions and OAuth tokens, and impersonation with its banner.
3. Bands, Songs, OAuth clients, Share links and Audit log views, plus deletes.
4. Usage events, quotas, rate limiting, Turnstile and Sentry events.
5. Privacy note, and README update replacing the catalogue-admin grant instructions.

Every step needs integration tests in `apps/web/src/server`. The key ones:
- non-admin gets 403 on all `/api/admin/*` routes;
- a banned user's sessions and MCP tokens stop working;
- quotas return 429;
- deletes leave no orphaned records or FTS rows.

## Open questions

- Should `/admin` also work offline (`routeTree.offline.gen.ts`)? Proposal: no, online only.
- Signup-burst threshold (proposed: 5 per IP per hour).
- Should impersonating someone send them a notice afterwards?
