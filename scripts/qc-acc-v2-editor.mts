// QC WO 1.3 — "DocEditorV2" (ฟอร์มสร้าง/แก้เอกสารเต็มหน้า · DESIGN-SPEC-V2 §5.2 A–C, E, G, H, I)
// รัน (แนะนำ · DB QC branch):  QC_ENV_FILE=.env.qc pnpm tsx scripts/qc-acc-v2-editor.mts
//
// 🔴 ความปลอดภัยข้อมูล: สคริปต์นี้ **สร้าง tenant ทิ้ง** แล้วลบทิ้งเมื่อจบ (ทุก query ผูก tenantId ของตัวเอง)
//    แต่ยังต้องชี้ DB QC เสมอ: ตั้ง QC_ENV_FILE=.env.qc — สคริปต์พิมพ์ไฟล์ env + โฮสต์ DB ให้ตรวจก่อนเริ่ม
//
// ทำไมไม่เรียก server action ตรง ๆ: `saveDraftAction`/`approveDocAction` เริ่มด้วย `requireTenant()`
// (อ่านคุกกี้ผ่าน next/headers) ซึ่งไม่มีนอก request context ⇒ ที่นี่ตรวจ **ชั้นที่ action เรียกจริง**
// (computeDocTotals · service/expense · applyEditorExtras · assertAccountCan) + ตรวจ "สายไฟ" ของ action
// แบบ static (E4) ว่ายังเรียกด่านครบตามลำดับ · ภาพจริงบนเบราว์เซอร์เป็นหน้าที่ scripts/visual-acc-v2.mts 1.3
//
// ครอบคลุม (ดู ledger/wo-notes/1.3.md):
//   E1  computeDocTotals แบบตาราง — เคส g1 (24,900) · INCL/NO_VAT/ไม่จด VAT · ส่วนลดบรรทัด ฿/% · ส่วนลดท้ายบิล ฿/%
//       · VAT 0%/ยกเว้น · WHT ต่อบรรทัด · ตัวอักษรไทย · vatModeOf/priceModeOf
//   E2  WHT_TYPE_OPTIONS (ฝั่ง client) ไม่หลุดจาก WHT_INCOME_LABEL (ฝั่ง server)
//   E3  doc-editor-config: route new/edit/detail · ชนิดที่สร้างตรงไม่ได้ · สาย stepper · ป้ายวันที่ · บัญชีต่อบรรทัด
//   E4  editor-actions.ts: ทุก action ผ่าน loadAccountSystem + assertAccountCan · ไม่ import prisma ·
//       ร่างไม่จองเลข (ไม่มีการเรียก nextDocNo/issue ใน saveDraftAction)
//   E5  (DB) บันทึกร่างซ้ำ = ใบเดิม ไม่กินเลข → อนุมัติแล้วได้เลขครั้งเดียว + JV สมดุลตรงเฉลย 24,900
//   E6  (DB) WHT/reference/autoTaxInvoice/แท็ก ต่อบรรทัดถูกเก็บจริง · ไฟล์แนบผูกเอกสาร · รายการโปรด
//   E7  (DB) สิทธิ์ + ขอบเขต tenant/system: STAFF ไม่มีสิทธิ์ = ถูกปฏิเสธ · เอกสารของระบบอื่นแก้ไม่ได้

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
console.log(`\n===== QC WO 1.3 · ฟอร์มเอกสาร V2 (DocEditorV2) =====`);
console.log(`[env] ไฟล์ ${envFile} · DB ${dbHost}\n`);

const totalsMod = await import("@/lib/modules/account/totals");
const { computeDocTotals, bahtText, vatModeOf, priceModeOf, lineDiscountSatang } = totalsMod;
const cfg = await import("@/lib/modules/account/doc-editor-config");
const types = await import("@/components/account-v2/doc-editor-types");
const { WHT_INCOME_LABEL } = await import("@/lib/modules/account/expense");

// ═══════════════════════════ E1 — computeDocTotals (บริสุทธิ์ ไม่ต่อ DB) ═══════════════════════════
console.log("E1 สูตรยอดเอกสาร (computeDocTotals):");

/** เคสเฉลย g1-invoice-form.png — ต้องได้ 24,900.00 เป๊ะทุกช่อง */
const G1_LINES = [
  { qty: 2, unitPriceSatang: 990_000, vatRateBp: 700, whtRateBp: 300 }, // ทริปสิมิลัน 3D2N (หัก ณ ที่จ่าย 3%)
  { qty: 2, unitPriceSatang: 120_000, vatRateBp: 700 }, // ค่าเช่าอุปกรณ์ดำน้ำ
  { qty: 1, unitPriceSatang: 107_103, vatRateBp: 700 }, // เสื้อ SIAM DIVE
];
const g1 = computeDocTotals({ lines: G1_LINES, priceMode: "EXCL_VAT", vatRegistered: true, vatRateBp: 700 });
eqAmt("E1.1 g1 รวมเป็นเงิน = 23,271.03", g1.subTotal, 2_327_103);
eqAmt("E1.2 g1 ส่วนลดรวม = 0", g1.discountAmount, 0);
eqAmt("E1.3 g1 หลังหักส่วนลด = 23,271.03", g1.afterDiscount, 2_327_103);
eqAmt("E1.4 g1 VAT 7% = 1,628.97", g1.vatAmount, 162_897);
eqAmt("E1.5 g1 จำนวนเงินทั้งสิ้น = 24,900.00", g1.grandTotal, 2_490_000);
eqAmt("E1.6 g1 หัก ณ ที่จ่าย 3% ของบรรทัดทริป = 594.00", g1.whtTotal, 59_400);
eqAmt("E1.7 g1 ยอดที่ต้องชำระ (ยังไม่หักมัดจำ) = 24,306.00", g1.dueTotal, 2_430_600);
eq("E1.8 g1 ตัวอักษรไทย", g1.grandTotalWords, "สองหมื่นสี่พันเก้าร้อยบาทถ้วน");
eq("E1.9 g1 vatMode ที่บันทึกลง DB = EXCLUDE", g1.vatMode, "EXCLUDE");
eqAmt("E1.10 g1 บรรทัดทริป: มูลค่าก่อนภาษี 19,800.00", g1.lines[0].net, 1_980_000);
eqAmt("E1.11 g1 บรรทัดทริป: WHT 594.00 (บรรทัดอื่น 0)", g1.lines[1].wht + g1.lines[2].wht, 0);
eqAmt("E1.12 g1 ผลรวม VAT ต่อบรรทัด = VAT ทั้งใบ", g1.lines.reduce((s, l) => s + l.vat, 0), g1.vatAmount);

