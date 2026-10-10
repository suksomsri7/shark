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
import { claimTableDraftInTx, discardTableDraftsInTx, tableDraftLineCounts, tableDraftOf } from "./held-cart";
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
    const [drafts, members, pay] = await Promise.all([
      tableDraftLineCounts(db, { tenantId: s.tenantId, systemId: s.systemId, unitId: s.unitId, sessionIds: shown.map((x) => x.id) }),
      registerMemberBriefs({ tenantId: s.tenantId, unitId: s.unitId, actor: s.actor }, shown.flatMap((x) => (x.memberId ? [x.memberId] : []))),
      posPaymentSettings({ tenantId: s.tenantId, systemId: s.systemId }, db),
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
    const [detail, unpaid, draft, members] = await Promise.all([
      rest.tableDetailForPos(db, { tenantId: s.tenantId, unitId: s.unitId, sessionId: sess.id }),
      rest.tableUnpaidItemsForPos(db, { tenantId: s.tenantId, unitId: s.unitId, sessionId: sess.id }),
      tableDraftOf(db, { tenantId: s.tenantId, systemId: s.systemId, unitId: s.unitId, tableSessionId: sess.id }),
      registerMemberBriefs({ tenantId: s.tenantId, unitId: s.unitId, actor: s.actor }, sess.memberId ? [sess.memberId] : []),
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
    const r = await db.$transaction(
      async (tx) => {
        const c = await rest.closeTableSessionInTx(tx, { tenantId: s.tenantId, unitId: s.unitId, sessionId });
        if (!c.ok) return c;
        await discardTableDraftsInTx(tx, { tenantId: s.tenantId, systemId: s.systemId, unitId: s.unitId, tableSessionId: sessionId, actorUserId: s.actor.userId });
        return c;
      },
      { maxWait: 10_000, timeout: 20_000 },
    );
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
    if (!(await rest.tableItemExistsForPos(db, { tenantId: s.tenantId, unitId: s.unitId, itemId: input.itemId }))) return refuse("TABLE_NOT_FOUND");
    const r = await rest.cancelOrderItem(s.tenantId, s.unitId, input.itemId, reason, s.actor.userId);
    if (!r.ok) return refuse("VALIDATION", r.reason);
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
  const sessionId = sale.sourceId;
  const r = await prisma.$transaction((tx) => rest.unlinkTableSaleInTx(tx, { tenantId: evt.tenantId, unitId: sale.unitId, sessionId, saleId }));
  return r.itemsReset;
}
