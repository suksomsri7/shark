// เฉลย "หน้าหลัก + ภาพรวม" (WO 2.1) — เขียนคีย์ `dashboard` ต่อท้าย scripts/acc-v2-expected.json
//
// รัน:  QC_ENV_FILE=.env.qc pnpm tsx scripts/acc-v2-expected-dashboard.mts
//
// 🔴 กติกาสำคัญ: ไฟล์นี้ **ห้ามเรียก src/lib/modules/account/dashboard.ts** เด็ดขาด
//    ตัวเลขทุกตัวคำนวณใหม่ด้วย SQL ดิบคนละสำนวน (SUM(CASE WHEN …) ใน SQL) ส่วน dashboard.ts
//    รวมยอดฝั่ง JS จาก aggregate ต่อบัญชี ⇒ ข้อสอบ qc-acc-v2-dashboard เท่ากับการเทียบ
//    "สองการคำนวณที่เขียนแยกกัน" ไม่ใช่การเทียบโค้ดกับตัวเอง
//
// 🔴 คอลัมน์เวลาของ Prisma เป็น TIMESTAMP(3) ไม่มีโซน (เก็บ UTC) ⇒ แปลงเป็นวันไทยต้อง
//    (col AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Bangkok' — ถ้าเขียน AT TIME ZONE 'Asia/Bangkok'
//    เฉย ๆ จะเลื่อนผิดทาง −7 ชม. (เจอจริงตอน WO 2.1 — วันที่ 1 ก.ย. กลายเป็น 31 ส.ค.)
//
// 🔴 เวลาอ้างอิงตรึงไว้ที่ QC.today 12:00 (เวลาไทย) — เฉลยจึงไม่เน่าตามวันที่รันจริง
//    (ค่า now ถูกเขียนลงเฉลยด้วย · ข้อสอบต้องส่ง now ตัวเดียวกันเข้าไปทุกฟังก์ชัน)
//
// ⚠️ `seed-acc-v2-qc.mts` เขียนทับ acc-v2-expected.json ทั้งไฟล์ ⇒ seed ใหม่แล้วต้องรันไฟล์นี้ซ้ำ

import { readFileSync, writeFileSync } from "node:fs";

const accEnv = (await import("./acc-v2-env.mts" as string)) as {
  loadQcEnv: () => { databaseUrl: string; host: string };
  QC: { expectedPath: string; today: string; tenantName: string };
};
const { loadQcEnv, QC } = accEnv;
const { host } = loadQcEnv();
console.log(`🗄️  DB QC: ${host}`);

const { prisma } = await import("@/lib/core/db");

const E = JSON.parse(readFileSync(QC.expectedPath, "utf8")) as Record<string, unknown> & {
  tenantId: string;
  systemId: string;
};
const T = E.tenantId;
const S = E.systemId;
const YEAR = Number(QC.today.slice(0, 4));
const MONTH = QC.today.slice(0, 7);
const NOW_ISO = `${QC.today}T12:00:00+07:00`;
const NOW = new Date(NOW_ISO);
const YEAR_FROM = new Date(`${YEAR}-01-01T00:00:00+07:00`);
const YEAR_TO = new Date(`${YEAR + 1}-01-01T00:00:00+07:00`);
const n = (x: unknown) => Number(x ?? 0);

// ─────────────── 1) series 12 เดือน + ปีก่อน (SUM(CASE WHEN …) ก้อนเดียว) ───────────────
const seriesRows = await prisma.$queryRaw<Array<{ pk: string; revenue: bigint; expense: bigint }>>`
  SELECT e."periodKey" AS pk,
         SUM(CASE WHEN l."type" = 'INCOME' THEN jl."credit" - jl."debit" ELSE 0 END)::bigint AS revenue,
         SUM(CASE WHEN l."type" IN ('EXPENSE','COGS') THEN jl."debit" - jl."credit" ELSE 0 END)::bigint AS expense
    FROM "AccountJournalLine" jl
    JOIN "AccountJournalEntry" e ON e."id" = jl."entryId"
    JOIN "AccountLedger" l ON l."id" = jl."accountId"
   WHERE jl."tenantId" = ${T} AND jl."systemId" = ${S}
     AND (e."periodKey" LIKE ${`${YEAR}-%`} OR e."periodKey" LIKE ${`${YEAR - 1}-%`})
   GROUP BY 1 ORDER BY 1`;

