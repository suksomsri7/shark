// QC ACC T2.3 — เนื้อหาใบลดหนี้ / ใบเพิ่มหนี้: มูลค่าเดิม / ที่ถูก / ผลต่าง / VAT · เหตุผลสองกลุ่ม + อื่น ๆ (รหัส + ข้อความ) · มาตราตามชนิด ·
//   ป้ายชนิดจริงของใบเดิม · ไม่อ้างอิง = คำเตือน + ยืนยัน · ไม่พิมพ์ครบกำหนด/ช่องทางชำระ · คอลัมน์ "ก่อนภาษี" · ฝั่งซื้อ CNR เลข/วันที่เอกสารผู้ขาย + รหัส
//
// ใบงาน: ledger/ACCOUNT-TAX-PLAN.md T2.3 (ปิด B10 B11) · design note ledger/wo-notes/T2.3.md
// กฎ: skill common-vat-invoice.md §7 §16 [V] · audit-checklist-accounting.md B10 B11
// ฟิกซ์เจอร์ของตัวเอง (ร้านทิ้ง สร้าง/ลบเอง · KEEP=1 เก็บไว้ดูจอ)
// รัน: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-acc-v2-adjust-content.mts
//
// เฉลยมือ (สตางค์): TX แยก VAT ฐาน 1,000,000 VAT 70,000
//   CN1 รวม VAT 200,000 → ฐาน round(200,000/1.07) = 186,916 · VAT 13,084 → เดิม 1,000,000 · ที่ถูก 813,084 · ผลต่าง 186,916
//   CN2 รวม VAT 107,000 → ฐาน 100,000 VAT 7,000 → เดิม 813,084 (รวมการปรับปรุงก่อนหน้า 1 ฉบับ) · ที่ถูก 713,084
//   DN1 รวม VAT 53,500 → ฐาน 50,000 VAT 3,500 → เดิม 713,084 (ก่อนหน้า 2 ฉบับ) · ที่ถูก 763,084
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-acc-v2-adjust-content");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, exp: unknown, act: unknown, sev: Sev = "CRITICAL") => {
  cks.push({ id, ok, sev });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${JSON.stringify(exp)} | act ${JSON.stringify(act)?.slice(0, 500)}`}`);
};
const eq = (id: string, n: string, act: unknown, exp: unknown, sev: Sev = "CRITICAL") => chk(id, n, JSON.stringify(act) === JSON.stringify(exp), exp, act, sev);

const KEEP = process.env.KEEP === "1";
const { prisma } = (await import("@/lib/core/db" as string)) as Any;
const sys: Any = await import("@/lib/modules/system/service" as string);
const acc: Any = await import("@/lib/modules/account/service" as string);
const exp: Any = await import("@/lib/modules/account/expense" as string);
const gl: Any = await import("@/lib/modules/account/gl" as string);
const PV: Any = await import("@/lib/modules/account/print-view" as string);
const DD: Any = await import("@/lib/modules/account/doc-detail" as string);
const TH: Any = await import("@/lib/core/settings/legal/th-tax-2569" as string);
const W: Any = await import("@/lib/core/settings/legal/warnings" as string);
const DET: Any = await import("@/components/account-v2/doc-editor-types" as string);
const React = (await import("react")).default;
const RDS: Any = await import("react-dom/server");
const { PrintDocument } = (await import("@/components/account-v2/PrintDocument" as string)) as Any;
const accEnv: Any = await import("./acc-v2-env.mts" as string);
const text = (view: Any) => RDS.renderToStaticMarkup(React.createElement(PrintDocument, { view, mark: { state: "PLAIN" } })).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

