// openapi.ts — เอกสาร OpenAPI 3.1 ของ API ระบบสมาชิก (M1.11)
//
// 🔴 ไม่มีรายชื่อ endpoint ของตัวเอง — อ่านจาก `MEMBER_OPS` ล้วน ๆ (ทะเบียนเดียว หลายทางออก)
//    สิ่งที่อยู่ที่นี่คือ "คำนำของระบบสมาชิก" เท่านั้น: ข้อมูลอ่อนไหว · ช่องทาง · ฟิลด์กำหนดเอง · ฮุค
import { buildOpenApi as coreBuildOpenApi, type ApiDocInfo, type OpenApiDocument } from "@/lib/api/openapi";
import type { ApiOp } from "@/lib/api/op";
import { MEMBER_RATE_LIMITS } from "./rate";
import { memberAuthOf } from "./op";
import { MEMBER_OPS } from "./registry";
import { memberWebhookEvents } from "./webhook-events";

export { jsonSchemaOf } from "@/lib/api/openapi";
export type { ApiDocInfo, JsonSchema, OpenApiDocument } from "@/lib/api/openapi";

const SERVER_URL = "https://shark.in.th/api/v1/member";
/** เวอร์ชันของ "สัญญา" ไม่ใช่ของ build */
const API_VERSION = "1.0.0";

// รายชื่อ event ที่ร้านสมัครฮุคได้ ดึงจากทะเบียนเดียวกับหน้าตั้งค่า (ห้ามพิมพ์มือ = ตกหล่นแน่)
// 🔴 M3.10: ย้ายไปไฟล์ของตัวเอง (`webhook-events.ts`) — op `webhooks.*` ในทะเบียนต้องใช้ และไฟล์นี้อ่านทะเบียน
//    (อยู่ไฟล์เดียวกัน = วงกลม registry → ops/webhooks → openapi → registry) · re-export ไว้ให้ผู้เรียกเดิม
export { memberWebhookEvents, MEMBER_EVENT_PREFIXES } from "./webhook-events";
const MEMBER_WEBHOOK_EVENTS = memberWebhookEvents().map((e) => `\`${e}\``);

const INFO_DESCRIPTION = [
  "REST API for the SHARK membership module. One API key works inside one member system (AppSystem of type MEMBER) and sees every member of that system.",
  "",
  "Conventions that apply to every operation:",
  "1. Authentication is `Authorization: Bearer <api key>`. The key carries its own scopes; an operation returns 403 `scope_missing` when the key lacks the scope listed as `x-shark-scope`.",
  "2. A key belongs to one of three bundles. `member-read` may only read. `member-operate` may also register and edit members, stamp loyalty cards, issue promotions and adjust points. `member-admin` may do everything, including settings, privacy and tiers.",
  "3. **Read and operate keys never see sensitive member data.** Sections and fields the shop marked as sensitive (health notes, emergency contacts, anything under a sensitive section) come back as `visible: false` with no values at all - not even for a shop owner's own key, unless that key holds the admin bundle. An admin key is then still filtered by the shop's own sensitive-access policy.",
  "4. `X-Shark-System` selects the member system and is only needed when the key is not bound to one; if the key is bound and the header disagrees, the call fails with 403 `system_mismatch`.",
  "5. Timestamps are ISO-8601 strings in UTC (`createdAt`, `lastActivityAt`, `linkedAt`). Money is in satang (`*Satang`, 100 satang = 1 baht) and points are whole numbers.",
  "6. Phone numbers come back masked (`081-xxx-1234`) on list rows and on every card-sized shape, and identifiers of outside channels (`externalId` of a LINE or WhatsApp identity) are always masked. Send the full value when you write; you get the masked one back when you read.",
  "7. Custom fields travel as `fields: { \"<field key>\": value }` in both directions. Field keys, types and choices come from `GET /fields/layout`; a value that does not fit its field fails with 422 `validation` and the field key in `details[]`.",
  "8. Channels are a registry, not a fixed enum: read `GET /channels` for the keys accepted by consents, identities and attribution. A channel with `connected: false` still accepts an identity and a consent, but the shop cannot send messages through it yet.",
  "9. Every write (POST, PATCH, PUT, DELETE) requires an `Idempotency-Key` header. Retrying with the same key and the same body replays the stored response with header `Idempotent-Replayed: true`; the same key with a different body fails with 409 `idempotency_conflict`.",
  "10. Operations marked `x-shark-kind: danger` are hard to undo (merging two members, erasing a member under PDPA, forcing a tier by hand). They additionally require `confirm: true` (a real boolean) and a `reason` of at least 5 characters in the body; the reason is stored in the audit log. Some of them answer `{ applied: false, pending: true, approvalRequestId }` instead of doing the work, when the shop routes that action through its approval chain.",
  "11. Success is `{ data, page?, requestId }`. Failure is `{ error: { code, message_th, message_en, hint?, details? }, requestId }` - see the `Error` schema for every code. `requestId` is also returned in the `X-Request-Id` header; quote it when reporting a problem.",
  "12. A member the key cannot see answers 404 `not_found`, never 403 - the API never confirms that somebody is a member of another shop or of a branch this key does not cover.",
  `13. Rate limits are per key and per class: ${MEMBER_RATE_LIMITS.read.limit} reads and ${MEMBER_RATE_LIMITS.write.limit} writes per minute, ${MEMBER_RATE_LIMITS.report.limit} reports per minute. A 429 response carries \`Retry-After\`; successful responses carry \`X-RateLimit-Limit\` and \`X-RateLimit-Remaining\`.`,
  "14. Operations under `/me` belong to the customer themself (the LIFF and in-app self-service lane). They need a customer session token, which starts with `cs_` and is sent the same way: `Authorization: Bearer cs_...`. A shop API key calling them gets 401 `customer_session_required` and no scope opens that lane; the mirror also holds, a customer session calling any other path gets 403 `customer_scope`.",
  "15. Some list operations can also render CSV: send `Accept: text/csv` and, when the operation lists `text/csv` under its 200 response, you get `text/csv; charset=utf-8` with a UTF-8 BOM and `Content-Disposition: attachment` instead of the JSON envelope. Every cell is safe against spreadsheet formula injection.",
  `16. Outgoing webhooks. The shop can subscribe an endpoint to any of these events: ${MEMBER_WEBHOOK_EVENTS.join(", ")}. Each delivery is \`POST\` with \`X-Shark-Event\`, a body of \`{ type, payload, sentAt }\` and header \`X-Shark-Signature\` = HMAC-SHA256 of the raw body with the endpoint secret, lowercase hex. Delivery is at least once (5 retries), so handlers must be idempotent. Full list with one example body per event: docs/api/MEMBER-API.md, section Webhooks.`,
  "17. Operations under `/join/{tenantSlug}` are the public signup lane used by the shop's signup page and app: no API key, no customer session, rate limited per network, `Idempotency-Key` optional. The flow is form -> start (one time code) -> verify -> complete; verify and complete hand back a customer session `cs_...` that works on `/me` right away. The phone or email of a new member always comes from the verified code, never from the body.",
  "18. Every answer uses the same envelope, including creations: HTTP 200 and the created record in `data` (there is no 201).",
].join("\n");