const months = Array.from({ length: 12 }, (_, i) => `${YEAR}-${String(i + 1).padStart(2, "0")}`).map((pk) => {
  const r = seriesRows.find((x) => x.pk === pk);
  const revenue = n(r?.revenue);
  const expense = n(r?.expense);
  return { periodKey: pk, revenue, expense, profit: revenue - expense };
});
const prevRows = seriesRows.filter((r) => r.pk.startsWith(`${YEAR - 1}-`));
const prevYear = {
  revenue: prevRows.reduce((s, r) => s + n(r.revenue), 0),
  expense: prevRows.reduce((s, r) => s + n(r.expense), 0),
  profit: 0,
};
prevYear.profit = prevYear.revenue - prevYear.expense;
const total = {
  revenue: months.reduce((s, m) => s + m.revenue, 0),
  expense: months.reduce((s, m) => s + m.expense, 0),
  profit: 0,
};
total.profit = total.revenue - total.expense;
const bp = (cur: number, prev: number) => (prev === 0 ? null : Math.round(((cur - prev) / Math.abs(prev)) * 10000));

// ─────────────── 2) หมวดรายได้/ค่าใช้จ่ายของเดือนนี้ ───────────────
async function categories(kind: "income" | "expense", periodKey: string) {
  const rows =
    kind === "income"
      ? await prisma.$queryRaw<Array<{ code: string; name: string; amount: bigint }>>`
          SELECT l."code", l."name", SUM(jl."credit" - jl."debit")::bigint AS amount
            FROM "AccountJournalLine" jl
            JOIN "AccountJournalEntry" e ON e."id" = jl."entryId"
            JOIN "AccountLedger" l ON l."id" = jl."accountId"
           WHERE jl."tenantId" = ${T} AND jl."systemId" = ${S}
             AND e."periodKey" = ${periodKey} AND l."type" = 'INCOME'
           GROUP BY 1, 2 HAVING SUM(jl."credit" - jl."debit") <> 0
           ORDER BY 3 DESC, 1`
      : await prisma.$queryRaw<Array<{ code: string; name: string; amount: bigint }>>`
          SELECT l."code", l."name", SUM(jl."debit" - jl."credit")::bigint AS amount
            FROM "AccountJournalLine" jl
            JOIN "AccountJournalEntry" e ON e."id" = jl."entryId"
            JOIN "AccountLedger" l ON l."id" = jl."accountId"
           WHERE jl."tenantId" = ${T} AND jl."systemId" = ${S}
             AND e."periodKey" = ${periodKey} AND l."type" IN ('EXPENSE','COGS')
           GROUP BY 1, 2 HAVING SUM(jl."debit" - jl."credit") <> 0
           ORDER BY 3 DESC, 1`;
  const all = rows.map((r) => ({ accountCode: r.code, name: r.name, amount: n(r.amount) }));
  return { total: all.reduce((s, r) => s + r.amount, 0), rows: all };
}
const income = await categories("income", MONTH);
const expense = await categories("expense", MONTH);

// ─────────────── 3) เงินคุณอยู่ไหน (ยอดคงเหลือ + เคลื่อนไหวเดือนนี้ ต่อช่องทาง) ───────────────
const cashRows = await prisma.$queryRaw<
  Array<{ id: string; name: string; type: string; code: string | null; pinned: boolean; balance: bigint; delta: bigint }>
>`
  SELECT f."id", f."name", f."type"::text AS "type", l."code", f."pinned",
         COALESCE(SUM(jl."debit" - jl."credit"), 0)::bigint AS "balance",
         COALESCE(SUM(CASE WHEN e."periodKey" = ${MONTH} THEN jl."debit" - jl."credit" ELSE 0 END), 0)::bigint AS "delta"
    FROM "AccountFinance" f
    LEFT JOIN "AccountLedger" l ON l."id" = f."ledgerAccountId"
    LEFT JOIN "AccountJournalLine" jl ON jl."accountId" = f."ledgerAccountId" AND jl."systemId" = f."systemId"
    LEFT JOIN "AccountJournalEntry" e ON e."id" = jl."entryId"
   WHERE f."tenantId" = ${T} AND f."systemId" = ${S} AND f."archivedAt" IS NULL
   GROUP BY 1, 2, 3, 4, 5
   ORDER BY 4`;
const cash = {
  total: cashRows.reduce((s, r) => s + n(r.balance), 0),
  accounts: cashRows.map((r) => ({
    id: r.id,
    code: r.code ?? "",
    name: r.name,
    type: r.type,
    balance: n(r.balance),
    monthDelta: n(r.delta),
    pinned: r.pinned,
  })),
};

