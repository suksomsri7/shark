// tools-calendar.ts — เครื่องมือเลขา "ปฏิทินส่วนตัว" 5 ตัว (CAL1.7 · สัญญา docs/modules/32-secretary-calendar.md §9 · R-CAL-18/20/28)
//
// 🔴 M3 (บังคับด้วยโครงสร้าง): ไม่มีพารามิเตอร์ผู้รับ/ผู้ใช้ในสคีมาใดเลย (`additionalProperties: false`) — เจ้าของ = ผู้กระทำ (`ctx.actor.userId`) เสมอ
//    ผู้กระทำต้องเป็นสมาชิก (`kind === "member"`) — คีย์ API / งานภายใน = ปฏิเสธ (ด่าน HAND_TOOL_ACCESS writesNow กันคีย์ API อีกชั้น)
// 🔴 ข้อมูลส่วนตัว ⇒ ไม่ผ่านด่านอนุมัติของร้าน (ไม่ใช่ `action: true`) · ระดับเลขาของร้านไม่ตัด (HAND_TOOL_CORE · มติ Q2)
//    `calendar_agenda` ตัดแหล่งของร้านที่ระดับ OFF ในตัว (agendaFor + `access`) และบอกส่วนที่ข้ามด้วย `skippedSectionNote`
// 🔴 ห้าม `recordAction`/AiActionLog (R-CAL-20 — OWNER เห็นทุกแถว) · การ์ดในห้องวาดจาก CalItem.roomId (= AiRoom.id · D-A19)
// 🔴 ผลเป็น JSON (ไม่ใช่สตริง "OK …" ตามตัวอย่างสัญญา §9.2) — runTool ปิดตัวเลขยาวในผลที่ไม่ใช่ JSON ทั้งก้อน (id แบบ cuid อาจโดน)
//    คีย์ id ชื่อ …Id จึงรอดการปิด (D-B15)
// 🔴 ไฟล์นี้โหลดในทะเบียน AI (fitness F10 โหมดไร้ env) ⇒ โมดูลปฏิทินโหลดตอนเรียกเท่านั้น (dynamic import)
import type { AiTool, ToolCtx } from "./tools";
import type { AiMemberActor } from "./actor";

const BKK_MS = 7 * 3_600_000;
const LEADS = [0, 5, 10, 15, 30, 60, 120, 1440] as const;
const WD_TH = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];

const LINK_SCHEMA = {
  type: "object",
  required: ["type", "id"],
  additionalProperties: false,
  properties: {
    type: { type: "string", enum: ["CRM_CONTACT", "CRM_DEAL", "ACCOUNT_DOC", "KANBAN_CARD"] },
    id: { type: "string", description: "Id from a CRM/accounting/task-board tool result." },
  },
} as const;

const WHEN_PROPS = {
  whenISO: { type: "string", description: "Start time, ISO-8601 with +07:00 (Thai time), e.g. 2026-11-17T15:00:00+07:00. For allDay a date YYYY-MM-DD is enough." },
  inMinutes: { type: "integer", minimum: 1, maximum: 10080, description: "Instead of whenISO for relative times: 'in half an hour' = 30, 'in 2 hours' = 120." },
  endISO: { type: "string", description: "EVENT only: end time, ISO-8601 +07:00." },
  allDay: { type: "boolean" },
  repeat: { type: "string", enum: ["NONE", "DAILY", "WEEKLY", "MONTHLY"], description: "MONTHLY repeats on the day-of-month of whenISO (29-31 falls back to the last day of shorter months)." },
  repeatDays: { type: "array", items: { type: "integer", minimum: 0, maximum: 6 }, description: "WEEKLY: weekdays 0=Sunday..6=Saturday." },
  leadMinutes: { type: "integer", enum: [...LEADS], description: "Remind this many minutes before (default 0; EVENT default 15)." },
} as const;

