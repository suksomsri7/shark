// เฉลย "หน้าผู้ติดต่อ V2" (WO 3.2) — เขียนคีย์ `contacts` (เพิ่ม regular/groups/source) + `contactsOverview`
// ต่อท้าย scripts/acc-v2-expected.json (คงคีย์ all/customer/vendor/archived/active เดิมจาก seed ไว้)
//
// รัน:  QC_ENV_FILE=.env.qc pnpm tsx scripts/acc-v2-expected-contacts.mts
//
// 🔴 กติกาสำคัญ (เหมือน acc-v2-expected-dashboard.mts): ไฟล์นี้ **ห้ามเรียก
//    src/lib/modules/account/contacts-list.ts / contacts-overview.ts** เด็ดขาด — ตัวเลขทุกตัวคำนวณใหม่ด้วย
//    SQL ดิบคนละสำนวน (SUM/COUNT ... GROUP BY ... HAVING ใน SQL) ส่วนโค้ดจริงรวมยอดฝั่ง JS จาก findMany
//    ⇒ ข้อสอบ qc-acc-v2-contacts.mts เท่ากับเทียบ "สองการคำนวณที่เขียนแยกกัน" ไม่ใช่เทียบโค้ดกับตัวเอง
//
// ⚠️ seed-acc-v2-qc.mts เขียนทับ acc-v2-expected.json ทั้งไฟล์ ⇒ seed ใหม่แล้วต้องรันไฟล์นี้ซ้ำ

import { readFileSync, writeFileSync } from "node:fs";

const accEnv = (await import("./acc-v2-env.mts" as string)) as {
  loadQcEnv: () => { databaseUrl: string; host: string };
  QC: { expectedPath: string; today: string };
};
const { loadQcEnv, QC } = accEnv;
const { host } = loadQcEnv();
console.log(`🗄️  DB QC: ${host}`);

const { prisma } = await import("@/lib/core/db");

const E = JSON.parse(readFileSync(QC.expectedPath, "utf8")) as Record<string, unknown> & {
  tenantId: string;
  systemId: string;
  contacts: Record<string, unknown>;
};
const T = E.tenantId;
const S = E.systemId;
const n = (x: unknown) => Number(x ?? 0);
const NOW = new Date(`${QC.today}T12:00:00+07:00`);
const CUTOFF = new Date(NOW);
CUTOFF.setMonth(CUTOFF.getMonth() - 12);
const MONTH_START = new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth() - 0, 1, -7, 0, 0));
const MONTH_END = new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth() + 1, 1, -7, 0, 0));
// (เดือนปัจจุบันตามเวลาไทย — NOW ตรึงเวลาไทยเที่ยงวันอยู่แล้วจาก QC.today จึง getUTCMonth() ตรงเดือนไทยพอดี)

// ─────────────── 1) กลุ่มมาตรฐาน (all/customer/vendor/archived) — SQL COUNT ตรง ๆ ───────────────
const kindRows = await prisma.$queryRaw<Array<{ total: bigint; customer: bigint; vendor: bigint; archived: bigint }>>`
  SELECT
    COUNT(*)::bigint AS total,
    COUNT(*) FILTER (WHERE "kind" IN ('CUSTOMER','BOTH'))::bigint AS customer,
    COUNT(*) FILTER (WHERE "kind" IN ('VENDOR','BOTH'))::bigint AS vendor,
    COUNT(*) FILTER (WHERE "archivedAt" IS NOT NULL)::bigint AS archived
  FROM "AccountContact" WHERE "tenantId" = ${T} AND "systemId" = ${S}`;
const k = kindRows[0];

