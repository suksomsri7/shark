# POS P4.3 — product fix round 1 (builder · account A)

Builder · 23–24 Oct 2026 (`date -u` 23:39Z → see §4) · tree `/root/projects/shark-pos-f` · branch `wip/pos-p4.3-fix1`
(base = session/pos dd2508d0 + walker e1f1d751 + oracle 6ab9d27e · later merged oracle round 2 ce96b6fa and walker fix2 cc63248d on coordinator order).
Brief `ledger/pos-briefs/pos-prompt-accountA-P4.3-FIX1-BUILD.md` (session/pos 9fa72630) · spec = `ledger/wo-notes/pos-P4.3-oracle.md` (§1 + round 2) + `scripts/qc-pos-p4.3.mts`.
No build, no serve, no QC5, no `.env*`, no install/generate/reseed/migration. Every node command ran in `scripts/iso.sh` with ISO_MEM=3G. No `scripts/qc-*.mts`, walker or fixture was edited.

## 1. Per check — what changed

| check | change (file:line) |
|---|---|
| S1 | `src/proxy.ts:54-56` `Permissions-Policy` → `camera=(self), microphone=(), geolocation=()` (WO-0043 comment kept + `POS P4.3 ▸ CD-P43-1` note). Only setter in `src/`. |
| S2 · D1b | New `src/lib/modules/pos/account-links.ts` `posAccountLinks(ctx, actor) → {accountSystemId, docs, settings}` (CD-P43-O10). Account rule via the facade: new `accountCanMember(MembershipCtx, action)` in `account/access.ts` (old `accountCan` now delegates to it — same IMPLIES table, behaviour unchanged) re-exported from `account/index.ts` (POS-scoped comment). `sales/page.tsx:38-40,73` `accountSystemId={links.docs ? links.accountSystemId : null}`. `receipt-settings-actions.ts:96-97,117-118,159` `book.canOpenAccountSettings` (= `links.settings`, book id must match). `ReceiptSettings.tsx:670-680` `{book.canOpenAccountSettings && (<Link pos-settings-account-link/>)}`. Registry rows `sales#pos-bills-accounting-link` + `settings#pos-settings-account-link` → roles `[owner, manager]`, hiddenFor `[cashier]`, oracle `P4.3-S2` ($fields.hiddenFor · qc-pos-p4.1 R9 · CD-P42-W8). |
| S5 · D1 | none (green by design). |
| D2 | `price-rule.ts:142-150` savePriceRule **create only**: actor not OWNER/"*" + `unitIds []` ⇒ stored = linked POS units the actor can access (e.g. `[A1]`); prior/archive checks keep `[]` = all units. Client: `price-rules/page.tsx` computes `defaultUnitIds` (restricted actor + one visible unit = chips hidden) → `PriceRulesClient.tsx:21,46-48,131,214` new rule starts with own unit. |
| D3 | `chat-link.ts:78-87` raw UPDATE adds `"updatedAt" = now()`. |
| D4 | `credit-shared.ts` pure `saleCreditTermsView()` (dueDate YYYY-MM-DD + termDays, no limit/exposure). Optional `creditTerms` on `RegisterSubmitOk` (`register-shared.ts`, filled in `register.ts:2539-2541` regDuplicate = every submit path), `BillDetail` (`bills-shared.ts` · `bills.ts:523,616`), `ReceiptPayload` (`receipt-render.ts` · `receipt.ts:295,377`, SALE docs only), `PublicReceipt` (`receipt-public-shared.ts` · `public-receipt.ts:84`). PayDone chip now prefers `r.creditTerms.dueDate` (`RegisterScreen.tsx` send()). `pos-sale-contract.json` not touched (SaleResult unchanged). |
| S6 · D5 | F-P3-17: `hr-link.ts` `hrLinkedUserIds()` (facade `employeeOfUser`, lazy) → `settings-overview.ts:116-136` `staff[i].fromHr` (`PosStaffOverviewItem`) → `StaffSettings.tsx` tag `pos-settings-staff-from-hr-<userId>` ("จาก HR"/"From HR"). F-P3-18: `settings-overview.ts:172-210` `posCommissionCatalog` (OWNER or canViewPayroll · unit linked + accessible · categories + all products incl. variants and other-unit products · `ciContains` search · limit ≤ 500 · `more`) + `settings-actions.ts:159-179` `posCommissionCatalogAction` (first gate `payrollGate` = OWNER or explicit `hr.payroll.read`, reader re-checks) · `StaffHrCards.tsx` uses it (no `registerCatalogAction`). F-P3-19: `ListStaffForDeviceResult.overrideTtlMin` (`register-shared.ts`) filled in `staff-pin.ts:616-626` (settings read once) · `LockScreen.tsx` shows `lock.schedule.overrideBody {minutes}` (`pos-lock-override-body`, hidden when 0). |
| S7 · D7 | `pos-board-ui-actions.ts` `posBoardCardsAction` now also accepts `pos-86:<unit>:<product>:<mark>` / `pos-86:<unit>:<product>:` (current mark resolved from PosAvailabilityMark) and `pos-refund:<orderId>` (order of this POS; its unit) — per-key check: unit linked + (86: pos.sale.create ∨ pos.product.manage; refund: pos.order.accept ∨ reject ∨ pos.sale.create ∨ pos.sale.read) at that unit; failing keys dropped silently. Screens: register (tap a sold-out 86 tile → toast link `pos-reg-board-card-<productId>`), orders (`OrdersScreen` reads once per selection → `OrderPanel` `pos-ord-board-card-<orderId>`), bills (`BillDetail.orderId` new optional field → drawer row `pos-bills-board-card-<saleId>`). `href = card.href`. Registry rows added (oracle `P4.3-S7`). |
| S8 | `ReportsClient.tsx:255-275` and `ShiftsClient.tsx:944-945`: real null branch with new `…NoNumber` strings (no literal fallback). |
| D6 | New `src/app/app/sys/[id]/pos/reports/print/html/route.ts` `GET` (path per oracle O8, see §3): ANON 401 · no tenant/suspended 403 · not this tenant's POS / no accessible unit 404 · no `pos.report.view` anywhere 403 · `?unit=` without `pos.report.view` there → 403 · reader refusal → 403/400/404 · OK → 200 `text/html` = `posReportPrintAction` HTML (+ overview via shared `combine`) with a nonce'd `print()` script, CSP `script-src 'nonce-…'`, no-store, noindex. `bodyOf`/`combine`/paper constants moved verbatim to `reports/print/print-doc.ts` and the print page imports them (page-authz RP-1 strings untouched). Authz matrix regenerated (`--write`, `--check`). No button → no registry row. |
| strings | th + en in `src/messages/{th,en}/pos.json` (report/shift `…NoNumber`, `settings.staff.fromHr`, `register.board.*`, `orders.board.*`, `bills.drawer.refundCard*`). |

