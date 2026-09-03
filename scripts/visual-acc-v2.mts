// ถ่ายภาพหน้าจอจริงของงานบัญชี V2 — เดสก์ท็อป 1440×900 + มือถือ 390×844 (fullPage)
//
// ใช้:
//   bash scripts/acc-v2-serve.sh                       # ต้องมีเซิร์ฟเวอร์ก่อน (production build)
//   pnpm exec tsx scripts/visual-acc-v2.mts 0.1        # ถ่ายหน้าของ WO 0.1
//   pnpm exec tsx scripts/visual-acc-v2.mts 0.1 --assert   # + อ่านตัวเลขจาก data-testid มาเทียบเฉลย
//   bash scripts/acc-v2-serve.sh stop
//
// 🔴 ชื่อไฟล์จงใจไม่ขึ้นต้นด้วย `qc-` — ชุดนี้ต้องมี build + เซิร์ฟเวอร์ + chromium ซึ่ง CI ไม่มี
//    (บทเรียน 31 ส.ค.: ตั้งชื่อ qc-* แล้ว qc:all แดงถาวร)
// 🔴 session ที่ mint ต้องถูกลบทิ้งเสมอ — ปักธง userAgent = "qc-visual-acc-v2"
// 🔴 ชื่อคุกกี้ผูกกับ APP_ENV: dev/http = `shark_session` · https = `__Host-shark_session`

import { mkdirSync, readFileSync, existsSync } from "node:fs";
// tsconfig ไม่ได้เปิด allowImportingTsExtensions → import แบบ static ที่ลงท้าย .mts จะ typecheck ไม่ผ่าน
// ⇒ โหลดแบบ dynamic (tsx resolve ตอนรันได้ปกติ) แล้วประกาศชนิดไว้เอง
const accEnv = (await import("./acc-v2-env.mts" as string)) as {
  loadQcEnv: () => { databaseUrl: string; host: string };
  QC: {
    tenantName: string;
    tenantSlug: string;
    ownerEmail: string;
    ownerName: string;
    expectedPath: string;
    shotsDir: string;
    today: string;
    oracleValidUntil: string;
  };
};
const { loadQcEnv, QC } = accEnv;

loadQcEnv();

const WO = (process.argv[2] ?? "0.1").replace(/^-+/, "");
const ASSERT = process.argv.includes("--assert");
const BASE = process.env.QC_BASE ?? "http://127.0.0.1:3215";

if (!existsSync(QC.expectedPath)) {
  console.error(`❌ ไม่พบเฉลย ${QC.expectedPath} — รัน seed ก่อน`);
  process.exit(2);
}
const E = JSON.parse(readFileSync(QC.expectedPath, "utf8"));
const SYS: string = E.systemId;

// ─────────── fixture ของ WO 1.3: "ร่าง" ใบแจ้งหนี้คุณณัฐพล 3 บรรทัดตาม g1 ───────────
// ต้องมีร่างจริงในฐานข้อมูล ภาพหน้า `/edit` ถึงจะมีตัวเลขให้ดู (ฟอร์มเปล่าพิสูจน์อะไรไม่ได้)
// สร้างผ่าน `createDocument` **ตัวเดียวกับที่ saveDraftAction เรียก** → ตัวเลขบนจอ = ตัวเลขที่ระบบคิดจริง
// สร้างใหม่ทุกครั้งที่ถ่าย แล้วลบทิ้งใน finally — DB QC กลับสภาพเดิมเป๊ะหลังรัน
// 🔴 ร่างนี้เป็น "ของชั่วคราวของกล้อง" — ต้องลบทิ้งเสมอเมื่อถ่ายเสร็จ ไม่งั้นตัวนับแท็บของ WO 1.1
//    (เฉลย acc-v2-expected.json: IV ทั้งหมด 51 · ร่าง 3) จะเพี้ยนไป 1 ใบ แล้ว qc-acc-v2-list ตกทันที
const FIXTURE_REF = "QC-VISUAL-1.3";
let fixtureDraftId = "";
let cleanupFixture: (() => Promise<void>) | null = null;
if (WO === "1.3") {
  const { prisma: db } = await import("@/lib/core/db");
  cleanupFixture = async () => {
    const stale = await db.accountDocument.findMany({
      where: { systemId: SYS, docType: "INVOICE", status: "DRAFT", reference: FIXTURE_REF },
      select: { id: true },
    });
    if (stale.length === 0) return;
    const ids = stale.map((d) => d.id);
    await db.accountDocumentLine.deleteMany({ where: { documentId: { in: ids } } });
    await db.accountAttachment.deleteMany({ where: { documentId: { in: ids } } });
    await db.accountDocument.deleteMany({ where: { id: { in: ids } } });
    console.log(`ลบร่าง fixture ของ WO 1.3 ${ids.length} ใบ (ตัวนับแท็บกลับเท่าเฉลย)`);
  };
  await cleanupFixture(); // กันซากจากรอบที่ล้มกลางคัน
  const svc = await import("@/lib/modules/account/service");
  {
    const totals = svc.computeDocTotals({
      lines: [
        { qty: 2, unitPriceSatang: 990_000, vatRateBp: 700, whtRateBp: 300 },
        { qty: 2, unitPriceSatang: 120_000, vatRateBp: 700 },
        { qty: 1, unitPriceSatang: 107_103, vatRateBp: 700 },
      ],
      priceMode: "EXCL_VAT",
      vatRegistered: true,
      vatRateBp: 700,
    });
    const draft = await svc.createDocument({
      tenantId: E.tenantId,
      systemId: SYS,
      docType: "INVOICE",
      contactId: E.fixtures.contactNattapholId,
      issueDate: new Date(`${QC.today}T00:00:00.000Z`),
      dueDate: new Date("2026-10-14T00:00:00.000Z"),
      vatMode: totals.vatMode,
      vatTiming: "ON_ISSUE",
      lines: [
        { description: "ทริปสิมิลัน 3 วัน 2 คืน\nรวมอาหาร 6 มื้อ + ที่พักบนเรือ 2 คืน", qty: 2, unitName: "คน", unitPrice: 990_000, vatRateBp: 700 },
        { description: "ค่าเช่าอุปกรณ์ดำน้ำ", qty: 2, unitName: "วัน", unitPrice: 120_000, vatRateBp: 700 },
        { description: "เสื้อ SIAM DIVE", qty: 1, unitName: "ตัว", unitPrice: 107_103, vatRateBp: 700 },
      ],
      createdById: E.ownerUserId,
    });
    await svc.applyEditorExtras(E.tenantId, SYS, draft.id, {
      reference: FIXTURE_REF,
      priceMode: "EXCL_VAT",
      discountMode: "AMOUNT",
      salesUserId: null,
      tags: ["ทริปดำน้ำ", "ลูกค้าประจำ"],
      internalNote: "ลูกค้าจองผ่านไลน์ · ยืนยันที่นั่งแล้ว 18 ก.ย.",
      autoTaxInvoice: true,
      whtAmount: totals.whtTotal,
      lineWht: [
        { whtIncomeType: "M40_8", whtRateBp: 300 },
        { whtIncomeType: null, whtRateBp: null },
        { whtIncomeType: null, whtRateBp: null },
      ],
    });
    fixtureDraftId = draft.id;
  }
  console.log(`[fixture 1.3] ร่างใบแจ้งหนี้คุณณัฐพล = ${fixtureDraftId}\n`);
}

