// table.ts — POS P2.4 โหมดโต๊ะในหน้าขาย (ผัง · เปิด/ปิด/เก็บโต๊ะ · ส่งรอบร่างเข้าครัว · โต๊ะจองแบบย่อ · คำขอจากโต๊ะ · ตัวรับ void ของบิลโต๊ะ)
//
// สัญญา: ledger/pos-briefs/pos-brief-P2.4.md §2 R1–R12 · §9 มติผู้คุม · ledger/wo-notes/pos-P2.4-oracle.md ตารางชื่อแถว 13 + CONTROLLER-DECISION 1–13 ·
//        ข้อสอบ scripts/qc-pos-p2.4.mts · โน้ต ledger/wo-notes/pos-P2.4.md (สัญญา P2.4U)
// 🔴 ข้อมูลโต๊ะ/session/ออเดอร์/โต๊ะจองเป็นของโมดูลร้านอาหาร (CD1) — ไฟล์นี้เรียกผ่าน `import("@/lib/modules/restaurant")` เท่านั้น (lazy · วงโหลด
//    restaurant → pos) · ไม่เขียนตาราง Restaurant*/TableSession เอง · ไม่ปล่อย outbox event · ไม่มีจุดเรียกขายของตัวเอง (บิลโต๊ะ = quote/submit ของหน้าขาย)
// 🔴 ทุกฟังก์ชัน (ctx: RegisterCtx, actor: RegisterActor, input) "คืน" {ok:true,…} | RegisterRefusal — ไม่ throw (ขัดข้องที่ไม่คาดคิด = INTERNAL)
// 🔴 ขอบเขต = ด่านเดียวกับหน้าขาย (ร้าน · ระบบ POS · สาขาผูกระบบ · เข้าสาขาได้) + สิทธิ์ pos.sale.create หรือ pos.sale.read (CONTROLLER-DECISION 7) +
//    คีย์ restaurant.* ของงานนั้น (CD8 · ไม่มีคีย์ใหม่) · โต๊ะ/session/การจอง/คำขอ/รายการของสาขาอื่นหรือร้านอื่น = TABLE_NOT_FOUND (404-not-403 · ไม่เขียนอะไร)

import { prisma } from "./db"; // จุดเดียวของ prisma ดิบในโมดูล POS (F5.1)
import type { Prisma, PrismaClient } from "@prisma/client";
import { evaluate } from "@/lib/core/rbac";
import { registerPriceTableRound, registerRefuse, registerScopeFor, registerTableChannelId } from "./register";
import { claimTableDraftInTx, discardTableDraftsInTx, sweepOrphanTableDrafts, tableDraftLineCounts, tableDraftOf } from "./held-cart"; // POS HF-FU ▸ b: + รอบร่างกำพร้า ◂
import { registerMemberBriefs, registerMemberGate } from "./register-member";
import { posPaymentSettings } from "./payment-settings"; // ค่าบริการของหน้าขาย (มติ Q3: แหล่งเดียวของบิลโต๊ะ) ◂
import {
  RESERVATION_HOLD_DEFAULT_MINUTES,
  RESERVATION_HOLD_MAX_MINUTES,
  RESERVATION_LATE_MINUTES,
  RESERVATION_PARTY_MAX,
  reservationHolds,
  tableItemsHash,
  tableStateOf,
  type RegisterTableDetailResult,
  type RegisterTableModeResult,
  type RegisterTablesResult,
  type TableCard,
  type TableMemberBrief,
  type TableZone,
} from "./table-shared";
import type { RegisterActor, RegisterCtx, RegisterRefusal, RegisterRefusalCode } from "./register-shared";
import { itemInOpenSplit, openSplitSessions, releaseSplitPartInTx, repointSplitPlansInTx, splitPartOfSale, splitSummariesOf } from "./table-split"; // POS P2.5 ▸ แผนแยกบิล (R5 R6 R8 R10) ◂
import { heldTableDraftSessions, repointTableDraftsInTx } from "./held-cart"; // POS P2.5 ▸ รวมโต๊ะ: รอบร่างตาม session ปลายทาง (R8) ◂
import { registerTableBillPreview } from "./register"; // POS P2.5 ▸ ใบรายการ = ยอดของ quote โต๊ะ/ใบ (R9) ◂
import { receiptSettingsOf } from "./receipt-settings";
import { writeAudit } from "@/lib/core/audit";
import type { PreBillPayload } from "./pre-bill-render";

type Db = PrismaClient;
type RestFacade = typeof import("@/lib/modules/restaurant");
const restaurant = (): Promise<RestFacade> => import("@/lib/modules/restaurant");

type S = { tenantId: string; systemId: string; unitId: string; actor: RegisterActor; ctx: RegisterCtx };
const VIEW_PERMS = ["pos.sale.create", "pos.sale.read"] as const;

const isRefusal = (v: unknown): v is RegisterRefusal => !!v && typeof v === "object" && (v as { ok?: unknown }).ok === false;
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 200 && !v.includes("\u0000");
const refuse = (code: RegisterRefusalCode, message?: string, lineIndex?: number): RegisterRefusal => {
  const r = registerRefuse(code, message);
  return lineIndex === undefined ? r : { ...r, lineIndex };
};
const MSG = {
  draftNotFound: "ไม่พบรอบร่างนี้ของโต๊ะ (อาจถูกส่งครัว ทิ้ง หรือเป็นของโต๊ะอื่น)",
  reservationClosed: "การจองนี้ถูกยกเลิกหรือปิดไปแล้ว",
  reservationNoTable: "ระบุโต๊ะที่จะพาลูกค้านั่งก่อน",
  tableOccupied: "โต๊ะนี้มีลูกค้าอยู่ — ปิดบิลก่อนจึงนั่งจองได้", // POS P2.4 ▸ fix 2 F3 · จอใช้ pos.tables.errors.occupied ◂
} as const;

async function guard<T>(name: string, body: () => Promise<T>): Promise<T | RegisterRefusal> {
  try {
    return await body();
  } catch (e) {
    console.error(`[pos/table] ${name} INTERNAL`, e);
    return registerRefuse("INTERNAL");
  }
}

/** ขอบเขตของโหมดโต๊ะ: ด่านหน้าขาย (สิทธิ์ใดสิทธิ์หนึ่งใน perms) + คีย์ restaurant.* ของงาน (need) ที่สาขานี้ */
async function scope(db: Db, ctx: RegisterCtx, actor: RegisterActor, need: string | null, perms: readonly string[] = VIEW_PERMS): Promise<S | RegisterRefusal> {
  const sc = await registerScopeFor(ctx, actor, perms, db);
  if (!sc.ok) return sc;
  if (need && !evaluate(sc.actor, { module: "restaurant", action: need, unitId: sc.ctx.unitId })) return refuse("PERMISSION_DENIED");
  return { tenantId: sc.ctx.tenantId, systemId: sc.ctx.systemId, unitId: sc.ctx.unitId, actor: sc.actor, ctx: { ...sc.ctx, ...(isRecord(ctx) && typeof ctx.deviceId === "string" ? { deviceId: ctx.deviceId } : {}) } };
}

