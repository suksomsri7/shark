// SVC B.7 — จองออนไลน์ 3 ขั้น (ภาพ จอง 03 ก ข ค) + ลิงก์จัดการนัดของลูกค้า (/bq/m/<token>)
// สัญญา: ledger/svc-briefs/svc-brief-b.7.md §3.2–§3.6 · แบบ: DESIGN-BOOKING-QUEUE.md R3 · §7 · ภาคผนวก ก #4 #10 #19–36
//
// 🔴 ไฟล์นี้ไม่ import prisma ดิบ (F5): หาร้านจาก slug (core/storefront) หรือจาก hash ของ token (service.appointmentByManageHash) แล้วใช้ tenantDb
// 🔴 X1: ทุกคิวรีผูก tenantId + unitId ของหน่วยที่ได้จาก slug/แถวนัด · บริการ/ช่างของหน่วยอื่น = ไม่พบ · คำตอบสาธารณะไม่มี id นัด
// 🔴 X7: token ลิงก์จัดการนัดใช้ไม่ได้ทุกกรณี ⇒ คำตอบเดียวกันทุกไบต์ (ตัวโหลด NOT_FOUND · ฟังก์ชันเขียน NOT_FOUND + R.NF · .ics null) ·
//        ลิงก์ตัวตน LINE ใช้ไม่ได้ทุกกรณี ⇒ เหมือนไม่ได้ส่งมา
// 🔴 X8: view/คำตอบ/payload event ไม่มีชื่อ/เบอร์/note ลูกค้า · ตัวตนจาก LINE แสดงชื่อ + เบอร์ปิด (maskPhone) เท่านั้น
// 🔴 กันจองซ้อน = ของ B.3 ทั้งหมด (bookAppointment · findSlots · rescheduleBySelf) — ไฟล์นี้ไม่มีตัวตรวจชน
// 🔴 rate limit = checkRateLimitDb (ข้ามเครื่อง) นับก่อนค้นฐาน · นโยบายร้านอ่านจากทะเบียนค่าตั้งทุกคำขอ · นาฬิกาเดียวต่อคำขอ (now ฉีดได้)
import { tenantDb } from "@/lib/core/db";
import { emitOutbox } from "@/lib/core/outbox";
import { checkRateLimitDb } from "@/lib/core/rate-limit-db";
import { getDef, resolveSettings, resolveSettingsMany } from "@/lib/core/settings";
import { signLink, verifyLink } from "@/lib/core/signed-link";
import { resolvePublicUnit } from "@/lib/core/storefront";
import { makeT } from "@/lib/i18n";
import { MANAGE_TOKEN_RE, manageToken, manageTokenHash, manageTokenMatches } from "./manage-token";
import { maskPhone } from "./privacy-shared";
import { addDaysStr, bkkDayOf } from "./planner-run";
import { casAppt, lockAppt, replan, runLineTx } from "./queue-line";
import {
  appointmentByManageHash,
  bookAppointment,
  depositFactsOf,
  depositForfeitPctOf,
  forfeitAfterLateCancel,
  withDepositSnap,
  memberExemptTierForIdentity,
  currentSelfPolicy,
  findSlots,
  getUnitHours,
  holdUntilOf,
  onlineRulesOf,
  rescheduleBySelf,
  selfChangeState,
  snapshotSelfPolicy,
  staffDayProfiles,
  type BookFailCode,
  type ManageRow,
  type SelfPolicy,
  type StaffDayProfile,
} from "./service";
import { computeDepositSatang, localToUtc, minutesToHHMM } from "./slots";
import { staffServiceTerms, unitDayWindows } from "./staff-hours";

const MIN_MS = 60_000;
const DAY_MS = 24 * 60 * MIN_MS;

// ───────────────────────── สัญญา (ใบสั่ง §3) ─────────────────────────
export type OnlineLocale = "th" | "en";
export type OnlineService = { id: string; name: string; durationMin: number; priceSatang: number; depositSatang: number };
export type OnlineStaff = { id: string; name: string };
export type OnlineDay = { dateStr: string; closed: boolean };
export type OnlineTime = { startMin: number; hhmm: string; free: boolean };
export type OnlinePolicy = SelfPolicy;
export type OnlineQuery = { svc?: string; staff?: string; date?: string; time?: string; who?: string; lang?: string };
export type OnlineBookingView = {
  tenantName: string; unitName: string; locale: OnlineLocale; locales: OnlineLocale[];
  identity: { name: string; phoneMasked: string } | null;
  step: 1 | 2 | 3;
  services: OnlineService[]; service: OnlineService | null;
  anyStaff: boolean; staff: OnlineStaff[]; staffSel: string | null;
  days: OnlineDay[]; dateSel: string | null;
  times: OnlineTime[]; timeSel: { startMin: number; hhmm: string } | null;
  summary: { startMs: number; endMs: number; staffName: string | null; priceSatang: number; depositSatang: number; payAtShopSatang: number; freeUntilMs: number } | null;
  policy: OnlinePolicy | null;
  extraField: { key: "MASSAGE_NOTE" | "SYMPTOM_OPTIONAL"; label: string } | null;
  /** เพิ่มจากสัญญา (U1 · ภาพ 03ก บรรทัดเวลาเปิดร้านใต้ชื่อ): เวลาทำการรายสัปดาห์ของสาขา (weekday 0 = อาทิตย์) */
  unitHours: { weekday: number; openMin: number; closeMin: number; closed: boolean }[];
  /** SVC B.8 ▸ V9: โหมดยกเลิกหลังเวลาฟรีของสาขา (ค่าตั้งปัจจุบัน = ค่าที่นัดจะจด) · ขั้น 1 = null ◂ */
  lateCancelMode?: "BLOCK" | "FORFEIT" | null;
};
export type OnlineBookInput = { serviceId: string; staffId: string | null; dateStr: string; startMin: number; name?: string; phone?: string; note?: string; idempotencyKey?: string; who?: string };
export type ManageStatus = "PENDING" | "CONFIRMED" | "LATE" | "ARRIVED" | "QUEUED" | "IN_SERVICE" | "DONE" | "CANCELLED" | "NO_SHOW";
export type ManageBlock = "LATE_CHANGE" | "MAX_RESCHEDULE" | "BAD_STATE" | null;
export type ManageView = {
  tenantName: string; unitName: string; locale: OnlineLocale;
  serviceName: string; staffName: string | null; anyStaff: boolean;
  startMs: number; endMs: number; status: ManageStatus; cancelReason: string | null;
  priceSatang: number; depositSatang: number; depositPaid: boolean; holdUntilMs: number | null;
  policy: OnlinePolicy; freeUntilMs: number; rescheduleCount: number; rescheduleLeft: number;
  canCancel: boolean; canReschedule: boolean; cancelBlock: ManageBlock; rescheduleBlock: ManageBlock;
  icsPath: string;
  /** anyStaff = เพิ่มจากสัญญา (ร้านเปิดตัวเลือก "ใครก็ได้" — ให้จอแสดงชิปได้ถูก) */
  reschedule: { staff: OnlineStaff[]; staffSel: string | null; days: OnlineDay[]; dateSel: string | null; times: OnlineTime[]; anyStaff: boolean } | null;
};
export type ManageFail = "NOT_FOUND" | "RATE_LIMITED" | "LATE_CHANGE" | "MAX_RESCHEDULE" | "BAD_STATE" | "LOST_RACE" | "BUSY"
  | "FULL" | "PAST" | "LEAD_TIME" | "BEYOND_HORIZON" | "OFF_GRID" | "OUTSIDE_HOURS" | "NOT_QUALIFIED" | "ON_LEAVE" | "BAD_INPUT"
  | "FORFEIT_CONFIRM_REQUIRED"; // SVC B.8 ▸ ยกเลิกช้าต้องกดยอมรับยอดที่ร้านเก็บ ◂