async function purgeTenant(tenantId: string) {
  const rows: { table_name: string }[] = await prisma.$queryRaw`
    SELECT c.table_name FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
    WHERE c.table_schema = 'public' AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE'`;
  let pending = rows.map((r) => r.table_name);
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

// ═══ P0 ตาราง ═══
console.log("\n── P0 ตารางค่ากฎหมาย (เหตุผล · มาตรา) ──");
eq("P0.1", "มาตรา: ใบลดหนี้ 86/10 · ใบเพิ่มหนี้ 86/9 (ป้าย V)", [TH.ADJUST_NOTE_SECTIONS.CREDIT.sectionTh, TH.ADJUST_NOTE_SECTIONS.DEBIT.sectionTh, TH.ADJUST_NOTE_SECTIONS.CREDIT.tag], ["มาตรา 86/10", "มาตรา 86/9", "V"]);
eq("P0.2", "ใบลดหนี้: เหตุตาม ฉ.82 ข้อ 2(2)(5)(6) + อื่น ๆ", TH.adjustReasonsFor("CREDIT_NOTE").map((r: Any) => r.code), ["CN_DEPOSIT_REFUND", "CN_SERVICE_DEFECT", "CN_SERVICE_NOT_PROVIDED", "OTHER"]);
eq("P0.3", "ใบเพิ่มหนี้: เหตุ ม.82/9 (ส่งของเกิน/ให้บริการเกิน/ราคาต่ำกว่าจริง) + อื่น ๆ", TH.adjustReasonsFor("DEBIT_NOTE").map((r: Any) => r.code), ["DN_GOODS_OVER", "DN_SERVICE_OVER", "DN_PRICE_UNDER", "OTHER"]);
eq("P0.4", "ฝั่งซื้อใช้กลุ่มเดียวกัน · ฟอร์มเสนอตามชนิด · ใบส่งคืนสินค้าใช้รายการเดิม", [TH.adjustReasonsFor("DEBIT_NOTE_RECEIVED").length, DET.reasonOptionsFor("CREDIT_NOTE").map((o: Any) => o.value).includes("DN_PRICE_UNDER"), DET.reasonOptionsFor("PURCHASE_RETURN").map((o: Any) => o.value).includes("DAMAGED")], [4, false, true]);
chk("P0.5", "ทุกแถวมีที่มา + ป้าย + วันที่ตรวจ", TH.ADJUST_NOTE_REASONS.every((r: Any) => r.source && r.tag === "V" && /^\d{4}-\d{2}-\d{2}$/.test(r.checkedAt)), "ครบ", TH.ADJUST_NOTE_REASONS, "MAJOR");

let tid = "";
try {
  console.log("\n── P1 ฟิกซ์เจอร์ ──");
  for (const old of await prisma.tenant.findMany({ where: { name: "QC T2.3 ADJUST CONTENT" }, select: { id: true } })) await purgeTenant(old.id);
  tid = (await prisma.tenant.create({ data: { name: "QC T2.3 ADJUST CONTENT", slug: `qc-t23-${Date.now().toString(36)}`, status: "ACTIVE", enabledModules: ["ACCOUNT"] } })).id;
  const owner = (await prisma.user.findFirst({ where: { email: "qc-t23@qc.local" } })) ?? (await prisma.user.create({ data: { email: "qc-t23@qc.local", name: "เจ้าของ T2.3" } }));
  await prisma.membership.create({ data: { userId: owner.id, tenantId: tid, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
  const SYS = (await sys.createSystem(tid, "ACCOUNT", "บัญชี T2.3")).id;
  await acc.saveSettings(tid, SYS, { orgPrefix: "บริษัท", orgName: "ทีสองสาม ปรับหนี้ จำกัด", taxId: "0105566023001", branchCode: "00000", branchName: "สำนักงานใหญ่", address: "23 ถ.ทดสอบ", vatRegistered: true, taxPointBasis: "ON_ISSUE" });
  await gl.ensureAccounting({ tenantId: tid, systemId: SYS });
  const cust = await acc.createContact({ tenantId: tid, systemId: SYS, kind: "CUSTOMER", legalType: "COMPANY", name: "บริษัท ผู้ซื้อ สองสาม จำกัด", taxId: "0105566023999", branchCode: "00000", address: "1 ถ.ผู้ซื้อ" });
  const vend = await acc.createContact({ tenantId: tid, systemId: SYS, kind: "VENDOR", legalType: "COMPANY", name: "บริษัท ผู้ขาย สองสาม จำกัด", taxId: "0105566023888", branchCode: "00000", address: "2 ถ.ผู้ขาย" });
  const ALL = { codes: [...W.LEGAL_WARNING_CODES], actorId: owner.id, via: "screen" };
  const issue = async (id: string, ack: Any = ALL) => {
    const r = await acc.issueDocument(tid, SYS, id, { ack });
    if (!r.ok) throw new Error(`ออกเอกสารไม่ได้: ${r.reason}`);
  };
  const tx = await acc.createDocument({ tenantId: tid, systemId: SYS, docType: "TAX_INVOICE", contactId: cust.id, vatMode: "EXCLUDE", lines: [{ description: "บริการดำน้ำ", qty: 1, unitPrice: 1_000_000, discount: 0, vatRateBp: 700 }], createdById: owner.id });
  await issue(tx.id);
  const note = async (docType: string, gross: number, code: string, extra: Any = {}) => {
    const d = await acc.createDocument({ tenantId: tid, systemId: SYS, docType, contactId: cust.id, vatMode: "INCLUDE", sourceDocId: tx.id, lines: [{ description: "ปรับปรุง", qty: 1, unitPrice: gross, discount: 0, vatRateBp: 700 }], createdById: owner.id, adjustReasonCode: code, adjustReason: DET.packAdjustReason(code, ""), dueDate: new Date(Date.now() + 30 * 86400_000), ...extra });
    return d.id as string;
  };
  const cn1 = await note("CREDIT_NOTE", 200_000, "CN_SERVICE_DEFECT");
  const cn1Pre = await acc.issueDocument(tid, SYS, cn1);
  chk("P1.1", "CN อ้างใบเดิม + รหัสเหตุผลของกลุ่ม (ไม่มีข้อความเสริม) → ออกได้ทันที ไม่มีคำเตือน", cn1Pre.ok === true, "ok", cn1Pre);
  const cn2 = await note("CREDIT_NOTE", 107_000, "CN_SERVICE_NOT_PROVIDED");
  await issue(cn2);
  const dn1 = await note("DEBIT_NOTE", 53_500, "DN_PRICE_UNDER");
  await issue(dn1);
  const row = await prisma.accountDocument.findUnique({ where: { id: cn1 }, select: { adjustReasonCode: true, adjustReason: true, subTotal: true, vatAmount: true } });
  eq("P1.2", "เก็บรหัส + ข้อความ (ป้ายจากตาราง) · ฐาน 186,916 VAT 13,084", [row?.adjustReasonCode, row?.adjustReason, row?.subTotal, row?.vatAmount], ["CN_SERVICE_DEFECT", "บริการบกพร่อง / ไม่ตรงตามข้อกำหนด", 186_916, 13_084]);

  // ═══ P2 กล่องมูลค่า ═══
  console.log("\n── P2 มูลค่าเดิม / ที่ถูก / ผลต่าง / VAT (เฉลยมือ) ──");
  const v1 = (await PV.loadPrintView(tid, SYS, cn1)).view;
  const v2 = (await PV.loadPrintView(tid, SYS, cn2)).view;
  const v3 = (await PV.loadPrintView(tid, SYS, dn1)).view;
  const pick = (a: Any) => [a.originalValue, a.correctValue, a.difference, a.differenceVat, a.priorNotes];
  eq("P2.1", "CN1: เดิม 1,000,000 · ที่ถูก 813,084 · ผลต่าง 186,916 · VAT 13,084", pick(v1.adjust), [1_000_000, 813_084, 186_916, 13_084, 0]);
  eq("P2.2", "CN2: เดิม 813,084 (ก่อนหน้า 1) · ที่ถูก 713,084 · ผลต่าง 100,000 · VAT 7,000", pick(v2.adjust), [813_084, 713_084, 100_000, 7_000, 1]);
  eq("P2.3", "DN1: เดิม 713,084 (ก่อนหน้า 2) · ที่ถูก 763,084 · ผลต่าง 50,000 · VAT 3,500", pick(v3.adjust), [713_084, 763_084, 50_000, 3_500, 2]);

  // ═══ P3 HTML ═══
  console.log("\n── P3 ใบพิมพ์ (HTML) ──");
  const h1 = text(v1);
  const h3 = text(v3);
  chk("P3.1", "CN: \"ตามมาตรา 86/10\" ไม่มี 86/9 · เลขที่ใบกำกับภาษีขายเดิม (ชื่อชนิดจริงจาก DOC_LABEL) · มูลค่าเดิม 10,000.00 · ที่ถูก 8,130.84 · ผลต่าง 1,869.16 · VAT 130.84",
    h1.includes("ตามมาตรา 86/10") && !h1.includes("86/9") && h1.includes("เลขที่ใบกำกับภาษีขายเดิม") && h1.includes("฿10,000.00") && h1.includes("฿8,130.84") && h1.includes("฿1,869.16") && h1.includes("฿130.84"), "ครบ", h1.slice(0, 900));
  chk("P3.2", "DN: \"ตามมาตรา 86/9\" ไม่มี 86/10 · ภาษีที่เพิ่มขึ้น", h3.includes("ตามมาตรา 86/9") && !h3.includes("86/10") && h3.includes("ภาษีที่เพิ่มขึ้น"), "86/9", h3.slice(0, 600));
  chk("P3.3", "CN/DN ไม่พิมพ์ \"ครบกำหนด\" และไม่มีช่องทางการชำระเงิน (แม้มี dueDate)", !h1.includes("ครบกำหนด") && !h1.includes("ช่องทางการชำระเงิน") && !h3.includes("ครบกำหนด") && v1.channels.length === 0, "ไม่มี", [v1.dueDateText, v1.channels]);
  chk("P3.4", "รวมการปรับปรุงก่อนหน้า n ฉบับ (CN2)", text(v2).includes("รวมการปรับปรุงก่อนหน้า 1 ฉบับ"), "มี", null, "MAJOR");
  // ป้ายชนิดจริง: CN อ้างใบแจ้งหนี้
  const inv = await acc.createDocument({ tenantId: tid, systemId: SYS, docType: "INVOICE", contactId: cust.id, vatMode: "EXCLUDE", lines: [{ description: "ค่าเช่าเรือ", qty: 1, unitPrice: 500_000, discount: 0, vatRateBp: 700 }], createdById: owner.id });
  await issue(inv.id);
  const cnInv = await acc.createDocument({ tenantId: tid, systemId: SYS, docType: "CREDIT_NOTE", contactId: cust.id, vatMode: "EXCLUDE", sourceDocId: inv.id, lines: [{ description: "ลดราคา", qty: 1, unitPrice: 10_000, discount: 0, vatRateBp: 700 }], createdById: owner.id, adjustReasonCode: "OTHER", adjustReason: "อื่น ๆ — ลูกค้าได้ส่วนลดตามสัญญา" });
  await issue(cnInv.id);
  const hInv = text((await PV.loadPrintView(tid, SYS, cnInv.id)).view);
  chk("P3.5", "CN อ้างใบแจ้งหนี้: ป้าย \"เลขที่ใบแจ้งหนี้เดิม\" (ไม่ใช่ใบกำกับภาษีเดิม)", hInv.includes("เลขที่ใบแจ้งหนี้เดิม") && !hInv.includes("เลขที่ใบกำกับภาษีขายเดิม"), "ใบแจ้งหนี้", hInv.slice(0, 500));

  // ═══ P4 คำเตือน ═══
  console.log("\n── P4 คำเตือน (ไม่อ้างอิง · เหตุผลผิดกลุ่ม · ไม่มีเหตุผล) ──");
  const lonely = await acc.createDocument({ tenantId: tid, systemId: SYS, docType: "CREDIT_NOTE", contactId: cust.id, vatMode: "EXCLUDE", lines: [{ description: "คืนมัดจำ", qty: 1, unitPrice: 10_000, discount: 0, vatRateBp: 700 }], createdById: owner.id, adjustReasonCode: "CN_DEPOSIT_REFUND", adjustReason: "คืนมัดจำ" });
  const l0 = await acc.issueDocument(tid, SYS, lonely.id);
  eq("P4.1", "CN ไม่อ้างใบเดิม + ไม่มีเลขอ้างอิง → LEGAL_ACK_REQUIRED [ADJUST_NOTE_ORIGINAL_MISSING]", [l0.ok, l0.legal?.code, (l0.legal?.warnings ?? []).map((w: Any) => w.code)], [false, "LEGAL_ACK_REQUIRED", ["ADJUST_NOTE_ORIGINAL_MISSING"]]);
  const l1 = await acc.issueDocument(tid, SYS, lonely.id, { ack: { codes: ["ADJUST_NOTE_ORIGINAL_MISSING"], actorId: owner.id, via: "screen" } });
  const lAck = await prisma.auditLog.findFirst({ where: { tenantId: tid, action: "legal.warning.ack", targetId: lonely.id } });
  chk("P4.2", "ยืนยันแล้ว → ออกได้ (ไม่บล็อก) + บันทึกผู้ยืนยัน · ใบพิมพ์บอก \"ไม่ได้อ้างอิงเอกสารเดิมในระบบ\"", l1.ok === true && !!lAck && text((await PV.loadPrintView(tid, SYS, lonely.id)).view).includes("ไม่ได้อ้างอิงเอกสารเดิมในระบบ"), "ok", l1);
  const withRef = await acc.createDocument({ tenantId: tid, systemId: SYS, docType: "CREDIT_NOTE", contactId: cust.id, vatMode: "EXCLUDE", lines: [{ description: "คืนมัดจำ", qty: 1, unitPrice: 10_000, discount: 0, vatRateBp: 700 }], createdById: owner.id, adjustReasonCode: "CN_DEPOSIT_REFUND", adjustReason: "คืนมัดจำ" });
  await prisma.accountDocument.update({ where: { id: withRef.id }, data: { reference: "TX-OLD-0099" } }); // ช่อง "อ้างอิง" ของฟอร์ม (applyEditorExtras)
  const wr = await acc.issueDocument(tid, SYS, withRef.id);
  chk("P4.3", "positive control: ใส่เลขที่ใบเดิมในช่องอ้างอิง (ใบเดิมไม่อยู่ในระบบ) → ออกได้ ไม่มีคำเตือน", wr.ok === true, "ok", wr);
  const mism = await note("DEBIT_NOTE", 10_700, "CN_DEPOSIT_REFUND");
  const m0 = await acc.issueDocument(tid, SYS, mism);
  eq("P4.4", "ใบเพิ่มหนี้ใช้เหตุลดหนี้ → ADJUST_NOTE_REASON_GROUP_MISMATCH (ยืนยันได้)", (m0.legal?.warnings ?? []).map((w: Any) => w.code), ["ADJUST_NOTE_REASON_GROUP_MISMATCH"]);
  const other = await note("CREDIT_NOTE", 10_700, "OTHER", { adjustReason: "" });
  const o0 = await acc.issueDocument(tid, SYS, other);
  eq("P4.5", "\"อื่น ๆ\" ไม่มีข้อความ → ADJUST_NOTE_REASON_MISSING", (o0.legal?.warnings ?? []).map((w: Any) => w.code), ["ADJUST_NOTE_REASON_MISSING"]);

  // ═══ P5 หน้ารายละเอียด "ก่อนภาษี" ═══
  console.log("\n── P5 คอลัมน์ \"ก่อนภาษี\" ──");
  const det = await DD.getDocDetailData(tid, SYS, cn1);
  eq("P5.1", "ใบลดหนี้รวม VAT 2,000.00: คอลัมน์ก่อนภาษี = 1,869.16 (ไม่ใช่ 2,000.00)", det?.lines.map((l: Any) => [l.amount, l.netBeforeVat]), [[200_000, 186_916]]);

  // ═══ P6 ฝั่งซื้อ ═══
  console.log("\n── P6 รับใบลดหนี้ (ซื้อ): เลข/วันที่เอกสารผู้ขาย + รหัสเหตุผล ──");
  const vdate = new Date("2026-11-10T05:00:00Z");
  const cnr = await exp.createExpenseDoc({ tenantId: tid, systemId: SYS, docType: "CREDIT_NOTE_RECEIVED", contactId: vend.id, issueDate: new Date(), vatMode: "EXCLUDE", lines: [{ description: "ผู้ขายลดราคา", qty: 1, unitPrice: 10_000, discount: 0, vatRateBp: 700 }], createdById: owner.id, adjustReasonCode: "CN_SERVICE_DEFECT", adjustReason: "บริการบกพร่อง", vendorInvoiceDate: vdate });
  await prisma.accountDocument.update({ where: { id: cnr.id }, data: { reference: "VCN-2026-0007" } }); // ช่อง "อ้างอิง" = เลขที่เอกสารผู้ขาย (applyEditorExtras)
  const cnrRow = await prisma.accountDocument.findUnique({ where: { id: cnr.id }, select: { adjustReasonCode: true, reference: true, vendorInvoiceDate: true } });
  eq("P6.1", "CNR เก็บรหัสเหตุผล + เลขที่/วันที่เอกสารผู้ขาย", [cnrRow?.adjustReasonCode, cnrRow?.reference, cnrRow?.vendorInvoiceDate?.toISOString()], ["CN_SERVICE_DEFECT", "VCN-2026-0007", vdate.toISOString()]);
  const c0 = await exp.issueExpenseDoc(tid, SYS, cnr.id, { ack: { codes: W.LEGAL_WARNING_CODES.filter((c: string) => !c.startsWith("ADJUST_")), actorId: owner.id } });
  chk("P6.2", "CNR มีเลข/วันที่ผู้ขาย → ไม่มีคำเตือนไม่อ้างอิง", c0.ok === true || !(c0.legal?.warnings ?? []).some((w: Any) => w.code.startsWith("ADJUST_")), "ไม่มี ADJUST_*", c0);
  const cnr2 = await exp.createExpenseDoc({ tenantId: tid, systemId: SYS, docType: "CREDIT_NOTE_RECEIVED", contactId: vend.id, issueDate: new Date(), vatMode: "EXCLUDE", lines: [{ description: "ผู้ขายลดราคา", qty: 1, unitPrice: 10_000, discount: 0, vatRateBp: 700 }], createdById: owner.id, adjustReasonCode: "CN_SERVICE_DEFECT", adjustReason: "บริการบกพร่อง" });
  const c2 = await exp.issueExpenseDoc(tid, SYS, cnr2.id);
  chk("P6.3", "CNR ไม่มีเลข/วันที่ผู้ขาย → ADJUST_NOTE_ORIGINAL_MISSING (ข้อความฝั่งซื้อ)", (c2.legal?.warnings ?? []).some((w: Any) => w.code === "ADJUST_NOTE_ORIGINAL_MISSING" && /ผู้ขาย/.test(w.messageTh)), "เตือน", c2.legal?.warnings);
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? `${e.message}\n${e.stack?.split("\n").slice(0, 6).join("\n")}` : String(e));
} finally {
  if (tid && !KEEP) {
    try {
      await purgeTenant(tid);
    } catch (e) {
      console.log(`ลบร้านทดสอบไม่หมด: ${String(e)}`);
    }
  } else if (tid && KEEP) {
    const qcOwner = await prisma.user.findFirst({ where: { email: accEnv.QC.ownerEmail }, select: { id: true } });
    if (qcOwner) await prisma.membership.upsert({ where: { userId_tenantId: { userId: qcOwner.id, tenantId: tid } }, create: { userId: qcOwner.id, tenantId: tid, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() }, update: {} }).catch((e: unknown) => console.log(`membership: ${String(e)}`));
    console.log(`KEEP=1 → ร้าน ${tid} · ${JSON.stringify(await prisma.appSystem.findMany({ where: { tenantId: tid }, select: { id: true, type: true } }))}`);
  }
  await prisma.$disconnect();
}

const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC ACC T2.3 เนื้อหาใบลด/เพิ่มหนี้ =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.length > 0 ? 1 : 0);
