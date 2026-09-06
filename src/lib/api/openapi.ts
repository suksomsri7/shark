// openapi.ts — แปลง "ทะเบียน op" เป็นเอกสาร OpenAPI 3.1 (ยกเป็นของกลางตอน K1.15)
//
// 🔴 ทะเบียนเดียว หลายทางออก: ไฟล์นี้ไม่มีรายชื่อ endpoint ของตัวเอง — มันอ่านจากทะเบียนที่ส่งเข้ามา
//    ล้วน ๆ ⇒ เพิ่ม op = spec + คู่มือ + สกิล AI ขยับตามเอง ไม่มีเอกสารที่ "เขียนมือแล้วลืมอัป"
//    (บทเรียนของ repo นี้: เอกสาร 1.9MB ที่บรรยายระบบที่ไม่มีจริง)
//
// กติกา 2 ข้อของฟังก์ชันนี้:
//   1) **บริสุทธิ์** — ไม่แตะ DB / เวลา / สุ่ม ⇒ input เดียวกันได้ JSON เท่ากันทุกไบต์
//      (route `/openapi.json` กับสคริปต์ generate คู่มือ ต้องได้ของชิ้นเดียวกันเป๊ะ)
//   2) **serializable** — ห้ามให้ handler/zod object หลุดเข้าไปในผลลัพธ์
//
// zod → JSON Schema ใช้ `z.toJSONSchema` ของ zod v4 (built-in) target `draft-2020-12`
// ซึ่งเป็นภาษาสคีมาของ OpenAPI 3.1 พอดี — ไม่ต้องพึ่งไลบรารีนอก

import { z, type ZodType } from "zod";
import { API_ERROR_CODES } from "./respond";
import type { ApiOp, ApiOpKind } from "./op";

/**
 * ส่วนหัวของเอกสาร — ต่างกันตามโมดูล (ชื่อ · เวอร์ชันสัญญา · เซิร์ฟเวอร์ · คำนำที่บอกกติกาของโมดูลนั้น)
 * 🔴 `description` เป็นอังกฤษล้วนเสมอ (ข้อสอบ OA-1.5 ของบัญชีบังคับไว้ · คู่มือหลักเป็นอังกฤษ)
 */
export type ApiDocInfo = {
  title: string;
  /** เวอร์ชันของ "สัญญา" ไม่ใช่ของ build — ขยับเมื่อสัญญาเปลี่ยนแบบเข้ากันไม่ได้เท่านั้น */
  version: string;
  serverUrl: string;
  serverDescription?: string;
  description: string;
  /** คำอธิบายของ securityScheme `bearer` (บอกว่าไปสร้างคีย์ที่หน้าไหน) */
  securityDescription: string;
};

/** เหตุผลขั้นต่ำของคำสั่งอันตราย — ต้องตรงกับ MIN_REASON ใน dispatch.ts */
const MIN_REASON = 5;

// ── ชนิดของเอกสาร (แคบพอจะกัน object แปลกปลอมหลุด แต่ยังใส่ x-* ได้) ──────────
export type JsonSchema = Record<string, unknown>;

export type OpenApiParameter = {
  name: string;
  in: "path" | "query" | "header";
  required: boolean;
  description: string;
  schema: JsonSchema;
};

export type OpenApiMediaType = { schema: JsonSchema };
export type OpenApiRequestBody = { required: boolean; content: Record<string, OpenApiMediaType> };
export type OpenApiResponse = { description: string; content?: Record<string, OpenApiMediaType> };

export type OpenApiOperation = {
  operationId: string;
  summary: string;
  description: string;
  "x-shark-kind": ApiOpKind;
  "x-shark-scope": string;
  "x-shark-tool"?: string;
  security: Record<string, string[]>[];
  parameters: OpenApiParameter[];
  requestBody?: OpenApiRequestBody;
  responses: Record<string, OpenApiResponse>;
};

export type OpenApiDocument = {
  openapi: string;
  info: { title: string; version: string; description: string };
  servers: { url: string; description: string }[];
  security: Record<string, string[]>[];
  components: {
    securitySchemes: Record<string, { type: string; scheme: string; description: string }>;
    schemas: Record<string, JsonSchema>;
  };
  paths: Record<string, Record<string, OpenApiOperation>>;
};

// ── helper ────────────────────────────────────────────────────────────────
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** ตัด key ที่ไม่ควรอยู่ในเอกสารรวม (`$schema` ของ draft) ออกทุกชั้น */
function stripSchemaMeta(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stripSchemaMeta);
  if (isRecord(v)) {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) {
      if (k === "$schema") continue;
      out[k] = stripSchemaMeta(val);
    }
    return out;
  }
  return v;
}

