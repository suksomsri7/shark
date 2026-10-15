// table-split.ts — POS P2.5 แยกบิลของโต๊ะ: แผน (สร้าง · แทน · ยกเลิก · อ่าน) + ตัวช่วยในธุรกรรมของการจ่ายใบ/ตัวรับ void
//
// สัญญา: ledger/pos-briefs/pos-brief-P2.5.md §2 R1 R4 R5 R10 · §10 มติ 1–12 · §11 มติ 1–13 ·
//        ledger/wo-notes/pos-P2.5-oracle.md ตารางชื่อแถว 9–17 (ข้อสอบ scripts/qc-pos-p2.5.mts) · โน้ต ledger/wo-notes/pos-P2.5.md
// 🔴 แผน/ใบ/บรรทัด (PosTableSplit*) เป็นของ POS — ไฟล์นี้เป็นผู้เขียน (register.ts เรียกตัวช่วย *InTx ของไฟล์นี้ตอนจ่ายใบ · table.ts ตอน void) ·
//    ข้อมูลโต๊ะ/session/รายการเป็นของร้านอาหาร — เรียกผ่าน `import("@/lib/modules/restaurant")` เท่านั้น (lazy · ไม่เขียน Restaurant*/TableSession เอง)
// 🔴 แผนไม่ลงบัญชี ไม่ออกเลขใบเสร็จ ไม่ปล่อย outbox (§4) · ไม่มีจุดขายของตัวเอง (ใบ = บิลหน้าขายปกติผ่าน quote/submit ของ register.ts)
// 🔴 ทุกฟังก์ชันสาธารณะ (ctx, actor, input) "คืน" {ok:true,…} | RegisterRefusal — ไม่ throw (ขัดข้องที่ไม่คาดคิด = INTERNAL)
// ลำดับล็อก: สร้าง/แทนแผน = รายการ (FOR UPDATE · เรียง id) → session (FOR UPDATE) → ใบเดิม (FOR UPDATE · เรียง id) → แผน ·
//            ยกเลิกแผน = ใบ (FOR UPDATE · เรียง id) → แผน · จ่ายใบ = รายการ → ใบ → session → แผน (register.ts) ⇒ ไม่มีวงล็อก

import { prisma } from "./db"; // จุดเดียวของ prisma ดิบในโมดูล POS (F5.1)
import { Prisma, type PrismaClient } from "@prisma/client";
import { writeAudit } from "@/lib/core/audit";
import { splitIncludedVat } from "@/lib/money/vat";
import { registerDiscountCaps, registerRefuse, registerScopeFor, registerSellerLimits, registerVatConfig } from "./register";
import { registerMemberGate } from "./register-member";
import { posPaymentSettings } from "./payment-settings";
import { verifyManagerPin } from "./staff-pin";
import {
  allocateTableSplit,
  TABLE_SPLIT_MAX_PARTS,
  TABLE_SPLIT_MODES,
  tableSplitShareName,
  type RegisterSplitTableInput,
  type SplitPlanView,
  type TableSplitAllocation,
  type TableSplitDiscount,
  type TableSplitMode,
} from "./table-split-shared";
import { tableItemsHash, type TableSplitSummary } from "./table-shared";
import type { RegisterActor, RegisterCtx, RegisterRefusal, RegisterRefusalCode } from "./register-shared";

type Db = PrismaClient;
type Tx = Prisma.TransactionClient;
type RestFacade = typeof import("@/lib/modules/restaurant");
const restaurant = (): Promise<RestFacade> => import("@/lib/modules/restaurant");

const SELL_PERMS = ["pos.sale.create"] as const;
const VIEW_PERMS = ["pos.sale.create", "pos.sale.read"] as const;
const LABEL_MAX = 40;

const isRefusal = (v: unknown): v is RegisterRefusal => !!v && typeof v === "object" && (v as { ok?: unknown }).ok === false;
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 200 && !v.includes("\u0000");
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const refuse = (code: RegisterRefusalCode, message?: string): RegisterRefusal => registerRefuse(code, message);

/** ปฏิเสธที่โยนจากในธุรกรรม (ย้อนทั้งก้อน) แล้วคืนเป็นค่า */
class SplitTxRefusal extends Error {
  constructor(readonly refusal: RegisterRefusal) {
    super(refusal.code);
  }
}

async function guard<T>(name: string, body: () => Promise<T>): Promise<T | RegisterRefusal> {
  try {
    return await body();
  } catch (e) {
    if (e instanceof SplitTxRefusal) return e.refusal;
    console.error(`[pos/table-split] ${name} INTERNAL`, e);
    return registerRefuse("INTERNAL");
  }
}

type S = { tenantId: string; systemId: string; unitId: string; actor: RegisterActor; deviceId: string | null };
async function scope(db: Db, ctx: RegisterCtx, actor: RegisterActor, perms: readonly string[]): Promise<S | RegisterRefusal> {
  const sc = await registerScopeFor(ctx, actor, perms, db);
  if (!sc.ok) return sc;
  const dev = isRecord(ctx) && typeof ctx.deviceId === "string" ? ctx.deviceId : null;
  return { tenantId: sc.ctx.tenantId, systemId: sc.ctx.systemId, unitId: sc.ctx.unitId, actor: sc.actor, deviceId: dev };
}

// ═══════════════════ อ่าน: แผน → มุมมองของจอ ═══════════════════

type PlanRow = Prisma.PosTableSplitGetPayload<object>;
type PartRow = Prisma.PosTableSplitPartGetPayload<object>;
type LineRow = Prisma.PosTableSplitLineGetPayload<object>;

const discountOf = (v: unknown): TableSplitDiscount | null =>
  isRecord(v) && (v.type === "PERCENT" || v.type === "AMOUNT") && isInt(v.value) ? { type: v.type, value: v.value } : null;