const DEFS = {
  calendar_add: {
    name: "calendar_add",
    description:
      "Add a personal reminder (REMINDER, default) or personal appointment (EVENT) to the calendar of THE USER WHO IS TALKING, and nobody else. " +
      "Never use it to remind, notify or schedule for another person (a staff member, the team, 'everyone'), even by putting their name in the title: " +
      "politely say each person's calendar is their own and offer to assign a task-board card to that person instead. 'Remind me to call X' is the user's own reminder and is fine. " +
      "Not for recurring work the assistant should perform or report (that is schedule_task). " +
      "Convert Thai time words yourself using today's date from the system prompt (3 pm = 15:00, this evening = 18:00, tonight = 20:00); use inMinutes for 'in N minutes/hours'. " +
      "If the day or time is missing or vague (e.g. 'early next month', 'in the afternoon', 'next week' without a day) ask with ask_clarify instead of guessing. " +
      "Repeating reminders are saved as a draft the user confirms on the card. The result has no details on purpose: reply only that it is set and the card below shows it.",
    parameters: {
      type: "object",
      required: ["title"],
      additionalProperties: false,
      properties: {
        kind: { type: "string", enum: ["REMINDER", "EVENT"] },
        title: { type: "string", maxLength: 200, description: "What to remind, in the user's words (Thai)." },
        ...WHEN_PROPS,
        link: { ...LINK_SCHEMA, description: "Optional: attach a CRM contact/deal, invoice or task card the user can see." },
        note: { type: "string", maxLength: 2000 },
      },
    },
  },
  calendar_update: {
    name: "calendar_update",
    description:
      "Change one of the user's own reminders/appointments: pick it by itemId (from calendar_add) or by match (the user's words for it, e.g. 'call Ek'). " +
      "Fields: title, time, repeat, lead time, link (null removes), note. confirm=true turns a draft repeating reminder into an active one after the user says yes. " +
      "Making a one-time reminder repeat creates a new draft the user confirms on the card.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        itemId: { type: "string" },
        match: { type: "string", maxLength: 100, description: "Words from the reminder's title when you have no itemId." },
        title: { type: "string", maxLength: 200 },
        ...WHEN_PROPS,
        link: { anyOf: [LINK_SCHEMA, { type: "null" }] },
        note: { type: "string", maxLength: 2000 },
        confirm: { type: "boolean" },
      },
    },
  },
  calendar_cancel: {
    name: "calendar_cancel",
    description: "Cancel one of the user's own reminders/appointments, by itemId or by match (words from its title).",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: { itemId: { type: "string" }, match: { type: "string", maxLength: 100 } },
    },
  },
  calendar_list: {
    name: "calendar_list",
    description:
      "Show the user their own reminders/appointments. Returns only counts; the list itself is shown to the user in a private card. Reply with the count and point to the card.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: { status: { type: "string", enum: ["OPEN", "DONE"] } },
    },
  },
  calendar_agenda: {
    name: "calendar_agenda",
    description:
      "Show the user their day/agenda (their reminders and appointments plus what the shop systems show them). Up to 14 days. " +
      "Returns only counts per system; the items are shown to the user in a private card. Reply with the count and point to the card; never guess item details.",
    parameters: {
      type: "object",
      required: ["fromDate"],
      additionalProperties: false,
      properties: {
        fromDate: { type: "string", description: "YYYY-MM-DD (Thai date)" },
        toDate: { type: "string", description: "YYYY-MM-DD, at most 14 days after fromDate; default = fromDate" },
      },
    },
  },
} as const;

export const CALENDAR_TOOL_NAMES = Object.keys(DEFS) as (keyof typeof DEFS)[];

const rec = (a: unknown): Record<string, unknown> => (a && typeof a === "object" && !Array.isArray(a) ? (a as Record<string, unknown>) : {});
const err = (code: string, message: string) => JSON.stringify({ error: `${code}: ${message}` });

/** ผู้กระทำ → CalActor (สมาชิกเท่านั้น) */
function calActorOf(ctx: ToolCtx): { userId: string; tenantId: string; membership: AiMemberActor["membership"] } | null {
  const a = ctx.actor;
  if (!a || a.kind !== "member" || a.tenantId !== ctx.tenantId) return null;
  return { userId: a.userId, tenantId: ctx.tenantId, membership: a.membership };
}

