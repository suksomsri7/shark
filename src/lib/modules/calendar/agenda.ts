// agenda.ts — ตัวรวม agenda ปฏิทินเลขา (CAL1.3 · สัญญา docs/modules/32-secretary-calendar.md §4 · §8.2 · R-CAL-5…9/15/19/21/24/36)
//
// อ่านอย่างเดียวจาก 8 แหล่งของร้าน + ของส่วนตัว (CalItem) + Google (CalExternalEvent) — ไม่เขียนอะไรเลย ยกเว้น `completeSourceItem`
//   ที่ส่งต่อให้ตัวทำงานของระบบต้นทาง (kanban `completeCard` · CRM `completeActivity`) ซึ่งตรวจสิทธิ์/บันทึกกิจกรรมเอง
//
// 🔴 M3: ตัวตนมาจาก `CalActor` เท่านั้น (ไม่มีพารามิเตอร์ userId) · CalItem/CalExternalEvent/CalLink/CalPref ทุก query มี `userId: actor.userId` ตรงตัว
// 🔴 แต่ละ adapter ห่อด้วย `part()` (แบบ digest.ts): ล้ม = [] + logOps WARN + notes SECTION_FAILED — แหล่งอื่นยังมา
// 🔴 แหล่งของร้าน (booking…trips) ตัดเมื่อ (ก) ร้านไม่มีระบบ/หน่วย active (ข) CalPref.sources[key] === false
//    (ค) ระดับเลขาของโมดูลนั้น OFF (`moduleOff` · R-CAL-21) (ง) ตัวกรองสิทธิ์ของแหล่งไม่ผ่าน
//    ของส่วนตัว (reminder/event/google) ไม่ถูก (ค)(ง) ตัด (มติ Q2)
// 🔴 ไม่มีเบอร์/อีเมลลูกค้าใน title/sub · ไม่ log ชื่อเรื่อง/ชื่อลูกค้า (§2.6)
// 🔴 อ่านผ่าน tenantDb ต่อระบบ/หน่วย (ไม่ใช้ prisma ดิบ · F5) · ตัวกรองสิทธิ์จาก facade ของแหล่ง (dynamic import ตอนใช้):
//    crm (`crm/index` activityWhere · parseCrmSettings · crmCan · activities.completeActivity) · member (`member/index` toMemberActor) ·
//    kanban (`kanban/access` visibleBoardsWhere · boardRole · `kanban/my-tasks` completeCard) · hr (`hr/index` employeeOfUser — เส้นใหม่ calendar→hr)
import type { MembershipCtx } from "@/lib/core/rbac";
import { canAccessUnit, canViewPayroll, evaluate } from "@/lib/core/rbac";
import { tenantDb } from "@/lib/core/db";
import { errDetail, logOps } from "@/lib/core/ops";
import type { AccessMap } from "@/lib/ai/secretary/access-rules";
import { conflicts as computeConflicts } from "./conflicts";
import { CalError } from "./items";
import { linkKey, resolveLinks, type LinkInfo } from "./links";
import { BKK_OFFSET_MS, bkkDayNo, dayNoToYmd, occurrences, ymdToDayNo } from "./next-fire";
import { hhmm, satang } from "./push-msg";
import { taxDeadlines, TH_MONTH_SHORT, type TaxForm } from "./tax-deadlines";

export type AgendaSource = "booking" | "account" | "tax" | "kanban" | "crm" | "hr" | "dorm" | "ticket" | "trips" | "reminder" | "event" | "google" | "device";
export type ColorKey = "booking" | "account" | "kanban" | "crm" | "hr" | "dorm" | "ticket" | "trips" | "remind" | "personal" | "google" | "device";
export type AgendaDeepLink = { kind: "web"; path: string } | { kind: "app"; path: string } | null;
export type AgendaItem = {
  id: string;
  source: AgendaSource;
  title: string;
  sub: string | null;
  label: string;
  startAt: string;
  endAt?: string;
  allDay: boolean;
  timeHint: "DURATION" | "REMIND" | "DUE" | null;
  deepLink: AgendaDeepLink;
  checkable: boolean;
  done: boolean;
  mine: boolean;
  colorKey: ColorKey;
  conflictWith?: string[];
  summary?: { count: number; amountSatang?: number };
  ref?: { itemId?: string; occ?: string; cardId?: string; activityId?: string; systemId?: string };
};
export type ConflictNote = { key: string; kind: "OVERLAP" | "TIGHT"; earlierId: string; laterId: string; text: string; suggestRemindAt: string | null };
export type AgendaNote = { code: "BOOKING_UNLINKED" | "SECTION_FAILED" | "SECTION_OFF"; source: AgendaSource; text: string };
export type AgendaResult = { items: AgendaItem[]; conflicts: ConflictNote[]; notes: AgendaNote[] };
type Actor = { userId: string; tenantId: string; membership: MembershipCtx };

/** ทริป TRIPS (TripDeparture) ยังไม่อยู่บน main — ปิดไว้ (R-CAL-8 · ค่าคงที่ในโค้ด ไม่ใช่ env) */
export const TRIPS_ADAPTER_ENABLED = false;
/** ช่วงคำขอสูงสุด (วันไทย รวมปลาย) */
export const AGENDA_MAX_DAYS = 42;
/** เพดานต่อแหล่งต่อวัน (§4.2) — เกิน = แถว "อีก N รายการ" */
export const PER_SOURCE_DAY_CAP = 50;