async function planView(client: Db | Tx, s: { tenantId: string; systemId: string; unitId: string }, plan: PlanRow): Promise<SplitPlanView> {
  const [parts, lines, vat] = await Promise.all([
    client.posTableSplitPart.findMany({ where: { tenantId: s.tenantId, splitId: plan.id }, orderBy: { no: "asc" } }),
    client.posTableSplitLine.findMany({ where: { tenantId: s.tenantId, splitId: plan.id }, orderBy: [{ id: "asc" }] }),
    registerVatConfig({ tenantId: s.tenantId, systemId: s.systemId }),
  ]);
  const rate = vat.ok && vat.mode === "INCLUDED" ? vat.rateBp : 0;
  const names = await (await restaurant()).tableItemNamesForPos(client, { tenantId: s.tenantId, unitId: s.unitId, itemIds: [...new Set(lines.map((l) => l.itemId))] });
  return {
    splitId: plan.id,
    version: plan.version,
    mode: plan.mode,
    status: plan.status,
    partCount: plan.partCount,
    itemsHash: plan.itemsHash,
    billDiscount: discountOf(plan.billDiscount),
    serviceChargeBp: plan.serviceChargeBp,
    baseSatang: plan.baseSatang,
    discountSatang: plan.discountSatang,
    serviceChargeSatang: plan.serviceChargeSatang,
    totalSatang: plan.totalSatang,
    parts: parts.map((p) => ({
      id: p.id,
      no: p.no,
      label: p.label,
      memberId: p.memberId,
      baseSatang: p.baseSatang,
      discountSatang: p.discountSatang,
      serviceChargeSatang: p.serviceChargeSatang,
      totalSatang: p.totalSatang,
      vatSatang: rate > 0 ? splitIncludedVat(p.totalSatang, rate).vatSatang : 0,
      status: p.status,
      saleId: p.saleId,
      lines: lines
        .filter((l) => l.partId === p.id)
        .map((l) => {
          const name = names.get(l.itemId) ?? "";
          return {
            itemId: l.itemId,
            name: l.qty === null && l.shareNum !== null && l.shareDen !== null ? tableSplitShareName(name, l.shareNum, l.shareDen) : name,
            qty: l.qty,
            shareNum: l.shareNum,
            shareDen: l.shareDen,
            amountSatang: l.amountSatang,
            stockOwner: l.stockOwner,
          };
        }),
    })),
  };
}

/** แผน OPEN ของ session (ไม่มี = null) — ตัวกันของจ่ายทั้งโต๊ะ / ยกเลิกรายการ / รวมโต๊ะ (TABLE_SPLIT_OPEN) */
export async function openSplitOfSession(client: Db | Tx, s: { tenantId: string; sessionId: string }): Promise<{ id: string; version: number } | null> {
  return client.posTableSplit.findFirst({ where: { tenantId: s.tenantId, sessionId: s.sessionId, status: "OPEN" }, select: { id: true, version: true } });
}

/** session ที่มีแผน OPEN ในชุดที่ถาม (รวมโต๊ะ · การ์ดผัง) */
export async function openSplitSessions(client: Db | Tx, s: { tenantId: string; sessionIds: string[] }): Promise<Set<string>> {
  if (!s.sessionIds.length) return new Set();
  const rows = await client.posTableSplit.findMany({ where: { tenantId: s.tenantId, sessionId: { in: s.sessionIds }, status: "OPEN" }, select: { sessionId: true } });
  return new Set(rows.map((r) => r.sessionId));
}

/**
 * รายการนี้อยู่ในแผน OPEN ไหม (ยกเลิกรายการระหว่างแยกบิล = TABLE_SPLIT_OPEN · R5) — fix1 มติ 6 (N4): แผน OPEN บน session ที่ไม่ OPEN แล้ว
 * (void ใบหลังโต๊ะปิด/ถูกรวม) ไม่นับ ⇒ รายการค้างจ่ายของ session ที่ปิดแล้วยกเลิกได้
 */
export async function itemInOpenSplit(client: Db | Tx, s: { tenantId: string; itemId: string }): Promise<boolean> {
  const lines = await client.posTableSplitLine.findMany({ where: { tenantId: s.tenantId, itemId: s.itemId }, select: { splitId: true } });
  if (!lines.length) return false;
  const plans = await client.posTableSplit.findMany({ where: { tenantId: s.tenantId, id: { in: [...new Set(lines.map((x) => x.splitId))] }, status: "OPEN" }, select: { sessionId: true, unitId: true } });
  const rest = plans.length ? await restaurant() : null;
  for (const pl of plans) if ((await rest!.tableSessionForPos(client, { tenantId: s.tenantId, unitId: pl.unitId, sessionId: pl.sessionId }))?.status === "OPEN") return true;
  return false;
}

/** สรุปแผน OPEN ต่อ session (R10 · การ์ดผัง + แผงโต๊ะ) */
export async function splitSummariesOf(client: Db | Tx, s: { tenantId: string; sessionIds: string[] }): Promise<Map<string, TableSplitSummary>> {
  const out = new Map<string, TableSplitSummary>();
  if (!s.sessionIds.length) return out;
  const plans = await client.posTableSplit.findMany({ where: { tenantId: s.tenantId, sessionId: { in: s.sessionIds }, status: "OPEN" }, select: { id: true, sessionId: true, mode: true, partCount: true } });
  if (!plans.length) return out;
  const parts = await client.posTableSplitPart.findMany({ where: { tenantId: s.tenantId, splitId: { in: plans.map((p) => p.id) } }, select: { splitId: true, status: true, totalSatang: true } });
  for (const p of plans) {
    const mine = parts.filter((x) => x.splitId === p.id);
    out.set(p.sessionId, {
      splitId: p.id,
      mode: p.mode,
      paidParts: mine.filter((x) => x.status === "PAID").length,
      partCount: p.partCount,
      remainingSatang: mine.filter((x) => x.status !== "PAID").reduce((t, x) => t + x.totalSatang, 0),
    });
  }
  return out;
}

// ═══════════════════ R1 R2 R5 สร้าง / แทนแผน ═══════════════════

type ParsedSplit = {
  sessionId: string;
  mode: TableSplitMode;
  partCount: number;
  expectedItemsHash: string;
  allocations: TableSplitAllocation[] | null;
  billDiscount: TableSplitDiscount | null;
  parts: { no: number; label: string | null; memberId: string | null | undefined }[];
  splitId: string | null;
  expectedVersion: number | null;
  managerPin: string | null;
  managerUserId: string | null;
};
const SPLIT_KEYS = new Set(["tableSessionId", "mode", "partCount", "expectedItemsHash", "allocations", "billDiscount", "parts", "splitId", "expectedVersion", "managerPin", "managerUserId"]);

