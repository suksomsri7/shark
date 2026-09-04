// ─────────────────────────────────────────────────────────────
// acc-v2-fixture-bank-statement.mts — สร้างไฟล์ fixture "รายการเดินบัญชี" ของ QC (WO 5.3)
//
// 🔴 หลักการ: **สร้างจากบรรทัดสมุดรายวันจริงของ seed** ด้วย SQL อิสระ (ไม่เรียก reconcile.ts เลย)
//    ⇒ ไฟล์ไม่เน่าเมื่อ seed เปลี่ยน (รัน seed ใหม่ → สคริปต์นี้เขียนไฟล์ใหม่ให้เอง)
//    ⇒ "เฉลย" (จำนวนแถว/จำนวนที่ควรจับคู่ได้/ส่วนต่าง) คำนวณจาก SQL ชุดเดียวกัน ไม่ใช่จากตัวโปรแกรมที่กำลังทดสอบ
//
// ผลลัพธ์ 2 ไฟล์ (ใต้ /root ตามบทเรียน snap chromium /tmp):
//    scripts/fixtures/acc-v2/kbank-2026-09.csv          — รูปแบบกสิกรไทย · วันที่ พ.ศ. · คั่นหลักพัน
//    scripts/fixtures/acc-v2/kbank-2026-09.expected.json — เฉลยของ QC (นับ/ยอด/ส่วนต่าง)
//
// องค์ประกอบของไฟล์ (ตามใบสั่งงาน WO 5.3 · ปรับตามข้อมูลจริงของ seed):
//    n บรรทัด GL ของช่องทาง BSV001 ในเดือนนั้น  → จับคู่อัตโนมัติได้ (วันตรง)
//    1 ในนั้นถูกเลื่อนวันที่ +1 วัน               → auto-match ได้แค่ "แนะนำจับคู่"
//    + ค่าธรรมเนียมธนาคาร −250.00               → ไม่มีคู่ (ต้องสร้างรายการ)
//    + ดอกเบี้ยรับ +12.35                       → ไม่มีคู่ (ต้องสร้างรายการ)
//    ⇒ หลังสร้าง 2 รายการนั้น + ยืนยันคู่ที่แนะนำ ส่วนต่างต้องเป็น 0 พอดี
//
// รัน: QC_ENV_FILE=.env.qc pnpm tsx scripts/acc-v2-fixture-bank-statement.mts
// (seed-acc-v2-qc.mts เรียกฟังก์ชัน buildBankStatementFixture() ตัวนี้ต่อท้ายให้อัตโนมัติ)
// ─────────────────────────────────────────────────────────────

const accEnv = (await import("./acc-v2-env.mts" as string)) as {
  loadQcEnv: () => { host: string };
  QC: { tenantName: string };
};
const { loadQcEnv, QC } = accEnv;

const { mkdirSync, writeFileSync, readFileSync } = await import("node:fs");
const { dirname, resolve } = await import("node:path");
const { prisma } = await import("@/lib/core/db");

export const FIXTURE_DIR = "scripts/fixtures/acc-v2";
export const KBANK_CSV = `${FIXTURE_DIR}/kbank-2026-09.csv`;
export const KBANK_EXPECTED = `${FIXTURE_DIR}/kbank-2026-09.expected.json`;
// เดือนก่อนหน้า — statement ที่ "ตรงกันพอดี" (ไม่มีค่าธรรมเนียม/ดอกเบี้ย · ไม่เลื่อนวัน)
// ใช้เป็นสถานะ "ส่วนต่าง 0 · กดยืนยันได้" สำหรับภาพ QC โดยไม่ต้องโพสต์ JV เพิ่มในร้าน seed
export const KBANK_PREV_CSV = `${FIXTURE_DIR}/kbank-2026-08.csv`;
export const KBANK_PREV_EXPECTED = `${FIXTURE_DIR}/kbank-2026-08.expected.json`;
export const FIXTURE_PREV_PERIOD = "2026-08";

/** ช่องทางที่ใช้ทำ fixture + เดือน (ตรงกับที่ BLUEPRINT แถว 5.3 กำหนด: BSV001 กันยายน) */
export const FIXTURE_CHANNEL_CODE = "BSV001";
export const FIXTURE_PERIOD = "2026-09";

const FEE_SATANG = -25_000; // ค่าธรรมเนียมธนาคาร 250.00 บาท (เงินออก)
const INTEREST_SATANG = 1_235; // ดอกเบี้ยรับ 12.35 บาท (เงินเข้า)

