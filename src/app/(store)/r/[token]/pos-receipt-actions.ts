"use server";
// pos-receipt-actions.ts — server action สาธารณะของใบเสร็จออนไลน์ POS ที่ /r/<token> (P1.11 · CD1 · R9)
//
// 🔴 ทำไมอยู่ใต้ src/app (ไม่ใช่ src/lib/modules/pos ตามตารางชื่อของข้อสอบ): action สาธารณะก่อนล็อกอินของทั้งระบบอยู่ใต้เส้นทางของหน้า
//    (บัญชี `./actions.ts` ข้างกัน · รีวิว LIFF `/m/…` · ฟอร์ม `/f/…`) — ไฟล์ *actions.ts ใต้ modules ต้องมีด่านสิทธิ์ผู้ใช้ (fitness F6.1)
//    ซึ่งหน้าที่ไม่มีผู้ใช้ไม่มีให้ตรวจ · เส้นทาง /r/[token] เป็นของหน้า (store) เดิม ⇒ ไฟล์นี้วางข้างกัน (หน้าแยกโทเคน POS 12 ตัว / บัญชี 24 ตัว = P1.11U)
//
// 🔴 ไม่มี session/คุกกี้ (ลูกค้าไม่ได้ล็อกอิน) — สิทธิ์คือโทเคนของใบเสร็จ (12 ตัว · 60 บิต · ค้นด้วย unique index เท่านั้น)
//    ⇒ ทุก action รับ token + ข้อมูลที่ลูกค้ากรอกเท่านั้น · ไม่รับ id ใด ๆ จากเบราว์เซอร์ (บริการปฏิเสธคีย์แปลกเป็น VALIDATION)
// 🔴 เพดานอยู่ในบริการ (แจ้งปัญหา 3 ครั้ง/บิล/24 ชม. · ขอใบกำกับ 1 คำขอที่เปิดอยู่/บิล · รีวิว 1 ครั้ง/บิล)
//    POS P5.2 ▸ CD-P52-F2: + เพดานต่อ IP ก่อนเรียกบริการ (public-rate.ts · ถัง pos:pub:receiptRead / receiptSubmit) — ชน = RATE_LIMITED + retryAfterSec ◂
// 🔴 ไฟล์ "use server" export ได้เฉพาะ async function · คำปฏิเสธคืนเป็นข้อมูลเสมอ (จอใช้ receiptRefusalMessageKey)

import { unstable_rethrow } from "next/navigation";
import { publicReceipt, submitReceiptReview } from "@/lib/modules/pos/public-receipt";
import { reportReceiptIssue } from "@/lib/modules/pos/receipt-issue";
import { requestFullTaxInvoice } from "@/lib/modules/pos/receipt-tax-request";
import { RECEIPT_ONLINE_MESSAGES, type PublicReceiptActionResult, type PublicReceiptResult, type ReceiptRefusal } from "@/lib/modules/pos/receipt-public-shared";
import { posPublicClientIp, posPublicRateGuard, type PosPublicRateFamily } from "@/lib/modules/pos/public-rate"; // POS P5.2 ▸ CD-P52-F2 ◂

const internal = (): ReceiptRefusal => ({ ok: false, code: "INTERNAL", message: "ระบบใบเสร็จขัดข้องชั่วคราว — ลองอีกครั้ง" });
const tokenOf = (token: unknown): string => (typeof token === "string" ? token : "");
// P1.11U F4: สำเร็จส่งกลับแค่ {ok:true} — id ภายใน (issueId/requestId/reviewId) ไม่ออกจากเซิร์ฟเวอร์
const okOnly = (r: { ok: true } | ReceiptRefusal): PublicReceiptActionResult => (r.ok ? { ok: true } : r);
// POS P5.2 ▸ CD-P52-F2: เพดานต่อ IP (อ่าน 60/นาที · ส่ง 30/นาที — public-rate.ts) ก่อนค้นโทเคน ⇒ คำตอบเดียวกันทั้งโทเคนจริง/ไม่มี ◂
async function receiptRateGuard(family: Extract<PosPublicRateFamily, "receiptRead" | "receiptSubmit">): Promise<ReceiptRefusal | null> {
  const v = await posPublicRateGuard(family, await posPublicClientIp());
  return v.ok ? null : Object.assign({ ok: false as const, code: "RATE_LIMITED" as const, message: RECEIPT_ONLINE_MESSAGES.RATE_LIMITED }, { retryAfterSec: v.retryAfterSec });
}

/** อ่านใบเสร็จสาธารณะ (สำหรับรีเฟรชหลังส่งฟอร์ม) */
export async function publicReceiptAction(token: string): Promise<PublicReceiptResult> {
  try {
    const limited = await receiptRateGuard("receiptRead"); // POS P5.2 ▸ CD-P52-F2 ◂
    if (limited) return limited;
    return await publicReceipt(tokenOf(token));
  } catch (e) {
    unstable_rethrow(e);
    return internal();
  }
}

/** แจ้งปัญหาบิลนี้ — input = { message, contact? } */
export async function reportReceiptIssueAction(token: string, input: { message: string; contact?: string | null }): Promise<PublicReceiptActionResult> {
  try {
    const limited = await receiptRateGuard("receiptSubmit"); // POS P5.2 ▸ CD-P52-F2 ◂
    if (limited) return limited;
    return okOnly(await reportReceiptIssue(tokenOf(token), input));
  } catch (e) {
    unstable_rethrow(e);
    return internal();
  }
}

/** ขอใบกำกับภาษีเต็มรูป — input = { name, taxId, branchCode?, address, email? } */
export async function requestFullTaxInvoiceAction(
  token: string,
  input: { name: string; taxId: string; branchCode?: string | null; address: string; email?: string | null },
): Promise<PublicReceiptActionResult> {
  try {
    const limited = await receiptRateGuard("receiptSubmit"); // POS P5.2 ▸ CD-P52-F2 ◂
    if (limited) return limited;
    return okOnly(await requestFullTaxInvoice(tokenOf(token), input));
  } catch (e) {
    unstable_rethrow(e);
    return internal();
  }
}

/** ให้คะแนนร้าน (บิลของสมาชิกเท่านั้น) — input = { rating 1–5, body? } */
export async function submitReceiptReviewAction(token: string, input: { rating: number; body?: string | null }): Promise<PublicReceiptActionResult> {
  try {
    const limited = await receiptRateGuard("receiptSubmit"); // POS P5.2 ▸ CD-P52-F2 ◂
    if (limited) return limited;
    return okOnly(await submitReceiptReview(tokenOf(token), input));
  } catch (e) {
    unstable_rethrow(e);
    return internal();
  }
}
