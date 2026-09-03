// QC WO 1.2 — "route ราคาถูก": DP · CNR · DNR · ASSET_PO · PTX + payableStats หน้าหลัก
// รัน:  QC_ENV_FILE=.env.qc pnpm tsx scripts/qc-acc-v2-cheap-routes.mts
//
// 🔴 ความปลอดภัยข้อมูล: สร้าง tenant ทิ้งแล้วลบเมื่อจบ (ทุก query ผูก tenantId ตัวเอง) — แต่ต้องชี้ DB QC เสมอ
//    ตั้ง QC_ENV_FILE=.env.qc · สคริปต์พิมพ์ไฟล์ env + โฮสต์ DB ที่ใช้จริงให้ตรวจก่อนเริ่มทุกครั้ง
//
// ครอบคลุม (ดู ledger/wo-notes/1.2.md):
//   R1 ทะเบียน route: 5 ชนิดที่ขาดมีไฟล์ page/detail จริง + อยู่ใน ACCOUNT_PAGE_PERMISSIONS + EXPENSE_LIST_TYPES
//   R2 DP (ใบจ่ายเงินมัดจำ): ออก → ยังไม่ลงบัญชี · จ่ายครบ → Dr 1130+1150 / Cr 1010 · สถานะ AWAITING_DEDUCT
//   R3 หักมัดจำในบันทึกซื้อ: Cr 1130 ฐานมัดจำ · VAT ซื้อเหลือส่วนที่ยังไม่เคลม · ใบมัดจำเป็น DEDUCTED
//   R4 CNR ลดเจ้าหนี้ · DNR เพิ่มเจ้าหนี้ (ยอด 2100 ตรงกับมือคำนวณทุกก้าว)
//   R5 ASSET_PO: ส่งอนุมัติ → อนุมัติ → แปลงเป็นซื้อสินทรัพย์ (ไม่ลง GL ที่ตัวใบสั่งซื้อ)
//   R6 PTX: บันทึกซื้อโหมด "ยังไม่รับใบกำกับ" → 1155 · รับใบกำกับ → ย้าย 1155 → 1150 เป๊ะ · รับซ้ำไม่ได้
//   R7 payableStats: payable/openCount/overdue ตรงกับการคำนวณมือบน tenant ทิ้ง
//   R8 idempotent: โพสต์ซ้ำ = JV ใบเดียว · ทุก entry Σdr==Σcr
process.loadEnvFile?.(process.env.QC_ENV_FILE ?? ".env");

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const { prisma } = await import("@/lib/core/db");
const system = await import("@/lib/modules/system/service");
const acc = await import("@/lib/modules/account/service");
const exp = await import("@/lib/modules/account/expense");
const gl = await import("@/lib/modules/account/gl");
const { ACCOUNT_PAGE_PERMISSIONS } = await import("@/lib/modules/account/guard");

// ─────────────────── harness (แบบเดียวกับ qc-acc-v2-guard.mts) ───────────────────
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

const ROOT = process.cwd();
const ROUTE_DIR = join(ROOT, "src/app/app/sys/[id]/account");
const envFile = process.env.QC_ENV_FILE ?? ".env";
const dbHost = (process.env.DATABASE_URL ?? "").replace(/^.*@/, "").split("/")[0] || "(ไม่พบ DATABASE_URL)";
console.log(`\n===== QC WO 1.2 · route ราคาถูก (DP/CNR/DNR/ASSET_PO/PTX) + payableStats =====`);
console.log(`[env] ไฟล์ ${envFile} · DB ${dbHost}\n`);

const NEW_TYPES = [
  { docType: "DEPOSIT_PAYMENT", route: "deposit-payment" },
  { docType: "CREDIT_NOTE_RECEIVED", route: "credit-note-received" },
  { docType: "DEBIT_NOTE_RECEIVED", route: "debit-note-received" },
  { docType: "ASSET_PURCHASE_ORDER", route: "asset-po" },
  { docType: "PURCHASE_TAX_INVOICE", route: "purchase-tax-invoice" },
] as const;

const tag = "QCACC12-" + Date.now();
let tenantId = "";
let userId = "";

