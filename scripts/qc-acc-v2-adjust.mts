// QC WO 1.6 — "wizard CN/DN/CNR/DNR/RPR" (เอกสารปรับปรุงหนี้ · DESIGN-SPEC-V2 §5.2 J)
// รัน (บังคับ DB QC branch):  QC_ENV_FILE=.env.qc pnpm tsx scripts/qc-acc-v2-adjust.mts
//
// 🔴 ความปลอดภัยข้อมูล: สคริปต์นี้ **สร้าง tenant ทิ้ง** แล้วลบทิ้งเมื่อจบ (ทุก query ผูก tenantId ของตัวเอง)
//    แต่ยังต้องชี้ DB QC เสมอ: ตั้ง QC_ENV_FILE=.env.qc — สคริปต์พิมพ์ไฟล์ env + โฮสต์ DB ให้ตรวจก่อนเริ่ม
//
// ทำไมไม่เรียก server action ตรง ๆ: `saveDraftAction`/`searchAdjustCandidatesAction` ห่อด้วย
// `loadAccountSystem()` (อ่านคุกกี้ผ่าน next/headers) ซึ่งไม่มีนอก request context ⇒ ที่นี่ตรวจ
// **ชั้นที่ action เรียกจริง** (buildAdjustCandidatePage/service/expense/product/gl) + ตรวจ "สายไฟ"
// ของ action แบบ static (AJ0) ว่ายังผ่านด่านสิทธิ์ครบตามลำดับ · ภาพจริงเป็นหน้าที่ scripts/visual-acc-v2.mts "1.6"
//
// ครอบคลุม (ดู ledger/wo-notes/1.6.md):
//   AJ0  สายไฟ static: CONVERT_ONLY_TYPES ปลด CN/DN/CNR/DNR · isAdjustType/adjustRefDocTypesFor ·
//        editor-actions.ts ไม่ import prisma · service/expense บังคับเหตุผล + cap เฉพาะเมื่อมีอ้างอิง ·
//        product.ts มี sourceDocId/ADJUST relation/returnableQtyForIssue · ป้ายไทยในไฟล์ wizard ใหม่
//   AJ1  candidate query: กรองตามผู้ติดต่อ/ชนิด/สถานะ (ตัดร่าง/ยกเลิก) · ประเภทเอกสารที่ไม่อนุญาต = ว่าง ·
//        ขอบเขตระบบ (เอกสารของระบบอื่นไม่ติดมา)
//   AJ2  CN เกินเพดานถูกปฏิเสธ (ข้อความไทย) · เท่าเพดานพอดี = ผ่าน
//   AJ3  เคสเฉลย: IV 124,500 ค้างชำระ 62,250 → CN 10,000 → JV Dr 4000 9,345.79 · Dr VAT 654.21 ·
//        Cr 1100 10,000 (สมดุล) · เพดานคงเหลือของ IV หลัง CN = 52,250
//   AJ4  DN เพิ่มยอดลูกหนี้ (Dr AR)
//   AJ5  CNR/DNR กระจก AR↔AP: CNR เกินเพดานถูกปฏิเสธ/เท่าเพดานผ่าน · JV ถูกทิศทาง
//   AJ6  เหตุผลบังคับ (CN และ CNR) — ไม่กรอก = ถูกปฏิเสธ
//   AJ7  ไม่อ้างอิงเอกสารเดิม (CN) ยังออกได้ถ้ามีเหตุผล (ไม่มีเพดาน)
//   AJ8  ตอนสร้างจาก wizard (มี sourceDocId) ต้องมี relation ADJUST เกิดขึ้นจริง (CN และ RPR)
//   AJ9  RPR: คืนเกินจำนวนที่เบิกถูกปฏิเสธ · คืนถูกต้อง = คืนสต็อกจริง + relation ADJUST
//   AJ10 สิทธิ์/ขอบเขต: ไม่มี account.doc.create ถูกปฏิเสธ (+ positive control) · ข้ามระบบ/ข้าม tenant แตะไม่ได้

process.loadEnvFile?.(process.env.QC_ENV_FILE ?? ".env");

import { readFileSync } from "node:fs";
import { join } from "node:path";

let passed = 0;
const findings: string[] = [];
function ok(name: string) {
  passed++;
  console.log("  ✅ " + name);
}
function bad(name: string, detail: string) {
  findings.push(name + " — " + detail);
  console.log("  ❌ " + name + " — " + detail);
}
function assert(name: string, cond: boolean, detail = "") {
  if (cond) ok(name);
  else bad(name, detail);
}
function eq(name: string, actual: unknown, expected: unknown) {
  assert(name, actual === expected, `ได้ ${JSON.stringify(actual)} · ควรได้ ${JSON.stringify(expected)}`);
}
const bt = (satang: number) => "฿" + (satang / 100).toLocaleString("th-TH", { minimumFractionDigits: 2 });
function eqAmt(name: string, actual: number, expected: number) {
  assert(name, actual === expected, `ได้ ${bt(actual)} · ควรได้ ${bt(expected)}`);
}

const ROOT = process.cwd();
const envFile = process.env.QC_ENV_FILE ?? ".env";
const dbHost = (process.env.DATABASE_URL ?? "").replace(/^.*@/, "").split("/")[0] || "(ไม่พบ DATABASE_URL)";
console.log("\n===== QC WO 1.6 · wizard เอกสารปรับปรุงหนี้ (CN/DN/CNR/DNR/RPR) =====");
console.log(`[env] ไฟล์ ${envFile} · DB ${dbHost}\n`);

