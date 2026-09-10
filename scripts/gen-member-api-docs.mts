// gen-member-api-docs.mts — สร้าง `docs/api/MEMBER-API.md` + `references/endpoints.md` ของสกิล Claude
//                            จากทะเบียน op ของระบบสมาชิก (M1.11)
//
// รัน:  pnpm exec tsx scripts/gen-member-api-docs.mts          → เขียนไฟล์
//       pnpm exec tsx scripts/gen-member-api-docs.mts --check  → exit 0 ถ้าไฟล์ตรง · 1 ถ้าเก่า
//
// 🔴 คู่มือเล่มนี้ "ห้ามเขียนมือ": ทุกบรรทัดของ endpoint มาจาก `MEMBER_OPS` ตัวเดียวกับที่ REST dispatch จริง
//    ⇒ เอกสารโกหกไม่ได้ (ข้อสอบ M1.11-S3.2 + ด่าน fitness F13.8 เฝ้าอยู่: ไฟล์ต่างจาก generator เมื่อไร = แดง)
// ไม่แตะ DB · ไม่ต่อเน็ต · ผลลัพธ์เท่ากันทุกครั้ง (`renderDocs`/`renderEndpointsReference` บริสุทธิ์)
//
// ⚠️ กติกาของระบบสมาชิก **ไม่เหมือนบอร์ดงาน** — ห้ามลอกประโยคของบอร์ดงานมาแปะ:
//    มีเงิน (`*Satang`) · มีข้อมูลส่วนบุคคลและ "ข้อมูลอ่อนไหว" ที่คีย์ read/operate ไม่มีวันเห็น ·
//    มีฟิลด์ที่ร้านสร้างเอง (`fields: { ... }`) · มีช่องทางเป็นทะเบียนไม่ใช่ enum ·
//    มีคำสั่งที่ตอบ "รออนุมัติ" แทนที่จะทำทันที
//    ⇒ หัวข้อ "Conventions" พิมพ์จาก `MEMBER_DOC_INFO.description` ตรง ๆ (แหล่งความจริงเดียวกับ OpenAPI)
//
// ภาษา: อังกฤษล้วน (ผู้อ่านคือผู้เชื่อมต่อ/agent) · ท้ายเล่มมี glossary ไทย↔อังกฤษให้เจ้าของร้านเทียบศัพท์

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { API_V1_RATE_LIMIT } from "@/lib/api-keys/route-auth";
import { API_SCOPE_BUNDLES } from "@/lib/api-keys/scopes";
import type { JsonSchema, OpenApiOperation } from "@/lib/api/openapi";
import type { ApiOp, ApiOpKind } from "@/lib/api/op";
import { API_ERROR_CODES, type ApiErrorCode } from "@/lib/api/respond";
import { MEMBER_RATE_LIMITS } from "@/lib/modules/member/api/config";
import { buildOpenApi, memberWebhookEvents } from "@/lib/modules/member/api/openapi";
import { MEMBER_OPS } from "@/lib/modules/member/api/registry";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const DOC_PATH = resolve(ROOT, "docs/api/MEMBER-API.md");
/** ตารางอ้างอิงของสกิล Claude — ทะเบียนเดียวกัน รูปแบบสั้น ไม่มีร้อยแก้ว */
const SKILL_ENDPOINTS_PATH = resolve(ROOT, ".claude/skills/shark-member-api/references/endpoints.md");
const BASE_URL = "https://shark.in.th/api/v1/member";
/** ทางเดินของ AI ภายนอก (สกิล + tool) — คนละ prefix กับ REST ของระบบสมาชิก */
const AI_BASE_URL = "https://shark.in.th/api/v1/ai";
/** id ของสกิลผู้ช่วยที่ถือ tool ของระบบสมาชิก (`src/lib/ai/skills.ts`) */
const AI_SKILL_ID = "members";
/** ชุดสิทธิ์ที่เป็นของระบบสมาชิก (ทะเบียนเดียวกับหน้าสร้างคีย์) */
const MEMBER_BUNDLES = API_SCOPE_BUNDLES.filter((b) => b.id.startsWith("member-"));