function parseSplit(raw: unknown): ParsedSplit | RegisterRefusal {
  if (!isRecord(raw) || !Object.keys(raw).every((k) => SPLIT_KEYS.has(k))) return refuse("VALIDATION");
  if (!isId(raw.tableSessionId)) return refuse("VALIDATION", "รหัสโต๊ะไม่ถูกต้อง");
  if (!(TABLE_SPLIT_MODES as readonly unknown[]).includes(raw.mode)) return refuse("VALIDATION", "แบบการแยกบิลไม่ถูกต้อง");
  if (!isInt(raw.partCount)) return refuse("VALIDATION", "จำนวนบิลไม่ถูกต้อง");
  if (!isId(raw.expectedItemsHash)) return refuse("VALIDATION", "ข้อมูลรายการของโต๊ะไม่ครบ — ตรวจยอดใหม่อีกครั้ง");
  let allocations: TableSplitAllocation[] | null = null;
  if (raw.allocations !== undefined && raw.allocations !== null) {
    if (!Array.isArray(raw.allocations) || raw.allocations.length > 4000) return refuse("VALIDATION", "การระบุบิลของรายการไม่ถูกต้อง");
    allocations = [];
    for (const a of raw.allocations as unknown[]) {
      if (!isRecord(a) || !isId(a.itemId) || !(a.partNo === null || isInt(a.partNo)) || !isInt(a.qty)) return refuse("VALIDATION", "การระบุบิลของรายการไม่ถูกต้อง");
      allocations.push({ itemId: a.itemId, partNo: a.partNo as number | null, qty: a.qty });
    }
  }
  let billDiscount: TableSplitDiscount | null = null;
  if (raw.billDiscount !== undefined && raw.billDiscount !== null) {
    const d = raw.billDiscount;
    if (!isRecord(d) || !Object.keys(d).every((k) => k === "type" || k === "value") || (d.type !== "PERCENT" && d.type !== "AMOUNT") || !isInt(d.value) || d.value < 0) return refuse("VALIDATION", "ส่วนลดท้ายบิลไม่ถูกต้อง");
    billDiscount = d.value > 0 ? { type: d.type, value: d.value } : null;
  }
  const parts: ParsedSplit["parts"] = [];
  if (raw.parts !== undefined && raw.parts !== null) {
    if (!Array.isArray(raw.parts) || raw.parts.length > TABLE_SPLIT_MAX_PARTS) return refuse("VALIDATION", "ข้อมูลบิลไม่ถูกต้อง");
    for (const p of raw.parts as unknown[]) {
      if (!isRecord(p) || !isInt(p.no) || p.no < 1 || p.no > raw.partCount || parts.some((x) => x.no === p.no)) return refuse("VALIDATION", "ข้อมูลบิลไม่ถูกต้อง");
      const label = p.label === undefined || p.label === null ? null : typeof p.label === "string" && p.label.trim().length <= LABEL_MAX ? p.label.trim() || null : undefined;
      if (label === undefined) return refuse("VALIDATION", `ชื่อบิลยาวได้ไม่เกิน ${LABEL_MAX} ตัวอักษร`);
      if (p.memberId !== undefined && p.memberId !== null && !isId(p.memberId)) return refuse("VALIDATION", "รหัสสมาชิกไม่ถูกต้อง");
      parts.push({ no: p.no, label, memberId: p.memberId === undefined ? undefined : (p.memberId as string | null) });
    }
  }
  const splitId = raw.splitId === undefined || raw.splitId === null ? null : isId(raw.splitId) ? raw.splitId : undefined;
  if (splitId === undefined) return refuse("VALIDATION");
  const ev = raw.expectedVersion;
  if (ev !== undefined && ev !== null && !(isInt(ev) && ev >= 1)) return refuse("VALIDATION", "เวอร์ชันของแผนไม่ถูกต้อง");
  if (splitId !== null && !isInt(ev)) return refuse("VALIDATION", "แก้แผนต้องส่งเวอร์ชันของแผนเดิม");
  const pin = raw.managerPin === undefined || raw.managerPin === null ? null : typeof raw.managerPin === "string" && raw.managerPin.length <= 32 ? raw.managerPin : undefined;
  const mgr = raw.managerUserId === undefined || raw.managerUserId === null ? null : isId(raw.managerUserId) ? raw.managerUserId : undefined;
  if (pin === undefined || mgr === undefined) return refuse("VALIDATION", "PIN ผู้จัดการไม่ถูกต้อง");
  return {
    sessionId: raw.tableSessionId,
    mode: raw.mode as TableSplitMode,
    partCount: raw.partCount,
    expectedItemsHash: raw.expectedItemsHash,
    allocations,
    billDiscount,
    parts,
    splitId,
    expectedVersion: isInt(ev) ? ev : null,
    managerPin: pin,
    managerUserId: mgr,
  };
}

/** เพดานส่วนลดท้ายบิลของแผน (P1.15 · สูตรเดียวกับ priceCart: PERCENT = bp × ฐาน · AMOUNT = สตางค์ × 10000 + ผ่อน ½ สตางค์) — PIN ผู้จัดการ = เพดานของคนนั้น */
async function discountCap(db: Db, s: S, d: TableSplitDiscount | null, base: number, p: ParsedSplit): Promise<RegisterRefusal | { viaPin: string } | null> {
  if (!d) return null;
  const caps = await registerDiscountCaps({ tenantId: s.tenantId, systemId: s.systemId }, db);
  const use = d.type === "PERCENT" ? d.value * base : d.value * 10_000;
  const over = (maxBp: number | null) => maxBp !== null && use > maxBp * base + (d.type === "AMOUNT" ? 5_000 : 0);
  if (!over(registerSellerLimits(s.actor, s.unitId, caps).maxDiscountBp)) return null;
  if (p.managerPin === null) return refuse("DISCOUNT_EXCEEDS_LIMIT");
  const v = await verifyManagerPin({ tenantId: s.tenantId, unitId: s.unitId, deviceId: s.deviceId }, { managerPin: p.managerPin, managerUserId: p.managerUserId }, db);
  if (isRefusal(v)) return v;
  return over(registerSellerLimits(v.actor, s.unitId, caps).maxDiscountBp) ? refuse("DISCOUNT_EXCEEDS_LIMIT") : { viaPin: v.actor.userId };
}

