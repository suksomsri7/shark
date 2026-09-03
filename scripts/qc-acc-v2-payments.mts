// QC WO 1.4 — "เงินมัดจำ (ส่วน D) + รับชำระ/บันทึกจ่ายหลายครั้ง + WHT + เช็ค (ส่วน F)"
// รัน (บังคับ DB QC branch):  QC_ENV_FILE=.env.qc pnpm tsx scripts/qc-acc-v2-payments.mts
//
// 🔴 ความปลอดภัยข้อมูล: สคริปต์นี้ **สร้าง tenant ทิ้ง** แล้วลบทิ้งเมื่อจบ (ทุก query ผูก tenantId ของตัวเอง)
//    แต่ยังต้องชี้ DB QC เสมอ: ตั้ง QC_ENV_FILE=.env.qc — สคริปต์พิมพ์ไฟล์ env + โฮสต์ DB ให้ตรวจก่อนเริ่ม
//
// ทำไมไม่เรียก server action ตรง ๆ: action เริ่มด้วย `requireTenant()` (อ่านคุกกี้ผ่าน next/headers)
// ซึ่งไม่มีนอก request context ⇒ ที่นี่ตรวจ **ชั้นที่ action เรียกจริง** (payment.ts / service / expense /
// gl / wht / cheque) + ตรวจ "สายไฟ" ของ action แบบ static (P0) ว่ายังผ่านด่านสิทธิ์ครบตามลำดับ
//
// ครอบคลุม (ดู ledger/wo-notes/1.4.md):
//   P0  สายไฟ payment-actions.ts: ทุก action ผ่าน loadAccountSystem + assertAccountCan · ไม่ import prisma
//   P1  เคสเฉลย g2 ครบวง: IV 24,900 → RE + รับชำระ 14,900 (ธนาคาร) + 9,301.87 (เงินสด) + WHT 698.13
//       → ค้าง 0 · IV = ชำระแล้ว · JV Dr เงิน/Dr 1160 · Cr 1100 สมดุล · WTI เกิด 1 ใบ
//   P2  ชำระบางส่วน → PARTIAL + ยอดคงค้างถูกต้อง · ชำระเกิน = ถูกปฏิเสธ
//   P3  หักเงินมัดจำ (ส่วน D): เต็มใบ · บางส่วน · หลายใบพร้อมกัน · เกินยอดคงเหลือ = ปฏิเสธ · JV สมดุล
//   P4  ฝั่งจ่าย: DP → หักในบันทึกซื้อ → บันทึกจ่ายพร้อมหัก ณ ที่จ่าย 3% → 50 ทวิ + Cr 2130
//   P5  รับเป็นเช็ค → ทะเบียนเช็คสถานะ "ในมือ" + JV พักที่ 1040
//   P6  ค่าธรรมเนียมธนาคาร → Dr ค่าธรรมเนียม · เงินเข้าน้อยลงเท่าค่าธรรมเนียม
//   P7  ยกเลิกการชำระ = กลับรายการครบ (JV · WTI · สถานะ · ยอด) · ยกเลิกรับเงินมัดจำกลับ JV ของใบมัดจำ
//       · รับเงินใหม่หลังยกเลิกยังโพสต์บัญชีได้ (ไม่ถูก idempotency กลืน) · คืนมัดจำ
//   P8  idempotency: ยิงชุดเดิมซ้ำด้วยคีย์เดิม = payment/JV ชุดเดียว
//   P9  สิทธิ์: ไม่มี account.payment.record = ถูกปฏิเสธ
//   P10 ขอบเขต: เอกสารของระบบอื่น/tenant อื่น แตะไม่ได้

// CI ไม่มีทั้ง `.env` และ `.env.qc` — env มาจาก DATABASE_URL/DIRECT_URL ที่ workflow export ไว้
// (process.loadEnvFile โยน ENOENT ถ้าไม่มีไฟล์ · และค่าที่ export มาก่อน "ชนะ" ไฟล์เสมอ — WO 0.7)
try { process.loadEnvFile?.(process.env.QC_ENV_FILE ?? ".env"); } catch { /* CI: ไม่มีไฟล์ env */ }

import { readFileSync } from "node:fs";
import { join } from "node:path";

let passed = 0;
const findings: string[] = [];
function ok(name: string) {
  passed++;
  console.log("  ✅ " + name);
}
function bad(name: string, detail: string) {
  findings.push(name + " — " + detail);
  console.log("  ❌ " + name + " — " + detail);
}
function assert(name: string, cond: boolean, detail = "") {
  if (cond) ok(name);
  else bad(name, detail);
}
function eq(name: string, actual: unknown, expected: unknown) {
  assert(name, actual === expected, `ได้ ${JSON.stringify(actual)} · ควรได้ ${JSON.stringify(expected)}`);
}
const bt = (satang: number) => "฿" + (satang / 100).toLocaleString("th-TH", { minimumFractionDigits: 2 });
function eqAmt(name: string, actual: number, expected: number) {
  assert(name, actual === expected, `ได้ ${bt(actual)} · ควรได้ ${bt(expected)}`);
}

const ROOT = process.cwd();
const envFile = process.env.QC_ENV_FILE ?? ".env";
const dbHost = (process.env.DATABASE_URL ?? "").replace(/^.*@/, "").split("/")[0] || "(ไม่พบ DATABASE_URL)";
console.log("\n===== QC WO 1.4 · เงินมัดจำ + รับชำระ/บันทึกจ่าย (ส่วน D, F) =====");
console.log(`[env] ไฟล์ ${envFile} · DB ${dbHost}\n`);

