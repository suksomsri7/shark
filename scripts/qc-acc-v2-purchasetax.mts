// QC ACC T1.6 — รายงานภาษีซื้อ: ลำดับที่รันต่อเดือน เรียงตามวันที่ได้รับ · วันที่/เลขที่ใบกำกับ · เลขภาษี+สาขาผู้ขาย
//   · ส่วนที่หักไม่ได้ (ตามเหตุ) · รอใบกำกับ · รายการปรับปรุงมือ · ข้อตรวจกระทบยอด · CSV · REST/AI
//
// ใบงาน: ledger/ACCOUNT-TAX-PLAN.md แถว T1.6 (ปิด C4) · design note ledger/wo-notes/T1.6.md
// ฟิกซ์เจอร์ของตัวเอง (ร้านทิ้ง สร้างเอง ลบใน finally) — ไม่พึ่ง seed กลาง
// รัน: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-acc-v2-purchasetax.mts
// ภาพจอ: PT_KEEP=1 = ไม่ลบร้าน + เติมฟิกซ์เจอร์ภาพ (JV ภาษีขาย · ยื่น ภ.พ.30 เดือนก่อนด้วยคีย์ API · ร่างในเดือนที่ยื่น · สิทธิ์ qc-owner)
//        PT_CLEAN_TID=<tenantId> = ลบร้านที่เก็บไว้ (ทางเดียวกับ finally) แล้วจบ
//
// เฉลยคำนวณมือ (อัตรา 7% · แยก VAT) · M = เดือนนี้ (ไทย) · P = เดือนก่อน:
//   P2  ใบค่าใช้จ่ายรอใบกำกับ P-12 ฐาน 2,000,000 → รับใบ "B-77" ลงวันที่ P-12 · ลงภาษีซื้อ M-03 ⇒ แถว 140,000 · ข้อความเคลมข้ามเดือน
//   X6  ใบรอใบกำกับ M-02 ฐาน 400,000 → รับ (ลง M-04) แล้วยกเลิกการรับ (วันนี้ = เดือน M) ⇒ แถวยอด 0 + หมายเหตุยกเลิก · กลับไปรอ 28,000
//   E1  ค่าใช้จ่ายเคลม M-06 ฐาน 1,000,000 ผู้ขายสาขา 00002 เลขใบ "TAX-A-0005" ⇒ 70,000
//   C3  ใบลดหนี้รับอ้าง E1 M-08 ฐาน 100,000 ⇒ −7,000 ฐาน −100,000
//   J7  JV มือ M-07 Dr 1150 5,000 ⇒ ส่วนปรับปรุง (ฐาน 0)
//   N4  ค่ารับรอง (6930) M-05 ฐาน 500,000 ⇒ หักไม่ได้ 35,000 กลุ่มค่ารับรอง (ไม่รวมยอด)
//   P5  ใบรอใบกำกับ M-05 ฐาน 300,000 ⇒ รอ 21,000 (ไม่รวมยอด)
//   ลำดับ: P2(03)=1 · X6(04)=2 · E1(06)=3 · C3(08)=4 · รายใบ ภาษี 203,000 ฐาน 2,900,000 · +ปรับปรุง 5,000 = 208,000
//   = ยอดเคลื่อนไหว 1150 ของเดือน = ภาษีซื้อ ภ.พ.30 · ยอดซื้อ ภ.พ.30 = 2,900,000 · หักไม่ได้ 35,000 · รอใบกำกับ 49,000
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-acc-v2-purchasetax");

const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, exp: unknown, act: unknown, sev: Sev = "CRITICAL") => {
  cks.push({ id, ok, sev });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${JSON.stringify(exp)} | act ${JSON.stringify(act)?.slice(0, 900)}`}`);
};