type BillItem = Awaited<ReturnType<RestFacade["tableUnpaidItemsForPos"]>>[number];

/**
 * สร้าง/แทนแผนแยกบิล (pos.sale.create · R1 R2 R5 · มติ 1–6 11):
 *   สร้าง (ไม่ส่ง splitId): session ของสาขานี้ OPEN · มีแผน OPEN อยู่แล้ว = TABLE_SPLIT_EXISTS {splitId, version} · ชุดรายการค้างจ่าย = expectedItemsHash
 *     (ไม่ตรง = TABLE_ITEMS_CHANGED) · แผนครอบทุกหน่วยของทุกรายการค้างจ่าย
 *   แทน (splitId + expectedVersion): แผนเดิมของ session นี้ · มีใบ PAID / DONE = TABLE_SPLIT_LOCKED · เวอร์ชันไม่ตรง = VERSION_CHANGED ·
 *     ชุดรายการ = ของแผนเดิม (quote ทั้งโต๊ะถูกปฏิเสธระหว่างแผนเปิด — แฮชของ client ไม่ใช้ · โน้ตข้อคลาดเคลื่อน) · splitId เดิม · version + 1
 *   ส่วนลดโต๊ะ = เพดานของผู้ทำ (PIN ผู้จัดการได้) · สมาชิกของโต๊ะอยู่ใบ 1 (ปริยาย) · สมาชิกของใบผ่านด่านสมาชิกของหน้าขาย
 *   ธุรกรรมเดียว: ยึดรายการ (FOR UPDATE · ได้ไม่ครบ = TABLE_ITEMS_CHANGED) → session FOR UPDATE → (แทน: ใบเดิม → แผน FOR UPDATE · ตรวจซ้ำ) → เขียน
 *   ไม่ลงบัญชี · ไม่มีเลขเอกสาร · audit pos.table.split.save
 */
