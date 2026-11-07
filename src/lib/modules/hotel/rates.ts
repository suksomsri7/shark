// SVC H.1 ▸ ราคาโรงแรม ฝั่งเซิร์ฟเวอร์ — แผนราคา · กฎยกเลิก · ฤดู · วันหยุด · ตารางราคา · แก้มือรายวัน · บริบทคิดราคา · ปฏิทินราคา
//   ใบสั่ง ledger/svc-briefs/svc-brief-h.1.md §2 มติ 7–10 · §4 · ตาราง H.0 §2.4–2.9
//   • ทุกฟังก์ชันเขียน/อ่านรับ (actor, ctx {tenantId}, input {unitId,…}) · ด่าน: หน่วย HOTEL ของร้าน → เข้าหน่วยได้ → สิทธิ์ hotel.rates.read/write
//     ข้ามร้าน/ข้ามหน่วย/ไม่ใช่โรงแรม ⇒ NOT_FOUND · ไม่มีสิทธิ์ ⇒ FORBIDDEN · ล้มเหลวทุกแบบ = { ok:false, code, reason(ไทย) } ไม่ throw
//   • loadPricingContext / ratePreview รับ (ctx, unitId, …) ไม่รับ actor — หน้าเรียกหลังตรวจสิทธิ์เอง
//   • unique ที่มีคอลัมน์ nullable (HotelRate.seasonId · HotelRateOverride.ratePlanId · NULLS NOT DISTINCT) ⇒ ไม่ใช้ upsert ของ Prisma:
//     อ่านแถวเดิมใน tx (หลังล็อก advisory) แล้ว create/update เอง · ทุกการเขียนอยู่ใน tx เดียวกับ AuditLog
//   • ค่าตั้งที่ใช้: rooms.hotel.weekendDays · rooms.money.rounding · rooms.hotel.baseRate · rooms.hotel.dayOfWeekAdjustBp (chain ROOM_TYPE→RATE_PLAN)
//     rooms.hotel.defaultRatePlan · rooms.hotel.deposit (ค่าเริ่มของแผนที่สร้างอัตโนมัติ) — ไม่มีค่าฝังในโค้ด
//   • ไม่มีข้อมูลผู้เข้าพักในโมเดลราคา (X10) · เหลือขาย = ห้องขายรายคืนได้ − ห้องที่ถูกถือ (occupancy ผ่าน facade rooms) − คืนที่นับ (HotelBookingNight.counted)
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { tenantDb, type TenantDb } from "@/lib/core/db";
import { canAccessUnit, evaluate, type MembershipCtx } from "@/lib/core/rbac";
import { bkkYmd } from "@/lib/core/quiet-hours";
import { resolveSettings, resolveSettingsMany } from "@/lib/core/settings";
import { hotelAvailability } from "./availability"; // SVC H.3 ▸ เหลือขาย = สูตรเดียว ◂
import {
  addDaysYmd,
  dayNumber,
  isYmd,
  nightDates,
  resolveNightPrice,
  type DepositPolicy,
  type FallbackRate,
  type OverrideRow,
  type PriceSource,
  type PricingContext,
  type RateRow,
  type RatePlanRow,
  type RoomTypeInfo,
  type RoundingMode,
  type SeasonRow,
} from "./pricing";

export type HotelActor = MembershipCtx & { userId: string };
export type HotelCtx = { tenantId: string };
export type RatesFailCode = "NOT_FOUND" | "FORBIDDEN" | "VALIDATION" | "DUPLICATE_CODE" | "DEFAULT_PLAN" | "INVALID_PRICE" | "ARCHIVED" | "PLAN_ARCHIVED" | "CONFLICT" | "RANGE";
export type RatesFail = { ok: false; code: RatesFailCode; reason: string };

export type RatePlanDto = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  includeBreakfast: boolean;
  minNights: number | null;
  maxNights: number | null;
  depositKind: string;
  depositValue: number;
  visibility: string[];
  status: string;
  sortOrder: number;
  cancelRules: { daysBefore: number; refundBp: number }[];
};
export type SeasonDto = { id: string; name: string; dateStart: string; dateEnd: string; priority: number; minNights: number | null; status: string };
export type HolidayDto = { date: string; name: string };
export type MatrixRow = {
  roomTypeId: string;
  seasonId: string | null;
  priceWeekdaySatang: number | null;
  priceWeekendSatang: number | null;
  priceHolidaySatang: number | null;
};
export type PreviewCell = { priceSatang: number | null; source: PriceSource | null; remaining: number; total: number };
export type PreviewDay = { date: string; byType: Record<string, PreviewCell> };
export type PreviewRoomType = { id: string; name: string; sellable: number };

// ───────────────────────── ค่าคงที่ของกลไก (ไม่ใช่นโยบายร้าน) ─────────────────────────
const TX = { maxWait: 5_000, timeout: 15_000 } as const;
// SVC H.10 ▸ hook ARI (ใบสั่ง h.10 §0 · §9.10 · ยกเว้นไฟล์ H.1 — บรรทัด hook ล้วน): ราคาเปลี่ยน ⇒ channel.ari.dirty ใน tx เดียวกับการเขียน (atomic · lazy import facade ช่องทาง · ไม่ throw · ร้านไม่มีตัวต่อ = ไม่ยิง) ◂
const emitAriDirty = (tx: object, w: { tenantId: string; unitId: string }, roomTypeIds: string[], from: string | null = null, to: string | null = null): Promise<void> => import("./channel").then((m) => m.emitAriDirty({ tenantId: w.tenantId }, { unitId: w.unitId, roomTypeIds, from, to }, tx)).catch(() => undefined);
const MONEY_MAX = 1_000_000_000; // เพดานเดียวกับ MONEY ของทะเบียนค่าตั้ง (≤ ฿10,000,000)
const PREVIEW_MAX_DAYS = 62;
const CONTEXT_MAX_DAYS = 400;
const OVERRIDE_MAX_DAYS = 62;
const KEY = {
  weekendDays: "rooms.hotel.weekendDays",
  rounding: "rooms.money.rounding",
  baseRate: "rooms.hotel.baseRate",
  dowAdjust: "rooms.hotel.dayOfWeekAdjustBp",
  defaultPlan: "rooms.hotel.defaultRatePlan",
  deposit: "rooms.hotel.deposit",
  minNights: "rooms.hotel.minNights",
  closedToArrival: "rooms.hotel.closedToArrival",
  maxAdvance: "rooms.hotel.maxAdvanceBookingDays",
  taxMode: "rooms.hotel.tax.mode",
  vatBp: "rooms.hotel.tax.vatBp",
  scBp: "rooms.hotel.tax.serviceChargeBp",
} as const;
const DEFAULT_PLAN_NAME: Record<string, string> = { STANDARD: "ราคามาตรฐาน" };

const R = {
  notFound: "ไม่พบโรงแรมหรือรายการนี้ (หรืออยู่นอกสาขาที่คุณดูแล)",
  forbidden: "คุณยังไม่มีสิทธิ์ทำรายการนี้ — ขอสิทธิ์จากเจ้าของร้าน",
  conflict: "มีคนแก้รายการนี้พร้อมกัน — ลองใหม่อีกครั้ง",
};
const fail = (code: RatesFailCode, reason: string): RatesFail => ({ ok: false, code, reason });
const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const ymdOfDb = (d: Date): string => d.toISOString().slice(0, 10);
const dbDate = (ymd: string): Date => new Date(`${ymd}T00:00:00.000Z`);
const jsonOf = (v: unknown): Prisma.InputJsonValue | undefined => (v === null || v === undefined ? undefined : (JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue));
const todayTh = (): string => bkkYmd(new Date());
const zodReason = (e: z.ZodError): string => e.issues[0]?.message || "ข้อมูลไม่ครบหรือไม่ถูกต้อง";
/** tx ของ tenantDb(...).$transaction (client ขยาย) — helper รับแค่ส่วนที่ใช้ */
type LockTx = { $executeRaw: TenantDb["$executeRaw"] };
type AuditTx = { auditLog: TenantDb["auditLog"] };
const lockKey = (tx: LockTx, key: string) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
const isUniqueErr = (e: unknown): boolean => isRec(e) && (e.code === "P2002" || /23505|unique/i.test(String(e.message ?? "")));