// ─────────────── 2) "ลูกค้าประจำ" — SQL GROUP BY ... HAVING (นิยามเดียวกับ DEFAULT_REGULAR_RULE) ───────────────
const regularRows = await prisma.$queryRaw<Array<{ contactId: string }>>`
  SELECT d."contactId"
    FROM "AccountDocumentPayment" p
    JOIN "AccountDocument" d ON d."id" = p."documentId"
   WHERE p."voidedAt" IS NULL AND p."paidAt" >= ${CUTOFF}
     AND d."direction" = 'OUT' AND d."contactId" IS NOT NULL
     AND d."tenantId" = ${T} AND d."systemId" = ${S}
   GROUP BY d."contactId"
  HAVING COUNT(DISTINCT p."documentId") >= 3 OR SUM(p."amount") >= 3150000`;
const regular = regularRows.length;

// ─────────────── 3) กลุ่มกำหนดเอง (WO 3.2 seed section 4.5) ───────────────
const groupRows = await prisma.$queryRaw<Array<{ name: string; cnt: bigint }>>`
  SELECT g."name", COUNT(m."id")::bigint AS cnt
    FROM "AccountContactGroup" g
    LEFT JOIN "AccountContactGroupMember" m ON m."groupId" = g."id"
   WHERE g."systemId" = ${S}
   GROUP BY g."id", g."name" ORDER BY g."sortOrder"`;
const groups = groupRows.map((r) => ({ name: r.name, count: n(r.cnt) }));

// ─────────────── 4) "ที่มา" — สมาชิก/CRM เชื่อมผ่าน partyId เดียวกัน ───────────────
const sourceRows = await prisma.$queryRaw<Array<{ member: bigint; crm: bigint }>>`
  SELECT
    COUNT(DISTINCT c."id") FILTER (WHERE cu."id" IS NOT NULL)::bigint AS member,
    COUNT(DISTINCT c."id") FILTER (WHERE cc."id" IS NOT NULL)::bigint AS crm
  FROM "AccountContact" c
  LEFT JOIN "Customer" cu ON cu."partyId" = c."partyId" AND c."partyId" IS NOT NULL
  LEFT JOIN "CrmContact" cc ON cc."partyId" = c."partyId" AND c."partyId" IS NOT NULL
  WHERE c."tenantId" = ${T} AND c."systemId" = ${S}`;
const src = sourceRows[0];

const contacts = {
  ...E.contacts,
  regular,
  groups,
  source: { member: n(src.member), crm: n(src.crm), chat: 0, pos: 0, imported: 0 },
};

// ─────────────── 5) ภาพรวมผู้ติดต่อ (§7.4) — เอาไว้เทียบหน้า /contacts/overview ───────────────
// WO 3.2 รอบแก้ 2 (Fable QC): "ลูกค้าใหม่เดือนนี้" ต้องยึดวันที่เอกสารใบแรก (issueDate) ไม่ใช่ AccountContact.createdAt
// (createdAt = เวลาที่ seed สร้างจริง เลื่อนไปเรื่อย ๆ ตามวันที่รัน ⇒ oracle เน่า) — MIN(issueDate) ต่อผู้ติดต่อ
// มาจากเอกสารที่ fixture ตรึงวันที่ไว้แน่นอนใน D() (ปี 2026 ทั้งหมด) จึงนิ่งไม่ว่าจะรัน seed วันไหนจริง
const purchaseRows = await prisma.$queryRaw<Array<{ contactId: string; name: string; amount: bigint; cnt: bigint; firstDate: Date }>>`
  SELECT d."contactId", c."name", SUM(d."grandTotal")::bigint AS amount, COUNT(*)::bigint AS cnt, MIN(d."issueDate") AS "firstDate"
    FROM "AccountDocument" d JOIN "AccountContact" c ON c."id" = d."contactId"
   WHERE d."tenantId" = ${T} AND d."systemId" = ${S} AND d."direction" = 'OUT'
     AND d."status" NOT IN ('DRAFT','CANCELLED','VOIDED') AND d."contactId" IS NOT NULL
   GROUP BY d."contactId", c."name"`;
const newCustomersThisMonth = purchaseRows.filter((r) => r.firstDate >= MONTH_START && r.firstDate < MONTH_END).length;

