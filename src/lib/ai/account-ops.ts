// account-ops.ts — สะพานระหว่าง "ทะเบียน op ของ API บัญชี" กับ "ผู้ช่วย AI" (WO E1)
//
// 🔴 หลักการเดียวของไฟล์นี้: **ไม่มีตรรกะบัญชีของตัวเอง**
//    ทุกอย่างที่ทำได้ = op ที่ประกาศ `tool` ไว้ในทะเบียน (`ACCOUNT_OPS`) เท่านั้น
//    ⇒ เพิ่มความสามารถให้ผู้ช่วย = ใส่ `tool: { name, hint }` ให้ op นั้น ไม่ต้องแก้ไฟล์นี้
//    ⇒ สคีมา · การตรวจ input · สิทธิ์ · audit = ตัวเดียวกับ REST (ผ่าน `api/run.ts`) ห้ามลอกซ้ำ
//
// ทางเดินของงาน:
//   อ่าน (kind read)          → รันทันทีด้วย actor `assistant` (สิทธิ์อ่านอย่างเดียว) → แปลงผลเป็น JSON คีย์ไทย
//   เขียน/อันตราย (write/danger) → **ไม่ทำ** แต่คืน "ข้อเสนอ" ให้เจ้าของกดยืนยัน (proposals.ts)
//                                 ตอนยืนยันจึงรันด้วย actor `user` = สิทธิ์ของคนกดจริง (assertCan ที่ proposals.ts)
//
// ไฟล์นี้ห้าม import `./proposals` (proposals ต้อง import ที่นี่เพื่อ derive KIND_ACCESS — จะเป็นวงกลม)

import { z } from "zod";
import { tenantDb } from "@/lib/core/db";
import type { MembershipCtx } from "@/lib/core/rbac";
import { docTypeLabel } from "@/lib/modules/account/dashboard";
import {
  actorCan,
  membershipFromScopes,
  scopesCanAccount,
  type ApiActor,
} from "@/lib/modules/account/api/actor";
import { jsonSchemaOf } from "@/lib/modules/account/api/openapi";
import type { ApiOp } from "@/lib/modules/account/api/op";
import { ACCOUNT_OPS } from "@/lib/modules/account/api/registry";
import { mapError } from "@/lib/modules/account/api/respond";
import { detailsMessageTh, runOpAsActor, validateOpInput, validateWith } from "@/lib/modules/account/api/run";

// ─────────────────────────────────────────────────────────────────────────────
// 1. ผู้กระทำ (actor) ของฝั่ง AI
// ─────────────────────────────────────────────────────────────────────────────

/**
 * สิทธิ์ของ actor `assistant` — **อ่านอย่างเดียวเท่านั้น**
 * ครอบ scope ของ op read ทุกตัวที่เปิดเป็น tool (ยอดเงิน/สินทรัพย์อยู่ใต้ scope ชื่อ `.manage`
 * ตามทะเบียนสิทธิ์เดิม จึงต้องมีในรายการนี้ด้วย) · ด่านจริงที่กันการเขียนคือ
 * `runAccountTool` ที่ยอมรันทันทีเฉพาะ `op.kind === "read"` เท่านั้น
 */
const ASSISTANT_READ_SCOPES = [
  "account.doc.view",
  "account.report.view",
  "account.journal.view",
  "account.tax.view",
  "account.finance.manage",
  "account.asset.manage",
] as const;

function assistantActor(tenantId: string, systemId: string): ApiActor {
  return {
    kind: "assistant",
    tenantId,
    systemId,
    keyName: "ผู้ช่วย AI",
    scopes: [...ASSISTANT_READ_SCOPES],
    membership: membershipFromScopes([...ASSISTANT_READ_SCOPES]),
  };
}

/** actor ของ "คนที่กดยืนยันข้อเสนอ" — สิทธิ์คือ Membership จริงของคนคนนั้น (OWNER/MANAGER ผ่านหมด) */
function userActor(tenantId: string, systemId: string, m: MembershipCtx, userId?: string | null): ApiActor {
  return {
    kind: "user",
    tenantId,
    systemId,
    userId: userId ?? null,
    keyName: "ผู้ช่วย AI (ผู้ใช้ยืนยัน)",
    scopes: [],
    membership: m,
  };
}

/**
 * สมุดบัญชีของร้าน
 * - `systemId` = เล่มที่ถูกล็อกมาจากชั้นบน (คีย์ API ที่ผูกเล่มไว้ / หัว `X-Shark-System`)
 *   🔴 ค้นผ่าน `tenantDb` เสมอ ⇒ id ของร้านอื่นหาไม่เจอ (คืน null) ไม่ใช่ "หาไม่เจอแล้วตกไปเล่มแรก"
 * - `systemName` ใช้เมื่อร้านมีหลายเล่มและผู้ช่วยระบุชื่อมา (จับคู่แบบไม่สนตัวพิมพ์/บางส่วนของชื่อ)
 */
