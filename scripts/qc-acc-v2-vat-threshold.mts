// QC ACC T5.3 เกณฑ์จด VAT (เลน 2) — ยอดขายเทียบ 1.8 ล้าน: ใกล้ (80% ค่าเริ่มต้นระบบ) · เกิน + วันที่เกิน + กำหนดจด 30 วัน · ร้านทับเกณฑ์ · จด VAT แล้ว
//   ร้านทดสอบแยก (ลบตอนจบ · KEEP=1 = เก็บไว้ดูหน้าจอ) · ค่าคาดหวังคำนวณมือ — ดู ledger/wo-notes/
// รัน: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-acc-v2-vat-threshold.mts
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-acc-v2-vat-threshold");

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
const VT: Any = await import("@/lib/modules/account/vat-threshold" as string);

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

console.log("\n── V0 pure ──");
{
  const o = { asOf: "2026-12-31", vatRegistered: false, threshold: 180_000_000, nearRatioBp: 8000, withinDays: 30 };
  const a = VT.vatThresholdFrom([{ ymd: "2026-03-01", amount: 190_000_000 }, { ymd: "2026-04-01", amount: -20_000_000 }], o);
  eq("V0.1", "เกินแล้วมีใบลดหนี้จนต่ำกว่าเกณฑ์ ณ วันนี้ → ไม่นับว่าเกิน (NEAR 94.44%)", [a.status, a.crossedOn, a.ratioBp], ["NEAR", null, 9444]);
  const b = VT.vatThresholdFrom([{ ymd: "2026-03-01", amount: 180_000_000 }], o);
  eq("V0.2", "เท่าเกณฑ์พอดี = ยังไม่เกิน (\"ไม่เกิน 1.8 ล้าน\")", [b.status, b.crossedOn], ["NEAR", null]);
  const c = VT.vatThresholdFrom([{ ymd: "2026-03-01", amount: 180_000_001 }], o);
  eq("V0.3", "เกิน 1 สตางค์ = เกิน · กำหนดจด 31 มี.ค.", [c.status, c.crossedOn, c.registerBy], ["EXCEEDED", "2026-03-01", "2026-03-31"]);
}
let tid = "";
let prisma: Any = null;
try {
  const S = await F.setupWhtShop("QC T5.3 เกณฑ์ VAT", "qc-t53-vat");
  tid = S.tid;
  prisma = S.prisma;
  await acc.saveSettings(S.tid, S.SYS, { vatRegistered: false });
  await LV.saveBookTax(S.ownerActor, S.ctx, { entityKind: "INDIVIDUAL" }, "QC T5.3");
  await invoice(S, S.cust.id, "2026-01-20", 140_000_000);
  await invoice(S, S.cust.id, "2026-02-14", 10_000_000);
  await invoice(S, S.cust.id, "2026-03-10", 40_000_000);
  const d = (ymd: string) => new Date(`${ymd}T12:00:00+07:00`);
  const jan = await VT.vatThreshold(S.ctx, d("2026-01-31"));
  eq("V1.1", "31 ม.ค.: 1,400,000 = 77.77% < 80% → ไม่เตือน", [jan.status, jan.sales, jan.ratioBp, jan.warnings.length, jan.yearBasis], ["BELOW", 140_000_000, 7777, 0, "CALENDAR"]);
  const feb = await VT.vatThreshold(S.ctx, d("2026-02-28"));
  eq("V1.2", "28 ก.พ.: 1,500,000 = 83.33% → NEAR + วิธีนับเป็นค่าเริ่มต้นระบบ [S]", [feb.status, feb.ratioBp, feb.warnings.map((w: Any) => [w.code, w.tag])], ["NEAR", 8333, [["VAT_REG_THRESHOLD_NEAR", "V"], ["VAT_REG_MEASURE_DEFAULT", "S"]]]);
  const mar = await VT.vatThreshold(S.ctx, d("2026-03-31"));
  eq("V1.3", "31 มี.ค.: 1,900,000 เกิน · วันที่เกิน 10 มี.ค. · ยื่นจดภายใน 9 เม.ย. (30 วัน)", [mar.status, mar.sales, mar.crossedOn, mar.registerBy, mar.warnings.map((w: Any) => w.code)], ["EXCEEDED", 190_000_000, "2026-03-10", "2026-04-09", ["VAT_REG_THRESHOLD_EXCEEDED", "VAT_REG_MEASURE_DEFAULT"]]);
  chk("V1.4", "ข้อความเกิน: ยอด · เกณฑ์ · วันเกิน · กำหนด · ไม่บล็อก · ไม่มีชื่อไฟล์", ["1,900,000.00", "1,800,000.00", "10 มี.ค. 2026", "9 เม.ย. 2026", "ไม่บล็อก"].every((t) => mar.warnings[0].messageTh.includes(t)) && !/references|\.md/.test(mar.warnings[0].citation), "ครบ", mar.warnings[0]);
  eq("V1.5", "สรุปรายเดือนสะสม", mar.byMonth.map((m: Any) => [m.month, m.cumulative]), [["2026-01", 140_000_000], ["2026-02", 150_000_000], ["2026-03", 190_000_000]]);
  const sv = await LV.saveBookTax(S.ownerActor, S.ctx, { bookRows: [{ id: "shop-vat-th", rule: "VAT_REG_THRESHOLD", value: 200_000_000, from: null, to: null, source: "ร้านทดสอบ", checkedAt: null }] }, "QC T5.3");
  chk("V2.0", "ร้านทับเกณฑ์ 2,000,000 ได้ (ไม่บล็อก)", sv.ok, true, sv);
  const mar2 = await VT.vatThreshold(S.ctx, d("2026-03-31"));
  eq("V2.1", "ร้านทับ 2,000,000 → 95% NEAR + SHOP_DIFFERS_FROM_DEFAULT", [mar2.status, mar2.ratioBp, mar2.warnings.map((w: Any) => w.code)], ["NEAR", 9500, ["SHOP_DIFFERS_FROM_DEFAULT", "VAT_REG_THRESHOLD_NEAR", "VAT_REG_MEASURE_DEFAULT"]]);
  await LV.saveBookTax(S.ownerActor, S.ctx, { bookRows: [] }, "QC T5.3");
  await LV.saveBookTax(S.ownerActor, S.ctx, { entityKind: "COMPANY" }, "QC T5.3");
  await prisma.accountSettings.updateMany({ where: { systemId: S.SYS }, data: { fiscalYearStartMonth: 7 } });
  const fy = await VT.vatThreshold(S.ctx, d("2026-03-31"));
  eq("V3.1", "บริษัท รอบ ก.ค. 2568–มิ.ย. 2569: นับตามรอบบัญชี · ยอดเดิมยังเกิน", [fy.yearBasis, fy.from, fy.to, fy.status], ["FISCAL", "2025-07-01", "2026-06-30", "EXCEEDED"]);
  const fy2 = await VT.vatThreshold(S.ctx, d("2026-07-15"));
  eq("V3.2", "รอบใหม่ ก.ค. 2569: เริ่มนับ 0", [fy2.status, fy2.sales, fy2.from], ["BELOW", 0, "2026-07-01"]);
  await acc.saveSettings(S.tid, S.SYS, { vatRegistered: true });
  const reg = await VT.vatThreshold(S.ctx, d("2026-03-31"));
  eq("V4.1", "จด VAT แล้ว → REGISTERED · ไม่มีคำเตือน", [reg.status, reg.warnings.length], ["REGISTERED", 0]);
} catch (e) {
  chk("X", "ไม่มี exception", false, "no error", String((e as Error)?.stack ?? e));
} finally {
  if (prisma) await F.keepOrPurge(prisma, tid, KEEP);
  if (prisma) await prisma.$disconnect();
}

const fl = cks.filter((c) => !c.ok);
console.log(`\n===== QC ACC T5.3 เกณฑ์จด VAT =====\nผ่าน ${cks.length - fl.length}/${cks.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - fl.length, findings: fl.map((c) => c.id) })}`);
process.exit(fl.length ? 1 : 0);
