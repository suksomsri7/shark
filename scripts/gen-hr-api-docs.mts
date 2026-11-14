// gen-hr-api-docs.mts — สร้าง `docs/api/HR-API.md` + `skills/shark-hr-api/references/endpoints.md` จากทะเบียน op ของระบบงานบุคคล
//                       (ใบ H4.8 · brief D4 · แบบ gen-pos-api-docs.mts)
//
// รัน:  pnpm exec tsx scripts/gen-hr-api-docs.mts          → เขียนไฟล์
//       pnpm exec tsx scripts/gen-hr-api-docs.mts --check  → exit 0 ถ้าไฟล์ตรง · 1 ถ้าเก่า
//
// 🔴 คู่มือเล่มนี้ "ห้ามเขียนมือ": ทุกบรรทัดของ endpoint มาจาก `HR_OPS` ตัวเดียวกับที่ REST dispatch จริง (qc-hr-h4.8 P3 เฝ้า)
// ไม่แตะ DB · ไม่ต่อเน็ต · ผลลัพธ์เท่ากันทุกครั้ง · ภาษาอังกฤษล้วน (ผู้อ่านคือผู้เชื่อมต่อ/agent) · ท้ายเล่มมี glossary ไทย↔อังกฤษ
// SKILL.md + recipes.md ของสกิลเขียนมือ — สคริปต์สร้างเฉพาะ endpoints.md

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { API_SCOPE_BUNDLES } from "@/lib/api-keys/scopes";
import type { JsonSchema, OpenApiOperation } from "@/lib/api/openapi";
import type { ApiOp, ApiOpKind } from "@/lib/api/op";
import { API_RATE_LIMITS } from "@/lib/api/require";
import { API_ERROR_CODES, type ApiErrorCode } from "@/lib/api/respond";
import { buildOpenApi } from "@/lib/modules/hr/api/openapi";
import { HR_OPS } from "@/lib/modules/hr/api/registry";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const DOC_PATH = resolve(ROOT, "docs/api/HR-API.md");
const SKILL_ENDPOINTS_PATH = resolve(ROOT, "skills/shark-hr-api/references/endpoints.md");
const BASE_URL = "https://shark.in.th/api/v1/hr";
const HR_BUNDLES = API_SCOPE_BUNDLES.filter((b) => b.id.startsWith("hr-"));

