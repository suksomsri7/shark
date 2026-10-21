// gen-pos-api-docs.mts — สร้าง `docs/api/POS-API.md` + `references/endpoints.md` ของสกิล Claude `shark-pos-api`
//                         จากทะเบียน op ของระบบขายหน้าร้าน (ใบ P2.13 · brief §4 · มติ 8)
//
// รัน:  pnpm exec tsx scripts/gen-pos-api-docs.mts          → เขียนไฟล์
//       pnpm exec tsx scripts/gen-pos-api-docs.mts --check  → exit 0 ถ้าไฟล์ตรง · 1 ถ้าเก่า
//
// 🔴 คู่มือเล่มนี้ "ห้ามเขียนมือ": ทุกบรรทัดของ endpoint มาจาก `POS_OPS` ตัวเดียวกับที่ REST dispatch จริง (fitness F13.14 + qc-pos-p2.13 ST4 เฝ้า)
// ไม่แตะ DB · ไม่ต่อเน็ต · ผลลัพธ์เท่ากันทุกครั้ง (`renderDocs`/`renderEndpointsReference` บริสุทธิ์)
// ภาษา: อังกฤษล้วน (ผู้อ่านคือผู้เชื่อมต่อ/agent) · ท้ายเล่มมี glossary ไทย↔อังกฤษ
// SKILL.md + recipes.md ของสกิลเขียนมือ (ไม่ใช่ไฟล์ที่สคริปต์นี้สร้าง) — สคริปต์สร้างเฉพาะ endpoints.md

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { API_SCOPE_BUNDLES, POS_FILTER_UNIT_PREFIX } from "@/lib/api-keys/scopes";
import type { JsonSchema, OpenApiOperation } from "@/lib/api/openapi";
import type { ApiOp, ApiOpKind } from "@/lib/api/op";
import { API_RATE_LIMITS } from "@/lib/api/require";
import { API_ERROR_CODES, type ApiErrorCode } from "@/lib/api/respond";
import { POS_REFUSAL_HTTP, type PosRefusalCode } from "@/lib/modules/pos/api/http-errors";
import { buildOpenApi, posWebhookEvents } from "@/lib/modules/pos/api/openapi";
import { POS_OPS } from "@/lib/modules/pos/api/registry";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const DOC_PATH = resolve(ROOT, "docs/api/POS-API.md");
/** ตารางอ้างอิงของสกิล Claude — ทะเบียนเดียวกัน รูปแบบสั้น ไม่มีร้อยแก้ว */
// POS P2.14 ▸ DOC-2 มติ 4: สกิล POS อยู่ในรีโปที่ skills/shark-pos-api (สำเนาบ้าน = scripts/sync-skills.sh) ◂
const SKILL_ENDPOINTS_PATH = resolve(ROOT, "skills/shark-pos-api/references/endpoints.md");
const BASE_URL = "https://shark.in.th/api/v1/pos";
/** ชุดสิทธิ์ที่เป็นของ POS (ทะเบียนเดียวกับการ์ดออกคีย์) */
const POS_BUNDLES = API_SCOPE_BUNDLES.filter((b) => b.id.startsWith("pos-"));

