// gen-crm-api-docs.mts — สร้าง `docs/api/CRM-API.md` (+ `references/endpoints.md` ของสกิล Claude `shark-crm-api` ในเครื่อง)
//                         จากทะเบียน op ของ REST CRM (ใบ C1.10)
//
// รัน:  pnpm exec tsx scripts/gen-crm-api-docs.mts          → เขียนไฟล์
//       pnpm exec tsx scripts/gen-crm-api-docs.mts --check  → exit 0 ถ้าคู่มือตรง · 1 ถ้าเก่า (ตรวจเฉพาะ docs/ — โฟลเดอร์สกิลอยู่ใน .gitignore)
//
// 🔴 คู่มือเล่มนี้ "ห้ามเขียนมือ": ทุกบรรทัดของ endpoint มาจาก `CRM_OPS` ตัวเดียวกับที่ REST dispatch จริง
//    (ด่าน fitness F13.11 + ข้อสอบ C1.10-S8.1 เทียบไฟล์กับ `renderDocs()` ทุกไบต์)
// ไม่แตะ DB · ไม่ต่อเน็ต · ผลเท่ากันทุกครั้ง (`renderDocs` บริสุทธิ์) · ภาษาอังกฤษ (ผู้อ่านคือนักพัฒนา/agent) + glossary ไทย
// 🔴 op ที่ยังไม่ทำ (ใบ C2.11 · C3.4 · C3.8) อยู่ในหัวข้อ "Planned" ท้ายเล่ม — ย้ายออกเองเมื่อ op ลงทะเบียนจริง (กรองจากทะเบียนอัตโนมัติ)

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { API_SCOPE_BUNDLES } from "@/lib/api-keys/scopes";
import type { JsonSchema } from "@/lib/api/openapi";
import type { ApiOp } from "@/lib/api/op";
import { API_ERROR_CODES } from "@/lib/api/respond";
import { CRM_RATE_LIMITS } from "@/lib/modules/crm/api/config";
import { CRM_ERROR_CODES } from "@/lib/modules/crm/api/http-errors";
import { CRM_DOC_DESCRIPTION, jsonSchemaOf } from "@/lib/modules/crm/api/openapi";
import { CRM_OPS } from "@/lib/modules/crm/api/registry";
import { crmWebhookEvents } from "@/lib/modules/crm/api/webhook-events";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const DOC_PATH = resolve(ROOT, "docs/api/CRM-API.md");
const SKILL_ENDPOINTS_PATH = resolve(ROOT, ".claude/skills/shark-crm-api/references/endpoints.md");
const BASE_URL = "https://shark.in.th/api/v1/crm";
const AI_SKILL_ID = "crm";
const CRM_BUNDLES = API_SCOPE_BUNDLES.filter((b) => b.id.startsWith("crm."));

/** หมวดของคู่มือ (ลำดับ = ลำดับที่ผู้อ่านเห็น) — จับจาก segment แรกของ path */
const SECTIONS: { key: string; title: string; match: (op: ApiOp) => boolean }[] = [
  { key: "core", title: "Health check and search", match: (o) => o.path === "/ping" || o.path === "/search" },
  { key: "contacts", title: "Contacts", match: (o) => o.path.startsWith("/contacts") },
  { key: "companies", title: "Companies", match: (o) => o.path.startsWith("/companies") },
  { key: "deals", title: "Deals and pipelines", match: (o) => o.path.startsWith("/deals") || o.path.startsWith("/pipelines") },
  { key: "activities", title: "Activities and calendar", match: (o) => o.path.startsWith("/activities") || o.path.startsWith("/calendar") },
  { key: "objects", title: "Custom objects and records", match: (o) => o.path.startsWith("/objects") },
  { key: "teams", title: "Sales teams (also at /api/v1/teams)", match: (o) => o.path.startsWith("/teams") },
  { key: "settings", title: "Settings", match: (o) => o.path.startsWith("/settings") },
];

