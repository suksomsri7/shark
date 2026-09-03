"use server";

// ─────────────────────────────────────────────────────────────
// import-actions.ts — server actions ของตัวช่วยนำเข้า CSV (WO 1.8, DESIGN-SPEC-V2.md §8.5)
// 🔴 ไฟล์นี้ **ไม่ import prisma** โดยเจตนา — ทุกการแตะ DB ผ่าน service/product/expense (fitness F5)
//
// กติกาความปลอดภัยเหมือน editor-actions.ts ทุกประการ:
//   1) loadAccountSystem(systemId) ผูก tenant
//   2) assertAccountCan(auth, "account.import") ก่อนแตะข้อมูลใด ๆ
//   3) ตัวเลข/ค่าที่สร้างจริงคำนวณ/ตรวจใหม่ฝั่ง server เสมอ — ไม่เชื่อ mapping/preview ที่ client ส่งมา
//   4) idempotent ต่อไฟล์: refType="CSV_IMPORT" · refId=`${fileHash}:${rowKey}` (เอกสาร) —
//      ผู้ติดต่อ/สินค้าอาศัยกุญแจธรรมชาติ (เลขภาษี+สาขา / เบอร์ / SKU) กันซ้ำอยู่แล้ว
// ─────────────────────────────────────────────────────────────

import type { AccountContactKind, AccountProductType, AccountDocType } from "@prisma/client";
import { loadAccountSystem } from "./guard";
import { assertAccountCan, writeAudit } from "./access";
import {
  getSettings,
  createDocument,
  createContact,
  findContactForImport,
  findContactDuplicates,
  findExistingImportRefIds,
  normalizeTaxId,
  normalizePhoneTh,
} from "./service";
import { createExpenseDoc } from "./expense";
import { createProduct, listUnits } from "./product";
import { packDescription } from "@/components/account-v2/doc-editor-types";
import {
  IMPORT_FIELDS,
  IMPORT_MAX_ROWS,
  IMPORT_MAX_FILE_BYTES,
  IMPORT_PREVIEW_ROWS,
  type ImportKind,
  type ColumnMapping,
  parseImportCsv,
  autoMatchColumns,
  applyMapping,
  validateDocRowFormat,
  validateContactRowFormat,
  validateProductRowFormat,
  resolveDocType,
  bahtToSatang,
  toQty,
  toVatRateBp,
  groupDocRows,
  fileHashOf,
  type RowStatus,
} from "./import-shared";

// ─────────────────── ผลลัพธ์ที่ client เห็น ───────────────────
export type PreviewRow = { row: number; status: RowStatus; reasons: string[]; summary: string };
export type PreviewResult = {
  ok: true;
  headers: string[];
  mapping: ColumnMapping;
  totalRows: number;
  counts: { ok: number; warn: number; err: number };
  previewRows: PreviewRow[]; // 20 แถวแรก
  fileHash: string;
} | { ok: false; reason: string };

export type ImportRunResult =
  | { ok: true; created: number; skipped: number; errors: { row: number; reason: string }[]; tag: string }
  | { ok: false; reason: string };

const bkkDate = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(d);

function sideOfKind(kind: ImportKind): "revenue" | "expense" {
  return kind === "documents_expense" ? "expense" : "revenue";
}

function checkFile(csvText: string): string | null {
  if (Buffer.byteLength(csvText, "utf8") > IMPORT_MAX_FILE_BYTES) return "ไฟล์ใหญ่เกิน 5MB";
  return null;
}

/** แถวข้อมูลตัดเหลือ IMPORT_MAX_ROWS แถวแรก (เกิน = เตือนในผลลัพธ์แต่ไม่ทำให้ล้ม) */
function capRows<T>(rows: T[]): { rows: T[]; truncated: boolean } {
  if (rows.length <= IMPORT_MAX_ROWS) return { rows, truncated: false };
  return { rows: rows.slice(0, IMPORT_MAX_ROWS), truncated: true };
}

