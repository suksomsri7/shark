// QC ACC T5c (เลน 2) — ของค้าง T5: หนี้สูญได้รับคืน (รายได้ · อ้างใบที่ตัด) · สถานะ "ตัดหนี้สูญ" (รายการ/รายละเอียด/REST · ไม่แก้สถานะในฐาน)
//   วันประชุมใหญ่ → วันยื่นงบบริษัท · ตัวช่วยบวกกลับ: บริจาคเกินร้อยละ 2 (ประมาณ) · ค่าเช่ารถยนต์นั่งเกิน 36,000/คัน/เดือน — ไม่ลงบัญชีให้
//   ร้านทดสอบแยก (ลบตอนจบ · KEEP=1 = เก็บไว้) · ค่าคาดหวังคำนวณมือ
// รัน: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-acc-v2-t5c-leftovers.mts
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-acc-v2-t5c-leftovers");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, exp: unknown, act: unknown, sev: Sev = "CRITICAL") => {
  cks.push({ id, ok, sev });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${JSON.stringify(exp)} | act ${JSON.stringify(act)?.slice(0, 900)}`}`);
};
const eq = (id: string, n: string, act: unknown, exp: unknown, sev: Sev = "CRITICAL") => chk(id, n, JSON.stringify(act) === JSON.stringify(exp), exp, act, sev);
const KEEP = process.env.KEEP === "1";
const F: Any = await import("./qc-acc-v2-wht-fixture.mts" as string);
const acc: Any = await import("@/lib/modules/account/service" as string);
const GL: Any = await import("@/lib/modules/account/gl" as string);
const LV: Any = await import("@/lib/modules/account/legal-values" as string);
const exp: Any = await import("@/lib/modules/account/expense" as string);
const BD: Any = await import("@/lib/modules/account/bad-debt" as string);
const BDS: Any = await import("@/lib/modules/account/bad-debt-shared" as string);
const AB: Any = await import("@/lib/modules/account/tax-add-back" as string);
const CAL: Any = await import("@/lib/modules/account/tax-calendar" as string);
const DET: Any = await import("@/lib/modules/account/doc-detail" as string);
const SER: Any = await import("@/lib/modules/account/api/serialize" as string);
const LC: Any = await import("@/lib/modules/account/list-columns" as string);
const REP: Any = await import("@/lib/modules/account/reports" as string);
const TH: Any = await import("@/lib/core/settings/legal/th-tax-2569" as string);
const W: Any = await import("@/lib/core/settings/legal/warnings" as string);

async function invoice(S: Any, contactId: string, ymd: string, satang: number, lines?: Any[]) {
  const iv = await acc.createDocument({ tenantId: S.tid, systemId: S.SYS, docType: "INVOICE", contactId, issueDate: new Date(`${ymd}T10:00:00+07:00`), dueDate: new Date(`${ymd}T10:00:00+07:00`), vatMode: lines ? "EXCLUDE" : "NONE", lines: lines ?? [{ description: "ค่าบริการ", qty: 1, unitPrice: satang, vatRateBp: 0 }], createdById: S.owner.id });
  const r = await acc.issueDocument(S.tid, S.SYS, iv.id, { ack: { codes: W.LEGAL_WARNING_CODES, actorId: S.owner.id } });
  if (r && r.ok === false) throw new Error(`issue ${ymd}: ${r.reason}`);
  return iv.id as string;
}
const ACK = { codes: ["BAD_DEBT_TAX_CONDITIONS"] };

