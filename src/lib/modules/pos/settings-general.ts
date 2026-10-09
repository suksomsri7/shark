// settings-general.ts — ตัวเขียนค่าตั้ง POS แท็บ "ทั่วไป" + เพดานส่วนลด + สต็อกของสาขา + ประวัติการเปลี่ยน (P1.18 S · R1 R3 R4 R5 R6 R9)
//
// ทางเขียนเดียวกับ updatePosReceiptSettings (receipt-settings.ts): สิทธิ์ → ตรวจแพตช์ทั้งก้อน → ธุรกรรม + ล็อกแถว FOR UPDATE →
//   jsonb_set ของ "เฉพาะคีย์ของตัวเอง" ในคำสั่งเดียว (คีย์อื่นของ settings / settings.pos ไม่ถูกแตะ byte-identical) → AuditLog
// 🔴 คำปฏิเสธ "คืน" เป็นข้อมูล {ok:false, code, message(ไทย), field?} เสมอ — ไม่โยน
// 🔴 ตัวเขียนทั่วไปเป็นเจ้าของเฉพาะ settings.pos.{heldCart, register, shift, weighedBarcode, receiptLocale, reports} ·
//    เพดานส่วนลด = settings.pos.discount · สต็อกสาขา = BusinessUnit.settings.pos.stock
// 🔴 กฎไป-กลับ (R3): ช่วงที่ตรวจ = ช่วงของตัวอ่านของผู้ใช้แต่ละตัว ⇒ ค่าที่รับเขียนแล้วตัวอ่านคืนค่าเดิมเสมอ
//    (posHeldCartExpireDays · posRegisterAutoLockMinutes · parseShiftSettings · weighedBarcodeSettings · posReceiptLocale · posDayCutoffMinutes)
// 🔴 สิทธิ์: pos.settings.manage — ค่าที่ใช้ทั้งระบบต้องมีครบ "ทุกสาขา" ที่ผูก POS นี้ (แบบ canManageAllLinkedUnits) · สต็อกสาขา = ที่สาขานั้น
// 🔴 แพตช์ที่ไม่เปลี่ยนอะไร (ค่าเดิม) = ok · ไม่เขียน · ไม่มี audit (มติ 11)

import type { Prisma } from "@prisma/client";
import { evaluate, type MembershipCtx } from "@/lib/core/rbac";
import { writeAudit } from "@/lib/core/audit";
import { prisma } from "./db";
import { posDiscountCaps, posHeldCartExpireDays, posRegisterAutoLockMinutes, type PosDiscountCaps } from "./register-shared";
import { parseShiftSettings } from "./shift";
import { weighedBarcodeSettings } from "./scan-shared";
import {
  maskAuditPhones,
  POS_GENERAL_LIMITS,
  posDayCutoffMinutes,
  posReceiptLocale,
  type PosDiscountCapsResult,
  type PosGeneralSettings,
  type PosGeneralSettingsResult,
  type PosOversellPolicy,
  type PosSettingsHistoryItem,
  type PosSettingsHistoryResult,
  type PosSettingsRefusal,
  type PosSettingsRefusalCode,
  type PosUnitStockPolicyResult,
} from "./settings-shared";

type Db = typeof prisma | Prisma.TransactionClient;
type Ctx = { tenantId: string; systemId: string };
export type PosSettingsWriterActor = { userId: string; role: string; unitAccess?: string[]; permissions?: Record<string, unknown> };

export const POS_SETTINGS_AUDIT = "pos.settings.updated";
export const PERM_SETTINGS_MANAGE = "pos.settings.manage";

