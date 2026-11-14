// QC ACC T4.1 — JV มือ: คำอธิบาย (ยืนยัน) · ผู้อนุมัติ · เอกสารแนบ · คำเตือนลงรายการช้า (ปิด D1 D2) · design note ledger/wo-notes/T4.1.md
// กฎ: skill domain-accounting-books §ก2 ข้อ 5 ข้อ 7 ข้อ 11 ข้อ 13 [V] · §ค ฉ.161 ข้อ 3 [V] · test-rules T-ACC-12
// ร้านทดสอบแยก "QC T4.1 JV" (บริษัทจำกัด · ลบตอนจบ · KEEP=1 เก็บ) · รัน: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-acc-v2-jv-manual.mts
//
// เฉลยมือ (วันที่ไทย):
//   บริษัท: รายการ 1 ก.ย. 2026 → รายวันภายใน 16 ก.ย. (1 + 15) · แยกประเภทภายใน 15 ต.ค. (30 ก.ย. + 15)
//     บันทึก 16 ก.ย. = ไม่ช้า · 17 ก.ย. = ช้า 1 วัน (รายวัน) · 16 ต.ค. = ช้า 30 วัน (รายวัน) + 1 วัน (แยกประเภท)
//   บุคคลธรรมดาไม่จด VAT: รายการศุกร์ 13 พ.ย. 2026 → 3 วันทำการ = จ.16 อ.17 พ.18 ⇒ ภายใน 18 พ.ย. · บันทึก 19 พ.ย. = ช้า 1 วัน
//   บุคคลธรรมดาจด VAT = ไม่เตือน · ยังไม่ระบุประเภท = กติกานิติบุคคล + JV_LATE_ENTRY_ASSUMED [S]
//   ร้านทับ JOURNAL_ENTRY_DAYS = 30 → บันทึก 17 ก.ย. ไม่ช้า (รายวัน) · แยกประเภทยังใช้ 15
//   ฐานข้อมูล (นาฬิกาตรึง 20 ต.ค. 2026): JV ลงวันที่ 1 ต.ค. → รายวันภายใน 16 ต.ค. → ช้า 4 วัน
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-acc-v2-jv-manual");

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
const R: Any = await import("@/lib/modules/account/jv-rules" as string);
const T: Any = await import("@/lib/core/settings/legal/th-tax-2569" as string);
const LV: Any = await import("@/lib/modules/account/legal-values" as string);

const sysRules = (shop: Any[] = []) => {
  const legal = { entityKind: "COMPANY", shop: { vat: [], wht: [], deadline: [], book: shop } };
  const d = new Date("2026-09-01T12:00:00+07:00");
  const j = LV.bookRuleFrom(legal, "JOURNAL_ENTRY_DAYS", d);
  const l = LV.bookRuleFrom(legal, "LEDGER_POST_DAYS_AFTER_MONTH", d);
  const c = LV.bookRuleFrom(legal, "CASH_REPORT_WORKING_DAYS", d);
  return { journalDays: j.value, journalSource: j.row?.source, ledgerDays: l.value, ledgerSource: l.row?.source, cashWorkingDays: c.value, cashSource: c.row?.source };
};
const late = (dateYmd: string, recordedYmd: string, entityKind = "COMPANY", vatRegistered = true, rules = sysRules()) => R.jvLateWarnings({ dateYmd, recordedYmd, entityKind, vatRegistered, rules });

console.log("\n── P1 ค่าในตาราง + การนับวัน (pure) ──");
{
  const rows = T.SYSTEM_BOOK_ROWS.filter((r: Any) => ["JOURNAL_ENTRY_DAYS", "LEDGER_POST_DAYS_AFTER_MONTH", "CASH_REPORT_WORKING_DAYS"].includes(r.rule));
  eq("P1.1", "แถวระบบ 15 วัน · 15 วันหลังสิ้นเดือน · 3 วันทำการ ป้าย [V] อ้าง §ก2 ข้อ 7 / §ค ฉ.161", rows.map((r: Any) => [r.rule, r.value, r.tag, r.source.includes(r.rule === "CASH_REPORT_WORKING_DAYS" ? "§ค" : "ข้อ 7")]), [["JOURNAL_ENTRY_DAYS", 15, "V", true], ["LEDGER_POST_DAYS_AFTER_MONTH", 15, "V", true], ["CASH_REPORT_WORKING_DAYS", 3, "V", true]]);
  eq("P1.2", "addWorkingDays ศ.13 พ.ย. + 3 = พ.18 พ.ย. · addDays 1 ก.ย. + 15 = 16 ก.ย. · monthEnd ก.พ. 2026 = 28", [R.addWorkingDaysYmd("2026-11-13", 3), R.addDaysYmd("2026-09-01", 15), R.monthEndYmd("2026-02-10")], ["2026-11-18", "2026-09-16", "2026-02-28"]);
  eq("P1.3", "jvLateBasis: บจ. JOURNAL · บุคคลไม่จด VAT CASH_REPORT · บุคคลจด VAT NONE · ยังไม่ระบุ JOURNAL+assumed", [R.jvLateBasis("COMPANY", true), R.jvLateBasis("INDIVIDUAL", false), R.jvLateBasis("INDIVIDUAL", true), R.jvLateBasis("UNSET", false)], [{ basis: "JOURNAL", assumed: false }, { basis: "CASH_REPORT", assumed: false }, { basis: "NONE", assumed: false }, { basis: "JOURNAL", assumed: true }]);
}

