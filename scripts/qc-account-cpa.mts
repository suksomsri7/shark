// QC6 — CPA audit harness: ทำบัญชี "ร้านตัดผม+ขายสินค้า (จด VAT)" 1 เดือนเต็มผ่าน service layer จริง
// แล้วปิดงบแบบนักบัญชี: ไล่ยอดทุกบัญชีเทียบเลขคำนวณมือ (สตางค์) + P&L + งบดุล + ภ.พ.30 + ภ.ง.ด.53 + ปิดงวด
// รัน: cd /root/projects/shark-in-th && pnpm exec tsx scripts/qc-account-cpa.mts
// กติกา: assert ไม่ผ่าน = บันทึก finding แล้วทำข้อต่อไป (ไม่หยุดที่ตัวแรก) · ห้ามแก้ code ระบบ
try { process.loadEnvFile(".env"); } catch { /* CI ไม่มี .env — env มาจาก secrets โดยตรง */ }
try { process.loadEnvFile(".env.local"); } catch {}

const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
const acc = await import("@/lib/modules/account/service");
const exp = await import("@/lib/modules/account/expense");
const gl = await import("@/lib/modules/account/gl");
const rep = await import("@/lib/modules/account/reports");
const ast = await import("@/lib/modules/account/asset");
const wht = await import("@/lib/modules/account/wht");