// ───────── เวลา (ตรวจซ้ำฝั่งเซิร์ฟเวอร์ · §9.2) ─────────

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|\+07:00|\+0700)$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** whenISO → Date · ไม่มี offset / offset อื่น / parse ไม่ได้ = null · all-day รับวันล้วน (เที่ยงคืนไทย) */
export function parseWhenISO(v: unknown, allDay = false): Date | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  const d = DATE_RE.exec(s);
  if (d) {
    if (!allDay) return null;
    const t = Date.UTC(+d[1]!, +d[2]! - 1, +d[3]!) - BKK_MS;
    const back = new Date(t + BKK_MS);
    return back.getUTCMonth() === +d[2]! - 1 && back.getUTCDate() === +d[3]! ? new Date(t) : null;
  }
  const m = ISO_RE.exec(s);
  if (!m) return null;
  const [, y, mo, da, h, mi, se] = m;
  if (+mo! < 1 || +mo! > 12 || +da! < 1 || +da! > 31 || +h! > 23 || +mi! > 59 || (se && +se > 59)) return null;
  const t = Date.parse(s.replace("+0700", "+07:00"));
  if (!Number.isFinite(t)) return null;
  // วันที่ไม่มีจริง (31 พ.ย.) — Date.parse เลื่อนเดือน ⇒ ปฏิเสธ
  const local = new Date(t + (m[7] === "Z" ? 0 : BKK_MS));
  if (local.getUTCDate() !== +da! || local.getUTCMonth() !== +mo! - 1) return null;
  return new Date(t);
}

/**
 * เวลาเริ่มของ calendar_add/update จากอาร์กิวเมนต์ (ใช้ร่วมกับตัวตรวจ eval) — MONTHLY ที่วันที่ไม่มีในเดือนนั้น (เช่น 31 พ.ย. "ทุกวันที่ 31")
 *   = เลื่อนไปเดือนถัดไปที่มีวันนั้น (เจตนา "ทุกวันที่ N" · เดือนสั้นในรอบถัด ๆ ไปเตือนวันสุดท้ายตามกติกา §5.1) · อื่น = parseWhenISO
 */
export function startFromArgs(a: Record<string, unknown>, now: Date): Date | null {
  if (typeof a.inMinutes === "number" && Number.isInteger(a.inMinutes) && a.inMinutes >= 1 && a.inMinutes <= 10_080) return new Date(Math.ceil((+now + a.inMinutes * 60_000) / 60_000) * 60_000);
  const d = parseWhenISO(a.whenISO, a.allDay === true);
  if (d || a.repeat !== "MONTHLY" || typeof a.whenISO !== "string") return d;
  const m = /^(\d{4})-(\d{2})-(29|30|31)(T.*)?$/.exec(a.whenISO.trim());
  if (!m) return null;
  for (let k = 0; k < 12; k++) {
    const y = +m[1]! + Math.floor((+m[2]! - 1 + k) / 12), mo = ((+m[2]! - 1 + k) % 12) + 1;
    const cand = parseWhenISO(`${y}-${String(mo).padStart(2, "0")}-${m[3]}${m[4] ?? ""}`, a.allDay === true);
    if (cand) return cand;
  }
  return null;
}

/** "อ. 17 พ.ย. 15:00" (ปัก BKK) */
export function whenLabel(d: Date, allDay = false): string {
  const t = new Date(+d + BKK_MS);
  const wd = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."][t.getUTCDay()];
  const mo = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."][t.getUTCMonth()];
  const hm = `${String(t.getUTCHours()).padStart(2, "0")}:${String(t.getUTCMinutes()).padStart(2, "0")}`;
  return `${wd} ${t.getUTCDate()} ${mo}${allDay ? " (ทั้งวัน)" : ` ${hm}`}`;
}