/** ส่วนหัวเอกสารของ API ระบบสมาชิก */
export const MEMBER_DOC_INFO: ApiDocInfo = {
  title: "SHARK Member API",
  version: API_VERSION,
  serverUrl: SERVER_URL,
  serverDescription: "Production",
  description: INFO_DESCRIPTION,
  securityDescription:
    "API key created in the member settings (Members > Settings > API). Send it as `Authorization: Bearer <key>`.",
};

/** ตัวเลือกของ `buildOpenApi` — ไม่ส่ง = ทะเบียนเต็ม (`MEMBER_OPS`) กับเซิร์ฟเวอร์จริง */
export type MemberOpenApiOptions = {
  /** ทะเบียนที่จะเขียนเป็นเอกสาร (ข้อสอบ/คู่มือส่งชุดย่อยได้) */
  ops?: readonly ApiOp[];
  /** โดเมนของเซิร์ฟเวอร์ เช่น `https://shark.in.th` — path `/api/v1/member` ต่อท้ายให้เอง */
  baseUrl?: string;
};

const PUBLIC_DESCRIPTION =
  "Public operation: no API key and no customer session. The shop comes from `tenantSlug` in the path; calls are rate limited per network, and `Idempotency-Key` is optional.";
const CUSTOMER_DESCRIPTION =
  "Customer lane: send the customer session as `Authorization: Bearer cs_...` (from the signup or sign-in flow). A shop API key gets 401 `customer_session_required`.";

/**
 * ทะเบียน op ของระบบสมาชิก → เอกสาร OpenAPI 3.1 (บริสุทธิ์ · เรียกซ้ำได้ผลเท่ากันทุกไบต์)
 * รับได้ทั้งรายการ op (รูปเดิมของ M1.11) และตัวเลือก `{ ops?, baseUrl? }` (M3.10)
 *
 * 🔴 เลนของ op (M3.10) ต่างกันที่ security — แกนกลางเขียน `bearer` ให้ทุกตัว แล้วที่นี่ปรับตามเลน:
 *    สาธารณะ (`/join/*`) = `security: []` · ลูกค้า (`/me/*`) = scheme `customerToken` · ที่เหลือ = คีย์ของร้าน
 */
export function buildOpenApi(input: readonly ApiOp[] | MemberOpenApiOptions = {}): OpenApiDocument {
  const opts: MemberOpenApiOptions = Array.isArray(input) ? { ops: input as readonly ApiOp[] } : (input as MemberOpenApiOptions);
  const ops = opts.ops ?? MEMBER_OPS;
  const info: ApiDocInfo = opts.baseUrl
    ? { ...MEMBER_DOC_INFO, serverUrl: `${opts.baseUrl.replace(/\/+$/, "")}/api/v1/member` }
    : MEMBER_DOC_INFO;
  const doc = coreBuildOpenApi(ops, info);
  doc.components.securitySchemes.customerToken = {
    type: "http",
    scheme: "bearer",
    description: "Customer session token (`cs_...`) returned by POST /join/{tenantSlug}/verify or /complete, or by the membership card sign-in. Only valid on `/me` operations.",
  };
  for (const op of ops) {
    const operation = doc.paths[op.path]?.[op.method.toLowerCase()];
    if (!operation) continue;
    const lane = memberAuthOf(op);
    if (lane === "public") {
      operation.security = [];
      operation["x-shark-scope"] = "public";
      operation.description = `${op.label}\n\n${PUBLIC_DESCRIPTION}`;
    } else if (lane === "customer") {
      operation.security = [{ customerToken: [] }];
      operation.description = `${operation.description}\n\n${CUSTOMER_DESCRIPTION}`;
    }
  }
  return doc;
}
