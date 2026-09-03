// QC WO 1.8 — "นำเข้า CSV" (เอกสาร/ผู้ติดต่อ/สินค้า) · DESIGN-SPEC-V2.md §8.5
// รัน (บังคับ DB QC branch):  QC_ENV_FILE=.env.qc pnpm tsx scripts/qc-acc-v2-import.mts
//
// 🔴 ความปลอดภัยข้อมูล: สคริปต์นี้ **สร้าง tenant ทิ้ง** แล้วลบทิ้งเมื่อจบ (ทุก query ผูก tenantId ของตัวเอง)
//    แต่ยังต้องชี้ DB QC เสมอ: ตั้ง QC_ENV_FILE=.env.qc — สคริปต์พิมพ์ไฟล์ env + โฮสต์ DB ให้ตรวจก่อนเริ่ม
//
// ทำไมไม่เรียก server action (previewImportAction/runImportAction) ตรง ๆ: action เริ่มด้วย
// loadAccountSystem→requireTenant() (อ่านคุกกี้ผ่าน next/headers) ซึ่งไม่มีนอก request context
// ⇒ ที่นี่เรียก `previewImportCore`/`runImportCore` (ชั้นที่ action เรียกจริงหลังผ่านด่านสิทธิ์แล้ว)
// + ตรวจ "สายไฟ" ของ action แบบ static (P0)
//
// ครอบคลุม (ดู ledger/wo-notes/1.8.md):
//   P0  สายไฟ+ทะเบียน: import-actions.ts ไม่แตะ prisma · ผ่าน assertAccountCan("account.import") ·
//       guard.ts ลงทะเบียนครบ 4 route · nav.ts 3 item เป็น "ready" ถูก href · ปุ่มนำเข้าที่ contacts/products/DocListPage เดินสาย
//   P1  เทมเพลต CSV: BOM + หัวคอลัมน์ตรง IMPORT_FIELDS ทั้ง 4 ชนิด
//   P2  ตัวแยก CSV: quote/comma/CRLF/ไทย + กัน CSV injection (neutralizeFormulaPrefix)
//   P3  จับคู่คอลัมน์อัตโนมัติ + applyMapping
//   P4  ตรวจแถว (รูปแบบ): เหตุผลไทยต่อกรณี (วันที่/ยอดติดลบ/จำนวน/ประเภทเอกสารไม่รู้จัก/ชื่อว่าง)
//   P5  จัดกลุ่มแถวเอกสารด้วย "เลขอ้างอิง"
//   P6  preview จริง (DB): 20 แถว 18 ok/2 err ตามเฉลย WO 1.8 · นับครบทุกแถวไม่ใช่แค่ 20
//   P7  นำเข้าจริง: สร้างร่าง source=IMPORT + tag + ยอดตรงกับคำนวณเอง (เทียบ computeDocTotals) · ข้ามแถวผิดตาม toggle
//   P8  idempotent: อัปโหลดไฟล์เดิมซ้ำ → ไม่สร้างซ้ำ (เอกสาร)
//   P9  ผู้ติดต่อ: dedupe เลขภาษี+สาขา / เบอร์โทร (normalize) — ซ้ำ = ข้าม ไม่ throw
//   P10 สินค้า: dedupe SKU · หน่วยไม่รู้จัก = เตือนแต่ยังสร้าง (ไม่ผูก unitId)
//   P11 ขอบเขต: แถวเกิน IMPORT_MAX_ROWS ถูกตัด · สิทธิ์ไม่มี account.import ถูกปฏิเสธ · ข้ามระบบไม่เห็นของกันเอง

// CI ไม่มีทั้ง `.env` และ `.env.qc` — env มาจาก DATABASE_URL/DIRECT_URL ที่ workflow export ไว้
// (process.loadEnvFile โยน ENOENT ถ้าไม่มีไฟล์ · และค่าที่ export มาก่อน "ชนะ" ไฟล์เสมอ — WO 0.7)
try { process.loadEnvFile?.(process.env.QC_ENV_FILE ?? ".env"); } catch { /* CI: ไม่มีไฟล์ env */ }

import { readFileSync, existsSync } from "node:fs";
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

const ROOT = process.cwd();
const envFile = process.env.QC_ENV_FILE ?? ".env";
const dbHost = (process.env.DATABASE_URL ?? "").replace(/^.*@/, "").split("/")[0] || "(ไม่พบ DATABASE_URL)";
console.log("\n===== QC WO 1.8 · นำเข้า CSV (§8.5) =====");
console.log(`[env] ไฟล์ ${envFile} · DB ${dbHost}\n`);