// ─────────── fixture ของ WO 1.4: ใบแจ้งหนี้ 24,900 (ออกแล้ว) + ร่างใบเสร็จที่อ้างถึง (ภาพ g2) ───────────
// ต้องเป็นของจริงในฐานข้อมูล ตัวเลขบนจอถึงจะพิสูจน์อะไรได้ — สร้างผ่าน service ตัวเดียวกับที่ action เรียก
// 🔴 ลบทิ้งเสมอใน finally: ใบแจ้งหนี้ที่ออกแล้วจะไปเพิ่มตัวนับแท็บของ WO 1.1 (เฉลย IV ทั้งหมด 51 ใบ)
const FIXTURE_REF_14 = "QC-VISUAL-1.4";
let fx14 = { invoiceId: "", receiptId: "", invoiceNo: "" };
if (WO === "1.4") {
  const { prisma: db } = await import("@/lib/core/db");
  const svc = await import("@/lib/modules/account/service");
  cleanupFixture = async () => {
    const stale = await db.accountDocument.findMany({
      where: { systemId: SYS, reference: FIXTURE_REF_14 },
      select: { id: true },
    });
    // ใบเสร็จ/เอกสารลูกที่อ้างใบแจ้งหนี้ fixture ต้องไปด้วย (relation + sourceDocId)
    const ids = stale.map((d) => d.id);
    const children = ids.length
      ? await db.accountDocument.findMany({ where: { systemId: SYS, sourceDocId: { in: ids } }, select: { id: true } })
      : [];
    const all = [...ids, ...children.map((c) => c.id)];
    if (all.length === 0) return;
    await db.accountJournalLine.deleteMany({ where: { entry: { systemId: SYS, refId: { in: all } } } });
    await db.accountJournalEntry.deleteMany({ where: { systemId: SYS, refId: { in: all } } });
    await db.accountDocumentPayment.deleteMany({ where: { documentId: { in: all } } });
    await db.accountDocumentRelation.deleteMany({ where: { OR: [{ fromId: { in: all } }, { toId: { in: all } }] } });
    await db.accountDocumentLine.deleteMany({ where: { documentId: { in: all } } });
    await db.accountDocument.updateMany({ where: { id: { in: all } }, data: { sourceDocId: null } });
    await db.accountDocument.deleteMany({ where: { id: { in: all } } });
    console.log(`ลบ fixture ของ WO 1.4 ${all.length} ใบ (ตัวนับแท็บ WO 1.1 กลับเท่าเฉลย)`);
  };
  await cleanupFixture(); // กันซากจากรอบที่ล้มกลางคัน
  const inv = await svc.createDocument({
    tenantId: E.tenantId,
    systemId: SYS,
    docType: "INVOICE",
    contactId: E.fixtures.contactNattapholId,
    issueDate: new Date(`${QC.today}T00:00:00.000Z`),
    dueDate: new Date("2026-10-14T00:00:00.000Z"),
    vatMode: "EXCLUDE",
    vatTiming: "ON_ISSUE",
    lines: [
      { description: "ทริปสิมิลัน 3 วัน 2 คืน", qty: 2, unitName: "คน", unitPrice: 990_000, vatRateBp: 700 },
      { description: "ค่าเช่าอุปกรณ์ดำน้ำ", qty: 2, unitName: "วัน", unitPrice: 120_000, vatRateBp: 700 },
      { description: "เสื้อ SIAM DIVE", qty: 1, unitName: "ตัว", unitPrice: 107_103, vatRateBp: 700 },
    ],
    createdById: E.ownerUserId,
  });
  await svc.applyEditorExtras(E.tenantId, SYS, inv.id, {
    reference: FIXTURE_REF_14,
    priceMode: "EXCL_VAT",
    discountMode: "AMOUNT",
    salesUserId: null,
    tags: [],
    internalNote: null,
    autoTaxInvoice: false,
    whtAmount: 0,
    lineWht: [],
  });
  const issued = await svc.issueDocument(E.tenantId, SYS, inv.id);
  if (!issued.ok) throw new Error("fixture 1.4: ออกใบแจ้งหนี้ไม่สำเร็จ — " + issued.reason);
  const conv = await svc.convertDocument(E.tenantId, SYS, inv.id, "RECEIPT", E.ownerUserId);
  if (!conv.ok) throw new Error("fixture 1.4: แปลงเป็นใบเสร็จไม่สำเร็จ — " + conv.reason);
  fx14 = { invoiceId: inv.id, receiptId: conv.newId, invoiceNo: issued.docNo };
  console.log(`[fixture 1.4] ใบแจ้งหนี้ ${issued.docNo} = ${inv.id} · ร่างใบเสร็จ = ${conv.newId}\n`);
}

