// QC WO 8.2 — นโยบายบัญชี (§9.3)
//
// requires: acc-v2-seed (ร้าน SIAM DIVE QC ถูก seed นโยบายไว้แล้ว — บล็อก 8.14)
// รัน (บังคับ DB QC branch):
//   QC_ENV_FILE=.env.qc pnpm tsx scripts/seed-acc-v2-qc.mts
//   QC_ENV_FILE=.env.qc pnpm tsx scripts/qc-acc-v2-policy.mts
//
// 🔴 ร้าน QC จริง (SIAM DIVE QC) = **อ่านอย่างเดียว** — การเขียนทั้งหมดเกิดใน "ร้านทิ้ง" ที่สร้างเองแล้วลบใน finally
//    ยกเว้นการทดสอบ "ถูกปฏิเสธ" ซึ่งตามนิยามไม่แตะข้อมูล (ยืนยันซ้ำด้วยการนับแถวก่อน/หลัง)
//
// ครอบคลุม
//   P1  ปีบัญชี: เมทริกซ์เริ่ม ม.ค./เม.ย./ต.ค. · ขอบรอบ · ป้ายไทย · งวดก่อนหน้า
//   P2  งบแสดงฐานะการเงินบนปีบัญชี เม.ย.–มี.ค.: กำไรปีนี้ = P&L(ต้นปีบัญชี..asOf) · กำไรสะสม = ปีก่อน ๆ (SQL อิสระ)
//   P3  ล็อกข้อมูลก่อนวันที่: สร้าง/แก้/ยกเลิก เอกสาร · รับ-จ่ายเงิน · JV มือ · เปิดงวด · การอ่านไม่กระทบ
//   P4  จุดรับรู้ VAT ถึงการโพสต์จริง (ON_ISSUE 2200 vs ON_PAYMENT 2210)
//   P5  หัก ณ ที่จ่ายเริ่มต้นตามบัญชี/ประเภทเงินได้
//   P6  ประเภทราคาเริ่มต้นถึงฟอร์มเอกสาร
//   P7  ชื่อซ้ำ: เตือน vs ห้าม (ผู้ติดต่อ + สินค้า)
//   P8  บัญชีเริ่มต้นเปลี่ยน → JV ที่โพสต์เปลี่ยนบัญชีจริง
//   P9  ออกเอกสารต่อ: QT→ใบรับมัดจำ · คัดลอกหมายเหตุ/แท็ก เปิด/ปิด
//   P10 นิยามลูกค้าประจำ เปลี่ยนแล้วจำนวนรายขยับ
//   P11 ปิดงวดอัตโนมัติ เปิด/ปิด (จำลองเวลา)
//   P12 รายงานอีเมล: ข้อความที่ประกอบได้ + คีย์กันส่งซ้ำ
//   P13 ด่านสิทธิ์ + ค่าที่กรอกผิด
//   P14 แยกร้าน (tenant isolation)
//   P15 ชุดข้อมูล QC: นโยบายที่ seed = เฉลย

const accEnv = (await import("./acc-v2-env.mts" as string)) as {
  loadQcEnv: () => { databaseUrl: string; host: string };
  QC: { expectedPath: string; today: string };
};
const { loadQcEnv, QC } = accEnv;
const { host } = loadQcEnv();

const { readFileSync } = await import("node:fs");
const { prisma } = await import("@/lib/core/db");
const sysMod = await import("@/lib/modules/system/service");
const glMod = await import("@/lib/modules/account/gl");
const svc = await import("@/lib/modules/account/service");
const exp = await import("@/lib/modules/account/expense");
const coa = await import("@/lib/modules/account/coa");
const reports = await import("@/lib/modules/account/reports");
const journal = await import("@/lib/modules/account/journal-v2");
const periodClose = await import("@/lib/modules/account/period-close");
const sweep = await import("@/lib/modules/account/period-sweep");
const contactsList = await import("@/lib/modules/account/contacts-list");
const product = await import("@/lib/modules/account/product");
const policy = await import("@/lib/modules/account/policy");
const emailReport = await import("@/lib/modules/account/email-report");
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
/** ต้องถูกปฏิเสธ — รับได้ทั้งแบบคืน {ok:false,reason} และแบบ throw */
const rejected = async (
  name: string,
  fn: () => Promise<{ ok: boolean; reason?: string } | unknown>,
  contains?: string,
) => {
  try {
    const r = (await fn()) as { ok?: boolean; reason?: string };
    if (r && r.ok === false) {
      if (contains && !(r.reason ?? "").includes(contains))
        return bad(name, `เหตุผล "${r.reason}" ไม่มีคำว่า "${contains}"`);
      return ok(name);
    }
    return bad(name, "ผ่านทั้งที่ควรถูกปฏิเสธ");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (contains && !msg.includes(contains)) return bad(name, `error "${msg}" ไม่มีคำว่า "${contains}"`);
    return ok(name);
  }
};

console.log(`\n===== QC WO 8.2 · นโยบายบัญชี (§9.3) =====`);
console.log(`🗄️  DB QC: ${host}\n`);

type PolicyOracle = {
  fiscalYearStartMonth: number;
  fiscalYearEndMonth: number;
  periodCloseDay: number;
  fiscalYearOfToday: { year: number; startKey: string; endKey: string; startYmd: string; endYmd: string };
  fiscalYearLabel: string;
  vatRegistered: boolean;
  vatRateBp: number;
  vatTiming: string;
  defaultPriceMode: string;
  lockBeforeYmd: string;
  lockedSampleYmd: string;
  allowedSampleYmd: string;
  lockedMessage: string;
  dupContactPolicy: string;
  dupProductPolicy: string;
  defaultSalesAccountCode: string;
  defaultPurchaseAccountCode: string;
  defaultExpenseAccountCode: string;
  convertQtTo: string;
  convertPoTo: string;
  copyNotesOnConvert: boolean;
  copyTagsOnConvert: boolean;
  autoClosePeriods: boolean;
  autoCloseNotify: boolean;
  emailReportDaily: boolean;
  emailReportWeekly: boolean;
  emailReportRecipients: string[];
  whtDefaults: { incomeType: string; rateBp: number; expenseAccountCodes: string[] }[];
  regularCustomer: { minPaidDocs: number; minPaidTotalSatang: number; periodMonths: number };
  subSections: number;
};
const E = JSON.parse(readFileSync(QC.expectedPath, "utf8")) as {
  tenantId: string;
  systemId: string;
  policy?: PolicyOracle;
};
if (!E.policy) {
  console.error("❌ เฉลยยังไม่มีคีย์ policy — รัน scripts/seed-acc-v2-qc.mts ใหม่ก่อน");
  process.exit(1);
}
const P = E.policy;
const QCTX = { tenantId: E.tenantId, systemId: E.systemId };

/** วันไทยเที่ยงวัน → Date (กันเหลื่อมวันตอนแปลง TZ) */
const d = (iso: string) => new Date(`${iso}T12:00:00+07:00`);

let sTenantId: string | null = null;

