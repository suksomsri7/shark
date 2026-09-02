// ด่านตรวจชุดข้อมูล QC บัญชี V2 — อ่าน DB จริงด้วย "service ตัวเดียวกับที่หน้าจอใช้" แล้วเทียบเฉลย
//
// ใช้:  pnpm exec tsx scripts/qc-acc-v2-seed-check.mts
// ตก 1 ข้อ = exit 1 (ห้ามเขียวตอนวัดอะไรไม่ได้ — ไม่มีข้อมูล = ตก ไม่ใช่ข้าม)
//
// 🔴 ชื่อไฟล์ขึ้นต้น `qc-` แต่ **ไม่ได้อยู่ใน qc:all** โดยตั้งใจ — ชุดนี้ต้องมี `.env.qc` + Neon branch
//    ของงานบัญชี V2 เท่านั้น (CI ไม่มี) · Fable เป็นคนสั่งรัน
//
// เฉลย = scripts/acc-v2-expected.json (เขียนโดย seed ทุกครั้ง → ไม่มีทางหลุดจากกัน)

import { readFileSync, existsSync } from "node:fs";
// tsconfig ไม่ได้เปิด allowImportingTsExtensions → import แบบ static ที่ลงท้าย .mts จะ typecheck ไม่ผ่าน
// ⇒ โหลดแบบ dynamic (tsx resolve ตอนรันได้ปกติ) แล้วประกาศชนิดไว้เอง
const accEnv = (await import("./acc-v2-env.mts" as string)) as {
  loadQcEnv: () => { databaseUrl: string; host: string };
  QC: {
    tenantName: string;
    tenantSlug: string;
    ownerEmail: string;
    ownerName: string;
    expectedPath: string;
    shotsDir: string;
    today: string;
    oracleValidUntil: string;
  };
};
const { loadQcEnv, QC } = accEnv;

const { host } = loadQcEnv();
if (!existsSync(QC.expectedPath)) {
  console.error(`❌ ไม่พบเฉลย ${QC.expectedPath} — รัน pnpm exec tsx scripts/seed-acc-v2-qc.mts ก่อน`);
  process.exit(1);
}
const E = JSON.parse(readFileSync(QC.expectedPath, "utf8"));

const { prisma } = await import("@/lib/core/db");
const svc = await import("@/lib/modules/account/service");
const exp = await import("@/lib/modules/account/expense");
const fin = await import("@/lib/modules/account/finance");
const prod = await import("@/lib/modules/account/product");
const reports = await import("@/lib/modules/account/reports");

let pass = 0;
let fail = 0;
const baht = (s: number) => (s / 100).toLocaleString("th-TH", { minimumFractionDigits: 2 });
function chk(id: string, desc: string, ok: boolean, actual: unknown, want?: unknown) {
  if (ok) {
    pass++;
    console.log(`  ✅ [${id}] ${desc}`);
  } else {
    fail++;
    console.log(`  ❌ [${id}] ${desc} — ได้ ${JSON.stringify(actual)}${want === undefined ? "" : ` ต้องการ ${JSON.stringify(want)}`}`);
  }
}
const eq = (id: string, desc: string, actual: unknown, want: unknown) =>
  chk(id, desc, JSON.stringify(actual) === JSON.stringify(want), actual, want);

console.log(`🗄️  DB QC: ${host}`);
console.log(`📄 เฉลย: ${QC.expectedPath} (seed เมื่อ ${E.generatedAt})\n`);

const tenantId: string = E.tenantId;
const systemId: string = E.systemId;

// ─────────── A. ร้าน / ผู้ใช้ / ระบบ ───────────
console.log("A. ร้าน · ผู้ใช้ · ระบบที่เชื่อมกัน");
const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
eq("A1", `ร้าน QC ชื่อ "${QC.tenantName}"`, tenant?.name ?? null, QC.tenantName);

