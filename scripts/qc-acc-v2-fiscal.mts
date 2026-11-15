// QC ACC T4.6 — ป้ายงบ "ร่างสำหรับผู้ทำบัญชี/ผู้สอบบัญชี" · คำเตือนเปลี่ยนรอบบัญชี + รอบแรกสั้น (ปิด A2 A5) · design note ledger/wo-notes/T4.6.md
// กฎ: skill domain-accounting-books §ก5 [V] (พ.ร.บ.การบัญชี ม.10 · ม.11 ม.19 ม.20) · domain-business-income-tax §ก5 (ค่าเสื่อมรอบไม่เต็มปีเฉลี่ยตามส่วน)
// ร้านทดสอบแยก "QC T4.6 รอบบัญชี" (ลบตอนจบ) · รัน: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-acc-v2-fiscal.mts
//
// เฉลยมือ:
//   เริ่มทำบัญชี 16 มี.ค. 2026 · ปีบัญชีเริ่ม ม.ค. → รอบแรก 16 มี.ค. – 31 ธ.ค. 2026 = 10 เดือนปฏิทิน (เต็ม 9) → FIRST_PERIOD_SHORT "ไม่ถึง 10"
//   เริ่ม 1 ต.ค. 2026 · ปีบัญชีเริ่ม ต.ค. → 1 ต.ค. 2026 – 30 ก.ย. 2027 = 12 เดือน → ไม่เตือน
//   เริ่ม 1 พ.ค. 2026 · ปีบัญชีเริ่ม ต.ค. → 1 พ.ค. – 30 ก.ย. 2026 = 5 เดือน → เตือน "5"
//   เริ่ม 15 ม.ค. 2026 · ปีบัญชีเริ่ม ม.ค. → 12 เดือนปฏิทินแต่ไม่เต็ม (11) → เตือน
//   เปลี่ยนเดือนเริ่ม ม.ค. → เม.ย. ของสมุดที่มีรายการ = FISCAL_YEAR_CHANGE ต้องยืนยัน · สมุดว่าง = ไม่เตือน · เดือนเดิม = ไม่เตือน
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-acc-v2-fiscal");

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
const FR: Any = await import("@/lib/modules/account/fiscal-rules" as string);
const T: Any = await import("@/lib/core/settings/legal/th-tax-2569" as string);

console.log("\n── P1 ป้ายงบ (pure) ──");
{
  const d = FR.statementDraft();
  eq("P1.1", "ป้าย = \"ร่างสำหรับผู้ทำบัญชี/ผู้สอบบัญชี\" · คำเตือน STATEMENT_DRAFT_FOR_ACCOUNTANT ป้าย V อ้าง ม.19 · ไม่บล็อก", [FR.STATEMENT_DRAFT_LABEL_TH, d.draft, d.warning.code, d.warning.tag, d.warning.ack, String(d.warning.citation).includes("ม.19")], ["ร่างสำหรับผู้ทำบัญชี/ผู้สอบบัญชี", true, "STATEMENT_DRAFT_FOR_ACCOUNTANT", "V", false, true]);
  chk("P1.2", "ข้อความไม่มี \"ถูกกฎหมาย\" / \"ไม่ต้องจ้างนักบัญชี\" / \"ยื่นงบได้เลย\" (test-rules T-ACC-34)", !/ถูกกฎหมาย|ไม่ต้องจ้างนักบัญชี|ยื่นงบได้เลย/.test(d.warning.messageTh), "clean", d.warning.messageTh);
}