## 2. Verification (all via iso.sh ISO_MEM=3G; QC4 via qc4.sh + POS gate lock; logs `/tmp/p43f1/*.log`)
Code head for every run below = **f11eb138** (this notes commit only adds ledger text).

| suite | result | note |
|---|---|---|
| qc-pos-p4.3 (QC4) | **28/28 ×2** at f11eb138 (+ 28/28 ×2 earlier at cf05376f / pre-commit tree) | fixture null · guardHits 0 · residue 0 |
| qc-pos-p4.3 --no-db | 18/18 | |
| qc-pos-p4.1 --no-db | 16/16 | R8 was red once (oracle text names `pos-bills-board-card`) → testid made fixed (one bill per drawer) |
| qc-pos-p4.2 --self-test | 12/12 | after walker fix2 merge |
| qc-pos-p3.4 --no-db | 14/15 · ST2 red | **lane pin** (LANE_REV 98f60761): register.ts (D4 import + regDuplicate) and staff-pin.ts (D5 listStaffForDevice) edited outside the P3.4 block · contract part of ST2 fine (pos-sale-contract.json untouched) |
| qc-pos-p1.6 | 48/48 | |
| qc-pos-p5.2 | 55/55 (pendingOwner F4 F11 as before) | matrix M1–M5 green after `--write` |
| pos-authz-matrix-gen --check | ✅ | 403 rows |
| qc-pos-p2.2 | 40/42 · **P3 P5 red** | **not a lane pin — oracle encodes the pre-B7 rule** (P3: manager `unitIds []` and staff-with-key-at-A `[]` must be PERMISSION_DENIED; P5: no audit for those "refused" requests). CD-P43-3 makes them ok + stored `[A]`. Needs ORACLE-EDIT of qc-pos-p2.2 P3/P5 (controller). |
| qc-pos-p3.6 | 52/52 | dueDate surfaces additive |
| qc-pos-p3.5 | 54/55 · ST2 red | lane pin: register.ts hunk outside CD-B2 |
| qc-pos-p3.8 | 33/34 · ST3 red | lane pin "no diff vs 42b823e9" (order/receipt*/register*) |
| qc-pos-p1.17 | 40/40 | |
| qc-pos-p2.12 | 32/33 · ST1 red | lane pin "lane-A files untouched" (RegisterScreen, receipt*, register*, account/access+index) |
| qc-pos-p3.7 | 41/42 · ST3 red | lane pin "files = 72669941/42b823e9/98f60761" (receipt*, register*) |
| qc-hf-fu | 28/29 · ST1 red | lane pin (BillsClient, register-shared, register vs 98f60761) |
| qc-hf-fu2 | 30/31 · ST1 red | lane pin (proxy, RegisterScreen, register*, hunks without HF-FU2 tag) · createSale call sites unchanged |
| qc-pos-p2.14 --no-db | 15/15 | |
| fitness no-env / QC4 | 53/53 / 53/53 | + pre-commit fitness on every commit |
| fitness-pos | 8/8 | |
| gen-pos-api-docs --check | exit 0 | |
| strict tsc per touched file (heap 2.9G) | small graphs exit 0: PriceRulesClient, bills-shared, credit-shared, price-rule, receipt-public-shared, receipt-render, register-shared, proxy · **every file that reaches the account facade OOMs at 2.9G** (14 files) | full `pnpm typecheck` (heap 8192 / 10.5G) = controller gate |
| pos-pre-submit.sh | not run | runs suites at ISO_MEM 5G/7G (> brief cap 3G) |