/**
 * zod → JSON Schema (draft 2020-12 = ภาษาของ OpenAPI 3.1)
 * `io: "input"` = สคีมาของ "สิ่งที่ผู้เรียกส่งมา" (ก่อน default/transform) ซึ่งคือสิ่งที่คู่มือต้องบอก
 * `unrepresentable: "any"` = ชนิดที่ JSON Schema ไม่มีคำพูดให้ (เช่น Date) กลายเป็น "อะไรก็ได้"
 *   แทนที่จะโยน — spec ต้องสร้างได้เสมอ ไม่งั้น `/openapi.json` ล่มทั้งไฟล์เพราะ op เดียว
 */
export function jsonSchemaOf(schema: ZodType, io: "input" | "output" = "input"): JsonSchema {
  const raw = z.toJSONSchema(schema, {
    target: "draft-2020-12",
    io,
    unrepresentable: "any",
    cycles: "ref",
    reused: "inline",
  }) as unknown;
  const cleaned = stripSchemaMeta(raw);
  return isRecord(cleaned) ? cleaned : {};
}

/** object schema ต้องปิดท้าย (`additionalProperties: false`) — field ที่พิมพ์ผิดต้องเด้ง ไม่ใช่เงียบ */
function closeObject(schema: JsonSchema): JsonSchema {
  if (schema.type !== "object" || schema.additionalProperties !== undefined) return schema;
  return { ...schema, additionalProperties: false };
}

/** ชื่อพารามิเตอร์ใน path template เช่น `/documents/{id}/lines/{lineId}` → ["id","lineId"] */
function pathParamNames(path: string): string[] {
  return [...path.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((m) => m[1]!);
}

function sortedRecord<T>(rec: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const k of Object.keys(rec).sort()) out[k] = rec[k]!;
  return out;
}

const ERROR_SCHEMA: JsonSchema = {
  type: "object",
  description: "Error envelope returned by every failing call.",
  properties: {
    error: {
      type: "object",
      properties: {
        code: {
          type: "string",
          enum: [...API_ERROR_CODES],
          description: "Stable machine readable reason. Branch on this, never on the message text.",
        },
        message_th: { type: "string", description: "Message in Thai, safe to show to the shop owner as is." },
        message_en: { type: "string", description: "Message in English for developers and logs." },
        hint: { type: "string", description: "What to do next, when there is a single obvious fix (for example the scope that is missing)." },
        details: {
          type: "array",
          description: "Field level problems, present for code `validation`.",
          items: {
            type: "object",
            properties: {
              path: { type: "string", description: "Dotted path of the offending field, for example `lines.0.qty`." },
              message: { type: "string", description: "What is wrong with that field." },
            },
            required: ["path", "message"],
            additionalProperties: false,
          },
        },
      },
      required: ["code", "message_th", "message_en"],
      additionalProperties: false,
    },
    requestId: { type: "string", description: "Same value as the `X-Request-Id` response header." },
  },
  required: ["error", "requestId"],
  additionalProperties: false,
};

/** คำอธิบายของแต่ละสถานะที่ทุก op ตอบได้ (ทำที่เดียว — เอกสารจะได้ไม่เพี้ยนกันเอง) */
const COMMON_ERROR_RESPONSES: [string, string][] = [
  ["401", "Missing, invalid or expired API key (`unauthorized`, `key_expired`)."],
  ["403", "The key may not do this: missing scope, or the key is bound to another accounting book (`scope_missing`, `system_mismatch`, `forbidden`)."],
  ["404", "No such operation, or the record does not exist in this book (`not_found`)."],
  ["422", "The payload did not pass validation, or the request cannot be completed as asked (`validation`, `unprocessable`)."],
  ["429", "Rate limit for this key exceeded. Wait for `Retry-After` seconds (`rate_limited`)."],
];

const WRITE_CONFLICT_RESPONSE: [string, string] = [
  "409",
  "Conflict: idempotency key reused with a different body or still running, a danger operation without `confirm: true`, a closed period, or a record whose state does not allow this (`idempotency_conflict`, `idempotency_in_progress`, `confirm_required`, `period_locked`, `state_conflict`, `duplicate`).",
];

