// http-errors.ts — error ของชั้นบริการ CRM → รหัส REST ตามสัญญาใบ C1.10 (CONTRACT BLOCK "ERRORS" ของ qc-crm-c1.10)
//
// แกนกลาง (`mapError` ของ `@/lib/api/respond`) รู้จักแค่ 403/404/409 ที่โมดูลประกาศเอง + การเดาจากคำไทย
// ⇒ บริการของ CRM โยน error ที่มี `.code` ชัดเจนอยู่แล้ว (ContactsError · CompaniesError · DealsError · ActivitiesError ·
//   ObjectsError · VisibilityError · CrmForbiddenError · TeamError) — แปลที่นี่ที่เดียวให้ตรงสัญญา:
//     NOT_FOUND → 404 not_found · FORBIDDEN → 403 forbidden · VALIDATION → 422 validation (มติผู้คุมงาน C1.10 ข้อ 2) ·
//     DUPLICATE → 409 duplicate · CONFLICT/PARTIAL → 409 state_conflict · CONFIRM_REQUIRED → 409 confirm_required ·
//     STAGE_REQUIREMENTS → 409 stage_requirements (+ รายการที่ขาดใน hint) · APPROVAL_REQUIRED → 409 approval_required (+ approvalRequestId)
// 🔴 ไม่แตะแกนกลาง: เปลี่ยนความหมายของ `mapError` = เปลี่ยนคำตอบของบัญชี/บอร์ดงาน/สมาชิกไปด้วย
// 🔴 รหัส 3 ตัวของ CRM (`stage_requirements` · `approval_required` · `crm_v2_disabled`) ยังไม่อยู่ใน `API_ERROR_CODES` ของแกน
//    (ไฟล์นั้นไม่ใช่ของใบนี้) ⇒ ประกาศเป็นรายการของโมดูลที่นี่ · คู่มือ/OpenAPI ของ CRM อ่านจาก `CRM_ERROR_CODES`

import { ApiError, type ApiErrorCode, type ApiErrorDetail } from "@/lib/api/respond";

/** รหัสเพิ่มเติมที่ REST ของ CRM ตอบได้ (นอกเหนือจากรหัสกลางของแกน) */
export const CRM_ERROR_CODES = ["stage_requirements", "approval_required", "crm_v2_disabled", "payload_too_large"] as const;
export type CrmErrorCode = ApiErrorCode | (typeof CRM_ERROR_CODES)[number];

/** error ของ REST CRM ที่ระบุ status/code เอง (รวมรหัสของโมดูล) */
export function crmApiError(status: number, code: CrmErrorCode, th: string, en: string, hint?: string, details?: ApiErrorDetail[]): ApiError {
  // รหัสของโมดูลเก็บในช่องเดียวกับรหัสกลาง — ซอง `{ error: { code } }` เป็นสตริงอยู่แล้ว
  return new ApiError(status, code as ApiErrorCode, th, en, hint, details);
}

const EN: Record<string, string> = {
  NOT_FOUND: "The requested CRM record was not found in this CRM system.",
  FORBIDDEN: "This API key or user is not allowed to do that in the CRM.",
  VALIDATION: "The request was understood but a value cannot be accepted.",
  DUPLICATE: "A conflicting CRM record already exists.",
  CONFLICT: "The record is not in a state that allows this operation.",
  PARTIAL: "The operation stopped part-way; part of it was saved.",
  CONFIRM_REQUIRED: "This operation needs confirm: true and a reason.",
  STAGE_REQUIREMENTS: "The deal is missing what the target stage requires.",
  APPROVAL_REQUIRED: "The change waits for approval; nothing was applied yet.",
};

function thai(m: unknown): string | null {
  return typeof m === "string" && /[ก-๙]/.test(m) ? m : null;
}

function codeOf(e: unknown): string | null {
  if (typeof e !== "object" || e === null) return null;
  const c = (e as { code?: unknown }).code;
  if (typeof c === "string" && c) return c;
  // error ของ engine ฟิลด์ (member facade) ไม่มี `.code` แต่ชื่อชนิดบอกความหมาย
  const n = e instanceof Error ? e.name : "";
  if (n === "MemberNotFoundError") return "NOT_FOUND";
  if (n === "MemberInputError") return "VALIDATION";
  if (n === "MemberForbiddenError" || n === "ForbiddenError") return "FORBIDDEN";
  if (n === "MemberConflictError") return "CONFLICT";
  return null;
}

/**
 * AUDIT-CLASS X2: error ใด ๆ จากบริการ CRM → `ApiError` ตามสัญญา (ไม่รู้จัก = ปล่อยผ่านให้ `mapError` ของแกนจัดการ —
 * ข้อความที่ไม่ใช่ไทยไม่มีวันหลุดถึงผู้เรียก)
 */
export function toCrmApiError(e: unknown): unknown {
  if (e instanceof ApiError) return e;
  const th = thai(e instanceof Error ? e.message : null);
  const code = codeOf(e);
  if (!th || !code) return e;
  switch (code) {
    case "NOT_FOUND":
      return crmApiError(404, "not_found", th, EN.NOT_FOUND!);
    case "FORBIDDEN":
      return crmApiError(403, "forbidden", th, EN.FORBIDDEN!);
    case "VALIDATION":
      return crmApiError(422, "validation", th, EN.VALIDATION!);
    case "DUPLICATE":
      return crmApiError(409, "duplicate", th, EN.DUPLICATE!);
    case "CONFLICT":
    case "PARTIAL":
      return crmApiError(409, "state_conflict", th, EN[code]!);
    case "CONFIRM_REQUIRED":
      return crmApiError(409, "confirm_required", th, EN.CONFIRM_REQUIRED!);
    case "STAGE_REQUIREMENTS": {
      const missing = Array.isArray((e as { missing?: unknown }).missing) ? ((e as { missing: unknown[] }).missing.filter((x): x is string => typeof x === "string")) : [];
      return crmApiError(409, "stage_requirements", th, EN.STAGE_REQUIREMENTS!, missing.length ? `missing: ${missing.join(", ")}` : undefined,
        missing.map((m) => ({ path: m, message: "ต้องกรอกก่อนย้ายเข้าขั้นนี้" })));
    }
    case "APPROVAL_REQUIRED": {
      const id = (e as { approvalRequestId?: unknown }).approvalRequestId;
      return approvalRequired(th, typeof id === "string" ? id : null);
    }
    default:
      return e;
  }
}

/** 409 approval_required — `hint` บอก id ของคำขออนุมัติ (ซองของ idempotency เก็บเฉพาะ hint ไม่เก็บ details) */
export function approvalRequired(th: string, approvalRequestId: string | null): ApiError {
  return crmApiError(409, "approval_required", th, EN.APPROVAL_REQUIRED!, approvalRequestId ? `approvalRequestId=${approvalRequestId}` : undefined);
}
