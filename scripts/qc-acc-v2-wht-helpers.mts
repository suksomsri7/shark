// QC ACC T3.6 — ตัวช่วยหัก ณ ที่จ่าย: ขั้นต่ำ 1,000 บาท/สัญญา · ออกภาษีให้ (สูตรเป็นค่าตั้ง + เตือน) · ธงตัวแทนหักภาษีต่อผู้ขาย ·
//   ค่าธรรมเนียมรับบัตร/MDR
// design note ledger/wo-notes/T3.6.md · รัน: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-acc-v2-wht-helpers.mts
//
// เฉลยคำนวณมือ (สตางค์):
//   H1 grossUp(1,000,000 @3%): ตลอดไป net×r÷(100−r) = 30,927.8 ⇒ 30,928 (เงินได้ 1,030,928 — ตรงตัวอย่าง skill 10,000 → 309.28)
//      ครั้งเดียว (net + net×r)×r = 30,900 · net×r = 30,000
//   H2 ร้าน บจ. จ่ายค่าบริการ 10,000 ให้ผู้ขายไม่จด VAT แบบ "ออกให้ตลอดไป":
//      เงินจ่ายผู้ขาย 1,000,000 (ตัดหนี้ครบ — PAID) · ภาษีที่ออกแทน 30,928 ⇒ JV: Dr 2100 1,000,000 · Dr 6970 30,928 / Cr ธนาคาร 1,000,000 · Cr 2130 30,928
//      50 ทวิ: ภาษี 30,928 · เงินได้ 1,030,928 · เงื่อนไข PAY_ALWAYS · คำเตือน WHT_GROSS_UP [U]
//   H3 ขั้นต่ำ: สัญญา 800 บาท หัก 3% ⇒ WHT_BELOW_MINIMUM · สัญญา 5,000 (บรรทัดติดธง 40(8) 3%) จ่ายงวด 900 ไม่หัก ⇒ WHT_MINIMUM_CUMULATIVE
//   H4 ผู้ขายเป็นตัวแทนหักภาษี: แผงบอก agent · จ่ายพร้อมหัก ⇒ WHT_AGENT_VENDOR · ไม่ออก 50 ทวิ · ช่องทาง AGENT
//   H5 ค่าธรรมเนียม 1,500 บาท (ร้าน บจ.) ⇒ WHT_ON_FEE · 300 บาท ⇒ ไม่เตือน
//   H6 ค่าตั้งสูตร: เปลี่ยน "ตลอดไป" เป็น NET_TIMES_RATE ⇒ คำเตือน WHT_GROSS_UP · ออกภาษีให้ 10,000 @3% = 30,000
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-acc-v2-wht-helpers");
const F = await import("./acc-v2-wht-fixture.mts" as string);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const { chk, finish } = F.makeChecker();
const shops: Any[] = [];
try {
  const WC = (await import("@/lib/modules/account/wht-calc" as string)) as Any;
  const PM = (await import("@/lib/modules/account/payment" as string)) as Any;
  const LV = (await import("@/lib/modules/account/legal-values" as string)) as Any;
  const co = await F.makeShop("help", { entityKind: "COMPANY", vat: false });
  shops.push(co);
  const v = await co.vendor("นาย ไม่จด VAT", { legalType: "PERSON" });
  const vCo = await co.vendor("บจก. ผู้รับเหมา");
  const pay = (docId: string, row: Record<string, unknown>, key: string) =>
    PM.recordPayments(co.tid, co.S, docId, [{ paidAt: "2026-09-15", financeAccountId: co.bank.id, note: "", whtIncomeType: null, whtRateBp: null, whtAmountSatang: 0, feeSatang: 0, cheque: null, ...row }], { userId: co.owner.id, keyBase: `${key}-${Date.now()}` });

  console.log("\nH1 สูตรออกภาษีให้ (pure):");
  const g1 = WC.grossUp(1_000_000, 300, "GROSS_UP_CONVERGED");
  const g2 = WC.grossUp(1_000_000, 300, "GROSS_UP_ONE_STEP");
  const g3 = WC.grossUp(1_000_000, 300, "NET_TIMES_RATE");
  chk("H1.1", "ตลอดไป 30,928 (เงินได้ 1,030,928) · ครั้งเดียว 30,900 · net×r 30,000", g1.tax === 30_928 && g1.income === 1_030_928 && g2.tax === 30_900 && g3.tax === 30_000, "30928/30900/30000", { g1, g2, g3 });

  console.log("\nH2 ออกภาษีให้ตลอดไป — ลงบัญชีแยก + 50 ทวิ:");
  {
    const e = await F.makeExpense(co, v.id, [{ description: "ค่าบริการออกแบบ", amount: 1_000_000 }], { vatMode: "NONE" });
    const r = await pay(e, { amountSatang: 1_000_000, whtIncomeCode: "M40_8", whtIncomeType: "M40_8", whtRateBp: 300, whtAmountSatang: 30_928, whtCondition: "PAY_ALWAYS" }, "h2");
    const d = await co.prisma.accountDocument.findUnique({ where: { id: e } });
    const p = await co.prisma.accountDocumentPayment.findFirst({ where: { documentId: e } });
    const cert = await co.prisma.accountDocument.findFirst({ where: { systemId: co.S, docType: "WHT_CERT", sourceDocId: e } });
    chk("H2.1", "บันทึกได้ · ใบ PAID (เงิน 1,000,000 ตัดหนี้ครบ) · การจ่าย: ไม่หัก (0) · ออกแทน 30,928 · เงื่อนไข PAY_ALWAYS · ฐาน 1,030,928", r.ok && d?.status === "PAID" && d.paidTotal === 1_000_000 && p?.whtAmountSatang === 0 && p.whtBorneSatang === 30_928 && p.whtCondition === "PAY_ALWAYS" && p.whtBaseSatang === 1_030_928, "ตามนั้น", { r, s: d?.status, pt: d?.paidTotal, p: p && [p.whtAmountSatang, p.whtBorneSatang, p.whtCondition, p.whtBaseSatang] });
    const je = p ? await co.prisma.accountJournalEntry.findFirst({ where: { systemId: co.S, refType: "AccountDocumentPayment", refId: p.id }, include: { lines: { include: { account: { select: { code: true } } } } } }) : null;
    const net = (code: string) => (je?.lines ?? []).filter((l: Any) => l.account.code === code).reduce((n: number, l: Any) => n + l.debit - l.credit, 0);
    chk("H2.2", "JV: Dr 2100 1,000,000 · Dr 6970 30,928 / Cr ธนาคาร 1,000,000 · Cr 2130 30,928", net("2100") === 1_000_000 && net("6970") === 30_928 && net("2130") === -30_928, "ตามนั้น", (je?.lines ?? []).map((l: Any) => [l.account.code, l.debit, l.credit]));
    chk("H2.3", "50 ทวิ: ภาษี 30,928 · เงินได้ 1,030,928 · เงื่อนไข PAY_ALWAYS", cert?.whtAmount === 30_928 && cert.subTotal === 1_030_928 && cert.whtCondition === "PAY_ALWAYS", "ตามนั้น", cert && [cert.whtAmount, cert.subTotal, cert.whtCondition]);
    chk("H2.4", "คำเตือน WHT_GROSS_UP [U] ไม่ต้องยืนยัน (มีสูตร + \"โปรดตรวจกับนักบัญชีของร้าน\")", r.ok && r.warnings?.some((w: Any) => w.code === "WHT_GROSS_UP" && w.tag === "U" && !w.ack && w.messageTh.includes("โปรดตรวจกับนักบัญชีของร้าน") && w.messageTh.includes("100 − r")), "warn", r.warnings, "MAJOR");
  }

  console.log("\nH3 ขั้นต่ำ 1,000 บาทต่อสัญญา:");
  {
    const small = await F.makeExpense(co, vCo.id, [{ description: "ค่าบริการเล็ก", amount: 80_000 }], { vatMode: "NONE" });
    const r = await pay(small, { amountSatang: 77_600, whtIncomeType: "M40_8", whtRateBp: 300, whtAmountSatang: 2_400 }, "h3a");
    chk("H3.1", "สัญญา 800 บาท หัก 3% ⇒ บันทึกได้ + WHT_BELOW_MINIMUM (V · อ้าง ข้อ 12/7)", r.ok && r.warnings?.some((w: Any) => w.code === "WHT_BELOW_MINIMUM" && /12\/7/.test(w.citation)), "warn", r.warnings);
    const big = await F.makeExpense(co, vCo.id, [{ description: "ค่าบริการผ่อน", amount: 500_000, whtIncomeType: "M40_8", whtRateBp: 300 }], { vatMode: "NONE" });
    const r2 = await pay(big, { amountSatang: 90_000 }, "h3b");
    chk("H3.2", "สัญญา 5,000 จ่ายงวด 900 ไม่หัก ⇒ WHT_MINIMUM_CUMULATIVE (ต้องหักแม้งวดไม่ถึง 1,000)", r2.ok && r2.warnings?.some((w: Any) => w.code === "WHT_MINIMUM_CUMULATIVE"), "warn", r2.warnings);
    chk("H3.3", "minimumCheck: ม.50 อัตราก้าวหน้า = ไม่เกี่ยว (null)", WC.minimumCheck(50_000, 100_000, true) === null && WC.minimumCheck(50_000, 100_000, false) === "BELOW" && WC.minimumCheck(100_000, 100_000, false) === "REACHED", "null/BELOW/REACHED", null, "MAJOR");
  }

  console.log("\nH4 ผู้ขายเป็นตัวแทนหักภาษี:");
  {
    const ag = await co.vendor("บจก. แพลตฟอร์ม (ตัวแทน)", { whtAgent: true });
    const fresh = await co.prisma.accountContact.findUnique({ where: { id: ag.id }, select: { whtAgent: true } });
    const e = await F.makeExpense(co, ag.id, [{ description: "ค่าคอมมิชชันแพลตฟอร์ม", amount: 1_000_000 }], { vatMode: "NONE" });
    const panel = await PM.paymentPanelData(co.tid, co.S, e);
    chk("H4.1", "ผู้ติดต่อเก็บธง whtAgent · แผงจ่ายบอก agent", fresh?.whtAgent === true && panel?.wht?.agent === true, "true", { f: fresh, a: panel?.wht?.agent });
    const r = await pay(e, { amountSatang: 970_000, whtIncomeType: "M40_2", whtIncomeCode: "M40_2", whtRateBp: 300, whtAmountSatang: 30_000 }, "h4");
    const p = await co.prisma.accountDocumentPayment.findFirst({ where: { documentId: e } });
    const certs = await co.prisma.accountDocument.count({ where: { systemId: co.S, docType: "WHT_CERT", sourceDocId: e } });
    chk("H4.2", "หักทั้งที่ผู้ขายเป็นตัวแทน ⇒ บันทึกได้ + WHT_AGENT_VENDOR · ไม่ออก 50 ทวิ · ช่องทาง AGENT", r.ok && r.warnings?.some((w: Any) => w.code === "WHT_AGENT_VENDOR") && certs === 0 && p?.whtChannel === "AGENT", "AGENT/0", { r, certs, ch: p?.whtChannel });
  }

  console.log("\nH5 ค่าธรรมเนียม (MDR/รับบัตร):");
  {
    const e = await F.makeExpense(co, vCo.id, [{ description: "ค่าบริการ", amount: 1_000_000 }], { vatMode: "NONE" });
    const r = await pay(e, { amountSatang: 970_000, whtIncomeType: "M40_8", whtRateBp: 300, whtAmountSatang: 30_000, feeSatang: 150_000 }, "h5");
    chk("H5.1", "ค่าธรรมเนียม 1,500 บาท (ร้าน บจ.) ⇒ WHT_ON_FEE", r.ok && r.warnings?.some((w: Any) => w.code === "WHT_ON_FEE"), "warn", r.warnings, "MAJOR");
    chk("H5.2", "feeWhtWarnings: 300 บาท ไม่เตือน · ร้านบุคคลธรรมดา ไม่เตือน", WC.feeWhtWarnings(30_000, true, 100_000).length === 0 && WC.feeWhtWarnings(150_000, false, 100_000).length === 0, "[]", null, "MAJOR");
  }

  console.log("\nH6 สูตรเป็นค่าตั้ง:");
  {
    const s = await LV.saveBookTax({ role: "OWNER", unitAccess: ["*"], permissions: {}, userId: co.owner.id }, co.ctx, { grossUpAlways: "NET_TIMES_RATE" });
    const legal = await LV.loadBookLegal(co.ctx);
    chk("H6.1", "ตั้งสูตร NET_TIMES_RATE ⇒ บันทึกได้ + WHT_GROSS_UP · ค่าตั้งอ่านกลับได้", s.ok && s.warnings?.some((w: Any) => w.code === "WHT_GROSS_UP") && LV.bookWhtOf(legal).grossUpAlways === "NET_TIMES_RATE", "ok", { s, w: LV.bookWhtOf(legal) });
    const e = await F.makeExpense(co, v.id, [{ description: "ค่าบริการ", amount: 1_000_000 }], { vatMode: "NONE" });
    const panel = await PM.paymentPanelData(co.tid, co.S, e);
    chk("H6.2", "แผงจ่ายได้สูตรใหม่ · ออกภาษีให้ 10,000 @3% = 30,000", panel?.wht?.settings?.grossUpAlways === "NET_TIMES_RATE" && WC.grossUp(1_000_000, 300, panel.wht.settings.grossUpAlways).tax === 30_000, "30000", panel?.wht?.settings, "MAJOR");
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