console.log("\n── P2 คำเตือนลงรายการช้า (pure · เฉลยมือ) ──");
{
  eq("P2.1", "บจ. 1 ก.ย. บันทึก 16 ก.ย. = ไม่ช้า", late("2026-09-01", "2026-09-16").length, 0);
  const w17 = late("2026-09-01", "2026-09-17");
  eq("P2.2", "บันทึก 17 ก.ย. = ช้า 1 วัน (รายวัน) · ack=false · ป้าย V · อ้างข้อ 7", [w17.length, w17[0]?.code, w17[0]?.ack, w17[0]?.tag, /เกิน 1 วัน/.test(w17[0]?.messageTh), /บัญชีรายวัน/.test(w17[0]?.messageTh), String(w17[0]?.citation).includes("ข้อ 7")], [1, "JV_LATE_ENTRY", false, "V", true, true, true]);
  const w1016 = late("2026-09-01", "2026-10-16");
  eq("P2.3", "บันทึก 16 ต.ค. = รายวันเกิน 30 วัน + แยกประเภทเกิน 1 วัน", w1016.map((w: Any) => [w.code, (w.messageTh.match(/เกิน (\d+) วัน/) ?? [])[1]]), [["JV_LATE_ENTRY", "30"], ["JV_LATE_ENTRY", "1"]]);
  eq("P2.4", "บุคคลไม่จด VAT: ศ.13 พ.ย. บันทึก พ.18 = ไม่ช้า · พฤ.19 = ช้า 1 วัน (3 วันทำการ · รายงานเงินสดรับ-จ่าย)", [late("2026-11-13", "2026-11-18", "INDIVIDUAL", false).length, late("2026-11-13", "2026-11-19", "INDIVIDUAL", false).map((w: Any) => [w.code, /3 วันทำการ/.test(w.messageTh), /เกิน 1 วัน/.test(w.messageTh)])], [0, [["JV_LATE_ENTRY", true, true]]]);
  eq("P2.5", "บุคคลจด VAT = ไม่เตือน (ไม่อยู่ใต้ พ.ร.บ.การบัญชี/ฉ.161)", late("2026-09-01", "2026-12-31", "INDIVIDUAL", true).length, 0);
  const wu = late("2026-09-01", "2026-09-20", "UNSET", false);
  eq("P2.6", "ยังไม่ระบุประเภท → JV_LATE_ENTRY_ASSUMED ป้าย S + ข้อความตรวจกับนักบัญชี", [wu.map((w: Any) => w.code), wu[0]?.tag, /โปรดตรวจกับนักบัญชีของร้าน/.test(wu[0]?.messageTh)], [["JV_LATE_ENTRY_ASSUMED"], "S", true]);
  eq("P2.7", "บันทึกก่อนหรือวันเดียวกับวันที่รายการ = ไม่ช้า", [late("2026-09-10", "2026-09-10").length, late("2026-09-10", "2026-09-01").length], [0, 0]);
  const shop = sysRules([{ id: "shop-jv-30", rule: "JOURNAL_ENTRY_DAYS", value: 30, from: null, to: null, source: "นักบัญชีของร้าน", tag: "SHOP", checkedAt: null }]);
  eq("P2.8", "ร้านทับรายวัน 30 วัน → 17 ก.ย. ไม่ช้า · 16 ต.ค. = รายวันช้า 15 + แยกประเภทช้า 1", [shop.journalDays, late("2026-09-01", "2026-09-17", "COMPANY", true, shop).length, late("2026-09-01", "2026-10-16", "COMPANY", true, shop).map((w: Any) => (w.messageTh.match(/เกิน (\d+) วัน/) ?? [])[1])], [30, 0, ["15", "1"]]);
}

