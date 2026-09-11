// http-errors.ts — แปล error ของชั้นบริการเป็นรหัส REST ที่สัญญาชุดสามกำหนด (M3.10)
//
// แกนกลาง (`mapError`) รู้จักสถานะที่โมดูลประกาศเองแค่ 403/404/409 — error "ข้อมูลใช้ไม่ได้" ของโมดูลนี้
// (`MemberInputError` 400 · `CustomerAuthError` 400) จึงตกไปเป็น 422 `unprocessable` ตามคำไทยในข้อความ
// ⇒ op ที่สัญญาบอกว่า "ข้อมูลผิด = 400 validation" (ตัวแปรในเทมเพลต · URL ของ webhook · รหัส OTP · ฟอร์มสมัคร)
//   ห่อการเรียกบริการด้วย `as400()` ที่นี่ที่เดียว — ข้อความไทยของบริการส่งต่อถึงผู้เรียกครบทุกตัวอักษร
// 🔴 ไม่แตะแกนกลาง: การเปลี่ยนความหมายของ 400 ที่ `mapError` จะเปลี่ยนคำตอบของบัญชี/บอร์ดงานไปด้วย

import { ApiError, type ApiErrorDetail } from "@/lib/api/respond";

/** 400 `validation` พร้อมข้อความไทยที่ไม่โทษผู้ใช้ */
export function badRequest(th: string, en: string, details?: ApiErrorDetail[]): ApiError {
  return new ApiError(400, "validation", th, en, undefined, details);
}

function declaredStatus(e: unknown): number | null {
  const s = typeof e === "object" && e !== null ? (e as { status?: unknown }).status : undefined;
  return typeof s === "number" ? s : null;
}

/** ข้อความของ error ใช้ส่งถึงผู้ใช้ได้ไหม (ต้องมีอักษรไทย — ข้อความเทคนิคของไลบรารีห้ามหลุด) */
function thaiMessage(e: unknown): string | null {
  const m = e instanceof Error ? e.message : "";
  return /[ก-๙]/.test(m) ? m : null;
}

/**
 * รันงานของบริการ — error ที่บริการประกาศว่า "ข้อมูลใช้ไม่ได้" (status 400) กลายเป็น 400 `validation`
 * · ขอถี่เกิน (status 429) กลายเป็น 429 `rate_limited` · อย่างอื่นปล่อยผ่านให้แกนแปลตามปกติ
 */
export async function as400<T>(fn: () => Promise<T>, en = "The request could not be accepted as sent."): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    const status = declaredStatus(e);
    const th = thaiMessage(e);
    if (status === 400 && th) throw badRequest(th, en);
    if (status === 429 && th) throw new ApiError(429, "rate_limited", th, "Too many attempts. Wait a few minutes and try again.");
    throw e;
  }
}
