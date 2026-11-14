// QC ACC T3 Job A — ของค้างจาก T2: ป้ายคืน/ริบมัดจำตามจริง (A2) · ริบซ้ำหลังกลับรายการลงบัญชีจริง (A3) ·
//   ผู้ซื้อไม่มีเลขไม่พิมพ์สาขา (A4) · กติกาเดียว BUYER_TAX_ID_MISSING ฝั่งบัญชี (A5)
//
// ฟิกซ์เจอร์ของตัวเอง (ร้านทิ้ง) · รัน: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-acc-v2-t3a-leftovers.mts
//
// เฉลยคำนวณมือ (7% · สตางค์):
//   A2.1 มัดจำ 10,000 + 700 = 1,070,000 รับครบ (ใบกำกับมัดจำออกเอง) · คืนทั้งใบ ⇒ ใบลดหนี้ 1,070,000 · สถานะ DEDUCTED แต่ป้าย "คืนมัดจำแล้ว"
//        (ไม่ใช่ "หักมัดจำแล้ว") · REST docRow/docDetail.depositSettlement = REFUNDED 1,070,000 ไม่ partial
//   A2.2 ยกเลิกใบลดหนี้ ⇒ ป้ายกลับเป็นปกติ (null) · สถานะ AWAITING_DEDUCT
//   A2.3 มัดจำ 20,000 + 1,400 = 2,140,000 · ใบแจ้งหนี้หักมัดจำ 1,070,000 · คืนส่วนที่เหลือ 1,070,000 ⇒ "คืนมัดจำบางส่วน" (partial)
//   A2.4 ร้านไม่จด VAT มัดจำ 300,000 คืน ⇒ ใบ VOIDED แต่ป้าย "คืนมัดจำแล้ว" (ไม่ใช่ "ยกเลิก")
//   A3   มัดจำ 5,000 + 350 = 535,000 ริบ (KEEP_VAT) ⇒ "ริบมัดจำแล้ว" · JV FORFEIT Cr 4900 500,000
//        กลับรายการ JV ริบ ⇒ AWAITING_DEDUCT · ป้าย null · ยังไม่ถือว่าริบ · ริบอีกครั้ง ⇒ JV ใหม่ (คีย์ FORFEIT:R1) Cr 4900 สุทธิ 500,000 · ป้าย "ริบมัดจำแล้ว"
//   A4   buyerBranchLabel: ไม่มีเลข + 00000 ⇒ "" · มีเลข + 00000 ⇒ "สำนักงานใหญ่" · มีเลข + 00002 ⇒ "สาขา 00002" · ใบพิมพ์ใบกำกับผู้ซื้อไม่มีเลข ⇒ สาขาว่าง
//   A5   taxInvoiceBuyerWarnings: กิจการไม่มีเลข ⇒ BUYER_TAX_ID_MISSING ack:true · บุคคลไม่มีเลข ⇒ ไม่มี · ไม่รู้ประเภท ⇒ ack:false
//        ลิงก์สาธารณะ: เลือก "กิจการ" ไม่กรอกเลข ⇒ คำขอมีคำเตือน (แจ้ง) · อนุมัติไม่ยืนยัน ⇒ LEGAL_ACK_REQUIRED · ยืนยัน ⇒ ออกได้ ·
//        เลือก "บุคคล" ไม่กรอกเลข ⇒ อนุมัติได้เลย · snapshot ไม่มีรหัสสาขา
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-acc-v2-t3a-leftovers");

const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, exp: unknown, act: unknown, sev: Sev = "CRITICAL") => {
  cks.push({ id, ok, sev });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${JSON.stringify(exp)} | act ${JSON.stringify(act)?.slice(0, 700)}`}`);
};
const D = (m: number, d: number) => new Date(Date.UTC(2026, m - 1, d, 5));

