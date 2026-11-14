// agenda.ts — ตัวรวม agenda (สัญญา §4 · ใบ CAL1.3 ของเลน b)
// STUB until CAL1.3 — เลน a วางไว้ให้ CAL1.5 (สรุปเช้า/เย็น) และ CAL1.6 (route agenda/month/today/badges) ต่อสายได้ก่อน
//   คืนเฉพาะ CalItem ของผู้ใช้ในร้านนี้ (reminder/event) · ไม่มี adapter ของร้าน/Google · conflicts ว่าง
//   🔴 เลน b แทนที่ไฟล์นี้ทั้งไฟล์ — คงชื่อ/ลายเซ็นที่ export ตามสัญญา §3.2 + ชนิด §4.1
import { tenantDb } from "@/lib/core/db";
import type { MembershipCtx } from "@/lib/core/rbac";
import { dayNoToYmd, occurrences, ymdToDayNo, BKK_OFFSET_MS, bkkDayNo } from "./next-fire";

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
export type AgendaResult = {
  items: AgendaItem[];
  conflicts: ConflictNote[];
  notes: { code: "BOOKING_UNLINKED" | "SECTION_FAILED" | "SECTION_OFF"; source: AgendaSource; text: string }[];
};
type Actor = { userId: string; tenantId: string; membership: MembershipCtx };

const DAY_MS = 86_400_000;
const dayStart = (d: number) => new Date(d * DAY_MS - BKK_OFFSET_MS);

export async function agendaFor(actor: Actor, range: { from: string; to: string }, opts: { now?: Date } = {}): Promise<AgendaResult> {
  void opts;
  const f = ymdToDayNo(range.from), t = ymdToDayNo(range.to);
  if (f === null || t === null || t < f || t - f > 41) throw new Error("ช่วงวันไม่ถูกต้อง (ไม่เกิน 42 วัน)");
  const from = dayStart(f), to = new Date(+dayStart(t + 1) - 1);
  const rows = await tenantDb({ tenantId: actor.tenantId }).calItem.findMany({
    where: { userId: actor.userId, tenantId: actor.tenantId, status: { in: ["OPEN", "DONE"] }, startAt: { lte: to } },
    take: 500,
  });
  const items: AgendaItem[] = [];
  for (const r of rows) {
    for (const o of occurrences(r, from, to)) {
      const occ = r.allDay ? dayStart(bkkDayNo(o)) : o;
      const done = r.repeat === "NONE" ? r.status === "DONE" : +o < +r.occursAt;
      const dur = r.endAt ? +r.endAt - +r.startAt : 0;
      items.push({
        id: r.repeat === "NONE" ? `${r.kind === "EVENT" ? "event" : "reminder"}:${r.id}` : `${r.kind === "EVENT" ? "event" : "reminder"}:${r.id}@${o.toISOString()}`,
        source: r.kind === "EVENT" ? "event" : "reminder",
        title: r.title.length > 120 ? `${r.title.slice(0, 119)}…` : r.title,
        sub: r.kind === "EVENT" ? `นัดส่วนตัว · สร้างในแอป${r.externalId ? " → ส่งไป Google แล้ว" : ""}` : r.note?.split(/\r?\n/)[0] ?? null,
        label: r.kind === "EVENT" ? "นัดส่วนตัว" : "เตือนฉัน",
        startAt: occ.toISOString(),
        ...(dur > 0 ? { endAt: new Date(+occ + dur).toISOString() } : {}),
        allDay: r.allDay,
        timeHint: r.kind === "EVENT" ? "DURATION" : "REMIND",
        deepLink: { kind: "app", path: `/secretary/calendar?day=${dayNoToYmd(bkkDayNo(o))}&item=${r.id}` },
        checkable: r.kind === "REMINDER",
        done,
        mine: true,
        colorKey: r.kind === "EVENT" ? "personal" : "remind",
        ref: { itemId: r.id, occ: o.toISOString() },
      });
    }
  }
  items.sort((a, b) => (a.allDay === b.allDay ? a.startAt.localeCompare(b.startAt) || a.id.localeCompare(b.id) : a.allDay ? -1 : 1));
  return { items, conflicts: [], notes: [] };
}

export async function monthDots(actor: Actor, ym: string, opts: { now?: Date } = {}): Promise<Record<string, ColorKey[]>> {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!m || +m[2] < 1 || +m[2] > 12) throw new Error("เดือนไม่ถูกต้อง");
  const first = `${m[1]}-${m[2]}-01`;
  const last = dayNoToYmd(ymdToDayNo(+m[2] === 12 ? `${+m[1] + 1}-01-01` : `${m[1]}-${String(+m[2] + 1).padStart(2, "0")}-01`)! - 1);
  const r = await agendaFor(actor, { from: first, to: last }, opts);
  const out: Record<string, ColorKey[]> = {};
  for (const it of r.items) {
    const day = dayNoToYmd(bkkDayNo(new Date(it.startAt)));
    const set = (out[day] ??= []);
    if (!set.includes(it.colorKey) && set.length < 3) set.push(it.colorKey);
  }
  return out;
}

export async function todayOpenCount(actor: Actor, now: Date = new Date()): Promise<number> {
  const d = bkkDayNo(now);
  return tenantDb({ tenantId: actor.tenantId }).calItem.count({
    where: { userId: actor.userId, tenantId: actor.tenantId, status: "OPEN", kind: "REMINDER", occursAt: { gte: dayStart(d), lt: dayStart(d + 1) } },
  });
}

export async function completeSourceItem(
  actor: Actor,
  ref: { source: "kanban" | "crm"; id: string },
  now?: Date,
): Promise<{ ok: true } | { ok: false; code: "NO_DONE_COLUMN" | "FORBIDDEN" | "NOT_FOUND" }> {
  void actor; void ref; void now;
  return { ok: false, code: "NOT_FOUND" }; // STUB until CAL1.3
}
