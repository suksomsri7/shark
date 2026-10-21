# POS P3-SKEL S — builder notes (tree b · branch `wip/pos-p3-skel`)

Builder · account B (controller B) · 21 Oct 2026 · base `session/pos` product tip **71c49221** · oracle `origin/wip/pos-p3-skel-oracle` **5d3a84af** merged clean (no conflicts).
Contract = `ledger/wo-notes/pos-P3-SKEL-oracle.md` names table · brief `pos-brief-P3-SKEL.md` §10 rulings 1–11 + CD-SKa · prompt `pos-prompt-accountA-P3-SKEL-BUILD.md`.

## Progress (restart from here)
- [x] 1. branch + oracle merge · ORACLE-EDIT `pos-gates.json` (+`qc-pos-p3-skel` forced, after `qc-pos-p3.6`) commit 9e93b8f0 · red-before forced QC4 (PSK_PIN=71c49221) **3/41** (ST3 Z1 Z2) · 0 guard hits · residue 0
- [x] 2. migration `20261218100000_pos_p3skel` (CREATE TABLE ×4 + indexes · `SET lock_timeout`) · schema `pos.prisma` (added lines only) · `core/scope.ts` 4 × `sys()` · `POS_MODELS` ×4 · `prisma generate` (tree b, iso) · QC4 `_prisma_migrations` before deploy: pos_p35 / pos_p34 / pos_p36_credit_enum / pos_p36_credit finished, **no p3skel row** · `migrate deploy` 18:01Z → `20261218100000_pos_p3skel` finished, applied_steps 1
- [x] 3+4. secret box + creds + adapters + dispatch + inbound route — one commit 30a5e69f (a failed pre-commit F6.1 left step-4 files staged; fixed with an `assertCan` gate in `integration-creds-actions.ts`)
- [x] 5. slips + reconcile + `pos.slip.purge` — 9e24fe24
- [x] 6. e-Tax seam — def954d9 · ET1 hash `e538a07652145299acb586d9f5366610d28dcd68adbe3f10e34d58f82538c22e` (controller pins `ET1_GOLDEN_SHA256`)
- [x] 7. print relay + agent + `escpos-lan` — d5f61160
- [x] 8. docs + texts + production key rule — commit after d5f61160 · forced QC4 run 18:22Z **41/41** (0 guard hits · residue 0)
- [ ] 9. gates (pre-submit ×≤2 · typecheck once at final head)