/** ค่าคงที่ความปลอดภัย (ไม่ใช่นโยบายร้าน · ใบสั่ง §3.6) */
export const ONLINE_RATE = {
  book: { limit: 10, windowMs: 60_000 },
  view: { limit: 60, windowMs: 60_000 },
  manageIp: { limit: 60, windowMs: 600_000 },
  manageToken: { limit: 10, windowMs: 600_000 },
} as const satisfies {
  book: { limit: 10; windowMs: 60000 }; view: { limit: 60; windowMs: 60000 }; manageIp: { limit: 60; windowMs: 600000 }; manageToken: { limit: 10; windowMs: 600000 };
};
/** O8: ถังต่อ IP ที่ไม่ผูก slug (slug ปลอมสลับไปมาไม่ทำให้ค้นฐานได้ไม่จำกัด) — ค่าคงที่ความปลอดภัย */
const IP_RATE = { view: { limit: 60, windowMs: 60_000 }, book: { limit: 20, windowMs: 60_000 } } as const;
/** ลิงก์จัดการนัดใช้ได้ถึงเวลานัด + 7 วัน (DESIGN §7 · ค่าคงที่ความปลอดภัย) */
const MANAGE_TTL_MS = 7 * DAY_MS;
const MAX_DAYS = 60;
const DAY_CONCURRENCY = 6;

const R = {
  /** X7: ข้อความเดียวทุกกรณีที่ลิงก์จัดการนัดใช้ไม่ได้ */
  NF: "ลิงก์นี้ใช้ไม่ได้แล้ว — กรุณาติดต่อร้าน",
  SHOP_NF: "ไม่พบร้านหรือสาขานี้",
  STAFF_NF: "ไม่พบช่างที่เลือก",
  RATE: "ทำรายการถี่เกินไป กรุณารอสักครู่แล้วลองใหม่",
  BAD_INPUT: "ข้อมูลการจองไม่ครบหรือไม่ถูกต้อง กรุณาลองใหม่",
  BAD_STATE: "นัดนี้เลื่อนหรือยกเลิกเองไม่ได้ในสถานะปัจจุบัน",
  LATE_CHANGE: "เลยเวลาที่เลื่อน/ยกเลิกเองได้แล้ว — กรุณาติดต่อร้าน",
  LOST_RACE: "นัดนี้เพิ่งถูกเปลี่ยน กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง",
  BUSY: "ระบบกำลังจัดคิวพร้อมกันหลายรายการ กรุณาลองใหม่อีกครั้ง",
} as const;

type Ctx = { tenantId: string; unitId: string };
type Ref = { tenantSlug: string; unitSlug: string };
const nowOf = (o?: { now?: Date }): Date => (o?.now instanceof Date && !Number.isNaN(o.now.getTime()) ? o.now : new Date());
const ipOf = (ip: unknown): string => (typeof ip === "string" && ip.trim() ? ip.trim().slice(0, 100) : "unknown");
const str = (v: unknown, max = 200): string | undefined => (typeof v === "string" && v.length <= max ? v : undefined);
const slugOf = (v: unknown): string => (typeof v === "string" ? v.trim().slice(0, 120) : "");
const nfView = () => ({ ok: false as const, code: "NOT_FOUND" as const });
const nfOp = () => ({ ok: false as const, code: "NOT_FOUND" as const, reason: R.NF });
const fail = <C extends string>(code: C, reason: string) => ({ ok: false as const, code, reason });

// ───────────────────────── ค่าตั้งของหน้า ─────────────────────────

async function localesOf(ctx: Ctx): Promise<OnlineLocale[]> {
  const r = await resolveSettings({ tenantId: ctx.tenantId }, ["booking.general.customerLocales"], { unitId: ctx.unitId });
  const v = r["booking.general.customerLocales"]?.value;
  const out = Array.isArray(v) ? [...new Set(v.filter((x): x is OnlineLocale => x === "th" || x === "en"))] : [];
  return out.length ? out : ["th"];
}
const pickLocale = (locales: OnlineLocale[], lang: unknown): OnlineLocale =>
  typeof lang === "string" && (locales as string[]).includes(lang) ? (lang as OnlineLocale) : locales[0];

type Svc = { id: string; name: string; durationMin: number; priceSatang: number; depositSatang: number; bufferMin: number; bookable: boolean };

/** มัดจำตามค่าตั้ง (วิธี ≠ NONE ⇒ สูตร computeDepositSatang ของ B.3 · รูปเสีย ⇒ 0) */
function depositOf(method: unknown, amount: unknown, i: { priceSatang: number; durationMin: number; serviceDepositSatang: number }): number {
  if (typeof method !== "string" || method === "NONE") return 0;
  try {
    return computeDepositSatang(amount ?? null, i);
  } catch {
    return 0;
  }
}

