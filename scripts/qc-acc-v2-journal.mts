// QC WO 6.2 — สมุดรายวัน V2 — DESIGN-SPEC-V2 §11.2 · เฟรม g16-journal.png + g16-journal-modal.png
//
// requires: acc-v2-seed (บล็อก 8.10 — JV มือ 1 · ⚑ 1 · คู่กลับรายการ 1 · ปิดงวด 2026-08)
// รัน (บังคับ DB QC branch):
//   QC_ENV_FILE=.env.qc pnpm tsx scripts/seed-acc-v2-qc.mts
//   QC_ENV_FILE=.env.qc pnpm tsx scripts/qc-acc-v2-journal.mts
//
// 🔴 ร้าน QC จริง (SIAM DIVE QC) = **อ่านอย่างเดียว** — การเขียนทั้งหมด (สร้าง JV · ไม่สมดุล · งวดปิด ·
//    กลับรายการ · ธง · guard · แยกร้าน) เกิดใน "ร้านทิ้ง" ที่สคริปต์สร้างเองแล้วลบใน finally
//
// ครอบคลุม
//   T1  รายการ/แท็บ: ตัวนับต่อสมุด = เฉลย SQL อิสระ · ผลรวมทุกแท็บ = ทั้งหมด · เรียงใหม่→เก่า
//   T2  ตัวกรอง: ช่วงวันที่ (ขอบวันสุดท้ายต้องรวม) · ค้นหาเลขที่ JV · ค้นหาคำอธิบาย · เฉพาะ ⚑
//   T3  แบ่งหน้า ฝั่ง server: หน้า 1+2 ไม่ซ้ำกัน · pageCount ถูก · ยอดรวมท้ายตารางเป็นของทั้งชุด ไม่ใช่หน้าเดียว
//   T4  แถวขยาย: บรรทัดย่อยรวม Dr = Cr ทุกใบ · ป้ายบัญชีพัก 9999 ติดถูกใบ · ผู้บันทึก/อ้างอิงเอกสาร
//   T5  ตรรกะบริสุทธิ์: jvTotals · validateManualJv (ไม่สมดุล/1 บรรทัด/ติดลบ/Dr+Cr พร้อมกัน/วันที่ผิด)
//   T6  ร้านทิ้ง — สร้าง JV สมดุล: ลงจริง · เลขรัน · ผู้บันทึก · source MANUAL · ยอดตรง
//   T7  ร้านทิ้ง — JV ไม่สมดุล / บรรทัดเดียว / บัญชีร้านอื่น / บัญชีปิดใช้งาน = **บันทึกไม่ได้**
//   T8  ร้านทิ้ง — งวดปิดแล้วลง JV ย้อนหลังไม่ได้ · เปิดงวดใหม่แล้วลงได้
//   T9  ร้านทิ้ง — กลับรายการ: ใบเดิม REVERSED · ขากลับสลับ Dr/Cr · กลับซ้ำไม่เบิ้ล · ยอดสุทธิ = 0
//   T10 ร้านทิ้ง — ธง ⚑: ติด/ปลด · flagNote · ติดแล้วปิดงวดไม่ได้ · ปลดแล้วปิดได้
//   T11 guard: staff ที่ไม่มี account.journal.adjust / account.journal.view ถูกปฏิเสธ
//   T12 แยกร้าน: อ่าน/แก้ใบสำคัญของอีกร้านไม่ได้ (IDOR)

const accEnv = (await import("./acc-v2-env.mts" as string)) as {
  loadQcEnv: () => { databaseUrl: string; host: string };
  QC: { expectedPath: string; today: string };
  resolveAccV2Scope: (p: unknown) => Promise<{ tenantId: string; systemId: string } | null>;
};
const { loadQcEnv, QC } = accEnv;
const { host } = loadQcEnv();

const { readFileSync } = await import("node:fs");
const { prisma } = await import("@/lib/core/db");
const sysMod = await import("@/lib/modules/system/service");
const glMod = await import("@/lib/modules/account/gl");
const jv = await import("@/lib/modules/account/journal-v2");
const periodClose = await import("@/lib/modules/account/period-close");
const { assertAccountCan } = await import("@/lib/modules/account/access");

