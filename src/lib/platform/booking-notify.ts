// ─────────────────────────────────────────────────────────────
// platform/booking-notify.ts — ประตูเดียวของ "ข้อความจองคิว" ถึงลูกค้า (9 ชนิด + courseExpiry ที่ยังไม่ส่ง) · SVC B.9 · ใบสั่ง §3.1
//   notifyBooking (ตัดสินสถานะ/ผู้รับ/ตัวแปร → notifyCustomer) · runBookingNotifyTick (minute-job: เตือน · ใกล้ถึงคิว · ล่าช้า · ชวนกลับ)
//   onBookingNotifyEvent (consumer: ยืนยัน · ได้บัตร · เช็กอินแล้ว · ถึงคิว · ไม่มาตามนัด)
//
// 🔴 ส่งผ่าน notifyCustomer เท่านั้น (ช่องทาง/OA/เวลาเงียบ/optOut/dedupe อยู่ที่นั่น — ตัวเชื่อมสลับได้) · ไม่เรียกตัวส่ง LINE ตรง
// 🔴 นโยบายร้านอ่านจากทะเบียนค่าตั้งต่อคำขอ/ต่อหน่วย (ไม่แคชข้ามคำขอ) · ไม่ฝังตัวเลขนโยบาย
// 🔴 X1: ทุกคิวรีผูก tenantId (+ unitId ของ ctx) · tick รับ tenantIds
// 🔴 X8: dedupeKey ประกอบจาก id/ตัวเลขเท่านั้น · ไม่ log ชื่อ/เบอร์/ข้อความ · ผลคืนไม่มีเบอร์ (ข้อความถึงลูกค้ามีชื่อของเขาเองได้)
// 🔴 now ฉีดได้ทุกฟังก์ชัน · เวลาไทยผ่าน bkkParts (ไม่อ่านเวลาตามเครื่อง)
// 🔴 ไม่ throw ในทางปกติ — consumer ไม่ทำให้ event ล้ม (ข้อความ = ของแถม)
// ─────────────────────────────────────────────────────────────
import { prisma } from "@/lib/core/db";
import { bkkAt, bkkParts, bkkYmd, inQuietWindow } from "@/lib/core/quiet-hours";
import { resolveSettings, resolveSettingsMany } from "@/lib/core/settings";
import { loadTodayLine, ticketTokenFor, type TodayLineView } from "@/lib/modules/booking";
import { notifyCustomer, type NotifyButton } from "@/lib/platform/notify-customer";

export const BOOKING_MSG_KINDS = ["confirmation", "reminder", "checkedIn", "ticketIssued", "nearTurn", "yourTurn", "delayed", "noShowRebook", "rebookInvite", "courseExpiry"] as const;
export type BookingMsgKind = (typeof BOOKING_MSG_KINDS)[number];
export type BookingNotifyStatus =
  | "SENT" | "SKIPPED_CONSENT" | "SKIPPED_QUIET" | "NO_CHANNEL" | "FAILED" | "SENDING" // จาก notifyCustomer
  | "DISABLED" | "NOT_FOUND" | "BAD_STATE" | "NO_RECIPIENT"; // ตัดสินก่อนถึง notifyCustomer (ไม่เขียน log)
export type BookingNotifyOutcome = { kind: BookingMsgKind; status: BookingNotifyStatus; dedupeKey: string | null; duplicate: boolean; retryAt: Date | null };

type Ctx = { tenantId: string; unitId: string };

const MIN_MS = 60_000;
const DAY_MS = 24 * 60 * MIN_MS;
/** หน้าต่างส่งข้อความชวนกลับ (หลังครบกำหนด) — ค่าคงที่ของระบบ (เลยหน้าต่าง = ไม่ชวนแล้ว · ใบสั่ง §3.1.3) */
const REBOOK_WINDOW_MS = 7 * DAY_MS;
/** ชื่อระบบของ walk-in ที่ไม่ได้กรอกชื่อ (B.4) */
const SYS_NAME_WALKIN = "ลูกค้า walk-in";
const KIND_SET = new Set<string>(BOOKING_MSG_KINDS);
/** ข้อความที่ลูกค้ารอทันที ⇒ ข้ามเวลาเงียบ (ใบสั่ง §6 ข้อ 6) */
const BYPASS_QUIET = new Set<BookingMsgKind>(["confirmation", "checkedIn", "ticketIssued", "nearTurn", "yourTurn"]);
/** ผู้ดูภายในของตัวแจ้งเตือน — อ่านแผนสดอย่างเดียว (ไม่มีเบอร์เต็ม) */
const NOTIFY_VIEWER = { userId: "", access: { view: true, operate: false, checkIn: false, walkIn: false, runOwn: false, runAny: false, fullPhone: false } };

