// http-errors.ts — คำปฏิเสธของตัวอ่าน/บริการของ HR → รหัส REST ของ `/api/v1/hr` (ใบ H4.8 · brief R5 · แบบ pos/api/http-errors.ts)
//
// กติกา (R5):
//   ตัวอ่านคืน null / "NO" / ระบบอื่น / ร้านอื่น / id ที่ไม่มี ⇒ 404 not_found **ไบต์เดียวกันทุกกรณี** (ไม่บอกว่ามีข้อมูลอยู่)
//   ค่าที่ส่งมาใช้ไม่ได้ ⇒ 422 · สถานะไม่เปิดให้ทำ ⇒ 409 state_conflict · ใบลาซ้อน ⇒ 409 duplicate
//   message_th = ข้อความไทยคงที่ของตัวอ่าน/บริการเดิม (เขียนให้เจ้าของร้านอ่านอยู่แล้ว) · message_en = ASCII ของตารางนี้
// 🔴 คำปฏิเสธที่เกิดก่อนเขียนทุกอย่างติดธง nothingWritten (ปล่อยการจองกันซ้ำ — ลองใหม่ด้วยคีย์เดิมได้)
import { ApiError, nothingWritten } from "@/lib/api/respond";
import { LEAVE_TEXT } from "../leave";

const NOT_FOUND_TH = "ไม่พบข้อมูลนี้ในระบบงานบุคคล หรือคีย์นี้ไม่มีสิทธิ์ดู";
const NOT_FOUND_EN = "Not found in this HR system, or not available to this key.";

/** 404 เดียวของทุก op — สร้างใหม่ทุกครั้ง (ธง nothingWritten ผูกกับ object) */
export const hrNotFound = (): ApiError => nothingWritten(new ApiError(404, "not_found", NOT_FOUND_TH, NOT_FOUND_EN));

/** scope ที่ handler ตรวจซ้ำ (ชนิดรายงาน · hr.leave.decide ของการยื่นแทน) — รูปเดียวกับด่านของแกน */
export const hrScopeMissing = (scope: string): ApiError =>
  nothingWritten(new ApiError(403, "scope_missing", "คีย์นี้ไม่มีสิทธิ์ทำรายการนี้ในระบบงานบุคคล", "This API key does not have the scope required for this operation.", `ต้องการสิทธิ์ ${scope}`));

/** ปฏิเสธตามกติกาของ HR ที่ scope แก้ไม่ได้ (ใบลาของเจ้าของร้าน · ของผู้ออกคีย์เอง) */
export const hrForbidden = (th: string, en: string): ApiError => nothingWritten(new ApiError(403, "forbidden", th, en));

/** ค่าที่ส่งมาใช้ไม่ได้ (ตรวจใน handler — คู่กับ 422 validation ของ zod) */
export const hrValidation = (th: string, en: string, path: string): ApiError => nothingWritten(new ApiError(422, "validation", th, en, undefined, [{ path, message: th }]));

/** ตัวอ่านปฏิเสธด้วยข้อความไทยคงที่ (ช่วงวันเกิน · ข้อมูลมากเกิน) ⇒ 422 unprocessable */
export const hrUnprocessable = (th: string): ApiError => nothingWritten(new ApiError(422, "unprocessable", th, "The HR system cannot answer this request as asked. See message_th."));

/** สถานะไม่เปิดให้ทำ (สลิปที่ยังไม่ออก/ถูกถอน · ข้อมูลสลิปไม่ครบ) ⇒ 409 state_conflict */
export const hrStateConflict = (th: string): ApiError => nothingWritten(new ApiError(409, "state_conflict", th, "The record is not in a state that allows this. See message_th."));

/** คำปฏิเสธของ `requestLeave` (HrLeaveRequestError — ข้อความไทยคงที่ ไม่มีชื่อคน) → HTTP · ใบซ้อน = 409 duplicate · อื่น ๆ = 422 */
export function leaveRefusalHttp(message: string): ApiError {
  if (message === LEAVE_TEXT.overlap) return nothingWritten(new ApiError(409, "duplicate", message, "A pending or approved leave already covers these days."));
  return nothingWritten(new ApiError(422, "unprocessable", message, "The HR system refused this leave request. See message_th."));
}
