// QC ACC T2.4 — คืนมัดจำ = ใบลดหนี้อ้างใบกำกับของมัดจำ · ริบมัดจำ [U] ค่าตั้ง + คำเตือน · ยกเลิกใบรับมัดจำยกเลิกใบกำกับตาม (I3)
//
// design note ledger/wo-notes/T2.4.md · ฟิกซ์เจอร์ของตัวเอง (ร้านทิ้ง)
// รัน: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-acc-v2-deposit-refund.mts
//
// เฉลยคำนวณมือ (7% · สตางค์):
//   C1 มัดจำ 10,000 + 700 = 10,700 รับ 5 ส.ค. (โอน) ⇒ ใบกำกับมัดจำ VAT 70,000 · คืน 2 ต.ค. ⇒ ใบลดหนี้ 1,070,000 (ฐาน 1,000,000 VAT 70,000)
//      อ้างใบกำกับมัดจำ · เหตุ CN_DEPOSIT_REFUND · ลงวันที่ 2026-10-02 · JV Dr 2110 1,000,000 · Dr 2200 70,000 / Cr ธนาคาร 1,070,000
//      ใบรับมัดจำ DEDUCTED · ใบกำกับมัดจำ ISSUED · รายงาน ส.ค. +70,000 · ต.ค. −70,000 (แถวใบลดหนี้) · คืนซ้ำ = ปฏิเสธ
//   C2 ยกเลิกใบลดหนี้ ⇒ JV กลับ · มัดจำกลับเป็น AWAITING_DEDUCT (หักได้อีก)
//   C3 มัดจำ 20,000 + 1,400 = 21,400 รับ 6 ส.ค. · ใบแจ้งหนี้ 40,000 หักมัดจำ 10,700 (บางส่วน) · คืนส่วนที่เหลือ 10,700 ⇒ ใบลดหนี้ 1 บรรทัด ฐาน 1,000,000 VAT 70,000 · มัดจำ DEDUCTED
//   C4 ริบ (ค่าเริ่ม KEEP_VAT) มัดจำ 5,000 + 350 = 5,350 ⇒ ไม่มีใบลดหนี้ · JV Dr 2110 500,000 / Cr 4900 500,000 · 2200 ไม่เปลี่ยน · คำเตือน DEPOSIT_FORFEIT_VAT [U] ไม่ยืนยัน · คืนต่อไม่ได้
//   C5 ริบ (ค่าตั้ง CREDIT_NOTE) มัดจำ 5,000 + 350 ⇒ ใบลดหนี้ 535,000 · JV Dr 2110 500,000 · Dr 2200 35,000 / Cr 4900 535,000
//   C6 ร้านไม่จด VAT: มัดจำ 3,000 คืน ⇒ ทางเดิม (ใบรับมัดจำ VOIDED · JV กลับ · ไม่มีใบลดหนี้)
//   C7 ใบรับมัดจำรับบางส่วน (ยังไม่มี JV) + ใบกำกับออกเอง ⇒ ยกเลิกรายการรับ แล้วยกเลิกใบรับมัดจำ ⇒ ใบกำกับ VOIDED
//   C8 คืนลงวันที่ในเดือนที่ทำเครื่องหมายยื่น ภ.พ.30 แล้ว ⇒ FILED_PERIOD_VAT_CHANGE (ต้องยืนยัน) · ยืนยันแล้วผ่าน
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-acc-v2-deposit-refund");

const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
const { withLegalAck } = await import("@/lib/core/legal-ambient");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, exp: unknown, act: unknown, sev: Sev = "CRITICAL") => {
  cks.push({ id, ok, sev });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${JSON.stringify(exp)} | act ${JSON.stringify(act)?.slice(0, 700)}`}`);
};
const D = (m: number, d: number) => new Date(Date.UTC(2026, m - 1, d, 5));
const DAY = (s: string) => new Date(`${s}T00:00:00.000Z`);
const ymd = (d: Date) => new Date(d.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);