const validNow = (d: Date | undefined): Date => (d instanceof Date && !Number.isNaN(d.getTime()) ? d : new Date());
const okCtx = (c: Ctx | null | undefined): c is Ctx =>
  !!c && typeof c.tenantId === "string" && !!c.tenantId && typeof c.unitId === "string" && !!c.unitId;
const mOf = (d: Date) => Math.floor(d.getTime() / MIN_MS);
const pad2 = (n: number) => String(n).padStart(2, "0");
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

const WD_TH = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const MO_TH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
/** "HH:MM" เวลาไทย */
export function bookingHhmm(ms: number): string {
  const p = bkkParts(new Date(ms));
  return `${pad2(p.h)}:${pad2(p.mi)}`;
}
/** "ส. 31 ต.ค. 15:30" เวลาไทย */
export function bookingWhen(ms: number): string {
  const p = bkkParts(new Date(ms));
  const wd = new Date(Date.UTC(p.y, p.mo, p.day)).getUTCDay();
  return `${WD_TH[wd]} ${p.day} ${MO_TH[p.mo]} ${pad2(p.h)}:${pad2(p.mi)}`;
}

/** origin ของแอปสำหรับลิงก์เต็ม (APP_URL → NEXT_PUBLIC_APP_URL) · ไม่มี/ผิดรูป ⇒ "" (path สัมพัทธ์) */
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

// ───────────────────────── แถวนัด + ผู้รับ ─────────────────────────

const APPT_SELECT = {
  id: true, unitId: true, kind: true, status: true, startAt: true, createdAt: true, startedAt: true, doneAt: true, checkedInAt: true,
  partyId: true, customerName: true, staffId: true, plannedStaffId: true, plannedStartAt: true, queueTicketId: true, serviceId: true,
  policySnapshot: true, channel: true, service: { select: { name: true } },
} as const;
type ApptRow = {
  id: string; unitId: string; kind: string; status: string; startAt: Date; createdAt: Date; startedAt: Date | null; doneAt: Date | null; checkedInAt: Date | null;
  partyId: string | null; customerName: string; staffId: string; plannedStaffId: string | null; plannedStartAt: Date | null; queueTicketId: string | null;
  serviceId: string; policySnapshot: unknown; channel: string | null; service: { name: string } | null;
};

/** นัดในขอบเขต ctx (ร้าน + สาขา) · ไม่พบ ⇒ null */
export async function bookingApptOf(ctx: { tenantId: string; unitId?: string }, appointmentId: string): Promise<ApptRow | null> {
  if (!ctx?.tenantId || typeof appointmentId !== "string" || !appointmentId || appointmentId.length > 100) return null;
  const a = await prisma.appointment.findFirst({
    where: { id: appointmentId, tenantId: ctx.tenantId, ...(ctx.unitId ? { unitId: ctx.unitId } : {}) },
    select: APPT_SELECT,
  });
  return a ? ({ ...a, status: String(a.status) } as ApptRow) : null;
}

/**
 * ผู้ติดต่อ LINE ที่ผูกกับงานนี้ด้วยรหัส (§3.1.2 ข้อ 1) — ใหม่สุดก่อน (usedAt desc)
 * รหัส APPOINTMENT ของนัด หรือ QUEUE_TICKET ของบัตรใดของงานนี้ · ตัดผู้ติดต่อที่ผูก Party อื่นอยู่ (partyMismatch — สัญญา R0.7 ข้อ 3)
 */
export async function bookingLinkedContactIds(tenantId: string, appt: { id: string; partyId: string | null }): Promise<string[]> {
  const tks = await prisma.queueTicket.findMany({ where: { tenantId, refType: "APPOINTMENT", refId: appt.id }, select: { id: true } });
  const rows = await prisma.chatLinkCode.findMany({
    where: {
      tenantId,
      usedAt: { not: null },
      usedByChatContactId: { not: null },
      OR: [{ purpose: "APPOINTMENT", refId: appt.id }, ...(tks.length ? [{ purpose: "QUEUE_TICKET", refId: { in: tks.map((t) => t.id) } }] : [])],
    },
    orderBy: [{ usedAt: "desc" }, { id: "desc" }],
    select: { usedByChatContactId: true },
  });
  const ids = [...new Set(rows.map((r) => r.usedByChatContactId).filter((x): x is string => !!x))];
  if (!ids.length) return [];
  const contacts = await prisma.chatContact.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, partyId: true } });
  const byId = new Map(contacts.map((c) => [c.id, c]));
  return ids.filter((id) => {
    const c = byId.get(id);
    if (!c) return false;
    return !(c.partyId && appt.partyId && c.partyId !== appt.partyId);
  });
}

