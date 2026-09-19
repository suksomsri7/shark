// tools.ts — สะพานระหว่าง "ทะเบียน op ของ REST CRM" กับ "ผู้ช่วย AI" (ใบ C1.10 · แบบเดียวกับ member/api/tools.ts)
//
// 🔴 ไม่มีตรรกะของ CRM เป็นของตัวเอง: ทุกอย่างที่ผู้ช่วยทำได้ = op ที่ประกาศ `tool` ไว้ใน `CRM_OPS` (14 ตัวของ R-E.4)
//    สคีมา · ตรวจ input · สิทธิ์ · audit = ตัวเดียวกับ REST (ผ่าน `src/lib/api/run.ts`)
//   อ่าน (kind read)            → รันทันทีด้วย actor `assistant` = สิทธิ์ของ "คนที่ถาม" ∩ ชุดอ่านของผู้ช่วย (AUDIT H3)
//                                  + ทีม/สาขาของคนนั้น (การมองเห็น C1.7 อ่านจาก userId ของเขา) · ไม่รู้ว่าใครถาม = ปฏิเสธ (ปิดไว้ก่อน)
//   เขียน (write/danger)        → **ไม่ทำ** คืน "ข้อเสนอ" kind `crm.<op id>` ให้คนกดยืนยัน · ตอนยืนยันรันด้วยสิทธิ์ของคนกดจริง
// 🔴 ผู้ช่วยไม่เห็นค่าอ่อนไหว (present() ของ op ตัดทิ้งเสมอเมื่อ actor เป็น assistant — แม้เจ้าของร้านถาม)
// 🔴 R-E.14 (PERMANENT RULE): ระบบ CRM รุ่นเดิม (uiVersion 1) — ทุก tool ตอบ error ภาษาไทย **ยกเว้น** `crm_create_lead`
//    ที่ยังเสนอ "kind เดิม" (`crm_create_lead` · payload name/phone/email) ให้ทางเดิมของ proposals.ts สร้างผู้ติดต่อเหมือนก่อน C1.10
// 🔴 ไฟล์นี้อยู่ในโมดูล จึงห้าม import `@/lib/ai/*` (วงกลม + เส้นข้ามโมดูล)

import { createHash } from "node:crypto";
import { tenantDb } from "@/lib/core/db";
import type { MembershipCtx } from "@/lib/core/rbac";
import type { ApiActor } from "@/lib/api/actor";
import { jsonSchemaOf, type JsonSchema } from "@/lib/api/openapi";
import type { ApiOp } from "@/lib/api/op";
import { mapError } from "@/lib/api/respond";
import { detailsMessageTh, runOpAsActor, validateOpInput } from "@/lib/api/run";
import { crmCan } from "../access";
import { getCrmSettings } from "../settings";
import { CRM_DENY_TH, crmScopesCan } from "./actor";
import { CRM_OPS } from "./registry";

// ─────────────────────────────────────────────────────────────────────────────
// 1. ผู้กระทำของฝั่ง AI
// ─────────────────────────────────────────────────────────────────────────────

/** ชุดอ่านของผู้ช่วย — ตัดกับสิทธิ์จริงของคนที่ถามทุกครั้ง (คนที่ไม่มีคีย์อ่านรายงาน = ผู้ช่วยก็อ่านรายงานให้ไม่ได้) */
const ASSISTANT_READ_SCOPES = ["crm.contact.read", "crm.company.read", "crm.deal.read", "crm.activity.read", "crm.record.read", "crm.report.view"] as const;

/** "ใครกำลังเรียก tool นี้" — ก้อนเดียวใช้ทั้งตอนผู้ช่วยเสนอและตอนคนกดยืนยัน */
export type CrmToolCtx = {
  tenantId: string;
  systemId?: string | null;
  /** คนที่ถาม/คนที่กดยืนยัน */
  userId?: string | null;
  role?: MembershipCtx["role"];
  unitAccess?: string[];
  permissions?: Record<string, unknown>;
  /** id ข้อเสนอ — คีย์กันซ้ำตอนลงมือ */
  proposalId?: string | null;
};