// ═══════════════════════════ AJ0 — สายไฟ (static) ═══════════════════════════
console.log("AJ0 สายไฟ static:");
{
  const cfg = await import("@/lib/modules/account/doc-editor-config");
  assert(
    "AJ0.1 CONVERT_ONLY_TYPES ปลด CN/DN/CNR/DNR ออกแล้ว",
    !["CREDIT_NOTE", "DEBIT_NOTE", "CREDIT_NOTE_RECEIVED", "DEBIT_NOTE_RECEIVED"].some((t) =>
      (cfg.CONVERT_ONLY_TYPES as readonly string[]).includes(t),
    ),
  );
  assert(
    "AJ0.2 positive control: RECEIPT/TAX_INVOICE/PURCHASE_TAX_INVOICE ยังอยู่ใน CONVERT_ONLY_TYPES",
    ["RECEIPT", "TAX_INVOICE", "PURCHASE_TAX_INVOICE"].every((t) => (cfg.CONVERT_ONLY_TYPES as readonly string[]).includes(t)),
  );
  eq("AJ0.3 canCreateDirect(CREDIT_NOTE) = true (เข้า /new ตรงได้ผ่าน wizard)", cfg.canCreateDirect("CREDIT_NOTE"), true);
  for (const t of ["CREDIT_NOTE", "DEBIT_NOTE", "CREDIT_NOTE_RECEIVED", "DEBIT_NOTE_RECEIVED"] as const) {
    eq(`AJ0.4 isAdjustType(${t}) = true`, cfg.isAdjustType(t), true);
  }
  eq("AJ0.5 positive control: isAdjustType(INVOICE) = false", cfg.isAdjustType("INVOICE"), false);
  eq(
    "AJ0.6 adjustRefDocTypesFor(CREDIT_NOTE) = [IV, RE, TX]",
    cfg.adjustRefDocTypesFor("CREDIT_NOTE").join(","),
    "INVOICE,RECEIPT,TAX_INVOICE",
  );
  eq(
    "AJ0.7 adjustRefDocTypesFor(CREDIT_NOTE_RECEIVED) = [PUR, EXP]",
    cfg.adjustRefDocTypesFor("CREDIT_NOTE_RECEIVED").join(","),
    "PURCHASE,EXPENSE",
  );

  const editorActionsSrc = readFileSync(join(ROOT, "src/lib/modules/account/editor-actions.ts"), "utf8");
  assert("AJ0.8 editor-actions.ts ไม่ import prisma ตรง ๆ (fitness F5)", !/from\s+["']@\/lib\/core\/db["']/.test(editorActionsSrc));
  assert(
    "AJ0.9 searchAdjustCandidatesAction ผ่าน loadAccountSystem + assertAccountCan ก่อนเรียก buildAdjustCandidatePage",
    /searchAdjustCandidatesAction[\s\S]{0,300}loadAccountSystem[\s\S]{0,200}assertAccountCan[\s\S]{0,200}buildAdjustCandidatePage/.test(
      editorActionsSrc,
    ),
  );
  assert(
    "AJ0.10 saveDraftAction ตรวจ refId ว่าเป็นของ tenant/system + ชนิดที่อนุญาตก่อนตั้ง sourceDocId",
    /getDocRef\(tenantId, systemId, trim\(payload\.refId/.test(editorActionsSrc) &&
      /adjustRefDocTypesFor\(docType\)\.includes\(ref\.docType\)/.test(editorActionsSrc),
  );

  const serviceSrc = readFileSync(join(ROOT, "src/lib/modules/account/service.ts"), "utf8");
  assert("AJ0.11 service.ts ไม่บังคับ sourceDocId สำหรับ CN/DN อีกต่อไป", !/ต้องอ้างอิงเอกสารเดิม/.test(serviceSrc));
  assert("AJ0.12 service.ts บังคับเหตุผล CN/DN เสมอ", /ต้องระบุเหตุผลการออก/.test(serviceSrc));
  assert("AJ0.13 service.ts เช็ค cap เฉพาะเมื่อมี sourceDocId", /doc\.docType === "CREDIT_NOTE" && doc\.sourceDocId/.test(serviceSrc));
  assert("AJ0.14 createDocument สร้าง relation ADJUST เมื่อมี sourceDocId", /RELATION_FOR\[input\.docType\] === "ADJUST"/.test(serviceSrc));

  const expenseSrc = readFileSync(join(ROOT, "src/lib/modules/account/expense.ts"), "utf8");
  assert("AJ0.15 expense.ts บังคับเหตุผล CNR/DNR", /CREDIT_NOTE_RECEIVED.*DEBIT_NOTE_RECEIVED[\s\S]{0,200}ต้องระบุเหตุผลการออก/.test(expenseSrc));
  assert("AJ0.16 expense.ts มี creditAvailableExpense (เพดาน CNR)", /export async function creditAvailableExpense/.test(expenseSrc));

  const productSrc = readFileSync(join(ROOT, "src/lib/modules/account/product.ts"), "utf8");
  assert("AJ0.17 product.ts createGoodsMovement รับ sourceDocId", /sourceDocId\?: string \| null;/.test(productSrc));
  assert("AJ0.18 product.ts มี returnableQtyForIssue (เพดาน RPR ต่อบรรทัด)", /export async function returnableQtyForIssue/.test(productSrc));
  assert("AJ0.19 product.ts สร้าง relation ADJUST ให้ RPR", /docType === "GOODS_ISSUE_RETURN" && input\.sourceDocId/.test(productSrc));

  const wizardSrc = readFileSync(join(ROOT, "src/components/account-v2/AdjustWizardStep1.tsx"), "utf8");
  for (const label of ["เลือกเอกสารอ้างอิง", "อ้างอิงจากเอกสารเดิม", "ไม่อ้างอิง", "ค้างชำระ", "ถัดไป"]) {
    assert(`AJ0.20 AdjustWizardStep1.tsx มีป้ายไทย "${label}"`, wizardSrc.includes(label));
  }
  const goodsReturnSrc = readFileSync(join(ROOT, "src/lib/modules/account/GoodsReturnEditor.tsx"), "utf8");
  for (const label of ["ใบส่งคืนเบิกสินค้า", "เหตุผล", "จำนวนที่คืน"]) {
    assert(`AJ0.21 GoodsReturnEditor.tsx มีป้ายไทย "${label}"`, goodsReturnSrc.includes(label));
  }
  const editorV2Src = readFileSync(join(ROOT, "src/components/account-v2/DocEditorV2.tsx"), "utf8");
  for (const label of ["เหตุผลการปรับปรุงหนี้", "ยอดคงเหลือของเอกสารอ้างอิง", "ลดได้ไม่เกินนี้"]) {
    assert(`AJ0.22 DocEditorV2.tsx มีป้ายไทย "${label}"`, editorV2Src.includes(label));
  }
  // AJ0.23–25 (Fable QC ภาพจริง 1.6 รอบ 2 — กันบั๊กเดิมย้อนกลับ):
  assert("AJ0.23 cap-line ไม่มี ฿ ซ้อนสอง (MoneyText ใส่ ฿ ให้แล้ว)", !/ยอดคงเหลือของเอกสารอ้างอิง ฿</.test(editorV2Src));
  assert("AJ0.24 ปุ่มอนุมัติถูก disabled เมื่อเกินเพดาน (capExceeded)", /disabled=\{pending \|\| saving \|\| capExceeded\}/.test(editorV2Src));
  assert("AJ0.25 ปุ่มบันทึกร่างไม่ถูกผูกกับ capExceeded (ยังบันทึกร่างเกินเพดานได้)", !/btn-save-draft[\s\S]{0,200}capExceeded/.test(editorV2Src));
  assert("AJ0.26 ผู้ติดต่อถูกล็อกเป็น readOnly เมื่ออยู่ในโหมด adjust ที่มีเอกสารอ้างอิง", /props\.adjustMode && props\.refDoc/.test(editorV2Src) && /readOnly value=\{value\.contactLabel/.test(editorV2Src));
  const wizardStep1Src2 = readFileSync(join(ROOT, "src/components/account-v2/AdjustWizardStep1.tsx"), "utf8");
  assert("AJ0.27 ตารางขั้น ① มีทั้งเดสก์ท็อป (md:block) และการ์ดมือถือ (md:hidden) แยกกัน", /hidden overflow-x-auto md:block/.test(wizardStep1Src2) && /flex flex-col gap-2 md:hidden/.test(wizardStep1Src2));
  // AJ0.28 (Fable QC ภาพจริง 1.6 รอบ 3): การ์ดมือถือต้องมี testid คนละชื่อกับแถวตารางเดสก์ท็อป (`ref-card-` vs `ref-row-`)
  // ไม่งั้น querySelector(`[data-testid="ref-row-…"]`) จะไปเจอ <tr> ที่ซ่อนอยู่ (`hidden md:block`) ก่อนเสมอ (DOM order)
  // แล้วอ่าน/คลิกผิดตัว — บั๊กที่ Fable เจอจากภาพจริงมือถือ (data-selected ไม่ขึ้น + "ถัดไป" ไม่เปิด)
  {
    const rowTestidCount = (wizardStep1Src2.match(/data-testid=\{`ref-row-\$\{r\.docNo/g) ?? []).length;
    const cardTestidCount = (wizardStep1Src2.match(/data-testid=\{`ref-card-\$\{r\.docNo/g) ?? []).length;
    assert(
      "AJ0.28 การ์ดมือถือใช้ testid ref-card-<docNo> แยกจาก ref-row-<docNo> ของตาราง (คนละชื่อ อย่างละ 1 จุด)",
      rowTestidCount === 1 && cardTestidCount === 1,
      `พบ ref-row- ${rowTestidCount} จุด · ref-card- ${cardTestidCount} จุด`,
    );
  }
}

// ═══════════════════════════ AJ1–AJ10 — ของจริงบน DB ═══════════════════════════
const { prisma } = await import("@/lib/core/db");
const sysMod = await import("@/lib/modules/system/service");
const acc = await import("@/lib/modules/account/service");
const exp = await import("@/lib/modules/account/expense");
const gl = await import("@/lib/modules/account/gl");
const fin = await import("@/lib/modules/account/finance");
const pay = await import("@/lib/modules/account/payment");
const prod = await import("@/lib/modules/account/product");
const { assertAccountCan } = await import("@/lib/modules/account/access");
const { buildAdjustCandidatePage } = await import("@/lib/modules/account/editor-actions");
const cfg = await import("@/lib/modules/account/doc-editor-config");

const tag = "QCACC16-" + Date.now();
let tenantId = "";
const userIds: string[] = [];

type Entry = { id: string; lines: { debit: number; credit: number; accountId: string; account: { code: string } }[] };
const entriesOf = (systemId: string, refId: string) =>
  prisma.accountJournalEntry.findMany({
    where: { systemId, refType: "AccountDocument", refId },
    include: { lines: { include: { account: { select: { code: true } } } } },
  }) as Promise<Entry[]>;
const drCode = (es: Entry[], code: string) =>
  es.flatMap((e) => e.lines).filter((l) => l.account.code === code).reduce((s, l) => s + l.debit, 0);
const crCode = (es: Entry[], code: string) =>
  es.flatMap((e) => e.lines).filter((l) => l.account.code === code).reduce((s, l) => s + l.credit, 0);
const balanced = (es: Entry[]) =>
  es.length > 0 && es.every((e) => e.lines.reduce((s, l) => s + l.debit, 0) === e.lines.reduce((s, l) => s + l.credit, 0));
const iso = (d: Date) => d.toISOString().slice(0, 10);
const TODAY = iso(new Date());

/**
 * หา unitPrice (บรรทัดเดียว EXCL_VAT 7%) ที่ทำให้ grandTotal ตรงเป๊ะตามที่ต้องการ (satang)
 * — grand = X + round(X*0.07) ไม่ใช่ฟังก์ชันเชิงเส้นตรง ๆ (rounding ต่อบรรทัด) จึงค้นหารอบ ๆ จุดประมาณ
 */
function unitPriceForGrandExclVat7(grandSatang: number): number {
  const approx = Math.round(grandSatang / 1.07);
  for (let delta = -5; delta <= 5; delta++) {
    const cand = approx + delta;
    if (cand > 0 && cand + Math.round(cand * 0.07) === grandSatang) return cand;
  }
  throw new Error(`หา unitPrice ที่ให้ grandTotal ${grandSatang} ไม่เจอ (ลอง ±5 satang รอบ ${approx})`);
}

try {
  const t = await prisma.tenant.create({ data: { name: tag, slug: tag.toLowerCase() } });
  tenantId = t.id;
  const owner = await prisma.user.create({ data: { email: tag.toLowerCase() + "-owner@qc.local", name: "QC เจ้าของ" } });
  const staff = await prisma.user.create({ data: { email: tag.toLowerCase() + "-staff@qc.local", name: "QC พนักงาน" } });
  userIds.push(owner.id, staff.id);
  await prisma.membership.create({ data: { userId: owner.id, tenantId, role: "OWNER", unitAccess: ["*"] } });
  const mStaff = await prisma.membership.create({
    data: { userId: staff.id, tenantId, role: "STAFF", unitAccess: ["*"], permissions: { "account.doc.view": true } },
    include: { tenant: true },
  });

  const s1 = await sysMod.createSystem(tenantId, "ACCOUNT", "บัญชี " + tag);
  const s2 = await sysMod.createSystem(tenantId, "ACCOUNT", "บัญชีสาขา 2 " + tag);
  const systemId = s1.id;
  const otherSystemId = s2.id;
  console.log(`\n[seed] tenant ${tenantId} · system ${systemId} · ระบบที่สอง ${otherSystemId}\n`);

  await acc.saveSettings(tenantId, systemId, {
    orgName: "ร้านดำน้ำ QC 1.6",
    taxId: "0105561000000",
    vatRegistered: true,
    vatRateBp: 700,
    taxPointBasis: "ON_ISSUE",
  });
  await acc.saveSettings(tenantId, otherSystemId, { orgName: "สาขา 2", vatRegistered: true, vatRateBp: 700 });
  await gl.ensureAccounting({ tenantId, systemId });
  await gl.ensureAccounting({ tenantId, systemId: otherSystemId });

  const bank = await fin.createFinanceAccount({ tenantId, systemId, type: "BANK", name: "ออมทรัพย์", bankName: "กสิกรไทย" });
  if (!bank.ok) throw new Error("สร้างช่องทางการเงินไม่สำเร็จ");

  const customerA = await acc.createContact({ tenantId, systemId, kind: "CUSTOMER", legalType: "COMPANY", name: "โรงแรมสิมิลันวิว", taxId: "0105561999991", branchCode: "00000" });
  const customerB = await acc.createContact({ tenantId, systemId, kind: "CUSTOMER", legalType: "COMPANY", name: "บริษัท ทัวร์ทะเลใต้ จำกัด", taxId: "0105561999992", branchCode: "00000" });
  const vendorA = await acc.createContact({ tenantId, systemId, kind: "VENDOR", legalType: "COMPANY", name: "บริษัท ถังอากาศไทย จำกัด", taxId: "0105561888881", branchCode: "00000" });

  const mkInvoiceRaw = async (contactId: string, lines: { description: string; qty: number; unitPrice: number; discount: number; vatRateBp: number }[]) => {
    const d = await acc.createDocument({ tenantId, systemId, docType: "INVOICE", contactId, issueDate: new Date(), vatMode: "EXCLUDE", vatTiming: "ON_ISSUE", lines, createdById: owner.id });
    const r = await acc.issueDocument(tenantId, systemId, d.id);
    if (!r.ok) throw new Error("ออกใบแจ้งหนี้ไม่สำเร็จ: " + r.reason);
    return d.id;
  };
  const mkPurchaseRaw = async (contactId: string, lines: { description: string; qty: number; unitPrice: number; discount: number; vatRateBp: number }[]) => {
    const d = await exp.createExpenseDoc({ tenantId, systemId, docType: "PURCHASE", contactId, issueDate: new Date(), vatMode: "EXCLUDE", vatPurchaseMode: "CLAIM", lines, createdById: owner.id });
    const r = await exp.issueExpenseDoc(tenantId, systemId, d.id);
    if (!r.ok) throw new Error("ออกบันทึกซื้อไม่สำเร็จ: " + r.reason);
    return d.id;
  };
  const mkCnDraft = async (
    docType: "CREDIT_NOTE" | "DEBIT_NOTE",
    contactId: string,
    sourceDocId: string | null,
    adjustReason: string | null,
    /** grandTotal (satang) ที่ต้องการให้ CN/DN ใบนี้ออกมาตรงเป๊ะ — แปลงเป็น unitPrice ก่อน VAT ให้เอง */
    targetGrandSatang: number,
  ) => {
    const line = { description: "ปรับปรุงยอด", qty: 1, unitPrice: unitPriceForGrandExclVat7(targetGrandSatang), discount: 0, vatRateBp: 700 };
    return acc.createDocument({
      tenantId, systemId, docType, contactId, issueDate: new Date(), vatMode: "EXCLUDE", vatTiming: "ON_ISSUE",
      lines: [line], createdById: owner.id, sourceDocId, adjustReason,
    });
  };

  // ═════════ AJ1 — candidate query ═════════
  console.log("AJ1 candidate query (buildAdjustCandidatePage):");
  const ivDraft = await acc.createDocument({ tenantId, systemId, docType: "INVOICE", contactId: customerA.id, issueDate: new Date(), vatMode: "EXCLUDE", vatTiming: "ON_ISSUE", lines: [{ description: "ร่างยังไม่ออก", qty: 1, unitPrice: 100_000, discount: 0, vatRateBp: 700 }], createdById: owner.id });
  const ivIssuedA = await mkInvoiceRaw(customerA.id, [{ description: "ทริป A", qty: 1, unitPrice: 500_000, discount: 0, vatRateBp: 700 }]);
  const ivIssuedB = await mkInvoiceRaw(customerB.id, [{ description: "ทริป B", qty: 1, unitPrice: 300_000, discount: 0, vatRateBp: 700 }]);
  const ivVoidCandidate = await mkInvoiceRaw(customerA.id, [{ description: "จะยกเลิก", qty: 1, unitPrice: 50_000, discount: 0, vatRateBp: 700 }]);
  await prisma.accountDocument.update({ where: { id: ivVoidCandidate }, data: { status: "CANCELLED" } });

  const pageA = await buildAdjustCandidatePage(tenantId, systemId, "CREDIT_NOTE", "INVOICE", { contactId: customerA.id });
  const idsA = pageA.rows.map((r) => r.id);
  assert("AJ1.1 มีใบแจ้งหนี้ที่ออกแล้วของลูกค้า A", idsA.includes(ivIssuedA));
  assert("AJ1.2 ตัดร่างออก (ยังไม่มีผลทางบัญชี)", !idsA.includes(ivDraft.id));
  assert("AJ1.3 ตัดใบที่ยกเลิกแล้วออก", !idsA.includes(ivVoidCandidate));
  assert("AJ1.4 ไม่ปนใบของลูกค้า B (ตัวกรองผู้ติดต่อทำงาน)", !idsA.includes(ivIssuedB));

  const pageBadType = await buildAdjustCandidatePage(tenantId, systemId, "CREDIT_NOTE", "PURCHASE", {});
  eq("AJ1.5 ประเภทเอกสารอ้างอิงที่ไม่อนุญาต (PURCHASE สำหรับ CN) = รายการว่าง", pageBadType.rows.length, 0);

  const ivOtherSystem = await acc.createDocument({ tenantId, systemId: otherSystemId, docType: "INVOICE", contactId: null, issueDate: new Date(), vatMode: "EXCLUDE", vatTiming: "ON_ISSUE", lines: [{ description: "ระบบอื่น", qty: 1, unitPrice: 100_000, discount: 0, vatRateBp: 700 }], createdById: owner.id });
  await acc.issueDocument(tenantId, otherSystemId, ivOtherSystem.id);
  const pageThisSystem = await buildAdjustCandidatePage(tenantId, systemId, "CREDIT_NOTE", "INVOICE", {});
  assert("AJ1.6 ขอบเขตระบบ: เอกสารของระบบอื่นไม่ติดมาในระบบนี้", !pageThisSystem.rows.some((r) => r.id === ivOtherSystem.id));

  // AJ1.7–8 (Fable QC ภาพจริง 1.6): ผู้ติดต่อของฟอร์มขั้น ② ต้องพรีฟิลจากเอกสารอ้างอิงเสมอ (บั๊กเดิม: contactId
  // เซ็ตแล้วแต่ contactLabel ว่าง เพราะ DocEditorPage คำนวณ 2 ค่าแยกกันคนละสูตร) — ทดสอบฟังก์ชันบริสุทธิ์ตรง ๆ
  // ด้วยข้อมูลจริงจาก getDocument() (โครงเดียวกับที่ DocEditorPage ใช้จริง ไม่ใช่ object ปลอม)
  const refDocForSeed = await acc.getDocument(tenantId, systemId, ivIssuedA);
  if (!refDocForSeed) throw new Error("AJ1.7: ไม่พบเอกสารอ้างอิงสำหรับทดสอบ seed ผู้ติดต่อ");
  const seedNew = cfg.adjustSeedContact(null, refDocForSeed);
  eq("AJ1.7 สร้างใหม่จาก wizard (?ref=): contactId ดึงจากเอกสารอ้างอิง", seedNew.contactId, refDocForSeed.contactId);
  assert(
    "AJ1.8 สร้างใหม่จาก wizard (?ref=): contactLabel ไม่ว่าง (บั๊กเดิม: contactId ถูกแต่ label ว่าง)",
    seedNew.contactLabel.length > 0 && seedNew.contactLabel === refDocForSeed.contact?.name,
    `ได้ "${seedNew.contactLabel}"`,
  );
  const seedExisting = cfg.adjustSeedContact(refDocForSeed, null);
  eq("AJ1.9 positive control: เปิดร่างเดิมมาแก้ (docId มีค่า) ใช้ contactId ของร่างตัวเอง ไม่ใช่ refDoc", seedExisting.contactId, refDocForSeed.contactId);

  // ═════════ AJ2 — CN cap พื้นฐาน ═════════
  console.log("\nAJ2 CN เกินเพดาน/เท่าเพดานพอดี:");
  const ivCap = await mkInvoiceRaw(customerB.id, [{ description: "งานเพดาน", qty: 1, unitPrice: 500_000, discount: 0, vatRateBp: 700 }]);
  const ivCapDoc = await prisma.accountDocument.findFirstOrThrow({ where: { id: ivCap } });
  const capOver = await mkCnDraft("CREDIT_NOTE", customerB.id, ivCap, "สินค้าชำรุด/คืนสินค้า", ivCapDoc.grandTotal + 100);
  const rOver = await acc.issueDocument(tenantId, systemId, capOver.id);
  assert("AJ2.1 CN เกินเพดานถูกปฏิเสธ", !rOver.ok, rOver.ok ? "ผ่านไปได้" : "");
  assert("AJ2.2 ข้อความปฏิเสธเป็นภาษาไทยและอ้างถึงยอดคงเหลือ", !rOver.ok && /เกินยอดคงเหลือ/.test(rOver.reason), !rOver.ok ? rOver.reason : "");
  const capExact = await mkCnDraft("CREDIT_NOTE", customerB.id, ivCap, "คำนวณราคาผิด", ivCapDoc.grandTotal);
  const rExact = await acc.issueDocument(tenantId, systemId, capExact.id);
  assert("AJ2.3 CN เท่าเพดานพอดีผ่าน", rExact.ok, rExact.ok ? "" : rExact.reason);

  // ═════════ AJ3 — เคสเฉลย IV 124,500 → CN 10,000 ═════════
  console.log("\nAJ3 เคสเฉลย IV 124,500 (ค้างชำระ 62,250) → CN 10,000:");
  const ivBig = await mkInvoiceRaw(customerA.id, [{ description: "แพ็กเกจดำน้ำ 5 วัน", qty: 1, unitPrice: 11_635_514, discount: 0, vatRateBp: 700 }]);
  const ivBigDoc0 = await prisma.accountDocument.findFirstOrThrow({ where: { id: ivBig } });
  eqAmt("AJ3.1 IV ยอดสุทธิ = 124,500.00", ivBigDoc0.grandTotal, 12_450_000);
  const half = await pay.recordPayments(
    tenantId, systemId, ivBig,
    [{ paidAt: TODAY, financeAccountId: bank.id, amountSatang: 6_225_000, note: "งวดแรก", whtIncomeType: null, whtRateBp: null, whtAmountSatang: 0, feeSatang: 0, cheque: null }],
    { userId: owner.id, keyBase: "qc16-half" },
  );
  assert("AJ3.2 บันทึกรับชำระบางส่วนสำเร็จ", half.ok, half.ok ? "" : half.reason);
  eqAmt("AJ3.3 ค้างชำระหลังชำระครึ่งหนึ่ง = 62,250.00", half.ok ? half.outstanding : -1, 6_225_000);

  const capBeforeCn = await acc.creditAvailableNow(systemId, ivBig);
  eqAmt("AJ3.4 เพดาน CN ก่อนออก = ค้างชำระ = 62,250.00", capBeforeCn, 6_225_000);

  const cn10k = await mkCnDraft("CREDIT_NOTE", customerA.id, ivBig, "ส่วนลดเพิ่ม", 1_000_000);
  const cn10kDoc = await prisma.accountDocument.findFirstOrThrow({ where: { id: cn10k.id } });
  eqAmt("AJ3.5 CN ยอด = 10,000.00 พอดี", cn10kDoc.grandTotal, 1_000_000);
  const cnIssue = await acc.issueDocument(tenantId, systemId, cn10k.id);
  assert("AJ3.6 อนุมัติ CN สำเร็จ", cnIssue.ok, cnIssue.ok ? "" : cnIssue.reason);

  const cnEntries = await entriesOf(systemId, cn10k.id);
  assert("AJ3.7 JV ของ CN สมดุล", balanced(cnEntries));
  eqAmt("AJ3.8 Dr 4000 (รายได้) = 9,345.79", drCode(cnEntries, "4000"), 934_579);
  const vatDrCn = drCode(cnEntries, "2205") + drCode(cnEntries, "2200");
  eqAmt("AJ3.9 Dr VAT (2205/2200) = 654.21", vatDrCn, 65_421);
  eqAmt("AJ3.10 Cr 1100 (ลูกหนี้) = 10,000.00", crCode(cnEntries, "1100"), 1_000_000);

  const capAfterCn = await acc.creditAvailableNow(systemId, ivBig);
  eqAmt("AJ3.11 เพดานคงเหลือของ IV หลังออก CN = 52,250.00", capAfterCn, 5_225_000);

  const relCn = await prisma.accountDocumentRelation.findFirst({ where: { systemId, fromId: ivBig, toId: cn10k.id } });
  assert("AJ3.12 relation ADJUST เกิดขึ้นจริง (IV → CN)", relCn?.type === "ADJUST");

  // ═════════ AJ4 — DN เพิ่มยอดลูกหนี้ ═════════
  console.log("\nAJ4 DN เพิ่มยอดลูกหนี้:");
  const ivForDn = await mkInvoiceRaw(customerA.id, [{ description: "งานเพิ่มเติม", qty: 1, unitPrice: 200_000, discount: 0, vatRateBp: 700 }]);
  const dn = await mkCnDraft("DEBIT_NOTE", customerA.id, ivForDn, "คำนวณราคาผิด", 500_000);
  const dnDoc = await prisma.accountDocument.findFirstOrThrow({ where: { id: dn.id } });
  const dnIssue = await acc.issueDocument(tenantId, systemId, dn.id);
  assert("AJ4.1 อนุมัติ DN สำเร็จ (ไม่มีเพดาน)", dnIssue.ok, dnIssue.ok ? "" : dnIssue.reason);
  const dnEntries = await entriesOf(systemId, dn.id);
  assert("AJ4.2 JV ของ DN สมดุล", balanced(dnEntries));
  eqAmt("AJ4.3 Dr 1100 (ลูกหนี้เพิ่มขึ้น) = ยอด DN เต็มใบ", drCode(dnEntries, "1100"), dnDoc.grandTotal);

  // ═════════ AJ5 — CNR/DNR กระจก AR↔AP ═════════
  console.log("\nAJ5 CNR/DNR (ฝั่งซื้อ กระจก CN/DN):");
  const purCap = await mkPurchaseRaw(vendorA.id, [{ description: "ถังอากาศ 10 ใบ", qty: 1, unitPrice: 500_000, discount: 0, vatRateBp: 700 }]);
  const purCapDoc = await prisma.accountDocument.findFirstOrThrow({ where: { id: purCap } });
  const mkCnrDraft = async (docType: "CREDIT_NOTE_RECEIVED" | "DEBIT_NOTE_RECEIVED", sourceDocId: string | null, adjustReason: string | null, targetGrandSatang: number) =>
    exp.createExpenseDoc({
      tenantId, systemId, docType, contactId: vendorA.id, issueDate: new Date(), vatMode: "EXCLUDE", vatPurchaseMode: "CLAIM",
      lines: [{ description: "ปรับปรุงยอดซื้อ", qty: 1, unitPrice: unitPriceForGrandExclVat7(targetGrandSatang), discount: 0, vatRateBp: 700 }], createdById: owner.id, sourceDocId, adjustReason,
    });
  const cnrOver = await mkCnrDraft("CREDIT_NOTE_RECEIVED", purCap, "สินค้าชำรุด/คืนสินค้า", purCapDoc.grandTotal + 100);
  const cnrOverIssue = await exp.issueExpenseDoc(tenantId, systemId, cnrOver.id);
  assert("AJ5.1 CNR เกินเพดานถูกปฏิเสธ", !cnrOverIssue.ok, cnrOverIssue.ok ? "ผ่านไปได้" : "");
  assert("AJ5.2 ข้อความปฏิเสธเป็นภาษาไทย", !cnrOverIssue.ok && /เกินยอดคงเหลือ/.test(cnrOverIssue.reason));
  const cnrExact = await mkCnrDraft("CREDIT_NOTE_RECEIVED", purCap, "คำนวณราคาผิด", purCapDoc.grandTotal);
  const cnrExactIssue = await exp.issueExpenseDoc(tenantId, systemId, cnrExact.id);
  assert("AJ5.3 CNR เท่าเพดานพอดีผ่าน", cnrExactIssue.ok, cnrExactIssue.ok ? "" : cnrExactIssue.reason);
  const cnrEntries = await entriesOf(systemId, cnrExact.id);
  assert("AJ5.4 JV ของ CNR สมดุล", balanced(cnrEntries));
  eqAmt("AJ5.5 Dr 2100 (เจ้าหนี้ลดลง) = ยอด CNR เต็มใบ", drCode(cnrEntries, "2100"), purCapDoc.grandTotal);

  const purForDnr = await mkPurchaseRaw(vendorA.id, [{ description: "ถังอากาศเพิ่ม", qty: 1, unitPrice: 100_000, discount: 0, vatRateBp: 700 }]);
  const dnr = await mkCnrDraft("DEBIT_NOTE_RECEIVED", purForDnr, "ส่วนลดเพิ่ม", 300_000);
  const dnrDoc = await prisma.accountDocument.findFirstOrThrow({ where: { id: dnr.id } });
  const dnrIssue = await exp.issueExpenseDoc(tenantId, systemId, dnr.id);
  assert("AJ5.6 DNR ออกได้ (ไม่มีเพดาน)", dnrIssue.ok, dnrIssue.ok ? "" : dnrIssue.reason);
  const dnrEntries = await entriesOf(systemId, dnr.id);
  assert("AJ5.7 JV ของ DNR สมดุล", balanced(dnrEntries));
  eqAmt("AJ5.8 Cr 2100 (เจ้าหนี้เพิ่มขึ้น) = ยอด DNR เต็มใบ", crCode(dnrEntries, "2100"), dnrDoc.grandTotal);

  // ═════════ AJ6 — เหตุผลบังคับ ═════════
  console.log("\nAJ6 เหตุผลบังคับ:");
  const ivForReason = await mkInvoiceRaw(customerB.id, [{ description: "ทดสอบเหตุผล", qty: 1, unitPrice: 50_000, discount: 0, vatRateBp: 700 }]);
  const cnNoReason = await mkCnDraft("CREDIT_NOTE", customerB.id, ivForReason, null, 10_000);
  const cnNoReasonIssue = await acc.issueDocument(tenantId, systemId, cnNoReason.id);
  assert("AJ6.1 CN ไม่กรอกเหตุผลถูกปฏิเสธ", !cnNoReasonIssue.ok, cnNoReasonIssue.ok ? "ผ่านไปได้" : "");
  assert("AJ6.2 ข้อความปฏิเสธพูดถึงเหตุผล", !cnNoReasonIssue.ok && /เหตุผล/.test(cnNoReasonIssue.reason));
  const purForReason = await mkPurchaseRaw(vendorA.id, [{ description: "ทดสอบเหตุผล", qty: 1, unitPrice: 50_000, discount: 0, vatRateBp: 700 }]);
  const cnrNoReason = await mkCnrDraft("CREDIT_NOTE_RECEIVED", purForReason, null, 10_000);
  const cnrNoReasonIssue = await exp.issueExpenseDoc(tenantId, systemId, cnrNoReason.id);
  assert("AJ6.3 CNR ไม่กรอกเหตุผลถูกปฏิเสธ", !cnrNoReasonIssue.ok, cnrNoReasonIssue.ok ? "ผ่านไปได้" : "");

  // ═════════ AJ7 — ไม่อ้างอิงเอกสารเดิม ═════════
  console.log("\nAJ7 CN ไม่อ้างอิงเอกสารเดิม:");
  const cnNoRef = await mkCnDraft("CREDIT_NOTE", customerB.id, null, "อื่น ๆ — ปรับยอดตามข้อตกลงใหม่", 500_000);
  const cnNoRefIssue = await acc.issueDocument(tenantId, systemId, cnNoRef.id);
  assert("AJ7.1 CN ไม่อ้างอิงเอกสารเดิม + มีเหตุผล = ออกได้ (ไม่มีเพดาน)", cnNoRefIssue.ok, cnNoRefIssue.ok ? "" : cnNoRefIssue.reason);
  const cnNoRefDoc = await prisma.accountDocument.findFirstOrThrow({ where: { id: cnNoRef.id } });
  eq("AJ7.2 sourceDocId ยังคงว่าง", cnNoRefDoc.sourceDocId, null);

  // ═════════ AJ8 — permission/tenant isolation (positive control รวม) ═════════
  console.log("\nAJ8 สิทธิ์/ขอบเขต:");
  const authStaff = { user: { id: staff.id }, active: mStaff } as never;
  let denied = false;
  try {
    assertAccountCan(authStaff, "account.doc.create");
  } catch {
    denied = true;
  }
  assert("AJ8.1 พนักงานที่ไม่มีสิทธิ์ 'สร้างเอกสาร' ถูกปฏิเสธ", denied);
  let viewOk = true;
  try {
    assertAccountCan(authStaff, "account.doc.view");
  } catch {
    viewOk = false;
  }
  assert("AJ8.2 positive control: สิทธิ์ที่มีจริงต้องผ่าน", viewOk);
  eq("AJ8.3 getDocRef ข้ามระบบอ่านไม่เห็น (ref ของระบบอื่น)", await acc.getDocRef(tenantId, systemId, ivOtherSystem.id), null);
  eq("AJ8.4 getDocRef ข้าม tenant อ่านไม่เห็น", await acc.getDocRef("tenant-ไม่มีจริง", systemId, ivBig), null);

  // ═════════ AJ9 — RPR (ใบส่งคืนเบิกสินค้า) ═════════
  console.log("\nAJ9 RPR อ้างอิง PRR:");
  const product = await prod.createProduct(tenantId, systemId, { sku: "TANK-01", name: "ถังอากาศ 12L", nameEn: null, type: "GOODS", unitId: null, salePrice: null, buyPrice: null, vatRateBp: 700, incomeAccountId: null, expenseAccountId: null, imageUrl: null });
  if (!product.ok) throw new Error("สร้างสินค้าไม่สำเร็จ: " + product.reason);
  const prodBefore = await prisma.accountProduct.findFirstOrThrow({ where: { id: product.id } });
  const prr = await prod.createGoodsMovement({ tenantId, systemId, docType: "GOODS_ISSUE", contactId: customerA.id, note: "เบิกใช้งานทริป", lines: [{ productId: product.id, qty: 10 }], createdById: owner.id, allowNegative: true });
  assert("AJ9.1 สร้างใบเบิก (PRR) สำเร็จ", prr.ok, prr.ok ? "" : prr.reason);
  const prodAfterIssue = await prisma.accountProduct.findFirstOrThrow({ where: { id: product.id } });
  eq("AJ9.2 สต็อกลดลง 10 หลังเบิก", Number(prodAfterIssue.qtyOnHand), Number(prodBefore.qtyOnHand) - 10);

  if (prr.ok) {
    const remainBefore = await prod.returnableQtyForIssueNow(tenantId, systemId, prr.id);
    eq("AJ9.3 จำนวนที่ยังคืนได้ก่อนคืน = 10", remainBefore.get(product.id), 10);

    const overReturn = await prod.createGoodsMovement({ tenantId, systemId, docType: "GOODS_ISSUE_RETURN", contactId: customerA.id, sourceDocId: prr.id, adjustReason: "สินค้าชำรุด/คืนสินค้า", lines: [{ productId: product.id, qty: 11 }], createdById: owner.id });
    assert("AJ9.4 คืนเกินจำนวนที่เบิกไว้ถูกปฏิเสธ", !overReturn.ok, overReturn.ok ? "ผ่านไปได้" : "");
    assert("AJ9.5 ข้อความปฏิเสธเป็นภาษาไทยและพูดถึง 'เกิน'", !overReturn.ok && /เกิน/.test(overReturn.reason));

    const goodReturn = await prod.createGoodsMovement({ tenantId, systemId, docType: "GOODS_ISSUE_RETURN", contactId: customerA.id, sourceDocId: prr.id, adjustReason: "สินค้าชำรุด/คืนสินค้า", lines: [{ productId: product.id, qty: 4 }], createdById: owner.id });
    assert("AJ9.6 คืนจำนวนที่ถูกต้องสำเร็จ", goodReturn.ok, goodReturn.ok ? "" : goodReturn.reason);
    const prodAfterReturn = await prisma.accountProduct.findFirstOrThrow({ where: { id: product.id } });
    eq("AJ9.7 สต็อกเพิ่มกลับ 4 หลังคืน", Number(prodAfterReturn.qtyOnHand), Number(prodAfterIssue.qtyOnHand) + 4);

    if (goodReturn.ok) {
      const relRpr = await prisma.accountDocumentRelation.findFirst({ where: { systemId, fromId: prr.id, toId: goodReturn.id } });
      assert("AJ9.8 relation ADJUST เกิดขึ้นจริง (PRR → RPR)", relRpr?.type === "ADJUST");
      const rprDoc = await prisma.accountDocument.findFirstOrThrow({ where: { id: goodReturn.id } });
      eq("AJ9.9 adjustReason ถูกเก็บ", rprDoc.adjustReason, "สินค้าชำรุด/คืนสินค้า");
    }

    const remainAfter = await prod.returnableQtyForIssueNow(tenantId, systemId, prr.id);
    eq("AJ9.10 จำนวนที่ยังคืนได้หลังคืน 4 = 6", remainAfter.get(product.id), 6);
    const overRemain = await prod.createGoodsMovement({ tenantId, systemId, docType: "GOODS_ISSUE_RETURN", contactId: customerA.id, sourceDocId: prr.id, adjustReason: "อื่น ๆ", lines: [{ productId: product.id, qty: 7 }], createdById: owner.id });
    assert("AJ9.11 คืนต่อจนเกินยอดที่เหลือ (6) ถูกปฏิเสธ", !overRemain.ok, overRemain.ok ? "ผ่านไปได้" : "");
  }

  // ═════════ ตรวจรวม: สมุดรายวันทุกชุดของ tenant ต้องสมดุล ═════════
  console.log("\nตรวจรวมทั้ง tenant:");
  const allEntries = (await prisma.accountJournalEntry.findMany({ where: { tenantId }, include: { lines: true } })) as {
    id: string;
    lines: { debit: number; credit: number }[];
  }[];
  const unbalanced = allEntries.filter((e) => e.lines.reduce((s, l) => s + l.debit, 0) !== e.lines.reduce((s, l) => s + l.credit, 0));
  eq("AJ10.1 ทุกชุดสมุดรายวันของ tenant นี้สมดุล", unbalanced.length, 0);
  const suspense = await prisma.accountJournalLine.findMany({ where: { tenantId, account: { code: "9999" } } });
  eq("AJ10.2 ไม่มีรายการตกบัญชีพัก 9999", suspense.length, 0);
} finally {
  const del = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      console.log(`  ⚠ cleanup: ${e instanceof Error ? e.message.split("\n")[0] : e}`);
    }
  };
  if (tenantId) {
    await del(() => prisma.accountJournalLine.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountJournalEntry.updateMany({ where: { tenantId }, data: { reversalOfId: null } }));
    await del(() => prisma.accountJournalEntry.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountDocumentPayment.updateMany({ where: { tenantId }, data: { chequeId: null, whtCertDocId: null } }));
    await del(() => prisma.accountCheque.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountDocumentPayment.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountDocumentRelation.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountDocumentLine.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountDocument.updateMany({ where: { tenantId }, data: { sourceDocId: null, replacedById: null, sourcePaymentId: null } }));
    await del(() => prisma.accountAttachment.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountDocument.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountDocSequence.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountMapping.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountFinance.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountLedger.updateMany({ where: { tenantId }, data: { parentId: null } }));
    await del(() => prisma.accountLedger.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountPeriod.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountProduct.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountContact.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountSettings.deleteMany({ where: { tenantId } }));
    await del(() => prisma.appSystemUnit.deleteMany({ where: { tenantId } }));
    await del(() => prisma.appSystem.deleteMany({ where: { tenantId } }));
    await del(() => prisma.auditLog.deleteMany({ where: { tenantId } }));
    await del(() => prisma.membership.deleteMany({ where: { tenantId } }));
    await del(() => prisma.tenant.delete({ where: { id: tenantId } }));
  }
  for (const uid of userIds) await del(() => prisma.user.delete({ where: { id: uid } }));
  console.log("\n[cleanup] ลบ test data เรียบร้อย");
}

console.log(`\n===== สรุป WO 1.6: ผ่าน ${passed} · ไม่ผ่าน ${findings.length} =====`);
if (findings.length > 0) console.log(findings.map((f) => "  • " + f).join("\n"));
console.log(findings.length === 0 ? "🎉 WO 1.6 ผ่านทั้งหมด\n" : "⚠️ มีข้อไม่ผ่าน\n");
process.exit(findings.length === 0 ? 0 : 1);
