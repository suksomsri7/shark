// tools.ts — สะพานระหว่าง "ทะเบียน op ของ REST ขายหน้าร้าน (POS)" กับ "ผู้ช่วย AI" (POS P3.9 ▸ R1 R2 R3 R4 มติ 1 2 7 9 ◂)
//
// 🔴 หลักเดียวกับ `member/api/tools.ts` (บ้านแบบเดียวกัน): **ไม่มีตรรกะขาย/เงินของตัวเอง**
//    tool ของสกิล `sales` ที่มาจากทะเบียน = op ที่ประกาศ `tool` ใน `POS_OPS` (11 ตัว · op ยังมี 48 ตัว)
//    ⇒ สคีมา · ตรวจ input · สิทธิ์ · ขอบเขตสาขา · audit = ตัวเดียวกับ REST (`runOpAsActor`) ห้ามลอกซ้ำ
//
// ทางเดิน:
//   อ่าน (read)            → รันทันทีด้วย actor `assistant` = Membership ของ "คนที่ถาม" (ไม่กว้างกว่าคนถามเด็ดขาด)
//                             คีย์ API = actor ของคีย์ (scope ของคีย์ · ตัวกรองสาขา) แบบเดียวกับ REST
//   เขียน/อันตราย          → **ไม่ทำ** คืนข้อเสนอ kind `pos.<op id>` ให้คนกดยืนยัน (ai/proposals.ts)
//                             ตอนยืนยันรัน op ด้วย actor `user` = Membership ของคนกดจริง · idempotencyKey = id ของข้อเสนอ
//   kind เดิม `void_sale` (ข้อเสนอค้าง ≤ 24 ชม. ก่อน P3.9) → ทางเดียวกัน (sales.void → voidSaleByActor) + เหตุผลปริยาย (CD-4)
//   kind `pos_draft_po` (เครื่องมือเขียนมือของ ai/tools-pos.ts) → ร่างใบสั่งซื้อผ่าน ai-insights.ts (facade คลัง)
//
// 🔴 ไฟล์นี้อยู่ในโมดูล ⇒ ห้าม import `@/lib/ai/*` (วงกลม + เส้นข้ามโมดูล · ข้อสอบ qc-pos-p3.9 ST2/ST3) · ห้าม prisma ดิบ (ใช้ tenantDb)
// 🔴 ผลของ tool ≤ 8 KB (R2): ตัดแถวตามชนิด + ตัดซ้ำจนพอดี · ตัดคีย์ติดต่อ/เงินเดือนทิ้งเสมอ (ไม่มี tool ไหนอ่านค่าคอมฯ พนักงาน — P3.5 · R2)

import { tenantDb } from "@/lib/core/db";
import { evaluate, canAccessUnit, type MembershipCtx } from "@/lib/core/rbac";
import type { ApiActor } from "@/lib/api/actor";
import { jsonSchemaOf, type JsonSchema } from "@/lib/api/openapi";
import type { ApiOp } from "@/lib/api/op";
import { mapError } from "@/lib/api/respond";
import { detailsMessageTh, runOpAsActor, validateOpInput } from "@/lib/api/run";
import { posUnitIsLinked } from "../register";
import { bkkToday } from "../index";
import { draftPurchaseOrder } from "../ai-insights";
import { posActorCanUseUnit, posApiKeyActor, posRealScopes } from "./actor";
import { POS_OPS } from "./registry";

// ─────────────────────────────────────────────────────────────────────────────
// 1. ทะเบียน tool (สร้างจาก POS_OPS ตัวเดียว)
// ─────────────────────────────────────────────────────────────────────────────

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export type PosToolInfo = { name: string; opId: string; write: boolean; danger: boolean; description: string; parameters: JsonSchema };

/** op ทุกตัวที่ประกาศ `tool` — แหล่งความจริงเดียวของสกิล (11 ตัว · มติ 1) */
export function posToolOps(): ApiOp[] {
  return POS_OPS.filter((o) => o.tool);
}

/** `{id}` ของ path → ชื่ออาร์กิวเมนต์ (เอกพจน์ของส่วนก่อนหน้า + Id: /sales/{id} → saleId · /products/{id} → productId · /shifts/{id} → shiftId) */
function pathArgsOf(op: ApiOp): { arg: string; param: string }[] {
  const seg = op.path.split("/").filter(Boolean);
  const out: { arg: string; param: string }[] = [];
  seg.forEach((s, i) => {
    if (!s.startsWith("{") || !s.endsWith("}")) return;
    const param = s.slice(1, -1);
    if (param !== "id") {
      out.push({ arg: param, param });
      return;
    }
    const owner = (seg[i - 1] ?? "").replace(/s$/, "").replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase());
    out.push({ arg: `${owner}Id`, param });
  });
  return out;
}

