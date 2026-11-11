// kds.ts — จอครัว (KDS) ฝั่งเซิร์ฟเวอร์ · POS P2.6 S (R1–R16 · มติผู้คุมงาน §9 1–16 · §10 CD 1–21 · names table แถว 7–10 17–19)
// สัญญา = scripts/qc-pos-p2.6.mts · โน้ต ledger/wo-notes/pos-P2.6.md (สัญญาข้อมูลของ P2.6U = ชนิดใน kds-shared.ts)
//
// 🔴 ตั๋วครัว = (RestaurantOrder, สถานี) — แถวร้านอาหารเขียนโดย restaurant/* เท่านั้น: ไฟล์นี้เรียกผ่าน `import("@/lib/modules/restaurant")` (lazy · วงโหลด
//    restaurant → pos) · ไม่เขียนตาราง Restaurant*/KdsStation/RestaurantSetting เอง · ตัวนับเมนู = catalog-legacy (F15.1) · ไม่มีจุดเรียกขาย
// 🔴 ฟังก์ชันผู้ใช้ (ctx: RegisterCtx, actor: RegisterActor, input) "คืน" {ok:true,…} | {ok:false, code, message ไทย} ไม่ throw ·
//    รอบ/รายการ/สถานีของร้านอื่น/สาขาอื่น/มั่ว = TICKET_NOT_FOUND (404-not-403 · ไม่เขียนอะไร) · สาขาที่เข้าไม่ได้ = PERMISSION_DENIED
// 🔴 ฟังก์ชันระบบ (tenantId, unitId, …): ticketForSale (หลัง commit ของบิลหน้าขาย · ไม่ปฏิเสธบิลที่จ่ายแล้ว · idempotent) · healMissingTickets ·
//    kitchenBacklog · ตัวรับคิว (void/ยกเลิกออเดอร์/86) · roundForOrderInTx (ในธุรกรรมรับออเดอร์ของ order.ts)
// 🔴 ทำอาหาร ≠ เก็บเงิน (CD4): ไม่ล็อกรายการที่ชำระแล้ว · ไม่มีราคาบนตั๋ว/ใบครัว · HF-TX: ไม่มี createSale ในไฟล์นี้

import type { PosOrder, Prisma, PrismaClient } from "@prisma/client";
import { evaluate } from "@/lib/core/rbac";
import { writeAudit } from "@/lib/core/audit";
import { prisma } from "./db";
import { registerScopeFor } from "./register";
import { consumeMenuStockFloorInTx, restoreMenuStockFloorInTx } from "./catalog-legacy";
import { ORDER_ADAPTERS } from "./order-adapters";
import {
  KDS_AUTO_ACCEPT_MAX,
  KDS_CANCEL_REASON_ORDER,
  KDS_CANCEL_REASON_SALE,
  KDS_EXPO,
  KDS_HEAL_MAX,
  KDS_HEAL_WINDOW_MS,
  KDS_PENDING_TOP,
  avgReadyMinutes,
  sortColumn,
  ticketSourceOf,
  ticketStateOf,
  ticketTargetMinutes,
  ticketTimer,
  type HealResult,
  type KdsActionResult,
  type KdsAutoAcceptResult,
  type KdsBoardResult,
  type KdsEightySix,
  type KdsLine,
  type KdsRefusal,
  type KdsRefusalCode,
  type KdsRushResult,
  type KdsSource,
  type KdsTicket,
  type KdsTicketState,
  type KitchenBacklogRow,
  type KitchenProgressResult,
  type KitchenSlip,
  type KitchenSlipResult,
  type TicketForSaleResult,
  type KdsKitchenProduct, // P2.6U ▸ fix1 F1 ◂
  type KdsKitchenProductsResult, // P2.6U ▸ fix1 F1 ◂
  type KdsStationsResult, // P2.6U ▸ fix1 F3 ◂
  type KdsKitchenPauseResult, // POS P5.2 ▸ D11 ◂
  KDS_PAUSE_NOTE_MAX, // POS P5.2 ▸ D11 ◂
} from "./kds-shared";
import type { RegisterActor, RegisterCtx } from "./register-shared";

type Db = PrismaClient | Prisma.TransactionClient;
type Tx = Prisma.TransactionClient;
type RestFacade = typeof import("@/lib/modules/restaurant");
type RoundRow = NonNullable<Awaited<ReturnType<RestFacade["kitchenRoundForPos"]>>>;
type ItemRow = RoundRow["items"][number];
const restaurant = (): Promise<RestFacade> => import("@/lib/modules/restaurant");

// ═══════════ คำปฏิเสธ · ขอบเขต (R15 R16 · มติ 7) ═══════════
const MSG: Record<KdsRefusalCode, string> = {
  TICKET_NOT_FOUND: "ไม่พบตั๋วครัวนี้ในสาขานี้",
  TICKET_TOO_OLD: "ตั๋วนี้เป็นของวันก่อน — ดึงกลับมาแก้ไม่ได้",
  KDS_STATION_NOT_FOUND: "ไม่พบสถานีครัวนี้ในสาขานี้",
  TICKET_VOIDED: "บิลนี้ถูกยกเลิก/คืนเงินแล้ว — ดึงกลับมาทำไม่ได้", // P2.6U มติ 18 (R3 H4): คืนเงินเต็มก็ใช้รหัสนี้
  VALIDATION: "ข้อมูลที่ส่งมาไม่ถูกต้อง — ยังไม่ได้บันทึกอะไร",
  PERMISSION_DENIED: "บัญชีนี้ยังไม่มีสิทธิ์ทำรายการนี้ที่จอครัว — ขอสิทธิ์จากเจ้าของร้าน",
  PRODUCT_NOT_FOUND: "ไม่พบสินค้านี้ในสาขานี้",
  PRODUCT_UNAVAILABLE: "สินค้านี้หมดอยู่ที่สาขานี้",
  CHANNEL_PAUSED: "ครัวหยุดรับออเดอร์ชั่วคราว",
  INTERNAL: "จอครัวขัดข้องชั่วคราว — ลองอีกครั้ง",
};
const refuse = (code: KdsRefusalCode, message?: string): KdsRefusal => ({ ok: false, code, message: message ?? MSG[code] });
const isRefusal = (v: unknown): v is KdsRefusal => !!v && typeof v === "object" && (v as { ok?: unknown }).ok === false;
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 200 && !v.includes("\u0000");
const bizToday = (): string => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);
const THAI = /[ก-๛]/;

async function guard<T>(name: string, body: () => Promise<T>): Promise<T | KdsRefusal> {
  try {
    return await body();
  } catch (e) {
    console.error(`[pos/kds] ${name} INTERNAL`, e);
    return refuse("INTERNAL");
  }
}

type Need = "read" | "advance" | "recall" | "rush" | "pause" | "availability" | "stations"; // P2.6U ▸ fix1 F1/F3: + availability · stations ◂
/** สิทธิ์ต่องาน (R15 · ไม่มีคีย์ใหม่): อ่าน = restaurant.kds.advance หรือ pos.sale.read|create · เดิน = advance · ดึงกลับ = recall · เร่ง = rush · พัก/เพดาน = pause */
const NEED: Record<Need, readonly (readonly [string, string])[]> = {
  read: [["restaurant", "restaurant.kds.advance"], ["pos", "pos.sale.read"], ["pos", "pos.sale.create"]],
  advance: [["restaurant", "restaurant.kds.advance"]],
  recall: [["restaurant", "restaurant.kds.recall"]],
  rush: [["restaurant", "restaurant.order.rush"]],
  pause: [["restaurant", "restaurant.kitchen.pause"]],
  // P2.6U ▸ fix1 F1: แผ่น 86 = สิทธิ์เดียวกับผู้เขียน 86 (มติ 7 · catalog.setAvailability) · F3: รายชื่อสถานี = อ่านบอร์ด | จัดการสินค้า ◂
  availability: [["pos", "pos.sale.create"], ["restaurant", "restaurant.kds.advance"], ["pos", "pos.product.manage"]],
  stations: [["restaurant", "restaurant.kds.advance"], ["pos", "pos.sale.read"], ["pos", "pos.sale.create"], ["pos", "pos.product.manage"]],
};
type S = { tenantId: string; systemId: string; unitId: string; actor: RegisterActor };
/** ด่านเดียวกับหน้าขาย (ร้าน · ระบบ POS · สาขาผูกระบบ · เข้าสาขาได้) + คีย์ของงานที่สาขานี้ (โมดูลของคีย์ตรงตัว) · ไม่ผ่าน = PERMISSION_DENIED */
async function kscope(ctx: RegisterCtx, actor: RegisterActor, need: Need): Promise<S | KdsRefusal> {
  const keys = NEED[need];
  const sc = await registerScopeFor(ctx, actor, keys.map(([, k]) => k), prisma);
  if (!sc.ok) return refuse("PERMISSION_DENIED");
  const unitId = sc.ctx.unitId;
  if (!keys.some(([module, action]) => evaluate(sc.actor, { module, action, unitId }))) return refuse("PERMISSION_DENIED");
  return { tenantId: sc.ctx.tenantId, systemId: sc.ctx.systemId, unitId, actor: sc.actor };
}

