// seller-snapshot.ts — ACC T2.9 · ตรึงข้อมูลผู้ขาย + ข้อความท้ายใบ ณ วันออกเอกสาร (checklist K4 · skill domain-accounting-books.md §ก2 [V] ข้อ 12
//   "เอกสารออกให้คนนอกเก็บสำเนา ≥1 ฉบับ" — สำเนาที่เก็บต้องเป็นเนื้อหาเดียวกับที่ออกไป ไม่ใช่ค่าตั้งวันนี้)
//
// เก็บที่ AccountDocument.sellerSnapshot (JSON · null = ยังไม่ตรึง) · ไม่มีระบบเรนเดอร์ PDF ฝั่งเซิร์ฟเวอร์ ⇒ เก็บ "ข้อมูลที่ใช้พิมพ์" แทนไฟล์ PDF
//   ตรึงเมื่อ: ① ออกเอกสารทางหลัก (issueDocumentInTx) ② ก่อนบันทึกค่าตั้งกิจการ/ค่าตั้งเอกสารทุกครั้ง — ทุกใบที่ออกแล้วแต่ยังไม่ตรึง
//   (ใบอัตโนมัติ/ใบจากระบบอื่น) ถูกตรึงด้วยค่า "ก่อนแก้" ⇒ ไม่มีช่องที่ค่าตั้งใหม่ไปทับใบเก่า · ใบเก่าก่อนมีงานนี้ = ตรึงครั้งแรกที่แก้ค่าตั้ง (lazy · ไม่ทำลายอะไร)
//   อ่าน: หน้าพิมพ์ (print-view) · หน้ารายละเอียด (doc-detail) · REST — ไม่มี snapshot = ค่าตั้งปัจจุบัน
import { Prisma } from "@prisma/client";
import { parseDocSettings, type DocSettings } from "./settings-schema";

export type SellerBlock = {
  name: string;
  address: string | null;
  taxId: string | null;
  branchCode: string | null;
  branchName: string | null;
  /** ป้ายสาขาที่พิมพ์ ("สำนักงานใหญ่" / "สาขา 00001" / ชื่อสาขา) */
  branch: string;
  phone: string | null;
  logoUrl: string | null;
};

export type SellerSnapshot = {
  v: 1;
  frozenAt: string;
  /** ISSUE = ตอนออก · SETTINGS_CHANGE = ตรึงด้วยค่าเดิมก่อนแก้ค่าตั้ง */
  via: "ISSUE" | "SETTINGS_CHANGE";
  seller: SellerBlock;
  /** ข้อความท้ายใบของชนิดนี้ ณ วันออก */
  text: { footerNote: string; paymentTerms: string; legalText: string };
};

export type SnapshotSettings = {
  orgPrefix?: string | null;
  orgName?: string | null;
  address?: string | null;
  taxId?: string | null;
  branchCode?: string | null;
  branchName?: string | null;
  phone?: string | null;
  logoUrl?: string | null;
  footerNote?: string | null;
  doc: DocSettings;
};

export function sellerBlockOf(s: SnapshotSettings): SellerBlock {
  const name = [s.orgPrefix?.trim(), s.orgName?.trim()].filter(Boolean).join(" ") || "กิจการของคุณ";
  const branch = s.branchName || (s.branchCode === "00000" ? "สำนักงานใหญ่" : s.branchCode ? `สาขา ${s.branchCode}` : "");
  return {
    name,
    address: s.address ?? null,
    taxId: s.taxId ?? null,
    branchCode: s.branchCode ?? null,
    branchName: s.branchName ?? null,
    branch,
    phone: s.phone ?? null,
    logoUrl: s.logoUrl ?? null,
  };
}

/** ข้อความท้ายใบของชนิดนี้ (กติกาเดียวกับ buildPrintOptions — ไม่ import ข้ามเพื่อเลี่ยงวง import ของ service) */
function textOf(s: SnapshotSettings, docType: string): SellerSnapshot["text"] {
  const note = s.doc.notes[docType];
  return {
    footerNote: (note?.footer ?? "").trim() || (s.footerNote ?? "").trim(),
    paymentTerms: (note?.terms ?? "").trim(),
    legalText: docType === "TAX_INVOICE" ? s.doc.autoTaxInvoice.legalText : "",
  };
}