// ─────────────── 4) ค้างรับ/ค้างจ่าย + อายุหนี้ 5 ช่วง (คิดวันจาก SQL) ───────────────
const arapRows = await prisma.$queryRaw<
  Array<{
    dir: string;
    cnt: bigint;
    amount: bigint;
    overdue_cnt: bigint;
    overdue_amount: bigint;
    contacts: bigint;
    not_due: bigint;
    d1_30: bigint;
    d31_60: bigint;
    d61_90: bigint;
    d90: bigint;
    aging_total: bigint;
  }>
>`
  WITH open_docs AS (
    SELECT d."id", d."direction"::text AS dir, d."contactId", d."status"::text AS status,
           d."grandTotal", d."paidTotal", d."dueDate", d."issueDate",
           COALESCE((SELECT SUM(cn."grandTotal") FROM "AccountDocument" cn
                      WHERE cn."tenantId" = d."tenantId" AND cn."systemId" = d."systemId"
                        AND cn."docType" = 'CREDIT_NOTE' AND cn."sourceDocId" = d."id"
                        AND cn."status" NOT IN ('DRAFT','VOIDED','CANCELLED')), 0) AS cn_total
      FROM "AccountDocument" d
     WHERE d."tenantId" = ${T} AND d."systemId" = ${S}
       AND d."status" IN ('AWAITING_PAYMENT','PARTIAL')
       AND d."voidedAt" IS NULL
       AND d."docType" <> 'BILLING_NOTE'
  ), calc AS (
    SELECT dir, "contactId",
           GREATEST(0, "grandTotal" - "paidTotal" - CASE WHEN dir = 'OUT' THEN cn_total ELSE 0 END) AS outstanding,
           GREATEST(0, "grandTotal" - "paidTotal") AS aging_amount,
           ("dueDate" IS NOT NULL AND "dueDate" < ${NOW}) AS is_overdue,
           FLOOR(EXTRACT(EPOCH FROM (${NOW}::timestamptz - COALESCE("dueDate", "issueDate"))) / 86400) AS days
      FROM open_docs
  )
  SELECT dir,
         COUNT(*)::bigint AS cnt,
         SUM(outstanding)::bigint AS amount,
         COUNT(*) FILTER (WHERE is_overdue)::bigint AS overdue_cnt,
         COALESCE(SUM(outstanding) FILTER (WHERE is_overdue), 0)::bigint AS overdue_amount,
         COUNT(DISTINCT "contactId")::bigint AS contacts,
         COALESCE(SUM(aging_amount) FILTER (WHERE aging_amount > 0 AND days <= 0), 0)::bigint AS not_due,
         COALESCE(SUM(aging_amount) FILTER (WHERE aging_amount > 0 AND days > 0 AND days <= 30), 0)::bigint AS d1_30,
         COALESCE(SUM(aging_amount) FILTER (WHERE aging_amount > 0 AND days > 30 AND days <= 60), 0)::bigint AS d31_60,
         COALESCE(SUM(aging_amount) FILTER (WHERE aging_amount > 0 AND days > 60 AND days <= 90), 0)::bigint AS d61_90,
         COALESCE(SUM(aging_amount) FILTER (WHERE aging_amount > 0 AND days > 90), 0)::bigint AS d90,
         COALESCE(SUM(aging_amount) FILTER (WHERE aging_amount > 0), 0)::bigint AS aging_total
    FROM calc GROUP BY 1`;

const side = (dir: "OUT" | "IN") => {
  const r = arapRows.find((x) => x.dir === dir);
  return {
    count: n(r?.cnt),
    amount: n(r?.amount),
    overdueCount: n(r?.overdue_cnt),
    overdueAmount: n(r?.overdue_amount),
    contactCount: n(r?.contacts),
    aging: {
      notDueSatang: n(r?.not_due),
      d1_30Satang: n(r?.d1_30),
      d31_60Satang: n(r?.d31_60),
      d61_90Satang: n(r?.d61_90),
      d90plusSatang: n(r?.d90),
      totalSatang: n(r?.aging_total),
    },
  };
};