function actorOf(a: unknown): HotelActor | null {
  if (!isRec(a) || !isStr(a.role) || !isStr(a.userId)) return null;
  return {
    role: a.role as MembershipCtx["role"],
    unitAccess: Array.isArray(a.unitAccess) ? a.unitAccess.filter(isStr) : [],
    permissions: isRec(a.permissions) ? a.permissions : {},
    userId: a.userId,
  };
}

type Unit = { id: string; name: string; slug: string };
/** หน่วยโรงแรมของร้าน (type HOTEL) — อื่น ⇒ null */
async function hotelUnit(tenantId: unknown, unitId: unknown): Promise<Unit | null> {
  if (!isStr(tenantId) || !isStr(unitId)) return null;
  return tenantDb({ tenantId }).businessUnit.findFirst({ where: { id: unitId, type: "HOTEL" }, select: { id: true, name: true, slug: true } });
}

type Gate = { ok: true; actor: HotelActor; tenantId: string; unit: Unit };
/** ด่าน: โรงแรมของร้าน → เข้าหน่วยได้ (ไม่ได้ ⇒ NOT_FOUND) → สิทธิ์ (read ⇔ rates.read หรือ rates.write · write ⇔ rates.write) */
async function gate(actorIn: unknown, ctx: unknown, input: unknown, need: "read" | "write"): Promise<Gate | RatesFail> {
  const actor = actorOf(actorIn);
  const tenantId = isRec(ctx) ? ctx.tenantId : null;
  const unitId = isRec(input) ? input.unitId : null;
  if (!actor || !isStr(tenantId)) return fail("NOT_FOUND", R.notFound);
  const unit = await hotelUnit(tenantId, unitId);
  if (!unit || !canAccessUnit(actor, unit.id)) return fail("NOT_FOUND", R.notFound);
  const can = (action: string) => evaluate(actor, { module: "hotel", action, unitId: unit.id });
  const allowed = need === "write" ? can("hotel.rates.write") : can("hotel.rates.read") || can("hotel.rates.write");
  if (!allowed) return fail("FORBIDDEN", R.forbidden);
  return { ok: true, actor, tenantId, unit };
}

type AuditIn = { tenantId: string; unitId: string; actorId: string; action: string; targetType: string; targetId: string; before: unknown; after: unknown };
async function audit(tx: AuditTx, a: AuditIn): Promise<void> {
  await tx.auditLog.create({
    data: {
      tenantId: a.tenantId,
      unitId: a.unitId,
      actorType: "USER",
      actorId: a.actorId,
      action: a.action,
      targetType: a.targetType,
      targetId: a.targetId,
      before: jsonOf(a.before),
      after: jsonOf(a.after),
    },
  });
}

// ───────────────────────── รูปข้อมูล ─────────────────────────
const VISIBILITY = ["WEB", "LINE", "COUNTER", "OTA"] as const;
const DEPOSIT_KINDS = ["NONE", "FIRST_NIGHT", "FULL", "PERCENT", "FIXED_AMOUNT"] as const;

type PlanRowDb = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  includeBreakfast: boolean;
  minNights: number | null;
  maxNights: number | null;
  depositKind: string;
  depositValue: number;
  visibility: Prisma.JsonValue;
  status: string;
  sortOrder: number;
};
const visibilityOf = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const planDto = (p: PlanRowDb, rules: { daysBefore: number; refundBp: number }[] = []): RatePlanDto => ({
  id: p.id,
  code: p.code,
  name: p.name,
  description: p.description,
  isDefault: p.isDefault,
  includeBreakfast: p.includeBreakfast,
  minNights: p.minNights,
  maxNights: p.maxNights,
  depositKind: p.depositKind,
  depositValue: p.depositValue,
  visibility: visibilityOf(p.visibility),
  status: p.status,
  sortOrder: p.sortOrder,
  cancelRules: rules.map((r) => ({ daysBefore: r.daysBefore, refundBp: r.refundBp })),
});
const seasonDto = (s: { id: string; name: string; dateStart: Date; dateEnd: Date; priority: number; minNights: number | null; status: string }): SeasonDto => ({
  id: s.id,
  name: s.name,
  dateStart: ymdOfDb(s.dateStart),
  dateEnd: ymdOfDb(s.dateEnd),
  priority: s.priority,
  minNights: s.minNights,
  status: s.status,
});

// ───────────────────────── แผนราคา ─────────────────────────
/** มติ 8: หน่วยโรงแรมต้องมีแผนเริ่มต้น ACTIVE 1 แผน — ไม่มี ⇒ สร้าง/ปลุกแผน code ตามค่าตั้ง rooms.hotel.defaultRatePlan */
async function ensureDefaultPlan(g: Gate): Promise<void> {
  const db = tenantDb({ tenantId: g.tenantId, unitId: g.unit.id });
  if (await db.hotelRatePlan.findFirst({ where: { isDefault: true, status: "ACTIVE" }, select: { id: true } })) return;
  const st = await resolveSettings({ tenantId: g.tenantId }, [KEY.defaultPlan, KEY.deposit], { unitId: g.unit.id });
  const code = String(st[KEY.defaultPlan]?.value ?? "").trim().toUpperCase();
  if (!code) return;
  const dep = isRec(st[KEY.deposit]?.value) ? (st[KEY.deposit].value as DepositPolicy) : null;
  const depositKind = dep && (DEPOSIT_KINDS as readonly string[]).includes(String(dep.kind)) ? String(dep.kind) : undefined;
  const depositValue = depositKind === "PERCENT" ? Math.max(0, Math.trunc(dep?.percentBp ?? 0)) : depositKind === "FIXED_AMOUNT" ? Math.max(0, Math.trunc(dep?.amountSatang ?? 0)) : 0;
  try {
    await db.$transaction(async (tx) => {
      await lockKey(tx, `hotel-plans:${g.unit.id}`);
      const w = { tenantId: g.tenantId, unitId: g.unit.id };
      if (await tx.hotelRatePlan.findFirst({ where: { ...w, isDefault: true, status: "ACTIVE" }, select: { id: true } })) return;
      const same = await tx.hotelRatePlan.findFirst({ where: { ...w, code } });
      if (same) {
        const after = await tx.hotelRatePlan.update({ where: { id: same.id }, data: { isDefault: true, status: "ACTIVE" } });
        await audit(tx, { ...w, actorId: g.actor.userId, action: "hotel.ratePlan.default", targetType: "HotelRatePlan", targetId: same.id, before: planDto(same), after: planDto(after) });
        return;
      }
      const created = await tx.hotelRatePlan.create({
        data: { ...w, code, name: DEFAULT_PLAN_NAME[code] ?? code, isDefault: true, status: "ACTIVE", visibility: [...VISIBILITY], ...(depositKind ? { depositKind, depositValue } : {}) },
      });
      await audit(tx, { ...w, actorId: g.actor.userId, action: "hotel.ratePlan.create", targetType: "HotelRatePlan", targetId: created.id, before: null, after: { ...planDto(created), auto: true } });
    }, TX);
  } catch (e) {
    if (!isUniqueErr(e)) throw e; // คำขอพร้อมกันสร้างไปแล้ว — ใช้ของที่มี
  }
}