// ── ตารางรหัสข้อผิดพลาด ───────────────────────────────────────────────────
// `Record<ApiErrorCode, ...>` โดยตั้งใจ: เพิ่มรหัสในแกนแล้วลืมอธิบายที่นี่ = typecheck แดง · รหัสที่ POS ไม่เคยตอบ = เขียนตามจริง
type CodeDoc = { status: number; meaning: string; action: string };
const ERROR_CODE_DOCS: Record<ApiErrorCode, CodeDoc> = {
  unauthorized: { status: 401, meaning: "No `Authorization: Bearer` header, or the key is unknown or revoked.", action: "Check the header and that the key was not revoked in the POS settings." },
  key_expired: { status: 401, meaning: "The key was valid but its expiry date has passed.", action: "Create a new key in the POS settings; give the old one up." },
  system_required: { status: 400, meaning: "The key is not bound to one POS system and no `X-Shark-System` header was sent.", action: "Send `X-Shark-System: <AppSystem id>`, or use a key bound to one POS system." },
  system_mismatch: { status: 403, meaning: "`X-Shark-System` points at another system than the key is bound to, or at a system that is not a POS of this shop.", action: "Drop the header, or send the id the key is bound to." },
  scope_missing: { status: 403, meaning: "The key does not hold the scope this operation needs.", action: "Read `hint` for the scope, then issue a key with a wider bundle (`pos-operate`, `pos-admin`)." },
  invalid_json: { status: 400, meaning: "The request body is not parseable JSON.", action: "Send valid JSON and `Content-Type: application/json`." },
  validation: { status: 422, meaning: "The payload did not match the schema, or the POS refused a value (payments not adding up, unknown option, bad tax id, range over 92 days). `details[]` lists the fields when known.", action: "Fix the fields in `details[]`. Unknown fields are rejected on purpose, so check spelling too." },
  idempotency_required: { status: 400, meaning: "A write was sent without the `Idempotency-Key` header.", action: "Generate one key per logical attempt (a UUID is fine) and send it." },
  idempotency_conflict: { status: 409, meaning: "The same `Idempotency-Key` was reused with a different body (or, for a sale, the POS already holds a different bill under this key).", action: "Use a fresh key for a different request; reuse the old key only to retry the identical one." },
  idempotency_in_progress: { status: 409, meaning: "A request with this key is still running.", action: "Wait a moment and retry with the same key; you will get the original response." },
  idempotency_outcome_unknown: { status: 409, meaning: "A temporary database or network failure hit the request after it had started, so it is unknown whether it took effect.", action: "Read the record (for a sale: `GET /sales?unitId=...&date=...`). If it does not exist, send the request again with a NEW `Idempotency-Key`." },
  confirm_required: { status: 409, meaning: "A danger operation was called without `confirm: true`.", action: "Ask a human first, then resend with `confirm: true` and a `reason`." },
  customer_session_required: { status: 401, meaning: "Member module only (customer self-service lane). The POS never returns this code.", action: "Nothing to do here." },
  customer_scope: { status: 403, meaning: "Member module only. The POS never returns this code.", action: "Nothing to do here." },
  not_found: { status: 404, meaning: "No such operation, or the branch, bill, product, channel, order or shift does not exist in this POS system. A branch or record of another POS system or shop answers this too, never 403.", action: "Check the path and the ids (`GET /units` lists the branches of the key)." },
  method_not_allowed: { status: 405, meaning: "The path exists but not with this HTTP method. The `Allow` header lists what works.", action: "Use one of the methods in `Allow`." },
  rate_limited: { status: 429, meaning: `Too many calls for this key: ${API_RATE_LIMITS.read.limit} reads, ${API_RATE_LIMITS.write.limit} writes or ${API_RATE_LIMITS.report.limit} reports per minute.`, action: "Wait `Retry-After` seconds and retry; watch `X-RateLimit-Remaining`." },
  period_locked: { status: 409, meaning: "Accounting specific (a closed accounting period). The POS never returns this code.", action: "Nothing to do here." },
  state_conflict: { status: 409, meaning: "The record is not in a state that allows this: the price changed since the quote (`PRICE_CHANGED`), the order moved on, the channel is paused, a shift is required or closed, the bill was voided or already refunded, a bill of another system.", action: "Read the current state first. For `PRICE_CHANGED` quote again and resend with the new `expectedGrandTotalSatang`." },
  duplicate: { status: 409, meaning: "A conflicting record already exists (for example a channel code).", action: "Reuse the existing record, or send a different unique value." },
  forbidden: { status: 403, meaning: "The POS refused by a business rule, not by the scope check: custom prices without `pos.sale.priceOverride`, cancelling an order that has a bill without `pos.sale.void`, a discount over the key's ceiling.", action: "Read `message_en`. A key from the `pos-admin` bundle usually fixes it." },
  unprocessable: { status: 422, meaning: "The request was understood but cannot be completed as asked.", action: "Read `message_en` and `message_th`; the Thai message is safe to show to the shop owner." },
  upstream_unavailable: { status: 503, meaning: "The POS is busy saving another change for the shop, or an external service is not reachable. Nothing was written.", action: "Retry with the same `Idempotency-Key` shortly." },
};