// ── ตารางรหัสข้อผิดพลาด ───────────────────────────────────────────────────
// `Record<ApiErrorCode, ...>` โดยตั้งใจ: เพิ่มรหัสใน `src/lib/api/respond.ts` แล้วลืมอธิบายที่นี่ = typecheck แดง
// 🔴 รหัสบางตัวเป็นของกลางทั้ง REST แต่ระบบสมาชิกไม่เคยตอบ — ต้องเขียนตามจริง ไม่แต่งความหมายให้
type CodeDoc = { status: number; meaning: string; action: string };
const ERROR_CODE_DOCS: Record<ApiErrorCode, CodeDoc> = {
  unauthorized: {
    status: 401,
    meaning: "No `Authorization: Bearer` header, or the key is unknown or revoked.",
    action: "Check the header spelling and that the key was not revoked in the member settings.",
  },
  key_expired: {
    status: 401,
    meaning: "The key was valid but its expiry date has passed.",
    action: "Rotate the key in the member settings; the old key stops working immediately.",
  },
  system_required: {
    status: 400,
    meaning: "The key is not bound to one member system and no `X-Shark-System` header was sent.",
    action: "Send `X-Shark-System: <AppSystem id>`, or use a key that is bound to a single system.",
  },
  system_mismatch: {
    status: 403,
    meaning: "`X-Shark-System` points at a different system than the key is bound to, or at a system that is not a member system of this shop.",
    action: "Drop the header, or send the id the key is bound to.",
  },
  scope_missing: {
    status: 403,
    meaning: "The key does not hold the scope this operation needs.",
    action: "Read `hint` for the exact scope name, then add it to the key (or pick a wider bundle) and retry.",
  },
  invalid_json: {
    status: 400,
    meaning: "The request body is not parseable JSON.",
    action: "Send valid JSON and `Content-Type: application/json`.",
  },
  validation: {
    status: 422,
    meaning: "The payload did not match the schema. `details[]` lists every offending field, custom fields included.",
    action: "Fix the fields in `details[]`. Unknown fields are rejected on purpose, so check spelling against `GET /fields/layout` too.",
  },
  idempotency_required: {
    status: 400,
    meaning: "A write was sent without the `Idempotency-Key` header.",
    action: "Generate one key per logical attempt (a UUID is fine) and send it.",
  },
  idempotency_conflict: {
    status: 409,
    meaning: "The same `Idempotency-Key` was reused with a different body.",
    action: "Use a fresh key for a different request; reuse the old key only to retry the identical one.",
  },
  idempotency_in_progress: {
    status: 409,
    meaning: "A request with this key is still running.",
    action: "Wait a moment and retry with the same key; you will get the original response.",
  },
  confirm_required: {
    status: 409,
    meaning: "A danger operation was called without `confirm: true`.",
    action: "Ask a human first, then resend with `confirm: true` and a `reason`.",
  },
  customer_session_required: {
    status: 401,
    meaning: "An operation under `/me` was called with a shop API key. That lane belongs to the customer and needs a customer session (LIFF or the mobile app).",
    action: "Use the shop-facing operation instead: `/members/{id}` reads the same person on behalf of the shop.",
  },
  not_found: {
    status: 404,
    meaning: "No such operation, or the member, field, tier, policy or link does not exist inside this member system. A member of another shop, or one outside the branches this key covers, answers this too, never 403.",
    action: "Check the path against this document, and that the id belongs to the same system the key is bound to.",
  },
  method_not_allowed: {
    status: 405,
    meaning: "The path exists but not with this HTTP method. The `Allow` header lists what works.",
    action: "Use one of the methods in `Allow`.",
  },
  rate_limited: {
    status: 429,
    meaning: `Too many calls for this key: ${MEMBER_RATE_LIMITS.read.limit} reads or ${MEMBER_RATE_LIMITS.write.limit} writes per minute, ${MEMBER_RATE_LIMITS.report.limit} reports per minute.`,
    action: "Wait `Retry-After` seconds and retry; watch `X-RateLimit-Remaining` against `X-RateLimit-Limit` to slow down before you hit it.",
  },
  period_locked: {
    status: 409,
    meaning: "Accounting specific (a closed accounting period). The member module never returns this code.",
    action: "Nothing to do here; it cannot happen on a member endpoint.",
  },
  state_conflict: {
    status: 409,
    meaning: "The record is not in a state that allows this: the member was already merged into somebody else, the tier is archived, or an erase request for that member is already waiting.",
    action: "Read the current state first (`GET /members/{id}`). A member with `mergedIntoId` set has moved; work with the surviving record.",
  },
  duplicate: {
    status: 409,
    meaning: "A conflicting record already exists: the channel account you are linking belongs to another member, or a field marked unique already holds that value.",
    action: "Read the conflict out of `message_th`, then either work with the existing member or merge the two.",
  },
  forbidden: {
    status: 403,
    meaning: "The operation is refused by a business rule, not by the scope check: merging and unlinking need a key of the admin bundle, and exporting needs `member.customer.export`.",
    action: "Read `message_en`. A wider bundle (`member-admin`) usually fixes it.",
  },
  unprocessable: {
    status: 422,
    meaning: "The request was understood but cannot be completed as asked, for example importing more rows than the limit, or moving a member to a tier they already hold.",
    action: "Read `message_en` and `message_th`; the Thai message is safe to show to the shop owner.",
  },
  upstream_unavailable: {
    status: 503,
    meaning: "An external service an operation depends on is not configured or not reachable right now.",
    action: "Retry later; this is not caused by the request itself.",
  },
};

// ── glossary ไทย ↔ อังกฤษ ─────────────────────────────────────────────────
// ศัพท์ที่เจ้าของร้านพิมพ์มา ↔ คำในสัญญา (ทุกช่องขวาต้องเป็นชื่อจริงในทะเบียน/สคีมา)
const GLOSSARY: [string, string, string][] = [
  ["ระบบสมาชิก", "member system (AppSystem of type MEMBER)", "`X-Shark-System`"],
  ["สมาชิก / ลูกค้า", "member", "`/members`"],
  ["รหัสสมาชิก", "member code shown on the card", "`memberCode`"],
  ["เบอร์แบบปิดบัง", "masked phone number", "`phoneMasked`"],
  ["ฟิลด์กำหนดเอง", "custom field", "`fields: { \"<key>\": value }`"],
  ["ส่วนของฟิลด์", "section of the profile form", "`/fields/sections`"],
  ["ข้อมูลอ่อนไหว", "sensitive data", "`sensitive` · `visible: false`"],
  ["ความยินยอม", "marketing consent per channel", "`/members/{id}/consents`"],
  ["ช่องทาง", "channel registry", "`GET /channels`"],
  ["ช่องทางที่ผูก", "linked outside identity", "`/members/{id}/identities`"],
  ["ที่มา", "acquisition source", "`source` · `/sources/report`"],
  ["ลิงก์/QR ที่มา", "trackable acquisition link", "`/sources/links`"],
  ["ระดับสมาชิก", "membership tier", "`/tiers`"],
  ["สิทธิประโยชน์", "tier benefit", "`/tiers/{id}/benefits`"],
  ["กฎเลื่อนระดับ / กฎคงระดับ", "upgrade rule / keep rule", "`/tiers/{id}/rules`"],
  ["ทดลองรัน", "dry run of the tier review", "`POST /tiers/rules/dry-run`"],
  ["คนซ้ำ / รวมคน", "duplicate pair / merge", "`/members/duplicates` · `POST /members/{id}/merge`"],
  ["ขอสำเนาข้อมูล", "PDPA data export", "`POST /members/{id}/privacy/export`"],
  ["ขอลบข้อมูล", "PDPA erasure", "`POST /members/{id}/privacy/erase`"],
  ["รออนุมัติ", "waiting for the shop's approval chain", "`{ pending: true, approvalRequestId }`"],
  ["สาขา", "business unit (branch)", "`homeUnitId` · `unitId`"],
  ["สตางค์", "satang (1/100 baht)", "`*Satang`"],
];