// ─────────────── 5) เอกสารที่ออก (ใบแจ้งหนี้ + ใบเสนอราคา ปีนี้) ───────────────
async function issued(docType: string) {
  const rows = await prisma.$queryRaw<Array<{ status: string; cnt: bigint; amount: bigint }>>`
    SELECT d."status"::text AS status, COUNT(*)::bigint AS cnt, SUM(d."grandTotal")::bigint AS amount
      FROM "AccountDocument" d
     WHERE d."tenantId" = ${T} AND d."systemId" = ${S}
       AND d."docType"::text = ${docType}
       AND d."status" NOT IN ('DRAFT','CANCELLED','VOIDED')
       AND d."issueDate" >= ${YEAR_FROM} AND d."issueDate" < ${YEAR_TO}
     GROUP BY 1`;
  const byStatus: Record<string, { count: number; amount: number }> = {};
  for (const r of rows) byStatus[r.status] = { count: n(r.cnt), amount: n(r.amount) };
  return {
    total: {
      count: rows.reduce((s, r) => s + n(r.cnt), 0),
      amount: rows.reduce((s, r) => s + n(r.amount), 0),
    },
    byStatus,
  };
}
const issuedInvoice = await issued("INVOICE");
const issuedQuotation = await issued("QUOTATION");

// ─────────────── 6) อันดับลูกค้า/ผู้ขาย/สินค้า/หมวดค่าใช้จ่าย ───────────────
const topContactRows = await prisma.$queryRaw<
  Array<{ dir: string; contactId: string | null; name: string | null; cnt: bigint; amount: bigint }>
>`
  SELECT d."direction"::text AS dir, d."contactId", c."name",
         COUNT(*)::bigint AS cnt, SUM(d."grandTotal")::bigint AS amount
    FROM "AccountDocument" d
    LEFT JOIN "AccountContact" c ON c."id" = d."contactId"
   WHERE d."tenantId" = ${T} AND d."systemId" = ${S}
     AND d."status" NOT IN ('DRAFT','CANCELLED','VOIDED')
     AND d."issueDate" >= ${YEAR_FROM} AND d."issueDate" < ${YEAR_TO}
     AND ( (d."direction" = 'OUT' AND (d."docType" = 'INVOICE' OR (d."docType" = 'RECEIPT' AND d."sourceDocId" IS NULL)))
        OR (d."direction" = 'IN'  AND d."docType" IN ('PURCHASE','EXPENSE')) )
   GROUP BY 1, 2, 3
   ORDER BY 5 DESC`;
const topSide = (dir: "OUT" | "IN") =>
  topContactRows
    .filter((r) => r.dir === dir)
    .map((r) => ({ contactId: r.contactId, name: r.name ?? "ไม่ระบุคู่ค้า", docCount: n(r.cnt), amount: n(r.amount) }));

const topProductRows = await prisma.$queryRaw<
  Array<{ productId: string | null; name: string; qty: string; amount: bigint }>
>`
  SELECT ln."productId", ln."description" AS name, SUM(ln."qty")::text AS qty, SUM(ln."amount")::bigint AS amount
    FROM "AccountDocumentLine" ln
    JOIN "AccountDocument" d ON d."id" = ln."documentId"
   WHERE ln."tenantId" = ${T} AND ln."systemId" = ${S}
     AND d."direction" = 'OUT'
     AND (d."docType" = 'INVOICE' OR (d."docType" = 'RECEIPT' AND d."sourceDocId" IS NULL))
     AND d."status" NOT IN ('DRAFT','CANCELLED','VOIDED')
     AND d."issueDate" >= ${YEAR_FROM} AND d."issueDate" < ${YEAR_TO}
   GROUP BY 1, 2
   ORDER BY 4 DESC`;

const expenseCatRows = await prisma.$queryRaw<Array<{ code: string; name: string; amount: bigint }>>`
  SELECT l."code", l."name", SUM(jl."debit" - jl."credit")::bigint AS amount
    FROM "AccountJournalLine" jl
    JOIN "AccountJournalEntry" e ON e."id" = jl."entryId"
    JOIN "AccountLedger" l ON l."id" = jl."accountId"
   WHERE jl."tenantId" = ${T} AND jl."systemId" = ${S}
     AND e."periodKey" = ${MONTH} AND l."type" IN ('EXPENSE','COGS')
   GROUP BY 1, 2 HAVING SUM(jl."debit" - jl."credit") <> 0
   ORDER BY 3 DESC, 1`;

