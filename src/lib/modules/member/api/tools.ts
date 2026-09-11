// tools.ts — สะพานระหว่าง "ทะเบียน op ของ API ระบบสมาชิก" กับ "ผู้ช่วย AI" (M1.11)
//
// 🔴 หลักการเดียวของไฟล์นี้ (เหมือน `ai/kanban-ops.ts` เป๊ะ ๆ): **ไม่มีตรรกะของโมดูลเป็นของตัวเอง**
//    ทุกอย่างที่ผู้ช่วยทำได้ = op ที่ประกาศ `tool` ไว้ในทะเบียน (`MEMBER_OPS`) เท่านั้น
//    ⇒ เพิ่มความสามารถให้ผู้ช่วย = ใส่ `tool: { name, hint }` ให้ op นั้น ไม่ต้องแก้ไฟล์นี้
//    ⇒ สคีมา · การตรวจ input · สิทธิ์ · audit = ตัวเดียวกับ REST (ผ่าน `src/lib/api/run.ts`) ห้ามลอกซ้ำ
//
// ทางเดินของงาน:
//   อ่าน (kind read)            → รันทันทีด้วย actor `assistant` (อ่านอย่างเดียว) → คืน JSON ให้โมเดลเรียบเรียง
//   เขียน/อันตราย (write/danger) → **ไม่ทำ** แต่คืน "ข้อเสนอ" ให้เจ้าของกดยืนยัน (`ai/proposals.ts`)
//                                  ตอนยืนยันจึงรันด้วย actor `user` = สิทธิ์ Membership ของคนกดจริง (K3.5)
//
// 🔴 ผู้ช่วย AI **ไม่เห็นข้อมูลอ่อนไหวของสมาชิก**: actor ของมันเป็นพนักงานระดับ STAFF ที่ไม่มีตำแหน่ง HR
//    ⇒ ตกด่านนโยบาย D8 ทุกครั้ง (ค่าปริยาย = เจ้าของ/ผู้จัดการเท่านั้น) เหมือนคนที่ไม่ได้รับมอบสิทธิ์
// 🔴 ไฟล์นี้อยู่ในโมดูล จึงห้าม import `@/lib/ai/*` (จะกลายเป็นวงกลม + เส้นข้ามโมดูล)

// 🔴 ใช้ `tenantDb` เท่านั้น (ผูก tenant ให้แล้ว) — โมดูลนี้ไม่ import `prisma` ดิบ (ด่าน F5)
import { createHash } from "node:crypto";
import { tenantDb } from "@/lib/core/db";
import type { MembershipCtx } from "@/lib/core/rbac";
import { membershipFromScopes, type ApiActor } from "@/lib/api/actor";
import { jsonSchemaOf, type JsonSchema } from "@/lib/api/openapi";
import type { ApiOp } from "@/lib/api/op";
import { mapError } from "@/lib/api/respond";
import { detailsMessageTh, runOpAsActor, validateOpInput } from "@/lib/api/run";
import { MEMBER_DENY_TH, memberScopesCan } from "./actor";
import { MEMBER_OPS } from "./registry";

// ─────────────────────────────────────────────────────────────────────────────
// 1. ผู้กระทำ (actor) ของฝั่ง AI
// ─────────────────────────────────────────────────────────────────────────────

/**
 * สิทธิ์ของ actor `assistant` — **อ่านอย่างเดียวเท่านั้น**
 * ครอบ scope ของ op read ทุกตัวที่เปิดเป็น tool · ด่านจริงที่กันการเขียนคือ `runMemberTool`
 * ที่ยอมรันทันทีเฉพาะ `op.kind === "read"`
 * 🔴 ไม่มี `member.sensitive.read` และไม่มี `apiRole` ⇒ ข้อมูลอ่อนไหวปิดสนิทสำหรับผู้ช่วย
 */
