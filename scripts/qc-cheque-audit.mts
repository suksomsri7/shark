// QC — CPA audit: ระบบเช็ครับ/เช็คจ่าย (cheque.ts) + tax point + WHT + net-zero + reports
// รัน: cd /root/projects/shark-in-th && pnpm exec tsx /tmp/qc-cheque-audit.mts
// สร้าง tenant ทดสอบใหม่ + ลบทิ้งตอนจบเสมอ · ห้ามแก้ไฟล์ repo
process.loadEnvFile(".env");
try { process.loadEnvFile(".env.local"); } catch {}

const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
const acc = await import("@/lib/modules/account/service");
const exp = await import("@/lib/modules/account/expense");
const gl = await import("@/lib/modules/account/gl");
const rep = await import("@/lib/modules/account/reports");
const whtm = await import("@/lib/modules/account/wht");
const cq = await import("@/lib/modules/account/cheque");

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const findings: { id: string; ok: boolean; name: string; expected: string; actual: string; sev: Sev }[] = [];
const bt = (s: number) => (s / 100).toLocaleString("th-TH", { minimumFractionDigits: 2 });
function chk(id: string, name: string, ok: boolean, expected: string, actual: string, sev: Sev = "MAJOR") {
  findings.push({ id, ok, name, expected, actual, sev });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${ok ? "" : ` — expected ${expected} | actual ${actual}`}`);
}
const chkAmt = (id: string, name: string, e: number, a: number, sev: Sev = "MAJOR") =>
  chk(id, name, e === a, `฿${bt(e)}`, `฿${bt(a)}`, sev);

let tenantId = "";
let userId = "";

async function balances(systemId: string): Promise<Map<string, number>> {
  const rows = await prisma.accountJournalLine.groupBy({
    by: ["accountId"], where: { systemId }, _sum: { debit: true, credit: true },
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
const net = (m: Map<string, number>, c: string) => m.get(c) ?? 0;

async function entryCount(systemId: string) {
  return prisma.accountJournalEntry.count({ where: { systemId } });
}

try {
  console.log("── setup: tenant + 2 systems ──");
  const t = await prisma.tenant.create({ data: { name: "QC เช็ค (CPA)", slug: "qc-cheque-" + Date.now() } });
  tenantId = t.id;
  const u = await prisma.user.create({ data: { email: `qc-cheque-${Date.now()}@qc.local`, name: "CPA" } });
  userId = u.id;
  await prisma.membership.create({ data: { userId, tenantId, role: "OWNER", unitAccess: ["*"] } });

  const s1 = await sys.createSystem(tenantId, "ACCOUNT", "ระบบ1-ทะเบียนเช็ค");
  const s2 = await sys.createSystem(tenantId, "ACCOUNT", "ระบบ2-VAT/WHT");
  for (const sid of [s1.id, s2.id]) {
    await acc.saveSettings(tenantId, sid, {
      orgName: "QC เช็ค", taxId: "0105561000000", vatRegistered: true, vatRateBp: 700, taxPointBasis: "ON_ISSUE",
    });
    await gl.ensureAccounting({ tenantId, systemId: sid });
  }
  const cust1 = await acc.createContact({ tenantId, systemId: s1.id, kind: "CUSTOMER", legalType: "COMPANY", name: "บจก. ลูกค้า1", taxId: "0105561111111", branchCode: "00000" });
  const vend1 = await acc.createContact({ tenantId, systemId: s1.id, kind: "VENDOR", legalType: "COMPANY", name: "บจก. ผู้ขาย1", taxId: "0105562222222", branchCode: "00000" });
  const cust2 = await acc.createContact({ tenantId, systemId: s2.id, kind: "CUSTOMER", legalType: "COMPANY", name: "บจก. ลูกค้า2", taxId: "0105563333333", branchCode: "00000" });
  const vend2 = await acc.createContact({ tenantId, systemId: s2.id, kind: "VENDOR", legalType: "COMPANY", name: "บจก. ผู้ขาย2", taxId: "0105564444444", branchCode: "00000" });
  const P = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);

  // ═══════ A) วงจรเช็ครับ (register) + ผูกกับใบแจ้งหนี้จริง ═══════
  console.log("\n── A) เช็ครับ: invoice → รับเช็ค → นำฝาก → เคลียร์ → เด้งหลังเคลียร์ ──");
  const AMT = 107_000; // 1,070.00
  const inv = await acc.createDocument({
    tenantId, systemId: s1.id, docType: "INVOICE", contactId: cust1.id,
    vatMode: "EXCLUDE", vatTiming: "ON_ISSUE",
    lines: [{ description: "ขายสินค้า", qty: 1, unitPrice: 100_000 }],
  });
  await acc.issueDocument(tenantId, s1.id, inv.id);
  let b = await balances(s1.id);
  chkAmt("A0", "หลังออก invoice: GL 1100 = 1,070", AMT, net(b, "1100"), "CRITICAL");

  const c1 = await cq.createCheque({
    tenantId, systemId: s1.id, direction: "IN", chequeNo: "CQ-001", bankName: "KBank",
    chequeDate: new Date(), amount: AMT,
  });
  if (!c1.ok) throw new Error("createCheque IN fail: " + (c1 as { reason: string }).reason);
  b = await balances(s1.id);
  chkAmt("A1", "รับเช็ค: Dr 1040 = 1,070", AMT, net(b, "1040"), "CRITICAL");
  chkAmt("A2", "รับเช็ค: Cr 1100 → AR เหลือ 0", 0, net(b, "1100"), "CRITICAL");
  // เอกสาร invoice ควรถูกตัดเป็นชำระแล้ว?
  const invAfter = await prisma.accountDocument.findFirst({ where: { id: inv.id }, select: { status: true, paidTotal: true } });
  chk("A3", "ทะเบียนเช็คตัดหนี้ใน GL แล้ว เอกสาร invoice ต้องไม่ค้างชำระ (sub-ledger ตรง GL)",
    invAfter?.status === "PAID" || (invAfter?.paidTotal ?? 0) === AMT,
    "PAID/paidTotal=1,070", `${invAfter?.status}/paidTotal=${bt(invAfter?.paidTotal ?? 0)}`, "CRITICAL");
  const stats = await acc.overviewStats(tenantId, s1.id);
  chkAmt("A4", "ยอดค้างรับหน้าจอ (overviewStats) ตรง GL 1100 = 0", net(b, "1100"), stats.receivable, "CRITICAL");

  const sum1 = await cq.chequeSummary(tenantId, s1.id);
  chkAmt("A5", "1040 = เช็ครับคงค้าง (summary.inPending)", net(b, "1040"), sum1.inPending, "MAJOR");

  await cq.depositCheque(tenantId, s1.id, c1.id);
  const ecAfterDep = await entryCount(s1.id);
  b = await balances(s1.id);
  chkAmt("A6", "นำฝาก: ไม่โพสต์ GL เพิ่ม / 1040 คงเดิม", AMT, net(b, "1040"), "MAJOR");

  const cl = await cq.clearCheque(tenantId, s1.id, c1.id);
  chk("A7", "เคลียร์เช็ครับได้", cl.ok, "ok", JSON.stringify(cl), "CRITICAL");
  b = await balances(s1.id);
  chkAmt("A8", "เคลียร์: Dr 1010 = 1,070", AMT, net(b, "1010"), "CRITICAL");
  chkAmt("A9", "เคลียร์: 1040 ล้างเหลือ 0", 0, net(b, "1040"), "CRITICAL");
  const sum2 = await cq.chequeSummary(tenantId, s1.id);
  chkAmt("A10", "หลังเคลียร์ summary.inPending = 0 (ตรง 1040)", 0, sum2.inPending, "MAJOR");

  // เด้งหลังเคลียร์ (ธนาคารดึงเงินคืน)
  const bn = await cq.bounceCheque(tenantId, s1.id, c1.id, "ลายเซ็นไม่ตรง");
  chk("A11", "เด้งหลังเคลียร์ได้", bn.ok, "ok", JSON.stringify(bn), "MAJOR");
  b = await balances(s1.id);
  chkAmt("A12", "เด้ง: Dr 1100 ตั้งลูกหนี้กลับ = 1,070", AMT, net(b, "1100"), "CRITICAL");
  chkAmt("A13", "เด้ง: Cr 1010 ดึงเงินคืน → 1010 = 0", 0, net(b, "1010"), "CRITICAL");
  chkAmt("A14", "เด้ง: 1040 = 0 (net-zero ทั้งวงจร)", 0, net(b, "1040"), "CRITICAL");
  const invAfterBounce = await prisma.accountDocument.findFirst({ where: { id: inv.id }, select: { status: true } });
  chk("A15", "เช็คเด้ง: เอกสาร invoice ต้องกลับเป็นค้างชำระ", invAfterBounce?.status === "AWAITING_PAYMENT",
    "AWAITING_PAYMENT", String(invAfterBounce?.status), "CRITICAL");

  // ═══════ B) เด้งก่อนเคลียร์ + idempotency ═══════
  console.log("\n── B) เด้งก่อนเคลียร์ / กดซ้ำ / เช็คเลขซ้ำ ──");
  const c2 = await cq.createCheque({ tenantId, systemId: s1.id, direction: "IN", chequeNo: "CQ-002", bankName: "SCB", chequeDate: new Date(), amount: 50_000 });
  if (c2.ok) {
    const b0 = net(await balances(s1.id), "1040");
    await cq.bounceCheque(tenantId, s1.id, c2.id, "บัญชีปิด");
    b = await balances(s1.id);
    chkAmt("B1", "เด้งก่อนเคลียร์: Cr 1040 กลับ (Δ1040 = −500)", b0 - 50_000, net(b, "1040"), "CRITICAL");
    const again = await cq.bounceCheque(tenantId, s1.id, c2.id, "ซ้ำ");
    chk("B2", "เด้งซ้ำต้องถูกปฏิเสธ", !again.ok, "ปฏิเสธ", JSON.stringify(again), "MAJOR");
  }
  const c3 = await cq.createCheque({ tenantId, systemId: s1.id, direction: "IN", chequeNo: "CQ-002", bankName: "SCB", chequeDate: new Date(), amount: 50_000 });
  chk("B3", "เลขเช็คซ้ำ (ธนาคารเดิม) ควรถูกกัน/เตือน", !c3.ok, "ปฏิเสธ dup", c3.ok ? "สร้างซ้ำได้" : "ปฏิเสธ", "MINOR");
  if (c3.ok) await cq.bounceCheque(tenantId, s1.id, c3.id, "ล้าง dup ทดสอบ");
  // เคลียร์ซ้ำ
  const c4 = await cq.createCheque({ tenantId, systemId: s1.id, direction: "IN", chequeNo: "CQ-004", bankName: "BBL", chequeDate: new Date(), amount: 10_000 });
  if (c4.ok) {
    await cq.clearCheque(tenantId, s1.id, c4.id);
    const again = await cq.clearCheque(tenantId, s1.id, c4.id);
    chk("B4", "เคลียร์ซ้ำต้องถูกปฏิเสธ", !again.ok, "ปฏิเสธ", JSON.stringify(again), "MAJOR");
  }

  // ═══════ C) Tax point ม.78/1 — รับชำระบริการด้วยเช็ค → เด้ง → จ่ายใหม่ ═══════
  console.log("\n── C) บริการ ON_PAYMENT + ชำระด้วยเช็ค → void (เด้ง) → ชำระใหม่ ──");
  const svc = await acc.createDocument({
    tenantId, systemId: s2.id, docType: "INVOICE", contactId: cust2.id,
    vatMode: "EXCLUDE", vatTiming: "ON_PAYMENT",
    lines: [{ description: "ค่าบริการออกแบบ", qty: 1, unitPrice: 100_000 }],
  });
  await acc.issueDocument(tenantId, s2.id, svc.id);
  let b2 = await balances(s2.id);
  chkAmt("C0", "ออก invoice บริการ: Cr 2210 (VAT รอรับเงิน) = 70", -7_000, net(b2, "2210"), "CRITICAL");

  const pay1 = await acc.recordPayment(tenantId, s2.id, svc.id, { channel: "CHEQUE", amount: 107_000 });
  chk("C1", "recordPayment channel=CHEQUE สำเร็จ", (pay1 as { ok: boolean }).ok, "ok", JSON.stringify(pay1), "CRITICAL");
  b2 = await balances(s2.id);
  chkAmt("C2", "รับเช็ค (ยังไม่เคลียร์): เงินไม่ควรเข้า 1010 ทันที — ควรพัก 1040", 0, net(b2, "1010"), "MAJOR");
  chkAmt("C3", "VAT ขายรับรู้ตอนรับเช็ค: 2200 = 70 (ใบกำกับออกตามงวดรับเงิน)", -7_000, net(b2, "2200"), "MAJOR");
  const ti1 = await prisma.accountDocument.findMany({ where: { systemId: s2.id, docType: "TAX_INVOICE", sourceDocId: svc.id }, select: { id: true, status: true } });
  chk("C4", "ออกใบกำกับภาษี 1 ใบผูก payment", ti1.length === 1, "1 ใบ", `${ti1.length} ใบ`, "MAJOR");

  // เช็คเด้งหลังออกใบกำกับ → ผู้ใช้ทำได้ทางเดียวคือ voidPayment (ทะเบียนเช็คไม่รู้จัก payment)
  const payRow = await prisma.accountDocumentPayment.findFirst({ where: { systemId: s2.id, documentId: svc.id, voidedAt: null } });
  const vd2 = payRow ? await acc.voidPayment(tenantId, s2.id, svc.id, payRow.id, "เช็คเด้ง") : { ok: false, reason: "no payment row" };
  chk("C5", "voidPayment (เช็คเด้ง) สำเร็จ", (vd2 as { ok: boolean }).ok, "ok", JSON.stringify(vd2), "CRITICAL");
  b2 = await balances(s2.id);
  chkAmt("C6", "เช็คเด้ง: VAT ขายต้องถูกกลับ → 2200 = 0 (ไม่งั้น ภพ.30 เกินจริง)", 0, net(b2, "2200"), "CRITICAL");
  chkAmt("C7", "เช็คเด้ง: 2210 ต้องกลับมาค้าง 70 (Cr) รอรับเงินรอบใหม่", -7_000, net(b2, "2210"), "CRITICAL");
  const tiAfterVoid = await prisma.accountDocument.findFirst({ where: { id: ti1[0]?.id }, select: { status: true } });
  chk("C8", "ใบกำกับภาษีของ payment ที่ void ต้องถูกยกเลิก", tiAfterVoid?.status === "VOIDED" || tiAfterVoid?.status === "CANCELLED",
    "VOIDED", String(tiAfterVoid?.status), "CRITICAL");

  // ลูกค้าชำระใหม่ (โอน)
  const pay2 = await acc.recordPayment(tenantId, s2.id, svc.id, { channel: "TRANSFER", amount: 107_000 });
  chk("C9", "ชำระใหม่หลังเด้งได้", (pay2 as { ok: boolean }).ok, "ok", JSON.stringify(pay2), "CRITICAL");
  b2 = await balances(s2.id);
  chkAmt("C10", "หลังชำระใหม่: 2200 = 70 (ห้ามซ้ำเป็น 140)", -7_000, net(b2, "2200"), "CRITICAL");
  chkAmt("C11", "หลังชำระใหม่: 2210 = 0 (ห้ามติด Dr)", 0, net(b2, "2210"), "CRITICAL");
  const pp = await rep.pp30({ tenantId, systemId: s2.id }, P);
  chkAmt("C12", "ภพ.30 ภาษีขายเดือนนี้ = 70 (ไม่นับใบกำกับของเช็คเด้ง)", 7_000, pp.output.total, "CRITICAL");

  // ═══════ D) เช็คจ่าย 2300 + double-relief ═══════
  console.log("\n── D) เช็คจ่าย: expense → ออกเช็ค → เคลียร์ / void / จ่ายซ้ำสองทาง ──");
  const ex1 = await exp.createExpenseDoc({
    tenantId, systemId: s1.id, docType: "EXPENSE", contactId: vend1.id,
    vatMode: "EXCLUDE", lines: [{ description: "ค่าเช่าออฟฟิศ", qty: 1, unitPrice: 50_000 }],
  });
  await exp.issueExpenseDoc(tenantId, s1.id, ex1.id);
  b = await balances(s1.id);
  const ap0 = net(b, "2100");
  chkAmt("D0", "ออก expense: Cr 2100 = 535", -53_500, ap0, "CRITICAL");

  const co1 = await cq.createCheque({ tenantId, systemId: s1.id, direction: "OUT", chequeNo: "PD-001", bankName: "KBank", chequeDate: new Date(), amount: 53_500 });
  chk("D1", "ออกเช็คจ่ายได้", co1.ok, "ok", JSON.stringify(co1), "CRITICAL");
  b = await balances(s1.id);
  chkAmt("D2", "ออกเช็ค: Dr 2100 ล้างเจ้าหนี้ → 2100 = 0", 0, net(b, "2100"), "CRITICAL");
  chkAmt("D3", "ออกเช็ค: Cr 2300 = 535", -53_500, net(b, "2300"), "CRITICAL");
  const exAfter = await prisma.accountDocument.findFirst({ where: { id: ex1.id }, select: { status: true, paidTotal: true } });
  chk("D4", "ทะเบียนเช็คล้าง 2100 แล้ว เอกสาร expense ต้องไม่ค้างจ่าย (sub-ledger ตรง GL)",
    exAfter?.status === "PAID", "PAID", String(exAfter?.status), "CRITICAL");

  // double relief: เอกสารยังค้าง → ผู้ใช้จ่ายผ่านหน้าเอกสารซ้ำได้
  if (exAfter?.status === "AWAITING_PAYMENT") {
    const dbl = await exp.recordVendorPayment(tenantId, s1.id, ex1.id, { channel: "CHEQUE" as never, amount: 53_500 });
    if ((dbl as { ok: boolean }).ok) {
      b = await balances(s1.id);
      chkAmt("D5", "จ่ายซ้ำสองทาง (ทะเบียนเช็ค+หน้าเอกสาร): 2100 ห้ามติด Dr", 0, net(b, "2100"), "CRITICAL");
      // ล้างผล: void payment
      const pr = await prisma.accountDocumentPayment.findFirst({ where: { systemId: s1.id, documentId: ex1.id, voidedAt: null } });
      if (pr) await exp.voidVendorPayment(tenantId, s1.id, ex1.id, pr.id, "QC ล้าง double");
    }
  }

  if (co1.ok) {
    const clo = await cq.clearCheque(tenantId, s1.id, co1.id);
    chk("D6", "เช็คจ่ายถูกเรียกเก็บ", clo.ok, "ok", JSON.stringify(clo), "CRITICAL");
    b = await balances(s1.id);
    chkAmt("D7", "เรียกเก็บ: 2300 = 0", 0, net(b, "2300"), "CRITICAL");
  }
  // void เช็คจ่าย (ยังไม่เรียกเก็บ) → net zero + ตั้งเจ้าหนี้กลับ
  const co2 = await cq.createCheque({ tenantId, systemId: s1.id, direction: "OUT", chequeNo: "PD-002", bankName: "KBank", chequeDate: new Date(), amount: 20_000 });
  if (co2.ok) {
    const before2300 = net(await balances(s1.id), "2300");
    const vo = await cq.voidCheque(tenantId, s1.id, co2.id, "พิมพ์ผิด");
    chk("D8", "void เช็คจ่ายได้", vo.ok, "ok", JSON.stringify(vo), "MAJOR");
    b = await balances(s1.id);
    chkAmt("D9", "void: 2300 กลับเท่าก่อนออกเช็ค (net-zero)", before2300 + 20_000, net(b, "2300"), "CRITICAL");
    // เคลียร์เช็คที่ void แล้วต้องไม่ได้
    const clv = await cq.clearCheque(tenantId, s1.id, co2.id);
    chk("D10", "เคลียร์เช็คที่ void แล้วต้องถูกปฏิเสธ", !clv.ok, "ปฏิเสธ", JSON.stringify(clv), "MAJOR");
  }

  // ═══════ E) WHT + เช็คจ่าย + void ═══════
  console.log("\n── E) จ่ายเช็ค + หัก ณ ที่จ่าย → 50ทวิ/ภงด.53 → void payment ──");
  const ex2 = await exp.createExpenseDoc({
    tenantId, systemId: s2.id, docType: "EXPENSE", contactId: vend2.id,
    vatMode: "EXCLUDE", lines: [{ description: "ค่าบริการทำความสะอาด", qty: 1, unitPrice: 100_000 }],
  });
  await exp.issueExpenseDoc(tenantId, s2.id, ex2.id);
  const payV = await exp.recordVendorPayment(tenantId, s2.id, ex2.id, {
    channel: "CHEQUE" as never, amount: 104_000, whtAmountSatang: 3_000, whtRateBp: 300, whtIncomeType: "M40_8",
  });
  chk("E1", "จ่ายเช็ค+WHT 3% สำเร็จ", (payV as { ok: boolean }).ok, "ok", JSON.stringify(payV), "CRITICAL");
  b2 = await balances(s2.id);
  chkAmt("E2", "WHT ค้างนำส่ง 2130 = 30 (บันทึกตอนออกเช็ค)", -3_000, net(b2, "2130"), "CRITICAL");
  chkAmt("E3", "จ่ายเช็คผ่านหน้าเอกสาร: ควรพัก 2300 จนเช็คตัด (ไม่ Cr 1010 ทันที)", -104_000, net(b2, "2300"), "MAJOR");
  const pnd53a = await whtm.pnd(tenantId, s2.id, { type: 53, period: P });
  chkAmt("E4", "ภงด.53 เดือนนี้รวม WHT = 30", 3_000, pnd53a.grandWht, "MAJOR");
  const certRow = await prisma.accountDocument.findFirst({ where: { systemId: s2.id, docType: "WHT_CERT", sourceDocId: ex2.id }, select: { id: true, issueDate: true } });
  const payRow2 = await prisma.accountDocumentPayment.findFirst({ where: { systemId: s2.id, documentId: ex2.id, voidedAt: null }, select: { id: true, paidAt: true } });
  if (certRow && payRow2) {
    const sameDay = certRow.issueDate.toISOString().slice(0, 10) === payRow2.paidAt.toISOString().slice(0, 10);
    chk("E5", "วันที่ 50ทวิ = วันจ่าย (paidAt) — สอดคล้อง ภงด./GL", sameDay, "วันเดียวกัน",
      `cert=${certRow.issueDate.toISOString().slice(0, 10)} paidAt=${payRow2.paidAt.toISOString().slice(0, 10)}`, "MINOR");
  }
  // เช็คจ่ายถูกยกเลิก/เด้งฝั่งเรา → void payment
  if (payRow2) {
    await exp.voidVendorPayment(tenantId, s2.id, ex2.id, payRow2.id, "เช็คถูกยกเลิก");
    b2 = await balances(s2.id);
    chkAmt("E6", "void จ่าย: 2130 กลับเป็น 0", 0, net(b2, "2130"), "CRITICAL");
    const pnd53b = await whtm.pnd(tenantId, s2.id, { type: 53, period: P });
    chkAmt("E7", "ภงด.53 หลัง void ต้องเหลือ 0 (50ทวิของ payment ที่ยกเลิกห้ามนับ)", 0, pnd53b.grandWht, "CRITICAL");
  }

  // ═══════ F) งบการเงิน: 1040/2300 + cash flow ═══════
  console.log("\n── F) trial balance / balance sheet / cash flow ──");
  // สร้างเช็คค้าง 2 ใบให้มียอด ณ สิ้นงวด
  const cin = await cq.createCheque({ tenantId, systemId: s1.id, direction: "IN", chequeNo: "CQ-END", bankName: "TTB", chequeDate: new Date(), amount: 30_000 });
  const cout = await cq.createCheque({ tenantId, systemId: s1.id, direction: "OUT", chequeNo: "PD-END", bankName: "TTB", chequeDate: new Date(), amount: 40_000 });
  void cin; void cout;
  const tb = await rep.trialBalance({ tenantId, systemId: s1.id }, P, P);
  chk("F1", "งบทดลอง balanced", tb.balanced, "true", String(tb.balanced), "CRITICAL");
  const has1040 = tb.rows.some((r) => r.code === "1040");
  const has2300 = tb.rows.some((r) => r.code === "2300");
  chk("F2", "งบทดลองมี 1040 และ 2300", has1040 && has2300, "มี", `1040=${has1040} 2300=${has2300}`, "MAJOR");
  const bs = await rep.balanceSheet({ tenantId, systemId: s1.id }, P);
  const bs1040 = bs.assets.rows.find((r) => r.code === "1040")?.amount ?? 0;
  const bs2300 = bs.liabilities.rows.find((r) => r.code === "2300")?.amount ?? 0;
  b = await balances(s1.id);
  chkAmt("F3", "งบฐานะ: 1040 ฝั่งสินทรัพย์ตรง GL", net(b, "1040"), bs1040, "CRITICAL");
  chkAmt("F4", "งบฐานะ: 2300 ฝั่งหนี้สินตรง GL", -net(b, "2300"), bs2300, "CRITICAL");
  chk("F5", "งบฐานะ balanced", bs.balanced, "true", String(bs.balanced), "CRITICAL");
  const cf = await rep.cashFlow({ tenantId, systemId: s1.id }, P, P);
  chk("F6", "cash flow reconciled", cf.reconciled, "true", String(cf.reconciled), "MAJOR");
  // 1040 ถูกนับเป็น "เงินสด" ใน cash flow หรือไม่ (isCashCode 1000–1049)
  const closingIncludes1040 = cf.closingCash;
  const cashExcl1040 = net(b, "1000") + net(b, "1010") + net(b, "1020") + net(b, "1030");
  chk("F7", "cash flow นับ 1040 (เช็คยังไม่ขึ้นเงิน) เป็นเงินสด — CPA: ควรแยก",
    closingIncludes1040 === cashExcl1040, "ไม่รวม 1040", `closingCash=${bt(closingIncludes1040)} vs เงินไม่รวมเช็ค=${bt(cashExcl1040)} (1040=${bt(net(b, "1040"))})`, "MINOR");

  // ═══════ G) audit trail ของ entry เช็ค ═══════
  console.log("\n── G) traceability: entry เช็คอ้างถึงเช็คได้ไหม ──");
  const chequeEntries = await prisma.accountJournalEntry.findMany({
    where: { systemId: s1.id, refType: "AccountManualJV" }, select: { id: true, refId: true, source: true, memo: true },
  });
  const chequeRows = await prisma.accountCheque.findMany({ where: { systemId: s1.id }, select: { id: true } });
  const ids = new Set(chequeRows.map((r) => r.id));
  const traceable = chequeEntries.filter((e) => e.refId !== null && ids.has(e.refId)).length;
  chk("G1", "entry ของเช็คควร ref ถึง AccountCheque (ไม่ใช่ ManualJV+randomUUID)", traceable > 0 || chequeEntries.length === 0,
    "refType=AccountCheque refId=chequeId", `${chequeEntries.length} entries เป็น AccountManualJV/random refId (source=MANUAL)`, "MAJOR");
  // payment.chequeId เคยถูก set ไหม
  const linked = await prisma.accountDocumentPayment.count({ where: { tenantId, chequeId: { not: null } } });
  chk("G2", "payment.chequeId (schema มี FK) ถูกใช้เชื่อม payment↔เช็ค", linked > 0, ">0", `${linked} (dead field)`, "MAJOR");

} catch (e) {
  console.error("SCRIPT ERROR:", e);
} finally {
  console.log("\n── cleanup: ลบ test tenant ──");
  const del = async (name: string, fn: () => Promise<unknown>) => {
    try { await fn(); } catch (e) { console.log(`  ⚠ cleanup ${name}: ${e instanceof Error ? e.message : e}`); }
  };
  if (tenantId) {
    await del("journalLine", () => prisma.accountJournalLine.deleteMany({ where: { tenantId } }));
    await del("entry", () => prisma.accountJournalEntry.deleteMany({ where: { tenantId } }));
    await del("payment", () => prisma.accountDocumentPayment.deleteMany({ where: { tenantId } }));
    await del("cheque", () => prisma.accountCheque.deleteMany({ where: { tenantId } }));
    await del("relation", () => prisma.accountDocumentRelation.deleteMany({ where: { tenantId } }));
    await del("line", () => prisma.accountDocumentLine.deleteMany({ where: { tenantId } }));
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
  console.log(`\n═══ สรุป: ${findings.length} checks · fail ${bad.length} ═══`);
  for (const f of bad) console.log(`  [${f.sev}] ${f.id} ${f.name} — expected ${f.expected} | actual ${f.actual}`);
  await prisma.$disconnect();
}
