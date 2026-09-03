// WO 0.6 — บั๊ก GL ฝั่งซื้อ/ค่าใช้จ่ายในโหมด "ราคารวม VAT" (INCLUDE)
//
// อาการ (wo-notes/0.1.md ข้อ 7): gl.postDocument เคส PURCHASE/EXPENSE เดบิตด้วย `line.amount`
// ซึ่งโหมด INCLUDE คือยอด "รวม VAT" แล้ว แต่เครดิตเจ้าหนี้ด้วย grandTotal (ฐานสุทธิ+VAT)
// ⇒ Σdebit เกิน Σcredit เท่ากับ VAT → commitEntry โยน "ลงบัญชีไม่สมดุล" → ออกเอกสารไม่ได้เลย
//
// ชุดนี้ตรวจ:
//   A. positive control — EXPENSE/PURCHASE โหมด INCLUDE ต้องออกเอกสารได้และลง JV ถูกทั้ง 3 ขา
//   B. ตาราง 3 โหมด VAT ซื้อ × 2 โหมดราคา (6 คู่) — สมดุล + ยอดตรงบัญชีเป๊ะทุกช่อง
//   C. หัก ณ ที่จ่ายบนใบซื้อโหมด INCLUDE — JV จ่ายชำระต้องยังสมดุล
//
// รัน: QC_ENV_FILE=.env.qc pnpm tsx scripts/qc-acc-v2-gl-inclvat.mts
// ข้อมูล: tenant ใช้แล้วทิ้ง (สร้าง → assert → ลบใน finally) · ห้ามรันบน DB production (มีด่านกันด้านล่าง)

const ENV_FILE = process.env.QC_ENV_FILE ?? ".env";
try {
  process.loadEnvFile(ENV_FILE);
} catch {
  console.error(`❌ โหลด env ไม่ได้: ${ENV_FILE}`);
  process.exit(1);
}
// ด่านกัน prod (BLUEPRINT §2 / reference_shark_qc_suites_hit_prod_db) — ชุดนี้เขียน+ลบข้อมูลจริง
const PROD_HOST_MARK = "ep-royal-night";
for (const k of ["DATABASE_URL", "DIRECT_URL"] as const) {
  if ((process.env[k] ?? "").includes(PROD_HOST_MARK)) {
    console.error(`🔴 หยุด! ${k} ชี้ production branch (${PROD_HOST_MARK}…) — ชุดนี้ห้ามแตะ prod`);
    console.error(`   ใช้: QC_ENV_FILE=.env.qc pnpm tsx scripts/qc-acc-v2-gl-inclvat.mts`);
    process.exit(1);
  }
}
console.log(`🗄️  env=${ENV_FILE} · DB=${new URL(process.env.DATABASE_URL ?? "postgres://x/").hostname}`);

const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
const acc = await import("@/lib/modules/account/service");
const exp = await import("@/lib/modules/account/expense");
const gl = await import("@/lib/modules/account/gl");

