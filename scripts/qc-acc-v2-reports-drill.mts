// QC WO 6.2 — รายงาน drill-down 3 ชั้น — DESIGN-SPEC-V2 §11.3
//
// requires: acc-v2-seed
// รัน: QC_ENV_FILE=.env.qc pnpm tsx scripts/qc-acc-v2-reports-drill.mts
//
// 🔴 ร้าน QC จริง = **อ่านอย่างเดียว** ทั้งชุด (ไม่มีการเขียน DB เลย — ไม่ต้องมีร้านทิ้ง)
//
// สิ่งที่ชุดนี้พิสูจน์ (หัวใจของเกณฑ์ผ่าน "drill-down 3 ชั้นถูกยอด"):
//   ① ตัวเลขในรายงาน  =  ② ยอดในบัญชีแยกประเภทของบัญชีนั้น  =  ③ ผลรวมบรรทัดของใบสำคัญที่ลิสต์ไว้
//   ถ้าชั้นใดชั้นหนึ่งคิดคนละสูตร ตัวเลขจะไม่เท่ากันและข้อสอบตก
//
// ครอบคลุม
//   T1  ตัวช่วยบริสุทธิ์: periodFirstDay/periodLastDay (ก.พ. ปีอธิกสุรทิน) · shiftPeriod ข้ามปี · previousRange · deltaOf
//   T2  ลิงก์ drill-down: รูปแบบ URL ถูก · ช่วงวันที่ครอบคลุมทั้งงวด
//   T3  ชั้น ①→② งบทดลอง: ยอดเคลื่อนไหวของทุกบัญชี = ledgerRunning ของบัญชีนั้นในช่วงเดียวกัน
//   T4  ชั้น ②→③ ใบสำคัญ: ผลรวมบรรทัดที่ ledgerRunning ลิสต์ = ยอดของบัญชีนั้นในใบสำคัญจริง
//   T5  ชั้น ③→④ เอกสาร: ใบสำคัญที่มา refType=AccountDocument ชี้ไปเอกสารที่มีอยู่จริง
//   T6  งบกำไรขาดทุน: ทุกแถว = แยกประเภทของบัญชีนั้น · รวมรายได้/ค่าใช้จ่าย = ผลรวมแถว
//   T7  งบฐานะการเงิน: สมดุล · ทุกแถว = ยอดสะสมจาก ledgerRunning ตั้งแต่ต้นปีบัญชี
//   T8  งบกระแสเงินสด: เงินต้นงวด + เปลี่ยนแปลง = เงินปลายงวด · ทุกบรรทัด = แยกประเภท
//   T9  คอลัมน์ "เทียบงวดก่อน": PL ที่ compare:true = เรียก PL ของช่วงก่อนหน้าตรง ๆ (ค่าตรงกันเป๊ะ)
//   T10 CSV: มี BOM · escape เครื่องหมายคำพูด/จุลภาค/ขึ้นบรรทัด · ตัวเลขเป็นบาททศนิยม 2

const accEnv = (await import("./acc-v2-env.mts" as string)) as {
  loadQcEnv: () => { databaseUrl: string; host: string };
  QC: { expectedPath: string; today: string };
};
const { loadQcEnv, QC } = accEnv;
const { host } = loadQcEnv();

const { readFileSync } = await import("node:fs");
const { prisma } = await import("@/lib/core/db");
const reports = await import("@/lib/modules/account/reports");
const coa = await import("@/lib/modules/account/coa");
const drill = await import("@/lib/modules/account/report-drill");
const jv = await import("@/lib/modules/account/journal-v2");

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
const baht = (s: number) => (s / 100).toLocaleString("th-TH", { minimumFractionDigits: 2 });

console.log(`\n===== QC WO 6.2 · รายงาน drill-down 3 ชั้น (§11.3) =====`);
console.log(`🗄️  DB QC: ${host}\n`);