/** บริการที่ลูกค้าจองได้ (active + bookable) ของหน่วย เรียง sortOrder, createdAt, id + มัดจำตามค่าตั้ง (UNIT→SERVICE) */
async function servicesOf(ctx: Ctx): Promise<{ list: OnlineService[]; raw: Svc[] }> {
  const raw = await tenantDb(ctx).bookingService.findMany({
    where: { tenantId: ctx.tenantId, unitId: ctx.unitId, active: true, bookable: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: { id: true, name: true, durationMin: true, priceSatang: true, depositSatang: true, bufferMin: true, bookable: true },
  });
  if (!raw.length) return { list: [], raw: [] };
  const res = await resolveSettingsMany({ tenantId: ctx.tenantId }, ["booking.deposit.method", "booking.deposit.amount"], raw.map((s) => ({ unitId: ctx.unitId, serviceId: s.id })));
  const list = raw.map((s, i) => ({
    id: s.id, name: s.name, durationMin: s.durationMin, priceSatang: s.priceSatang,
    depositSatang: depositOf(res[i]?.["booking.deposit.method"]?.value, res[i]?.["booking.deposit.amount"]?.value, { priceSatang: s.priceSatang, durationMin: s.durationMin, serviceDepositSatang: s.depositSatang }),
  }));
  return { list, raw };
}

/** ตัวตนจากลิงก์เซ็น booking.identity (subject = partyId) ของร้านนี้ · Party ไม่ถูกรวม · ไม่ผ่านทุกกรณี ⇒ null */
async function identityOf(tenantId: string, who: unknown): Promise<{ partyId: string; name: string; phone: string } | null> {
  if (typeof who !== "string" || !who) return null;
  const v = verifyLink(who, "booking.identity");
  if (!v || v.tenantId !== tenantId) return null;
  const p = await tenantDb({ tenantId }).party.findFirst({
    where: { id: v.subjectId, tenantId, mergedIntoId: null },
    select: { id: true, name: true, phone: true },
  });
  if (!p || !p.name?.trim()) return null;
  // O2: Party ไม่มีเบอร์ที่จองได้ (ลูกค้า LINE ใหม่) ⇒ เหมือนไม่มีตัวตน (หน้าให้กรอกชื่อ/เบอร์เอง · จองช่อง ONLINE)
  const digits = (p.phone ?? "").replace(/\D/g, "");
  if (digits.length < 9) return null;
  return { partyId: p.id, name: p.name.trim(), phone: p.phone ?? "" };
}

/** ช่างที่ลูกค้าเลือกชื่อได้สำหรับบริการ: active · ทำบริการนี้ได้ · ออนไลน์ > 0% · customerCanChoose (เรียงแบบ B.3) */
async function pickableStaff(ctx: Ctx, svc: Svc, dayStr: string): Promise<{ list: OnlineStaff[]; profiles: StaffDayProfile[] }> {
  const profiles = await staffDayProfiles(ctx, dayStr);
  if (!profiles.length) return { list: [], profiles };
  const cc = await resolveSettingsMany({ tenantId: ctx.tenantId }, ["booking.staff.customerCanChoose"], profiles.map((p) => ({ unitId: ctx.unitId, staffId: p.staffId })));
  const list = profiles
    .filter((p, i) => !!staffServiceTerms(p.services, svc) && p.onlineSharePct > 0 && cc[i]?.["booking.staff.customerCanChoose"]?.value !== false)
    .map((p) => ({ id: p.staffId, name: p.name }));
  return { list, profiles };
}

async function mapLimit<T, U>(items: readonly T[], n: number, fn: (x: T) => Promise<U>): Promise<U[]> {
  const out: U[] = new Array(items.length);
  let k = 0;
  const run = async () => {
    while (k < items.length) {
      const i = k++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, run));
  return out;
}

/** ตารางเวลาของช่าง (ช่องทุก step ในหน้าต่าง · จบไม่เกินหน้าต่าง) ที่เริ่ม > now และ ≥ now + lead */
function gridOf(p: StaffDayProfile, svc: Svc, dateStr: string, step: number, earliestMs: number, nowMs: number): number[] {
  const terms = staffServiceTerms(p.services, svc);
  if (!terms || p.onLeave) return [];
  const out: number[] = [];
  for (const w of p.windows) {
    for (let t = Math.ceil(w.startMin / step) * step; t + terms.durationMin <= w.endMin; t += step) {
      const ms = localToUtc(dateStr, t).getTime();
      if (ms > nowMs && ms >= earliestMs) out.push(t);
    }
  }
  return out;
}

type StepTwo = {
  anyStaff: boolean; staff: OnlineStaff[]; staffSel: string | null; days: OnlineDay[]; dateSel: string | null; times: OnlineTime[];
  freeBy: Map<number, string>; dayProfiles: StaffDayProfile[]; rules: { horizonDays: number; minLeadMin: number; stepMin: number; anyStaff: boolean };
};

/**
 * ขั้น 2 (ช่าง · วัน · เวลา) ของบริการหนึ่ง — ใช้ทั้งหน้าจองและโหมดเลื่อนของหน้าจัดการนัด
 *   เวลา free = findSlots(ONLINE) ทุกตัว (ตัวเดียวกับที่ bookAppointment/rescheduleBySelf ตัดสิน) · ช่องที่ไม่ free = "เต็มแล้ว" (ไม่บอกเหตุผล)
 */
async function stepTwoOf(ctx: Ctx, svc: Svc, q: { staff?: unknown; date?: unknown }, now: Date, excludeAppointmentId?: string): Promise<StepTwo> {
  const nowMs = now.getTime();
  const today = bkkDayOf(nowMs);
  const rules = await onlineRulesOf(ctx, svc.id);
  const { list } = await pickableStaff(ctx, svc, today);
  const anyStaff = rules.anyStaff;
  const staffSel = q.staff === "any" && anyStaff ? "any" : typeof q.staff === "string" && list.some((s) => s.id === q.staff) ? q.staff : anyStaff ? "any" : null;
  const targets = staffSel === null ? [] : staffSel === "any" ? list.map((s) => s.id) : [staffSel];

  // วัน: วันนี้ … วันนี้ + horizon − 1 · ปิด = ร้านปิดทั้งวัน หรือไม่มีช่างเป้าหมายคนใดมีหน้าต่างเวลา
  const nDays = Math.max(0, Math.min(MAX_DAYS, Math.floor(rules.horizonDays)));
  const dates = Array.from({ length: nDays }, (_, i) => addDaysStr(today, i));
  const [hours, closures] = await Promise.all([
    getUnitHours(ctx.tenantId, ctx.unitId),
    dates.length ? tenantDb(ctx).bookingClosure.findMany({ where: { tenantId: ctx.tenantId, unitId: ctx.unitId, date: { in: dates } }, select: { date: true, closed: true, openMin: true, closeMin: true } }) : [],
  ]);
  const closureOf = new Map(closures.map((c) => [c.date, c]));
  const unitOpen = dates.map((ds) => unitDayWindows({ dateStr: ds, hours, closure: closureOf.get(ds) ?? null }).length > 0);
  const staffOpen = await mapLimit(dates, DAY_CONCURRENCY, async (ds) => {
    const i = dates.indexOf(ds);
    if (!unitOpen[i] || !targets.length) return false;
    const ps = await staffDayProfiles(ctx, ds, { staffIds: targets });
    return ps.some((p) => !p.onLeave && p.windows.length > 0 && !!staffServiceTerms(p.services, svc));
  });
  const days: OnlineDay[] = dates.map((ds, i) => ({ dateStr: ds, closed: !staffOpen[i] }));
  const dateSel = typeof q.date === "string" && days.some((d) => d.dateStr === q.date && !d.closed) ? q.date : (days.find((d) => !d.closed)?.dateStr ?? null);

  // เวลา: ตารางในหน้าต่างของช่างเป้าหมาย ∪ ช่องของ findSlots · free = findSlots ทุกตัว
  let times: OnlineTime[] = [];
  const freeBy: Map<number, string> = new Map();
  let dayProfiles: StaffDayProfile[] = [];
  if (dateSel && staffSel) {
    const [slots, ps] = await Promise.all([
      findSlots(ctx, { serviceId: svc.id, staffId: staffSel === "any" ? null : staffSel, dateStr: dateSel, channel: "ONLINE" }, { now, ...(excludeAppointmentId ? { excludeAppointmentId } : {}) }),
      staffDayProfiles(ctx, dateSel),
    ]);
    dayProfiles = ps;
    for (const s of slots) freeBy.set(s.startMin, s.staffId);
    const earliestMs = nowMs + rules.minLeadMin * MIN_MS;
    const grid = new Set<number>(freeBy.keys());
    for (const p of ps) if (targets.includes(p.staffId)) for (const t of gridOf(p, svc, dateSel, rules.stepMin, earliestMs, nowMs)) grid.add(t);
    times = [...grid].sort((a, b) => a - b).map((t) => ({ startMin: t, hhmm: minutesToHHMM(t), free: freeBy.has(t) }));
  }
  return { anyStaff, staff: list, staffSel, days, dateSel, times, freeBy, dayProfiles, rules };
}

const EXTRA_KEYS = new Set(["MASSAGE_NOTE", "SYMPTOM_OPTIONAL"]);
async function extraFieldOf(ctx: Ctx, serviceId: string, locale: OnlineLocale): Promise<OnlineBookingView["extraField"]> {
  const r = await resolveSettings({ tenantId: ctx.tenantId }, ["booking.booking.extraFields"], { unitId: ctx.unitId, serviceId });
  const v = r["booking.booking.extraFields"]?.value;
  if (typeof v !== "string" || !EXTRA_KEYS.has(v)) return null;
  const key = v as "MASSAGE_NOTE" | "SYMPTOM_OPTIONAL";
  const th = getDef("booking.booking.extraFields")?.enumLabelsTh?.[key] ?? key;
  return { key, label: locale === "en" ? makeT("en")(`bk7.extra.${key}`) : th };
}

// ═════════════════════════ หน้าจอง (§3.2) ═════════════════════════

export async function loadOnlineBooking(
  ref: Ref,
  q: OnlineQuery,
  opts?: { ip?: string; now?: Date },
): Promise<{ ok: true; view: OnlineBookingView } | { ok: false; code: "NOT_FOUND" | "RATE_LIMITED" }> {
  const now = nowOf(opts);
  const tSlug = slugOf(ref?.tenantSlug);
  const uSlug = slugOf(ref?.unitSlug);
  const rlIp = await checkRateLimitDb(`bq:view:ip:${ipOf(opts?.ip)}`, IP_RATE.view, now.getTime());
  const rl = await checkRateLimitDb(`bq:view:${tSlug}/${uSlug}:${ipOf(opts?.ip)}`, ONLINE_RATE.view, now.getTime());
  if (!rl.ok || !rlIp.ok) return { ok: false, code: "RATE_LIMITED" };
  if (!tSlug || !uSlug) return nfView();
  const u = await resolvePublicUnit(tSlug, uSlug, "BOOKING");
  if (!u) return nfView();
  const ctx: Ctx = { tenantId: u.tenant.id, unitId: u.unit.id };
  const qq = q && typeof q === "object" ? q : {};

  const [locales, svcs, ident, hours] = await Promise.all([localesOf(ctx), servicesOf(ctx), identityOf(ctx.tenantId, qq.who), getUnitHours(ctx.tenantId, ctx.unitId)]);
  const locale = pickLocale(locales, qq.lang);
  // SVC B.8 ▸ #37 ตัวตน LINE ที่ผูกสมาชิกระดับยกเว้น ⇒ มัดจำ 0 ทั้งการ์ดบริการและสรุป (ตัวตัดสินจริง = bookAppointment) ◂
  const exempt = ident ? await memberExemptTierForIdentity(ctx, { partyId: ident.partyId }) : null;
  if (exempt) svcs.list = svcs.list.map((x) => ({ ...x, depositSatang: 0 }));
  const svcArg = str(qq.svc);
  // svc = id บริการของหน่วยนี้ หรือชื่อบริการตรงตัว (ทางของฉากภาพ) · ไม่พบ/ไม่เปิดจอง/ของหน่วยอื่น ⇒ ขั้น 1
  let at = svcArg === undefined ? -1 : svcs.raw.findIndex((s) => s.id === svcArg);
  if (at < 0 && svcArg !== undefined) at = svcs.raw.findIndex((s) => s.name === svcArg);
  const base: OnlineBookingView = {
    tenantName: u.tenant.name, unitName: u.unit.name, locale, locales,
    identity: ident ? { name: ident.name, phoneMasked: maskPhone(ident.phone) } : null,
    step: 1, services: svcs.list, service: null,
    anyStaff: false, staff: [], staffSel: null, days: [], dateSel: null, times: [], timeSel: null,
    summary: null, policy: null, extraField: null,
    unitHours: hours.map((h) => ({ weekday: h.weekday, openMin: h.openMin, closeMin: h.closeMin, closed: h.closed })),
  };
  if (at < 0) return { ok: true, view: base };
  const raw = svcs.raw[at];
  const service = svcs.list[at];

  const two = await stepTwoOf(ctx, raw, { staff: str(qq.staff), date: str(qq.date, 10) }, now);
  const specific = two.staffSel && two.staffSel !== "any" ? two.staffSel : null;
  const [policy, extraField, lcm] = await Promise.all([
    currentSelfPolicy(ctx, { serviceId: raw.id, staffId: specific }),
    extraFieldOf(ctx, raw.id, locale),
    resolveSettings({ tenantId: ctx.tenantId }, ["booking.late.lateCancelMode"], { unitId: ctx.unitId }),
  ]);
  const view: OnlineBookingView = {
    ...base, step: 2, service, anyStaff: two.anyStaff, staff: two.staff, staffSel: two.staffSel,
    days: two.days, dateSel: two.dateSel, times: two.times, policy, extraField,
    lateCancelMode: lcm["booking.late.lateCancelMode"]?.value === "FORFEIT" ? "FORFEIT" : "BLOCK",
  };

  // ขั้น 3: เวลาเป็นช่อง free ของวันที่เลือก
  const tm = /^(\d{2}):(\d{2})$/.exec(str(qq.time, 5) ?? "");
  const tMin = tm ? Number(tm[1]) * 60 + Number(tm[2]) : -1;
  if (!two.dateSel || tMin < 0 || !two.freeBy.has(tMin)) return { ok: true, view };
  const sid = two.freeBy.get(tMin) as string;
  const p = two.dayProfiles.find((x) => x.staffId === sid);
  const terms = p ? staffServiceTerms(p.services, raw) : null;
  if (!p || !terms) return { ok: true, view };
  const dep = await resolveSettings({ tenantId: ctx.tenantId }, ["booking.deposit.method", "booking.deposit.amount"], { unitId: ctx.unitId, serviceId: raw.id, staffId: sid });
  const depositSatang = exempt ? 0 : depositOf(dep["booking.deposit.method"]?.value, dep["booking.deposit.amount"]?.value, { priceSatang: terms.priceSatang, durationMin: terms.durationMin, serviceDepositSatang: raw.depositSatang });
  const startMs = localToUtc(two.dateSel, tMin).getTime();
  return {
    ok: true,
    view: {
      ...view,
      step: 3,
      timeSel: { startMin: tMin, hhmm: minutesToHHMM(tMin) },
      summary: {
        startMs, endMs: startMs + terms.durationMin * MIN_MS, staffName: specific ? p.name : null,
        priceSatang: terms.priceSatang, depositSatang, payAtShopSatang: terms.priceSatang - depositSatang,
        freeUntilMs: startMs - policy.freeChangeBeforeMin * MIN_MS,
      },
    },
  };
}

// ═════════════════════════ จอง (§3.3) ═════════════════════════

/** ลิงก์ตัวตนของลูกค้า (B.9 ออกตอนตอบเมนู OA "จองคิว") — signLink purpose booking.identity · subject = partyId */
export function bookingIdentityToken(ctx: { tenantId: string }, partyId: string, ttlMin = 1440): string {
  return signLink({ tenantId: ctx.tenantId, purpose: "booking.identity", subjectId: partyId, expMin: ttlMin });
}

const urlOf = (id: string): string | null => {
  const t = manageToken(id);
  return t ? `/bq/m/${t}` : null;
};

export async function bookOnline(
  ref: Ref,
  i: OnlineBookInput,
  opts?: { ip?: string },
): Promise<{ ok: true; manageUrl: string | null; status: "PENDING" | "CONFIRMED"; startMs: number; holdUntilMs: number | null; depositSatang: number }
  | { ok: false; code: BookFailCode | "RATE_LIMITED"; reason: string }> {
  const now = new Date();
  const tSlug = slugOf(ref?.tenantSlug);
  const uSlug = slugOf(ref?.unitSlug);
  const rlIp = await checkRateLimitDb(`bq:book:ip:${ipOf(opts?.ip)}`, IP_RATE.book, now.getTime());
  const rl = await checkRateLimitDb(`bq:book:${tSlug}/${uSlug}:${ipOf(opts?.ip)}`, ONLINE_RATE.book, now.getTime());
  if (!rl.ok || !rlIp.ok) return fail("RATE_LIMITED", R.RATE);
  const u = tSlug && uSlug ? await resolvePublicUnit(tSlug, uSlug, "BOOKING") : null;
  if (!u) return fail("NOT_FOUND", R.SHOP_NF);
  const ctx: Ctx = { tenantId: u.tenant.id, unitId: u.unit.id };

  // รูปข้อมูล
  const x = (i && typeof i === "object" ? i : {}) as Record<string, unknown>;
  const optStr = (v: unknown, max: number) => v === undefined || v === null || (typeof v === "string" && v.length <= max);
  if (typeof x.serviceId !== "string" || !x.serviceId || x.serviceId.length > 100
    || !(x.staffId === null || (typeof x.staffId === "string" && x.staffId.length > 0 && x.staffId.length <= 100))
    || typeof x.dateStr !== "string" || x.dateStr.length > 10 || typeof x.startMin !== "number"
    || !optStr(x.note, 300) || !optStr(x.name, 80) || !optStr(x.phone, 20) || !optStr(x.idempotencyKey, 100) || !optStr(x.who, 4096)) {
    return fail("BAD_INPUT", R.BAD_INPUT);
  }
  const staffId = x.staffId as string | null;

  // ช่างที่ระบุต้องเป็นของหน่วยนี้และลูกค้าเลือกชื่อได้
  if (staffId !== null) {
    const st = await tenantDb(ctx).bookingStaff.findFirst({ where: { id: staffId, tenantId: ctx.tenantId, unitId: ctx.unitId, active: true }, select: { id: true } });
    if (!st) return fail("NOT_FOUND", R.STAFF_NF);
    const cc = await resolveSettings({ tenantId: ctx.tenantId }, ["booking.staff.customerCanChoose"], { unitId: ctx.unitId, staffId });
    if (cc["booking.staff.customerCanChoose"]?.value === false) return fail("NOT_FOUND", R.STAFF_NF);
  }

  // ตัวตน: ลิงก์ LINE ผ่าน ⇒ ชื่อ/เบอร์ของ Party (ละค่าที่ส่งมา) + ช่อง LINE + partyId · ไม่ผ่าน ⇒ เหมือนไม่ได้ส่ง
  const ident = await identityOf(ctx.tenantId, x.who);
  const note = typeof x.note === "string" && x.note.trim() ? x.note.trim() : undefined;
  const r = await bookAppointment(ctx, {
    serviceId: x.serviceId,
    staffId,
    dateStr: x.dateStr,
    startMin: x.startMin,
    channel: ident ? "LINE" : "ONLINE",
    customerName: ident ? ident.name : typeof x.name === "string" ? x.name : "",
    customerPhone: ident ? ident.phone : typeof x.phone === "string" ? x.phone : "",
    ...(note ? { note } : {}),
    ...(typeof x.idempotencyKey === "string" && x.idempotencyKey.trim() ? { idempotencyKey: x.idempotencyKey } : {}),
    ...(ident ? { partyId: ident.partyId } : {}),
  });
  if (!r.ok) return fail(r.code, r.reason);
  const row = await tenantDb(ctx).appointment.findFirst({ where: { id: r.id, tenantId: ctx.tenantId, unitId: ctx.unitId }, select: { startAt: true, depositSatang: true, channel: true } });
  const startMs = row ? row.startAt.getTime() : localToUtc(x.dateStr, x.startMin).getTime();
  // นัดของวันนี้ในหน่วยแถวเดียว ⇒ วางคิวใหม่หลัง commit (หน่วยอื่น runPlanner ไม่เขียนอะไร)
  if (bkkDayOf(startMs) === bkkDayOf(now.getTime())) await replan(ctx, now);
  return {
    ok: true,
    // O4: ส่งซ้ำด้วย key ของนัดช่องอื่น (พนักงาน/โทร) ⇒ ไม่คืนลิงก์จัดการนัด
    manageUrl: row?.channel === "ONLINE" || row?.channel === "LINE" ? urlOf(r.id) : null,
    status: r.status,
    startMs,
    holdUntilMs: r.holdUntil ? r.holdUntil.getTime() : null,
    depositSatang: row?.depositSatang ?? 0,
  };
}

// ═════════════════════════ ลิงก์จัดการนัด (§3.4) ═════════════════════════

/** ทางพนักงาน/B.9: ลิงก์ของนัด BOOKED ของ ctx (ตั้ง hash ถ้ายังว่าง · CAS) · walk-in/ไม่พบ/ร้านอื่น/ไม่มีกุญแจ ⇒ null */
export async function manageLinkFor(ctx: { tenantId: string; unitId: string }, appointmentId: string): Promise<string | null> {
  if (!ctx || typeof ctx.tenantId !== "string" || typeof ctx.unitId !== "string" || !ctx.tenantId || !ctx.unitId) return null;
  if (typeof appointmentId !== "string" || !appointmentId) return null;
  const token = manageToken(appointmentId);
  if (!token) return null;
  const db = tenantDb(ctx);
  const a = await db.appointment.findFirst({ where: { id: appointmentId, tenantId: ctx.tenantId, unitId: ctx.unitId, kind: "BOOKED" }, select: { id: true, manageTokenHash: true } });
  if (!a) return null;
  const hash = manageTokenHash(token);
  if (a.manageTokenHash === hash) return `/bq/m/${token}`;
  if (a.manageTokenHash !== null) return null; // hash ของกุญแจเดิม (หมุน SESSION_SECRET) — ไม่ทับ
  const w = await db.appointment.updateMany({ where: { id: a.id, tenantId: ctx.tenantId, unitId: ctx.unitId, manageTokenHash: null }, data: { manageTokenHash: hash } });
  if (w.count === 1) return `/bq/m/${token}`;
  const again = await db.appointment.findFirst({ where: { id: a.id, tenantId: ctx.tenantId, unitId: ctx.unitId }, select: { manageTokenHash: true } });
  return again?.manageTokenHash === hash ? `/bq/m/${token}` : null;
}

type Managed = { row: ManageRow; ctx: Ctx; tenantName: string; unitName: string; token: string };

/** token → นัด (รูป 43 ตัว → hash → timing-safe → หน่วย BOOKING ACTIVE → อายุ ≤ เวลานัด + 7 วัน) · ใช้ไม่ได้ทุกกรณี ⇒ null */
async function resolveManage(token: unknown, now: Date): Promise<Managed | null> {
  if (typeof token !== "string" || !MANAGE_TOKEN_RE.test(token)) return null;
  const row = await appointmentByManageHash(manageTokenHash(token));
  if (!row || !manageTokenMatches(token, row.id)) return null;
  if (now.getTime() > row.startAt.getTime() + MANAGE_TTL_MS) return null;
  const ctx: Ctx = { tenantId: row.tenantId, unitId: row.unitId };
  const unit = await tenantDb(ctx).businessUnit.findFirst({
    where: { id: row.unitId, tenantId: row.tenantId, type: "BOOKING", status: "ACTIVE", tenant: { status: "ACTIVE" } },
    select: { name: true, tenant: { select: { name: true } } },
  });
  if (!unit) return null;
  return { row, ctx, tenantName: unit.tenant.name, unitName: unit.name, token };
}

const MANAGE_STATUSES = new Set<string>(["PENDING", "CONFIRMED", "LATE", "ARRIVED", "QUEUED", "IN_SERVICE", "DONE", "CANCELLED", "NO_SHOW"]);

/** ความยาวงานของนัด (ไม่รวม buffer): snapshot job.durationMin · แถวเก่า = endAt − bufferMin ของบริการ */
function jobMinOf(row: ManageRow, svcBufferMin: number): number {
  const j = row.policySnapshot && typeof row.policySnapshot === "object" ? (row.policySnapshot as { job?: { durationMin?: unknown } }).job : undefined;
  if (typeof j?.durationMin === "number" && Number.isFinite(j.durationMin)) return j.durationMin;
  return Math.max(0, Math.round((row.endAt.getTime() - row.startAt.getTime()) / MIN_MS) - svcBufferMin);
}

export async function loadManageView(
  token: unknown,
  opts?: { now?: Date; ip?: string; lang?: string; reschedule?: { date?: string; staff?: string } },
): Promise<{ ok: true; view: ManageView } | { ok: false; code: "NOT_FOUND" | "RATE_LIMITED" }> {
  const now = nowOf(opts);
  const rl = await checkRateLimitDb(`bq:manage:ip:${ipOf(opts?.ip)}`, ONLINE_RATE.manageIp, now.getTime());
  if (!rl.ok) return { ok: false, code: "RATE_LIMITED" };
  const m = await resolveManage(token, now);
  if (!m) return nfView();
  const { row, ctx } = m;
  const db = tenantDb(ctx);
  const staffShown = row.plannedStaffId ?? row.staffId;
  const [svc, staff, locales, policy] = await Promise.all([
    db.bookingService.findFirst({
      where: { id: row.serviceId, tenantId: ctx.tenantId, unitId: ctx.unitId },
      select: { id: true, name: true, durationMin: true, priceSatang: true, depositSatang: true, bufferMin: true, bookable: true, active: true },
    }),
    db.bookingStaff.findFirst({ where: { id: staffShown, tenantId: ctx.tenantId, unitId: ctx.unitId }, select: { name: true } }),
    localesOf(ctx),
    snapshotSelfPolicy(ctx, row),
  ]);
  if (!svc) return nfView();
  const st = selfChangeState(row, policy, now);
  const status = String(row.status);
  const canCancel = st.cancelBlock === null;
  const canReschedule = st.rescheduleBlock === null;
  const hold = holdUntilOf({ ...row, status });
  let reschedule: ManageView["reschedule"] = null;
  if (opts?.reschedule && canReschedule && svc.active && svc.bookable) {
    const two = await stepTwoOf(ctx, svc, { staff: str(opts.reschedule.staff), date: str(opts.reschedule.date, 10) }, now, row.id);
    reschedule = { staff: two.staff, staffSel: two.staffSel, days: two.days, dateSel: two.dateSel, times: two.times, anyStaff: two.anyStaff };
  }
  const startMs = row.startAt.getTime();
  return {
    ok: true,
    view: {
      tenantName: m.tenantName, unitName: m.unitName, locale: pickLocale(locales, opts?.lang),
      serviceName: svc.name, staffName: staff?.name ?? null, anyStaff: row.assignMode === "ANY",
      startMs, endMs: startMs + jobMinOf(row, svc.bufferMin) * MIN_MS,
      status: (MANAGE_STATUSES.has(status) ? status : "CANCELLED") as ManageStatus, cancelReason: row.cancelReason,
      priceSatang: row.priceSatang, depositSatang: row.depositSatang, depositPaid: row.depositPaidAt !== null, holdUntilMs: hold ? hold.getTime() : null,
      policy, freeUntilMs: st.freeUntilMs, rescheduleCount: row.rescheduleCount, rescheduleLeft: st.rescheduleLeft,
      canCancel, canReschedule, cancelBlock: st.cancelBlock, rescheduleBlock: st.rescheduleBlock,
      icsPath: `/bq/m/${m.token}/ics`,
      reschedule,
    },
  };
}

// ═════════════════════════ เลื่อน · ยกเลิก · ปฏิทิน (§3.5) ═════════════════════════

/** ถังต่อ IP (ทุกทาง) — นับก่อนแตะฐาน */
const ipGate = (ip: unknown, now: Date) => checkRateLimitDb(`bq:manage:ip:${ipOf(ip)}`, ONLINE_RATE.manageIp, now.getTime());
/** ถังต่อ token (เลื่อน · ยกเลิก) — คีย์มีแต่ hash 32 ตัวแรก (ไม่มี token ดิบ) */
const tokenGate = (token: string, now: Date) => checkRateLimitDb(`bq:manage:tk:${manageTokenHash(token).slice(0, 32)}`, ONLINE_RATE.manageToken, now.getTime());

export async function rescheduleOnline(
  token: unknown,
  to: { dateStr: string; startMin: number; staffId: string | null },
  opts?: { now?: Date; ip?: string },
): Promise<{ ok: true; startMs: number } | { ok: false; code: ManageFail; reason: string }> {
  const now = nowOf(opts);
  if (!(await ipGate(opts?.ip, now)).ok) return fail("RATE_LIMITED", R.RATE);
  const m = await resolveManage(token, now);
  if (!m) return nfOp();
  // ถังต่อ token นับเมื่อคำขอถูกตัดสินด้วยสถานะนัด (สถานะ/เวลาฟรี/เพดานเลื่อน) หรือก่อนเข้าล็อกเขียน (ดูรายงาน B.7: ข้อสอบ R-3)
  const r = await rescheduleBySelf(m.ctx, m.row.id, to, { now, charge: async () => (await tokenGate(m.token, now)).ok });
  if (!r.ok) return r.code === "NOT_FOUND" && r.reason === "ไม่พบนัดนี้" ? nfOp() : fail(r.code, r.reason);
  return { ok: true, startMs: r.startAt.getTime() };
}

export async function cancelOnline(token: unknown, opts?: { now?: Date; ip?: string; acceptForfeit?: boolean; acceptForfeitSatang?: number }): Promise<{ ok: true } | { ok: false; code: ManageFail; reason: string }> {
  const now = nowOf(opts);
  if (!(await ipGate(opts?.ip, now)).ok) return fail("RATE_LIMITED", R.RATE);
  const m = await resolveManage(token, now);
  if (!m) return nfOp();
  if (!(await tokenGate(m.token, now)).ok) return fail("RATE_LIMITED", R.RATE);
  const { row, ctx } = m;
  const policy = await snapshotSelfPolicy(ctx, row);
  const pre = selfChangeState(row, policy, now);
  // SVC B.8 ▸ §3.5 ยกเลิกช้า: เลยเวลาฟรี + snapshot lateCancelMode FORFEIT (ไม่มีคีย์ = BLOCK) ⇒ ต้องกดยอมรับยอดที่ร้านเก็บ (acceptForfeit) ·
  //   ยอมรับ ⇒ CANCELLED CUSTOMER_LATE + ริบหลัง commit · อื่นทั้งหมด = พฤติกรรม B.7 ◂
  const lateOk = pre.cancelBlock === "LATE_CHANGE" && lateCancelModeOf(row.policySnapshot) === "FORFEIT";
  if (pre.cancelBlock && !lateOk) return fail(pre.cancelBlock, R[pre.cancelBlock as "BAD_STATE" | "LATE_CHANGE"]);
  // V3 (สคบ.): ยอดที่ลูกค้ากดยอมรับผูกกับยอดริบ — ยอดตอนนี้สูงกว่าที่ยอมรับ ⇒ ถามใหม่พร้อมยอดใหม่ · ไม่ส่งยอด (API) = ยอมรับยอดตอนนี้
  const fcr = (keep: number) => fail("FORFEIT_CONFIRM_REQUIRED" as const, `ยกเลิกหลังเวลาฟรี ร้านจะเก็บมัดจำ ฿${(keep / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })} — กดยืนยันอีกครั้งเพื่อยกเลิกนัด`);
  const accRaw = opts?.acceptForfeitSatang;
  const acc = typeof accRaw === "number" && Number.isFinite(accRaw) && accRaw >= 0 ? Math.floor(accRaw) : null;
  const quote = lateOk ? await lateForfeitSatangOf(ctx, row.id) : 0;
  if (lateOk && (opts?.acceptForfeit !== true || (acc !== null && quote > acc))) return fcr(quote);
  const acceptSatang = acc ?? quote;
  const paidBefore = row.depositPaidAt !== null;

  type Out = { ok: true; paid?: boolean } | { ok: false; code: ManageFail; reason: string; requote?: true };
  const res = await runLineTx(async (tx): Promise<Out> => {
    const a = await lockAppt(tx, ctx, row.id); // ปล่อยช่องอย่างเดียว ⇒ ไม่ต้องล็อกช่าง
    if (!a || a.kind !== "BOOKED") return nfOp();
    const cur = await tx.appointment.findFirst({ where: { id: a.id, tenantId: ctx.tenantId, unitId: ctx.unitId }, select: { rescheduleCount: true, depositSatang: true, depositPaidAt: true } });
    if (!cur) return nfOp();
    const st = selfChangeState({ status: a.status, startAt: a.startAt, rescheduleCount: cur.rescheduleCount }, policy, now);
    if (st.cancelBlock && !(lateOk && st.cancelBlock === "LATE_CHANGE")) return fail(st.cancelBlock, R[st.cancelBlock as "BAD_STATE" | "LATE_CHANGE"]);
    const why = st.cancelBlock ? "CUSTOMER_LATE" : "CUSTOMER"; // SVC B.8
    // V2: ริบได้เฉพาะมัดจำที่จ่ายแล้ว ณ ตอน CAS ยกเลิก (อ่านใต้ล็อก) · เงินเข้าระหว่างถามยอด ⇒ ถามใหม่
    const paidNow = cur.depositPaidAt !== null;
    if (why === "CUSTOMER_LATE" && paidNow !== paidBefore) return { ok: false, code: "FORFEIT_CONFIRM_REQUIRED", reason: "", requote: true };
    const lateSnap = why === "CUSTOMER_LATE" ? { policySnapshot: withDepositSnap(a.policySnapshot, { late: { paid: paidNow, acceptSatang: paidNow ? acceptSatang : 0 } }) } : {};
    if (!(await casAppt(tx, ctx, a, { status: "CANCELLED", cancelReason: why, plannedStartAt: null, plannedStaffId: null, ...lateSnap }))) return fail("LOST_RACE", R.LOST_RACE);
    await emitOutbox(tx, {
      tenantId: ctx.tenantId, unitId: ctx.unitId, type: "booking.cancelled", idempotencyKey: `booking.cancelled#${a.id}`,
      payload: {
        appointmentId: a.id, unitId: a.unitId, staffId: a.staffId, kind: a.kind, channel: a.channel, serviceId: a.serviceId,
        reason: why, from: a.status, depositSatang: cur.depositSatang, depositPaid: paidNow,
        ...(why === "CUSTOMER_LATE" ? { acceptedForfeitSatang: paidNow ? acceptSatang : 0 } : {}),
      },
    });
    return { ok: true, paid: paidNow };
  });
  if (!res) return fail("BUSY", R.BUSY);
  if (!res.ok) return "requote" in res && res.requote ? fcr(await lateForfeitSatangOf(ctx, row.id)) : fail(res.code, res.reason);
  await replan(ctx, now);
  if (lateOk && res.paid && acceptSatang > 0) await forfeitAfterLateCancel(ctx.tenantId, ctx.unitId, row.id); // SVC B.8 ▸ หลัง commit (consumer booking.cancelled ทำซ้ำได้) ◂
  return { ok: true };
}

// ═════════ SVC B.8 ▸ ยกเลิกช้า + ทางเข้าลิงก์จัดการนัดของหน้าจ่ายมัดจำ (deposit.ts) — เพิ่มเท่านั้น ═════════
/** โหมดยกเลิกช้าของนัด = snapshot `booking.late.lateCancelMode` เท่านั้น (ไม่มีคีย์ = BLOCK · ไม่อ่านค่าตั้งปัจจุบัน) */
export function lateCancelModeOf(snap: unknown): "BLOCK" | "FORFEIT" {
  const v = snap && typeof snap === "object" ? (snap as { values?: Record<string, unknown> }).values?.["booking.late.lateCancelMode"] : undefined;
  return v === "FORFEIT" ? "FORFEIT" : "BLOCK";
}
/** ยอดที่ร้านจะเก็บถ้ายกเลิกช้าตอนนี้ = floor(คงเหลือใบรับ × forfeitPct / 100) · ยังไม่จ่าย/ไม่มีใบรับ POS/ไม่ริบ ⇒ 0 (นิยามเดียวของหน้าจ่ายและ cancelOnline · V14) */
export async function lateForfeitSatangOf(ctx: Ctx, appointmentId: string): Promise<number> {
  const f = await depositFactsOf(ctx, appointmentId);
  if (!f || !f.appt.depositPaidAt) return 0;
  const left = f.dep ? Math.max(0, f.dep.amountSatang - f.dep.usedSatang - f.dep.refundedSatang) : 0;
  const pct = left > 0 ? await depositForfeitPctOf(ctx.tenantId, ctx.unitId, appointmentId) : null;
  return pct === null ? 0 : Math.floor((left * pct) / 100);
}
export { resolveManage as resolveManageToken, ipGate as manageIpGate, tokenGate as manageTokenGate };

// .ics (RFC 5545): CRLF · พับบรรทัด 75 ไบต์ · escape \ ; , ขึ้นบรรทัดใหม่
const icsEsc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const icsUtc = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
function icsFold(line: string): string {
  const parts: string[] = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const b = Buffer.byteLength(ch, "utf8");
    const cap = parts.length === 0 ? 75 : 74; // บรรทัดต่อมีช่องว่างนำ 1 ไบต์
    if (bytes + b > cap) {
      parts.push(cur);
      cur = "";
      bytes = 0;
    }
    cur += ch;
    bytes += b;
  }
  parts.push(cur);
  return parts.join("\r\n ");
}

