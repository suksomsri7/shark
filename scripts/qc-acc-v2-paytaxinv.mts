// QC ACC T2.6 — ใบกำกับอัตโนมัติตอนรับเงิน: วันที่ = วันรับเงิน · บรรทัดบริการจากใบแจ้งหนี้ · อัตราจากตาราง · มัดจำออกใบกำกับเอง
//
// ใบงาน: ledger/ACCOUNT-TAX-PLAN.md แถว T2.6 · design note ledger/wo-notes/T2.6.md
// ฟิกซ์เจอร์ของตัวเอง (ร้านทิ้ง สร้างเอง ลบใน finally) · นาฬิกาบัญชีตรึง 20 ต.ค. 2569 (เดือนนี้ = 2026-10)
// รัน: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-acc-v2-paytaxinv.mts
//
// เฉลยคำนวณมือ (7% แยก VAT · สตางค์):
//   ใบบริการ 2 บรรทัด: ดำน้ำ 2 × 300,000 = 600,000 · เช่าอุปกรณ์ 1 × 150,000 ⇒ ฐาน 750,000 VAT 52,500 รวม 802,500
//   P1 ชำระครบ 20 ส.ค. ⇒ ใบกำกับ 20 ส.ค. VAT 52,500 ฐาน 750,000 · บรรทัด = 2 บรรทัดเดิม (จำนวน/ราคาเดิม)
//   P2 สองงวด: 10 ส.ค. 100,001 ⇒ VAT round(52,500 × 100,001 / 802,500) = 6,542 · ฐาน 93,459 · บรรทัด 74,767 / 18,692 (เศษ 1 ไปบรรทัดที่เศษมากกว่า)
//              10 ก.ย. 702,499 (ครบ) ⇒ VAT ที่เหลือ 45,958 · ฐาน 656,541 · สะสม 750,000 → 600,000/150,000 ⇒ งวดนี้ 525,233 / 131,308
//   P3 ย้อนเดือน: ใบ 3 ก.ย. บริการ 100,000 (VAT 7,000) รับเงินลงวันที่ 25 ก.ย. ขณะเดือนนี้ = ต.ค. ⇒ ใบกำกับ 25 ก.ย. + คำเตือน [U]
//       P3b ใบ 1 ต.ค. รับ 2 ต.ค. ⇒ ไม่มีคำเตือน · VAT 7,000 เข้า ต.ค.
//   P4 ผสม 5 ส.ค.: สินค้า 1,000,000 (ใบกำกับพร้อมใบแจ้งหนี้ VAT 70,000) + บริการ 500,000 · รับครบ 25 ส.ค. ⇒ ใบกำกับงวด VAT 35,000 ฐาน 500,000 บรรทัดบริการ 1 บรรทัด
//   P5 มัดจำ: ใบรับมัดจำ 1 ส.ค. 200,000 + 14,000 = 214,000 · รับ 3 ส.ค. ⇒ ใบกำกับมัดจำ 3 ส.ค. VAT 14,000 (ไม่มี JV ของตัวเอง) · JV มัดจำลง 3 ส.ค.
//       ใบแจ้งหนี้บริการ 1 ก.ย. 1,000,000 หักมัดจำ 214,000 ⇒ ยอด 856,000 · VAT พัก 70,000 − 14,000 = 56,000
//       รับ 856,000 วันที่ 5 ก.ย. ⇒ ใบกำกับ VAT 56,000 ฐาน 800,000 · รวม VAT ทั้งเรื่อง 70,000 (ไม่ซ้ำ)
//   P6 ยกเลิกรับชำระหลังออกใบกำกับ: ใบ 10 ก.ย. 200,000 (VAT 14,000) รับ 12 ก.ย. แล้วยกเลิก ⇒ ใบกำกับ VOIDED · ก.ย. คง +14,000 · เดือนที่กลับ −14,000
//   P7 ยกเลิกรับเงินมัดจำ (ยังไม่ถูกหัก): มัดจำ 100,000 + 7,000 รับ 4 ก.ย. แล้วยกเลิก ⇒ ใบกำกับมัดจำ VOIDED · ก.ย. +7,000 · เดือนที่กลับ −7,000
//   P8 คืนมัดจำ (refundDeposit): มัดจำ 100,000 + 7,000 รับ 6 ก.ย. แล้วคืน ⇒ ใบลดหนี้อ้างใบกำกับมัดจำ (T2.4 · ใบกำกับคงอยู่) · ก.ย. +7,000 · เดือนที่คืน −7,000
//   P9 ปิดค่าตั้ง depositOnReceipt ⇒ รับมัดจำ 8 ก.ย. 50,000 + 3,500 ไม่มีใบกำกับ (VAT ยังเข้า ก.ย. ตามบัญชี +3,500)
//   ภาษีขายต่อเดือน: ส.ค. = 52,500 + 6,542 + 70,000 + 35,000 + 14,000 = 178,042
//                    ก.ย. = 45,958 + 7,000 + 56,000 + 14,000 + 7,000 + 7,000 + 3,500 + 700 (P3.4) = 141,158 (P11 ลงหลังตรวจรายงาน)
//                    ต.ค. = 7,000 − 7,000 (ใบลดหนี้คืนมัดจำ P8 ลงวันที่นาฬิกาบัญชี 2026-10-20) = 0 · เดือนที่กลับรายการ (วันที่จริงของการยกเลิก) = −14,000 − 7,000 = −21,000
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-acc-v2-paytaxinv");