console.log("\n── C0 ตัวคิดล้วน ──");
eq("C0.1", "สถานะตัดหนี้สูญ: ตัดทั้งใบ = ตัดหนี้สูญ · มีเงินจริง+ตัด = บางส่วน · ยังค้าง+ตัด = บางส่วน · ไม่มีตัด = null · รายการที่ยกเลิกไม่นับ", [
  BDS.badDebtStatusOf({ status: "PAID" }, [{ channel: "BAD_DEBT", amount: 100 }])?.labelTh,
  BDS.badDebtStatusOf({ status: "PAID" }, [{ channel: "TRANSFER", amount: 60 }, { channel: "BAD_DEBT", amount: 40 }])?.labelTh,
  BDS.badDebtStatusOf({ status: "PARTIAL" }, [{ channel: "BAD_DEBT", amount: 40 }])?.labelTh,
  BDS.badDebtStatusOf({ status: "PAID" }, [{ channel: "CASH", amount: 100 }]),
  BDS.badDebtStatusOf({ status: "PAID" }, [{ channel: "BAD_DEBT", amount: 100, voidedAt: new Date() }]),
], ["ตัดหนี้สูญ", "ตัดหนี้สูญบางส่วน", "ตัดหนี้สูญบางส่วน", null, null]);
eq("C0.2", "เพดานบริจาค 2% ของกำไร (กำไร ≤ 0 = 0) · ค่าเช่ารถ 36,000 × คัน-เดือน + 1,200 × คัน-วัน", [AB.donationCapOf({ amount: 300_000, profit: 10_000_000, rateBp: 200 }), AB.donationCapOf({ amount: 100, profit: -5, rateBp: 200 }), AB.carRentCapOf({ rent: 9_000_000, carMonths: 2, carDays: 3, monthlyCap: 3_600_000, dailyCap: 120_000 })], [{ cap: 200_000, excess: 100_000 }, { cap: 0, excess: 100 }, { cap: 7_560_000, excess: 1_440_000 }]);
eq("C0.3", "ตาราง: ค่าเช่ารถ 36,000/เดือน · 1,200/วัน [V] ที่มา พ.ร.ฎ.315", ["CAR_RENT_MONTHLY_CAP", "CAR_RENT_DAILY_CAP"].map((r) => { const row = TH.SYSTEM_BOOK_ROWS.find((x: Any) => x.rule === r); return [row?.value, row?.tag, /315/.test(row?.source ?? "")]; }), [[3_600_000, "V", true], [120_000, "V", true]]);
eq("C0.4", "คำเตือนใหม่: รับคืน [V] แจ้ง · VAT ของรับคืน [U] แจ้ง (+ประโยคตรวจกับนักบัญชี) · บริจาคประมาณ [S] · ค่าเช่ารถ [V]", ["BAD_DEBT_RECOVERY_INCOME", "BAD_DEBT_RECOVERY_VAT", "DONATION_CAP_ESTIMATE", "CAR_RENT_CAP_EXCEEDED"].map((c) => { const w = W.legalWarning(c, {}); return [w.tag, w.ack, /นักบัญชี/.test(w.messageTh)]; }), [["V", false, false], ["U", false, true], ["S", false, true], ["V", false, false]]);

