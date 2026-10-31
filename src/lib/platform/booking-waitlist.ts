// ─────────────────────────────────────────────────────────────
// platform/booking-waitlist.ts — waitlist "แจ้งฉันถ้ามีคนยกเลิก": จับคู่ช่องว่าง + ส่งข้อเสนอ · SVC B.17 · ใบสั่ง §3.3
//   onWaitlistEvent (consumer: booking.cancelled · booking.no_show · booking.rescheduled) · runWaitlistTick (minute-job booking.waitlist.tick)
//
// 🔴 ข้อเสนอไม่ใช่การจอง: ไม่ถือช่อง · ลิงก์พาไปหน้าจองเดิม (bookOnline → bookAppointment ทางเดียว · ใครจองก่อนได้ก่อน)
// 🔴 ส่งผ่าน notifyCustomer + precheck เท่านั้น (ช่องทาง/OA/เวลาเงียบ/optOut/dedupe อยู่ที่นั่น) · ไม่ข้ามเวลาเงียบ (R14)
// 🔴 ส่งครั้งเดียว: dedupeKey `booking:waitlistOpen:<entryId>:<staffId>:<m(slotStart)>` (id/ตัวเลขล้วน) — ไม่ทำตัวกันซ้ำเอง
// 🔴 ตัวจับคู่ใช้ข้อมูลสด (findSlots ช่อง LINE ณ now) ⇒ ครอบยกเลิกทางเดิมที่ไม่ยิง event + ส่งต่อหลังเวลาเงียบเอง
// 🔴 X1: consumer อ่านแถวนัดด้วย tenantId ของ event (ไม่เชื่อ unitId ใน payload) · ทุกคิวรีผูก tenantId (+ unitId) · tick รับ tenantIds
// 🔴 X8: ตารางไม่มีชื่อ/เบอร์ (อ่าน Party ตอนส่ง) · ไม่ log · ผลคืนเป็นตัวเลขล้วน · ข้อความถึงลูกค้ามีชื่อของเขาเองได้
// 🔴 งานรายนาที: keyset ทีละหน้าวนจนหมดงบ · เคารพ signal/deadline · หน่วยที่ล้มไม่บล็อกที่เหลือ · ไม่ throw ในทางปกติ
// ─────────────────────────────────────────────────────────────
import { prisma } from "@/lib/core/db";
import { bkkYmd } from "@/lib/core/quiet-hours";
import { resolveSettings } from "@/lib/core/settings";
import { bookingIdentityToken, findSlots, localToUtc, onlineRulesOf } from "@/lib/modules/booking";
import { bookingWhen } from "@/lib/platform/booking-notify";
import { notifyCustomer } from "@/lib/platform/notify-customer";

const K = { mode: "booking.booking.waitlistMode", maxActive: "booking.booking.waitlistMaxActive", enabled: "booking.msg.enabled", hideService: "booking.notify.hideServiceName" } as const;
const MIN_MS = 60_000;
const DEFAULT_PAGE = 50;
const MAX_PAGES = 200;
/** แถว log ของช่องที่ "ถือช่องนั้นอยู่" ในโหมด FIRST (ส่งแล้ว/กำลังส่ง/รอพ้นเวลาเงียบ/ลองใหม่ได้) */
const HOLDS_SLOT = ["SENT", "SENDING", "SKIPPED_QUIET", "FAILED"];
/** แถวสถานะจบ (ไม่ลองซ้ำ) — คีย์นี้ถือว่า "เสนอแล้ว" ต่อ entry */
const isFinal = (s: string) => s === "SENT" || s === "SKIPPED_CONSENT" || s === "NO_CHANNEL" || s === "QUOTA" || s.startsWith("SKIPPED_PRECHECK_");

type Entry = { id: string; tenantId: string; unitId: string; partyId: string; serviceId: string; staffId: string | null; dateStr: string; fromMin: number; toMin: number; expiresAt: Date; createdAt: Date };
type Offer = { startMin: number; staffId: string; ms: number; key: string };
type Ctl = { signal?: AbortSignal; deadline?: number };

