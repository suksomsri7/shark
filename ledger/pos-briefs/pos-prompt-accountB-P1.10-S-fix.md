# Prompt — P1.10 builder S · FIX round 1 (reviewer verdict MERGEABLE-AFTER-FIXES). Controller rulings inline.

---

You are the BUILDER S for POS work order **P1.10**, fix round 1. The reviewer (read-only Opus) returned MERGEABLE-AFTER-FIXES on `wip/pos-p1.10` @ 0bf1c6df. Apply the fixes below exactly as ruled. English reports, Thai code comments. No UI, no hardware code.

## Read first (fast)
- `ledger/pos-briefs/pos-prompt-accountB-P1.10-S.md` (your original prompt — all tree/DB/typecheck rules still apply), `ledger/pos-briefs/pos-brief-P1.10.md` §2 R5–R6, `ledger/wo-notes/pos-P1.10.md` (your notes), oracle `scripts/qc-pos-p1.10.mts` (do NOT edit; report `ORACLE-EDIT?` with the check id if a ruling below collides with a check).
- Tree `/root/projects/shark-pos-c` (own rw node_modules, QC4 `ep-frosty-lab`). `git status --short` must be clean, then `git checkout wip/pos-p1.10 && git pull --ff-only origin wip/pos-p1.10` (head 0bf1c6df). Never touch other trees, never `pkill -f`, no build/server/deploy/.env/Telegram, no migration changes (schema is frozen — no new columns).
- DB: `bash scripts/iso.sh env QC_FORCE=1 bash scripts/qc4.sh bash scripts/with-gate-lock.sh <cmd>`. Typecheck: `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh flock -w 3600 /tmp/pos-gate.lock pnpm typecheck`. Never `/tmp/shark-gate.lock`.

## Fixes (controller rulings)
F1 (MAJOR, `receipt.ts` kind/vatRateBp) — `kind = "TAX_INVOICE_ABB"` iff the linked book is VAT-registered AND `posAbbreviatedInvoice` AND `taxId` present AND **`sale.vatSatang > 0`**. Otherwise `RECEIPT`. `vatRateBp` = book rate only when `sale.vatSatang > 0`, else 0. (Oracle bills are sold under the VAT book, so P1/P5 stay green — verify.)
F2 (MAJOR, voided/refunded bills) — add payload field `status: "PAID"|"VOIDED"|"REFUNDED"` (from `PosSale.status`; any other status → `SALE_NOT_FOUND`). Renderers: when `status === "VOIDED"` stamp a bold "ยกเลิก / VOID" line (th label `voided`, en `VOID`) in the title block of both HTML and ESC/POS, same place as the "สำเนา" stamp. REFUNDED prints normally (P1.16 shows the CN separately). Add labels `voided` to `RECEIPT_LABELS.th/en`.
F3 (MAJOR, unlimited originals) — ruling: an ORIGINAL (`copy:false`) is served only while `now − sale.createdAt ≤ 30 min`. Older bills: the service silently upgrades to `copy:true` (stamp "สำเนา" + `pos.receipt.reprint` audit) — NOT a refusal. Implement in `receiptPayload` (service), so both actions inherit it. Document in the P1.10U contract section of the notes. Oracle bills are fresh (submitRegisterSale in the same run) so P6 stays green — verify.
F4 (MINOR, `refReceiptNo`) — P1.8 adds `refSaleId` (not `refReceiptNo`). Read `anySale.refSaleId` dynamically; when it is a string, look up `db.posSale.findFirst({ where: { id: refSaleId, tenantId, systemId }, select: { receiptNo: true } })` and set `refReceiptNo` from it. `fullTaxInvoiceHint` only when `docType === "SALE"` (and kind ABB). Keep the dynamic reads (the column does not exist in this tree's client yet).
F5 (MINOR) — `@page { size: 80mm auto }` is invalid. Use `@page { size: 58mm 297mm; margin: 0 }` / `80mm 297mm` plus a `@media print { body { width: … } }` rule.
F6 (MINOR, raster) — `THAI_RE` misses ฿ (U+0E3F): change to `/[ก-๛]/`. In tis620 mode ฿ → 0xDF already (verify in the table). Other non-ASCII (accented Latin/CJK/emoji) → "?" stays; add one line to the notes' follow-ups.
F8 (MINOR, `device.ts` partial printerConfig patch resets other fields) — merge the incoming object onto the stored config (`{ ...stored, ...incoming }`, shallow) BEFORE `parsePrinterConfig`, so `{paper:"58"}` keeps `drawerKick`.
F9 (MINOR, tenant-wide receipt settings) — `receipt-settings.ts` update + `receipt-settings-actions.ts`: require permission on ALL linked units of the POS system, same pattern as `posCanSetTenantPrice` (find it in `price*.ts`/`product*.ts`). Read stays as is.
F10 (MINOR, revoke gaps) — add the DEVICE_REVOKED guard to `recordCashMovement` (`shift.ts`) using the same helper as openShift (ctx.deviceId and/or input.deviceId, whichever the function has). Leave closeShift/recountShift/discardHeldCart unguarded (manager must be able to close out). `registerStatus`: add optional field `deviceStatus: "ACTIVE"|"REVOKED"|null` (null when no deviceId or unregistered) — additive, do not change existing fields. Notes: state plainly in the P1.10U contract that revoke stops honest clients only (device id is client-supplied, brief Q3) and that there is a small check-then-commit race.
F11 (MINOR) — add `REFUSAL_KEY` entries + th/en message keys for `SALE_NOT_FOUND` and `INTERNAL` of the receipt actions (`pos.receipt.errors.*`). Notes: state that `rasterSlots[].offset` is pre-splice (client splices from the last slot backwards).
F7 (points/voucher/gift-card all labelled "ส่วนลดท้ายบิล") — DEFERRED to P1.16/P1.10U; add to follow-ups only.

## Gates before "done"
typecheck 0 · `qc-pos-p1.10` forced ×2 + unforced green, no residue · `qc-pos-p1.3`, `p1.5`, `p1.6`, `p1.9`, `p1.9b` unchanged · `qc-hf-pos-page-authz` · `pnpm fitness` (with and without .env) · `scripts/fitness-pos.mts`. If F2's `status` field or F3's upgrade collides with an oracle check, stop and report `ORACLE-EDIT?` with the check id + the exact assertion.

## Done =
- Commits on `wip/pos-p1.10` (one per fix group is fine), typecheck before each push, last push done.
- `ledger/wo-notes/pos-P1.10.md`: new section "Fix round 1" — per-fix one line + the gate lines with exit codes, contract additions for P1.10U (`status`, 30-min original rule, `deviceStatus`, raster offsets note, revoke limitation).
- Report ≤20 lines with the head SHA. Do not merge, do not touch `session/pos` or `main`.