/** สถานะ → คำอธิบายสั้นของกลุ่มรหัสปฏิเสธของ POS */
const REFUSAL_GROUP: Record<string, string> = {
  "404": "not found / not in this POS system",
  "403": "refused by a business rule",
  "422": "a value cannot be accepted",
  "409": "state or duplicate conflict",
  "429": "too many attempts",
  "503": "busy, nothing written",
  "500": "unexpected error",
};

// ── glossary ไทย ↔ อังกฤษ ─────────────────────────────────────────────────
const GLOSSARY: [string, string, string][] = [
  ["ระบบขายหน้าร้าน", "POS system (AppSystem of type POS)", "`X-Shark-System`"],
  ["สาขา / จุดขาย", "branch (business unit)", "`unitId` · `GET /units`"],
  ["บิล / ใบเสร็จ", "bill / receipt", "`/sales` · `receiptNo`"],
  ["ใบคืนเงิน / ใบลดหนี้", "refund document (credit note)", "`POST /sales/{id}/refund` · `docType: REFUND`"],
  ["ยกเลิกบิล", "void a bill", "`POST /sales/{id}/void`"],
  ["ใบกำกับภาษีเต็มรูป", "full tax invoice", "`POST /sales/{id}/tax-invoice`"],
  ["สตางค์", "satang (1/100 baht)", "`*Satang` fields"],
  ["ยอดสุทธิ", "grand total", "`grandTotalSatang`"],
  ["เงินทอน", "change", "`changeSatang`"],
  ["กะ / ลิ้นชัก", "shift / cash drawer", "`/shifts`"],
  ["รายงาน X / Z", "X report (running) / Z report (closed shift)", "`/shifts/{id}/x-report` · `/z-report`"],
  ["เครื่องขาย", "register device", "`GET /devices`"],
  ["ช่องทางขาย", "sales channel (walk-in, web, delivery platform)", "`/channels` · `channelId`"],
  ["ออเดอร์", "order (online / platform / phone)", "`/orders`"],
  ["แพลตฟอร์มเดลิเวอรี", "delivery platform (payout PLATFORM)", "`payout: PLATFORM` · tender `PLATFORM`"],
  ["ของหมด (86)", "sold out", "`POST /products/{id}/availability`"],
  ["ตัวเลือกสินค้า", "product options / choices", "`GET /products/{id}/options` · `choiceId`"],
  ["สินค้าชั่ง / ป้ายชั่ง", "sold by weight / scale label", "`weighedBarcode` · `GET /products/lookup`"],
  ["ราคาตั้งเอง", "custom / open price", "custom line `{name, qty, unitPriceSatang}` · `pos.sale.priceOverride`"],
  ["วันธุรกิจ", "Thai business date (shop cut-off)", "`from` · `to` · `date`"],
];

// ── Webhooks ──────────────────────────────────────────────────────────────
// คำอธิบายอังกฤษของ event POS (รายชื่อมาจาก WEBHOOK_EVENTS — ตัวใหม่ที่ยังไม่มีคำอธิบาย = แสดงชื่ออย่างเดียว)
const WEBHOOK_WHEN: Record<string, string> = {
  "pos.sale.paid": "A bill was paid (register, API, order payment or another SHARK module selling through the POS).",
  "pos.sale.voided": "A bill was voided.",
  "pos.sale.refunded": "A refund document (credit note) was issued for a bill.",
  "pos.sale.taxInvoiceIssued": "A full tax invoice was issued for a bill.",
  "pos.shift.opened": "A shift was opened on a register device.",
  "pos.shift.closed": "A shift was closed (Z report frozen).",
  "pos.stockCount.confirmed": "A stock count started from the register was confirmed.",
  "pos.payment.intent_paid": "Money arrived for a PromptPay or card payment request.",
  "pos.order.received": "An online or platform order came in.",
  "pos.order.accepted": "An order was accepted.",
  "pos.order.rejected": "An order was rejected.",
  "pos.order.ready": "An order is ready.",
  "pos.order.completed": "An order was handed over.",
  "pos.order.cancelled": "An order was cancelled.",
  "pos.product.availability": "A product was marked sold out (86) or back on sale at a branch.",
};