// ─────────── รายการหน้าต่อ WO (เติมทีละ WO ตาม BLUEPRINT §3) ───────────
// expect = ข้อความที่ต้องเจอบนหน้า (ว่าง = ไม่ตรวจ) — พิสูจน์ว่าเปิดถูกหน้า **และต่อ DB QC จริง**
// (Next โหลด .env ของ prod ให้อัตโนมัติตอน build/start แต่ไม่ทับ env ที่ส่งเข้ามา → ต้องมีหลักฐานจากหน้าจอ)
type PageSpec = {
  name: string;
  path: string;
  note?: string;
  expect?: string[];
  /** selector ที่ต้องคลิกหลังหน้าโหลด/hydrate เสร็จ (ทำตามลำดับ) — ใช้เปิด dropdown/sheet ก่อนถ่ายภาพ */
  click?: string[];
  /** selector ที่ต้อง hover (ไม่คลิก) หลัง click ครบ — ใช้เปิด flyout ระดับ 2 บนเดสก์ท็อปโดยไม่ navigate ออกจากหน้า */
  hover?: string[];
  /** เวลารอ (ms) หลัง click/hover ครบ ก่อนถ่ายภาพ — ค่าเริ่มต้น 300 (ตาม WO 0.4 "wait 300ms") */
  waitAfterClick?: number;
  /** จำกัดให้ถ่าย/ตรวจเฉพาะอุปกรณ์นี้ (ไม่ระบุ = ทั้ง 2) — ใช้กับ interaction ที่มีความหมายแค่ device เดียว
   *  เช่น hover flyout (เดสก์ท็อปเท่านั้น) / sheet ชั้น 2 (มือถือเท่านั้น) */
  onlyDevice?: "desktop" | "mobile";
  /** คุกกี้เพิ่มเฉพาะหน้านี้ (เช่น `acc_mode=easy` เพื่อถ่ายโหมดง่าย) — ตั้งก่อนโหลดหน้า */
  extraCookies?: { name: string; value: string }[];
  /** WO 1.4: ลำดับการกรอกฟอร์มก่อนถ่าย (คลิก/พิมพ์สลับกันได้ — `click` ทำก่อนทั้งหมด)
   *  ใช้สร้างสถานะบนจอแบบเดียวกับภาพ g2 (ขั้นสูง · 2 กล่อง · เปิดถูกหัก ณ ที่จ่าย) โดยผ่าน UI จริง */
  flow?: ({ click: string } | { fill: string; value: string })[];
};
const PAGES: Record<string, PageSpec[]> = {
  "0.1": [
    { name: "hub", path: `/app/sys/${SYS}`, note: "หน้าแรกระบบบัญชี (AccountContent)", expect: ["บัญชี", E.tenantName] },
    { name: "invoice-list", path: `/app/sys/${SYS}/account/docs/INVOICE`, note: "หน้ารายการใบแจ้งหนี้ (เฟรม f3)", expect: ["ใบแจ้งหนี้", E.fixtures.invNattapholDocNo] },
    { name: "account-root", path: `/app/sys/${SYS}/account`, note: "⚠️ ยังไม่มี page.tsx → 404 (ลิงก์ '← ระบบบัญชี' ใน layout ตายอยู่ — ยังไม่ถูกแก้หลัง WO 0.2 → ส่งต่อ WO 0.4 shell V2)" },
  ],
  // WO 0.4 (Shell V2): แถบเมนู 9 หมวด + dropdown 2 ระดับ (เดสก์ท็อป) / bottom sheet 2 ชั้น (มือถือ) + breadcrumb
  // "account-root" ของ 0.1 คือ "hub" ที่นี่ — ตอนนี้มี page.tsx แล้ว (แก้บั๊ก 404 ledger/wo-notes/0.1.md ข้อ 8)
  "0.5": [
    { name: "gallery", path: `/app/sys/${SYS}/account/dev-components`, note: "gallery ส่วนประกอบกลาง V2 (เทียบ f3/g1/g5/g17/g18)", expect: ["บัญชี"] },
  ],
  "0.4": [
    { name: "hub", path: `/app/sys/${SYS}/account`, note: "หน้า hub บัญชี — แก้ 404 เดิม (WO 0.1 บันทึกไว้เป็นข้อ 8)", expect: ["บัญชี"] },
    { name: "invoice-list", path: `/app/sys/${SYS}/account/docs/INVOICE`, note: "หน้ารายการใบแจ้งหนี้ (เฟรม f3) ใต้แถบเมนู V2", expect: ["ใบแจ้งหนี้"] },
    {
      name: "menu-open",
      path: `/app/sys/${SYS}/account`,
      note: 'เปิดหมวด "รายรับ" — เดสก์ท็อป = dropdown 2 ระดับ (f2) · มือถือ = bottom sheet (f12/g18)',
      expect: ["บัญชี"],
      click: ['[data-testid="acc-menu-revenue"]'],
      waitAfterClick: 300,
    },
    {
      name: "menu-flyout",
      path: `/app/sys/${SYS}/account`,
      note: 'คลิก "รายรับ" แล้ว hover "ใบแจ้งหนี้" — เปิด flyout ระดับ 2 (f2 พาเนลขวา: +สร้าง ปุ่มดำ/สถานะพร้อมตัวนับ/ดูทั้งหมด/ล่าสุด)',
      expect: ["บัญชี"],
      onlyDevice: "desktop",
      click: ['[data-testid="acc-menu-revenue"]'],
      hover: ['[data-testid="acc-item-INVOICE"]'],
      waitAfterClick: 300,
    },
    {
      name: "sheet-l2",
      path: `/app/sys/${SYS}/account`,
      note: 'แตะ "รายรับ" แล้วแตะ "ใบแจ้งหนี้ (ใบส่งของ)" — sheet ชั้น 2 พร้อมปุ่มย้อนกลับ (g18)',
      expect: ["บัญชี"],
      onlyDevice: "mobile",
      click: ['[data-testid="acc-menu-revenue"]', '[data-testid="acc-item-INVOICE"]'],
      waitAfterClick: 300,
    },
  ],
  // WO 1.1 (DocListPage): หน้ารายการทุกชนิด — เทียบ f3-invoice-list.png (เดสก์ท็อป) + f13-m-invoice-list.png (มือถือ)
  // ตัวเลขแท็บของ INVOICE ต้องตรง acc-v2-expected.json.invoiceTabs เป๊ะ (ASSERT_MAP ด้านล่าง) · size=20 ให้ตรงกับ
  // pageCount ที่คาด (51 ใบ / 20 = 3 หน้า → "หน้า 1/3")
  "1.1": [
    {
      name: "invoice-list",
      path: `/app/sys/${SYS}/account/docs/INVOICE?size=20`,
      note: "หน้ารายการใบแจ้งหนี้ default tab ทั้งหมด (f3) — ตัวนับแท็บ + pagination หน้า 1/3",
      expect: ["ใบแจ้งหนี้", "หน้า 1/3"],
    },
    {
      name: "invoice-list-overdue",
      path: `/app/sys/${SYS}/account/docs/INVOICE?tab=overdue`,
      note: "แท็บพ้นกำหนด (f3 — แถวสีแดง)",
      expect: ["พ้นกำหนด"],
    },
    {
      name: "quotation-list",
      path: `/app/sys/${SYS}/account/docs/QUOTATION`,
      note: "หน้ารายการใบเสนอราคา (§5.1: เลขที่/ลูกค้า/วันที่ออก/ใช้ได้ถึง/มูลค่าสุทธิ/สถานะ)",
      expect: ["ใบเสนอราคา"],
    },
    {
      name: "expense-list",
      path: `/app/sys/${SYS}/account/expense`,
      note: "หน้ารายการบันทึกค่าใช้จ่าย (ฝั่งจ่าย — listExpenseDocsPaged)",
      expect: ["บันทึกค่าใช้จ่าย"],
    },
    {
      name: "po-list",
      path: `/app/sys/${SYS}/account/po`,
      note: "หน้ารายการใบสั่งซื้อ (§5.1: เลขที่/ผู้ขาย/วันที่/มูลค่าสุทธิ/สถานะ)",
      expect: ["ใบสั่งซื้อ"],
    },
    {
      name: "goods-issue-list",
      path: `/app/sys/${SYS}/account/goods-issue`,
      note: "หน้ารายการใบเบิกสินค้า PRR (เลขที่/วันที่/สาเหตุการเบิก/จำนวนที่เบิก/สถานะ)",
      expect: ["ใบเบิกสินค้า"],
    },
  ],
  // WO 1.3 (DocEditorV2): ฟอร์มเอกสารเต็มหน้า — เทียบ g1-invoice-form.png (เดสก์ท็อป) ·
  // g1-invoice-form-menu.png (เมนูอนุมัติเปิด) · g17-invoice-form.png (มือถือ accordion + แถบยอดติดล่าง)
  "1.3": [
    {
      name: "invoice-form-new",
      path: `/app/sys/${SYS}/account/docs/INVOICE/new`,
      note: "ฟอร์มสร้างใบแจ้งหนี้ (ฟอร์มเปล่า) — stepper QT/IV/RE/TX · ส่วนหัว · รายการ · สรุปยอด · หมายเหตุ ×2 · แนบไฟล์ · แถบปุ่มท้าย",
      expect: ["สร้างใบแจ้งหนี้", "ส่วนหัวเอกสาร", "สรุปยอด"],
    },
    {
      name: "invoice-form",
      path: `/app/sys/${SYS}/account/docs/INVOICE/${fixtureDraftId}/edit`,
      note: "ฟอร์มแก้ไขร่าง (fixture คุณณัฐพล 3 บรรทัดตาม g1) — ตัวเลขจริงจาก DB QC",
      // ⚠️ ชื่อผู้ติดต่ออยู่ใน input.value ไม่ใช่ข้อความบนหน้า → ตรวจใน checks13 ด้วย contactName แทน
      expect: ["แก้ไขใบแจ้งหนี้", "฿24,900.00"],
    },
    {
      name: "invoice-form-menu",
      path: `/app/sys/${SYS}/account/docs/INVOICE/${fixtureDraftId}/edit`,
      note: 'กดปุ่มดำ "อนุมัติใบแจ้งหนี้ ▾" — เมนู 4 ทางเลือก (g1-invoice-form-menu.png)',
      expect: ["แก้ไขใบแจ้งหนี้"],
      click: ['[data-testid="btn-approve-menu"]'],
      waitAfterClick: 300,
    },
    {
      name: "invoice-form-easy",
      path: `/app/sys/${SYS}/account/docs/INVOICE/${fixtureDraftId}/edit`,
      note: 'โหมดง่าย (cookie acc_mode=easy) — ต้องซ่อน บัญชี · ประเภทราคา · หัก ณ ที่จ่าย (BLUEPRINT §0.3-1)',
      expect: ["แก้ไขใบแจ้งหนี้", "฿24,900.00"],
      extraCookies: [{ name: "acc_mode", value: "easy" }],
    },
  ],
  // ─── WO 1.4 · ส่วน D (เงินมัดจำ) + F (รับชำระเงิน) — ภาพตายตัว g2-receipt-payment.png ───
  "1.4": [
    {
      name: "receipt-payment",
      path: `/app/sys/${SYS}/account/docs/RECEIPT/${fx14.receiptId}/edit`,
      note: 'ฟอร์มใบเสร็จรับเงิน โหมด "ขั้นสูง" 2 ครั้ง (14,900 ธนาคาร + 9,301.87 เงินสด + ถูกหัก ณ ที่จ่าย 698.13) = เฉลย g2',
      expect: ["ใบเสร็จรับเงิน", "รับชำระเงิน", "ครั้งที่ 1"],
      // สร้างสถานะบนจอผ่าน UI จริง (ไม่ยัด state): ขั้นสูง → แก้ยอดครั้งที่ 1 → เพิ่มครั้งที่ 2 → เปิดถูกหัก ณ ที่จ่าย
      // (เปิด toggle แล้วระบบเติมให้เอง: ภาษี 3% ของฐาน 23,271.03 = 698.13 · เงินรับจริง 10,000 − 698.13)
      flow: [
        { click: '[data-testid="pay-mode-advanced"]' },
        { fill: '[data-testid="pay-amount-1"]', value: "14900.00" },
        { click: '[data-testid="btn-add-payment"]' },
        { click: '[data-testid="pay-wht-toggle-2"]' },
      ],
      waitAfterClick: 500,
    },
    {
      name: "invoice-detail-payment",
      path: `/app/sys/${SYS}/account/docs/INVOICE/${fx14.invoiceId}`,
      note: 'หน้าใบแจ้งหนี้ + แผง "รับชำระ" ที่เปิดใน SlideOver (§5.3 ทำรายการ → §5.2 F)',
      expect: ["รับชำระ"],
      click: ['[data-testid="btn-open-payment"]'],
      waitAfterClick: 1200,
    },
  ],
};

