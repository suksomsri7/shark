# P1.3 B2.1 — builder brief (cloud run · controller · 3 Oct 2026)

Tree: `/home/user/shark-p13` · branch `wip/pos-p1.3` (head ba6a9bb8, own node_modules). Read `ledger/pos-briefs/pos-brief-COMMON.md`, `pos-brief-P1.3.md` (Q4) and `pos-brief-P1.3-B2.md` first. Builder notes: `ledger/wo-notes/pos-P1.3.md` (append a "B2.1" section).

## Environment (cloud container — differs from the old VPS rules)
- No `scripts/iso.sh` / `qc4.sh` / `with-gate-lock.sh`. Run commands directly.
- **There is NO database access from this container** (TCP 5432 blocked). Do NOT run oracles/seeds/anything that opens a Prisma connection; do not try to work around it. DB verification is deferred to the controller.
- `pnpm typecheck` (≈160 s) at most twice. `pnpm fitness` WITHOUT env: `env -u DATABASE_URL -u DIRECT_URL pnpm fitness`. Also `pnpm exec tsx scripts/fitness-pos.mts` if it runs without DB.
- No prisma/schema edits, no `pnpm add`, no build/server, never touch `.env*`, never push `main`.

## Defect
`NavRail.isRailPath(pathname)` (src/components/app-shell/NavRail.tsx:18) forces the 56 px icon rail for `/app/sys/[id]/pos/register` purely from the URL. With flag `settings.pos.registerV2` OFF (= every real shop) the LEGACY register page now gets the rail instead of the full menu — violates Q4 "flag off = old page exactly as before".

## Required
1. Rail-forcing for the register path must depend on the page actually rendering the V2 screen (flag ON). Flag OFF ⇒ shell behaviour byte-for-byte as on origin/main (kanban board rail untouched). Preferred: the V2 screen declares itself (e.g. a data attribute / small client signal the shell reads) or the server page passes the decision; pick the smallest correct option that has no flash of the wrong layout on first paint (SSR-consistent). `session/crm` does not touch `src/components/app-shell/**` (checked) — small hunks there are allowed.
2. Static oracle: add/adjust a check in `scripts/qc-pos-p1.3.mts` only if it can be done without DB (e.g. a source-level assertion that the regex no longer forces rail without the V2 signal) — mark it ORACLE-EDIT in notes with reason; otherwise describe the manual check for the controller's browser pass.
3. typecheck exit 0 · fitness (no env) green.
4. ONE commit on `wip/pos-p1.3` by explicit paths (never `git add -A`/`-a`), message ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, then `git push origin wip/pos-p1.3`.

## Report (English, ≤25 lines)
commit sha · files touched · approach + why no layout flash · typecheck/fitness exit codes · what the controller must verify in a browser (flag on/off × 1440/1024/390) · anything you could not do.
