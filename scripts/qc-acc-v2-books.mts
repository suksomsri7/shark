// QC ACC T4.2 — รายงานสมุดบัญชีแบบเต็ม (ปิด D3 K5) · design note ledger/wo-notes/T4.2.md
// กฎ: skill domain-accounting-books §ก2 ข้อ 3 ข้อ 5 ข้อ 6 [V] (ชนิดบัญชี · ชื่อบัญชี วันที่ เลขที่ รายการ จำนวนเงิน · เลขหน้าเรียง · ลูกหนี้/เจ้าหนี้รายตัว)
// ร้านทดสอบแยก "QC T4.2 สมุด" (ลบตอนจบ · KEEP=1 เก็บ) · รัน: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-acc-v2-books.mts
//
// เฉลยมือ:
//   แบ่งหน้า (pure): 12 แถว × 100 สตางค์ หน้าละ 5 → 3 หน้า (5/5/2) · ยอดยกไป 500 / 1,000 / 1,200 · หัวกลุ่มไม่ค้างท้ายหน้า
//   สมุดรายวัน ต.ค. 2026: JV ทั่วไป 205 ใบ ใบที่ i ยอด 1,000 + i สตางค์ (i = 1…205) → Σ เดบิต = Σ เครดิต = 205×1,000 + 205×206÷2 = 226,115
//     อ่านก้อนละ 50 → 5 ก้อน 205 ใบ (ไม่ตัด 200) · เพดาน 150 → 150 ใบ truncated · หน้า 2 ขนาด 100 → 100 ใบ · total 205 · 3 หน้า
//   ลูกหนี้รายตัว 10–30 พ.ย.: ใบแจ้งหนี้ ก 5 พ.ย. 50,000 · ข 12 พ.ย. 30,000 · รับชำระ ก 15 พ.ย. 20,000
//     ก: ยกมา 50,000 · Dr 0 · Cr 20,000 · ยกไป 30,000 | ข: 0 · 30,000 · 0 · 30,000 | รวม 50,000 · 30,000 · 20,000 · 60,000 = ยอดบัญชีลูกหนี้ใน GL
//   เจ้าหนี้รายตัว พ.ย.: ค่าจ้างบริษัทรับเหมา 100,000 จ่าย 97,000 + หัก 3,000 → Dr 100,000 · Cr 100,000 · ยกไป 0
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-acc-v2-books");

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
const BR: Any = await import("@/lib/modules/account/books-report" as string);

console.log("\n── P1 แบ่งหน้าใบพิมพ์ (pure) ──");
{
  const rows = Array.from({ length: 12 }, (_, i) => ({ kind: "line", cells: [`r${i}`, 100] }));
  const pages = BR.paginateBookRows(rows, 5, [1]);
  eq("P1.1", "12 แถว หน้าละ 5 → 3 หน้า 5/5/2 · เลขหน้าเรียง 1,2,3", [pages.length, pages.map((p: Any) => p.rows.length), pages.map((p: Any) => p.no)], [3, [5, 5, 2], [1, 2, 3]]);
  eq("P1.2", "ยอดยกมา/รวมหน้า/ยอดยกไป: 0→500 · 500→1,000 · 1,000→1,200", pages.map((p: Any) => [p.carriedIn[0], p.pageSums[0], p.carriedOut[0]]), [[0, 500, 500], [500, 500, 1000], [1000, 200, 1200]]);
  const g = [...Array.from({ length: 4 }, () => ({ kind: "line", cells: ["x", 1] })), { kind: "group", cells: ["หัว", null], keepWithNext: true }, { kind: "line", cells: ["y", 1] }];
  const pg = BR.paginateBookRows(g, 5, [1]);
  eq("P1.3", "หัวกลุ่มที่จะตกท้ายหน้า → ย้ายไปหน้าถัดไป (4 / 2) · หัวกลุ่มไม่นับในยอด", [pg.map((p: Any) => p.rows.length), pg[1].rows[0].kind, pg[1].carriedOut[0]], [[4, 2], "group", 5]);
  const blk = [{ kind: "line", cells: ["a", 1] }, { kind: "line", cells: ["b", 1] }, { kind: "line", cells: ["c", 1] }, { kind: "line", blockSize: 3, cells: ["d1", 1] }, { kind: "line", cells: ["d2", 1] }, { kind: "line", cells: ["d3", 1] }];
  eq("P1.3b", "ใบสำคัญ 3 บรรทัด (blockSize) ไม่แยกหน้า: 3 / 3 · ยอดรวมหน้าแรก 3", BR.paginateBookRows(blk, 5, [1]).map((p: Any) => [p.rows.length, p.pageSums[0]]), [[3, 3], [3, 3]]);
  eq("P1.4", "ไม่มีแถว → 1 หน้าว่าง (หัวรายงานยังพิมพ์ได้)", BR.paginateBookRows([], 30).map((p: Any) => [p.no, p.rows.length]), [[1, 0]]);
  eq("P1.5", "ชื่อชนิดบัญชี: ทุกเล่ม · ทั่วไป · ขาย · บัญชีย่อยลูกหนี้/เจ้าหนี้", [BR.journalBookTitleTh(null), BR.journalBookTitleTh("GENERAL"), BR.journalBookTitleTh("SALES"), BR.SUBSIDIARY_TITLE_TH.AR, BR.SUBSIDIARY_TITLE_TH.AP], ["สมุดบัญชีรายวัน (ทุกเล่ม)", "สมุดบัญชีรายวันทั่วไป", "สมุดบัญชีรายวันขาย", "บัญชีย่อยลูกหนี้รายตัว", "บัญชีย่อยเจ้าหนี้รายตัว"]);
}