export async function registerSplitTable(
  ctx: RegisterCtx,
  actor: RegisterActor,
  input: RegisterSplitTableInput,
  client?: Db,
): Promise<{ ok: true; split: SplitPlanView } | RegisterRefusal | (RegisterRefusal & { splitId: string; version: number })> {
  return guard("registerSplitTable", async () => {
    const db: Db = client ?? prisma;
    const s = await scope(db, ctx, actor, SELL_PERMS);
    if (isRefusal(s)) return s;
    const p = parseSplit(input);
    if (isRefusal(p)) return p;
    const rest = await restaurant();
    const sess = await rest.tableSessionForPos(db, { tenantId: s.tenantId, unitId: s.unitId, sessionId: p.sessionId });
    if (!sess) return refuse("TABLE_NOT_FOUND");
    if (sess.status !== "OPEN") return refuse("TABLE_SESSION_CLOSED");
    const unpaid = await rest.tableUnpaidItemsForPos(db, { tenantId: s.tenantId, unitId: s.unitId, sessionId: sess.id });
    let items: BillItem[];
    let prior: PlanRow | null = null;
    if (p.splitId === null) {
      const open = await openSplitOfSession(db, { tenantId: s.tenantId, sessionId: sess.id });
      if (open) return { ...refuse("TABLE_SPLIT_EXISTS"), splitId: open.id, version: open.version };
      if (!unpaid.length) return refuse("TABLE_EMPTY");
      if (tableItemsHash(unpaid.map((i) => i.id)) !== p.expectedItemsHash) return refuse("TABLE_ITEMS_CHANGED");
      items = unpaid;
    } else {
      prior = await db.posTableSplit.findFirst({ where: { id: p.splitId, tenantId: s.tenantId, unitId: s.unitId } });
      if (!prior || prior.sessionId !== sess.id || prior.status === "CANCELLED") return refuse("TABLE_SPLIT_NOT_FOUND");
      if (prior.status === "DONE" || (await db.posTableSplitPart.count({ where: { tenantId: s.tenantId, splitId: prior.id, status: "PAID" } })) > 0) return refuse("TABLE_SPLIT_LOCKED");
      if (prior.version !== p.expectedVersion) return refuse("VERSION_CHANGED");
      const planItemIds = new Set((await db.posTableSplitLine.findMany({ where: { tenantId: s.tenantId, splitId: prior.id }, select: { itemId: true } })).map((l) => l.itemId));
      items = unpaid.filter((i) => planItemIds.has(i.id));
      if (items.length !== planItemIds.size) return refuse("TABLE_ITEMS_CHANGED");
    }
    const pay = await posPaymentSettings({ tenantId: s.tenantId, systemId: s.systemId }, db);
    const bp = pay.ok && pay.serviceCharge.enabled ? pay.serviceCharge.rateBp : 0;
    const vat = await registerVatConfig({ tenantId: s.tenantId, systemId: s.systemId }, db);
    const alloc = allocateTableSplit({
      mode: p.mode,
      partCount: p.partCount,
      items: items.map((i) => ({ id: i.id, qty: i.qty, unitSatang: i.unitPrice + i.optionsTotal })),
      allocations: p.allocations,
      billDiscount: p.billDiscount,
      serviceChargeBp: bp,
      vatRateBp: vat.ok && vat.mode === "INCLUDED" ? vat.rateBp : 0,
    });
    if (!alloc.ok) return refuse(alloc.code, alloc.code === "VALIDATION" ? alloc.message : undefined);
    const cap = await discountCap(db, s, p.billDiscount, alloc.baseSatang, p);
    if (isRefusal(cap)) return cap;
    // สมาชิกของใบ: ปริยาย = สมาชิกของโต๊ะอยู่ใบ 1 · ส่งมา = ตามที่ส่ง (null = ไม่มี) · ทุกคนผ่านด่านสมาชิกของหน้าขาย
    const members = new Map<number, string | null>([[1, sess.memberId]]);
    const labels = new Map<number, string | null>();
    for (const x of p.parts) {
      if (x.memberId !== undefined) members.set(x.no, x.memberId);
      labels.set(x.no, x.label);
    }
    for (const m of new Set([...members.values()].filter((v): v is string => !!v))) {
      if (m === sess.memberId && !p.parts.some((x) => x.memberId === m)) continue; // สมาชิกของโต๊ะผ่านด่านตอนผูกโต๊ะแล้ว
      const g = await registerMemberGate({ tenantId: s.tenantId, unitId: s.unitId, actor: s.actor }, m);
      if (isRefusal(g)) return g;
    }
    const itemIds = items.map((i) => i.id);
    const itemsHash = tableItemsHash(itemIds);
    const write = async (tx: Tx): Promise<string> => {
      const claimed = await rest.claimTableItemsInTx(tx, { tenantId: s.tenantId, unitId: s.unitId, sessionId: sess.id, itemIds });
      if (claimed.length !== itemIds.length) throw new SplitTxRefusal(refuse("TABLE_ITEMS_CHANGED"));
      const lk = await rest.lockTableSessionInTx(tx, { tenantId: s.tenantId, unitId: s.unitId, sessionId: sess.id });
      if (!lk) throw new SplitTxRefusal(refuse("TABLE_NOT_FOUND"));
      if (lk.status !== "OPEN") throw new SplitTxRefusal(refuse("TABLE_SESSION_CLOSED"));
      const data = {
        mode: p.mode,
        partCount: p.partCount,
        itemsHash,
        serviceChargeBp: bp,
        baseSatang: alloc.baseSatang,
        discountSatang: alloc.discountSatang,
        serviceChargeSatang: alloc.serviceChargeSatang,
        totalSatang: alloc.totalSatang,
      };
      let splitId: string;
      if (!prior) {
        const open = await openSplitOfSession(tx, { tenantId: s.tenantId, sessionId: sess.id });
        if (open) throw new SplitTxRefusal({ ...refuse("TABLE_SPLIT_EXISTS"), splitId: open.id, version: open.version } as RegisterRefusal);
        const created = await tx.posTableSplit.create({
          data: { tenantId: s.tenantId, systemId: s.systemId, unitId: s.unitId, sessionId: sess.id, status: "OPEN", ...data, billDiscount: p.billDiscount ?? Prisma.DbNull, createdByUserId: s.actor.userId },
          select: { id: true },
        });
        splitId = created.id;
      } else {
        // ใบเดิม (เรียง id) → แผน: ลำดับเดียวกับยกเลิกแผน ⇒ ตรวจ "ไม่มีใบจ่ายแล้ว" + เวอร์ชัน ใต้ล็อก
        const locked = await tx.$queryRaw<{ id: string; status: string }[]>`
          SELECT id, status::text AS status FROM "PosTableSplitPart" WHERE "splitId" = ${prior.id} AND "tenantId" = ${s.tenantId} ORDER BY id FOR UPDATE`;
        const pl = await tx.$queryRaw<{ status: string; version: number; sessionId: string }[]>`
          SELECT status::text AS status, version, "sessionId" FROM "PosTableSplit" WHERE id = ${prior.id} AND "tenantId" = ${s.tenantId} FOR UPDATE`;
        const now = pl[0];
        if (!now || now.sessionId !== sess.id || now.status === "CANCELLED") throw new SplitTxRefusal(refuse("TABLE_SPLIT_NOT_FOUND"));
        if (now.status === "DONE" || locked.some((x) => x.status === "PAID")) throw new SplitTxRefusal(refuse("TABLE_SPLIT_LOCKED"));
        if (now.version !== p.expectedVersion) throw new SplitTxRefusal(refuse("VERSION_CHANGED"));
        await tx.posTableSplitLine.deleteMany({ where: { tenantId: s.tenantId, splitId: prior.id } });
        await tx.posTableSplitPart.deleteMany({ where: { tenantId: s.tenantId, splitId: prior.id } });
        await tx.posTableSplit.update({
          where: { id: prior.id },
          data: { ...data, billDiscount: p.billDiscount ?? Prisma.DbNull, version: { increment: 1 } },
        });
        splitId = prior.id;
      }
      for (const part of alloc.parts) {
        const row = await tx.posTableSplitPart.create({
          data: {
            tenantId: s.tenantId,
            splitId,
            no: part.no,
            label: labels.get(part.no) ?? null,
            memberId: members.get(part.no) ?? null,
            baseSatang: part.baseSatang,
            discountSatang: part.discountSatang,
            serviceChargeSatang: part.serviceChargeSatang,
            totalSatang: part.totalSatang,
            status: "OPEN",
          },
          select: { id: true },
        });
        await tx.posTableSplitLine.createMany({
          data: part.lines.map((l) => ({ tenantId: s.tenantId, splitId, partId: row.id, itemId: l.itemId, qty: l.qty, shareNum: l.shareNum, shareDen: l.shareDen, amountSatang: l.amountSatang, stockOwner: l.stockOwner })),
        });
      }
      return splitId;
    };
    let splitId: string;
    try {
      splitId = await db.$transaction(write, { maxWait: 10_000, timeout: 20_000 });
    } catch (e) {
      // partial unique ของแผน OPEN ชน (สองเครื่องสร้างพร้อมกันโดยไม่ชนล็อกรายการ — ไม่ควรเกิด) = แผนของผู้ชนะ
      if ((e as { code?: unknown } | null)?.code === "P2002" && !prior) {
        const open = await openSplitOfSession(db, { tenantId: s.tenantId, sessionId: sess.id });
        if (open) return { ...refuse("TABLE_SPLIT_EXISTS"), splitId: open.id, version: open.version };
      }
      throw e;
    }
    const plan = await db.posTableSplit.findFirst({ where: { id: splitId, tenantId: s.tenantId } });
    if (!plan) return refuse("INTERNAL");
    await writeAudit({
      tenantId: s.tenantId,
      actorId: s.actor.userId,
      action: "pos.table.split.save",
      targetType: "PosTableSplit",
      targetId: plan.id,
      after: { sessionId: sess.id, mode: plan.mode, partCount: plan.partCount, version: plan.version, totalSatang: plan.totalSatang, discountSatang: plan.discountSatang, itemsHash: plan.itemsHash },
    });
    // ส่วนลดของแผนเกินเพดานของผู้ทำ อนุญาตด้วย PIN ผู้จัดการ = ร่องรอยเดียวกับบิลหน้าขาย (P1.15 · pos.discount.override via pin)
    if (cap) {
      await writeAudit({
        tenantId: s.tenantId,
        actorId: cap.viaPin,
        action: "pos.discount.override",
        targetType: "PosTableSplit",
        targetId: plan.id,
        after: { splitId: plan.id, byUserId: cap.viaPin, forUserId: s.actor.userId, discountSatang: plan.discountSatang, via: "pin" },
      });
    }
    return { ok: true as const, split: await planView(db, s, plan) };
  });
}