// ── ตารางรหัสข้อผิดพลาด (Record<ApiErrorCode, …> โดยตั้งใจ: แกนเพิ่มรหัสแล้วลืมอธิบาย = typecheck แดง) ─────────────
type CodeDoc = { status: number; meaning: string; action: string };
const NOT_HR = "Another SHARK module only. The HR API never returns this code.";
const ERROR_CODE_DOCS: Record<ApiErrorCode, CodeDoc> = {
  unauthorized: { status: 401, meaning: "No `Authorization: Bearer` header, or the key is unknown or revoked.", action: "Check the header; ask the shop owner whether the key was revoked." },
  key_expired: { status: 401, meaning: "The key was valid but its expiry date has passed.", action: "Ask the shop owner for a new key." },
  system_required: { status: 400, meaning: "The key is a shop-wide key (not bound to any system) and no `X-Shark-System` header was sent. Shop-wide keys cannot use the HR API at all.", action: "Use a key issued from the HR settings page; those are always bound." },
  system_mismatch: { status: 403, meaning: "`X-Shark-System` points at another system than the key is bound to, or at a system that is not an HR system of this shop.", action: "Drop the header." },
  scope_missing: { status: 403, meaning: "The key does not hold the scope this operation (or this report, or filing a leave) needs - or a shop-wide key sent `X-Shark-System` (keys not bound to this HR system can do nothing).", action: "Read `hint` for the scope, then ask the owner for a key with the right bundle (`hr-leave`, `hr-payroll-read`)." },
  invalid_json: { status: 400, meaning: "The request body is not parseable JSON.", action: "Send valid JSON and `Content-Type: application/json`." },
  validation: { status: 422, meaning: "The query or body did not match the schema (unknown fields such as `reason` are rejected on purpose, `pageSize` other than 10/20/50, bad dates). `details[]` lists the fields.", action: "Fix the fields in `details[]`." },
  idempotency_required: { status: 400, meaning: "`POST /leaves` was sent without the `Idempotency-Key` header.", action: "Generate one key per logical attempt (a UUID) and send it." },
  idempotency_conflict: { status: 409, meaning: "The same `Idempotency-Key` was reused with a different body.", action: "Use a fresh key for a different request; reuse a key only to retry the identical one." },
  idempotency_in_progress: { status: 409, meaning: "A request with this key is still running.", action: "Wait a moment and retry with the same key; you will get the original answer." },
  idempotency_outcome_unknown: { status: 409, meaning: "A temporary failure hit the request after it had started, so it is unknown whether the leave was filed.", action: "Read `GET /leaves?status=PENDING`. If the leave is not there, send again with a NEW key." },
  confirm_required: { status: 409, meaning: NOT_HR, action: "Nothing to do here." },
  customer_session_required: { status: 401, meaning: NOT_HR, action: "Nothing to do here." },
  customer_scope: { status: 403, meaning: NOT_HR, action: "Nothing to do here." },
  not_found: { status: 404, meaning: "No such operation, or the record does not exist in this HR system or is not available to this key. An id of another HR system or shop answers exactly the same.", action: "Read ids from the list operations; never guess ids." },
  method_not_allowed: { status: 405, meaning: "The path exists but not with this HTTP method. The `Allow` header lists what works.", action: "Use one of the methods in `Allow`." },
  rate_limited: { status: 429, meaning: `Too many calls for this key: ${API_RATE_LIMITS.read.limit} reads, ${API_RATE_LIMITS.write.limit} writes or ${API_RATE_LIMITS.report.limit} report-class reads per minute.`, action: "Wait `Retry-After` seconds and retry." },
  period_locked: { status: 409, meaning: NOT_HR, action: "Nothing to do here." },
  state_conflict: { status: 409, meaning: "The payslip's pay run is a draft, not finished or reversed, so there is no issued payslip to read.", action: "Read it after the shop issues the pay run." },
  duplicate: { status: 409, meaning: "A pending or approved leave already covers some of these days.", action: "Do not file again; read `GET /leaves` to find the existing one." },
  forbidden: { status: 403, meaning: "An HR rule refused it: the key's issuer is no longer the shop owner, or the leave is for the shop owner or the key's issuer.", action: "Stop and tell the user; do not retry. A new key from the owner fixes the first case." },
  unprocessable: { status: 422, meaning: "The HR rules refused the request (leave type closed, half day or hours not allowed, outside employment, balance too low, range too long, report too big).", action: "Show `message_th` to the shop owner as is; it is the app's own wording." },
  upstream_unavailable: { status: 503, meaning: "Temporarily unavailable.", action: "Retry shortly (with the same `Idempotency-Key` for a write)." },
};

const GLOSSARY: [string, string, string][] = [
  ["ระบบงานบุคคล", "HR system (AppSystem of type HR)", "`X-Shark-System`"],
  ["สาขา", "branch (business unit)", "`unitId` · `GET /units`"],
  ["พนักงาน", "employee", "`employeeId` · `GET /employees`"],
  ["ทดลองงาน / ทำงานอยู่", "on probation / active", "`employmentStatus` PROBATION / ACTIVE"],
  ["กะ", "shift", "`GET /shifts` · `startMin` / `endMin`"],
  ["ตารางกะ (ประกาศแล้ว)", "published roster", "`GET /roster`"],
  ["ลงเวลาเข้า-ออก", "clock in / out", "`inAt` · `outAt`"],
  ["สาย / ออกก่อน", "late / early out", "`lateMin` · `earlyOutMin`"],
  ["ประเภทการลา", "leave type (policy)", "`policyId` · `GET /leave-policies`"],
  ["ใบลา", "leave request", "`GET /leaves` · `POST /leaves`"],
  ["รออนุมัติ", "pending", "`status: PENDING`"],
  ["ลาครึ่งวัน (เช้า/บ่าย)", "half day (morning / afternoon)", "`halfDay` AM / PM"],
  ["วันลาคงเหลือ", "leave balance", "`GET /leave-balances`"],
  ["สลิปเงินเดือน", "payslip", "`GET /payslips/{runId}/{employeeId}`"],
  ["รอบจ่ายเงินเดือน", "pay run", "`runId`"],
  ["สตางค์", "satang (1/100 baht)", "`*Satang` fields"],
  ["ประกันสังคม", "social security (SSO)", "`ssoBaseSatang` · `employerSsoSatang`"],
  ["ภาษีหัก ณ ที่จ่าย", "withholding tax", "`taxSatang` (payslip history)"],
];