const MSG: Record<PosSettingsRefusalCode, string> = {
  NOT_FOUND: "ไม่พบจุดขายนี้",
  PERMISSION_DENIED: "บัญชีนี้ยังไม่มีสิทธิ์ตั้งค่าหน้าขาย — ต้องมีสิทธิ์ตั้งค่าหน้าขายทุกสาขาของจุดขายนี้",
  VALIDATION: "ค่าที่ตั้งไม่ถูกต้อง",
  UNKNOWN: "เกิดข้อผิดพลาด — ลองอีกครั้ง",
  SETTINGS_SECTION_LOCKED: "ส่วนนี้เจ้าของร้านเท่านั้นที่แก้ได้",
  CONFIRM_REQUIRED: "ต้องยืนยันก่อนปิด",
};
export function settingsRefuse(code: PosSettingsRefusalCode, message?: string, field?: string): PosSettingsRefusal {
  return field ? { ok: false, code, message: message ?? MSG[code], field } : { ok: false, code, message: message ?? MSG[code] };
}
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 64;
const isInt = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
export const ctxOk = (ctx: unknown): ctx is Ctx => isRecord(ctx) && isId(ctx.tenantId) && isId(ctx.systemId);
/** JSON แบบเรียงคีย์ (เทียบว่าเปลี่ยนจริงไหม) */
function canon(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
  if (isRecord(v)) return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(",")}}`;
  return JSON.stringify(v ?? null);
}

/** actor → MembershipCtx (บทบาทนอก 3 แบบ = null) */
export function settingsMembership(a: unknown): (MembershipCtx & { userId: string }) | null {
  if (!isRecord(a) || !isId(a.userId) || (a.role !== "OWNER" && a.role !== "MANAGER" && a.role !== "STAFF")) return null;
  return {
    userId: a.userId,
    role: a.role,
    unitAccess: Array.isArray(a.unitAccess) ? a.unitAccess.filter((u): u is string => typeof u === "string") : [],
    permissions: isRecord(a.permissions) ? a.permissions : {},
  };
}

/** สาขา (ไม่เก็บถาวร) ที่ผูก POS นี้ */
export async function posLinkedUnitIds(db: Db, ctx: Ctx): Promise<string[]> {
  const links = await db.appSystemUnit.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, type: "POS" }, select: { unitId: true } });
  if (!links.length) return [];
  const live = await db.businessUnit.findMany({ where: { tenantId: ctx.tenantId, id: { in: links.map((l) => l.unitId) }, status: { not: "ARCHIVED" } }, select: { id: true } });
  return live.map((u) => u.id);
}

/** สิทธิ์ action ครบทุกสาขาที่ผูก POS นี้ (OWNER / "*" ผ่าน · POS ยังไม่ผูกสาขา = เฉพาะ OWNER / "*") — กติกาเดียวกับ canManageAllLinkedUnits */
export async function canOnAllLinkedUnits(db: Db, ctx: Ctx, m: MembershipCtx, action: string): Promise<boolean> {
  if (!evaluate(m, { module: "pos", action })) return false;
  if (m.role === "OWNER" || m.unitAccess.includes("*")) return true;
  const units = await posLinkedUnitIds(db, ctx);
  return units.length > 0 && units.every((u) => evaluate(m, { module: "pos", action, unitId: u }));
}

async function posSystem(db: Db, ctx: Ctx): Promise<{ id: string; settings: unknown } | null> {
  return db.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId, type: "POS" }, select: { id: true, settings: true } });
}
async function lockPos(tx: Prisma.TransactionClient, ctx: Ctx): Promise<boolean> {
  const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "AppSystem" WHERE id = ${ctx.systemId} AND "tenantId" = ${ctx.tenantId} AND type = 'POS' FOR UPDATE`;
  return locked.length > 0;
}
/** รวม sub-tree ใต้ settings.pos ในคำสั่งเดียว (jsonb_set + ||) — คีย์อื่นของ settings/pos ไม่ถูกแตะ */
async function mergePosKeys(tx: Prisma.TransactionClient, ctx: Ctx, keys: Record<string, unknown>): Promise<void> {
  const json = JSON.stringify(keys);
  await tx.$executeRaw`
    UPDATE "AppSystem"
    SET "settings" = jsonb_set(
      CASE WHEN jsonb_typeof("settings") = 'object' THEN "settings" ELSE '{}'::jsonb END,
      '{pos}',
      (CASE WHEN jsonb_typeof("settings"->'pos') = 'object' THEN "settings"->'pos' ELSE '{}'::jsonb END) || ${json}::jsonb,
      true),
      "updatedAt" = now()
    WHERE "id" = ${ctx.systemId} AND "tenantId" = ${ctx.tenantId} AND type = 'POS'`;
}
const posOf = (settings: unknown): Record<string, unknown> => (isRecord(settings) && isRecord(settings.pos) ? settings.pos : {});
const recOf = (v: unknown): Record<string, unknown> => (isRecord(v) ? v : {});

// ═══════════ ตัวอ่านรวม (R2 · ทุกค่าจากตัวอ่านเดิมของคีย์นั้น — ไม่มีตัวแกะที่สอง) ═══════════
export function posGeneralSettingsOf(settings: unknown): PosGeneralSettings {
  return {
    heldCartExpireDays: posHeldCartExpireDays(settings),
    autoLockMinutes: posRegisterAutoLockMinutes(settings),
    shift: parseShiftSettings(settings),
    weighedBarcode: weighedBarcodeSettings(settings),
    receiptLocale: posReceiptLocale(settings),
    dayCutoffMinutes: posDayCutoffMinutes(settings),
  };
}

