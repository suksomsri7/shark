// QC ACC T1.4 + T1.5 — ภาษีซื้อ: เคลม / รอใบกำกับ / เคลมไม่ได้ · ธงบัญชี · ภาษีซื้อไม่ขอคืน · รับใบกำกับข้ามเดือน · เพดาน 6 เดือน · ใบลด/เพิ่มหนี้ตามใบเดิม
//
// ใบงาน: ledger/ACCOUNT-TAX-PLAN.md แถว T1.4 T1.5 · design note ledger/wo-notes/T1.4.md · T1.5.md
// ฟิกซ์เจอร์ของตัวเอง (ร้านทิ้ง สร้างเอง ลบใน finally) — ไม่พึ่ง seed กลาง
// รัน: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-acc-v2-inputvat.mts
//
// เฉลยคำนวณมือ (อัตรา 7% · โหมดแยก VAT · ฐาน 10,000.00 = 1,000,000 สต. ⇒ VAT 70,000 สต.):
//   ใบซื้อทั้งหมดลงวันที่ 15 ต.ค. 2569 เว้น R2/R3 (10 เม.ย. 2569) และ R5 (10 มี.ค. 2569) · ใบลด/เพิ่มหนี้ 6 พ.ย. 2569
//   ภ.พ.30 ต.ค. ภาษีซื้อ (1150) = IV1 70,000 + IV3 70,000 + IV6 70,000 + IV7(ส่วนเคลม) 70,000 + IV9 70,000 + R2 รับ 20 ต.ค. 70,000 = 420,000
//   ภ.พ.30 พ.ย. ภาษีซื้อ = R1 รับ 5 พ.ย. 70,000 + R3 รับ 5 พ.ย. 70,000 − R7 ยกเลิกการรับ 70,000 + R7 รับใหม่ (วันนี้) 70,000
//                        − IV7 ยกเลิก 70,000 − C1 7,000 − C3 7,000 + C2 รับใบ (ยอดพักคงเหลือ 63,000) + C1 ยกเลิก 7,000 = 126,000
//   ใบลดหนี้ 1,000.00 ⇒ VAT 7,000 · เพดานเคลม: ใบเดือน M เคลมได้ถึง M+6 (ฉ.4 ข้อ 2: นับแต่เดือนถัดจากเดือนที่ออกใบ)
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-acc-v2-inputvat");

const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, exp: unknown, act: unknown, sev: Sev = "CRITICAL") => {
  cks.push({ id, ok, sev });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${JSON.stringify(exp)} | act ${JSON.stringify(act)?.slice(0, 600)}`}`);
};

