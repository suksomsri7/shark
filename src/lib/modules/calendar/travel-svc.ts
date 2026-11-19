// travel-svc.ts — Q8 เผื่อเวลาเดินทาง: อ่าน/ยืนยัน/ข้าม/กฎ (สัญญา §16.4) — actor เท่านั้น (M3) · tenantDb (ไม่ใช้ prisma ดิบ)
//   🔴 confirm คำนวณคู่ใหม่จาก agenda ของผู้ใช้เอง — ไม่เชื่อเวลา/ชื่อจากแอป · มีแต่ route confirm (ผู้ใช้กด) ที่สร้างเตือนออกเดินทาง
import { tenantDb } from "@/lib/core/db";
import { agendaFor, type AgendaItem } from "./agenda";
import { CalError, createItem, type CalActor, type CalItemDto } from "./items";
import { ymdToDayNo } from "./next-fire";
import { isTravelTypeKey, travelSuggestions, travelTypeLabel, TRAVEL_MAX_MIN, type CalendarOf, type TravelSuggestion } from "./travel";

export type TravelRuleDto = { typeKey: string; label: string; sub: string | null; minutes: number; updatedAt: string };
const DISMISS_KEEP_MS = 60 * 86_400_000;

const db = (a: { tenantId: string }) => tenantDb({ tenantId: a.tenantId });
const badDay = () => new CalError(400, "invalid", "วันไม่ถูกต้อง");
const badMinutes = () => new CalError(400, "invalid", `นาทีเผื่อเดินทางไม่ถูกต้อง (0–${TRAVEL_MAX_MIN})`);

/** ปฏิทินของแถว google (`google:<CalExternalEvent.id>`) — ของผู้ใช้เท่านั้น */
async function calendarOf(actor: CalActor, items: AgendaItem[]): Promise<CalendarOf> {
  const ids = new Map<string, string>(); // rowId → agenda id
  for (const i of items) if (i.source === "google") ids.set(i.id.split(":")[1] ?? "", i.id);
  if (!ids.size) return {};
  const d = db(actor);
  const rows = await d.calExternalEvent.findMany({ where: { userId: actor.userId, id: { in: [...ids.keys()] } }, select: { id: true, calendarId: true, linkId: true } });
  const links = await d.calLink.findMany({ where: { userId: actor.userId, id: { in: [...new Set(rows.map((r) => r.linkId))] } }, select: { id: true, calendars: true } });
  const nameOf = new Map<string, string>();
  for (const l of links) for (const c of (Array.isArray(l.calendars) ? l.calendars : []) as { id?: unknown; name?: unknown }[]) if (typeof c.id === "string") nameOf.set(c.id, typeof c.name === "string" ? c.name : "");
  const out: CalendarOf = {};
  for (const r of rows) out[ids.get(r.id)!] = { calendarId: r.calendarId, name: nameOf.get(r.calendarId) ?? "" };
  return out;
}

async function rulesOf(actor: CalActor) {
  return db(actor).calTravelRule.findMany({ where: { userId: actor.userId, tenantId: actor.tenantId }, select: { typeKey: true, minutes: true, label: true, updatedAt: true } });
}
async function dismissedOf(actor: CalActor): Promise<string[]> {
  const rows = await db(actor).calTravelDismissal.findMany({ where: { userId: actor.userId, tenantId: actor.tenantId }, select: { pairKey: true }, take: 2000, orderBy: { dismissedAt: "desc" } });
  return rows.map((r) => r.pairKey);
}

/** ข้อเสนอจากผล agenda ที่มีอยู่แล้ว (route agenda ใช้ — ไม่อ่าน agenda ซ้ำ) */
export async function travelForItems(actor: CalActor, items: AgendaItem[], now = new Date(), opts: { ignoreDismissed?: boolean } = {}): Promise<{ suggestions: TravelSuggestion[]; calendarOf: CalendarOf }> {
  const [rules, dismissed, cal] = await Promise.all([rulesOf(actor), opts.ignoreDismissed ? Promise.resolve([]) : dismissedOf(actor), calendarOf(actor, items)]);
  return { suggestions: travelSuggestions(items, rules, dismissed, now, { calendarOf: cal }), calendarOf: cal };
}

export async function travelForDay(actor: CalActor, day: string, now = new Date(), opts: { ignoreDismissed?: boolean } = {}): Promise<{ suggestions: TravelSuggestion[]; items: AgendaItem[]; calendarOf: CalendarOf }> {
  if (ymdToDayNo(day) === null) throw badDay();
  const ag = await agendaFor(actor, { from: day, to: day }, { now });
  const r = await travelForItems(actor, ag.items, now, opts);
  return { ...r, items: ag.items };
}

async function pairOf(actor: CalActor, pairKey: string, day: string, now: Date) {
  const r = await travelForDay(actor, day, now, { ignoreDismissed: true });
  const s = r.suggestions.find((x) => x.pairKey === pairKey);
  if (!s) throw new CalError(404, "not_found", "ไม่พบนัดคู่นี้แล้ว — ลองดึงปฏิทินใหม่");
  return { s, next: r.items.find((i) => i.id === s.nextId)! };
}