type Viewer = { userId: string; role: MembershipCtx["role"]; unitAccess: string[]; permissions: Record<string, unknown> };

/**
 * คนที่ถามผู้ช่วยอยู่ตอนนี้ (AUDIT H3): ผู้เรียกบอกมาเอง (ctx มี role/permissions) → ไม่บอก = session ของคำขอปัจจุบัน
 * → ไม่มีทั้งสอง (คิว · เว็บฮุก · คีย์ API ของ /api/v1/ai/*) = null ⇒ อ่านไม่ได้ (มติผู้คุมงาน C1.10 ข้อ 8)
 */
async function viewerOf(ctx: CrmToolCtx): Promise<Viewer | null> {
  if (ctx.role !== undefined || ctx.permissions !== undefined) {
    if (!ctx.userId) return null;
    return { userId: ctx.userId, role: ctx.role ?? "STAFF", unitAccess: ctx.unitAccess ?? [], permissions: ctx.permissions ?? {} };
  }
  try {
    const { getAuth } = await import("@/lib/core/context");
    const auth = await getAuth();
    const active = auth?.active;
    if (!auth || !active || active.tenantId !== ctx.tenantId) return null;
    return {
      userId: auth.user.id,
      role: active.role,
      unitAccess: Array.isArray(active.unitAccess) ? (active.unitAccess as string[]) : [],
      permissions: (active.permissions ?? {}) as Record<string, unknown>,
    };
  } catch {
    return null; // นอกขอบเขตคำขอ (ไม่มี cookies()) = ไม่มีคนเปิดหน้าอยู่
  }
}

const memberActorOfViewer = (v: Viewer) => ({ userId: v.userId, role: v.role, unitAccess: v.role === "OWNER" ? ["*"] : v.unitAccess, permissions: v.permissions });

/** AUDIT-CLASS X2 / H3: actor ของผู้ช่วย = คนที่ถาม (บทบาท ทีม สาขา) · scope = ชุดอ่าน ∩ สิ่งที่คนนั้นทำได้จริง */
function assistantActor(tenantId: string, systemId: string, v: Viewer): ApiActor {
  const m = memberActorOfViewer(v);
  const scopes = ASSISTANT_READ_SCOPES.filter((s) => crmCan(m, s));
  return {
    kind: "assistant",
    module: "crm",
    tenantId,
    systemId,
    userId: v.userId,
    keyName: "ผู้ช่วย AI",
    scopes,
    membership: { role: m.role, unitAccess: m.unitAccess, permissions: m.permissions },
    can: (action) => (scopes as readonly string[]).includes(action),
    denyMessageTh: "ผู้ช่วยไม่มีสิทธิ์อ่านข้อมูลส่วนนี้ — บัญชีที่ถามยังไม่ได้รับสิทธิ์นี้จากเจ้าของร้าน",
  };
}

/** actor ของ "คนกดยืนยันข้อเสนอ" — สิทธิ์ = Membership จริง (K3.5) ตัดสินด้วย crmCan เดียวกับหน้าจอ */
function userActor(tenantId: string, systemId: string, ctx: CrmToolCtx): ApiActor {
  const m = { userId: ctx.userId ?? "", role: ctx.role ?? "STAFF", unitAccess: ctx.unitAccess ?? [], permissions: ctx.permissions ?? {} };
  return {
    kind: "user",
    module: "crm",
    tenantId,
    systemId,
    userId: ctx.userId ?? null,
    keyName: "ผู้ช่วย AI (ผู้ใช้ยืนยัน)",
    scopes: [],
    membership: { role: m.role, unitAccess: m.unitAccess, permissions: m.permissions },
    can: (action) => crmCan(m, action),
    denyMessageTh: CRM_DENY_TH,
  };
}

