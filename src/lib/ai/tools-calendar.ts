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
      "Repeating reminders are saved as a draft the user confirms on the card. Keep the reply short; do not repeat private details in shared rooms.",
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
      "Change one of the user's own reminders/appointments by itemId (from calendar_add or calendar_list): title, time, repeat, lead time, link (null removes), note. " +
      "confirm=true turns a draft repeating reminder into an active one after the user says yes.",
    parameters: {
      type: "object",
      required: ["itemId"],
      additionalProperties: false,
      properties: {
        itemId: { type: "string" },
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
    description: "Cancel one of the user's own reminders/appointments by itemId.",
    parameters: { type: "object", required: ["itemId"], additionalProperties: false, properties: { itemId: { type: "string" } } },
  },
  calendar_list: {
    name: "calendar_list",
    description: "List the user's own reminders/appointments in this business (OPEN = upcoming incl. drafts, DONE = finished).",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: { status: { type: "string", enum: ["OPEN", "DONE"] }, take: { type: "integer", minimum: 1, maximum: 20 } },
    },
  },
  calendar_agenda: {
    name: "calendar_agenda",
    description:
      "Read the user's day/agenda: their own reminders and appointments plus what the shop systems show them (customer bookings, invoices due, task cards, CRM tasks, payroll, tax deadlines, Google). Up to 14 days.",
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

/** AiRoom ของบทสนทนานี้ (การ์ดเตือนในห้อง · D-A19) — ห้องเดิมที่ไม่ใช่ห้องเลขา = null */
async function roomIdOf(ctx: ToolCtx): Promise<string | null> {
  if (!ctx.conversationId) return null;
  const { tenantDb } = await import("@/lib/core/db");
  const r = await tenantDb({ tenantId: ctx.tenantId }).aiRoom.findFirst({ where: { conversationId: ctx.conversationId, tenantId: ctx.tenantId }, select: { id: true } });
  return r?.id ?? null;
}

const REPEATS = ["NONE", "DAILY", "WEEKLY", "MONTHLY"] as const;
type Repeat = (typeof REPEATS)[number];

function itemShape(i: { id: string; kind: string; title: string; status: string; startAt: string; occursAt: string; allDay: boolean; repeat: string; repeatDays: number[]; link: { label: string | null } | null }) {
  return {
    itemId: i.id,
    kind: i.kind === "EVENT" ? "นัดส่วนตัว" : "เตือนฉัน",
    title: i.title,
    status: i.status,
    when: i.repeat === "NONE" ? whenLabel(new Date(i.occursAt), i.allDay) : `${repeatLabel(i.repeat, i.repeatDays, new Date(i.startAt))} (ครั้งถัดไป ${whenLabel(new Date(i.occursAt), i.allDay)})`,
    ...(i.link?.label ? { linkedTo: i.link.label } : {}),
  };
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
    if (it.status === "DRAFT") {
      const label = repeatLabel(it.repeat, it.repeatDays, new Date(it.startAt));
      return JSON.stringify({
        ok: true,
        draftId: it.id,
        status: "DRAFT",
        summary: label,
        next: `ถามผู้ใช้ยืนยัน "ตั้งเป็นเตือนประจำ ${label} ใช่ไหม" (แอปแสดงปุ่ม ใช่ ตั้งเลย / แก้เวลา · ผู้ใช้ตอบในแชทว่าใช่ = calendar_update confirm=true) · ไม่ยืนยันใน 24 ชม. = ยกเลิกเอง`,
      });
    }
    return JSON.stringify({ ok: true, ...itemShape(it), next: "การ์ดแสดงในห้องแล้ว — ตอบสั้น ไม่ทวนรายละเอียดเกินจำเป็น (ห้องร่วมมีคนอื่นเห็น)" });
  } catch (e) {
    return calErr(e);
  }
}

async function update(ctx: ToolCtx, args: unknown): Promise<string> {
  const actor = calActorOf(ctx);
  if (!actor) return JSON.stringify({ error: "ปฏิทินส่วนตัวใช้ได้เฉพาะสมาชิกในแอป" });
  const a = rec(args);
  const id = typeof a.itemId === "string" ? a.itemId.trim().slice(0, 80) : "";
  if (!id) return err("invalid", "ต้องระบุ itemId");
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
    let it = Object.keys(patch).length ? await items.updateItem(actor, id, patch, now) : null;
    if (a.confirm === true) it = await items.confirmItem(actor, id, now);
    if (!it) it = (await items.getItem(actor, id)).item;
    return JSON.stringify({ ok: true, ...itemShape(it), next: "แก้แล้ว — การ์ดในห้องอัปเดตเอง ตอบสั้น" });
  } catch (e) {
    return calErr(e);
  }
}

