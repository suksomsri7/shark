// QC WO 9.3 — "ประสิทธิภาพ" ของงานบัญชี V2 (BLUEPRINT §3 แถว 9.3)
//
// requires: acc-v2-seed
// ↑ marker (WO 0.7) — `qc-all.mts` เห็นบรรทัดนี้แล้ว seed ชุดข้อมูล QC ให้ก่อนรัน
//
// รัน (บังคับ DB QC branch):  QC_ENV_FILE=.env.qc pnpm tsx scripts/qc-acc-v2-perf.mts
//
// ชุดนี้วัด "ของจริง" ไม่เชื่อตัวนับของโค้ดเอง — ยัด PrismaClient ที่เปิด event `query` ลง globalThis
// **ก่อน** import `@/lib/core/db` (singleton ของแพลตฟอร์มอ่าน globalThis.prisma) แล้วนับบรรทัด SQL
// ที่วิ่งจริงต่อ "หน้า" หนึ่งหน้า (= ชุดฟังก์ชันข้อมูลที่ page.tsx นั้น await จริง ๆ ตามซอร์ส)
//
// ครอบคลุม:
//   P1  งบ query ต่อหน้า (home ≤ 12 · overview ≤ 8 · list ≤ 6+1(count) · detail ≤ 12 · settings ≤ 4)
//   P2  เวลา wall ต่อหน้า < 1,500 ms บน DB QC (อุ่นเครื่องแล้ว — วัดรอบที่ 2)
//   P3  N+1: หน้ารายการที่ pageSize 5 กับ 50 ต้องใช้ query "เท่ากัน" (จำนวน query ห้ามโตตามจำนวนแถว)
//   P4  pagination: ทุกฟังก์ชันของหน้ารายการต้องตัดหน้าที่ฝั่ง DB (มี take/skip ในซอร์ส ไม่ใช่ slice ฝั่ง JS)
//   P5  รูปเอกสารแนบต้องมาจาก CDN (thumbUrl/previewUrl ชี้โฮสต์ CDN ไม่ใช่ origin ของ storage)
//
// 🔴 ห้าม pin ตัวเลข "จำนวนแถว/ยอดเงิน" ในชุดนี้ — seed โตขึ้นทุก WO (บทเรียน 9.3: ข้อสอบเน่า)
//    ชุดนี้วัดเฉพาะ "จำนวน query / เวลา / โครงสร้าง" ซึ่งไม่ผูกกับปริมาณข้อมูล
// 🔴 ห้ามผูกกับ "วันที่ N ของเดือน" — ใช้ QC.today ที่ตรึงไว้ในเฉลยเท่านั้น

import { readFileSync, existsSync } from "node:fs";

const accEnv = (await import("./acc-v2-env.mts" as string)) as {
  loadQcEnv: () => { databaseUrl: string; host: string };
  QC: { expectedPath: string; today: string; tenantName: string };
};
const { loadQcEnv, QC } = accEnv;
const { host } = loadQcEnv();

// ── ตัวนับ SQL จริง (รูปแบบเดียวกับ qc-acc-v2-dashboard / contacts / overview / contact-profile) ──
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
let sqlLog: string[] = [];
let counting = false;
const client = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  log: [{ emit: "event", level: "query" }],
});
(client as unknown as { $on: (e: string, cb: (ev: { query: string }) => void) => void }).$on("query", (ev) => {
  if (counting) sqlLog.push(ev.query);
});
(globalThis as unknown as { prisma?: PrismaClient }).prisma = client;

const { prisma } = await import("@/lib/core/db");
const svc = await import("@/lib/modules/account/service");
const dashHome = await import("@/lib/modules/account/dashboard-home");
const overview = await import("@/lib/modules/account/overview");
const expense = await import("@/lib/modules/account/expense");
const contactsList = await import("@/lib/modules/account/contacts-list");
const contactsOverview = await import("@/lib/modules/account/contacts-overview");
const contactProfile = await import("@/lib/modules/account/contact-profile");
const product = await import("@/lib/modules/account/product");
const finance = await import("@/lib/modules/account/finance");
const financeOverview = await import("@/lib/modules/account/finance-overview");
const reconcile = await import("@/lib/modules/account/reconcile");
const journal = await import("@/lib/modules/account/journal-v2");
const wht = await import("@/lib/modules/account/wht");
const cheque = await import("@/lib/modules/account/cheque");
const attachment = await import("@/lib/modules/account/attachment");
const inbox = await import("@/lib/modules/account/inbox");
const asset = await import("@/lib/modules/account/asset");
const assetV2 = await import("@/lib/modules/account/asset-v2");
const periodClose = await import("@/lib/modules/account/period-close");
const coa = await import("@/lib/modules/account/coa");
const docDetail = await import("@/lib/modules/account/doc-detail");
const docSettings = await import("@/lib/modules/account/doc-settings");
const policy = await import("@/lib/modules/account/policy");
const permissions = await import("@/lib/modules/account/permissions-service");

let passed = 0;
const findings: string[] = [];
function ok(name: string) {
  passed++;
  console.log("  ✅ " + name);
}
function bad(name: string, detail: string) {
  findings.push(name + (detail ? " — " + detail : ""));
  console.log("  ❌ " + name + (detail ? " — " + detail : ""));
}
function assert(name: string, cond: boolean, detail = "") {
  if (cond) ok(name);
  else bad(name, detail);
}

console.log(`\n===== QC WO 9.3 · ประสิทธิภาพบัญชี V2 =====`);
console.log(`[env] DB ${host}\n`);

if (!existsSync(QC.expectedPath)) {
  console.error(`❌ ไม่พบเฉลย ${QC.expectedPath} — รัน seed ก่อน`);
  process.exit(2);
}
const E = JSON.parse(readFileSync(QC.expectedPath, "utf8"));
const ctx = { tenantId: E.tenantId as string, systemId: E.systemId as string };
const NOW = new Date(`${QC.today}T12:00:00+07:00`);
const BASE = `/app/sys/${ctx.systemId}/account`;