// ═══════════ R3 ตัวเขียนทั่วไป ═══════════
const GENERAL_KEYS = new Set(["heldCartExpireDays", "autoLockMinutes", "shift", "weighedBarcode", "receiptLocale", "dayCutoffMinutes"]);
const SHIFT_KEYS = new Set(["requiredRegister", "requiredOtherSources", "blindClose", "overShortReasonSatang", "forceCloseAfterHours"]);
const WB_KINDS = new Set(["WEIGHT", "PRICE"]);
type CleanGeneral = {
  heldCartExpireDays?: number;
  autoLockMinutes?: number;
  shift?: Partial<{ requiredRegister: boolean; requiredOtherSources: boolean; blindClose: boolean; overShortReasonSatang: number; forceCloseAfterHours: number }>;
  weighedBarcode?: { enabled: boolean; rules: { prefix: string; kind: string }[] };
  receiptLocale?: "th" | "en";
  dayCutoffMinutes?: number;
};

/** ตรวจแพตช์ทั้งก้อน (บริสุทธิ์) — ผิดที่ใด = VALIDATION + field แบบจุด (คีย์แปลกบนสุด = ชื่อคีย์นั้น) */
function cleanGeneralPatch(patch: unknown): { ok: true; clean: CleanGeneral } | PosSettingsRefusal {
  const L = POS_GENERAL_LIMITS;
  if (!isRecord(patch)) return settingsRefuse("VALIDATION", "แพตช์ต้องเป็นออบเจกต์");
  const out: CleanGeneral = {};
  for (const k of Object.keys(patch)) if (!GENERAL_KEYS.has(k)) return settingsRefuse("VALIDATION", `ตั้งค่า ${k} ที่หน้านี้ไม่ได้`, k);
  if ("heldCartExpireDays" in patch) {
    if (!isInt(patch.heldCartExpireDays, L.heldCartExpireDays.min, L.heldCartExpireDays.max)) return settingsRefuse("VALIDATION", "อายุบิลพักต้องเป็นจำนวนเต็ม 1–365 วัน", "heldCartExpireDays");
    out.heldCartExpireDays = patch.heldCartExpireDays;
  }
  if ("autoLockMinutes" in patch) {
    if (!isInt(patch.autoLockMinutes, L.autoLockMinutes.min, L.autoLockMinutes.max)) return settingsRefuse("VALIDATION", "ล็อกจออัตโนมัติต้องเป็นจำนวนเต็ม 0–60 นาที", "autoLockMinutes");
    out.autoLockMinutes = patch.autoLockMinutes;
  }
  if ("shift" in patch) {
    const sh = patch.shift;
    if (!isRecord(sh)) return settingsRefuse("VALIDATION", "ค่าตั้งกะไม่ถูกต้อง", "shift");
    const c: NonNullable<CleanGeneral["shift"]> = {};
    for (const k of Object.keys(sh)) if (!SHIFT_KEYS.has(k)) return settingsRefuse("VALIDATION", `ไม่รู้จักค่าตั้งกะ ${k}`, `shift.${k}`);
    for (const k of ["requiredRegister", "requiredOtherSources", "blindClose"] as const) {
      if (!(k in sh)) continue;
      if (typeof sh[k] !== "boolean") return settingsRefuse("VALIDATION", "ต้องเป็นเปิด/ปิด", `shift.${k}`);
      c[k] = sh[k] as boolean;
    }
    if ("overShortReasonSatang" in sh) {
      if (!isInt(sh.overShortReasonSatang, L.overShortReasonSatang.min, L.overShortReasonSatang.max)) return settingsRefuse("VALIDATION", "ผลต่างที่ต้องใส่เหตุผลต้องเป็นสตางค์จำนวนเต็ม ฿0–฿100,000", "shift.overShortReasonSatang");
      c.overShortReasonSatang = sh.overShortReasonSatang;
    }
    if ("forceCloseAfterHours" in sh) {
      if (!isInt(sh.forceCloseAfterHours, L.forceCloseAfterHours.min, L.forceCloseAfterHours.max)) return settingsRefuse("VALIDATION", "ปิดกะค้างอัตโนมัติต้องเป็นจำนวนเต็ม 1–72 ชั่วโมง", "shift.forceCloseAfterHours");
      c.forceCloseAfterHours = sh.forceCloseAfterHours;
    }
    out.shift = c;
  }
  if ("weighedBarcode" in patch) {
    const wb = patch.weighedBarcode;
    if (!isRecord(wb)) return settingsRefuse("VALIDATION", "ค่าตั้งบาร์โค้ดสินค้าชั่งไม่ถูกต้อง", "weighedBarcode");
    for (const k of Object.keys(wb)) if (k !== "enabled" && k !== "rules") return settingsRefuse("VALIDATION", `ไม่รู้จักค่าตั้ง ${k}`, `weighedBarcode.${k}`);
    if (typeof wb.enabled !== "boolean") return settingsRefuse("VALIDATION", "ต้องเป็นเปิด/ปิด", "weighedBarcode.enabled");
    if (!Array.isArray(wb.rules) || wb.rules.length > 10) return settingsRefuse("VALIDATION", "กฎบาร์โค้ดไม่ถูกต้อง", "weighedBarcode.rules");
    const rules: { prefix: string; kind: string }[] = [];
    for (const r of wb.rules as unknown[]) {
      if (!isRecord(r) || Object.keys(r).some((k) => k !== "prefix" && k !== "kind")) return settingsRefuse("VALIDATION", "กฎบาร์โค้ดไม่ถูกต้อง", "weighedBarcode.rules");
      if (typeof r.prefix !== "string" || !/^2\d$/.test(r.prefix)) return settingsRefuse("VALIDATION", "คำนำหน้าต้องเป็น 20–29", "weighedBarcode.rules");
      if (typeof r.kind !== "string" || !WB_KINDS.has(r.kind)) return settingsRefuse("VALIDATION", "ชนิดต้องเป็นน้ำหนักหรือราคา", "weighedBarcode.rules");
      if (rules.some((x) => x.prefix === r.prefix)) return settingsRefuse("VALIDATION", "คำนำหน้าซ้ำกัน", "weighedBarcode.rules");
      rules.push({ prefix: r.prefix, kind: r.kind });
    }
    out.weighedBarcode = { enabled: wb.enabled, rules };
  }
  if ("receiptLocale" in patch) {
    if (patch.receiptLocale !== "th" && patch.receiptLocale !== "en") return settingsRefuse("VALIDATION", "ภาษาใบเสร็จต้องเป็นไทยหรืออังกฤษ", "receiptLocale");
    out.receiptLocale = patch.receiptLocale;
  }
  if ("dayCutoffMinutes" in patch) {
    if (!isInt(patch.dayCutoffMinutes, L.dayCutoffMinutes.min, L.dayCutoffMinutes.max)) return settingsRefuse("VALIDATION", "เวลาตัดวันต้องเป็นจำนวนเต็ม 0–360 นาทีหลังเที่ยงคืน", "dayCutoffMinutes");
    out.dayCutoffMinutes = patch.dayCutoffMinutes;
  }
  return { ok: true, clean: out };
}

