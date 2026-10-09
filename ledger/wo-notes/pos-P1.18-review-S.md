# P1.18 S — reviewer report (read-only, Opus) · head `wip/pos-p1.18` ffea3435 (code 0d39ac2d) · base d46b8e89 · 9 Oct 2026 15:1xZ
(saved verbatim by the controller · prompt `pos-briefs/pos-prompt-accountB-P1.18-R.md` · gates49 all green)

# P1.18 S review — wip/pos-p1.18 @ffea3435 (base d46b8e89) · reviewer (read-only)

**VERDICT: MERGEABLE-AFTER-FIXES.** F1 and F4 are one-line fixes. F2 and F3 need a controller ruling, which can be "accept and follow up". Logs agree with the notes: final2 headers say `tree=/root/projects/shark-pos-c head=0d39ac2d`; p1.18 forced ×2 + unforced 77/77 (residue 0, leaks none); p1.15 39 · p1.16 28 · p1.17 40 · p1.5 21 · p1.6 48 · p1.8 49 · fitness 41/41 ×2 · fitness-pos 8/8. final-1 (@d2ac9b07): pos-account 16/16 · account-cpa 107/107 · page-authz 56/56. gates49-c: all exit 0, including p1.3 at 128/128, so the builder's S9.1/S9.2 reds were drift from the parallel lane.

## Findings
- **F1 MEDIUM (FU-c regression)**: `pos/settings/page.tsx:44` sets `canEditReceipt = canManageAllLinkedUnits(...)`. That helper returns true for any `unitAccess:["*"]` membership without checking `pos.device.manage` (`receipt-settings.ts:59`). The writer checks the tenant-level `evaluate` first (`:89`); the page does not.
  - Input: a STAFF cashier with `["*"]` and only `pos.sale.create`.
  - Wrong outcome: the payments tab shows the shop's **unmasked PromptPay id** (`:62`, masked before this branch), and the receipt editor shows as editable while the server refuses.
  - Fix: `evaluate(m,{module:"pos",action:"pos.device.manage"}) && await canManageAllLinkedUnits(...)`. This is the same rule `posSettingsOverview.canEdit.receipt` uses.
- **F2 MEDIUM (K1 is easy to get around)**: `staff-pin.ts:363,371`. The `deviceId` comes from the client. Any well-formed code that is not REVOKED is accepted, and unregistered devices are allowed.
  - A session at the unit can send a fresh `deviceId` every 9 wrong PINs and never get throttled. That includes matching a MANAGER PIN to get a token with a higher discount cap.
  - Count-then-verify is not serialised, so a burst of parallel attempts all see a count below 10.
  - Smallest fix: also cap anonymous failures per **unit** in the same window (same AuditLog rows, filter `unitId` only, e.g. 3×N), and/or put all unregistered device codes in one bucket. Optionally take `pg_advisory_xact_lock(hash(unit))` around count, match and insert.
- **F3 MEDIUM (K4 deviation 1, needs a ruling)**: `approval/service.ts:224,250`.
  - The `crm.commission` set by itself keeps `qc-crm-c3.3` S4.8 green. Both dM (MANAGER's own row) and dO (OWNER's own row) are `crm.commission`.
  - The **OWNER exemption is not needed by any suite.** I checked qc-approval, approval-edit, approval-wiring and bulk-ops: no owner decides the owner's own request.
  - It is a role check, and it applies to **every entity type** (HrLeave, PurchaseOrder, POS_*). In tenants with more than one OWNER, any owner can approve their own request.
  - The entity-type set is narrow and does not leak to other types. The K4 oracle does exercise a non-owner MGR deciding its own `QC_P118_SELF` request (refused, stays PENDING, 0 decisions, 0 outbox).
  - Recommendation: rule on the OWNER part. The narrowest option is the commission set only. If the one-owner case matters, narrow it to "requester is OWNER and the tenant has no other OWNER".