// ═══════════════════════════ P0 — สายไฟ + ทะเบียน (static) ═══════════════════════════
console.log("P0 สายไฟ/ทะเบียน (อ่านจากซอร์สจริง):");
{
  const src = readFileSync(join(ROOT, "src/lib/modules/account/import-actions.ts"), "utf8");
  assert("P0.1 import-actions.ts ไม่ import prisma ตรง ๆ (fitness F5)", !/from\s+["']@\/lib\/core\/db["']/.test(src));
  assert("P0.2 previewImportAction ผ่าน loadAccountSystem + assertAccountCan(\"account.import\")",
    /previewImportAction[\s\S]{0,300}loadAccountSystem\(/.test(src) && /previewImportAction[\s\S]{0,400}assertAccountCan\(auth, "account\.import"\)/.test(src));
  assert("P0.3 runImportAction ผ่าน loadAccountSystem + assertAccountCan(\"account.import\")",
    /runImportAction[\s\S]{0,300}loadAccountSystem\(/.test(src) && /runImportAction[\s\S]{0,400}assertAccountCan\(auth, "account\.import"\)/.test(src));
  assert("P0.4 import-shared.ts ไม่ import prisma/next (บริสุทธิ์ — ใช้ฝั่ง client ได้)",
    !/from\s+["']@\/lib\/core\/db["']/.test(readFileSync(join(ROOT, "src/lib/modules/account/import-shared.ts"), "utf8")));

  const { ACCOUNT_PAGE_PERMISSIONS } = await import("@/lib/modules/account/guard");
  const { PERMISSION_KEYS } = await import("@/lib/core/permissions");
  assert("P0.5 account.import อยู่ใน PERMISSION_KEYS", PERMISSION_KEYS.has("account.import"));
  for (const rel of ["import/documents/page.tsx", "import/contacts/page.tsx", "import/products/page.tsx", "import/template/route.ts"]) {
    eq(`P0.6 ทะเบียนสิทธิ์ ${rel} = account.import`, ACCOUNT_PAGE_PERMISSIONS[rel], "account.import");
    assert(`P0.7 มีไฟล์ route ${rel}`, existsSync(join(ROOT, "src/app/app/sys/[id]/account", rel)));
  }

  const { ACCOUNT_NAV } = await import("@/lib/modules/account/nav");
  const nav = ACCOUNT_NAV("/app/sys/TEST/account", true);
  const byTestId = (id: string) => nav.flatMap((g) => g.items).find((i) => i.testId === id);
  const rev = byTestId("REVENUE_IMPORT");
  const exp = byTestId("EXPENSE_IMPORT");
  const prod = byTestId("PRODUCTS_IMPORT");
  eq("P0.8 นำเข้าเอกสารรายรับ = ready", rev?.status, "ready");
  eq("P0.9 นำเข้าเอกสารรายรับ href", rev?.href, "/app/sys/TEST/account/import/documents?side=revenue");
  eq("P0.10 นำเข้าเอกสารรายจ่าย = ready", exp?.status, "ready");
  eq("P0.11 นำเข้าเอกสารรายจ่าย href", exp?.href, "/app/sys/TEST/account/import/documents?side=expense");
  eq("P0.12 นำเข้าสินค้า = ready", prod?.status, "ready");
  eq("P0.13 นำเข้าสินค้า href", prod?.href, "/app/sys/TEST/account/import/products");

  const listSrc = readFileSync(join(ROOT, "src/app/app/sys/[id]/account/docs/[docType]/page.tsx"), "utf8");
  assert("P0.14 หน้ารายการรายรับส่ง importHref ไป DocListPage", listSrc.includes("import/documents?side=revenue"));
  const expPageSrc = readFileSync(join(ROOT, "src/lib/modules/account/expense-page.tsx"), "utf8");
  assert("P0.15 หน้ารายการรายจ่ายส่ง importHref ไป DocListPage", expPageSrc.includes("import/documents?side=expense"));
  // 🔴 ข้อสอบเน่า (เจอตอน WO 3.4 · ไม่ใช่ของใหม่ — แดงมาตั้งแต่ WO 3.2): WO 3.2 ย้ายเนื้อหาหน้าผู้ติดต่อ
  //    ออกจาก route file ไปที่ `contacts-ui.tsx` (route เหลือแค่เรียก ContactsPage) ⇒ ปุ่ม "นำเข้า" ยังมีจริง
  //    แต่สตริงย้ายไฟล์ · ตรวจที่ไฟล์ที่โค้ดอยู่จริงแทน (ไม่ได้ลดทอน — ยังยืนยันว่าปุ่มชี้ import/contacts)
  const contactsSrc = readFileSync(join(ROOT, "src/lib/modules/account/contacts-ui.tsx"), "utf8");
  assert("P0.16 หน้าผู้ติดต่อมีปุ่มนำเข้าผู้ติดต่อ", contactsSrc.includes("import/contacts"));
  const productsSrc = readFileSync(join(ROOT, "src/app/app/sys/[id]/account/products/page.tsx"), "utf8");
  assert("P0.17 หน้าสินค้ามีปุ่มนำเข้าสินค้า", productsSrc.includes("import/products"));
  const dlpSrc = readFileSync(join(ROOT, "src/components/account-v2/DocListPage.tsx"), "utf8");
  assert("P0.18 DocListPage ปุ่ม \"นำเข้า\" ผูก importHref (ไม่ hardcode จาง)", /HeaderActionButton label="นำเข้า" href=\{importHref\}/.test(dlpSrc));
}

// ═══════════════════════════ imports (pure — โหลดครั้งเดียวใช้ทุกส่วนถัดไป) ═══════════════════════════
const IS = await import("@/lib/modules/account/import-shared");
const IA = await import("@/lib/modules/account/import-actions");

// ═══════════════════════════ P1 — เทมเพลต CSV ═══════════════════════════
console.log("\nP1 เทมเพลต CSV (BOM + หัวคอลัมน์):");
{
  for (const kind of ["documents_revenue", "documents_expense", "contacts", "products"] as const) {
    const csv = IS.buildTemplateCsv(kind);
    assert(`P1 [${kind}] ขึ้นต้นด้วย BOM UTF-8`, csv.charCodeAt(0) === 0xfeff);
    const firstLine = csv.slice(1).split("\n")[0];
    const expectedHeader = IS.IMPORT_FIELDS[kind].map((f) => f.aliases[0]).join(",");
    eq(`P1 [${kind}] หัวคอลัมน์ตรง IMPORT_FIELDS`, firstLine, expectedHeader);
    assert(`P1 [${kind}] มีตัวอย่าง ≥2 แถว`, csv.trim().split("\n").length >= 3);
    assert(`P1 [${kind}] ชื่อไฟล์ลงท้าย .csv`, IS.templateFilename(kind).endsWith(".csv"));
  }
}

// ═══════════════════════════ P2 — ตัวแยก CSV + กัน injection ═══════════════════════════
console.log("\nP2 ตัวแยก CSV (quote/comma/CRLF/ไทย) + กัน CSV injection:");
{
  const t1 = IS.parseImportCsv('ชื่อ,รายละเอียด\r\n"บริษัท เอ, บี จำกัด","มี ""คำพูด"" ในนี้"\r\nสอง,ปกติ\r\n');
  eq("P2.1 หัวคอลัมน์ไทยอ่านถูก (CRLF)", t1.headers.join("|"), "ชื่อ|รายละเอียด");
  eq("P2.2 field มีคอมมาในเครื่องหมายคำพูดไม่แตกคอลัมน์", t1.rows[0]?.[0], "บริษัท เอ, บี จำกัด");
  eq("P2.3 quote ซ้อน (\"\") แปลงเป็น \" เดี่ยว", t1.rows[0]?.[1], 'มี "คำพูด" ในนี้');
  eq("P2.4 แถวที่สองอ่านถูกหลัง CRLF", t1.rows[1]?.join(","), "สอง,ปกติ");

  const t2 = IS.parseImportCsv('a,b\n"บรรทัด1\nบรรทัด2",x\n');
  eq("P2.5 ขึ้นบรรทัดใหม่ในเครื่องหมายคำพูด ยังเป็น field เดียว", t2.rows[0]?.[0], "บรรทัด1\nบรรทัด2");

  eq("P2.6 neutralizeFormulaPrefix เติม ' หน้า =สูตร", IS.neutralizeFormulaPrefix("=SUM(A1:A9)"), "'=SUM(A1:A9)");
  eq("P2.7 neutralizeFormulaPrefix เติม ' หน้า +เลข", IS.neutralizeFormulaPrefix("+66812345678"), "'+66812345678");
  eq("P2.8 neutralizeFormulaPrefix เติม ' หน้า @เมนชัน", IS.neutralizeFormulaPrefix("@cmd"), "'@cmd");
  eq("P2.9 ข้อความปกติไม่ถูกแตะ", IS.neutralizeFormulaPrefix("บริษัท ทดสอบ จำกัด"), "บริษัท ทดสอบ จำกัด");
  assert("P2.10 เทมเพลตจริงไม่มี cell ที่ยังเป็นสูตรดิบ (ไม่มี ,= ต้นบรรทัดไม่ escape)",
    !/(^|,)=/m.test(IS.buildTemplateCsv("documents_revenue").replace(/"[^"]*"/g, "")));
}

// ═══════════════════════════ P3 — จับคู่คอลัมน์ ═══════════════════════════
console.log("\nP3 จับคู่คอลัมน์อัตโนมัติ + applyMapping:");
{
  const csv = IS.buildTemplateCsv("documents_revenue");
  const table = IS.parseImportCsv(csv);
  const mapping = IS.autoMatchColumns(table.headers, "documents_revenue");
  eq("P3.1 auto-match เจอ 'เลขอ้างอิง'", mapping.ref, 0);
  eq("P3.2 auto-match เจอ 'วันที่'", table.headers[mapping.date], "วันที่");
  const mapEn = IS.autoMatchColumns(["ref", "Date", "Contact", "Item", "Qty", "Unit Price"], "documents_revenue");
  assert("P3.3 auto-match คำพ้องอังกฤษ (ref/date) ก็จับคู่ได้", mapEn.ref === 0 && mapEn.date === 1);
  const mapped = IS.applyMapping(table, "documents_revenue", mapping);
  eq("P3.4 applyMapping ได้ค่าตรงแถวตัวอย่างแรก", mapped[0]?.ref, "REF-001");
  eq("P3.5 คอลัมน์ไม่ได้จับคู่ (-1) ได้ค่าว่าง", IS.applyMapping(table, "documents_revenue", { ...mapping, note: -1 })[0]?.note ?? "", "");
}

// ═══════════════════════════ P4 — ตรวจแถว (รูปแบบ) ═══════════════════════════
console.log("\nP4 ตรวจแถว (เหตุผลไทยต่อกรณี):");
{
  const base = { ref: "R1", docType: "IV", date: "2026-09-01", contactName: "ลูกค้า A", contactTaxId: "", itemName: "สินค้า", qty: "1", unit: "ชิ้น", unitPrice: "100", discount: "0", vatRate: "7", note: "" };
  eq("P4.1 แถวปกติ = ok", IS.validateDocRowFormat("revenue", base).status, "ok");
  assert("P4.2 วันที่ผิดรูปแบบ (2026/09/01) = err + เหตุผลบอกวันที่", IS.validateDocRowFormat("revenue", { ...base, date: "2026/09/01" }).status === "err" && IS.validateDocRowFormat("revenue", { ...base, date: "2026/09/01" }).reasons.some((r) => r.includes("วันที่")));
  assert("P4.3 ราคาต่อหน่วยติดลบ = err ยอดติดลบ", IS.validateDocRowFormat("revenue", { ...base, unitPrice: "-50" }).reasons.includes("ยอดติดลบ"));
  assert("P4.4 ส่วนลดติดลบ = err ยอดติดลบ", IS.validateDocRowFormat("revenue", { ...base, discount: "-1" }).status === "err");
  assert("P4.5 จำนวน 0 = err", IS.validateDocRowFormat("revenue", { ...base, qty: "0" }).status === "err");
  assert("P4.6 ไม่มีชื่อผู้ติดต่อ = err", IS.validateDocRowFormat("revenue", { ...base, contactName: "" }).status === "err");
  assert("P4.7 ประเภทเอกสารไม่รู้จัก = warn ไม่ใช่ err", IS.validateDocRowFormat("revenue", { ...base, docType: "XX" }).status === "warn");
  eq("P4.8 ผู้ขาย: ไม่มีชื่อผู้ขาย = err (ฝั่งรายจ่าย)", IS.validateDocRowFormat("expense", { ...base, contactName: "" }).status, "err");

  assert("P4.9 ผู้ติดต่อ: ไม่มีชื่อ = err", IS.validateContactRowFormat({ name: "", kind: "", taxId: "", branchCode: "", phone: "", email: "", address: "", creditTermDays: "" }).status === "err");
  assert("P4.10 ผู้ติดต่อ: เครดิตติดลบ = err ยอดติดลบ", IS.validateContactRowFormat({ name: "A", kind: "", taxId: "", branchCode: "", phone: "", email: "", address: "", creditTermDays: "-5" }).reasons.includes("ยอดติดลบ"));
  assert("P4.11 ผู้ติดต่อ: เลขภาษีไม่ครบ 13 หลัก = warn", IS.validateContactRowFormat({ name: "A", kind: "", taxId: "123", branchCode: "", phone: "", email: "", address: "", creditTermDays: "" }).status === "warn");

  assert("P4.12 สินค้า: ไม่มีชื่อ = err", IS.validateProductRowFormat({ name: "", sku: "", type: "", unit: "", salePrice: "", buyPrice: "", vatRate: "" }).status === "err");
  assert("P4.13 สินค้า: ราคาขายติดลบ = err ยอดติดลบ", IS.validateProductRowFormat({ name: "A", sku: "", type: "", unit: "", salePrice: "-1", buyPrice: "", vatRate: "" }).reasons.includes("ยอดติดลบ"));

  eq("P4.14 resolveDocType: IV → INVOICE", IS.resolveDocType("revenue", "IV").docType, "INVOICE");
  eq("P4.15 resolveDocType: ว่าง → INVOICE (ไม่เตือน)", IS.resolveDocType("revenue", "").recognized, true);
  eq("P4.16 resolveDocType: PUR → PURCHASE (ฝั่งจ่าย)", IS.resolveDocType("expense", "PUR").docType, "PURCHASE");
  eq("P4.17 resolveDocType: EXP → EXPENSE", IS.resolveDocType("expense", "EXP").docType, "EXPENSE");
  eq("P4.18 resolveDocType: ค่าไม่รู้จัก → default + recognized=false", IS.resolveDocType("revenue", "ZZZ").recognized, false);
}

// ═══════════════════════════ P5 — จัดกลุ่มแถวเอกสาร ═══════════════════════════
console.log("\nP5 จัดกลุ่มแถวเอกสารด้วยเลขอ้างอิง:");
{
  const rows = [{ ref: "A" }, { ref: "A" }, { ref: "" }, { ref: "B" }, { ref: "" }];
  const groups = IS.groupDocRows(rows);
  eq("P5.1 เลขอ้างอิงเดียวกันรวมกลุ่มเดียว", groups.find((g) => g.key === "A")?.rowIndexes.join(","), "0,1");
  eq("P5.2 เลขอ้างอิงว่าง = เอกสารของตัวเอง (ไม่รวมกัน)", groups.filter((g) => g.rowIndexes.length === 1 && (g.key === "__row_2" || g.key === "__row_4")).length, 2);
  eq("P5.3 จำนวนกลุ่มรวม = 4 (A, B, แถว2, แถว4)", groups.length, 4);
}

// ═══════════════════════════ P6-P11 — DB (seed tenant ทิ้ง) ═══════════════════════════
const sysMod = await import("@/lib/modules/system/service");
const acc = await import("@/lib/modules/account/service");
const gl = await import("@/lib/modules/account/gl");
const { assertAccountCan } = await import("@/lib/modules/account/access");
const { prisma } = await import("@/lib/core/db");

const tag = "QCACC18-" + Date.now();
let tenantId = "";
const userIds: string[] = [];

function csvOf(headers: string[], rows: string[][]): string {
  return "﻿" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n") + "\n";
}

try {
  const t = await prisma.tenant.create({ data: { name: tag, slug: tag.toLowerCase() } });
  tenantId = t.id;
  const owner = await prisma.user.create({ data: { email: tag.toLowerCase() + "-owner@qc.local", name: "QC เจ้าของ" } });
  const staff = await prisma.user.create({ data: { email: tag.toLowerCase() + "-staff@qc.local", name: "QC พนักงาน" } });
  userIds.push(owner.id, staff.id);
  const mOwner = await prisma.membership.create({ data: { userId: owner.id, tenantId, role: "OWNER", unitAccess: ["*"] }, include: { tenant: true } });
  const mStaff = await prisma.membership.create({ data: { userId: staff.id, tenantId, role: "STAFF", unitAccess: ["*"], permissions: {} }, include: { tenant: true } });

  const s1 = await sysMod.createSystem(tenantId, "ACCOUNT", "บัญชี " + tag);
  const s2 = await sysMod.createSystem(tenantId, "ACCOUNT", "บัญชีอีกร้าน " + tag);
  const systemId = s1.id;
  const otherSystemId = s2.id;
  console.log(`\n[seed] tenant ${tenantId} · system ${systemId}\n`);

  await acc.saveSettings(tenantId, systemId, { orgName: "ร้าน QC 1.8", vatRegistered: true, vatRateBp: 700, taxPointBasis: "ON_ISSUE" });
  await acc.saveSettings(tenantId, otherSystemId, { orgName: "อีกร้าน", vatRegistered: true, vatRateBp: 700 });
  await gl.ensureAccounting({ tenantId, systemId });
  await gl.ensureAccounting({ tenantId, systemId: otherSystemId });

  // ── P6/P7/P8: เอกสารรายรับ 20 แถว (18 ok + 2 err: วันที่ผิด/ยอดติดลบ) ──
  console.log("P6 preview เอกสาร 20 แถว (เฉลย WO 1.8: 18 ok · 2 err):");
  const docHeaders = IS.IMPORT_FIELDS.documents_revenue.map((f) => f.aliases[0]);
  const docRows: string[][] = [];
  for (let i = 1; i <= 18; i++) {
    docRows.push([`REF-${i}`, "IV", "2026-09-01", `ลูกค้า QC ${i}`, "", `สินค้า ${i}`, "1", "ชิ้น", "100", "0", "7", ""]);
  }
  docRows.push(["REF-BAD-DATE", "IV", "01-09-2026", "ลูกค้า QC วันที่ผิด", "", "สินค้า", "1", "ชิ้น", "100", "0", "7", ""]);
  docRows.push(["REF-NEG", "IV", "2026-09-01", "ลูกค้า QC ยอดลบ", "", "สินค้า", "1", "ชิ้น", "-100", "0", "7", ""]);
  const docCsv = csvOf(docHeaders, docRows);

  const pv = await IA.previewImportCore(tenantId, systemId, "documents_revenue", docCsv);
  assert("P6.1 preview สำเร็จ", pv.ok, pv.ok ? "" : pv.reason);
  if (pv.ok) {
    eq("P6.2 totalRows = 20", pv.totalRows, 20);
    // ผู้ติดต่อทั้ง 18 รายเป็นรายใหม่ (tenant เพิ่งสร้าง) → ทุกแถวถูกเตือน "ผู้ติดต่อไม่พบ (จะสร้างใหม่)" (ok เลื่อนเป็น warn)
    // ตัวเลข "18 ร่าง" ตามเฉลย WO 1.8 คือจำนวนที่ *นำเข้าได้* (ok+warn) ไม่ใช่นับเฉพาะ "ok" เขียวล้วน
    eq("P6.3 นับ ok+warn = 18 · err = 2 (เฉลย WO 1.8: นำเข้าได้ 18 · ผิดพลาด 2)", pv.counts.ok + pv.counts.warn, 18);
    eq("P6.4 นับ err = 2 (เฉลย WO 1.8)", pv.counts.err, 2);
    assert("P6.3b ทุกแถวนำเข้าได้ถูกเตือน 'ผู้ติดต่อไม่พบ' (ยังไม่มีผู้ติดต่อในระบบ)", pv.counts.warn === 18);
    eq("P6.5 previewRows ส่งกลับแค่ 20 แถวแรก (IMPORT_PREVIEW_ROWS)", pv.previewRows.length, 20);
    const badDateRow = pv.previewRows[18];
    const negRow = pv.previewRows[19];
    assert("P6.6 แถววันที่ผิด ชี้เหตุผล 'วันที่ผิดรูปแบบ'", badDateRow?.status === "err" && badDateRow.reasons.some((r) => r.includes("วันที่")));
    assert("P6.7 แถวยอดติดลบ ชี้เหตุผล 'ยอดติดลบ'", negRow?.status === "err" && negRow.reasons.includes("ยอดติดลบ"));
  }

  console.log("\nP7 นำเข้าจริง (ข้ามแถวผิดพลาด → 18 ร่าง):");
  const run1 = await IA.runImportCore(tenantId, systemId, owner.id, "documents_revenue", docCsv, IS.autoMatchColumns(IS.parseImportCsv(docCsv).headers, "documents_revenue"), true);
  assert("P7.1 นำเข้าสำเร็จ", run1.ok, run1.ok ? "" : run1.reason);
  if (run1.ok) {
    eq("P7.2 สร้าง 18 ร่าง (เฉลย WO 1.8)", run1.created, 18);
    eq("P7.3 ผิดพลาด 2 แถว ชี้บรรทัด", run1.errors.length, 2);
    assert("P7.4 tag รูปแบบ 'นำเข้า YYYY-MM-DD'", /^นำเข้า \d{4}-\d{2}-\d{2}$/.test(run1.tag));

    const drafts = await prisma.accountDocument.findMany({ where: { tenantId, systemId, source: "IMPORT" }, include: { lines: true } });
    eq("P7.5 เอกสารที่สร้างจริงในระบบ = 18 ใบ", drafts.length, 18);
    assert("P7.6 ทุกใบเป็น DRAFT (ไม่ approve เอง)", drafts.every((d) => d.status === "DRAFT"));
    assert("P7.7 ทุกใบติดแท็กของรอบนี้", drafts.every((d) => d.tags.includes(run1.tag)));
    const d1 = drafts.find((d) => d.refId?.endsWith(":REF-1"));
    assert("P7.8 พบใบของ REF-1 (idempotency key ผูก refId)", !!d1);
    if (d1) {
      eq("P7.9 ยอดรวม REF-1 = 100.00 + VAT 7% = 107.00 บาท (คำนวณเอง — เทียบ computeDocTotals)", d1.grandTotal, 10700);
      eq("P7.10 subTotal ตรงราคา×จำนวน", d1.subTotal, 10000);
      assert("P7.11 ผู้ติดต่อถูกสร้างให้อัตโนมัติ (ผู้ติดต่อไม่พบ → will create)", !!d1.contactId);
    }
  }

  console.log("\nP8 idempotent (อัปโหลดไฟล์เดิมซ้ำ):");
  const run2 = await IA.runImportCore(tenantId, systemId, owner.id, "documents_revenue", docCsv, IS.autoMatchColumns(IS.parseImportCsv(docCsv).headers, "documents_revenue"), true);
  if (run2.ok) {
    eq("P8.1 ไฟล์เดิมซ้ำ → สร้างใหม่ 0 ใบ", run2.created, 0);
    // skipped รวม 2 ทาง: 18 กลุ่มซ้ำ refId (นำเข้าไปแล้ว) + 2 กลุ่ม err เดิม (ยังผิดพลาดเหมือนเดิม + skipErrorRows=true → นับข้ามซ้ำ)
    eq("P8.2 ข้ามครบ 20 (18 ซ้ำ refId + 2 err เดิมที่ข้ามอีกรอบ)", run2.skipped, 20);
  } else {
    bad("P8 idempotent re-run", run2.reason);
  }
  const totalDocsAfter = await prisma.accountDocument.count({ where: { tenantId, systemId, source: "IMPORT" } });
  eq("P8.3 จำนวนเอกสารในระบบไม่เพิ่มหลังนำเข้าไฟล์เดิมซ้ำ", totalDocsAfter, 18);

  // ── P9: ผู้ติดต่อ — dedupe เลขภาษี + เบอร์โทร ──
  console.log("\nP9 นำเข้าผู้ติดต่อ (dedupe เลขภาษี/เบอร์โทร):");
  const existingContact = await acc.createContact({ tenantId, systemId, kind: "CUSTOMER", name: "ผู้ติดต่อเดิม", taxId: "0105561000099", phone: "0812223333" });
  const contactHeaders = IS.IMPORT_FIELDS.contacts.map((f) => f.aliases[0]);
  const contactCsv = csvOf(contactHeaders, [
    ["บริษัท ใหม่ จำกัด", "ลูกค้า", "0105561000001", "00000", "0899998888", "new@qc.local", "ที่อยู่", "0"],
    ["ผู้ติดต่อชื่อซ้ำเลขภาษี", "ลูกค้า", "0105561000099", "00000", "", "", "", "0"], // เลขภาษีชนกับที่มีอยู่แล้ว
    ["เบอร์ซ้ำของเดิม", "ลูกค้า", "", "00000", "081-222-3333", "", "", "0"], // เบอร์ normalize แล้วชนกับที่มีอยู่แล้ว
  ]);
  const cRun = await IA.runImportCore(tenantId, systemId, owner.id, "contacts", contactCsv, IS.autoMatchColumns(IS.parseImportCsv(contactCsv).headers, "contacts"), true);
  assert("P9.1 นำเข้าผู้ติดต่อสำเร็จ", cRun.ok, cRun.ok ? "" : cRun.reason);
  if (cRun.ok) {
    eq("P9.2 สร้างได้ 1 ราย (รายใหม่จริง)", cRun.created, 1);
    eq("P9.3 ข้าม 2 ราย (เลขภาษีซ้ำ + เบอร์ normalize ซ้ำ)", cRun.skipped, 2);
  }
  const createdContact = await prisma.accountContact.findFirst({ where: { tenantId, systemId, taxId: "0105561000001" } });
  assert("P9.4 ผู้ติดต่อใหม่ถูกสร้างจริงพร้อมเลขภาษี", !!createdContact);
  const dupCount = await prisma.accountContact.count({ where: { tenantId, systemId, taxId: "0105561000099" } });
  eq("P9.5 ไม่มีผู้ติดต่อเลขภาษีซ้ำเกิดขึ้นใหม่ (ยังมีแค่ 1 ราย)", dupCount, 1);
  void existingContact;

  // ── P10: สินค้า — dedupe SKU + หน่วยไม่รู้จัก ──
  console.log("\nP10 นำเข้าสินค้า (dedupe SKU + หน่วยไม่รู้จัก):");
  const productHeaders = IS.IMPORT_FIELDS.products.map((f) => f.aliases[0]);
  const productCsv = csvOf(productHeaders, [
    ["สินค้าที่ 1", "SKU-QC-1", "สินค้า", "หน่วยประหลาด", "100", "50", "7"], // หน่วยไม่มีในระบบ
    ["สินค้าที่ 2 SKU ซ้ำ", "SKU-QC-1", "สินค้า", "", "200", "", "7"], // sku ซ้ำในไฟล์เดียวกัน
  ]);
  const pRun = await IA.runImportCore(tenantId, systemId, owner.id, "products", productCsv, IS.autoMatchColumns(IS.parseImportCsv(productCsv).headers, "products"), true);
  assert("P10.1 นำเข้าสินค้าสำเร็จ", pRun.ok, pRun.ok ? "" : pRun.reason);
  if (pRun.ok) {
    eq("P10.2 สร้างได้ 1 รายการ (แถวที่สอง sku ซ้ำถูกข้าม)", pRun.created, 1);
    eq("P10.3 ข้าม 1 รายการ (sku ซ้ำในไฟล์)", pRun.skipped, 1);
  }
  const createdProduct = await prisma.accountProduct.findFirst({ where: { tenantId, systemId, sku: "SKU-QC-1" } });
  assert("P10.4 สินค้าถูกสร้างจริงแม้หน่วยไม่รู้จัก", !!createdProduct);
  eq("P10.5 หน่วยไม่รู้จัก → unitId ว่าง (ไม่ผูกมั่ว)", createdProduct?.unitId ?? null, null);

  const pvProd = await IA.previewImportCore(tenantId, systemId, "products", productCsv);
  if (pvProd.ok) {
    assert("P10.6 preview เตือน 'หน่วยไม่รู้จัก' แถวแรก", pvProd.previewRows[0]?.reasons.some((r) => r.includes("หน่วยไม่รู้จัก")));
  }

  // ── P11: ขอบเขต — สิทธิ์ / cap แถว / ข้ามระบบ ──
  console.log("\nP11 ขอบเขต (สิทธิ์ · จำกัดแถว · ข้ามระบบ):");
  const authOf = (m: typeof mOwner) => ({ user: { id: m.userId }, active: m });
  const denies = (m: typeof mOwner, action: string) => {
    try {
      assertAccountCan(authOf(m) as never, action);
      return false;
    } catch {
      return true;
    }
  };
  assert("P11.1 STAFF ไม่มีสิทธิ์ account.import ถูกปฏิเสธ", denies(mStaff, "account.import"));
  assert("P11.2 OWNER ผ่าน account.import", !denies(mOwner, "account.import"));

  const bigRows: string[][] = [];
  for (let i = 0; i < IS.IMPORT_MAX_ROWS + 50; i++) bigRows.push([`ผู้ติดต่อเกินโควตา ${i}`, "ลูกค้า", "", "", "", "", "", "0"]);
  const bigCsv = csvOf(contactHeaders, bigRows);
  const pvBig = await IA.previewImportCore(tenantId, systemId, "contacts", bigCsv);
  assert("P11.3 แถวเกิน IMPORT_MAX_ROWS ถูกตัดที่ totalRows", pvBig.ok && pvBig.totalRows === IS.IMPORT_MAX_ROWS, pvBig.ok ? String(pvBig.totalRows) : String(pvBig.reason));

  // ข้ามระบบ: อีกระบบ (otherSystemId) ต้องไม่เห็นเอกสาร/ผู้ติดต่อของระบบนี้ (idempotency/dedupe ผูก systemId)
  const otherRun = await IA.runImportCore(tenantId, otherSystemId, owner.id, "documents_revenue", docCsv, IS.autoMatchColumns(IS.parseImportCsv(docCsv).headers, "documents_revenue"), true);
  assert("P11.4 นำเข้าไฟล์เดิมในระบบอื่นสำเร็จ (ไม่ติด idempotency ข้ามระบบ)", otherRun.ok && otherRun.created === 18, otherRun.ok ? `created=${otherRun.created}` : otherRun.reason);
  const crossCheck = await prisma.accountDocument.count({ where: { tenantId, systemId: otherSystemId, source: "IMPORT" } });
  eq("P11.5 เอกสารของอีกระบบแยกจากระบบแรก (ไม่รวม/ไม่รั่ว)", crossCheck, 18);
} finally {
  const del = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      console.log(`  ⚠ cleanup: ${e instanceof Error ? e.message.split("\n")[0] : e}`);
    }
  };
  if (tenantId) {
    await del(() => prisma.accountDocumentPayment.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountDocumentRelation.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountDocumentLine.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountDocument.updateMany({ where: { tenantId }, data: { sourceDocId: null, replacedById: null, sourcePaymentId: null } }));
    await del(() => prisma.accountAttachment.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountDocument.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountDocSequence.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountMapping.deleteMany({ where: { tenantId } }));
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

console.log(`\n===== สรุป WO 1.8: ผ่าน ${passed} · ไม่ผ่าน ${findings.length} =====`);
if (findings.length > 0) console.log(findings.map((f) => "  • " + f).join("\n"));
console.log(findings.length === 0 ? "🎉 WO 1.8 ผ่านทั้งหมด\n" : "⚠️ มีข้อไม่ผ่าน\n");
process.exit(findings.length === 0 ? 0 : 1);
