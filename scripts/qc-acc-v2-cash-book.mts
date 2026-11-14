// QC ACC T5.2 รายงานเงินสดรับ-จ่าย (เลน 2) — เกณฑ์เงินสดจาก GL: ขายเชื่อไม่ขึ้นจนรับเงิน · โอนระหว่างบัญชีเงินไม่นับ · เงินทุน/ถอนส่วนตัวแยก
//   ร้านทดสอบแยก (ลบตอนจบ · KEEP=1 = เก็บไว้ดูหน้าจอ) · ค่าคาดหวังคำนวณมือ — ดู ledger/wo-notes/
// รัน: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-acc-v2-cash-book.mts
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-acc-v2-cash-book");

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
const fin: Any = await import("@/lib/modules/account/finance" as string);
const exp: Any = await import("@/lib/modules/account/expense" as string);
const CB: Any = await import("@/lib/modules/account/cash-book" as string);

/** ใบแจ้งหนี้ไม่มี VAT ยอด baht ออกแล้ว (+ รับเงินได้) */
async function invoice(S: Any, contactId: string, ymd: string, satang: number, lines?: Any[]) {
  const iv = await acc.createDocument({ tenantId: S.tid, systemId: S.SYS, docType: "INVOICE", contactId, issueDate: new Date(`${ymd}T10:00:00+07:00`), dueDate: new Date(`${ymd}T10:00:00+07:00`), vatMode: lines ? "EXCLUDE" : "NONE", lines: lines ?? [{ description: "ค่าบริการ", qty: 1, unitPrice: satang, vatRateBp: 0 }], createdById: S.owner.id });
  const r = await acc.issueDocument(S.tid, S.SYS, iv.id, { ack: { codes: ["SALE_WITHOUT_VAT_REGISTERED", "TAX_INVOICE_NOT_VAT_REGISTERED", "BUYER_TAX_ID_MISSING"], actorId: S.owner.id } });
  if (r && r.ok === false) throw new Error(`issue ${ymd}: ${r.reason}`);
  return iv.id as string;
}
async function receive(S: Any, docId: string, ymd: string, satang: number, key: string) {
  return acc.recordPayment(S.tid, S.SYS, docId, { paidAt: new Date(`${ymd}T11:00:00+07:00`), channel: "TRANSFER", financeAccountId: S.bank.id, amount: satang, createdById: S.owner.id, idempotencyKey: `${key}-${S.tid}` });
}

