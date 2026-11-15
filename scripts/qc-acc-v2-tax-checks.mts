// QC ACC T5.6 ตรวจภาษีประจำเดือน (เลน 2) — เฉลี่ยภาษีซื้อ (ยกเว้นปน) · ภ.พ.36 บริการต่างประเทศ · อากรแสตมป์จ้างทำของ + รหัสรับรอง
//   ร้านทดสอบแยก (ลบตอนจบ · KEEP=1 = เก็บไว้ดูหน้าจอ) · ค่าคาดหวังคำนวณมือ — ดู ledger/wo-notes/
// รัน: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-acc-v2-tax-checks.mts
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-acc-v2-tax-checks");

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
const TCK: Any = await import("@/lib/modules/account/tax-checks" as string);
const clock: Any = await import("@/lib/modules/account/clock" as string);
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

eq("K0.1", "อากร 1 บาทต่อ 1,000 บาทหรือเศษ: 123,456 → 124 บาท · 1,000 → 1 · 1,000.01 → 2", [TCK.stampDutyOf(12_345_600, 100), TCK.stampDutyOf(100_000, 100), TCK.stampDutyOf(100_001, 100)], [12_400, 100, 200]);
let tid = "";
let prisma: Any = null;
try {
  const S = await F.setupWhtShop("QC T5.6 ตรวจภาษี", "qc-t56-chk");
  tid = S.tid;
  prisma = S.prisma;
  const now = clock.accountNow();
  const ym = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(now).slice(0, 7);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(now);
  const day1 = `${ym}-01`;
  // ใบแจ้งหนี้ผสม: บริการยกเว้น 50,000 + บริการ 7% 150,000 · ภาษีซื้อ 700 (JV) · จ่ายผู้ขาย SG 30,000 · จ่ายบริษัทไทย 10,000
  await invoice(S, S.cust.id, day1, 0, [
    { description: "ค่าเช่าห้อง (ยกเว้น)", qty: 1, unitPrice: 5_000_000, vatRateBp: -1, lineKind: "SERVICE" },
    { description: "ค่าบริการ", qty: 1, unitPrice: 15_000_000, vatRateBp: 700, lineKind: "SERVICE" },
  ]);
  const vatIn = (await prisma.accountMapping.findFirstOrThrow({ where: { systemId: S.SYS, key: "VAT_INPUT" }, select: { accountId: true } })).accountId;
  await GL.postManualJV(S.ctx, { date: new Date(`${day1}T10:00:00+07:00`), memo: "ภาษีซื้อทดสอบ", book: "GENERAL", postedById: S.owner.id, lines: [{ accountId: vatIn, debit: 70_000, credit: 0 }, { accountId: S.bank.ledgerAccountId, debit: 0, credit: 70_000 }] });
  await S.payVendor({ vendorId: S.vForeign.id, ym, d: 1, base: 3_000_000, wht: 0, rateBp: 0, key: "t56-sg" });
  await S.payVendor({ vendorId: S.vJur.id, ym, d: 1, base: 1_000_000, wht: 0, rateBp: 0, key: "t56-th" });
  const q = await acc.createDocument({ tenantId: S.tid, systemId: S.SYS, docType: "QUOTATION", contactId: S.cust.id, issueDate: new Date(`${day1}T10:00:00+07:00`), vatMode: "EXCLUDE", lines: [{ description: "จ้างทำป้ายร้าน", qty: 1, unitPrice: 12_345_600, vatRateBp: 700, lineKind: "SERVICE" }, { description: "สินค้า", qty: 1, unitPrice: 50_000, vatRateBp: 700, lineKind: "GOODS" }], createdById: S.owner.id });
  await acc.issueDocument(S.tid, S.SYS, q.id, { ack: { codes: ["BUYER_TAX_ID_MISSING"], actorId: S.owner.id } });
  const qr = await acc.setQuotationResponse(S.tid, S.SYS, q.id, true);
  chk("K0.2", "ลูกค้ายอมรับใบเสนอราคา", qr?.ok !== false, true, qr);

  const r = await TCK.taxChecks(S.ctx, { period: ym });
  eq("K1.1", "เฉลี่ยภาษีซื้อ: ยกเว้น 50,000 · เสียภาษี 150,000 · 75.00% · ภาษีซื้อ 700 → INPUT_VAT_APPORTIONMENT [V] (ไม่เฉลี่ยให้เอง)", [r.apportionment.exempt, r.apportionment.taxable, r.apportionment.taxableRatioBp, r.apportionment.inputVat, r.apportionment.warning?.code, r.apportionment.warning?.messageTh.includes("75.00%")], [5_000_000, 15_000_000, 7500, 70_000, "INPUT_VAT_APPORTIONMENT", true]);
  chk("K1.2", "ข้อความเฉลี่ยภาษีซื้อบอกว่าสูตรยังไม่ยืนยัน + ตรวจกับนักบัญชี", /สูตรเฉลี่ยละเอียดยังไม่ได้ยืนยัน/.test(r.apportionment.warning?.messageTh ?? "") && /นักบัญชีของร้าน/.test(r.apportionment.warning?.messageTh ?? ""), true, r.apportionment.warning);
  eq("K2.1", "ภ.พ.36: จ่ายผู้ขายสิงคโปร์ 30,000 = 1 รายการ (ผู้ขายไทยไม่ขึ้น) · วันออนไลน์ 15 จากตาราง", [r.pp36.map((x: Any) => [x.vendorName, x.amount]), r.pp36[0]?.warning.code, r.pp36[0]?.warning.messageTh.includes("วันที่ 15")], [[["Dive Agency Pte. Ltd.", 3_000_000]], "PP36_FOREIGN_SERVICE", true]);
  const st = r.stamp.find((x: Any) => x.documentId === q.id);
  eq("K3.1", "อากร: ใบเสนอราคาที่ยอมรับ · ฐานเฉพาะบรรทัดบริการ 123,456 → อากร 124 บาท · ร้านเป็นผู้เสีย · ยังไม่มีรหัส", [st?.amount, st?.duty, st?.payer, st?.stampDutyRef, st?.warning.code], [12_345_600, 12_400, "SHOP", null, "STAMP_DUTY_INSTRUMENT"]);
  chk("K3.2", "ข้อความอากรบอก 15 วัน (จากตาราง) + ระบบตัดสินไม่ได้ว่าจ้างทำของหรือซื้อขาย", (st?.warning.messageTh ?? "").includes("ภายใน 15 วัน") && (st?.warning.messageTh ?? "").includes("ตัดสินไม่ได้"), true, st?.warning);
  const set = await TCK.setStampDutyRef(S.ctx, q.id, "  ES-6911-000123 ");
  const bad = await TCK.setStampDutyRef(S.ctx, S.cust.id, "x");
  const r2 = await TCK.taxChecks(S.ctx, { period: ym });
  eq("K3.3", "บันทึกรหัสรับรอง (ตัดช่องว่าง) → แสดงในรายการ · คำเตือนรวมไม่ยกเรื่องอากรเมื่อทุกใบมีรหัส · id ไม่ใช่เอกสาร = ไม่พบ", [set.ok, r2.stamp.find((x: Any) => x.documentId === q.id)?.stampDutyRef, r2.warnings.some((w: Any) => w.code === "STAMP_DUTY_INSTRUMENT"), bad.ok], [true, "ES-6911-000123", false, false]);
  await acc.saveSettings(S.tid, S.SYS, { vatRegistered: false });
  const r3 = await TCK.taxChecks(S.ctx, { period: ym });
  eq("K4.1", "สมุดไม่จด VAT: ไม่มีเรื่องเฉลี่ยภาษีซื้อ/ภ.พ.36 (ผู้ให้บริการต่างประเทศเสียเอง) · อากรยังตรวจ", [r3.apportionment.warning, r3.pp36.length, r3.stamp.length], [null, 0, 1]);
  const r4 = await TCK.taxChecks(S.ctx, { period: "2026-01" });
  eq("K4.2", "เดือนที่ไม่มีรายการ: ว่างทั้งหมด", [r4.apportionment.warning, r4.pp36.length, r4.stamp.length, r4.warnings.length], [null, 0, 0, 0]);
  void today;
} catch (e) {
  chk("X", "ไม่มี exception", false, "no error", String((e as Error)?.stack ?? e));
} finally {
  if (prisma) await F.keepOrPurge(prisma, tid, KEEP);
  if (prisma) await prisma.$disconnect();
}

const fl = cks.filter((c) => !c.ok);
console.log(`\n===== QC ACC T5.6 ตรวจภาษีประจำเดือน =====\nผ่าน ${cks.length - fl.length}/${cks.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - fl.length, findings: fl.map((c) => c.id) })}`);
process.exit(fl.length ? 1 : 0);
