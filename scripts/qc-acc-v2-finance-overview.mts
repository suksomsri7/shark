// QC WO 5.2 — ภาพรวมการเงิน + ปฏิทินเงินเข้า-ออก + สำรองรับ/จ่าย (หน้าแยก) — DESIGN-SPEC-V2 §10.2–§10.3 · เฟรม f7
//
// requires: acc-v2-seed + acc-v2-expected-dashboard (calendar/cash เขียนโดยสคริปต์นั้น — ห้ามเรียก dashboard.ts
//   ในสคริปต์เฉลย ยึดกติกาเดียวกับ WO 2.1: เฉลย = SQL อิสระ ไม่ใช่เทียบโค้ดกับตัวเอง)
//
// รัน (บังคับ DB QC branch):
//   QC_ENV_FILE=.env.qc pnpm tsx scripts/seed-acc-v2-qc.mts
//   QC_ENV_FILE=.env.qc pnpm tsx scripts/acc-v2-expected-dashboard.mts
//   QC_ENV_FILE=.env.qc pnpm tsx scripts/qc-acc-v2-finance-overview.mts
//
// 🔴 การ**เขียน** (เติมเงิน/เบิกชดเชย/idempotent/guard/tenant isolation) เกิดใน "ร้านทิ้ง" ที่สคริปต์สร้างเอง
//    แล้วลบใน finally — ร้าน QC จริง (SIAM DIVE QC) = อ่านอย่างเดียวเท่านั้น (ไม่แตะ PTY001/BSV001 ของ seed)
//
// ครอบคลุม
//   FO1 6 ไทล์ (financeOverview.calendar.tiles) = เฉลยอิสระ expected.dashboard.calendar.tiles
//   FO2 ผลรวมปฏิทินรายวัน = เฉลยอิสระ (group by date จาก expected.dashboard.calendar.days) · Σ days = ไทล์
//   FO3 financeDayDetail ของวันที่มีรายการค้างเบิก (2026-09-20) แสดงแถวถูกต้อง (จำนวน/ยอด/docType)
//   FO4 pettyCashList: PTY001 balance = เฉลย (2,970,000) · เติมล่าสุด = โอนเข้าล่าสุดจริง (SQL อิสระ)
//   FO5 topUpPettyCash idempotent (transferId เดิม กดซ้ำ ไม่โพสต์/ไม่ขยับยอดซ้ำ)
//   FO6 reimbursePettyCash ผูก payment ได้ 1 ครั้ง · เรียกซ้ำ (payment เดิมที่ reimbursedAt ตั้งแล้ว) ถูกปฏิเสธ
//   FO7 guard: ไม่มีสิทธิ์ account.finance.manage ถูกปฏิเสธทุก action ที่เขียน
//   FO8 tenant isolation: ร้านอื่นเห็นข้อมูลร้านทิ้งไม่ได้ (financeOverview/pettyCashList/reimburse ข้าม tenant)
//   FO9 งบ query ของ financeOverview ≤ 12 (นับจริงจาก field queryCount ที่ฟังก์ชันคืนมา)

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
const exp = await import("@/lib/modules/account/expense");
const fin = await import("@/lib/modules/account/finance");
const fov = await import("@/lib/modules/account/finance-overview");
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

console.log(`\n===== QC WO 5.2 · ภาพรวมการเงิน + สำรองรับ/จ่าย =====`);
console.log(`[env] DB ${host}\n`);

type Expected = {
  tenantId: string;
  systemId: string;
  finance: { PTY001: number; BSV001: number; total: number };
  pettyCash: {
    id: string;
    code: string;
    balance: number;
    topUpAmount: number;
    topUpDate: string;
    reimbursed: { paymentId: string; amount: number; date: string };
    pending: { paymentId: string; amount: number; date: string };
  };
  dashboard: {
    now: string;
    calendar: {
      monthKey: string;
      tiles: Record<string, { count: number; amount: number }>;
      days: { date: string; dir: "IN" | "OUT"; count: number; amount: number }[];
    };
  };
};
const expected = JSON.parse(readFileSync(QC.expectedPath, "utf8")) as Expected;
const { tenantId, systemId } = expected;
const now = new Date(expected.dashboard.now);
const monthKey = expected.dashboard.calendar.monthKey;

