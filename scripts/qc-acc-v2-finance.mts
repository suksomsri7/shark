// QC WO 5.1 — ช่องทางการเงิน V2 (เงินสด/ธนาคาร/e-Wallet) — DESIGN-SPEC-V2 §10.1 · เฟรม g9
//
// requires: acc-v2-seed
//
// รัน (บังคับ DB QC branch):
//   QC_ENV_FILE=.env.qc pnpm tsx scripts/seed-acc-v2-qc.mts
//   QC_ENV_FILE=.env.qc pnpm tsx scripts/qc-acc-v2-finance.mts
//
// 🔴 ความปลอดภัยข้อมูล: การ **เขียน** (สร้างช่องทาง/โอน/แก้ยอดยกมา) เกิดใน "ร้านทิ้ง" ที่สคริปต์สร้างเอง
//    แล้วลบใน finally · ร้าน QC จริง (`SIAM DIVE QC`) = อ่านอย่างเดียว
// 🔴 เฉลยของข้อที่วัดตัวเลข ใช้ raw SQL อิสระ (ไม่เรียกฟังก์ชันเดียวกับที่กำลังทดสอบ)
//
// ครอบคลุม
//   FN1  fixture seed: กลุ่ม/ยอดกลุ่ม/ยอดรวม = เฉลย 1,284,560 · จำนวนช่องทาง 4 (ไม่นับที่ปิดใช้งาน)
//   FN2  ยอดต่อช่องทาง = ยอด ledger จริง (raw SQL อิสระ)
//   FN3  เปลี่ยนแปลงเดือนนี้ = SQL อิสระ (กรอง entry.date ในเดือนนี้)
//   FN4  BSV001 ยอดยกมา 2 รายการจาก seed → 2 JV แยกกัน ผลรวม = เฉลย
//   FN5  สร้างช่องทางใหม่ + ยอดยกมา 2 รายการ → 2 JV · sum ถูก · gl.postFinanceOpening ยิงซ้ำ (idempotent) ไม่เบิ้ล
//   FN6  แก้ไขรายการยอดยกมา → reversal + JV ใหม่ (version+1) · ยอดคงเหลือถูก
//   FN7  ลบรายการยอดยกมา → reversal (ไม่ลบ JV เดิม) · ยอดคงเหลือถูก
//   FN8  โอนเงินระหว่างช่องทาง 1,000 บาท → ทั้งสองยอดขยับ · JV สมดุล · โอนซ้ำ transferId เดิม = ไม่เบิ้ล
//   FN9  ปิดใช้งานถูกปฏิเสธเมื่อยอด≠0 · ปิดใช้งานสำเร็จเมื่อยอด=0
//   FN10 รหัสช่องทางไม่ซ้ำแม้ยิงพร้อมกัน (5 คำขอ auto-code พร้อมกัน)
//   FN11 guard ปฏิเสธผู้ไม่มีสิทธิ์ · positive control สิทธิ์ที่มีจริงผ่าน
//   FN12 tenant isolation: getFinanceAccountById ข้ามระบบ = ไม่พบ
//   FN13 dashboard.cashPosition ยังตรงกับ financeBalances (ไม่ถอยหลังจาก WO นี้)

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
const dash = await import("@/lib/modules/account/dashboard");
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

console.log(`\n===== QC WO 5.1 · ช่องทางการเงิน V2 =====`);
console.log(`[env] DB ${host}\n`);

type Expected = {
  tenantId: string;
  systemId: string;
  finance: { CSH001: number; BSV001: number; EWL001: number; PTY001: number; total: number };
  financeGroups: { CASH: number; BANK_SAVINGS: number; E_WALLET: number; PETTY_CASH: number };
  financeAccounts: { code: string; id: string; name: string; type: string; opening: number; balance: number }[];
  financeOpeningSplit: { code: string; financeId: string; entries: { seq: number; amount: number }[]; sum: number };
  financeArchived: { id: string; code: string | null };
};
const expected = JSON.parse(readFileSync(QC.expectedPath, "utf8")) as Expected;
const { tenantId, systemId } = expected;