// ═══════════ ตัวช่วยตั๋ว ═══════════
const BOARD_ROUND = (st: string) => st === "CONFIRMED" || st === "COMPLETED";
const live = (items: ItemRow[]) => items.filter((i) => i.kdsStatus !== "CANCELLED");
const isDone = (st: string) => st === "READY" || st === "SERVED";

/** รอบของสาขานี้ที่อยู่ในคิวครัว + รายการที่สถานีนั้น (ไม่มี = TICKET_NOT_FOUND) */
async function ticketOf(R: RestFacade, s: S, orderId: unknown, stationId: unknown): Promise<{ round: RoundRow; items: ItemRow[] } | KdsRefusal> {
  if (!isId(orderId) || (stationId !== undefined && !isId(stationId))) return refuse("TICKET_NOT_FOUND");
  const round = await R.kitchenRoundForPos(prisma, { tenantId: s.tenantId, unitId: s.unitId, orderId });
  if (!round || !(BOARD_ROUND(round.status) || round.status === "CANCELLED")) return refuse("TICKET_NOT_FOUND");
  const items = stationId === undefined ? round.items : round.items.filter((i) => i.stationId === stationId);
  if (!items.length) return refuse("TICKET_NOT_FOUND");
  return { round, items };
}

/** ชื่อพนักงาน (User.name) ของรอบ */
async function staffNames(ids: (string | null)[]): Promise<Map<string, string>> {
  const want = [...new Set(ids.filter((x): x is string => !!x))];
  if (!want.length) return new Map();
  const rows = await prisma.user.findMany({ where: { id: { in: want } }, select: { id: true, name: true } });
  return new Map(rows.map((u) => [u.id, u.name ?? ""]));
}

/** ป้ายของตั๋วบนจอ: โต๊ะ/QR = ชื่อโต๊ะ · ออนไลน์ = ช่องทาง · เลขอ้างอิง · หน้าขาย/หน้าเดิม = ชื่อลูกค้าถ้ามี (จอประกอบ "ซื้อกลับ · คิว N" เอง) */
function labelOf(r: RoundRow, source: KdsSource): string {
  if (source === "TABLE" || source === "QR") return r.session?.table?.name ?? "";
  if (source === "ONLINE") return [r.channelName ?? r.channelCode, r.externalRef].filter(Boolean).join(" · ");
  return r.guestName ?? "";
}

type TicketBuild = { pub: KdsTicket; state: KdsTicketState; stationId: string; no: number; label: string; source: KdsSource; key: string; sentAtMs: number; readyAtMs: number | null; servedAtMs: number | null; pendingItems: ItemRow[] };
/** ตั๋วทุกใบของรอบ (ต่อสถานี) ตามกติกา R5 R7 R8 — ไม่มีรายการที่ยังมีผล = ไม่มีตั๋ว */
function ticketsOfRound(r: RoundRow, criticalMins: number, nowMs: number, staff: Map<string, string>): TicketBuild[] {
  const byStation = new Map<string, ItemRow[]>();
  for (const it of r.items) byStation.set(it.stationId, [...(byStation.get(it.stationId) ?? []), it]);
  const source = ticketSourceOf(r);
  const label = labelOf(r, source);
  const out: TicketBuild[] = [];
  for (const [stationId, items] of byStation) {
    const state = ticketStateOf(items.map((i) => i.kdsStatus));
    if (!state) continue;
    const lv = live(items);
    const targetMinutes = ticketTargetMinutes({ roundTargetMinutes: r.targetMinutes, prepMinutes: lv.map((i) => i.menuItem?.prepMinutes ?? null), criticalMins });
    const sentAtMs = r.createdAt.getTime();
    const t = ticketTimer({ sentAtMs, targetMinutes, nowMs });
    const readyAtMs = lv.every((i) => i.readyAt) ? Math.max(...lv.map((i) => (i.readyAt as Date).getTime())) : null;
    const servedAtMs = lv.every((i) => i.servedAt) ? Math.max(...lv.map((i) => (i.servedAt as Date).getTime())) : null;
    const lines: KdsLine[] = items.map((i) => ({
      itemId: i.id,
      qty: i.qty,
      name: i.nameSnapshot,
      options: i.options.map((o) => o.choiceSnapshot),
      note: i.note,
      done: isDone(i.kdsStatus),
      cancelled: i.kdsStatus === "CANCELLED",
    }));
    const pub: KdsTicket = {
      orderId: r.id,
      stationId,
      no: r.dailyNo,
      source,
      label,
      channelCode: r.channelCode,
      externalRef: r.externalRef,
      isRush: r.isRush,
      state,
      sentAt: r.createdAt.toISOString(),
      elapsedSec: t.elapsedSec,
      targetMinutes,
      remainingSec: t.remainingSec,
      late: t.late,
      warn: t.warn,
      lines,
      doneCount: lv.filter((i) => isDone(i.kdsStatus)).length,
      lineCount: lv.length,
      staffName: r.placedByUserId ? (staff.get(r.placedByUserId) ?? null) : null,
      queueNo: source === "REGISTER" ? r.dailyNo : null,
      readyAt: readyAtMs === null ? null : new Date(readyAtMs).toISOString(),
    };
    out.push({ pub, state, stationId, no: r.dailyNo, label, source, key: `${r.id}|${stationId}`, sentAtMs, readyAtMs, servedAtMs, pendingItems: lv.filter((i) => i.kdsStatus === "NEW" || i.kdsStatus === "COOKING") });
  }
  return out;
}
const COLS: KdsTicketState[] = ["NEW", "COOKING", "READY"];
/** ลำดับบนจอ = คอลัมน์ใหม่ → กำลังทำ → พร้อม · ภายในคอลัมน์ตาม sortColumn (id = รอบ|สถานี) */
function ordered(tickets: TicketBuild[]): KdsTicket[] {
  return COLS.flatMap((col) => {
    const inCol = tickets.filter((t) => t.state === col);
    const byKey = new Map(inCol.map((t) => [t.key, t]));
    const sorted = sortColumn(col, inCol.map((t) => ({ id: t.key, isRush: t.pub.isRush, sentAtMs: t.sentAtMs, remainingSec: t.pub.remainingSec, readyAtMs: t.readyAtMs })));
    return sorted.map((x) => (byKey.get(x.id) as TicketBuild).pub);
  });
}

/** ตั๋วของวันนี้ทุกสถานี (รอบ CONFIRMED/COMPLETED ของวันธุรกิจ) */
async function todayTickets(R: RestFacade, db: Db, s: { tenantId: string; unitId: string }, criticalMins: number, nowMs: number, withStaff: boolean): Promise<TicketBuild[]> {
  const rounds = await R.kitchenRoundsForPos(db, { tenantId: s.tenantId, unitId: s.unitId, bizDate: bizToday() });
  const staff = withStaff ? await staffNames(rounds.map((r) => r.placedByUserId)) : new Map<string, string>();
  return rounds.flatMap((r) => ticketsOfRound(r, criticalMins, nowMs, staff));
}

// ═══════════ ตั๋วจากบิลหน้าขาย (R3 · CD3 · มติ 3 4) ═══════════

/** สถานีของสินค้าที่ไม่ใช่เมนู (PosProduct.stationId · ไม่ตั้ง = ของแม่) — เมนูใช้ MenuItem.stationId ที่ฝั่งร้านอาหาร */
async function stationHints(db: Db, tenantId: string, productIds: (string | null)[]): Promise<Map<string, string>> {
  const ids = [...new Set(productIds.filter((x): x is string => !!x))];
  if (!ids.length) return new Map();
  const rows = await db.posProduct.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, kind: true, stationId: true, parent: { select: { stationId: true } } } });
  const out = new Map<string, string>();
  for (const r of rows) {
    if (r.kind === "MENU") continue;
    const st = r.stationId ?? r.parent?.stationId ?? null;
    if (st) out.set(r.id, st);
  }
  return out;
}

