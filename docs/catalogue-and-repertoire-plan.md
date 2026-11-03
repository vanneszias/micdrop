# Song catalogue, repertoires, publishing, and setlist search

Status: product decisions from the planning conversation, implemented in the
working tree. The implementation phases below describe the delivery slices;
validation details and operational setup are documented in README.md.

## Product model

The app has a shared public catalogue. People and bands maintain repertoires
containing the arrangements they use. A repertoire can contain private material
as well as independent copies of public arrangements.

Public visitors can search and read complete published chord sheets without
signing in. An account is required to save, contribute, or join a band.

### Song

A song groups arrangements of the same underlying song, including covers by
different performing artists. For example, Leonard Cohen and Jeff Buckley
versions of Hallelujah belong to one song group. Matching titles alone do not
establish that two entries are the same song.

### Arrangement

An arrangement holds a particular chord sheet, structure, performing artist or
version label, and explicit public description. A person or band owns it.
Its creator, or the owning band's editors, can edit and publish it. Other users
can save independent copies and publish their own changed arrangements.

Song content stays in ChordPro. Preserve raw imports and source attribution.
Copy provenance records where an arrangement came from; it does not subscribe
the copy to future source updates.

### Repertoire

A personal or band repertoire contains stable, independently owned arrangements.
Saving a public arrangement creates a private copy immediately. The original
publisher's subsequent edits or unpublication do not alter or remove that copy.

A repertoire may contain multiple arrangements of one song, such as acoustic and
full-band versions. Choose one preferred arrangement for the song; a setlist can
use another. Key, capo, and private rehearsal notes are settings, and changing
only those settings does not create a separate public arrangement.

### Setlist

A setlist references its owner's repertoire arrangements. Adding a public
arrangement automatically saves a private copy to the repertoire and adds that
copy to the setlist. Reuse an existing saved copy of that source rather than
silently creating another identical copy.

Setlists follow subsequent edits to the repertoire arrangement. Each setlist
entry retains its own performance key and notes. This deliberately allows band
edits to flow through existing setlists while insulating them from changes by
the original public publisher.

## Creation and import

1. Use the active band as owner when working inside a band; use the account in
   personal mode.
2. Allow manual entry and the existing import paths.
3. Suggest existing song and arrangement matches before the final save. Let the
   user use an existing arrangement, add an arrangement to an existing song, or
   confirm that this is a different song.
4. New songs/arrangements are public on first save by default. The user can
   instead choose private or draft. Make the visibility of the save action clear.
5. Bulk/PDF imports require review of extracted content, existing matches, and
   visibility before the final save publishes anything. Support visibility
   choices for the reviewed entries.
6. A new arrangement created in the active library is available in that
   repertoire; publishing does not move it out of its owner's repertoire.

Do not resolve duplicates by forcing users to rename titles or artists. Separate
song identity from arrangement identity and give versions descriptive labels.

## Visibility and publication lifecycle

- Public: the published version is anonymously readable and searchable.
- Private: accessible to its owner or owning band, available for setlists, and
  absent from public discovery.
- Draft/concept: unfinished work, still usable by its owner or band in setlists.
  New drafts are not publicly exposed.
- Revising an existing public arrangement normally updates its public version
  on save. Entering draft mode instead preserves the last published version for
  visitors while the owner or band works with the unfinished revision. Publishing
  the draft replaces the public version.

Treat working-draft state separately from the existence of a public version.
A public arrangement can have a newer private working draft. Draft mode must
also be available offline; syncing a draft must not accidentally publish it.

Saving and editing a repertoire copy keeps it private unless explicitly
published. Publishing a changed copy adds another arrangement under the same
song group. Once published, ordinary saved edits update that publication unless
the owner enters draft mode.

Publishing an unchanged saved copy must not create an identical public entry.
Keep attribution to the original and explain that the arrangement is already
public. Key, capo, and private-note differences alone do not qualify as a new
public arrangement. The exact content-equivalence rules need implementation
design; do not claim musical equivalence from title matching.

Publish chord-sheet content and explicit public metadata only. Never
automatically include private rehearsal notes or performance settings. Notes
written directly into the chord sheet are part of the content being published;
the editor must make this boundary apparent.

Unpublishing removes the original from public access and discovery but preserves
other people's saved copies and functioning setlists.

## Search and selection

### Scope and ranking

Use one search box and one relevance-ranked list of song groups.

For a Band A setlist, include:

- Band A's repertoire, including private and draft arrangements.
- The current user's personal songs, including private material.
- Published arrangements from the public catalogue.

Exclude Band B's private material even if the user belongs to Band B. Public
search responses must never disclose private or draft content or its existence.

Match titles and artists first, tolerate typos, and match lyrics and tags at
lower priority. Search relevant artist/version metadata within each song group
so a cover can be found by its performing artist.

Boost band repertoire matches among results of comparable relevance. An exact
public match ranks ahead of a weak band match. Within a matching group, preselect
the band's preferred arrangement, while allowing another version to be chosen.

When no band preference exists and multiple public arrangements are available,
open an arrangement chooser with previews and a recommended version. Do not
silently add the highest-rated arrangement.

Clearly identify saved band versions, artist/version labels, and draft status.
Keep result summaries light; load the full chord sheet for a preview or save.