## 3. Deviations from the brief / oracle note
1. Route path: brief says `src/app/app/u/[unitSlug]/pos/reports/print/html/route.ts`; oracle (O8, D6 discovery under `src/app/app/sys/[id]/pos/reports/**`) wins → `src/app/app/sys/[id]/pos/reports/print/html/route.ts`.
2. S2 facade helper is `accountCanMember` (actor/MembershipCtx based, round-2 contract needs `posAccountLinks(ctx, actor)`), not `accountCan` (session based). `accountCan` delegates to it, so IMPLIES stays in one place.
3. S7 (round 2 O7r): bills need the order id for `pos-refund:` keys → additive `BillDetail.orderId` (one indexed `findFirst` by tenant/system/unit/saleId). Register uses the prefix key form `pos-86:<unit>:<product>:` because the client does not know the mark id.
4. D4: payload/receipt/`/r` carry `creditTerms` as data only; the printed receipt HTML and `/r` page do not render a due line yet (would change receipt bytes/labels — owner decision).
5. `posCommissionCatalogAction` has an action-level first gate (OWNER or explicit `hr.payroll.read`) in addition to the reader's `canViewPayroll` — gives the matrix generator a key (otherwise CASHIER/STAFF_NOPERM = "?" → qc-pos-p5.2 M4 red).
6. `pos-pre-submit.sh` not used: it runs suites at ISO_MEM 5G/7G, which the brief forbids (≤ 3G). Suites were run one by one at 3G instead (§4).
7. Strict tsc: a single tsc program over all touched files OOMs at heap 2.9G (ISO_MEM 3G); ran one file at a time (§4). Full typecheck = controller gate.

## 4. Open items for the controller / R1
1. **ORACLE-EDIT qc-pos-p2.2 P3 + P5** (consequence of CD-P43-3/B7 — see §2).
2. Lane-pin reds to re-pin at merge: p3.4 ST2 · p3.5 ST2 · p3.8 ST3 · p2.12 ST1 · p3.7 ST3 · hf-fu ST1 · hf-fu2 ST1 (all "file must equal pin / hunks only in block X" rows; the files are the ones this card had to touch).
3. Full typecheck not run (3G cap) — please run the manifest `typecheck` at head.
4. Authz matrix: `posCommissionCatalogAction` infers MANAGER=allow (real rule: OWNER or `hr.payroll.read` → MANAGER without the key is refused) — suggest an OVERRIDES row like `updatePosStaffCommissionAction` (MANAGER deny, perm hr.payroll.read). Route `…/reports/print/html/route.ts#GET` row has CASHIER/STAFF_NOPERM/OTHER_UNIT = "?" (api kind, allowed); real: 403/403/403 — suggest an OVERRIDES row.
5. Owner/UI decisions: printed receipt + `/r` page have the `creditTerms` data but no rendered due line; multi-unit restricted manager on price rules still sees "ทุกสาขา" label for `[]` (server stores their units) — chips hidden case fixed only.
6. Visual states to shoot (fix round, `--states`): settings staff tab with an HR-linked user (`pos-settings-staff-from-hr-*`) · receipt tab as cashier (no `pos-settings-account-link`) · bills drawer as cashier (accounting doc no link) · lock screen override sheet (`pos-lock-override-body`) · register 86 tile toast with card (`pos-reg-board-card-*`) · orders panel with refund card (`pos-ord-board-card-*`) · bills drawer of an order bill with refund card (`pos-bills-board-card`) · reports anomaly chip / shifts chip with null cardNo.
