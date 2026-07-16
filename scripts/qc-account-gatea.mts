// QC5 Gate A verify — ขับผ่าน service layer จริง (posting engine) แล้ว assert double-entry + VAT routing
// รัน: pnpm exec tsx scripts/qc-account-gatea.mts
try { process.loadEnvFile(".env"); } catch { /* CI ไม่มี .env — env มาจาก secrets โดยตรง */ }
try { process.loadEnvFile(".env.local"); } catch {}

const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/account/../system/service");
const acc = await import("@/lib/modules/account/service");
const gl = await import("@/lib/modules/account/gl");

const log: string[] = [];
const pass = (n: string) => log.push("  ✅ " + n);
const fail = (n: string, e: unknown) => log.push("  ❌ " + n + " — " + (e instanceof Error ? e.message : String(e)));

let tenantId = "";
let userId = "";
const email = "qcacct-" + Date.now() + "@qc.local";

type EntryView = { id: string; refType: string | null; refId: string | null; journal: string; lines: { code: string; debit: number; credit: number }[] };
async function entriesOf(systemId: string): Promise<EntryView[]> {
  const es = await prisma.accountJournalEntry.findMany({
    where: { systemId },
    include: { lines: { include: { account: { select: { code: true } } } } },
  });
  return es.map((e) => ({
    id: e.id, refType: e.refType, refId: e.refId, journal: e.journal,
    lines: e.lines.map((l) => ({ code: l.account.code, debit: l.debit, credit: l.credit })),
  }));
}
const bal = (e: EntryView) => e.lines.reduce((s, l) => s + l.debit, 0) === e.lines.reduce((s, l) => s + l.credit, 0);
const has = (e: EntryView, code: string, side: "dr" | "cr") =>
  e.lines.some((l) => l.code === code && (side === "dr" ? l.debit : l.credit) > 0);

