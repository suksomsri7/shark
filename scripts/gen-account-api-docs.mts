// gen-account-api-docs.mts — สร้าง `docs/api/ACCOUNT-API.md` จากทะเบียน op + OpenAPI (WO A4)
//
// รัน:  pnpm exec tsx scripts/gen-account-api-docs.mts          → เขียนไฟล์
//       pnpm exec tsx scripts/gen-account-api-docs.mts --check  → exit 0 ถ้าไฟล์ตรง · 1 ถ้าเก่า
//
// 🔴 คู่มือเล่มนี้ "ห้ามเขียนมือ": ทุกบรรทัดของ endpoint มาจากทะเบียนเดียวกับที่ REST ใช้จริง
//    ⇒ เอกสารโกหกไม่ได้ (fitness F13.2 เฝ้าอยู่: ไฟล์ต่างจาก generator เมื่อไร = แดง)
// ไม่แตะ DB · ไม่ต่อเน็ต · ผลลัพธ์เท่ากันทุกครั้ง (ฟังก์ชัน renderDocs บริสุทธิ์ · fitness import ไปใช้ตรง ๆ)
//
// ภาษา: อังกฤษเป็นหลัก (เจ้าของเคาะ — ผู้เชื่อมต่อ/agent ส่วนใหญ่อ่านอังกฤษ)
//       ท้ายเล่มมี glossary ไทย↔อังกฤษ ไว้ให้คนไทยเทียบศัพท์บัญชีกับชื่อ field

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { API_SCOPE_BUNDLES, DEFAULT_BUNDLE_ID, DEFAULT_KEY_TTL_DAYS } from "@/lib/api-keys/scopes";
import { buildOpenApi, type JsonSchema, type OpenApiOperation } from "@/lib/modules/account/api/openapi";
import type { ApiOp, ApiOpKind } from "@/lib/modules/account/api/op";
import { ACCOUNT_OPS } from "@/lib/modules/account/api/registry";
import { API_ERROR_CODES, type ApiErrorCode } from "@/lib/modules/account/api/respond";
import { WEBHOOK_EVENTS } from "@/lib/webhooks/labels";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const DOC_PATH = resolve(ROOT, "docs/api/ACCOUNT-API.md");
const BASE_URL = "https://shark.in.th/api/v1/account";