/** อาร์กิวเมนต์รุ่นเดิมของ sales_summary / sales_by_day (`days` ย้อนหลังถึงวันนี้ · CD-6) */
const LEGACY_DAYS_TOOLS: ReadonlySet<string> = new Set(["sales_summary", "sales_by_day"]);

function parametersOf(op: ApiOp): JsonSchema {
  const base = op.input ? jsonSchemaOf(op.input, "input") : {};
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const { arg } of pathArgsOf(op)) {
    properties[arg] = { type: "string", minLength: 1, description: "Id of the record (find it with the matching list or report tool)." };
    required.push(arg);
  }
  for (const [k, v] of Object.entries(isRecord(base.properties) ? base.properties : {})) properties[k] = v;
  if (op.tool && LEGACY_DAYS_TOOLS.has(op.tool.name)) properties.days = { type: "integer", minimum: 1, maximum: 92, description: "Older form: the last N days up to today (use from/to instead)." };
  if (Array.isArray(base.required)) for (const r of base.required) required.push(String(r));
  const schema: JsonSchema = { type: "object", properties, additionalProperties: false };
  if (required.length) schema.required = required;
  if (base.$defs !== undefined) schema.$defs = base.$defs;
  return schema;
}

let infoCache: PosToolInfo[] | null = null;
/** ทะเบียน tool ของสกิล `sales` ที่มาจาก op (ชื่อ · op · เขียน/อันตราย · คำอธิบาย · สคีมา) */
export function posToolInfos(): PosToolInfo[] {
  if (infoCache) return infoCache;
  infoCache = posToolOps().map((op) => ({
    name: op.tool!.name,
    opId: op.id,
    write: op.kind !== "read",
    danger: op.kind === "danger",
    description: [op.summary, op.tool!.hint ?? ""].filter(Boolean).join(" "),
    parameters: parametersOf(op),
  }));
  return infoCache;
}

const KIND_PREFIX = "pos.";
/** kind ของข้อเสนอจาก op — `pos.<op id>` (เช่น pos.products.setPrice) */
export const posKindOf = (opId: string): string => `${KIND_PREFIX}${opId}`;
/** kind เดิมของข้อเสนอที่เดินทางเดียวกัน (ข้อเสนอค้างจากก่อน P3.9 + ร่าง PO) */
export const POS_LEGACY_KINDS: readonly string[] = ["void_sale", "pos_draft_po"];

export function isPosKind(kind: string): boolean {
  if (POS_LEGACY_KINDS.includes(kind)) return true;
  return kind.startsWith(KIND_PREFIX) && posToolOps().some((o) => o.kind !== "read" && posKindOf(o.id) === kind);
}

/** สิทธิ์ของคนกดยืนยันต่อ kind = `op.action` ตรง ๆ (86 = pos.sale.create · มติ 7) — read ไม่เป็นข้อเสนอ */
export function posKindAccess(): Record<string, { module: string; action: string }> {
  const out: Record<string, { module: string; action: string }> = {};
  for (const op of posToolOps()) if (op.kind !== "read") out[posKindOf(op.id)] = { module: "pos", action: op.action };
  return out;
}

/** kind ที่ต้องยืนยัน 2 ชั้น = op ชนิด danger ที่เปิดเป็น tool (ยกเลิกบิล) */
export function posDestructiveKinds(): string[] {
  return posToolOps().filter((o) => o.kind === "danger").map((o) => posKindOf(o.id));
}

/** scope ของ tool ที่มาจากทะเบียน (= op.action) · tool เขียนมือ (pos_create_sale · pos_draft_po) / นอก POS = null */
export function posToolScope(toolName: string): string | null {
  return posToolOps().find((o) => o.tool?.name === toolName)?.action ?? null;
}