- **F4 LOW-MED**: `settings-actions.ts:107` turns any non-string `promptpayId` (undefined, a number, an object) into `null`, which **deletes** the branch's PromptPay id. A malformed client call therefore wipes a money destination. Fix: pass `args?.promptpayId` through unchanged; the writer already returns VALIDATION for non-strings.
- **F5 LOW (audit masking rule)**: the receipt audit (`receipt-settings.ts:113`, via `settingsAuditDiff`) stores the whole `header`, including the raw `header.phone`. `posSettingsHistory.summaryOf` then returns it as `header.phone`. The rule is "phones masked in audits": mask or drop `phone` in the receipt diff.
- **F6 LOW → P1.18U**: the branch PromptPay id is honoured only by `createPaymentIntent` (`payment-intent.ts:254`, unit first, profile second ✓). The register's client-side static QR (`pos/register/page.tsx:80` → InterimPayDialog) still uses the profile id. A branch with its own PromptPay therefore shows the shop's QR when intent mode is off. Add this to the U contract.
- **F7 LOW**: the ACCOUNT card and toggle use only the **oldest** `AccountSystemLink` of the POS (`pos-integrations.ts:163,240`). The unique key is `(systemId, linkedKind, linkedId)`, so a POS can be linked to two ACCOUNT systems. Disabling then leaves the second link posting. Fix: act on and report all links of the POS, or refuse when there is more than one.
- **F8 LOW**:
  - CHAT `lastActivityAt` (`:191`) is tenant-wide, not scoped to this POS. Fix: add `targetId` or the systemId filter.
  - Empty `lastActivityAt` for COUPON/REWARD/CRM/KANBAN is acceptable (deviation 6, not oracle-checked).
- **F9 LOW (K3 edge)**: `held-cart.ts:165`. On P2002 the fallback returns the existing `hcap…` row whatever its status. If a submit failed after the hold, a retry with the same key can attach a request to a DISCARDED or expired cart. Fix: add `status:"HELD"` to the where, or refuse.
- **F10 LOW (process)**: the HR-owned `qc-hr-roster` NM-2 edit has no line in `POS-OWNER-PENDING.md`. Only the account and approval edits are listed. Add one for the HR session.
- **F11 INFO**: `posSettingsHistory` (`settings-general.ts:423`) lets a manager of any one linked unit read the whole POS history, including other branches' PIN events. `actorName` falls back to the user's email (`:453`). Acceptable for P1; worth a note.

## ORACLE-EDIT judgement (each is its own `test(...)` commit, count unchanged)
- `29d5b747` page-authz S-8 (56): **ACCEPT.** Only the function name changes, as Q9 requires; the notFound and posSaleWhere assertions are kept.
- `1c73af7c` p1.15 PN3/PN8 (39): **ACCEPT.** This is ruling 1. PN3 now compares the full message with a real weak-PIN refusal from the same actor and target, which is stronger than before. PN8 lists 6 codes.
- `aa88aca1` p1.18 I8 (77): **ACCEPT.** The oracle was self-contradictory. The brief §6 (12: "จองล่วงหน้าออกบิลที่ POS ✗ P2.7") and names table #20 both give `advanceBookingBill` P2.7. I8's "every fact = P2.4" could never be satisfied, and I12 still pins the exact phases.
- `781c440b` qc-hr-roster NM-2: **ACCEPT with a note.** NM-2 already asserted POS labels inside the HR suite (a cross-module consistency check). The new check is key-equality: all 9 `POS_NAV_KEYS` appear as `posNav("nav.k")` in the layout, and the posTabs length matches. The edit is close to minimal (+7/−4). It now imports a POS export into an HR suite, so the HR owner must be told (F10).
- `9e7668ef` p1.16 ST1 (28): **ACCEPT.** The `nav.sales` / `sales:` line test plus the th value "บิลวันนี้" keep the original intent.