/** "ทุกวันจันทร์ 09:00" · "ทุกวัน 08:00" · "วันที่ 5 ทุกเดือน 09:00" */
export function repeatLabel(repeat: string, repeatDays: number[], start: Date): string {
  const t = new Date(+start + BKK_MS);
  const hm = `${String(t.getUTCHours()).padStart(2, "0")}:${String(t.getUTCMinutes()).padStart(2, "0")}`;
  if (repeat === "DAILY") return `ทุกวัน ${hm}`;
  if (repeat === "WEEKLY") {
    const days = (repeatDays.length ? repeatDays : [t.getUTCDay()]).map((d) => `วัน${WD_TH[d]}`);
    return `ทุก${days.join(" ")} ${hm}`;
  }
  if (repeat === "MONTHLY") {
    const d = t.getUTCDate();
    return `วันที่ ${d} ทุกเดือน ${hm}${d >= 29 ? " (เดือนที่สั้นกว่าจะเตือนวันสุดท้ายของเดือน)" : ""}`;
  }
  return whenLabel(start);
}

type WhenArgs = { start?: Date; end?: Date | null; err?: string };
/** อ่าน whenISO/inMinutes/endISO ของอาร์กิวเมนต์ — `need` = ต้องมีเวลา (สร้าง) */
function readWhen(a: Record<string, unknown>, now: Date, need: boolean): WhenArgs {
  const allDay = a.allDay === true;
  let start: Date | undefined;
  if (a.inMinutes !== undefined) {
    const n = a.inMinutes;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > 10_080) return { err: err("invalid", "จำนวนนาทีไม่ถูกต้อง (1–10,080)") };
    start = new Date(Math.ceil((+now + n * 60_000) / 60_000) * 60_000);
  } else if (a.whenISO !== undefined) {
    const d = startFromArgs({ whenISO: a.whenISO, allDay, repeat: a.repeat }, now);
    if (!d) return { err: err("need_time", "ถามผู้ใช้ว่าวันไหน กี่โมง (whenISO ต้องเป็น ISO-8601 พร้อม +07:00)") };
    start = d;
  } else if (need) return { err: err("need_time", "ถามผู้ใช้ว่าวันไหน กี่โมง") };
  let end: Date | null | undefined;
  if (a.endISO !== undefined) {
    const d = parseWhenISO(a.endISO, allDay);
    if (!d) return { err: err("invalid", "เวลาสิ้นสุดไม่ถูกต้อง (ISO-8601 พร้อม +07:00)") };
    end = d;
  }
  return { start, end };
}

function calErr(e: unknown): string {
  const c = (e as { code?: unknown; message?: unknown }) ?? {};
  const code = typeof c.code === "string" ? c.code : "";
  const msg = typeof c.message === "string" ? c.message : "ทำรายการไม่สำเร็จ";
  if (code === "past_time") return err("past_time", "เวลานี้ผ่านไปแล้ว ถามผู้ใช้เวลาใหม่ (เช่น เวลานี้ของพรุ่งนี้)");
  if (code === "link_not_found") return err("link_not_found", "ไม่พบหรือไม่มีสิทธิ์ — ค้นด้วยเครื่องมือ CRM/บัญชีก่อน หรือถามผู้ใช้ว่าหมายถึงใคร");
  if (code === "not_found") return err("not_found", "ไม่พบรายการนี้ในปฏิทินของผู้ใช้ — ใช้ calendar_list ดู id ที่ถูกต้อง");
  if (code === "expired") return err("expired", "ข้อเสนอเตือนประจำนี้หมดอายุแล้ว — สร้างใหม่ด้วย calendar_add");
  if (code) return err(code, msg);
  throw e;
}

const linkOf = (v: unknown): { type: "CRM_CONTACT" | "CRM_DEAL" | "ACCOUNT_DOC" | "KANBAN_CARD"; id: string } | null | undefined => {
  if (v === null) return null;
  if (v === undefined) return undefined;
  const r = rec(v);
  const types = ["CRM_CONTACT", "CRM_DEAL", "ACCOUNT_DOC", "KANBAN_CARD"] as const;
  return types.includes(r.type as never) && typeof r.id === "string" && r.id.trim() ? { type: r.type as (typeof types)[number], id: r.id.trim().slice(0, 80) } : undefined;
};