// ─────────────── 7) งานที่รอคุณ ───────────────
const pendingRow = (
  await prisma.$queryRaw<
    Array<{ qt: bigint; po: bigint; dep: bigint; ptx: bigint; rec: bigint }>
  >`
    SELECT COUNT(*) FILTER (WHERE d."docType" = 'QUOTATION' AND d."status" = 'AWAITING_ACCEPT')::bigint AS qt,
           COUNT(*) FILTER (WHERE d."docType" IN ('PURCHASE_ORDER','ASSET_PURCHASE_ORDER') AND d."status" = 'AWAITING_APPROVAL')::bigint AS po,
           COUNT(*) FILTER (WHERE d."docType" IN ('DEPOSIT_RECEIPT','DEPOSIT_PAYMENT') AND d."status" = 'AWAITING_DEDUCT')::bigint AS dep,
           COUNT(*) FILTER (WHERE d."docType" = 'PURCHASE_TAX_INVOICE' AND d."status" = 'AWAITING_RECEIVE')::bigint AS ptx,
           COUNT(*) FILTER (WHERE d."source" = 'RECURRING' AND d."status" = 'DRAFT')::bigint AS rec
      FROM "AccountDocument" d
     WHERE d."tenantId" = ${T} AND d."systemId" = ${S}`
)[0];
const needsReviewRow = (
  await prisma.$queryRaw<Array<{ c: bigint }>>`
    SELECT COUNT(*)::bigint AS c FROM "AccountJournalEntry"
     WHERE "tenantId" = ${T} AND "systemId" = ${S} AND "needsReview" = true`
)[0];
const pending = {
  quotationAwaitingAccept: n(pendingRow?.qt),
  poAwaitingApproval: n(pendingRow?.po),
  depositAwaitingDeduct: n(pendingRow?.dep),
  needsReview: n(needsReviewRow?.c),
  purchaseTaxAwaiting: n(pendingRow?.ptx),
  recurringDraftsAwaiting: n(pendingRow?.rec),
  total: 0,
};
pending.total =
  pending.quotationAwaitingAccept +
  pending.poAwaitingApproval +
  pending.depositAwaitingDeduct +
  pending.needsReview +
  pending.purchaseTaxAwaiting +
  pending.recurringDraftsAwaiting;

// ─────────────── 8) เอกสารล่าสุด (ขอบเขตเวลาไว้ให้ข้อสอบตรวจว่าเป็น 6 ใบล่าสุดจริง) ───────────────
const recentRows = await prisma.$queryRaw<Array<{ id: string; docNo: string | null; updatedAt: Date }>>`
  SELECT d."id", d."docNo", d."updatedAt"
    FROM "AccountDocument" d
   WHERE d."tenantId" = ${T} AND d."systemId" = ${S}
   ORDER BY d."updatedAt" DESC
   LIMIT 8`;

// ─────────────── 9) ปฏิทินเงินเข้า-ออกเดือนนี้ ───────────────
const MONTH_FROM = new Date(`${MONTH}-01T00:00:00+07:00`);
const MONTH_TO = new Date(
  `${MONTH.endsWith("-12") ? Number(MONTH.slice(0, 4)) + 1 : MONTH.slice(0, 4)}-${
    MONTH.endsWith("-12") ? "01" : String(Number(MONTH.slice(5, 7)) + 1).padStart(2, "0")
  }-01T00:00:00+07:00`,
);
const payRows = await prisma.$queryRaw<Array<{ day: string; dir: string; c: bigint; amt: bigint }>>`
  SELECT to_char((p."paidAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD') AS day,
         d."direction"::text AS dir, COUNT(*)::bigint AS c, SUM(p."amount")::bigint AS amt
    FROM "AccountDocumentPayment" p
    JOIN "AccountDocument" d ON d."id" = p."documentId"
   WHERE p."tenantId" = ${T} AND p."systemId" = ${S}
     AND p."voidedAt" IS NULL AND p."financeAccountId" IS NOT NULL
     AND p."paidAt" >= ${MONTH_FROM} AND p."paidAt" < ${MONTH_TO}
   GROUP BY 1, 2 ORDER BY 1`;
const expectedRows = await prisma.$queryRaw<Array<{ day: string; dir: string; c: bigint; amt: bigint }>>`
  SELECT to_char((d."dueDate" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD') AS day,
         d."direction"::text AS dir, COUNT(*)::bigint AS c, SUM(d."grandTotal" - d."paidTotal")::bigint AS amt
    FROM "AccountDocument" d
   WHERE d."tenantId" = ${T} AND d."systemId" = ${S}
     AND d."voidedAt" IS NULL AND d."status" IN ('AWAITING_PAYMENT','PARTIAL')
     AND d."grandTotal" > d."paidTotal"
     AND d."dueDate" >= ${MONTH_FROM} AND d."dueDate" < ${MONTH_TO}
   GROUP BY 1, 2 ORDER BY 1`;
