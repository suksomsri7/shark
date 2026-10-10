// openapi.ts — เอกสาร OpenAPI 3.1 ของ REST CRM (ใบ C1.10)
//
// 🔴 ไม่มีรายชื่อ endpoint ของตัวเอง — อ่านจาก `CRM_OPS` ล้วน ๆ (ทะเบียนเดียว หลายทางออก)
//    ที่นี่มีแค่ "คำนำของ CRM": ชุดสิทธิ์ · ตัวกรองคีย์ · การปิดบังข้อมูล · uiVersion · ฮุค
import { buildOpenApi as coreBuildOpenApi, type ApiDocInfo, type OpenApiDocument } from "@/lib/api/openapi";
import type { ApiOp } from "@/lib/api/op";
import { CRM_RATE_LIMITS } from "./rate";
import { CRM_OPS } from "./registry";
import { crmWebhookEvents } from "./webhook-events";
// CRM C3.8 ▸ เอกสารต่อร้าน (path จริงของทุกวัตถุ) เมื่อเรียกด้วยคีย์ CRM ◂
import { verifyApiKeyDetailed } from "@/lib/api-keys/service";
import { crmActorForKey, crmScopesCan } from "./actor";
import { crmObjectsOpenApi } from "./ops/records-dynamic";
import { checkRateLimitDb } from "@/lib/core/rate-limit-db";

export { jsonSchemaOf } from "@/lib/api/openapi";
export type { ApiDocInfo, JsonSchema, OpenApiDocument } from "@/lib/api/openapi";
export { crmWebhookEvents, CRM_EVENT_PREFIXES, CRM_INTERNAL_EVENTS } from "./webhook-events";

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
  "7. Every write (POST, PATCH, PUT, DELETE) requires an `Idempotency-Key` header. The same key with the same body replays the stored answer with `Idempotent-Replayed: true`; the same key with a different body fails with 409 `idempotency_conflict`; a parallel duplicate gets 409 `idempotency_in_progress`; a write cut by a temporary database or network failure after it started gets 409 `idempotency_outcome_unknown` on every try with that key (check whether it took effect, then use a new key). Error answers are stored and replayed too, except `confirm_required`, `stage_requirements`, `crm_v2_disabled` and `rate_limited` (raised before anything is written) - after fixing any other error send a new key.",
  "8. Operations marked `x-shark-kind: danger` (archive, merge, delete, export) also require `confirm: true` (a real boolean) and a `reason` of at least 5 characters; the reason is stored in the audit log.",
  "9. Moving a deal into a stage whose requirements are missing answers 409 `stage_requirements` with the missing items in `hint` (for example `missing: LINES`). Deal lines above the shop's discount cap answer 409 `approval_required` with `approvalRequestId=<id>` in `hint`; nothing is applied until the request is approved.",
  "10. Lists answer `{ items, nextCursor }`; send `take` (at most 100) and pass `nextCursor` back as `cursor` for the next page. Money is in satang (`*Satang`, 100 satang = 1 baht), discounts in basis points (`*Bp`), timestamps are ISO-8601.",
  `11. Rate limits are per key: ${CRM_RATE_LIMITS.read.limit} reads, ${CRM_RATE_LIMITS.write.limit} writes and ${CRM_RATE_LIMITS.report.limit} reports (forecast) per minute. A 429 carries \`Retry-After\`; successful answers carry \`X-RateLimit-Limit\` and \`X-RateLimit-Remaining\`.`,
  "12. Success is `{ data, requestId }` with HTTP 200 (also for creations). Failure is `{ error: { code, message_th, message_en, hint?, details? }, requestId }`.",
  `13. Outgoing webhooks: a shop endpoint can subscribe to ${crmWebhookEvents().map((e) => `\`${e}\``).join(", ")}. Payloads carry ids only (no phone, e-mail, name or deal title); every delivery is signed with \`X-Shark-Signature\` (HMAC-SHA256 of the body) and \`X-Shark-Signature-V2\` (HMAC-SHA256 of \`<X-Shark-Timestamp>.<body>\`). The body is \`{ id, type, payload, sentAt }\`. \`id\` (also sent as header \`X-Shark-Event-Id\`) is the event id and stays the same on every retry of that event - use it to drop duplicates. Redirects (3xx) are not followed and count as a failed delivery: register the final URL.`,
  "14. Sales teams are tenant-wide: one team list per shop, shared by every CRM system of that shop (not per system). They are also served at `/api/v1/teams` with the same operations and key. A key that is not bound to a system may omit `X-Shark-System` only when the shop has a single CRM system.",
  "15. Request bodies are capped at 1 MB (10 MB for `POST /contacts/import`); larger bodies answer 413 `payload_too_large`. Exports (`POST /contacts/export`, `POST /objects/{key}/records/export`) need a `crm.admin` key.",
  "16. A key with an owner or team filter can only create or reassign records inside that filter; anything that would land outside answers 422 `validation`.",
  // CRM C3.8 ▸ ข้อตกลงของชุดที่สาม ◂
  "17. Custom objects are dynamic: `/objects/{key}/records...` works for every object of the system the moment it is created, and `GET /objects/{key}/schema` describes the values of one object. `GET /openapi.json` called WITH a CRM key adds the concrete `/objects/<key>/records` paths of that key's system (without a key it is the static contract and carries no shop data).",
  "18. The customer portal has its own lane at `/portal/*`: it takes a customer-portal session token (`Authorization: Bearer cp_...`), never a shop key; a shop key there answers 401, a portal token on any other path answers 403. The shop side of the portal (access list, invites, revoke) lives at `/companies/{id}/portal-access`, `/companies/{id}/portal-invites` and `/portal-access/{id}/revoke`.",
  "19. Period keys of quotas and commissions are Gregorian (`2026-09`, `2026-Q3`, `2026`); a Thai Buddhist year (`2569-09`) is accepted and converted. Report exports are asynchronous jobs that only the `crm.admin` key which queued them can read.",
  "20. The whole contract is machine readable without a key: `GET /manifest.json` lists every operation, the portal lane, the AI tools and the webhook events; the OpenAPI document carries the webhook events as `x-shark-webhooks`.",
];