/** ระบบ CRM ของร้าน (id ที่ระบุต้องเป็นของร้านนี้ · ไม่ระบุ = ระบบแรก) + รุ่นหน้าจอ */
async function findCrmSystem(tenantId: string, systemId?: string | null): Promise<{ id: string; v2: boolean } | null> {
  // systemId ที่ส่งมาแต่ไม่ใช่ระบบ CRM ของร้าน (คีย์ผูกสมุดบัญชี/ระบบสมาชิก) = ใช้ระบบ CRM แรกของร้าน เหมือนเครื่องมือรุ่นเดิม
  const bound = systemId ? await tenantDb({ tenantId }).appSystem.findFirst({ where: { id: systemId, type: "CRM" }, select: { id: true } }) : null;
  const row = bound ?? (await tenantDb({ tenantId }).appSystem.findFirst({ where: { type: "CRM" }, orderBy: { createdAt: "asc" }, select: { id: true } }));
  if (!row) return null;
  let v2 = false;
  try {
    v2 = (await getCrmSettings({ tenantId, systemId: row.id })).uiVersion === 2;
  } catch {
    v2 = false;
  }
  return { id: row.id, v2 };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. ทะเบียน tool (สร้างจาก CRM_OPS ตัวเดียว)
// ─────────────────────────────────────────────────────────────────────────────

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** ชื่ออาร์กิวเมนต์ของ path param — `/contacts/{id}` → contactId · `/objects/{key}/…` → objectKey */
function pathArgsOf(op: ApiOp): { arg: string; param: string }[] {
  const segs = op.path.split("/").filter(Boolean);
  const out: { arg: string; param: string }[] = [];
  segs.forEach((seg, i) => {
    if (!seg.startsWith("{") || !seg.endsWith("}")) return;
    const param = seg.slice(1, -1);
    if (param === "key") return void out.push({ arg: "objectKey", param });
    if (param !== "id") return void out.push({ arg: param, param });
    const owner = segs[i - 1] ?? "";
    const singular = owner === "companies" ? "company" : owner === "activities" ? "activity" : owner === "records" ? "record" : owner.replace(/s$/, "");
    out.push({ arg: `${singular}Id`, param });
  });
  return out;
}

function parametersOf(op: ApiOp): JsonSchema {
  const base = op.input ? jsonSchemaOf(op.input, "input") : {};
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const { arg } of pathArgsOf(op)) {
    properties[arg] = { type: "string", minLength: 1, maxLength: 64, description: "Id (or object key) of the record this operation works on - find it with crm_search first." };
    required.push(arg);
  }
  const baseProps = isRecord(base.properties) ? base.properties : {};
  for (const [k, v] of Object.entries(baseProps)) properties[k] = v;
  if (Array.isArray(base.required)) for (const r of base.required) required.push(String(r));
  const schema: JsonSchema = { type: "object", properties, additionalProperties: false };
  if (required.length > 0) schema.required = required;
  if (base.$defs !== undefined) schema.$defs = base.$defs;
  return schema;
}

export type CrmToolInfo = { name: string; opId: string; write: boolean; danger: boolean; description: string; parameters: JsonSchema };

let toolCache: CrmToolInfo[] | null = null;

export function crmToolOps(): ApiOp[] {
  return CRM_OPS.filter((o) => o.tool);
}

export function crmToolInfos(): CrmToolInfo[] {
  if (toolCache) return toolCache;
  toolCache = crmToolOps().map((op) => ({
    name: op.tool!.name,
    opId: op.id,
    write: op.kind !== "read",
    danger: op.kind === "danger",
    description: [op.summary, op.tool!.hint ?? ""].filter(Boolean).join(" "),
    parameters: parametersOf(op),
  }));
  return toolCache;
}

export function crmToolNames(): string[] {
  return crmToolInfos().map((t) => t.name);
}

const KIND_PREFIX = "crm.";

/** ประเภทข้อเสนอของ op CRM — `crm.<op id>` เช่น `crm.deals.create` */
export function crmKindOf(opId: string): string {
  return `${KIND_PREFIX}${opId}`;
}

export function isCrmKind(kind: string): boolean {
  return kind.startsWith(KIND_PREFIX) && crmToolOps().some((o) => o.kind !== "read" && crmKindOf(o.id) === kind);
}