/** วันนี้ตามเวลาไทย [00:00, 24:00) เป็น UTC */
function bkkDay(now: Date): { dayStart: Date; dayEnd: Date } {
  const d = new Date(now.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
  const dayStart = new Date(new Date(`${d}T00:00:00Z`).getTime() - 7 * 3_600_000);
  return { dayStart, dayEnd: new Date(dayStart.getTime() + 86_400_000) };
}
const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

// ═══════════════════ R2 ผังโต๊ะ ═══════════════════

/**
 * ผังของสาขา (ภาพ 03): โซน · การ์ดโต๊ะทุกตัวที่ไม่เก็บถาวร (สถานะตามลำดับความสำคัญ · ยอดค้างจ่าย · ยังไม่ส่งครัว · พร้อมเสิร์ฟ · สมาชิก · ธงคำขอ ·
 * ต้องเก็บโต๊ะ · การจองที่กันโต๊ะอยู่) · summary {used total guests avgMinutes unpaidSatang} — สิทธิ์ pos.sale.create หรือ pos.sale.read
 */
export async function registerTables(ctx: RegisterCtx, actor: RegisterActor, client?: Db): Promise<RegisterTablesResult> {
  return guard("registerTables", async (): Promise<RegisterTablesResult> => {
    const db: Db = client ?? prisma;
    const s = await scope(db, ctx, actor, null);
    if (isRefusal(s)) return s;
    // POS HF-FU ▸ b (มติ 2): ทิ้งรอบร่างของ session ที่ไม่ OPEN แล้ว (หน้าเดิมปิด/รวมโต๊ะ) ก่อนอ่านผัง — ล้ม = WARN ผังยังอ่านได้ ◂
    try {
      await sweepOrphanTableDrafts(db, { tenantId: s.tenantId, systemId: s.systemId, unitId: s.unitId, limit: 50 });
    } catch (e) {
      console.warn("[pos/table] sweepOrphanTableDrafts ล้ม (ผังยังอ่านได้)", e);
    }
    const now = new Date();
    const rest = await restaurant();
    const fl = await rest.tableFloorForPos(db, {
      tenantId: s.tenantId,
      unitId: s.unitId,
      now,
      lateMinutes: RESERVATION_LATE_MINUTES,
      maxHoldMinutes: RESERVATION_HOLD_MAX_MINUTES,
      ...bkkDay(now),
    });
    // session OPEN ต่อโต๊ะ (เก่าสุดก่อน — ล็อกเปิดโต๊ะกันซ้ำแล้ว · ข้อมูลเก่าที่ซ้ำแสดงตัวแรก)
    const sessOf = new Map<string, (typeof fl.sessions)[number]>();
    for (const x of fl.sessions) if (!sessOf.has(x.tableId)) sessOf.set(x.tableId, x);
    const shown = [...sessOf.values()];
    const [drafts, members, pay, splits] = await Promise.all([
      tableDraftLineCounts(db, { tenantId: s.tenantId, systemId: s.systemId, unitId: s.unitId, sessionIds: shown.map((x) => x.id) }),
      registerMemberBriefs({ tenantId: s.tenantId, unitId: s.unitId, actor: s.actor }, shown.flatMap((x) => (x.memberId ? [x.memberId] : []))),
      posPaymentSettings({ tenantId: s.tenantId, systemId: s.systemId }, db),
      splitSummariesOf(db, { tenantId: s.tenantId, sessionIds: shown.map((x) => x.id) }), // POS P2.5 ▸ R10 การ์ด "แยกบิล 2/4" ◂
    ]);
    const posBp = pay.ok && pay.serviceCharge.enabled ? pay.serviceCharge.rateBp : 0;
    const nowMs = now.getTime();
    const tables: TableCard[] = fl.tables.map((t) => {
      const x = sessOf.get(t.id) ?? null;
      const res = fl.reservations.find((r) => r.tableId === t.id && reservationHolds(r.at.getTime(), r.holdFromMinutes, nowMs)) ?? null;
      const member: TableMemberBrief | null = x?.memberId ? (members.get(x.memberId) ?? { id: x.memberId, name: "", tier: null }) : null;
      const flags = x ? { callStaff: x.flags.callStaff, billRequested: x.flags.billRequested, payNotified: x.flags.payNotified } : { callStaff: false, billRequested: false, payNotified: false };
      return {
        id: t.id,
        name: t.name,
        zoneId: t.zoneId,
        seats: t.seats,
        state: tableStateOf({ inactive: t.status !== "ACTIVE", billRequested: !!x && (flags.billRequested || flags.payNotified), open: !!x, dirty: !!t.dirtySince, reserved: !!res }),
        sessionId: x?.id ?? null,
        guestCount: x?.guestCount ?? null,
        openedAt: iso(x?.openedAt),
        unpaidSatang: x?.unpaidSatang ?? 0,
        unsentCount: x ? (drafts.get(x.id) ?? 0) : 0,
        readyCount: x?.readyCount ?? 0,
        member,
        openedByStaff: !!x && x.openedByUserId !== null,
        flags,
        dirtySince: iso(t.dirtySince),
        reservation: res ? { id: res.id, name: res.name, partySize: res.partySize, at: res.at.toISOString(), holdFromMinutes: res.holdFromMinutes, phone: res.phone } : null,
        split: x && splits.get(x.id) ? { paidParts: splits.get(x.id)!.paidParts, partCount: splits.get(x.id)!.partCount } : null, // POS P2.5 ▸ R10 ◂
      };
    });
    const used = tables.filter((c) => c.sessionId);
    const minutes = used.map((c) => Math.max(0, (nowMs - Date.parse(c.openedAt!)) / 60_000));
    const zones: TableZone[] = fl.zones.map((z) => ({ id: z.id, name: z.name, sortOrder: z.sortOrder, tableCount: tables.filter((t) => t.zoneId === z.id).length }));
    return {
      ok: true,
      zones,
      tables,
      summary: {
        used: used.length,
        total: fl.tables.filter((t) => t.status === "ACTIVE").length,
        guests: used.reduce((t, c) => t + (c.guestCount ?? 0), 0),
        avgMinutes: minutes.length ? Math.floor(minutes.reduce((a, b) => a + b, 0) / minutes.length) : 0,
        unpaidSatang: tables.reduce((t, c) => t + c.unpaidSatang, 0),
      },
      reservationsToday: fl.reservationsToday,
      canCreateTables: evaluate(s.actor, { module: "restaurant", action: "restaurant.table.create", unitId: s.unitId }),
      serviceCharge: { posBp, restaurantBp: fl.restaurantServiceChargeBps, differs: posBp !== fl.restaurantServiceChargeBps },
      serverTime: now.toISOString(),
    };
  });
}

/** แท็บ "โต๊ะ" ของหน้าขาย (มติ Q5): แสดงเมื่อสาขามีโต๊ะที่ไม่เก็บถาวร ≥ 1 หรือผู้ใช้เพิ่มโต๊ะได้ (หน้าว่างพร้อมปุ่มตั้งค่า) — อ่านอย่างเดียว */
export async function registerTableMode(ctx: RegisterCtx, actor: RegisterActor, client?: Db): Promise<RegisterTableModeResult> {
  return guard("registerTableMode", async (): Promise<RegisterTableModeResult> => {
    const db: Db = client ?? prisma;
    const s = await scope(db, ctx, actor, null);
    if (isRefusal(s)) return s;
    const tableCount = await (await restaurant()).tableCountForPos(db, { tenantId: s.tenantId, unitId: s.unitId });
    const canCreateTables = evaluate(s.actor, { module: "restaurant", action: "restaurant.table.create", unitId: s.unitId });
    return { ok: true, visible: tableCount > 0 || canCreateTables, tableCount, canCreateTables };
  });
}

/** แผงโต๊ะ (ภาพ 03 ขวา): session · รอบที่ส่งแล้ว (ทุกรายการ + สถานะครัว + จ่ายแล้ว) · รอบร่าง · ยอดค้างจ่าย + แฮชชุดรายการ (= quote ของโต๊ะ) */
export async function registerTableDetail(ctx: RegisterCtx, actor: RegisterActor, input: { tableSessionId: string }, client?: Db): Promise<RegisterTableDetailResult> {
  return guard("registerTableDetail", async (): Promise<RegisterTableDetailResult> => {
    const db: Db = client ?? prisma;
    const s = await scope(db, ctx, actor, null);
    if (isRefusal(s)) return s;
    if (!isRecord(input) || !isId(input.tableSessionId)) return refuse("VALIDATION");
    const rest = await restaurant();
    const sess = await rest.tableSessionForPos(db, { tenantId: s.tenantId, unitId: s.unitId, sessionId: input.tableSessionId });
    if (!sess) return refuse("TABLE_NOT_FOUND");
    const [detail, unpaid, draft, members, splits] = await Promise.all([
      rest.tableDetailForPos(db, { tenantId: s.tenantId, unitId: s.unitId, sessionId: sess.id }),
      rest.tableUnpaidItemsForPos(db, { tenantId: s.tenantId, unitId: s.unitId, sessionId: sess.id }),
      tableDraftOf(db, { tenantId: s.tenantId, systemId: s.systemId, unitId: s.unitId, tableSessionId: sess.id }),
      registerMemberBriefs({ tenantId: s.tenantId, unitId: s.unitId, actor: s.actor }, sess.memberId ? [sess.memberId] : []),
      splitSummariesOf(db, { tenantId: s.tenantId, sessionIds: [sess.id] }), // POS P2.5 ▸ R10 ◂
    ]);
    const unpaidIds = unpaid.map((i) => i.id);
    return {
      ok: true,
      session: {
        id: sess.id,
        status: sess.status,
        tableId: sess.tableId,
        tableName: sess.tableName,
        guestCount: sess.guestCount,
        openedAt: sess.openedAt.toISOString(),
        openedByStaff: sess.openedByUserId !== null,
        openedByUserId: sess.openedByUserId,
        member: sess.memberId ? (members.get(sess.memberId) ?? { id: sess.memberId, name: "", tier: null }) : null,
      },
      rounds: detail.rounds.map((r) => ({
        orderId: r.orderId,
        dailyNo: r.dailyNo,
        createdAt: r.createdAt.toISOString(),
        byStaff: r.byStaff,
        items: r.items.map((i) => ({
          id: i.id,
          name: i.name,
          qty: i.qty,
          unitPriceSatang: i.unitPrice + i.optionsTotal,
          optionsSatang: i.optionsTotal,
          lineTotalSatang: i.lineTotal,
          options: i.options.map((o) => ({ choiceId: o.choiceId, groupName: o.groupName, name: o.name, priceDeltaSatang: o.priceDelta })),
          note: i.note,
          kdsStatus: i.kdsStatus,
          paid: i.paid,
          productId: i.productId,
        })),
      })),
      draft: draft && draft.status === "HELD" ? { heldCartId: draft.id, version: draft.version, lineCount: draft.lineCount, approxTotalSatang: draft.approxTotalSatang, cart: draft.cart, heldByUserId: draft.heldByUserId, createdAt: draft.createdAt.toISOString() } : null,
      unpaidSatang: unpaid.reduce((t, i) => t + i.lineTotal, 0),
      unpaidItemIds: unpaidIds,
      itemsHash: tableItemsHash(unpaidIds),
      split: splits.get(sess.id) ?? null, // POS P2.5 ▸ R10 แผนแยกบิลที่เปิดอยู่ (null = ไม่มี) ◂
    };
  });
}

// ═══════════════════ R3 เปิดโต๊ะ ═══════════════════

/**
 * เปิดโต๊ะ (restaurant.session.open): get-or-create ใต้ล็อกโต๊ะ (Q9 · 10 คำขอพร้อมกัน = session เดียว) · โต๊ะ INACTIVE = TABLE_INACTIVE ·
 * memberId ผ่านด่านสมาชิกของหน้าขาย · เปิดใหม่ล้าง "ต้องเก็บโต๊ะ" · โต๊ะที่มีการจองกันอยู่ = เปิดได้ + reservationOverridden (การจองยัง BOOKED)
 */
export async function registerOpenTable(
  ctx: RegisterCtx,
  actor: RegisterActor,
  input: { tableId: string; guestCount?: number | null; memberId?: string | null },
  client?: Db,
): Promise<{ ok: true; sessionId: string; created: boolean; reservationOverridden: boolean } | RegisterRefusal> {
  return guard("registerOpenTable", async () => {
    const db: Db = client ?? prisma;
    const s = await scope(db, ctx, actor, "restaurant.session.open");
    if (isRefusal(s)) return s;
    if (!isRecord(input) || !isId(input.tableId)) return refuse("VALIDATION");
    const g = input.guestCount;
    if (g !== undefined && g !== null && !(typeof g === "number" && Number.isInteger(g) && g >= 1 && g <= 999)) return refuse("VALIDATION", "จำนวนลูกค้าต้องเป็นจำนวนเต็ม 1–999");
    const memberId = input.memberId ?? null;
    if (memberId !== null) {
      if (!isId(memberId)) return refuse("VALIDATION");
      const gate = await registerMemberGate({ tenantId: s.tenantId, unitId: s.unitId, actor: s.actor }, memberId);
      if (isRefusal(gate)) return gate;
    }
    const rest = await restaurant();
    const tableId = input.tableId;
    const r = await db.$transaction(
      async (tx) => {
        const o = await rest.openTableSessionInTx(tx, { tenantId: s.tenantId, unitId: s.unitId, tableId, guestCount: g ?? null, openedByUserId: s.actor.userId, memberId });
        if (!o.ok) return o;
        let overridden = false;
        if (o.created) {
          const now = new Date();
          const rs = await rest.bookedReservationsOfTable(tx, { tenantId: s.tenantId, unitId: s.unitId, tableId, now, lateMinutes: RESERVATION_LATE_MINUTES, maxHoldMinutes: RESERVATION_HOLD_MAX_MINUTES });
          overridden = rs.some((x) => reservationHolds(x.at.getTime(), x.holdFromMinutes, now.getTime()));
        }
        return { ...o, overridden };
      },
      { maxWait: 10_000, timeout: 20_000 },
    );
    if (!r.ok) return refuse(r.code === "TABLE_INACTIVE" ? "TABLE_INACTIVE" : "TABLE_NOT_FOUND");
    return { ok: true as const, sessionId: r.sessionId, created: r.created, reservationOverridden: r.overridden };
  });
}

/** ผูก/ถอดสมาชิกของโต๊ะที่เปิดอยู่ (restaurant.session.linkMember · ด่านสมาชิกของหน้าขาย) — ส่วนลดระดับคิดตอนเช็คบิล */
export async function registerLinkTableMember(ctx: RegisterCtx, actor: RegisterActor, input: { tableSessionId: string; memberId: string | null }, client?: Db): Promise<{ ok: true } | RegisterRefusal> {
  return guard("registerLinkTableMember", async () => {
    const db: Db = client ?? prisma;
    const s = await scope(db, ctx, actor, "restaurant.session.linkMember");
    if (isRefusal(s)) return s;
    if (!isRecord(input) || !isId(input.tableSessionId) || (input.memberId !== null && !isId(input.memberId))) return refuse("VALIDATION");
    if (input.memberId) {
      const gate = await registerMemberGate({ tenantId: s.tenantId, unitId: s.unitId, actor: s.actor }, input.memberId);
      if (isRefusal(gate)) return gate;
    }
    const r = await (await restaurant()).setTableSessionMemberForPos(db, { tenantId: s.tenantId, unitId: s.unitId, sessionId: input.tableSessionId, memberId: input.memberId });
    if (!r.ok) return refuse(r.code === "NOT_OPEN" ? "TABLE_SESSION_CLOSED" : "TABLE_NOT_FOUND");
    return { ok: true as const };
  });
}

// ═══════════════════ R5 ส่งรอบร่างเข้าครัว ═══════════════════

/** POS P2.4 ▸ fix 2 F7: ธุรกรรมชน (deadlock 40P01 / Prisma P2034 write conflict) — ลองใหม่ 1 ครั้งแล้ว BUSY ◂ */
function isTxConflict(e: unknown): boolean {
  let cur: unknown = e;
  for (let d = 0; d < 5 && cur && typeof cur === "object"; d++) {
    const o = cur as { code?: unknown; originalCode?: unknown; kind?: unknown; message?: unknown; cause?: unknown; meta?: unknown };
    if (o.code === "P2034" || o.code === "40P01" || o.originalCode === "40P01" || o.kind === "TransactionWriteConflict") return true;
    if (typeof o.message === "string" && /deadlock detected/i.test(o.message)) return true;
    const meta = o.meta && typeof o.meta === "object" ? (o.meta as { driverAdapterError?: unknown; code?: unknown }) : null;
    if (meta?.code === "40P01") return true;
    cur = o.cause ?? meta?.driverAdapterError;
  }
  return false;
}

/** ปฏิเสธที่โยนจากในธุรกรรม (ให้ธุรกรรม rollback ทั้งก้อน) แล้วคืนเป็นค่า */
class TableTxRefusal extends Error {
  constructor(readonly refusal: RegisterRefusal | "RETRY") {
    super(typeof refusal === "string" ? refusal : refusal.code);
  }
}

/**
 * ส่งรอบร่างเข้าครัว (restaurant.order.create): ราคาด้วยตัวแก้ราคาของหน้าขายบนช่องทางของโต๊ะ (แช่แข็งตั้งแต่นี้ · CD3) → ธุรกรรมเดียว =
 * ยึดรอบร่าง HELD → RECALLED (ผู้ชนะคนเดียว · ส่งซ้ำ/ส่งพร้อมกัน = ALREADY_RECALLED) + createOrderInTx (DINE_IN CONFIRMED · KDS เดิม) ·
 * เมนูหมด/ปิดขาย/สต็อกเมนูไม่พอ = PRODUCT_UNAVAILABLE + lineIndex · ตัวเลือกผิด = OPTIONS_INVALID + lineIndex (ไม่เขียนอะไร · รอบร่างยัง HELD)
 */
export async function registerSendTableRound(
  ctx: RegisterCtx,
  actor: RegisterActor,
  input: { tableSessionId: string; heldCartId: string },
  client?: Db,
): Promise<{ ok: true; orderId: string; dailyNo: number; itemIds: string[] } | RegisterRefusal> {
  return guard("registerSendTableRound", async () => {
    const db: Db = client ?? prisma;
    const s = await scope(db, ctx, actor, "restaurant.order.create", ["pos.sale.create"]);
    if (isRefusal(s)) return s;
    if (!isRecord(input) || !isId(input.tableSessionId) || !isId(input.heldCartId)) return refuse("VALIDATION");
    const rest = await restaurant();
    const sess = await rest.tableSessionForPos(db, { tenantId: s.tenantId, unitId: s.unitId, sessionId: input.tableSessionId });
    if (!sess) return refuse("TABLE_NOT_FOUND");
    const key = { tenantId: s.tenantId, systemId: s.systemId, unitId: s.unitId, tableSessionId: sess.id };
    let conflicts = 0; // POS P2.4 ▸ fix 2 F7 ◂
    for (let attempt = 0; attempt < 3; attempt++) {
      const draft = await tableDraftOf(db, { ...key, heldCartId: input.heldCartId });
      if (!draft || draft.status === "DISCARDED") return refuse("NOT_FOUND", MSG.draftNotFound);
      if (draft.status === "RECALLED") return refuse("ALREADY_RECALLED");
      if (sess.status !== "OPEN") return refuse("TABLE_SESSION_CLOSED");
      const channelId = await registerTableChannelId(db, s.ctx, sess.openedByUserId === null);
      const priced = await registerPriceTableRound(s.ctx, s.actor, { cart: draft.cart, channelId }, db);
      if (isRefusal(priced)) return priced;
      const pids = [...new Set(priced.lines.flatMap((l) => (l.productId ? [l.productId] : [])))];
      const stationOf = new Map(
        pids.length ? (await db.posProduct.findMany({ where: { tenantId: s.tenantId, id: { in: pids } }, select: { id: true, stationId: true } })).map((p) => [p.id, p.stationId]) : [],
      );
      try {
        return await db.$transaction(
          async (tx: Prisma.TransactionClient) => {
            // POS P2.4 ▸ fix 2 F2: ถือ session (FOR SHARE · OPEN) ก่อนยึดรอบร่าง/เขียนออเดอร์ — ปิดโต๊ะ/จ่ายรายการสุดท้ายรอรอบนี้ ·
            //   ลำดับล็อกเดียวกับปิดโต๊ะ (session → รอบร่าง) ◂
            const lk = await rest.lockOpenSessionInTx(tx, { tenantId: s.tenantId, unitId: s.unitId, sessionId: sess.id });
            if (!lk.ok) throw new TableTxRefusal(lk.code === "NOT_OPEN" ? refuse("TABLE_SESSION_CLOSED") : refuse("TABLE_NOT_FOUND"));
            const c = await claimTableDraftInTx(tx, { ...key, heldCartId: draft.id, userId: s.actor.userId, expectVersion: draft.version });
            if (!c.ok) throw new TableTxRefusal(c.code === "VERSION_CHANGED" ? "RETRY" : c.code === "ALREADY_RECALLED" ? refuse("ALREADY_RECALLED") : refuse("NOT_FOUND", MSG.draftNotFound));
            try {
              const o = await rest.createOrderInTx(tx, {
                tenantId: s.tenantId,
                unitId: s.unitId,
                sessionId: sess.id,
                placedByUserId: s.actor.userId,
                lines: priced.lines.map((l) => ({
                  productId: l.productId,
                  name: l.name,
                  qty: l.qty,
                  choiceIds: l.choiceIds,
                  options: l.options.map((x) => ({ choiceId: x.choiceId, groupSnapshot: x.groupName, choiceSnapshot: x.name, priceDelta: x.priceDeltaSatang })),
                  note: l.note,
                  unitPrice: l.unitPrice,
                  optionsTotal: l.optionsTotal,
                  stationId: l.productId ? (stationOf.get(l.productId) ?? null) : null,
                })),
              });
              return { ok: true as const, orderId: o.id, dailyNo: o.dailyNo, itemIds: o.itemIds };
            } catch (e) {
              if (e instanceof rest.OrderInTxError) {
                const li = e.lineIndex ?? undefined;
                const code = e.err.code;
                throw new TableTxRefusal(
                  code === "ITEM_UNAVAILABLE" || code === "OUT_OF_STOCK" ? refuse("PRODUCT_UNAVAILABLE", undefined, li) : code === "BAD_OPTIONS" ? refuse("OPTIONS_INVALID", undefined, li) : refuse("VALIDATION", e.err.reason, li),
                );
              }
              throw e;
            }
          },
          { maxWait: 10_000, timeout: 20_000 },
        );
      } catch (e) {
        if (e instanceof TableTxRefusal) {
          if (e.refusal === "RETRY") continue; // ถูกพักซ้ำระหว่างคิดราคา — อ่านรอบร่างใหม่แล้วคิดใหม่
          return e.refusal;
        }
        // POS P2.4 ▸ fix 2 F7: deadlock/write conflict กับการปิดโต๊ะ → ลองใหม่ 1 ครั้ง แล้ว BUSY ◂
        if (isTxConflict(e)) {
          if (++conflicts > 1) return refuse("BUSY");
          attempt--;
          continue;
        }
        throw e;
      }
    }
    return refuse("BUSY");
  });
}

// ═══════════════════ R9 ปิดโต๊ะ · เก็บโต๊ะ · ยกเลิกรายการ ═══════════════════

/**
 * ปิดโต๊ะ (restaurant.session.close): มีรายการค้างจ่าย = TABLE_HAS_UNPAID · ไม่มีรายการ = CANCELLED · จ่ายครบ = CLOSED (+ ต้องเก็บโต๊ะ) ·
 * รอบร่าง HELD ของโต๊ะ = DISCARDED + audit pos.heldCart.discard (ธุรกรรมเดียวกัน · CONTROLLER-DECISION 8)
 */
export async function registerCloseTable(ctx: RegisterCtx, actor: RegisterActor, input: { tableSessionId: string }, client?: Db): Promise<{ ok: true; status: "CLOSED" | "CANCELLED" } | RegisterRefusal> {
  return guard("registerCloseTable", async () => {
    const db: Db = client ?? prisma;
    const s = await scope(db, ctx, actor, "restaurant.session.close");
    if (isRefusal(s)) return s;
    if (!isRecord(input) || !isId(input.tableSessionId)) return refuse("VALIDATION");
    const rest = await restaurant();
    const sessionId = input.tableSessionId;
    const once = () =>
      db.$transaction(
        async (tx) => {
          const c = await rest.closeTableSessionInTx(tx, { tenantId: s.tenantId, unitId: s.unitId, sessionId });
          if (!c.ok) return c;
          await discardTableDraftsInTx(tx, { tenantId: s.tenantId, systemId: s.systemId, unitId: s.unitId, tableSessionId: sessionId, actorUserId: s.actor.userId });
          return c;
        },
        { maxWait: 10_000, timeout: 20_000 },
      );
    // POS P2.4 ▸ fix 2 F7: deadlock/write conflict กับการส่งรอบ → ลองใหม่ 1 ครั้ง แล้ว BUSY ◂
    let r: Awaited<ReturnType<typeof once>>;
    try {
      r = await once();
    } catch (e) {
      if (!isTxConflict(e)) throw e;
      try {
        r = await once();
      } catch (e2) {
        if (isTxConflict(e2)) return refuse("BUSY");
        throw e2;
      }
    }
    if (!r.ok) return refuse(r.code === "HAS_UNPAID" ? "TABLE_HAS_UNPAID" : r.code === "NOT_OPEN" ? "TABLE_SESSION_CLOSED" : "TABLE_NOT_FOUND");
    return { ok: true as const, status: r.status };
  });
}

/** เก็บโต๊ะแล้ว (restaurant.table.setStatus): ล้าง "ต้องเก็บโต๊ะ" (dirtySince = null) — ทำซ้ำได้ */
export async function registerClearTable(ctx: RegisterCtx, actor: RegisterActor, input: { tableId: string }, client?: Db): Promise<{ ok: true } | RegisterRefusal> {
  return guard("registerClearTable", async () => {
    const db: Db = client ?? prisma;
    const s = await scope(db, ctx, actor, "restaurant.table.setStatus");
    if (isRefusal(s)) return s;
    if (!isRecord(input) || !isId(input.tableId)) return refuse("VALIDATION");
    const r = await (await restaurant()).clearTableForPos(db, { tenantId: s.tenantId, unitId: s.unitId, tableId: input.tableId });
    if (!r.ok) return refuse("TABLE_NOT_FOUND");
    return { ok: true as const };
  });
}

/** ยกเลิกรายการ (restaurant.order.cancelItem): กติกาเดิมของ cancelOrderItem (จ่ายแล้ว/เสิร์ฟแล้ว/ยกเลิกแล้ว = ปฏิเสธพร้อมเหตุผล · คืนสต็อกเมนูเมื่อยังไม่เริ่มทำ) */
export async function registerCancelTableItem(ctx: RegisterCtx, actor: RegisterActor, input: { itemId: string; reason: string }, client?: Db): Promise<{ ok: true } | RegisterRefusal> {
  return guard("registerCancelTableItem", async () => {
    const db: Db = client ?? prisma;
    const s = await scope(db, ctx, actor, "restaurant.order.cancelItem");
    if (isRefusal(s)) return s;
    if (!isRecord(input) || !isId(input.itemId)) return refuse("VALIDATION");
    const reason = typeof input.reason === "string" ? input.reason.trim() : "";
    if (!reason || reason.length > 200) return refuse("VALIDATION", "ระบุเหตุผลการยกเลิก (ไม่เกิน 200 ตัวอักษร)");
    const rest = await restaurant();
    const itemId = input.itemId;
    // POS P2.4 ▸ fix 2 F4c: ล็อกรายการ + saleId IS NULL ในธุรกรรมเดียว (เรียงคิวกับการยึดรายการตอนจ่าย) — จ่ายไปแล้ว = TABLE_ITEMS_CHANGED ◂
    // POS P2.5 ▸ R5 มติ 6: รายการในแผนแยกบิลที่เปิดอยู่ = TABLE_SPLIT_OPEN — ตรวจหลังล็อกแถวรายการในธุรกรรมเดียว (ย้อนทั้งก้อน รวมคืนสต็อกเมนู) ◂
    let r: Awaited<ReturnType<RestFacade["cancelTableItemInTx"]>>;
    try {
      r = await db.$transaction(
        async (tx) => {
          const c = await rest.cancelTableItemInTx(tx, { tenantId: s.tenantId, unitId: s.unitId, itemId, reason, byUserId: s.actor.userId });
          if (c.ok && (await itemInOpenSplit(tx, { tenantId: s.tenantId, itemId }))) throw new TableTxRefusal(refuse("TABLE_SPLIT_OPEN"));
          return c;
        },
        { maxWait: 10_000, timeout: 20_000 },
      );
    } catch (e) {
      if (e instanceof TableTxRefusal && e.refusal !== "RETRY") return e.refusal;
      throw e;
    }
    if (!r.ok) return r.code === "NOT_FOUND" ? refuse("TABLE_NOT_FOUND") : r.code === "PAID" ? refuse("TABLE_ITEMS_CHANGED") : refuse("VALIDATION", r.reason);
    return { ok: true as const };
  });
}

// ═══════════════════ R10 โต๊ะจองแบบย่อ (มติ Q2) ═══════════════════

/** จองโต๊ะ (restaurant.session.open · ไม่มีคีย์ใหม่): name 1–100 · phone ≤ 30 · partySize 1–200 · at = ISO · holdFromMinutes 0–240 (ปริยาย 15) · tableId ไม่บังคับ */
export async function registerCreateReservation(
  ctx: RegisterCtx,
  actor: RegisterActor,
  input: { tableId?: string | null; name: string; phone?: string | null; partySize: number; at: string; holdFromMinutes?: number | null },
  client?: Db,
): Promise<{ ok: true; id: string } | RegisterRefusal> {
  return guard("registerCreateReservation", async () => {
    const db: Db = client ?? prisma;
    const s = await scope(db, ctx, actor, "restaurant.session.open");
    if (isRefusal(s)) return s;
    if (!isRecord(input)) return refuse("VALIDATION");
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (!name || name.length > 100 || name.includes("\u0000")) return refuse("VALIDATION", "ระบุชื่อผู้จอง (ไม่เกิน 100 ตัวอักษร)");
    const phone = input.phone === undefined || input.phone === null ? null : typeof input.phone === "string" && input.phone.trim().length <= 30 ? input.phone.trim() || null : undefined;
    if (phone === undefined) return refuse("VALIDATION", "เบอร์โทรไม่ถูกต้อง");
    const ps = input.partySize;
    if (!(typeof ps === "number" && Number.isInteger(ps) && ps >= 1 && ps <= RESERVATION_PARTY_MAX)) return refuse("VALIDATION", `จำนวนคนต้องเป็นจำนวนเต็ม 1–${RESERVATION_PARTY_MAX}`);
    const at = typeof input.at === "string" && input.at.length <= 40 ? new Date(input.at) : null;
    if (!at || Number.isNaN(at.getTime())) return refuse("VALIDATION", "เวลาจองไม่ถูกต้อง");
    const h = input.holdFromMinutes;
    if (h !== undefined && h !== null && !(typeof h === "number" && Number.isInteger(h) && h >= 0 && h <= RESERVATION_HOLD_MAX_MINUTES)) return refuse("VALIDATION", `กันโต๊ะก่อนเวลาได้ 0–${RESERVATION_HOLD_MAX_MINUTES} นาที`);
    const tableId = input.tableId ?? null;
    if (tableId !== null && !isId(tableId)) return refuse("VALIDATION");
    const r = await (await restaurant()).createReservationForPos(db, {
      tenantId: s.tenantId,
      unitId: s.unitId,
      tableId,
      name,
      phone,
      partySize: ps,
      at,
      holdFromMinutes: h ?? RESERVATION_HOLD_DEFAULT_MINUTES,
      createdByUserId: s.actor.userId,
    });
    if (!r.ok) return refuse("TABLE_NOT_FOUND");
    return { ok: true as const, id: r.id };
  });
}

/** พาลูกค้าที่จองนั่ง (restaurant.session.open): เปิดโต๊ะผ่านทางเดียวกับ registerOpenTable (guestCount = จำนวนคนที่จอง) + การจอง SEATED — ธุรกรรมเดียว · นั่งแล้ว = ผลเดิม */
export async function registerSeatReservation(ctx: RegisterCtx, actor: RegisterActor, input: { reservationId: string; tableId?: string | null }, client?: Db): Promise<{ ok: true; sessionId: string } | RegisterRefusal> {
  return guard("registerSeatReservation", async () => {
    const db: Db = client ?? prisma;
    const s = await scope(db, ctx, actor, "restaurant.session.open");
    if (isRefusal(s)) return s;
    if (!isRecord(input) || !isId(input.reservationId) || (input.tableId !== undefined && input.tableId !== null && !isId(input.tableId))) return refuse("VALIDATION");
    const rest = await restaurant();
    const reservationId = input.reservationId;
    const wantTable = input.tableId ?? null;
    const r = await db.$transaction(
      async (tx): Promise<{ ok: true; sessionId: string } | RegisterRefusal> => {
        const row = await rest.reservationForPos(tx, { tenantId: s.tenantId, unitId: s.unitId, reservationId, forUpdate: true });
        if (!row) return refuse("TABLE_NOT_FOUND");
        if (row.status === "SEATED" && row.sessionId) return { ok: true, sessionId: row.sessionId };
        if (row.status !== "BOOKED") return refuse("VALIDATION", MSG.reservationClosed);
        const tableId = wantTable ?? row.tableId;
        if (!tableId) return refuse("VALIDATION", MSG.reservationNoTable);
        const o = await rest.openTableSessionInTx(tx, { tenantId: s.tenantId, unitId: s.unitId, tableId, guestCount: row.partySize, openedByUserId: s.actor.userId, memberId: null });
        if (!o.ok) return refuse(o.code === "TABLE_INACTIVE" ? "TABLE_INACTIVE" : "TABLE_NOT_FOUND");
        // POS P2.4 ▸ fix 2 F3: โต๊ะมีลูกค้าอยู่ (ไม่ได้เปิด session ใหม่) = ไม่นั่งรวมบิลของคนอื่น — ไม่เขียนอะไร ◂
        if (!o.created) return refuse("VALIDATION", MSG.tableOccupied);
        await rest.markReservationSeatedInTx(tx, { tenantId: s.tenantId, unitId: s.unitId, reservationId, sessionId: o.sessionId, tableId });
        return { ok: true, sessionId: o.sessionId };
      },
      { maxWait: 10_000, timeout: 20_000 },
    );
    return r;
  });
}

/** ยกเลิกการจอง (restaurant.session.open): BOOKED → CANCELLED · ยกเลิกแล้ว = ผลเดิม · นั่งแล้ว/ไม่มา = VALIDATION */
export async function registerCancelReservation(ctx: RegisterCtx, actor: RegisterActor, input: { reservationId: string }, client?: Db): Promise<{ ok: true } | RegisterRefusal> {
  return guard("registerCancelReservation", async () => {
    const db: Db = client ?? prisma;
    const s = await scope(db, ctx, actor, "restaurant.session.open");
    if (isRefusal(s)) return s;
    if (!isRecord(input) || !isId(input.reservationId)) return refuse("VALIDATION");
    const r = await (await restaurant()).cancelReservationForPos(db, { tenantId: s.tenantId, unitId: s.unitId, reservationId: input.reservationId });
    if (!r.ok) return r.code === "NOT_FOUND" ? refuse("TABLE_NOT_FOUND") : refuse("VALIDATION", MSG.reservationClosed);
    return { ok: true as const };
  });
}

// ═══════════════════ คำขอจากโต๊ะ (เรียกพนักงาน · ขอเช็คบิล · แจ้งจ่ายพร้อมเพย์) ═══════════════════

export type RegisterTableRequestItem = { id: string; type: "CALL_STAFF" | "REQUEST_BILL" | "PAY_PROMPTPAY"; status: "PENDING" | "ACKED"; sessionId: string; tableId: string; tableName: string; note: string | null; createdAt: string; ackedAt: string | null };
/** คำขอที่ยังไม่ปิดเรื่องของสาขา (แผง "แจ้งเตือนจากโต๊ะ") — สิทธิ์ pos.sale.create หรือ pos.sale.read */
export async function registerTableRequests(ctx: RegisterCtx, actor: RegisterActor, client?: Db): Promise<{ ok: true; requests: RegisterTableRequestItem[] } | RegisterRefusal> {
  return guard("registerTableRequests", async () => {
    const db: Db = client ?? prisma;
    const s = await scope(db, ctx, actor, null);
    if (isRefusal(s)) return s;
    const rows = await (await restaurant()).tableRequestsForPos(db, { tenantId: s.tenantId, unitId: s.unitId });
    return { ok: true as const, requests: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), ackedAt: iso(r.ackedAt) })) };
  });
}

