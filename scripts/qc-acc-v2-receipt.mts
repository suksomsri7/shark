// QC ACC T2.8 — ใบเสร็จ: ออกเมื่อมีรายการรับเงิน · "ได้รับเงินแล้ว" · เตือนร้านไม่มีเลขผู้เสียภาษี · ใบเสร็จอัตโนมัติทุกครั้งที่รับเงิน
//
// ใบงาน: ledger/ACCOUNT-TAX-PLAN.md แถว T2.8 (ปิด B4 B8 B9) · design note ledger/wo-notes/T2.8.md
// ฟิกซ์เจอร์ของตัวเอง (ร้านทิ้ง สร้างเอง ลบใน finally)
// รัน: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-acc-v2-receipt.mts
//
// เฉลยคำนวณมือ (7% แยก VAT · สตางค์):
//   R1 ใบเสร็จขายสด 10,000 + 700 = 10,700 (1,070,000) ออกคลิกเดียว ⇒ รายการรับ 1 แถว 1,070,000 วันที่ใบ · บัญชีเงินสดบัญชีแรก ·
//      JV Dr 1000 (เงินสดของบัญชีนั้น) 1,070,000 / Cr รายได้ 1,000,000 / Cr 2200 70,000 · ยกเลิกรายการรับเดี่ยว ๆ ไม่ได้ (ให้ยกเลิกใบเสร็จ)
//   R2 เลือกบัญชีธนาคาร + วันที่ 3 ส.ค. ⇒ รายการรับลงบัญชีธนาคาร · JV เดบิตบัญชีธนาคาร
//   R3 ใบเสร็จเก่าไม่มีรายการรับ ⇒ หน้าเอกสารแสดงแถว derived 1 แถว (ยอดใบ) · ฐานยังมี 0 แถว (ไม่ backfill)
//   R4 ใบแจ้งหนี้ 20,000 + 1,400 = 21,400 (2,140,000): รับ 1,000,000 แล้ว 1,140,000 ⇒ ใบเสร็จ 2 ใบ (PAID · มีเลข · วันที่รับ · 1 บรรทัด "งวดที่ n")
//      ใบแจ้งหนี้รับครบครั้งเดียว ⇒ ใบเสร็จยกบรรทัด/ยอดของใบแจ้งหนี้
//   R5 ยกเลิกงวดที่ 2 ⇒ ใบเสร็จของงวดนั้น VOIDED (ใบแรกคงอยู่)
//   R6 ค่าตั้งปิด ⇒ ไม่มีใบเสร็จ · ต่อใบ autoReceipt=true ชนะค่าตั้งปิด · ต่อใบ false ชนะค่าตั้งเปิด
//   R7 รับเงินผ่านใบเสร็จที่แปลงจากใบแจ้งหนี้ (ทาง ①) ⇒ ไม่มีใบเสร็จอัตโนมัติซ้ำ
//   R8 ร้านไม่มีเลขผู้เสียภาษี ⇒ คำเตือน RECEIPT_SELLER_TAX_ID_MISSING (ป้าย V · ack=false) ตอนออกใบเสร็จ/รับเงิน — ไม่บล็อก
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-acc-v2-receipt");

const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, exp: unknown, act: unknown, sev: Sev = "CRITICAL") => {
  cks.push({ id, ok, sev });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${JSON.stringify(exp)} | act ${JSON.stringify(act)?.slice(0, 600)}`}`);
};
const D = (m: number, d: number) => new Date(Date.UTC(2026, m - 1, d, 5));
const ymd = (d: Date) => new Date(d.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);