console.log("\n── P2 รอบแรก (pure · เฉลยมือ) ──");
{
  eq("P2.1", "16 มี.ค. 2026 / ม.ค. → 16 มี.ค. – 31 ธ.ค. 2026 · 10 เดือน (เต็ม 9)", FR.firstFiscalPeriod("2026-03-16", 1), { start: "2026-03-16", end: "2026-12-31", months: 10, fullMonths: 9 });
  eq("P2.2", "1 ต.ค. 2026 / ต.ค. → 30 ก.ย. 2027 · 12 เดือน", FR.firstFiscalPeriod("2026-10-01", 10), { start: "2026-10-01", end: "2027-09-30", months: 12, fullMonths: 12 });
  eq("P2.3", "1 พ.ค. 2026 / ต.ค. → 30 ก.ย. 2026 · 5 เดือน", FR.firstFiscalPeriod("2026-05-01", 10), { start: "2026-05-01", end: "2026-09-30", months: 5, fullMonths: 5 });
  const w = (s: string, m: number) => FR.firstPeriodWarnings(s, m, 12).map((x: Any) => [x.code, (x.messageTh.match(/= (.+?) เดือน/) ?? [])[1]]);
  eq("P2.4", "คำเตือน: 16 มี.ค./ม.ค. 'ไม่ถึง 10' · 1 ต.ค./ต.ค. ไม่มี · 1 พ.ค./ต.ค. '5' · 15 ม.ค./ม.ค. 'ไม่ถึง 12'", [w("2026-03-16", 1), w("2026-10-01", 10), w("2026-05-01", 10), w("2026-01-15", 1)], [[["FIRST_PERIOD_SHORT", "ไม่ถึง 10"]], [], [["FIRST_PERIOD_SHORT", "5"]], [["FIRST_PERIOD_SHORT", "ไม่ถึง 12"]]]);
  const fw = FR.firstPeriodWarnings("2026-03-16", 1, 12)[0];
  eq("P2.5", "FIRST_PERIOD_SHORT: ป้าย V · ไม่บล็อก · อ้าง ม.10 · บอกเพดาน 12 เดือน", [fw.tag, fw.ack, String(fw.citation).includes("ม.10"), /ภายใน 12 เดือน/.test(fw.messageTh)], ["V", false, true, true]);
  eq("P2.6", "ไม่ระบุวันเริ่ม = ไม่เตือน", FR.firstPeriodWarnings(null, 1, 12).length, 0);
  const row = T.SYSTEM_BOOK_ROWS.find((r: Any) => r.rule === "FIRST_PERIOD_MAX_MONTHS");
  eq("P2.7", "ตาราง FIRST_PERIOD_MAX_MONTHS = 12 ป้าย V อ้าง §ก5 ม.10", [row?.value, row?.tag, String(row?.source).includes("§ก5") && String(row?.source).includes("ม.10")], [12, "V", true]);
  eq("P2.8", "เปลี่ยนเดือน: มีรายการ → FISCAL_YEAR_CHANGE ต้องยืนยัน · สมุดว่าง → ไม่เตือน · เดือนเดิม → ไม่เตือน", [FR.fiscalYearChangeWarnings(1, 4, true).map((x: Any) => [x.code, x.ack, x.tag]), FR.fiscalYearChangeWarnings(1, 4, false).length, FR.fiscalYearChangeWarnings(4, 4, true).length], [[["FISCAL_YEAR_CHANGE", true, "V"]], 0, 0]);
}