// ── Webhooks ──────────────────────────────────────────────────────────────
// รายชื่อ event มาจาก `src/lib/webhooks/labels.ts` ตัวเดียวกับที่หน้าตั้งค่าใช้ ⇒ คู่มือตกหล่นไม่ได้
// ตัวอย่าง body ต้องตรงกับ payload ที่ service ประกอบจริง (ดู `emitOutbox` ในไฟล์ที่อ้างถึงในแต่ละบรรทัด)
type WebhookDoc = { when: string; payload: Record<string, unknown>; pending?: true };
const WEBHOOK_EVENT_DOCS: Record<string, WebhookDoc> = {
  "member.created": {
    when: "A member was registered, whichever way it happened (a form at the counter, this REST API, an import, a signup link, the chat).",
    payload: { customerId: "cmf1cus0001", partyId: "cmf1pty0001", source: "API", referrerId: null },
  },
  "member.updated": {
    when: "A member's details changed. `changedKeys` names the fields that moved, so a handler can ignore changes it does not care about. Erasing a member under PDPA also fires this, with `changedKeys: [\"erased\"]`.",
    payload: { customerId: "cmf1cus0001", changedKeys: ["phone", "nickname"] },
  },
  "member.merged": {
    when: "Two records turned out to be the same person and were merged. Everything now hangs off `keepId`; `mergedId` still exists but is closed and points at the survivor.",
    payload: { keepId: "cmf1cus0001", mergedId: "cmf1cus0002" },
  },
  "member.identity.linked": {
    when: "An outside channel account (a LINE user, a WhatsApp number, a marketplace buyer) was attached to a member. `method` says what matched: PHONE, EMAIL or CHANNEL_ID.",
    payload: { customerId: "cmf1cus0001", channel: "LINE", externalId: "Uxxxxxxxx", method: "PHONE", identityId: "cmf1idn0001" },
  },
  "member.sensitive.viewed": {
    when: "Somebody opened sensitive member data (a health note, an emergency contact). The position they held at that moment is recorded, not the one they hold today.",
    payload: {
      customerId: "cmf1cus0001",
      userId: "cmf1usr0001",
      targetType: "SECTION",
      targetId: "cmf1sec0001",
      hrPosition: "พยาบาล",
    },
  },
  "member.tier.changed": {
    when: "A member moved to another tier: the review promoted or demoted them, somebody set it by hand, or a merge carried a tier over. `reason` says which.",
    payload: { customerId: "cmf1cus0001", from: "silver", to: "gold", reason: "RULE_UPGRADE" },
  },
  "member.tier.at_risk": {
    when: "A member has not met the keep rule of their tier and will lose it at the next review unless they buy again. Fires once per review cycle, not every night.",
    payload: { customerId: "cmf1cus0001", tier: "gold", shortfall: 250000, reviewAt: "2026-10-01T00:00:00.000Z" },
  },
  "member.consent.changed": {
    when: "A member agreed to, or withdrew consent for, being contacted through one channel. Stop sending on a `granted: false` for that channel.",
    payload: { customerId: "cmf1cus0001", channel: "LINE", granted: true, source: "LIFF", policyVersion: 3 },
  },
};

const VERIFY_SAMPLE = [
  "import { createHmac, timingSafeEqual } from \"node:crypto\";",
  "",
  "// Express style handler. Read the RAW body: any reformatting breaks the signature.",
  "export function handleSharkWebhook(rawBody: Buffer, headers: Record<string, string>) {",
  "  const expected = createHmac(\"sha256\", process.env.SHARK_WEBHOOK_SECRET!).update(rawBody).digest(\"hex\");",
  "  const got = headers[\"x-shark-signature\"] ?? \"\";",
  "  if (got.length !== expected.length || !timingSafeEqual(Buffer.from(got), Buffer.from(expected))) {",
  "    return { status: 401 };",
  "  }",
  "  const event = JSON.parse(rawBody.toString(\"utf8\")) as { type: string; payload: unknown; sentAt: string };",
  "  // Answer 2xx fast, then do the work. Anything else is retried up to 5 times.",
  "  void enqueue(event);",
  "  return { status: 200 };",
  "}",
];

function webhookSection(): string[] {
  const events = memberWebhookEvents();
  const out: string[] = [
    "## Webhooks",
    "",
    "Everything above is you calling SHARK. Webhooks are SHARK calling you: the shop owner adds an endpoint URL in the shop settings (Connections > External apps / API), ticks the events it wants, and gets a signing secret shown once.",
    "",
    "Delivery is at least once and ordered by the moment the change was committed. Events are written inside the same database transaction as the change itself, so an event exists only if the change really happened, and a change never happens without its event. A delivery that does not answer 2xx within 5 seconds is retried up to 5 times with a growing delay, so **make your handler idempotent**: key on the ids in the payload.",
    "",
    "Every event below fires wherever the change came from - a person at the counter, this REST API, an import, or an automation rule. There is no separate \"API only\" event.",
    "",
    "### Request format",
    "",
    "`POST <your url>` with `Content-Type: application/json` and these headers:",
    "",
    "| Header | Value |",
    "| --- | --- |",
    "| `X-Shark-Event` | The event type, for example `member.tier.changed`. |",
    "| `X-Shark-Signature` | `HMAC-SHA256(secret, raw request body)` as lowercase hex. |",
    "",
    "The body is always the same three fields:",
    "",
    "```json",
    JSON.stringify(
      {
        type: "member.tier.changed",
        payload: { customerId: "cmf1cus0001", from: "silver", to: "gold", reason: "RULE_UPGRADE" },
        sentAt: "2026-09-10T09:15:00.000Z",
      },
      null,
      2,
    ),
    "```",
    "",
    "`payload` never contains your shop id or member system id: the endpoint already belongs to one shop. **It also never carries personal data** - no names, no phone numbers, no field values, no health notes; only ids plus the short labels needed to route the event. Read the rest with the REST operations above, which apply the shop's own privacy rules. Instants are ISO-8601 UTC strings ending in `At`, the same convention as the REST API.",
    "",
    "### Verifying `X-Shark-Signature`",
    "",
    "1. Read the **raw** request body as bytes, before any JSON parsing or pretty printing.",
    "2. Compute `HMAC-SHA256` over those bytes with the endpoint secret; render it as lowercase hex.",
    "3. Compare with the `X-Shark-Signature` header using a constant time comparison. Reject with 401 when it differs.",
    "4. Only then parse the JSON, answer 2xx immediately and process asynchronously.",
    "",
    "```ts",
    ...VERIFY_SAMPLE,
    "```",
    "",
    "### Events",
    "",
    "| Event | Fires when |",
    "| --- | --- |",
  ];
  for (const value of events) {
    const doc = WEBHOOK_EVENT_DOCS[value];
    out.push(`| \`${value}\` | ${doc ? doc.when : "-"} |`);
  }
  out.push("");
  for (const value of events) {
    const doc = WEBHOOK_EVENT_DOCS[value];
    if (!doc) continue;
    out.push(`#### \`${value}\``, "");
    if (doc.pending) out.push("> **Not delivered yet.** The event type is registered so you can subscribe and build your handler, but no code path emits it in this release.", "");
    out.push(
      doc.when,
      "",
      "```json",
      JSON.stringify({ type: value, payload: doc.payload, sentAt: "2026-09-10T09:15:00.000Z" }, null, 2),
      "```",
      "",
    );
  }
  return out;
}

