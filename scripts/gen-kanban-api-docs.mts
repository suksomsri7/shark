// gen-kanban-api-docs.mts — สร้าง `docs/api/KANBAN-API.md` + `references/endpoints.md` ของสกิล Claude
//                            จากทะเบียน op ของบอร์ดงาน (K1.15 · D15/D18)
//
// รัน:  pnpm exec tsx scripts/gen-kanban-api-docs.mts          → เขียนไฟล์
//       pnpm exec tsx scripts/gen-kanban-api-docs.mts --check  → exit 0 ถ้าไฟล์ตรง · 1 ถ้าเก่า
//
// 🔴 คู่มือเล่มนี้ "ห้ามเขียนมือ": ทุกบรรทัดของ endpoint มาจาก `KANBAN_OPS` ตัวเดียวกับที่ REST dispatch จริง
//    ⇒ เอกสารโกหกไม่ได้ (ข้อสอบ K1.15-S3.2 เฝ้าอยู่: ไฟล์ต่างจาก generator เมื่อไร = แดง)
// ไม่แตะ DB · ไม่ต่อเน็ต · ผลลัพธ์เท่ากันทุกครั้ง (`renderDocs`/`renderEndpointsReference` บริสุทธิ์)
//
// ⚠️ กติกาของบอร์ดงาน **ไม่เหมือนบัญชี** — ห้ามลอกประโยคของบัญชีมาแปะ:
//    ไม่มีเงิน (ไม่มี `*Satang`) · ไม่มีการแบ่งหน้าแบบ `page`/`pageSize` (ทุก op `paged: false`)
//    · ลำดับเป็น fractional index (`position`) · เวลาเป็น ISO-8601 UTC ล้วน
//    ⇒ หัวข้อ "Conventions" จึงพิมพ์จาก `KANBAN_DOC_INFO.description` ตรง ๆ (แหล่งความจริงเดียวกับ OpenAPI)
//
// ภาษา: อังกฤษล้วน (ผู้อ่านคือผู้เชื่อมต่อ/agent) · ท้ายเล่มมี glossary ไทย↔อังกฤษให้เจ้าของร้านเทียบศัพท์

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { API_V1_RATE_LIMIT } from "@/lib/api-keys/route-auth";
import { API_SCOPE_BUNDLES } from "@/lib/api-keys/scopes";
import type { JsonSchema, OpenApiOperation } from "@/lib/api/openapi";
import type { ApiOp, ApiOpKind } from "@/lib/api/op";
import { API_RATE_LIMITS } from "@/lib/api/require";
import { API_ERROR_CODES, type ApiErrorCode } from "@/lib/api/respond";
import { buildOpenApi } from "@/lib/modules/kanban/api/openapi";
import { KANBAN_OPS } from "@/lib/modules/kanban/api/registry";
import { WEBHOOK_EVENTS } from "@/lib/webhooks/labels";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const DOC_PATH = resolve(ROOT, "docs/api/KANBAN-API.md");
/** ตารางอ้างอิงของสกิล Claude — ทะเบียนเดียวกัน รูปแบบสั้น ไม่มีร้อยแก้ว */
const SKILL_ENDPOINTS_PATH = resolve(ROOT, ".claude/skills/shark-kanban-api/references/endpoints.md");
const BASE_URL = "https://shark.in.th/api/v1/kanban";
/** ทางเดินของ AI ภายนอก (สกิล + tool) — คนละ prefix กับ REST บอร์ดงาน */
const AI_BASE_URL = "https://shark.in.th/api/v1/ai";
/** id ของสกิลผู้ช่วยที่ถือ tool ของบอร์ดงาน (`src/lib/ai/skills.ts`) */
const AI_SKILL_ID = "tasks";
/** ชุดสิทธิ์ที่เป็นของบอร์ดงาน (ทะเบียนเดียวกับหน้าสร้างคีย์) */
const KANBAN_BUNDLES = API_SCOPE_BUNDLES.filter((b) => b.id.startsWith("kanban-"));

