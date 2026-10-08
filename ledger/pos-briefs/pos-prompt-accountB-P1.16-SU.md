# Prompt — P1.16 builder S+U (bills page server half + mockup 12 UI). Controller: oracle merged into session/pos at `f7134ed8`; 1 lane.

---

You are the BUILDER for POS work order **P1.16** — both halves: (S) `bills.ts`/`bills-actions.ts`/`bills-shared.ts`/`receipt-shared.ts` + `voidSale` 4th arg + R5b fixes, then (U) the "บิลวันนี้" page per mockup 12. English reports, Thai code comments. Reply compact.

## Read first
- `ledger/pos-briefs/pos-brief-COMMON.md`, `pos-brief-LANE-RULES.md`, `pos-spec-P1.3-register-ui.md`.
- `ledger/pos-briefs/pos-brief-P1.16.md` — whole file. §2 R1–R6 (+R5b), §3 U1–U9, §5 CD1–CD5 are binding.
- `ledger/wo-notes/pos-P1.16-oracle.md` — **names table = law** (use every name exactly), fixture layout, drift list 1–10 (follow them: audit via `tx.auditLog.create` inside `voidSale`; replay detected by key BEFORE calling `voidSale`; non-POS refusal in `voidSaleByActor`; `Promise<void>` kept; `can.refund` = permission AND `sale.refundable`; scope rule = `receiptReadScope`). CONTROLLER rulings on its CD-O table: **all ▶ options stand**, plus: CD-O3 avg = half-up integer satang; CD-O7 precedence NO_PERMISSION → NOT_POS → HAS_REFUNDS → SHIFT_CLOSED; CD-O8 ALSO pass the POS refund document's `vatSatang` through to the accounting CREDIT_NOTE document (`account/service.ts upsertExternalCreditNoteDocument` — smallest hunk: accept an optional explicit VAT, use it when given) so documents = POS docs = JV; CD-O13 `billDetail` serves SALE documents only (a REFUND id → `SALE_NOT_FOUND`).
- Oracle `scripts/qc-pos-p1.16.mts` (28 checks). Do NOT edit it; report `ORACLE-EDIT?` with the check id if a check is impossible as written.
- Patterns: `src/app/app/sys/[id]/pos/shifts/` (page + client + ui), `stock/`, `reports/`; `refund-actions.ts`/`receipt-actions.ts` for the action shape; `src/lib/modules/pos/refund-math.ts` (client pricing); `receipt-render.ts` (`renderReceiptHtml`, client-safe).
- AGENTS.md → read `node_modules/next/dist/docs/` before Next code ("use server" exports only async functions; `'use client'` never imports a module that reaches prisma — use `*-shared.ts`; one server action per screen load → compose reads server-side).

## Tree
`/root/projects/shark-pos-c` (own rw node_modules, client generated for a1fa7514; `.env.qc`/`.env.qc4` = QC4 `ep-frosty-lab`, neondb_owner — print only the hostname). `git status --short` must be clean; `git fetch origin session/pos && git checkout -b wip/pos-p1.16 origin/session/pos`. No schema/migration. Never touch other trees/processes, never `pkill -f`, no build/server/deploy/.env/Telegram. DB: `bash scripts/iso.sh env QC_FORCE=1 bash scripts/qc4.sh bash scripts/with-gate-lock.sh <cmd>`. Typecheck: `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh flock -w 3600 /tmp/pos-gate.lock pnpm typecheck` (never `/tmp/shark-gate.lock`).

## Build order (commit + push `wip/pos-p1.16` after each step; typecheck before each push)
1. S: `receipt-shared.ts receiptKindOf` (+ `receipt.ts` uses it), `bills-shared.ts`, `bills.ts` (`billsPageData`, `billDetail`, `voidSaleByActor`), `voidSale` 4th arg (audit in tx), `bills-actions.ts`, messages `pos.bills.errors.*` th+en, tab label "บิลวันนี้" in `tabs.ts` + `layout.tsx`. Run `qc-pos-p1.16` forced after each sub-step; target: everything except R5b green.
2. S: R5b (a) `account/index.ts applyExternalRefund` uses the refund doc's `vatSatang` (passed from `bridgePosSaleRefunded`) + CD-O8 document pass-through; (b) `service.ts saleStatusByKey` returns null for REFUND rows. `qc-pos-p1.16` 28/28 forced ×2 + unforced; money set + `qc-pos-p1.8` 49/49 unchanged.
3. U: page `/pos/sales` per brief §3 U1–U8 (client component + server page, drawer, void dialog, refund modal with `refund-math`, reprint via `reprintReceiptAction` + `renderReceiptHtml` in a hidden iframe → `print()`), testids `pos-bills-*` + `scripts/pos-ui-inventory.json` rows, keys th+en.
4. U: `scripts/visual-pos.mts` `--page sales --states` per U9 (`bills-list`, `bills-drawer`, `bills-void`, `bills-refund`, `bills-empty`; owner + cashier; cleanup in `finally`); `--dry` rc 0 for both users. The controller runs the real shots on p11.

## Gates before "done" (paste exit codes in `ledger/wo-notes/pos-P1.16.md`)
typecheck 0 · `qc-pos-p1.16` 28/28 forced ×2 + unforced, no residue · `qc-pos-p1.8` 49/49 · `qc-pos-p1.10` 40/40 · money set COMMON §7 (`qc-pos-account`, `qc-account-cpa` 107, `qc-restaurant-money`, `qc-shop-refund`, `qc-hotel-money`, `qc-ticket-money`, `qc-subscription-money`) identical · `qc-pos-p1.3`, `p1.6`, `p1.9`, `p1.9b`, `p1.14`, `p1.17`, `p1.1` unchanged · `qc-hf-pos-page-authz` · `qc-nav-functions` · `pnpm fitness` with/without .env · `scripts/fitness-pos.mts` (F15.2: `voidSale` return type unchanged; new caller listed → say so, the controller runs `--update-pos-contract`) · visual `--page sales --states --dry` owner + cashier rc 0.

## Done =
- Notes `ledger/wo-notes/pos-P1.16.md`: per-step results, screens built, deviations from mockup 12 with the ruling for each (U2 "รอเงินเข้า" omitted, "ส่ง LINE"/"ขอใบเต็มรูป"/"เครดิตร้าน" out of scope …), contract summary (actions, shapes, refusal codes), follow-ups, gate lines.
- Last push of `wip/pos-p1.16`; report ≤25 lines with the head SHA. Do not merge, do not touch `session/pos` or `main`.
