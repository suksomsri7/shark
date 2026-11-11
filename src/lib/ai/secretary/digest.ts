// digest.ts — ข้อมูลกิจการสด (S1.16 · แบบ §8 ชั้น 3 · สัญญา docs/modules/31-secretary.md §5.13)
//
// คำนวณสดจากฐานทุกครั้ง (ไม่มีตาราง ไม่มี cron) · deterministic ไม่เรียกโมเดล · cache ในหน่วยความจำ 10 นาทีต่อร้าน (เฉพาะ `digestBlockFor`)
// ระบบที่ร้านไม่เปิด = ส่วนนั้น null · แต่ละส่วนครอบ try/catch แยก (ส่วนล้ม = null + logOps WARN) · `computeDigest` ห้ามโยน
// นิยามตัวเลขทุกตัวอยู่ใน docs §5.13 (ต้องตรงกับที่นี่ทุกตัวอักษร):
//   sales        บิล POS ทุกระบบ POS ของร้าน · docType SALE · status ∈ {PAID, REFUNDED} · ยอดสุทธิ = grandTotal − refundedSatang
//                (กติกาเดียวกับ analyst.gatherBusinessSnapshot) · "วันนี้" = ตั้งแต่เที่ยงคืนไทยของวันนี้ ·
//                "7 วัน"/"30 วัน" = วันนี้ + 6/29 วันก่อนหน้า ตามวันไทย (เริ่มเที่ยงคืนไทย)
//   receivables  AccountDocument ทุกระบบบัญชี · direction OUT (ฝั่งลูกหนี้) · status ∈ {AWAITING_PAYMENT, PARTIAL} · voidedAt null ·
//                ไม่นับ BILLING_NOTE (ใบวางบิลเรียกเก็บใบที่นับแล้ว — กติกาเดียวกับ account/dashboard loadOpenDocs) ·
//                ค้าง = grandTotal − paidTotal > 0 · overdue = dueDate < เที่ยงคืนไทยของวันนี้
//   quietCustomers  CrmContact ทุกระบบ CRM · archivedAt null · createdAt < now−30 วัน · lastActivityAt null หรือ < now−30 วัน ·
//                sample ≤ 3 (เงียบนานสุดก่อน) = id + ชื่อ + จำนวนวัน — **ไม่มีเบอร์/อีเมล** · บล็อก prompt พิมพ์แค่จำนวน
//   lowStock     InvItem ทุกระบบคลัง · archivedAt null · `needsReorder(onHand, reorderPoint)` (กติกาเดียวกับ proactive lowStock) · sample ชื่อ ≤ 3
//   tomorrow     ร้านมีหน่วย BOOKING หรือระบบ BOOKING · Appointment startAt ∈ [เที่ยงคืนไทยพรุ่งนี้, +1 วัน) · status ∉ {CANCELLED, NO_SHOW}
//   pending      ตัวนับเดียวกับ proactive: คำขออนุมัติ PENDING ที่สร้างก่อน now−2 วัน · ใบลา PENDING (ระบบ HR) ก่อน now−2 วัน ·
//                ออเดอร์ร้านออนไลน์ PENDING_PAYMENT — ส่วนนี้ไม่เป็น null (ล้ม = 0)
// ผู้ดู (viewer) ของ `digestBlockFor`: ตัดส่วนที่ผู้ดูไม่มีสิทธิ์อ่าน หรือร้านตั้งระดับเลขาของระบบนั้นเป็น OFF (ตารางเดียวกับ suggest.ts)
// SEC S3a.1-S2 ▸ R-Z14 (L1 M-2): ตัวเลขต่อผู้ดู — ส่วนที่ผูกสาขา (ยอดขาย POS · นัดพรุ่งนี้ · ออเดอร์ออนไลน์) นับเฉพาะสาขาที่
//   `evaluate(m, {module, action, unitId})` ผ่าน · ลูกค้าเงียบ (count + sample) ผ่าน `crm.contactWhere` ของผู้ดู · cache คีย์ = ร้าน+ผู้ดู+ชุดสาขา
//   (`viewerScope` → `computeDigest(…, scope)` · `viewerDigest`) · ไม่ส่ง scope = ทั้งร้านแบบเดิม (ข้อสอบ/งานภายใน) ◂
// 🔴 ข้อความในบล็อกเป็น "ข้อมูล" — ชื่อสินค้าถูกล้างอักขระควบคุม/ขึ้นบรรทัดและตัดความยาวก่อนพิมพ์ (COMMON §C.3)