// ── ตัวช่วยอ่าน JV ──
type Entry = { id: string; journal: string; refType: string | null; refId: string | null; lines: { code: string; debit: number; credit: number }[] };
async function entriesOf(systemId: string, refId?: string): Promise<Entry[]> {
  const es = await prisma.accountJournalEntry.findMany({
    where: { systemId, ...(refId ? { refId } : {}) },
    include: { lines: { include: { account: { select: { code: true } } } } },
  });
  return es.map((e) => ({
    id: e.id,
    journal: e.journal,
    refType: e.refType,
    refId: e.refId,
    lines: e.lines.map((l) => ({ code: l.account.code, debit: l.debit, credit: l.credit })),
  }));
}
const balanced = (e: Entry) =>
  e.lines.reduce((s, l) => s + l.debit, 0) === e.lines.reduce((s, l) => s + l.credit, 0);
const dr = (e: Entry, code: string) => e.lines.filter((l) => l.code === code).reduce((s, l) => s + l.debit, 0);
const cr = (e: Entry, code: string) => e.lines.filter((l) => l.code === code).reduce((s, l) => s + l.credit, 0);
/** ยอดคงเหลือฝั่งเครดิตของบัญชีคุมยอด (เจ้าหนี้ 2100 = Σcr − Σdr ของทั้งระบบ) */
async function creditBalance(systemId: string, code: string): Promise<number> {
  const rows = await prisma.accountJournalLine.findMany({
    where: { systemId, account: { code } },
    select: { debit: true, credit: true },
  });
  return rows.reduce((s, l) => s + l.credit - l.debit, 0);
}
async function debitBalance(systemId: string, code: string): Promise<number> {
  return -(await creditBalance(systemId, code));
}

