// contacts-overview.ts — data layer หน้า "ดูภาพรวมผู้ติดต่อ" (WO 3.2 · §7.4)
// ลูกค้าใหม่เดือนนี้ · ลูกค้าที่กลับมาซื้อ · 10 อันดับยอดซื้อ · 10 อันดับค้างชำระ · ผู้ขาย 10 อันดับยอดจ่าย
// เหมือน dashboard.ts/overview.ts (WO 2.1/2.3): ห้าม import prisma ตรง (F5) · ทุก query ผูก tenantDb(ctx)

import { tenantDb } from "@/lib/core/db";

export type Ctx = { tenantId: string; systemId: string };
export type QueryMeter = { count: number };
function bump(meter: QueryMeter | undefined, n = 1) {
  if (meter) meter.count += n;
}
type Db = ReturnType<typeof tenantDb>;
function dbOf(ctx: Ctx, meter?: QueryMeter): Db {
  const db = tenantDb({ tenantId: ctx.tenantId, systemId: ctx.systemId });
  if (!meter) return db;
  return db.$extends({
    query: { $allModels: { async $allOperations({ args, query }) { meter.count += 1; return query(args); } } },
  }) as unknown as Db;
}

export type ContactRankRow = { contactId: string; name: string; code: string; amountSatang: number; count?: number };

export type ContactsOverview = {
  newCustomersThisMonth: number;
  returningCustomers: number;
  topCustomersByPurchases: ContactRankRow[];
  topOutstanding: ContactRankRow[];
  topVendorsByPayments: ContactRankRow[];
};

/** เดือนปฏิทินไทย (Asia/Bangkok = UTC+7 คงที่ ไม่มี DST) — เหมือน presetRangeBkk ที่อื่นในโมดูล */
function monthStartBkk(now: Date): Date {
  const bkk = new Date(now.getTime() + 7 * 3600_000);
  const y = bkk.getUTCFullYear();
  const m = bkk.getUTCMonth();
  return new Date(Date.UTC(y, m, 1, -7, 0, 0)); // เที่ยงคืนวันที่ 1 ตามเวลาไทย = 17:00 UTC ของวันก่อนหน้า
}
function addMonthsBkk(d: Date, n: number): Date {
  const bkk = new Date(d.getTime() + 7 * 3600_000);
  return new Date(Date.UTC(bkk.getUTCFullYear(), bkk.getUTCMonth() + n, 1, -7, 0, 0));
}

/**
 * WO 3.2 รอบแก้ 2 (Fable QC): เดิมนับ "ลูกค้าใหม่เดือนนี้" จาก AccountContact.createdAt ซึ่งเป็นเวลาที่ seed
 * สร้างข้อมูลจริง (ไม่ใช่วันที่ทางธุรกิจ) → เลขเลื่อนไปเรื่อย ๆ ตามวันที่รัน seed จริง (oracle เน่าตาม BLUEPRINT)
 * แก้ให้ยึด "วันที่เอกสารซื้อขายใบแรกที่อนุมัติ/ชำระแล้ว" (issueDate ของเอกสารที่ไม่ใช่ร่าง/ยกเลิก) แทน — วันที่
 * นี้คงที่ตาม fixture (ทั้งหมดอยู่ในปี 2026 ตาม D() ในสคริปต์ seed) ไม่ขยับตามเวลาที่รัน seed จริง
 * "กลับมาซื้อ" = มีเอกสารแบบนี้ ≥2 ใบ โดยอย่างน้อย 1 ใบอยู่ในเดือนนี้
 */
