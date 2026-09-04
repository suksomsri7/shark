// QC WO 5.3 — กระทบยอดธนาคาร (bank reconciliation) — DESIGN-SPEC-V2 §10.2 · เฟรม g10
//
// requires: acc-v2-seed (seed จะสร้าง fixture + นำเข้า statement + จับคู่อัตโนมัติให้แล้ว)
// รัน (บังคับ DB QC branch):
//   QC_ENV_FILE=.env.qc pnpm tsx scripts/seed-acc-v2-qc.mts
//   QC_ENV_FILE=.env.qc pnpm tsx scripts/qc-acc-v2-reconcile.mts
//
// 🔴 ร้าน QC จริง (SIAM DIVE QC) = **อ่านอย่างเดียว** · การเขียนทั้งหมด (นำเข้า/จับคู่/สร้างรายการ/
//    ยืนยัน/เปิดกลับ) เกิดใน "ร้านทิ้ง" ที่สคริปต์สร้างเองแล้วลบใน finally (กติกาเดียวกับ WO 5.2)
//    ร้านทิ้งจำลองบรรทัดสมุดรายวันของ BSV001 ก.ย. ให้เหมือน seed เป๊ะ (ยอด+วันจากไฟล์ fixture)
//    แล้วนำเข้าไฟล์ fixture ตัวเดียวกัน ⇒ ผลจับคู่ต้องออกมาเท่ากับเฉลย
//
// ครอบคลุม
//   RC1  ตัวอ่าน CSV: KBank fixture (BOM · พ.ศ. · คั่นหลักพัน · ถอน/ฝากแยกคอลัมน์ · ยอดคงเหลือ)
//   RC2  ตัวอ่าน CSV: SCB fixture (วงเล็บ = ติดลบ · วันที่ 4 แบบ · เดือนไทย)
//   RC3  ตัวอ่าน CSV: KTB (เดบิต/เครดิต) · BBL (Withdrawal/Deposit) · GENERIC (คอลัมน์เดียวมีเครื่องหมาย) + detectBankSource
//   RC4  parseAmountSatang / parseThaiDate รายกรณี (รวมกรณีอ่านไม่ออก → null ไม่ใช่ 0)
//   RC5  แถวเสียในไฟล์ = error ต่อแถว (ไม่ทำให้ทั้งไฟล์ล้ม)
//   RC6  สรุปของ seed (ร้านจริง อ่านอย่างเดียว) = เฉลยอิสระใน expected.bankReconcile
//   RC7  นำเข้าในร้านทิ้ง: n แถว · นำเข้าไฟล์เดิมซ้ำ = 0 แถวใหม่ (fingerprint)
//   RC8  autoMatch = เฉลย (จับคู่ / แนะนำ / รอจับคู่) · ส่วนต่างก่อนแก้ = เฉลยอิสระ
//   RC9  manualMatch คู่ที่แนะนำสำเร็จ · จำนวนไม่ตรงถูกปฏิเสธ · จับคู่บรรทัดที่ถูกใช้แล้วถูกปฏิเสธ
//   RC10 createEntryFromLine ค่าธรรมเนียม+ดอกเบี้ย → JV สมดุล · ทิศบัญชีถูก · เรียกซ้ำไม่โพสต์เบิ้ล
//   RC11 ส่วนต่าง = 0 → ยืนยันได้ · ยืนยันซ้ำถูกปฏิเสธ · แก้การจับคู่หลังล็อกถูกปฏิเสธ · เปิดกลับได้
//   RC12 unmatch คืนสถานะ + ปลดบรรทัดสมุดรายวัน
//   RC13 หลังยืนยันแล้ว ยังลงบัญชีวันที่ในเดือนนั้นได้ (ไม่บล็อกงานบัญชี) และรายการนั้นโผล่เป็นรายการรอกระทบยอด
//   RC14 guard: ไม่มีสิทธิ์ account.reconcile ถูกปฏิเสธ
//   RC15 tenant isolation: แถว/บรรทัดของอีกร้านแตะไม่ได้
//   RC16 ไม่เขียนครึ่ง ๆ กลาง ๆ เมื่อ action ล้ม (บัญชีคู่ผิด → ไม่มี JV และสถานะแถวไม่เปลี่ยน)

const accEnv = (await import("./acc-v2-env.mts" as string)) as {
  loadQcEnv: () => { databaseUrl: string; host: string };
  QC: { expectedPath: string };
};
const { loadQcEnv, QC } = accEnv;
const { host } = loadQcEnv();

const { readFileSync } = await import("node:fs");
const { prisma } = await import("@/lib/core/db");
const sysMod = await import("@/lib/modules/system/service");
const glMod = await import("@/lib/modules/account/gl");
const fin = await import("@/lib/modules/account/finance");
const rec = await import("@/lib/modules/account/reconcile");
const csvMod = await import("@/lib/modules/account/bank-statement-csv");
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
const rejected = async (name: string, fn: () => Promise<{ ok: boolean } | unknown>, mustContain?: string) => {
  try {
    const r = (await fn()) as { ok?: boolean; reason?: string };
    if (r && r.ok === false) {
      if (mustContain && !(r.reason ?? "").includes(mustContain)) {
        bad(name, `ปฏิเสธแล้วแต่เหตุผลไม่ตรง: "${r.reason}" (ต้องมี "${mustContain}")`);
        return;
      }
      ok(`${name} (เหตุผล: ${r.reason})`);
      return;
    }
    bad(name, `ไม่ถูกปฏิเสธ — ได้ ${JSON.stringify(r)}`);
  } catch (e) {
    ok(`${name} (โยน: ${e instanceof Error ? e.message : String(e)})`);
  }
};

console.log(`\n===== QC WO 5.3 · กระทบยอดธนาคาร =====`);
console.log(`[env] DB ${host}\n`);