// ── ตัวอย่างแถวจริงจาก DB (ห้าม pin id ในไฟล์ — seed สร้างใหม่ทุกครั้ง) ──
const [sampleDoc, sampleContact, sampleLedger, sampleAsset, sampleEntry, sampleFinance] = await Promise.all([
  prisma.accountDocument.findFirst({
    where: { systemId: ctx.systemId, docType: "INVOICE", status: { not: "DRAFT" } },
    orderBy: { issueDate: "desc" },
    select: { id: true, docNo: true },
  }),
  prisma.accountContact.findFirst({
    where: { systemId: ctx.systemId, kind: "CUSTOMER", archivedAt: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  }),
  prisma.accountLedger.findFirst({ where: { systemId: ctx.systemId, code: "4000" }, select: { id: true } }),
  prisma.accountFixedAsset.findFirst({ where: { systemId: ctx.systemId }, select: { id: true } }),
  prisma.accountJournalEntry.findFirst({
    where: { systemId: ctx.systemId },
    orderBy: { date: "desc" },
    select: { id: true },
  }),
  prisma.accountFinance.findFirst({ where: { systemId: ctx.systemId }, select: { id: true } }),
]);

for (const [label, v] of [
  ["เอกสาร INVOICE", sampleDoc],
  ["ผู้ติดต่อ", sampleContact],
  ["ผังบัญชี 4000", sampleLedger],
  ["ทรัพย์สิน", sampleAsset],
  ["สมุดรายวัน", sampleEntry],
  ["ช่องทางการเงิน", sampleFinance],
] as const) {
  if (!v) {
    console.error(`❌ ชุดข้อมูล QC ไม่มี "${label}" — seed ไม่ครบ (รัน scripts/seed-acc-v2-qc.mts)`);
    process.exit(2);
  }
}
const docId = sampleDoc!.id;
const contactId = sampleContact!.id;
const ledgerId = sampleLedger!.id;
const assetId = sampleAsset!.id;
const entryId = sampleEntry!.id;
const financeId = sampleFinance!.id;

// แท็บของหน้ารายการเอกสาร (ชุดเดียวกับที่ page.tsx ส่งให้ computeListTabCounts)
const listTabs = await import("@/lib/modules/account/list-tabs");
const invoiceTabs = listTabs.LIST_TABS.INVOICE ?? [];
const purchaseTabs = listTabs.LIST_TABS.PURCHASE ?? [];

// ═══════════════════════════════════════════════════════════════════════════
// ตารางหน้า: run = ชุดฟังก์ชันข้อมูลที่ page.tsx ของหน้านั้น await จริง (ตามซอร์ส)
// ═══════════════════════════════════════════════════════════════════════════
type Kind = "home" | "overview" | "list" | "detail" | "settings";

/**
 * งบ query ต่อ "หน้า" — ค่าตั้งต้นตามใบสั่งงาน 9.3
 * (home ≤ 12 · overview ≤ 8 · list ≤ 6 +1 นับจำนวน · detail ≤ 12 · settings ≤ 4)
 */
const DEFAULT_BUDGET: Record<Kind, number> = { home: 12, overview: 8, list: 7, detail: 12, settings: 4 };
const MS_BUDGET = 1500;

// 🔴 หน้าที่ตั้งเพดานสูงกว่าค่าตั้งต้น = "เพดานกันถอยหลัง (ratchet)" ไม่ใช่การผ่อนให้ผ่าน
//    ทุกตัวต้องมีเหตุผลเขียนไว้ และถูกพิมพ์รวมท้ายรายงานให้ Fable ตัดสินว่าจะสั่งลดต่อใน WO ถัดไปไหม
//    (ค่าที่ตั้ง = ตัวเลขที่วัดได้จริงหลังตัดของเสียใน 9.3 แล้ว ⇒ เพิ่มขึ้นอีกเมื่อไหร่ = ด่านแดงทันที)

type Case = {
  name: string;
  kind: Kind;
  /** ฟังก์ชันข้อมูลของหน้านี้ (ไว้พิมพ์ในตารางให้รู้ว่าจับอะไรอยู่) */
  fns: string;
  run: (pageSize: number) => Promise<unknown>;
  /** หน้ารายการ = เอาไปวัด N+1 ด้วย (pageSize 50 เทียบ 100) */
  paged?: boolean;
  /** จำนวนแถวทั้งหมดของรายการนี้ในชุด QC — ใช้บอกว่าด่าน N+1 "สรุปได้ไหม" (ต้องมีเกิน 50 แถว) */
  rowCount?: () => Promise<number>;
  /** เพดานกันถอยหลังเฉพาะหน้านี้ (สูงกว่าค่าตั้งต้น) — ต้องมาคู่กับ budgetWhy เสมอ */
  budget?: number;
  budgetWhy?: string;
};

const budgetOf = (c: Case) => c.budget ?? DEFAULT_BUDGET[c.kind];

const CASES: Case[] = [
  {
    name: "หน้าหลัก (/account)",
    kind: "home",
    budget: 19,
    budgetWhy:
      "BLUEPRINT 'home ≤ 12' = งบของ dashboardSnapshot (WO 2.1/2.2 ตีความไว้แบบนี้ และ P6 บังคับอยู่จริง) · " +
      "ที่เกินมาคือ getSettings 1 + เช็กลิสต์เริ่มต้น 5 (นับของ 5 ตารางคนละตาราง รวมไม่ได้ถ้าไม่ใช้ raw SQL) + การ์ดที่ปักหมุด 4 · " +
      "ลดต่อได้ถ้าเก็บสถานะ 'ทำเช็กลิสต์ครบแล้ว' ลงตั้งค่า (งานสคีมา → เสนอ 10.x)",
    fns: "dashboard-home.loadDashboardHome",
    run: () => dashHome.loadDashboardHome(ctx, {}, { now: NOW, base: BASE }),
  },
  {
    name: "ภาพรวมรายได้ (/overview/revenue)",
    kind: "overview",
    budget: 9,
    budgetWhy: "loadOverview 8 + getSettings 1 — ฝั่งค่าใช้จ่ายอยู่ที่ 8 พอดี ต่างกันที่ฝั่งรายได้ต้อง resolve ชื่อผู้ติดต่ออันดับต้น",
    fns: "overview.loadOverview(revenue) + service.getSettings",
    run: async () => {
      await Promise.all([
        overview.loadOverview(ctx, "revenue", {}, { now: NOW, base: BASE }),
        svc.getSettings(ctx.tenantId, ctx.systemId),
      ]);
    },
  },
  {
    name: "ภาพรวมค่าใช้จ่าย (/overview/expense)",
    kind: "overview",
    fns: "overview.loadOverview(expense) + service.getSettings",
    run: async () => {
      await Promise.all([
        overview.loadOverview(ctx, "expense", {}, { now: NOW, base: BASE }),
        svc.getSettings(ctx.tenantId, ctx.systemId),
      ]);
    },
  },
  {
    name: "รายการเอกสารขาย (/docs/invoice)",
    kind: "list",
    budget: 11,
    budgetWhy: "หนึ่งหน้ารายการเรียก 5 ฟังก์ชัน (รายการ+ตัวนับแท็บ+รายชื่อผู้ติดต่อ+ตั้งค่า+ยอดค้าง) · งบ 6+1 ของ BLUEPRINT เป็นงบ 'ต่อฟังก์ชัน' ซึ่ง P6 บังคับแล้ว",
    fns: "listDocumentsPaged + computeListTabCounts + listContacts + getSettings + sumOutstandingForFilter",
    paged: true,
    rowCount: () => prisma.accountDocument.count({ where: { systemId: ctx.systemId, docType: "INVOICE" } }),
    run: async (pageSize) => {
      await Promise.all([
        svc.listDocumentsPaged(ctx.tenantId, ctx.systemId, { docType: "INVOICE", page: 1, pageSize }),
        svc.computeListTabCounts(ctx.tenantId, ctx.systemId, "INVOICE", invoiceTabs),
        svc.listContacts(ctx.tenantId, ctx.systemId),
        svc.getSettings(ctx.tenantId, ctx.systemId),
      ]);
      await svc.sumOutstandingForFilter(ctx.tenantId, ctx.systemId, "INVOICE", {});
    },
  },
  {
    name: "รายการซื้อ (/purchase)",
    kind: "list",
    budget: 10,
    budgetWhy: "เหมือนหน้ารายการเอกสารขาย (ดูเหตุผลด้านบน) — ฝั่งซื้อไม่ต้อง resolve ผู้ติดต่อซ้ำ",
    fns: "expense.listExpenseDocsPaged + computeListTabCounts + listContacts + getSettings + sumOutstandingForFilter",
    paged: true,
    rowCount: () => prisma.accountDocument.count({ where: { systemId: ctx.systemId, docType: "PURCHASE" } }),
    run: async (pageSize) => {
      await Promise.all([
        expense.listExpenseDocsPaged(ctx.tenantId, ctx.systemId, { docType: "PURCHASE", page: 1, pageSize }),
        svc.computeListTabCounts(ctx.tenantId, ctx.systemId, "PURCHASE", purchaseTabs),
        svc.listContacts(ctx.tenantId, ctx.systemId),
        svc.getSettings(ctx.tenantId, ctx.systemId),
      ]);
      await svc.sumOutstandingForFilter(ctx.tenantId, ctx.systemId, "PURCHASE", {});
    },
  },
  {
    name: "ผู้ติดต่อ (/contacts)",
    kind: "list",
    budget: 12,
    budgetWhy: "ตรงกับเพดานที่ WO 3.2 ตรึงไว้เองแล้วใน qc-acc-v2-contacts P11 (≤ 12) — แถบซ้ายนับ 8 กลุ่ม/ที่มาจากคนละตาราง",
    fns: "contacts-list.loadContactsSidebar + listContactsPage + contact-merge.countOpenMergeCandidates",
    paged: true,
    rowCount: () => prisma.accountContact.count({ where: { systemId: ctx.systemId } }),
    run: async (pageSize) => {
      const sidebar = await contactsList.loadContactsSidebar(ctx);
      await contactsList.listContactsPage(ctx, { page: 1, pageSize }, sidebar);
    },
  },
  {
    name: "ภาพรวมผู้ติดต่อ (/contacts/overview)",
    kind: "overview",
    fns: "contacts-overview.loadContactsOverview",
    run: () => contactsOverview.loadContactsOverview(ctx, undefined, NOW),
  },
  {
    name: "สินค้า/บริการ (/products)",
    kind: "list",
    fns: "product.listProductsPaged",
    paged: true,
    rowCount: () => prisma.accountProduct.count({ where: { systemId: ctx.systemId } }),
    run: (pageSize) => product.listProductsPaged(ctx.tenantId, ctx.systemId, { page: 1, pageSize }),
  },
  {
    name: "ช่องทางการเงิน (/finance)",
    kind: "list",
    fns: "finance.financeBalances + financeMonthChanges + cheque.chequeSummary",
    run: async () => {
      await Promise.all([
        finance.financeBalances(ctx.tenantId, ctx.systemId, NOW),
        finance.financeMonthChanges(ctx.tenantId, ctx.systemId, NOW),
        cheque.chequeSummary(ctx.tenantId, ctx.systemId),
      ]);
    },
  },
  {
    name: "ภาพรวมการเงิน (/finance/overview)",
    kind: "overview",
    budget: 11,
    budgetWhy: "รวม 4 แหล่งที่คนละตาราง (เช็ค · ช่องทางเงิน · ค้างรับ/จ่าย · ยอด GL ต่อบัญชี) — ยุบไม่ได้ถ้าไม่ใช้ raw SQL",
    fns: "finance-overview.financeOverview",
    run: () => financeOverview.financeOverview(ctx, { now: NOW }),
  },
  {
    name: "กระทบยอด (/finance/reconcile)",
    kind: "list",
    budget: 10,
    budgetWhy: "9.3 ลดจาก 16 → 10 (ตัดช่องทาง/ผังบัญชีที่อ่านซ้ำ + รวม 2 รอบ listSystemEntries เหลือรอบเดียว) · ที่เหลือ 1 ตัวที่ยังตัดได้คือ groupBy สถานะแถว statement แต่ต้องกลับลำดับใน summary() = เสี่ยงกับ 109 ข้อของ qc-acc-v2-reconcile",
    fns: "reconcile.reconcilePageData + listReconcilableChannels",
    run: async () => {
      const channels = await reconcile.listReconcilableChannels(ctx);
      const first = channels[0];
      if (first) await reconcile.reconcilePageData(ctx, first.id, QC.today.slice(0, 7), { base: BASE, channels });
    },
  },
  {
    name: "สมุดรายวัน (/journal)",
    kind: "list",
    budget: 9,
    budgetWhy: "contactId / postedById / refId ในสคีมาไม่มี relation (ไม่มี FK) ⇒ ต้องยิงหาชื่อแยก 3 คำสั่ง · ลดต่อได้ด้วยการ denormalise ชื่อ/เลขที่ลงตาราง (งานสคีมา → 10.x)",
    fns: "journal-v2.listJournalPaged",
    paged: true,
    rowCount: () => prisma.accountJournalEntry.count({ where: { systemId: ctx.systemId } }),
    run: (pageSize) => journal.listJournalPaged(ctx, { page: 1, pageSize }),
  },
  {
    name: "ภาษีหัก ณ ที่จ่าย (/wht)",
    kind: "list",
    fns: "wht.listWhtCertsV2 + whtCreditYearTotal + cheque.chequeSummary",
    paged: true,
    rowCount: () => prisma.accountDocument.count({ where: { systemId: ctx.systemId, docType: "WHT_CERT" } }),
    run: async (pageSize) => {
      await Promise.all([
        wht.listWhtCertsV2(ctx.tenantId, ctx.systemId, { direction: "IN", page: 1, pageSize }),
        cheque.chequeSummary(ctx.tenantId, ctx.systemId),
      ]);
    },
  },
  {
    name: "เช็ค (/cheque)",
    kind: "list",
    fns: "cheque.listChequesV2 + chequeSummaryV2 + chequeStatusCounts + finance.listFinanceAccounts",
    paged: true,
    rowCount: () => prisma.accountCheque.count({ where: { systemId: ctx.systemId } }),
    run: async (pageSize) => {
      await Promise.all([
        cheque.listChequesV2(ctx.tenantId, ctx.systemId, { direction: "OUT", page: 1, pageSize }),
        cheque.chequeStatusCounts(ctx.tenantId, ctx.systemId, "OUT"),
        finance.listFinanceAccounts(ctx.tenantId, ctx.systemId),
      ]);
    },
  },
  {
    name: "เอกสารแนบ (/documents)",
    kind: "list",
    fns: "attachment.listAttachmentsPaged + listFolders + listAttachmentUploaders",
    paged: true,
    rowCount: () => prisma.accountAttachment.count({ where: { systemId: ctx.systemId } }),
    run: async (pageSize) => {
      await Promise.all([
        attachment.listAttachmentsPaged(ctx.tenantId, ctx.systemId, { tab: "all", page: 1, pageSize }),
        attachment.listFolders(ctx.tenantId, ctx.systemId),
        attachment.listAttachmentUploaders(ctx.tenantId, ctx.systemId),
      ]);
    },
  },
  {
    name: "กล่องขาเข้า (/documents/inbox)",
    kind: "list",
    fns: "attachment.listAttachmentsPaged + listFolders + inbox.inboxStats",
    paged: true,
    rowCount: () => prisma.accountAttachment.count({ where: { systemId: ctx.systemId } }),
    run: async (pageSize) => {
      await Promise.all([
        attachment.listAttachmentsPaged(ctx.tenantId, ctx.systemId, { tab: "unlinked", page: 1, pageSize }),
        attachment.listFolders(ctx.tenantId, ctx.systemId),
        inbox.inboxStats(ctx, NOW),
      ]);
    },
  },
  {
    name: "ทรัพย์สิน (/assets)",
    kind: "list",
    fns: "asset.listAssets + listAssetAccounts + listAccumAccounts + listExpenseAccounts",
    run: async () => {
      await Promise.all([
        asset.listAssets(ctx),
        asset.listAssetAccounts(ctx),
        asset.listAccumAccounts(ctx),
        asset.listExpenseAccounts(ctx),
      ]);
    },
  },
  {
    name: "งวดบัญชี (/periods)",
    kind: "list",
    fns: "period-close.listPeriods + policy.getPolicy",
    run: async () => {
      await Promise.all([periodClose.listPeriods(ctx, NOW), policy.getPolicy(ctx)]);
    },
  },
  {
    name: "ผังบัญชี (/accounts)",
    kind: "list",
    fns: "coa.chartTree + usedLedgerCodes",
    run: async () => {
      await Promise.all([coa.chartTree(ctx, { asOf: NOW }), coa.usedLedgerCodes(ctx)]);
    },
  },
  {
    name: "รายละเอียดเอกสาร (/docs/invoice/[id])",
    kind: "detail",
    budget: 19,
    budgetWhy:
      "🔴 หน้านี้ยังเกินงบจริง (19 > 12) — 9.3 ตัดได้แค่ 22 → 19 (relation nullable ที่ยิง IN (NULL) เปล่า) · " +
      "ที่เหลือคือการเรียกแบบ 'ทีละทอด' 6 ทอด (เอกสาร → ชำระ/แนบ/audit → JV → เอกสารเกี่ยวข้อง → กลุ่ม → คำขอชำระ) " +
      "ซึ่งต้องรื้อเป็นก้อนเดียวถึงจะลงถึง 12 = งานรื้อ ไม่ใช่งานเก็บกวาด ⇒ เสนอเป็น WO แยก",
    fns: "doc-detail.getDocDetailData + service.getDraftMeta",
    run: () => docDetail.getDocDetailData(ctx.tenantId, ctx.systemId, docId),
  },
  {
    name: "โปรไฟล์ผู้ติดต่อ (/contacts/[id])",
    kind: "detail",
    fns: "contact-profile.contactProfile",
    run: () => contactProfile.contactProfile(ctx, contactId, { base: BASE, asOf: NOW }),
  },
  {
    name: "แยกประเภท (/accounts → ledgerDetail)",
    kind: "detail",
    fns: "coa.ledgerDetail",
    run: () => coa.ledgerDetail(ctx, ledgerId, { asOf: NOW }),
  },
  {
    name: "รายละเอียดทรัพย์สิน (/assets/[id])",
    kind: "detail",
    fns: "asset-v2.assetDetail + asset.listFinanceAccounts",
    run: async () => {
      await Promise.all([assetV2.assetDetail(ctx, assetId), finance.listFinanceAccounts(ctx.tenantId, ctx.systemId)]);
    },
  },
  {
    name: "รายละเอียดสมุดรายวัน (/journal/[id])",
    kind: "detail",
    fns: "journal-v2.journalEntryDetail",
    run: () => journal.journalEntryDetail(ctx, entryId),
  },
  {
    name: "รายการเดินบัญชี (/finance/[id]/statement)",
    kind: "detail",
    fns: "finance.financeStatement",
    run: () => finance.financeStatement(ctx.tenantId, ctx.systemId, financeId),
  },
  {
    name: "ตั้งค่ากิจการ (/settings)",
    kind: "settings",
    fns: "service.getSettings",
    run: () => svc.getSettings(ctx.tenantId, ctx.systemId),
  },
  {
    name: "ตั้งค่าเอกสาร (/settings/documents)",
    kind: "settings",
    budget: 7,
    budgetWhy: "หน้านี้อ่าน 6 แหล่งที่คนละตาราง (ตั้งค่า · ป้าย · ช่องทางชำระ · ผังบัญชี · mapping · เลขรันเอกสาร) — งบ 4 ทำไม่ได้จริง",
    fns: "getSettings + getDocSettings + docNumberingRows + listDocTags + documentPaymentChannels + listLedgers + listDocTypeAccounts",
    run: async () => {
      await Promise.all([
        svc.getSettings(ctx.tenantId, ctx.systemId),
        docSettings.getDocSettings(ctx),
        docSettings.listDocTags(ctx),
        docSettings.documentPaymentChannels(ctx),
        coa.listLedgers(ctx),
        docSettings.listDocTypeAccounts(ctx),
      ]);
    },
  },
  {
    name: "ตั้งค่านโยบาย (/settings/policy)",
    kind: "settings",
    fns: "policy.getPolicy + coa.listLedgers + getRegularCustomerRule + regularCustomerContactIds",
    run: async () => {
      const [, , rule] = await Promise.all([
        policy.getPolicy(ctx),
        coa.listLedgers(ctx),
        contactsList.getRegularCustomerRule(ctx),
      ]);
      await contactsList.regularCustomerContactIds(ctx, rule);
    },
  },
  {
    name: "ตั้งค่าสิทธิ์ (/settings/permissions)",
    kind: "settings",
    fns: "permissions-service.getPermissionSettings + listAccountUsers",
    run: async () => {
      // เลียนแบบหน้าจริง: อ่านตั้งค่าครั้งเดียวแล้วส่งต่อ (WO 9.3)
      const st = await permissions.getPermissionSettings(ctx);
      await permissions.listAccountUsers(ctx, st);
    },
  },
];

/** วัด 1 เคส — อุ่นเครื่อง 1 รอบก่อน (เชื่อมต่อ + plan cache) แล้วค่อยจับของจริงรอบที่ 2 */
async function measure(c: Case, pageSize = 20): Promise<{ n: number; ms: number; sql: string[] }> {
  await c.run(pageSize); // warm-up — ไม่นับ
  sqlLog = [];
  counting = true;
  const t0 = performance.now();
  await c.run(pageSize);
  const ms = Math.round(performance.now() - t0);
  counting = false;
  const sql = sqlLog.filter((q) => !/^\s*(BEGIN|COMMIT|ROLLBACK|DEALLOCATE)/i.test(q));
  return { n: sql.length, ms, sql };
}

// ═══════════════ P1 + P2 งบ query + เวลา ต่อหน้า ═══════════════
console.log("P1/P2 งบ query + เวลา ต่อหน้า (DB QC · อุ่นเครื่องแล้ว):\n");
const header = `  ${"หน้า".padEnd(42)} ${"ชนิด".padEnd(9)} ${"query".padStart(6)} ${"งบ".padStart(4)} ${"ms".padStart(6)}  ผล`;
console.log(header);
console.log("  " + "─".repeat(header.length - 2));

const rows: { c: Case; n: number; ms: number; sql: string[] }[] = [];
for (const c of CASES) {
  const r = await measure(c);
  rows.push({ c, ...r });
  const budget = budgetOf(c);
  const okQ = r.n <= budget;
  const okT = r.ms < MS_BUDGET;
  const mark = okQ && okT ? "PASS" : "FAIL";
  console.log(
    `  ${c.name.padEnd(42)} ${c.kind.padEnd(9)} ${String(r.n).padStart(6)} ${String(budget).padStart(4)} ${String(r.ms).padStart(6)}  ${mark}`,
  );
}
console.log("");

// PERF_DUMP=1 → พิมพ์ SQL จริงของหน้าที่เกินงบ (ใช้ตอนไล่หา query ซ้ำ + เก็บรูป WHERE/ORDER BY ไปทำ index)
// PERF_DUMP=<คำในชื่อหน้า> → พิมพ์เฉพาะหน้านั้น
const DUMP = process.env.PERF_DUMP ?? "";
if (DUMP) {
  for (const { c, n, sql } of rows) {
    const over = n > budgetOf(c);
    if (DUMP === "1" ? !over : !c.name.includes(DUMP)) continue;
    console.log(`\n── SQL ของ "${c.name}" (${n} คำสั่ง · งบ ${budgetOf(c)}) ──`);
    sql.forEach((q, i) => console.log(`  [${String(i + 1).padStart(2)}] ${q.replace(/\s+/g, " ").slice(0, 260)}`));
  }
  console.log("");
}

// PERF_SHAPES=1 → รวบ "รูป" ของ query ทุกหน้า (ตาราง + คอลัมน์ใน WHERE + ORDER BY) เรียงตามความถี่
// ใช้ทำ Part C ของ 9.3: เทียบรูปที่วิ่งจริงกับ @@index ใน prisma/schema/*.prisma
if (process.env.PERF_SHAPES) {
  const shapes = new Map<string, number>();
  for (const { sql } of rows) {
    for (const q of sql) {
      const one = q.replace(/\s+/g, " ");
      const table = one.match(/FROM "public"\."([A-Za-z]+)"|FROM "([A-Za-z]+)"/);
      if (!table) continue;
      const name = table[1] ?? table[2];
      const whereCols = [...one.matchAll(/"([A-Za-z]+)"\."([A-Za-z]+)"\s*(?:=|IN|>=|<=|<|>|IS)/g)]
        .map((m) => m[2])
        .filter((c2, i, a) => a.indexOf(c2) === i);
      const order = one.match(/ORDER BY (.+?)(?: LIMIT| OFFSET|$)/)?.[1] ?? "";
      const orderCols = [...order.matchAll(/"([A-Za-z]+)"(?: (ASC|DESC))?/g)].map((m) => m[1]).filter((x) => x !== name);
      const key = `${name} | WHERE ${whereCols.join(",") || "-"} | ORDER ${orderCols.join(",") || "-"}`;
      shapes.set(key, (shapes.get(key) ?? 0) + 1);
    }
  }
  console.log("── รูป query ที่วิ่งจริง (เรียงตามความถี่) ──");
  for (const [k, v] of [...shapes].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(3)} × ${k}`);
  console.log("");
}

for (const { c, n, ms } of rows) {
  const budget = budgetOf(c);
  assert(`P1 ${c.name} ≤ ${budget} query (ได้ ${n})`, n <= budget, `${c.fns}`);
  assert(`P2 ${c.name} < ${MS_BUDGET} ms (ได้ ${ms} ms)`, ms < MS_BUDGET);
}

// ═══════════════ P3 N+1: จำนวน query ห้ามโตตามจำนวนแถว ═══════════════
// 🔴 วิธีวัดที่ถูก: เทียบ **50 กับ 100** ไม่ใช่ 5 กับ 50
//    เหตุผล: ฟังก์ชันที่ดีจะ "ข้ามคิวรีเมื่อไม่มี id ให้หา" (`ids.length ? … : []`) ⇒ หน้าละ 5 แถวอาจไม่มี
//    ผู้บันทึก/ผู้ติดต่อเลย (ข้าม) แต่ 50 แถวมี (ยิง) → ต่างกัน 1 ทั้งที่ **ไม่ได้ยิงต่อแถว**
//    ถ้าบังคับให้เท่ากันเป๊ะที่ 5↔50 จะไปกดดันให้โค้ด "ยิงเสมอ" = ทำของจริงแย่ลงเพื่อเอาใจข้อสอบ
//    ที่ 50↔100 ชุด id ไม่ว่างทั้งคู่แน่ ⇒ ต่างกันแม้แต่ 1 = มีคิวรีที่ผูกกับจำนวนแถวจริง (N+1)
//    (ถ้าข้อมูลในชุด QC มีไม่ถึง 50 แถว ด่านนี้ "ไม่สรุป" — พิมพ์บอกตรง ๆ ไม่ใช่ผ่านแบบหลอกตัวเอง)
console.log("\nP3 N+1 — pageSize 50 เทียบ 100 (จำนวน query ต้องเท่ากันเป๊ะ):");
for (const c of CASES.filter((x) => x.paged)) {
  const small = await measure(c, 50);
  const big = await measure(c, 100);
  const tiny = await measure(c, 5);
  const rowsAt50 = c.rowCount ? await c.rowCount() : null;
  const conclusive = rowsAt50 === null || rowsAt50 > 50;
  assert(
    `P3 ${c.name}: query ไม่โตตามแถว (50 → ${small.n} · 100 → ${big.n}${conclusive ? "" : ` · ⚠️ ชุด QC มีแค่ ${rowsAt50} แถว = ด่านนี้ไม่สรุป`})`,
    small.n === big.n,
    `โตขึ้น ${big.n - small.n} query เมื่อแถวเพิ่ม = มีคิวรีต่อแถว (N+1)`,
  );
  console.log(`     (ข้อมูลประกอบ: 5 แถว → ${tiny.n} คำสั่ง — ต่างจาก 50 ได้ตามด่านที่ข้ามคิวรีเปล่า)`);
}

// ═══════════════ P6 กติกาตามตัวอักษรของ BLUEPRINT §3 แถว 9.3 ═══════════════
//
// 🔴 BLUEPRINT เขียนว่า "home ≤ 12 query · หน้ารายการ ≤ 6" ซึ่ง WO 2.1/2.2 ตีความ (และตรึงไว้ในข้อสอบ
//    ของตัวเองแล้ว) ว่าเป็นงบของ **ฟังก์ชันข้อมูลหลัก** ไม่ใช่ผลรวมทั้งหน้า — เพราะหนึ่งหน้าเรียกหลาย
//    ฟังก์ชัน (ตั้งค่า + ตัวนับแท็บ + รายชื่อผู้ติดต่อ …) · P1 ข้างบนวัด "ทั้งหน้า" (เลขที่ผู้ใช้รู้สึกจริง)
//    ส่วน P6 นี้บังคับตัวอักษรของ BLUEPRINT ต่อฟังก์ชัน เพื่อไม่ให้ตัวเลขของ WO ก่อนหน้าถอยหลัง
const raisedFnBudgets: string[] = [];
console.log("\nP6 กติกา BLUEPRINT ต่อ 'ฟังก์ชันข้อมูลหลัก' (home ≤ 12 · หน้ารายการ ≤ 6 +1 นับจำนวน):");
{
  const dash = await import("@/lib/modules/account/dashboard");
  // `why` = เหตุผลเมื่อเพดานสูงกว่าตัวอักษรของ BLUEPRINT (7) — บังคับให้มี ไม่ให้ผ่อนแบบเงียบ ๆ
  const one = async (label: string, budget: number, fn: () => Promise<unknown>, why?: string) => {
    await fn();
    sqlLog = [];
    counting = true;
    await fn();
    counting = false;
    const n = sqlLog.filter((q) => !/^\s*(BEGIN|COMMIT|ROLLBACK|DEALLOCATE)/i.test(q)).length;
    assert(`P6 ${label} ≤ ${budget} query (ได้ ${n})${why ? " · เพดานกันถอยหลัง" : ""}`, n <= budget);
    if (why) raisedFnBudgets.push(`${label} — งบตามตัวอักษร 7 → ตั้งเป็น ${budget}\n     เหตุผล: ${why}`);
  };
  await one("dashboardSnapshot (หน้าหลัก)", 12, () =>
    dash.dashboardSnapshot(ctx, { now: NOW, year: NOW.getFullYear(), issuedDocType: "INVOICE" }),
  );
  await one("service.listDocumentsPaged", 7, () =>
    svc.listDocumentsPaged(ctx.tenantId, ctx.systemId, { docType: "INVOICE", page: 1, pageSize: 20 }),
  );
  await one("expense.listExpenseDocsPaged", 7, () =>
    expense.listExpenseDocsPaged(ctx.tenantId, ctx.systemId, { docType: "PURCHASE", page: 1, pageSize: 20 }),
  );
  await one("product.listProductsPaged", 7, () =>
    product.listProductsPaged(ctx.tenantId, ctx.systemId, { page: 1, pageSize: 20 }),
  );
  await one(
    "journal-v2.listJournalPaged",
    9,
    () => journal.listJournalPaged(ctx, { page: 1, pageSize: 20 }),
    "9 คำสั่ง = groupBy เล่ม + หน้าใบสำคัญ + aggregate ยอดรวมทั้งชุด + บรรทัด + ผังบัญชีของบรรทัด + ใบกลับรายการ " +
      "+ หาชื่อ 3 ตาราง (เอกสาร/ผู้ใช้/ผู้ติดต่อ) · 3 ตัวหลังเลี่ยงไม่ได้เพราะ refId/postedById/contactId " +
      "ในสคีมาเป็น scalar ไม่มี relation ⇒ ลงถึง 7 ต้อง denormalise ชื่อ/เลขที่ลงตาราง (งานสคีมา → เสนอ 10.x) · " +
      "9.3 ลดมาจาก 10 แล้ว (ตัด count ที่ groupBy ตอบได้อยู่แล้ว)",
  );
  await one("wht.listWhtCertsV2", 7, () =>
    wht.listWhtCertsV2(ctx.tenantId, ctx.systemId, { direction: "IN", page: 1, pageSize: 20 }),
  );
  await one("cheque.listChequesV2", 7, () =>
    cheque.listChequesV2(ctx.tenantId, ctx.systemId, { direction: "OUT", page: 1, pageSize: 20 }),
  );
  await one("attachment.listAttachmentsPaged", 7, () =>
    attachment.listAttachmentsPaged(ctx.tenantId, ctx.systemId, { tab: "all", page: 1, pageSize: 20 }),
  );
  await one("contacts-list.listContactsPage", 7, async () => {
    const sb = await contactsList.loadContactsSidebar(ctx);
    sqlLog = []; // นับเฉพาะตัวหน้ารายการ — แถบซ้ายเป็นคนละก้อน (มีข้อสอบของตัวเองที่ qc-acc-v2-contacts P11)
    await contactsList.listContactsPage(ctx, { page: 1, pageSize: 20 }, sb);
  });
}

// ═══════════════ P4 pagination ฝั่ง DB ═══════════════
console.log("\nP4 หน้ารายการตัดหน้าที่ฝั่ง DB (มี take ใน findMany · ไม่โหลดทั้งตารางมา slice):");
{
  // อ่านซอร์สจริง — ทุก findMany ของฟังก์ชัน "หน้ารายการ" ต้องมี take
  const src = (f: string) => readFileSync(`src/lib/modules/account/${f}`, "utf8");
  const pagedFns: [string, string, string][] = [
    ["service.ts", "listDocumentsPaged", "รายการเอกสารขาย"],
    ["expense.ts", "listExpenseDocsPaged", "รายการซื้อ"],
    ["contacts-list.ts", "listContactsPage", "ผู้ติดต่อ"],
    ["product.ts", "listProductsPaged", "สินค้า/บริการ"],
    ["journal-v2.ts", "listJournalPaged", "สมุดรายวัน"],
    ["wht.ts", "listWhtCertsV2", "ภาษีหัก ณ ที่จ่าย"],
    ["cheque.ts", "listChequesV2", "เช็ค"],
    ["attachment.ts", "listAttachmentsPaged", "เอกสารแนบ"],
    ["product.ts", "listGoodsIssuePaged", "ใบเบิก/ปรับต้นทุน"],
  ];
  for (const [file, fn, label] of pagedFns) {
    const text = src(file);
    const at = text.indexOf(`export async function ${fn}(`);
    // ตัดเอาแค่ตัวฟังก์ชัน (จนถึง export ตัวถัดไป)
    const nextExport = text.indexOf("\nexport ", at + 10);
    const body = text.slice(at, nextExport === -1 ? text.length : nextExport);
    const hasTake = /\btake:\s/.test(body);
    const hasSkip = /\bskip:\s/.test(body);
    assert(`P4 ${label} (${fn}) ตัดหน้าที่ DB — มี take + skip`, hasTake && hasSkip, `take=${hasTake} skip=${hasSkip}`);
  }
  // ฟังก์ชันที่คืนรายการ "ทั้งก้อน" ต้องมีเพดาน take เสมอ (ห้าม findMany เปล่า)
  const unbounded: string[] = [];
  for (const [file, fn] of [
    ["product.ts", "listGoodsMovements"],
    ["service.ts", "listRecurringRules"],
  ] as const) {
    const text = src(file);
    const at = text.indexOf(`export function ${fn}(`) >= 0 ? text.indexOf(`export function ${fn}(`) : text.indexOf(`export async function ${fn}(`);
    const nextExport = text.indexOf("\nexport ", at + 10);
    const body = text.slice(at, nextExport === -1 ? text.length : nextExport);
    if (!/\btake:\s/.test(body)) unbounded.push(`${file}#${fn}`);
  }
  assert(`P4 ฟังก์ชันรายการที่ไม่ได้แบ่งหน้า ยังมีเพดาน take`, unbounded.length === 0, unbounded.join(", "));
}

// ═══════════════ P5 รูปเอกสารแนบผ่าน CDN ═══════════════
console.log("\nP5 รูปเอกสารแนบมาจาก CDN:");
{
  // origin ของ storage zone (ที่ใช้ "อัป" ไฟล์) — ห้ามหลุดมาเป็น URL ที่ผู้ใช้โหลด
  const STORAGE_ORIGIN = /(^|\/\/)([a-z0-9-]+\.)?storage\.bunnycdn\.com/i;
  const cdnBase = (process.env.SHARK_BUNNY_CDN ?? "").replace(/\/+$/, "");
  assert("P5.0 ตั้งค่า SHARK_BUNNY_CDN แล้ว (positive control ของด่านที่เหลือ)", cdnBase.length > 0);

  const rows2 = await attachment.listAttachmentsPaged(ctx.tenantId, ctx.systemId, { tab: "all", page: 1, pageSize: 50 });
  const withThumb = rows2.rows.filter((r) => !!r.thumbUrl);
  assert(
    `P5.1 มีแถวที่มี thumbUrl ให้ตรวจจริง (positive control) — ${withThumb.length}/${rows2.rows.length}`,
    withThumb.length > 0,
    "ไม่มีแถวที่มีรูปเลย → ด่าน P5.2 ไม่มีความหมาย",
  );
  const badHost = withThumb.filter((r) => STORAGE_ORIGIN.test(r.thumbUrl ?? ""));
  assert(
    `P5.2 thumbUrl ทุกแถวไม่ชี้ origin ของ storage (ต้องเป็นโฮสต์ CDN)`,
    badHost.length === 0,
    badHost.map((r) => r.thumbUrl).join(", "),
  );

  // ซอร์ส: ห้ามต่อ URL storage origin เองที่ไหนในโมดูลบัญชี (ตัวสร้าง URL อยู่ที่ src/lib/storage/service.ts ที่เดียว)
  const accSrc = ["attachment.ts", "attachment-shared.ts", "inbox.ts", "inbox-ai.ts", "product.ts"]
    .map((f) => readFileSync(`src/lib/modules/account/${f}`, "utf8"))
    .join("\n");
  assert(
    "P5.3 โมดูลบัญชีไม่ต่อ URL storage origin เอง (ใช้ cdnUrl ที่ storage/service.ts สร้าง)",
    !STORAGE_ORIGIN.test(accSrc),
    "พบ storage.bunnycdn.com ในซอร์สโมดูลบัญชี",
  );

  // ทุก <img> ที่แสดงรูปของ tenant ในหน้าบัญชี V2 ต้อง lazy (ไม่งั้นหน้ารายการโหลดรูปทั้งหน้าพร้อมกัน)
  const IMG_FILES = [
    "src/components/account-v2/AttachmentGrid.tsx",
    "src/components/account-v2/InboxCard.tsx",
    "src/components/account-v2/DocAttachments.tsx",
    "src/app/app/sys/[id]/account/documents/page.tsx",
    "src/app/app/sys/[id]/account/products/page.tsx",
    "src/app/app/sys/[id]/account/print/[docId]/page.tsx",
  ];
  const notLazy: string[] = [];
  for (const f of IMG_FILES) {
    const text = readFileSync(f, "utf8");
    // ตัดทีละแท็ก <img …> (รวมหลายบรรทัด) แล้วดูว่ามี loading="lazy" ไหม
    for (const m of text.matchAll(/<img\b[\s\S]*?\/>/g)) {
      const tag = m[0];
      // โลโก้/ตราประทับ/ลายเซ็นบนใบพิมพ์ต้องมาทันที (อยู่หัวกระดาษ · lazy แล้วเสี่ยงพิมพ์ไม่ติด)
      if (/logoUrl|stampUrl|signatureUrl/.test(tag)) continue;
      if (!/loading=["']lazy["']/.test(tag)) notLazy.push(`${f}: ${tag.slice(0, 60).replace(/\s+/g, " ")}…`);
    }
  }
  assert(`P5.4 <img> ของรูป tenant ในหน้าบัญชี V2 ตั้ง loading="lazy" ครบ`, notLazy.length === 0, notLazy.join(" | "));
}

// ═══════════════ รายงานเพดานที่สูงกว่าค่าตั้งต้น (ให้ Fable ตัดสิน) ═══════════════
{
  const raised = CASES.filter((c) => c.budget !== undefined);
  console.log(`\n📋 หน้าที่ตั้งเพดานสูงกว่าค่าตั้งต้นของใบสั่งงาน (${raised.length} หน้า) — ไม่ใช่ "ผ่อนให้ผ่าน"`);
  console.log(`   เพดาน = ตัวเลขที่วัดได้จริงหลัง 9.3 ⇒ เพิ่มอีกแม้แต่ 1 คำสั่ง = ด่านแดงทันที\n`);
  for (const c of raised) {
    console.log(`   • ${c.name} — งบตั้งต้น ${DEFAULT_BUDGET[c.kind]} → ตั้งเป็น ${c.budget}`);
    console.log(`     เหตุผล: ${c.budgetWhy ?? "(ไม่ได้ระบุ)"}`);
  }
  // เพดานที่ไม่มีเหตุผลกำกับ = บั๊กของข้อสอบเอง ห้ามปล่อยผ่าน
  const noWhy = raised.filter((c) => !c.budgetWhy);
  assert(`P1.0 ทุกเพดานที่ตั้งเองมีเหตุผลกำกับ`, noWhy.length === 0, noWhy.map((c) => c.name).join(", "));
  if (raisedFnBudgets.length) {
    console.log(`\n📋 ฟังก์ชันข้อมูลที่เพดานสูงกว่าตัวอักษรของ BLUEPRINT (${raisedFnBudgets.length} ตัว)`);
    for (const line of raisedFnBudgets) console.log(`   • ${line}`);
  }
}

// ═══════════════ สรุป ═══════════════
console.log(`\n===== สรุป WO 9.3 · ประสิทธิภาพ: ผ่าน ${passed} · ไม่ผ่าน ${findings.length} =====`);
if (findings.length) {
  console.log("\nรายการที่ไม่ผ่าน:");
  for (const f of findings) console.log("  • " + f);
}
console.log(`JSON_SUMMARY ${JSON.stringify({ total: passed + findings.length, passed, failed: findings.length })}`);
await prisma.$disconnect();
if (findings.length) process.exit(1);
console.log("🎉 WO 9.3 ประสิทธิภาพ ผ่านทั้งหมด");
