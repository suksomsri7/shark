// QC WO 7.1 — คลังเอกสาร V2 (DESIGN-SPEC-V2 §12 · เฟรม f9-documents.png / f9-documents-menu.png)
//
// requires: acc-v2-seed (seed สร้าง 6 ไฟล์ตัวอย่างไว้แล้ว — บล็อก 8.11: 3 UNLINKED · 2 LINKED (EXP/IV) · 1 NOT_ACCOUNTING)
// รัน (บังคับ DB QC branch):
//   QC_ENV_FILE=.env.qc pnpm tsx scripts/seed-acc-v2-qc.mts
//   QC_ENV_FILE=.env.qc pnpm tsx scripts/qc-acc-v2-attachments.mts
//
// 🔴 ร้าน QC จริง (SIAM DIVE QC) = **อ่านอย่างเดียว** (T1–T4) — การเขียนทั้งหมด (อัปโหลด/dedupe/ผูก/แยก/
//    เปลี่ยนประเภท/ย้ายโฟลเดอร์/ลบ/กู้คืน/bulk/guard/tenant isolation) เกิดใน "ร้านทิ้ง" ที่สคริปต์สร้างเอง
//    แล้วลบใน finally (กติกาเดียวกับ WO 5.3/5.4)
//
// ครอบคลุม
//   T1  listAttachmentsPaged: แท็บ all/unlinked/linked ตัวนับ = เฉลย (บล็อก 8.11)
//   T2  ตัวกรอง: docTypeHint (linkedExp=EXPENSE) · uploaderId (staff=2 แถว) · q (ชื่อไฟล์/ผู้อัปโหลด) · sort createdAt
//   T3  linkedExp/linkedIv: docTypeHint = ชนิดเอกสารจริงที่ผูกอยู่เสมอ (ไม่ใช้ hint เดิม)
//   T4  doc-detail: getDocDetailData(firstOpenBillId) มี attachment linkedExp ในแท็บไฟล์แนบ
//   T5  ร้านทิ้ง: อัปโหลดจริง 3 ไฟล์ (pdf/jpg/png) → แถวใหม่ + sha256 + status UNLINKED
//   T6  dedupe: อัปโหลดไฟล์เดิมซ้ำ (sha256 เดิม) → คืน id เดิม ไม่สร้างแถวใหม่
//   T7  validateAttachmentUpload: ปฏิเสธชนิดไฟล์ผิด/ไฟล์ใหญ่เกิน 20MB
//   T8  ผูก/แยก: linkAttachment → LINKED + docTypeHint ตามเอกสาร → ปรากฏใน doc-detail · unlinkAttachment → กลับ UNLINKED + หายจาก doc-detail
//   T9  เปลี่ยนประเภท: setDocTypeHint ทำได้เมื่อยังไม่ผูก · ปฏิเสธเมื่อผูกแล้ว
//   T10 ย้ายโฟลเดอร์: moveAttachment เดี่ยว + moveAttachmentsBulk หลายไฟล์
//   T11 ลบนุ่ม/กู้คืน: archiveAttachment ซ่อนจาก listAttachmentsPaged · restoreAttachment คืนสถานะถูกต้องตามที่ผูกอยู่จริง
//   T12 bulk: archiveAttachmentsBulk หลายไฟล์พร้อมกัน
//   T13 markNotAccounting: ปฏิเสธเมื่อผูกเอกสารอยู่ · สำเร็จเมื่อยังไม่ผูก
//   T14 guard: staff ไม่มี account.document.manage ถูกปฏิเสธ (assertAccountCan) · owner ผ่าน
//   T15 tenant isolation: ผูกไฟล์ของร้าน A กับเอกสารร้าน B = ปฏิเสธ (ไม่พบเอกสาร) · searchDocumentsForAttach ข้ามร้านไม่เจอ ·
//       archive/move/setDocTypeHint ด้วย tenantId/systemId ผิด = ปฏิเสธ "ไม่พบไฟล์" (ไม่กระทบแถวจริง)

const accEnv = (await import("./acc-v2-env.mts" as string)) as {
  loadQcEnv: () => { databaseUrl: string; host: string };
  QC: { expectedPath: string };
};
const { loadQcEnv, QC } = accEnv;
const { host } = loadQcEnv();