// ─────────── ตารางตัวเลขที่อ่านจาก data-testid (ว่างไว้ก่อน — WO ถัดไปเติม) ───────────
// รูปแบบ: { page: { "testid": ค่าที่คาดหวังเป็นสตางค์ | สตริง } }
const ASSERT_MAP: Record<string, Record<string, Record<string, number | string>>> = {
  // WO 1.4: ตัวเลขบนจอต้องตรงเฉลย g2 เป๊ะ (14,900 + 9,301.87 + WHT 698.13 = 24,900 · ค้าง 0)
  "1.4": {
    "receipt-payment": {
      "pay-head-total": "฿24,900.00",
      "pay-summary-doc": "฿24,900.00",
      "pay-summary-paid": "฿24,201.87",
      "pay-summary-wht": "฿698.13",
      "pay-outstanding": "฿0.00",
      "pay-total-2": "฿10,000.00",
      "tot-grand": "฿24,900.00",
    },
  },
  "0.1": {},
  "0.4": {},
  "0.5": {},
  // WO 1.1: ตัวนับแท็บของ INVOICE ต้องตรง acc-v2-expected.json.invoiceTabs เป๊ะ (ground truth = f3-invoice-list.png)
  "1.1": {
    "invoice-list": {
      "tab-all-count": E.invoiceTabs.all,
      "tab-draft-count": E.invoiceTabs.draft,
      "tab-awaiting-count": E.invoiceTabs.awaiting,
      "tab-partial-count": E.invoiceTabs.partial,
      "tab-paid-count": E.invoiceTabs.paid,
      "tab-overdue-count": E.invoiceTabs.overdue,
      "tab-cancelled-count": E.invoiceTabs.cancelled,
    },
  },
  // WO 1.3: ตัวเลขในบล็อกสรุปยอดต้องตรงเฉลย g1 เป๊ะ (ground truth = g1-invoice-form.png)
  //   24,900.00 = 23,271.03 + VAT 1,628.97 · ยอดที่ต้องชำระ 24,306.00 = 24,900 − WHT 594 (ยังไม่หักมัดจำ — WO 1.4)
  "1.3": {
    "invoice-form": {
      "tot-sub": "฿23,271.03",
      "tot-vat": "฿1,628.97",
      "tot-grand": "฿24,900.00",
      "tot-wht": "594.00",
      "tot-due": "฿24,306.00",
      "tot-words": "สองหมื่นสี่พันเก้าร้อยบาทถ้วน",
    },
    // โหมดง่ายซ่อน "ช่องกรอก" เท่านั้น — ยอดต้องเท่าเดิมเป๊ะ (สูตรเดียว computeDocTotals)
    "invoice-form-easy": {
      "tot-grand": "฿24,900.00",
      "tot-due": "฿24,306.00",
    },
  },
};

const specs = PAGES[WO];
if (!specs) {
  console.error(`❌ ยังไม่ได้ประกาศรายการหน้าของ WO "${WO}" ใน scripts/visual-acc-v2.mts`);
  process.exit(2);
}

const OUT = `${QC.shotsDir}/${WO}`;
mkdirSync(OUT, { recursive: true });

const { sha256 } = await import("@/lib/core/hash");

// listDocumentsPaged: ใช้ยืนยันตัวนับใน flyout เมนู V2 ตรงกับ query จริงของหน้ารายการ (แหล่งอิสระ ไม่ใช่เช็คตัวเองกับตัวเอง)
// เป็น optional เหมือน prisma ด้านล่าง — ถ้า worktree กำลังถูกแก้ค้างโดย WO อื่นจน import พัง ให้ข้ามเช็คนี้ไปเงียบ ๆ
// (ไม่ควรบล็อกกล้องถ่ายรูป) แต่พิมพ์เตือนให้เห็นว่าข้ามไปทำไม
let listDocumentsPaged: ((tenantId: string, systemId: string, input: Record<string, unknown>) => Promise<{ total: number }>) | null = null;
try {
  listDocumentsPaged = (await import("@/lib/modules/account/service")).listDocumentsPaged as unknown as typeof listDocumentsPaged;
} catch (e) {
  console.warn(`⚠️  โหลด listDocumentsPaged ไม่ได้ (${e instanceof Error ? e.message.split("\n")[0] : e}) — ข้ามเช็คตัวนับ flyout กับ DB ตรง ๆ`);
}