/** AiRoom ของบทสนทนานี้ (การ์ดในห้อง · D-A19) — ห้องเดิมที่ไม่ใช่ห้องเลขา = null */
async function roomIdOf(ctx: ToolCtx): Promise<string | null> {
  if (!ctx.conversationId) return null;
  const { tenantDb } = await import("@/lib/core/db");
  const r = await tenantDb({ tenantId: ctx.tenantId }).aiRoom.findFirst({ where: { conversationId: ctx.conversationId, tenantId: ctx.tenantId }, select: { id: true } });
  return r?.id ?? null;
}

const REPEATS = ["NONE", "DAILY", "WEEKLY", "MONTHLY"] as const;
type Repeat = (typeof REPEATS)[number];

// ───────── calendar_b ▸ review b B1 (M4): ผลถึงโมเดล = id/สถานะ/จำนวน เท่านั้น ─────────
//   ห้องเลขา: OWNER (tenantRooms) + สมาชิกห้องอ่านคำตอบที่บันทึก ⇒ ห้ามมีชื่อเรื่อง/วันเวลา/สถานที่/วันลา/Google ในผลเครื่องมือ
//   รายละเอียดอยู่ในการ์ดที่แอปวาดให้ "เจ้าของ" เท่านั้น (CalItem.roomId → reminders · CalRoomCard → calendarCards ใน GET rooms/[id])
const SAY_SET = "ตอบสั้น ๆ ว่า \"ตั้งให้แล้ว ดูการ์ดด้านล่าง\" — ห้ามทวนชื่อเรื่อง วัน เวลา หรือรายละเอียด (ห้องเลขามีคนอื่นอ่านได้ · การ์ดเห็นเฉพาะผู้ใช้)";
const SAY_DRAFT = "ขอให้ผู้ใช้กด \"ใช่ ตั้งเลย\" บนการ์ดด้านล่างเพื่อยืนยันเตือนประจำ (หรือตอบว่าใช่ = calendar_update confirm=true) — ห้ามทวนรายละเอียด · ไม่ยืนยันใน 24 ชม. = ยกเลิกเอง";
const SAY_UPDATED = "ตอบสั้น ๆ ว่า \"แก้ให้แล้ว\" — การ์ดในห้องอัปเดตเอง · ห้ามทวนรายละเอียด";

/** ผลสำเร็จที่ไม่มีข้อมูลส่วนตัว (ทดสอบได้) */
export function opaqueItemResult(it: { id: string; status: string; kind: string }, next: string) {
  return { ok: true, [it.status === "DRAFT" ? "draftId" : "itemId"]: it.id, status: it.status, kind: it.kind === "EVENT" ? "EVENT" : "REMINDER", card: "reminder", next };
}

/** เครื่องมือปฏิทินในเทิร์นนี้ ⇒ ห้ามเก็บเข้า dataset ฝึกโมเดล (review b M7 · Google Limited Use) */
export function turnTouchesCalendar(usedTools: readonly { name: string }[]): boolean {
  return usedTools.some((t) => typeof t?.name === "string" && t.name.startsWith("calendar_"));
}
/** สกิลของเครื่องมือปฏิทิน (ห้องเลขาเท่านั้น · review b m1) + ตัวที่ยื่นตั้งแต่รอบแรกในห้องเลขา */
export const CALENDAR_SKILL_ID = "calendar";
export const CALENDAR_ROOM_CORE = ["calendar_add", "calendar_agenda"] as const;