// ── helper ────────────────────────────────────────────────────────────────
/**
 * ผิวหน้าสำหรับผู้ช่วย AI — op ที่ประกาศ `tool` ในทะเบียนกลายเป็นเครื่องมือของสกิล `members`
 * (ตารางนี้ generate จากทะเบียนตัวเดียวกับ REST ⇒ เพิ่ม/ถอด tool แล้วคู่มือเปลี่ยนตามเสมอ)
 */
function aiToolSection(ops: ApiOp[]): string[] {
  const withTool = ops.filter((o) => o.tool);
  if (withTool.length === 0) return [];
  const destructive = withTool.filter((o) => o.tool?.risk === "DESTRUCTIVE");
  const out: string[] = [
    "## AI tools",
    "",
    `${withTool.length} of these operations are also exposed to the SHARK assistant as tools of the \`${AI_SKILL_ID}\` skill.`,
    "Read tools run straight away. Write and danger tools never run by themselves: they create a proposal that the shop owner confirms in the app, and only then the very same operation below is executed, with the confirming person's permissions and their name in the audit log. Danger tools need a second confirmation.",
    "",
    "The assistant reads member data as a plain staff member with no HR position, so it **never sees sensitive fields**, whatever the key that started the conversation holds.",
    "",
    `Tools carrying the destructive flag: ${destructive.length === 0 ? "none" : destructive.map((o) => `\`${o.tool!.name}\``).join(", ")}.`,
    "",
    "| Tool | Operation | Class | Scope |",
    "| --- | --- | --- | --- |",
  ];
  for (const op of [...withTool].sort((a, b) => a.tool!.name.localeCompare(b.tool!.name))) {
    out.push(`| \`${op.tool!.name}\` | \`${op.id}\` | ${op.kind} | \`${op.action}\` |`);
  }
  out.push("");
  return out;
}

/**
 * ทางเดินสำหรับ "ลูกค้าเอา AI ของตัวเองมาเสียบ"
 * ทุกตัวเลข/ชื่อในหัวข้อนี้ derive จากทะเบียนเดียวกับ REST ⇒ คู่มือโกหกไม่ได้แม้ tool จะเปลี่ยน
 */
