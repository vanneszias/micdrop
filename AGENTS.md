# Chords workspace

- Use Bun for installs and scripts. Run commands from the repository root.
- `apps/web` is the TanStack Start application deployed to Cloudflare Workers.
- `packages/song-core` owns ChordPro conversion and musical transformations.
- `packages/song-ui` owns the shared chord-sheet renderer and guitar diagrams.
- `packages/data` owns schemas, TanStack collections, IndexedDB persistence, and synchronization.
- `packages/imports` owns input extraction helpers; site rules feed the same conversion pipeline.
- `packages/ui` owns shadcn components. Add them from `apps/web` with `bunx --bun shadcn@latest add ...`.
- Keep song content in ChordPro and preserve raw imports. Do not invent another parser or representation.
- Save records and their pending operations atomically. Never silently overwrite conflicting revisions.
- Check `bun run typecheck`, `bun run check`, `bun run test`, and `bun run build`.
- Local D1 migrations: `bun run db:migrate`. Never use remote migrations or deployment during local testing.
- Integration checks: start the app, then run `CHORDS_TEST_URL=http://localhost:3000 bun test apps/web/src/server`.
- Every same-repo PR gets a Workers Preview (`pr-<number>`) with its own D1 database via `.github/workflows/preview.yml` and `apps/web/scripts/preview.sh`; closing the PR deletes both.