const { readFileSync } = await import("node:fs");
const { join } = await import("node:path");
const { prisma } = await import("@/lib/core/db");
const sysMod = await import("@/lib/modules/system/service");
const glMod = await import("@/lib/modules/account/gl");
const finMod = await import("@/lib/modules/account/finance");
const svc = await import("@/lib/modules/account/service");
const exp = await import("@/lib/modules/account/expense");
const att = await import("@/lib/modules/account/attachment");
const storageSvc = await import("@/lib/storage/service");
const docDetail = await import("@/lib/modules/account/doc-detail");
const { assertAccountCan } = await import("@/lib/modules/account/access");

let passed = 0;
const findings: string[] = [];
const ok = (name: string) => { passed++; console.log("  ✅ " + name); };
const bad = (name: string, detail: string) => { findings.push(`${name} — ${detail}`); console.log("  ❌ " + name + " — " + detail); };
const assert = (name: string, cond: boolean, detail = "") => (cond ? ok(name) : bad(name, detail));
const eq = (name: string, actual: unknown, expected: unknown) => {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  assert(name, a === b, `ได้ ${a} · ควรได้ ${b}`);
};
const rejected = async (name: string, fn: () => Promise<{ ok: boolean } | unknown>, mustContain?: string) => {
  try {
    const r = (await fn()) as { ok?: boolean; reason?: string };
    if (r && r.ok === false) {
      if (mustContain && !(r.reason ?? "").includes(mustContain)) {
        bad(name, `ปฏิเสธแล้วแต่เหตุผลไม่ตรง: "${r.reason}" (ต้องมี "${mustContain}")`);
        return;
      }
      ok(`${name} (เหตุผล: ${r.reason})`);
      return;
    }
    bad(name, `ไม่ถูกปฏิเสธ — ได้ ${JSON.stringify(r)}`);
  } catch (e) {
    ok(`${name} (โยน: ${e instanceof Error ? e.message : String(e)})`);
  }
};

console.log(`\n===== QC WO 7.1 · คลังเอกสาร V2 =====`);
console.log(`[env] DB ${host}\n`);

const { readFileSync: rfs } = await import("node:fs");
const E = JSON.parse(rfs(QC.expectedPath, "utf8")) as {
  tenantId: string;
  systemId: string;
  attachments: {
    total: number;
    unlinked: number;
    linked: number;
    notAccounting: number;
    staffUploaderId: string;
    ownerUploaderId: string;
    ids: Record<string, string>;
    linkedExpDocumentId: string;
    linkedIvDocumentId: string;
  };
};
const { tenantId, systemId } = E;
const A = E.attachments;

let sTenantId: string | null = null;
let sTenantId2: string | null = null;
let ownerId: string | null = null;
let staffId: string | null = null;
let owner2Id: string | null = null;