// รวม VAT (INCLUDE): 107.00 รวม VAT แล้ว → ฐาน 100.00 + VAT 7.00
const incl = computeDocTotals({
  lines: [{ qty: 1, unitPriceSatang: 10_700, vatRateBp: 700 }],
  priceMode: "INCL_VAT",
  vatRegistered: true,
  vatRateBp: 700,
});
eq("E1.13 INCL_VAT → vatMode INCLUDE", incl.vatMode, "INCLUDE");
eqAmt("E1.14 INCL_VAT: รวมเป็นเงิน (ฐานก่อน VAT) = 100.00", incl.subTotal, 10_000);
eqAmt("E1.15 INCL_VAT: VAT = 7.00", incl.vatAmount, 700);
eqAmt("E1.16 INCL_VAT: จำนวนเงินทั้งสิ้น = 107.00 (ไม่บวก VAT ซ้ำ)", incl.grandTotal, 10_700);

// ไม่มี VAT
const noVat = computeDocTotals({ lines: G1_LINES, priceMode: "NO_VAT", vatRegistered: true, vatRateBp: 700 });
eq("E1.17 NO_VAT → vatMode NONE", noVat.vatMode, "NONE");
eqAmt("E1.18 NO_VAT: VAT = 0", noVat.vatAmount, 0);
eqAmt("E1.19 NO_VAT: จำนวนเงินทั้งสิ้น = 23,271.03 (เท่ายอดก่อนภาษี)", noVat.grandTotal, 2_327_103);

// กิจการไม่จด VAT → บังคับ NONE แม้ผู้ใช้เลือก "แยก VAT"
const unreg = computeDocTotals({ lines: G1_LINES, priceMode: "EXCL_VAT", vatRegistered: false, vatRateBp: 700 });
eq("E1.20 ไม่จด VAT + เลือกแยก VAT → vatMode NONE", unreg.vatMode, "NONE");
eqAmt("E1.21 ไม่จด VAT → VAT = 0", unreg.vatAmount, 0);

// ส่วนลดต่อบรรทัด — ฿/หน่วย และ %
const dAmt = computeDocTotals({
  lines: [{ qty: 2, unitPriceSatang: 100_00, discount: { mode: "amount", satang: 500, percentBp: 0 }, vatRateBp: 0 }],
  priceMode: "EXCL_VAT",
  vatRegistered: true,
  vatRateBp: 700,
});
eqAmt("E1.22 ส่วนลด/หน่วย 5.00 × 2 ชิ้น → หัก 10.00 (ฐาน 190.00)", dAmt.subTotal, 19_000);
const dPct = computeDocTotals({
  lines: [{ qty: 2, unitPriceSatang: 100_00, discount: { mode: "percent", satang: 0, percentBp: 1000 }, vatRateBp: 0 }],
  priceMode: "EXCL_VAT",
  vatRegistered: true,
  vatRateBp: 700,
});
eqAmt("E1.23 ส่วนลดบรรทัด 10% ของ 200.00 → ฐาน 180.00", dPct.subTotal, 18_000);
eqAmt(
  "E1.24 ส่วนลดบรรทัดเกินมูลค่า → clamp ที่มูลค่าบรรทัด (ไม่ติดลบ)",
  lineDiscountSatang({ qty: 1, unitPriceSatang: 10_000, discount: { mode: "amount", satang: 999_999, percentBp: 0 } }),
  10_000,
);

// ส่วนลดท้ายบิล — ฿ และ %
const ddAmt = computeDocTotals({
  lines: [
    { qty: 1, unitPriceSatang: 100_00, vatRateBp: 700 },
    { qty: 1, unitPriceSatang: 100_00, vatRateBp: 700 },
  ],
  priceMode: "EXCL_VAT",
  vatRegistered: true,
  vatRateBp: 700,
  docDiscount: { mode: "amount", satang: 50_00, percentBp: 0 },
});
eqAmt("E1.25 ส่วนลดท้ายบิล ฿50 → หลังหักส่วนลด 150.00", ddAmt.afterDiscount, 15_000);
eqAmt("E1.26 ส่วนลดท้ายบิล ฿50 → VAT 10.50", ddAmt.vatAmount, 1_050);
eqAmt("E1.27 ส่วนลดท้ายบิล ฿50 → ทั้งสิ้น 160.50", ddAmt.grandTotal, 16_050);
const ddPct = computeDocTotals({
  lines: [
    { qty: 1, unitPriceSatang: 100_00, vatRateBp: 700 },
    { qty: 1, unitPriceSatang: 100_00, vatRateBp: 700 },
  ],
  priceMode: "EXCL_VAT",
  vatRegistered: true,
  vatRateBp: 700,
  docDiscount: { mode: "percent", satang: 0, percentBp: 1000 },
});
eqAmt("E1.28 ส่วนลดท้ายบิล 10% ของ 200.00 = 20.00", ddPct.discountAmount, 2_000);
eqAmt("E1.29 ส่วนลดท้ายบิล 10% → ทั้งสิ้น 192.60", ddPct.grandTotal, 19_260);
const ddClamp = computeDocTotals({
  lines: [{ qty: 1, unitPriceSatang: 100_00, vatRateBp: 700 }],
  priceMode: "EXCL_VAT",
  vatRegistered: true,
  vatRateBp: 700,
  docDiscount: { mode: "amount", satang: 999_999, percentBp: 0 },
});
eqAmt("E1.30 ส่วนลดท้ายบิลเกินยอด → clamp ที่ยอดรวมบรรทัด", ddClamp.discountAmount, 10_000);
eqAmt("E1.31 ส่วนลดท้ายบิลเกินยอด → ยอดที่ต้องชำระไม่ติดลบ", ddClamp.dueTotal, 0);

// VAT ต่อบรรทัด 0% / ยกเว้น
const mixed = computeDocTotals({
  lines: [
    { qty: 1, unitPriceSatang: 100_00, vatRateBp: 700 },
    { qty: 1, unitPriceSatang: 100_00, vatRateBp: 0 },
    { qty: 1, unitPriceSatang: 100_00, vatRateBp: -1 },
  ],
  priceMode: "EXCL_VAT",
  vatRegistered: true,
  vatRateBp: 700,
});
eqAmt("E1.32 บรรทัด 0% / ยกเว้น ไม่คิด VAT (VAT รวม = 7.00 จากบรรทัดเดียว)", mixed.vatAmount, 700);
eqAmt("E1.33 คละอัตรา VAT → ทั้งสิ้น 307.00", mixed.grandTotal, 30_700);