const thisMonthRows = await prisma.$queryRaw<Array<{ contactId: string }>>`
  SELECT DISTINCT d."contactId"
    FROM "AccountDocument" d
   WHERE d."tenantId" = ${T} AND d."systemId" = ${S} AND d."direction" = 'OUT'
     AND d."status" NOT IN ('DRAFT','CANCELLED','VOIDED') AND d."contactId" IS NOT NULL
     AND d."issueDate" >= ${MONTH_START} AND d."issueDate" < ${MONTH_END}`;
const boughtThisMonth = new Set(thisMonthRows.map((r) => r.contactId));
const returningCustomers = purchaseRows.filter((r) => n(r.cnt) >= 2 && boughtThisMonth.has(r.contactId)).length;
const topCustomersByPurchases = [...purchaseRows]
  .sort((a, b) => n(b.amount) - n(a.amount))
  .slice(0, 10)
  .map((r) => ({ contactId: r.contactId, name: r.name, amountSatang: n(r.amount), count: n(r.cnt) }));

const outstandingRows = await prisma.$queryRaw<Array<{ contactId: string; name: string; remain: bigint }>>`
  SELECT d."contactId", c."name", SUM(d."grandTotal" - d."paidTotal")::bigint AS remain
    FROM "AccountDocument" d JOIN "AccountContact" c ON c."id" = d."contactId"
   WHERE d."tenantId" = ${T} AND d."systemId" = ${S} AND d."direction" = 'OUT'
     AND d."status" IN ('AWAITING_PAYMENT','PARTIAL') AND d."contactId" IS NOT NULL
   GROUP BY d."contactId", c."name" HAVING SUM(d."grandTotal" - d."paidTotal") > 0`;
const topOutstanding = [...outstandingRows]
  .sort((a, b) => n(b.remain) - n(a.remain))
  .slice(0, 10)
  .map((r) => ({ contactId: r.contactId, name: r.name, amountSatang: n(r.remain) }));

const vendorRows = await prisma.$queryRaw<Array<{ contactId: string; name: string; amount: bigint }>>`
  SELECT d."contactId", c."name", SUM(p."amount")::bigint AS amount
    FROM "AccountDocumentPayment" p
    JOIN "AccountDocument" d ON d."id" = p."documentId"
    JOIN "AccountContact" c ON c."id" = d."contactId"
   WHERE p."voidedAt" IS NULL AND d."direction" = 'IN' AND d."contactId" IS NOT NULL
     AND d."tenantId" = ${T} AND d."systemId" = ${S}
   GROUP BY d."contactId", c."name"`;
const topVendorsByPayments = [...vendorRows]
  .sort((a, b) => n(b.amount) - n(a.amount))
  .slice(0, 10)
  .map((r) => ({ contactId: r.contactId, name: r.name, amountSatang: n(r.amount) }));

const contactsOverview = { newCustomersThisMonth, returningCustomers, topCustomersByPurchases, topOutstanding, topVendorsByPayments };

E.contacts = contacts;
(E as Record<string, unknown>).contactsOverview = contactsOverview;
writeFileSync(QC.expectedPath, `${JSON.stringify(E, null, 2)}\n`);

console.log(`\n✅ เขียนเฉลย contacts+contactsOverview ลง ${QC.expectedPath}`);
console.log(`   contacts: all=${k.total} customer=${k.customer} vendor=${k.vendor} archived=${k.archived} regular=${regular}`);
console.log(`   groups: ${groups.map((g) => `${g.name}=${g.count}`).join(" · ")}`);
console.log(`   source: สมาชิก=${src.member} · CRM=${src.crm}`);
console.log(`   overview: ลูกค้าใหม่เดือนนี้=${newCustomersThisMonth} · กลับมาซื้อ=${returningCustomers} · top purchases=${topCustomersByPurchases.length} · top outstanding=${topOutstanding.length} · top vendors=${topVendorsByPayments.length}`);
await prisma.$disconnect();