type CalActorT = NonNullable<ReturnType<typeof calActorOf>>;
/** itemId หรือ match → id ของผู้ใช้ (ร้านนี้ · OPEN/DRAFT) · 0 = not_found · > 1 = ambiguous (ไม่บอกชื่อ) */
async function resolveTarget(actor: CalActorT, a: Record<string, unknown>): Promise<{ id: string } | { error: string }> {
  const id = typeof a.itemId === "string" ? a.itemId.trim().slice(0, 80) : "";
  if (id) return { id };
  const m = typeof a.match === "string" ? a.match.trim().slice(0, 100) : "";
  if (m.length < 2) return { error: err("invalid", "ต้องระบุ itemId หรือ match (คำจากชื่อเตือน)") };
  const { tenantDb } = await import("@/lib/core/db");
  const rows = await tenantDb({ tenantId: actor.tenantId }).calItem.findMany({
    where: { userId: actor.userId, tenantId: actor.tenantId, status: { in: ["OPEN", "DRAFT"] }, title: { contains: m, mode: "insensitive" } },
    select: { id: true },
    orderBy: [{ occursAt: "asc" }],
    take: 6,
  });
  if (rows.length === 0) return { error: err("not_found", "ไม่พบเตือนที่ตรงคำนี้ในปฏิทินของผู้ใช้ — ถามผู้ใช้ให้ชัดขึ้น") };
  if (rows.length > 1) return { error: err("ambiguous", `มี ${rows.length >= 6 ? "หลาย" : rows.length} รายการตรงคำนี้ — ถามผู้ใช้ให้ระบุให้ชัดขึ้น (เช่น วันหรือคำอื่นในชื่อ) โดยไม่เดารายละเอียด`) };
  return { id: rows[0]!.id };
}

// ───────── execute ─────────

async function add(ctx: ToolCtx, args: unknown): Promise<string> {
  const actor = calActorOf(ctx);
  if (!actor) return JSON.stringify({ error: "ปฏิทินส่วนตัวใช้ได้เฉพาะสมาชิกในแอป" });
  const a = rec(args);
  const now = new Date();
  const w = readWhen(a, now, true);
  if (w.err) return w.err;
  const repeat: Repeat = REPEATS.includes(a.repeat as never) ? (a.repeat as Repeat) : "NONE";
  const kind = a.kind === "EVENT" ? "EVENT" : "REMINDER";
  const link = linkOf(a.link);
  if (a.link !== undefined && link === undefined) return err("invalid", "รูปแบบ link ไม่ถูกต้อง");
  const items = await import("@/lib/modules/calendar/items");
  try {
    const it = await items.createItem(
      actor,
      {
        kind,
        title: typeof a.title === "string" ? a.title : "",
        note: typeof a.note === "string" ? a.note : null,
        startAt: w.start!,
        endAt: kind === "EVENT" ? w.end ?? (a.allDay === true ? null : new Date(+w.start! + 3_600_000)) : null,
        allDay: a.allDay === true,
        repeat,
        repeatDays: Array.isArray(a.repeatDays) ? (a.repeatDays as number[]) : [],
        ...(typeof a.leadMinutes === "number" ? { leadMinutes: a.leadMinutes } : {}),
        link: link ?? null,
      },
      { source: "CHAT", roomId: await roomIdOf(ctx), draft: repeat !== "NONE", now },
    );
    return JSON.stringify(opaqueItemResult(it, it.status === "DRAFT" ? SAY_DRAFT : SAY_SET));
  } catch (e) {
    return calErr(e);
  }
}