// ═══════════════════════════ P0 — สายไฟของ server action (static) ═══════════════════════════
console.log("P0 สายไฟ payment-actions.ts (ด่านสิทธิ์ครบทุก action):");
{
  const src = readFileSync(join(ROOT, "src/lib/modules/account/payment-actions.ts"), "utf8");
  assert("P0.1 ไม่ import prisma ตรง ๆ (fitness F5)", !/from\s+["']@\/lib\/core\/db["']/.test(src));
  const names = [...src.matchAll(/export async function (\w+)/g)].map((m) => m[1]);
  assert("P0.2 มี action ครบตาม WO (record/void/deposit/refund/panel)", names.length >= 7, names.join(","));
  const bodies = src.split(/export async function /).slice(1);
  for (const b of bodies) {
    const fn = b.slice(0, b.indexOf("("));
    const hasLoad = b.includes("loadAccountSystem(");
    const hasCan = b.includes("assertAccountCan(");
    // ตัวที่ห่อ action อื่น (FormAction) ไม่ต้องตรวจซ้ำ — มันเรียกตัวที่ตรวจแล้ว
    const wrapper = /await (recordPaymentsAction|refundDepositAction|voidPaymentV2Action)\(/.test(b);
    assert(`P0.3 ${fn}: ผ่าน loadAccountSystem + assertAccountCan`, wrapper || (hasLoad && hasCan));
  }
  assert("P0.4 recordPaymentsAction ใช้สิทธิ์ account.payment.record", /recordPaymentsAction[\s\S]{0,600}account\.payment\.record/.test(src));
  assert("P0.5 voidPaymentV2Action ใช้สิทธิ์ account.payment.void", /voidPaymentV2Action[\s\S]{0,600}account\.payment\.void/.test(src));
  const pay = readFileSync(join(ROOT, "src/lib/modules/account/payment.ts"), "utf8");
  assert("P0.6 payment.ts ไม่เขียน posting เอง (ไม่เรียก commitEntry/Book)", !/commitEntry|new Book\(/.test(pay));
  assert("P0.7 payment.ts ไม่ import prisma ตรง ๆ", !/from\s+["']@\/lib\/core\/db["']/.test(pay));
}

// ═══════════════════════════ P1–P10 — ของจริงบน DB ═══════════════════════════
const { prisma } = await import("@/lib/core/db");
const sysMod = await import("@/lib/modules/system/service");
const acc = await import("@/lib/modules/account/service");
const exp = await import("@/lib/modules/account/expense");
const gl = await import("@/lib/modules/account/gl");
const fin = await import("@/lib/modules/account/finance");
const pay = await import("@/lib/modules/account/payment");
const wht = await import("@/lib/modules/account/wht");
const cheque = await import("@/lib/modules/account/cheque");
const { computeDocTotals } = await import("@/lib/modules/account/totals");
const { assertAccountCan } = await import("@/lib/modules/account/access");

const tag = "QCACC14-" + Date.now();
let tenantId = "";
const userIds: string[] = [];

/** g1/g2: 3 บรรทัด → 24,900.00 (VAT 1,628.97 · ฐาน 23,271.03 · WHT 3% ของบรรทัดทริป = 594) */
const G1_LINES = [
  { description: "ทริปสิมิลัน 3D2N", qty: 2, unitName: "คน", unitPrice: 990_000, discount: 0, vatRateBp: 700 },
  { description: "ค่าเช่าอุปกรณ์ดำน้ำ", qty: 2, unitName: "วัน", unitPrice: 120_000, discount: 0, vatRateBp: 700 },
  { description: "เสื้อ SIAM DIVE", qty: 1, unitName: "ตัว", unitPrice: 107_103, discount: 0, vatRateBp: 700 },
];

type Entry = { id: string; lines: { debit: number; credit: number; accountId: string; account: { code: string } }[] };
const entriesOf = (systemId: string, refId: string, refType = "AccountDocument") =>
  prisma.accountJournalEntry.findMany({
    where: { systemId, refType, refId },
    include: { lines: { include: { account: { select: { code: true } } } } },
  }) as Promise<Entry[]>;
const drOf = (es: Entry[], accountId: string) =>
  es.flatMap((e) => e.lines).filter((l) => l.accountId === accountId).reduce((s, l) => s + l.debit, 0);
const crOf = (es: Entry[], accountId: string) =>
  es.flatMap((e) => e.lines).filter((l) => l.accountId === accountId).reduce((s, l) => s + l.credit, 0);
const drCode = (es: Entry[], code: string) =>
  es.flatMap((e) => e.lines).filter((l) => l.account.code === code).reduce((s, l) => s + l.debit, 0);
const crCode = (es: Entry[], code: string) =>
  es.flatMap((e) => e.lines).filter((l) => l.account.code === code).reduce((s, l) => s + l.credit, 0);
const balanced = (es: Entry[]) =>
  es.every((e) => e.lines.reduce((s, l) => s + l.debit, 0) === e.lines.reduce((s, l) => s + l.credit, 0));
const totalDr = (es: Entry[]) => es.flatMap((e) => e.lines).reduce((s, l) => s + l.debit, 0);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const TODAY = iso(new Date());

try {
  const t = await prisma.tenant.create({ data: { name: tag, slug: tag.toLowerCase() } });
  tenantId = t.id;
  const owner = await prisma.user.create({ data: { email: tag.toLowerCase() + "-owner@qc.local", name: "QC เจ้าของ" } });
  const staff = await prisma.user.create({ data: { email: tag.toLowerCase() + "-staff@qc.local", name: "QC พนักงาน" } });
  userIds.push(owner.id, staff.id);
  await prisma.membership.create({ data: { userId: owner.id, tenantId, role: "OWNER", unitAccess: ["*"] } });
  const mStaff = await prisma.membership.create({
    data: { userId: staff.id, tenantId, role: "STAFF", unitAccess: ["*"], permissions: { "account.doc.view": true } },
    include: { tenant: true },
  });

  const s1 = await sysMod.createSystem(tenantId, "ACCOUNT", "บัญชี " + tag);
  const s2 = await sysMod.createSystem(tenantId, "ACCOUNT", "บัญชีสาขา 2 " + tag);
  const systemId = s1.id;
  const otherSystemId = s2.id;
  console.log(`\n[seed] tenant ${tenantId} · system ${systemId} · ระบบที่สอง ${otherSystemId}\n`);

  await acc.saveSettings(tenantId, systemId, {
    orgName: "ร้านดำน้ำ QC 1.4",
    taxId: "0105561000000",
    vatRegistered: true,
    vatRateBp: 700,
    taxPointBasis: "ON_ISSUE",
  });
  await acc.saveSettings(tenantId, otherSystemId, { orgName: "สาขา 2", vatRegistered: true, vatRateBp: 700 });
  await gl.ensureAccounting({ tenantId, systemId });
  await gl.ensureAccounting({ tenantId, systemId: otherSystemId });

  const bank = await fin.createFinanceAccount({ tenantId, systemId, type: "BANK", name: "ออมทรัพย์", bankName: "กสิกรไทย" });
  const cash = await fin.createFinanceAccount({ tenantId, systemId, type: "CASH", name: "เงินสด" });
  if (!bank.ok || !cash.ok) throw new Error("สร้างช่องทางการเงินไม่สำเร็จ");
  const bankLedger = (await prisma.accountFinance.findFirstOrThrow({ where: { id: bank.id } })).ledgerAccountId!;
  const cashLedger = (await prisma.accountFinance.findFirstOrThrow({ where: { id: cash.id } })).ledgerAccountId!;

  const customer = await acc.createContact({ tenantId, systemId, kind: "CUSTOMER", legalType: "COMPANY", name: "คุณณัฐพล รุ่งเรือง", taxId: "0105561999999", branchCode: "00000" });
  const vendor = await acc.createContact({ tenantId, systemId, kind: "VENDOR", legalType: "COMPANY", name: "บริษัท เรือทัวร์ จำกัด", taxId: "0105561888888", branchCode: "00000" });

  const mkInvoice = async (lines = G1_LINES) => {
    const d = await acc.createDocument({
      tenantId, systemId, docType: "INVOICE", contactId: customer.id,
      issueDate: new Date(), vatMode: "EXCLUDE", vatTiming: "ON_ISSUE", lines, createdById: owner.id,
    });
    const r = await acc.issueDocument(tenantId, systemId, d.id);
    if (!r.ok) throw new Error("ออกใบแจ้งหนี้ไม่สำเร็จ: " + r.reason);
    return d.id;
  };

  // ═════════ P1 — เคสเฉลย g2 ครบวง ═════════
  console.log("P1 เคสเฉลย g2 (IV 24,900 → ใบเสร็จ + รับชำระ 2 ครั้ง + ถูกหัก ณ ที่จ่าย):");
  const ivId = await mkInvoice();
  const iv0 = await prisma.accountDocument.findFirstOrThrow({ where: { id: ivId } });
  eqAmt("P1.1 ใบแจ้งหนี้ยอด 24,900.00", iv0.grandTotal, 2_490_000);
  eq("P1.2 ใบแจ้งหนี้สถานะ = รอชำระ", iv0.status, "AWAITING_PAYMENT");

  const conv = await acc.convertDocument(tenantId, systemId, ivId, "RECEIPT", owner.id);
  assert("P1.3 แปลงใบแจ้งหนี้ → ใบเสร็จรับเงินได้", conv.ok, conv.ok ? "" : conv.reason);
  const reId = conv.ok ? conv.newId : "";

  const panelBefore = await pay.paymentPanelData(tenantId, systemId, reId);
  eq("P1.4 แผงรับชำระของใบเสร็จชี้ไปตัดหนี้ที่ใบแจ้งหนี้ (ลูกหนี้อยู่ที่ใบนั้น)", panelBefore?.targetDocId, ivId);
  eqAmt("P1.5 ยอดคงค้างก่อนรับชำระ = 24,900.00", panelBefore?.outstanding ?? -1, 2_490_000);
  eqAmt("P1.6 ฐานคำนวณภาษีหัก ณ ที่จ่าย = ยอดก่อน VAT 23,271.03", panelBefore?.whtBaseSatang ?? -1, 2_327_103);
  eq("P1.7 ช่องทางการเงินให้เลือก 2 ช่องทาง", panelBefore?.channels.length, 2);

  const g2 = await pay.approveReceiptWithPayments(
    tenantId, systemId, reId,
    [
      { paidAt: TODAY, financeAccountId: bank.id, amountSatang: 1_490_000, note: "โอนมัดจำ", whtIncomeType: null, whtRateBp: null, whtAmountSatang: 0, feeSatang: 0, cheque: null },
      { paidAt: TODAY, financeAccountId: cash.id, amountSatang: 930_187, note: "", whtIncomeType: "M40_8", whtRateBp: 300, whtAmountSatang: 69_813, feeSatang: 0, cheque: null },
    ],
    { userId: owner.id, keyBase: "qc-g2" },
  );
  assert("P1.8 อนุมัติใบเสร็จพร้อมรับชำระสำเร็จ", g2.ok, g2.ok ? "" : g2.reason);
  if (g2.ok) {
    assert("P1.9 ใบเสร็จได้เลขที่ขึ้นต้น RE-", g2.docNo.startsWith("RE-"), g2.docNo);
    eq("P1.10 ออกเอกสารภาษีถูกหัก ณ ที่จ่าย 1 ใบ", g2.certNos.length, 1);
    assert("P1.11 เลขเอกสารภาษีถูกหักขึ้นต้น WTI- (ตามภาพ g2)", (g2.certNos[0] ?? "").startsWith("WTI-"), g2.certNos[0]);
  }

  const iv1 = await prisma.accountDocument.findFirstOrThrow({ where: { id: ivId } });
  eqAmt("P1.12 ใบแจ้งหนี้ตัดหนี้ครบ 24,900.00 (เงิน 24,201.87 + ภาษีถูกหัก 698.13)", iv1.paidTotal, 2_490_000);
  eq("P1.13 ใบแจ้งหนี้สถานะ = ชำระแล้ว", iv1.status, "PAID");
  const re1 = await prisma.accountDocument.findFirstOrThrow({ where: { id: reId } });
  eq("P1.14 ใบเสร็จสถานะ = ชำระแล้ว", re1.status, "PAID");

  const reEntries = await entriesOf(systemId, reId);
  eq("P1.15 ใบเสร็จของใบแจ้งหนี้ไม่ลง JV ซ้ำ (กันรายได้/VAT นับ 2 เท่า)", reEntries.length, 0);

  const payments = await prisma.accountDocumentPayment.findMany({ where: { documentId: ivId }, orderBy: { paidAt: "asc" } });
  eq("P1.16 บันทึกการรับชำระ 2 ครั้ง", payments.length, 2);
  eqAmt("P1.17 ครั้งที่ 1 เงินเข้า 14,900.00", payments[0].amount, 1_490_000);
  eqAmt("P1.18 ครั้งที่ 2 เงินเข้าจริง 9,301.87", payments[1].amount, 930_187);
  eqAmt("P1.19 ครั้งที่ 2 ภาษีถูกหัก 698.13", payments[1].whtAmountSatang, 69_813);
  eq("P1.20 หมายเหตุ ≤20 ถูกเก็บ", payments[0].note, "โอนมัดจำ");

  const payEntries = (await Promise.all(payments.map((p) => entriesOf(systemId, p.id, "AccountDocumentPayment")))).flat();
  eq("P1.21 เกิดสมุดรายวันของการรับชำระ 2 ชุด", payEntries.length, 2);
  assert("P1.22 ทุกชุดสมดุล (เดบิต = เครดิต)", balanced(payEntries));
  eqAmt("P1.23 Dr ธนาคาร 14,900.00", drOf(payEntries, bankLedger), 1_490_000);
  eqAmt("P1.24 Dr เงินสด 9,301.87", drOf(payEntries, cashLedger), 930_187);
  eqAmt("P1.25 Dr 1160 ภาษีถูกหัก ณ ที่จ่าย 698.13", drCode(payEntries, "1160"), 69_813);
  eqAmt("P1.26 Cr 1100 ลูกหนี้ 24,900.00", crCode(payEntries, "1100"), 2_490_000);
  eqAmt("P1.27 เดบิตรวมของการรับชำระ = 24,900.00", totalDr(payEntries), 2_490_000);

  const certs = await prisma.accountDocument.findMany({ where: { systemId, docType: "WHT_CERT", sourceDocId: ivId } });
  eq("P1.28 เอกสารภาษีถูกหัก ณ ที่จ่ายเกิด 1 ใบ", certs.length, 1);
  eq("P1.29 ใบนี้เป็นฝั่ง 'ถูกหัก' (direction OUT) ไม่ใช่ 50 ทวิ ที่ต้องนำส่ง", certs[0]?.direction, "OUT");
  eqAmt("P1.30 ยอดภาษีบนใบ = 698.13", certs[0]?.whtAmount ?? -1, 69_813);
  eq("P1.31 อัตราภาษีบนใบ = 3%", certs[0]?.whtRateBp, 300);
  eq("P1.32 ประเภทเงินได้ = ม.40(8)", certs[0]?.whtIncomeType, "M40_8");
  const credits = await wht.listWhtCredits(tenantId, systemId);
  eqAmt("P1.33 รายงานเครดิตภาษีถูกหักรวม = 698.13", credits.totalWht, 69_813);
  const pnd = await wht.pnd(tenantId, systemId, { type: 53, period: TODAY.slice(0, 7) });
  eq("P1.34 ใบ WTI ไม่หลุดเข้า ภ.ง.ด. (รายงานนำส่งของฝั่งที่เราหักเขา)", pnd.rows.length, 0);

  const panelAfter = await pay.paymentPanelData(tenantId, systemId, reId);
  eqAmt("P1.35 ยอดคงค้างหลังชำระ = 0.00 (เฉลย g2)", panelAfter?.outstanding ?? -1, 0);
  eqAmt(
    "P1.36 รับชำระรวม 24,201.87 (เงินที่เข้าจริง ไม่รวมภาษีถูกหัก)",
    (panelAfter?.payments ?? []).filter((p) => !p.voidedAt).reduce((s, p) => s + p.amount, 0),
    2_420_187,
  );
  eqAmt(
    "P1.37 ถูกหัก ณ ที่จ่ายรวม 698.13",
    (panelAfter?.payments ?? []).filter((p) => !p.voidedAt).reduce((s, p) => s + p.whtAmount, 0),
    69_813,
  );

  // ═════════ P2 — ชำระบางส่วน / ชำระเกิน ═════════
  console.log("\nP2 ชำระบางส่วน + กันชำระเกิน:");
  const ivPartial = await mkInvoice();
  const p2 = await pay.recordPayments(
    tenantId, systemId, ivPartial,
    [{ paidAt: TODAY, financeAccountId: bank.id, amountSatang: 1_000_000, note: "งวดแรก", whtIncomeType: null, whtRateBp: null, whtAmountSatang: 0, feeSatang: 0, cheque: null }],
    { userId: owner.id, keyBase: "qc-partial" },
  );
  assert("P2.1 บันทึกรับชำระบางส่วนสำเร็จ", p2.ok, p2.ok ? "" : p2.reason);
  eq("P2.2 สถานะ = ชำระบางส่วน", p2.ok ? p2.status : "", "PARTIAL");
  eqAmt("P2.3 ยอดคงค้าง = 14,900.00", p2.ok ? p2.outstanding : -1, 1_490_000);
  const p2b = await pay.recordPayments(
    tenantId, systemId, ivPartial,
    [{ paidAt: TODAY, financeAccountId: bank.id, amountSatang: 2_000_000, note: "เกิน", whtIncomeType: null, whtRateBp: null, whtAmountSatang: 0, feeSatang: 0, cheque: null }],
    { userId: owner.id, keyBase: "qc-over" },
  );
  assert("P2.4 ชำระเกินยอดคงเหลือถูกปฏิเสธ", !p2b.ok && p2b.reason.includes("เกินยอดคงเหลือ"), p2b.ok ? "ผ่านไปได้" : p2b.reason);
  const p2c = await pay.recordPayments(
    tenantId, systemId, ivPartial,
    [{ paidAt: TODAY, financeAccountId: cash.id, amountSatang: 1_490_000, note: "งวดที่สอง", whtIncomeType: null, whtRateBp: null, whtAmountSatang: 0, feeSatang: 0, cheque: null }],
    { userId: owner.id, keyBase: "qc-partial2" },
  );
  eq("P2.5 จ่ายส่วนที่เหลือแล้วเป็น ชำระแล้ว", p2c.ok ? p2c.status : "", "PAID");
  eqAmt("P2.6 ยอดคงค้าง = 0.00", p2c.ok ? p2c.outstanding : -1, 0);

  // ═════════ P3 — ส่วน D เงินมัดจำ ═════════
  console.log("\nP3 หักเงินมัดจำ (ส่วน D · หลายใบ · บางส่วน):");
  const mkDeposit = async (grossSatang: number) => {
    const d = await acc.createDocument({
      tenantId, systemId, docType: "DEPOSIT_RECEIPT", contactId: customer.id, issueDate: new Date(),
      vatMode: "INCLUDE", lines: [{ description: "เงินมัดจำทริป", qty: 1, unitPrice: grossSatang, discount: 0, vatRateBp: 700 }],
      createdById: owner.id,
    });
    const r = await acc.issueDocument(tenantId, systemId, d.id);
    if (!r.ok) throw new Error("ออกใบมัดจำไม่สำเร็จ: " + r.reason);
    const rp = await acc.recordPayment(tenantId, systemId, d.id, { paidAt: new Date(), financeAccountId: bank.id, channel: "TRANSFER", amount: grossSatang, createdById: owner.id });
    if (!rp.ok) throw new Error("รับเงินมัดจำไม่สำเร็จ: " + rp.reason);
    return d.id;
  };
  const depA = await mkDeposit(1_000_000); // 10,000.00
  const depB = await mkDeposit(500_000); //  5,000.00
  const depC = await mkDeposit(100_000); //  1,000.00
  const depADoc = await prisma.accountDocument.findFirstOrThrow({ where: { id: depA } });
  eq("P3.1 ใบมัดจำที่รับเงินครบ = รอหักมัดจำ", depADoc.status, "AWAITING_DEDUCT");
  const depAEntries = await entriesOf(systemId, depA);
  assert("P3.2 JV ใบมัดจำสมดุล", balanced(depAEntries) && depAEntries.length === 1);
  eqAmt("P3.3 Dr ธนาคาร 10,000.00", drOf(depAEntries, bankLedger), 1_000_000);
  eqAmt("P3.4 Cr 2110 มัดจำรับ 9,345.79", crCode(depAEntries, "2110"), 934_579);
  eqAmt("P3.5 Cr 2200 ภาษีขาย 654.21 (VAT เกิดตอนรับเงินมัดจำ)", crCode(depAEntries, "2200"), 65_421);

  const opts = await acc.listDeductibleDeposits(tenantId, systemId, customer.id);
  eq("P3.6 รายการใบมัดจำที่หักได้ = 3 ใบ", opts.length, 3);
  eqAmt("P3.7 ยอดคงเหลือของใบ 10,000 ยังเต็ม", opts.find((o) => o.id === depA)?.available ?? -1, 1_000_000);

  // ① หักเต็มใบ: IV 24,900 − มัดจำ 10,000 = 14,900
  const ivDep = await acc.createDocument({
    tenantId, systemId, docType: "INVOICE", contactId: customer.id, issueDate: new Date(),
    vatMode: "EXCLUDE", vatTiming: "ON_ISSUE", lines: G1_LINES, createdById: owner.id,
  });
  const setA = await acc.setDocDeposits(tenantId, systemId, ivDep.id, [{ depositId: depA, amountSatang: 1_000_000 }]);
  assert("P3.8 หักมัดจำเต็มใบสำเร็จ", setA.ok, setA.ok ? "" : setA.reason);
  eqAmt("P3.9 ยอดเอกสารหลังหักมัดจำ = 14,900.00", setA.ok ? setA.grandTotal : -1, 1_490_000);
  const g1WithDeposit = computeDocTotals({
    lines: [
      { qty: 2, unitPriceSatang: 990_000, vatRateBp: 700, whtRateBp: 300 },
      { qty: 2, unitPriceSatang: 120_000, vatRateBp: 700 },
      { qty: 1, unitPriceSatang: 107_103, vatRateBp: 700 },
    ],
    priceMode: "EXCL_VAT", vatRegistered: true, vatRateBp: 700, depositDeductedSatang: 1_000_000,
  });
  eqAmt("P3.10 บล็อกสรุป: หักเงินมัดจำ 10,000.00", g1WithDeposit.depositDeducted, 1_000_000);
  eqAmt("P3.11 บล็อกสรุป: ยอดที่ต้องชำระ = 14,306.00 (24,900 − WHT 594 − มัดจำ 10,000)", g1WithDeposit.dueTotal, 1_430_600);
  const issDep = await acc.issueDocument(tenantId, systemId, ivDep.id);
  assert("P3.12 ออกใบแจ้งหนี้ที่หักมัดจำได้", issDep.ok, issDep.ok ? "" : issDep.reason);
  const ivDepEntries = await entriesOf(systemId, ivDep.id);
  assert("P3.13 JV ใบแจ้งหนี้ที่หักมัดจำสมดุล", balanced(ivDepEntries));
  eqAmt("P3.14 Dr 1100 ลูกหนี้ = 14,900.00 (ยอดหลังหักมัดจำ)", drCode(ivDepEntries, "1100"), 1_490_000);
  eqAmt("P3.15 Dr 2110 ล้างหนี้มัดจำ = 9,345.79", drCode(ivDepEntries, "2110"), 934_579);
  eqAmt("P3.16 Cr 2205/2200 ภาษีขายเฉพาะส่วนที่ยังไม่รับรู้ = 973.76", crCode(ivDepEntries, "2205") + crCode(ivDepEntries, "2200"), 97_476);
  eq("P3.17 ใบมัดจำที่ถูกหักครบ = หักมัดจำครบแล้ว", (await prisma.accountDocument.findFirstOrThrow({ where: { id: depA } })).status, "DEDUCTED");

  // ② หักบางส่วน (ปลดข้อจำกัด WO 1.2 "ครั้งละ 1 ใบเต็มยอด")
  const ivPart = await acc.createDocument({
    tenantId, systemId, docType: "INVOICE", contactId: customer.id, issueDate: new Date(),
    vatMode: "EXCLUDE", vatTiming: "ON_ISSUE", lines: G1_LINES, createdById: owner.id,
  });
  const setB = await acc.setDocDeposits(tenantId, systemId, ivPart.id, [{ depositId: depB, amountSatang: 200_000 }]);
  assert("P3.18 หักมัดจำ 'บางส่วน' ได้ (2,000 จาก 5,000)", setB.ok, setB.ok ? "" : setB.reason);
  eqAmt("P3.19 ยอดเอกสารหลังหักบางส่วน = 22,900.00", setB.ok ? setB.grandTotal : -1, 2_290_000);
  const optsAfter = await acc.listDeductibleDeposits(tenantId, systemId, customer.id);
  eqAmt("P3.20 ใบมัดจำ 5,000 เหลือหักได้อีก 3,000", optsAfter.find((o) => o.id === depB)?.available ?? -1, 300_000);
  eq("P3.21 ใบมัดจำที่หักบางส่วนยังเป็น 'รอหักมัดจำ'", (await prisma.accountDocument.findFirstOrThrow({ where: { id: depB } })).status, "AWAITING_DEDUCT");

  // ③ หักหลายใบพร้อมกันในเอกสารเดียว
  const setBC = await acc.setDocDeposits(tenantId, systemId, ivPart.id, [
    { depositId: depB, amountSatang: 300_000 },
    { depositId: depC, amountSatang: 100_000 },
  ]);
  assert("P3.22 หักมัดจำหลายใบในเอกสารเดียวได้", setBC.ok, setBC.ok ? "" : setBC.reason);
  eqAmt("P3.23 ยอดเอกสารหลังหัก 2 ใบ (3,000 + 1,000) = 20,900.00", setBC.ok ? setBC.grandTotal : -1, 2_090_000);
  eq("P3.24 มี relation หักมัดจำ 2 รายการ", await prisma.accountDocumentRelation.count({ where: { toId: ivPart.id, type: "DEPOSIT_APPLY" } }), 2);
  const setOver = await acc.setDocDeposits(tenantId, systemId, ivPart.id, [{ depositId: depB, amountSatang: 900_000 }]);
  assert("P3.25 หักเกินยอดคงเหลือของใบมัดจำ = ถูกปฏิเสธ", !setOver.ok && setOver.reason.includes("เกินยอดคงเหลือ"), setOver.ok ? "ผ่านไปได้" : setOver.reason);
  const issPart = await acc.issueDocument(tenantId, systemId, ivPart.id);
  assert("P3.26 ออกใบแจ้งหนี้ที่หักมัดจำหลายใบได้", issPart.ok, issPart.ok ? "" : issPart.reason);
  assert("P3.27 JV สมดุล", balanced(await entriesOf(systemId, ivPart.id)));

  // ═════════ P4 — ฝั่งจ่าย (DP + 50 ทวิ) ═════════
  console.log("\nP4 ฝั่งจ่าย: ใบจ่ายมัดจำ → หักในบันทึกซื้อ → บันทึกจ่าย + หัก ณ ที่จ่าย 3%:");
  const dp = await exp.createExpenseDoc({
    tenantId, systemId, docType: "DEPOSIT_PAYMENT", contactId: vendor.id, issueDate: new Date(),
    vatMode: "INCLUDE", lines: [{ description: "มัดจำค่าเช่าเรือ", qty: 1, unitPrice: 500_000, discount: 0, vatRateBp: 700 }],
    createdById: owner.id,
  });
  const dpIss = await exp.issueExpenseDoc(tenantId, systemId, dp.id);
  assert("P4.1 ออกใบจ่ายเงินมัดจำได้", dpIss.ok, dpIss.ok ? "" : dpIss.reason);
  const dpPay = await exp.recordVendorPayment(tenantId, systemId, dp.id, { paidAt: new Date(), channel: "TRANSFER", financeAccountId: bank.id, amount: 500_000, createdById: owner.id });
  eq("P4.2 จ่ายมัดจำครบ → รอหักมัดจำ", dpPay.ok ? dpPay.status : "", "AWAITING_DEDUCT");
  const dpEntries = await entriesOf(systemId, dp.id);
  eqAmt("P4.3 Dr 1130 มัดจำจ่าย 4,672.90", drCode(dpEntries, "1130"), 467_290);
  eqAmt("P4.4 Cr ธนาคาร 5,000.00", crOf(dpEntries, bankLedger), 500_000);

  const pur = await exp.createExpenseDoc({
    tenantId, systemId, docType: "PURCHASE", contactId: vendor.id, issueDate: new Date(),
    vatMode: "INCLUDE", lines: [{ description: "ค่าเช่าเรือทั้งทริป", qty: 1, unitPrice: 1_000_000, discount: 0, vatRateBp: 700 }],
    createdById: owner.id,
  });
  const setDp = await exp.setExpenseDocDeposits(tenantId, systemId, pur.id, [{ depositId: dp.id, amountSatang: 500_000 }]);
  assert("P4.5 หักมัดจำจ่ายในบันทึกซื้อได้", setDp.ok, setDp.ok ? "" : setDp.reason);
  eqAmt("P4.6 ยอดบันทึกซื้อหลังหักมัดจำ = 5,000.00", setDp.ok ? setDp.grandTotal : -1, 500_000);
  const purIss = await exp.issueExpenseDoc(tenantId, systemId, pur.id);
  assert("P4.7 ออกบันทึกซื้อได้", purIss.ok, purIss.ok ? "" : purIss.reason);
  const purEntries = await entriesOf(systemId, pur.id);
  assert("P4.8 JV บันทึกซื้อที่หักมัดจำสมดุล", balanced(purEntries));
  eqAmt("P4.9 Cr 1130 ล้างมัดจำจ่าย 4,672.90", crCode(purEntries, "1130"), 467_290);
  eqAmt("P4.10 Cr 2100 เจ้าหนี้ = 5,000.00", crCode(purEntries, "2100"), 500_000);

  const purPay = await pay.recordPayments(
    tenantId, systemId, pur.id,
    [{ paidAt: TODAY, financeAccountId: bank.id, amountSatang: 485_000, note: "จ่ายค่าเรือ", whtIncomeType: "M40_8", whtRateBp: 300, whtAmountSatang: 15_000, feeSatang: 0, cheque: null }],
    { userId: owner.id, keyBase: "qc-pur-pay" },
  );
  assert("P4.11 บันทึกจ่ายพร้อมหัก ณ ที่จ่ายสำเร็จ", purPay.ok, purPay.ok ? "" : purPay.reason);
  eq("P4.12 บันทึกซื้อสถานะ = ชำระแล้ว", purPay.ok ? purPay.status : "", "PAID");
  const purPayRow = await prisma.accountDocumentPayment.findFirstOrThrow({ where: { documentId: pur.id } });
  const purPayEntries = await entriesOf(systemId, purPayRow.id, "AccountDocumentPayment");
  assert("P4.13 JV การจ่ายสมดุล", balanced(purPayEntries));
  eqAmt("P4.14 Dr 2100 เจ้าหนี้ 5,000.00", drCode(purPayEntries, "2100"), 500_000);
  eqAmt("P4.15 Cr 2130 ภาษีหัก ณ ที่จ่ายค้างนำส่ง 150.00", crCode(purPayEntries, "2130"), 15_000);
  eqAmt("P4.16 Cr ธนาคาร 4,850.00", crOf(purPayEntries, bankLedger), 485_000);
  const wtoCert = await prisma.accountDocument.findFirst({ where: { systemId, docType: "WHT_CERT", sourceDocId: pur.id } });
  assert("P4.17 ออกหนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ) อัตโนมัติ", !!wtoCert);
  eq("P4.18 50 ทวิ อยู่ฝั่งจ่าย (direction IN)", wtoCert?.direction, "IN");
  eqAmt("P4.19 ยอดภาษีบน 50 ทวิ = 150.00", wtoCert?.whtAmount ?? -1, 15_000);
  eq("P4.20 อัตราภาษี 3%", wtoCert?.whtRateBp, 300);
  const pndAfter = await wht.pnd(tenantId, systemId, { type: 53, period: TODAY.slice(0, 7) });
  eq("P4.21 ภ.ง.ด.53 เห็นรายการนี้ 1 บรรทัด", pndAfter.rows.length, 1);

  // ═════════ P5 — เช็ค ═════════
  console.log("\nP5 รับชำระเป็นเช็ค → ทะเบียนเช็ค:");
  const ivCheque = await mkInvoice([{ description: "ค่าบริการ", qty: 1, unitName: "งาน", unitPrice: 500_000, discount: 0, vatRateBp: 700 }]);
  const ivChequeDoc = await prisma.accountDocument.findFirstOrThrow({ where: { id: ivCheque } });
  const chq = await pay.recordPayments(
    tenantId, systemId, ivCheque,
    [{ paidAt: TODAY, financeAccountId: bank.id, amountSatang: ivChequeDoc.grandTotal, note: "รับเช็ค", whtIncomeType: null, whtRateBp: null, whtAmountSatang: 0, feeSatang: 0, cheque: { chequeNo: "CHQ-001", bankName: "ไทยพาณิชย์", chequeDate: TODAY } }],
    { userId: owner.id, keyBase: "qc-cheque" },
  );
  assert("P5.1 รับชำระเป็นเช็คสำเร็จ", chq.ok, chq.ok ? "" : chq.reason);
  const cheques = await cheque.listCheques(tenantId, systemId, { direction: "IN" });
  eq("P5.2 มีเช็ครับเข้าทะเบียน 1 ใบ", cheques.length, 1);
  eq("P5.3 เลขที่เช็คถูกบันทึก", cheques[0]?.chequeNo, "CHQ-001");
  eq("P5.4 สถานะเช็ค = ในมือ (ON_HAND)", cheques[0]?.status, "ON_HAND");
  eqAmt("P5.5 จำนวนเงินบนเช็ค = ยอดเอกสาร", cheques[0]?.amount ?? -1, ivChequeDoc.grandTotal);
  const chqPay = await prisma.accountDocumentPayment.findFirstOrThrow({ where: { documentId: ivCheque } });
  eq("P5.6 รายการชำระผูกกับเช็คในทะเบียน", chqPay.chequeId, cheques[0]?.id);
  eq("P5.7 ช่องทางการชำระ = เช็ค", chqPay.channel, "CHEQUE");
  const chqEntries = await entriesOf(systemId, chqPay.id, "AccountDocumentPayment");
  eq("P5.8 มี JV ของการรับเช็คชุดเดียว (ไม่โพสต์ซ้ำจากทะเบียนเช็ค)", chqEntries.length, 1);
  eqAmt("P5.9 Dr 1040 เช็ครับรอนำฝาก (เงินยังไม่เข้าธนาคาร)", drCode(chqEntries, "1040"), ivChequeDoc.grandTotal);
  eqAmt("P5.10 Cr 1100 ลูกหนี้", crCode(chqEntries, "1100"), ivChequeDoc.grandTotal);
  eqAmt("P5.11 ไม่มีเงินเข้าบัญชีธนาคารจากการรับเช็ค", drOf(chqEntries, bankLedger), 0);

  // ═════════ P6 — ค่าธรรมเนียมธนาคาร ═════════
  console.log("\nP6 ค่าธรรมเนียมธนาคาร:");
  const ivFee = await mkInvoice([{ description: "ค่าบริการ", qty: 1, unitName: "งาน", unitPrice: 100_000, discount: 0, vatRateBp: 700 }]);
  const ivFeeDoc = await prisma.accountDocument.findFirstOrThrow({ where: { id: ivFee } });
  const fee = await pay.recordPayments(
    tenantId, systemId, ivFee,
    [{ paidAt: TODAY, financeAccountId: bank.id, amountSatang: ivFeeDoc.grandTotal, note: "โอน", whtIncomeType: null, whtRateBp: null, whtAmountSatang: 0, feeSatang: 2_000, cheque: null }],
    { userId: owner.id, keyBase: "qc-fee" },
  );
  assert("P6.1 บันทึกรับชำระที่มีค่าธรรมเนียมสำเร็จ", fee.ok, fee.ok ? "" : fee.reason);
  const feePay = await prisma.accountDocumentPayment.findFirstOrThrow({ where: { documentId: ivFee } });
  const feeEntries = await entriesOf(systemId, feePay.id, "AccountDocumentPayment");
  assert("P6.2 JV สมดุล", balanced(feeEntries));
  eqAmt("P6.3 Dr ธนาคาร = ยอดรับ − ค่าธรรมเนียม 20.00", drOf(feeEntries, bankLedger), ivFeeDoc.grandTotal - 2_000);
  eqAmt("P6.4 Dr 6500 ค่าธรรมเนียม 20.00", drCode(feeEntries, "6500"), 2_000);
  eqAmt("P6.5 Cr 1100 ลูกหนี้เต็มยอด (ค่าธรรมเนียมเป็นภาระของเรา)", crCode(feeEntries, "1100"), ivFeeDoc.grandTotal);

  // ═════════ P7 — ยกเลิกการชำระ / คืนมัดจำ ═════════
  console.log("\nP7 ยกเลิกการชำระ + คืนมัดจำ (กลับรายการ ไม่ลบ):");
  const voidTarget = payments[1].id; // ครั้งที่ 2 ของเคส g2 (มีภาษีถูกหัก + WTI)
  const vres = await pay.voidPaymentAny(tenantId, systemId, ivId, voidTarget, "บันทึกผิดรายการ");
  assert("P7.1 ยกเลิกการรับชำระสำเร็จ", vres.ok, vres.ok ? "" : vres.reason);
  const ivAfterVoid = await prisma.accountDocument.findFirstOrThrow({ where: { id: ivId } });
  eqAmt("P7.2 ยอดที่ชำระถอยกลับเป็น 14,900.00", ivAfterVoid.paidTotal, 1_490_000);
  eq("P7.3 สถานะถอยกลับเป็น ชำระบางส่วน", ivAfterVoid.status, "PARTIAL");
  const voided = await prisma.accountDocumentPayment.findFirstOrThrow({ where: { id: voidTarget } });
  assert("P7.4 รายการชำระถูกทำเครื่องหมายยกเลิก (ไม่ถูกลบ)", voided.voidedAt !== null);
  const revEntries = await entriesOf(systemId, voidTarget, "AccountDocumentPayment");
  eq("P7.5 มี JV 2 ชุด (ต้นฉบับ + รายการกลับ)", revEntries.length, 2);
  eqAmt("P7.6 ผลรวมเดบิตของทั้ง 2 ชุดหักล้างกันเป็น 0 ต่อบัญชีเงินสด", drOf(revEntries, cashLedger) - crOf(revEntries, cashLedger), 0);
  eqAmt("P7.7 เครดิตภาษีถูกหัก 1160 ถูกกลับรายการหมด", drCode(revEntries, "1160") - crCode(revEntries, "1160"), 0);
  const certAfter = await prisma.accountDocument.findFirstOrThrow({ where: { id: certs[0].id } });
  eq("P7.8 เอกสารภาษีถูกหัก (WTI) ถูกยกเลิกตาม", certAfter.status, "VOIDED");
  const creditsAfter = await wht.listWhtCredits(tenantId, systemId);
  eqAmt("P7.9 เครดิตภาษีถูกหักในรายงานหายไปด้วย", creditsAfter.totalWht, 0);

  // ยกเลิกการรับเงินของใบมัดจำ → ต้องกลับ JV ของ *ตัวเอกสาร* ด้วย (รูรั่วเดิมของ WO 1.2)
  const depD = await mkDeposit(200_000);
  const depDPay = await prisma.accountDocumentPayment.findFirstOrThrow({ where: { documentId: depD, voidedAt: null } });
  const depDVoid = await pay.voidPaymentAny(tenantId, systemId, depD, depDPay.id, "ลูกค้าขอยกเลิก");
  assert("P7.10 ยกเลิกการรับเงินมัดจำสำเร็จ", depDVoid.ok, depDVoid.ok ? "" : depDVoid.reason);
  const depDEntries = await entriesOf(systemId, depD);
  eq("P7.11 JV ของใบมัดจำถูกกลับรายการ (2 ชุด)", depDEntries.length, 2);
  eqAmt("P7.12 เงินในบัญชีธนาคารกลับเป็น 0 สุทธิ", drOf(depDEntries, bankLedger) - crOf(depDEntries, bankLedger), 0);
  eqAmt("P7.13 หนี้มัดจำรับ 2110 กลับเป็น 0 สุทธิ", crCode(depDEntries, "2110") - drCode(depDEntries, "2110"), 0);
  eq("P7.14 ใบมัดจำถอยกลับเป็น รอชำระ", (await prisma.accountDocument.findFirstOrThrow({ where: { id: depD } })).status, "AWAITING_PAYMENT");
  const depDPay2 = await acc.recordPayment(tenantId, systemId, depD, { paidAt: new Date(), financeAccountId: cash.id, channel: "CASH", amount: 200_000, createdById: owner.id });
  assert("P7.15 รับเงินมัดจำใหม่หลังยกเลิกได้", depDPay2.ok, depDPay2.ok ? "" : depDPay2.reason);
  const depDEntries2 = await entriesOf(systemId, depD);
  eq("P7.16 การรับเงินรอบใหม่ลงบัญชีจริง (ไม่ถูก idempotency กลืน)", depDEntries2.length, 3);
  eqAmt("P7.17 รอบใหม่เข้าเงินสด 2,000.00", drOf(depDEntries2, cashLedger), 200_000);

  // คืนมัดจำ (§3 ทำรายการ)
  const refund = await acc.refundDeposit(tenantId, systemId, depD, "ลูกค้ายกเลิกทริป");
  assert("P7.18 คืนมัดจำสำเร็จ", refund.ok, refund.ok ? "" : refund.reason);
  eqAmt("P7.19 ยอดที่คืน = 2,000.00", refund.ok ? refund.refunded : -1, 200_000);
  const depDAfterRefund = await prisma.accountDocument.findFirstOrThrow({ where: { id: depD } });
  eq("P7.20 ใบมัดจำถูกปิดเป็นยกเลิก", depDAfterRefund.status, "VOIDED");
  const depDEntries3 = await entriesOf(systemId, depD);
  eqAmt("P7.21 เงินสดสุทธิกลับเป็น 0 หลังคืนมัดจำ", drOf(depDEntries3, cashLedger) - crOf(depDEntries3, cashLedger), 0);
  const refundBlocked = await acc.refundDeposit(tenantId, systemId, depB, "ลองคืนใบที่ถูกหักไปแล้ว");
  assert("P7.22 คืนมัดจำใบที่ถูกหักในเอกสารอื่นแล้ว = ถูกปฏิเสธ", !refundBlocked.ok, refundBlocked.ok ? "ผ่านไปได้" : refundBlocked.reason);

  // ═════════ P8 — idempotency ═════════
  console.log("\nP8 กันบันทึกซ้ำ (idempotency):");
  const ivIdem = await mkInvoice([{ description: "ค่าบริการ", qty: 1, unitName: "งาน", unitPrice: 200_000, discount: 0, vatRateBp: 700 }]);
  const ivIdemDoc = await prisma.accountDocument.findFirstOrThrow({ where: { id: ivIdem } });
  const idemRow = { paidAt: TODAY, financeAccountId: bank.id, amountSatang: ivIdemDoc.grandTotal, note: "โอน", whtIncomeType: null, whtRateBp: null, whtAmountSatang: 0, feeSatang: 0, cheque: null };
  const i1 = await pay.recordPayments(tenantId, systemId, ivIdem, [idemRow], { userId: owner.id, keyBase: "qc-idem" });
  const i2 = await pay.recordPayments(tenantId, systemId, ivIdem, [idemRow], { userId: owner.id, keyBase: "qc-idem" });
  assert("P8.1 ยิงครั้งแรกสำเร็จ", i1.ok, i1.ok ? "" : i1.reason);
  assert("P8.2 ยิงซ้ำด้วยคีย์เดิมไม่ error (คืนผลเดิม)", i2.ok, i2.ok ? "" : i2.reason);
  eq("P8.3 มีรายการชำระเพียง 1 รายการ", await prisma.accountDocumentPayment.count({ where: { documentId: ivIdem } }), 1);
  const idemPay = await prisma.accountDocumentPayment.findFirstOrThrow({ where: { documentId: ivIdem } });
  eq("P8.4 มี JV เพียงชุดเดียว", (await entriesOf(systemId, idemPay.id, "AccountDocumentPayment")).length, 1);
  eqAmt("P8.5 ยอดที่ชำระไม่ถูกนับซ้ำ", (await prisma.accountDocument.findFirstOrThrow({ where: { id: ivIdem } })).paidTotal, ivIdemDoc.grandTotal);

  // ═════════ P9 — สิทธิ์ ═════════
  console.log("\nP9 สิทธิ์:");
  const authStaff = { user: { id: staff.id }, active: mStaff } as never;
  let denied = false;
  try {
    assertAccountCan(authStaff, "account.payment.record");
  } catch {
    denied = true;
  }
  assert("P9.1 พนักงานที่ไม่มีสิทธิ์ 'บันทึกรับ/จ่ายเงิน' ถูกปฏิเสธ", denied);
  let deniedVoid = false;
  try {
    assertAccountCan(authStaff, "account.payment.void");
  } catch {
    deniedVoid = true;
  }
  assert("P9.2 พนักงานที่ไม่มีสิทธิ์ 'ยกเลิกการชำระ' ถูกปฏิเสธ", deniedVoid);
  let viewOk = true;
  try {
    assertAccountCan(authStaff, "account.doc.view");
  } catch {
    viewOk = false;
  }
  assert("P9.3 positive control: สิทธิ์ที่มีจริงต้องผ่าน (ไม่ใช่ปฏิเสธทุกอย่าง)", viewOk);

  // ═════════ P10 — ขอบเขต tenant/system ═════════
  console.log("\nP10 ขอบเขตข้ามระบบ/ข้ามร้าน:");
  eq("P10.1 อ่านเอกสารของระบบอื่นผ่านแผงชำระไม่ได้", await pay.paymentPanelData(tenantId, otherSystemId, ivId), null);
  const crossPay = await pay.recordPayments(
    tenantId, otherSystemId, ivPartial,
    [{ paidAt: TODAY, financeAccountId: bank.id, amountSatang: 100, note: "", whtIncomeType: null, whtRateBp: null, whtAmountSatang: 0, feeSatang: 0, cheque: null }],
    { userId: owner.id, keyBase: "qc-cross" },
  );
  assert("P10.2 บันทึกชำระเอกสารของระบบอื่นถูกปฏิเสธ", !crossPay.ok && crossPay.reason === "ไม่พบเอกสาร", crossPay.ok ? "ผ่านไปได้" : crossPay.reason);
  const crossDeposit = await acc.setDocDeposits(tenantId, otherSystemId, ivPart.id, [{ depositId: depC, amountSatang: 100 }]);
  assert("P10.3 ตั้งหักมัดจำข้ามระบบถูกปฏิเสธ", !crossDeposit.ok, crossDeposit.ok ? "ผ่านไปได้" : crossDeposit.reason);
  const ivBadChannel = await mkInvoice([{ description: "ค่าบริการ", qty: 1, unitName: "งาน", unitPrice: 100_000, discount: 0, vatRateBp: 700 }]);
  const crossChannel = await pay.recordPayments(
    tenantId, systemId, ivBadChannel,
    [{ paidAt: TODAY, financeAccountId: "ไม่มีจริง", amountSatang: 100, note: "", whtIncomeType: null, whtRateBp: null, whtAmountSatang: 0, feeSatang: 0, cheque: null }],
    { userId: owner.id, keyBase: "qc-badchannel" },
  );
  assert("P10.4 ช่องทางการเงินที่ไม่ใช่ของระบบนี้ถูกปฏิเสธ", !crossChannel.ok && crossChannel.reason.includes("ช่องทาง"), crossChannel.ok ? "ผ่านไปได้" : crossChannel.reason);

  // ═════════ ตรวจรวม: สมุดรายวันทุกชุดของ tenant ต้องสมดุล ═════════
  console.log("\nP11 ตรวจรวมทั้ง tenant:");
  const allEntries = (await prisma.accountJournalEntry.findMany({
    where: { tenantId },
    include: { lines: true },
  })) as { id: string; lines: { debit: number; credit: number }[] }[];
  const unbalanced = allEntries.filter(
    (e) => e.lines.reduce((s, l) => s + l.debit, 0) !== e.lines.reduce((s, l) => s + l.credit, 0),
  );
  eq("P11.1 ทุกชุดสมุดรายวันของ tenant นี้สมดุล", unbalanced.length, 0);
  const suspense = await prisma.accountJournalLine.findMany({
    where: { tenantId, account: { code: "9999" } },
  });
  eq("P11.2 ไม่มีรายการตกบัญชีพัก 9999", suspense.length, 0);
} finally {
  const del = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      console.log(`  ⚠ cleanup: ${e instanceof Error ? e.message.split("\n")[0] : e}`);
    }
  };
  if (tenantId) {
    await del(() => prisma.accountJournalLine.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountJournalEntry.updateMany({ where: { tenantId }, data: { reversalOfId: null } }));
    await del(() => prisma.accountJournalEntry.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountDocumentPayment.updateMany({ where: { tenantId }, data: { chequeId: null, whtCertDocId: null } }));
    await del(() => prisma.accountCheque.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountDocumentPayment.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountDocumentRelation.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountDocumentLine.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountDocument.updateMany({ where: { tenantId }, data: { sourceDocId: null, replacedById: null, sourcePaymentId: null } }));
    await del(() => prisma.accountAttachment.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountDocument.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountDocSequence.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountMapping.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountFinance.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountLedger.updateMany({ where: { tenantId }, data: { parentId: null } }));
    await del(() => prisma.accountLedger.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountPeriod.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountProduct.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountContact.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountSettings.deleteMany({ where: { tenantId } }));
    await del(() => prisma.appSystemUnit.deleteMany({ where: { tenantId } }));
    await del(() => prisma.appSystem.deleteMany({ where: { tenantId } }));
    await del(() => prisma.auditLog.deleteMany({ where: { tenantId } }));
    await del(() => prisma.membership.deleteMany({ where: { tenantId } }));
    await del(() => prisma.tenant.delete({ where: { id: tenantId } }));
  }
  for (const uid of userIds) await del(() => prisma.user.delete({ where: { id: uid } }));
  console.log("\n[cleanup] ลบ test data เรียบร้อย");
}

console.log(`\n===== สรุป WO 1.4: ผ่าน ${passed} · ไม่ผ่าน ${findings.length} =====`);
if (findings.length > 0) console.log(findings.map((f) => "  • " + f).join("\n"));
console.log(findings.length === 0 ? "🎉 WO 1.4 ผ่านทั้งหมด\n" : "⚠️ มีข้อไม่ผ่าน\n");
process.exit(findings.length === 0 ? 0 : 1);