// ── helper ────────────────────────────────────────────────────────────────
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
  const union = Array.isArray(schema.anyOf) ? schema.anyOf : Array.isArray(schema.oneOf) ? schema.oneOf : null;
  if (union) {
    const parts = union.filter(isRecord);
    const rest = parts.filter((p) => p.type !== "null");
    if (parts.length !== rest.length && rest.length === 1) return `${schemaTypeLabel(rest[0]!)} or null`;
    return "one of several shapes";
  }
  return "any";
}
function schemaRules(schema: JsonSchema): string {
  const rules: string[] = [];
  if (typeof schema.description === "string") rules.push(schema.description);
  if (typeof schema.minimum === "number" && schema.minimum > Number.MIN_SAFE_INTEGER) rules.push(`min ${schema.minimum}`);
  if (typeof schema.maximum === "number" && schema.maximum < Number.MAX_SAFE_INTEGER) rules.push(`max ${schema.maximum}`);
  if (typeof schema.pattern === "string") rules.push(`pattern \`${schema.pattern}\``);
  return rules.join(" · ").replace(/\|/g, "/") || "-";
}
const SAMPLE: Record<string, unknown> = {
  employeeId: "emp_123",
  policyId: "pol_123",
  fromDate: "2026-12-01",
  toDate: "2026-12-01",
  from: "2026-12-01",
  to: "2026-12-07",
  day: "2026-12-01",
  month: "2026-12",
  period: "2026-11",
  taxYear: 2026,
  year: 2026,
};
function sampleValue(name: string, schema: JsonSchema): unknown {
  if (SAMPLE[name] !== undefined) return SAMPLE[name];
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];
  const t = typeof schema.type === "string" ? schema.type : "string";
  if (t === "integer" || t === "number") return 1;
  if (t === "boolean") return true;
  return `example-${name}`;
}
const bodySchemaOf = (operation: OpenApiOperation): JsonSchema | null => {
  const schema = operation.requestBody?.content["application/json"]?.schema;
  return schema && isRecord(schema) ? schema : null;
};
function fieldTable(schema: JsonSchema): string[] {
  if (!isRecord(schema.properties) || Object.keys(schema.properties).length === 0) return [];
  const required = new Set(Array.isArray(schema.required) ? schema.required.filter((r): r is string => typeof r === "string") : []);
  const lines = ["| Field | Type | Required | Rules |", "| --- | --- | --- | --- |"];
  for (const [name, raw] of Object.entries(schema.properties)) lines.push(`| \`${name}\` | ${schemaTypeLabel(isRecord(raw) ? raw : {})} | ${required.has(name) ? "yes" : "no"} | ${schemaRules(isRecord(raw) ? raw : {})} |`);
  return lines;
}
function queryTable(operation: OpenApiOperation): string[] {
  const query = operation.parameters.filter((p) => p.in === "query");
  if (query.length === 0) return [];
  const lines = ["| Query | Type | Required | Rules |", "| --- | --- | --- | --- |"];
  for (const p of query) lines.push(`| \`${p.name}\` | ${schemaTypeLabel(p.schema)} | ${p.required ? "yes" : "no"} | ${schemaRules(p.schema)} |`);
  return lines;
}
function curlExample(op: ApiOp, operation: OpenApiOperation): string[] {
  const path = op.path.replace(/\{(\w+)\}/g, (_m, n: string) => (n === "report" ? "time" : `${n.replace(/Id$/, "")}_123`));
  const req = operation.parameters.filter((p) => p.in === "query" && p.required);
  const qs = req.length ? "?" + req.map((p) => `${p.name}=${encodeURIComponent(String(sampleValue(p.name, p.schema)))}`).join("&") : "";
  const lines = [`curl -sS -X ${op.method} "${BASE_URL}${path}${qs}" \\`, `  -H "Authorization: Bearer $SHARK_API_KEY"`];
  if (op.kind !== "read") {
    lines[lines.length - 1] += " \\";
    lines.push(`  -H "Idempotency-Key: $(uuidgen)" \\`, `  -H "Content-Type: application/json" \\`);
    const body = bodySchemaOf(operation);
    const required = new Set(Array.isArray(body?.required) ? (body!.required as unknown[]).filter((r): r is string => typeof r === "string") : []);
    const sample: Record<string, unknown> = {};
    for (const [name, raw] of Object.entries(isRecord(body?.properties) ? (body!.properties as Record<string, unknown>) : {})) if (required.has(name) || name === "policyId") sample[name] = sampleValue(name, isRecord(raw) ? raw : {});
    lines.push(`  -d '${JSON.stringify(sample)}'`);
  }
  return lines;
}
const KIND_SECTIONS: { kind: ApiOpKind; title: string; blurb: string }[] = [
  { kind: "read", title: "Read operations", blurb: "Safe to call at any time. No `Idempotency-Key`, nothing is written. Payslip and pay report reads are audited." },
  { kind: "write", title: "Write operations", blurb: "`Idempotency-Key` is required and every success is written to the audit log with the key name." },
];
const opsOf = (ops: ApiOp[], kind: ApiOpKind) => ops.filter((o) => o.kind === kind);

