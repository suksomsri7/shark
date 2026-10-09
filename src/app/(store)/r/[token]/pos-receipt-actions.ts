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
// 🔴 ไฟล์ "use server" export ได้เฉพาะ async function · คำปฏิเสธคืนเป็นข้อมูลเสมอ (จอใช้ receiptRefusalMessageKey)

import { unstable_rethrow } from "next/navigation";
import { publicReceipt, submitReceiptReview } from "@/lib/modules/pos/public-receipt";
import { reportReceiptIssue } from "@/lib/modules/pos/receipt-issue";
import { requestFullTaxInvoice } from "@/lib/modules/pos/receipt-tax-request";
import type {
  FullTaxInvoiceRequestResult,
  PublicReceiptResult,
  ReceiptRefusal,
  ReceiptReviewResult,
  ReportReceiptIssueResult,
} from "@/lib/modules/pos/receipt-public-shared";

const internal = (): ReceiptRefusal => ({ ok: false, code: "INTERNAL", message: "ระบบใบเสร็จขัดข้องชั่วคราว — ลองอีกครั้ง" });
const tokenOf = (token: unknown): string => (typeof token === "string" ? token : "");

/** อ่านใบเสร็จสาธารณะ (สำหรับรีเฟรชหลังส่งฟอร์ม) */
export async function publicReceiptAction(token: string): Promise<PublicReceiptResult> {
  try {
    return await publicReceipt(tokenOf(token));
  } catch (e) {
    unstable_rethrow(e);
    return internal();
  }
}

/** แจ้งปัญหาบิลนี้ — input = { message, contact? } */
export async function reportReceiptIssueAction(token: string, input: { message: string; contact?: string | null }): Promise<ReportReceiptIssueResult> {
  try {
    return await reportReceiptIssue(tokenOf(token), input);
  } catch (e) {
    unstable_rethrow(e);
    return internal();
  }
}

/** ขอใบกำกับภาษีเต็มรูป — input = { name, taxId, branchCode?, address, email? } */
export async function requestFullTaxInvoiceAction(
  token: string,
  input: { name: string; taxId: string; branchCode?: string | null; address: string; email?: string | null },
): Promise<FullTaxInvoiceRequestResult> {
  try {
    return await requestFullTaxInvoice(tokenOf(token), input);
  } catch (e) {
    unstable_rethrow(e);
    return internal();
  }
}

/** ให้คะแนนร้าน (บิลของสมาชิกเท่านั้น) — input = { rating 1–5, body? } */
export async function submitReceiptReviewAction(token: string, input: { rating: number; body?: string | null }): Promise<ReceiptReviewResult> {
  try {
    return await submitReceiptReview(tokenOf(token), input);
  } catch (e) {
    unstable_rethrow(e);
    return internal();
  }
}