async function setRequest(name: string, need: string, to: "ACKED" | "DONE", ctx: RegisterCtx, actor: RegisterActor, input: { requestId: string }, client?: Db): Promise<{ ok: true } | RegisterRefusal> {
  return guard(name, async () => {
    const db: Db = client ?? prisma;
    const s = await scope(db, ctx, actor, need);
    if (isRefusal(s)) return s;
    if (!isRecord(input) || !isId(input.requestId)) return refuse("VALIDATION");
    const r = await (await restaurant()).setTableRequestStatusForPos(db, { tenantId: s.tenantId, unitId: s.unitId, requestId: input.requestId, to, byUserId: s.actor.userId });
    if (!r.ok) return refuse("TABLE_NOT_FOUND");
    return { ok: true as const };
  });
}
/** รับทราบคำขอ (restaurant.request.ack) — ธงบนการ์ดยังอยู่จนปิดเรื่อง */
export async function registerAckTableRequest(ctx: RegisterCtx, actor: RegisterActor, input: { requestId: string }, client?: Db): Promise<{ ok: true } | RegisterRefusal> {
  return setRequest("registerAckTableRequest", "restaurant.request.ack", "ACKED", ctx, actor, input, client);
}
/** ปิดเรื่องคำขอ (restaurant.request.done) — ธงบนการ์ดหาย */
export async function registerDoneTableRequest(ctx: RegisterCtx, actor: RegisterActor, input: { requestId: string }, client?: Db): Promise<{ ok: true } | RegisterRefusal> {
  return setRequest("registerDoneTableRequest", "restaurant.request.done", "DONE", ctx, actor, input, client);
}