async function dismissPair(actor: CalActor, pairKey: string, now: Date): Promise<void> {
  // tenantDb ห่อ where ของ upsert ด้วย AND (ใช้กับ unique ไม่ได้) ⇒ อ่าน-แล้ว-เขียน · ชนกันพร้อมกัน = unique กันซ้ำ
  const d = db(actor);
  const cur = await d.calTravelDismissal.findFirst({ where: { userId: actor.userId, tenantId: actor.tenantId, pairKey }, select: { id: true } });
  if (cur) await d.calTravelDismissal.updateMany({ where: { id: cur.id, userId: actor.userId, tenantId: actor.tenantId }, data: { dismissedAt: now } });
  else await d.calTravelDismissal.create({ data: { userId: actor.userId, tenantId: actor.tenantId, pairKey, dismissedAt: now } }).catch(() => undefined);
  // เก็บกวาดของเก่า (> 60 วัน) ของผู้ใช้คนนี้แบบพ่วง (ไม่มี job แยก)
  await db(actor).calTravelDismissal.deleteMany({ where: { userId: actor.userId, tenantId: actor.tenantId, dismissedAt: { lt: new Date(+now - DISMISS_KEEP_MS) } } });
}

function ruleDto(r: { typeKey: string; minutes: number; label: string | null; updatedAt: Date }): TravelRuleDto {
  const l = travelTypeLabel(r.typeKey, r.label);
  return { typeKey: r.typeKey, label: l.label, sub: l.sub, minutes: r.minutes, updatedAt: r.updatedAt.toISOString() };
}

async function upsertRule(actor: CalActor, typeKey: string, minutes: number, label: string | null) {
  const d = db(actor);
  const where = { userId: actor.userId, tenantId: actor.tenantId, typeKey };
  const cur = await d.calTravelRule.findFirst({ where, select: { id: true } });
  if (cur) await d.calTravelRule.updateMany({ where: { id: cur.id, userId: actor.userId, tenantId: actor.tenantId }, data: { minutes, ...(label ? { label } : {}) } });
  else {
    try {
      await d.calTravelRule.create({ data: { ...where, minutes, label } });
    } catch {
      await d.calTravelRule.updateMany({ where, data: { minutes, ...(label ? { label } : {}) } }); // สร้างพร้อมกัน
    }
  }
  const r = await d.calTravelRule.findFirst({ where, select: { typeKey: true, minutes: true, label: true, updatedAt: true } });
  return ruleDto(r!);
}

/** ผู้ใช้กดยืนยัน (จอ q8-1 "ยืนยัน" · q8-2 "ใช่ เตือนเลย"/"เปลี่ยน…") */
export async function confirmTravel(
  actor: CalActor,
  input: { pairKey: string; day: string; minutes: number; remember: boolean },
  now = new Date(),
): Promise<{ item: CalItemDto | null; rule: TravelRuleDto | null }> {
  if (!Number.isInteger(input.minutes) || input.minutes < 0 || input.minutes > TRAVEL_MAX_MIN) throw badMinutes();
  const { s, next } = await pairOf(actor, input.pairKey, input.day, now);
  let item: CalItemDto | null = null;
  if (input.minutes > 0) {
    const leave = new Date(Date.parse(s.nextStartAt) - input.minutes * 60_000);
    if (+leave <= +now) throw new CalError(400, "past_time", "เวลาออกเดินทางผ่านไปแล้ว");
    item = await createItem(actor, { kind: "REMINDER", title: `ออกเดินทางไป ${next.title}`.slice(0, 200), startAt: leave, leadMinutes: 0 }, { source: "SUGGEST", now });
  }
  const rule = input.remember ? await upsertRule(actor, s.typeKey, input.minutes, s.typeKey.includes(":") ? s.typeLabel : null) : null;
  await dismissPair(actor, input.pairKey, now);
  return { item, rule };
}

/** "ข้าม" / "ไม่ต้อง" ของคู่นี้ */
export async function dismissTravel(actor: CalActor, input: { pairKey: string; day: string }, now = new Date()): Promise<{ ok: true }> {
  await pairOf(actor, input.pairKey, input.day, now);
  await dismissPair(actor, input.pairKey, now);
  return { ok: true };
}

export async function listTravelRules(actor: CalActor): Promise<TravelRuleDto[]> {
  return (await rulesOf(actor)).map((r) => ruleDto(r)).sort((a, b) => a.label.localeCompare(b.label, "th"));
}

export async function putTravelRule(actor: CalActor, typeKey: string, input: { minutes: number; label?: string | null }): Promise<TravelRuleDto> {
  if (!isTravelTypeKey(typeKey)) throw new CalError(400, "invalid", "ประเภทนัดไม่ถูกต้อง");
  if (!Number.isInteger(input.minutes) || input.minutes < 0 || input.minutes > TRAVEL_MAX_MIN) throw badMinutes();
  const label = typeof input.label === "string" && input.label.trim() ? input.label.trim().slice(0, 120) : null;
  return upsertRule(actor, typeKey, input.minutes, label);
}

export async function deleteTravelRule(actor: CalActor, typeKey: string): Promise<{ ok: true }> {
  await db(actor).calTravelRule.deleteMany({ where: { userId: actor.userId, tenantId: actor.tenantId, typeKey } });
  return { ok: true };
}