let passed = 0;
const findings: string[] = [];
const ok = (name: string) => {
  passed++;
  console.log("  ✅ " + name);
};
const bad = (name: string, detail: string) => {
  findings.push(`${name} — ${detail}`);
  console.log("  ❌ " + name + " — " + detail);
};
const assert = (name: string, cond: boolean, detail = "") => (cond ? ok(name) : bad(name, detail));
const eq = (name: string, actual: unknown, expected: unknown) => {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  assert(name, a === b, `ได้ ${a} · ควรได้ ${b}`);
};
/** คาดว่า "ต้องถูกปฏิเสธ" — ok:false หรือโยน error ก็นับว่าผ่าน */
const rejected = async (name: string, fn: () => Promise<{ ok: boolean; reason?: string }>, contains?: string) => {
  try {
    const r = await fn();
    if (r.ok) return bad(name, "ผ่านทั้งที่ควรถูกปฏิเสธ");
    if (contains && !(r.reason ?? "").includes(contains)) return bad(name, `เหตุผล "${r.reason}" ไม่มีคำว่า "${contains}"`);
    return ok(name);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (contains && !msg.includes(contains)) return bad(name, `error "${msg}" ไม่มีคำว่า "${contains}"`);
    return ok(name);
  }
};

console.log(`\n===== QC WO 6.2 · สมุดรายวัน V2 (§11.2 · g16) =====`);
console.log(`🗄️  DB QC: ${host}\n`);

const E = JSON.parse(readFileSync(QC.expectedPath, "utf8"));
const W = E.wo62 as {
  entries: number;
  manualEntries: number;
  byBook: Record<string, number>;
  debitByBook: Record<string, number>;
  suspenseCredit: number;
  fixtures: Record<string, string>;
  periods: { closed: string[]; open: string };
};
const scope = { tenantId: E.tenantId as string, systemId: E.systemId as string };