try {
  // ═════════ T1 — ตัวนับแท็บ (ร้านจริง อ่านอย่างเดียว) ═════════
  console.log("T1 ตัวนับแท็บ:");
  const all = await att.listAttachmentsPaged(tenantId, systemId, { tab: "all", pageSize: 100 });
  eq("T1.1 แท็บ ทั้งหมด = เฉลย", all.counts.all, A.total);
  eq("T1.2 แท็บ ยังไม่ออกเอกสาร = เฉลย", all.counts.unlinked, A.unlinked);
  eq("T1.3 แท็บ ออกเอกสารแล้ว = เฉลย", all.counts.linked, A.linked);
  const unlinkedTab = await att.listAttachmentsPaged(tenantId, systemId, { tab: "unlinked", pageSize: 100 });
  eq("T1.4 แถวในแท็บ ยังไม่ออกเอกสาร = 3", unlinkedTab.rows.length, A.unlinked);
  assert("T1.5 ทุกแถวในแท็บนี้ status=UNLINKED", unlinkedTab.rows.every((r) => r.status === "UNLINKED"));
  const linkedTab = await att.listAttachmentsPaged(tenantId, systemId, { tab: "linked", pageSize: 100 });
  eq("T1.6 แถวในแท็บ ออกเอกสารแล้ว = 2", linkedTab.rows.length, A.linked);
  assert("T1.7 ทุกแถวในแท็บนี้มี document ผูกอยู่", linkedTab.rows.every((r) => !!r.document));
  // NOT_ACCOUNTING ไม่นับใน unlinked/linked แต่ยังอยู่ในแท็บ "ทั้งหมด"
  const naRow = all.rows.find((r) => r.id === A.ids.notAccounting);
  assert("T1.8 ไฟล์ NOT_ACCOUNTING อยู่ในแท็บทั้งหมด", !!naRow);
  eq("T1.9 ไฟล์ NOT_ACCOUNTING ไม่อยู่ในแท็บ unlinked/linked", [
    unlinkedTab.rows.some((r) => r.id === A.ids.notAccounting),
    linkedTab.rows.some((r) => r.id === A.ids.notAccounting),
  ], [false, false]);

  // ═════════ T2 — ตัวกรอง ═════════
  console.log("\nT2 ตัวกรอง:");
  const byType = await att.listAttachmentsPaged(tenantId, systemId, { tab: "all", docTypeHint: "EXPENSE", pageSize: 100 });
  assert("T2.1 กรองประเภท EXPENSE พบ linkedExp", byType.rows.some((r) => r.id === A.ids.linkedExp));
  const byUploader = await att.listAttachmentsPaged(tenantId, systemId, { tab: "all", uploaderId: A.staffUploaderId, pageSize: 100 });
  eq("T2.2 กรองผู้อัปโหลด (พนักงาน) = 2 แถว", byUploader.rows.length, 2);
  const byQFile = await att.listAttachmentsPaged(tenantId, systemId, { tab: "all", q: "ปตท", pageSize: 100 });
  assert("T2.3 ค้นหาชื่อไฟล์ 'ปตท' พบ unlinked1", byQFile.rows.some((r) => r.id === A.ids.unlinked1));
  const byQUploader = await att.listAttachmentsPaged(tenantId, systemId, { tab: "all", q: "นภาพร", pageSize: 100 });
  eq("T2.4 ค้นหาชื่อผู้อัปโหลด 'นภาพร' = 2 แถว", byQUploader.rows.length, 2);
  const ascOrder = await att.listAttachmentsPaged(tenantId, systemId, { tab: "all", sortDir: "asc", pageSize: 100 });
  const descOrder = await att.listAttachmentsPaged(tenantId, systemId, { tab: "all", sortDir: "desc", pageSize: 100 });
  eq("T2.5 sort asc/desc สลับด้านกัน", ascOrder.rows.map((r) => r.id).reverse(), descOrder.rows.map((r) => r.id));

  // ═════════ T3 — docTypeHint ของไฟล์ที่ผูกแล้ว = ชนิดเอกสารจริงเสมอ ═════════
  console.log("\nT3 ประเภทของไฟล์ที่ผูกแล้ว:");
  const expRow = all.rows.find((r) => r.id === A.ids.linkedExp);
  eq("T3.1 linkedExp typeLabel = รายจ่าย › บันทึกค่าใช้จ่าย", expRow?.typeLabel, "รายจ่าย › บันทึกค่าใช้จ่าย");
  const ivRow = all.rows.find((r) => r.id === A.ids.linkedIv);
  eq("T3.2 linkedIv typeLabel = รายรับ › ใบแจ้งหนี้", ivRow?.typeLabel, "รายรับ › ใบแจ้งหนี้");

  // ═════════ T4 — ปรากฏในแท็บไฟล์แนบของหน้าเอกสาร ═════════
  console.log("\nT4 doc-detail (หน้าเอกสาร V2 แท็บไฟล์แนบ):");
  const detail = await docDetail.getDocDetailData(tenantId, systemId, A.linkedExpDocumentId);
  assert("T4.1 พบเอกสาร EXP", !!detail);
  assert("T4.2 attachments มี linkedExp", !!detail?.attachments.some((a) => a.id === A.ids.linkedExp));

  // ═════════ ร้านทิ้ง (การเขียนทั้งหมด) ═════════
  console.log("\n── สร้างร้านทดสอบ ──");
  const stamp = Date.now();
  const tag = `qc-att-${stamp}`;
  const t = await prisma.tenant.create({ data: { name: tag, slug: tag } });
  sTenantId = t.id;
  const tid = sTenantId;
  const owner = await prisma.user.create({ data: { email: `${tag}-owner@qc.local`, name: "QC เจ้าของ" } });
  const staff = await prisma.user.create({ data: { email: `${tag}-staff@qc.local`, name: "QC พนักงาน" } });
  ownerId = owner.id;
  staffId = staff.id;
  await prisma.membership.create({ data: { userId: owner.id, tenantId: tid, role: "OWNER", unitAccess: ["*"] } });
  const mStaff = await prisma.membership.create({
    data: { userId: staff.id, tenantId: tid, role: "STAFF", unitAccess: ["*"], permissions: { "account.doc.view": true } },
  });
  const unit = await prisma.businessUnit.create({ data: { tenantId: tid, type: "BOOKING", name: "สาขาทดสอบ", slug: `u-${stamp}`, status: "ACTIVE" } });
  const accSys = await sysMod.createSystem(tid, "ACCOUNT", "บัญชี " + tag);
  await sysMod.linkUnit(tid, accSys.id, unit.id);
  const sSystemId = accSys.id;
  await glMod.ensureAccounting({ tenantId: tid, systemId: sSystemId });

  const bank = await finMod.createFinanceAccount({
    tenantId: tid, systemId: sSystemId, type: "BANK", name: "กสิกรไทย ทดสอบ", bankName: "กสิกรไทย",
    openingEntries: [{ date: new Date("2026-08-01T10:00:00+07:00"), amountSatang: 5_000_000, note: "ยอดยกมา" }],
  });
  if (!bank.ok) throw new Error("สร้างบัญชีธนาคารทดสอบไม่สำเร็จ: " + bank.reason);
  const vendor = await svc.createContact({
    tenantId: tid, systemId: sSystemId, kind: "VENDOR", legalType: "COMPANY", name: "บริษัท ทดสอบ คลังเอกสาร จำกัด",
    taxId: "9999999999998", address: "ทดสอบ", phone: "0899999998", email: null, creditTermDays: 0, note: "V-QC",
  });
  const ledgers = await exp.listExpenseAccounts(sSystemId);
  const expenseAcct = ledgers.find((a) => a.code === "6000") ?? ledgers[0];
  const expDoc = await exp.createExpenseDoc({
    tenantId: tid, systemId: sSystemId, docType: "EXPENSE", contactId: vendor.id,
    issueDate: new Date("2026-09-05T10:00:00+07:00"), dueDate: new Date("2026-09-05T10:00:00+07:00"),
    vatMode: "EXCLUDE", vatPurchaseMode: "CLAIM",
    lines: [{ description: "ทดสอบคลังเอกสาร", qty: 1, unitName: "รายการ", unitPrice: 500_000, accountId: expenseAcct.id }],
    createdById: owner.id,
  });
  const expIssued = await exp.issueExpenseDoc(tid, sSystemId, expDoc.id);
  if (!expIssued.ok) throw new Error("ออกเอกสารทดสอบไม่สำเร็จ: " + expIssued.reason);

  // ร้าน B (สำหรับทดสอบ tenant isolation)
  const tag2 = `qc-att2-${stamp}`;
  const t2 = await prisma.tenant.create({ data: { name: tag2, slug: tag2 } });
  sTenantId2 = t2.id;
  const owner2 = await prisma.user.create({ data: { email: `${tag2}-owner@qc.local`, name: "QC เจ้าของร้าน B" } });
  owner2Id = owner2.id;
  await prisma.membership.create({ data: { userId: owner2.id, tenantId: t2.id, role: "OWNER", unitAccess: ["*"] } });
  const unit2 = await prisma.businessUnit.create({ data: { tenantId: t2.id, type: "BOOKING", name: "สาขา B", slug: `u2-${stamp}`, status: "ACTIVE" } });
  const accSys2 = await sysMod.createSystem(t2.id, "ACCOUNT", "บัญชี " + tag2);
  await sysMod.linkUnit(t2.id, accSys2.id, unit2.id);
  const sSystemId2 = accSys2.id;
  await glMod.ensureAccounting({ tenantId: t2.id, systemId: sSystemId2 });
  const vendor2 = await svc.createContact({
    tenantId: t2.id, systemId: sSystemId2, kind: "VENDOR", legalType: "COMPANY", name: "ผู้ขายร้าน B",
    taxId: "9999999999997", address: "ทดสอบ", phone: "0899999997", email: null, creditTermDays: 0, note: "V-QC",
  });
  const ledgers2 = await exp.listExpenseAccounts(sSystemId2);
  const expDoc2 = await exp.createExpenseDoc({
    tenantId: t2.id, systemId: sSystemId2, docType: "EXPENSE", contactId: vendor2.id,
    issueDate: new Date("2026-09-05T10:00:00+07:00"), dueDate: new Date("2026-09-05T10:00:00+07:00"),
    vatMode: "EXCLUDE", vatPurchaseMode: "CLAIM",
    lines: [{ description: "เอกสารร้าน B", qty: 1, unitName: "รายการ", unitPrice: 100_000, accountId: (ledgers2.find((a) => a.code === "6000") ?? ledgers2[0]).id }],
    createdById: owner2.id,
  });

  // ═════════ T5 — อัปโหลดจริง 3 ไฟล์ (pdf/jpg/png) ═════════
  console.log("\nT5 อัปโหลดจริง 3 ไฟล์:");
  const FIXTURE_DIR = join(process.cwd(), "scripts/fixtures/acc-v2/attach");
  const fJpg = new Uint8Array(readFileSync(join(FIXTURE_DIR, "bill-ptt.jpg")));
  const fPng = new Uint8Array(readFileSync(join(FIXTURE_DIR, "photo.png")));
  const fPdf = new Uint8Array(readFileSync(join(FIXTURE_DIR, "receipt.pdf")));

  async function uploadOne(fileName: string, bytes: Uint8Array, contentType: string) {
    const v = att.validateAttachmentUpload(contentType, bytes.length);
    if (!v.ok) throw new Error(`validate ล้มก่อนอัป: ${v.reason}`);
    const sha256 = att.hashBytes(bytes);
    const up = await storageSvc.uploadFile({ tenantId: tid }, { kind: "ATTACHMENT", filename: fileName, contentType, data: bytes });
    if (!up.ok) throw new Error(`อัปโหลดไม่สำเร็จ: ${up.error}`);
    const res = await att.createAttachment({
      tenantId: tid, systemId: sSystemId, fileName, fileUrl: up.cdnUrl, mimeType: contentType,
      sizeBytes: bytes.length, uploadedById: owner.id, sha256, source: "UPLOAD",
    });
    return { res, sha256 };
  }

  const u1 = await uploadOne("bill-ptt.jpg", fJpg, "image/jpeg");
  assert("T5.1 อัปโหลด jpg สำเร็จ", u1.res.ok);
  const u2 = await uploadOne("photo.png", fPng, "image/png");
  assert("T5.2 อัปโหลด png สำเร็จ", u2.res.ok);
  const u3 = await uploadOne("receipt.pdf", fPdf, "application/pdf");
  assert("T5.3 อัปโหลด pdf สำเร็จ", u3.res.ok);
  if (!u1.res.ok || !u2.res.ok || !u3.res.ok) throw new Error("อัปโหลดพื้นฐานล้มเหลว หยุดการทดสอบต่อ");
  const jpgId = u1.res.id, pngId = u2.res.id, pdfId = u3.res.id;
  const rowsAfterUpload = await prisma.accountAttachment.findMany({ where: { id: { in: [jpgId, pngId, pdfId] } } });
  assert("T5.4 ทั้ง 3 แถวมี sha256", rowsAfterUpload.every((r) => !!r.sha256));
  assert("T5.5 ทั้ง 3 แถว status=UNLINKED", rowsAfterUpload.every((r) => r.status === "UNLINKED"));
  eq("T5.6 pdf มี thumbUrl=null (ไม่ใช่รูป)", rowsAfterUpload.find((r) => r.id === pdfId)?.thumbUrl, null);
  assert("T5.7 jpg มี thumbUrl (เป็นรูป)", !!rowsAfterUpload.find((r) => r.id === jpgId)?.thumbUrl);

  // ═════════ T6 — dedupe ═════════
  console.log("\nT6 dedupe (อัปโหลดไฟล์เดิมซ้ำ):");
  const dup = await att.findAttachmentBySha256(tid, sSystemId, u1.sha256);
  assert("T6.1 หา sha256 ของ jpg เจอแถวเดิม", dup?.id === jpgId);
  const reCreate = await att.createAttachment({
    tenantId: tid, systemId: sSystemId, fileName: "bill-ptt-copy.jpg", fileUrl: "https://example.invalid/x.jpg",
    mimeType: "image/jpeg", sizeBytes: fJpg.length, uploadedById: owner.id, sha256: u1.sha256, source: "UPLOAD",
  });
  assert("T6.2 สร้างซ้ำด้วย sha256 เดิม → duplicate=true", reCreate.ok && reCreate.duplicate === true);
  assert("T6.3 คืน id เดิม ไม่ใช่แถวใหม่", reCreate.ok && reCreate.id === jpgId);
  const countAfterDup = await prisma.accountAttachment.count({ where: { systemId: sSystemId, sha256: u1.sha256 } });
  eq("T6.4 ยังมีแถวเดียวใน DB (ไม่สร้างซ้ำจริง)", countAfterDup, 1);

  // ═════════ T7 — ปฏิเสธชนิดไฟล์/ขนาด ═════════
  console.log("\nT7 ปฏิเสธไฟล์ผิดเงื่อนไข:");
  const badType = att.validateAttachmentUpload("application/zip", 1000);
  assert("T7.1 ปฏิเสธ .zip", !badType.ok);
  const badSize = att.validateAttachmentUpload("image/png", 21 * 1024 * 1024);
  assert("T7.2 ปฏิเสธไฟล์ > 20MB", !badSize.ok);
  const badEmpty = att.validateAttachmentUpload("image/png", 0);
  assert("T7.3 ปฏิเสธไฟล์ว่างเปล่า", !badEmpty.ok);
  const okSmall = att.validateAttachmentUpload("application/pdf", 1000);
  assert("T7.4 pdf ขนาดปกติ = ผ่าน", okSmall.ok);

  // ═════════ T8 — ผูก/แยก ═════════
  console.log("\nT8 ผูก/แยกจากเอกสาร:");
  const link1 = await att.linkAttachment(tid, sSystemId, pdfId, expDoc.id, owner.id);
  assert("T8.1 ผูกไฟล์กับ EXP สำเร็จ", link1.ok);
  const afterLink = await prisma.accountAttachment.findUniqueOrThrow({ where: { id: pdfId } });
  eq("T8.2 status = LINKED", afterLink.status, "LINKED");
  eq("T8.3 docTypeHint = EXPENSE (ตามเอกสารที่ผูก)", afterLink.docTypeHint, "EXPENSE");
  const detail2 = await docDetail.getDocDetailData(tid, sSystemId, expDoc.id);
  assert("T8.4 ปรากฏในแท็บไฟล์แนบของเอกสารทันที", !!detail2?.attachments.some((a) => a.id === pdfId));
  const unlink1 = await att.unlinkAttachment(tid, sSystemId, pdfId, owner.id);
  assert("T8.5 แยกออกจากเอกสารสำเร็จ", unlink1.ok);
  const afterUnlink = await prisma.accountAttachment.findUniqueOrThrow({ where: { id: pdfId } });
  eq("T8.6 status กลับเป็น UNLINKED", afterUnlink.status, "UNLINKED");
  eq("T8.7 documentId ว่าง", afterUnlink.documentId, null);
  const detail3 = await docDetail.getDocDetailData(tid, sSystemId, expDoc.id);
  assert("T8.8 หายจากแท็บไฟล์แนบหลังแยก", !detail3?.attachments.some((a) => a.id === pdfId));

  // ═════════ T9 — เปลี่ยนประเภท ═════════
  console.log("\nT9 เปลี่ยนประเภท:");
  const setType1 = await att.setDocTypeHint(tid, sSystemId, jpgId, "EXPENSE_ANY", owner.id);
  assert("T9.1 เปลี่ยนประเภทไฟล์ที่ยังไม่ผูก สำเร็จ", setType1.ok);
  const afterType = await prisma.accountAttachment.findUniqueOrThrow({ where: { id: jpgId } });
  eq("T9.2 docTypeHint บันทึกแล้ว", afterType.docTypeHint, "EXPENSE_ANY");
  await att.linkAttachment(tid, sSystemId, pngId, expDoc.id, owner.id);
  await rejected("T9.3 เปลี่ยนประเภทไฟล์ที่ผูกแล้ว = ปฏิเสธ", () => att.setDocTypeHint(tid, sSystemId, pngId, "GENERAL", owner.id), "ผูกกับเอกสารแล้ว");
  await att.unlinkAttachment(tid, sSystemId, pngId, owner.id); // คืนสภาพให้ทดสอบขั้นถัดไป

  // ═════════ T10 — ย้ายโฟลเดอร์ ═════════
  console.log("\nT10 ย้ายโฟลเดอร์:");
  const move1 = await att.moveAttachment(tid, sSystemId, jpgId, "ใบเสร็จ 2569");
  assert("T10.1 ย้ายโฟลเดอร์เดี่ยวสำเร็จ", move1.ok);
  const folders = await att.listFolders(tid, sSystemId);
  assert("T10.2 โฟลเดอร์ใหม่ปรากฏในทะเบียน", folders.some((f) => f.folder === "ใบเสร็จ 2569"));
  const moveBulk = await att.moveAttachmentsBulk(tid, sSystemId, [pngId, pdfId], "รวมไฟล์ทดสอบ", owner.id);
  eq("T10.3 ย้ายโฟลเดอร์หลายไฟล์ (bulk) count=2", moveBulk.count, 2);
  const rowsAfterMove = await prisma.accountAttachment.findMany({ where: { id: { in: [pngId, pdfId] } } });
  assert("T10.4 ทั้ง 2 แถวอยู่โฟลเดอร์ใหม่", rowsAfterMove.every((r) => r.folder === "รวมไฟล์ทดสอบ"));

  // ═════════ T11 — ลบนุ่ม/กู้คืน ═════════
  console.log("\nT11 ลบนุ่ม/กู้คืน:");
  const archive1 = await att.archiveAttachment(tid, sSystemId, jpgId, owner.id);
  assert("T11.1 ลบไฟล์สำเร็จ", archive1.ok);
  const listAfterArchive = await att.listAttachmentsPaged(tid, sSystemId, { tab: "all", pageSize: 100 });
  assert("T11.2 ไฟล์ที่ลบหายจากรายการ", !listAfterArchive.rows.some((r) => r.id === jpgId));
  const archivedRow = await prisma.accountAttachment.findUniqueOrThrow({ where: { id: jpgId } });
  eq("T11.3 status=ARCHIVED + archivedAt ไม่ว่าง", [archivedRow.status, !!archivedRow.archivedAt], ["ARCHIVED", true]);
  const restore1 = await att.restoreAttachment(tid, sSystemId, jpgId, owner.id);
  assert("T11.4 กู้คืนสำเร็จ", restore1.ok);
  const restoredRow = await prisma.accountAttachment.findUniqueOrThrow({ where: { id: jpgId } });
  eq("T11.5 กู้คืนแล้ว status=UNLINKED (ไม่ได้ผูกอยู่)", restoredRow.status, "UNLINKED");
  eq("T11.6 กู้คืนแล้วกลับมาอยู่ในรายการ", (await att.listAttachmentsPaged(tid, sSystemId, { tab: "all", pageSize: 100 })).rows.some((r) => r.id === jpgId), true);

  // ═════════ T12 — bulk archive ═════════
  console.log("\nT12 ลบหลายไฟล์พร้อมกัน (bulk):");
  const archiveBulk = await att.archiveAttachmentsBulk(tid, sSystemId, [pngId, pdfId], owner.id);
  eq("T12.1 archiveAttachmentsBulk count=2", archiveBulk.count, 2);
  const rowsAfterBulkArchive = await prisma.accountAttachment.findMany({ where: { id: { in: [pngId, pdfId] } } });
  assert("T12.2 ทั้ง 2 แถวถูกลบนุ่มแล้ว", rowsAfterBulkArchive.every((r) => r.status === "ARCHIVED" && !!r.archivedAt));
  await att.restoreAttachment(tid, sSystemId, pngId, owner.id);
  await att.restoreAttachment(tid, sSystemId, pdfId, owner.id);

  // ═════════ T13 — "ไม่ใช่เอกสารบัญชี" ═════════
  console.log("\nT13 ไม่ใช่เอกสารบัญชี:");
  const na1 = await att.markNotAccounting(tid, sSystemId, pngId, owner.id);
  assert("T13.1 ทำเครื่องหมายสำเร็จ (ยังไม่ผูก)", na1.ok);
  eq("T13.2 status=NOT_ACCOUNTING", (await prisma.accountAttachment.findUniqueOrThrow({ where: { id: pngId } })).status, "NOT_ACCOUNTING");
  await att.linkAttachment(tid, sSystemId, pdfId, expDoc.id, owner.id);
  await rejected("T13.3 ทำเครื่องหมายไฟล์ที่ผูกอยู่ = ปฏิเสธ", () => att.markNotAccounting(tid, sSystemId, pdfId, owner.id), "ผูกกับเอกสารอยู่");

  // ═════════ T14 — guard (assertAccountCan) ═════════
  console.log("\nT14 guard (สิทธิ์ account.document.manage):");
  const authStaff = { user: { id: staff.id }, active: { ...mStaff, tenant: t } } as never;
  const authOwner = { user: { id: owner.id }, active: { ...(await prisma.membership.findFirstOrThrow({ where: { userId: owner.id, tenantId: tid } })), tenant: t } } as never;
  await rejected("T14.1 staff (ไม่มี account.document.manage) ถูกปฏิเสธ", async () => {
    assertAccountCan(authStaff, "account.document.manage");
    return { ok: true };
  });
  let ownerPassed = true;
  try { assertAccountCan(authOwner, "account.document.manage"); } catch { ownerPassed = false; }
  assert("T14.2 owner ผ่าน", ownerPassed);

  // ═════════ T15 — tenant isolation ═════════
  console.log("\nT15 tenant isolation (ร้าน B แตะร้าน A ไม่ได้):");
  await rejected("T15.1 ผูกไฟล์ร้าน A กับเอกสารร้าน B = ปฏิเสธ", () => att.linkAttachment(tid, sSystemId, jpgId, expDoc2.id, owner.id), "ไม่พบเอกสาร");
  const crossSearch = await att.searchDocumentsForAttach(tid, sSystemId, "เอกสารร้าน B" /* คำค้นตรงชื่อผู้ติดต่อร้าน B */);
  eq("T15.2 ค้นหาเอกสารข้ามร้าน ไม่พบอะไรเลย", crossSearch.length, 0);
  const wrongScopeArchive = await att.archiveAttachment(t2.id, sSystemId2, jpgId, owner2.id);
  assert("T15.3 ลบไฟล์ร้าน A ด้วย scope ร้าน B = ปฏิเสธ (ไม่พบไฟล์)", !wrongScopeArchive.ok);
  const stillThere = await prisma.accountAttachment.findUniqueOrThrow({ where: { id: jpgId } });
  assert("T15.4 แถวจริงไม่ถูกแตะต้อง (ยังไม่ archived)", !stillThere.archivedAt);
  const wrongScopeMove = await att.moveAttachment(t2.id, sSystemId2, jpgId, "แอบย้าย");
  assert("T15.5 ย้ายโฟลเดอร์ข้าม scope = ปฏิเสธ", !wrongScopeMove.ok);
} catch (e) {
  bad("CRASH", e instanceof Error ? `${e.message}\n${e.stack?.split("\n").slice(1, 5).join("\n")}` : String(e));
}

