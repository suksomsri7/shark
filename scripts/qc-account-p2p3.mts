try { process.loadEnvFile(".env"); } catch { /* CI ไม่มี .env — env มาจาก secrets โดยตรง */ }
try { process.loadEnvFile(".env.local"); } catch {}
const { prisma } = await import("@/lib/core/db");
const sysm = await import("@/lib/modules/account/../system/service");
const acc = await import("@/lib/modules/account/service");
const gl = await import("@/lib/modules/account/gl");
const log: string[] = [];
const pass = (n: string) => log.push("  ✅ " + n);
const fail = (n: string, e: unknown) => log.push("  ❌ " + n + " — " + (e instanceof Error ? e.message : String(e)));
let tenantId = ""; let userId = "";
async function entries(systemId: string) {
  const es = await prisma.accountJournalEntry.findMany({ where: { systemId }, include: { lines: { include: { account: { select: { code: true } } } } } });
  return es.map((e) => ({ journal: e.journal, refType: e.refType, refId: e.refId, lines: e.lines.map((l) => ({ code: l.account.code, debit: l.debit, credit: l.credit })) }));
}
const bal = (e: { lines: { debit: number; credit: number }[] }) => e.lines.reduce((s, l) => s + l.debit, 0) === e.lines.reduce((s, l) => s + l.credit, 0);
const has = (e: { lines: { code: string; debit: number; credit: number }[] }, c: string, s: "dr" | "cr") => e.lines.some((l) => l.code === c && (s === "dr" ? l.debit : l.credit) > 0);
try {
  const t = await prisma.tenant.create({ data: { name: "QCP", slug: "qcp-" + Date.now() } }); tenantId = t.id;
  const u = await prisma.user.create({ data: { email: "qcp-" + Date.now() + "@qc.local" } }); userId = u.id;
  await prisma.membership.create({ data: { userId, tenantId, role: "OWNER", unitAccess: ["*"] } });
  const s = await sysm.createSystem(tenantId, "ACCOUNT", "บัญชี P2P3"); const ctx = { tenantId, systemId: s.id };
  await acc.saveSettings(tenantId, s.id, { orgName: "QC", vatRegistered: true, vatRateBp: 700 });
  await gl.ensureAccounting(ctx);
  const led = await prisma.accountLedger.findMany({ where: { systemId: s.id }, select: { id: true, code: true } });
  const byCode = Object.fromEntries(led.map((l) => [l.code, l.id]));
  const vendor = await acc.createContact({ tenantId, systemId: s.id, name: "ผู้ขาย QC", kind: "VENDOR" });

  // PURCHASE: Dr 6900+1150 / Cr 2100
  try {
    const d = await prisma.accountDocument.create({ data: { tenantId, systemId: s.id, docType: "PURCHASE", status: "AWAITING_PAYMENT", direction: "IN", docNo: "PC-T1", contactId: (vendor as { id: string }).id, vatMode: "EXCLUDE", subTotal: 100000, vatAmount: 7000, grandTotal: 107000, lines: { create: [{ tenantId, systemId: s.id, description: "วัตถุดิบ", qty: 1, unitPrice: 100000, vatRateBp: 700, amount: 100000, accountId: byCode["6900"] }] } } });
    const r = await gl.postDocument(ctx, d.id);
    if ("skipped" in r) throw new Error("skipped");
    const e = (await entries(s.id)).find((x) => x.refId === d.id)!;
    if (!bal(e)) throw new Error("PURCHASE ไม่ balance");
    if (!has(e, "2100", "cr")) throw new Error("ไม่ Cr 2100 เจ้าหนี้");
    if (!has(e, "1150", "dr")) throw new Error("ไม่ Dr 1150 VAT ซื้อ");
    pass("PURCHASE issue: Dr 6900+1150 / Cr 2100 — balance ✓");
    // จ่ายชำระ + หัก WHT 3% → Dr 2100 / Cr เงิน + Cr 2130
    const pmt = await prisma.accountDocumentPayment.create({ data: { tenantId, systemId: s.id, documentId: d.id, amount: 104000, whtAmountSatang: 3000, whtRateBp: 300, channel: "TRANSFER" } });
    const rp = await gl.postPayment(ctx, pmt.id);
    if ("skipped" in rp) throw new Error("payment skipped");
    const pe = (await entries(s.id)).find((x) => x.refType === "AccountDocumentPayment")!;
    if (!bal(pe)) throw new Error("payment ไม่ balance");
    if (!has(pe, "2130", "cr")) throw new Error("WHT ต้อง Cr 2130 (ค้างนำส่ง)");
    if (!has(pe, "2100", "dr")) throw new Error("จ่ายต้อง Dr 2100");
    pass("จ่ายชำระ+WHT: Dr 2100 / Cr เงิน + Cr 2130 (WHT ค้างนำส่ง) — balance ✓");
  } catch (e) { fail("PURCHASE+WHT payable", e); }

  // manual JV
  try {
    const r = await gl.postManualJV(ctx, { date: new Date(), memo: "JV ทดสอบ", lines: [{ accountId: byCode["1000"], debit: 50000, credit: 0 }, { accountId: byCode["1010"], debit: 0, credit: 50000 }] });
    const e = (await entries(s.id)).find((x) => x.journal === "ADJUST")!;
    if (!e || !bal(e)) throw new Error("JV ไม่ balance"); pass("postManualJV: Σdr==Σcr ✓");
  } catch (e) { fail("manual JV", e); }

  // depreciation
  try {
    const asset = await prisma.accountFixedAsset.create({ data: { tenantId, systemId: s.id, code: "FA-T1", name: "คอม", acquiredDate: new Date(), startDepDate: new Date(), cost: 1200000, salvageValue: 100, usefulLifeMonths: 12, assetAccountId: byCode["1610"], accumAccountId: byCode["1619"], expenseAccountId: byCode["6800"] } });
    const r = await gl.postDepreciation(ctx, { assetId: asset.id, periodKey: "2026-07", amount: 100000, expenseAccountId: byCode["6800"], accumAccountId: byCode["1619"] });
    const e = (await entries(s.id)).find((x) => x.journal === "DEPRECIATION")!;
    if (!e || !bal(e)) throw new Error("ค่าเสื่อมไม่ balance");
    if (!has(e, "6800", "dr") || !has(e, "1619", "cr")) throw new Error("ค่าเสื่อม Dr6800/Cr1619");
    pass("postDepreciation: Dr 6800 / Cr 1619 — balance ✓");
  } catch (e) { fail("depreciation", e); }

  // opening
  try {
    const r = await gl.postOpening(ctx, { date: new Date(), lines: [{ accountId: byCode["1010"], debit: 500000, credit: 0 }] });
    const e = (await entries(s.id)).find((x) => x.journal === "OPENING")!;
    if (!e || !bal(e)) throw new Error("opening ไม่ balance (ต้องคู่ 3999)");
    if (!has(e, "3999", "cr")) throw new Error("opening ต้องมีบัญชีคู่ 3999");
    pass("postOpening: บัญชีคู่ 3999 — balance ✓ (Gate C)");
  } catch (e) { fail("opening balance", e); }

  // global
  try {
    const all = await entries(s.id);
    if (!all.every(bal)) throw new Error("มี entry ไม่ balance");
    const gd = all.flatMap((e) => e.lines).reduce((a, l) => a + l.debit, 0);
    const gc = all.flatMap((e) => e.lines).reduce((a, l) => a + l.credit, 0);
    if (gd !== gc) throw new Error(`Σdr ${gd} ≠ Σcr ${gc}`);
    pass(`GLOBAL: ${all.length} entry balance + Σdr==Σcr ✓`);
  } catch (e) { fail("global", e); }
} finally {
  const del = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  if (tenantId) {
    for (const m of ["accountJournalLine","accountDepreciation","accountFixedAsset","accountDocumentPayment","accountDocumentLine"]) await del(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountJournalEntry.updateMany({ where: { tenantId }, data: { reversalOfId: null } }));
    await del(() => prisma.accountJournalEntry.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountDocument.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountMapping.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountLedger.updateMany({ where: { tenantId }, data: { parentId: null } }));
    await del(() => prisma.accountLedger.deleteMany({ where: { tenantId } }));
    for (const m of ["accountPeriod","accountContact","accountSettings","appSystemUnit","appSystem","auditLog"]) await del(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId } }));
    await del(() => prisma.tenant.delete({ where: { id: tenantId } }));
  }
  if (userId) await del(() => prisma.user.delete({ where: { id: userId } }));
}
console.log("\n===== QC P2/P3 engine (double-entry, Neon) =====\n" + log.join("\n"));
const failed = log.filter((l) => l.includes("❌")).length;
console.log(`\n${failed === 0 ? "🎉 posting engine P2/P3 ผ่าน" : "⚠️ ล้ม " + failed}\n`);
await prisma.$disconnect(); process.exit(failed === 0 ? 0 : 1);