try {
  // ═══════════════ R1 — ทะเบียน route (static) ═══════════════
  console.log("R1 ทะเบียน route ของ 5 ชนิดที่ขาด:");
  for (const t of NEW_TYPES) {
    const listFile = join(ROUTE_DIR, t.route, "page.tsx");
    const detailFile = join(ROUTE_DIR, t.route, "[docId]", "page.tsx");
    assert(`${t.route}/page.tsx มีอยู่จริง`, existsSync(listFile));
    assert(`${t.route}/[docId]/page.tsx มีอยู่จริง`, existsSync(detailFile));
    eq(`guard: ${t.route}/page.tsx → account.doc.view`, ACCOUNT_PAGE_PERMISSIONS[`${t.route}/page.tsx`], "account.doc.view");
    eq(
      `guard: ${t.route}/[docId]/page.tsx → account.doc.view`,
      ACCOUNT_PAGE_PERMISSIONS[`${t.route}/[docId]/page.tsx`],
      "account.doc.view",
    );
    if (existsSync(listFile)) {
      const src = readFileSync(listFile, "utf8");
      assert(
        `${t.route}/page.tsx บังคับด่านสิทธิ์ + ผูก docType ${t.docType}`,
        src.includes('requireAccountPage(id, "account.doc.view")') && src.includes(`"${t.docType}"`),
        "ไม่พบ requireAccountPage หรือ docType ในไฟล์",
      );
    }
    const reg = exp.EXPENSE_LIST_TYPES.find((x) => x.docType === t.docType);
    eq(`EXPENSE_LIST_TYPES มี ${t.docType} → route ${t.route}`, reg?.route, t.route);
  }
  // ทะเบียนกลางต้องสอดคล้องกับ prefix เดิม + มีไฟล์จริงครบทุกตัว
  assert(
    "ทุกชนิดใน EXPENSE_LIST_TYPES: prefix ตรง EXP_DOC_PREFIX + มีไฟล์ page.tsx + อยู่ในทะเบียนสิทธิ์",
    exp.EXPENSE_LIST_TYPES.every(
      (t) =>
        exp.EXP_DOC_PREFIX[t.docType] === t.prefix &&
        existsSync(join(ROUTE_DIR, t.route, "page.tsx")) &&
        ACCOUNT_PAGE_PERMISSIONS[`${t.route}/page.tsx`] === "account.doc.view",
    ),
    exp.EXPENSE_LIST_TYPES.filter((t) => !existsSync(join(ROUTE_DIR, t.route, "page.tsx"))).map((t) => t.route).join(","),
  );
  eq("EXP_ROUTE มาจาก EXPENSE_LIST_TYPES ครบทุกชนิด", Object.keys(exp.EXP_ROUTE).length, exp.EXPENSE_LIST_TYPES.length);

  // ─── seed tenant ทิ้ง ───
  const t = await prisma.tenant.create({ data: { name: tag, slug: tag.toLowerCase() } });
  tenantId = t.id;
  const u = await prisma.user.create({ data: { email: tag.toLowerCase() + "@qc.local", name: "QC 1.2" } });
  userId = u.id;
  await prisma.membership.create({ data: { userId, tenantId, role: "OWNER", unitAccess: ["*"] } });
  const sys = await system.createSystem(tenantId, "ACCOUNT", "บัญชี " + tag);
  const systemId = sys.id;
  const ctx = { tenantId, systemId };
  await acc.saveSettings(tenantId, systemId, { orgName: "QC 1.2", vatRegistered: true, vatRateBp: 700 });
  await gl.ensureAccounting(ctx);
  const vendor = (await acc.createContact({ tenantId, systemId, name: "ผู้ขาย QC 1.2", kind: "VENDOR" })) as { id: string };
  console.log(`\n[seed] tenant ${tenantId} · system ${systemId}\n`);

  // ═══════════════ R2 — ใบจ่ายเงินมัดจำ (DP) ═══════════════
  console.log("R2 ใบจ่ายเงินมัดจำ (DP) — ออก → จ่าย → รอหักมัดจำ:");
  const dp = await exp.createExpenseDoc({
    tenantId,
    systemId,
    docType: "DEPOSIT_PAYMENT",
    contactId: vendor.id,
    vatMode: "EXCLUDE",
    vatPurchaseMode: "CLAIM",
    lines: [{ description: "มัดจำค่าทัวร์ 30%", qty: 1, unitPrice: 1_000_000 }], // ฿10,000.00
  });
  eq("DP ร่าง: grandTotal = 10,000 + VAT 7% = ฿10,700", dp.grandTotal, 1_070_000);
  const dpIssue = await exp.issueExpenseDoc(tenantId, systemId, dp.id);
  assert("ออก DP สำเร็จ", dpIssue.ok === true, dpIssue.ok === false ? dpIssue.reason : "");
  const dpAfterIssue = await prisma.accountDocument.findUniqueOrThrow({ where: { id: dp.id } });
  eq("DP หลังออก = รอชำระ (AWAITING_PAYMENT)", dpAfterIssue.status, "AWAITING_PAYMENT");
  assert("DP ได้เลขรัน prefix DP-", (dpAfterIssue.docNo ?? "").startsWith("DP-"), dpAfterIssue.docNo ?? "(ว่าง)");
  eq("DP ยังไม่ลงบัญชีตอนออก (เงินยังไม่ออก)", (await entriesOf(systemId, dp.id)).length, 0);

  const dpPay = await exp.recordVendorPayment(tenantId, systemId, dp.id, { amount: 1_070_000, channel: "TRANSFER" });
  assert("บันทึกจ่าย DP สำเร็จ", dpPay.ok === true, dpPay.ok === false ? dpPay.reason : "");
  const dpPaid = await prisma.accountDocument.findUniqueOrThrow({ where: { id: dp.id } });
  eq("DP จ่ายครบ → รอหักมัดจำ (AWAITING_DEDUCT)", dpPaid.status, "AWAITING_DEDUCT");
  const dpEntries = await entriesOf(systemId, dp.id);
  eq("DP โพสต์ JV 1 ใบตอนจ่ายครบ", dpEntries.length, 1);
  const dpJv = dpEntries[0] ?? { lines: [] as { code: string; debit: number; credit: number }[] } as Entry;
  assert("DP: JV สมดุล", balanced(dpJv as Entry));
  eq("DP: Dr 1130 มัดจำจ่าย = ฿10,000", dr(dpJv as Entry, "1130"), 1_000_000);
  eq("DP: Dr 1150 ภาษีซื้อ = ฿700", dr(dpJv as Entry, "1150"), 70_000);
  eq("DP: Cr 1010 ธนาคาร = ฿10,700", cr(dpJv as Entry, "1010"), 1_070_000);
  // idempotent: โพสต์ซ้ำต้องไม่เกิด JV ใบที่ 2
  await gl.postDocument(ctx, dp.id);
  eq("DP: โพสต์ซ้ำ = JV ใบเดียว (idempotent)", (await entriesOf(systemId, dp.id)).length, 1);

  // ═══════════════ R3 — หักมัดจำในบันทึกซื้อ ═══════════════
  console.log("\nR3 หักเงินมัดจำในบันทึกซื้อ (PURCHASE):");
  const deducts = await exp.listDeductiblePaidDeposits(tenantId, systemId, vendor.id);
  eq("listDeductiblePaidDeposits: เจอใบมัดจำ 1 ใบ", deducts.length, 1);
  eq("listDeductiblePaidDeposits: ยอดคงเหลือ = ฿10,700", deducts[0]?.available, 1_070_000);

  const pur = await exp.createExpenseDoc({
    tenantId,
    systemId,
    docType: "PURCHASE",
    contactId: vendor.id,
    vatMode: "EXCLUDE",
    vatPurchaseMode: "CLAIM",
    depositPaymentId: dp.id,
    lines: [{ description: "ค่าทัวร์ส่วนที่เหลือ", qty: 1, unitPrice: 2_000_000 }], // ฿20,000.00
  });
  eq("บันทึกซื้อ: หักมัดจำ ฿10,700", pur.depositDeducted, 1_070_000);
  eq("บันทึกซื้อ: ยอดสุทธิ 21,400 − 10,700 = ฿10,700", pur.grandTotal, 1_070_000);
  const purIssue = await exp.issueExpenseDoc(tenantId, systemId, pur.id);
  assert("ออกบันทึกซื้อสำเร็จ", purIssue.ok === true, purIssue.ok === false ? purIssue.reason : "");
  eq(
    "ใบมัดจำถูกหักครบ → DEDUCTED",
    (await prisma.accountDocument.findUniqueOrThrow({ where: { id: dp.id } })).status,
    "DEDUCTED",
  );
  const purJv = (await entriesOf(systemId, pur.id))[0] as Entry;
  assert("บันทึกซื้อ: JV สมดุล", purJv && balanced(purJv));
  eq("บันทึกซื้อ: Dr 5000 ต้นทุน = ฿20,000", dr(purJv, "5000"), 2_000_000);
  eq("บันทึกซื้อ: Dr 1150 ภาษีซื้อ = 1,400 − 700 (มัดจำเคลมไปแล้ว) = ฿700", dr(purJv, "1150"), 70_000);
  eq("บันทึกซื้อ: Cr 1130 กลับมัดจำจ่าย (ฐานก่อน VAT) = ฿10,000", cr(purJv, "1130"), 1_000_000);
  eq("บันทึกซื้อ: Cr 2100 เจ้าหนี้ = ฿10,700", cr(purJv, "2100"), 1_070_000);
  eq("1130 มัดจำจ่ายคงเหลือ = 0 (หักหมดแล้ว)", await debitBalance(systemId, "1130"), 0);
  eq("listDeductiblePaidDeposits หลังหักครบ = ว่าง", (await exp.listDeductiblePaidDeposits(tenantId, systemId, vendor.id)).length, 0);
  eq("ยอดเจ้าหนี้ 2100 หลังบันทึกซื้อ = ฿10,700", await creditBalance(systemId, "2100"), 1_070_000);

  // ═══════════════ R4 — CNR / DNR ═══════════════
  console.log("\nR4 รับใบลดหนี้ (CNR) / รับใบเพิ่มหนี้ (DNR):");
  const cnr = await exp.createExpenseDoc({
    tenantId,
    systemId,
    docType: "CREDIT_NOTE_RECEIVED",
    contactId: vendor.id,
    vatMode: "EXCLUDE",
    vatPurchaseMode: "CLAIM",
    sourceDocId: pur.id,
    adjustReason: "ของขาด",
    lines: [{ description: "คืนของ", qty: 1, unitPrice: 100_000 }], // ฿1,000.00 + VAT 70
  });
  const cnrIssue = await exp.issueExpenseDoc(tenantId, systemId, cnr.id);
  assert("ออก CNR สำเร็จ", cnrIssue.ok === true, cnrIssue.ok === false ? cnrIssue.reason : "");
  eq(
    "CNR หลังออก = ISSUED",
    (await prisma.accountDocument.findUniqueOrThrow({ where: { id: cnr.id } })).status,
    "ISSUED",
  );
  const cnrJv = (await entriesOf(systemId, cnr.id))[0] as Entry;
  assert("CNR: JV สมดุล", cnrJv && balanced(cnrJv));
  eq("CNR: Dr 2100 ลดเจ้าหนี้ = ฿1,070", dr(cnrJv, "2100"), 107_000);
  eq("CNR: Cr 5000 กลับต้นทุน = ฿1,000", cr(cnrJv, "5000"), 100_000);
  eq("CNR: Cr 1150 กลับภาษีซื้อ = ฿70", cr(cnrJv, "1150"), 7_000);
  eq("ยอดเจ้าหนี้หลัง CNR = 10,700 − 1,070 = ฿9,630", await creditBalance(systemId, "2100"), 963_000);

  const dnr = await exp.createExpenseDoc({
    tenantId,
    systemId,
    docType: "DEBIT_NOTE_RECEIVED",
    contactId: vendor.id,
    vatMode: "EXCLUDE",
    vatPurchaseMode: "CLAIM",
    sourceDocId: pur.id,
    adjustReason: "คิดราคาขาด",
    lines: [{ description: "ค่าบริการเพิ่ม", qty: 1, unitPrice: 200_000 }], // ฿2,000.00 + VAT 140
  });
  const dnrIssue = await exp.issueExpenseDoc(tenantId, systemId, dnr.id);
  assert("ออก DNR สำเร็จ", dnrIssue.ok === true, dnrIssue.ok === false ? dnrIssue.reason : "");
  const dnrJv = (await entriesOf(systemId, dnr.id))[0] as Entry;
  assert("DNR: JV สมดุล", dnrJv && balanced(dnrJv));
  eq("DNR: Dr 5000 ต้นทุนเพิ่ม = ฿2,000", dr(dnrJv, "5000"), 200_000);
  eq("DNR: Dr 1150 ภาษีซื้อเพิ่ม = ฿140", dr(dnrJv, "1150"), 14_000);
  eq("DNR: Cr 2100 เพิ่มเจ้าหนี้ = ฿2,140", cr(dnrJv, "2100"), 214_000);
  eq("ยอดเจ้าหนี้หลัง DNR = 9,630 + 2,140 = ฿11,770", await creditBalance(systemId, "2100"), 1_177_000);

  // ═══════════════ R5 — ใบสั่งซื้อสินทรัพย์ (ASSET_PO) ═══════════════
  console.log("\nR5 ใบสั่งซื้อสินทรัพย์ (ASSET_PURCHASE_ORDER):");
  const apo = await exp.createPurchaseOrder({
    tenantId,
    systemId,
    docType: "ASSET_PURCHASE_ORDER",
    contactId: vendor.id,
    vatMode: "EXCLUDE",
    lines: [{ description: "เรือยาง", qty: 1, unitPrice: 5_000_000 }],
  });
  const apoSubmit = await exp.submitForApproval(tenantId, systemId, apo.id);
  assert("ส่งอนุมัติ APO สำเร็จ", apoSubmit.ok === true, apoSubmit.ok === false ? apoSubmit.reason : "");
  assert(
    "APO ได้เลขรัน prefix APO-",
    apoSubmit.ok === true && apoSubmit.docNo.startsWith("APO-"),
    apoSubmit.ok === true ? apoSubmit.docNo : "",
  );
  const apoApprove = await exp.approvePurchaseOrder(tenantId, systemId, apo.id, userId);
  assert("อนุมัติ APO สำเร็จ", apoApprove.ok === true, apoApprove.ok === false ? apoApprove.reason : "");
  eq(
    "APO หลังอนุมัติ = APPROVED",
    (await prisma.accountDocument.findUniqueOrThrow({ where: { id: apo.id } })).status,
    "APPROVED",
  );
  eq("APO ไม่ลงบัญชี (ใบสั่งซื้อยังไม่มีภาระ)", (await entriesOf(systemId, apo.id)).length, 0);
  const apoConv = await exp.convertPurchaseOrder(tenantId, systemId, apo.id, userId);
  assert("แปลง APO → ซื้อสินทรัพย์สำเร็จ", apoConv.ok === true, apoConv.ok === false ? apoConv.reason : "");
  eq("ปลายทางการแปลง = ASSET_PURCHASE", apoConv.ok === true ? apoConv.toDocType : "", "ASSET_PURCHASE");

  // ═══════════════ R6 — ใบกำกับภาษีซื้อ (PTX) ═══════════════
  console.log("\nR6 ใบกำกับภาษีซื้อ (PURCHASE_TAX_INVOICE):");
  const purAwait = await exp.createExpenseDoc({
    tenantId,
    systemId,
    docType: "EXPENSE",
    contactId: vendor.id,
    vatMode: "EXCLUDE",
    vatPurchaseMode: "AWAITING", // ยังไม่รับใบกำกับ → พักภาษีซื้อที่ 1155 + เปิด PTX รอรับ
    lines: [{ description: "ค่าน้ำมันเรือ", qty: 1, unitPrice: 300_000 }], // ฿3,000 + VAT 210
  });
  const awIssue = await exp.issueExpenseDoc(tenantId, systemId, purAwait.id);
  assert("ออกค่าใช้จ่ายโหมดรอใบกำกับสำเร็จ", awIssue.ok === true, awIssue.ok === false ? awIssue.reason : "");
  const awJv = (await entriesOf(systemId, purAwait.id))[0] as Entry;
  eq("โหมดรอใบกำกับ: Dr 1155 ภาษีซื้อรอเรียกเก็บ = ฿210", dr(awJv, "1155"), 21_000);
  eq("โหมดรอใบกำกับ: ยังไม่แตะ 1150", dr(awJv, "1150"), 0);
  const ptx = await prisma.accountDocument.findFirstOrThrow({
    where: { systemId, docType: "PURCHASE_TAX_INVOICE", sourceDocId: purAwait.id },
  });
  eq("สร้าง PTX รอรับอัตโนมัติ", ptx.status, "AWAITING_RECEIVE");
  eq("PTX ยอด = VAT ของเอกสารต้นทาง ฿210", ptx.vatAmount, 21_000);
  eq("PTX ยังไม่ลงบัญชีตอนรอรับ", (await entriesOf(systemId, ptx.id)).length, 0);
  const rel = await prisma.accountDocumentRelation.findFirst({ where: { systemId, fromId: purAwait.id, toId: ptx.id } });
  eq("PTX ผูก relation TAX_FOR กับต้นทาง", rel?.type, "TAX_FOR");

  const recv = await exp.receivePurchaseTaxInvoice(tenantId, systemId, ptx.id);
  assert("บันทึกรับใบกำกับสำเร็จ", recv.ok === true, recv.ok === false ? recv.reason : "");
  eq(
    "PTX หลังรับ = RECEIVED",
    (await prisma.accountDocument.findUniqueOrThrow({ where: { id: ptx.id } })).status,
    "RECEIVED",
  );
  const ptxJv = (await entriesOf(systemId, ptx.id))[0] as Entry;
  assert("PTX: JV สมดุล", ptxJv && balanced(ptxJv));
  eq("PTX: Dr 1150 = ฿210 (เคลมได้แล้ว)", dr(ptxJv, "1150"), 21_000);
  eq("PTX: Cr 1155 = ฿210 (ล้างบัญชีพัก)", cr(ptxJv, "1155"), 21_000);
  eq("1155 ภาษีซื้อรอใบกำกับคงเหลือ = 0", await debitBalance(systemId, "1155"), 0);
  const recvAgain = await exp.receivePurchaseTaxInvoice(tenantId, systemId, ptx.id);
  assert("รับใบกำกับซ้ำไม่ได้ (กัน VAT ซ้ำ)", recvAgain.ok === false);
  eq("PTX: JV ยังมีใบเดียว", (await entriesOf(systemId, ptx.id)).length, 1);

  // ═══════════════ R7 — payableStats ═══════════════
  console.log("\nR7 payableStats (KPI หน้าหลัก):");
  // เอกสารพ้นกำหนด 1 ใบ (ครบกำหนดเมื่อวาน · ยังไม่จ่าย)
  const yesterday = new Date(Date.now() - 24 * 3600 * 1000);
  const late = await exp.createExpenseDoc({
    tenantId,
    systemId,
    docType: "EXPENSE",
    contactId: vendor.id,
    dueDate: yesterday,
    vatMode: "NONE",
    vatPurchaseMode: "NO_CLAIM",
    lines: [{ description: "ค่าเช่าโกดัง", qty: 1, unitPrice: 500_000 }], // ฿5,000
  });
  const lateIssue = await exp.issueExpenseDoc(tenantId, systemId, late.id);
  assert("ออกเอกสารพ้นกำหนดสำเร็จ", lateIssue.ok === true, lateIssue.ok === false ? lateIssue.reason : "");

  const stats = await exp.payableStats(tenantId, systemId);
  // คำนวณมือจากเอกสารทั้งหมดของ tenant ทิ้งนี้
  const openDocs = await prisma.accountDocument.findMany({
    where: { tenantId, systemId, direction: "IN", status: { in: ["AWAITING_PAYMENT", "PARTIAL"] } },
    select: { grandTotal: true, paidTotal: true, dueDate: true, status: true, validUntil: true },
  });
  const handPayable = openDocs.reduce((s, d) => s + Math.max(0, d.grandTotal - d.paidTotal), 0);
  const handOverdue = openDocs.filter((d) => exp.isOverdue(d));
  eq("payableStats.openCount ตรงกับนับมือ", stats.openCount, openDocs.length);
  eq("payableStats.payable ตรงกับคำนวณมือ", stats.payable, handPayable);
  eq("payableStats.overdueCount ตรงกับนับมือ", stats.overdueCount, handOverdue.length);
  eq(
    "payableStats.overdueAmount ตรงกับคำนวณมือ",
    stats.overdueAmount,
    handOverdue.reduce((s, d) => s + Math.max(0, d.grandTotal - d.paidTotal), 0),
  );
  assert("payableStats: มีใบพ้นกำหนดจริงอย่างน้อย 1 ใบ (positive control)", stats.overdueCount >= 1, `ได้ ${stats.overdueCount}`);
  eq("payableStats.awaitingTaxInvoice = 0 (รับใบกำกับครบแล้ว)", stats.awaitingTaxInvoice, 0);
  eq("payableStats.pendingApproval = 0 (APO อนุมัติแล้ว)", stats.pendingApproval, 0);

  // ═══════════════ R8 — สมดุลทั้งระบบ ═══════════════
  console.log("\nR8 ความถูกต้องรวม:");
  const all = await entriesOf(systemId);
  assert("ทุก JV สมดุล (Σdr == Σcr ต่อใบ)", all.every(balanced), `${all.filter((e) => !balanced(e)).length} ใบไม่สมดุล`);
  const gd = all.flatMap((e) => e.lines).reduce((s, l) => s + l.debit, 0);
  const gc = all.flatMap((e) => e.lines).reduce((s, l) => s + l.credit, 0);
  eq(`Σ debit ทั้งระบบ == Σ credit (${all.length} ใบ)`, gd, gc);
  const dupKeys = await prisma.accountJournalEntry.groupBy({
    by: ["idempotencyKey"],
    where: { systemId },
    _count: { _all: true },
  });
  assert("ไม่มี idempotencyKey ซ้ำ (โพสต์ซ้ำไม่เกิด JV ซ้ำ)", dupKeys.every((k) => k._count._all === 1));
} catch (e) {
  bad("EXCEPTION", e instanceof Error ? (e.stack ?? e.message) : String(e));
} finally {
  const del = async (f: () => Promise<unknown>) => {
    try {
      await f();
    } catch {}
  };
  if (tenantId) {
    for (const m of ["accountJournalLine", "accountDocumentPayment", "accountDocumentRelation", "accountDocumentLine"])
      await del(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountJournalEntry.updateMany({ where: { tenantId }, data: { reversalOfId: null } }));
    await del(() => prisma.accountJournalEntry.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountDocument.updateMany({ where: { tenantId }, data: { sourceDocId: null } }));
    await del(() => prisma.accountDocument.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountDocSequence.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountMapping.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountLedger.updateMany({ where: { tenantId }, data: { parentId: null } }));
    await del(() => prisma.accountLedger.deleteMany({ where: { tenantId } }));
    for (const m of ["accountPeriod", "accountContact", "accountSettings", "appSystemUnit", "appSystem", "auditLog"])
      await del(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId } }));
    await del(() => prisma.membership.deleteMany({ where: { tenantId } }));
    await del(() => prisma.tenant.delete({ where: { id: tenantId } }));
  }
  if (userId) await del(() => prisma.user.delete({ where: { id: userId } }));
}

console.log(`\n===== สรุป WO 1.2 =====`);
console.log(`ผ่าน ${passed} · ล้ม ${findings.length}`);
if (findings.length) console.log(findings.map((f) => "  ❌ " + f).join("\n"));
await prisma.$disconnect();
process.exit(findings.length === 0 ? 0 : 1);