export async function listRatePlans(actor: unknown, ctx: unknown, input: unknown): Promise<{ ok: true; plans: RatePlanDto[] } | RatesFail> {
  const g = await gate(actor, ctx, input, "read");
  if (!g.ok) return g;
  // m1 ▸ สร้าง/ปลุกแผนเริ่มต้นเฉพาะผู้มีสิทธิ์เขียน — ผู้อ่านเห็น "ยังไม่มีแผนราคา" จนผู้เขียนเปิดจอ ◂
  if (evaluate(g.actor, { module: "hotel", action: "hotel.rates.write", unitId: g.unit.id })) await ensureDefaultPlan(g);
  const rows = await tenantDb({ tenantId: g.tenantId, unitId: g.unit.id }).hotelRatePlan.findMany({
    orderBy: [{ status: "asc" }, { isDefault: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    include: { cancelRules: { orderBy: { daysBefore: "desc" }, select: { daysBefore: true, refundBp: true } } },
  });
  return { ok: true, plans: rows.map((p) => planDto(p, p.cancelRules)) };
}

const nights = z.number().int().min(1, "ขั้นต่ำ/สูงสุดคืนต้องอย่างน้อย 1 คืน").max(365, "จำนวนคืนต้องไม่เกิน 365").nullable().optional();
const planSchema = z
  .object({
    unitId: z.string().min(1),
    id: z.string().min(1).optional(),
    code: z.string().trim().regex(/^[A-Za-z0-9_-]{1,40}$/, "รหัสแผนต้องเป็นอักษรอังกฤษ/ตัวเลข/ขีด 1–40 ตัว"),
    name: z.string().trim().min(1, "ใส่ชื่อแผนราคา").max(80, "ชื่อแผนยาวเกิน 80 ตัวอักษร"),
    description: z.string().trim().max(500).nullable().optional(),
    includeBreakfast: z.boolean().optional(),
    minNights: nights,
    maxNights: nights,
    depositKind: z.enum(DEPOSIT_KINDS, { message: "ชนิดมัดจำไม่ถูกต้อง" }).optional(),
    depositValue: z.number().int().min(0, "ค่ามัดจำต้องไม่ติดลบ").max(MONEY_MAX).optional(),
    visibility: z.array(z.enum(VISIBILITY, { message: "ช่องทางขายไม่ถูกต้อง" })).max(4).optional(),
    sortOrder: z.number().int().min(0).max(10_000).optional(),
    setDefault: z.boolean().optional(),
  })
  .strip();

/** สร้าง/แก้แผนราคา (id = แก้ · ช่องที่ไม่ส่ง = คงเดิม) · code ไม่ซ้ำในหน่วย · setDefault ย้ายแผนเริ่มต้น (ใน tx เดียว) */
export async function saveRatePlan(actor: unknown, ctx: unknown, input: unknown): Promise<{ ok: true; plan: RatePlanDto } | RatesFail> {
  const g = await gate(actor, ctx, input, "write");
  if (!g.ok) return g;
  const p = planSchema.safeParse(input);
  if (!p.success) return fail("VALIDATION", zodReason(p.error));
  const d = p.data;
  const code = d.code.toUpperCase();
  const w = { tenantId: g.tenantId, unitId: g.unit.id };
  const db = tenantDb(w);
  const existing = d.id ? await db.hotelRatePlan.findFirst({ where: { id: d.id } }) : null;
  if (d.id && !existing) return fail("NOT_FOUND", R.notFound);
  const minN = d.minNights !== undefined ? d.minNights : (existing?.minNights ?? null);
  const maxN = d.maxNights !== undefined ? d.maxNights : (existing?.maxNights ?? null);
  if (minN !== null && maxN !== null && minN > maxN) return fail("VALIDATION", "ขั้นต่ำคืนต้องไม่มากกว่าจำนวนคืนสูงสุด");
  const kind = d.depositKind ?? existing?.depositKind ?? "FIRST_NIGHT";
  const value = d.depositValue ?? (d.depositKind && d.depositKind !== existing?.depositKind ? 0 : (existing?.depositValue ?? 0));
  if (kind === "PERCENT" && value > 10_000) return fail("VALIDATION", "มัดจำแบบเปอร์เซ็นต์ต้องไม่เกิน 100%");
  if (existing && existing.status !== "ACTIVE") return fail("PLAN_ARCHIVED", "แผนนี้เก็บเข้าคลังแล้ว — แก้ไม่ได้ (สร้างแผนใหม่แทน)");
  if (await db.hotelRatePlan.findFirst({ where: { code, ...(existing ? { NOT: { id: existing.id } } : {}) }, select: { id: true } })) {
    return fail("DUPLICATE_CODE", `มีแผนรหัส ${code} ในโรงแรมนี้แล้ว — ใช้รหัสอื่น`);
  }
  const data = {
    code,
    name: d.name,
    ...(d.description !== undefined ? { description: d.description || null } : {}),
    ...(d.includeBreakfast !== undefined ? { includeBreakfast: d.includeBreakfast } : {}),
    minNights: minN,
    maxNights: maxN,
    depositKind: kind,
    depositValue: value,
    ...(d.visibility !== undefined ? { visibility: [...new Set(d.visibility)] } : {}),
    ...(d.sortOrder !== undefined ? { sortOrder: d.sortOrder } : {}),
  };
  try {
    const saved = await db.$transaction(async (tx) => {
      await lockKey(tx, `hotel-plans:${g.unit.id}`);
      if (d.setDefault) await tx.hotelRatePlan.updateMany({ where: { ...w, isDefault: true, ...(existing ? { NOT: { id: existing.id } } : {}) }, data: { isDefault: false } });
      const row = existing
        ? await tx.hotelRatePlan.update({ where: { id: existing.id }, data: { ...data, ...(d.setDefault ? { isDefault: true } : {}) } })
        : await tx.hotelRatePlan.create({ data: { ...w, ...data, ...(d.visibility === undefined ? { visibility: [...VISIBILITY] } : {}), isDefault: d.setDefault === true, status: "ACTIVE" } });
      await audit(tx, {
        ...w,
        actorId: g.actor.userId,
        action: existing ? "hotel.ratePlan.update" : "hotel.ratePlan.create",
        targetType: "HotelRatePlan",
        targetId: row.id,
        before: existing ? planDto(existing) : null,
        after: planDto(row),
      });
      await emitAriDirty(tx, w, []); // SVC H.10 ◂
      return row;
    }, TX);
    return { ok: true, plan: planDto(saved) };
  } catch (e) {
    if (isUniqueErr(e)) return fail("DUPLICATE_CODE", `มีแผนรหัส ${code} ในโรงแรมนี้แล้ว — ใช้รหัสอื่น`);
    throw e;
  }
}

/** เก็บแผนเข้าคลัง (ไม่ลบ — คืนที่จองไว้อ้างแผนได้ต่อ S:1114) · แผนเริ่มต้น ⇒ DEFAULT_PLAN */
export async function archiveRatePlan(actor: unknown, ctx: unknown, input: unknown): Promise<{ ok: true } | RatesFail> {
  const g = await gate(actor, ctx, input, "write");
  if (!g.ok) return g;
  const id = isRec(input) ? input.id : null;
  if (!isStr(id)) return fail("NOT_FOUND", R.notFound);
  const w = { tenantId: g.tenantId, unitId: g.unit.id };
  const db = tenantDb(w);
  const plan = await db.hotelRatePlan.findFirst({ where: { id } });
  if (!plan) return fail("NOT_FOUND", R.notFound);
  // m2 ▸ ตรวจ isDefault ใต้ล็อกเดียวกับ saveRatePlan(setDefault) — กันย้าย default พร้อมกับ archive ◂
  return db.$transaction(async (tx) => {
    await lockKey(tx, `hotel-plans:${g.unit.id}`);
    const cur = await tx.hotelRatePlan.findFirst({ where: { ...w, id: plan.id } });
    if (!cur) return fail("NOT_FOUND", R.notFound);
    if (cur.status === "ARCHIVED") return { ok: true as const };
    if (cur.isDefault) return fail("DEFAULT_PLAN", "แผนเริ่มต้นเก็บเข้าคลังไม่ได้ — ตั้งแผนอื่นเป็นแผนเริ่มต้นก่อน");
    const after = await tx.hotelRatePlan.update({ where: { id: cur.id }, data: { status: "ARCHIVED" } });
    await audit(tx, { ...w, actorId: g.actor.userId, action: "hotel.ratePlan.archive", targetType: "HotelRatePlan", targetId: cur.id, before: planDto(cur), after: planDto(after) });
    await emitAriDirty(tx, w, []); // SVC H.10 ◂
    return { ok: true as const };
  }, TX);
}

const rulesSchema = z
  .array(
    z.object({
      daysBefore: z.number().int().min(0, "จำนวนวันก่อนเข้าพักต้องไม่ติดลบ").max(365, "จำนวนวันก่อนเข้าพักต้องไม่เกิน 365"),
      refundBp: z.number().int().min(0, "อัตราคืนเงินต้องอยู่ระหว่าง 0–100%").max(10_000, "อัตราคืนเงินต้องอยู่ระหว่าง 0–100%"),
    }),
  )
  .max(10, "ตั้งขั้นได้ไม่เกิน 10 ขั้น");

/** ตั้งขั้นบันไดยกเลิกของแผน (แทนทั้งชุด · daysBefore ไม่ซ้ำ · ชุดว่าง = ใช้ค่าตั้ง rooms.hotel.cancelPolicy) */
export async function saveCancelRules(actor: unknown, ctx: unknown, input: unknown): Promise<{ ok: true; rules: { daysBefore: number; refundBp: number }[] } | RatesFail> {
  const g = await gate(actor, ctx, input, "write");
  if (!g.ok) return g;
  const ratePlanId = isRec(input) ? input.ratePlanId : null;
  const p = rulesSchema.safeParse(isRec(input) ? input.rules : undefined);
  if (!p.success) return fail("VALIDATION", zodReason(p.error));
  const rules = [...p.data].sort((a, b) => b.daysBefore - a.daysBefore);
  if (new Set(rules.map((r) => r.daysBefore)).size !== rules.length) return fail("VALIDATION", "จำนวนวันก่อนเข้าพักซ้ำกัน — แต่ละขั้นต้องไม่ซ้ำ");
  if (!isStr(ratePlanId)) return fail("NOT_FOUND", R.notFound);
  const w = { tenantId: g.tenantId, unitId: g.unit.id };
  const db = tenantDb(w);
  const plan = await db.hotelRatePlan.findFirst({ where: { id: ratePlanId }, select: { id: true } });
  if (!plan) return fail("NOT_FOUND", R.notFound);
  await db.$transaction(async (tx) => {
    await lockKey(tx, `hotel-cancel-rules:${plan.id}`);
    const before = await tx.hotelCancelRule.findMany({ where: { ...w, ratePlanId: plan.id }, orderBy: { daysBefore: "desc" }, select: { daysBefore: true, refundBp: true } });
    await tx.hotelCancelRule.deleteMany({ where: { ...w, ratePlanId: plan.id } });
    if (rules.length) await tx.hotelCancelRule.createMany({ data: rules.map((r) => ({ ...w, ratePlanId: plan.id, daysBefore: r.daysBefore, refundBp: r.refundBp })) });
    await audit(tx, { ...w, actorId: g.actor.userId, action: "hotel.ratePlan.cancelRules", targetType: "HotelRatePlan", targetId: plan.id, before: { rules: before }, after: { rules } });
  }, TX);
  return { ok: true, rules };
}

// ───────────────────────── ฤดู · วันหยุด ─────────────────────────
export async function listSeasons(actor: unknown, ctx: unknown, input: unknown): Promise<{ ok: true; seasons: SeasonDto[] } | RatesFail> {
  const g = await gate(actor, ctx, input, "read");
  if (!g.ok) return g;
  const rows = await tenantDb({ tenantId: g.tenantId, unitId: g.unit.id }).hotelSeason.findMany({ orderBy: [{ status: "asc" }, { priority: "desc" }, { dateStart: "asc" }] });
  return { ok: true, seasons: rows.map(seasonDto) };
}

const ymd = z.string().refine((s) => isYmd(s), "วันที่ไม่ถูกต้อง (ต้องเป็น ปี-เดือน-วัน)");
const seasonSchema = z
  .object({
    unitId: z.string().min(1),
    id: z.string().min(1).optional(),
    name: z.string().trim().min(1, "ใส่ชื่อฤดู").max(80, "ชื่อฤดูยาวเกิน 80 ตัวอักษร"),
    dateStart: ymd,
    dateEnd: ymd,
    priority: z.number().int().min(-1000).max(1000),
    minNights: z.number().int().min(1, "ขั้นต่ำคืนของฤดูต้องอย่างน้อย 1 คืน").max(365).nullable().optional(),
  })
  .strip();

/** สร้าง/แก้ฤดู (รวมวันจบ · dateEnd ≥ dateStart · minNights ≥ 1 หรือว่าง) */
export async function saveSeason(actor: unknown, ctx: unknown, input: unknown): Promise<{ ok: true; season: SeasonDto } | RatesFail> {
  const g = await gate(actor, ctx, input, "write");
  if (!g.ok) return g;
  const p = seasonSchema.safeParse(input);
  if (!p.success) return fail("VALIDATION", zodReason(p.error));
  const d = p.data;
  if (d.dateEnd < d.dateStart) return fail("VALIDATION", "วันสิ้นสุดฤดูต้องไม่ก่อนวันเริ่ม");
  if (dayNumber(d.dateEnd) - dayNumber(d.dateStart) > 731) return fail("VALIDATION", "ฤดูยาวได้ไม่เกิน 2 ปี");
  const w = { tenantId: g.tenantId, unitId: g.unit.id };
  const db = tenantDb(w);
  const existing = d.id ? await db.hotelSeason.findFirst({ where: { id: d.id } }) : null;
  if (d.id && !existing) return fail("NOT_FOUND", R.notFound);
  if (existing && existing.status !== "ACTIVE") return fail("ARCHIVED", "ฤดูนี้เก็บเข้าคลังแล้ว — สร้างฤดูใหม่แทน");
  const data = {
    name: d.name,
    dateStart: dbDate(d.dateStart),
    dateEnd: dbDate(d.dateEnd),
    priority: d.priority,
    minNights: d.minNights !== undefined ? d.minNights : (existing?.minNights ?? null),
  };
  const saved = await db.$transaction(async (tx) => {
    const row = existing ? await tx.hotelSeason.update({ where: { id: existing.id }, data }) : await tx.hotelSeason.create({ data: { ...w, ...data, status: "ACTIVE" } });
    await audit(tx, {
      ...w,
      actorId: g.actor.userId,
      action: existing ? "hotel.season.update" : "hotel.season.create",
      targetType: "HotelSeason",
      targetId: row.id,
      before: existing ? seasonDto(existing) : null,
      after: seasonDto(row),
    });
    await emitAriDirty(tx, w, []); // SVC H.10 ◂
    return row;
  }, TX);
  return { ok: true, season: seasonDto(saved) };
}

/** เก็บฤดูเข้าคลัง (แถวราคาที่อ้างฤดูคงไว้ · คิดราคาไม่นับฤดูนี้แล้ว) */
export async function archiveSeason(actor: unknown, ctx: unknown, input: unknown): Promise<{ ok: true } | RatesFail> {
  const g = await gate(actor, ctx, input, "write");
  if (!g.ok) return g;
  const id = isRec(input) ? input.id : null;
  if (!isStr(id)) return fail("NOT_FOUND", R.notFound);
  const w = { tenantId: g.tenantId, unitId: g.unit.id };
  const db = tenantDb(w);
  const s = await db.hotelSeason.findFirst({ where: { id } });
  if (!s) return fail("NOT_FOUND", R.notFound);
  if (s.status === "ARCHIVED") return { ok: true };
  await db.$transaction(async (tx) => {
    const after = await tx.hotelSeason.update({ where: { id: s.id }, data: { status: "ARCHIVED" } });
    await audit(tx, { ...w, actorId: g.actor.userId, action: "hotel.season.archive", targetType: "HotelSeason", targetId: s.id, before: seasonDto(s), after: seasonDto(after) });
    await emitAriDirty(tx, w, []); // SVC H.10 ◂
  }, TX);
  return { ok: true };
}

const holidaysSchema = z.object({
  dates: z.array(ymd).min(1, "เลือกวันอย่างน้อย 1 วัน").max(400, "เพิ่มได้ครั้งละไม่เกิน 400 วัน"),
  name: z.string().trim().min(1, "ใส่ชื่อวันหยุด").max(80, "ชื่อวันหยุดยาวเกิน 80 ตัวอักษร"),
});

/** เพิ่มวันหยุดหลายวัน (ซ้ำ = ไม่เพิ่ม · ชื่อเปลี่ยน = แก้ชื่อ) */
export async function saveHolidays(actor: unknown, ctx: unknown, input: unknown): Promise<{ ok: true; added: number; renamed: number } | RatesFail> {
  const g = await gate(actor, ctx, input, "write");
  if (!g.ok) return g;
  const p = holidaysSchema.safeParse(isRec(input) ? { dates: input.dates, name: input.name } : {});
  if (!p.success) return fail("VALIDATION", zodReason(p.error));
  const dates = [...new Set(p.data.dates)].sort();
  const name = p.data.name;
  const w = { tenantId: g.tenantId, unitId: g.unit.id };
  return tenantDb(w).$transaction(async (tx) => {
    await lockKey(tx, `hotel-holidays:${g.unit.id}`);
    const have = await tx.hotelHoliday.findMany({ where: { ...w, date: { in: dates.map(dbDate) } }, select: { id: true, date: true, name: true } });
    const byDate = new Map(have.map((h) => [ymdOfDb(h.date), h]));
    const add = dates.filter((d) => !byDate.has(d));
    const rename = have.filter((h) => h.name !== name);
    if (add.length) await tx.hotelHoliday.createMany({ data: add.map((d) => ({ ...w, date: dbDate(d), name })) });
    if (rename.length) await tx.hotelHoliday.updateMany({ where: { ...w, id: { in: rename.map((h) => h.id) } }, data: { name } });
    if (add.length || rename.length) {
      await audit(tx, {
        ...w,
        actorId: g.actor.userId,
        action: "hotel.holiday.add",
        targetType: "HotelHoliday", // m8 ▸ ปฏิทินวันหยุดของหน่วย (targetId = unitId ทั้งเพิ่ม/ลบ) ◂
        targetId: g.unit.id,
        before: rename.length ? { renamed: rename.map((h) => ({ date: ymdOfDb(h.date), name: h.name })) } : null,
        after: { name, added: add, renamed: rename.map((h) => ymdOfDb(h.date)) },
      });
    }
    await emitAriDirty(tx, w, [], dates[0], dates[dates.length - 1]); // SVC H.10 ◂
    return { ok: true as const, added: add.length, renamed: rename.length };
  }, TX);
}

/** ลบวันหยุด 1 วัน (ไม่มี = ok · removed 0) */
export async function removeHoliday(actor: unknown, ctx: unknown, input: unknown): Promise<{ ok: true; removed: number } | RatesFail> {
  const g = await gate(actor, ctx, input, "write");
  if (!g.ok) return g;
  const date = isRec(input) ? input.date : null;
  if (!isYmd(date)) return fail("VALIDATION", "วันที่ไม่ถูกต้อง (ต้องเป็น ปี-เดือน-วัน)");
  const w = { tenantId: g.tenantId, unitId: g.unit.id };
  return tenantDb(w).$transaction(async (tx) => {
    const rows = await tx.hotelHoliday.findMany({ where: { ...w, date: dbDate(date) }, select: { id: true, name: true } });
    if (!rows.length) return { ok: true as const, removed: 0 };
    await tx.hotelHoliday.deleteMany({ where: { ...w, id: { in: rows.map((r) => r.id) } } });
    await audit(tx, { ...w, actorId: g.actor.userId, action: "hotel.holiday.remove", targetType: "HotelHoliday", targetId: g.unit.id, before: { date, name: rows[0].name }, after: null });
    await emitAriDirty(tx, w, [], date, date); // SVC H.10 ◂
    return { ok: true as const, removed: rows.length };
  }, TX);
}

// ───────────────────────── ตารางราคา (matrix) ─────────────────────────
async function planOfUnit(tenantId: string, unitId: string, id: unknown) {
  if (!isStr(id)) return null;
  return tenantDb({ tenantId, unitId }).hotelRatePlan.findFirst({ where: { id } });
}

/** ตารางราคาของแผน: ประเภทห้อง (ใช้งาน) × (ราคาปกติ + ฤดู ACTIVE) · ช่องที่ยังไม่ตั้ง = null */
export async function getRateMatrix(
  actor: unknown,
  ctx: unknown,
  input: unknown,
): Promise<{ ok: true; plan: RatePlanDto; roomTypes: { id: string; name: string }[]; seasons: SeasonDto[]; rows: MatrixRow[] } | RatesFail> {
  const g = await gate(actor, ctx, input, "read");
  if (!g.ok) return g;
  const plan = await planOfUnit(g.tenantId, g.unit.id, isRec(input) ? input.ratePlanId : null);
  if (!plan) return fail("NOT_FOUND", R.notFound);
  const db = tenantDb({ tenantId: g.tenantId, unitId: g.unit.id });
  const [types, seasons, rates] = await Promise.all([
    db.hotelRoomType.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
    db.hotelSeason.findMany({ where: { status: "ACTIVE" }, orderBy: [{ priority: "desc" }, { dateStart: "asc" }] }),
    db.hotelRate.findMany({ where: { ratePlanId: plan.id } }),
  ]);
  const at = new Map(rates.map((r) => [`${r.roomTypeId}|${r.seasonId ?? ""}`, r]));
  const rows: MatrixRow[] = [];
  for (const t of types) {
    for (const sid of [null, ...seasons.map((s) => s.id)]) {
      const r = at.get(`${t.id}|${sid ?? ""}`);
      rows.push({
        roomTypeId: t.id,
        seasonId: sid,
        priceWeekdaySatang: r?.priceWeekdaySatang ?? null,
        priceWeekendSatang: r?.priceWeekendSatang ?? null,
        priceHolidaySatang: r?.priceHolidaySatang ?? null,
      });
    }
  }
  return { ok: true, plan: planDto(plan), roomTypes: types, seasons: seasons.map(seasonDto), rows };
}

const priceOk = (v: unknown, nullable: boolean): boolean => (v === null || v === undefined ? nullable : typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= MONEY_MAX);

/**
 * บันทึกตารางราคาของแผนทั้งชุด (มติ 9) — ทุกแถวตรวจก่อนเขียน · ราคาติดลบ/ไม่ใช่จำนวนเต็ม ⇒ INVALID_PRICE ไม่เขียนสักแถว
 * แถวที่ราคาธรรมดา+สุดสัปดาห์ว่างทั้งคู่ = ลบช่องนั้น · ประเภท/ฤดูต้องเป็นของหน่วย (ไม่ใช่ ⇒ NOT_FOUND) · เขียนใน tx เดียว (ล้มทั้งชุด)
 */
export async function saveRates(actor: unknown, ctx: unknown, input: unknown): Promise<{ ok: true; saved: number } | RatesFail> {
  const g = await gate(actor, ctx, input, "write");
  if (!g.ok) return g;
  const rowsIn = isRec(input) ? input.rows : null;
  if (!Array.isArray(rowsIn) || rowsIn.length > 1000) return fail("VALIDATION", "ข้อมูลตารางราคาไม่ถูกต้อง");
  type In = { roomTypeId: string; seasonId: string | null; wd: number | null; we: number | null; hol: number | null };
  const rows: In[] = [];
  for (const r of rowsIn) {
    if (!isRec(r) || !isStr(r.roomTypeId) || !(r.seasonId === null || r.seasonId === undefined || isStr(r.seasonId))) return fail("VALIDATION", "ข้อมูลตารางราคาไม่ถูกต้อง");
    if (!priceOk(r.priceWeekdaySatang, true) || !priceOk(r.priceWeekendSatang, true) || !priceOk(r.priceHolidaySatang, true)) {
      return fail("INVALID_PRICE", "ราคาต้องเป็นจำนวนเงินไม่ติดลบ");
    }
    const wd = (r.priceWeekdaySatang ?? null) as number | null;
    const we = (r.priceWeekendSatang ?? null) as number | null;
    const hol = (r.priceHolidaySatang ?? null) as number | null;
    if ((wd === null) !== (we === null) || (wd === null && hol !== null)) return fail("INVALID_PRICE", "กรอกราคาวันธรรมดาและวันสุดสัปดาห์ให้ครบทั้งคู่ (หรือเว้นว่างทั้งช่อง)");
    rows.push({ roomTypeId: r.roomTypeId, seasonId: (r.seasonId ?? null) as string | null, wd, we, hol });
  }
  const keyOf = (x: { roomTypeId: string; seasonId: string | null }) => `${x.roomTypeId}|${x.seasonId ?? ""}`;
  if (new Set(rows.map(keyOf)).size !== rows.length) return fail("VALIDATION", "มีช่องราคาซ้ำกันในชุดที่บันทึก");
  const w = { tenantId: g.tenantId, unitId: g.unit.id };
  const db = tenantDb(w);
  const plan = await planOfUnit(g.tenantId, g.unit.id, isRec(input) ? input.ratePlanId : null);
  if (!plan) return fail("NOT_FOUND", R.notFound);
  if (plan.status !== "ACTIVE") return fail("ARCHIVED", "แผนนี้เก็บเข้าคลังแล้ว — แก้ราคาไม่ได้");
  const typeIds = [...new Set(rows.map((r) => r.roomTypeId))];
  const seasonIds = [...new Set(rows.map((r) => r.seasonId).filter(isStr))];
  const [types, seasons] = await Promise.all([
    typeIds.length ? db.hotelRoomType.findMany({ where: { id: { in: typeIds } }, select: { id: true } }) : Promise.resolve([]),
    seasonIds.length ? db.hotelSeason.findMany({ where: { id: { in: seasonIds } }, select: { id: true } }) : Promise.resolve([]),
  ]);
  if (types.length !== typeIds.length || seasons.length !== seasonIds.length) return fail("NOT_FOUND", "ไม่พบประเภทห้องหรือฤดูบางรายการในโรงแรมนี้ — โหลดหน้าใหม่แล้วลองอีกครั้ง");
  try {
    return await db.$transaction(async (tx) => {
      await lockKey(tx, `hotel-rates:${plan.id}`);
      const have = await tx.hotelRate.findMany({ where: { ...w, ratePlanId: plan.id } });
      const byKey = new Map(have.map((h) => [keyOf(h), h]));
      const before: Record<string, unknown>[] = [];
      const after: Record<string, unknown>[] = [];
      let saved = 0;
      for (const r of rows) {
        const cur = byKey.get(keyOf(r));
        const cell = { roomTypeId: r.roomTypeId, seasonId: r.seasonId };
        if (r.wd === null || r.we === null) {
          if (!cur) continue;
          await tx.hotelRate.delete({ where: { id: cur.id } });
          before.push({ ...cell, wd: cur.priceWeekdaySatang, we: cur.priceWeekendSatang, hol: cur.priceHolidaySatang });
          after.push({ ...cell, removed: true });
          saved++;
          continue;
        }
        if (cur && cur.priceWeekdaySatang === r.wd && cur.priceWeekendSatang === r.we && (cur.priceHolidaySatang ?? null) === r.hol) continue;
        const data = { priceWeekdaySatang: r.wd, priceWeekendSatang: r.we, priceHolidaySatang: r.hol };
        if (cur) {
          await tx.hotelRate.update({ where: { id: cur.id }, data });
          before.push({ ...cell, wd: cur.priceWeekdaySatang, we: cur.priceWeekendSatang, hol: cur.priceHolidaySatang });
        } else {
          await tx.hotelRate.create({ data: { ...w, ratePlanId: plan.id, ...cell, ...data } });
        }
        after.push({ ...cell, wd: r.wd, we: r.we, hol: r.hol });
        saved++;
      }
      if (saved) await audit(tx, { ...w, actorId: g.actor.userId, action: "hotel.rates.save", targetType: "HotelRatePlan", targetId: plan.id, before: { cells: before }, after: { cells: after } });
      await emitAriDirty(tx, w, [...new Set(rows.map((r) => r.roomTypeId))]); // SVC H.10 ◂
      return { ok: true as const, saved };
    }, TX);
  } catch (e) {
    if (isUniqueErr(e)) return fail("CONFLICT", R.conflict);
    throw e;
  }
}

// ───────────────────────── แก้มือรายวัน ─────────────────────────
type OverrideTarget = { roomTypeId: string; ratePlanId: string | null; dates: string[] };
/** ตรวจ (ประเภท, แผน|ทุกแผน, วัน/ช่วงวัน ≤ 62 วัน) ของหน่วย */
async function overrideTarget(g: Gate, input: unknown): Promise<OverrideTarget | RatesFail> {
  if (!isRec(input)) return fail("VALIDATION", "ข้อมูลไม่ครบ");
  const from = input.date;
  const to = input.dateTo === undefined || input.dateTo === null || input.dateTo === "" ? from : input.dateTo;
  if (!isYmd(from) || !isYmd(to)) return fail("VALIDATION", "วันที่ไม่ถูกต้อง (ต้องเป็น ปี-เดือน-วัน)");
  if (to < from) return fail("VALIDATION", "วันสิ้นสุดต้องไม่ก่อนวันเริ่ม");
  if (dayNumber(to) - dayNumber(from) + 1 > OVERRIDE_MAX_DAYS) return fail("RANGE", `ปรับราคาได้ครั้งละไม่เกิน ${OVERRIDE_MAX_DAYS} วัน`);
  const db = tenantDb({ tenantId: g.tenantId, unitId: g.unit.id });
  if (!isStr(input.roomTypeId) || !(await db.hotelRoomType.findFirst({ where: { id: input.roomTypeId }, select: { id: true } }))) return fail("NOT_FOUND", R.notFound);
  const rp = input.ratePlanId === undefined || input.ratePlanId === null || input.ratePlanId === "" ? null : input.ratePlanId;
  if (rp !== null && !(await planOfUnit(g.tenantId, g.unit.id, rp))) return fail("NOT_FOUND", R.notFound);
  return { roomTypeId: input.roomTypeId, ratePlanId: rp as string | null, dates: nightDates(from, addDaysYmd(to, 1)) };
}

/** ตั้งราคาแก้มือ (วันเดียวหรือช่วง dateTo · ratePlanId null = ทุกแผน) — แทนราคาตารางของวันนั้น · ผู้ตั้ง + เหตุผลจดไว้ */
export async function setOverride(actor: unknown, ctx: unknown, input: unknown): Promise<{ ok: true; count: number } | RatesFail> {
  const g = await gate(actor, ctx, input, "write");
  if (!g.ok) return g;
  const price = isRec(input) ? input.priceSatang : null;
  if (!priceOk(price, false)) return fail("INVALID_PRICE", "ราคาต้องเป็นจำนวนเงินไม่ติดลบ");
  const reasonRaw = isRec(input) && typeof input.reason === "string" ? input.reason.trim() : "";
  if (reasonRaw.length > 200) return fail("VALIDATION", "เหตุผลยาวเกิน 200 ตัวอักษร");
  const t = await overrideTarget(g, input);
  if ("ok" in t) return t;
  const priceSatang = price as number;
  const w = { tenantId: g.tenantId, unitId: g.unit.id };
  try {
    return await tenantDb(w).$transaction(async (tx) => {
      await lockKey(tx, `hotel-override:${t.roomTypeId}`);
      const have = await tx.hotelRateOverride.findMany({ where: { ...w, roomTypeId: t.roomTypeId, ratePlanId: t.ratePlanId, date: { in: t.dates.map(dbDate) } } });
      const byDate = new Map(have.map((h) => [ymdOfDb(h.date), h]));
      let count = 0;
      for (const d of t.dates) {
        const cur = byDate.get(d);
        const data = { priceSatang, reason: reasonRaw || null, setById: g.actor.userId };
        if (cur) {
          if (cur.priceSatang === priceSatang && (cur.reason ?? null) === data.reason) continue;
          await tx.hotelRateOverride.update({ where: { id: cur.id }, data });
        } else {
          await tx.hotelRateOverride.create({ data: { ...w, roomTypeId: t.roomTypeId, ratePlanId: t.ratePlanId, date: dbDate(d), ...data } });
        }
        count++;
      }
      if (count) {
        await audit(tx, {
          ...w,
          actorId: g.actor.userId,
          action: "hotel.override.set",
          targetType: "HotelRoomType",
          targetId: t.roomTypeId,
          before: have.length ? { cells: have.map((h) => ({ date: ymdOfDb(h.date), priceSatang: h.priceSatang, reason: h.reason })) } : null,
          after: { ratePlanId: t.ratePlanId, from: t.dates[0], to: t.dates[t.dates.length - 1], priceSatang, reason: reasonRaw || null },
        });
      }
      await emitAriDirty(tx, w, [t.roomTypeId], t.dates[0], t.dates[t.dates.length - 1]); // SVC H.10 ◂
      return { ok: true as const, count };
    }, TX);
  } catch (e) {
    if (isUniqueErr(e)) return fail("CONFLICT", R.conflict);
    throw e;
  }
}

/** ล้างราคาแก้มือ (กลับไปใช้ราคาตาราง) — ไม่มี = ok · removed 0 */
export async function clearOverride(actor: unknown, ctx: unknown, input: unknown): Promise<{ ok: true; removed: number } | RatesFail> {
  const g = await gate(actor, ctx, input, "write");
  if (!g.ok) return g;
  const t = await overrideTarget(g, input);
  if ("ok" in t) return t;
  const w = { tenantId: g.tenantId, unitId: g.unit.id };
  return tenantDb(w).$transaction(async (tx) => {
    const have = await tx.hotelRateOverride.findMany({ where: { ...w, roomTypeId: t.roomTypeId, ratePlanId: t.ratePlanId, date: { in: t.dates.map(dbDate) } } });
    if (!have.length) return { ok: true as const, removed: 0 };
    await tx.hotelRateOverride.deleteMany({ where: { ...w, id: { in: have.map((h) => h.id) } } });
    await audit(tx, {
      ...w,
      actorId: g.actor.userId,
      action: "hotel.override.clear",
      targetType: "HotelRoomType",
      targetId: t.roomTypeId,
      before: { ratePlanId: t.ratePlanId, cells: have.map((h) => ({ date: ymdOfDb(h.date), priceSatang: h.priceSatang, reason: h.reason })) },
      after: null,
    });
    await emitAriDirty(tx, w, [t.roomTypeId], t.dates[0], t.dates[t.dates.length - 1]); // SVC H.10 ◂
    return { ok: true as const, removed: have.length };
  }, TX);
}

// ───────────────────────── บริบทคิดราคา (≤ 8 คิวรี · ไม่โตตามจำนวนวัน) ─────────────────────────
type UnitTypeRow = {
  unitType: string;
  id: string | null;
  name: string | null;
  capacity: number | null;
  baseOccupancy: number | null;
  maxOccupancy: number | null;
  extraBedAllowed: boolean | null;
  extraBedPriceSatang: number | null;
};
export type PricingContextExtra = { roomTypeList: { id: string; name: string }[] };

function rangeOf(o: unknown, maxDays: number): { from: string; to: string } | null {
  const today = todayTh();
  const from = isRec(o) && isYmd(o.from) ? o.from : today;
  const to = isRec(o) && isYmd(o.to) ? o.to : addDaysYmd(from, 13);
  if (to < from || dayNumber(to) - dayNumber(from) + 1 > maxDays) return null;
  return { from, to };
}
const roundingOf = (v: unknown): RoundingMode => (v === "BAHT_HALF_UP" || v === "BAHT_DOWN" ? v : "SATANG");
const intArr = (v: unknown): number[] => (Array.isArray(v) ? v.filter((x): x is number => typeof x === "number" && Number.isInteger(x)) : []);

/**
 * บริบทคิดราคาของหน่วยโรงแรม ช่วง [from, to] (วันหยุด/แก้มือในช่วง · แผน/ฤดู ACTIVE ทั้งหมด · ราคาของแผน ACTIVE)
 * fallback ต่อประเภท = ค่าตั้ง rooms.hotel.baseRate/dayOfWeekAdjustBp ที่ชั้น (ประเภท, แผนที่ขอ|แผนเริ่มต้น) — ไม่ใช่โรงแรม/ไม่พบ ⇒ null
 */
export async function loadPricingContext(ctx: unknown, unitId: unknown, opts?: unknown): Promise<(PricingContext & PricingContextExtra) | null> {
  const tenantId = isRec(ctx) ? ctx.tenantId : null;
  if (!isStr(tenantId) || !isStr(unitId)) return null;
  const range = rangeOf(opts, CONTEXT_MAX_DAYS);
  if (!range) return null;
  const db = tenantDb({ tenantId, unitId });
  const [unitRows, plans, seasons, holidays, rates, overrides] = await Promise.all([
    db.$queryRaw<UnitTypeRow[]>`
      SELECT u."type"::text AS "unitType", rt."id", rt."name", rt."capacity", rt."baseOccupancy", rt."maxOccupancy", rt."extraBedAllowed", rt."extraBedPriceSatang"
        FROM "BusinessUnit" u
        LEFT JOIN "HotelRoomType" rt ON rt."unitId" = u."id" AND rt."tenantId" = u."tenantId" AND rt."active" = true
       WHERE u."id" = ${unitId} AND u."tenantId" = ${tenantId}
       ORDER BY rt."sortOrder" ASC, rt."name" ASC`,
    db.hotelRatePlan.findMany({ where: { status: "ACTIVE" }, orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }] }),
    db.hotelSeason.findMany({ where: { status: "ACTIVE" }, orderBy: [{ priority: "desc" }, { dateStart: "asc" }] }),
    db.hotelHoliday.findMany({ where: { date: { gte: dbDate(range.from), lte: dbDate(range.to) } }, select: { date: true } }),
    db.hotelRate.findMany({ where: { ratePlan: { status: "ACTIVE" }, OR: [{ seasonId: null }, { season: { status: "ACTIVE" } }] } }),
    db.hotelRateOverride.findMany({ where: { date: { gte: dbDate(range.from), lte: dbDate(range.to) } } }),
  ]);
  if (unitRows[0]?.unitType !== "HOTEL") return null;
  const types = unitRows.filter((r): r is UnitTypeRow & { id: string } => isStr(r.id));
  const wantPlan = isRec(opts) && isStr(opts.ratePlanId) ? opts.ratePlanId : null;
  const planForFallback = (wantPlan && plans.some((p) => p.id === wantPlan) ? wantPlan : null) ?? plans.find((p) => p.isDefault)?.id ?? null;
  const keys = [KEY.weekendDays, KEY.rounding, KEY.baseRate, KEY.dowAdjust];
  const refs = [{ unitId }, ...types.map((t) => ({ unitId, roomTypeId: t.id, ...(planForFallback ? { ratePlanId: planForFallback } : {}) }))];
  const resolved = await resolveSettingsMany({ tenantId }, keys, refs);
  const unitSet = resolved[0] ?? {};

  const roomTypes: Record<string, RoomTypeInfo> = {};
  const fallback: Record<string, FallbackRate> = {};
  types.forEach((t, i) => {
    roomTypes[t.id] = {
      baseOccupancy: t.baseOccupancy ?? 2,
      maxOccupancy: t.maxOccupancy ?? t.capacity ?? null,
      extraBedAllowed: t.extraBedAllowed === true,
      extraBedPriceSatang: t.extraBedPriceSatang ?? 0,
    };
    const st = resolved[i + 1] ?? {};
    const base = st[KEY.baseRate]?.value;
    const adj = intArr(st[KEY.dowAdjust]?.value);
    fallback[t.id] = { baseRateSatang: typeof base === "number" ? base : null, dayOfWeekAdjustBp: adj.length === 7 ? adj : [0, 0, 0, 0, 0, 0, 0] };
  });
  const planRows: RatePlanRow[] = plans.map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    isDefault: p.isDefault,
    includeBreakfast: p.includeBreakfast,
    minNights: p.minNights,
    maxNights: p.maxNights,
    depositKind: p.depositKind,
    depositValue: p.depositValue,
    status: p.status,
    visibility: visibilityOf(p.visibility),
  }));
  const seasonRows: SeasonRow[] = seasons.map((s) => ({ id: s.id, name: s.name, dateStart: ymdOfDb(s.dateStart), dateEnd: ymdOfDb(s.dateEnd), priority: s.priority, minNights: s.minNights, status: s.status }));
  const rateRows: RateRow[] = rates.map((r) => ({
    ratePlanId: r.ratePlanId,
    roomTypeId: r.roomTypeId,
    seasonId: r.seasonId,
    priceWeekdaySatang: r.priceWeekdaySatang,
    priceWeekendSatang: r.priceWeekendSatang,
    priceHolidaySatang: r.priceHolidaySatang,
  }));
  const overrideRows: OverrideRow[] = overrides.map((o) => ({ roomTypeId: o.roomTypeId, ratePlanId: o.ratePlanId, date: ymdOfDb(o.date), priceSatang: o.priceSatang, reason: o.reason, setById: o.setById }));
  return {
    weekendDays: intArr(unitSet[KEY.weekendDays]?.value).filter((d) => d >= 0 && d <= 6),
    rounding: roundingOf(unitSet[KEY.rounding]?.value),
    today: todayTh(),
    roomTypes,
    plans: planRows,
    seasons: seasonRows,
    holidays: new Set(holidays.map((h) => ymdOfDb(h.date))),
    rates: rateRows,
    overrides: overrideRows,
    fallback,
    range, // M1 ▸ ช่วงที่โหลดวันหยุด/แก้มือ — นอกช่วง ⇒ pricing ปฏิเสธ (OUT_OF_RANGE) ◂
    roomTypeList: types.map((t) => ({ id: t.id, name: t.name ?? "" })),
  };
}

