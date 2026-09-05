// ─────────────────────────────────────────────────────────────
// inbox-ai.ts — "AI อ่านบิลจากรูป" ของกล่องขาเข้า (WO 7.2 · DESIGN-SPEC-V2 §12 · BLUEPRINT §0.3(6))
//
// หน้าที่เดียว: รับ `AccountAttachment` 1 แถว → ส่งรูปเข้าโมเดล vision → ได้ JSON ที่ตรวจแล้ว →
// เก็บลง `aiExtract`/`aiStatus`/`aiModel`/`aiCostSatang`/`aiReadAt` · **ไม่สร้างเอกสารเอง**
// (การสร้างเอกสารอยู่ที่ `inbox.ts` → `createExpenseFromAttachment` ซึ่งคนต้องกดยืนยันก่อนเสมอ)
//
// กติกาที่ยึด:
//  • **ห้าม throw** ทุกกรณี — ปุ่ม "อ่านด้วย AI" และ cron ต้องไม่พังทั้งหน้าเพราะบิลใบเดียวอ่านไม่ออก
//    ทุกทางออกคืน `{ status, reason }` ที่แปลเป็นภาษาคนไทยได้ทันที
//  • **เงินก่อนงาน**: เช็ก `canSpend` ก่อนแตะ provider เสมอ (กติกาเจ้าของ 8 ส.ค. — ห้ามยิงแล้วค่อยพบว่าเครดิตหมด)
//    หลังได้คำตอบจึง `chargeUsageSafe` **ครั้งเดียวต่อการอ่าน 1 ครั้ง** (รวม token ของรอบซ่อม JSON ด้วย)
//  • **prompt เป็นภาษาอังกฤษ** (บทเรียน: ไทยกิน token ~4 เท่า) · ผลลัพธ์/ข้อความบนจอเป็นไทย
//  • **เงินเป็นสตางค์ (integer)** — สั่งโมเดลส่งเป็นสตางค์ตรง ๆ แล้วปัดเป็น integer อีกชั้น
//  • ห้าม import prisma ตรง (fitness F5.1 เต็มเพดาน) → ทุก query ผ่าน `tenantDb`
// ─────────────────────────────────────────────────────────────

import { tenantDb } from "@/lib/core/db";
import { resolveProvider, type AiChatMessage, type AiProvider } from "@/lib/ai/provider";
import { canSpend, chargeUsageSafe, outOfCreditMessage } from "@/lib/ai/credit";
import { accountRateGuard } from "./rate-limit";
import { MICRO_PER_USD } from "@/lib/ai/pricing";
import { safeReason } from "./errors";

export type InboxAiStatus = "PENDING" | "DONE" | "FAILED" | "UNSUPPORTED" | "SKIPPED";

export type BillLineItem = {
  description: string;
  qty: number;
  unitPriceSatang: number;
  amountSatang: number;
};

/** ชนิดเอกสารที่ AI เดาให้ — ตัดสินโหมด VAT ตอนสร้างบันทึกค่าใช้จ่าย (ดู inbox.ts vatModeForDocKind) */
export type BillDocKind = "RECEIPT" | "TAX_INVOICE" | "INVOICE" | "SLIP" | "OTHER";

/** ผลอ่านบิล — เก็บทั้งก้อนใน `AccountAttachment.aiExtract` (ข้อเสนอของ AI ไม่ใช่ข้อมูลบัญชี) */
export type BillExtract = {
  vendorName: string;
  vendorTaxId: string | null;
  branchCode: string | null;
  invoiceNo: string | null;
  /** ISO "YYYY-MM-DD" ตามที่พิมพ์บนบิล (ไม่ใช่วันที่อัปโหลด) */
  issueDate: string | null;
  currency: string;
  subtotalSatang: number;
  vatSatang: number;
  vatRateBp: number;
  totalSatang: number;
  whtSatang: number | null;
  lineItems: BillLineItem[];
  docKind: BillDocKind;
  /** 0–1 — ต่ำกว่า 0.6 = หน้าจอเตือนให้คนตรวจก่อนกดสร้าง */
  confidence: number;
  notes: string | null;
};

