// QC — พิสูจน์ findings ภาษี: print ใบกำกับ + CSV ภ.ง.ด. (อ่านอย่างเดียวต่อ code — สร้าง tenant ทดสอบแล้วลบทิ้ง)
// รัน: cd /root/projects/shark-in-th && pnpm exec tsx /tmp/qc-tax-print-audit.mts
process.loadEnvFile(".env");
try { process.loadEnvFile(".env.local"); } catch {}

const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
const acc = await import("@/lib/modules/account/service");
const exp = await import("@/lib/modules/account/expense");
const gl = await import("@/lib/modules/account/gl");
const wht = await import("@/lib/modules/account/wht");

const bt = (s: number) => (s / 100).toFixed(2);
type Res = { id: string; name: string; ok: boolean; detail: string };
const results: Res[] = [];
function chk(id: string, name: string, ok: boolean, detail: string) {
  results.push({ id, name, ok, detail });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name} — ${detail}`);
}

// ยอด GL 2130 (WHT ค้างนำส่ง) net Cr
async function gl2130(systemId: string): Promise<number> {
  const led = await prisma.accountLedger.findFirst({ where: { systemId, code: "2130" }, select: { id: true } });
  if (!led) return 0;
  const agg = await prisma.accountJournalLine.aggregate({
    where: { systemId, accountId: led.id }, _sum: { debit: true, credit: true },
  });
  return (agg._sum.credit ?? 0) - (agg._sum.debit ?? 0);
}

let tenantId = "";
try {
  const t = await prisma.tenant.create({ data: { name: "QC tax-print audit", slug: "qc-taxprint-" + Date.now() } });
  tenantId = t.id;
  const u = await prisma.user.create({ data: { email: `qc-taxprint-${Date.now()}@qc.local`, name: "CPA QC" } });
  const userId = u.id;
  await prisma.membership.create({ data: { userId, tenantId, role: "OWNER", unitAccess: ["*"] } });
  const s = await sys.createSystem(tenantId, "ACCOUNT", "QC tax");
  const systemId = s.id;
  await acc.saveSettings(tenantId, systemId, {
    orgName: "บจก. คิวซีภาษี", taxId: "0105561000000", vatRegistered: true, vatRateBp: 700, taxPointBasis: "ON_ISSUE",
  });
  await gl.ensureAccounting({ tenantId, systemId });

  const now = new Date();
  const P = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`; // TZ เครื่อง=UTC ก็ยังตรงเดือนไทยช่วงกลางเดือน

  const vendorCo = await acc.createContact({ tenantId, systemId, kind: "VENDOR", legalType: "COMPANY", name: "บจก. ผู้รับเงิน, จำกัด \"เทส\"", taxId: "0105562222222" });
  const vendorPerson = await acc.createContact({ tenantId, systemId, kind: "VENDOR", legalType: "PERSON", name: "นายบุคคล ธรรมดา", taxId: "1111111111111" });
  const customer = await acc.createContact({ tenantId, systemId, kind: "CUSTOMER", legalType: "COMPANY", name: "บจก. ลูกค้า", taxId: "0105561111111" });

  // ── T0: contact ยอมรับ taxId ผิดรูปแบบ (5 หลัก) ──
  const badContact = await acc.createContact({ tenantId, systemId, kind: "VENDOR", name: "เลขภาษีสั้น", taxId: "12345" });
  chk("T0", "contact ยอมรับ taxId 5 หลัก (ไม่มี validate)", badContact.taxId === "12345", `saved taxId="${badContact.taxId}"`);

  // ── T1: จ่าย vendor + WHT + auto 50 ทวิ → void payment → cert ยังอยู่ใน ภ.ง.ด. แต่ GL 2130 กลับรายการแล้ว ──
  const e1 = await exp.createExpenseDoc({
    tenantId, systemId, docType: "EXPENSE", contactId: vendorCo.id,
    vatMode: "EXCLUDE", vatPurchaseMode: "CLAIM",
    lines: [{ description: "ค่าบริการ", qty: 1, unitPrice: 100_000 }],
  });
  await exp.issueExpenseDoc(tenantId, systemId, e1.id);
  const rv1 = await exp.recordVendorPayment(tenantId, systemId, e1.id, {
    amount: 104_000, whtAmountSatang: 3_000, whtRateBp: 300, whtIncomeType: "M40_8", channel: "TRANSFER",
  });
  if (!(rv1 as { ok: boolean }).ok) console.log("  ⚠ T1 pay fail", rv1);
  let p53 = await wht.pnd(tenantId, systemId, { type: 53, period: P });
  const glBefore = await gl2130(systemId);
  chk("T1a", "หลังจ่าย: ภ.ง.ด.53 = GL 2130 = 30.00", p53.grandWht === 3_000 && glBefore === 3_000, `pnd=${bt(p53.grandWht)} gl2130=${bt(glBefore)}`);
  const pmt1 = await prisma.accountDocumentPayment.findFirst({ where: { systemId, documentId: e1.id }, select: { id: true, whtCertDocId: true } });
  const vv = await exp.voidVendorPayment(tenantId, systemId, e1.id, pmt1!.id, "QC void");
  if (!(vv as { ok: boolean }).ok) console.log("  ⚠ T1 void fail", vv);
  p53 = await wht.pnd(tenantId, systemId, { type: 53, period: P });
  const glAfter = await gl2130(systemId);
  const cert1 = await prisma.accountDocument.findFirst({ where: { id: pmt1!.whtCertDocId ?? "" }, select: { status: true, docNo: true } });
  chk("T1b", "void payment แล้ว 50 ทวิ ควรถูก void + หลุดจาก ภ.ง.ด. (คาด: ยังค้าง = บั๊ก)",
    !(p53.grandWht === 3_000 && glAfter === 0 && cert1?.status === "ISSUED"),
    `cert=${cert1?.docNo}(${cert1?.status}) pnd53=${bt(p53.grandWht)} gl2130=${bt(glAfter)}`);

  // ── T2: legalType อ่านจาก contact ปัจจุบัน (ไม่ freeze) — แก้ contact ย้อนเปลี่ยนแบบที่ยื่นแล้ว ──
  const e2 = await exp.createExpenseDoc({
    tenantId, systemId, docType: "EXPENSE", contactId: vendorPerson.id,
    vatMode: "NONE", vatPurchaseMode: "NO_CLAIM",
    lines: [{ description: "ค่าจ้างบุคคล", qty: 1, unitPrice: 100_000 }],
  });
  await exp.issueExpenseDoc(tenantId, systemId, e2.id);
  await exp.recordVendorPayment(tenantId, systemId, e2.id, {
    amount: 97_000, whtAmountSatang: 3_000, whtRateBp: 300, whtIncomeType: "M40_8", channel: "TRANSFER",
  });
  const p3a = await wht.pnd(tenantId, systemId, { type: 3, period: P });
  await acc.updateContact(tenantId, systemId, vendorPerson.id, { legalType: "COMPANY" });
  const p3b = await wht.pnd(tenantId, systemId, { type: 3, period: P });
  const p53b = await wht.pnd(tenantId, systemId, { type: 53, period: P });
  chk("T2", "แก้ legalType ของ contact ย้อนย้ายรายการ ภ.ง.ด.3→53 (ไม่ freeze ณ วันออกใบ)",
    p3a.grandWht === 3_000 && p3b.grandWht === 0,
    `ก่อนแก้ pnd3=${bt(p3a.grandWht)} · หลังแก้ pnd3=${bt(p3b.grandWht)} pnd53รวม=${bt(p53b.grandWht)}`);
  await acc.updateContact(tenantId, systemId, vendorPerson.id, { legalType: "PERSON" }); // คืนค่า

  // ── T3: WHT ไม่ระบุ whtIncomeType → ไม่ออก cert → GL 2130 มี แต่ ภ.ง.ด. ไม่มี ──
  const e3 = await exp.createExpenseDoc({
    tenantId, systemId, docType: "EXPENSE", contactId: vendorCo.id,
    vatMode: "NONE", vatPurchaseMode: "NO_CLAIM",
    lines: [{ description: "ค่าเช่า", qty: 1, unitPrice: 200_000 }],
  });
  await exp.issueExpenseDoc(tenantId, systemId, e3.id);
  await exp.recordVendorPayment(tenantId, systemId, e3.id, {
    amount: 190_000, whtAmountSatang: 10_000, whtRateBp: 500, channel: "TRANSFER", // ไม่ส่ง whtIncomeType
  });
  const p53c = await wht.pnd(tenantId, systemId, { type: 53, period: P });
  const gl3 = await gl2130(systemId);
  chk("T3", "จ่าย WHT ไม่เลือกประเภทเงินได้ → GL 2130 มียอด แต่ CSV ภ.ง.ด. ไม่มี (ต้องออก 50 ทวิ มือทีหลัง)",
    gl3 - p53c.grandWht === 10_000,
    `gl2130=${bt(gl3)} pnd53=${bt(p53c.grandWht)} (T1 ค้าง 30 ใน pnd)`);

  // ── T4: ฐานเงินได้บน 50 ทวิ = คำนวณย้อนจากอัตรา ไม่ใช่ยอดจ่ายจริง (ฐานจริง 1,000.10 → ใบโชว์ 1,000.00) ──
  const e4 = await exp.createExpenseDoc({
    tenantId, systemId, docType: "EXPENSE", contactId: vendorCo.id,
    vatMode: "NONE", vatPurchaseMode: "NO_CLAIM",
    lines: [{ description: "ค่าบริการเศษสตางค์", qty: 1, unitPrice: 100_010 }],
  });
  await exp.issueExpenseDoc(tenantId, systemId, e4.id);
  await exp.recordVendorPayment(tenantId, systemId, e4.id, {
    amount: 97_010, whtAmountSatang: 3_000, whtRateBp: 300, whtIncomeType: "M40_8", channel: "TRANSFER",
  });
  const pmt4 = await prisma.accountDocumentPayment.findFirst({ where: { systemId, documentId: e4.id }, select: { whtCertDocId: true } });
  const cert4 = await prisma.accountDocument.findFirst({ where: { id: pmt4!.whtCertDocId ?? "" }, select: { subTotal: true } });
  chk("T4", "ฐานจริง 1,000.10 แต่ 50 ทวิ/ภ.ง.ด. โชว์ฐานคำนวณย้อน", cert4?.subTotal === 100_000,
    `cert base=${bt(cert4?.subTotal ?? -1)} (จ่ายจริงฐาน 1,000.10)`);

  // ── T5: วันที่ใน CSV ใช้ toISOString (UTC) — จ่ายเช้าวันที่ 15 เวลา 06:00 ไทย โชว์เป็นวันที่ 14 ──
  const y = now.getFullYear(), m = now.getMonth();
  const paidThai = new Date(Date.UTC(y, m, 15, -7 + 6, 0, 0)); // 15th 06:00 ICT = 14th 23:00 UTC
  const e5 = await exp.createExpenseDoc({
    tenantId, systemId, docType: "EXPENSE", contactId: vendorCo.id,
    vatMode: "NONE", vatPurchaseMode: "NO_CLAIM",
    lines: [{ description: "ทดสอบวันที่", qty: 1, unitPrice: 100_000 }],
  });
  await exp.issueExpenseDoc(tenantId, systemId, e5.id);
  await exp.recordVendorPayment(tenantId, systemId, e5.id, {
    amount: 97_000, whtAmountSatang: 3_000, whtRateBp: 300, whtIncomeType: "M40_1", channel: "TRANSFER", paidAt: paidThai,
  });
  const csv = await wht.pndCsv(tenantId, systemId, { type: 53, period: P });
  const line5 = csv.split("\n").find((l) => l.includes("40(1)"));
  const expectThai = `${y}-${String(m + 1).padStart(2, "0")}-15`;
  chk("T5", "CSV วันที่จ่ายเพี้ยนเป็นวันก่อนหน้า (UTC ไม่ใช่เวลาไทย)", !!line5 && !line5.includes(expectThai),
    `csv line: ${line5?.slice(0, 60)} (จ่ายจริง ${expectThai} 06:00 ไทย)`);
  // BOM + escape ชื่อที่มี comma/quote
  chk("T5b", "CSV มี UTF-8 BOM + escape ชื่อมี comma/quote", csv.charCodeAt(0) === 0xfeff && csv.includes('"บจก. ผู้รับเงิน, จำกัด ""เทส"""'),
    `BOM=${csv.charCodeAt(0).toString(16)} escaped=${csv.includes('""เทส""')}`);

  // ── T6: บริการ ON_PAYMENT — ใบกำกับต่องวด = เงินที่ตัดหนี้งวดนั้น (ม.86/4(6) มูลค่าตรงงวด) ──
  const inv = await acc.createDocument({
    tenantId, systemId, docType: "INVOICE", contactId: customer.id,
    vatMode: "EXCLUDE", vatTiming: "ON_PAYMENT",
    lines: [{ description: "ค่าบริการรายเดือน", qty: 1, unitPrice: 100_000 }],
  });
  await acc.issueDocument(tenantId, systemId, inv.id);
  await acc.recordPayment(tenantId, systemId, inv.id, { amount: 53_500, channel: "TRANSFER" });
  const ti1 = await prisma.accountDocument.findFirst({
    where: { systemId, docType: "TAX_INVOICE", sourceDocId: inv.id }, orderBy: { createdAt: "desc" },
    select: { grandTotal: true, subTotal: true, vatAmount: true, docNo: true },
  });
  chk("T6", "ใบกำกับบริการงวดแรก = 535.00 (ฐาน 500 + VAT 35) ตรงเงินรับจริง",
    ti1?.grandTotal === 53_500 && ti1?.vatAmount === 3_500 && ti1?.subTotal === 50_000,
    `TI ${ti1?.docNo}: base=${bt(ti1?.subTotal ?? -1)} vat=${bt(ti1?.vatAmount ?? -1)} grand=${bt(ti1?.grandTotal ?? -1)}`);

  // ── T7: ใบรับมัดจำ (tax point เกิดตอนรับเงิน) — ไม่มีทางออกใบกำกับจาก backoffice ──
  const dep = await acc.createDocument({
    tenantId, systemId, docType: "DEPOSIT_RECEIPT", contactId: customer.id,
    vatMode: "INCLUDE", lines: [{ description: "มัดจำงานตกแต่ง", qty: 1, unitPrice: 107_000 }],
  });
  await acc.issueDocument(tenantId, systemId, dep.id);
  await acc.recordPayment(tenantId, systemId, dep.id, { amount: 107_000, channel: "TRANSFER" });
  const cv = await acc.convertDocument(tenantId, systemId, dep.id, "TAX_INVOICE", userId);
  const depTi = await prisma.accountDocument.findFirst({ where: { systemId, docType: "TAX_INVOICE", sourceDocId: dep.id } });
  chk("T7", "รับมัดจำแล้วออกใบกำกับจาก backoffice ไม่ได้ (convert ถูกปิด + ไม่มี auto)",
    !(cv as { ok: boolean }).ok && !depTi,
    `convert→${JSON.stringify(cv)} autoTI=${depTi ? "มี" : "ไม่มี"}`);

  // ── T8: public link รับ taxId 13 หลักที่ checksum ผิด ──
  const rc = await acc.createDocument({
    tenantId, systemId, docType: "RECEIPT", contactId: null,
    vatMode: "INCLUDE", lines: [{ description: "ขายสด", qty: 1, unitPrice: 32_100 }],
  });
  await acc.issueDocument(tenantId, systemId, rc.id);
  const link = await acc.ensurePublicTaxInvoiceLink(tenantId, systemId, rc.id);
  const pub = link.ok
    ? await acc.issuePublicTaxInvoice(link.token, { name: "นายเช็คซัม ผิด", taxId: "1111111111111" })
    : { ok: false as const, reason: "no link" };
  chk("T8", "public link ยอมรับ taxId checksum ผิด (1111111111111 → หลักตรวจต้องเป็น 9)",
    (pub as { ok: boolean }).ok, JSON.stringify(pub));

  // ── T9: ออก TAX_INVOICE ได้ทั้งที่ settings ไม่มีเลขภาษีผู้ขาย ──
  await acc.saveSettings(tenantId, systemId, { orgName: "บจก. คิวซีภาษี", taxId: null, vatRegistered: true, vatRateBp: 700 });
  const ti9 = await acc.createDocument({
    tenantId, systemId, docType: "TAX_INVOICE", contactId: customer.id,
    vatMode: "EXCLUDE", lines: [{ description: "ขาย", qty: 1, unitPrice: 10_000 }],
  });
  const iss9 = await acc.issueDocument(tenantId, systemId, ti9.id);
  chk("T9", "ออกใบกำกับภาษีได้ทั้งที่ผู้ขายไม่มีเลขภาษีใน settings (ใบไม่ครบ ม.86/4(2))",
    (iss9 as { ok: boolean }).ok, JSON.stringify(iss9));

  console.log("\nสรุป:", results.filter((r) => r.ok).length, "/", results.length, "ยืนยันได้");
} catch (e) {
  console.error("CRASH:", e);
} finally {
  if (tenantId) {
    const del = async (n: string, fn: () => Promise<unknown>) => { try { await fn(); } catch (e) { console.log(` ⚠ cleanup ${n}: ${e instanceof Error ? e.message : e}`); } };
    await del("journalLine", () => prisma.accountJournalLine.deleteMany({ where: { tenantId } }));
    await del("depreciation", () => prisma.accountDepreciation.deleteMany({ where: { tenantId } }));
    await del("entry", () => prisma.accountJournalEntry.deleteMany({ where: { tenantId } }));
    await del("payment", () => prisma.accountDocumentPayment.deleteMany({ where: { tenantId } }));
    await del("relation", () => prisma.accountDocumentRelation.deleteMany({ where: { tenantId } }));
    await del("line", () => prisma.accountDocumentLine.deleteMany({ where: { tenantId } }));
    await del("fixedAsset", () => prisma.accountFixedAsset.deleteMany({ where: { tenantId } }));
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
    await del("user", () => prisma.user.deleteMany({ where: { email: { endsWith: "@qc.local" }, name: "CPA QC" } }));
    await del("tenant", () => prisma.tenant.delete({ where: { id: tenantId } }));
    console.log("[cleanup] ลบ test tenant แล้ว");
  }
  await prisma.$disconnect();
}