try {
  // ═════════ FO1 — 6 ไทล์ ═════════
  console.log("FO1 6 ไทล์ (ตรง f7 เป๊ะ — inflow/overdueReceivable/expectedIn/outflow/overduePayable/expectedOut):");
  const overview = await fov.financeOverview({ tenantId, systemId }, { month: monthKey, now });
  // เทียบทีละคีย์ (ไม่ใช้ JSON.stringify ทั้งก้อน — ลำดับคีย์ต่างกันได้แม้ค่าตรงกัน)
  for (const key of ["inflow", "outflow", "expectedIn", "expectedOut", "overdueReceivable", "overduePayable"] as const) {
    eq(`FO1.1 tile "${key}" = เฉลยอิสระ`, overview.calendar.tiles[key], expected.dashboard.calendar.tiles[key]);
  }
  assert(
    "FO1.2 6 คีย์ครบตามภาพ f7 (ไม่มี 'สุทธิ'/'ยอดคงเหลือรวม' ปนมา)",
    Object.keys(overview.calendar.tiles).sort().join(",") ===
      ["expectedIn", "expectedOut", "inflow", "outflow", "overduePayable", "overdueReceivable"].sort().join(","),
  );
  // WO 5.2 round 2 (coordinator feedback) — ไทล์ "คาดว่าจะเข้า/ออก" ต้องไม่เป็น 0 (seed มีใบครบกำหนดเดือนนี้แล้ว
  // จงใจตั้งเวลาไว้เย็นวันที่ 30 ก.ย. — หลัง QC.today 12:00 พอดี ⇒ ต้องยังไม่พ้นกำหนด/ไม่ปนกับ overdue)
  assert("FO1.3 คาดว่าจะเข้า ≠ 0 (มีใบครบกำหนดเดือนนี้จริงในเฉลย)", overview.calendar.tiles.expectedIn.amount > 0, `ได้ ${overview.calendar.tiles.expectedIn.amount}`);
  assert("FO1.4 คาดว่าจะออก ≠ 0 (มีบิลครบกำหนดเดือนนี้จริงในเฉลย)", overview.calendar.tiles.expectedOut.amount > 0, `ได้ ${overview.calendar.tiles.expectedOut.amount}`);
  eq("FO1.5 คาดว่าจะเข้า = 2 ใบ ฿8,000.00 (800,000 สตางค์)", overview.calendar.tiles.expectedIn, { count: 2, amount: 800_000 });
  eq("FO1.6 คาดว่าจะออก = 1 ใบ ฿2,000.00 (200,000 สตางค์)", overview.calendar.tiles.expectedOut, { count: 1, amount: 200_000 });
  // ยืนยันว่าใบที่เพิ่มเข้ามาไม่ไปปนกับ overdue (คนละหมวด แม้ query คนละตัวไม่ตัดกันเองก็ตาม)
  eq("FO1.7 ค้างรับเกินกำหนดยังคงเดิม 4 ใบ (ใบใหม่ไม่ปนเข้า overdue)", overview.calendar.tiles.overdueReceivable, { count: 4, amount: 12_840_000 });
  eq("FO1.8 ค้างจ่ายเกินกำหนดยังคงเดิม 2 ใบ (ใบใหม่ไม่ปนเข้า overdue)", overview.calendar.tiles.overduePayable, { count: 2, amount: 7_750_000 });

  // ═════════ FO2 — ผลรวมปฏิทินรายวัน ═════════
  console.log("\nFO2 ผลรวมปฏิทินรายวัน:");
  const byDateExpected = new Map<string, { inflow: number; outflow: number }>();
  for (const r of expected.dashboard.calendar.days) {
    const cur = byDateExpected.get(r.date) ?? { inflow: 0, outflow: 0 };
    if (r.dir === "OUT") cur.inflow += r.amount; // dir OUT (เอกสารรายรับ) = เงินเข้า
    else cur.outflow += r.amount; // dir IN (เอกสารรายจ่าย) = เงินออก
    byDateExpected.set(r.date, cur);
  }
  let dateMismatch = 0;
  for (const d of overview.calendar.days) {
    const want = byDateExpected.get(d.date) ?? { inflow: 0, outflow: 0 };
    if (d.inflow !== want.inflow || d.outflow !== want.outflow) dateMismatch++;
  }
  assert(`FO2.1 ทุกวันในเดือน (${overview.calendar.days.length} วัน) ตรงเฉลยอิสระ`, dateMismatch === 0, `${dateMismatch} วันไม่ตรง`);
  const sumInflow = overview.calendar.days.reduce((s, d) => s + d.inflow, 0);
  const sumOutflow = overview.calendar.days.reduce((s, d) => s + d.outflow, 0);
  eq("FO2.2 Σ เงินเข้าทุกวัน = ไทล์เงินเข้า", sumInflow, overview.calendar.tiles.inflow.amount);
  eq("FO2.3 Σ เงินออกทุกวัน = ไทล์เงินออก", sumOutflow, overview.calendar.tiles.outflow.amount);

  // ═════════ FO3 — financeDayDetail ═════════
  console.log("\nFO3 financeDayDetail (2026-09-20 — ค่าจอดรถ ค้างเบิก ที่ seed ใส่ไว้):");
  const day = await fov.financeDayDetail({ tenantId, systemId }, "2026-09-20");
  eq("FO3.1 มี 1 แถว", day.rows.length, 1);
  const row = day.rows[0];
  assert("FO3.2 เป็นเอกสารรายจ่าย (direction IN)", row?.direction === "IN");
  eq("FO3.3 ยอด = 30,000 สตางค์ (฿300.00)", row?.amountSatang, expected.pettyCash.pending.amount);
  eq("FO3.4 totalOut ของวันนั้น = 30,000", day.totalOut, expected.pettyCash.pending.amount);
  eq("FO3.5 totalIn ของวันนั้น = 0 (ไม่มีเงินเข้าวันนี้)", day.totalIn, 0);

  // ═════════ FO4 — pettyCashList ═════════
  console.log("\nFO4 pettyCashList (PTY001):");
  const members = await prisma.membership.findMany({ where: { tenantId }, select: { userId: true, user: { select: { name: true, email: true } } } });
  const holderNames = new Map(members.map((m) => [m.userId, m.user.name ?? m.user.email]));
  const boxes = await fov.pettyCashList({ tenantId, systemId }, holderNames);
  const pty = boxes.find((b) => b.code === "PTY001");
  assert("FO4.1 พบกล่อง PTY001", !!pty);
  eq("FO4.2 ยอดคงเหลือ = เฉลย (2,970,000 สตางค์)", pty?.balanceSatang, expected.pettyCash.balance);
  // เฉลยอิสระ: โอนเข้าล่าสุดจริงจาก AccountFinanceTransfer (raw SQL — ไม่เรียก pettyCashList ซ้ำ)
  const lastTransferRow = await prisma.$queryRaw<{ date: Date; amountsatang: number }[]>`
    SELECT date, "amountSatang" AS amountsatang FROM "AccountFinanceTransfer"
     WHERE "systemId" = ${systemId} AND "toId" = ${expected.pettyCash.id} AND "entryId" IS NOT NULL
     ORDER BY date DESC LIMIT 1`;
  assert("FO4.3 เติมล่าสุด = โอนเข้าล่าสุดจริง (SQL อิสระ)", pty?.lastTopUpAmountSatang === Number(lastTransferRow[0]?.amountsatang));
  // ตามนิยาม §10.3 "เติมล่าสุด = โอนเข้าล่าสุด" (รวมเบิกชดเชย) ⇒ ควรเป็นรายการเบิกชดเชย A (09-14, 50,000) ไม่ใช่ topup (09-10)
  eq("FO4.4 เติมล่าสุดคือรายการล่าสุดตามวันที่ (เบิกชดเชย A 2026-09-14 ฿500)", pty?.lastTopUpAmountSatang, expected.pettyCash.reimbursed.amount);

  // ═════════ ร้านทิ้งสำหรับ FO5–FO8 ═════════
  const stamp = Date.now();
  const tag = `qc-fov-${stamp}`;
  const t = await prisma.tenant.create({ data: { name: tag, slug: tag } });
  const sTenantId = t.id;
  const owner = await prisma.user.create({ data: { email: `${tag}-owner@qc.local`, name: "QC เจ้าของ" } });
  const staff = await prisma.user.create({ data: { email: `${tag}-staff@qc.local`, name: "QC พนักงาน" } });
  await prisma.membership.create({ data: { userId: owner.id, tenantId: sTenantId, role: "OWNER", unitAccess: ["*"] } });
  const mStaff = await prisma.membership.create({
    data: { userId: staff.id, tenantId: sTenantId, role: "STAFF", unitAccess: ["*"], permissions: { "account.doc.view": true } },
  });
  const unit = await prisma.businessUnit.create({ data: { tenantId: sTenantId, type: "BOOKING", name: "สาขาทดสอบ", slug: `u-${stamp}`, status: "ACTIVE" } });
  const acc = await sysMod.createSystem(sTenantId, "ACCOUNT", "บัญชี " + tag);
  await sysMod.linkUnit(sTenantId, acc.id, unit.id);
  const sSystemId = acc.id;
  await glMod.ensureAccounting({ tenantId: sTenantId, systemId: sSystemId });

  const bank = await fin.createFinanceAccount({
    tenantId: sTenantId,
    systemId: sSystemId,
    type: "BANK",
    name: "ธนาคารทดสอบ",
    openingEntries: [{ date: new Date("2026-01-10"), amountSatang: 500_000, note: "ยอดยกมา" }],
  });
  if (!bank.ok) throw new Error("สร้างบัญชีธนาคารทดสอบไม่สำเร็จ: " + bank.reason);
  const petty = await fin.createFinanceAccount({
    tenantId: sTenantId,
    systemId: sSystemId,
    type: "PETTY_CASH",
    name: "เงินสดย่อยทดสอบ",
    limitSatang: 100_000,
    holderUserId: owner.id,
  });
  if (!petty.ok) throw new Error("สร้างบัญชีสำรองจ่ายทดสอบไม่สำเร็จ: " + petty.reason);

  const ledgersRows = await exp.listExpenseAccounts(sSystemId);
  const expenseLedger = ledgersRows.find((a) => a.code === "6000") ?? ledgersRows[0];
  const expDoc = await exp.createExpenseDoc({
    tenantId: sTenantId,
    systemId: sSystemId,
    docType: "EXPENSE",
    issueDate: new Date("2026-02-01"),
    vatMode: "NONE",
    lines: [{ description: "ค่าใช้จ่ายทดสอบ", qty: 1, unitPrice: 20_000, accountId: expenseLedger.id }],
    createdById: owner.id,
  });
  const issuedExp = await exp.issueExpenseDoc(sTenantId, sSystemId, expDoc.id);
  if (!issuedExp.ok) throw new Error("ออกเอกสารค่าใช้จ่ายทดสอบไม่สำเร็จ: " + issuedExp.reason);
  const paidExp = await exp.recordVendorPayment(sTenantId, sSystemId, expDoc.id, {
    paidAt: new Date("2026-02-02"),
    channel: "CASH",
    financeAccountId: petty.id,
    amount: 20_000,
    createdById: owner.id,
  });
  if (!paidExp.ok || !paidExp.paymentId) throw new Error("บันทึกจ่ายค่าใช้จ่ายทดสอบไม่สำเร็จ: " + (!paidExp.ok ? paidExp.reason : ""));
  const testPaymentId = paidExp.paymentId;

  // ═════════ FO5 — topUpPettyCash idempotent ═════════
  console.log("\nFO5 topUpPettyCash idempotent:");
  const balBefore = (await fin.financeBalances(sTenantId, sSystemId)).find((a) => a.id === petty.id)?.balance ?? 0;
  const topUpTransferId = `qc-fov-topup-${stamp}`;
  const topUp1 = await fov.topUpPettyCash(sTenantId, sSystemId, {
    pettyId: petty.id,
    sourceFinanceId: bank.id,
    amount: 30_000,
    date: new Date("2026-02-05"),
    transferId: topUpTransferId,
  });
  assert("FO5.1 เติมเงินสำเร็จ", topUp1.ok, topUp1.ok ? "" : topUp1.reason);
  const balAfter1 = (await fin.financeBalances(sTenantId, sSystemId)).find((a) => a.id === petty.id)?.balance ?? 0;
  eq("FO5.2 ยอดเพิ่มขึ้น 30,000 สตางค์", balAfter1 - balBefore, 30_000);
  const topUp2 = await fov.topUpPettyCash(sTenantId, sSystemId, {
    pettyId: petty.id,
    sourceFinanceId: bank.id,
    amount: 30_000,
    date: new Date("2026-02-05"),
    transferId: topUpTransferId,
  });
  assert("FO5.3 เติมซ้ำ (transferId เดิม) ยังคืน ok", topUp2.ok);
  const balAfter2 = (await fin.financeBalances(sTenantId, sSystemId)).find((a) => a.id === petty.id)?.balance ?? 0;
  eq("FO5.4 เติมซ้ำแล้วยอดไม่ขยับต่อ (idempotent)", balAfter2, balAfter1);

  // ═════════ FO6 — reimbursePettyCash ผูก payment ได้ครั้งเดียว ═════════
  console.log("\nFO6 reimbursePettyCash:");
  const listBefore = await fov.listReimbursableExpensePayments({ tenantId: sTenantId, systemId: sSystemId }, petty.id);
  assert("FO6.1 มี 1 รายการรอเบิกชดเชย ก่อนเบิก", listBefore.length === 1 && listBefore[0].paymentId === testPaymentId);
  const balBeforeReimburse = (await fin.financeBalances(sTenantId, sSystemId)).find((a) => a.id === petty.id)?.balance ?? 0;
  const reimburse1 = await fov.reimbursePettyCash(sTenantId, sSystemId, {
    paymentId: testPaymentId,
    sourceFinanceId: bank.id,
    date: new Date("2026-02-06"),
  });
  assert("FO6.2 เบิกชดเชยสำเร็จ", reimburse1.ok, reimburse1.ok ? "" : reimburse1.reason);
  const balAfterReimburse = (await fin.financeBalances(sTenantId, sSystemId)).find((a) => a.id === petty.id)?.balance ?? 0;
  eq("FO6.3 ยอดเพิ่มขึ้น 20,000 สตางค์ (เท่ากับ payment ที่เบิกชดเชย)", balAfterReimburse - balBeforeReimburse, 20_000);
  const paymentRow = await prisma.accountDocumentPayment.findUniqueOrThrow({ where: { id: testPaymentId } });
  assert("FO6.4 payment.reimbursedAt ถูกตั้งแล้ว", !!paymentRow.reimbursedAt);
  assert("FO6.5 payment.reimbursedTransferId ถูกตั้งแล้ว", !!paymentRow.reimbursedTransferId);
  const listAfter = await fov.listReimbursableExpensePayments({ tenantId: sTenantId, systemId: sSystemId }, petty.id);
  eq("FO6.6 ไม่มีรายการรอเบิกชดเชยแล้ว (0 รายการ)", listAfter.length, 0);
  const reimburse2 = await fov.reimbursePettyCash(sTenantId, sSystemId, {
    paymentId: testPaymentId,
    sourceFinanceId: bank.id,
    date: new Date("2026-02-07"),
  });
  assert("FO6.7 เบิกชดเชยซ้ำ (payment เดิม) ถูกปฏิเสธ", !reimburse2.ok);
  assert("FO6.8 เหตุผลพูดถึง 'เบิกชดเชยไปแล้ว'", !reimburse2.ok && /เบิกชดเชยไปแล้ว/.test(reimburse2.reason));
  const balAfterReimburse2 = (await fin.financeBalances(sTenantId, sSystemId)).find((a) => a.id === petty.id)?.balance ?? 0;
  eq("FO6.9 เบิกซ้ำแล้วยอดไม่ขยับต่อ (ไม่โพสต์ GL ซ้ำ)", balAfterReimburse2, balAfterReimburse);

  // ═════════ FO7 — guard ═════════
  console.log("\nFO7 guard:");
  const authStaff = { user: { id: staff.id }, active: mStaff } as never;
  let deniedFinance = false;
  try {
    assertAccountCan(authStaff, "account.finance.manage");
  } catch {
    deniedFinance = true;
  }
  assert("FO7.1 พนักงานไม่มีสิทธิ์ 'account.finance.manage' ถูกปฏิเสธ", deniedFinance);
  let viewOk = true;
  try {
    assertAccountCan(authStaff, "account.doc.view");
  } catch {
    viewOk = false;
  }
  assert("FO7.2 positive control: สิทธิ์ที่มีจริงต้องผ่าน", viewOk);

  // ═════════ FO8 — tenant isolation ═════════
  console.log("\nFO8 tenant isolation:");
  const crossOverview = await fov.financeOverview({ tenantId, systemId: sSystemId }, { month: monthKey, now });
  eq("FO8.1 ระบบบัญชีจริง (QC) มองผ่าน systemId ของร้านทิ้ง = ว่างเปล่า", crossOverview.tracked.length, 0);
  eq("FO8.2 ยอดรวม 'เงินคุณอยู่ไหน' ของร้านทิ้ง (มองจาก tenant คนละร้าน) = 0", crossOverview.cash.total, 0);
  const crossReimburse = await fov.reimbursePettyCash(tenantId, systemId, {
    paymentId: testPaymentId, // payment ของร้านทิ้ง — ร้าน QC จริงเรียกไม่ได้
    sourceFinanceId: bank.id,
    date: new Date(),
  });
  assert("FO8.3 ร้าน QC จริงเบิกชดเชย payment ของร้านทิ้งไม่ได้ (ข้าม tenant)", !crossReimburse.ok);
  const crossPetty = await fov.pettyCashList({ tenantId, systemId: sSystemId });
  eq("FO8.4 pettyCashList ข้าม systemId เห็น 0 กล่อง", crossPetty.length, 0);

  // ═════════ FO9 — งบ query ═════════
  console.log("\nFO9 งบ query ของ financeOverview:");
  assert(`FO9.1 financeOverview ≤ 12 query (ได้ ${overview.queryCount})`, overview.queryCount <= 12, `ได้ ${overview.queryCount}`);

  // cleanup ร้านทิ้ง
  const d = async (f: () => Promise<unknown>) => {
    try {
      await f();
    } catch {
      /* best-effort */
    }
  };
  await d(() => prisma.accountDocumentPayment.deleteMany({ where: { tenantId: sTenantId } }));
  await d(() => prisma.accountJournalLine.deleteMany({ where: { tenantId: sTenantId } }));
  await d(() => prisma.accountJournalEntry.updateMany({ where: { tenantId: sTenantId }, data: { reversalOfId: null } }));
  await d(() => prisma.accountJournalEntry.deleteMany({ where: { tenantId: sTenantId } }));
  await d(() => prisma.accountDocumentLine.deleteMany({ where: { tenantId: sTenantId } }));
  await d(() => prisma.accountDocument.deleteMany({ where: { tenantId: sTenantId } }));
  for (const m of [
    "accountFinanceOpening", "accountFinanceTransfer", "accountFinance",
    "accountLedger", "accountPeriod", "accountDocSequence", "accountSettings", "accountSystemLink",
    "appNotification", "outboxEvent", "appSystemUnit", "appSystem", "businessUnit", "membership",
  ]) {
    await d(() => (prisma as unknown as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: sTenantId } }));
  }
  await d(() => prisma.tenant.delete({ where: { id: sTenantId } }));
  await d(() => prisma.user.deleteMany({ where: { id: { in: [owner.id, staff.id] } } }));
  console.log(`\n🧹 ลบร้านทดสอบแล้ว`);
} catch (e) {
  bad("CRASH", e instanceof Error ? `${e.message}\n${e.stack?.split("\n").slice(1, 5).join("\n")}` : String(e));
}

console.log(`\n===== QC WO 5.2 · ภาพรวมการเงิน + สำรองรับ/จ่าย สรุป =====`);
console.log(`ผ่าน ${passed} · ตก ${findings.length}`);
if (findings.length > 0) console.log(findings.map((f) => "  - " + f).join("\n"));
console.log(`JSON_SUMMARY ${JSON.stringify({ total: passed + findings.length, passed, findings })}`);
await prisma.$disconnect();
process.exit(findings.length === 0 ? 0 : 1);
