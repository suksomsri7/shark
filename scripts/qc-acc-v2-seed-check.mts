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
const balances = await fin.financeBalances(tenantId, systemId);
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
