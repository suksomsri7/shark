// QC7 — CPA audit harness (ต้นตอร่วม R-A..R-D + C1..C7 + M1..M8 ฝั่งบัญชี)
// ทำบัญชีจริงบน Neon ผ่าน service layer → assert → cleanup tenant ทิ้ง (รันซ้ำได้)
// รัน: cd /root/projects/shark-in-th && pnpm exec tsx scripts/qc-account-qc7.mts
// กติกา: fail ก่อนแก้ → pass หลังแก้ · ห้ามแก้ oracle qc-account-cpa.mts
process.loadEnvFile(".env");
try { process.loadEnvFile(".env.local"); } catch {}

const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
const acc = await import("@/lib/modules/account/service");
const exp = await import("@/lib/modules/account/expense");
const gl = await import("@/lib/modules/account/gl");
const rep = await import("@/lib/modules/account/reports");
const wht = await import("@/lib/modules/account/wht");
const cq = await import("@/lib/modules/account/cheque");

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
  chk(id, name, false, "ทำงานได้", `error: ${e instanceof Error ? e.message : String(e)}`, "CRITICAL");
}

let tenantId = "";
let userId = "";

async function balances(systemId: string): Promise<Map<string, number>> {
  const rows = await prisma.accountJournalLine.groupBy({ by: ["accountId"], where: { systemId }, _sum: { debit: true, credit: true } });
  const leds = await prisma.accountLedger.findMany({ where: { systemId }, select: { id: true, code: true } });
  const codeById = new Map(leds.map((l) => [l.id, l.code]));
  const m = new Map<string, number>();
  for (const r of rows) {
    const code = codeById.get(r.accountId) ?? "?";
    m.set(code, (m.get(code) ?? 0) + (r._sum.debit ?? 0) - (r._sum.credit ?? 0));
  }
  return m;
}
const net = (m: Map<string, number>, c: string) => m.get(c) ?? 0;
const VALID_TAX = "0105561000003"; // ผ่าน mod-11