// ── ตารางรหัสข้อผิดพลาด ───────────────────────────────────────────────────
// `Record<ApiErrorCode, ...>` โดยตั้งใจ: เพิ่มรหัสใน respond.ts แล้วลืมอธิบายที่นี่ = typecheck แดง
type CodeDoc = { status: number; meaning: string; action: string };
const ERROR_CODE_DOCS: Record<ApiErrorCode, CodeDoc> = {
  unauthorized: {
    status: 401,
    meaning: "No `Authorization: Bearer` header, or the key is unknown or revoked.",
    action: "Check the header spelling and that the key was not revoked in the accounting settings.",
  },
  key_expired: {
    status: 401,
    meaning: "The key was valid but its expiry date has passed.",
    action: "Rotate the key in the accounting settings; the old key stops working immediately.",
  },
  system_required: {
    status: 400,
    meaning: "The key is not bound to one accounting book and no `X-Shark-System` header was sent.",
    action: "Send `X-Shark-System: <book id>`, or use a key that is bound to a single book.",
  },
  system_mismatch: {
    status: 403,
    meaning: "`X-Shark-System` points at a different book than the key is bound to, or at a system that is not an accounting book of this shop.",
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
  not_found: {
    status: 404,
    meaning: "No such operation, or the record does not exist inside this accounting book.",
    action: "Check the path against this document and that the id belongs to the same book.",
  },
  method_not_allowed: {
    status: 405,
    meaning: "The path exists but not with this HTTP method. The `Allow` header lists what works.",
    action: "Use one of the methods in `Allow`.",
  },
  rate_limited: {
    status: 429,
    meaning: "Too many calls for this key: 300 reads, 60 writes or 30 reports per minute.",
    action: "Wait `Retry-After` seconds and retry; watch `X-RateLimit-Remaining` to slow down before you hit it.",
  },
  period_locked: {
    status: 409,
    meaning: "The accounting period of that date is closed or locked.",
    action: "Post to an open period, or ask the accountant to reopen the period.",
  },
  state_conflict: {
    status: 409,
    meaning: "The record is not in a state that allows this (for example issuing a document that is already issued).",
    action: "Read the current state first, then choose the operation that fits it.",
  },
  duplicate: {
    status: 409,
    meaning: "A conflicting record already exists (duplicate number, code or link).",
    action: "Reuse the existing record, or send a different unique value.",
  },
  forbidden: {
    status: 403,
    meaning: "The operation is refused by a business rule, not by the scope check.",
    action: "Read `message_en`; this usually needs a settings change by the shop owner.",
  },
  unprocessable: {
    status: 422,
    meaning: "The request was understood but cannot be completed as asked.",
    action: "Read `message_en` and `message_th`; the Thai message is safe to show to the shop owner.",
  },
  upstream_unavailable: {
    status: 503,
    meaning: "An external service this operation depends on (for example the DBD company registry lookup) is not configured or not reachable right now.",
    action: "Retry later, or ask the shop owner to finish configuring the integration; this is not caused by the request itself.",
  },
};

// ── glossary ไทย ↔ อังกฤษ ─────────────────────────────────────────────────
const GLOSSARY: [string, string, string][] = [
  ["สมุดบัญชี", "accounting book (AppSystem of type ACCOUNT)", "`X-Shark-System` / `systemId`"],
  ["ใบเสนอราคา", "quotation", "`QUOTATION`"],
  ["ใบแจ้งหนี้", "invoice", "`INVOICE`"],
  ["ใบเสร็จรับเงิน", "receipt", "`RECEIPT`"],
  ["ใบกำกับภาษี", "tax invoice", "`TAX_INVOICE`"],
  ["ใบลดหนี้ / ใบเพิ่มหนี้", "credit note / debit note", "`CREDIT_NOTE` / `DEBIT_NOTE`"],
  ["ใบสั่งซื้อ", "purchase order", "`PURCHASE_ORDER`"],
  ["มัดจำ", "deposit", "`depositSatang`"],
  ["ยกเลิกเอกสาร", "void a document", "danger operation"],
  ["ผู้ติดต่อ (ลูกค้า/ผู้ขาย)", "contact (customer / supplier)", "`contactId`"],
  ["ผังบัญชี", "chart of accounts", "`chart`"],
  ["สมุดรายวัน", "journal", "`journal`"],
  ["บัญชีแยกประเภท", "general ledger", "`general-ledger`"],
  ["งวดบัญชี / ปิดงวด", "accounting period / period close", "`period_locked`"],
  ["ภาษีมูลค่าเพิ่ม", "VAT", "`vatSatang`"],
  ["ภาษีหัก ณ ที่จ่าย", "withholding tax (WHT)", "`whtSatang`"],
  ["กระทบยอด", "reconciliation", "`reconcile`"],
  ["เช็ค", "cheque", "`cheque`"],
  ["สินทรัพย์ถาวร / ค่าเสื่อม", "fixed asset / depreciation", "`asset`"],
  ["สตางค์", "satang (1/100 of a baht)", "every `*Satang` field"],
];

// ── Webhooks (WO C4) ──────────────────────────────────────────────────────
// รายชื่อ event มาจาก `src/lib/webhooks/labels.ts` ตัวเดียวกับที่หน้าตั้งค่าใช้ ⇒ คู่มือโกหกไม่ได้
// ตัวอย่าง body ต้องตรงกับ payload ที่ `src/lib/modules/account/events.ts` ประกอบจริง
const WEBHOOK_EVENT_DOCS: Record<string, { when: string; payload: Record<string, unknown> }> = {
  "account.document.issued": {
    when: "A document left draft and got its real document number (sales, purchase, purchase order sent for approval, approved stock issue).",
    payload: {
      documentId: "cmf1doc0001",
      type: "INVOICE",
      docNo: "IV-202609-0007",
      status: "AWAITING_PAYMENT",
      contactId: "cmf1con0001",
      grandTotalSatang: 107000,
      issueDate: "2026-09-05",
      source: "API",
    },
  },
  "account.document.approved": {
    when: "A purchase order was approved.",
    payload: { documentId: "cmf1doc0002", docType: "PURCHASE_ORDER", approvedById: "cmf1usr0001" },
  },
  "account.document.voided": {
    when: "A document was cancelled (draft) or voided (already posted, journal reversed).",
    payload: { documentId: "cmf1doc0001", type: "INVOICE", docNo: "IV-202609-0007", reason: "customer cancelled the order" },
  },
  "account.quotation.responded": {
    when: "A quotation was accepted or rejected. The idempotency key carries the answer, so a later change of mind is delivered too.",
    payload: { documentId: "cmf1doc0003", docNo: "QT-202609-0004", accepted: true },
  },
  "account.payment.recorded": {
    when: "A receipt or a vendor payment was recorded against a document.",
    payload: { documentId: "cmf1doc0001", paymentId: "cmf1pay0001", amountSatang: 107000, docType: "INVOICE" },
  },
  "account.payment.voided": {
    when: "A recorded payment was voided (journal reversed, document goes back to unpaid or partial).",
    payload: {
      paymentId: "cmf1pay0001",
      documentId: "cmf1doc0001",
      docNo: "IV-202609-0007",
      amountSatang: 107000,
      reason: "wrong bank account",
    },
  },
  "account.invoice.paid": {
    when: "An invoice reached fully paid.",
    payload: { documentId: "cmf1doc0001", docNo: "IV-202609-0007", grandTotalSatang: 107000 },
  },
  "account.payment_request.paid": {
    when: "A PromptPay payment link was paid - either confirmed by the provider webhook or by a staff member for a static QR.",
    payload: {
      requestId: "cmf1req0001",
      documentId: "cmf1doc0001",
      docNo: "IV-202609-0007",
      amountSatang: 53500,
      provider: "PROMPTPAY_STATIC",
      paymentId: "cmf1pay0002",
    },
  },
  "account.payment_request.expired": {
    when: "A payment link passed its expiry date and was closed by the hourly job.",
    payload: { requestId: "cmf1req0002", documentId: "cmf1doc0004", docNo: "IV-202609-0008", amountSatang: 53500 },
  },
  "account.period.closed": {
    when: "An accounting period was closed.",
    payload: { periodKey: "2026-08", closedById: "cmf1usr0001" },
  },
  "account.contact.created": {
    when: "A contact (customer or supplier) was created.",
    payload: {
      contactId: "cmf1con0001",
      code: "C00007",
      name: "Siam Dive Center Co., Ltd.",
      kind: "CUSTOMER",
      taxId: "0105561000007",
      phone: "0811111111",
      email: "billing@example.com",
    },
  },
  "account.contact.updated": {
    when: "A contact was edited. The idempotency key includes the row `updatedAt` in milliseconds, so every edit is its own delivery.",
    payload: {
      contactId: "cmf1con0001",
      code: "C00007",
      name: "Siam Dive Center Co., Ltd.",
      kind: "CUSTOMER",
      taxId: "0105561000007",
      phone: "0811111111",
      email: "accounts@example.com",
    },
  },
  "account.contact.merged": {
    when: "Two duplicate contacts were merged. Stop using `mergedId`: every document now points at `keepId`.",
    payload: {
      keepId: "cmf1con0001",
      mergedId: "cmf1con0002",
      moved: { documents: 3, journalLines: 6, groups: 1, recurringRules: 0 },
    },
  },
  "account.product.created": {
    when: "A product or service was created.",
    payload: { productId: "cmf1prd0001", code: "P00024", sku: "DIVE-FIN-L", name: "Fins (L)", type: "GOODS", salePriceSatang: 250000 },
  },
  "account.product.updated": {
    when: "A product or service was edited. Same `updatedAt` rule as `account.contact.updated`.",
    payload: { productId: "cmf1prd0001", code: "P00024", sku: "DIVE-FIN-L", name: "Fins (L)", type: "GOODS", salePriceSatang: 270000 },
  },
  "account.cheque.changed": {
    when: "A cheque's status changed: deposited, cleared, bounced or voided. Fires once per transition (the idempotency key ends in the status), so the same cheque can appear several times as it moves through its life.",
    payload: { chequeId: "cmf1chq0001", direction: "IN", chequeNo: "1234567", status: "CLEARED", amountSatang: 500000 },
  },
  "account.reconcile.confirmed": {
    when: "A month of bank reconciliation for one channel was confirmed.",
    payload: { financeId: "cmf1fin0001", periodKey: "2026-08", matched: 42, statementBalanceSatang: 1250000 },
  },
  "account.period.reopened": {
    when: "A closed accounting period was reopened.",
    payload: { periodKey: "2026-08", reason: "correcting a posting error found by the auditor", reopenedById: "cmf1usr0001" },
  },
  "account.asset.depreciated": {
    when: "Monthly depreciation was posted for one fixed asset.",
    payload: { assetId: "cmf1ast0001", code: "FA-0007", periodKey: "2026-08", amountSatang: 41700 },
  },
  "account.asset.disposed": {
    when: "A fixed asset was sold or written off.",
    payload: { assetId: "cmf1ast0001", code: "FA-0007", mode: "SELL", proceedsSatang: 300000, gainLossSatang: -50000, disposedAt: "2026-09-05" },
  },
  "account.recurring.ran": {
    when: "A recurring document rule produced its document for the period (draft or auto-issued - check the document itself, or `account.document.issued`, for the outcome).",
    payload: { ruleId: "cmf1rec0001", documentId: "cmf1doc0005", docType: "INVOICE", runDate: "2026-09-01", issued: true },
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
  const accountEvents = WEBHOOK_EVENTS.filter((e) => e.value.startsWith("account."));
  const out: string[] = [
    "## Webhooks",
    "",
    "Everything above is you calling SHARK. Webhooks are SHARK calling you: the shop owner adds an endpoint URL in the accounting book settings (Connections > External apps / API), ticks the events it wants, and gets a signing secret shown once.",
    "",
    "Delivery is at least once and ordered by the moment the change was committed. Events are written inside the same database transaction as the change itself, so an event exists only if the change really happened, and a change never happens without its event. A delivery that does not answer 2xx within 5 seconds is retried up to 5 times with a growing delay, so **make your handler idempotent**: key on the ids in the payload.",
    "",
    "### Request format",
    "",
    "`POST <your url>` with `Content-Type: application/json` and these headers:",
    "",
    "| Header | Value |",
    "| --- | --- |",
    "| `X-Shark-Event` | The event type, for example `account.document.issued`. |",
    "| `X-Shark-Signature` | `HMAC-SHA256(secret, raw request body)` as lowercase hex. |",
    "",
    "The body is always the same three fields:",
    "",
    "```json",
    JSON.stringify({ type: "account.document.issued", payload: { documentId: "cmf1doc0001" }, sentAt: "2026-09-05T09:15:00.000Z" }, null, 2),
    "```",
    "",
    "`payload` never contains your shop id or accounting book id: the endpoint already belongs to one shop. Money fields are integers of satang and end in `Satang`, calendar dates are `YYYY-MM-DD` (UTC+7) and instants are ISO-8601 UTC ending in `At` - the same conventions as the REST API.",
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
  for (const e of accountEvents) {
    out.push(`| \`${e.value}\` | ${WEBHOOK_EVENT_DOCS[e.value]?.when ?? "-"} |`);
  }
  out.push("");
  for (const e of accountEvents) {
    const doc = WEBHOOK_EVENT_DOCS[e.value];
    if (!doc) continue;
    out.push(`#### \`${e.value}\``, "", doc.when, "", "```json", JSON.stringify({ type: e.value, payload: doc.payload, sentAt: "2026-09-05T09:15:00.000Z" }, null, 2), "```", "");
  }
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
  if (Array.isArray(schema.anyOf) || Array.isArray(schema.oneOf)) return "one of several shapes";
  return "any";
}

/** ข้อจำกัดที่ผู้เรียกต้องรู้ ไม่ใช่ทั้ง schema (คู่มืออ่านง่ายกว่าเมื่อเห็นเฉพาะกฎ) */
function schemaRules(schema: JsonSchema): string {
  const rules: string[] = [];
  if (typeof schema.description === "string") rules.push(schema.description);
  if (typeof schema.minLength === "number") rules.push(`min length ${schema.minLength}`);
  if (typeof schema.maxLength === "number") rules.push(`max length ${schema.maxLength}`);
  if (typeof schema.minimum === "number" && schema.minimum > Number.MIN_SAFE_INTEGER) rules.push(`min ${schema.minimum}`);
  if (typeof schema.maximum === "number" && schema.maximum < Number.MAX_SAFE_INTEGER) rules.push(`max ${schema.maximum}`);
  if (typeof schema.format === "string") rules.push(`format ${schema.format}`);
  return rules.join(" · ") || "-";
}

/** ค่าตัวอย่างที่ "ผ่าน schema จริง" — เอาไปวางใน curl แล้วยิงได้เลย */
function sampleValue(name: string, schema: JsonSchema): unknown {
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];
  const t = typeof schema.type === "string" ? schema.type : "string";
  if (t === "integer" || t === "number") {
    const min = typeof schema.minimum === "number" ? schema.minimum : 0;
    return /satang$/i.test(name) ? Math.max(min, 10000) : min;
  }
  if (t === "boolean") return true;
  if (t === "array") return [];
  if (t === "object") return {};
  const min = typeof schema.minLength === "number" ? schema.minLength : 0;
  const base = name === "reason" ? "reason for the audit log" : `example ${name}`;
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
      sample[name] = sampleValue(name, isRecord(raw) ? raw : {});
    }
    lines.push(`  -d '${JSON.stringify(sample)}'`);
  } else {
    lines[lines.length - 1] = lines[lines.length - 1]!.replace(/ \\$/, "");
  }
  return lines;
}