// ───────────────────────── ตัวแปรข้อความ ─────────────────────────

type TicketRow = { id: string; number: string; status: string; callCount: number };

/** ตัวแปรของข้อความ (ชื่อตาม templateVars ของ defs) — ไม่มีเบอร์ */
export async function bookingMsgVars(
  ctx: Ctx,
  a: ApptRow,
  tk: TicketRow | null,
  o: { line?: TodayLineView | null; hideService: boolean },
): Promise<Record<string, string>> {
  const staffId = a.plannedStaffId ?? a.staffId;
  const [unit, staff, token] = await Promise.all([
    prisma.businessUnit.findFirst({ where: { id: ctx.unitId, tenantId: ctx.tenantId }, select: { name: true } }),
    staffId ? prisma.bookingStaff.findFirst({ where: { id: staffId, tenantId: ctx.tenantId, unitId: ctx.unitId }, select: { name: true } }) : Promise.resolve(null),
    tk ? ticketTokenFor(ctx, tk.id) : Promise.resolve(null),
  ]);
  const line = o.line ?? null;
  const idx = line ? line.waiting.findIndex((j) => j.appointmentId === a.id) : -1;
  const job = line && idx >= 0 ? line.waiting[idx] : null;
  const walkIn = a.kind === "WALKIN";
  const plannedMs = job?.plannedStartMs ?? a.plannedStartAt?.getTime() ?? null;
  const whenMs = walkIn ? (plannedMs ?? a.startAt.getTime()) : a.startAt.getTime();
  const name = (a.customerName ?? "").trim();
  const vars: Record<string, string> = {
    ชื่อ: !name || name === SYS_NAME_WALKIN ? "ลูกค้า" : name,
    ร้าน: unit?.name ?? "",
    เวลา: bookingWhen(whenMs),
    ช่าง: job?.staffName ?? staff?.name ?? "",
    บริการ: o.hideService ? "" : (a.service?.name ?? ""),
    ลิงก์นัด: "", // หนี้ B.7 (ลิงก์จัดการนัด)
  };
  if (tk) {
    vars["เลขคิว"] = tk.number;
    vars["ลิงก์บัตร"] = token ? `${appOrigin()}/bq/t/${token}` : "";
  }
  if (line) vars["อีกกี่คิว"] = String(Math.max(0, idx));
  if (plannedMs !== null) vars["นาทีที่เลื่อน"] = String(Math.max(0, Math.round((plannedMs - a.startAt.getTime()) / MIN_MS)));
  return vars;
}

// ───────────────────────── notifyBooking ─────────────────────────

function stateOk(kind: BookingMsgKind, a: ApptRow, tk: TicketRow | null, now: Date, offsetMin: number | undefined): boolean {
  const booked = a.kind !== "WALKIN";
  const s = a.status;
  switch (kind) {
    case "confirmation":
      return booked && s === "CONFIRMED";
    case "reminder":
      return booked && s === "CONFIRMED" && a.startAt.getTime() > now.getTime() && typeof offsetMin === "number" && Number.isInteger(offsetMin) && offsetMin >= 1;
    case "checkedIn":
      return booked && (s === "ARRIVED" || s === "IN_SERVICE") && !!tk;
    case "ticketIssued":
      return !booked && (s === "QUEUED" || s === "ARRIVED") && !!tk;
    case "nearTurn":
      return (s === "ARRIVED" || s === "QUEUED") && !!tk && tk.status === "WAITING";
    case "yourTurn":
      return (s === "ARRIVED" || s === "QUEUED") && !!tk && tk.status === "CALLED";
    case "delayed":
      return booked && (s === "CONFIRMED" || s === "ARRIVED") && !a.startedAt;
    case "noShowRebook":
      return s === "NO_SHOW";
    case "rebookInvite":
      return s === "DONE";
    default:
      return false; // courseExpiry = เฟสคอร์ส (หนี้)
  }
}