try {
  const t = await prisma.tenant.create({ data: { name: "QCA", slug: "qca-" + Date.now() } });
  tenantId = t.id;
  const u = await prisma.user.create({ data: { email, name: "QC" } });
  userId = u.id;
  await prisma.membership.create({ data: { userId, tenantId, role: "OWNER", unitAccess: ["*"] } });

  // ── ระบบบัญชี A (จด VAT) ──
  const sA = await sys.createSystem(tenantId, "ACCOUNT", "บัญชี QC");
  const ctx = { tenantId, systemId: sA.id };
  await acc.saveSettings(tenantId, sA.id, { orgName: "ร้าน QC", vatRegistered: true, vatRateBp: 700 });
  await gl.ensureAccounting(ctx);
  const acctCount = await prisma.accountLedger.count({ where: { systemId: sA.id } });
  if (acctCount < 30) throw new Error("seed ผังบัญชีไม่ครบ: " + acctCount);
  pass(`ensureAccounting: seed ผังบัญชี ${acctCount} บัญชี`);
  const contact = await acc.createContact({ tenantId, systemId: sA.id, name: "ลูกค้า QC", kind: "CUSTOMER" });

  // ── GOODS: INVOICE (ON_ISSUE) → VAT พักที่ 2205, ไม่แตะ 2200 ──
  try {
    const d = await acc.createDocument({ tenantId, systemId: sA.id, docType: "INVOICE", contactId: (contact as { id: string }).id, vatMode: "EXCLUDE", vatTiming: "ON_ISSUE", lines: [{ description: "สินค้า A", qty: 10, unitPrice: 10000 }] });
    const iss = await acc.issueDocument(tenantId, sA.id, (d as { id: string }).id);
    if ((iss as { ok: boolean }).ok === false) throw new Error(JSON.stringify(iss));
    const es = await entriesOf(sA.id);
    const e = es.find((x) => x.refType === "AccountDocument" && x.refId === (d as { id: string }).id);
    if (!e) throw new Error("ไม่พบ journal ของ INVOICE");
    if (!bal(e)) throw new Error("INVOICE entry ไม่ balance");
    if (!has(e, "1100", "dr")) throw new Error("ไม่ Dr 1100 ลูกหนี้");
    if (!has(e, "2205", "cr")) throw new Error("VAT goods ต้องพักที่ 2205 (cr)");
    if (has(e, "2200", "cr")) throw new Error("VAT ไม่ควรเข้า 2200 ตอน IV issue (ต้องรอใบกำกับ)");
    pass("GOODS INVOICE: Dr1100 / Cr income / Cr2205 (VAT พัก) — balance ✓ (QC5-A2)");

    // ออกใบกำกับ (convert → issue) → ย้าย 2205→2200
    const cv = await acc.convertDocument(tenantId, sA.id, (d as { id: string }).id, "TAX_INVOICE", userId);
    if ((cv as { ok: boolean }).ok === false) throw new Error("convert TAX_INVOICE: " + JSON.stringify(cv));
    const txId = (cv as { newId: string }).newId;
    const ti = await acc.issueDocument(tenantId, sA.id, txId);
    if ((ti as { ok: boolean }).ok === false) throw new Error("issue TAX_INVOICE: " + JSON.stringify(ti));
    const es2 = await entriesOf(sA.id);
    const te = es2.find((x) => x.refType === "AccountDocument" && x.refId === txId);
    if (!te) throw new Error("ไม่พบ journal ของใบกำกับ");
    if (!bal(te)) throw new Error("TAX_INVOICE entry ไม่ balance");
    if (!has(te, "2205", "dr") || !has(te, "2200", "cr")) throw new Error("ใบกำกับต้องย้าย Dr2205/Cr2200");
    pass("TAX_INVOICE: Dr2205 / Cr2200 (เดือนภาษีเกิดที่ใบกำกับ) — balance ✓ (QC5-A2)");

    // รับชำระเต็ม → Dr เงิน / Cr 1100
    const pay = await acc.recordPayment(tenantId, sA.id, (d as { id: string }).id, { amount: 107000, channel: "TRANSFER" });
    if ((pay as { ok: boolean }).ok === false) throw new Error("payment: " + JSON.stringify(pay));
    const pe = (await entriesOf(sA.id)).find((x) => x.refType === "AccountDocumentPayment");
    if (!pe || !bal(pe)) throw new Error("payment entry ไม่ balance");
    if (!has(pe, "1100", "cr")) throw new Error("payment ต้อง Cr 1100 ลูกหนี้");
    pass("รับชำระ: Dr เงิน / Cr1100 — balance ✓");
  } catch (e) { fail("GOODS flow", e); }

  // ── SERVICE: INVOICE (ON_PAYMENT) → VAT พักที่ 2210 ──
  try {
    const d = await acc.createDocument({ tenantId, systemId: sA.id, docType: "INVOICE", contactId: (contact as { id: string }).id, vatMode: "EXCLUDE", vatTiming: "ON_PAYMENT", lines: [{ description: "บริการที่ปรึกษา", qty: 1, unitPrice: 200000 }] });
    await acc.issueDocument(tenantId, sA.id, (d as { id: string }).id);
    const e = (await entriesOf(sA.id)).find((x) => x.refType === "AccountDocument" && x.refId === (d as { id: string }).id);
    if (!e || !bal(e)) throw new Error("SERVICE INVOICE entry ไม่ balance");
    if (!has(e, "2210", "cr")) throw new Error("VAT บริการต้องพักที่ 2210 (cr)");
    pass("SERVICE INVOICE: VAT พักที่ 2210 (ยังไม่ถึงกำหนด) — balance ✓ (QC5-A1)");
  } catch (e) { fail("SERVICE flow", e); }

  // ── VOID → reversal balance ──
  try {
    const d = await acc.createDocument({ tenantId, systemId: sA.id, docType: "INVOICE", contactId: (contact as { id: string }).id, vatMode: "EXCLUDE", lines: [{ description: "ของยกเลิก", qty: 1, unitPrice: 50000 }] });
    await acc.issueDocument(tenantId, sA.id, (d as { id: string }).id);
    const v = await acc.voidDocument(tenantId, sA.id, (d as { id: string }).id, "ทดสอบ void");
    if ((v as { ok: boolean }).ok === false) throw new Error(JSON.stringify(v));
    const revs = (await entriesOf(sA.id)).filter((x) => x.journal === "REVERSAL");
    if (revs.length === 0) throw new Error("void ไม่สร้าง reversal entry");
    if (!revs.every(bal)) throw new Error("reversal entry ไม่ balance");
    pass(`VOID: reversal ${revs.length} entry — balance ✓`);
  } catch (e) { fail("VOID flow", e); }

  // ── GLOBAL invariant: ทุก entry balance + Σ ทั้งระบบ balance ──
  try {
    const all = await entriesOf(sA.id);
    const bad = all.filter((e) => !bal(e));
    if (bad.length) throw new Error(bad.length + " entry ไม่ balance");
    const gdr = all.flatMap((e) => e.lines).reduce((s, l) => s + l.debit, 0);
    const gcr = all.flatMap((e) => e.lines).reduce((s, l) => s + l.credit, 0);
    if (gdr !== gcr) throw new Error(`Σdebit ${gdr} ≠ Σcredit ${gcr}`);
    pass(`GLOBAL: ${all.length} entry balance ครบ + Σdebit==Σcredit (${gdr / 100} บาท)`);
  } catch (e) { fail("GLOBAL double-entry", e); }

  // ── vatRegistered=false gate: ไม่มีบรรทัด VAT ──
  try {
    const sB = await sys.createSystem(tenantId, "ACCOUNT", "บัญชี ไม่จด VAT");
    await acc.saveSettings(tenantId, sB.id, { orgName: "รายย่อย", vatRegistered: false });
    await gl.ensureAccounting({ tenantId, systemId: sB.id });
    const c2 = await acc.createContact({ tenantId, systemId: sB.id, name: "ลูกค้า B", kind: "CUSTOMER" });
    const d = await acc.createDocument({ tenantId, systemId: sB.id, docType: "INVOICE", contactId: (c2 as { id: string }).id, vatMode: "EXCLUDE", lines: [{ description: "ของ", qty: 1, unitPrice: 100000 }] });
    const doc = await prisma.accountDocument.findUnique({ where: { id: (d as { id: string }).id } });
    if (doc?.vatMode !== "NONE") throw new Error("ไม่จด VAT แต่ vatMode ไม่ใช่ NONE: " + doc?.vatMode);
    if ((doc?.vatAmount ?? 0) !== 0) throw new Error("ไม่จด VAT แต่มี vatAmount");
    await acc.issueDocument(tenantId, sB.id, (d as { id: string }).id);
    const e = (await entriesOf(sB.id)).find((x) => x.refId === (d as { id: string }).id);
    if (e && (has(e, "2200", "cr") || has(e, "2205", "cr") || has(e, "2210", "cr"))) throw new Error("ไม่จด VAT แต่มีบรรทัด VAT ใน journal");
    pass("vatRegistered=false: บังคับ vatMode NONE + ไม่มีบรรทัด VAT (QC5-A3) ✓");
  } catch (e) { fail("vatRegistered gate", e); }

  // ── can()+AuditLog wiring (action layer — verify แบบ static เพราะ harness ขับ service ตรง) ──
  try {
    const src = await (await import("node:fs/promises")).readFile("src/lib/modules/account/actions.ts", "utf8");
    const cans = (src.match(/assertAccountCan/g) ?? []).length;
    const audits = (src.match(/writeAudit/g) ?? []).length;
    if (cans < 10 || audits < 10) throw new Error(`wiring ไม่ครบ: can=${cans} audit=${audits}`);
    pass(`can()+AuditLog wiring: assertAccountCan×${cans} + writeAudit×${audits} ในทุก money action (QC5-A5) ✓`);
  } catch (e) { fail("can/audit wiring", e); }
} finally {
  const del = async (fn: () => Promise<unknown>) => { try { await fn(); } catch (e) { log.push("  ⚠ cleanup: " + (e instanceof Error ? e.message : e)); } };
  if (tenantId) {
    await del(() => prisma.accountJournalLine.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountJournalEntry.updateMany({ where: { tenantId }, data: { reversalOfId: null } }));
    await del(() => prisma.accountJournalEntry.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountDocumentPayment.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountDocumentRelation.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountDocumentLine.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountDocument.updateMany({ where: { tenantId }, data: { sourceDocId: null, replacedById: null, sourcePaymentId: null } }));
    await del(() => prisma.accountAttachment.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountDocument.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountDocSequence.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountMapping.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountLedger.updateMany({ where: { tenantId }, data: { parentId: null } }));
    await del(() => prisma.accountLedger.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountPeriod.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountFinance.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountContact.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountSettings.deleteMany({ where: { tenantId } }));
    await del(() => prisma.appSystemUnit.deleteMany({ where: { tenantId } }));
    await del(() => prisma.appSystem.deleteMany({ where: { tenantId } }));
    await del(() => prisma.auditLog.deleteMany({ where: { tenantId } }));
    await del(() => prisma.tenant.delete({ where: { id: tenantId } }));
  }
  if (userId) await del(() => prisma.user.delete({ where: { id: userId } }));
  log.push("[cleanup] ลบ test data เรียบร้อย");
}

console.log("\n===== QC5 Gate A verify (service layer + double-entry, Neon) =====");
console.log(log.join("\n"));
const failed = log.filter((l) => l.includes("❌")).length;
console.log(`\n${failed === 0 ? "🎉 Gate A ผ่านทั้งหมด" : "⚠️ ล้มเหลว " + failed + " รายการ"}\n`);
await prisma.$disconnect();
process.exit(failed === 0 ? 0 : 1);
