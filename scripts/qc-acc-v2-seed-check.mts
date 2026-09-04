// ด่านตรวจชุดข้อมูล QC บัญชี V2 — อ่าน DB จริงด้วย "service ตัวเดียวกับที่หน้าจอใช้" แล้วเทียบเฉลย
//
// ใช้:  pnpm exec tsx scripts/qc-acc-v2-seed-check.mts
// ตก 1 ข้อ = exit 1 (ห้ามเขียวตอนวัดอะไรไม่ได้ — ไม่มีข้อมูล = ตก ไม่ใช่ข้าม)
//
// requires: acc-v2-seed
// ↑ marker (WO 0.7) — `qc-all.mts` เห็นบรรทัดนี้แล้วจะ seed ชุดข้อมูล QC ให้ครั้งเดียวก่อนรันส่วนนี้
//    (บน CI = Neon branch เปล่า ⇒ seed เต็ม + สร้างเฉลยใหม่ · เครื่อง dev ที่มีข้อมูลอยู่แล้ว = ข้าม)
//    env: มี `.env.qc` ใช้ไฟล์ · ไม่มีแต่มี DATABASE_URL/DIRECT_URL ใน env = โหมด CI (acc-v2-env.mts)
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
// WO 6.1 รอบ 2: ยอดคิด "ณ วันที่" ⇒ ตรึงที่ QC.today ไม่งั้นเฉลยขยับตามนาฬิกาเครื่อง
const QC_ASOF = new Date(`${QC.today}T12:00:00+07:00`);
const balances = await fin.financeBalances(tenantId, systemId, QC_ASOF);
const balById = new Map(balances.map((b) => [b.id, b]));
for (const f of E.financeAccounts as { code: string; id: string; name: string; balance: number }[]) {
  const row = balById.get(f.id);
  eq(`C-${f.code}`, `${f.code} ${f.name} = ฿${baht(f.balance)}`, row?.balance ?? null, f.balance);
}
eq("C-TOTAL", `ยอดรวมทุกช่องทาง = ฿${baht(E.finance.total)}`, balances.reduce((a, b) => a + b.balance, 0), E.finance.total);
eq("C-COUNT", "จำนวนช่องทางการเงิน = 4", balances.length, 4);

// WO 5.1 — รหัสช่องทาง persist จริง (ไม่ใช่แค่ key ในสคริปต์ seed) + ช่องทางปิดใช้งานไม่นับ + ยอดยกมา 2 รายการของ BSV001
for (const f of E.financeAccounts as { code: string; id: string }[]) {
  eq(`C-code-${f.code}`, `${f.code} มีรหัส persist = ${f.code}`, balById.get(f.id)?.code ?? null, f.code);
}
if (E.financeArchived) {
  const archivedRow = balById.get(E.financeArchived.id);
  chk("C-archived-hidden", "ช่องทางที่ปิดใช้งานไม่โผล่ใน financeBalances", archivedRow === undefined, archivedRow);
}
if (E.financeOpeningSplit) {
  const split = E.financeOpeningSplit as { financeId: string; entries: unknown[]; sum: number };
  const entries = await fin.listFinanceOpeningEntries(split.financeId);
  eq("C-opening-split-count", "BSV001 ยอดยกมา 2 รายการแยกกัน", entries.length, split.entries.length);
  eq("C-opening-split-sum", "ผลรวมยอดยกมา 2 รายการ = ยอดยกมารวมเดิม", entries.reduce((s, e) => s + e.amountSatang, 0), split.sum);
}

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
eq("F3", `JV ที่ติดธงต้องตรวจ = เฉลย (${E.journal.needsReview} ใบ · ตั้งใจใส่ใน ก.ย. เพื่อทดสอบปิดงวด)`, review, E.journal.needsReview);
const suspense = await prisma.accountLedger.findFirst({ where: { systemId, code: "9999" }, select: { id: true } });
const susp = suspense
  ? await prisma.accountJournalLine.aggregate({ where: { systemId, accountId: suspense.id }, _sum: { debit: true, credit: true } })
  : null;
eq("F4", `บัญชีพักรายการ 9999 คงเหลือ = เฉลย (${E.journal.suspense9999} สตางค์)`, (susp?._sum.debit ?? 0) - (susp?._sum.credit ?? 0), E.journal.suspense9999);
// 🔴 ข้อใหม่ WO 6.2 (แข็งกว่าเดิม): งวดสะสมถึงสิ้น ส.ค. ต้อง "สะอาด" ทั้งธง ⚑ และบัญชีพัก
//    ไม่งั้นงวด ส.ค. ที่ seed ปิดไว้จะปิดไม่ได้ตั้งแต่แรก (gl.closePeriod ปฏิเสธ) = ชุดข้อมูลขัดแย้งกันเอง
const reviewAug = await prisma.accountJournalEntry.count({
  where: { systemId, needsReview: true, periodKey: { lte: "2026-08" } },
});
eq("F4b", "ไม่มีธง ⚑ ในงวดสะสมถึงสิ้น ส.ค. (เงื่อนไขที่ทำให้ปิดงวด ส.ค. ได้)", reviewAug, E.journal.needsReviewThroughAug);
const suspAug = suspense
  ? await prisma.accountJournalLine.aggregate({
      where: { systemId, accountId: suspense.id, entry: { periodKey: { lte: "2026-08" } } },
      _sum: { debit: true, credit: true },
    })
  : null;
eq("F4c", "บัญชีพัก 9999 สะสมถึงสิ้น ส.ค. = 0", (suspAug?._sum.debit ?? 0) - (suspAug?._sum.credit ?? 0), E.journal.suspense9999ThroughAug);
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