function dedupeKeyOf(kind: BookingMsgKind, a: ApptRow, tk: TicketRow | null, offsetMin: number | undefined, callCount?: number): string {
  switch (kind) {
    case "confirmation":
      return `booking:confirmation:${a.id}:${mOf(a.startAt)}`;
    case "reminder":
      return `booking:reminder:${a.id}:${offsetMin}:${mOf(a.startAt)}`;
    case "checkedIn":
      return `booking:checkedIn:${a.id}:${tk?.id ?? ""}`;
    case "ticketIssued":
      return `booking:ticketIssued:${tk?.id ?? ""}`;
    case "nearTurn":
      return `booking:nearTurn:${tk?.id ?? ""}`;
    case "yourTurn":
      return `booking:yourTurn:${tk?.id ?? ""}:${callCount ?? tk?.callCount ?? 0}`;
    case "delayed":
      return `booking:delayed:${a.id}:${mOf(a.startAt)}`;
    case "noShowRebook":
      return `booking:noShowRebook:${a.id}`;
    default:
      return `booking:rebookInvite:${a.id}`;
  }
}

function buttonsOf(kind: BookingMsgKind, a: ApptRow, vars: Record<string, string>): NotifyButton[] {
  const live = vars["ลิงก์บัตร"] ?? "";
  switch (kind) {
    case "confirmation":
      return [{ label: "เลื่อนนัด", kind: "postback", data: `booking.reschedule?a=${a.id}` }];
    case "reminder":
      return [
        { label: "เช็กอินเมื่อถึงร้าน", kind: "postback", data: `booking.checkin?a=${a.id}` },
        { label: "ไปไม่ทัน · แจ้งร้าน", kind: "postback", data: `booking.late?a=${a.id}` },
      ];
    case "checkedIn":
    case "ticketIssued":
      return live.startsWith("https://") ? [{ label: "ดูคิวสด", kind: "uri", data: live }] : [];
    case "nearTurn":
      return a.kind === "WALKIN" ? [{ label: "ยังไม่พร้อม · เลื่อนไปคิวหลัง", kind: "postback", data: `booking.defer?a=${a.id}` }] : [];
    default:
      return [];
  }
}

const outcome = (kind: BookingMsgKind, status: BookingNotifyStatus): BookingNotifyOutcome => ({ kind, status, dedupeKey: null, duplicate: false, retryAt: null });

/** ตัวใน (tick ส่งแผนสดที่โหลดแล้วมาให้ — ไม่โหลดซ้ำต่อข้อความ) */
async function notifyBookingWith(
  ctx: Ctx,
  i: { appointmentId: string; kind: BookingMsgKind; offsetMin?: number },
  now: Date,
  pre?: { line?: TodayLineView | null; callCount?: number },
): Promise<BookingNotifyOutcome> {
  const kind = (KIND_SET.has(String(i?.kind)) ? i.kind : "courseExpiry") as BookingMsgKind;
  if (!okCtx(ctx) || !KIND_SET.has(String(i?.kind))) return outcome(kind, !okCtx(ctx) ? "NOT_FOUND" : "BAD_STATE");
  try {
    // 1. นัดในขอบเขต ctx
    const a = await bookingApptOf(ctx, i.appointmentId);
    if (!a) return outcome(kind, "NOT_FOUND");
    // 2. เปิด/ปิดต่อชนิด (ตรวจก่อนสถานะ)
    const S = await resolveSettings({ tenantId: ctx.tenantId }, ["booking.msg.enabled", "booking.notify.hideServiceName"], { unitId: ctx.unitId });
    const en = S["booking.msg.enabled"]?.value;
    if (!isRec(en) || en[kind] !== true) return outcome(kind, "DISABLED");
    // 3. สถานะ
    const tk: TicketRow | null = a.queueTicketId
      ? await prisma.queueTicket
          .findFirst({ where: { id: a.queueTicketId, tenantId: ctx.tenantId, unitId: ctx.unitId }, select: { id: true, number: true, status: true, callCount: true } })
          .then((t) => (t ? { ...t, status: String(t.status) } : null))
      : null;
    if (!stateOk(kind, a, tk, now, i.offsetMin)) return outcome(kind, "BAD_STATE");
    // 4. ผู้รับ: ผูกด้วยรหัส → Party ของนัด
    const linked = await bookingLinkedContactIds(ctx.tenantId, a);
    const chatContactId = linked[0] ?? null;
    if (!chatContactId && !a.partyId) return outcome(kind, "NO_RECIPIENT");
    // 5. ตัวแปร + ปุ่ม → notifyCustomer
    const needLine = kind === "ticketIssued" || kind === "nearTurn" || kind === "delayed";
    const line = needLine ? (pre?.line !== undefined ? pre.line : await loadTodayLine(ctx, NOTIFY_VIEWER, { now })) : null;
    const vars = await bookingMsgVars(ctx, a, tk, { line, hideService: S["booking.notify.hideServiceName"]?.value === true });
    const buttons = buttonsOf(kind, a, vars);
    // N4: yourTurn ใช้ callCount ของ event (เรียกซ้ำ = รอบใหม่ · consumer ช้าแล้วถูกเรียกอีกรอบไม่กลืนรอบก่อน)
    const cc = typeof pre?.callCount === "number" && Number.isInteger(pre.callCount) && pre.callCount >= 0 ? pre.callCount : undefined;
    const dedupeKey = dedupeKeyOf(kind, a, tk, i.offsetMin, cc);
    const r = await notifyCustomer(
      { tenantId: ctx.tenantId },
      {
        unitId: ctx.unitId,
        domain: "booking",
        messageKey: kind,
        ...(chatContactId ? { chatContactId } : { partyId: a.partyId as string }),
        vars,
        ...(buttons.length ? { buttons } : {}),
        dedupeKey,
        at: now,
        bypassQuiet: BYPASS_QUIET.has(kind),
      },
    );
    return { kind, status: r.status, dedupeKey, duplicate: r.duplicate === true, retryAt: r.retryAt ?? null };
  } catch (e) {
    console.error(`[booking.notify] ${kind} ล้ม`, e instanceof Error ? e.name : "error");
    return { kind, status: "FAILED", dedupeKey: null, duplicate: false, retryAt: null };
  }
}