const member = await prisma.membership.findFirst({
  where: { tenantId, user: { email: QC.ownerEmail } },
  select: { role: true, acceptedAt: true, userId: true },
});
chk("A2", `เจ้าของร้าน ${QC.ownerEmail} เป็น OWNER และรับคำเชิญแล้ว`, member?.role === "OWNER" && !!member?.acceptedAt, {
  role: member?.role,
  acceptedAt: member?.acceptedAt,
});
eq("A3", "userId ของเจ้าของตรงกับเฉลย", member?.userId ?? null, E.ownerUserId);

const systems = await prisma.appSystem.findMany({ where: { tenantId }, select: { id: true, type: true, name: true } });
const byType = new Map(systems.map((s) => [s.type, s]));
eq("A4", "มีระบบครบ 5 (ACCOUNT · POS · INVENTORY · MEMBER · CRM)", [...byType.keys()].sort(), ["ACCOUNT", "CRM", "INVENTORY", "MEMBER", "POS"]);
eq("A5", 'ระบบบัญชีชื่อ "บัญชี" และ id ตรงเฉลย', { id: byType.get("ACCOUNT")?.id, name: byType.get("ACCOUNT")?.name }, { id: E.systems.ACCOUNT, name: "บัญชี" });
const unitLinks = await prisma.appSystemUnit.count({ where: { tenantId, unitId: E.unitId } });
eq("A6", "ทั้ง 5 ระบบผูกกับสาขาเดียวกัน (AppSystemUnit)", unitLinks, 5);
const posLink = await svc.findAccountLinkFor(tenantId, "POS", E.systems.POS);
chk("A7", "POS เชื่อมเข้าระบบบัญชี (AccountSystemLink · แบบเดียวกับ DNA LINK_ACCOUNT_POS)", posLink?.systemId === systemId, posLink?.systemId, systemId);
const crmLink = await svc.findAccountLinkFor(tenantId, "CRM", E.systems.CRM);
chk("A8", "CRM เชื่อมเข้าระบบบัญชี", crmLink?.systemId === systemId, crmLink?.systemId, systemId);

// ─────────── B. หน้าหลัก (f1) ───────────
console.log("\nB. ตัวเลขหน้าหลัก (เฟรม f1)");
const stats = await svc.overviewStats(tenantId, systemId);
eq("B1", `ค้างรับ = ฿${baht(E.receivable)}`, stats.receivable, E.receivable);
eq("B2", `พ้นกำหนด (ยอด) = ฿${baht(E.overdueAmount)}`, stats.overdueAmount, E.overdueAmount);
eq("B3", `พ้นกำหนด (จำนวนใบ) = ${E.overdueDocs}`, stats.overdueCount, E.overdueDocs);

const openInv = await prisma.accountDocument.findMany({
  where: { tenantId, systemId, docType: "INVOICE", status: { in: ["AWAITING_PAYMENT", "PARTIAL"] } },
  select: { contactId: true },
});
eq("B4", `ใบแจ้งหนี้ที่ยังค้างรับ = ${E.receivableDocs} ใบ`, openInv.length, E.receivableDocs);
eq("B5", `ลูกค้าที่ค้างชำระ = ${E.receivableCustomers} ราย`, new Set(openInv.map((d) => d.contactId)).size, E.receivableCustomers);

const pay = await exp.payableStats(tenantId, systemId);
eq("B6", `ค้างจ่าย = ฿${baht(E.payable)}`, pay.payable, E.payable);
const openBills = await prisma.accountDocument.findMany({
  where: { tenantId, systemId, direction: "IN", status: { in: ["AWAITING_PAYMENT", "PARTIAL"] } },
  select: { contactId: true },
});
eq("B7", `เอกสารค้างจ่าย = ${E.payableDocs} ใบ`, openBills.length, E.payableDocs);
eq("B8", `ผู้ขายที่ค้างจ่าย = ${E.payableVendors} ราย`, new Set(openBills.map((d) => d.contactId)).size, E.payableVendors);
eq("B9", `เอกสารจ่ายที่พ้นกำหนด = ${E.payableOverdueDocs} ใบ`, pay.overdueCount, E.payableOverdueDocs);