/** รหัสข้อผิดพลาดที่ REST CRM ตอบ (รหัสกลางที่ CRM ไม่เคยตอบไม่อยู่ในตาราง — เขียนตามจริง) */
const ERROR_DOCS: [code: string, status: string, meaning: string][] = [
  ["unauthorized", "401", "No `Authorization: Bearer` header, or the key is unknown or revoked."],
  ["key_expired", "401", "The key is past its expiry date. Rotate it in CRM > Settings > API."],
  ["system_required", "400", "The key is not bound to a CRM system and no `X-Shark-System` header was sent (not needed for `/teams`)."],
  ["system_mismatch", "403", "`X-Shark-System` points at another system than the key is bound to, or at a system that is not a CRM of this shop."],
  ["scope_missing", "403", "The key does not hold the scope in `x-shark-scope` (`hint` names it). Keys of other modules get this on every CRM operation."],
  ["forbidden", "403", "The key sees the record but may not do this to it (for example a read-only key trying to write, or a reassignment across teams without `crm.deal.reassign`)."],
  ["crm_v2_disabled", "409", "The shop still runs the previous CRM screens (`uiVersion` 1). Every operation except `GET /ping` answers this; nothing is read or written."],
  ["invalid_json", "400", "The body is not parseable JSON."],
  ["validation", "422", "The payload does not match the schema (`details[]` names the fields) or a value is not acceptable (Thai reason in `message_th`)."],
  ["idempotency_required", "400", "A write was sent without the `Idempotency-Key` header."],
  ["idempotency_conflict", "409", "The same `Idempotency-Key` was reused with a different body."],
  ["idempotency_in_progress", "409", "A request with this key is still running; retry with the same key."],
  ["confirm_required", "409", "A danger operation was called without `confirm: true` (a real boolean)."],
  ["not_found", "404", "No such operation, or the record does not exist inside what this key can see (other shop, other CRM system, other team, outside the key filter)."],
  ["method_not_allowed", "405", "The path exists but not with this method (`Allow` header lists the methods)."],
  ["rate_limited", "429", "Too many calls for this key and class; wait `Retry-After` seconds."],
  ["duplicate", "409", "A conflicting record exists (for example another company already has this tax id). The message never names the other record."],
  ["state_conflict", "409", "The record is not in a state that allows this (for example a closed deal, or a merge that stopped part-way)."],
  ["stage_requirements", "409", "The target stage needs things the deal does not have yet; `hint` lists them (`missing: LINES, expectedCloseAt`)."],
  ["approval_required", "409", "The change waits for the shop's approval chain (discount above the cap); `hint` carries `approvalRequestId=<id>`. Nothing was applied."],
  ["unprocessable", "422", "A generic refusal with a Thai reason in `message_th`."],
  ["payload_too_large", "413", "The request body is larger than 1 MB (10 MB for `POST /contacts/import`). Split it into several calls."],
];

/** ของที่วางแผนไว้แต่ยังไม่ลงทะเบียน (CRM-API ฉบับร่าง §2 · MASTER-PLAN §6) — กรองตัวที่ลงทะเบียนแล้วออกอัตโนมัติ */
const PLANNED: { wo: string; area: string; ops: string[] }[] = [
  { wo: "C1.11 / C2.11", area: "Contacts", ops: ["contacts.setLifecycle", "contacts.timeline", "contacts.duplicates.dismiss", "contacts.import.status"] },
  { wo: "C2.11", area: "Companies", ops: ["companies.setParent", "companies.contacts.setPrimary", "companies.contacts.setRole", "companies.import.start", "companies.importFromAccount", "companies.outstanding"] },
  { wo: "C2.11", area: "Deals", ops: ["deals.reopen", "deals.setCollaborators", "deals.invoice", "deals.history", "deals.stale", "pipelines.create", "pipelines.update", "stages.upsert", "lostReasons.list"] },
  { wo: "C2.11", area: "Activities", ops: ["activities.update", "activities.outcomes", "activities.transcribe"] },
  { wo: "C2.11", area: "E-mail", ops: ["emails.threads", "emails.thread", "emails.send", "emails.attach", "emails.templates.*", "emails.routing.*", "emails.sendTest", "emails.domain.status"] },
  { wo: "C2.11", area: "Sequences, assignment and scoring", ops: ["sequences.*", "sequences.enroll", "sequences.stop", "assignment.rules.*", "assignment.simulate", "scoring.rules.*", "scoring.explain", "scoring.recompute"] },
  { wo: "C2.11", area: "Tracking", ops: ["tracking.links.*", "tracking.settings.*", "tracking.stats", "tracking.sessions"] },
  { wo: "C3.8", area: "Custom objects", ops: ["objects.get", "records.move", "records.timeline", "records.import", "records.byParent"] },
  { wo: "C3.8", area: "Visibility, quotas and commissions", ops: ["visibility.policies.list", "visibility.policies.set", "quotas.*", "quotas.progress", "commissions.rules.*", "commissions.list", "commissions.approve", "commissions.reject", "commissions.report"] },
  { wo: "C3.5 / C3.8", area: "Portal (customer session)", ops: ["portal.invite", "portal.access.list", "portal.access.revoke", "p.me", "p.quotations.*", "p.invoices.*", "p.receipts.list", "p.documents.list", "p.requests.*", "p.contacts.*"] },
  { wo: "C3.8", area: "Reports and settings", ops: ["reports.*", "reports.export", "reports.schedule", "settings.targets.set", "settings.integrations.status", "templates.list", "templates.apply"] },
  { wo: "C2.11 / C3.4", area: "AI tools (18 more)", ops: ["10 tools of C2.11 (e-mail, sequences, scoring)", "8 tools of C3.4: crm_issue_quotation, crm_reports, crm_quota_progress, crm_commissions_mine, crm_stop_sequence, crm_create_record, crm_update_record, crm_create_task_card"] },
];