export type ReadBillResult = {
  status: InboxAiStatus;
  extract: BillExtract | null;
  /** เหตุผลภาษาไทย (โชว์บนการ์ดได้ตรง ๆ) — สถานะ DONE ก็มีได้ถ้ามีข้อสังเกต */
  reason: string | null;
  /** true = คืนของที่เคยอ่านไว้ ไม่ได้เรียกโมเดลใหม่ (idempotent) */
  cached: boolean;
  model: string | null;
  costSatang: number | null;
};

export type InboxCtx = { tenantId: string; systemId: string };

// ─────────────────── prompt (อังกฤษ · JSON เท่านั้น) ───────────────────

const SYSTEM_PROMPT =
  "You are a Thai bookkeeping data-entry assistant. You read photos of Thai purchase documents " +
  "(receipts, tax invoices, invoices, bank transfer slips) and output ONLY machine-readable JSON. " +
  "Never explain, never wrap the JSON in markdown fences, never add trailing commentary.";

/**
 * โจทย์ที่ยื่นให้โมเดลพร้อมรูป — เขียนอังกฤษ (token ถูกกว่าไทย ~4 เท่า) แต่ค่าที่คืนเป็นข้อความไทยตามบิล
 * 🔴 ย้ำ 3 เรื่องที่พลาดบ่อยกับบิลไทย: (1) เงินเป็น "สตางค์" integer (2) ปี พ.ศ. ต้องลบ 543
 * (3) ยอดรวมคือยอดที่ต้องจ่ายจริง (รวม VAT แล้ว) ไม่ใช่ยอดก่อน VAT
 */
export const BILL_PROMPT = `Read this Thai purchase document image and return ONE JSON object with EXACTLY these keys:

{
  "vendorName": string,            // seller/shop name exactly as printed (Thai script kept as-is)
  "vendorTaxId": string|null,      // 13-digit Thai tax id, digits only, null if absent
  "branchCode": string|null,       // 5-digit branch code ("00000" = head office / สำนักงานใหญ่), null if absent
  "invoiceNo": string|null,        // document/tax-invoice number as printed
  "issueDate": string|null,        // ISO "YYYY-MM-DD" in the Gregorian calendar. Thai Buddhist years (25xx) MUST be converted: CE = BE - 543
  "currency": string,              // ISO code, "THB" unless clearly another currency
  "subtotalSatang": integer,       // amount BEFORE vat, in satang (1 baht = 100 satang)
  "vatSatang": integer,            // vat amount in satang, 0 if the document shows no vat
  "vatRateBp": integer,            // vat rate in basis points: 7% = 700, 0 if no vat
  "totalSatang": integer,          // grand total actually payable (vat included), in satang
  "whtSatang": integer|null,       // withholding tax deducted, satang, null if absent
  "lineItems": [                   // at most 20 rows; [] if the document has no readable line items
    { "description": string, "qty": number, "unitPriceSatang": integer, "amountSatang": integer }
  ],
  "docKind": "RECEIPT"|"TAX_INVOICE"|"INVOICE"|"SLIP"|"OTHER",
  "confidence": number,            // 0..1, your own certainty that vendor + total are correct
  "notes": string|null             // ONE short Thai sentence about anything unclear, else null
}

Rules:
- Money MUST be integers in satang (e.g. 1,240.00 baht -> 124000). Never send decimals, never send strings.
- subtotalSatang + vatSatang MUST equal totalSatang. If the document only shows a total that includes 7% vat,
  compute subtotal = round(total * 100 / 107) and vat = total - subtotal.
- "TAX_INVOICE" only when the document literally says ใบกำกับภาษี. A bank transfer slip is "SLIP" (usually no vat).
- If a value is unreadable use null (or 0 for vat fields), do NOT guess.
- Output the JSON object and nothing else.`;