// ─────────── I. ผู้ติดต่อ V2 (WO 3.2 §7.1 — กลุ่มกำหนดเอง + ป้าย "ที่มา") ───────────
console.log("\nI. ผู้ติดต่อ V2 (WO 3.2)");
const groups = await prisma.accountContactGroup.findMany({
  where: { systemId },
  include: { _count: { select: { members: true } } },
  orderBy: { sortOrder: "asc" },
});
chk("I1", "มีกลุ่มผู้ติดต่อกำหนดเอง 3 กลุ่ม", groups.length === 3, groups.map((g) => g.name));
const gVip = groups.find((g) => g.name === "ลูกค้า VIP");
// WO 3.4: +1 = ตัวรองของ "คู่ผู้ติดต่อซ้ำ" (C00007) ถูกใส่ไว้ในกลุ่มเดียวกับตัวหลัก C00001 โดยตั้งใจ
// เพื่อให้ข้อสอบ merge ตรวจกิ่ง "กลุ่มซ้ำ → ต้องลบทิ้ง ไม่ใช่ย้าย" ได้จริง (unique(groupId,contactId))
chk("I2", 'กลุ่ม "ลูกค้า VIP" มีสมาชิก 6 ราย (5 เดิม + ตัวรองของคู่ซ้ำ WO 3.4)', gVip?._count.members === 6, gVip?._count.members);
const gHotel = groups.find((g) => g.name === "โรงแรมพันธมิตร");
// WO 3.4: +1 = ตัวรองของคู่ซ้ำ (กลุ่มที่ตัวหลักไม่ได้อยู่ → ตอนรวมต้อง "ย้าย")
chk("I3", 'กลุ่ม "โรงแรมพันธมิตร" มีสมาชิก 5 ราย (4 เดิม + ตัวรองของคู่ซ้ำ WO 3.4)', gHotel?._count.members === 5, gHotel?._count.members);
const gSupplier = groups.find((g) => g.name === "ซัพพลายเออร์หลัก");
chk("I4", 'กลุ่ม "ซัพพลายเออร์หลัก" มีสมาชิก 4 ราย', gSupplier?._count.members === 4, gSupplier?._count.members);

const c19b = await prisma.accountContact.findUnique({ where: { id: fx.contactC00019Id }, select: { partyId: true } });
const linkedCustomer = c19b?.partyId ? await prisma.customer.findFirst({ where: { partyId: c19b.partyId } }) : null;
chk(
  "I5",
  'ป้าย "สมาชิก": ปิยธิดา อินสุ่ม มี Customer เชื่อม partyId เดียวกัน',
  !!c19b?.partyId && linkedCustomer?.partyId === c19b.partyId,
  { contactPartyId: c19b?.partyId, customerPartyId: linkedCustomer?.partyId },
);
const somchai = await prisma.accountContact.findFirst({ where: { systemId, name: "คุณสมชาย ใจดี" }, select: { partyId: true } });
const linkedCrm = somchai?.partyId ? await prisma.crmContact.findFirst({ where: { partyId: somchai.partyId } }) : null;
chk(
  "I6",
  'ป้าย "CRM": คุณสมชาย ใจดี มี CrmContact เชื่อม partyId เดียวกัน',
  !!somchai?.partyId && linkedCrm?.partyId === somchai.partyId,
  { contactPartyId: somchai?.partyId, crmContactPartyId: linkedCrm?.partyId },
);

// ─────────── J. คู่ผู้ติดต่อซ้ำที่ตั้งใจใส่ (WO 3.4 §7.3 — fixture ของหน้า "รวมผู้ติดต่อซ้ำ") ───────────
// ⚠️ ห้ามลดทอน: ข้อ I1–I6 เดิมยังอยู่ครบ · หมวดนี้ "เพิ่ม" อีก 7 ข้อ
console.log("\nJ. คู่ผู้ติดต่อซ้ำที่ตั้งใจใส่ (WO 3.4)");
const MD = (E as unknown as { mergeDuplicate?: {
  taxId: string | null;
  sharedGroups: number;
  totalDocsAfterMerge: number;
  primary: { id: string; code: string | null; branchCode: string | null; docs: number };
  secondary: { id: string; code: string | null; branchCode: string | null; docs: number; docTypes: number; journalLines: number; groups: number; recurringRules: number };
} }).mergeDuplicate;
chk("J1", "เฉลยมีคีย์ mergeDuplicate (รัน acc-v2-expected-contact-profile.mts แล้ว)", !!MD, MD ? "มี" : "ไม่มี");
if (MD) {
  const [pRow, sRow] = await Promise.all([
    prisma.accountContact.findUnique({ where: { id: MD.primary.id }, select: { taxId: true, branchCode: true, archivedAt: true, mergedIntoId: true } }),
    prisma.accountContact.findUnique({ where: { id: MD.secondary.id }, select: { taxId: true, branchCode: true, archivedAt: true, mergedIntoId: true } }),
  ]);
  chk("J2", "คู่ซ้ำใช้เลขภาษีเดียวกัน", !!pRow?.taxId && pRow?.taxId === sRow?.taxId, { p: pRow?.taxId, s: sRow?.taxId });
  chk("J3", "คู่ซ้ำอยู่คนละสาขา (DB ห้าม taxId+branchCode ซ้ำในรายที่ยังใช้งาน)", pRow?.branchCode !== sRow?.branchCode, { p: pRow?.branchCode, s: sRow?.branchCode });
  chk("J4", "ทั้งคู่ยังใช้งานอยู่ (ยังไม่ถูกรวม/ปิดใช้งาน)", !pRow?.archivedAt && !sRow?.archivedAt && !pRow?.mergedIntoId && !sRow?.mergedIntoId, {
    p: { archived: pRow?.archivedAt, merged: pRow?.mergedIntoId },
    s: { archived: sRow?.archivedAt, merged: sRow?.mergedIntoId },
  });
  chk("J5", `ตัวรองมีเอกสาร ${MD.secondary.docs} ใบ (ต้อง ≥ 14)`, MD.secondary.docs >= 14, MD.secondary.docs, "≥ 14");
  chk("J6", `ตัวรองมีเอกสาร ${MD.secondary.docTypes} ชนิด (ต้อง ≥ 4)`, MD.secondary.docTypes >= 4, MD.secondary.docTypes, "≥ 4");
  chk(
    "J7",
    "ตัวรองมี JV ≥1 · กลุ่ม 2 (ซ้ำกับตัวหลัก 1) · กฎเอกสารประจำ 1",
    MD.secondary.journalLines >= 1 && MD.secondary.groups === 2 && MD.sharedGroups === 1 && MD.secondary.recurringRules === 1,
    { jv: MD.secondary.journalLines, groups: MD.secondary.groups, shared: MD.sharedGroups, rules: MD.secondary.recurringRules },
  );
}