/** sub-tree ใหม่ของคีย์ที่แพตช์แตะ (รวมทับค่าดิบเดิม — คีย์ที่ไม่รู้จักใต้ sub-tree คงไว้) */
function nextGeneralKeys(pos: Record<string, unknown>, c: CleanGeneral): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (c.heldCartExpireDays !== undefined) out.heldCart = { ...recOf(pos.heldCart), expireDays: c.heldCartExpireDays };
  if (c.autoLockMinutes !== undefined) out.register = { ...recOf(pos.register), autoLockMinutes: c.autoLockMinutes };
  if (c.shift !== undefined) {
    const raw = recOf(pos.shift);
    const sh: Record<string, unknown> = { ...raw };
    if (c.shift.requiredRegister !== undefined || c.shift.requiredOtherSources !== undefined) {
      const req: Record<string, unknown> = { ...recOf(raw.required) };
      if (c.shift.requiredRegister !== undefined) req.register = c.shift.requiredRegister;
      if (c.shift.requiredOtherSources !== undefined) req.otherSources = c.shift.requiredOtherSources;
      sh.required = req;
    }
    if (c.shift.blindClose !== undefined) sh.blindClose = c.shift.blindClose;
    if (c.shift.overShortReasonSatang !== undefined) sh.overShortReasonSatang = c.shift.overShortReasonSatang;
    if (c.shift.forceCloseAfterHours !== undefined) sh.forceCloseAfterHours = c.shift.forceCloseAfterHours;
    out.shift = sh;
  }
  if (c.weighedBarcode !== undefined) out.weighedBarcode = { ...recOf(pos.weighedBarcode), enabled: c.weighedBarcode.enabled, rules: c.weighedBarcode.rules };
  if (c.receiptLocale !== undefined) out.receiptLocale = c.receiptLocale;
  if (c.dayCutoffMinutes !== undefined) out.reports = { ...recOf(pos.reports), dayCutoffMinutes: c.dayCutoffMinutes };
  return out;
}

