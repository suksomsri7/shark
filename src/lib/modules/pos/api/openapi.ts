// openapi.ts — เอกสาร OpenAPI 3.1 ของ API ระบบขายหน้าร้าน (ใบ P2.13 · brief §4 · มติ 8)
//
// 🔴 ไม่มีรายชื่อ endpoint ของตัวเอง — อ่านจาก `POS_OPS` ล้วน ๆ (ทะเบียนเดียว หลายทางออก)
//    สิ่งที่อยู่ที่นี่คือ "คำนำของ POS" เท่านั้น: สาขา (unitId) · เงินเป็นสตางค์ · กันซ้ำ · คำสั่งอันตราย · ฮุค
import { buildOpenApi as coreBuildOpenApi, type ApiDocInfo, type OpenApiDocument } from "@/lib/api/openapi";
import type { ApiOp } from "@/lib/api/op";
import { API_RATE_LIMITS } from "@/lib/api/require";
import { WEBHOOK_EVENTS } from "@/lib/webhooks/labels";

export { jsonSchemaOf } from "@/lib/api/openapi";
export type { ApiDocInfo, JsonSchema, OpenApiDocument } from "@/lib/api/openapi";

const SERVER_URL = "https://shark.in.th/api/v1/pos";
/** เวอร์ชันของ "สัญญา" ไม่ใช่ของ build */
const API_VERSION = "1.0.0";

/** event ของ POS ที่ร้านสมัครฮุคได้ (ทะเบียนเดียวกับหน้าตั้งค่า · ตัดตัวซ้ำ) */
export function posWebhookEvents(): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of WEBHOOK_EVENTS) {
    if (!e.value.startsWith("pos.") || seen.has(e.value)) continue;
    seen.add(e.value);
    out.push(e.value);
  }
  return out;
}

const INFO_DESCRIPTION = [
  "REST API for the SHARK point of sale (POS). One API key works inside one POS system (AppSystem of type POS) and its branches (business units). It sells, refunds and voids bills exactly like the register screen does, takes and progresses online orders, manages the catalog and reads every sales report.",
  "",
  "Conventions that apply to every operation:",
  "1. Authentication is `Authorization: Bearer <api key>`. The key carries its own scopes (the POS permission keys, e.g. `pos.sale.create`); an operation returns 403 `scope_missing` when the key lacks the scope listed as `x-shark-scope` (the missing scope is in `hint`). Bundles: `pos-read`, `pos-operate`, `pos-admin`.",
  "2. `X-Shark-System` selects the POS system and is only needed when the key is not bound to one; if the key is bound and the header disagrees, the call fails with 403 `system_mismatch`.",
  "3. Branches: every list and create operation takes `unitId` (query string on GET, body otherwise). List them with `GET /units`. On operations with an `{id}` in the path `unitId` is optional - the record's own branch is used, and a different branch answers 404. A branch of another POS system or another shop answers 404 `not_found`, never 403. A key may be limited to some branches by the pseudo-scope `pos.filter.unit:<unitId>`.",
  "4. Money is an integer number of satang (1 baht = 100 satang) in every field ending in `Satang`. Prices include VAT the way the shop is set up; VAT is computed per bill (rounded half up), never per line.",
  "5. Selling: price the cart with `POST /sales/quote`, show `grandTotalSatang` to the customer, then `POST /sales` with the same lines, the payments and `expectedGrandTotalSatang`. Payments must add up to the bill total exactly (422 `validation` otherwise). If prices changed in between the sale is refused with 409 `state_conflict` and nothing is written; quote again. Payment methods: CASH, TRANSFER, PROMPTPAY, CARD and PLATFORM (platform channels only). Gift cards, store credit, deposits, member points and coupons are not available through the API. When the shop requires a manager to confirm PROMPTPAY and CARD payments (setting manualConfirmRequiresManager), the API takes only CASH, TRANSFER and PLATFORM: PROMPTPAY and CARD answer 403 `forbidden` with nothing written, until payment intents come to the API.",
  "6. Every write (POST, PATCH, PUT, DELETE) requires an `Idempotency-Key` header, except `POST /sales/quote` which writes nothing. Retrying with the same key and the same body replays the stored response with header `Idempotent-Replayed: true`; the same key with a different body fails with 409 `idempotency_conflict`. The POS also remembers the key per API key after the 24 hour replay window, so a late retry of a sale still returns the same bill instead of selling twice.",
  "7. Operations marked `x-shark-kind: danger` are hard to undo (void a bill, refund, archive a product, cancel an order). They additionally require `confirm: true` (a real boolean) and a `reason` of at least 5 characters in the body; the reason is stored in the audit log. An agent must ask a human before calling them.",
  "8. Success is `{ data, page?, requestId }`. For reads, `data` is the POS reader's answer itself (for example `GET /sales/{id}` answers the bill). Failure is `{ error: { code, message_th, message_en, hint?, details? }, requestId }` - branch on `error.code`; `message_th` is already worded for a Thai shop owner. `requestId` is also returned in the `X-Request-Id` header; quote it when reporting a problem.",
  "9. Dates: report ranges are Thai business dates `YYYY-MM-DD` (`from`, `to`, inclusive, at most 92 days; the shop's day cut-off applies). Timestamps are ISO-8601 strings in UTC.",
  "10. Paging: `GET /sales` pages with `page` and `pageSize` (10, 20 or 50) and answers `page` next to `data`; `GET /products` pages with `pageSize` and `cursor` (send `nextCursor` back). Other lists return the whole set.",
  `11. Rate limits are per key and per class: ${API_RATE_LIMITS.read.limit} reads, ${API_RATE_LIMITS.write.limit} writes and ${API_RATE_LIMITS.report.limit} reports per minute (namespace pos, separate from other SHARK modules). A 429 response carries \`Retry-After\`; successful responses carry \`X-RateLimit-Limit\` and \`X-RateLimit-Remaining\`.`,
  "12. Reports render CSV with `Accept: text/csv`: `text/csv; charset=utf-8` with a UTF-8 BOM and `Content-Disposition: attachment`, the same file as the export button of the reports screen.",
  `13. Outgoing webhooks. The shop can subscribe an endpoint to these POS events: ${posWebhookEvents().map((e) => `\`${e}\``).join(", ")}. Each delivery is \`POST\` with \`X-Shark-Event\`, a body of \`{ id, type, payload, sentAt }\` and header \`X-Shark-Signature\` = HMAC-SHA256 of the raw body with the endpoint secret, lowercase hex. Delivery is at least once, so handlers must be idempotent (\`id\` stays the same on every retry).`,
  "14. Bills sold through the API are bills of the POS: they carry `sourceModule: \"API\"` and the key id as seller, follow the shop's shift rule for sales from other sources, and appear in every report.",
].join("\n");

/** ส่วนหัวเอกสารของ API ระบบขายหน้าร้าน */
export const POS_DOC_INFO: ApiDocInfo = {
  title: "SHARK POS API",
  version: API_VERSION,
  serverUrl: SERVER_URL,
  serverDescription: "Production",
  description: INFO_DESCRIPTION,
  securityDescription: "API key created in the POS settings (POS > Settings > SHARK connections > API keys). Send it as `Authorization: Bearer <key>`.",
};

/** ทะเบียน op ของ POS → เอกสาร OpenAPI 3.1 (บริสุทธิ์ · เรียกซ้ำได้ผลเท่ากันทุกไบต์) */
export function buildOpenApi(ops: readonly ApiOp[]): OpenApiDocument {
  return coreBuildOpenApi(ops, POS_DOC_INFO);
}
