// QC ACC T3.2 — ฐานหัก ณ ที่จ่าย: ธงรายบรรทัดตอนจ่ายจริง (ไม่หักทั้งใบเมื่อมีสินค้าปน) · ใบวางบิล/ใบรวมจ่ายใช้ฐานก่อน VAT ·
//   จ่ายบางส่วนคิดตามสัดส่วนสะสม ตรงถึงสตางค์ทุกงวด (รวมทุกงวด = ฐานทั้งใบ)
// design note ledger/wo-notes/T3.2.md · รัน: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-acc-v2-wht-base.mts
//
// เฉลยคำนวณมือ (สตางค์ · VAT 7% แยกนอก):
//   B1 ค่าบริการ 10,000 (ธง 40(8) 3%) + สินค้า 5,000 (GOODS ไม่มีธง) ⇒ ยอดใบ 16,050.00 (1,605,000) · ฐานทั้งใบ 1,000,000 (ไม่ใช่ 1,500,000)
//      แบ่งจ่าย 3 งวด ตัดหนี้ 500,000 / 600,000 / 505,000:
//        สะสม: round(1,000,000×500,000/1,605,000)=311,526 · round(…×1,100,000/…)=685,358 · 1,000,000
//        ฐานงวด 311,526 / 373,832 / 314,642 (รวม 1,000,000) · ภาษี 3% = 9,346 / 11,215 / 9,439 (รวม 30,000)
//        เงินจ่ายจริง = 490,654 / 588,785 / 495,561
//   B2 ไม่มีธงเลย: บริการ 10,000 (SERVICE) + สินค้า 10,000 (GOODS) ⇒ ฐาน 1,000,000 (เฉพาะบริการ)
//   B3 ส่วนลดท้ายบิล 1,000 บนบริการ 10,000 + สินค้า 10,000 (ไม่มีธง) ⇒ ส่วนลดตกบริการ 500 ⇒ ฐาน 950,000
//   B4 ใบรวม VAT (INCLUDE) บริการ 10,700 (ธง 3%) ⇒ ฐาน 1,000,000 (ถอด VAT)
//   B5 ฝั่งขาย: ใบแจ้งหนี้ สินค้า 10,000 (GOODS) + บริการ 10,000 (SERVICE) ⇒ ยอด 2,140,000 · ลูกค้าหัก 3% จ่ายครบ:
//        ตัดหนี้ 2,140,000 = เงิน 2,110,000 + ภาษี 30,000 ⇒ WTI ฐาน 1,000,000 (เดิม subTotal 2,000,000)
//   B6 ใบวางบิล/ใบรวมจ่าย: ฐานของยอดค้างต่อใบลูก = ก่อน VAT (whtOutstandingBases) — B1 หลังจ่ายงวด 1 ⇒ ค้าง 1,105,000 ⇒ ฐาน 688,474 (=1,000,000−311,526)
//   B7 แผงจ่าย: whtBaseSatang ของยอดค้าง = ฐานที่เหลือ · whtForCash(เงิน 490,654) ⇒ ภาษี 9,346 (แก้เงินจ่ายบางส่วน = ภาษีคิดใหม่ ไม่คงภาษีเต็มใบ)
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-acc-v2-wht-base");
const F = await import("./acc-v2-wht-fixture.mts" as string);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const { chk, finish } = F.makeChecker();
const shops: Any[] = [];
try {
  const WC = (await import("@/lib/modules/account/wht-calc" as string)) as Any;
  const PM = (await import("@/lib/modules/account/payment" as string)) as Any;
  const acc = (await import("@/lib/modules/account/service" as string)) as Any;
  const co = await F.makeShop("base", { entityKind: "COMPANY", vat: true });
  shops.push(co);
  const v = await co.vendor("บจก. ผสม", { taxId: "0105561000777" });

  console.log("\nB0 ตัวคิด pure:");
  chk("B0.1", "instalmentWhtBase สะสม: 311,526 / 373,832 / 314,642 (รวม 1,000,000)", WC.instalmentWhtBase(1_000_000, 1_605_000, 0, 500_000) === 311_526 && WC.instalmentWhtBase(1_000_000, 1_605_000, 500_000, 600_000) === 373_832 && WC.instalmentWhtBase(1_000_000, 1_605_000, 1_100_000, 505_000) === 314_642, "311526/373832/314642", [WC.instalmentWhtBase(1_000_000, 1_605_000, 0, 500_000), WC.instalmentWhtBase(1_000_000, 1_605_000, 500_000, 600_000), WC.instalmentWhtBase(1_000_000, 1_605_000, 1_100_000, 505_000)]);
  const b2 = WC.docWhtBase({ lines: [{ amount: 1_000_000, vatRateBp: 700, lineKind: "SERVICE" }, { amount: 1_000_000, vatRateBp: 700, lineKind: "GOODS" }], discountAmount: 0, vatMode: "EXCLUDE" });
  chk("B0.2", "ไม่มีธง: นับเฉพาะบริการ ⇒ 1,000,000 · สินค้าที่ไม่นับ 1,000,000", b2.base === 1_000_000 && b2.goodsExcluded === 1_000_000 && b2.byLineFlags === false, "1,000,000", b2);
  const b3 = WC.docWhtBase({ lines: [{ amount: 1_000_000, vatRateBp: 700, lineKind: "SERVICE" }, { amount: 1_000_000, vatRateBp: 700, lineKind: "GOODS" }], discountAmount: 100_000, vatMode: "EXCLUDE" });
  chk("B0.3", "ส่วนลดท้ายบิล 1,000 กระจาย ⇒ ฐาน 950,000", b3.base === 950_000, 950_000, b3);
  const b4 = WC.docWhtBase({ lines: [{ amount: 1_070_000, vatRateBp: 700, whtRateBp: 300, whtIncomeType: "M40_8" }], discountAmount: 0, vatMode: "INCLUDE" });
  chk("B0.4", "ใบรวม VAT ถอด VAT ⇒ 1,000,000", b4.base === 1_000_000, 1_000_000, b4);
  const cash = WC.whtForCash(490_654, 300, 1_000_000, 1_605_000, 0);
  chk("B0.5", "whtForCash(เงิน 490,654) ⇒ ภาษี 9,346 · ฐาน 311,526 · ตัดหนี้ 500,000", cash.wht === 9_346 && cash.base === 311_526 && cash.tieOff === 500_000, "9346/311526/500000", cash);

  console.log("\nB1 แบ่งจ่าย 3 งวด ใบผสมบริการ(ธง)+สินค้า:");
  const e1 = await F.makeExpense(co, v.id, [
    { description: "ค่าติดตั้ง", amount: 1_000_000, lineKind: "SERVICE", whtIncomeType: "M40_8", whtRateBp: 300 },
    { description: "อุปกรณ์", amount: 500_000, lineKind: "GOODS" },
  ]);
  const doc1 = await co.prisma.accountDocument.findUnique({ where: { id: e1 } });
  chk("B1.0", "ยอดใบ 1,605,000", doc1?.grandTotal === 1_605_000, 1_605_000, doc1?.grandTotal);
  const panel = await PM.paymentPanelData(co.tid, co.S, e1);
  chk("B1.1", "แผงจ่าย: ฐานยอดค้างทั้งก้อน = 1,000,000 (เดิม subTotal 1,500,000) · ก้อน wht.base.full = 1,000,000 · ไม่นับสินค้า 500,000", panel?.whtBaseSatang === 1_000_000 && panel.wht?.base.full === 1_000_000 && panel.wht?.base.goodsExcluded === 500_000, "1,000,000", { b: panel?.whtBaseSatang, w: panel?.wht?.base });
  const pay = async (cashS: number, wht: number, day: number) =>
    PM.recordPayments(co.tid, co.S, e1, [{ paidAt: `2026-09-${String(day).padStart(2, "0")}`, financeAccountId: co.bank.id, amountSatang: cashS, note: "", whtIncomeType: "M40_8", whtIncomeCode: "M40_8", whtRateBp: 300, whtAmountSatang: wht, feeSatang: 0, cheque: null }], { userId: co.owner.id, keyBase: `b1-${day}-${Date.now()}` });
  const p1 = await pay(490_654, 9_346, 10);
  const p2 = await pay(588_785, 11_215, 20);
  const mid = await PM.paymentPanelData(co.tid, co.S, e1);
  const p3 = await pay(495_561, 9_439, 28);
  const certs = await co.prisma.accountDocument.findMany({ where: { systemId: co.S, docType: "WHT_CERT", sourceDocId: e1 }, orderBy: { issueDate: "asc" } });
  chk("B1.2", "3 งวดบันทึกได้ · ใบ PAID · ไม่มีคำเตือนภาษีต่างจากฐาน×อัตรา", p1.ok && p2.ok && p3.ok && p3.status === "PAID" && ![p1, p2, p3].some((p: Any) => p.warnings?.some((w: Any) => w.code === "WHT_AMOUNT_DIFFERS")), "PAID", { p1, p2, p3 });
  chk("B1.3", "50 ทวิ 3 ใบ ฐาน 311,526 / 373,832 / 314,642 (รวม 1,000,000) · ภาษี 9,346 / 11,215 / 9,439 (รวม 30,000)", certs.length === 3 && certs.map((c: Any) => c.subTotal).join() === "311526,373832,314642" && certs.map((c: Any) => c.whtAmount).join() === "9346,11215,9439" && certs.reduce((s: number, c: Any) => s + c.subTotal, 0) === 1_000_000, "ตามเฉลย", certs.map((c: Any) => [c.subTotal, c.whtAmount]));
  chk("B1.4", "แผงระหว่างทาง (จ่ายแล้ว 1,100,000): ฐานยอดค้าง = 314,642", mid?.whtBaseSatang === 314_642, 314_642, mid?.whtBaseSatang, "MAJOR");
  const pays = await co.prisma.accountDocumentPayment.findMany({ where: { documentId: e1 }, orderBy: { paidAt: "asc" } });
  chk("B1.5", "แถวการจ่ายเก็บฐานของงวด (whtBaseSatang) ตรง 50 ทวิ", pays.map((p: Any) => p.whtBaseSatang).join() === "311526,373832,314642", "311526,373832,314642", pays.map((p: Any) => p.whtBaseSatang), "MAJOR");

  console.log("\nB2 ใบผสมไม่มีธง (นับเฉพาะบริการ) + ส่วนลด:");
  {
    const e2 = await F.makeExpense(co, v.id, [{ description: "บริการ", amount: 1_000_000, lineKind: "SERVICE" }, { description: "ของ", amount: 1_000_000, lineKind: "GOODS" }], { discount: 100_000 });
    const d2 = await co.prisma.accountDocument.findUnique({ where: { id: e2 } });
    const p = await PM.paymentPanelData(co.tid, co.S, e2);
    chk("B2.1", "ยอดใบ 2,033,000 · ฐาน 950,000 (ส่วนลดตกบริการ 500 · ไม่นับสินค้า)", d2?.grandTotal === 2_033_000 && p?.whtBaseSatang === 950_000, "2033000/950000", { g: d2?.grandTotal, b: p?.whtBaseSatang });
    const r = await PM.recordPayments(co.tid, co.S, e2, [{ paidAt: "2026-09-12", financeAccountId: co.bank.id, amountSatang: 2_033_000 - 28_500, note: "", whtIncomeType: "M40_8", whtRateBp: 300, whtAmountSatang: 28_500, feeSatang: 0, cheque: null }], { userId: co.owner.id, keyBase: `b2-${Date.now()}` });
    const c = await co.prisma.accountDocument.findFirst({ where: { systemId: co.S, docType: "WHT_CERT", sourceDocId: e2 } });
    chk("B2.2", "จ่ายครบ หัก 28,500 ⇒ 50 ทวิ ฐาน 950,000", r.ok && c?.subTotal === 950_000 && c.whtAmount === 28_500, "950000", { r, c: c && [c.subTotal, c.whtAmount] });
  }

  console.log("\nB5 ฝั่งขาย: ลูกค้าหัก ณ ที่จ่าย ใบผสมสินค้า+บริการ:");
  {
    const cust = await co.acc.createContact({ tenantId: co.tid, systemId: co.S, kind: "CUSTOMER", legalType: "COMPANY", name: "บจก. ลูกค้าหัก", taxId: "0105561000888", branchCode: "00000", address: "2 ถ.ลูกค้า" });
    const inv = await acc.createDocument({ tenantId: co.tid, systemId: co.S, docType: "INVOICE", contactId: cust.id, vatMode: "EXCLUDE", issueDate: F.D(9, 2), dueDate: F.D(9, 30), lines: [{ description: "สินค้า", qty: 1, unitPrice: 1_000_000, vatRateBp: 700, lineKind: "GOODS" }, { description: "บริการ", qty: 1, unitPrice: 1_000_000, vatRateBp: 700, lineKind: "SERVICE" }], createdById: co.owner.id });
    const iss = await acc.issueDocument(co.tid, co.S, inv.id, {});
    const r = await PM.recordPayments(co.tid, co.S, inv.id, [{ paidAt: "2026-09-15", financeAccountId: co.bank.id, amountSatang: 2_110_000, note: "", whtIncomeType: "M40_8", whtRateBp: 300, whtAmountSatang: 30_000, feeSatang: 0, cheque: null }], { userId: co.owner.id, keyBase: `b5-${Date.now()}` });
    const wti = await co.prisma.accountDocument.findFirst({ where: { systemId: co.S, docType: "WHT_CERT", sourceDocId: inv.id } });
    chk("B5.1", "WTI ฐาน 1,000,000 (เฉพาะบริการ · เดิม subTotal 2,000,000) · ภาษี 30,000", iss.ok && r.ok && wti?.subTotal === 1_000_000 && wti.whtAmount === 30_000, "1000000/30000", { iss: iss.ok, r, wti: wti && [wti.subTotal, wti.whtAmount, wti.direction] });
  }

  console.log("\nB6 ใบวางบิล/ใบรวมจ่าย: ฐานของยอดค้างต่อใบลูก ก่อน VAT:");
  {
    const e6 = await F.makeExpense(co, v.id, [
      { description: "ค่าติดตั้ง", amount: 1_000_000, lineKind: "SERVICE", whtIncomeType: "M40_8", whtRateBp: 300 },
      { description: "อุปกรณ์", amount: 500_000, lineKind: "GOODS" },
    ]);
    await PM.recordPayments(co.tid, co.S, e6, [{ paidAt: "2026-09-10", financeAccountId: co.bank.id, amountSatang: 490_654, note: "", whtIncomeType: "M40_8", whtRateBp: 300, whtAmountSatang: 9_346, feeSatang: 0, cheque: null }], { userId: co.owner.id, keyBase: `b6-${Date.now()}` });
    const m = await acc.whtOutstandingBases(co.tid, co.S, [e6]);
    chk("B6.1", "ยอดค้าง 1,105,000 ⇒ ฐานก่อน VAT 688,474 (เดิมแผงกลุ่มใช้ยอดค้างรวม VAT 1,105,000)", m.get(e6) === 688_474, 688_474, m.get(e6));
  }
} catch (e) {
  console.error(e);
  chk("CRASH", "ไม่ crash", false, "-", String(e));
} finally {
  for (const s of shops) await s.cleanup();
}
const ok = finish();
const { prisma } = await import("@/lib/core/db");
await prisma.$disconnect();
process.exit(ok ? 0 : 1);