export async function loadContactsOverview(ctx: Ctx, meter?: QueryMeter, now: Date = new Date()): Promise<ContactsOverview> {
  const db = dbOf(ctx, meter);
  const monthStart = monthStartBkk(now);
  const monthEnd = addMonthsBkk(now, 1);

  const [allContacts, purchaseAgg, outstandingAgg, vendorPayments, thisMonthContactIds] = await Promise.all([
    db.accountContact.findMany({
      select: { id: true, name: true, kind: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    db.accountDocument.groupBy({
      by: ["contactId"],
      where: { direction: "OUT", contactId: { not: null }, status: { notIn: ["DRAFT", "CANCELLED", "VOIDED"] } },
      _sum: { grandTotal: true },
      _count: { _all: true },
      _min: { issueDate: true },
    }),
    db.accountDocument.groupBy({
      by: ["contactId"],
      where: { direction: "OUT", contactId: { not: null }, status: { in: ["AWAITING_PAYMENT", "PARTIAL"] } },
      _sum: { grandTotal: true, paidTotal: true },
    }),
    db.accountDocumentPayment.findMany({
      where: { voidedAt: null, document: { direction: "IN", contactId: { not: null } } },
      select: { amount: true, document: { select: { contactId: true } } },
    }),
    // WO 3.2 รอบแก้ 2 — เซตผู้ติดต่อที่มีเอกสาร (ไม่ร่าง/ไม่ยกเลิก) ออกในเดือนนี้ (สำหรับ "กลับมาซื้อ")
    db.accountDocument.findMany({
      where: {
        direction: "OUT",
        contactId: { not: null },
        status: { notIn: ["DRAFT", "CANCELLED", "VOIDED"] },
        issueDate: { gte: monthStart, lt: monthEnd },
      },
      select: { contactId: true },
      distinct: ["contactId"],
    }),
  ]);

  const codeOf = new Map<string, string>();
  const nameOf = new Map<string, string>();
  allContacts.forEach((c, i) => {
    codeOf.set(c.id, `C${String(i + 1).padStart(5, "0")}`);
    nameOf.set(c.id, c.name);
  });

  const newCustomersThisMonth = purchaseAgg.filter((r) => {
    const first = r._min.issueDate;
    return !!first && first.getTime() >= monthStart.getTime() && first.getTime() < monthEnd.getTime();
  }).length;

  const boughtThisMonth = new Set(thisMonthContactIds.map((r) => r.contactId).filter((x): x is string => !!x));
  const returningCustomers = purchaseAgg.filter((r) => (r._count._all ?? 0) >= 2 && r.contactId && boughtThisMonth.has(r.contactId)).length;

  const rank = (id: string | null, amount: number, count?: number): ContactRankRow | null => {
    if (!id || !nameOf.has(id)) return null;
    return { contactId: id, name: nameOf.get(id)!, code: codeOf.get(id) ?? "—", amountSatang: amount, count };
  };

  const topCustomersByPurchases = purchaseAgg
    .map((r) => rank(r.contactId, r._sum.grandTotal ?? 0, r._count._all))
    .filter((r): r is ContactRankRow => !!r)
    .sort((a, b) => b.amountSatang - a.amountSatang)
    .slice(0, 10);

  const topOutstanding = outstandingAgg
    .map((r) => rank(r.contactId, Math.max(0, (r._sum.grandTotal ?? 0) - (r._sum.paidTotal ?? 0))))
    .filter((r): r is ContactRankRow => !!r)
    .filter((r) => r.amountSatang > 0)
    .sort((a, b) => b.amountSatang - a.amountSatang)
    .slice(0, 10);

  const vendorSum = new Map<string, number>();
  for (const p of vendorPayments) {
    const cid = p.document.contactId;
    if (!cid) continue;
    vendorSum.set(cid, (vendorSum.get(cid) ?? 0) + p.amount);
  }
  const topVendorsByPayments = [...vendorSum.entries()]
    .map(([id, amount]) => rank(id, amount))
    .filter((r): r is ContactRankRow => !!r)
    .sort((a, b) => b.amountSatang - a.amountSatang)
    .slice(0, 10);

  bump(meter, 0); // groupBy/findMany ข้างบนนับผ่าน $allOperations แล้วทั้งหมด — ไม่มี query เพิ่มหลังจากนี้

  return { newCustomersThisMonth, returningCustomers, topCustomersByPurchases, topOutstanding, topVendorsByPayments };
}