console.log("\n── D1 สมุดรายวันเกิน 200 ใบ (ฐานข้อมูล) ──");
const F: Any = await import("./qc-acc-v2-wht-fixture.mts" as string);
const GL: Any = await import("@/lib/modules/account/gl" as string);
const JV: Any = await import("@/lib/modules/account/journal-v2" as string);
const acc: Any = await import("@/lib/modules/account/service" as string);
let tid = "";
let prisma: Any = null;
try {
  const S = await F.setupWhtShop("QC T4.2 สมุด", "qc-t42-books");
  tid = S.tid;
  prisma = S.prisma;
  const ctx = S.ctx;
  const led = await prisma.accountLedger.findMany({ where: { systemId: S.SYS, code: { in: ["6900", "1110", "2140", "1000", "1100"] } }, select: { id: true, code: true } });
  const exp1 = led.find((l: Any) => l.code === "6900").id;
  const other = led.find((l: Any) => l.code !== "6900").id;
  for (let i = 1; i <= 205; i++) {
    const d = new Date(Date.UTC(2026, 9, 1 + (i % 28), 5, 0, 0));
    await GL.postManualJV(ctx, { date: d, memo: `รายการทดสอบ ${i}`, book: "GENERAL", postedById: S.owner.id, lines: [{ accountId: exp1, debit: 1000 + i, credit: 0 }, { accountId: other, debit: 0, credit: 1000 + i, note: `บรรทัด ${i}` }] });
  }
  const R = { from: new Date("2026-10-01T00:00:00+07:00"), to: new Date("2026-10-31T23:59:59.999+07:00") };
  const all = await BR.journalBookAll(ctx, { book: null, ...R }, 20_000, 50);
  const sumDr = all.entries.reduce((s: number, e: Any) => s + e.totalDebit, 0);
  const sumCr = all.entries.reduce((s: number, e: Any) => s + e.totalCredit, 0);
  eq("D1.1", "อ่านทั้งช่วง ก้อนละ 50 → 205 ใบ (ไม่ตัด 200) · 5 ก้อน · ไม่ truncated · Σ Dr = Σ Cr = 226,115", [all.entries.length, all.chunks, all.truncated, sumDr, sumCr], [205, 5, false, 226_115, 226_115]);
  const sorted = all.entries.every((e: Any, i: number) => i === 0 || all.entries[i - 1].date.getTime() <= e.date.getTime());
  const ids = new Set(all.entries.map((e: Any) => e.id));
  eq("D1.2", "เรียงวันที่ · ไม่มีใบซ้ำข้ามก้อน · ทุกใบมี 2 บรรทัด (รหัส ชื่อบัญชี เดบิต/เครดิต)", [sorted, ids.size, all.entries.every((e: Any) => e.lines.length === 2 && e.lines[0].accountCode && e.lines[0].accountName && e.lines[0].debit > 0 && e.lines[1].credit > 0)], [true, 205, true]);
  const e1 = all.entries.find((e: Any) => e.memo === "รายการทดสอบ 7");
  eq("D1.3", "ใบที่ 7: เดบิต 6900 1,007 · เครดิต 1,007 + คำอธิบายบรรทัด · เล่มทั่วไป", [e1?.lines[0].accountCode, e1?.lines[0].debit, e1?.lines[1].credit, e1?.lines[1].note, e1?.bookLabel], ["6900", 1007, 1007, "บรรทัด 7", "ทั่วไป"]);
  const cut = await BR.journalBookAll(ctx, { book: null, ...R }, 150, 50);
  eq("D1.4", "เพดาน 150 ใบ → คืน 150 + truncated (หน้าพิมพ์แจ้งให้แบ่งช่วง ไม่ตัดเงียบ)", [cut.entries.length, cut.truncated], [150, true]);
  const p2 = await BR.journalBookPage(ctx, { book: "GENERAL", ...R, page: 2, pageSize: 100 });
  eq("D1.5", "REST หน้า 2 ขนาด 100 → 100 ใบ · total 205 · 3 หน้า · ยอดรวมทั้งช่วง 226,115", [p2.entries.length, p2.total, p2.pageCount, p2.sumDebit, p2.sumCredit], [100, 205, 3, 226_115, 226_115]);
  const sales = await BR.journalBookPage(ctx, { book: "SALES", ...R, page: 1, pageSize: 100 });
  eq("D1.6", "เล่มขายในช่วง ต.ค. = 0 ใบ (กรองตามเล่ม)", sales.total, 0);
  // หน้าจอเดิมของ g16 แสดงทีละ 20 (ไม่เปลี่ยน) — ใบพิมพ์ไม่ใช้ listJournalPaged อีกแล้ว
  const legacy = await JV.listJournalPaged(ctx, { book: "ALL", from: "2026-10-01", to: "2026-10-31", page: 1, pageSize: 200 });
  eq("D1.7", "เทียบ: รายการหน้าจอเดิม (หน้าละสูงสุด 200) total 205 แต่ rows 200 — ใบพิมพ์ใหม่ไม่พึ่งตัวนี้", [legacy.total, legacy.rows.length], [205, 200]);

  console.log("\n── D2 หัวรายงาน ──");
  const h = await BR.bookHeaderOf(ctx, "สมุดบัญชีรายวัน");
  eq("D2.1", "หัว: ชื่อ (คำนำหน้า + ชื่อ) · เลข 13 หลัก · สำนักงานใหญ่ · ไม่มีคำเตือน", [h.orgName, h.taxId.length, h.branchLabel, h.warnings.length], ["บริษัท หักภาษี ทดสอบ จำกัด", 13, "สำนักงานใหญ่", 0]);
  await prisma.accountSettings.updateMany({ where: { systemId: S.SYS }, data: { orgName: "", docConfig: {} } });
  const h2 = await BR.bookHeaderOf(ctx, "สมุดบัญชีรายวัน");
  eq("D2.2", "ไม่มีชื่อกิจการ → BOOK_REPORT_ORG_NAME_MISSING ป้าย S (ไม่บล็อก)", [h2.orgName, h2.warnings.map((w: Any) => [w.code, w.tag, w.ack])], ["", [["BOOK_REPORT_ORG_NAME_MISSING", "S", false]]]);
  await acc.saveSettings(S.tid, S.SYS, { orgPrefix: "บริษัท", orgName: "หักภาษี ทดสอบ จำกัด" });

  console.log("\n── D3 บัญชีย่อยลูกหนี้/เจ้าหนี้รายตัว ──");
  const custB = await acc.createContact({ tenantId: S.tid, systemId: S.SYS, kind: "CUSTOMER", legalType: "COMPANY", name: "บริษัท ลูกค้าบี จำกัด", taxId: F.thaiTaxId("010556177771"), branchCode: "00000", address: "5 ถ.ห้า" });
  const inv = async (contactId: string, d: number, amt: number) => {
    const iv = await acc.createDocument({ tenantId: S.tid, systemId: S.SYS, docType: "INVOICE", contactId, issueDate: S.day("2026-11", d), vatMode: "NONE", lines: [{ description: "บริการ", qty: 1, unitPrice: amt, vatRateBp: 0 }], createdById: S.owner.id });
    await acc.issueDocument(S.tid, S.SYS, iv.id);
    return iv.id as string;
  };
  const ivA = await inv(S.cust.id, 5, 50_000);
  await inv(custB.id, 12, 30_000);
  await acc.recordPayment(S.tid, S.SYS, ivA, { paidAt: S.day("2026-11", 15), channel: "TRANSFER", financeAccountId: S.bank.id, amount: 20_000, createdById: S.owner.id, idempotencyKey: `t42-pay-${S.tid}` });
  const RN = { from: new Date("2026-11-10T00:00:00+07:00"), to: new Date("2026-11-30T23:59:59.999+07:00") };
  const ar = await BR.subsidiaryLedger(ctx, { side: "AR", ...RN });
  const row = (id: string) => ar.rows.find((r: Any) => r.contactId === id);
  eq("D3.1", "ลูกหนี้ ก: ยกมา 50,000 · Dr 0 · Cr 20,000 · ยกไป 30,000", [row(S.cust.id)?.opening, row(S.cust.id)?.debit, row(S.cust.id)?.credit, row(S.cust.id)?.closing], [50_000, 0, 20_000, 30_000]);
  eq("D3.2", "ลูกหนี้ ข: 0 · 30,000 · 0 · 30,000 · รวม 50,000 / 30,000 / 20,000 / 60,000", [row(custB.id)?.closing, ar.totals], [30_000, { opening: 50_000, debit: 30_000, credit: 20_000, closing: 60_000 }]);
  const gl = await JV.generalLedger(ctx, { accountId: ar.account.id, from: RN.from, to: RN.to });
  eq("D3.3", "ผลรวมบัญชีย่อย = ยอดบัญชีคุมลูกหนี้ใน GL (ยกมา · ยกไป)", [gl.opening, gl.closing], [ar.totals.opening, ar.totals.closing]);
  const det = await BR.subsidiaryLedger(ctx, { side: "AR", ...RN, contactId: S.cust.id });
  eq("D3.4", "รายการของลูกหนี้ ก: 1 บรรทัด Cr 20,000 · คงเหลือ 30,000", [det.detail?.contactName, det.detail?.opening, det.detail?.lines.map((l: Any) => [l.credit, l.balance]), det.detail?.closing], ["บริษัท ลูกค้าหักเรา จำกัด", 50_000, [[20_000, 30_000]], 30_000]);
  await S.payVendor({ vendorId: S.vJur.id, ym: "2026-11", d: 3, base: 100_000, wht: 3_000, rateBp: 300, incomeType: "M40_8", key: "t42-ap" });
  const ap = await BR.subsidiaryLedger(ctx, { side: "AP", from: new Date("2026-11-01T00:00:00+07:00"), to: RN.to });
  const v = ap.rows.find((r: Any) => r.contactId === S.vJur.id);
  eq("D3.5", "เจ้าหนี้บริษัทรับเหมา: Dr 100,000 · Cr 100,000 · ยกไป 0 (ฝั่งเจ้าหนี้ยอดค้างเป็นบวก)", [v?.debit, v?.credit, v?.closing], [100_000, 100_000, 0]);

  // ACC T5 Job 0 ▸ บรรทัดลูกหนี้ที่ลงก่อนระบบเขียนผู้ติดต่อบนบรรทัด (ข้อมูลเดิมก่อน T4.2) — อนุมานผู้ติดต่อจากเอกสารต้นทางตอนอ่าน
  //   จำลองข้อมูลเดิมด้วยการ "เพิ่ม" ใบสำคัญใหม่ (ไม่แก้/ลบแถวที่ลงแล้ว): Dr ลูกหนี้ 7,000 ไม่มีผู้ติดต่อ refType AccountDocument → ใบของลูกค้า ข
  //   + JV มือ Dr ลูกหนี้ 1,000 ไม่มีผู้ติดต่อและไม่มีเอกสารต้นทาง → คงอยู่แถว "ไม่ระบุผู้ติดต่อ"
  const legacyDoc = await acc.createDocument({ tenantId: S.tid, systemId: S.SYS, docType: "INVOICE", contactId: custB.id, issueDate: S.day("2026-11", 20), vatMode: "NONE", lines: [{ description: "ค่าบริการเดิม", qty: 1, unitPrice: 7_000, vatRateBp: 0 }], createdById: S.owner.id });
  const rev = await prisma.accountLedger.findFirst({ where: { systemId: S.SYS, code: { startsWith: "4" } }, select: { id: true } });
  await prisma.accountJournalEntry.create({
    data: {
      tenantId: S.tid, systemId: S.SYS, docNo: `JV-LEGACY-${S.tid.slice(-6)}`, book: "SALES", journal: "DOC", date: S.day("2026-11", 20), periodKey: "2026-11",
      refType: "AccountDocument", refId: legacyDoc.id, memo: "ข้อมูลเดิมก่อน T4.2", source: "AUTO",
      lines: { create: [{ tenantId: S.tid, systemId: S.SYS, accountId: ar.account.id, debit: 7_000, credit: 0 }, { tenantId: S.tid, systemId: S.SYS, accountId: rev.id, debit: 0, credit: 7_000 }] },
    },
  });
  await GL.postManualJV(ctx, { date: S.day("2026-11", 21), memo: "ปรับลูกหนี้ไม่ระบุ", book: "GENERAL", postedById: S.owner.id, lines: [{ accountId: ar.account.id, debit: 1_000, credit: 0 }, { accountId: rev.id, debit: 0, credit: 1_000 }] });
  const ar2 = await BR.subsidiaryLedger(ctx, { side: "AR", ...RN });
  const r2 = (id: string | null) => ar2.rows.find((r: Any) => r.contactId === id);
  eq("D3.6", "ข้อมูลเดิม: บรรทัดไม่มีผู้ติดต่อแต่อ้างใบของลูกค้า ข → อยู่ใต้ลูกค้า ข (Dr 37,000 · ยกไป 37,000) · JV ไม่มีต้นทาง → ไม่ระบุผู้ติดต่อ 1,000", [r2(custB.id)?.debit, r2(custB.id)?.closing, r2(null)?.closing], [37_000, 37_000, 1_000]);
  const gl2 = await JV.generalLedger(ctx, { accountId: ar.account.id, from: RN.from, to: RN.to });
  eq("D3.7", "ผลรวมบัญชีย่อยยังเท่ายอดบัญชีคุม (68,000)", [gl2.closing, ar2.totals.closing], [68_000, 68_000]);
  const detB = await BR.subsidiaryLedger(ctx, { side: "AR", ...RN, contactId: custB.id });
  eq("D3.8", "รายการของลูกค้า ข: 2 บรรทัด (ใบปกติ 30,000 + ใบเดิม 7,000) เรียงวันที่ · คงเหลือ 37,000", [detB.detail?.lines.map((l: Any) => [l.debit, l.balance]), detB.detail?.closing], [[[30_000, 30_000], [7_000, 37_000]], 37_000]);
  const detNone = await BR.subsidiaryLedger(ctx, { side: "AR", ...RN, contactId: "none" });
  eq("D3.9", "แถวไม่ระบุผู้ติดต่อ: 1 บรรทัด 1,000 (JV มือ) — ใบเดิมไม่ปนมา", [detNone.detail?.lines.map((l: Any) => l.debit), detNone.detail?.closing], [[1_000], 1_000]);
  const opening = await BR.subsidiaryLedger(ctx, { side: "AR", from: new Date("2026-11-25T00:00:00+07:00"), to: RN.to });
  eq("D3.10", "ยอดยกมาก็อนุมาน: ช่วงตั้งแต่ 25 พ.ย. ลูกค้า ข ยกมา 37,000", opening.rows.find((r: Any) => r.contactId === custB.id)?.opening, 37_000);

  console.log("\n── D4 บัญชีแยกประเภททุกบัญชี ──");
  const lb = await BR.ledgerBookAll(ctx, { from: new Date("2026-10-01T00:00:00+07:00"), to: RN.to });
  const arAcc = lb.find((a: Any) => a.id === ar.account.id);
  const dr = lb.reduce((s: number, a: Any) => s + a.debit, 0);
  const cr = lb.reduce((s: number, a: Any) => s + a.credit, 0);
  // ORACLE-EDIT (T5 Job 0): ยกไป 68,000 (เดิม 60,000) — บรรทัดลูกหนี้ที่ D3.6 เพิ่ม
  eq("D4.1", "ทุกบัญชี: Σ เดบิต = Σ เครดิต · บัญชีลูกหนี้ยกไป 68,000 · เรียงรหัส", [dr === cr, arAcc?.closing, lb.every((a: Any, i: number) => i === 0 || lb[i - 1].code <= a.code)], [true, 68_000, true]);
  const one = await BR.ledgerBookAll(ctx, { from: RN.from, to: RN.to }, ar.account.id);
  // ORACLE-EDIT (T5 Job 0): D3.6 เพิ่มบรรทัดลูกหนี้ 2 บรรทัด (7,000 + 1,000) ก่อนส่วนนี้ ⇒ 4 บรรทัด · ยกไป 68,000 (เดิม 2 · 60,000)
  eq("D4.2", "บัญชีเดียว (ลูกหนี้): ยกมา 50,000 · รายการ 4 บรรทัด · ยกไป 68,000", [one.length, one[0]?.opening, one[0]?.lines.length, one[0]?.closing], [1, 50_000, 4, 68_000]);
} catch (e) {
  chk("X", "ไม่มี exception", false, "no error", String((e as Error)?.stack ?? e));
} finally {
  if (prisma) await F.keepOrPurge(prisma, tid, KEEP);
  if (prisma) await prisma.$disconnect();
}

const fl = cks.filter((c) => !c.ok);
console.log(`\n===== QC ACC T4.2 สมุดบัญชีแบบเต็ม =====\nผ่าน ${cks.length - fl.length}/${cks.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - fl.length, findings: fl.map((c) => c.id) })}`);
process.exit(fl.length > 0 ? 1 : 0);