async function update(ctx: ToolCtx, args: unknown): Promise<string> {
  const actor = calActorOf(ctx);
  if (!actor) return JSON.stringify({ error: "ปฏิทินส่วนตัวใช้ได้เฉพาะสมาชิกในแอป" });
  const a = rec(args);
  const target = await resolveTarget(actor, a);
  if ("error" in target) return target.error;
  const id = target.id;
  const now = new Date();
  const w = readWhen(a, now, false);
  if (w.err) return w.err;
  const link = linkOf(a.link);
  if (a.link !== undefined && a.link !== null && link === undefined) return err("invalid", "รูปแบบ link ไม่ถูกต้อง");
  const items = await import("@/lib/modules/calendar/items");
  try {
    const patch = {
      ...(typeof a.title === "string" ? { title: a.title } : {}),
      ...(typeof a.note === "string" ? { note: a.note } : {}),
      ...(w.start ? { startAt: w.start } : {}),
      ...(w.end !== undefined ? { endAt: w.end } : {}),
      ...(typeof a.allDay === "boolean" ? { allDay: a.allDay } : {}),
      ...(REPEATS.includes(a.repeat as never) ? { repeat: a.repeat as Repeat } : {}),
      ...(Array.isArray(a.repeatDays) ? { repeatDays: a.repeatDays as number[] } : {}),
      ...(typeof a.leadMinutes === "number" ? { leadMinutes: a.leadMinutes } : {}),
      ...(link !== undefined ? { link } : {}),
    };
    const cur = (await items.getItem(actor, id)).item;
    // review b m3 (R-CAL-28): เตือนครั้งเดียว → ทำซ้ำ จากแชท = สร้าง DRAFT ใหม่รอยืนยันบนการ์ด แล้วยกเลิกตัวเดิม (ไม่ข้ามขั้นยืนยัน)
    if (cur.repeat === "NONE" && patch.repeat && patch.repeat !== "NONE" && cur.status === "OPEN") {
      const draft = await items.createItem(
        actor,
        {
          kind: cur.kind,
          title: patch.title ?? cur.title,
          note: patch.note ?? cur.note,
          startAt: patch.startAt ?? new Date(cur.startAt),
          endAt: cur.kind === "EVENT" ? (patch.endAt !== undefined ? patch.endAt : cur.endAt ? new Date(cur.endAt) : null) : null,
          allDay: patch.allDay ?? cur.allDay,
          repeat: patch.repeat,
          repeatDays: patch.repeatDays ?? [],
          leadMinutes: patch.leadMinutes ?? cur.leadMinutes,
          link: patch.link !== undefined ? patch.link : cur.link ? { type: cur.link.type, id: cur.link.id } : null,
        },
        { source: "CHAT", roomId: await roomIdOf(ctx), draft: true, now },
      );
      await items.cancelItem(actor, id, now);
      return JSON.stringify({ ...opaqueItemResult(draft, SAY_DRAFT), replacedItemId: id });
    }
    let it = Object.keys(patch).length ? await items.updateItem(actor, id, patch, now) : null;
    if (a.confirm === true) it = await items.confirmItem(actor, id, now);
    if (!it) it = cur;
    return JSON.stringify(opaqueItemResult(it, a.confirm === true ? SAY_SET : SAY_UPDATED));
  } catch (e) {
    return calErr(e);
  }
}

async function cancel(ctx: ToolCtx, args: unknown): Promise<string> {
  const actor = calActorOf(ctx);
  if (!actor) return JSON.stringify({ error: "ปฏิทินส่วนตัวใช้ได้เฉพาะสมาชิกในแอป" });
  const target = await resolveTarget(actor, rec(args));
  if ("error" in target) return target.error;
  const items = await import("@/lib/modules/calendar/items");
  try {
    await items.cancelItem(actor, target.id);
    return JSON.stringify({ ok: true, itemId: target.id, status: "CANCELLED", next: "ตอบสั้น ๆ ว่า \"ยกเลิกให้แล้ว\" — ห้ามทวนรายละเอียด" });
  } catch (e) {
    return calErr(e);
  }
}

/** วันไทยวันนี้ "YYYY-MM-DD" */
const todayYmd = (now: Date) => new Date(+now + BKK_MS).toISOString().slice(0, 10);

async function list(ctx: ToolCtx, args: unknown): Promise<string> {
  const actor = calActorOf(ctx);
  if (!actor) return JSON.stringify({ error: "ปฏิทินส่วนตัวใช้ได้เฉพาะสมาชิกในแอป" });
  const a = rec(args);
  const done = a.status === "DONE";
  const { tenantDb } = await import("@/lib/core/db");
  const db = tenantDb({ tenantId: actor.tenantId });
  const [open, drafts, doneN] = await Promise.all([
    db.calItem.count({ where: { userId: actor.userId, tenantId: actor.tenantId, status: "OPEN" } }),
    db.calItem.count({ where: { userId: actor.userId, tenantId: actor.tenantId, status: "DRAFT" } }),
    db.calItem.count({ where: { userId: actor.userId, tenantId: actor.tenantId, status: "DONE" } }),
  ]);
  const roomId = await roomIdOf(ctx);
  if (roomId) {
    const { addRoomCard } = await import("@/lib/modules/calendar/room-cards");
    const d = todayYmd(new Date());
    await addRoomCard(actor, roomId, { kind: "LIST", fromDay: d, toDay: d });
  }
  return JSON.stringify({
    ok: true,
    ...(done ? { done: doneN } : { open, drafts }),
    card: roomId ? "list" : null,
    next: roomId ? "ตอบจำนวนแล้วชี้ไปที่การ์ดด้านล่าง (เห็นเฉพาะผู้ใช้) — ห้ามเดารายละเอียด" : "ให้ผู้ใช้เปิดแท็บ \"เตือนฉัน\" ในปฏิทินของแอป",
  });
}