console.log("\n── P3 คำเตือนเนื้อหา (pure) ──");
{
  const c = (x: Any) => R.jvContentWarnings(x).map((w: Any) => [w.code, w.ack]);
  eq("P3.1", "ไม่มีคำอธิบาย (ช่องว่างล้วน) → ต้องยืนยัน · ไม่มีเอกสาร → แจ้ง · ยังไม่อนุมัติ → แจ้ง", c({ memo: "   ", hasSupportingDoc: false, approved: false }), [["JV_DESCRIPTION_MISSING", true], ["JV_NO_SUPPORTING_DOC", false], ["JV_UNAPPROVED", false]]);
  eq("P3.2", "ครบ (คำอธิบาย + เอกสาร + อนุมัติ) = ไม่มีคำเตือน · approved ไม่ส่ง = ไม่ตรวจข้อนั้น", [c({ memo: "ปรับปรุงค่าเช่าค้างจ่าย", hasSupportingDoc: true, approved: true }), c({ memo: "x", hasSupportingDoc: true })], [[], []]);
}

console.log("\n── D1 ฐานข้อมูล: บันทึก · ยืนยัน · อนุมัติ · ธงร่าง ──");
const F: Any = await import("./qc-acc-v2-wht-fixture.mts" as string);
const JV: Any = await import("@/lib/modules/account/journal-v2" as string);
const LG: Any = await import("@/lib/modules/account/legal-gate" as string);
const CL: Any = await import("@/lib/modules/account/clock" as string);
let tid = "";
let prisma: Any = null;
try {
  const S = await F.setupWhtShop("QC T4.1 JV", "qc-t41-jv");
  tid = S.tid;
  prisma = S.prisma;
  const ctx = S.ctx;
  CL.pinAccountClockForQc(new Date("2026-10-20T10:00:00+07:00"));
  const ledgers = await prisma.accountLedger.findMany({ where: { systemId: S.SYS, code: { in: ["6100", "2140", "6900", "2100"] } }, select: { id: true, code: true } });
  const L = (c: string) => ledgers.find((l: Any) => l.code === c)?.id ?? ledgers[0].id;
  const exp1 = L("6900");
  const liab = (ledgers.find((l: Any) => l.code.startsWith("21")) ?? ledgers[1]).id;
  const lines = (amt: number) => [
    { accountId: exp1, debit: amt, credit: 0 },
    { accountId: liab, debit: 0, credit: amt },
  ];
  const screen = (codes: string[]) => ({ codes, actorId: S.owner.id, via: "screen" });
  const before = await prisma.accountJournalEntry.count({ where: { systemId: S.SYS, source: "MANUAL" } });
  const r0 = await LG.withScreenLegal(screen([]), () => JV.createManualEntry(ctx, { dateKey: "2026-10-01", memo: "", lines: lines(120_000), postedById: S.owner.id }));
  const after0 = await prisma.accountJournalEntry.count({ where: { systemId: S.SYS, source: "MANUAL" } });
  eq("D1.1", "ไม่มีคำอธิบาย + ไม่ยืนยัน → {ok:false, legal: JV_DESCRIPTION_MISSING} · ไม่มีใบสำคัญเกิดขึ้น", [r0.ok, r0.legal?.code, r0.legal?.warnings?.map((w: Any) => w.code), after0 - before], [false, "LEGAL_ACK_REQUIRED", ["JV_DESCRIPTION_MISSING"], 0]);
  const r1 = await LG.withScreenLegal(screen(["JV_DESCRIPTION_MISSING"]), () => JV.createManualEntry(ctx, { dateKey: "2026-10-01", memo: "", lines: lines(120_000), postedById: S.owner.id }));
  eq("D1.2", "ยืนยันแล้ว → ok · ยังไม่อนุมัติ · คำเตือน: ลงช้า 4 วัน + ไม่มีคำอธิบาย + ไม่มีเอกสาร + ยังไม่อนุมัติ", [r1.ok, r1.approved, r1.warnings?.map((w: Any) => w.code).sort(), /เกิน 4 วัน/.test(r1.warnings?.find((w: Any) => w.code === "JV_LATE_ENTRY")?.messageTh ?? "")], [true, false, ["JV_DESCRIPTION_MISSING", "JV_LATE_ENTRY", "JV_NO_SUPPORTING_DOC", "JV_UNAPPROVED"], true]);
  const ack = await prisma.auditLog.findFirst({ where: { tenantId: tid, action: "legal.warning.ack", targetType: "AccountJournalEntry", targetId: r1.entryId }, select: { actorId: true, after: true } });
  eq("D1.3", "บันทึกผู้ยืนยัน (AuditLog legal.warning.ack · op account.journal.adjust · รหัส JV_DESCRIPTION_MISSING)", [ack?.actorId === S.owner.id, (ack?.after as Any)?.op, (ack?.after as Any)?.codes], [true, "account.journal.adjust", ["JV_DESCRIPTION_MISSING"]]);
  const e1 = await prisma.accountJournalEntry.findUniqueOrThrow({ where: { id: r1.entryId }, select: { approvedById: true, approvedAt: true, memo: true } });
  eq("D1.4", "ใบสำคัญ: ยังไม่มีผู้อนุมัติ · memo = ข้อความแทนของ gl (ถือว่าไม่มีคำอธิบาย)", [e1.approvedById, e1.approvedAt, e1.memo, R.jvContentWarnings({ memo: e1.memo, hasSupportingDoc: true }).map((w: Any) => w.code)], [null, null, R.MANUAL_JV_PLACEHOLDER_MEMO, ["JV_DESCRIPTION_MISSING"]]);

  // อนุมัติพร้อมบันทึก + ไฟล์แนบ + วันที่ไม่ช้า (15 ต.ค. → ภายใน 30 ต.ค.)
  const att = await prisma.accountAttachment.create({ data: { tenantId: tid, systemId: S.SYS, fileName: "ใบสำคัญจ่าย.pdf", fileUrl: "https://example.invalid/jv.pdf", mimeType: "application/pdf", sizeBytes: 10, status: "UNLINKED", source: "UPLOAD" } });
  const r2 = await LG.withScreenLegal(screen([]), () => JV.createManualEntry(ctx, { dateKey: "2026-10-15", memo: "ตั้งค่าเช่าค้างจ่าย ต.ค.", lines: lines(50_000), postedById: S.owner.id, attachmentIds: [att.id], approvedById: S.owner.id }));
  eq("D1.5", "มีคำอธิบาย + ไฟล์ + อนุมัติ + ไม่ช้า → ok ไม่มีคำเตือน T4.1", [r2.ok, r2.approved, r2.warnings?.map((w: Any) => w.code)], [true, true, []]);
  const e2 = await prisma.accountJournalEntry.findUniqueOrThrow({ where: { id: r2.entryId }, select: { approvedById: true, approvedAt: true } });
  const a2 = await prisma.accountAttachment.findUniqueOrThrow({ where: { id: att.id }, select: { refType: true, refId: true } });
  eq("D1.6", "approvedById = ผู้บันทึก · approvedAt = นาฬิกาบัญชี (20 ต.ค.) · ไฟล์ผูกกับ JV", [e2.approvedById === S.owner.id, e2.approvedAt?.toISOString(), a2.refType, a2.refId === r2.entryId], [true, "2026-10-20T03:00:00.000Z", "AccountJournalEntry", true]);

  const ap = await JV.approveJournalEntry(ctx, r1.entryId, S.owner.id);
  const ap2 = await JV.approveJournalEntry(ctx, r1.entryId, S.owner.id);
  eq("D1.7", "อนุมัติใบแรก → ok · อนุมัติซ้ำ → ปฏิเสธ 'อนุมัติไปแล้ว'", [ap.ok, ap2.ok, /อนุมัติไปแล้ว/.test(ap2.reason ?? "")], [true, false, true]);

  // ธงร่าง: บันทึกร่าง → ติดธงร่าง → อนุมัติ = ปลดธงร่าง · ธงที่ติดด้วยเหตุอื่นไม่ปลด
  const r3 = await LG.withScreenLegal(screen([]), () => JV.createManualEntry(ctx, { dateKey: "2026-10-18", memo: "ร่างรายการปรับปรุง", lines: lines(10_000), postedById: S.owner.id }));
  await JV.toggleNeedsReview(ctx, r3.entryId, JV.JV_DRAFT_FLAG_NOTE);
  const ap3 = await JV.approveJournalEntry(ctx, r3.entryId, S.owner.id);
  const e3 = await prisma.accountJournalEntry.findUniqueOrThrow({ where: { id: r3.entryId }, select: { needsReview: true, flagNote: true } });
  eq("D1.8", "อนุมัติใบร่าง → flagCleared · needsReview false", [ap3.ok, ap3.flagCleared, e3.needsReview, e3.flagNote], [true, true, false, null]);
  const r4 = await LG.withScreenLegal(screen([]), () => JV.createManualEntry(ctx, { dateKey: "2026-10-18", memo: "รอใบเสร็จ", lines: lines(10_000), postedById: S.owner.id }));
  await JV.toggleNeedsReview(ctx, r4.entryId, "รอนักบัญชีดูบัญชีที่ใช้");
  const ap4 = await JV.approveJournalEntry(ctx, r4.entryId, S.owner.id);
  const e4 = await prisma.accountJournalEntry.findUniqueOrThrow({ where: { id: r4.entryId }, select: { needsReview: true } });
  eq("D1.9", "ธงที่ติดด้วยเหตุอื่น: อนุมัติได้ แต่ธงยังอยู่", [ap4.ok, ap4.flagCleared, e4.needsReview], [true, false, true]);

  // ใบที่ระบบลงจากเอกสาร → อนุมัติที่สมุดรายวันไม่ได้
  await S.payVendor({ vendorId: S.vJur.id, ym: "2026-10", d: 5, base: 100_000, wht: 3_000, rateBp: 300, incomeType: "M40_8", key: "t41-auto" });
  const auto = await prisma.accountJournalEntry.findFirstOrThrow({ where: { systemId: S.SYS, source: "AUTO" }, select: { id: true } });
  const ap5 = await JV.approveJournalEntry(ctx, auto.id, S.owner.id);
  eq("D1.10", "ใบที่ระบบลงให้ → ปฏิเสธ (อนุมัติที่เอกสารต้นทาง)", [ap5.ok, /เอกสารต้นทาง/.test(ap5.reason ?? "")], [false, true]);
  // กลับรายการแล้ว → อนุมัติไม่ได้
  const r6 = await LG.withScreenLegal(screen([]), () => JV.createManualEntry(ctx, { dateKey: "2026-10-19", memo: "บันทึกผิด", lines: lines(7_000), postedById: S.owner.id }));
  await JV.reverseJournalEntry(ctx, r6.entryId, "บันทึกผิดบัญชี");
  const ap6 = await JV.approveJournalEntry(ctx, r6.entryId, S.owner.id);
  eq("D1.11", "ใบที่ถูกกลับรายการ → ปฏิเสธ", [ap6.ok, /กลับรายการแล้ว/.test(ap6.reason ?? "")], [false, true]);

  // หน้ารายละเอียด: ผู้อนุมัติ + คำเตือนจาก createdAt จริง
  const d1 = await JV.journalEntryDetail(ctx, r1.entryId);
  const lg1 = await JV.journalEntryLegal(ctx, d1);
  const recYmd = R.bkkYmdOf(d1.createdAt);
  const expLate = late("2026-10-01", recYmd).map((w: Any) => w.code);
  eq("D1.12", "รายละเอียด: อนุมัติโดยเจ้าของ · คำเตือน = ไม่มีคำอธิบาย + ไม่มีเอกสาร + ลงช้าตาม createdAt", [d1.approvedByName, !!d1.approvedAt, lg1.map((w: Any) => w.code)], [S.owner.name, true, ["JV_DESCRIPTION_MISSING", "JV_NO_SUPPORTING_DOC", ...expLate]]);
  const autoD = await JV.journalEntryDetail(ctx, auto.id);
  eq("D1.13", "ใบที่ระบบลงให้: ไม่มีคำเตือน JV มือ", (await JV.journalEntryLegal(ctx, autoD)).length, 0);

  // ประเภทผู้ประกอบการบุคคลธรรมดาจด VAT → ไม่มีคำเตือนลงช้า
  await LV.saveBookTax(S.ownerActor, ctx, { entityKind: "INDIVIDUAL" }, "QC T4.1");
  const r7 = await LG.withScreenLegal(screen([]), () => JV.createManualEntry(ctx, { dateKey: "2026-09-01", memo: "ยอดยกมา", lines: lines(5_000), postedById: S.owner.id, approvedById: S.owner.id }));
  eq("D1.14", "บุคคลธรรมดา (สมุดจด VAT) ลงย้อน 1 ก.ย. → ไม่มี JV_LATE_ENTRY", r7.warnings?.map((w: Any) => w.code).filter((c: string) => c.startsWith("JV_LATE")), []);
} catch (e) {
  chk("X", "ไม่มี exception", false, "no error", String((e as Error)?.stack ?? e));
} finally {
  CL.pinAccountClockForQc(null);
  if (prisma) await F.keepOrPurge(prisma, tid, KEEP);
  if (prisma) await prisma.$disconnect();
}

const fl = cks.filter((c) => !c.ok);
console.log(`\n===== QC ACC T4.1 JV มือ =====\nผ่าน ${cks.length - fl.length}/${cks.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - fl.length, findings: fl.map((c) => c.id) })}`);
process.exit(fl.length > 0 ? 1 : 0);