// ───────────────────────── ปฏิทินราคา + เหลือขาย ─────────────────────────
/** ห้องเหลือขายต่อ (ประเภท, วัน) — SVC H.3 ▸ สูตรเดียวของโรงแรม (hotelAvailability · ใบ h.3 §0): เหลือ = available · ขายได้ = total ◂ */
async function remainingOf(tenantId: string, unitId: string, from: string, to: string): Promise<{ sellable: Map<string, number>; used: Map<string, number> }> {
  const av = await hotelAvailability.get({ tenantId }, { unitId, from, to: addDaysYmd(to, 1) });
  const sellable = new Map<string, number>();
  const used = new Map<string, number>();
  if (av.ok) {
    for (const [date, cells] of Object.entries(av.byDate)) {
      for (const [typeId, cell] of Object.entries(cells)) {
        sellable.set(typeId, cell.total);
        used.set(`${typeId}|${date}`, cell.total - cell.available);
      }
    }
  }
  return { sellable, used };
}

/**
 * ปฏิทินราคา (ภาพ 15): ทุกวันใน [from, to] (≤ 62 วัน) × ทุกประเภทห้อง → ราคา/ที่มา (resolveNightPrice บนบริบทเดียวกัน) + เหลือขาย
 * ratePlanId ไม่ส่ง = แผนเริ่มต้น · แผนที่ไม่ใช่ของหน่วย/เก็บเข้าคลัง ⇒ NOT_FOUND · ไม่ใช่โรงแรม ⇒ NOT_FOUND
 */