/** ค่าที่แพตช์แตะ (ตามตัวอ่าน) — ใช้เป็น before/after ของ audit (ไม่มีค่าลับในส่วนนี้) */
function generalAuditView(g: PosGeneralSettings, c: CleanGeneral): Record<string, unknown> {
  const v: Record<string, unknown> = { section: "general" };
  for (const k of Object.keys(c) as (keyof CleanGeneral)[]) v[k] = g[k];
  return v;
}

/** R3 — แก้ค่าตั้งทั่วไปของระบบ POS (สิทธิ์ pos.settings.manage ครบทุกสาขา) → ค่าทั่วไปหลังแก้ (จากตัวอ่านของแต่ละคีย์) */
export async function updatePosGeneralSettings(ctx: Ctx, actor: PosSettingsWriterActor, patch: unknown): Promise<PosGeneralSettingsResult> {
  try {
    if (!ctxOk(ctx)) return settingsRefuse("NOT_FOUND");
    const m = settingsMembership(actor);
    if (!m || !(await canOnAllLinkedUnits(prisma, ctx, m, PERM_SETTINGS_MANAGE))) return settingsRefuse("PERMISSION_DENIED");
    const parsed = cleanGeneralPatch(patch);
    if (!parsed.ok) return parsed;
    const c = parsed.clean;
    const done = await prisma.$transaction(async (tx) => {
      if (!(await lockPos(tx, ctx))) return settingsRefuse("NOT_FOUND");
      const sys = await posSystem(tx, ctx);
      if (!sys) return settingsRefuse("NOT_FOUND");
      const pos = posOf(sys.settings);
      const keys = nextGeneralKeys(pos, c);
      const before = posGeneralSettingsOf(sys.settings);
      const changed = Object.keys(keys).some((k) => canon(pos[k]) !== canon(keys[k]));
      if (!changed) return { ok: true as const, general: before, audit: null };
      await mergePosKeys(tx, ctx, keys);
      const afterSettings = { ...(isRecord(sys.settings) ? sys.settings : {}), pos: { ...pos, ...keys } };
      const after = posGeneralSettingsOf(afterSettings);
      return { ok: true as const, general: after, audit: { before: generalAuditView(before, c), after: generalAuditView(after, c) } };
    });
    if (!done.ok) return done;
    if (done.audit) await writeAudit({ tenantId: ctx.tenantId, actorId: m.userId, action: POS_SETTINGS_AUDIT, targetType: "AppSystem", targetId: ctx.systemId, before: done.audit.before, after: done.audit.after });
    return { ok: true, general: done.general };
  } catch (e) {
    console.error("[pos/settings-general] general", e);
    return settingsRefuse("UNKNOWN");
  }
}