/** ซองแบ่งหน้าของ op ที่ตั้ง `paged: true` — เลขหน้าจริง ไม่ใช่ cursor (ดู `paged()` ใน respond.ts) */
const PAGE_SCHEMA: JsonSchema = {
  type: "object",
  description: "Pagination state of this reply. Ask for the next page with `page: page + 1` while `hasMore` is true.",
  properties: {
    page: { type: "integer", minimum: 1, description: "Page that was returned, 1 based." },
    pageSize: { type: "integer", minimum: 1, maximum: 100, description: "Rows per page actually used (values above 100 are clamped)." },
    pageCount: { type: "integer", minimum: 1, description: "Number of pages for the current filter." },
    total: { type: "integer", minimum: 0, description: "Number of rows that match the filter, across all pages." },
    hasMore: { type: "boolean", description: "True when another page exists after this one." },
  },
  required: ["page", "pageSize", "pageCount", "total", "hasMore"],
  additionalProperties: false,
};

function errorResponse(description: string): OpenApiResponse {
  return {
    description,
    content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
  };
}

// ── การประกอบ op หนึ่งตัว ─────────────────────────────────────────────────

/** danger: ยัด `confirm` + `reason` เข้า schema ให้ตรงกับด่านจริงใน dispatch.ts */
function withDangerFields(schema: JsonSchema): JsonSchema {
  const properties: Record<string, unknown> = isRecord(schema.properties) ? { ...schema.properties } : {};
  properties.confirm = {
    type: "boolean",
    enum: [true],
    description: "Must be exactly true. Proves the caller meant to run an operation that is hard to undo.",
  };
  const existingReason = isRecord(properties.reason) ? { ...properties.reason } : {};
  const minLength = typeof existingReason.minLength === "number" ? existingReason.minLength : 0;
  properties.reason = {
    ...existingReason,
    type: "string",
    minLength: Math.max(minLength, MIN_REASON),
    description:
      typeof existingReason.description === "string"
        ? existingReason.description
        : `Why this is being done, at least ${MIN_REASON} characters. Stored in the audit log.`,
  };
  const required = Array.isArray(schema.required) ? schema.required.filter((r): r is string => typeof r === "string") : [];
  for (const key of ["confirm", "reason"]) if (!required.includes(key)) required.push(key);
  return { ...schema, type: "object", properties, required, additionalProperties: false };
}

/** GET: zod object → query parameter รายตัว (ผู้เรียกอ่านง่ายกว่าเห็นเป็นก้อน schema เดียว) */
function queryParameters(inputSchema: JsonSchema): OpenApiParameter[] {
  if (!isRecord(inputSchema.properties)) return [];
  const required = new Set(
    Array.isArray(inputSchema.required) ? inputSchema.required.filter((r): r is string => typeof r === "string") : [],
  );
  const out: OpenApiParameter[] = [];
  for (const [name, raw] of Object.entries(inputSchema.properties)) {
    const propSchema = isRecord(raw) ? raw : {};
    const description = typeof propSchema.description === "string" ? propSchema.description : `Query parameter \`${name}\`.`;
    out.push({ name, in: "query", required: required.has(name), description, schema: propSchema });
  }
  return out;
}

function describeOp(op: ApiOp): string {
  const kindSentence =
    op.kind === "read"
      ? "Read-only operation: it changes nothing and needs no Idempotency-Key."
      : op.kind === "write"
        ? "Write operation: an `Idempotency-Key` header is required and the call is recorded in the audit log."
        : `Danger operation: hard to undo. Requires an \`Idempotency-Key\` header, \`confirm: true\` and a \`reason\` of at least ${MIN_REASON} characters, and is recorded in the audit log.`;
  return `${op.label}\n\n${kindSentence} The API key must hold the scope \`${op.action}\`.`;
}

