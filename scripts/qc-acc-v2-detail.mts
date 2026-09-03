// QC WO 1.5 — "หน้าเอกสาร V2" (DocDetailPage ใช้ร่วมฝั่งรายรับ+รายจ่าย · DESIGN-SPEC-V2 §5.3)
// รัน (บังคับ DB QC branch):  QC_ENV_FILE=.env.qc pnpm tsx scripts/qc-acc-v2-detail.mts
//
// ทำไมไม่ render React ตรง ๆ: หน้านี้เป็น server component (ต้อง request context ของ Next)
// ⇒ ที่นี่ตรวจ 2 ชั้น: (P0) สายไฟ/ป้ายของ DocDetailPage.tsx แบบ static (grep source) + (P1–P6) ชั้นข้อมูลจริง
// ของ doc-detail.ts (getDocDetailData/timelineStepsFor) บน DB QC ด้วย tenant ทิ้ง — ภาพจริง/ตัวเลขจริงบนจอ
// อยู่ที่ `visual-acc-v2.mts 1.5` (ต้อง build+serve+chromium ซึ่งสคริปต์นี้ไม่ต้องมี)
//
// ครอบคลุม (ดู ledger/wo-notes/1.5.md):
//   P0  สายไฟ/ป้ายของ DocDetailPage.tsx (static): testid ครบ · action ต่อสถานะครบตาม §3 · destructive ผ่าน ConfirmDialog
//   P1  config ครอบทุก docType ที่มี route จริง (17 — ดู wo-notes เรื่องตัวเลข 18 ที่ WO เขียนไว้)
//   P2  related-doc resolver: สาย QT→IV→RE→TX จริงบนทิ้ง tenant — ทุกจุดต้องชี้ถูกฉบับ
//   P3  ไทม์ไลน์: derive จาก LIST_TABS จริง (จากสาย P2) + หน่วยทดสอบ pure function หลายสถานะ
//   P4  payments/JV/attachments/audit loader ต้อง scope ตามระบบ/ร้าน — ข้าม system/tenant = ไม่เจอ
//   P5  ยกเลิกการชำระ (reuse payment.ts ของ 1.4) → ค้างชำระ (getDocDetailData().remain) กลับมาเต็ม
//   P6  ไม่มีป้ายภาษาอังกฤษปนในข้อความที่ผู้ใช้เห็น (static — ยกเว้นตัวย่อสากล เช่น PDF)

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
console.log("\n===== QC WO 1.5 · หน้าเอกสาร V2 (DocDetailPage) =====");
console.log(`[env] ไฟล์ ${envFile} · DB ${dbHost}\n`);