function webhookSection(): string[] {
  const events = posWebhookEvents();
  const out = [
    "## Webhooks",
    "",
    "Everything above is you calling SHARK. Webhooks are SHARK calling you: the shop owner adds an endpoint URL in the shop settings (Connections > External apps / API), ticks the events and gets a signing secret shown once. Events fire wherever the change came from: the register screen, this API, an order adapter or another SHARK module.",
    "",
    "Each delivery is `POST <your url>` with `Content-Type: application/json`, header `X-Shark-Event: <type>`, `X-Shark-Event-Id` (same on every retry - drop duplicates) and `X-Shark-Signature` = HMAC-SHA256 of the raw body with the endpoint secret, lowercase hex. Delivery is at least once with retries, so handlers must be idempotent. The body is always `{ id, type, payload, sentAt }`; `payload` carries ids only, for example:",
    "",
    "```json",
    JSON.stringify({ id: "cmf1evt0001", type: "pos.sale.paid", payload: { saleId: "cmf1sal0001" }, sentAt: "2026-10-15T09:15:00.000Z" }, null, 2),
    "```",
    "",
    "Read the details with `GET /sales/{id}` (or the order, shift or product operation).",
    "",
    "| Event | Fires when |",
    "| --- | --- |",
  ];
  for (const e of events) out.push(`| \`${e}\` | ${WEBHOOK_WHEN[e] ?? "-"} |`);
  out.push("");
  return out;
}

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
    const nullable = parts.some((p) => p.type === "null");
    const rest = parts.filter((p) => p.type !== "null");
    if (nullable && rest.length === 1) return `${schemaTypeLabel(rest[0]!)} or null`;
    return "one of several shapes";
  }
  return "any";
}

function schemaRules(schema: JsonSchema): string {
  const rules: string[] = [];
  const union = Array.isArray(schema.anyOf) ? schema.anyOf : Array.isArray(schema.oneOf) ? schema.oneOf : null;
  const inner = union?.filter(isRecord).find((p) => p.type !== "null");
  const description = typeof schema.description === "string" ? schema.description : inner && typeof inner.description === "string" ? inner.description : null;
  if (description) rules.push(description);
  const src = isRecord(inner) && schema.type === undefined ? inner : schema;
  if (typeof src.minLength === "number") rules.push(`min length ${src.minLength}`);
  if (typeof src.maxLength === "number") rules.push(`max length ${src.maxLength}`);
  if (typeof src.minimum === "number" && src.minimum > Number.MIN_SAFE_INTEGER) rules.push(`min ${src.minimum}`);
  if (typeof src.maximum === "number" && src.maximum < Number.MAX_SAFE_INTEGER) rules.push(`max ${src.maximum}`);
  if (typeof src.maxItems === "number") rules.push(`max ${src.maxItems} items`);
  return rules.join(" · ").replace(/\|/g, "/") || "-";
}

/** ค่าตัวอย่างที่อ่านรู้เรื่อง (ทุกชื่อมาจากสคีมาของ op เอง) */
const SAMPLE_BY_NAME: Record<string, unknown> = {
  unitId: "unt_123",
  reason: "customer changed their mind",
  name: "Iced latte",
  priceSatang: 6500,
  available: false,
  until: "2026-10-15T18:00:00+07:00",
  reasonCode: "TOO_BUSY",
  barcode: "8850999320011",
  deviceId: "dev_counter_01",
  fulfilment: "PICKUP",
  from: "2026-10-09",
  to: "2026-10-15",
  date: "2026-10-15",
  buyer: { kind: "JURISTIC", name: "Example Co., Ltd.", taxId: "0105561177639", branchCode: "00000", address: "1 Example Road, Bangkok 10110" },
};
const SAMPLE_BY_OP_FIELD: Record<string, unknown> = {
  "sales.create.lines": [{ productId: "prd_123", qty: 2 }],
  "sales.quote.lines": [{ productId: "prd_123", qty: 2 }],
  "sales.create.payMethods": [{ type: "CASH", amountSatang: 13000 }],
  "sales.refund.lines": [{ lineId: "lin_123", qty: 1 }],
  "sales.refund.payMethods": [{ type: "CASH", amountSatang: 6500 }],
  "orders.create.lines": [{ productId: "prd_123", qty: 1 }],
  "orders.pay.payMethods": [{ type: "CASH", amountSatang: 6500 }],
  "sales.list.unitId": "unt_123",
};