export async function notifyBooking(
  ctx: { tenantId: string; unitId: string },
  i: { appointmentId: string; kind: BookingMsgKind; offsetMin?: number },
  opts?: { now?: Date },
): Promise<BookingNotifyOutcome> {
  return notifyBookingWith(ctx, i, validNow(opts?.now));
}

// ───────────────────────── tick (minute-job) ─────────────────────────
// N2 (รีวิว B.9): เคารพงบของรอบ (signal/deadline) · หมุนลำดับร้านตามนาที (ร้านท้ายแถวไม่อดตลอด) · ข้ามชนิดที่เคารพเวลาเงียบ
//   ขณะอยู่ในเวลาเงียบ (ไม่ claim ซ้ำทุกนาที) · กรอง dedupeKey ที่จบแล้วด้วยคิวรีเดียวก่อนเรียก notifyBooking ·
//   ชวนกลับรอบละ REBOOK_EVERY_MIN นาที · โหลดแผนสดเฉพาะหน่วยที่มีงานในร้านวันนี้

const TICK_KEYS = [
  "booking.queue.singleLine",
  "booking.msg.enabled",
  "booking.notify.reminderOffsetsMin",
  "booking.notify.nearTurnAhead",
  "booking.notify.delayAlertMin",
  "messaging.quietHours",
];
/** ชวนกลับไม่ต้องรายนาที (หน้าต่างส่ง 7 วัน) — ค่าคงที่ของระบบ */
const REBOOK_EVERY_MIN = 15;
/** สถานะแถว log ที่ "จบแล้ว" (notifyCustomer ไม่ส่งซ้ำ) — กรองก่อนเรียกเพื่อไม่ไล่ทั้งก้อนทุกนาที */
const FINAL_LOG = ["SENT", "SKIPPED_CONSENT", "NO_CHANNEL", "QUOTA"];
const IN_SHOP_TODAY = ["ARRIVED", "QUEUED", "IN_SERVICE"] as const;

const sentNew = (r: BookingNotifyOutcome) => r.status === "SENT" && !r.duplicate;
type TickCtl = { signal?: AbortSignal; deadline?: number };
const outOfBudget = (c: TickCtl) => c.signal?.aborted === true || (typeof c.deadline === "number" && Date.now() >= c.deadline);

/** dedupeKey ที่จบแล้วของร้าน (คิวรีเดียว) */
async function finishedKeys(tenantId: string, keys: string[]): Promise<Set<string>> {
  if (!keys.length) return new Set();
  const rows = await prisma.serviceMessageLog.findMany({ where: { tenantId, dedupeKey: { in: keys }, status: { in: FINAL_LOG } }, select: { dedupeKey: true } });
  return new Set(rows.map((r) => r.dedupeKey));
}

function quietNow(v: unknown, at: Date): boolean {
  if (!isRec(v) || typeof v.start !== "string" || typeof v.end !== "string") return false;
  return inQuietWindow(at, v.start, v.end);
}