export const CRM_DOC_INFO: ApiDocInfo = {
  title: "SHARK CRM API",
  version: API_VERSION,
  serverUrl: SERVER_URL,
  serverDescription: "Production",
  description: CRM_DOC_DESCRIPTION.join("\n"),
  securityDescription: "API key created in the CRM settings (CRM > Settings > API). Send it as `Authorization: Bearer <key>`.",
};

/** เอกสาร OpenAPI ของ CRM = ของแกน + `x-shark-webhooks` (เหตุการณ์ที่ร้านสมัครได้ — ทะเบียนเดียวกับหน้าตั้งค่า · CRM C3.8) */
export type CrmOpenApiDocument = OpenApiDocument & { "x-shark-webhooks": string[]; "x-shark-objects"?: unknown };

/** ทะเบียน op ของ CRM → เอกสาร OpenAPI 3.1 (บริสุทธิ์ · เรียกซ้ำได้ผลเท่ากันทุกไบต์) */
export function buildOpenApi(ops: readonly ApiOp[] = CRM_OPS, baseUrl?: string): CrmOpenApiDocument {
  const info: ApiDocInfo = baseUrl ? { ...CRM_DOC_INFO, serverUrl: `${baseUrl.replace(/\/+$/, "")}/api/v1/crm` } : CRM_DOC_INFO;
  // CRM C3.8 ▸ x-shark-webhooks = crmWebhookEvents() (ข้อสอบ C3.8-S4.1) ◂
  return { ...coreBuildOpenApi(ops, info), "x-shark-webhooks": crmWebhookEvents() };
}

// CRM C3.8 ▸ `/api/v1/crm/openapi.json` ต่อผู้เรียก ◂
/**
 * ไม่มีคีย์ / คีย์ใช้ไม่ได้ / ไม่ใช่คีย์ CRM ที่อ่านรายการได้ / ระบบไม่ใช่ CRM v2 ⇒ เอกสารคงที่ (ไม่มีข้อมูลร้านใด — เหมือนเดิมทุกไบต์)
 * คีย์ CRM ที่ถือ `crm.record.read` ⇒ + path จริงของทุกวัตถุในระบบของคีย์ (`/objects/<key>/records…`) และ `x-shark-objects`
 *   ฟิลด์อ่อนไหวในสคีมาตามสิทธิ์ของคีย์ (readonly/operate ไม่เห็นเสมอ) · ไม่แคชร่วม (`keyed` ⇒ route ตอบ private, no-store)
 * AUDIT-CLASS X1: ระบบ = ระบบที่คีย์ผูก (หรือหัว X-Shark-System เมื่อคีย์ไม่ผูก และต้องเป็น CRM ของร้านเดียวกับคีย์)
 */
export async function buildOpenApiForRequest(req: Request): Promise<{ doc: CrmOpenApiDocument; keyed: boolean; retryAfterSec?: number }> {
  const base = buildOpenApi();
  const m = /^Bearer\s+(.+)$/i.exec((req.headers.get("authorization") ?? "").trim());
  const raw = m?.[1]?.trim() ?? "";
  if (!raw) return { doc: base, keyed: false };
  const v = await verifyApiKeyDetailed(raw);
  if (v.status !== "ok" || !crmScopesCan(v.key.scopes, "crm.record.read")) return { doc: base, keyed: false };
  const header = req.headers.get("x-shark-system")?.trim() || null;
  if (v.key.systemId && header && header !== v.key.systemId) return { doc: base, keyed: false };
  const systemId = v.key.systemId ?? header;
  if (!systemId) return { doc: base, keyed: false };
  // รีวิว C3.8 N3: เอกสารต่อคีย์อ่านฐาน (วัตถุ + ฟิลด์) ⇒ นับเข้าถังอ่านของคีย์ใบเดียวกับ REST (`crm:api:read:<keyId>`) · เต็ม = 429
  const rl = await checkRateLimitDb(`crm:api:read:${v.key.keyId}`, CRM_RATE_LIMITS.read);
  if (!rl.ok) return { doc: base, keyed: true, retryAfterSec: rl.retryAfterSec ?? 60 };
  const actor = crmActorForKey({ keyId: v.key.keyId, scopes: v.key.scopes, createdById: v.key.createdById });
  let extra: Awaited<ReturnType<typeof crmObjectsOpenApi>>;
  try {
    extra = await crmObjectsOpenApi({ tenantId: v.key.tenantId, systemId }, { actor, requireV2: true });
  } catch {
    return { doc: base, keyed: false };
  }
  const merged: Record<string, OpenApiDocument["paths"][string]> = { ...base.paths, ...extra.paths };
  const paths: OpenApiDocument["paths"] = {};
  for (const p of Object.keys(merged).sort()) paths[p] = merged[p]!;
  return { doc: { ...base, paths, "x-shark-objects": extra.objects }, keyed: true };
}