// ─────────────────────────────────────────────────────────────
// ขั้น ②③ — จับคู่คอลัมน์ + preview (ตรวจทุกแถวจริง แต่ส่งรายละเอียดกลับแค่ 20 แถวแรกตาม SPEC §8.5)
//
// 🔵 แยก action (ผูก request/cookie ผ่าน loadAccountSystem) ออกจาก core (รับ tenantId/systemId ตรง ๆ)
//    ให้เหมือน service.ts/expense.ts/product.ts — QC script (scripts/qc-acc-v2-import.mts) เรียก core
//    ตรงได้โดยไม่ต้องมี Next.js request context (requireTenant อ่านคุกกี้ผ่าน next/headers ใช้นอก request ไม่ได้)
// ─────────────────────────────────────────────────────────────
export async function previewImportAction(
  systemId: string,
  kindRaw: string,
  csvText: string,
  mappingOverride?: ColumnMapping,
): Promise<PreviewResult> {
  try {
    const { auth, tenantId } = await loadAccountSystem(systemId);
    assertAccountCan(auth, "account.import");
    return await previewImportCore(tenantId, systemId, kindRaw, csvText, mappingOverride);
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "อ่านไฟล์ไม่สำเร็จ" };
  }
}

export async function previewImportCore(
  tenantId: string,
  systemId: string,
  kindRaw: string,
  csvText: string,
  mappingOverride?: ColumnMapping,
): Promise<PreviewResult> {
  const kind = kindRaw as ImportKind;
  if (!IMPORT_FIELDS[kind]) return { ok: false, reason: "ชนิดการนำเข้าไม่ถูกต้อง" };
  try {
    const sizeErr = checkFile(csvText);
    if (sizeErr) return { ok: false, reason: sizeErr };

    const table = parseImportCsv(csvText);
    if (table.headers.length === 0) return { ok: false, reason: "ไม่พบข้อมูลในไฟล์ (บรรทัดแรกต้องเป็นหัวคอลัมน์)" };

    const { rows: cappedTableRows } = capRows(table.rows);
    const mapping = mappingOverride ?? autoMatchColumns(table.headers, kind);
    const mapped = applyMapping({ headers: table.headers, rows: cappedTableRows }, kind, mapping);

    const settings = await getSettings(tenantId, systemId);
    const units = kind === "products" ? await listUnits(tenantId, systemId) : [];
    const unitNames = new Set(units.map((u) => u.name.trim().toLowerCase()));

    const rowChecks: { status: RowStatus; reasons: string[] }[] = [];

    if (kind === "documents_revenue" || kind === "documents_expense") {
      const side = sideOfKind(kind);
      // ตรวจรูปแบบก่อน (บริสุทธิ์)
      const formatChecks = mapped.map((r) => validateDocRowFormat(side, r));
      // ผู้ติดต่อไม่พบ → เตือน (จะสร้างใหม่ตอนนำเข้าจริง) — dedupe เป็นคู่ชื่อ+เลขภาษีก่อนยิง query (กัน 2000 query ต่อไฟล์)
      const contactKeyOf = (r: Record<string, string>) => `${r.contactName.trim().toLowerCase()}|${normalizeTaxId(r.contactTaxId)}`;
      const uniqueContacts = new Map<string, { name: string; taxId: string }>();
      for (const r of mapped) {
        const name = r.contactName.trim();
        if (!name) continue;
        uniqueContacts.set(contactKeyOf(r), { name, taxId: normalizeTaxId(r.contactTaxId) });
      }
      const foundKeys = new Set<string>();
      await Promise.all(
        [...uniqueContacts.entries()].map(async ([key, v]) => {
          const found = await findContactForImport(tenantId, systemId, { name: v.name, taxId: v.taxId || null });
          if (found) foundKeys.add(key);
        }),
      );
      mapped.forEach((r, i) => {
        const fc = formatChecks[i];
        const reasons = [...fc.reasons];
        let status = fc.status;
        if (fc.status !== "err" && r.contactName.trim() && !foundKeys.has(contactKeyOf(r))) {
          reasons.push("ผู้ติดต่อไม่พบ (จะสร้างใหม่)");
          if (status === "ok") status = "warn";
        }
        rowChecks.push({ status, reasons });
      });
    } else if (kind === "contacts") {
      const formatChecks = mapped.map((r) => validateContactRowFormat(r));
      const keys = mapped.map((r) => ({
        taxId: normalizeTaxId(r.taxId) || undefined,
        phoneNorm: normalizePhoneTh(r.phone) || undefined,
      }));
      const dup = await findContactDuplicates(tenantId, systemId, keys);
      const seenTax = new Set<string>();
      const seenPhone = new Set<string>();
      mapped.forEach((r, i) => {
        const fc = formatChecks[i];
        const reasons = [...fc.reasons];
        let status = fc.status;
        const tax = normalizeTaxId(r.taxId);
        const phone = normalizePhoneTh(r.phone);
        if (fc.status !== "err") {
          if (tax.length === 13 && (dup.taxIds.has(tax) || seenTax.has(tax))) {
            reasons.push("เลขภาษีซ้ำ");
            status = "err";
          } else if (!tax && phone && (dup.phones.has(phone) || seenPhone.has(phone))) {
            // เบอร์ซ้ำใช้ตัดสินได้เฉพาะแถวที่ไม่มีเลขภาษี (เลขภาษีเป็นกุญแจแม่นกว่า)
            reasons.push("เบอร์โทรซ้ำกับที่มีอยู่ (จะข้าม)");
            status = status === "err" ? status : "warn";
          }
        }
        if (tax) seenTax.add(tax);
        if (phone) seenPhone.add(phone);
        rowChecks.push({ status, reasons });
      });
    } else {
      // products
      const formatChecks = mapped.map((r) => validateProductRowFormat(r));
      const seenSku = new Set<string>();
      mapped.forEach((r, i) => {
        const fc = formatChecks[i];
        const reasons = [...fc.reasons];
        let status = fc.status;
        const sku = r.sku.trim();
        const unit = r.unit.trim();
        if (fc.status !== "err") {
          if (unit && !unitNames.has(unit.toLowerCase())) {
            reasons.push("หน่วยไม่รู้จัก (จะบันทึกแบบไม่ระบุหน่วย)");
            if (status === "ok") status = "warn";
          }
          if (sku && seenSku.has(sku.toLowerCase())) {
            reasons.push("รหัสสินค้า (SKU) ซ้ำในไฟล์เดียวกัน");
            status = "err";
          }
        }
        if (sku) seenSku.add(sku.toLowerCase());
        rowChecks.push({ status, reasons });
      });
    }

    const counts = { ok: 0, warn: 0, err: 0 };
    for (const c of rowChecks) counts[c.status]++;

    const previewRows: PreviewRow[] = rowChecks.slice(0, IMPORT_PREVIEW_ROWS).map((c, i) => ({
      row: i + 1,
      status: c.status,
      reasons: c.reasons,
      summary: mapped[i] ? Object.values(mapped[i]).filter(Boolean).slice(0, 3).join(" · ") : "",
    }));

    return {
      ok: true,
      headers: table.headers,
      mapping,
      totalRows: cappedTableRows.length,
      counts,
      previewRows,
      fileHash: fileHashOf(csvText),
    };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "อ่านไฟล์ไม่สำเร็จ" };
  }
}

