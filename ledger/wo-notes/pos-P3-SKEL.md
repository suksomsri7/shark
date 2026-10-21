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
- [x] 9. gates — pre-submit ×2 (run 1 regression aborted: tree dirtied mid-run by a notes edit · run 2 full) + p1.18 rerun after fix · typecheck once at final head (result in the builder report)

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

## Gates (step 9)
- Pre-submit run 1 (head 192839b5, 18:26Z): WO part only — `qc-pos-p3-skel` 41/41 ×2 + `--no-db` 6/6; the regression half refused to start (`ledger/wo-notes/pos-P3-SKEL.md` edited while it ran — builder error, counted as a run).
- Pre-submit run 2 (head 5c6e54a2, 18:33Z → 19:21Z, logs `/root/pos-runs/presubmit-shark-pos-b-20261021T183345Z`):
```
PRESUBMIT-TABLE head=5c6e54a2 tree=/root/projects/shark-pos-b
suite                        exit pass/total     s  failed
wo-qc-pos-p3-skel-run1       0    41/41         45  
wo-qc-pos-p3-skel-run2       0    41/41         33  
wo-qc-pos-p3-skel-nodb       0    6/6            6  
qc-pos-p1.1                  0    180/180      168  
qc-pos-p1.3                  0    128/128      145  
qc-pos-p1.6                  0    48/48         47  
qc-pos-p1.7                  0    33/33         31  
qc-pos-p1.9                  0    53/53         24  
qc-pos-p1.9b                 0    22/22         13  
qc-pos-p1.10                 0    40/40         20  
qc-pos-p1.11                 0    38/38         48  
qc-pos-p1.13                 0    33/33         31  
qc-pos-p1.18                 1    80/81         45  P1.18-ST6
qc-pos-p2.4                  1    49/50         75  P2.4-ST4
qc-pos-p2.6                  1    66/67        112  P2.6-L3
qc-pos-p2.7                  0    42/42         70  
qc-pos-p2.8                  0    61/61         93  
qc-pos-p2.9                  0    62/62        116  
qc-pos-p2.9b                 0    53/53        671  
qc-pos-p2.10                 0    13/13         27  
qc-pos-p2.11                 1    33/34         70  P2.11-ST1  ⟵ หมุดเลน (คาดไว้ระหว่างเลน · ผู้คุม re-pin ตอน merge)
qc-pos-p2.12                 1    32/33         65  P2.12-ST1  ⟵ หมุดเลน (คาดไว้ระหว่างเลน · ผู้คุม re-pin ตอน merge)
qc-pos-p2.13                 1    53/54         91  P2.13-ST5  ⟵ หมุดเลน (คาดไว้ระหว่างเลน · ผู้คุม re-pin ตอน merge)
qc-pos-p2.14                 0    60/60         72  
qc-pos-p3.5                  1    54/55         44  P3.5-ST2  ⟵ หมุดเลน (คาดไว้ระหว่างเลน · ผู้คุม re-pin ตอน merge)
qc-pos-p3.4                  1    49/51         84  P3.4-ST1,P3.4-ST2  ⟵ หมุดเลน (คาดไว้ระหว่างเลน · ผู้คุม re-pin ตอน merge)
qc-pos-p3.9                  1    47/48         47  P3.9-ST4  ⟵ หมุดเลน (คาดไว้ระหว่างเลน · ผู้คุม re-pin ตอน merge)
qc-pos-p3.8                  1    32/34         38  P3.8-ST2,P3.8-ST3  ⟵ หมุดเลน (คาดไว้ระหว่างเลน · ผู้คุม re-pin ตอน merge)
qc-pos-p3.7                  1    41/42         72  P3.7-ST3  ⟵ หมุดเลน (คาดไว้ระหว่างเลน · ผู้คุม re-pin ตอน merge)
qc-pos-p3.6                  0    48/48         63  
qc-pos-api-skill             0    12/12         17  
qc-hf-fu                     1    28/29        122  HF-FU-ST1  ⟵ หมุดเลน (คาดไว้ระหว่างเลน · ผู้คุม re-pin ตอน merge)
qc-hf-pos-page-authz         0    87/87         14  
qc-hf-tx                     0    22/22         36  
qc-hf-fu2                    1    30/31         30  HF-FU2-ST1  ⟵ หมุดเลน (คาดไว้ระหว่างเลน · ผู้คุม re-pin ตอน merge)
qc-restaurant-money          0    6/6           15  
qc-shop-refund               0    12/12         14  
qc-hotel-money               0    5/5           17  
qc-ticket-money              0    6/6           11  
qc-subscription-money        0    14/14         12  
qc-account-cpa               0    107/107       15  
qc-acc-v2-pos-lines          1    65/79         11  PL1.1,PL1.2,PL1.3,PL1.4,PL1.6,PL1.7 … [accepted]
fitness-noenv                0    53/53         14  
fitness-qc4                  0    53/53         14  
fitness-pos                  0    8/8           10  
gen-check                    0    -              1  
PRESUBMIT head=5c6e54a2 green=32 red=14 expected-lane-pin=10 unexpected-red=qc-pos-p1.18,qc-pos-p2.4,qc-pos-p2.6,qc-acc-v2-pos-lines · wo: qc-pos-p3-skel-run1=41/41 · qc-pos-p3-skel-run2=41/41 · qc-pos-p3-skel-nodb=6/6 · VERDICT red (13: qc-pos-p1.18 qc-pos-p2.4 qc-pos-p2.6 qc-pos-p2.11 qc-pos-p2.12 qc-pos-p2.13 qc-pos-p3.5 qc-pos-p3.4 qc-pos-p3.9 qc-pos-p3.8 qc-pos-p3.7 qc-hf-fu qc-hf-fu2)
```
- Unexpected reds, resolved / explained:
  - `qc-pos-p1.18` ST6 — new codes `AGENT_REVOKED`, `UNAUTHORIZED` (`print-relay.ts` `PrintRelayCode`) had no `errors.<camel>` key ⇒ fixed (`pos.platform.print.errors` th/en, commit after 5c6e54a2) ⇒ direct forced rerun **81/81**.
  - `qc-pos-p2.4` ST4 (`scripts/qc-pos-p2.4.mts:347`) · `qc-pos-p2.6` L3 (`scripts/qc-pos-p2.6.mts:380`) — `CONTRACT_SHA_BASE = ba68f669…` (post-P3.4) vs `scripts/pos-sale-contract.json` sha 762e073c = the **base 71c49221** file (P3.6 +4 optional keys; CD-RP9 re-pinned only p2.10). File byte-identical to 71c49221 ⇒ **base drift, not this card** — controller re-pin (CD-SKEL-B4).
  - `qc-acc-v2-pos-lines` — `[accepted]` by the manifest (QC4 has no acc-v2 seed).
