// receipt-issue.ts — ลูกค้าแจ้งปัญหาบิลจากหน้าใบเสร็จออนไลน์ (POS P1.11 · R4 · CD4)
//
// 🔴 สาธารณะ (ไม่มีผู้ใช้): สิทธิ์คือโทเคนของใบเสร็จ · รับเฉพาะ {message, contact?} (คีย์อื่น = VALIDATION · ไม่รับ id ใด ๆ)
// 🔴 เพดาน 3 ครั้ง/บิล/24 ชม. นับจากแถว PosReceiptIssue เอง (ไม่มีตารางตัวนับ) — นับใต้ล็อกแถวบิล (FOR UPDATE) ⇒ ยิงพร้อมกันไม่ทะลุ
// 🔴 แถว + outbox pos.receipt.issue_reported อยู่ใน tx เดียวกัน · การ์ดบอร์ดงาน + ตอบรับทางไลน์ = consumer ที่ composition root
//    (`src/lib/pos-receipt-bridges.ts` — โมดูล POS ไม่รู้จักแชท/บอร์ดงาน · fitness F2) · audit pos.receipt.issue_reported (มติผู้คุมงาน 7)
// 🔴 ข้อความเก็บแบบตัดช่องว่าง · หน้า/การ์ดแสดงแบบ escape เสมอ
import type { Prisma } from "@prisma/client";
import { writeAudit } from "@/lib/core/audit";
import { emitOutbox } from "@/lib/core/outbox";
import { scheduleDrain } from "@/lib/outbox-consumers";
import { prisma } from "./db";
import { saleForToken } from "./receipt-token";
import {
  RECEIPT_ISSUE_CONTACT_MAX,
  RECEIPT_ISSUE_LIMIT_PER_DAY,
  RECEIPT_ISSUE_MESSAGE_MAX,
  RECEIPT_ONLINE_MESSAGES,
  textLength,
  type PublicReceiptRefusalCode,
  type ReceiptRefusal,
  type ReportReceiptIssueResult,
} from "./receipt-public-shared";

const DAY_MS = 86_400_000;
const INPUT_KEYS = new Set(["message", "contact"]);
const refuse = (code: PublicReceiptRefusalCode, message?: string): ReceiptRefusal => ({ ok: false, code, message: message ?? RECEIPT_ONLINE_MESSAGES[code] });
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** ตรวจ/ทำความสะอาด — false = VALIDATION (ข้อความ 1–500 · ติดต่อกลับ ≤120 ไม่บังคับ · ไม่มี NUL/ตัวควบคุม ยกเว้นขึ้นบรรทัดในข้อความ) */
function cleanInput(input: unknown): { message: string; contact: string | null } | false {
  if (!isRecord(input) || Object.keys(input).some((k) => !INPUT_KEYS.has(k) && input[k] !== undefined)) return false;
  if (typeof input.message !== "string") return false;
  const message = input.message.trim();
  if (!message || textLength(message) > RECEIPT_ISSUE_MESSAGE_MAX || /[\u0000-\u0009\u000B\u000C\u000E-\u001F\u007F]/.test(message)) return false;
  let contact: string | null = null;
  if (input.contact !== undefined && input.contact !== null) {
    if (typeof input.contact !== "string") return false;
    const c = input.contact.trim();
    if (textLength(c) > RECEIPT_ISSUE_CONTACT_MAX || /[\u0000-\u001F\u007F]/.test(c)) return false;
    contact = c || null;
  }
  return { message, contact };
}

/**
 * แจ้งปัญหาบิล (R4) — {ok:true, issueId} | ปฏิเสธเป็นข้อมูล (TOKEN_NOT_FOUND · VALIDATION · RATE_LIMITED · INTERNAL) · ไม่ throw
 */
export async function reportReceiptIssue(token: string, input: unknown): Promise<ReportReceiptIssueResult> {
  try {
    const clean = cleanInput(input);
    if (!clean) return refuse("VALIDATION");
    const sale = await saleForToken(token);
    if (!sale) return refuse("TOKEN_NOT_FOUND");

    const res = await prisma.$transaction(async (tx: Prisma.TransactionClient): Promise<ReportReceiptIssueResult> => {
      await tx.$queryRaw`SELECT id FROM "PosSale" WHERE id = ${sale.id} AND "tenantId" = ${sale.tenantId} FOR UPDATE`;
      const recent = await tx.posReceiptIssue.count({ where: { tenantId: sale.tenantId, saleId: sale.id, createdAt: { gt: new Date(Date.now() - DAY_MS) } } });
      if (recent >= RECEIPT_ISSUE_LIMIT_PER_DAY) return refuse("RATE_LIMITED");
      const row = await tx.posReceiptIssue.create({
        data: { tenantId: sale.tenantId, unitId: sale.unitId, saleId: sale.id, message: clean.message, contact: clean.contact },
        select: { id: true },
      });
      await emitOutbox(tx, {
        tenantId: sale.tenantId,
        type: "pos.receipt.issue_reported",
        idempotencyKey: `pos.receipt.issue_reported:${row.id}`,
        systemId: sale.systemId,
        unitId: sale.unitId,
        // payload ตามสัญญา R4 พอดี 6 คีย์ (ไม่มีช่องทางติดต่อของลูกค้า — consumer อ่านจากแถวเอง)
        payload: { tenantId: sale.tenantId, unitId: sale.unitId, saleId: sale.id, issueId: row.id, receiptNo: sale.receiptNo ?? "", message: clean.message },
      });
      return { ok: true, issueId: row.id };
    });
    if (res.ok) {
      await writeAudit({ tenantId: sale.tenantId, actorType: "SYSTEM", actorId: null, action: "pos.receipt.issue_reported", targetType: "PosSale", targetId: sale.id, after: { issueId: res.issueId, saleId: sale.id } });
      scheduleDrain();
    }
    return res;
  } catch (e) {
    console.error("[pos/receipt-issue] INTERNAL", e instanceof Error ? e.name : "Error");
    return refuse("INTERNAL");
  }
}