export async function runBookingNotifyTick(
  now: Date,
  opts?: { tenantIds?: string[]; signal?: AbortSignal; deadline?: number },
): Promise<{ units: number; reminder: number; nearTurn: number; delayed: number; rebookInvite: number }> {
  const at = validNow(now);
  const ctl: TickCtl = { signal: opts?.signal, deadline: opts?.deadline };
  const out = { units: 0, reminder: 0, nearTurn: 0, delayed: 0, rebookInvite: 0 };
  const scoped = Array.isArray(opts?.tenantIds);
  const ids = scoped ? (opts!.tenantIds as unknown[]).filter((x): x is string => typeof x === "string" && !!x) : [];
  if (scoped && !ids.length) return out;
  const units = await prisma.businessUnit.findMany({
    where: { type: "BOOKING", ...(scoped ? { tenantId: { in: ids } } : {}) },
    select: { id: true, tenantId: true },
    orderBy: [{ tenantId: "asc" }, { id: "asc" }],
  });
  const byTenant = new Map<string, string[]>();
  for (const u of units) byTenant.set(u.tenantId, [...(byTenant.get(u.tenantId) ?? []), u.id]);
  const tenants = [...byTenant.keys()];
  const shift = tenants.length ? mOf(at) % tenants.length : 0;
  const order = [...tenants.slice(shift), ...tenants.slice(0, shift)];
  const rebookRound = mOf(at) % REBOOK_EVERY_MIN === 0;
  const dayStart = bkkAt(at, 0, 0, 0);
  const dayEnd = bkkAt(at, 0, 0, 1);

  for (const tenantId of order) {
    if (outOfBudget(ctl)) break;
    const unitIds = byTenant.get(tenantId) ?? [];
    let res: Awaited<ReturnType<typeof resolveSettingsMany>>;
    let busyUnits: Set<string>;
    try {
      res = await resolveSettingsMany({ tenantId }, TICK_KEYS, unitIds.map((unitId) => ({ unitId })));
      const live = await prisma.appointment.findMany({
        where: { tenantId, unitId: { in: unitIds }, status: { in: [...IN_SHOP_TODAY] }, startAt: { gte: new Date(dayStart.getTime() - DAY_MS), lt: dayEnd } },
        select: { unitId: true },
        distinct: ["unitId"],
      });
      busyUnits = new Set(live.map((r) => r.unitId));
    } catch (e) {
      console.error("[booking.notify.tick] อ่านค่าตั้งไม่สำเร็จ", e instanceof Error ? e.name : "error");
      continue;
    }
    for (const [ix, unitId] of unitIds.entries()) {
      if (outOfBudget(ctl)) break;
      const s = res[ix] ?? {};
      const en = isRec(s["booking.msg.enabled"]?.value) ? (s["booking.msg.enabled"].value as Record<string, unknown>) : {};
      const quiet = quietNow(s["messaging.quietHours"]?.value, at); // ชนิดที่เคารพเวลาเงียบรอรอบหลังเวลาเงียบ
      const ctx: Ctx = { tenantId, unitId };
      out.units++;
      try {
        if (en.reminder === true && !quiet) out.reminder += await tickReminders(ctx, at, s["booking.notify.reminderOffsetsMin"]?.value, ctl);
        const single = s["booking.queue.singleLine"]?.value === true;
        const aheadV = s["booking.notify.nearTurnAhead"]?.value;
        const delayV = s["booking.notify.delayAlertMin"]?.value;
        const wantNear = single && en.nearTurn === true && typeof aheadV === "number" && Number.isInteger(aheadV) && aheadV >= 0;
        const wantDelay = single && !quiet && en.delayed === true && typeof delayV === "number" && Number.isFinite(delayV) && delayV > 0;
        if ((wantNear || wantDelay) && busyUnits.has(unitId) && !outOfBudget(ctl)) {
          const line = await loadTodayLine(ctx, NOTIFY_VIEWER, { now: at });
          if (line) {
            if (wantNear) out.nearTurn += await tickNearTurn(ctx, at, line, aheadV as number, ctl);
            if (wantDelay) out.delayed += await tickDelayed(ctx, at, line, delayV as number, ctl);
          }
        }
        if (en.rebookInvite === true && !quiet && rebookRound && !outOfBudget(ctl)) out.rebookInvite += await tickRebook(ctx, at, ctl);
      } catch (e) {
        console.error(`[booking.notify.tick] unit=${unitId} ล้ม`, e instanceof Error ? e.name : "error");
      }
    }
  }
  return out;
}