import type { Prisma, SystemType } from "@prisma/client";
import { prisma } from "@/lib/core/db";
import { logOps } from "@/lib/core/ops";
import { bkkAt, bkkParts } from "@/lib/core/quiet-hours";
import { canReadInventory, evaluate, type MembershipCtx } from "@/lib/core/rbac";
import { needsReorder } from "@/lib/modules/inventory/rules";
import { contactWhere } from "@/lib/modules/crm";
import type { AiActor } from "../actor";
import { membershipCan, actorBranches } from "../tool-access";
import { levelVerdict, type AccessMap } from "./access-rules";

export type Digest = {
  at: Date;
  activeSystems: string[];
  sales: { todaySatang: number; todayCount: number; d7Satang: number; d7Count: number; d30Satang: number; d30Count: number } | null;
  quietCustomers: { count: number; sample: { id: string; name: string; days: number }[] } | null;
  lowStock: { count: number; sample: string[] } | null;
  receivables: { count: number; totalSatang: number; overdueCount: number } | null;
  tomorrow: { appointments: number; firstAt: Date | null } | null;
  pending: { approvalsAged: number; leavesAged: number; shopOrders: number };
};

const DAY_MS = 86_400_000;
const QUIET_DAYS = 30;
const AGED_DAYS = 2;
const SAMPLE_MAX = 3;
const NAME_MAX = 30;
export const DIGEST_CACHE_MS = 10 * 60_000;
const CACHE_MAX = 500;
const BLOCK_MAX = 1200;

// ─────────────────────────── ขอบเขตของผู้ดู (R-Z14) ───────────────────────────

/** สาขาที่นับได้ต่อส่วน (null = ทุกสาขา · [] = ไม่มีสาขาเลย ⇒ ส่วนนั้น null) · `crmViewer` null = ทั้งร้าน */
export type DigestScope = {
  posUnitIds: string[] | null;
  bookingUnitIds: string[] | null;
  shopUnitIds: string[] | null;
  crmViewer: { userId: string; role: MembershipCtx["role"]; unitAccess: string[]; permissions: Record<string, unknown> } | null;
};
const WHOLE_SHOP: DigestScope = { posUnitIds: null, bookingUnitIds: null, shopUnitIds: null, crmViewer: null };

/** ขอบเขตของผู้ดู — สาขาที่ `evaluate(m, {module, action, unitId})` ผ่าน (ครบทุกสาขา = null) · OWNER = ทั้งร้าน */
export async function viewerScope(tenantId: string, m: MembershipCtx, userId: string): Promise<DigestScope> {
  if (m.role === "OWNER") return WHOLE_SHOP;
  const units = (await prisma.businessUnit.findMany({ where: { tenantId }, select: { id: true }, orderBy: { id: "asc" } })).map((u) => u.id);
  const unitsWhere = (module: string, action: string): string[] | null => {
    const okIds = units.filter((unitId) => evaluate(m, { module, action, unitId }));
    return units.length > 0 && okIds.length === units.length ? null : okIds;
  };
  const branches = m.unitAccess.includes("*") ? null : units.filter((u) => m.unitAccess.includes(u));
  return {
    posUnitIds: unitsWhere("pos", "pos.report.view"),
    bookingUnitIds: branches,
    shopUnitIds: branches,
    crmViewer: { userId, role: m.role, unitAccess: [...m.unitAccess], permissions: { ...(m.permissions ?? {}) } },
  };
}