/** สิทธิ์ต่อ kind (ด่าน `assertCan` ของ proposals.ts ตอนกดยืนยัน) — ดึงจาก `op.action` ตรง ๆ */
export function crmKindAccess(): Record<string, { module: string; action: string }> {
  const out: Record<string, { module: string; action: string }> = {};
  for (const op of crmToolOps()) if (op.kind !== "read") out[crmKindOf(op.id)] = { module: "crm", action: op.action };
  return out;
}

/** kind ที่ต้องยืนยัน 2 ชั้น = op ชนิด danger ที่เปิดเป็น tool */
export function crmDestructiveKinds(): string[] {
  return crmToolOps().filter((o) => o.kind === "danger").map((o) => crmKindOf(o.id));
}

/** scope ที่ต้องมีเพื่อเรียก tool นี้ (= op.action) · null = ไม่ใช่ tool ของ CRM */
export function crmToolScope(toolName: string): string | null {
  return crmToolOps().find((o) => o.tool?.name === toolName)?.action ?? null;
}

/**
 * AUDIT H1: คีย์ API ที่มี scope ชุดนี้เรียก tool ของ CRM ตัวนี้ได้ไหม (tool นอก CRM = ไม่เกี่ยว → true)
 * คีย์ที่ไม่มี `crm.*` สักตัว (คีย์ของโมดูลอื่น/คีย์เปล่า) = ปฏิเสธ **ทุก** tool ของ CRM รวม `crm_create_lead` รุ่นเดิม
 */