// prisma: ปกติใช้ตัวเดียวกับแอป (`@/lib/core/db`) — ตัวนั้นมี boot assert ว่า "ทุก model ใน schema
// ต้องลงทะเบียนใน scope.ts" ซึ่งจะโยนถ้า worktree กำลังถูกแก้ค้างอยู่โดย WO อื่น (schema เปลี่ยนแล้ว
// แต่ยังไม่ `prisma generate`) — สคริปต์นี้เป็น "กล้องถ่ายรูป" ไม่ควรถูกบล็อกด้วยเหตุนั้น
// ⇒ ล้มเมื่อไหร่ ให้ต่อ DB ตรงแทน **พร้อมเตือนเสียงดัง** (ไม่ใช่เงียบ ๆ)
let prisma: {
  user: { findUnique: (a: unknown) => Promise<{ id: string } | null> };
  session: {
    create: (a: unknown) => Promise<unknown>;
    deleteMany: (a: unknown) => Promise<{ count: number }>;
    count: (a: unknown) => Promise<number>;
  };
  $disconnect: () => Promise<void>;
};
try {
  prisma = (await import("@/lib/core/db")).prisma as unknown as typeof prisma;
} catch (e) {
  console.warn(
    `⚠️  โหลด @/lib/core/db ไม่ได้ (${e instanceof Error ? e.message.split("\n")[0] : e})\n` +
      `   → worktree น่าจะถูกแก้ค้างโดย WO อื่นอยู่ · ต่อ DB QC ตรงแทนเพื่อถ่ายภาพให้จบ\n`,
  );
  const { PrismaClient } = await import("@prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }) as unknown as typeof prisma;
}

const UA = "qc-visual-acc-v2";
const owner = await prisma.user.findUnique({ where: { email: QC.ownerEmail }, select: { id: true } });
if (!owner) {
  console.error(`❌ ไม่พบผู้ใช้ ${QC.ownerEmail} — รัน seed ก่อน`);
  process.exit(2);
}
const token = "accv2" + Math.random().toString(36).slice(2) + Date.now().toString(36);
const ttl = new Date(Date.now() + 60 * 60 * 1000);
await prisma.session.create({
  data: { userId: owner.id, tokenHash: sha256(token), userAgent: UA, idleExpiresAt: ttl, expiresAt: ttl },
});

let failures = 0;
try {
  const pptr = await import(
    "/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js" as string
  );
  const browser = await pptr.default.launch({
    executablePath: "/usr/bin/chromium-browser",
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", `--user-data-dir=/tmp/chr-accv2-${process.pid}`],
  });
  try {
    const https = BASE.startsWith("https:");
    const host = new URL(BASE).hostname;
    const cookies = https
      ? [
          { name: "__Host-shark_session", value: token, url: BASE, path: "/", secure: true },
          { name: "shark_tenant", value: E.tenantId, url: BASE, path: "/", secure: true },
        ]
      : [
          { name: "shark_session", value: token, domain: host, path: "/" },
          { name: "shark_tenant", value: E.tenantId, domain: host, path: "/" },
        ];

    for (const spec of specs) {
      const line: string[] = [];
      for (const [device, w, h] of [
        ["desktop", 1440, 900],
        ["mobile", 390, 844],
      ] as const) {
        if (spec.onlyDevice && spec.onlyDevice !== device) continue; // interaction นี้มีความหมายแค่ device เดียว
        const page = await browser.newPage();
        // tsx/esbuild ห่อฟังก์ชันที่ส่งเข้า page.evaluate ด้วย __name(...) ซึ่งเบราว์เซอร์ไม่มี → ฉีด shim
        await page.evaluateOnNewDocument("window.__name = window.__name || ((f) => f);");
        await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
        const extra = (spec.extraCookies ?? []).map((c) =>
          https ? { name: c.name, value: c.value, url: BASE, path: "/", secure: true } : { name: c.name, value: c.value, domain: host, path: "/" },
        );
        const pageCookies = [...cookies, ...extra];
        await page.setCookie(...pageCookies);
        // สถานะ HTTP อ่านจาก fetch ตรง ๆ — ไม่ผูกกับ puppeteer เพราะ waitUntil อาจ timeout
        // ทั้งที่หน้าเรนเดอร์เรียบร้อยแล้ว (หน้ารายการมี stream/suspense) → เคยได้ status 0 หลอก
        const status = await fetch(`${BASE}${spec.path}`, {
          headers: { cookie: pageCookies.map((c) => `${c.name}=${c.value}`).join("; ") },
          redirect: "manual",
        })
          .then((r) => r.status)
          .catch(() => 0);
        const navOk = await page
          .goto(`${BASE}${spec.path}`, { waitUntil: "domcontentloaded", timeout: 60_000 })
          .then(() => true)
          .catch(() => false);
        await new Promise((r) => setTimeout(r, 1500)); // ให้ hydrate/สตรีมจบก่อนถ่าย

        // WO 0.4: เปิด dropdown/sheet ก่อนถ่าย (เดสก์ท็อป=dropdown 2 ระดับ · มือถือ=bottom sheet — คลิกปุ่มเดียวกัน
        // AccountTabBar ตัดสินพฤติกรรมจาก matchMedia ตอนคลิกเอง ไม่ต้องแยกโค้ดที่นี่)
        for (const sel of spec.click ?? []) {
          await page.click(sel).catch(() => {});
        }
        // WO 1.4: ลำดับกรอกฟอร์ม (คลิก/พิมพ์) — MoneyInput ยืนยันค่าเมื่อ blur ⇒ ต้องกด Tab ทุกครั้งหลังพิมพ์
        for (const step of spec.flow ?? []) {
          if ("click" in step) {
            await page.click(step.click).catch(() => {});
          } else {
            await page.click(step.fill, { clickCount: 3 }).catch(() => {});
            await page.keyboard.type(step.value).catch(() => {});
            await page.keyboard.press("Tab").catch(() => {});
          }
          await new Promise((r) => setTimeout(r, 250));
        }
        // hover (ไม่ใช่ click) — เปิด flyout ระดับ 2 บนเดสก์ท็อปโดยไม่ navigate ออกจากรายการ (Link ของแถวระดับ 1 มี href จริง)
        for (const sel of spec.hover ?? []) {
          await page.hover(sel).catch(() => {});
        }
        if (spec.click?.length || spec.hover?.length || spec.flow?.length)
          await new Promise((r) => setTimeout(r, spec.waitAfterClick ?? 300));
        // Fable QC รอบ 2: page.hover() ของ puppeteer เรียก scrollIntoViewIfNeeded ก่อนเสมอ — ถ้า element ที่ hover
        // เคยโดน overflow ของ ancestor บัง (ดู AccountTabBar แก้แล้ว) จะสกอลหน้าไปตำแหน่งแปลก ๆ ก่อนถ่าย ⇒ รีเซ็ตกลับ 0
        // เสมอก่อนถ่ายภาพ (fullPage screenshot ควรไม่ขึ้นกับตำแหน่งสกอลอยู่แล้ว แต่กันไว้สองชั้น)
        await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});

        const file = `${OUT}/${spec.name}-${device}.png`;
        await page.screenshot({ path: file, fullPage: true });
        const probe = await page.evaluate(() => {
          // เช็ค "เปิดอยู่จริงบนจอ" ด้วย getBoundingClientRect + computed style — **ห้ามใช้ offsetParent**
          // (offsetParent เป็น null เสมอสำหรับ position:fixed ตามสเปก แม้ element จะมองเห็นได้จริง ๆ บนจอ —
          // บทเรียน VR-6.2 ที่ Fable เจอ: sheet ของ AccountTabBar เป็น `fixed inset-0` ⇒ offsetParent เช็คพลาดเสมอ)
          const isVisible = (el: Element | null): boolean => {
            if (!el) return false;
            const r = el.getBoundingClientRect();
            if (r.width <= 0 || r.height <= 0) return false;
            const cs = getComputedStyle(el);
            return cs.visibility !== "hidden" && cs.display !== "none";
          };
          const rectOf = (el: Element | null) => {
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
          };
          const tabbarEl = document.querySelector('[data-testid="acc-tabbar"]');
          const dropdownEl = document.querySelector('[data-testid="acc-dropdown"]');
          return {
            title: document.title,
            h1: document.querySelector("h1")?.textContent?.trim() ?? "",
            all: (document.body.innerText ?? "").slice(0, 20000),
            text: (document.querySelector("main")?.textContent ?? document.body.textContent ?? "").slice(0, 4000),
            overflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
            viewportH: window.innerHeight,
            testids: Object.fromEntries(
              [...document.querySelectorAll("[data-testid]")].map((el) => [
                el.getAttribute("data-testid") ?? "",
                (el as HTMLElement).innerText.trim(),
              ]),
            ),
            // WO 0.4 shell V2: ตัวเลขโครงสร้างเมนู — อ่านแยกจาก testids ตรง ๆ เพราะต้อง "นับ" ไม่ใช่อ่านข้อความ
            acc: {
              hasTabbar: !!tabbarEl,
              menuCount: document.querySelectorAll('[data-testid^="acc-menu-"]').length,
              breadcrumbText: document.querySelector('[data-testid="acc-breadcrumb"]')?.textContent?.trim() ?? "",
              // ลิงก์ระดับ 1 ที่เปิดอยู่ (dropdown เดสก์ท็อป หรือ sheet มือถือ) — href="#" ต้องมีชิป "เร็ว ๆ นี้" กำกับเสมอ
              badDeadLink: (() => {
                const scopes = [
                  ...document.querySelectorAll('[role="menu"]'),
                  ...document.querySelectorAll(".fixed.inset-0"),
                ];
                for (const scope of scopes) {
                  for (const a of scope.querySelectorAll("a[href]")) {
                    const href = a.getAttribute("href") ?? "";
                    const hasChip = (a.textContent ?? "").includes("เร็ว ๆ นี้");
                    if (href === "#" && !hasChip) return a.textContent?.trim() ?? "(ไม่มีข้อความ)";
                  }
                }
                return null;
              })(),
              dropdownVisible: isVisible(dropdownEl),
              flyoutVisible: isVisible(document.querySelector('[data-testid="acc-flyout"]')),
              sheetL1Visible: isVisible(document.querySelector('[data-testid="acc-sheet-l1"]')),
              sheetL2Visible: isVisible(document.querySelector('[data-testid="acc-sheet-l2"]')),
              sheetL2HasBackArrow: (() => {
                const sheet = document.querySelector('[data-testid="acc-sheet-l2"]');
                if (!sheet) return false;
                return [...sheet.querySelectorAll("button")].some((b) => (b.getAttribute("aria-label") ?? "") === "ย้อนกลับ");
              })(),
              // Fable QC รอบ 2 ข้อ 1: dropdown ต้องอยู่ใต้แถบเมนูพอดี ไม่ทะลุขอบล่างจอ
              tabbarRect: rectOf(tabbarEl),
              dropdownRect: rectOf(dropdownEl),
            },
            // WO 1.3 ฟอร์มเอกสาร V2 — นับแถวรายการ + สถานะเมนูอนุมัติ + ความกว้างจริงของหน้า
            editor: {
              hasForm: !!document.querySelector('[data-testid="doc-editor-v2"]'),
              lineRows: [...document.querySelectorAll("[data-testid]")].filter((el) =>
                /^line-\d+$/.test(el.getAttribute("data-testid") ?? ""),
              ).length,
              lineCards: [...document.querySelectorAll("[data-testid]")].filter((el) =>
                /^line-m-\d+$/.test(el.getAttribute("data-testid") ?? ""),
              ).length,
              approveMenuVisible: isVisible(document.querySelector('[data-testid="approve-menu"]')),
              stickyBarVisible: isVisible(document.querySelector('[data-testid="editor-actions"]')),
              scrollWidth: document.documentElement.scrollWidth,
              // ตารางรายการต้อง "พอดีการ์ด" — scrollWidth ≤ clientWidth แปลว่าไม่มีคอลัมน์ไหนถูกตัด
              tableFits: (() => {
                const el = document.querySelector('[data-testid="line-table-wrap"]') as HTMLElement | null;
                if (!el) return null;
                return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
              })(),
              // ชื่อผู้ติดต่ออยู่ใน value ของ input (ไม่ใช่ text) — ไม้บรรทัดต้องอ่านจากตรงนี้
              contactName: (document.querySelector('[data-testid="contact-picker"] input') as HTMLInputElement | null)?.value ?? "",
              // วันที่ต้องอ่านเป็นไทย ค.ศ. ไม่ใช่รูปแบบเบราว์เซอร์ (09/30/2026)
              issueDateText: (document.querySelector('[data-testid="fld-issue"]') as HTMLInputElement | null)?.value ?? "",
              // โหมดนักบัญชี = ต้องมีคอลัมน์ บัญชี + หัก ณ ที่จ่าย และช่อง ประเภทราคา
              hasPriceMode: !!document.querySelector('[data-testid="fld-pricemode"]'),
              hasAccountCol: !!document.querySelector('[data-testid="line-0-account"]'),
              hasWhtCol: !!document.querySelector('[data-testid="line-0-wht-type"]'),
              // ไม่มีอะไรถูกแถบปุ่มท้ายทับ: ก้นบล็อกแท็กต้องอยู่เหนือขอบบนของแถบ (หลังเลื่อนสุดหน้า)
              tagsBottom: (() => {
                const el = document.querySelector('[data-testid="fld-tags"]');
                return el ? el.getBoundingClientRect().bottom : null;
              })(),
              barTop: (() => {
                const el = document.querySelector('[data-testid="editor-actions"]');
                return el ? el.getBoundingClientRect().top : null;
              })(),
            },
            // WO 1.4 ส่วน D/F — โครงของบล็อก "รับชำระเงิน" ตาม g2
            pay: {
              hasSection: !!document.querySelector('[data-testid="pay-section"]'),
              hasHeadCard: !!document.querySelector('[data-testid="pay-head"]'),
              hasDepositSection: !!document.querySelector('[data-testid="deposit-section"]'),
              advancedOn:
                document.querySelector('[data-testid="pay-mode-advanced"]')?.getAttribute("aria-pressed") === "true",
              boxes: document.querySelectorAll('[data-testid^="pay-box-"]').length,
              whtOn2:
                document.querySelector('[data-testid="pay-wht-toggle-2"]')?.getAttribute("aria-checked") === "true",
              certHint: !!document.querySelector('[data-testid="pay-cert-hint-2"]'),
              slideOverVisible: isVisible(document.querySelector('[data-testid="payment-slideover"]')),
              hasRecordButton: !!document.querySelector('[data-testid="btn-record-payments"]'),
              // ป้ายช่องเงินของกล่องที่เปิดถูกหัก ณ ที่จ่าย ต้องเปลี่ยนเป็น "จำนวนเงินรับจริง" ตาม g2
              amountLabel2:
                document.querySelector('[data-testid="pay-amount-2"]')?.closest("label")?.textContent?.trim() ?? "",
              amount1:
                (document.querySelector('[data-testid="pay-amount-1"]') as HTMLInputElement | null)?.value ?? "",
              amount2:
                (document.querySelector('[data-testid="pay-amount-2"]') as HTMLInputElement | null)?.value ?? "",
              whtAmount2:
                (document.querySelector('[data-testid="pay-wht-amount-2"]') as HTMLInputElement | null)?.value ?? "",
            },
          };
        });
        line.push(`${device} HTTP ${status} · ${w}px · ล้นแนวนอน ${probe.overflow}px${navOk ? "" : " · nav timeout"}`);

        // กันถ่ายหน้า login/404 มาแล้วนึกว่าผ่าน: ต้อง HTTP 200 + เจอข้อความที่ประกาศไว้ครบ
        for (const want of spec.expect ?? []) {
          const ok = status === 200 && probe.all.includes(want);
          if (!ok) failures++;
          console.log(`  ${ok ? "✅" : "❌"} [${spec.name}/${device}] HTTP ${status} · เจอ "${want}" บนหน้า${ok ? "" : ` — title="${probe.title}" h1="${probe.h1}"`}`);
        }
        if (ASSERT) {
          const want = ASSERT_MAP[WO]?.[spec.name] ?? {};
          for (const [tid, expected] of Object.entries(want)) {
            const got = probe.testids[tid];
            const ok = String(got ?? "").includes(String(expected));
            if (!ok) failures++;
            console.log(`  ${ok ? "✅" : "❌"} [${spec.name}/${device}] data-testid="${tid}" = ${JSON.stringify(got)} (คาด ${JSON.stringify(expected)})`);
          }
        }

        // WO 1.3 ฟอร์มเอกสาร V2 — โครงสร้างที่ต้องตรง g1 / g1-menu / g17
        if (ASSERT && WO === "1.3") {
          const want = spec.name === "invoice-form-new" ? "สร้างใบแจ้งหนี้" : "แก้ไขใบแจ้งหนี้";
          const checks13: [boolean, string][] = [
            [probe.editor.hasForm, `มีฟอร์ม [data-testid="doc-editor-v2"] บนหน้า`],
            [probe.h1.includes(want), `h1 มีคำว่า "${want}" (เจอ "${probe.h1}")`],
            [probe.editor.stickyBarVisible, `แถบปุ่มท้าย [data-testid="editor-actions"] เห็นอยู่บนจอ (§5.2 I)`],
            [
              probe.editor.scrollWidth <= w,
              `ไม่ล้นแนวนอน: scrollWidth ${probe.editor.scrollWidth} ≤ ${w} (g17 มือถือ 390)`,
            ],
          ];
          const n = device === "desktop" ? probe.editor.lineRows : probe.editor.lineCards;
          if (spec.name !== "invoice-form-new") {
            // ฟอร์มเปล่ามี 1 บรรทัดว่าง — เฉพาะ fixture เท่านั้นที่ต้องได้ 3 บรรทัดตาม g1
            checks13.push([n === 3, `รายการ 3 บรรทัดตาม g1 (เจอ ${n} — ${device === "desktop" ? "แถวตาราง" : "การ์ดมือถือ"})`]);
            checks13.push([
              probe.editor.contactName.includes("คุณณัฐพล รุ่งเรือง"),
              `ช่องผู้ติดต่อมีชื่อ "คุณณัฐพล รุ่งเรือง" (input.value = "${probe.editor.contactName}")`,
            ]);
            checks13.push([
              /[ก-๙]/.test(probe.editor.issueDateText),
              `วันที่ออกอ่านเป็นไทย ไม่ใช่รูปแบบเบราว์เซอร์ (เจอ "${probe.editor.issueDateText}")`,
            ]);
          } else {
            checks13.push([n === 1, `ฟอร์มเปล่าเริ่มด้วยบรรทัดว่าง 1 บรรทัด (เจอ ${n})`]);
          }
          // Fable QC ภาพจริง 3 ก.ย. ข้อ 1: ตารางรายการเคยถูกตัด (VAT/ก่อนภาษี/🗑 หาย) — ต้องพอดีการ์ดเสมอ
          if (device === "desktop") {
            const tf = probe.editor.tableFits;
            checks13.push([
              !!tf && tf.scrollWidth <= tf.clientWidth + 1,
              `ตารางรายการพอดีการ์ด: scrollWidth ${tf?.scrollWidth ?? "?"} ≤ clientWidth ${tf?.clientWidth ?? "?"}`,
            ]);
          }
          // ข้อ 5: แถบปุ่มท้ายต้องไม่ทับบล็อกแท็ก (มีที่ว่างให้เลื่อนพ้นเสมอ)
          if (probe.editor.tagsBottom !== null && probe.editor.barTop !== null) {
            checks13.push([
              probe.editor.tagsBottom <= probe.editor.barTop + 1,
              `แถบปุ่มท้ายไม่ทับแถว "แท็ก" (ก้นแท็ก ${probe.editor.tagsBottom.toFixed(0)} ≤ หัวแถบ ${probe.editor.barTop.toFixed(0)})`,
            ]);
          }
          // ข้อ 2/7: โหมดเริ่มต้น = นักบัญชี (คอลัมน์ครบตาม g1) · หน้า *-easy = โหมดง่าย (ซ่อน 3 อย่าง)
          if (spec.name === "invoice-form-easy") {
            // 🔴 ข้อสอบเชิงลบต้องมี positive control: ถ้าหน้าไม่โหลด "ไม่เจอช่อง" จะผ่านหลอก ๆ
            //    ⇒ ผูกกับ hasForm เสมอ (ฟอร์มต้องขึ้นจริงก่อน ค่อยพูดได้ว่า "ซ่อนแล้ว")
            const f = probe.editor.hasForm;
            checks13.push([f && !probe.editor.hasPriceMode, `โหมดง่าย: ฟอร์มขึ้นจริง + ซ่อนช่อง "ประเภทราคา"`]);
            checks13.push([f && !probe.editor.hasAccountCol, `โหมดง่าย: ฟอร์มขึ้นจริง + ซ่อนคอลัมน์ "บัญชี"`]);
            checks13.push([f && !probe.editor.hasWhtCol, `โหมดง่าย: ฟอร์มขึ้นจริง + ซ่อนคอลัมน์ "หัก ณ ที่จ่าย"`]);
          } else {
            checks13.push([probe.editor.hasPriceMode, `โหมดนักบัญชี (ค่าเริ่มต้น): มีช่อง "ประเภทราคา" (g1)`]);
            if (spec.name !== "invoice-form-new" || device === "desktop") {
              checks13.push([probe.editor.hasAccountCol, `โหมดนักบัญชี: มีคอลัมน์ "บัญชี" (g1)`]);
              checks13.push([probe.editor.hasWhtCol, `โหมดนักบัญชี: มีคอลัมน์ "หัก ณ ที่จ่าย" (g1)`]);
            }
          }
          if (spec.name === "invoice-form-menu") {
            checks13.push([probe.editor.approveMenuVisible, `กด "อนุมัติใบแจ้งหนี้ ▾" แล้วเมนู [data-testid="approve-menu"] ต้องเปิด (g1-invoice-form-menu.png)`]);
            for (const label of ["อนุมัติและพิมพ์", "อนุมัติและส่งอีเมล", "อนุมัติและรับชำระ"]) {
              checks13.push([probe.all.includes(label), `เมนูอนุมัติมีตัวเลือก "${label}"`]);
            }
          }
          for (const [ok, label] of checks13) {
            if (!ok) failures++;
            console.log(`  ${ok ? "✅" : "❌"} [${spec.name}/${device}] ${label}`);
          }
        }

        // WO 1.4 ส่วน D/F — โครงต้องตรง g2 (ไล่ทีละองค์ประกอบ) + ตัวเลขที่ผู้ใช้เห็นจริง
        if (ASSERT && WO === "1.4") {
          const c: [boolean, string][] = [];
          if (spec.name === "receipt-payment") {
            c.push([probe.editor.hasForm, `ฟอร์มใบเสร็จขึ้นจริง (positive control ของด่านที่เหลือ)`]);
            c.push([probe.pay.hasHeadCard, `การ์ดหัว g2: เลขที่เอกสาร · ผู้ติดต่อ · อ้างอิงใบแจ้งหนี้ · ยอด`]);
            c.push([probe.all.includes(`อ้างอิงใบแจ้งหนี้`), `การ์ดหัวมีป้าย "อ้างอิงใบแจ้งหนี้"`]);
            c.push([probe.all.includes(fx14.invoiceNo), `การ์ดหัวโชว์เลขใบแจ้งหนี้ต้นทาง ${fx14.invoiceNo}`]);
            c.push([probe.pay.hasSection, `มีบล็อก "รับชำระเงิน" [data-testid="pay-section"]`]);
            c.push([probe.pay.hasDepositSection, `มีการ์ด "เงินมัดจำ" (ส่วน D) พร้อมปุ่ม "+ เลือกเงินมัดจำ"`]);
            c.push([probe.all.includes("+ เลือกเงินมัดจำ"), `ปุ่ม "+ เลือกเงินมัดจำ" อยู่บนหน้า (§5.2 D)`]);
            c.push([probe.pay.advancedOn, `สลับเป็นโหมด "ขั้นสูง" แล้วปุ่มถูกกดค้าง (aria-pressed)`]);
            c.push([probe.pay.boxes === 2, `มีกล่องการรับชำระ 2 ครั้งตาม g2 (เจอ ${probe.pay.boxes})`]);
            c.push([probe.pay.whtOn2, `ครั้งที่ 2 เปิด "ถูกหัก ณ ที่จ่าย"`]);
            c.push([probe.pay.amountLabel2.includes("จำนวนเงินรับจริง"), `เปิดถูกหัก ณ ที่จ่ายแล้วป้ายช่องเงินเป็น "จำนวนเงินรับจริง" (g2) — เจอ "${probe.pay.amountLabel2}"`]);
            c.push([probe.pay.amount1 === "14,900.00", `ครั้งที่ 1 จำนวนเงิน 14,900.00 (เจอ "${probe.pay.amount1}")`]);
            c.push([probe.pay.amount2 === "9,301.87", `ครั้งที่ 2 จำนวนเงินรับจริง 9,301.87 (เจอ "${probe.pay.amount2}")`]);
            c.push([probe.pay.whtAmount2 === "698.13", `ครั้งที่ 2 จำนวนภาษี 698.13 (เจอ "${probe.pay.whtAmount2}")`]);
            c.push([probe.pay.certHint, `มีแถบ "สร้างเอกสารหัก ณ ที่จ่าย … ให้อัตโนมัติ" ใต้กล่องครั้งที่ 2 (g2)`]);
            c.push([probe.all.includes("ยอดคงค้างหลังชำระ"), `มีป้าย "ยอดคงค้างหลังชำระ"`]);
            c.push([probe.all.includes("เพิ่มการรับชำระ"), `มีปุ่ม "+ เพิ่มการรับชำระ"`]);
            c.push([probe.editor.scrollWidth <= w, `ไม่ล้นแนวนอน: scrollWidth ${probe.editor.scrollWidth} ≤ ${w}`]);
          }
          if (spec.name === "invoice-detail-payment") {
            c.push([probe.pay.slideOverVisible, `กด "รับชำระ" แล้วแผง SlideOver ต้องเปิดอยู่จริงบนจอ`]);
            c.push([probe.pay.hasSection, `ในแผงมีบล็อกรับชำระตัวเดียวกับฟอร์มใบเสร็จ (g2)`]);
            c.push([probe.pay.hasRecordButton, `แผงมีปุ่ม "บันทึกการชำระ" [data-testid="btn-record-payments"]`]);
            c.push([probe.editor.scrollWidth <= w, `ไม่ล้นแนวนอน: scrollWidth ${probe.editor.scrollWidth} ≤ ${w}`]);
          }
          for (const [okc, label] of c) {
            if (!okc) failures++;
            console.log(`  ${okc ? "✅" : "❌"} [${spec.name}/${device}] ${label}`);
          }
        }

        // WO 0.4 shell V2 — เช็คโครงสร้างเมนู (ทุกหน้าที่มี layout บัญชี จะมี tabbar/breadcrumb เหมือนกัน)
        if (ASSERT && WO === "0.4") {
          const checks: [boolean, string][] = [
            [probe.acc.hasTabbar, `แถบเมนู [data-testid="acc-tabbar"] มีอยู่จริง`],
            [probe.acc.menuCount === 9, `แถบเมนูมี 9 หมวด (เจอ ${probe.acc.menuCount})`],
            [probe.acc.breadcrumbText.startsWith("บัญชี"), `breadcrumb ขึ้นต้นด้วย "บัญชี" (เจอ "${probe.acc.breadcrumbText}")`],
            [probe.acc.badDeadLink === null, `ไม่มีลิงก์ href="#" ที่ไม่มีชิป "เร็ว ๆ นี้"${probe.acc.badDeadLink ? ` (เจอ "${probe.acc.badDeadLink}")` : ""}`],
          ];
          if (spec.name === "hub") checks.push([status === 200 && probe.h1.length > 0, `account root คืน 200 + มี h1 (h1="${probe.h1}")`]);
          // เช็คที่มาจากบั๊กที่ Fable เจอตอนตรวจภาพจริงรอบ 2: dropdown เปิดด้วยคลิกไม่ค้าง (ปิดเองก่อนถ่าย)
          if (spec.name === "menu-open") {
            if (device === "desktop") checks.push([probe.acc.dropdownVisible, `คลิก "รายรับ" แล้ว dropdown [data-testid="acc-dropdown"] ต้องเปิดค้างอยู่ (rect > 0 + visible)`]);
            else checks.push([probe.acc.sheetL1Visible, `แตะ "รายรับ" แล้ว bottom sheet ชั้น 1 ต้องเปิดอยู่`]);
          }
          if (spec.name === "menu-flyout") {
            checks.push([probe.acc.dropdownVisible, `dropdown ระดับ 1 ยังเปิดอยู่ขณะ hover เข้ารายการ`]);
            checks.push([probe.acc.flyoutVisible, `hover "ใบแจ้งหนี้" แล้ว flyout ระดับ 2 [data-testid="acc-flyout"] ต้องเปิด (f2 พาเนลขวา)`]);
            // Fable QC รอบ 2 ข้อ 1: dropdown ต้องอยู่ใต้แถบเมนูพอดี (top ≥ ก้นแถบเมนู) และไม่ทะลุขอบล่างจอ
            if (probe.acc.tabbarRect && probe.acc.dropdownRect) {
              const tb = probe.acc.tabbarRect;
              const dd = probe.acc.dropdownRect;
              checks.push([
                dd.top >= tb.bottom - 1, // เผื่อ 1px ปัดเศษ subpixel
                `dropdown.top (${dd.top.toFixed(1)}) ≥ แถบเมนู.bottom (${tb.bottom.toFixed(1)})`,
              ]);
              checks.push([
                dd.bottom <= probe.viewportH + 1,
                `dropdown.bottom (${dd.bottom.toFixed(1)}) ≤ ความสูงจอ (${probe.viewportH})`,
              ]);
            } else {
              checks.push([false, `อ่าน getBoundingClientRect ของแถบเมนู/dropdown ไม่ได้ (element หาย)`]);
            }
          }
          if (spec.name === "sheet-l2") {
            checks.push([probe.acc.sheetL2Visible, `แตะ "ใบแจ้งหนี้" แล้ว sheet ชั้น 2 [data-testid="acc-sheet-l2"] ต้องเปิด (g18)`]);
            checks.push([probe.acc.sheetL2HasBackArrow, `sheet ชั้น 2 ต้องมีปุ่มย้อนกลับ (‹) ในหัว`]);
          }
          for (const [ok, label] of checks) {
            if (!ok) failures++;
            console.log(`  ${ok ? "✅" : "❌"} [${spec.name}/${device}] ${label}`);
          }

          // Fable QC รอบ 2 ข้อ 2: ตัวนับใน flyout ต้องตรงกับ tabCounts จริงของหน้ารายการ (แหล่งเดียวกัน ไม่ใช่สูตรที่สอง)
          // เทียบ DOM (badge ที่ AccountTabBar เรนเดอร์จาก accountFlyoutCounts()) กับผลลัพธ์ตรงจาก listDocumentsPaged()
          // ที่ query DB จริงด้วยฟิลเตอร์เดียวกับหน้ารายการ (excludeOverdue) — เป็นแหล่งอิสระคนละทาง ไม่ใช่เช็คฟังก์ชันกับตัวเอง
          if (spec.name === "menu-flyout" && device === "desktop" && listDocumentsPaged) {
            const ldp = listDocumentsPaged; // alias เพื่อให้ TS narrow ทะลุ Promise.all ได้ (let ไม่ narrow ข้าม closure)
            const awaiting: { total: number } = await ldp(E.tenantId, SYS, { docType: "INVOICE", status: "AWAITING_PAYMENT", excludeOverdue: true, pageSize: 1 });
            const overdue: { total: number } = await ldp(E.tenantId, SYS, { docType: "INVOICE", status: "OVERDUE", pageSize: 1 });
            const all: { total: number } = await ldp(E.tenantId, SYS, { docType: "INVOICE", status: "ALL", pageSize: 1 });
            const domChecks: [string, number][] = [
              ["acc-count-INVOICE:awaiting", awaiting.total],
              ["acc-count-INVOICE:overdue", overdue.total],
              ["acc-count-INVOICE:all", all.total],
            ];
            for (const [tid, expected] of domChecks) {
              const got = probe.testids[tid];
              const ok = String(got ?? "") === String(expected);
              if (!ok) failures++;
              console.log(`  ${ok ? "✅" : "❌"} [${spec.name}/${device}] [data-testid="${tid}"] = ${JSON.stringify(got)} · listDocumentsPaged() ตรงจาก DB = ${expected}`);
            }
          }
        }
        await page.close();
      }
      console.log(`📸 ${spec.name.padEnd(14)} ${spec.path}\n   ${line.join(" | ")}${spec.note ? `\n   ${spec.note}` : ""}`);
      console.log(`   ${OUT}/${spec.name}-desktop.png · ${OUT}/${spec.name}-mobile.png`);
    }
  } finally {
    await browser.close();
  }
} finally {
  if (cleanupFixture) await cleanupFixture();
  const { count } = await prisma.session.deleteMany({ where: { userAgent: UA } });
  const left = await prisma.session.count({ where: { userAgent: UA } });
  console.log(`\nลบ session ทดสอบ ${count} แถว · เหลือค้าง ${left} (ต้องเป็น 0)`);
  await prisma.$disconnect();
}

console.log(`\n===== VISUAL ACC V2 · WO ${WO} =====`);
console.log(failures === 0 ? `ผ่านทั้งหมด · ภาพอยู่ที่ ${OUT}/` : `ตก ${failures} ข้อ`);
process.exit(failures > 0 ? 1 : 0);