/** ยกเลิกแผน (pos.sale.create · R5 · มติ 6): ไม่พบ = TABLE_SPLIT_NOT_FOUND · ยกเลิกแล้ว = ok (ไม่เปลี่ยน) · มีใบจ่ายแล้ว/DONE = TABLE_SPLIT_LOCKED · เวอร์ชันไม่ตรง = VERSION_CHANGED */
export async function registerCancelSplit(ctx: RegisterCtx, actor: RegisterActor, input: { splitId: string; expectedVersion: number }, client?: Db): Promise<{ ok: true } | RegisterRefusal> {
  return guard("registerCancelSplit", async () => {
    const db: Db = client ?? prisma;
    const s = await scope(db, ctx, actor, SELL_PERMS);
    if (isRefusal(s)) return s;
    if (!isRecord(input) || !isId(input.splitId) || !(isInt(input.expectedVersion) && input.expectedVersion >= 1)) return refuse("VALIDATION");
    const splitId = input.splitId;
    const expectedVersion = input.expectedVersion;
    const r = await db.$transaction(
      async (tx): Promise<{ ok: true; changed: boolean; sessionId: string } | RegisterRefusal> => {
        const parts = await tx.$queryRaw<{ id: string; status: string }[]>`
          SELECT id, status::text AS status FROM "PosTableSplitPart" WHERE "splitId" = ${splitId} AND "tenantId" = ${s.tenantId} ORDER BY id FOR UPDATE`;
        const pl = await tx.$queryRaw<{ status: string; version: number; sessionId: string; unitId: string }[]>`
          SELECT status::text AS status, version, "sessionId", "unitId" FROM "PosTableSplit" WHERE id = ${splitId} AND "tenantId" = ${s.tenantId} FOR UPDATE`;
        const plan = pl[0];
        if (!plan || plan.unitId !== s.unitId) return refuse("TABLE_SPLIT_NOT_FOUND");
        if (plan.status === "CANCELLED") return { ok: true, changed: false, sessionId: plan.sessionId };
        if (plan.status === "DONE" || parts.some((x) => x.status === "PAID")) return refuse("TABLE_SPLIT_LOCKED");
        if (plan.version !== expectedVersion) return refuse("VERSION_CHANGED");
        await tx.posTableSplit.update({ where: { id: splitId }, data: { status: "CANCELLED", cancelledAt: new Date(), version: { increment: 1 } } });
        return { ok: true, changed: true, sessionId: plan.sessionId };
      },
      { maxWait: 10_000, timeout: 20_000 },
    );
    if (isRefusal(r)) return r;
    if (r.changed) await writeAudit({ tenantId: s.tenantId, actorId: s.actor.userId, action: "pos.table.split.cancel", targetType: "PosTableSplit", targetId: splitId, after: { sessionId: r.sessionId, status: "CANCELLED" } });
    return { ok: true as const };
  });
}

/**
 * แผนของโต๊ะ (pos.sale.create หรือ pos.sale.read · R10): แผน OPEN (ไม่มี = DONE ล่าสุด · ไม่มีเลย = null) + outsideItemIds =
 * รายการค้างจ่ายที่ไม่อยู่ในแผน (รอบที่ส่งหลังแยกบิล — จ่ายทั้งโต๊ะได้หลังแผน DONE)
 */
export async function registerSplitDetail(ctx: RegisterCtx, actor: RegisterActor, input: { tableSessionId: string }, client?: Db): Promise<{ ok: true; split: SplitPlanView | null; outsideItemIds: string[] } | RegisterRefusal> {
  return guard("registerSplitDetail", async () => {
    const db: Db = client ?? prisma;
    const s = await scope(db, ctx, actor, VIEW_PERMS);
    if (isRefusal(s)) return s;
    if (!isRecord(input) || !isId(input.tableSessionId)) return refuse("VALIDATION");
    const rest = await restaurant();
    const sess = await rest.tableSessionForPos(db, { tenantId: s.tenantId, unitId: s.unitId, sessionId: input.tableSessionId });
    if (!sess) return refuse("TABLE_NOT_FOUND");
    const plan =
      (await db.posTableSplit.findFirst({ where: { tenantId: s.tenantId, unitId: s.unitId, sessionId: sess.id, status: "OPEN" } })) ??
      (await db.posTableSplit.findFirst({ where: { tenantId: s.tenantId, unitId: s.unitId, sessionId: sess.id, status: "DONE" }, orderBy: [{ doneAt: "desc" }, { id: "desc" }] }));
    if (!plan) return { ok: true as const, split: null, outsideItemIds: [] };
    const [view, unpaid] = await Promise.all([planView(db, s, plan), rest.tableUnpaidItemsForPos(db, { tenantId: s.tenantId, unitId: s.unitId, sessionId: sess.id })]);
    const inPlan = new Set(view.parts.flatMap((p) => p.lines.map((l) => l.itemId)));
    return { ok: true as const, split: view, outsideItemIds: unpaid.filter((i) => !inPlan.has(i.id)).map((i) => i.id) };
  });
}

// ═══════════════════ ตัวช่วยของการจ่ายใบ (register.ts · ธุรกรรมของบิล) ═══════════════════

export type SplitPartForPay = {
  plan: PlanRow;
  part: PartRow;
  /** บรรทัดของใบนี้ */
  lines: LineRow[];
  /** id รายการที่ใบนี้ถือ (ลำดับไม่สำคัญ) */
  itemIds: string[];
};
/** ใบ + แผน + บรรทัดของใบ (สาขานี้ · แผนที่ยกเลิกแล้ว = ไม่พบ) — ใช้ตอน quote/submit/ใบรายการของใบ */
export async function splitPartForPay(client: Db | Tx, s: { tenantId: string; unitId: string; partId: string }): Promise<SplitPartForPay | null> {
  const part = await client.posTableSplitPart.findFirst({ where: { id: s.partId, tenantId: s.tenantId } });
  if (!part) return null;
  const plan = await client.posTableSplit.findFirst({ where: { id: part.splitId, tenantId: s.tenantId, unitId: s.unitId } });
  if (!plan || plan.status === "CANCELLED") return null;
  const lines = await client.posTableSplitLine.findMany({ where: { tenantId: s.tenantId, partId: part.id }, orderBy: { id: "asc" } });
  return { plan, part, lines, itemIds: [...new Set(lines.map((l) => l.itemId))] };
}