let tid = "";
let prisma: Any = null;
try {
  const S = await F.setupWhtShop("QC T5c ของค้าง", "qc-t5c-left");
  tid = S.tid;
  prisma = S.prisma;
  const map = async (key: string) => (await prisma.accountMapping.findFirstOrThrow({ where: { systemId: S.SYS, key }, select: { accountId: true } })).accountId as string;
  const bal = async (accountId: string) => {
    const a = await prisma.accountJournalLine.aggregate({ where: { systemId: S.SYS, accountId }, _sum: { debit: true, credit: true } });
    return (a._sum.debit ?? 0) - (a._sum.credit ?? 0);
  };
  const [ar, rec, bdx] = [await map("AR"), await map("BAD_DEBT_RECOVERED"), await map("BAD_DEBT_EXPENSE")];
  eq("C1.0", "ผังบัญชี: 4920 หนี้สูญได้รับคืน (รายได้)", await prisma.accountLedger.findFirst({ where: { id: rec }, select: { code: true, type: true } }), { code: "4920", type: "INCOME" });

  console.log("\n── C1 ตัดทั้งใบ → ป้าย \"ตัดหนี้สูญ\" (รายการ/รายละเอียด/REST) ──");
  const ym = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date()).slice(0, 7);
  const d = (n: number) => `${ym}-${String(n).padStart(2, "0")}`;
  const ivA = await invoice(S, S.cust.id, d(1), 1_000_000);
  const wo = await BD.writeOffBadDebt(S.ctx, { documentId: ivA, date: new Date(`${d(2)}T12:00:00+07:00`), ack: ACK, createdById: S.owner.id });
  const docA = await prisma.accountDocument.findFirst({ where: { id: ivA }, select: { status: true } });
  const list = await acc.listDocumentsPaged(S.tid, S.SYS, { docType: "INVOICE", pageSize: 50 });
  const rowA = list.rows.find((r: Any) => r.id === ivA);
  const det = await DET.getDocDetailData(S.tid, S.SYS, ivA);
  eq("C1.1", "สถานะในฐานยังเป็น PAID (ไม่ทำลายข้อมูลเดิม) · ป้ายรายการ = \"ตัดหนี้สูญ\" (ไม่ใช่ \"ชำระแล้ว\")", [wo.ok, docA.status, LC.rowStatusLabel(rowA.status, rowA)], [true, "PAID", "ตัดหนี้สูญ"]);
  eq("C1.2", "รายละเอียด: badDebt FULL 10,000 · REST แถว + รายละเอียด badDebt เดียวกัน", [det.badDebt, SER.docRow(rowA).badDebt, SER.docDetail(det).badDebt], [{ state: "FULL", writtenOffSatang: 1_000_000, labelTh: "ตัดหนี้สูญ" }, { state: "FULL", writtenOffSatang: 1_000_000, label: "ตัดหนี้สูญ" }, { state: "FULL", writtenOffSatang: 1_000_000, label: "ตัดหนี้สูญ" }]);
  const ivB = await invoice(S, S.cust.id, d(1), 1_000_000);
  await acc.recordPayment(S.tid, S.SYS, ivB, { paidAt: new Date(`${d(2)}T11:00:00+07:00`), channel: "TRANSFER", financeAccountId: S.bank.id, amount: 600_000, createdById: S.owner.id, idempotencyKey: `t5c-b-${S.tid}` });
  const ivC = await invoice(S, S.cust.id, d(1), 1_000_000);
  await BD.writeOffBadDebt(S.ctx, { documentId: ivB, ack: ACK });
  await BD.writeOffBadDebt(S.ctx, { documentId: ivC, amount: 300_000, ack: ACK });
  const list2 = await acc.listDocumentsPaged(S.tid, S.SYS, { docType: "INVOICE", pageSize: 50 });
  const lab = (id: string) => { const r = list2.rows.find((x: Any) => x.id === id); return [r.status, LC.rowStatusLabel(r.status, r)]; };
  eq("C1.3", "รับ 6,000 + ตัด 4,000 = PAID \"ตัดหนี้สูญบางส่วน\" · ตัด 3,000 ยังค้าง 7,000 = PARTIAL \"ตัดหนี้สูญบางส่วน\"", [lab(ivB), lab(ivC)], [["PAID", "ตัดหนี้สูญบางส่วน"], ["PARTIAL", "ตัดหนี้สูญบางส่วน"]]);
  const aging = await REP.agingReport(S.ctx, { direction: "OUT", asOf: new Date(`${d(28)}T12:00:00+07:00`) });
  eq("C1.4", "อายุหนี้: ใบตัดทั้งใบ/ตัดครบไม่นับ · ใบตัดบางส่วนนับเฉพาะยอดค้าง 7,000", aging.grand.totalSatang ?? aging.grand.total, 700_000);

  console.log("\n── C2 หนี้สูญได้รับคืน ──");
  const r0 = await BD.recoverBadDebt(S.ctx, { documentId: ivA, amount: 1_000_001 });
  const rN = await BD.recoverBadDebt(S.ctx, { documentId: await invoice(S, S.cust.id, d(1), 50_000) });
  eq("C2.1", "เกินยอดที่ตัด / ใบที่ไม่เคยตัด = ปฏิเสธพร้อมเหตุผล", [r0.ok, /ไม่เกินยอดที่ตัดหนี้สูญ/.test(r0.reason), rN.ok, /ยังไม่มีรายการตัดหนี้สูญ/.test(rN.reason)], [false, true, false, true]);
  const arBefore = await bal(ar);
  const r1 = await BD.recoverBadDebt(S.ctx, { documentId: ivA, amount: 400_000, date: new Date(`${d(3)}T12:00:00+07:00`), channel: "TRANSFER", financeAccountId: S.bank.id, createdById: S.owner.id, idempotencyKey: `t5c-rec-${S.tid}` });
  eq("C2.2", "รับคืน 4,000: Dr เงินฝาก / Cr 4920 4,000 · ลูกหนี้ไม่เปลี่ยน · ใบยัง PAID \"ตัดหนี้สูญ\" · คำเตือน BAD_DEBT_RECOVERY_INCOME", [r1.ok, -(await bal(rec)), (await bal(ar)) - arBefore, (await prisma.accountDocument.findFirst({ where: { id: ivA }, select: { status: true } })).status, r1.warnings.map((w: Any) => w.code)], [true, 400_000, 0, "PAID", ["BAD_DEBT_RECOVERY_INCOME"]]);
  const je = await prisma.accountJournalEntry.findFirst({ where: { id: r1.entryId }, select: { refType: true, lines: { select: { accountId: true, debit: true, credit: true } } } });
  const bankLedger = S.bank.ledgerAccountId;
  eq("C2.3", "ใบสำคัญอ้าง AccountBadDebtRecovery · 2 บรรทัด", [je.refType, je.lines.map((l: Any) => [l.accountId === bankLedger ? "BANK" : l.accountId === rec ? "4920" : "?", l.debit, l.credit]).sort()], ["AccountBadDebtRecovery", [["4920", 0, 400_000], ["BANK", 400_000, 0]]]);
  const dup = await BD.recoverBadDebt(S.ctx, { documentId: ivA, amount: 400_000, idempotencyKey: `t5c-rec-${S.tid}` });
  const sm = await BD.badDebtSummary(S.ctx);
  const wd = sm.writtenDocs.find((w: Any) => w.documentId === ivA);
  eq("C2.4", "คีย์ซ้ำ = ผลเดิม · สรุป: ตัด 10,000 รับคืน 4,000 รับคืนได้อีก 6,000", [dup.duplicate, wd.writtenOff, wd.recovered, wd.recoverable, sm.recoveries.length], [true, 1_000_000, 400_000, 600_000, 1]);
  const over = await BD.recoverBadDebt(S.ctx, { documentId: ivA, amount: 600_001 });
  eq("C2.5", "รับคืนเกินยอดคงเหลือ 6,000 = ปฏิเสธ", over.ok, false);
  const aud = await prisma.auditLog.count({ where: { tenantId: S.tid, action: "account.bad-debt.recover", targetId: ivA } });
  eq("C2.6", "ประวัติเอกสาร: account.bad-debt.recover 1 แถว", aud, 1);
  const v0 = await BD.voidBadDebtRecovery(S.ctx, { recoveryId: r1.recoveryId, reason: "" });
  const v1 = await BD.voidBadDebtRecovery(S.ctx, { recoveryId: r1.recoveryId, reason: "บันทึกผิดใบ" });
  const posted = await prisma.accountJournalEntry.findFirst({ where: { id: r1.entryId }, select: { status: true } });
  eq("C2.7", "ยกเลิก: ต้องมีเหตุผล · กลับรายการ (4920 = 0) · ใบสำคัญเดิมไม่ถูกแก้บรรทัด (สถานะ REVERSED/คงอยู่) · รับคืนได้ 10,000 อีกครั้ง", [v0.ok, v1.ok, await bal(rec), !!posted, (await BD.badDebtSummary(S.ctx)).writtenDocs.find((w: Any) => w.documentId === ivA).recoverable], [false, true, 0, true, 1_000_000]);
  const v2 = await BD.voidBadDebtRecovery(S.ctx, { recoveryId: r1.recoveryId, reason: "ซ้ำ" });
  eq("C2.8", "ยกเลิกซ้ำ = ปฏิเสธ", v2.ok, false);
  // ใบบริการมี VAT พัก → ตัดหนี้สูญปล่อย VAT → รับคืนเตือน [U]
  const ivV = await invoice(S, S.cust.id, d(4), 0, [{ description: "บริการดำน้ำ", qty: 1, unitPrice: 1_000_000, vatRateBp: 700, lineKind: "SERVICE" }]);
  await BD.writeOffBadDebt(S.ctx, { documentId: ivV, ack: ACK });
  const rv = await BD.recoverBadDebt(S.ctx, { documentId: ivV, amount: 107_000 });
  eq("C2.9", "ใบที่ตอนตัดปล่อย VAT บริการ 700 → รับคืนเตือน BAD_DEBT_RECOVERY_VAT [U] (ระบุ 700.00) · ยังบันทึกทั้งจำนวนเป็นรายได้", [rv.ok, rv.warnings.map((w: Any) => [w.code, w.tag]), rv.warnings.find((w: Any) => w.code === "BAD_DEBT_RECOVERY_VAT")?.messageTh.includes("700.00"), -(await bal(rec))], [true, [["BAD_DEBT_RECOVERY_INCOME", "V"], ["BAD_DEBT_RECOVERY_VAT", "U"]], true, 107_000]);
  void bdx;

  console.log("\n── C3 วันประชุมใหญ่ → วันยื่นงบบริษัท ──");
  const legal = await LV.loadBookLegal(S.ctx);
  const t = new Date("2027-03-10T12:00:00+07:00");
  const noM = CAL.taxCalendarFrom(legal, { today: t, vatRegistered: true, fiscalStartMonth: 1 }).items.find((i: Any) => i.form === "FS_COMPANY");
  const withM = CAL.taxCalendarFrom(legal, { today: t, vatRegistered: true, fiscalStartMonth: 1, meetings: [{ fyEnd: "2026-12-31", meetingDate: "2027-04-20" }] }).items.find((i: Any) => i.form === "FS_COMPANY");
  eq("C3.1", "ไม่มีวันประชุม = ข้อความกำหนด (ไม่มีวัน) · มีวันประชุม 20 เม.ย. 2570 → ยื่นภายใน 20 พ.ค. 2570 (1 เดือน ตามแถวตาราง)", [noM.periodKey, noM.paper, !!noM.whenTh, withM.paper?.date, withM.paper?.daysLeft, withM.whenTh, withM.paper?.tag], ["FY:2026-12-31", null, true, "2027-05-20", 71, null, "V"]);
  const sv = await CAL.saveStatementMeeting(S.ownerActor, S.ctx, "2026-12-31", "2027-04-20");
  const bad = await CAL.saveStatementMeeting(S.ownerActor, S.ctx, "2026-12-31", "2026-12-01");
  eq("C3.2", "บันทึกผ่านเครื่องยนต์ค่าตั้ง · วันประชุมก่อนสิ้นรอบ = ปฏิเสธ", [sv.ok, sv.meetings, bad.ok], [true, [{ fyEnd: "2026-12-31", meetingDate: "2027-04-20" }], false]);
  const cal = await CAL.taxCalendar(S.ctx, t);
  eq("C3.3", "ปฏิทินของสมุดอ่านวันประชุมที่บันทึก", cal.items.find((i: Any) => i.form === "FS_COMPANY")?.paper?.date, "2027-05-20");
  const clr = await CAL.saveStatementMeeting(S.ownerActor, S.ctx, "2026-12-31", null);
  eq("C3.4", "ล้างวันประชุม → กลับเป็นข้อความกำหนด", [clr.ok, (await CAL.taxCalendar(S.ctx, t)).items.find((i: Any) => i.form === "FS_COMPANY")?.paper], [true, null]);

  console.log("\n── C4 ตัวช่วยบวกกลับ: บริจาค · ค่าเช่ารถยนต์นั่ง ──");
  const S2 = await F.setupWhtShop("QC T5c บวกกลับ", "qc-t5c-ab");
  try {
    await acc.saveSettings(S2.tid, S2.SYS, { vatRegistered: false });
    const L = async (code: string) => (await S2.prisma.accountLedger.findFirstOrThrow({ where: { systemId: S2.SYS, code }, select: { id: true } })).id as string;
    const [don, car, other] = [await L("6980"), await L("6940"), await L("6900")];
    await invoice(S2, S2.cust.id, "2026-03-02", 100_000_000); // รายได้ 1,000,000
    const spend = async (accountId: string, amount: number, ymd: string, key: string) => {
      const e = await exp.createExpenseDoc({ tenantId: S2.tid, systemId: S2.SYS, docType: "EXPENSE", contactId: S2.vJur.id, issueDate: new Date(`${ymd}T10:00:00+07:00`), vatMode: "NONE", lines: [{ description: key, qty: 1, unitPrice: amount, vatRateBp: 0, accountId }], createdById: S2.owner.id });
      const r = await exp.issueExpenseDoc(S2.tid, S2.SYS, e.id);
      if (!r.ok) throw new Error(`${key}: ${r.reason}`);
    };
    await spend(other, 60_000_000, "2026-04-10", "ค่าใช้จ่ายดำเนินงาน"); // 600,000
    await spend(don, 1_000_000, "2026-05-10", "บริจาคมูลนิธิ"); // 10,000
    await spend(car, 9_000_000, "2026-06-10", "ค่าเช่ารถยนต์นั่ง 2 คัน"); // 90,000
    const r = await AB.taxAddBackReport(S2.ctx, { asOf: "2026-12-31" });
    // กำไรก่อนบริจาค = 1,000,000 − (600,000 + 10,000 + 90,000) + 10,000 = 310,000 → เพดาน 2% = 6,200 · ส่วนเกิน 3,800
    eq("C4.1", "บริจาค 10,000 · กำไรก่อนบริจาค (ประมาณจากบัญชี) 310,000 → เพดาน 6,200 · ส่วนเกิน 3,800 = แถว 6980 อาจบวกกลับ", [r.donation.amount, r.donation.profit, r.donation.profitSource, r.donation.cap, r.donation.excess, r.rows.find((x: Any) => x.code === "6980")?.addBack], [1_000_000, 31_000_000, "BOOK_ESTIMATE", 620_000, 380_000, 380_000]);
    chk("C4.2", "คำเตือน DONATION_CAP_ESTIMATE [S] บอกว่าเป็นค่าประมาณ + ไม่บันทึกบัญชี", r.warnings.some((w: Any) => w.code === "DONATION_CAP_ESTIMATE" && w.tag === "S" && /ไม่บันทึกบัญชี/.test(w.messageTh) && /นักบัญชี/.test(w.messageTh)), true, r.warnings.map((w: Any) => w.code));
    const r2 = await AB.taxAddBackReport(S2.ctx, { asOf: "2026-12-31", netProfit: 100_000_000 });
    eq("C4.3", "ผู้ทำบัญชีกรอกกำไรสุทธิ 1,000,000 → เพดาน 20,000 · ไม่เกิน", [r2.donation.profitSource, r2.donation.cap, r2.donation.excess, r2.rows.find((x: Any) => x.code === "6980")?.addBack], ["INPUT", 2_000_000, 0, 0]);
    eq("C4.4", "ค่าเช่ารถ: ไม่กรอกจำนวนคัน = ยังคิดไม่ได้ (addBack null · ไม่มีคำเตือน)", [r.carRent.rent, r.carRent.cap, r.rows.find((x: Any) => x.code === "6940")?.addBack, r.warnings.some((w: Any) => w.code === "CAR_RENT_CAP_EXCEEDED")], [9_000_000, null, null, false]);
    const r3 = await AB.taxAddBackReport(S2.ctx, { asOf: "2026-12-31", carMonths: 2 });
    eq("C4.5", "2 คัน-เดือน → เพดาน 72,000 · ส่วนเกิน 18,000 + คำเตือน CAR_RENT_CAP_EXCEEDED [V]", [r3.carRent.cap, r3.carRent.excess, r3.rows.find((x: Any) => x.code === "6940")?.addBack, r3.warnings.find((w: Any) => w.code === "CAR_RENT_CAP_EXCEEDED")?.tag], [7_200_000, 1_800_000, 1_800_000, "V"]);
    const r4 = await AB.taxAddBackReport(S2.ctx, { asOf: "2026-12-31", carMonths: 1, carDays: 10, carRent: 5_000_000 });
    eq("C4.6", "ค่าเช่าที่กรอก 50,000 (บัญชีมีค่าอื่นปน) · 1 คัน-เดือน + 10 คัน-วัน → เพดาน 48,000 · ส่วนเกิน 2,000", [r4.carRent.rentSource, r4.carRent.cap, r4.carRent.excess, r4.rows.find((x: Any) => x.code === "6940")?.addBack], ["INPUT", 4_800_000, 200_000, 200_000]);
    const nPosted = await S2.prisma.accountJournalEntry.count({ where: { systemId: S2.SYS, memo: { contains: "บวกกลับ" } } });
    eq("C4.7", "ตัวช่วยไม่ลงบัญชีให้ (ไม่มีใบสำคัญเกี่ยวกับบวกกลับ)", nPosted, 0);
  } finally {
    await F.keepOrPurge(S2.prisma, S2.tid, KEEP);
  }
} catch (e) {
  chk("X", "ไม่มี exception", false, "no error", String((e as Error)?.stack ?? e));
} finally {
  if (prisma) await F.keepOrPurge(prisma, tid, KEEP);
  if (prisma) await prisma.$disconnect();
}

const fl = cks.filter((c) => !c.ok);
console.log(`\n===== QC ACC T5c ของค้าง =====\nผ่าน ${cks.length - fl.length}/${cks.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - fl.length, findings: fl.map((c) => c.id) })}`);
process.exit(fl.length ? 1 : 0);