/** เฉลยอิสระ: ยอด ledger จริงของบัญชีเงิน (raw SQL — ไม่ผ่าน finance.ts ที่กำลังทดสอบ) */
async function ledgerBalanceOf(financeId: string, sysId = systemId): Promise<number> {
  const fa = await prisma.accountFinance.findUniqueOrThrow({ where: { id: financeId }, select: { ledgerAccountId: true } });
  if (!fa.ledgerAccountId) return 0;
  const rows = await prisma.$queryRaw<{ dr: bigint | null; cr: bigint | null }[]>`
    SELECT SUM(debit)::bigint AS dr, SUM(credit)::bigint AS cr FROM "AccountJournalLine"
    WHERE "systemId" = ${sysId} AND "accountId" = ${fa.ledgerAccountId}`;
  return Number(rows[0]?.dr ?? 0) - Number(rows[0]?.cr ?? 0);
}

/** เฉลยอิสระ: JV ของ refType/refId (raw SQL) */
async function entriesFor(refType: string, refIdPrefix: string, sysId = systemId) {
  return prisma.$queryRaw<{ id: string; status: string; refId: string }[]>`
    SELECT id, status, "refId" FROM "AccountJournalEntry"
    WHERE "systemId" = ${sysId} AND "refType" = ${refType} AND "refId" LIKE ${refIdPrefix + "%"}
    ORDER BY "createdAt" ASC`;
}