// ─────────── C. ช่องทางการเงิน (f7 / §10.1) ───────────
console.log("\nC. ช่องทางการเงิน (§10.1)");
const balances = await fin.financeBalances(tenantId, systemId);
const balById = new Map(balances.map((b) => [b.id, b]));
for (const f of E.financeAccounts as { code: string; id: string; name: string; balance: number }[]) {
  const row = balById.get(f.id);
  eq(`C-${f.code}`, `${f.code} ${f.name} = ฿${baht(f.balance)}`, row?.balance ?? null, f.balance);
}
eq("C-TOTAL", `ยอดรวมทุกช่องทาง = ฿${baht(E.finance.total)}`, balances.reduce((a, b) => a + b.balance, 0), E.finance.total);
eq("C-COUNT", "จำนวนช่องทางการเงิน = 4", balances.length, 4);

// ─────────── D. แท็บหน้ารายการใบแจ้งหนี้ (§3) ───────────
console.log("\nD. แท็บหน้ารายการใบแจ้งหนี้ (§3)");
const invoices = await prisma.accountDocument.findMany({
  where: { tenantId, systemId, docType: "INVOICE" },
  select: { status: true, dueDate: true, validUntil: true },
});
const tab = {
  all: invoices.length,
  draft: invoices.filter((d) => d.status === "DRAFT").length,
  awaiting: invoices.filter((d) => d.status === "AWAITING_PAYMENT" && !svc.isOverdue(d)).length,
  partial: invoices.filter((d) => d.status === "PARTIAL" && !svc.isOverdue(d)).length,
  paid: invoices.filter((d) => d.status === "PAID").length,
  overdue: invoices.filter((d) => svc.isOverdue(d)).length,
  cancelled: invoices.filter((d) => d.status === "CANCELLED" || d.status === "VOIDED").length,
};
for (const [k, label] of [
  ["all", "ทั้งหมด"],
  ["draft", "ร่าง"],
  ["awaiting", "รอชำระ"],
  ["partial", "ชำระบางส่วน"],
  ["paid", "ชำระแล้ว"],
  ["overdue", "พ้นกำหนด"],
  ["cancelled", "ยกเลิก"],
] as const) {
  eq(`D-${k}`, `แท็บ ${label} = ${E.invoiceTabs[k]}`, tab[k], E.invoiceTabs[k]);
}
// อ่านผ่าน service ที่หน้าจอใช้จริงด้วย (listDocuments) — ไม่ใช่นับจากตารางอย่างเดียว
const listAll = await svc.listDocuments(tenantId, systemId, "INVOICE", { tab: "all", take: 500 });
eq("D-svc-all", "listDocuments(tab=ทั้งหมด) คืน 51 ใบ", listAll.length, E.invoiceTabs.all);
const listPaid = await svc.listDocuments(tenantId, systemId, "INVOICE", { tab: "paid", take: 500 });
eq("D-svc-paid", "listDocuments(tab=ชำระแล้ว) คืน 29 ใบ", listPaid.length, E.invoiceTabs.paid);
const listOverdue = await svc.listDocuments(tenantId, systemId, "INVOICE", { tab: "overdue", take: 500 });
eq("D-svc-overdue", "listDocuments(tab=พ้นกำหนด) คืน 4 ใบ", listOverdue.length, E.invoiceTabs.overdue);