const bkkMonth = (d: Date) => { const t = new Date(d.getTime() + 7 * 3_600_000); return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`; };
const M = bkkMonth(new Date());
const P = (() => { const [y, m] = M.split("-").map(Number); return m === 1 ? `${y! - 1}-12` : `${y}-${String(m! - 1).padStart(2, "0")}`; })();
const D = (ym: string, day: number) => new Date(`${ym}-${String(day).padStart(2, "0")}T05:00:00Z`); // 12:00 ไทย
const TH_MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const thMonth = (ym: string) => `${TH_MONTHS[Number(ym.slice(5)) - 1]} ${Number(ym.slice(0, 4)) + 543}`;

let tid = process.env.PT_CLEAN_TID ?? "";
const users: string[] = [];
const KEEP = process.env.PT_KEEP === "1";
try {
  if (tid) throw new Error("CLEAN_ONLY");
  const acc = (await import("@/lib/modules/account/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const exp = (await import("@/lib/modules/account/expense" as string)) as Any;
  const gl = (await import("@/lib/modules/account/gl" as string)) as Any;
  const REP = (await import("@/lib/modules/account/reports" as string)) as Any;
  const JV = (await import("@/lib/modules/account/journal-v2" as string)) as Any;
  const OPS = (await import("@/lib/modules/account/api/ops/gl-read" as string)) as Any;
  const SK = (await import("@/lib/ai/skills" as string)) as Any;

  // ═══ ฟิกซ์เจอร์ ═══
  const stamp = Date.now();
  const t = await prisma.tenant.create({ data: { name: "QC T1.6 purchasetax", slug: `qc-t16-${stamp}` } });
  tid = t.id;
  const owner = await prisma.user.create({ data: { email: `qc-t16-${stamp}@qc.local`, name: "เจ้าของ T1.6" } });
  users.push(owner.id);
  await prisma.membership.create({ data: { userId: owner.id, tenantId: tid, role: "OWNER", unitAccess: ["*"], acceptedAt: new Date() } });
  const S = (await sys.createSystem(tid, "ACCOUNT", "บัญชี T1.6")).id;
  const ctx = { tenantId: tid, systemId: S };
  await acc.saveSettings(tid, S, { orgName: "ร้าน T1.6", vatRegistered: true, vatRateBp: 700, taxId: "0105561000000", branchCode: "00000" });
  await gl.ensureAccounting(ctx);
  const V1 = await acc.createContact({ tenantId: tid, systemId: S, kind: "VENDOR", legalType: "COMPANY", name: "ผู้ขายสาขาสอง", taxId: "0105561000001", branchCode: "00002" });
  const V2 = await acc.createContact({ tenantId: tid, systemId: S, kind: "VENDOR", legalType: "COMPANY", name: "ผู้ขายสำนักงานใหญ่", taxId: "0105561000002", branchCode: "00000" });
  const L = async (code: string) => (await prisma.accountLedger.findFirst({ where: { systemId: S, code }, select: { id: true } }))!.id;
  const A = { e6900: await L("6900"), e6930: await L("6930"), v1150: await L("1150") };
  const line = (accountId: string, unitPrice: number) => ({ description: "ค่าใช้จ่าย", qty: 1, unitPrice, discount: 0, vatRateBp: 700, accountId });
  const mk = (contactId: string, date: Date, accountId: string, base: number, extra: Any = {}) =>
    exp.createExpenseDoc({ tenantId: tid, systemId: S, docType: "EXPENSE", contactId, vatMode: "EXCLUDE", issueDate: date, lines: [line(accountId, base)], createdById: owner.id, ...extra });
  const issue = async (id: string) => {
    const r = await exp.issueExpenseDoc(tid, S, id);
    if (!r.ok) throw new Error(`issue ${id}: ${r.reason}`);
  };
  const ptxOf = (id: string) => prisma.accountDocument.findFirst({ where: { systemId: S, docType: "PURCHASE_TAX_INVOICE", sourceDocId: id }, orderBy: { createdAt: "desc" } });

  // P2 — เดือนก่อน รอใบกำกับ → รับเดือนนี้
  const p2 = await mk(V2.id, D(P, 12), A.e6900, 2_000_000, { inputVatStatus: "PENDING" });
  await issue(p2.id);
  const p2ptx = (await ptxOf(p2.id))!;
  const r2 = await exp.receivePurchaseTaxInvoice(tid, S, p2ptx.id, { vendorInvoiceDate: D(P, 12), vendorInvoiceNo: "B-77", claimDate: D(M, 3) });
  // X6 — รับแล้วยกเลิกการรับในเดือนเดียวกัน
  const x6 = await mk(V2.id, D(M, 2), A.e6900, 400_000, { inputVatStatus: "PENDING" });
  await issue(x6.id);
  const x6ptx = (await ptxOf(x6.id))!;
  const r6 = await exp.receivePurchaseTaxInvoice(tid, S, x6ptx.id, { vendorInvoiceDate: D(M, 2), claimDate: D(M, 4) });
  const v6 = await exp.voidExpenseDoc(tid, S, x6ptx.id, "ใบกำกับผิด รอใบใหม่");
  // E1 — เคลมในเดือน (เลขใบของผู้ขายที่ช่องอ้างอิง)
  const e1 = await mk(V1.id, D(M, 6), A.e6900, 1_000_000);
  await prisma.accountDocument.update({ where: { id: e1.id }, data: { reference: "TAX-A-0005" } });
  await issue(e1.id);
  // C3 — ใบลดหนี้รับอ้าง E1
  const c3 = await exp.createExpenseDoc({ tenantId: tid, systemId: S, docType: "CREDIT_NOTE_RECEIVED", contactId: V1.id, vatMode: "EXCLUDE", issueDate: D(M, 8), sourceDocId: e1.id, adjustReason: "ลดราคา", lines: [line(A.e6900, 100_000)], createdById: owner.id });
  await prisma.accountDocument.update({ where: { id: c3.id }, data: { reference: "CN-9" } });
  await issue(c3.id);
  // N4 — ค่ารับรอง (หักไม่ได้)
  const n4 = await mk(V1.id, D(M, 5), A.e6930, 500_000);
  await issue(n4.id);
  // P5 — รอใบกำกับ
  const p5 = await mk(V2.id, D(M, 5), A.e6900, 300_000, { inputVatStatus: "PENDING" });
  await issue(p5.id);
  // J7 — JV มือแตะ 1150
  const j7 = await JV.createManualEntry(ctx, { dateKey: `${M}-07`, memo: "ปรับภาษีซื้อ", lines: [{ accountId: A.v1150, debit: 5_000, credit: 0 }, { accountId: A.e6900, debit: 0, credit: 5_000 }], postedById: owner.id });
  chk("F0", "ฟิกซ์เจอร์: รับใบ P2 · รับ+ยกเลิก X6 · JV มือ สำเร็จ", r2.ok && r6.ok && v6.ok && j7.ok, "ok", { r2, r6, v6, j7 });

  // ═══ A — ตัวรายงาน ═══
  console.log("\nA ตัวรายงาน (ส่วนที่หักได้):");
  const pp = await REP.pp30(ctx, M);
  const pt = pp.purchaseTax;
  const h = pt.header;
  chk("A1", "หัวรายงาน: ชื่อ · เลขผู้เสียภาษี 13 หลัก · สำนักงานใหญ่ · เดือนภาษี · ไม่มีคำเตือนหัว", h.orgName === "ร้าน T1.6" && h.taxId === "0105561000000" && h.branchLabel === "สำนักงานใหญ่" && h.monthLabel === thMonth(M) && h.warnings.length === 0, thMonth(M), h);
  const seqs = pt.rows.map((r: Any) => `${r.seq}:${r.docType}:${r.receivedDate}:${r.vat}`);
  chk("A2", "ลำดับที่ 1…4 เรียงตามวันที่ได้รับ: P2(03) · X6(04) · E1(06) · C3(08)", JSON.stringify(seqs) === JSON.stringify([`1:PURCHASE_TAX_INVOICE:${M}-03:140000`, `2:PURCHASE_TAX_INVOICE:${M}-04:0`, `3:EXPENSE:${M}-06:70000`, `4:CREDIT_NOTE_RECEIVED:${M}-08:-7000`]), "4 แถว", seqs);
  const rP2 = pt.rows[0], rX6 = pt.rows[1], rE1 = pt.rows[2], rC3 = pt.rows[3];
  chk("A3", "P2: วันที่ใบกำกับ = วันที่ในใบของผู้ขาย (เดือนก่อน) · เลขที่ B-77 · ผู้ขาย+เลขภาษี+สาขา 00000 · ฐาน 2,000,000 · ข้อความเคลมข้ามเดือน", rP2?.invoiceDate === `${P}-12` && rP2.invoiceNo === "B-77" && rP2.vendorName === "ผู้ขายสำนักงานใหญ่" && rP2.vendorTaxId === "0105561000002" && rP2.vendorBranchCode === "00000" && rP2.base === 2_000_000 && rP2.notes.includes(`ถือเป็นภาษีซื้อในเดือนภาษี ${thMonth(M)}`), "B-77", rP2);
  chk("A4", "X6 ยกเลิกการรับในเดือนเดียวกัน: ยอด 0 · ฐาน 0 · ป้ายยกเลิก + หมายเหตุ · ไม่มีเลขใบผู้ขาย ⇒ แสดงเลขเอกสาร + หมายเหตุ", rX6?.vat === 0 && rX6.base === 0 && rX6.cancelled === true && rX6.notes.some((n: string) => /ยกเลิกการรับใบกำกับภายในเดือนนี้/.test(n)) && rX6.invoiceNo === rX6.docNo && rX6.notes.some((n: string) => /ไม่ได้บันทึกเลขที่ใบกำกับของผู้ขาย/.test(n)), "0/ยกเลิก", rX6);
  chk("A5", "E1: เลขใบ TAX-A-0005 · สาขาผู้ขาย 00002 · ฐาน 1,000,000 ภาษี 70,000 · วันที่ใบ = วันที่เอกสาร", rE1?.invoiceNo === "TAX-A-0005" && rE1.vendorBranchCode === "00002" && rE1.vendorTaxId === "0105561000001" && rE1.base === 1_000_000 && rE1.vat === 70_000 && rE1.invoiceDate === `${M}-06`, "E1", rE1);
  chk("A6", "C3 ใบลดหนี้รับ: −7,000 ฐาน −100,000 · หมายเหตุอ้างใบเดิม TAX-A-0005 + เหตุ", rC3?.vat === -7_000 && rC3.base === -100_000 && rC3.invoiceNo === "CN-9" && rC3.notes.some((n: string) => /ใบลดหนี้รับ อ้างอิงใบบันทึกค่าใช้จ่ายเลขที่ TAX-A-0005/.test(n) && /ลดราคา/.test(n)), "-7000", rC3);
  chk("A7", "รวมรายใบ: ภาษี 203,000 ฐาน 2,900,000", pt.docsTotal.vat === 203_000 && pt.docsTotal.base === 2_900_000, { vat: 203_000, base: 2_900_000 }, pt.docsTotal);
  chk("A8", "รายการปรับปรุงมือ: 1 รายการ 5,000 · ฐาน 0 · ไม่มีลำดับที่ · ป้าย JV ที่บันทึกเอง", pt.adjustments.length === 1 && pt.adjustments[0].vat === 5_000 && pt.adjustments[0].base === 0 && pt.adjustments[0].seq === null && pt.adjustments[0].manual === true && /JV ที่บันทึกเอง/.test(pt.adjustments[0].notes[0]), 5_000, pt.adjustments);
  chk("A9", "รวมภาษีซื้อทั้งสิ้น 208,000 = ยอดเคลื่อนไหว 1150 ของเดือน", pt.total.vat === 208_000 && pt.glVat === 208_000, 208_000, { t: pt.total, gl: pt.glVat });
  chk("A10", "ข้อตรวจ 3 ข้อผ่าน (GL · ภ.พ.30 · ฐาน×อัตรา)", pt.checks.length === 3 && pt.checks.every((c: Any) => c.ok), "ผ่าน", pt.checks);
  chk("A11", "ภ.พ.30: ภาษีซื้อ 208,000 · ยอดซื้อ 2,900,000 (จากรายงานภาษีซื้อ)", pp.ret.lines.inputVat === 208_000 && pp.ret.lines.purchases === 2_900_000, { iv: 208_000, p: 2_900_000 }, { iv: pp.ret.lines.inputVat, p: pp.ret.lines.purchases });
  chk("A12", "ไม่มีแถวของใบค่ารับรอง/ใบรอใบกำกับในตัวรายงาน", !pt.rows.some((r: Any) => r.docId === n4.id || r.docId === p5.id || r.docId === x6.id || r.docId === p2.id), "ไม่มี", pt.rows.map((r: Any) => r.docNo));

  // ═══ B — ส่วนต่อท้าย (ไม่รวมยอด) ═══
  console.log("\nB หักไม่ได้ / รอใบกำกับ:");
  const g = pt.notClaimable.groups;
  chk("B1", "หักไม่ได้: กลุ่มค่ารับรอง (ม.82/5(4)) รายจ่ายได้ · N4 ภาษี 35,000 ฐาน 500,000 · รวม 35,000", g.length === 1 && g[0].reason === "ENTERTAINMENT" && g[0].group === "DEDUCTIBLE" && /82\/5\(4\)/.test(g[0].sectionTh) && g[0].rows.length === 1 && g[0].rows[0].docId === n4.id && g[0].rows[0].vat === 35_000 && g[0].rows[0].base === 500_000 && pt.notClaimable.total.vat === 35_000, 35_000, g);
  const pend = pt.pending.rows.map((r: Any) => `${r.sourceId === x6.id ? "X6" : r.sourceId === p5.id ? "P5" : r.sourceId}:${r.vat}`);
  chk("B2", "รอใบกำกับ: X6 28,000 (กลับไปรอหลังยกเลิกการรับ) · P5 21,000 · รวม 49,000 · เรียงตามวันที่", JSON.stringify(pend) === JSON.stringify(["X6:28000", "P5:21000"]) && pt.pending.vat === 49_000, "X6,P5", pend);
  const prev = (await REP.pp30(ctx, P)).purchaseTax;
  chk("B3", "เดือนก่อน: ไม่มีภาษีซื้อที่หักได้ (P2 ยังรอ ณ เดือนนั้น) · รายการรอของเดือนก่อนไม่รวมเอกสารที่ลงวันที่เดือนนี้", prev.rows.length === 0 && prev.total.vat === 0 && !prev.pending.rows.some((r: Any) => r.sourceId === p5.id || r.sourceId === x6.id), "0", { rows: prev.rows.length, pend: prev.pending.rows.map((r: Any) => r.sourceDocNo) });

  // ═══ C — CSV / REST / AI ═══
  console.log("\nC CSV · REST · AI:");
  const csv: string = await REP.pp30Csv(ctx, M);
  const seqLine = csv.split("\n").find((l) => l.startsWith("1,") && l.includes("B-77"));
  chk("C1", "CSV: หัวรายงานภาษีซื้อ · แถวลำดับ 1 มีวันที่ได้รับ/วันที่ใบ/เลขที่/เลขภาษี/สาขา/1400.00/ข้อความเคลมข้ามเดือน", /รายงานภาษีซื้อ/.test(csv) && !!seqLine && seqLine.includes(`${M}-03`) && seqLine.includes(`${P}-12`) && seqLine.includes("0105561000002") && seqLine.includes("00000") && seqLine.includes("1400.00") && seqLine.includes("ถือเป็นภาษีซื้อในเดือนภาษี"), "แถว 1", seqLine);
  chk("C2", "CSV: รวมภาษีซื้อทั้งสิ้น 2080.00 · รายการปรับปรุง · หักไม่ได้ (ค่ารับรอง 350.00) · รอใบกำกับ 490.00", /รวมภาษีซื้อทั้งสิ้น,+29000\.00,2080\.00/.test(csv) && /รายการปรับปรุง/.test(csv) && /ค่ารับรอง.*350\.00/.test(csv) && /รวมภาษีซื้อรอใบกำกับ,+490\.00/.test(csv), "ครบ", csv.split("\n").filter((l) => /รวม|ค่ารับรอง/.test(l)));
  const op = OPS.GL_READ_OPS.find((o: Any) => o.id === "reports.purchase-tax");
  const view = op ? await op.handler({ actor: { tenantId: tid, systemId: S }, input: { period: M }, params: {} }) : null;
  chk("C3", "REST reports.purchase-tax: แถวเดียวกับตัวอ่าน (ลำดับ · เลขที่ · ภาษีสตางค์) · รวม 208,000 · หักไม่ได้ 35,000 · รอ 49,000", !!view && JSON.stringify(view.rows.map((r: Any) => [r.seq, r.invoiceNo, r.vatSatang])) === JSON.stringify(pt.rows.map((r: Any) => [r.seq, r.invoiceNo, r.vat])) && view.totals.vatSatang === 208_000 && view.notClaimable.vatSatang === 35_000 && view.pending.vatSatang === 49_000 && view.checks.every((c: Any) => c.ok), "เท่ากัน", view && { rows: view.rows.length, t: view.totals });
  const viaCsv = op?.csv ? await op.csv({ actor: { tenantId: tid, systemId: S }, input: { period: M } }) : "";
  chk("C4", "REST CSV ของรายงานภาษีซื้อ = บล็อกเดียวกับ CSV ภ.พ.30", !!viaCsv && csv.includes(viaCsv.replace(/^﻿/, "").split("\n").slice(0, 12).join("\n")), "บล็อกเดียวกัน", viaCsv.slice(0, 200));
  const inSkills = SK.SKILLS.filter((s: Any) => (s.tools ?? []).includes("account_purchase_tax_report")).length;
  chk("C5", "เครื่องมือ AI account_purchase_tax_report: op อ่าน (สิทธิ์ภาษี) + อยู่ใน skill เดียว", op?.tool?.name === "account_purchase_tax_report" && op.kind === "read" && op.action === "account.tax.view" && inSkills === 1, 1, { tool: op?.tool, inSkills });

  // ═══ D — หัวรายงานเตือนเมื่อไม่มีเลขผู้เสียภาษี ═══
  await acc.saveSettings(tid, S, { orgName: "ร้าน T1.6", vatRegistered: true, vatRateBp: 700, taxId: "", branchCode: "00001", branchName: "ป่าตอง" });
  const pt2 = (await REP.pp30(ctx, M)).purchaseTax;
  chk("D1", "ไม่มีเลขผู้เสียภาษี ⇒ คำเตือนหัวรายงาน (ทะเบียนกลาง) ระบุรายงานภาษีซื้อ · สาขา 00001", pt2.header.warnings.some((w: Any) => w.code === "TAX_REPORT_TAX_ID_MISSING" && /รายงานภาษีซื้อ/.test(w.messageTh)) && /สาขาที่ 00001/.test(pt2.header.branchLabel), "เตือน", pt2.header);
  if (KEEP) {
    // ═══ ฟิกซ์เจอร์ภาพจอ (ไม่ใช่ข้อสอบ) ═══
    const qcOwner = await prisma.user.findFirst({ where: { email: "qc-owner@shark.local" }, select: { id: true } });
    if (qcOwner) await prisma.membership.create({ data: { userId: qcOwner.id, tenantId: tid, role: "OWNER", unitAccess: ["*"], acceptedAt: new Date() } });
    await acc.saveSettings(tid, S, { orgName: "ร้าน T1.6", vatRegistered: true, vatRateBp: 700, taxId: "0105561000000", branchCode: "00000", branchName: "สำนักงานใหญ่" });
    const v2200 = await L("2200");
    await JV.createManualEntry(ctx, { dateKey: `${M}-09`, memo: "ปรับภาษีขาย", lines: [{ accountId: v2200, debit: 5_000, credit: 0 }, { accountId: A.e6900, debit: 0, credit: 5_000 }], postedById: owner.id });
    const ak = (await import("@/lib/api-keys/service" as string)) as Any;
    const scopes = (await import("@/lib/api-keys/scopes" as string)) as Any;
    const route = (await import("@/app/api/v1/account/[...path]/route" as string)) as Any;
    const kW = await ak.createApiKey({ tenantId: tid }, "T16 shots", { scopes: scopes.expandBundles(["accountant"]), systemId: S });
    const call = async (method: string, path: string, body?: unknown) => {
      const req = new Request(`http://x/api/v1/account${path}`, { method, headers: { authorization: `Bearer ${kW.rawKey}`, "idempotency-key": `t16-${Date.now()}-${Math.random()}`, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
      const res = await route[method](req, { params: Promise.resolve({ path: path.split("?")[0]!.split("/").filter(Boolean) }) });
      return res.status;
    };
    const f1 = await call("POST", `/periods/${P}/vat-filed`, {});
    const draft = await mk(V1.id, D(P, 20), A.e6900, 200_000);
    console.log(`KEEP tenant=${tid} system=${S} M=${M} P=${P} vatFiledViaApi=${f1} draftInFiledMonth=${draft.id} p5=${p5.id} n4=${n4.id} x6ptx=${x6ptx.id}`);
  }
} catch (e) {
  if (e instanceof Error && e.message === "CLEAN_ONLY") console.log(`cleaning ${tid}`);
  else chk("CRASH", "จบ", false, "จบ", e instanceof Error ? `${e.message.slice(0, 400)}\n${e.stack?.split("\n").slice(1, 6).join("\n")}` : String(e));
} finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  if (tid && !KEEP) {
    const P_ = prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown>; updateMany: (a: unknown) => Promise<unknown> }>;
    await d(() => P_.accountJournalLine.deleteMany({ where: { tenantId: tid } }));
    await d(() => P_.accountJournalEntry.updateMany({ where: { tenantId: tid }, data: { reversalOfId: null } }));
    await d(() => P_.accountJournalEntry.deleteMany({ where: { tenantId: tid } }));
    await d(() => P_.accountDocumentPayment.deleteMany({ where: { tenantId: tid } }));
    await d(() => P_.accountDocumentRelation.deleteMany({ where: { tenantId: tid } }));
    await d(() => P_.accountDocumentLine.deleteMany({ where: { tenantId: tid } }));
    await d(() => P_.accountDocument.updateMany({ where: { tenantId: tid }, data: { sourceDocId: null, replacedById: null, sourcePaymentId: null } }));
    for (const m of ["accountAttachment", "accountDocument", "accountDocSequence", "accountProduct", "accountMapping", "accountFinance", "accountContact", "accountPeriod", "accountSettings", "settingChange", "settingValue", "auditLog", "outboxEvent", "membership", "appSystemUnit"]) {
      await d(() => P_[m].deleteMany({ where: { tenantId: tid } }));
    }
    await d(() => P_.accountLedger.updateMany({ where: { tenantId: tid }, data: { parentId: null } }));
    await d(() => P_.accountLedger.deleteMany({ where: { tenantId: tid } }));
    await d(() => P_.appSystem.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.businessUnit.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.tenant.delete({ where: { id: tid } }));
  }
  if (!KEEP) for (const u of users) await d(() => prisma.user.delete({ where: { id: u } }));
  if (process.env.PT_CLEAN_TID) await d(() => prisma.user.deleteMany({ where: { email: { startsWith: "qc-t16-", endsWith: "@qc.local" }, memberships: { none: {} } } }));
  await prisma.$disconnect();
}

const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC ACC T1.6 รายงานภาษีซื้อ =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