function buildOperation(op: ApiOp): OpenApiOperation {
  const isWriteLike = op.kind === "write" || op.kind === "danger";

  // ── parameters: path → header → query (เรียงแบบที่คนอ่านไล่ตาม URL ได้) ──
  const parameters: OpenApiParameter[] = pathParamNames(op.path).map((name) => ({
    name,
    in: "path",
    required: true,
    description: `\`${name}\` from the path.`,
    schema: { type: "string" },
  }));
  parameters.push({
    name: "X-Shark-System",
    in: "header",
    required: false,
    description: "Id of the accounting book to work in. Required only when the API key is not bound to a single book; if the key is bound, this must match it.",
    schema: { type: "string" },
  });
  if (isWriteLike) {
    parameters.push({
      name: "Idempotency-Key",
      in: "header",
      required: true,
      description: "Unique per logical attempt (a UUID is fine). Retrying with the same key and body replays the first response instead of doing the work twice.",
      schema: { type: "string" },
    });
  }

  // ── body / query ──────────────────────────────────────────────────────
  let requestBody: OpenApiRequestBody | undefined;
  const inputSchema = op.input ? closeObject(jsonSchemaOf(op.input, "input")) : undefined;
  if (op.method === "GET") {
    if (inputSchema) parameters.push(...queryParameters(inputSchema));
  } else if (isWriteLike || inputSchema) {
    // read ที่เป็น POST มีจริง (`documents.parse` — ข้อความยาวเกินจะยัดใน query string)
    // ⇒ ต้องบรรยาย body ของมันด้วย ไม่งั้นคู่มือบอกว่า "ไม่มีช่องให้ส่ง" ทั้งที่ต้องส่ง `text`
    const base = inputSchema ?? { type: "object", properties: {}, required: [], additionalProperties: false };
    const schema = op.kind === "danger" ? withDangerFields(base) : base;
    requestBody = { required: true, content: { "application/json": { schema } } };
  }

  // ── responses ─────────────────────────────────────────────────────────
  const dataSchema: JsonSchema = op.output ? jsonSchemaOf(op.output, "output") : {};
  const okProperties: Record<string, JsonSchema> = {
    data: dataSchema,
    requestId: { type: "string", description: "Same value as the `X-Request-Id` response header." },
  };
  // op ที่แบ่งหน้าคืน `page` เสมอ และอาจมีฟิลด์สรุประดับบนสุดเพิ่ม (เช่น `tabCounts` ของรายการเอกสาร)
  // ⇒ ไม่ปิดสคีมา (additionalProperties: true) เพราะฟิลด์เสริมต่างกันไปตาม op
  if (op.paged) okProperties.page = PAGE_SCHEMA;
  const responses: Record<string, OpenApiResponse> = {
    "200": {
      description: op.csv
        ? "Success. Send `Accept: text/csv` to get a CSV file instead of the JSON envelope."
        : "Success.",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: okProperties,
            required: op.paged ? ["data", "page", "requestId"] : ["data", "requestId"],
            ...(op.paged ? { additionalProperties: true } : {}),
          },
        },
        ...(op.csv
          ? { "text/csv": { schema: { type: "string", description: "CSV file, UTF-8 with a BOM, comma separated." } } }
          : {}),
      },
    },
  };
  const errorStatuses = isWriteLike ? [...COMMON_ERROR_RESPONSES, WRITE_CONFLICT_RESPONSE] : COMMON_ERROR_RESPONSES;
  for (const [status, description] of errorStatuses) responses[status] = errorResponse(description);

  const operation: OpenApiOperation = {
    operationId: op.id,
    summary: op.summary,
    description: describeOp(op),
    "x-shark-kind": op.kind,
    "x-shark-scope": op.action,
    ...(op.tool ? { "x-shark-tool": op.tool.name } : {}),
    security: [{ bearer: [] }],
    parameters,
    ...(requestBody ? { requestBody } : {}),
    responses: sortedRecord(responses),
  };
  return operation;
}

// ── ทางเข้าเดียว ──────────────────────────────────────────────────────────

/**
 * ทะเบียน op → เอกสาร OpenAPI 3.1 (บริสุทธิ์ · ไม่แตะ DB · เรียกซ้ำได้ผลเท่ากันทุกไบต์)
 * path/method เรียงตามตัวอักษร ⇒ ลำดับที่ลงทะเบียนเปลี่ยน แต่ไฟล์ที่ได้ไม่เปลี่ยน (diff สะอาด)
 */
export function buildOpenApi(ops: readonly ApiOp[], info: ApiDocInfo): OpenApiDocument {
  const paths: Record<string, Record<string, OpenApiOperation>> = {};
  for (const op of ops) {
    const item = (paths[op.path] ??= {});
    item[op.method.toLowerCase()] = buildOperation(op);
  }
  const sortedPaths: Record<string, Record<string, OpenApiOperation>> = {};
  for (const p of Object.keys(paths).sort()) sortedPaths[p] = sortedRecord(paths[p]!);

  return {
    openapi: "3.1.0",
    info: {
      title: info.title,
      version: info.version,
      description: info.description,
    },
    servers: [{ url: info.serverUrl, description: info.serverDescription ?? "Production" }],
    security: [{ bearer: [] }],
    components: {
      securitySchemes: {
        bearer: {
          type: "http",
          scheme: "bearer",
          description: info.securityDescription,
        },
      },
      schemas: { Error: ERROR_SCHEMA },
    },
    paths: sortedPaths,
  };
}