type BankExpected = {
  financeId: string;
  financeCode: string;
  ledgerCode: string;
  periodKey: string;
  openingSatang: number;
  systemClosingSatang: number;
  statementClosingSatang: number;
  differenceBeforeSatang: number;
  rowCount: number;
  expectMatched: number;
  expectSuggested: number;
  expectUnmatched: number;
  nearMatch: { docNo: string; amountSatang: number; glDayKey: string; statementDayKey: string };
  feeSatang: number;
  interestSatang: number;
  fileName: string;
  imported: number;
  autoMatched: number;
  autoSuggested: number;
  autoUnmatched: number;
};
type Expected = { tenantId: string; systemId: string; bankReconcile: BankExpected };
const expected = JSON.parse(readFileSync(QC.expectedPath, "utf8")) as Expected;
const { tenantId, systemId } = expected;
const B = expected.bankReconcile;
const fixtureCsv = readFileSync("scripts/fixtures/acc-v2/kbank-2026-09.csv", "utf8");
const scbCsv = readFileSync("scripts/fixtures/acc-v2/scb-sample.csv", "utf8");

let sTenantId: string | null = null;
let ownerId: string | null = null;
let staffId: string | null = null;

try {
  // ═════════ RC1 — ตัวอ่าน CSV กสิกรไทย (ไฟล์ fixture จริง) ═════════
  console.log("RC1 ตัวอ่าน CSV กสิกรไทย (fixture จริงของ seed):");
  const kb = csvMod.parseBankStatementCsv(fixtureCsv, "KBANK");
  eq("RC1.1 จำนวนแถว = เฉลย", kb.rows.length, B.rowCount);
  eq("RC1.2 ไม่มีแถวอ่านไม่ออก", kb.errors.length, 0);
  eq("RC1.3 ยอดคงเหลือปลายงวดจากไฟล์ = เฉลย", kb.closingFromFile, B.statementClosingSatang);
  eq("RC1.4 ยอดยกมาที่คำนวณจากไฟล์ = เฉลย", kb.openingFromFile, B.openingSatang);
  eq("RC1.5 Σ ทุกแถว = ปลายงวด − ต้นงวด", kb.rows.reduce((s, r) => s + r.amountSatang, 0), B.statementClosingSatang - B.openingSatang);
  assert("RC1.6 ตัด BOM หัวไฟล์ (คอลัมน์แรกชื่อ 'วันที่')", kb.headers[0] === "วันที่", `ได้ "${kb.headers[0]}"`);
  const feeRow = kb.rows.find((r) => r.amountSatang === B.feeSatang);
  const intRow = kb.rows.find((r) => r.amountSatang === B.interestSatang);
  assert("RC1.7 แถวค่าธรรมเนียม −250.00 อ่านได้เป็นเงินออก", !!feeRow, "ไม่พบแถว");
  assert("RC1.8 แถวดอกเบี้ย +12.35 อ่านได้เป็น 1235 สตางค์ (ไม่ปัดเพี้ยน)", intRow?.amountSatang === 1235, `ได้ ${intRow?.amountSatang}`);
  assert("RC1.9 fingerprint ไม่ซ้ำกันเองในไฟล์", new Set(kb.rows.map((r) => r.fingerprint)).size === kb.rows.length);
  const kb2 = csvMod.parseBankStatementCsv(fixtureCsv, "KBANK");
  eq("RC1.10 อ่านไฟล์เดิมซ้ำได้ fingerprint ชุดเดิม (deterministic)", kb2.rows.map((r) => r.fingerprint), kb.rows.map((r) => r.fingerprint));

  // ═════════ RC2 — SCB ═════════
  console.log("\nRC2 ตัวอ่าน CSV ไทยพาณิชย์ (วงเล็บ=ติดลบ · วันที่ 4 แบบ):");
  const scb = csvMod.parseBankStatementCsv(scbCsv, "SCB");
  eq("RC2.1 อ่านได้ 4 แถว ไม่มี error", [scb.rows.length, scb.errors.length], [4, 0]);
  eq("RC2.2 ยอดทั้ง 4 แถว (+5000 / −35 / −1000 / +12.35 บาท)", scb.rows.map((r) => r.amountSatang), [500_000, -3_500, -100_000, 1_235]);
  const dayOf = (d: Date) => new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
  eq(
    "RC2.3 วันที่ทั้ง 4 แบบ (พ.ศ.4หลัก · ค.ศ. · เดือนไทย · พ.ศ.2หลัก) → 1–4 ก.ย. 2026",
    scb.rows.map((r) => dayOf(r.txDate)),
    ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"],
  );

  // ═════════ RC3 — KTB / BBL / GENERIC + detect ═════════
  console.log("\nRC3 ตัวอ่าน CSV กรุงไทย · กรุงเทพ · รูปแบบทั่วไป:");
  const ktbCsv = ["วันที่,เลขที่เช็ค,เดบิต,เครดิต,ยอดคงเหลือ,รายการ", "05/09/2569,CHQ001,\"2,500.00\",,\"97,500.00\",จ่ายเช็ค", "06/09/2569,,,\"1,000.00\",\"98,500.00\",รับโอน"].join("\n");
  const ktb = csvMod.parseBankStatementCsv(ktbCsv, "KTB");
  eq("RC3.1 KTB: 2 แถว ยอด −2,500 / +1,000", [ktb.rows.length, ktb.rows[0]?.amountSatang, ktb.rows[1]?.amountSatang], [2, -250_000, 100_000]);
  eq("RC3.2 KTB: อ่านเลขที่เช็คเป็น refNo", ktb.rows[0]?.refNo, "CHQ001");

  const bblCsv = ["Date,Description,Cheque No.,Withdrawal,Deposit,Balance", "07/09/2026,Transfer in,,,\"3,000.00\",\"50,000.00\"", "08/09/2026,Bank charge,,25.00,,\"49,975.00\""].join("\n");
  const bbl = csvMod.parseBankStatementCsv(bblCsv, "BBL");
  eq("RC3.3 BBL (หัวอังกฤษ): 2 แถว ยอด +3,000 / −25", [bbl.rows.length, bbl.rows[0]?.amountSatang, bbl.rows[1]?.amountSatang], [2, 300_000, -2_500]);

  const genCsv = ["วันที่,รายละเอียด,จำนวนเงิน", "09/09/2569,โอนเข้า,\"1,500.00\"", "10/09/2569,โอนออก,-750.25"].join("\n");
  const gen = csvMod.parseBankStatementCsv(genCsv, "GENERIC");
  eq("RC3.4 GENERIC (คอลัมน์เดียวมีเครื่องหมาย): +1,500 / −750.25", gen.rows.map((r) => r.amountSatang), [150_000, -75_025]);
  eq("RC3.5 detectBankSource: หัว SCB → SCB", csvMod.detectBankSource(csvMod.parseBankStatementCsv(scbCsv, "GENERIC").headers), "SCB");
  eq("RC3.6 detectBankSource: หัว KTB → KTB", csvMod.detectBankSource(["วันที่", "เดบิต", "เครดิต"]), "KTB");
  eq("RC3.7 เลือก GENERIC แล้วไฟล์เป็น KBank → เดาเป็น KBANK ให้", csvMod.parseBankStatementCsv(fixtureCsv, "GENERIC").source, "KBANK");

  // ═════════ RC4 — parseAmountSatang / parseThaiDate ═════════
  console.log("\nRC4 อ่านจำนวนเงิน/วันที่ รายกรณี:");
  const A = csvMod.parseAmountSatang;
  eq("RC4.1 '1,234.56' → 123456", A("1,234.56"), 123_456);
  eq("RC4.2 '(250.00)' → −25000 (วงเล็บ = ติดลบตามธรรมเนียมบัญชี)", A("(250.00)"), -25_000);
  eq("RC4.3 '−250' (unicode minus) → −25000", A("−250"), -25_000);
  eq("RC4.4 '12.35' → 1235 (ไม่ปัดเพี้ยนแบบ float)", A("12.35"), 1_235);
  eq("RC4.5 '250.00 DR' → −25000", A("250.00 DR"), -25_000);
  eq("RC4.6 ช่องว่าง/'-' → 0", [A(""), A("-")], [0, 0]);
  eq("RC4.7 'ยอดยกมา' (อ่านไม่ออก) → null ไม่ใช่ 0", A("ยอดยกมา"), null);
  eq("RC4.8 '฿ 1 234.50' (มีสัญลักษณ์+ช่องว่างคั่นพัน) → 123450", A("฿ 1 234.50"), 123_450);

  const D = csvMod.parseThaiDate;
  eq("RC4.9 '01/09/2569' (พ.ศ.) → 2026-09-01", D("01/09/2569") && dayOf(D("01/09/2569")!), "2026-09-01");
  eq("RC4.10 '01/09/2026' (ค.ศ.) → 2026-09-01", D("01/09/2026") && dayOf(D("01/09/2026")!), "2026-09-01");
  eq("RC4.11 '01/09/69' (พ.ศ. 2 หลัก) → 2026-09-01", D("01/09/69") && dayOf(D("01/09/69")!), "2026-09-01");
  eq("RC4.12 '2026-09-01' (ISO) → 2026-09-01", D("2026-09-01") && dayOf(D("2026-09-01")!), "2026-09-01");
  eq("RC4.13 '3 ก.ย. 2569' → 2026-09-03", D("3 ก.ย. 2569") && dayOf(D("3 ก.ย. 2569")!), "2026-09-03");
  eq("RC4.14 '3 กันยายน 2569' → 2026-09-03", D("3 กันยายน 2569") && dayOf(D("3 กันยายน 2569")!), "2026-09-03");
  eq("RC4.15 '01/09/2569 10:23' (มีเวลาต่อท้าย) → 2026-09-01", D("01/09/2569 10:23") && dayOf(D("01/09/2569 10:23")!), "2026-09-01");
  eq("RC4.16 '31/02/2569' (วันที่ไม่มีจริง) → null", D("31/02/2569"), null);
  eq("RC4.17 'ยอดยกมา' → null", D("ยอดยกมา"), null);

  // ═════════ RC5 — แถวเสีย ═════════
  console.log("\nRC5 แถวเสียในไฟล์ (ต้องรายงานเป็นราย ๆ ไม่ล้มทั้งไฟล์):");
  const dirty = [
    "วันที่,รายละเอียด,ถอนเงิน,ฝากเงิน,คงเหลือ",
    "01/09/2569,ปกติ,,\"1,000.00\",\"1,000.00\"",
    "ไม่ใช่วันที่,แถวเสีย,,\"500.00\",\"1,500.00\"",
    "02/09/2569,ยอดอ่านไม่ออก,abc,,\"1,500.00\"",
    "03/09/2569,ยอดศูนย์,0.00,0.00,\"1,500.00\"",
    ",,,,",
  ].join("\n");
  const dirtyRes = csvMod.parseBankStatementCsv(dirty, "KBANK");
  eq("RC5.1 อ่านแถวดีได้ 1 แถว", dirtyRes.rows.length, 1);
  eq("RC5.2 รายงานแถวเสีย 3 แถว (วันที่ · จำนวนเงิน · ยอด 0)", dirtyRes.errors.length, 3);
  assert("RC5.3 error มีเลขบรรทัดจริงของไฟล์", dirtyRes.errors[0]?.row === 3, `ได้ ${dirtyRes.errors[0]?.row}`);
  const noAmount = csvMod.parseBankStatementCsv("วันที่,รายละเอียด\n01/09/2569,ไม่มีคอลัมน์เงิน", "GENERIC");
  assert("RC5.4 ไฟล์ไม่มีคอลัมน์จำนวนเงิน = บอกเหตุพร้อมชื่อหัวที่พบ", noAmount.rows.length === 0 && (noAmount.errors[0]?.reason ?? "").includes("จำนวนเงิน"));

  // ═════════ RC6 — สรุปของ seed (อ่านอย่างเดียว) ═════════
  console.log("\nRC6 สรุปกระทบยอดของ seed (ร้านจริง · อ่านอย่างเดียว) เทียบเฉลยอิสระ:");
  const sum0 = await rec.summary({ tenantId, systemId }, B.financeId, B.periodKey);
  if ("ok" in sum0) throw new Error("summary ล้ม: " + sum0.reason);
  eq("RC6.1 ยอดตาม statement = เฉลย", sum0.statementBalanceSatang, B.statementClosingSatang);
  eq("RC6.2 ยอดในระบบ ณ สิ้นงวด = เฉลย (SQL อิสระ)", sum0.systemBalanceSatang, B.systemClosingSatang);
  eq("RC6.3 ส่วนต่าง = statement − ระบบ = เฉลย", sum0.differenceSatang, B.differenceBeforeSatang);
  eq("RC6.4 จับคู่แล้ว/ทั้งหมด = เฉลย", [sum0.matchedCount, sum0.totalCount], [B.expectMatched, B.rowCount]);
  eq("RC6.5 แนะนำจับคู่ / รอจับคู่ = เฉลย", [sum0.suggestedCount, sum0.unmatchedCount], [B.expectSuggested, B.expectUnmatched]);
  eq("RC6.6 รหัสบัญชีแยกประเภทของช่องทาง = เฉลย", sum0.channel.ledgerCode, B.ledgerCode);
  assert("RC6.7 ยังยืนยันไม่ได้ (ส่วนต่าง ≠ 0)", sum0.canConfirm === false && sum0.confirmBlockReason === "ส่วนต่างต้องเป็น 0 ก่อนยืนยัน", `ได้ ${sum0.confirmBlockReason}`);
  const page0 = await rec.reconcilePageData({ tenantId, systemId }, B.financeId, B.periodKey, { base: "/app/sys/x/account" });
  if ("ok" in page0) throw new Error("reconcilePageData ล้ม");
  eq("RC6.8 หน้าจอได้แถว statement ครบ", page0.statementLines.length, B.rowCount);
  eq("RC6.9 'รายการที่กระทบยอดแล้ว' = จำนวนที่จับคู่แล้ว", page0.reconciledRows.length, B.expectMatched);
  const sugg = page0.statementLines.find((l) => l.status === "SUGGESTED");
  assert("RC6.10 แถวที่แนะนำมีข้อความใบ้ตาม g10 ('ยอดและวันที่ตรงกัน ±1 วัน')", sugg?.suggestedHint === "ยอดและวันที่ตรงกัน ±1 วัน", `ได้ "${sugg?.suggestedHint}"`);
  assert("RC6.11 ทุกแถวที่จับคู่แล้วมีบรรทัดสมุดรายวันผูกอยู่", page0.statementLines.filter((l) => l.status === "MATCHED").every((l) => !!l.matchedLineId));
  const dup = await prisma.accountJournalLine.groupBy({
    by: ["reconciledStatementLineId"],
    where: { systemId, reconciledStatementLineId: { not: null } },
    _count: { _all: true },
  });
  assert("RC6.12 ไม่มีบรรทัดสมุดรายวันถูกผูกซ้ำ (1:1)", dup.every((d) => d._count._all === 1));

  // ═════════ ร้านทิ้ง (การเขียนทั้งหมด) ═════════
  console.log("\n── สร้างร้านทดสอบ (จำลองบรรทัด GL ของ BSV001 ก.ย. ให้เหมือน seed) ──");
  const stamp = Date.now();
  const tag = `qc-rec-${stamp}`;
  const t = await prisma.tenant.create({ data: { name: tag, slug: tag } });
  sTenantId = t.id;
  const owner = await prisma.user.create({ data: { email: `${tag}-owner@qc.local`, name: "QC เจ้าของ" } });
  const staff = await prisma.user.create({ data: { email: `${tag}-staff@qc.local`, name: "QC พนักงาน" } });
  ownerId = owner.id;
  staffId = staff.id;
  await prisma.membership.create({ data: { userId: owner.id, tenantId: sTenantId, role: "OWNER", unitAccess: ["*"] } });
  const mStaff = await prisma.membership.create({
    data: { userId: staff.id, tenantId: sTenantId, role: "STAFF", unitAccess: ["*"], permissions: { "account.doc.view": true } },
  });
  const unit = await prisma.businessUnit.create({ data: { tenantId: sTenantId, type: "BOOKING", name: "สาขาทดสอบ", slug: `u-${stamp}`, status: "ACTIVE" } });
  const accSys = await sysMod.createSystem(sTenantId, "ACCOUNT", "บัญชี " + tag);
  await sysMod.linkUnit(sTenantId, accSys.id, unit.id);
  const sSystemId = accSys.id;
  const S = { tenantId: sTenantId, systemId: sSystemId };
  await glMod.ensureAccounting(S);

  const bank = await fin.createFinanceAccount({
    tenantId: sTenantId,
    systemId: sSystemId,
    type: "BANK",
    name: "กสิกรไทย ทดสอบ",
    bankName: "กสิกรไทย",
    openingEntries: [{ date: new Date("2026-08-15T10:00:00+07:00"), amountSatang: B.openingSatang, note: "ยอดยกมา" }],
  });
  if (!bank.ok) throw new Error("สร้างบัญชีธนาคารทดสอบไม่สำเร็จ: " + bank.reason);
  const bankAcc = await prisma.accountFinance.findUniqueOrThrow({ where: { id: bank.id }, select: { ledgerAccountId: true } });
  const bankLedgerId = bankAcc.ledgerAccountId!;
  const otherLedgerId = await glMod.resolveMapping(S, "EXPENSE_DEFAULT");

  // จำลองบรรทัดสมุดรายวันฝั่งระบบ: ทุกแถวใน fixture ยกเว้นค่าธรรมเนียม/ดอกเบี้ย
  // (แถวที่ถูกเลื่อนวันในไฟล์ → โพสต์กลับที่วันจริงของ GL เพื่อให้เกิดเคส "แนะนำจับคู่")
  const glDayOf = (r: (typeof kb.rows)[number]) =>
    dayOf(r.txDate) === B.nearMatch.statementDayKey && r.amountSatang === B.nearMatch.amountSatang ? B.nearMatch.glDayKey : dayOf(r.txDate);
  let posted = 0;
  for (const r of kb.rows) {
    if (r.amountSatang === B.feeSatang || r.amountSatang === B.interestSatang) continue;
    const day = glDayOf(r);
    const amount = Math.abs(r.amountSatang);
    await glMod.postManualJV(S, {
      date: new Date(`${day}T10:00:00+07:00`),
      memo: r.description,
      lines:
        r.amountSatang > 0
          ? [
              { accountId: bankLedgerId, debit: amount, credit: 0 },
              { accountId: otherLedgerId, debit: 0, credit: amount },
            ]
          : [
              { accountId: otherLedgerId, debit: amount, credit: 0 },
              { accountId: bankLedgerId, debit: 0, credit: amount },
            ],
    });
    posted++;
  }
  console.log(`   โพสต์บรรทัดจำลอง ${posted} รายการ · ยอดยกมา ${(B.openingSatang / 100).toFixed(2)}`);
  const sysBal0 = await rec.systemBalanceAtPeriodEnd(S, bankLedgerId, B.periodKey);
  eq("RC7.0 ยอดในระบบของร้านทดสอบ = ยอดในระบบของ seed (จำลองสำเร็จ)", sysBal0, B.systemClosingSatang);

  // ═════════ RC7 — นำเข้า + นำเข้าซ้ำ ═════════
  console.log("\nRC7 นำเข้า statement:");
  const prev = await rec.previewStatementImport(S, { financeId: bank.id, periodKey: B.periodKey, source: "KBANK", text: fixtureCsv });
  if ("ok" in prev) throw new Error("preview ล้ม: " + prev.reason);
  eq("RC7.1 ตรวจสอบก่อนนำเข้า: แถวใหม่ = ทั้งหมด · ซ้ำ 0", [prev.newRows, prev.duplicateRows], [B.rowCount, 0]);
  assert("RC7.2 ตัวอย่างไม่เกิน 20 แถว (§ pattern WO 1.8)", prev.rows.length <= 20);
  const imp1 = await rec.importStatement(S, { financeId: bank.id, periodKey: B.periodKey, source: "KBANK", fileName: B.fileName, text: fixtureCsv, userId: owner.id });
  if (!("statementId" in imp1)) throw new Error("นำเข้าล้ม: " + JSON.stringify(imp1));
  eq("RC7.3 นำเข้า = จำนวนแถวในไฟล์", imp1.imported, B.rowCount);
  eq("RC7.4 ยอดปลายงวดของใบ statement = เฉลย", imp1.closingBalanceSatang, B.statementClosingSatang);
  const imp2 = await rec.importStatement(S, { financeId: bank.id, periodKey: B.periodKey, source: "KBANK", fileName: B.fileName, text: fixtureCsv, userId: owner.id });
  if (!("statementId" in imp2)) throw new Error("นำเข้าซ้ำล้ม");
  eq("RC7.5 นำเข้าไฟล์เดิมซ้ำ = 0 แถวใหม่ (dedupe ด้วย fingerprint)", [imp2.imported, imp2.duplicates], [0, B.rowCount]);
  eq("RC7.6 ยังเป็นใบเดิม (1 ช่องทาง 1 เดือน = 1 ใบ)", imp2.statementId, imp1.statementId);
  const lineCount = await prisma.accountBankStatementLine.count({ where: { systemId: sSystemId, statementId: imp1.statementId } });
  eq("RC7.7 จำนวนแถวใน DB ไม่เพิ่ม", lineCount, B.rowCount);

  // ═════════ RC8 — autoMatch ═════════
  console.log("\nRC8 จับคู่อัตโนมัติ:");
  const auto = await rec.autoMatch(S, imp1.statementId, owner.id);
  if (!("matched" in auto)) throw new Error("autoMatch ล้ม: " + JSON.stringify(auto));
  eq("RC8.1 จับคู่แล้ว = เฉลย", auto.matched, B.expectMatched);
  eq("RC8.2 แนะนำจับคู่ = เฉลย", auto.suggested, B.expectSuggested);
  eq("RC8.3 รอจับคู่ = เฉลย (ค่าธรรมเนียม + ดอกเบี้ย)", auto.unmatched, B.expectUnmatched);
  const auto2 = await rec.autoMatch(S, imp1.statementId, owner.id);
  if (!("matched" in auto2)) throw new Error("autoMatch รอบ 2 ล้ม");
  eq("RC8.4 เรียก autoMatch ซ้ำ ผลเท่าเดิม (ไม่จับคู่มั่ว/ไม่ปลดของเดิม)", [auto2.matched, auto2.suggested, auto2.unmatched], [B.expectMatched, B.expectSuggested, B.expectUnmatched]);
  const sumA = await rec.summary(S, bank.id, B.periodKey);
  if ("ok" in sumA) throw new Error("summary ล้ม");
  eq("RC8.5 ส่วนต่างก่อนแก้ = เฉลยอิสระ", sumA.differenceSatang, B.differenceBeforeSatang);

  // ═════════ RC9 — จับคู่ด้วยมือ ═════════
  console.log("\nRC9 จับคู่ด้วยมือ:");
  const pageA = await rec.reconcilePageData(S, bank.id, B.periodKey);
  if ("ok" in pageA) throw new Error("pageData ล้ม");
  const suggested = pageA.statementLines.find((l) => l.status === "SUGGESTED");
  assert("RC9.1 มีแถวที่ระบบแนะนำจับคู่ 1 แถว", !!suggested && !!suggested.suggestedLineId);
  // บรรทัดยอดยกมาของบัญชีธนาคาร (ยอด ≠ แถวที่แนะนำ · ยังไม่ถูกกระทบยอด) — ใช้เป็น "คู่ที่ผิด"
  const wrongTarget = await prisma.accountJournalLine.findFirstOrThrow({
    where: { systemId: sSystemId, accountId: bankLedgerId, reconciledAt: null, debit: B.openingSatang },
    select: { id: true, debit: true, credit: true },
  });
  assert("RC9.2a คู่ที่ผิดมีอยู่จริงและยอดต่างจากแถวที่แนะนำ (positive control)", wrongTarget.debit - wrongTarget.credit !== suggested!.amountSatang);
  await rejected("RC9.2 จับคู่กับรายการที่จำนวนเงินไม่ตรง = ปฏิเสธพร้อมเหตุผลไทย", () => rec.manualMatch(S, { lineId: suggested!.id, journalLineId: wrongTarget.id, userId: owner.id }), "จำนวนเงินไม่ตรงกัน");
  const mm = await rec.manualMatch(S, { lineId: suggested!.id, journalLineId: suggested!.suggestedLineId!, userId: owner.id });
  assert("RC9.3 ยืนยันคู่ที่แนะนำสำเร็จ", mm.ok === true, JSON.stringify(mm));
  const takenLine = suggested!.suggestedLineId!;
  const feeLine = pageA.statementLines.find((l) => l.amountSatang === B.feeSatang)!;
  await rejected("RC9.4 จับคู่บรรทัดสมุดรายวันที่ถูกใช้ไปแล้ว = ปฏิเสธ", () => rec.manualMatch(S, { lineId: feeLine.id, journalLineId: takenLine, userId: owner.id }));

  // ═════════ RC10 — สร้างรายการค่าธรรมเนียม/ดอกเบี้ย ═════════
  console.log("\nRC10 สร้างรายการจากแถว statement:");
  const intLine = pageA.statementLines.find((l) => l.amountSatang === B.interestSatang)!;
  await rejected("RC10.1 เลือกประเภทผิดทิศ (ดอกเบี้ยกับแถวเงินออก) = ปฏิเสธ", () => rec.createEntryFromLine(S, { lineId: feeLine.id, kind: "INTEREST", userId: owner.id }), "ดอกเบี้ยรับต้องเป็นรายการเงินเข้า");
  const feeRes = await rec.createEntryFromLine(S, { lineId: feeLine.id, kind: "FEE", userId: owner.id });
  assert("RC10.2 สร้างรายการค่าธรรมเนียมสำเร็จ", "entryId" in feeRes, JSON.stringify(feeRes));
  const intRes = await rec.createEntryFromLine(S, { lineId: intLine.id, kind: "INTEREST", userId: owner.id });
  assert("RC10.3 สร้างรายการดอกเบี้ยรับสำเร็จ", "entryId" in intRes, JSON.stringify(intRes));

  const feeEntryId = (feeRes as { entryId: string }).entryId;
  const feeLines = await prisma.accountJournalLine.findMany({
    where: { systemId: sSystemId, entryId: feeEntryId },
    select: { debit: true, credit: true, accountId: true, account: { select: { code: true } } },
  });
  eq("RC10.4 JV ค่าธรรมเนียมสมดุล (Σdr = Σcr)", feeLines.reduce((s, l) => s + l.debit, 0), feeLines.reduce((s, l) => s + l.credit, 0));
  assert("RC10.5 ค่าธรรมเนียม: Dr 6510 ค่าธรรมเนียมธนาคาร", feeLines.some((l) => l.account.code === "6510" && l.debit === Math.abs(B.feeSatang)));
  assert("RC10.6 ค่าธรรมเนียม: Cr บัญชีเงินของช่องทาง", feeLines.some((l) => l.accountId === bankLedgerId && l.credit === Math.abs(B.feeSatang)));
  const intEntryId = (intRes as { entryId: string }).entryId;
  const intLines = await prisma.accountJournalLine.findMany({
    where: { systemId: sSystemId, entryId: intEntryId },
    select: { debit: true, credit: true, accountId: true, account: { select: { code: true } } },
  });
  assert("RC10.7 ดอกเบี้ย: Dr บัญชีเงิน / Cr 4910 ดอกเบี้ยรับ", intLines.some((l) => l.accountId === bankLedgerId && l.debit === B.interestSatang) && intLines.some((l) => l.account.code === "4910" && l.credit === B.interestSatang));
  await rejected("RC10.8 สร้างซ้ำจากแถวเดิม = ปฏิเสธ (ไม่โพสต์เบิ้ล)", () => rec.createEntryFromLine(S, { lineId: feeLine.id, kind: "FEE", userId: owner.id }), "สร้างรายการบัญชีไปแล้ว");
  const feeEntryCount = await prisma.accountJournalEntry.count({
    where: { systemId: sSystemId, refType: "AccountBankStatementLine", refId: feeLine.id },
  });
  eq("RC10.9 มีใบสำคัญของแถวค่าธรรมเนียมใบเดียวเท่านั้น", feeEntryCount, 1);

  // ═════════ RC16 — ไม่เขียนครึ่ง ๆ กลาง ๆ เมื่อล้ม ═════════
  console.log("\nRC16 action ที่ล้มต้องไม่ทิ้งงานค้าง:");
  const spareLine = await prisma.accountBankStatementLine.findFirst({
    where: { systemId: sSystemId, statementId: imp1.statementId, status: "MATCHED" },
    select: { id: true, status: true },
  });
  await rejected("RC16.1 สร้างรายการจากแถวที่จับคู่แล้ว = ปฏิเสธ", () => rec.createEntryFromLine(S, { lineId: spareLine!.id, kind: "OTHER", accountCode: "6900", userId: owner.id }));
  const afterFail = await prisma.accountBankStatementLine.findUniqueOrThrow({ where: { id: spareLine!.id }, select: { status: true, createdEntryId: true } });
  eq("RC16.2 สถานะแถวไม่เปลี่ยน + ไม่มี JV ผูก", [afterFail.status, afterFail.createdEntryId], ["MATCHED", null]);
  const before16 = await prisma.accountJournalEntry.count({ where: { systemId: sSystemId } });
  await rejected("RC16.3 บัญชีคู่เป็นรหัสที่ไม่มีจริง = ปฏิเสธ", () => rec.createEntryFromLine(S, { lineId: spareLine!.id, kind: "OTHER", accountCode: "0000", userId: owner.id }));
  eq("RC16.4 จำนวนใบสำคัญไม่เพิ่ม", await prisma.accountJournalEntry.count({ where: { systemId: sSystemId } }), before16);

  // ═════════ RC11 — ยืนยัน / ล็อก / เปิดกลับ ═════════
  console.log("\nRC11 ยืนยันกระทบยอดเดือนนี้:");
  const sumB = await rec.summary(S, bank.id, B.periodKey);
  if ("ok" in sumB) throw new Error("summary ล้ม");
  eq("RC11.1 ส่วนต่างเป็น 0 หลังจับคู่ครบ + สร้างรายการครบ", sumB.differenceSatang, 0);
  eq("RC11.2 ไม่มีแถวรอจับคู่เหลือ", sumB.pendingCount, 0);
  assert("RC11.3 ปุ่มยืนยันเปิดใช้ได้", sumB.canConfirm === true && sumB.confirmBlockReason === null);
  const conf = await rec.confirmMonth(S, { financeId: bank.id, periodKey: B.periodKey, userId: owner.id });
  assert("RC11.4 ยืนยันสำเร็จ", "matched" in conf, JSON.stringify(conf));
  await rejected("RC11.5 ยืนยันซ้ำถูกปฏิเสธ", () => rec.confirmMonth(S, { financeId: bank.id, periodKey: B.periodKey, userId: owner.id }), "ยืนยันกระทบยอดไปแล้ว");
  await rejected("RC11.6 แก้การจับคู่หลังล็อกถูกปฏิเสธ", () => rec.unmatch(S, { lineId: spareLine!.id, userId: owner.id }), "เปิดกลับก่อน");
  await rejected("RC11.7 นำเข้าเพิ่มหลังล็อกถูกปฏิเสธ", () => rec.importStatement(S, { financeId: bank.id, periodKey: B.periodKey, source: "KBANK", fileName: "x.csv", text: fixtureCsv, userId: owner.id }), "เปิดกลับก่อน");
  await rejected("RC11.8 autoMatch หลังล็อกถูกปฏิเสธ", () => rec.autoMatch(S, imp1.statementId, owner.id), "เปิดกลับก่อน");

  // ═════════ RC13 — ล็อกกระทบยอด ≠ ล็อกการลงบัญชี ═════════
  console.log("\nRC13 ยืนยันแล้วยังลงบัญชีในเดือนนั้นได้ (ห้ามบล็อกงานบัญชี):");
  const lateJv = await glMod.postManualJV(S, {
    date: new Date(`${B.periodKey}-29T10:00:00+07:00`),
    memo: "รายการที่บันทึกหลังยืนยันกระทบยอด",
    lines: [
      { accountId: bankLedgerId, debit: 111, credit: 0 },
      { accountId: otherLedgerId, debit: 0, credit: 111 },
    ],
  });
  assert("RC13.1 โพสต์ JV ลงวันที่ในเดือนที่ยืนยันแล้วได้", !!lateJv.entryId);
  const lateRows = await rec.listSystemEntries(S, { ledgerAccountId: bankLedgerId, periodKey: B.periodKey });
  assert("RC13.2 รายการนั้นโผล่เป็น 'ยังไม่กระทบยอด' ให้ทำต่อเดือนถัดไป", lateRows.some((r) => r.amountSatang === 111));

  // ═════════ RC11 ต่อ — เปิดกลับ ═════════
  const reopen = await rec.reopenMonth(S, { financeId: bank.id, periodKey: B.periodKey, reason: "แก้ไขการจับคู่", userId: owner.id });
  assert("RC11.9 เปิดกลับสำเร็จ", reopen.ok === true, JSON.stringify(reopen));
  const sumC = await rec.summary(S, bank.id, B.periodKey);
  if ("ok" in sumC) throw new Error("summary ล้ม");
  assert("RC11.10 หลังเปิดกลับ ล็อกหาย", sumC.confirmedAt === null);

  // ═════════ RC12 — unmatch ═════════
  console.log("\nRC12 ยกเลิกการจับคู่:");
  const matchedLine = await prisma.accountBankStatementLine.findFirstOrThrow({
    where: { systemId: sSystemId, statementId: imp1.statementId, status: "MATCHED" },
    select: { id: true, matchedLineId: true },
  });
  const um = await rec.unmatch(S, { lineId: matchedLine.id, userId: owner.id });
  assert("RC12.1 ยกเลิกการจับคู่สำเร็จ", um.ok === true, JSON.stringify(um));
  const afterUm = await prisma.accountBankStatementLine.findUniqueOrThrow({ where: { id: matchedLine.id }, select: { status: true, matchedLineId: true } });
  eq("RC12.2 แถวกลับเป็น 'รอจับคู่' และปลดการผูก", [afterUm.status, afterUm.matchedLineId], ["UNMATCHED", null]);
  const jlAfter = await prisma.accountJournalLine.findUniqueOrThrow({ where: { id: matchedLine.matchedLineId! }, select: { reconciledAt: true, reconciledStatementLineId: true } });
  eq("RC12.3 บรรทัดสมุดรายวันถูกปลดเครื่องหมายกระทบยอด", [jlAfter.reconciledAt, jlAfter.reconciledStatementLineId], [null, null]);
  const remm = await rec.manualMatch(S, { lineId: matchedLine.id, journalLineId: matchedLine.matchedLineId!, userId: owner.id });
  assert("RC12.4 จับคู่กลับเข้าที่เดิมได้", remm.ok === true, JSON.stringify(remm));
  await rejected("RC12.5 ยกเลิกการจับคู่แถวที่ 'สร้างรายการแล้ว' ถูกปฏิเสธ (ต้องกลับรายการใบสำคัญแทน)", () => rec.unmatch(S, { lineId: feeLine.id, userId: owner.id }), "กลับรายการ");

  // ═════════ RC14 — guard ═════════
  console.log("\nRC14 ด่านสิทธิ์:");
  const authStaff = { user: { id: staff.id }, active: { ...mStaff, tenant: t } } as never;
  const authOwner = { user: { id: owner.id }, active: { ...(await prisma.membership.findFirstOrThrow({ where: { userId: owner.id, tenantId: sTenantId } })), tenant: t } } as never;
  await rejected("RC14.1 พนักงานที่ไม่มี account.reconcile ถูกปฏิเสธ", async () => {
    assertAccountCan(authStaff, "account.reconcile");
    return { ok: true };
  });
  let ownerPassed = true;
  try {
    assertAccountCan(authOwner, "account.reconcile");
  } catch {
    ownerPassed = false;
  }
  assert("RC14.2 เจ้าของผ่านด่าน account.reconcile", ownerPassed);
  const mFinance = { ...mStaff, permissions: { "account.finance.manage": true } };
  let impliesOk = true;
  try {
    assertAccountCan({ user: { id: staff.id }, active: { ...mFinance, tenant: t } } as never, "account.reconcile");
  } catch {
    impliesOk = false;
  }
  assert("RC14.3 คนที่มี account.finance.manage เดิม กระทบยอดได้ (ตาราง IMPLIES — สิทธิ์ไม่หาย)", impliesOk);

  // ═════════ RC15 — tenant isolation ═════════
  console.log("\nRC15 แยกร้าน/แยกระบบ:");
  const seedLine = await prisma.accountBankStatementLine.findFirstOrThrow({ where: { systemId }, select: { id: true } });
  await rejected("RC15.1 แตะแถว statement ของร้านอื่นไม่ได้ (manualMatch)", () => rec.manualMatch(S, { lineId: seedLine.id, journalLineId: bankLedgerId, userId: owner.id }), "ไม่พบแถว");
  await rejected("RC15.2 ข้ามแถวของร้านอื่นไม่ได้", () => rec.skipLine(S, { lineId: seedLine.id, userId: owner.id }), "ไม่พบแถว");
  await rejected("RC15.3 สรุปช่องทางของร้านอื่นไม่ได้", () => rec.summary(S, B.financeId, B.periodKey), "ไม่พบช่องทาง");
  const seedStatement = await prisma.accountBankStatement.findFirstOrThrow({ where: { systemId }, select: { id: true } });
  await rejected("RC15.4 autoMatch ใบ statement ของร้านอื่นไม่ได้", () => rec.autoMatch(S, seedStatement.id, owner.id), "ไม่พบรายการเดินบัญชี");
  const seedJl = await prisma.accountJournalLine.findFirstOrThrow({ where: { systemId }, select: { id: true } });
  // (ตอนนี้แถวของร้านทดสอบจับคู่ครบแล้ว — ปลดคู่ 1 แถวเพื่อทดสอบการจับคู่ข้ามร้าน)
  const freeMe = await prisma.accountBankStatementLine.findFirstOrThrow({ where: { systemId: sSystemId, status: "MATCHED" }, select: { id: true } });
  await rec.unmatch(S, { lineId: freeMe.id, userId: owner.id });
  const ownLine = await prisma.accountBankStatementLine.findFirstOrThrow({ where: { systemId: sSystemId, status: "UNMATCHED" }, select: { id: true } });
  await rejected("RC15.5 จับคู่กับบรรทัดสมุดรายวันของร้านอื่นไม่ได้", () => rec.manualMatch(S, { lineId: ownLine.id, journalLineId: seedJl.id, userId: owner.id }), "ไม่พบรายการในระบบ");
} catch (e) {
  bad("CRASH", e instanceof Error ? `${e.message}\n${e.stack?.split("\n").slice(1, 5).join("\n")}` : String(e));
}