const scopeKey = (sc: DigestScope): string =>
  [sc.posUnitIds, sc.bookingUnitIds, sc.shopUnitIds].map((u) => (u === null ? "*" : u.join(","))).join("|") + `|${sc.crmViewer?.userId ?? "*"}`;
const unitFilter = (ids: string[] | null) => (ids === null ? {} : { unitId: { in: ids } });

// ─────────────────────────── คำนวณ ───────────────────────────

async function systemIdsOf(tenantId: string, type: SystemType): Promise<string[]> {
  const rows = await prisma.appSystem.findMany({ where: { tenantId, type, active: true }, select: { id: true } });
  return rows.map((r) => r.id);
}

/** ครอบส่วนหนึ่งของ digest — ล้ม = null + logOps WARN (ไม่โยน) */
async function part<T>(tenantId: string, name: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (e) {
    await logOps("WARN", "ai", `digest: ส่วน ${name} คำนวณไม่ได้`, { tenantId, detail: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

async function salesPart(tenantId: string, now: Date, sc: DigestScope): Promise<Digest["sales"]> {
  const posIds = await systemIdsOf(tenantId, "POS");
  if (posIds.length === 0 || sc.posUnitIds?.length === 0) return null;
  const end = bkkAt(now, 0, 0, 1); // เที่ยงคืนไทยของพรุ่งนี้
  const win = async (dayOffset: number) => {
    const r = await prisma.posSale.aggregate({
      where: {
        tenantId,
        systemId: { in: posIds },
        ...unitFilter(sc.posUnitIds),
        docType: "SALE",
        status: { in: ["PAID", "REFUNDED"] },
        createdAt: { gte: bkkAt(now, 0, 0, dayOffset), lt: end },
      },
      _sum: { grandTotalSatang: true, refundedSatang: true },
      _count: { _all: true },
    });
    return { satang: (r._sum.grandTotalSatang ?? 0) - (r._sum.refundedSatang ?? 0), count: r._count._all };
  };
  const [t, w, m] = await Promise.all([win(0), win(-6), win(-29)]);
  return { todaySatang: t.satang, todayCount: t.count, d7Satang: w.satang, d7Count: w.count, d30Satang: m.satang, d30Count: m.count };
}

async function receivablesPart(tenantId: string, now: Date): Promise<Digest["receivables"]> {
  const accIds = await systemIdsOf(tenantId, "ACCOUNT");
  if (accIds.length === 0) return null;
  const docs = await prisma.accountDocument.findMany({
    where: {
      tenantId,
      systemId: { in: accIds },
      direction: "OUT",
      status: { in: ["AWAITING_PAYMENT", "PARTIAL"] },
      voidedAt: null,
      docType: { not: "BILLING_NOTE" },
    },
    select: { grandTotal: true, paidTotal: true, dueDate: true },
  });
  const todayStart = bkkAt(now, 0, 0, 0);
  let count = 0;
  let totalSatang = 0;
  let overdueCount = 0;
  for (const d of docs) {
    const owe = (d.grandTotal ?? 0) - (d.paidTotal ?? 0);
    if (owe <= 0) continue;
    count += 1;
    totalSatang += owe;
    if (d.dueDate && d.dueDate.getTime() < todayStart.getTime()) overdueCount += 1;
  }
  return { count, totalSatang, overdueCount };
}

async function quietPart(tenantId: string, now: Date, sc: DigestScope): Promise<Digest["quietCustomers"]> {
  const crmIds = await systemIdsOf(tenantId, "CRM");
  if (crmIds.length === 0) return null;
  const cutoff = new Date(now.getTime() - QUIET_DAYS * DAY_MS);
  // R-Z14: ผู้ดู ⇒ นับ/ตัวอย่างเฉพาะผู้ติดต่อที่เขามองเห็น (visibleWhere ของ CRM ต่อระบบ)
  const viewer = sc.crmViewer;
  const vis: Prisma.CrmContactWhereInput | null = viewer
    ? { OR: await Promise.all(crmIds.map((systemId) => contactWhere({ tenantId, systemId }, viewer))) }
    : null;
  const base: Prisma.CrmContactWhereInput = {
    tenantId,
    systemId: { in: crmIds },
    archivedAt: null,
    createdAt: { lt: cutoff },
    OR: [{ lastActivityAt: null }, { lastActivityAt: { lt: cutoff } }],
  };
  const where: Prisma.CrmContactWhereInput = vis ? { AND: [base, vis] } : base;
  const [count, rows] = await Promise.all([
    prisma.crmContact.count({ where }),
    prisma.crmContact.findMany({
      where,
      // เงียบนานสุดก่อน: ไม่เคยมีกิจกรรม (null) ก่อน แล้วกิจกรรมเก่าสุด · เสมอกัน = สร้างก่อน
      orderBy: [{ lastActivityAt: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }],
      take: SAMPLE_MAX,
      select: { id: true, name: true, lastActivityAt: true, createdAt: true }, // ชื่อเท่านั้น — ไม่อ่านเบอร์/อีเมล
    }),
  ]);
  const sample = rows.map((r) => ({
    id: r.id,
    name: cleanText(r.name),
    days: Math.floor((now.getTime() - (r.lastActivityAt ?? r.createdAt).getTime()) / DAY_MS),
  }));
  return { count, sample };
}

async function lowStockPart(tenantId: string): Promise<Digest["lowStock"]> {
  const invIds = await systemIdsOf(tenantId, "INVENTORY");
  if (invIds.length === 0) return null;
  const items = await prisma.invItem.findMany({
    where: { tenantId, systemId: { in: invIds }, archivedAt: null, reorderPoint: { gt: 0 } },
    select: { name: true, onHand: true, reorderPoint: true },
    orderBy: { name: "asc" },
  });
  const low = items.filter((i) => needsReorder(i.onHand, i.reorderPoint));
  return { count: low.length, sample: low.slice(0, SAMPLE_MAX).map((i) => cleanText(i.name)) };
}

async function tomorrowPart(tenantId: string, now: Date, sc: DigestScope): Promise<Digest["tomorrow"]> {
  const [units, systems] = await Promise.all([
    prisma.businessUnit.count({ where: { tenantId, type: "BOOKING" } }),
    systemIdsOf(tenantId, "BOOKING"),
  ]);
  if ((units === 0 && systems.length === 0) || sc.bookingUnitIds?.length === 0) return null;
  const where = {
    tenantId,
    ...unitFilter(sc.bookingUnitIds),
    status: { notIn: ["CANCELLED" as const, "NO_SHOW" as const] },
    startAt: { gte: bkkAt(now, 0, 0, 1), lt: bkkAt(now, 0, 0, 2) },
  };
  const [appointments, first] = await Promise.all([
    prisma.appointment.count({ where }),
    prisma.appointment.findFirst({ where, orderBy: { startAt: "asc" }, select: { startAt: true } }),
  ]);
  return { appointments, firstAt: first?.startAt ?? null };
}

async function pendingPart(tenantId: string, now: Date, sc: DigestScope): Promise<Digest["pending"]> {
  const agedBefore = new Date(now.getTime() - AGED_DAYS * DAY_MS);
  const zero = (name: string) => (e: unknown) => {
    void logOps("WARN", "ai", `digest: ส่วน pending.${name} คำนวณไม่ได้`, { tenantId, detail: e instanceof Error ? e.message : String(e) });
    return 0;
  };
  const [approvalsAged, leavesAged, shopOrders] = await Promise.all([
    prisma.approvalRequest.count({ where: { tenantId, status: "PENDING", createdAt: { lt: agedBefore } } }).catch(zero("approvals")),
    systemIdsOf(tenantId, "HR")
      .then((hrIds) =>
        hrIds.length === 0 ? 0 : prisma.hrLeave.count({ where: { tenantId, systemId: { in: hrIds }, status: "PENDING", createdAt: { lt: agedBefore } } }),
      )
      .catch(zero("leaves")),
    (sc.shopUnitIds?.length === 0 ? Promise.resolve(0) : prisma.shopOrder.count({ where: { tenantId, ...unitFilter(sc.shopUnitIds), status: "PENDING_PAYMENT" } })).catch(zero("shopOrders")),
  ]);
  return { approvalsAged, leavesAged, shopOrders };
}

/**
 * ข้อมูลกิจการสดของร้าน ณ `now` — ระบบไม่เปิด = null ของส่วนนั้น · ส่วนล้ม = null (+logOps) · ไม่โยนเสมอ
 * ไม่ผ่าน cache (ผู้เรียกที่ต้องการ cache ใช้ `digestBlockFor`) · `scope` (R-Z14) = ขอบเขตของผู้ดู (`viewerScope`) · ไม่ส่ง = ทั้งร้าน
 */
export async function computeDigest(tenantId: string, now: Date = new Date(), scope: DigestScope = WHOLE_SHOP): Promise<Digest> {
  const [activeSystems, sales, quietCustomers, lowStock, receivables, tomorrow, pending] = await Promise.all([
    part(tenantId, "activeSystems", async () => {
      const rows = await prisma.appSystem.findMany({ where: { tenantId, active: true }, select: { type: true }, orderBy: { createdAt: "asc" } });
      return [...new Set(rows.map((r) => r.type as string))];
    }),
    part(tenantId, "sales", () => salesPart(tenantId, now, scope)),
    part(tenantId, "quietCustomers", () => quietPart(tenantId, now, scope)),
    part(tenantId, "lowStock", () => lowStockPart(tenantId)),
    part(tenantId, "receivables", () => receivablesPart(tenantId, now)),
    part(tenantId, "tomorrow", () => tomorrowPart(tenantId, now, scope)),
    part(tenantId, "pending", () => pendingPart(tenantId, now, scope)),
  ]);
  return {
    at: now,
    activeSystems: activeSystems ?? [],
    sales,
    quietCustomers,
    lowStock,
    receivables,
    tomorrow,
    pending: pending ?? { approvalsAged: 0, leavesAged: 0, shopOrders: 0 },
  };
}

// ─────────────────────────── สิทธิ์ของผู้ดู ───────────────────────────

/** ส่วนของ digest → ระบบ (โมดูลของระดับเลขา) */
export type DigestSystem = "pos" | "account" | "crm" | "inventory" | "booking" | "approval" | "hr" | "shop";

/**
 * ผู้ดูอ่านข้อมูลของระบบนี้ได้ไหม — คีย์เดียวกับประตูเว็บ/เครื่องมือของข้อมูลนั้น (ตัวตัดสินของโมดูล)
 *   ยอดขาย = `pos.report.view` (เครื่องมือ sales_summary ของทะเบียน POS) · ลูกหนี้ = `account.doc.view` · ลูกค้า CRM = `crm.contact.read` ·
 *   คลัง = `canReadInventory` · นัด/ออเดอร์ร้านออนไลน์ = มีสาขาที่เปิดได้ (ประตูเว็บ requireUnit) ·
 *   คำขออนุมัติ = `approval.request.decide` (ตัวเลขรวมทั้งร้าน — ผู้ตัดสินเท่านั้น) · ใบลา = `hr.leave.read`
 */
export function canReadSystem(m: MembershipCtx, system: DigestSystem, userId = ""): boolean {
  switch (system) {
    case "pos":
      return membershipCan(m, { module: "pos", action: "pos.report.view" }, userId);
    case "account":
      return membershipCan(m, { module: "account", action: "account.doc.view" }, userId);
    case "crm":
      return membershipCan(m, { module: "crm", action: "crm.contact.read" }, userId);
    case "inventory":
      return canReadInventory(m);
    case "booking":
    case "shop": {
      const b = actorBranches({ kind: "member", tenantId: "", userId, membership: m });
      return b === null || b.length > 0;
    }
    case "approval":
      return evaluate(m, { module: "approval", action: "approval.request.decide" });
    case "hr":
      return membershipCan(m, { module: "hr", action: "hr.leave.read" }, userId);
  }
}

/** ผู้ดูเห็นระบบนี้ใน digest/ข้อเสนอไหม = สิทธิ์ของผู้ดู ∩ ระดับเลขาของร้านไม่ใช่ OFF */
export function viewerSees(m: MembershipCtx, userId: string, access: AccessMap | undefined, system: DigestSystem): boolean {
  if (!canReadSystem(m, system, userId)) return false;
  return access ? levelVerdict(access, system, false).ok : true;
}

/** digest ที่ตัดส่วนที่ผู้ดูไม่เห็นออก (pure) */
export function digestForViewer(d: Digest, m: MembershipCtx, userId: string, access?: AccessMap): Digest {
  const sees = (s: DigestSystem) => viewerSees(m, userId, access, s);
  return {
    ...d,
    sales: sees("pos") ? d.sales : null,
    receivables: sees("account") ? d.receivables : null,
    quietCustomers: sees("crm") ? d.quietCustomers : null,
    lowStock: sees("inventory") ? d.lowStock : null,
    tomorrow: sees("booking") ? d.tomorrow : null,
    pending: {
      approvalsAged: sees("approval") ? d.pending.approvalsAged : 0,
      leavesAged: sees("hr") ? d.pending.leavesAged : 0,
      shopOrders: sees("shop") ? d.pending.shopOrders : 0,
    },
  };
}

// ─────────────────────────── บล็อกข้อความ ───────────────────────────

/** ข้อความจากผู้ใช้ (ชื่อสินค้า/ลูกค้า) → บรรทัดเดียว ไม่มีอักขระควบคุม ≤ 30 ตัว */
function cleanText(s: unknown): string {
  // eslint-disable-next-line no-control-regex
  const one = String(s ?? "").replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, " ").replace(/\s+/g, " ").trim();
  const chars = Array.from(one);
  return chars.length > NAME_MAX ? `${chars.slice(0, NAME_MAX).join("")}…` : one;
}

const baht = (satang: number) => (satang / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 });
const hm = (d: Date) => {
  const t = bkkParts(d);
  return `${String(t.h).padStart(2, "0")}:${String(t.mi).padStart(2, "0")}`;
};

/**
 * digest → bullet ไทย (≤ 1,200 ตัวอักษร ≈ ≤ 600 token) · ส่วน null ไม่พิมพ์ · ตัวเลขศูนย์ของ pending ไม่พิมพ์ ·
 * ไม่มี PII (ลูกค้าเงียบ = จำนวนเท่านั้น) · ไม่มีอะไรให้พิมพ์ = ""
 */
export function digestBlock(d: Digest): string {
  const lines: string[] = [];
  if (d.sales) {
    const s = d.sales;
    lines.push(`- ยอดขายวันนี้ ${baht(s.todaySatang)} บาท (${s.todayCount} บิล) · 7 วัน ${baht(s.d7Satang)} บาท (${s.d7Count} บิล) · 30 วัน ${baht(s.d30Satang)} บาท (${s.d30Count} บิล)`);
  }
  if (d.receivables) {
    const r = d.receivables;
    lines.push(
      r.count > 0
        ? `- ลูกหนี้ค้างรับ ${r.count} ใบ รวม ${baht(r.totalSatang)} บาท${r.overdueCount > 0 ? ` (เลยกำหนดชำระ ${r.overdueCount} ใบ)` : ""}`
        : "- ไม่มีลูกหนี้ค้างรับ",
    );
  }
  if (d.quietCustomers) {
    lines.push(`- ลูกค้าเงียบ (ไม่มีกิจกรรม ${QUIET_DAYS} วันขึ้นไป) ${d.quietCustomers.count} ราย`);
  }
  if (d.lowStock) {
    const l = d.lowStock;
    lines.push(
      l.count > 0
        ? `- สต็อกต่ำกว่าจุดสั่งซื้อ ${l.count} รายการ${l.sample.length > 0 ? ` (เช่น ${l.sample.join(", ")})` : ""}`
        : "- ไม่มีสินค้าต่ำกว่าจุดสั่งซื้อ",
    );
  }
  if (d.tomorrow) {
    const t = d.tomorrow;
    lines.push(t.appointments > 0 ? `- พรุ่งนี้มีนัด ${t.appointments} นัด${t.firstAt ? ` (นัดแรก ${hm(t.firstAt)} น.)` : ""}` : "- พรุ่งนี้ยังไม่มีนัด");
  }
  const p = d.pending;
  const pend = [
    p.approvalsAged > 0 ? `คำขออนุมัติค้างเกิน ${AGED_DAYS} วัน ${p.approvalsAged} รายการ` : "",
    p.leavesAged > 0 ? `ใบลารออนุมัติเกิน ${AGED_DAYS} วัน ${p.leavesAged} ใบ` : "",
    p.shopOrders > 0 ? `ออเดอร์ออนไลน์รอชำระ ${p.shopOrders} รายการ` : "",
  ].filter(Boolean);
  if (pend.length > 0) lines.push(`- งานค้าง: ${pend.join(" · ")}`);
  if (lines.length === 0) return "";
  const out = [`- ข้อมูล ณ ${hm(d.at)} น. (เวลาไทย)`, ...lines].join("\n");
  return out.length > BLOCK_MAX ? `${out.slice(0, BLOCK_MAX - 1)}…` : out;
}

// ─────────────────────────── cache 10 นาที ───────────────────────────

const cache = new Map<string, { exp: number; d: Digest }>();

/** digest ของร้านผ่าน cache 10 นาที (ต่อร้าน+ขอบเขตผู้ดู · ในหน่วยความจำของ process) — R-Z14: คีย์รวม userId + ชุดสาขา */
export async function cachedDigest(tenantId: string, scope: DigestScope = WHOLE_SHOP): Promise<Digest> {
  const nowMs = Date.now();
  const key = `${tenantId}|${scopeKey(scope)}`;
  const hit = cache.get(key);
  if (hit && hit.exp > nowMs) return hit.d;
  const d = await computeDigest(tenantId, new Date(nowMs), scope);
  if (cache.size >= CACHE_MAX) {
    for (const [k, v] of cache) if (v.exp <= nowMs) cache.delete(k);
    if (cache.size >= CACHE_MAX) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
  }
  cache.set(key, { exp: nowMs + DIGEST_CACHE_MS, d });
  return d;
}

/**
 * digest ของผู้ดู (R-Z14) — นับตามสาขา/การมองเห็นของเขา แล้วตัดส่วนที่อ่านไม่ได้/ระดับเลขา OFF (`digestForViewer`)
 *   `now` ส่งมา = คำนวณสด (ข้อสอบ) · ไม่ส่ง = cache 10 นาทีของผู้ดูคนนี้
 */
export async function viewerDigest(tenantId: string, m: MembershipCtx, userId: string, access?: AccessMap, now?: Date): Promise<Digest> {
  const scope = await viewerScope(tenantId, m, userId);
  const d = now ? await computeDigest(tenantId, now, scope) : await cachedDigest(tenantId, scope);
  return digestForViewer(d, m, userId, access);
}

/**
 * บล็อก digest ของร้าน (cache 10 นาที) — "" เมื่อทุกส่วน null/ว่าง
 * `viewer` (ไม่บังคับ): ตัดส่วนที่ผู้ดูไม่มีสิทธิ์อ่าน/ระดับเลขา OFF · ผู้กระทำที่ไม่ใช่คนในร้าน (คีย์/งานภายใน) = ""
 */
export async function digestBlockFor(tenantId: string, viewer?: { actor: AiActor; access?: AccessMap }): Promise<string> {
  if (viewer && viewer.actor.kind !== "member") return "";
  if (!viewer || viewer.actor.kind !== "member") return digestBlock(await cachedDigest(tenantId));
  return digestBlock(await viewerDigest(tenantId, viewer.actor.membership, viewer.actor.userId, viewer.access));
}

/** ข้อสอบเท่านั้น — ล้าง cache */
export function __resetDigestCacheForTests(): void {
  cache.clear();
}