// ═══════════════════ R8 ตัวรับ void ของบิลโต๊ะ (CD5 · outbox-consumers "pos.sale.voided") ═══════════════════

/**
 * บิลที่ถูก void (ลิ้นชักบิล · คำขออนุมัติ · AI · ทางใดก็ได้) เป็นบิลโต๊ะ (sourceModule "POS" + sourceId = TableSession.id) ⇒ ปลดรายการที่ผูกบิล +
 * เปิดโต๊ะกลับเมื่อปลดได้และโต๊ะไม่มี session OPEN อื่น (ผ่าน facade ร้านอาหาร) · บิลของโมดูลอื่น (RESTAURANT ของ voidCheckout เดิม) = ไม่แตะ ·
 * เล่นซ้ำ = 0 แถว (CONTROLLER-DECISION 4) · คืน = จำนวนรายการที่ปลด
 */
export async function tableSaleVoided(evt: { tenantId: string; payload: unknown }): Promise<number> {
  const p = evt.payload as { saleId?: unknown } | null;
  const saleId = p && typeof p.saleId === "string" ? p.saleId : null;
  if (!saleId) return 0;
  const sale = await prisma.posSale.findFirst({ where: { id: saleId, tenantId: evt.tenantId }, select: { unitId: true, sourceModule: true, sourceId: true, status: true } });
  if (!sale || sale.sourceModule !== "POS" || !sale.sourceId || sale.status !== "VOIDED") return 0;
  const rest = await restaurant();
  // POS P2.5 ▸ R6 มติ 7: บิลของใบแยกบิล — ปลดทุกรายการที่ใบนี้ถือ (unlinkTableItemsInTx · ลำดับล็อก session → โต๊ะ → รายการ เดียวกับ unlinkTableSaleInTx) +
  //   ใบ OPEN (saleId/paidAt = null) + แผน DONE → OPEN เมื่อ session ไม่มีแผน OPEN อื่น (fix1 มติ 1) · ธุรกรรมเดียว · เล่นซ้ำ/ระบายซ้ำ = 0 แถว ·
  //   ไม่วนลองไม่จบ: ชนกัน (unique/deadlock/write conflict) ⇒ ลองอีกครั้งแบบไม่เปิดแผน ⇒ ยังชน = audit pos.table.split.voidConflict แล้วจบ (event DONE) ◂
  const part = await splitPartOfSale(prisma, { tenantId: evt.tenantId, saleId });
  if (part) {
    const NOOP = "pos-p25-split-void-noop";
    const once = (reopen: boolean) =>
      prisma.$transaction(async (tx) => {
        const u = await rest.unlinkTableItemsInTx(tx, { tenantId: evt.tenantId, unitId: sale.unitId, itemIds: part.itemIds });
        const r = await releaseSplitPartInTx(tx, { tenantId: evt.tenantId, partId: part.partId, splitId: part.splitId, saleId, reopen });
        if (!r.released) throw new Error(NOOP);
        return u.itemsReset + 1;
      });
    const conflict = (e: unknown) => isTxConflict(e) || (e as { code?: unknown } | null)?.code === "P2002";
    try {
      return await once(true);
    } catch (e) {
      if (e instanceof Error && e.message === NOOP) return 0;
      if (!conflict(e)) throw e;
      try {
        return await once(false);
      } catch (e2) {
        if (e2 instanceof Error && e2.message === NOOP) return 0;
        // POS P2.5 ▸ fix2 มติ 3 (F3): ยังชนแบบ deadlock/write conflict = โยนต่อให้คิวลองใหม่ (reopen=false ไม่มีทางชน unique ซ้ำ ⇒ ไม่วน) · audit + จบเฉพาะทางที่ไม่ใช่ชนกัน ◂
        if (isTxConflict(e2)) throw e2;
        if (!conflict(e2)) throw e2;
        await writeAudit({ tenantId: evt.tenantId, action: "pos.table.split.voidConflict", targetType: "PosTableSplitPart", targetId: part.partId, after: { saleId, splitId: part.splitId, error: String((e2 as Error)?.message ?? e2).slice(0, 200) } });
        return 0;
      }
    }
  }
  const sessionId = sale.sourceId;
  const r = await prisma.$transaction((tx) => rest.unlinkTableSaleInTx(tx, { tenantId: evt.tenantId, unitId: sale.unitId, sessionId, saleId }));
  return r.itemsReset;
}