### Setlist picker flow

1. Open Add song and search without changing library context.
2. Review grouped matches and the selected or recommended arrangement.
3. Choose the arrangement, previewing alternatives when needed.
4. Add an existing band arrangement directly. For a public arrangement, save a
   private band copy and add it to the setlist in one atomic operation.
5. For a personal private song, label the action "Copy to band and add". Create
   a band-accessible copy and leave the personal original private.
6. Keep the picker convenient for adding several songs in sequence.

Apply the same catalogue and repertoire concepts to personal setlists.

## Offline and scale

After syncing, all personal and active-band repertoire arrangements and setlists
are available offline. Drafts are included. Public arrangements become available
offline when saved. Searching the wider public catalogue requires a connection;
offline search searches the locally available scope and communicates that limit.

The catalogue must not be downloaded wholesale into IndexedDB. Use server-side
indexed search, bounded pages of summaries, and on-demand content loading.
Combine catalogue results with authorised repertoire matches without leaking
private content or showing saved copies as extra song groups.

Prototype typo handling, ranking, and pagination against a large representative
dataset before committing to a search implementation. Song count, concurrent
traffic, and latency targets remain engineering inputs to establish; "lots of
songs" is not yet a measured capacity requirement.

Keep local saves and pending operations atomic. In particular, saving a copy and
adding its setlist entry must succeed together. Preserve both revisions on
conflict rather than silently overwriting. Active playing views should retain
the existing update-notice behaviour rather than replacing content mid-song.

## Catalogue maintenance

Users can report public arrangements and incorrect grouping. App admins need
tools to regroup arrangements, merge duplicate song groups, and hide public
entries. Ordinary contributors do not get permission to edit other people's
arrangements through these tools.

Merging or regrouping changes catalogue identity without losing saved copies,
provenance, preferences, or setlist references. Preserve stable references or
redirects for merged groups. Record administrative actions for traceability.

## Proposed implementation phases

1. **Data foundation and migration.** Introduce explicit song grouping,
   arrangement/version metadata, repertoire preferences and settings, and
   separate working/published revisions. Remove the title-and-artist uniqueness
   restriction that prevents multiple arrangements. Preserve ChordPro and raw
   source records. Implement authorisation and atomic write paths.
2. **Creation and publication.** Add owner-aware creation, match suggestions,
   reviewed imports, explicit visibility, draft revisions, live public updates,
   private copying, and identical-publication protection.
3. **Catalogue and setlist search.** Provide anonymous catalogue reading,
   indexed and paginated search, grouping, relevance and band boosting,
   arrangement previews, and copy-and-add actions in the setlist picker.
4. **Repertoire and offline completion.** Support multiple versions and
   preferences, settings inheritance, local search, sync recovery, and full
   personal/active-band offline availability.
5. **Administration and release validation.** Ship reports and catalogue
   maintenance tools, exercise large datasets, and verify migration, access
   boundaries, offline behaviour, and the end-to-end workflows.

These phases are implementation slices of the agreed release, not permission to
omit offline support or catalogue maintenance from that release.

## Migration assumptions to validate before implementation

- Preserve existing private material as private. The new public default applies
  to new saves, not a bulk publication of old libraries.
- Keep existing publications, ownership, copies, votes, and setlist references.
- Initially keep uncertain legacy song identities separate and use suggestions
  or admin merging instead of automatically grouping by title alone.
- Reuse existing voting as one possible recommendation signal, with a fallback
  for unrated arrangements. The exact recommendation formula is not agreed.
- No automatic musical merging, community edit approvals, or subscription to
  upstream arrangement updates is required.

## Acceptance scenarios

1. A visitor finds a song by title, artist, a minor typo, or a lyric fragment and
   reads its full public chord sheet without an account.
2. Covers share one song group and remain distinguishable by artist/version.
3. A strong public match outranks a weak band match; comparable band matches get
   a boost and their preferred arrangement is selected.
4. Adding a public arrangement creates one stable private repertoire copy and a
   setlist entry atomically. Repeated use reuses the copy.
5. Original-publisher updates and unpublication leave saved copies unchanged.
6. Band edits update existing band setlists while per-entry keys and notes stay
   intact. Multiple arrangements and explicit choices remain supported.
7. Saving a published edit updates public content; saving in draft mode keeps
   the previous public revision visible and the unfinished work usable privately.
8. Publishing a changed copy preserves attribution and excludes private settings;
   publishing an unchanged copy does not create an identical catalogue entry.
9. Personal private songs require a clearly labelled copy-to-band action; other
   bands' private material never appears in the picker.
10. A reviewed bulk import respects each entry's grouping and visibility before
    publication. No unreviewed extraction is published.
11. Offline repertoire search, editing, and setlist playback work after sync;
    reconnecting preserves conflicts and never publishes a draft accidentally.
12. Reports, hiding, regrouping, and merging work without breaking saved copies
    or setlists. Large-catalogue queries remain bounded and paginated.

Implementation checks: run `bun run typecheck`, `bun run check`, `bun run test`,
and `bun run build`, plus local server integration tests with the app running.
Use local D1 migrations only during development and testing. No deployment or
remote migration is part of this planning task.
