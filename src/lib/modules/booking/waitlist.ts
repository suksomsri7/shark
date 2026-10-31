// SVC B.17 — waitlist "แจ้งฉันถ้ามีคนยกเลิก" (เข้า/ออก · สาธารณะ · ลิงก์ตัวตน LINE = สิทธิ์) · สัญญา: ledger/svc-briefs/svc-brief-b.17.md §3.1 · ข้อสอบ W-* · U-*
//
// 🔴 ไฟล์นี้ไม่ import prisma ดิบ (F5): tenantDb เท่านั้น · ทุกคิวรีผูก tenantId + unitId ของหน่วยที่ได้จาก slug (X1)
// 🔴 ข้อเสนอไม่ใช่การจอง: แถวนี้ไม่ถือช่อง · ลูกค้าจองผ่าน bookOnline → bookAppointment ทางเดียว (กติกา B.3/B.8/ไม่มาซ้ำ)
// 🔴 ตัวตนมาจากลิงก์ LINE ที่ยืนยันแล้วเท่านั้น (R7) · ตัวตนเสียทุกแบบ ⇒ IDENTITY_REQUIRED ข้อความเดียว · ของหน่วยอื่น/ไม่มี ⇒ NOT_FOUND ข้อความเดียว
// 🔴 rate limit (checkRateLimitDb) ก่อนแตะฐาน · นโยบายร้านอ่านจากทะเบียนค่าตั้งทุกคำขอ · now ฉีดได้ · X8: ไม่มีชื่อ/เบอร์ในแถว/ผลคืน
import { tenantDb } from "@/lib/core/db";
import { checkRateLimitDb } from "@/lib/core/rate-limit-db";
import { resolveSettings } from "@/lib/core/settings";
import { verifyLink } from "@/lib/core/signed-link";
import { resolvePublicUnit } from "@/lib/core/storefront";
import { repeatNoShowOf, REPEAT_NO_SHOW_REASON } from "./no-show-rule";
import { addDaysStr, bkkDayOf } from "./planner-run";
import { findSlots, getUnitHours, isRealDateStr } from "./service";
import { localToUtc } from "./slots";
import { unitDayWindows } from "./staff-hours";

export const WAITLIST_RATE = { joinIp: { limit: 10, windowMs: 600_000 } } as const;
export type WaitlistMode = "OFF" | "FIRST" | "ALL";
export type WaitlistJoinFail = "NOT_FOUND" | "RATE_LIMITED" | "DISABLED" | "IDENTITY_REQUIRED" | "BAD_INPUT" | "HAS_FREE" | "LIMIT" | "REPEAT_NO_SHOW" | "BUSY";
export type WaitlistView = { mode: "FIRST" | "ALL"; canJoin: boolean; joined: boolean };

const K = { mode: "booking.booking.waitlistMode", maxActive: "booking.booking.waitlistMaxActive", horizon: "booking.booking.horizonDays" } as const;
const R = {
  NF: "ไม่พบรายการที่เลือก",
  RATE: "ทำรายการถี่เกินไป กรุณารอสักครู่แล้วลองใหม่",
  DISABLED: "ร้านนี้ยังไม่เปิดให้รอคิวว่าง",
  IDENTITY: "กรุณาเปิดหน้านี้จาก LINE ของร้านเพื่อรับแจ้งเมื่อมีคิวว่าง",
  BAD: "ข้อมูลวันหรือช่วงเวลาไม่ถูกต้อง",
  HAS_FREE: "ช่วงเวลานี้ยังมีคิวว่าง จองได้เลย",
  LIMIT: "คุณรอคิวว่างไว้ครบจำนวนที่ร้านกำหนดแล้ว",
  BUSY: "ระบบกำลังทำรายการพร้อมกันหลายรายการ กรุณาลองใหม่อีกครั้ง",
} as const;
const TX = { maxWait: 10_000, timeout: 15_000 } as const;

type Ctx = { tenantId: string; unitId: string };
type Ref = { tenantSlug: string; unitSlug: string };
const nowOf = (o?: { now?: Date }): Date => (o?.now instanceof Date && !Number.isNaN(o.now.getTime()) ? o.now : new Date());
const ipOf = (ip: unknown): string => (typeof ip === "string" && ip.trim() ? ip.trim().slice(0, 100) : "unknown");
const slugOf = (v: unknown): string => (typeof v === "string" ? v.trim().slice(0, 120) : "");
const idOf = (v: unknown): string | null => (typeof v === "string" && v.length > 0 && v.length <= 200 ? v : null);
const fail = <C extends string>(code: C, reason: string) => ({ ok: false as const, code, reason });
const isRetryable = (e: unknown): boolean => {
  const c = e as { code?: unknown; meta?: { code?: unknown } } | null;
  return c?.code === "P2034" || c?.code === "40P01" || c?.meta?.code === "40P01" || (e instanceof Error && /deadlock detected|40P01/.test(e.message));
};