// ── endpoints.md ของสกิล ─────────────────────────────────────────────────
export function renderEndpointsReference(ops: ApiOp[] = HR_OPS): string {
  const out: string[] = [
    "# SHARK HR API - endpoint reference",
    "",
    "Generated from the operation registry by `scripts/gen-hr-api-docs.mts` (`--check` covers this file too). Do not edit by hand.",
    "",
    `Base URL: \`${BASE_URL}\`. ${ops.length} operations. Full prose, field tables and curl examples: \`docs/api/HR-API.md\` (also served at \`https://shark.in.th/developers/hr.md\`). Machine readable contract: \`/api/v1/hr/openapi.json\`.`,
    "",
  ];
  for (const section of KIND_SECTIONS) {
    const group = opsOf(ops, section.kind);
    if (group.length === 0) continue;
    out.push(`## ${section.title}`, "", section.blurb, "", "| Operation id | Method + path | Scope | Notes |", "| --- | --- | --- | --- |");
    for (const op of group) {
      const notes = [op.paged ? "paged" : "", op.rate === "report" ? "report rate, audited when it carries pay data" : "", op.id === "reports.get" ? "second scope per report" : "", op.id === "leaves.create" ? "also needs hr.leave.decide" : ""].filter(Boolean).join(" · ") || "-";
      out.push(`| \`${op.id}\` | \`${op.method} ${op.path}\` | \`${op.action}\` | ${notes} |`);
    }
    out.push("");
  }
  return out.join("\n");
}