// WHT คิดจากฐานหลังส่วนลดทุกชั้น
const whtAfterDiscount = computeDocTotals({
  lines: [{ qty: 1, unitPriceSatang: 100_00, vatRateBp: 700, whtRateBp: 300 }],
  priceMode: "EXCL_VAT",
  vatRegistered: true,
  vatRateBp: 700,
  docDiscount: { mode: "amount", satang: 50_00, percentBp: 0 },
});
eqAmt("E1.34 WHT 3% คิดจากฐานหลังหักส่วนลด (50.00 × 3% = 1.50)", whtAfterDiscount.whtTotal, 150);
eqAmt("E1.35 ยอดที่ต้องชำระ = ทั้งสิ้น − WHT (53.50 − 1.50)", whtAfterDiscount.dueTotal, 5_200);

// หักเงินมัดจำ (WO 1.4 เป็นคนกรอกของจริง — ที่นี่ต้องคำนวณถูกเมื่อมีค่า)
const withDeposit = computeDocTotals({
  lines: G1_LINES,
  priceMode: "EXCL_VAT",
  vatRegistered: true,
  vatRateBp: 700,
  depositDeductedSatang: 1_000_000,
});
eqAmt("E1.36 หักเงินมัดจำ 10,000 → ยอดที่ต้องชำระ 14,306.00 (ตาม g1)", withDeposit.dueTotal, 1_430_600);
eqAmt("E1.37 หักเงินมัดจำไม่กระทบ 'จำนวนเงินทั้งสิ้น' (ยังเป็น 24,900)", withDeposit.grandTotal, 2_490_000);

// ตัวอักษรไทย
eq("E1.38 bahtText(0)", bahtText(0), "ศูนย์บาทถ้วน");
eq("E1.39 bahtText(11.00)", bahtText(1_100), "สิบเอ็ดบาทถ้วน");
eq("E1.40 bahtText(100.25) มีเศษสตางค์", bahtText(10_025), "หนึ่งร้อยบาทยี่สิบห้าสตางค์");
eq("E1.41 bahtText(1,234,567.89) หลักล้าน", bahtText(123_456_789), "หนึ่งล้านสองแสนสามหมื่นสี่พันห้าร้อยหกสิบเจ็ดบาทแปดสิบเก้าสตางค์");
eq("E1.42 bahtText ติดลบนำหน้าด้วย 'ลบ'", bahtText(-10_000).startsWith("ลบ"), true);

// vatModeOf / priceModeOf ไป-กลับ
for (const pm of ["EXCL_VAT", "INCL_VAT", "NO_VAT"] as const) {
  const back = priceModeOf(vatModeOf(pm, true));
  eq(`E1.43 ประเภทราคา ${pm} → vatMode → กลับมาเท่าเดิม`, back, pm);
}

// ═══════════════════════════ E2 — ตัวเลือก WHT ฝั่งจอ = ฝั่ง server ═══════════════════════════
console.log("\nE2 ตัวเลือกหัก ณ ที่จ่าย (client ↔ server):");
for (const o of types.WHT_TYPE_OPTIONS) {
  assert(`E2 ${o.value} มีอยู่จริงใน WHT_INCOME_LABEL (server)`, o.value in WHT_INCOME_LABEL, `ไม่มีคีย์นี้`);
}
eq(
  "E2 จำนวนประเภทเงินได้ตรงกันทั้งสองฝั่ง",
  types.WHT_TYPE_OPTIONS.length,
  Object.keys(WHT_INCOME_LABEL).length,
);
assert(
  "E2 อัตราเริ่มต้นของทุกประเภทอยู่ในช่วง 0–15%",
  types.WHT_TYPE_OPTIONS.every((o) => o.defaultRateBp >= 0 && o.defaultRateBp <= 1500),
);
eq("E2 ตัวเลือก VAT ต่อบรรทัด = 7% / 0% / ยกเว้น", types.VAT_OPTIONS.map((o) => o.value).join(","), "700,0,-1");

// packDescription/unpackDescription ไป-กลับ (ชื่อ + คำอธิบายเก็บในคอลัมน์เดียว)
const packed = types.packDescription("ทริปสิมิลัน 3D2N", "รวมอาหาร 6 มื้อ + ที่พักบนเรือ 2 คืน");
const un = types.unpackDescription(packed);
eq("E2 ชื่อ+คำอธิบาย pack/unpack ไป-กลับ (ชื่อ)", un.name, "ทริปสิมิลัน 3D2N");
eq("E2 ชื่อ+คำอธิบาย pack/unpack ไป-กลับ (คำอธิบาย)", un.description, "รวมอาหาร 6 มื้อ + ที่พักบนเรือ 2 คืน");
eq("E2 ไม่มีคำอธิบาย → ไม่มี \\n ต่อท้าย", types.packDescription("เสื้อ SIAM DIVE", ""), "เสื้อ SIAM DIVE");

