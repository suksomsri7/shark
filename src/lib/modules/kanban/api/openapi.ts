// openapi.ts — เอกสาร OpenAPI 3.1 ของ API บอร์ดงาน (K1.15)
//
// 🔴 ไม่มีรายชื่อ endpoint ของตัวเอง — อ่านจาก `KANBAN_OPS` ล้วน ๆ (ทะเบียนเดียว หลายทางออก)
//    สิ่งที่อยู่ที่นี่คือ "คำนำของบอร์ดงาน" เท่านั้น: กติกาตำแหน่ง/วันเวลา/บทบาทของคีย์/ฮุค
import { buildOpenApi as coreBuildOpenApi, type ApiDocInfo, type OpenApiDocument } from "@/lib/api/openapi";
import { WEBHOOK_EVENTS } from "@/lib/webhooks/labels";
import type { ApiOp } from "@/lib/api/op";

export { jsonSchemaOf } from "@/lib/api/openapi";
export type { ApiDocInfo, JsonSchema, OpenApiDocument } from "@/lib/api/openapi";

const SERVER_URL = "https://shark.in.th/api/v1/kanban";
/** เวอร์ชันของ "สัญญา" ไม่ใช่ของ build */
const API_VERSION = "1.0.0";

// รายชื่อ event ที่ร้านสมัครฮุคได้ ดึงจากทะเบียนเดียวกับหน้าตั้งค่า (ห้ามพิมพ์มือ = ตกหล่นแน่)
const KANBAN_WEBHOOK_EVENTS = WEBHOOK_EVENTS.filter((e) => e.value.startsWith("kanban.")).map((e) => `\`${e.value}\``);

const INFO_DESCRIPTION = [
  "REST API for the SHARK task board module (Kanban). One API key works inside one task board system (AppSystem of type KANBAN) and sees every board of that system.",
  "",
  "Conventions that apply to every operation:",
  "1. Authentication is `Authorization: Bearer <api key>`. The key carries its own scopes; an operation returns 403 `scope_missing` when the key lacks the scope listed as `x-shark-scope`.",
  "2. The board role of a key comes from its scopes, not from board membership: a key holding `kanban.board.member.manage` acts as ADMIN on every board, a key holding any write scope acts as EDITOR, a read-only key acts as VIEWER.",
  "3. `X-Shark-System` selects the task board system and is only needed when the key is not bound to one; if the key is bound and the header disagrees, the call fails with 403 `system_mismatch`.",
  "4. Timestamps are ISO-8601 strings in UTC (`dueAt`, `createdAt`, `completedAt`). A due date with no time means the end of that Thai calendar day as stored by the app.",
  "5. Card and column order is a fractional index string in `position`. Never compute it yourself: move a card or a column by naming its neighbours (`beforeCardId` / `afterCardId`), and the server returns the new `position`.",
  "6. Every write (POST, PATCH, PUT, DELETE) requires an `Idempotency-Key` header. Retrying with the same key and the same body replays the stored response with header `Idempotent-Replayed: true`; the same key with a different body fails with 409 `idempotency_conflict`.",
  "7. Operations marked `x-shark-kind: danger` are hard to undo (archiving a board, a column or a card, removing a member). They additionally require `confirm: true` (a real boolean) and a `reason` of at least 5 characters in the body; the reason is stored in the audit log.",
  "8. Success is `{ data, page?, requestId }`. Failure is `{ error: { code, message_th, message_en, hint?, details? }, requestId }` - see the `Error` schema for every code. `requestId` is also returned in the `X-Request-Id` header; quote it when reporting a problem.",
  "9. A board the key cannot see answers 404 `not_found`, never 403 - the API never confirms that a private board exists.",
  "10. Rate limits are per key and per class: 300 reads and 60 writes per minute. A 429 response carries `Retry-After`; successful responses carry `X-RateLimit-Remaining`.",
  "11. Some list operations can also render CSV: send `Accept: text/csv` and, when the operation lists `text/csv` under its 200 response, you get `text/csv; charset=utf-8` with a UTF-8 BOM and `Content-Disposition: attachment` instead of the JSON envelope. Every cell is safe against spreadsheet formula injection.",
  `12. Outgoing webhooks. The shop can subscribe an endpoint to any of these events: ${KANBAN_WEBHOOK_EVENTS.join(", ")}. Each delivery is \`POST\` with \`X-Shark-Event\`, a body of \`{ type, payload, sentAt }\` and header \`X-Shark-Signature\` = HMAC-SHA256 of the raw body with the endpoint secret, lowercase hex. Delivery is at least once (5 retries), so handlers must be idempotent. Full list with one example body per event: docs/api/KANBAN-API.md, section Webhooks.`,
].join("\n");

/** ส่วนหัวเอกสารของ API บอร์ดงาน */
export const KANBAN_DOC_INFO: ApiDocInfo = {
  title: "SHARK Task Board API",
  version: API_VERSION,
  serverUrl: SERVER_URL,
  serverDescription: "Production",
  description: INFO_DESCRIPTION,
  securityDescription:
    "API key created in the task board settings (Task boards > Settings > API). Send it as `Authorization: Bearer <key>`.",
};

/** ทะเบียน op ของบอร์ดงาน → เอกสาร OpenAPI 3.1 (บริสุทธิ์ · เรียกซ้ำได้ผลเท่ากันทุกไบต์) */
export function buildOpenApi(ops: readonly ApiOp[]): OpenApiDocument {
  return coreBuildOpenApi(ops, KANBAN_DOC_INFO);
}