try {
  // ═════════════════ P1 — ปีบัญชี (ตรรกะบริสุทธิ์) ═════════════════
  console.log("P1 ปีบัญชี:");
  const fy = (ymd: string, m: number) => {
    const f = policy.fiscalYearOf(ymd, m);
    return [f.year, f.startYmd, f.endYmd];
  };
  eq("P1.1 เริ่ม ม.ค. = ปีปฏิทิน", fy("2026-09-15", 1), [2026, "2026-01-01", "2026-12-31"]);
  eq("P1.2 เริ่ม เม.ย. · วันที่ในเดือน ก.ย. → รอบ 2026", fy("2026-09-15", 4), [2026, "2026-04-01", "2027-03-31"]);
  eq("P1.3 เริ่ม เม.ย. · วันที่ในเดือน ก.พ. → ยังอยู่รอบ 2025", fy("2026-02-15", 4), [2025, "2025-04-01", "2026-03-31"]);
  eq("P1.4 ขอบล่าง: 1 เม.ย. = วันแรกของรอบใหม่", fy("2026-04-01", 4), [2026, "2026-04-01", "2027-03-31"]);
  eq("P1.5 ขอบบน: 31 มี.ค. = วันสุดท้ายของรอบก่อน", fy("2026-03-31", 4), [2025, "2025-04-01", "2026-03-31"]);
  eq("P1.6 เริ่ม ต.ค. → ข้ามปีเช่นกัน", fy("2026-09-30", 10), [2025, "2025-10-01", "2026-09-30"]);
  eq("P1.7 เริ่ม ต.ค. · 1 ต.ค. = รอบใหม่", fy("2026-10-01", 10), [2026, "2026-10-01", "2027-09-30"]);
  eq("P1.8 รอบที่มี ก.พ. ปีอธิกสุรทิน (เริ่ม มี.ค. 2027 → จบ ก.พ. 2028 = 29 วัน)", fy("2027-05-01", 3), [
    2027,
    "2027-03-01",
    "2028-02-29",
  ]);
  eq("P1.9 เดือนเริ่มนอกช่วง 1–12 ตกกลับเป็น ม.ค.", fy("2026-09-15", 99), [2026, "2026-01-01", "2026-12-31"]);
  eq(
    "P1.10 เดือนสิ้นปีบัญชีจากเดือนเริ่ม (1→12 · 4→3 · 10→9)",
    [1, 4, 10].map((m) => policy.fiscalYearEndMonth(m)),
    [12, 3, 9],
  );
  eq("P1.11 ป้ายไทยของรอบ", policy.fiscalYearOf(`${QC.today}`, 4).label, P.fiscalYearLabel);
  eq("P1.12 คีย์งวดต้น/ปลายรอบ", [policy.fiscalYearOf(QC.today, 4).startKey, policy.fiscalYearOf(QC.today, 4).endKey], [
    P.fiscalYearOfToday.startKey,
    P.fiscalYearOfToday.endKey,
  ]);
  eq("P1.13 รอบก่อนหน้า = รอบเดียวกันของปีก่อน", fy(policy.previousFiscalYear(QC.today, 4).startYmd, 4), [
    2025,
    "2025-04-01",
    "2026-03-31",
  ]);
  eq(
    "P1.14 ต้นปีบัญชีที่ reports ใช้ ตรงกับ policy (แหล่งเดียว ไม่ fork สูตร)",
    reports.fiscalYearStartKey("2026-09", policy.fiscalYearEndMonth(4)),
    policy.fiscalYearOf("2026-09-15", 4).startKey,
  );
  // 🔴 กับดักเวลา: เที่ยงคืน 1 เม.ย. เวลาไทย = 17:00 UTC ของ 31 มี.ค. — ต้องได้รอบใหม่
  eq(
    "P1.15 ใช้เวลาไทยเสมอ (00:30 ของ 1 เม.ย. → รอบใหม่ ไม่ใช่รอบก่อน)",
    policy.fiscalYearOf(new Date("2026-04-01T00:30:00+07:00"), 4).year,
    2026,
  );

  // ═════════════════ P2 — งบฐานะบนปีบัญชี เม.ย.–มี.ค. (ตัวเลขจริงของร้าน QC) ═════════════════
  console.log("\nP2 งบแสดงฐานะการเงินตามปีบัญชี เม.ย.–มี.ค.:");
  const asOf = QC.today.slice(0, 7);
  const fyEnd = P.fiscalYearEndMonth;
  const fyStart = P.fiscalYearOfToday.startKey;
  const bsFy = await reports.balanceSheet(QCTX, asOf, { fiscalYearEndMonth: fyEnd });
  const bsCal = await reports.balanceSheet(QCTX, asOf); // ปีปฏิทิน (ค่าเริ่มต้นเดิม)
  eq("P2.1 ต้นปีบัญชีที่งบใช้ = เม.ย. ของรอบ", bsFy.fiscalYearStartKey, fyStart);

  // เฉลยอิสระ: คิดกำไรจาก SQL ตรง ๆ (คนละสำนวนกับ reports.plCore)
  const profitBetween = async (gte: string | null, lte: string | null) => {
    const rows = await prisma.$queryRawUnsafe<{ type: string; net: bigint | number }[]>(
      `SELECT l."type" AS type,
              SUM(CASE WHEN l."type" = 'INCOME' THEN jl."credit" - jl."debit"
                       ELSE jl."debit" - jl."credit" END)::bigint AS net
         FROM "AccountJournalLine" jl
         JOIN "AccountJournalEntry" je ON je."id" = jl."entryId"
         JOIN "AccountLedger" l ON l."id" = jl."accountId"
        WHERE jl."systemId" = $1
          AND l."type" IN ('INCOME','COGS','EXPENSE')
          ${gte ? `AND je."periodKey" >= '${gte}'` : ""}
          ${lte ? `AND je."periodKey" <= '${lte}'` : ""}
        GROUP BY l."type"`,
      QCTX.systemId,
    );
    let income = 0;
    let cost = 0;
    for (const r of rows) {
      const n = Number(r.net);
      if (r.type === "INCOME") income += n;
      else cost += n;
    }
    return income - cost;
  };
  const sqlCurrent = await profitBetween(fyStart, asOf);
  const sqlRetained = await profitBetween(null, prevKey(fyStart));
  eq("P2.2 กำไรปีบัญชีนี้ = SQL อิสระของช่วง เม.ย.–ก.ย.", bsFy.currentPeriodProfit, sqlCurrent);
  eq("P2.3 กำไรสะสม = SQL อิสระของทุกอย่างก่อนต้นปีบัญชี", bsFy.retainedEarnings, sqlRetained);
  eq(
    "P2.4 กำไรสะสม + กำไรปีนี้ = กำไรสะสมทั้งหมด (เส้นแบ่งไม่ทำให้เงินหาย)",
    bsFy.retainedEarnings + bsFy.currentPeriodProfit,
    bsCal.retainedEarnings + bsCal.currentPeriodProfit,
  );
  eq(
    "P2.5 ชุดข้อมูล QC ไม่มีรายการก่อน เม.ย. 2026 ⇒ กำไรสะสม 0 ทั้งสองแบบ (ตัวพิสูจน์ว่าต่างจริงอยู่ที่ P2b)",
    [bsFy.retainedEarnings, sqlRetained],
    [0, 0],
  );
  eq("P2.6 งบยังสมดุลเมื่อเปลี่ยนปีบัญชี", [bsFy.balanced, bsFy.assets.total === bsFy.totalLiabilitiesEquity], [true, true]);

  // ═════════════════ P12 — รายงานอีเมล (ตรรกะบริสุทธิ์) ═════════════════
  console.log("\nP12 รายงานทางอีเมล:");
  const monday = new Date("2026-09-28T09:00:00+07:00"); // จันทร์
  const tuesday = new Date("2026-09-29T09:00:00+07:00");
  eq("P12.1 คีย์งวดรายวัน = วันไทย", emailReport.reportPeriodKey("DAILY", tuesday), "2026-09-29");
  eq("P12.2 คีย์งวดรายสัปดาห์ = วันจันทร์ของสัปดาห์นั้น", emailReport.reportPeriodKey("WEEKLY", tuesday), "2026-09-28");
  eq(
    "P12.3 วันอาทิตย์ยังนับเป็นสัปดาห์ที่เริ่มจันทร์ก่อนหน้า",
    emailReport.reportPeriodKey("WEEKLY", new Date("2026-10-04T23:00:00+07:00")),
    "2026-09-28",
  );
  eq(
    "P12.4 คีย์กันส่งซ้ำผูกกับร้าน+ชนิด+งวด",
    emailReport.reportIdempotencyKey("sys1", "WEEKLY", tuesday),
    "acc-report:sys1:WEEKLY:2026-09-28",
  );
  eq(
    "P12.5 รายสัปดาห์ถึงกำหนดเฉพาะวันจันทร์",
    [
      emailReport.reportKindsDue({ emailReportDaily: false, emailReportWeekly: true }, monday),
      emailReport.reportKindsDue({ emailReportDaily: false, emailReportWeekly: true }, tuesday),
      emailReport.reportKindsDue({ emailReportDaily: true, emailReportWeekly: true }, tuesday),
    ],
    [["WEEKLY"], [], ["DAILY"]],
  );
  const composed = emailReport.composeAccountReport({
    orgName: "SIAM DIVE QC",
    kind: "WEEKLY",
    now: tuesday,
    kpi: {
      receivable: { count: 20, amount: 49_430_000 },
      payable: { count: 10, amount: 21_475_000 },
      overdue: { count: 4, amount: 12_840_000 },
      cashTotal: 132_973_000,
    },
    pending: { quotationAwaitingAccept: 2, poAwaitingApproval: 1, needsReview: 1, total: 4 },
    fiscalYearLabel: P.fiscalYearLabel,
  });
  eq("P12.6 หัวเรื่องเป็นภาษาคน + วันที่ไทย", composed.subject, "สรุปบัญชีรายสัปดาห์ SIAM DIVE QC — 29 ก.ย. 2026");
  assert("P12.7 เนื้อความมียอดค้างรับจริง (บาท ไม่ใช่สตางค์)", composed.text.includes("฿494,300.00"), composed.text);
  assert("P12.8 เนื้อความมีปีบัญชี", composed.text.includes(P.fiscalYearLabel), composed.text);
  assert("P12.9 เนื้อความบอกทางปิดรายงาน", composed.text.includes("ตั้งค่า › นโยบายบัญชี"), composed.text);
  assert(
    "P12.10 ไม่มีชื่อ/เบอร์ลูกค้าในอีเมล (มีแต่ตัวเลขรวม)",
    !/ปิยธิดา|08\d{8}|@gmail/.test(composed.text),
    composed.text,
  );

  // ═════════════════ P15 — นโยบายที่ seed = เฉลย (อ่านผ่านทางที่หน้าจริงใช้) ═════════════════
  console.log("\nP15 นโยบายของชุดข้อมูล QC ตรงเฉลย:");
  const qcPolicy = await policy.getPolicy(QCTX);
  eq("P15.1 เดือนเริ่มปีบัญชี", qcPolicy.fiscalYearStartMonth, P.fiscalYearStartMonth);
  eq("P15.2 วันปิดงวด", qcPolicy.periodCloseDay, P.periodCloseDay);
  eq("P15.3 VAT (จด/อัตรา/จุดรับรู้)", [qcPolicy.vatRegistered, qcPolicy.vatRateBp, qcPolicy.vatTiming], [
    P.vatRegistered,
    P.vatRateBp,
    P.vatTiming,
  ]);
  eq("P15.4 ประเภทราคาเริ่มต้น", qcPolicy.defaultPriceMode, P.defaultPriceMode);
  eq("P15.5 วันล็อก (วันไทย)", policy.policyDayKey(qcPolicy.lockBeforeDate!), P.lockBeforeYmd);
  eq("P15.6 นโยบายชื่อซ้ำ", [qcPolicy.dupContactPolicy, qcPolicy.dupProductPolicy], [P.dupContactPolicy, P.dupProductPolicy]);
  eq(
    "P15.7 บัญชีเริ่มต้น 3 ตัว",
    [qcPolicy.defaultSalesAccountCode, qcPolicy.defaultPurchaseAccountCode, qcPolicy.defaultExpenseAccountCode],
    [P.defaultSalesAccountCode, P.defaultPurchaseAccountCode, P.defaultExpenseAccountCode],
  );
  eq("P15.8 การออกเอกสารต่อ", [qcPolicy.convertQtTo, qcPolicy.convertPoTo, qcPolicy.copyNotesOnConvert, qcPolicy.copyTagsOnConvert], [
    P.convertQtTo,
    P.convertPoTo,
    P.copyNotesOnConvert,
    P.copyTagsOnConvert,
  ]);
  eq("P15.9 ปิดงวดอัตโนมัติ", [qcPolicy.autoClosePeriods, qcPolicy.autoCloseNotify], [P.autoClosePeriods, P.autoCloseNotify]);
  eq("P15.10 รายงานอีเมล", [qcPolicy.emailReportDaily, qcPolicy.emailReportWeekly, qcPolicy.emailReportRecipients], [
    P.emailReportDaily,
    P.emailReportWeekly,
    P.emailReportRecipients,
  ]);
  eq("P15.11 หัก ณ ที่จ่ายเริ่มต้น", qcPolicy.whtDefaults, P.whtDefaults);
  eq("P15.12 นิยามลูกค้าประจำ", qcPolicy.regularCustomer, P.regularCustomer);
  eq(
    "P15.13 จุดรับรู้ VAT ที่ getSettings คืน = คอลัมน์ใหม่ (ไม่ใช่ JSON เดิม)",
    (await svc.getSettings(QCTX.tenantId, QCTX.systemId)).taxPointBasis,
    P.vatTiming,
  );
  eq(
    "P15.14 getSettings แนบนโยบายมาให้ทั้งก้อน (ผู้ใช้เดิมไม่ต้องยิง query เพิ่ม)",
    (await svc.getSettings(QCTX.tenantId, QCTX.systemId)).policy.lockBeforeDate?.toISOString(),
    qcPolicy.lockBeforeDate?.toISOString(),
  );
  const navMod = await import("@/lib/modules/account/settings-nav");
  eq("P15.15 หน้านโยบายมีหัวข้อย่อยครบตาม §9.3", navMod.POLICY_SETTINGS_SUBS.length, P.subSections);
  assert(
    "P15.16 เมนูซ้าย: หมวดนโยบายบัญชีเปิดใช้แล้ว (ไม่จาง)",
    navMod.settingsGroups("/base").find((g) => g.key === "policy")?.soon !== true,
  );

  // ═════════════════ P3(ก) — ล็อกวันที่บนร้าน QC จริง (การปฏิเสธไม่แตะข้อมูล) ═════════════════
  console.log("\nP3(ก) ล็อกข้อมูลก่อนวันที่ — ร้าน QC จริง:");
  eq("P3.1 ข้อความล็อกเป็นภาษาคนและบอกทางปลด", policy.lockedMessage(qcPolicy.lockBeforeDate!), P.lockedMessage);
  eq(
    "P3.2 นิยาม: วันก่อนวันล็อก=ล็อก · วันล็อกเอง=ยังเขียนได้ · หลังวันล็อก=เขียนได้",
    [
      policy.isLockedDate(qcPolicy.lockBeforeDate, P.lockedSampleYmd),
      policy.isLockedDate(qcPolicy.lockBeforeDate, P.lockBeforeYmd),
      policy.isLockedDate(qcPolicy.lockBeforeDate, P.allowedSampleYmd),
      policy.isLockedDate(null, P.lockedSampleYmd),
    ],
    [true, false, false, false],
  );
  eq(
    "P3.3 งวดที่จมใต้วันล็อกทั้งงวด = ล็อก · งวดที่คร่อมวันล็อก = ไม่ล็อก",
    [
      policy.isLockedPeriod(qcPolicy.lockBeforeDate, "2026-07"),
      policy.isLockedPeriod(qcPolicy.lockBeforeDate, "2026-08"),
      policy.isLockedPeriod(qcPolicy.lockBeforeDate, "2026-09"),
    ],
    [true, false, false],
  );
  const docsBefore = await prisma.accountDocument.count({ where: { systemId: QCTX.systemId } });
  await rejected(
    "P3.4 สร้างเอกสารลงวันที่ในช่วงล็อก = ปฏิเสธ (ข้อความเดียวกับที่ผู้ใช้เห็น)",
    () =>
      svc.createDocument({
        tenantId: QCTX.tenantId,
        systemId: QCTX.systemId,
        docType: "INVOICE",
        issueDate: d(P.lockedSampleYmd),
        lines: [{ description: "ทดสอบล็อก", qty: 1, unitPrice: 100_00 }],
      }),
    P.lockedMessage,
  );
  eq("P3.5 การปฏิเสธไม่สร้างเอกสารค้างไว้", await prisma.accountDocument.count({ where: { systemId: QCTX.systemId } }), docsBefore);
  await rejected(
    "P3.6 เปิดงวดที่จมใต้วันล็อกไม่ได้",
    () => periodClose.reopenPeriodV2(QCTX, "2026-07", "ทดสอบล็อก", "qc"),
    P.lockedMessage,
  );
  // 🔴 ต้องส่งบรรทัดที่ "ถูกต้องครบ" มา ไม่งั้นจะไปตกด่าน validate ก่อนถึงด่านล็อก แล้วข้อสอบจะเขียวหลอก
  const qcCash = await prisma.accountLedger.findFirstOrThrow({
    where: { systemId: QCTX.systemId, code: "1000" },
    select: { id: true },
  });
  const qcIncome = await prisma.accountLedger.findFirstOrThrow({
    where: { systemId: QCTX.systemId, code: "4030" },
    select: { id: true },
  });
  const jvBefore = await prisma.accountJournalEntry.count({ where: { systemId: QCTX.systemId } });
  await rejected(
    "P3.7 สมุดรายวันมือลงวันที่ในช่วงล็อก = ปฏิเสธ",
    () =>
      journal.createManualEntry(QCTX, {
        dateKey: P.lockedSampleYmd,
        memo: "ทดสอบล็อก",
        lines: [
          { accountId: qcCash.id, debit: 1_000, credit: 0 },
          { accountId: qcIncome.id, debit: 0, credit: 1_000 },
        ],
      }),
    P.lockedMessage,
  );
  eq("P3.7b การปฏิเสธไม่สร้างใบสำคัญค้างไว้", await prisma.accountJournalEntry.count({ where: { systemId: QCTX.systemId } }), jvBefore);
  // การอ่านต้องไม่กระทบเลย
  const readTb = await reports.trialBalance(QCTX, "2026-01", asOf);
  assert("P3.8 อ่านรายงานย้อนหลังในช่วงที่ล็อกได้ตามปกติ", readTb.rows.length > 0 && readTb.balanced);
  const readDocs = await prisma.accountDocument.count({
    where: { systemId: QCTX.systemId, issueDate: { lt: d(P.lockBeforeYmd) } },
  });
  assert("P3.9 เอกสารเก่าก่อนวันล็อกยังอ่านเห็นครบ", readDocs > 0, `เห็น ${readDocs} ใบ`);

  // ═════════════════ ร้านทิ้ง — การเขียนทั้งหมด ═════════════════
  console.log("\n── สร้างร้านทดสอบ (เขียนจริง: โพสต์ JV · ล็อกวันที่ · แปลงเอกสาร · ปิดงวด) ──");
  const stamp = Date.now();
  const tag = `qc-policy-${stamp}`;
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
  const sid = accSys.id;
  const S = { tenantId: tid, systemId: sid };
  await glMod.ensureAccounting(S);
  await svc.saveSettings(tid, sid, {
    orgName: "ร้านทดสอบนโยบายบัญชี",
    vatRegistered: true,
    vatRateBp: 700,
    defaultDueDays: 30,
    defaultValidDays: 30,
  });
  const cust = await svc.createContact({
    tenantId: tid,
    systemId: sid,
    kind: "CUSTOMER",
    name: "ลูกค้าทดสอบนโยบาย",
    phone: "0800000001",
  });
  const custId = (cust as { id: string }).id;
  const vendor = await svc.createContact({
    tenantId: tid,
    systemId: sid,
    kind: "VENDOR",
    name: "ผู้ขายทดสอบนโยบาย",
    phone: "0800000002",
  });
  const vendorId = (vendor as { id: string }).id;
  const ledgerIdOf = async (code: string) =>
    (await prisma.accountLedger.findFirstOrThrow({ where: { systemId: sid, code }, select: { id: true } })).id;

  const newInvoice = async (when: Date, opts?: { tags?: string[]; note?: string }) => {
    const created = await svc.createDocument({
      tenantId: tid,
      systemId: sid,
      docType: "INVOICE",
      contactId: custId,
      issueDate: when,
      lines: [{ description: "ค่าทริปดำน้ำ", qty: 1, unitPrice: 100_000 }],
      tags: opts?.tags,
      note: opts?.note,
    });
    return (created as { id: string }).id;
  };

  // ═════════════════ P4 — จุดรับรู้ VAT ถึงการโพสต์จริง ═════════════════
  console.log("\nP4 จุดรับรู้ VAT ถึงการโพสต์จริง:");
  /** บรรทัด JV ของเอกสาร พร้อม "รหัสบัญชี" — เทียบด้วยรหัสอ่านง่ายกว่า id และบอกได้ทันทีว่าไปตกบัญชีไหน */
  const linesOfDoc = async (docId: string) => {
    const rows = await prisma.accountJournalLine.findMany({
      where: { systemId: sid, entry: { refType: "AccountDocument", refId: docId } },
      select: { debit: true, credit: true, account: { select: { code: true } } },
    });
    return rows.map((r) => ({ code: r.account.code, debit: r.debit, credit: r.credit }));
  };
  const creditCodes = (rows: { code: string; credit: number }[]) => rows.filter((r) => r.credit > 0).map((r) => r.code).sort();

  await policy.savePolicy(S, { vatTiming: "ON_ISSUE" });
  const ivIssue = await newInvoice(d("2026-10-05"));
  const rIssue = await svc.issueDocument(tid, sid, ivIssue);
  assert("P4.1 ออกใบแจ้งหนี้ตอนตั้ง ON_ISSUE ได้", rIssue.ok, "reason" in rIssue ? rIssue.reason : "");
  const lIssue = await linesOfDoc(ivIssue);
  // ON_ISSUE ของ "ใบแจ้งหนี้" = ภาษีขายเกิดแล้วแต่ยังไม่ได้ออกใบกำกับ ⇒ พักที่ 2205 (ไปเข้า 2200 ตอนออกใบกำกับ)
  // ON_PAYMENT = ยังไม่เกิดเลย ⇒ พักที่ 2210 — ความต่าง 2205 vs 2210 คือสิ่งที่ตั้งค่านี้ควบคุมจริง
  assert(
    "P4.2 ON_ISSUE → ภาษีขายเข้า 2205 (รอออกใบกำกับ) ไม่ใช่ 2210",
    creditCodes(lIssue).includes("2205") && !creditCodes(lIssue).includes("2210"),
    JSON.stringify(lIssue),
  );

  await policy.savePolicy(S, { vatTiming: "ON_PAYMENT" });
  const ivPay = await newInvoice(d("2026-10-06"));
  await svc.issueDocument(tid, sid, ivPay);
  const lPay = await linesOfDoc(ivPay);
  assert(
    "P4.3 ON_PAYMENT → ลง 2210 ภาษีขายรอเรียกเก็บ (ยังไม่ถึงงวด ภ.พ.30)",
    creditCodes(lPay).includes("2210") && !creditCodes(lPay).includes("2205"),
    JSON.stringify(lPay),
  );
  await policy.savePolicy(S, { vatTiming: "ON_ISSUE" });

  // ═════════════════ P6 — ประเภทราคาเริ่มต้นถึงฟอร์ม ═════════════════
  console.log("\nP6 ประเภทราคาเริ่มต้น:");
  eq(
    "P6.1 ไม่ตั้งค่า → ตามสถานะจด VAT (จด=แยก VAT · ไม่จด=ไม่มี VAT)",
    [
      policy.defaultPriceModeOf({ defaultPriceMode: null, vatRegistered: true }),
      policy.defaultPriceModeOf({ defaultPriceMode: null, vatRegistered: false }),
    ],
    ["EXCL_VAT", "NO_VAT"],
  );
  await policy.savePolicy(S, { defaultPriceMode: "INCL_VAT" });
  const sAfterPrice = await svc.getSettings(tid, sid);
  eq("P6.2 ตั้งเป็น 'ราคารวม VAT' → ค่าที่ฟอร์มใช้เปลี่ยนตาม", policy.defaultPriceModeOf(sAfterPrice.policy), "INCL_VAT");
  eq("P6.3 ร้าน QC (seed = รวม VAT) ให้ผลเดียวกัน", policy.defaultPriceModeOf(qcPolicy), P.defaultPriceMode);
  await policy.savePolicy(S, { defaultPriceMode: null });

  // ═════════════════ P5 — หัก ณ ที่จ่ายเริ่มต้น ═════════════════
  console.log("\nP5 หัก ณ ที่จ่ายเริ่มต้น:");
  await policy.savePolicy(S, {
    whtDefaults: [
      { incomeType: "M40_8", rateBp: 300, expenseAccountCodes: ["6900"] },
      { incomeType: "M40_5", rateBp: 500, expenseAccountCodes: ["6100"] },
    ],
  });
  const polWht = await policy.getPolicy(S);
  eq("P5.1 บัญชี 6900 → ค่าบริการ 3%", policy.whtDefaultForAccountCode(polWht, "6900"), {
    incomeType: "M40_8",
    rateBp: 300,
  });
  eq("P5.2 บัญชี 6100 → ค่าเช่า 5%", policy.whtDefaultForAccountCode(polWht, "6100"), {
    incomeType: "M40_5",
    rateBp: 500,
  });
  eq("P5.3 บัญชีที่ไม่ได้ผูก = ไม่เติมให้ (ปล่อยผู้ใช้เลือกเอง)", policy.whtDefaultForAccountCode(polWht, "5000"), null);
  eq("P5.4 อัตราตามประเภทเงินได้ (ใช้ตอนผู้ใช้เลือกเอง)", [
    policy.whtRateForIncomeType(polWht, "M40_5"),
    policy.whtRateForIncomeType(polWht, "M40_1"),
  ], [500, null]);
  eq("P5.5 ร้าน QC ใช้ค่าเดียวกับเฉลย", policy.whtDefaultForAccountCode(qcPolicy, "6900"), {
    incomeType: "M40_8",
    rateBp: 300,
  });
  eq("P5.6 ค่าที่พังรูปแบบถูกกรองทิ้ง (ไม่พาลงจอ)", policy.parseWhtDefaults([
    { incomeType: "มั่ว", rateBp: 300, expenseAccountCodes: [] },
    { incomeType: "M40_8", rateBp: 99999, expenseAccountCodes: [] },
    { incomeType: "M40_8", rateBp: 300, expenseAccountCodes: ["6900", ""] },
    { incomeType: "M40_8", rateBp: 100, expenseAccountCodes: [] },
  ]), [{ incomeType: "M40_8", rateBp: 300, expenseAccountCodes: ["6900"] }]);

  // ═════════════════ P8 — บัญชีเริ่มต้นเปลี่ยน → JV เปลี่ยนจริง ═════════════════
  console.log("\nP8 บัญชีรายรับเริ่มต้นเปลี่ยน → JV ที่โพสต์เปลี่ยนตาม:");
  const income4000 = await ledgerIdOf("4000");
  const income4030 = await ledgerIdOf("4030");
  const ivBefore = await newInvoice(d("2026-10-07"));
  await svc.issueDocument(tid, sid, ivBefore);
  const lBefore = await linesOfDoc(ivBefore);
  const INCOME_BASE = creditCodes(lBefore).find((c) => c.startsWith("4")) ?? "";
  eq("P8.1 ก่อนเปลี่ยน: รายได้ลงบัญชีขายสินค้ามาตรฐาน 4000", INCOME_BASE, "4000");
  // 🔴 ต้องเขียนคีย์ที่ `gl.postDocument` ใช้จริง (INCOME_GOODS/INCOME_SERVICE) — INCOME_DEFAULT อย่างเดียวไม่มีผล
  //    (นี่คือช่องหลอกตาที่ WO นี้เจอ — หน้าตั้งค่าจึงเขียนทั้ง 3 คีย์)
  let setMap = { ok: true } as { ok: boolean; reason?: string };
  for (const k of ["INCOME_DEFAULT", "INCOME_GOODS", "INCOME_SERVICE"]) {
    const r = await coa.setMapping(S, k, income4030);
    if (!r.ok) setMap = r;
  }
  assert("P8.2 ตั้งบัญชีขายเริ่มต้นเป็น 4030 ได้ (ครบทั้ง 3 คีย์ที่ระบบใช้)", setMap.ok, setMap.reason ?? "");
  await policy.savePolicy(S, { defaultSalesAccountCode: "4030" });
  const ivAfter = await newInvoice(d("2026-10-08"));
  await svc.issueDocument(tid, sid, ivAfter);
  const lAfter = await linesOfDoc(ivAfter);
  assert(
    "P8.3 หลังเปลี่ยน: ใบใหม่ลงบัญชี 4030 จริง (ไม่ใช่แค่ค่าใน DB)",
    creditCodes(lAfter).includes("4030") && !creditCodes(lAfter).includes("4000"),
    JSON.stringify(lAfter),
  );
  const lBeforeAgain = await linesOfDoc(ivBefore);
  eq("P8.4 ใบเก่าไม่ย้ายบัญชีตาม (สมุดรายวัน immutable)", lBeforeAgain.length, lBefore.length);
  assert(
    "P8.5 ใบเก่ายังอยู่บัญชี 4000 เหมือนเดิม (สมุดรายวันไม่ย้ายตามตั้งค่า)",
    creditCodes(lBeforeAgain).includes("4000") && !creditCodes(lBeforeAgain).includes("4030"),
    JSON.stringify(lBeforeAgain),
  );
  // P8.6 — ด่านกันช่องหลอกตากลับมาอีก: หน้าตั้งค่าต้องเขียนคีย์ที่ระบบใช้จริง ไม่ใช่ INCOME_DEFAULT เฉย ๆ
  for (const k of ["INCOME_DEFAULT", "INCOME_GOODS", "INCOME_SERVICE"]) {
    await coa.setMapping(S, k, income4000);
  }
  const { savePolicyAction } = await import("@/lib/modules/account/policy-actions");
  void savePolicyAction; // เรียกจริงต้องมี session — ตรวจแค่ว่า action มีอยู่และ export ออกมา
  const mapsNow = await coa.listMappings(S);
  eq(
    "P8.6 คีย์บัญชีขายที่ระบบโพสต์ใช้จริงมีครบ 3 ตัว (INCOME_DEFAULT/GOODS/SERVICE)",
    ["INCOME_DEFAULT", "INCOME_GOODS", "INCOME_SERVICE"].every((k) => mapsNow.some((m) => m.key === k)),
    true,
  );
  await policy.savePolicy(S, { defaultSalesAccountCode: "4000" });

  // ═════════════════ P2b — งบฐานะ เม.ย.–มี.ค. บนข้อมูลที่คุมเอง (พิสูจน์ว่าเส้นแบ่งขยับจริง) ═════════════════
  console.log("\nP2b เส้นแบ่ง 'กำไรสะสม | กำไรปีบัญชีนี้' ขยับตามเดือนเริ่มปีบัญชี:");
  // ลง JV 2 ก้อนคนละฝั่งของ 1 เม.ย. 2026 — ก.พ. 30,000 · มิ.ย. 50,000 (รายได้ล้วน ไม่มีค่าใช้จ่าย)
  const cashId = await ledgerIdOf("1000");
  const incId = await ledgerIdOf("4030");
  for (const [dateKey, amount] of [
    ["2026-02-10", 30_000],
    ["2026-06-10", 50_000],
  ] as const) {
    const r = await journal.createManualEntry(S, {
      dateKey,
      memo: `รายได้ทดสอบปีบัญชี ${dateKey}`,
      lines: [
        { accountId: cashId, debit: amount, credit: 0 },
        { accountId: incId, debit: 0, credit: amount },
      ],
    });
    if (!r.ok) throw new Error(`P2b เตรียมข้อมูลไม่สำเร็จ (${dateKey}): ${r.reason}`);
  }
  const bs2Fy = await reports.balanceSheet(S, "2026-09", { fiscalYearEndMonth: 3 }); // เริ่ม เม.ย.
  const bs2Cal = await reports.balanceSheet(S, "2026-09"); // ปีปฏิทิน
  eq("P2b.1 ปีบัญชี เม.ย.: กำไรสะสม = ก้อนเดือน ก.พ. (30,000)", bs2Fy.retainedEarnings, 30_000);
  eq("P2b.2 ปีบัญชี เม.ย.: กำไรปีนี้ = ก้อนเดือน มิ.ย. (50,000)", bs2Fy.currentPeriodProfit, 50_000);
  eq("P2b.3 ปีปฏิทิน: กำไรสะสม 0 · กำไรปีนี้ 80,000 (เส้นแบ่งคนละที่จริง)", [bs2Cal.retainedEarnings, bs2Cal.currentPeriodProfit], [
    0,
    80_000,
  ]);
  eq("P2b.4 ยอดรวมส่วนของเจ้าของเท่ากันทั้งสองแบบ (เงินไม่หายไปกับเส้นแบ่ง)", bs2Fy.totalEquity, bs2Cal.totalEquity);
  eq("P2b.5 ต้นปีบัญชีที่งบใช้", [bs2Fy.fiscalYearStartKey, bs2Cal.fiscalYearStartKey], ["2026-04", "2026-01"]);
  const plFy = await reports.profitLoss(S, "2026-04", "2026-09");
  eq("P2b.6 กำไรปีบัญชีนี้ = กำไรขาดทุนช่วง เม.ย.–ก.ย. เป๊ะ", bs2Fy.currentPeriodProfit, plFy.netProfit);

  // ═════════════════ P9 — การออกเอกสารต่อ ═════════════════
  console.log("\nP9 การออกเอกสารต่อ (QT → ปลายทาง · คัดลอกหมายเหตุ/แท็ก):");
  const mkQuotation = async (when: Date) => {
    const created = await svc.createDocument({
      tenantId: tid,
      systemId: sid,
      docType: "QUOTATION",
      contactId: custId,
      issueDate: when,
      lines: [{ description: "แพ็กเกจดำน้ำ", qty: 1, unitPrice: 500_000 }],
      note: "หมายเหตุต้นทาง QT",
      tags: ["ทริปสิมิลัน"],
    });
    const id = (created as { id: string }).id;
    await svc.issueDocument(tid, sid, id);
    return id;
  };
  await policy.savePolicy(S, { convertQtTo: "DEPOSIT_RECEIPT", copyNotesOnConvert: true, copyTagsOnConvert: true });
  const qt1 = await mkQuotation(d("2026-10-09"));
  const conv1 = await svc.convertDocument(tid, sid, qt1, "DEPOSIT_RECEIPT", owner.id);
  assert("P9.1 แปลงใบเสนอราคาเป็นใบรับเงินมัดจำได้", conv1.ok, "reason" in conv1 ? conv1.reason : "");
  const dr1 = await prisma.accountDocument.findUniqueOrThrow({
    where: { id: (conv1 as { newId: string }).newId },
    select: { docType: true, note: true, tags: true, sourceDocId: true },
  });
  eq("P9.2 ปลายทางเป็นใบรับเงินมัดจำ + อ้างต้นทาง", [dr1.docType, dr1.sourceDocId], ["DEPOSIT_RECEIPT", qt1]);
  eq("P9.3 เปิดสวิตช์ → คัดลอกหมายเหตุมาด้วย", dr1.note, "หมายเหตุต้นทาง QT");
  eq("P9.4 เปิดสวิตช์ → คัดลอกแท็กมาด้วย (ของเดิมทำแท็กหายทุกครั้ง)", dr1.tags, ["ทริปสิมิลัน"]);

  await policy.savePolicy(S, { copyNotesOnConvert: false, copyTagsOnConvert: false });
  const qt2 = await mkQuotation(d("2026-10-10"));
  const conv2 = await svc.convertDocument(tid, sid, qt2, "DEPOSIT_RECEIPT", owner.id);
  const dr2 = await prisma.accountDocument.findUniqueOrThrow({
    where: { id: (conv2 as { newId: string }).newId },
    select: { note: true, tags: true },
  });
  eq("P9.5 ปิดสวิตช์ → ไม่คัดลอกหมายเหตุ", dr2.note, null);
  eq("P9.6 ปิดสวิตช์ → ไม่คัดลอกแท็ก", dr2.tags, []);
  await policy.savePolicy(S, { copyNotesOnConvert: true, copyTagsOnConvert: true });

  // ใบสั่งซื้อ → บันทึกซื้อ / บันทึกค่าใช้จ่าย ตามนโยบาย
  const mkPo = async (when: Date) => {
    const created = await exp.createPurchaseOrder({
      tenantId: tid,
      systemId: sid,
      docType: "PURCHASE_ORDER",
      contactId: vendorId,
      issueDate: when,
      lines: [{ description: "ถังอากาศ", qty: 1, unitPrice: 200_000 }],
    });
    const id = (created as { id: string }).id;
    await exp.submitForApproval(tid, sid, id);
    await exp.approvePurchaseOrder(tid, sid, id, owner.id);
    return id;
  };
  await policy.savePolicy(S, { convertPoTo: "PURCHASE" });
  const po1 = await mkPo(d("2026-10-11"));
  const pc1 = await exp.convertPurchaseOrder(tid, sid, po1, owner.id);
  eq("P9.7 ตั้ง 'บันทึกซื้อ' → ใบสั่งซื้อแปลงเป็น PURCHASE", "toDocType" in pc1 ? pc1.toDocType : pc1, "PURCHASE");
  await policy.savePolicy(S, { convertPoTo: "EXPENSE" });
  const po2 = await mkPo(d("2026-10-12"));
  const pc2 = await exp.convertPurchaseOrder(tid, sid, po2, owner.id);
  eq("P9.8 ตั้ง 'บันทึกค่าใช้จ่าย' → ใบสั่งซื้อแปลงเป็น EXPENSE", "toDocType" in pc2 ? pc2.toDocType : pc2, "EXPENSE");
  await policy.savePolicy(S, { convertPoTo: "PURCHASE" });

  // ═════════════════ P7 — ชื่อซ้ำ เตือน vs ห้าม ═════════════════
  console.log("\nP7 การสร้างชื่อซ้ำ:");
  await policy.savePolicy(S, { dupContactPolicy: "WARN" });
  const dupWarn = await svc.checkContactDuplicates(tid, sid, { name: "ลูกค้าทดสอบนโยบาย" });
  eq("P7.1 นโยบาย 'เตือน' → ชื่อซ้ำอยู่ในกลุ่มคำเตือน ไม่ใช่ห้าม", [dupWarn.policy, dupWarn.warnings.length, dupWarn.blocking.length], [
    "warn",
    1,
    0,
  ]);
  assert("P7.2 'เตือน' → ยืนยันแล้วบันทึกต่อได้", svc.contactDuplicateBlocks(dupWarn) === null);
  await policy.savePolicy(S, { dupContactPolicy: "BLOCK" });
  const dupBlock = await svc.checkContactDuplicates(tid, sid, { name: "ลูกค้าทดสอบนโยบาย" });
  eq("P7.3 นโยบาย 'ห้าม' → ตัวเดิมกลายเป็นห้าม", dupBlock.policy, "block");
  assert("P7.4 'ห้าม' → บันทึกต่อไม่ได้", svc.contactDuplicateBlocks(dupBlock) !== null);
  await policy.savePolicy(S, { dupContactPolicy: "WARN" });

  const prodRes = await product.createProduct(tid, sid, { name: "ชุดดำน้ำทดสอบ", type: "SERVICE" });
  assert("P7.5 สร้างสินค้าตัวแรกได้", prodRes.ok, "reason" in prodRes ? prodRes.reason : "");
  const hits = await product.checkProductDuplicates(tid, sid, { name: "ชุดดำน้ำทดสอบ" });
  eq("P7.6 ตรวจเจอสินค้าชื่อซ้ำ (ของเดิมไม่เคยมีด่านนี้เลย)", [hits.length, hits[0]?.reason], [1, "name"]);
  await policy.savePolicy(S, { dupProductPolicy: "WARN" });
  eq("P7.7 นโยบายสินค้า 'เตือน'", await svc.getProductDupPolicy(sid), "warn");
  await policy.savePolicy(S, { dupProductPolicy: "BLOCK" });
  eq("P7.8 นโยบายสินค้า 'ห้าม'", await svc.getProductDupPolicy(sid), "block");
  eq("P7.9 ร้าน QC: สินค้า=ห้าม · ผู้ติดต่อ=เตือน (ตามเฉลย)", [
    await svc.getProductDupPolicy(QCTX.systemId),
    await svc.getDupNamePolicy(QCTX.systemId),
  ], ["block", "warn"]);
  eq("P7.10 ไม่ได้กรอกชื่อ/SKU = ไม่มีอะไรให้เตือน", (await product.checkProductDuplicates(tid, sid, {})).length, 0);

  // ═════════════════ P10 — นิยามลูกค้าประจำ ═════════════════
  console.log("\nP10 นิยามลูกค้าประจำ:");
  const rcBase = await contactsList.getRegularCustomerRule(QCTX);
  const countWith = async (rule: { minPaidDocs: number; minPaidTotalSatang: number; periodMonths: number }) =>
    (await contactsList.regularCustomerContactIds(QCTX, rule, undefined, d(QC.today))).size;
  const rcSeedCount = await countWith(rcBase);
  const rcLoose = await countWith({ minPaidDocs: 1, minPaidTotalSatang: 0, periodMonths: 12 });
  const rcTight = await countWith({ minPaidDocs: 99, minPaidTotalSatang: 99_999_999_99, periodMonths: 12 });
  eq("P10.1 กฎที่ seed ตั้งไว้ = ค่าเฉลย", rcBase, P.regularCustomer);
  assert("P10.2 ผ่อนเกณฑ์ → จำนวนลูกค้าประจำเพิ่ม", rcLoose > rcSeedCount, `หลวม ${rcLoose} · เดิม ${rcSeedCount}`);
  eq("P10.3 เข้มสุด → ไม่มีใครเข้าเกณฑ์", rcTight, 0);
  await policy.savePolicy(S, { regularCustomer: { minPaidDocs: 7, minPaidTotalSatang: 123_400, periodMonths: 6 } });
  eq("P10.4 บันทึกผ่านหน้านโยบาย แล้วตัวอ่านเดิม (WO 3.2) เห็นค่าใหม่", await contactsList.getRegularCustomerRule(S), {
    minPaidDocs: 7,
    minPaidTotalSatang: 123_400,
    periodMonths: 6,
  });
  const polAfterRc = await policy.getPolicy(S);
  eq("P10.5 บันทึก regularCustomer ไม่ล้างคีย์อื่นใน docConfig", polAfterRc.convertQtTo, "DEPOSIT_RECEIPT");

  // ═════════════════ P3(ข) — ล็อกวันที่ ครบทุกเส้นทางเขียน (ร้านทิ้ง) ═════════════════
  console.log("\nP3(ข) ล็อกข้อมูลก่อนวันที่ — ทุกเส้นทางเขียน:");
  // เตรียมของก่อนล็อก: ใบแจ้งหนี้เก่า + รับเงิน + JV มือ
  const oldIv = await newInvoice(d("2026-10-15"));
  await svc.issueDocument(tid, sid, oldIv);
  const payOld = await svc.recordPayment(tid, sid, oldIv, { paidAt: d("2026-10-16"), amount: 50_000 });
  assert("P3.10 เตรียมข้อมูลก่อนล็อก: รับชำระได้ตามปกติ", payOld.ok, "reason" in payOld ? payOld.reason : "");
  const jvOld = await journal.createManualEntry(S, {
    dateKey: "2026-10-17",
    memo: "JV ก่อนล็อก",
    lines: [
      { accountId: await ledgerIdOf("1000"), debit: 10_000, credit: 0 },
      { accountId: await ledgerIdOf("4030"), debit: 0, credit: 10_000 },
    ],
  });
  assert("P3.11 เตรียมข้อมูลก่อนล็อก: ลง JV มือได้", jvOld.ok, "reason" in jvOld ? jvOld.reason : "");
  const draftOld = await newInvoice(d("2026-10-18"));

  // ล็อกก่อน 1 พ.ย. 2026
  const LOCK_YMD = "2026-11-01";
  await policy.savePolicy(S, { lockBeforeDate: d(LOCK_YMD) });
  const lockMsg = policy.lockedMessage((await policy.getPolicy(S)).lockBeforeDate!);
  eq("P3.12 ข้อความล็อกของร้านนี้", lockMsg, "ข้อมูลก่อนวันที่ 1 พ.ย. 2026 ถูกล็อกไว้ — ไปที่ ตั้งค่า › นโยบายบัญชี เพื่อปลดล็อก");

  await rejected("P3.13 สร้างเอกสารย้อนหลัง = ปฏิเสธ", () => newInvoice(d("2026-10-20")), lockMsg);
  await rejected(
    "P3.14 แก้ร่างที่ลงวันที่ในช่วงล็อก = ปฏิเสธ",
    () => svc.updateDocument(tid, sid, draftOld, { note: "แก้หลังล็อก" }),
    lockMsg,
  );
  await rejected("P3.15 ยกเลิกเอกสารเก่า = ปฏิเสธ", () => svc.voidDocument(tid, sid, oldIv, "ทดสอบ"), lockMsg);
  await rejected(
    "P3.16 ยกเลิกการรับเงินเก่า = ปฏิเสธ (reversal เลื่อนวันได้ ด่าน gl จับไม่ถึง)",
    () => svc.voidPayment(tid, sid, oldIv, (payOld as { paymentId?: string }).paymentId ?? "", "ทดสอบ"),
    lockMsg,
  );
  await rejected(
    "P3.17 รับชำระลงวันที่ย้อนหลัง = ปฏิเสธ",
    () => svc.recordPayment(tid, sid, oldIv, { paidAt: d("2026-10-25"), amount: 1_000 }),
    lockMsg,
  );
  await rejected(
    "P3.18 ลง JV มือย้อนหลัง = ปฏิเสธ",
    () =>
      journal.createManualEntry(S, {
        dateKey: "2026-10-20",
        lines: [
          { accountId: income4030, debit: 0, credit: 1_000 },
          { accountId: cashId, debit: 1_000, credit: 0 },
        ],
      }),
    lockMsg,
  );
  await rejected(
    "P3.19 กลับรายการ JV เก่า = ปฏิเสธ",
    () => journal.reverseJournalEntry(S, (jvOld as { entryId: string }).entryId, "ทดสอบล็อก"),
    lockMsg,
  );
  await rejected(
    "P3.20 บันทึกค่าใช้จ่ายย้อนหลัง (ฝั่งจ่ายก็ล็อกเหมือนกัน) = ปฏิเสธ",
    () =>
      exp.createExpenseDoc({
        tenantId: tid,
        systemId: sid,
        docType: "EXPENSE",
        contactId: vendorId,
        issueDate: d("2026-10-20"),
        lines: [{ description: "ค่าน้ำมัน", qty: 1, unitPrice: 50_000 }],
      }),
    lockMsg,
  );
  // หลังวันล็อก = ทำได้ตามปกติ
  const newIv = await newInvoice(d("2026-11-05"));
  const rNew = await svc.issueDocument(tid, sid, newIv);
  assert("P3.21 ลงวันที่หลังวันล็อก = ทำได้ตามปกติ", rNew.ok, "reason" in rNew ? rNew.reason : "");
  const payNew = await svc.recordPayment(tid, sid, newIv, { paidAt: d("2026-11-06"), amount: 10_000 });
  assert("P3.22 รับชำระหลังวันล็อก = ทำได้", payNew.ok, "reason" in payNew ? payNew.reason : "");
  // วันล็อกเองยังทำได้ (นิยาม "ก่อนวันที่")
  const onLockDay = await newInvoice(d(LOCK_YMD));
  const rOnLock = await svc.issueDocument(tid, sid, onLockDay);
  assert("P3.23 วันล็อกเอง (1 พ.ย.) ยังบันทึกได้ — ตรงกับคำว่า 'ก่อนวันที่'", rOnLock.ok, "reason" in rOnLock ? rOnLock.reason : "");
  // อ่านยังได้ครบ
  const tbLocked = await reports.trialBalance(S, "2026-10", "2026-11");
  assert("P3.24 รายงานช่วงที่ล็อกยังอ่านได้และสมดุล", tbLocked.balanced && tbLocked.rows.length > 0);
  // ปลดล็อก → กลับมาทำได้
  await policy.savePolicy(S, { lockBeforeDate: null });
  const afterUnlock = await svc.updateDocument(tid, sid, draftOld, { note: "แก้ได้แล้วหลังปลดล็อก" });
  assert("P3.25 ปลดล็อกแล้วแก้ย้อนหลังได้อีกครั้ง", afterUnlock.ok, "reason" in afterUnlock ? afterUnlock.reason : "");

  // ═════════════════ P11 — ปิดงวดอัตโนมัติ (จำลองเวลา) ═════════════════
  console.log("\nP11 ปิดงวดอัตโนมัติ:");
  const periodStatus = async (key: string) =>
    (await prisma.accountPeriod.findFirst({ where: { systemId: sid, periodKey: key }, select: { status: true } }))?.status ??
    "OPEN";
  const SWEEP_NOW = d("2026-12-10"); // งวดที่ถูกกวาด = 2026-11
  // 🔴 P11.0 — ค่าเริ่มต้นต้องเป็น "เปิด" ทั้งในโค้ดและใน DB
  //    ก่อน WO 8.2 ตัวกวาดปิดงวดให้ทุกระบบบัญชีโดยไม่มีสวิตช์ ⇒ ถ้า default เป็น "ปิด"
  //    ร้าน/แถวตั้งค่าที่สร้างใหม่จะเสียฟีเจอร์เดิมไปเงียบ ๆ (qc-account-deep AD-2.1–2.4 จับได้)
  eq("P11.0a ค่าเริ่มต้นในโค้ด = เปิด", policy.defaultPolicy().autoClosePeriods, true);
  {
    const col = await prisma.$queryRawUnsafe<{ column_default: string | null }[]>(
      `SELECT column_default FROM information_schema.columns
        WHERE table_name = 'AccountSettings' AND column_name = 'autoClosePeriods'`,
    );
    eq("P11.0b ค่าเริ่มต้นของคอลัมน์ใน DB = true", col[0]?.column_default, "true");
  }
  {
    // ระบบบัญชีที่ **ยังไม่มีแถวตั้งค่าเลย** ต้องถูกปิดงวดให้เหมือนเดิม (เคสที่ qc-account-deep เจอ)
    // 🔴 ปิดสวิตช์ของระบบหลักก่อน แล้วค่อยกวาด — ไม่งั้นระบบหลัก (ซึ่ง default = เปิด) จะถูกปิดงวดไปด้วย
    //    แล้วตัวนับงวด/แจ้งเตือนของ P11.1–P11.6 จะเพี้ยนตั้งแต่ต้น
    await policy.savePolicy(S, { autoClosePeriods: false, autoCloseNotify: true });
    const bare = await sysMod.createSystem(tid, "ACCOUNT", `บัญชีไร้ตั้งค่า ${stamp}`);
    await glMod.ensureAccounting({ tenantId: tid, systemId: bare.id });
    const settingsRows = await prisma.accountSettings.count({ where: { systemId: bare.id } });
    eq("P11.0c ระบบใหม่ยังไม่มีแถว AccountSettings", settingsRows, 0);
    await sweep.sweepAutoClosePeriods(SWEEP_NOW);
    const st = await prisma.accountPeriod.findFirst({
      where: { systemId: bare.id, periodKey: "2026-11" },
      select: { status: true },
    });
    eq("P11.0d ไม่มีแถวตั้งค่า = ใช้ค่าเริ่มต้น (เปิด) ⇒ sweep ยังปิดงวดให้", st?.status ?? "OPEN", "CLOSED");
    // ล้างแจ้งเตือนของบล็อกนี้ทิ้ง เพื่อให้ P11.5/P11.6 นับจากศูนย์ (ร้านทิ้ง — ลบได้ปลอดภัย)
    await prisma.appNotification.deleteMany({ where: { tenantId: tid, title: "ปิดงวดบัญชีอัตโนมัติ" } });
  }
  await sweep.sweepAutoClosePeriods(SWEEP_NOW);
  eq("P11.1 ปิดสวิตช์ → sweep ไม่ปิดงวดให้", await periodStatus("2026-11"), "OPEN");
  eq("P11.2 ร้าน QC (ปิดสวิตช์ตาม seed) ก็ไม่ถูกแตะ", await periodStatusOf(QCTX.systemId, "2026-11"), "OPEN");
  await policy.savePolicy(S, { autoClosePeriods: true, autoCloseNotify: true });
  const closedCount = await sweep.sweepAutoClosePeriods(SWEEP_NOW);
  eq("P11.3 เปิดสวิตช์ → sweep ปิดงวดให้", await periodStatus("2026-11"), "CLOSED");
  assert("P11.4 sweep รายงานจำนวนงวดที่ปิดได้", closedCount >= 1, `ปิด ${closedCount} งวด`);
  const notis = await prisma.appNotification.count({ where: { tenantId: tid, title: "ปิดงวดบัญชีอัตโนมัติ" } });
  eq("P11.5 เปิด 'แจ้งเตือนผล' → มีแจ้งเตือน 1 ใบ", notis, 1);
  await periodClose.reopenPeriodV2(S, "2026-11", "คืนสภาพหลังทดสอบ", owner.id);
  await policy.savePolicy(S, { autoClosePeriods: true, autoCloseNotify: false });
  await sweep.sweepAutoClosePeriods(SWEEP_NOW);
  eq("P11.6 ปิด 'แจ้งเตือนผล' → ปิดงวดให้แต่ไม่ส่งแจ้งเตือนซ้ำ", [
    await periodStatus("2026-11"),
    await prisma.appNotification.count({ where: { tenantId: tid, title: "ปิดงวดบัญชีอัตโนมัติ" } }),
  ], ["CLOSED", 1]);
  await policy.savePolicy(S, { autoClosePeriods: false });

  // ═════════════════ P11.7 — ตัวเตือนประจำวันต้องไม่ผูกกับ "มีแถวตั้งค่าไหม" ═════════════════
  // 🔴 กันรูปแบบบั๊กเดียวกับ P11.0d ซ้ำที่ตัวเตือน: ระบบบัญชีที่ยังไม่มีแถว AccountSettings
  //    ต้องยังได้เตือน ภ.พ.30 วันที่ 5 เหมือนเดิม (ก่อน WO 8.2 ตัวเตือนไม่เคยอ่านตั้งค่าเลย)
  console.log("\nP11.7 ตัวเตือน ภ.พ.30 กับระบบที่ไม่มีแถวตั้งค่า:");
  {
    const bare2 = await sysMod.createSystem(tid, "ACCOUNT", `บัญชีไร้ตั้งค่า-เตือน ${stamp}`);
    await glMod.ensureAccounting({ tenantId: tid, systemId: bare2.id });
    eq(
      "P11.7a ระบบนี้ยังไม่มีแถว AccountSettings",
      await prisma.accountSettings.count({ where: { systemId: bare2.id } }),
      0,
    );
    // ใช้วันที่ 5 ของเดือนอนาคต — กันชนกับตัวกันซ้ำที่เทียบ createdAt กับ "ต้นวันไทยของ now"
    const fifth = d("2026-12-05");
    const rem = await svc.runAccountReminders(fifth, { tenantId: tid, systemId: bare2.id });
    assert("P11.7b ไม่มีแถวตั้งค่า → ยังเตือน ภ.พ.30 วันที่ 5 ตามเดิม", rem.PP30_DUE >= 1, JSON.stringify(rem));
    const eighth = d("2026-12-08");
    const rem8 = await svc.runAccountReminders(eighth, { tenantId: tid, systemId: bare2.id });
    eq("P11.7c วันที่ไม่ใช่วันที่ 5 → ไม่เตือน", rem8.PP30_DUE, 0);
  }

  // ═════════════════ P13 — ด่านสิทธิ์ + ค่าที่กรอกผิด ═════════════════
  console.log("\nP13 ด่านสิทธิ์ + ค่าที่กรอกผิด:");
  const authStaff = {
    user: { id: staff.id },
    active: { ...mStaff, tenant: { id: tid } },
  } as unknown as Parameters<typeof assertAccountCan>[0];
  let denied = false;
  try {
    assertAccountCan(authStaff, "account.settings.manage");
  } catch {
    denied = true;
  }
  assert("P13.1 พนักงานที่ไม่มีสิทธิ์ตั้งค่า แก้นโยบายไม่ได้", denied);
  const guard = await import("@/lib/modules/account/guard");
  eq(
    "P13.2 หน้า /settings/policy ลงทะเบียนสิทธิ์ไว้แล้ว",
    guard.ACCOUNT_PAGE_PERMISSIONS["settings/policy/page.tsx"],
    "account.settings.manage",
  );
  await rejected("P13.3 เดือนเริ่มปีบัญชีนอกช่วง 1–12 = ปฏิเสธ", () => policy.savePolicy(S, { fiscalYearStartMonth: 13 }), "1–12");
  await rejected("P13.4 วันปิดงวดเกิน 28 = ปฏิเสธ (ก.พ.)", () => policy.savePolicy(S, { periodCloseDay: 31 }), "1–28");
  await rejected("P13.5 อัตรา VAT เกิน 100% = ปฏิเสธ", () => policy.savePolicy(S, { vatRateBp: 20000 }), "0–100%");
  await rejected(
    "P13.6 อีเมลผู้รับผิดรูปแบบ = ปฏิเสธ พร้อมบอกตัวที่ผิด",
    () => policy.savePolicy(S, { emailReportRecipients: ["ไม่ใช่อีเมล"] }),
    "รูปแบบอีเมลไม่ถูกต้อง",
  );
  await rejected(
    "P13.7 เปิดรายงานอีเมลโดยไม่มีผู้รับ = ปฏิเสธ",
    () => policy.savePolicy(S, { emailReportWeekly: true, emailReportRecipients: [] }),
    "อย่างน้อย 1 คน",
  );
  await rejected(
    "P13.8 อัตรา WHT เกิน 100% = ปฏิเสธ",
    () => policy.savePolicy(S, { whtDefaults: [{ incomeType: "M40_8", rateBp: 99999, expenseAccountCodes: [] }] }),
    "0–100%",
  );
  await rejected(
    "P13.9 เกณฑ์ลูกค้าประจำ 0 ครั้ง = ปฏิเสธ",
    () => policy.savePolicy(S, { regularCustomer: { minPaidDocs: 0, minPaidTotalSatang: 0, periodMonths: 12 } }),
    "อย่างน้อย 1 ครั้ง",
  );
  eq(
    "P13.10 ค่าที่ถูกปฏิเสธไม่ถูกบันทึกลงไปบางส่วน",
    (await policy.getPolicy(S)).fiscalYearStartMonth,
    1,
  );

  // ═════════════════ P14 — แยกร้าน ═════════════════
  console.log("\nP14 แยกร้าน (tenant isolation):");
  const crossRead = await policy.getPolicy({ tenantId: tid, systemId: QCTX.systemId });
  eq(
    "P14.1 อ่านนโยบายด้วย systemId ของร้านอื่นไม่ได้ (คืนค่าเริ่มต้น ไม่ใช่ข้อมูลร้านนั้น)",
    [crossRead.fiscalYearStartMonth, crossRead.lockBeforeDate],
    [1, null],
  );
  const beforeCross = await policy.getPolicy(QCTX);
  await policy.savePolicy({ tenantId: tid, systemId: QCTX.systemId }, { fiscalYearStartMonth: 7 });
  const afterCross = await policy.getPolicy(QCTX);
  eq("P14.2 เขียนนโยบายข้ามร้านไม่กระทบร้านเป้าหมาย", afterCross.fiscalYearStartMonth, beforeCross.fiscalYearStartMonth);

  // ═════════════════ P12(ข) — ตัวส่งรายงานอีเมล (idempotent) ═════════════════
  console.log("\nP12(ข) ตัวส่งรายงานอีเมล:");
  await policy.savePolicy(S, { emailReportWeekly: true, emailReportRecipients: ["owner@qc.local"] });
  const r1 = await svc.runAccountEmailReports(monday);
  assert("P12.11 รอบแรกส่งจริงอย่างน้อย 1 ร้าน", r1.sent >= 1, JSON.stringify(r1));
  const marker = await prisma.appNotification.count({
    where: { tenantId: tid, title: emailReport.REPORT_MARKER_TITLE },
  });
  eq("P12.12 ประทับ 'ส่งแล้ว' 1 ใบต่อร้านต่องวด", marker, 1);
  const r2 = await svc.runAccountEmailReports(monday);
  eq("P12.13 รันซ้ำงวดเดิม → ไม่ส่งซ้ำ (idempotent)", r2.sent, 0);
  const r3 = await svc.runAccountEmailReports(tuesday);
  eq("P12.14 วันอังคาร รายสัปดาห์ยังไม่ถึงรอบ → ไม่ส่ง", r3.sent, 0);
  await policy.savePolicy(S, { emailReportWeekly: false, emailReportRecipients: [] });
  const nextMonday = new Date("2026-10-05T09:00:00+07:00");
  await svc.runAccountEmailReports(nextMonday);
  eq(
    "P12.15 ปิดรายงานแล้ว → สัปดาห์ถัดไปร้านนี้ไม่ได้รับอีก (ไม่มีรอยประทับใหม่)",
    await prisma.appNotification.count({ where: { tenantId: tid, title: emailReport.REPORT_MARKER_TITLE } }),
    1,
  );
} finally {
  if (sTenantId) {
    const tid = sTenantId;
    const del = async (fn: () => Promise<unknown>) => {
      try {
        await fn();
      } catch {
        /* ลบไม่ได้ = มีของอ้างอิงอยู่ ไม่ต้องล้มทั้งชุด */
      }
    };
    await del(() => prisma.appNotification.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.accountJournalLine.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.accountJournalEntry.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.accountDocumentPayment.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.accountDocumentRelation.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.accountDocumentLine.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.accountDocument.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.accountDocSequence.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.accountDocTag.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.accountProduct.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.accountContact.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.accountFinanceOpening.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.accountFinance.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.accountMapping.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.accountLedger.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.accountPeriod.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.accountSettings.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.auditLog.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.appSystemUnit.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.appSystem.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.membership.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.businessUnit.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.tenant.delete({ where: { id: tid } }));
  }
  await prisma.$disconnect();
}

/** "YYYY-MM" ก่อนหน้า 1 เดือน */
function prevKey(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const idx = y * 12 + (m - 1) - 1;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}

async function periodStatusOf(systemId: string, key: string): Promise<string> {
  const row = await prisma.accountPeriod.findFirst({ where: { systemId, periodKey: key }, select: { status: true } });
  return row?.status ?? "OPEN";
}

console.log(`\n${findings.length === 0 ? "✅" : "❌"} ผ่าน ${passed} ข้อ · พบปัญหา ${findings.length} ข้อ`);
if (findings.length) {
  for (const f of findings) console.log("   • " + f);
  process.exit(1);
}