## Verified OK
1. Both permission keys are registered with Thai labels and marked. Cross-tenant ids return NOT_FOUND: tenant-scoped lookups give 404 for owners, and non-owners get a uniform PERMISSION_DENIED that leaks nothing. Overview is readable by cashiers; staff overview needs manage at the unit. `posSalesReadScope` = read OR create per unit, and `posSalesScope` is unchanged. FU-c is OK except F1.
2. Parser keys, ranges and defaults match the names table, with dotted `field`. The writer does `FOR UPDATE` plus a `jsonb_set(...||keys)` of only its own sub-trees, built from the locked read. The other POS writers also lock the same row, so writes are last-writer-wins per section with no clobbering. G5 no-op ⇒ no write and no audit. Audits are written after commit, and payment/intent diffs carry no secrets. History is sorted (createdAt, id) desc with a stable cursor, 20 per page, and drops `promptpayId`. The `posHeldCartExpireDays` extraction behaves exactly as before.
3. `reports.ts` (scopeOf `:307` → rangeOf / dayStart / bkkBusinessDate / dashboard) and `closeDaySummary` / `Bills` / `Csv` (`service.ts:1010,1051,1132`) both use `[D+cutoff, D+1+cutoff)` Bangkok. Worked through: a sale at 02:00 with cutoff 240 lands on D−1 in both. Cutoff 0 gives the old ranges.
4. PromptPay writer: OWNER-only (`:280`), `isValidPromptPayId`, linked unit, null removes, nested `jsonb_set` that touches only `promptpayIdByUnit`, audit masked to `••••last4` (`:326`).
5. K1: the count runs before verify, ≥10 ⇒ PIN_THROTTLED with no new row, named attempts are untouched, the constants are exported, and th+en messages exist. The query is bounded by `(tenantId, createdAt)` over 15 minutes, so a device with a long history is not a problem. See F2.
6. K2: a taken PIN gets `refuse("WEAK_PIN")` with the identical code and message (PN3 asserts it). PIN_TAKEN stays in the union and keys but is never returned, and per-unit uniqueness is still enforced.
7. K3 **closed** for concurrent same-key first submits:
   - The deterministic `hcap…` id (`register.ts:2149`) gives one held cart through P2002 on the PK, outside any transaction.
   - The single snapshot (`pos-approval.ts:86`) makes both callers compute n=1 ⇒ the same `approval-POS_DISCOUNT_OVER-<heldId>`. `@@unique(tenantId, idempotencyKey)` dedupes the request, and the `PosApprovalPayload` PK on requestId dedupes the snapshot.
   - The old two-read interleaving (A: rows=[], submit, payload; B: open=null, count=1 ⇒ n=2) is gone. I found no remaining same-key interleaving that creates two requests. The only edge is F9.
8. K4: the guard runs before any step or write, so the request stays PENDING with no decision and no outbox. bulkDecide reports the message. Exemptions: see F3.
9. Composition root only. No new chat/kanban/hr/crm-internal imports under `modules/pos` (diff grep). Cards: 13 in the ruled order, states and facts exactly as table #20. Backlog runs under `set_config(statement_timeout, local)` and returns null on error. The action passes `undefined` opts, and the delay works only when `NODE_ENV≠production`. The kanban JSON read is read-only and tolerates missing keys. CHAT is LINKED/OFF/NO_SYSTEM per ruling 9.
10. ACCOUNT toggle: OWNER, or explicit `account.settings.manage===true` plus manage on all linked units (fail-closed with no units). Then CONFIRM_REQUIRED, same state ⇒ `changed:false` with no audit, never-linked ⇒ NOT_FOUND "เชื่อมที่หน้าบัญชีก่อน". The facade is additive and marked, and calls `connections.connect/disconnect` directly. Re-enabling clears `archivedAt` (connect's existing semantics).
11. `staff.total` = accepted STAFF with the unit or `*`; holders via `evaluate`; discount and onlineOrders have `permission:null`; the facade addition is additive; S3 filter (active, global/sys/unit) ✓.
12. Locale: the cookies helper is pure and the action sets exactly 2 cookies. `printLocale` comes from `posReceiptLocale` and is used only by browser + escpos. Sent receipts stay th (deviation 5). th `pos.nav.*` = the shipped labels and pages still default to th, so nothing changed for th. Until U, an EN user sees English in the sidebar and Thai in the page tabs (deviation 8).
13. `settings-actions.ts` and `pos-integrations-actions.ts` export only async functions. `settings-shared.ts` imports types only and no prisma. th and en got the same new keys (nav ×9, settings.errors ×2, register.errors.pinThrottled), with no missing keys. New Thai server strings appear only in `message` arguments.

## Follow-ups
- **P1.18U**:
  - Pass `t` to `posTabs`.
  - Default page dates via `posBusinessToday`.
  - Register static QR from the branch PromptPay (F6).
  - Show `pinThrottled`.
  - Sent-receipt locale (ruling 13).
- **Owners**:
  - HR: NM-2 edit (F10).
  - Approval: K4 exemption ruling (F3).
  - Kanban: a facade read for the void-card rule.
  - Account: multi-link POS (F7).

(Report saved at `/tmp/claude-0/-root/ed31d917-ff51-51e8-bfad-e5b8bfa6fa15/scratchpad/p118-r/REPORT.md`.)

---
## Controller rulings (15:1xZ) → fix round 1 (`pos-prompt-accountB-P1.18-S-fix.md`)
F1 fix · F2 fix (per-unit cap + unregistered-device bucket + advisory lock, ORACLE-EDIT K1b) · F3 = drop the OWNER exemption, keep the commission set only · F4 fix · F5 fix · F6 → P1.18U contract · F7 fix (act on every link) · F8 fix (CHAT scope) · F9 fix · F10 fix (pending line for HR) · F11 note only.