// ─────────── E. ผู้ติดต่อ + สินค้า ───────────
console.log("\nE. ผู้ติดต่อ (f5) · สินค้า (f6)");
const contacts = await svc.listContacts(tenantId, systemId, { includeArchived: true });
eq("E1", `ผู้ติดต่อทั้งหมด = ${E.contacts.all}`, contacts.length, E.contacts.all);
eq("E2", `ลูกค้า = ${E.contacts.customer}`, contacts.filter((c) => c.kind === "CUSTOMER").length, E.contacts.customer);
eq("E3", `ผู้ขาย = ${E.contacts.vendor}`, contacts.filter((c) => c.kind === "VENDOR").length, E.contacts.vendor);
eq("E4", `เก็บเข้ากรุ = ${E.contacts.archived}`, contacts.filter((c) => c.archivedAt !== null).length, E.contacts.archived);
const active = await svc.listContacts(tenantId, systemId);
eq("E5", `ผู้ติดต่อที่ยังใช้งาน (listContacts default) = ${E.contacts.active}`, active.length, E.contacts.active);
eq("E6", "overviewStats.contactCount นับเฉพาะที่ยังใช้งาน", stats.contactCount, E.contacts.active);
const products = await prod.listProducts(tenantId, systemId);
eq("E7", `สินค้า/บริการ = ${E.products}`, products.length, E.products);
chk("E8", "มีทั้งสินค้าและบริการ (ไม่ใช่ชนิดเดียว)", products.some((p) => p.type === "GOODS") && products.some((p) => p.type === "SERVICE"), products.map((p) => p.type).join(","));

// ─────────── F. แกนบัญชีคู่ ───────────
console.log("\nF. แกนบัญชีคู่ (งบทดลอง · บัญชีพัก · ธงต้องตรวจ)");
const tb = await reports.trialBalance({ tenantId, systemId }, "2026-01", "2026-12");
chk("F1", "งบทดลองสมดุล (ปิดยอด Dr = Cr)", tb.balanced, { dr: tb.totals.closingDebit, cr: tb.totals.closingCredit });
eq("F2", "เดบิตรวม = เครดิตรวม (ความเคลื่อนไหว)", tb.totals.movementDebit, tb.totals.movementCredit);
const review = await prisma.accountJournalEntry.count({ where: { systemId, needsReview: true } });
eq("F3", "ไม่มี JV ที่ต้องตรวจ (needsReview)", review, E.journal.needsReview);
const suspense = await prisma.accountLedger.findFirst({ where: { systemId, code: "9999" }, select: { id: true } });
const susp = suspense
  ? await prisma.accountJournalLine.aggregate({ where: { systemId, accountId: suspense.id }, _sum: { debit: true, credit: true } })
  : null;
eq("F4", "บัญชีพักรายการ 9999 คงเหลือ = 0", (susp?._sum.debit ?? 0) - (susp?._sum.credit ?? 0), E.journal.suspense9999);
// ทุกใบสำคัญต้องสมดุลในตัวเอง ไม่ใช่แค่ยอดรวมทั้งระบบหักล้างกันพอดี
const perEntry = await prisma.accountJournalLine.groupBy({
  by: ["entryId"],
  where: { systemId },
  _sum: { debit: true, credit: true },
});
const unbalanced = perEntry.filter((e) => (e._sum.debit ?? 0) !== (e._sum.credit ?? 0));
eq("F5", `ใบสำคัญทุกใบสมดุลรายใบ (${perEntry.length} ใบ)`, unbalanced.length, 0);
chk("F6", "มีใบสำคัญเกิดขึ้นจริง (ไม่ใช่ 0 ใบ = วัดอะไรไม่ได้)", perEntry.length > 60, perEntry.length);