export async function ratePreview(
  ctx: unknown,
  unitId: unknown,
  opts?: unknown,
): Promise<{ ok: true; from: string; to: string; ratePlanId: string | null; roomTypes: PreviewRoomType[]; days: PreviewDay[] } | RatesFail> {
  const tenantId = isRec(ctx) ? ctx.tenantId : null;
  if (!isStr(tenantId) || !isStr(unitId)) return fail("NOT_FOUND", R.notFound);
  const range = rangeOf(opts, PREVIEW_MAX_DAYS);
  if (!range) return fail("RANGE", `ดูปฏิทินราคาได้ครั้งละไม่เกิน ${PREVIEW_MAX_DAYS} วัน`);
  const want = isRec(opts) && isStr(opts.ratePlanId) ? opts.ratePlanId : null;
  const pc = await loadPricingContext({ tenantId }, unitId, { ...range, ...(want ? { ratePlanId: want } : {}) });
  if (!pc) return fail("NOT_FOUND", R.notFound);
  const plan = want ? pc.plans.find((p) => p.id === want) : pc.plans.find((p) => p.isDefault);
  if (want && !plan) return fail("NOT_FOUND", R.notFound);
  const { sellable, used } = await remainingOf(tenantId, unitId, range.from, range.to);
  const days: PreviewDay[] = nightDates(range.from, addDaysYmd(range.to, 1)).map((date) => {
    const byType: Record<string, PreviewCell> = {};
    for (const t of pc.roomTypeList) {
      const p = resolveNightPrice(pc, { roomTypeId: t.id, ratePlanId: plan?.id ?? "", date });
      const total = sellable.get(t.id) ?? 0;
      byType[t.id] = { priceSatang: p?.priceSatang ?? null, source: p?.source ?? null, remaining: Math.max(0, total - (used.get(`${t.id}|${date}`) ?? 0)), total };
    }
    return { date, byType };
  });
  return {
    ok: true,
    from: range.from,
    to: range.to,
    ratePlanId: plan?.id ?? null,
    roomTypes: pc.roomTypeList.map((t) => ({ ...t, sellable: sellable.get(t.id) ?? 0 })),
    days,
  };
}