export async function loadManageIcs(token: unknown, opts?: { now?: Date; ip?: string }): Promise<string | null> {
  const now = nowOf(opts);
  if (!(await ipGate(opts?.ip, now)).ok) return null;
  const m = await resolveManage(token, now);
  if (!m) return null;
  const { row, ctx } = m;
  const svc = await tenantDb(ctx).bookingService.findFirst({ where: { id: row.serviceId, tenantId: ctx.tenantId, unitId: ctx.unitId }, select: { name: true, bufferMin: true } });
  if (!svc) return null;
  const startMs = row.startAt.getTime();
  const endMs = startMs + jobMinOf(row, svc.bufferMin) * MIN_MS;
  const path = `/bq/m/${m.token}`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SHARK//Booking//TH",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:appt-${manageTokenHash(m.token).slice(0, 16)}@shark.in.th`,
    `DTSTAMP:${icsUtc(now.getTime())}`,
    `DTSTART:${icsUtc(startMs)}`,
    `DTEND:${icsUtc(endMs)}`,
    `SUMMARY:${icsEsc(`${svc.name} · ${m.unitName}`)}`,
    `LOCATION:${icsEsc(`${m.tenantName} · ${m.unitName}`)}`,
    `DESCRIPTION:${icsEsc(`เลื่อน/ยกเลิกนัด: ${path}`)}`,
    `SEQUENCE:${row.rescheduleCount}`,
    `STATUS:${String(row.status) === "CANCELLED" ? "CANCELLED" : "CONFIRMED"}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `${lines.map(icsFold).join("\r\n")}\r\n`;
}