const GLOSSARY: [string, string, string][] = [
  ["ผู้ติดต่อ", "contact", "`/contacts`"],
  ["บริษัท", "company", "`/companies`"],
  ["ดีล", "deal", "`/deals`"],
  ["ขั้น (ของดีล)", "stage", "`stageId`"],
  ["pipeline", "pipeline", "`pipelineId`"],
  ["lead (ผู้สนใจ)", "lead", "`leadStatus`, `lifecycleStage: LEAD`"],
  ["กิจกรรม / งานติดตาม", "activity / task", "`/activities`"],
  ["ผู้ดูแล", "owner", "`ownerUserId`"],
  ["ทีมขาย", "sales team", "`/teams`, `teamId`"],
  ["วัตถุกำหนดเอง", "custom object", "`/objects/{key}`"],
  ["รายการ (ของวัตถุ)", "record", "`/objects/{key}/records`"],
  ["ไม่รับข่าวสาร", "marketing opt-out", "`marketingOptOut`"],
];

// ── ตัวช่วย ────────────────────────────────────────────────────────────────
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function typeOf(s: unknown): string {
  if (!isObj(s)) return "any";
  if (Array.isArray(s.enum)) return s.enum.map((x) => `\`${String(x)}\``).join(" \\| ");
  const alts = [...((s.anyOf as unknown[]) ?? []), ...((s.oneOf as unknown[]) ?? [])];
  if (alts.length > 0) return [...new Set(alts.map(typeOf))].join(" \\| ");
  if (s.type === "array") return `${typeOf(s.items)}[]`;
  if (s.type === "object") return "object";
  if (typeof s.type === "string") return s.type;
  if (Array.isArray(s.type)) return s.type.join(" \\| ");
  return "any";
}

function limitOf(s: unknown): string {
  if (!isObj(s)) return "";
  const bits: string[] = [];
  if (typeof s.maxLength === "number") bits.push(`max ${s.maxLength} chars`);
  if (typeof s.minLength === "number" && s.minLength > 0) bits.push(`min ${s.minLength}`);
  if (typeof s.maxItems === "number") bits.push(`max ${s.maxItems} items`);
  if (typeof s.maximum === "number" && s.maximum < 1e15) bits.push(`<= ${s.maximum}`);
  if (typeof s.pattern === "string" && /https\?/.test(s.pattern)) bits.push("http(s) URL");
  for (const alt of [...((s.anyOf as unknown[]) ?? [])]) {
    const l = limitOf(alt);
    if (l) bits.push(l);
  }
  return [...new Set(bits)].join(", ");
}

function inputTable(op: ApiOp): string[] {
  if (!op.input) return [];
  const js: JsonSchema = jsonSchemaOf(op.input, "input");
  const props = isObj(js.properties) ? js.properties : {};
  const required = new Set(Array.isArray(js.required) ? js.required.map(String) : []);
  const names = Object.keys(props);
  if (names.length === 0) return [];
  const where = op.method === "GET" ? "Query" : "Body";
  const out = [`${where}:`, "", "| Field | Type | Required | Limits |", "| --- | --- | --- | --- |"];
  for (const n of names) out.push(`| \`${n}\` | ${typeOf(props[n])} | ${required.has(n) ? "yes" : ""} | ${limitOf(props[n])} |`);
  if (op.kind === "danger") out.push("| `confirm` | boolean `true` | yes | checked before the schema |");
  out.push("");
  return out;
}

const KIND_LABEL: Record<string, string> = { read: "read", write: "write", danger: "**danger**" };