async function findAccountSystem(
  tenantId: string,
  opts: { systemName?: string; systemId?: string } = {},
): Promise<{ id: string; name: string } | null> {
  if (opts.systemId) {
    return tenantDb({ tenantId }).appSystem.findFirst({
      where: { id: opts.systemId, type: "ACCOUNT" },
      select: { id: true, name: true },
    });
  }
  const systems = await tenantDb({ tenantId }).appSystem.findMany({
    where: { type: "ACCOUNT" },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });
  if (systems.length === 0) return null;
  const want = opts.systemName?.trim().toLowerCase();
  if (want) {
    const hit = systems.find((s) => s.name.toLowerCase().includes(want));
    if (hit) return hit;
  }
  return systems[0] ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. สคีมาที่ผู้ช่วยเห็น (parameters) — ปกติ = สคีมาของ op + path param
// ─────────────────────────────────────────────────────────────────────────────

type JsonSchema = Record<string, unknown>;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const MONTH_OR_DAY = /^\d{4}-(0[1-9]|1[0-2])(-\d{2})?$/;

const DOC_TYPES = [
  "QUOTATION", "INVOICE", "RECEIPT", "TAX_INVOICE", "TAX_INVOICE_ABB", "DEPOSIT_RECEIPT",
  "CREDIT_NOTE", "DEBIT_NOTE", "BILLING_NOTE", "PURCHASE", "EXPENSE", "PURCHASE_ORDER",
  "ASSET_PURCHASE_ORDER", "ASSET_PURCHASE", "PURCHASE_TAX_INVOICE", "DEPOSIT_PAYMENT",
  "CREDIT_NOTE_RECEIVED", "DEBIT_NOTE_RECEIVED", "COMBINED_PAYMENT",
] as const;

const WHT_INCOME_TYPES = [
  "SALARY", "COMMISSION", "ROYALTY", "INTEREST", "DIVIDEND", "RENT", "PROFESSIONAL",
  "CONTRACTOR", "SERVICE", "M40_1", "M40_2", "M40_3", "M40_4", "M40_5", "M40_6", "M40_7", "M40_8",
] as const;

const REPORT_KINDS = [
  "trial-balance", "profit-loss", "balance-sheet", "cash-flow", "vat-pp30", "aging", "general-ledger",
] as const;
type ReportKind = (typeof REPORT_KINDS)[number];

/** รายงาน 1 tool ครอบ 7 op — kind เลือกว่าจะเดินไป op ไหน (ทะเบียนเดียวกัน ไม่ได้เขียนตรรกะใหม่) */
const REPORT_OP_OF: Record<ReportKind, string> = {
  "trial-balance": "reports.trial-balance",
  "profit-loss": "reports.profit-loss",
  "balance-sheet": "reports.balance-sheet",
  "cash-flow": "reports.cash-flow",
  "vat-pp30": "reports.vat-pp30",
  aging: "reports.aging",
  "general-ledger": "reports.general-ledger",
};

const reportArgs = z
  .object({
    kind: z.enum(REPORT_KINDS).describe("Which report to read."),
    from: z.string().regex(MONTH_OR_DAY).optional().describe("Start of the range, `YYYY-MM` or `YYYY-MM-DD`. Default: this month."),
    to: z.string().regex(MONTH_OR_DAY).optional().describe("End of the range. Default: this month."),
    asOf: z.string().regex(MONTH_OR_DAY).optional().describe("Balance sheet and aging read the numbers at this date. Default: today."),
    period: z.string().regex(MONTH).optional().describe("Month `YYYY-MM` of the VAT PP30 return. Default: this month."),
    direction: z.enum(["AR", "AP"]).optional().describe("Aging only: AR = customers owe us, AP = we owe vendors. Default AR."),
    accountId: z.string().min(1).max(40).optional().describe("General ledger only: which ledger account to read (from account_chart_of_accounts)."),
    contactId: z.string().min(1).max(40).optional().describe("Aging only: limit to one contact."),
  })
  .strict();

const listDocumentsArgs = z
  .object({
    type: z.enum(DOC_TYPES).optional().describe("Document type. Omit for every type."),
    tab: z.string().max(40).optional().describe("Status tab of that type, for example `draft`, `awaiting`, `partial`, `paid`, `overdue`, `cancelled`. Needs `type`."),
    status: z.string().max(200).optional().describe("Filter by status instead of a tab, or `OVERDUE` / `ALL`."),
    q: z.string().max(200).optional().describe("Free text: document number or contact name."),
    contactId: z.string().max(40).optional().describe("Only documents of this contact."),
    from: z.string().regex(DAY).optional().describe("Issued on or after this Thai calendar day."),
    to: z.string().regex(DAY).optional().describe("Issued on or before this Thai calendar day."),
    page: z.number().int().min(1).optional().describe("Page number, 1 based. Default 1."),
  })
  .strict();

const recordPaymentArgs = z
  .object({
    documentId: z.string().min(1).max(40).describe("Id of the invoice, deposit, purchase or expense being settled."),
    paidAt: z.string().regex(DAY).describe("Day the money moved (Thai calendar day, `YYYY-MM-DD`)."),
    amountSatang: z.number().int().positive().describe("Money actually received or paid in satang, excluding withholding tax. 1,070.00 baht is 107000."),
    financeAccountId: z.string().min(1).max(40).optional().describe("Cash box, bank account or wallet the money moves through (from account_finance_balances)."),
    whtAmountSatang: z.number().int().min(0).optional().describe("Withholding tax in satang, when the payer kept some back."),
    whtRateBp: z.number().int().min(0).max(10000).optional().describe("Withholding tax rate in basis points: 300 = 3%."),
    whtIncomeType: z.enum(WHT_INCOME_TYPES).optional().describe("Type of income for the withholding tax certificate, for example SERVICE for 40(8)."),
    feeSatang: z.number().int().min(0).optional().describe("Bank or gateway fee in satang, booked as an expense."),
    note: z.string().max(20).optional().describe("Short note on the payment row."),
  })
  .strict();

/** ตัวปรับต่อ tool — มีเฉพาะตัวที่สคีมาของ REST ไม่เหมาะให้ผู้ช่วยกรอกตรง ๆ */
type ToolAdapter = {
  /** สคีมาที่ผู้ช่วยเห็นแทนสคีมาของ op (ไม่ระบุ = ใช้ของ op ตรง ๆ) */
  args?: z.ZodType;
  /** คำอธิบายแทน summary ของ op (ใช้เมื่อ tool ครอบหลาย op) */
  description?: string;
  /**
   * ช่องที่ "จำเป็นจริงในทางปฏิบัติ" แม้ zod ของ REST จะปล่อยว่างได้
   * (เช่นเอกสารต้องมีบรรทัด — REST ตรวจในชั้นบริการตามชนิดเอกสาร แต่ผู้ช่วยควรรู้ตั้งแต่ตอนเรียก)
   */
  extraRequired?: string[];
  /** args (ผ่าน zod แล้ว) → op ที่จะรันจริง + input/params ของมัน */
  toCall?: (args: Record<string, unknown>) => { opId?: string; input: unknown; params?: Record<string, string> };
};

const ADAPTERS: Record<string, ToolAdapter> = {
  // สร้างเอกสาร: schema ของ REST ปล่อย `lines` ว่างได้ (ใบรวม/ใบวางบิลใช้ `childIds` แทน)
  // แต่ผู้ช่วยสร้างเอกสารปกติเสมอ ⇒ บอกให้ชัดว่าต้องมีบรรทัด (ไม่งั้นเดาว่า "ไม่ต้องส่งก็ได้")
  "documents.create": { extraRequired: ["lines"] },
  // รายงาน: 7 op ใต้ชื่อเดียว — ผู้ช่วยเลือกด้วย `kind` (ถามว่า "กำไรเดือนนี้เท่าไร" ไม่ต้องรู้ชื่อ endpoint)
  "reports.profit-loss": {
    args: reportArgs,
    description:
      "Financial statements and tax reports of this accounting book: trial balance, profit and loss, balance sheet, cash flow, the monthly VAT PP30 return, receivable/payable aging and the general ledger of one account. Pick the report with `kind`; ranges default to the current Thai month.",
    toCall: (a) => {
      const kind = String(a.kind) as ReportKind;
      const month = thaiMonthKey();
      const from = typeof a.from === "string" ? a.from : month;
      const to = typeof a.to === "string" ? a.to : month;
      const opId = REPORT_OP_OF[kind];
      if (kind === "balance-sheet") return { opId, input: { asOf: typeof a.asOf === "string" ? a.asOf : month } };
      if (kind === "vat-pp30") return { opId, input: { period: typeof a.period === "string" ? a.period : month } };
      if (kind === "aging") {
        return {
          opId,
          input: {
            direction: typeof a.direction === "string" ? a.direction : "AR",
            ...(typeof a.asOf === "string" && DAY.test(a.asOf) ? { asOf: a.asOf } : {}),
            ...(typeof a.contactId === "string" ? { contactId: a.contactId } : {}),
          },
        };
      }
      if (kind === "general-ledger") {
        return {
          opId,
          input: {
            accountId: typeof a.accountId === "string" ? a.accountId : "",
            from: monthEdge(from, "start"),
            to: monthEdge(to, "end"),
          },
        };
      }
      return { opId, input: { from, to } };
    },
  },
  // รายการเอกสาร: `type` ต้องเป็น enum จริง ไม่ใช่สตริงอิสระแบบ query string
  // (ผู้ช่วยพิมพ์ชนิดมั่วต้องเด้งเป็นข้อความไทย ไม่ใช่คืนรายการว่างให้เข้าใจผิด)
  "documents.list": {
    args: listDocumentsArgs,
    toCall: (a) => ({ input: { ...a, pageSize: 20 } }),
  },
  // รับ/จ่ายชำระ: REST รับเป็น `rows[]` (บันทึกหลายงวดในคำสั่งเดียว) — ผู้ช่วยทำทีละครั้งเสมอ
  "payments.record": {
    args: recordPaymentArgs,
    toCall: (a) => ({
      input: {
        documentId: a.documentId,
        rows: [
          {
            paidAt: a.paidAt,
            amountSatang: a.amountSatang,
            ...(a.financeAccountId === undefined ? {} : { financeAccountId: a.financeAccountId }),
            ...(a.whtAmountSatang === undefined ? {} : { whtAmountSatang: a.whtAmountSatang }),
            ...(a.whtRateBp === undefined ? {} : { whtRateBp: a.whtRateBp }),
            ...(a.whtIncomeType === undefined ? {} : { whtIncomeType: a.whtIncomeType }),
            ...(a.feeSatang === undefined ? {} : { feeSatang: a.feeSatang }),
            ...(a.note === undefined ? {} : { note: a.note }),
          },
        ],
      },
    }),
  },
};

/** ชื่ออาร์กิวเมนต์ของ path param — `{id}` ของ `/documents/{id}/issue` = `documentId` (ชื่อกลาง ๆ อ่านไม่รู้เรื่อง) */
function pathArgsOf(op: ApiOp): { arg: string; param: string }[] {
  const segments = op.path.split("/").filter(Boolean);
  const out: { arg: string; param: string }[] = [];
  segments.forEach((seg, i) => {
    if (!seg.startsWith("{") || !seg.endsWith("}")) return;
    const param = seg.slice(1, -1);
    if (param !== "id" && param !== "key") {
      out.push({ arg: param, param });
      return;
    }
    const owner = segments[i - 1] ?? "";
    const singular = owner.replace(/s$/, "");
    const camel = singular.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase());
    out.push({ arg: `${camel}${param === "id" ? "Id" : "Key"}`, param });
  });
  return out;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** สคีมา JSON ของ tool = path param + สคีมา input (หรือของ adapter) + `systemName` ตัวเลือก */
function parametersOf(op: ApiOp): JsonSchema {
  const adapter = ADAPTERS[op.id];
  const schemaOfTool = adapter?.args ?? op.input;
  const base = schemaOfTool ? jsonSchemaOf(schemaOfTool, "input") : {};
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  if (!adapter?.args) {
    for (const { arg } of pathArgsOf(op)) {
      properties[arg] = { type: "string", minLength: 1, description: `Id of the record this operation works on (use the matching list tool to find it).` };
      required.push(arg);
    }
  }
  const baseProps = isRecord(base.properties) ? base.properties : {};
  for (const [k, v] of Object.entries(baseProps)) properties[k] = v;
  if (Array.isArray(base.required)) for (const r of base.required) required.push(String(r));
  for (const r of adapter?.extraRequired ?? []) if (!required.includes(r) && properties[r] !== undefined) required.push(r);
  properties.systemName = {
    type: "string",
    description: "Optional: name of the accounting book, only needed when this business keeps more than one.",
  };
  const schema: JsonSchema = { type: "object", properties, additionalProperties: false };
  if (required.length > 0) schema.required = required;
  // สคีมาย่อยที่ zod แยกไว้ (`$defs`) ต้องติดไปด้วย ไม่งั้น `$ref` ชี้ที่ว่าง
  if (base.$defs !== undefined) schema.$defs = base.$defs;
  return schema;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. ทะเบียน tool ของสกิล (สร้างจาก ACCOUNT_OPS ตัวเดียว)
// ─────────────────────────────────────────────────────────────────────────────

export type AccountToolInfo = {
  name: string;
  opId: string;
  /** read = ทำทันที · write/danger = ต้องมีคนยืนยัน */
  write: boolean;
  danger: boolean;
  description: string;
  parameters: JsonSchema;
};

let toolCache: AccountToolInfo[] | null = null;

/** op ทุกตัวที่ประกาศ `tool` — แหล่งความจริงเดียวของทั้งสกิล */
export function accountToolOps(): ApiOp[] {
  return ACCOUNT_OPS.filter((o) => o.tool);
}

export function accountToolInfos(): AccountToolInfo[] {
  if (toolCache) return toolCache;
  toolCache = accountToolOps().map((op) => {
    const tool = op.tool!;
    const adapter = ADAPTERS[op.id];
    const description = [adapter?.description ?? op.summary, tool.hint ?? ""].filter(Boolean).join(" ");
    return {
      name: tool.name,
      opId: op.id,
      write: op.kind !== "read",
      danger: op.kind === "danger",
      description,
      parameters: parametersOf(op),
    };
  });
  return toolCache;
}

export function accountToolNames(): string[] {
  return accountToolInfos().map((t) => t.name);
}

const KIND_PREFIX = "account.";

/** ประเภทข้อเสนอของ op บัญชี — `account.<op id>` เช่น `account.documents.create` */
export function accountKindOf(opId: string): string {
  return `${KIND_PREFIX}${opId}`;
}

export function isAccountKind(kind: string): boolean {
  return kind.startsWith(KIND_PREFIX) && accountToolOps().some((o) => accountKindOf(o.id) === kind);
}

/** สิทธิ์ต่อ kind — ดึงจาก `op.action` ตรง ๆ (ห้ามพิมพ์ซ้ำ: op เปลี่ยน action แล้วข้อเสนอต้องเปลี่ยนตาม) */
export function accountKindAccess(): Record<string, { module: string; action: string }> {
  const out: Record<string, { module: string; action: string }> = {};
  for (const op of accountToolOps()) {
    if (op.kind === "read") continue; // read ไม่เคยกลายเป็นข้อเสนอ
    out[accountKindOf(op.id)] = { module: "account", action: op.action };
  }
  return out;
}

/** kind ที่ต้องยืนยัน 2 ชั้น = op ชนิด `danger` ทุกตัวที่เปิดเป็น tool */
export function accountDestructiveKinds(): string[] {
  return accountToolOps().filter((o) => o.kind === "danger").map((o) => accountKindOf(o.id));
}

// ─────────────────────────────────────────────────────────────────────────────
// 3.1 ขอบเขตสิทธิ์ของ "คีย์ API" ที่เรียกผ่าน /api/v1/ai/* (WO E2)
//
// 🔴 กติกา: AI ภายนอกที่ถือคีย์ทำได้ไม่เกิน scope ของคีย์ใบนั้น — เท่ากับ REST `/api/v1/account/*` เป๊ะ
//    (scope ที่ต้องใช้ = `op.action` ตรงจากทะเบียน ไม่มีตารางสิทธิ์ชุดที่สอง)
// คีย์ `scopes: []` (คีย์รุ่นเดิมก่อน A1) = **ไม่มีสิทธิ์บัญชี** (Fable E2 ตรวจรับ): สกิลบัญชีเป็นของใหม่
//    ผู้เชื่อมต่อเดิมไม่เคยได้ข้อมูลบัญชีผ่านทางนี้ จึงไม่มี "พฤติกรรมเดิม" ให้รักษา · และต้องเท่ากับ REST
//    (`membershipFromScopes([])` = ไม่มี permission → 403) ไม่งั้นคีย์เก่าทุกใบบน prod จะอ่านงบ/ลูกหนี้ได้ผ่าน AI route
//    tool นอกสกิลบัญชี (63 ตัวเดิม) ยังคงพฤติกรรมเดิมของ `/api/v1/ai/*` ไม่เกี่ยวกับด่านนี้
// ─────────────────────────────────────────────────────────────────────────────

/** scope ที่ต้องมีเพื่อเรียก tool นี้ (= `op.action`) · null = ไม่ใช่ tool ของสกิลบัญชี */
export function accountToolScope(toolName: string): string | null {
  return accountToolOps().find((o) => o.tool?.name === toolName)?.action ?? null;
}

/** คีย์ที่มี scope ชุดนี้ เรียก tool บัญชีตัวนี้ได้ไหม (tool นอกสกิลบัญชี = ไม่เกี่ยว คืน true) */
export function accountToolAllowedForScopes(toolName: string, scopes: string[]): boolean {
  const action = accountToolScope(toolName);
  if (action === null) return true;
  return scopesCanAccount(scopes, action);
}


// ─────────────────────────────────────────────────────────────────────────────
// 4. เตรียมคำสั่ง: args ของผู้ช่วย → { op, input, params }
// ─────────────────────────────────────────────────────────────────────────────

type Prepared = { op: ApiOp; input: unknown; params: Record<string, string>; args: Record<string, unknown> };
type PrepareResult = { ok: true; prepared: Prepared } | { ok: false; error: string };

function opOf(opId: string): ApiOp | undefined {
  return ACCOUNT_OPS.find((o) => o.id === opId);
}

function prepareCall(op: ApiOp, rawArgs: unknown): PrepareResult {
  const args = isRecord(rawArgs) ? { ...rawArgs } : {};
  delete args.systemName;
  const adapter = ADAPTERS[op.id];

  if (adapter?.args && adapter.toCall) {
    const parsed = validateWith(adapter.args, args);
    if (!parsed.ok) return { ok: false, error: detailsMessageTh(parsed.details) };
    const call = adapter.toCall(isRecord(parsed.input) ? parsed.input : {});
    const target = call.opId ? opOf(call.opId) : op;
    if (!target) return { ok: false, error: "ไม่พบคำสั่งที่ต้องใช้ในทะเบียน API บัญชี" };
    const checked = validateOpInput(target, call.input);
    if (!checked.ok) return { ok: false, error: detailsMessageTh(checked.details) };
    return { ok: true, prepared: { op: target, input: checked.input, params: call.params ?? {}, args } };
  }

  const params: Record<string, string> = {};
  const rest: Record<string, unknown> = {};
  const pathArgs = pathArgsOf(op);
  for (const [k, v] of Object.entries(args)) {
    const hit = pathArgs.find((p) => p.arg === k);
    if (hit) {
      if (typeof v !== "string" || v.trim() === "") return { ok: false, error: `ค่า ${k} ต้องเป็นรหัส (id) ที่ไม่ว่าง` };
      params[hit.param] = v.trim();
      continue;
    }
    rest[k] = v;
  }
  const missing = pathArgs.filter((p) => params[p.param] === undefined).map((p) => p.arg);
  if (missing.length > 0) return { ok: false, error: `ต้องระบุ ${missing.join(", ")} ด้วย` };

  const parsed = validateOpInput(op, rest);
  if (!parsed.ok) return { ok: false, error: detailsMessageTh(parsed.details) };
  return { ok: true, prepared: { op, input: parsed.input, params, args } };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. แปลงผลลัพธ์เป็น JSON ที่คนไทยอ่านรู้เรื่อง (LLM เอาไปเรียบเรียงต่อ)
// ─────────────────────────────────────────────────────────────────────────────

const MAX_ROWS = 20;

const baht = (satang: number): number => Math.round(satang) / 100;
const bahtText = (satang: number): string =>
  baht(satang).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** คีย์เงิน (ลงท้าย Satang) → ชื่อไทยที่บอกหน่วยชัด ๆ ว่าเป็น "บาท" */
const MONEY_TH: Record<string, string> = {
  amountSatang: "ยอดบาท",
  totalSatang: "รวมบาท",
  grandTotalSatang: "ยอดรวมบาท",
  subTotalSatang: "ยอดก่อนภาษีบาท",
  vatSatang: "ภาษีมูลค่าเพิ่มบาท",
  whtSatang: "หักณที่จ่ายบาท",
  paidSatang: "ชำระแล้วบาท",
  remainSatang: "คงเหลือบาท",
  discountSatang: "ส่วนลดบาท",
  balanceSatang: "ยอดคงเหลือบาท",
  openingSatang: "ยอดยกมาบาท",
  costSatang: "ราคาทุนบาท",
  salePriceSatang: "ราคาขายบาท",
  buyPriceSatang: "ราคาซื้อบาท",
  monthlySatang: "ค่าเสื่อมต่อเดือนบาท",
  accumDepreciationSatang: "ค่าเสื่อมสะสมบาท",
  netBookValueSatang: "มูลค่าคงเหลือบาท",
  salvageValueSatang: "ราคาซากบาท",
  debitSatang: "เดบิตบาท",
  creditSatang: "เครดิตบาท",
  netProfitSatang: "กำไรสุทธิบาท",
  grossProfitSatang: "กำไรขั้นต้นบาท",
  baseSatang: "ฐานภาษีบาท",
  cashTotalSatang: "เงินสดรวมบาท",
  monthDeltaSatang: "เปลี่ยนแปลงเดือนนี้บาท",
  overdueAmountSatang: "เกินกำหนดบาท",
  disposalAmountSatang: "ราคาขายซากบาท",
};

/** คีย์ทั่วไป → ไทย (ที่ไม่มีในนี้คงชื่อเดิมไว้ — ดีกว่าเดาผิด) */
const KEY_TH: Record<string, string> = {
  data: "รายการ",
  rows: "รายการ",
  accounts: "บัญชี",
  page: "หน้า",
  total: "ทั้งหมด",
  pageCount: "จำนวนหน้า",
  pageSize: "ต่อหน้า",
  hasMore: "มีต่อ",
  count: "จำนวน",
  docs: "จำนวนใบ",
  overdueDocs: "ใบเกินกำหนด",
  overdueCount: "จำนวนเกินกำหนด",
  contactCount: "จำนวนผู้ติดต่อ",
  id: "id",
  code: "รหัส",
  docNo: "เลขที่",
  journalNo: "เลขที่ใบสำคัญ",
  type: "ประเภท",
  status: "สถานะ",
  name: "ชื่อ",
  nameEn: "ชื่ออังกฤษ",
  kind: "ชนิด",
  contact: "ผู้ติดต่อ",
  contacts: "ผู้ติดต่อ",
  issueDate: "วันที่",
  dueDate: "ครบกำหนด",
  paidAt: "วันที่ชำระ",
  date: "วันที่",
  asOf: "ณ วันที่",
  from: "ตั้งแต่",
  to: "ถึง",
  period: "งวด",
  periodKey: "งวด",
  memo: "คำอธิบาย",
  note: "หมายเหตุ",
  overdue: "เกินกำหนด",
  tags: "ป้าย",
  source: "ที่มา",
  taxId: "เลขผู้เสียภาษี",
  phone: "โทรศัพท์",
  email: "อีเมล",
  address: "ที่อยู่",
  archived: "เก็บเข้ากรุแล้ว",
  active: "ใช้งานอยู่",
  revenue: "รายได้",
  income: "รายได้",
  expense: "รายจ่าย",
  expenses: "รายจ่าย",
  cogs: "ต้นทุนขาย",
  cash: "เงินสด",
  buckets: "ช่วงอายุหนี้",
  direction: "ทิศทาง",
  book: "สมุด",
  bookLabel: "สมุด",
  unitName: "หน่วย",
  category: "หมวด",
  onHand: "คงเหลือ",
  bankName: "ธนาคาร",
  accountNo: "เลขที่บัญชี",
  accountCode: "รหัสบัญชี",
  incomeTypeLabel: "ประเภทเงินได้",
  rateBp: "อัตรา(หมื่นละ)",
  summary: "สรุป",
  tabCounts: "จำนวนตามแท็บ",
  label: "ป้าย",
};

const DROP_KEYS = new Set(["tenantId", "systemId", "createdById", "uploadedById", "partyId"]);

function thaiKey(key: string): string {
  if (key.endsWith("Satang")) return MONEY_TH[key] ?? `${key.slice(0, -6)}บาท`;
  return KEY_TH[key] ?? key;
}

/** แปลงผลของ handler → โครงไทย: เงินเป็นบาท · ตัดคีย์ภายใน · จำกัดแถวยาว */
function thaiify(value: unknown, depth = 0): unknown {
  if (Array.isArray(value)) {
    const rows = value.slice(0, MAX_ROWS).map((v) => thaiify(v, depth + 1));
    return value.length > MAX_ROWS ? [...rows, `…แสดง ${MAX_ROWS} จาก ${value.length} รายการ`] : rows;
  }
  if (!isRecord(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (DROP_KEYS.has(k)) continue;
    if (v === null || v === undefined) continue;
    if (k.endsWith("Satang") && typeof v === "number") {
      out[thaiKey(k)] = baht(v);
      continue;
    }
    out[thaiKey(k)] = thaiify(v, depth + 1);
  }
  return out;
}

const rec = (v: unknown): Record<string, unknown> => (isRecord(v) ? v : {});
const num = (v: unknown): number => (typeof v === "number" ? v : 0);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** แดชบอร์ด: ผลดิบใหญ่มาก (≈8 KB) — ย่อเหลือสิ่งที่ตอบคำถามเจ้าของร้านได้จริง */
function renderDashboard(data: unknown): unknown {
  const d = rec(data);
  const kpi = rec(d.kpi);
  const receivable = rec(kpi.receivable);
  const payable = rec(kpi.payable);
  const overdue = rec(kpi.overdue);
  const income = rec(d.income);
  const expense = rec(d.expense);
  const cash = rec(d.cash);
  return {
    "ณ วันที่": d.asOf,
    งวด: d.periodKey,
    ยอดค้างรับบาท: baht(num(receivable.amountSatang)),
    จำนวนใบค้างรับ: num(receivable.count),
    ยอดค้างจ่ายบาท: baht(num(payable.amountSatang)),
    จำนวนใบค้างจ่าย: num(payable.count),
    เกินกำหนด: {
      ยอดบาท: baht(num(overdue.amountSatang)),
      จำนวนใบ: num(overdue.count),
      ฝั่งลูกหนี้บาท: baht(num(rec(overdue.receivable).amountSatang)),
      ฝั่งเจ้าหนี้บาท: baht(num(rec(overdue.payable).amountSatang)),
    },
    เงินสดและเงินฝากรวมบาท: baht(num(kpi.cashTotalSatang)),
    รายได้งวดนี้บาท: baht(num(income.totalSatang)),
    รายจ่ายงวดนี้บาท: baht(num(expense.totalSatang)),
    ช่องทางเงิน: arr(cash.accounts)
      .slice(0, 10)
      .map((a) => {
        const x = rec(a);
        return { ชื่อ: x.name, ประเภท: x.type, ยอดคงเหลือบาท: baht(num(x.balanceSatang)) };
      }),
  };
}

/** อายุหนี้: เติม "ยอดรวม" ที่ REST ไม่ได้คืน (ผู้ช่วยต้องตอบยอดรวมได้โดยไม่ต้องบวกเอง) */
function renderAging(data: unknown): unknown {
  const d = rec(data);
  const rows = arr(d.rows);
  const totalSatang = rows.reduce<number>((sum, r) => sum + num(rec(r).totalSatang), 0);
  const overdueSatang = rows.reduce<number>((sum, r) => {
    const b = rec(rec(r).buckets);
    return sum + num(b.d1_30) + num(b.d31_60) + num(b.d61_90) + num(b.d90plus);
  }, 0);
  return {
    "ณ วันที่": d.asOf,
    ทิศทาง: d.direction === "AP" ? "เจ้าหนี้ (AP)" : "ลูกหนี้ (AR)",
    ยอดรวมบาท: baht(totalSatang),
    เกินกำหนดรวมบาท: baht(overdueSatang),
    จำนวนผู้ติดต่อ: rows.length,
    รายการ: thaiify(rows),
  };
}

const RENDERERS: Record<string, (data: unknown) => unknown> = {
  "dashboard.get": renderDashboard,
  "reports.aging": renderAging,
};

function renderResult(op: ApiOp, env: { data: unknown; page?: unknown; extra?: Record<string, unknown> }): unknown {
  const custom = RENDERERS[op.id];
  if (custom) return custom(env.data);
  const body = Array.isArray(env.data) ? { รายการ: thaiify(env.data) } : thaiify(env.data);
  const out: Record<string, unknown> = isRecord(body) ? { ...body } : { ผล: body };
  for (const [k, v] of Object.entries(env.extra ?? {})) out[thaiKey(k)] = thaiify(v);
  if (env.page) out[thaiKey("page")] = thaiify(env.page);
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. สรุปภาษาไทยของข้อเสนอ (การ์ดยืนยัน — ต้องไม่คลุมเครือ: ใคร/ใบไหน/กี่บาท)
// ─────────────────────────────────────────────────────────────────────────────

async function contactNameOf(tenantId: string, systemId: string, id: unknown): Promise<string | null> {
  if (typeof id !== "string" || !id) return null;
  const row = await tenantDb({ tenantId, systemId }).accountContact.findFirst({
    where: { id },
    select: { name: true },
  });
  return row?.name ?? null;
}

async function documentLabelOf(
  tenantId: string,
  systemId: string,
  id: unknown,
): Promise<{ text: string; amountSatang: number; contact: string | null } | null> {
  if (typeof id !== "string" || !id) return null;
  const row = await tenantDb({ tenantId, systemId }).accountDocument.findFirst({
    where: { id },
    select: { docNo: true, docType: true, grandTotal: true, contact: { select: { name: true } } },
  });
  if (!row) return null;
  return {
    text: `${docTypeLabel(row.docType)}${row.docNo ? ` ${row.docNo}` : " (ร่าง)"}`,
    amountSatang: row.grandTotal,
    contact: row.contact?.name ?? null,
  };
}

/** ยอดรวมโดยประมาณของเอกสารที่กำลังจะสร้าง (จากบรรทัด + VAT) — ใช้ในคำสรุปเท่านั้น */
function estimateDocTotal(input: unknown): number | null {
  const d = rec(input);
  const lines = arr(d.lines);
  if (lines.length === 0) return null;
  const vatMode = typeof d.vatMode === "string" ? d.vatMode : "EXCLUDE";
  let total = 0;
  for (const raw of lines) {
    const l = rec(raw);
    const gross = num(l.qty) * num(l.unitPriceSatang) - num(l.discountSatang);
    const rateBp = typeof l.vatRateBp === "number" && l.vatRateBp > 0 ? l.vatRateBp : 0;
    total += vatMode === "EXCLUDE" ? gross + (gross * rateBp) / 10000 : gross;
  }
  return Math.round(total - num(d.discountSatang));
}

async function summarize(prepared: Prepared, tenantId: string, systemId: string): Promise<string> {
  const { op, input, params, args } = prepared;
  const body = rec(input);
  const parts: string[] = [op.label];

  const docType = typeof body.type === "string" ? body.type : typeof body.docType === "string" ? body.docType : null;
  if (docType && DOC_TYPES.includes(docType as (typeof DOC_TYPES)[number])) {
    parts.push(docTypeLabel(docType as Parameters<typeof docTypeLabel>[0]));
  } else if (typeof body.toType === "string") {
    parts.push(`เป็น ${docTypeLabel(body.toType as Parameters<typeof docTypeLabel>[0])}`);
  }

  const docId = params.id ?? body.documentId ?? args.documentId;
  const doc = await documentLabelOf(tenantId, systemId, docId);
  if (doc) parts.push(doc.text);
  if (params.paymentId) parts.push(`รายการชำระ ${String(params.paymentId).slice(-6)}`);
  if (params.key) parts.push(`งวด ${params.key}`);
  if (typeof body.period === "string") parts.push(`งวด ${body.period}`);

  const contactId = body.contactId ?? body.keepId ?? args.contactId ?? params.id;
  const contactName = (await contactNameOf(tenantId, systemId, contactId)) ?? doc?.contact ?? null;
  if (contactName) parts.push(`ผู้ติดต่อ ${contactName}`);
  if (typeof body.name === "string") parts.push(`"${body.name}"`);
  if (typeof body.mergeId === "string") {
    const other = await contactNameOf(tenantId, systemId, body.mergeId);
    if (other) parts.push(`รวมกับ "${other}"`);
  }

  const rows = arr(body.rows);
  const rowAmount = rows.length > 0 ? num(rec(rows[0]).amountSatang) : null;
  const amount =
    estimateDocTotal(body) ??
    rowAmount ??
    (typeof body.amountSatang === "number" ? body.amountSatang : null) ??
    (doc && op.id !== "documents.get" ? doc.amountSatang : null);
  if (amount !== null && amount > 0) parts.push(`ยอด ${bahtText(amount)} บาท`);

  if (typeof body.reason === "string") parts.push(`เหตุผล: ${body.reason}`);
  return parts.join(" · ");
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. ทางเข้าหลัก: ผู้ช่วยเรียก tool
// ─────────────────────────────────────────────────────────────────────────────

export type AccountToolOutcome =
  | { mode: "error"; error: string }
  | { mode: "read"; result: unknown }
  | { mode: "propose"; kind: string; summary: string; payload: Record<string, unknown> };

const NO_SYSTEM = "ยังไม่ได้เปิดระบบบัญชี — เปิดระบบบัญชีให้ร้านนี้ก่อนแล้วค่อยสั่งอีกครั้ง";

const NO_BOUND_SYSTEM = "สมุดบัญชีที่ระบุใช้กับคีย์นี้ไม่ได้ — ตรวจหัว X-Shark-System หรือเล่มที่ผูกกับคีย์";

/**
 * เรียก tool ของสกิลบัญชี 1 ตัว
 * - read  → รันจริงทันที (actor assistant) แล้วคืนผลไทย
 * - write/danger → **ไม่รัน** คืนข้อมูลสำหรับสร้างข้อเสนอให้เจ้าของกดยืนยัน
 * `systemId` = เล่มที่ชั้นบนล็อกไว้ (คีย์ API ที่ผูกเล่ม / หัว `X-Shark-System`) — ไม่ส่ง = เล่มแรกของร้าน
 * ไม่โยน error ออกไป (ผู้เรียกเป็น tool ของ LLM) — ทุกทางผิดคืน `{ mode: "error" }` ภาษาไทย
 */
export async function runAccountTool(
  tenantId: string,
  name: string,
  rawArgs: unknown,
  opts: { systemId?: string } = {},
): Promise<AccountToolOutcome> {
  const op = accountToolOps().find((o) => o.tool?.name === name);
  if (!op) return { mode: "error", error: `ไม่รู้จักเครื่องมือ "${name}"` };

  const systemName = isRecord(rawArgs) && typeof rawArgs.systemName === "string" ? rawArgs.systemName : undefined;
  const system = await findAccountSystem(tenantId, { systemName, systemId: opts.systemId });
  if (!system) return { mode: "error", error: opts.systemId ? NO_BOUND_SYSTEM : NO_SYSTEM };

  const prep = prepareCall(op, rawArgs);
  if (!prep.ok) return { mode: "error", error: prep.error };
  const prepared = prep.prepared;

  if (prepared.op.kind !== "read") {
    // 🔴 ผู้ช่วยไม่เคยเขียนเอง — สร้างข้อเสนอให้คนกดยืนยัน (สิทธิ์ตรวจตอนกด ไม่ใช่ตอนนี้)
    const summary = await summarize(prepared, tenantId, system.id);
    return {
      mode: "propose",
      kind: accountKindOf(prepared.op.id),
      summary,
      // systemId ติดไปกับข้อเสนอ: ร้านที่มีหลายเล่มต้องลงมือกับ "เล่มที่เสนอ" ไม่ใช่เล่มแรกเสมอ
      payload: { opId: prepared.op.id, input: prepared.input, params: prepared.params, systemId: system.id },
    };
  }

  const actor = assistantActor(tenantId, system.id);
  if (!actorCan(actor, prepared.op.action)) {
    return { mode: "error", error: "ผู้ช่วยไม่มีสิทธิ์อ่านข้อมูลส่วนนี้" };
  }
  try {
    const env = await runOpAsActor(prepared.op, actor, {
      input: prepared.input,
      params: prepared.params,
      requestId: `ai-${Date.now().toString(36)}`,
    });
    return { mode: "read", result: renderResult(prepared.op, env) };
  } catch (e) {
    return { mode: "error", error: mapError(e).message_th };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. ลงมือจริงหลังเจ้าของกดยืนยัน (เรียกจาก proposals.ts)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * รัน op ของข้อเสนอ `account.*` ด้วยสิทธิ์ของ "คนกดยืนยัน"
 * - อ่าน payload จากแถวข้อเสนอเท่านั้น และ **ตรวจ schema ซ้ำ** (payload เก่าอาจมาจากสัญญาคนละรุ่น)
 * - audit เขียนใน runOpAsActor: actorType USER + after { proposalId, opId }
 * - โยน Error ภาษาไทยเมื่อทำไม่สำเร็จ (proposals.ts แปลงเป็น FAILED + note)
 */
export async function dispatchAccountKind(
  m: MembershipCtx,
  tenantId: string,
  proposalId: string,
  kind: string,
  rawPayload: unknown,
  userId?: string | null,
): Promise<string> {
  const payload = rec(rawPayload);
  const opId = typeof payload.opId === "string" ? payload.opId : kind.slice(KIND_PREFIX.length);
  const op = accountToolOps().find((o) => o.id === opId);
  if (!op || op.kind === "read") throw new Error("ไม่รู้จักคำสั่งบัญชีของข้อเสนอนี้");

  const boundSystemId = typeof payload.systemId === "string" ? payload.systemId : undefined;
  const system = await findAccountSystem(tenantId, { systemId: boundSystemId });
  if (!system) throw new Error(boundSystemId ? NO_BOUND_SYSTEM : NO_SYSTEM);

  const parsed = validateOpInput(op, payload.input);
  if (!parsed.ok) throw new Error(detailsMessageTh(parsed.details));
  const params: Record<string, string> = {};
  for (const [k, v] of Object.entries(rec(payload.params))) if (typeof v === "string") params[k] = v;

  const actor = userActor(tenantId, system.id, m, userId);
  const body = rec(parsed.input);
  const reason = typeof body.reason === "string" ? body.reason : undefined;
  try {
    const env = await runOpAsActor(op, actor, {
      input: parsed.input,
      params,
      requestId: `ai-proposal-${proposalId}`,
      idempotencyKey: `ai-${proposalId}`,
      reason,
      audit: { proposalId, actor: "ai-assistant" },
    });
    return noteOf(op, env.data);
  } catch (e) {
    throw new Error(mapError(e).message_th);
  }
}

/** ข้อความผลลัพธ์ภาษาไทยที่แสดงใต้การ์ดยืนยัน — บอกให้ชัดว่าเกิดอะไรขึ้นจริง */
function noteOf(op: ApiOp, data: unknown): string {
  const d = rec(data);
  const bits: string[] = [];
  if (typeof d.docNo === "string" && d.docNo) bits.push(String(d.docNo));
  else if (typeof d.code === "string" && d.code) bits.push(String(d.code));
  if (typeof d.name === "string" && d.name) bits.push(String(d.name));
  if (typeof d.status === "string" && d.status) bits.push(`สถานะ ${d.status}`);
  if (typeof d.grandTotalSatang === "number") bits.push(`ยอด ${bahtText(d.grandTotalSatang)} บาท`);
  else if (typeof d.amountSatang === "number") bits.push(`ยอด ${bahtText(d.amountSatang)} บาท`);
  if (typeof d.url === "string" && d.url) bits.push(String(d.url));
  return bits.length > 0 ? `${op.label}เรียบร้อยแล้ว — ${bits.join(" · ")}` : `${op.label}เรียบร้อยแล้ว`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. วันที่แบบไทย (ค่าปริยายของรายงาน)
// ─────────────────────────────────────────────────────────────────────────────

function thaiToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
}

function thaiMonthKey(): string {
  return thaiToday().slice(0, 7);
}

/** `YYYY-MM` → วันแรก/วันสุดท้ายของเดือน · `YYYY-MM-DD` → ตัวเดิม (บัญชีแยกประเภทรับเฉพาะวันเต็ม) */
function monthEdge(value: string, edge: "start" | "end"): string {
  if (DAY.test(value)) return value;
  const [y, mo] = value.split("-").map((n) => Number(n));
  if (!y || !mo) return thaiToday();
  if (edge === "start") return `${value}-01`;
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return `${value}-${String(last).padStart(2, "0")}`;
}