type GlRow = { dayKey: string; docNo: string; memo: string | null; amountSatang: number; docLabel: string | null };

export type BankFixtureExpected = {
  tenantId: string;
  systemId: string;
  financeId: string;
  financeCode: string;
  ledgerAccountId: string;
  ledgerCode: string;
  periodKey: string;
  /** ยอด GL ของบัญชีช่องทาง ณ ต้นงวด/สิ้นงวด (SQL อิสระ) */
  openingSatang: number;
  systemClosingSatang: number;
  /** ยอดปลายงวดตาม statement = ยอดในระบบ + ค่าธรรมเนียม + ดอกเบี้ย (เพราะ 2 รายการนั้นยังไม่ลงบัญชี) */
  statementClosingSatang: number;
  /** ส่วนต่างก่อนสร้างรายการ = statement − ระบบ */
  differenceBeforeSatang: number;
  rowCount: number;
  /** ผลที่ autoMatch ต้องได้ */
  expectMatched: number;
  expectSuggested: number;
  expectUnmatched: number;
  /** แถวที่ถูกเลื่อนวัน (จะเป็น "แนะนำจับคู่") */
  nearMatch: { docNo: string; amountSatang: number; glDayKey: string; statementDayKey: string } | null;
  feeSatang: number;
  interestSatang: number;
  fileName: string;
};