function sampleValue(name: string, schema: JsonSchema, opId?: string): unknown {
  const perOp = opId === undefined ? undefined : SAMPLE_BY_OP_FIELD[`${opId}.${name}`];
  if (perOp !== undefined) return perOp;
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];
  const known = SAMPLE_BY_NAME[name];
  if (known !== undefined) return known;
  const t = typeof schema.type === "string" ? schema.type : "string";
  if (t === "integer" || t === "number") return typeof schema.minimum === "number" && schema.minimum > 0 ? schema.minimum : 1000;
  if (t === "boolean") return true;
  if (t === "array") return [];
  if (t === "object") return {};
  return `example-${name}`;
}

function bodySchemaOf(operation: OpenApiOperation): JsonSchema | null {
  const schema = operation.requestBody?.content["application/json"]?.schema;
  return schema && isRecord(schema) ? schema : null;
}

function fieldTable(schema: JsonSchema): string[] {
  if (!isRecord(schema.properties) || Object.keys(schema.properties).length === 0) return [];
  const required = new Set(Array.isArray(schema.required) ? schema.required.filter((r): r is string => typeof r === "string") : []);
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
  for (const p of query) lines.push(`| \`${p.name}\` | ${schemaTypeLabel(p.schema)} | ${p.required ? "yes" : "no"} | ${schemaRules(p.schema)} |`);
  return lines;
}

function samplePath(op: ApiOp): string {
  return op.path.replace(/\{[A-Za-z0-9_]+\}/g, "123");
}

function queryString(op: ApiOp, operation: OpenApiOperation): string {
  const required = operation.parameters.filter((p) => p.in === "query" && p.required);
  if (required.length === 0) return "";
  return "?" + required.map((p) => `${p.name}=${encodeURIComponent(String(sampleValue(p.name, p.schema, op.id)))}`).join("&");
}

function curlExample(op: ApiOp, operation: OpenApiOperation): string[] {
  const lines = [`curl -sS -X ${op.method} "${BASE_URL}${samplePath(op)}${queryString(op, operation)}" \\`];
  lines.push(`  -H "Authorization: Bearer $SHARK_API_KEY" \\`);
  if (op.kind !== "read") lines.push(`  -H "Idempotency-Key: $(uuidgen)" \\`);
  if (op.csv) lines.push(`  -H "Accept: text/csv" \\`);
  const body = op.method === "GET" ? null : bodySchemaOf(operation);
  if (body && isRecord(body.properties) && Object.keys(body.properties).length > 0) {
    lines.push(`  -H "Content-Type: application/json" \\`);
    const required = new Set(Array.isArray(body.required) ? body.required.filter((r): r is string => typeof r === "string") : []);
    const sample: Record<string, unknown> = {};
    for (const [name, raw] of Object.entries(body.properties)) {
      if (!required.has(name)) continue;
      sample[name] = name === "confirm" ? true : sampleValue(name, isRecord(raw) ? raw : {}, op.id);
    }
    lines.push(`  -d '${JSON.stringify(sample)}'`);
  } else {
    lines[lines.length - 1] = lines[lines.length - 1]!.replace(/ \\$/, "");
  }
  return lines;
}

const KIND_SECTIONS: { kind: ApiOpKind; title: string; blurb: string }[] = [
  { kind: "read", title: "Read operations", blurb: "Safe to call at any time. No `Idempotency-Key`, nothing is written, nothing is audited (`POST /sales/quote` is a read too)." },
  { kind: "write", title: "Write operations", blurb: "Change data. `Idempotency-Key` is required and every success is written to the audit log with the key name." },
  { kind: "danger", title: "Danger operations", blurb: "Hard to undo. On top of the write rules they need `confirm: true` and a `reason` of at least 5 characters. An AI agent must ask a human before calling these." },
];