// ─────────── K. บิลขายหน้าร้าน POS (WO 4.2 · MAP §F.13) ───────────
// ⚠️ ห้ามลดทอน: หมวด A–J เดิมอยู่ครบ · หมวดนี้ "เพิ่ม" อีก 8 ข้อ
console.log("\nK. บิลขายหน้าร้าน (POS ส่งบรรทัด — WO 4.2)");
const PS = (E as unknown as { posSales?: {
  docType: string;
  count: number;
  lineCount: number;
  grandTotal: number;
  withContact: number;
  sales: { key: string; saleId: string; receiptNo: string | null; grandTotalSatang: number }[];
} }).posSales;
chk("K1", "เฉลยมีคีย์ posSales (seed ใหม่หลัง WO 4.2 แล้ว)", !!PS, PS ? "มี" : "ไม่มี");
if (PS) {
  const posDocs = await prisma.accountDocument.findMany({
    where: { tenantId, systemId, docType: "TAX_INVOICE_ABB" },
    include: { lines: true },
  });
  eq("K2", `เอกสารบิลขายหน้าร้าน ${PS.count} ใบ`, posDocs.length, PS.count);
  eq("K3", `บรรทัดสินค้ารวม ${PS.lineCount} บรรทัด`, posDocs.reduce((n, d) => n + d.lines.length, 0), PS.lineCount);
  eq(
    "K4",
    "ทุกบรรทัดผูกทะเบียนสินค้า (productId) — รายงาน 'ขายอะไรดี' นับได้",
    posDocs.reduce((n, d) => n + d.lines.filter((l) => l.productId).length, 0),
    PS.lineCount,
  );
  eq("K5", `ยอดรวมบิล POS = ฿${baht(PS.grandTotal)}`, posDocs.reduce((n, d) => n + d.grandTotal, 0), PS.grandTotal);
  eq("K6", "ใบที่ผูกผู้ติดต่อ (สมาชิก) / ใบเดินเข้าร้าน", posDocs.filter((d) => d.contactId).length, PS.withContact);
  const posEntries = await prisma.accountJournalEntry.count({ where: { systemId, refType: "PosSale" } });
  eq("K7", "JV ของบิล POS = 1 ต่อบิล (ไม่เบิ้ล)", posEntries, PS.count);
  const docEntries = await prisma.accountJournalEntry.count({
    where: { systemId, refType: "AccountDocument", refId: { in: posDocs.map((d) => d.id) } },
  });
  eq("K8", "เอกสารบิล POS ไม่มี JV ของตัวเอง (กันรายได้ซ้ำ 2 เท่า)", docEntries, 0);
}