let tid = "";
const users: string[] = [];
try {
  const acc = (await import("@/lib/modules/account/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const gl = (await import("@/lib/modules/account/gl" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const DS = (await import("@/lib/modules/account/doc-settings" as string)) as Any;
  const fin = (await import("@/lib/modules/account/finance" as string)) as Any;
  const PAY = (await import("@/lib/modules/account/payment" as string)) as Any;
  const DD = (await import("@/lib/modules/account/doc-detail" as string)) as Any;
  const LG = (await import("@/lib/modules/account/legal-gate" as string)) as Any;

  const stamp = Date.now();
  const t = await prisma.tenant.create({ data: { name: "QC T2.8 receipt", slug: `qc-t28-${stamp}` } });
  tid = t.id;
  const owner = await prisma.user.create({ data: { email: `qc-t28-${stamp}@qc.local`, name: "เจ้าของ T2.8" } });
  users.push(owner.id);
  await prisma.membership.create({ data: { userId: owner.id, tenantId: tid, role: "OWNER", unitAccess: ["*"], acceptedAt: new Date() } });
  const S = (await sys.createSystem(tid, "ACCOUNT", "บัญชี T2.8")).id;
  const ctx = { tenantId: tid, systemId: S };
  await acc.saveSettings(tid, S, { orgName: "ร้าน T2.8", vatRegistered: true, vatRateBp: 700, taxId: "0105561000028" });
  await gl.ensureAccounting(ctx);
  const cash = await fin.createFinanceAccount({ tenantId: tid, systemId: S, type: "CASH", name: "เงินสดหน้าร้าน" });
  const bank = await fin.createFinanceAccount({ tenantId: tid, systemId: S, type: "BANK", name: "ออมทรัพย์", bankName: "กสิกรไทย" });
  const cust = await acc.createContact({ tenantId: tid, systemId: S, kind: "CUSTOMER", legalType: "COMPANY", name: "ลูกค้า T2.8", taxId: "0105561999928", branchCode: "00000" });
  const L1 = { description: "ค่าบริการ", qty: 1, unitPrice: 1_000_000, vatRateBp: 700, lineKind: "SERVICE" };
  const mk = (docType: string, issueDate: Date, lines: Any[], extra: Any = {}) =>
    acc.createDocument({ tenantId: tid, systemId: S, docType, contactId: cust.id, vatMode: "EXCLUDE", issueDate, dueDate: issueDate, lines, createdById: owner.id, ...extra });
  const pays = (docId: string) => prisma.accountDocumentPayment.findMany({ where: { documentId: docId }, orderBy: { createdAt: "asc" } });
  const receiptsOf = (ivId: string) => prisma.accountDocument.findMany({ where: { systemId: S, docType: "RECEIPT", sourceDocId: ivId }, orderBy: { createdAt: "asc" }, include: { lines: true } });
  const ledgerOfFinance = async (fid: string) => (await prisma.accountFinance.findUnique({ where: { id: fid }, select: { ledgerAccountId: true } }))?.ledgerAccountId;
  const jvLines = async (docId: string) => prisma.accountJournalLine.findMany({ where: { systemId: S, entry: { refType: "AccountDocument", refId: docId, reversalOfId: null } }, select: { accountId: true, debit: true, credit: true } });

  // ═══ R1 ใบเสร็จขายสดคลิกเดียว ═══
  console.log("\nR1 ใบเสร็จขายสด ออกคลิกเดียว → มีรายการรับเงินจริง (หัว = แท็บการชำระ = บัญชี):");
  const r1 = await mk("RECEIPT", D(8, 2), [L1]);
  const r1i = await acc.issueDocument(tid, S, r1.id);
  {
    const doc = await prisma.accountDocument.findUnique({ where: { id: r1.id } });
    const ps = await pays(r1.id);
    chk("R1.1", "ออกได้ · สถานะ PAID · paidTotal = 1,070,000", r1i.ok && doc?.status === "PAID" && doc.paidTotal === 1_070_000, "PAID/1070000", { r1i, s: doc?.status, p: doc?.paidTotal });
    chk("R1.2", "รายการรับ 1 แถว: 1,070,000 · วันที่ใบ 2026-08-02 · บัญชีเงินสดหน้าร้าน · ช่องทาง CASH", ps.length === 1 && ps[0].amount === 1_070_000 && ymd(ps[0].paidAt) === "2026-08-02" && ps[0].financeAccountId === cash.id && ps[0].channel === "CASH", "1 แถว", ps.map((p) => ({ a: p.amount, d: ymd(p.paidAt), f: p.financeAccountId, c: p.channel })));
    const ls = await jvLines(r1.id);
    const cashLedger = await ledgerOfFinance(cash.id);
    chk("R1.3", "JV: Dr บัญชีของเงินสดหน้าร้าน 1,070,000 (ไม่ใช่เงินสดลอย) · ดุล", ls.some((l) => l.accountId === cashLedger && l.debit === 1_070_000) && ls.reduce((a, l) => a + l.debit - l.credit, 0) === 0, "Dr cash", ls);
    const detail = await DD.getDocDetailData(tid, S, r1.id);
    chk("R1.4", "หน้าเอกสาร: แท็บการชำระมี 1 แถว (ไม่ใช่ 'ยังไม่มีการรับชำระ') ยอดตรงหัว", detail?.payments.filter((p: Any) => !p.voidedAt).length === 1 && detail.payments[0].amount === detail.grandTotal, "1 แถว", detail?.payments);
    const v = await acc.voidPayment(tid, S, r1.id, ps[0].id, "ทดสอบ");
    chk("R1.5", "ยกเลิกรายการรับเดี่ยว ๆ ไม่ได้ (เงินลงที่ตัวใบเสร็จ — ให้ยกเลิกใบเสร็จ)", !v.ok && /ยกเลิกใบเสร็จ/.test(v.reason), "ปฏิเสธ", v);
  }

  // ═══ R2 เลือกบัญชี/วันที่ ═══
  console.log("\nR2 ร่างใบเสร็จ: เลือกบัญชีธนาคาร + วันที่รับ:");
  {
    const r2 = await mk("RECEIPT", D(8, 2), [L1]);
    const r = await acc.issueDocument(tid, S, r2.id, { cashSale: { paidAt: D(8, 3), financeAccountId: bank.id } });
    const ps = await pays(r2.id);
    const ls = await jvLines(r2.id);
    const bankLedger = await ledgerOfFinance(bank.id);
    chk("R2.1", "รายการรับลงบัญชีธนาคาร วันที่ 2026-08-03 ช่องทาง TRANSFER · JV Dr บัญชีธนาคาร", r.ok && ps.length === 1 && ps[0].financeAccountId === bank.id && ymd(ps[0].paidAt) === "2026-08-03" && ps[0].channel === "TRANSFER" && ls.some((l) => l.accountId === bankLedger && l.debit === 1_070_000), "bank", { ps: ps.map((p) => [p.financeAccountId, ymd(p.paidAt), p.channel]), ls });
    const r2b = await mk("RECEIPT", D(8, 2), [L1]);
    const bad = await acc.issueDocument(tid, S, r2b.id, { cashSale: { financeAccountId: "ไม่มีจริง" } });
    chk("R2.2", "บัญชีเงินที่ไม่มีจริง = ปฏิเสธ (ไม่ออก)", !bad.ok && (await prisma.accountDocument.findUnique({ where: { id: r2b.id } }))?.status === "DRAFT", "ปฏิเสธ", bad);
  }

  // ═══ R3 ใบเสร็จเก่า ═══
  console.log("\nR3 ใบเสร็จเก่าไม่มีรายการรับ → แถวแสดงผล (ไม่ backfill):");
  {
    const r3 = await mk("RECEIPT", D(8, 4), [L1]);
    await acc.issueDocument(tid, S, r3.id);
    await prisma.accountDocumentPayment.deleteMany({ where: { documentId: r3.id } }); // จำลองข้อมูลก่อน T2.8
    const detail = await DD.getDocDetailData(tid, S, r3.id);
    chk("R3.1", "แท็บการชำระ: 1 แถว derived ยอด 1,070,000 วันที่ใบ · ฐานยังมี 0 แถว", detail?.payments.length === 1 && detail.payments[0].derived === true && detail.payments[0].amount === 1_070_000 && (await pays(r3.id)).length === 0, "derived", detail?.payments);
  }

  // ═══ R4 ใบเสร็จอัตโนมัติ ═══
  console.log("\nR4 รับเงินตามใบแจ้งหนี้ → ใบเสร็จอัตโนมัติทุกงวด:");
  const iv = await mk("INVOICE", D(8, 5), [{ ...L1, unitPrice: 2_000_000 }]);
  await acc.issueDocument(tid, S, iv.id);
  const p1 = await acc.recordPayment(tid, S, iv.id, { paidAt: D(8, 10), financeAccountId: bank.id, channel: "TRANSFER", amount: 1_000_000, createdById: owner.id, idempotencyKey: `r4a-${stamp}` });
  const p2 = await acc.recordPayment(tid, S, iv.id, { paidAt: D(8, 20), financeAccountId: bank.id, channel: "TRANSFER", amount: 1_140_000, createdById: owner.id, idempotencyKey: `r4b-${stamp}` });
  {
    const rcs = await receiptsOf(iv.id);
    chk("R4.1", "2 ใบเสร็จ PAID มีเลข · ลงวันที่รับเงิน 08-10 / 08-20 · ผูกงวด", p1.ok && p2.ok && rcs.length === 2 && rcs.every((r) => r.status === "PAID" && !!r.docNo) && ymd(rcs[0].issueDate) === "2026-08-10" && ymd(rcs[1].issueDate) === "2026-08-20" && rcs[0].sourcePaymentId === p1.paymentId && rcs[1].sourcePaymentId === p2.paymentId, "2 ใบ", rcs.map((r) => ({ s: r.status, n: r.docNo, d: ymd(r.issueDate), p: r.sourcePaymentId })));
    // ภาษีในงวด = VAT ของใบกำกับงวดเดียวกัน (บริการ): งวด 1 round(140,000 × 1,000,000 / 2,140,000) = 65,421 · งวด 2 (ครบ) = 140,000 − 65,421 = 74,579
    const tis = await prisma.accountDocument.findMany({ where: { systemId: S, docType: "TAX_INVOICE", sourceDocId: iv.id }, orderBy: { createdAt: "asc" }, select: { vatAmount: true } });
    chk("R4.2", "ยอดใบเสร็จ = เงินที่รับงวดนั้น (1,000,000 / 1,140,000) · 1 บรรทัด 'งวดที่ 1/2' · ภาษีที่รวมอยู่ = VAT ของใบกำกับงวดเดียวกัน (65,421 / 74,579) ไม่ใช่ 0%", rcs[0]?.grandTotal === 1_000_000 && rcs[1]?.grandTotal === 1_140_000 && rcs[0].lines.length === 1 && rcs[0].lines[0].description.includes("งวดที่ 1") && rcs[1].lines[0].description.includes("งวดที่ 2") && rcs[0].vatAmount === 65_421 && rcs[1].vatAmount === 74_579 && tis[0]?.vatAmount === 65_421 && rcs[0].subTotal === 934_579 && rcs[0].lines[0].vatRateBp === 700, "ตามนั้น", rcs.map((r) => [r.grandTotal, r.vatAmount, r.subTotal, r.lines.map((l) => [l.description, l.vatRateBp])]));
    chk("R4.3", "ใบเสร็จอัตโนมัติไม่มี JV ของตัวเอง (เงินลงที่งวดของใบแจ้งหนี้)", (await prisma.accountJournalEntry.count({ where: { systemId: S, refType: "AccountDocument", refId: { in: rcs.map((r) => r.id) } } })) === 0, 0, null);
    const detail = await DD.getDocDetailData(tid, S, rcs[0].id);
    chk("R4.4", "หน้าใบเสร็จอัตโนมัติ: แท็บการชำระแสดงรายการรับของงวดนั้น (1,000,000)", detail?.payments.length === 1 && detail.payments[0].id === p1.paymentId && detail.payments[0].amount === 1_000_000, "1 แถว", detail?.payments);
    const iv2 = await mk("INVOICE", D(8, 6), [L1, { description: "ค่าเดินทาง", qty: 2, unitPrice: 50_000, vatRateBp: 700, lineKind: "SERVICE" }]);
    await acc.issueDocument(tid, S, iv2.id);
    await acc.recordPayment(tid, S, iv2.id, { paidAt: D(8, 7), financeAccountId: bank.id, channel: "TRANSFER", amount: 1_177_000, createdById: owner.id, idempotencyKey: `r4w-${stamp}` });
    const w = (await receiptsOf(iv2.id))[0];
    chk("R4.5", "รับครบครั้งเดียว ⇒ ใบเสร็จยกบรรทัด/ยอดของใบแจ้งหนี้ (2 บรรทัด · ฐาน 1,100,000 · VAT 77,000 · รวม 1,177,000)", w?.lines.length === 2 && w.subTotal === 1_100_000 && w.vatAmount === 77_000 && w.grandTotal === 1_177_000, "ยกทั้งใบ", w && { l: w.lines.length, s: w.subTotal, v: w.vatAmount, g: w.grandTotal });
  }

  // ═══ R5 ยกเลิกงวด ═══
  console.log("\nR5 ยกเลิกงวด → ใบเสร็จของงวดนั้นยกเลิกตาม:");
  {
    const v = await acc.voidPayment(tid, S, iv.id, p2.paymentId, "รับซ้ำ");
    const rcs = await receiptsOf(iv.id);
    chk("R5.1", "งวดที่ 2 ยกเลิก ⇒ ใบเสร็จที่ 2 VOIDED (เหตุผลอ้างการยกเลิกรับชำระ) · ใบแรกยัง PAID", v.ok && rcs[1]?.status === "VOIDED" && (rcs[1].voidReason ?? "").includes("ยกเลิกตามการยกเลิกรับชำระ") && rcs[0].status === "PAID", "VOIDED/PAID", { v, s: rcs.map((r) => [r.status, r.voidReason]) });
  }

  // ═══ R6 ค่าตั้ง + ต่อใบ ═══
  console.log("\nR6 ค่าตั้ง receipt.autoOnPayment + สวิตช์ต่อใบ:");
  {
    const cur = await DS.getDocSettings(ctx);
    chk("R6.0", "ค่าเริ่ม autoOnPayment = เปิด", cur.receipt.autoOnPayment === true, true, cur.receipt);
    await DS.saveDocSettings(ctx, { receipt: { autoOnPayment: false } });
    const a = await mk("INVOICE", D(8, 8), [L1]);
    await acc.issueDocument(tid, S, a.id);
    await acc.recordPayment(tid, S, a.id, { paidAt: D(8, 9), financeAccountId: bank.id, channel: "TRANSFER", amount: 1_070_000, createdById: owner.id, idempotencyKey: `r6a-${stamp}` });
    const b = await mk("INVOICE", D(8, 8), [L1]);
    await prisma.accountDocument.update({ where: { id: b.id }, data: { autoReceipt: true } });
    await acc.issueDocument(tid, S, b.id);
    await acc.recordPayment(tid, S, b.id, { paidAt: D(8, 9), financeAccountId: bank.id, channel: "TRANSFER", amount: 1_070_000, createdById: owner.id, idempotencyKey: `r6b-${stamp}` });
    chk("R6.1", "ค่าตั้งปิด ⇒ ไม่มีใบเสร็จ · ต่อใบ true ⇒ มีใบเสร็จ", (await receiptsOf(a.id)).length === 0 && (await receiptsOf(b.id)).length === 1, "0/1", [(await receiptsOf(a.id)).length, (await receiptsOf(b.id)).length]);
    await DS.saveDocSettings(ctx, { receipt: { autoOnPayment: true } });
    const c = await mk("INVOICE", D(8, 8), [L1]);
    await prisma.accountDocument.update({ where: { id: c.id }, data: { autoReceipt: false } });
    await acc.issueDocument(tid, S, c.id);
    await acc.recordPayment(tid, S, c.id, { paidAt: D(8, 9), financeAccountId: bank.id, channel: "TRANSFER", amount: 1_070_000, createdById: owner.id, idempotencyKey: `r6c-${stamp}` });
    chk("R6.2", "ค่าตั้งเปิด + ต่อใบ false ⇒ ไม่มีใบเสร็จ", (await receiptsOf(c.id)).length === 0, 0, (await receiptsOf(c.id)).length);
  }

  // ═══ R7 ทาง ① ═══
  console.log("\nR7 รับเงินผ่านใบเสร็จที่แปลงจากใบแจ้งหนี้ → ไม่ซ้ำ:");
  {
    const v = await mk("INVOICE", D(8, 11), [L1]);
    await acc.issueDocument(tid, S, v.id);
    const conv = await acc.convertDocument(tid, S, v.id, "RECEIPT", owner.id);
    const ap = await PAY.approveReceiptWithPayments(tid, S, conv.newId, [{ paidAt: "2026-08-12", financeAccountId: bank.id, amountSatang: 1_070_000, note: "", whtIncomeType: null, whtRateBp: null, whtAmountSatang: 0, feeSatang: 0, cheque: null }], { userId: owner.id, keyBase: `r7-${stamp}` });
    const rcs = await receiptsOf(v.id);
    chk("R7.1", "ใบเสร็จของใบแจ้งหนี้มี 1 ใบ (ใบที่แปลงเอง) — ไม่มีใบอัตโนมัติซ้ำ", ap.ok && rcs.length === 1 && rcs[0].id === conv.newId, "1 ใบ", { ap, rcs: rcs.map((r) => r.id) });
  }

  // ═══ R8 ร้านไม่มีเลขผู้เสียภาษี ═══
  console.log("\nR8 ร้านไม่มีเลขผู้เสียภาษี → คำเตือน (ไม่บล็อก):");
  {
    const w = LG.issueLegalWarnings({ docType: "RECEIPT" }, { vatRegistered: false, taxId: "" });
    chk("R8.1", "issueLegalWarnings(RECEIPT) มี RECEIPT_SELLER_TAX_ID_MISSING ป้าย V ack=false อ้าง ม.105 ทวิ", w.some((x: Any) => x.code === "RECEIPT_SELLER_TAX_ID_MISSING" && x.tag === "V" && x.ack === false && /105 ทวิ/.test(x.citation)), "มี", w);
    chk("R8.2", "ร้านมีเลขแล้วไม่เตือน", !LG.issueLegalWarnings({ docType: "RECEIPT" }, { vatRegistered: true, taxId: "0105561000028" }).some((x: Any) => x.code === "RECEIPT_SELLER_TAX_ID_MISSING"), "ไม่มี", null);
    await prisma.accountSettings.updateMany({ where: { systemId: S }, data: { taxId: null } });
    const r8 = await mk("RECEIPT", D(8, 13), [L1]);
    const ok = await acc.issueDocument(tid, S, r8.id);
    chk("R8.3", "ออกใบเสร็จได้ (ไม่บล็อก)", ok.ok, "ok", ok);
    const ivx = await mk("INVOICE", D(8, 13), [L1]);
    await acc.issueDocument(tid, S, ivx.id);
    const px = await acc.recordPayment(tid, S, ivx.id, { paidAt: D(8, 14), financeAccountId: bank.id, channel: "TRANSFER", amount: 1_070_000, createdById: owner.id, idempotencyKey: `r8-${stamp}` });
    chk("R8.4", "รับเงิน + ใบเสร็จอัตโนมัติ ⇒ ผลมีคำเตือน RECEIPT_SELLER_TAX_ID_MISSING", px.ok && px.warnings?.some((x: Any) => x.code === "RECEIPT_SELLER_TAX_ID_MISSING"), "warning", px);
  }
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? `${e.message.slice(0, 400)}\n${e.stack?.split("\n").slice(1, 5).join("\n")}` : String(e));
} finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  if (tid) {
    const P = prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown>; updateMany: (a: unknown) => Promise<unknown> }>;
    await d(() => P.accountJournalLine.deleteMany({ where: { tenantId: tid } }));
    await d(() => P.accountJournalEntry.updateMany({ where: { tenantId: tid }, data: { reversalOfId: null } }));
    await d(() => P.accountJournalEntry.deleteMany({ where: { tenantId: tid } }));
    await d(() => P.accountDocument.updateMany({ where: { tenantId: tid }, data: { sourceDocId: null, replacedById: null, sourcePaymentId: null } }));
    await d(() => P.accountDocumentPayment.deleteMany({ where: { tenantId: tid } }));
    await d(() => P.accountDocumentRelation.deleteMany({ where: { tenantId: tid } }));
    await d(() => P.accountDocumentLine.deleteMany({ where: { tenantId: tid } }));
    for (const m of ["accountAttachment", "accountDocument", "accountDocSequence", "accountProduct", "accountMapping", "accountFinance", "accountContact", "accountPeriod", "accountSettings", "settingChange", "settingValue", "auditLog", "outboxEvent", "membership", "appSystemUnit"]) {
      await d(() => P[m].deleteMany({ where: { tenantId: tid } }));
    }
    await d(() => P.accountLedger.updateMany({ where: { tenantId: tid }, data: { parentId: null } }));
    await d(() => P.accountLedger.deleteMany({ where: { tenantId: tid } }));
    await d(() => P.appSystem.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.businessUnit.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.tenant.delete({ where: { id: tid } }));
  }
  for (const u of users) await d(() => prisma.user.delete({ where: { id: u } }));
  await prisma.$disconnect();
}

const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC ACC T2.8 ใบเสร็จ =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
