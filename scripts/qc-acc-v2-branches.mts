// QC ACC T5.11 (A7) — หลายสาขา: สถานประกอบการ · เลขที่เอกสารแยกสาขา · สาขาบนใบ · รายงานภาษีแยกสถานประกอบการ · วิธียื่น ภ.พ.30
// design note ledger/wo-notes/T5.11.md · ฟิกซ์เจอร์ของตัวเอง (ร้าน "QC T5.11 สาขา" สร้าง/ลบเอง · KEEP=1 = เก็บไว้)
// รัน: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-acc-v2-branches.mts
//
// เฉลยมือ (สตางค์ · VAT 7% แยกนอก):
//   สาขา: 00001 เชียงใหม่ (ที่อยู่ CM) · บันทึกซ้ำ/00000/รหัสผิด = ไม่ทำ · ยื่นรวม: ไม่ยืนยัน = LEGAL_ACK_REQUIRED · ยืนยัน = บันทึก + คำเตือน
//   ใบเสร็จ สนญ. R1 ฐาน 100,000 VAT 7,000 · สาขา 00001: R2 ฐาน 200,000 VAT 14,000 · R3 ฐาน 300,000 VAT 21,000
//   เลขที่: R1 = ลำดับ 1 ของ สนญ. · R2/R3 = "00001-" + ลำดับ 1/2 ของสาขา (ลำดับแยก) · ใบสาขาตรึง "สาขาที่ 00001 เชียงใหม่" + ที่อยู่สาขา
//   รายงานภาษีขายแยกสาขา: สนญ. 1 แถว VAT 7,000 · 00001 2 แถว VAT 35,000 · รวมสองสาขา = ทั้งสมุด 42,000
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-acc-v2-branches");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const cks: { id: string; ok: boolean }[] = [];
const chk = (id: string, n: string, ok: boolean, exp: unknown, act: unknown) => {
  cks.push({ id, ok });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${JSON.stringify(exp)} | act ${JSON.stringify(act)?.slice(0, 600)}`}`);
};
const KEEP = process.env.KEEP === "1";
const FORBID = /references\/|\.md\b|\[(?:V2|V|S|U)\]|ถูกกฎหมาย/;
const { prisma } = (await import("@/lib/core/db" as string)) as Any;
const acc: Any = await import("@/lib/modules/account/service" as string);
const gl: Any = await import("@/lib/modules/account/gl" as string);
const BR: Any = await import("@/lib/modules/account/branches" as string);
const ST: Any = await import("@/lib/modules/account/sales-tax-report" as string);
const W: Any = await import("@/lib/core/settings/legal/warnings" as string);
const sysSvc: Any = await import("@/lib/modules/system/service" as string);
const TENANT_NAME = "QC T5.11 สาขา";

async function purgeTenant(tenantId: string) {
  const rows: { table_name: string }[] = await prisma.$queryRaw`
    SELECT c.table_name FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
    WHERE c.table_schema = 'public' AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE'`;
  let pending = rows.map((r) => r.table_name).filter((t) => t !== "TenantDeletionLog");
  for (let pass = 0; pass < 12 && pending.length > 0; pass++) {
    const still: string[] = [];
    for (const t of pending) {
      try {
        await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, tenantId);
      } catch {
        still.push(t);
      }
    }
    if (still.length === pending.length) break;
    pending = still;
  }
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
}