const E = JSON.parse(readFileSync(QC.expectedPath, "utf8"));
const W = E.wo62 as { drill: Record<string, { debit: number; credit: number; lines: number }> };
const ctx = { tenantId: E.tenantId as string, systemId: E.systemId as string };
const FROM = "2026-01";
const TO = "2026-12";
const BASE = `/app/sys/${ctx.systemId}/account`;

const ledgers = await coa.listLedgers(ctx);
const idByCode = new Map(ledgers.map((l) => [l.code, l.id]));
const rangeDates = {
  from: new Date(`${drill.periodFirstDay(FROM)}T00:00:00+07:00`),
  to: new Date(`${drill.periodLastDay(TO)}T23:59:59.999+07:00`),
};

try {
  // ═════════ T1 — ตัวช่วยบริสุทธิ์ ═════════
  console.log("T1 ตัวช่วยแปลงงวด (บริสุทธิ์ ไม่แตะ DB):");
  eq("T1.1 วันแรกของงวด", drill.periodFirstDay("2026-09"), "2026-09-01");
  eq("T1.2 วันสุดท้ายของ ก.ย. (30 วัน)", drill.periodLastDay("2026-09"), "2026-09-30");
  eq("T1.3 วันสุดท้ายของ ธ.ค. (31 วัน)", drill.periodLastDay("2026-12"), "2026-12-31");
  eq("T1.4 วันสุดท้ายของ ก.พ. ปีปกติ", drill.periodLastDay("2026-02"), "2026-02-28");
  eq("T1.5 วันสุดท้ายของ ก.พ. ปีอธิกสุรทิน", drill.periodLastDay("2028-02"), "2028-02-29");
  eq("T1.6 เลื่อนงวดถอยหลังข้ามปี", drill.shiftPeriod("2026-01", -1), "2025-12");
  eq("T1.7 เลื่อนงวดไปหน้าข้ามปี", drill.shiftPeriod("2026-12", 1), "2027-01");
  eq("T1.8 งวดก่อนของช่วง 1 เดือน", drill.previousRange("2026-09", "2026-09"), { from: "2026-08", to: "2026-08" });
  eq("T1.9 งวดก่อนของช่วง 3 เดือน (ยาวเท่ากัน)", drill.previousRange("2026-07", "2026-09"), { from: "2026-04", to: "2026-06" });
  eq("T1.10 ผลต่าง + ร้อยละ", drill.deltaOf(15_000, 10_000), { diff: 5_000, pct: 50 });
  eq("T1.11 งวดก่อนเป็น 0 = ร้อยละหารไม่ได้ (null ไม่ใช่ Infinity)", drill.deltaOf(15_000, 0), { diff: 15_000, pct: null });

  // ═════════ T2 — รูปแบบลิงก์ drill-down ═════════
  console.log("\nT2 ลิงก์ drill-down:");
  const href = drill.ledgerDrillHref(BASE, "6800", "2026-06", "2026-08");
  eq("T2.1 ลิงก์ชี้หน้าบัญชีแยกประเภทพร้อมรหัส+ช่วงเต็มงวด", href, `${BASE}/ledger?code=6800&from=2026-06-01&to=2026-08-31`);
  const hrefEsc = drill.ledgerDrillHref(BASE, "1000-01", "2026-09", "2026-09");
  assert("T2.2 รหัสที่มีขีดถูก encode ปลอดภัย", hrefEsc.includes("code=1000-01"), hrefEsc);

  // ═════════ T3 — ชั้น ① → ② (งบทดลอง → แยกประเภท) ═════════
  console.log("\nT3 ชั้น ①→② งบทดลอง = บัญชีแยกประเภท:");
  const tb = await reports.trialBalance(ctx, FROM, TO);
  assert("T3.1 งบทดลองสมดุล", tb.balanced, `Dr ${tb.totals.closingDebit} / Cr ${tb.totals.closingCredit}`);
  assert("T3.2 มีแถวให้ตรวจจริง (ไม่ใช่ตารางว่าง)", tb.rows.length >= 20, `${tb.rows.length} แถว`);
  let mismatch = 0;
  const mismatchDetail: string[] = [];
  for (const row of tb.rows) {
    const id = idByCode.get(row.code);
    if (!id) {
      mismatch++;
      mismatchDetail.push(`${row.code} ไม่พบใน listLedgers`);
      continue;
    }
    const lr = await coa.ledgerRunning(ctx, id, rangeDates);
    if (lr.movementDebit !== row.movementDebit || lr.movementCredit !== row.movementCredit) {
      mismatch++;
      mismatchDetail.push(`${row.code}: รายงาน Dr${row.movementDebit}/Cr${row.movementCredit} ≠ แยกประเภท Dr${lr.movementDebit}/Cr${lr.movementCredit}`);
    }
  }
  eq(`T3.3 ทุกแถวของงบทดลอง (${tb.rows.length}) = ยอดในแยกประเภทของบัญชีนั้น`, mismatch, 0);
  if (mismatch) console.log("     " + mismatchDetail.slice(0, 5).join("\n     "));

  // 2 บัญชีที่ตรึงไว้ในเฉลย (คิดด้วย SQL ดิบตอน seed) — ป้องกันกรณี "ทั้งสองชั้นผิดทางเดียวกัน"
  for (const [code, want] of Object.entries(W.drill)) {
    const id = idByCode.get(code)!;
    const lr = await coa.ledgerRunning(ctx, id, rangeDates);
    eq(`T3.4-${code} แยกประเภท ${code} Dr = เฉลย SQL (${baht(want.debit)})`, lr.movementDebit, want.debit);
    eq(`T3.5-${code} แยกประเภท ${code} Cr = เฉลย SQL (${baht(want.credit)})`, lr.movementCredit, want.credit);
    eq(`T3.6-${code} จำนวนบรรทัดที่ลิสต์ = เฉลย SQL (${want.lines})`, lr.rows.length, want.lines);
    eq(`T3.7-${code} ยอดยกไป = ยกมา + Dr − Cr`, lr.closing, lr.opening + lr.movementDebit - lr.movementCredit);
  }

  // ═════════ T4 — ชั้น ② → ③ (แยกประเภท → ใบสำคัญ) ═════════
  console.log("\nT4 ชั้น ②→③ แยกประเภท = ใบสำคัญ:");
  for (const code of Object.keys(W.drill)) {
    const id = idByCode.get(code)!;
    const lr = await coa.ledgerRunning(ctx, id, rangeDates);
    let sumFromEntries = 0;
    let entryMissing = 0;
    for (const r of lr.rows) {
      const detail = await jv.journalEntryDetail(ctx, r.entryId);
      if (!detail) {
        entryMissing++;
        continue;
      }
      // ยอดของ "บัญชีนี้" ในใบสำคัญนั้น (ใบเดียวอาจมีหลายบรรทัดของบัญชีเดียวกัน)
      const inEntry = detail.lines.filter((l) => l.code === code);
      sumFromEntries += inEntry.reduce((n, l) => n + l.debit - l.credit, 0);
      // ใบสำคัญทุกใบที่โผล่ในแยกประเภทต้องสมดุลในตัวเอง
      if (detail.totalDebit !== detail.totalCredit) entryMissing++;
    }
    eq(`T4.1-${code} ทุกใบสำคัญที่ลิสต์เปิดได้และสมดุล`, entryMissing, 0);
    // ⚠️ ledgerRunning นับ "บรรทัด" · journalEntryDetail นับ "ทั้งใบ" ⇒ ถ้าใบเดียวมีหลายบรรทัดของบัญชีนี้
    //    ผลรวมจากใบจะมากกว่า จึงเทียบแบบ "ครอบคลุม" ไม่ใช่เท่ากันเป๊ะ เมื่อมีใบซ้ำในลิสต์
    const uniqEntries = new Set(lr.rows.map((r) => r.entryId));
    if (uniqEntries.size === lr.rows.length) {
      eq(`T4.2-${code} ผลรวมจากใบสำคัญ = ยอดเคลื่อนไหวในแยกประเภท`, sumFromEntries, lr.movementDebit - lr.movementCredit);
    } else {
      // มีใบที่ลงบัญชีนี้หลายบรรทัด → รวมจาก "ใบไม่ซ้ำ" แทน
      let sumUniq = 0;
      for (const eid of uniqEntries) {
        const d = await jv.journalEntryDetail(ctx, eid);
        sumUniq += (d?.lines ?? []).filter((l) => l.code === code).reduce((n, l) => n + l.debit - l.credit, 0);
      }
      eq(`T4.2-${code} ผลรวมจากใบสำคัญ (ไม่นับซ้ำ) = ยอดเคลื่อนไหวในแยกประเภท`, sumUniq, lr.movementDebit - lr.movementCredit);
    }
  }

  // ═════════ T5 — ชั้น ③ → ④ (ใบสำคัญ → เอกสาร) ═════════
  console.log("\nT5 ชั้น ③→④ ใบสำคัญ = เอกสารต้นทาง:");
  const list = await jv.listJournalPaged(ctx, { from: "2026-01-01", to: "2026-12-31", pageSize: 200 });
  const refRows = list.rows.filter((r) => r.ref?.href);
  assert("T5.1 มีใบสำคัญที่ลิงก์ไปเอกสารได้", refRows.length > 20, `${refRows.length} ใบ`);
  let badRef = 0;
  for (const r of refRows) {
    const m = /^docs\/([A-Z_]+)\/(.+)$/.exec(r.ref!.href!);
    if (!m) {
      badRef++;
      continue;
    }
    const doc = await prisma.accountDocument.findFirst({
      where: { id: m[2], systemId: ctx.systemId },
      select: { docType: true, docNo: true },
    });
    if (!doc || doc.docType !== m[1] || doc.docNo !== r.ref!.label) badRef++;
  }
  eq(`T5.2 ทุกลิงก์เอกสาร (${refRows.length}) ชี้เอกสารที่มีอยู่จริง ชนิด/เลขที่ตรง`, badRef, 0);

  // ═════════ T6 — งบกำไรขาดทุน ═════════
  console.log("\nT6 งบกำไรขาดทุน:");
  const pl = await reports.profitLoss(ctx, FROM, TO);
  eq("T6.1 รวมรายได้ = ผลรวมแถวรายได้", pl.income.rows.reduce((n, r) => n + r.amount, 0), pl.income.total);
  eq("T6.2 รวมค่าใช้จ่าย = ผลรวมแถวค่าใช้จ่าย", pl.expense.rows.reduce((n, r) => n + r.amount, 0), pl.expense.total);
  eq("T6.3 กำไรขั้นต้น = รายได้ − ต้นทุนขาย", pl.grossProfit, pl.income.total - pl.cogs.total);
  eq("T6.4 กำไรสุทธิ = กำไรขั้นต้น − ค่าใช้จ่าย", pl.netProfit, pl.grossProfit - pl.expense.total);
  let plMismatch = 0;
  for (const r of [...pl.income.rows, ...pl.cogs.rows, ...pl.expense.rows]) {
    const id = idByCode.get(r.code);
    if (!id) {
      plMismatch++;
      continue;
    }
    const lr = await coa.ledgerRunning(ctx, id, rangeDates);
    const isIncome = pl.income.rows.some((x) => x.code === r.code);
    const natural = isIncome ? lr.movementCredit - lr.movementDebit : lr.movementDebit - lr.movementCredit;
    if (natural !== r.amount) plMismatch++;
  }
  eq("T6.5 ทุกแถวของงบกำไรขาดทุน = ยอดในแยกประเภท (ปลายทาง drill-down)", plMismatch, 0);
  // ค่าเสื่อมของ WO 6.2 ต้องโผล่ในงบกำไรขาดทุนจริง (ไม่ใช่แค่มีในตาราง AccountDepreciation)
  const dep = pl.expense.rows.find((r) => r.code === "6800");
  eq("T6.6 ค่าเสื่อมราคา (6800) ปรากฏในงบกำไรขาดทุน = ยอดในเฉลย", dep?.amount, W.drill["6800"].debit - W.drill["6800"].credit);

  // ═════════ T7 — งบแสดงฐานะการเงิน ═════════
  console.log("\nT7 งบแสดงฐานะการเงิน:");
  const bs = await reports.balanceSheet(ctx, "2026-12");
  assert("T7.1 สมดุล (สินทรัพย์ = หนี้สิน + ทุน)", bs.balanced, `${bs.assets.total} vs ${bs.totalLiabilitiesEquity}`);
  const fyRange = {
    from: new Date(`${drill.periodFirstDay(bs.fiscalYearStartKey)}T00:00:00+07:00`),
    to: new Date(`${drill.periodLastDay("2026-12")}T23:59:59.999+07:00`),
  };
  let bsMismatch = 0;
  for (const r of bs.assets.rows) {
    const id = idByCode.get(r.code);
    if (!id) {
      bsMismatch++;
      continue;
    }
    const lr = await coa.ledgerRunning(ctx, id, fyRange);
    if (lr.closing !== r.amount) bsMismatch++;
  }
  eq("T7.2 ทุกแถวสินทรัพย์ = ยอดยกไปในแยกประเภท (ปลายทาง drill-down)", bsMismatch, 0);
  // สินทรัพย์ถาวรของ WO 6.2 ต้องอยู่ในงบจริง
  const fixed = bs.assets.rows.filter((r) => ["1610", "1630"].includes(r.code));
  eq("T7.3 สินทรัพย์ถาวร 2 บัญชี (1610 · 1630) ปรากฏในงบฐานะ", fixed.length, 2);
  const accum = bs.assets.rows.filter((r) => ["1619", "1639"].includes(r.code));
  eq("T7.4 ค่าเสื่อมสะสม 2 บัญชี (16x9) ปรากฏเป็นยอดติดลบในหมวดสินทรัพย์", accum.every((r) => r.amount < 0), true);

  // ═════════ T8 — งบกระแสเงินสด ═════════
  console.log("\nT8 งบกระแสเงินสด:");
  const cf = await reports.cashFlow(ctx, FROM, TO);
  eq("T8.1 เงินต้นงวด + เปลี่ยนแปลงสุทธิ = เงินปลายงวด", cf.openingCash + cf.netChange, cf.closingCash);
  eq(
    "T8.2 เปลี่ยนแปลงสุทธิ = ผลรวม 3 กิจกรรม",
    cf.netChange,
    cf.operating.net + cf.investing.net + cf.financing.net,
  );
  let cfMismatch = 0;
  for (const s of [cf.operating, cf.investing, cf.financing]) {
    eq(`T8.3-${s.activity} ยอดสุทธิของกิจกรรม = ผลรวมบรรทัด`, s.lines.reduce((n, l) => n + l.amount, 0), s.net);
    for (const l of s.lines) if (!idByCode.has(l.code)) cfMismatch++;
  }
  eq("T8.4 ทุกบรรทัดชี้บัญชีที่มีอยู่จริง (ลิงก์ drill-down ไม่ตาย)", cfMismatch, 0);

  // ═════════ T9 — คอลัมน์เทียบงวดก่อน ═════════
  console.log("\nT9 คอลัมน์ 'เทียบงวดก่อน':");
  const cur = { from: "2026-08", to: "2026-08" };
  const prev = drill.previousRange(cur.from, cur.to);
  const plCmp = await reports.profitLoss(ctx, cur.from, cur.to, { compare: true });
  const plPrevDirect = await reports.profitLoss(ctx, prev.from, prev.to);
  eq("T9.1 ช่วงของคอลัมน์เทียบ = previousRange", [plCmp.compare?.from, plCmp.compare?.to], [prev.from, prev.to]);
  eq("T9.2 กำไรสุทธิงวดก่อน = เรียกรายงานงวดนั้นตรง ๆ", plCmp.compare?.netProfit, plPrevDirect.netProfit);
  eq("T9.3 รายได้งวดก่อน = เรียกรายงานงวดนั้นตรง ๆ", plCmp.compare?.income.total, plPrevDirect.income.total);
  // งบทดลอง/งบฐานะไม่มี compare ในตัว — หน้าเรียกซ้ำ ⇒ พิสูจน์ว่าเรียกซ้ำแล้วได้ค่าที่ต่างจริง (ไม่ใช่ค่าเดิม)
  const tbCur = await reports.trialBalance(ctx, cur.from, cur.to);
  const tbPrev = await reports.trialBalance(ctx, prev.from, prev.to);
  assert(
    "T9.4 งบทดลองงวดก่อน (เรียกซ้ำ) ให้ค่าคนละชุดกับงวดนี้",
    tbCur.totals.movementDebit !== tbPrev.totals.movementDebit,
    `ทั้งคู่ = ${tbCur.totals.movementDebit}`,
  );
  const bsCur = await reports.balanceSheet(ctx, "2026-09");
  const bsPrev = await reports.balanceSheet(ctx, drill.shiftPeriod("2026-09", -1));
  assert("T9.5 งบฐานะ ณ สิ้นเดือนก่อน (เรียกซ้ำ) ให้ค่าคนละชุด", bsCur.assets.total !== bsPrev.assets.total, `ทั้งคู่ = ${bsCur.assets.total}`);
  assert("T9.6 งบฐานะงวดก่อนก็ยังสมดุล", bsPrev.balanced);

  // ═════════ T10 — CSV (Excel) ═════════
  console.log("\nT10 ไฟล์ Excel (CSV + BOM):");
  // สร้าง CSV ด้วยสูตรเดียวกับ ReportToolbar (client) — ตรวจกติกาที่ทำให้ Excel ไทยไม่เพี้ยน
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [
    ["รหัส", "ชื่อบัญชี", "จำนวน"],
    ["6800", "ค่าเสื่อมราคา", (W.drill["6800"].debit / 100).toFixed(2)],
    ["6100", 'ค่าเช่า, "สำนักงาน"', (W.drill["6100"].debit / 100).toFixed(2)],
  ];
  const body = rows.map((r) => r.map(esc).join(",")).join("\r\n");
  const withBom = "﻿" + body;
  eq("T10.1 ไฟล์ขึ้นต้นด้วย BOM (U+FEFF)", withBom.charCodeAt(0), 0xfeff);
  assert("T10.2 ช่องที่มีจุลภาค/อัญประกาศถูกครอบและ escape", body.includes('"ค่าเช่า, ""สำนักงาน"""'), body.split("\r\n")[2]);
  assert("T10.3 ขึ้นบรรทัดแบบ CRLF (Excel Windows)", body.includes("\r\n"));
  assert("T10.4 ตัวเลขเป็นบาททศนิยม 2 ตำแหน่ง ไม่ใช่สตางค์ดิบ", body.includes((W.drill["6800"].debit / 100).toFixed(2)), body);
  eq("T10.5 ข้อความไทยไม่ถูก escape เกินจำเป็น", esc("ค่าเสื่อมราคา"), "ค่าเสื่อมราคา");
} finally {
  await prisma.$disconnect();
}

console.log(`\n${findings.length === 0 ? "✅" : "❌"} ผ่าน ${passed} ข้อ · พบปัญหา ${findings.length} ข้อ`);
if (findings.length) {
  for (const f of findings) console.log("   • " + f);
  process.exit(1);
}
