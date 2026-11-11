# Prompt — P1.13 builder S (buyer snapshot · full tax invoice via account facade · later issue / from request · DBD facade · buyer profile · migration). Controller: oracle 0a049f30 merged into session/pos; lane 4, tree d.

---

You are the BUILDER S for POS work order **P1.13**. Server only — no pages (P1.13U later). English reports, Thai code comments.

## Read first
- `ledger/pos-briefs/pos-brief-COMMON.md`, `pos-brief-LANE-RULES.md`, **`pos-brief-P1.13.md`** (R1–R9, §3 migration, CD1–CD6 binding).
- Oracle `scripts/qc-pos-p1.13.mts` (30 checks) + `ledger/wo-notes/pos-P1.13-oracle.md` (names table — use every name exactly; drift list; the 15 CONTROLLER-DECISION items are ruled below). Do NOT edit the oracle except the one approved ORACLE-EDIT in ruling 15. Report `ORACLE-EDIT?` with the id if a check is impossible as written.
- Existing: `receipt-tax-request.ts` (P1.11), `account-bridge.ts`, `src/lib/modules/account/index.ts` (`applyExternalSale`, `applyExternalRefund`, `findExternalSaleDoc`, contact resolver), `account/dbd.ts`, `public-receipt.ts`, `receipt.ts`/`receipt-render.ts`, `refund.ts`, `register.ts`, `core/scope.ts`, `scripts/pos-qc-env.mts`.
- AGENTS.md → Next docs before Next code. Memory rules: `"use server"` files export only async functions; `receipt-render.ts` stays prisma-free; `scripts/*.mts` typechecked by `next build`.

## Controller rulings on CONTROLLER-DECISION 1–15 (binding)
1. Contact: call the account contact resolver with `taxId` + `branchCode` (+ name/address) and **no partyId**; add the additive `address` field to the resolver input; taxId match wins.
2. `findExternalSaleDoc` prefers the live `TAX_INVOICE` (status not CANCELLED) over the ABB; the full invoice carries `refType "PosSale"` + `refId = saleId` like the ABB.
3. Numbering: `nextDocNo(…, "TAX_INVOICE", paidAt)` (prefix TX); rely on the existing unique index for double-issue protection.
4. Superseded ABB: status **CANCELLED** + `supersededByDocId` (brief CD1); set through a dedicated facade path `supersedeAbbWithTaxInvoice` that touches **no GL** (do not call the generic void path).
5. Repeat issue: same sale + same buyer (deep-equal after parse) ⇒ `{ok:true, docId}` of the existing doc (idempotent); different buyer ⇒ `ALREADY_ISSUED`.
6. Every tax-id problem (format or checksum) ⇒ `TAX_ID_INVALID`.
7. Buyer from a P1.11 request: `kind` = taxId starts with `0` ⇒ JURISTIC else PERSON; `source: "MANUAL"`.
8. Use the existing `PosTaxInvoiceRequest.accountDocId` for the issued doc (no `issuedDocId` column). Migration therefore = `PosSale.taxInvoice`, `PosSale.taxInvoiceDocId`, `PosBuyerProfile`, `AccountDocument.supersededByDocId` only.
9. `rememberBuyer` is a top-level input key on submit/issue.
10. DBD mapping: `DBD_REASON.noKey` ⇒ `DBD_NOT_CONFIGURED`; `badTaxId` ⇒ `TAX_ID_INVALID`; not found ⇒ `{ok:true, found:false}`; everything else ⇒ `DBD_UNAVAILABLE`. Audit every call with the masked id.
11. DBD lookup permission = `pos.sale.create` at the unit; limit 30/min counted per unit.
12. Emit `pos.sale.taxInvoiceIssued` on every **first** issue (pay-time consumer path and later issue), never on the idempotent repeat.
13. New `taxInvoiceRefusalKey(code)` → keys under `pos.taxInvoice.errors`; register `refusalMessageKey` untouched except the submit-time `TAX_ID_INVALID`.
14. `buyerProfileForMember` has no actor; its action wrapper checks `pos.sale.create` + tenant/unit scope.
15. Issue after a refund (partial or full) ⇒ refuse `HAS_REFUNDS` (Thai practice: full invoice before any credit note). **ORACLE-EDIT approved**: add check `L6` (partial refund then issue ⇒ `HAS_REFUNDS`) in a separate `test(pos P1.13): ORACLE-EDIT L6` commit; update the notes count 30→31.