// ─────────────────── โครง result ───────────────────
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Check = {
  id: string; // รหัสข้อตรวจ
  name: string;
  ok: boolean;
  expected: string;
  actual: string;
  sev: Sev; // ระดับถ้าไม่ผ่าน
  fix?: string; // ไฟล์/ฟังก์ชันที่ต้องแก้
};
const checks: Check[] = [];
const bt = (satang: number) => (satang / 100).toLocaleString("th-TH", { minimumFractionDigits: 2 });
function chk(id: string, name: string, ok: boolean, expected: string, actual: string, sev: Sev = "MAJOR", fix?: string) {
  checks.push({ id, name, ok, expected, actual, sev, fix });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${ok ? "" : ` — expected ${expected} | actual ${actual}`}`);
}
function chkAmt(id: string, name: string, expected: number, actual: number, sev: Sev = "MAJOR", fix?: string) {
  chk(id, name, expected === actual, `฿${bt(expected)}`, `฿${bt(actual)}`, sev, fix);
}
function crash(id: string, name: string, e: unknown) {
  chk(id, name, false, "ทำงานได้", `โยน error: ${e instanceof Error ? e.message : String(e)}`, "CRITICAL");
}

let tenantId = "";
let userId = "";

// ─────────────────── helper อ่านสมุดบัญชี ───────────────────
type ELine = { code: string; debit: number; credit: number };
type Entry = { id: string; journal: string; periodKey: string; docNo: string; status: string; lines: ELine[] };

async function entriesOf(systemId: string, refId?: string): Promise<Entry[]> {
  const es = await prisma.accountJournalEntry.findMany({
    where: { systemId, ...(refId ? { refId } : {}) },
    orderBy: { createdAt: "asc" },
    include: { lines: { include: { account: { select: { code: true } } } } },
  });
  return es.map((e) => ({
    id: e.id, journal: e.journal, periodKey: e.periodKey, docNo: e.docNo, status: e.status,
    lines: e.lines.map((l) => ({ code: l.account.code, debit: l.debit, credit: l.credit })),
  }));
}
const balanced = (e: Entry) =>
  e.lines.reduce((s, l) => s + l.debit, 0) === e.lines.reduce((s, l) => s + l.credit, 0);
const side = (e: Entry, code: string, s: "dr" | "cr") =>
  e.lines.filter((l) => l.code === code).reduce((a, l) => a + (s === "dr" ? l.debit : l.credit), 0);

/** ยอดคงเหลือ net (Σdr − Σcr) ต่อรหัสบัญชี — รวมทุก entry (immutable ledger, reversal หักกันเอง) */
async function balances(systemId: string): Promise<Map<string, number>> {
  const rows = await prisma.accountJournalLine.groupBy({
    by: ["accountId"],
    where: { systemId },
    _sum: { debit: true, credit: true },
  });
  const leds = await prisma.accountLedger.findMany({ where: { systemId }, select: { id: true, code: true } });
  const codeById = new Map(leds.map((l) => [l.id, l.code]));
  const m = new Map<string, number>();
  for (const r of rows) {
    const code = codeById.get(r.accountId) ?? "?";
    m.set(code, (m.get(code) ?? 0) + (r._sum.debit ?? 0) - (r._sum.credit ?? 0));
  }
  return m;
}
const net = (m: Map<string, number>, code: string) => m.get(code) ?? 0;

try {
  // ═══════════════ 1) ตั้งระบบ ═══════════════
  console.log("\n── 1) ตั้งระบบ: tenant + AppSystem ACCOUNT + ผังบัญชี + ผู้ติดต่อ ──");
  const t = await prisma.tenant.create({ data: { name: "ร้านตัดผมชายทะเล (CPA QC)", slug: "qc-cpa-" + Date.now() } });
  tenantId = t.id;
  const u = await prisma.user.create({ data: { email: `qc-cpa-${Date.now()}@qc.local`, name: "CPA Auditor" } });
  userId = u.id;
  await prisma.membership.create({ data: { userId, tenantId, role: "OWNER", unitAccess: ["*"] } });
  const s = await sys.createSystem(tenantId, "ACCOUNT", "บัญชีร้านตัดผม");
  const systemId = s.id;
  const ctx = { tenantId, systemId };
  await acc.saveSettings(tenantId, systemId, {
    orgName: "ร้านตัดผมชายทะเล", taxId: "0105561000000", vatRegistered: true, vatRateBp: 700,
    taxPointBasis: "ON_ISSUE", // ร้านขายสินค้า+บริการ — default สินค้า (บริการเลือกต่อใบ)
  });
  await gl.ensureAccounting(ctx);
  const ledgerCount = await prisma.accountLedger.count({ where: { systemId } });
  chk("S0.1", "seed ผังบัญชีครบ (≥40 บัญชี)", ledgerCount >= 40, "≥40", String(ledgerCount), "CRITICAL");
  const customer = await acc.createContact({
    tenantId, systemId, kind: "CUSTOMER", legalType: "COMPANY",
    name: "บจก. ลูกค้าดีเด่น", taxId: "0105561111111", branchCode: "00000",
  });
  const vendor = await acc.createContact({
    tenantId, systemId, kind: "VENDOR", legalType: "COMPANY",
    name: "บจก. ซัพพลายเออร์ผม", taxId: "0105562222222", branchCode: "00000",
  });
  const P = ast.currentPeriodKey(); // งวดปัจจุบัน (เดือนที่ทำบัญชี)
  const nextP = (() => { const [y, m] = P.split("-").map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`; })();

  // ═══════════════ 2) ขายบริการเงินสด — ใบเสร็จ 535 inc VAT ═══════════════
  console.log("\n── 2) ขายบริการเงินสด (ใบเสร็จ 535.00 รวม VAT) ──");
  let r1Id = "";
  try {
    const r1 = await acc.createDocument({
      tenantId, systemId, docType: "RECEIPT", contactId: customer.id,
      vatMode: "INCLUDE", lines: [{ description: "ตัดผมชาย", qty: 1, unitPrice: 53_500 }],
    });
    r1Id = r1.id;
    chkAmt("S2.0", "RECEIPT ยอดเอกสาร: ฐาน 500 + VAT 35 = 535", 53_500, r1.grandTotal, "CRITICAL");
    chkAmt("S2.0b", "RECEIPT vatAmount = 35", 3_500, r1.vatAmount, "CRITICAL");
    const iss = await acc.issueDocument(tenantId, systemId, r1.id);
    chk("S2.1", "ออกใบเสร็จได้", (iss as { ok: boolean }).ok, "ok", JSON.stringify(iss), "CRITICAL");
    const [e] = await entriesOf(systemId, r1.id);
    chk("S2.2", "ใบเสร็จโพสต์ GL + balance", !!e && balanced(e), "entry balance", e ? "ไม่ balance" : "ไม่มี entry", "CRITICAL");
    chkAmt("S2.3", "Cr รายได้ 500", 50_000, side(e, "4030", "cr") + side(e, "4000", "cr"), "CRITICAL", "gl.ts postDocument RECEIPT");
    chkAmt("S2.4", "Cr ภาษีขาย 2200 = 35 (ขายสดรับรู้ทันที)", 3_500, side(e, "2200", "cr"), "CRITICAL", "gl.ts postDocument RECEIPT");
    // ขายสด "เงินสด" ต้องเข้า 1000 เงินสด — ระบบมีช่องให้บอกช่องทางเงินของใบเสร็จหรือไม่
    chkAmt("S2.5", "Dr เงินสด 1000 = 535 (ขายสดเงินสด)", 53_500, side(e, "1000", "dr"), "MAJOR",
      "service.ts issueDocument/gl.ts postDocument RECEIPT — ไม่มีช่องทางระบุบัญชีเงิน (fallback BANK 1010 เสมอ)");
  } catch (e) { crash("S2.x", "ขายบริการเงินสด", e); }

  // 2b) ลูกค้าขอใบกำกับภาษีเต็มรูปจากใบเสร็จ — VAT ต้องไม่ถูกนับซ้ำ (2200 เคยรับรู้แล้วตอนใบเสร็จ)
  try {
    const b0 = await balances(systemId);
    const cv = await acc.convertDocument(tenantId, systemId, r1Id, "TAX_INVOICE", userId);
    chk("S2.6", "แปลงใบเสร็จ → ใบกำกับภาษีได้", (cv as { ok: boolean }).ok, "ok", JSON.stringify(cv), "MAJOR");
    if ((cv as { ok: boolean }).ok) {
      const tiId = (cv as { newId: string }).newId;
      await acc.issueDocument(tenantId, systemId, tiId);
      const b1 = await balances(systemId);
      const d2200 = net(b0, "2200") - net(b1, "2200"); // liability: credit เพิ่ม → net ลด
      chkAmt("S2.7", "ออกใบกำกับเต็มรูปแทนใบเสร็จ: ภาษีขายห้ามเพิ่มซ้ำ (Δ2200 = 0)", 0, d2200, "CRITICAL",
        "gl.ts postTaxInvoice — ใบกำกับจาก RECEIPT ย้าย 2205→2200 ทั้งที่ VAT อยู่ใน 2200 แล้ว (นับซ้ำ)");
      // ล้างผลข้างเคียง: void ใบกำกับซ้ำ แล้วเช็ค reversal คืนยอด
      await acc.voidDocument(tenantId, systemId, tiId, "QC: ยกเลิกใบกำกับที่ทำ VAT ซ้ำ");
      const b2 = await balances(systemId);
      chkAmt("S2.8", "void ใบกำกับ → reversal คืน 2200 ครบ", net(b0, "2200"), net(b2, "2200"), "CRITICAL");
    }
  } catch (e) { crash("S2.y", "ใบกำกับเต็มรูปจากใบเสร็จ", e); }

  // ═══════════════ 3) ขายสินค้าเงินเชื่อ 10,700 — tax point สินค้า = ตอน issue ═══════════════
  console.log("\n── 3) ขายสินค้าเงินเชื่อ (ใบแจ้งหนี้ 10,700) + ใบกำกับตอนส่งมอบ ──");
  let inv2Id = "";
  try {
    const inv2 = await acc.createDocument({
      tenantId, systemId, docType: "INVOICE", contactId: customer.id,
      vatMode: "EXCLUDE", vatTiming: "ON_ISSUE",
      lines: [{ description: "แชมพู+ผลิตภัณฑ์จัดแต่งผม (ยกลัง)", qty: 1, unitPrice: 1_000_000 }],
    });
    inv2Id = inv2.id;
    await acc.issueDocument(tenantId, systemId, inv2.id);
    const [e] = await entriesOf(systemId, inv2.id);
    chkAmt("S3.1", "Dr ลูกหนี้ 1100 = 10,700", 1_070_000, side(e, "1100", "dr"), "CRITICAL");
    chkAmt("S3.2", "VAT สินค้าพักที่ 2205 = 700 (ยังไม่ออกใบกำกับ)", 70_000, side(e, "2205", "cr"), "CRITICAL");
    chkAmt("S3.3", "ห้ามแตะ 2200 ตอน issue IV", 0, side(e, "2200", "cr"), "CRITICAL");
    chk("S3.4", "รายได้ขายสินค้าลงบัญชี 4000 (ไม่ใช่ 4030 บริการ)", side(e, "4000", "cr") === 1_000_000,
      "Cr 4000 = ฿10,000.00", `Cr 4000 = ฿${bt(side(e, "4000", "cr"))} · Cr 4030 = ฿${bt(side(e, "4030", "cr"))}`,
      "MINOR", "coa.ts MAPPINGS INCOME_DEFAULT→4030 เพียงตัวเดียว — ไม่มีเส้นแยกรายได้สินค้า/บริการ");
    // ใบกำกับภาษี (ส่งมอบสินค้า) → tax point เกิด
    const cv = await acc.convertDocument(tenantId, systemId, inv2.id, "TAX_INVOICE", userId);
    const tiId = (cv as { newId: string }).newId;
    await acc.issueDocument(tenantId, systemId, tiId);
    const [te] = await entriesOf(systemId, tiId);
    chk("S3.5", "ใบกำกับสินค้า: Dr 2205 / Cr 2200 = 700", side(te, "2205", "dr") === 70_000 && side(te, "2200", "cr") === 70_000,
      "Dr2205 700 / Cr2200 700", `Dr2205 ${bt(side(te, "2205", "dr"))} / Cr2200 ${bt(side(te, "2200", "cr"))}`, "CRITICAL");
    // idempotent: โพสต์ซ้ำต้อง skip
    const again = await gl.postDocument(ctx, inv2.id);
    chk("S3.6", "โพสต์เอกสารเดิมซ้ำ → idempotent skip", "skipped" in again, "skipped", JSON.stringify(again), "CRITICAL");
  } catch (e) { crash("S3.x", "ขายสินค้าเงินเชื่อ", e); }

  // ═══════════════ 4) รับชำระบางส่วน 5,000 — ห้ามเกิด VAT ซ้ำ ═══════════════
  console.log("\n── 4) รับชำระบางส่วน 5,000 ──");
  try {
    const b0 = await balances(systemId);
    const pay = await acc.recordPayment(tenantId, systemId, inv2Id, { amount: 500_000, channel: "TRANSFER" });
    chk("S4.1", "รับชำระบางส่วนได้", (pay as { ok: boolean }).ok, "ok", JSON.stringify(pay), "CRITICAL");
    const b1 = await balances(systemId);
    chkAmt("S4.2", "ลูกหนี้ลดลง 5,000", net(b0, "1100") - 500_000, net(b1, "1100"), "CRITICAL");
    chkAmt("S4.3", "รับเงินบางส่วน: ห้ามเกิด VAT ซ้ำ (Δ2200 = 0)", net(b0, "2200"), net(b1, "2200"), "CRITICAL");
    const tiCount = await prisma.accountDocument.count({
      where: { systemId, docType: "TAX_INVOICE", sourceDocId: inv2Id, status: { notIn: ["VOIDED", "CANCELLED", "DRAFT"] } },
    });
    chk("S4.4", "สินค้า ON_ISSUE: จ่ายเงินไม่ผลิตใบกำกับเพิ่ม (คงมี 1 ใบ)", tiCount === 1, "1", String(tiCount), "CRITICAL");
  } catch (e) { crash("S4.x", "รับชำระบางส่วน", e); }

  // ═══════════════ 5) ขายบริการเงินเชื่อ 2,140 + รับ 2 งวด — ใบกำกับต่องวด ═══════════════
  console.log("\n── 5) ขายบริการเงินเชื่อ (2,140) รับเงิน 2 งวด — tax point บริการ = ตอนรับเงิน ──");
  try {
    const inv4 = await acc.createDocument({
      tenantId, systemId, docType: "INVOICE", contactId: customer.id,
      vatMode: "EXCLUDE", vatTiming: "ON_PAYMENT",
      lines: [{ description: "เหมาตัดผมพนักงานนอกสถานที่", qty: 1, unitPrice: 200_000 }],
    });
    await acc.issueDocument(tenantId, systemId, inv4.id);
    const [e] = await entriesOf(systemId, inv4.id);
    chkAmt("S5.1", "บริการ: VAT พัก 2210 = 140 ตอน issue", 14_000, side(e, "2210", "cr"), "CRITICAL");
    chkAmt("S5.2", "บริการ: ยังไม่แตะ 2200 ตอน issue", 0, side(e, "2200", "cr"), "CRITICAL");
    // งวด 1
    const b0 = await balances(systemId);
    await acc.recordPayment(tenantId, systemId, inv4.id, { amount: 107_000, channel: "TRANSFER" });
    const b1 = await balances(systemId);
    const tis1 = await prisma.accountDocument.findMany({
      where: { systemId, docType: "TAX_INVOICE", sourceDocId: inv4.id }, select: { id: true, sourcePaymentId: true, subTotal: true, vatAmount: true, docNo: true },
    });
    chk("S5.3", "งวด 1: ออกใบกำกับอัตโนมัติ 1 ใบ ผูก payment", tis1.length === 1 && !!tis1[0]?.sourcePaymentId, "1 ใบ + sourcePaymentId", `${tis1.length} ใบ`, "CRITICAL");
    chkAmt("S5.4", "งวด 1: ฐานบนใบกำกับ = 1,000", 100_000, tis1[0]?.subTotal ?? -1, "CRITICAL");
    chkAmt("S5.5", "งวด 1: VAT ย้าย 2210→2200 = 70 (Δ2200)", 7_000, net(b0, "2200") - net(b1, "2200"), "CRITICAL");
    // งวด 2
    await acc.recordPayment(tenantId, systemId, inv4.id, { amount: 107_000, channel: "TRANSFER" });
    const b2 = await balances(systemId);
    const tis2 = await prisma.accountDocument.count({ where: { systemId, docType: "TAX_INVOICE", sourceDocId: inv4.id } });
    chk("S5.6", "งวด 2: ใบกำกับรวม 2 ใบ (1 payment = 1 ใบ)", tis2 === 2, "2", String(tis2), "CRITICAL");
    chkAmt("S5.7", "รับครบ: 2210 เคลียร์เป็น 0", 0, net(b2, "2210"), "CRITICAL");
    const doc = await prisma.accountDocument.findUnique({ where: { id: inv4.id }, select: { status: true } });
    chk("S5.8", "สถานะใบแจ้งหนี้ = PAID", doc?.status === "PAID", "PAID", String(doc?.status), "MAJOR");
  } catch (e) { crash("S5.x", "บริการ 2 งวด", e); }

  // ═══════════════ 6) มัดจำ F2: รับมัดจำ 1,070 → ใบแจ้งหนี้ 5,350 หักมัดจำ ═══════════════
  console.log("\n── 6) มัดจำ (F2): รับมัดจำ 1,070 → IV 5,350 หักมัดจำ → VAT ทั้งงาน = 350 ──");
  try {
    const dep = await acc.createDocument({
      tenantId, systemId, docType: "DEPOSIT_RECEIPT", contactId: customer.id,
      vatMode: "INCLUDE", lines: [{ description: "มัดจำงานตัดผมหมู่คณะ", qty: 1, unitPrice: 107_000 }],
    });
    await acc.issueDocument(tenantId, systemId, dep.id);
    chk("S6.1", "ใบมัดจำยังไม่โพสต์ GL ตอน issue (โพสต์ตอนรับเงิน)", (await entriesOf(systemId, dep.id)).length === 0, "0 entry", `${(await entriesOf(systemId, dep.id)).length} entry`, "MAJOR");
    await acc.recordPayment(tenantId, systemId, dep.id, { amount: 107_000, channel: "TRANSFER" });
    const [de] = await entriesOf(systemId, dep.id);
    chk("S6.2", "รับมัดจำ: Dr เงิน 1,070 / Cr 2110 = 1,000 / Cr 2200 = 70",
      !!de && side(de, "2110", "cr") === 100_000 && side(de, "2200", "cr") === 7_000,
      "Cr2110 1,000 / Cr2200 70", de ? `Cr2110 ${bt(side(de, "2110", "cr"))} / Cr2200 ${bt(side(de, "2200", "cr"))}` : "ไม่มี entry", "CRITICAL");
    const depDoc = await prisma.accountDocument.findUnique({ where: { id: dep.id }, select: { status: true } });
    chk("S6.3", "ใบมัดจำ → AWAITING_DEDUCT", depDoc?.status === "AWAITING_DEDUCT", "AWAITING_DEDUCT", String(depDoc?.status), "MAJOR");

    // ใบแจ้งหนี้เต็มงาน 5,350 inc หักมัดจำ 1,070 (gross)
    const inv5 = await acc.createDocument({
      tenantId, systemId, docType: "INVOICE", contactId: customer.id,
      vatMode: "INCLUDE", vatTiming: "ON_ISSUE", depositReceiptId: dep.id,
      lines: [{ description: "งานตัดผมหมู่คณะ (เต็มงาน)", qty: 1, unitPrice: 535_000 }],
    });
    chkAmt("S6.4", "IV หักมัดจำ: depositDeducted (gross) = 1,070", 107_000, inv5.depositDeducted, "CRITICAL");
    chkAmt("S6.5", "IV grandTotal คงเหลือ = 4,280", 428_000, inv5.grandTotal, "CRITICAL");
    await acc.issueDocument(tenantId, systemId, inv5.id);
    const [ie] = await entriesOf(systemId, inv5.id);
    chk("S6.6", "F2 posting: Dr1100 4,280 · Dr2110 กลับ 1,000 · Cr รายได้ 5,000 · Cr2205 280",
      !!ie && side(ie, "1100", "dr") === 428_000 && side(ie, "2110", "dr") === 100_000 &&
      (side(ie, "4030", "cr") + side(ie, "4000", "cr")) === 500_000 && side(ie, "2205", "cr") === 28_000,
      "ตาม F2", ie ? `Dr1100 ${bt(side(ie, "1100", "dr"))} · Dr2110 ${bt(side(ie, "2110", "dr"))} · Cr income ${bt(side(ie, "4030", "cr") + side(ie, "4000", "cr"))} · Cr2205 ${bt(side(ie, "2205", "cr"))}` : "ไม่มี entry",
      "CRITICAL", "gl.ts postDocument INVOICE (depositSplit)");
    const depDoc2 = await prisma.accountDocument.findUnique({ where: { id: dep.id }, select: { status: true } });
    chk("S6.7", "หักครบ → ใบมัดจำ DEDUCTED", depDoc2?.status === "DEDUCTED", "DEDUCTED", String(depDoc2?.status), "MAJOR");

    // ใบกำกับภาษีของงาน: VAT ทั้งงานต้อง = 350 (มัดจำ 70 + ส่วนที่เหลือ 280) — ไม่ซ้ำไม่ขาด
    const b0 = await balances(systemId);
    const cv = await acc.convertDocument(tenantId, systemId, inv5.id, "TAX_INVOICE", userId);
    const tiId = (cv as { newId: string }).newId;
    await acc.issueDocument(tenantId, systemId, tiId);
    const b1 = await balances(systemId);
    chkAmt("S6.8", "ใบกำกับใบแจ้งหนี้หักมัดจำ: ย้าย VAT เฉพาะส่วนคงเหลือ 280 (Δ2200)", 28_000, net(b0, "2200") - net(b1, "2200"), "CRITICAL",
      "service.ts convertDocument copy vatAmount เต็มใบ (350) โดยไม่หัก VAT มัดจำ → gl.postTaxInvoice ย้ายเกิน");
    chkAmt("S6.9", "2205 ต้องเคลียร์พอดี (ไม่ติด Dr ค้าง)", 0, net(b1, "2205"), "CRITICAL",
      "service.ts convertDocument + gl.ts postTaxInvoice");
    // ลูกค้าจ่ายส่วนที่เหลือ 4,280
    await acc.recordPayment(tenantId, systemId, inv5.id, { amount: 428_000, channel: "TRANSFER" });
    const inv5after = await prisma.accountDocument.findUnique({ where: { id: inv5.id }, select: { status: true } });
    chk("S6.10", "จ่ายส่วนที่เหลือครบ → PAID", inv5after?.status === "PAID", "PAID", String(inv5after?.status), "MAJOR");
  } catch (e) { crash("S6.x", "มัดจำ F2", e); }

  // ═══════════════ 7) ใบลดหนี้ 1,070 + ทดสอบ CN เกินยอดคงเหลือ ═══════════════
  console.log("\n── 7) ใบลดหนี้ 1,070 บน IV ค้างชำระ + ลอง CN เกินยอดคงเหลือ ──");
  try {
    const cn = await acc.createDocument({
      tenantId, systemId, docType: "CREDIT_NOTE", contactId: customer.id, sourceDocId: inv2Id,
      adjustReason: "สินค้าชำรุด รับคืนบางส่วน", vatMode: "EXCLUDE",
      lines: [{ description: "รับคืนแชมพู 1 กล่อง", qty: 1, unitPrice: 100_000 }],
    });
    const b0 = await balances(systemId);
    const issCn = await acc.issueDocument(tenantId, systemId, cn.id);
    chk("S7.1", "ออกใบลดหนี้ได้", (issCn as { ok: boolean }).ok, "ok", JSON.stringify(issCn), "CRITICAL");
    const [ce] = await entriesOf(systemId, cn.id);
    chk("S7.2", "CN: Dr รายได้ 1,000 + Dr 2200 70 / Cr 1100 1,070",
      !!ce && (side(ce, "4030", "dr") + side(ce, "4000", "dr")) === 100_000 && side(ce, "2200", "dr") === 7_000 && side(ce, "1100", "cr") === 107_000,
      "ตามสูตร CN", ce ? `Dr income ${bt(side(ce, "4030", "dr") + side(ce, "4000", "dr"))} · Dr2200 ${bt(side(ce, "2200", "dr"))} · Cr1100 ${bt(side(ce, "1100", "cr"))}` : "ไม่มี entry", "CRITICAL");
    const b1 = await balances(systemId);
    chkAmt("S7.3", "ลูกหนี้ลดจาก CN = 1,070", net(b0, "1100") - 107_000, net(b1, "1100"), "CRITICAL");

    // ยอดคงเหลือจริงของ IV = 10,700 − 5,000 (จ่ายแล้ว) − 1,070 (CN) = 4,630
    // (ก) CN 5,350 > คงเหลือ 4,630 → นักบัญชีคาดว่าถูกปฏิเสธ
    const cnOver = await acc.createDocument({
      tenantId, systemId, docType: "CREDIT_NOTE", contactId: customer.id, sourceDocId: inv2Id,
      adjustReason: "ทดสอบลดหนี้เกินยอดคงเหลือ", vatMode: "EXCLUDE",
      lines: [{ description: "ลดหนี้เกินคงเหลือ", qty: 1, unitPrice: 500_000 }],
    });
    const rOver = await acc.issueDocument(tenantId, systemId, cnOver.id);
    chk("S7.4", "CN เกินยอดคงเหลือค้างชำระ (5,350 > 4,630) ต้องถูกปฏิเสธ", (rOver as { ok: boolean }).ok === false,
      "ปฏิเสธ", (rOver as { ok: boolean }).ok ? "ระบบยอมออก" : "ปฏิเสธ", "MAJOR",
      "service.ts creditAvailable — cap ที่ grandTotal−ΣCN ไม่หักยอดที่ชำระแล้ว");
    if ((rOver as { ok: boolean }).ok) await acc.voidDocument(tenantId, systemId, cnOver.id, "QC: ล้าง CN เกินคงเหลือ");

    // (ข) CN เกิน grandTotal−ΣCN (10,165 > 9,630) → ต้องถูกปฏิเสธแน่นอน
    const cnOver2 = await acc.createDocument({
      tenantId, systemId, docType: "CREDIT_NOTE", contactId: customer.id, sourceDocId: inv2Id,
      adjustReason: "ทดสอบลดหนี้เกิน cap", vatMode: "EXCLUDE",
      lines: [{ description: "ลดหนี้เกิน cap", qty: 1, unitPrice: 950_000 }],
    });
    const rOver2 = await acc.issueDocument(tenantId, systemId, cnOver2.id);
    chk("S7.5", "CN เกินมูลค่าเอกสารเดิมคง (10,165 > 9,630) ถูกปฏิเสธ", (rOver2 as { ok: boolean }).ok === false, "ปฏิเสธ",
      (rOver2 as { ok: boolean }).ok ? "ระบบยอมออก" : "ปฏิเสธ", "CRITICAL");
    if ((rOver2 as { ok: boolean }).ok) await acc.voidDocument(tenantId, systemId, cnOver2.id, "QC: ล้าง");

    // (ค) จ่ายเกินหนี้จริงหลัง CN: คงเหลือจริง 4,630 แต่ระบบคุมที่ grandTotal−paidTotal = 5,700
    const bb = await balances(systemId);
    const overPay = await acc.recordPayment(tenantId, systemId, inv2Id, { amount: 570_000, channel: "TRANSFER" });
    chk("S7.6", "รับชำระ 5,700 เกินหนี้จริงหลัง CN (4,630) ต้องถูกกัน", (overPay as { ok: boolean }).ok === false,
      "ปฏิเสธ", (overPay as { ok: boolean }).ok ? "ระบบรับเงินเกินหนี้ (ลูกหนี้ GL ติดลบ)" : "ปฏิเสธ", "MAJOR",
      "service.ts recordPayment — remain ใช้ grandTotal−paidTotal ไม่หัก CN");
    if ((overPay as { ok: boolean }).ok) {
      const pmt = await prisma.accountDocumentPayment.findFirst({ where: { systemId, documentId: inv2Id, amount: 570_000 }, select: { id: true } });
      if (pmt) await acc.voidPayment(tenantId, systemId, inv2Id, pmt.id, "QC: ล้างรับเงินเกิน");
      const bb2 = await balances(systemId);
      chkAmt("S7.7", "void payment เกิน → ยอดกลับที่เดิม", net(bb, "1100"), net(bb2, "1100"), "CRITICAL");
    }
    // รายงานลูกหนี้หน้าจอ ต้องตรง GL (10,700−5,000−1,070 = 4,630)
    const ov = await acc.overviewStats(tenantId, systemId);
    chkAmt("S7.8", "ยอดลูกหนี้ค้างรับ (หน้า overview) ตรงหนี้จริงหลัง CN", 463_000, ov.receivable, "MAJOR",
      "service.ts overviewStats — ไม่หักใบลดหนี้ → ไม่ตรง GL 1100");
  } catch (e) { crash("S7.x", "ใบลดหนี้", e); }

  // ═══════════════ 8) ฝั่งซื้อ: ซื้อสินค้า 2,140 + ค่าใช้จ่ายบริการ 1,070 จ่ายหัก WHT 3% ═══════════════
  console.log("\n── 8) ฝั่งซื้อ: PURCHASE 2,140 (ใบกำกับซื้อ) + EXPENSE 1,070 จ่ายหัก WHT 3% ──");
  let pur7Id = "";
  try {
    const pur = await exp.createExpenseDoc({
      tenantId, systemId, docType: "PURCHASE", contactId: vendor.id,
      vatMode: "EXCLUDE", vatPurchaseMode: "CLAIM",
      lines: [{ description: "แชมพูสต็อกร้าน", qty: 1, unitPrice: 200_000 }],
    });
    pur7Id = pur.id;
    await exp.issueExpenseDoc(tenantId, systemId, pur.id);
    const [pe] = await entriesOf(systemId, pur.id);
    chk("S8.1", "PURCHASE: Dr 5000 2,000 + Dr 1150 140 / Cr 2100 2,140",
      !!pe && side(pe, "5000", "dr") === 200_000 && side(pe, "1150", "dr") === 14_000 && side(pe, "2100", "cr") === 214_000,
      "ตามสูตร", pe ? `Dr5000 ${bt(side(pe, "5000", "dr"))} · Dr1150 ${bt(side(pe, "1150", "dr"))} · Cr2100 ${bt(side(pe, "2100", "cr"))}` : "ไม่มี entry", "CRITICAL");

    const expd = await exp.createExpenseDoc({
      tenantId, systemId, docType: "EXPENSE", contactId: vendor.id,
      vatMode: "EXCLUDE", vatPurchaseMode: "CLAIM",
      lines: [{ description: "จ้างทำความสะอาดร้าน (บริการ)", qty: 1, unitPrice: 100_000 }],
    });
    await exp.issueExpenseDoc(tenantId, systemId, expd.id);
    const [ee] = await entriesOf(systemId, expd.id);
    chk("S8.2", "EXPENSE: Dr 6900 1,000 + Dr 1150 70 / Cr 2100 1,070",
      !!ee && side(ee, "6900", "dr") === 100_000 && side(ee, "1150", "dr") === 7_000 && side(ee, "2100", "cr") === 107_000,
      "ตามสูตร", ee ? `Dr6900 ${bt(side(ee, "6900", "dr"))} · Dr1150 ${bt(side(ee, "1150", "dr"))} · Cr2100 ${bt(side(ee, "2100", "cr"))}` : "ไม่มี entry", "CRITICAL");

    // จ่ายพร้อมหัก WHT 3% ของฐานก่อน VAT (3% × 1,000 = 30) → เงินออก 1,070−30 = 1,040
    const rv = await exp.recordVendorPayment(tenantId, systemId, expd.id, {
      amount: 104_000, whtAmountSatang: 3_000, whtRateBp: 300, whtIncomeType: "M40_8", channel: "TRANSFER",
    });
    chk("S8.3", "จ่าย 1,040 + WHT 30 ได้ · สถานะ PAID", (rv as { ok: boolean; status?: string }).ok && (rv as { status: string }).status === "PAID",
      "ok+PAID", JSON.stringify(rv), "CRITICAL");
    const pes = await entriesOf(systemId);
    const wpe = pes.filter((x) => x.journal === "PAYMENT").at(-1)!;
    chk("S8.4", "จ่าย+WHT: Dr 2100 1,070 / Cr เงิน 1,040 + Cr 2130 30",
      side(wpe, "2100", "dr") === 107_000 && side(wpe, "2130", "cr") === 3_000 &&
      (side(wpe, "1010", "cr") + side(wpe, "1000", "cr")) === 104_000,
      "ตาม F5", `Dr2100 ${bt(side(wpe, "2100", "dr"))} · Cr เงิน ${bt(side(wpe, "1010", "cr") + side(wpe, "1000", "cr"))} · Cr2130 ${bt(side(wpe, "2130", "cr"))}`, "CRITICAL");

    // 50 ทวิ อัตโนมัติ: ฐานเงินได้บนใบต้อง = 1,000 (ก่อน VAT) ไม่ใช่ 30
    const pmt = await prisma.accountDocumentPayment.findFirst({
      where: { systemId, documentId: expd.id }, select: { whtCertDocId: true },
    });
    chk("S8.5", "ออก 50 ทวิ อัตโนมัติ (ผูก payment)", !!pmt?.whtCertDocId, "มี whtCertDocId", String(pmt?.whtCertDocId), "MAJOR");
    if (pmt?.whtCertDocId) {
      const cert = await prisma.accountDocument.findUnique({
        where: { id: pmt.whtCertDocId }, select: { docNo: true, subTotal: true, whtAmount: true, whtRateBp: true, whtIncomeType: true },
      });
      chkAmt("S8.6", "50 ทวิ: ฐานเงินได้ (subTotal) = 1,000", 100_000, cert?.subTotal ?? -1, "MAJOR",
        "expense.ts issueWhtCert — ใส่ subTotal=ยอด WHT (30) แทนฐานเงินได้ (ต่างจาก wht.ts issueWhtCert ที่ถูก)");
      chkAmt("S8.7", "50 ทวิ: whtAmount = 30", 3_000, cert?.whtAmount ?? -1, "MAJOR",
        "expense.ts issueWhtCert — ไม่ set field whtAmount (default 0)");
    }
    // ภ.ง.ด.53 เดือนนี้ — ยอดนำส่งต้อง 30 บาท ฐาน 1,000
    const p53 = await wht.pnd(tenantId, systemId, { type: 53, period: P });
    chkAmt("S8.8", "ภ.ง.ด.53: ภาษีหักนำส่งรวม = 30", 3_000, p53.grandWht, "CRITICAL",
      "wht.ts pnd อ่าน whtAmount/subTotal จาก WHT_CERT ที่ expense.ts สร้างผิด field");
    chkAmt("S8.9", "ภ.ง.ด.53: ฐานเงินได้รวม = 1,000", 100_000, p53.grandBase, "CRITICAL", "เดียวกับ S8.8");
    const wd = await wht.listWhtDeductions(tenantId, systemId, { period: P });
    chkAmt("S8.10", "ทะเบียน WHT เราหัก: รวม = 30", 3_000, wd.totalWht, "MAJOR");
  } catch (e) { crash("S8.x", "ฝั่งซื้อ + WHT", e); }

  // ═══════════════ 9) สินทรัพย์: ซื้อเครื่องตัดผม 21,400 + ค่าเสื่อม 1 เดือน ═══════════════
  console.log("\n── 9) สินทรัพย์ 21,400 (ฐาน 20,000) + ค่าเสื่อมเส้นตรง 1 งวด ──");
  try {
    const led1610 = await prisma.accountLedger.findFirst({ where: { systemId, code: "1610" }, select: { id: true } });
    const led1619 = await prisma.accountLedger.findFirst({ where: { systemId, code: "1619" }, select: { id: true } });
    const led6800 = await prisma.accountLedger.findFirst({ where: { systemId, code: "6800" }, select: { id: true } });
    const ap = await exp.createExpenseDoc({
      tenantId, systemId, docType: "ASSET_PURCHASE", contactId: vendor.id,
      vatMode: "EXCLUDE", vatPurchaseMode: "CLAIM",
      lines: [{ description: "เก้าอี้ตัดผมไฮดรอลิก", qty: 1, unitPrice: 2_000_000, accountId: led1610!.id }],
    });
    await exp.issueExpenseDoc(tenantId, systemId, ap.id);
    const [ae] = await entriesOf(systemId, ap.id);
    chk("S9.1", "ซื้อสินทรัพย์: Dr 1610 20,000 + Dr 1150 1,400 / Cr 2100 21,400",
      !!ae && side(ae, "1610", "dr") === 2_000_000 && side(ae, "1150", "dr") === 140_000 && side(ae, "2100", "cr") === 2_140_000,
      "ตามสูตร", ae ? `Dr1610 ${bt(side(ae, "1610", "dr"))} · Dr1150 ${bt(side(ae, "1150", "dr"))} · Cr2100 ${bt(side(ae, "2100", "cr"))}` : "ไม่มี entry", "CRITICAL");

    const reg = await ast.registerAsset(ctx, {
      name: "เก้าอี้ตัดผมไฮดรอลิก", category: "อุปกรณ์ร้าน",
      acquiredDate: new Date(), startDepDate: new Date(),
      cost: 2_000_000, salvageValue: 20_000, usefulLifeMonths: 60,
      assetAccountId: led1610!.id, accumAccountId: led1619!.id, expenseAccountId: led6800!.id,
      sourceDocumentId: ap.id,
    });
    chk("S9.2", "ขึ้นทะเบียนสินทรัพย์ได้", (reg as { ok: boolean }).ok, "ok", JSON.stringify(reg), "CRITICAL");
    // เส้นตรง: (20,000 − 200) / 60 เดือน = 330/เดือน
    const run = await ast.runDepreciation(ctx, P);
    chk("S9.3", "รันค่าเสื่อมงวดนี้ 1 รายการ", run.posted.length === 1, "1", `${run.posted.length} (skip: ${run.skipped.map((x) => x.reason).join(",") || "-"})`, "CRITICAL");
    chkAmt("S9.4", "ค่าเสื่อมเดือนแรก = 330.00", 33_000, run.posted[0]?.amount ?? -1, "CRITICAL");
    const bals = await balances(systemId);
    chkAmt("S9.5", "Dr 6800 ค่าเสื่อม = 330", 33_000, net(bals, "6800"), "CRITICAL");
    chkAmt("S9.6", "Cr 1619 ค่าเสื่อมสะสม = 330", -33_000, net(bals, "1619"), "CRITICAL");
    // รันซ้ำงวดเดิม → idempotent
    const run2 = await ast.runDepreciation(ctx, P);
    chk("S9.7", "รันค่าเสื่อมซ้ำงวดเดิม → ข้าม (idempotent)", run2.posted.length === 0, "0", String(run2.posted.length), "CRITICAL");
  } catch (e) { crash("S9.x", "สินทรัพย์+ค่าเสื่อม", e); }

  // ═══════════════ 10) VOID ใบเสร็จ — reversal ครบทุกขา ═══════════════
  console.log("\n── 10) ยกเลิกใบเสร็จ (void) — reversal เงิน/รายได้/VAT ครบ ──");
  try {
    const b0 = await balances(systemId);
    const r9 = await acc.createDocument({
      tenantId, systemId, docType: "RECEIPT", contactId: customer.id,
      vatMode: "INCLUDE", lines: [{ description: "ตัดผม (ใบที่พนักงานกดผิด)", qty: 1, unitPrice: 21_400 }],
    });
    await acc.issueDocument(tenantId, systemId, r9.id);
    const v = await acc.voidDocument(tenantId, systemId, r9.id, "พนักงานกดผิด");
    chk("S10.1", "void ใบเสร็จได้", (v as { ok: boolean }).ok, "ok", JSON.stringify(v), "CRITICAL");
    const es = await entriesOf(systemId, r9.id);
    const rev = es.filter((x) => x.journal === "REVERSAL");
    chk("S10.2", "มี reversal entry + balance", rev.length >= 1 && rev.every(balanced), "≥1 + balance", `${rev.length}`, "CRITICAL");
    const b1 = await balances(systemId);
    const same = ["1000", "1010", "2200", "4030", "4000"].every((c) => net(b0, c) === net(b1, c));
    chk("S10.3", "void แล้วยอดเงิน/รายได้/VAT กลับที่เดิมทุกบัญชี", same, "เท่าก่อนออกใบ",
      ["1000", "1010", "2200", "4030"].map((c) => `${c}:${bt(net(b1, c) - net(b0, c))}`).join(" "), "CRITICAL");
    const orig = es.find((x) => x.journal !== "REVERSAL");
    chk("S10.4", "entry ต้นทางถูก mark REVERSED", orig?.status === "REVERSED", "REVERSED", String(orig?.status), "MAJOR");
  } catch (e) { crash("S10.x", "void ใบเสร็จ", e); }

  // ═══════════════ 11) ปิดงบแบบนักบัญชี — ไล่ทุกบัญชีเทียบมือ ═══════════════
  console.log("\n── 11) ปิดงบ: งบทดลอง / P&L / งบดุล / ภ.พ.30 / ลูกหนี้-เจ้าหนี้ ──");
  try {
    // ยอดคาดหวังคำนวณมือ (สตางค์ · net = Σdr − Σcr) — จากทุกธุรกรรมข้างบน
    // เงินเข้า: 535(S2) +5,000(S4) +1,070+1,070(S5) +1,070(มัดจำ) +4,280(S6) −1,040(S8) = 11,985
    const EXPECT: Record<string, number> = {
      "1100": 463_000,        // ลูกหนี้: 10,700 − 5,000 − 1,070(CN) = 4,630
      "1150": 161_000,        // ภาษีซื้อ: 140 + 70 + 1,400 = 1,610
      "1160": 0,
      "1610": 2_000_000,      // เก้าอี้ตัดผม 20,000
      "1619": -33_000,        // ค่าเสื่อมสะสม 330
      "2100": -2_354_000,     // เจ้าหนี้: 2,140 + 21,400 + 1,070 − 1,070 = 23,540
      "2110": 0,              // มัดจำรับ: +1,000 − 1,000
      "2130": -3_000,         // WHT ค้างนำส่ง 30
      "2200": -115_500,       // ภาษีขาย: 35 + 700 + 140 + 70 + 280 − 70(CN) = 1,155
      "2205": 0,              // VAT รอใบกำกับ ต้องเคลียร์หมด
      "2210": 0,              // VAT บริการรอรับเงิน ต้องเคลียร์หมด
      "5000": 200_000,        // ซื้อสินค้า 2,000
      "6800": 33_000,         // ค่าเสื่อม 330
      "6900": 100_000,        // ค่าใช้จ่ายอื่น 1,000
      "9999": 0,
    };
    const CASH_TOTAL = 1_198_500; // เงินสด+ธนาคารรวม 11,985
    const INCOME_TOTAL = 1_650_000; // รายได้สุทธิ: 500+10,000+2,000+5,000−1,000(CN) = 16,500
    const NET_PROFIT = 1_317_000; // 16,500 − 2,000(COGS) − (1,000+330) = 13,170

    const bal = await balances(systemId);
    // ทุก entry ต้อง balance + Σ ทั้งระบบ
    const all = await entriesOf(systemId);
    const bad = all.filter((e) => !balanced(e));
    chk("S11.0", `ทุก journal entry balance (${all.length} entry)`, bad.length === 0, "0 ใบเสีย", `${bad.length} ใบเสีย`, "CRITICAL");

    const tb = await rep.trialBalance(ctx, P, P);
    chk("S11.1", "งบทดลอง: Σdebit == Σcredit (balanced)", tb.balanced && tb.totals.closingDebit === tb.totals.closingCredit,
      "balanced", `dr ${bt(tb.totals.closingDebit)} / cr ${bt(tb.totals.closingCredit)}`, "CRITICAL");

    chkAmt("S11.2", "เงินสด+ธนาคารรวม (1000+1010) = 11,985", CASH_TOTAL, net(bal, "1000") + net(bal, "1010"), "CRITICAL");
    chkAmt("S11.2b", "เงินสด 1000 = 535 (ขายสดเงินสด)", 53_500, net(bal, "1000"), "MAJOR", "ดู S2.5 — ใบเสร็จเงินสดเข้าธนาคารเสมอ");
    for (const [code, expv] of Object.entries(EXPECT)) {
      chkAmt(`S11.3-${code}`, `บัญชี ${code} ตรงเลขมือ`, expv, net(bal, code), code === "2200" || code === "2205" ? "CRITICAL" : "MAJOR");
    }
    const incomeNet = -(["4000", "4030", "4800", "4900"].reduce((s, c) => s + net(bal, c), 0));
    chkAmt("S11.4", "รายได้รวม (4xxx) = 16,500", INCOME_TOTAL, incomeNet, "CRITICAL");

    const pl = await rep.profitLoss(ctx, P, P);
    chkAmt("S11.5", "P&L: รายได้ = 16,500", INCOME_TOTAL, pl.income.total, "CRITICAL");
    chkAmt("S11.6", "P&L: ต้นทุนขาย = 2,000", 200_000, pl.cogs.total, "CRITICAL");
    chkAmt("S11.7", "P&L: ค่าใช้จ่าย = 1,330", 133_000, pl.expense.total, "CRITICAL");
    chkAmt("S11.8", "P&L: กำไรสุทธิ = 13,170", NET_PROFIT, pl.netProfit, "CRITICAL");

    const bs = await rep.balanceSheet(ctx, P);
    chk("S11.9", "งบดุล: สินทรัพย์ = หนี้สิน + ทุน + กำไร", bs.balanced,
      "balanced", `A ${bt(bs.assets.total)} vs L+E ${bt(bs.totalLiabilitiesEquity)}`, "CRITICAL");
    chkAmt("S11.10", "งบดุล: สินทรัพย์รวม = 37,895", 3_789_500, bs.assets.total, "CRITICAL");
    chkAmt("S11.11", "งบดุล: กำไรงวดนี้ = 13,170", NET_PROFIT, bs.currentPeriodProfit, "CRITICAL");

    // ภ.พ.30 — ต้อง reconcile กับใบกำกับที่ออก/รับจริง ไม่ใช่คนละเลข
    const pp = await rep.pp30(ctx, P);
    chkAmt("S11.12", "ภ.พ.30: ภาษีขายเดือนนี้ = 1,155 (จากใบกำกับจริง)", 115_500, pp.output.total, "CRITICAL",
      "ตาม S6.8 — ใบกำกับมัดจำย้าย VAT เกิน");
    chkAmt("S11.13", "ภ.พ.30: ภาษีซื้อ = 1,610", 161_000, pp.input.total, "CRITICAL");
    chkAmt("S11.14", "ภ.พ.30: ยอดสุทธิ (ขาย−ซื้อ) = −455 (เครดิตยกไป)", -45_500, pp.netPayable, "CRITICAL");
    chkAmt("S11.15", "ภ.พ.30: ฐานภาษีขายรวม = 16,500", 1_650_000, pp.output.base, "MAJOR",
      "reports.ts pp30Side — รวมฐานเอกสาร void (vat=0) + ฐานใบกำกับหักมัดจำไม่หักส่วนมัดจำ");
    chkAmt("S11.16", "ภ.พ.30 ภาษีขาย ตรงกับ GL 2200 (reconcile)", -net(bal, "2200"), pp.output.total, "CRITICAL");

    // เจ้าหนี้คงเหลือ
    const ps = await exp.payableStats(tenantId, systemId);
    chkAmt("S11.17", "เจ้าหนี้ค้างจ่าย (หน้าจอ) = 23,540", 2_354_000, ps.payable, "MAJOR");
    chkAmt("S11.18", "เจ้าหนี้ GL 2100 = 23,540", 2_354_000, -net(bal, "2100"), "CRITICAL");

    // งบกระแสเงินสด reconcile
    const cf = await rep.cashFlow(ctx, P, P);
    chk("S11.19", "งบกระแสเงินสด reconcile (opening + net = closing)", cf.reconciled,
      "reconciled", `open ${bt(cf.openingCash)} + net ${bt(cf.netChange)} vs close ${bt(cf.closingCash)}`, "MAJOR");
  } catch (e) { crash("S11.x", "ปิดงบ", e); }

  // ═══════════════ 12) ปิดงวด + โพสต์ย้อนเข้างวดปิด ═══════════════
  console.log("\n── 12) ปิดงวด + ลองโพสต์ย้อนเข้างวดปิด ──");
  try {
    const close = await gl.closePeriod(ctx, P, userId);
    chk("S12.1", "ปิดงวดได้ (suspense เคลียร์ + ไม่มี needsReview)", close.ok, "ok", JSON.stringify(close), "CRITICAL");
    if (close.ok) {
      // ออกเอกสารใหม่ลงงวดที่ปิดแล้ว → ต้องถูกกัน
      const dNew = await acc.createDocument({
        tenantId, systemId, docType: "RECEIPT", contactId: customer.id,
        vatMode: "INCLUDE", issueDate: new Date(), lines: [{ description: "ขายหลังปิดงวด", qty: 1, unitPrice: 10_700 }],
      });
      const rNew = await acc.issueDocument(tenantId, systemId, dNew.id);
      chk("S12.2", "ออกเอกสารลงงวดปิด → ถูกกัน", (rNew as { ok: boolean }).ok === false && String((rNew as { reason?: string }).reason ?? "").includes("ปิด"),
        "ปฏิเสธ (งวดปิดแล้ว)", JSON.stringify(rNew), "CRITICAL");
      // void เอกสารของงวดปิด → reversal เลื่อนไปงวดเปิดถัดไป (ledger-M10)
      const v = await exp.voidExpenseDoc(tenantId, systemId, pur7Id, "คืนสินค้าให้ผู้ขายหลังปิดงวด");
      chk("S12.3", "void เอกสารงวดปิดได้ (เลื่อน reversal)", (v as { ok: boolean }).ok, "ok", JSON.stringify(v), "MAJOR");
      const revs = (await entriesOf(systemId, pur7Id)).filter((x) => x.journal === "REVERSAL");
      chk("S12.4", `reversal ลงงวดเปิดถัดไป (${nextP})`, revs.length >= 1 && revs.every((r) => r.periodKey === nextP),
        nextP, revs.map((r) => r.periodKey).join(",") || "ไม่มี reversal", "CRITICAL");
      // ปิดแล้วรายงานงวดเดิมต้องนิ่ง (reversal ไปงวดหน้า ไม่แตะงวดที่ปิด)
      const tb2 = await rep.trialBalance(ctx, P, P);
      chk("S12.5", "งบทดลองงวดที่ปิดไม่ขยับหลัง void", tb2.balanced && tb2.totals.closingDebit === tb2.totals.closingCredit, "นิ่ง+balanced",
        `dr ${bt(tb2.totals.closingDebit)}`, "CRITICAL");
    }
  } catch (e) { crash("S12.x", "ปิดงวด", e); }

  // ── พิมพ์ตารางยอดเทียบมือ (สำหรับรายงาน) ──
  const finalBal = await balances(systemId);
  console.log("\n── ยอดคงเหลือจริงท้ายงวด (net dr−cr, บาท) ──");
  for (const code of [...finalBal.keys()].sort()) console.log(`  ${code}: ${bt(net(finalBal, code))}`);
} finally {
  // ═══════════════ 13) cleanup — ลบ test tenant ทั้งก้อน ═══════════════
  const del = async (name: string, fn: () => Promise<unknown>) => {
    try { await fn(); } catch (e) { console.log(`  ⚠ cleanup ${name}: ${e instanceof Error ? e.message : e}`); }
  };
  if (tenantId) {
    await del("journalLine", () => prisma.accountJournalLine.deleteMany({ where: { tenantId } }));
    await del("depreciation", () => prisma.accountDepreciation.deleteMany({ where: { tenantId } }));
    await del("entry.unlink", () => prisma.accountJournalEntry.updateMany({ where: { tenantId }, data: { reversalOfId: null } }));
    await del("entry", () => prisma.accountJournalEntry.deleteMany({ where: { tenantId } }));
    await del("payment", () => prisma.accountDocumentPayment.deleteMany({ where: { tenantId } }));
    await del("relation", () => prisma.accountDocumentRelation.deleteMany({ where: { tenantId } }));
    await del("line", () => prisma.accountDocumentLine.deleteMany({ where: { tenantId } }));
    await del("fixedAsset", () => prisma.accountFixedAsset.deleteMany({ where: { tenantId } }));
    await del("doc.unlink", () => prisma.accountDocument.updateMany({ where: { tenantId }, data: { sourceDocId: null, replacedById: null, sourcePaymentId: null } }));
    await del("attachment", () => prisma.accountAttachment.deleteMany({ where: { tenantId } }));
    await del("document", () => prisma.accountDocument.deleteMany({ where: { tenantId } }));
    await del("sequence", () => prisma.accountDocSequence.deleteMany({ where: { tenantId } }));
    await del("mapping", () => prisma.accountMapping.deleteMany({ where: { tenantId } }));
    await del("finance", () => prisma.accountFinance.deleteMany({ where: { tenantId } }));
    await del("ledger.unlink", () => prisma.accountLedger.updateMany({ where: { tenantId }, data: { parentId: null } }));
    await del("ledger", () => prisma.accountLedger.deleteMany({ where: { tenantId } }));
    await del("period", () => prisma.accountPeriod.deleteMany({ where: { tenantId } }));
    await del("contact", () => prisma.accountContact.deleteMany({ where: { tenantId } }));
    await del("settings", () => prisma.accountSettings.deleteMany({ where: { tenantId } }));
    await del("systemUnit", () => prisma.appSystemUnit.deleteMany({ where: { tenantId } }));
    await del("system", () => prisma.appSystem.deleteMany({ where: { tenantId } }));
    await del("audit", () => prisma.auditLog.deleteMany({ where: { tenantId } }));
    await del("membership", () => prisma.membership.deleteMany({ where: { tenantId } }));
    await del("tenant", () => prisma.tenant.delete({ where: { id: tenantId } }));
  }
  if (userId) { try { await prisma.user.delete({ where: { id: userId } }); } catch {} }
  console.log("\n[cleanup] ลบ test tenant เรียบร้อย");
}

// ═══════════════ สรุปผล ═══════════════
const failed = checks.filter((c) => !c.ok);
const bySev = (s: Sev) => failed.filter((c) => c.sev === s);
console.log("\n===== QC6 CPA audit (service layer จริง + Neon) =====");
console.log(`ผ่าน ${checks.length - failed.length}/${checks.length} ข้อตรวจ`);
console.log(`FINDINGS: CRITICAL ${bySev("CRITICAL").length} · MAJOR ${bySev("MAJOR").length} · MINOR ${bySev("MINOR").length}`);
for (const f of failed) {
  console.log(`  [${f.sev}] ${f.id} ${f.name}\n     expected: ${f.expected}\n     actual:   ${f.actual}${f.fix ? `\n     fix:      ${f.fix}` : ""}`);
}
console.log("\nJSON_SUMMARY " + JSON.stringify({ total: checks.length, passed: checks.length - failed.length, findings: failed }));
await prisma.$disconnect();
process.exit(0); // รายงาน findings ผ่าน output — ไม่ fail process (audit run)
