// ─────────────────────────────────────────────────────────────
// inbox.ts — กล่องขาเข้า (WO 7.2 · DESIGN-SPEC-V2 §12 · เฟรม g15/g20)
//
// "ไฟล์ที่ยังไม่ผูกเอกสาร" มาจาก 4 ทาง: อัปโหลด · อีเมล inbox@ · แชท (LINE) · แอปถ่ายบิล
// ไฟล์นี้ดูแล 3 เรื่อง:
//   1) `createExpenseFromAttachment` — ยืนยันข้อเสนอของ AI แล้วออก "บันทึกค่าใช้จ่าย" ฉบับร่าง
//      (ผู้ขาย → ผู้ติดต่อ · บรรทัดจากบิล · โหมด VAT ตามชนิดเอกสาร · ผูกไฟล์เข้ากับเอกสารที่สร้าง)
//   2) `ingestInboxFiles` — รับไฟล์จากช่องทางภายนอก (แชท/อีเมล/แอป) เข้ากล่อง แบบกันซ้ำด้วย `sourceRef`
//   3) `inboxStats` — ตัวเลขบนแผงขวาของ g15 ("เอกสารที่สร้างจากกล่องขาเข้าเดือนนี้")
//
// กติกา: ห้าม import prisma ตรง (fitness F5.1) → `tenantDb` · เงินเป็นสตางค์ integer ·
//        ทุกทางเข้าเป็นฟังก์ชันธรรมดา (ด่านสิทธิ์อยู่ที่ชั้น action/page — เหมือนไฟล์อื่นในโมดูล)
// ─────────────────────────────────────────────────────────────

import type { AccountVatMode } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { writeAudit } from "./access";
import { ATTACHMENT_ALLOWED_MIME, type AttachmentSource } from "./attachment-shared";
import { isImageMime } from "./attachment";
import { createExpenseDoc, type VatPurchaseMode } from "./expense";
import { createContact, normalizeTaxId, normalizePhoneTh } from "./service";
import type { BillDocKind, BillExtract, InboxCtx } from "./inbox-ai";

export type { InboxCtx } from "./inbox-ai";

// ─────────────────── โหมด VAT ตามชนิดเอกสารที่ AI เดา (§9.3 ค่าเริ่มต้น) ───────────────────
/**
 * ใบกำกับภาษี = ขอคืน VAT ได้ทันที · ใบแจ้งหนี้ = ของยังไม่มีใบกำกับ → "รอใบกำกับ" (ภาษีซื้อรอตั้งพัก)
 * ใบเสร็จ/สลิป/อื่น ๆ = ไม่มีใบกำกับ → ขอคืนไม่ได้ ลงเป็นค่าใช้จ่ายเต็มจำนวน
 * 🔴 ค่าเริ่มต้นเท่านั้น — ผู้ใช้แก้ในฟอร์มร่างได้ก่อนออกเอกสารจริงเสมอ
 */
export function vatPurchaseModeFor(docKind: BillDocKind, hasVat: boolean): VatPurchaseMode {
  if (!hasVat) return "NO_CLAIM";
  if (docKind === "TAX_INVOICE") return "CLAIM";
  if (docKind === "INVOICE") return "AWAITING";
  return "NO_CLAIM";
}

// ─────────────────── ผู้ขาย: หา/สร้างผู้ติดต่อจากหัวบิล ───────────────────
/**
 * ลำดับจับคู่ (เหมือน service.findOrCreateCustomerContact แต่ฝั่งผู้ขาย):
 *   1) เลขผู้เสียภาษี + รหัสสาขา (กุญแจตัวตนตามกฎหมาย)
 *   2) เบอร์โทร normalize (ถ้าผู้ใช้กรอกมาเอง — บิลส่วนใหญ่ไม่มี)
 *   3) ชื่อตรงเป๊ะ **เฉพาะผู้ติดต่อชนิดผู้ขาย/ทั้งสองอย่าง** (บิลไม่มีอีเมลให้ยืนยันซ้ำเหมือนฝั่งลูกค้า
 *      — ชื่อร้านที่พิมพ์บนใบกำกับเป็นชื่อนิติบุคคล ความเสี่ยงชนกันต่ำกว่าชื่อบุคคล และผลเสียของการ
 *      สร้างผู้ขายซ้ำ (ยอดค้างจ่ายแตกเป็น 2 ราย) สูงกว่า) — ไม่เข้าเงื่อนไขไหนเลย = สร้างใหม่
 */