export function sellerSnapshotOf(s: SnapshotSettings, docType: string, via: SellerSnapshot["via"], at: Date = new Date()): SellerSnapshot {
  return { v: 1, frozenAt: at.toISOString(), via, seller: sellerBlockOf(s), text: textOf(s, docType) };
}

/** JSON ของคอลัมน์ → snapshot (รูปไม่ตรง = null ⇒ ผู้อ่านใช้ค่าตั้งปัจจุบัน) */
export function readSellerSnapshot(raw: unknown): SellerSnapshot | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Partial<SellerSnapshot>;
  if (r.v !== 1 || !r.seller || typeof r.seller !== "object" || typeof r.seller.name !== "string") return null;
  return r as SellerSnapshot;
}

/** สถานะที่ "ออกไปแล้ว" (ร่าง/ยกเลิกร่างไม่ต้องตรึง) */
const ISSUED_NOT = ["DRAFT", "CANCELLED"] as const;

/**
 * ตรึงทุกใบที่ออกแล้วแต่ยังไม่มี snapshot ด้วยค่าตั้ง "ปัจจุบัน" (เรียกก่อนเขียนค่าตั้งใหม่) — 1 คำสั่งต่อชนิดเอกสาร
 *   db = prisma หรือ tx ของผู้เรียก · คืนจำนวนใบที่ตรึง
 */
export async function freezeUnsnappedDocs(db: Prisma.TransactionClient, systemId: string, current: SnapshotSettings): Promise<number> {
  const groups = await db.accountDocument.groupBy({
    by: ["docType"],
    where: { systemId, sellerSnapshot: { equals: Prisma.DbNull }, status: { notIn: [...ISSUED_NOT] }, docNo: { not: null } },
    _count: { _all: true },
  });
  let n = 0;
  const at = new Date();
  // raw UPDATE: ไม่แตะ updatedAt (การตรึงไม่ใช่ "การแก้เอกสาร" — รายการ "เอกสารล่าสุด"/การเรียงตามการแก้ไขต้องไม่เปลี่ยน)
  for (const g of groups) {
    const json = JSON.stringify(sellerSnapshotOf(current, g.docType, "SETTINGS_CHANGE", at));
    n += await db.$executeRaw`
      UPDATE "AccountDocument" SET "sellerSnapshot" = ${json}::jsonb
      WHERE "systemId" = ${systemId} AND "docType" = ${g.docType}::"AccountDocType" AND "sellerSnapshot" IS NULL
        AND "status" NOT IN ('DRAFT', 'CANCELLED') AND "docNo" IS NOT NULL`;
  }
  return n;
}

/** แถว AccountSettings (ช่องที่ต้องใช้) → ค่าตั้งของ snapshot — ใช้ในตัวบันทึกค่าตั้งที่อ่านแถวอยู่แล้ว */
export const SNAPSHOT_SETTINGS_SELECT = { orgName: true, address: true, taxId: true, branchCode: true, branchName: true, phone: true, logoUrl: true, footerNote: true, docConfig: true } as const;
export function snapshotSettingsFromRow(row: {
  orgName: string | null;
  address: string | null;
  taxId: string | null;
  branchCode: string | null;
  branchName: string | null;
  phone: string | null;
  logoUrl: string | null;
  footerNote: string | null;
  docConfig: unknown;
}): SnapshotSettings {
  const cfg = row.docConfig && typeof row.docConfig === "object" && !Array.isArray(row.docConfig) ? (row.docConfig as Record<string, unknown>) : {};
  return { ...row, orgPrefix: typeof cfg.orgPrefix === "string" ? cfg.orgPrefix : null, doc: parseDocSettings(row.docConfig ?? null) };
}
