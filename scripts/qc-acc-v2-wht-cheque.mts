// QC WO 5.4 — WHT 2 ขา V2 + เช็ค V2 — DESIGN-SPEC-V2 §10.4–5 · เฟรม g11-wht-deduct.png
//
// requires: acc-v2-seed (seed สร้าง 3 เครดิต + 3 หัก + 4 เช็คลอย ไว้แล้ว — บล็อก 8.7)
// รัน (บังคับ DB QC branch):
//   QC_ENV_FILE=.env.qc pnpm tsx scripts/seed-acc-v2-qc.mts
//   QC_ENV_FILE=.env.qc pnpm tsx scripts/qc-acc-v2-wht-cheque.mts
//
// 🔴 ร้าน QC จริง (SIAM DIVE QC) = **อ่านอย่างเดียว** — การเขียนทั้งหมด (markFiled/unmarkFiled/lifecycle
//    เช็ค/guard/tenant isolation) เกิดใน "ร้านทิ้ง" ที่สคริปต์สร้างเองแล้วลบใน finally (กติกาเดียวกับ WO 5.3)
//
// ครอบคลุม
//   T1  listWhtCertsV2 direction IN (หัก): แถว/ผลรวม/ตัวนับแท็บ = SQL อิสระ
//   T2  listWhtCertsV2 direction OUT (เครดิต): แถว/ผลรวม = SQL อิสระ
//   T3  ตัวกรองวันที่ (from/to) แคบลงถูกต้อง (เดือน ส.ค. เท่านั้น)
//   T4  ค้นหา (q) ตรงชื่อ/เลขที่/เอกสารอ้างอิง
//   T5  whtCreditYearTotal = SQL อิสระ (Σ WHT_CERT OUT ISSUED ปี 2026)
//   T6  pndCsv: BOM + คอลัมน์ตามฟอร์ม RD (ลำดับ·เลขที่·วันที่จ่าย·ชื่อ·เลขภาษี·สาขา·ที่อยู่·ประเภทเงินได้·
//       จำนวนเงินได้·อัตรา·ภาษีที่หัก·เงื่อนไข) + จำนวนแถว = เฉลย ต่อฟอร์ม/งวด
//   T7  chequeSummaryV2/chequeStatusCounts (ทั้ง 2 ทิศ) = SQL อิสระ (รอเรียกเก็บ/รอตัด · ครบกำหนด 7 วัน)
//   T8  listChequesV2 คืนสถานะ/ผู้ติดต่อ/อ้างอิงถูกต้อง (เช็คลอย → ผู้ติดต่อ/อ้างอิง = null)
//   T9  ร้านทิ้ง: markFiled ครั้งแรกออก AccountWhtFiling + stamp cert · ครั้งที่ 2 idempotent (ไม่ซ้ำ/ไม่เพิ่ม)
//   T10 unmarkFiled: staff (ไม่มี account.wht.unmark) ถูกปฏิเสธ · owner ทำได้ + ล้าง whtFiledPeriodKey + ลบแถว filing
//   T11 ยกเลิก payment → cert cascade เป็น VOIDED → โผล่ในแท็บ "ยกเลิก" (CANCELLED)
//   T12 guard: ไม่มีสิทธิ์ account.wht.manage/account.cheque.manage ถูกปฏิเสธ · IMPLIES เดิมไม่หาย
//   T13 tenant isolation: certId/chequeId ของอีกร้านแตะไม่ได้ (validateMarkFiledSelection/getCheque)
//   T14 lifecycle เช็ค: นำฝาก→เคลียร์ ปกติ · เคลียร์เช็คที่เด้งแล้ว = ปฏิเสธ · ยกเลิกเช็คที่เคลียร์แล้ว = ปฏิเสธ ·
//       นำฝากซ้ำ = ปฏิเสธ · depositedAt ถูกบันทึก

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
const finMod = await import("@/lib/modules/account/finance");
const svc = await import("@/lib/modules/account/service");
const exp = await import("@/lib/modules/account/expense");
const wht = await import("@/lib/modules/account/wht");
const chq = await import("@/lib/modules/account/cheque");
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

console.log(`\n===== QC WO 5.4 · WHT 2 ขา V2 + เช็ค V2 =====`);
console.log(`[env] DB ${host}\n`);