/** ลำดับกลุ่มในคู่มือ (ตาม path ชั้นแรก) */
const GROUP_ORDER = ["units", "sales", "shifts", "devices", "products", "channels", "orders", "reports"];
const groupOf = (op: ApiOp) => op.path.split("/")[1] ?? "";
const sortOps = (ops: ApiOp[]) =>
  [...ops].sort((a, b) => GROUP_ORDER.indexOf(groupOf(a)) - GROUP_ORDER.indexOf(groupOf(b)) || (a.path + a.method).localeCompare(b.path + b.method));

// ── ตัวเรนเดอร์ endpoints.md ของสกิล Claude ─────────────────────────────────
export function renderEndpointsReference(ops: ApiOp[] = POS_OPS): string {
  const out: string[] = [];
  out.push(
    "# SHARK POS API — endpoint reference",
    "",
    "Generated from the operation registry by `scripts/gen-pos-api-docs.mts` (`--check` covers this file too). Do not edit by hand.",
    "",
    `Base URL: \`${BASE_URL}\`. ${ops.length} operations. Full prose, field tables and curl examples: \`docs/api/POS-API.md\` (also served at \`https://shark.in.th/developers/pos.md\`). Machine readable contract: \`/api/v1/pos/openapi.json\`.`,
    "",
  );
  for (const section of KIND_SECTIONS) {
    const group = sortOps(ops.filter((o) => o.kind === section.kind));
    if (group.length === 0) continue;
    out.push(`## ${section.title}`, "", section.blurb, "", "| Operation id | Method + path | Scope | Notes |", "| --- | --- | --- | --- |");
    for (const op of group) {
      const notes = [op.paged ? "paged" : "", op.csv ? "CSV" : "", op.rate === "report" ? "report rate" : ""].filter(Boolean).join(" · ") || "-";
      out.push(`| \`${op.id}\` | \`${op.method} ${op.path}\` | \`${op.action}\` | ${notes} |`);
    }
    out.push("");
  }
  return out.join("\n");
}