// ─────────────────── เรทแปลงค่าใช้จ่ายเป็นเงินไทย (แสดงผลเท่านั้น) ───────────────────
// มิเตอร์จริงเก็บเป็นไมโครดอลลาร์ใน AiCreditTxn — ตัวเลขสตางค์ที่เก็บบนไฟล์แนบมีไว้ให้เจ้าของร้าน
// "อ่านออก" ว่าอ่านบิลใบนี้เสียเท่าไร (≈ ไม่กี่สตางค์) · ตั้งเรทผ่าน env ได้เมื่อค่าเงินเปลี่ยนมาก
function thbPerUsd(): number {
  const v = Number(process.env.SHARK_AI_THB_PER_USD);
  return Number.isFinite(v) && v > 0 ? v : 36;
}
function microUsdToSatang(micro: number): number {
  if (!Number.isFinite(micro) || micro <= 0) return 0;
  return Math.max(1, Math.round((micro / MICRO_PER_USD) * thbPerUsd() * 100));
}

// ─────────────────── ตัวช่วยแปลง/ตรวจ JSON ───────────────────

const DOC_KINDS: BillDocKind[] = ["RECEIPT", "TAX_INVOICE", "INVOICE", "SLIP", "OTHER"];

/** ดึงก้อน JSON ออกจากคำตอบ (โมเดลชอบแถ ```json … ``` หรือมีคำนำหน้า) — ไม่เจอ = null */
export function extractJsonBlock(text: string): unknown | null {
  const raw = String(text ?? "").trim();
  if (!raw) return null;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
}