// ═══════════ R4 เพดานส่วนลดตามบทบาท ═══════════
/** R4 — แก้เพดานส่วนลด STAFF/MANAGER (bp 0–10000) · OWNER แก้ไม่ได้ · MANAGER แก้ได้เฉพาะเจ้าของ · คนอื่นตั้ง STAFF ได้ไม่เกินเพดานบทบาทตัวเอง */
export async function updatePosDiscountCaps(ctx: Ctx, actor: PosSettingsWriterActor, patch: unknown): Promise<PosDiscountCapsResult> {
  try {
    if (!ctxOk(ctx)) return settingsRefuse("NOT_FOUND");
    const m = settingsMembership(actor);
    if (!m || !(await canOnAllLinkedUnits(prisma, ctx, m, PERM_SETTINGS_MANAGE))) return settingsRefuse("PERMISSION_DENIED");
    if (!isRecord(patch)) return settingsRefuse("VALIDATION", "แพตช์ต้องเป็นออบเจกต์");
    const want: { STAFF?: number; MANAGER?: number } = {};
    for (const [k, v] of Object.entries(patch)) {
      if (k === "OWNER") return settingsRefuse("VALIDATION", "เพดานของเจ้าของร้านแก้ไม่ได้ (ไม่จำกัดเสมอ)", "OWNER");
      if (k !== "STAFF" && k !== "MANAGER") return settingsRefuse("VALIDATION", `ไม่รู้จักบทบาท ${k}`, k);
      if (!isInt(v, 0, 10_000)) return settingsRefuse("VALIDATION", "เพดานต้องเป็นจำนวนเต็ม 0–10000 (0–100%)", k);
      want[k] = v;
    }
    if (want.MANAGER !== undefined && m.role !== "OWNER") return settingsRefuse("PERMISSION_DENIED", "เฉพาะเจ้าของร้านเท่านั้นที่แก้เพดานของผู้จัดการได้");
    const done = await prisma.$transaction(async (tx) => {
      if (!(await lockPos(tx, ctx))) return settingsRefuse("NOT_FOUND");
      const sys = await posSystem(tx, ctx);
      if (!sys) return settingsRefuse("NOT_FOUND");
      const cur = posDiscountCaps(sys.settings);
      if (want.STAFF !== undefined && m.role !== "OWNER" && want.STAFF > cur[m.role]) return settingsRefuse("PERMISSION_DENIED", "ตั้งเพดานพนักงานเกินเพดานของตัวเองไม่ได้");
      const pos = posOf(sys.settings);
      const disc = recOf(pos.discount);
      const by: Record<string, unknown> = { ...recOf(disc.maxBpByRole) };
      if (want.STAFF !== undefined) by.STAFF = want.STAFF;
      if (want.MANAGER !== undefined) by.MANAGER = want.MANAGER;
      const nextDiscount = { ...disc, maxBpByRole: by };
      if (canon(pos.discount) === canon(nextDiscount)) return { ok: true as const, caps: cur, audit: null };
      await mergePosKeys(tx, ctx, { discount: nextDiscount });
      const caps = posDiscountCaps({ pos: { ...pos, discount: nextDiscount } });
      const view = (c: PosDiscountCaps) => ({ section: "caps", ...(want.STAFF !== undefined ? { STAFF: c.STAFF } : {}), ...(want.MANAGER !== undefined ? { MANAGER: c.MANAGER } : {}) });
      return { ok: true as const, caps, audit: { before: view(cur), after: view(caps) } };
    });
    if (!done.ok) return done;
    if (done.audit) await writeAudit({ tenantId: ctx.tenantId, actorId: m.userId, action: POS_SETTINGS_AUDIT, targetType: "AppSystem", targetId: ctx.systemId, before: done.audit.before, after: done.audit.after });
    return { ok: true, caps: done.caps };
  } catch (e) {
    console.error("[pos/settings-general] caps", e);
    return settingsRefuse("UNKNOWN");
  }
}

// ═══════════ R5 นโยบายขายเกินสต็อกของสาขา (BusinessUnit.settings.pos.stock) ═══════════
const OVERSELL = new Set(["ALLOW_NEGATIVE", "BLOCK"]);
/** สาขานี้ผูก POS นี้ (และเป็นของร้านนี้) ไหม */
export async function unitLinkedToPos(db: Db, ctx: Ctx, unitId: string): Promise<boolean> {
  if (!isId(unitId)) return false;
  const link = await db.appSystemUnit.findUnique({ where: { tenantId_unitId_type: { tenantId: ctx.tenantId, unitId, type: "POS" } }, select: { systemId: true } });
  if (!link || link.systemId !== ctx.systemId) return false;
  const u = await db.businessUnit.findFirst({ where: { id: unitId, tenantId: ctx.tenantId, status: { not: "ARCHIVED" } }, select: { id: true } });
  return !!u;
}
const policyOf = (settings: unknown): PosOversellPolicy => (recOf(recOf(posOf(settings).stock)).oversellPolicy === "BLOCK" ? "BLOCK" : "ALLOW_NEGATIVE");