const overdueTileRows = await prisma.$queryRaw<Array<{ dir: string; c: bigint; amt: bigint }>>`
  SELECT d."direction"::text AS dir, COUNT(*)::bigint AS c, SUM(d."grandTotal" - d."paidTotal")::bigint AS amt
    FROM "AccountDocument" d
   WHERE d."tenantId" = ${T} AND d."systemId" = ${S}
     AND d."voidedAt" IS NULL AND d."status" IN ('AWAITING_PAYMENT','PARTIAL')
     AND d."grandTotal" > d."paidTotal" AND d."dueDate" IS NOT NULL AND d."dueDate" < ${NOW}
   GROUP BY 1`;

const tile = (rows: Array<{ dir: string; c: bigint; amt: bigint }>, dir: "IN" | "OUT") => {
  const r = rows.find((x) => x.dir === dir);
  return { count: n(r?.c), amount: n(r?.amt) };
};
const sumTiles = (rows: Array<{ dir: string; c: bigint; amt: bigint }>, dir: "IN" | "OUT") => {
  const sel = rows.filter((x) => x.dir === dir);
  return { count: sel.reduce((s, r) => s + n(r.c), 0), amount: sel.reduce((s, r) => s + n(r.amt), 0) };
};

// ─────────────── 10) WO 2.3 — ภาพรวมรายรับ/รายจ่าย (แท่งซ้อนสถานะ + เอกสารที่ออกตามชนิด + ลูกหนี้/เจ้าหนี้ที่ติดตาม) ───────────────
// ขอบเขตเอกสารเดียวกับ topCustomers(OUT · INVOICE/RECEIPT ไม่มี sourceDocId)/topVendors(IN · PURCHASE/EXPENSE)
// ด้านบน — ตั้งใจให้ตรงกับ dashboard.ts (SALES_WHERE/PURCHASE_WHERE) เพื่อให้กราฟ+อันดับล่างเป็นเนื้อเดียวกัน
async function monthlyStatusRowsRevenue() {
  return prisma.$queryRaw<Array<{ pk: string; status: string; due: Date | null; amount: bigint }>>`
    SELECT to_char((d."issueDate" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM') AS pk,
           d."status"::text AS status, d."dueDate" AS due, d."grandTotal"::bigint AS amount
      FROM "AccountDocument" d
     WHERE d."tenantId" = ${T} AND d."systemId" = ${S}
       AND d."status" NOT IN ('DRAFT','CANCELLED','VOIDED')
       AND d."issueDate" >= ${YEAR_FROM} AND d."issueDate" < ${YEAR_TO}
       AND d."direction" = 'OUT'
       AND (d."docType" = 'INVOICE' OR (d."docType" = 'RECEIPT' AND d."sourceDocId" IS NULL))`;
}
async function monthlyStatusRowsExpense() {
  return prisma.$queryRaw<Array<{ pk: string; status: string; due: Date | null; amount: bigint }>>`
    SELECT to_char((d."issueDate" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM') AS pk,
           d."status"::text AS status, d."dueDate" AS due, d."grandTotal"::bigint AS amount
      FROM "AccountDocument" d
     WHERE d."tenantId" = ${T} AND d."systemId" = ${S}
       AND d."status" NOT IN ('DRAFT','CANCELLED','VOIDED')
       AND d."issueDate" >= ${YEAR_FROM} AND d."issueDate" < ${YEAR_TO}
       AND d."direction" = 'IN'
       AND d."docType" IN ('PURCHASE','EXPENSE')`;
}

function bucketMonthlyStatus(rows: Array<{ pk: string; status: string; due: Date | null; amount: bigint }>) {
  const monthsOv = Array.from({ length: 12 }, (_, i) => `${YEAR}-${String(i + 1).padStart(2, "0")}`).map((pk) => ({
    periodKey: pk,
    paid: 0,
    awaiting: 0,
    overdue: 0,
    paidCount: 0,
    awaitingCount: 0,
    overdueCount: 0,
  }));
  const byKey = new Map(monthsOv.map((m) => [m.periodKey, m]));
  const total = { paid: 0, awaiting: 0, overdue: 0, paidCount: 0, awaitingCount: 0, overdueCount: 0, grand: 0, grandCount: 0 };
  for (const r of rows) {
    const m = byKey.get(r.pk);
    if (!m) continue;
    const amount = n(r.amount);
    const isOverdueRow = (r.status === "AWAITING_PAYMENT" || r.status === "PARTIAL") && r.due !== null && r.due.getTime() < NOW.getTime();
    const bucket: "paid" | "overdue" | "awaiting" = r.status === "PAID" ? "paid" : isOverdueRow ? "overdue" : "awaiting";
    m[bucket] += amount;
    m[`${bucket}Count` as const] += 1;
    total[bucket] += amount;
    total[`${bucket}Count` as const] += 1;
    total.grand += amount;
    total.grandCount += 1;
  }
  return { months: monthsOv, total };
}