const tids: string[] = [];
const users: string[] = [];
try {
  const acc = (await import("@/lib/modules/account/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const gl = (await import("@/lib/modules/account/gl" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const DS = (await import("@/lib/modules/account/doc-settings" as string)) as Any;
  const fin = (await import("@/lib/modules/account/finance" as string)) as Any;
  const SR = (await import("@/lib/modules/account/sales-tax-report" as string)) as Any;
  const PC = (await import("@/lib/modules/account/period-close" as string)) as Any;
  const LGX = (await import("@/lib/modules/account/legal-gate" as string)) as Any;

  const stamp = Date.now();
  const owner = await prisma.user.create({ data: { email: `qc-t24-${stamp}@qc.local`, name: "เจ้าของ T2.4" } });
  users.push(owner.id);
  const mkShop = async (label: string, vat: boolean) => {
    const t = await prisma.tenant.create({ data: { name: `QC T2.4 ${label}`, slug: `qc-t24-${label}-${stamp}` } });
    tids.push(t.id);
    await prisma.membership.create({ data: { userId: owner.id, tenantId: t.id, role: "OWNER", unitAccess: ["*"], acceptedAt: new Date() } });
    const S = (await sys.createSystem(t.id, "ACCOUNT", `บัญชี T2.4 ${label}`)).id;
    await acc.saveSettings(t.id, S, { orgName: `ร้าน T2.4 ${label}`, vatRegistered: vat, vatRateBp: 700, taxId: "0105561000240", address: "24 ถ.ทดสอบ" });
    await gl.ensureAccounting({ tenantId: t.id, systemId: S });
    const bank = await fin.createFinanceAccount({ tenantId: t.id, systemId: S, type: "BANK", name: "ออมทรัพย์", bankName: "กสิกรไทย" });
    const cust = await acc.createContact({ tenantId: t.id, systemId: S, kind: "CUSTOMER", legalType: "COMPANY", name: `ลูกค้า ${label}`, taxId: "0105561999240", branchCode: "00000", address: "1 ถ.ลูกค้า" });
    return { tid: t.id, S, ctx: { tenantId: t.id, systemId: S }, bank, cust };
  };
  const V = await mkShop("vat", true);
  const { tid, S, ctx, bank, cust } = V;
  const code = async (c: string) => (await prisma.accountLedger.findFirst({ where: { systemId: S, code: c }, select: { id: true } }))!.id;
  const A2110 = await code("2110");
  const A2200 = await code("2200");
  const A4900 = await code("4900");
  const bankLedger = (await prisma.accountFinance.findUnique({ where: { id: bank.id }, select: { ledgerAccountId: true } }))!.ledgerAccountId!;
  const netOf = async (accountId: string, refIds: string[]) => {
    const ls = await prisma.accountJournalLine.findMany({ where: { systemId: S, accountId, entry: { refType: "AccountDocument", refId: { in: refIds } } }, select: { debit: true, credit: true } });
    return ls.reduce((n, l) => n + l.credit - l.debit, 0);
  };
  const mkDep = async (amt: number, issue: Date, pay: Date, key: string, shop = V) => {
    const d = await acc.createDocument({ tenantId: shop.tid, systemId: shop.S, docType: "DEPOSIT_RECEIPT", contactId: shop.cust.id, vatMode: shop === V ? "EXCLUDE" : "NONE", issueDate: issue, dueDate: issue, lines: [{ description: "มัดจำทริป", qty: 1, unitPrice: amt, vatRateBp: shop === V ? 700 : 0 }], createdById: owner.id });
    const i = await acc.issueDocument(shop.tid, shop.S, d.id, { ack: { codes: ["SALE_WITHOUT_VAT_REGISTERED"], actorId: owner.id, via: "qc" } });
    if (!i.ok) throw new Error(`ออกใบรับมัดจำไม่ได้ ${JSON.stringify(i)}`);
    const full = shop === V ? Math.round(amt * 1.07) : amt;
    const p = await acc.recordPayment(shop.tid, shop.S, d.id, { paidAt: pay, financeAccountId: shop.bank.id, channel: "TRANSFER", amount: full, createdById: owner.id, idempotencyKey: `${key}-${stamp}` });
    if (!p.ok) throw new Error(`รับมัดจำไม่ได้ ${JSON.stringify(p)}`);
    return d.id as string;
  };
  const tiOf = (depId: string) => prisma.accountDocument.findFirst({ where: { systemId: S, docType: "TAX_INVOICE", sourceDocId: depId }, orderBy: { createdAt: "desc" } });
  const doc = (id: string) => prisma.accountDocument.findUnique({ where: { id }, include: { lines: true } });

  // ═══ C1 คืนมัดจำทั้งใบ ═══
  console.log("\nC1 คืนมัดจำที่ออกใบกำกับแล้ว → ใบลดหนี้อ้างใบกำกับ:");
  const c1 = await mkDep(1_000_000, D(8, 5), D(8, 5), "c1");
  const c1ti = await tiOf(c1);
  const prev = await acc.depositSettlePreview(tid, S, c1);
  chk("C1.0", "ดูก่อนคืน: เลขใบกำกับมัดจำ · คงเหลือ 1,070,000 (VAT 70,000) · คำเตือน DEPOSIT_REFUND_CREDIT_NOTE (V · ไม่ยืนยัน) · ริบค่าเริ่ม KEEP_VAT", prev?.taxInvoiceNo === c1ti?.docNo && prev.gross === 1_070_000 && prev.vat === 70_000 && prev.refundWarnings[0]?.code === "DEPOSIT_REFUND_CREDIT_NOTE" && prev.refundWarnings[0].ack === false && prev.forfeitMode === "KEEP_VAT", "ตามนั้น", prev);
  const r1 = await acc.refundDeposit(tid, S, c1, "ลูกค้ายกเลิกทริป", { date: DAY("2026-10-02"), createdById: owner.id });
  const cn1 = r1.ok && r1.creditNoteId ? await doc(r1.creditNoteId) : null;
  {
    const dep = await doc(c1);
    const ti = await doc(c1ti!.id);
    chk("C1.1", "คืนสำเร็จ · ใบลดหนี้ ISSUED มีเลข · 1,070,000 / ฐาน 1,000,000 / VAT 70,000 · ลงวันที่ 2026-10-02", r1.ok && r1.refunded === 1_070_000 && cn1?.status === "ISSUED" && !!cn1.docNo && r1.creditNoteNo === cn1.docNo && cn1.grandTotal === 1_070_000 && cn1.subTotal === 1_000_000 && cn1.vatAmount === 70_000 && ymd(cn1.issueDate) === "2026-10-02", "CN", { r1, cn: cn1 && [cn1.status, cn1.docNo, cn1.grandTotal, cn1.subTotal, cn1.vatAmount, ymd(cn1.issueDate)] });
    chk("C1.2", "อ้างใบกำกับมัดจำ (sourceDocId + อ้างอิงเลข) · เหตุผล CN_DEPOSIT_REFUND · บรรทัดยกจากใบกำกับ", cn1?.sourceDocId === c1ti?.id && cn1?.reference === c1ti?.docNo && cn1?.adjustReasonCode === "CN_DEPOSIT_REFUND" && cn1.adjustReason === "ลูกค้ายกเลิกทริป" && cn1.lines.length === 1 && cn1.lines[0].description === "มัดจำทริป", "อ้างใบกำกับ", cn1 && { src: cn1.sourceDocId, ref: cn1.reference, code: cn1.adjustReasonCode, l: cn1.lines.map((l) => l.description) });
    chk("C1.3", "ใบรับมัดจำคงอยู่ (DEDUCTED · ไม่ยกเลิก · รายการรับไม่ถูกยกเลิก) · ใบกำกับมัดจำ ISSUED", dep?.status === "DEDUCTED" && ti?.status === "ISSUED" && (await prisma.accountDocumentPayment.count({ where: { documentId: c1, voidedAt: null } })) === 1, "DEDUCTED/ISSUED", { d: dep?.status, t: ti?.status });
    const je = cn1 ? await prisma.accountJournalEntry.findMany({ where: { systemId: S, refType: "AccountDocument", refId: cn1.id }, include: { lines: true } }) : [];
    const ln = je.flatMap((e) => e.lines);
    const dr = (a: string) => ln.filter((l) => l.accountId === a).reduce((n, l) => n + l.debit - l.credit, 0);
    chk("C1.4", "JV ใบลดหนี้ 1 ชุด ลงวันที่ 2026-10-02: Dr 2110 1,000,000 · Dr 2200 70,000 · Cr ธนาคาร 1,070,000", je.length === 1 && ymd(je[0].date) === "2026-10-02" && dr(A2110) === 1_000_000 && dr(A2200) === 70_000 && dr(bankLedger) === -1_070_000, "JV", je.map((e) => ({ d: ymd(e.date), l: e.lines.map((l) => [l.accountId === A2110 ? "2110" : l.accountId === A2200 ? "2200" : l.accountId === bankLedger ? "bank" : l.accountId, l.debit, l.credit]) })));
    const aug = await SR.salesTaxReport(ctx, "2026-08");
    const oct = await SR.salesTaxReport(ctx, "2026-10");
    const cnRow = oct.rows.find((r: Any) => r.docId === cn1?.id);
    chk("C1.5", "รายงาน ส.ค. +70,000 (แถวมัดจำ) · ต.ค. −70,000 แถวใบลดหนี้ อ้างเลขใบกำกับมัดจำ · รายงาน = GL", aug.total.vat === 70_000 && oct.total.vat === -70_000 && oct.glVat === -70_000 && !!cnRow && cnRow.vat === -70_000 && cnRow.notes.some((n: string) => n.includes(c1ti?.docNo ?? "§")), "+70000/−70000", { a: aug.total.vat, o: oct.total.vat, row: cnRow && [cnRow.docNo, cnRow.vat, cnRow.notes] });
    const again = await acc.refundDeposit(tid, S, c1, "คืนซ้ำ");
    chk("C1.6", "คืนซ้ำ ⇒ ปฏิเสธ (ไม่มียอดคงเหลือ)", !again.ok, "ปฏิเสธ", again);
    chk("C1.7", "ผลมีคำเตือน DEPOSIT_REFUND_CREDIT_NOTE (เลขใบกำกับ · ยอด · วันที่)", r1.ok && r1.warnings?.[0]?.code === "DEPOSIT_REFUND_CREDIT_NOTE" && r1.warnings[0].messageTh.includes(c1ti?.docNo ?? "§"), "warning", r1.ok && r1.warnings, "MAJOR");
  }

  // ═══ C2 ยกเลิกใบลดหนี้ ═══
  console.log("\nC2 ยกเลิกใบลดหนี้ของการคืนมัดจำ → มัดจำกลับมาหักได้:");
  {
    const v = cn1 ? await acc.voidDocument(tid, S, cn1.id, "คืนเงินผิดใบ") : null;
    const dep = await doc(c1);
    const n2200 = await netOf(A2200, [c1, cn1?.id ?? "§"]);
    chk("C2.1", "ยกเลิกได้ · มัดจำ AWAITING_DEDUCT · 2200 (ใบมัดจำ + ใบลดหนี้) กลับเป็น 70,000", v?.ok && dep?.status === "AWAITING_DEDUCT" && n2200 === 70_000, "AWAITING_DEDUCT/70000", { v, s: dep?.status, n2200 });
  }

  // ═══ C3 คืนส่วนที่เหลือหลังหักบางส่วน ═══
  console.log("\nC3 มัดจำที่ถูกหักบางส่วน → คืนเฉพาะส่วนที่เหลือ:");
  {
    const c3 = await mkDep(2_000_000, D(8, 6), D(8, 6), "c3");
    const iv = await acc.createDocument({ tenantId: tid, systemId: S, docType: "INVOICE", contactId: cust.id, vatMode: "EXCLUDE", issueDate: D(9, 1), dueDate: D(9, 1), lines: [{ description: "ทริป", qty: 1, unitPrice: 4_000_000, vatRateBp: 700, lineKind: "SERVICE" }], createdById: owner.id });
    const sd = await acc.setDocDeposits(tid, S, iv.id, [{ depositId: c3, amountSatang: 1_070_000 }]);
    await acc.issueDocument(tid, S, iv.id);
    const p = await acc.depositSettlePreview(tid, S, c3);
    const r = await acc.refundDeposit(tid, S, c3, "ทริปสั้นลง", { date: DAY("2026-09-15") });
    const cn = r.ok && r.creditNoteId ? await doc(r.creditNoteId) : null;
    chk("C3.0", "ตั้งหักมัดจำ 1,070,000 ในใบแจ้งหนี้ · ดูก่อนคืน = คงเหลือ 1,070,000 (VAT 70,000)", (sd?.ok ?? true) && p?.gross === 1_070_000 && p.vat === 70_000, "1070000", { sd, p: p && [p.gross, p.vat] });
    chk("C3.1", "ใบลดหนี้ส่วนที่เหลือ 1 บรรทัด: ฐาน 1,000,000 VAT 70,000 รวม 1,070,000 · มัดจำ DEDUCTED", r.ok && cn?.grandTotal === 1_070_000 && cn.subTotal === 1_000_000 && cn.vatAmount === 70_000 && cn.lines.length === 1 && cn.lines[0].description.includes("ส่วนที่ยังไม่ได้หัก") && (await doc(c3))?.status === "DEDUCTED", "บางส่วน", { r, cn: cn && [cn.grandTotal, cn.subTotal, cn.vatAmount, cn.lines.map((l) => l.description)] });
  }

  // ═══ C4 ริบ ค่าเริ่ม KEEP_VAT ═══
  console.log("\nC4 ริบมัดจำ (ค่าเริ่ม: ไม่ออกใบลดหนี้ — skill §7 [U]):");
  {
    const c4 = await mkDep(500_000, D(9, 3), D(9, 3), "c4");
    const before2200 = await netOf(A2200, [c4]);
    const r = await acc.forfeitDeposit(tid, S, c4, "ลูกค้าไม่มาตามนัด", { date: DAY("2026-09-20") });
    const cnCount = await prisma.accountDocument.count({ where: { systemId: S, docType: "CREDIT_NOTE", refId: c4 } });
    const je = await prisma.accountJournalEntry.findMany({ where: { systemId: S, refType: "AccountDocument", refId: c4, idempotencyKey: { endsWith: "#FORFEIT" } }, include: { lines: true } });
    const ln = je.flatMap((e) => e.lines);
    const drOf = (a: string) => ln.filter((l) => l.accountId === a).reduce((n, l) => n + l.debit - l.credit, 0);
    chk("C4.1", "ริบสำเร็จ mode KEEP_VAT · ไม่มีใบลดหนี้ · มัดจำ DEDUCTED", r.ok && r.mode === "KEEP_VAT" && r.forfeited === 535_000 && cnCount === 0 && (await doc(c4))?.status === "DEDUCTED", "KEEP_VAT", { r, cnCount });
    chk("C4.2", "JV ริบ 2026-09-20: Dr 2110 500,000 / Cr 4900 500,000 · 2200 ไม่เปลี่ยน (35,000)", je.length === 1 && ymd(je[0].date) === "2026-09-20" && drOf(A2110) === 500_000 && drOf(A4900) === -500_000 && (await netOf(A2200, [c4])) === before2200 && before2200 === 35_000, "JV", { je: je.map((e) => [ymd(e.date), e.lines.map((l) => [l.debit, l.credit])]), before2200 });
    const w = r.ok ? r.warnings?.[0] : null;
    chk("C4.3", "คำเตือน DEPOSIT_FORFEIT_VAT ป้าย U · ไม่ต้องยืนยัน · ต่อท้าย \"โปรดตรวจกับนักบัญชีของร้าน\" · ไม่เขียนว่า \"ถูกกฎหมาย\"", w?.code === "DEPOSIT_FORFEIT_VAT" && w.tag === "U" && w.ack === false && w.messageTh.includes("โปรดตรวจกับนักบัญชีของร้าน") && !w.messageTh.includes("ถูกกฎหมาย"), "U", w);
    const again = await acc.refundDeposit(tid, S, c4, "ขอคืน");
    const again2 = await acc.forfeitDeposit(tid, S, c4, "ริบซ้ำ");
    chk("C4.4", "ริบแล้ว: คืน/ริบซ้ำไม่ได้", !again.ok && !again2.ok, "ปฏิเสธ", { again, again2 });
  }

  // ═══ C5 ริบ ค่าตั้ง CREDIT_NOTE ═══
  console.log("\nC5 ริบมัดจำ (ค่าตั้งร้าน: ออกใบลดหนี้):");
  {
    const s = await DS.saveDocSettings(ctx, { deposit: { forfeit: "CREDIT_NOTE" } });
    const c5 = await mkDep(500_000, D(9, 4), D(9, 4), "c5");
    const r = await acc.forfeitDeposit(tid, S, c5, "ยกเลิกเกินกำหนด", { date: DAY("2026-09-21") });
    const cn = r.ok && r.creditNoteId ? await doc(r.creditNoteId) : null;
    const ti = await tiOf(c5);
    chk("C5.1", "ค่าตั้งบันทึกได้ · ใบลดหนี้ 535,000 (VAT 35,000) อ้างใบกำกับมัดจำ · refType DepositForfeit", s.ok && r.ok && r.mode === "CREDIT_NOTE" && cn?.grandTotal === 535_000 && cn.vatAmount === 35_000 && cn.sourceDocId === ti?.id && cn.refType === "DepositForfeit", "CN", { s, r, cn: cn && [cn.grandTotal, cn.vatAmount, cn.refType] });
    const ln = cn ? (await prisma.accountJournalEntry.findMany({ where: { systemId: S, refType: "AccountDocument", refId: cn.id }, include: { lines: true } })).flatMap((e) => e.lines) : [];
    const drOf = (a: string) => ln.filter((l) => l.accountId === a).reduce((n, l) => n + l.debit - l.credit, 0);
    chk("C5.2", "JV: Dr 2110 500,000 · Dr 2200 35,000 / Cr 4900 535,000 (ค่าเสียหายไม่มี VAT)", drOf(A2110) === 500_000 && drOf(A2200) === 35_000 && drOf(A4900) === -535_000, "JV", ln.map((l) => [l.accountId, l.debit, l.credit]));
    await DS.saveDocSettings(ctx, { deposit: { forfeit: "KEEP_VAT" } });
  }

  // ═══ C6 ร้านไม่จด VAT ═══
  console.log("\nC6 ร้านไม่จด VAT → คืนแบบเดิม (ไม่มีใบกำกับ ⇒ ไม่มีใบลดหนี้):");
  {
    const N = await mkShop("novat", false);
    const c6 = await mkDep(300_000, D(9, 5), D(9, 5), "c6", N);
    const r = await acc.refundDeposit(N.tid, N.S, c6, "ลูกค้ายกเลิก");
    const d = await prisma.accountDocument.findUnique({ where: { id: c6 } });
    const cnCount = await prisma.accountDocument.count({ where: { systemId: N.S, docType: "CREDIT_NOTE" } });
    const jes = await prisma.accountJournalEntry.count({ where: { systemId: N.S, refType: "AccountDocument", refId: c6 } });
    chk("C6.1", "VOIDED · ไม่มีใบลดหนี้ · JV เดิม + กลับรายการ (2 ชุด)", r.ok && !r.creditNoteId && d?.status === "VOIDED" && cnCount === 0 && jes === 2, "VOIDED/0/2", { r, s: d?.status, cnCount, jes });
  }

  // ═══ C7 ยกเลิกใบรับมัดจำ ⇒ ใบกำกับยกเลิกตาม ═══
  console.log("\nC7 ยกเลิกใบรับมัดจำ → ใบกำกับของมัดจำยกเลิกตาม:");
  {
    const d = await acc.createDocument({ tenantId: tid, systemId: S, docType: "DEPOSIT_RECEIPT", contactId: cust.id, vatMode: "EXCLUDE", issueDate: D(9, 6), dueDate: D(9, 6), lines: [{ description: "มัดจำ C7", qty: 1, unitPrice: 1_000_000, vatRateBp: 700 }], createdById: owner.id });
    await acc.issueDocument(tid, S, d.id);
    const p = await acc.recordPayment(tid, S, d.id, { paidAt: D(9, 6), financeAccountId: bank.id, channel: "TRANSFER", amount: 500_000, createdById: owner.id, idempotencyKey: `c7-${stamp}` });
    const cv = await acc.convertDocument(tid, S, d.id, "TAX_INVOICE", owner.id);
    if (cv.ok) await acc.issueDocument(tid, S, cv.newId, { ack: { codes: ["SALE_WITHOUT_VAT_REGISTERED"], actorId: owner.id, via: "qc" } });
    const ti0 = cv.ok ? await doc(cv.newId) : null;
    const vp = await acc.voidPayment(tid, S, d.id, p.paymentId, "รับผิดใบ");
    const vd = await acc.voidDocument(tid, S, d.id, "ลูกค้าไม่จองแล้ว");
    const ti = cv.ok ? await doc(cv.newId) : null;
    chk("C7.1", "รับบางส่วน + ใบกำกับออกเอง (ISSUED) → ยกเลิกรายการรับ → ยกเลิกใบรับมัดจำ ⇒ ใบกำกับ VOIDED อ้างใบรับมัดจำ", ti0?.status === "ISSUED" && vp.ok && vd.ok && ti?.status === "VOIDED" && (ti.voidReason ?? "").includes("ยกเลิกตามใบรับเงินมัดจำ"), "VOIDED", { ti0: ti0?.status, vp, vd, ti: ti && [ti.status, ti.voidReason] });
  }

  // ═══ C8 เดือนที่ยื่นแล้ว ═══
  console.log("\nC8 คืนลงวันที่ในเดือนที่ยื่น ภ.พ.30 แล้ว → ต้องยืนยัน FILED_PERIOD_VAT_CHANGE:");
  {
    const c8 = await mkDep(400_000, D(7, 2), D(7, 2), "c8");
    const mark = await PC.markVatFiled(ctx, { periodKey: "2026-07", userId: owner.id });
    const r0: Any = await LGX.withScreenLegal({ codes: [], actorId: owner.id, via: "qc" }, () => acc.refundDeposit(tid, S, c8, "คืนย้อนเดือน", { date: DAY("2026-07-20") }));
    const r1 = await withLegalAck({ codes: ["FILED_PERIOD_VAT_CHANGE"], actorId: owner.id, via: "qc" }, () => acc.refundDeposit(tid, S, c8, "คืนย้อนเดือน", { date: DAY("2026-07-20") }));
    chk("C8.1", "ยังไม่ยืนยัน ⇒ legal FILED_PERIOD_VAT_CHANGE · ยืนยันแล้วคืนได้", mark.ok && !r0.ok && r0.legal?.warnings?.some((w: Any) => w.code === "FILED_PERIOD_VAT_CHANGE") && r1.ok && !!r1.creditNoteId, "ack→ok", { mark, r0, r1 }, "MAJOR");
  }
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? `${e.message.slice(0, 400)}\n${e.stack?.split("\n").slice(1, 6).join("\n")}` : String(e));
} finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  for (const tid of tids) {
    const P = prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown>; updateMany: (a: unknown) => Promise<unknown> }>;
    await d(() => P.accountJournalLine.deleteMany({ where: { tenantId: tid } }));
    await d(() => P.accountJournalEntry.updateMany({ where: { tenantId: tid }, data: { reversalOfId: null } }));
    await d(() => P.accountJournalEntry.deleteMany({ where: { tenantId: tid } }));
    await d(() => P.accountDocument.updateMany({ where: { tenantId: tid }, data: { sourceDocId: null, replacedById: null, sourcePaymentId: null } }));
    await d(() => P.accountDocumentPayment.deleteMany({ where: { tenantId: tid } }));
    await d(() => P.accountDocumentRelation.deleteMany({ where: { tenantId: tid } }));
    await d(() => P.accountDocumentLine.deleteMany({ where: { tenantId: tid } }));
    await d(() => P.accountDocumentPrint.deleteMany({ where: { tenantId: tid } }));
    for (const m of ["accountVatFiling", "accountVatFilingEvent", "accountAttachment", "accountDocument", "accountDocSequence", "accountProduct", "accountMapping", "accountFinance", "accountContact", "accountPeriod", "accountSettings", "settingChange", "settingValue", "auditLog", "outboxEvent", "membership", "appSystemUnit"]) {
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
console.log(`\n===== QC ACC T2.4 คืน/ริบมัดจำ =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => `${c.id} (${c.sev})`) })}`);
process.exit(f.length ? 1 : 0);