// ─────────── L. กระทบยอดธนาคาร (WO 5.3) ───────────
console.log("\nL. กระทบยอดธนาคาร (statement ที่ seed นำเข้าไว้)");
const BR = (E as unknown as {
  bankReconcile?: {
    financeId: string;
    financeCode: string;
    periodKey: string;
    openingSatang: number;
    systemClosingSatang: number;
    statementClosingSatang: number;
    differenceBeforeSatang: number;
    rowCount: number;
    expectMatched: number;
    expectSuggested: number;
    expectUnmatched: number;
    fileName: string;
  };
}).bankReconcile;
chk("L1", "เฉลยมีคีย์ bankReconcile (seed ใหม่หลัง WO 5.3 แล้ว)", !!BR, BR ? "มี" : "ไม่มี");
if (BR) {
  const st = await prisma.accountBankStatement.findFirst({
    where: { tenantId, systemId, financeId: BR.financeId, periodKey: BR.periodKey },
  });
  chk("L2", `มีใบ statement ของ ${BR.financeCode} งวด ${BR.periodKey}`, !!st, st ? "มี" : "ไม่มี");
  if (st) {
    eq("L3", `แถวในใบ = ${BR.rowCount}`, st.rowCount, BR.rowCount);
    eq("L4", `ยอดปลายงวดตาม statement = ฿${baht(BR.statementClosingSatang)}`, st.closingBalanceSatang, BR.statementClosingSatang);
    eq("L5", `ยอดยกมาตาม statement = ฿${baht(BR.openingSatang)}`, st.openingBalanceSatang ?? 0, BR.openingSatang);
    chk("L6", "ยังไม่ยืนยันกระทบยอด (สถานะเดียวกับภาพ g10)", st.confirmedAt === null, String(st.confirmedAt));
    const byStatus = await prisma.accountBankStatementLine.groupBy({
      by: ["status"],
      where: { tenantId, systemId, statementId: st.id },
      _count: { _all: true },
    });
    const cnt = (k: string) => byStatus.find((b) => b.status === k)?._count._all ?? 0;
    eq("L7", `จับคู่แล้ว ${BR.expectMatched} แถว`, cnt("MATCHED"), BR.expectMatched);
    eq("L8", `แนะนำจับคู่ ${BR.expectSuggested} แถว`, cnt("SUGGESTED"), BR.expectSuggested);
    eq("L9", `รอจับคู่ ${BR.expectUnmatched} แถว (ค่าธรรมเนียม + ดอกเบี้ย)`, cnt("UNMATCHED"), BR.expectUnmatched);
    eq("L10", "ยังไม่มีแถวที่สร้างรายการบัญชี (seed ไม่โพสต์ JV เพิ่ม ⇒ ยอดเงินไม่ขยับ)", cnt("CREATED"), 0);
    const sumLines = await prisma.accountBankStatementLine.aggregate({
      where: { tenantId, systemId, statementId: st.id },
      _sum: { amountSatang: true },
    });
    eq("L11", "Σ ทุกแถว = ปลายงวด − ต้นงวด", sumLines._sum.amountSatang ?? 0, BR.statementClosingSatang - BR.openingSatang);
    const stLineIds = (await prisma.accountBankStatementLine.findMany({ where: { systemId, statementId: st.id }, select: { id: true } })).map((l) => l.id);
    const marked = await prisma.accountJournalLine.count({
      where: { tenantId, systemId, reconciledStatementLineId: { in: stLineIds } },
    });
    eq("L12", "บรรทัดสมุดรายวันที่ถูกทำเครื่องหมายกระทบยอด = จำนวนที่จับคู่", marked, BR.expectMatched);
    const dupe = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(*)::bigint AS n FROM (
        SELECT "reconciledStatementLineId" FROM "AccountJournalLine"
         WHERE "systemId" = ${systemId} AND "reconciledStatementLineId" IS NOT NULL
         GROUP BY 1 HAVING COUNT(*) > 1) x`;
    eq("L13", "ไม่มีบรรทัดสมุดรายวันผูกซ้ำ (1:1)", Number(dupe[0]?.n ?? 0), 0);
    eq(
      "L14",
      `ส่วนต่าง (statement − ระบบ) = ฿${baht(BR.differenceBeforeSatang)} ตามที่ fixture ออกแบบไว้`,
      BR.statementClosingSatang - BR.systemClosingSatang,
      BR.differenceBeforeSatang,
    );
  }

  // เดือนก่อนหน้า (ส.ค.) — statement ที่ตรงกันพอดี ⇒ สถานะ "ส่วนต่าง 0 · กดยืนยันได้"
  const P = (BR as unknown as { prev?: { periodKey: string; rowCount: number; statementClosingSatang: number; systemClosingSatang: number } }).prev;
  chk("L15", "เฉลยมีคีย์ bankReconcile.prev (statement เดือนก่อน)", !!P, P ? "มี" : "ไม่มี");
  if (P) {
    const stPrev = await prisma.accountBankStatement.findFirst({ where: { tenantId, systemId, financeId: BR.financeId, periodKey: P.periodKey } });
    chk("L16", `มีใบ statement งวด ${P.periodKey}`, !!stPrev, stPrev ? "มี" : "ไม่มี");
    if (stPrev) {
      eq("L17", `แถว = ${P.rowCount} · จับคู่ครบ`, [stPrev.rowCount, await prisma.accountBankStatementLine.count({ where: { systemId, statementId: stPrev.id, status: "MATCHED" } })], [P.rowCount, P.rowCount]);
      eq("L18", "ส่วนต่างเดือนก่อน = 0 (พร้อมกดยืนยัน)", stPrev.closingBalanceSatang - P.systemClosingSatang, 0);
      chk("L19", "ยังไม่กดยืนยันเดือนก่อน (เก็บสถานะ 'ปุ่มเปิดใช้ได้' ไว้ให้ QC ถ่ายภาพ)", stPrev.confirmedAt === null, String(stPrev.confirmedAt));
    }
  }
}

// ─────────── M. WHT V2 + เช็ค V2 (WO 5.4 · §10.4–5) ───────────
// เช็คพื้นฐานว่า fixture ของบล็อก 8.7 ยังอยู่ครบ — ความถูกต้องเชิงลึก (ตัวกรอง/CSV/markFiled/lifecycle)
// อยู่ใน qc-acc-v2-wht-cheque.mts แยกต่างหาก (ใช้ SQL อิสระ + ร้านทิ้งสำหรับ mutation)
console.log("\nM. WHT V2 + เช็ค V2");
{
  const WV = E.whtV2 as
    | {
        creditCertIds?: string[];
        deductCertIds?: string[];
        creditWhtTotalSatang?: number;
        deductWhtTotalSatang?: number;
        filedForm?: number;
        filedPeriodKey?: string;
        filedCertId?: string;
      }
    | undefined;
  chk("M1", "เฉลยมีคีย์ whtV2 (seed ใหม่หลัง WO 5.4 แล้ว)", !!WV, WV ? "มี" : "ไม่มี");
  if (WV) {
    const creditCount = await prisma.accountDocument.count({ where: { systemId, docType: "WHT_CERT", direction: "OUT" } });
    eq("M2", "WHT_CERT ฝั่งเครดิต (ถูกหักไว้) = 3 ใบ", creditCount, 3);
    const deductCount = await prisma.accountDocument.count({ where: { systemId, docType: "WHT_CERT", direction: "IN" } });
    eq("M3", "WHT_CERT ฝั่งหัก (เราหักผู้ขาย) = 3 ใบ", deductCount, 3);
    const creditSum = await prisma.accountDocument.aggregate({ where: { systemId, docType: "WHT_CERT", direction: "OUT" }, _sum: { whtAmount: true } });
    eq("M4", "ผลรวมภาษีถูกหักไว้ = เฉลย", creditSum._sum.whtAmount ?? 0, WV.creditWhtTotalSatang);
    const deductSum = await prisma.accountDocument.aggregate({ where: { systemId, docType: "WHT_CERT", direction: "IN" }, _sum: { whtAmount: true } });
    eq("M5", "ผลรวมภาษีที่หัก = เฉลย", deductSum._sum.whtAmount ?? 0, WV.deductWhtTotalSatang);
    // WO 5.4 round 2 (Fable ตีกลับ): 1 ใน 3 ใบหักถูกทำเครื่องหมายนำส่งแล้ว (ให้หน้า g11 โชว์ทั้ง 2 สไตล์ชิป)
    const unfiledCount = await prisma.accountDocument.count({ where: { systemId, docType: "WHT_CERT", direction: "IN", whtFiledPeriodKey: null } });
    eq("M6", "เหลือ 2 ใบที่ยังไม่ยื่น (1 ใบยื่นแล้ว)", unfiledCount, 2);
    if (WV.filedCertId) {
      const filedCert = await prisma.accountDocument.findUnique({ where: { id: WV.filedCertId }, select: { whtFiledPeriodKey: true } });
      eq("M6b", `ใบที่ยื่นแล้ว whtFiledPeriodKey = ${WV.filedForm}:${WV.filedPeriodKey}`, filedCert?.whtFiledPeriodKey, `${WV.filedForm}:${WV.filedPeriodKey}`);
    }
    const filingRow = await prisma.accountWhtFiling.findFirst({ where: { systemId, form: WV.filedForm, periodKey: WV.filedPeriodKey } });
    chk("M6c", "มีแถว AccountWhtFiling ของงวดที่ยื่นแล้ว", !!filingRow, filingRow ? "มี" : "ไม่มี");
  }

  const CQ = E.chequeV2 as { inDueSoonId?: string; inBouncedId?: string; outPendingId?: string; outVoidedId?: string } | undefined;
  chk("M7", "เฉลยมีคีย์ chequeV2 (seed ใหม่หลัง WO 5.4 แล้ว)", !!CQ, CQ ? "มี" : "ไม่มี");
  if (CQ) {
    const cqCount = await prisma.accountCheque.count({ where: { systemId } });
    eq("M8", "เช็คทั้งหมด = 4 ใบ (2 รับ + 2 จ่าย)", cqCount, 4);
    const byStatus = await prisma.accountCheque.groupBy({ by: ["status"], where: { systemId }, _count: { _all: true } });
    const statusMap = Object.fromEntries(byStatus.map((s) => [s.status, s._count._all]));
    eq("M9", "สถานะเช็ค: ON_HAND=1 · BOUNCED=1 · ISSUED=1 · VOIDED=1", [statusMap.ON_HAND ?? 0, statusMap.BOUNCED ?? 0, statusMap.ISSUED ?? 0, statusMap.VOIDED ?? 0], [1, 1, 1, 1]);
    const noneCleared = await prisma.accountCheque.count({ where: { systemId, status: "CLEARED" } });
    eq("M10", "ไม่มีเช็คใดถูกเคลียร์ (ตั้งใจ — ดู wo-notes/5.4.md ขั้น 3)", noneCleared, 0);
  }
}

// ─────────── N. PromptPay ลิงก์ชำระเงิน (WO 5.5 · §0.3 ข้อ 5) ───────────
console.log("\nN. PromptPay ลิงก์ชำระเงิน");
{
  const PP = E.promptPay as
    | {
        financeId: string;
        promptpayId: string;
        beam: { requestId: string; token: string; chargeId: string; documentId: string; amountSatang: number; paymentId: string | null };
        staticPending: { requestId: string; token: string; documentId: string; amountSatang: number; qrPayload: string | null };
        ewalletDeltaSatang: number;
      }
    | undefined;
  chk("N1", "เฉลยมีคีย์ promptPay (seed ใหม่หลัง WO 5.5 แล้ว)", !!PP, PP ? "มี" : "ไม่มี");
  if (PP) {
    const rows = await prisma.accountPaymentRequest.findMany({ where: { systemId }, orderBy: { createdAt: "asc" } });
    eq("N2", "คำขอชำระเงินทั้งหมด = 2 ใบ", rows.length, 2);

    const beam = rows.find((r) => r.id === PP.beam.requestId);
    chk("N3", "คำขอโหมด Beam อยู่ในฐานข้อมูล", !!beam, beam ? beam.id : "ไม่พบ");
    if (beam) {
      eq("N4", "คำขอ Beam: PAID · provider beam · มี chargeId", [beam.status, beam.provider, beam.providerChargeId], ["PAID", "beam", PP.beam.chargeId]);
      eq("N5", "คำขอ Beam: ยอด + ยอดที่จ่ายจริง = เฉลย", [beam.amountSatang, beam.paidAmountSatang], [PP.beam.amountSatang, PP.beam.amountSatang]);
      eq("N6", "คำขอ Beam: เงินเข้าช่องทาง EWL001", beam.financeId, PP.financeId);
      const doc = await prisma.accountDocument.findUnique({ where: { id: beam.documentId }, select: { status: true, paidTotal: true } });
      eq("N7", "ใบแจ้งหนี้ของคำขอ Beam = ชำระเงินแล้ว ยอดครบ", [doc?.status, doc?.paidTotal], ["PAID", PP.beam.amountSatang]);
      const pay = beam.paymentId
        ? await prisma.accountDocumentPayment.findUnique({ where: { id: beam.paymentId }, select: { channel: true, amount: true, idempotencyKey: true, paymentRequestId: true, entryId: true } })
        : null;
      eq(
        "N8",
        "รายการรับเงิน: ช่องทาง PROMPTPAY · คีย์กันซ้ำ pp:<chargeId> · ผูกกลับคำขอ",
        [pay?.channel, pay?.amount, pay?.idempotencyKey, pay?.paymentRequestId],
        ["PROMPTPAY", PP.beam.amountSatang, `pp:${PP.beam.chargeId}`, beam.id],
      );
      // JV ของการรับเงินหาจาก refType/refId (payment.entryId ยังไม่ถูกเขียนกลับโดย gl.postPayment)
      const entry = beam.paymentId
        ? await prisma.accountJournalEntry.findFirst({
            where: { systemId, refType: "AccountDocumentPayment", refId: beam.paymentId, status: { not: "REVERSED" } },
            select: { id: true },
          })
        : null;
      const lines = entry
        ? await prisma.accountJournalLine.findMany({ where: { entryId: entry.id }, select: { debit: true, credit: true } })
        : [];
      const dr = lines.reduce((a, l) => a + l.debit, 0);
      const cr = lines.reduce((a, l) => a + l.credit, 0);
      chk("N9", `JV ของการรับเงินสมดุล (Dr ${baht(dr)} = Cr ${baht(cr)})`, lines.length > 0 && dr === cr && dr === PP.beam.amountSatang, [dr, cr], [PP.beam.amountSatang, PP.beam.amountSatang]);
    }

    const stat = rows.find((r) => r.id === PP.staticPending.requestId);
    chk("N10", "คำขอโหมด QR นิ่งอยู่ในฐานข้อมูล", !!stat, stat ? stat.id : "ไม่พบ");
    if (stat) {
      eq("N11", "คำขอ QR นิ่ง: PENDING · ไม่มี provider · ยอด = ยอดคงค้างของใบเดิม", [stat.status, stat.provider, stat.amountSatang], ["PENDING", null, PP.staticPending.amountSatang]);
      chk("N12", "คำขอ QR นิ่งมี payload EMVCo (ขึ้นต้น 000201 · ปิดท้าย CRC 4 หลัก)", /^000201/.test(stat.qrPayload ?? "") && /6304[0-9A-F]{4}$/.test(stat.qrPayload ?? ""), (stat.qrPayload ?? "").slice(0, 12));
      chk("N13", "คำขอ QR นิ่งยังไม่มีรายการรับเงิน (ไม่มีเงินขยับ)", stat.paymentId === null && stat.paidAt === null, [stat.paymentId, stat.paidAt]);
    }

    chk("N14", "token ของทั้ง 2 ใบยาว ≥ 22 ตัว (128 บิต) และไม่ซ้ำกัน", PP.beam.token.length >= 22 && PP.staticPending.token.length >= 22 && PP.beam.token !== PP.staticPending.token, [PP.beam.token.length, PP.staticPending.token.length]);

    const ewl = await fin.financeBalances(tenantId, systemId, QC_ASOF);
    const ewlBal = ewl.find((f) => f.id === PP.financeId)?.balance ?? 0;
    eq("N15", "ยอด EWL001 = เฉลย (รวมเงินที่รับผ่านลิงก์แล้ว)", ewlBal, E.finance.EWL001);
  }
}

// ─────────── O. ผังบัญชี V2 (WO 6.1 · §11.1 · f8) ───────────
console.log("\nO. ผังบัญชี V2");
{
  const C = E.coa as
    | {
        monthKey: string;
        activeAccounts: number;
        byType: Record<string, number>;
        byGroup2: Record<string, number>;
        samples: { code: string; id: string; balanceSatang: number; monthDeltaSatang: number }[];
        custom: { onlineAds: string; rentalIncome: string; archived: string };
      }
    | undefined;
  chk("O1", "เฉลยมีคีย์ coa (seed รุ่น WO 6.1 ขึ้นไป)", !!C, C ? "มี" : "ไม่มี");
  if (C) {
    const activeCount = await prisma.accountLedger.count({ where: { systemId, archivedAt: null } });
    eq("O2", "จำนวนบัญชีที่เปิดใช้งานใน DB = เฉลย", activeCount, C.activeAccounts);
    const custom = await prisma.accountLedger.findMany({
      where: { systemId, code: { in: ["6301", "4031", "6302"] } },
      select: { code: true, name: true, isSystem: true, archivedAt: true, level: true, description: true, defaultWhtRateBp: true, defaultWhtType: true, vatTreatment: true },
      orderBy: { code: "asc" },
    });
    eq("O3", "มีบัญชีที่ผู้ใช้สร้างเอง 2 + ปิดใช้งาน 1 (4031/6301/6302)", custom.map((c) => c.code), ["4031", "6301", "6302"]);
    const ads = custom.find((c) => c.code === "6301");
    eq("O4", "6301 ค่าโฆษณาออนไลน์: ไม่ใช่บัญชีระบบ · level 4 · WHT 2% ค่าโฆษณา · ภาษีซื้อขอคืนได้", [ads?.isSystem, ads?.level, ads?.defaultWhtRateBp, ads?.defaultWhtType, ads?.vatTreatment], [false, 4, 200, "ADVERTISING", "CLAIMABLE"]);
    chk("O5", "6301 มีคำอธิบาย (แผงขวาของ f8 ต้องมีข้อความจริงให้ดู)", !!ads?.description, ads?.description ?? "(ว่าง)");
    const archived = custom.find((c) => c.code === "6302");
    chk("O6", "6302 อยู่ในสถานะปิดใช้งาน (ไว้ทดสอบกู้คืน)", !!archived?.archivedAt, archived?.archivedAt ?? "ยังเปิดอยู่");
    const archivedUsed = archived
      ? await prisma.accountJournalLine.count({ where: { systemId, account: { code: "6302" } } })
      : 0;
    eq("O7", "6302 ไม่มีรายการเคลื่อนไหว (ตัวเลขเงินของ seed จึงไม่ขยับ)", archivedUsed, 0);
    // ยอด "ณ QC.today" (WO 6.1 รอบ 2) — ตัดที่เที่ยงคืนวันถัดไปเหมือนที่ coa.ts/finance.ts ทำ
    const coaCutoff = new Date(new Date(`${QC.today}T00:00:00+07:00`).getTime() + 24 * 3600 * 1000);
    for (const smp of C.samples) {
      const led = await prisma.accountLedger.findFirst({ where: { systemId, code: smp.code }, select: { id: true, type: true } });
      const agg = await prisma.accountJournalLine.aggregate({ where: { systemId, accountId: led?.id ?? "", entry: { date: { lt: coaCutoff } } }, _sum: { debit: true, credit: true } });
      const dr = agg._sum.debit ?? 0;
      const cr = agg._sum.credit ?? 0;
      const natural = led && (led.type === "LIABILITY" || led.type === "EQUITY" || led.type === "INCOME") ? cr - dr : dr - cr;
      eq(`O8-${smp.code}`, `ยอดคงเหลือ ${smp.code} ใน DB = เฉลย (${baht(smp.balanceSatang)})`, natural, smp.balanceSatang);
    }
  }
}

// ─────────── P. WO 6.2 — สมุดรายวัน · ปิดงวด · สินทรัพย์/ค่าเสื่อม ───────────
console.log("\nP. WO 6.2 (สมุดรายวัน V2 · ปิดงวด · ค่าเสื่อม)");
const W = E.wo62 as {
  entries: number;
  manualEntries: number;
  reversedEntries: number;
  suspenseCredit: number;
  byBook: Record<string, number>;
  assets: { id: string; code: string; cost: number; monthlyAmount: number; accumDepreciation: number; netBookValue: number; periods: number }[];
  depreciationRows: { code: string; periodKey: string; amount: number }[];
  depreciationTotal: number;
  periods: { closed: string[]; open: string };
  vatFiled: string[];
  fixtures: Record<string, string>;
};
if (!W) {
  chk("P0", "มีเฉลย wo62 ในไฟล์เฉลย", false, "ไม่มี", "ต้อง seed ใหม่");
} else {
  const entryCount = await prisma.accountJournalEntry.count({ where: { systemId } });
  eq("P1", `จำนวนใบสำคัญทั้งหมด = เฉลย (${W.entries})`, entryCount, W.entries);
  const manual = await prisma.accountJournalEntry.count({ where: { systemId, source: "MANUAL" } });
  eq("P2", `ใบสำคัญที่บันทึกด้วยมือ (source=MANUAL) = เฉลย (${W.manualEntries})`, manual, W.manualEntries);
  const reversed = await prisma.accountJournalEntry.count({ where: { systemId, status: "REVERSED" } });
  eq("P3", `ใบที่ถูกกลับรายการ = เฉลย (${W.reversedEntries})`, reversed, W.reversedEntries);
  const reversalSide = await prisma.accountJournalEntry.count({ where: { systemId, reversalOfId: { not: null } } });
  eq("P4", "ทุกใบที่ถูกกลับมีใบขากลับคู่กันครบ", reversalSide, reversed);

  // ตัวนับต่อสมุด (แท็บของ g16) — นับด้วย groupBy คนละสำนวนกับ journal-v2.listJournalPaged
  const books = await prisma.accountJournalEntry.groupBy({ by: ["book"], where: { systemId }, _count: { _all: true } });
  for (const b of books) eq(`P5-${b.book}`, `ตัวนับแท็บสมุด ${b.book} = เฉลย`, b._count._all, W.byBook[b.book] ?? -1);

  // สินทรัพย์ + ค่าเสื่อม
  const assets = await prisma.accountFixedAsset.findMany({ where: { systemId }, orderBy: { code: "asc" } });
  eq("P6", `ทะเบียนสินทรัพย์ ${W.assets.length} รายการ`, assets.length, W.assets.length);
  for (const a of W.assets) {
    const row = assets.find((x) => x.code === a.code);
    chk(`P7-${a.code}`, `มีสินทรัพย์ ${a.code} ในทะเบียน`, !!row, row?.code ?? "ไม่พบ");
    if (!row) continue;
    eq(`P8-${a.code}`, `ต้นทุน ${a.code} = เฉลย (${baht(a.cost)})`, row.cost, a.cost);
    const dep = await prisma.accountDepreciation.aggregate({
      where: { systemId, assetId: row.id },
      _sum: { amount: true },
      _count: { _all: true },
    });
    eq(`P9-${a.code}`, `จำนวนงวดค่าเสื่อมของ ${a.code}`, dep._count._all, a.periods);
    eq(`P10-${a.code}`, `ค่าเสื่อมสะสม ${a.code} = เฉลย (${baht(a.accumDepreciation)})`, dep._sum.amount ?? 0, a.accumDepreciation);
    eq(`P11-${a.code}`, `มูลค่าสุทธิ ${a.code} = ต้นทุน − ค่าเสื่อมสะสม`, row.cost - (dep._sum.amount ?? 0), a.netBookValue);
  }
  // ทุกแถวค่าเสื่อมต้องผูกกับใบสำคัญจริง (ตารางในหน้าสินทรัพย์คลิกทะลุได้)
  const depNoEntry = await prisma.accountDepreciation.count({ where: { systemId, entryId: null } });
  eq("P12", "ทุกแถวค่าเสื่อมผูกกับใบสำคัญ (entryId ไม่ว่าง)", depNoEntry, 0);
  const depSum = await prisma.accountDepreciation.aggregate({ where: { systemId }, _sum: { amount: true } });
  eq("P13", `ค่าเสื่อมรวมทั้งชุด = เฉลย (${baht(W.depreciationTotal)})`, depSum._sum.amount ?? 0, W.depreciationTotal);
  // ยอดค่าเสื่อมสะสมในสมุดรายวัน (Cr 16x9) ต้องเท่ากับผลรวมในตาราง AccountDepreciation
  const accumLines = await prisma.$queryRaw<Array<{ net: bigint }>>`
    SELECT COALESCE(SUM(jl."credit" - jl."debit"), 0)::bigint AS net
      FROM "AccountJournalLine" jl
      JOIN "AccountLedger" l ON l."id" = jl."accountId"
     WHERE jl."systemId" = ${systemId} AND l."code" IN ('1619', '1629', '1639')`;
  eq("P14", "ค่าเสื่อมสะสมในสมุดรายวัน (16x9) = ผลรวมตารางค่าเสื่อม", Number(accumLines[0]?.net ?? 0), W.depreciationTotal);

  // งวดบัญชี
  for (const key of W.periods.closed) {
    const per = await prisma.accountPeriod.findFirst({ where: { systemId, periodKey: key }, select: { status: true, closedById: true } });
    eq(`P15-${key}`, `งวด ${key} ปิดแล้ว`, per?.status ?? "ไม่มีแถว", "CLOSED");
    chk(`P16-${key}`, `งวด ${key} มีผู้ปิดบันทึกไว้`, !!per?.closedById, per?.closedById ?? "ว่าง");
  }
  const openPer = await prisma.accountPeriod.findFirst({ where: { systemId, periodKey: W.periods.open }, select: { status: true } });
  eq("P17", `งวด ${W.periods.open} ยังเปิดอยู่`, openPer?.status ?? "ไม่มีแถว", "OPEN");
  for (const key of W.vatFiled) {
    const f = await prisma.accountVatFiling.count({ where: { systemId, periodKey: key } });
    eq(`P18-${key}`, `ทำเครื่องหมายยื่น ภ.พ.30 งวด ${key} แล้ว`, f, 1);
  }
  // fixture ที่ข้อสอบ/ภาพอ้างถึงต้องมีอยู่จริง
  for (const [k, v] of Object.entries(W.fixtures)) {
    const found = await prisma.accountJournalEntry.count({ where: { systemId, id: v } });
    eq(`P19-${k}`, `fixture ${k} ยังอยู่ใน DB`, found, 1);
  }
}

// ─────────── I. คลังเอกสาร V2 (WO 7.1 · §12) ───────────
console.log("\nI. คลังเอกสาร V2");
{
  const A = E.attachments as {
    total: number;
    unlinked: number;
    linked: number;
    notAccounting: number;
    staffUploaderId: string;
    ownerUploaderId: string;
    ids: Record<string, string>;
    linkedExpDocumentId: string;
    linkedIvDocumentId: string;
  };
  const rows = await prisma.accountAttachment.findMany({ where: { systemId, id: { in: Object.values(A.ids) } } });
  eq("Q1", "จำนวนไฟล์แนบตัวอย่าง (6 แถว) มีครบใน DB", rows.length, A.total);
  const byKey = new Map(Object.entries(A.ids).map(([k, id]) => [k, rows.find((r) => r.id === id)]));

  for (const key of ["unlinked1", "unlinked2", "unlinked3"]) {
    const r = byKey.get(key);
    chk(`Q2-${key}`, `${key} มีจริงในระบบนี้`, !!r, r?.id ?? "ไม่พบ");
    if (r) {
      eq(`Q3-${key}`, `${key} status = UNLINKED`, r.status, "UNLINKED");
      eq(`Q4-${key}`, `${key} ยังไม่ผูก documentId`, r.documentId, null);
      chk(`Q5-${key}`, `${key} มี sha256`, !!r.sha256, r.sha256);
    }
  }

  const exp = byKey.get("linkedExp");
  chk("Q6", "linkedExp มีจริง", !!exp, exp?.id ?? "ไม่พบ");
  if (exp) {
    eq("Q7", "linkedExp status = LINKED", exp.status, "LINKED");
    eq("Q8", "linkedExp ผูกกับ EXP ตามเฉลย", exp.documentId, A.linkedExpDocumentId);
    eq("Q9", "linkedExp docTypeHint = ชนิดเอกสารจริง (EXPENSE)", exp.docTypeHint, "EXPENSE");
  }

  const iv = byKey.get("linkedIv");
  chk("Q10", "linkedIv มีจริง", !!iv, iv?.id ?? "ไม่พบ");
  if (iv) {
    eq("Q11", "linkedIv status = LINKED", iv.status, "LINKED");
    eq("Q12", "linkedIv ผูกกับ IV ตามเฉลย", iv.documentId, A.linkedIvDocumentId);
    eq("Q13", "linkedIv docTypeHint = ชนิดเอกสารจริง (INVOICE)", iv.docTypeHint, "INVOICE");
  }

  const na = byKey.get("notAccounting");
  chk("Q14", "notAccounting มีจริง", !!na, na?.id ?? "ไม่พบ");
  if (na) {
    eq("Q15", "notAccounting status = NOT_ACCOUNTING", na.status, "NOT_ACCOUNTING");
    eq("Q16", "notAccounting ไม่ผูกเอกสาร", na.documentId, null);
  }

  // ตัวนับต่อสถานะทั้งระบบ (ไม่ใช่แค่ id ที่รู้จัก) — กันไฟล์อื่นหลุดเข้ามาปนโดยไม่มีใครรู้
  const grouped = await prisma.accountAttachment.groupBy({ by: ["status"], where: { systemId, archivedAt: null }, _count: { _all: true } });
  const cnt = (s: string) => grouped.find((g) => g.status === s)?._count._all ?? 0;
  eq("Q17", "ตัวนับ UNLINKED ทั้งระบบ = เฉลย", cnt("UNLINKED"), A.unlinked);
  eq("Q18", "ตัวนับ LINKED ทั้งระบบ = เฉลย", cnt("LINKED"), A.linked);
  eq("Q19", "ตัวนับ NOT_ACCOUNTING ทั้งระบบ = เฉลย", cnt("NOT_ACCOUNTING"), A.notAccounting);

  // ผู้อัปโหลด 2 คน (owner + staff) ต้อง resolve ชื่อได้จริงผ่าน membership+user (คอลัมน์ "ผู้อัปโหลด")
  const staffM = await prisma.membership.findFirst({ where: { tenantId, userId: A.staffUploaderId }, include: { user: true } });
  chk("Q20", "ผู้อัปโหลดพนักงานคนที่ 2 เป็นสมาชิกร้านนี้จริง", staffM?.tenantId === tenantId, staffM?.tenantId);
  eq("Q21", "ชื่อผู้อัปโหลดพนักงานคนที่ 2 ตรงเฉลย", staffM?.user.name, "นภาพร ใจเย็น");
}

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