/** ล็อกใบ (FOR UPDATE · หลังยึดรายการ ก่อน session) — คืนสถานะใต้ล็อก */
export async function lockSplitPartInTx(tx: Tx, s: { tenantId: string; partId: string }): Promise<{ status: string; saleId: string | null; splitId: string } | null> {
  const rows = await tx.$queryRaw<{ status: string; saleId: string | null; splitId: string }[]>`
    SELECT status::text AS status, "saleId", "splitId" FROM "PosTableSplitPart" WHERE id = ${s.partId} AND "tenantId" = ${s.tenantId} FOR UPDATE`;
  return rows[0] ?? null;
}

/** ล็อกแผน (FOR UPDATE · หลัง session) แล้วตรวจ: ยกเลิกแล้ว = TABLE_SPLIT_NOT_FOUND · DONE = TABLE_SPLIT_PART_PAID · เวอร์ชันไม่ตรง = VERSION_CHANGED */
export async function checkSplitPlanInTx(tx: Tx, s: { tenantId: string; splitId: string; expectedVersion: number }): Promise<RegisterRefusalCode | null> {
  const rows = await tx.$queryRaw<{ status: string; version: number }[]>`
    SELECT status::text AS status, version FROM "PosTableSplit" WHERE id = ${s.splitId} AND "tenantId" = ${s.tenantId} FOR UPDATE`;
  const p = rows[0];
  if (!p || p.status === "CANCELLED") return "TABLE_SPLIT_NOT_FOUND";
  if (p.status !== "OPEN") return "TABLE_SPLIT_PART_PAID";
  if (p.version !== s.expectedVersion) return "VERSION_CHANGED";
  return null;
}

/**
 * ใบนี้จ่ายแล้ว (ธุรกรรมเดียวกับบิล · หลังบิลเกิด): ใบ PAID + saleId + paidAt → รายการที่ "ทุกใบที่ถือมัน" PAID แล้ว = completingItemIds (ผู้เรียกผูกกับบิลนี้ ·
 * มติ 7) → ทุกใบ PAID ⇒ แผน DONE + doneAt
 */
export async function markSplitPartPaidInTx(tx: Tx, s: { tenantId: string; splitId: string; partId: string; saleId: string; itemIds: string[] }): Promise<{ completingItemIds: string[]; done: boolean }> {
  const now = new Date();
  const u = await tx.posTableSplitPart.updateMany({ where: { id: s.partId, tenantId: s.tenantId, status: "OPEN" }, data: { status: "PAID", saleId: s.saleId, paidAt: now } });
  if (u.count !== 1) throw new Error("markSplitPartPaidInTx: part not OPEN under lock");
  const parts = await tx.posTableSplitPart.findMany({ where: { tenantId: s.tenantId, splitId: s.splitId }, select: { id: true, status: true } });
  const paid = new Set(parts.filter((p) => p.status === "PAID").map((p) => p.id));
  const holders = await tx.posTableSplitLine.findMany({ where: { tenantId: s.tenantId, splitId: s.splitId, itemId: { in: s.itemIds } }, select: { itemId: true, partId: true } });
  const completingItemIds = s.itemIds.filter((id) => holders.filter((h) => h.itemId === id).every((h) => paid.has(h.partId)));
  const done = parts.every((p) => paid.has(p.id));
  if (done) await tx.posTableSplit.updateMany({ where: { id: s.splitId, tenantId: s.tenantId, status: "OPEN" }, data: { status: "DONE", doneAt: now } });
  return { completingItemIds, done };
}

/**
 * ตัวรับ void ของใบ (R6 · มติ 7 · ธุรกรรมของตัวรับ หลังปลดรายการ): ใบที่ saleId = บิลที่ถูก void ⇒ OPEN · saleId/paidAt = null ·
 * แผน DONE ⇒ OPEN **เฉพาะเมื่อ session ของแผนไม่มีแผน OPEN อื่น** (fix1 มติ 1 · F1/N1 — partial unique แผน OPEN 1 แถวต่อ session): มีแผนใหม่ OPEN อยู่ =
 * แผนเก่าคง DONE · ใบกลับ OPEN · รายการของใบหลุดแล้ว (จ่ายผ่านการแทนแผนใหม่ หรือทั้งโต๊ะหลังแผนใหม่ DONE · checkSplitPlanInTx ไม่ให้จ่ายใบของแผนที่ไม่ OPEN) ·
 * reopen = false บังคับไม่เปิดแผน (ตัวรับลองซ้ำหลังชนกัน) · ล็อก session ของแผน (FOR UPDATE) ก่อนตรวจ = เรียงคิวกับการสร้างแผน (รายการ → session) ·
 * คืน false = เล่นซ้ำ (ใบไม่ได้ถือบิลนี้แล้ว)
 */
export async function releaseSplitPartInTx(tx: Tx, s: { tenantId: string; partId: string; splitId: string; saleId: string; reopen?: boolean }): Promise<{ released: boolean; planReopened: boolean }> {
  const u = await tx.posTableSplitPart.updateMany({ where: { id: s.partId, tenantId: s.tenantId, saleId: s.saleId }, data: { status: "OPEN", saleId: null, paidAt: null } });
  if (u.count !== 1) return { released: false, planReopened: false };
  const plan = await tx.posTableSplit.findFirst({ where: { id: s.splitId, tenantId: s.tenantId }, select: { status: true, sessionId: true, unitId: true } });
  if (!plan || plan.status !== "DONE" || s.reopen === false) return { released: true, planReopened: false };
  await (await restaurant()).lockTableSessionInTx(tx, { tenantId: s.tenantId, unitId: plan.unitId, sessionId: plan.sessionId });
  const other = await tx.posTableSplit.findFirst({ where: { tenantId: s.tenantId, sessionId: plan.sessionId, status: "OPEN", id: { not: s.splitId } }, select: { id: true } });
  if (other) return { released: true, planReopened: false };
  const r = await tx.posTableSplit.updateMany({ where: { id: s.splitId, tenantId: s.tenantId, status: "DONE" }, data: { status: "OPEN", doneAt: null } });
  return { released: true, planReopened: r.count === 1 };
}

