// QC M1 — POS→Account: ยอดขายจริงต้องไหลเข้าบัญชี (contract 2.4 ที่ไม่เคยมีจริง)
// persona: ร้านกาแฟจด VAT ใช้ POS เชื่อมระบบบัญชี — ขายสด/โอน/void/replay
// รัน: pnpm exec tsx scripts/qc-pos-account.mts
//
// ⚠️ Oracle ภายใต้ change control — Auditor (Fable) เป็นเจ้าของ · Builder ห้ามแก้ไฟล์นี้
// fail-before: ก่อน implement ทุกข้อ ACC-* ต้องแดง (ขายแล้วไม่มี journal entry)
// pass-after: outbox + facade + wiring เสร็จ → เขียวครบ
//
// กติกาบัญชีที่ตรวจ (ขายสดผ่าน POS ร้านจด VAT — tax point ทันทีแบบเดียวกับ CPA F-04):
//   ราคาขาย "รวม VAT" → ฐาน = round(gross/1.07) · VAT = gross - ฐาน
//   Dr CASH(1000)|BANK(1010) = gross / Cr INCOME_GOODS(4000) = ฐาน / Cr VAT_OUTPUT(2200) = VAT
//   void → reversal ครบทุกขา · replay → ไม่เบิ้ล (idempotency PosSale#id#event)
//   POS ที่ไม่ได้เชื่อม (ไม่มี AccountSystemLink) → ห้ามมี entry (หลัก standalone)

try { process.loadEnvFile(".env"); } catch { /* CI ไม่มี .env — env มาจาก secrets โดยตรง */ }

const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
const pos = await import("@/lib/modules/pos/service");
const acc = await import("@/lib/modules/account/service");
const gl = await import("@/lib/modules/account/gl");

