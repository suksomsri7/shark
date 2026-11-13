// QC ACC T1.2 — จุดรับผิดขายสินค้า: ใบกำกับพร้อมใบแจ้งหนี้ · ธงสินค้า/บริการต่อบรรทัด · VAT ค้างพักข้ามเดือน
//
// ใบงาน: ledger/ACCOUNT-TAX-PLAN.md แถว T1.2 · design note ledger/wo-notes/T1.2.md
// ฟิกซ์เจอร์ของตัวเอง (ร้านทิ้ง สร้างเอง ลบใน finally) — ไม่พึ่ง seed กลาง
// รัน: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-acc-v2-taxpoint.mts
//
// เฉลยคำนวณมือ (อัตรา 7% · โหมดแยก VAT):
//   สินค้า 10,000.00 ⇒ VAT 700.00 (70,000 สต.)      บริการ 5,000.00 ⇒ VAT 350.00 (35,000 สต.)
//   ใบผสม = 15,000.00 + 1,050.00 = 16,050.00 (1,605,000 สต.)
//   รับครึ่งใบผสม 802,500 ⇒ VAT บริการงวดนี้ = round(35,000 × 802,500 / 1,605,000) = 17,500 · ฐาน = round(17,500 × 500,000/35,000) = 250,000
//   งวดสุดท้าย (ครบ) = ที่เหลือ 17,500 ⇒ ปล่อยรวม 70,000 + 17,500 + 17,500 = 105,000 = VAT ทั้งใบ
//   เดือน ต.ค. 2569 (วันที่เอกสาร 15 ต.ค.) ภาษีขายเข้า 2200: TP1 70,000 + TP3 70,000 + TP5 70,000 + TP6b 35,000 + TP7b 35,000
//                                                  + TP9a 70,000 + TP10 70,000 = 420,000
//   เดือนปัจจุบัน (วันที่รับเงิน/ยกเลิก/ออกตามหลัง/กดออกเอง = วันนี้): TP2 35,000 + TP4 35,000 + TP5 กลับ −70,000 + TP7.4 35,000
//                                                  + TP9b 70,000 + TP10 บริการ (งวด) 35,000 + TP10e 17,500 + 17,500 = 175,000
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-acc-v2-taxpoint");

const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, exp: unknown, act: unknown, sev: Sev = "CRITICAL") => {
  cks.push({ id, ok, sev });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${JSON.stringify(exp)} | act ${JSON.stringify(act)?.slice(0, 500)}`}`);
};