export function crmToolAllowedForScopes(toolName: string, scopes: string[]): boolean {
  const action = crmToolScope(toolName);
  if (action === null) return true;
  return crmScopesCan(scopes, action);
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. เตรียมคำสั่ง · ผลลัพธ์ · สรุปไทย
// ─────────────────────────────────────────────────────────────────────────────

type Prepared = { op: ApiOp; input: unknown; params: Record<string, string> };

function prepareCall(op: ApiOp, rawArgs: unknown): { ok: true; prepared: Prepared } | { ok: false; error: string } {
  const args = isRecord(rawArgs) ? { ...rawArgs } : {};
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
  return { ok: true, prepared: { op, input: parsed.input, params } };
}

const MAX_ROWS = 20;

/** ผลที่ส่งให้โมเดล — ตัดให้สั้นพอคุยรู้เรื่อง (ไทยกิน token ~4 เท่าของอังกฤษ) */
function trimResult(value: unknown): unknown {
  if (Array.isArray(value)) {
    const rows = value.slice(0, MAX_ROWS).map(trimResult);
    return value.length > MAX_ROWS ? [...rows, `…แสดง ${MAX_ROWS} จาก ${value.length} รายการ`] : rows;
  }
  if (!isRecord(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (v === null || v === undefined) continue;
    out[k] = trimResult(v);
  }
  return out;
}

const baht = (satang: number) => `฿${(satang / 100).toLocaleString("th-TH")}`;

/** สรุปภาษาไทยของข้อเสนอ (การ์ดยืนยัน) — บอกว่ากำลังจะทำอะไร ไม่อ่านข้อมูลของร้านเพิ่ม */
function summarize(p: Prepared): string {
  const b = isRecord(p.input) ? p.input : {};
  const parts: string[] = [p.op.label];
  const name = [b.firstName, b.lastName].filter((x) => typeof x === "string" && x).join(" ");
  if (name) parts.push(`"${name}"`);
  if (typeof b.name === "string" && b.name) parts.push(`"${b.name}"`);
  if (typeof b.title === "string" && b.title) parts.push(`"${b.title}"`);
  if (typeof b.valueSatang === "number") parts.push(`มูลค่า ${baht(b.valueSatang)}`);
  if (typeof b.type === "string") parts.push(`ชนิด ${b.type}`);
  if (typeof b.stageId === "string") parts.push("ไปขั้นที่เลือก");
  if (typeof b.expectedCloseAt === "string") parts.push(`คาดว่าปิด ${b.expectedCloseAt}`);
  if (typeof b.nextStep === "string" && b.nextStep) parts.push(`ขั้นถัดไป: ${b.nextStep.length > 60 ? `${b.nextStep.slice(0, 60)}…` : b.nextStep}`);
  if (isRecord(b.deal) && typeof b.deal.title === "string") parts.push(`เปิดดีล "${b.deal.title}"`);
  if (isRecord(b.company) && isRecord(b.company.new) && typeof b.company.new.name === "string") parts.push(`สร้างบริษัท "${b.company.new.name}"`);
  return parts.join(" · ");
}

function flatPayload(p: Prepared): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const { arg, param } of pathArgsOf(p.op)) if (p.params[param] !== undefined) out[arg] = p.params[param];
  if (isRecord(p.input)) for (const [k, v] of Object.entries(p.input)) out[k] = v;
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. ทางเข้าหลัก: ผู้ช่วยเรียก tool
// ─────────────────────────────────────────────────────────────────────────────

export type CrmToolOutcome =
  | { mode: "error"; error: string }
  | { mode: "read"; result: unknown }
  | { mode: "propose"; kind: string; summary: string; payload: Record<string, unknown> };

const NO_SYSTEM = "ร้านนี้ยังไม่ได้เปิดระบบ CRM — เปิดระบบ CRM ก่อนแล้วค่อยสั่งอีกครั้ง";
const V1_TH = "ระบบ CRM นี้ยังใช้หน้าจอรุ่นเดิม — ผู้ช่วยทำรายการนี้ให้ได้เมื่อเจ้าของร้านเปิดใช้ CRM ใหม่แล้ว";
const NO_HUMAN = "ผู้ช่วยอ่านข้อมูล CRM ได้เฉพาะเมื่อรู้ว่าใครเป็นคนถาม — เปิดผู้ช่วยจากหน้าแอปแล้วถามอีกครั้ง";
const LEGACY_LEAD = "crm_create_lead";

/**
 * เรียก tool ของสกิล CRM 1 ตัว — ไม่โยน error (ผู้เรียกเป็น LLM) ทุกทางผิดคืน `{ mode: "error" }` ภาษาไทย
 */
export async function runCrmTool(ctx: CrmToolCtx, name: string, rawArgs: unknown): Promise<CrmToolOutcome> {
  try {
    const op = crmToolOps().find((o) => o.tool?.name === name);
    if (!op) return { mode: "error", error: `ไม่รู้จักเครื่องมือ "${name}"` };
    const system = await findCrmSystem(ctx.tenantId, ctx.systemId);
    if (!system) return { mode: "error", error: NO_SYSTEM };

    if (!system.v2) {
      // R-E.14 PERMANENT RULE: รุ่นเดิมยังบันทึก lead ได้ด้วยทางเดิมของ proposals.ts (kind `crm_create_lead`)
      if (name !== LEGACY_LEAD) return { mode: "error", error: V1_TH };
      return legacyLeadProposal(rawArgs);
    }

    const prep = prepareCall(op, rawArgs);
    if (!prep.ok) return { mode: "error", error: prep.error };
    const prepared = prep.prepared;

    if (prepared.op.kind !== "read") {
      // ผู้ช่วยไม่เคยเขียนเอง — สิทธิ์ตรวจตอนคนกดยืนยัน ไม่ใช่ตอนนี้
      return {
        mode: "propose",
        kind: crmKindOf(prepared.op.id),
        summary: summarize(prepared),
        payload: { ...flatPayload(prepared), opId: prepared.op.id, input: prepared.input, params: prepared.params, systemId: system.id },
      };
    }

    // AUDIT H3 · มติผู้คุมงาน C1.10 ข้อ 8: อ่านได้เฉพาะเมื่อรู้ตัวคนถาม — ไม่รู้ = ปิดไว้ก่อน
    const viewer = await viewerOf(ctx);
    if (!viewer) return { mode: "error", error: NO_HUMAN };
    const actor = assistantActor(ctx.tenantId, system.id, viewer);
    if (!actor.can(prepared.op.action)) return { mode: "error", error: actor.denyMessageTh ?? CRM_DENY_TH };
    const env = await runOpAsActor(prepared.op, actor, { input: prepared.input, params: prepared.params, requestId: `ai-${Date.now().toString(36)}` });
    const body = trimResult(env.data);
    return { mode: "read", result: isRecord(body) || Array.isArray(body) ? body : { ผล: body } };
  } catch (e) {
    return { mode: "error", error: mapError(e).message_th };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4b. `crm_create_lead` รุ่นเดิม (PERMANENT RULE R-E.14 · มติผู้คุมงาน C1.10 "Production v1")
// ─────────────────────────────────────────────────────────────────────────────

/**
 * นิยามเครื่องมือ `crm_create_lead` **ตัวเดิมทุกไบต์** (ก่อน C1.10 — B2-A1 ใน ai/tools.ts) — ร้านที่ยังใช้ CRM รุ่นเดิมเห็นสคีมานี้เหมือนเดิม
 * ร้าน CRM ใหม่ก็ใช้สคีมาเดียวกัน (แปลงเป็นอินพุตของ `contacts.create` ภายใน) ⇒ ผู้ช่วย/เอเจนต์ภายนอกไม่ต้องเปลี่ยนการเรียก
 */
export const LEGACY_CRM_LEAD_TOOL_DEF = {
  name: "crm_create_lead",
  description:
    "เสนอบันทึกลูกค้ามุ่งหวัง (lead) เข้าระบบ CRM (ยังไม่ทำทันที — สร้างข้อเสนอให้ผู้ใช้กดยืนยันก่อน) · ระบุ name (ชื่อผู้ติดต่อ) และ phone/email ถ้ามี",
  parameters: {
    type: "object",
    properties: {
      name: { type: "string", description: "ชื่อผู้ติดต่อ/ลูกค้ามุ่งหวัง" },
      phone: { type: "string", description: "เบอร์โทร (ถ้ามี)" },
      email: { type: "string", description: "อีเมล (ถ้ามี)" },
    },
    required: ["name"],
    additionalProperties: false,
  },
} as const;

/** ข้อเสนอ kind เดิม `crm_create_lead` — ตรรกะเดิมทุกบรรทัด (ชื่อ · เบอร์ · อีเมล · โน้ต · ข้อความสรุป) */
function legacyLeadProposal(rawArgs: unknown): CrmToolOutcome {
  const a = isRecord(rawArgs) ? rawArgs : {};
  const name = String(a.name ?? a.firstName ?? "").trim();
  if (!name) return { mode: "error", error: "ต้องระบุชื่อผู้ติดต่อ" };
  const payload: Record<string, unknown> = { name };
  const phone = String(a.phone ?? "").trim();
  const email = String(a.email ?? "").trim();
  const note = String(a.note ?? "").trim();
  if (phone) payload.phone = phone;
  if (email) payload.email = email;
  if (note) payload.note = note;
  const contact = phone ? ` (เบอร์ ${phone})` : email ? ` (อีเมล ${email})` : "";
  return { mode: "propose", kind: LEGACY_LEAD, summary: `บันทึกลูกค้ามุ่งหวัง "${name}"${contact}`, payload };
}

/**
 * ระบบ CRM ที่เครื่องมือของคีย์ใบนี้จะทำงานด้วยยังเป็นรุ่นเดิมไหม (หรือร้านยังไม่มี CRM — ทางเดิมเช่นกัน)
 * ใช้ที่ด่านคีย์ของ `/api/v1/ai/*`: รุ่นเดิม = `crm_create_lead` เปิดให้ทุกคีย์เหมือนก่อน C1.10 · CRM ใหม่ = กติกา scope ใหม่ (H1)
 */
export async function crmLegacyLeadOpen(tenantId: string, systemId?: string | null): Promise<boolean> {
  const sys = await findCrmSystem(tenantId, systemId);
  return !sys || !sys.v2;
}

/**
 * ทางเข้าของ AiTool `crm_create_lead` (สคีมาเดิม name/phone/email [+note]) — รุ่นเดิม = ข้อเสนอ kind เดิมทุกไบต์ ·
 * CRM ใหม่ = แปลงเป็นอินพุตของ op `contacts.create` (ชื่อแยกที่ช่องว่างแรก · โน้ตเก็บใน sourceDetail) แล้วเดินทางปกติ
 */
export async function runCrmLeadTool(ctx: CrmToolCtx, rawArgs: unknown): Promise<CrmToolOutcome> {
  try {
    if (await crmLegacyLeadOpen(ctx.tenantId, ctx.systemId)) return legacyLeadProposal(rawArgs);
    const a = isRecord(rawArgs) ? rawArgs : {};
    const full = String(a.name ?? a.firstName ?? "").trim().replace(/\s+/g, " ");
    if (!full) return { mode: "error", error: "ต้องระบุชื่อผู้ติดต่อ" };
    const at = full.indexOf(" ");
    const args: Record<string, unknown> = at < 0 ? { firstName: full } : { firstName: full.slice(0, at), lastName: full.slice(at + 1) };
    const phone = String(a.phone ?? "").trim();
    const email = String(a.email ?? "").trim();
    const note = String(a.note ?? "").trim();
    if (phone) args.phone = phone;
    if (email) args.email = email;
    if (note) args.sourceDetail = { note: note.slice(0, 500) };
    return runCrmTool(ctx, LEGACY_LEAD, args);
  } catch (e) {
    return { mode: "error", error: mapError(e).message_th };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. ลงมือจริงหลังคนกดยืนยัน (เรียกจาก ai/proposals.ts)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * รัน op ของข้อเสนอ `crm.*` ด้วยสิทธิ์ของ "คนกดยืนยัน" · ตรวจสคีมาซ้ำ (payload อาจมาจากสัญญาคนละรุ่น) ·
 * ระบบต้องยังเป็น CRM ใหม่ (รุ่นเดิม = ปฏิเสธ ไม่เขียนอะไร) · audit actorType USER + proposalId · โยน Error ไทยเมื่อไม่สำเร็จ
 */
export async function dispatchCrmKind(ctx: CrmToolCtx, kind: string, rawPayload: unknown): Promise<string> {
  const payload = isRecord(rawPayload) ? rawPayload : {};
  const proposalId =
    ctx.proposalId && ctx.proposalId.length > 0 ? ctx.proposalId : `kind-${createHash("sha256").update(`${kind}\n${JSON.stringify(payload)}`).digest("hex").slice(0, 24)}`;
  const opId = typeof payload.opId === "string" ? payload.opId : kind.slice(KIND_PREFIX.length);
  const op = crmToolOps().find((o) => o.id === opId);
  if (!op || op.kind === "read" || crmKindOf(op.id) !== kind) throw new Error("ไม่รู้จักคำสั่งของ CRM ในข้อเสนอนี้");
  const system = await findCrmSystem(ctx.tenantId, typeof payload.systemId === "string" ? payload.systemId : ctx.systemId);
  if (!system) throw new Error(NO_SYSTEM);
  if (!system.v2) throw new Error(V1_TH);
  const parsed = validateOpInput(op, payload.input);
  if (!parsed.ok) throw new Error(detailsMessageTh(parsed.details));
  const params: Record<string, string> = {};
  for (const [k, v] of Object.entries(isRecord(payload.params) ? payload.params : {})) if (typeof v === "string") params[k] = v;
  const actor = userActor(ctx.tenantId, system.id, ctx);
  const body = isRecord(parsed.input) ? parsed.input : {};
  try {
    const env = await runOpAsActor(op, actor, {
      input: parsed.input,
      params,
      requestId: `ai-proposal-${proposalId}`,
      idempotencyKey: `ai-${proposalId}`,
      reason: typeof body.reason === "string" ? body.reason : undefined,
      audit: { proposalId, actor: "ai-assistant" },
    });
    const d = isRecord(env.data) ? env.data : {};
    const title = isRecord(d.deal) && typeof d.deal.title === "string" ? d.deal.title : isRecord(d.contact) && typeof d.contact.name === "string" ? d.contact.name : null;
    return title ? `${op.label}เรียบร้อยแล้ว — "${title}"` : `${op.label}เรียบร้อยแล้ว`;
  } catch (e) {
    throw new Error(mapError(e).message_th);
  }
}