// ── ตารางรหัสข้อผิดพลาด ───────────────────────────────────────────────────
// `Record<ApiErrorCode, ...>` โดยตั้งใจ: เพิ่มรหัสใน `src/lib/api/respond.ts` แล้วลืมอธิบายที่นี่ = typecheck แดง
// 🔴 รหัสบางตัวเป็นของกลางทั้ง REST (บัญชีใช้) แต่บอร์ดงานไม่เคยตอบ — ต้องเขียนตามจริง ไม่แต่งความหมายให้
type CodeDoc = { status: number; meaning: string; action: string };
const ERROR_CODE_DOCS: Record<ApiErrorCode, CodeDoc> = {
  unauthorized: {
    status: 401,
    meaning: "No `Authorization: Bearer` header, or the key is unknown or revoked.",
    action: "Check the header spelling and that the key was not revoked in the task board settings.",
  },
  key_expired: {
    status: 401,
    meaning: "The key was valid but its expiry date has passed.",
    action: "Rotate the key in the task board settings; the old key stops working immediately.",
  },
  system_required: {
    status: 400,
    meaning: "The key is not bound to one task board system and no `X-Shark-System` header was sent.",
    action: "Send `X-Shark-System: <AppSystem id>`, or use a key that is bound to a single system.",
  },
  system_mismatch: {
    status: 403,
    meaning: "`X-Shark-System` points at a different system than the key is bound to, or at a system that is not a task board of this shop.",
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
    meaning: "The payload did not match the schema. `details[]` lists every offending field.",
    action: "Fix the fields in `details[]`. Unknown fields are rejected on purpose, so check spelling too.",
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
    meaning: "The operation belongs to the customer themself (the member self-service lane) and needs a customer session, not a shop API key.",
    action: "Nothing an API key can do here: no scope opens this lane. Use the shop-facing operation instead.",
  },
  customer_scope: {
    status: 403,
    meaning: "A customer session (member self-service) called an operation that belongs to the shop. Member module only.",
    action: "Nothing to do here; a shop API key never gets this code.",
  },
  not_found: {
    status: 404,
    meaning: "No such operation, or the board, column, card, label, checklist, comment or attachment does not exist inside this task board system. A board the key may not see answers this too, never 403.",
    action: "Check the path against this document, and that the id belongs to the same system the key is bound to.",
  },
  method_not_allowed: {
    status: 405,
    meaning: "The path exists but not with this HTTP method. The `Allow` header lists what works.",
    action: "Use one of the methods in `Allow`.",
  },
  rate_limited: {
    status: 429,
    meaning: `Too many calls for this key: ${API_RATE_LIMITS.read.limit} reads or ${API_RATE_LIMITS.write.limit} writes per minute.`,
    action: "Wait `Retry-After` seconds and retry; watch `X-RateLimit-Remaining` to slow down before you hit it.",
  },
  period_locked: {
    status: 409,
    meaning: "Accounting specific (a closed accounting period). The task board module never returns this code.",
    action: "Nothing to do here; it cannot happen on a task board endpoint.",
  },
  state_conflict: {
    status: 409,
    meaning: "The record is not in a state that allows this: the card is archived, the target column is at its WIP limit, the two columns belong to different boards, or the board has no done column.",
    action: "Read the current state first (`GET /cards/{id}`, `GET /boards/{id}/columns`). A WIP limit can be overridden with `force: true` by a key that acts as board ADMIN.",
  },
  duplicate: {
    status: 409,
    meaning: "A conflicting record already exists, for example a label name that is already used on that board.",
    action: "Reuse the existing record, or send a different unique value.",
  },
  forbidden: {
    status: 403,
    meaning: "The operation is refused by a business rule, not by the scope check: the key's board role is too low, the key has no owning user (comments, `my-tasks`), or it asked for someone else's task inbox.",
    action: "Read `message_en`. A wider bundle (`kanban-admin`) or a key created by the right user usually fixes it.",
  },
  unprocessable: {
    status: 422,
    meaning: "The request was understood but cannot be completed as asked, for example archiving a column that still holds cards.",
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
  ["ระบบบอร์ดงาน", "task board system (AppSystem of type KANBAN)", "`X-Shark-System`"],
  ["บอร์ด", "board", "`/boards`"],
  ["คอลัมน์ / รายการ", "column (list)", "`/columns`"],
  ["การ์ดงาน", "card", "`/cards`"],
  ["เลขการ์ด", "card number inside the board", "`cardNo`"],
  ["ตำแหน่งในคอลัมน์", "fractional index position", "`position`"],
  ["คอลัมน์ 'เสร็จ'", "done column", "`isDoneColumn`"],
  ["เพดานงานค้าง", "work in progress limit", "`wipLimit`"],
  ["ผู้รับผิดชอบ", "assignee", "`assigneeUserId` / `userIds`"],
  ["ป้ายกำกับ", "label", "`/labels`"],
  ["เช็คลิสต์ / รายการย่อย", "checklist / checklist item", "`/checklists` / `/checklist-items`"],
  ["ความเห็น", "comment", "`/cards/{id}/comments`"],
  ["ไฟล์แนบ", "attachment", "`/cards/{id}/attachments`"],
  ["ภาพหน้าปกการ์ด", "card cover", "`PUT /cards/{id}/cover`"],
  ["กำหนดส่ง", "due date", "`dueAt`"],
  ["เก็บเข้าคลัง", "archive", "`status: ARCHIVED` · danger operations"],
  ["กู้คืน", "restore", "`/restore`"],
  ["บอร์ดส่วนตัว / ทั้งร้าน", "private / tenant wide board", "`visibility`"],
  ["สาขา", "business unit (branch)", "`unitId`"],
  ["เทมเพลตบอร์ด", "board template", "`GET /templates` · `template`"],
  ["งานของฉัน", "task inbox of one person", "`GET /my-tasks`"],
];

// ── Webhooks ──────────────────────────────────────────────────────────────
// รายชื่อ event มาจาก `src/lib/webhooks/labels.ts` ตัวเดียวกับที่หน้าตั้งค่าใช้ ⇒ คู่มือตกหล่นไม่ได้
// ตัวอย่าง body ต้องตรงกับ payload ที่ service ประกอบจริง (ดู `emitOutbox` ในไฟล์ที่อ้างถึงในแต่ละบรรทัด)
// 🔴 `pending: true` = ประกาศไว้แล้วแต่ยังไม่มีอะไรยิง (งานเตือนกำหนดส่งมาใน P2/K2.x)
//    ต้องบอกตามจริง ไม่งั้นผู้เชื่อมต่อรอ event ที่ไม่มีวันมา
type WebhookDoc = { when: string; payload: Record<string, unknown>; pending?: true };
const WEBHOOK_EVENT_DOCS: Record<string, WebhookDoc> = {
  "kanban.card.created": {
    when: "A card was created, whichever way it was created (a person on the board, this REST API, an automation rule).",
    payload: {
      cardId: "cmf1crd0001",
      boardId: "cmf1brd0001",
      columnId: "cmf1col0001",
      cardNo: 42,
      title: "Service the rental regulators",
      sourceType: "AUTOMATION",
    },
  },
  "kanban.card.assigned": {
    when: "Somebody became responsible for a card. One delivery per person added, so a card given to two people fires twice.",
    payload: { cardId: "cmf1crd0001", boardId: "cmf1brd0001", assigneeUserId: "cmf1usr0001" },
  },
  "kanban.card.moved": {
    when: "A card moved to another column. Reordering inside the same column does not fire, on purpose: it would flood the queue.",
    payload: {
      cardId: "cmf1crd0001",
      boardId: "cmf1brd0001",
      fromColumnId: "cmf1col0001",
      toColumnId: "cmf1col0002",
      cardNo: 42,
      title: "Service the rental regulators",
    },
  },
  "kanban.card.completed": {
    when: "A card entered the column flagged as the done column and got its `completedAt`. Fires next to `kanban.card.moved`, not instead of it.",
    payload: {
      cardId: "cmf1crd0001",
      boardId: "cmf1brd0001",
      columnId: "cmf1col0003",
      cardNo: 42,
      completedAt: "2026-09-06T09:15:00.000Z",
    },
  },
  "kanban.card.archived": {
    when: "A card was archived. Archiving, restoring and archiving again produces one delivery each time.",
    payload: { cardId: "cmf1crd0001", boardId: "cmf1brd0001", cardNo: 42, title: "Service the rental regulators" },
  },
  "kanban.card.due_soon": {
    when: "A card is approaching its due date. Declared so integrators can build their side now; the job that scans due dates ships with the reminders work, so nothing is delivered yet.",
    payload: { cardId: "cmf1crd0001", boardId: "cmf1brd0001", dueAt: "2026-09-07T10:00:00.000Z", assigneeUserIds: ["cmf1usr0001"] },
    pending: true,
  },
  "kanban.card.overdue": {
    when: "A card passed its due date. Same as above: declared now, delivered once the reminder job ships.",
    payload: { cardId: "cmf1crd0001", boardId: "cmf1brd0001", dueAt: "2026-09-05T10:00:00.000Z", overdueDays: 1 },
    pending: true,
  },
  "kanban.checklist.completed": {
    when: "The last open item of one checklist was ticked off. Fires on the transition only; ticking an already complete checklist again does nothing.",
    payload: { checklistId: "cmf1chk0001", cardId: "cmf1crd0001" },
  },
  "kanban.comment.added": {
    when: "A new comment was written on a card. `mentions` holds the user ids mentioned with the @[Name](userId) markup.",
    payload: {
      commentId: "cmf1cmt0001",
      cardId: "cmf1crd0001",
      boardId: "cmf1brd0001",
      authorUserId: "cmf1usr0001",
      mentions: ["cmf1usr0002"],
    },
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

/**
 * รายชื่อ event ของบอร์ดงาน — เรียงตามที่ประกาศ · **ตัดตัวซ้ำออก**
 * 🔴 `WEBHOOK_EVENTS` วันนี้มี `kanban.*` ซ้ำ 5 ตัว (มาทาง `AUTOMATION_EVENTS` ที่ spread ไว้หัวลิสต์
 *    แล้วบล็อก K1.15 ประกาศซ้ำอีกรอบ) ⇒ ถ้าไม่กรอง คู่มือจะมีหัวข้อ event เดียวกัน 2 ครั้ง
 *    (ตัวทะเบียนเองควรแก้ — ดูรายงานท้าย WO — แต่คู่มือต้องถูกต้องแม้ทะเบียนจะยังซ้ำอยู่)
 */
function kanbanWebhookEvents(): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of WEBHOOK_EVENTS) {
    if (!e.value.startsWith("kanban.") || seen.has(e.value)) continue;
    seen.add(e.value);
    out.push(e.value);
  }
  return out;
}

function webhookSection(): string[] {
  const events = kanbanWebhookEvents();
  const out: string[] = [
    "## Webhooks",
    "",
    "Everything above is you calling SHARK. Webhooks are SHARK calling you: the shop owner adds an endpoint URL in the shop settings (Connections > External apps / API), ticks the events it wants, and gets a signing secret shown once.",
    "",
    "Delivery is at least once and ordered by the moment the change was committed. Events are written inside the same database transaction as the change itself, so an event exists only if the change really happened, and a change never happens without its event. A delivery that does not answer 2xx within 5 seconds is retried up to 5 times with a growing delay, so **make your handler idempotent**: key on the ids in the payload.",
    "",
    "Every event below fires wherever the change came from - a person dragging a card in the app, this REST API, or an automation rule. There is no separate \"API only\" event.",
    "",
    "### Request format",
    "",
    "`POST <your url>` with `Content-Type: application/json` and these headers:",
    "",
    "| Header | Value |",
    "| --- | --- |",
    "| `X-Shark-Event` | The event type, for example `kanban.card.moved`. |",
    "| `X-Shark-Signature` | `HMAC-SHA256(secret, raw request body)` as lowercase hex. |",
    "",
    "The body is always the same three fields:",
    "",
    "```json",
    JSON.stringify(
      {
        type: "kanban.card.moved",
        payload: { cardId: "cmf1crd0001", boardId: "cmf1brd0001" },
        sentAt: "2026-09-06T09:15:00.000Z",
      },
      null,
      2,
    ),
    "```",
    "",
    "`payload` never contains your shop id or task board system id: the endpoint already belongs to one shop. It also never carries card descriptions, comment text or customer names - only ids plus the short labels needed to route the event. Read the rest with the REST operations above. Instants are ISO-8601 UTC strings ending in `At`, the same convention as the REST API.",
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
      JSON.stringify({ type: value, payload: doc.payload, sentAt: "2026-09-06T09:15:00.000Z" }, null, 2),
      "```",
      "",
    );
  }
  return out;
}