const tids: string[] = [];
const users: string[] = [];
try {
  const acc = (await import("@/lib/modules/account/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const gl = (await import("@/lib/modules/account/gl" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const fin = (await import("@/lib/modules/account/finance" as string)) as Any;
  const DO = (await import("@/lib/modules/account/deposit-outcome" as string)) as Any;
  const LC = (await import("@/lib/modules/account/list-columns" as string)) as Any;
  const SER = (await import("@/lib/modules/account/api/serialize" as string)) as Any;
  const DD = (await import("@/lib/modules/account/doc-detail" as string)) as Any;
  const PS = (await import("@/lib/modules/account/print-shared" as string)) as Any;
  const PV = (await import("@/lib/modules/account/print-view" as string)) as Any;
  const LGX = (await import("@/lib/modules/account/legal-gate" as string)) as Any;

  const stamp = Date.now();
  const owner = await prisma.user.create({ data: { email: `qc-t3a-${stamp}@qc.local`, name: "เจ้าของ T3A" } });
  users.push(owner.id);
  const mkShop = async (label: string, vat: boolean) => {
    const t = await prisma.tenant.create({ data: { name: `QC T3A ${label}`, slug: `qc-t3a-${label}-${stamp}` } });
    tids.push(t.id);
    await prisma.membership.create({ data: { userId: owner.id, tenantId: t.id, role: "OWNER", unitAccess: ["*"], acceptedAt: new Date() } });
    const S = (await sys.createSystem(t.id, "ACCOUNT", `บัญชี T3A ${label}`)).id;
    await acc.saveSettings(t.id, S, { orgName: `ร้าน T3A ${label}`, vatRegistered: vat, vatRateBp: 700, taxId: "0105561000240", address: "3 ถ.ทดสอบ" });
    await gl.ensureAccounting({ tenantId: t.id, systemId: S });
    const bank = await fin.createFinanceAccount({ tenantId: t.id, systemId: S, type: "BANK", name: "ออมทรัพย์", bankName: "กสิกรไทย" });
    const cust = await acc.createContact({ tenantId: t.id, systemId: S, kind: "CUSTOMER", legalType: "COMPANY", name: `ลูกค้า ${label}`, taxId: "0105561999240", branchCode: "00000", address: "1 ถ.ลูกค้า" });
    return { tid: t.id, S, ctx: { tenantId: t.id, systemId: S }, bank, cust, vat };
  };
  const V = await mkShop("vat", true);
  const N = await mkShop("novat", false);
  const { tid, S } = V;
  const mkDep = async (amt: number, key: string, shop = V) => {
    const d = await acc.createDocument({ tenantId: shop.tid, systemId: shop.S, docType: "DEPOSIT_RECEIPT", contactId: shop.cust.id, vatMode: shop.vat ? "EXCLUDE" : "NONE", issueDate: D(8, 5), dueDate: D(8, 5), lines: [{ description: "มัดจำทริป", qty: 1, unitPrice: amt, vatRateBp: shop.vat ? 700 : 0 }], createdById: owner.id });
    const i = await acc.issueDocument(shop.tid, shop.S, d.id, { ack: { codes: ["SALE_WITHOUT_VAT_REGISTERED"], actorId: owner.id, via: "qc" } });
    if (!i.ok) throw new Error(`ออกใบรับมัดจำไม่ได้ ${JSON.stringify(i)}`);
    const full = shop.vat ? Math.round(amt * 1.07) : amt;
    const p = await acc.recordPayment(shop.tid, shop.S, d.id, { paidAt: D(8, 5), financeAccountId: shop.bank.id, channel: "TRANSFER", amount: full, createdById: owner.id, idempotencyKey: `${key}-${stamp}` });
    if (!p.ok) throw new Error(`รับมัดจำไม่ได้ ${JSON.stringify(p)}`);
    return d.id as string;
  };
  const doc = (id: string) => prisma.accountDocument.findUnique({ where: { id } });
  const label = async (id: string) => { const d = await doc(id); return d ? DO.depositOutcomeLabel(d) : "§"; };

  // ═══ A2 ป้ายคืน/ริบมัดจำ ═══
  console.log("\nA2 ป้ายสถานะใบมัดจำที่คืน/ริบ:");
  const a1 = await mkDep(1_000_000, "a1");
  const r1 = await acc.refundDeposit(tid, S, a1, "ลูกค้ายกเลิก", { createdById: owner.id });
  {
    const d = await doc(a1);
    const v = DO.depositSettlementView(d);
    chk("A2.1", "คืนทั้งใบ: สถานะ DEDUCTED แต่ป้าย \"คืนมัดจำแล้ว\" · REFUNDED 1,070,000 ไม่ partial", r1.ok && d?.status === "DEDUCTED" && v?.labelTh === "คืนมัดจำแล้ว" && v.kind === "REFUNDED" && v.refundedSatang === 1_070_000 && v.partial === false, "คืนมัดจำแล้ว", { r1, s: d?.status, v });
    chk("A2.1b", "หน้ารายการ (rowStatusLabel) ขึ้น \"คืนมัดจำแล้ว\" ไม่ใช่ \"หักมัดจำแล้ว\"", LC.rowStatusLabel(d!.status, d) === "คืนมัดจำแล้ว", "คืนมัดจำแล้ว", LC.rowStatusLabel(d!.status, d));
    const row = SER.docRow({ ...d, contact: null, tags: d!.tags ?? [] });
    chk("A2.1c", "REST แถวรายการ: depositSettlement {REFUNDED, 1,070,000, label}", row.depositSettlement?.kind === "REFUNDED" && row.depositSettlement.refundedSatang === 1_070_000 && row.depositSettlement.label === "คืนมัดจำแล้ว", "REFUNDED", row.depositSettlement);
    const det = await DD.getDocDetailData(tid, S, a1).catch(() => null);
    if (det) chk("A2.1d", "หน้ารายละเอียด/REST detail: depositSettlement.labelTh = คืนมัดจำแล้ว", det.depositSettlement?.labelTh === "คืนมัดจำแล้ว" && SER.docDetail(det).depositSettlement?.kind === "REFUNDED", "คืนมัดจำแล้ว", det.depositSettlement, "MAJOR");
    const pv = await acc.depositSettlePreview(tid, S, a1);
    chk("A2.1e", "GET deposit-settlement: settlement.label = คืนมัดจำแล้ว", pv?.settlement?.label === "คืนมัดจำแล้ว", "คืนมัดจำแล้ว", pv?.settlement);
    const cn = r1.ok ? r1.creditNoteId : null;
    const vd = cn ? await acc.voidDocument(tid, S, cn, "คืนผิดใบ") : null;
    const d2 = await doc(a1);
    chk("A2.2", "ยกเลิกใบลดหนี้ ⇒ ป้ายกลับปกติ (null) · AWAITING_DEDUCT", vd?.ok && d2?.status === "AWAITING_DEDUCT" && (await label(a1)) === null, "null/AWAITING_DEDUCT", { vd, s: d2?.status, l: await label(a1) });
  }
  {
    const a3 = await mkDep(2_000_000, "a3");
    const inv = await acc.createDocument({ tenantId: tid, systemId: S, docType: "INVOICE", contactId: V.cust.id, vatMode: "EXCLUDE", issueDate: D(9, 1), dueDate: D(9, 30), lines: [{ description: "ทริป", qty: 1, unitPrice: 4_000_000, vatRateBp: 700, lineKind: "SERVICE" }], createdById: owner.id });
    await acc.setDocDeposits(tid, S, inv.id, [{ depositId: a3, amountSatang: 1_070_000 }]);
    const ii = await acc.issueDocument(tid, S, inv.id, {});
    const r3 = await acc.refundDeposit(tid, S, a3, "คืนส่วนที่เหลือ", { createdById: owner.id });
    const d = await doc(a3);
    const v = DO.depositSettlementView(d);
    chk("A2.3", "หักบางส่วนแล้วคืนส่วนที่เหลือ ⇒ \"คืนมัดจำบางส่วน\" (partial · คืน 1,070,000 จาก 2,140,000)", ii.ok && r3.ok && v?.labelTh === "คืนมัดจำบางส่วน" && v.partial === true && v.refundedSatang === 1_070_000, "คืนมัดจำบางส่วน", { ii: ii.ok ? "ok" : ii, r3, v }, "MAJOR");
  }
  {
    const a4 = await mkDep(300_000, "a4", N);
    const r4 = await acc.refundDeposit(N.tid, N.S, a4, "ยกเลิก", { createdById: owner.id });
    const d = await doc(a4);
    chk("A2.4", "ร้านไม่จด VAT คืน ⇒ ใบ VOIDED แต่ป้าย \"คืนมัดจำแล้ว\" (300,000)", r4.ok && d?.status === "VOIDED" && DO.depositOutcomeLabel(d) === "คืนมัดจำแล้ว" && LC.rowStatusLabel(d!.status, d) === "คืนมัดจำแล้ว", "คืนมัดจำแล้ว", { r4, s: d?.status, o: d?.depositOutcome });
  }

  // ═══ A3 ริบซ้ำหลังกลับรายการ ═══
  console.log("\nA3 ริบ → กลับรายการ → ริบอีกครั้ง ลงบัญชีจริง:");
  {
    const A4900 = (await prisma.accountLedger.findFirst({ where: { systemId: S, code: "4900" }, select: { id: true } }))!.id;
    const net4900 = async (dep: string) => (await prisma.accountJournalLine.findMany({ where: { systemId: S, accountId: A4900, entry: { refType: "AccountDocument", refId: dep } }, select: { debit: true, credit: true } })).reduce((n, l) => n + l.credit - l.debit, 0);
    const f = await mkDep(500_000, "f");
    const f1 = await acc.forfeitDeposit(tid, S, f, "ลูกค้าผิดนัด", { createdById: owner.id });
    chk("A3.1", "ริบ (KEEP_VAT) ⇒ ป้าย \"ริบมัดจำแล้ว\" · 4900 สุทธิ 500,000", f1.ok && (await label(f)) === "ริบมัดจำแล้ว" && (await net4900(f)) === 500_000, "ริบ/500000", { f1, l: await label(f), n: await net4900(f) });
    const je = await prisma.accountJournalEntry.findFirst({ where: { systemId: S, refType: "AccountDocument", refId: f, idempotencyKey: `AccountDocument#${f}#FORFEIT` } });
    const rv = je ? await gl.reverseEntry(V.ctx, je.id, "ริบผิด") : null;
    const d = await doc(f);
    const pv = await acc.depositSettlePreview(tid, S, f);
    chk("A3.2", "กลับรายการ JV ริบ ⇒ AWAITING_DEDUCT · ป้ายปกติ · ยังไม่ถือว่าริบ · 4900 สุทธิ 0", !!rv && d?.status === "AWAITING_DEDUCT" && (await label(f)) === null && pv?.forfeited === false && (await net4900(f)) === 0, "AWAITING_DEDUCT/0", { rv, s: d?.status, l: await label(f), fo: pv?.forfeited, n: await net4900(f) });
    const f2 = await acc.forfeitDeposit(tid, S, f, "ผิดนัดจริง", { createdById: owner.id });
    const je2 = await prisma.accountJournalEntry.findFirst({ where: { systemId: S, refType: "AccountDocument", refId: f, idempotencyKey: `AccountDocument#${f}#FORFEIT:R1` } });
    chk("A3.3", "ริบอีกครั้ง ⇒ JV ใหม่คีย์ FORFEIT:R1 ลงจริง · 4900 สุทธิ 500,000 · ป้าย \"ริบมัดจำแล้ว\" · DEDUCTED", f2.ok && !!je2 && je2.status === "POSTED" && (await net4900(f)) === 500_000 && (await label(f)) === "ริบมัดจำแล้ว" && (await doc(f))?.status === "DEDUCTED", "R1/500000", { f2, je2: je2?.idempotencyKey, n: await net4900(f), l: await label(f) });
    const f3 = await acc.forfeitDeposit(tid, S, f, "ซ้ำ");
    chk("A3.4", "ริบซ้ำทั้งที่ยังมีผล ⇒ ปฏิเสธ", !f3.ok, "ปฏิเสธ", f3, "MAJOR");
    // ACC T3 merge ▸ แท็บ "หักมัดจำครบแล้ว" ไม่นับใบที่คืน/ริบ (depositOutcome) ◂
    //   เฉลยมือ: ใบมัดจำ DEDUCTED ของร้าน V = f (ริบ · มีผล) + a3 (หักบางส่วน+คืนส่วนที่เหลือ · มีผล) + g (หักครบด้วยใบแจ้งหนี้ · ไม่มีผล) ⇒ แท็บ = 1 (g)
    const g = await mkDep(500_000, "g");
    const invG = await acc.createDocument({ tenantId: tid, systemId: S, docType: "INVOICE", contactId: V.cust.id, vatMode: "EXCLUDE", issueDate: D(9, 2), dueDate: D(9, 30), lines: [{ description: "ทริป", qty: 1, unitPrice: 1_000_000, vatRateBp: 700, lineKind: "SERVICE" }], createdById: owner.id });
    await acc.setDocDeposits(tid, S, invG.id, [{ depositId: g, amountSatang: 535_000 }]);
    const ig = await acc.issueDocument(tid, S, invG.id, {});
    const LT = (await import("@/lib/modules/account/list-tabs" as string)) as Any;
    const tabsDR = LT.LIST_TABS.DEPOSIT_RECEIPT;
    const counts = await acc.computeListTabCounts(tid, S, "DEPOSIT_RECEIPT", tabsDR);
    const listed = await acc.listDocumentsPaged(tid, S, { docType: "DEPOSIT_RECEIPT", ...LT.tabToFilter("DEPOSIT_RECEIPT", "deducted"), skipStatusCounts: true });
    const rawDeducted = await prisma.accountDocument.count({ where: { systemId: S, docType: "DEPOSIT_RECEIPT", status: "DEDUCTED" } });
    chk("A3.5", "แท็บ \"หักมัดจำครบแล้ว\" = 1 (เฉพาะใบที่หักครบ ไม่นับคืน/ริบ) · รายการ 1 แถว = ใบนั้น · สถานะ DEDUCTED ดิบ 3", ig.ok && (await doc(g))?.status === "DEDUCTED" && counts.deducted === 1 && listed.total === 1 && listed.rows[0]?.id === g && rawDeducted === 3, "1/1/g/3", { ig: ig.ok ? "ok" : ig, c: counts.deducted, t: listed.total, r: listed.rows.map((x: Any) => x.id), g, rawDeducted });
  }

  // ═══ A4 สาขาผู้ซื้อบนใบพิมพ์ ═══
  console.log("\nA4 ผู้ซื้อไม่มีเลข = ไม่พิมพ์สาขา:");
  chk("A4.1", "buyerBranchLabel: ไม่มีเลข+00000 = \"\" · มีเลข+00000 = สำนักงานใหญ่ · มีเลข+00002 = สาขา 00002 · ชื่อสาขาชนะ", PS.buyerBranchLabel("", "00000", null) === "" && PS.buyerBranchLabel(null, "00000", "สาขาบางนา") === "" && PS.buyerBranchLabel("0105561999240", "00000", null) === "สำนักงานใหญ่" && PS.buyerBranchLabel("0105561999240", "00002", "") === "สาขา 00002" && PS.buyerBranchLabel("0105561999240", "00002", "บางนา") === "บางนา", "ตามนั้น", null);
  {
    const person = await acc.createContact({ tenantId: tid, systemId: S, kind: "CUSTOMER", legalType: "PERSON", name: "คุณสมชาย ไม่มีเลข", taxId: null, address: "9 ถ.บุคคล" });
    const ti = await acc.createDocument({ tenantId: tid, systemId: S, docType: "TAX_INVOICE", contactId: person.id, vatMode: "EXCLUDE", issueDate: D(9, 3), lines: [{ description: "ค่าบริการ", qty: 1, unitPrice: 100_000, vatRateBp: 700 }], createdById: owner.id });
    const iss = await acc.issueDocument(tid, S, ti.id, {});
    const pv = await PV.loadPrintView(tid, S, ti.id);
    chk("A4.2", "ใบกำกับของผู้ซื้อบุคคลไม่มีเลข: ออกได้ไม่ต้องยืนยัน · ใบพิมพ์สาขาว่าง (ไม่ขึ้น \"สำนักงานใหญ่\")", iss.ok && pv && pv.view.buyer.branch === "", "ok/\"\"", { iss: iss.ok ? "ok" : iss, b: pv?.view?.buyer });
  }

  // ═══ A5 กติกาเดียว BUYER_TAX_ID_MISSING ═══
  console.log("\nA5 BUYER_TAX_ID_MISSING: กิจการต้องยืนยัน · บุคคลเงียบ:");
  {
    const wBiz = LGX.taxInvoiceBuyerWarnings({ name: "บจก. ก", address: "1", taxId: "", business: true }).find((w: Any) => w.code === "BUYER_TAX_ID_MISSING");
    const wPer = LGX.taxInvoiceBuyerWarnings({ name: "คุณ ข", address: "1", taxId: "", business: false }).find((w: Any) => w.code === "BUYER_TAX_ID_MISSING");
    const wUnk = LGX.taxInvoiceBuyerWarnings({ name: "ค", address: "1", taxId: "", business: null }).find((w: Any) => w.code === "BUYER_TAX_ID_MISSING");
    chk("A5.1", "กิจการไม่มีเลข = ack:true · บุคคล = ไม่มีคำเตือน · ไม่รู้ประเภท = แจ้ง (ack:false)", wBiz?.ack === true && !wPer && wUnk?.ack === false, "true/none/false", { wBiz: wBiz?.ack, wPer, wUnk: wUnk?.ack });
    const biz = await acc.createContact({ tenantId: tid, systemId: S, kind: "CUSTOMER", legalType: "COMPANY", name: "บจก. ไม่ให้เลข", taxId: null, address: "5 ถ.กิจการ" });
    const ti = await acc.createDocument({ tenantId: tid, systemId: S, docType: "TAX_INVOICE", contactId: biz.id, vatMode: "EXCLUDE", issueDate: D(9, 4), lines: [{ description: "ค่าบริการ", qty: 1, unitPrice: 100_000, vatRateBp: 700 }], createdById: owner.id });
    const no = await acc.issueDocument(tid, S, ti.id, {});
    const yes = await acc.issueDocument(tid, S, ti.id, { ack: { codes: ["BUYER_TAX_ID_MISSING"], actorId: owner.id, via: "qc" } });
    chk("A5.2", "ฟอร์ม/REST/AI (issueDocument): ผู้ซื้อกิจการไม่มีเลข ไม่ยืนยัน ⇒ LEGAL_ACK_REQUIRED · ยืนยัน ⇒ ออกได้", !no.ok && no.legal?.warnings?.some((w: Any) => w.code === "BUYER_TAX_ID_MISSING") && yes.ok, "409→ok", { no, yes: yes.ok });
    // ลิงก์สาธารณะ
    const inv = await acc.createDocument({ tenantId: tid, systemId: S, docType: "RECEIPT", contactId: null, vatMode: "EXCLUDE", issueDate: D(9, 5), lines: [{ description: "ขายสด", qty: 1, unitPrice: 50_000, vatRateBp: 700 }], createdById: owner.id });
    const ir = await acc.issueDocument(tid, S, inv.id, {});
    const tok = (await acc.ensurePublicTaxInvoiceLink(tid, S, inv.id))?.token;
    if (ir.ok && tok) {
      const pc = await acc.issuePublicTaxInvoice(tok, { name: "บจก. ลิงก์", taxId: "", address: "7 ถ.ลิงก์", legalType: "COMPANY" });
      const draft = await prisma.accountDocument.findFirst({ where: { systemId: S, docType: "TAX_INVOICE", sourceDocId: inv.id, status: "DRAFT" } });
      const snap = (draft?.contactSnapshot ?? {}) as Any;
      chk("A5.3", "ลิงก์สาธารณะ เลือกกิจการไม่กรอกเลข ⇒ คำขอมีคำเตือน (แจ้งลูกค้า ack:false) · snapshot legalType COMPANY ไม่มีรหัสสาขา", pc.ok && pc.warnings?.[0]?.code === "BUYER_TAX_ID_MISSING" && pc.warnings[0].ack === false && snap.legalType === "COMPANY" && !snap.branchCode, "warn/COMPANY", { pc, snap });
      const ap0 = draft ? await acc.issueDocument(tid, S, draft.id, {}) : null;
      const ap1 = draft ? await acc.issueDocument(tid, S, draft.id, { ack: { codes: ["BUYER_TAX_ID_MISSING"], actorId: owner.id, via: "qc" } }) : null;
      chk("A5.4", "อนุมัติคำขอ: ไม่ยืนยัน ⇒ LEGAL_ACK_REQUIRED · ยืนยัน ⇒ ออกได้", ap0 && !ap0.ok && ap0.legal?.warnings?.some((w: Any) => w.code === "BUYER_TAX_ID_MISSING") && ap1?.ok, "409→ok", { ap0, ap1: ap1?.ok });
    } else chk("A5.3", "เตรียมลิงก์สาธารณะได้", false, "token", { ir, tok });
    const inv2 = await acc.createDocument({ tenantId: tid, systemId: S, docType: "RECEIPT", contactId: null, vatMode: "EXCLUDE", issueDate: D(9, 6), lines: [{ description: "ขายสด", qty: 1, unitPrice: 50_000, vatRateBp: 700 }], createdById: owner.id });
    await acc.issueDocument(tid, S, inv2.id, {});
    const tok2 = (await acc.ensurePublicTaxInvoiceLink(tid, S, inv2.id))?.token;
    if (tok2) {
      const pp = await acc.issuePublicTaxInvoice(tok2, { name: "คุณบุคคล", taxId: "", address: "8 ถ.บุคคล", legalType: "PERSON" });
      const draft = await prisma.accountDocument.findFirst({ where: { systemId: S, docType: "TAX_INVOICE", sourceDocId: inv2.id, status: "DRAFT" } });
      const ap = draft ? await acc.issueDocument(tid, S, draft.id, {}) : null;
      chk("A5.5", "ลิงก์สาธารณะ เลือกบุคคลไม่กรอกเลข ⇒ ไม่มีคำเตือน · อนุมัติได้เลย", pp.ok && (pp.warnings ?? []).length === 0 && ap?.ok, "silent/ok", { pp, ap });
    }
  }
} catch (e) {
  console.error(e);
  cks.push({ id: "CRASH", ok: false, sev: "CRITICAL" });
} finally {
  for (const t of tids) await prisma.tenant.delete({ where: { id: t } }).catch(() => {});
  for (const u of users) await prisma.user.delete({ where: { id: u } }).catch(() => {});
}
const passed = cks.filter((c) => c.ok).length;
console.log(`\nผ่าน ${passed}/${cks.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed, findings: cks.filter((c) => !c.ok).map((c) => c.id) })}`);
await prisma.$disconnect();
process.exit(passed === cks.length ? 0 : 1);
