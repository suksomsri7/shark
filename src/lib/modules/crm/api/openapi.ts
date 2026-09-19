// openapi.ts — เอกสาร OpenAPI 3.1 ของ REST CRM (ใบ C1.10)
//
// 🔴 ไม่มีรายชื่อ endpoint ของตัวเอง — อ่านจาก `CRM_OPS` ล้วน ๆ (ทะเบียนเดียว หลายทางออก)
//    ที่นี่มีแค่ "คำนำของ CRM": ชุดสิทธิ์ · ตัวกรองคีย์ · การปิดบังข้อมูล · uiVersion · ฮุค
import { buildOpenApi as coreBuildOpenApi, type ApiDocInfo, type OpenApiDocument } from "@/lib/api/openapi";
import type { ApiOp } from "@/lib/api/op";
import { CRM_RATE_LIMITS } from "./rate";
import { CRM_OPS } from "./registry";
import { crmWebhookEvents } from "./webhook-events";

export { jsonSchemaOf } from "@/lib/api/openapi";
export type { ApiDocInfo, JsonSchema, OpenApiDocument } from "@/lib/api/openapi";
export { crmWebhookEvents, CRM_EVENT_PREFIXES } from "./webhook-events";

const SERVER_URL = "https://shark.in.th/api/v1/crm";
const API_VERSION = "1.0.0";

export const CRM_DOC_DESCRIPTION: readonly string[] = [
  "REST API for the SHARK CRM module (contacts, companies, deals and pipelines, activities, custom object records, sales teams). One API key works inside one CRM system (AppSystem of type CRM) and sees what its bundle and filters allow.",
  "",
  "Conventions that apply to every operation:",
  "1. Authentication is `Authorization: Bearer <api key>`. An operation answers 403 `scope_missing` when the key lacks the scope listed as `x-shark-scope`. A key with no `crm.*` scope at all (a key of another module, or an empty legacy key) is refused on every CRM operation.",
  "2. A key belongs to one of three bundles: `crm.readonly` reads only, `crm.operate` adds the work of a sales rep (contacts, companies, deals, lines, quotations, activities, records), `crm.admin` adds settings, teams, merging, archiving, deleting deals, export and cross-team reassignment. There is no implicit read: a key that only holds `crm.contact.create` cannot read contacts.",
  "3. Optional key filters narrow what a key sees: `crm.filter.team:<teamId>` (only that team's rows) and `crm.filter.owner:<userId>` (only that user's rows). Anything outside the filter answers 404, exactly like a record of another shop.",
  "4. **Read-only keys see phone numbers and e-mail addresses masked**, and read-only and operate keys never see values of fields the shop marked as sensitive.",
  "5. A record the key cannot see - another shop, another CRM system, another team - answers 404 `not_found`, never 403.",
  "6. **CRM v2 must be switched on.** While the shop still runs the previous CRM screens (`uiVersion` 1) every operation except `GET /ping` answers 409 `crm_v2_disabled` before anything is read or written.",
  "7. Every write (POST, PATCH, PUT, DELETE) requires an `Idempotency-Key` header. The same key with the same body replays the stored answer with `Idempotent-Replayed: true`; the same key with a different body fails with 409 `idempotency_conflict`; a parallel duplicate gets 409 `idempotency_in_progress`.",
  "8. Operations marked `x-shark-kind: danger` (archive, merge, delete, export) also require `confirm: true` (a real boolean) and a `reason` of at least 5 characters; the reason is stored in the audit log.",
  "9. Moving a deal into a stage whose requirements are missing answers 409 `stage_requirements` with the missing items in `hint` (for example `missing: LINES`). Deal lines above the shop's discount cap answer 409 `approval_required` with `approvalRequestId=<id>` in `hint`; nothing is applied until the request is approved.",
  "10. Lists answer `{ items, nextCursor }`; send `take` (at most 100) and pass `nextCursor` back as `cursor` for the next page. Money is in satang (`*Satang`, 100 satang = 1 baht), discounts in basis points (`*Bp`), timestamps are ISO-8601.",
  `11. Rate limits are per key: ${CRM_RATE_LIMITS.read.limit} reads, ${CRM_RATE_LIMITS.write.limit} writes and ${CRM_RATE_LIMITS.report.limit} reports (forecast) per minute. A 429 carries \`Retry-After\`; successful answers carry \`X-RateLimit-Limit\` and \`X-RateLimit-Remaining\`.`,
  "12. Success is `{ data, requestId }` with HTTP 200 (also for creations). Failure is `{ error: { code, message_th, message_en, hint?, details? }, requestId }`.",
  `13. Outgoing webhooks: a shop endpoint can subscribe to ${crmWebhookEvents().map((e) => `\`${e}\``).join(", ")}. Payloads carry ids only (no phone, e-mail, name or deal title); every delivery is signed with \`X-Shark-Signature\` (HMAC-SHA256 of the body) and \`X-Shark-Signature-V2\` (HMAC-SHA256 of \`<X-Shark-Timestamp>.<body>\`).`,
  "14. Sales teams are tenant-wide: one team list per shop, shared by every CRM system of that shop (not per system). They are also served at `/api/v1/teams` with the same operations and key. A key that is not bound to a system may omit `X-Shark-System` only when the shop has a single CRM system.",
  "15. Request bodies are capped at 1 MB (10 MB for `POST /contacts/import`); larger bodies answer 413 `payload_too_large`. Exports (`POST /contacts/export`, `POST /objects/{key}/records/export`) need a `crm.admin` key.",
  "16. A key with an owner or team filter can only create or reassign records inside that filter; anything that would land outside answers 422 `validation`.",
];

export const CRM_DOC_INFO: ApiDocInfo = {
  title: "SHARK CRM API",
  version: API_VERSION,
  serverUrl: SERVER_URL,
  serverDescription: "Production",
  description: CRM_DOC_DESCRIPTION.join("\n"),
  securityDescription: "API key created in the CRM settings (CRM > Settings > API). Send it as `Authorization: Bearer <key>`.",
};

/** ทะเบียน op ของ CRM → เอกสาร OpenAPI 3.1 (บริสุทธิ์ · เรียกซ้ำได้ผลเท่ากันทุกไบต์) */
export function buildOpenApi(ops: readonly ApiOp[] = CRM_OPS, baseUrl?: string): OpenApiDocument {
  const info: ApiDocInfo = baseUrl ? { ...CRM_DOC_INFO, serverUrl: `${baseUrl.replace(/\/+$/, "")}/api/v1/crm` } : CRM_DOC_INFO;
  return coreBuildOpenApi(ops, info);
}