// ─────────────────── โครง result ───────────────────
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Check = { id: string; name: string; ok: boolean; expected: string; actual: string; sev: Sev; fix?: string };
const checks: Check[] = [];
const bt = (s: number) => (s / 100).toLocaleString("th-TH", { minimumFractionDigits: 2 });
function chk(id: string, name: string, ok: boolean, expected: string, actual: string, sev: Sev = "MAJOR", fix?: string) {
  checks.push({ id, name, ok, expected, actual, sev, fix });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${ok ? "" : ` — expected ${expected} | actual ${actual}`}`);
}
const chkAmt = (id: string, name: string, expected: number, actual: number, sev: Sev = "CRITICAL", fix?: string) =>
  chk(id, name, expected === actual, `฿${bt(expected)}`, `฿${bt(actual)}`, sev, fix);

// drain outbox ถ้า implement แล้ว (ก่อน implement = ข้าม → entries ไม่มี → แดงตามเจตนา fail-before)
async function drainIfExists() {
  try {
    const wiring = await import("@/lib/outbox-consumers" as string);
    if (typeof wiring.drainAll === "function") await wiring.drainAll();
  } catch {
    /* ยังไม่ implement — fail-before */
  }
}

// อ่าน journal ฝั่งบัญชี
async function entriesOf(systemId: string, refId: string) {
  return prisma.accountJournalEntry.findMany({
    where: { systemId, refType: "PosSale", refId },
    include: { lines: { include: { account: { select: { code: true } } } } },
  });
}
const sumSide = (es: Awaited<ReturnType<typeof entriesOf>>, code: string, side: "dr" | "cr") =>
  es.flatMap((e) => e.lines).filter((l) => l.account.code === code)
    .reduce((a, l) => a + (side === "dr" ? l.debit : l.credit), 0);
const netOf = (es: Awaited<ReturnType<typeof entriesOf>>, code: string) =>
  es.flatMap((e) => e.lines).filter((l) => l.account.code === code)
    .reduce((a, l) => a + l.debit - l.credit, 0);

let tenantId = "";
try {
  // ─────────────────── setup: ร้านกาแฟจด VAT + POS เชื่อมบัญชี ───────────────────
  console.log("── setup: ร้านกาแฟ (จด VAT) — POS เชื่อม Account · POS2 ไม่เชื่อม ──");
  const tenant = await prisma.tenant.create({ data: { name: "QC POS-ACC ร้านกาแฟ", slug: `qc-posacc-${Date.now()}` } });
  tenantId = tenant.id;
  const unit = await prisma.businessUnit.create({
    data: { tenantId, type: "BOOKING", name: "หน้าร้าน", slug: "front" },
  });
  const posSys = await sys.createSystem(tenantId, "POS", "POS หน้าร้าน");
  const posSys2 = await sys.createSystem(tenantId, "POS", "POS ตู้ kiosk (ไม่เชื่อมบัญชี)");
  const accSys = await sys.createSystem(tenantId, "ACCOUNT", "บัญชีร้านกาแฟ");
  await acc.saveSettings(tenantId, accSys.id, {
    orgName: "ร้านกาแฟคิวซี จำกัด", taxId: "0105561177639", vatRegistered: true,
  } as never);
  await gl.ensureAccounting({ tenantId, systemId: accSys.id });
  // เชื่อม POS ตัวแรกเข้าบัญชี (opt-in ตาม blueprint — ตาราง AccountSystemLink)
  await prisma.accountSystemLink.create({
    data: { tenantId, systemId: accSys.id, linkedKind: "POS", linkedId: posSys.id },
  });

  const sale = (i: number, methods: { type: "CASH" | "TRANSFER"; amountSatang: number }[], sysId = posSys.id) =>
    pos.createSale({
      tenantId, unitId: unit.id, systemId: sysId,
      idempotencyKey: `qc-posacc-${i}-${tenant.slug}`,
      lines: [{ name: `กาแฟ #${i}`, qty: 1, unitPriceSatang: methods.reduce((a, m) => a + m.amountSatang, 0) }],
      payMethods: methods,
    });

  // ─────────────────── Act 1: ขายสด 107.00 (เงินสด) ───────────────────
  console.log("\n── Act 1: ขายสดเงินสด ฿107 (ฐาน 100 + VAT 7) ──");
  const s1 = await sale(1, [{ type: "CASH", amountSatang: 10700 }]);
  await drainIfExists();
  const e1 = await entriesOf(accSys.id, s1.saleId);
  chk("ACC-1.1", "ขาย POS แล้วเกิด journal entry (refType=PosSale)", e1.length >= 1, "≥1 entry", `${e1.length} entry`, "CRITICAL",
    "outbox pos.sale.paid → account facade — contract 2.4");
  for (const e of e1) {
    const dr = e.lines.reduce((a, l) => a + l.debit, 0), cr = e.lines.reduce((a, l) => a + l.credit, 0);
    chkAmt(`ACC-1.2/${e.docNo}`, "entry สมดุล Σdr=Σcr", dr, cr);
  }
  chkAmt("ACC-1.3", "Dr เงินสด 1000 = 107.00", 10700, sumSide(e1, "1000", "dr"));
  chkAmt("ACC-1.4", "Cr รายได้สินค้า 4000 = 100.00 (ฐานหลังถอด VAT)", 10000, sumSide(e1, "4000", "cr"));
  chkAmt("ACC-1.5", "Cr ภาษีขาย 2200 = 7.00 (ขายสด tax point ทันที ไม่พัก 2205)", 700, sumSide(e1, "2200", "cr"));

  // ─────────────────── Act 2: ขายโอน 214.00 ───────────────────
  console.log("\n── Act 2: ขายโอน ฿214 → เข้าธนาคาร 1010 ──");
  const s2 = await sale(2, [{ type: "TRANSFER", amountSatang: 21400 }]);
  await drainIfExists();
  const e2 = await entriesOf(accSys.id, s2.saleId);
  chkAmt("ACC-2.1", "Dr ธนาคาร 1010 = 214.00", 21400, sumSide(e2, "1010", "dr"));
  chkAmt("ACC-2.2", "Cr 4000 = 200.00", 20000, sumSide(e2, "4000", "cr"));
  chkAmt("ACC-2.3", "Cr 2200 = 14.00", 1400, sumSide(e2, "2200", "cr"));

  // ─────────────────── Act 3: replay — drain ซ้ำต้องไม่เบิ้ล ───────────────────
  console.log("\n── Act 3: drain outbox ซ้ำ 2 รอบ → ห้ามเบิ้ล ──");
  const before = (await entriesOf(accSys.id, s1.saleId)).length + (await entriesOf(accSys.id, s2.saleId)).length;
  await drainIfExists();
  await drainIfExists();
  const after = (await entriesOf(accSys.id, s1.saleId)).length + (await entriesOf(accSys.id, s2.saleId)).length;
  chk("ACC-3.1", "replay idempotent (จำนวน entry ไม่เพิ่ม)", before === after && before > 0,
    `${before} entry คงเดิม`, `${after} entry`, "CRITICAL", "idempotencyKey PosSale#saleId#event ทั้ง outbox และ gl");

  // ─────────────────── Act 4: void ใบแรก → reversal ครบ ───────────────────
  console.log("\n── Act 4: void บิลแรก → ทุกขากลับเป็นศูนย์ ──");
  await pos.voidSale(tenantId, unit.id, s1.saleId);
  await drainIfExists();
  const e1v = await entriesOf(accSys.id, s1.saleId);
  chk("ACC-4.1", "void แล้วมี reversal entry", e1v.length > e1.length, `>${e1.length}`, `${e1v.length}`, "CRITICAL",
    "pos.sale.voided → reverseFor('PosSale', saleId)");
  chkAmt("ACC-4.2", "net 1000 ของบิล = 0 หลัง void", 0, netOf(e1v, "1000"));
  chkAmt("ACC-4.3", "net 4000 ของบิล = 0 หลัง void", 0, netOf(e1v, "4000"));
  chkAmt("ACC-4.4", "net 2200 ของบิล = 0 หลัง void", 0, netOf(e1v, "2200"));

  // ─────────────────── Act 5: POS ไม่เชื่อม → ห้ามมี entry ───────────────────
  console.log("\n── Act 5: POS2 ไม่ได้เชื่อมบัญชี → standalone ห้าม post ──");
  const s3 = await sale(3, [{ type: "CASH", amountSatang: 5000 }], posSys2.id);
  await drainIfExists();
  const e3 = await entriesOf(accSys.id, s3.saleId);
  chk("ACC-5.1", "POS ที่ไม่เชื่อม ไม่เกิด entry (opt-in เท่านั้น)", e3.length === 0, "0 entry", `${e3.length}`, "CRITICAL");

  // ─────────────────── กฎอนุรักษ์รวม ───────────────────
  console.log("\n── Conservation: รายได้ในบัญชี = ยอดขายที่ไม่ void ──");
  const allEntries = await prisma.accountJournalEntry.findMany({
    where: { systemId: accSys.id }, include: { lines: { include: { account: { select: { code: true } } } } },
  });
  const income = allEntries.flatMap((e) => e.lines).filter((l) => l.account.code === "4000")
    .reduce((a, l) => a + l.credit - l.debit, 0);
  chkAmt("ACC-6.1", "Σ รายได้ 4000 = 200.00 (เหลือแค่บิลโอนที่ไม่ถูก void)", 20000, income);
  const glDr = allEntries.flatMap((e) => e.lines).reduce((a, l) => a + l.debit, 0);
  const glCr = allEntries.flatMap((e) => e.lines).reduce((a, l) => a + l.credit, 0);
  chkAmt("ACC-6.2", "ทั้งสมุด Σdr = Σcr", glDr, glCr);
} catch (e) {
  chk("CRASH", "harness ทำงานจนจบ", false, "จบปกติ", e instanceof Error ? e.message.slice(0, 140) : String(e), "CRITICAL");
} finally {
  // ─────────────────── teardown (FK order โดย tenantId) ───────────────────
  if (tenantId) {
    const del = async (name: string, fn: () => Promise<unknown>) => {
      try { await fn(); } catch (err) { console.log(`  ⚠ cleanup ${name}: ${err instanceof Error ? err.message.slice(0, 80) : err}`); }
    };
    await del("journalLine", () => prisma.accountJournalLine.deleteMany({ where: { tenantId } }));
    await del("entry.unlink", () => prisma.accountJournalEntry.updateMany({ where: { tenantId }, data: { reversalOfId: null } }));
    await del("journalEntry", () => prisma.accountJournalEntry.deleteMany({ where: { tenantId } }));
    await del("outbox", () => (prisma as never as { outboxEvent?: { deleteMany: (a: unknown) => Promise<unknown> } }).outboxEvent?.deleteMany({ where: { tenantId } }) ?? Promise.resolve());
    await del("sysLink", () => prisma.accountSystemLink.deleteMany({ where: { tenantId } }));
    await del("mapping", () => prisma.accountMapping.deleteMany({ where: { tenantId } }));
    await del("ledger", () => prisma.accountLedger.deleteMany({ where: { tenantId } }));
    await del("period", () => prisma.accountPeriod.deleteMany({ where: { tenantId } }));
    await del("docSeq", () => prisma.accountDocSequence.deleteMany({ where: { tenantId } }));
    await del("settings", () => prisma.accountSettings.deleteMany({ where: { tenantId } }));
    await del("posPayment", () => prisma.posPayment.deleteMany({ where: { tenantId } }));
    await del("posLine", () => prisma.posSaleLine.deleteMany({ where: { tenantId } }));
    await del("posSale", () => prisma.posSale.deleteMany({ where: { tenantId } }));
    await del("posCounter", () => prisma.posReceiptCounter.deleteMany({ where: { tenantId } }));
    await del("appSystemUnit", () => prisma.appSystemUnit.deleteMany({ where: { tenantId } }));
    await del("appSystem", () => prisma.appSystem.deleteMany({ where: { tenantId } }));
    await del("unit", () => prisma.businessUnit.deleteMany({ where: { tenantId } }));
    await del("tenant", () => prisma.tenant.delete({ where: { id: tenantId } }));
    console.log("\n[cleanup] ลบ test tenant เรียบร้อย");
  }
  await prisma.$disconnect();
}

// ─────────────────── สรุป ───────────────────
const failed = checks.filter((c) => !c.ok);
const bySev = (s: Sev) => failed.filter((c) => c.sev === s).length;
console.log("\n===== QC M1: POS→Account =====");
console.log(`ผ่าน ${checks.length - failed.length}/${checks.length}`);
console.log(`FINDINGS: CRITICAL ${bySev("CRITICAL")} · MAJOR ${bySev("MAJOR")} · MINOR ${bySev("MINOR")}`);
console.log("\nJSON_SUMMARY " + JSON.stringify({ total: checks.length, passed: checks.length - failed.length, findings: failed.map((c) => ({ id: c.id, sev: c.sev, fix: c.fix })) }));
process.exit(0);
