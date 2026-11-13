// QC ACC T3.7 — สวิตช์ e-WHT (อัตราลดตามช่องทาง มีวันหมดอายุในตาราง — หมดแล้วหยุดเอง) · ตัวเตือนกำหนดยื่นจากตาราง T0.2
// design note ledger/wo-notes/T3.7.md · รัน: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-acc-v2-wht-ewht.mts
//
// เฉลย (skill common-withholding-tax.md §6 §8 §14 · common-vat-invoice.md §19):
//   E1 ตาราง: ค่าบริการ → บริษัท ช่องทาง EWHT 1% ณ 2026-09-15 · ณ 2028-01-01 ไม่มีแถว e-WHT ⇒ กลับ 3% + EWHT_NOT_IN_EFFECT
//      ค่าเช่า 5%→1% · โฆษณา 2%→1% · ค่าขนส่ง 1% ไม่ลด (ไม่มีแถว e-WHT) · ปันผล ไม่ลด
//   E2 สวิตช์ปิด (ค่าเริ่ม): ส่ง EWHT มา ⇒ บันทึกเป็นช่องทางปกติ + ออก 50 ทวิ
//   E3 เปิดสวิตช์: จ่ายค่าบริการ 10,000 ผ่าน e-WHT 1% = 100.00 ⇒ ไม่ออก 50 ทวิ · ช่องทาง EWHT · เก็บเลขอ้างอิง · คำเตือน WHT_EWHT_CHANNEL
//   E4 กำหนดยื่น ณ 2026-11-13: ภ.พ.30 เดือน 2026-10 กระดาษ 2026-11-15 (อีก 2 วัน) ออนไลน์ 2026-11-23 ·
//      ภ.ง.ด.53 เดือน 2026-10 กระดาษ 2026-11-07 (−6) ออนไลน์ 2026-11-15 (+2)
//      ณ 2027-02-20 (หลังช่วงขยายออนไลน์ 31 ม.ค. 2570): ภ.ง.ด.53 เดือน 2027-02 กระดาษ 2027-03-07 · ไม่มีวันออนไลน์ (แถวหมดอายุ — ไม่เดา)
//   E5 ตัวเตือนรายวัน: ณ 2026-11-02 (5 วันก่อน 2026-11-07) มี 50 ทวิ ต.ค. ผู้รับบริษัท ⇒ แจ้ง "ภ.ง.ด. ใกล้ครบกำหนดยื่น" 1 รายการ (ภ.ง.ด.53) · รันซ้ำวันเดียวกันไม่เพิ่ม
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-acc-v2-wht-ewht");
const F = await import("./acc-v2-wht-fixture.mts" as string);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const { chk, finish } = F.makeChecker();
const shops: Any[] = [];
try {
  const PM = (await import("@/lib/modules/account/payment" as string)) as Any;
  const LV = (await import("@/lib/modules/account/legal-values" as string)) as Any;
  const acc = (await import("@/lib/modules/account/service" as string)) as Any;
  const co = await F.makeShop("ewht", { entityKind: "COMPANY", vat: false });
  shops.push(co);
  const vCo = await co.vendor("บจก. บริการ e-WHT");
  const legal0 = await LV.loadBookLegal(co.ctx);
  const q = (code: string, ch: string, at: Date) => LV.legalValueFrom(legal0, "wht.rate", at, { incomeType: code, payer: "JURISTIC", recipient: "JURISTIC_TH", channel: ch });

  console.log("\nE1 อัตรา e-WHT มีวันหมดอายุ:");
  const a = q("M40_8", "EWHT", F.D(9, 15));
  const b = q("M40_8", "EWHT", new Date(Date.UTC(2028, 0, 1, 5)));
  chk("E1.1", "ค่าบริการ EWHT 1% ณ 2026-09-15 (แถว ฉ.402 [V] ถึง 2027-12-31)", a.value === 100 && a.row?.channel === "EWHT" && a.row?.to === "2027-12-31" && a.row?.tag === "V", 100, { v: a.value, row: a.row?.id });
  chk("E1.2", "ณ 2028-01-01 หมดอายุ ⇒ กลับอัตราปกติ 3% + EWHT_NOT_IN_EFFECT (หยุดเอง ไม่ต้องแก้)", b.value === 300 && b.row?.channel === "NORMAL" && b.warnings.some((w: Any) => w.code === "EWHT_NOT_IN_EFFECT"), 300, { v: b.value, w: b.warnings.map((w: Any) => w.code) });
  chk("E1.3", "ค่าเช่า 5%→1% · โฆษณา 2%→1% · ขนส่ง 1% ไม่ลด (ถอยไปปกติ) · ปันผลไม่ลด", q("M40_5", "EWHT", F.D(9, 15)).value === 100 && q("ADVERTISING", "EWHT", F.D(9, 15)).value === 100 && q("TRANSPORT", "EWHT", F.D(9, 15)).row?.channel === "NORMAL" && q("DIVIDEND", "EWHT", F.D(9, 15)).row?.channel === "NORMAL", "ตามนั้น", { rent: q("M40_5", "EWHT", F.D(9, 15)).value, adv: q("ADVERTISING", "EWHT", F.D(9, 15)).value, tr: q("TRANSPORT", "EWHT", F.D(9, 15)).row?.id }, "MAJOR");

  console.log("\nE2 สวิตช์ปิด (ค่าเริ่ม):");
  {
    const e = await F.makeExpense(co, vCo.id, [{ description: "บริการ", amount: 1_000_000 }], { vatMode: "NONE" });
    const panel = await PM.paymentPanelData(co.tid, co.S, e);
    chk("E2.0", "ค่าเริ่ม ewhtEnabled = false · ก้อนแผงมีอัตรา e-WHT ของค่าบริการ 100 (ให้จอแสดงเมื่อเปิด)", panel?.wht?.settings?.ewhtEnabled === false && panel.wht.rates.M40_8.ewht?.value === 100, "false/100", { s: panel?.wht?.settings, e: panel?.wht?.rates?.M40_8?.ewht });
    const r = await PM.recordPayments(co.tid, co.S, e, [{ paidAt: "2026-09-15", financeAccountId: co.bank.id, amountSatang: 990_000, note: "", whtIncomeType: "M40_8", whtRateBp: 100, whtAmountSatang: 10_000, whtChannel: "EWHT", feeSatang: 0, cheque: null }], { userId: co.owner.id, keyBase: `e2-${Date.now()}` });
    const p = await co.prisma.accountDocumentPayment.findFirst({ where: { documentId: e } });
    const certs = await co.prisma.accountDocument.count({ where: { systemId: co.S, docType: "WHT_CERT", sourceDocId: e } });
    chk("E2.1", "สวิตช์ปิด: ส่ง EWHT ⇒ บันทึกเป็นช่องทางปกติ + ออก 50 ทวิ + เตือนอัตราต่างจากตาราง (1% vs 3%)", r.ok && p?.whtChannel === "NORMAL" && certs === 1 && r.warnings?.some((w: Any) => w.code === "WHT_RATE_DIFFERS_FROM_TABLE"), "NORMAL/1", { r, ch: p?.whtChannel, certs });
  }

  console.log("\nE3 เปิดสวิตช์ e-WHT:");
  {
    const s = await LV.saveBookTax({ role: "OWNER", unitAccess: ["*"], permissions: {}, userId: co.owner.id }, co.ctx, { ewhtEnabled: true });
    const e = await F.makeExpense(co, vCo.id, [{ description: "บริการ", amount: 1_000_000 }], { vatMode: "NONE" });
    const r = await PM.recordPayments(co.tid, co.S, e, [{ paidAt: "2026-09-16", financeAccountId: co.bank.id, amountSatang: 990_000, note: "", whtIncomeType: "M40_8", whtIncomeCode: "M40_8", whtRateBp: 100, whtAmountSatang: 10_000, whtChannel: "EWHT", ewhtRef: "KB-EWHT-0001", feeSatang: 0, cheque: null }], { userId: co.owner.id, keyBase: `e3-${Date.now()}` });
    const p = await co.prisma.accountDocumentPayment.findFirst({ where: { documentId: e } });
    const certs = await co.prisma.accountDocument.count({ where: { systemId: co.S, docType: "WHT_CERT", sourceDocId: e } });
    chk("E3.1", "เปิดแล้ว: e-WHT 1% (ตามตาราง — ไม่มีคำเตือนอัตรา) · ช่องทาง EWHT · เก็บเลขอ้างอิง · ไม่ออก 50 ทวิ · ฐาน 1,000,000", s.ok && r.ok && p?.whtChannel === "EWHT" && p.ewhtRef === "KB-EWHT-0001" && p.whtBaseSatang === 1_000_000 && certs === 0 && !r.warnings?.some((w: Any) => w.code === "WHT_RATE_DIFFERS_FROM_TABLE"), "EWHT/0", { s: s.ok, r, p: p && [p.whtChannel, p.ewhtRef, p.whtBaseSatang], certs });
    chk("E3.2", "คำเตือน WHT_EWHT_CHANNEL (V) บอกเลขอ้างอิง/ไม่ออก 50 ทวิ", r.ok && r.warnings?.some((w: Any) => w.code === "WHT_EWHT_CHANNEL" && w.messageTh.includes("KB-EWHT-0001")), "warn", r.warnings, "MAJOR");
    const pj = p ? await co.prisma.accountJournalEntry.findFirst({ where: { systemId: co.S, refType: "AccountDocumentPayment", refId: p.id }, include: { lines: { include: { account: { select: { code: true } } } } } }) : null;
    const c2130 = (pj?.lines ?? []).filter((l: Any) => l.account.code === "2130").reduce((n: number, l: Any) => n + l.credit - l.debit, 0);
    chk("E3.3", "ภาษี e-WHT ยังค้างนำส่ง (Cr 2130 10,000 — ธนาคารนำส่งพร้อมการจ่าย)", c2130 === 10_000, 10_000, c2130, "MAJOR");
  }

  console.log("\nE4 กำหนดยื่นจากตาราง:");
  {
    const d1 = LV.upcomingDeadlinesFrom(LV.EMPTY_BOOK_LEGAL, new Date(Date.UTC(2026, 10, 13, 5)));
    const pp = d1.find((x: Any) => x.form === "PP30");
    const p53 = d1.find((x: Any) => x.form === "PND53");
    chk("E4.1", "ภ.พ.30 ต.ค. 2026: กระดาษ 2026-11-15 (อีก 2 วัน) · ออนไลน์ 2026-11-23", pp?.taxMonth === "2026-10" && pp.paper?.date === "2026-11-15" && pp.paper.daysLeft === 2 && pp.online?.date === "2026-11-23", "ตามนั้น", pp);
    chk("E4.2", "ภ.ง.ด.53 ต.ค. 2026: กระดาษ 2026-11-07 (−6) · ออนไลน์ 2026-11-15 (+2)", p53?.taxMonth === "2026-10" && p53.paper?.date === "2026-11-07" && p53.paper.daysLeft === -6 && p53.online?.date === "2026-11-15" && p53.online.daysLeft === 2, "ตามนั้น", p53);
    const d2 = LV.upcomingDeadlinesFrom(LV.EMPTY_BOOK_LEGAL, new Date(Date.UTC(2027, 1, 20, 5)));
    const q53 = d2.find((x: Any) => x.form === "PND53");
    chk("E4.3", "ณ 2027-02-20 (หลังช่วงขยายออนไลน์): ภ.ง.ด.53 เดือน 2027-02 กระดาษ 2027-03-07 · ไม่มีวันออนไลน์ (ไม่เดา)", q53?.taxMonth === "2027-02" && q53.paper?.date === "2027-03-07" && q53.online === null, "ตามนั้น", q53);
  }

  console.log("\nE5 ตัวเตือนรายวัน ภ.ง.ด.:");
  {
    const e = await F.makeExpense(co, vCo.id, [{ description: "บริการ ต.ค.", amount: 1_000_000 }], { vatMode: "NONE", date: F.D(10, 5) });
    await PM.recordPayments(co.tid, co.S, e, [{ paidAt: "2026-10-10", financeAccountId: co.bank.id, amountSatang: 970_000, note: "", whtIncomeType: "M40_8", whtRateBp: 300, whtAmountSatang: 30_000, feeSatang: 0, cheque: null }], { userId: co.owner.id, keyBase: `e5-${Date.now()}` });
    const now = new Date(Date.UTC(2026, 10, 2, 3));
    const s1 = await acc.runAccountReminders(now, co.ctx);
    const s2 = await acc.runAccountReminders(now, co.ctx);
    const notes = await co.prisma.appNotification.findMany({ where: { tenantId: co.tid, title: "ภ.ง.ด. ใกล้ครบกำหนดยื่น" }, select: { body: true } }).catch(() => [] as Any[]);
    chk("E5.1", "5 วันก่อน 2026-11-07 ⇒ PND_DUE 1 (ภ.ง.ด.53 · วันที่จากตาราง) · รันซ้ำวันเดียวกันไม่เพิ่ม", s1.PND_DUE === 1 && s2.PND_DUE === 0 && (notes.length === 0 || notes.some((n: Any) => n.body.includes("ภ.ง.ด.53") && n.body.includes("วันที่ 7"))), "1/0", { s1: s1.PND_DUE, s2: s2.PND_DUE, notes });
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