const ASSISTANT_READ_SCOPES = [
  "member.customer.read",
  "member.tier.read",
  // `member_tier_simulate` (op `tiers.rules.dryRun`) เป็นการอ่านล้วน แต่คีย์สิทธิ์ของมันคือ tier.manage
  // (มันตอบว่า "ถ้าเปลี่ยนกฎแล้วใครขยับบ้าง" = ข้อมูลของคนตั้งกฎ) ⇒ ต้องมีตัวนี้ ไม่งั้น tool ตายเงียบ
  "member.tier.manage",
  "member.report.view",
  // M2.10 — ชุดสอง: ผู้ช่วยต้องตอบได้ว่า "แต้มเหลือเท่าไหร่ · มีของรางวัลอะไร · บัตรเหลือเท่าไหร่"
  // ทั้งสามเป็นคีย์ **อ่าน** ล้วน (เขียนยังต้องผ่านข้อเสนอให้คนกดยืนยันเหมือนเดิมทุกตัว)
  "member.point.read",
  "member.loyalty.read",
  "member.promo.read",
  // M3.10 — ชุดสาม: ผู้ช่วยต้องอ่านรีวิว (สรุป/สถิติ/รายการ) ได้ ส่วนการตอบรีวิวยังเป็นข้อเสนอให้คนกดเหมือนเดิม
  "member.review.read",
] as const;

function assistantActor(tenantId: string, systemId: string): ApiActor {
  const scopes = [...ASSISTANT_READ_SCOPES];
  return {
    kind: "assistant",
    module: "member",
    tenantId,
    systemId,
    keyName: "ผู้ช่วย AI",
    scopes,
    membership: membershipFromScopes(scopes),
    can: (action) => memberScopesCan(scopes, action),
    denyMessageTh: MEMBER_DENY_TH,
  };
}

/** actor ของ "คนที่กดยืนยันข้อเสนอ" — สิทธิ์คือ Membership จริงของคนคนนั้น (K3.5) */
function userActor(tenantId: string, systemId: string, m: MembershipCtx, userId?: string | null): ApiActor {
  return {
    kind: "user",
    module: "member",
    tenantId,
    systemId,
    userId: userId ?? null,
    keyName: "ผู้ช่วย AI (ผู้ใช้ยืนยัน)",
    scopes: [],
    membership: m,
    can: (action) => memberMembershipCan(m, action),
    denyMessageTh: MEMBER_DENY_TH,
  };
}

/**
 * สิทธิ์ของ "คน" ต่อ action ของระบบสมาชิก — ความหมายเดียวกับ `access.hasMemberPerm`
 * 🔴 §6.1: MANAGER ผ่านทุกคีย์ **ยกเว้น** 4 ตัว (settings/privacy/api/giftcard.manage) ที่ต้องได้รับมอบเจาะจง
 *    ⇒ ห้ามใช้ `evaluate()` ของ RBAC ทั่วไป (ตัวนั้นให้ MANAGER ผ่านทุก action)
 */
const MANAGER_EXCLUDED = new Set([
  "member.settings.manage",
  "member.privacy.manage",
  "member.api.manage",
  "member.giftcard.manage",
]);

function memberMembershipCan(m: MembershipCtx, action: string): boolean {
  if (m.role === "OWNER") return true;
  if (m.permissions["member.*"] === true) return true;
  if (m.permissions[action] === true) return true;
  if (m.role === "MANAGER" && !MANAGER_EXCLUDED.has(action)) return true;
  // §6.1 "อ่านโดยนัย": มีคีย์ `member.*` ตัวใดก็ได้ = อ่านโมดูลได้
  if (action === "member.customer.read") {
    return Object.entries(m.permissions).some(([k, v]) => v === true && k.startsWith("member."));
  }
  return false;
}

/**
 * ระบบสมาชิกของร้าน
 * 🔴 ค้นผ่าน `tenantDb` เสมอ ⇒ id ของร้านอื่นหาไม่เจอ (คืน null) ไม่ใช่ "หาไม่เจอแล้วตกไประบบแรก"
 */