function bahtStr(satang: number): string {
  return (Math.abs(satang) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** "2026-09-03" → "03/09/2569" (วันที่แบบ พ.ศ. ที่ธนาคารไทยส่งออกจริง) */
function beDate(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y + 543}`;
}

function addDay(dayKey: string, n: number): string {
  const t = Date.parse(`${dayKey}T00:00:00Z`) + n * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

function lastDayOf(periodKey: string): string {
  const [y, m] = periodKey.split("-").map(Number);
  const first = Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1);
  return new Date(first - 86_400_000).toISOString().slice(0, 10);
}

export async function buildBankStatementFixture(
  opts: { write?: boolean; periodKey?: string; csvPath?: string; expectedPath?: string; withAdjustments?: boolean } = {},
): Promise<BankFixtureExpected> {
  const write = opts.write !== false;
  const PERIOD = opts.periodKey ?? FIXTURE_PERIOD;
  const withAdjustments = opts.withAdjustments !== false;
  const csvOut = opts.csvPath ?? KBANK_CSV;
  const expectedOut = opts.expectedPath ?? KBANK_EXPECTED;

  const tenant = await prisma.tenant.findFirst({ where: { name: QC.tenantName }, select: { id: true } });
  if (!tenant) throw new Error(`ไม่พบร้าน QC "${QC.tenantName}" — รัน seed-acc-v2-qc.mts ก่อน`);
  const sys = await prisma.appSystem.findFirst({ where: { tenantId: tenant.id, type: "ACCOUNT" }, select: { id: true } });
  if (!sys) throw new Error("ไม่พบระบบบัญชีของร้าน QC");

  const fin = await prisma.accountFinance.findFirst({
    where: { tenantId: tenant.id, systemId: sys.id, code: FIXTURE_CHANNEL_CODE },
    select: { id: true, code: true, ledgerAccountId: true },
  });
  if (!fin?.ledgerAccountId) throw new Error(`ไม่พบช่องทาง ${FIXTURE_CHANNEL_CODE} (หรือยังไม่ผูกบัญชี GL)`);
  const ledger = await prisma.accountLedger.findFirst({ where: { id: fin.ledgerAccountId }, select: { code: true } });

  const periodStart = `${PERIOD}-01`;
  const periodEndEx = addDay(lastDayOf(PERIOD), 1);

  // ── SQL อิสระ (ไม่ผ่าน reconcile.ts/finance.ts) ────────────────────────────
  // ยอดยกมาต้นงวด
  const openingRows = await prisma.$queryRaw<{ sum: bigint | null }[]>`
    SELECT COALESCE(SUM(jl.debit - jl.credit), 0)::bigint AS sum
    FROM "AccountJournalLine" jl
    JOIN "AccountJournalEntry" e ON e.id = jl."entryId"
    WHERE jl."tenantId" = ${tenant.id} AND jl."systemId" = ${sys.id}
      AND jl."accountId" = ${fin.ledgerAccountId}
      AND e.date < ${new Date(`${periodStart}T00:00:00+07:00`)}
      AND e.status <> 'REVERSED'`;
  const openingSatang = Number(openingRows[0]?.sum ?? 0);

  // บรรทัดของงวด (เรียงวัน) + ชื่อเอกสารต้นทางไว้ทำ "รายละเอียด" ให้เหมือน statement จริง
  const rows = await prisma.$queryRaw<
    { daykey: string; docno: string; memo: string | null; amount: bigint; doclabel: string | null }[]
  >`
    -- ⚠️ AccountJournalEntry.date เป็น TIMESTAMP **ไม่มีโซน** (เก็บเป็น UTC) ⇒ ต้อง AT TIME ZONE 2 ชั้น
    -- (ชั้นแรกบอกว่า "ค่านี้คือ UTC" ชั้นสองแปลงเป็นเวลาไทย) — ชั้นเดียวจะเพี้ยนไป 1 วัน (บทเรียน WO 2.1)
    SELECT to_char(e.date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD') AS daykey,
           e."docNo" AS docno,
           e.memo    AS memo,
           (jl.debit - jl.credit)::bigint AS amount,
           COALESCE(d1."docNo", d2."docNo") AS doclabel
    FROM "AccountJournalLine" jl
    JOIN "AccountJournalEntry" e ON e.id = jl."entryId"
    LEFT JOIN "AccountDocumentPayment" p ON e."refType" = 'AccountDocumentPayment' AND p.id = e."refId"
    LEFT JOIN "AccountDocument" d1 ON d1.id = p."documentId"
    LEFT JOIN "AccountDocument" d2 ON e."refType" = 'AccountDocument' AND d2.id = e."refId"
    WHERE jl."tenantId" = ${tenant.id} AND jl."systemId" = ${sys.id}
      AND jl."accountId" = ${fin.ledgerAccountId}
      AND e.date >= ${new Date(`${periodStart}T00:00:00+07:00`)}
      AND e.date <  ${new Date(`${periodEndEx}T00:00:00+07:00`)}
      AND e.status <> 'REVERSED'
    ORDER BY e.date ASC, e."docNo" ASC`;

  const gl: GlRow[] = rows.map((r) => ({
    dayKey: r.daykey,
    docNo: r.docno,
    memo: r.memo,
    amountSatang: Number(r.amount),
    docLabel: r.doclabel,
  }));
  if (gl.length === 0) throw new Error(`ไม่มีบรรทัด GL ของ ${FIXTURE_CHANNEL_CODE} ในงวด ${PERIOD}`);

  const systemClosingSatang = openingSatang + gl.reduce((s, r) => s + r.amountSatang, 0);

  // แถว "ใกล้เคียง" = แถวสุดท้ายที่วันที่ ≤ 27 (เลื่อน +1 วันแล้วยังอยู่ในเดือน และไม่ชนวันค่าธรรมเนียม/ดอกเบี้ย)
  // เลือกด้วยกติกา ไม่ใช่วันที่ตายตัว ⇒ seed เปลี่ยนก็ยังใช้ได้
  const nearIdx = (() => {
    if (!withAdjustments) return -1;
    for (let i = gl.length - 1; i >= 0; i--) if (Number(gl[i].dayKey.slice(8)) <= 27) return i;
    return -1;
  })();
  if (withAdjustments && nearIdx < 0) throw new Error("ไม่พบบรรทัดที่เลื่อนวันได้ (ทุกบรรทัดอยู่หลังวันที่ 27)");

  const feeDay = `${PERIOD}-28`;
  const interestDay = lastDayOf(PERIOD);

  type OutRow = { dayKey: string; desc: string; ref: string; amountSatang: number };
  const out: OutRow[] = gl.map((r, i) => ({
    dayKey: i === nearIdx ? addDay(r.dayKey, 1) : r.dayKey,
    desc: `${r.memo ?? "รายการ"}${r.docLabel ? ` ${r.docLabel}` : ` ${r.docNo}`}`,
    ref: r.docNo,
    amountSatang: r.amountSatang,
  }));
  if (withAdjustments) {
    out.push({ dayKey: feeDay, desc: "ค่าธรรมเนียมธนาคาร", ref: "FEE", amountSatang: FEE_SATANG });
    out.push({ dayKey: interestDay, desc: "ดอกเบี้ยรับ", ref: "INT", amountSatang: INTEREST_SATANG });
  }
  out.sort((a, b) => (a.dayKey < b.dayKey ? -1 : a.dayKey > b.dayKey ? 1 : 0));

  // ── เขียน CSV รูปแบบกสิกรไทย (BOM + วันที่ พ.ศ. + คั่นหลักพัน + คอลัมน์ยอดคงเหลือ) ──
  let running = openingSatang;
  const lines: string[] = ["วันที่,เวลา,รายละเอียด,เลขที่อ้างอิง,ถอนเงิน,ฝากเงิน,คงเหลือ,ช่องทาง"];
  for (const r of out) {
    running += r.amountSatang;
    // คั่นหลักพันมี "," อยู่ในค่า ⇒ ต้องครอบ " ทุกช่องจำนวนเงิน (ไฟล์ธนาคารจริงก็ครอบ)
    const dr = r.amountSatang < 0 ? `"${bahtStr(r.amountSatang)}"` : "";
    const cr = r.amountSatang > 0 ? `"${bahtStr(r.amountSatang)}"` : "";
    lines.push(`${beDate(r.dayKey)},10:00,"${r.desc.replace(/"/g, '""')}",${r.ref},${dr},${cr},"${bahtStr(running)}",K-Cyber`);
  }
  const csv = "﻿" + lines.join("\r\n") + "\r\n"; // BOM + CRLF เหมือนไฟล์ที่ Excel/ธนาคารส่งออกจริง

  const statementClosingSatang = running;
  const expected: BankFixtureExpected = {
    tenantId: tenant.id,
    systemId: sys.id,
    financeId: fin.id,
    financeCode: fin.code ?? FIXTURE_CHANNEL_CODE,
    ledgerAccountId: fin.ledgerAccountId,
    ledgerCode: ledger?.code ?? "—",
    periodKey: PERIOD,
    openingSatang,
    systemClosingSatang,
    statementClosingSatang,
    differenceBeforeSatang: statementClosingSatang - systemClosingSatang,
    rowCount: out.length,
    expectMatched: withAdjustments ? gl.length - 1 : gl.length,
    expectSuggested: withAdjustments ? 1 : 0,
    expectUnmatched: withAdjustments ? 2 : 0,
    nearMatch: withAdjustments
      ? {
          docNo: gl[nearIdx].docNo,
          amountSatang: gl[nearIdx].amountSatang,
          glDayKey: gl[nearIdx].dayKey,
          statementDayKey: addDay(gl[nearIdx].dayKey, 1),
        }
      : null,
    feeSatang: withAdjustments ? FEE_SATANG : 0,
    interestSatang: withAdjustments ? INTEREST_SATANG : 0,
    fileName: csvOut.split("/").pop()!,
  };

  if (write) {
    const csvPath = resolve(process.cwd(), csvOut);
    mkdirSync(dirname(csvPath), { recursive: true });
    writeFileSync(csvPath, csv, "utf8");
    writeFileSync(resolve(process.cwd(), expectedOut), JSON.stringify(expected, null, 2) + "\n", "utf8");
  }

  return expected;
}

