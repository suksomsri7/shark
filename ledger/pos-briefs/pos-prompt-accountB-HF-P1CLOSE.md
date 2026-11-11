# Prompt — HF-P1CLOSE builder (P1 phase-close parity fixes + harness states). Controller (account A, 10 Oct 00:xxZ): base = `session/pos` **711b6d5e** (merge P2.1U). Tree **b**.

---

You are the BUILDER for hotfix card **HF-P1CLOSE** — the fix-now rulings of the P1 parity sheet. Read `ledger/wo-notes/pos-P1.18-parity.md` ("OPEN items" table + "Controller rulings" footer — binding), `ledger/pos-briefs/pos-brief-COMMON.md`, `pos-brief-LANE-RULES.md`. English reports, Thai code comments. UI-only + harness; **no server/service/schema change, no new permission, no new message namespace** (new keys inside `pos.*` th + en are fine). ST7 = 0 Thai literals outside `t()` under `src/components/pos/**` and `src/app/app/sys/[id]/pos/**`.

## Work items
1. **O1** `src/components/pos/register/RegisterModeTabs.tsx`: "รายงาน / Reports" tab links to `/pos/reports` (no "เร็ว ๆ นี้"/soon, `href` set, same tab grammar as the live tabs). Also the owner unit chip at 390 (en) must show the unit name, not a bare "⌄" — find the chip component in the register header and fix the narrow-width label.
2. **O2** `src/components/pos/register/BillDiscountDialog.tsx`: coupon row is live — drop `soonChip` + `aria-disabled`, keep the existing coupon flow (P1.12U ruling 8).
3. **O4** settings "การเชื่อมต่อระบบ SHARK" header at 1024: title + subtitle must not be squeezed beside the count chip + history button — wrap chip/button below the title under `xl`, same grammar as the reports header. Fix every variant (owner, cashier, account-off).
4. **O5** 13B lock screen at 390: verify the overlay scrolls to the staff cards / "สลับพนักงาน" / held card (`LockScreen` overflow). Fix if not; otherwise write "scrolls, verified at 390" with a full-page shot path in the notes.
5. **O7** 17A "เลขเครื่อง POS ต่อเครื่อง" lists ACTIVE devices only; 17B device list folds REVOKED devices under one collapsed row "เพิกถอนแล้ว (n)" (expand on click). Data stays; no DB sweep.
6. **O13** cashier `products` page (`src/app/app/sys/[id]/pos/products/page.tsx`): render the same refusal card (HTTP 200) as stock/shifts/reports instead of 404; harness expectation for `products.cashier` stays `"record"`.
7. **Harness** `scripts/visual-pos.mts` (keep the HF-VIS-SHIFTS structure; every state registers/revokes what it creates; `--list` still works):
   - `held-drawer` (14B): register with ≥ 1 held bill → open the held-bills drawer; desktop/ipad/mobile.
   - `--page receipt-public` (11C): the public receipt of a real paid bill (reuse the `rpubState` seeding already in the script); desktop/ipad/mobile; th + en.
   - `sale-done` at 390 (th) in addition to desktop.
   - `paydlg-promptpay-timeout` + `paydone-print-failed` (19ค) **only if** the UI exposes those error cards deterministically through existing QC hooks (e.g. a static PromptPay slip that expires, a print path that fails in headless); if not, record exactly why in the notes and skip — do not add product hooks for the harness.
   Update `scripts/pos-qc-env.mts` `POS_PAGES`/`PAGE_EXPECT` for the new page. States must pass `--states` on your tree with the QC server **you do not run** — you only typecheck and `--list`; the controller shoots on tree d (vis58).
8. **Ledger**: `ledger/POS-OWNER-PENDING.md` — lines for the core owner (O3 app-shell i18n in en) and the approval-module owner (O12 21A approvals visual outside the POS harness). `ledger/wo-notes/pos-HF-P1CLOSE.md` — per-item change with file:line, the O5 verdict, the 19ค decision, new state ids, gate exit codes.

## Tree / commands
`/root/projects/shark-pos-b` — `git -C … status --short` clean → `git -C … fetch origin session/pos && git -C … checkout -B wip/pos-hf-p1close 711b6d5e`. Always `git -C …`/absolute paths; pnpm/tsx inside the tree. No DB writes except what `visual-pos.mts --list`/typecheck need (none). No build/server/deploy/.env/Telegram/seeds. Typecheck: `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh flock -w 3600 /tmp/pos-gate.lock pnpm typecheck`. Gates: typecheck 0 · `pnpm exec eslint` on touched files · `scripts/fitness-pos.mts` (ST7 0) · `pnpm fitness` ±env · `qc-hf-pos-page-authz` 56 (products cashier card must not leak data: run it under `bash scripts/iso.sh env QC_FORCE=1 bash scripts/qc4.sh env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-hf-pos-page-authz.mts`) · `pnpm exec tsx scripts/visual-pos.mts --list` shows the new states/page. Scratch only under `/tmp/claude-0/-root/ed31d917-ff51-51e8-bfad-e5b8bfa6fa15/scratchpad/hf-p1close/`.

## Done =
Commit per item (explicit paths) + push `wip/pos-hf-p1close`; report ≤15 lines with the head SHA, the O5/19ค verdicts and the new state ids. Do not merge; do not touch `session/pos`/`main`/other trees. Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