const validNow = (d: unknown): Date => (d instanceof Date && !Number.isNaN(d.getTime()) ? d : new Date());
const stop = (c: Ctl): boolean => !!c.signal?.aborted || (typeof c.deadline === "number" && Date.now() >= c.deadline);
const pad2 = (n: number) => String(n).padStart(2, "0");
const hhmm = (min: number) => `${pad2(Math.floor(min / 60))}:${pad2(min % 60)}`;
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** origin ของแอปสำหรับลิงก์เต็ม (APP_URL → NEXT_PUBLIC_APP_URL) · ไม่มี/ผิดรูป ⇒ "" (path สัมพัทธ์) — แบบ booking-notify */
function appOrigin(): string {
  for (const raw of [process.env.APP_URL, process.env.NEXT_PUBLIC_APP_URL]) {
    if (typeof raw !== "string" || !raw.trim()) continue;
    try {
      const u = new URL(raw.trim());
      if (u.protocol === "https:" || u.protocol === "http:") return u.origin;
    } catch {
      /* ค่าเพี้ยน — ลองตัวถัดไป */
    }
  }
  return "";
}

const dayRange = (dateStr: string) => ({ gte: localToUtc(dateStr, 0), lt: localToUtc(dateStr, 24 * 60) });

/** Party มีนัดในหน่วย/วัน/บริการนั้น (ยังไม่ยกเลิก/ไม่มา) ที่สร้างหลัง entry ⇒ จองแล้ว */
async function bookedAfter(e: Entry): Promise<boolean> {
  const a = await prisma.appointment.findFirst({
    where: {
      tenantId: e.tenantId, unitId: e.unitId, partyId: e.partyId, serviceId: e.serviceId, startAt: dayRange(e.dateStr),
      status: { notIn: ["CANCELLED", "NO_SHOW"] }, createdAt: { gt: e.createdAt },
    },
    select: { id: true },
  });
  return !!a;
}

/** ปิด entry ก่อนส่ง (§3.3 ข้อ 2) · CAS สถานะ ACTIVE ⇒ ปิดครั้งเดียว · คืน true = ปิดแล้ว (ไม่ส่ง) */
async function closeIfEnded(e: Entry, now: Date): Promise<boolean> {
  if (e.expiresAt.getTime() <= now.getTime()) {
    await prisma.bookingWaitlist.updateMany({ where: { id: e.id, tenantId: e.tenantId, status: "ACTIVE" }, data: { status: "EXPIRED", endedAt: now, endReason: "EXPIRED" } });
    return true;
  }
  if (await bookedAfter(e)) {
    await prisma.bookingWaitlist.updateMany({ where: { id: e.id, tenantId: e.tenantId, status: "ACTIVE" }, data: { status: "BOOKED", endedAt: now, endReason: "BOOKED" } });
    return true;
  }
  return false;
}

/** ข้อเสนอของ entry: เวลาเริ่มที่ว่าง (findSlots ช่อง LINE) ใน [fromMin, toMin) แบ่งเป็นช่วงติดกันตามกริด · ช่วงละ 1 = เวลาแรก + ช่างของเวลานั้น */
async function offersOf(e: Entry, now: Date, step: number): Promise<Offer[]> {
  const ctx = { tenantId: e.tenantId, unitId: e.unitId };
  const slots = (await findSlots(ctx, { serviceId: e.serviceId, staffId: e.staffId, dateStr: e.dateStr, channel: "LINE" }, { now }))
    .filter((s) => s.startMin >= e.fromMin && s.startMin < e.toMin)
    .sort((a, b) => a.startMin - b.startMin);
  const out: Offer[] = [];
  let prev = Number.NEGATIVE_INFINITY;
  for (const s of slots) {
    if (s.startMin !== prev + step) {
      const ms = localToUtc(e.dateStr, s.startMin).getTime();
      out.push({ startMin: s.startMin, staffId: s.staffId, ms, key: `booking:waitlistOpen:${e.id}:${s.staffId}:${Math.floor(ms / MIN_MS)}` });
    }
    prev = s.startMin;
  }
  return out;
}

type UnitInfo = { tenantSlug: string; unitSlug: string; unitName: string };
async function unitInfoOf(tenantId: string, unitId: string): Promise<UnitInfo | null> {
  const u = await prisma.businessUnit.findFirst({ where: { id: unitId, tenantId, type: "BOOKING" }, select: { slug: true, name: true, tenant: { select: { slug: true } } } });
  return u ? { tenantSlug: u.tenant.slug, unitSlug: u.slug, unitName: u.name } : null;
}

