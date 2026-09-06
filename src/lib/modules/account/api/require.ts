// require.ts — ด่านหน้าของทุกคำขอ REST บัญชี (WO A3 · แกนย้ายไป `src/lib/api/require.ts` ตอน K1.15)
//
// ไฟล์นี้เหลือแค่ "บัญชีต่อเข้าแกนกลางอย่างไร": ชนิดระบบ · ถังเพดานอัตรา · วิธีทำ actor · ข้อความไทย
// ลำดับด่านและตัวเลขทั้งหมดยังเป็นของเดิมทุกอย่าง (ข้อสอบ qc-account-api-* เฝ้าไว้)

import { requireApi, API_RATE_LIMITS, type ApiModuleConfig, type RequireResult } from "@/lib/api/require";
import type { ApiOp } from "@/lib/api/op";
import { newRequestId } from "@/lib/api/respond";
import { accountApiKeyActor } from "./actor";

export { API_RATE_LIMITS };
export type { RequireOk, RequireResult } from "@/lib/api/require";

/** บัญชีต่อเข้าแกน REST ของกลาง — ข้อความไทย/อังกฤษเป็นชุดเดิมของ WO A3 (ห้ามเปลี่ยนคำ) */
export const ACCOUNT_API_CONFIG: ApiModuleConfig = {
  module: "account",
  systemType: "ACCOUNT",
  scopePrefix: "account.",
  rateNs: "acct",
  makeActor: accountApiKeyActor,
  messages: {
    keyExpiredTh: "คีย์ API หมดอายุแล้ว — กรุณาหมุนคีย์ใหม่ที่หน้าตั้งค่าบัญชี › การเชื่อมต่อ",
    keyExpiredEn: "This API key has expired. Rotate it from the accounting settings page.",
    systemMismatchTh: "สมุดบัญชีที่ระบุใช้กับคีย์นี้ไม่ได้",
    systemMismatchEn: "The requested accounting book is not available to this API key.",
    systemRequiredTh: "คีย์นี้ไม่ได้ผูกสมุดบัญชี — ต้องส่งส่วนหัว X-Shark-System บอกว่าจะทำงานกับสมุดเล่มไหน",
    systemRequiredEn: "This key is not bound to a book. Send the X-Shark-System header with the AppSystem id.",
    scopeMissingTh: "คีย์นี้ไม่มีสิทธิ์ทำรายการนี้",
    scopeMissingEn: "This API key does not have the scope required for this operation.",
    notFoundTh: "ไม่พบปลายทางนี้ใน API บัญชี",
    notFoundEn: "No API operation matches this path.",
  },
};

export async function requireAccountApi(
  req: Request,
  op: ApiOp,
  requestId: string = newRequestId(),
): Promise<RequireResult> {
  return requireApi(req, op, ACCOUNT_API_CONFIG, requestId);
}
