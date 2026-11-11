# Prompt — P1.13 oracle writer (fail-before). Controller: base = session/pos (fetch latest); lane 4, tree d.

---

You are the ORACLE WRITER for POS work order **P1.13** (full tax invoice from the pay screen · later issue / from P1.11 request · DBD lookup facade · buyer profile). You write the test suite BEFORE the builder exists. English reports, Thai code comments.

## Read first
- `ledger/pos-briefs/pos-brief-COMMON.md`, `pos-brief-LANE-RULES.md`, **`pos-brief-P1.13.md`** (whole file; §2 R1–R9, §3, §4 plan, §5 CD1–CD6 binding).
- Reference oracles: `scripts/qc-pos-p1.11.mts` (temp tenant, linked/unlinked POS fixtures, request rows), `scripts/qc-pos-p1.8.mts` (account docs/credit notes, money assertions), `scripts/qc-pos-p1.7.mts` (injected deps stub pattern). Existing modules: `src/lib/modules/pos/receipt-tax-request.ts`, `account-bridge.ts`, `src/lib/modules/account/index.ts` (`applyExternalSale`, `applyExternalRefund`, `findExternalSaleDoc`), `account/dbd.ts` (`lookupJuristic`, `DbdLookupResult`), `public-receipt.ts`, `receipt.ts`, `refund.ts`, `register.ts` (`submitRegisterSale`), `core/scope.ts`, `scripts/pos-qc-env.mts`.
- Memory rules: `scripts/*.mts` are typechecked by `next build` — no `any` leaks, no unused imports; the oracle must `--list` ids without DB and `--no-db` static checks must not load prisma.

## Deliverables
1. `scripts/qc-pos-p1.13.mts` — ~24 checks per brief §4 with ids `B1…Z1`, `JSON_SUMMARY` line, forced/unforced modes like the other suites, own temp tenant with full cleanup in `finally` (residue 0 counted across all tables), DBD via an injected stub only (assert the stub was called with the 13-digit id; never network). Static checks `ST1–ST4`: migration SQL additive only; `PosBuyerProfile` registered in `scope.ts` + `pos-qc-env.mts`; `pos/**` imports only `@/lib/modules/account` (no internals); `"use server"` action files export only async functions. Write checks against the names in your names table so they **fail before build** (run it: expect red with "missing export/model", not a crash), then exit 1 cleanly.
2. `ledger/wo-notes/pos-P1.13-oracle.md` — names table (functions, actions, codes, event, audit types, columns, messages keys), drift list vs existing code, `CONTROLLER-DECISION` items (anything the brief leaves open — e.g. the exact contact-resolver call, how `findExternalSaleDoc` picks TAX_INVOICE over ABB, the TAX_INVOICE numbering series name in the account module), and the `--list` output.
3. Run: `--list` (no DB) · `--no-db` · forced once on QC4 (expect red, residue 0). Typecheck the script: `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh flock -w 3600 /tmp/pos-gate.lock pnpm typecheck` (if the lock waits > 20 min, fall back to `pnpm exec tsc --noEmit -p tsconfig.json` on the single file via a temporary tsconfig in your scratchpad and say so).

## Tree
`/root/projects/shark-pos-d` (own rw node_modules; `.env.qc`/`.env.qc4` = QC4 `ep-frosty-lab`, neondb_owner — print only the hostname). It is detached on a scratch merge: `git -C /root/projects/shark-pos-d status --short` must be clean, then `git -C /root/projects/shark-pos-d fetch origin session/pos && git -C /root/projects/shark-pos-d checkout -B wip/pos-p1.13-oracle origin/session/pos && pnpm exec prisma generate`. Never touch other trees/processes, never `pkill -f`, no build/server/deploy/.env/Telegram, no schema/migration (the builder does that), no edits outside `scripts/qc-pos-p1.13.mts` and the notes. DB commands: `bash scripts/iso.sh env QC_FORCE=1 bash scripts/qc4.sh env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-pos-p1.13.mts`. Never wipe QC4.

## Done =
Commit + push `wip/pos-p1.13-oracle`; report ≤25 lines: head SHA, check count, `--list` ids, the forced run's red summary (which ids and why), CONTROLLER-DECISION items. Do not merge.