// ── คู่มือเต็ม ─────────────────────────────────────────────────────────────
export function renderDocs(ops: ApiOp[] = HR_OPS): string {
  const spec = buildOpenApi(ops);
  const out: string[] = [];
  const push = (...lines: string[]) => out.push(...lines);
  push(
    `# ${spec.info.title}`,
    "",
    `Machine readable contract: \`/api/v1/hr/openapi.json\` (OpenAPI ${spec.openapi}, no API key needed).`,
    `Base URL: \`${BASE_URL}\` - contract version ${spec.info.version} - ${ops.length} operations.`,
    "Generated from the operation registry by `scripts/gen-hr-api-docs.mts`. Do not edit by hand: run the script.",
    "",
    "## Who this is for",
    "",
    "- **AI agents** answering a shop owner's questions about staff, rosters, attendance and leave, or filing a leave request for an employee. Read Privacy first.",
    "- **Developers** wiring a roster screen, a time-and-attendance dashboard or an accounting tool (with a pay key) into SHARK HR.",
    "",
    "## Authentication and scopes",
    "",
    "Send `Authorization: Bearer <api key>`. Only the shop owner issues HR keys, in HR > Settings > API keys; the raw key is shown once. Every key is bound to one HR system, and the HR API accepts no other key. If the person who issued a key stops being the shop owner, the key stops working (403 `forbidden`).",
    "",
    "| Bundle | What it can do | Scopes |",
    "| --- | --- | --- |",
  );
  for (const b of HR_BUNDLES) push(`| \`${b.id}\` | ${b.summary} | ${b.scopes.map((s) => `\`${s}\``).join(" ")} |`);
  push(
    "",
    "`hr.leave.decide` in `hr-leave` only mirrors the app's rule for filing leave on someone's behalf; no operation approves or rejects anything. Keys with `hr.payroll.read` always expire (30, 90 or 365 days) and need the owner's explicit consent.",
    "",
    "## Conventions",
    "",
    "These are the rules of the module, copied verbatim from the contract description in `/api/v1/hr/openapi.json`:",
    "",
  );
  for (const line of spec.info.description.split("\n")) push(line);
  push("", "## Error codes", "", "Branch on `error.code`, never on the message text. The list is shared by every SHARK REST module; codes the HR API never returns are marked.", "", "| Code | HTTP | Meaning | What to do |", "| --- | --- | --- | --- |");
  for (const code of API_ERROR_CODES) {
    const d = ERROR_CODE_DOCS[code];
    push(`| \`${code}\` | ${d.status} | ${d.meaning} | ${d.action} |`);
  }
  push("", "## Operations", "");
  for (const section of KIND_SECTIONS) {
    const group = opsOf(ops, section.kind);
    if (group.length === 0) continue;
    push(`### ${section.title}`, "", `${section.blurb} ${group.length} of the ${ops.length} operations.`, "");
    for (const op of group) {
      const operation = spec.paths[op.path]?.[op.method.toLowerCase()];
      if (!operation) continue;
      const notes = [op.paged ? "paged" : "", op.rate === "report" ? `report rate (${API_RATE_LIMITS.report.limit}/min)` : ""].filter(Boolean);
      push(`#### \`${op.id}\``, "", `**${op.method} ${op.path}** - ${op.summary} · scope: \`${op.action}\` · ${op.kind}${notes.length ? ` · ${notes.join(" · ")}` : ""}`, "");
      const pathParams = operation.parameters.filter((p) => p.in === "path");
      if (pathParams.length > 0) push(`Path parameters: ${pathParams.map((p) => `\`${p.name}\``).join(", ")} (required).`, "");
      const table = op.method === "GET" ? queryTable(operation) : fieldTable(bodySchemaOf(operation) ?? {});
      push(...(table.length > 0 ? table : [op.method === "GET" ? "No query parameters." : "No body fields."]), "");
      push("```bash", ...curlExample(op, operation), "```", "");
    }
  }
  push("## Glossary (Thai <-> English HR terms)", "", "| ไทย | English | In the API |", "| --- | --- | --- |");
  for (const [th, en, field] of GLOSSARY) push(`| ${th} | ${en} | ${field} |`);
  push("");
  return out.join("\n");
}

// ── CLI ───────────────────────────────────────────────────────────────────
const invokedDirectly = typeof process.argv[1] === "string" && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  const markdown = renderDocs();
  const endpointsRef = renderEndpointsReference();
  if (process.argv.includes("--check")) {
    const current = existsSync(DOC_PATH) ? readFileSync(DOC_PATH, "utf8") : "";
    const currentRef = existsSync(SKILL_ENDPOINTS_PATH) ? readFileSync(SKILL_ENDPOINTS_PATH, "utf8") : "";
    if (current === markdown && currentRef === endpointsRef) {
      console.log(`✅ docs/api/HR-API.md + skill endpoints.md ตรงกับทะเบียน (${HR_OPS.length} op)`);
      process.exit(0);
    }
    if (current !== markdown) console.error("❌ docs/api/HR-API.md ไม่ตรงกับทะเบียน — แก้ด้วย: pnpm exec tsx scripts/gen-hr-api-docs.mts");
    if (currentRef !== endpointsRef) console.error("❌ skills/shark-hr-api/references/endpoints.md ไม่ตรงกับทะเบียน — แก้ด้วย: pnpm exec tsx scripts/gen-hr-api-docs.mts");
    process.exit(1);
  }
  mkdirSync(dirname(DOC_PATH), { recursive: true });
  writeFileSync(DOC_PATH, markdown, "utf8");
  mkdirSync(dirname(SKILL_ENDPOINTS_PATH), { recursive: true });
  writeFileSync(SKILL_ENDPOINTS_PATH, endpointsRef, "utf8");
  console.log(`✅ เขียน docs/api/HR-API.md + skill endpoints.md (${HR_OPS.length} op)`);
}