// ───────────────────────── โมเดลจอราคา (หน้า /hotel/rates) ─────────────────────────
export type RatesScreenModel = {
  unitId: string;
  unitName: string;
  unitSlug: string;
  canWrite: boolean;
  /** M2 ▸ แผนที่จอกำลังดู (ปฏิทิน + ตารางราคา) — ไม่ระบุ/ไม่ใช่แผน ACTIVE ของหน่วย ⇒ แผนเริ่มต้น ◂ */
  selectedPlanId: string | null;
  from: string;
  to: string;
  today: string;
  plans: RatePlanDto[];
  seasons: SeasonDto[];
  holidays: HolidayDto[];
  preview: { ratePlanId: string | null; roomTypes: PreviewRoomType[]; days: PreviewDay[] };
  overrides: { roomTypeId: string; ratePlanId: string | null; date: string; priceSatang: number; reason: string | null }[];
  matrix: { ratePlanId: string; rows: MatrixRow[] } | null;
  rules: {
    weekendDays: number[];
    rounding: RoundingMode;
    maxAdvanceBookingDays: number;
    planRules: { ratePlanId: string; minNights: number | null; closedToArrival: boolean }[];
  };
  tax: { mode: string; vatBp: number; serviceChargeBp: number };
};

/** ทุกอย่างที่จอราคาใช้ในคำขอเดียว (ด่านเดียวกับ listRatePlans · canWrite ⇔ hotel.rates.write) */
export async function loadRatesScreen(actor: unknown, ctx: unknown, input: unknown): Promise<RatesScreenModel | null> {
  const g = await gate(actor, ctx, input, "read");
  if (!g.ok) return null;
  const listed = await listRatePlans(actor, ctx, { unitId: g.unit.id });
  if (!listed.ok) return null;
  const from = isRec(input) && isYmd(input.from) ? input.from : todayTh();
  const to = addDaysYmd(from, 13);
  const w = { tenantId: g.tenantId, unitId: g.unit.id };
  const db = tenantDb(w);
  const active = listed.plans.filter((p) => p.status === "ACTIVE");
  const want = isRec(input) && isStr(input.ratePlanId) ? active.find((p) => p.id === input.ratePlanId) : undefined;
  const def = want ?? active.find((p) => p.isDefault) ?? null;
  const year = from.slice(0, 4);
  const [preview, seasons, holidays, overrides, matrix, st, planSt] = await Promise.all([
    ratePreview({ tenantId: g.tenantId }, g.unit.id, { from, to, ...(def ? { ratePlanId: def.id } : {}) }),
    db.hotelSeason.findMany({ orderBy: [{ status: "asc" }, { priority: "desc" }, { dateStart: "asc" }] }),
    db.hotelHoliday.findMany({ where: { date: { gte: dbDate(`${year}-01-01`), lte: dbDate(`${Number(year) + 1}-12-31`) } }, orderBy: { date: "asc" }, select: { date: true, name: true } }),
    db.hotelRateOverride.findMany({ where: { date: { gte: dbDate(from), lte: dbDate(to) } }, select: { roomTypeId: true, ratePlanId: true, date: true, priceSatang: true, reason: true } }),
    def ? getRateMatrix(actor, ctx, { unitId: g.unit.id, ratePlanId: def.id }) : Promise.resolve(null),
    resolveSettings({ tenantId: g.tenantId }, [KEY.weekendDays, KEY.rounding, KEY.maxAdvance, KEY.taxMode, KEY.vatBp, KEY.scBp], { unitId: g.unit.id }),
    active.length ? resolveSettingsMany({ tenantId: g.tenantId }, [KEY.minNights, KEY.closedToArrival], active.map((p) => ({ unitId: g.unit.id, ratePlanId: p.id }))) : Promise.resolve([]),
  ]);
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  return {
    unitId: g.unit.id,
    unitName: g.unit.name,
    unitSlug: g.unit.slug,
    canWrite: evaluate(g.actor, { module: "hotel", action: "hotel.rates.write", unitId: g.unit.id }),
    selectedPlanId: def?.id ?? null,
    from,
    to,
    today: todayTh(),
    plans: listed.plans,
    seasons: seasons.map(seasonDto),
    holidays: holidays.map((h) => ({ date: ymdOfDb(h.date), name: h.name })),
    preview: preview.ok ? { ratePlanId: preview.ratePlanId, roomTypes: preview.roomTypes, days: preview.days } : { ratePlanId: null, roomTypes: [], days: [] },
    overrides: overrides.map((o) => ({ roomTypeId: o.roomTypeId, ratePlanId: o.ratePlanId, date: ymdOfDb(o.date), priceSatang: o.priceSatang, reason: o.reason })),
    matrix: matrix && matrix.ok ? { ratePlanId: matrix.plan.id, rows: matrix.rows } : null,
    rules: {
      weekendDays: intArr(st[KEY.weekendDays]?.value),
      rounding: roundingOf(st[KEY.rounding]?.value),
      maxAdvanceBookingDays: num(st[KEY.maxAdvance]?.value, 0),
      planRules: active.map((p, i) => ({
        ratePlanId: p.id,
        minNights: typeof planSt[i]?.[KEY.minNights]?.value === "number" ? (planSt[i][KEY.minNights].value as number) : null,
        closedToArrival: planSt[i]?.[KEY.closedToArrival]?.value === true,
      })),
    },
    tax: { mode: String(st[KEY.taxMode]?.value ?? ""), vatBp: num(st[KEY.vatBp]?.value, 0), serviceChargeBp: num(st[KEY.scBp]?.value, 0) },
  };
}
