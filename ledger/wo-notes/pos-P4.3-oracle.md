# POS P4.3 — oracle `scripts/qc-pos-p4.3.mts` (red-before at the tip)

Oracle writer · account A · 23 Oct 2026 23:1x–23:4xZ (`date -u`) · tree `/root/projects/shark-pos-e` · branch `wip/pos-p4.3-oracle` from session/pos local tip **dd2508d0** (clean at start).
Brief: `ledger/pos-briefs/pos-prompt-accountA-P4.3-ORACLE.md` (session/pos 4c66c727) · triage `ledger/wo-notes/pos-P4.3-triage.md` §3 P1–P4 + §1 R10 · rulings CD-P43-1…6 (POS-RESUME 23 Oct 23:1xZ).
Nothing under `src/` was touched. No build, no server, no QC5. DB writes only inside the temp tenant `posqc-p43-<rand>` (dropped in Z).

Files: `scripts/qc-pos-p4.3.mts` (24 checks: S1 S2 S5 S6 S7 S8 · D1–D6 · N1–N10 · Z1 Z2) · `scripts/pos-gates.json` row `qc-pos-p4.3` **unforced** right after `qc-pos-p5.3` (no SKIP gate, no `requires:` header ⇒ no `needs`).

Run: `env -C <tree> ISO_MEM=3G bash scripts/iso.sh bash scripts/qc4.sh env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-pos-p4.3.mts` · `--list` · `--no-db` (S* + N*) · `--self-test` (N1–N10).

## 1. Red-before on the tip dd2508d0 (QC4 · temp tenant `posqc-p43-84faba85` · 23:32Z)
Full run `qc-pos-p4.3` = **14/24** · `failed` S1 S2 S6 S7 S8 D2 D3 D4 D5 D6 · `fixture: null` (every fixture step worked) · guardHits 0 · Z1 0 rows / Tenant 0 / User 0 / sequence 0 · Z2 coffee/resto unchanged. `--no-db` 11/16 (same 5 static reds) · `--self-test` 10/10. Log `/tmp/p43o/run-tip-1.log`.