const D = (s: string) => new Date(`${s}T05:00:00Z`); // 12:00 เวลาไทย
const OCT = D("2026-10-15");
const NOV6 = D("2026-11-06");
const bkkMonth = (d: Date) => { const t = new Date(d.getTime() + 7 * 3_600_000); return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`; };
const NOW_MONTH = bkkMonth(new Date());

let tid = "";
const users: string[] = [];
try {
  const acc = (await import("@/lib/modules/account/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const exp = (await import("@/lib/modules/account/expense" as string)) as Any;
  const gl = (await import("@/lib/modules/account/gl" as string)) as Any;
  const IV = (await import("@/lib/modules/account/input-vat" as string)) as Any;
  const IVS = (await import("@/lib/modules/account/input-vat-shared" as string)) as Any;
  const TH = (await import("@/lib/core/settings/legal/th-tax-2569" as string)) as Any;
  const W = (await import("@/lib/core/settings/legal/warnings" as string)) as Any;
  const LV = (await import("@/lib/modules/account/legal-values" as string)) as Any;
  const DS = (await import("@/lib/modules/account/doc-settings" as string)) as Any;
  const REP = (await import("@/lib/modules/account/reports" as string)) as Any;

  // ═══ A — ตารางค่ากฎหมาย + ตัวคำนวณ pure ═══
  console.log("\nA ตารางค่ากฎหมาย / ตัวคำนวณ:");
  {
    const row = TH.lateClaimRuleAt("2026-11-13");
    chk("A1", "แถวเพดานเคลมข้ามเดือน = 6 เดือน · นับแต่เดือนถัดจากเดือนที่ออกใบ · มีที่มา §17 ฉ.4 + ป้าย V", row?.value === 6 && row.countFrom === "MONTH_AFTER_INVOICE_MONTH" && row.tag === "V" && /§17/.test(row.source) && /ฉบับที่ 4/.test(row.source), 6, row);
    const c1 = IVS.checkLateClaim(D("2026-04-10"), D("2026-10-20"));
    chk("A2", "ใบ เม.ย. เคลม ต.ค. = เดือนที่ 6 → อยู่ในเพดาน · ข้อความ 'ถือเป็นภาษีซื้อในเดือนภาษี ตุลาคม 2569' · คำเตือนแจ้ง (ไม่ต้องยืนยัน)", c1.months === 6 && !c1.outOfWindow && c1.note === "ถือเป็นภาษีซื้อในเดือนภาษี ตุลาคม 2569" && c1.lastYm === "2026-10" && c1.warnings.length === 1 && c1.warnings[0].code === "INPUT_VAT_LATE_CLAIM" && c1.warnings[0].ack === false, "6/in", c1);
    const c2 = IVS.checkLateClaim(D("2026-04-10"), D("2026-11-05"));
    chk("A3", "ใบ เม.ย. เคลม พ.ย. = เดือนที่ 7 → เกินเพดาน · คำเตือนต้องยืนยัน (ไม่บล็อก)", c2.months === 7 && c2.outOfWindow && c2.warnings[0]?.code === "INPUT_VAT_LATE_CLAIM_OUT_OF_WINDOW" && c2.warnings[0]?.ack === true, "7/out", c2);
    const c3 = IVS.checkLateClaim(D("2026-11-20"), D("2026-10-25"));
    chk("A4", "เดือนเคลมก่อนเดือนใบ → คำเตือน [S] ต้องยืนยัน", c3.beforeInvoice && c3.warnings[0]?.code === "INPUT_VAT_CLAIM_BEFORE_INVOICE_MONTH" && c3.warnings[0]?.tag === "S", "before", c3);
    const c4 = IVS.checkLateClaim(D("2026-10-01"), D("2026-10-31"));
    chk("A5", "เดือนเดียวกัน → ไม่มีข้อความ ไม่มีคำเตือน", c4.months === 0 && c4.note === null && c4.warnings.length === 0, "0", c4);
    const c5 = IVS.checkLateClaim(D("2026-12-15"), D("2027-06-02"));
    chk("A6", "ข้ามปี: ใบ ธ.ค. 2569 เคลม มิ.ย. 2570 = เดือนที่ 6 (ในเพดาน) · ข้อความ มิถุนายน 2570", c5.months === 6 && !c5.outOfWindow && c5.note === "ถือเป็นภาษีซื้อในเดือนภาษี มิถุนายน 2570", "6", c5);
    const reasons = TH.INPUT_VAT_NONCLAIM_REASONS.map((r: Any) => `${r.code}:${r.group}`);
    chk("A7", "เหตุไม่เคลมตาม skill: ค่ารับรอง/รถนั่ง/ใบย่อ/กิจการไม่เสีย VAT/สำเนา = รายจ่ายได้ · ไม่มีใบ/ใบไม่สมบูรณ์/ไม่เกี่ยวกิจการ/ผู้ออกไม่มีสิทธิ = รายจ่ายไม่ได้ · ทุกแถวมีที่มา+ป้าย V", JSON.stringify(reasons) === JSON.stringify(["ENTERTAINMENT:DEDUCTIBLE", "PASSENGER_CAR:DEDUCTIBLE", "ABBREVIATED_INVOICE:DEDUCTIBLE", "NON_VAT_BUSINESS:DEDUCTIBLE", "COPY_OR_NAME_MISMATCH:DEDUCTIBLE", "NO_TAX_INVOICE:DISALLOWED", "INVOICE_INCOMPLETE:DISALLOWED", "NOT_BUSINESS:DISALLOWED", "ISSUER_NOT_ENTITLED:DISALLOWED"]) && TH.INPUT_VAT_NONCLAIM_REASONS.every((r: Any) => r.tag === "V" && /§17/.test(r.source) && /§ก4/.test(r.source)), "9 แถว", reasons);
    const d1 = IVS.defaultInputVatStatus({ vendorTaxId: "0105561000001" });
    const d2 = IVS.defaultInputVatStatus({ vendorTaxId: "12345" });
    const d3 = IVS.defaultInputVatStatus({ vendorTaxId: null, settings: { nonClaimPosting: "SEPARATE_ACCOUNT", vendorNoTaxIdDefault: "NO_CLAIM" } });
    const d4 = IVS.defaultInputVatStatus({ vendorTaxId: "0105561000001", accountTreatment: "NON_CLAIMABLE_ENTERTAINMENT" });
    const d5 = IVS.defaultInputVatStatus({ vendorTaxId: "0105561000001", accountTreatment: "PENDING_INVOICE" });
    chk("A8", "ค่าเริ่ม: มีเลข 13 หลัก = เคลม · ไม่มี/เลขไม่ครบ = รอใบกำกับ (ค่าตั้ง) หรือเคลมไม่ได้ (ค่าตั้ง NO_CLAIM) · ธงบัญชีชนะคู่ค้า", d1.status === "CLAIM" && d2.status === "PENDING" && d2.source === "VENDOR" && d3.status === "NO_CLAIM" && d3.reason === "NO_TAX_INVOICE" && d4.status === "NO_CLAIM" && d4.reason === "ENTERTAINMENT" && d5.status === "PENDING", "ตามลำดับ", [d1, d2, d3, d4, d5]);
    const codes = ["INPUT_VAT_VENDOR_NO_TAX_ID", "INPUT_VAT_CLAIM_WITHOUT_VENDOR_TAX_ID", "INPUT_VAT_CLAIM_PROHIBITED_CATEGORY", "INPUT_VAT_NONCLAIM_REASON_DEFAULTED", "EXPENSE_PAYEE_MISSING", "INPUT_VAT_LATE_CLAIM", "INPUT_VAT_LATE_CLAIM_OUT_OF_WINDOW", "INPUT_VAT_CLAIM_BEFORE_INVOICE_MONTH", "INPUT_VAT_PENDING_PAST_WINDOW"];
    chk("A9", "ทะเบียนคำเตือนกลางมีครบ 9 รหัส พร้อมมาตรา/ป้าย/วันตรวจ · [S] ต่อท้าย 'โปรดตรวจกับนักบัญชี'", codes.every((c) => W.isLegalWarningCode(c) && W.LEGAL_WARNINGS[c].citation && W.LEGAL_WARNINGS[c].checkedAt) && /นักบัญชี/.test(W.legalWarning("INPUT_VAT_NONCLAIM_REASON_DEFAULTED", { vat: "1" }).messageTh), "ครบ", codes.filter((c) => !W.isLegalWarningCode(c)));
    // จอข้อ 13 — หัก ณ ที่จ่ายบรรทัดใหม่จากตาราง (ผู้จ่าย × ผู้รับ) ไม่ใช่ 3% เหมา
    const book = (k: string) => ({ entityKind: k, shop: { vat: [], wht: [], deadline: [] } });
    const uiCo = LV.legalUiOptionsFrom(book("COMPANY"), D("2026-11-13"), [{ incomeType: "M40_8", rateBp: 300 }], "SHOP_PAYS");
    const uiInd = LV.legalUiOptionsFrom(book("INDIVIDUAL"), D("2026-11-13"), [{ incomeType: "M40_8", rateBp: 300 }], "SHOP_PAYS");
    chk("A10", "อัตราเติมบรรทัด (ตาราง ไม่ใช่นโยบาย): ร้านนิติฯ จ่าย 40(8) บริษัท 3% · บุคคล 3% · ค่าเช่า 5% · ร้านบุคคลธรรมดา = 0 (ไม่หัก) แม้นโยบายตั้ง 3%", uiCo.whtByRecipient?.COMPANY.M40_8 === 300 && uiCo.whtByRecipient?.PERSON.M40_8 === 300 && uiCo.whtByRecipient?.COMPANY.M40_5 === 500 && uiInd.whtByRecipient?.COMPANY.M40_8 === 0 && uiInd.whtSuggest.M40_8 === 300, "300/300/500/0", { co: uiCo.whtByRecipient, ind: uiInd.whtByRecipient?.COMPANY });
  }

  // ═══ ฟิกซ์เจอร์ ═══
  const stamp = Date.now();
  const t = await prisma.tenant.create({ data: { name: "QC T1.4 inputvat", slug: `qc-t14-${stamp}` } });
  tid = t.id;
  const owner = await prisma.user.create({ data: { email: `qc-t14-${stamp}@qc.local`, name: "เจ้าของ T1.4" } });
  users.push(owner.id);
  await prisma.membership.create({ data: { userId: owner.id, tenantId: tid, role: "OWNER", unitAccess: ["*"], acceptedAt: new Date() } });
  const S = (await sys.createSystem(tid, "ACCOUNT", "บัญชี T1.4")).id;
  const ctx = { tenantId: tid, systemId: S };
  await acc.saveSettings(tid, S, { orgName: "ร้าน T1.4", vatRegistered: true, vatRateBp: 700, taxId: "0105561000000" });
  await gl.ensureAccounting(ctx);
  const V1 = await acc.createContact({ tenantId: tid, systemId: S, kind: "VENDOR", legalType: "COMPANY", name: "ผู้ขายมีเลข", taxId: "0105561000001", branchCode: "00000" });
  const V0 = await acc.createContact({ tenantId: tid, systemId: S, kind: "VENDOR", legalType: "COMPANY", name: "ผู้ขายไม่มีเลข" });
  const L = async (code: string) => (await prisma.accountLedger.findFirst({ where: { systemId: S, code }, select: { id: true, vatTreatment: true } }))!;
  const A = { e6900: (await L("6900")).id, e6930: (await L("6930")).id, e6940: (await L("6940")).id, v1150: (await L("1150")).id, v1155: (await L("1155")).id, n6950: (await L("6950")).id, n6960: (await L("6960")).id, ap: (await L("2100")).id };
  /** Σ(เดบิต − เครดิต) ของบัญชีในรายการของเอกสารชุดหนึ่ง (รวมรายการกลับ) */
  const net = async (acct: string, refIds: string[]) => {
    const ls = await prisma.accountJournalLine.findMany({ where: { systemId: S, accountId: acct, entry: { refType: "AccountDocument", refId: { in: refIds } } }, select: { debit: true, credit: true } });
    return ls.reduce((a, l) => a + l.debit - l.credit, 0);
  };
  const balancedAll = async () => {
    const es = await prisma.accountJournalEntry.findMany({ where: { systemId: S }, include: { lines: true } });
    return es.length > 0 && es.every((e) => e.lines.reduce((a, l) => a + l.debit, 0) === e.lines.reduce((a, l) => a + l.credit, 0));
  };
  const line = (accountId: string, unitPrice = 1_000_000, extra: Any = {}) => ({ description: "ค่าใช้จ่าย", qty: 1, unitPrice, discount: 0, vatRateBp: 700, accountId, ...extra });
  const mk = (contactId: string | null, lines: Any[], extra: Any = {}) =>
    exp.createExpenseDoc({ tenantId: tid, systemId: S, docType: "EXPENSE", contactId, vatMode: "EXCLUDE", issueDate: OCT, lines, createdById: owner.id, ...extra });
  const issue = (id: string, codes?: string[]) => exp.issueExpenseDoc(tid, S, id, codes ? { ack: { codes, actorId: owner.id, via: "screen" } } : {});
  const ptxOf = (id: string) => prisma.accountDocument.findFirst({ where: { systemId: S, docType: "PURCHASE_TAX_INVOICE", sourceDocId: id }, orderBy: { createdAt: "desc" } });
  const docOf = (id: string) => prisma.accountDocument.findFirst({ where: { id }, include: { lines: { orderBy: { sortOrder: "asc" } } } });
  chk("F0", "ผังบัญชี: 6930 ค่ารับรอง (ธงค่ารับรอง) · 6940 รถยนต์นั่ง (ธงรถนั่ง) · 6950/6960 ภาษีซื้อไม่ขอคืน 2 ชนิด · mapping VAT_INPUT_NONCLAIM*", (await L("6930")).vatTreatment === "NON_CLAIMABLE_ENTERTAINMENT" && (await L("6940")).vatTreatment === "NON_CLAIMABLE_PASSENGER_CAR" && !!(await prisma.accountMapping.findFirst({ where: { systemId: S, key: "VAT_INPUT_NONCLAIM", accountId: A.n6950 } })) && !!(await prisma.accountMapping.findFirst({ where: { systemId: S, key: "VAT_INPUT_NONCLAIM_DISALLOWED", accountId: A.n6960 } })), "ครบ", null);
  chk("F1", "นาฬิกาเครื่อง = พ.ย. 2569 (oracle ของเดือนวันนี้คำนวณไว้กับ 2026-11)", NOW_MONTH === "2026-11", "2026-11", NOW_MONTH, "MAJOR");

  // ═══ B — T1.4 สถานะ ═══
  console.log("\nB สถานะภาษีซื้อ (T1.4):");
  const IVid: Record<string, string> = {};
  {
    // IV1 — คู่ค้ามีเลข ไม่เลือก ⇒ เคลม
    const d = await mk(V1.id, [line(A.e6900)]);
    IVid.IV1 = d.id;
    const r = await issue(d.id);
    const doc = await docOf(d.id);
    chk("B1.1", "IV1 คู่ค้ามีเลข ไม่เลือกสถานะ ⇒ CLAIM · ออกได้ไม่ต้องยืนยัน", r.ok && doc?.inputVatStatus === "CLAIM", "CLAIM", { r, s: doc?.inputVatStatus });
    chk("B1.2", "IV1 GL: Dr 6900 1,000,000 · Dr 1150 70,000 · Cr 2100 1,070,000 · ไม่มีใบกำกับรอรับ", (await net(A.e6900, [d.id])) === 1_000_000 && (await net(A.v1150, [d.id])) === 70_000 && (await net(A.ap, [d.id])) === -1_070_000 && !(await ptxOf(d.id)), "ตามนั้น", { e: await net(A.e6900, [d.id]), v: await net(A.v1150, [d.id]) });
  }
  {
    // IV2 — คู่ค้าไม่มีเลข ⇒ รอใบกำกับ (C1: ไม่เคลมเงียบ ๆ)
    const d = await mk(V0.id, [line(A.e6900)]);
    IVid.IV2 = d.id;
    const r = await issue(d.id);
    const doc = await docOf(d.id);
    const p = await ptxOf(d.id);
    chk("B2.1", "IV2 คู่ค้าไม่มีเลข ⇒ PENDING (ไม่เคลมเงียบ) · ออกได้ (คำเตือนแจ้ง ไม่ต้องยืนยัน) · VAT ยังอยู่บนใบ", r.ok && doc?.inputVatStatus === "PENDING" && doc?.vatAmount === 70_000 && doc?.grandTotal === 1_070_000, "PENDING", { r, s: doc?.inputVatStatus });
    chk("B2.2", "IV2 GL: Dr 1155 70,000 · 1150 = 0 · ใบกำกับภาษีซื้อรอรับ VAT 70,000", (await net(A.v1155, [d.id])) === 70_000 && (await net(A.v1150, [d.id])) === 0 && p?.status === "AWAITING_RECEIVE" && p.vatAmount === 70_000, "70000", { u: await net(A.v1155, [d.id]), p: p && { s: p.status, v: p.vatAmount } });
    const w = IVS.inputVatWarnings({ ...doc, contactId: V0.id }, doc!.lines, { name: "ผู้ขายไม่มีเลข", taxId: null });
    chk("B2.3", "คำเตือน INPUT_VAT_VENDOR_NO_TAX_ID (แจ้ง · อ้าง ม.82/5) บอกสถานะ 'รอใบกำกับ'", w.length === 1 && w[0].code === "INPUT_VAT_VENDOR_NO_TAX_ID" && !w[0].ack && /รอใบกำกับ/.test(w[0].messageTh) && /82\/5/.test(w[0].citation), "1 คำเตือน", w);
  }
  {
    // IV3 — เลือกเคลมเองทั้งที่คู่ค้าไม่มีเลข ⇒ ต้องยืนยัน
    const d = await mk(V0.id, [line(A.e6900)], { inputVatStatus: "CLAIM" });
    IVid.IV3 = d.id;
    const r0 = await issue(d.id);
    chk("B3.1", "IV3 เลือก CLAIM + คู่ค้าไม่มีเลข ⇒ ยังไม่ออก ขอยืนยัน INPUT_VAT_CLAIM_WITHOUT_VENDOR_TAX_ID (ไม่บล็อกถาวร)", !r0.ok && r0.legal?.warnings?.some((x: Any) => x.code === "INPUT_VAT_CLAIM_WITHOUT_VENDOR_TAX_ID" && x.ack), "ack required", r0);
    const r1 = await issue(d.id, ["INPUT_VAT_CLAIM_WITHOUT_VENDOR_TAX_ID"]);
    const ackRows = await prisma.auditLog.findMany({ where: { tenantId: tid, action: "legal.warning.ack", targetId: d.id } });
    chk("B3.2", "IV3 ยืนยันแล้วออกได้ · Dr 1150 70,000 · บันทึกผู้ยืนยัน (AuditLog legal.warning.ack)", r1.ok && (await net(A.v1150, [d.id])) === 70_000 && ackRows.length === 1 && ackRows[0]!.actorId === owner.id, "ok", { r1, n: ackRows.length });
  }
  {
    // IV4 — เลือกเคลมไม่ได้ เหตุ "ไม่เกี่ยวกับกิจการ" ⇒ 6960 (รายจ่ายต้องห้าม)
    const d = await mk(V1.id, [line(A.e6900, 1_000_000, { inputVatStatus: "NO_CLAIM", inputVatReason: "NOT_BUSINESS" })]);
    IVid.IV4 = d.id;
    const r = await issue(d.id);
    const doc = await docOf(d.id);
    chk("B4.1", "IV4 NO_CLAIM (ไม่เกี่ยวกิจการ ม.82/5(3)) ⇒ VAT คงบนใบ 70,000 · Dr 6960 70,000 · 1150/1155 = 0", r.ok && doc?.grandTotal === 1_070_000 && doc?.lines[0]?.inputVatReason === "NOT_BUSINESS" && (await net(A.n6960, [d.id])) === 70_000 && (await net(A.v1150, [d.id])) === 0 && (await net(A.v1155, [d.id])) === 0, "6960", { r, n: await net(A.n6960, [d.id]) });
  }
  {
    // IV5 — บัญชีค่ารับรอง (ธง) ไม่เลือก ⇒ เคลมไม่ได้ เหตุค่ารับรอง ⇒ 6950 (รายจ่ายได้)
    const d = await mk(V1.id, [line(A.e6930)]);
    IVid.IV5 = d.id;
    const r = await issue(d.id);
    const doc = await docOf(d.id);
    chk("B5.1", "IV5 บัญชี 6930 ค่ารับรอง ⇒ บรรทัด NO_CLAIM/ENTERTAINMENT อัตโนมัติ · Dr 6930 1,000,000 · Dr 6950 70,000 · ไม่ต้องยืนยัน", r.ok && doc?.lines[0]?.inputVatStatus === "NO_CLAIM" && doc?.lines[0]?.inputVatReason === "ENTERTAINMENT" && (await net(A.e6930, [d.id])) === 1_000_000 && (await net(A.n6950, [d.id])) === 70_000 && (await net(A.v1150, [d.id])) === 0, "6950", { r, l: doc?.lines[0] && { s: doc.lines[0].inputVatStatus, r: doc.lines[0].inputVatReason } });
  }
  {
    // IV6 — บัญชีค่ารับรองแต่เลือกเคลมที่บรรทัด ⇒ ต้องยืนยัน (หมวดต้องห้าม)
    const d = await mk(V1.id, [line(A.e6930, 1_000_000, { inputVatStatus: "CLAIM" })]);
    IVid.IV6 = d.id;
    const r0 = await issue(d.id);
    chk("B6.1", "IV6 เคลมบนหมวดค่ารับรอง ⇒ ขอยืนยัน INPUT_VAT_CLAIM_PROHIBITED_CATEGORY (อ้าง ม.82/5(4) ฉ.17)", !r0.ok && r0.legal?.warnings?.some((x: Any) => x.code === "INPUT_VAT_CLAIM_PROHIBITED_CATEGORY" && /82\/5\(4\)/.test(x.messageTh)), "ack required", r0);
    const r1 = await issue(d.id, ["INPUT_VAT_CLAIM_PROHIBITED_CATEGORY"]);
    chk("B6.2", "IV6 ยืนยันแล้ว ⇒ Dr 1150 70,000 (ร้านเลือกเอง)", r1.ok && (await net(A.v1150, [d.id])) === 70_000, 70_000, r1);
  }
  {
    // IV7 — ใบผสม: 6900 เคลม 1,000,000 · 6940 รถนั่ง 500,000 · บรรทัดรอใบกำกับ 200,000
    const d = await mk(V1.id, [line(A.e6900), line(A.e6940, 500_000), line(A.e6900, 200_000, { inputVatStatus: "PENDING" })]);
    IVid.IV7 = d.id;
    const r = await issue(d.id);
    const doc = await docOf(d.id);
    const p = await ptxOf(d.id);
    chk("B7.1", "IV7 ใบผสม: VAT 119,000 · Dr 1150 70,000 · Dr 6950 35,000 (รถนั่ง ม.82/5(6)) · Dr 1155 14,000 · Dr 6900 1,200,000 · Dr 6940 500,000 · Cr 2100 1,819,000", r.ok && doc?.vatAmount === 119_000 && (await net(A.v1150, [d.id])) === 70_000 && (await net(A.n6950, [d.id])) === 35_000 && (await net(A.v1155, [d.id])) === 14_000 && (await net(A.e6900, [d.id])) === 1_200_000 && (await net(A.e6940, [d.id])) === 500_000 && (await net(A.ap, [d.id])) === -1_819_000, "ตามนั้น", { v: doc?.vatAmount, c: await net(A.v1150, [d.id]), n: await net(A.n6950, [d.id]), u: await net(A.v1155, [d.id]) });
    chk("B7.2", "IV7 ใบกำกับภาษีซื้อรอรับ = เฉพาะส่วนที่รอ 14,000 (ไม่ใช่ VAT ทั้งใบ)", p?.status === "AWAITING_RECEIVE" && p.vatAmount === 14_000, 14_000, p?.vatAmount);
    const v = await IV.inputVatDocView(ctx, d.id);
    chk("B7.3", "แผงหน้าเอกสาร: แยก เคลม 70,000 · รอ 14,000 · ไม่ได้ 35,000 · สรุป 'หลายสถานะ' · เหตุ รถยนต์นั่ง", v.split.claim === 70_000 && v.split.pending === 14_000 && v.split.noClaim === 35_000 && v.summary === "MIXED" && v.noClaimReasons.some((x: string) => /รถยนต์นั่ง/.test(x)) && v.pendingPtx?.vat === 14_000, "split", v);
  }
  {
    // IV8 — ค่าตั้ง INTO_COST: เคลมไม่ได้รวมเข้าค่าใช้จ่ายของบรรทัด
    const s1 = await DS.saveDocSettings(ctx, { inputVat: { nonClaimPosting: "INTO_COST", vendorNoTaxIdDefault: "PENDING" } });
    const d = await mk(V1.id, [line(A.e6900, 1_000_000, { inputVatStatus: "NO_CLAIM", inputVatReason: "ENTERTAINMENT" })]);
    IVid.IV8 = d.id;
    const r = await issue(d.id);
    chk("B8.1", "IV8 ค่าตั้ง INTO_COST ⇒ Dr 6900 1,070,000 · ไม่มี 6950/6960/1150", s1.ok && r.ok && (await net(A.e6900, [d.id])) === 1_070_000 && (await net(A.n6950, [d.id])) === 0 && (await net(A.n6960, [d.id])) === 0 && (await net(A.v1150, [d.id])) === 0, 1_070_000, { s1, r, e: await net(A.e6900, [d.id]) });
    await DS.saveDocSettings(ctx, { inputVat: { nonClaimPosting: "SEPARATE_ACCOUNT", vendorNoTaxIdDefault: "NO_CLAIM" } });
    const d2 = await mk(V0.id, [line(A.e6900)]);
    const doc2 = await docOf(d2.id);
    chk("B8.2", "ค่าตั้งคู่ค้าไม่มีเลข = NO_CLAIM ⇒ ร่างใหม่ได้ NO_CLAIM (เหตุ ไม่มีใบกำกับ)", doc2?.inputVatStatus === "NO_CLAIM" && doc2?.lines[0]?.inputVatReason === "NO_TAX_INVOICE", "NO_CLAIM", { s: doc2?.inputVatStatus, r: doc2?.lines[0]?.inputVatReason });
    await exp.voidExpenseDoc(tid, S, d2.id, "ร่างทดสอบ");
    await DS.saveDocSettings(ctx, { inputVat: { nonClaimPosting: "SEPARATE_ACCOUNT", vendorNoTaxIdDefault: "PENDING" } });
  }
  {
    // IV9 — ราคารวม VAT + แก้ร่างคงสถานะ
    const d = await mk(V1.id, [line(A.e6900, 1_070_000)], { vatMode: "INCLUDE" });
    IVid.IV9 = d.id;
    const u = await exp.updateExpenseDoc(tid, S, d.id, { note: "แก้ร่าง" });
    const r = await issue(d.id);
    const doc = await docOf(d.id);
    chk("B9.1", "IV9 ราคารวม VAT 1,070,000 ⇒ ฐาน 1,000,000 · Dr 1150 70,000 · แก้ร่างแล้วสถานะคง CLAIM", u.ok && r.ok && doc?.inputVatStatus === "CLAIM" && (await net(A.e6900, [d.id])) === 1_000_000 && (await net(A.v1150, [d.id])) === 70_000, 70_000, { u, r, e: await net(A.e6900, [d.id]) });
    // แก้ร่างเปลี่ยนคู่ค้า → ค่าเริ่มคำนวณใหม่ (ร่างที่ไม่ได้เลือกเอง)
    const d3 = await mk(V1.id, [line(A.e6900)]);
    const before = (await docOf(d3.id))?.inputVatStatus;
    await exp.updateExpenseDoc(tid, S, d3.id, { contactId: V0.id, inputVatStatus: null });
    const after = (await docOf(d3.id))?.inputVatStatus;
    chk("B9.2", "แก้ร่าง: เปลี่ยนเป็นคู่ค้าไม่มีเลข + ไม่เลือกสถานะ ⇒ คงค่าเดิมของร่าง (CLAIM) — ค่าเริ่มคิดใหม่เฉพาะร่างก่อน T1.4", before === "CLAIM" && after === "CLAIM", "CLAIM/CLAIM", { before, after }, "MINOR");
    await exp.voidExpenseDoc(tid, S, d3.id, "ร่างทดสอบ");
  }

  // ═══ C — รายการรอใบกำกับ (ก่อนรับ) ═══
  console.log("\nC รายการใบกำกับภาษีซื้อรอรับ (T1.5 §6):");
  const old = await mk(V0.id, [line(A.e6900)], { issueDate: D("2026-03-10") });
  IVid.R5 = old.id;
  await issue(old.id);
  const apr1 = await mk(V0.id, [line(A.e6900)], { issueDate: D("2026-04-10") });
  const apr2 = await mk(V0.id, [line(A.e6900)], { issueDate: D("2026-04-10") });
  IVid.R2 = apr1.id;
  IVid.R3 = apr2.id;
  await issue(apr1.id);
  await issue(apr2.id);
  {
    const rep = await IV.pendingInputVat(ctx, { asOf: D("2026-11-13") });
    const row = (id: string) => rep.rows.find((x: Any) => x.sourceId === id);
    const rOld = row(old.id);
    const rIv2 = row(IVid.IV2!);
    chk("C1", "รายการรอ: IV2 (ต.ค.) · IV7 (14,000) · R2/R3 (เม.ย.) · R5 (มี.ค.) · รวม 5 ใบ 294,000", rep.rows.length === 5 && rep.total.vat === 294_000 && !!row(IVid.IV7!) && row(IVid.IV7!).vat === 14_000, "5/294000", rep.rows.map((x: Any) => [x.sourceDocNo, x.vat]));
    chk("C2", "R5 (ใบ มี.ค. 2569) เคลมได้ถึง ก.ย. 2569 ⇒ เลยเพดาน + คำเตือน INPUT_VAT_PENDING_PAST_WINDOW · อายุ 248 วัน", rOld?.lastClaimYm === "2026-09" && rOld.pastWindow && rOld.warning?.code === "INPUT_VAT_PENDING_PAST_WINDOW" && rOld.ageDays === 248, "2026-09/past", rOld);
    chk("C3", "IV2 (ต.ค.) เคลมได้ถึง เม.ย. 2570 · เหลือ 5 เดือน · ไม่เตือน", rIv2?.lastClaimYm === "2027-04" && rIv2.monthsLeft === 5 && !rIv2.pastWindow && rIv2.warning === null, "2027-04/5", rIv2);
    chk("C4", "R2 (เม.ย.) เคลมได้ถึง ต.ค. 2569 ⇒ ณ พ.ย. เลยแล้ว · คำเตือนรวมของสมุด = 3 ใบ (R5 R2 R3)", row(apr1.id)?.lastClaimYm === "2026-10" && row(apr1.id).pastWindow && rep.total.pastWindowCount === 3 && rep.warning?.code === "INPUT_VAT_PENDING_PAST_WINDOW", "3", rep.total);
  }

  // ═══ D — รับใบกำกับข้ามเดือน (T1.5) ═══
  console.log("\nD รับใบกำกับภาษีซื้อข้ามเดือน (T1.5):");
  {
    const p = (await ptxOf(IVid.IV2!))!;
    const r = await exp.receivePurchaseTaxInvoice(tid, S, p.id, { vendorInvoiceDate: D("2026-10-15"), vendorInvoiceNo: "INV-77", claimDate: D("2026-11-05") });
    const p2 = (await docOf(p.id))!;
    const je = await prisma.accountJournalEntry.findFirst({ where: { systemId: S, refType: "AccountDocument", refId: p.id } });
    chk("D1.1", "R1 รับใบ (ใบ 15 ต.ค. · ลงภาษีซื้อ 5 พ.ย.) ⇒ RECEIVED · JV งวด 2026-11 ลงวันที่ 5 พ.ย. (เดือนที่รับจริง ไม่ใช่วันที่สร้างรายการรอ)", r.ok && p2.status === "RECEIVED" && je?.periodKey === "2026-11" && je.date.getTime() === D("2026-11-05").getTime(), "2026-11", { r, pk: je?.periodKey, d: je?.date });
    chk("D1.2", "R1 เก็บวันที่ในใบ + เลขที่ + ข้อความ 'ถือเป็นภาษีซื้อในเดือนภาษี พฤศจิกายน 2569' + ฐาน 1,000,000", p2.vendorInvoiceDate?.getTime() === D("2026-10-15").getTime() && p2.reference === "INV-77" && p2.inputVatLateNote === "ถือเป็นภาษีซื้อในเดือนภาษี พฤศจิกายน 2569" && p2.subTotal === 1_000_000 && r.ok && r.warnings?.[0]?.code === "INPUT_VAT_LATE_CLAIM", "note", { n: p2.inputVatLateNote, ref: p2.reference, s: p2.subTotal });
    chk("D1.3", "R1 สาย IV2: 1155 สุทธิ 0 · 1150 = 70,000", (await net(A.v1155, [IVid.IV2!, p.id])) === 0 && (await net(A.v1150, [IVid.IV2!, p.id])) === 70_000, "0/70000", null);
    const v = await IV.inputVatDocView(ctx, p.id);
    chk("D1.4", "หน้าเอกสาร PTX แสดงข้อความเคลมข้ามเดือน + วันที่ในใบ + วันที่ลงบัญชี", v.ptx?.lateNote === "ถือเป็นภาษีซื้อในเดือนภาษี พฤศจิกายน 2569" && v.ptx.vendorInvoiceDate && v.ptx.claimDate, "note", v.ptx);
  }
  {
    const p = (await ptxOf(apr1.id))!;
    const r = await exp.receivePurchaseTaxInvoice(tid, S, p.id, { vendorInvoiceDate: D("2026-04-10"), claimDate: D("2026-10-20") });
    const je = await prisma.accountJournalEntry.findFirst({ where: { systemId: S, refType: "AccountDocument", refId: p.id } });
    chk("D2", "R2 ใบ เม.ย. เคลม 20 ต.ค. (เดือนที่ 6 = ขอบเพดาน) ⇒ ผ่านไม่ต้องยืนยัน · JV งวด 2026-10 · ข้อความ ตุลาคม 2569", r.ok && je?.periodKey === "2026-10" && (await docOf(p.id))?.inputVatLateNote === "ถือเป็นภาษีซื้อในเดือนภาษี ตุลาคม 2569", "ok", { r, pk: je?.periodKey });
  }
  {
    const p = (await ptxOf(apr2.id))!;
    const r0 = await exp.receivePurchaseTaxInvoice(tid, S, p.id, { vendorInvoiceDate: D("2026-04-10"), claimDate: D("2026-11-05") });
    const still = (await docOf(p.id))?.status;
    chk("D3.1", "R3 ใบ เม.ย. เคลม พ.ย. (เดือนที่ 7) ⇒ ขอยืนยัน INPUT_VAT_LATE_CLAIM_OUT_OF_WINDOW · ยังไม่บันทึก", !r0.ok && r0.legal?.warnings?.[0]?.code === "INPUT_VAT_LATE_CLAIM_OUT_OF_WINDOW" && still === "AWAITING_RECEIVE", "ack", r0);
    const r1 = await exp.receivePurchaseTaxInvoice(tid, S, p.id, { vendorInvoiceDate: D("2026-04-10"), claimDate: D("2026-11-05"), ack: { codes: ["INPUT_VAT_LATE_CLAIM_OUT_OF_WINDOW"], actorId: owner.id, via: "screen" } });
    const ackRows = await prisma.auditLog.findMany({ where: { tenantId: tid, action: "legal.warning.ack", targetId: p.id } });
    chk("D3.2", "R3 ยืนยันแล้วบันทึกได้ (ไม่บล็อก) · ข้อความ พฤศจิกายน 2569 · บันทึกผู้ยืนยัน", r1.ok && (await docOf(p.id))?.inputVatLateNote === "ถือเป็นภาษีซื้อในเดือนภาษี พฤศจิกายน 2569" && ackRows.length === 1, "ok", { r1, n: ackRows.length });
  }
  {
    // R7 — ยกเลิกการรับ (ยกเลิก PTX ที่รับแล้ว) แล้วรับใหม่วันนี้
    const p = (await ptxOf(IVid.IV2!))!;
    const v = await exp.voidExpenseDoc(tid, S, p.id, "ใบกำกับผิด รอใบใหม่");
    const p2 = (await docOf(p.id))!;
    chk("D4.1", "R7 ยกเลิกใบกำกับภาษีซื้อที่รับแล้ว ⇒ กลับรายการ + กลับเป็นรอรับ (VAT กลับไปพัก 1155 70,000) · ข้อความ/วันที่ล้าง", v.ok && p2.status === "AWAITING_RECEIVE" && p2.inputVatLateNote === null && (await net(A.v1155, [IVid.IV2!, p.id])) === 70_000 && (await net(A.v1150, [IVid.IV2!, p.id])) === 0, "AWAITING", { v, s: p2.status });
    const r = await exp.receivePurchaseTaxInvoice(tid, S, p.id, { vendorInvoiceDate: D("2026-10-15") });
    const p3 = (await docOf(p.id))!;
    chk("D4.2", "R7 รับใหม่ (ไม่ส่งวันที่ลง = วันนี้) ⇒ คีย์โพสต์ใหม่ · 1150 = 70,000 · ข้อความเดือนนี้", r.ok && p3.status === "RECEIVED" && (await net(A.v1150, [IVid.IV2!, p.id])) === 70_000 && p3.inputVatLateNote === `ถือเป็นภาษีซื้อในเดือนภาษี ${IVS.thaiMonthLabel(NOW_MONTH)}`, "ok", { r, n: p3.inputVatLateNote });
  }
  {
    // R6 — ใบกำกับไม่มา: เคลมไม่ได้
    const p = (await ptxOf(old.id))!;
    const r = await exp.markPurchaseTaxInvoiceNotClaimable(tid, S, p.id, { reason: "NO_TAX_INVOICE" });
    const p2 = (await docOf(p.id))!;
    chk("D5", "R6 เคลมไม่ได้ (ไม่มีใบกำกับ ม.82/5(1)) ⇒ RECEIVED+NO_CLAIM · Dr 6960 70,000 / Cr 1155 · 1155 สาย = 0 · ออกจากรายการรอ", r.ok && p2.status === "RECEIVED" && p2.inputVatStatus === "NO_CLAIM" && (await net(A.n6960, [p.id])) === 70_000 && (await net(A.v1155, [old.id, p.id])) === 0 && !(await IV.pendingInputVat(ctx, { asOf: D("2026-11-13") })).rows.some((x: Any) => x.sourceId === old.id), "ok", { r, n: await net(A.n6960, [p.id]) });
  }

  // ═══ E — ใบลด/เพิ่มหนี้รับตามสถานะของใบเดิม ═══
  console.log("\nE ใบลด/เพิ่มหนี้ฝั่งซื้อตามสถานะของใบเดิม (T1.5 §5):");
  const note = async (docType: string, srcId: string, contactId: string) => {
    const d = await exp.createExpenseDoc({ tenantId: tid, systemId: S, docType, contactId, vatMode: "EXCLUDE", issueDate: NOV6, sourceDocId: srcId, adjustReason: "ลดราคา", lines: [{ description: "ปรับ", qty: 1, unitPrice: 100_000, discount: 0, vatRateBp: 700 }], createdById: owner.id });
    const r = await issue(d.id);
    return { id: d.id, r };
  };
  const C: Record<string, string> = {};
  {
    const c1 = await note("CREDIT_NOTE_RECEIVED", IVid.IV1!, V1.id);
    C.C1 = c1.id;
    chk("E1", "C1 ใบลดหนี้ของใบเคลม ⇒ Cr 1150 7,000 (เดิม)", c1.r.ok && (await net(A.v1150, [c1.id])) === -7_000, -7_000, { r: c1.r, v: await net(A.v1150, [c1.id]) });
    const pend = await mk(V0.id, [line(A.e6900)]);
    await issue(pend.id);
    const c2 = await note("CREDIT_NOTE_RECEIVED", pend.id, V0.id);
    C.C2 = c2.id;
    chk("E2.1", "C2 ใบลดหนี้ของใบที่ยังรอใบกำกับ ⇒ Cr 1155 7,000 · 1150 = 0 · ยอดรอของสาย = 63,000", c2.r.ok && (await net(A.v1155, [c2.id])) === -7_000 && (await net(A.v1150, [c2.id])) === 0 && (await gl.pendingInputVatOf(ctx, [pend.id])).get(pend.id) === 63_000, "1155", { r: c2.r, u: await net(A.v1155, [c2.id]) });
    const p = (await ptxOf(pend.id))!;
    const rr = await exp.receivePurchaseTaxInvoice(tid, S, p.id, { vendorInvoiceDate: OCT });
    chk("E2.2", "C2 รับใบกำกับหลังลดหนี้ ⇒ ย้ายเฉพาะยอดคงพัก 63,000 (ไม่ติดลบ) · 1155 สาย = 0", rr.ok && (await docOf(p.id))?.vatAmount === 63_000 && (await net(A.v1155, [pend.id, c2.id, p.id])) === 0 && (await net(A.v1150, [p.id])) === 63_000, 63_000, { rr, v: (await docOf(p.id))?.vatAmount });
    const c3 = await note("CREDIT_NOTE_RECEIVED", IVid.IV2!, V0.id);
    chk("E3", "C3 ใบลดหนี้ของใบที่รอแต่รับใบกำกับแล้ว ⇒ Cr 1150 7,000", c3.r.ok && (await net(A.v1150, [c3.id])) === -7_000 && (await net(A.v1155, [c3.id])) === 0, -7_000, c3.r);
    const c4 = await note("CREDIT_NOTE_RECEIVED", IVid.IV4!, V1.id);
    chk("E4", "C4 ใบลดหนี้ของใบเคลมไม่ได้ (ไม่เกี่ยวกิจการ) ⇒ Cr 6960 7,000 · ไม่แตะ 1150", c4.r.ok && (await net(A.n6960, [c4.id])) === -7_000 && (await net(A.v1150, [c4.id])) === 0, -7_000, c4.r);
    const d5 = await note("DEBIT_NOTE_RECEIVED", IVid.IV5!, V1.id);
    chk("E5", "C5 ใบเพิ่มหนี้ของใบค่ารับรอง ⇒ Dr 6950 7,000 · ไม่แตะ 1150", d5.r.ok && (await net(A.n6950, [d5.id])) === 7_000 && (await net(A.v1150, [d5.id])) === 0, 7_000, d5.r);
    const v1 = await exp.voidExpenseDoc(tid, S, c1.id, "ยกเลิกใบลดหนี้");
    chk("E6", "ยกเลิก C1 ⇒ 1150 ของ C1 สุทธิ 0", v1.ok && (await net(A.v1150, [c1.id])) === 0, 0, v1);
  }

  // ═══ F — ยกเลิกใบซื้อที่มีใบกำกับรอรับ ═══
  console.log("\nF ยกเลิก/กลับรายการ:");
  {
    const p = (await ptxOf(IVid.IV7!))!;
    const v = await exp.voidExpenseDoc(tid, S, IVid.IV7!, "ยกเลิกทดสอบ");
    const ids = [IVid.IV7!, p.id];
    chk("F1", "ยกเลิก IV7 ⇒ ทุกบัญชีสุทธิ 0 (1150 1155 6950 6900 6940 2100) · ใบกำกับรอรับถูกยกเลิกด้วย", v.ok && (await net(A.v1150, ids)) === 0 && (await net(A.v1155, ids)) === 0 && (await net(A.n6950, ids)) === 0 && (await net(A.e6900, ids)) === 0 && (await net(A.e6940, ids)) === 0 && (await net(A.ap, ids)) === 0 && (await docOf(p.id))?.status === "VOIDED", "0", { v, s: (await docOf(p.id))?.status });
  }

  // ═══ G — ภ.พ.30 / รายงานภาษีซื้อ ═══
  console.log("\nG ภ.พ.30 ภาษีซื้อ (เฉพาะส่วนเคลมได้ · เดือนที่รับ):");
  {
    const oct = await REP.pp30(ctx, "2026-10");
    chk("G1", "ภ.พ.30 ต.ค. ภาษีซื้อ = 420,000 (IV1 IV3 IV6 IV7 IV9 + R2) — ไม่รวมรอ/เคลมไม่ได้", oct.input.total === 420_000, 420_000, { t: oct.input.total, rows: oct.input.rows.map((r: Any) => [r.docNo, r.vat]) });
    const nov = await REP.pp30(ctx, NOW_MONTH);
    chk("G2", "ภ.พ.30 พ.ย. ภาษีซื้อ = 126,000 (รับใบข้ามเดือน · ลดหนี้ · ยกเลิก)", nov.input.total === 126_000, 126_000, { t: nov.input.total, rows: nov.input.rows.map((r: Any) => [r.docNo, r.vat, r.note]) });
    const r3No = (await docOf((await ptxOf(apr2.id))!.id))!.docNo;
    const row = nov.input.rows.find((r: Any) => r.docNo === r3No);
    chk("G3", "แถวรายงานภาษีซื้อ พ.ย. ของ R3 มีข้อความ 'ถือเป็นภาษีซื้อในเดือนภาษี พฤศจิกายน 2569' · ฐาน 1,000,000 อัตรา 7%", row?.note === "ถือเป็นภาษีซื้อในเดือนภาษี พฤศจิกายน 2569" && row.base === 1_000_000 && row.rateBp === 700, "note", row);
    const all = (await prisma.accountDocument.findMany({ where: { systemId: S }, select: { id: true } })).map((x) => x.id);
    chk("G4", "ทั้งสมุด 1155 คงเหลือ 0 (ทุกรายการรอถูกรับ/เคลมไม่ได้/ยกเลิก)", (await net(A.v1155, all)) === 0, 0, await net(A.v1155, all));
    chk("G5", "ทุก JV ของสมุดดุล", await balancedAll(), true, false);
  }
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? `${e.message.slice(0, 400)}\n${e.stack?.split("\n").slice(1, 6).join("\n")}` : String(e));
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
console.log(`\n===== QC ACC T1.4/T1.5 ภาษีซื้อ =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
