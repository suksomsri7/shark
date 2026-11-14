// items.ts — ของส่วนตัว: เตือนฉัน + นัดส่วนตัว (CAL1.2 · สัญญา docs/modules/32-secretary-calendar.md §3 · §5)
//
// 🔴 M3 (บังคับด้วยโครงสร้าง): ไม่มีพารามิเตอร์ userId — ตัวตนมาจาก `CalActor` ที่ด่านสร้างเท่านั้น
//    ทุก query ของ CalItem/CalPref มี `userId: actor.userId` ตรงตัวใน where (ข้อสอบ grep ใน qc-cal-1.2)
// 🔴 id ของคนอื่น/ร้านอื่น = CalError 404 not_found (ไม่บอกว่ามีอยู่)
// 🔴 ทุกการแก้ของผู้ใช้ = `version + 1` ด้วย updateMany เงื่อนไข version (job calendar.fire commit แบบมีเงื่อนไข · §5.6)
// 🔴 ไม่ log title/note (§2.6)
import type { CalItem, CalLinkType, Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import type { MembershipCtx } from "@/lib/core/rbac";
import { linkKey, resolveLink, resolveLinks, type LinkInfo } from "./links";
import {
  bkkDayNo,
  MSG,
  schedule,
  snoozeTarget,
  validateWhen,
  type CalKindT,
  type CalRepeatT,
  type SnoozeTo,
} from "./next-fire";

const DAY_MS = 86_400_000;
const BKK_MS = 7 * 3_600_000;
export const OPEN_LIMIT = 500;
export const DRAFT_TTL_MS = DAY_MS;

export type CalActor = { userId: string; tenantId: string; membership: MembershipCtx };

/** ข้อผิดพลาดของ service — route แปลงเป็น `{ error: code, message }` ตาม status */
export class CalError extends Error {
  constructor(public status: 400 | 404 | 409 | 410, public code: string, message: string) {
    super(message);
    this.name = "CalError";
  }
}
export const NOT_FOUND_TH = "ไม่พบรายการนี้ หรือคุณยังไม่มีสิทธิ์เห็น";
const notFound = () => new CalError(404, "not_found", NOT_FOUND_TH);
const closed = (m = "รายการนี้ปิดไปแล้ว") => new CalError(409, "closed", m);
const conflict = () => new CalError(409, "conflict", "รายการนี้เพิ่งถูกแก้ — ลองใหม่อีกครั้ง");

export type CalItemInput = {
  kind: CalKindT;
  title: string;
  note?: string | null;
  startAt: Date;
  endAt?: Date | null;
  allDay?: boolean;
  repeat?: CalRepeatT;
  repeatDays?: number[];
  leadMinutes?: number;
  link?: { type: CalLinkType; id: string } | null;
};

export type CalItemDto = {
  id: string;
  kind: CalKindT;
  title: string;
  note: string | null;
  startAt: string;
  endAt: string | null;
  allDay: boolean;
  repeat: CalRepeatT;
  repeatDays: number[];
  leadMinutes: number;
  link: { type: CalLinkType; id: string; systemId: string | null; label: string | null } | null;
  status: CalItem["status"];
  doneAt: string | null;
  occursAt: string;
  nextFireAt: string | null;
  snoozeUntil: string | null;
  source: CalItem["source"];
  roomId: string | null;
  exported: boolean;
  createdAt: string;
  updatedAt: string;
};
export type CalItemDetailDto = { item: CalItemDto; phone: string | null };

/** client ผูกร้านของ actor (tenantDb ใส่ tenantId ซ้ำอีกชั้น · CalLink เป็นแกน global = ผ่านตรง) */
const dbOf = (actor: { tenantId: string }) => tenantDb({ tenantId: actor.tenantId });

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

function toDto(r: CalItem, links: Map<string, LinkInfo>): CalItemDto {
  const li = r.linkType && r.linkId ? links.get(linkKey({ type: r.linkType, id: r.linkId })) ?? null : null;
  return {
    id: r.id,
    kind: r.kind,
    title: r.title,
    note: r.note,
    startAt: r.startAt.toISOString(),
    endAt: iso(r.endAt),
    allDay: r.allDay,
    repeat: r.repeat,
    repeatDays: r.repeatDays,
    leadMinutes: r.leadMinutes,
    // อ่านไม่ได้แล้ว (R-CAL-23) = คง type/id ให้แอปถอดผูกได้ แต่ไม่มีป้าย/ระบบ
    link: r.linkType && r.linkId ? { type: r.linkType, id: r.linkId, systemId: li?.systemId ?? null, label: li?.label ?? null } : null,
    status: r.status,
    doneAt: iso(r.doneAt),
    occursAt: r.occursAt.toISOString(),
    nextFireAt: iso(r.nextFireAt),
    snoozeUntil: iso(r.snoozeUntil),
    source: r.source,
    roomId: r.roomId,
    exported: r.externalId != null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

async function dtos(actor: CalActor, rows: CalItem[]): Promise<CalItemDto[]> {
  const refs = rows.filter((r) => r.linkType && r.linkId).map((r) => ({ type: r.linkType!, id: r.linkId! }));
  const links = refs.length ? await resolveLinks(actor, refs) : new Map<string, LinkInfo>();
  return rows.map((r) => toDto(r, links));
}

/** แถวของ actor (ร้านนี้) · ไม่มี = 404 */
async function own(actor: CalActor, id: string): Promise<CalItem> {
  const r = await dbOf(actor).calItem.findFirst({ where: { id, userId: actor.userId, tenantId: actor.tenantId } });
  if (!r) throw notFound();
  return r;
}

/** ส่งออก Google ตามตัวเลือกของผู้ใช้ (CAL1.8 ทำงานส่งจริง · ที่นี่แค่ติดธง) */
async function exportsKind(actor: CalActor, kind: CalKindT): Promise<boolean> {
  const l = await dbOf(actor).calLink.findFirst({ where: { userId: actor.userId, status: "ACTIVE" }, select: { exportKinds: true } });
  return !!l && l.exportKinds.includes(kind);
}

function when(i: Required<Pick<CalItemInput, "kind" | "title" | "startAt">> & CalItemInput) {
  return {
    kind: i.kind,
    title: (i.title ?? "").trim(),
    note: i.note?.trim() ? i.note.trim() : null,
    startAt: i.startAt,
    endAt: i.endAt ?? null,
    allDay: !!i.allDay,
    repeat: i.repeat ?? "NONE",
    repeatDays: i.repeat === "WEEKLY" ? [...new Set(i.repeatDays ?? [])].sort((a, b) => a - b) : i.repeatDays ?? [],
    leadMinutes: i.leadMinutes ?? (i.kind === "EVENT" ? 15 : 0),
  };
}

function check(w: ReturnType<typeof when>, now: Date) {
  const e = validateWhen(w, now);
  if (e) throw new CalError(e.status, e.code, e.message);
}

async function checkLink(actor: CalActor, link: CalItemInput["link"]): Promise<LinkInfo | null> {
  if (!link) return null;
  const li = await resolveLink(actor, link);
  if (!li) throw new CalError(404, "link_not_found", "ไม่พบรายการที่จะผูก หรือคุณยังไม่มีสิทธิ์เห็น");
  return li;
}

// ───────── สร้าง ─────────
export async function createItem(
  actor: CalActor,
  input: CalItemInput,
  opts: { source?: "APP" | "CHAT" | "SUGGEST"; roomId?: string | null; draft?: boolean; now?: Date } = {},
): Promise<CalItemDto> {
  const now = opts.now ?? new Date();
  const w = when(input);
  check(w, now);
  const li = await checkLink(actor, input.link);
  const open = await dbOf(actor).calItem.count({ where: { userId: actor.userId, tenantId: actor.tenantId, status: "OPEN" } });
  if (open >= OPEN_LIMIT) throw new CalError(409, "limit", "มีเตือนค้างเยอะเกินไป — ปิดรายการที่เสร็จแล้วก่อน");
  const status = opts.draft ? "DRAFT" : "OPEN";
  const s = schedule({ ...w, status, occursAt: w.startAt, firedOccAt: null, snoozeUntil: null, nagAt: null }, now);
  const row = await dbOf(actor).calItem.create({
    data: {
      userId: actor.userId,
      tenantId: actor.tenantId,
      ...w,
      linkType: input.link?.type ?? null,
      linkId: input.link?.id ?? null,
      linkSystemId: li?.systemId ?? null,
      status,
      occursAt: s.occursAt,
      nextFireAt: s.nextFireAt,
      source: opts.source ?? "APP",
      roomId: opts.source === "CHAT" ? opts.roomId ?? null : null,
      syncDirty: status === "OPEN" && (await exportsKind(actor, w.kind)),
    },
  });
  return toDto(row, li ? new Map([[linkKey(li), li]]) : new Map());
}

/** เขียนแบบมีเงื่อนไข version (+1) — แข่งกับ job/อีกเครื่อง = 409 conflict */
async function commit(actor: CalActor, r: CalItem, data: Prisma.CalItemUpdateManyMutationInput): Promise<CalItem> {
  const res = await dbOf(actor).calItem.updateMany({
    where: { id: r.id, userId: actor.userId, tenantId: actor.tenantId, version: r.version },
    data: { ...data, version: { increment: 1 } },
  });
  if (res.count !== 1) throw conflict();
  return own(actor, r.id);
}

const TIME_KEYS = ["kind", "startAt", "endAt", "allDay", "repeat", "repeatDays", "leadMinutes"] as const;

// ───────── แก้ ─────────
export async function updateItem(actor: CalActor, id: string, patch: Partial<CalItemInput>, now = new Date()): Promise<CalItemDto> {
  const r = await own(actor, id);
  if (r.status === "DONE" || r.status === "CANCELLED") throw closed();
  const merged = when({
    kind: patch.kind ?? r.kind,
    title: patch.title ?? r.title,
    note: patch.note !== undefined ? patch.note : r.note,
    startAt: patch.startAt ?? r.startAt,
    endAt: patch.endAt !== undefined ? patch.endAt : (patch.kind ?? r.kind) === "REMINDER" ? null : r.endAt,
    allDay: patch.allDay ?? r.allDay,
    repeat: patch.repeat ?? r.repeat,
    repeatDays: patch.repeatDays ?? (patch.repeat && patch.repeat !== "WEEKLY" ? [] : r.repeatDays),
    leadMinutes: patch.leadMinutes ?? (patch.kind && patch.kind !== r.kind ? undefined : r.leadMinutes),
  });
  const timeChanged = TIME_KEYS.some((k) => patch[k] !== undefined);
  // ตรวจเวลาเฉพาะเมื่อแก้เวลา (แก้ชื่อของเตือนที่ยิงแล้วรอย้ำ ต้องไม่ติด past_time)
  if (timeChanged) check(merged, now);
  else {
    const e = validateWhen({ ...merged, startAt: new Date(+now + 3_600_000), endAt: null, kind: "EVENT" }, now);
    if (e) throw new CalError(e.status, e.code, e.message);
  }
  let li: LinkInfo | null = null;
  const data: Prisma.CalItemUpdateManyMutationInput = { title: merged.title, note: merged.note };
  if (patch.link !== undefined) {
    li = await checkLink(actor, patch.link);
    Object.assign(data, { linkType: patch.link?.type ?? null, linkId: patch.link?.id ?? null, linkSystemId: li?.systemId ?? null });
  }
  if (timeChanged) {
    const fresh = { ...merged, status: r.status, occursAt: merged.startAt, firedOccAt: null, snoozeUntil: null, nagAt: null };
    const s = schedule(fresh, now);
    Object.assign(data, { ...merged, firedOccAt: null, snoozeUntil: null, nagAt: null, occursAt: s.occursAt, nextFireAt: s.nextFireAt, fireAttempts: 0 });
  }
  if (r.externalId || (await exportsKind(actor, merged.kind))) data.syncDirty = true;
  const row = await commit(actor, r, data);
  return (await dtos(actor, [row]))[0]!;
}

// ───────── ยืนยัน DRAFT (R-CAL-28) ─────────
export async function confirmItem(actor: CalActor, id: string, now = new Date()): Promise<CalItemDto> {
  const r = await own(actor, id);
  if (r.status === "OPEN") return (await dtos(actor, [r]))[0]!; // ซ้ำ = 200
  if (r.status !== "DRAFT") throw closed();
  if (+now - +r.createdAt > DRAFT_TTL_MS) throw new CalError(410, "expired", "ข้อเสนอนี้หมดอายุแล้ว — สั่งเลขาใหม่");
  const w = when(r);
  check(w, now);
  const s = schedule({ ...w, status: "OPEN", occursAt: r.occursAt, firedOccAt: null, snoozeUntil: null, nagAt: null }, now);
  const row = await commit(actor, r, { status: "OPEN", occursAt: s.occursAt, nextFireAt: s.nextFireAt, syncDirty: await exportsKind(actor, r.kind) });
  return (await dtos(actor, [row]))[0]!;
}

// ───────── ยกเลิก ─────────
export async function cancelItem(actor: CalActor, id: string, now = new Date()): Promise<{ ok: true }> {
  const r = await own(actor, id);
  if (r.status === "CANCELLED") return { ok: true };
  await commit(actor, r, { status: "CANCELLED", cancelledAt: now, nextFireAt: null, snoozeUntil: null, nagAt: null, ...(r.externalId ? { syncDirty: true } : {}) });
  return { ok: true };
}

// ───────── เสร็จ (§5.5) ─────────
export async function markDone(actor: CalActor, id: string, opts: { occ?: Date; now?: Date } = {}): Promise<CalItemDto> {
  const now = opts.now ?? new Date();
  const r = await own(actor, id);
  if (r.status === "CANCELLED" || r.status === "DRAFT") throw closed();
  if (r.status === "DONE") return (await dtos(actor, [r]))[0]!; // ซ้ำ = 200 ค่าเดิม
  const dirty = r.externalId || (await exportsKind(actor, r.kind)) ? { syncDirty: true } : {};
  if (r.repeat === "NONE") {
    const row = await commit(actor, r, { status: "DONE", doneAt: now, nextFireAt: null, snoozeUntil: null, nagAt: null, ...dirty });
    return (await dtos(actor, [row]))[0]!;
  }
  // ทำซ้ำ: ไม่ปิดแถว
  const occ = opts.occ ? +opts.occ : null;
  if (occ !== null && !Number.isFinite(occ)) throw new CalError(400, "invalid", "ครั้งที่ระบุไม่ถูกต้อง");
  if (occ !== null && occ > +r.occursAt) throw new CalError(400, "invalid", "ติ๊กได้เฉพาะครั้งถัดไปของเตือนทำซ้ำ");
  const ackOnly = occ !== null ? occ < +r.occursAt : !!(r.snoozeUntil || r.nagAt) || (r.firedOccAt != null && +r.firedOccAt === +r.occursAt);
  if (ackOnly) {
    if (!r.snoozeUntil && !r.nagAt) return (await dtos(actor, [r]))[0]!; // ไม่มีอะไรค้าง = idempotent
    const s = schedule({ ...r, snoozeUntil: null, nagAt: null }, now);
    const row = await commit(actor, r, { snoozeUntil: null, nagAt: null, nextFireAt: s.nextFireAt, ...dirty });
    return (await dtos(actor, [row]))[0]!;
  }
  // occ = occursAt (ยังไม่ยิง) → ข้ามครั้งนี้ ไปครั้งถัดไป
  const s = schedule({ ...r, firedOccAt: r.occursAt, snoozeUntil: null, nagAt: null }, now);
  const row = await commit(actor, r, { firedOccAt: r.occursAt, occursAt: s.occursAt, snoozeUntil: null, nagAt: null, nextFireAt: s.nextFireAt, ...dirty });
  return (await dtos(actor, [row]))[0]!;
}

/** DONE → OPEN (repeat NONE เท่านั้น) · เวลาผ่านแล้ว = ไม่ยิง แต่แสดงค้าง */
export async function reopen(actor: CalActor, id: string, now = new Date()): Promise<CalItemDto> {
  const r = await own(actor, id);
  if (r.repeat !== "NONE") throw new CalError(409, "repeating", "รายการทำซ้ำติ๊กออกไม่ได้");
  if (r.status === "OPEN") return (await dtos(actor, [r]))[0]!;
  if (r.status !== "DONE") throw closed();
  const s = schedule({ ...r, status: "OPEN", snoozeUntil: null, nagAt: null }, now);
  const row = await commit(actor, r, { status: "OPEN", doneAt: null, occursAt: s.occursAt, nextFireAt: s.nextFireAt, ...(r.externalId ? { syncDirty: true } : {}) });
  return (await dtos(actor, [row]))[0]!;
}

// ───────── เลื่อน (§5.4) ─────────
export async function snooze(actor: CalActor, id: string, to: SnoozeTo, now = new Date()): Promise<CalItemDto> {
  const target = snoozeTarget(to, now);
  if (!target) throw new CalError(400, "invalid", MSG.snooze);
  const r = await own(actor, id);
  if (r.status !== "OPEN") throw closed();
  const s = schedule({ ...r, snoozeUntil: target, nagAt: null }, now);
  const row = await commit(actor, r, { snoozeUntil: target, nagAt: null, nextFireAt: s.nextFireAt, fireAttempts: 0 });
  return (await dtos(actor, [row]))[0]!;
}

// ───────── อ่าน ─────────
export async function getItem(actor: CalActor, id: string): Promise<CalItemDetailDto> {
  const r = await own(actor, id);
  const links = r.linkType && r.linkId ? await resolveLinks(actor, [{ type: r.linkType, id: r.linkId }]) : new Map<string, LinkInfo>();
  const li = r.linkType && r.linkId ? links.get(linkKey({ type: r.linkType, id: r.linkId })) : undefined;
  const phone = li && (li.type === "CRM_CONTACT" || li.type === "CRM_DEAL") ? li.phone : null;
  return { item: toDto(r, links), phone };
}

export type ListTab = "today" | "upcoming" | "done";
/** cursor `"<iso>|<id>"` ของแถวสุดท้ายที่ได้ (ต่อจากนั้น) */
export async function listItems(
  actor: CalActor,
  q: { tab: ListTab; take?: number; before?: string | null },
  now = new Date(),
): Promise<{ items: CalItemDto[]; nextBefore?: string }> {
  const take = Math.max(1, Math.min(100, q.take ?? 50));
  const tomorrow = new Date((bkkDayNo(now) + 1) * DAY_MS - BKK_MS);
  let cur: { at: Date; id: string } | null = null;
  if (q.before) {
    const [a, b] = q.before.split("|");
    const at = new Date(a ?? "");
    if (!b || !Number.isFinite(+at)) throw new CalError(400, "invalid", "ตำแหน่งหน้าถัดไปไม่ถูกต้อง");
    cur = { at, id: b };
  }
  let rows: CalItem[];
  if (q.tab === "done") {
    rows = await dbOf(actor).calItem.findMany({
      where: {
        userId: actor.userId,
        tenantId: actor.tenantId,
        status: "DONE",
        ...(cur ? { OR: [{ doneAt: { lt: cur.at } }, { doneAt: cur.at, id: { lt: cur.id } }] } : {}),
      },
      orderBy: [{ doneAt: "desc" }, { id: "desc" }],
      take: take + 1,
    });
  } else {
    // today = OPEN ที่ occursAt ก่อนพรุ่งนี้ (รวมที่เลยเวลาแล้วยังไม่ติ๊ก) · upcoming = OPEN/DRAFT ตั้งแต่พรุ่งนี้
    const range = q.tab === "today" ? { lt: tomorrow } : { gte: tomorrow };
    rows = await dbOf(actor).calItem.findMany({
      where: {
        userId: actor.userId,
        tenantId: actor.tenantId,
        status: q.tab === "today" ? "OPEN" : { in: ["OPEN", "DRAFT"] },
        occursAt: range,
        ...(cur ? { OR: [{ occursAt: { gt: cur.at } }, { occursAt: cur.at, id: { gt: cur.id } }] } : {}),
      },
      orderBy: [{ occursAt: "asc" }, { id: "asc" }],
      take: take + 1,
    });
  }
  const more = rows.length > take;
  const page = rows.slice(0, take);
  const last = page[page.length - 1];
  const key = last ? (q.tab === "done" ? last.doneAt ?? last.updatedAt : last.occursAt) : null;
  return { items: await dtos(actor, page), ...(more && last && key ? { nextBefore: `${key.toISOString()}|${last.id}` } : {}) };
}

/** การ์ดเตือนในห้องเลขา (R-CAL-20) — ของผู้เรียกเท่านั้น */
export async function roomReminders(actor: CalActor, roomId: string): Promise<CalItemDto[]> {
  const rows = await dbOf(actor).calItem.findMany({
    where: { userId: actor.userId, tenantId: actor.tenantId, roomId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 100,
  });
  return dtos(actor, rows);
}

/** ออกจากร้าน (removeStaff) — ลบของส่วนตัวของ (คนนั้น, ร้านนั้น) · เรียกจากด่านที่ตรวจสิทธิ์ผู้ลบแล้วเท่านั้น */
export async function purgeMemberCalendar(member: { userId: string; tenantId: string }): Promise<void> {
  const db = dbOf(member);
  await db.calItem.deleteMany({ where: { userId: member.userId, tenantId: member.tenantId } });
  await db.calPref.deleteMany({ where: { userId: member.userId, tenantId: member.tenantId } });
}