/**
 * รอบครัวของบิลหน้าขาย (หลัง commit · ทางปกติ + ทางใบขอรับเงินของ register.ts): บิล PAID ของ POS ที่ไม่มี sourceId (ไม่ใช่บิลโต๊ะ/ออเดอร์) ·
 * บรรทัดเข้าครัวตาม R2 · รอบ TAKEAWAY CONFIRMED · ผู้ส่ง = ผู้ขาย · เลขรายวัน = คิว · ตัวนับเมนูแบบไม่ติดลบ (86 อัตโนมัติ + event STOCK) ·
 * เรียกซ้ำ/พร้อมกัน = รอบเดิม (ล็อกต่อบิล + partial unique) · ไม่ throw: ขัดข้อง = log แล้ว healMissingTickets สร้างตอนอ่านบอร์ด
 */
export async function ticketForSale(tenantId: string, unitId: string, saleId: string): Promise<TicketForSaleResult> {
  try {
    if (!isId(tenantId) || !isId(unitId) || !isId(saleId)) return { ok: true, orderId: null, created: false, reason: "VALIDATION" };
    // fix1 F4 (รีวิว R1): สาขาไม่มีสถานีครัว (ร้านค้า/คาเฟ่ไม่ใช้ครัว) = คำสั่งเดียวแล้วจบ — ไม่อ่านบิล ไม่เปิดธุรกรรม
    const R = await restaurant();
    if (!(await R.kitchenStationsForPos(prisma, { tenantId, unitId })).length) return { ok: true, orderId: null, created: false, reason: "NO_STATIONS" };
    const sale = await prisma.posSale.findFirst({
      where: { id: saleId, tenantId, unitId },
      select: { id: true, status: true, docType: true, sourceModule: true, sourceId: true, soldByUserId: true, note: true, lines: { select: { productId: true, name: true, qty: true, note: true, options: { select: { choiceId: true, groupName: true, choiceName: true } } }, orderBy: { id: "asc" } } },
    });
    if (!sale) return { ok: true, orderId: null, created: false, reason: "NOT_FOUND" };
    if (sale.status !== "PAID" || sale.docType !== "SALE" || sale.sourceModule !== "POS" || sale.sourceId) return { ok: true, orderId: null, created: false, reason: "NOT_REGISTER_SALE" };
    const hints = await stationHints(prisma, tenantId, sale.lines.map((l) => l.productId));
    const run = () =>
      prisma.$transaction(async (tx) => {
        // แข่งกับ void: ถือแถวบิล FOR SHARE แล้วอ่านสถานะซ้ำ — void ที่ commit ก่อน = ไม่สร้างรอบ · void ที่มาทีหลังรอธุรกรรมนี้ แล้วตัวรับยกเลิกรายการเอง
        const st = await tx.$queryRaw<{ status: string }[]>`SELECT status::text AS status FROM "PosSale" WHERE id = ${sale.id} AND "tenantId" = ${tenantId} FOR SHARE`;
        if (st[0]?.status !== "PAID") return { created: false, orderId: null, dailyNo: null, reason: "NOT_PAID" as const, menuLines: [] };
        const r = await R.createKitchenRoundInTx(tx, {
          tenantId,
          unitId,
          posSaleId: sale.id,
          type: "TAKEAWAY",
          placedByUserId: sale.soldByUserId,
          lines: sale.lines.map((l) => ({
            productId: l.productId,
            name: l.name,
            qty: l.qty,
            options: l.options.map((o) => ({ choiceId: o.choiceId, groupName: o.groupName, choiceName: o.choiceName })),
            note: l.note,
            stationHint: l.productId ? (hints.get(l.productId) ?? null) : null,
          })),
        });
        if (r.created && r.orderId && r.menuLines.length) {
          const taken = await consumeMenuStockFloorInTx(tx, { tenantId, unitId }, r.menuLines);
          await R.kitchenSetStockTakenInTx(tx, { tenantId, unitId }, { orderId: r.orderId, taken }); // fix1 H1
        }
        return r;
      });
    let r: Awaited<ReturnType<typeof run>>;
    try {
      r = await run();
    } catch (e) {
      // ชน partial unique กับคำขอที่ commit ก่อน (กันชั้นที่สอง) = รอบเดิม
      if ((e as { code?: unknown } | null)?.code !== "P2002") throw e;
      r = await run();
    }
    return { ok: true, orderId: r.orderId, created: r.created, ...(r.reason ? { reason: r.reason } : {}) };
  } catch (e) {
    console.error("[pos/kds] ticketForSale ล้ม — heal ตอนอ่านบอร์ด", e);
    return { ok: true, orderId: null, created: false, reason: "ERROR" };
  }
}

/**
 * heal (R3 · มติ 3): บิล POS ของสาขาที่ PAID ภายใน 12 ชม. · ไม่มี sourceId · มีบรรทัดที่เข้าครัวได้ · ยังไม่มีรอบ — ≤ 20 บิลต่อครั้ง (ใหม่ก่อน) ·
 * VOIDED/คืนเงินเต็ม = ไม่เคยสร้าง · เรียกจาก kdsBoard ทุกครั้ง
 * fix1 H4 + fix2 G1/N2 (มติ fix2-1): บรรทัดนับเฉพาะเมื่อการผูกครัว "มีอยู่ก่อนขาย" — เมนู: MenuItem.createdAt (stationId บังคับ = ผูกตั้งแต่เกิด) ·
 *   ไม่ใช่เมนู: coalesce(stationSetAt, createdAt) ของแถว (หรือของแม่เมื่อใช้สถานีแม่ — และของแถวเองด้วย: ผูกเป็นตัวแปรหลังขายประทับ stationSetAt · P2.6U มติ 17) ·
 *   สถานี: KdsStation.createdAt — ทั้งหมด ≤ เวลาขาย
 *   (ไม่ใช้ updatedAt — ขายซ้ำ/แก้ราคาไม่ทำให้ heal ตาบอด) · ข้อจำกัด: ย้าย/เลิกเก็บสถานีหลังขายยังให้ตั๋วผีได้ภายใน 12 ชม. (owner line)
 */