// ─────────── ลบร้านทดสอบ ───────────
async function cleanupTenant(id: string | null) {
  if (!id) return;
  const d = async (fn: () => Promise<unknown>) => {
    try { await fn(); } catch { /* best-effort */ }
  };
  await d(() => prisma.accountAttachment.deleteMany({ where: { tenantId: id } }));
  await d(() => prisma.accountDocumentPayment.deleteMany({ where: { tenantId: id } }));
  await d(() => prisma.accountJournalLine.deleteMany({ where: { tenantId: id } }));
  await d(() => prisma.accountJournalEntry.updateMany({ where: { tenantId: id }, data: { reversalOfId: null } }));
  await d(() => prisma.accountJournalEntry.deleteMany({ where: { tenantId: id } }));
  await d(() => prisma.accountDocumentLine.deleteMany({ where: { tenantId: id } }));
  await d(() => prisma.accountDocument.deleteMany({ where: { tenantId: id } }));
  await d(() => prisma.accountContact.deleteMany({ where: { tenantId: id } }));
  for (const m of [
    "accountFinanceOpening", "accountFinanceTransfer", "accountFinance",
    "accountLedger", "accountPeriod", "accountDocSequence", "accountSettings", "accountSystemLink",
    "appNotification", "outboxEvent", "appSystemUnit", "appSystem", "businessUnit", "membership",
  ]) {
    await d(() => (prisma as unknown as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: id } }));
  }
  await d(() => prisma.tenant.delete({ where: { id } }));
}
await cleanupTenant(sTenantId);
await cleanupTenant(sTenantId2);
if (ownerId || staffId || owner2Id) {
  const d = async (fn: () => Promise<unknown>) => { try { await fn(); } catch { /* best-effort */ } };
  await d(() => prisma.user.deleteMany({ where: { id: { in: [ownerId, staffId, owner2Id].filter((x): x is string => !!x) } } }));
}
console.log(`\n🧹 ลบร้านทดสอบแล้ว`);

console.log(`\n===== QC WO 7.1 · คลังเอกสาร V2 สรุป =====`);
console.log(`ผ่าน ${passed} · ตก ${findings.length} (รวม ${passed + findings.length} ข้อ)`);
if (findings.length) {
  console.log("\nพบปัญหา:");
  for (const f of findings) console.log("  - " + f);
}
console.log(`\nJSON_SUMMARY ${JSON.stringify({ total: passed + findings.length, passed, findings })}`);
await prisma.$disconnect();
process.exit(findings.length > 0 ? 1 : 0);