try {
  console.log("── setup ──");
  const t = await prisma.tenant.create({ data: { name: "QC7 บัญชี", slug: "qc7-" + Date.now() } });
  tenantId = t.id;
  const u = await prisma.user.create({ data: { email: `qc7-${Date.now()}@qc.local`, name: "QC7" } });
  userId = u.id;
  await prisma.membership.create({ data: { userId, tenantId, role: "OWNER", unitAccess: ["*"] } });
  const mkSys = async (name: string) => {
    const s = await sys.createSystem(tenantId, "ACCOUNT", name);
    await acc.saveSettings(tenantId, s.id, { orgName: "QC7", taxId: VALID_TAX, vatRegistered: true, vatRateBp: 700, taxPointBasis: "ON_ISSUE" });
    await gl.ensureAccounting({ tenantId, systemId: s.id });
    return s.id;
  };
  const P = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);

  // ═══════════ C1 · R-A: void payment (บริการ ON_PAYMENT) → TI VOIDED + VAT กลับ ═══════════
  console.log("\n── C1: voidPayment cascade → TAX_INVOICE + VAT (ภพ.30) ──");
  try {
    const s = await mkSys("C1");
    const cust = await acc.createContact({ tenantId, systemId: s, kind: "CUSTOMER", legalType: "COMPANY", name: "ลูกค้า C1", taxId: "0105561111111" });
    const inv = await acc.createDocument({ tenantId, systemId: s, docType: "INVOICE", contactId: cust.id, vatMode: "EXCLUDE", vatTiming: "ON_PAYMENT", lines: [{ description: "บริการ", qty: 1, unitPrice: 100_000 }] });
    await acc.issueDocument(tenantId, s, inv.id);
    await acc.recordPayment(tenantId, s, inv.id, { channel: "TRANSFER", amount: 107_000 });
    let b = await balances(s);
    chkAmt("C1.0", "หลังรับเงิน: 2200 = 70 (VAT รับรู้)", -7_000, net(b, "2200"));
    const ti = await prisma.accountDocument.findFirst({ where: { systemId: s, docType: "TAX_INVOICE", sourceDocId: inv.id } });
    const pay = await prisma.accountDocumentPayment.findFirst({ where: { systemId: s, documentId: inv.id, voidedAt: null } });
    const vd = pay ? await acc.voidPayment(tenantId, s, inv.id, pay.id, "เช็คเด้ง") : { ok: false };
    chk("C1.1", "voidPayment สำเร็จ", (vd as { ok: boolean }).ok, "ok", JSON.stringify(vd));
    b = await balances(s);
    chkAmt("C1.2", "void → 2200 กลับเป็น 0 (ไม่งั้น ภพ.30 เกินจริง)", 0, net(b, "2200"));
    chkAmt("C1.3", "void → 2210 กลับมาค้าง 70", -7_000, net(b, "2210"));
    const tiAfter = await prisma.accountDocument.findFirst({ where: { id: ti?.id ?? "" }, select: { status: true } });
    chk("C1.4", "ใบกำกับของ payment ถูก VOID", tiAfter?.status === "VOIDED" || tiAfter?.status === "CANCELLED", "VOIDED", String(tiAfter?.status));
    const pp = await rep.pp30({ tenantId, systemId: s }, P);
    chkAmt("C1.5", "ภพ.30 ภาษีขาย = 0 (ไม่นับใบกำกับเช็คเด้ง)", 0, pp.output.total);
  } catch (e) { crash("C1.x", "C1", e); }

  // ═══════════ C2 · R-A: voidVendorPayment → WHT_CERT VOIDED + ภงด.53 = 0 ═══════════
  console.log("\n── C2: voidVendorPayment cascade → WHT_CERT + ภงด.53 ──");
  try {
    const s = await mkSys("C2");
    const vend = await acc.createContact({ tenantId, systemId: s, kind: "VENDOR", legalType: "COMPANY", name: "ผู้ขาย C2", taxId: "0105562222222" });
    const ex = await exp.createExpenseDoc({ tenantId, systemId: s, docType: "EXPENSE", contactId: vend.id, vatMode: "EXCLUDE", vatPurchaseMode: "CLAIM", lines: [{ description: "บริการ", qty: 1, unitPrice: 100_000 }] });
    await exp.issueExpenseDoc(tenantId, s, ex.id);
    await exp.recordVendorPayment(tenantId, s, ex.id, { amount: 104_000, whtAmountSatang: 3_000, whtRateBp: 300, whtIncomeType: "M40_8", channel: "TRANSFER" });
    let p53 = await wht.pnd(tenantId, s, { type: 53, period: P });
    chkAmt("C2.0", "หลังจ่าย: ภงด.53 = 30", 3_000, p53.grandWht);
    const pay = await prisma.accountDocumentPayment.findFirst({ where: { systemId: s, documentId: ex.id, voidedAt: null }, select: { id: true, whtCertDocId: true } });
    const vv = pay ? await exp.voidVendorPayment(tenantId, s, ex.id, pay.id, "เช็คถูกยกเลิก") : { ok: false };
    chk("C2.1", "voidVendorPayment สำเร็จ", (vv as { ok: boolean }).ok, "ok", JSON.stringify(vv));
    const cert = await prisma.accountDocument.findFirst({ where: { id: pay?.whtCertDocId ?? "" }, select: { status: true } });
    chk("C2.2", "WHT_CERT ถูก VOID", cert?.status === "VOIDED", "VOIDED", String(cert?.status));
    p53 = await wht.pnd(tenantId, s, { type: 53, period: P });
    chkAmt("C2.3", "ภงด.53 หลัง void = 0 (ไม่นำส่งบนเงินที่ไม่ได้จ่าย)", 0, p53.grandWht);
    const payAfter = await prisma.accountDocumentPayment.findFirst({ where: { id: pay?.id ?? "" }, select: { whtCertDocId: true } });
    chk("C2.4", "payment.whtCertDocId ถูกล้าง", payAfter?.whtCertDocId === null, "null", String(payAfter?.whtCertDocId));
  } catch (e) { crash("C2.x", "C2", e); }

  // ═══════════ C3: auto 50 ทวิ ใช้ pay.paidAt (WHT ตกงวดถูกเดือน) ═══════════
  console.log("\n── C3: 50 ทวิ ใช้ paidAt ไม่ใช่ new Date() ──");
  try {
    const s = await mkSys("C3");
    const vend = await acc.createContact({ tenantId, systemId: s, kind: "VENDOR", legalType: "COMPANY", name: "ผู้ขาย C3", taxId: "0105562222222" });
    const ex = await exp.createExpenseDoc({ tenantId, systemId: s, docType: "EXPENSE", contactId: vend.id, vatMode: "NONE", vatPurchaseMode: "NO_CLAIM", lines: [{ description: "ค่าจ้าง", qty: 1, unitPrice: 100_000 }] });
    await exp.issueExpenseDoc(tenantId, s, ex.id);
    const backdate = new Date(Date.now() - 40 * 24 * 3600 * 1000); // 40 วันก่อน
    await exp.recordVendorPayment(tenantId, s, ex.id, { amount: 97_000, whtAmountSatang: 3_000, whtRateBp: 300, whtIncomeType: "M40_8", channel: "TRANSFER", paidAt: backdate });
    const pay = await prisma.accountDocumentPayment.findFirst({ where: { systemId: s, documentId: ex.id }, select: { whtCertDocId: true, paidAt: true } });
    const cert = await prisma.accountDocument.findFirst({ where: { id: pay?.whtCertDocId ?? "" }, select: { issueDate: true } });
    const same = cert && pay && cert.issueDate.toISOString().slice(0, 10) === pay.paidAt.toISOString().slice(0, 10);
    chk("C3.1", "50 ทวิ issueDate == paidAt (งวด ภงด. ถูกเดือน)", !!same, "วันเดียวกับ paidAt", `cert=${cert?.issueDate.toISOString().slice(0, 10)} paidAt=${pay?.paidAt.toISOString().slice(0, 10)}`);
  } catch (e) { crash("C3.x", "C3", e); }

  // ═══════════ C4: CN มีข้อมูลอ้างใบเดิม + adjustReason (สำหรับ print ม.86/10) ═══════════
  console.log("\n── C4: CN print refs (relationsTo + adjustReason) ──");
  try {
    const s = await mkSys("C4");
    const cust = await acc.createContact({ tenantId, systemId: s, kind: "CUSTOMER", legalType: "COMPANY", name: "ลูกค้า C4", taxId: "0105561111111" });
    const inv = await acc.createDocument({ tenantId, systemId: s, docType: "INVOICE", contactId: cust.id, vatMode: "EXCLUDE", vatTiming: "ON_ISSUE", lines: [{ description: "สินค้า", qty: 1, unitPrice: 100_000 }] });
    const iss = await acc.issueDocument(tenantId, s, inv.id);
    const cn = await acc.createDocument({ tenantId, systemId: s, docType: "CREDIT_NOTE", contactId: cust.id, sourceDocId: inv.id, adjustReason: "สินค้าชำรุด", vatMode: "EXCLUDE", lines: [{ description: "รับคืน", qty: 1, unitPrice: 50_000 }] });
    await acc.issueDocument(tenantId, s, cn.id);
    const full = await acc.getDocument(tenantId, s, cn.id);
    // print page resolve ใบเดิมผ่าน sourceDocId → docNo + issueDate
    const orig = full?.sourceDocId ? await acc.getDocument(tenantId, s, full.sourceDocId) : null;
    chk("C4.1", "CN อ้างใบกำกับเดิมได้ (docNo+issueDate ผ่าน sourceDocId)", !!orig?.docNo && !!orig?.issueDate, "มี docNo/issueDate ใบเดิม", orig ? `${orig.docNo}` : "ไม่พบใบเดิม");
    chk("C4.2", "CN มี adjustReason (ม.86/10)", !!full?.adjustReason, "มีเหตุผล", String(full?.adjustReason));
  } catch (e) { crash("C4.x", "C4", e); }

  // ═══════════ C5 · R-B: createCheque(documentId) ตัดหนี้เอกสารจริง ═══════════
  console.log("\n── C5: ทะเบียนเช็ครับ ผูก documentId → ตัดหนี้ ──");
  let c6sys = "", c6exId = "";
  try {
    const s = await mkSys("C5");
    const cust = await acc.createContact({ tenantId, systemId: s, kind: "CUSTOMER", legalType: "COMPANY", name: "ลูกค้า C5", taxId: "0105561111111" });
    const inv = await acc.createDocument({ tenantId, systemId: s, docType: "INVOICE", contactId: cust.id, vatMode: "EXCLUDE", vatTiming: "ON_ISSUE", lines: [{ description: "สินค้า", qty: 1, unitPrice: 100_000 }] });
    await acc.issueDocument(tenantId, s, inv.id);
    const c = await cq.createCheque({ tenantId, systemId: s, direction: "IN", chequeNo: "CQ-C5", bankName: "KBank", chequeDate: new Date(), amount: 107_000, documentId: inv.id } as never);
    chk("C5.1", "createCheque(documentId) สำเร็จ", (c as { ok: boolean }).ok, "ok", JSON.stringify(c));
    const b = await balances(s);
    chkAmt("C5.2", "Dr 1040 เช็ครับ = 1,070", 107_000, net(b, "1040"));
    chkAmt("C5.3", "Cr 1100 → ลูกหนี้เหลือ 0 (ตัดหนี้ GL)", 0, net(b, "1100"));
    const invAfter = await prisma.accountDocument.findFirst({ where: { id: inv.id }, select: { status: true, paidTotal: true } });
    chk("C5.4", "เอกสาร invoice = PAID/paidTotal ครบ (sub-ledger ตรง GL)", invAfter?.status === "PAID" && invAfter?.paidTotal === 107_000, "PAID/1,070", `${invAfter?.status}/${bt(invAfter?.paidTotal ?? 0)}`);
    const ov = await acc.overviewStats(tenantId, s);
    chkAmt("C5.5", "overviewStats.receivable = 0 (ตรง GL)", 0, ov.receivable);
    // M8: บรรทัด AR มี contactId
    const arLine = await prisma.accountJournalLine.findFirst({ where: { systemId: s, contactId: cust.id, account: { code: "1100" } }, select: { id: true } });
    chk("M8.1", "บรรทัดAR ของเช็คมี contactId (subledger รายคู่ค้า)", !!arLine, "มี contactId", arLine ? "มี" : "ไม่มี");
    // M7: entry ref AccountCheque
    const cheque = await prisma.accountCheque.findFirst({ where: { systemId: s, chequeNo: "CQ-C5" }, select: { id: true } });
    const ent = await prisma.accountJournalEntry.findFirst({ where: { systemId: s, refType: "AccountCheque", refId: cheque?.id ?? "" }, select: { id: true } });
    chk("M7.1", "entry เช็ค refType=AccountCheque refId=chequeId (trace/idempotent)", !!ent, "มี entry AccountCheque", ent ? "มี" : "ไม่มี");
  } catch (e) { crash("C5.x", "C5", e); }

  // ═══════════ C6 · R-B: createCheque OUT ผูก doc → ตัดทางจ่ายซ้ำ ═══════════
  console.log("\n── C6: เช็คจ่าย ผูก doc → กันจ่ายซ้ำสองทาง ──");
  try {
    const s = await mkSys("C6");
    const vend = await acc.createContact({ tenantId, systemId: s, kind: "VENDOR", legalType: "COMPANY", name: "ผู้ขาย C6", taxId: "0105562222222" });
    const ex = await exp.createExpenseDoc({ tenantId, systemId: s, docType: "EXPENSE", contactId: vend.id, vatMode: "EXCLUDE", lines: [{ description: "ค่าเช่า", qty: 1, unitPrice: 50_000 }] });
    await exp.issueExpenseDoc(tenantId, s, ex.id);
    const c = await cq.createCheque({ tenantId, systemId: s, direction: "OUT", chequeNo: "PD-C6", bankName: "KBank", chequeDate: new Date(), amount: 53_500, documentId: ex.id } as never);
    chk("C6.1", "createCheque OUT(documentId) สำเร็จ", (c as { ok: boolean }).ok, "ok", JSON.stringify(c));
    const b = await balances(s);
    chkAmt("C6.2", "Dr 2100 ล้างเจ้าหนี้ → 0", 0, net(b, "2100"));
    chkAmt("C6.3", "Cr 2300 เช็คจ่ายรอเรียกเก็บ = 535", -53_500, net(b, "2300"));
    const exAfter = await prisma.accountDocument.findFirst({ where: { id: ex.id }, select: { status: true } });
    chk("C6.4", "เอกสาร expense = PAID (ตัดทางจ่ายซ้ำ)", exAfter?.status === "PAID", "PAID", String(exAfter?.status));
    const dbl = await exp.recordVendorPayment(tenantId, s, ex.id, { channel: "TRANSFER", amount: 53_500 });
    chk("C6.5", "จ่ายซ้ำผ่านหน้าเอกสารถูกกัน (2100 ไม่ติด Dr)", !(dbl as { ok: boolean }).ok, "ปฏิเสธ", JSON.stringify(dbl));
  } catch (e) { crash("C6.x", "C6", e); }

  // ═══════════ M6: recordPayment/recordVendorPayment channel=CHEQUE → 1040/2300 ไม่ใช่ 1010 ═══════════
  console.log("\n── M6: channel=CHEQUE พัก 1040/2300 (เช็คยังไม่ขึ้นเงิน) ──");
  try {
    const s = await mkSys("M6");
    const cust = await acc.createContact({ tenantId, systemId: s, kind: "CUSTOMER", legalType: "COMPANY", name: "ลูกค้า M6", taxId: "0105561111111" });
    const vend = await acc.createContact({ tenantId, systemId: s, kind: "VENDOR", legalType: "COMPANY", name: "ผู้ขาย M6", taxId: "0105562222222" });
    const inv = await acc.createDocument({ tenantId, systemId: s, docType: "INVOICE", contactId: cust.id, vatMode: "EXCLUDE", vatTiming: "ON_PAYMENT", lines: [{ description: "บริการ", qty: 1, unitPrice: 100_000 }] });
    await acc.issueDocument(tenantId, s, inv.id);
    await acc.recordPayment(tenantId, s, inv.id, { channel: "CHEQUE", amount: 107_000 });
    let b = await balances(s);
    chkAmt("M6.1", "รับเช็ค: ไม่เข้า 1010 ทันที", 0, net(b, "1010"));
    chkAmt("M6.2", "รับเช็ค: พัก 1040 = 1,070", 107_000, net(b, "1040"));
    const ex = await exp.createExpenseDoc({ tenantId, systemId: s, docType: "EXPENSE", contactId: vend.id, vatMode: "EXCLUDE", lines: [{ description: "ค่าบริการ", qty: 1, unitPrice: 100_000 }] });
    await exp.issueExpenseDoc(tenantId, s, ex.id);
    await exp.recordVendorPayment(tenantId, s, ex.id, { channel: "CHEQUE", amount: 107_000 });
    b = await balances(s);
    chkAmt("M6.3", "จ่ายเช็ค: พัก 2300 = 1,070 (ไม่ Cr 1010 ทันที)", -107_000, net(b, "2300"));
  } catch (e) { crash("M6.x", "M6", e); }

  // ═══════════ C7 · R-D: public link → คำขอ DRAFT (staff อนุมัติก่อน) ═══════════
  console.log("\n── C7: public link บันทึกเป็นคำขอ (ไม่ jump ISSUED+post GL) ──");
  try {
    const s = await mkSys("C7");
    const rc = await acc.createDocument({ tenantId, systemId: s, docType: "RECEIPT", contactId: null, vatMode: "INCLUDE", lines: [{ description: "ขายสด", qty: 1, unitPrice: 32_100 }] });
    await acc.issueDocument(tenantId, s, rc.id);
    const link = await acc.ensurePublicTaxInvoiceLink(tenantId, s, rc.id);
    const before = await balances(s);
    const pub = link.ok ? await acc.issuePublicTaxInvoice(link.token, { name: "บจก. ผู้ซื้อ", taxId: VALID_TAX }) : { ok: false as const };
    chk("C7.1", "public request สำเร็จ", (pub as { ok: boolean }).ok, "ok", JSON.stringify(pub));
    const ti = await prisma.accountDocument.findFirst({ where: { systemId: s, docType: "TAX_INVOICE", sourceDocId: rc.id } });
    chk("C7.2", "public สร้างเป็น DRAFT (ยังไม่ ISSUED/จองเลข)", ti?.status === "DRAFT" && !ti?.docNo, "DRAFT/ไม่มีเลข", `${ti?.status}/${ti?.docNo}`);
    const after = await balances(s);
    const entTi = ti ? await prisma.accountJournalEntry.count({ where: { systemId: s, refType: "AccountDocument", refId: ti.id } }) : -1;
    chk("C7.3", "public ยังไม่ post GL (0 entry ของ TI)", entTi === 0, "0 entry", String(entTi));
    // staff อนุมัติ = issueDocument → ISSUED + จองเลข
    const staffIss = ti ? await acc.issueDocument(tenantId, s, ti.id) : { ok: false };
    chk("C7.4", "staff อนุมัติ (issueDocument) → ออกเลขได้", (staffIss as { ok: boolean }).ok, "ok", JSON.stringify(staffIss));
    const tiAfter = await prisma.accountDocument.findFirst({ where: { id: ti?.id ?? "" }, select: { status: true, docNo: true } });
    chk("C7.5", "หลังอนุมัติ = ISSUED + มีเลข", tiAfter?.status === "ISSUED" && !!tiAfter?.docNo, "ISSUED+เลข", `${tiAfter?.status}/${tiAfter?.docNo}`);
    // M1: ขอซ้ำ → idempotent (ไม่เกิดใบที่ 2)
    const pub2 = link.ok ? await acc.issuePublicTaxInvoice(link.token, { name: "บจก. ผู้ซื้อ", taxId: VALID_TAX }) : { ok: false as const };
    const tiCount = await prisma.accountDocument.count({ where: { systemId: s, docType: "TAX_INVOICE", sourceDocId: rc.id, status: { notIn: ["VOIDED", "CANCELLED"] } } });
    chk("M1.1", "public ขอซ้ำ idempotent → ใบเดียว", tiCount === 1, "1 ใบ", `${tiCount} ใบ (pub2=${JSON.stringify(pub2)})`);
  } catch (e) { crash("C7.x", "C7", e); }

  // ═══════════ M2: mod-11 taxId + gate settings.taxId ═══════════
  console.log("\n── M2: validate เลขภาษี mod-11 + gate ผู้ขายต้องมี taxId ──");
  try {
    const s = await mkSys("M2");
    let rejected = false;
    try { await acc.createContact({ tenantId, systemId: s, kind: "VENDOR", name: "เลขสั้น", taxId: "12345" }); } catch { rejected = true; }
    chk("M2.1", "createContact ปฏิเสธ taxId ผิดรูปแบบ (12345)", rejected, "ปฏิเสธ", rejected ? "ปฏิเสธ" : "ยอมรับ");
    const rc = await acc.createDocument({ tenantId, systemId: s, docType: "RECEIPT", contactId: null, vatMode: "INCLUDE", lines: [{ description: "ขายสด", qty: 1, unitPrice: 10_700 }] });
    await acc.issueDocument(tenantId, s, rc.id);
    const link = await acc.ensurePublicTaxInvoiceLink(tenantId, s, rc.id);
    const badPub = link.ok ? await acc.issuePublicTaxInvoice(link.token, { name: "ผิด checksum", taxId: "1111111111111" }) : { ok: false as const };
    chk("M2.2", "public ปฏิเสธ taxId checksum ผิด (1111111111111)", !(badPub as { ok: boolean }).ok, "ปฏิเสธ", JSON.stringify(badPub));
    // gate: ผู้ขายไม่มี taxId → ออกใบกำกับไม่ได้
    await acc.saveSettings(tenantId, s, { orgName: "QC7", taxId: null, vatRegistered: true, vatRateBp: 700 });
    const cust = await acc.createContact({ tenantId, systemId: s, kind: "CUSTOMER", legalType: "COMPANY", name: "ลูกค้า M2", taxId: "0105561111111" });
    const ti = await acc.createDocument({ tenantId, systemId: s, docType: "TAX_INVOICE", contactId: cust.id, vatMode: "EXCLUDE", lines: [{ description: "ขาย", qty: 1, unitPrice: 10_000 }] });
    const iss = await acc.issueDocument(tenantId, s, ti.id);
    chk("M2.3", "ออกใบกำกับถูกกันเมื่อผู้ขายไม่มีเลขภาษี (ม.86/4(2))", !(iss as { ok: boolean }).ok, "ปฏิเสธ", JSON.stringify(iss));
  } catch (e) { crash("M2.x", "M2", e); }

  // ═══════════ M3: convert DEPOSIT_RECEIPT → TAX_INVOICE ═══════════
  console.log("\n── M3: ออกใบกำกับจากใบรับมัดจำ ──");
  try {
    const s = await mkSys("M3");
    const cust = await acc.createContact({ tenantId, systemId: s, kind: "CUSTOMER", legalType: "COMPANY", name: "ลูกค้า M3", taxId: "0105561111111" });
    const dep = await acc.createDocument({ tenantId, systemId: s, docType: "DEPOSIT_RECEIPT", contactId: cust.id, vatMode: "INCLUDE", lines: [{ description: "มัดจำ", qty: 1, unitPrice: 107_000 }] });
    await acc.issueDocument(tenantId, s, dep.id);
    await acc.recordPayment(tenantId, s, dep.id, { amount: 107_000, channel: "TRANSFER" });
    const cv = await acc.convertDocument(tenantId, s, dep.id, "TAX_INVOICE", userId);
    chk("M3.1", "convert DEPOSIT_RECEIPT → TAX_INVOICE ได้", (cv as { ok: boolean }).ok, "ok", JSON.stringify(cv));
    if ((cv as { ok: boolean }).ok) {
      const tid = (cv as { newId: string }).newId;
      const before = await balances(s);
      await acc.issueDocument(tenantId, s, tid);
      const after = await balances(s);
      chkAmt("M3.2", "ใบกำกับมัดจำ GL-neutral (VAT รับรู้ตอนรับมัดจำแล้ว, Δ2200=0)", net(before, "2200"), net(after, "2200"));
    }
  } catch (e) { crash("M3.x", "M3", e); }

  // ═══════════ M4: freeze legalType (ภงด. 3/53 ไม่ขยับย้อนหลัง) ═══════════
  console.log("\n── M4: freeze legalType ลง snapshot ──");
  try {
    const s = await mkSys("M4");
    const person = await acc.createContact({ tenantId, systemId: s, kind: "VENDOR", legalType: "PERSON", name: "นายบุคคล M4", taxId: "1111111111111" });
    const ex = await exp.createExpenseDoc({ tenantId, systemId: s, docType: "EXPENSE", contactId: person.id, vatMode: "NONE", vatPurchaseMode: "NO_CLAIM", lines: [{ description: "ค่าจ้าง", qty: 1, unitPrice: 100_000 }] });
    await exp.issueExpenseDoc(tenantId, s, ex.id);
    await exp.recordVendorPayment(tenantId, s, ex.id, { amount: 97_000, whtAmountSatang: 3_000, whtRateBp: 300, whtIncomeType: "M40_8", channel: "TRANSFER" });
    const p3a = await wht.pnd(tenantId, s, { type: 3, period: P });
    chkAmt("M4.0", "ภงด.3 (บุคคล) ก่อนแก้ = 30", 3_000, p3a.grandWht);
    await acc.updateContact(tenantId, s, person.id, { legalType: "COMPANY" });
    const p3b = await wht.pnd(tenantId, s, { type: 3, period: P });
    chkAmt("M4.1", "แก้ legalType ย้อนหลัง → ภงด.3 ยังคง 30 (freeze snapshot)", 3_000, p3b.grandWht);
  } catch (e) { crash("M4.x", "M4", e); }

  // ═══════════ M5: CSV ภงด ฐานจริง + คอลัมน์ address/เงื่อนไข ═══════════
  console.log("\n── M5: ฐานเงินได้จริง + คอลัมน์ที่อยู่/เงื่อนไข ──");
  try {
    const s = await mkSys("M5");
    const vend = await acc.createContact({ tenantId, systemId: s, kind: "VENDOR", legalType: "COMPANY", name: "ผู้ขาย M5", taxId: "0105562222222", address: "1 ถ.ทดสอบ กทม" });
    const ex = await exp.createExpenseDoc({ tenantId, systemId: s, docType: "EXPENSE", contactId: vend.id, vatMode: "NONE", vatPurchaseMode: "NO_CLAIM", lines: [{ description: "ค่าบริการเศษสตางค์", qty: 1, unitPrice: 100_010 }] });
    await exp.issueExpenseDoc(tenantId, s, ex.id);
    await exp.recordVendorPayment(tenantId, s, ex.id, { amount: 97_010, whtAmountSatang: 3_000, whtRateBp: 300, whtIncomeType: "M40_8", channel: "TRANSFER" });
    const pay = await prisma.accountDocumentPayment.findFirst({ where: { systemId: s, documentId: ex.id }, select: { whtCertDocId: true } });
    const cert = await prisma.accountDocument.findFirst({ where: { id: pay?.whtCertDocId ?? "" }, select: { subTotal: true } });
    chkAmt("M5.1", "ฐานเงินได้บน 50 ทวิ = ยอดจ่ายจริง 1,000.10 (ไม่ย้อนจาก rate)", 100_010, cert?.subTotal ?? -1);
    const csv = await wht.pndCsv(tenantId, s, { type: 53, period: P });
    const header = csv.replace(/^﻿/, "").split("\n")[0];
    chk("M5.2", "CSV มีคอลัมน์ ที่อยู่", header.includes("ที่อยู่"), "มี 'ที่อยู่'", header);
    chk("M5.3", "CSV มีคอลัมน์ เงื่อนไขการหัก", header.includes("เงื่อนไข"), "มี 'เงื่อนไข'", header);
    chk("M5.4", "CSV แถวมีที่อยู่ผู้รับ", csv.includes("ถ.ทดสอบ"), "มีที่อยู่", "ไม่มี");
  } catch (e) { crash("M5.x", "M5", e); }

} catch (e) {
  console.error("SCRIPT ERROR:", e);
} finally {
  console.log("\n── cleanup ──");
  const del = async (name: string, fn: () => Promise<unknown>) => { try { await fn(); } catch (e) { console.log(`  ⚠ ${name}: ${e instanceof Error ? e.message : e}`); } };
  if (tenantId) {
    await del("journalLine", () => prisma.accountJournalLine.deleteMany({ where: { tenantId } }));
    await del("entry.unlink", () => prisma.accountJournalEntry.updateMany({ where: { tenantId }, data: { reversalOfId: null } }));
    await del("entry", () => prisma.accountJournalEntry.deleteMany({ where: { tenantId } }));
    await del("payment.unlink", () => prisma.accountDocumentPayment.updateMany({ where: { tenantId }, data: { chequeId: null, whtCertDocId: null } }));
    await del("payment", () => prisma.accountDocumentPayment.deleteMany({ where: { tenantId } }));
    await del("cheque", () => prisma.accountCheque.deleteMany({ where: { tenantId } }));
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
  if (userId) { try { await prisma.user.delete({ where: { id: userId } }); } catch {} }
  console.log("[cleanup] เสร็จ");
  const bad = findings.filter((f) => !f.ok);
  console.log(`\n═══ QC7: ${findings.length} checks · pass ${findings.length - bad.length} · fail ${bad.length} ═══`);
  for (const f of bad) console.log(`  [${f.sev}] ${f.id} ${f.name} — expected ${f.expected} | actual ${f.actual}`);
  console.log("JSON_SUMMARY " + JSON.stringify({ total: findings.length, passed: findings.length - bad.length }));
  await prisma.$disconnect();
  process.exit(0);
}