// ─────────── G. fixture ที่ WO ถัดไปอ้างถึง ───────────
console.log("\nG. fixture ที่ WO ถัดไปใช้อ้าง");
const fx = E.fixtures;
const c19 = await svc.getContact(tenantId, systemId, fx.contactC00019Id);
chk("G1", 'ผู้ติดต่อ C00019 = "ปิยธิดา อินสุ่ม" (บุคคลธรรมดา)', c19?.name === fx.contactC00019Name && c19?.legalType === "PERSON", {
  name: c19?.name,
  legalType: c19?.legalType,
});
const ivP = await svc.getDocument(tenantId, systemId, fx.invPiyathidaId);
chk(
  "G2",
  `ใบแจ้งหนี้ปิยธิดา ฿${baht(fx.invPiyathidaGrand)} ออก ${fx.invPiyathidaIssue} ครบกำหนด ${fx.invPiyathidaDue} และพ้นกำหนดแล้ว`,
  ivP?.grandTotal === fx.invPiyathidaGrand &&
    ivP?.issueDate.toISOString().slice(0, 10) === fx.invPiyathidaIssue &&
    ivP?.dueDate?.toISOString().slice(0, 10) === fx.invPiyathidaDue &&
    !!ivP && svc.isOverdue(ivP),
  {
    grand: ivP?.grandTotal,
    issue: ivP?.issueDate.toISOString().slice(0, 10),
    due: ivP?.dueDate?.toISOString().slice(0, 10),
    overdue: ivP ? svc.isOverdue(ivP) : null,
  },
);
const ivN = await svc.getDocument(tenantId, systemId, fx.invNattapholId);
eq("G3", `ใบแจ้งหนี้คุณณัฐพล ยอดสุทธิ ฿${baht(fx.invNattapholGrand)}`, ivN?.grandTotal ?? null, fx.invNattapholGrand);
eq(
  "G4",
  "…แยกเป็น ฐาน 23,271.03 + VAT 7% 1,628.97 (โหมดราคาแยก VAT)",
  { sub: ivN?.subTotal, vat: ivN?.vatAmount, mode: ivN?.vatMode },
  { sub: fx.invNattapholSubTotal, vat: fx.invNattapholVat, mode: "EXCLUDE" },
);
eq(
  "G5",
  "…3 บรรทัด: ทริปสิมิลัน 2×9,900 · เช่าอุปกรณ์ 2×1,200 · เสื้อ 1×1,071.03",
  (ivN?.lines ?? []).map((l) => [l.description, Number(l.qty), l.unitPrice]),
  [
    ["ทริปสิมิลัน 3 วัน 2 คืน", 2, 990_000],
    ["ค่าเช่าอุปกรณ์ดำน้ำ", 2, 120_000],
    ["เสื้อ SIAM DIVE", 1, 107_103],
  ],
);
const dep = await svc.getDocument(tenantId, systemId, fx.depositNattapholId);
chk(
  "G6",
  `ใบรับเงินมัดจำคุณณัฐพล ฿${baht(fx.depositNattapholGrand)} รับครบแล้ว (รอหักมัดจำ)`,
  dep?.grandTotal === fx.depositNattapholGrand && dep?.status === "AWAITING_DEDUCT",
  { grand: dep?.grandTotal, status: dep?.status },
);
const ivS = await svc.getDocument(tenantId, systemId, fx.invSimilanViewId);
chk(
  "G7",
  `ใบแจ้งหนี้โรงแรมสิมิลันวิว ฿${baht(fx.invSimilanViewGrand)} ชำระแล้ว ฿${baht(fx.invSimilanViewPaid)} คงเหลือ ฿${baht(fx.invSimilanViewRemain)}`,
  ivS?.grandTotal === fx.invSimilanViewGrand &&
    ivS?.paidTotal === fx.invSimilanViewPaid &&
    ivS?.status === "PARTIAL" &&
    (ivS?.grandTotal ?? 0) - (ivS?.paidTotal ?? 0) === fx.invSimilanViewRemain,
  { grand: ivS?.grandTotal, paid: ivS?.paidTotal, status: ivS?.status },
);

// ─────────── H. อายุของข้อสอบ ───────────
console.log("\nH. อายุของชุดข้อมูล");
chk(
  "H1",
  `ยังอยู่ในช่วงที่ตัวเลข "พ้นกำหนด" เชื่อถือได้ (ถึง ${E.oracleValidUntil})`,
  Date.now() <= new Date(`${E.oracleValidUntil}T23:59:59+07:00`).getTime(),
  new Date().toISOString().slice(0, 10),
  `≤ ${E.oracleValidUntil}`,
);

console.log(`\n===== QC SEED CHECK บัญชี V2 =====`);
console.log(`ผ่าน ${pass} · ตก ${fail} (รวม ${pass + fail} ข้อ)`);
await prisma.$disconnect();
process.exit(fail > 0 ? 1 : 0);