/** tool เขียนมือของสกิล sales ที่ต้องมี scope ของ POS เมื่อผู้เรียกเป็นคีย์ API (P2.13 มติ 7 — คงชื่อเดิม) */
const POS_HAND_TOOL_SCOPES: Readonly<Record<string, string>> = { pos_create_sale: "pos.sale.create" };
// POS P5.2 ▸ R1 F1 (CD-P52-O3-1): tool เขียนมือของ POS (นอกทะเบียน op) = POS_HAND_TOOL_SCOPES + pos_draft_po — ด่านคีย์กลางของ `/api/v1/ai/*`
//   (general-key-gate.ts isPosScopedTool) ใช้ชุดนี้ร่วมกับ posToolScope · pos_draft_po ไม่มี scope ของคีย์ (ยังเป็นของคนในร้านเท่านั้น · tools-pos.ts) ◂
const POS_HAND_TOOLS: ReadonlySet<string> = new Set([...Object.keys(POS_HAND_TOOL_SCOPES), "pos_draft_po"]);
/** POS P5.2 ▸ R1 F1 (CD-P52-O3-1): tool เขียนมือของสกิล sales (pos_create_sale · pos_draft_po) ◂ */
export function isPosHandTool(toolName: string): boolean {
  return POS_HAND_TOOLS.has(toolName);
}
/** CD-7: คีย์กลางรุ่นเดิม (ไม่มี scope เลย) ยังเรียกชื่อเดิมได้เหมือนก่อน P3.9 */
// POS P3.9 ▸ fix1 F3 (CD-P39c): คีย์กลางรุ่นเดิมได้เฉพาะ "อ่าน" ชื่อเดิม 2 ตัว — เสนอเขียนของ POS (void_sale · pos_create_sale) ไม่ได้ (ตั้งใจ · OP §AI) ·
//   POS_HAND_TOOL_SCOPES ข้างบนคงไว้: เป็นด่าน manifest/route ของคีย์ที่มี scope (pos_create_sale ⇐ pos.sale.create — ตรึงโดย qc-pos-p3.9 TL7 + qc-pos-p2.13 ST5) ◂
const SCOPELESS_LEGACY: ReadonlySet<string> = new Set(["sales_summary", "sales_by_day"]);

/**
 * คีย์ API ที่ถือ scope ชุดนี้เรียก tool นี้ได้ไหม (tool นอก POS = ไม่เกี่ยว คืน true)
 * = scope ของ op (ไม่มีการอนุมานข้ามคีย์ — STAFF ตรงตัวเหมือน REST) · ตัวกรองสาขา `pos.filter.unit:*` ไม่นับเป็นสิทธิ์
 */