// ─────────── ลบร้านทดสอบ ───────────
if (sTenantId) {
  const d = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch {
      /* best-effort */
    }
  };
  await d(() => prisma.accountBankStatementLine.deleteMany({ where: { tenantId: sTenantId! } }));
  await d(() => prisma.accountBankStatement.deleteMany({ where: { tenantId: sTenantId! } }));
  await d(() => prisma.accountDocumentPayment.deleteMany({ where: { tenantId: sTenantId! } }));
  await d(() => prisma.accountJournalLine.deleteMany({ where: { tenantId: sTenantId! } }));
  await d(() => prisma.accountJournalEntry.updateMany({ where: { tenantId: sTenantId! }, data: { reversalOfId: null } }));
  await d(() => prisma.accountJournalEntry.deleteMany({ where: { tenantId: sTenantId! } }));
  await d(() => prisma.accountDocumentLine.deleteMany({ where: { tenantId: sTenantId! } }));
  await d(() => prisma.accountDocument.deleteMany({ where: { tenantId: sTenantId! } }));
  for (const m of [
    "accountFinanceOpening", "accountFinanceTransfer", "accountFinance",
    "accountLedger", "accountPeriod", "accountDocSequence", "accountSettings", "accountSystemLink",
    "appNotification", "outboxEvent", "appSystemUnit", "appSystem", "businessUnit", "membership",
  ]) {
    await d(() => (prisma as unknown as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: sTenantId! } }));
  }
  await d(() => prisma.tenant.delete({ where: { id: sTenantId! } }));
  await d(() => prisma.user.deleteMany({ where: { id: { in: [ownerId!, staffId!] } } }));
  console.log(`\n🧹 ลบร้านทดสอบแล้ว`);
}

console.log(`\n===== QC WO 5.3 · กระทบยอดธนาคาร สรุป =====`);
console.log(`ผ่าน ${passed} · ตก ${findings.length}`);
if (findings.length > 0) console.log(findings.map((f) => "  - " + f).join("\n"));
console.log(`JSON_SUMMARY ${JSON.stringify({ total: passed + findings.length, passed, findings })}`);
await prisma.$disconnect();
process.exit(findings.length === 0 ? 0 : 1);