// ═══════════════════════════ P0 — สายไฟ/ป้าย DocDetailPage.tsx (static) ═══════════════════════════
console.log("P0 สายไฟ+ป้าย DocDetailPage.tsx (ตรงตาม §5.3/§3):");
{
  const src = readFileSync(join(ROOT, "src/components/account-v2/DocDetailPage.tsx"), "utf8");
  // hooks (data-testid) ที่ WO สั่งไว้ทุกตัว
  for (const tid of [
    'data-testid="doc-h1"',
    'data-testid="doc-status"',
    'testId="doc-grand"', // HeaderStat prop → render เป็น data-testid={testId} จริงบนจอ
    'testId="doc-outstanding"',
    'testId="doc-due"',
    'data-testid="btn-primary-action"',
    'testId="timeline"',
    "`related-${slot.kind}`",
    "`tab-${t.key}`",
    "`pay-row-${i + 1}`",
    "`${testPrefix}-${n}`",
  ]) {
    assert(`P0.1 มี hook ${tid}`, src.includes(tid));
  }
  // action ต่อสถานะตาม §3 (ป้ายจริงที่ผู้ใช้เห็น)
  for (const label of [
    "ออกเอกสาร",
    "ส่งอนุมัติ",
    "บันทึก/ตั้งเจ้าหนี้",
    "ลูกค้ายอมรับ",
    "ปฏิเสธ",
    "อนุมัติ",
    "ไม่อนุมัติ",
    "รับใบกำกับแล้ว",
    "รับใบเสร็จแล้ว",
    "คืนมัดจำ",
    "ออกใบกำกับ",
    "แก้ไข",
    "ยกเลิกร่าง",
    "ยกเลิกเอกสาร",
  ]) {
    assert(`P0.2 มีป้ายปุ่ม "${label}"`, src.includes(label));
  }
  assert("P0.3 รับชำระ/บันทึกจ่าย ผ่าน PaymentPanel (ตัวเดียวกับ WO 1.4)", src.includes("PaymentPanel"));
  // Fable QC WO 1.5 รอบ 1: "ยกเลิกร่าง/ยกเลิกเอกสาร" ห้ามอยู่ข้างปุ่มดำหลัก → ย้ายเข้าเมนู "⋯" (DocMoreMenu)
  // ทุก action ทำลายล้างที่เหลืออยู่หน้าเดิม (คืนมัดจำ/ไม่อนุมัติ PO) ยังต้องผ่าน ConfirmDialog
  const confirmDialogCount = (src.match(/<ConfirmDialog/g) ?? []).length;
  assert(`P0.4 ใช้ ConfirmDialog ≥2 จุดที่เหลือในหน้าหลัก (คืนมัดจำ/ไม่อนุมัติ PO) — เจอ ${confirmDialogCount}`, confirmDialogCount >= 2);
  assert("P0.5 void ไม่มีการเรียก .delete( ตรง ๆ (void = reversal ไม่ลบ)", !src.includes(".delete("));
  assert("P0.6 ไม่ import prisma ตรง ๆ (fitness F5 — ผ่าน service/gl แทน)", !/from\s+["']@\/lib\/core\/db["']/.test(src));
  assert("P0.11 หัวเอกสารใช้ DocMoreMenu (ปุ่มกลม ⋯) ไม่ใช่ RowActions (ทำรายการ ▾) — ตาม g4/f14", src.includes("<DocMoreMenu") && !src.includes("<RowActions"));
  assert("P0.12 ปุ่มยกเลิก (ร่าง/เอกสาร) ย้ายเข้าเมนู ⋯ ผ่าน dangerMenuItemFor → prop `danger` ของ DocMoreMenu", src.includes("dangerMenuItemFor") && /danger=\{dangerMenuItemFor/.test(src));

  const menuSrc = readFileSync(join(ROOT, "src/components/account-v2/DocMoreMenu.tsx"), "utf8");
  assert("P0.13 DocMoreMenu ปุ่มทริกเกอร์เป็นวงกลม ⋯ เสมอ (ไม่มี 'ทำรายการ ▾' แบบ RowActions)", menuSrc.includes("⋯") && !menuSrc.includes("ทำรายการ ▾"));
  assert("P0.14 DocMoreMenu มี ConfirmDialog สำหรับรายการทำลายล้าง (ยกเลิก)", menuSrc.includes("<ConfirmDialog"));
  assert("P0.15 DocMoreMenu ไม่ import prisma ตรง ๆ (fitness F5)", !/from\s+["']@\/lib\/core\/db["']/.test(menuSrc));

  // Fable QC WO 1.5 รอบ 1: ตารางการชำระเงิน คอลัมน์ WHT/ผู้บันทึก ต้องแยกคอลัมน์ชัดเจน + ผู้บันทึกเป็นชื่อจริง
  assert("P0.16 ตารางการชำระเงินมีความกว้างคอลัมน์ระบุชัด (colgroup)", src.includes("<colgroup>"));
  assert('P0.17 คอลัมน์ "ผู้บันทึก" ใช้ createdByName จริง (ไม่ใช่ตัวคงที่ "S")', src.includes("p.createdByName") && !/<td className="py-2">S<\/td>/.test(src));
  // แท็บ "รายละเอียด" ต้องมี 7 คอลัมน์ตาม §5.2 C (มิเรอร์ตัวแก้ไข)
  for (const col of ["สินค้า/บริการ", "หน่วย", "ส่วนลด", "ก่อนภาษี"]) {
    assert(`P0.18 แท็บรายละเอียดมีคอลัมน์ "${col}"`, src.includes(col));
  }

  const detailSrc = readFileSync(join(ROOT, "src/lib/modules/account/doc-detail.ts"), "utf8");
  assert("P0.7 doc-detail.ts export getDocDetailData", detailSrc.includes("export async function getDocDetailData"));
  assert("P0.8 doc-detail.ts export timelineStepsFor", detailSrc.includes("export function timelineStepsFor"));
  assert("P0.9 doc-detail.ts export relatedSlotsFor", detailSrc.includes("export async function relatedSlotsFor"));
  assert("P0.10 doc-detail.ts ไม่ import prisma ตรง ๆ (fitness F5 — ย้าย query เข้า service.ts/gl.ts)", !/from\s+["']@\/lib\/core\/db["']/.test(detailSrc));
}

// ═══════════════════════════ P1–P6 — ของจริงบน DB ═══════════════════════════
const { prisma } = await import("@/lib/core/db");
const sysMod = await import("@/lib/modules/system/service");
const acc = await import("@/lib/modules/account/service");
const gl = await import("@/lib/modules/account/gl");
const fin = await import("@/lib/modules/account/finance");
const pay = await import("@/lib/modules/account/payment");
const attachmentMod = await import("@/lib/modules/account/attachment");
const accessMod = await import("@/lib/modules/account/access");
const cfg = await import("@/lib/modules/account/doc-editor-config");
const dd = await import("@/lib/modules/account/doc-detail");

const tag = "QCACC15-" + Date.now();
let tenantId = "";
let tenantId2 = ""; // สำหรับ P4.6 ทดสอบข้าม tenant
const userIds: string[] = [];

try {
  const t = await prisma.tenant.create({ data: { name: tag, slug: tag.toLowerCase() } });
  tenantId = t.id;
  const t2 = await prisma.tenant.create({ data: { name: tag + "-B", slug: tag.toLowerCase() + "-b" } });
  tenantId2 = t2.id;
  const owner = await prisma.user.create({ data: { email: tag.toLowerCase() + "-owner@qc.local", name: "QC เจ้าของ" } });
  userIds.push(owner.id);
  await prisma.membership.create({ data: { userId: owner.id, tenantId, role: "OWNER", unitAccess: ["*"] } });

  const s1 = await sysMod.createSystem(tenantId, "ACCOUNT", "บัญชี " + tag);
  const s2 = await sysMod.createSystem(tenantId, "ACCOUNT", "บัญชีสาขา 2 " + tag);
  const systemId = s1.id;
  const otherSystemId = s2.id;
  console.log(`\n[seed] tenant ${tenantId} · system ${systemId} · ระบบที่สอง ${otherSystemId} · tenant อื่น ${tenantId2}\n`);

  await acc.saveSettings(tenantId, systemId, { orgName: "ร้านดำน้ำ QC 1.5", taxId: "0105561000000", vatRegistered: true, vatRateBp: 700, taxPointBasis: "ON_ISSUE" });
  await gl.ensureAccounting({ tenantId, systemId });

  const customer = await acc.createContact({ tenantId, systemId, kind: "CUSTOMER", legalType: "COMPANY", name: "บริษัท ทดสอบ QC 1.5", taxId: "0105561999999", branchCode: "00000" });
  const cash = await fin.createFinanceAccount({ tenantId, systemId, type: "CASH", name: "เงินสด" });
  if (!cash.ok) throw new Error("สร้างช่องทางการเงินไม่สำเร็จ");

  // ═════════ P1 — config ครอบทุก docType ที่มี route จริง ═════════
  console.log("P1 config ครอบทุก docType:");
  eq("P1.1 EDITOR_DOC_TYPES ครอบ 17 ชนิด (รายรับ 8 + รายจ่าย 9 — ยังไม่มี route ของ COMBINED_PAYMENT/WHT_CERT/GOODS_ISSUE*)", cfg.EDITOR_DOC_TYPES.length, 17);
  assert("P1.2 ทุกชนิดมี route จริง (ไม่ว่าง)", cfg.EDITOR_DOC_TYPES.every((d) => d.route.length > 0));
  assert("P1.3 ทุกชนิดมีป้ายภาษาไทย", cfg.EDITOR_DOC_TYPES.every((d) => /[ก-๙]/.test(d.label)));
  assert("P1.4 sideOf แยกฝั่งถูก (INVOICE=รายรับ · EXPENSE=รายจ่าย)", cfg.sideOf("INVOICE") === "revenue" && cfg.sideOf("EXPENSE") === "expense");

  // ═════════ P2 — related-doc resolver: สาย QT→IV→RE→TX จริง ═════════
  console.log("\nP2 related-doc resolver (สาย QT→IV→RE→TX):");
  const LINE = [{ description: "ทริปทดสอบ QC 1.5", qty: 1, unitName: "ทริป", unitPrice: 10_000_00, vatRateBp: 700 }];
  const qt = await acc.createDocument({ tenantId, systemId, docType: "QUOTATION", contactId: customer.id, issueDate: new Date(), vatMode: "EXCLUDE", vatTiming: "ON_ISSUE", lines: LINE, createdById: owner.id });
  const qtIssued = await acc.issueDocument(tenantId, systemId, qt.id);
  if (!qtIssued.ok) throw new Error("P2: ออกใบเสนอราคาไม่สำเร็จ — " + qtIssued.reason);
  const toIv = await acc.convertDocument(tenantId, systemId, qt.id, "INVOICE", owner.id);
  if (!toIv.ok) throw new Error("P2: แปลง QT→IV ไม่สำเร็จ — " + toIv.reason);
  const ivIssued = await acc.issueDocument(tenantId, systemId, toIv.newId);
  if (!ivIssued.ok) throw new Error("P2: ออกใบแจ้งหนี้ไม่สำเร็จ — " + ivIssued.reason);
  const toRe = await acc.convertDocument(tenantId, systemId, toIv.newId, "RECEIPT", owner.id);
  if (!toRe.ok) throw new Error("P2: แปลง IV→RE ไม่สำเร็จ — " + toRe.reason);
  const reIssued = await acc.issueDocument(tenantId, systemId, toRe.newId);
  if (!reIssued.ok) throw new Error("P2: ออกใบเสร็จไม่สำเร็จ — " + reIssued.reason);
  const toTx = await acc.convertDocument(tenantId, systemId, toRe.newId, "TAX_INVOICE", owner.id);
  if (!toTx.ok) throw new Error("P2: แปลง RE→TX ไม่สำเร็จ — " + toTx.reason);
  const txIssued = await acc.issueDocument(tenantId, systemId, toTx.newId);
  if (!txIssued.ok) throw new Error("P2: ออกใบกำกับไม่สำเร็จ — " + txIssued.reason);

  const qtId = qt.id, ivId = toIv.newId, reId = toRe.newId, txId = toTx.newId;

  const dataQt = await dd.getDocDetailData(tenantId, systemId, qtId);
  const dataIv = await dd.getDocDetailData(tenantId, systemId, ivId);
  const dataRe = await dd.getDocDetailData(tenantId, systemId, reId);
  const dataTx = await dd.getDocDetailData(tenantId, systemId, txId);
  assert("P2.1 โหลด QT/IV/RE/TX สำเร็จครบ", !!dataQt && !!dataIv && !!dataRe && !!dataTx);
  if (dataQt && dataIv && dataRe && dataTx) {
    const findSlot = (rel: typeof dataQt.related, kind: string) => rel.find((s) => s.kind === kind);
    eq("P2.2 QT: ไม่มีอ้างอิงต้นทาง (เป็นจุดเริ่มสาย)", findSlot(dataQt.related, "REFERENCE"), undefined);
    eq("P2.3 QT: ปลายทางแปลงเป็น IV ชี้ถูกฉบับ", findSlot(dataQt.related, "IV")?.doc?.id, ivId);
    eq("P2.4 IV: อ้างอิงต้นทางชี้ QT ถูกฉบับ", findSlot(dataIv.related, "REFERENCE")?.doc?.id, qtId);
    eq("P2.5 IV: ปลายทางแปลงเป็น RE ชี้ถูกฉบับ", findSlot(dataIv.related, "RE")?.doc?.id, reId);
    eq("P2.6 IV: ช่องใบกำกับยังว่าง (—) เพราะ IV ไม่ได้แปลงตรงเป็น TX", findSlot(dataIv.related, "TX")?.doc, null);
    eq("P2.7 RE: อ้างอิงต้นทางชี้ IV ถูกฉบับ", findSlot(dataRe.related, "REFERENCE")?.doc?.id, ivId);
    eq("P2.8 RE: ปลายทางแปลงเป็น TX ชี้ถูกฉบับ", findSlot(dataRe.related, "TX")?.doc?.id, txId);
    eq("P2.9 TX: อ้างอิงต้นทางชี้ RE ถูกฉบับ (relation TAX_FOR)", findSlot(dataTx.related, "REFERENCE")?.doc?.id, reId);
    eq("P2.10 ทุกฉบับในสายมี label ภาษาไทย", [dataQt, dataIv, dataRe, dataTx].every((d) => /[ก-๙]/.test(d!.label)), true);
  }

  // ═════════ P3 — ไทม์ไลน์ ═════════
  console.log("\nP3 ไทม์ไลน์เอกสาร:");
  if (dataQt) {
    eq("P3.1 QT (รอตอบรับ): 5 ก้าว (ร่าง·รออนุมัติ·รอตอบรับ·ยอมรับแล้ว·ปฏิเสธแล้ว)", dataQt.timeline.length, 5);
    const cur = dataQt.timeline.find((s) => s.state === "current");
    eq("P3.2 QT: ก้าวปัจจุบัน = รอตอบรับ", cur?.code, "awaiting");
    eq("P3.3 QT: ก้าว 'ร่าง' เสร็จแล้ว มีวันที่ (ไม่ใช่ null)", dataQt.timeline[0].state === "done" && dataQt.timeline[0].date !== null, true);
  }
  // pure-function: สร้าง TimelineDoc สังเคราะห์ตรง ๆ ไม่ต้องผ่าน DB — ครอบเคสที่ DB ไม่ได้ทำ (VOIDED · ชำระหลายครั้ง)
  const now = new Date("2026-09-18T00:00:00.000Z");
  const issue = new Date("2026-09-22T00:00:00.000Z");
  const pay1 = new Date("2026-09-28T00:00:00.000Z");
  const pay2 = new Date("2026-10-02T00:00:00.000Z");
  const tlPartial = dd.timelineStepsFor({
    docType: "INVOICE", status: "PARTIAL", createdAt: now, issueDate: issue,
    payments: [{ paidAt: pay1, voidedAt: null }, { paidAt: pay2, voidedAt: null }],
  });
  eq("P3.4 IV บางส่วน 2 ครั้ง: 4 ก้าว", tlPartial.length, 4);
  eq("P3.5 IV บางส่วน: ก้าว 3 (ชำระบางส่วน) เป็นปัจจุบัน", tlPartial[2].code === "partial" && tlPartial[2].state === "current", true);
  eq("P3.6 IV บางส่วน: โน้ตนับจำนวนครั้งที่รับชำระถูกต้อง (2 ครั้ง)", tlPartial[2].note, "รับชำระ 2");
  eq("P3.7 IV บางส่วน: ก้าว 'ชำระแล้ว' ยังไม่ถึง (date=null)", tlPartial[3].state === "next" && tlPartial[3].date === null, true);
  const tlVoided = dd.timelineStepsFor({ docType: "INVOICE", status: "VOIDED", createdAt: now, issueDate: issue, payments: [] });
  eq("P3.8 IV ที่ถูกยกเลิก (สถานะไม่อยู่ในลำดับปกติ): ก้าวสุดท้ายกลายเป็นปัจจุบัน (ไม่พังทั้งไทม์ไลน์)", tlVoided.at(-1)?.state, "current");
  const tlPayVoided = dd.timelineStepsFor({
    docType: "INVOICE", status: "PARTIAL", createdAt: now, issueDate: issue,
    payments: [{ paidAt: pay1, voidedAt: pay1 }], // ครั้งเดียว ถูกยกเลิกแล้ว → ไม่นับเป็น "รับชำระ"
  });
  eq("P3.9 การชำระที่ถูกยกเลิกแล้วไม่ถูกนับในโน้ตไทม์ไลน์", tlPayVoided[2].note, undefined);

  // ═════════ P4 — payments/JV/attachments/audit ต้อง scope ตามระบบ/ร้าน ═════════
  console.log("\nP4 ขอบเขต (cross-system/cross-tenant):");
  eq("P4.1 getDocDetailData ข้ามระบบ (systemId อื่นในร้านเดียวกัน) = ไม่พบ", await dd.getDocDetailData(tenantId, otherSystemId, ivId), null);
  eq("P4.2 getDocDetailData ข้ามร้าน (tenantId อื่น) = ไม่พบ", await dd.getDocDetailData(tenantId2, systemId, ivId), null);
  const attRow = await prisma.accountAttachment.create({
    data: { tenantId, systemId, documentId: ivId, fileName: "test.pdf", fileUrl: "https://example.com/test.pdf", mimeType: "application/pdf", sizeBytes: 100 },
  });
  eq("P4.3 listAttachments ข้ามระบบ = ไม่เจอไฟล์ของเอกสารนี้", (await attachmentMod.listAttachments(tenantId, otherSystemId, { documentId: ivId })).length, 0);
  eq("P4.4 listAttachments ระบบถูกต้อง = เจอไฟล์", (await attachmentMod.listAttachments(tenantId, systemId, { documentId: ivId })).length, 1);
  await accessMod.writeAudit({ tenantId, actorId: owner.id, action: "account.doc.issue", targetType: "AccountDocument", targetId: ivId });
  eq("P4.5 listDocAuditLogs ร้านถูกต้อง = เจอประวัติ", (await accessMod.listDocAuditLogs(tenantId, ivId)).length >= 1, true);
  eq("P4.6 listDocAuditLogs ข้ามร้าน (tenantId อื่น + targetId เดิม) = ไม่เจอ (กัน IDOR ข้าม tenant)", (await accessMod.listDocAuditLogs(tenantId2, ivId)).length, 0);
  eq("P4.7 listJournalEntriesForDocument ข้ามระบบ = ไม่เจอ JV ของเอกสารนี้", (await gl.listJournalEntriesForDocument(otherSystemId, ivId, [])).length, 0);
  const jvSameSystem = await gl.listJournalEntriesForDocument(systemId, ivId, []);
  assert("P4.8 listJournalEntriesForDocument ระบบถูกต้อง = เจอ JV ของการออกใบแจ้งหนี้", jvSameSystem.length >= 1);
  await prisma.accountAttachment.delete({ where: { id: attRow.id } });

  // ═════════ P5 — ยกเลิกการชำระ (reuse payment.ts ของ 1.4) → ค้างชำระกลับมาเต็ม ═════════
  console.log("\nP5 ยกเลิกการชำระ → ค้างชำระอัปเดต:");
  const iv2 = await acc.createDocument({ tenantId, systemId, docType: "INVOICE", contactId: customer.id, issueDate: new Date(), vatMode: "EXCLUDE", vatTiming: "ON_ISSUE", lines: LINE, createdById: owner.id });
  const iv2Issued = await acc.issueDocument(tenantId, systemId, iv2.id);
  if (!iv2Issued.ok) throw new Error("P5: ออกใบแจ้งหนี้ไม่สำเร็จ — " + iv2Issued.reason);
  const iv2Row = await prisma.accountDocument.findFirstOrThrow({ where: { id: iv2.id } });
  const before = await dd.getDocDetailData(tenantId, systemId, iv2.id);
  eqAmt("P5.1 ก่อนรับชำระ: ค้างชำระ = ยอดเต็ม", before!.remain, iv2Row.grandTotal);
  const recorded = await acc.recordPayment(tenantId, systemId, iv2.id, { paidAt: new Date(), channel: "CASH", financeAccountId: cash.id, amount: iv2Row.grandTotal, createdById: owner.id });
  if (!recorded.ok) throw new Error("P5: รับชำระไม่สำเร็จ — " + recorded.reason);
  const afterPay = await dd.getDocDetailData(tenantId, systemId, iv2.id);
  eqAmt("P5.2 หลังรับชำระเต็มจำนวน: ค้างชำระ = 0", afterPay!.remain, 0);
  eq("P5.3 หลังรับชำระ: มี 1 แถวในตารางการชำระเงิน (ยังไม่ถูก void)", afterPay!.payments.filter((p) => !p.voidedAt).length, 1);
  // Fable QC WO 1.5 รอบ 1: คอลัมน์ "ผู้บันทึก" ต้องเป็นชื่อจริง (resolve จาก membership+user) ไม่ใช่ตัวคงที่ "S"
  eq("P5.3b ผู้บันทึกในตารางการชำระเงินเป็นชื่อจริง (ไม่ใช่ตัวคงที่)", afterPay!.payments[0].createdByName, "QC เจ้าของ");
  const paymentId = afterPay!.payments[0].id;
  const voided = await pay.voidPaymentAny(tenantId, systemId, iv2.id, paymentId, "QC 1.5 ทดสอบยกเลิก");
  if (!voided.ok) throw new Error("P5: ยกเลิกการชำระไม่สำเร็จ — " + voided.reason);
  const afterVoid = await dd.getDocDetailData(tenantId, systemId, iv2.id);
  eqAmt("P5.4 หลังยกเลิกการชำระ: ค้างชำระกลับมาเต็มจำนวน", afterVoid!.remain, iv2Row.grandTotal);
  eq("P5.5 หลังยกเลิก: แถวการชำระยังอยู่แต่ voidedAt ถูกตั้ง (ไม่ลบทิ้ง — 'ยกเลิกได้ปลอดภัย')", afterVoid!.payments.find((p) => p.id === paymentId)?.voidedAt !== null, true);

  // ═════════ P6 — ไม่มีป้ายภาษาอังกฤษปนในข้อความที่ผู้ใช้เห็น ═════════
  console.log("\nP6 ภาษาไทยทุกที่ (static):");
  {
    // "WHT"/"VAT" = คำย่อสากลที่ใช้ในเอกสารบัญชีไทยจริง (g4-invoice-detail.png ใช้ "WHT" เป็นหัวคอลัมน์ตรง ๆ ·
    // "VAT" ใช้ทั่วทั้งโมดูลอยู่แล้วเช่น DocTotals.tsx `VAT ${vatRateBp}%`) — ไม่ใช่ป้ายอังกฤษที่หลุดมาโดยไม่ตั้งใจ
    const ALLOW_EN = new Set(["PDF", "WHT", "VAT"]);
    const files = [
      "src/components/account-v2/DocDetailPage.tsx",
      "src/components/account-v2/ShareLinkButton.tsx",
      "src/components/account-v2/DocMoreMenu.tsx",
    ];
    for (const f of files) {
      const src = readFileSync(join(ROOT, f), "utf8");
      // ข้อความ jsx ระหว่าง `>...<` ที่มีตัวอักษรอังกฤษล้วน ≥3 ตัว (คำที่ผู้ใช้จะเห็นจริงบนจอ)
      const hits = [...src.matchAll(/>\s*([A-Za-z][A-Za-z ]{2,})\s*</g)]
        .map((m) => m[1].trim())
        .filter((w) => !ALLOW_EN.has(w));
      assert(`P6.1 [${f}] ไม่มีข้อความอังกฤษล้วนปนใน JSX (เจอ: ${hits.join(", ") || "ไม่มี"})`, hits.length === 0);
    }
  }

  // ═════════ ตรวจรวม: สมุดรายวันของ tenant ต้องสมดุล ═════════
  console.log("\nP7 ตรวจรวมทั้ง tenant:");
  const allEntries = (await prisma.accountJournalEntry.findMany({ where: { tenantId }, include: { lines: true } })) as {
    id: string;
    lines: { debit: number; credit: number }[];
  }[];
  const unbalanced = allEntries.filter((e) => e.lines.reduce((s, l) => s + l.debit, 0) !== e.lines.reduce((s, l) => s + l.credit, 0));
  eq("P7.1 ทุกชุดสมุดรายวันของ tenant นี้สมดุล", unbalanced.length, 0);
} finally {
  const del = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      console.log(`  ⚠ cleanup: ${e instanceof Error ? e.message.split("\n")[0] : e}`);
    }
  };
  for (const tid of [tenantId, tenantId2]) {
    if (!tid) continue;
    await del(() => prisma.accountJournalLine.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.accountJournalEntry.updateMany({ where: { tenantId: tid }, data: { reversalOfId: null } }));
    await del(() => prisma.accountJournalEntry.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.accountDocumentPayment.updateMany({ where: { tenantId: tid }, data: { chequeId: null, whtCertDocId: null } }));
    await del(() => prisma.accountDocumentPayment.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.accountDocumentRelation.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.accountAttachment.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.accountDocumentLine.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.accountDocument.updateMany({ where: { tenantId: tid }, data: { sourceDocId: null, replacedById: null, sourcePaymentId: null } }));
    await del(() => prisma.accountDocument.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.accountDocSequence.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.accountMapping.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.accountFinance.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.accountLedger.updateMany({ where: { tenantId: tid }, data: { parentId: null } }));
    await del(() => prisma.accountLedger.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.accountPeriod.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.accountProduct.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.accountContact.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.accountSettings.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.auditLog.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.appSystemUnit.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.appSystem.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.membership.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.tenant.delete({ where: { id: tid } }));
  }
  for (const uid of userIds) await del(() => prisma.user.delete({ where: { id: uid } }));
  console.log("\n[cleanup] ลบ test data เรียบร้อย");
}

console.log(`\n===== สรุป WO 1.5: ผ่าน ${passed} · ไม่ผ่าน ${findings.length} =====`);
if (findings.length > 0) console.log(findings.map((f) => "  • " + f).join("\n"));
console.log(findings.length === 0 ? "🎉 WO 1.5 ผ่านทั้งหมด\n" : "⚠️ มีข้อไม่ผ่าน\n");
process.exit(findings.length === 0 ? 0 : 1);