/**
 * ตัวจับคู่ของ (หน่วย, วัน) — หัวใจที่ใช้ร่วมทั้ง consumer และ tick (§3.3 ข้อ 1–5)
 *   OFF ⇒ ไม่ทำอะไร · ปิดข้อความ (msg.enabled.waitlistOpen === false) ⇒ ปิด entry ที่จบได้แต่ไม่ส่ง ·
 *   ต่อ entry ต่อรอบส่งได้ไม่เกิน 1 ครั้ง (ข้อเสนอแรกที่ยังไม่มีแถว log สถานะจบ) · FIRST: ช่องละ entry เดียว
 */
async function matchUnitDay(tenantId: string, unitId: string, dateStr: string, now: Date, ctl: Ctl = {}): Promise<{ scanned: number; sent: number }> {
  const res = { scanned: 0, sent: 0 };
  const S = await resolveSettings({ tenantId }, [K.mode, K.enabled, K.hideService], { unitId });
  const mode = S[K.mode]?.value;
  if (mode !== "ALL" && mode !== "FIRST") return res;
  const en = S[K.enabled]?.value;
  const msgOn = !(isRec(en) && en.waitlistOpen === false);
  const hideService = S[K.hideService]?.value === true;
  const info = await unitInfoOf(tenantId, unitId);
  if (!info) return res;
  const entries = await prisma.bookingWaitlist.findMany({
    where: { tenantId, unitId, dateStr, status: "ACTIVE" },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, tenantId: true, unitId: true, partyId: true, serviceId: true, staffId: true, dateStr: true, fromMin: true, toMin: true, expiresAt: true, createdAt: true },
  });
  const stepOf = new Map<string, number>();
  for (const e of entries as Entry[]) {
    if (stop(ctl)) break;
    res.scanned++;
    if (await closeIfEnded(e, now)) continue;
    if (!msgOn) continue;
    if (!stepOf.has(e.serviceId)) stepOf.set(e.serviceId, (await onlineRulesOf({ tenantId, unitId }, e.serviceId)).stepMin);
    const offers = await offersOf(e, now, stepOf.get(e.serviceId) as number);
    if (!offers.length) continue;
    const own = await prisma.serviceMessageLog.findMany({ where: { tenantId, dedupeKey: { in: offers.map((o) => o.key) } }, select: { dedupeKey: true, status: true } });
    const ownStatus = new Map(own.map((r) => [r.dedupeKey, r.status]));
    for (const o of offers) {
      const st = ownStatus.get(o.key);
      if (st !== undefined && isFinal(st)) continue; // เสนอช่วงนี้ไปแล้ว (ส่งได้หรือจบแบบไม่ได้ส่ง)
      if (mode === "FIRST" && st === undefined && (await slotHeldByOther(tenantId, unitId, o))) continue;
      const r = await offer(e, o, info, now, hideService);
      if (r === "SENT") res.sent++;
      break; // ต่อ entry ต่อรอบ ≤ 1 ครั้ง
    }
  }
  return res;
}

/** FIRST: ช่อง (หน่วย, ช่าง, นาที) มี entry อื่นถืออยู่แล้วหรือยัง (แถว log สถานะส่ง/กำลังส่ง/รอเวลาเงียบ/ลองใหม่) */
async function slotHeldByOther(tenantId: string, unitId: string, o: Offer): Promise<boolean> {
  const suffix = `:${o.staffId}:${Math.floor(o.ms / MIN_MS)}`;
  const rows = await prisma.serviceMessageLog.findMany({
    where: { tenantId, unitId, domain: "booking", messageKey: "waitlistOpen", status: { in: HOLDS_SLOT }, dedupeKey: { startsWith: "booking:waitlistOpen:", endsWith: suffix } },
    select: { dedupeKey: true },
    take: 5,
  });
  return rows.some((r) => r.dedupeKey !== o.key);
}