type Expected = {
  tenantId: string;
  systemId: string;
  whtV2: {
    creditCertIds: string[];
    deductCertIds: string[];
    creditCashInSatang: number;
    creditWhtTotalSatang: number;
    deductCashOutSatang: number;
    deductWhtTotalSatang: number;
    months: string[];
    filedForm: number;
    filedPeriodKey: string;
    filedCertId: string;
  };
  chequeV2: {
    inDueSoonId: string;
    inBouncedId: string;
    outPendingId: string;
    outVoidedId: string;
  };
};
const E = JSON.parse(readFileSync(QC.expectedPath, "utf8")) as Expected;
const { tenantId, systemId } = E;

let sTenantId: string | null = null;
let ownerId: string | null = null;
let staffId: string | null = null;

try {
  // ═════════ T1 — listWhtCertsV2 direction IN (หัก) ═════════
  console.log("T1 รายการ WHT หัก ณ ที่จ่าย (เราหักผู้ขาย):");
  const deductAll = await wht.listWhtCertsV2(tenantId, systemId, { direction: "IN", pageSize: 100 });
  const sqlDeduct = await prisma.$queryRaw<{ cnt: bigint; base: bigint | null; taxs: bigint | null }[]>`
    SELECT COUNT(*)::bigint AS cnt, COALESCE(SUM("subTotal"),0)::bigint AS base, COALESCE(SUM("whtAmount"),0)::bigint AS taxs
    FROM "AccountDocument" WHERE "systemId" = ${systemId} AND "docType" = 'WHT_CERT' AND "direction" = 'IN'`;
  eq("T1.1 จำนวนใบ = SQL อิสระ", deductAll.total, Number(sqlDeduct[0].cnt));
  eq("T1.2 ผลรวมฐาน = SQL อิสระ", deductAll.totalBase, Number(sqlDeduct[0].base ?? 0));
  eq("T1.3 ผลรวมภาษี = SQL อิสระ", deductAll.totalWht, Number(sqlDeduct[0].taxs ?? 0));
  eq("T1.4 ผลรวมภาษี = เฉลย seed (3 ใบ)", deductAll.totalWht, E.whtV2.deductWhtTotalSatang);
  eq("T1.5 tabCounts.ALL = จำนวนใบทั้งหมด", deductAll.tabCounts.ALL, deductAll.total);
  eq("T1.6 tabCounts.NORMAL = ALL (ยังไม่มีใบถูกยกเลิก)", deductAll.tabCounts.NORMAL, deductAll.tabCounts.ALL);
  eq("T1.7 tabCounts.CANCELLED = 0", deductAll.tabCounts.CANCELLED, 0);
  assert("T1.8 ทุกแถวมี certId ตรงเฉลย seed", E.whtV2.deductCertIds.every((id) => deductAll.rows.some((r) => r.certId === id)));
  assert("T1.9 ทุกแถวมี sourceDocNo (ผูกเอกสารต้นทางจริง)", deductAll.rows.every((r) => !!r.sourceDocNo));
  // WO 5.4 round 2 (Fable ตีกลับ): seed ทำเครื่องหมายนำส่งแล้ว 1 ใบ (deductCertIds[2]) ให้หน้า g11 โชว์ทั้ง 2 สไตล์ชิป
  const filedRows = deductAll.rows.filter((r) => r.filedPeriodKey !== null);
  eq("T1.10 มี 1 แถวที่ยื่นแล้ว (2 แถวยังไม่ยื่น)", filedRows.length, 1);
  const filedRow = deductAll.rows.find((r) => r.certId === E.whtV2.filedCertId);
  eq("T1.11 ใบที่ยื่นแล้ว filedPeriodKey = เฉลย", filedRow?.filedPeriodKey, `${E.whtV2.filedForm}:${E.whtV2.filedPeriodKey}`);

  // ═════════ T2 — listWhtCertsV2 direction OUT (เครดิต) ═════════
  console.log("\nT2 รายการ WHT ถูกหักไว้ (ลูกค้าหักเรา):");
  const creditAll = await wht.listWhtCertsV2(tenantId, systemId, { direction: "OUT", pageSize: 100 });
  const sqlCredit = await prisma.$queryRaw<{ cnt: bigint; taxs: bigint | null }[]>`
    SELECT COUNT(*)::bigint AS cnt, COALESCE(SUM("whtAmount"),0)::bigint AS taxs
    FROM "AccountDocument" WHERE "systemId" = ${systemId} AND "docType" = 'WHT_CERT' AND "direction" = 'OUT'`;
  eq("T2.1 จำนวนใบ = SQL อิสระ", creditAll.total, Number(sqlCredit[0].cnt));
  eq("T2.2 ผลรวมภาษี = SQL อิสระ", creditAll.totalWht, Number(sqlCredit[0].taxs ?? 0));
  eq("T2.3 ผลรวมภาษี = เฉลย seed (3 ใบ)", creditAll.totalWht, E.whtV2.creditWhtTotalSatang);
  assert("T2.4 ทุกแถวมี certId ตรงเฉลย seed", E.whtV2.creditCertIds.every((id) => creditAll.rows.some((r) => r.certId === id)));

  // ═════════ T3 — ตัวกรองวันที่ ═════════
  console.log("\nT3 ตัวกรองวันที่ชำระ:");
  const augFrom = new Date("2026-08-01T00:00:00+07:00");
  const augTo = new Date("2026-09-01T00:00:00+07:00");
  const deductAug = await wht.listWhtCertsV2(tenantId, systemId, { direction: "IN", from: augFrom, to: augTo, pageSize: 100 });
  eq("T3.1 หัก ส.ค. เท่านั้น = 1 ใบ", deductAug.total, 1);
  const creditAug = await wht.listWhtCertsV2(tenantId, systemId, { direction: "OUT", from: augFrom, to: augTo, pageSize: 100 });
  eq("T3.2 เครดิต ส.ค. เท่านั้น = 1 ใบ", creditAug.total, 1);
  const deductSep = await wht.listWhtCertsV2(tenantId, systemId, {
    direction: "IN",
    from: new Date("2026-09-01T00:00:00+07:00"),
    to: new Date("2026-10-01T00:00:00+07:00"),
    pageSize: 100,
  });
  eq("T3.3 หัก ก.ย. เท่านั้น = 2 ใบ", deductSep.total, 2);

  // ═════════ T4 — ค้นหา ═════════
  console.log("\nT4 ค้นหา:");
  const searchName = await wht.listWhtCertsV2(tenantId, systemId, { direction: "IN", q: "ช่างซ่อมเรือ", pageSize: 100 });
  eq("T4.1 ค้นหาชื่อผู้ขาย = 1 ใบ", searchName.total, 1);
  const searchNone = await wht.listWhtCertsV2(tenantId, systemId, { direction: "IN", q: "ไม่มีจริงแน่นอน", pageSize: 100 });
  eq("T4.2 ค้นหาไม่พบ = 0 ใบ", searchNone.total, 0);

  // ═════════ T5 — เครดิตภาษีถูกหักสะสมปีนี้ ═════════
  console.log("\nT5 เครดิตภาษีสะสมปีนี้:");
  const creditYear = await wht.whtCreditYearTotal(tenantId, systemId, 2026);
  eq("T5.1 = Σ WHT_CERT OUT ISSUED ปี 2026 (SQL อิสระ)", creditYear, Number(sqlCredit[0].taxs ?? 0));
  eq("T5.2 = เฉลย seed", creditYear, E.whtV2.creditWhtTotalSatang);

  // ═════════ T6 — CSV ภ.ง.ด. ═════════
  console.log("\nT6 ส่งออก CSV ภ.ง.ด.:");
  const csv53Aug = await wht.pndCsv(tenantId, systemId, { type: 53, period: "2026-08" });
  assert("T6.1 มี BOM UTF-8", csv53Aug.charCodeAt(0) === 0xfeff);
  const header53Aug = csv53Aug.replace(/^﻿/, "").split("\n")[0];
  eq(
    "T6.2 หัวคอลัมน์ตามฟอร์ม RD (มีสาขา)",
    header53Aug,
    "ลำดับ,เลขที่ 50 ทวิ,วันที่จ่าย,ชื่อผู้รับเงิน,เลขประจำตัวผู้เสียภาษี,สาขา,ที่อยู่,ประเภทเงินได้,จำนวนเงินได้,อัตรา (%),ภาษีที่หัก,เงื่อนไขการหัก",
  );
  // แถวข้อมูล 1 + แถวรวม 1 = 2 บรรทัดข้อมูล (ไม่รวมหัว)
  const dataLines53Aug = csv53Aug.replace(/^﻿/, "").split("\n").slice(1).filter(Boolean);
  eq("T6.3 ภ.ง.ด.53 ส.ค. = 1 แถวข้อมูล + 1 แถวรวม", dataLines53Aug.length, 2);
  assert("T6.4 มีคอลัมน์สาขา 00000 (ผู้รับเป็นสำนักงานใหญ่)", dataLines53Aug[0].includes(",00000,"));
  const csv3Sep = await wht.pndCsv(tenantId, systemId, { type: 3, period: "2026-09" });
  const dataLines3Sep = csv3Sep.replace(/^﻿/, "").split("\n").slice(1).filter(Boolean);
  eq("T6.5 ภ.ง.ด.3 ก.ย. = 1 แถวข้อมูล + 1 แถวรวม (บุคคลธรรมดา)", dataLines3Sep.length, 2);
  const csv53Sep = await wht.pndCsv(tenantId, systemId, { type: 53, period: "2026-09" });
  const dataLines53Sep = csv53Sep.replace(/^﻿/, "").split("\n").slice(1).filter(Boolean);
  eq("T6.6 ภ.ง.ด.53 ก.ย. = 1 แถวข้อมูล + 1 แถวรวม (นิติบุคคล)", dataLines53Sep.length, 2);

  // ═════════ T7 — สรุปเช็ค ═════════
  console.log("\nT7 สรุปเช็ค:");
  const cqIn = await chq.chequeSummaryV2(tenantId, systemId, "IN");
  const sqlCqIn = await prisma.$queryRaw<{ pending: bigint | null }[]>`
    SELECT COALESCE(SUM(amount),0)::bigint AS pending FROM "AccountCheque"
    WHERE "systemId" = ${systemId} AND direction = 'IN' AND status IN ('ON_HAND','DEPOSITED')`;
  eq("T7.1 รอเรียกเก็บ (เช็ครับ) = SQL อิสระ", cqIn.pendingSatang, Number(sqlCqIn[0].pending ?? 0));
  eq("T7.2 รอเรียกเก็บ (เช็ครับ) = ฿850,000 สตางค์ (เช็คที่ยังไม่เด้ง)", cqIn.pendingSatang, 850_000);
  assert("T7.3 ครบกำหนดใน 7 วัน ≥ 1 (เช็คดิว 5 วัน)", cqIn.dueSoonCount >= 1);
  const cqOut = await chq.chequeSummaryV2(tenantId, systemId, "OUT");
  eq("T7.4 เช็คจ่ายรอตัด = ฿950,000 สตางค์ (ใบที่ยังไม่ยกเลิก)", cqOut.pendingSatang, 950_000);
  const statusIn = await chq.chequeStatusCounts(tenantId, systemId, "IN");
  eq("T7.5 เช็ครับ: ON_HAND=1 · BOUNCED=1", [statusIn.ON_HAND ?? 0, statusIn.BOUNCED ?? 0], [1, 1]);
  const statusOut = await chq.chequeStatusCounts(tenantId, systemId, "OUT");
  eq("T7.6 เช็คจ่าย: ISSUED=1 · VOIDED=1", [statusOut.ISSUED ?? 0, statusOut.VOIDED ?? 0], [1, 1]);

  // ═════════ T8 — รายการเช็ค (เช็คลอย) ═════════
  console.log("\nT8 รายการเช็ค:");
  const cqList = await chq.listChequesV2(tenantId, systemId, { direction: "IN", pageSize: 100 });
  const dueSoonRow = cqList.rows.find((r) => r.id === E.chequeV2.inDueSoonId);
  assert("T8.1 พบเช็ครับที่ครบกำหนด 5 วัน", !!dueSoonRow);
  eq("T8.2 เช็คลอย: contactName/documentNo = null", [dueSoonRow?.contactName, dueSoonRow?.documentNo], [null, null]);
  const bouncedRow = cqList.rows.find((r) => r.id === E.chequeV2.inBouncedId);
  eq("T8.3 เช็คที่เด้ง สถานะ = BOUNCED", bouncedRow?.status, "BOUNCED");

  // ═════════ ร้านทิ้ง (การเขียนทั้งหมด) ═════════
  console.log("\n── สร้างร้านทดสอบ (มัดจำ/EXPENSE + เช็คสำหรับทดสอบ mutation) ──");
  const stamp = Date.now();
  const tag = `qc-wht-${stamp}`;
  const t = await prisma.tenant.create({ data: { name: tag, slug: tag } });
  sTenantId = t.id;
  const tid = sTenantId;
  const owner = await prisma.user.create({ data: { email: `${tag}-owner@qc.local`, name: "QC เจ้าของ" } });
  const staff = await prisma.user.create({ data: { email: `${tag}-staff@qc.local`, name: "QC พนักงาน" } });
  ownerId = owner.id;
  staffId = staff.id;
  await prisma.membership.create({ data: { userId: owner.id, tenantId: tid, role: "OWNER", unitAccess: ["*"] } });
  const mStaff = await prisma.membership.create({
    data: { userId: staff.id, tenantId: tid, role: "STAFF", unitAccess: ["*"], permissions: { "account.doc.view": true } },
  });
  const unit = await prisma.businessUnit.create({ data: { tenantId: tid, type: "BOOKING", name: "สาขาทดสอบ", slug: `u-${stamp}`, status: "ACTIVE" } });
  const accSys = await sysMod.createSystem(tid, "ACCOUNT", "บัญชี " + tag);
  await sysMod.linkUnit(tid, accSys.id, unit.id);
  const sSystemId = accSys.id;
  const S = { tenantId: tid, systemId: sSystemId };
  await glMod.ensureAccounting(S);

  const bank = await finMod.createFinanceAccount({
    tenantId: tid,
    systemId: sSystemId,
    type: "BANK",
    name: "กสิกรไทย ทดสอบ",
    bankName: "กสิกรไทย",
    openingEntries: [{ date: new Date("2026-08-01T10:00:00+07:00"), amountSatang: 5_000_000, note: "ยอดยกมา" }],
  });
  if (!bank.ok) throw new Error("สร้างบัญชีธนาคารทดสอบไม่สำเร็จ: " + bank.reason);

  const vendor = await svc.createContact({
    tenantId: tid,
    systemId: sSystemId,
    kind: "VENDOR",
    legalType: "COMPANY",
    name: "บริษัท ทดสอบ WHT จำกัด",
    taxId: "9999999999999",
    address: "ทดสอบ",
    phone: "0899999999",
    email: null,
    creditTermDays: 0,
    note: "V-QC",
  });

  const ledgers = await exp.listExpenseAccounts(sSystemId);
  const expenseAcct = ledgers.find((a) => a.code === "6000") ?? ledgers[0];

  // เอกสาร EXPENSE 10,700 (ฐาน 10,000 + VAT 700) → หัก 3% = 300 → จ่ายสุทธิ 10,400 (ก.ย. 69)
  const expDoc = await exp.createExpenseDoc({
    tenantId: tid,
    systemId: sSystemId,
    docType: "EXPENSE",
    contactId: vendor.id,
    issueDate: new Date("2026-09-05T10:00:00+07:00"),
    dueDate: new Date("2026-09-05T10:00:00+07:00"),
    vatMode: "EXCLUDE",
    vatPurchaseMode: "CLAIM",
    lines: [{ description: "ทดสอบ WHT", qty: 1, unitName: "รายการ", unitPrice: 1_000_000, accountId: expenseAcct.id }],
    createdById: owner.id,
  });
  const expIssued = await exp.issueExpenseDoc(tid, sSystemId, expDoc.id);
  if (!expIssued.ok) throw new Error("ออกเอกสารทดสอบไม่สำเร็จ: " + expIssued.reason);
  const payRes = await exp.recordVendorPayment(tid, sSystemId, expDoc.id, {
    paidAt: new Date("2026-09-05T10:00:00+07:00"),
    channel: "TRANSFER",
    financeAccountId: bank.id,
    amount: 1_040_000,
    whtAmountSatang: 30_000,
    whtRateBp: 300,
    whtIncomeType: "M40_8",
    createdById: owner.id,
  });
  if (!payRes.ok) throw new Error("บันทึกจ่ายทดสอบไม่สำเร็จ: " + payRes.reason);
  const testPay = await prisma.accountDocumentPayment.findFirstOrThrow({ where: { documentId: expDoc.id }, select: { id: true, whtCertDocId: true } });
  if (!testPay.whtCertDocId) throw new Error("ไม่ออก 50 ทวิ ให้เอกสารทดสอบ");
  const testCertId = testPay.whtCertDocId;

  // ═════════ T9 — markFiled idempotent ═════════
  console.log("\nT9 ทำเครื่องหมายนำส่งแล้ว:");
  const before9 = await prisma.accountDocument.findUniqueOrThrow({ where: { id: testCertId }, select: { whtFiledPeriodKey: true } });
  eq("T9.0 ก่อนยื่น: whtFiledPeriodKey = null", before9.whtFiledPeriodKey, null);
  const m1 = await wht.markFiled(tid, sSystemId, { form: 53, periodKey: "2026-09" });
  if (!m1.ok) throw new Error("markFiled ครั้งแรกล้ม: " + m1.reason);
  eq("T9.1 certCount = 1", m1.certCount, 1);
  eq("T9.2 totalTaxSatang = 30,000", m1.totalTaxSatang, 30_000);
  const after9a = await prisma.accountDocument.findUniqueOrThrow({ where: { id: testCertId }, select: { whtFiledPeriodKey: true } });
  eq("T9.3 stamp whtFiledPeriodKey = 53:2026-09", after9a.whtFiledPeriodKey, "53:2026-09");
  const filingCount1 = await prisma.accountWhtFiling.count({ where: { systemId: sSystemId, form: 53, periodKey: "2026-09" } });
  eq("T9.4 มีแถว AccountWhtFiling 1 แถว", filingCount1, 1);
  const m2 = await wht.markFiled(tid, sSystemId, { form: 53, periodKey: "2026-09" });
  if (!m2.ok) throw new Error("markFiled ครั้งที่ 2 ล้ม: " + m2.reason);
  eq("T9.5 เรียกซ้ำ certCount/totalTax เท่าเดิม (idempotent)", [m2.certCount, m2.totalTaxSatang], [1, 30_000]);
  const filingCount2 = await prisma.accountWhtFiling.count({ where: { systemId: sSystemId, form: 53, periodKey: "2026-09" } });
  eq("T9.6 ยังมีแถว AccountWhtFiling แค่ 1 แถว (ไม่สร้างซ้ำ)", filingCount2, 1);
  const validated = await wht.validateMarkFiledSelection(tid, sSystemId, [testCertId]);
  assert("T9.7 validateMarkFiledSelection ok=true", validated.ok);
  if (validated.ok) assert("T9.8 alreadyFiled = true", validated.alreadyFiled);

  // ═════════ T10 — unmarkFiled owner-only ═════════
  console.log("\nT10 ยกเลิกเครื่องหมายนำส่ง (owner-only):");
  const authStaff = { user: { id: staff.id }, active: { ...mStaff, tenant: t } } as never;
  const authOwner = { user: { id: owner.id }, active: { ...(await prisma.membership.findFirstOrThrow({ where: { userId: owner.id, tenantId: tid } })), tenant: t } } as never;
  await rejected("T10.1 staff (ไม่มี account.wht.unmark) ถูกปฏิเสธ", async () => {
    assertAccountCan(authStaff, "account.wht.unmark");
    return { ok: true };
  });
  let ownerUnmarkPassed = true;
  try {
    assertAccountCan(authOwner, "account.wht.unmark");
  } catch {
    ownerUnmarkPassed = false;
  }
  assert("T10.2 owner ผ่านด่าน account.wht.unmark", ownerUnmarkPassed);
  const u1 = await wht.unmarkFiled(tid, sSystemId, { form: 53, periodKey: "2026-09" });
  if (!u1.ok) throw new Error("unmarkFiled ล้ม: " + u1.reason);
  const after10 = await prisma.accountDocument.findUniqueOrThrow({ where: { id: testCertId }, select: { whtFiledPeriodKey: true } });
  eq("T10.3 whtFiledPeriodKey ถูกล้าง = null", after10.whtFiledPeriodKey, null);
  const filingCount3 = await prisma.accountWhtFiling.count({ where: { systemId: sSystemId, form: 53, periodKey: "2026-09" } });
  eq("T10.4 แถว AccountWhtFiling ถูกลบ", filingCount3, 0);
  await rejected("T10.5 unmarkFiled งวดที่ไม่เคยยื่น = ปฏิเสธ", () => wht.unmarkFiled(tid, sSystemId, { form: 53, periodKey: "2026-09" }), "ยังไม่ได้ทำเครื่องหมาย");

  // ═════════ T11 — ยกเลิก payment → cert cascade VOIDED ═════════
  console.log("\nT11 ยกเลิกรายการชำระ → 50 ทวิ ถูกยกเลิกตาม:");
  const voidPay = await exp.voidVendorPayment(tid, sSystemId, expDoc.id, testPay.id, "ทดสอบยกเลิก");
  if (!voidPay.ok) throw new Error("ยกเลิกรายการชำระทดสอบไม่สำเร็จ: " + voidPay.reason);
  const afterVoidCert = await prisma.accountDocument.findUniqueOrThrow({ where: { id: testCertId }, select: { status: true } });
  eq("T11.1 สถานะ 50 ทวิ = VOIDED", afterVoidCert.status, "VOIDED");
  const cancelledList = await wht.listWhtCertsV2(tid, sSystemId, { direction: "IN", status: "CANCELLED", pageSize: 100 });
  eq("T11.2 แท็บ 'ยกเลิก' เห็นใบนี้ 1 ใบ", cancelledList.total, 1);
  const normalList = await wht.listWhtCertsV2(tid, sSystemId, { direction: "IN", status: "NORMAL", pageSize: 100 });
  eq("T11.3 แท็บ 'ปกติ' ไม่เห็นใบนี้แล้ว", normalList.total, 0);

  // ═════════ T12 — guard ═════════
  console.log("\nT12 ด่านสิทธิ์:");
  await rejected("T12.1 พนักงานที่ไม่มี account.wht.manage ถูกปฏิเสธ", async () => {
    assertAccountCan(authStaff, "account.wht.manage");
    return { ok: true };
  });
  await rejected("T12.2 พนักงานที่ไม่มี account.cheque.manage ถูกปฏิเสธ", async () => {
    assertAccountCan(authStaff, "account.cheque.manage");
    return { ok: true };
  });
  const mFinance = { ...mStaff, permissions: { "account.wht.manage": true, "account.cheque.manage": true } };
  const authFinance = { user: { id: staff.id }, active: { ...mFinance, tenant: t } } as never;
  let financeWhtOk = true;
  try {
    assertAccountCan(authFinance, "account.wht.manage");
  } catch {
    financeWhtOk = false;
  }
  assert("T12.3 staff ที่มี account.wht.manage ผ่านด่าน", financeWhtOk);

  // ═════════ T13 — tenant isolation ═════════
  console.log("\nT13 แยกร้าน:");
  const crossValidate = await wht.validateMarkFiledSelection(tid, sSystemId, [E.whtV2.deductCertIds[0]]);
  eq("T13.1 certId ของร้านจริงมองไม่เห็นจากร้านทดสอบ", crossValidate.ok, false);
  const crossCheque = await chq.getCheque(tid, sSystemId, E.chequeV2.outPendingId);
  eq("T13.2 chequeId ของร้านจริงมองไม่เห็นจากร้านทดสอบ", crossCheque, null);

  // ═════════ T14 — lifecycle เช็ค ═════════
  console.log("\nT14 lifecycle เช็ค:");
  const c1 = await chq.createCheque({ tenantId: tid, systemId: sSystemId, direction: "IN", chequeNo: "QC001", bankName: "ทดสอบ", chequeDate: new Date(), amount: 500_000, financeAccountId: bank.id });
  if (!c1.ok) throw new Error("สร้างเช็คทดสอบไม่สำเร็จ: " + c1.reason);
  const dep1 = await chq.depositCheque(tid, sSystemId, c1.id);
  assert("T14.1 นำฝากสำเร็จ", dep1.ok);
  const afterDep = await prisma.accountCheque.findUniqueOrThrow({ where: { id: c1.id }, select: { depositedAt: true, status: true } });
  assert("T14.2 depositedAt ถูกบันทึก", afterDep.depositedAt !== null);
  await rejected("T14.3 นำฝากซ้ำ = ปฏิเสธ", () => chq.depositCheque(tid, sSystemId, c1.id), "ไม่อยู่สถานะรอนำฝาก");
  const clear1 = await chq.clearCheque(tid, sSystemId, c1.id);
  assert("T14.4 เคลียร์สำเร็จ", clear1.ok);
  await rejected("T14.5 ยกเลิกเช็คที่เคลียร์แล้ว (voidCheque ผิดทิศ) = ปฏิเสธ", () => chq.voidCheque(tid, sSystemId, c1.id), "ยกเลิกได้เฉพาะเช็คจ่าย");

  const c2 = await chq.createCheque({ tenantId: tid, systemId: sSystemId, direction: "IN", chequeNo: "QC002", bankName: "ทดสอบ", chequeDate: new Date(), amount: 300_000, financeAccountId: bank.id });
  if (!c2.ok) throw new Error("สร้างเช็คทดสอบ #2 ไม่สำเร็จ: " + c2.reason);
  const bounce2 = await chq.bounceCheque(tid, sSystemId, c2.id, "ทดสอบเด้ง");
  assert("T14.6 บันทึกเด้งสำเร็จ", bounce2.ok);
  await rejected("T14.7 เคลียร์เช็คที่เด้งแล้ว = ปฏิเสธ (ตัวอย่างจาก WO)", () => chq.clearCheque(tid, sSystemId, c2.id), "นำฝากก่อน");

  const c3 = await chq.createCheque({ tenantId: tid, systemId: sSystemId, direction: "OUT", chequeNo: "QC003", bankName: "ทดสอบ", chequeDate: new Date(), amount: 400_000, financeAccountId: bank.id });
  if (!c3.ok) throw new Error("สร้างเช็คจ่ายทดสอบไม่สำเร็จ: " + c3.reason);
  const void3 = await chq.voidCheque(tid, sSystemId, c3.id, "ทดสอบยกเลิก");
  assert("T14.8 ยกเลิกเช็คจ่ายสำเร็จ", void3.ok);
  await rejected("T14.9 ยกเลิกเช็คจ่ายที่ยกเลิกไปแล้ว = ปฏิเสธ", () => chq.voidCheque(tid, sSystemId, c3.id), "ยกเลิกได้เฉพาะเช็คจ่ายที่ยังไม่ถูกเรียกเก็บ");
  await rejected("T14.10 เด้งเช็คจ่าย (bounceCheque ผิดทิศ) = ปฏิเสธ", () => chq.bounceCheque(tid, sSystemId, c3.id), "เด้งได้เฉพาะเช็ครับ");
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
  await d(() => prisma.accountWhtFiling.deleteMany({ where: { tenantId: sTenantId! } }));
  await d(() => prisma.accountCheque.deleteMany({ where: { tenantId: sTenantId! } }));
  await d(() => prisma.accountDocumentPayment.deleteMany({ where: { tenantId: sTenantId! } }));
  await d(() => prisma.accountJournalLine.deleteMany({ where: { tenantId: sTenantId! } }));
  await d(() => prisma.accountJournalEntry.updateMany({ where: { tenantId: sTenantId! }, data: { reversalOfId: null } }));
  await d(() => prisma.accountJournalEntry.deleteMany({ where: { tenantId: sTenantId! } }));
  await d(() => prisma.accountDocumentLine.deleteMany({ where: { tenantId: sTenantId! } }));
  await d(() => prisma.accountDocument.deleteMany({ where: { tenantId: sTenantId! } }));
  await d(() => prisma.accountContact.deleteMany({ where: { tenantId: sTenantId! } }));
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

console.log(`\n===== QC WO 5.4 · WHT 2 ขา V2 + เช็ค V2 สรุป =====`);
console.log(`ผ่าน ${passed} · ตก ${findings.length}`);
if (findings.length > 0) console.log(findings.map((f) => "  - " + f).join("\n"));
console.log(`JSON_SUMMARY ${JSON.stringify({ total: passed + findings.length, passed, findings })}`);
await prisma.$disconnect();
process.exit(findings.length === 0 ? 0 : 1);