const ovRevenueSeries = bucketMonthlyStatus(await monthlyStatusRowsRevenue());
const ovExpenseSeries = bucketMonthlyStatus(await monthlyStatusRowsExpense());

async function issuedByTypeRows(types: string[]) {
  return prisma.$queryRaw<Array<{ docType: string; cnt: bigint; amount: bigint }>>`
    SELECT d."docType"::text AS "docType", COUNT(*)::bigint AS cnt, SUM(d."grandTotal")::bigint AS amount
      FROM "AccountDocument" d
     WHERE d."tenantId" = ${T} AND d."systemId" = ${S}
       AND d."docType"::text = ANY(${types})
       AND d."status" NOT IN ('DRAFT','CANCELLED','VOIDED')
       AND d."issueDate" >= ${MONTH_FROM} AND d."issueDate" < ${MONTH_TO}
     GROUP BY 1`;
}
const REVENUE_ISSUED_TYPES = ["QUOTATION", "INVOICE", "RECEIPT", "TAX_INVOICE"];
const EXPENSE_ISSUED_TYPES = ["EXPENSE", "PURCHASE", "PURCHASE_ORDER", "ASSET_PURCHASE"];
function issuedTotal(rows: Array<{ docType: string; cnt: bigint; amount: bigint }>, types: string[]) {
  const byType = new Map(rows.map((r) => [r.docType, { count: n(r.cnt), amount: n(r.amount) }]));
  const list = types.map((t) => byType.get(t) ?? { count: 0, amount: 0 });
  return { count: list.reduce((s, r) => s + r.count, 0), amount: list.reduce((s, r) => s + r.amount, 0) };
}
const ovRevenueIssued = issuedTotal(await issuedByTypeRows(REVENUE_ISSUED_TYPES), REVENUE_ISSUED_TYPES);
const ovExpenseIssued = issuedTotal(await issuedByTypeRows(EXPENSE_ISSUED_TYPES), EXPENSE_ISSUED_TYPES);

async function trackedRows(direction: "OUT" | "IN") {
  return prisma.$queryRaw<Array<{ contactId: string; name: string | null; outstanding: bigint; cnt: bigint }>>`
    SELECT d."contactId" AS "contactId", c."name" AS name,
           SUM(GREATEST(0, d."grandTotal" - d."paidTotal"))::bigint AS outstanding,
           COUNT(*)::bigint AS cnt
      FROM "AccountDocument" d
      LEFT JOIN "AccountContact" c ON c."id" = d."contactId"
     WHERE d."tenantId" = ${T} AND d."systemId" = ${S}
       AND d."direction" = ${direction}
       AND d."status" IN ('AWAITING_PAYMENT','PARTIAL')
       AND d."voidedAt" IS NULL
       AND d."docType" <> 'BILLING_NOTE'
       AND d."contactId" IS NOT NULL
     GROUP BY 1, 2
    HAVING SUM(GREATEST(0, d."grandTotal" - d."paidTotal")) > 0
     ORDER BY 3 DESC
     LIMIT 5`;
}
const ovRevenueTracked = (await trackedRows("OUT")).map((r) => ({ contactId: r.contactId, name: r.name, outstanding: n(r.outstanding), count: n(r.cnt) }));
const ovExpenseTracked = (await trackedRows("IN")).map((r) => ({ contactId: r.contactId, name: r.name, outstanding: n(r.outstanding), count: n(r.cnt) }));

const overview = {
  _readme:
    "เฉลยของ WO 2.3 (ดูภาพรวมรายรับ/รายจ่าย §6) — SQL ดิบคนละสำนวนจาก dashboard.ts (monthlyStatusSeries/issuedByType/topTrackedContacts)",
  monthKey: MONTH,
  revenue: { series: ovRevenueSeries, issuedThisMonth: ovRevenueIssued, tracked: ovRevenueTracked },
  expense: { series: ovExpenseSeries, issuedThisMonth: ovExpenseIssued, tracked: ovExpenseTracked },
};