function aiAgentSection(ops: ApiOp[]): string[] {
  const withTool = ops.filter((o) => o.tool);
  if (withTool.length === 0) return [];
  const readTools = withTool.filter((o) => o.kind === "read");
  const writeTools = withTool.filter((o) => o.kind !== "read");
  const sample = withTool.find((o) => o.id === "members.setTags") ?? writeTools[0]!;
  const sampleRead = withTool.find((o) => o.id === "members.search") ?? readTools[0]!;
  return [
    "## AI agents",
    "",
    "Bring your own model. The same tools the SHARK assistant uses are published as a skill manifest, so an outside agent (Claude, GPT, Gemini, an open model, an n8n flow) can work with the shop's members using the shop owner's API key. Nothing here is a second API: every tool call lands on the operation of the same name listed above.",
    "",
    "### Manifest",
    "",
    "```bash",
    `curl -sS "${AI_BASE_URL}/skills" -H "Authorization: Bearer $SHARK_API_KEY"`,
    `curl -sS "${AI_BASE_URL}/skills/${AI_SKILL_ID}" -H "Authorization: Bearer $SHARK_API_KEY"`,
    "```",
    "",
    `\`GET ${AI_BASE_URL}/skills\` lists the skills this shop can use. The member skill is listed only when the shop has an active member system and the key is allowed to call at least one of its tools. A shop without a member system, or a key whose scopes reach none of the tools, gets 404 from \`${AI_BASE_URL}/skills/${AI_SKILL_ID}\` - the same answer as a skill that does not exist, so nothing leaks about what is behind the wall.`,
    "",
    `\`GET ${AI_BASE_URL}/skills/${AI_SKILL_ID}\` returns the tools in OpenAI function-calling shape, so they can be handed to the model without conversion. ${withTool.length} of them come from the operations in this document (${readTools.length} read, ${writeTools.length} write or danger); the skill also carries a few older loyalty tools that predate this API.`,
    "",
    "```text",
    `{ "id": "${AI_SKILL_ID}", "label": "สมาชิก แต้ม และรางวัล", "summary": "...", "tools": [`,
    "  { \"type\": \"function\",",
    `    "function": { "name": "${sampleRead.tool!.name}", "description": "...", "parameters": { ...JSON Schema... } },`,
    "    \"write\": false },",
    "  ...",
    "] }",
    "```",
    "",
    "`parameters` is the JSON Schema of that operation's input - the very schema the REST endpoint validates against - plus any path id (`customerId`, `tierId`, ...) as a required property and an optional `systemName` string for shops that run more than one member system. Anthropic's shape is one field rename (`function.name` -> `name`, `function.parameters` -> `input_schema`). `write: true` marks a tool that changes data.",
    "",
    "### Calling a tool",
    "",
    `\`POST ${AI_BASE_URL}/tools/<tool name>\` with \`{ "args": { ... } }\`. Authentication is the same Bearer key as the REST API. Send \`X-Shark-System: <system id>\` when the key is not bound to one member system. A key may only call the tools its scopes allow; anything else answers 403 with the missing scope in \`hint\`. An unknown tool name answers 404. Bad arguments never crash the call: the answer is still 200 and \`result\` carries a Thai \`error\` string the agent can read back to the user.`,
    "",
    `Rate limit on this lane: ${API_V1_RATE_LIMIT} calls per minute per key (429 with \`retry-after\`), independent of the REST limits above.`,
    "",
    "### Read tools run straight away",
    "",
    "```bash",
    `curl -sS -X POST "${AI_BASE_URL}/tools/${sampleRead.tool!.name}" \\`,
    '  -H "Authorization: Bearer $SHARK_API_KEY" \\',
    '  -H "Content-Type: application/json" \\',
    '  -d \'{"args":{"q":"สมชาย"}}\'',
    "```",
    "",
    "```json",
    JSON.stringify(
      {
        tool: sampleRead.tool!.name,
        skill: AI_SKILL_ID,
        write: false,
        result: '{"items":[{"memberCode":"NUTD5E","name":"สมชาย ใจดี","phoneMasked":"081-xxx-0001","tier":{"key":"gold"}}],"total":1}',
      },
      null,
      2,
    ),
    "```",
    "",
    "`result` is a JSON string the model reads back to the user. Note the masked phone: the assistant lane never returns a full phone number or a sensitive field.",
    "",
    "### Write tools return a proposal, not a change",
    "",
    "An outside agent can never change a member on its own, even with a valid key. A write or danger tool creates a **proposal** (`summary` is Thai, written for the owner) that the shop owner confirms in the SHARK app or website. Only then does the operation run, with the confirming person's permissions and their name in the audit log; danger tools ask a second time.",
    "",
    "```bash",
    `curl -sS -X POST "${AI_BASE_URL}/tools/${sample.tool!.name}" \\`,
    '  -H "Authorization: Bearer $SHARK_API_KEY" \\',
    '  -H "Content-Type: application/json" \\',
    '  -d \'{"args":{"customerId":"cus_123","add":["vip"]}}\'',
    "```",
    "",
    "```json",
    JSON.stringify(
      {
        tool: sample.tool!.name,
        skill: AI_SKILL_ID,
        write: true,
        pendingConfirmation: true,
        conversationId: "cnv_8f2a",
        result: `{"proposalId":"prp_41c9","summary":"${sample.label} · สมาชิก \\"สมชาย ใจดี\\" · เพิ่มแท็ก vip","waiting":"user_confirm"}`,
      },
      null,
      2,
    ),
    "```",
    "",
    "Nothing changed yet. The owner opens the conversation, reads the Thai summary and taps confirm; only then is the tag written. Tell the user the request is waiting for their confirmation - never report the change as done until a later read tool shows it.",
    "",
    "If a member must be changed without a human in the loop, use the REST operations above instead: they execute immediately, and the key's scopes are the only gate.",
    "",
  ];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function schemaTypeLabel(schema: JsonSchema): string {
  if (Array.isArray(schema.enum)) return `enum(${schema.enum.map((v) => JSON.stringify(v)).join(", ")})`;
  const t = schema.type;
  if (typeof t === "string") {
    if (t === "array" && isRecord(schema.items)) return `array of ${schemaTypeLabel(schema.items)}`;
    return t;
  }
  // `nullable` ของ zod v4 → anyOf [ชนิดจริง, null] ⇒ บอกชนิดจริงแล้วต่อท้ายว่า null ได้ (อ่านง่ายกว่า "one of")
  const union = Array.isArray(schema.anyOf) ? schema.anyOf : Array.isArray(schema.oneOf) ? schema.oneOf : null;
  if (union) {
    const parts = union.filter(isRecord);
    const nullable = parts.some((p) => p.type === "null");
    const rest = parts.filter((p) => p.type !== "null");
    if (nullable && rest.length === 1) return `${schemaTypeLabel(rest[0]!)} or null`;
    return "one of several shapes";
  }
  return "any";
}

/** ข้อจำกัดที่ผู้เรียกต้องรู้ ไม่ใช่ทั้ง schema (คู่มืออ่านง่ายกว่าเมื่อเห็นเฉพาะกฎ) */
function schemaRules(schema: JsonSchema): string {
  const rules: string[] = [];
  const union = Array.isArray(schema.anyOf) ? schema.anyOf : Array.isArray(schema.oneOf) ? schema.oneOf : null;
  const inner = union?.filter(isRecord).find((p) => p.type !== "null");
  const description =
    typeof schema.description === "string"
      ? schema.description
      : inner && typeof inner.description === "string"
        ? inner.description
        : null;
  if (description) rules.push(description);
  const src = isRecord(inner) && schema.type === undefined ? inner : schema;
  if (typeof src.minLength === "number") rules.push(`min length ${src.minLength}`);
  if (typeof src.maxLength === "number") rules.push(`max length ${src.maxLength}`);
  if (typeof src.minimum === "number" && src.minimum > Number.MIN_SAFE_INTEGER) rules.push(`min ${src.minimum}`);
  if (typeof src.maximum === "number" && src.maximum < Number.MAX_SAFE_INTEGER) rules.push(`max ${src.maximum}`);
  if (typeof src.format === "string") rules.push(`format ${src.format}`);
  if (typeof src.maxItems === "number") rules.push(`max ${src.maxItems} items`);
  return rules.join(" · ") || "-";
}

/**
 * ค่าตัวอย่างที่ "ผ่าน schema จริง" — เอาไปวางใน curl แล้วยิงได้เลย (หลังแทน id ของจริง)
 * ตารางชื่อ→ค่าเป็นเพียงตัวอย่างที่อ่านรู้เรื่อง ไม่ใช่ฟิลด์ใหม่: ทุกชื่อมาจากสคีมาของ op เอง
 */
const SAMPLE_BY_NAME: Record<string, unknown> = {
  reason: "reason for the audit log",
  q: "somchai",
  ids: "cus_123,cus_456",
  phone: "0812345678",
  email: "somchai@example.com",
  firstName: "สมชาย",
  lastName: "ใจดี",
  name: "สมชาย ใจดี",
  label: "ระดับน้ำลึก",
  key: "cert_level",
  sectionId: "sec_123",
  tierDefId: "tier_123",
  mergeId: "cus_456",
  channel: "LINE",
  externalId: "Uxxxxxxxxxxxxxxxx",
  columns: ["memberCode", "name"],
  add: ["vip"],
  remove: [],
  from: "OPEN_WATER",
  to: "OWD",
  bodyHtml: "<p>นโยบายความเป็นส่วนตัวของร้าน</p>",
  roles: ["OWNER", "MANAGER"],
  targetId: "sec_123",
  mapping: { "เบอร์โทร": "phone", "ชื่อ": "firstName" },
  rows: [{ "เบอร์โทร": "0812345678", "ชื่อ": "สมชาย" }],
  benefits: [{ type: "DISCOUNT_PCT", config: { pct: 10 } }],
  conditions: [{ field: "spent12m", op: "gte", value: 1000000 }],
  utm: { utm_source: "facebook" },
};

/** ตัวอย่างที่ชื่อฟิลด์เดียวกันแต่ความหมายต่างกันตาม op */
const SAMPLE_BY_OP_FIELD: Record<string, unknown> = {
  "tiers.create.key": "gold",
  "tiers.create.name": "ทอง",
  "fields.sections.create.key": "health",
  "fields.sections.create.label": "ข้อมูลสุขภาพ",
  "sources.links.create.name": "QR หน้าร้านป่าตอง",
  "members.create.name": "สมชาย ใจดี",
};

function sampleValue(name: string, schema: JsonSchema, opId?: string): unknown {
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];
  const perOp = opId === undefined ? undefined : SAMPLE_BY_OP_FIELD[`${opId}.${name}`];
  if (perOp !== undefined) return perOp;
  const known = SAMPLE_BY_NAME[name];
  if (known !== undefined) return known;
  const t = typeof schema.type === "string" ? schema.type : "string";
  if (t === "integer" || t === "number") return typeof schema.minimum === "number" ? schema.minimum : 0;
  if (t === "boolean") return true;
  if (t === "array") return [];
  if (t === "object") return {};
  const min = typeof schema.minLength === "number" ? schema.minLength : 0;
  const base = `example ${name}`;
  return base.length >= min ? base : base.padEnd(min, "x");
}