const AGENDA_MAX_DAYS = 14;
async function agenda(ctx: ToolCtx, args: unknown): Promise<string> {
  const actor = calActorOf(ctx);
  if (!actor) return JSON.stringify({ error: "ปฏิทินส่วนตัวใช้ได้เฉพาะสมาชิกในแอป" });
  const a = rec(args);
  const { ymdToDayNo, dayNoToYmd } = await import("@/lib/modules/calendar/next-fire");
  const f = typeof a.fromDate === "string" ? ymdToDayNo(a.fromDate) : null;
  const t = typeof a.toDate === "string" ? ymdToDayNo(a.toDate) : f;
  if (f === null || t === null || t < f || t - f > AGENDA_MAX_DAYS - 1) return err("invalid", `ช่วงวันไม่ถูกต้อง (YYYY-MM-DD · ไม่เกิน ${AGENDA_MAX_DAYS} วัน)`);
  const { agendaFor } = await import("@/lib/modules/calendar/agenda");
  // 🔴 Google ไม่เข้าโมเดลเลย (จนผ่านการตรวจ Google · ค่าเริ่มที่เจ้าของแนะนำ) — ตัดก่อนนับ
  const r = await agendaFor(actor, { from: dayNoToYmd(f), to: dayNoToYmd(t) }, ctx.access ? { access: ctx.access } : {});
  const shown = r.items.filter((i) => i.source !== "google");
  const bySystem: Record<string, number> = {};
  for (const i of shown) if (!i.done) bySystem[i.label] = (bySystem[i.label] ?? 0) + (i.summary?.count ?? 1);
  const roomId = await roomIdOf(ctx);
  if (roomId) {
    const { addRoomCard } = await import("@/lib/modules/calendar/room-cards");
    await addRoomCard(actor, roomId, { kind: "AGENDA", fromDay: dayNoToYmd(f), toDay: dayNoToYmd(t) });
  }
  const { skippedSectionNote } = await import("./secretary/access-rules");
  const MOD: Record<string, string> = { booking: "booking", account: "account", kanban: "kanban", crm: "crm", hr: "hr", dorm: "dorm", ticket: "ticket" };
  return JSON.stringify({
    ok: true,
    period: `${dayNoToYmd(f)}..${dayNoToYmd(t)}`,
    open: Object.values(bySystem).reduce((s, n) => s + n, 0),
    bySystem,
    clashes: r.conflicts.filter((c) => !/google:/.test(`${c.earlierId}|${c.laterId}`)).length,
    notes: r.notes.filter((n) => n.code === "SECTION_OFF").map((n) => skippedSectionNote(MOD[n.source] ?? n.source)),
    card: roomId ? "agenda" : null,
    next: roomId ? "ตอบแค่จำนวน (เช่น \"มี N รายการ ดูในการ์ดด้านล่าง\") — ห้ามเดาหรือแต่งรายละเอียดของรายการ" : "ให้ผู้ใช้เปิดปฏิทินในแอปเพื่อดูรายละเอียด",
  });
}

/** เครื่องมือปฏิทินส่วนตัว 5 ตัว (ลงทะเบียนใน toolRegistry) */
export function calendarTools(): AiTool[] {
  return [
    { def: DEFS.calendar_add, execute: add },
    { def: DEFS.calendar_update, execute: update },
    { def: DEFS.calendar_cancel, execute: cancel },
    { def: DEFS.calendar_list, execute: list },
    { def: DEFS.calendar_agenda, execute: agenda },
  ];
}