const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
const clock = await import("@/lib/modules/account/clock");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, exp: unknown, act: unknown, sev: Sev = "CRITICAL") => {
  cks.push({ id, ok, sev });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${JSON.stringify(exp)} | act ${JSON.stringify(act)?.slice(0, 600)}`}`);
};
/** วันที่ไทยเที่ยงวัน */
const D = (m: number, d: number) => new Date(Date.UTC(2026, m - 1, d, 5));
const ymd = (d: Date) => new Date(d.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);

let tid = "";
const users: string[] = [];
clock.pinAccountClockForQc(new Date("2026-10-20T05:00:00Z"));
try {
  const acc = (await import("@/lib/modules/account/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const gl = (await import("@/lib/modules/account/gl" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const DS = (await import("@/lib/modules/account/doc-settings" as string)) as Any;
  const REP = (await import("@/lib/modules/account/reports" as string)) as Any;
  const STR = (await import("@/lib/modules/account/sales-tax-report" as string)) as Any;
  const fin = (await import("@/lib/modules/account/finance" as string)) as Any;
  const PAY = (await import("@/lib/modules/account/payment" as string)) as Any;

  const stamp = Date.now();
  const t = await prisma.tenant.create({ data: { name: "QC T2.6 paytaxinv", slug: `qc-t26-${stamp}` } });
  tid = t.id;
  const owner = await prisma.user.create({ data: { email: `qc-t26-${stamp}@qc.local`, name: "เจ้าของ T2.6" } });
  users.push(owner.id);
  await prisma.membership.create({ data: { userId: owner.id, tenantId: tid, role: "OWNER", unitAccess: ["*"], acceptedAt: new Date() } });
  const S = (await sys.createSystem(tid, "ACCOUNT", "บัญชี T2.6")).id;
  const ctx = { tenantId: tid, systemId: S };
  await acc.saveSettings(tid, S, { orgName: "ร้าน T2.6", vatRegistered: true, vatRateBp: 700, taxId: "0105561000026" });
  await gl.ensureAccounting(ctx);
  const bank = await fin.createFinanceAccount({ tenantId: tid, systemId: S, type: "BANK", name: "ออมทรัพย์", bankName: "กสิกรไทย" });
  const cust = await acc.createContact({ tenantId: tid, systemId: S, kind: "CUSTOMER", legalType: "COMPANY", name: "ลูกค้า T2.6", taxId: "0105561999926", branchCode: "00000" });

  const DIVE = { description: "ดำน้ำ", qty: 2, unitPrice: 300_000, discount: 0, vatRateBp: 700, lineKind: "SERVICE" };
  const GEAR = { description: "เช่าอุปกรณ์", qty: 1, unitPrice: 150_000, discount: 0, vatRateBp: 700, lineKind: "SERVICE" };
  const ledgerId = async (code: string) => (await prisma.accountLedger.findFirst({ where: { systemId: S, code }, select: { id: true } }))!.id;
  const A2200 = await ledgerId("2200");
  const A2210 = await ledgerId("2210");
  const net = async (acct: string, refIds: string[]) => {
    const ls = await prisma.accountJournalLine.findMany({ where: { systemId: S, accountId: acct, entry: { refType: "AccountDocument", refId: { in: refIds } } }, select: { debit: true, credit: true } });
    return ls.reduce((a, l) => a + l.credit - l.debit, 0);
  };
  const tisOf = (srcId: string) => prisma.accountDocument.findMany({ where: { systemId: S, docType: "TAX_INVOICE", sourceDocId: srcId }, orderBy: { createdAt: "asc" }, include: { lines: { orderBy: { sortOrder: "asc" } } } });
  const jvOf = (docId: string) => prisma.accountJournalEntry.findMany({ where: { systemId: S, refType: "AccountDocument", refId: docId }, orderBy: { createdAt: "asc" } });
  const mk = (docType: string, issueDate: Date, lines: Any[], extra: Any = {}) =>
    acc.createDocument({ tenantId: tid, systemId: S, docType, contactId: cust.id, vatMode: "EXCLUDE", issueDate, dueDate: issueDate, lines, createdById: owner.id, ...extra });
  const issue = async (id: string) => {
    const r = await acc.issueDocument(tid, S, id);
    if (!r.ok) throw new Error(`issue: ${r.reason}`);
    return r;
  };
  const pay = (id: string, amount: number, paidAt: Date, key: string) =>
    acc.recordPayment(tid, S, id, { paidAt, financeAccountId: bank.id, channel: "TRANSFER", amount, createdById: owner.id, idempotencyKey: `${key}-${stamp}` });
  const lineSig = (ls: Any[]) => ls.map((l) => [l.description, Number(l.qty), l.unitPrice, l.amount, l.vatRateBp, l.lineKind]);

  // ═══ P1 ชำระครบครั้งเดียว ═══
  console.log("\nP1 ใบบริการ ชำระครบ → ใบกำกับลงวันที่รับเงิน + บรรทัดบริการเดิม:");
  const p1 = await mk("INVOICE", D(8, 5), [DIVE, GEAR]);
  await issue(p1.id);
  const p1r = await pay(p1.id, 802_500, D(8, 20), "p1");
  {
    const tis = await tisOf(p1.id);
    const ti = tis[0];
    chk("P1.1", "รับครบ → ใบกำกับ 1 ใบ ISSUED มีเลขที่ · ลงวันที่รับเงิน 2026-08-20 (ไม่ใช่วันที่กดบันทึก)", p1r.ok && tis.length === 1 && ti.status === "ISSUED" && !!ti.docNo && ymd(ti.issueDate) === "2026-08-20", "1 ใบ 2026-08-20", tis.map((x) => ({ s: x.status, n: x.docNo, d: ymd(x.issueDate) })));
    chk("P1.2", "VAT 52,500 · ฐาน 750,000 · รวม 802,500 · ผูกงวดรับเงิน", ti?.vatAmount === 52_500 && ti.subTotal === 750_000 && ti.grandTotal === 802_500 && ti.sourcePaymentId === p1r.paymentId, "52500/750000", ti && { v: ti.vatAmount, b: ti.subTotal, g: ti.grandTotal });
    chk("P1.3", "บรรทัด = บรรทัดบริการของใบแจ้งหนี้ (ดำน้ำ 2 × 3,000 · เช่าอุปกรณ์ 1 × 1,500) อัตรา 7% จากตาราง", JSON.stringify(lineSig(ti?.lines ?? [])) === JSON.stringify([["ดำน้ำ", 2, 300_000, 600_000, 700, "SERVICE"], ["เช่าอุปกรณ์", 1, 150_000, 150_000, 700, "SERVICE"]]), "2 บรรทัดเดิม", lineSig(ti?.lines ?? []));
    const je = (await jvOf(ti.id))[0];
    chk("P1.4", "JV โอน 2210→2200 ลงวันที่รับเงิน (งวด 2026-08)", je?.periodKey === "2026-08" && ymd(je.date) === "2026-08-20", "2026-08", je && { p: je.periodKey, d: ymd(je.date) });
    const ids = [p1.id, ti.id];
    chk("P1.5", "GL ทั้งเรื่อง: 2210 สุทธิ 0 · 2200 = 52,500", (await net(A2210, ids)) === 0 && (await net(A2200, ids)) === 52_500, "0/52500", { s: await net(A2210, ids), o: await net(A2200, ids) });
    chk("P1.6", "ส.ค. อยู่ก่อนเดือนนี้ (ต.ค.) ⇒ มีคำเตือน PAYMENT_TAX_INVOICE_EARLIER_MONTH [U] ack=false", p1r.warnings?.[0]?.code === "PAYMENT_TAX_INVOICE_EARLIER_MONTH" && p1r.warnings[0].tag === "U" && p1r.warnings[0].ack === false, "1 คำเตือน", p1r.warnings);
  }

  // ═══ P2 สองงวด ═══
  console.log("\nP2 สองงวด (ข้ามเดือน) — แบ่งบรรทัดสะสม สตางค์ตรง:");
  const p2 = await mk("INVOICE", D(8, 5), [DIVE, GEAR]);
  await issue(p2.id);
  const p2a = await pay(p2.id, 100_001, D(8, 10), "p2a");
  const p2b = await pay(p2.id, 702_499, D(9, 10), "p2b");
  {
    const tis = await tisOf(p2.id);
    chk("P2.1", "2 ใบกำกับ: 2026-08-10 และ 2026-09-10", p2a.ok && p2b.ok && tis.length === 2 && ymd(tis[0].issueDate) === "2026-08-10" && ymd(tis[1].issueDate) === "2026-09-10", "2 ใบ", tis.map((x) => ymd(x.issueDate)));
    chk("P2.2", "งวด 1: VAT 6,542 ฐาน 93,459 · บรรทัด 74,767 / 18,692", tis[0]?.vatAmount === 6_542 && tis[0].subTotal === 93_459 && JSON.stringify(tis[0].lines.map((l) => l.amount)) === "[74767,18692]", "6542/93459/[74767,18692]", tis[0] && { v: tis[0].vatAmount, b: tis[0].subTotal, l: tis[0].lines.map((l) => l.amount) });
    chk("P2.3", "งวด 2 (ครบ): VAT ที่เหลือ 45,958 ฐาน 656,541 · บรรทัด 525,233 / 131,308", tis[1]?.vatAmount === 45_958 && tis[1].subTotal === 656_541 && JSON.stringify(tis[1].lines.map((l) => l.amount)) === "[525233,131308]", "45958/656541", tis[1] && { v: tis[1].vatAmount, b: tis[1].subTotal, l: tis[1].lines.map((l) => l.amount) });
    const perLine = [0, 1].map((i) => tis.reduce((n, x) => n + (x.lines[i]?.amount ?? 0), 0));
    chk("P2.4", "รวมทุกงวดต่อบรรทัด = ยอดบรรทัดเดิม (600,000 / 150,000) · รวม VAT = 52,500", JSON.stringify(perLine) === "[600000,150000]" && tis[0].vatAmount + tis[1].vatAmount === 52_500, "[600000,150000]", perLine);
    chk("P2.5", "บรรทัดของงวดบอกส่วนที่รับ: จำนวน 1 × ยอดงวด + คำอธิบายยกจำนวน/ราคาเดิม", tis[0].lines.every((l) => Number(l.qty) === 1 && l.unitPrice === l.amount && l.description.includes("ส่วนที่รับชำระงวดนี้")) && tis[0].lines[0].description.startsWith("ดำน้ำ") && tis[0].lines[0].description.includes("2 × ฿3,000.00"), "คำอธิบาย", tis[0].lines.map((l) => l.description));
    const [je1, je2] = await Promise.all([jvOf(tis[0].id), jvOf(tis[1].id)]);
    chk("P2.6", "JV ของแต่ละงวดอยู่เดือนของวันรับเงิน (2026-08 · 2026-09)", je1[0]?.periodKey === "2026-08" && je2[0]?.periodKey === "2026-09", "08/09", [je1[0]?.periodKey, je2[0]?.periodKey]);
  }

  // ═══ P3 รับเงินย้อนเดือน ═══
  console.log("\nP3 รับเงินลงวันที่เดือนก่อน (ทำได้ + คำเตือน [U]) · เดือนนี้ไม่มีคำเตือน:");
  const p3 = await mk("INVOICE", D(9, 3), [{ description: "สอนดำน้ำ", qty: 1, unitPrice: 100_000, vatRateBp: 700, lineKind: "SERVICE" }]);
  await issue(p3.id);
  const p3r = await pay(p3.id, 107_000, D(9, 25), "p3");
  const p3b = await mk("INVOICE", D(10, 1), [{ description: "สอนดำน้ำ", qty: 1, unitPrice: 100_000, vatRateBp: 700, lineKind: "SERVICE" }]);
  await issue(p3b.id);
  const p3br = await pay(p3b.id, 107_000, D(10, 2), "p3b");
  {
    const ti = (await tisOf(p3.id))[0];
    chk("P3.1", "บันทึกได้ (ไม่บล็อก) · ใบกำกับลงวันที่ 2026-09-25 · VAT 7,000", p3r.ok && ymd(ti?.issueDate) === "2026-09-25" && ti.vatAmount === 7_000, "ok/2026-09-25", { ok: p3r.ok, d: ti && ymd(ti.issueDate) });
    const w = p3r.warnings?.[0];
    chk("P3.2", "คำเตือน PAYMENT_TAX_INVOICE_EARLIER_MONTH: ป้าย U · ack=false · อ้าง ม.78/1(1) ม.86 · บอกเดือน 2026-09 และ ฿70.00 · ต่อท้าย 'โปรดตรวจกับนักบัญชีของร้าน'", !!w && w.code === "PAYMENT_TAX_INVOICE_EARLIER_MONTH" && w.tag === "U" && w.ack === false && /78\/1/.test(w.citation) && /ม\.86/.test(w.citation) && w.messageTh.includes("2026-09") && w.messageTh.includes("70.00") && w.messageTh.includes("โปรดตรวจกับนักบัญชีของร้าน"), "ครบ", w);
    chk("P3.3", "รับเงินเดือนนี้ (2 ต.ค.) ไม่มีคำเตือน · ใบกำกับ 2026-10-02", p3br.ok && !p3br.warnings && ymd((await tisOf(p3b.id))[0]?.issueDate) === "2026-10-02", "ไม่มี", p3br.warnings);
    const viaOrchestrator = await PAY.recordPayments(tid, S, (await mk("INVOICE", D(9, 4), [{ description: "สอน", qty: 1, unitPrice: 10_000, vatRateBp: 700, lineKind: "SERVICE" }]).then(async (d: Any) => { await issue(d.id); return d; })).id, [{ paidAt: "2026-09-05", financeAccountId: bank.id, amountSatang: 10_700, note: "", whtIncomeType: null, whtRateBp: null, whtAmountSatang: 0, feeSatang: 0, cheque: null }], { userId: owner.id, keyBase: `orch-${stamp}` });
    chk("P3.4", "ตัวประสาน recordPayments (จอ/REST) ส่งคำเตือนต่อในผล warnings[]", viaOrchestrator.ok && viaOrchestrator.warnings?.[0]?.code === "PAYMENT_TAX_INVOICE_EARLIER_MONTH", "warnings", viaOrchestrator);
  }

  // ═══ P4 ใบผสม ═══
  console.log("\nP4 ใบผสม: สินค้าออกใบกำกับตอนออกใบ (T1.2) · บริการตอนรับเงิน (ไม่ซ้ำสินค้า):");
  const p4 = await mk("INVOICE", D(8, 5), [
    { description: "ถังดำน้ำ", qty: 1, unitPrice: 1_000_000, vatRateBp: 700, lineKind: "GOODS" },
    { description: "ค่าสอน", qty: 1, unitPrice: 500_000, vatRateBp: 700, lineKind: "SERVICE" },
  ]);
  await issue(p4.id);
  const p4r = await pay(p4.id, 1_605_000, D(8, 25), "p4");
  {
    const tis = await tisOf(p4.id);
    chk("P4.1", "2 ใบกำกับ: สินค้า (ลงวันที่ใบแจ้งหนี้ 2026-08-05 VAT 70,000) + บริการ (ลงวันที่รับเงิน 2026-08-25 VAT 35,000)", p4r.ok && tis.length === 2 && ymd(tis[0].issueDate) === "2026-08-05" && tis[0].vatAmount === 70_000 && ymd(tis[1].issueDate) === "2026-08-25" && tis[1].vatAmount === 35_000, "2 ใบ", tis.map((x) => ({ d: ymd(x.issueDate), v: x.vatAmount })));
    chk("P4.2", "ใบกำกับงวดมีแต่บรรทัดบริการ (ค่าสอน 1 × 5,000 ฐาน 500,000) — ไม่ยกบรรทัดสินค้าซ้ำ", JSON.stringify(lineSig(tis[1]?.lines ?? [])) === JSON.stringify([["ค่าสอน", 1, 500_000, 500_000, 700, "SERVICE"]]) && tis[1].subTotal === 500_000, "1 บรรทัดบริการ", lineSig(tis[1]?.lines ?? []));
    const ids = [p4.id, ...tis.map((x) => x.id)];
    chk("P4.3", "GL: 2200 = 105,000 (ไม่เก็บซ้ำ)", (await net(A2200, ids)) === 105_000, 105_000, await net(A2200, ids));
  }

  // ═══ P5 มัดจำ → ใบแจ้งหนี้หักมัดจำ → รับส่วนที่เหลือ ═══
  console.log("\nP5 มัดจำ: ใบกำกับตอนรับมัดจำ · ใบแจ้งหนี้หักมัดจำ · ใบกำกับส่วนที่เหลือ (ไม่ซ้ำ VAT):");
  const p5d = await mk("DEPOSIT_RECEIPT", D(8, 1), [{ description: "มัดจำทริปเกาะเต่า", qty: 1, unitPrice: 200_000, vatRateBp: 700 }]);
  await issue(p5d.id);
  const p5dr = await pay(p5d.id, 214_000, D(8, 3), "p5d");
  let p5TiNo = "";
  {
    const dep = await prisma.accountDocument.findUnique({ where: { id: p5d.id } });
    const tis = await tisOf(p5d.id);
    const ti = tis[0];
    p5TiNo = ti?.docNo ?? "";
    chk("P5.1", "รับมัดจำครบ → สถานะ AWAITING_DEDUCT + ใบกำกับมัดจำ 1 ใบ ลงวันที่รับเงิน 2026-08-03 VAT 14,000 ฐาน 200,000", p5dr.ok && dep?.status === "AWAITING_DEDUCT" && tis.length === 1 && ti.status === "ISSUED" && !!ti.docNo && ymd(ti.issueDate) === "2026-08-03" && ti.vatAmount === 14_000 && ti.subTotal === 200_000, "ตามนั้น", { st: dep?.status, tis: tis.map((x) => ({ d: ymd(x.issueDate), v: x.vatAmount, n: x.docNo })) });
    chk("P5.2", "บรรทัดยกจากใบรับมัดจำ · ผูกงวดที่รับครบ · หมายเหตุอ้างเลขใบรับมัดจำ", ti?.lines.length === 1 && ti.lines[0].description === "มัดจำทริปเกาะเต่า" && ti.sourcePaymentId === p5dr.paymentId && (ti.note ?? "").includes(dep?.docNo ?? "§"), "ตามนั้น", ti && { l: ti.lines.map((l) => l.description), n: ti.note });
    const depJe = await jvOf(p5d.id);
    chk("P5.3", "JV ใบรับมัดจำ (Cr 2200 14,000) ลงวันที่รับเงิน 2026-08-03 · ใบกำกับมัดจำไม่มี JV ของตัวเอง", depJe.length === 1 && ymd(depJe[0].date) === "2026-08-03" && (await net(A2200, [p5d.id])) === 14_000 && (await jvOf(ti.id)).length === 0, "1 JV 08-03 / 0", { d: depJe.map((e) => ymd(e.date)), tiJv: (await jvOf(ti.id)).length });
  }
  const p5i = await mk("INVOICE", D(9, 1), [{ description: "ทริปเกาะเต่า", qty: 1, unitPrice: 1_000_000, vatRateBp: 700, lineKind: "SERVICE" }], { depositReceiptId: p5d.id });
  await issue(p5i.id);
  const p5ir = await pay(p5i.id, 856_000, D(9, 5), "p5i");
  {
    const iv = await prisma.accountDocument.findUnique({ where: { id: p5i.id } });
    chk("P5.4", "ใบแจ้งหนี้หักมัดจำ 214,000 → ยอด 856,000 · VAT พักบริการ = 70,000 − 14,000 = 56,000", iv?.depositDeducted === 214_000 && iv?.grandTotal === 856_000 && (await net(A2210, [p5i.id])) === 56_000, "214000/856000/56000", iv && { dd: iv.depositDeducted, g: iv.grandTotal, park: await net(A2210, [p5i.id]) });
    const ti = (await tisOf(p5i.id))[0];
    chk("P5.5", "รับครบ → ใบกำกับ VAT 56,000 ฐาน 800,000 (ฐานสอดคล้อง VAT) ลงวันที่ 2026-09-05", p5ir.ok && ti?.vatAmount === 56_000 && ti.subTotal === 800_000 && ymd(ti.issueDate) === "2026-09-05", "56000/800000", ti && { v: ti.vatAmount, b: ti.subTotal, d: ymd(ti.issueDate) });
    chk("P5.6", "บรรทัด: ทริปเกาะเต่า ยอด 800,000 + คำอธิบายหลังหักมัดจำ", ti?.lines.length === 1 && ti.lines[0].amount === 800_000 && ti.lines[0].description.startsWith("ทริปเกาะเต่า") && ti.lines[0].description.includes("เงินมัดจำ"), "800000", ti?.lines.map((l) => [l.description, l.amount]));
    const all = [p5d.id, p5i.id, ...(await tisOf(p5d.id)).map((x) => x.id), ...(await tisOf(p5i.id)).map((x) => x.id)];
    chk("P5.7", "VAT ทั้งเรื่อง 2200 = 70,000 (14,000 ตอนมัดจำ + 56,000 ตอนรับส่วนที่เหลือ — ไม่ซ้ำ) · 2210 สุทธิ 0", (await net(A2200, all)) === 70_000 && (await net(A2210, all)) === 0, "70000/0", { o: await net(A2200, all), s: await net(A2210, all) });
  }

  // ═══ P6 ยกเลิกรับชำระหลังออกใบกำกับ ═══
  console.log("\nP6 ยกเลิกรับชำระหลังออกใบกำกับ → ใบกำกับยกเลิก + กลับรายการ:");
  const p6 = await mk("INVOICE", D(9, 10), [{ description: "ล่องเรือ", qty: 1, unitPrice: 200_000, vatRateBp: 700, lineKind: "SERVICE" }]);
  await issue(p6.id);
  const p6r = await pay(p6.id, 214_000, D(9, 12), "p6");
  const p6v = await acc.voidPayment(tid, S, p6.id, p6r.paymentId, "บันทึกผิดรายการ");
  let revMonth = "";
  {
    const ti = (await tisOf(p6.id))[0];
    const jes = await jvOf(ti.id);
    const rev = jes.find((e) => e.reversalOfId);
    revMonth = rev?.periodKey ?? "";
    chk("P6.1", "ยกเลิกได้ · ใบกำกับ VOIDED พร้อมเหตุผล · JV เดิม (2026-09) + JV กลับรายการ", p6v.ok && ti.status === "VOIDED" && (ti.voidReason ?? "").includes("ยกเลิกตามการยกเลิกรับชำระ") && jes.some((e) => !e.reversalOfId && e.periodKey === "2026-09") && !!rev, "VOIDED + 2 JV", { ok: p6v, s: ti.status, jes: jes.map((e) => [e.periodKey, !!e.reversalOfId]) });
    const ids = [p6.id, ti.id];
    chk("P6.2", "GL สุทธิ: 2200 = 0 · 2210 กลับมาพัก 14,000 (ใบแจ้งหนี้ค้างรับ)", (await net(A2200, ids)) === 0 && (await net(A2210, ids)) === 14_000, "0/14000", { o: await net(A2200, ids), s: await net(A2210, ids) });
  }

  // ═══ P7 ยกเลิกรับเงินมัดจำ · P8 คืนมัดจำ ═══
  console.log("\nP7 ยกเลิกรับเงินมัดจำ · P8 คืนมัดจำ → ใบกำกับมัดจำไม่ค้างมีผล:");
  const p7 = await mk("DEPOSIT_RECEIPT", D(9, 2), [{ description: "มัดจำ P7", qty: 1, unitPrice: 100_000, vatRateBp: 700 }]);
  await issue(p7.id);
  const p7r = await pay(p7.id, 107_000, D(9, 4), "p7");
  const p7v = await acc.voidPayment(tid, S, p7.id, p7r.paymentId, "รับผิดใบ");
  const p8 = await mk("DEPOSIT_RECEIPT", D(9, 2), [{ description: "มัดจำ P8", qty: 1, unitPrice: 100_000, vatRateBp: 700 }]);
  await issue(p8.id);
  await pay(p8.id, 107_000, D(9, 6), "p8");
  const p8f = await acc.refundDeposit(tid, S, p8.id, "ลูกค้ายกเลิกทริป");
  {
    const t7 = await tisOf(p7.id);
    const t8 = await tisOf(p8.id);
    chk("P7.1", "ยกเลิกรับเงินมัดจำ → ใบกำกับมัดจำ VOIDED · 2200 สุทธิ 0", p7v.ok && t7.length === 1 && t7[0].status === "VOIDED" && (await net(A2200, [p7.id])) === 0, "VOIDED/0", { ok: p7v, s: t7.map((x) => x.status), o: await net(A2200, [p7.id]) });
    // ORACLE-EDIT (ACC T2.4): คืนมัดจำที่มีใบกำกับแล้ว = ใบลดหนี้อ้างใบกำกับของมัดจำ (ฉ.82 ข้อ 2(2)) — ใบกำกับเดิมคงอยู่ (เดิม T2.6 ยกเลิกใบกำกับชั่วคราวรอ T2.4)
    const cn8 = await prisma.accountDocument.findMany({ where: { systemId: S, docType: "CREDIT_NOTE", sourceDocId: t8[0]?.id ?? "§" } });
    chk("P8.1", "คืนมัดจำ → ใบลดหนี้ 1 ใบอ้างใบกำกับมัดจำ (ใบกำกับยัง ISSUED) · 2200 สุทธิ (ใบมัดจำ + ใบลดหนี้) 0", p8f.ok && t8.length === 1 && t8[0].status === "ISSUED" && cn8.length === 1 && cn8[0].status === "ISSUED" && cn8[0].vatAmount === 7_000 && (await net(A2200, [p8.id, cn8[0].id])) === 0, "ISSUED + CN/0", { ok: p8f, s: t8.map((x) => [x.status, x.voidReason]), cn: cn8.map((c) => [c.status, c.vatAmount]) });
  }

  // ═══ P9 ค่าตั้งปิด ═══
  console.log("\nP9 ค่าตั้ง depositOnReceipt ปิด → ไม่ออกใบกำกับมัดจำให้เอง:");
  {
    const cur = await DS.getDocSettings(ctx);
    chk("P9.0", "ค่าเริ่ม depositOnReceipt = เปิด", cur.autoTaxInvoice.depositOnReceipt === true, true, cur.autoTaxInvoice.depositOnReceipt);
    const sv = await DS.saveDocSettings(ctx, { autoTaxInvoice: { mode: cur.autoTaxInvoice.mode, posAbbreviated: cur.autoTaxInvoice.posAbbreviated, legalText: cur.autoTaxInvoice.legalText, depositOnReceipt: false } });
    const after = await DS.getDocSettings(ctx);
    chk("P9.1", "บันทึกค่าตั้งได้ · goodsOnIssue ไม่ถูกทับ (ผู้เรียกไม่ส่ง)", sv.ok !== false && after.autoTaxInvoice.depositOnReceipt === false && after.autoTaxInvoice.goodsOnIssue === true, "false/true", after.autoTaxInvoice);
    const p9 = await mk("DEPOSIT_RECEIPT", D(9, 7), [{ description: "มัดจำ P9", qty: 1, unitPrice: 50_000, vatRateBp: 700 }]);
    await issue(p9.id);
    const r = await pay(p9.id, 53_500, D(9, 8), "p9");
    chk("P9.2", "รับครบแต่ไม่มีใบกำกับ · VAT 3,500 ยังเข้า 2200 (บัญชีตามจุดรับผิด)", r.ok && (await tisOf(p9.id)).length === 0 && (await net(A2200, [p9.id])) === 3_500, "0 ใบ/3500", { n: (await tisOf(p9.id)).length, o: await net(A2200, [p9.id]) });
    await DS.saveDocSettings(ctx, { autoTaxInvoice: { mode: cur.autoTaxInvoice.mode, posAbbreviated: cur.autoTaxInvoice.posAbbreviated, legalText: cur.autoTaxInvoice.legalText, depositOnReceipt: true } });
  }

  // ═══ P10 รายงานภาษีขาย + ภ.พ.30 ═══
  console.log("\nP10 รายงานภาษีขาย + ภ.พ.30 ต่อเดือน:");
  {
    const aug = await STR.salesTaxReport(ctx, "2026-08");
    const sep = await STR.salesTaxReport(ctx, "2026-09");
    const oct = await STR.salesTaxReport(ctx, "2026-10");
    chk("P10.1", "ส.ค. = 178,042 (รายงาน = GL)", aug.total.vat === 178_042 && aug.glVat === 178_042, 178_042, { r: aug.total.vat, g: aug.glVat });
    chk("P10.2", "ก.ย. = 141,158 (รายงาน = GL)", sep.total.vat === 141_158 && sep.glVat === 141_158, 141_158, { r: sep.total.vat, g: sep.glVat, rows: sep.rows.map((r: Any) => [r.docNo, r.date, r.vat]) });
    // ORACLE-EDIT (ACC T2.4): ใบลดหนี้คืนมัดจำ P8 ลงวันที่ "วันนี้" ตามนาฬิกาบัญชี (ตรึง 2026-10-20) ⇒ −7,000 อยู่ ต.ค. (เดิมกลับรายการวันที่จริง)
    chk("P10.3", "ต.ค. = 7,000 − 7,000 (ใบลดหนี้คืนมัดจำ P8) = 0", oct.total.vat === 0 && oct.glVat === 0, 0, { r: oct.total.vat, g: oct.glVat });
    const depRow = aug.rows.find((r: Any) => r.docNo === p5TiNo);
    const depDoc = await prisma.accountDocument.findUnique({ where: { id: p5d.id }, select: { docNo: true } });
    chk("P10.4", "แถวมัดจำ ส.ค. แสดงเลขใบกำกับของมัดจำ · วันที่ 2026-08-03 · ฐาน 200,000 VAT 14,000 · หมายเหตุอ้างเลขใบรับมัดจำ", !!depRow && depRow.date === "2026-08-03" && depRow.base === 200_000 && depRow.vat === 14_000 && depRow.notes.some((n: string) => n.includes(depDoc?.docNo ?? "§") && n.includes("ใบกำกับภาษีของเงินมัดจำ")), "แถวมัดจำ", depRow ?? aug.rows.map((r: Any) => [r.docNo, r.vat, r.notes]));
    const p1No = (await tisOf(p1.id))[0].docNo;
    const p1Row = aug.rows.find((r: Any) => r.docNo === p1No);
    chk("P10.5", "แถวใบกำกับงวด P1 วันที่ 2026-08-20 ฐาน 750,000 VAT 52,500", p1Row?.date === "2026-08-20" && p1Row.base === 750_000 && p1Row.vat === 52_500, "row", p1Row);
    chk("P10.6", "ทุกแถวฐานสอดคล้อง VAT (ไม่มีธงเตือน)", [...aug.rows, ...sep.rows, ...oct.rows].every((r: Any) => !r.flag), "ไม่มีธง", [...aug.rows, ...sep.rows].filter((r: Any) => r.flag).map((r: Any) => [r.docNo, r.flag]));
    if (revMonth) {
      const rv = await STR.salesTaxReport(ctx, revMonth);
      const extra = revMonth === "2026-10" ? 0 : 0;
      // ORACLE-EDIT (ACC T2.4): −7,000 ของ P8 ย้ายไปเดือนของใบลดหนี้ (ต.ค. ตามนาฬิกาบัญชี) ⇒ เดือนที่กลับรายการจริง = −14,000 − 7,000 = −21,000
      chk("P10.7", `เดือนที่กลับรายการ (${revMonth}) = −21,000 (P6 + P7 · ต.ค. รวม P8 = 0 ถ้าเป็นเดือนเดียวกัน) · มีหมายเหตุการยกเลิกอ้างเลขเดิม`, rv.total.vat === -21_000 + extra && /* ORACLE-EDIT (ACC T2.4): แถว −7,000 ของ P8 เป็นใบลดหนี้คืนมัดจำ (อ้างใบกำกับ) แทนแถวยกเลิก — ยอดเดือนเท่าเดิม */ rv.rows.filter((r: Any) => r.vat < 0).every((r: Any) => r.notes.some((n: string) => n.startsWith("ยกเลิก") || (r.docType === "CREDIT_NOTE" && n.startsWith("ใบลดหนี้ อ้างอิงใบกำกับภาษี")))), -21_000 + extra, { v: rv.total.vat, rows: rv.rows.map((r: Any) => [r.docNo, r.vat, r.notes]) });
    }
    const [pa, ps, po] = await Promise.all([REP.pp30(ctx, "2026-08"), REP.pp30(ctx, "2026-09"), REP.pp30(ctx, "2026-10")]);
    // ORACLE-EDIT (ACC T2.4): ต.ค. = 0 (ใบลดหนี้คืนมัดจำ P8 — ดู P10.3)
    chk("P10.8", "ภ.พ.30 ภาษีขาย ส.ค./ก.ย./ต.ค. = 178,042 / 141,158 / 0", pa.output.total === 178_042 && ps.output.total === 141_158 && po.output.total === 0, [178_042, 141_158, 0], [pa.output.total, ps.output.total, po.output.total]);
  }

  // ═══ P11 ข้อมูลเดิม ═══
  console.log("\nP11 ใบกำกับเดิมไม่ถูกแตะ:");
  {
    const before = await prisma.accountDocument.findMany({ where: { systemId: S, docType: "TAX_INVOICE" }, select: { id: true, issueDate: true } });
    const p11 = await mk("INVOICE", D(9, 20), [{ description: "เพิ่ม", qty: 1, unitPrice: 10_000, vatRateBp: 700, lineKind: "SERVICE" }]);
    await issue(p11.id);
    await pay(p11.id, 10_700, D(9, 21), "p11");
    const after = await prisma.accountDocument.findMany({ where: { systemId: S, id: { in: before.map((b) => b.id) } }, select: { id: true, issueDate: true } });
    chk("P11.1", "ใบกำกับที่ออกไปแล้วคงวันที่เดิมทุกใบ", before.every((b) => after.find((a) => a.id === b.id)?.issueDate.getTime() === b.issueDate.getTime()), "คงเดิม", null);
  }
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? `${e.message.slice(0, 400)}\n${e.stack?.split("\n").slice(1, 5).join("\n")}` : String(e));
} finally {
  clock.pinAccountClockForQc(null);
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
console.log(`\n===== QC ACC T2.6 ใบกำกับตอนรับเงิน =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
