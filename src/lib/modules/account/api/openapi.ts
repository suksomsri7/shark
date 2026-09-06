// openapi.ts — เอกสาร OpenAPI 3.1 ของ API บัญชี (WO A4 · แกนย้ายไป `src/lib/api/openapi.ts` ตอน K1.15)
//
// 🔴 ทะเบียนเดียว หลายทางออก: ไฟล์นี้ไม่มีรายชื่อ endpoint ของตัวเอง — มันอ่านจาก `ACCOUNT_OPS` ล้วน ๆ
//    ⇒ เพิ่ม op = spec + คู่มือ + สกิล AI ขยับตามเอง ไม่มีเอกสารที่ "เขียนมือแล้วลืมอัป"
//    สิ่งที่เหลืออยู่ที่นี่ = "คำนำของบัญชี" (กติกาสตางค์/วันไทย/ฮุค) เท่านั้น · ตรรกะประกอบเอกสารเป็นของกลาง
//
// กติกา 2 ข้อ (บังคับที่แกนกลาง): บริสุทธิ์ (ไม่แตะ DB/เวลา/สุ่ม) · serializable (ไม่มี handler/zod หลุดออกมา)

import { buildOpenApi as coreBuildOpenApi, type ApiDocInfo, type OpenApiDocument } from "@/lib/api/openapi";
import { WEBHOOK_EVENTS } from "@/lib/webhooks/labels";
import type { ApiOp } from "./op";

export { jsonSchemaOf } from "@/lib/api/openapi";
export type {
  ApiDocInfo,
  JsonSchema,
  OpenApiDocument,
  OpenApiMediaType,
  OpenApiOperation,
  OpenApiParameter,
  OpenApiRequestBody,
  OpenApiResponse,
} from "@/lib/api/openapi";

const SERVER_URL = "https://shark.in.th/api/v1/account";
/** เวอร์ชันของ "สัญญา" ไม่ใช่ของ build — ขยับเมื่อสัญญาเปลี่ยนแบบเข้ากันไม่ได้เท่านั้น */
const API_VERSION = "1.0.0";


// ── ชิ้นส่วนคงที่ของเอกสาร ─────────────────────────────────────────────────
// WO C4 — รายชื่อ event ที่ร้านสมัครฮุคได้ ดึงจากทะเบียนเดียวกับหน้าตั้งค่า (ห้ามพิมพ์มือ = ตกหล่นแน่)
//   ใส่เฉพาะ "ค่า" (ASCII) ไม่เอาป้ายไทย — ข้อสอบ OA-1.5 บังคับให้ info.description เป็นอังกฤษล้วน
const ACCOUNT_WEBHOOK_EVENTS = WEBHOOK_EVENTS.filter((e) => e.value.startsWith("account.")).map((e) => `\`${e.value}\``);

const INFO_DESCRIPTION = [
  "REST API for the SHARK accounting module. One API key works inside one accounting book (AppSystem of type ACCOUNT).",
  "",
  "Conventions that apply to every operation:",
  "1. Money is always an integer number of satang (1 baht = 100 satang) and every money field carries a `Satang` suffix, for example `amountSatang` or `totalSatang`. Never send decimals: 1,250.50 baht is 125050.",
  "2. Dates are strings in `YYYY-MM-DD` and always mean a Thai calendar day (UTC+7), not an instant in time. Timestamps that really are instants are ISO-8601 strings in UTC.",
  "3. Authentication is `Authorization: Bearer <api key>`. The key carries its own scopes; an operation returns 403 `scope_missing` when the key lacks the scope listed as `x-shark-scope`.",
  "4. `X-Shark-System` selects the accounting book and is only needed when the key is not bound to one book. If the key is bound and the header disagrees, the call fails with 403 `system_mismatch`.",
  "5. Every write (POST, PATCH, PUT, DELETE) requires an `Idempotency-Key` header. Retrying with the same key and the same body replays the stored response with header `Idempotent-Replayed: true`; the same key with a different body fails with 409 `idempotency_conflict`.",
  "6. Operations marked `x-shark-kind: danger` are hard to undo. They additionally require `confirm: true` (a real boolean) and a `reason` of at least 5 characters in the body; the reason is stored in the audit log.",
  "7. Success is `{ data, page?, requestId }`. Failure is `{ error: { code, message_th, message_en, hint?, details? }, requestId }` - see the `Error` schema for every code. `requestId` is also returned in the `X-Request-Id` header; quote it when reporting a problem.",
  "8. Lists are paginated by page number: send `page` (1 based) and `pageSize` (1 to 100, values above 100 are clamped) as query parameters. The reply carries `page: { page, pageSize, pageCount, total, hasMore }`; keep asking while `hasMore` is true.",
  "9. Rate limits are per key and per class: 300 reads, 60 writes and 30 reports per minute. A 429 response carries `Retry-After`; successful responses carry `X-RateLimit-Remaining`.",
  "10. Some read operations can also render CSV: send `Accept: text/csv` and, when the operation lists `text/csv` under its 200 response, you get `text/csv; charset=utf-8` with a UTF-8 BOM and `Content-Disposition: attachment` instead of the JSON envelope. Every cell is safe against spreadsheet formula injection.",
  `11. Outgoing webhooks. The shop can subscribe an endpoint to any of these events: ${ACCOUNT_WEBHOOK_EVENTS.join(", ")}. Each delivery is \`POST\` with \`X-Shark-Event\`, a body of \`{ type, payload, sentAt }\` and header \`X-Shark-Signature\` = HMAC-SHA256 of the raw body with the endpoint secret, lowercase hex. Payloads follow the same satang and date rules and never carry the shop or book id. Delivery is at least once (5 retries), so handlers must be idempotent. Full list with one example body per event: docs/api/ACCOUNT-API.md, section Webhooks.`,
].join("\n");

/** ส่วนหัวเอกสารของ API บัญชี — ค่าเดิมทุกตัวอักษร (คู่มือ/สเปกต้องไม่ขยับเพราะการรีแฟกเตอร์) */
export const ACCOUNT_DOC_INFO: ApiDocInfo = {
  title: "SHARK Accounting API",
  version: API_VERSION,
  serverUrl: SERVER_URL,
  serverDescription: "Production",
  description: INFO_DESCRIPTION,
  securityDescription:
    "API key created in the accounting book settings (Connections > External apps / API). Send it as `Authorization: Bearer <key>`.",
};

/** ทะเบียน op ของบัญชี → เอกสาร OpenAPI 3.1 (บริสุทธิ์ · เรียกซ้ำได้ผลเท่ากันทุกไบต์) */
export function buildOpenApi(ops: readonly ApiOp[]): OpenApiDocument {
  return coreBuildOpenApi(ops, ACCOUNT_DOC_INFO);
}