// ── helper ────────────────────────────────────────────────────────────────
/**
 * ผิวหน้าสำหรับผู้ช่วย AI — op ที่ประกาศ `tool` ในทะเบียนกลายเป็นเครื่องมือของสกิล `tasks`
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
  const sample = withTool.find((o) => o.id === "cards.create") ?? writeTools[0]!;
  const sampleRead = withTool.find((o) => o.id === "my-tasks") ?? readTools[0]!;
  return [
    "## AI agents",
    "",
    "Bring your own model. The same tools the SHARK assistant uses are published as a skill manifest, so an outside agent (Claude, GPT, Gemini, an open model, an n8n flow) can drive the task boards with the shop owner's API key. Nothing here is a second API: every tool call lands on the operation of the same name listed above.",
    "",
    "### Manifest",
    "",
    "```bash",
    `curl -sS "${AI_BASE_URL}/skills" -H "Authorization: Bearer $SHARK_API_KEY"`,
    `curl -sS "${AI_BASE_URL}/skills/${AI_SKILL_ID}" -H "Authorization: Bearer $SHARK_API_KEY"`,
    "```",
    "",
    `\`GET ${AI_BASE_URL}/skills\` lists the skills this shop can use. The task board skill is listed only when the shop has an active task board system and the key is allowed to call at least one of its tools. A shop without task boards, or a key whose scopes reach none of the tools, gets 404 from \`${AI_BASE_URL}/skills/${AI_SKILL_ID}\` - the same answer as a skill that does not exist, so nothing leaks about what is behind the wall.`,
    "",
    `\`GET ${AI_BASE_URL}/skills/${AI_SKILL_ID}\` returns the ${withTool.length} tools (${readTools.length} read, ${writeTools.length} write or danger) in OpenAI function-calling shape, so they can be handed to the model without conversion:`,
    "",
    "```text",
    `{ "id": "${AI_SKILL_ID}", "label": "งานและบอร์ด", "summary": "...", "tools": [`,
    "  { \"type\": \"function\",",
    `    "function": { "name": "${sampleRead.tool!.name}", "description": "...", "parameters": { ...JSON Schema... } },`,
    "    \"write\": false },",
    "  ...",
    "] }",
    "```",
    "",
    "`parameters` is the JSON Schema of that operation's input - the very schema the REST endpoint validates against - plus any path id (`boardId`, `cardId`, ...) as a required property and an optional `systemName` string for shops that run more than one task board system. Anthropic's shape is one field rename (`function.name` -> `name`, `function.parameters` -> `input_schema`). `write: true` marks a tool that changes data.",
    "",
    "### Calling a tool",
    "",
    `\`POST ${AI_BASE_URL}/tools/<tool name>\` with \`{ "args": { ... } }\`. Authentication is the same Bearer key as the REST API. Send \`X-Shark-System: <system id>\` when the key is not bound to one task board system. A key may only call the tools its scopes allow; anything else answers 403 with the missing scope in \`hint\`. An unknown tool name answers 404. Bad arguments never crash the call: the answer is still 200 and \`result\` carries a Thai \`error\` string the agent can read back to the user.`,
    "",
    `Rate limit on this lane: ${API_V1_RATE_LIMIT} calls per minute per key (429 with \`retry-after\`), independent of the REST limits above.`,
    "",
    "### Read tools run straight away",
    "",
    "```bash",
    `curl -sS -X POST "${AI_BASE_URL}/tools/${sampleRead.tool!.name}" \\`,
    '  -H "Authorization: Bearer $SHARK_API_KEY" \\',
    '  -H "Content-Type: application/json" \\',
    '  -d \'{"args":{}}\'',
    "```",
    "",
    "```json",
    JSON.stringify(
      { tool: sampleRead.tool!.name, skill: AI_SKILL_ID, write: false, result: '{"งานเลยกำหนด":2,"งานวันนี้":5,"งานสัปดาห์นี้":11}' },
      null,
      2,
    ),
    "```",
    "",
    "`result` is a JSON string the model reads back to the user (the object above is shortened; the real answer carries the card rows as well).",
    "",
    "### Write tools return a proposal, not a card",
    "",
    "An outside agent can never change a board on its own, even with a valid key. A write or danger tool creates a **proposal** (`summary` is Thai, written for the owner) that the shop owner confirms in the SHARK app or website. Only then does the operation run, with the confirming person's permissions and their name in the audit log; danger tools ask a second time.",
    "",
    "```bash",
    `curl -sS -X POST "${AI_BASE_URL}/tools/${sample.tool!.name}" \\`,
    '  -H "Authorization: Bearer $SHARK_API_KEY" \\',
    '  -H "Content-Type: application/json" \\',
    '  -d \'{"args":{"boardId":"brd_123","columnId":"col_123","title":"Service the rental regulators"}}\'',
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
        result: `{"proposalId":"prp_41c9","summary":"${sample.label} · Service the rental regulators","waiting":"user_confirm"}`,
      },
      null,
      2,
    ),
    "```",
    "",
    "Nothing exists on the board yet. The owner opens the conversation, reads the Thai summary and taps confirm; the card is then created. Tell the user the request is waiting for their confirmation - never report the card as created until a later read tool shows it.",
    "",
    "If a card must be created without a human in the loop, use the REST operations above instead: they execute immediately, and the key's scopes are the only gate.",
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
  // คำอธิบายของ zod อาจอยู่ชั้นนอกหรือชั้นในของ union (nullable) — เอาตัวแรกที่เจอ
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
  title: "Service the rental regulators",
  name: "Rental gear",
  body: "Called the supplier, they answer tomorrow.",
  text: "Call the supplier",
  columnId: "col_123",
  toColumnId: "col_456",
  userId: "usr_123",
  userIds: ["usr_123"],
  labelIds: ["lbl_123"],
  attachmentId: "att_123",
  filename: "receipt.pdf",
  contentType: "application/pdf",
  dataBase64: "SGVsbG8gU0hBUksK",
};

/** ตัวอย่างที่ชื่อฟิลด์เดียวกันแต่ความหมายต่างกันตาม op (`title` ของการ์ด ≠ `title` ของเช็คลิสต์) */
const SAMPLE_BY_OP_FIELD: Record<string, unknown> = {
  "checklists.create.title": "Before the boat leaves",
  "checklists.update.title": "Before the boat leaves",
  "columns.create.name": "In progress",
  "columns.update.name": "In progress",
  "labels.create.name": "Urgent",
  "labels.update.name": "Urgent",
  "boards.create.name": "Rental gear",
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
    lines.push(`  -d '${JSON.stringify(sample)}'`);
  } else {
    lines[lines.length - 1] = lines[lines.length - 1]!.replace(/ \\$/, "");
  }
  return lines;
}