function queryString(operation: OpenApiOperation): string {
  const required = operation.parameters.filter((p) => p.in === "query" && p.required);
  if (required.length === 0) return "";
  return "?" + required.map((p) => `${p.name}=${encodeURIComponent(String(sampleValue(p.name, p.schema)))}`).join("&");
}

const KIND_SECTIONS: { kind: ApiOpKind; title: string; blurb: string }[] = [
  { kind: "read", title: "Read operations", blurb: "Safe to call at any time. No `Idempotency-Key`, nothing is written, nothing is audited." },
  { kind: "write", title: "Write operations", blurb: "Change data. `Idempotency-Key` is required and every success is written to the audit log with the key name." },
  { kind: "danger", title: "Danger operations", blurb: "Hard to undo. On top of the write rules they need `confirm: true` and a `reason` of at least 5 characters. An AI agent must ask a human before calling these." },
];

// ── ตัวเรนเดอร์ (บริสุทธิ์) ─────────────────────────────────────────────────
export function renderDocs(ops: ApiOp[] = ACCOUNT_OPS): string {
  const spec = buildOpenApi(ops);
  const out: string[] = [];
  const push = (...lines: string[]) => out.push(...lines);

  // 5 บรรทัดแรกต้องเป็นอังกฤษล้วน (ข้อสอบ OA-4.3) — ผู้อ่านคนแรกคือ agent/นักพัฒนา
  push(
    `# ${spec.info.title}`,
    "",
    `Machine readable contract: \`/api/v1/account/openapi.json\` (OpenAPI ${spec.openapi}, no API key needed).`,
    `Base URL: \`${BASE_URL}\` - contract version ${spec.info.version} - ${ops.length} operations.`,
    "Generated from the operation registry by `scripts/gen-account-api-docs.mts`. Do not edit by hand: run the script.",
    "",
  );

  // ── Who this is for ─────────────────────────────────────────────────
  push(
    "## Who this is for",
    "",
    "- **AI agents** driving the accounting book on behalf of a shop owner. Read the Conventions and the Error codes table first: every failure has a stable `code` to branch on, and `message_th` is already worded for a Thai shop owner, so it can be shown as is.",
    "- **Developers** integrating another system (webshop, POS, spreadsheet job). Everything in this document is generated from the same registry the live API dispatches from, so nothing here can drift from the running code.",
    "",
  );

  // ── Auth & scopes ───────────────────────────────────────────────────
  push(
    "## Authentication and scopes",
    "",
    "Send `Authorization: Bearer <api key>`. Keys are created by the shop owner in the accounting book settings (Connections > External apps / API); the raw key is shown once.",
    "",
    `A key carries a list of scopes. Scopes are the same permission keys the human roles use, so a key can never do more than a person could. Bundles are ready made sets; the owner can still tick single scopes on top. Default for a key created from the accounting page: **${DEFAULT_BUNDLE_ID}**, valid for ${DEFAULT_KEY_TTL_DAYS} days.`,
    "",
    "| Bundle | What it can do | Scopes |",
    "| --- | --- | --- |",
  );
  for (const b of API_SCOPE_BUNDLES) {
    push(`| \`${b.id}\` | ${b.summary} | ${b.scopes.map((s) => `\`${s}\``).join(" ")} |`);
  }
  push(
    "",
    "A key is normally bound to one accounting book. If it is not, every call must carry `X-Shark-System: <book id>`. Calls that need a scope the key lacks fail with 403 `scope_missing` and the missing scope in `hint`.",
    "",
  );

  // ── Conventions ─────────────────────────────────────────────────────
  push(
    "## Conventions",
    "",
    "- **Money is satang.** Every amount is an integer number of satang (1 baht = 100 satang) and the field name ends with `Satang`. 1,250.50 baht is `125050`. Decimals are rejected, never rounded.",
    "- **Dates are `YYYY-MM-DD`.** A date field means a Thai calendar day (UTC+7), not an instant. Fields that really are instants are ISO-8601 UTC strings and are named `*At`.",
    "- **Idempotency.** Every write (POST, PATCH, PUT, DELETE) requires an `Idempotency-Key` header, unique per logical attempt. Retrying with the same key and the same body replays the stored response and adds `Idempotent-Replayed: true`; the same key with a different body fails with 409 `idempotency_conflict`. Records are kept 24 hours.",
    "- **`X-Shark-System`.** Selects the accounting book when the key is not bound to one. When the key is bound, the header may be sent only if it matches.",
    "- **Danger operations.** `confirm: true` plus a `reason` of at least 5 characters. The reason is stored in the audit log next to the key name.",
    "- **Envelope.** Success is `{ data, page?, requestId }`. Failure is `{ error: { code, message_th, message_en, hint?, details? }, requestId }`. `requestId` is also the `X-Request-Id` header; quote it in support tickets.",
    "- **Pagination.** Lists take `page` (1 based, default 1) and `pageSize` (default 20, maximum 100; a larger value is clamped to 100, not rejected) as query parameters, and answer with `page: { page, pageSize, pageCount, total, hasMore }` next to `data`. Keep asking for `page + 1` while `hasMore` is true. Some list operations add one more top level field with counters for the filter, for example `tabCounts`.",
    "- **Rate limits.** Per key, per class, per minute: 300 reads, 60 writes, 30 reports. 429 carries `Retry-After`; successful calls carry `X-RateLimit-Remaining`.",
    "- **Unknown fields are rejected.** Bodies are closed schemas (`additionalProperties: false`), so a typo fails loudly with 422 `validation` instead of being ignored.",
    "",
  );

  // ── Error codes ─────────────────────────────────────────────────────
  push(
    "## Error codes",
    "",
    "Branch on `error.code`, never on the message text.",
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
    push(`### ${section.title}`, "", section.blurb, "");
    for (const op of group) {
      const operation = spec.paths[op.path]?.[op.method.toLowerCase()];
      if (!operation) continue;
      push(`#### \`${op.id}\``, "");
      push(`**${op.method} ${op.path}** - ${op.summary} · scope: \`${op.action}\` · ${op.kind}`, "");
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

  // ── Webhooks ────────────────────────────────────────────────────────
  push(...webhookSection());

  // ── Glossary ────────────────────────────────────────────────────────
  push(
    "## Glossary (Thai <-> English accounting terms)",
    "",
    "Field names and codes in this API are English. This table maps them to the Thai words a shop owner or accountant uses.",
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
  if (process.argv.includes("--check")) {
    const current = existsSync(DOC_PATH) ? readFileSync(DOC_PATH, "utf8") : "";
    if (current === markdown) {
      console.log(`✅ docs/api/ACCOUNT-API.md ตรงกับทะเบียน (${ACCOUNT_OPS.length} op)`);
      process.exit(0);
    }
    console.error(
      `❌ docs/api/ACCOUNT-API.md ไม่ตรงกับทะเบียน (${current.length} ไบต์บนดิสก์ vs ${markdown.length} ไบต์ที่ควรเป็น)\n` +
        "   แก้ด้วย: pnpm exec tsx scripts/gen-account-api-docs.mts",
    );
    process.exit(1);
  }
  mkdirSync(dirname(DOC_PATH), { recursive: true });
  writeFileSync(DOC_PATH, markdown, "utf8");
  console.log(`✅ เขียน docs/api/ACCOUNT-API.md (${ACCOUNT_OPS.length} op · ${markdown.length} ไบต์)`);
}