/** ส่งข้อเสนอหนึ่งรายการผ่าน notifyCustomer (precheck สด · ไม่ข้ามเวลาเงียบ) */
async function offer(e: Entry, o: Offer, info: UnitInfo, now: Date, hideService: boolean): Promise<string> {
  const [party, staff, svc] = await Promise.all([
    prisma.party.findFirst({ where: { id: e.partyId, tenantId: e.tenantId }, select: { id: true, name: true } }),
    prisma.bookingStaff.findFirst({ where: { id: o.staffId, tenantId: e.tenantId, unitId: e.unitId }, select: { name: true } }),
    prisma.bookingService.findFirst({ where: { id: e.serviceId, tenantId: e.tenantId, unitId: e.unitId }, select: { name: true } }),
  ]);
  if (!party) return "NO_PARTY";
  const time = hhmm(o.startMin);
  const qs = new URLSearchParams({ svc: e.serviceId, staff: o.staffId, date: e.dateStr, time, who: bookingIdentityToken({ tenantId: e.tenantId }, party.id) });
  const link = `${appOrigin()}/s/${encodeURIComponent(info.tenantSlug)}/${encodeURIComponent(info.unitSlug)}?${qs.toString()}`;
  const r = await notifyCustomer({ tenantId: e.tenantId }, {
    unitId: e.unitId,
    domain: "booking",
    messageKey: "waitlistOpen",
    partyId: party.id,
    vars: { ชื่อ: party.name ?? "", ร้าน: info.unitName, เวลา: bookingWhen(o.ms), ช่าง: staff?.name ?? "", บริการ: hideService ? "" : svc?.name ?? "", ลิงก์จอง: link },
    dedupeKey: o.key,
    at: now,
    precheck: async () => precheckOf(e, o, now),
  });
  return r.duplicate ? "DUP" : r.status;
}

/** ตรวจสดก่อนส่ง (§3.3 ข้อ 5): entry ยัง ACTIVE · ไม่หมดอายุ · ยังไม่ได้จอง · ช่องนั้นยังว่างสำหรับช่างนั้น */
async function precheckOf(e: Entry, o: Offer, now: Date): Promise<{ ok: true } | { ok: false; reason: string }> {
  const row = await prisma.bookingWaitlist.findFirst({ where: { id: e.id, tenantId: e.tenantId, unitId: e.unitId }, select: { status: true, expiresAt: true } });
  if (!row || row.status !== "ACTIVE" || row.expiresAt.getTime() <= now.getTime()) return { ok: false, reason: "ENDED" };
  if (await bookedAfter(e)) return { ok: false, reason: "ENDED" };
  const s = await findSlots({ tenantId: e.tenantId, unitId: e.unitId }, { serviceId: e.serviceId, staffId: o.staffId, dateStr: e.dateStr, channel: "LINE" }, { now });
  return s.some((x) => x.startMin === o.startMin) ? { ok: true } : { ok: false, reason: "SLOT_TAKEN" };
}

// ═════════════════════════ consumer (§3.3 ข้อ 6) ═════════════════════════
const TYPES = new Set(["booking.cancelled", "booking.no_show", "booking.rescheduled"]);

export async function onWaitlistEvent(evt: { id?: string; tenantId: string; type: string; unitId?: string | null; payload: unknown }, opts?: { now?: Date }): Promise<void> {
  try {
    if (!evt || typeof evt.tenantId !== "string" || !evt.tenantId || !TYPES.has(evt.type)) return;
    const p = isRec(evt.payload) ? evt.payload : {};
    const apptId = typeof p.appointmentId === "string" && p.appointmentId.length <= 200 ? p.appointmentId : "";
    if (!apptId) return;
    // X1: แถวนัดจากฐานด้วย tenantId ของ event — ไม่เชื่อ unitId ใน payload
    const a = await prisma.appointment.findFirst({ where: { id: apptId, tenantId: evt.tenantId }, select: { unitId: true, startAt: true } });
    if (!a) return;
    let at = a.startAt;
    if (evt.type === "booking.rescheduled") {
      const f = typeof p.fromStartAt === "string" ? new Date(p.fromStartAt) : null;
      if (!f || Number.isNaN(f.getTime())) return;
      at = f;
    }
    await matchUnitDay(evt.tenantId, a.unitId, bkkYmd(at), validNow(opts?.now));
  } catch {
    /* ข้อความ = ของแถม — consumer ไม่ทำให้ event ล้ม (tick รอบหลังจับคู่ใหม่จากข้อมูลสด) */
  }
}