function bodySchemaOf(operation: OpenApiOperation): JsonSchema | null {
  const schema = operation.requestBody?.content["application/json"]?.schema;
  return schema && isRecord(schema) ? schema : null;
}

function fieldTable(schema: JsonSchema): string[] {
  if (!isRecord(schema.properties) || Object.keys(schema.properties).length === 0) return [];
  const required = new Set(
    Array.isArray(schema.required) ? schema.required.filter((r): r is string => typeof r === "string") : [],
  );
  const lines = ["| Field | Type | Required | Rules |", "| --- | --- | --- | --- |"];
  for (const [name, raw] of Object.entries(schema.properties)) {
    const prop = isRecord(raw) ? raw : {};
    lines.push(`| \`${name}\` | ${schemaTypeLabel(prop)} | ${required.has(name) ? "yes" : "no"} | ${schemaRules(prop)} |`);
  }
  return lines;
}

function queryTable(operation: OpenApiOperation): string[] {
  const query = operation.parameters.filter((p) => p.in === "query");
  if (query.length === 0) return [];
  const lines = ["| Query | Type | Required | Rules |", "| --- | --- | --- | --- |"];
  for (const p of query) {
    lines.push(`| \`${p.name}\` | ${schemaTypeLabel(p.schema)} | ${p.required ? "yes" : "no"} | ${schemaRules(p.schema)} |`);
  }
  return lines;
}

/** path template → path จริงที่ยิงได้ (ตัวอย่างใช้ `123` แทน id เพื่อไม่ให้ดูเหมือน id ของร้านจริง) */
function samplePath(op: ApiOp): string {
  return op.path.replace(/\{[A-Za-z0-9_]+\}/g, "123");
}

function queryString(operation: OpenApiOperation): string {
  const required = operation.parameters.filter((p) => p.in === "query" && p.required);
  if (required.length === 0) return "";
  return "?" + required.map((p) => `${p.name}=${encodeURIComponent(String(sampleValue(p.name, p.schema)))}`).join("&");
}

function curlExample(op: ApiOp, operation: OpenApiOperation): string[] {
  const lines = [`curl -sS -X ${op.method} "${BASE_URL}${samplePath(op)}${queryString(operation)}" \\`];
  lines.push(`  -H "Authorization: Bearer $SHARK_API_KEY" \\`);
  if (op.kind !== "read") lines.push(`  -H "Idempotency-Key: $(uuidgen)" \\`);
  const body = op.method === "GET" ? null : bodySchemaOf(operation);
  if (body && isRecord(body.properties) && Object.keys(body.properties).length > 0) {
    lines.push(`  -H "Content-Type: application/json" \\`);
    const required = new Set(
      Array.isArray(body.required) ? body.required.filter((r): r is string => typeof r === "string") : [],
    );
    const sample: Record<string, unknown> = {};
    for (const [name, raw] of Object.entries(body.properties)) {
      if (!required.has(name)) continue;
      sample[name] = sampleValue(name, isRecord(raw) ? raw : {}, op.id);
    }
    // คำสั่งอันตรายต้องมีสองช่องนี้เสมอ ไม่งั้นตัวอย่างที่ให้ไปยิงแล้วได้ 409 ทันที
    if (op.kind === "danger") {
      sample.confirm = true;
      if (sample.reason === undefined) sample.reason = "reason for the audit log";
    }
    lines.push(`  -d '${JSON.stringify(sample)}'`);
  } else if (op.kind === "danger") {
    lines.push(`  -H "Content-Type: application/json" \\`);
    lines.push(`  -d '${JSON.stringify({ confirm: true, reason: "reason for the audit log" })}'`);
  } else {
    lines[lines.length - 1] = lines[lines.length - 1]!.replace(/ \\$/, "");
  }
  return lines;
}

const KIND_SECTIONS: { kind: ApiOpKind; title: string; blurb: string }[] = [
  { kind: "read", title: "Read operations", blurb: "Safe to call at any time. No `Idempotency-Key`, nothing is written, nothing is audited." },
  { kind: "write", title: "Write operations", blurb: "Change data. `Idempotency-Key` is required and every success is written to the audit log with the key name." },
  { kind: "danger", title: "Danger operations", blurb: "Hard or impossible to undo. On top of the write rules they need `confirm: true` and a `reason` of at least 5 characters. An AI agent must ask a human before calling these." },
];