const DAY_MS = 86_400_000;
const dayStart = (d: number) => new Date(d * DAY_MS - BKK_OFFSET_MS);
/** @db.Date (เที่ยงคืน UTC ของวันนั้น) → เลขวัน */
const dateDayNo = (d: Date) => Math.floor(+d / DAY_MS);
const dateOnly = (d: number) => new Date(d * DAY_MS);
const clip = (s: string, n = 120) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
// eslint-disable-next-line no-control-regex
const clean = (s: unknown) => String(s ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();

/** ลำดับแหล่ง (เวลาเท่ากัน + สีจุดเดือน · §4.3) */
export const SOURCE_PRIORITY: readonly AgendaSource[] = ["reminder", "event", "booking", "crm", "kanban", "account", "tax", "hr", "dorm", "ticket", "trips", "google", "device"];
const prio = (s: AgendaSource) => {
  const i = SOURCE_PRIORITY.indexOf(s);
  return i < 0 ? 99 : i;
};

/** แหล่งของร้าน → คีย์ CalPref.sources + โมดูลเลขา (OFF ตัด) */
type ShopSource = "booking" | "account" | "tax" | "kanban" | "crm" | "hr" | "dorm" | "ticket" | "trips";
const MODULE_OF: Record<Exclude<ShopSource, "tax">, string> = { booking: "booking", account: "account", kanban: "kanban", crm: "crm", hr: "hr", dorm: "dorm", ticket: "ticket", trips: "ticket" };
const LABEL_TH: Record<string, string> = { booking: "บัตรคิว", account: "บัญชี", kanban: "บอร์ดงาน", crm: "CRM", hr: "HR", dorm: "หอพัก", ticket: "ตั๋ว" };

/** QC เท่านั้น: บังคับให้ adapter ล้ม (พิสูจน์ "ล้ม 1 แหล่ง ส่วนอื่นยังมา") — งานจริงไม่ส่ง */
export type AgendaDeps = { failSources?: readonly AgendaSource[] };
export type AgendaOpts = { now?: Date; access?: AccessMap; deps?: AgendaDeps };

// ─────────────────────────── บริบทของคำขอ ───────────────────────────

type Ctx = {
  actor: Actor;
  now: Date;
  fromDay: number;
  toDay: number;
  /** [from, toEx) UTC ของช่วงวันไทย */
  from: Date;
  toEx: Date;
  todayNo: number;
  sys: Map<string, { id: string; settings: unknown }[]>;
  units: Map<string, { id: string; slug: string; name: string }[]>;
  notes: AgendaNote[];
  emp: () => Promise<{ employeeId: string; systemId: string } | null>;
  memberCan: (module: string, action: string) => Promise<boolean>;
};

async function loadAccess(tenantId: string): Promise<AccessMap | undefined> {
  const { getAccess } = await import("@/lib/ai/secretary/access");
  return getAccess(tenantId);
}

async function isOff(access: AccessMap | undefined, module: string): Promise<boolean> {
  if (!access) return false;
  const { moduleOff } = await import("@/lib/ai/secretary/access-rules");
  return moduleOff(access, module);
}

async function buildCtx(actor: Actor, fromDay: number, toDay: number, now: Date): Promise<Ctx> {
  const db = tenantDb({ tenantId: actor.tenantId });
  const [systems, units] = await Promise.all([
    db.appSystem.findMany({ where: { tenantId: actor.tenantId, active: true }, select: { id: true, type: true, settings: true }, orderBy: { createdAt: "asc" } }),
    db.businessUnit.findMany({ where: { tenantId: actor.tenantId, status: "ACTIVE" }, select: { id: true, type: true, slug: true, name: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  const sys = new Map<string, { id: string; settings: unknown }[]>();
  for (const s of systems) (sys.get(s.type) ?? sys.set(s.type, []).get(s.type)!).push({ id: s.id, settings: s.settings });
  const um = new Map<string, { id: string; slug: string; name: string }[]>();
  for (const u of units) (um.get(u.type) ?? um.set(u.type, []).get(u.type)!).push({ id: u.id, slug: u.slug, name: u.name });
  let empP: Promise<{ employeeId: string; systemId: string } | null> | null = null;
  return {
    actor,
    now,
    fromDay,
    toDay,
    from: dayStart(fromDay),
    toEx: dayStart(toDay + 1),
    todayNo: bkkDayNo(now),
    sys,
    units: um,
    notes: [],
    emp: () =>
      (empP ??= (async () => {
        const { employeeOfUser } = await import("@/lib/modules/hr");
        const e = await employeeOfUser(actor.tenantId, actor.userId);
        return e ? { employeeId: e.employeeId, systemId: e.systemId } : null;
      })()),
    memberCan: async (module, action) => {
      const { membershipCan } = await import("@/lib/ai/tool-access");
      return membershipCan(actor.membership, { module, action }, actor.userId);
    },
  };
}

/** ครอบ adapter — ล้ม = [] + logOps WARN + note SECTION_FAILED (แบบ digest.part) */
async function part(c: Ctx, source: AgendaSource, deps: AgendaDeps | undefined, fn: () => Promise<AgendaItem[]>): Promise<AgendaItem[]> {
  try {
    if (deps?.failSources?.includes(source)) throw new Error(`qc: forced failure (${source})`);
    return await fn();
  } catch (e) {
    await logOps("WARN", "calendar", `agenda: ส่วน ${source} คำนวณไม่ได้`, { tenantId: c.actor.tenantId, detail: errDetail(e) }).catch(() => undefined);
    c.notes.push({ code: "SECTION_FAILED", source, text: `โหลดรายการจาก${LABEL_TH[source] ?? source}ไม่สำเร็จ — ดึงลงเพื่อลองใหม่` });
    return [];
  }
}

// ─────────────────────────── adapter: บัตรคิว (booking · R-CAL-5) ───────────────────────────

const WHOLE_BRANCH_KEYS = ["booking.queue.operate", "booking.job.runAny", "booking.appointment.setStatus"] as const;

async function bookingAdapter(c: Ctx): Promise<AgendaItem[]> {
  const units = (c.units.get("BOOKING") ?? []).filter((u) => canAccessUnit(c.actor.membership, u.id));
  if (!units.length) return [];
  const out: AgendaItem[] = [];
  let anyWhole = false;
  let anyMine = false;
  for (const u of units) {
    const whole = WHOLE_BRANCH_KEYS.some((action) => evaluate(c.actor.membership, { module: "booking", action, unitId: u.id }));
    const db = tenantDb({ tenantId: c.actor.tenantId, unitId: u.id });
    const emp = await c.emp();
    // "ของฉัน" = BookingStaff active ของหน่วยที่ผูกพนักงาน HR ของผู้ใช้ (นิยามเดียวกับ booking/today-line.ts myStaffIds)
    const mine = emp
      ? (await db.bookingStaff.findMany({ where: { tenantId: c.actor.tenantId, unitId: u.id, active: true, employeeId: emp.employeeId }, select: { id: true } })).map((s) => s.id)
      : [];
    if (whole) anyWhole = true;
    if (mine.length) anyMine = true;
    if (!whole && !mine.length) continue;
    const rows = await db.appointment.findMany({
      where: {
        tenantId: c.actor.tenantId,
        unitId: u.id,
        startAt: { gte: c.from, lt: c.toEx },
        status: { notIn: ["CANCELLED", "NO_SHOW"] },
        ...(whole ? {} : { staffId: { in: mine } }),
      },
      select: { id: true, startAt: true, endAt: true, status: true, customerName: true, groupId: true, resourceId: true, staffId: true, service: { select: { name: true } }, staff: { select: { name: true } } },
      orderBy: [{ startAt: "asc" }, { id: "asc" }],
      take: 3_000,
    });
    const resIds = [...new Set(rows.map((r) => r.resourceId).filter((x): x is string => !!x))];
    const resName = new Map(
      resIds.length ? (await db.svcResource.findMany({ where: { tenantId: c.actor.tenantId, unitId: u.id, id: { in: resIds } }, select: { id: true, name: true } })).map((r) => [r.id, r.name] as const) : [],
    );
    const mineSet = new Set(mine);
    // นัดกลุ่ม (groupId) = แถวเดียว "<บริการ> (<n> คน)"
    const groups = new Map<string, typeof rows>();
    for (const r of rows) {
      const k = r.groupId ? `g:${r.groupId}` : `a:${r.id}`;
      (groups.get(k) ?? groups.set(k, []).get(k)!).push(r);
    }
    for (const [k, g] of groups) {
      const r = g[0]!;
      const isMine = g.some((x) => mineSet.has(x.staffId));
      const start = new Date(Math.min(...g.map((x) => +x.startAt)));
      const end = new Date(Math.max(...g.map((x) => +x.endAt)));
      const day = dayNoToYmd(bkkDayNo(start));
      const title = g.length > 1 ? `${clean(r.service.name)} (${g.length} คน)` : `${clean(r.service.name)} · ${clean(r.customerName)}`;
      const subParts = [clean(r.staff.name), r.resourceId ? clean(resName.get(r.resourceId) ?? "") : ""].filter(Boolean);
      out.push({
        id: k.startsWith("g:") ? `booking:g:${r.groupId}` : `booking:${r.id}`,
        source: "booking",
        title: clip(title),
        sub: subParts.length ? clip(subParts.join(" · ")) : null,
        label: "บัตรคิว",
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        allDay: false,
        timeHint: "DURATION",
        deepLink: whole ? { kind: "web", path: `/app/u/${u.slug}/booking/day?date=${day}` } : { kind: "web", path: `/app/u/${u.slug}/booking/mine` },
        checkable: false,
        done: g.every((x) => x.status === "DONE"),
        mine: isMine,
        colorKey: "booking",
      });
    }
  }
  // มติ Q1: ร้านมีจองคิว แต่ผู้ใช้ไม่ผูกพนักงาน (และไม่ได้ดูทั้งสาขา) = ไม่เห็นนัดของตัวเอง → บอกวิธีแก้
  if (!anyWhole && !anyMine) c.notes.push({ code: "BOOKING_UNLINKED", source: "booking", text: "ผูกบัญชีกับพนักงานเพื่อเห็นนัดของคุณ" });
  return out;
}

// ─────────────────────────── adapter: บัญชี (แถวสรุป · R-CAL-6) ───────────────────────────

async function accountAdapter(c: Ctx): Promise<AgendaItem[]> {
  const systems = c.sys.get("ACCOUNT") ?? [];
  if (!systems.length || !(await c.memberCan("account", "account.doc.view"))) return [];
  const out: AgendaItem[] = [];
  const today0 = dayStart(c.todayNo);
  const todayInRange = c.todayNo >= c.fromDay && c.todayNo <= c.toDay;
  for (const s of systems) {
    const db = tenantDb({ tenantId: c.actor.tenantId, systemId: s.id });
    const base = { tenantId: c.actor.tenantId, systemId: s.id, direction: "OUT" as const, status: { in: ["AWAITING_PAYMENT" as const, "PARTIAL" as const] }, voidedAt: null, docType: { not: "BILLING_NOTE" as const } };
    const dueWin = { gte: c.from, lt: c.toEx };
    const rows = await db.accountDocument.findMany({
      where: { ...base, OR: [{ dueDate: dueWin }, ...(todayInRange ? [{ dueDate: { lt: today0 } }] : [])] },
      select: { id: true, grandTotal: true, paidTotal: true, dueDate: true, contactSnapshot: true, contact: { select: { name: true } } },
      orderBy: [{ dueDate: "asc" }, { id: "asc" }],
      take: 2_000,
    });
    const nameOf = (r: (typeof rows)[number]) => {
      const snap = (r.contactSnapshot as Record<string, unknown> | null) ?? null;
      return clean((typeof snap?.name === "string" ? snap.name : null) ?? r.contact?.name ?? "");
    };
    const byDay = new Map<number, { n: number; amt: number; names: string[] }>();
    const overdue = { n: 0, amt: 0 };
    for (const r of rows) {
      const owe = r.grandTotal - r.paidTotal;
      if (owe <= 0 || !r.dueDate) continue;
      if (+r.dueDate < +today0) {
        if (todayInRange) {
          overdue.n += 1;
          overdue.amt += owe;
        }
        if (+r.dueDate < +c.from) continue;
      }
      const d = bkkDayNo(r.dueDate);
      if (d < c.fromDay || d > c.toDay) continue;
      const g = byDay.get(d) ?? byDay.set(d, { n: 0, amt: 0, names: [] }).get(d)!;
      g.n += 1;
      g.amt += owe;
      const nm = nameOf(r);
      if (g.names.length < 2) g.names.push(nm ? `${nm} ${satang(owe)}` : satang(owe));
    }
    const link = { kind: "web" as const, path: `/app/sys/${s.id}/account/documents` };
    for (const [d, g] of [...byDay].sort((a, b) => a[0] - b[0])) {
      const ymd = dayNoToYmd(d);
      out.push({
        id: `account:due:${s.id}:${ymd}`,
        source: "account",
        title: `ใบแจ้งหนี้ครบกำหนด ${g.n} ใบ`,
        sub: clip(g.names.join(" · ") + (g.n > g.names.length ? ` และอีก ${g.n - g.names.length}` : ""), 160),
        label: "บัญชี",
        startAt: dayStart(d).toISOString(),
        allDay: true,
        timeHint: "DUE",
        deepLink: link,
        checkable: false,
        done: false,
        mine: false,
        colorKey: "account",
        summary: { count: g.n, amountSatang: g.amt },
        ref: { systemId: s.id },
      });
    }
    if (overdue.n > 0) {
      const ymd = dayNoToYmd(c.todayNo);
      out.push({
        id: `account:overdue:${s.id}:${ymd}`,
        source: "account",
        title: `ใบแจ้งหนี้เกินกำหนด ${overdue.n} ใบ`,
        sub: `ค้างรวม ${satang(overdue.amt)}`,
        label: "บัญชี",
        startAt: dayStart(c.todayNo).toISOString(),
        allDay: true,
        timeHint: "DUE",
        deepLink: link,
        checkable: false,
        done: false,
        mine: false,
        colorKey: "account",
        summary: { count: overdue.n, amountSatang: overdue.amt },
        ref: { systemId: s.id },
      });
    }
  }
  return out;
}

// ─────────────────────────── adapter: กำหนดยื่นภาษี (§4.4 · R-CAL-15 · Q4) ───────────────────────────

async function taxAdapter(c: Ctx, cut: { account: boolean; hr: boolean }): Promise<AgendaItem[]> {
  const all = taxDeadlines(dayNoToYmd(c.fromDay), dayNoToYmd(c.toDay));
  if (!all.length) return [];
  const acc = cut.account ? [] : c.sys.get("ACCOUNT") ?? [];
  const hr = cut.hr ? [] : c.sys.get("HR") ?? [];
  const m = c.actor.membership;
  const taxView = acc.length > 0 && (await c.memberCan("account", "account.tax.view"));
  const whtView = acc.length > 0 && (taxView || (await c.memberCan("account", "account.wht.manage")));
  const payroll = hr.length > 0 && canViewPayroll(m);
  const out: AgendaItem[] = [];
  const periodRange = (p: string) => {
    const [y, mo] = p.split("-").map(Number) as [number, number];
    return { gte: new Date(Date.UTC(y, mo - 1, 1) - BKK_OFFSET_MS), lt: new Date(Date.UTC(y, mo, 1) - BKK_OFFSET_MS) };
  };
  const push = (form: TaxForm, t: (typeof all)[number], sid: string, path: string, colorKey: ColorKey, label: string) =>
    out.push({
      id: `tax:${form}:${t.period}:${sid}`,
      source: "tax",
      title: t.title,
      sub: t.sub,
      label,
      startAt: dayStart(ymdToDayNo(t.day)!).toISOString(),
      allDay: true,
      timeHint: "DUE",
      deepLink: { kind: "web", path },
      checkable: false,
      done: false,
      mine: false,
      colorKey,
      ref: { systemId: sid },
    });
  for (const t of all) {
    if (t.form === "PP30" && taxView) {
      for (const s of acc) {
        const st = await tenantDb({ tenantId: c.actor.tenantId, systemId: s.id }).accountSettings.findFirst({ where: { tenantId: c.actor.tenantId, systemId: s.id }, select: { vatRegistered: true } });
        if (st?.vatRegistered) push("PP30", t, s.id, `/app/sys/${s.id}/account/reports/pp30`, "account", "บัญชี");
      }
    } else if (t.form === "PND3_53" && whtView) {
      for (const s of acc) {
        const n = await tenantDb({ tenantId: c.actor.tenantId, systemId: s.id }).accountDocument.count({
          where: { tenantId: c.actor.tenantId, systemId: s.id, docType: "WHT_CERT", direction: "IN", voidedAt: null, issueDate: periodRange(t.period) },
        });
        if (n > 0) push("PND3_53", t, s.id, `/app/sys/${s.id}/account/wht`, "account", "บัญชี");
      }
    } else if ((t.form === "PND1" || t.form === "SSO") && payroll) {
      for (const s of hr) {
        const run = await tenantDb({ tenantId: c.actor.tenantId, systemId: s.id }).hrPayrollRun.findFirst({
          where: { tenantId: c.actor.tenantId, systemId: s.id, periodKey: t.period, status: { notIn: ["DRAFT", "REVERSED"] } },
          select: { totalSsoEmployeeSatang: true },
        });
        if (!run) continue;
        if (t.form === "SSO" && !(run.totalSsoEmployeeSatang > 0)) continue;
        push(t.form, t, s.id, `/app/sys/${s.id}/hr/payroll`, "hr", "HR");
      }
    }
  }
  return out;
}

// ─────────────────────────── adapter: บอร์ดงาน (การ์ดของฉัน) ───────────────────────────

async function kanbanAdapter(c: Ctx): Promise<AgendaItem[]> {
  const systems = c.sys.get("KANBAN") ?? [];
  if (!systems.length) return [];
  const { visibleBoardsWhere, boardRole } = await import("@/lib/modules/kanban/access");
  const m = c.actor.membership;
  const kActor = { userId: c.actor.userId, role: m.role, unitAccess: m.unitAccess, permissions: m.permissions };
  const out: AgendaItem[] = [];
  for (const s of systems) {
    const rows = await tenantDb({ tenantId: c.actor.tenantId, systemId: s.id }).kanbanCard.findMany({
      where: {
        tenantId: c.actor.tenantId,
        systemId: s.id,
        status: "ACTIVE",
        dueAt: { gte: c.from, lt: c.toEx },
        OR: [{ assigneeUserId: c.actor.userId }, { assignees: { some: { userId: c.actor.userId } } }],
        board: { AND: [visibleBoardsWhere(kActor), { tenantId: c.actor.tenantId, systemId: s.id, status: "ACTIVE" }] },
      },
      select: {
        id: true,
        title: true,
        dueAt: true,
        completedAt: true,
        boardId: true,
        board: { select: { name: true, unitId: true, visibility: true, members: { where: { userId: c.actor.userId }, select: { userId: true, role: true } } } },
      },
      orderBy: [{ dueAt: "asc" }, { id: "asc" }],
      take: 2_000,
    });
    for (const r of rows) {
      const role = boardRole(kActor, { unitId: r.board.unitId, visibility: r.board.visibility }, r.board.members);
      out.push({
        id: `kanban:${r.id}`,
        source: "kanban",
        title: clip(clean(r.title)),
        sub: clip(`การ์ดในบอร์ด "${clean(r.board.name)}"`),
        label: "บอร์ดงาน",
        startAt: r.dueAt!.toISOString(),
        allDay: false,
        timeHint: "DUE",
        deepLink: { kind: "web", path: `/app/sys/${s.id}/kanban/b/${r.boardId}?card=${r.id}` },
        checkable: role === "EDITOR" || role === "ADMIN",
        done: r.completedAt !== null,
        mine: true,
        colorKey: "kanban",
        ref: { cardId: r.id, systemId: s.id },
      });
    }
  }
  return out;
}

// ─────────────────────────── adapter: CRM (กิจกรรมที่ฉันเป็นเจ้าของ · R-CAL-24/36) ───────────────────────────

const CRM_TYPE_TH: Record<string, string> = {
  CALL: "โทร", MEETING: "นัดประชุม", EMAIL: "อีเมล", LINE: "LINE", TASK: "งาน", NOTE: "บันทึก",
  CHAT: "แชท", SMS: "SMS", WHATSAPP: "WhatsApp", VISIT: "เยี่ยมลูกค้า", WEB: "เว็บ", PORTAL: "พอร์ทัล",
};
export const CRM_CHECKABLE_TYPES: readonly string[] = ["TASK", "CALL", "EMAIL", "LINE"];

async function crmAdapter(c: Ctx): Promise<AgendaItem[]> {
  const systems = c.sys.get("CRM") ?? [];
  if (!systems.length) return [];
  const crm = await import("@/lib/modules/crm");
  const { toMemberActor } = await import("@/lib/modules/member");
  const actor = toMemberActor(c.actor.userId, c.actor.membership);
  const canComplete = crm.crmCan(actor, "crm.activity.complete");
  const out: AgendaItem[] = [];
  for (const s of systems) {
    if (crm.parseCrmSettings(s.settings as never).uiVersion !== 2) continue; // v1 ข้าม (กติกาเดียวกับ crm/reminders.ts)
    const ctx = { tenantId: c.actor.tenantId, systemId: s.id };
    const w = await crm.activityWhere(ctx, actor);
    const range = { gte: c.from, lt: c.toEx };
    const rows = await tenantDb(ctx).crmActivity.findMany({
      where: { AND: [w, { tenantId: ctx.tenantId, systemId: s.id, ownerUserId: c.actor.userId }, { OR: [{ startAt: range }, { startAt: null, dueAt: range }] }] },
      select: { id: true, type: true, title: true, startAt: true, endAt: true, dueAt: true, doneAt: true, contact: { select: { name: true } }, deal: { select: { title: true } } },
      orderBy: [{ startAt: { sort: "asc", nulls: "last" } }, { dueAt: { sort: "asc", nulls: "last" } }, { id: "asc" }],
      take: 2_000,
    });
    for (const r of rows) {
      const start = r.startAt ?? r.dueAt!;
      const who = clean(r.contact?.name ?? r.deal?.title ?? "");
      const hasSpan = !!(r.startAt && r.endAt && +r.endAt > +r.startAt);
      out.push({
        id: `crm:${r.id}`,
        source: "crm",
        title: clip(clean(r.title) || CRM_TYPE_TH[r.type] || "กิจกรรม"),
        sub: clip([CRM_TYPE_TH[r.type] ?? r.type, who].filter(Boolean).join(" · ")),
        label: "CRM",
        startAt: start.toISOString(),
        ...(hasSpan ? { endAt: r.endAt!.toISOString() } : {}),
        allDay: false,
        timeHint: hasSpan ? "DURATION" : "DUE",
        deepLink: { kind: "app", path: `/crm/tasks?systemId=${s.id}&taskId=${r.id}` },
        checkable: canComplete && CRM_CHECKABLE_TYPES.includes(r.type),
        done: r.doneAt !== null,
        mine: true,
        colorKey: "crm",
        ref: { activityId: r.id, systemId: s.id },
      });
    }
  }
  return out;
}

// ─────────────────────────── adapter: HR (วันจ่ายเงินเดือน · ใบลาของฉัน · R-CAL-7) ───────────────────────────

const LEAVE_TH: Record<string, string> = { SICK: "ลาป่วย", PERSONAL: "ลากิจ", VACATION: "ลาพักร้อน", OTHER: "ลา" };

async function hrAdapter(c: Ctx): Promise<AgendaItem[]> {
  const systems = c.sys.get("HR") ?? [];
  if (!systems.length) return [];
  const out: AgendaItem[] = [];
  if (canViewPayroll(c.actor.membership)) {
    for (const s of systems) {
      const runs = await tenantDb({ tenantId: c.actor.tenantId, systemId: s.id }).hrPayrollRun.findMany({
        where: { tenantId: c.actor.tenantId, systemId: s.id, payDate: { gte: c.from, lt: c.toEx }, status: { in: ["APPROVED", "PAID"] } },
        select: { id: true, periodKey: true, payDate: true, status: true },
        take: 50,
      });
      for (const r of runs) {
        const mo = Number(r.periodKey.slice(5, 7));
        out.push({
          id: `hr:pay:${r.id}`,
          source: "hr",
          title: `จ่ายเงินเดือนงวด ${TH_MONTH_SHORT[mo - 1] ?? r.periodKey}`,
          sub: r.status === "PAID" ? "จ่ายแล้ว" : "อนุมัติแล้ว รอจ่าย",
          label: "HR",
          startAt: dayStart(bkkDayNo(r.payDate)).toISOString(),
          allDay: true,
          timeHint: null,
          deepLink: { kind: "web", path: `/app/sys/${s.id}/hr/payroll` },
          checkable: false,
          done: false,
          mine: false,
          colorKey: "hr",
          ref: { systemId: s.id },
        });
      }
    }
  }
  // ใบลาของฉัน — ไม่ต้องมี hr.leave.read (ของตัวเอง) · ใบลาคนอื่นไม่แสดง (PDPA · M3)
  const emp = await c.emp();
  if (emp && systems.some((s) => s.id === emp.systemId)) {
    const leaves = await tenantDb({ tenantId: c.actor.tenantId, systemId: emp.systemId }).hrLeave.findMany({
      where: { tenantId: c.actor.tenantId, systemId: emp.systemId, employeeId: emp.employeeId, status: { in: ["PENDING", "APPROVED"] }, fromDate: { lte: dateOnly(c.toDay) }, toDate: { gte: dateOnly(c.fromDay) } },
      select: { id: true, type: true, fromDate: true, toDate: true, status: true },
      take: 100,
    });
    for (const l of leaves) {
      const a = Math.max(dateDayNo(l.fromDate), c.fromDay), b = Math.min(dateDayNo(l.toDate), c.toDay);
      for (let d = a; d <= b; d++) {
        out.push({
          id: `hr:leave:${l.id}:${dayNoToYmd(d)}`,
          source: "hr",
          title: LEAVE_TH[l.type] ?? "ลา",
          sub: l.status === "APPROVED" ? "อนุมัติแล้ว" : "รออนุมัติ",
          label: "HR",
          startAt: dayStart(d).toISOString(),
          allDay: true,
          timeHint: null,
          deepLink: { kind: "web", path: `/app/sys/${emp.systemId}/hr/leave` },
          checkable: false,
          done: false,
          mine: true,
          colorKey: "hr",
          ref: { systemId: emp.systemId },
        });
      }
    }
  }
  return out;
}

// ─────────────────────────── adapter: หอพัก (แถวสรุปต่อรอบบิล · R-CAL-6) ───────────────────────────

async function dormAdapter(c: Ctx): Promise<AgendaItem[]> {
  const units = (c.units.get("DORM") ?? []).filter((u) => evaluate(c.actor.membership, { module: "dorm", action: "dorm.view", unitId: u.id }));
  const out: AgendaItem[] = [];
  for (const u of units) {
    const db = tenantDb({ tenantId: c.actor.tenantId, unitId: u.id });
    const runs = await db.dormBillRun.findMany({
      where: { tenantId: c.actor.tenantId, unitId: u.id, status: "SENT", dueDate: { gte: dateOnly(c.fromDay), lte: dateOnly(c.toDay) } },
      select: { id: true, periodKey: true, dueDate: true },
      take: 50,
    });
    for (const r of runs) {
      const bills = await db.dormBill.findMany({
        where: { tenantId: c.actor.tenantId, unitId: u.id, runId: r.id, status: { in: ["SENT", "PARTIALLY_PAID"] } },
        select: { totalSatang: true, paidSatang: true },
        take: 5_000,
      });
      const owe = bills.reduce((s, b) => s + Math.max(0, b.totalSatang - b.paidSatang), 0);
      const mo = Number(r.periodKey.slice(5, 7));
      out.push({
        id: `dorm:run:${r.id}`,
        source: "dorm",
        title: `ค่าห้องงวด ${TH_MONTH_SHORT[mo - 1] ?? r.periodKey} ครบกำหนด`,
        sub: bills.length ? `ค้าง ${bills.length} ห้อง · ${satang(owe)}` : "เก็บครบแล้ว",
        label: "หอพัก",
        startAt: dayStart(dateDayNo(r.dueDate!)).toISOString(),
        allDay: true,
        timeHint: "DUE",
        deepLink: { kind: "web", path: `/app/u/${u.slug}/dorm/billing` },
        checkable: false,
        done: bills.length === 0,
        mine: false,
        colorKey: "dorm",
        summary: { count: bills.length, amountSatang: owe },
      });
    }
  }
  return out;
}

// ─────────────────────────── adapter: ตั๋ว (TicketEvent · R-CAL-4) ───────────────────────────

async function ticketAdapter(c: Ctx): Promise<AgendaItem[]> {
  const m = c.actor.membership;
  const hasKey = m.role !== "STAFF" || Object.entries(m.permissions ?? {}).some(([k, v]) => v === true && (k.startsWith("ticket.event.") || k === "ticket.*"));
  if (!hasKey) return [];
  const units = (c.units.get("TICKET") ?? []).filter((u) => canAccessUnit(m, u.id));
  const out: AgendaItem[] = [];
  for (const u of units) {
    const rows = await tenantDb({ tenantId: c.actor.tenantId, unitId: u.id }).ticketEvent.findMany({
      where: { tenantId: c.actor.tenantId, unitId: u.id, status: "PUBLISHED", startAt: { gte: c.from, lt: c.toEx } },
      select: { id: true, name: true, venue: true, startAt: true, endAt: true },
      orderBy: [{ startAt: "asc" }, { id: "asc" }],
      take: 500,
    });
    for (const r of rows) {
      const span = !!(r.endAt && +r.endAt > +r.startAt);
      out.push({
        id: `ticket:${r.id}`,
        source: "ticket",
        title: clip(clean(r.name)),
        sub: r.venue ? clip(clean(r.venue)) : clean(u.name) || null,
        label: "ตั๋ว",
        startAt: r.startAt.toISOString(),
        ...(span ? { endAt: r.endAt!.toISOString() } : {}),
        allDay: false,
        timeHint: span ? "DURATION" : null,
        deepLink: { kind: "web", path: `/app/u/${u.slug}/ticket` },
        checkable: false,
        done: false,
        mine: false,
        colorKey: "ticket",
      });
    }
  }
  return out;
}

// ─────────────────────────── ของส่วนตัว: เตือนฉัน + นัดส่วนตัว (CalItem) ───────────────────────────

function chatSub(createdAt: Date, now: Date): string {
  const diff = bkkDayNo(now) - bkkDayNo(createdAt);
  const t = hhmm(createdAt);
  if (diff === 0) return `คุณสั่งวันนี้ ${t}`;
  if (diff === 1) return `คุณสั่งเมื่อวาน ${t}`;
  const d = new Date(+createdAt + BKK_OFFSET_MS);
  return `คุณสั่งเมื่อ ${d.getUTCDate()} ${TH_MONTH_SHORT[d.getUTCMonth()]} ${t}`;
}

async function personalAdapter(c: Ctx): Promise<AgendaItem[]> {
  const rows = await tenantDb({ tenantId: c.actor.tenantId }).calItem.findMany({
    where: { userId: c.actor.userId, tenantId: c.actor.tenantId, status: { in: ["OPEN", "DONE"] }, startAt: { lt: c.toEx } },
    orderBy: [{ startAt: "asc" }, { id: "asc" }],
    take: 1_000,
  });
  const refs = rows.filter((r) => r.linkType && r.linkId).map((r) => ({ type: r.linkType!, id: r.linkId! }));
  const links: Map<string, LinkInfo> = refs.length ? await resolveLinks(c.actor, refs) : new Map();
  const out: AgendaItem[] = [];
  const toIncl = new Date(+c.toEx - 1);
  for (const r of rows) {
    const li = r.linkType && r.linkId ? links.get(linkKey({ type: r.linkType, id: r.linkId })) ?? null : null;
    const isEvent = r.kind === "EVENT";
    const src: AgendaSource = isEvent ? "event" : "reminder";
    const dur = r.endAt ? +r.endAt - +r.startAt : 0;
    const sub = isEvent
      ? `นัดส่วนตัว · สร้างในแอป${r.externalId ? " → ส่งไป Google แล้ว" : ""}`
      : r.source === "CHAT"
        ? chatSub(r.createdAt, c.now)
        : li
          ? `ผูกกับ ${li.label}`
          : r.note?.split(/\r?\n/)[0]?.trim() || null;
    for (const o of occurrences(r, c.from, toIncl)) {
      const occ = r.allDay ? dayStart(bkkDayNo(o)) : o;
      if (+occ < +c.from || +occ >= +c.toEx) continue;
      const day = dayNoToYmd(bkkDayNo(o));
      out.push({
        id: r.repeat === "NONE" ? `${src}:${r.id}` : `${src}:${r.id}@${o.toISOString()}`,
        source: src,
        title: clip(r.title),
        sub: sub ? clip(sub) : null,
        label: isEvent ? "นัดส่วนตัว" : "เตือนฉัน",
        startAt: occ.toISOString(),
        ...(dur > 0 ? { endAt: new Date(+occ + (r.allDay ? Math.max(dur, DAY_MS) : dur)).toISOString() } : {}),
        allDay: r.allDay,
        timeHint: isEvent ? "DURATION" : "REMIND",
        // ผูกและอ่านได้ → ลิงก์ของสิ่งที่ผูก (§4.5) · ไม่ผูก/อ่านไม่ได้แล้ว (R-CAL-23) → รายการในแอป
        deepLink: li ? li.deepLink : { kind: "app", path: `/secretary/calendar?day=${day}&item=${r.id}` },
        checkable: !isEvent,
        done: r.repeat === "NONE" ? r.status === "DONE" : +o < +r.occursAt,
        mine: true,
        colorKey: isEvent ? "personal" : "remind",
        ref: { itemId: r.id, occ: o.toISOString() },
      });
    }
  }
  return out;
}

// ─────────────────────────── ของส่วนตัว: Google (CalExternalEvent · §2.4 ทุกกิจการ) ───────────────────────────

async function googleAdapter(c: Ctx): Promise<AgendaItem[]> {
  const db = tenantDb({ tenantId: c.actor.tenantId });
  const link = await db.calLink.findFirst({ where: { userId: c.actor.userId, provider: "GOOGLE" }, select: { id: true, calendars: true } });
  if (!link) return [];
  const cals = (Array.isArray(link.calendars) ? link.calendars : []) as { id?: unknown; name?: unknown; import?: unknown }[];
  const imported = new Map(cals.filter((x) => x && x.import === true && typeof x.id === "string").map((x) => [x.id as string, typeof x.name === "string" ? x.name : ""] as const));
  if (!imported.size) return [];
  const rows = await db.calExternalEvent.findMany({
    where: {
      userId: c.actor.userId,
      linkId: link.id,
      deletedAt: null,
      sharkRef: null,
      calendarId: { in: [...imported.keys()] },
      startAt: { lt: c.toEx },
      OR: [{ endAt: { gt: c.from } }, { endAt: null, startAt: { gte: c.from } }],
    },
    select: { id: true, calendarId: true, title: true, location: true, startAt: true, endAt: true, allDay: true },
    orderBy: [{ startAt: "asc" }, { id: "asc" }],
    take: 1_000,
  });
  const out: AgendaItem[] = [];
  for (const r of rows) {
    const calName = clean(imported.get(r.calendarId) ?? "");
    const sub = clip(`จากปฏิทิน Google${calName ? ` · ${calName}` : ""}`);
    const base = { source: "google" as const, title: clip(clean(r.title) || "(ไม่มีชื่อ)"), sub, label: "Google", deepLink: null, checkable: false, done: false, mine: true, colorKey: "google" as const };
    if (r.allDay) {
      // ทั้งวันหลายวัน = แถวต่อวัน (endAt = เที่ยงคืนไทยของวันถัดจากวันสุดท้าย · exclusive)
      const a = Math.max(bkkDayNo(r.startAt), c.fromDay);
      const b = Math.min(r.endAt ? bkkDayNo(new Date(+r.endAt - 1)) : bkkDayNo(r.startAt), c.toDay);
      for (let d = a; d <= b; d++) out.push({ ...base, id: a === b && d === bkkDayNo(r.startAt) ? `google:${r.id}` : `google:${r.id}:${dayNoToYmd(d)}`, startAt: dayStart(d).toISOString(), allDay: true, timeHint: null });
    } else {
      if (+r.startAt < +c.from) continue; // อีเวนต์ข้ามคืนที่เริ่มก่อนช่วง — แสดงในวันที่เริ่ม
      out.push({ ...base, id: `google:${r.id}`, startAt: r.startAt.toISOString(), ...(r.endAt && +r.endAt > +r.startAt ? { endAt: r.endAt.toISOString() } : {}), allDay: false, timeHint: r.endAt ? "DURATION" : null });
    }
  }
  return out;
}

// ─────────────────────────── รวม ───────────────────────────

function sortItems(items: AgendaItem[]): AgendaItem[] {
  return items.sort((a, b) => {
    const da = bkkDayNo(new Date(a.startAt)), dbb = bkkDayNo(new Date(b.startAt));
    return da - dbb || (a.allDay === b.allDay ? 0 : a.allDay ? -1 : 1) || a.startAt.localeCompare(b.startAt) || prio(a.source) - prio(b.source) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });
}

/** เพดาน 50 แถวต่อแหล่งต่อวัน — เกิน = ตัด + แถว "อีก N รายการ" (deepLink = หน้าของระบบจากแถวแรกที่ถูกตัด) */
function capPerDay(items: AgendaItem[]): AgendaItem[] {
  const groups = new Map<string, AgendaItem[]>();
  for (const it of items) {
    const k = `${it.source}|${bkkDayNo(new Date(it.startAt))}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(it);
  }
  const out: AgendaItem[] = [];
  for (const [k, g] of groups) {
    if (g.length <= PER_SOURCE_DAY_CAP) {
      out.push(...g);
      continue;
    }
    sortItems(g);
    const keep = g.slice(0, PER_SOURCE_DAY_CAP);
    const cut = g.slice(PER_SOURCE_DAY_CAP);
    out.push(...keep);
    const d = Number(k.split("|")[1]);
    const f = cut[0]!;
    out.push({
      id: `${f.source}:more:${dayNoToYmd(d)}`,
      source: f.source,
      title: `อีก ${cut.length} รายการ`,
      sub: null,
      label: f.label,
      startAt: dayStart(d).toISOString(),
      allDay: true,
      timeHint: null,
      deepLink: f.deepLink,
      checkable: false,
      done: false,
      mine: false,
      colorKey: f.colorKey,
      summary: { count: cut.length },
    });
  }
  return out;
}

type PrefRow = { sources: unknown; travelMinutes: number } | null;
async function prefOf(actor: Actor): Promise<PrefRow> {
  return tenantDb({ tenantId: actor.tenantId }).calPref.findFirst({ where: { userId: actor.userId, tenantId: actor.tenantId }, select: { sources: true, travelMinutes: true } });
}
const srcOn = (pref: PrefRow, key: string) => ((pref?.sources ?? {}) as Record<string, unknown>)[key] !== false;

/**
 * agenda ของผู้ใช้ในร้านนี้ ช่วงวันไทย `from..to` (รวมปลาย · ≤ 42 วัน)
 * เรียง: วัน → ทั้งวันก่อน → startAt → priority แหล่ง → id · conflictWith + conflicts จาก `conflicts()` (§11 · travelMinutes ของ CalPref)
 */
export async function agendaFor(actor: Actor, range: { from: string; to: string }, opts: AgendaOpts = {}): Promise<AgendaResult> {
  const f = ymdToDayNo(range.from), t = ymdToDayNo(range.to);
  if (f === null || t === null || t < f || t - f > AGENDA_MAX_DAYS - 1) throw new CalError(400, "invalid", "ช่วงวันไม่ถูกต้อง (ไม่เกิน 42 วัน)");
  const now = opts.now ?? new Date();
  const [c, pref, access] = await Promise.all([
    buildCtx(actor, f, t, now),
    prefOf(actor),
    opts.access ? Promise.resolve(opts.access) : loadAccess(actor.tenantId).catch(async (e) => {
      await logOps("WARN", "calendar", "agenda: อ่านระดับเลขาไม่ได้", { tenantId: actor.tenantId, detail: errDetail(e) }).catch(() => undefined);
      return undefined;
    }),
  ]);
  const deps = opts.deps;
  // (ก) ร้านมีระบบ/หน่วย (ข) ผู้ใช้เปิดแหล่ง (ค) ระดับเลขาไม่ OFF — (ง) อยู่ใน adapter
  const has: Record<Exclude<ShopSource, "tax">, boolean> = {
    booking: (c.units.get("BOOKING") ?? []).length > 0,
    account: (c.sys.get("ACCOUNT") ?? []).length > 0,
    kanban: (c.sys.get("KANBAN") ?? []).length > 0,
    crm: (c.sys.get("CRM") ?? []).length > 0,
    hr: (c.sys.get("HR") ?? []).length > 0,
    dorm: (c.units.get("DORM") ?? []).length > 0,
    ticket: (c.units.get("TICKET") ?? []).length > 0,
    trips: TRIPS_ADAPTER_ENABLED,
  };
  const off: Record<string, boolean> = {};
  for (const mod of ["booking", "account", "kanban", "crm", "hr", "dorm", "ticket"]) off[mod] = await isOff(access, mod);
  const run = (s: Exclude<ShopSource, "tax">): boolean => {
    if (!has[s] || !srcOn(pref, s)) return false;
    if (off[MODULE_OF[s]]) {
      if (!c.notes.some((n) => n.code === "SECTION_OFF" && n.source === s)) c.notes.push({ code: "SECTION_OFF", source: s, text: `เจ้าของร้านปิดไม่ให้เลขาใช้ระบบ${LABEL_TH[s] ?? s}` });
      return false;
    }
    return true;
  };
  const jobs: Promise<AgendaItem[]>[] = [
    part(c, "reminder", deps, () => personalAdapter(c)),
    part(c, "google", deps, () => googleAdapter(c)),
  ];
  if (run("booking")) jobs.push(part(c, "booking", deps, () => bookingAdapter(c)));
  if (run("account")) jobs.push(part(c, "account", deps, () => accountAdapter(c)));
  if (run("kanban")) jobs.push(part(c, "kanban", deps, () => kanbanAdapter(c)));
  if (run("crm")) jobs.push(part(c, "crm", deps, () => crmAdapter(c)));
  if (run("hr")) jobs.push(part(c, "hr", deps, () => hrAdapter(c)));
  if (run("dorm")) jobs.push(part(c, "dorm", deps, () => dormAdapter(c)));
  if (run("ticket")) jobs.push(part(c, "ticket", deps, () => ticketAdapter(c)));
  if (run("trips")) jobs.push(Promise.resolve([])); // R-CAL-8 — ไม่มีวันเข้าถึงจนเปิดธง
  // ภาษี: คีย์ tax ของผู้ใช้ + ระดับเลขาของโมดูลต้นทาง (บัญชี: ภ.พ.30 · ภ.ง.ด.3/53 · HR: ภ.ง.ด.1 · ปกส.)
  if (srcOn(pref, "tax") && (has.account || has.hr)) jobs.push(part(c, "tax", deps, () => taxAdapter(c, { account: !!off.account, hr: !!off.hr })));
  const items = capPerDay((await Promise.all(jobs)).flat());
  sortItems(items);
  const cf = computeConflicts(items, pref?.travelMinutes ?? 0, now);
  for (const it of items) if (cf.byId[it.id]) it.conflictWith = cf.byId[it.id];
  // notes เรียงตามแหล่งให้คงที่
  c.notes.sort((a, b) => prio(a.source) - prio(b.source) || a.code.localeCompare(b.code));
  return { items, conflicts: cf.notes, notes: c.notes };
}

/** จุดสีต่อวันของเดือน (≤ 3 สี เรียง priority · ไม่รวม device — แอปเติม) */
export async function monthDots(actor: Actor, ym: string, opts: AgendaOpts = {}): Promise<Record<string, ColorKey[]>> {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!m || +m[2]! < 1 || +m[2]! > 12) throw new CalError(400, "invalid", "เดือนไม่ถูกต้อง");
  const first = ymdToDayNo(`${m[1]}-${m[2]}-01`)!;
  const nextFirst = ymdToDayNo(+m[2]! === 12 ? `${+m[1]! + 1}-01-01` : `${m[1]}-${String(+m[2]! + 1).padStart(2, "0")}-01`)!;
  const r = await agendaFor(actor, { from: dayNoToYmd(first), to: dayNoToYmd(nextFirst - 1) }, opts);
  const best = new Map<string, Map<ColorKey, number>>();
  for (const it of r.items) {
    const day = dayNoToYmd(bkkDayNo(new Date(it.startAt)));
    const mm = best.get(day) ?? best.set(day, new Map()).get(day)!;
    const p = prio(it.source);
    if (!mm.has(it.colorKey) || mm.get(it.colorKey)! > p) mm.set(it.colorKey, p);
  }
  const out: Record<string, ColorKey[]> = {};
  for (const [day, mm] of best) out[day] = [...mm].sort((a, b) => a[1] - b[1]).slice(0, 3).map(([k]) => k);
  return out;
}

// ─────────────────────────── badge (§8.2 · R-CAL-19) ───────────────────────────

const BADGE_TTL_MS = 60_000;
const badgeCache = new Map<string, { at: number; n: number }>();

/**
 * เรื่องวันนี้ที่ติ๊กได้และยังไม่เสร็จ — count ตรง (ไม่เรียก agendaFor) · แคช 60 วิต่อ (ร้าน, ผู้ใช้) · ส่วนที่ล้ม = 0 + logOps WARN
 *   CalItem REMINDER OPEN ที่ occursAt วันนี้ + การ์ดของฉัน dueAt วันนี้ completedAt null (บอร์ดที่มองเห็น) +
 *   กิจกรรม CRM ของฉัน (startAt ?? dueAt) วันนี้ doneAt null (§8.2 ตรงตัว — ทุกชนิด) · ไม่นับแหล่งที่ปิดใน CalPref.sources หรือระดับเลขา OFF
 */
export async function todayOpenCount(actor: Actor, now: Date = new Date(), opts: { noCache?: boolean; access?: AccessMap } = {}): Promise<number> {
  const key = `${actor.tenantId}:${actor.userId}`;
  const hit = badgeCache.get(key);
  if (!opts.noCache && hit && Date.now() - hit.at < BADGE_TTL_MS) return hit.n;
  const d = bkkDayNo(now);
  const from = dayStart(d), toEx = dayStart(d + 1);
  const db = tenantDb({ tenantId: actor.tenantId });
  const safe = async (name: string, fn: () => Promise<number>): Promise<number> => {
    try {
      return await fn();
    } catch (e) {
      await logOps("WARN", "calendar", `badge: ส่วน ${name} นับไม่ได้`, { tenantId: actor.tenantId, detail: errDetail(e) }).catch(() => undefined);
      return 0;
    }
  };
  const [pref, access, systems] = await Promise.all([
    prefOf(actor).catch(() => null),
    opts.access ? Promise.resolve(opts.access) : loadAccess(actor.tenantId).catch(() => undefined),
    db.appSystem.findMany({ where: { tenantId: actor.tenantId, active: true, type: { in: ["KANBAN", "CRM"] } }, select: { id: true, type: true, settings: true } }).catch(() => []),
  ]);
  const mine = safe("reminder", () => db.calItem.count({ where: { userId: actor.userId, tenantId: actor.tenantId, status: "OPEN", kind: "REMINDER", occursAt: { gte: from, lt: toEx } } }));
  const kanban = safe("kanban", async () => {
    const ks = systems.filter((s) => s.type === "KANBAN");
    if (!ks.length || !srcOn(pref, "kanban") || (await isOff(access, "kanban"))) return 0;
    const { visibleBoardsWhere } = await import("@/lib/modules/kanban/access");
    const m = actor.membership;
    const kActor = { userId: actor.userId, role: m.role, unitAccess: m.unitAccess, permissions: m.permissions };
    let n = 0;
    for (const s of ks) {
      n += await tenantDb({ tenantId: actor.tenantId, systemId: s.id }).kanbanCard.count({
        where: {
          tenantId: actor.tenantId,
          systemId: s.id,
          status: "ACTIVE",
          completedAt: null,
          dueAt: { gte: from, lt: toEx },
          OR: [{ assigneeUserId: actor.userId }, { assignees: { some: { userId: actor.userId } } }],
          board: { AND: [visibleBoardsWhere(kActor), { tenantId: actor.tenantId, systemId: s.id, status: "ACTIVE" }] },
        },
      });
    }
    return n;
  });
  const crmN = safe("crm", async () => {
    const cs = systems.filter((s) => s.type === "CRM");
    if (!cs.length || !srcOn(pref, "crm") || (await isOff(access, "crm"))) return 0;
    const crm = await import("@/lib/modules/crm");
    const { toMemberActor } = await import("@/lib/modules/member");
    const a = toMemberActor(actor.userId, actor.membership);
    let n = 0;
    for (const s of cs) {
      if (crm.parseCrmSettings(s.settings as never).uiVersion !== 2) continue;
      const ctx = { tenantId: actor.tenantId, systemId: s.id };
      const w = await crm.activityWhere(ctx, a);
      const range = { gte: from, lt: toEx };
      n += await tenantDb(ctx).crmActivity.count({
        where: { AND: [w, { tenantId: actor.tenantId, systemId: s.id, ownerUserId: actor.userId, doneAt: null }, { OR: [{ startAt: range }, { startAt: null, dueAt: range }] }] },
      });
    }
    return n;
  });
  const total = (await Promise.all([mine, kanban, crmN])).reduce((s, x) => s + x, 0);
  if (badgeCache.size > 5_000) badgeCache.clear();
  badgeCache.set(key, { at: Date.now(), n: total });
  return total;
}

// ─────────────────────────── ติ๊กเสร็จรายการของระบบอื่น (จอ 3 · §8 source-done) ───────────────────────────

export type SourceDoneResult = { ok: true } | { ok: false; code: "NO_DONE_COLUMN" | "FORBIDDEN" | "NOT_FOUND" | "BLOCKED"; message?: string };

/**
 * ผ่านกติกาของระบบต้นทางเท่านั้น: การ์ด = `completeCard` (ย้ายเข้าคอลัมน์ "เสร็จ" · ต้อง EDITOR) · CRM = `completeActivity`
 * เฉพาะ "ของฉัน" ที่ปฏิทินแสดง (การ์ดที่ฉันรับผิดชอบ · กิจกรรมที่ฉันเป็นเจ้าของ ชนิดติ๊กได้) — อื่น = NOT_FOUND
 * ระดับเลขา OFF ของโมดูลนั้น = NOT_FOUND (ไม่แสดงในปฏิทินอยู่แล้ว)
 */
export async function completeSourceItem(actor: Actor, ref: { source: "kanban" | "crm"; id: string }, now?: Date): Promise<SourceDoneResult> {
  void now;
  const db = tenantDb({ tenantId: actor.tenantId });
  const access = await loadAccess(actor.tenantId).catch(() => undefined);
  badgeCache.delete(`${actor.tenantId}:${actor.userId}`);
  if (ref.source === "kanban") {
    if (await isOff(access, "kanban")) return { ok: false, code: "NOT_FOUND" };
    const systems = await db.appSystem.findMany({ where: { tenantId: actor.tenantId, type: "KANBAN", active: true }, select: { id: true } });
    for (const s of systems) {
      const card = await tenantDb({ tenantId: actor.tenantId, systemId: s.id }).kanbanCard.findFirst({
        where: { tenantId: actor.tenantId, systemId: s.id, id: ref.id, status: "ACTIVE", OR: [{ assigneeUserId: actor.userId }, { assignees: { some: { userId: actor.userId } } }] },
        select: { id: true, completedAt: true },
      });
      if (!card) continue;
      const { KanbanForbiddenError, KanbanNotFoundError } = await import("@/lib/modules/kanban/access");
      const { completeCard } = await import("@/lib/modules/kanban/my-tasks");
      try {
        if (card.completedAt) return { ok: true }; // เสร็จอยู่แล้ว = ซ้ำได้
        const r = await completeCard({ tenantId: actor.tenantId, systemId: s.id, actorUserId: actor.userId }, card.id);
        if (r.ok) return { ok: true };
        if (r.code === "NO_DONE_COLUMN") return { ok: false, code: "NO_DONE_COLUMN" };
        if (r.code === "WIP_LIMIT") return { ok: false, code: "BLOCKED", message: r.message };
        return { ok: false, code: "NOT_FOUND" };
      } catch (e) {
        if (e instanceof KanbanForbiddenError) return { ok: false, code: "FORBIDDEN", message: "บอร์ดนี้คุณดูได้อย่างเดียว" };
        if (e instanceof KanbanNotFoundError) return { ok: false, code: "NOT_FOUND" };
        throw e;
      }
    }
    return { ok: false, code: "NOT_FOUND" };
  }
  if (await isOff(access, "crm")) return { ok: false, code: "NOT_FOUND" };
  const systems = await db.appSystem.findMany({ where: { tenantId: actor.tenantId, type: "CRM", active: true }, select: { id: true, settings: true } });
  const crm = await import("@/lib/modules/crm");
  const { toMemberActor } = await import("@/lib/modules/member");
  const a = toMemberActor(actor.userId, actor.membership);
  for (const s of systems) {
    if (crm.parseCrmSettings(s.settings as never).uiVersion !== 2) continue;
    const ctx = { tenantId: actor.tenantId, systemId: s.id };
    const w = await crm.activityWhere(ctx, a);
    const row = await tenantDb(ctx).crmActivity.findFirst({
      where: { AND: [w, { tenantId: actor.tenantId, systemId: s.id, id: ref.id, ownerUserId: actor.userId }] },
      select: { id: true, type: true, doneAt: true },
    });
    if (!row) continue;
    if (!CRM_CHECKABLE_TYPES.includes(row.type)) return { ok: false, code: "NOT_FOUND" };
    if (row.doneAt) return { ok: true };
    if (!crm.crmCan(a, "crm.activity.complete")) return { ok: false, code: "FORBIDDEN", message: "บัญชีนี้ยังไม่ได้รับสิทธิ์ปิดกิจกรรม — ขอให้เจ้าของร้านเปิดสิทธิ์ให้" };
    try {
      await crm.activities.completeActivity({ ...ctx, actorUserId: actor.userId }, a, row.id);
      return { ok: true };
    } catch (e) {
      const code = (e as { code?: unknown })?.code;
      if (code === "FORBIDDEN") return { ok: false, code: "FORBIDDEN", message: e instanceof Error ? e.message : undefined };
      if (code === "NOT_FOUND") return { ok: false, code: "NOT_FOUND" };
      throw e;
    }
  }
  return { ok: false, code: "NOT_FOUND" };
}