// ═══════════════════ POS P2.5 ▸ ย้ายโต๊ะ · รวมโต๊ะ (R7 R8 · มติ 8 10 · มติ §11 ข้อ 2 5) ═══════════════════

const MOVE_CODE: Record<string, RegisterRefusalCode> = { NOT_FOUND: "TABLE_NOT_FOUND", NO_TABLE: "TABLE_NOT_FOUND", NOT_OPEN: "TABLE_SESSION_CLOSED", TABLE_INACTIVE: "TABLE_INACTIVE", TABLE_BUSY: "TABLE_BUSY" };

/**
 * ย้ายโต๊ะ (pos.sale.create|read + restaurant.session.move): session ทั้งก้อนไปโต๊ะว่าง — ล็อก session → ล็อกโต๊ะทั้งสอง (facade moveTableSessionInTx ·
 * ไม่ล็อกแถวรายการ) · โต๊ะเดิม "ต้องเก็บ" · โต๊ะใหม่สะอาด · รอบครัว/รอบร่าง/แผนแยกบิล/คำขอตาม session · บอร์ดครัวอ่านชื่อโต๊ะใหม่เอง (ใบครัวที่พิมพ์แล้วไม่พิมพ์ซ้ำ) ·
 * โต๊ะปลายทางมีการจองกันอยู่ = ย้ายได้ + reservationOverridden (การจองยัง BOOKED) · โต๊ะเดิม = {changed:false} ·
 * ปฏิเสธ (ไม่เขียน): TABLE_NOT_FOUND (session/โต๊ะของสาขาอื่น/ร้านอื่น/ไม่มีจริง) · TABLE_SESSION_CLOSED · TABLE_INACTIVE · TABLE_BUSY ("ใช้รวมโต๊ะแทน")
 */