/** โหมด waitlist ของหน่วย (ค่าตั้งชั้น UNIT · อ่านทุกคำขอ) — ค่าเพี้ยน ⇒ OFF */
export async function waitlistModeOf(ctx: Ctx): Promise<WaitlistMode> {
  const r = await resolveSettings({ tenantId: ctx.tenantId }, [K.mode], { unitId: ctx.unitId });
  const v = r[K.mode]?.value;
  return v === "FIRST" || v === "ALL" ? v : "OFF";
}

/** Party จากลิงก์ตัวตน booking.identity ของร้านนี้ (ไม่ถูกรวม) · ไม่ผ่านทุกแบบ ⇒ null (ไม่ต้องมีเบอร์ — ต่างจาก identityOf ของ B.7) */
export async function waitlistPartyOf(tenantId: string, who: unknown): Promise<string | null> {
  if (typeof who !== "string" || !who || who.length > 4096) return null;
  const v = verifyLink(who, "booking.identity");
  if (!v || v.tenantId !== tenantId) return null;
  const p = await tenantDb({ tenantId }).party.findFirst({ where: { id: v.subjectId, tenantId, mergedIntoId: null }, select: { id: true } });
  return p?.id ?? null;
}

/** entry ACTIVE ของ Party ตรง บริการ · ช่าง (null = ใครก็ได้) · วัน */
async function activeEntryOf(db: ReturnType<typeof tenantDb>, ctx: Ctx, k: { partyId: string; serviceId: string; staffId: string | null; dateStr: string }) {
  return db.bookingWaitlist.findFirst({
    where: { tenantId: ctx.tenantId, unitId: ctx.unitId, partyId: k.partyId, serviceId: k.serviceId, staffId: k.staffId, dateStr: k.dateStr, status: "ACTIVE" },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, expiresAt: true },
  });
}

/** กรอบเปิด–ปิดของวันนั้น (เวลาทำการ + วันปิดพิเศษ) — ไม่มี ⇒ null */
async function dayFrameOf(ctx: Ctx, dateStr: string): Promise<{ fromMin: number; toMin: number } | null> {
  const [hours, closure] = await Promise.all([
    getUnitHours(ctx.tenantId, ctx.unitId),
    tenantDb(ctx).bookingClosure.findFirst({ where: { tenantId: ctx.tenantId, unitId: ctx.unitId, date: dateStr }, select: { closed: true, openMin: true, closeMin: true } }),
  ]);
  const ws = unitDayWindows({ dateStr, hours, closure: closure ?? null });
  if (!ws.length) return null;
  return { fromMin: Math.min(...ws.map((w) => w.startMin)), toMin: Math.max(...ws.map((w) => w.endMin)) };
}