// ═════════════════════════ minute-job (§3.3 ข้อ 7) ═════════════════════════
export async function runWaitlistTick(
  now: Date,
  opts?: { tenantIds?: string[]; signal?: AbortSignal; deadline?: number; pageSize?: number },
): Promise<{ expired: number; scanned: number; sent: number }> {
  const at = validNow(now);
  const out = { expired: 0, scanned: 0, sent: 0 };
  const ctl: Ctl = { signal: opts?.signal, deadline: opts?.deadline };
  if (stop(ctl)) return out;
  const tenantIds = Array.isArray(opts?.tenantIds) ? opts.tenantIds.filter((x): x is string => typeof x === "string" && !!x) : null;
  if (tenantIds && tenantIds.length === 0) return out;
  const ps = opts?.pageSize;
  const pageSize = typeof ps === "number" && Number.isInteger(ps) && ps >= 1 && ps <= 500 ? ps : DEFAULT_PAGE;
  const tWhere = tenantIds ? { tenantId: { in: tenantIds } } : {};

  // (ก) หมดอายุ — keyset (expiresAt, id) ทีละหน้าวนจนหมด
  let cur: { expiresAt: Date; id: string } | null = null;
  for (let page = 0; page < MAX_PAGES && !stop(ctl); page++) {
    const c: { expiresAt: Date; id: string } | null = cur;
    const rows: { id: string; tenantId: string; expiresAt: Date }[] = await prisma.bookingWaitlist.findMany({
      where: {
        ...tWhere, status: "ACTIVE", expiresAt: { lte: at },
        ...(c ? { OR: [{ expiresAt: { gt: c.expiresAt } }, { expiresAt: c.expiresAt, id: { gt: c.id } }] } : {}),
      },
      orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
      take: pageSize,
      select: { id: true, tenantId: true, expiresAt: true },
    });
    if (!rows.length) break;
    const n = await prisma.bookingWaitlist.updateMany({
      where: { id: { in: rows.map((r) => r.id) }, status: "ACTIVE", expiresAt: { lte: at } },
      data: { status: "EXPIRED", endedAt: at, endReason: "EXPIRED" },
    });
    out.expired += n.count;
    const last = rows[rows.length - 1];
    cur = { expiresAt: last.expiresAt, id: last.id };
    if (rows.length < pageSize) break;
  }

  // (ข) (หน่วย, วัน) ที่มี entry ACTIVE วันไทย ≥ วันนี้ — keyset (unitId, dateStr) วนจนหมดงบ · หน่วยที่ล้มไม่บล็อกที่เหลือ
  const today = bkkYmd(at);
  let key: { unitId: string; dateStr: string } | null = null;
  for (let page = 0; page < MAX_PAGES && !stop(ctl); page++) {
    const k: { unitId: string; dateStr: string } | null = key;
    const groups: { tenantId: string; unitId: string; dateStr: string }[] = await prisma.bookingWaitlist.findMany({
      where: {
        ...tWhere, status: "ACTIVE", dateStr: { gte: today },
        ...(k ? { OR: [{ unitId: { gt: k.unitId } }, { unitId: k.unitId, dateStr: { gt: k.dateStr } }] } : {}),
      },
      distinct: ["unitId", "dateStr"],
      orderBy: [{ unitId: "asc" }, { dateStr: "asc" }],
      take: pageSize,
      select: { tenantId: true, unitId: true, dateStr: true },
    });
    if (!groups.length) break;
    for (const g of groups) {
      if (stop(ctl)) break;
      try {
        const r = await matchUnitDay(g.tenantId, g.unitId, g.dateStr, at, ctl);
        out.scanned += r.scanned;
        out.sent += r.sent;
      } catch {
        /* D.17 F1: หน่วยที่ล้มไม่บล็อกที่เหลือ — รอบหลังลองใหม่จากข้อมูลสด */
      }
    }
    const last = groups[groups.length - 1];
    key = { unitId: last.unitId, dateStr: last.dateStr };
    if (groups.length < pageSize) break;
  }
  return out;
}