export async function registerMoveTable(
  ctx: RegisterCtx,
  actor: RegisterActor,
  input: { tableSessionId: string; toTableId: string },
  client?: Db,
): Promise<{ ok: true; changed: boolean; reservationOverridden?: true } | RegisterRefusal> {
  return guard("registerMoveTable", async () => {
    const db: Db = client ?? prisma;
    const s = await scope(db, ctx, actor, "restaurant.session.move");
    if (isRefusal(s)) return s;
    if (!isRecord(input) || !isId(input.tableSessionId) || !isId(input.toTableId)) return refuse("VALIDATION");
    const rest = await restaurant();
    const sessionId = input.tableSessionId;
    const toTableId = input.toTableId;
    const once = () =>
      db.$transaction(
        async (tx) => {
          const m = await rest.moveTableSessionInTx(tx, { tenantId: s.tenantId, unitId: s.unitId, sessionId, toTableId });
          if (!m.ok || !m.changed) return { ...m, overridden: false };
          const now = new Date();
          const rs = await rest.bookedReservationsOfTable(tx, { tenantId: s.tenantId, unitId: s.unitId, tableId: m.toTableId, now, lateMinutes: RESERVATION_LATE_MINUTES, maxHoldMinutes: RESERVATION_HOLD_MAX_MINUTES });
          return { ...m, overridden: rs.some((x) => reservationHolds(x.at.getTime(), x.holdFromMinutes, now.getTime())) };
        },
        { maxWait: 10_000, timeout: 20_000 },
      );
    let r: Awaited<ReturnType<typeof once>>;
    try {
      r = await once();
    } catch (e) {
      if (!isTxConflict(e)) throw e;
      try {
        r = await once();
      } catch (e2) {
        if (isTxConflict(e2)) return refuse("BUSY");
        throw e2;
      }
    }
    if (!r.ok) return refuse(MOVE_CODE[r.code] ?? "TABLE_NOT_FOUND");
    if (r.changed) {
      await writeAudit({ tenantId: s.tenantId, actorId: s.actor.userId, action: "pos.table.move", targetType: "TableSession", targetId: sessionId, after: { sessionId, fromTableId: r.fromTableId, toTableId: r.toTableId, reservationOverridden: r.overridden } });
    }
    return { ok: true as const, changed: r.changed, ...(r.overridden ? { reservationOverridden: true as const } : {}) };
  });
}