/** ใบที่ถือบิลนี้ + id รายการของใบ (ตัวรับ void · ไม่พบ = ไม่ใช่บิลของใบ) */
export async function splitPartOfSale(client: Db | Tx, s: { tenantId: string; saleId: string }): Promise<{ partId: string; splitId: string; itemIds: string[] } | null> {
  const part = await client.posTableSplitPart.findFirst({ where: { tenantId: s.tenantId, saleId: s.saleId }, select: { id: true, splitId: true } });
  if (!part) return null;
  const lines = await client.posTableSplitLine.findMany({ where: { tenantId: s.tenantId, partId: part.id }, select: { itemId: true } });
  return { partId: part.id, splitId: part.splitId, itemIds: [...new Set(lines.map((l) => l.itemId))] };
}

// ═══════════════════ fix1 มติ 2 (N2): ตัวกันของหน้าเดิม /restaurant (เช็คบิล · ยืนยันพร้อมเพย์ · ยกเลิกรายการ) ═══════════════════
// เนื้อของประตูเดิม (restaurant/order.ts checkout/cancelOrderItem) ถูกหมุด — กันที่ชั้น action (src/lib/actions/restaurant.ts) ก่อนเรียกประตูเดิม ·
// รูปผลแบบประตูเดิม {ok:false, reason} (ข้อความไทย) · ไม่มีแผน OPEN = {ok:true}
const LEGACY_SPLIT_OPEN = "โต๊ะนี้แยกบิลอยู่ในหน้าขาย (POS) — ชำระทีละใบที่หน้าขาย หรือยกเลิกการแยกบิลก่อน";
const LEGACY_SPLIT_DONE = "โต๊ะนี้ชำระแบบแยกบิลในหน้าขาย (POS) แล้ว — รวมโต๊ะที่หน้าขาย (POS)"; // POS HF-FU ▸ d ◂

/** เช็คบิล/ยืนยันพร้อมเพย์ของหน้าเดิม: session นี้มีแผนแยกบิล OPEN = ปฏิเสธ (กันเก็บเงินซ้ำกับใบที่จ่ายแล้ว) */
export async function legacyCheckoutSplitGuard(s: { tenantId: string; unitId: string; sessionId: string }, client?: Db): Promise<{ ok: true } | { ok: false; reason: string }> {
  const db: Db = client ?? prisma;
  const open = await db.posTableSplit.findFirst({ where: { tenantId: s.tenantId, unitId: s.unitId, sessionId: s.sessionId, status: "OPEN" }, select: { id: true } });
  return open ? { ok: false, reason: LEGACY_SPLIT_OPEN } : { ok: true };
}

/** ยกเลิกรายการของหน้าเดิม: รายการอยู่ในแผนแยกบิล OPEN (ของ session ที่ยัง OPEN) = ปฏิเสธ (กันแผนค้างจ่ายไม่ได้) */
export async function legacyCancelItemSplitGuard(s: { tenantId: string; unitId: string; itemId: string }, client?: Db): Promise<{ ok: true } | { ok: false; reason: string }> {
  const db: Db = client ?? prisma;
  return (await itemInOpenSplit(db, { tenantId: s.tenantId, itemId: s.itemId })) ? { ok: false, reason: LEGACY_SPLIT_OPEN } : { ok: true };
}

/**
 * fix1 มติ 6 (N4): รวมโต๊ะ — แผน DONE ของ session ต้นทางย้ายไป session ปลายทาง (ธุรกรรมเดียวกับการรวม · ผู้เรียกกันแผน OPEN ไว้แล้ว) ⇒ void ใบภายหลัง
 * เปิดแผนบน session ที่ยังใช้อยู่ (ใบจ่ายต่อได้ที่โต๊ะปลายทาง) ไม่ใช่ session ที่ MERGED แล้ว
 */
export async function repointSplitPlansInTx(tx: Tx, s: { tenantId: string; unitId: string; fromSessionIds: string[]; toSessionId: string }): Promise<number> {
  if (!s.fromSessionIds.length) return 0;
  const u = await tx.posTableSplit.updateMany({ where: { tenantId: s.tenantId, unitId: s.unitId, sessionId: { in: s.fromSessionIds }, status: "DONE" }, data: { sessionId: s.toSessionId } });
  return u.count;
}

/** fix2 มติ 2 (F2): รวมโต๊ะของหน้าเดิม (mergeSession แช่แข็ง) — แผนแยกบิล OPEN ฝั่งต้นทางหรือปลายทาง = ปฏิเสธ (แผนไม่ตาม/ใบจ่ายไม่ได้) · HF-FU d: แผน DONE ฝั่งต้นทางก็ปฏิเสธ */
export async function legacyMergeSplitGuard(s: { tenantId: string; unitId: string; intoSessionId: string; fromSessionId: string }, client?: Db): Promise<{ ok: true } | { ok: false; reason: string }> {
  const db: Db = client ?? prisma;
  const open = await db.posTableSplit.findFirst({ where: { tenantId: s.tenantId, unitId: s.unitId, sessionId: { in: [s.intoSessionId, s.fromSessionId] }, status: "OPEN" }, select: { id: true } });
  if (open) return { ok: false, reason: LEGACY_SPLIT_OPEN };
  // POS HF-FU ▸ d (มติ 4 refuse): แผน DONE ของ session ต้นทาง — หน้าเดิมย้ายแผนไม่ได้ (mergeSession แช่แข็ง) ⇒ void ใบภายหลังจะเปิดแผนบน session ที่ MERGED แล้ว ⇒ ปฏิเสธ ◂
  const done = await db.posTableSplit.findFirst({ where: { tenantId: s.tenantId, unitId: s.unitId, sessionId: s.fromSessionId, status: "DONE" }, select: { id: true } });
  return done ? { ok: false, reason: LEGACY_SPLIT_DONE } : { ok: true };
}