// ── ตัวเรนเดอร์ endpoints.md ของสกิล Claude ─────────────────────────────────
// ตารางล้วน ไม่มีร้อยแก้ว: ให้ agent ที่อ่าน SKILL.md ไล่หา "METHOD path + scope" ของงานหนึ่ง ๆ ได้เร็ว
// สร้างจากทะเบียนเดียวกับ renderDocs() ⇒ เพิ่ม/ลบ op แล้วไฟล์นี้ตามเอง (ข้อสอบ M1.11-S3.3 ยึดไว้)
export function renderEndpointsReference(ops: ApiOp[] = MEMBER_OPS): string {
  const out: string[] = [];
  out.push(
    "# SHARK Member API — endpoint reference",
    "",
    "Generated from the operation registry by `scripts/gen-member-api-docs.mts` (`--check` covers this file too). Do not edit by hand.",
    "",
    `Base URL: \`${BASE_URL}\`. ${ops.length} operations. Full prose, field tables and curl examples: \`docs/api/MEMBER-API.md\` (also served at \`https://shark.in.th/developers/member.md\`). Machine readable contract: \`/api/v1/member/openapi.json\`.`,
    "",
  );
  for (const section of KIND_SECTIONS) {
    const group = ops.filter((o) => o.kind === section.kind).sort((a, b) => (a.path + a.method).localeCompare(b.path + b.method));
    if (group.length === 0) continue;
    out.push(`## ${section.title}`, "", section.blurb, "", "| Operation id | Method + path | Scope | AI tool |", "| --- | --- | --- | --- |");
    for (const op of group) {
      out.push(`| \`${op.id}\` | \`${op.method} ${op.path}\` | \`${op.action}\` | ${op.tool ? `\`${op.tool.name}\`` : "-"} |`);
    }
    out.push("");
  }
  return out.join("\n");
}

// ── ตัวเรนเดอร์ (บริสุทธิ์) ─────────────────────────────────────────────────
export function renderDocs(ops: ApiOp[] = MEMBER_OPS): string {
  const spec = buildOpenApi(ops);
  const out: string[] = [];
  const push = (...lines: string[]) => out.push(...lines);
  const csvOps = ops.filter((o) => o.csv);

  // 5 บรรทัดแรกต้องเป็นอังกฤษล้วน — ผู้อ่านคนแรกคือ agent/นักพัฒนา
  push(
    `# ${spec.info.title}`,
    "",
    `Machine readable contract: \`/api/v1/member/openapi.json\` (OpenAPI ${spec.openapi}, no API key needed).`,
    `Base URL: \`${BASE_URL}\` - contract version ${spec.info.version} - ${ops.length} operations.`,
    "Generated from the operation registry by `scripts/gen-member-api-docs.mts`. Do not edit by hand: run the script.",
    "",
  );

  // ── Who this is for ─────────────────────────────────────────────────
  push(
    "## Who this is for",
    "",
    "- **AI agents** working with a shop's members on behalf of its owner. Read the Conventions and the Error codes table first: every failure has a stable `code` to branch on, and `message_th` is already worded for a Thai shop owner, so it can be shown as is.",
    "- **Developers** wiring another system into the membership (a website signup form, a POS of your own, a marketplace connector, a loyalty screen, a nightly report). Everything in this document is generated from the same registry the live API dispatches from, so nothing here can drift from the running code.",
    "",
    "**Before anything else: this API carries personal data.** Names, phone numbers, birthdays, and whatever the shop decided to keep about its customers. Keys are per shop and per system, every read of a sensitive field is logged, and the shop can be asked by its customers to prove who saw what. Take only the fields you need, keep them no longer than you must, and never move them to a third party the shop did not name.",
    "",
  );

  // ── Auth & scopes ───────────────────────────────────────────────────
  push(
    "## Authentication and scopes",
    "",
    "Send `Authorization: Bearer <api key>`. Keys are created by the shop owner in the member settings (Members > Settings > API); the raw key is shown once.",
    "",
    "A key carries a list of scopes. Scopes are the same permission keys the human roles use, so a key can never do more than a person could. Bundles are ready made sets; the owner can still tick single scopes on top.",
    "",
    "| Bundle | What it can do | Scopes |",
    "| --- | --- | --- |",
  );
  for (const b of MEMBER_BUNDLES) {
    push(`| \`${b.id}\` | ${b.summary} | ${b.scopes.map((s) => `\`${s}\``).join(" ")} |`);
  }
  push(
    "",
    "### Sensitive data and the bundle",
    "",
    "A shop can mark any section or field of the member profile as **sensitive**: health notes, an emergency contact, anything it decides. Who may open those is a policy the shop owns (by role, by HR position, by department, optionally only inside the viewer's own branch), and every view is written to an access log.",
    "",
    "| Bundle | Sensitive fields |",
    "| --- | --- |",
    "| `member-read` | Never. The section comes back as `visible: false` with no values at all. |",
    "| `member-operate` | Never, same as above. |",
    "| `member-admin` | Only when the shop's own policy allows it. |",
    "",
    "This is not a scope you can add: it is decided by the bundle, on purpose. An integration that needs a health note has to be run by a person the shop trusted with it, not by a key left in a config file.",
    "",
    "A key also **sees every member of the system it is bound to**, across branches: the shop owner issued the key and chose its scopes. A member of another shop, or of another member system, answers 404 - never 403.",
    "",
    "A key is normally bound to one member system. If it is not, every call must carry `X-Shark-System: <AppSystem id>`. Calls that need a scope the key lacks fail with 403 `scope_missing` and the missing scope in `hint`.",
    "",
  );

  // ── Conventions ─────────────────────────────────────────────────────
  // 🔴 พิมพ์จาก `MEMBER_DOC_INFO.description` ตรง ๆ — คู่มือกับ OpenAPI จึงพูดตรงกันเสมอทุกไบต์
  push("## Conventions", "", "These are the rules of the module, copied verbatim from the contract description in `/api/v1/member/openapi.json`:", "");
  for (const line of spec.info.description.split("\n")) push(line);
  push("");
  push(
    "### Shapes of a reply",
    "",
    "- **`GET /members` pages.** `data` is `{ items, total, page, take }`; ask for the next page with `page=2`. `take` is 1-100 (default 50). Other lists answer `{ items, total }` in `data` without paging.",
    "- **Custom fields travel in `fields`.** Both directions, keyed by the field key from `GET /fields/layout`. A profile read groups them into `sections[]` instead, because a section can be hidden as a whole.",
    "- **No `Date` objects and no shop ids leak out.** Timestamps are ISO-8601 UTC strings or `null`; `tenantId` and `systemId` are never echoed back - the key already knows where it is.",
    "- **Personal identifiers come back reduced.** `phoneMasked` on every card sized shape, and the `externalId` of a linked channel account is masked. The full phone is on the profile itself, for the operations that legitimately need it.",
    `- **CSV.** ${csvOps.length === 0 ? "No operation renders CSV." : `${csvOps.length === 1 ? "One operation renders" : `${csvOps.length} operations render`} CSV when asked with \`Accept: text/csv\`: ${csvOps.map((o) => `\`${o.method} ${o.path}\``).join(", ")}. The file is UTF-8 with a BOM and comes back as an attachment instead of the JSON envelope. \`POST /members/export\` is the other way out: it returns the CSV inline in \`csv\` and is audited.`}`,
    "- **Some writes answer \"waiting\".** When the shop routes an action through its approval chain, the reply is `{ applied: false, pending: true, approvalRequestId }` with HTTP 200. The work has **not** happened; somebody in the shop has to approve it. Poll the member, or subscribe to the matching webhook, instead of assuming success.",
    "",
  );

  // ── Error codes ─────────────────────────────────────────────────────
  push(
    "## Error codes",
    "",
    "Branch on `error.code`, never on the message text. The list is shared by every SHARK REST module, so a few codes below can only come from another module; they are marked as such.",
    "",
    "| Code | HTTP | Meaning | What to do |",
    "| --- | --- | --- | --- |",
  );
  for (const code of API_ERROR_CODES) {
    const d = ERROR_CODE_DOCS[code];
    push(`| \`${code}\` | ${d.status} | ${d.meaning} | ${d.action} |`);
  }
  push("");

  // ── Operations ──────────────────────────────────────────────────────
  push("## Operations", "");
  for (const section of KIND_SECTIONS) {
    const group = ops.filter((o) => o.kind === section.kind).sort((a, b) => (a.path + a.method).localeCompare(b.path + b.method));
    if (group.length === 0) continue;
    push(`### ${section.title}`, "", `${section.blurb} ${group.length} of the ${ops.length} operations.`, "");
    for (const op of group) {
      const operation = spec.paths[op.path]?.[op.method.toLowerCase()];
      if (!operation) continue;
      push(`#### \`${op.id}\``, "");
      const toolNote = op.tool ? ` · AI tool: \`${op.tool.name}\`` : "";
      const csvNote = op.csv ? " · `Accept: text/csv` supported" : "";
      push(`**${op.method} ${op.path}** - ${op.summary} · scope: \`${op.action}\` · ${op.kind}${toolNote}${csvNote}`, "");
      const pathParams = operation.parameters.filter((p) => p.in === "path");
      if (pathParams.length > 0) {
        push(`Path parameters: ${pathParams.map((p) => `\`${p.name}\``).join(", ")} (required).`, "");
      }
      const table = op.method === "GET" ? queryTable(operation) : fieldTable(bodySchemaOf(operation) ?? {});
      if (table.length > 0) push(...table, "");
      else push(op.method === "GET" ? "No query parameters." : "No body fields.", "");
      push("```bash", ...curlExample(op, operation), "```", "");
    }
  }

  // ── AI tools ────────────────────────────────────────────────────────
  push(...aiToolSection(ops));

  // ── AI agents (ทางเดิน /api/v1/ai/*) ────────────────────────────────
  push(...aiAgentSection(ops));

  // ── Webhooks ────────────────────────────────────────────────────────
  push(...webhookSection());

  // ── Glossary ────────────────────────────────────────────────────────
  push(
    "## Glossary (Thai <-> English membership terms)",
    "",
    "Field names and codes in this API are English. This table maps them to the Thai words a shop owner or a staff member uses.",
    "",
    "| ไทย | English | In the API |",
    "| --- | --- | --- |",
  );
  for (const [th, en, field] of GLOSSARY) push(`| ${th} | ${en} | ${field} |`);
  push("");

  return out.join("\n");
}

// ── CLI ───────────────────────────────────────────────────────────────────
const invokedDirectly =
  typeof process.argv[1] === "string" && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  const markdown = renderDocs();
  const endpointsRef = renderEndpointsReference();
  if (process.argv.includes("--check")) {
    const current = existsSync(DOC_PATH) ? readFileSync(DOC_PATH, "utf8") : "";
    const currentRef = existsSync(SKILL_ENDPOINTS_PATH) ? readFileSync(SKILL_ENDPOINTS_PATH, "utf8") : "";
    const docOk = current === markdown;
    const refOk = currentRef === endpointsRef;
    if (docOk && refOk) {
      console.log(`✅ docs/api/MEMBER-API.md + skill endpoints.md ตรงกับทะเบียน (${MEMBER_OPS.length} op)`);
      process.exit(0);
    }
    if (!docOk) {
      console.error(
        `❌ docs/api/MEMBER-API.md ไม่ตรงกับทะเบียน (${current.length} ไบต์บนดิสก์ vs ${markdown.length} ไบต์ที่ควรเป็น)\n` +
          "   แก้ด้วย: pnpm exec tsx scripts/gen-member-api-docs.mts",
      );
    }
    if (!refOk) {
      console.error(
        `❌ .claude/skills/shark-member-api/references/endpoints.md ไม่ตรงกับทะเบียน (${currentRef.length} ไบต์บนดิสก์ vs ${endpointsRef.length} ไบต์ที่ควรเป็น)\n` +
          "   แก้ด้วย: pnpm exec tsx scripts/gen-member-api-docs.mts",
      );
    }
    process.exit(1);
  }
  mkdirSync(dirname(DOC_PATH), { recursive: true });
  writeFileSync(DOC_PATH, markdown, "utf8");
  mkdirSync(dirname(SKILL_ENDPOINTS_PATH), { recursive: true });
  writeFileSync(SKILL_ENDPOINTS_PATH, endpointsRef, "utf8");
  console.log(
    `✅ เขียน docs/api/MEMBER-API.md + skill endpoints.md (${MEMBER_OPS.length} op · ${markdown.length} ไบต์ / ${endpointsRef.length} ไบต์)`,
  );
}