| id | finding | red-before (❌ actual, pasted) | product surface → expected fix |
|---|---|---|---|
| S1 | P1 camera (CD-P43-1) | `src/proxy.ts: camera=() (คาด (self))` | `src/proxy.ts:54` → `"camera=(self), microphone=(), geolocation=()"` (only setter in `src/`; platform file → OP notice). ScanCameraDialog.tsx:82 keeps getUserMedia (checked). |
| S2 | P2 accounting links (CD-P43-2) | `sales/page.tsx ส่ง accountSystemId={accountSystemId} ให้ BillsClient โดยไม่มีธงจาก account.doc.view · ReceiptSettings: pos-settings-account-link ไม่อยู่ใต้เงื่อนไขสิทธิ์ · settings/page.tsx · receipt-settings-actions.ts ไม่ตัดสิน account.settings.manage · ทะเบียน pos-bills-accounting-link: roles [owner,manager,cashier] hiddenFor [] · ทะเบียน pos-settings-account-link: roles [owner,manager,cashier] hiddenFor []` | `sales/page.tsx:34,68` compute a flag from `account.doc.view` (use the account facade `accountCan` so IMPLIES holds; MANAGER passes, cashier not) and pass `accountSystemId={flag ? accountSystemId : null}` **or** a separate prop used in the condition at `BillsClient.tsx:1656-1657` · `ReceiptSettings.tsx:670` wrap the `<Link>` in a condition (`{x && (<Link …/>)}`) fed by `account.settings.manage` decided in `settings/page.tsx` or `receipt-settings-actions.ts:113` (e.g. `book.accountSystemId` null / a boolean) · registry rows `sales#pos-bills-accounting-link` + `settings#pos-settings-account-link` → `roles ["owner","manager"]`, `hiddenFor ["cashier"]` (walker lane owns the file today — whoever lands last applies it). |
| S5 | R10 QR sheet | green by design: `onClick = () => window.print()` | none (regression net). Walker registry row `tables#pos-tbl-qr-sheet-print` → `"oracle": "P4.3-S5"`. |
| S6 | F-P3-17/18/19 UI | `posStaffOverview ไม่คืน fromHr รายคน (settings-overview.ts:127 hr:false) · StaffSettings.tsx ไม่แสดงป้าย 'จาก HR' · settings-actions.ts ไม่มี posCommissionCatalogAction · StaffHrCards.tsx ยังอ่านแคตตาล็อกจาก registerCatalogAction · ไม่ใช้ posCommissionCatalogAction · LockScreen ไม่แสดง lock.schedule.overrideBody {minutes} · ไม่รู้ overrideTtlMin` | `StaffSettings.tsx` render the "จาก HR" tag from `fromHr` (new testid ⇒ F15.3 registry row) · `StaffHrCards.tsx:17,273,300` swap to `posCommissionCatalogAction` · `LockScreen.tsx:486/657` show `t("lock.schedule.overrideBody", { minutes: overrideTtlMin })` with the value from `listStaffForDeviceAction` (:105). |
| S7 | F-P3-21 card links | `ไม่มีตัวอ่านการ์ด ("use server" + posCardsForKeys) ที่รับกุญแจ pos-86: และ pos-refund: — pos-board-ui-actions.ts:45 รับเฉพาะ pos-anomaly: · จอ register / orders / bills ไม่อ่านการ์ดบอร์ด 86/คืนเงิน` | `src/lib/pos-board-ui-actions.ts:45` accept `pos-86:` (posBoardKeys.soldOut/soldOutPrefix, perm at the unit e.g. pos.sale.create) and `pos-refund:` (order's unit) keys — or page-level `posCardsForKeys` + `posBoardKeys.soldOut/refund` like shifts/page.tsx:74 · register tree (`components/pos/register/**` or `pos/register/**`), orders tree (`components/pos/orders/**`), bills (`pos/sales/**`) each read it and render the chip link. |
| S8 | F-P3-10 '#0' | `cardNo ?? 0 → "#0": reports/ReportsClient.tsx:255, reports/ReportsClient.tsx:259, shifts/ShiftsClient.tsx:944` | render a no-number label when `cardNo` is null (no `?? 0` / `|| 0`). |
| D1 | P2 guard level | green by design: `CASHIER print ForbiddenError · settings ForbiddenError · OWNER ok ×2` | none — net that the link targets keep refusing the cashier (CD-P43-O1). |
| D2 | P3 = B7 (CD-P43-3) | `MANAGER[A1] สร้าง unitIds [] → PERMISSION_DENIED (คาด ok — B7)` (toggle/archive measured on an OWNER [A1] rule → ok; widen [A2]/[A1,A2] → PERMISSION_DENIED; toggle of OWNER's all-units rule → refused + row unchanged — all green at the tip) | `src/lib/modules/pos/price-rule.ts:143` (savePriceRule, **create only**: map before this check): non-all-unit actor + `unitIds []` ⇒ store the actor's linked units ∩ linked POS units (`[A1]`), then `canWriteUnits` · keep `prior.unitIds []` meaning "all linked units" for the prior check (same line `:143`, and archive `:206`) so a manager cannot narrow/toggle an owner's all-units rule · OWNER/"*" unchanged (stores `[]`). Client `PriceRulesClient.tsx:46/493` unchanged. |
| D3 | P4 (CD-P43-4) | `AppSystem.updatedAt ไม่ขยับ (2026-10-23T23:32:07.705Z → 2026-10-23T23:32:07.705Z)` | `src/lib/modules/pos/chat-link.ts:79-86` add `, "updatedAt" = now()` to the raw UPDATE (as settings-general.ts:126). |
| D4 | F-P3-16 (CD-P36U-7) | `submit.creditTerms.dueDate = ไม่มี (คาด 2026-11-23) · detail.creditTerms.dueDate = ไม่มี · payload.creditTerms.dueDate = ไม่มี · publicReceipt.creditTerms.dueDate = ไม่มี` | add optional `creditTerms?: { dueDate: string; termDays: number }` (from `PosSale.creditTerms`) to `RegisterSubmitOk` (register-shared.ts:508 · filled in register.ts:2538 path), `BillDetail` (bills-shared.ts:101 · bills.ts billDetail), `ReceiptPayload` (receipt-render.ts:83 · receipt.ts receiptForSale) and `PublicReceipt` (public-receipt.ts:57). `SaleResult`/`pos-sale-contract.json` need not change; if touched, additive only (p3.4 ST2 green at tip: `--no-db` ST2 ✅). |
| D5 | F-P3-17/18/19 server | `fromHr: ผูก HR (CASHIER) = undefined · ไม่ผูก (OWNER) = undefined · posCommissionCatalogAction (ผู้ดูเงินเดือน) → MISSING · OWNER → MISSING · listStaffForDevice.overrideTtlMin = undefined (คาด 75)` | `settings-overview.ts:120-159` each `staff[i].fromHr: boolean` (true ⇔ an HR employee of the tenant has `linkedUserId = userId`) · new `posCommissionCatalogAction` in `settings-actions.ts` (contract §2) · `staff-pin.ts:588` listStaffForDevice ok result + `overrideTtlMin: posScheduleGate(settings).overrideTtlMin`. |
| D6 | F-P3-22 RPT-6 | `ไม่มี route.ts ใต้ src/app/app/sys/[id]/pos/reports/** (route พิมพ์ text/html ยังไม่มี — หน้าพิมพ์ยังเป็น PrintFrame)` | new route handler, preferred `src/app/app/sys/[id]/pos/reports/print/html/route.ts` `GET(req, {params})`, query as the print page (`kind from to unit locale`) → ANON 401 or redirect /login · no `pos.report.view` at any unit → **403** · OK → 200 `text/html` full document with in-document `print()`; body = `posReportPrintAction` HTML. |

## 2. CD-P43-O decisions (oracle writer)
- **O1 — D1 measured at guard level.** The account pages are RSC pages (`loadAccountSystem` + next-intl); they cannot be rendered in process. D1 calls `requireAccountPage(acc, "account.doc.view" | "account.settings.manage")` inside a Next request scope with each persona's real session. Green at the tip by design; the real P2 red is S2.
- **O2 — S2 fix shapes accepted.** /sales: either the page gates the `accountSystemId` prop with a flag derived from `account.doc.view`, or passes a separate prop that BillsClient uses within ~700 chars before the link testid. Settings: the `<Link>` must be the consequent of a JSX condition, and `account.settings.manage` must appear in `settings/page.tsx` or `receipt-settings-actions.ts`.
- **O3 — F-P3-17 field name `fromHr: boolean`** on every `posStaffOverview().staff[i]`; StaffSettings reads `fromHr`.
- **O4 — F-P3-18 contract:** `posCommissionCatalogAction(args: { systemId: string; unitId: string; q?: string; limit?: number })` exported from `src/lib/modules/pos/settings-actions.ts` → `{ ok: true, categories: {id,name}[], products: {id,name,categoryId,parentId}[] }`; gate = OWNER or `canViewPayroll` (same rule as `updatePosStaffCommission`); NOPERM (STAFF, no keys) refused. It must list all of the POS system's categories and products including variants (`parentId`) and products scoped to another unit (D5 checks ids of C1 · P1 · V1 · P2@A2 for a STAFF [A1] with only `hr.payroll.read`).
- **O5 — F-P3-19 surface:** top-level `overrideTtlMin: number` on the `listStaffForDevice` ok result (the data LockScreen already loads); LockScreen uses it in `overrideBody {minutes}`.
- **O6 — F-P3-16 key path:** `creditTerms.dueDate` (YYYY-MM-DD string equal to `PosSale.creditTerms.dueDate`) at: submit result top level · `billDetail().bill` · `receiptForSale().payload` · `publicReceipt().receipt` (both the printed payload and /r — CD-P36U-7 said "receipt/`/d` have no due line").
- **O7 — F-P3-21 judged statically**, accepting either a widened "use server" reader (pos-86: + pos-refund: + posCardsForKeys) imported by each screen tree, or page-level `posCardsForKeys` + `posBoardKeys.soldOut/refund` per tree.
- **O8 — RPT-6 route discovery:** any `route.ts` under `pos/reports/**` (prefers a path containing `print`); preferred location `reports/print/html/route.ts`. STAFF without `pos.report.view` must get exactly 403.
- **O9 — Tree e runs DB checks with a private POS Prisma client.** Tree e's `node_modules` is the CRM bind mount; its Prisma client lacks 8 POS models, so `src/lib/core/db.ts` boot assert throws (`[scope] ลงทะเบียน model ที่ไม่มีใน schema แล้ว: PosStaffCommission, PosOfflineSale, … PosPrintJob`). The DB run was done inside the iso unit with a **private, read-only** mount namespace: `bash scripts/iso.sh unshare -m --propagation private bash -c 'mount --bind /root/projects/shark-pos-p11/node_modules /root/projects/shark-pos-e/node_modules && mount -o remount,bind,ro … && exec bash scripts/qc4.sh env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-pos-p4.3.mts'`. The global mount was verified unchanged after the run (`findmnt` → shark-crm). Nothing was generated or installed. On trees b/d (own POS node_modules) the plain command works.
- Fixture writes outside module writers, inside the temp tenant only (precedents p3.6/p3.5/p5.2): POS settings JSON (`registerV2`, `shift.required` off, `credit {enabled, requireBuyer:false}`) · `Party` kind COMPANY · `HrEmployee.linkedUserId` (no writer exists) · `AccountSystemLink`. Journal-number sequences of the temp ACCOUNT system are dropped with `account_jno_drop` before the wipe (Z1 counts them).

## 3. Gates (this lane)
`--self-test` 10/10 · `--no-db` 11/16 (S1 S2 S6 S7 S8 red as intended) · full run 14/24 (above) · strict single-file tsc (`tsc --noEmit --strict --skipLibCheck --module nodenext --moduleResolution nodenext --target es2022 scripts/qc-pos-p4.3.mts`) exit 0 · `pos-oracle-check.sh /root/projects/shark-pos-e qc-pos-p4.3 --base dd2508d0` **VERDICT green** (red 0 · warn 0) · `qc-pos-p2.14 --no-db` 15/15 · `qc-pos-p3.4 --no-db` ST2 ✅ (ST5 red = tree e's stale CRM Prisma client in `gen-pos-api-docs --check`, environment, not this card). No eslint in the repo (lint = oracle-check).

## 4. After the product builder
Expected green: all 24. The walker lane (tree b) still owes: registry hiddenFor of the 2 account links (S2 part C) and `"oracle": "P4.3-S5"` on the QR-sheet row. Product builder must run `qc-pos-p1.6` (touches `*actions*.ts`), `qc-pos-p3.4 --no-db` (contract), `qc-pos-p5.2` (price-rule/settings scope), fitness ±env, typecheck.


---
# Oracle round 2 (R1 `pos-P4.3-scripts-review.md` = MERGEABLE-AFTER-FIXES · F7–F10 · 24 Oct 00:0xZ)
All edits are new checks or stricter judges. There are no exceptions, so no delete-probe is needed. The suite now has **28** checks: + D1b, D7, N11, N12.

## Red-before on the tip dd2508d0 (QC4 · temp tenant `posqc-p43-8920e21d` · 00:00Z)
- Full run: **16/28**. Failed: S1 S2 S6 S7 S8 D1b D2 D3 D4 D5 D6 D7. `fixture: null` (the D7 kanban board, 4 cards and 2 orders were all created). Z1 = 0 rows / Tenant 0 / User 0 / sequence 0. Z2 unchanged. Log `/tmp/p43o/run-tip-2.log`.
- `--no-db`: 13/18 (same 5 static reds).
- `--self-test`: 12/12.
- Strict single-file tsc: exit 0.

| id | change (finding) | ❌ at the tip (pasted) |
|---|---|---|
| S2 | F7. The gate must be `posAccountLinks(...).docs`, passed as `accountSystemId={links.docs ? … : null}` or as a prop that BillsClient uses at the link. The settings `<Link>` must sit under `canOpenAccountSettings &&`, and receipt-settings-actions.ts must build that value from posAccountLinks. The reviewer's fakes (`"account.doc.view".length > 0`, `true && (<Link`, a loose `"account.settings.manage"` string) are now red (N2 "หลอก" ≥ 4). | `sales/page.tsx ไม่เรียก posAccountLinks · ไม่ส่งค่า docs ของ posAccountLinks ให้ BillsClient (accountSystemId={accountSystemId}) · ReceiptSettings: <Link pos-settings-account-link> ไม่อยู่ใต้ canOpenAccountSettings && · receipt-settings-actions.ts ไม่ส่ง canOpenAccountSettings จาก posAccountLinks · ทะเบียน … hiddenFor [] ×2` |
| D1b (new) | F7 behavioural. `posAccountLinks({tenantId, systemId}, actor)` per persona: OWNER/MANAGER docs+settings true · CASHIER (pos.sale.create) false/false · BOOKKEEPER (STAFF `account.doc.create`) docs true via IMPLIES, settings false · `accountSystemId` = the linked book. Then `receiptSettingsPageDataAction` through the real session: `book.canOpenAccountSettings` is true for OWNER/MANAGER and false for CASHIER (a cashier with no book or refused also counts as false). | `posAccountLinks(OWNER/MANAGER/CASHIER/BOOKKEEPER) → MISSING · receiptSettingsPageDataAction(OWNER) book.canOpenAccountSettings = undefined (คาด true) · (MANAGER) undefined (คาด true) · (CASHIER) undefined (คาด false)` |
| S7 | F8. The reader is fixed as `posBoardCardsAction`, which must accept `pos-86:` and `pos-refund:`. Each of the register, orders and bills trees must (a) read through `posBoardCardsAction`, imported directly or via a component, and (b) render `<a\|Link data-testid=…board-card… href={….href}>`, directly or via a component. Import-only is red, and so is a constant href (N5). | `posBoardCardsAction ไม่รับกุญแจ pos-86: และ pos-refund: · จอ register/orders/bills ไม่อ่านการ์ดด้วย posBoardCardsAction · ไม่มีลิงก์การ์ด <a\|Link data-testid=…board-card… href={….href}>` (7 items) |
| D7 (new) | F8 db. Temp KANBAN board plus 4 cards via `kanban/links.createCardFromExternal`: `pos-86:<A1>…`, `pos-86:<A2>…`, `pos-refund:<order@A1>`, `pos-refund:<order@A2>` (orders are direct rows in the temp tenant, p5.2 precedent). OWNER must get all 4 (positive control). MANAGER[A1] must get both A1 cards and no A2 card. | `OWNER ไม่ได้การ์ด a1_86, a2_86, a1_ref, a2_ref (ok · ตัวควบคุมบวก) · MANAGER[A1] ไม่ได้การ์ดของ A1: a1_86, a1_ref (ok)` |
| S8 | F9. Any `?? <literal>` / `\|\| <literal>` (number or string, including `""`) on `cardNo` or an alias (`const n = c.cardNo` / `{ cardNo: n }`) in POS tsx is red. N6 covers `\|\| "0"`, `?? ""` and the alias form `n ?? 0`. | `fallback ค่าคงที่บน cardNo → "#0"/"#": reports/ReportsClient.tsx:255, reports/ReportsClient.tsx:259, shifts/ShiftsClient.tsx:944` |
| D6 | F10. Adds MANAGER[A1] `unit=A2` → exactly 403 · MANAGER[A1] `unit=A1` → 200 · OWNER `unit=A2` → 200. A 404 for the cross-unit case is red (N9). | `ไม่มี route.ts ใต้ src/app/app/sys/[id]/pos/reports/** (route พิมพ์ text/html ยังไม่มี — หน้าพิมพ์ยังเป็น PrintFrame)` |

## New decisions
- **CD-P43-O10.** One account-link decider: `posAccountLinks(ctx: { tenantId: string; systemId: string }, actor: RegisterActor): Promise<{ accountSystemId: string | null; docs: boolean; settings: boolean }>`, exported from the new file `src/lib/modules/pos/account-links.ts`.
  - `docs` = may open `/account/print` (`account.doc.view` with the account IMPLIES table).
  - `settings` = `account.settings.manage`.
  - Account rules must go through the account facade. Today `@/lib/modules/account` does not export `accountCan`, so add a facade function rather than a cross-module deep import.
  - `sales/page.tsx` must call it.
  - `receiptSettingsPageDataAction` `book` gains `canOpenAccountSettings: boolean` (= `links.settings`).
- **CD-P43-O7r** (replaces O7). The 86/refund card source is the widened `posBoardCardsAction({systemId, keys})` in `src/lib/pos-board-ui-actions.ts`.
  - Per-key unit check: `pos-86:<unitId>:…` uses the unit in the key; `pos-refund:<orderId>` uses the order's `unitId`.
  - The permission must be held at that unit, and the unit must be linked to this POS.
  - Link testids must contain `board-card`, for example `pos-reg-board-card-<productId>`, `pos-ord-board-card-<orderId>`, `pos-bills-board-card-<saleId>`. Each new testid needs an F15.3 registry row.
  - The `href` must be the card's `href` from the reader.
  - The page-level `posCardsForKeys` alternative is withdrawn.
- **D6 fix text (corrects §1 / O8):** the route checks `pos.report.view` **at the requested unit**, not "at any unit". A manager asking for another unit gets 403.

## Fix list deltas for the product builder (on top of §1)
- New `src/lib/modules/pos/account-links.ts` `posAccountLinks` (+ an account facade can-function).
- `sales/page.tsx:34,68`: `const links = await posAccountLinks(...)` and `accountSystemId={links.docs ? links.accountSystemId : null}`.
- `receipt-settings-actions.ts:80-113`: `book.canOpenAccountSettings = links.settings`.
- `ReceiptSettings.tsx:670`: `{book.canOpenAccountSettings && (<Link …pos-settings-account-link/>)}`.
- `pos-board-ui-actions.ts:32-56`: accept `pos-86:` and `pos-refund:` with the per-key unit check.
- Register, orders and bills: read via `posBoardCardsAction` and render the `board-card` link (registry rows).
- `ReportsClient.tsx:255,259` and `ShiftsClient.tsx:944`: real null branch, no literal fallback.
- Print route: unit-scoped `pos.report.view`.
- The registry rows of S2 part C are still on the product card (R1 F11; run `qc-pos-p4.1 --no-db` after editing).

## Gates (round 2)
- `--self-test` 12/12.
- `--no-db` 13/18.
- Full run 16/28.
- Strict tsc 0.
- `pos-oracle-check --base dd2508d0`: VERDICT green (red 0, warn 0).
- `qc-pos-p2.14 --no-db` 15/15.
- fitness 53/53 with the POS client.
- DB run: same private ro `unshare -m` bind of p11 node_modules (accepted for this lane by the coordinator).

---
# Oracle round 3 (R1 of product fix1 `pos-P4.3-fix1-review.md` F4 · 24 Oct 00:5xZ)
New check only, so no exception and no delete-probe. The suite now has **30** checks: + D7b, N13.

**D7b (new).** The register sends the prefix key `pos-86:<unitId>:<productId>:`, because it does not know the mark id. The oracle now tests this against real 86 marks.
- Fixture: OWNER calls `catalog.setAvailability` (available false, MANUAL) on the temp tenant. This creates real `PosAvailabilityMark` rows for product P at A1 and at A2, and for product Q at A2 only. Product R has no mark. One kanban card is created per full key `posBoardKeys.soldOut(unit, product, mark.id)`, on the D7 board.
- Reader calls and expected results:
  - MANAGER[A1] with prefixes {A1:P:, A2:P:} gets the full A1 key and not the A2 key.
  - OWNER with the same prefixes gets both full keys.
  - MANAGER and OWNER with {A1:Q:, A1:R:} get `ok` with no cards. That means no throw, and the A2 card of Q does not leak.
  - MANAGER with the full A1 key still gets the card.
- Self-test probe: N13.

**Red-before on the tip dd2508d0** (temp tenant `posqc-p43-0ca8e089`, `fixture: null`, Z1 0 / Z2 unchanged). Full run is **17/30**: the same reds as round 2, plus D7b.
`❌ [P4.3-D7b] … actual: MANAGER[A1] prefix pos-86:<A1>:<P>: ไม่ได้การ์ด A1 (ok · 0 ใบ) · OWNER prefix ได้ 0/2 ใบ (ok · ตัวควบคุมบวก) · MANAGER[A1] กุญแจเต็ม A1 → ไม่ได้การ์ด (ok)`

**Product fix1 reader** (`wip/pos-p4.3-fix1` `src/lib/pos-board-ui-actions.ts`, read only). Its grammar matches the check:
- It splits the key into `pos-86`, unit, product and mark, with no extra segments allowed.
- An empty mark means a prefix. For a prefix, the unit must be linked to this POS and the user needs `pos.sale.create` or `pos.product.manage` at that unit, and this is checked before any read.
- The reader then reads `posAvailabilityMark.findMany({tenantId, systemId, OR [{unitId, productId}]})` and returns full keys built with `posBoardKeys.soldOut`.
- A mark row exists only while the product is 86, because setAvailability deletes it when the product is back in stock.
- Expected result: D7b passes on fix1. I checked this by reading the code; it was not run, because tree f is read only.

Gates: `--self-test` 13/13 · `--no-db` 14/19 · full 17/30 · strict tsc 0 · oracle-check green.
