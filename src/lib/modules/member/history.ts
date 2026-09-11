// history.ts — ไทม์ไลน์ประวัติของสมาชิก 1 คน (M3.7 · พิมพ์เขียว §4.3 §7.1 §8 · ภาพ 08 ซ้าย/กลาง)
//
// ของที่ไฟล์นี้ให้ (ผ่าน facade `member/index.ts`)
//   • `recordOnce`   — เขียนแถว MemberActivity แบบกันซ้ำ (customerId+module+type+refId) · consumer ทุกโมดูลใช้ตัวนี้
//   • `recordDaily`  — 1 แถวต่อ ref ต่อ "วันไทย" + ตัวนับ (แชท: ห้องเดียวทักวันละหลายข้อความ = แถวเดียว)
//   • `patchActivity`— เติม data/summary ให้แถวที่มีแล้ว (สะพานขายเติมแต้ม/ตราหลังคิดเสร็จ)
//   • `listHistory`  — อ่านไทม์ไลน์: แถวในตาราง + อ่านผ่าน (read-through) เอกสารบัญชีของ party + การ์ดบอร์ดงานที่ยังเปิด
//                      กรองชนิด/ช่วง/สาขา · นับต่อชนิด · เคอร์เซอร์คอมโพสิต (เวลา+id) · ขอบเขตสาขาของ actor
//
// 🔴 ด่านมองเห็น = ด่านเดียวกับหน้า 360/`briefFor` (`loadVisibleMember`) — ไม่เห็น = ไม่พบ เสมอ (§6.4)
// 🔴 ขอบเขตสาขาของแถว: actor ที่ถูกจำกัดสาขาเห็นเฉพาะแถว unitId ∈ unitAccess หรือ unitId ว่าง (เรื่องระดับร้าน)
// 🔴 read-through ข้ามโมดูลผ่าน facade เท่านั้น: `@/lib/modules/account` (listDocsByParty) · `@/lib/modules/kanban/links`
//    (listCardsForTarget) — **dynamic import** ทั้งคู่: account/index อยู่ในวงจรโหลดไฟล์ของโมดูลบัญชี
//    (account → member มีอยู่แล้ว) และ kanban/links ลากทั้งโมดูลบอร์ดงาน ⇒ โหลดเฉพาะตอนเปิดแท็บประวัติจริง
//    read-through พัง (โมดูลปลายทางล่ม) = ไทม์ไลน์ยังเปิดได้ (แค่ไม่มีแถวอ่านผ่าน) — ไม่ทำหน้า 360 พัง
// 🔴 แถว `pos/VOID` คือ "ธง" กันบวกยอดสะสมซ้ำของสะพานขาย (M2.8) — ไทม์ไลน์ใช้ `pos/PURCHASE_VOIDED` แทน
//    ⇒ ซ่อน VOID ที่มี PURCHASE_VOIDED คู่กันแล้ว (ของเก่าก่อน M3.7 ที่มีแต่ VOID ยังโชว์ตามเดิม)

import { Prisma } from "@prisma/client";
import { formatThaiDateTime } from "@/lib/ui/date";
import { unitsForSystem } from "@/lib/modules/system/service";
import { prisma } from "./db";
import { canReadMember, coversUnit, isUnitScoped, type MemberActor } from "./access";
import { MemberForbiddenError, MemberInputError, MemberNotFoundError } from "./errors";
import { loadVisibleMember, type MemberCtx } from "./profile";
import {
  HISTORY_KINDS,
  channelDisplayName,
  emptyHistoryCounts,
  historyKindDef,
  isHistoryKind,
  kindOf,
  type HistoryCounts,
  type HistoryKindFilter,
  type HistoryKindKey,
  type HistoryPageView,
} from "./history-kinds";

type Tx = Prisma.TransactionClient;

export const HISTORY_MAX_TAKE = 100;
const DEFAULT_TAKE = 30;
const DAY_MS = 86_400_000;
const BKK_OFFSET_MS = 7 * 3_600_000;
/** read-through ต่อครั้ง (เอกสาร/การ์ดของคนเดียวเกินนี้ = หายากมาก · ตัดที่นี่กันหน้าช้า) */
const READ_THROUGH_DOCS = 100;

// ───────────────────────── ชนิดข้อมูลสาธารณะ ─────────────────────────

export type RecordOnceInput = {
  customerId: string;
  module: string;
  type: string;
  refType?: string | null;
  refId: string;
  summary: string;
  data?: Record<string, unknown> | null;
  unitId?: string | null;
  actorUserId?: string | null;
  /** เวลาเหตุการณ์จริง (ไม่ส่ง = ตอนนี้) — แถวย้อนหลัง/นำเข้า */
  at?: Date | null;
};

export type RecordOnceResult = { id: string; created: boolean };

export type RecordDailyInput = RecordOnceInput & {
  /** id ของ event ที่ทำให้เกิดการนับ — replay event เดิม = ไม่นับเพิ่ม */
  eventId?: string | null;
};