## Tree
`/root/projects/shark-pos-d` (own rw node_modules; `.env.qc`/`.env.qc4` = QC4 `ep-frosty-lab`, neondb_owner — print only the hostname). `git -C /root/projects/shark-pos-d status --short` must be clean; `git -C /root/projects/shark-pos-d fetch origin session/pos && git -C /root/projects/shark-pos-d checkout -B wip/pos-p1.13 origin/session/pos && pnpm exec prisma generate`. Never touch other trees/processes, never `pkill -f`, no build/server/deploy/.env/Telegram, never the real DBD network (stub via `deps.lookup`). DB commands: `bash scripts/iso.sh env QC_FORCE=1 bash scripts/qc4.sh env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh pnpm exec tsx scripts/<suite>.mts`. Typecheck: `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh flock -w 3600 /tmp/pos-gate.lock pnpm typecheck`.

## Migration (QC4 only, additive)
Schema per ruling 8 (+ `@@index([tenantId, taxId])` on `PosBuyerProfile`); migration folder `<timestamp>_pos_p113_tax_invoice/migration.sql` from a schema-to-schema diff (copy of the pre-change schema dir), read it (ADD COLUMN nullable / CREATE TABLE / CREATE INDEX only), `migrate deploy` through the wrappers, `prisma generate`. Register in `scope.ts` + `pos-qc-env.mts`. Record the account-schema touch in `ledger/POS-OWNER-PENDING.md` (one line). ⛔ Never `migrate dev/reset/resolve`, `db push`.

## Build order (commit + push `wip/pos-p1.13` after each step; typecheck before each push)
1. `tax-invoice-shared.ts` (pure: `parseTaxInvoiceBuyer`, checksum, types, codes) + migration + registrations.
2. Pay-time: `submitRegisterSale` input `taxInvoice` + `rememberBuyer` (additive), snapshot in `createSale` tx (`service.ts` smallest hunk), consumer path: `account-bridge.ts` passes `buyer` → `applyExternalSale` creates `TAX_INVOICE` with the contact (rulings 1–3), sets `taxInvoiceDocId`, emits the event (ruling 12); no-op consumer + label.
3. `tax-invoice.ts`: `issueFullTaxInvoice` (R3 + rulings 4/5/15), `issueFromTaxInvoiceRequest`, `rejectTaxInvoiceRequest` (R4), facade `supersedeAbbWithTaxInvoice` in `account/index.ts` (+ `findExternalSaleDoc` preference, ruling 2); permission key `pos.taxinvoice.issue`; audits.
4. DBD facade `lookupBuyerByTaxId` (R5, rulings 10/11) + buyer profile (R6, rulings 9/14) + actions `tax-invoice-actions.ts` + messages th/en + `taxInvoiceRefusalKey`.
5. Readers (R7/R8): `publicReceipt` ISSUED, `receiptPayload` full-invoice marker + renderer text, `BillDetail.taxInvoice`, `applyExternalRefund`/`findExternalSaleDoc` preference. Notes with the P1.13U contract.

After each step: typecheck; `qc-pos-p1.13` forced. Before "done": `qc-pos-p1.13` forced ×2 + unforced (31/31, residue 0) · `qc-pos-p1.11` 38 · `qc-pos-p1.8` 49 · `qc-pos-p1.16` 28 · `qc-pos-p1.3` 128 · `qc-pos-p1.6` 48 · `qc-pos-p1.7` 31 · `qc-pos-p1.10` 40 · COMMON §7 money set (`qc-pos-account`, `qc-account-cpa`, `qc-restaurant-money`, `qc-shop-refund`, `qc-hotel-money`, `qc-ticket-money`, `qc-subscription-money`) identical to before · `qc-hf-pos-page-authz` · `pnpm fitness` with/without env · `scripts/fitness-pos.mts` · typecheck 0.

## Done =
`ledger/wo-notes/pos-P1.13.md` (migration SQL summary, per-step results, P1.13U contract: actions, shapes, codes, settings; follow-ups) · last push of `wip/pos-p1.13`; report ≤25 lines with head SHA. Do not merge, do not touch `session/pos` or `main`.