// ── คู่มือ ───────────────────────────────────────────────────────────────────
export function renderDocs(): string {
  const out: string[] = [];
  const push = (...l: string[]) => out.push(...l);
  const tools = CRM_OPS.filter((o) => o.tool);
  const registered = new Set(CRM_OPS.map((o) => o.id));

  push(
    "# SHARK CRM API",
    "",
    "<!-- Generated from the operation registry (src/lib/modules/crm/api/registry.ts) by `pnpm exec tsx scripts/gen-crm-api-docs.mts`. Do not edit by hand: fitness F13.11 fails when this file and the generator disagree. -->",
    "",
    `Base URL: \`${BASE_URL}\` · OpenAPI 3.1: \`${BASE_URL}/openapi.json\` (no key needed) · ${CRM_OPS.length} operations (${CRM_OPS.filter((o) => o.kind === "read").length} read, ${CRM_OPS.filter((o) => o.kind === "write").length} write, ${CRM_OPS.filter((o) => o.kind === "danger").length} danger) · ${tools.length} AI tools.`,
    "",
    "## Conventions",
    "",
    ...CRM_DOC_DESCRIPTION,
    "",
    "Every write needs `Idempotency-Key`; every danger operation needs `confirm: true` and a `reason` of at least 5 characters.",
    "",
    "## Keys, bundles and filters",
    "",
    "Create keys in CRM > Settings > API. A key is bound to one CRM system and holds one bundle:",
    "",
    "| Bundle | Label | What it may do | Scopes |",
    "| --- | --- | --- | --- |",
  );
  for (const b of CRM_BUNDLES) push(`| \`${b.id}\` | ${b.label} | ${b.summary} | ${b.scopes.length} |`);
  push(
    "",
    "Optional filters are stored with the key as extra scopes: `crm.filter.team:<teamId>` and `crm.filter.owner:<userId>`. They narrow every read and write of the key to that team's or that user's contacts, companies, deals and activities; anything else answers 404.",
    "",
    `Rate limits per key and minute: ${CRM_RATE_LIMITS.read.limit} reads, ${CRM_RATE_LIMITS.write.limit} writes, ${CRM_RATE_LIMITS.report.limit} reports.`,
    "",
    "## Errors",
    "",
    "Failure body: `{ \"error\": { \"code\", \"message_th\", \"message_en\", \"hint\"?, \"details\"? }, \"requestId\" }`.",
    "",
    "| Code | HTTP | Meaning |",
    "| --- | --- | --- |",
  );
  const known = new Set<string>([...API_ERROR_CODES, ...CRM_ERROR_CODES]);
  for (const [code, status, meaning] of ERROR_DOCS) if (known.has(code)) push(`| \`${code}\` | ${status} | ${meaning} |`);
  push("", "## Operations", "");

  for (const sec of SECTIONS) {
    const ops = CRM_OPS.filter((o) => sec.match(o));
    if (ops.length === 0) continue;
    push(`### ${sec.title}`, "", "| Operation | Method and path | Kind | Scope | Summary |", "| --- | --- | --- | --- | --- |");
    for (const o of ops) push(`| \`${o.id}\` | \`${o.method} ${o.path}\` | ${KIND_LABEL[o.kind]} | \`${o.action}\` | ${o.summary} |`);
    push("");
    for (const o of ops) {
      push(`#### \`${o.method} ${o.path}\` — ${o.id}`, "", `${o.summary} (${o.label})${o.rate === "report" ? " Uses the report rate bucket." : ""}${o.tool ? ` AI tool: \`${o.tool.name}\`.` : ""}`, "");
      push(...inputTable(o));
    }
  }

  push(
    "## AI tools (skill `crm`)",
    "",
    `The in-app assistant and outside agents (\`POST https://shark.in.th/api/v1/ai/tools/<name>\`, manifest \`GET https://shark.in.th/api/v1/ai/skills/${AI_SKILL_ID}\`) reach the CRM through these tools. Read tools run at once with the rights of the person asking (never more; without a known person they refuse). Write tools only create a proposal that a person confirms in the app. A key without any \`crm.*\` scope cannot use any of them, \`crm_create_lead\` included.`,
    "",
    "| Tool | Kind | Operation | Scope |",
    "| --- | --- | --- | --- |",
  );
  for (const o of tools) push(`| \`${o.tool!.name}\` | ${o.kind === "read" ? "read (runs at once)" : "write (proposal)"} | \`${o.id}\` | \`${o.action}\` |`);
  push(
    "",
    "`crm_create_lead` keeps its old name. On a shop that still runs the previous CRM screens it proposes the old `crm_create_lead` action (name, phone, e-mail) exactly as before.",
    "",
    "## Webhooks",
    "",
    "Subscribe an endpoint (https only) in CRM > Settings > API or in Settings > Apps. Deliveries are `POST` with a body `{ type, payload, sentAt }`, header `X-Shark-Event`, `X-Shark-Timestamp`, `X-Shark-Signature` (HMAC-SHA256 of the raw body with the endpoint secret, hex) and `X-Shark-Signature-V2` (HMAC-SHA256 of `<timestamp>.<body>`). Delivery is at least once; handlers must be idempotent. Payloads carry ids only - read the record through this API.",
    "",
    "| Event | Payload (ids only) |",
    "| --- | --- |",
  );
  for (const e of crmWebhookEvents()) {
    const ids = e.startsWith("crm.deal.") ? "`dealId`, related ids" : e.startsWith("crm.contact.") ? "`contactId`, related ids" : e.startsWith("crm.company.") ? "`companyId`, related ids" : e.startsWith("crm.activity.") ? "`activityId`, related ids" : e.startsWith("custom.record.") ? "`recordId`, `objectKey`, parent ids" : "`teamId`, `change`";
    push(`| \`${e}\` | ${ids} |`);
  }
  push(
    "",
    "## Example",
    "",
    "```bash",
    "# a new lead from a web form (every write needs an Idempotency-Key)",
    `curl -sS -X POST "${BASE_URL}/contacts" \\`,
    '  -H "Authorization: Bearer $SHARK_API_KEY" -H "Idempotency-Key: $(uuidgen)" \\',
    '  -H "Content-Type: application/json" \\',
    `  -d '{"firstName":"Somchai","phone":"0812345678","sourceKind":"WEB_FORM"}'`,
    "",
    "# move a deal to the next stage",
    `curl -sS -X PUT "${BASE_URL}/deals/<dealId>/stage" \\`,
    '  -H "Authorization: Bearer $SHARK_API_KEY" -H "Idempotency-Key: $(uuidgen)" \\',
    '  -H "Content-Type: application/json" -d \'{"stageId":"<stageId>"}\'',
    "```",
    "",
    "## Planned (not available yet)",
    "",
    "These operations are designed but not registered yet; calling them answers 404. They move into the tables above when their work order lands.",
    "",
    "| Work order | Area | Planned operations |",
    "| --- | --- | --- |",
  );
  for (const p of PLANNED) {
    const left = p.ops.filter((id) => !registered.has(id));
    if (left.length > 0) push(`| ${p.wo} | ${p.area} | ${left.map((x) => `\`${x}\``).join(", ")} |`);
  }
  push("", "## Glossary (Thai <-> English)", "", "| ไทย | English | In the API |", "| --- | --- | --- |");
  for (const [th, en, f] of GLOSSARY) push(`| ${th} | ${en} | ${f} |`);
  push("");
  return out.join("\n");
}

/** ตารางอ้างอิงสั้นของสกิล Claude (ไม่ถูก commit — .claude/skills อยู่ใน .gitignore) */
export function renderEndpointsReference(): string {
  const lines = ["# SHARK CRM API — endpoints", "", "Generated by `scripts/gen-crm-api-docs.mts`. Do not edit by hand.", "", "| Method | Path | Kind | Scope | Summary |", "| --- | --- | --- | --- | --- |"];
  for (const o of CRM_OPS) lines.push(`| ${o.method} | \`${o.path}\` | ${o.kind} | \`${o.action}\` | ${o.summary} |`);
  lines.push("");
  return lines.join("\n");
}

// ── CLI ───────────────────────────────────────────────────────────────────
const invokedDirectly = typeof process.argv[1] === "string" && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  const markdown = renderDocs();
  if (process.argv.includes("--check")) {
    const current = existsSync(DOC_PATH) ? readFileSync(DOC_PATH, "utf8") : "";
    if (current === markdown) {
      console.log(`✅ docs/api/CRM-API.md ตรงกับทะเบียน (${CRM_OPS.length} op)`);
      process.exit(0);
    }
    console.error(`❌ docs/api/CRM-API.md ไม่ตรงกับทะเบียน — แก้ด้วย: pnpm exec tsx scripts/gen-crm-api-docs.mts`);
    process.exit(1);
  }
  mkdirSync(dirname(DOC_PATH), { recursive: true });
  writeFileSync(DOC_PATH, markdown, "utf8");
  mkdirSync(dirname(SKILL_ENDPOINTS_PATH), { recursive: true });
  writeFileSync(SKILL_ENDPOINTS_PATH, renderEndpointsReference(), "utf8");
  console.log(`✅ เขียน docs/api/CRM-API.md (${CRM_OPS.length} op · ${markdown.length} ไบต์) + .claude/skills/shark-crm-api/references/endpoints.md`);
}