// ── ตัวเรนเดอร์ (บริสุทธิ์) ─────────────────────────────────────────────────
export function renderDocs(ops: ApiOp[] = POS_OPS): string {
  const spec = buildOpenApi(ops);
  const out: string[] = [];
  const push = (...lines: string[]) => out.push(...lines);

  push(
    `# ${spec.info.title}`,
    "",
    `Machine readable contract: \`/api/v1/pos/openapi.json\` (OpenAPI ${spec.openapi}, no API key needed).`,
    `Base URL: \`${BASE_URL}\` - contract version ${spec.info.version} - ${ops.length} operations.`,
    "Generated from the operation registry by `scripts/gen-pos-api-docs.mts`. Do not edit by hand: run the script.",
    "",
  );

  push(
    "## Who this is for",
    "",
    "- **AI agents** running a shop's point of sale on behalf of its owner: selling, finding bills, refunding, taking platform orders, marking items sold out, pulling reports. Read the Conventions and Error codes first: every failure has a stable `code` to branch on, and `message_th` is already worded for a Thai shop owner.",
    "- **Developers** wiring another system into the POS (a self-order kiosk, a delivery tablet bridge, a booking app, a nightly report job). Everything here is generated from the same registry the live API dispatches from.",
    "",
  );

  push(
    "## Authentication and scopes",
    "",
    "Send `Authorization: Bearer <api key>`. Keys are created by the shop owner in POS > Settings > SHARK connections > API keys; the raw key is shown once. A key is bound to one POS system.",
    "",
    "Scopes are the same permission keys the staff roles use, so a key can never do more than a person could. The key acts as a staff member of its own (seller id = key id, role STAFF): bills it sells are attributed to the key, not to the person who created it.",
    "",
    "| Bundle | What it can do | Scopes |",
    "| --- | --- | --- |",
  );
  for (const b of POS_BUNDLES) push(`| \`${b.id}\` | ${b.summary} | ${b.scopes.map((s) => `\`${s}\``).join(" ")} |`);
  push(
    "",
    `A key may be limited to some branches with the pseudo-scope \`${POS_FILTER_UNIT_PREFIX}<unitId>\` (one per branch). Branches outside the list answer 404 \`not_found\`, and reports without \`unitId\` only cover the allowed branches.`,
    "",
    "Not available through the API on purpose: staff PINs, manager PINs and deciding approval requests (a void or refund over the shop's approval rule waits for a manager in the app), opening and closing shifts, held bills, table service, deposits, gift cards and store credit as tenders, member point burning and coupons, the customer display, and device registration.",
    "",
  );

  push("## Conventions", "", "These are the rules of the module, copied verbatim from the contract description in `/api/v1/pos/openapi.json`:", "");
  for (const line of spec.info.description.split("\n")) push(line);
  push("");

  push(
    "### Selling, step by step",
    "",
    "1. `GET /units` - pick the branch (`unitId`).",
    "2. `GET /products?unitId=...` or `GET /products/lookup?unitId=...&barcode=...` - find the products (`productId`, `priceSatang`); `GET /products/{id}/options` for options.",
    "3. `POST /sales/quote` with `{ unitId, lines }` - the exact total (`grandTotalSatang`), VAT and lines the register would charge. Nothing is written.",
    "4. `POST /sales` with `{ unitId, lines, payMethods, expectedGrandTotalSatang }` and a fresh `Idempotency-Key` - the bill (`saleId`, `receiptNo`, `changeSatang`). Retry with the same key on a network error.",
    "5. `GET /sales/{id}/receipt` - the receipt to print or send.",
    "",
    "### Shapes of a reply",
    "",
    "- **Reads return the POS reader's answer in `data`.** When that answer has a single field, `data` is that field itself (for example `GET /sales/{id}` answers the bill, `GET /channels` the list of channels).",
    "- **`GET /sales`** answers the bills of the day in `data` and `page` next to it, plus `date`, `counts` and `summary` at the top level.",
    "- **`GET /products`** answers the products in `data`, `page` and `nextCursor` at the top level.",
    `- **CSV.** ${ops.filter((o) => o.csv).length} report operations render CSV when asked with \`Accept: text/csv\`.`,
    "- **Writes** answer the record they made or changed: `POST /sales` -> `{ saleId, receiptNo, grandTotalSatang, changeSatang, duplicated }`, `POST /sales/{id}/refund` -> `{ refund, sale }`, `POST /orders` -> `{ orderId, duplicated, saleId }`, `POST /orders/{id}/pay` -> `{ saleId, duplicated }`.",
    // POS P2.13 ▸ skill fix ช่องโหว่ 8 + 4/6 (บันทึกไว้ · เปลี่ยนชื่อ/คอลัมน์ = P2.14): duplicated ≠ การเล่นซ้ำ · ชื่อเงินของบิลไม่มี Satang · CSV เป็นบาท ◂
    "- **`duplicated` is not the replay flag.** A retry with the same `Idempotency-Key` inside the 24 hour window replays the stored first answer (so `duplicated` stays `false`) with the header `Idempotent-Replayed: true`. `duplicated: true` means the POS already held the record and returned it: the same `externalRef` on the same channel for `POST /orders`, or the same key after the replay window for `POST /sales` and `POST /orders/{id}/pay`.",
    // POS P2.14 ▸ API-10/11: ช่องว่างชื่อปิดแล้ว (totals *Satang · CSV รายวันมีคอลัมน์คืนเงิน) ◂
    "- **Money in reports and bills.** `GET /sales/{id}` answers its money under `totals` with the `Satang` suffix like every other field (`subtotalSatang`, `grandTotalSatang`, `refundedSatang`, ...). CSV reports show money in baht with two decimals, like the export button; the daily CSV carries refund count and refund total as its last two columns (after the average bill, so the older columns keep their places); the JSON report carries every `*Satang` field. Bill lines carry `costSatang` and `marginSatang` only when the key also holds `pos.report.view` and the line is stock-tracked and its stock was consumed (other keys, and lines without consumed stock, get no such field).", // POS P2.14 ▸ fix1 H2 · fix2 G4 ◂
    // POS P3-SKEL ▸ fix1 F2: bill.slips บน GET /sales/{id} (หลักฐานสลิปโอน · id + สถานะ · ไม่มีลิงก์ไฟล์) ◂
    "- **Transfer slips on a bill.** `GET /sales/{id}` also answers `slips`: one entry per transfer slip attached to the bill as evidence, `{ id, status, thumbUrl }` with `status` `UPLOADED`, `CONFIRMED` or `REJECTED` and `thumbUrl` always `null` (no file link is ever returned over REST; slips have no money effect). Bills without slips answer an empty list.",
    "",
  );

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
  push("| `internal` | 500 | The POS had an unexpected problem (POS only). | Retry; if it keeps failing, report the `requestId`. |", "");
  push(
    "### POS refusal reasons",
    "",
    "Under the code above, the POS tells why in `message_th` / `message_en`. This is the full table of the POS reasons and the code each one is answered with:",
    "",
    "| Reason | HTTP | `error.code` | `message_en` |",
    "| --- | --- | --- | --- |",
  );
  for (const [reason, row] of Object.entries(POS_REFUSAL_HTTP) as [PosRefusalCode, (typeof POS_REFUSAL_HTTP)[PosRefusalCode]][]) {
    push(`| \`${reason}\` | ${row.status} (${REFUSAL_GROUP[String(row.status)] ?? "-"}) | \`${row.code}\` | ${row.en} |`);
  }
  push("");

  push("## Operations", "");
  for (const section of KIND_SECTIONS) {
    const group = sortOps(ops.filter((o) => o.kind === section.kind));
    if (group.length === 0) continue;
    push(`### ${section.title}`, "", `${section.blurb} ${group.length} of the ${ops.length} operations.`, "");
    for (const op of group) {
      const operation = spec.paths[op.path]?.[op.method.toLowerCase()];
      if (!operation) continue;
      push(`#### \`${op.id}\``, "");
      const notes = [op.csv ? "`Accept: text/csv` supported" : "", op.paged ? "paged" : "", op.rate === "report" ? `report rate (${API_RATE_LIMITS.report.limit}/min)` : ""].filter(Boolean);
      push(`**${op.method} ${op.path}** - ${op.summary} · scope: \`${op.action}\` · ${op.kind}${notes.length ? ` · ${notes.join(" · ")}` : ""}`, "");
      const pathParams = operation.parameters.filter((p) => p.in === "path");
      if (pathParams.length > 0) push(`Path parameters: ${pathParams.map((p) => `\`${p.name}\``).join(", ")} (required).`, "");
      const table = op.method === "GET" ? queryTable(operation) : fieldTable(bodySchemaOf(operation) ?? {});
      if (table.length > 0) push(...table, "");
      else push(op.method === "GET" ? "No query parameters." : "No body fields.", "");
      push("```bash", ...curlExample(op, operation), "```", "");
    }
  }

  push(...webhookSection());

  push(
    "## Glossary (Thai <-> English POS terms)",
    "",
    "Field names and codes in this API are English. This table maps them to the Thai words a shop owner or cashier uses.",
    "",
    "| ไทย | English | In the API |",
    "| --- | --- | --- |",
  );
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
    const docOk = current === markdown;
    const refOk = currentRef === endpointsRef;
    if (docOk && refOk) {
      console.log(`✅ docs/api/POS-API.md + skill endpoints.md ตรงกับทะเบียน (${POS_OPS.length} op)`);
      process.exit(0);
    }
    if (!docOk) console.error(`❌ docs/api/POS-API.md ไม่ตรงกับทะเบียน (${current.length} ไบต์บนดิสก์ vs ${markdown.length} ไบต์ที่ควรเป็น)\n   แก้ด้วย: pnpm exec tsx scripts/gen-pos-api-docs.mts`);
    if (!refOk) console.error(`❌ skills/shark-pos-api/references/endpoints.md ไม่ตรงกับทะเบียน (${currentRef.length} ไบต์บนดิสก์ vs ${endpointsRef.length} ไบต์ที่ควรเป็น)\n   แก้ด้วย: pnpm exec tsx scripts/gen-pos-api-docs.mts`);
    process.exit(1);
  }
  mkdirSync(dirname(DOC_PATH), { recursive: true });
  writeFileSync(DOC_PATH, markdown, "utf8");
  mkdirSync(dirname(SKILL_ENDPOINTS_PATH), { recursive: true });
  writeFileSync(SKILL_ENDPOINTS_PATH, endpointsRef, "utf8");
  console.log(`✅ เขียน docs/api/POS-API.md + skill endpoints.md (${POS_OPS.length} op · ${markdown.length} ไบต์ / ${endpointsRef.length} ไบต์)`);
}