let tid = "";
let prisma: Any = null;
try {
  const S = await F.setupWhtShop("QC T5.2 เงินสด", "qc-t52-cash");
  tid = S.tid;
  prisma = S.prisma;
  await acc.saveSettings(S.tid, S.SYS, { vatRegistered: false });
  const ek = await LV.saveBookTax(S.ownerActor, S.ctx, { entityKind: "INDIVIDUAL" }, "QC T5.2");
  chk("C0", "ร้านบุคคลธรรมดา ไม่จด VAT", ek.ok, true, ek);
  const cashRes = await fin.createFinanceAccount({ tenantId: S.tid, systemId: S.SYS, type: "CASH", name: "เงินสดหน้าร้าน" });
  const cash = await prisma.accountFinance.findFirstOrThrow({ where: { id: cashRes.id }, select: { ledgerAccountId: true } });
  const cap = await prisma.accountLedger.findFirstOrThrow({ where: { systemId: S.SYS, code: "3000" }, select: { id: true } });
  const rent = await prisma.accountLedger.findFirstOrThrow({ where: { systemId: S.SYS, code: "6100" }, select: { id: true } });
  // 2 พ.ย. เงินทุนเข้า 20,000 · 3 พ.ย. ขายเชื่อ 10,000 · 5 พ.ย. รับ 6,000 · 7 พ.ย. ขายและรับ 2,500 · 9 พ.ย. จ่ายค่าเช่า 4,000 · 10 พ.ย. โอนธนาคาร→เงินสด 1,000 · 11 พ.ย. ถอนใช้ส่วนตัว 500
  await GL.postManualJV(S.ctx, { date: new Date("2026-11-02T10:00:00+07:00"), memo: "เงินทุนเข้า", book: "GENERAL", postedById: S.owner.id, lines: [{ accountId: S.bank.ledgerAccountId, debit: 2_000_000, credit: 0 }, { accountId: cap.id, debit: 0, credit: 2_000_000 }] });
  const ivA = await invoice(S, S.cust.id, "2026-11-03", 1_000_000);
  await receive(S, ivA, "2026-11-05", 600_000, "t52-a");
  const ivB = await invoice(S, S.cust.id, "2026-11-07", 250_000);
  await receive(S, ivB, "2026-11-07", 250_000, "t52-b");
  const e = await exp.createExpenseDoc({ tenantId: S.tid, systemId: S.SYS, docType: "EXPENSE", contactId: S.vInd.id, issueDate: new Date("2026-11-09T10:00:00+07:00"), vatMode: "NONE", lines: [{ description: "ค่าเช่าร้าน", qty: 1, unitPrice: 400_000, vatRateBp: 0, accountId: rent.id }], createdById: S.owner.id });
  const ir = await exp.issueExpenseDoc(S.tid, S.SYS, e.id);
  chk("C0.1", "บันทึกค่าเช่า", ir.ok, true, ir);
  const pr = await exp.recordVendorPayment(S.tid, S.SYS, e.id, { paidAt: new Date("2026-11-09T11:00:00+07:00"), channel: "TRANSFER", financeAccountId: S.bank.id, amount: 400_000, createdById: S.owner.id, idempotencyKey: `t52-rent-${S.tid}` });
  chk("C0.2", "จ่ายค่าเช่า", pr.ok, true, pr);
  await GL.postManualJV(S.ctx, { date: new Date("2026-11-10T10:00:00+07:00"), memo: "ถอนเงินเข้าลิ้นชัก", book: "GENERAL", postedById: S.owner.id, lines: [{ accountId: cash.ledgerAccountId, debit: 100_000, credit: 0 }, { accountId: S.bank.ledgerAccountId, debit: 0, credit: 100_000 }] });
  await GL.postManualJV(S.ctx, { date: new Date("2026-11-11T10:00:00+07:00"), memo: "ถอนใช้ส่วนตัว", book: "GENERAL", postedById: S.owner.id, lines: [{ accountId: cap.id, debit: 50_000, credit: 0 }, { accountId: cash.ledgerAccountId, debit: 0, credit: 50_000 }] });

  const r = await CB.cashBook(S.ctx, { from: "2026-11-01", to: "2026-11-30" });
  eq("C1.1", "รายรับ 8,500 (6,000 + 2,500) · รายจ่าย 4,000 · สุทธิ 4,500", [r.totals.receipt, r.totals.payment, r.totals.net], [850_000, 400_000, 450_000]);
  eq("C1.2", "เงินทุนเข้า 20,000 · ถอนใช้ส่วนตัว 500 แยกออก (ไม่รวมรายรับ/รายจ่าย)", [r.totals.ownerIn, r.totals.ownerOut], [2_000_000, 50_000]);
  eq("C1.3", "5 แถว (ขายเชื่อวันที่ 3 ไม่ขึ้น · โอนระหว่างบัญชีวันที่ 10 ไม่ขึ้น) เรียงวันที่", r.rows.map((x: Any) => [x.date, x.receipt, x.payment, x.owner]), [["2026-11-02", 2_000_000, 0, true], ["2026-11-05", 600_000, 0, false], ["2026-11-07", 250_000, 0, false], ["2026-11-09", 0, 400_000, false], ["2026-11-11", 0, 50_000, true]]);
  eq("C1.4", "ยอดรวมต่อวัน (เฉพาะรายรับ/รายจ่ายของกิจการ)", r.days.map((d: Any) => [d.date, d.receipt, d.payment]), [["2026-11-05", 600_000, 0], ["2026-11-07", 250_000, 0], ["2026-11-09", 0, 400_000]]);
  eq("C1.5", "สรุปรายเดือน พ.ย.", r.months.map((m: Any) => [m.month, m.receipt, m.payment, m.ownerIn, m.ownerOut, m.net]), [["2026-11", 850_000, 400_000, 2_000_000, 50_000, 450_000]]);
  const rec = r.rows.find((x: Any) => x.date === "2026-11-05");
  chk("C1.6", "รายการรับเงินมีชื่อลูกค้า + บัญชีคู่ (ลูกหนี้)", rec.description.includes("ลูกค้าหักเรา") && rec.counterTh.includes("1100"), "ลูกค้า + 1100", rec);
  eq("C1.7", "บุคคลธรรมดาไม่จด VAT: applies · CASH_BOOK_DUTY [V] (3 วันทำการจากตาราง) + CASH_BOOK_FORMAT_UNVERIFIED [U]", [r.applies, r.warnings.map((w: Any) => [w.code, w.tag]), r.warnings[0]?.messageTh.includes("3 วันทำการ")], [true, [["CASH_BOOK_DUTY", "V"], ["CASH_BOOK_FORMAT_UNVERIFIED", "U"]], true]);
  chk("C1.8", "ข้อความไม่อ้าง \"ตรงแบบสรรพากร\" · ไม่มีชื่อไฟล์/ป้ายในข้อความ", r.warnings.every((w: Any) => !/ตรงแบบ|references|\.md|\[V\]|\[U\]/.test(`${w.messageTh} ${w.citation}`)), true, r.warnings);
  await receive(S, ivA, "2026-12-02", 400_000, "t52-a2");
  const dec = await CB.cashBook(S.ctx, { from: "2026-12-01", to: "2026-12-31" });
  eq("C2.1", "ขายเชื่อที่เหลือรับ ธ.ค. 4,000 → ขึ้นในเดือนที่รับเงิน (เกณฑ์เงินสด)", [dec.totals.receipt, dec.rows.length], [400_000, 1]);
  await acc.saveSettings(S.tid, S.SYS, { vatRegistered: true });
  const r2 = await CB.cashBook(S.ctx, { from: "2026-11-01", to: "2026-11-30" });
  eq("C3.1", "สมุดจด VAT: ตัวเลขเดิม · ไม่มี CASH_BOOK_DUTY (positive control ของเงื่อนไข)", [r2.applies, r2.totals.receipt, r2.warnings.map((w: Any) => w.code)], [false, 850_000, ["CASH_BOOK_FORMAT_UNVERIFIED"]]);
} catch (e) {
  chk("X", "ไม่มี exception", false, "no error", String((e as Error)?.stack ?? e));
} finally {
  if (prisma) await F.keepOrPurge(prisma, tid, KEEP);
  if (prisma) await prisma.$disconnect();
}

const fl = cks.filter((c) => !c.ok);
console.log(`\n===== QC ACC T5.2 รายงานเงินสดรับ-จ่าย =====\nผ่าน ${cks.length - fl.length}/${cks.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - fl.length, findings: fl.map((c) => c.id) })}`);
process.exit(fl.length ? 1 : 0);