export type HistoryOptions = {
  kind?: HistoryKindFilter | null;
  from?: Date | string | null;
  to?: Date | string | null;
  unitId?: string | null;
  /** ≤ 100 (ค่าปริยาย 30) */
  take?: number | null;
  cursor?: string | null;
};

export type HistoryItem = {
  id: string;
  at: Date;
  kind: HistoryKindKey;
  module: string;
  type: string;
  /** หัวเรื่องไทยสั้น เช่น "ซื้อบิล R-1042 · ฿4,550.00" */
  title: string;
  summary: string;
  /** ป้ายสั้นต่อท้ายหัวเรื่อง ("มาแล้ว" · ชื่อคอลัมน์ของการ์ด · สถานะเอกสาร) */
  badge: string | null;
  data: Record<string, unknown> | null;
  ref: { type: string; id: string; href: string | null } | null;
  unit: { id: string; name: string } | null;
  actor: { id: string; name: string } | null;
};

export type HistoryResult = {
  items: HistoryItem[];
  /** null = หมดแล้ว */
  nextCursor: string | null;
  counts: HistoryCounts;
};

// ───────────────────────── ตัวช่วย ─────────────────────────

function objectOf(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const baht = (satang: number): string =>
  `฿${(satang / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** เที่ยงคืนของ "วันไทย" ที่ครอบเวลานี้ (UTC+7 — ห้ามใช้ getDay/getDate ของเครื่อง) */
export function bkkDayStart(at: Date): Date {
  return new Date(Math.floor((at.getTime() + BKK_OFFSET_MS) / DAY_MS) * DAY_MS - BKK_OFFSET_MS);
}

async function lockKey(tx: Tx, key: string): Promise<void> {
  // serialize ต่อกุญแจ (ตาราง MemberActivity ไม่มี unique index ให้พึ่ง — ใบนี้ไม่มี migration)
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}

function assertRecordInput(input: RecordOnceInput): void {
  for (const [k, v] of [
    ["customerId", input.customerId],
    ["module", input.module],
    ["type", input.type],
    ["refId", input.refId],
    ["summary", input.summary],
  ] as const) {
    if (typeof v !== "string" || !v.trim()) {
      throw new MemberInputError(`บันทึกประวัติสมาชิกไม่ได้ — ขาดข้อมูล "${k}" ของเหตุการณ์`);
    }
  }
}

function isFkMissing(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003";
}

// ───────────────────────── เขียน ─────────────────────────

/**
 * เขียนแถวไทม์ไลน์ครั้งเดียวต่อ (customerId, module, type, refId)
 * ซ้ำ = คืนแถวเดิม `{ created: false }` (consumer ของคิว outbox ถูกยิงซ้ำได้เสมอ — drain หลายรอบ/retry)
 * `tx` = เขียนใน transaction ของผู้เรียก (สะพานขายเขียนคู่กับยอดสะสม) · ไม่ส่ง = เปิด tx ของตัวเอง
 */
export async function recordOnce(ctx: { tenantId: string }, input: RecordOnceInput, tx?: Tx): Promise<RecordOnceResult> {
  assertRecordInput(input);
  const run = async (db: Tx): Promise<RecordOnceResult> => {
    await lockKey(db, `member-activity|${ctx.tenantId}|${input.customerId}|${input.module}|${input.type}|${input.refId}`);
    const found = await db.memberActivity.findFirst({
      where: { tenantId: ctx.tenantId, customerId: input.customerId, module: input.module, type: input.type, refId: input.refId },
      select: { id: true },
    });
    if (found) return { id: found.id, created: false };
    const row = await db.memberActivity.create({
      data: {
        tenantId: ctx.tenantId,
        customerId: input.customerId,
        module: input.module,
        type: input.type,
        refType: input.refType ?? null,
        refId: input.refId,
        summary: clip(input.summary.trim(), 500),
        unitId: input.unitId ?? null,
        actorUserId: input.actorUserId ?? null,
        ...(input.data ? { data: input.data as Prisma.InputJsonValue } : {}),
        ...(input.at ? { createdAt: input.at } : {}),
      },
      select: { id: true },
    });
    return { id: row.id, created: true };
  };
  try {
    return tx ? await run(tx) : await prisma.$transaction(run);
  } catch (e) {
    if (isFkMissing(e)) throw new MemberNotFoundError();
    throw e;
  }
}

/**
 * 1 แถวต่อ ref ต่อวันไทย — เหตุการณ์ถัดไปของวันเดียวกัน = ไม่เพิ่มแถว แต่ `data.count` +1 และ data/summary ใหม่ทับ
 * (แชท: ลูกค้าทักห้องเดียว 30 ข้อความในวันเดียว = ไทม์ไลน์ 1 บรรทัด "ทักทาง LINE 30 ข้อความ")
 * 🔴 replay event เดิม (`eventId` ซ้ำ) = ไม่นับเพิ่ม · จำ id ล่าสุด 20 ตัวใน data
 */
export async function recordDaily(
  ctx: { tenantId: string },
  input: RecordDailyInput,
): Promise<{ id: string; created: boolean; count: number }> {
  assertRecordInput(input);
  const at = input.at ?? new Date();
  const dayStart = bkkDayStart(at);
  const dayEnd = new Date(dayStart.getTime() + DAY_MS);
  const eventId = str(input.eventId);
  try {
    return await prisma.$transaction(async (tx) => {
      await lockKey(tx, `member-activity-day|${ctx.tenantId}|${input.customerId}|${input.module}|${input.type}|${input.refId}|${dayStart.getTime()}`);
      const found = await tx.memberActivity.findFirst({
        where: {
          tenantId: ctx.tenantId,
          customerId: input.customerId,
          module: input.module,
          type: input.type,
          refId: input.refId,
          createdAt: { gte: dayStart, lt: dayEnd },
        },
        orderBy: { createdAt: "asc" },
        select: { id: true, data: true },
      });
      if (found) {
        const prev = objectOf(found.data) ?? {};
        const seen = Array.isArray(prev.eventIds) ? prev.eventIds.filter((x): x is string => typeof x === "string") : [];
        const prevCount = num(prev.count) ?? 1;
        if (eventId && seen.includes(eventId)) return { id: found.id, created: false, count: prevCount };
        const count = prevCount + 1;
        const data = { ...prev, ...(input.data ?? {}), count, eventIds: eventId ? [...seen, eventId].slice(-20) : seen, lastAt: at.toISOString() };
        await tx.memberActivity.update({
          where: { id: found.id },
          data: { data: data as Prisma.InputJsonValue, summary: clip(input.summary.trim(), 500) },
        });
        return { id: found.id, created: false, count };
      }
      const data = { ...(input.data ?? {}), count: 1, eventIds: eventId ? [eventId] : [], lastAt: at.toISOString() };
      const row = await tx.memberActivity.create({
        data: {
          tenantId: ctx.tenantId,
          customerId: input.customerId,
          module: input.module,
          type: input.type,
          refType: input.refType ?? null,
          refId: input.refId,
          summary: clip(input.summary.trim(), 500),
          unitId: input.unitId ?? null,
          actorUserId: input.actorUserId ?? null,
          data: data as Prisma.InputJsonValue,
          createdAt: at,
        },
        select: { id: true },
      });
      return { id: row.id, created: true, count: 1 };
    });
  } catch (e) {
    if (isFkMissing(e)) throw new MemberNotFoundError();
    throw e;
  }
}

/**
 * เติม data (ผสาน) และ/หรือเปลี่ยน summary ของแถวที่มีอยู่แล้ว — คืน false เมื่อยังไม่มีแถว
 * (สะพานขาย: แถว PURCHASE ถูกเขียนก่อนคิดแต้ม ⇒ เติม `pointsEarned`/`stampsAdded` ทีหลัง · เขียนค่าเดิมซ้ำได้)
 */
export async function patchActivity(
  ctx: { tenantId: string },
  key: { customerId: string; module: string; type: string; refId: string },
  patch: { summary?: string | null; data?: Record<string, unknown> | null },
): Promise<boolean> {
  const row = await prisma.memberActivity.findFirst({
    where: { tenantId: ctx.tenantId, customerId: key.customerId, module: key.module, type: key.type, refId: key.refId },
    orderBy: { createdAt: "asc" },
    select: { id: true, data: true },
  });
  if (!row) return false;
  const data = patch.data ? { ...(objectOf(row.data) ?? {}), ...patch.data } : null;
  await prisma.memberActivity.update({
    where: { id: row.id },
    data: {
      ...(data ? { data: data as Prisma.InputJsonValue } : {}),
      ...(patch.summary && patch.summary.trim() ? { summary: clip(patch.summary.trim(), 500) } : {}),
    },
  });
  return true;
}

// ───────────────────────── อ่าน ─────────────────────────

const TIER_TYPES: readonly string[] = HISTORY_KINDS.flatMap((k) => k.types ?? []);

/** เงื่อนไข DB ของชิปหนึ่งตัว — ต้องตรงกับ `kindOf` ทุกกรณี (ตัวนับต่อชิปรวมกันต้องเท่า "ทั้งหมด") */
function kindWhere(kind: HistoryKindKey): Prisma.MemberActivityWhereInput {
  const def = historyKindDef(kind);
  if (def.types && def.types.length > 0) return { type: { in: [...def.types] } };
  if (kind === "profile") {
    const others = HISTORY_KINDS.filter((k) => k.key !== "profile").flatMap((k) => [...k.modules]);
    return { module: { notIn: others }, type: { notIn: [...TIER_TYPES] } };
  }
  return { module: { in: [...def.modules] }, type: { notIn: [...TIER_TYPES] } };
}

function parseDate(v: Date | string | null | undefined, label: string): Date | null {
  if (v === null || v === undefined || v === "") return null;
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) throw new MemberInputError(`${label}ไม่ใช่วันที่ที่อ่านได้ — เลือกช่วงเวลาใหม่อีกครั้ง`);
  return d;
}

type Cursor = { at: Date; id: string };

function encodeCursor(c: { at: Date; id: string }): string {
  return Buffer.from(`${c.at.getTime()}.${c.id}`, "utf8").toString("base64url");
}

function decodeCursor(raw: string | null | undefined): Cursor | null {
  if (!raw) return null;
  const txt = Buffer.from(String(raw), "base64url").toString("utf8");
  const dot = txt.indexOf(".");
  const ms = Number(txt.slice(0, dot));
  const id = txt.slice(dot + 1);
  if (dot <= 0 || !Number.isFinite(ms) || !id) {
    throw new MemberInputError("ตำแหน่ง \"โหลดเพิ่ม\" หมดอายุแล้ว — เปิดแท็บประวัติใหม่อีกครั้ง");
  }
  return { at: new Date(ms), id };
}

/** เรียงใหม่สุดก่อน · เวลาเท่ากันเรียง id มากไปน้อย (ชุดเดียวกับ orderBy ของ DB) */
function before(a: { at: Date; id: string }, c: Cursor): boolean {
  const t = a.at.getTime();
  const ct = c.at.getTime();
  return t < ct || (t === ct && a.id < c.id);
}
function byNewest(a: { at: Date; id: string }, b: { at: Date; id: string }): number {
  const d = b.at.getTime() - a.at.getTime();
  if (d !== 0) return d;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/** แถวก่อนแปลงเป็น DTO (ทั้งแถวในตารางและแถวอ่านผ่าน) */
type RawRow = {
  id: string;
  at: Date;
  module: string;
  type: string;
  refType: string | null;
  refId: string | null;
  summary: string;
  data: Record<string, unknown> | null;
  unitId: string | null;
  actorUserId: string | null;
  /** แถวอ่านผ่านรู้ปลายทางเองแล้ว */
  href?: string | null;
  title?: string;
  badge?: string | null;
};

/** หัวเรื่องไทยสั้นของแถว (หน้าจอ/REST/AI ใช้ชุดเดียวกัน) — ไม่รู้จัก = ใช้ summary */
function titleOf(r: RawRow): { title: string; badge: string | null } {
  if (r.title) return { title: r.title, badge: r.badge ?? null };
  const d = r.data ?? {};
  const s = r.summary;
  switch (`${r.module}/${r.type}`) {
    case "pos/PURCHASE": {
      const net = num(d.netSatang);
      if (r.refType === "ShopOrder") {
        const ch = channelDisplayName(str(d.channel) ?? "SHOP");
        return { title: `ซื้อออนไลน์ ${ch}${str(d.code) ? ` ${str(d.code)}` : ""}${net !== null ? ` · ${baht(net)}` : ""}`, badge: null };
      }
      const no = str(d.receiptNo);
      return { title: `ซื้อบิล${no ? ` ${no}` : ""}${net !== null ? ` · ${baht(net)}` : ""}`, badge: null };
    }
    case "pos/PURCHASE_VOIDED":
    case "pos/VOID": {
      const no = str(d.receiptNo);
      const net = num(d.netSatang);
      return { title: `ยกเลิกบิล${no ? ` ${no}` : ""}${net !== null ? ` · ${baht(net)}` : ""}`, badge: "ยกเลิก" };
    }
    case "booking/APPOINTMENT_BOOKED":
      return { title: `จองนัด${str(d.serviceName) ? ` ${str(d.serviceName)}` : ""}`, badge: null };
    case "booking/VISIT":
      return { title: `มาตามนัด${str(d.serviceName) ? ` ${str(d.serviceName)}` : ""}`, badge: "มาแล้ว" };
    case "booking/NO_SHOW":
      return { title: `ไม่มาตามนัด${str(d.serviceName) ? ` ${str(d.serviceName)}` : ""}`, badge: null };
    case "chat/MESSAGE": {
      const ch = channelDisplayName(str(d.channel) ?? "");
      const p = str(d.preview);
      return { title: `แชท ${ch}${p ? ` — "${clip(p, 80)}"` : ""}`, badge: null };
    }
    case "chat/CHANNEL_LINKED":
    case "chat/CHAT_LINKED":
      return { title: `ผูกช่องทาง ${channelDisplayName(str(d.channel) ?? "")}`.trim(), badge: null };
    case "member/TIER_CHANGED": {
      const from = str(d.from);
      const to = str(d.to);
      return { title: from && to ? `เลื่อนระดับ ${from} → ${to}` : to ? `ปรับระดับเป็น ${to}` : clip(s, 120), badge: null };
    }
    case "point/POINTS_EARNED":
      return { title: `ได้ ${(num(d.points) ?? 0).toLocaleString("th-TH")} แต้ม`, badge: null };
    case "point/POINTS_BURNED":
      return { title: `ใช้ ${(num(d.points) ?? 0).toLocaleString("th-TH")} แต้ม`, badge: null };
    case "point/POINTS_EXPIRED":
      return { title: `แต้มหมดอายุ ${(num(d.points) ?? 0).toLocaleString("th-TH")} แต้ม`, badge: null };
    case "kanban/CARD_COMPLETED":
      return { title: `งานบอร์ด "${clip(str(d.title) ?? "", 80)}" ปิดแล้ว`, badge: null };
    case "crm/DEAL_WON": {
      const v = num(d.valueSatang);
      return { title: `ปิดดีลสำเร็จ${str(d.title) ? ` "${clip(str(d.title) ?? "", 80)}"` : ""}${v !== null ? ` · ${baht(v)}` : ""}`, badge: null };
    }
    case "member/CREATED":
      return { title: "สมัครสมาชิก", badge: null };
    default:
      return { title: clip(s, 120), badge: null };
  }
}

/** ข้อความบรรทัดรอง — ถ้าหัวเรื่องเอามาจาก summary อยู่แล้ว ไม่ต้องซ้ำ */
function detailOf(r: RawRow, title: string): string {
  const s = r.summary.trim();
  if (!s || clip(s, 120) === title) return "";
  return s;
}

type Viewer = { tenantId: string; memberSystemId: string; actor: MemberActor };

/** เอกสารบัญชีของ party (read-through · facade `@/lib/modules/account`) */
async function docsReadThrough(v: Viewer, partyId: string): Promise<RawRow[]> {
  try {
    const account = await import("@/lib/modules/account");
    const docs = await account.listDocsByParty(v.tenantId, partyId, { take: READ_THROUGH_DOCS });
    if (docs.length === 0) return [];
    // สาขาของเอกสาร = สาขาของบิลต้นทาง (เอกสารจาก POS) · เอกสารที่ร้านออกเอง = ระดับร้าน (null)
    const saleIds = docs.filter((d) => d.refType === "PosSale" && d.refId).map((d) => d.refId as string);
    const sales = saleIds.length
      ? await prisma.posSale.findMany({ where: { tenantId: v.tenantId, id: { in: saleIds } }, select: { id: true, unitId: true } })
      : [];
    const unitOfSale = new Map(sales.map((s) => [s.id, s.unitId]));
    return docs.map((d) => ({
      id: `doc:${d.id}`,
      at: d.issuedAt ?? d.createdAt,
      module: "account",
      type: "DOCUMENT",
      refType: "AccountDocument",
      refId: d.id,
      summary: `${d.statusLabel} · ${baht(d.totalSatang)}`,
      data: { docType: d.docType, docNo: d.docNo, totalSatang: d.totalSatang, status: d.status, statusLabel: d.statusLabel },
      unitId: d.refType === "PosSale" && d.refId ? (unitOfSale.get(d.refId) ?? null) : null,
      actorUserId: null,
      href: d.href,
      title: `${d.docLabel} ${d.docNo ?? "(ร่าง)"}`,
      badge: d.statusLabel,
    }));
  } catch {
    return []; // โมดูลบัญชีอ่านไม่ได้ชั่วคราว = ไทม์ไลน์ยังเปิดได้ (แค่ไม่มีแถวเอกสาร)
  }
}

/** การ์ดบอร์ดงานที่ผูก PARTY นี้และ **ยังเปิดอยู่** (read-through · facade `@/lib/modules/kanban/links`) */
async function cardsReadThrough(v: Viewer, partyId: string): Promise<RawRow[]> {
  if (v.actor.role === "CUSTOMER") return [];
  try {
    const systems = await prisma.appSystem.findMany({ where: { tenantId: v.tenantId, type: "KANBAN" }, select: { id: true } });
    if (systems.length === 0) return [];
    const links = await import("@/lib/modules/kanban/links");
    const kActor = { userId: v.actor.userId, role: v.actor.role, unitAccess: v.actor.unitAccess, permissions: v.actor.permissions };
    const lists = await Promise.all(
      systems.map(async (s) => {
        const rows = await links.listCardsForTarget({ tenantId: v.tenantId, systemId: s.id, actorUserId: v.actor.userId }, kActor, { linkType: "PARTY", linkId: partyId });
        return rows.map((r) => ({ ...r, systemId: s.id }));
      }),
    );
    const cards = lists.flat().filter((c) => c.status === "ACTIVE");
    if (cards.length === 0) return [];
    // "ยังเปิด" = ยังไม่เข้าคอลัมน์เสร็จ (completedAt ว่าง) — ปิดแล้วมีแถว CARD_COMPLETED ของตัวเองอยู่แล้ว
    const meta = await prisma.kanbanCard.findMany({
      where: { tenantId: v.tenantId, id: { in: cards.map((c) => c.cardId) } },
      select: { id: true, completedAt: true, createdAt: true },
    });
    const metaOf = new Map(meta.map((m) => [m.id, m]));
    return cards
      .filter((c) => metaOf.get(c.cardId) && !metaOf.get(c.cardId)?.completedAt)
      .map((c) => ({
        id: `card:${c.cardId}`,
        at: metaOf.get(c.cardId)?.createdAt ?? new Date(0),
        module: "kanban",
        type: "CARD_OPEN",
        refType: "KanbanCard",
        refId: c.cardId,
        summary: `บอร์ด${c.boardName} · อยู่ที่ "${c.columnName}"${c.dueAt ? ` · กำหนดส่ง ${formatThaiDateTime(c.dueAt)}` : ""}`,
        data: { cardNo: c.cardNo, title: c.title, boardName: c.boardName, columnName: c.columnName, status: c.status },
        unitId: null,
        actorUserId: null,
        href: `/app/sys/${c.systemId}/kanban/b/${c.boardId}?card=${c.cardId}`,
        title: `งานบอร์ด "${clip(c.title, 80)}"`,
        badge: c.columnName,
      }));
  } catch {
    return []; // บอร์ดงานอ่านไม่ได้ชั่วคราว = ไทม์ไลน์ยังเปิดได้
  }
}

/** ลิงก์ไปต้นทางของแถวในตาราง (ค้นเป็นชุดต่อชนิด ref — เฉพาะของที่มีอยู่จริงเท่านั้นถึงได้ลิงก์) */
async function hrefsFor(v: Viewer, rows: RawRow[], unitSlug: Map<string, string>): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const idsOf = (refType: string) => [...new Set(rows.filter((r) => r.refType === refType && r.refId && !r.href).map((r) => r.refId as string))];
  const mem = `/app/sys/${v.memberSystemId}/member`;
  const [sales, convs, contacts, cards, deals] = await Promise.all([
    idsOf("PosSale").length ? prisma.posSale.findMany({ where: { tenantId: v.tenantId, id: { in: idsOf("PosSale") } }, select: { id: true, systemId: true } }) : [],
    idsOf("ChatConversation").length ? prisma.chatConversation.findMany({ where: { tenantId: v.tenantId, id: { in: idsOf("ChatConversation") } }, select: { id: true, systemId: true } }) : [],
    idsOf("ChatContact").length
      ? prisma.chatConversation.findMany({ where: { tenantId: v.tenantId, contactId: { in: idsOf("ChatContact") } }, orderBy: { lastMessageAt: "desc" }, select: { id: true, systemId: true, contactId: true } })
      : [],
    idsOf("KanbanCard").length ? prisma.kanbanCard.findMany({ where: { tenantId: v.tenantId, id: { in: idsOf("KanbanCard") } }, select: { id: true, systemId: true, boardId: true } }) : [],
    idsOf("CrmDeal").length ? prisma.crmDeal.findMany({ where: { tenantId: v.tenantId, id: { in: idsOf("CrmDeal") } }, select: { id: true, systemId: true } }) : [],
  ]);
  const saleSys = new Map(sales.map((s) => [s.id, s.systemId]));
  const convSys = new Map(convs.map((c) => [c.id, c.systemId]));
  const contactConv = new Map<string, { id: string; systemId: string }>();
  for (const c of contacts) if (!contactConv.has(c.contactId)) contactConv.set(c.contactId, { id: c.id, systemId: c.systemId });
  const cardOf = new Map(cards.map((c) => [c.id, c]));
  const dealSys = new Map(deals.map((d) => [d.id, d.systemId]));

  for (const r of rows) {
    if (r.href || !r.refId) continue;
    const id = r.refId;
    let href: string | null = null;
    switch (r.refType) {
      case "PosSale":
        href = saleSys.get(id) ? `/app/sys/${saleSys.get(id)}/pos/sales` : null;
        break;
      case "ShopOrder":
        href = r.unitId && unitSlug.get(r.unitId) ? `/app/u/${unitSlug.get(r.unitId)}/shop/orders` : null;
        break;
      case "Appointment":
        href = r.unitId && unitSlug.get(r.unitId) ? `/app/u/${unitSlug.get(r.unitId)}/booking` : null;
        break;
      case "ChatConversation":
        href = convSys.get(id) ? `/app/sys/${convSys.get(id)}/chat?c=${id}` : null;
        break;
      case "ChatContact": {
        const c = contactConv.get(id);
        href = c ? `/app/sys/${c.systemId}/chat?c=${c.id}` : null;
        break;
      }
      case "KanbanCard": {
        const c = cardOf.get(id);
        href = c ? `/app/sys/${c.systemId}/kanban/b/${c.boardId}?card=${c.id}` : null;
        break;
      }
      case "CrmDeal":
        href = dealSys.get(id) ? `/app/sys/${dealSys.get(id)}/crm/deals` : null;
        break;
      // ── ของในระบบสมาชิกเอง (หน้าที่มีจริงใต้ /member) ──
      case "MemberReview":
        href = `${mem}/reviews`;
        break;
      case "Referral":
        href = `${mem}/referrals`;
        break;
      case "Voucher":
        href = `${mem}/promotions/vouchers`;
        break;
      case "GiftCard":
        href = `${mem}/promotions/giftcards`;
        break;
      case "StampCardProgress":
        href = `${mem}/stamps`;
        break;
      case "RewardRedemption":
        href = `${mem}/rewards/redemptions`;
        break;
      case "MemberTierHistory":
        href = `${mem}/tiers`;
        break;
      default:
        href = r.module === "point" ? `${mem}/points` : null;
    }
    if (href) out.set(r.id, href);
  }
  return out;
}

/**
 * ไทม์ไลน์ของสมาชิก (ใหม่สุดก่อน) — แท็บ "ประวัติ" ของหน้า 360 (ภาพ 08) · `getMember360().history`
 *
 * ลำดับงาน (ยิงขนานเป็นชุด — เป้าหมาย < 600 ms ที่ 1,200 แถว):
 *   ชุด 1: ด่านมองเห็น + รายการบิลที่มี PURCHASE_VOIDED (ซ่อน VOID คู่กัน)
 *   ชุด 2: แถวหน้านี้ (take+1) · ตัวนับต่อ (module,type) · read-through เอกสาร/การ์ด
 *   ชุด 3: ชื่อสาขา/พนักงาน + ลิงก์ต้นทาง (เฉพาะแถวในหน้านี้)
 */
export async function listHistory(ctx: MemberCtx, actor: MemberActor, customerId: string, opts: HistoryOptions = {}): Promise<HistoryResult> {
  if (!canReadMember(actor)) {
    throw new MemberForbiddenError("บัญชีของคุณยังไม่ได้รับสิทธิ์เข้าโมดูลสมาชิก — ขอสิทธิ์จากเจ้าของร้านก่อน");
  }
  const take = opts.take ?? DEFAULT_TAKE;
  if (!Number.isInteger(take) || take < 1) throw new MemberInputError("จำนวนรายการต่อหน้าต้องเป็นจำนวนเต็มตั้งแต่ 1 ขึ้นไป");
  if (take > HISTORY_MAX_TAKE) {
    throw new MemberInputError(`ดูประวัติได้สูงสุด ${HISTORY_MAX_TAKE} รายการต่อครั้ง — กด "โหลดเพิ่ม" เพื่อดูรายการถัดไป`);
  }
  const kindRaw = opts.kind ?? "all";
  if (kindRaw !== "all" && !isHistoryKind(kindRaw)) throw new MemberInputError(`ไม่มีชนิดประวัติ "${kindRaw}" ในระบบ`);
  const kind: HistoryKindFilter = kindRaw;
  const from = parseDate(opts.from, "วันเริ่ม");
  const to = parseDate(opts.to, "วันสิ้นสุด");
  const cursor = decodeCursor(opts.cursor);
  const unitFilter = str(opts.unitId);
  const scoped = actor.role !== "CUSTOMER" && isUnitScoped(actor);

  // ── ชุด 1 ──
  const [member, voided] = await Promise.all([
    loadVisibleMember(ctx, actor, customerId),
    prisma.memberActivity.findMany({
      where: { tenantId: ctx.tenantId, customerId, module: "pos", type: "PURCHASE_VOIDED" },
      select: { refId: true },
    }),
  ]);
  const voidedRefIds = voided.map((v) => v.refId).filter((x): x is string => !!x);

  const base: Prisma.MemberActivityWhereInput[] = [{ tenantId: ctx.tenantId, customerId: member.id }];
  if (from || to) base.push({ createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } });
  if (unitFilter) base.push({ unitId: unitFilter });
  if (scoped) base.push({ OR: [{ unitId: null }, { unitId: { in: actor.unitAccess } }] });
  if (voidedRefIds.length) base.push({ NOT: { module: "pos", type: "VOID", refId: { in: voidedRefIds } } });

  const listWhere: Prisma.MemberActivityWhereInput[] = [...base];
  if (kind !== "all") listWhere.push(kindWhere(kind));
  if (cursor) listWhere.push({ OR: [{ createdAt: { lt: cursor.at } }, { createdAt: cursor.at, id: { lt: cursor.id } }] });

  const viewer: Viewer = { tenantId: ctx.tenantId, memberSystemId: ctx.systemId, actor };
  // read-through เฉพาะพนักงาน/เจ้าของ (ลูกค้าเอง/คีย์ API ไม่เห็นเอกสารบัญชี/การ์ดภายในร้าน)
  const staffView = actor.role !== "CUSTOMER" && !actor.apiRole && !!member.partyId;

  // ── ชุด 2 ──
  const [rows, groups, docs, cards] = await Promise.all([
    prisma.memberActivity.findMany({
      where: { AND: listWhere },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: take + 1,
      select: { id: true, createdAt: true, module: true, type: true, refType: true, refId: true, summary: true, data: true, unitId: true, actorUserId: true },
    }),
    prisma.memberActivity.groupBy({ by: ["module", "type"], where: { AND: base }, _count: { _all: true } }),
    staffView ? docsReadThrough(viewer, member.partyId as string) : Promise.resolve([] as RawRow[]),
    staffView ? cardsReadThrough(viewer, member.partyId as string) : Promise.resolve([] as RawRow[]),
  ]);

  // read-through ผ่านตัวกรองเดียวกับแถวในตาราง (ช่วง · สาขา · ขอบเขตสาขา)
  const rtAll = [...docs, ...cards].filter((r) => {
    if (from && r.at < from) return false;
    if (to && r.at > to) return false;
    if (unitFilter && r.unitId !== unitFilter) return false;
    if (scoped && r.unitId && !coversUnit(actor, r.unitId)) return false;
    return true;
  });

  const counts = emptyHistoryCounts();
  for (const g of groups) {
    const n = g._count._all;
    counts[kindOf(g)] += n;
    counts.all += n;
  }
  for (const r of rtAll) {
    counts[kindOf(r)] += 1;
    counts.all += 1;
  }

  const dbRows: RawRow[] = rows.map((r) => ({
    id: r.id,
    at: r.createdAt,
    module: r.module,
    type: r.type,
    refType: r.refType,
    refId: r.refId,
    summary: r.summary,
    data: objectOf(r.data),
    unitId: r.unitId,
    actorUserId: r.actorUserId,
  }));
  const rtPage = rtAll.filter((r) => (kind === "all" || kindOf(r) === kind) && (!cursor || before(r, cursor)));
  const merged = [...dbRows, ...rtPage].sort(byNewest);
  const page = merged.slice(0, take);
  const hasMore = merged.length > take;

  // ── ชุด 3 ──
  const unitIds = [...new Set(page.map((r) => r.unitId).filter((x): x is string => !!x))];
  const actorIds = [...new Set(page.map((r) => r.actorUserId).filter((x): x is string => !!x))];
  const [units, users] = await Promise.all([
    unitIds.length ? prisma.businessUnit.findMany({ where: { tenantId: ctx.tenantId, id: { in: unitIds } }, select: { id: true, name: true, slug: true } }) : [],
    actorIds.length ? prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true, email: true } }) : [],
  ]);
  const unitSlug = new Map(units.map((u) => [u.id, u.slug]));
  const hrefs = await hrefsFor(viewer, page, unitSlug);
  const unitOf = new Map(units.map((u) => [u.id, { id: u.id, name: u.name }]));
  const userOf = new Map(users.map((u) => [u.id, { id: u.id, name: u.name ?? u.email ?? "" }]));

  const items: HistoryItem[] = page.map((r) => {
    const { title, badge } = titleOf(r);
    return {
      id: r.id,
      at: r.at,
      kind: kindOf(r),
      module: r.module,
      type: r.type,
      title: title || historyKindDef(kindOf(r)).label,
      summary: detailOf(r, title),
      badge,
      data: r.data,
      ref: r.refType && r.refId ? { type: r.refType, id: r.refId, href: r.href ?? hrefs.get(r.id) ?? null } : null,
      unit: r.unitId ? (unitOf.get(r.unitId) ?? null) : null,
      actor: r.actorUserId ? (userOf.get(r.actorUserId) ?? null) : null,
    };
  });

  const last = page[page.length - 1];
  return { items, nextCursor: hasMore && last ? encodeCursor(last) : null, counts };
}

/** ผลของ `listHistory` → รูปที่หน้าจอใช้ (เวลาเป็น ISO · ชื่อสาขา/พนักงานแบนเป็นข้อความ) */
export function toHistoryPageView(r: HistoryResult): HistoryPageView {
  return {
    items: r.items.map((i) => ({
      id: i.id,
      at: i.at.toISOString(),
      kind: i.kind,
      module: i.module,
      type: i.type,
      title: i.title,
      summary: i.summary,
      badge: i.badge,
      href: i.ref?.href ?? null,
      unitName: i.unit?.name ?? null,
      actorName: i.actor?.name || null,
    })),
    nextCursor: r.nextCursor,
    counts: r.counts,
  };
}

/** สาขาที่ตัวกรอง "สาขา" เลือกได้ = สาขาที่ผูกระบบสมาชิกนี้ ∩ สาขาที่ actor ดูแล */
export async function historyUnitOptions(ctx: MemberCtx, actor: MemberActor): Promise<{ id: string; name: string }[]> {
  const ids = await unitsForSystem(ctx.tenantId, ctx.systemId);
  const units = await prisma.businessUnit.findMany({
    where: { tenantId: ctx.tenantId, ...(ids.length ? { id: { in: ids } } : {}) },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return units.filter((u) => coversUnit(actor, u.id));
}