async function findMemberSystem(
  tenantId: string,
  opts: { systemName?: string; systemId?: string } = {},
): Promise<{ id: string; name: string } | null> {
  if (opts.systemId) {
    return tenantDb({ tenantId }).appSystem.findFirst({
      where: { id: opts.systemId, type: "MEMBER" },
      select: { id: true, name: true },
    });
  }
  const systems = await tenantDb({ tenantId }).appSystem.findMany({
    where: { type: "MEMBER" },
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
// 2. ทะเบียน tool ของสกิล (สร้างจาก MEMBER_OPS ตัวเดียว)
// ─────────────────────────────────────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * ชื่ออาร์กิวเมนต์ของ path param — `{id}` ของ `/members/{id}/tier` = `customerId`
 * (ผู้ช่วยคุยกับคนด้วยคำว่า "ลูกค้า/สมาชิก" ไม่ใช่ "id" ลอย ๆ)
 */
function pathArgsOf(op: ApiOp): { arg: string; param: string }[] {
  const segments = op.path.split("/").filter(Boolean);
  const out: { arg: string; param: string }[] = [];
  segments.forEach((seg, i) => {
    if (!seg.startsWith("{") || !seg.endsWith("}")) return;
    const param = seg.slice(1, -1);
    if (param !== "id") {
      out.push({ arg: param, param });
      return;
    }
    const owner = segments[i - 1] ?? "";
    // `/members/{id}` → customerId (คำที่ทุก tool ของโมดูลนี้ใช้ตรงกัน) · อื่น ๆ = เอกพจน์ + Id
    if (owner === "members") {
      out.push({ arg: "customerId", param });
      return;
    }
    const singular = owner.replace(/s$/, "");
    const camel = singular.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase());
    out.push({ arg: `${camel}Id`, param });
  });
  return out;
}

/** สคีมา JSON ของ tool = path param + สคีมา input ของ op */
function parametersOf(op: ApiOp): JsonSchema {
  const base = op.input ? jsonSchemaOf(op.input, "input") : {};
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const { arg } of pathArgsOf(op)) {
    properties[arg] = {
      type: "string",
      minLength: 1,
      description: "Id of the record this operation works on (use the matching search or list tool to find it).",
    };
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

export type MemberToolInfo = {
  name: string;
  opId: string;
  /** read = ทำทันที · write/danger = ต้องมีคนยืนยัน */
  write: boolean;
  danger: boolean;
  description: string;
  parameters: JsonSchema;
};

let toolCache: MemberToolInfo[] | null = null;

/** op ทุกตัวที่ประกาศ `tool` — แหล่งความจริงเดียวของทั้งสกิล */
export function memberToolOps(): ApiOp[] {
  return MEMBER_OPS.filter((o) => o.tool);
}

export function memberToolInfos(): MemberToolInfo[] {
  if (toolCache) return toolCache;
  toolCache = memberToolOps().map((op) => {
    const tool = op.tool!;
    return {
      name: tool.name,
      opId: op.id,
      write: op.kind !== "read",
      danger: op.kind === "danger",
      description: [op.summary, tool.hint ?? ""].filter(Boolean).join(" "),
      parameters: parametersOf(op),
    };
  });
  return toolCache;
}

export function memberToolNames(): string[] {
  return memberToolInfos().map((t) => t.name);
}

const KIND_PREFIX = "member.";

/** ประเภทข้อเสนอของ op ระบบสมาชิก — `member.<op id>` เช่น `member.members.setTags` */
export function memberKindOf(opId: string): string {
  return `${KIND_PREFIX}${opId}`;
}

export function isMemberKind(kind: string): boolean {
  return kind.startsWith(KIND_PREFIX) && memberToolOps().some((o) => memberKindOf(o.id) === kind);
}

/** สิทธิ์ต่อ kind — ดึงจาก `op.action` ตรง ๆ (ห้ามพิมพ์ซ้ำ) */
export function memberKindAccess(): Record<string, { module: string; action: string }> {
  const out: Record<string, { module: string; action: string }> = {};
  for (const op of memberToolOps()) {
    if (op.kind === "read") continue; // read ไม่เคยกลายเป็นข้อเสนอ
    out[memberKindOf(op.id)] = { module: "member", action: op.action };
  }
  return out;
}

/** kind ที่ต้องยืนยัน 2 ชั้น = op ชนิด `danger` ทุกตัวที่เปิดเป็น tool */
export function memberDestructiveKinds(): string[] {
  return memberToolOps().filter((o) => o.kind === "danger").map((o) => memberKindOf(o.id));
}

/** scope ที่ต้องมีเพื่อเรียก tool นี้ (= `op.action`) · null = ไม่ใช่ tool ของสกิลสมาชิก */
export function memberToolScope(toolName: string): string | null {
  return memberToolOps().find((o) => o.tool?.name === toolName)?.action ?? null;
}

/**
 * tool รุ่นแรกของสกิล `members` ที่เขียนมือไว้ใน `ai/tools.ts` (ก่อนมีทะเบียน op) — **ไม่มี scope ของตัวเอง**
 * 🔴 M3.10: คีย์ที่ถือ scope ของระบบสมาชิกไม่เห็น/เรียก 8 ตัวนี้ผ่าน `/api/v1/ai/*` — ทุกตัวมีคู่ในทะเบียนที่ผูก scope แล้ว
 *    (`customer_search` → `member_search` · `point_adjust` → `member_points_credit` · …) ถ้าปล่อยไว้ คีย์อ่านอย่างเดียว
 *    ก็ยื่นข้อเสนอ "ปรับแต้ม" ได้ และ manifest จะโฆษณาเครื่องมือที่ไม่ผ่านด่าน scope (ข้อสอบ M3.10-S2.1 นับเท่าทะเบียน)
 *    ผู้ช่วยในแอป (ไม่ใช่คีย์) ยังใช้ครบเหมือนเดิม · คีย์รุ่นเก่าที่ไม่มี scope เลยก็ยังเรียกได้เหมือนเดิม
 */
export const LEGACY_MEMBER_TOOLS: ReadonlySet<string> = new Set([
  "member_count",
  "member_create",
  "customer_search",
  "customer_points",
  "point_adjust",
  "reward_redeem",
  "reward_list_redemptions",
  "coupon_create",
]);

/** คีย์ที่มี scope ชุดนี้ เรียก tool ของระบบสมาชิกตัวนี้ได้ไหม (tool นอกสกิลนี้ = ไม่เกี่ยว คืน true) */
export function memberToolAllowedForScopes(toolName: string, scopes: string[]): boolean {
  const action = memberToolScope(toolName);
  if (action === null) {
    if (LEGACY_MEMBER_TOOLS.has(toolName) && scopes.some((s) => s.startsWith("member."))) return false;
    return true;
  }
  return memberScopesCan(scopes, action);
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. เตรียมคำสั่ง: args ของผู้ช่วย → { op, input, params }
// ─────────────────────────────────────────────────────────────────────────────

type Prepared = { op: ApiOp; input: unknown; params: Record<string, string> };
type PrepareResult = { ok: true; prepared: Prepared } | { ok: false; error: string };

function prepareCall(op: ApiOp, rawArgs: unknown): PrepareResult {
  const args = isRecord(rawArgs) ? { ...rawArgs } : {};
  delete args.systemName;

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

// ─────────────────────────────────────────────────────────────────────────────
// 4. ผลลัพธ์ที่ส่งกลับให้โมเดล — ตัดให้สั้นพอคุยรู้เรื่อง (ไทยกิน token ~4 เท่าของอังกฤษ)
// ─────────────────────────────────────────────────────────────────────────────

const MAX_ROWS = 20;

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

// ─────────────────────────────────────────────────────────────────────────────
// 5. สรุปภาษาไทยของข้อเสนอ (การ์ดยืนยัน — ต้องบอกให้ชัดว่ากำลังจะทำอะไรกับใคร)
// ─────────────────────────────────────────────────────────────────────────────

async function nameOfMember(tenantId: string, systemId: string, customerId: unknown): Promise<string | null> {
  if (typeof customerId !== "string" || !customerId) return null;
  // 🔴 `Customer` เป็น model ระดับระบบ ⇒ `tenantDb` ต้องได้ systemId ด้วย ไม่งั้นโยนทันที
  const row = await tenantDb({ tenantId, systemId }).customer.findFirst({
    where: { id: customerId },
    select: { name: true, firstName: true, lastName: true, memberCode: true },
  });
  if (!row) return null;
  const name = row.name ?? [row.firstName, row.lastName].filter(Boolean).join(" ");
  return name || row.memberCode || null;
}

async function summarize(prepared: Prepared, tenantId: string, systemId: string): Promise<string> {
  const { op, input, params } = prepared;
  const body = isRecord(input) ? input : {};
  const parts: string[] = [op.label];

  const who = await nameOfMember(tenantId, systemId, params.id);
  if (who) parts.push(`สมาชิก "${who}"`);

  if (typeof body.firstName === "string" || typeof body.phone === "string") {
    const label = [body.firstName, body.lastName].filter((x) => typeof x === "string").join(" ").trim();
    parts.push(`"${label || String(body.phone ?? "")}"`);
  }
  if (typeof body.name === "string") parts.push(`"${body.name}"`);
  if (typeof body.status === "string") parts.push(`สถานะ ${body.status}`);
  if (typeof body.channel === "string") parts.push(`ช่องทาง ${body.channel}`);
  if (typeof body.granted === "boolean") parts.push(body.granted ? "ยินยอมรับข่าวสาร" : "ไม่ยินยอมรับข่าวสาร");
  if (Array.isArray(body.add) && body.add.length > 0) parts.push(`เพิ่มแท็ก ${body.add.join(", ")}`);
  if (Array.isArray(body.remove) && body.remove.length > 0) parts.push(`เอาแท็กออก ${body.remove.join(", ")}`);
  if (typeof body.tierDefId === "string") {
    const tier = await tenantDb({ tenantId, systemId }).memberTierDef.findFirst({
      where: { id: body.tierDefId },
      select: { name: true },
    });
    if (tier) parts.push(`เป็นระดับ "${tier.name}"`);
  }
  if (typeof body.mergeId === "string") {
    const other = await nameOfMember(tenantId, systemId, body.mergeId);
    if (other) parts.push(`รวมกับ "${other}"`);
  }
  // M2.10 — ชุดสอง: การ์ดยืนยันต้องบอก "เท่าไหร่" ให้ชัด (แต้ม/เงิน/จำนวนตรา) ก่อนคนกดยืนยัน
  if (typeof body.points === "number") parts.push(`${body.points.toLocaleString("th-TH")} แต้ม`);
  if (typeof body.delta === "number") parts.push(`${body.delta > 0 ? "+" : ""}${body.delta.toLocaleString("th-TH")} แต้ม`);
  if (typeof body.satang === "number") parts.push(`${(body.satang / 100).toLocaleString("th-TH")} บาท`);
  if (typeof body.count === "number") parts.push(`${body.count} ตรา`);
  if (Array.isArray(body.customerIds)) parts.push(`สมาชิก ${body.customerIds.length} คน`);
  // M3.10 — ชุดสาม: แคมเปญ/รีวิว/แจ้งเตือน ต้องบอกช่องทางและข้อความที่จะออกไปให้เห็นก่อนกดยืนยัน
  if (Array.isArray(body.channels) && body.channels.length > 0) parts.push(`ช่องทาง ${body.channels.join(", ")}`);
  const content = isRecord(body.content) ? body.content : null;
  const draft = typeof content?.line === "string" ? content.line : typeof content?.sms === "string" ? content.sms : null;
  if (draft) parts.push(`ข้อความ "${draft.length > 80 ? `${draft.slice(0, 80)}…` : draft}"`);
  if (typeof body.body === "string" && body.body.trim()) {
    const t = body.body.trim();
    parts.push(`ข้อความ "${t.length > 80 ? `${t.slice(0, 80)}…` : t}"`);
  }
  if (typeof params.key === "string" && params.key) parts.push(`เหตุการณ์ ${params.key}`);
  // M3.10 — การ์ดยืนยันของ "ออก voucher" ต้องบอกต้นทุนสูงสุด (กล่องข้อเสนอภาพ 27 ซ้าย: การกระทำ + ต้นทุนรวม)
  //   คิดได้เฉพาะ voucher ลดเป็นจำนวนเงิน (FIXED) = มูลค่าต่อใบ × จำนวนคน · แบบเปอร์เซ็นต์ขึ้นกับบิล จึงไม่เดาตัวเลข
  if (op.id === "vouchers.issue" && Array.isArray(body.customerIds)) {
    const count = body.customerIds.length;
    const adhoc = isRecord(body.adhoc) ? body.adhoc : null;
    const tpl =
      typeof body.templateId === "string" && body.templateId
        ? await tenantDb({ tenantId, systemId }).voucherTemplate.findFirst({ where: { id: body.templateId }, select: { name: true, kind: true, value: true } })
        : null;
    if (tpl) parts.push(`แบบ "${tpl.name}"`);
    const kind = tpl?.kind ?? (typeof adhoc?.kind === "string" ? adhoc.kind : null);
    const value = tpl?.value ?? (typeof adhoc?.value === "number" ? adhoc.value : null);
    if (kind === "FIXED" && typeof value === "number" && count > 0) {
      parts.push(`ต้นทุนสูงสุด ฿${((value * count) / 100).toLocaleString("th-TH")}`);
    }
  }
  if (typeof body.reason === "string") parts.push(`เหตุผล: ${body.reason}`);
  return parts.join(" · ");
}

/**
 * ค่าที่ "อ่านออกโดยไม่ต้องแกะซอง" ของข้อเสนอ — path param (เป็นชื่ออาร์กิวเมนต์ เช่น `customerId`)
 * บวกฟิลด์ของ input ระดับบนสุด · ตัวที่ใช้ลงมือจริงยังเป็น `input`/`params` เท่านั้น
 */
function flatPayload(prepared: Prepared): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const { arg, param } of pathArgsOf(prepared.op)) {
    const v = prepared.params[param];
    if (v !== undefined) out[arg] = v;
  }
  if (isRecord(prepared.input)) for (const [k, v] of Object.entries(prepared.input)) out[k] = v;
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. ทางเข้าหลัก: ผู้ช่วยเรียก tool
// ─────────────────────────────────────────────────────────────────────────────

export type MemberToolOutcome =
  | { mode: "error"; error: string }
  | { mode: "read"; result: unknown }
  | { mode: "propose"; kind: string; summary: string; payload: Record<string, unknown> };

const NO_SYSTEM = "ร้านนี้ยังไม่ได้เปิดระบบสมาชิก — เปิดระบบสมาชิกก่อนแล้วค่อยสั่งอีกครั้ง";
const NO_BOUND_SYSTEM = "ระบบสมาชิกที่ระบุใช้กับคีย์นี้ไม่ได้ — ตรวจหัว X-Shark-System หรือระบบที่ผูกกับคีย์";

/**
 * เรียก tool ของสกิลสมาชิก 1 ตัว
 * - read  → รันจริงทันที (actor assistant) แล้วคืนผล
 * - write/danger → **ไม่รัน** คืนข้อมูลสำหรับสร้างข้อเสนอให้เจ้าของกดยืนยัน
 * ไม่โยน error ออกไป (ผู้เรียกเป็น tool ของ LLM) — ทุกทางผิดคืน `{ mode: "error" }` ภาษาไทย
 */
/**
 * "ใครกำลังเรียก tool นี้" (M2.10) — รูปแบบเดียวที่ใช้ได้ทั้งตอนผู้ช่วยเสนอและตอนคนกดยืนยัน
 * 🔴 เดิมทั้งสองทางรับพารามิเตอร์คนละชุด (`tenantId` ลอย ๆ กับ `MembershipCtx` + tenantId + proposalId)
 *    ⇒ ผู้เรียกรายใหม่ต้องจำว่าอันไหนเรียงยังไง · รวมเป็นก้อนเดียวแล้วอ่านออกทันทีว่าใครทำอะไรที่ร้านไหน
 *    (รูปเดิมยังเรียกได้อยู่ — ดู overload ของ `dispatchMemberKind` ข้างล่าง)
 */
export type MemberToolCtx = {
  tenantId: string;
  systemId?: string | null;
  /** คนที่กดยืนยัน (ผู้ช่วยล้วน = ไม่ต้องส่ง) */
  userId?: string | null;
  membershipId?: string | null;
  role?: MembershipCtx["role"];
  unitAccess?: string[];
  permissions?: Record<string, unknown>;
  /** id ข้อเสนอ — ใช้เป็นคีย์กันซ้ำตอนลงมือ (ไม่ส่ง = คิดจากเนื้อข้อเสนอเอง) */
  proposalId?: string | null;
};

function isToolCtx(v: unknown): v is MemberToolCtx {
  return isRecord(v) && typeof v.tenantId === "string" && v.tenantId.length > 0;
}

function membershipOf(ctx: MemberToolCtx): MembershipCtx {
  return {
    role: ctx.role ?? "STAFF",
    unitAccess: ctx.unitAccess ?? [],
    permissions: ctx.permissions ?? {},
  };
}

export async function runMemberTool(
  target: MemberToolCtx | string,
  name: string,
  rawArgs: unknown,
  opts: { systemId?: string } = {},
): Promise<MemberToolOutcome> {
  const tenantId = typeof target === "string" ? target : target.tenantId;
  const boundSystemId = (typeof target === "string" ? opts.systemId : (target.systemId ?? opts.systemId)) || undefined;
  const op = memberToolOps().find((o) => o.tool?.name === name);
  if (!op) return { mode: "error", error: `ไม่รู้จักเครื่องมือ "${name}"` };

  const systemName = isRecord(rawArgs) && typeof rawArgs.systemName === "string" ? rawArgs.systemName : undefined;
  const system = await findMemberSystem(tenantId, { systemName, systemId: boundSystemId });
  if (!system) return { mode: "error", error: boundSystemId ? NO_BOUND_SYSTEM : NO_SYSTEM };

  const prep = prepareCall(op, rawArgs);
  if (!prep.ok) return { mode: "error", error: prep.error };
  const prepared = prep.prepared;

  if (prepared.op.kind !== "read") {
    // 🔴 ผู้ช่วยไม่เคยเขียนเอง — สร้างข้อเสนอให้คนกดยืนยัน (สิทธิ์ตรวจตอนกด ไม่ใช่ตอนนี้)
    const summary = await summarize(prepared, tenantId, system.id);
    return {
      mode: "propose",
      kind: memberKindOf(prepared.op.id),
      summary,
      payload: {
        ...flatPayload(prepared),
        opId: prepared.op.id,
        input: prepared.input,
        params: prepared.params,
        systemId: system.id,
      },
    };
  }

  const actor = assistantActor(tenantId, system.id);
  if (!actor.can(prepared.op.action)) return { mode: "error", error: "ผู้ช่วยไม่มีสิทธิ์อ่านข้อมูลส่วนนี้" };
  try {
    const env = await runOpAsActor(prepared.op, actor, {
      input: prepared.input,
      params: prepared.params,
      requestId: `ai-${Date.now().toString(36)}`,
    });
    const body = trimResult(env.data);
    const result = isRecord(body) || Array.isArray(body) ? body : { ผล: body };
    if (env.extra) {
      const extra: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(env.extra)) extra[k] = trimResult(v);
      return { mode: "read", result: { data: result, ...extra } };
    }
    return { mode: "read", result };
  } catch (e) {
    return { mode: "error", error: mapError(e).message_th };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. ลงมือจริงหลังเจ้าของกดยืนยัน (เรียกจาก ai/proposals.ts)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * รัน op ของข้อเสนอ `member.*` ด้วยสิทธิ์ของ "คนกดยืนยัน"
 * - อ่าน payload จากแถวข้อเสนอเท่านั้น และ **ตรวจ schema ซ้ำ** (payload เก่าอาจมาจากสัญญาคนละรุ่น)
 * - audit เขียนใน `runOpAsActor`: actorType USER + after { proposalId, opId }
 * - โยน Error ภาษาไทยเมื่อทำไม่สำเร็จ (proposals.ts แปลงเป็น FAILED + note)
 */
export async function dispatchMemberKind(ctx: MemberToolCtx, kind: string, rawPayload: unknown): Promise<string>;
export async function dispatchMemberKind(
  m: MembershipCtx,
  tenantId: string,
  proposalId: string,
  kind: string,
  rawPayload: unknown,
  userId?: string | null,
): Promise<string>;
export async function dispatchMemberKind(...args: unknown[]): Promise<string> {
  // รูปใหม่ (M2.10): (ctx, kind, payload) · รูปเดิม (M1.11): (membership, tenantId, proposalId, kind, payload, userId?)
  const compact = isToolCtx(args[0]);
  const ctx: MemberToolCtx = compact
    ? (args[0] as MemberToolCtx)
    : {
        tenantId: String(args[1] ?? ""),
        ...(args[0] as MembershipCtx),
        proposalId: String(args[2] ?? ""),
        userId: (args[5] as string | null | undefined) ?? null,
      };
  const kind = String((compact ? args[1] : args[3]) ?? "");
  const rawPayload = compact ? args[2] : args[4];
  const tenantId = ctx.tenantId;
  const m = membershipOf(ctx);
  const userId = ctx.userId ?? null;
  const payload = isRecord(rawPayload) ? rawPayload : {};
  // คีย์กันซ้ำของการลงมือ: มี proposalId ใช้ตัวนั้น · ไม่มี = คิดจาก "คำสั่ง + เนื้อข้อเสนอ" ให้คงที่
  // 🔴 ห้ามปล่อยว่าง: ยืนยันซ้ำ (กดสองครั้ง/คิวยิงซ้ำ) ต้องไม่บวกแต้มหรือออกใบซ้ำ
  const proposalId =
    ctx.proposalId && ctx.proposalId.length > 0
      ? ctx.proposalId
      : `kind-${createHash("sha256").update(`${kind}\n${JSON.stringify(payload)}`).digest("hex").slice(0, 24)}`;
  const opId = typeof payload.opId === "string" ? payload.opId : kind.slice(KIND_PREFIX.length);
  const op = memberToolOps().find((o) => o.id === opId);
  if (!op || op.kind === "read") throw new Error("ไม่รู้จักคำสั่งของระบบสมาชิกในข้อเสนอนี้");

  const boundSystemId = typeof payload.systemId === "string" ? payload.systemId : (ctx.systemId ?? undefined);
  const system = await findMemberSystem(tenantId, { systemId: boundSystemId });
  if (!system) throw new Error(boundSystemId ? NO_BOUND_SYSTEM : NO_SYSTEM);

  const parsed = validateOpInput(op, payload.input);
  if (!parsed.ok) throw new Error(detailsMessageTh(parsed.details));
  const params: Record<string, string> = {};
  for (const [k, v] of Object.entries(isRecord(payload.params) ? payload.params : {})) {
    if (typeof v === "string") params[k] = v;
  }

  const actor = userActor(tenantId, system.id, m, userId);
  const body = isRecord(parsed.input) ? parsed.input : {};
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

/** ข้อความผลลัพธ์ภาษาไทยที่แสดงใต้การ์ดยืนยัน */
function noteOf(op: ApiOp, data: unknown): string {
  const d = isRecord(data) ? data : {};
  const bits: string[] = [];
  if (typeof d.memberCode === "string" && d.memberCode) bits.push(`รหัสสมาชิก ${d.memberCode}`);
  if (typeof d.name === "string" && d.name) bits.push(String(d.name));
  if (typeof d.status === "string" && d.status) bits.push(`สถานะ ${d.status}`);
  if (Array.isArray(d.tags) && d.tags.length > 0) bits.push(`แท็ก ${d.tags.join(", ")}`);
  if (d.applied === true) bits.push("มีผลแล้ว");
  if (d.pending === true) bits.push("ส่งเข้าสายอนุมัติแล้ว รอผู้มีอำนาจอนุมัติ");
  return bits.length > 0 ? `${op.label}เรียบร้อยแล้ว — ${bits.join(" · ")}` : `${op.label}เรียบร้อยแล้ว`;
}