const MERGE_MAX_FROMS = 5;
/**
 * รวมโต๊ะ (pos.sale.create|read + restaurant.session.merge): from 1–5 session (ไม่ซ้ำ · ไม่ใช่ปลายทาง) เข้า intoSessionId — ล็อก session ทุกตัว (เรียง id) →
 * ล็อกโต๊ะทุกตัว (facade mergeTableSessionsInTx · ไม่ล็อกแถวรายการ) → ตัวกันของ POS: แผนแยกบิล OPEN ที่ใดก็ตาม = TABLE_SPLIT_OPEN · รอบร่าง HELD
 * ปลายทาง+ต้นทาง หรือต้นทาง ≥ 2 ที่ = TABLE_HAS_DRAFT (ส่งครัว/ทิ้งก่อน) → ออเดอร์+คำขอย้าย · guestCount รวม · สมาชิก = ปลายทาง ?? ต้นทางแรกที่มี ·
 * ต้นทาง MERGED + โต๊ะต้นทาง "ต้องเก็บ" · รอบร่างเดียวของต้นทางผูกปลายทาง (ธุรกรรมเดียว) · เล่นซ้ำ = {changed:false} · บิลบางส่วนเดิมของต้นทางยัง void ได้
 */
export async function registerMergeTables(ctx: RegisterCtx, actor: RegisterActor, input: { intoSessionId: string; fromSessionIds: string[] }, client?: Db): Promise<{ ok: true; changed: boolean } | RegisterRefusal> {
  return guard("registerMergeTables", async () => {
    const db: Db = client ?? prisma;
    const s = await scope(db, ctx, actor, "restaurant.session.merge");
    if (isRefusal(s)) return s;
    if (!isRecord(input) || !isId(input.intoSessionId) || !Array.isArray(input.fromSessionIds)) return refuse("VALIDATION");
    const into = input.intoSessionId;
    const froms = input.fromSessionIds as unknown[];
    if (froms.length < 1 || froms.length > MERGE_MAX_FROMS || !froms.every(isId) || new Set(froms).size !== froms.length || froms.includes(into)) {
      return refuse("VALIDATION", `เลือกโต๊ะที่จะรวม 1–${MERGE_MAX_FROMS} โต๊ะ (ไม่ซ้ำ และไม่ใช่โต๊ะปลายทาง)`);
    }
    const fromIds = froms as string[];
    const rest = await restaurant();
    const key = { tenantId: s.tenantId, systemId: s.systemId, unitId: s.unitId };
    const once = () =>
      db.$transaction(
        async (tx) => {
          const m = await rest.mergeTableSessionsInTx<"TABLE_SPLIT_OPEN" | "TABLE_HAS_DRAFT">(tx, {
            tenantId: s.tenantId,
            unitId: s.unitId,
            intoSessionId: into,
            fromSessionIds: fromIds,
            guard: async (rows) => {
              const ids = rows.map((r) => r.id);
              if ((await openSplitSessions(tx, { tenantId: s.tenantId, sessionIds: ids })).size) return "TABLE_SPLIT_OPEN";
              const drafts = await heldTableDraftSessions(tx, { ...key, sessionIds: ids });
              const fromDrafts = fromIds.filter((id) => drafts.has(id)).length;
              return (drafts.has(into) && fromDrafts >= 1) || fromDrafts >= 2 ? "TABLE_HAS_DRAFT" : null;
            },
          });
          if (m.ok && m.changed) {
            await repointTableDraftsInTx(tx, { ...key, fromSessionIds: fromIds, toSessionId: into });
            await repointSplitPlansInTx(tx, { tenantId: s.tenantId, unitId: s.unitId, fromSessionIds: fromIds, toSessionId: into }); // POS P2.5 ▸ fix1 มติ 6 (N4) ◂
          }
          return m;
        },
        { maxWait: 10_000, timeout: 20_000 },
      );
    let r: Awaited<ReturnType<typeof once>>;
    try {
      r = await once();
    } catch (e) {
      if (!isTxConflict(e)) throw e;
      try {
        r = await once();
      } catch (e2) {
        if (isTxConflict(e2)) return refuse("BUSY");
        throw e2;
      }
    }
    if (!r.ok) return refuse(r.code === "NOT_FOUND" ? "TABLE_NOT_FOUND" : r.code === "NOT_OPEN" ? "TABLE_SESSION_CLOSED" : r.code);
    if (r.changed) await writeAudit({ tenantId: s.tenantId, actorId: s.actor.userId, action: "pos.table.merge", targetType: "TableSession", targetId: into, after: { intoSessionId: into, fromSessionIds: fromIds, fromTableIds: r.fromTableIds } });
    return { ok: true as const, changed: r.changed };
  });
}