// ─────────────────────────────────────────────────────────────
// ขั้น ④ — นำเข้าจริง (ตรวจซ้ำทั้งหมดฝั่ง server — ไม่เชื่อ preview ที่ client แคชไว้)
// ─────────────────────────────────────────────────────────────
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function runImportAction(
  systemId: string,
  kindRaw: string,
  csvText: string,
  mapping: ColumnMapping,
  skipErrorRows: boolean,
): Promise<ImportRunResult> {
  try {
    const { auth, tenantId, userId } = await loadAccountSystem(systemId);
    assertAccountCan(auth, "account.import");
    return await runImportCore(tenantId, systemId, userId, kindRaw, csvText, mapping, skipErrorRows);
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "นำเข้าไม่สำเร็จ" };
  }
}

export async function runImportCore(
  tenantId: string,
  systemId: string,
  userId: string | null,
  kindRaw: string,
  csvText: string,
  mapping: ColumnMapping,
  skipErrorRows: boolean,
): Promise<ImportRunResult> {
  const kind = kindRaw as ImportKind;
  if (!IMPORT_FIELDS[kind]) return { ok: false, reason: "ชนิดการนำเข้าไม่ถูกต้อง" };
  try {
    const sizeErr = checkFile(csvText);
    if (sizeErr) return { ok: false, reason: sizeErr };

    const table = parseImportCsv(csvText);
    if (table.headers.length === 0) return { ok: false, reason: "ไม่พบข้อมูลในไฟล์" };
    const { rows: cappedTableRows } = capRows(table.rows);
    const mapped = applyMapping({ headers: table.headers, rows: cappedTableRows }, kind, mapping);
    const fileHash = fileHashOf(csvText);
    const tag = `นำเข้า ${bkkDate(new Date())}`;
    const settings = await getSettings(tenantId, systemId);

    let created = 0;
    let skipped = 0;
    const errors: { row: number; reason: string }[] = [];

    if (kind === "documents_revenue" || kind === "documents_expense") {
      const side = sideOfKind(kind);
      const groups = groupDocRows(mapped);
      // ประเมินสถานะทั้งหมดก่อน (แบบเดียวกับ preview) — กัน mapping ที่ client ส่งมาไม่ตรงพรีวิวจริง
      const rowStatuses = mapped.map((r) => validateDocRowFormat(side, r));

      // idempotency: กันไฟล์เดิมอัปโหลดซ้ำ
      const refKeys = groups.map((g) => `${fileHash}:${g.key}`);
      const already = await findExistingImportRefIds(tenantId, systemId, refKeys);

      const contactCache = new Map<string, string>(); // "name|taxId" → contactId (กันสร้างซ้ำภายในไฟล์เดียวกัน)

      for (const batch of chunk(groups, 100)) {
        for (const g of batch) {
          const refId = `${fileHash}:${g.key}`;
          if (already.has(refId)) {
            skipped++;
            continue;
          }
          const groupRows = g.rowIndexes.map((i) => ({ i, r: mapped[i], status: rowStatuses[i] }));
          const hasErr = groupRows.some((x) => x.status.status === "err");
          if (hasErr) {
            for (const x of groupRows) {
              if (x.status.status === "err") errors.push({ row: x.i + 1, reason: x.status.reasons.join(" · ") });
            }
            if (!skipErrorRows) continue; // ไม่ข้าม → ไม่สร้างเอกสารกลุ่มนี้เลย (แถวยังนับใน errors ไว้ให้ผู้ใช้แก้)
            skipped++;
            continue;
          }

          const first = groupRows[0].r;
          const contactName = first.contactName.trim();
          const rawTaxId = normalizeTaxId(first.contactTaxId);
          const contactTaxId = /^\d{13}$/.test(rawTaxId) ? rawTaxId : ""; // เลขไม่ครบ 13 หลัก → ไม่ใช้จับคู่/สร้าง (กัน createContact throw)
          const cacheKey = `${contactName.toLowerCase()}|${contactTaxId}`;
          let contactId = contactCache.get(cacheKey) ?? null;
          if (!contactId) {
            const found = await findContactForImport(tenantId, systemId, { name: contactName, taxId: contactTaxId });
            if (found) {
              contactId = found.id;
            } else {
              try {
                const c = await createContact({
                  tenantId,
                  systemId,
                  kind: (side === "revenue" ? "CUSTOMER" : "VENDOR") as AccountContactKind,
                  name: contactName,
                  taxId: contactTaxId || null,
                });
                contactId = c.id;
              } catch {
                // แข่งกับแถวอื่น/ไฟล์อื่นสร้างเลขภาษีเดียวกันไปก่อนแล้ว — ใช้รายที่มีอยู่แทนล้มทั้งกลุ่ม
                const retry = await findContactForImport(tenantId, systemId, { name: contactName, taxId: contactTaxId });
                if (!retry) throw new Error(`สร้างผู้ติดต่อ "${contactName}" ไม่สำเร็จ`);
                contactId = retry.id;
              }
            }
            contactCache.set(cacheKey, contactId);
          }

          const dt = resolveDocType(side, first.docType);
          const lines = groupRows.map(({ r }) => ({
            description: packDescription(r.itemName.trim(), ""),
            qty: toQty(r.qty, 1),
            unitName: r.unit.trim() || null,
            unitPrice: bahtToSatang(r.unitPrice),
            discount: bahtToSatang(r.discount, 0),
            vatRateBp: toVatRateBp(r.vatRate, settings.vatRateBp),
          }));
          const issueDate = new Date(`${first.date.trim()}T00:00:00.000Z`);
          const note = first.note.trim() || null;
          const docType = dt.docType as AccountDocType;

          if (side === "revenue") {
            await createDocument({
              tenantId,
              systemId,
              docType,
              contactId,
              issueDate,
              note,
              lines,
              createdById: userId,
              source: "IMPORT",
              tags: [tag],
              refType: "CSV_IMPORT",
              refId,
            });
          } else {
            await createExpenseDoc({
              tenantId,
              systemId,
              docType,
              contactId,
              issueDate,
              note,
              lines,
              createdById: userId,
              source: "IMPORT",
              tags: [tag],
              refType: "CSV_IMPORT",
              refId,
            });
          }
          created++;
        }
      }
    } else if (kind === "contacts") {
      const rowStatuses = mapped.map((r) => validateContactRowFormat(r));
      const keys = mapped.map((r) => ({
        taxId: normalizeTaxId(r.taxId) || undefined,
        phoneNorm: normalizePhoneTh(r.phone) || undefined,
      }));
      const dup = await findContactDuplicates(tenantId, systemId, keys);
      const seenTax = new Set<string>();
      const seenPhone = new Set<string>();

      for (const batch of chunk(mapped.map((r, i) => ({ r, i })), 100)) {
        for (const { r, i } of batch) {
          const fc = rowStatuses[i];
          if (fc.status === "err") {
            errors.push({ row: i + 1, reason: fc.reasons.join(" · ") });
            if (!skipErrorRows) continue;
            skipped++;
            continue;
          }
          const tax = normalizeTaxId(r.taxId);
          const phone = normalizePhoneTh(r.phone);
          const taxDup = tax.length === 13 && (dup.taxIds.has(tax) || seenTax.has(tax));
          // เบอร์ซ้ำข้ามได้เฉพาะแถวที่ไม่มีเลขภาษี (เลขภาษีเป็นกุญแจแม่นกว่า — สองรายชื่อใช้เบอร์บริษัทเดียวกันได้จริง)
          const phoneDup = !tax && !!phone && (dup.phones.has(phone) || seenPhone.has(phone));
          if (taxDup || phoneDup) {
            skipped++;
            if (tax) seenTax.add(tax);
            if (phone) seenPhone.add(phone);
            continue;
          }
          if (tax) seenTax.add(tax);
          if (phone) seenPhone.add(phone);
          const kindWord = r.kind.trim();
          const contactKind: AccountContactKind =
            kindWord.includes("ขาย") || kindWord.toUpperCase().startsWith("V") ? "VENDOR" : "CUSTOMER";
          try {
            await createContact({
              tenantId,
              systemId,
              kind: contactKind,
              name: r.name.trim(),
              taxId: /^\d{13}$/.test(tax) ? tax : null, // เลขไม่ครบ 13 หลัก → บันทึกแบบไม่มีเลขภาษี (ตาม warn ในขั้นพรีวิว) แทนที่จะโยน error
              branchCode: r.branchCode.trim() || "00000",
              phone: r.phone.trim() || null,
              email: r.email.trim() || null,
              address: r.address.trim() || null,
              creditTermDays: Math.max(0, Math.round(toQty(r.creditTermDays, 0))),
            });
            created++;
          } catch {
            skipped++; // race กับแถวอื่น/เลขภาษีซ้ำที่ DB จับได้ตอน insert จริง
          }
        }
      }
    } else {
      // products
      const rowStatuses = mapped.map((r) => validateProductRowFormat(r));
      const seenSku = new Set<string>();
      const unitList = await listUnits(tenantId, systemId);
      for (const batch of chunk(mapped.map((r, i) => ({ r, i })), 100)) {
        for (const { r, i } of batch) {
          const fc = rowStatuses[i];
          if (fc.status === "err") {
            errors.push({ row: i + 1, reason: fc.reasons.join(" · ") });
            if (!skipErrorRows) continue;
            skipped++;
            continue;
          }
          const sku = r.sku.trim();
          if (sku && seenSku.has(sku.toLowerCase())) {
            skipped++;
            continue;
          }
          if (sku) seenSku.add(sku.toLowerCase());
          const typeWord = r.type.trim();
          const type: AccountProductType = typeWord.includes("บริการ") ? "SERVICE" : "GOODS";
          const unit = r.unit.trim();
          const unitId = unit ? units_findId(unitList, unit) : null;
          const res = await createProduct(tenantId, systemId, {
            name: r.name.trim(),
            sku: sku || undefined,
            type,
            unitId: unitId ?? undefined,
            salePrice: r.salePrice.trim() ? bahtToSatang(r.salePrice) : undefined,
            buyPrice: r.buyPrice.trim() ? bahtToSatang(r.buyPrice) : undefined,
            vatRateBp: toVatRateBp(r.vatRate, settings.vatRateBp),
          });
          if (res.ok) created++;
          else skipped++;
        }
      }
    }

    await writeAudit({
      tenantId,
      actorId: userId,
      action: "account.import",
      targetType: "AccountImport",
      targetId: fileHash,
      after: { kind, created, skipped, errors: errors.length, tag },
    });

    return { ok: true, created, skipped, errors, tag };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "นำเข้าไม่สำเร็จ" };
  }
}

function units_findId(units: { id: string; name: string }[], name: string): string | null {
  const n = name.trim().toLowerCase();
  return units.find((u) => u.name.trim().toLowerCase() === n)?.id ?? null;
}
