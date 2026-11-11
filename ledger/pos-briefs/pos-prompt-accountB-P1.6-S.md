# Prompt for account B — P1.6 builder S (server + migration). Start only after P1.1b R3 is pushed.

---

You are the BUILDER S for POS work order **P1.6** (payment: VAT stored, split tender, cash tendered/change, service charge/tip settings, bill/line note, idempotency for all callers, unit↔system guard, oversell BLOCK). This is server side only: NO UI (builder U comes later). A controller reviews your work. Report in English in the notes.

## Read first
- `ledger/pos-briefs/pos-brief-COMMON.md`, `pos-brief-LANE-RULES.md`
- `ledger/pos-briefs/pos-brief-P1.6.md`: whole file, including §7 owner answers and §8 controller rulings. These are binding.
- Oracle `scripts/qc-pos-p1.6.mts` (48 checks) and `ledger/wo-notes/pos-P1.6-oracle.md` (names table, call-site list, drift found in §1). Do NOT edit assertions. The only approved ORACLE-EDIT is P1.3 S3.38 (§8.7: TRANSFER/CARD become valid register pay types). Record it.
- AGENTS.md: read `node_modules/next/dist/docs/` before touching Next code.

## Tree
- `/root/projects/shark-pos-p11` (own node_modules). It is on branch `wip/pos-p1.6-oracle`.
- Create the work branch: `git fetch origin session/pos && git checkout -b wip/pos-p1.6 origin/session/pos` (the oracle is already merged there). The tree must be clean first.
- Before any DB command, check that `.env.qc`/`.env.qc4` host contains `ep-frosty-lab` (print the hostname only).

## Migration (QC4 only)
1. Edit `prisma/schema.prisma` with additive changes only:
   - enum `PosPayType` + `CARD`
   - `PosSale.note`, `serviceChargeSatang`, `tipSatang`
   - `PosSaleLine.note`
   - `PosPayment.tenderedSatang`, `changeSatang`, plus a reference if missing
   - anything else the oracle names table needs
2. Write the migration SQL with `prisma migrate diff` (from QC4 to the schema) into a new folder `prisma/migrations/<timestamp>_pos_p16_payment/`. **Read the SQL.** It must be ADD COLUMN (nullable or with a default) and ADD VALUE only. Never drop or rename anything.
3. Apply with `prisma migrate deploy` against QC4 only, through the wrappers (`bash scripts/iso.sh bash scripts/qc4.sh …`).
4. `prisma generate` in this tree. Note: `/root/projects/shark-pos-b/node_modules` is a read-only bind mount of THIS tree's node_modules, so additive client changes reach it. That is fine.

⛔ Never `migrate dev`, `migrate reset` or `db push`. Never touch any DB other than QC4.

## Build order
Commit and push `wip/pos-p1.6` after each step:
1. `src/lib/money/vat.ts` `splitIncludedVat`, used by both `createSale` and the accounting bridge (V1–V5).
2. `createSale` (`pos/service.ts`):
   - split / CARD / tendered / change / note / line note
   - service charge and tip per §7/§8
   - idempotency for every caller (§8.3, I1–I7)
   - unit↔system guard (O21, before the receipt counter)
   - oversell BLOCK inside the sale tx under the inventory row lock (`FOR NO KEY UPDATE`, inventory-atomic order)
3. Payment settings module + action (K1–K9: rate, tip toggle, tip account must belong to the POS's linked book).
4. Register server path (`register.ts`, `register-actions.ts`): pay types CASH/PROMPTPAY/TRANSFER/CARD, ≤10 methods, tendered, note, new refusal codes as data, message keys th+en (R1–R3).
5. Restaurant re-checkout after void: mint a new key when the stored sale is VOIDED (§8.3, I6).

After each step:
- Run typecheck.
- Run `qc-pos-p1.6` forced, plus the suites of what you touched.
- Run the money set of COMMON §7, plus every createSale caller's suite (restaurant, shop, hotel, ticket, subscription, booking, clinic/school/rental if present).

A suite that relied on an unlinked unit/system pair gets a FIXTURE fix with a note. Never weaken the guard.

## Done =
- `qc-pos-p1.6` forced ×2 green (48/48), and unforced green.
- `qc-pos-p1.3` forced: S6.1 now green, plus S3.38 per the approved edit.
- `qc-pos-p1.1` 175+ still green.
- Money set + callers' suites identical to before, apart from listed fixture fixes.
- Typecheck 0; fitness both modes; no residue.

Write `ledger/wo-notes/pos-P1.6.md`:
- migration SQL summary
- per-step results
- the callers table (who passes a system, who falls under O21)
- ORACLE-EDITs
- open questions

Push and stop. No build, no screenshots.

## Hard rules
Same as before:
- Push only `wip/pos-p1.6`.
- Explicit-path commits; never commit `scripts/*-expected.json`.
- Never main, prod or `.env*`.
- Do not edit CRM files (`account/service.ts`, `ai/proposals.ts`). `account/index.ts` is also touched by CRM (other regions): there, change ONLY the VAT lines of the bridge (~:122-125) to call `splitIncludedVat`, nothing else, so the later CRM merge stays trivial.
- If a permission is denied, stop and report.
- QUOTA STOP at a clean commit with "next: <step>" in the notes.

Commit trailer:
```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```