/** reminder: นัด CONFIRMED ที่ now < startAt ≤ now + max(offsets) · ส่งเฉพาะ offset เล็กสุดที่ถึงกำหนดและจองก่อนจุดเตือน */
async function tickReminders(ctx: Ctx, now: Date, offsetsV: unknown, ctl: TickCtl): Promise<number> {
  const offsets = Array.isArray(offsetsV) ? offsetsV.filter((x): x is number => typeof x === "number" && Number.isInteger(x) && x >= 1) : [];
  if (!offsets.length) return 0;
  const maxMs = Math.max(...offsets) * MIN_MS;
  const nowMs = now.getTime();
  const rows = await prisma.appointment.findMany({
    where: { tenantId: ctx.tenantId, unitId: ctx.unitId, kind: "BOOKED", status: "CONFIRMED", startAt: { gt: now, lte: new Date(nowMs + maxMs) } },
    select: { id: true, startAt: true, createdAt: true },
    orderBy: [{ startAt: "asc" }, { id: "asc" }],
  });
  const due: { id: string; o: number; key: string }[] = [];
  for (const r of rows) {
    const ok = offsets.filter((o) => {
      const point = r.startAt.getTime() - o * MIN_MS;
      return point <= nowMs && r.createdAt.getTime() <= point;
    });
    if (!ok.length) continue;
    const o = Math.min(...ok);
    due.push({ id: r.id, o, key: `booking:reminder:${r.id}:${o}:${mOf(r.startAt)}` });
  }
  const done = await finishedKeys(ctx.tenantId, due.map((d) => d.key));
  let n = 0;
  for (const d of due) {
    if (done.has(d.key)) continue;
    if (outOfBudget(ctl)) break;
    if (sentNew(await notifyBookingWith(ctx, { appointmentId: d.id, kind: "reminder", offsetMin: d.o }, now))) n++;
  }
  return n;
}

/** nearTurn: งานในแถวรอที่บัตร WAITING และจำนวนงานข้างหน้า ≤ nearTurnAhead */
async function tickNearTurn(ctx: Ctx, now: Date, line: TodayLineView, ahead: number, ctl: TickCtl): Promise<number> {
  const cand = line.waiting.slice(0, ahead + 1).filter((j) => j.ticketStatus === "WAITING");
  if (!cand.length) return 0;
  const rows = await prisma.appointment.findMany({
    where: { tenantId: ctx.tenantId, unitId: ctx.unitId, id: { in: cand.map((j) => j.appointmentId) } },
    select: { id: true, queueTicketId: true },
  });
  const tkOf = new Map(rows.map((r) => [r.id, r.queueTicketId]));
  const done = await finishedKeys(ctx.tenantId, rows.filter((r) => r.queueTicketId).map((r) => `booking:nearTurn:${r.queueTicketId}`));
  let n = 0;
  for (const j of cand) {
    const tk = tkOf.get(j.appointmentId);
    if (!tk || done.has(`booking:nearTurn:${tk}`)) continue;
    if (outOfBudget(ctl)) break;
    if (sentNew(await notifyBookingWith(ctx, { appointmentId: j.appointmentId, kind: "nearTurn" }, now, { line }))) n++;
  }
  return n;
}

/** delayed: นัดของวันนี้ (CONFIRMED/ARRIVED ยังไม่เริ่ม) ที่เวลาเริ่มตามแผนสด − เวลานัด ≥ delayAlertMin */
async function tickDelayed(ctx: Ctx, now: Date, line: TodayLineView, alertMin: number, ctl: TickCtl): Promise<number> {
  const cand = line.waiting.filter(
    (j) => j.kind === "BOOKED" && (j.status === "CONFIRMED" || j.status === "ARRIVED") && j.plannedStartMs !== null && j.bookedStartMs !== null
      && j.plannedStartMs - j.bookedStartMs >= alertMin * MIN_MS,
  );
  const keyOf = (j: (typeof cand)[number]) => `booking:delayed:${j.appointmentId}:${Math.floor((j.bookedStartMs as number) / MIN_MS)}`;
  const done = await finishedKeys(ctx.tenantId, cand.map(keyOf));
  let n = 0;
  for (const j of cand) {
    if (done.has(keyOf(j))) continue;
    if (outOfBudget(ctl)) break;
    if (sentNew(await notifyBookingWith(ctx, { appointmentId: j.appointmentId, kind: "delayed" }, now, { line }))) n++;
  }
  return n;
}