// ═════════════════════════ เข้า waitlist (§3.1 ข้อ 1–9) ═════════════════════════
export async function joinWaitlistOnline(
  ref: Ref,
  i: { serviceId: string; staffId: string | null; dateStr: string; fromMin?: number; toMin?: number; who: string },
  opts?: { now?: Date; ip?: string },
): Promise<{ ok: true; entryId: string; duplicated: boolean; expiresAt: Date } | { ok: false; code: WaitlistJoinFail; reason: string }> {
  const now = nowOf(opts);
  // 1. ถังต่อ IP ก่อนแตะฐาน
  const rl = await checkRateLimitDb(`bq:wl:ip:${ipOf(opts?.ip)}`, WAITLIST_RATE.joinIp, now.getTime());
  if (!rl.ok) return fail("RATE_LIMITED", R.RATE);
  // 2. หน่วย BOOKING จาก slug
  const tSlug = slugOf(ref?.tenantSlug);
  const uSlug = slugOf(ref?.unitSlug);
  const u = tSlug && uSlug ? await resolvePublicUnit(tSlug, uSlug, "BOOKING") : null;
  if (!u) return fail("NOT_FOUND", R.NF);
  const ctx: Ctx = { tenantId: u.tenant.id, unitId: u.unit.id };
  // 3. โหมด
  if ((await waitlistModeOf(ctx)) === "OFF") return fail("DISABLED", R.DISABLED);
  const x = (i && typeof i === "object" ? i : {}) as Record<string, unknown>;
  // 4. ตัวตน
  const partyId = await waitlistPartyOf(ctx.tenantId, x.who);
  if (!partyId) return fail("IDENTITY_REQUIRED", R.IDENTITY);
  // 5. รูปข้อมูล
  const dateStr = typeof x.dateStr === "string" && x.dateStr.length === 10 ? x.dateStr : "";
  if (!dateStr || !isRealDateStr(dateStr)) return fail("BAD_INPUT", R.BAD);
  const today = bkkDayOf(now.getTime());
  const set = await resolveSettings({ tenantId: ctx.tenantId }, [K.horizon, K.maxActive], { unitId: ctx.unitId });
  const hv = set[K.horizon]?.value;
  const horizon = typeof hv === "number" && Number.isInteger(hv) && hv >= 1 ? hv : 1;
  if (dateStr < today || dateStr > addDaysStr(today, horizon - 1)) return fail("BAD_INPUT", R.BAD);
  let fromMin = x.fromMin;
  let toMin = x.toMin;
  if (fromMin === undefined || toMin === undefined) {
    const frame = await dayFrameOf(ctx, dateStr);
    if (!frame) return fail("BAD_INPUT", R.BAD);
    if (fromMin === undefined) fromMin = frame.fromMin;
    if (toMin === undefined) toMin = frame.toMin;
  }
  if (!Number.isInteger(fromMin) || !Number.isInteger(toMin)) return fail("BAD_INPUT", R.BAD);
  const from = fromMin as number;
  const to = toMin as number;
  if (!(from >= 0 && from < to && to <= 1440)) return fail("BAD_INPUT", R.BAD);
  // 6. บริการ/ช่างของหน่วยนี้
  const serviceId = idOf(x.serviceId);
  const staffId = x.staffId === null || x.staffId === undefined || x.staffId === "" ? null : idOf(x.staffId);
  if (!serviceId || (x.staffId !== null && x.staffId !== undefined && x.staffId !== "" && !staffId)) return fail("NOT_FOUND", R.NF);
  const db = tenantDb(ctx);
  const svc = await db.bookingService.findFirst({ where: { id: serviceId, tenantId: ctx.tenantId, unitId: ctx.unitId, active: true, bookable: true }, select: { id: true } });
  if (!svc) return fail("NOT_FOUND", R.NF);
  if (staffId) {
    const st = await db.bookingStaff.findFirst({ where: { id: staffId, tenantId: ctx.tenantId, unitId: ctx.unitId, active: true }, select: { id: true } });
    if (!st) return fail("NOT_FOUND", R.NF);
    const cc = await resolveSettings({ tenantId: ctx.tenantId }, ["booking.staff.customerCanChoose"], { unitId: ctx.unitId, staffId });
    if (cc["booking.staff.customerCanChoose"]?.value === false) return fail("NOT_FOUND", R.NF);
  }
  // 7. ไม่มาซ้ำแบบต้องโทรจอง (บังคับมัดจำยังเข้าได้ — จ่ายตอนจองจริง)
  if ((await repeatNoShowOf(ctx, { channel: "LINE", partyId }, { now })).action === "PHONE_ONLY") return fail("REPEAT_NO_SHOW", REPEAT_NO_SHOW_REASON);
  // 8. มีเวลาว่างในหน้าต่างอยู่แล้ว ⇒ ให้จองเลย (R8)
  const free = await findSlots(ctx, { serviceId, staffId, dateStr, channel: "LINE" }, { now });
  if (free.some((s) => s.startMin >= from && s.startMin < to)) return fail("HAS_FREE", R.HAS_FREE);
  // 9. ใต้ล็อกของ Party: ซ้ำ ⇒ แถวเดิม · เพดาน · INSERT
  const mv = set[K.maxActive]?.value;
  const maxActive = typeof mv === "number" && Number.isInteger(mv) && mv >= 1 ? mv : 1;
  const expiresAt = localToUtc(dateStr, to);
  type Out = { kind: "ok"; id: string; dup: boolean; expiresAt: Date } | { kind: "limit" };
  let out: Out | null = null;
  for (let attempt = 0; attempt < 2 && out === null; attempt++) {
    try {
      out = await db.$transaction(async (tx): Promise<Out> => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`booking:wl:${ctx.tenantId}:${ctx.unitId}:${partyId}`}, 0))`;
        const prior = await tx.bookingWaitlist.findFirst({
          where: { tenantId: ctx.tenantId, unitId: ctx.unitId, partyId, serviceId, staffId, dateStr, status: "ACTIVE" },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: { id: true, expiresAt: true },
        });
        if (prior) return { kind: "ok", id: prior.id, dup: true, expiresAt: prior.expiresAt };
        const n = await tx.bookingWaitlist.count({ where: { tenantId: ctx.tenantId, unitId: ctx.unitId, partyId, status: "ACTIVE" } });
        if (n >= maxActive) return { kind: "limit" };
        const row = await tx.bookingWaitlist.create({
          data: { tenantId: ctx.tenantId, unitId: ctx.unitId, partyId, serviceId, staffId, dateStr, fromMin: from, toMin: to, status: "ACTIVE", expiresAt },
          select: { id: true, expiresAt: true },
        });
        return { kind: "ok", id: row.id, dup: false, expiresAt: row.expiresAt };
      }, TX);
    } catch (e) {
      if (!isRetryable(e)) throw e;
    }
  }
  if (out === null) return fail("BUSY", R.BUSY);
  if (out.kind === "limit") return fail("LIMIT", R.LIMIT);
  return { ok: true, entryId: out.id, duplicated: out.dup, expiresAt: out.expiresAt };
}

// ═════════════════════════ ออก waitlist ═════════════════════════
export async function leaveWaitlistOnline(
  ref: Ref,
  i: { entryId: string; who: string },
  opts?: { now?: Date; ip?: string },
): Promise<{ ok: true; duplicated: boolean } | { ok: false; code: "NOT_FOUND" | "RATE_LIMITED"; reason: string }> {
  const now = nowOf(opts);
  const rl = await checkRateLimitDb(`bq:wl:ip:${ipOf(opts?.ip)}`, WAITLIST_RATE.joinIp, now.getTime());
  if (!rl.ok) return fail("RATE_LIMITED", R.RATE);
  const tSlug = slugOf(ref?.tenantSlug);
  const uSlug = slugOf(ref?.unitSlug);
  const u = tSlug && uSlug ? await resolvePublicUnit(tSlug, uSlug, "BOOKING") : null;
  if (!u) return fail("NOT_FOUND", R.NF);
  const ctx: Ctx = { tenantId: u.tenant.id, unitId: u.unit.id };
  const x = (i && typeof i === "object" ? i : {}) as Record<string, unknown>;
  const partyId = await waitlistPartyOf(ctx.tenantId, x.who);
  const entryId = idOf(x.entryId);
  if (!partyId || !entryId) return fail("NOT_FOUND", R.NF);
  const db = tenantDb(ctx);
  const row = await db.bookingWaitlist.findFirst({ where: { id: entryId, tenantId: ctx.tenantId, unitId: ctx.unitId, partyId }, select: { status: true } });
  if (!row) return fail("NOT_FOUND", R.NF);
  if (row.status !== "ACTIVE") return { ok: true, duplicated: true };
  const n = await db.bookingWaitlist.updateMany({
    where: { id: entryId, tenantId: ctx.tenantId, unitId: ctx.unitId, partyId, status: "ACTIVE" },
    data: { status: "CANCELLED", endedAt: now, endReason: "CUSTOMER" },
  });
  return { ok: true, duplicated: n.count !== 1 };
}

// ═════════════════════════ หน้าจองขั้น 2 (§3.1 ข้อ 9) ═════════════════════════
/**
 * กล่อง waitlist ของวันที่ไม่มีเวลาว่างเลย — mode OFF ⇒ null (ผู้เรียกไม่ใส่คีย์ waitlist)
 *   canJoin = มีตัวตน LINE และไม่ติด PHONE_ONLY · joined = มี entry ACTIVE ตรงบริการ/ช่าง/วันนั้น
 */
export async function waitlistViewOf(ctx: Ctx, q: { serviceId: string; staffId: string | null; dateStr: string; who: unknown }, opts?: { now?: Date }): Promise<WaitlistView | null> {
  const mode = await waitlistModeOf(ctx);
  if (mode === "OFF") return null;
  const partyId = await waitlistPartyOf(ctx.tenantId, q.who);
  if (!partyId) return { mode, canJoin: false, joined: false };
  const db = tenantDb(ctx);
  const [rns, prior] = await Promise.all([
    repeatNoShowOf(ctx, { channel: "LINE", partyId }, { now: nowOf(opts) }),
    activeEntryOf(db, ctx, { partyId, serviceId: q.serviceId, staffId: q.staffId, dateStr: q.dateStr }),
  ]);
  return { mode, canJoin: rns.action !== "PHONE_ONLY", joined: !!prior };
}