let tid = "";
const users: string[] = [];
try {
  for (const old of await prisma.tenant.findMany({ where: { name: TENANT_NAME }, select: { id: true } })) await purgeTenant(old.id);
  const stamp = Date.now().toString(36);
  tid = (await prisma.tenant.create({ data: { name: TENANT_NAME, slug: `qc-t511-${stamp}`, status: "ACTIVE", enabledModules: ["ACCOUNT"] } })).id;
  const owner = await prisma.user.create({ data: { email: `qc-t511-${stamp}@qc.local`, name: "เจ้าของ T5.11" } });
  users.push(owner.id);
  await prisma.membership.create({ data: { userId: owner.id, tenantId: tid, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
  const actor = { role: "OWNER", userId: owner.id, unitAccess: ["*"], permissions: {} };
  const SYS = (await sysSvc.createSystem(tid, "ACCOUNT", "บัญชี T5.11")).id;
  const ctx = { tenantId: tid, systemId: SYS };
  await acc.saveSettings(tid, SYS, { orgName: "ร้าน T5.11", vatRegistered: true, vatRateBp: 700, taxId: "0105561000511", branchCode: "00000" });
  await gl.ensureAccounting(ctx);

  // ═══ B1 รายชื่อสาขา + วิธียื่น ═══
  const s0 = await BR.loadBranches(ctx);
  chk("B1.1", "ค่าเริ่ม: สำนักงานใหญ่ 00000 อย่างเดียว · แยกยื่น", s0.home.code === "00000" && s0.branches.length === 0 && s0.vatFilingMode === "SEPARATE", "00000/SEPARATE", s0);
  const dup = await BR.saveBranches(actor, ctx, { branches: [{ code: "00001", name: "ก" }, { code: "00001", name: "ข" }] });
  const hq = await BR.saveBranches(actor, ctx, { branches: [{ code: "00000", name: "ก" }] });
  const badc = await BR.saveBranches(actor, ctx, { branches: [{ code: "12", name: "ก" }] });
  chk("B1.2", "รหัสซ้ำ / 00000 / ไม่ใช่ 5 หลัก = ไม่บันทึก (ข้อความไทย)", !dup.ok && !hq.ok && !badc.ok && /ซ้ำ/.test(dup.reason) && /สำนักงานใหญ่/.test(hq.reason) && /5 หลัก/.test(badc.reason), "fail ×3", [dup, hq, badc]);
  const ok1 = await BR.saveBranches(actor, ctx, { branches: [{ code: "00001", name: "เชียงใหม่", address: "1 ถนนนิมมาน เชียงใหม่" }] });
  const s1 = await BR.loadBranches(ctx);
  chk("B1.3", "บันทึกสาขา 00001 เชียงใหม่", ok1.ok && s1.branches.length === 1 && s1.branches[0].code === "00001" && s1.all.length === 2, "1 สาขา", s1);
  const comb0 = await BR.saveBranches(actor, ctx, { vatFilingMode: "COMBINED" });
  chk("B1.4", "ยื่นรวมไม่ยืนยัน = LEGAL_ACK_REQUIRED + BRANCH_COMBINED_FILING (ม.83 วรรคสี่) · ไม่บันทึก", !comb0.ok && comb0.reason === "LEGAL_ACK_REQUIRED" && comb0.warnings?.[0]?.code === "BRANCH_COMBINED_FILING" && /ม\.83 วรรคสี่/.test(comb0.warnings[0].lawTh) && (await BR.loadBranches(ctx)).vatFilingMode === "SEPARATE", "ack", comb0);
  const comb1 = await BR.saveBranches(actor, ctx, { vatFilingMode: "COMBINED" }, { ack: ["BRANCH_COMBINED_FILING"] });
  const s2 = await BR.loadBranches(ctx);
  chk("B1.5", "ยืนยันแล้ว = บันทึก COMBINED + คำเตือนติดตัว (รายงานยังแยก)", comb1.ok && s2.vatFilingMode === "COMBINED" && s2.warnings.some((w: Any) => w.code === "BRANCH_COMBINED_FILING"), "COMBINED", s2.vatFilingMode);
  await BR.saveBranches(actor, ctx, { vatFilingMode: "SEPARATE" });

  // ═══ B2 เอกสารต่อสาขา: เลขที่แยกลำดับ + สาขาบนใบ ═══
  const cust = await acc.createContact({ tenantId: tid, systemId: SYS, kind: "CUSTOMER", legalType: "COMPANY", name: "ลูกค้าสาขา", taxId: "0105561999511", branchCode: "00000" });
  const mk = async (base: number, branchCode?: string) => {
    const d = await acc.createDocument({ tenantId: tid, systemId: SYS, docType: "RECEIPT", contactId: cust.id, issueDate: new Date(), vatMode: "EXCLUDE", lines: [{ description: "ขาย", qty: 1, unitPrice: base, vatRateBp: 700 }], createdById: owner.id, ...(branchCode ? { branchCode } : {}) });
    const r = await acc.issueDocument(tid, SYS, d.id);
    return { id: d.id, ok: r.ok, doc: await prisma.accountDocument.findUnique({ where: { id: d.id }, select: { docNo: true, branchCode: true, sellerSnapshot: true } }) };
  };
  const R1 = await mk(100_000);
  const R2 = await mk(200_000, "00001");
  const R3 = await mk(300_000, "00001");
  chk("B2.1", "ออกได้ 3 ใบ · สาขาเก็บที่เอกสาร (สนญ. = null)", R1.ok && R2.ok && R3.ok && R1.doc.branchCode === null && R2.doc.branchCode === "00001", "ok", [R1, R2, R3].map((x) => [x.ok, x.doc?.branchCode]));
  const seq = (no: string) => Number((no.match(/(\d+)$/) ?? [])[1]);
  chk("B2.2", "เลขที่: สาขา = '00001-' + ลำดับแยก 1, 2 · สนญ. ลำดับ 1 ไม่มีรหัสสาขา", R2.doc.docNo.startsWith("00001-") && R3.doc.docNo.startsWith("00001-") && seq(R2.doc.docNo) === 1 && seq(R3.doc.docNo) === 2 && !R1.doc.docNo.startsWith("00001-") && seq(R1.doc.docNo) === 1 && R2.doc.docNo.slice(6) === R1.doc.docNo, "แยกลำดับ", [R1.doc.docNo, R2.doc.docNo, R3.doc.docNo]);
  const snap = (R2.doc.sellerSnapshot as Any)?.seller;
  chk("B2.3", "ใบสาขาตรึงผู้ขาย: สาขาที่ 00001 เชียงใหม่ + ที่อยู่สาขา · ใบ สนญ. = สำนักงานใหญ่", snap?.branchCode === "00001" && /สาขาที่ 00001/.test(JSON.stringify(snap)) && /นิมมาน/.test(JSON.stringify(snap)) && (R1.doc.sellerSnapshot as Any)?.seller?.branchCode === "00000", "สาขาที่ 00001", snap);
  const seqRow = await prisma.accountDocSequence.findFirst({ where: { systemId: SYS, docType: "RECEIPT", periodKey: { endsWith: "@00001" } } });
  chk("B2.4", "ลำดับของสาขาเก็บแยก (periodKey …@00001 · lastNo 2)", seqRow?.lastNo === 2, 2, seqRow);

  // ═══ B3 ตั้งสาขาของร่าง ═══
  const draft = await acc.createDocument({ tenantId: tid, systemId: SYS, docType: "QUOTATION", contactId: cust.id, issueDate: new Date(), vatMode: "EXCLUDE", lines: [{ description: "x", qty: 1, unitPrice: 1_000, vatRateBp: 700 }] });
  const sd1 = await BR.setDocumentBranch(ctx, draft.id, "00001");
  const sd2 = await BR.setDocumentBranch(ctx, draft.id, "00009");
  const sd3 = await BR.setDocumentBranch(ctx, R2.id, "00000");
  const sd4 = await BR.setDocumentBranch(ctx, draft.id, "9");
  chk("B3.1", "ร่าง: ตั้ง 00001 ได้ · 00009 (ไม่อยู่ในรายชื่อ) ได้ + BRANCH_UNKNOWN_CODE · ใบที่ออกแล้ว/รหัสผิด = ไม่ทำ", sd1.ok && sd1.warnings.length === 0 && sd2.ok && sd2.warnings[0]?.code === "BRANCH_UNKNOWN_CODE" && !sd3.ok && /ออกเลขที่แล้ว/.test(sd3.reason) && !sd4.ok, "ตามนั้น", [sd1, sd2, sd3, sd4]);
  const sd5 = await BR.setDocumentBranch(ctx, draft.id, null);
  chk("B3.2", "ล้างสาขา (null) = สาขาตั้งต้น", sd5.ok && (await prisma.accountDocument.findUnique({ where: { id: draft.id } })).branchCode === null, null, sd5);

  // ═══ B4 รายงานภาษีแยกสถานประกอบการ ═══
  const month = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 7);
  const all = await ST.salesTaxReport(ctx, month);
  const hqR = await BR.salesTaxReportForBranch(ctx, month, "00000");
  const b1R = await BR.salesTaxReportForBranch(ctx, month, "00001");
  chk("B4.1", "สนญ.: 1 แถว VAT 7,000 · หัว = สำนักงานใหญ่", hqR.rows.length === 1 && hqR.total.vat === 7_000 && hqR.header.branchCode === "00000" && /สำนักงานใหญ่/.test(hqR.header.branchLabel), "7000", { n: hqR.rows.length, vat: hqR.total.vat, h: hqR.header });
  chk("B4.2", "00001: 2 แถว VAT 35,000 ฐาน 500,000 · หัว = สาขาที่ 00001 (เชียงใหม่)", b1R.rows.length === 2 && b1R.total.vat === 35_000 && b1R.total.base === 500_000 && b1R.header.branchLabel === "สาขาที่ 00001 (เชียงใหม่)", "35000", { n: b1R.rows.length, t: b1R.total, h: b1R.header });
  chk("B4.3", "รวมสองสาขา = ทั้งสมุด (42,000) · ข้อตรวจเทียบบัญชีรวมถูกตัดในรายงานสาขา", hqR.total.vat + b1R.total.vat === all.total.vat && all.total.vat === 42_000 && !b1R.checks.some((c: Any) => c.key === "GL_2200"), 42_000, [hqR.total.vat, b1R.total.vat, all.total.vat]);
  chk("B4.4", "คำเตือน BRANCH_REPORT_PER_PLACE [V] (ม.87)", b1R.branchWarnings[0]?.code === "BRANCH_REPORT_PER_PLACE" && /ม\.87/.test(b1R.branchWarnings[0].lawTh), "V", b1R.branchWarnings);
  const pr = await BR.purchaseTaxReportForBranch(ctx, month, "00001");
  chk("B4.5", "ภาษีซื้อแยกสาขา: 0 แถว (ยังไม่มีรายการรับ) · หัว = สาขาที่ 00001", pr.rows.length === 0 && pr.branchTotal.vat === 0 && pr.header.branchCode === "00001", 0, pr.branchTotal);

  const ws = ["BRANCH_COMBINED_FILING", "BRANCH_REPORT_PER_PLACE", "BRANCH_UNKNOWN_CODE"].map((c) => W.legalWarning(c, { branch: "00009" }));
  chk("B5.1", "3 รหัสใหม่: [V] · lawTh ไม่ว่าง · ไม่มี path/ป้าย/คำว่าถูกกฎหมาย · ยื่นรวมต้องยืนยัน", ws.every((w: Any) => w.tag === "V" && w.lawTh && !FORBID.test(`${w.messageTh} ${w.lawTh}`)) && ws[0].ack === true, "ครบ", ws.map((w: Any) => [w.code, w.lawTh]));
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? `${e.message.slice(0, 400)}\n${e.stack?.split("\n").slice(1, 5).join("\n")}` : String(e));
} finally {
  if (tid && !KEEP) await purgeTenant(tid).catch(() => undefined);
  for (const u of KEEP ? [] : users) await prisma.user.delete({ where: { id: u } }).catch(() => undefined);
  await prisma.$disconnect();
}
const failed = cks.filter((c) => !c.ok);
console.log(`\nJSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - failed.length, findings: failed.map((f) => f.id) })}`);
process.exit(failed.length ? 1 : 0);