// ─────────────────── โครง result (house harness) ───────────────────
type Sev = "CRITICAL" | "MAJOR";
const findings: { id: string; ok: boolean; name: string; expected: string; actual: string; sev: Sev }[] = [];
const bt = (s: number) => (s / 100).toLocaleString("th-TH", { minimumFractionDigits: 2 });
function chk(id: string, name: string, ok: boolean, expected: string, actual: string, sev: Sev = "CRITICAL") {
  findings.push({ id, ok, name, expected, actual, sev });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${ok ? "" : ` — expected ${expected} | actual ${actual}`}`);
}
const chkAmt = (id: string, name: string, e: number, a: number, sev: Sev = "CRITICAL") =>
  chk(id, name, e === a, `฿${bt(e)}`, `฿${bt(a)}`, sev);
function crash(id: string, name: string, e: unknown) {
  chk(id, name, false, "ทำงานได้", `โยน error: ${e instanceof Error ? e.message : String(e)}`, "CRITICAL");
}

let tenantId = "";
let userId = "";

// ─────────────────── ตัวช่วยอ่านสมุดบัญชี ───────────────────
type ELine = { code: string; debit: number; credit: number };
type Entry = { id: string; docNo: string; lines: ELine[] };

async function entriesOf(systemId: string, refId: string): Promise<Entry[]> {
  const es = await prisma.accountJournalEntry.findMany({
    where: { systemId, refId },
    orderBy: { createdAt: "asc" },
    include: { lines: { include: { account: { select: { code: true } } } } },
  });
  return es.map((e) => ({
    id: e.id,
    docNo: e.docNo,
    lines: e.lines.map((l) => ({ code: l.account.code, debit: l.debit, credit: l.credit })),
  }));
}
const sumDr = (e: Entry) => e.lines.reduce((s, l) => s + l.debit, 0);
const sumCr = (e: Entry) => e.lines.reduce((s, l) => s + l.credit, 0);
const side = (e: Entry, code: string, s: "dr" | "cr") =>
  e.lines.filter((l) => l.code === code).reduce((a, l) => a + (s === "dr" ? l.debit : l.credit), 0);

const VALID_TAX = "0105561000003"; // ผ่าน mod-11
let systemId = "";
let vendorId = "";

/** สร้าง+ออกใบซื้อ/ค่าใช้จ่าย แล้วคืน JV ของมัน (หรือ reason ที่ทำให้ออกไม่ได้) */
async function issueAndRead(o: {
  docType: "PURCHASE" | "EXPENSE";
  vatMode: "EXCLUDE" | "INCLUDE" | "NONE";
  purchaseMode: "CLAIM" | "AWAITING" | "NO_CLAIM";
  units: number[];
}): Promise<{ ok: boolean; reason?: string; docId: string; doc?: { subTotal: number; vatAmount: number; grandTotal: number }; entry?: Entry }> {
  const doc = await exp.createExpenseDoc({
    tenantId,
    systemId,
    docType: o.docType,
    contactId: vendorId,
    vatMode: o.vatMode,
    vatPurchaseMode: o.purchaseMode,
    lines: o.units.map((u, i) => ({ description: `รายการที่ ${i + 1}`, qty: 1, unitPrice: u })),
  });
  const res = await exp.issueExpenseDoc(tenantId, systemId, doc.id);
  if (!res.ok) return { ok: false, reason: res.reason, docId: doc.id };
  const after = await prisma.accountDocument.findFirstOrThrow({
    where: { id: doc.id },
    select: { subTotal: true, vatAmount: true, grandTotal: true },
  });
  const es = await entriesOf(systemId, doc.id);
  return { ok: true, docId: doc.id, doc: after, entry: es[0] };
}

try {
  console.log("\n── setup: tenant ใช้แล้วทิ้ง + ระบบบัญชี (จด VAT 7%) ──");
  const t = await prisma.tenant.create({ data: { name: "QC GL INCL-VAT", slug: "qc-inclvat-" + Date.now() } });
  tenantId = t.id;
  const u = await prisma.user.create({ data: { email: `qc-inclvat-${Date.now()}@qc.local`, name: "QC 0.6" } });
  userId = u.id;
  await prisma.membership.create({ data: { userId, tenantId, role: "OWNER", unitAccess: ["*"] } });
  const s = await sys.createSystem(tenantId, "ACCOUNT", "บัญชี QC 0.6");
  systemId = s.id;
  await acc.saveSettings(tenantId, systemId, {
    orgName: "QC 0.6",
    taxId: VALID_TAX,
    vatRegistered: true,
    vatRateBp: 700,
    taxPointBasis: "ON_ISSUE",
  });
  await gl.ensureAccounting({ tenantId, systemId });
  const vend = await acc.createContact({
    tenantId,
    systemId,
    kind: "VENDOR",
    legalType: "COMPANY",
    name: "ผู้ขาย QC 0.6",
    taxId: "0105562222222",
  });
  vendorId = vend.id;
  console.log(`  systemId=${systemId}`);

  // ═══════════ A) positive control: โหมดราคารวม VAT ต้องออกเอกสารได้ ═══════════
  // 2 บรรทัด: 1,070.00 (=1,000+70) และ 535.00 (=500+35) → ฐานสุทธิ 1,500.00 · VAT 105.00 · เจ้าหนี้ 1,605.00
  for (const [tag, docType, costCode] of [
    ["A1", "EXPENSE", "6900"],
    ["A2", "PURCHASE", "5000"],
  ] as const) {
    console.log(`\n── ${tag}) ${docType} โหมดราคารวม VAT (INCLUDE · CLAIM) ──`);
    try {
      const r = await issueAndRead({ docType, vatMode: "INCLUDE", purchaseMode: "CLAIM", units: [107_000, 53_500] });
      chk(`${tag}.1`, `ออก ${docType} โหมดราคารวม VAT ได้`, r.ok, "ออกได้", r.ok ? "ออกได้" : `ล้มเหลว: ${r.reason}`);
      chkAmt(`${tag}.2`, "ยอดในเอกสาร: ฐานสุทธิ (subTotal)", 150_000, r.doc?.subTotal ?? -1);
      chkAmt(`${tag}.3`, "ยอดในเอกสาร: VAT", 10_500, r.doc?.vatAmount ?? -1);
      chkAmt(`${tag}.4`, "ยอดในเอกสาร: ยอดรวม (grandTotal)", 160_500, r.doc?.grandTotal ?? -1);
      chk(`${tag}.5`, "มีใบสำคัญ (JV) ของเอกสารนี้", !!r.entry, "มี 1 ใบ", r.entry ? `มี (${r.entry.docNo})` : "ไม่มี");
      if (r.entry) {
        chkAmt(`${tag}.6`, "ใบสำคัญสมดุล: Σdebit == Σcredit", sumCr(r.entry), sumDr(r.entry));
        chkAmt(`${tag}.7`, `Dr ${costCode} = ผลรวมฐานสุทธิ (ไม่ใช่ยอดรวม VAT)`, 150_000, side(r.entry, costCode, "dr"));
        chkAmt(`${tag}.8`, "Dr 1150 ภาษีซื้อ", 10_500, side(r.entry, "1150", "dr"));
        chkAmt(`${tag}.9`, "Cr 2100 เจ้าหนี้", 160_500, side(r.entry, "2100", "cr"));
      }
    } catch (e) {
      crash(`${tag}.x`, `${docType} INCLUDE`, e);
    }
  }

  // ═══════════ B) ตาราง 3 โหมด VAT ซื้อ × 2 โหมดราคา ═══════════
  // ทุกคู่ต้องได้ "ต้นทุนที่ลงบัญชี" เท่ากัน 1,500.00 ยกเว้น NO_CLAIM ที่ VAT เป็นส่วนหนึ่งของต้นทุน
  console.log("\n── B) 3 โหมด VAT ซื้อ × 2 โหมดราคา (6 คู่) ──");
  const EXCL = [100_000, 50_000]; // 1,000 + 500 (ก่อน VAT)
  const INCL = [107_000, 53_500]; // 1,070 + 535 (รวม VAT แล้ว)
  const table: {
    id: string;
    purchaseMode: "CLAIM" | "AWAITING" | "NO_CLAIM";
    price: "EXCLUDE" | "INCLUDE";
    units: number[];
    cost: number; // Dr 6900
    vat: number; // Dr 1150/1155
    vatCode: "1150" | "1155" | null;
    grand: number; // Cr 2100
    note: string;
  }[] = [
    { id: "B1", purchaseMode: "CLAIM", price: "EXCLUDE", units: EXCL, cost: 150_000, vat: 10_500, vatCode: "1150", grand: 160_500, note: "เคลมได้ · ราคาแยก VAT" },
    { id: "B2", purchaseMode: "CLAIM", price: "INCLUDE", units: INCL, cost: 150_000, vat: 10_500, vatCode: "1150", grand: 160_500, note: "เคลมได้ · ราคารวม VAT" },
    { id: "B3", purchaseMode: "AWAITING", price: "EXCLUDE", units: EXCL, cost: 150_000, vat: 10_500, vatCode: "1155", grand: 160_500, note: "รอใบกำกับ · ราคาแยก VAT" },
    { id: "B4", purchaseMode: "AWAITING", price: "INCLUDE", units: INCL, cost: 150_000, vat: 10_500, vatCode: "1155", grand: 160_500, note: "รอใบกำกับ · ราคารวม VAT" },
    { id: "B5", purchaseMode: "NO_CLAIM", price: "EXCLUDE", units: EXCL, cost: 150_000, vat: 0, vatCode: null, grand: 150_000, note: "เคลมไม่ได้ · ราคาแยก VAT (ไม่มี VAT)" },
    { id: "B6", purchaseMode: "NO_CLAIM", price: "INCLUDE", units: INCL, cost: 160_500, vat: 0, vatCode: null, grand: 160_500, note: "เคลมไม่ได้ · VAT เป็นส่วนหนึ่งของต้นทุน" },
  ];
  for (const c of table) {
    try {
      const r = await issueAndRead({
        docType: "EXPENSE",
        vatMode: c.price,
        purchaseMode: c.purchaseMode,
        units: c.units,
      });
      chk(`${c.id}.1`, `${c.note} — ออกเอกสารได้`, r.ok, "ออกได้", r.ok ? "ออกได้" : `ล้มเหลว: ${r.reason}`);
      if (!r.ok || !r.entry) continue;
      chkAmt(`${c.id}.2`, `${c.note} — สมดุล Σdebit == Σcredit`, sumCr(r.entry), sumDr(r.entry));
      chkAmt(`${c.id}.3`, `${c.note} — Dr 6900 ค่าใช้จ่าย`, c.cost, side(r.entry, "6900", "dr"));
      chkAmt(`${c.id}.4`, `${c.note} — Dr 1150 ภาษีซื้อ`, c.vatCode === "1150" ? c.vat : 0, side(r.entry, "1150", "dr"));
      chkAmt(`${c.id}.5`, `${c.note} — Dr 1155 ภาษีซื้อรอใบกำกับ`, c.vatCode === "1155" ? c.vat : 0, side(r.entry, "1155", "dr"));
      chkAmt(`${c.id}.6`, `${c.note} — Cr 2100 เจ้าหนี้`, c.grand, side(r.entry, "2100", "cr"));
      chkAmt(`${c.id}.7`, `${c.note} — VAT ในเอกสาร`, c.vat, r.doc?.vatAmount ?? -1);
    } catch (e) {
      crash(`${c.id}.x`, c.note, e);
    }
  }

  // ═══════════ C) หัก ณ ที่จ่าย บนใบซื้อโหมดราคารวม VAT ═══════════
  // ซื้อ 1,605.00 (ฐาน 1,500 + VAT 105) · หัก ณ ที่จ่าย 3% ของฐาน = 45.00 · จ่ายจริง 1,560.00
  console.log("\n── C) WHT บนใบซื้อโหมดราคารวม VAT ──");
  try {
    const r = await issueAndRead({ docType: "PURCHASE", vatMode: "INCLUDE", purchaseMode: "CLAIM", units: INCL });
    chk("C1", "ออกใบซื้อ (INCLUDE) เพื่อทดสอบ WHT ได้", r.ok, "ออกได้", r.ok ? "ออกได้" : `ล้มเหลว: ${r.reason}`);
    if (r.ok) {
      const pay = await exp.recordVendorPayment(tenantId, systemId, r.docId, {
        channel: "TRANSFER",
        amount: 156_000,
        whtAmountSatang: 4_500,
        whtRateBp: 300,
        whtIncomeType: "M40_8",
      });
      chk("C2", "บันทึกจ่ายชำระ (หัก ณ ที่จ่าย 45.00) ได้", pay.ok, "ok", JSON.stringify(pay));
      const p = await prisma.accountDocumentPayment.findFirst({
        where: { systemId, documentId: r.docId },
        select: { id: true },
      });
      const pes = p ? await entriesOf(systemId, p.id) : [];
      const pe = pes[0];
      chk("C3", "มีใบสำคัญของการจ่ายชำระ", !!pe, "มี", pe ? `มี (${pe.docNo})` : "ไม่มี");
      if (pe) {
        chkAmt("C4", "ใบสำคัญจ่ายชำระสมดุล", sumCr(pe), sumDr(pe));
        chkAmt("C5", "Dr 2100 เจ้าหนี้ (จ่ายจริง+WHT)", 160_500, side(pe, "2100", "dr"));
        chkAmt("C6", "Cr 2130 ภาษีหัก ณ ที่จ่ายค้างนำส่ง", 4_500, side(pe, "2130", "cr"));
      }
      const docAfter = await prisma.accountDocument.findFirstOrThrow({
        where: { id: r.docId },
        select: { status: true, paidTotal: true },
      });
      chk("C7", "ใบซื้อปิดเป็น PAID เมื่อตัดเจ้าหนี้ครบ", docAfter.status === "PAID", "PAID", String(docAfter.status));
      chkAmt("C8", "paidTotal = ยอดรวมทั้งใบ", 160_500, docAfter.paidTotal);
    }
  } catch (e) {
    crash("C.x", "WHT บนใบซื้อ INCLUDE", e);
  }

  // ═══════════ D) ทุกใบสำคัญในระบบนี้ต้องสมดุลรายใบ ═══════════
  console.log("\n── D) กวาดทั้งระบบ ──");
  try {
    const all = await prisma.accountJournalEntry.findMany({
      where: { systemId },
      include: { lines: { select: { debit: true, credit: true } } },
    });
    const bad = all.filter(
      (e) =>
        e.lines.reduce((s, l) => s + l.debit, 0) !== e.lines.reduce((s, l) => s + l.credit, 0),
    );
    chk("D1", "มีใบสำคัญเกิดขึ้นจริง (ไม่ใช่ 0 ใบ)", all.length > 0, "> 0", String(all.length));
    chk("D2", "ใบสำคัญทุกใบสมดุลรายใบ", bad.length === 0, "0 ใบที่ไม่สมดุล", `${bad.length} ใบ`);
    const needs = await prisma.accountJournalEntry.count({ where: { systemId, needsReview: true } });
    chk("D3", "ไม่มีใบสำคัญที่ต้องตรวจ (needsReview)", needs === 0, "0", String(needs), "MAJOR");
  } catch (e) {
    crash("D.x", "กวาดทั้งระบบ", e);
  }
} catch (e) {
  console.error("SCRIPT ERROR:", e);
  chk("FATAL", "สคริปต์เดินจนจบ", false, "จบปกติ", e instanceof Error ? e.message : String(e));
} finally {
  console.log("\n── cleanup ──");
  const del = async (name: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      console.log(`  ⚠ ${name}: ${e instanceof Error ? e.message : e}`);
    }
  };
  if (tenantId) {
    await del("journalLine", () => prisma.accountJournalLine.deleteMany({ where: { tenantId } }));
    await del("entry.unlink", () => prisma.accountJournalEntry.updateMany({ where: { tenantId }, data: { reversalOfId: null } }));
    await del("entry", () => prisma.accountJournalEntry.deleteMany({ where: { tenantId } }));
    await del("payment.unlink", () => prisma.accountDocumentPayment.updateMany({ where: { tenantId }, data: { chequeId: null, whtCertDocId: null } }));
    await del("payment", () => prisma.accountDocumentPayment.deleteMany({ where: { tenantId } }));
    await del("relation", () => prisma.accountDocumentRelation.deleteMany({ where: { tenantId } }));
    await del("line", () => prisma.accountDocumentLine.deleteMany({ where: { tenantId } }));
    await del("doc.unlink", () => prisma.accountDocument.updateMany({ where: { tenantId }, data: { sourceDocId: null, replacedById: null, sourcePaymentId: null } }));
    await del("attachment", () => prisma.accountAttachment.deleteMany({ where: { tenantId } }));
    await del("document", () => prisma.accountDocument.deleteMany({ where: { tenantId } }));
    await del("sequence", () => prisma.accountDocSequence.deleteMany({ where: { tenantId } }));
    await del("mapping", () => prisma.accountMapping.deleteMany({ where: { tenantId } }));
    await del("finance", () => prisma.accountFinance.deleteMany({ where: { tenantId } }));
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
  if (userId) {
    try {
      await prisma.user.delete({ where: { id: userId } });
    } catch {}
  }
  console.log("[cleanup] เสร็จ");
  const bad = findings.filter((f) => !f.ok);
  console.log(`\n═══ QC GL INCL-VAT (WO 0.6): ${findings.length} ข้อ · ผ่าน ${findings.length - bad.length} · ตก ${bad.length} ═══`);
  for (const f of bad) console.log(`  [${f.sev}] ${f.id} ${f.name} — expected ${f.expected} | actual ${f.actual}`);
  console.log("JSON_SUMMARY " + JSON.stringify({ total: findings.length, passed: findings.length - bad.length }));
  await prisma.$disconnect();
  process.exit(bad.length > 0 ? 1 : 0);
}