/** rebookInvite: งาน DONE ที่มี Party · ครบ rebookAfterDays (บริการของงาน) ภายในหน้าต่าง · Party ไม่มีงานอื่นในหน่วยหลังจบงาน (ยกเว้นยกเลิก) */
async function tickRebook(ctx: Ctx, now: Date, ctl: TickCtl): Promise<number> {
  const svcs = await prisma.bookingService.findMany({ where: { tenantId: ctx.tenantId, unitId: ctx.unitId }, select: { id: true } });
  if (!svcs.length) return 0;
  const res = await resolveSettingsMany({ tenantId: ctx.tenantId }, ["booking.service.rebookAfterDays"], svcs.map((s) => ({ unitId: ctx.unitId, serviceId: s.id })));
  const nowMs = now.getTime();
  let n = 0;
  for (const [ix, svc] of svcs.entries()) {
    if (outOfBudget(ctl)) break;
    const days = res[ix]?.["booking.service.rebookAfterDays"]?.value;
    if (typeof days !== "number" || !Number.isInteger(days) || days < 1) continue;
    const rows = await prisma.appointment.findMany({
      where: {
        tenantId: ctx.tenantId, unitId: ctx.unitId, serviceId: svc.id, status: "DONE", partyId: { not: null },
        doneAt: { gt: new Date(nowMs - days * DAY_MS - REBOOK_WINDOW_MS), lte: new Date(nowMs - days * DAY_MS) },
      },
      select: { id: true, partyId: true, doneAt: true },
      orderBy: [{ doneAt: "asc" }, { id: "asc" }],
    });
    const done = await finishedKeys(ctx.tenantId, rows.map((r) => `booking:rebookInvite:${r.id}`));
    for (const r of rows) {
      if (!r.partyId || !r.doneAt || done.has(`booking:rebookInvite:${r.id}`)) continue;
      if (outOfBudget(ctl)) break;
      const later = await prisma.appointment.findFirst({
        where: { tenantId: ctx.tenantId, unitId: ctx.unitId, partyId: r.partyId, id: { not: r.id }, createdAt: { gt: r.doneAt }, status: { not: "CANCELLED" } },
        select: { id: true },
      });
      if (later) continue;
      if (sentNew(await notifyBookingWith(ctx, { appointmentId: r.id, kind: "rebookInvite" }, now))) n++;
    }
  }
  return n;
}

// ───────────────────────── consumer ─────────────────────────

/** ต่อจาก outbox-consumers.ts (4 event เดิม) · ไม่ throw · ข้อความล้ม = แถว log FAILED (ไม่ retry event) */
export async function onBookingNotifyEvent(evt: { id: string; tenantId: string; type: string; payload: unknown; unitId: string | null }): Promise<void> {
  try {
    const p = isRec(evt?.payload) ? evt.payload : {};
    const appointmentId = typeof p.appointmentId === "string" ? p.appointmentId : "";
    const unitId = typeof evt?.unitId === "string" && evt.unitId ? evt.unitId : typeof p.unitId === "string" ? p.unitId : "";
    if (!evt?.tenantId || !appointmentId || !unitId) return;
    let kind: BookingMsgKind | null = null;
    if (evt.type === "booking.created") kind = p.kind === "BOOKED" ? "confirmation" : p.kind === "WALKIN" ? "ticketIssued" : null;
    else if (evt.type === "booking.checked_in") kind = "checkedIn";
    else if (evt.type === "queue.ticket.called") kind = "yourTurn";
    else if (evt.type === "booking.no_show") kind = "noShowRebook";
    if (!kind) return;
    const callCount = kind === "yourTurn" && typeof p.callCount === "number" ? p.callCount : undefined;
    await notifyBookingWith({ tenantId: evt.tenantId, unitId }, { appointmentId, kind }, new Date(), callCount !== undefined ? { callCount } : undefined);
  } catch (e) {
    console.error(`[booking.notify] event ${String(evt?.type).slice(0, 40)} ล้ม`, e instanceof Error ? e.name : "error");
  }
}

/**
 * ลิงก์เปิดแชท OA จากรหัสผูก: แสดง LINE ID แบบ "@xxx" ตรงตัว (facade แชทเข้ารหัสเป็น "%40xxx" — ทั้งสองแบบเป็น path ที่ถูกต้องตาม RFC 3986
 * และ LINE เปิดได้เหมือนกัน · ข้อสอบ R0.7 L-5 รับทั้งสองแบบ) — แตะเฉพาะส่วน LINE ID ไม่แตะรหัส
 */
export function bookingOaLink(deepLink: string | null): string | null {
  if (typeof deepLink !== "string" || !deepLink) return null;
  return deepLink.replace(/^(https:\/\/line\.me\/R\/oaMessage\/)%40/, "$1@");
}

/** "YYYY-MM-DD" วันไทย */
export function bookingYmd(d: Date): string {
  return bkkYmd(d);
}

/** สิ้นวันไทยของ now (เที่ยงคืนถัดไป) — ให้ผูกรหัสบัตรคิวใช้ (แบบ B.6) */
export function bookingEndOfDay(now: Date): Date {
  return bkkAt(now, 0, 0, 1);
}