export function posToolAllowedForScopes(toolName: string, scopes: string[]): boolean {
  const action = posToolScope(toolName) ?? POS_HAND_TOOL_SCOPES[toolName] ?? null;
  if (action === null) return true;
  const real = posRealScopes(scopes);
  if (scopes.length === 0) return SCOPELESS_LEGACY.has(toolName);
  return real.includes(action);
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. ผู้กระทำ
// ─────────────────────────────────────────────────────────────────────────────

/** คนที่ถาม / คนที่กดยืนยัน — Membership ณ คำขอนี้ (ห้ามรับจาก body) */
export type PosToolPerson = { userId: string; role: MembershipCtx["role"]; unitAccess: string[]; permissions: Record<string, unknown> };
/** คีย์ API (ผ่านด่าน route + tool-access แล้ว) · general = คีย์กลางรุ่นเดิม (scope ว่าง ไม่ผูกระบบ) */
export type PosToolKey = { keyId: string; scopes: string[]; systemId: string | null; general: boolean };
export type PosToolCtx = { tenantId: string; systemId?: string | null; person?: PosToolPerson | null; key?: PosToolKey | null };

const memOf = (p: PosToolPerson): MembershipCtx => ({ role: p.role, unitAccess: p.role === "OWNER" ? ["*"] : [...p.unitAccess], permissions: { ...p.permissions } });

function personActor(kind: "assistant" | "user", tenantId: string, systemId: string, p: PosToolPerson): ApiActor {
  const m = memOf(p);
  return {
    kind,
    module: "pos",
    tenantId,
    systemId,
    userId: p.userId,
    keyName: kind === "user" ? "ผู้ช่วย AI (ผู้ใช้ยืนยัน)" : "ผู้ช่วย AI",
    scopes: [],
    membership: m,
    can: (action) => evaluate(m, { module: "pos", action }),
    denyMessageTh: "บัญชีที่ถามยังไม่มีสิทธิ์ทำรายการนี้ในระบบขายหน้าร้าน — ขอสิทธิ์จากเจ้าของร้าน",
  };
}

/** ระบบ POS ของร้าน — ค้นผ่าน tenantDb (id ของร้านอื่นไม่เจอ) · ไม่ระบุ = ระบบแรก หรือชื่อที่ตรง */
async function findPosSystem(tenantId: string, opts: { systemId?: string | null; systemName?: string } = {}): Promise<{ id: string; name: string } | null> {
  if (opts.systemId) return tenantDb({ tenantId }).appSystem.findFirst({ where: { id: opts.systemId, type: "POS" }, select: { id: true, name: true } });
  const all = await tenantDb({ tenantId }).appSystem.findMany({ where: { type: "POS" }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } });
  const want = opts.systemName?.trim().toLowerCase();
  return (want ? all.find((s) => s.name.toLowerCase().includes(want)) : undefined) ?? all[0] ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. เตรียมคำสั่ง + ตัดผล
// ─────────────────────────────────────────────────────────────────────────────

type Prepared = { op: ApiOp; input: unknown; params: Record<string, string> };
const DAY_MS = 86_400_000;
const REASON_MSG = "ต้องระบุเหตุผลของการยกเลิกบิล (reason อย่างน้อย 5 ตัวอักษร) — ถามผู้ใช้ก่อนแล้วค่อยเสนออีกครั้ง";

function prepareCall(op: ApiOp, rawArgs: unknown): { ok: true; prepared: Prepared } | { ok: false; error: string } {
  const args = isRecord(rawArgs) ? { ...rawArgs } : {};
  delete args.systemName;
  // CD-6: `days` รุ่นเดิม → from = วันนี้ − (days − 1) · to = วันนี้ (เมื่อไม่ได้ส่ง from/to มาเอง)
  if (op.tool && LEGACY_DAYS_TOOLS.has(op.tool.name) && "days" in args) {
    const n = Math.floor(Number(args.days));
    delete args.days;
    if (args.from === undefined && args.to === undefined && Number.isFinite(n) && n >= 1) {
      const to = bkkToday();
      args.to = to;
      args.from = new Date(Date.parse(`${to}T00:00:00Z`) - (Math.min(n, 92) - 1) * DAY_MS).toISOString().slice(0, 10);
    }
  }
  // R2: เพดานแถวของ tool อ่านที่เป็นอันดับ (ขายดี 10 · จุดผิดปกติ 20 — ตัดต่อกฎด้วย capPerRule ของตัวอ่าน)
  if (op.id === "reports.products" && args.limit === undefined) args.limit = 10;
  if (op.id === "reports.anomalies" && args.limit === undefined) args.limit = 20;
  if (op.id === "sales.void" && (typeof args.reason !== "string" || args.reason.trim().length < 5)) return { ok: false, error: REASON_MSG };
  const params: Record<string, string> = {};
  const rest: Record<string, unknown> = {};
  const pathArgs = pathArgsOf(op);
  for (const [k, v] of Object.entries(args)) {
    const hit = pathArgs.find((p) => p.arg === k);
    if (!hit) {
      rest[k] = v;
      continue;
    }
    if (typeof v !== "string" || !v.trim()) return { ok: false, error: `ค่า ${k} ต้องเป็นรหัส (id) ที่ไม่ว่าง` };
    params[hit.param] = v.trim();
  }
  const missing = pathArgs.filter((p) => params[p.param] === undefined).map((p) => p.arg);
  if (missing.length) return { ok: false, error: `ต้องระบุ ${missing.join(", ")} ด้วย` };
  const parsed = validateOpInput(op, rest);
  if (!parsed.ok) return { ok: false, error: detailsMessageTh(parsed.details) };
  return { ok: true, prepared: { op, input: parsed.input, params } };
}

const MAX_TOOL_BYTES = 8 * 1024;
const MAX_ROWS = 31;
/** คีย์ที่ไม่มีวันออกไปถึงโมเดล (PDPA · เงินเดือน — R2 §5) */
const BLOCKED_KEY = /phone|email|pinHash|salary|pay[r]oll|staff[C]ommission|hr[P]ay/i;

function trimValue(v: unknown, maxRows: number): unknown {
  if (Array.isArray(v)) {
    const rows = v.slice(0, maxRows).map((x) => trimValue(x, maxRows));
    return v.length > maxRows ? [...rows, `…แสดง ${maxRows} จาก ${v.length} รายการ`] : rows;
  }
  if (!isRecord(v)) return v;
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v)) {
    if (x === null || x === undefined || BLOCKED_KEY.test(k)) continue;
    out[k] = trimValue(x, maxRows);
  }
  return out;
}
const bytes = (s: string) => Buffer.byteLength(s, "utf8");
/** POS P3.9 ▸ fix1 N5: ตัวตัดเดียวกันให้เครื่องมือเขียนมือของสกิล sales (pos_draft_po) — ผลเป็น JSON ≤ 8 KB เสมอ ◂ */
export function capPosToolResult(v: unknown): unknown {
  return capResult(v);
}
/** ผลอ่าน → JSON ≤ 8 KB: ตัดแถวลงทีละครึ่งจนพอดี (บอกโมเดลว่าถูกตัด) */
function capResult(v: unknown): unknown {
  for (let rows = MAX_ROWS; rows >= 1; rows = Math.floor(rows / 2)) {
    const t = trimValue(v, rows);
    if (bytes(JSON.stringify(t)) <= MAX_TOOL_BYTES) return t;
  }
  return { ผล: "ผลลัพธ์ยาวเกินกว่าจะส่งให้ผู้ช่วยได้ — ขอช่วงวันที่สั้นลงหรือระบุสาขา" };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. สรุปของข้อเสนอ (การ์ดยืนยันต้องบอกชัดว่าจะทำอะไรกับอะไร)
// ─────────────────────────────────────────────────────────────────────────────

const baht = (satang: number) => `฿${(satang / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * POS P3.9 ▸ fix1 F4 (=N4 · CD-P39c): ระเบียนเป้าหมายของข้อเสนอ + ด่านสาขาของ "คนที่ถาม" **ก่อน** อ่านอะไรมาแสดง —
 *   ไม่พบ / อยู่สาขาที่ผู้ถามใช้ไม่ได้ (คนนอกสาขา · คีย์ที่มีตัวกรองสาขา) = ข้อความเดียวกัน (ไม่บอกว่ามีอยู่ ไม่คืนเลขบิล/ยอด/ชื่อ/ราคา) ◂
 */
type Target = { kind: "product"; name: string; basePriceSatang: number | null; unitId: string | null } | { kind: "sale"; receiptNo: string | null; grandTotalSatang: number; unitId: string } | { kind: "none" };
async function targetOf(p: Prepared, asker: ApiActor, tenantId: string, systemId: string): Promise<Target | { error: string }> {
  const db = tenantDb({ tenantId, systemId });
  const given = isRecord(p.input) && typeof p.input.unitId === "string" ? p.input.unitId : null;
  if (given && !posActorCanUseUnit(asker, given)) return { error: "ไม่พบจุดขายนี้ในระบบขายหน้าร้านที่เชื่อมไว้" };
  if (p.op.id.startsWith("products.") && p.params.id) {
    const row = await db.posProduct.findFirst({ where: { id: p.params.id }, select: { name: true, basePriceSatang: true, unitId: true } });
    if (!row || (row.unitId && !posActorCanUseUnit(asker, row.unitId))) return { error: "ไม่พบสินค้านี้ในระบบขายหน้าร้าน" };
    // POS P3.9 ▸ fix2 N6 (CD-P39d): 86 เป็นรายสาขา — สินค้าทุกสาขาต้องระบุ unitId ตั้งแต่ตอนเสนอ (เดิมเสนอได้แล้วไปล้ม 422 ตอนกดยืนยัน) ◂
    if (p.op.id === "products.availability" && row.unitId === null && !given) return { error: "สินค้านี้ขายทุกสาขา — ระบุสาขา (unitId) ที่จะแจ้งของหมด/คืนขาย" };
    return { kind: "product", name: row.name, basePriceSatang: row.basePriceSatang, unitId: row.unitId };
  }
  if (p.op.id.startsWith("sales.") && p.params.id) {
    const row = await db.posSale.findFirst({ where: { id: p.params.id }, select: { receiptNo: true, grandTotalSatang: true, unitId: true } });
    if (!row || !posActorCanUseUnit(asker, row.unitId)) return { error: "ไม่พบบิลนี้ในระบบขายหน้าร้าน" };
    return { kind: "sale", receiptNo: row.receiptNo, grandTotalSatang: row.grandTotalSatang, unitId: row.unitId };
  }
  return { kind: "none" };
}

async function summarize(p: Prepared, t: Target, tenantId: string): Promise<string> {
  const body = isRecord(p.input) ? p.input : {};
  const parts: string[] = [p.op.label];
  const unitName = async (id: string) => (await tenantDb({ tenantId }).businessUnit.findFirst({ where: { id }, select: { name: true } }))?.name ?? id;
  if (t.kind === "product") parts.push(`"${t.name}"${p.op.id === "products.setPrice" && typeof t.basePriceSatang === "number" ? ` (ราคาเดิม ${baht(t.basePriceSatang)})` : ""}`);
  if (t.kind === "sale") parts.push(`บิล ${t.receiptNo ?? (p.params.id ?? "").slice(-6)} ยอด ${baht(t.grandTotalSatang)}`);
  if (typeof body.priceSatang === "number") parts.push(`ราคาใหม่ ${baht(body.priceSatang)}`);
  if (typeof body.available === "boolean") parts.push(body.available ? "คืนขาย" : "แจ้งของหมด (86)");
  // POS P3.9 ▸ fix1 F4: ขอบเขตจริงของการเขียน — 86 = สาขาที่ระบุ/ของสินค้า · ตั้งราคาสินค้าทุกสาขา = "ทุกสาขา" · บิล = สาขาของบิล ◂
  const scopeUnit = typeof body.unitId === "string" && p.op.id === "products.availability" ? body.unitId : t.kind === "none" ? null : t.unitId;
  if (scopeUnit) parts.push(`สาขา ${await unitName(scopeUnit)}`);
  else if (t.kind === "product") parts.push("ทุกสาขา");
  if (typeof body.reason === "string") parts.push(`เหตุผล: ${body.reason}`);
  return parts.join(" · ");
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. ทางเข้าหลัก: ผู้ช่วยเรียก tool
// ─────────────────────────────────────────────────────────────────────────────

export type PosToolOutcome = { mode: "error"; error: string } | { mode: "read"; result: unknown } | { mode: "propose"; kind: string; summary: string; payload: Record<string, unknown> };

const NO_SYSTEM = "ร้านนี้ยังไม่ได้เปิดระบบขายหน้าร้าน (POS)";
const NO_WHO = "ไม่ทราบว่าใครเป็นผู้ใช้เครื่องมือนี้ จึงยังทำรายการให้ไม่ได้";

/**
 * เรียก tool ของสกิล sales ที่มาจากทะเบียน 1 ตัว — ไม่โยน (ผู้เรียกเป็นโมเดล) ทุกทางผิด = `{mode:"error"}` ภาษาไทย
 * read = รันทันทีด้วยสิทธิ์ของคนที่ถาม (หรือ scope ของคีย์) · write/danger = คืนข้อมูลสำหรับสร้างข้อเสนอ
 */
export async function runPosTool(ctx: PosToolCtx, name: string, rawArgs: unknown): Promise<PosToolOutcome> {
  const op = posToolOps().find((o) => o.tool?.name === name);
  if (!op) return { mode: "error", error: `ไม่รู้จักเครื่องมือ "${name}"` };
  if (!ctx.person && !ctx.key) return { mode: "error", error: NO_WHO };
  const systemName = isRecord(rawArgs) && typeof rawArgs.systemName === "string" ? rawArgs.systemName : undefined;
  const system = await findPosSystem(ctx.tenantId, { systemId: ctx.key?.systemId ?? ctx.systemId ?? null, systemName });
  if (!system) return { mode: "error", error: NO_SYSTEM };
  const prep = prepareCall(op, rawArgs);
  if (!prep.ok) return { mode: "error", error: prep.error };
  const p = prep.prepared;

  let actor: ApiActor;
  if (ctx.key) {
    // CD-7: คีย์กลางรุ่นเดิม (scope ว่าง) อ่านชื่อเดิมได้ด้วยสิทธิ์อ่านรายงานเท่านั้น · คีย์ปกติ = scope ของคีย์ตรงตัว
    const scopes = ctx.key.scopes.length === 0 && ctx.key.general && SCOPELESS_LEGACY.has(name) ? ["pos.report.view"] : ctx.key.scopes;
    actor = posApiKeyActor({ tenantId: ctx.tenantId, systemId: system.id, keyId: ctx.key.keyId, keyName: "ผู้ช่วย AI ภายนอก", scopes });
  } else actor = personActor("assistant", ctx.tenantId, system.id, ctx.person!);

  if (op.kind !== "read") {
    // 🔴 ผู้ช่วยไม่เขียนเอง — ข้อเสนอให้คนกดยืนยัน (สิทธิ์ตรวจตอนกดด้วย op.action ของคนกด)
    // POS P3.9 ▸ fix1 F4: ด่านสาขาของผู้ถามก่อนสรุป (ไม่มีข้อมูลข้ามสาขารั่ว) ◂
    const t = await targetOf(p, actor, ctx.tenantId, system.id);
    if ("error" in t) return { mode: "error", error: t.error };
    const summary = await summarize(p, t, ctx.tenantId);
    const flat: Record<string, unknown> = {};
    for (const { arg, param } of pathArgsOf(op)) if (p.params[param] !== undefined) flat[arg] = p.params[param];
    if (isRecord(p.input)) Object.assign(flat, p.input);
    return { mode: "propose", kind: posKindOf(op.id), summary, payload: { ...flat, opId: op.id, input: p.input, params: p.params, systemId: system.id } };
  }

  if (!actor.can(op.action)) return { mode: "error", error: `คุณไม่มีสิทธิ์ดูข้อมูลส่วนนี้ (ต้องมีสิทธิ์ ${op.action}) — ขอให้เจ้าของร้านเปิดสิทธิ์ให้ก่อน` };
  try {
    const env = await runOpAsActor(op, actor, { input: p.input, params: p.params, requestId: `ai-${Date.now().toString(36)}` });
    const data = isRecord(env.data) || Array.isArray(env.data) ? env.data : { ผล: env.data };
    return { mode: "read", result: capResult(env.extra ? { data, ...env.extra } : data) };
  } catch (e) {
    return { mode: "error", error: mapError(e).message_th };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. ลงมือหลังคนกดยืนยัน (เรียกจาก ai/proposals.ts)
// ─────────────────────────────────────────────────────────────────────────────

/** CD-4: ข้อเสนอ `void_sale` รุ่นเดิมไม่มีเหตุผล — ใช้ข้อความนี้ลง audit (ทางเดียวกับ sales.void) */
export const POS_LEGACY_VOID_REASON = "ยกเลิกบิลผ่านผู้ช่วย AI (คำขอเดิม)";

export type PosConfirmCtx = PosToolPerson & { tenantId: string; proposalId: string };

/**
 * รัน op ของข้อเสนอ `pos.*` (+ kind เดิม void_sale · pos_draft_po) ด้วยสิทธิ์ของคนกดยืนยัน — คืนข้อความไทย · ไม่สำเร็จ = โยน Error ไทย
 * payload อ่านจากแถวข้อเสนอเท่านั้น และ **ตรวจ schema ซ้ำ** · audit ของ op เขียนใน runOpAsActor (actorType USER + proposalId)
 */
export async function dispatchPosKind(ctx: PosConfirmCtx, kind: string, rawPayload: unknown): Promise<string> {
  const payload = isRecord(rawPayload) ? rawPayload : {};
  if (!ctx.userId) throw new Error("ต้องรู้ตัวผู้กดยืนยันก่อนจึงจะทำรายการของระบบขายหน้าร้านได้ — เปิดจากหน้าแอปแล้วลองอีกครั้ง");
  const person: PosToolPerson = { userId: ctx.userId, role: ctx.role, unitAccess: ctx.unitAccess, permissions: ctx.permissions };

  if (kind === "pos_draft_po") return draftPurchaseOrder({ tenantId: ctx.tenantId, proposalId: ctx.proposalId }, { ...person }, payload);

  let opId: string;
  let input: unknown;
  let params: Record<string, string> = {};
  let systemId = typeof payload.systemId === "string" ? payload.systemId : null;
  if (kind === "void_sale") {
    // ข้อเสนอค้างรุ่นเดิม {saleId} — re-route ทางเดียวกับ void_sale ใหม่ (มติ 2 · CD-4)
    const saleId = String(payload.saleId ?? "").trim();
    if (!saleId) throw new Error("ต้องระบุรหัสบิลที่จะยกเลิก");
    // PosSale เป็นตารางระดับระบบ (tenantDb ต้องได้ systemId) ⇒ หาในทุกระบบ POS ของร้าน (ปกติ 1–2 ระบบ)
    let sale: { systemId: string } | null = null;
    for (const s of await tenantDb({ tenantId: ctx.tenantId }).appSystem.findMany({ where: { type: "POS" }, select: { id: true } })) {
      sale = await tenantDb({ tenantId: ctx.tenantId, systemId: s.id }).posSale.findFirst({ where: { id: saleId }, select: { systemId: true } });
      if (sale) break;
    }
    if (!sale) throw new Error("ไม่พบบิลนี้");
    opId = "sales.void";
    input = { reason: typeof payload.reason === "string" && payload.reason.trim().length >= 5 ? payload.reason.trim() : POS_LEGACY_VOID_REASON };
    params = { id: saleId };
    systemId = sale.systemId;
  } else {
    opId = typeof payload.opId === "string" ? payload.opId : kind.slice(KIND_PREFIX.length);
    if (posKindOf(opId) !== kind) throw new Error("ข้อเสนอนี้ไม่ตรงกับคำสั่งของระบบขายหน้าร้าน");
    input = payload.input;
    for (const [k, v] of Object.entries(isRecord(payload.params) ? payload.params : {})) if (typeof v === "string") params[k] = v;
  }
  const op = posToolOps().find((o) => o.id === opId);
  if (!op || op.kind === "read") throw new Error("ไม่รู้จักคำสั่งของระบบขายหน้าร้านในข้อเสนอนี้");
  const system = await findPosSystem(ctx.tenantId, { systemId });
  if (!system) throw new Error(NO_SYSTEM);
  const parsed = validateOpInput(op, input);
  if (!parsed.ok) throw new Error(detailsMessageTh(parsed.details));
  const actor = personActor("user", ctx.tenantId, system.id, person);
  const body = isRecord(parsed.input) ? parsed.input : {};
  try {
    const env = await runOpAsActor(op, actor, {
      input: parsed.input,
      params,
      requestId: `ai-proposal-${ctx.proposalId}`,
      idempotencyKey: ctx.proposalId,
      ...(typeof body.reason === "string" ? { reason: body.reason } : {}),
      audit: { proposalId: ctx.proposalId, actor: "ai-assistant" },
    });
    return noteOf(op, env.data);
  } catch (e) {
    throw new Error(mapError(e).message_th);
  }
}

function noteOf(op: ApiOp, data: unknown): string {
  const d = isRecord(data) ? data : {};
  if (op.id === "products.setPrice" && typeof d.basePriceSatang === "number") return `${op.label}เรียบร้อยแล้ว — ราคาใหม่ ${baht(d.basePriceSatang)}`;
  if (op.id === "products.availability") return d.available === false ? "แจ้งของหมด (86) เรียบร้อยแล้ว" : "คืนขายเรียบร้อยแล้ว";
  if (op.id === "sales.void") return "ยกเลิก (void) บิลเรียบร้อยแล้ว";
  return `${op.label}เรียบร้อยแล้ว`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. R3 (มติ 9) ด่านของ `pos_create_sale` รุ่นเดิม — ผู้กดยืนยันต้องใช้สาขานั้นได้ + สาขาผูก POS · บรรทัดราคาเองต้องมี priceOverride
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ตรวจก่อนเปิดบิลจากข้อเสนอ `pos_create_sale` (ai/proposals.ts เรียก ก่อน createSale ตัวเดิม — จำนวน createSale( ไม่เปลี่ยน)
 * บรรทัด "แคตตาล็อก" = ชื่อตรงกับสินค้าที่ขายได้ที่สาขานั้น **และ** ราคาเท่าราคาแคตตาล็อก · อื่น ๆ = ราคากำหนดเอง ⇒ ต้องมี pos.sale.priceOverride
 * ไม่ผ่าน = โยน Error ไทย (proposals.ts แปลงเป็น FAILED + note · ไม่มีบิล)
 */
export async function assertLegacySaleAllowed(
  ctx: { tenantId: string; systemId: string; unitId: string },
  m: MembershipCtx,
  lines: readonly { name: string; unitPriceSatang: number }[],
): Promise<void> {
  if (!canAccessUnit(m, ctx.unitId) || !(await posUnitIsLinked(ctx.tenantId, ctx.systemId, ctx.unitId))) {
    throw new Error("ไม่พบจุดขายนี้ในสาขาที่คุณดูแล — ผู้กดยืนยันต้องเข้าถึงสาขานั้นและสาขาต้องผูกระบบขายหน้าร้าน");
  }
  if (evaluate(m, { module: "pos", action: "pos.sale.priceOverride", unitId: ctx.unitId })) return;
  const names = [...new Set(lines.map((l) => l.name))];
  const rows = names.length
    ? await tenantDb({ tenantId: ctx.tenantId, systemId: ctx.systemId }).posProduct.findMany({
        where: { name: { in: names }, archivedAt: null, OR: [{ unitId: null }, { unitId: ctx.unitId }] },
        select: { name: true, basePriceSatang: true },
      })
    : [];
  const custom = lines.filter((l) => !rows.some((r) => r.name === l.name && r.basePriceSatang === l.unitPriceSatang));
  if (custom.length) {
    throw new Error(`รายการ "${custom[0]!.name}" ไม่ตรงกับสินค้า/ราคาในแคตตาล็อกของสาขานี้ — การตั้งราคาเองต้องมีสิทธิ์ pos.sale.priceOverride ให้ผู้มีสิทธิ์เป็นผู้กดยืนยัน`);
  }
}