// ═══════════════════ POS P2.5 ▸ ใบรายการ (pre-bill · R9 · มติ 9 · CD9 · มติ §11 ข้อ 4) ═══════════════════

/**
 * ใบรายการของโต๊ะ (tableSessionId) หรือของใบแยกบิล (tableSplitPartId) — pos.sale.create หรือ pos.sale.read (มติ 10) · ยอด = quote ของโต๊ะ/ใบ ทุกสตางค์
 * (ทางคิดเงินเดียวกัน registerTableBillPreview) · ไม่มีเลขเอกสาร/เลขภาษี/เลขใบเสร็จ · ไม่เปลี่ยนสถานะ (ไม่ขอเช็คบิล · ไม่ลงบัญชี · ไม่ปล่อย outbox) ·
 * audit pos.table.preBill 1 แถวต่อครั้ง (ร่องรอยกันโกง "ใบรายการพิมพ์ยอด X") · พิมพ์ที่เครื่อง (pre-bill-render.ts · เครื่องพิมพ์ใบเสร็จของเครื่อง)
 */
export async function registerTablePreBill(
  ctx: RegisterCtx,
  actor: RegisterActor,
  input: ({ tableSessionId: string } | { tableSplitPartId: string }) & { locale?: "th" | "en" | null; copy?: boolean | null },
  client?: Db,
): Promise<{ ok: true; payload: PreBillPayload } | RegisterRefusal> {
  return guard("registerTablePreBill", async () => {
    const db: Db = client ?? prisma;
    const s = await scope(db, ctx, actor, null);
    if (isRefusal(s)) return s;
    if (!isRecord(input)) return refuse("VALIDATION");
    const raw = input as Record<string, unknown>;
    const sid = isId(raw.tableSessionId) ? raw.tableSessionId : null;
    const pid = isId(raw.tableSplitPartId) ? raw.tableSplitPartId : null;
    if ((sid === null) === (pid === null)) return refuse("VALIDATION");
    if (raw.locale !== undefined && raw.locale !== null && raw.locale !== "th" && raw.locale !== "en") return refuse("VALIDATION");
    if (raw.copy !== undefined && raw.copy !== null && typeof raw.copy !== "boolean") return refuse("VALIDATION");
    const pv = await registerTableBillPreview(s.ctx, s.actor, sid ? { tableSessionId: sid } : { tableSplitPartId: pid }, VIEW_PERMS, db);
    if (isRefusal(pv)) return pv;
    const rest = await restaurant();
    const [sess, posSys, unit, tenant, staff, members] = await Promise.all([
      rest.tableSessionForPos(db, { tenantId: s.tenantId, unitId: s.unitId, sessionId: pv.sessionId }),
      db.appSystem.findFirst({ where: { id: s.systemId, tenantId: s.tenantId, type: "POS" }, select: { settings: true } }),
      db.businessUnit.findFirst({ where: { id: s.unitId, tenantId: s.tenantId }, select: { name: true } }),
      db.tenant.findUnique({ where: { id: s.tenantId }, select: { name: true } }),
      db.user.findUnique({ where: { id: s.actor.userId }, select: { name: true } }),
      registerMemberBriefs({ tenantId: s.tenantId, unitId: s.unitId, actor: s.actor }, pv.memberId ? [pv.memberId] : []),
    ]);
    if (!sess) return refuse("TABLE_NOT_FOUND");
    const header = posSys ? receiptSettingsOf(posSys.settings).header.name : null;
    const q = pv.quote;
    const payload: PreBillPayload = {
      kind: "PRE_BILL",
      shop: { name: (header && header.trim()) || (tenant?.name ?? "").trim() || (unit?.name ?? "-"), branch: unit?.name ?? "" },
      tableName: pv.tableName,
      guestCount: sess.guestCount,
      openedAt: sess.openedAt.toISOString(),
      printedAt: new Date().toISOString(),
      staffName: staff?.name ?? null,
      part: pv.part ? { no: pv.part.no, of: pv.part.of } : null,
      member: pv.memberId ? { name: members.get(pv.memberId)?.name ?? "" } : null,
      lines: pv.lines.map((l) => ({ qty: l.qty, name: l.name, options: [...l.options], amountSatang: l.amountSatang })),
      subtotalSatang: q.subtotalSatang,
      discountSatang: q.subtotalSatang - q.netSatang,
      serviceCharge: { rateBp: pv.serviceChargeBp, satang: q.serviceChargeSatang },
      vatIncludedSatang: q.vatSatang,
      totalSatang: q.grandTotalSatang,
      itemsHash: pv.itemsHash,
      notReceipt: true,
      copy: raw.copy === true,
      locale: raw.locale === "en" ? "en" : "th",
    };
    await writeAudit({
      tenantId: s.tenantId,
      actorId: s.actor.userId,
      action: "pos.table.preBill",
      targetType: "TableSession",
      targetId: pv.sessionId,
      after: { sessionId: pv.sessionId, ...(pv.part ? { partId: pv.part.id } : {}), totalSatang: q.grandTotalSatang, itemsHash: pv.itemsHash, copy: payload.copy },
    });
    return { ok: true as const, payload };
  });
}
// ◂ POS P2.5
