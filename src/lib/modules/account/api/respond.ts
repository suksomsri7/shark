// respond.ts — ซองจดหมายกลางของ REST บัญชี (WO A3): สำเร็จ · ผิดพลาด · แปลง error ไทยเป็นรหัส
//
// สัญญาที่ผู้เรียกยึดได้ (ทั้งคู่มือ EN และสกิล AI อ่านจากที่เดียวกัน):
//   สำเร็จ  { data, page?, requestId }
//   ผิดพลาด { error: { code, message_th, message_en, hint?, details? }, requestId }
// ทุกคำตอบมีหัว `X-Request-Id` ตรงกับ `requestId` ในตัว body (ไว้ให้เจ้าของร้านอ้างเวลามาถาม)
//
// 🔴 ห้ามให้ข้อความดิบจากภายใน (Prisma / SDK / stack) หลุดถึงผู้เรียก — `mapError` กรองด้วย
//    `isSafeUserMessage` ของ errors.ts (ข้อความที่เราเขียนเองเป็นภาษาไทยเสมอ ⇒ ไม่มีไทย = ของนอก)

import { randomBytes } from "node:crypto";
import { ERR, isSafeUserMessage, safeReason } from "../errors";

/**
 * รหัส error ทั้งหมดของ API บัญชี — คู่มือ/OpenAPI/สกิล AI อ้างรายการนี้
 * 🔴 เก็บเป็น "ค่าจริง" ไม่ใช่แค่ type: generator ของ OpenAPI (WO A4) ต้องแจงเป็น enum ได้
 *    ⇒ เพิ่มรหัสใหม่ที่นี่ที่เดียว แล้วทั้ง type · enum ใน spec · ตารางในคู่มือ ขยับตามทันที
 */
export const API_ERROR_CODES = [
  "unauthorized",
  "key_expired",
  "system_required",
  "system_mismatch",
  "scope_missing",
  "invalid_json",
  "validation",
  "idempotency_required",
  "idempotency_conflict",
  "idempotency_in_progress",
  "confirm_required",
  "not_found",
  "method_not_allowed",
  "rate_limited",
  "period_locked",
  "state_conflict",
  "duplicate",
  "forbidden",
  "unprocessable",
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export type ApiErrorDetail = { path: string; message: string };

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" } as const;

/** requestId ของคำขอ — `req_` + 16 hex (ผู้เรียกยกไปแปะในตั๋วแจ้งปัญหาได้เลย) */
export function newRequestId(): string {
  return `req_${randomBytes(8).toString("hex")}`;
}

function jsonResponse(body: unknown, status: number, requestId: string, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, "X-Request-Id": requestId, ...(headers ?? {}) },
  });
}

/** ซองสำเร็จ — `page` ใส่เฉพาะ endpoint ที่แบ่งหน้า */
export function ok(
  data: unknown,
  requestId: string,
  extra: { page?: unknown; headers?: Record<string, string> } = {},
): Response {
  const body: Record<string, unknown> = { data };
  if (extra.page !== undefined) body.page = extra.page;
  body.requestId = requestId;
  return jsonResponse(body, 200, requestId, extra.headers);
}

/** body ของซองผิดพลาด (แยกออกมาเพราะ idempotency ต้องเก็บลง DB ไว้ตอบซ้ำ) */
export function failBody(
  code: ApiErrorCode,
  message_th: string,
  message_en: string,
  requestId: string,
  extra: { hint?: string; details?: ApiErrorDetail[] } = {},
): Record<string, unknown> {
  const error: Record<string, unknown> = { code, message_th, message_en };
  if (extra.hint) error.hint = extra.hint;
  if (extra.details) error.details = extra.details;
  return { error, requestId };
}

/** ซองผิดพลาด */
export function fail(
  status: number,
  code: ApiErrorCode,
  message_th: string,
  message_en: string,
  requestId: string,
  extra: { hint?: string; details?: ApiErrorDetail[]; headers?: Record<string, string> } = {},
): Response {
  return jsonResponse(failBody(code, message_th, message_en, requestId, extra), status, requestId, extra.headers);
}

export type MappedError = {
  status: number;
  code: ApiErrorCode;
  message_th: string;
  message_en: string;
};

/** ข้อความไทยกลางเมื่อ error ไม่ปลอดภัยพอจะโชว์ (กันข้อความเทคนิครั่ว) */
const GENERIC_TH = ERR.GENERIC_ACTION_FAILED;
const GENERIC_EN = "The request could not be processed.";

function isZodError(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  const o = e as { name?: unknown; issues?: unknown };
  return o.name === "ZodError" || Array.isArray(o.issues);
}

/**
 * error จากชั้น service (ข้อความไทยที่เราเขียนเอง) → status + รหัสที่ผู้เรียกแยกแยะได้
 *
 * กติกาการจับคำ (เรียงจากเฉพาะเจาะจงไปกว้าง — ลำดับนี้มีผลจริง):
 *   ขึ้นต้น "ไม่พบ"           → 404 not_found
 *   มี "ไม่มีสิทธิ์"           → 403 forbidden
 *   มี "ปิดแล้ว"/"ปิดงวด"/"ล็อก" → 409 period_locked
 *   มี "ร่าง"/"สถานะ"          → 409 state_conflict
 *   มี "ซ้ำ"                  → 409 duplicate
 *   ไทยอื่น ๆ                 → 422 unprocessable (ข้อความไทยเดิมส่งต่อได้)
 *   ไม่ใช่ไทย/ไม่รู้จัก         → 422 unprocessable + ข้อความไทยกลาง (ห้ามส่งของดิบออก)
 */
export function mapError(e: unknown): MappedError {
  if (isZodError(e)) {
    return {
      status: 422,
      code: "validation",
      message_th: "ข้อมูลที่ส่งมาไม่ถูกต้องตามรูปแบบที่กำหนด",
      message_en: "Request payload failed validation.",
    };
  }
  const raw = e instanceof Error ? e.message : "";
  if (!isSafeUserMessage(raw)) {
    return { status: 422, code: "unprocessable", message_th: GENERIC_TH, message_en: GENERIC_EN };
  }
  const th = safeReason(e, GENERIC_TH);
  if (th.startsWith("ไม่พบ")) {
    return { status: 404, code: "not_found", message_th: th, message_en: "The requested resource was not found." };
  }
  if (th.includes("ไม่มีสิทธิ์")) {
    return { status: 403, code: "forbidden", message_th: th, message_en: "This API key is not allowed to do that." };
  }
  if (th.includes("ปิดแล้ว") || th.includes("ปิดงวด") || th.includes("ล็อก")) {
    return { status: 409, code: "period_locked", message_th: th, message_en: "The accounting period is closed or locked." };
  }
  if (th.includes("ร่าง") || th.includes("สถานะ")) {
    return { status: 409, code: "state_conflict", message_th: th, message_en: "The record is not in a state that allows this operation." };
  }
  if (th.includes("ซ้ำ")) {
    return { status: 409, code: "duplicate", message_th: th, message_en: "A conflicting record already exists." };
  }
  return { status: 422, code: "unprocessable", message_th: th, message_en: "The request could not be completed." };
}