const asInt = (v: unknown): number => {
  const n = typeof v === "string" ? Number(v.replace(/[, ]/g, "")) : Number(v);
  return Number.isFinite(n) ? Math.round(n) : 0;
};
const asStr = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s.slice(0, 200) : null;
};
const isoDate = (v: unknown): string | null => {
  const s = asStr(v);
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  let year = Number(m[1]);
  // กันโมเดลลืมแปลง พ.ศ. → ค.ศ. (2569-08-22) — เจอบ่อยกับบิลไทย
  if (year > 2400) year -= 543;
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${String(year).padStart(4, "0")}-${m[2]}-${m[3]}`;
};

/**
 * แปลง JSON ดิบของโมเดล → BillExtract ที่ใช้งานได้ + ตรวจเลขคณิต
 * คืน null เมื่อไม่มีแม้แต่ "ชื่อผู้ขาย + ยอดรวม" (อ่านไม่ได้จริง ๆ)
 */
export function normalizeExtract(raw: unknown): BillExtract | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const vendorName = asStr(o.vendorName);
  const totalSatang = Math.max(0, asInt(o.totalSatang));
  if (!vendorName && totalSatang <= 0) return null;

  let subtotalSatang = Math.max(0, asInt(o.subtotalSatang));
  let vatSatang = Math.max(0, asInt(o.vatSatang));
  const vatRateBp = Math.max(0, asInt(o.vatRateBp));
  const notes: string[] = [];
  const noteFromModel = asStr(o.notes);
  if (noteFromModel) notes.push(noteFromModel);

  // เติมช่องที่ขาดให้ครบก่อนตรวจ (โมเดลมักส่งแต่ยอดรวม)
  if (subtotalSatang === 0 && vatSatang === 0 && totalSatang > 0) {
    if (vatRateBp > 0) {
      subtotalSatang = Math.round((totalSatang * 10_000) / (10_000 + vatRateBp));
      vatSatang = totalSatang - subtotalSatang;
    } else {
      subtotalSatang = totalSatang;
    }
  } else if (subtotalSatang === 0 && totalSatang > 0 && vatSatang > 0) {
    subtotalSatang = totalSatang - vatSatang;
  }

  let confidence = Number(o.confidence);
  confidence = Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0.5;

  // ── ด่านเลขคณิต: ยอดก่อน VAT + VAT ต้องเท่ายอดรวม (คลาดได้ไม่เกิน 1 สตางค์จากการปัด) ──
  // ไม่ตรง = ไม่ทิ้งผล (คนยังแก้ได้) แต่ต้องลดความมั่นใจ + บอกเหตุ ไม่งั้นคนกด "สร้าง" ทั้งที่เลขเพี้ยน
  const diff = Math.abs(subtotalSatang + vatSatang - totalSatang);
  if (totalSatang > 0 && diff > 1) {
    confidence = Math.min(confidence, 0.4);
    notes.push(`ยอดก่อน VAT + VAT ไม่เท่ายอดรวม (ต่างกัน ${(diff / 100).toFixed(2)} บาท) — ตรวจก่อนบันทึก`);
  }

  const kindRaw = asStr(o.docKind)?.toUpperCase() ?? "";
  const docKind: BillDocKind = (DOC_KINDS as string[]).includes(kindRaw) ? (kindRaw as BillDocKind) : "OTHER";

  const lineItems: BillLineItem[] = Array.isArray(o.lineItems)
    ? o.lineItems
        .slice(0, 20)
        .map((l) => {
          const li = (l ?? {}) as Record<string, unknown>;
          const qtyNum = Number(li.qty);
          return {
            description: asStr(li.description) ?? "รายการตามบิล",
            qty: Number.isFinite(qtyNum) && qtyNum > 0 ? qtyNum : 1,
            unitPriceSatang: Math.max(0, asInt(li.unitPriceSatang)),
            amountSatang: Math.max(0, asInt(li.amountSatang)),
          };
        })
        .filter((l) => l.amountSatang > 0 || l.unitPriceSatang > 0)
    : [];

  const taxIdDigits = (asStr(o.vendorTaxId) ?? "").replace(/\D/g, "");
  const branchDigits = (asStr(o.branchCode) ?? "").replace(/\D/g, "");
  const wht = asInt(o.whtSatang);

  return {
    vendorName: vendorName ?? "ไม่ทราบชื่อผู้ขาย",
    vendorTaxId: taxIdDigits.length === 13 ? taxIdDigits : null,
    branchCode: branchDigits.length === 5 ? branchDigits : null,
    invoiceNo: asStr(o.invoiceNo),
    issueDate: isoDate(o.issueDate),
    currency: (asStr(o.currency) ?? "THB").toUpperCase().slice(0, 8),
    subtotalSatang,
    vatSatang,
    vatRateBp,
    totalSatang,
    whtSatang: wht > 0 ? wht : null,
    lineItems,
    docKind,
    confidence,
    notes: notes.length ? notes.join(" · ").slice(0, 500) : null,
  };
}

// ─────────────────── อ่านบิล 1 ใบ ───────────────────

const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

function skipped(reason: string): ReadBillResult {
  return { status: "SKIPPED", extract: null, reason, cached: false, model: null, costSatang: null };
}

/**
 * อ่านบิลจากไฟล์แนบ 1 แถว
 * - `force` ไม่ตั้ง + เคยอ่านสำเร็จแล้ว → คืนของเดิม (idempotent · ไม่เสียเงินซ้ำ)
 * - ปิดผู้ช่วย AI / เครดิตหมด → `SKIPPED` (ไม่ throw · ไม่แตะ provider)
 * - PDF (ยังไม่มีตัวแปลงหน้าแรกเป็นรูปในระบบ) → `UNSUPPORTED` พร้อมเหตุผลไทย
 * - โมเดลตอบไม่เป็น JSON → ขอซ่อม 1 ครั้ง → ยังไม่ได้ = `FAILED`
 */
export async function readBill(
  ctx: InboxCtx,
  attachmentId: string,
  opts?: { provider?: AiProvider; force?: boolean; userId?: string | null },
): Promise<ReadBillResult> {
  const db = tenantDb(ctx);
  const row = await db.accountAttachment.findFirst({
    where: { id: attachmentId },
    select: {
      id: true, fileUrl: true, fileName: true, mimeType: true,
      aiExtract: true, aiStatus: true, aiModel: true, aiCostSatang: true, archivedAt: true,
    },
  });
  if (!row) return { status: "FAILED", extract: null, reason: "ไม่พบไฟล์", cached: false, model: null, costSatang: null };
  if (row.archivedAt) {
    return { status: "FAILED", extract: null, reason: "ไฟล์นี้ถูกลบไปแล้ว", cached: false, model: null, costSatang: null };
  }

  // เคยอ่านสำเร็จแล้ว = คืนของเดิม (ปุ่ม "อ่านใหม่" ส่ง force มาเอง)
  if (!opts?.force && row.aiStatus === "DONE" && row.aiExtract) {
    const cachedExtract = normalizeExtract(row.aiExtract);
    if (cachedExtract) {
      return {
        status: "DONE",
        extract: cachedExtract,
        reason: cachedExtract.notes,
        cached: true,
        model: row.aiModel,
        costSatang: row.aiCostSatang,
      };
    }
  }

  const mime = (row.mimeType || "").toLowerCase();
  const pdfVision = process.env.SHARK_AI_PDF_VISION === "1";
  if (!IMAGE_MIMES.has(mime) && !(mime === "application/pdf" && pdfVision)) {
    const reason =
      mime === "application/pdf"
        ? "ยังอ่าน PDF ด้วย AI ไม่ได้ — เปิดไฟล์แล้วกรอกเอง หรือถ่ายรูปบิลส่งเข้ามาใหม่"
        : "ชนิดไฟล์นี้ให้ AI อ่านไม่ได้ — รองรับเฉพาะรูปถ่าย (JPG/PNG/HEIC/WEBP)";
    await db.accountAttachment.update({
      where: { id: row.id },
      data: { aiStatus: "UNSUPPORTED", aiExtract: { reason }, aiReadAt: new Date() },
    });
    return { status: "UNSUPPORTED", extract: null, reason, cached: false, model: null, costSatang: null };
  }

  const provider = opts?.provider ?? resolveProvider("smart");
  if (!provider) return skipped("ยังไม่ได้เปิดผู้ช่วย AI ของกิจการนี้ — กรอกข้อมูลเองได้ตามปกติ");
  if (!(await canSpend(ctx.tenantId))) return skipped(outOfCreditMessage());
  // WO 9.2 ข้อ 11 — เพดานต่อร้านต่อวัน ซ้อนบน credit gate:
  //   เครดิตกันไม่ให้ "ใช้เกินเงินที่มี" แต่ไม่กัน "ยิงรัวจนหมดเครดิตในนาทีเดียว"
  //   นับเฉพาะตอนกำลังจะยิง provider จริง (cache/UNSUPPORTED/ปิด AI ไม่กินโควตา)
  const rate = await accountRateGuard("aiBill", ctx.tenantId);
  if (!rate.ok) return skipped(rate.reason);

  // ทำเครื่องหมาย "กำลังอ่าน" ก่อนยิง — คนที่เปิดหน้าอยู่จะเห็นสถานะจริง และกันกดรัวซ้ำซ้อน
  await db.accountAttachment.update({ where: { id: row.id }, data: { aiStatus: "PENDING" } });

  const messages: AiChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: BILL_PROMPT, imageUrls: [row.fileUrl] },
  ];

  let tokensIn = 0;
  let tokensOut = 0;
  let model = "";
  let parsed: unknown = null;
  let failReason: string | null = null;

  try {
    const first = await provider.chat(messages, { maxTokens: 1500 });
    tokensIn += first.tokensIn;
    tokensOut += first.tokensOut;
    model = first.model;
    parsed = extractJsonBlock(first.text);

    // ซ่อม 1 ครั้ง: ยื่นคำตอบเดิมกลับไปแล้วขอ "JSON อย่างเดียว" (ถูกกว่าอ่านรูปใหม่ทั้งใบ)
    if (parsed === null) {
      const repair = await provider.chat(
        [
          ...messages,
          { role: "assistant", content: first.text },
          {
            role: "user",
            content:
              "Your previous answer was not valid JSON. Reply again with ONLY the JSON object described above — " +
              "no markdown fences, no words before or after it.",
          },
        ],
        { maxTokens: 1500 },
      );
      tokensIn += repair.tokensIn;
      tokensOut += repair.tokensOut;
      model = repair.model || model;
      parsed = extractJsonBlock(repair.text);
      if (parsed === null) failReason = "AI ตอบกลับมาไม่เป็นข้อมูลที่อ่านได้ — กรอกเอง หรือลองถ่ายรูปให้ชัดขึ้น";
    }
  } catch (e) {
    // WO 9.4 — e อาจเป็น error ดิบจาก provider AI ภายนอก (ภาษาอังกฤษ/รหัส HTTP) ⇒ กรองก่อนโชว์ผู้ใช้
    failReason = `เรียกผู้ช่วย AI ไม่สำเร็จ — ${safeReason(e, "ลองใหม่อีกครั้ง หรือกรอกข้อมูลเอง")}`;
  }

  // คิดเงินครั้งเดียวต่อการอ่าน 1 ครั้ง (รวมรอบซ่อม) — คำตอบออกมาแล้วต้องจ่าย แม้ตีความไม่ได้
  let costSatang: number | null = null;
  if (tokensIn + tokensOut > 0) {
    const micro = await chargeUsageSafe(
      { tenantId: ctx.tenantId },
      {
        source: "ACCOUNT_INBOX",
        model: model || "unknown",
        tokensIn,
        tokensOut,
        ...(opts?.userId ? { userId: opts.userId } : {}),
        note: `อ่านบิลจากรูป: ${row.fileName}`.slice(0, 200),
      },
    );
    costSatang = microUsdToSatang(micro);
  }

  const extract = failReason ? null : normalizeExtract(parsed);
  if (!extract) {
    const reason = failReason ?? "อ่านค่าจากรูปนี้ไม่ได้ (ไม่พบชื่อผู้ขาย/ยอดเงิน) — กรอกเอง";
    await db.accountAttachment.update({
      where: { id: row.id },
      data: {
        aiStatus: "FAILED",
        aiExtract: { reason },
        aiModel: model || null,
        aiCostSatang: costSatang,
        aiReadAt: new Date(),
      },
    });
    return { status: "FAILED", extract: null, reason, cached: false, model: model || null, costSatang };
  }

  await db.accountAttachment.update({
    where: { id: row.id },
    data: {
      aiStatus: "DONE",
      aiExtract: extract as unknown as object,
      aiModel: model || null,
      aiCostSatang: costSatang,
      aiReadAt: new Date(),
    },
  });
  return { status: "DONE", extract, reason: extract.notes, cached: false, model: model || null, costSatang };
}

// ─────────────────── อ่านทีละชุด (ปุ่ม "อ่านด้วย AI ทั้งหมด" + cron) ───────────────────

export const INBOX_AI_BATCH_MAX = 10;

export type ReadPendingResult = {
  scanned: number;
  done: number;
  failed: number;
  skipped: number;
  unsupported: number;
  /** เหตุผลของตัวที่ไม่สำเร็จตัวแรก — เอาไปขึ้น toast ให้ผู้ใช้รู้ว่าทำไมไม่มีอะไรเกิดขึ้น */
  firstReason: string | null;
};

/**
 * อ่านไฟล์ในกล่องขาเข้าที่ยังไม่เคยอ่าน (ครั้งละไม่เกิน 10 ใบ — กันบิลค้าง 300 ใบดูดเครดิตรวดเดียว)
 * เลือกเฉพาะไฟล์รูปที่ยังลอย (UNLINKED) และ `aiStatus` ว่าง/PENDING เท่านั้น
 * เครดิตหมดกลางทาง = หยุดทั้งชุด (ตัวที่เหลือไม่ต้องเสียเวลา query ซ้ำ)
 */
export async function readPendingInbox(
  ctx: InboxCtx,
  opts?: { provider?: AiProvider; limit?: number; userId?: string | null },
): Promise<ReadPendingResult> {
  const take = Math.max(1, Math.min(INBOX_AI_BATCH_MAX, opts?.limit ?? INBOX_AI_BATCH_MAX));
  const db = tenantDb(ctx);
  const rows = await db.accountAttachment.findMany({
    where: {
      archivedAt: null,
      status: "UNLINKED",
      OR: [{ aiStatus: null }, { aiStatus: "PENDING" }],
    },
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true },
  });

  const out: ReadPendingResult = { scanned: rows.length, done: 0, failed: 0, skipped: 0, unsupported: 0, firstReason: null };
  for (const r of rows) {
    const res = await readBill(ctx, r.id, {
      ...(opts?.provider ? { provider: opts.provider } : {}),
      ...(opts?.userId ? { userId: opts.userId } : {}),
    });
    if (res.status === "DONE") out.done++;
    else if (res.status === "FAILED") out.failed++;
    else if (res.status === "UNSUPPORTED") out.unsupported++;
    else out.skipped++;
    if (res.status !== "DONE" && !out.firstReason) out.firstReason = res.reason;
    // ปิดผู้ช่วย/เครดิตหมด = ตัวถัดไปก็ผลเดิม → หยุดทั้งชุด
    if (res.status === "SKIPPED") break;
  }
  return out;
}