let sTenantId: string | null = null;
try {
  // ═════════ T1 — รายการ + แท็บ (อ่านอย่างเดียวจากร้าน QC จริง) ═════════
  console.log("T1 รายการ/แท็บสมุด:");
  const all = await jv.listJournalPaged(scope, { from: "2026-01-01", to: "2026-12-31", pageSize: 200 });
  eq("T1.1 จำนวนใบสำคัญทั้งหมด = เฉลย", all.total, W.entries);
  eq("T1.2 ตัวนับแท็บ 'ทั้งหมด' = ผลรวมทุกเล่ม", all.tabCounts.ALL, Object.values(W.byBook).reduce((n, x) => n + x, 0));
  for (const [book, cnt] of Object.entries(W.byBook)) eq(`T1.3-${book} ตัวนับแท็บ ${book} = เฉลย`, all.tabCounts[book], cnt);
  const gen = await jv.listJournalPaged(scope, { book: "GENERAL", from: "2026-01-01", to: "2026-12-31", pageSize: 200 });
  eq("T1.4 กรองแท็บ 'ทั่วไป' ได้เฉพาะเล่มนั้น", new Set(gen.rows.map((r) => r.book)).size <= 1 && gen.total, W.byBook.GENERAL);
  eq("T1.5 ยอดเดบิตรวมของเล่ม 'ทั่วไป' = เฉลย SQL", gen.sumDebit, W.debitByBook.GENERAL);
  const desc = all.rows.every((r, i) => i === 0 || all.rows[i - 1].date >= r.date);
  assert("T1.6 เรียงวันที่ใหม่→เก่า", desc);
  eq("T1.7 ทุกใบมีป้ายสมุดเป็นภาษาไทย", [...new Set(all.rows.map((r) => r.bookLabel))].sort(), ["ขาย", "จ่าย", "ซื้อ", "รับ", "ทั่วไป"].sort());

  // ═════════ T2 — ตัวกรอง ═════════
  console.log("\nT2 ตัวกรอง (ช่วงวันที่ · ค้นหา · ⚑):");
  const flagged = await prisma.accountJournalEntry.findFirstOrThrow({
    where: { systemId: scope.systemId, needsReview: true },
    select: { id: true, docNo: true, memo: true, date: true },
  });
  const dayKey = flagged.date.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
  const oneDay = await jv.listJournalPaged(scope, { from: dayKey, to: dayKey, pageSize: 200 });
  assert(
    "T2.1 ช่วงวันที่วันเดียว: ขอบวันสุดท้ายรวมรายการของวันนั้นครบ (ไม่ตัดทิ้ง)",
    oneDay.rows.some((r) => r.id === flagged.id),
    `ไม่เจอ ${flagged.docNo} ในช่วง ${dayKey}–${dayKey}`,
  );
  const byNo = await jv.listJournalPaged(scope, { q: flagged.docNo, from: "2026-01-01", to: "2026-12-31" });
  eq("T2.2 ค้นหาด้วยเลขที่ JV เจอใบเดียว", byNo.total, 1);
  const byMemo = await jv.listJournalPaged(scope, { q: "ค่าเช่าสำนักงาน", from: "2026-01-01", to: "2026-12-31" });
  assert("T2.3 ค้นหาด้วยคำอธิบายไทยเจอ", byMemo.total >= 1, `ได้ ${byMemo.total}`);
  const byNone = await jv.listJournalPaged(scope, { q: "ไม่มีคำนี้แน่นอน-zzz", from: "2026-01-01", to: "2026-12-31" });
  eq("T2.4 ค้นหาไม่เจอ = 0 แถว (ไม่ใช่คืนทั้งหมด)", byNone.total, 0);
  const onlyFlag = await jv.listJournalPaged(scope, { needsReview: true, from: "2026-01-01", to: "2026-12-31" });
  eq("T2.5 ตัวกรอง 'เฉพาะ ⚑ ต้องตรวจ'", [onlyFlag.total, onlyFlag.rows[0]?.id], [1, flagged.id]);
  // ช่วงที่ไม่มีข้อมูลจริง — ยืนยันด้วย SQL อิสระก่อนว่าเป็น 0 จริง (ไม่ฮาร์ดโค้ดเดือนที่เดาเอา)
  const emptyRange = { from: "2025-01-01", to: "2025-01-31" };
  const sqlEmpty = await prisma.accountJournalEntry.count({
    where: { systemId: scope.systemId, date: { gte: new Date("2025-01-01T00:00:00+07:00"), lt: new Date("2025-02-01T00:00:00+07:00") } },
  });
  eq("T2.6a ช่วงอ้างอิงไม่มีข้อมูลจริง (positive control ด้วย SQL)", sqlEmpty, 0);
  const outRange = await jv.listJournalPaged(scope, emptyRange);
  eq("T2.6b ช่วงที่ไม่มีข้อมูล = 0 แถว", outRange.total, 0);
  // ขอบล่าง/บนของช่วงต้อง "รวม" วันนั้นเสมอ — เทียบกับ SQL ที่นับด้วยเงื่อนไขเดียวกันคนละสำนวน
  const sqlSept = await prisma.accountJournalEntry.count({
    where: { systemId: scope.systemId, date: { gte: new Date("2026-09-01T00:00:00+07:00"), lt: new Date("2026-10-01T00:00:00+07:00") } },
  });
  const septList = await jv.listJournalPaged(scope, { from: "2026-09-01", to: "2026-09-30", pageSize: 200 });
  eq("T2.7 กรองทั้งเดือน ก.ย. = SQL อิสระ (ขอบวันแรก/วันสุดท้ายรวมครบ)", septList.total, sqlSept);

  // ═════════ T3 — แบ่งหน้าฝั่ง server ═════════
  console.log("\nT3 แบ่งหน้า (ฝั่ง server):");
  const p1 = await jv.listJournalPaged(scope, { from: "2026-01-01", to: "2026-12-31", page: 1, pageSize: 10 });
  const p2 = await jv.listJournalPaged(scope, { from: "2026-01-01", to: "2026-12-31", page: 2, pageSize: 10 });
  eq("T3.1 หน้าละ 10 แถวจริง", [p1.rows.length, p2.rows.length], [10, 10]);
  eq("T3.2 หน้า 1 กับ 2 ไม่มีแถวซ้ำกัน", p1.rows.filter((r) => p2.rows.some((x) => x.id === r.id)).length, 0);
  eq("T3.3 จำนวนหน้า = ceil(total / pageSize)", p1.pageCount, Math.ceil(W.entries / 10));
  eq("T3.4 ยอดรวมท้ายตารางเป็นของทั้งชุด ไม่ใช่แค่หน้านี้", [p1.sumDebit, p2.sumDebit], [all.sumDebit, all.sumDebit]);
  eq("T3.5 ตัวนับแท็บไม่เปลี่ยนตามหน้า", p2.tabCounts.ALL, all.tabCounts.ALL);

  // ═════════ T4 — แถวขยาย (บรรทัดย่อย) ═════════
  console.log("\nT4 แถวขยาย + ป้าย:");
  const unbal = all.rows.filter((r) => r.totalDebit !== r.totalCredit);
  eq("T4.1 ทุกใบสมดุลรายใบ (Dr = Cr)", unbal.length, 0);
  const flagRow = all.rows.find((r) => r.id === flagged.id)!;
  assert("T4.2 ใบที่ติดธงมีบรรทัดบัญชีพัก 9999", flagRow.lines.some((l) => l.suspense && l.code === "9999"));
  eq("T4.3 ยอดบัญชีพักในใบนั้น = เฉลย", flagRow.lines.find((l) => l.suspense)?.credit, W.suspenseCredit);
  assert("T4.4 ใบที่ติดธงมีข้อความเหตุผล (flagNote)", !!flagRow.flagNote, String(flagRow.flagNote));
  const suspenseElsewhere = all.rows.filter((r) => r.id !== flagged.id && r.lines.some((l) => l.suspense));
  eq("T4.5 ป้ายบัญชีพักไม่ติดใบอื่นผิด ๆ", suspenseElsewhere.length, 0);
  const withRef = all.rows.filter((r) => r.ref?.href);
  assert("T4.6 มีใบที่คลิกทะลุไปเอกสารต้นทางได้", withRef.length > 20, `ได้ ${withRef.length}`);
  const manualRow = all.rows.find((r) => r.id === W.fixtures.manualJvId)!;
  eq("T4.7 JV มือมีชื่อผู้บันทึก (ไม่ใช่ 'ระบบ')", typeof manualRow?.postedByName === "string" && manualRow.postedByName.length > 0, true);
  eq("T4.8 JV มือมี source = MANUAL", manualRow?.source, "MANUAL");
  const reversedRow = all.rows.find((r) => r.id === W.fixtures.reversedJvId)!;
  eq("T4.9 ใบที่ถูกกลับรายการติดสถานะ reversed", [reversedRow?.reversed, reversedRow?.status], [true, "REVERSED"]);
  const reversalRow = all.rows.find((r) => r.id === W.fixtures.reversalJvId)!;
  eq("T4.10 ใบขากลับรู้ว่าตัวเองเป็นขากลับ", reversalRow?.isReversal, true);

  // drill-down ชั้นที่ ③ — รายละเอียดใบสำคัญ
  const detail = await jv.journalEntryDetail(scope, flagged.id);
  eq("T4.11 รายละเอียดใบสำคัญ: Dr = Cr", [detail?.totalDebit, detail?.totalCredit], [flagRow.totalDebit, flagRow.totalCredit]);
  eq("T4.12 รายละเอียดใบสำคัญ: ยอดตรงกับหน้ารายการ", detail?.totalDebit, flagRow.totalDebit);
  const revDetail = await jv.journalEntryDetail(scope, W.fixtures.reversedJvId);
  eq("T4.13 ใบเดิมชี้ไปใบขากลับได้", revDetail?.reversedBy?.id, W.fixtures.reversalJvId);

  // ═════════ T5 — ตรรกะบริสุทธิ์ ═════════
  console.log("\nT5 ตรรกะบริสุทธิ์ (ไม่แตะ DB):");
  eq("T5.1 jvTotals: สมดุล 2 บรรทัด", jv.jvTotals([{ accountId: "a", debit: 500, credit: 0 }, { accountId: "b", debit: 0, credit: 500 }]).balanced, true);
  eq("T5.2 jvTotals: ไม่สมดุล", jv.jvTotals([{ accountId: "a", debit: 500, credit: 0 }, { accountId: "b", debit: 0, credit: 400 }]).balanced, false);
  eq("T5.3 jvTotals: บรรทัดเดียว = ไม่ผ่าน", jv.jvTotals([{ accountId: "a", debit: 500, credit: 500 }]).balanced, false);
  const base = { dateKey: "2026-09-30", lines: [{ accountId: "a", debit: 500, credit: 0 }, { accountId: "b", debit: 0, credit: 500 }] };
  eq("T5.4 validate: อินพุตถูกต้อง = ผ่าน", jv.validateManualJv(base), null);
  eq("T5.5 validate: ไม่สมดุล = ข้อความไทย", jv.validateManualJv({ ...base, lines: [{ accountId: "a", debit: 500, credit: 0 }, { accountId: "b", debit: 0, credit: 400 }] }), "ยังไม่สมดุล — เดบิตรวมต้องเท่ากับเครดิตรวม");
  eq("T5.6 validate: บรรทัดเดียว = ปฏิเสธ", jv.validateManualJv({ ...base, lines: [{ accountId: "a", debit: 500, credit: 500 }] }), "ต้องมีบรรทัดรายการอย่างน้อย 2 บรรทัด");
  eq("T5.7 validate: ติดลบ = ปฏิเสธ", jv.validateManualJv({ ...base, lines: [{ accountId: "a", debit: -500, credit: 0 }, { accountId: "b", debit: 0, credit: -500 }] }), "จำนวนเงินติดลบไม่ได้");
  eq("T5.8 validate: บรรทัดเดียวลงทั้ง Dr และ Cr = ปฏิเสธ", jv.validateManualJv({ ...base, lines: [{ accountId: "a", debit: 500, credit: 500 }, { accountId: "b", debit: 0, credit: 500 }] }), "บรรทัดเดียวลงทั้งเดบิตและเครดิตไม่ได้");
  eq("T5.9 validate: วันที่ผิดรูปแบบ = ปฏิเสธ", jv.validateManualJv({ ...base, dateKey: "30/09/2026" }), "กรุณาระบุวันที่ให้ถูกต้อง");
  eq("T5.10 bookOfTab: แท็บทั้งหมด = ทุกเล่ม", jv.bookOfTab("ALL"), null);
  eq("T5.11 bookOfTab: ค่ามั่ว = ทุกเล่ม (ไม่ throw)", jv.bookOfTab("ZZZ"), null);
  eq("T5.12 bookOfTab: 'จ่าย'", jv.bookOfTab("PAYMENTS"), "PAYMENTS");

  // ═════════ ร้านทิ้ง ═════════
  console.log("\n── สร้างร้านทดสอบ (การเขียนทั้งหมด) ──");
  const stamp = Date.now();
  const tag = `qc-jv-${stamp}`;
  const t = await prisma.tenant.create({ data: { name: tag, slug: tag } });
  sTenantId = t.id;
  const tid = sTenantId;
  const owner = await prisma.user.create({ data: { email: `${tag}-owner@qc.local`, name: "QC เจ้าของ" } });
  const staff = await prisma.user.create({ data: { email: `${tag}-staff@qc.local`, name: "QC พนักงาน" } });
  await prisma.membership.create({ data: { userId: owner.id, tenantId: tid, role: "OWNER", unitAccess: ["*"] } });
  const mStaff = await prisma.membership.create({
    data: { userId: staff.id, tenantId: tid, role: "STAFF", unitAccess: ["*"], permissions: { "account.doc.view": true } },
  });
  const unit = await prisma.businessUnit.create({
    data: { tenantId: tid, type: "BOOKING", name: "สาขาทดสอบ", slug: `u-${stamp}`, status: "ACTIVE" },
  });
  const accSys = await sysMod.createSystem(tid, "ACCOUNT", "บัญชี " + tag);
  await sysMod.linkUnit(tid, accSys.id, unit.id);
  const S = { tenantId: tid, systemId: accSys.id };
  await glMod.ensureAccounting(S);
  const led = Object.fromEntries(
    (await prisma.accountLedger.findMany({ where: { systemId: S.systemId }, select: { id: true, code: true } })).map((l) => [l.code, l.id]),
  ) as Record<string, string>;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
  const curPeriod = today.slice(0, 7);

  // ═════════ T6 — สร้าง JV สมดุล ═════════
  console.log("\nT6 สร้าง JV มือ (สมดุล):");
  const r6 = await jv.createManualEntry(S, {
    dateKey: today,
    book: "GENERAL",
    memo: "ปรับปรุงค่าใช้จ่ายเบ็ดเตล็ด",
    postedById: owner.id,
    lines: [
      { accountId: led["6900"], debit: 500_000, credit: 0, note: "ค่าใช้จ่ายเบ็ดเตล็ด" },
      { accountId: led["1000"], debit: 0, credit: 500_000, note: "จ่ายเป็นเงินสด" },
    ],
  });
  assert("T6.1 JV สมดุล = บันทึกได้", r6.ok, r6.ok ? "" : r6.reason);
  const e6 = r6.ok ? await jv.journalEntryDetail(S, r6.entryId) : null;
  assert("T6.2 ได้เลขที่ JV อัตโนมัติ", !!e6?.docNo && e6.docNo.length > 5, e6?.docNo ?? "");
  eq("T6.3 source = MANUAL · journal = ADJUST", [e6?.source, e6?.journal], ["MANUAL", "ADJUST"]);
  eq("T6.4 ผู้บันทึกถูกเก็บไว้", e6?.postedByName, "QC เจ้าของ");
  eq("T6.5 ยอด Dr = Cr = 5,000.00", [e6?.totalDebit, e6?.totalCredit], [500_000, 500_000]);
  eq("T6.6 ลงในเล่ม 'ทั่วไป'", e6?.bookLabel, "ทั่วไป");
  const list6 = await jv.listJournalPaged(S, { from: today, to: today });
  eq("T6.7 ใบใหม่โผล่ในรายการทันที", list6.total >= 1, true);

  // ═════════ T7 — JV ที่ต้องบันทึกไม่ได้ ═════════
  console.log("\nT7 JV ที่ต้องบันทึกไม่ได้:");
  await rejected(
    "T7.1 ไม่สมดุล (Dr 5,000 ≠ Cr 4,000) = บันทึกไม่ได้",
    () => jv.createManualEntry(S, { dateKey: today, postedById: owner.id, lines: [
      { accountId: led["6900"], debit: 500_000, credit: 0 },
      { accountId: led["1000"], debit: 0, credit: 400_000 },
    ] }),
    "สมดุล",
  );
  await rejected(
    "T7.2 บรรทัดเดียว = บันทึกไม่ได้",
    () => jv.createManualEntry(S, { dateKey: today, postedById: owner.id, lines: [{ accountId: led["6900"], debit: 500_000, credit: 0 }] }),
    "อย่างน้อย 2 บรรทัด",
  );
  await rejected(
    "T7.3 ยอดเป็น 0 ทุกบรรทัด = บันทึกไม่ได้",
    () => jv.createManualEntry(S, { dateKey: today, postedById: owner.id, lines: [
      { accountId: led["6900"], debit: 0, credit: 0 },
      { accountId: led["1000"], debit: 0, credit: 0 },
    ] }),
  );
  await rejected(
    "T7.4 บัญชีของร้านอื่น (IDOR) = บันทึกไม่ได้",
    () => jv.createManualEntry(S, { dateKey: today, postedById: owner.id, lines: [
      { accountId: (E.coa.samples as { id: string }[])[0].id, debit: 100_000, credit: 0 },
      { accountId: led["1000"], debit: 0, credit: 100_000 },
    ] }),
    "นอกผังบัญชีของร้านนี้",
  );
  const archived = await prisma.accountLedger.create({
    data: { tenantId: tid, systemId: S.systemId, code: "6901", name: "บัญชีปิดใช้งาน", type: "EXPENSE", archivedAt: new Date() },
  });
  await rejected(
    "T7.5 บัญชีที่ปิดใช้งาน = บันทึกไม่ได้ พร้อมชื่อบัญชีในข้อความ",
    () => jv.createManualEntry(S, { dateKey: today, postedById: owner.id, lines: [
      { accountId: archived.id, debit: 100_000, credit: 0 },
      { accountId: led["1000"], debit: 0, credit: 100_000 },
    ] }),
    "ถูกปิดใช้งานแล้ว",
  );
  await rejected(
    "T7.6 วันที่ผิดรูปแบบ = บันทึกไม่ได้",
    () => jv.createManualEntry(S, { dateKey: "31/12/2026", postedById: owner.id, lines: [
      { accountId: led["6900"], debit: 100_000, credit: 0 },
      { accountId: led["1000"], debit: 0, credit: 100_000 },
    ] }),
  );
  const after7 = await prisma.accountJournalEntry.count({ where: { systemId: S.systemId } });
  eq("T7.7 ใบที่ถูกปฏิเสธไม่ทิ้งขยะไว้ใน DB (ยังมีแค่ใบเดียวของ T6)", after7, 1);

  // ═════════ T8 — งวดปิด ═════════
  console.log("\nT8 งวดที่ปิดแล้วลงบัญชีไม่ได้:");
  const prevMonth = (() => {
    const [y, m] = curPeriod.split("-").map(Number);
    return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  })();
  const prevDay = `${prevMonth}-15`;
  const rPrev = await jv.createManualEntry(S, { dateKey: prevDay, postedById: owner.id, lines: [
    { accountId: led["6900"], debit: 100_000, credit: 0 },
    { accountId: led["1000"], debit: 0, credit: 100_000 },
  ] });
  assert("T8.1 งวดก่อนยังเปิด = ลงได้", rPrev.ok, rPrev.ok ? "" : rPrev.reason);
  const closed = await periodClose.closePeriodWithChecklist(S, prevMonth, owner.id);
  assert("T8.2 ปิดงวดก่อนได้ (เช็กลิสต์บังคับผ่านหมด)", closed.ok, closed.ok ? "" : closed.reason);
  await rejected(
    "T8.3 งวดปิดแล้ว = ลง JV ย้อนหลังไม่ได้",
    () => jv.createManualEntry(S, { dateKey: prevDay, postedById: owner.id, lines: [
      { accountId: led["6900"], debit: 100_000, credit: 0 },
      { accountId: led["1000"], debit: 0, credit: 100_000 },
    ] }),
    "ปิดแล้ว",
  );
  const stillOpen = await jv.createManualEntry(S, { dateKey: today, postedById: owner.id, lines: [
    { accountId: led["6900"], debit: 100_000, credit: 0 },
    { accountId: led["1000"], debit: 0, credit: 100_000 },
  ] });
  assert("T8.4 งวดปัจจุบันยังเปิด = ยังลงได้ (ปิดงวดเก่าไม่ล็อกทั้งระบบ)", stillOpen.ok, stillOpen.ok ? "" : stillOpen.reason);
  const reopened = await periodClose.reopenPeriodV2(S, prevMonth, "ทดสอบเปิดงวดใหม่", owner.id);
  assert("T8.5 เปิดงวดใหม่ได้", reopened.ok, reopened.ok ? "" : reopened.reason);
  const rAfterReopen = await jv.createManualEntry(S, { dateKey: prevDay, postedById: owner.id, lines: [
    { accountId: led["6900"], debit: 100_000, credit: 0 },
    { accountId: led["1000"], debit: 0, credit: 100_000 },
  ] });
  assert("T8.6 เปิดงวดใหม่แล้วลงย้อนหลังได้อีกครั้ง", rAfterReopen.ok, rAfterReopen.ok ? "" : rAfterReopen.reason);
  await rejected("T8.7 เปิดงวดใหม่โดยไม่ระบุเหตุผล = ปฏิเสธ", () => periodClose.reopenPeriodV2(S, prevMonth, "  ", owner.id), "เหตุผล");

  // ═════════ T9 — กลับรายการ ═════════
  console.log("\nT9 กลับรายการ:");
  const target = r6.ok ? r6.entryId : "";
  const rev = await jv.reverseJournalEntry(S, target, "ลงผิดบัญชี");
  assert("T9.1 กลับรายการสำเร็จ", rev.ok, rev.ok ? "" : rev.reason);
  const orig = await jv.journalEntryDetail(S, target);
  eq("T9.2 ใบเดิมกลายเป็น REVERSED (ไม่ถูกลบ — สมุดแก้ไม่ได้)", orig?.status, "REVERSED");
  const revDet = rev.ok ? await jv.journalEntryDetail(S, rev.entryId) : null;
  eq("T9.3 ใบขากลับสลับ Dr/Cr ถูกต้อง", [revDet?.totalDebit, revDet?.totalCredit], [500_000, 500_000]);
  const origDrAcc = orig!.lines.find((l) => l.debit > 0)!.code;
  eq("T9.4 บัญชีที่เคยเดบิต กลายเป็นเครดิตในใบขากลับ", revDet!.lines.find((l) => l.code === origDrAcc)!.credit, 500_000);
  eq("T9.5 ใบขากลับผูกกับใบเดิม", revDet?.reversalOf?.id, target);
  await rejected("T9.6 กลับรายการซ้ำ = ปฏิเสธ (ไม่เบิ้ล)", () => jv.reverseJournalEntry(S, target, "กลับซ้ำ"), "ถูกกลับรายการไปแล้ว");
  await rejected("T9.7 กลับรายการโดยไม่ระบุเหตุผล = ปฏิเสธ", () => jv.reverseJournalEntry(S, stillOpen.ok ? stillOpen.entryId : "", "x"), "เหตุผล");
  // ยอดสุทธิของบัญชีที่ถูกกลับต้องเป็น 0 (ใบเดิม + ขากลับหักล้างกันพอดี)
  const netAgg = await prisma.accountJournalLine.aggregate({
    where: { systemId: S.systemId, entryId: { in: [target, rev.ok ? rev.entryId : ""] }, accountId: led["6900"] },
    _sum: { debit: true, credit: true },
  });
  eq("T9.8 ใบเดิม + ขากลับ = ยอดสุทธิ 0 (ทั้งคู่ยังนับในสมุด)", (netAgg._sum.debit ?? 0) - (netAgg._sum.credit ?? 0), 0);

  // ═════════ T10 — ธง ⚑ ═════════
  console.log("\nT10 ธง ⚑ ต้องตรวจ:");
  const flagTarget = stillOpen.ok ? stillOpen.entryId : "";
  const f1 = await jv.toggleNeedsReview(S, flagTarget, "ยอดไม่ตรงใบเสร็จ");
  eq("T10.1 ติดธงได้", f1.ok && f1.needsReview, true);
  const fRow = await prisma.accountJournalEntry.findUniqueOrThrow({ where: { id: flagTarget }, select: { needsReview: true, flagNote: true } });
  eq("T10.2 เก็บเหตุผลของธงไว้ (flagNote)", [fRow.needsReview, fRow.flagNote], [true, "ยอดไม่ตรงใบเสร็จ"]);
  const chkFlag = await periodClose.periodChecklist(S, curPeriod);
  eq("T10.3 ติดธงแล้ว = เช็กลิสต์ข้อ 'ไม่มี ⚑' ไม่ผ่าน", chkFlag.items.find((i) => i.key === "NEEDS_REVIEW")?.state, "FAIL");
  eq("T10.4 ติดธงแล้ว = ปิดงวดไม่ได้", chkFlag.canClose, false);
  await rejected("T10.5 gl ปฏิเสธการปิดงวดด้วย (ไม่ใช่แค่หน้าจอ)", () => periodClose.closePeriodWithChecklist(S, curPeriod, owner.id), "ต้องตรวจ");
  const f2 = await jv.toggleNeedsReview(S, flagTarget);
  eq("T10.6 ปลดธงได้", f2.ok && f2.needsReview, false);
  const fRow2 = await prisma.accountJournalEntry.findUniqueOrThrow({ where: { id: flagTarget }, select: { flagNote: true } });
  eq("T10.7 ปลดธงแล้วล้างเหตุผลด้วย", fRow2.flagNote, null);
  const chkAfter = await periodClose.periodChecklist(S, curPeriod);
  eq("T10.8 ปลดธงแล้วข้อนั้นกลับมาผ่าน", chkAfter.items.find((i) => i.key === "NEEDS_REVIEW")?.state, "PASS");
  await rejected("T10.9 ติดธงใบของร้านอื่นไม่ได้", () => jv.toggleNeedsReview(S, W.fixtures.manualJvId), "ไม่พบ");

  // ═════════ T11 — guard ═════════
  console.log("\nT11 สิทธิ์ (guard):");
  const authOf = (perms: Record<string, boolean>) =>
    ({ user: { id: staff.id }, active: { ...mStaff, permissions: perms, tenant: t } }) as never;
  const denied = (name: string, action: string, perms: Record<string, boolean>) => {
    try {
      assertAccountCan(authOf(perms), action);
      bad(name, "ผ่านทั้งที่ไม่ควรมีสิทธิ์");
    } catch {
      ok(name);
    }
  };
  denied("T11.1 staff ไม่มี account.journal.adjust = สร้าง JV ไม่ได้", "account.journal.adjust", { "account.doc.view": true });
  denied("T11.2 staff ไม่มี account.journal.view = เปิดหน้าสมุดรายวันไม่ได้", "account.journal.view", { "account.doc.view": true });
  try {
    assertAccountCan(authOf({ "account.journal.view": true }), "account.journal.view");
    ok("T11.3 staff ที่ได้รับสิทธิ์ดูสมุดรายวัน ผ่านด่าน");
  } catch (e) {
    bad("T11.3 staff ที่ได้รับสิทธิ์ดูสมุดรายวัน ผ่านด่าน", String(e));
  }

  // ═════════ T12 — แยกร้าน ═════════
  console.log("\nT12 แยกร้าน (IDOR):");
  const cross = await jv.journalEntryDetail(S, W.fixtures.flaggedJvId);
  eq("T12.1 อ่านใบสำคัญของร้านจริงจากบริบทร้านทดสอบไม่ได้", cross, null);
  const crossRev = await jv.reverseJournalEntry(S, W.fixtures.flaggedJvId, "พยายามกลับรายการข้ามร้าน");
  eq("T12.2 กลับรายการข้ามร้านไม่ได้", crossRev.ok, false);
  const crossList = await jv.listJournalPaged(S, { from: "2026-01-01", to: "2026-12-31", pageSize: 200 });
  eq("T12.3 รายการของร้านทดสอบไม่ปนใบของร้านจริง", crossList.rows.some((r) => r.id === W.fixtures.flaggedJvId), false);
  const stillThere = await prisma.accountJournalEntry.count({ where: { systemId: scope.systemId, id: W.fixtures.flaggedJvId, needsReview: true } });
  eq("T12.4 ใบของร้านจริงไม่ถูกแตะต้อง", stillThere, 1);
} finally {
  if (sTenantId) {
    console.log("\n[cleanup] ลบร้านทดสอบ");
    const d = async (fn: () => Promise<unknown>) => {
      try {
        await fn();
      } catch (e) {
        console.log(`  ⚠ cleanup: ${e instanceof Error ? e.message.split("\n")[0] : e}`);
      }
    };
    const tid = sTenantId;
    await d(() => prisma.accountJournalLine.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.accountJournalEntry.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.accountFinance.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.accountMapping.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.accountLedger.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.accountPeriod.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.accountSettings.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.auditLog.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.appSystemUnit.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.appSystem.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.membership.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.businessUnit.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.tenant.delete({ where: { id: tid } }));
  }
  await prisma.$disconnect();
}

console.log(`\n${findings.length === 0 ? "✅" : "❌"} ผ่าน ${passed} ข้อ · พบปัญหา ${findings.length} ข้อ`);
if (findings.length) {
  for (const f of findings) console.log("   • " + f);
  process.exit(1);
}