// ═══════════════════════════ E3 — ทะเบียน route/ขั้นตอนของฟอร์ม ═══════════════════════════
console.log("\nE3 ทะเบียนฟอร์ม (doc-editor-config):");
const BASE = "/app/sys/S1/account";
eq("E3 เส้นทางสร้าง (รายรับ)", cfg.editorNewPath(BASE, "INVOICE"), `${BASE}/docs/INVOICE/new`);
eq("E3 เส้นทางแก้ไข (รายรับ)", cfg.editorEditPath(BASE, "INVOICE", "D1"), `${BASE}/docs/INVOICE/D1/edit`);
eq("E3 เส้นทางหน้าเอกสาร (รายรับ)", cfg.editorDetailPath(BASE, "INVOICE", "D1"), `${BASE}/docs/INVOICE/D1`);
eq("E3 เส้นทางสร้าง (รายจ่าย ใช้ slug ของตัวเอง)", cfg.editorNewPath(BASE, "EXPENSE"), `${BASE}/expense/new`);
eq("E3 เส้นทางแก้ไข (ใบสั่งซื้อสินทรัพย์)", cfg.editorEditPath(BASE, "ASSET_PURCHASE_ORDER", "D2"), `${BASE}/asset-po/D2/edit`);
eq("E3 ฝั่งของเอกสาร: INVOICE = รายรับ", cfg.sideOf("INVOICE"), "revenue");
eq("E3 ฝั่งของเอกสาร: EXPENSE = รายจ่าย", cfg.sideOf("EXPENSE"), "expense");
assert("E3 ใบเสร็จ/ใบกำกับ สร้างตรง ๆ ไม่ได้ (เกิดจากการแปลง)", !cfg.canCreateDirect("RECEIPT") && !cfg.canCreateDirect("TAX_INVOICE"));
assert("E3 ใบลด/เพิ่มหนี้ (ทั้ง 2 ฝั่ง) สร้างตรง ๆ ไม่ได้", ["CREDIT_NOTE", "DEBIT_NOTE", "CREDIT_NOTE_RECEIVED", "DEBIT_NOTE_RECEIVED"].every((t) => !cfg.canCreateDirect(t as never)));
assert("E3 ใบแจ้งหนี้/ใบเสนอราคา/ค่าใช้จ่าย สร้างตรงได้", ["QUOTATION", "INVOICE", "EXPENSE", "PURCHASE", "PURCHASE_ORDER"].every((t) => cfg.canCreateDirect(t as never)));
eq("E3 สาย stepper รายรับ (§5.2 A)", cfg.stepChainFor("INVOICE").join(","), "QUOTATION,INVOICE,RECEIPT,TAX_INVOICE");
eq("E3 สาย stepper ฝั่งค่าใช้จ่าย", cfg.stepChainFor("EXPENSE").join(","), "PURCHASE_ORDER,EXPENSE,PURCHASE_TAX_INVOICE");
eq("E3 ชนิดนอกสาย (ใบวางบิล) ไม่มี stepper", cfg.stepChainFor("BILLING_NOTE").length, 0);
eq("E3 ป้ายวันที่ของใบเสนอราคา = ใช้ได้ถึง", cfg.dueLabelOf("QUOTATION"), "ใช้ได้ถึง");
eq("E3 ป้ายวันที่ของใบแจ้งหนี้ = ครบกำหนด", cfg.dueLabelOf("INVOICE"), "ครบกำหนด");
assert("E3 บันทึกค่าใช้จ่าย/ซื้อสินทรัพย์ ต้องเลือกบัญชีต่อบรรทัด", cfg.requiresLineAccount("EXPENSE") && cfg.requiresLineAccount("ASSET_PURCHASE"));
assert("E3 ใบแจ้งหนี้ไม่บังคับบัญชีต่อบรรทัด (ใช้ค่าเริ่มต้น)", !cfg.requiresLineAccount("INVOICE"));
eq("E3 ทะเบียนฟอร์มครอบ 17 ชนิด (รายรับ 8 + รายจ่าย 9)", cfg.EDITOR_DOC_TYPES.length, 17);
assert(
  "E3 ทุกชนิดในทะเบียนมี route + label ภาษาไทย",
  cfg.EDITOR_DOC_TYPES.every((d) => d.route.length > 0 && /[ก-๙]/.test(d.label)),
);

// ═══════════════════════════ E4 — สายไฟของ server action (static) ═══════════════════════════
console.log("\nE4 ด่านของ server action (editor-actions.ts):");
const actionsSrc = readFileSync(join(ROOT, "src/lib/modules/account/editor-actions.ts"), "utf8");
const ACTIONS = [
  "saveDraftAction",
  "approveDocAction",
  "searchContactsAction",
  "searchProductsAction",
  "uploadDocAttachmentAction",
  "deleteDocAttachmentAction",
  "saveFavoriteLinesAction",
  "discardDraftAction",
];
for (const a of ACTIONS) {
  const i = actionsSrc.indexOf(`export async function ${a}(`);
  const body = i < 0 ? "" : actionsSrc.slice(i, actionsSrc.indexOf("\nexport ", i + 10) < 0 ? undefined : actionsSrc.indexOf("\nexport ", i + 10));
  assert(`E4 ${a} เรียก loadAccountSystem (ผูก tenant + ชนิดระบบ)`, body.includes("loadAccountSystem("), i < 0 ? "ไม่พบ action" : "ไม่เจอในตัว action");
  assert(`E4 ${a} เรียก assertAccountCan (ไม่พึ่ง 'หน้าไม่โชว์ปุ่ม')`, body.includes("assertAccountCan("), i < 0 ? "ไม่พบ action" : "ไม่เจอในตัว action");
}
assert("E4 ไฟล์ action ไม่ import prisma ตรง ๆ (ต้องผ่าน service — fitness F5)", !/from "@\/lib\/core\/db"/.test(actionsSrc));
// ตัดที่หัวข้อ section ถัดไป — ไม่ใช่ที่ approveDocAction เพราะ JSDoc ของ approve พูดถึง issueDocument (จะ false positive)
const saveBody = actionsSrc.slice(actionsSrc.indexOf("export async function saveDraftAction("), actionsSrc.indexOf("─ อนุมัติ (ออกเอกสาร"));
assert("E4 saveDraftAction ไม่จองเลขที่เอกสาร (ไม่เรียก issue*/nextDocNo)", !/issueDocument|issueExpenseDoc|nextDocNo/.test(saveBody));
assert("E4 saveDraftAction คำนวณยอดใหม่ฝั่ง server ด้วย computeDocTotals", saveBody.includes("computeDocTotals("));
assert("E4 saveDraftAction ตรวจว่าเป็น 'ร่าง' ก่อนแก้ (getDraftMeta + status DRAFT)", saveBody.includes("getDraftMeta(") && saveBody.includes('cur.status !== "DRAFT"'));
assert("E4 saveDraftAction ตรวจ id อ้างอิงว่าเป็นของระบบนี้ (assertEditorRefs)", saveBody.includes("assertEditorRefs("));
const approveBody = actionsSrc.slice(actionsSrc.indexOf("export async function approveDocAction("), actionsSrc.indexOf("function docTypeEditSuffix("));
assert("E4 approveDocAction ใช้สิทธิ์ account.doc.issue (ไม่ใช่ .create)", approveBody.includes('"account.doc.issue"'));
assert("E4 approveDocAction ออกเอกสารผ่าน flow เดิม (issueDocument/issueExpenseDoc)", approveBody.includes("issueDocument(") && approveBody.includes("issueExpenseDoc("));
const editorSrc = readFileSync(join(ROOT, "src/components/account-v2/DocEditorV2.tsx"), "utf8");
for (const tid of ["tot-sub", "tot-discount", "tot-net", "tot-vat", "tot-grand", "tot-wht", "tot-deposit", "tot-due"]) {
  assert(`E4 มี data-testid="${tid}" ให้ชุดภาพจริงอ่านตัวเลข`, readFileSync(join(ROOT, "src/components/account-v2/DocTotals.tsx"), "utf8").includes(`"${tid}"`));
}
assert('E4 ปุ่มเปิดเมนูอนุมัติมี data-testid="btn-approve-menu" (g1-invoice-form-menu.png)', editorSrc.includes('data-testid="btn-approve-menu"'));
const lineTableSrc = readFileSync(join(ROOT, "src/components/account-v2/DocLineTable.tsx"), "utf8");
assert('E4 แถวรายการมี data-testid="line-<i>"', lineTableSrc.includes("`line-${i}`"));