async function cancel(ctx: ToolCtx, args: unknown): Promise<string> {
  const actor = calActorOf(ctx);
  if (!actor) return JSON.stringify({ error: "ปฏิทินส่วนตัวใช้ได้เฉพาะสมาชิกในแอป" });
  const id = typeof rec(args).itemId === "string" ? String(rec(args).itemId).trim().slice(0, 80) : "";
  if (!id) return err("invalid", "ต้องระบุ itemId");
  const items = await import("@/lib/modules/calendar/items");
  try {
    await items.cancelItem(actor, id);
    return JSON.stringify({ ok: true, itemId: id, status: "CANCELLED" });
  } catch (e) {
    return calErr(e);
  }
}

async function list(ctx: ToolCtx, args: unknown): Promise<string> {
  const actor = calActorOf(ctx);
  if (!actor) return JSON.stringify({ error: "ปฏิทินส่วนตัวใช้ได้เฉพาะสมาชิกในแอป" });
  const a = rec(args);
  const take = typeof a.take === "number" && Number.isInteger(a.take) ? Math.max(1, Math.min(20, a.take)) : 10;
  const items = await import("@/lib/modules/calendar/items");
  if (a.status === "DONE") {
    const r = await items.listItems(actor, { tab: "done", take });
    return JSON.stringify({ items: r.items.map(itemShape) });
  }
  const today = await items.listItems(actor, { tab: "today", take });
  const rest = today.items.length < take ? await items.listItems(actor, { tab: "upcoming", take: take - today.items.length }) : { items: [] };
  return JSON.stringify({ items: [...today.items, ...rest.items].map(itemShape) });
}

const AGENDA_MAX_DAYS = 14;
async function agenda(ctx: ToolCtx, args: unknown): Promise<string> {
  const actor = calActorOf(ctx);
  if (!actor) return JSON.stringify({ error: "ปฏิทินส่วนตัวใช้ได้เฉพาะสมาชิกในแอป" });
  const a = rec(args);
  const { ymdToDayNo, dayNoToYmd, bkkDayNo } = await import("@/lib/modules/calendar/next-fire");
  const f = typeof a.fromDate === "string" ? ymdToDayNo(a.fromDate) : null;
  const t = typeof a.toDate === "string" ? ymdToDayNo(a.toDate) : f;
  if (f === null || t === null || t < f || t - f > AGENDA_MAX_DAYS - 1) return err("invalid", `ช่วงวันไม่ถูกต้อง (YYYY-MM-DD · ไม่เกิน ${AGENDA_MAX_DAYS} วัน)`);
  const { agendaFor } = await import("@/lib/modules/calendar/agenda");
  const r = await agendaFor(actor, { from: dayNoToYmd(f), to: dayNoToYmd(t) }, ctx.access ? { access: ctx.access } : {});
  const { skippedSectionNote } = await import("./secretary/access-rules");
  const MOD: Record<string, string> = { booking: "booking", account: "account", kanban: "kanban", crm: "crm", hr: "hr", dorm: "dorm", ticket: "ticket" };
  const hm = (iso: string) => {
    const x = new Date(Date.parse(iso) + BKK_MS);
    return `${String(x.getUTCHours()).padStart(2, "0")}:${String(x.getUTCMinutes()).padStart(2, "0")}`;
  };
  return JSON.stringify({
    items: r.items.slice(0, 80).map((i) => ({
      day: dayNoToYmd(bkkDayNo(new Date(i.startAt))),
      time: i.allDay ? "ทั้งวัน" : `${hm(i.startAt)}${i.endAt ? `–${hm(i.endAt)}` : ""}`,
      system: i.label,
      title: i.title,
      ...(i.sub ? { sub: i.sub } : {}),
      ...(i.done ? { done: true } : {}),
      ...(i.ref?.itemId ? { itemId: i.ref.itemId } : {}),
    })),
    ...(r.items.length > 80 ? { more: r.items.length - 80 } : {}),
    ...(r.conflicts.length ? { conflicts: r.conflicts.map((c) => c.text) } : {}),
    notes: [
      ...r.notes.filter((n) => n.code === "SECTION_OFF").map((n) => skippedSectionNote(MOD[n.source] ?? n.source)),
      ...r.notes.filter((n) => n.code !== "SECTION_OFF").map((n) => n.text),
    ],
    period: `${dayNoToYmd(f)}..${dayNoToYmd(t)}`,
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
