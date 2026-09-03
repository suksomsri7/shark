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

import { mkdirSync, readFileSync, existsSync, writeFileSync } from "node:fs";
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

// ─────────── fixture ของ WO 1.5: หน้าเอกสาร V2 — ใช้ของที่ seed ไว้แล้วล้วน (อ่านอย่างเดียว ไม่สร้าง/ไม่ลบ) ───────────
// ใบแจ้งหนี้โรงแรมสิมิลันวิว (E.fixtures.invSimilanViewId — PARTIAL 124,500 / paid 62,250 · seed-acc-v2-qc.mts)
// + บันทึกค่าใช้จ่าย "ค่าน้ำมันเรือ มิ.ย." (PAID เต็มจำนวน) — ไม่มี id ผูกใน acc-v2-expected.json (ยังไม่ต้องใช้ที่อื่น)
// จึงหาแบบ deterministic ด้วย docType+desc ที่ seed สร้างซ้ำได้ทุกครั้งเหมือนกัน (idempotent seed)
let fx15 = { expensePaidId: "" };
if (WO === "1.5") {
  const { prisma: db } = await import("@/lib/core/db");
  const exp = await db.accountDocument.findFirst({
    where: {
      systemId: SYS,
      docType: "EXPENSE",
      status: "PAID",
      lines: { some: { description: { contains: "ค่าน้ำมันเรือ มิ.ย." } } },
    },
    select: { id: true, docNo: true },
  });
  if (!exp) throw new Error('fixture 1.5: ไม่พบบันทึกค่าใช้จ่าย "ค่าน้ำมันเรือ มิ.ย." (PAID) — รัน seed-acc-v2-qc ก่อน');
  fx15 = { expensePaidId: exp.id };
  console.log(`[fixture 1.5] ใบแจ้งหนี้โรงแรมสิมิลันวิว = ${E.fixtures.invSimilanViewId} · บันทึกค่าใช้จ่าย ${exp.docNo} = ${exp.id}\n`);
}