// ── E4b: ผลตรวจภาพจริงรอบ Fable (3 ก.ย.) — กันอาการเดิมกลับมา ──
console.log("\nE4b โครงหน้าที่ Fable ตีกลับจากภาพจริง:");
assert("E4b ตารางรายการเป็น table-fixed + มี colgroup (ไม่ให้คอลัมน์ถูกตัด)", lineTableSrc.includes("table-fixed") && lineTableSrc.includes("<colgroup>"));
assert("E4b ไม่มี min-w-[…] บนเซลล์ตาราง (ตัวการเดิมที่ดันตารางเกินการ์ด)", !/className=\{`\$\{TD\} min-w-\[/.test(lineTableSrc));
assert('E4b ตัวห่อตารางมี min-w-0 + overflow-x-auto + data-testid="line-table-wrap"', lineTableSrc.includes('min-w-0 overflow-x-auto') && lineTableSrc.includes('data-testid="line-table-wrap"'));
const wAcc = /accountant: \[([^\]]+)\]/.exec(lineTableSrc)?.[1] ?? "";
const wEasy = /easy: \[([^\]]+)\]/.exec(lineTableSrc)?.[1] ?? "";
const sumPct = (raw: string) => raw.split(",").map((x) => Number(x.replace(/[^0-9.]/g, ""))).filter((n) => n > 0).reduce((a, b) => a + b, 0);
eq("E4b ความกว้างคอลัมน์โหมดนักบัญชีรวม 100% พอดี (10 คอลัมน์)", sumPct(wAcc), 100);
eq("E4b ความกว้างคอลัมน์โหมดง่ายรวม 100% พอดี (8 คอลัมน์)", sumPct(wEasy), 100);
eq("E4b โหมดนักบัญชีมี 10 คอลัมน์ตาม g1", wAcc.split(",").filter((x) => x.trim()).length, 10);
eq("E4b โหมดง่ายมี 8 คอลัมน์ (ตัด บัญชี + หัก ณ ที่จ่าย)", wEasy.split(",").filter((x) => x.trim()).length, 8);

const toggleSrc = readFileSync(join(ROOT, "src/components/account-v2/EasyModeToggle.tsx"), "utf8");
const modeSrc = readFileSync(join(ROOT, "src/components/account-v2/mode.ts"), "utf8");
assert("E4b ค่าเริ่มต้นฝั่ง client = โหมดนักบัญชี (ภาพที่อนุมัติเป็นโหมดเต็ม)", /return "accountant";/.test(toggleSrc) && /ls === "easy" \? "easy" : "accountant"/.test(toggleSrc));
assert("E4b ค่าเริ่มต้นฝั่ง server = โหมดนักบัญชี (ตรงกับ client ไม่ให้ SSR สลับหน้า)", /v === "easy" \? "easy" : "accountant"/.test(modeSrc));

const dateSrc = readFileSync(join(ROOT, "src/components/account-v2/DateInput.tsx"), "utf8");
assert("E4b DateInput โชว์วันที่ไทย (formatDateTh) ไม่ใช่รูปแบบเบราว์เซอร์", dateSrc.includes("formatDateTh(iso)"));
assert("E4b DateInput สลับเป็นปฏิทินเครื่องตอนโฟกัส + เปิด showPicker", dateSrc.includes('type={editing ? "date" : "text"}') && dateSrc.includes("showPicker"));
assert("E4b DateInput ส่งค่า ISO ผ่าน hidden input (ไม่ส่งข้อความไทยไปกับฟอร์ม)", dateSrc.includes('<input type="hidden" name={name} value={iso} />'));
assert("E4b ฟอร์มใช้ DateInput ทั้งวันที่ออกและวันครบกำหนด (ไม่มี type=\"date\" ดิบ)", editorSrc.includes("<DateInput") && !editorSrc.includes('type="date"'));

const pageSrc = readFileSync(join(ROOT, "src/lib/modules/account/DocEditorPage.tsx"), "utf8");
assert("E4b ไม่มีลิงก์ย้อนกลับซ้ำเหนือ h1 (breadcrumb ของ shell ทำหน้าที่นี้แล้ว)", !pageSrc.includes("← {def.label}"));
assert("E4b ตัวฟอร์มเผื่อที่ให้แถบปุ่มท้าย (pb-40 มือถือ / pb-28 เดสก์ท็อป)", editorSrc.includes("pb-40 md:pb-28"));
assert('E4b ช่องผู้ติดต่อมี data-testid="contact-picker" ให้ไม้บรรทัดอ่าน input.value', editorSrc.includes('testId="contact-picker"'));

// ═══════════════════════════ E5–E7 — ของจริงบน DB ═══════════════════════════
const { prisma } = await import("@/lib/core/db");
const sysMod = await import("@/lib/modules/system/service");
const acc = await import("@/lib/modules/account/service");
const gl = await import("@/lib/modules/account/gl");
const att = await import("@/lib/modules/account/attachment");
const { assertAccountCan } = await import("@/lib/modules/account/access");

const tag = "QCACC13-" + Date.now();
let tenantId = "";
const userIds: string[] = [];

try {
  const t = await prisma.tenant.create({ data: { name: tag, slug: tag.toLowerCase() } });
  tenantId = t.id;
  const owner = await prisma.user.create({ data: { email: tag.toLowerCase() + "-owner@qc.local", name: "QC เจ้าของ" } });
  const staff = await prisma.user.create({ data: { email: tag.toLowerCase() + "-staff@qc.local", name: "QC พนักงาน" } });
  const clerk = await prisma.user.create({ data: { email: tag.toLowerCase() + "-clerk@qc.local", name: "QC ธุรการเอกสาร" } });
  userIds.push(owner.id, staff.id, clerk.id);
  const mOwner = await prisma.membership.create({ data: { userId: owner.id, tenantId, role: "OWNER", unitAccess: ["*"] }, include: { tenant: true } });
  const mStaff = await prisma.membership.create({ data: { userId: staff.id, tenantId, role: "STAFF", unitAccess: ["*"], permissions: {} }, include: { tenant: true } });
  const mClerk = await prisma.membership.create({
    data: { userId: clerk.id, tenantId, role: "STAFF", unitAccess: ["*"], permissions: { "account.doc.create": true } },
    include: { tenant: true },
  });

  const s1 = await sysMod.createSystem(tenantId, "ACCOUNT", "บัญชี " + tag);
  const s2 = await sysMod.createSystem(tenantId, "ACCOUNT", "บัญชีสาขา 2 " + tag); // ระบบที่สองของ tenant เดียวกัน (ทดสอบขอบเขต)
  const systemId = s1.id;
  const otherSystemId = s2.id;
  console.log(`\n[seed] tenant ${tenantId} · system ${systemId} · system อีกตัว ${otherSystemId}\n`);

  await acc.saveSettings(tenantId, systemId, {
    orgName: "ร้านดำน้ำ QC 1.3",
    taxId: "0105561000000",
    vatRegistered: true,
    vatRateBp: 700,
    taxPointBasis: "ON_ISSUE",
  });
  await acc.saveSettings(tenantId, otherSystemId, { orgName: "สาขา 2", vatRegistered: true, vatRateBp: 700 });
  await gl.ensureAccounting({ tenantId, systemId });
  await gl.ensureAccounting({ tenantId, systemId: otherSystemId });

  const customer = await acc.createContact({ tenantId, systemId, kind: "CUSTOMER", legalType: "COMPANY", name: "คุณณัฐพล รุ่งเรือง", taxId: "0105561999999", branchCode: "00000" });
  const foreignContact = await acc.createContact({ tenantId, systemId: otherSystemId, kind: "CUSTOMER", legalType: "PERSON", name: "ลูกค้าสาขา 2" });

  // ═══════════ E5 — บันทึกร่างซ้ำ ไม่กินเลข → อนุมัติได้เลขครั้งเดียว + JV ═══════════
  console.log("E5 บันทึกร่าง → อนุมัติ (เคสเฉลย g1 · 24,900):");
  const totals = computeDocTotals({ lines: G1_LINES, priceMode: "EXCL_VAT", vatRegistered: true, vatRateBp: 700 });
  const lineInputs = [
    { description: "ทริปสิมิลัน 3D2N\nรวมอาหาร 6 มื้อ + ที่พักบนเรือ 2 คืน", qty: 2, unitName: "คน", unitPrice: 990_000, discount: 0, vatRateBp: 700 },
    { description: "ค่าเช่าอุปกรณ์ดำน้ำ", qty: 2, unitName: "วัน", unitPrice: 120_000, discount: 0, vatRateBp: 700 },
    { description: "เสื้อ SIAM DIVE", qty: 1, unitName: "ตัว", unitPrice: 107_103, discount: 0, vatRateBp: 700 },
  ];

  const preview1 = await acc.previewNextDocNo(systemId, "INVOICE", new Date());
  const doc = await acc.createDocument({
    tenantId,
    systemId,
    docType: "INVOICE",
    contactId: customer.id,
    issueDate: new Date(),
    vatMode: totals.vatMode,
    vatTiming: "ON_ISSUE",
    discountAmount: totals.discountAmount,
    lines: lineInputs,
    createdById: owner.id,
  });
  eqAmt("E5.1 ร่างที่บันทึก: ยอดรวมทั้งสิ้น 24,900.00 (ตรงสูตรฝั่งจอ)", doc.grandTotal, totals.grandTotal);
  eqAmt("E5.2 ร่างที่บันทึก: VAT 1,628.97", doc.vatAmount, 162_897);
  eq("E5.3 ร่างยังไม่มีเลขที่เอกสาร (ไม่กินเลขรัน)", doc.docNo, null);
  eq("E5.4 สถานะ = ร่าง", doc.status, "DRAFT");

  const preview2 = await acc.previewNextDocNo(systemId, "INVOICE", new Date());
  eq("E5.5 พรีวิวเลขถัดไปไม่ขยับหลังบันทึกร่าง (ไม่จองเลข)", preview2, preview1);
  eq("E5.6 ยังไม่มีแถวตัวนับเลขรันเกิดขึ้นจากร่าง", await prisma.accountDocSequence.count({ where: { systemId, docType: "INVOICE" } }), 0);

  // แก้ร่างซ้ำ 3 ครั้ง — ต้องเป็นใบเดิม ยอดเท่าเดิม ไม่เกิดใบใหม่
  for (let i = 0; i < 3; i++) {
    const r = await acc.updateDocument(tenantId, systemId, doc.id, {
      contactId: customer.id,
      issueDate: new Date(),
      dueDate: new Date(Date.now() + 14 * 86_400_000),
      vatMode: totals.vatMode,
      discountAmount: totals.discountAmount,
      note: "ขอบคุณที่ใช้บริการ",
      lines: lineInputs,
    });
    assert(`E5.7.${i + 1} แก้ร่างครั้งที่ ${i + 1} สำเร็จ`, r.ok === true, JSON.stringify(r));
  }
  eq("E5.8 แก้ร่าง 3 ครั้งแล้วยังมีใบเดียว (autosave ไม่สร้างซ้ำ)", await prisma.accountDocument.count({ where: { systemId, docType: "INVOICE" } }), 1);
  const afterEdits = await prisma.accountDocument.findFirstOrThrow({ where: { id: doc.id }, select: { docNo: true, grandTotal: true } });
  eq("E5.9 แก้ร่างซ้ำแล้วยังไม่มีเลขที่เอกสาร", afterEdits.docNo, null);
  eqAmt("E5.10 แก้ร่างซ้ำแล้วยอดยังเป็น 24,900.00", afterEdits.grandTotal, 2_490_000);

  // ฟิลด์ V2 (WO 0.3 + 1.3) — ผ่าน applyEditorExtras ตัวเดียวกับที่ action เรียก
  const extras = await acc.applyEditorExtras(tenantId, systemId, doc.id, {
    reference: "PO-ลูกค้า-2026-091",
    priceMode: "EXCL_VAT",
    discountMode: "AMOUNT",
    salesUserId: owner.id,
    tags: ["ทริปดำน้ำ", "ลูกค้าประจำ"],
    internalNote: "ลูกค้าจองผ่านไลน์",
    autoTaxInvoice: true,
    whtAmount: totals.whtTotal,
    lineWht: [
      { whtIncomeType: "M40_8", whtRateBp: 300 },
      { whtIncomeType: null, whtRateBp: null },
      { whtIncomeType: null, whtRateBp: null },
    ],
  });
  assert("E5.11 applyEditorExtras คืนค่าเอกสาร (ผูก tenant+system ถูกใบ)", extras !== null);

  console.log("\nE6 ฟิลด์ V2 ที่ต้องเก็บได้จริง:");
  const saved = await prisma.accountDocument.findFirstOrThrow({
    where: { id: doc.id },
    select: { reference: true, autoTaxInvoice: true, tags: true, salesUserId: true, internalNote: true, priceMode: true, whtAmount: true, lines: { orderBy: { sortOrder: "asc" }, select: { sortOrder: true, whtIncomeType: true, whtRateBp: true, description: true } } },
  });
  eq("E6.1 อ้างอิง (§5.2 B) ถูกเก็บ", saved.reference, "PO-ลูกค้า-2026-091");
  eq("E6.2 toggle 'ออกใบกำกับภาษีพร้อมกัน' ถูกเก็บ", saved.autoTaxInvoice, true);
  eq("E6.3 แท็กถูกเก็บครบ", saved.tags.join(","), "ทริปดำน้ำ,ลูกค้าประจำ");
  eq("E6.4 พนักงานขายถูกเก็บ", saved.salesUserId, owner.id);
  eq("E6.5 หมายเหตุภายในถูกเก็บ (ไม่พิมพ์บนเอกสาร)", saved.internalNote, "ลูกค้าจองผ่านไลน์");
  eq("E6.6 ประเภทราคาถูกเก็บ", saved.priceMode, "EXCL_VAT");
  eqAmt("E6.7 พรีวิว WHT ทั้งใบถูกเก็บ (594.00)", saved.whtAmount, 59_400);
  eq("E6.8 WHT ต่อบรรทัด: บรรทัดแรกเป็น ม.40(8)", saved.lines[0].whtIncomeType, "M40_8");
  eq("E6.9 WHT ต่อบรรทัด: อัตราบรรทัดแรก 3% (300 bp)", saved.lines[0].whtRateBp, 300);
  eq("E6.10 WHT ต่อบรรทัด: บรรทัดที่ 2 ไม่หัก", saved.lines[1].whtIncomeType, null);
  eq("E6.11 บรรทัดเรียงตาม sortOrder ตรงกับที่กรอก", saved.lines.map((l) => l.sortOrder).join(","), "0,1,2");
  eq("E6.12 ชื่อ+คำอธิบายเก็บรวมคอลัมน์เดียว แกะกลับได้", types.unpackDescription(saved.lines[0].description).name, "ทริปสิมิลัน 3D2N");

  // ไฟล์แนบ (§5.2 H) — ผูกกับเอกสาร + เข้าคลังเอกสาร
  const a1 = await att.createAttachment({ tenantId, systemId, documentId: doc.id, fileName: "ใบสรุปทริป-ณัฐพล.pdf", fileUrl: "https://cdn.example.com/qc/trip.pdf", mimeType: "application/pdf", sizeBytes: 219_136, uploadedById: owner.id });
  assert("E6.13 แนบไฟล์กับร่างสำเร็จ", a1.ok === true, JSON.stringify(a1));
  const attList = await att.listAttachments(tenantId, systemId, { documentId: doc.id });
  eq("E6.14 ไฟล์แนบผูกกับเอกสารใบนี้ 1 ไฟล์", attList.length, 1);
  eq("E6.15 ไฟล์แนบชี้กลับไปที่เอกสารถูกใบ", attList[0]?.document?.id, doc.id);
  const aForeign = await att.createAttachment({ tenantId, systemId: otherSystemId, documentId: doc.id, fileName: "x.pdf", fileUrl: "https://cdn.example.com/qc/x.pdf" });
  eq("E6.16 แนบไฟล์ข้ามระบบไม่ได้ (documentId ของอีกระบบ)", aForeign.ok, false);

  // รายการโปรด (§5.2 C)
  const favRes = await acc.saveDocFavorite(tenantId, systemId, { name: "ทริปสิมิลัน 3D2N + ค่าอุปกรณ์", lines: [{ name: "ทริปสิมิลัน 3D2N", qty: 2, unitPriceSatang: 990_000 }] });
  assert("E6.17 บันทึกรายการโปรดสำเร็จ", favRes.ok === true, JSON.stringify(favRes));
  const favs = await acc.getDocFavorites(tenantId, systemId);
  eq("E6.18 อ่านรายการโปรดกลับมาได้", favs.map((f) => f.name).join(","), "ทริปสิมิลัน 3D2N + ค่าอุปกรณ์");
  eq("E6.19 รายการโปรดไม่รั่วข้ามระบบ", (await acc.getDocFavorites(tenantId, otherSystemId)).length, 0);

  // ── อนุมัติ ──
  console.log("\nE5 (ต่อ) อนุมัติเอกสาร:");
  const issued = await acc.issueDocument(tenantId, systemId, doc.id);
  assert("E5.12 อนุมัติร่างสำเร็จ", issued.ok === true, JSON.stringify(issued));
  const afterIssue = await prisma.accountDocument.findFirstOrThrow({ where: { id: doc.id }, select: { docNo: true, status: true, grandTotal: true } });
  assert("E5.13 อนุมัติแล้วได้เลขที่เอกสาร", !!afterIssue.docNo, `docNo = ${afterIssue.docNo}`);
  eq("E5.14 เลขที่เอกสารตรงกับที่พรีวิวไว้ตอนเป็นร่าง", afterIssue.docNo, preview1);
  eqAmt("E5.15 ยอดหลังอนุมัติยังเป็น 24,900.00", afterIssue.grandTotal, 2_490_000);
  const issueAgain = await acc.issueDocument(tenantId, systemId, doc.id);
  eq("E5.16 อนุมัติซ้ำไม่ได้ (เลขไม่ถูกกินซ้ำ)", issueAgain.ok, false);
  eq("E5.17 ออกเลขไปแล้ว 1 เลขเท่านั้น", (await prisma.accountDocSequence.findFirstOrThrow({ where: { systemId, docType: "INVOICE" } })).lastNo, 1);
  const draftMetaAfter = await acc.getDraftMeta(tenantId, systemId, doc.id, "INVOICE");
  assert("E5.18 เอกสารที่อนุมัติแล้วไม่ใช่ 'ร่าง' อีก (ฟอร์มต้องเด้งไปหน้าเอกสาร)", draftMetaAfter?.status !== "DRAFT", `status = ${draftMetaAfter?.status}`);

  // JV
  const entries = await prisma.accountJournalEntry.findMany({ where: { systemId, refId: doc.id }, include: { lines: { include: { account: { select: { code: true } } } } } });
  eq("E5.19 อนุมัติแล้วเกิดสมุดรายวัน 1 ชุด", entries.length, 1);
  const e0 = entries[0];
  const dr = e0?.lines.reduce((s, l) => s + l.debit, 0) ?? -1;
  const cr = e0?.lines.reduce((s, l) => s + l.credit, 0) ?? -2;
  eqAmt("E5.20 JV สมดุล: เดบิตรวม = 24,900.00", dr, 2_490_000);
  eqAmt("E5.21 JV สมดุล: เครดิตรวม = เดบิตรวม", cr, dr);
  const sideOf = (code: string, s: "dr" | "cr") => (e0?.lines ?? []).filter((l) => l.account.code === code).reduce((a, l) => a + (s === "dr" ? l.debit : l.credit), 0);
  eqAmt("E5.22 Dr ลูกหนี้การค้า 1100 = 24,900.00", sideOf("1100", "dr"), 2_490_000);
  // ใบแจ้งหนี้ยังไม่ใช่ใบกำกับ → VAT พักที่ 2205 (สินค้า) / 2210 (บริการ) แล้วย้ายเข้า 2200 ตอนออกใบกำกับ (QC5-A2)
  eqAmt("E5.23 Cr ภาษีขายรอเรียกเก็บ (2205+2210+2200) = 1,628.97", sideOf("2205", "cr") + sideOf("2210", "cr") + sideOf("2200", "cr"), 162_897);
  eqAmt("E5.24 Cr รายได้ (4000+4030) = 23,271.03", sideOf("4000", "cr") + sideOf("4030", "cr"), 2_327_103);

  // ═══════════ E7 — สิทธิ์ + ขอบเขต tenant/system ═══════════
  console.log("\nE7 สิทธิ์และขอบเขต:");
  const authOf = (m: typeof mOwner) => ({ user: { id: m.userId }, active: m });
  const denies = (m: typeof mOwner, action: string) => {
    try {
      assertAccountCan(authOf(m) as never, action);
      return false;
    } catch {
      return true;
    }
  };
  assert("E7.1 STAFF ไม่มีสิทธิ์ → บันทึกร่างไม่ได้ (account.doc.create)", denies(mStaff, "account.doc.create"));
  assert("E7.2 STAFF ไม่มีสิทธิ์ → อนุมัติไม่ได้ (account.doc.issue)", denies(mStaff, "account.doc.issue"));
  assert("E7.3 positive control: OWNER บันทึกร่าง + อนุมัติได้", !denies(mOwner, "account.doc.create") && !denies(mOwner, "account.doc.issue"));
  assert("E7.4 STAFF ที่ได้ account.doc.create เปิดฟอร์ม/บันทึกร่างได้", !denies(mClerk, "account.doc.create"));
  assert("E7.5 STAFF ที่ได้แค่ create ยังอนุมัติเองไม่ได้", denies(mClerk, "account.doc.issue"));

  eq("E7.6 เอกสารของระบบอื่น: getDraftMeta คืน null (แก้ไม่ได้)", await acc.getDraftMeta(tenantId, otherSystemId, doc.id, "INVOICE"), null);
  eq("E7.7 เอกสารคนละชนิด: getDraftMeta คืน null", await acc.getDraftMeta(tenantId, systemId, doc.id, "QUOTATION"), null);
  const foreignUpdate = await acc.updateDocument(tenantId, otherSystemId, doc.id, { lines: lineInputs });
  eq("E7.8 อัปเดตเอกสารข้ามระบบไม่สำเร็จ", foreignUpdate.ok, false);
  const foreignIssue = await acc.issueDocument(tenantId, otherSystemId, doc.id);
  eq("E7.9 อนุมัติเอกสารข้ามระบบไม่สำเร็จ", foreignIssue.ok, false);

  let refErr = "";
  try {
    await acc.assertEditorRefs(tenantId, systemId, { contactId: foreignContact.id });
  } catch (e) {
    refErr = e instanceof Error ? e.message : String(e);
  }
  assert("E7.10 เลือกผู้ติดต่อของอีกระบบ → ถูกปฏิเสธ (assertEditorRefs)", refErr.length > 0, "ไม่โยน error");
  let refOk = true;
  try {
    await acc.assertEditorRefs(tenantId, systemId, { contactId: customer.id, salesUserId: owner.id });
  } catch {
    refOk = false;
  }
  assert("E7.11 positive control: ผู้ติดต่อ/พนักงานขายของระบบนี้ผ่านด่าน", refOk);
  const pickerRows = await acc.searchContactPickerRows(tenantId, systemId, "ณัฐพล");
  eq("E7.12 ค้นหาผู้ติดต่อในฟอร์มเจอของระบบนี้", pickerRows.length, 1);
  eq("E7.13 ค้นหาผู้ติดต่อไม่เห็นของระบบอื่น", (await acc.searchContactPickerRows(tenantId, systemId, "สาขา 2")).length, 0);

  // ยกเลิกร่าง (ปุ่ม "ยกเลิก" ของฟอร์มเมื่อ autosave สร้างร่างไว้แล้ว)
  const draft2 = await acc.createDocument({ tenantId, systemId, docType: "QUOTATION", contactId: customer.id, lines: [{ description: "ร่างทิ้ง", qty: 1, unitPrice: 10_000 }], createdById: owner.id });
  eq("E7.14 ยกเลิกร่างสำเร็จ (ไม่ลบทิ้ง)", await acc.cancelDraft(tenantId, systemId, draft2.id), true);
  eq("E7.15 ร่างที่ยกเลิกเปลี่ยนสถานะเป็น CANCELLED (ยังอยู่ในระบบ)", (await prisma.accountDocument.findFirstOrThrow({ where: { id: draft2.id }, select: { status: true } })).status, "CANCELLED");
  eq("E7.16 ยกเลิกเอกสารที่ออกเลขแล้วผ่านทางนี้ไม่ได้", await acc.cancelDraft(tenantId, systemId, doc.id), false);
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

console.log(`\n===== สรุป: ผ่าน ${passed} · ไม่ผ่าน ${findings.length} =====`);
if (findings.length > 0) console.log(findings.map((f) => "  • " + f).join("\n"));
console.log(findings.length === 0 ? "🎉 WO 1.3 ผ่านทั้งหมด\n" : "⚠️ มีข้อไม่ผ่าน\n");
await prisma.$disconnect();
process.exit(findings.length === 0 ? 0 : 1);