const OCT = new Date("2026-10-15T05:00:00Z"); // 15 ต.ค. 2569 12:00 น. เวลาไทย
const bkkMonth = (d: Date) => { const t = new Date(d.getTime() + 7 * 3_600_000); return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`; };
const NOW_MONTH = bkkMonth(new Date());

let tid = "";
const users: string[] = [];
try {
  const acc = (await import("@/lib/modules/account/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const gl = (await import("@/lib/modules/account/gl" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const TP = (await import("@/lib/modules/account/tax-point" as string)) as Any;
  const TPS = (await import("@/lib/modules/account/tax-point-shared" as string)) as Any;
  const DS = (await import("@/lib/modules/account/doc-settings" as string)) as Any;
  const REP = (await import("@/lib/modules/account/reports" as string)) as Any;
  const STR = (await import("@/lib/modules/account/sales-tax-report" as string)) as Any;
  const PROD = (await import("@/lib/modules/account/product" as string)) as Any;
  const fin = (await import("@/lib/modules/account/finance" as string)) as Any;

  const stamp = Date.now();
  const t = await prisma.tenant.create({ data: { name: "QC T1.2 taxpoint", slug: `qc-t12-${stamp}` } });
  tid = t.id;
  const owner = await prisma.user.create({ data: { email: `qc-t12-${stamp}@qc.local`, name: "เจ้าของ T1.2" } });
  users.push(owner.id);
  await prisma.membership.create({ data: { userId: owner.id, tenantId: tid, role: "OWNER", unitAccess: ["*"], acceptedAt: new Date() } });
  const S = (await sys.createSystem(tid, "ACCOUNT", "บัญชี T1.2")).id;
  const ctx = { tenantId: tid, systemId: S };
  await acc.saveSettings(tid, S, { orgName: "ร้าน T1.2", vatRegistered: true, vatRateBp: 700, taxId: "0105561000000" });
  await gl.ensureAccounting(ctx);
  const bank = await fin.createFinanceAccount({ tenantId: tid, systemId: S, type: "BANK", name: "ออมทรัพย์", bankName: "กสิกรไทย" });
  const cust = await acc.createContact({ tenantId: tid, systemId: S, kind: "CUSTOMER", legalType: "COMPANY", name: "ลูกค้า T1.2", taxId: "0105561999991", branchCode: "00000" });
  const pg = await PROD.createProduct(tid, S, { name: "ถังดำน้ำ", type: "GOODS", salePrice: 1_000_000, vatRateBp: 700 });
  const ps = await PROD.createProduct(tid, S, { name: "ค่าสอนดำน้ำ", type: "SERVICE", salePrice: 500_000, vatRateBp: 700 });
  const G = { description: "ถังดำน้ำ", qty: 1, unitPrice: 1_000_000, discount: 0, vatRateBp: 700, productId: pg.id };
  const SV = { description: "ค่าสอนดำน้ำ", qty: 1, unitPrice: 500_000, discount: 0, vatRateBp: 700, productId: ps.id };

  const ledgerId = async (code: string) => (await prisma.accountLedger.findFirst({ where: { systemId: S, code }, select: { id: true } }))!.id;
  const A2200 = await ledgerId("2200");
  const A2205 = await ledgerId("2205");
  const A2210 = await ledgerId("2210");
  /** Σ(เครดิต − เดบิต) ของบัญชีในรายการของเอกสารชุดหนึ่ง (รวมทุกสถานะ/รายการกลับ) */
  const net = async (acct: string, refIds: string[]) => {
    const ls = await prisma.accountJournalLine.findMany({ where: { systemId: S, accountId: acct, entry: { refType: "AccountDocument", refId: { in: refIds } } }, select: { debit: true, credit: true } });
    return ls.reduce((a, l) => a + l.credit - l.debit, 0);
  };
  const tisOf = (ivId: string) => prisma.accountDocument.findMany({ where: { systemId: S, docType: "TAX_INVOICE", sourceDocId: ivId }, orderBy: { createdAt: "asc" }, include: { lines: true } });
  const parked = async (ivId: string) => (await gl.parkedVatOf(ctx, [ivId])).get(ivId);
  const mk = async (lines: Any[], extra: Any = {}) =>
    acc.createDocument({ tenantId: tid, systemId: S, docType: "INVOICE", contactId: cust.id, vatMode: "EXCLUDE", issueDate: OCT, lines, createdById: owner.id, ...extra });
  const issue = async (id: string) => acc.issueDocument(tid, S, id);
  const pay = (id: string, amount: number, key: string) => acc.recordPayment(tid, S, id, { paidAt: new Date(), financeAccountId: bank.id, channel: "TRANSFER", amount, createdById: owner.id, idempotencyKey: key });
  const balanced = async (refIds: string[]) => {
    const es = await prisma.accountJournalEntry.findMany({ where: { systemId: S, refType: "AccountDocument", refId: { in: refIds } }, include: { lines: true } });
    return es.length > 0 && es.every((e) => e.lines.reduce((a, l) => a + l.debit, 0) === e.lines.reduce((a, l) => a + l.credit, 0));
  };

  // ═══ TP0 ชนิดบรรทัด ═══
  console.log("\nTP0 ชนิดบรรทัด (สินค้า/บริการ):");
  {
    chk("TP0.1", "pure: เลือกบนบรรทัด > ชนิดสินค้า > ชนิดเริ่มของใบ", TPS.resolveLineKind("SERVICE", "GOODS", "ON_ISSUE") === "SERVICE" && TPS.resolveLineKind(null, "SERVICE", "ON_ISSUE") === "SERVICE" && TPS.resolveLineKind(null, "BUNDLE", "ON_PAYMENT") === "GOODS" && TPS.resolveLineKind(null, null, "ON_PAYMENT") === "SERVICE" && TPS.resolveLineKind(null, null, "ON_ISSUE") === "GOODS", "ตามลำดับ", null);
    const d = await mk([G, SV, { description: "ค่าส่ง (ไม่มีในทะเบียน)", qty: 1, unitPrice: 10_000, vatRateBp: 700 }, { ...G, description: "ถังเช่า (เลือกเป็นบริการ)", lineKind: "SERVICE" }]);
    const ls = await prisma.accountDocumentLine.findMany({ where: { documentId: d.id }, orderBy: { sortOrder: "asc" }, select: { lineKind: true } });
    chk("TP0.2", "บันทึกลงคอลัมน์ lineKind: สินค้าจากทะเบียน · บริการจากทะเบียน · ไม่มีสินค้า = ชนิดเริ่ม (สินค้า) · เลือกเอง = บริการ", JSON.stringify(ls.map((l) => l.lineKind)) === JSON.stringify(["GOODS", "SERVICE", "GOODS", "SERVICE"]), ["GOODS", "SERVICE", "GOODS", "SERVICE"], ls);
    await acc.updateDocument(tid, S, d.id, { lines: [{ ...SV, lineKind: "GOODS" }] });
    const l2 = await prisma.accountDocumentLine.findMany({ where: { documentId: d.id }, select: { lineKind: true } });
    chk("TP0.3", "แก้ร่าง: ชนิดที่เลือกบนบรรทัดชนะชนิดสินค้า (บริการ→เลือกเป็นสินค้า)", l2.length === 1 && l2[0].lineKind === "GOODS", "GOODS", l2);
    await acc.voidDocument(tid, S, d.id, "ทดสอบ");
  }

  // ═══ TP1 ใบสินค้าล้วน ═══
  console.log("\nTP1 ใบแจ้งหนี้สินค้าล้วน → ใบกำกับพร้อมกัน:");
  let tp1 = "";
  {
    const d = await mk([G]);
    tp1 = d.id;
    const r = await issue(d.id);
    const tis = await tisOf(d.id);
    chk("TP1.1", "ออกได้ + มีใบกำกับ 1 ใบ (ISSUED · มีเลขที่ · VAT 70,000 · ลงวันที่ใบแจ้งหนี้)", r.ok && tis.length === 1 && tis[0].status === "ISSUED" && !!tis[0].docNo && tis[0].vatAmount === 70_000 && tis[0].issueDate.getTime() === OCT.getTime(), "1 ใบ/70000", tis.map((x) => ({ s: x.status, n: x.docNo, v: x.vatAmount, d: x.issueDate })));
    chk("TP1.2", "ใบกำกับคัดลอกบรรทัดสินค้า (ชนิด GOODS) · ฐาน 1,000,000 · รวม 1,070,000", tis[0]?.lines.length === 1 && tis[0].lines[0].lineKind === "GOODS" && tis[0].subTotal === 1_000_000 && tis[0].grandTotal === 1_070_000, "ตามนั้น", tis[0] && { l: tis[0].lines.map((l) => l.lineKind), s: tis[0].subTotal, g: tis[0].grandTotal });
    const ids = [d.id, ...tis.map((x) => x.id)];
    chk("TP1.3", "GL: 2205 พักแล้วปล่อยหมด (สุทธิ 0) · 2210 = 0 · 2200 = 70,000 · ทุก JV ดุล", (await net(A2205, ids)) === 0 && (await net(A2210, ids)) === 0 && (await net(A2200, ids)) === 70_000 && (await balanced(ids)), "0/0/70000", { g: await net(A2205, ids), s: await net(A2210, ids), o: await net(A2200, ids) });
    const tiJe = await prisma.accountJournalEntry.findFirst({ where: { systemId: S, refType: "AccountDocument", refId: tis[0]?.id } });
    chk("TP1.4", "JV ปล่อย VAT ลงวันที่ใบแจ้งหนี้ (งวด 2026-10)", tiJe?.periodKey === "2026-10", "2026-10", tiJe?.periodKey);
    const p = await parked(d.id);
    chk("TP1.5", "ยอดพักคงเหลือ 0 · พักตอนออก 70,000 (สินค้า)", p.goods === 0 && p.service === 0 && p.goodsAtIssue === 70_000 && p.serviceAtIssue === 0, "0/0/70000/0", p);
  }

  // ═══ TP2 ใบบริการล้วน ═══
  console.log("\nTP2 ใบแจ้งหนี้บริการล้วน → ใบกำกับเมื่อรับชำระ (เดิม):");
  {
    const d = await mk([SV]);
    await issue(d.id);
    chk("TP2.1", "ออกแล้วไม่มีใบกำกับ · VAT 35,000 พักที่ 2210", (await tisOf(d.id)).length === 0 && (await net(A2210, [d.id])) === 35_000 && (await net(A2205, [d.id])) === 0, "0 ใบ/35000", await net(A2210, [d.id]));
    const r = await pay(d.id, 535_000, `tp2-${stamp}`);
    const tis = await tisOf(d.id);
    chk("TP2.2", "รับครบ → ใบกำกับงวด 1 ใบ VAT 35,000 ฐาน 500,000 ชนิด SERVICE", r.ok && tis.length === 1 && tis[0].vatAmount === 35_000 && tis[0].subTotal === 500_000 && tis[0].sourcePaymentId === r.paymentId && tis[0].lines[0]?.lineKind === "SERVICE", "35000/500000", tis.map((x) => ({ v: x.vatAmount, b: x.subTotal })));
    const ids = [d.id, ...tis.map((x) => x.id)];
    chk("TP2.3", "GL: 2210 สุทธิ 0 · 2200 = 35,000", (await net(A2210, ids)) === 0 && (await net(A2200, ids)) === 35_000 && (await balanced(ids)), "0/35000", { s: await net(A2210, ids), o: await net(A2200, ids) });
  }

  // ═══ TP3 + TP4 ใบผสม + รับชำระบางส่วน ═══
  console.log("\nTP3 ใบผสม (สินค้า+บริการ) · TP4 รับชำระบางส่วน:");
  {
    const d = await mk([G, SV]);
    await issue(d.id);
    const iv = await prisma.accountDocument.findUnique({ where: { id: d.id } });
    chk("TP3.0", "ยอดใบ 1,605,000 · VAT 105,000", iv?.grandTotal === 1_605_000 && iv?.vatAmount === 105_000, "1605000/105000", iv && { g: iv.grandTotal, v: iv.vatAmount });
    const ivJe = await prisma.accountJournalEntry.findFirst({ where: { systemId: S, refType: "AccountDocument", refId: d.id }, include: { lines: true } });
    const cr = (a: string) => ivJe?.lines.filter((l) => l.accountId === a).reduce((s, l) => s + l.credit, 0);
    chk("TP3.1", "JV ใบแจ้งหนี้แยกพัก: Cr 2205 70,000 (สินค้า) · Cr 2210 35,000 (บริการ)", cr(A2205) === 70_000 && cr(A2210) === 35_000, "70000/35000", { g: cr(A2205), s: cr(A2210) });
    let tis = await tisOf(d.id);
    chk("TP3.2", "ใบกำกับพร้อมกันเฉพาะส่วนสินค้า: 1 ใบ VAT 70,000 บรรทัด GOODS 1 บรรทัด", tis.length === 1 && tis[0].vatAmount === 70_000 && tis[0].lines.length === 1 && tis[0].lines[0].lineKind === "GOODS", "70000", tis.map((x) => ({ v: x.vatAmount, l: x.lines.map((l) => l.lineKind) })));
    let p = await parked(d.id);
    chk("TP3.3", "คงพัก: สินค้า 0 · บริการ 35,000 · ปล่อย + พัก = 105,000", p.goods === 0 && p.service === 35_000 && 70_000 + p.goods + p.service === 105_000, "0/35000", p);
    const r1 = await pay(d.id, 802_500, `tp4a-${stamp}`);
    tis = await tisOf(d.id);
    const t1 = tis.find((x) => x.sourcePaymentId === r1.paymentId);
    chk("TP4.1", "รับครึ่ง 802,500 → ใบกำกับงวด VAT 17,500 · ฐาน 250,000 · รวม 267,500 (ไม่ปล่อย VAT สินค้าซ้ำ)", r1.ok && t1?.vatAmount === 17_500 && t1?.subTotal === 250_000 && t1?.grandTotal === 267_500, "17500/250000/267500", t1 && { v: t1.vatAmount, b: t1.subTotal, g: t1.grandTotal });
    p = await parked(d.id);
    chk("TP4.2", "คงพักบริการ 17,500", p.service === 17_500 && p.goods === 0, 17_500, p);
    const r2 = await pay(d.id, 802_500, `tp4b-${stamp}`);
    tis = await tisOf(d.id);
    const t2 = tis.find((x) => x.sourcePaymentId === r2.paymentId);
    chk("TP4.3", "งวดสุดท้าย → ปล่อยที่เหลือ 17,500 · สถานะ PAID", r2.ok && r2.status === "PAID" && t2?.vatAmount === 17_500, "17500/PAID", { st: r2.status, v: t2?.vatAmount });
    const ids = [d.id, ...tis.map((x) => x.id)];
    const relSum = tis.reduce((a, x) => a + x.vatAmount, 0);
    chk("TP4.4", "ผลรวมใบกำกับ = 105,000 = VAT ทั้งใบ · 2205/2210 สุทธิ 0 · 2200 = 105,000 · JV ดุล", relSum === 105_000 && (await net(A2205, ids)) === 0 && (await net(A2210, ids)) === 0 && (await net(A2200, ids)) === 105_000 && (await balanced(ids)), 105_000, { relSum, o: await net(A2200, ids) });
  }

  // ═══ TP5 ยกเลิกหลังปล่อย ═══
  console.log("\nTP5 ยกเลิกใบแจ้งหนี้หลังปล่อย VAT:");
  {
    const d = await mk([G]);
    await issue(d.id);
    const v = await acc.voidDocument(tid, S, d.id, "ลูกค้ายกเลิก");
    const tis = await tisOf(d.id);
    const ids = [d.id, ...tis.map((x) => x.id)];
    chk("TP5.1", "ยกเลิกได้ · ใบกำกับที่ออกพร้อมกันถูกยกเลิกตาม (VOIDED)", v.ok && tis.length === 1 && tis[0].status === "VOIDED", "VOIDED", { v, s: tis.map((x) => x.status) });
    chk("TP5.2", "GL: 2205 · 2200 · 1100 สุทธิ 0 ทั้งหมด (กลับรายการครบ) · JV ดุล", (await net(A2205, ids)) === 0 && (await net(A2200, ids)) === 0 && (await balanced(ids)), "0/0", { g: await net(A2205, ids), o: await net(A2200, ids) });
    const p = await parked(d.id);
    chk("TP5.3", "ไม่เหลือยอดพัก", p.goods === 0 && p.service === 0, 0, p);
  }

  // ═══ TP6 สวิตช์ต่อใบ ═══
  console.log("\nTP6 สวิตช์ 'ออกใบกำกับภาษีพร้อมกัน' ต่อใบ:");
  let tp6a = "";
  {
    const a = await mk([G]);
    tp6a = a.id;
    await prisma.accountDocument.update({ where: { id: a.id }, data: { autoTaxInvoice: false } });
    await issue(a.id);
    chk("TP6.1", "ปิดสวิตช์ (ใบสินค้า) → ไม่ออกใบกำกับ · VAT 70,000 พักที่ 2205", (await tisOf(a.id)).length === 0 && (await net(A2205, [a.id])) === 70_000, "พัก 70000", await net(A2205, [a.id]));
    const b = await mk([SV]);
    await prisma.accountDocument.update({ where: { id: b.id }, data: { autoTaxInvoice: true } });
    await issue(b.id);
    let tis = await tisOf(b.id);
    chk("TP6.2", "เปิดสวิตช์ (ใบบริการ) → ออกใบกำกับก่อนรับเงิน (ม.78/1(1)(ก)) VAT 35,000 · 2210 สุทธิ 0", tis.length === 1 && tis[0].vatAmount === 35_000 && (await net(A2210, [b.id, tis[0].id])) === 0, "35000/0", tis.map((x) => x.vatAmount));
    const r = await pay(b.id, 535_000, `tp6b-${stamp}`);
    tis = await tisOf(b.id);
    chk("TP6.3", "รับเงินภายหลัง → ไม่มีใบกำกับงวดซ้ำ (ไม่มี VAT บริการพักเหลือ)", r.ok && tis.length === 1, 1, tis.length);
    const pv = TPS.effectiveIssueToggle(null, { goodsOnIssue: true, mode: "ON_PAYMENT" }, { goods: true, service: false });
    const pv2 = TPS.effectiveIssueToggle(null, { goodsOnIssue: true, mode: "ON_PAYMENT" }, { goods: false, service: true });
    chk("TP6.4", "ค่าเริ่มของสวิตช์ในฟอร์ม: มีสินค้า = เปิด · บริการล้วน (โหมดรับเงิน) = ปิด", pv === true && pv2 === false, "true/false", [pv, pv2]);
  }

  // ═══ TP7 ค่าตั้ง ═══
  console.log("\nTP7 ค่าตั้ง (สินค้า: goodsOnIssue · บริการ: mode):");
  {
    const cur = await DS.getDocSettings(ctx);
    chk("TP7.0", "ค่าเริ่ม: goodsOnIssue = true · mode = ON_PAYMENT", cur.autoTaxInvoice.goodsOnIssue === true && cur.autoTaxInvoice.mode === "ON_PAYMENT", "true/ON_PAYMENT", cur.autoTaxInvoice);
    await DS.saveDocSettings(ctx, { autoTaxInvoice: { ...cur.autoTaxInvoice, goodsOnIssue: false } });
    const a = await mk([G]);
    await issue(a.id);
    chk("TP7.1", "goodsOnIssue ปิด → ใบสินค้าไม่ออกใบกำกับ (พัก 70,000)", (await tisOf(a.id)).length === 0 && (await net(A2205, [a.id])) === 70_000, "พัก", await net(A2205, [a.id]));
    await acc.voidDocument(tid, S, a.id, "ทดสอบค่าตั้ง");
    await DS.saveDocSettings(ctx, { autoTaxInvoice: { ...cur.autoTaxInvoice, mode: "ON_INVOICE" } });
    const b = await mk([SV]);
    await issue(b.id);
    const tb = await tisOf(b.id);
    chk("TP7.2", "mode ON_INVOICE → ใบบริการออกใบกำกับพร้อมใบแจ้งหนี้ (35,000)", tb.length === 1 && tb[0].vatAmount === 35_000, 35_000, tb.map((x) => x.vatAmount));
    await DS.saveDocSettings(ctx, { autoTaxInvoice: { ...cur.autoTaxInvoice, mode: "MANUAL" } });
    const c = await mk([SV]);
    await issue(c.id);
    await pay(c.id, 535_000, `tp7c-${stamp}`);
    chk("TP7.3", "mode MANUAL → รับเงินแล้วไม่ออกใบกำกับให้ (บริการพัก 35,000 รอร้านกด)", (await tisOf(c.id)).length === 0 && (await net(A2210, [c.id])) === 35_000, "พัก", await net(A2210, [c.id]));
    await DS.saveDocSettings(ctx, { autoTaxInvoice: { ...cur.autoTaxInvoice } });
    // ร้านกดออกเองทีหลัง (แปลง → ออก) ⇒ ดึงจาก 2210 ถูกบัญชี และลงเดือนปัจจุบัน
    const cv = await acc.convertDocument(tid, S, c.id, "TAX_INVOICE", owner.id);
    const ci = cv.ok ? await acc.issueDocument(tid, S, cv.newId) : cv;
    const ids = [c.id, ...(await tisOf(c.id)).map((x) => x.id)];
    chk("TP7.4", "ใบบริการที่ร้านกดออกเอง (แปลงจากใบแจ้งหนี้) ปล่อยจาก 2210 (เดิมดึงจาก 2205 ผิดบัญชี) · 2205 ไม่ติดลบ", ci.ok && (await net(A2210, ids)) === 0 && (await net(A2205, ids)) === 0 && (await net(A2200, ids)) === 35_000, "0/0/35000", { s: await net(A2210, ids), g: await net(A2205, ids), ci });
  }

  // ═══ TP8 คำเตือนข้ามเดือน ═══
  console.log("\nTP8 คำเตือน VAT สินค้าค้างพักข้ามเดือน:");
  {
    const inOct = await TP.parkedOutputVat(ctx, { asOf: new Date("2026-10-31T16:00:00Z") }); // 31 ต.ค. 23:00 ไทย
    const rOct = inOct.rows.find((x: Any) => x.documentId === tp6a);
    chk("TP8.1", "ยังอยู่ในเดือนของใบ (31 ต.ค.) → อยู่ในรายการ (สินค้า 70,000) แต่ไม่มีคำเตือน", !!rOct && rOct.goods === 70_000 && rOct.pastMonth === false && rOct.warning === null, "ไม่มีคำเตือน", rOct);
    const inNov = await TP.parkedOutputVat(ctx, { asOf: new Date("2026-10-31T17:00:00Z") }); // 1 พ.ย. 00:00 ไทย
    const rNov = inNov.rows.find((x: Any) => x.documentId === tp6a);
    chk("TP8.2", "ข้ามเดือน (1 พ.ย. 00:00 เวลาไทย) → คำเตือน OUTPUT_VAT_PARKED_PAST_MONTH ฿700.00 อ้าง ม.78 ม.86 · ไม่ต้องกดยืนยัน", !!rNov && rNov.pastMonth && rNov.warning?.code === "OUTPUT_VAT_PARKED_PAST_MONTH" && /฿700\.00/.test(rNov.warning.messageTh) && /78/.test(rNov.warning.citation) && /86/.test(rNov.warning.citation) && rNov.warning.ack === false, "เตือน", rNov?.warning);
    chk("TP8.3", "คำเตือนรวมของสมุด: นับใบ + ยอดสินค้าที่ค้างข้ามเดือน · บริการพักรอรับเงินไม่นับเป็นคำเตือน", inNov.warning?.code === "OUTPUT_VAT_PARKED_PAST_MONTH" && inNov.total.countPastMonth === 1 && inNov.total.goodsPastMonth === 70_000 && inNov.total.service >= 0, "1 ใบ/70000", inNov.total);
    chk("TP8.4", "ใบที่ปล่อยครบแล้ว (TP1) ไม่อยู่ในรายการ", !inNov.rows.some((x: Any) => x.documentId === tp1), "ไม่อยู่", inNov.rows.map((x: Any) => x.docNo));
    const one = await TP.parkedWarningForDocument(ctx, tp6a, new Date("2026-11-02T05:00:00Z"));
    chk("TP8.5", "คำเตือนของใบเดียว (หน้าเอกสาร/REST) = รหัสเดียวกัน", one?.warning?.code === "OUTPUT_VAT_PARKED_PAST_MONTH" && one.goods === 70_000, "เตือน", one);
  }

  // ═══ TP9 ปล่อย VAT ของข้อมูลเก่า ═══
  console.log("\nTP9 ปล่อย VAT ที่พักของข้อมูลเก่า (ไม่ทำลายของเดิม):");
  {
    // ข้อมูลเก่า = บรรทัดไม่มีชนิด (ก่อน T1.2) + ไม่มีใบกำกับ → พักที่ 2205 ตามจุดรับรู้ทั้งใบ (ON_ISSUE)
    const legacy = async () => {
      const d = await mk([{ description: "สินค้าเก่า", qty: 1, unitPrice: 1_000_000, vatRateBp: 700 }]);
      await prisma.accountDocumentLine.updateMany({ where: { documentId: d.id }, data: { lineKind: null } });
      await prisma.accountDocument.update({ where: { id: d.id }, data: { autoTaxInvoice: false } });
      await issue(d.id);
      return d.id;
    };
    const a = await legacy();
    const b = await legacy();
    chk("TP9.0", "ข้อมูลเก่า: บรรทัดไม่มีชนิด → พัก 2205 ทั้งก้อน 70,000 (เหมือนเดิมทุกสตางค์)", (await net(A2205, [a])) === 70_000 && (await net(A2210, [a])) === 0, 70_000, await net(A2205, [a]));
    const r0 = await TP.releaseParkedVat(ctx, [a], { date: null });
    chk("TP9.1", "ไม่เลือกวันที่ → ไม่ทำอะไร + บอกให้เลือก (ไม่มีค่าเริ่ม — skill ไม่ได้บอก)", r0.ok === false && /เลือกวันที่/.test(r0.reason) && (await tisOf(a)).length === 0, "ให้เลือก", r0);
    const r1 = await TP.releaseParkedVat(ctx, [a], { date: "INVOICE_DATE" });
    chk("TP9.2", "ไม่กดยืนยัน → LEGAL_ACK_REQUIRED + TAX_INVOICE_LATE_DATE_CHOICE [U] (ไม่ออกอะไร)", r1.ok === false && r1.legal?.code === "LEGAL_ACK_REQUIRED" && r1.legal.warnings[0]?.code === "TAX_INVOICE_LATE_DATE_CHOICE" && r1.legal.warnings[0]?.tag === "U" && (await tisOf(a)).length === 0, "ack", r1);
    const ack = { codes: ["TAX_INVOICE_LATE_DATE_CHOICE"], actorId: owner.id, via: "screen" };
    const r2 = await TP.releaseParkedVat(ctx, [a], { date: "INVOICE_DATE", ack });
    const ta = await tisOf(a);
    chk("TP9.3", "เลือก 'วันที่ใบแจ้งหนี้' + ยืนยัน → ใบกำกับ 70,000 ลงวันที่ 15 ต.ค. · JV งวด 2026-10", r2.ok && r2.released.length === 1 && ta.length === 1 && ta[0].vatAmount === 70_000 && ta[0].issueDate.getTime() === OCT.getTime(), "1 ใบ", r2);
    const je = await prisma.accountJournalEntry.findFirst({ where: { systemId: S, refType: "AccountDocument", refId: ta[0]?.id } });
    chk("TP9.4", "ปล่อยจาก 2205 → 2200 ใน ต.ค. · ใบแจ้งหนี้เดิมไม่ถูกแก้ (JV เดิมยัง POSTED)", je?.periodKey === "2026-10" && (await net(A2205, [a, ta[0].id])) === 0 && (await prisma.accountJournalEntry.count({ where: { systemId: S, refType: "AccountDocument", refId: a, status: "POSTED" } })) === 1, "ตามนั้น", je?.periodKey);
    const ackRows = await prisma.auditLog.findMany({ where: { tenantId: tid, action: "legal.warning.ack", targetId: a } });
    chk("TP9.5", "บันทึกผู้ยืนยัน (AuditLog legal.warning.ack · op account.vat.release)", ackRows.length === 1 && (ackRows[0].after as Any)?.op === "account.vat.release" && ackRows[0].actorId === owner.id, 1, ackRows.length);
    const r3 = await TP.releaseParkedVat(ctx, [b, a], { date: "TODAY", ack });
    const tb = await tisOf(b);
    chk("TP9.6", "เป็นชุด 'วันนี้': ใบ b ออกใบกำกับลงวันนี้ · ใบ a (ปล่อยแล้ว) ถูกข้ามพร้อมเหตุผล", r3.ok && r3.released.length === 1 && r3.released[0].documentId === b && r3.skipped.length === 1 && r3.skipped[0].documentId === a && /ไม่มีภาษีขายที่พัก/.test(r3.skipped[0].reason) && bkkMonth(tb[0]?.issueDate) === NOW_MONTH, "1 ออก/1 ข้าม", r3);
  }

  // ═══ TP10 ใบผสม: ร้านกดออกใบกำกับส่วนที่เหลือเอง ═══
  console.log("\nTP10 ใบผสม → แปลงเป็นใบกำกับซ้ำ (ฐานข้อมูลให้ 1 ใบต่อใบแจ้งหนี้) · ส่วนบริการออกตามงวดรับเงิน:");
  {
    const d = await mk([G, SV]);
    await issue(d.id);
    const cv = await acc.convertDocument(tid, S, d.id, "TAX_INVOICE", owner.id);
    chk("TP10.1", "มีใบกำกับพร้อมกันแล้ว → แปลงซ้ำบอกทางที่เหลือเป็นข้อความไทย (ยอดพัก ฿350.00 · ออกตามงวดรับชำระ) ไม่ชนดัชนี", cv.ok === false && /฿350\.00/.test(cv.reason) && /งวดรับชำระ/.test(cv.reason), "ข้อความ", cv);
    const r = await pay(d.id, 1_605_000, `tp10-${stamp}`);
    const tis = await tisOf(d.id);
    const ids = [d.id, ...tis.map((x) => x.id)];
    chk("TP10.2", "รับครบ → ใบกำกับงวด VAT บริการ 35,000 · 2205/2210 สุทธิ 0 · 2200 = 105,000", r.ok && tis.length === 2 && (await net(A2205, ids)) === 0 && (await net(A2210, ids)) === 0 && (await net(A2200, ids)) === 105_000, "ok", { r, n: tis.map((x) => x.vatAmount) });
    const cv2 = await acc.convertDocument(tid, S, d.id, "TAX_INVOICE", owner.id);
    chk("TP10.3", "แปลงซ้ำเมื่อไม่มี VAT พักเหลือ → ปฏิเสธ \"ครบแล้ว\" (ไม่นับภาษีขายซ้ำ)", cv2.ok === false && /ครบแล้ว/.test(cv2.reason), "ปฏิเสธ", cv2);
    // ใบบริการที่รับเงินไปบางส่วน (มีแต่ใบกำกับของงวด) แล้วร้านกดออกส่วนที่เหลือเอง ⇒ ร่าง = เฉพาะยอดที่ยังพัก
    const e = await mk([SV]);
    await issue(e.id);
    await pay(e.id, 267_500, `tp10e-${stamp}`);
    const cv3 = await acc.convertDocument(tid, S, e.id, "TAX_INVOICE", owner.id);
    const draft = cv3.ok ? await prisma.accountDocument.findUnique({ where: { id: cv3.newId }, include: { lines: true } }) : null;
    chk("TP10.4", "ใบบริการรับครึ่ง → ร่างใบกำกับ = VAT ที่ยังพัก 17,500 · ฐาน 250,000 · บรรทัดสรุป SERVICE", !!draft && draft.vatAmount === 17_500 && draft.subTotal === 250_000 && draft.lines.length === 1 && draft.lines[0].lineKind === "SERVICE", "17500/250000", draft && { v: draft.vatAmount, b: draft.subTotal });
    const ri = cv3.ok ? await acc.issueDocument(tid, S, cv3.newId) : cv3;
    const eIds = [e.id, ...(await tisOf(e.id)).map((x) => x.id)];
    chk("TP10.5", "ออกได้ · 2210 ของใบนั้นสุทธิ 0 · 2200 = 35,000", ri.ok && (await net(A2210, eIds)) === 0 && (await net(A2200, eIds)) === 35_000, "0/35000", { ri, s: await net(A2210, eIds) });
  }

  // ═══ TP11 ภ.พ.30 / รายงานภาษีขายเดือนถูก ═══
  console.log("\nTP11 ภ.พ.30 และรายงานภาษีขาย (อ่านผ่านฟังก์ชันเดิม):");
  {
    const oct = await REP.pp30(ctx, "2026-10");
    chk("TP11.1", "ภ.พ.30 ต.ค. ภาษีขาย = 420,000 (เฉลยหัวไฟล์)", oct.output.total === 420_000, 420_000, oct.output.total);
    const nowM = await REP.pp30(ctx, NOW_MONTH);
    chk("TP11.2", `ภ.พ.30 ${NOW_MONTH} ภาษีขาย = 175,000 (รับเงิน/ยกเลิก/ออกตามหลัง/กดออกเอง ลงวันนี้)`, nowM.output.total === 175_000, 175_000, nowM.output.total);
    const st = await STR.salesTaxReport(ctx, "2026-10");
    chk("TP11.3", "รายงานภาษีขาย ต.ค. = GL 2200 (ข้อตรวจกระทบยอดผ่าน) และรวม = 420,000", st.total.vat === 420_000 && st.glVat === 420_000, 420_000, { r: st.total.vat, g: st.glVat });
    const tiNos = (await prisma.accountDocument.findMany({ where: { systemId: S, docType: "TAX_INVOICE", issueDate: OCT, status: "ISSUED" }, select: { docNo: true } })).map((x) => x.docNo);
    chk("TP11.4", "แถวรายงาน ต.ค. เป็นใบกำกับที่ออกพร้อมใบแจ้งหนี้/ปล่อยย้อนวันที่ (เลขที่ใบกำกับ)", tiNos.length >= 5 && tiNos.every((n) => st.rows.some((r: Any) => r.docNo === n)), tiNos, st.rows.map((r: Any) => r.docNo));
    const p2205 = await net(A2205, (await prisma.accountDocument.findMany({ where: { systemId: S }, select: { id: true } })).map((x) => x.id));
    chk("TP11.5", "ทั้งสมุด 2205 คงเหลือ = VAT สินค้าที่ยังพักจริง (TP6a 70,000 เท่านั้น)", p2205 === 70_000, 70_000, p2205);
  }
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? `${e.message.slice(0, 400)}\n${e.stack?.split("\n").slice(1, 5).join("\n")}` : String(e));
} finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  if (tid) {
    const P = prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown>; updateMany: (a: unknown) => Promise<unknown> }>;
    await d(() => P.accountJournalLine.deleteMany({ where: { tenantId: tid } }));
    await d(() => P.accountJournalEntry.updateMany({ where: { tenantId: tid }, data: { reversalOfId: null } }));
    await d(() => P.accountJournalEntry.deleteMany({ where: { tenantId: tid } }));
    await d(() => P.accountDocumentPayment.deleteMany({ where: { tenantId: tid } }));
    await d(() => P.accountDocumentRelation.deleteMany({ where: { tenantId: tid } }));
    await d(() => P.accountDocumentLine.deleteMany({ where: { tenantId: tid } }));
    await d(() => P.accountDocument.updateMany({ where: { tenantId: tid }, data: { sourceDocId: null, replacedById: null, sourcePaymentId: null } }));
    for (const m of ["accountAttachment", "accountDocument", "accountDocSequence", "accountProduct", "accountMapping", "accountFinance", "accountContact", "accountPeriod", "accountSettings", "settingChange", "settingValue", "auditLog", "outboxEvent", "membership", "appSystemUnit"]) {
      await d(() => P[m].deleteMany({ where: { tenantId: tid } }));
    }
    await d(() => P.accountLedger.updateMany({ where: { tenantId: tid }, data: { parentId: null } }));
    await d(() => P.accountLedger.deleteMany({ where: { tenantId: tid } }));
    await d(() => P.appSystem.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.businessUnit.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.tenant.delete({ where: { id: tid } }));
  }
  for (const u of users) await d(() => prisma.user.delete({ where: { id: u } }));
  await prisma.$disconnect();
}

const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC ACC T1.2 จุดรับผิดขายสินค้า =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