// ─────────── fixture ของ WO 1.7: ใบวางบิลรวม (§5.2 K) ───────────
// ต้องมีของจริงในฐานข้อมูล ภาพถึงจะพิสูจน์อะไรได้: ผู้ติดต่อชั่วคราว 1 ราย + ใบแจ้งหนี้ 6 ใบ
//   • 3 ใบแรก → เข้าใบวางบิล (ใช้ถ่ายหน้ารายละเอียด "เอกสารในกลุ่ม")
//   • 3 ใบหลัง → ปล่อยว่าง (ใช้ถ่ายฟอร์มสร้างที่ติ๊กครบ 3 ใบ + แถบ bulk ที่ติ๊ก 2 ใบ)
// 🔴 ลบทิ้งเสมอใน finally — ใบแจ้งหนี้ที่ออกแล้วจะไปเพิ่มตัวนับแท็บของ WO 1.1 (เฉลย IV ทั้งหมด 51 ใบ)
const FIXTURE_REF_17 = "QC-VISUAL-1.7";
let fx17 = { contactId: "", bnId: "", bnDocNo: "", freeIds: [] as string[], freeDocNos: [] as string[], freeSum: 0, groupSum: 0 };
if (WO === "1.7") {
  const { prisma: db } = await import("@/lib/core/db");
  const svc = await import("@/lib/modules/account/service");
  const grp = await import("@/lib/modules/account/group");
  cleanupFixture = async () => {
    const stale = await db.accountDocument.findMany({
      where: { systemId: SYS, OR: [{ reference: FIXTURE_REF_17 }, { note: FIXTURE_REF_17 }] },
      select: { id: true },
    });
    const ids = stale.map((d) => d.id);
    if (ids.length) {
      await db.accountJournalLine.deleteMany({ where: { entry: { systemId: SYS, refId: { in: ids } } } });
      await db.accountJournalEntry.deleteMany({ where: { systemId: SYS, refId: { in: ids } } });
      await db.accountDocumentPayment.deleteMany({ where: { documentId: { in: ids } } });
      await db.accountDocumentRelation.deleteMany({ where: { OR: [{ fromId: { in: ids } }, { toId: { in: ids } }] } });
      await db.accountDocumentLine.deleteMany({ where: { documentId: { in: ids } } });
      await db.accountDocument.updateMany({ where: { id: { in: ids } }, data: { sourceDocId: null } });
      await db.accountDocument.deleteMany({ where: { id: { in: ids } } });
    }
    const del = await db.accountContact.deleteMany({ where: { systemId: SYS, note: FIXTURE_REF_17 } });
    console.log(`ลบ fixture ของ WO 1.7 ${ids.length} ใบ + ผู้ติดต่อชั่วคราว ${del.count} ราย (ตัวนับแท็บ WO 1.1 กลับเท่าเฉลย)`);
  };
  await cleanupFixture(); // กันซากจากรอบที่ล้มกลางคัน

  const contact = await svc.createContact({
    tenantId: E.tenantId,
    systemId: SYS,
    kind: "CUSTOMER",
    legalType: "COMPANY",
    name: "บจก. อันดามัน ทราเวล (QC วางบิลรวม)",
    note: FIXTURE_REF_17,
  });
  const dayPlus = (n: number) => {
    const d = new Date(`${QC.today}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d;
  };
  const mkIv = async (priceSatang: number, dueOffset: number) => {
    const d = await svc.createDocument({
      tenantId: E.tenantId,
      systemId: SYS,
      docType: "INVOICE",
      contactId: contact.id,
      issueDate: new Date(`${QC.today}T00:00:00.000Z`),
      dueDate: dayPlus(dueOffset),
      vatMode: "EXCLUDE",
      vatTiming: "ON_ISSUE",
      note: FIXTURE_REF_17,
      lines: [{ description: "ทริปดำน้ำหมู่เกาะสิมิลัน", qty: 1, unitName: "งาน", unitPrice: priceSatang, discount: 0, vatRateBp: 700 }],
      createdById: E.ownerUserId,
    });
    const r = await svc.issueDocument(E.tenantId, SYS, d.id);
    if (!r.ok) throw new Error("fixture 1.7: ออกใบแจ้งหนี้ไม่สำเร็จ — " + r.reason);
    return d.id;
  };
  const g1 = await mkIv(8_640_000, 5);
  const g2 = await mkIv(4_800_000, 12);
  const g3 = await mkIv(2_490_000, 19);
  const f1 = await mkIv(6_230_000, 7);
  const f2 = await mkIv(3_840_000, 14);
  const f3 = await mkIv(1_550_000, 21);
  const bn = await grp.createGroupDoc(E.tenantId, SYS, {
    docType: "BILLING_NOTE",
    contactId: contact.id,
    issueDate: QC.today,
    dueDate: dayPlus(20).toISOString().slice(0, 10),
    note: FIXTURE_REF_17,
    childIds: [g1, g2, g3],
    createdById: E.ownerUserId,
  });
  if (!bn.ok) throw new Error("fixture 1.7: ออกใบวางบิลรวมไม่สำเร็จ — " + bn.reason);
  const freeDocs = await db.accountDocument.findMany({
    where: { id: { in: [f1, f2, f3] } },
    select: { id: true, docNo: true, grandTotal: true },
  });
  const byId = new Map(freeDocs.map((d) => [d.id, d]));
  fx17 = {
    contactId: contact.id,
    bnId: bn.id,
    bnDocNo: bn.docNo,
    freeIds: [f1, f2, f3],
    freeDocNos: [f1, f2, f3].map((id) => byId.get(id)?.docNo ?? ""),
    freeSum: freeDocs.reduce((s, d) => s + d.grandTotal, 0),
    groupSum: bn.total,
  };
  console.log(`[fixture 1.7] ใบวางบิล ${bn.docNo} = ${bn.id} · ใบแจ้งหนี้ว่าง 3 ใบ รวม ${fx17.freeSum / 100} บาท\n`);
}

// ─────────── WO 1.8: ตัวช่วยนำเข้า CSV — ไฟล์ 20 แถว (18 ok + 2 err: วันที่ผิด/ยอดติดลบ) ───────────
// เฉลย WO 1.8 (BLUEPRINT §1): "นำเข้า 20 แถว (2 แถวผิด) → 18 ร่าง + 2 error ชี้บรรทัด"
// เพื่อให้ 18 แถวได้สถานะ "ok" ล้วน (ไม่ใช่ "warn: ผู้ติดต่อไม่พบ") ต้องมีผู้ติดต่อ 18 รายนี้อยู่ในระบบก่อนอัปโหลดไฟล์
// 🔴 เอกสารที่นำเข้าจริงตอนกดชัตเตอร์เป็นร่าง INVOICE จริง — ถ้าไม่ลบทิ้ง ตัวนับแท็บ IV ของ WO 1.1 (เฉลย 51/3/12/2/29/4/1)
//    จะเพี้ยนไป +18 ทันที ⇒ cleanupFixture ลบทั้งเอกสาร (source=IMPORT) และผู้ติดต่อชั่วคราว (note=FIXTURE_REF_18)
const FIXTURE_REF_18 = "QC-VISUAL-1.8";
// 🔴 ต้องอยู่ใต้ /root/ ไม่ใช่ /tmp/ — chromium ตัวนี้คือ snap (strict confinement) มี /tmp ส่วนตัวของมันเอง
//    elementHandle.uploadFile("/tmp/...") จะเห็นไฟล์ "มีอยู่" ฝั่ง input.files แต่พออ่านเนื้อไฟล์จริง (File.text())
//    จะได้ DOMException NotFoundError เงียบ ๆ (ดู reference_snap_chromium_headless.md) — วางไว้ใต้โฟลเดอร์โปรเจกต์แทน
//
// 🔴 Fable QC รอบ 1: spec เดียวกันวนถ่ายทั้ง desktop+mobile ด้วยไฟล์เดียวกัน — ขั้น ⑤ (กดนำเข้าจริง) ทำ 2 รอบ
//    ด้วย refId เดิม (fileHash เดียวกัน) ⇒ รอบมือถือชนกับ idempotency ของรอบเดสก์ท็อป (สร้างใหม่ 0 · ข้าม 20)
//    แก้: แยกไฟล์คนละชุดต่อ device (คนละ "เลขอ้างอิง"/ผู้ติดต่อ) + spec ผลลัพธ์แยก onlyDevice ต่อไฟล์
const FIXTURE_CSV_PATH_18 = `${QC.shotsDir}/1.8-fixture-a.csv`; // ใช้เดสก์ท็อป (และ preview ทั้งคู่ device — preview ไม่สร้างอะไรจริง)
const FIXTURE_CSV_PATH_18_MOBILE = `${QC.shotsDir}/1.8-fixture-b.csv`; // ใช้มือถือเท่านั้น (คนละชุดข้อมูล กันชนกับรอบเดสก์ท็อป)
if (WO === "1.8") {
  const { prisma: db } = await import("@/lib/core/db");
  const svc = await import("@/lib/modules/account/service");
  const IS18 = await import("@/lib/modules/account/import-shared");
  cleanupFixture = async () => {
    const delDocs = await db.accountDocument.deleteMany({ where: { systemId: SYS, source: "IMPORT" } });
    const delContacts = await db.accountContact.deleteMany({ where: { systemId: SYS, note: FIXTURE_REF_18 } });
    console.log(`ลบ fixture ของ WO 1.8: เอกสารนำเข้า ${delDocs.count} ใบ + ผู้ติดต่อชั่วคราว ${delContacts.count} ราย (ตัวนับแท็บ WO 1.1 กลับเท่าเฉลย)`);
  };
  await cleanupFixture(); // กันซากจากรอบที่ล้มกลางคัน

  const headers18 = IS18.IMPORT_FIELDS.documents_revenue.map((f: { aliases: string[] }) => f.aliases[0]);
  mkdirSync(QC.shotsDir, { recursive: true });

  const seedFixtureSet = async (refPrefix: string, nameSuffix: string, path: string) => {
    for (let i = 1; i <= 18; i++) {
      await svc.createContact({
        tenantId: E.tenantId,
        systemId: SYS,
        kind: "CUSTOMER",
        legalType: "COMPANY",
        name: `ลูกค้า QC ภาพ ${nameSuffix}${i}`,
        note: FIXTURE_REF_18,
      });
    }
    const rows: string[][] = [];
    for (let i = 1; i <= 18; i++) {
      rows.push([`${refPrefix}-${i}`, "IV", QC.today, `ลูกค้า QC ภาพ ${nameSuffix}${i}`, "", `สินค้า QC ${i}`, "1", "ชิ้น", "1000", "0", "7", ""]);
    }
    rows.push([`${refPrefix}-BAD-DATE`, "IV", "01-09-2026", `ลูกค้า QC ภาพ ${nameSuffix} วันที่ผิด`, "", "สินค้า", "1", "ชิ้น", "100", "0", "7", ""]);
    rows.push([`${refPrefix}-NEG`, "IV", QC.today, `ลูกค้า QC ภาพ ${nameSuffix} ยอดลบ`, "", "สินค้า", "1", "ชิ้น", "-100", "0", "7", ""]);
    const csv = "﻿" + [headers18.join(","), ...rows.map((r) => r.join(","))].join("\n") + "\n";
    writeFileSync(path, csv, "utf8");
  };
  await seedFixtureSet("QCVIS-A", "A", FIXTURE_CSV_PATH_18);
  await seedFixtureSet("QCVIS-B", "B", FIXTURE_CSV_PATH_18_MOBILE);
  console.log(`[fixture 1.8] เขียนไฟล์ตัวอย่าง 2 ชุด (คนละ device — กัน idempotency ชนกัน) + ผู้ติดต่อ 36 ราย\n`);
}

// ─────────── fixture ของ WO 1.9: เอกสารประจำ 2 กฎ + แจ้งเตือน 3 รายการ ───────────
// ต้องมีของจริงในฐานข้อมูล ภาพถึงจะพิสูจน์อะไรได้ (หน้ารายการเปล่า = ภาพ empty state ไม่ใช่ตาราง)
// 🔴 ลบทิ้งเสมอใน finally — กฎที่ค้างไว้จะถูก cron/ปุ่ม "สร้างรอบที่ถึงกำหนด" หยิบไปออกเอกสารจริง
//    และแจ้งเตือนที่ค้างจะไปเพิ่มตัวนับกระดิ่งของชุด QC อื่น
const FIXTURE_REF_19 = "QC-VISUAL-1.9";
let fx19 = { ruleMonthlyId: "", ruleWeeklyId: "" };
if (WO === "1.9") {
  const { prisma: db } = await import("@/lib/core/db");
  const svc = await import("@/lib/modules/account/service");
  const rs = await import("@/lib/modules/account/recurring-shared");
  cleanupFixture = async () => {
    const rules = await db.accountRecurringRule.findMany({
      where: { systemId: SYS, name: { startsWith: FIXTURE_REF_19 } },
      select: { id: true },
    });
    const ids = rules.map((r) => r.id);
    if (ids.length > 0) {
      const runs = await db.accountRecurringRun.findMany({ where: { ruleId: { in: ids } }, select: { documentId: true } });
      const docIds = runs.map((r) => r.documentId);
      await db.accountRecurringRun.deleteMany({ where: { ruleId: { in: ids } } });
      if (docIds.length > 0) {
        await db.accountDocumentLine.deleteMany({ where: { documentId: { in: docIds } } });
        await db.accountDocument.deleteMany({ where: { id: { in: docIds } } });
      }
      await db.accountRecurringRule.deleteMany({ where: { id: { in: ids } } });
    }
    const noti = await db.appNotification.deleteMany({ where: { tenantId: E.tenantId, body: { contains: FIXTURE_REF_19 } } });
    console.log(`ลบ fixture ของ WO 1.9: กฎ ${ids.length} ตัว + แจ้งเตือน ${noti.count} รายการ`);
  };
  await cleanupFixture(); // กันซากจากรอบที่ล้มกลางคัน

  const tplLine = (name: string, priceSatang: number) => ({
    name,
    description: "",
    qty: 1,
    unitName: "เดือน",
    unitPriceSatang: priceSatang,
    vatRateBp: 700,
    discountSatang: 0,
    productId: null,
    accountId: null,
  });
  const mk = async (name: string, freq: "MONTHLY" | "WEEKLY", lineName: string, price: number, dayOfMonth: number | null, weekday: number | null, autoApprove: boolean) => {
    const res = await svc.createRecurringRule(
      E.tenantId,
      SYS,
      {
        name: `${FIXTURE_REF_19} ${name}`,
        docType: "INVOICE",
        contactId: E.fixtures.contactNattapholId,
        template: rs.parseRecurringTemplate({ priceMode: "EXCL_VAT", lines: [tplLine(lineName, price)], dueDays: 7 }),
        frequency: freq,
        dayOfMonth,
        weekday,
        // วันที่เริ่มเป็นอนาคตเสมอ → ยังไม่ถึงรอบ ⇒ fixture ไม่ไปสร้างเอกสารจริงใส่ตัวนับแท็บของ WO 1.1
        startDate: new Date(Date.now() + 20 * 86_400_000),
        endDate: null,
        leadDays: 0,
        autoApprove,
        active: true,
      },
      E.ownerUserId,
    );
    if (!res.ok) throw new Error(`fixture 1.9: สร้างกฎ "${name}" ไม่สำเร็จ — ${res.reason}`);
    return res.id;
  };
  fx19 = {
    ruleMonthlyId: await mk("ค่าเช่าสำนักงาน", "MONTHLY", "ค่าเช่าสำนักงาน", 1_500_000, 1, null, false),
    ruleWeeklyId: await mk("ค่าบริการดูแลระบบ", "WEEKLY", "ค่าบริการดูแลระบบรายสัปดาห์", 350_000, null, 1, true),
  };

  // แจ้งเตือน 3 รายการของ "ศูนย์แจ้งเตือน" — จ่าหน้าถึงเจ้าของ QC โดยตรง (G11 · ไม่ใช่ประกาศทั้งร้าน)
  for (const [title, body] of [
    ["ครบกำหนดพรุ่งนี้", "ใบแจ้งหนี้ IV-2026-09-0042 · คุณณัฐพล — ต้องเก็บ ฿24,900.00"],
    ["พ้นกำหนดชำระแล้ว", "ใบแจ้งหนี้ IV-2026-08-0031 · โรงแรมสิมิลันวิว — ต้องเก็บ ฿62,250.00"],
    ["เช็คถึงกำหนด", "เช็คจ่าย 0012345 ธนาคารกสิกรไทย ฿18,000.00 — ถึงกำหนดในอีก 2 วัน"],
  ] as const) {
    await db.appNotification.create({
      data: { tenantId: E.tenantId, recipientUserId: E.ownerUserId, title, body: `${body} · ${FIXTURE_REF_19}` },
    });
  }
  console.log(`[fixture 1.9] กฎเอกสารประจำ 2 ตัว + แจ้งเตือน 3 รายการ\n`);
}

// ─────────── fixture ของ WO 3.3: ค่าที่ใช้ยิงสถานะ "เตือนซ้ำ" ของ modal (§7.2) ───────────
// ต้องเป็นชื่อ+เบอร์ของผู้ติดต่อที่ **มีอยู่จริงใน DB QC** ไม่ใช่ค่าที่พิมพ์ทิ้งไว้ในสคริปต์
// (ค่า hardcode = ระเบิดเวลาเมื่อ seed เปลี่ยน — บทเรียน feedback_oracle_rots_over_time)
// ไม่สร้าง/ไม่ลบข้อมูลอะไรเลย: อ่านอย่างเดียว ⇒ ตัวนับผู้ติดต่อ 63 ไม่ขยับ
let fx33 = { dupName: "", dupPhone: "", dupCode: "" };
if (WO === "3.3") {
  const { prisma: db } = await import("@/lib/core/db");
  const c = await db.accountContact.findFirst({
    where: { systemId: SYS, name: "ปิยธิดา อินสุ่ม", archivedAt: null },
    select: { name: true, phone: true, code: true },
  });
  if (!c?.phone) throw new Error('fixture 3.3: ไม่พบผู้ติดต่อ "ปิยธิดา อินสุ่ม" ที่มีเบอร์ — รัน seed-acc-v2-qc ก่อน');
  fx33 = { dupName: c.name, dupPhone: c.phone, dupCode: c.code ?? "" };
  const before = await db.accountContact.count({ where: { systemId: SYS } });
  const startedAt = new Date();
  console.log(`[fixture 3.3] ผู้ติดต่อที่จะใช้ยิงสถานะเตือนซ้ำ = ${c.code ?? "(ยังไม่ backfill เลขที่)"} ${c.name} · ผู้ติดต่อก่อนถ่าย ${before} ราย\n`);
  // 🔴 ตาข่ายกันพลาด: ภาพ "เตือนซ้ำ" ต้องกดปุ่มบันทึกจริง ถ้า flow เพี้ยนแล้วบันทึกสำเร็จ จะได้ผู้ติดต่อเกินมา
  //    ⇒ ลบทุกแถวที่เกิดหลังกล้องเริ่มทำงานเสมอ (ตัวนับ 63 ของ acc-v2-expected.json ห้ามขยับเด็ดขาด)
  cleanupFixture = async () => {
    const extra = await db.accountContact.findMany({
      where: { systemId: SYS, createdAt: { gte: startedAt } },
      select: { id: true, name: true, partyId: true },
    });
    if (extra.length === 0) return;
    await db.accountContactGroupMember.deleteMany({ where: { contactId: { in: extra.map((e) => e.id) } } });
    await db.accountContact.deleteMany({ where: { id: { in: extra.map((e) => e.id) } } });
    const pids = extra.map((e) => e.partyId).filter((x): x is string => !!x);
    if (pids.length > 0) await db.party.deleteMany({ where: { id: { in: pids }, tenantId: E.tenantId } });
    console.log(`⚠️  ลบผู้ติดต่อที่เกิดระหว่างถ่ายภาพ ${extra.length} ราย (flow เตือนซ้ำบันทึกทะลุ) — ตัวนับกลับเป็น ${before}`);
  };
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
  flow?: FlowStep[];
  /** WO 1.4: สถานะที่ต้อง "จริงบนจอ" ก่อนกดชัตเตอร์ — ไม่ผ่าน = ตกด่าน + ไม่ถ่ายภาพหลอกตา
   *  (บทเรียน Fable รอบ 1: flow คลิกพลาดเงียบ ๆ แล้วได้ภาพที่ไม่ใช่สถานะเฉลย g2) */
  expectBeforeShot?: { sel: string; kind: "value" | "text"; equals: string }[];
  /** ทำให้แถบ sticky เรนเดอร์ในสายน้ำปกติชั่วคราวก่อนถ่าย fullPage
   *  เหตุผล: fullPage screenshot วาด element `position:sticky` ไว้ที่ "ขอบล่าง viewport ปัจจุบัน"
   *  ⇒ หน้าที่ยาวกว่า 1 จอ แถบปุ่มจะไปทับเนื้อหากลางหน้าในภาพ ทั้งที่บนจอจริงไม่ทับ
   *  (ความ sticky ยังถูกตรวจแยกด้วย `stickyBarVisible` ก่อนสั่ง unstick) */
  unstickForShot?: string[];
  /** WO 3.3: คลี่ modal (overlay `fixed` + เนื้อหา `overflow-y-auto`) ให้ยืดเต็มความสูงก่อนถ่าย fullPage
   *  เหตุผล: modal สูงกว่า 90vh ⇒ ภาพ fullPage จะได้แค่ครึ่งบน ทำให้ด่าน parity กับ g5 ตรวจไม่ได้จริง
   *  (ความ "เลื่อนได้ในตัว" ถูกพิสูจน์แยกด้วย qc-acc-v2-contact-modal + การเปิดบนจอจริง) */
  expandModalForShot?: string;
};

type FlowStep =
  | { click: string }
  | { fill: string; value: string }
  | { select: string; value: string }
  | { waitFor: string }
  /** WO 3.3: ยืนยันว่าค่าที่พิมพ์ลงช่อง "ถึงจริง" ก่อนจะไปขั้นถัดไป — ไม่ตรง = **หยุด flow ทั้งชุด**
   *  เหตุผล: ขั้นถัดไปมักเป็นการกดปุ่มที่ "เขียนข้อมูลจริง" (เช่น บันทึกผู้ติดต่อ) ถ้าค่าที่พิมพ์หล่น
   *  จะได้ภาพผิดสถานะ **และ** ทิ้งขยะไว้ใน DB QC (เจอจริง 4 ก.ย.: สร้างผู้ติดต่อเกินมา 1 ราย → ตัวนับ 63 เพี้ยน) */
  | { assertValue: string; equals: string }
  /** WO 1.8: อัปโหลดไฟล์เข้า <input type="file"> ผ่าน DevTools (puppeteer ElementHandle.uploadFile) */
  | { upload: string; filePath: string };
const PAGES: Record<string, PageSpec[]> = {
  "0.1": [
    { name: "hub", path: `/app/sys/${SYS}`, note: "หน้าแรกระบบบัญชี (AccountContent)", expect: ["บัญชี", E.tenantName] },
    { name: "invoice-list", path: `/app/sys/${SYS}/account/docs/INVOICE`, note: "หน้ารายการใบแจ้งหนี้ (เฟรม f3)", expect: ["ใบแจ้งหนี้", E.fixtures.invNattapholDocNo] },
    { name: "account-root", path: `/app/sys/${SYS}/account`, note: "⚠️ ยังไม่มี page.tsx → 404 (ลิงก์ '← ระบบบัญชี' ใน layout ตายอยู่ — ยังไม่ถูกแก้หลัง WO 0.2 → ส่งต่อ WO 0.4 shell V2)" },
  ],
  // WO 0.4 (Shell V2): แถบเมนู 9 หมวด + dropdown 2 ระดับ (เดสก์ท็อป) / bottom sheet 2 ชั้น (มือถือ) + breadcrumb
  // "account-root" ของ 0.1 คือ "hub" ที่นี่ — ตอนนี้มี page.tsx แล้ว (แก้บั๊ก 404 ledger/wo-notes/0.1.md ข้อ 8)
  // WO 1.7 — ใบวางบิลรวม/ใบรวมจ่าย (§5.2 K) · แถบ bulk ตาม f3-invoice-list-menu.png
  "1.7": [
    {
      name: "invoice-list-bulk",
      path: `/app/sys/${SYS}/account/docs/INVOICE?contact=${fx17.contactId}`,
      note: 'หน้ารายการใบแจ้งหนี้ ติ๊ก 2 แถว → แถบ bulk "เลือก 2 รายการ · ออกใบวางบิลรวม" (f3-invoice-list-menu.png)',
      expect: ["ใบแจ้งหนี้"],
      onlyDevice: "desktop", // แถบ bulk มาจาก checkbox ในตาราง — การ์ดมือถือ (f13) ไม่มี checkbox ตามแบบ
      flow: [
        { waitFor: `[data-testid="row-${fx17.freeDocNos[0]}"]` },
        { click: `[data-testid="row-${fx17.freeDocNos[0]}"] input[type="checkbox"]` },
        { click: `[data-testid="row-${fx17.freeDocNos[1]}"] input[type="checkbox"]` },
      ],
      expectBeforeShot: [{ sel: '[data-testid="list-docs-bulk-bar"]', kind: "text", equals: "เลือก 2 รายการ" }],
    },
    {
      name: "bn-new",
      path: `/app/sys/${SYS}/account/docs/BILLING_NOTE/new?ids=${fx17.freeIds.join(",")}`,
      note: "ฟอร์มใบวางบิลรวม (§5.2 K) ติ๊กใบแจ้งหนี้ไว้ 3 ใบ + รวมยอดที่เลือก",
      expect: ["ออกใบวางบิลรวม", "รวมยอดที่เลือก"],
    },
    {
      name: "bn-detail",
      path: `/app/sys/${SYS}/account/docs/BILLING_NOTE/${fx17.bnId}`,
      note: 'หน้าเอกสารใบวางบิล — ตาราง "เอกสารในกลุ่ม" แทนตารางสินค้า + ปุ่มดำ "รับชำระ"',
      expect: [fx17.bnDocNo, "รับชำระ"],
    },
  ],
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
        { waitFor: '[data-testid="pay-box-2"]' },
        { click: '[data-testid="pay-wht-toggle-2"]' },
        // ช่อง "จำนวนภาษี" โผล่เฉพาะเมื่อ toggle ติดจริง → ใช้เป็นตัวยืนยันว่าคลิกเข้า ไม่ใช่เดาเวลา
        { waitFor: '[data-testid="pay-wht-amount-2"]' },
        { select: '[data-testid="pay-wht-type-2"]', value: "M40_8" },
        { fill: '[data-testid="pay-wht-rate-2"]', value: "3" },
        { fill: '[data-testid="pay-amount-2"]', value: "9301.87" },
      ],
      // ต้องเป็นสถานะเฉลย g2 ทั้ง 2 ขนาดจอก่อนถ่าย (ไม่ผ่าน = ตกด่าน ไม่ใช่ภาพผ่าน ๆ)
      expectBeforeShot: [
        { sel: '[data-testid="pay-amount-1"]', kind: "value", equals: "14,900.00" },
        { sel: '[data-testid="pay-amount-2"]', kind: "value", equals: "9,301.87" },
        { sel: '[data-testid="pay-wht-amount-2"]', kind: "value", equals: "698.13" },
        { sel: '[data-testid="pay-total-2"]', kind: "text", equals: "฿10,000.00" },
        { sel: '[data-testid="pay-outstanding"]', kind: "text", equals: "฿0.00" },
        { sel: '[data-testid="pay-summary-paid"]', kind: "text", equals: "฿24,201.87" },
        { sel: '[data-testid="pay-summary-wht"]', kind: "text", equals: "฿698.13" },
      ],
      unstickForShot: ['[data-testid="editor-actions"]'],
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
  // WO 1.5 — หน้าเอกสาร V2 (§5.3) เทียบ g4-invoice-detail.png (desktop) + f14-m-doc-detail.png (mobile)
  "1.5": [
    {
      name: "invoice-detail",
      path: `/app/sys/${SYS}/account/docs/INVOICE/${E.fixtures.invSimilanViewId}`,
      note: "ใบแจ้งหนี้โรงแรมสิมิลันวิว — ชำระบางส่วน (g4) · แท็บ รายละเอียด",
      expect: [E.fixtures.invSimilanViewDocNo, "ชำระบางส่วน"],
    },
    {
      name: "invoice-detail-payments-tab",
      path: `/app/sys/${SYS}/account/docs/INVOICE/${E.fixtures.invSimilanViewId}?tab=payments`,
      note: "แท็บ การชำระเงิน + preview สมุดรายวัน (g4 ล่าง)",
      expect: [E.fixtures.invSimilanViewDocNo],
    },
    {
      name: "expense-detail",
      path: `/app/sys/${SYS}/account/expense/${fx15.expensePaidId}`,
      note: "หน้าเอกสาร V2 ฝั่งรายจ่าย — บันทึกค่าใช้จ่ายที่ชำระแล้ว (ยืนยันว่าฝั่งจ่ายใช้คอมโพเนนต์เดียวกัน)",
      expect: ["ชำระเงินแล้ว"],
    },
  ],
  // WO 1.6 — wizard เอกสารปรับปรุงหนี้ (§5.2 J) เทียบ g3-creditnote-wizard.png
  // ใช้ IV โรงแรมสิมิลันวิวที่ seed ไว้แล้วตรง ๆ (PARTIAL 124,500 / ค้างชำระ 62,250) — ไม่ต้องสร้าง/ลบ fixture เพิ่ม
  "1.6": [
    {
      name: "cn-wizard-step1",
      path: `/app/sys/${SYS}/account/docs/CREDIT_NOTE/new?contactId=${E.fixtures.contactSimilanViewId}`,
      note: "ขั้น ① เลือกเอกสารอ้างอิง (g3) — ตัวกรองผู้ติดต่อ = โรงแรมสิมิลันวิว + เลือกแถว IV",
      expect: ["สร้างใบลดหนี้", "เลือกเอกสารอ้างอิง", E.fixtures.invSimilanViewDocNo],
      // เดสก์ท็อป = แถวตาราง [data-testid="ref-row-…"] · มือถือ = การ์ด [data-testid="ref-card-…"] (คนละ element กัน
      // ชนกันตอนอ่านค่า — ใส่ทั้งคู่ไว้ที่นี่ ตัวที่มองไม่เห็น (`hidden`/`md:hidden`) puppeteer จะคลิกไม่ติดแล้วข้ามไปเอง)
      click: [
        `[data-testid="ref-row-${E.fixtures.invSimilanViewDocNo}"]`,
        `[data-testid="ref-card-${E.fixtures.invSimilanViewDocNo}"]`,
      ],
      waitAfterClick: 300,
    },
    {
      name: "cn-wizard-step2",
      path: `/app/sys/${SYS}/account/docs/CREDIT_NOTE/new?ref=${E.fixtures.invSimilanViewId}`,
      note: "ขั้น ② ฟอร์มใบลดหนี้พรีฟิลจากเอกสารอ้างอิง — cap-line ต้องโชว์ค้างชำระ 62,250.00 (g3 ขั้น 2)",
      expect: ["สร้างใบลดหนี้", E.fixtures.invSimilanViewDocNo],
    },
  ],
  // WO 1.8 — ตัวช่วยนำเข้า CSV (§8.5): อัปโหลดไฟล์ตัวอย่างจริงผ่าน uploadFile() แล้วเดินสเต็ปเปอร์ด้วย DOM
  // ① อัปโหลด → ② จับคู่คอลัมน์ (auto-match ผ่านแล้ว ใช้ค่าเริ่มต้น) → ③ ตรวจสอบ (ถ่ายภาพ) → ④⑤ กดนำเข้า (ถ่ายภาพผลลัพธ์)
  "1.8": [
    {
      name: "import-documents-preview",
      path: `/app/sys/${SYS}/account/import/documents?side=revenue`,
      note: "ขั้น ③ ตรวจสอบ — ไฟล์ตัวอย่าง 20 แถว (18 ok · 2 err: วันที่ผิด/ยอดติดลบ) ผ่าน uploadFile จริง",
      expect: ["นำเข้าเอกสารรายรับ"],
      flow: [
        { upload: 'input[type="file"]', filePath: FIXTURE_CSV_PATH_18 },
        { waitFor: '[data-testid="import-map-ref"]' },
        { click: '[data-testid="btn-goto-preview"]' },
        { waitFor: '[data-testid="import-count-err"]' },
      ],
      expectBeforeShot: [
        { sel: '[data-testid="import-count-ok"]', kind: "text", equals: "18" },
        { sel: '[data-testid="import-count-warn"]', kind: "text", equals: "0" },
        { sel: '[data-testid="import-count-err"]', kind: "text", equals: "2" },
      ],
    },
    {
      // เดสก์ท็อป+มือถือรัน "กดนำเข้าจริง" คนละไฟล์ (FIXTURE_CSV_PATH_18 vs _MOBILE) — ไฟล์เดียวกันจะชน
      // idempotency (refId เดิม) พอถึงรอบที่สอง ⇒ ได้ "สร้างใหม่ 0" แทน 18 (ดูคอมเมนต์เหนือ FIXTURE_CSV_PATH_18)
      name: "import-documents-result",
      path: `/app/sys/${SYS}/account/import/documents?side=revenue`,
      note: 'ขั้น ⑤ สรุปผล (เดสก์ท็อป) — ติ๊ก "ข้ามแถวที่ผิดพลาด" (ค่าเริ่มต้น) แล้วกดนำเข้า → 18 ร่างสำเร็จ (ลบทิ้งใน cleanupFixture)',
      expect: [],
      onlyDevice: "desktop",
      flow: [
        { upload: 'input[type="file"]', filePath: FIXTURE_CSV_PATH_18 },
        { waitFor: '[data-testid="import-map-ref"]' },
        { click: '[data-testid="btn-goto-preview"]' },
        { waitFor: '[data-testid="btn-import-run"]' },
        { click: '[data-testid="btn-import-run"]' },
        { waitFor: '[data-testid="import-result"]' },
      ],
      expectBeforeShot: [{ sel: '[data-testid="import-result"]', kind: "text", equals: "สร้างใหม่ 18 รายการ" }],
    },
    {
      name: "import-documents-result",
      path: `/app/sys/${SYS}/account/import/documents?side=revenue`,
      note: 'ขั้น ⑤ สรุปผล (มือถือ) — ไฟล์คนละชุดกับเดสก์ท็อป กันชน idempotency',
      expect: [],
      onlyDevice: "mobile",
      flow: [
        { upload: 'input[type="file"]', filePath: FIXTURE_CSV_PATH_18_MOBILE },
        { waitFor: '[data-testid="import-map-ref"]' },
        { click: '[data-testid="btn-goto-preview"]' },
        { waitFor: '[data-testid="btn-import-run"]' },
        { click: '[data-testid="btn-import-run"]' },
        { waitFor: '[data-testid="import-result"]' },
      ],
      expectBeforeShot: [{ sel: '[data-testid="import-result"]', kind: "text", equals: "สร้างใหม่ 18 รายการ" }],
    },
  ],
  // WO 1.9 — เอกสารประจำ (§0.3 ข้อ 7) + ศูนย์แจ้งเตือน (§0.3 ข้อ 4)
  "1.9": [
    {
      name: "recurring-list",
      path: `/app/sys/${SYS}/account/recurring`,
      note: "หน้ารายการเอกสารประจำ — ต้องเห็น 2 กฎ พร้อมความถี่/รอบถัดไป/สถานะ",
      expect: ["เอกสารประจำ", "ค่าเช่าสำนักงาน", "ค่าบริการดูแลระบบ", "ทุกเดือน", "ทุกสัปดาห์"],
    },
    {
      name: "recurring-form",
      path: `/app/sys/${SYS}/account/recurring/${fx19.ruleMonthlyId}/edit`,
      note: "ฟอร์มเอกสารประจำ — การ์ดตารางเวลา + ผู้ติดต่อ + ตารางรายการ (ฟอร์ม §5.2 ที่ตัดวันที่ออก)",
      expect: ["แก้ไขเอกสารประจำ", "ตารางเวลา", "ความถี่", "วันที่เริ่ม", "รายการในแม่แบบ"],
    },
    {
      name: "notifications",
      path: "/app/notifications",
      note: "ศูนย์แจ้งเตือน — ต้องเห็นแถวเตือน 3 รายการที่ WO 1.9 เขียน",
      expect: ["ศูนย์แจ้งเตือน", "ครบกำหนดพรุ่งนี้", "พ้นกำหนดชำระแล้ว", "เช็คถึงกำหนด"],
    },
  ],
  // WO 2.2 — หน้าหลัก V2 (§4) เทียบ f1 (เดสก์ท็อป) + f2 (dropdown "+ สร้างเอกสาร") + f11 (มือถือ)
  // ไม่ต้องมี fixture พิเศษ — ตัวเลขทั้งหมดมาจากชุด seed เดิมที่ qc-acc-v2-dashboard.mts (WO 2.1) ยืนยันแล้ว
  "2.2": [
    {
      name: "hub",
      path: `/app/sys/${SYS}/account`,
      note: "หน้าหลัก V2 เต็มหน้า — KPI 4 · กราฟรายรับ-รายจ่าย + อายุหนี้ · โดนัท 2 ใบ + เงินคุณอยู่ไหน · เอกสารที่ออก · งานที่รอคุณ + เอกสารล่าสุด · 3 การ์ดอันดับ · บัญชีที่ติดตาม (f1)",
      expect: [
        "หน้าหลัก",
        "ค้างรับ (ลูกหนี้)",
        "ค้างจ่าย (เจ้าหนี้)",
        "เงินคงเหลือรวม",
        "ภาพรวมรายรับและรายจ่าย",
        "รอรับชำระ / รอชำระ",
        "อายุหนี้ 5 ช่วง",
        "รายได้เดือนนี้",
        "ค่าใช้จ่ายเดือนนี้",
        "เงินคุณอยู่ไหน",
        "เอกสารที่ออก",
        "งานที่รอคุณ",
        "เอกสารล่าสุด",
        "ขายอะไรดีสุด",
        "ขายใครได้มากที่สุด",
        "รายได้อะไรมากที่สุด",
        "บัญชีเงินที่ติดตาม",
        "บัญชีที่ติดตาม",
      ],
    },
    {
      name: "hub-create-open",
      path: `/app/sys/${SYS}/account`,
      note: 'ปุ่มดำ "+ สร้างเอกสาร ▾" เปิด dropdown 2 คอลัมน์ (รายรับ | รายจ่าย) — เทียบ f2',
      expect: ["หน้าหลัก", "รายรับ", "รายจ่าย"],
      // 2 selector = เดสก์ท็อป + มือถือ (คอมโพเนนต์เดียวกันเรนเดอร์ 2 ชุดซ่อนด้วย CSS — testid แยกกันตาม
      // DashCreateMenu.tsx กันคลิกโดนปุ่มที่ซ่อนอยู่อีก breakpoint เหมือน ref-row-/ref-card- ของ WO 1.6)
      click: ['[data-testid="btn-create-doc"]', '[data-testid="btn-create-doc-m"]'],
      waitAfterClick: 300,
    },
    {
      name: "hub-checklist",
      path: `/app/sys/${SYS}/account?checklist=1`,
      note: "บังคับโชว์เช็กลิสต์เริ่มต้น 5 ขั้นด้วย ?checklist=1 (tenant QC ทำครบทุกข้อแล้ว ปกติจะซ่อน — สำหรับถ่ายภาพ QC เท่านั้น)",
      expect: ["เริ่มต้นใช้งานบัญชี", "ตั้งค่ากิจการ", "เพิ่มช่องทางเงิน", "เพิ่มลูกค้า/สินค้า", "ออกเอกสารใบแรก", "เชื่อมระบบ"],
    },
  ],
  // WO 2.3 — "ดูภาพรวม" รายรับ/รายจ่าย (§6) เทียบ f4-expense-overview.png (+ -menu.png)
  // ไม่ต้องมี fixture พิเศษ — ตัวเลขทั้งหมดมาจากชุด seed เดิมที่ acc-v2-expected-dashboard.mts (คีย์ "overview") ยืนยันแล้ว
  "2.3": [
    {
      name: "revenue-overview",
      path: `/app/sys/${SYS}/account/overview/revenue`,
      note: "ดูภาพรวมรายรับ — กราฟแท่งซ้อน 12 เดือน + 4 ตัวเลข · เอกสารที่ออก · ขายอะไรดีสุด/ขายใคร/รายได้อะไร · ลูกหนี้ที่ติดตาม",
      expect: [
        "ภาพรวมรายรับ",
        "รายรับรายเดือน",
        "ชำระแล้ว",
        "รอชำระ",
        "พ้นกำหนด",
        "เอกสารที่ออก",
        "ขายอะไรดีสุด",
        "ขายใครได้มากที่สุด",
        "รายได้อะไรมากที่สุด",
        "ลูกหนี้ที่ติดตาม",
      ],
    },
    {
      name: "expense-overview",
      path: `/app/sys/${SYS}/account/overview/expense`,
      note: "ดูภาพรวมรายจ่าย — ตรง f4 เป๊ะ: กราฟแท่งซ้อน + 4 ตัวเลข · เอกสารที่ออก 4 ชนิด · จ่ายให้ใคร/จ่ายค่าอะไร · เจ้าหนี้ที่ติดตาม",
      expect: [
        "ภาพรวมรายจ่าย",
        "ค่าใช้จ่ายรายเดือน",
        "ชำระแล้ว",
        "รอชำระ",
        "พ้นกำหนด",
        "เอกสารที่ออก",
        "คุณจ่ายให้ใครมากที่สุด",
        "คุณจ่ายค่าอะไรมากที่สุด",
        "เจ้าหนี้ที่ติดตาม",
      ],
    },
    {
      name: "expense-overview-menu",
      path: `/app/sys/${SYS}/account/overview/expense`,
      note: 'คลิกแท็บ "รายจ่าย" เปิด dropdown — เทียบ f4-expense-overview-menu.png ("ดูภาพรวม" ต้องเป็นลิงก์ใช้ได้ ไม่จาง)',
      expect: ["ภาพรวมรายจ่าย", "ดูภาพรวม", "ใบสั่งซื้อ"],
      onlyDevice: "desktop",
      click: ['[data-testid="acc-menu-expense"]'],
      waitAfterClick: 300,
    },
  ],
  // WO 4.3 — หน้าสินค้า/บริการ V2 (§8.1–8.4) เทียบ f6-products.png · f6-products-menu.png · g8-product-modal.png · g12-goods-issue-form.png
  "4.3": [
    {
      name: "products-list",
      path: `/app/sys/${SYS}/account/products`,
      note: "หน้ารายการสินค้า แท็บ 'สินค้า' (f6-products.png) — แท็บชนิด 3 · การ์ดสินค้าที่ติดตาม · ตาราง 9 คอลัมน์ · ท้ายตาราง มูลค่าสต็อกรวม + แบ่งหน้า",
      // เดสก์ท็อปมีตารางจริง → ตรวจหัวคอลัมน์ตาม f6 แยกอีกชุดด้านล่าง (products-list-cols)
      // หัวคอลัมน์ ("จำนวนคงเหลือ" ฯลฯ) มีเฉพาะตารางเดสก์ท็อป — มือถือเป็นการ์ด (f13 pattern) ⇒ ตรวจคำที่มีทั้ง 2 จอ
      expect: ["สินค้า/บริการ", "สินค้าที่ติดตาม", "ทั้งหมด", "ปิดใช้งาน"],
    },
    {
      name: "products-list-cols",
      path: `/app/sys/${SYS}/account/products`,
      note: "ตรวจหัวคอลัมน์ 9 ช่องของตารางเดสก์ท็อปตรงตาม f6 (มือถือใช้การ์ด จึงตรวจเฉพาะจอกว้าง)",
      expect: ["รหัส", "ชื่อสินค้า", "หมวด", "หน่วย", "จำนวนคงเหลือ", "ต้นทุน/หน่วย", "ราคาขาย/หน่วย", "VAT", "มูลค่าสต็อกรวม"],
      onlyDevice: "desktop",
    },
    {
      name: "products-list-service",
      path: `/app/sys/${SYS}/account/products?type=service`,
      note: "แท็บ 'บริการ' — คอลัมน์คงเหลือต้องเป็นป้าย 'ไม่ติดตามสต็อก'",
      expect: ["สินค้า/บริการ", "ไม่ติดตามสต็อก"],
    },
    {
      name: "products-list-bundle",
      path: `/app/sys/${SYS}/account/products?type=bundle`,
      note: "แท็บ 'รายการจัดชุด' — ชุดที่ seed สร้างไว้ต้องโผล่",
      expect: ["สินค้า/บริการ", "ชุดดำน้ำตื้นครบเซ็ต"],
    },
    {
      name: "products-list-menu",
      path: `/app/sys/${SYS}/account/products`,
      note: "เปิดเมนู 'ทำรายการ' ของแถวแรก — เทียบ f6-products-menu.png (แก้ไขสินค้า/เบิกสินค้า/รับเข้าคลัง/ปรับต้นทุน/ดูความเคลื่อนไหว | ปิดใช้งาน)",
      expect: ["สินค้า/บริการ"],
      onlyDevice: "desktop",
      click: ['[data-testid^="product-row-actions-"] button.btn-sm'],
      waitAfterClick: 300,
    },
    {
      name: "product-modal-basic",
      path: `/app/sys/${SYS}/account/products?new=1&mtab=basic`,
      note: 'modal "เพิ่มสินค้า" แท็บ พื้นฐาน (g8) — รหัส auto · ประเภท 3 ตัวเลือก · ชื่อ/หน่วย/ราคา/บัญชีรายได้',
      expect: ["เพิ่มสินค้า", "พื้นฐาน", "ขั้นสูง", "ประเภท", "รายการจัดชุด", "ราคาขาย/หน่วย (บาท)"],
      onlyDevice: "desktop",
      expandModalForShot: '[data-testid="product-modal"]',
      waitAfterClick: 400,
    },
    ...(["info", "price", "accounting", "opening", "links"] as const).map((atab) => ({
      name: `product-modal-adv-${atab}`,
      path: `/app/sys/${SYS}/account/products?new=1&mtab=advanced&atab=${atab}`,
      note: `modal ขั้นสูง แท็บซ้าย "${atab}" (g8) — การ์ดสรุป "ข้อมูลสินค้า (ย่อ)" + เนื้อหาของแท็บ`,
      expect: ["เพิ่มสินค้า", "ขั้นสูง", "ข้อมูลสินค้า (ย่อ)"],
      onlyDevice: "desktop" as const,
      expandModalForShot: '[data-testid="product-modal"]',
      waitAfterClick: 400,
    })),
    {
      name: "product-modal-mobile",
      path: `/app/sys/${SYS}/account/products?new=1&mtab=advanced&atab=links`,
      note: "modal บนมือถือ 390 = แผ่นเต็มจอ (SPEC §13) — ต้องไม่ล้นแนวนอน",
      expect: ["เพิ่มสินค้า", "การเชื่อมต่อกับระบบอื่น"],
      onlyDevice: "mobile",
      expandModalForShot: '[data-testid="product-modal"]',
      waitAfterClick: 400,
    },
    {
      name: "units",
      path: `/app/sys/${SYS}/account/units`,
      note: "หน้าหน่วยนับ (§8.3) — ตาราง รหัส PU/SU · ไทย · อังกฤษ · ชนิด · ใช้กับสินค้า n + ฟอร์มเพิ่มหน่วย",
      expect: ["หน่วยนับ", "ชื่ออังกฤษ", "ใช้กับสินค้า", "เพิ่มหน่วย"],
    },
    {
      name: "goods-issue-form",
      path: `/app/sys/${SYS}/account/goods-issue/new`,
      note: "ฟอร์มใบเบิกสินค้า PRR — เทียบ g12-goods-issue-form.png ทุกบล็อก",
      expect: [
        "สร้างใบเบิกสินค้า",
        "ข้อมูลทั่วไป",
        "สาเหตุการเบิก",
        "รายการที่เบิก",
        "ค่าใช้จ่ายที่ปรับปรุง",
        "มูลค่าต้นทุน",
        "แนบไฟล์",
        "อนุมัติใบเบิกสินค้า",
      ],
    },
    {
      name: "cost-adjust-form",
      path: `/app/sys/${SYS}/account/cost-adjustment/new`,
      note: "ฟอร์มใบปรับต้นทุนสินค้า CA (§8.4) — สินค้า · ต้นทุนเดิม readonly · ต้นทุนใหม่ · เหตุผล · บัญชีคู่",
      expect: ["สร้างใบปรับต้นทุนสินค้า", "ต้นทุนเดิม/หน่วย", "ต้นทุนใหม่/หน่วย (บาท)", "เหตุผลการปรับ", "บัญชีคู่"],
    },
    {
      name: "cost-adjust-list",
      path: `/app/sys/${SYS}/account/cost-adjustment`,
      note: "รายการใบปรับต้นทุนสินค้า — ใบที่ seed สร้างไว้ต้องโผล่พร้อมผลต่าง",
      expect: ["ใบปรับต้นทุนสินค้า"],
    },
  ],
  // WO 3.2 — หน้าผู้ติดต่อ V2 (§7.1/§7.4) เทียบ f5-contacts.png + f5-contacts-menu.png (เดสก์ท็อป) · f13 pattern (มือถือ)
  "3.2": [
    {
      name: "contacts-list",
      path: `/app/sys/${SYS}/account/contacts`,
      note: "หน้ารายการผู้ติดต่อ default (f5-contacts.png) — คอลัมน์ซ้าย 63/41/12/22/5 + ตาราง + pagination",
      // "กลุ่มมาตรฐาน"/"กลุ่มกำหนดเอง"/"ที่มา" เป็นหัวข้อในการ์ดซ้าย (เดสก์ท็อปเท่านั้น hidden md:flex) — มือถือใช้
      // แถบชิปเลื่อนแนวนอนแทน (ไม่มีหัวข้อกำกับกลุ่ม) ⇒ ไม่เช็คคำเหล่านี้ตรงนี้เพราะ expect ใช้ร่วมทั้ง 2 อุปกรณ์
      // (ตัวเลขกลุ่มยืนยันด้วย ASSERT_MAP ทั้งสองอุปกรณ์แล้ว — "ลูกค้าประจำ" ยังเจอได้บนมือถือผ่านชิป)
      expect: ["ผู้ติดต่อ", "ลูกค้าประจำ"],
    },
    {
      name: "contacts-list-menu",
      path: `/app/sys/${SYS}/account/contacts`,
      note: 'เปิด dropdown "ทำรายการ" ของแถวแรก — เทียบ f5-contacts-menu.png (สร้างใบเสนอราคา/ใบแจ้งหนี้/ใบเสร็จ/บันทึกค่าใช้จ่าย/ดูประวัติ/แก้ไข/เพิ่มเข้ากลุ่ม/ปิดใช้งาน)',
      expect: ["ผู้ติดต่อ"],
      onlyDevice: "desktop",
      click: ['[data-testid^="contact-row-actions-"] button.btn-sm'],
      waitAfterClick: 300,
    },
    {
      name: "contacts-list-group",
      path: `/app/sys/${SYS}/account/contacts?group=vendor`,
      note: "เลือกกลุ่ม 'ผู้ขาย' จากแถบซ้าย — ตัวนับ/หัวตาราง 'กลุ่ม: ผู้ขาย 22 รายชื่อ' ต้องตรงเฉลย",
      expect: ["ผู้ติดต่อ", "ผู้ขาย"],
    },
    {
      name: "contacts-overview",
      path: `/app/sys/${SYS}/account/contacts/overview`,
      note: "ดูภาพรวมผู้ติดต่อ (§7.4) — ลูกค้าใหม่เดือนนี้/กลับมาซื้อ + 3 การ์ด top 10",
      expect: ["ดูภาพรวมผู้ติดต่อ", "ลูกค้าใหม่เดือนนี้", "ลูกค้าที่กลับมาซื้อ", "10 อันดับยอดซื้อ", "10 อันดับค้างชำระ", "ผู้ขาย 10 อันดับยอดจ่าย"],
    },
  ],
  // WO 3.4 — โปรไฟล์ผู้ติดต่อ 360° (§7.1 · g6/g19 · f5-contacts-menu) + รวมผู้ติดต่อซ้ำ (§7.3 · g7)
  "3.4": [
    {
      name: "contact-profile-panel",
      path: `/app/sys/${SYS}/account/contacts?q=${encodeURIComponent("ปิยธิดา")}`,
      note: "คลิกแถว → แผงโปรไฟล์ 360° เลื่อนเข้าขวา w-560 — เทียบ f5-contacts-menu.png (หัว avatar+ชื่อ+เลขที่ · แท็บ · chip · ข้อมูล · KPI 2 ช่อง · อายุหนี้แนวนอน · เอกสาร 5 ล่าสุด · ปุ่มท้าย)",
      expect: ["ผู้ติดต่อ", "ปิยธิดา อินสุ่ม", "อายุหนี้ของรายนี้", "สร้างใบแจ้งหนี้"],
      onlyDevice: "desktop",
      // คลิกที่เซลล์ "ประเภท" (chip — ไม่ใช่ลิงก์) เพื่อให้ handler ของแถวทำงาน ไม่ใช่พาไปหน้าเต็ม
      click: ['[data-testid^="contact-row-"] td:nth-child(4)'],
      waitAfterClick: 1200,
    },
    {
      name: "contact-profile-page",
      path: `/app/sys/${SYS}/account/contacts/${E.contactProfile?.contactId ?? ""}`,
      note: "หน้าโปรไฟล์เต็ม — เดสก์ท็อปเทียบ g6-contact-360.png · มือถือเทียบ g19-contact-360.png",
      expect: ["ปิยธิดา อินสุ่ม", "อายุหนี้ของรายนี้", "ข้อมูล", "เอกสาร", "การเชื่อมต่อ", "สร้างใบแจ้งหนี้"],
    },
    {
      name: "contact-profile-links",
      path: `/app/sys/${SYS}/account/contacts/${E.contactProfile?.contactId ?? ""}`,
      note: 'หน้าโปรไฟล์เต็ม แท็บ "การเชื่อมต่อ" (g6 วาดสถานะนี้) — การ์ด สมาชิก/CRM/แชท/POS + การ์ด "ข้อมูล" คอลัมน์ขวา',
      expect: ["การเชื่อมต่อ", "สมาชิก", "CRM"],
      click: ['[data-testid="profile-tab-links"]'],
      waitAfterClick: 1000,
    },
    {
      name: "contact-merge-list",
      path: `/app/sys/${SYS}/account/contacts/merge`,
      note: "หน้ารวมผู้ติดต่อซ้ำ — เทียบ g7-contact-merge.png (การ์ดคู่ซ้าย + ตารางเทียบขวา + แถบสรุปหลังรวม + ปุ่ม ข้าม/รวมผู้ติดต่อ)",
      expect: ["รวมผู้ติดต่อซ้ำ", "เลขภาษีตรงกัน", "หลังรวม", "รวมผู้ติดต่อ"],
    },
    {
      name: "contact-merge-confirm",
      path: `/app/sys/${SYS}/account/contacts/merge`,
      note: "modal ยืนยันก่อนรวม — เทียบกล่องกลางจอของ g7 (หัวข้อ + ข้อความ + ยกเลิก/ยืนยันรวม)",
      expect: ["รวมผู้ติดต่อ 2 รายเป็นรายเดียว?", "ยืนยันรวม"],
      onlyDevice: "desktop",
      click: ['[data-testid="merge-submit"]'],
      waitAfterClick: 600,
    },
  ],
  // WO 3.3 — modal เพิ่ม/แก้ไขผู้ติดต่อ (§7.2) เทียบ g5-contact-modal.png (เฟรมนี้วาดสถานะแท็บ "ขั้นสูง")
  // เปิดด้วย query `?new=1` (ปุ่ม "+ เพิ่มผู้ติดต่อ" ไปที่นี่จริง) + `?tab=` เลือกแท็บให้ภาพนิ่ง
  "3.3": [
    {
      name: "contact-modal-basic",
      path: `/app/sys/${SYS}/account/contacts?new=1&tab=basic`,
      note: 'modal "เพิ่มผู้ติดต่อ" แท็บ พื้นฐาน — ต้องไม่มีบล็อกขั้นสูง (เครดิตเทอม/เชื่อมกับ) โผล่',
      expect: ["เพิ่มผู้ติดต่อ", "พื้นฐาน", "ขั้นสูง", "เลขทะเบียน 13 หลัก", "ประเภทสำนักงาน", "ช่องทางติดต่อ"],
      onlyDevice: "desktop",
      expandModalForShot: '[data-testid="contact-modal"]',
      waitAfterClick: 400,
    },
    {
      name: "contact-modal-advanced",
      path: `/app/sys/${SYS}/account/contacts?new=1&tab=advanced`,
      note: "modal แท็บ ขั้นสูง — สถานะเดียวกับ g5 (เครดิตเทอม · WHT · บัญชีเฉพาะราย · กลุ่ม/แท็ก · เชื่อมกับ)",
      // ("ยังไม่พบดีลที่ตรงกัน"/"ยังไม่เชื่อม" ของช่อง CRM/แชท เป็น **placeholder** ตรงตาม g5 ⇒ ไม่อยู่ใน innerText)
      expect: ["เพิ่มผู้ติดต่อ", "เครดิตเทอม (วัน)", "หัก ณ ที่จ่ายเริ่มต้น — อัตรา", "เชื่อมกับ", "ผู้ดูแล (พนักงาน)", "แท็ก"],
      expandModalForShot: '[data-testid="contact-modal"]',
      waitAfterClick: 400,
    },
    {
      name: "contact-modal-duplicate",
      path: `/app/sys/${SYS}/account/contacts?new=1&tab=basic`,
      note: 'สถานะ "เตือนซ้ำ" (§7.2) — กรอกชื่อ+เบอร์ของผู้ติดต่อที่มีอยู่แล้วแล้วกดบันทึก → แถบเตือน + ลิงก์ "เปิด C000xx" + toast',
      expect: ["เพิ่มผู้ติดต่อ"],
      onlyDevice: "desktop",
      flow: [
        { fill: '[data-testid="contact-name"]', value: fx33.dupName },
        { fill: '[data-testid="contact-phone"]', value: fx33.dupPhone },
        // 🔴 ยืนยันว่าค่าถึงช่องครบก่อนกด "เพิ่ม" — ไม่ครบ = หยุด (ไม่งั้นจะสร้างผู้ติดต่อจริงเกินมา 1 ราย)
        { assertValue: '[data-testid="contact-name"]', equals: fx33.dupName },
        { assertValue: '[data-testid="contact-phone"]', equals: fx33.dupPhone },
        { click: '[data-testid="contact-modal-submit"]' },
        { waitFor: '[data-testid="contact-dup-banner"]' },
      ],
      expectBeforeShot: [{ sel: '[data-testid="contact-dup-banner"]', kind: "text", equals: "มีอยู่แล้ว" }],
      expandModalForShot: '[data-testid="contact-modal"]',
      waitAfterClick: 400,
    },
  ],
};

// ─────────── ตารางตัวเลขที่อ่านจาก data-testid (ว่างไว้ก่อน — WO ถัดไปเติม) ───────────
// รูปแบบ: { page: { "testid": ค่าที่คาดหวังเป็นสตางค์ | สตริง } }
// WO 2.3 — แปลงสตางค์ → ข้อความบาท 2 ตำแหน่งทศนิยม แบบเดียวกับ formatBaht({decimals:true}) ที่ overview-ui.tsx ใช้จริง
const bahtStr = (satang: number) => "฿" + (satang / 100).toLocaleString("th-TH", { minimumFractionDigits: 2 });

/** รูปแบบเงินเดียวกับ formatBaht ของ UI (ใช้สร้างค่าที่คาดหวังจากเฉลยที่เป็นสตางค์) */
const baht = (satang: number, decimals = false) =>
  (satang < 0 ? "−฿" : "฿") +
  (Math.abs(satang) / 100).toLocaleString("th-TH", decimals ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : undefined);

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
  // WO 1.5: หน้าเอกสาร V2 — ตัวเลข/ป้ายต้องตรงเฉลย g4 (ground truth = acc-v2-expected.json.invSimilanView*)
  "1.5": {
    "invoice-detail": {
      "doc-grand": "฿124,500.00",
      "doc-outstanding": "฿62,250.00",
      "doc-status": "ชำระบางส่วน",
      "related-RE": "ใบเสร็จ",
      // ไทม์ไลน์ 4 ก้าว (ร่าง·รอชำระ·ชำระบางส่วน·ชำระแล้ว) — มี testid ครบ 4 ตัว = 4 ก้าวจริง
      // + ก้าวที่ 3 (ชำระบางส่วน) เป็นก้าวปัจจุบัน (มีโน้ต "รับชำระ n" เฉพาะ state=current เท่านั้น)
      // + ก้าวที่ 4 (ชำระแล้ว) ยังไม่ถึง = แสดง "—"
      "timeline-draft": "ร่าง",
      "timeline-awaiting": "รอชำระ",
      "timeline-partial": "รับชำระ 1",
      "timeline-paid": "—",
    },
    "invoice-detail-payments-tab": {
      "pay-row-1": "62,250.00",
      "jv-line-1": "124,500.00",
      "jv-line-2": "116,355.14",
      "jv-line-3": "8,144.86",
    },
  },
  // WO 1.6 — cap-line ขั้น ② ต้องโชว์ค้างชำระของ IV โรงแรมสิมิลันวิว = 62,250.00 (ground truth เดียวกับ WO 1.5)
  "1.6": {
    "cn-wizard-step2": {
      "cap-line": "62,250.00",
      "ref-chip": E.fixtures.invSimilanViewDocNo,
    },
  },
  // WO 1.7: ตัวเลขบนจอต้องเท่ากับยอดของ fixture จริง (คำนวณตอนรัน — ดูบล็อก ASSERT WO 1.7 ด้านล่าง)
  "1.7": {},
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
  // WO 2.2 — ตัวเลข KPI/โดนัท ต้องตรงเฉลย f1/dashboardSnapshot เป๊ะ (ground truth เดียวกับ WO 2.1)
  // 🔴 kpi-overdue: DESIGN-SPEC-V2 §4 ข้อ 2 กำหนดให้ "พ้นกำหนด (รับ+จ่าย)" รวมทั้ง 2 ฝั่ง — ของจริงจาก
  //    dashboardSnapshot = 6 ใบ/฿205,900.00 (ลูกหนี้พ้นกำหนด 4 ใบ/฿128,400 ตาม f1 + เจ้าหนี้พ้นกำหนด 2 ใบ/฿77,500
  //    ที่ f1 รอบ 1 ยังไม่ได้วาด) — ถ้า WO ระบุ "4" เฉย ๆ นั่นคือฝั่งลูกหนี้อย่างเดียว (ก่อนรวม 2 ฝั่งตามสเปครอบ 2)
  //    ยึดเลขรวมตามสเปคที่อนุมัติแล้ว (ledger/wo-notes/2.2.md มีบันทึกความต่างนี้ไว้ให้ Fable ตรวจ)
  "2.2": {
    hub: {
      "kpi-receivable": "฿486,300.00",
      "kpi-payable": "฿212,750.00",
      "kpi-overdue": "฿205,900.00",
      "kpi-cash": "฿1,284,560.00",
    },
  },
  // WO 2.3 — ov-total/ov-paid/ov-awaiting/ov-overdue ต้องตรงเฉลยอิสระ (acc-v2-expected.json.overview
  // เขียนโดย scripts/acc-v2-expected-dashboard.mts ด้วย SQL คนละสำนวน — ไม่ใช่การเทียบโค้ดกับตัวเอง)
  "2.3": {
    "revenue-overview": {
      "ov-total": bahtStr(E.overview?.revenue?.series?.total?.grand ?? 0),
      "ov-paid": bahtStr(E.overview?.revenue?.series?.total?.paid ?? 0),
      "ov-awaiting": bahtStr(E.overview?.revenue?.series?.total?.awaiting ?? 0),
      "ov-overdue": bahtStr(E.overview?.revenue?.series?.total?.overdue ?? 0),
    },
    "expense-overview": {
      "ov-total": bahtStr(E.overview?.expense?.series?.total?.grand ?? 0),
      "ov-paid": bahtStr(E.overview?.expense?.series?.total?.paid ?? 0),
      "ov-awaiting": bahtStr(E.overview?.expense?.series?.total?.awaiting ?? 0),
      "ov-overdue": bahtStr(E.overview?.expense?.series?.total?.overdue ?? 0),
    },
  },
  // WO 3.2 — ตัวนับกลุ่ม/หน้าผู้ติดต่อ ต้องตรง acc-v2-expected.json.contacts เป๊ะ (เฉลย SQL อิสระ — acc-v2-expected-contacts.mts)
  // WO 3.4 — ตัวเลขบนโปรไฟล์ 360° ต้องตรงเฉลย (คีย์ contactProfile — SQL ดิบใน acc-v2-expected-contact-profile.mts)
  "3.4": {
    "contact-profile-page": {
      "kpi-outstanding": baht(E.contactProfile?.outstandingSatang ?? 0, true),
      "kpi-paid-year": baht(E.contactProfile?.paidThisYearSatang ?? 0, true),
      // 🔴 ใช้ `agingNow` (คิดจากนาฬิกาเครื่อง) ไม่ใช่ `aging` (คิดจาก QC.today = 2026-09-30 ของดีไซน์)
      //    — หน้าเว็บจริงคิด bucket จาก new Date() ⇒ ถ้าเทียบกับชุดตรึงจะตกคนละช่องกันโดยไม่ใช่บั๊ก
      "aging-col-d1_30": baht(E.contactProfile?.agingNow?.d1_30 ?? 0),
      "aging-col-notDue": baht(E.contactProfile?.agingNow?.notDue ?? 0),
    },
    "contact-profile-panel": {
      "kpi-outstanding": baht(E.contactProfile?.outstandingSatang ?? 0, true),
      "aging-d1_30": baht(E.contactProfile?.agingNow?.d1_30 ?? 0),
      "aging-notDue": baht(E.contactProfile?.agingNow?.notDue ?? 0),
    },
  },
  // WO 4.3 — ตัวนับแท็บชนิด/ยอดรวม ต้องตรงเฉลยของ seed (คีย์ productsByType เขียนจาก seed-acc-v2-qc.mts)
  "4.3": {
    "products-list": {
      "product-type-goods-count": E.productsByType?.GOODS ?? 0,
      "product-type-service-count": E.productsByType?.SERVICE ?? 0,
      "product-type-bundle-count": E.productsByType?.BUNDLE ?? 0,
      "products-total": E.productsByType?.GOODS ?? 0,
    },
  },
  "3.2": {
    "contacts-list": {
      "group-all-count": E.contacts?.all ?? 0,
      "group-customer-count": E.contacts?.customer ?? 0,
      "group-regular-count": E.contacts?.regular ?? 0,
      "group-vendor-count": E.contacts?.vendor ?? 0,
      "group-archived-count": E.contacts?.archived ?? 0,
    },
    "contacts-list-group": {
      "group-total": E.contacts?.vendor ?? 0,
    },
    "contacts-overview": {
      "ov-new-customers": E.contactsOverview?.newCustomersThisMonth ?? 0,
      "ov-returning-customers": E.contactsOverview?.returningCustomers ?? 0,
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

        // WO 1.4: ลำดับกรอกฟอร์ม (คลิก/พิมพ์) — MoneyInput ยืนยันค่าเมื่อ blur ⇒ ต้องกด Tab ทุกครั้งหลังพิมพ์
        // เลื่อน element เข้ากลางจอก่อนเสมอ — บนมือถือแถบปุ่มท้าย/แถบยอดบังปุ่มได้ ⇒ page.click() จะพลาด
        const center = (sel: string) =>
          page.evaluate((s: string) => {
            const el = document.querySelector(s) as HTMLElement | null;
            if (!el) return false;
            el.scrollIntoView({ block: "center" });
            return true;
          }, sel);
        // WO 0.4: เปิด dropdown/sheet ก่อนถ่าย (เดสก์ท็อป=dropdown 2 ระดับ · มือถือ=bottom sheet — คลิกปุ่มเดียวกัน
        // AccountTabBar ตัดสินพฤติกรรมจาก matchMedia ตอนคลิกเอง ไม่ต้องแยกโค้ดที่นี่)
        // WO 1.6 รอบ 4 (Fable QC ภาพจริงมือถือ): เปลี่ยนจาก page.click(sel) (คลิกจริงที่พิกัดกลาง element) → scrollIntoView
        // + คลิกผ่าน DOM (`el.click()`) เหมือน spec.flow ด้านล่าง — page.click() คลิกที่พิกัด (x,y) เฉย ๆ ไม่ตรวจว่า
        // "จุดนั้นบนจอจริง ๆ เป็นของ element นี้ไหม" ⇒ บนมือถือที่แถบปุ่มท้าย sticky ทับการ์ดใบสุดท้าย พิกัดนั้นโดนแถบดักไปเงียบ ๆ
        // (ไม่ error เพราะ puppeteer เข้าใจว่าคลิกสำเร็จ) — el.click() เรียก handler ตรง ๆ ไม่ผ่านการตรวจจุดบนจอเลย
        for (const sel of spec.click ?? []) {
          if (!(await center(sel))) continue; // ไม่พบ element (เช่น อีก breakpoint ที่ไม่ได้ render) — ข้ามเงียบ ๆ ตามเดิม
          await page.evaluate((s: string) => (document.querySelector(s) as HTMLElement | null)?.click(), sel).catch(() => {});
        }
        const flowFail = (msg: string) => {
          failures++;
          console.log(`  ❌ [${spec.name}/${device}] flow: ${msg}`);
        };
        let flowAborted = false;
        for (const step of spec.flow ?? []) {
          if (flowAborted) break;
          if ("assertValue" in step) {
            let got = "";
            let hit = false;
            for (let i = 0; i < 15 && !hit; i++) {
              got = await page.evaluate((sl: string) => (document.querySelector(sl) as HTMLInputElement | null)?.value ?? "(ไม่พบ)", step.assertValue);
              hit = got === step.equals;
              if (!hit) await new Promise((r) => setTimeout(r, 200));
            }
            if (!hit) {
              flowFail(`ค่าที่พิมพ์ใน ${step.assertValue} = ${JSON.stringify(got)} ไม่ตรง ${JSON.stringify(step.equals)} — หยุด flow (กันเขียนข้อมูลผิดลง DB)`);
              flowAborted = true;
            }
            continue;
          }
          if ("waitFor" in step) {
            let seen = false;
            for (let i = 0; i < 40 && !seen; i++) {
              seen = await page.evaluate((s: string) => !!document.querySelector(s), step.waitFor);
              if (!seen) await new Promise((r) => setTimeout(r, 200));
            }
            if (!seen) flowFail(`รอ ${step.waitFor} ไม่ขึ้นภายใน 8 วิ`);
            continue;
          }
          if ("click" in step) {
            if (!(await center(step.click))) {
              flowFail(`ไม่พบปุ่ม ${step.click}`);
              continue;
            }
            // คลิกผ่าน DOM (React รับ event จาก el.click() ปกติ) — ไม่ติดปัญหา element ถูกแถบ sticky บัง
            await page.evaluate((s: string) => (document.querySelector(s) as HTMLElement).click(), step.click);
          } else if ("select" in step) {
            if (!(await center(step.select))) {
              flowFail(`ไม่พบ select ${step.select}`);
              continue;
            }
            await page.select(step.select, step.value).catch(() => flowFail(`เลือกค่าใน ${step.select} ไม่ได้`));
          } else if ("upload" in step) {
            // WO 1.8: <input type="file"> มักถูกซ่อนด้วย .hidden (dropzone คลิกที่ <label> ครอบ) — เลือกด้วย $()
            // ตรง ๆ แทน center()/click() (ไม่ต้องมองเห็นบนจอก็อัปโหลดผ่าน DevTools ได้จริง)
            const input = await page.$(step.upload);
            if (!input) {
              flowFail(`ไม่พบ input[type=file] ${step.upload}`);
              continue;
            }
            await input.uploadFile(step.filePath).catch((e: unknown) => flowFail(`อัปโหลดไฟล์ไม่สำเร็จ: ${e instanceof Error ? e.message : e}`));
          } else {
            if (!(await center(step.fill))) {
              flowFail(`ไม่พบช่องกรอก ${step.fill}`);
              continue;
            }
            // MoneyInput ยืนยันค่าเมื่อ blur ⇒ ต้องพิมพ์จริง (React onChange) แล้วกด Tab
            await page.click(step.fill, { clickCount: 3 }).catch(() => flowFail(`คลิกช่อง ${step.fill} ไม่ได้`));
            // delay 25ms/ตัว — controlled input ของ React เรนเดอร์ใหม่ทุกตัวอักษร พิมพ์รัวไม่มี delay
            // ทำให้ตัวอักษรหล่นจริง (บทเรียน WO 3.3: "ปิยธิดา อินสุ่ม" → "ปิยธิดาอินสุ่ม" · "076100019" → "0")
            await page.keyboard.type(step.value, { delay: 25 }).catch(() => flowFail(`พิมพ์ใน ${step.fill} ไม่ได้`));
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

        // WO 1.4 (ตีกลับข้อ 2): วัดของจริงว่าแถบปุ่มท้ายทับเนื้อหาไหม — ต้องวัด **ก่อน** unstick
        // เลื่อนสุดหน้าแล้วเทียบ: ก้นการ์ดสุดท้าย (แนบไฟล์) ต้องอยู่เหนือขอบบนของแถบปุ่ม
        // 🔴 บั๊ก Fable QC WO 1.5 รอบ 1: ของเดิม return ก่อน scrollTo(0,0) เมื่อหน้าไม่มี sec-attachments/editor-actions
        //    (ทุกหน้า DocDetailPage ไม่มี 2 testid นี้เลย) ⇒ หน้าค้างสกอลไปสุดล่างตอนถ่าย fullPage → Topbar/NavDrawer
        //    (fixed) ถูกวาดผิดตำแหน่งกลางภาพ ⇒ ต้อง scrollTo(0,0) เสมอไม่ว่าจะเจอ element หรือไม่
        const tailClear = await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight);
          const tail = document.querySelector('[data-testid="sec-attachments"]');
          const bar = document.querySelector('[data-testid="editor-actions"]');
          const result = tail && bar ? { tailBottom: Math.round(tail.getBoundingClientRect().bottom), barTop: Math.round(bar.getBoundingClientRect().top) } : null;
          window.scrollTo(0, 0); // ต้องรันเสมอ — ห้าม return ก่อนบรรทัดนี้
          return result;
        });

        // 🔴 ด่านก่อนกดชัตเตอร์: สถานะบนจอต้อง "เป็นเฉลยจริง" ก่อน ไม่งั้นภาพหลอกตา (บทเรียน 1.4 รอบ 1)
        for (const want of spec.expectBeforeShot ?? []) {
          let got = "";
          let hit = false;
          for (let i = 0; i < 40 && !hit; i++) {
            got = await page.evaluate(
              (o: { sel: string; kind: string }) => {
                const el = document.querySelector(o.sel);
                if (!el) return "(ไม่พบ element)";
                if (o.kind === "value") return (el as HTMLInputElement).value ?? "";
                // ป้ายของช่อง = ข้อความใน <label> ที่ห่ออยู่ (PaymentSection ใช้ label ห่อ input)
                // 🔴 SVG element (เช่น data-testid บน <rect>/<circle>/<text> ของกราฟ WO 2.2) ไม่มี .innerText
                // (คุณสมบัตินี้มีเฉพาะ HTMLElement) — ต้อง fallback ไป .textContent ไม่งั้น .trim() พังเงียบ ๆ
                return ((el as HTMLElement).innerText ?? el.textContent ?? "").trim();
              },
              { sel: want.sel, kind: want.kind },
            );
            hit = got.includes(want.equals);
            if (!hit) await new Promise((r) => setTimeout(r, 200));
          }
          if (!hit) failures++;
          console.log(
            `  ${hit ? "✅" : "❌"} [${spec.name}/${device}] ก่อนถ่าย: ${want.sel} (${want.kind}) = ${JSON.stringify(got)} (ต้องมี ${JSON.stringify(want.equals)})`,
          );
        }
        // แถบ sticky → static เฉพาะตอนถ่าย (ดูเหตุผลที่ PageSpec.unstickForShot)
        // 🔴 Fable QC WO 1.5 รอบ 1: ต้องขอบเขตอยู่ใน [data-testid="doc-editor-v2"] เท่านั้น — ห้าม .closest(".sticky")
        //    จากตัว document ตรง ๆ (ถ้าแถบเมนู Topbar/NavDrawer ของแอปดันมี class "sticky" ด้วยจะโดนแก้ผิดตัว)
        for (const sel of spec.unstickForShot ?? []) {
          await page
            .evaluate((s: string) => {
              const scope = document.querySelector('[data-testid="doc-editor-v2"]');
              if (!scope) return;
              const el = scope.querySelector(s)?.closest<HTMLElement>(".sticky");
              if (el && scope.contains(el)) el.style.position = "static";
            }, sel)
            .catch(() => {});
        }

        // WO 3.3 — คลี่ modal ให้สูงเต็มก่อนถ่าย (ดูเหตุผลที่ PageSpec.expandModalForShot)
        if (spec.expandModalForShot) {
          await page
            .evaluate((sel: string) => {
              const dlg = document.querySelector<HTMLElement>(sel);
              if (!dlg) return;
              const overlay = dlg.parentElement;
              if (overlay instanceof HTMLElement) {
                overlay.style.position = "absolute";
                overlay.style.top = "0";
                overlay.style.height = "auto";
                overlay.style.alignItems = "flex-start";
              }
              dlg.style.maxHeight = "none";
              dlg.style.height = "auto";
              for (const el of Array.from(dlg.querySelectorAll<HTMLElement>(".overflow-y-auto"))) {
                el.style.overflow = "visible";
                el.style.maxHeight = "none";
              }
            }, spec.expandModalForShot)
            .catch(() => {});
          await new Promise((r) => setTimeout(r, 200));
        }

        // กันล้ำ: รีเซ็ตสกอลกลับ 0 อีกชั้นก่อนกดชัตเตอร์เสมอ (ไม่ว่าจะ click/hover/flow หรือแค่ path ตรง ๆ อย่าง WO 1.5)
        // + รอ 200ms ให้ layout/paint นิ่งก่อนถ่าย (กัน fixed Topbar/NavDrawer เพี้ยนตำแหน่งใน fullPage screenshot)
        await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
        await new Promise((r) => setTimeout(r, 200));

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
            // 🔴 WO 2.2: testid บน SVG (<rect>/<circle>/<text> ของกราฟ/โดนัท) ไม่มี .innerText (HTMLElement เท่านั้น)
            // → fallback .textContent เสมอ กัน TypeError "Cannot read properties of undefined (reading 'trim')"
            testids: Object.fromEntries(
              [...document.querySelectorAll("[data-testid]")].map((el) => [
                el.getAttribute("data-testid") ?? "",
                ((el as HTMLElement).innerText ?? el.textContent ?? "").trim(),
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
            // WO 1.7 — เอกสารกลุ่ม (BN/CP · §5.2 K): แถบ bulk · ฟอร์มเลือกใบลูก · ตาราง "เอกสารในกลุ่ม"
            group: {
              bulkBarText: document.querySelector('[data-testid="list-docs-bulk-bar"]')?.textContent?.trim() ?? "",
              bulkActionText: document.querySelector('[data-testid="list-docs-bulk-action-0"]')?.textContent?.trim() ?? "",
              bulkActionDisabled: (() => {
                const el = document.querySelector('[data-testid="list-docs-bulk-action-0"]');
                if (!el) return null;
                return el.tagName === "BUTTON" ? (el as HTMLButtonElement).disabled : false;
              })(),
              hasEditor: !!document.querySelector('[data-testid="group-editor"]'),
              // เดสก์ท็อป = แถวตาราง (child-row-…) · มือถือ = การ์ด (child-card-…) — นับเฉพาะที่มองเห็นจริง
              childRows: [...document.querySelectorAll('[data-testid^="child-row-"], [data-testid^="child-card-"]')].filter(isVisible).length,
              // แถวที่ "ติ๊กได้จริง" กับ "ถูกล็อก (อยู่ในใบวางบิลอื่นแล้ว)" — fixture จงใจมีทั้ง 2 แบบอย่างละ 3
              childEligible: [...document.querySelectorAll('[data-eligible="1"]')].filter(isVisible).length,
              childBlocked: [...document.querySelectorAll('[data-eligible="0"]')].filter(isVisible).length,
              childSelected: [...document.querySelectorAll('[data-testid^="child-row-"][data-selected="1"], [data-testid^="child-card-"][data-selected="1"]')].filter(isVisible).length,
              tableRows: document.querySelectorAll('[data-testid="group-table"] tbody tr').length,
              summary: document.querySelector('[data-testid="group-summary"]')?.textContent?.trim() ?? "",
              summaryM: document.querySelector('[data-testid="group-summary-m"]')?.textContent?.trim() ?? "",
              selectedCount: document.querySelector('[data-testid="group-selected-count"]')?.textContent?.trim() ?? "",
              total: document.querySelector('[data-testid="group-total"]')?.textContent?.trim() ?? "",
              hasChildrenTable: !!document.querySelector('[data-testid="group-children"]'),
              groupChildCount: document.querySelectorAll('[data-testid^="group-child-"]').length,
              childrenCountLabel: document.querySelector('[data-testid="group-children-count"]')?.textContent?.trim() ?? "",
              childrenOutstanding: document.querySelector('[data-testid="group-children-outstanding"]')?.textContent?.trim() ?? "",
              primaryAction: document.querySelector('[data-testid="btn-primary-action"]')?.textContent?.trim() ?? "",
            },
            // WO 1.6 — wizard เอกสารปรับปรุงหนี้ (CN/DN/CNR/DNR/RPR · §5.2 J · g3)
            // 🔴 ตาราง (เดสก์ท็อป [data-testid^="ref-row-"]) กับการ์ด (มือถือ [data-testid^="ref-card-"]) เป็นคนละ
            //    element กัน (breakpoint คนละตัวซ่อน/โชว์) — อ่านค่าต้องกรอง "ที่มองเห็นอยู่จริง" เท่านั้น ไม่งั้นตัวที่ถูก
            //    `display:none` (ของอีก breakpoint) จะมาปนแล้วนับซ้ำ/อ่านค่าจาก element ที่ผู้ใช้มองไม่เห็น
            wizard: {
              hasStep1: !!document.querySelector('[data-testid="adjust-wizard-step1"]'),
              rowCount: [...document.querySelectorAll('[data-testid^="ref-row-"], [data-testid^="ref-card-"]')].filter(
                isVisible,
              ).length,
              selectedRowTestId:
                [...document.querySelectorAll('[data-testid^="ref-row-"][data-selected="1"], [data-testid^="ref-card-"][data-selected="1"]')]
                  .find(isVisible)
                  ?.getAttribute("data-testid") ?? "",
              btnNextDisabled: (() => {
                const el = document.querySelector('[data-testid="btn-next"]');
                return el ? el.tagName === "BUTTON" && (el as HTMLButtonElement).disabled : null;
              })(),
              hasCapLine: !!document.querySelector('[data-testid="cap-line"]'),
              hasReasonSelect: !!document.querySelector('[data-testid="reason-select"]'),
              hasRefChip: !!document.querySelector('[data-testid="ref-chip"]'),
              hasWizardStep: !!document.querySelector('[data-testid="wizard-step"]'),
            },
            // WO 1.9 — เอกสารประจำ (รายการ/ฟอร์ม) + ศูนย์แจ้งเตือน
            recurring: {
              hasTable: !!document.querySelector('[data-testid="recurring-table"]'),
              ruleRows: [...document.querySelectorAll('[data-testid^="rec-row-"]')].filter(isVisible).length,
              statusLabels: [...document.querySelectorAll('[data-testid^="rec-status-"]')].map((el) => el.textContent?.trim() ?? ""),
              nextRuns: [...document.querySelectorAll('[data-testid^="rec-next-"]')].map((el) => el.textContent?.trim() ?? ""),
              hasForm: !!document.querySelector('[data-testid="recurring-form"]'),
              hasScheduleCard: !!document.querySelector('[data-testid="card-schedule"]'),
              hasLineTable: !!document.querySelector('[data-testid="card-lines"]'),
              // ฟอร์มเอกสารประจำต้อง **ไม่มี** ช่องวันที่ออก/ครบกำหนดของเอกสาร (นั่นคือของ DocEditorV2)
              hasIssueDateField: !!document.querySelector('[data-testid="fld-issue"]'),
              nextPreview: document.querySelector('[data-testid="rec-next-preview"]')?.textContent?.trim() ?? "",
              frequency: (document.querySelector('[data-testid="rec-frequency"]') as HTMLSelectElement | null)?.value ?? "",
              ruleName: (document.querySelector('[data-testid="rec-name"]') as HTMLInputElement | null)?.value ?? "",
              // ศูนย์แจ้งเตือน: นับแถวจากป้ายหัวข้อที่ WO 1.9 เขียน
              notiRows: ["ครบกำหนดพรุ่งนี้", "พ้นกำหนดชำระแล้ว", "เช็คถึงกำหนด"].filter((t) =>
                (document.body.innerText ?? "").includes(t),
              ).length,
            },
            // WO 2.2 — หน้าหลัก V2 (§4): กราฟ/โดนัท/เมนูสร้างเอกสาร/เช็กลิสต์/จานสี
            dash: {
              hasHome: !!document.querySelector('[data-testid="dash-home"]'),
              barRevenueCount: document.querySelectorAll('[data-testid^="bar-revenue-"]').length,
              createMenuVisible:
                isVisible(document.querySelector('[data-testid="create-doc-menu"]')) ||
                isVisible(document.querySelector('[data-testid="create-doc-menu-m"]')),
              checklistVisible: isVisible(document.querySelector('[data-testid="dash-checklist"]')),
              pendingRowCount: document.querySelectorAll('[data-testid^="pending-row-"]').length,
              pinnedFinanceCount: document.querySelectorAll('[data-testid^="pinned-finance-card-"]').length,
              pinnedLedgerCount: document.querySelectorAll('[data-testid^="pinned-ledger-card-"]').length,
              donutCenter: document.querySelector('[data-testid="donut-center"]')?.textContent?.trim() ?? "",
              // ผลรวมแถบอายุหนี้ (อ่านจากข้อความ "฿n,nnn" ท้ายแต่ละแถว) — เทียบกับยอดค้างรับ/ค้างจ่ายจริง
              agingSum: [...document.querySelectorAll('[data-testid^="aging-"]')].reduce((sum, el) => {
                const matches = (el.textContent ?? "").match(/฿[\d,]+(\.\d+)?/g) ?? [];
                const last = matches[matches.length - 1] ?? "";
                return sum + (Number(last.replace(/[฿,]/g, "")) || 0);
              }, 0),
              // จานสี: ทุก fill/stroke ของ SVG ในหน้าหลักต้องอยู่ในโทเคนที่อนุญาต (accent/เทา/danger/none) เท่านั้น
              paletteViolations: (() => {
                const PALETTE = new Set([
                  "#1d4ed8", "#0a0a0a", "#404040", "#737373", "#a3a3a3", "#d4d4d4", "#e5e5e5", "#b91c1c", "#ffffff",
                  "none", "transparent", "currentcolor",
                ]);
                const root = document.querySelector('[data-testid="dash-home"]');
                if (!root) return ["(ไม่พบ dash-home)"];
                const bad: string[] = [];
                root.querySelectorAll("svg *").forEach((el) => {
                  for (const attr of ["fill", "stroke"]) {
                    const v = (el.getAttribute(attr) ?? "").toLowerCase().trim();
                    if (!v || PALETTE.has(v)) continue;
                    bad.push(`${el.tagName}[${attr}=${v}]`);
                  }
                });
                return bad;
              })(),
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
            c.push([
              !!tailClear && tailClear.tailBottom <= tailClear.barTop,
              `แถบปุ่มท้ายไม่ทับเนื้อหา: ก้นการ์ด "แนบไฟล์" ${tailClear?.tailBottom} ≤ ขอบบนแถบ ${tailClear?.barTop} (เลื่อนสุดหน้า)`,
            ]);
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

        // WO 1.5 หน้าเอกสาร V2 — มือถือ (f14) ต้องไม่ล้นแนวนอนบนความกว้าง 390
        if (ASSERT && WO === "1.5" && device === "mobile") {
          const ok15 = probe.overflow === 0;
          if (!ok15) failures++;
          console.log(`  ${ok15 ? "✅" : "❌"} [${spec.name}/${device}] ไม่ล้นแนวนอน: scrollWidth เกิน ${probe.overflow}px (ต้อง 0)`);
        }

        // WO 1.6 — wizard เอกสารปรับปรุงหนี้ (§5.2 J) เทียบ g3-creditnote-wizard.png
        if (ASSERT && WO === "1.6") {
          const c16: [boolean, string][] = [];
          if (spec.name === "cn-wizard-step1") {
            c16.push([probe.wizard.hasStep1, `ขั้น ① ขึ้นจริง [data-testid="adjust-wizard-step1"]`]);
            c16.push([probe.wizard.hasWizardStep, `มีสเต็ปเปอร์ [data-testid="wizard-step"]`]);
            c16.push([probe.wizard.rowCount >= 1, `ตารางมีแถวอย่างน้อย 1 แถว (เจอ ${probe.wizard.rowCount})`]);
            c16.push([
              // เดสก์ท็อป = ref-row-… (ตาราง) · มือถือ = ref-card-… (การ์ด) — ตัวที่มองเห็นอยู่ต้องถูกเลือกไว้เท่านั้น
              probe.wizard.selectedRowTestId === `ref-row-${E.fixtures.invSimilanViewDocNo}` ||
                probe.wizard.selectedRowTestId === `ref-card-${E.fixtures.invSimilanViewDocNo}`,
              `หลังคลิกแล้วแถว/การ์ด IV ${E.fixtures.invSimilanViewDocNo} ถูกไฮไลต์เลือกไว้ (data-selected="1") — เจอ "${probe.wizard.selectedRowTestId}"`,
            ]);
            c16.push([probe.wizard.btnNextDisabled === false, `ปุ่ม "ถัดไป" เปิดใช้งานหลังเลือกแถว (btn-next ไม่ disabled)`]);
            if (device === "mobile") c16.push([probe.overflow === 0, `มือถือไม่ล้นแนวนอน (390px) — เจอล้น ${probe.overflow}px`]);
          }
          if (spec.name === "cn-wizard-step2") {
            c16.push([probe.editor.hasForm, `ขั้น ② เป็นฟอร์มเดียวกับ DocEditorV2 [data-testid="doc-editor-v2"]`]);
            c16.push([probe.wizard.hasWizardStep, `มีสเต็ปเปอร์ [data-testid="wizard-step"] (① เลือกเอกสาร ✓ · ② current)`]);
            c16.push([probe.wizard.hasRefChip, `มี chip อ้างอิงเอกสารเดิม [data-testid="ref-chip"]`]);
            c16.push([probe.wizard.hasCapLine, `มีบรรทัดเพดาน [data-testid="cap-line"]`]);
            c16.push([probe.testids["cap-line"]?.includes("62,250.00") ?? false, `cap-line มีข้อความ "62,250.00" (เจอ "${probe.testids["cap-line"]}")`]);
            c16.push([probe.wizard.hasReasonSelect, `มีช่องเลือกเหตุผล [data-testid="reason-select"]`]);
            if (device === "mobile") c16.push([probe.overflow === 0, `มือถือไม่ล้นแนวนอน (390px) — เจอล้น ${probe.overflow}px`]);
          }
          for (const [okc, label] of c16) {
            if (!okc) failures++;
            console.log(`  ${okc ? "✅" : "❌"} [${spec.name}/${device}] ${label}`);
          }
        }

        // WO 1.7 — ใบวางบิลรวม/ใบรวมจ่าย (§5.2 K) เทียบ f3-invoice-list-menu.png + ตัวเลขจริงจาก fixture
        if (ASSERT && WO === "1.7") {
          const money = (satang: number) => "฿" + (satang / 100).toLocaleString("th-TH", { minimumFractionDigits: 2 });
          const c17: [boolean, string][] = [];
          if (spec.name === "invoice-list-bulk") {
            c17.push([probe.group.bulkBarText.includes("เลือก 2 รายการ"), `แถบ bulk ขึ้นข้อความ "เลือก 2 รายการ" (เจอ "${probe.group.bulkBarText}")`]);
            c17.push([probe.group.bulkActionText.includes("ออกใบวางบิลรวม"), `ปุ่มแรกของแถบ bulk = "ออกใบวางบิลรวม" (เจอ "${probe.group.bulkActionText}")`]);
            c17.push([probe.group.bulkActionDisabled === false, `เลือกใบของลูกค้ารายเดียวกันที่ยังค้างชำระ → ปุ่มใช้งานได้จริง (ไม่ใช่ปุ่มจาง)`]);
          }
          if (spec.name === "bn-new") {
            // fixture จงใจสร้าง IV 6 ใบของลูกค้ารายเดียว: 3 ใบว่าง (ติ๊กได้) + 3 ใบที่อยู่ในใบวางบิลแล้ว (ล็อกไว้
            // พร้อมเหตุผล) ⇒ ไม้บรรทัดต้องวัด "ติ๊กได้ 3 / ล็อก 3" ไม่ใช่ "ตารางมี 3 แถว"
            c17.push([probe.group.hasEditor, `ฟอร์มกลุ่มขึ้นจริง [data-testid="group-editor"] (positive control ของด่านที่เหลือ)`]);
            c17.push([probe.group.childEligible === 3, `ใบที่ติ๊กได้ 3 ใบ (เจอ ${probe.group.childEligible})`]);
            c17.push([probe.group.childBlocked === 3, `ใบที่อยู่ในใบวางบิลอื่นแล้วถูกล็อก 3 ใบ (เจอ ${probe.group.childBlocked})`]);
            c17.push([probe.group.childSelected === 3, `ติ๊กไว้ครบ 3 ใบจากปุ่ม bulk (เจอ ${probe.group.childSelected})`]);
            c17.push([probe.group.selectedCount === "3", `บรรทัดสรุปบอก "เลือก 3 รายการ" (เจอ "${probe.group.selectedCount}")`]);
            c17.push([
              probe.group.total.includes(money(fx17.freeSum)),
              `"รวมยอดที่เลือก" = ผลรวมยอดค้างจริงของ 3 ใบ ${money(fx17.freeSum)} (เจอ "${probe.group.total}")`,
            ]);
            // แถบปุ่มท้าย: สรุปอยู่ซ้ายปุ่มบนเดสก์ท็อป · เป็นบรรทัดเหนือปุ่มบนมือถือ
            const bar = device === "desktop" ? probe.group.summary : probe.group.summaryM;
            c17.push([bar.includes("เลือก 3 รายการ") && bar.includes(money(fx17.freeSum)), `แถบปุ่มท้ายสรุป "เลือก 3 รายการ · รวม ${money(fx17.freeSum)}" (เจอ "${bar}")`]);
            if (device === "mobile") c17.push([probe.overflow === 0, `มือถือไม่ล้นแนวนอน (390px) — เจอล้น ${probe.overflow}px`]);
          }
          if (spec.name === "bn-detail") {
            c17.push([probe.group.hasChildrenTable, `หน้าเอกสารแสดงตาราง "เอกสารในกลุ่ม" [data-testid="group-children"]`]);
            c17.push([probe.group.tableRows === 3, `[data-testid="group-table"] มี 3 แถว = ใบแจ้งหนี้ลูก 3 ใบ (เจอ ${probe.group.tableRows})`]);
            c17.push([probe.h1 === fx17.bnDocNo, `h1 = เลขที่ใบวางบิล ${fx17.bnDocNo} (เจอ "${probe.h1}")`]);
            c17.push([probe.group.childrenCountLabel === "3", `หัวตารางบอกจำนวน 3 ใบ (เจอ "${probe.group.childrenCountLabel}")`]);
            c17.push([
              probe.group.childrenOutstanding.includes(money(fx17.groupSum)),
              `ยอดค้างรวมของกลุ่ม = ${money(fx17.groupSum)} (เจอ "${probe.group.childrenOutstanding}")`,
            ]);
            c17.push([
              (probe.testids["doc-grand"] ?? "").includes(money(fx17.groupSum)),
              `ยอดสุทธิบนหัวเอกสาร = ${money(fx17.groupSum)} (เจอ "${probe.testids["doc-grand"]}")`,
            ]);
            c17.push([probe.group.primaryAction.includes("รับชำระ"), `ปุ่มดำหลัก = "รับชำระ" (เจอ "${probe.group.primaryAction}")`]);
            if (device === "mobile") c17.push([probe.overflow === 0, `มือถือไม่ล้นแนวนอน (390px) — เจอล้น ${probe.overflow}px`]);
          }
          for (const [okc, label] of c17) {
            if (!okc) failures++;
            console.log(`  ${okc ? "✅" : "❌"} [${spec.name}/${device}] ${label}`);
          }
        }

        // WO 1.8 — ตัวช่วยนำเข้า CSV (§8.5): ไฟล์ 20 แถว (18 ok + 2 err) → ตัวนับตรงเฉลย + เหตุผล error เห็นบนจอ
        if (ASSERT && WO === "1.8") {
          const c18: [boolean, string][] = [];
          if (spec.name === "import-documents-preview") {
            c18.push([(probe.testids["import-count-ok"] ?? "").includes("18"), `ตัวนับ "พร้อมนำเข้า" = 18 (เจอ "${probe.testids["import-count-ok"]}")`]);
            c18.push([(probe.testids["import-count-warn"] ?? "").includes("0"), `ตัวนับ "เตือน" = 0 (เจอ "${probe.testids["import-count-warn"]}")`]);
            c18.push([(probe.testids["import-count-err"] ?? "").includes("2"), `ตัวนับ "ผิดพลาด" = 2 (เจอ "${probe.testids["import-count-err"]}")`]);
            c18.push([probe.all.includes("วันที่ผิดรูปแบบ"), `เหตุผล error "วันที่ผิดรูปแบบ" ขึ้นบนจอจริง (ไม่ใช่แค่ในผลลัพธ์ preview ที่ไม่โชว์)`]);
            c18.push([probe.all.includes("ยอดติดลบ"), `เหตุผล error "ยอดติดลบ" ขึ้นบนจอจริง`]);
            if (device === "mobile") c18.push([probe.overflow === 0, `มือถือไม่ล้นแนวนอน (390px) — เจอล้น ${probe.overflow}px`]);
          }
          if (spec.name === "import-documents-result") {
            c18.push([(probe.testids["import-result"] ?? "").includes("สร้างใหม่ 18 รายการ"), `สรุปผล "สร้างใหม่ 18 รายการ" (เจอ "${probe.testids["import-result"]}")`]);
            if (device === "mobile") c18.push([probe.overflow === 0, `มือถือไม่ล้นแนวนอน (390px) — เจอล้น ${probe.overflow}px`]);
          }
          for (const [okc, label] of c18) {
            if (!okc) failures++;
            console.log(`  ${okc ? "✅" : "❌"} [${spec.name}/${device}] ${label}`);
          }
        }

        // WO 1.9 — เอกสารประจำ (§0.3 ข้อ 7) + ศูนย์แจ้งเตือน (§0.3 ข้อ 4)
        if (ASSERT && WO === "1.9") {
          const c19: [boolean, string][] = [];
          if (spec.name === "recurring-list") {
            c19.push([probe.recurring.hasTable, "มีตารางเอกสารประจำจริง (ไม่ใช่ empty state)"]);
            c19.push([probe.recurring.ruleRows === 2, `ตารางมีกฎ 2 แถว (เจอ ${probe.recurring.ruleRows})`]);
            c19.push([
              probe.recurring.statusLabels.every((t: string) => t === "ทำงานอยู่"),
              `สถานะทุกแถวเป็นไทย "ทำงานอยู่" (เจอ ${JSON.stringify(probe.recurring.statusLabels)})`,
            ]);
            c19.push([
              probe.recurring.nextRuns.every((t: string) => /^\d{1,2} [ก-๙.]+ \d{4}$/.test(t)),
              `คอลัมน์ "รอบถัดไป" เป็นวันที่ไทย ค.ศ. (เจอ ${JSON.stringify(probe.recurring.nextRuns)})`,
            ]);
            c19.push([!probe.all.includes("MONTHLY") && !probe.all.includes("WEEKLY"), "ไม่มีชื่อ enum ดิบโผล่บนจอ"]);
          }
          if (spec.name === "recurring-form") {
            c19.push([probe.recurring.hasForm, "เปิดฟอร์มเอกสารประจำได้จริง"]);
            c19.push([probe.recurring.hasScheduleCard, 'มีการ์ด "ตารางเวลา"']);
            c19.push([probe.recurring.hasLineTable, 'มีการ์ด "รายการในแม่แบบ" (ตารางตัวเดียวกับฟอร์มเอกสาร)']);
            c19.push([!probe.recurring.hasIssueDateField, "ฟอร์มไม่มีช่องวันที่ออกเอกสาร (แม่แบบไม่มีวันที่ — ตามสเปค WO)"]);
            c19.push([
              probe.recurring.nextPreview.includes("รอบถัดไป"),
              `แสดง "รอบถัดไป" ให้ผู้ใช้เห็น (เจอ "${probe.recurring.nextPreview}")`,
            ]);
            c19.push([
              probe.recurring.ruleName.includes("ค่าเช่าสำนักงาน"),
              `ชื่อกฎถูกเติมกลับเข้าฟอร์ม (เจอ "${probe.recurring.ruleName}")`,
            ]);
            c19.push([probe.recurring.frequency === "MONTHLY", `ความถี่ที่เลือกไว้ถูกเติมกลับ (เจอ "${probe.recurring.frequency}")`]);
          }
          if (spec.name === "notifications") {
            c19.push([probe.recurring.notiRows === 3, `ศูนย์แจ้งเตือนแสดงแถวเตือนครบ 3 ชนิด (เจอ ${probe.recurring.notiRows})`]);
          }
          if (device === "mobile") c19.push([probe.overflow === 0, `มือถือไม่ล้นแนวนอน (390px) — เจอล้น ${probe.overflow}px`]);
          for (const [okc, label] of c19) {
            if (!okc) failures++;
            console.log(`  ${okc ? "✅" : "❌"} [${spec.name}/${device}] ${label}`);
          }
        }

        // WO 2.2 — หน้าหลัก V2 (§4) เทียบ f1/f2/f11 + ตัวเลขจริงจาก dashboardSnapshot (เฉลยเดียวกับ WO 2.1)
        if (ASSERT && WO === "2.2") {
          const c22: [boolean, string][] = [];
          if (spec.name === "hub") {
            c22.push([probe.dash.hasHome, `หน้าหลัก V2 ขึ้นจริง [data-testid="dash-home"] (positive control ของด่านที่เหลือ)`]);
            c22.push([probe.dash.barRevenueCount === 12, `กราฟมีแท่งรายได้ครบ 12 เดือน (เจอ ${probe.dash.barRevenueCount})`]);
            // 🔴 ห้ามเช็คด้วย !!probe.testids[tid] — <rect> ของ SVG มี .textContent = "" (ไม่ใช่ undefined) เสมอ
            // ⇒ ค่าว่างเป็น falsy หลอกว่า "ไม่เจอ" ทั้งที่ element มีจริง ต้องเช็คว่า key มีอยู่ใน object แทน
            c22.push([
              "bar-revenue-2026-09" in probe.testids,
              `มีแท่งของเดือน ก.ย. 2026 [data-testid="bar-revenue-2026-09"] (5 เดือนที่มีข้อมูลจริงตาม wo-notes/2.1.md คือ พ.ค.–ก.ย.)`,
            ]);
            c22.push([
              probe.dash.donutCenter.includes("524,308"),
              `ศูนย์กลางโดนัทรายได้เดือนนี้ = ยอดรวมรายได้ ก.ย. 2026 ตามเฉลย ฿524,308.42 (เจอ "${probe.dash.donutCenter}")`,
            ]);
            c22.push([
              Math.abs(probe.dash.agingSum - 486300) < 1,
              `ผลรวมแถบอายุหนี้ (ฝั่งลูกหนี้ค่าเริ่มต้น) = ยอดค้างรับรวม ฿486,300 (เจอ ${probe.dash.agingSum})`,
            ]);
            c22.push([probe.dash.pendingRowCount === 1, `งานที่รอคุณแสดงเฉพาะแถวที่ค้างจริง (เฉลย pending.total=1 → 1 แถว) — เจอ ${probe.dash.pendingRowCount}`]);
            c22.push([
              probe.dash.pinnedFinanceCount === 3,
              `บัญชีเงินที่ติดตาม 3 การ์ด (กสิกรไทย/เงินสด/พร้อมเพย์ ตาม seed) — เจอ ${probe.dash.pinnedFinanceCount}`,
            ]);
            c22.push([probe.dash.pinnedLedgerCount === 2, `บัญชีที่ติดตาม (ผังบัญชี) 2 การ์ด (4000/5000 ตาม seed) — เจอ ${probe.dash.pinnedLedgerCount}`]);
            c22.push([
              probe.dash.paletteViolations.length === 0,
              `SVG ในหน้าหลักใช้สีในโทเคนเท่านั้น (accent/เทา/danger/none) — เจอนอกโทเคน: ${JSON.stringify(probe.dash.paletteViolations)}`,
            ]);
            if (device === "mobile") {
              c22.push([w <= 390, `กล้องถ่ายที่ความกว้างมือถือมาตรฐาน 390px (ใช้จริง ${w}px)`]);
              c22.push([probe.overflow === 0, `มือถือไม่ล้นแนวนอน (390px) — เจอล้น ${probe.overflow}px (f11)`]);
            }
          }
          if (spec.name === "hub-create-open") {
            c22.push([probe.dash.createMenuVisible, `กด "+ สร้างเอกสาร ▾" แล้วเมนู [data-testid="create-doc-menu"] ต้องเปิดค้างอยู่ (f2)`]);
          }
          if (spec.name === "hub-checklist") {
            c22.push([probe.dash.checklistVisible, `?checklist=1 บังคับให้เช็กลิสต์ [data-testid="dash-checklist"] โชว์แม้ tenant ทำครบแล้ว (สำหรับถ่ายภาพ QC)`]);
          }
          for (const [okc, label] of c22) {
            if (!okc) failures++;
            console.log(`  ${okc ? "✅" : "❌"} [${spec.name}/${device}] ${label}`);
          }
        }

        // WO 2.3 — "ดูภาพรวม" รายรับ/รายจ่าย (§6): แท่งซ้อน 5 กลุ่มที่มีข้อมูลจริง (พ.ค.–ก.ย. ตาม wo-notes/2.1.md)
        // + ป้ายไทยล้วน + มือถือไม่ล้น + dropdown เปิดอยู่ในภาพเมนู (reuse ด่านเดียวกับ WO 0.4)
        if (ASSERT && WO === "2.3") {
          const c23: [boolean, string][] = [];
          if (spec.name === "revenue-overview" || spec.name === "expense-overview") {
            c23.push(["ov-total" in probe.testids, `หน้ามีตัวเลข [data-testid="ov-total"] จริง`]);
            // 🔴 ห้ามเช็คด้วย !!probe.testids[tid] — <rect> ของ SVG มี .textContent = "" เสมอ (บทเรียนเดียวกับ WO 2.2)
            c23.push([
              "stack-paid-2026-09" in probe.testids,
              `มีแท่งของเดือน ก.ย. 2026 [data-testid="stack-paid-2026-09"] (5 เดือนที่มีข้อมูลจริงคือ พ.ค.–ก.ย. ตาม wo-notes/2.1.md)`,
            ]);
            c23.push([
              "stack-paid-2026-05" in probe.testids,
              `มีแท่งของเดือน พ.ค. 2026 (ต้นช่วงข้อมูลจริง 5 เดือน)`,
            ]);
            const barGroups = new Set(
              Object.keys(probe.testids)
                .filter((k) => k.startsWith("stack-paid-"))
                .map((k) => k.replace("stack-paid-", "")),
            ).size;
            c23.push([barGroups === 12, `กราฟมี 12 กลุ่มแท่งซ้อน (1 ต่อเดือน) — เจอ ${barGroups}`]);
            c23.push([/^฿[\d,]+\.\d{2}$/.test(probe.testids["ov-total"] ?? ""), `ov-total เป็นเงินรูปแบบ ฿n,nnn.nn (เจอ "${probe.testids["ov-total"]}")`]);
            if (device === "mobile") {
              c23.push([w <= 390, `กล้องถ่ายที่ความกว้างมือถือมาตรฐาน 390px (ใช้จริง ${w}px)`]);
              c23.push([probe.overflow === 0, `มือถือไม่ล้นแนวนอน (390px) — เจอล้น ${probe.overflow}px`]);
            }
          }
          if (spec.name === "expense-overview-menu") {
            c23.push([probe.acc.dropdownVisible, `คลิก "รายจ่าย" แล้ว dropdown [data-testid="acc-dropdown"] ต้องเปิดค้างอยู่ (f4-menu)`]);
            c23.push([
              (probe.testids["acc-item-EXPENSE_OVERVIEW"] ?? "").includes("ดูภาพรวม"),
              `รายการ "ดูภาพรวม" ในเมนูเป็นลิงก์ใช้ได้ (ไม่จาง ไม่ใช่ href="#") — เจอ "${probe.testids["acc-item-EXPENSE_OVERVIEW"]}"`,
            ]);
          }
          for (const [okc, label] of c23) {
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