/** อ่านเนื้อไฟล์ fixture (ให้ seed/QC เรียกใช้โดยไม่ต้องรู้ path) */
export function readKbankFixture(path: string = KBANK_CSV): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

// รันตรง (ไม่ใช่ import) → สร้างไฟล์ + พิมพ์สรุป
if (process.argv[1]?.includes("acc-v2-fixture-bank-statement")) {
  const { host } = loadQcEnv();
  console.log(`[env] DB ${host}`);
  const e = await buildBankStatementFixture();
  const prev = await buildBankStatementFixture({
    periodKey: FIXTURE_PREV_PERIOD,
    csvPath: KBANK_PREV_CSV,
    expectedPath: KBANK_PREV_EXPECTED,
    withAdjustments: false,
  });
  console.log(`✅ เขียน ${KBANK_PREV_CSV} — ${prev.rowCount} แถว (ตรงกันพอดี · ส่วนต่าง ${(prev.differenceBeforeSatang / 100).toFixed(2)})`);
  console.log(`✅ เขียน ${KBANK_CSV} — ${e.rowCount} แถว`);
  console.log(
    `   ยอดยกมา ${(e.openingSatang / 100).toFixed(2)} · ยอดในระบบสิ้นงวด ${(e.systemClosingSatang / 100).toFixed(2)} · ` +
      `ยอดตาม statement ${(e.statementClosingSatang / 100).toFixed(2)} · ส่วนต่างก่อนสร้างรายการ ${(e.differenceBeforeSatang / 100).toFixed(2)}`,
  );
  console.log(`   คาดว่า auto-match: จับคู่ ${e.expectMatched} · แนะนำ ${e.expectSuggested} · รอจับคู่ ${e.expectUnmatched}`);
  console.log(`   แถวที่เลื่อนวัน: ${e.nearMatch?.docNo} ${e.nearMatch?.glDayKey} → ${e.nearMatch?.statementDayKey}`);
  await prisma.$disconnect();
}