/** R5 — ตั้งนโยบายขายเกินสต็อกของสาขา (pos.settings.manage ที่สาขานั้น) · ตัวอ่าน = unitOversellPolicy (service.ts) */
export async function updatePosUnitStockPolicy(ctx: Ctx, actor: PosSettingsWriterActor, input: unknown): Promise<PosUnitStockPolicyResult> {
  try {
    if (!ctxOk(ctx)) return settingsRefuse("NOT_FOUND");
    const m = settingsMembership(actor);
    if (!m || !evaluate(m, { module: "pos", action: PERM_SETTINGS_MANAGE })) return settingsRefuse("PERMISSION_DENIED");
    if (!isRecord(input) || !isId(input.unitId)) return settingsRefuse("VALIDATION", "ต้องระบุสาขา", "unitId");
    if (typeof input.oversellPolicy !== "string" || !OVERSELL.has(input.oversellPolicy)) return settingsRefuse("VALIDATION", "นโยบายต้องเป็นอนุญาตติดลบหรือห้ามขาย", "oversellPolicy");
    const unitId = input.unitId;
    const policy = input.oversellPolicy as PosOversellPolicy;
    if (!(await posSystem(prisma, ctx)) || !(await unitLinkedToPos(prisma, ctx, unitId))) return settingsRefuse("NOT_FOUND", "ไม่พบสาขานี้ในจุดขายนี้");
    if (!evaluate(m, { module: "pos", action: PERM_SETTINGS_MANAGE, unitId })) return settingsRefuse("PERMISSION_DENIED");
    const done = await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "BusinessUnit" WHERE id = ${unitId} AND "tenantId" = ${ctx.tenantId} FOR UPDATE`;
      if (!locked.length) return settingsRefuse("NOT_FOUND");
      const u = await tx.businessUnit.findFirst({ where: { id: unitId, tenantId: ctx.tenantId }, select: { settings: true } });
      const pos = posOf(u?.settings);
      const before = policyOf(u?.settings);
      const stock = recOf(pos.stock);
      if (stock.oversellPolicy === policy) return { ok: true as const, before, changed: false };
      const json = JSON.stringify({ stock: { ...stock, oversellPolicy: policy } });
      await tx.$executeRaw`
        UPDATE "BusinessUnit"
        SET "settings" = jsonb_set(
          CASE WHEN jsonb_typeof("settings") = 'object' THEN "settings" ELSE '{}'::jsonb END,
          '{pos}',
          (CASE WHEN jsonb_typeof("settings"->'pos') = 'object' THEN "settings"->'pos' ELSE '{}'::jsonb END) || ${json}::jsonb,
          true),
          "updatedAt" = now()
        WHERE "id" = ${unitId} AND "tenantId" = ${ctx.tenantId}`;
      return { ok: true as const, before, changed: true };
    });
    if (!done.ok) return done;
    if (done.changed)
      await writeAudit({
        tenantId: ctx.tenantId,
        actorId: m.userId,
        action: POS_SETTINGS_AUDIT,
        targetType: "BusinessUnit",
        targetId: unitId,
        before: { section: "unitStock", systemId: ctx.systemId, oversellPolicy: done.before },
        after: { section: "unitStock", systemId: ctx.systemId, oversellPolicy: policy },
      });
    return { ok: true, unitStock: { unitId, oversellPolicy: policy } };
  } catch (e) {
    console.error("[pos/settings-general] unitStock", e);
    return settingsRefuse("UNKNOWN");
  }
}

// ═══════════ R9 ประวัติการเปลี่ยนค่าตั้ง (AuditLog ของ POS นี้ · ใหม่สุดก่อน · หน้าละ 20) ═══════════
const HISTORY_PAGE = 20;
const DEVICE_ACTIONS = ["pos.device.register", "pos.device.update", "pos.device.revoke"];
const PIN_ACTIONS = ["pos.staff.pin_set", "pos.staff.pin_unlocked"];
/** คีย์ของ summary ที่ส่งได้ (ค่าพื้นฐานเท่านั้น · ไม่มีค่าลับ) — คีย์อื่นถูกตัดทิ้ง */
const SUMMARY_DROP = new Set(["section", "pinHash", "promptpayId", "deviceCode", "ledgerAccountId"]);

function encodeCursor(at: Date, id: string): string {
  return Buffer.from(`${at.toISOString()}|${id}`, "utf8").toString("base64url");
}
function decodeCursor(v: unknown): { at: Date; id: string } | null {
  if (typeof v !== "string" || v.length > 200) return null;
  try {
    const [iso, id] = Buffer.from(v, "base64url").toString("utf8").split("|");
    const at = new Date(iso ?? "");
    return Number.isFinite(at.getTime()) && isId(id) ? { at, id: id! } : null;
  } catch {
    return null;
  }
}
/** after/before → พารามิเตอร์ประโยคแบบแบน (ค่าพื้นฐาน · ซ้อนได้ 2 ชั้น "shift.blindClose") */
function summaryOf(after: unknown, maskPhone: (phone: string) => string): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  const put = (k: string, v: unknown) => {
    if (Object.keys(out).length >= 24) return;
    if (v === null || typeof v === "boolean" || typeof v === "number") out[k] = v as never;
    else if (typeof v === "string") out[k] = v.slice(0, 120);
  };
  // POS P1.18 ▸ F5: แถวเก่าก่อนแก้อาจเก็บ header.phone ดิบ — ปิดบังตอนอ่านด้วย (ไม่คืนเบอร์ดิบไม่ว่าแถวไหน) ◂
  for (const [k, v] of Object.entries(recOf(maskAuditPhones(after, maskPhone)))) {
    if (SUMMARY_DROP.has(k)) continue;
    if (isRecord(v)) {
      for (const [k2, v2] of Object.entries(v)) if (!SUMMARY_DROP.has(k2)) put(`${k}.${k2}`, isRecord(v2) || Array.isArray(v2) ? null : v2);
    } else if (Array.isArray(v)) put(`${k}.count`, v.length);
    else put(k, v);
  }
  return out;
}
function sectionOf(action: string, before: unknown, after: unknown): string | null {
  const s = recOf(after).section ?? recOf(before).section;
  if (typeof s === "string") return s;
  if (action.startsWith("pos.integration.")) return "integration";
  if (action.startsWith("pos.device.")) return "devices";
  if (action.startsWith("pos.staff.")) return "staff";
  return null;
}

/** R9 — ประวัติการเปลี่ยนของ POS นี้ (pos.settings.manage) · cursor = ตำแหน่งแถวสุดท้ายของหน้าก่อน (เวลา+id · เสถียร) */
export async function posSettingsHistory(ctx: Ctx, actor: PosSettingsWriterActor, input: unknown = {}): Promise<PosSettingsHistoryResult> {
  try {
    if (!ctxOk(ctx)) return settingsRefuse("NOT_FOUND");
    const m = settingsMembership(actor);
    if (!m || !evaluate(m, { module: "pos", action: PERM_SETTINGS_MANAGE })) return settingsRefuse("PERMISSION_DENIED");
    if (!(await posSystem(prisma, ctx))) return settingsRefuse("NOT_FOUND");
    const units = await posLinkedUnitIds(prisma, ctx);
    if (!(m.role === "OWNER" || m.unitAccess.includes("*") || units.some((u) => evaluate(m, { module: "pos", action: PERM_SETTINGS_MANAGE, unitId: u })))) return settingsRefuse("PERMISSION_DENIED");
    const rawCursor = isRecord(input) ? input.cursor : undefined;
    const cur = rawCursor === undefined || rawCursor === null ? null : decodeCursor(rawCursor);
    if (rawCursor !== undefined && rawCursor !== null && !cur) return settingsRefuse("VALIDATION", "cursor ไม่ถูกต้อง", "cursor");
    // สาขาที่เคยผูก (ยังผูกอยู่) + เครื่อง + แถว PIN ของ POS นี้
    const allUnits = (await prisma.appSystemUnit.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, type: "POS" }, select: { unitId: true } })).map((l) => l.unitId);
    const [devices, pins] = await Promise.all([
      prisma.posDevice.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId }, select: { id: true } }),
      allUnits.length ? prisma.posStaffPin.findMany({ where: { tenantId: ctx.tenantId, unitId: { in: allUnits } }, select: { id: true } }) : Promise.resolve([] as { id: string }[]),
    ]);
    const or: Prisma.AuditLogWhereInput[] = [
      { action: POS_SETTINGS_AUDIT, targetId: { in: [ctx.systemId, ...allUnits] } },
      { action: { startsWith: "pos.integration." }, targetId: ctx.systemId },
    ];
    if (devices.length) or.push({ action: { in: DEVICE_ACTIONS }, targetId: { in: devices.map((d) => d.id) } });
    if (pins.length) or.push({ action: { in: PIN_ACTIONS }, targetId: { in: pins.map((p) => p.id) } });
    const where: Prisma.AuditLogWhereInput = {
      tenantId: ctx.tenantId,
      OR: or,
      ...(cur ? { AND: [{ OR: [{ createdAt: { lt: cur.at } }, { createdAt: cur.at, id: { lt: cur.id } }] }] } : {}),
    };
    const rows = await prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: HISTORY_PAGE + 1,
      select: { id: true, createdAt: true, actorId: true, action: true, before: true, after: true },
    });
    const page = rows.slice(0, HISTORY_PAGE);
    const { maskPhone } = await import("@/lib/modules/member"); // POS P1.18 ▸ F5 ◂
    const actorIds = [...new Set(page.map((r) => r.actorId).filter((x): x is string => !!x))];
    const users = actorIds.length ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true, email: true } }) : [];
    const nameOf = new Map(users.map((u) => [u.id, u.name ?? u.email]));
    const items: PosSettingsHistoryItem[] = page.map((r) => ({
      id: r.id,
      at: r.createdAt.toISOString(),
      actorName: (r.actorId && nameOf.get(r.actorId)) || null,
      action: r.action,
      section: sectionOf(r.action, r.before, r.after),
      summary: summaryOf(r.after, maskPhone),
    }));
    const last = page[page.length - 1];
    return { ok: true, items, nextCursor: rows.length > HISTORY_PAGE && last ? encodeCursor(last.createdAt, last.id) : null };
  } catch (e) {
    console.error("[pos/settings-general] history", e);
    return settingsRefuse("UNKNOWN");
  }
}