- Expected lane-pin reds (migration / new files — controller re-pins LANE pins at merge):
  - `qc-hf-fu` ST1 — prisma/ changed vs c3c52ef1 (check `scripts/qc-hf-fu.mts:532–591`)
  - `qc-hf-fu2` ST1 — prisma/ + new route.ts files + `scope.ts:99` / `bills-shared.ts:191` / `bills.ts:28`, `:582` hunks without an HF-FU2 marker (+22)
  - `qc-pos-p2.11` ST1 (`:364`) · `qc-pos-p2.12` ST1 (`:421`) · `qc-pos-p2.13` ST5 (`LANE_PIN :350`) — `prisma/migrations/20261218100000_pos_p3skel/migration.sql`, `prisma/schema/pos.prisma`
  - `qc-pos-p3.5` ST2 — "migration ใหม่ที่ไม่ใช่ของใบนี้: 20261218100000_pos_p3skel" · `qc-pos-p3.9` ST4 — prisma files · `qc-pos-p3.4` ST1 — "migration ใหม่อื่น: 20261218100000_pos_p3skel"
  - base drift labelled lane-pin by the script (files byte-identical to 71c49221): `qc-pos-p3.4` ST2 (`register.ts` outside the P3.4 block — P3.6 hunk) · `qc-pos-p3.8` ST2 (`outbox-consumers.ts` +28/−10 vs its pin) · `qc-pos-p3.8` ST3 / `qc-pos-p3.7` ST3 (P3.6 migrations + `order.ts`/`refund*` + this card's prisma files)
- `gen-pos-api-docs --check` (gen-check) exit 0 · fitness ±env 53/53 · fitness-pos 8/8 · money set green · `qc-pos-p1.6` 48/48 (R2 actions).
- CD-SKEL-B4: re-pin `qc-pos-p2.4` ST4 / `qc-pos-p2.6` L3 `CONTRACT_SHA_BASE` → 762e073c… (P3.6 contract; not this card).

## §fix1 (controller B rulings 21 Oct 20:1xZ · review `pos-P3-SKEL-review.md`) — from e05a7cec
- **F1** `pos/secret-box.ts:20–24` posSecretKey = `deps.key` if given else env (NODE_ENV special-case removed) · ORACLE-EDIT `scripts/qc-pos-p3-skel.mts:1242–1243` `undefined` → `{}` (own test commit 175e29a4).
- **F2** `scripts/gen-pos-api-docs.mts:377–378` + regen `docs/api/POS-API.md` (one line: `slips` `{id, status, thumbUrl null}` on `GET /sales/{id}`).
- **F3** `pos/integration-creds.ts:125–126` scopeKey `system:<systemId>` — unique index `(tenantId, kind, provider, scopeKey)` unchanged ⇒ **no migration** (data-level; QC4 had no SLIP_VERIFY/ETAX rows outside temp tenants). The schema comment still says `"system"` (schema add-only rule — not edited).
- **F4** `platform/dispatch.ts:115–123` bad-signature WARN ≤ 1/channel/min (`once()` memo `:23–31`) · **F5** `dispatch.ts:105–111` + `integration-creds.ts:288–310` `platformInboundCreds` ⇒ `{ok:false, reason NO_SECRET|BOX_UNREADABLE}`; BOX_UNREADABLE ⇒ WARN ≤ 1/channel/hour.
- **F6** `platform/minute-jobs.ts:478–485` expirePrintJobs first, then `purgeExpiredSlips({now, deadline: ctrl.deadline})` · `payment-slip.ts:368–372` loop stops at deadline (`cutOff`).
- **F7** `print-relay.ts:27–30, :74–80, :85–90` printer `target?` (kitchen|receipt, unique per agent) · `printerFor()` = target match, else the single untargeted printer, else null — no name matching.
- **H1** `payment-reconcile.ts:105–113` evidence = CONFIRMED slip tied to the intent with `amountSatang === intent.amountSatang`; flags + `SALE_REVERSED` (sale VOIDED/REFUNDED/refundedSatang>0) + `AMOUNT_MISMATCH`; rows + `saleStatus`, `saleRefundedSatang` (CSV header unchanged). ORACLE-EDIT RC1 (`qc-pos-p3-skel.mts:1958–1963` fixture slips, `:2002` m ∈ {NEEDS_CHECK, AMOUNT_MISMATCH}) own test commit · **red-before 40/41** (RC1 "m.flag OK (คาด NEEDS_CHECK)") → after fix 41/41.
- **H2** `payment-slip.ts:200–203` (+ `:207`, catch path) slip replay only for same unit + sale/payment/intent · `print-relay.ts:194–197` (+ P2002 path) job replay only for same unit + agent + target + device · else VALIDATION.
- **H3** `payment-slip.ts:198, :209–210` sha256 stored, repeat in tenant ⇒ SLIP_DUPLICATE · new migration **`20261218100100_pos_p3skel_slip_hash`** (ADD COLUMN `"sha256"` + unique (tenantId, sha256) on PosPaymentSlip only) · schema `pos.prisma:1235, :1255` · QC4 `_prisma_migrations` before: only `…_pos_p3skel` · deploy 19:46Z → applied 1 step.
- **H4** `payment-slip.ts:100–105, :354–366` purge date from the **current** setting: explicit `slipRetentionDays` (clamped 90–3650) applies to all existing slips (createdAt + days, raise or lower); unset ⇒ attach-time `purgeAfter`. (CD-SKEL-B5: "unset ⇒ attach-time" keeps SL7 green without an ORACLE-EDIT — controller may prefer SL7 keeping 30 during the purge and "unset ⇒ 1825".)
- **H5** `secret-box.ts:13–14, :23–24` key < 32 chars ⇒ null ⇒ `keyConfigured:false` / NOT_CONFIGURED (message + PLATFORM-SETUP say ≥ 32).
- **H7** `print-relay.ts:29–30, :62–63, :76` ports 9100–9102/515 only, 169.254/16 refused · `agent.mjs:23–28, :35` same ports, `isLanHost` drops 169.254/16 · ORACLE-EDIT LP fixture `qc-pos-p3-skel.mts:2098–2111` fake printer on first free 9100–9102 (own test commit; not pre-approved ⇒ **CD-SKEL-B6**).
- Direct forced runs: after H3 (before H1 fix) 40/41 (red-before) · after H1 **41/41**.

### OP lines (fix1)
- **H6 (P3.1/P3.2-real)**: skeleton signature `x-shark-signature` has no timestamp/nonce ⇒ a captured signed body replays forever (harmless now: 503, no write). Real adapters must use the platform's signed timestamp/nonce with a ±5 min window **and** dedupe on `externalRef` (X1 unique already exists). Note: uppercase hex / `sha256=` prefix are refused today — match the platform's exact format.
- **H8 (cost)**: each agent long-poll = 1 function for ≤ 25 s and ~1 claim UPDATE/s → consider a 2–5 s poll interval / backoff when idle, or LISTEN/NOTIFY, before many shops run agents.
- **W19 follow-up (owner/accountant)**: retention now follows the current setting for existing slips (H4); still missing = a per-slip **legal hold** (dispute/audit) that blocks purge, and the PDPA erase path for slips (erase request vs 5-year bookkeeping duty — which wins, logged). Decide precedence before go-live.

### Gates fix1 (one pre-submit · head d9f2d0fc · 19:50Z · logs `/root/pos-runs/presubmit-shark-pos-b-20261021T195044Z`)
```
PRESUBMIT-TABLE head=d9f2d0fc tree=/root/projects/shark-pos-b
suite                        exit pass/total     s  failed
wo-qc-pos-p3-skel-run1       0    41/41         74  
wo-qc-pos-p3-skel-run2       0    41/41         73  
wo-qc-pos-p3-skel-nodb       0    6/6            3  
qc-pos-p1.1                  0    180/180      324  
qc-pos-p1.3                  0    128/128      281  
qc-pos-p1.6                  0    48/48         81  
qc-pos-p1.7                  0    33/33        107  
qc-pos-p1.9                  0    53/53         50  
qc-pos-p1.18                 0    81/81         48  
qc-pos-p2.13                 1    53/54        109  P2.13-ST5  ⟵ หมุดเลน (คาดไว้ระหว่างเลน · ผู้คุม re-pin ตอน merge)
qc-hf-fu                     1    28/29        164  HF-FU-ST1  ⟵ หมุดเลน (คาดไว้ระหว่างเลน · ผู้คุม re-pin ตอน merge)
qc-hf-tx                     0    22/22         91  
qc-hf-fu2                    1    30/31        113  HF-FU2-ST1  ⟵ หมุดเลน (คาดไว้ระหว่างเลน · ผู้คุม re-pin ตอน merge)
fitness-noenv                0    53/53         14  
fitness-qc4                  0    53/53        105  
fitness-pos                  0    8/8            8  
gen-check                    0    -              1  
PRESUBMIT head=d9f2d0fc green=14 red=3 expected-lane-pin=3 unexpected-red=- · wo: qc-pos-p3-skel-run1=41/41 · qc-pos-p3-skel-run2=41/41 · qc-pos-p3-skel-nodb=6/6 · VERDICT red (3: qc-pos-p2.13 qc-hf-fu qc-hf-fu2)
```
Lane-pin reds only (p2.13 ST5 · hf-fu ST1 · hf-fu2 ST1 — prisma/ incl. the new `20261218100100_pos_p3skel_slip_hash`). Typecheck once at the final head (this ledger commit) — result in the report.