try {
  // ═════════ FN1 — fixture seed: กลุ่ม/ยอดรวม ═════════
  console.log("FN1 fixture seed:");
  const rows = await fin.financeBalances(tenantId, systemId);
  assert("FN1.1 จำนวนช่องทางที่ใช้งาน = 4 (ไม่นับที่ปิดใช้งาน)", rows.length === 4, `ได้ ${rows.length}`);
  const total = rows.reduce((s, a) => s + a.balance, 0);
  eq("FN1.2 ยอดรวมทุกช่องทาง = เฉลย", total, expected.finance.total);
  const groups = fin.groupFinanceAccounts(rows);
  const groupTotal = (key: string) => groups.find((g) => g.key === key)?.total ?? -1;
  eq("FN1.3 กลุ่มเงินสด = เฉลย", groupTotal("CASH"), expected.financeGroups.CASH);
  eq("FN1.4 กลุ่มออมทรัพย์ = เฉลย", groupTotal("BANK_SAVINGS"), expected.financeGroups.BANK_SAVINGS);
  eq("FN1.5 กลุ่ม e-Wallet = เฉลย", groupTotal("E_WALLET"), expected.financeGroups.E_WALLET);
  eq("FN1.6 กลุ่มสำรองรับ-จ่าย = เฉลย", groupTotal("PETTY_CASH"), expected.financeGroups.PETTY_CASH);
  assert("FN1.7 ไม่มีกลุ่มกระแสรายวัน (ไม่มีบัญชีกระแสในชุดข้อมูล)", !groups.some((g) => g.key === "BANK_CURRENT"));
  const archived = await prisma.accountFinance.findUnique({ where: { id: expected.financeArchived.id } });
  assert("FN1.8 ช่องทางตัวอย่างที่ปิดใช้งานมี archivedAt", !!archived?.archivedAt);
  assert("FN1.9 ช่องทางที่ปิดใช้งานไม่โผล่ใน financeBalances", !rows.some((r) => r.id === expected.financeArchived.id));

  // ═════════ FN2 — ยอดต่อช่องทาง = ledger จริง ═════════
  console.log("\nFN2 ยอดต่อช่องทาง vs ledger จริง:");
  for (const a of expected.financeAccounts) {
    const bal = rows.find((r) => r.id === a.id)?.balance;
    const led = await ledgerBalanceOf(a.id);
    eq(`FN2 ${a.code} balance = ledger จริง`, bal, led);
    eq(`FN2 ${a.code} balance = เฉลย`, bal, a.balance);
  }

  // ═════════ FN3 — เปลี่ยนแปลงเดือนนี้ = SQL อิสระ ═════════
  console.log("\nFN3 เปลี่ยนแปลงเดือนนี้:");
  const mc = await fin.financeMonthChanges(tenantId, systemId);
  const bsv = expected.financeAccounts.find((a) => a.code === "BSV001")!;
  const bsvFa = await prisma.accountFinance.findUniqueOrThrow({ where: { id: bsv.id }, select: { ledgerAccountId: true } });
  const monthRows = await prisma.$queryRaw<{ dr: bigint | null; cr: bigint | null }[]>`
    SELECT SUM(jl.debit)::bigint AS dr, SUM(jl.credit)::bigint AS cr
    FROM "AccountJournalLine" jl JOIN "AccountJournalEntry" je ON je.id = jl."entryId"
    WHERE jl."systemId" = ${systemId} AND jl."accountId" = ${bsvFa.ledgerAccountId}
      AND je.date >= date_trunc('month', now() AT TIME ZONE 'Asia/Bangkok') AT TIME ZONE 'Asia/Bangkok'
      AND je.date < (date_trunc('month', now() AT TIME ZONE 'Asia/Bangkok') + interval '1 month') AT TIME ZONE 'Asia/Bangkok'`;
  const expectedDelta = Number(monthRows[0]?.dr ?? 0) - Number(monthRows[0]?.cr ?? 0);
  eq("FN3.1 เปลี่ยนแปลงเดือนนี้ BSV001 = SQL อิสระ", mc.get(bsv.id)?.delta, expectedDelta);

  // ═════════ FN4 — BSV001 ยอดยกมา 2 รายการจาก seed ═════════
  console.log("\nFN4 BSV001 ยอดยกมา 2 รายการ (seed):");
  const split = expected.financeOpeningSplit;
  const splitEntries = await fin.listFinanceOpeningEntries(split.financeId);
  eq("FN4.1 จำนวนรายการยอดยกมา = 2", splitEntries.length, 2);
  eq("FN4.2 ผลรวมยอดยกมา = เฉลย", splitEntries.reduce((s, e) => s + e.amountSatang, 0), split.sum);
  const splitJvs = await entriesFor("AccountFinanceOpening", `${split.financeId}:1:v1`);
  const splitJvs2 = await entriesFor("AccountFinanceOpening", `${split.financeId}:2:v1`);
  assert("FN4.3 รายการที่ 1 มี JV ของตัวเอง", splitJvs.length === 1 && splitJvs[0].status === "POSTED");
  assert("FN4.4 รายการที่ 2 มี JV ของตัวเอง (แยกจากรายการที่ 1)", splitJvs2.length === 1 && splitJvs2[0].status === "POSTED");

  // ═════════ ร้านทิ้งสำหรับ FN5–FN12 ═════════
  const stamp = Date.now();
  const tag = `qc-fin-${stamp}`;
  const tenantIds: string[] = [];
  const t = await prisma.tenant.create({ data: { name: tag, slug: tag } });
  tenantIds.push(t.id);
  const owner = await prisma.user.create({ data: { email: `${tag}-owner@qc.local`, name: "QC เจ้าของ" } });
  const staff = await prisma.user.create({ data: { email: `${tag}-staff@qc.local`, name: "QC พนักงาน" } });
  await prisma.membership.create({ data: { userId: owner.id, tenantId: t.id, role: "OWNER", unitAccess: ["*"] } });
  const mStaff = await prisma.membership.create({
    data: { userId: staff.id, tenantId: t.id, role: "STAFF", unitAccess: ["*"], permissions: { "account.doc.view": true } },
  });
  const unit = await prisma.businessUnit.create({ data: { tenantId: t.id, type: "BOOKING", name: "สาขาทดสอบ", slug: `u-${stamp}`, status: "ACTIVE" } });
  const acc = await sysMod.createSystem(t.id, "ACCOUNT", "บัญชี " + tag);
  await sysMod.linkUnit(t.id, acc.id, unit.id);
  const sTenantId = t.id;
  const sSystemId = acc.id;
  await glMod.ensureAccounting({ tenantId: sTenantId, systemId: sSystemId });

  // ═════════ FN5 — สร้างช่องทางใหม่ + ยอดยกมา 2 รายการ ═════════
  console.log("\nFN5 สร้างช่องทาง + ยอดยกมา 2 รายการ:");
  const created = await fin.createFinanceAccount({
    tenantId: sTenantId,
    systemId: sSystemId,
    type: "BANK",
    name: "ธนาคารทดสอบ",
    openingEntries: [
      { date: new Date("2026-01-10"), amountSatang: 700_000, note: "ยอดยกมา 1" },
      { date: new Date("2026-01-15"), amountSatang: 300_000, note: "ยอดยกมา 2" },
    ],
  });
  assert("FN5.1 สร้างช่องทางสำเร็จ", created.ok, created.ok ? "" : created.reason);
  if (!created.ok) throw new Error("หยุด FN5 — สร้างช่องทางไม่สำเร็จ");
  const newEntries = await fin.listFinanceOpeningEntries(created.id);
  eq("FN5.2 มี 2 รายการยอดยกมา", newEntries.length, 2);
  eq("FN5.3 ผลรวม = 1,000,000 สตางค์ (10,000 บาท)", newEntries.reduce((s, e) => s + e.amountSatang, 0), 1_000_000);
  const newJvs1 = await entriesFor("AccountFinanceOpening", `${created.id}:1:v1`, sSystemId);
  const newJvs2 = await entriesFor("AccountFinanceOpening", `${created.id}:2:v1`, sSystemId);
  eq("FN5.4 รายการที่ 1 → 1 JV", newJvs1.length, 1);
  eq("FN5.5 รายการที่ 2 → 1 JV", newJvs2.length, 1);
  const newBalance = await ledgerBalanceOf(created.id, sSystemId);
  eq("FN5.6 ยอดคงเหลือ ledger = ผลรวมยอดยกมา", newBalance, 1_000_000);

  // idempotent: ยิง gl.postFinanceOpening ซ้ำด้วยพารามิเตอร์เดิมเป๊ะ → ไม่เบิ้ล
  const faRow = await prisma.accountFinance.findUniqueOrThrow({ where: { id: created.id }, select: { ledgerAccountId: true } });
  const repost = await glMod.postFinanceOpening(
    { tenantId: sTenantId, systemId: sSystemId },
    { financeId: created.id, seq: 1, version: 1, accountId: faRow.ledgerAccountId!, date: new Date("2026-01-10"), amountSatang: 700_000 },
  );
  assert("FN5.7 postFinanceOpening ซ้ำ (key เดิม) = skipped", "skipped" in repost && repost.skipped === true);
  const newJvs1After = await entriesFor("AccountFinanceOpening", `${created.id}:1:v1`, sSystemId);
  eq("FN5.8 ยิงซ้ำแล้วยังมี JV เดียว (ไม่เบิ้ล)", newJvs1After.length, 1);

  // ═════════ FN6 — แก้ไขรายการยอดยกมา ═════════
  console.log("\nFN6 แก้ไขรายการยอดยกมา:");
  const upd = await fin.updateFinanceOpeningEntry(sTenantId, sSystemId, created.id, 1, { amountSatang: 900_000 });
  assert("FN6.1 แก้ไขสำเร็จ", upd.ok, upd.ok ? "" : upd.reason);
  const afterUpd = await fin.listFinanceOpeningEntries(created.id);
  const row1 = afterUpd.find((e) => e.seq === 1)!;
  eq("FN6.2 version เพิ่มเป็น 2", row1.version, 2);
  eq("FN6.3 จำนวนใหม่ = 900,000 สตางค์", row1.amountSatang, 900_000);
  const oldJv = await entriesFor("AccountFinanceOpening", `${created.id}:1:v1`, sSystemId);
  const revJv = await prisma.accountJournalEntry.findFirst({ where: { systemId: sSystemId, reversalOfId: oldJv[0]?.id } });
  assert("FN6.4 JV เดิมถูกกลับรายการ (ไม่ใช่ลบ)", oldJv[0]?.status === "REVERSED" && !!revJv);
  const newVerJv = await entriesFor("AccountFinanceOpening", `${created.id}:1:v2`, sSystemId);
  eq("FN6.5 JV ใหม่ (version 2) เกิด 1 รายการ", newVerJv.length, 1);
  const balAfterUpd = await ledgerBalanceOf(created.id, sSystemId);
  eq("FN6.6 ยอดคงเหลือ ledger ถูกต้องหลังแก้ไข (900,000 + 300,000)", balAfterUpd, 1_200_000);

  // ═════════ FN7 — ลบรายการยอดยกมา ═════════
  console.log("\nFN7 ลบรายการยอดยกมา:");
  const rm = await fin.removeFinanceOpeningEntry(sTenantId, sSystemId, created.id, 2);
  assert("FN7.1 ลบสำเร็จ", rm.ok, rm.ok ? "" : rm.reason);
  const afterRm = await fin.listFinanceOpeningEntries(created.id);
  assert("FN7.2 เหลือ 1 รายการ", afterRm.length === 1);
  // reverseFor สร้าง "รายการกลับ" ด้วย refId เดิม (ต่างที่ event) ⇒ ต้องเจอ 2 แถว: ต้นฉบับ (ตอนนี้ REVERSED) + ตัวกลับรายการ (POSTED)
  const rmJv = await entriesFor("AccountFinanceOpening", `${created.id}:2:v1`, sSystemId);
  assert(
    "FN7.3 JV เดิมของรายการที่ลบยังอยู่ (แค่กลับรายการ ไม่ลบ — เจอ 2 แถว: ต้นฉบับ REVERSED + ตัวกลับรายการ POSTED)",
    rmJv.length === 2 && rmJv.filter((r) => r.status === "REVERSED").length === 1 && rmJv.filter((r) => r.status === "POSTED").length === 1,
    `ได้ ${JSON.stringify(rmJv.map((r) => r.status))}`,
  );
  const balAfterRm = await ledgerBalanceOf(created.id, sSystemId);
  eq("FN7.4 ยอดคงเหลือ ledger = 900,000 (เหลือแค่รายการที่ 1)", balAfterRm, 900_000);

  // ═════════ FN8 — โอนเงินระหว่างช่องทาง ═════════
  console.log("\nFN8 โอนเงินระหว่างช่องทาง:");
  const cash2 = await fin.createFinanceAccount({ tenantId: sTenantId, systemId: sSystemId, type: "CASH", name: "เงินสดทดสอบ" });
  if (!cash2.ok) throw new Error("สร้างบัญชีเงินสดทดสอบไม่สำเร็จ: " + cash2.reason);
  const balFromBefore = await ledgerBalanceOf(created.id, sSystemId);
  const balToBefore = await ledgerBalanceOf(cash2.id, sSystemId);
  const transferId = `qc-transfer-${stamp}`;
  const tr1 = await fin.transferBetweenFinance(sTenantId, sSystemId, { transferId, fromId: created.id, toId: cash2.id, amount: 100_000, date: new Date("2026-02-01") });
  assert("FN8.1 โอนสำเร็จ", tr1.ok, tr1.ok ? "" : tr1.reason);
  const balFromAfter = await ledgerBalanceOf(created.id, sSystemId);
  const balToAfter = await ledgerBalanceOf(cash2.id, sSystemId);
  eq("FN8.2 ต้นทางลดลง 100,000 สตางค์", balFromBefore - balFromAfter, 100_000);
  eq("FN8.3 ปลายทางเพิ่มขึ้น 100,000 สตางค์", balToAfter - balToBefore, 100_000);
  const trJvs = await entriesFor("AccountFinanceTransfer", transferId, sSystemId);
  eq("FN8.4 มี JV เดียว", trJvs.length, 1);
  const trEntry = await prisma.accountJournalEntry.findFirst({ where: { id: trJvs[0]?.id }, include: { lines: true } });
  const trDr = trEntry?.lines.reduce((s, l) => s + l.debit, 0) ?? -1;
  const trCr = trEntry?.lines.reduce((s, l) => s + l.credit, 0) ?? -2;
  eq("FN8.5 JV สมดุล (Σdr = Σcr)", trDr, trCr);
  // โอนซ้ำด้วย transferId เดิม → ไม่เบิ้ล
  const tr2 = await fin.transferBetweenFinance(sTenantId, sSystemId, { transferId, fromId: created.id, toId: cash2.id, amount: 100_000, date: new Date("2026-02-01") });
  assert("FN8.6 โอนซ้ำ (transferId เดิม) ยังคืน ok", tr2.ok);
  const balFromAfter2 = await ledgerBalanceOf(created.id, sSystemId);
  eq("FN8.7 โอนซ้ำแล้วยอดไม่ขยับต่อ (idempotent)", balFromAfter2, balFromAfter);
  const trJvsAfter = await entriesFor("AccountFinanceTransfer", transferId, sSystemId);
  eq("FN8.8 ยังมี JV เดียว (ไม่เบิ้ล)", trJvsAfter.length, 1);

  // ═════════ FN9 — ปิดใช้งาน ═════════
  console.log("\nFN9 ปิดใช้งาน:");
  const archiveFail = await fin.archiveFinanceAccount(sTenantId, sSystemId, created.id);
  assert("FN9.1 ปิดใช้งานถูกปฏิเสธเมื่อยอด≠0", !archiveFail.ok);
  assert("FN9.2 เหตุผลพูดถึงยอดคงเหลือ", !archiveFail.ok && /ยอดคงเหลือ/.test(archiveFail.reason));
  // ล้างยอดให้เป็น 0 แล้วลองใหม่
  const zeroOut = await fin.transferBetweenFinance(sTenantId, sSystemId, { fromId: created.id, toId: cash2.id, amount: balFromAfter, date: new Date("2026-02-02") });
  assert("FN9.3 โอนล้างยอดสำเร็จ", zeroOut.ok);
  const archiveOk = await fin.archiveFinanceAccount(sTenantId, sSystemId, created.id);
  assert("FN9.4 ปิดใช้งานสำเร็จเมื่อยอด=0", archiveOk.ok, archiveOk.ok ? "" : archiveOk.reason);

  // ═════════ FN10 — รหัสไม่ซ้ำแม้ยิงพร้อมกัน ═════════
  console.log("\nFN10 รหัสไม่ซ้ำเมื่อยิงพร้อมกัน:");
  const parallel = await Promise.all(
    Array.from({ length: 5 }, () => fin.createFinanceAccount({ tenantId: sTenantId, systemId: sSystemId, type: "CASH", name: "เงินสดขนาน" })),
  );
  const codes = parallel.map((r) => (r.ok ? r.code : null));
  assert("FN10.1 สร้างสำเร็จทั้ง 5 รายการ", parallel.every((r) => r.ok));
  eq("FN10.2 รหัสไม่ซ้ำกันเลย (5 ตัวไม่ซ้ำ)", new Set(codes).size, 5);

  // ═════════ FN11 — guard ═════════
  console.log("\nFN11 guard:");
  const authStaff = { user: { id: staff.id }, active: mStaff } as never;
  let denied = false;
  try {
    assertAccountCan(authStaff, "account.finance.manage");
  } catch {
    denied = true;
  }
  assert("FN11.1 พนักงานไม่มีสิทธิ์ 'account.finance.manage' ถูกปฏิเสธ", denied);
  let viewOk = true;
  try {
    assertAccountCan(authStaff, "account.doc.view");
  } catch {
    viewOk = false;
  }
  assert("FN11.2 positive control: สิทธิ์ที่มีจริงต้องผ่าน", viewOk);

  // ═════════ FN12 — tenant isolation ═════════
  console.log("\nFN12 tenant isolation:");
  const crossFetch = await fin.getFinanceAccountById(tenantId, sSystemId, created.id);
  assert("FN12.1 ระบบบัญชีอื่นดึงบัญชีเงินของ QC seed ไม่ได้ (systemId ไม่ตรง)", crossFetch === null);
  const crossFetch2 = await fin.getFinanceAccountById(sTenantId, systemId, expected.financeAccounts[0].id);
  assert("FN12.2 ร้านทิ้งดึงบัญชีเงินของ QC seed (คนละ tenant) ไม่ได้", crossFetch2 === null);

  // ═════════ FN13 — dashboard.cashPosition ยังตรงกับ financeBalances ═════════
  console.log("\nFN13 dashboard cashPosition:");
  const cashPos = await dash.cashPosition({ tenantId, systemId });
  eq("FN13.1 cashPosition.total = financeBalances total = เฉลย", cashPos.total, expected.finance.total);

  // cleanup ร้านทิ้ง
  const d = async (f: () => Promise<unknown>) => {
    try {
      await f();
    } catch {
      /* best-effort */
    }
  };
  await d(() => prisma.accountJournalLine.deleteMany({ where: { tenantId: sTenantId } }));
  await d(() => prisma.accountJournalEntry.updateMany({ where: { tenantId: sTenantId }, data: { reversalOfId: null } }));
  await d(() => prisma.accountJournalEntry.deleteMany({ where: { tenantId: sTenantId } }));
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

console.log(`\n===== QC WO 5.1 · ช่องทางการเงิน V2 สรุป =====`);
console.log(`ผ่าน ${passed} · ตก ${findings.length}`);
if (findings.length > 0) console.log(findings.map((f) => "  - " + f).join("\n"));
console.log(`JSON_SUMMARY ${JSON.stringify({ total: passed + findings.length, passed, findings })}`);
await prisma.$disconnect();
process.exit(findings.length === 0 ? 0 : 1);