const dashboard = {
  _readme:
    "เฉลยของ WO 2.1 (หน้าหลัก/ภาพรวม) — เขียนโดย scripts/acc-v2-expected-dashboard.mts ด้วย SQL ดิบที่ไม่พึ่ง dashboard.ts · สตางค์ล้วน · seed ใหม่ต้องรันสคริปต์นี้ซ้ำ",
  generatedAt: new Date().toISOString(),
  now: NOW_ISO,
  year: YEAR,
  periodKey: MONTH,
  series: { months, total, prevYear, yoyBp: { revenue: bp(total.revenue, prevYear.revenue), expense: bp(total.expense, prevYear.expense), profit: bp(total.profit, prevYear.profit) } },
  categories: { income, expense },
  cash,
  arap: { receivable: side("OUT"), payable: side("IN") },
  issued: { INVOICE: issuedInvoice, QUOTATION: issuedQuotation },
  topCustomers: topSide("OUT"),
  topVendors: topSide("IN"),
  topProducts: topProductRows.map((r) => ({
    productId: r.productId,
    name: r.name,
    qty: Number(r.qty),
    amount: n(r.amount),
  })),
  topExpenseCategories: {
    total: expenseCatRows.reduce((s, r) => s + n(r.amount), 0),
    rows: expenseCatRows.map((r) => ({ accountCode: r.code, name: r.name, amount: n(r.amount) })),
  },
  pending,
  recent: recentRows.map((r) => ({ id: r.id, docNo: r.docNo, updatedAt: r.updatedAt.toISOString() })),
  calendar: {
    monthKey: MONTH,
    tiles: {
      inflow: sumTiles(payRows, "OUT"),
      outflow: sumTiles(payRows, "IN"),
      expectedIn: sumTiles(expectedRows, "OUT"),
      expectedOut: sumTiles(expectedRows, "IN"),
      overdueReceivable: tile(overdueTileRows, "OUT"),
      overduePayable: tile(overdueTileRows, "IN"),
    },
    days: payRows.map((r) => ({ date: r.day, dir: r.dir, count: n(r.c), amount: n(r.amt) })),
    expectedDays: expectedRows.map((r) => ({ date: r.day, dir: r.dir, count: n(r.c), amount: n(r.amt) })),
  },
};

E.dashboard = dashboard;
E.overview = overview;
writeFileSync(QC.expectedPath, `${JSON.stringify(E, null, 2)}\n`);

const baht = (s: number) => (s / 100).toLocaleString("th-TH", { minimumFractionDigits: 2 });
console.log(`\n✅ เขียนเฉลย dashboard+overview ลง ${QC.expectedPath} (ณ ${NOW_ISO})`);
console.log(
  `   [2.3] รายรับ ${MONTH}: เอกสารที่ออก ฿${baht(ovRevenueIssued.amount)} (${ovRevenueIssued.count} ใบ) · ปี ${YEAR}: ชำระแล้ว ฿${baht(ovRevenueSeries.total.paid)} · รอชำระ ฿${baht(ovRevenueSeries.total.awaiting)} · พ้นกำหนด ฿${baht(ovRevenueSeries.total.overdue)}`,
);
console.log(
  `   [2.3] รายจ่าย ${MONTH}: เอกสารที่ออก ฿${baht(ovExpenseIssued.amount)} (${ovExpenseIssued.count} ใบ) · ปี ${YEAR}: ชำระแล้ว ฿${baht(ovExpenseSeries.total.paid)} · รอชำระ ฿${baht(ovExpenseSeries.total.awaiting)} · พ้นกำหนด ฿${baht(ovExpenseSeries.total.overdue)}`,
);
console.log(`   ${MONTH}: รายได้ ฿${baht(months[Number(MONTH.slice(5, 7)) - 1].revenue)} · ค่าใช้จ่าย ฿${baht(months[Number(MONTH.slice(5, 7)) - 1].expense)} · กำไร ฿${baht(months[Number(MONTH.slice(5, 7)) - 1].profit)}`);
console.log(`   ปี ${YEAR}: รายได้ ฿${baht(total.revenue)} · ค่าใช้จ่าย ฿${baht(total.expense)} · กำไร ฿${baht(total.profit)} (ปีก่อน ฿${baht(prevYear.profit)})`);
console.log(`   ค้างรับ ฿${baht(side("OUT").amount)} (${side("OUT").count} ใบ · พ้นกำหนด ${side("OUT").overdueCount} ใบ ฿${baht(side("OUT").overdueAmount)})`);
console.log(`   ค้างจ่าย ฿${baht(side("IN").amount)} (${side("IN").count} ใบ) · เงินรวมทุกช่องทาง ฿${baht(cash.total)}`);
console.log(`   ปฏิทิน ${MONTH}: เข้า ฿${baht(sumTiles(payRows, "OUT").amount)} · ออก ฿${baht(sumTiles(payRows, "IN").amount)}`);
await prisma.$disconnect();