console.log("\n── D1 บันทึกนโยบาย (ฐานข้อมูล) ──");
const F: Any = await import("./qc-acc-v2-wht-fixture.mts" as string);
const PO: Any = await import("@/lib/modules/account/policy" as string);
const LG: Any = await import("@/lib/modules/account/legal-gate" as string);
const GL: Any = await import("@/lib/modules/account/gl" as string);
let tid = "";
let prisma: Any = null;
try {
  const S = await F.setupWhtShop("QC T4.6 รอบบัญชี", "qc-t46-fiscal");
  tid = S.tid;
  prisma = S.prisma;
  const ctx = S.ctx;
  const screen = (codes: string[]) => ({ codes, actorId: S.owner.id, via: "screen" });
  // สมุดยังว่าง → เปลี่ยนเดือนได้โดยไม่ถาม
  const n0 = await prisma.accountJournalEntry.count({ where: { systemId: S.SYS } });
  const s0 = await LG.withScreenLegal(screen([]), () => PO.savePolicy(ctx, { fiscalYearStartMonth: 10 }));
  eq("D1.1", "สมุดว่าง (0 รายการ) เปลี่ยนเดือนเริ่ม ม.ค. → ต.ค. = บันทึกได้ ไม่มีคำเตือน", [n0, s0.ok, s0.warnings ?? []], [0, true, []]);
  const ld = await prisma.accountLedger.findMany({ where: { systemId: S.SYS }, select: { id: true }, take: 2 });
  await GL.postManualJV(ctx, { date: new Date("2026-10-05T12:00:00+07:00"), memo: "ยอดยกมา", lines: [{ accountId: ld[0].id, debit: 100, credit: 0 }, { accountId: ld[1].id, debit: 0, credit: 100 }] });
  const s1 = await LG.withScreenLegal(screen([]), () => PO.savePolicy(ctx, { fiscalYearStartMonth: 4 }));
  const p1 = await PO.getPolicy(ctx);
  eq("D1.2", "มีรายการแล้ว + ไม่ยืนยัน → legal FISCAL_YEAR_CHANGE · เดือนยังเป็น ต.ค.", [s1.ok, s1.legal?.warnings?.map((w: Any) => w.code), p1.fiscalYearStartMonth], [false, ["FISCAL_YEAR_CHANGE"], 10]);
  const s2 = await LG.withScreenLegal(screen(["FISCAL_YEAR_CHANGE"]), () => PO.savePolicy(ctx, { fiscalYearStartMonth: 4 }));
  const p2 = await PO.getPolicy(ctx);
  const st = await prisma.accountSettings.findFirstOrThrow({ where: { systemId: S.SYS }, select: { id: true } });
  const ack = await prisma.auditLog.findFirst({ where: { tenantId: tid, action: "legal.warning.ack", targetType: "AccountSettings", targetId: st.id }, select: { after: true, actorId: true } });
  eq("D1.3", "ยืนยันแล้ว → บันทึก เม.ย. · บันทึกผู้ยืนยัน (op account.policy.fiscal-year)", [s2.ok, p2.fiscalYearStartMonth, (ack?.after as Any)?.op, (ack?.after as Any)?.codes, ack?.actorId === S.owner.id], [true, 4, "account.policy.fiscal-year", ["FISCAL_YEAR_CHANGE"], true]);
  const s3 = await PO.savePolicy(ctx, { fiscalYearStartMonth: 1 });
  eq("D1.4", "ไม่มีบริบทยืนยัน (งานเบื้องหลัง/สคริปต์) → ไม่บล็อก บันทึกได้", [s3.ok, (await PO.getPolicy(ctx)).fiscalYearStartMonth], [true, 1]);

  const s4 = await PO.savePolicy(ctx, { booksStartDate: new Date("2026-03-16T12:00:00+07:00") });
  const p4 = await PO.getPolicy(ctx);
  const fi = await PO.fiscalInfoOf(ctx, p4);
  eq("D1.5", "บันทึกวันเริ่มทำบัญชี 16 มี.ค. → รอบแรก 16 มี.ค. – 31 ธ.ค. 2026 · คำเตือนรอบแรกสั้น · เพดาน 12 · มีรายการแล้ว", [s4.ok, fi.firstPeriod, fi.warnings.map((w: Any) => w.code), fi.firstPeriodMaxMonths, fi.hasEntries], [true, { start: "2026-03-16", end: "2026-12-31", months: 10, fullMonths: 9 }, ["FIRST_PERIOD_SHORT"], 12, true]);
  // ร้านทับเพดานรอบแรก (ตัวอย่าง: ค่าที่นักบัญชีแนะ) → ข้อความใช้ค่าร้าน + ระบบเตือนว่าต่างจากค่าเริ่ม
  const LV: Any = await import("@/lib/modules/account/legal-values" as string);
  const sv = await LV.saveBookTax(S.ownerActor, ctx, { bookRows: [{ id: "", rule: "FIRST_PERIOD_MAX_MONTHS", value: 18, from: null, to: null, source: "", checkedAt: null }] }, "QC T4.6");
  const fi2 = await PO.fiscalInfoOf(ctx, p4);
  eq("D1.6", "แถวร้าน 18 เดือน → บันทึกได้ + SHOP_DIFFERS_FROM_DEFAULT · ข้อความรอบแรก 'ภายใน 18 เดือน'", [sv.ok, sv.warnings.map((w: Any) => w.code), fi2.firstPeriodMaxMonths, /ภายใน 18 เดือน/.test(fi2.warnings[0]?.messageTh ?? "")], [true, ["SHOP_DIFFERS_FROM_DEFAULT"], 18, true]);
  const bad = await LV.saveBookTax(S.ownerActor, ctx, { bookRows: [{ id: "", rule: "FIRST_PERIOD_MAX_MONTHS", value: 99, from: null, to: null, source: "", checkedAt: null }] }, "QC T4.6");
  eq("D1.7", "ค่านอกช่วงรูปแบบข้อมูล (99 เดือน > 24) → ปฏิเสธที่ zod ของค่าตั้ง (ไม่ใช่เพดานกฎหมาย)", bad.ok, false);
  await PO.savePolicy(ctx, { booksStartDate: null });
  eq("D1.8", "ล้างวันเริ่ม → ไม่มีรอบแรก/คำเตือน", (await PO.fiscalInfoOf(ctx, await PO.getPolicy(ctx))).warnings.length, 0);
} catch (e) {
  chk("X", "ไม่มี exception", false, "no error", String((e as Error)?.stack ?? e));
} finally {
  if (prisma) await F.keepOrPurge(prisma, tid, KEEP);
  if (prisma) await prisma.$disconnect();
}

const fl = cks.filter((c) => !c.ok);
console.log(`\n===== QC ACC T4.6 งบ + รอบบัญชี =====\nผ่าน ${cks.length - fl.length}/${cks.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - fl.length, findings: fl.map((c) => c.id) })}`);
process.exit(fl.length > 0 ? 1 : 0);