export async function findOrCreateVendorContact(
  ctx: InboxCtx,
  v: { name: string; taxId?: string | null; branchCode?: string | null; phone?: string | null },
): Promise<{ id: string; created: boolean }> {
  const db = tenantDb(ctx);
  const name = v.name.trim().slice(0, 200) || "ผู้ขายไม่ระบุชื่อ";

  const taxId = normalizeTaxId(v.taxId);
  if (taxId) {
    const byTax = await db.accountContact.findFirst({
      where: { archivedAt: null, taxId, branchCode: v.branchCode || "00000" },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    if (byTax) return { id: byTax.id, created: false };
  }

  const phoneNorm = normalizePhoneTh(v.phone);
  if (phoneNorm) {
    const byPhone = await db.accountContact.findFirst({
      where: { archivedAt: null, phoneNorm },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    if (byPhone) return { id: byPhone.id, created: false };
  }

  const byName = await db.accountContact.findFirst({
    where: { archivedAt: null, name, kind: { in: ["VENDOR", "BOTH"] } },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (byName) return { id: byName.id, created: false };

  const created = await createContact({
    tenantId: ctx.tenantId,
    systemId: ctx.systemId,
    kind: "VENDOR",
    name,
    taxId: taxId || null,
    ...(v.branchCode ? { branchCode: v.branchCode } : {}),
    ...(v.phone ? { phone: v.phone } : {}),
  });
  return { id: created.id, created: true };
}

// ─────────────────── สร้างบันทึกค่าใช้จ่ายจากไฟล์ในกล่องขาเข้า ───────────────────

/** ค่าที่ผู้ใช้แก้ในแผ่นยืนยันก่อนกดสร้าง (ทุกช่องไม่บังคับ — ไม่ส่ง = ใช้ค่าที่ AI อ่านได้) */
export type CreateExpenseOverrides = {
  vendorName?: string;
  vendorTaxId?: string | null;
  vendorPhone?: string | null;
  invoiceNo?: string | null;
  /** ISO "YYYY-MM-DD" */
  issueDate?: string | null;
  totalSatang?: number;
  vatSatang?: number;
  vatRateBp?: number;
  docKind?: BillDocKind;
  note?: string | null;
};

export type CreateExpenseFromAttachmentResult =
  | { ok: true; docId: string; contactId: string; contactCreated: boolean; grandTotal: number }
  | { ok: false; reason: string };

/** ค่าตั้งต้นของแผ่นยืนยัน — หน้าจอเอาไปเติมช่องให้ผู้ใช้แก้ (ไม่มีผลอ่าน = ช่องว่างให้กรอกเอง) */
export type ExpenseDraftPrefill = {
  vendorName: string;
  vendorTaxId: string;
  invoiceNo: string;
  issueDate: string;
  totalSatang: number;
  vatSatang: number;
  vatRateBp: number;
  docKind: BillDocKind;
  lineItems: BillExtract["lineItems"];
  confidence: number | null;
};

export function prefillFromExtract(extract: BillExtract | null, fallbackDateIso: string): ExpenseDraftPrefill {
  return {
    vendorName: extract?.vendorName ?? "",
    vendorTaxId: extract?.vendorTaxId ?? "",
    invoiceNo: extract?.invoiceNo ?? "",
    issueDate: extract?.issueDate ?? fallbackDateIso,
    totalSatang: extract?.totalSatang ?? 0,
    vatSatang: extract?.vatSatang ?? 0,
    vatRateBp: extract?.vatRateBp ?? 0,
    docKind: extract?.docKind ?? "OTHER",
    lineItems: extract?.lineItems ?? [],
    confidence: extract?.confidence ?? null,
  };
}

/** "YYYY-MM-DD" (โซนไทย) → Date เที่ยงวัน UTC+7 กันวันเพี้ยนตอนแปลงกลับ */
function dateFromIso(iso: string | null | undefined): Date | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(`${iso}T05:00:00.000Z`); // 12:00 น. เวลาไทย
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * ยืนยันข้อเสนอของ AI → ออกเอกสาร "บันทึกค่าใช้จ่าย" (EXPENSE) ฉบับร่าง + ผูกไฟล์เข้ากับเอกสาร
 *
 * ทำไมบรรทัดถึงป้อนเป็นราคา **รวม VAT** เสมอ: ยอดที่ผู้ใช้เห็นบนบิลคือยอดรวม ⇒ เอกสารต้องได้ยอดนั้นเป๊ะ
 *   (`computeTotals` โหมด INCLUDE ถอด VAT ออกจากยอดรวมให้เอง — ปัดเศษไม่ทำให้ยอดรวมเพี้ยน)
 *   ไม่มี VAT (ใบเสร็จ/สลิป) → `vatPurchaseMode = NO_CLAIM` ⇒ vatMode NONE ⇒ ยอดรวม = ยอดบรรทัด
 * กดสร้างซ้ำไม่ได้: ไฟล์ที่ผูกเอกสารแล้ว/เคยสร้างแล้ว จะถูกปฏิเสธพร้อมเหตุผลไทย
 */
export async function createExpenseFromAttachment(
  ctx: InboxCtx,
  attachmentId: string,
  overrides?: CreateExpenseOverrides,
  actorId?: string | null,
): Promise<CreateExpenseFromAttachmentResult> {
  const db = tenantDb(ctx);
  const att = await db.accountAttachment.findFirst({
    where: { id: attachmentId },
    select: {
      id: true, fileName: true, documentId: true, status: true, archivedAt: true,
      aiStatus: true, aiExtract: true, expenseDocId: true, createdAt: true,
    },
  });
  if (!att) return { ok: false, reason: "ไม่พบไฟล์" };
  if (att.archivedAt) return { ok: false, reason: "ไฟล์นี้ถูกลบไปแล้ว — กู้คืนก่อนจึงจะสร้างเอกสารได้" };
  if (att.expenseDocId || att.documentId) {
    return { ok: false, reason: "ไฟล์นี้ผูกกับเอกสารอยู่แล้ว — เปิดเอกสารเดิมเพื่อแก้ไข" };
  }

  const extract = att.aiStatus === "DONE" ? ((att.aiExtract ?? null) as BillExtract | null) : null;
  const totalSatang = Math.max(0, Math.round(overrides?.totalSatang ?? extract?.totalSatang ?? 0));
  if (totalSatang <= 0) return { ok: false, reason: "ยังไม่รู้ยอดเงินของบิลใบนี้ — กรอกยอดรวมก่อนกดสร้าง" };

  const vendorName = (overrides?.vendorName ?? extract?.vendorName ?? "").trim();
  if (!vendorName) return { ok: false, reason: "ยังไม่รู้ชื่อผู้ขาย — กรอกชื่อผู้ขายก่อนกดสร้าง" };

  const vatSatang = Math.max(0, Math.round(overrides?.vatSatang ?? extract?.vatSatang ?? 0));
  const vatRateBp = Math.max(0, Math.round(overrides?.vatRateBp ?? extract?.vatRateBp ?? 0));
  const docKind: BillDocKind = overrides?.docKind ?? extract?.docKind ?? "OTHER";
  const invoiceNo = (overrides?.invoiceNo ?? extract?.invoiceNo ?? "")?.trim() || null;
  const issueDate =
    dateFromIso(overrides?.issueDate ?? extract?.issueDate ?? null) ?? att.createdAt;

  const vatPurchaseMode = vatPurchaseModeFor(docKind, vatSatang > 0 && vatRateBp > 0);
  const vatMode: AccountVatMode = vatPurchaseMode === "NO_CLAIM" ? "NONE" : "INCLUDE";

  const vendor = await findOrCreateVendorContact(ctx, {
    name: vendorName,
    taxId: overrides?.vendorTaxId ?? extract?.vendorTaxId ?? null,
    branchCode: extract?.branchCode ?? null,
    phone: overrides?.vendorPhone ?? null,
  });

  // บรรทัด: ใช้รายการจากบิลเมื่อผลรวมตรงกับยอดรวม (ยอมคลาด ≤ 1 สตางค์ต่อบรรทัดจากการปัด)
  // ไม่ตรง/ไม่มีรายการ = บรรทัดเดียว "ค่าใช้จ่ายตามบิล" เท่ายอดรวม — ห้ามให้เอกสารมียอดไม่เท่าบิลเด็ดขาด
  const items = extract?.lineItems ?? [];
  const itemSum = items.reduce((s, l) => s + Math.max(0, Math.round(l.amountSatang)), 0);
  const useItems = items.length > 0 && Math.abs(itemSum - totalSatang) <= items.length;
  const lines = useItems
    ? items.map((l) => ({
        description: l.description.slice(0, 300),
        qty: 1, // ยอดต่อบรรทัดเป็นยอดรวมของบรรทัดนั้นอยู่แล้ว (qty×unitPrice ของ AI ไม่ประกันว่าคูณแล้วลงตัว)
        unitPrice: Math.max(0, Math.round(l.amountSatang)),
        vatRateBp: vatMode === "NONE" ? 0 : vatRateBp || undefined,
      }))
    : [
        {
          description: "ค่าใช้จ่ายตามบิล",
          qty: 1,
          unitPrice: totalSatang,
          vatRateBp: vatMode === "NONE" ? 0 : vatRateBp || undefined,
        },
      ];
  // รายการจากบิลรวมกันอาจคลาดจากยอดรวมได้ 1–2 สตางค์ → เติมส่วนต่างเข้าบรรทัดแรก ให้ยอดตรงบิลเป๊ะ
  if (useItems && itemSum !== totalSatang && lines[0]) {
    lines[0].unitPrice = Math.max(0, lines[0].unitPrice + (totalSatang - itemSum));
  }

  const noteParts = [
    invoiceNo ? `เลขที่ใบกำกับ ${invoiceNo}` : "",
    `สร้างจากกล่องขาเข้า: ${att.fileName}`,
    overrides?.note?.trim() ?? "",
  ].filter(Boolean);

  const doc = await createExpenseDoc({
    tenantId: ctx.tenantId,
    systemId: ctx.systemId,
    docType: "EXPENSE",
    contactId: vendor.id,
    issueDate,
    vatMode,
    vatPurchaseMode,
    lines,
    note: noteParts.join(" · ").slice(0, 500),
    source: "INBOX",
    createdById: actorId ?? null,
    refType: "AccountAttachment",
    refId: att.id,
  });

  await db.accountAttachment.update({
    where: { id: att.id },
    data: {
      documentId: doc.id,
      expenseDocId: doc.id,
      status: "LINKED",
      docTypeHint: "EXPENSE",
    },
  });

  await writeAudit({
    tenantId: ctx.tenantId,
    actorId,
    action: "account.doc.create",
    targetType: "AccountDocument",
    targetId: doc.id,
    after: { fromInbox: att.id, vendorId: vendor.id, grandTotal: doc.grandTotal, aiStatus: att.aiStatus },
  });

  return { ok: true, docId: doc.id, contactId: vendor.id, contactCreated: vendor.created, grandTotal: doc.grandTotal };
}

// ─────────────────── รับไฟล์เข้ากล่อง (แชท / อีเมล / แอป) ───────────────────

export type InboxIngestFile = {
  /** id ฝั่งต้นทางของไฟล์นี้ (ChatMessage.id + ลำดับไฟล์ / Message-ID ของอีเมล) — กันรับซ้ำ */
  sourceRef: string;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  sizeBytes?: number;
};

export type IngestResult = { created: number; duplicated: number; rejected: number; ids: string[] };

/**
 * เอาไฟล์จากช่องทางภายนอกเข้ากล่องขาเข้า — **idempotent ต่อ `sourceRef`**
 * (unique (systemId, sourceRef) ในสคีมา ⇒ outbox ยิงซ้ำ/replay ก็ไม่เกิดไฟล์ซ้ำ)
 * รับเฉพาะรูป/PDF ตามชุดเดียวกับคลังเอกสาร (ATTACHMENT_ALLOWED_MIME) — สติกเกอร์/เสียง/วิดีโอ ตกไปเงียบ ๆ
 * ไม่ throw: ผู้เรียกคือ outbox consumer — พังที่นี่ = คิวทั้งระบบตัน
 */
export async function ingestInboxFiles(
  ctx: InboxCtx,
  input: { source: AttachmentSource; senderLabel?: string | null; files: InboxIngestFile[] },
): Promise<IngestResult> {
  const db = tenantDb(ctx);
  const out: IngestResult = { created: 0, duplicated: 0, rejected: 0, ids: [] };

  for (const f of input.files) {
    const mime = (f.mimeType || "").toLowerCase();
    const url = (f.fileUrl || "").trim();
    if (!ATTACHMENT_ALLOWED_MIME.has(mime) || !/^https?:\/\//i.test(url) || !f.sourceRef) {
      out.rejected++;
      continue;
    }
    const exists = await db.accountAttachment.findFirst({
      where: { sourceRef: f.sourceRef },
      select: { id: true },
    });
    if (exists) {
      out.duplicated++;
      continue;
    }
    try {
      const row = await db.accountAttachment.create({
        data: {
          // tenantDb ยัด tenantId/systemId ให้เองตอน runtime (ชนิดยังบังคับ → ระบุซ้ำให้ตรงกัน)
          tenantId: ctx.tenantId,
          systemId: ctx.systemId,
          fileName: (f.fileName || "ไฟล์แนบ").slice(0, 200),
          fileUrl: url,
          mimeType: mime,
          sizeBytes: Math.max(0, Math.round(f.sizeBytes ?? 0)),
          status: "UNLINKED",
          source: input.source,
          senderLabel: input.senderLabel?.slice(0, 120) ?? null,
          sourceRef: f.sourceRef,
          thumbUrl: isImageMime(mime) ? url : null,
          docTypeHint: "EXPENSE_ANY",
        },
        select: { id: true },
      });
      out.created++;
      out.ids.push(row.id);
    } catch (e) {
      // unique (systemId, sourceRef) ชน = อีกคำขอ/รอบ drain สร้างไปแล้ว → ถือว่าซ้ำ ไม่ใช่ error
      if (e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "P2002") out.duplicated++;
      else out.rejected++;
    }
  }
  return out;
}

/**
 * 📮 อีเมล inbox@ — ยังไม่มีของจริง (แพลตฟอร์มไม่มีขา "รับอีเมลขาเข้า" เลย ณ WO 7.2)
 *
 * ต้องมี 3 อย่างก่อนเปิดใช้ (จดไว้ให้เจ้าของ/session ถัดไปใน ledger):
 *   1) โดเมนรับเมล + ผู้ให้บริการ inbound (เช่น Resend/Mailgun/SES route) ที่ยิง webhook เข้าเรา
 *   2) route `/api/inbox/email` ที่ตรวจลายเซ็นของผู้ให้บริการ + แปลง address `inbox-<slug>@shark.in.th`
 *      เป็น tenant/systemId (ห้ามเชื่อ From: — สแปมปลอมได้)
 *   3) อัปไฟล์แนบเข้า storage แล้วเรียกฟังก์ชันนี้ (sourceRef = Message-ID ของอีเมล → กันรับซ้ำ)
 * จนกว่าจะมี: หน้าจอโชว์ที่อยู่อีเมลไว้เฉย ๆ + ป้าย "เร็ว ๆ นี้" บนตัวกรองที่มา
 */
export async function ingestInboundEmail(
  _ctx: InboxCtx,
  _input: { messageId: string; from: string; subject?: string; files: InboxIngestFile[] },
): Promise<{ ok: false; reason: string }> {
  return { ok: false, reason: "ยังไม่ได้เปิดรับอีเมลเข้ากล่องขาเข้า (รอผู้ให้บริการอีเมลขาเข้า)" };
}

/** ที่อยู่อีเมลของกล่องขาเข้า (โชว์บนแถบตัวกรอง g15) — slug ของกิจการ */
export function inboxEmailAddress(tenantSlug: string): string {
  const slug = (tenantSlug || "shop").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40) || "shop";
  return `inbox-${slug}@shark.in.th`;
}

// ─────────────────── ตัวเลขแผงขวา g15 ───────────────────

export type InboxStats = {
  /** เอกสารที่สร้างจากกล่องขาเข้าในเดือนปฏิทินนี้ (โซนไทย) */
  docsThisMonth: number;
  /** เวลาที่ประหยัด (ชั่วโมง) — สมมติกรอกเองใบละ ~8 นาที · ตัวเลขนี้เป็น "คำอธิบายคุณค่า" ไม่ใช่ตัวเลขบัญชี */
  savedHours: number;
  /** ไฟล์ที่ยังไม่เคยให้ AI อ่าน (ปุ่ม "อ่านด้วย AI ทั้งหมด" มีงานให้ทำไหม) */
  unreadCount: number;
};

const MINUTES_SAVED_PER_DOC = 8;

export async function inboxStats(ctx: InboxCtx, now = new Date()): Promise<InboxStats> {
  const db = tenantDb(ctx);
  // ต้นเดือนตามเวลาไทย → เทียบกับ createdAt ที่เก็บเป็น UTC
  const thai = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const monthStart = new Date(`${thai.slice(0, 7)}-01T00:00:00.000+07:00`);

  const [docsThisMonth, unreadCount] = await Promise.all([
    // นับ "เอกสารที่เกิดจากกล่องขาเข้า" จากตัวเอกสารเอง (source=INBOX) ไม่ใช่จากวันที่อัปโหลดไฟล์
    // (ไฟล์อาจถูกส่งเข้ามาเดือนก่อนแล้วเพิ่งมากดสร้างเดือนนี้)
    db.accountDocument.count({ where: { source: "INBOX", createdAt: { gte: monthStart } } }),
    db.accountAttachment.count({ where: { archivedAt: null, status: "UNLINKED", aiStatus: null } }),
  ]);
  return {
    docsThisMonth,
    savedHours: Math.round(((docsThisMonth * MINUTES_SAVED_PER_DOC) / 60) * 10) / 10,
    unreadCount,
  };
}