## Files / hunks (per ruling)
New files (all under the brief's file list): `pos/secret-box.ts` · `pos/integration-creds.ts` + `integration-creds-actions.ts` · `pos/platform/{types,lineman,grab,marketplace,registry,dispatch}.ts` ·
`src/app/api/pos/platform/[provider]/[channelId]/route.ts` · `pos/payment-slip.ts` + `payment-slip-actions.ts` · `pos/slip-verify.ts` · `pos/payment-reconcile.ts` ·
`src/lib/platform/etax/{types,render,provider}.ts` · `pos/etax-link.ts` · `pos/print-relay.ts` · `src/app/api/pos/print-agent/jobs/route.ts` + `jobs/[id]/ack/route.ts` ·
`tools/pos-print-agent/agent.mjs` · `docs/pos/PLATFORM-SETUP.md` · migration `20261218100000_pos_p3skel`.
Marked hunks (`// POS P3-SKEL ▸ … ◂`, added lines only): `order-adapters.ts` (import + `API: platformDispatch`) · `device-shared.ts` (`escpos-lan` block after `MODES`) ·
`platform/minute-jobs.ts` (job `pos.slip.purge` → `purgeExpiredSlips` + `expirePrintJobs`) · `core/scope.ts` (4 × `sys()`) · `scripts/pos-qc-env.mts` (`POS_MODELS` ×4) ·
`prisma/schema/pos.prisma` (4 models appended) · **`bills.ts` + `bills-shared.ts`** (R7 `bill.slips`, one line each — not in any pin list, oracle drift 7) · messages th/en `pos.platform.*` (JSON appended).
Untouched: `lib/payment/beam.ts` · `modules/account/**` · `payment-intent.ts` · `order.ts` · `kds.ts` · `channel.ts` · `pos/api/**` (49 ops) · `register*` · `service.ts` · `shift.ts` · `pos-integrations.ts` facts · `qc-pos-p1.18.mts` · client/UI · `visual-pos.mts` · `outbox-consumers.ts`.

## Decisions / deviations (builder)
- **Storage pattern** = the repo's private-file pattern (CRM C0.4): `storage.uploadFile(…, {visibility:"private"})` → `t/<tenant>/private/<40 hex>` + `cdnUrl` `private://…`; viewer = `privateFileUrl` (`/api/files/<id>?exp&sig`, viewer `STAFF:<userId>`, TTL 300 s) only via `slipViewerUrl` after POS authz. `bill.slips[].thumbUrl` is **always null** (no signed link inside a DTO that REST `sales.get` also returns via `...bill`).
- Slip idempotency/race: row reserved inside a tx under `pg_advisory_xact_lock("pos:slip:<tenant>:<payment|intent>")` (replay → transRef dup → ≤ 3) then upload outside the tx; upload failure removes the reserved row. Unique `(tenantId, idempotencyKey)` + `(tenantId, transRef)` as backstop. Magic-byte check on jpeg/png/webp.
- Slip 4-eyes code = **`SLIP_SELF_CONFIRM`** (CD-S4 ruling). Reject requires a 3–200 char reason. Confirm/reject idempotent (no second audit).
- Creds: `scopeKey` column (= channelId or `"system"`) carries the K2 unique so system-level kinds (SLIP_VERIFY/ETAX) are unique too; `secretNames` lists filled secret fields (no values) so `filled` works without the key. Saving over an existing box with a different key ⇒ `NOT_CONFIGURED` "กุญแจไม่ตรง…" unless every stored secret is re-sent.
- Inbound route: provider unknown / bad id / missing / archived / adapter ≠ API / code ≠ provider ⇒ 404; cross-tenant ⇒ 503 NOT_CONFIGURED (T2 channel has no creds) — drift 4 accepted.
- Print relay: claim = `UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED LIMIT 10) RETURNING id`; job bytes cleared on DONE/FAILED/EXPIRED; expiry sweep also in the hourly job; agent connects only to LAN hosts unless `SHARK_PRINT_AGENT_ALLOW_ANY_HOST=1`.
- `device-shared.ts`: `PosPrinterMode` line not edited (added-lines rule) ⇒ `POS_PRINTER_MODE_LAN` + `PosPrinterModeAny` + runtime push into `MODES` (U uses `PosPrinterModeAny`).
- e-Tax preview: type code `T03` (ใบเสร็จรับเงิน/ใบกำกับภาษี — paid POS bill), doc no = the AccountDocument `docNo`, bill-level difference (discount/service charge) = one adjustment line so Σ lines = grand.

## CONTROLLER-DECISION
- **CD-SKEL-B1 (SK3 harness)**: `scripts/qc-pos-p3-skel.mts:1242–1243` calls `save(…, undefined)` / `readC(…, undefined)` meaning "not injected", but the helpers' default parameter (`:1220–1221 deps: Any = { key: RUN_KEY }`) injects the run key anyway. Builder made it pass **without an ORACLE-EDIT** by a stricter product rule: with `NODE_ENV=production`, `posSecretKey` ignores any injected `deps.key` (env only) — `pos/secret-box.ts` `posSecretKey`. Controller: accept the rule, or ORACLE-EDIT the two calls to pass `{}` (then the rule is optional).
- **CD-SKEL-B2**: `bill.slips` added to `billDetail` ⇒ REST `GET sales/{id}` (spreads `...bill`) also carries `slips:[{id,status,thumbUrl:null}]` — no new op, `pos/api/**` byte-identical; OpenAPI response schema not changed (op file untouched). Accept or ask U/API card to document it.
- **CD-SKEL-B3**: `ET1_GOLDEN_SHA256` = `e538a07652145299acb586d9f5366610d28dcd68adbe3f10e34d58f82538c22e` (controller test commit at `scripts/qc-pos-p3-skel.mts:561`).

## OP lines (owner / other module owners)
- §"แจ้งเจ้าของโมดูล platform/payment": `src/lib/payment/beam.ts:99–100` verifies Beam webhooks as hex(HMAC-SHA256(raw, secret UTF-8)); another integration observed base64(HMAC-SHA256(raw, base64-decoded secret)). Verify on the first sandbox call with SHARK's **own** merchant (W20) and fix there (shared by AI top-up + account charges). Not edited by this card.
- §"ACCOUNT": `AccountDocument.etaxStatus/etaxMeta` stay `NOT_SENT`/null — the account owner wires the queue/status when an e-Tax provider is chosen; seam = `src/lib/platform/etax/*` + `pos/etax-link.ts` (preview/request).
- §W4 (text): set env **`POS_CREDENTIALS_KEY`** on production (e.g. `openssl rand -hex 32`) **before** any credentials are pasted; without it the settings cards show "ยังไม่ตั้งกุญแจ" and saving is refused. Never reuse `CHAT_CREDENTIALS_KEY`/`SESSION_SECRET`.
- W19 default kept (1,825 d · min 90 · file purged, row kept) · W20 shortlist recorded in `docs/pos/PLATFORM-SETUP.md` (SlipOK/EasySlip/bank APIs · INET/Leceipt) · W5 real printer.

## U-only handoff (P3-SKEL U)
- Channel drawer creds card (10): `readIntegrationCredentialsAction` / `saveIntegrationCredentialsAction` / `testIntegrationConnectionAction` · chip `pos.platform.status.awaitingCreds` / `keyMissing` · masked fields · `webhookUrl` · test disabled until COMPLETE.
- Pay settings (10): slip retention (`settings.pos.payment.slipRetentionDays`, writer not added — U adds it to `payment-settings` or a new marked hunk) + slip-verify provider card (kind `SLIP_VERIFY`).
- PayDone / bills drawer (02/12): "แนบสลิป" → `attachSlipAction` (FormData) · manager confirm sheet → `confirmSlipAction` / `rejectSlipAction` · view → `slipViewerUrlAction` · `bill.slips`.
- 15A: muted line `pos.platform.etax.pending` under the e-mail field (+ optional preview via `etaxPreview` — needs a thin action).
- 17B: LAN agent card (register → token once `pos.platform.print.tokenOnce` · list · revoke — needs thin actions over `print-relay.ts`) + radio "LAN" (`POS_PRINTER_MODE_LAN`) enabled when an agent with printers exists · reconcile report screen/CSV (needs a thin action).
- `pos-ui-inventory.json` new testids (F15.3) · visual states th 3 sizes + en 1440 · re-pins at U merge: `qc-hf-fu` ST1 (PayDone) · `qc-pos-p2.12` ST1 (`DeviceSettings.tsx`).