const KIND_SECTIONS: { kind: ApiOpKind; title: string; blurb: string }[] = [
  { kind: "read", title: "Read operations", blurb: "Safe to call at any time. No `Idempotency-Key`, nothing is written, nothing is audited." },
  { kind: "write", title: "Write operations", blurb: "Change data. `Idempotency-Key` is required and every success is written to the audit log with the key name." },
  { kind: "danger", title: "Danger operations", blurb: "Hard to undo. On top of the write rules they need `confirm: true` and a `reason` of at least 5 characters. An AI agent must ask a human before calling these." },
];

// ── ตัวเรนเดอร์ endpoints.md ของสกิล Claude ─────────────────────────────────
// ตารางล้วน ไม่มีร้อยแก้ว: ให้ agent ที่อ่าน SKILL.md ไล่หา "METHOD path + scope" ของงานหนึ่ง ๆ ได้เร็ว
// สร้างจากทะเบียนเดียวกับ renderDocs() ⇒ เพิ่ม/ลบ op แล้วไฟล์นี้ตามเอง (ข้อสอบ K1.15-S3.4 ยึดไว้)
export function renderEndpointsReference(ops: ApiOp[] = KANBAN_OPS): string {
  const out: string[] = [];
  out.push(
    "# SHARK Task Board API — endpoint reference",
    "",
    "Generated from the operation registry by `scripts/gen-kanban-api-docs.mts` (`--check` covers this file too). Do not edit by hand.",
    "",
    `Base URL: \`${BASE_URL}\`. ${ops.length} operations. Full prose, field tables and curl examples: \`docs/api/KANBAN-API.md\` (also served at \`https://shark.in.th/developers/kanban.md\`). Machine readable contract: \`/api/v1/kanban/openapi.json\`.`,
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
export function renderDocs(ops: ApiOp[] = KANBAN_OPS): string {
  const spec = buildOpenApi(ops);
  const out: string[] = [];
  const push = (...lines: string[]) => out.push(...lines);
  const csvOps = ops.filter((o) => o.csv);

  // 5 บรรทัดแรกต้องเป็นอังกฤษล้วน — ผู้อ่านคนแรกคือ agent/นักพัฒนา
  push(
    `# ${spec.info.title}`,
    "",
    `Machine readable contract: \`/api/v1/kanban/openapi.json\` (OpenAPI ${spec.openapi}, no API key needed).`,
    `Base URL: \`${BASE_URL}\` - contract version ${spec.info.version} - ${ops.length} operations.`,
    "Generated from the operation registry by `scripts/gen-kanban-api-docs.mts`. Do not edit by hand: run the script.",
    "",
  );

  // ── Who this is for ─────────────────────────────────────────────────
  push(
    "## Who this is for",
    "",
    "- **AI agents** running a shop's task boards on behalf of its owner. Read the Conventions and the Error codes table first: every failure has a stable `code` to branch on, and `message_th` is already worded for a Thai shop owner, so it can be shown as is.",
    "- **Developers** wiring another system into the boards (a helpdesk, a form, an n8n flow, a nightly report). Everything in this document is generated from the same registry the live API dispatches from, so nothing here can drift from the running code.",
    "",
  );

  // ── Auth & scopes ───────────────────────────────────────────────────
  push(
    "## Authentication and scopes",
    "",
    "Send `Authorization: Bearer <api key>`. Keys are created by the shop owner in the task board settings (Task boards > Settings > API); the raw key is shown once.",
    "",
    "A key carries a list of scopes. Scopes are the same permission keys the human roles use, so a key can never do more than a person could. Bundles are ready made sets; the owner can still tick single scopes on top.",
    "",
    "| Bundle | What it can do | Scopes |",
    "| --- | --- | --- |",
  );
  for (const b of KANBAN_BUNDLES) {
    push(`| \`${b.id}\` | ${b.summary} | ${b.scopes.map((s) => `\`${s}\``).join(" ")} |`);
  }
  push(
    "",
    "### The key's board role",
    "",
    "A key has no board membership: nobody invites it to a board. Its role on **every** board of the system it is bound to is derived from its scopes instead:",
    "",
    "| Holds | Board role | Means |",
    "| --- | --- | --- |",
    "| `kanban.board.member.manage` | `ADMIN` | Everything, including members, WIP limits, the done column flag and `force` moves. |",
    "| any write scope (cards, columns, labels, comments, attachments, board creation) | `EDITOR` | Create and change content on every board, but not membership. |",
    "| read scopes only | `VIEWER` | Read only. |",
    "",
    "`GET /ping` tells you which one you got, so an integration can check it once at startup instead of guessing from a 403.",
    "",
    "A key also **sees every board of the system it is bound to, including private ones**: the shop owner issued the key and chose its scopes, exactly like an automation of their own. A board of another shop, or of another task board system, answers 404 - never 403.",
    "",
    "A key is normally bound to one task board system. If it is not, every call must carry `X-Shark-System: <AppSystem id>`. Calls that need a scope the key lacks fail with 403 `scope_missing` and the missing scope in `hint`.",
    "",
  );

  // ── Conventions ─────────────────────────────────────────────────────
  // 🔴 พิมพ์จาก `KANBAN_DOC_INFO.description` ตรง ๆ — คู่มือกับ OpenAPI จึงพูดตรงกันเสมอทุกไบต์
  push("## Conventions", "", "These are the rules of the module, copied verbatim from the contract description in `/api/v1/kanban/openapi.json`:", "");
  for (const line of spec.info.description.split("\n")) push(line);
  push("");
  // ⚠️ ถ้าวันหนึ่งทะเบียน event มีตัวซ้ำอีก (เคยเกิดตอน K1.15: labels.ts ประกาศซ้ำกับ AUTOMATION_EVENTS)
  //    ให้คู่มือบอกผู้อ่านตรง ๆ ว่ามีกี่ตัวจริง แทนที่จะปล่อยให้เขานับรายชื่อที่ซ้ำเอง
  const dupEvents = WEBHOOK_EVENTS.filter((e) => e.value.startsWith("kanban.")).length - kanbanWebhookEvents().length;
  if (dupEvents > 0) {
    push(
      `> Note on point 12: the list of event names there is printed straight from the shop's event registry, which currently repeats ${dupEvents} of them. There are **${kanbanWebhookEvents().length} distinct task board events**; the Webhooks section below is the canonical list.`,
      "",
    );
  }
  push(
    "### Shapes of a reply",
    "",
    "- **Lists are plain arrays.** There is no `page` / `pageSize` pagination anywhere in this module: `GET /boards`, `GET /boards/{id}/cards`, `GET /boards/{id}/columns`, `GET /boards/{id}/labels`, `GET /cards/{id}/comments` and `GET /cards/{id}/attachments` return the whole set in `data`.",
    "- **`GET /search` is cursor based.** `data` is the array of cards; the reply adds `total` and `nextCursor` next to `data` at the top level. Ask for the next page by sending `cursor=<nextCursor>`; `nextCursor: null` means you have everything. `take` (1-100, default 20) sets the page size.",
    "- **Activity lists carry their own cursor.** `GET /boards/{id}/activity` and `GET /cards/{id}/activity` answer `{ items, nextCursor }` inside `data`.",
    "- **No `Date` objects and no shop ids leak out.** Timestamps are ISO-8601 UTC strings or `null`; `tenantId` and `systemId` are never echoed back - the key already knows where it is.",
    `- **CSV.** ${csvOps.length === 0 ? "No operation renders CSV." : `${csvOps.length === 1 ? "One operation renders" : `${csvOps.length} operations render`} CSV when asked with \`Accept: text/csv\`: ${csvOps.map((o) => `\`${o.method} ${o.path}\``).join(", ")}. The file is UTF-8 with a BOM and comes back as an attachment instead of the JSON envelope.`}`,
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
    "## Glossary (Thai <-> English task board terms)",
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
      console.log(`✅ docs/api/KANBAN-API.md + skill endpoints.md ตรงกับทะเบียน (${KANBAN_OPS.length} op)`);
      process.exit(0);
    }
    if (!docOk) {
      console.error(
        `❌ docs/api/KANBAN-API.md ไม่ตรงกับทะเบียน (${current.length} ไบต์บนดิสก์ vs ${markdown.length} ไบต์ที่ควรเป็น)\n` +
          "   แก้ด้วย: pnpm exec tsx scripts/gen-kanban-api-docs.mts",
      );
    }
    if (!refOk) {
      console.error(
        `❌ .claude/skills/shark-kanban-api/references/endpoints.md ไม่ตรงกับทะเบียน (${currentRef.length} ไบต์บนดิสก์ vs ${endpointsRef.length} ไบต์ที่ควรเป็น)\n` +
          "   แก้ด้วย: pnpm exec tsx scripts/gen-kanban-api-docs.mts",
      );
    }
    process.exit(1);
  }
  mkdirSync(dirname(DOC_PATH), { recursive: true });
  writeFileSync(DOC_PATH, markdown, "utf8");
  mkdirSync(dirname(SKILL_ENDPOINTS_PATH), { recursive: true });
  writeFileSync(SKILL_ENDPOINTS_PATH, endpointsRef, "utf8");
  console.log(
    `✅ เขียน docs/api/KANBAN-API.md + skill endpoints.md (${KANBAN_OPS.length} op · ${markdown.length} ไบต์ / ${endpointsRef.length} ไบต์)`,
  );
}
