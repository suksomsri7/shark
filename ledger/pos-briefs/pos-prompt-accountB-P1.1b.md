# Prompt for account B (Claude Code on the VPS) — P1.1b builder, Part A

Copy everything below the line into Claude Code on the VPS, started in `/root/projects/shark-pos-b`.

---

You are the BUILDER for POS work order **P1.1b Part A** (two-way catalogue sync "dual-write"). You are one lane; a controller (another session) reviews and accepts your work. Report in English in the notes file; keep chat output short.

## Read first (in this order, whole files)
1. `ledger/pos-briefs/pos-brief-COMMON.md` and `ledger/pos-briefs/pos-brief-LANE-RULES.md`
2. `ledger/pos-briefs/pos-brief-P1.1b.md` — contract G1–G13, then **Addendum** (1 Oct 22:00) and **Addendum 2** (3 Oct, rulings 1–14). Where they differ, the later addendum wins.
3. `ledger/wo-notes/pos-P1.1a.md` (price precedence, D1 scope, "rule for P1.1b" lines) and `ledger/wo-notes/pos-P1.1b-oracle.md`
4. Oracle: `scripts/qc-pos-p1.1.mts` group S2. You do NOT edit assertions. ORACLE-EDITs allowed only where Addendum 2 names them (S2.19a, S2.45 wrapper name, S2.42 re-measure with evidence, moving an id to PART_B per rulings 1/11). Record every one in the notes.
5. AGENTS.md: this Next.js differs from training data. Read `node_modules/next/dist/docs/` before touching Next code.

## Tree and setup (do these first, stop and report if any fails)
- Tree `/root/projects/shark-pos-b`, branch `wip/pos-p1.1b` (head should be f135223d). `git status` must be clean.
- `node_modules` is a READ-ONLY bind mount of `/root/projects/shark-pos-p11/node_modules`. If it is missing after a reboot, run: `mount --bind -o ro /root/projects/shark-pos-p11/node_modules /root/projects/shark-pos-b/node_modules`. Never `pnpm install`. Never `prisma generate/migrate/format/db push`. No schema change in this WO.
- **Base update:** P1.3 was accepted and is now in `session/pos`. First `git fetch origin session/pos && git merge origin/session/pos` (merge commit, no rebase). Expect conflicts only in `src/lib/modules/pos/register.ts` and maybe `inventory/service.ts`. Keep both sides' behaviour. After merging, apply Addendum 2 ruling 3's merge item: P1.3's `registerCatalog` (register.ts, around the MENU availability read) must use the SAME live MENU availability rule as `listForUnit` (S1.27 must stay green). Then run typecheck and fitness. Push.
- DB = QC4 only. Before ANY DB-touching command, check that `.env.qc` and `.env.qc4` contain host `ep-frosty-lab` (print the hostname only, never the URL/password).

## How to run things (the env var goes INSIDE the wrappers)
- Typecheck: `bash scripts/iso.sh env NODE_OPTIONS=--max-old-space-size=5632 pnpm typecheck`
- Fitness: `bash scripts/iso.sh pnpm fitness` (both modes as in COMMON)
- Oracle forced: `bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-pos-p1.1.mts`
- Oracle unforced: the same command without `env QC_FORCE=1`. Expected: 115/115.
- Module suites: the same wrapper chain with the suite script (`qc-restaurant*`, `qc-shop*`, `qc-inventory*`, `qc-account-cpa`, `qc-booking*`, `qc-pos-*`, money set COMMON §7). Run them one at a time. They share the gate lock with other lanes, so if one waits, let it wait.
- Never build or start a server; never take screenshots. The controller does that.

## Work order (Brief §"Order of work" step 2)
`catalog-legacy.ts` + door rewiring, ONE FILE AT A TIME: menu → shop → inventory → inventory-link → account/product → booking → register.setItemSalePrice → order availability (G8). Then the reverse direction (G4b, rulings 4/11/12/13). Then the fitness baseline (G1). After each file:
1. Run typecheck and that module's own suites.
2. Commit by explicit path (never `git add -A` / `commit -a`; never commit `scripts/*-expected.json` or `scripts/fixtures/**`). Use `git commit --no-verify` after running fitness by hand.
3. Push `wip/pos-p1.1b`.
4. Append 3–5 lines to `ledger/wo-notes/pos-P1.1b.md`: what moved, suite results, open questions.

This way nothing is lost if your quota runs out.

Commit message ends with:
`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

## Hard rules
- ⛔ Never push `main`, never deploy, never touch production, never touch `.env*` contents. Push only `wip/pos-p1.1b`.
- ⛔ Do not edit `src/lib/modules/account/service.ts` or `src/lib/ai/proposals.ts` (CRM files, Part B).
- ⛔ Do not edit other lanes' trees (`shark-pos-p11`, `shark-pos`, CRM trees) and do not touch the cron autorun.
- QC4 must be left exactly as found (oracle S9-style residue checks). Do not re-seed or wipe the POS QC tenants.
- If a permission is denied, stop and write it in the notes. Do not work around it.
- **Quota:** you are on a nearly full plan. Do not re-read big files you already read. Do not run the whole regression set after every small edit; run only the module's suites. If you sense the limit is near, stop at a clean commit and write `QUOTA STOP — next: <file/step>` in the notes, then push.

## Done = report
When Part A is complete:
- Forced oracle: S2 Part-A checks green, Part-B checks skipped by their guard, twice in a row, no residue.
- Unforced oracle: 115/115.
- G13 suites identical before and after.
- Fitness and typecheck: 0 errors.

Write `ledger/wo-notes/pos-P1.1b.md` with these sections:
- summary
- file list
- lock order (G7)
- shared-row table (G5)
- the list of legacy actions and how each shows the BUSY message (G7)
- ORACLE-EDITs
- statement-count probe before and after (G8)
- open questions

Push, then stop. The controller re-runs everything independently and sends a reviewer and a hunter.