export async function healMissingTickets(tenantId: string, unitId: string): Promise<HealResult> {
  if (!isId(tenantId) || !isId(unitId)) return { ok: true, healed: 0 };
  const since = new Date(Date.now() - KDS_HEAL_WINDOW_MS);
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT s.id FROM "PosSale" s
    WHERE s."tenantId" = ${tenantId} AND s."unitId" = ${unitId} AND s.status::text = 'PAID' AND s."docType"::text = 'SALE'
      AND s."sourceModule" = 'POS' AND s."sourceId" IS NULL AND s."createdAt" >= ${since}
      AND s."offlineRef" IS NULL -- POS P3.4 ▸ CD-1 R9: บิลออฟไลน์ที่ซิงก์ทีหลังไม่สร้างรอบครัว (ครัวทำ/เสิร์ฟไปแล้วตอนขาย) ◂
      AND NOT EXISTS (SELECT 1 FROM "RestaurantOrder" o WHERE o."posSaleId" = s.id)
      AND EXISTS (
        SELECT 1 FROM "PosSaleLine" l
        WHERE l."saleId" = s.id AND l."productId" IS NOT NULL AND (
          EXISTS (SELECT 1 FROM "MenuItem" m JOIN "KdsStation" k ON k.id = m."stationId" AND k."archivedAt" IS NULL AND k."createdAt" <= s."createdAt"
                  WHERE m."posProductId" = l."productId" AND m."tenantId" = ${tenantId} AND m."unitId" = ${unitId} AND m."archivedAt" IS NULL
                    AND m."createdAt" <= s."createdAt")
          OR EXISTS (SELECT 1 FROM "PosProduct" p LEFT JOIN "PosProduct" pp ON pp.id = p."parentId"
                     JOIN "KdsStation" k ON k.id = coalesce(p."stationId", pp."stationId") AND k."tenantId" = ${tenantId} AND k."unitId" = ${unitId} AND k."archivedAt" IS NULL
                       AND k."createdAt" <= s."createdAt"
                     WHERE p.id = l."productId" AND p."tenantId" = ${tenantId} AND p.kind::text <> 'MENU'
                       AND CASE WHEN p."stationId" IS NOT NULL THEN coalesce(p."stationSetAt", p."createdAt") <= s."createdAt"
                                ELSE coalesce(pp."stationSetAt", pp."createdAt") <= s."createdAt" AND coalesce(p."stationSetAt", p."createdAt") <= s."createdAt" END)))
    ORDER BY s."createdAt" DESC, s.id
    LIMIT ${KDS_HEAL_MAX}`;
  let healed = 0;
  for (const r of rows) {
    const t = await ticketForSale(tenantId, unitId, r.id);
    if (t.created) healed++;
  }
  return { ok: true, healed };
}

// ═══════════ ออเดอร์ออนไลน์ (R4 R11 R13 · CD3 CD7 · มติ 10) — order.ts เรียก ═══════════

/**
 * รอบครัวของออเดอร์ "ในธุรกรรมรับ" (ทุกทางเข้า ACCEPTED: acceptOrder · รับอัตโนมัติ · รับเข้าเป็น ACCEPTED) — posOrderId · ช่องทาง · เลขอ้างอิง ·
 * เวลาเป้า = prepMinutes ของออเดอร์ · DELIVERY = DELIVERY · อื่น (PICKUP/DINE_IN) = PICKUP · ไม่ขึ้นกับการจ่ายเงิน · ครัวไม่ปฏิเสธการรับ (ตัวนับไม่ติดลบ)
 */
export async function roundForOrderInTx(tx: Tx, o: PosOrder, ch: { name: string }): Promise<{ orderId: string | null; created: boolean }> {
  const lines = await tx.posOrderLine.findMany({ where: { tenantId: o.tenantId, orderId: o.id }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
  const hints = await stationHints(tx, o.tenantId, lines.map((l) => l.productId));
  const optionsOf = (v: unknown): { choiceId: string | null; groupName: string; choiceName: string }[] =>
    Array.isArray(v)
      ? v.filter(isRecord).map((x) => ({ choiceId: typeof x.choiceId === "string" ? x.choiceId : null, groupName: typeof x.groupName === "string" ? x.groupName : "", choiceName: typeof x.choiceName === "string" ? x.choiceName : "" })).filter((x) => x.choiceName)
      : [];
  const R = await restaurant();
  const r = await R.createKitchenRoundInTx(tx, {
    tenantId: o.tenantId,
    unitId: o.unitId,
    posOrderId: o.id,
    type: o.fulfilment === "DELIVERY" ? "DELIVERY" : "PICKUP",
    placedByUserId: null,
    channelCode: o.channelCode,
    channelName: ch.name,
    externalRef: o.externalRef,
    targetMinutes: o.prepMinutes,
    guestName: o.customerName,
    note: o.note,
    lines: lines.map((l) => ({ productId: l.productId, name: l.name, qty: l.qty, options: optionsOf(l.options), note: l.note, stationHint: l.productId ? (hints.get(l.productId) ?? null) : null })),
  });
  if (r.created && r.orderId && r.menuLines.length) {
    const taken = await consumeMenuStockFloorInTx(tx, { tenantId: o.tenantId, unitId: o.unitId }, r.menuLines);
    await R.kitchenSetStockTakenInTx(tx, { tenantId: o.tenantId, unitId: o.unitId }, { orderId: r.orderId, taken }); // fix1 H1
  }
  return { orderId: r.orderId, created: r.created };
}

/** ครัวของสาขาหยุดรับอยู่ไหม (R13 · ingest ที่ไม่ใช่ MANUAL = CHANNEL_PAUSED) */
export async function kitchenPausedForUnit(db: Db, tenantId: string, unitId: string): Promise<boolean> {
  const R = await restaurant();
  return (await R.kitchenSettingForPos(db, { tenantId, unitId })).kitchenPaused;
}

/** ตั๋วที่ยังไม่พร้อม (NEW + COOKING) ต่อสถานีที่ใช้งาน (CD 4 · วันนี้) */
async function backlogOf(R: RestFacade, db: Db, s: { tenantId: string; unitId: string }): Promise<KitchenBacklogRow[]> {
  const stations = await R.kitchenStationsForPos(db, s);
  if (!stations.length) return [];
  const tickets = await todayTickets(R, db, s, 15, Date.now(), false);
  return stations.map((st) => ({ stationId: st.id, open: tickets.filter((t) => t.stationId === st.id && (t.state === "NEW" || t.state === "COOKING")).length }));
}

/** รับอัตโนมัติถูกพักไหม (R13): ครัวหยุดรับ · หรือมีสถานีที่ตั๋วค้าง ≥ autoAcceptMaxOpen (ต่อสถานี) — ออเดอร์อยู่ NEW รอคนรับ */
export async function autoAcceptBlockedInTx(tx: Tx, s: { tenantId: string; unitId: string }): Promise<boolean> {
  const R = await restaurant();
  const st = await R.kitchenSettingForPos(tx, s);
  if (st.kitchenPaused) return true;
  if (st.autoAcceptMaxOpen === null || st.autoAcceptMaxOpen === undefined) return false;
  const n = st.autoAcceptMaxOpen;
  return (await backlogOf(R, tx, s)).some((b) => b.open >= n);
}

/** คิวค้างต่อสถานี (R13 · ระบบ) — ทุกสถานีที่ใช้งาน (0 ได้) */
export async function kitchenBacklog(tenantId: string, unitId: string): Promise<KitchenBacklogRow[]> {
  if (!isId(tenantId) || !isId(unitId)) return [];
  return backlogOf(await restaurant(), prisma, { tenantId, unitId });
}

// POS P2.6U ▸ มติ 10: ตัวอ่านเลขคิวของบิลหน้าขาย (PayDone "คิว N") — อ่านอย่างเดียว · รอบของบิล (posSaleId) ที่สาขานี้ · ไม่มีรอบ = null ◂
export async function queueNoForSale(tenantId: string, unitId: string, saleId: string): Promise<number | null> {
  return (await roundOfSale(tenantId, unitId, saleId))?.no ?? null;
}
/** P2.6U ▸ fix1 F2: รอบครัวของบิล (id + เลขคิว) — PayDone พิมพ์ใบครัวหลังขาย (17B after-sale) · อ่านอย่างเดียว ◂ */
export async function roundOfSale(tenantId: string, unitId: string, saleId: string): Promise<{ orderId: string; no: number } | null> {
  if (!isId(tenantId) || !isId(unitId) || !isId(saleId)) return null;
  const r = await prisma.restaurantOrder.findFirst({ where: { tenantId, unitId, posSaleId: saleId }, select: { id: true, dailyNo: true } });
  return r ? { orderId: r.id, no: r.dailyNo } : null;
}
/**
 * POS P2.14 ▸ UI-8 (U1): บิลนี้มีบรรทัดที่เข้าครัวไหม (เมนูที่มีสถานี / สินค้าที่ผูกสถานีของสาขา · สถานีใช้งานอยู่) — อ่านอย่างเดียว ·
 * บิลขายปลีกล้วน (น้ำดื่ม ฯลฯ) = false ⇒ จอปิดบิลไม่เตือน "ใบครัวไม่ออก" ผิด ๆ · ไม่พบบิล = false ◂
 */
export async function saleNeedsKitchen(tenantId: string, unitId: string, saleId: string): Promise<boolean> {
  if (!isId(tenantId) || !isId(unitId) || !isId(saleId)) return false;
  const sale = await prisma.posSale.findFirst({ where: { id: saleId, tenantId, unitId }, select: { lines: { select: { productId: true } } } });
  if (!sale || !sale.lines.length) return false;
  const hints = await stationHints(prisma, tenantId, sale.lines.map((l) => l.productId));
  const R = await restaurant();
  return R.kitchenRoutesForPos(prisma, { tenantId, unitId }, sale.lines.map((l) => ({ productId: l.productId, stationHint: l.productId ? (hints.get(l.productId) ?? null) : null })));
}
/** POS P2.6U ▸ มติ 9c/11: สถานะครัวของสาขาสำหรับจอ 09 (พักครัว · เพดานรับอัตโนมัติ · ตั๋วค้างต่อสถานี) — อ่านอย่างเดียว · ผู้เรียกตรวจสิทธิ์ ◂ */
export async function kitchenStateForUnit(tenantId: string, unitId: string): Promise<{ paused: boolean; maxOpen: number | null; backlog: KitchenBacklogRow[] }> {
  if (!isId(tenantId) || !isId(unitId)) return { paused: false, maxOpen: null, backlog: [] };
  const R = await restaurant();
  const [setting, backlog] = await Promise.all([R.kitchenSettingForPos(prisma, { tenantId, unitId }), kitchenBacklog(tenantId, unitId)]);
  return { paused: setting.kitchenPaused, maxOpen: setting.autoAcceptMaxOpen, backlog };
}
/**
 * POS P2.6U ▸ fix1 F1 (มติ fix1-1): สินค้าที่เข้าครัวของสาขา (แผ่น "แจ้งของหมด" ของจอครัว) — อ่านอย่างเดียว ·
 *   เมนูของสาขาที่ MenuItem ผูกสถานีที่ใช้งาน + สินค้าที่ไม่ใช่เมนูที่ PosProduct.stationId (หรือของแม่) เป็นสถานีที่ใช้งานของสาขา และขายที่สาขานี้ (unitId null/สาขานี้) ·
 *   available = catalog.availabilityFor (ความจริงเดียวกับหน้าขาย/ช่องทาง) · mark = PosAvailabilityMark ของสาขา · ≤ 500 แถว · สาขาไม่มีสถานี = [] ◂
 */
export async function kdsKitchenProducts(ctx: RegisterCtx, actor: RegisterActor, input?: unknown): Promise<KdsKitchenProductsResult> {
  return guard("kdsKitchenProducts", async (): Promise<KdsKitchenProductsResult> => {
    const s = await kscope(ctx, actor, "availability");
    if (isRefusal(s)) return s;
    if (input !== undefined && input !== null && !isRecord(input)) return refuse("VALIDATION");
    const R = await restaurant();
    const stations = await R.kitchenStationsForPos(prisma, s);
    if (!stations.length) return { ok: true, items: [] };
    const sids = stations.map((x) => x.id);
    const menus = await prisma.menuItem.findMany({ where: { tenantId: s.tenantId, unitId: s.unitId, archivedAt: null, stationId: { in: sids }, posProductId: { not: null } }, select: { posProductId: true, stationId: true } });
    const menuStation = new Map(menus.map((m) => [m.posProductId as string, m.stationId]));
    const rows = await prisma.posProduct.findMany({
      where: {
        tenantId: s.tenantId,
        systemId: s.systemId,
        archivedAt: null,
        OR: [
          { kind: "MENU", id: { in: [...menuStation.keys()] } },
          { kind: { not: "MENU" }, OR: [{ unitId: null }, { unitId: s.unitId }], AND: [{ OR: [{ stationId: { in: sids } }, { stationId: null, parent: { stationId: { in: sids } } }] }] },
        ],
      },
      select: { id: true, name: true, nameEn: true, kind: true, stationId: true, parent: { select: { stationId: true } } },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: 500,
    });
    const ids = rows.map((r) => r.id);
    const [avail, marks] = await Promise.all([
      (await import("./catalog")).availabilityFor(s.tenantId, s.unitId, ids),
      ids.length ? prisma.posAvailabilityMark.findMany({ where: { tenantId: s.tenantId, unitId: s.unitId, productId: { in: ids } }, select: { productId: true, source: true, markedAt: true } }) : Promise.resolve([]),
    ]);
    const markOf = new Map(marks.map((m) => [m.productId, m]));
    const items: KdsKitchenProduct[] = rows.map((r) => {
      const m = markOf.get(r.id);
      return {
        productId: r.id,
        name: r.name,
        nameEn: r.nameEn,
        stationId: (r.kind === "MENU" ? menuStation.get(r.id) : (r.stationId ?? r.parent?.stationId)) ?? "",
        available: avail[r.id] === true,
        mark: m ? { source: m.source, at: m.markedAt.toISOString() } : null,
      };
    });
    return { ok: true, items };
  });
}

/** POS P2.6U ▸ fix1 F3 (มติ fix1-3): สถานีที่ใช้งานของสาขา (17B · ลิ้นชัก 06) — อ่านอย่างเดียว ไม่ heal ไม่คิดบอร์ด ◂ */
export async function kdsStations(ctx: RegisterCtx, actor: RegisterActor): Promise<KdsStationsResult> {
  return guard("kdsStations", async (): Promise<KdsStationsResult> => {
    const s = await kscope(ctx, actor, "stations");
    if (isRefusal(s)) return s;
    const R = await restaurant();
    const st = await R.kitchenStationsForPos(prisma, s);
    return { ok: true, stations: st.map((x) => ({ id: x.id, name: x.name, nameEn: x.nameEn })) };
  });
}
// ◂ POS P2.6U

/** หลังเลื่อนตั๋วของรอบออนไลน์ (ในธุรกรรมเดียวกัน · CD7): ออกจาก NEW ครั้งแรก ⇒ PREPARING · ครบทุกรายการ READY/SERVED ⇒ READY (ไม่ถอยหลัง) */
async function onlineProgressInTx(tx: Tx, R: RestFacade, s: { tenantId: string; unitId: string }, orderId: string, posOrderId: string): Promise<void> {
  const round = await R.kitchenRoundForPos(tx, { tenantId: s.tenantId, unitId: s.unitId, orderId });
  if (!round) return;
  const lv = live(round.items);
  if (!lv.length) return;
  const started = lv.some((i) => i.kdsStatus !== "NEW");
  const allReady = lv.every((i) => isDone(i.kdsStatus));
  await (await import("./order")).kitchenProgressInTx(tx, { tenantId: s.tenantId, posOrderId, started, allReady });
}

// ═══════════ ปุ่มครัว (R6 · CD4 · CD 16) ═══════════
type MoveSpec = { need: Need; from: ("NEW" | "COOKING" | "READY" | "SERVED")[]; to: "COOKING" | "READY" | "SERVED"; recall?: boolean };
async function moveTicket(name: string, ctx: RegisterCtx, actor: RegisterActor, input: unknown, spec: MoveSpec, byItem: boolean): Promise<KdsActionResult> {
  return guard(name, async (): Promise<KdsActionResult> => {
    const s = await kscope(ctx, actor, spec.need);
    if (isRefusal(s)) return s;
    if (!isRecord(input)) return refuse("VALIDATION");
    const R = await restaurant();
    let orderId: unknown = input.orderId;
    let stationId: unknown = input.stationId;
    let itemId: string | undefined;
    if (byItem) {
      if (!isId(input.itemId)) return refuse("TICKET_NOT_FOUND");
      const it = await R.kitchenItemForPos(prisma, { tenantId: s.tenantId, unitId: s.unitId, itemId: input.itemId });
      if (!it) return refuse("TICKET_NOT_FOUND");
      orderId = it.orderId;
      stationId = it.stationId;
      itemId = it.id;
    }
    const t = await ticketOf(R, s, orderId, stationId);
    if (isRefusal(t)) return t;
    if (spec.recall && t.round.bizDate !== bizToday()) return refuse("TICKET_TOO_OLD");
    const now = new Date();
    let changed: number;
    try {
      changed = await prisma.$transaction(async (tx) => {
      // fix2 N4 (มติ fix2-4): ดึงกลับตั๋วของบิลที่ void/คืนเงิน / ออเดอร์ที่ยกเลิก-ปฏิเสธ ไม่ได้ (ครัวไม่ทำของที่ไม่มีคนจ่าย) — บิล: FOR SHARE (แข่งกับ void) · ออเดอร์: อ่านธรรมดา · ไม่เขียนอะไร
      // P2.6U มติ 15 (R3 H1): ล็อกรอบก่อนอ่านสถานะ — ตัวรับ pos.order.cancelled/pos.sale.voided ต้องรอหลังเรา (ไม่มีช่องอ่านแล้วค่อยล็อก) · สอง recall รอบเดียวกันเรียงคิวที่นี่
      if (spec.recall) {
        await R.kitchenLockRoundInTx(tx, s, t.round.id);
        if (await roundVoidedInTx(tx, s.tenantId, t.round)) throw new KdsAbort(refuse("TICKET_VOIDED"));
      }
      const r = await R.kitchenMoveInTx(tx, s, { orderId: t.round.id, ...(byItem ? { itemId } : { stationId: stationId as string }), from: spec.from, to: spec.to, recall: spec.recall, now });
      if (r.changed && t.round.posOrderId) await onlineProgressInTx(tx, R, s, t.round.id, t.round.posOrderId);
      return r.changed;
      });
    } catch (e) {
      if (e instanceof KdsAbort) return e.refusal;
      throw e;
    }
    return { ok: true, changed };
  });
}

/** fix2 N4: ยกเลิกธุรกรรมพร้อมคำปฏิเสธ (rollback · ไม่มีแถวใดถูกเขียน) */
class KdsAbort extends Error {
  constructor(readonly refusal: KdsRefusal) {
    super(refusal.code);
  }
}
/** fix2 N4: รอบนี้เป็นของบิลที่ไม่ PAID แล้ว (void / คืนเงินเต็ม) / ออเดอร์ที่ยกเลิกหรือปฏิเสธแล้วไหม (สถานะของต้นทาง · ผู้เรียกถือล็อกรอบแล้ว — มติ P2.6U-15) */
async function roundVoidedInTx(tx: Tx, tenantId: string, round: RoundRow): Promise<boolean> {
  if (round.posSaleId) {
    const st = await tx.$queryRaw<{ status: string }[]>`SELECT status::text AS status FROM "PosSale" WHERE id = ${round.posSaleId} AND "tenantId" = ${tenantId} FOR SHARE`;
    if (st[0] && st[0].status !== "PAID") return true;
  }
  if (round.posOrderId) {
    // อ่านธรรมดา (สถานะปลายทาง) ใต้ล็อกรอบ — ห้าม FOR SHARE: ขั้นถัดไปของ recall ล็อก PosOrder FOR UPDATE · ล็อกรอบเรียงคิว recall ไว้แล้ว
    const st = await tx.$queryRaw<{ status: string }[]>`SELECT status::text AS status FROM "PosOrder" WHERE id = ${round.posOrderId} AND "tenantId" = ${tenantId}`;
    if (st[0] && (st[0].status === "CANCELLED" || st[0].status === "REJECTED")) return true;
  }
  return false;
}

/** เริ่มทำ (NEW → COOKING ของตั๋ว) · ซ้ำ = changed 0 */
export async function kdsStart(ctx: RegisterCtx, actor: RegisterActor, input: { orderId: string; stationId: string }): Promise<KdsActionResult> {
  return moveTicket("kdsStart", ctx, actor, input, { need: "advance", from: ["NEW"], to: "COOKING" }, false);
}
/** เสร็จทีละบรรทัด (NEW|COOKING → READY) — "เสร็จ 1/2" */
export async function kdsLineDone(ctx: RegisterCtx, actor: RegisterActor, input: { itemId: string }): Promise<KdsActionResult> {
  return moveTicket("kdsLineDone", ctx, actor, input, { need: "advance", from: ["NEW", "COOKING"], to: "READY" }, true);
}
/** เสร็จทั้งตั๋ว (NEW|COOKING → READY · readyAt ของบรรทัดที่เสร็จก่อนไม่ถูกเขียนทับ) */
export async function kdsTicketDone(ctx: RegisterCtx, actor: RegisterActor, input: { orderId: string; stationId: string }): Promise<KdsActionResult> {
  return moveTicket("kdsTicketDone", ctx, actor, input, { need: "advance", from: ["NEW", "COOKING"], to: "READY" }, false);
}
/** เสิร์ฟแล้ว (READY → SERVED · ครบทุกสถานี = รอบ COMPLETED) */
export async function kdsServed(ctx: RegisterCtx, actor: RegisterActor, input: { orderId: string; stationId: string }): Promise<KdsActionResult> {
  return moveTicket("kdsServed", ctx, actor, input, { need: "advance", from: ["READY"], to: "SERVED" }, false);
}
/** ดึงกลับ (READY|SERVED → COOKING · ล้างเวลาพร้อม/เสิร์ฟ · รอบ COMPLETED → CONFIRMED · วันเดียวกันเท่านั้น = ไม่งั้น TICKET_TOO_OLD) */
export async function kdsRecall(ctx: RegisterCtx, actor: RegisterActor, input: { orderId: string; stationId: string }): Promise<KdsActionResult> {
  return moveTicket("kdsRecall", ctx, actor, input, { need: "recall", from: ["READY", "SERVED"], to: "COOKING", recall: true }, false);
}

/** เร่ง/ยกเลิกเร่งทั้งรอบ (restaurant.order.rush · กติกา setOrderRush เดิม) */
export async function kdsRush(ctx: RegisterCtx, actor: RegisterActor, input: { orderId: string; rush: boolean }): Promise<KdsRushResult> {
  return guard("kdsRush", async (): Promise<KdsRushResult> => {
    const s = await kscope(ctx, actor, "rush");
    if (isRefusal(s)) return s;
    if (!isRecord(input)) return refuse("VALIDATION");
    const R = await restaurant();
    const t = await ticketOf(R, s, input.orderId, undefined);
    if (isRefusal(t)) return t;
    if (typeof input.rush !== "boolean") return refuse("VALIDATION");
    const rush = input.rush;
    await prisma.$transaction((tx) => R.kitchenRushInTx(tx, s, { orderId: t.round.id, rush }));
    return { ok: true, rush };
  });
}

// ═══════════ บอร์ด (R7 R8 R13 · CD 4 5 15) ═══════════

/** รายการ 86 ของสาขา: mark (ใคร/เมื่อไร/แหล่ง) + เมนูที่ขายไม่ได้ (86 เดิม = MANUAL · ตัวนับหมด = STOCK) + สินค้าที่ปิดขายรายสาขาไม่มี mark (MANUAL) */
async function eightySixOf(R: RestFacade, s: S): Promise<KdsEightySix[]> {
  const [marks, menus, offRows] = await Promise.all([
    prisma.posAvailabilityMark.findMany({ where: { tenantId: s.tenantId, unitId: s.unitId }, orderBy: [{ markedAt: "asc" }, { id: "asc" }] }),
    R.kitchenSoldOutMenusForPos(prisma, s),
    prisma.posProduct.findMany({ where: { tenantId: s.tenantId, systemId: s.systemId, archivedAt: null, unavailableUnitIds: { has: s.unitId } }, select: { id: true, name: true, updatedAt: true }, take: 100 }),
  ]);
  const names = new Map((marks.length ? await prisma.posProduct.findMany({ where: { tenantId: s.tenantId, id: { in: marks.map((m) => m.productId) } }, select: { id: true, name: true } }) : []).map((p) => [p.id, p.name]));
  const out: KdsEightySix[] = marks.map((m) => ({ productId: m.productId, name: names.get(m.productId) ?? "", at: m.markedAt.toISOString(), source: m.source }));
  const seen = new Set(out.map((x) => x.productId));
  for (const m of menus) {
    if (!m.posProductId || seen.has(m.posProductId)) continue;
    seen.add(m.posProductId);
    out.push({ productId: m.posProductId, name: m.name, at: m.updatedAt.toISOString(), source: m.stockQty !== null && m.stockQty <= 0 ? "STOCK" : "MANUAL" });
  }
  for (const p of offRows) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    out.push({ productId: p.id, name: p.name, at: p.updatedAt.toISOString(), source: "MANUAL" });
  }
  return out;
}

/**
 * บอร์ดของสถานี หรือ "expo" (R7): heal ก่อนอ่าน · สถานีที่ใช้งาน + จำนวนตั๋วบนบอร์ด · ตั๋ว (ใหม่ตามเวลาส่ง · กำลังทำ เร่งก่อนแล้วเวลาที่เหลือ ·
 * พร้อมตามเวลาพร้อม) · expo = ตั๋ว READY ทุกสถานี · เสิร์ฟแล้ววันนี้ · ค้างทำ Σ ตามชื่อ (8 อันดับ) · เวลาเฉลี่ย · พักครัว · 86 · เวลาเซิร์ฟเวอร์ ·
 * สาขาไม่มีสถานี = บอร์ดว่าง (ไม่ใช่คำปฏิเสธ) · สถานีมั่ว = KDS_STATION_NOT_FOUND
 */
export async function kdsBoard(ctx: RegisterCtx, actor: RegisterActor, input: { stationId: string }): Promise<KdsBoardResult> {
  return guard("kdsBoard", async (): Promise<KdsBoardResult> => {
    const s = await kscope(ctx, actor, "read");
    if (isRefusal(s)) return s;
    if (!isRecord(input) || !isId(input.stationId)) return refuse("VALIDATION");
    const stationId = input.stationId;
    try {
      await healMissingTickets(s.tenantId, s.unitId);
    } catch (e) {
      console.error("[pos/kds] heal ล้ม (บอร์ดยังอ่านได้)", e);
    }
    // POS HF-FU ▸ a (มติ 1): กวาดออเดอร์ที่ครัวพักไว้ก่อนอ่าน (แบบ heal) — ล้ม = WARN บอร์ดยังอ่านได้ ◂
    try {
      await (await import("./order")).releaseHeldOrders(s.tenantId, s.unitId, { limit: 20 });
    } catch (e) {
      console.warn("[pos/kds] releaseHeldOrders ล้ม (บอร์ดยังอ่านได้)", e);
    }
    const R = await restaurant();
    const [stations, setting] = await Promise.all([R.kitchenStationsForPos(prisma, s), R.kitchenSettingForPos(prisma, s)]);
    const now = new Date();
    const base = { paused: setting.kitchenPaused, pausedNote: setting.kitchenPausedNote, targetMinutes: setting.kdsCriticalMins, serverNow: now.toISOString() };
    if (!stations.length) return { ok: true, stations: [], tickets: [], servedToday: { count: 0, last: null }, pending: [], avgMinutes: 0, eightySix: await eightySixOf(R, s), ...base };
    const expo = stationId === KDS_EXPO;
    if (!expo && !stations.some((st) => st.id === stationId)) return refuse("KDS_STATION_NOT_FOUND");
    const all = await todayTickets(R, prisma, s, setting.kdsCriticalMins, now.getTime(), true);
    const mine = expo ? all : all.filter((t) => t.stationId === stationId);
    const onBoard = expo ? all.filter((t) => t.state === "READY") : mine.filter((t) => t.state !== "SERVED");
    const served = mine.filter((t) => t.state === "SERVED").sort((a, b) => (b.servedAtMs ?? 0) - (a.servedAtMs ?? 0) || (a.key < b.key ? -1 : 1));
    const last = served[0];
    const pend = new Map<string, number>();
    for (const t of mine) for (const it of t.pendingItems) pend.set(it.nameSnapshot, (pend.get(it.nameSnapshot) ?? 0) + it.qty);
    return {
      ok: true,
      stations: stations.map((st) => ({ id: st.id, name: st.name, nameEn: st.nameEn, openCount: all.filter((t) => t.stationId === st.id && t.state !== "SERVED").length })),
      tickets: ordered(onBoard),
      // P2.6U ▸ มติ 7: + orderId/stationId ของใบล่าสุด (แถบเสิร์ฟแล้วดึงใบกลับได้ · เพิ่มอย่างเดียว) ◂
      servedToday: { count: served.length, last: last ? { no: last.no, label: last.label, source: last.source, at: new Date(last.servedAtMs ?? now.getTime()).toISOString(), orderId: last.pub.orderId, stationId: last.stationId } : null },
      pending: [...pend.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).slice(0, KDS_PENDING_TOP).map(([name, qty]) => ({ name, qty })),
      avgMinutes: avgReadyMinutes(mine.filter((t) => t.readyAtMs !== null).map((t) => ({ sentAtMs: t.sentAtMs, readyAtMs: t.readyAtMs as number }))),
      eightySix: await eightySixOf(R, s),
      ...base,
    };
  });
}

// ═══════════ ใบครัว (R14 · CD 13) ═══════════
const SLIP_SOURCE: Record<"th" | "en", Record<KdsSource, (r: RoundRow) => string>> = {
  th: {
    TABLE: (r) => `โต๊ะ ${r.session?.table?.name ?? ""}`.trim(),
    QR: (r) => `QR โต๊ะ ${r.session?.table?.name ?? ""}`.trim(),
    REGISTER: (r) => `ซื้อกลับ · คิว ${r.dailyNo}`,
    ONLINE: (r) => r.channelName ?? r.channelCode ?? "ออนไลน์",
    LEGACY: (r) => (r.type === "PICKUP" ? "รับที่ร้าน" : "ซื้อกลับ"),
  },
  en: {
    TABLE: (r) => `Table ${latin(r.session?.table?.name)}`.trim(),
    QR: (r) => `QR Table ${latin(r.session?.table?.name)}`.trim(),
    REGISTER: (r) => `Takeaway · Queue ${r.dailyNo}`,
    ONLINE: (r) => latin(r.channelName) || latin(r.channelCode) || "Online",
    LEGACY: (r) => (r.type === "PICKUP" ? "Pickup" : "Takeaway"),
  },
};
/** ข้อความที่ใส่ในป้ายภาษาอังกฤษได้ (ไม่มีอักษรไทย) — มี = ตัดทิ้ง */
function latin(v: string | null | undefined): string {
  return v && !THAI.test(v) ? v : "";
}

/** ข้อมูลใบครัวของรอบ (ใบละสถานี · ไม่มีเงิน · copy = พิมพ์ซ้ำ · locale ของป้าย) — สิทธิ์เดียวกับอ่านบอร์ด */
export async function kitchenSlipPayload(ctx: RegisterCtx, actor: RegisterActor, input: { orderId: string; stationId?: string; copy?: boolean; locale?: "th" | "en" }): Promise<KitchenSlipResult> {
  return guard("kitchenSlipPayload", async (): Promise<KitchenSlipResult> => {
    const s = await kscope(ctx, actor, "read");
    if (isRefusal(s)) return s;
    if (!isRecord(input)) return refuse("VALIDATION");
    if ((input.copy !== undefined && typeof input.copy !== "boolean") || (input.locale !== undefined && input.locale !== "th" && input.locale !== "en")) return refuse("VALIDATION");
    const R = await restaurant();
    const t = await ticketOf(R, s, input.orderId, input.stationId === undefined || input.stationId === null ? undefined : input.stationId);
    if (isRefusal(t)) return t;
    const locale: "th" | "en" = input.locale === "en" ? "en" : "th";
    const stations = await R.kitchenStationsForPos(prisma, s);
    const order = new Map(stations.map((st, i) => [st.id, i]));
    const stName = new Map(stations.map((st) => [st.id, locale === "en" ? st.nameEn || latin(st.name) || st.name : st.name]));
    const staff = await staffNames([t.round.placedByUserId]);
    const source = ticketSourceOf(t.round);
    const byStation = new Map<string, ItemRow[]>();
    for (const it of live(t.items)) byStation.set(it.stationId, [...(byStation.get(it.stationId) ?? []), it]);
    const slips: KitchenSlip[] = [...byStation.entries()]
      .sort((a, b) => (order.get(a[0]) ?? 999) - (order.get(b[0]) ?? 999) || (a[0] < b[0] ? -1 : 1))
      .map(([stationId, items]) => ({
        stationName: stName.get(stationId) ?? "",
        no: t.round.dailyNo,
        source,
        sourceLabel: SLIP_SOURCE[locale][source](t.round),
        channelName: t.round.channelName,
        externalRef: t.round.externalRef,
        sentAt: t.round.createdAt.toISOString(),
        staffName: t.round.placedByUserId ? (staff.get(t.round.placedByUserId) ?? null) : null,
        lines: items.map((i) => ({ qty: i.qty, name: i.nameSnapshot, options: i.options.map((o) => o.choiceSnapshot), note: i.note })),
        copy: input.copy === true,
        printLocale: locale,
      }));
    if (!slips.length) return refuse("TICKET_NOT_FOUND");
    return { ok: true, slips };
  });
}

// ═══════════ ความคืบหน้าออนไลน์ · เพดานครัวค้าง (R11 R13 · CD 7 17) ═══════════

/** "ครัวกำลังทำ x/y" ของจอ 09: done = รายการ READY/SERVED · total = รายการที่ไม่ยกเลิก (ออเดอร์ที่ไม่มีรอบ = 0/0) */
export async function kitchenProgress(ctx: RegisterCtx, actor: RegisterActor, input: { posOrderIds: string[] }): Promise<KitchenProgressResult> {
  return guard("kitchenProgress", async (): Promise<KitchenProgressResult> => {
    const s = await kscope(ctx, actor, "read");
    if (isRefusal(s)) return s;
    if (!isRecord(input) || !Array.isArray(input.posOrderIds) || input.posOrderIds.length > 200 || !input.posOrderIds.every(isId)) return refuse("VALIDATION");
    const ids = [...new Set(input.posOrderIds as string[])];
    const R = await restaurant();
    const rounds = await R.kitchenRoundsOfOrdersForPos(prisma, { tenantId: s.tenantId, unitId: s.unitId, posOrderIds: ids });
    return {
      ok: true,
      progress: ids.map((orderId) => {
        const its = rounds.filter((r) => r.posOrderId === orderId).flatMap((r) => r.items).filter((i) => i.kdsStatus !== "CANCELLED");
        return { orderId, done: its.filter((i) => isDone(i.kdsStatus)).length, total: its.length };
      }),
    };
  });
}

/** เพดานครัวค้างของการรับอัตโนมัติ (CD 7 · restaurant.kitchen.pause): จำนวนเต็ม 1..99 หรือ null (ปิด) */
export async function kdsSetAutoAcceptMax(ctx: RegisterCtx, actor: RegisterActor, input: { maxOpen: number | null }): Promise<KdsAutoAcceptResult> {
  return guard("kdsSetAutoAcceptMax", async (): Promise<KdsAutoAcceptResult> => {
    const s = await kscope(ctx, actor, "pause");
    if (isRefusal(s)) return s;
    if (!isRecord(input) || !(input.maxOpen === null || (typeof input.maxOpen === "number" && Number.isInteger(input.maxOpen) && input.maxOpen >= 1 && input.maxOpen <= KDS_AUTO_ACCEPT_MAX))) return refuse("VALIDATION");
    const maxOpen = input.maxOpen as number | null;
    const R = await restaurant();
    await prisma.$transaction((tx) => R.kitchenSetAutoAcceptMaxInTx(tx, s, maxOpen));
    await writeAudit({ tenantId: s.tenantId, actorId: s.actor.userId, action: "pos.kds.autoAcceptMax", targetType: "BusinessUnit", targetId: s.unitId, after: { unitId: s.unitId, maxOpen } });
    // POS HF-FU ▸ a (มติ 1): เพดานเปลี่ยนแล้ว (หลัง commit) ⇒ กวาดออเดอร์ที่ค้างจากเพดาน · ล้ม = WARN (ค่าตั้งบันทึกแล้ว) ◂
    try {
      await (await import("./order")).releaseHeldOrders(s.tenantId, s.unitId, { limit: 20 });
    } catch (e) {
      console.warn("[pos/kds] releaseHeldOrders ล้ม (ค่าตั้งบันทึกแล้ว)", e);
    }
    return { ok: true, maxOpen };
  });
}

// POS P5.2 ▸ D11 (ruling 4): พักครัว/เลิกพักจากจอครัวของ POS (คีย์ restaurant.kitchen.pause ที่สาขานี้ · kscope ตรวจ membership กับ DB) —
//   แทน kitchenPauseAction ของหน้าร้านอาหารเดิมที่ตอนนี้ปิดบนสาขาที่ผูก POS · เลิกพัก ⇒ กวาดออเดอร์ที่ครัวพักไว้ (HF-FU a · ล้ม = WARN) ◂
export async function kdsSetKitchenPause(ctx: RegisterCtx, actor: RegisterActor, input: { paused: boolean; note?: string | null }): Promise<KdsKitchenPauseResult> {
  return guard("kdsSetKitchenPause", async (): Promise<KdsKitchenPauseResult> => {
    const s = await kscope(ctx, actor, "pause");
    if (isRefusal(s)) return s;
    if (!isRecord(input) || typeof input.paused !== "boolean") return refuse("VALIDATION");
    const rawNote = input.note;
    if (!(rawNote === undefined || rawNote === null || (typeof rawNote === "string" && rawNote.length <= KDS_PAUSE_NOTE_MAX))) return refuse("VALIDATION");
    const paused = input.paused;
    const note = paused && typeof rawNote === "string" && rawNote.trim() ? rawNote.trim() : null;
    const R = await restaurant();
    await prisma.$transaction((tx) => R.kitchenSetPauseInTx(tx, s, paused, note));
    await writeAudit({ tenantId: s.tenantId, actorId: s.actor.userId, action: "pos.kds.kitchenPause", targetType: "BusinessUnit", targetId: s.unitId, after: { unitId: s.unitId, paused } });
    if (!paused) {
      try {
        await (await import("./order")).releaseHeldOrders(s.tenantId, s.unitId, { limit: 20 });
      } catch (e) {
        console.warn("[pos/kds] releaseHeldOrders ล้ม (เลิกพักครัวแล้ว)", e);
      }
    }
    return { ok: true, paused };
  });
}
// ◂ POS P5.2

// ═══════════ ตัวรับคิว (R10 R11 R12 · CD 10 18) — composition root (outbox-consumers.ts) เรียก · ทุกตัว idempotent ═══════════

async function cancelKitchenOf(tenantId: string, link: { posSaleId?: string; posOrderId?: string }, reason: string): Promise<void> {
  const R = await restaurant();
  await prisma.$transaction(async (tx) => {
    const r = await R.kitchenCancelInTx(tx, { tenantId, ...link, reason, now: new Date() });
    // fix1 H1: คืนเท่าที่หักจริง (stockTaken · null = รอบก่อนคอลัมน์ = 0) · เฉพาะรายการที่ยัง NEW (R12)
    const back = r.cancelled.filter((c) => c.wasNew && c.menuItemId && (c.stockTaken ?? 0) > 0).map((c) => ({ menuItemId: c.menuItemId as string, qty: c.stockTaken as number }));
    if (r.unitId && back.length) await restoreMenuStockFloorInTx(tx, { tenantId, unitId: r.unitId }, back);
  });
}
const idOf = (payload: unknown, key: string): string | null => (isRecord(payload) && isId(payload[key]) ? (payload[key] as string) : null);

/** pos.sale.voided ของบิลหน้าขายที่มีรอบ (posSaleId): รายการที่ยังไม่เสิร์ฟ = CANCELLED · คืนตัวนับเมนูเฉพาะที่ยัง NEW (R12) · คืนเงินไม่แตะครัว */
export async function onSaleVoidedKitchen(tenantId: string, payload: unknown): Promise<void> {
  const saleId = idOf(payload, "saleId");
  if (!saleId) return;
  await cancelKitchenOf(tenantId, { posSaleId: saleId }, KDS_CANCEL_REASON_SALE);
}

/** pos.order.cancelled / pos.order.rejected: รายการ NEW/COOKING/READY ของรอบออเดอร์ = CANCELLED "ออเดอร์ถูกยกเลิก" (CD 18) */
export async function onOrderClosedKitchen(tenantId: string, payload: unknown): Promise<void> {
  const orderId = idOf(payload, "orderId");
  if (!orderId) return;
  await cancelKitchenOf(tenantId, { posOrderId: orderId }, KDS_CANCEL_REASON_ORDER);
}

/**
 * pos.product.availability → ทุกช่องทาง active ของสาขาที่ adapter ≠ NONE: `ORDER_ADAPTERS[adapter].setAvailability` (อ่านตอนเรียก · CD 10) ·
 * adapter ที่ไม่มีในทะเบียน/ไม่มีเมธอด = ข้าม · ช่องทางหนึ่งล้ม = log ไม่หยุดช่องทางอื่น · ไม่เขียนแถวใด ⇒ เล่นซ้ำไม่มีผลเพิ่ม (no-op ของ P2 ซ้ำได้)
 */
export async function onAvailabilityEvent(tenantId: string, payload: unknown): Promise<void> {
  const productId = idOf(payload, "productId");
  const unitId = idOf(payload, "unitId");
  if (!productId || !unitId || !isRecord(payload) || typeof payload.available !== "boolean") return;
  const available = payload.available;
  const channels = await prisma.salesChannel.findMany({ where: { tenantId, unitId, active: true, archivedAt: null, adapter: { not: "NONE" } }, select: { id: true, code: true, adapter: true }, orderBy: [{ id: "asc" }] });
  for (const ch of channels) {
    const fn = ORDER_ADAPTERS[ch.adapter]?.setAvailability;
    if (typeof fn !== "function") continue;
    try {
      await fn({ channelId: ch.id, productId, available });
    } catch (e) {
      console.error(`[pos/kds] adapter ${ch.adapter} setAvailability ล้ม (ช่องทาง ${ch.code})`, e);
    }
  }
}
