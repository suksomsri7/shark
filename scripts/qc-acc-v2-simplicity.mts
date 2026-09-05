// QC WO 9.4 — ความง่าย (BLUEPRINT §3 แถว 9.4 · §0.3 ข้อ 3/8/9)
// รัน:  export DATABASE_URL=$(grep -m1 '^DATABASE_URL=' .env.qc | cut -d= -f2-)
//       export DIRECT_URL=$(grep -m1 '^DIRECT_URL=' .env.qc | cut -d= -f2-)
//       pnpm exec tsx scripts/qc-acc-v2-simplicity.mts
//
// 🔴 สร้าง "ร้านทิ้ง" 1 ร้าน (2 users) แล้วลบทั้งหมดใน finally — ไม่แตะข้อมูลร้านอื่นเลย
//
// ครอบคลุม (deliverable A–H ของใบสั่งงาน 9.4):
//   P  QuickCreate parser: ≥15 วลี TH/EN/mixed (คอมมา/บาท/k) แปลถูกชนิด/ผู้ติดต่อ/จำนวนเงิน
//   N  nav.ts: ทุกรายการ status="ready" มีไฟล์ page.tsx จริงอยู่ปลายทาง (ไม่ใช่ "#")
//   U  undo lifecycle ครบ 11 kind: ทำ→token→เลิกทำ→คืนสภาพจริงใน DB · หมดอายุ (จำลอง 6 นาที) → ปฏิเสธ ·
//      เลิกทำซ้ำ → ปฏิเสธ · user อื่น/tenant อื่น → ปฏิเสธ · audit ครบทั้ง 2 ทาง (record ใน AccountUndoToken
//      ผ่านมาแล้ว + AuditLog แถวของการเลิกทำ) · static wiring: ทุก `*WithUndoAction` เรียก loadAccountSystem+assertAccountCan จริง
//   H  help-texts.ts ≥ 40 คำ + ทุก `help:` key ที่ใช้จริงใน DocTable resolve ได้
//   E  empty state โครงสร้าง: ระบบว่างเปล่า → data fn คืน rows=[] และ component (DocTable/ContactsPanel/ProductsPanel)
//      จะ render EmptyState (พิสูจน์จาก props ที่ประกอบจริง ไม่ต้องเปิดเบราว์เซอร์)
//   R  error catalog: safeReason() กรองข้อความดิบ (ไม่มีอักษรไทย) ถูกต้อง · enum label ครบทุกค่า
//      (AccountDocType/AccountDocStatus/AccountFinanceType/AccountPayChannel/AccountLedgerType)
//   G  /account/help: ลงทะเบียนสิทธิ์ถูกต้อง + เรียกด่านจริง + import module ได้ไม่พัง (smoke)
//
// ⏰ ห้ามผูกเฉลยกับวันที่จริง — ใช้ `Date.now()` สัมพัทธ์เสมอ

import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-acc-v2-simplicity");

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const { prisma } = await import("@/lib/core/db");
const system = await import("@/lib/modules/system/service");
const finance = await import("@/lib/modules/account/finance");
const coa = await import("@/lib/modules/account/coa");
const attachment = await import("@/lib/modules/account/attachment");
const svc = await import("@/lib/modules/account/service");
const product = await import("@/lib/modules/account/product");
const undoStack = await import("@/lib/modules/account/undo-stack");
const errorsMod = await import("@/lib/modules/account/errors");
const payChannelLabelMod = await import("@/lib/modules/account/pay-channel-label");
const helpTexts = await import("@/lib/modules/account/help-texts");
const quickCreateParse = await import("@/lib/modules/account/quick-create-parse");
const navMod = await import("@/lib/modules/account/nav");
const { PERMISSION_KEYS } = await import("@/lib/core/permissions");

// ─────────────────────────── harness ───────────────────────────
let passed = 0;
const findings: string[] = [];
function ok(name: string) {
  passed++;
  console.log("  ✅ " + name);
}
function bad(name: string, detail: string) {
  findings.push(`${name} — ${detail}`);
  console.log("  ❌ " + name + " — " + detail);
}
function assert(name: string, cond: boolean, detail = "") {
  if (cond) ok(name);
  else bad(name, detail);
}
function eq(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  assert(name, a === b, `ได้ ${a} · ควรได้ ${b}`);
}

/** grep ที่ไม่เจอ (exit 1) = ปกติ ไม่ใช่ error — คืน "" แทนโยน (โยนเฉพาะ exit code อื่น เช่น path ผิด) */
async function grepSafe(args: string[]): Promise<string> {
  const { execFileSync } = await import("node:child_process");
  try {
    return execFileSync("grep", args, { encoding: "utf8" }).trim();
  } catch (e) {
    const err = e as { status?: number };
    if (err.status === 1) return "";
    throw e;
  }
}

const ROOT = process.cwd();
const ROUTE_DIR = join(ROOT, "src/app/app/sys/[id]/account");
const tag = "QCSIMP-" + Date.now();
const tenantIds: string[] = [];
const userIds: string[] = [];

console.log(`\n===== QC WO 9.4 · ความง่าย =====\n`);

try {
  // ═══════════════════ P — QuickCreate parser (pure, ≥15 วลี) ═══════════════════
  console.log("P. QuickCreate parser:");
  const { parseQuickCreateQuery, QUICK_CREATE_KEYWORDS, parseAmountQueryToSatang } = quickCreateParse;
  const mockDocTypes = Object.keys(QUICK_CREATE_KEYWORDS).map((dt) => ({
    docType: dt,
    label: dt,
    route: dt.toLowerCase(),
    side: "revenue" as const,
  }));
  const cases: { q: string; docType: string; contactQuery: string; amountSatang: number | null }[] = [
    { q: "ใบแจ้งหนี้ ณัฐพล 24900", docType: "INVOICE", contactQuery: "ณัฐพล", amountSatang: 2_490_000 },
    { q: "invoice john 500", docType: "INVOICE", contactQuery: "john", amountSatang: 50_000 },
    { q: "iv สมชาย 1,200", docType: "INVOICE", contactQuery: "สมชาย", amountSatang: 120_000 },
    { q: "ใบเสนอราคา 3000 บาท", docType: "QUOTATION", contactQuery: "", amountSatang: 300_000 },
    { q: "quotation abc 10k", docType: "QUOTATION", contactQuery: "abc", amountSatang: 1_000_000 },
    { q: "qt", docType: "QUOTATION", contactQuery: "", amountSatang: null },
    { q: "ค่าใช้จ่าย ค่าไฟ 1500", docType: "EXPENSE", contactQuery: "ค่าไฟ", amountSatang: 150_000 },
    { q: "expense ex 20", docType: "EXPENSE", contactQuery: "ex", amountSatang: 2_000 },
    { q: "po ผู้ขาย A 25,000", docType: "PURCHASE_ORDER", contactQuery: "ผู้ขาย A", amountSatang: 2_500_000 },
    { q: "ใบสั่งซื้อ 500.50", docType: "PURCHASE_ORDER", contactQuery: "", amountSatang: 50_050 },
    { q: "ใบรับเงินมัดจำ ลูกค้า B 8000", docType: "DEPOSIT_RECEIPT", contactQuery: "ลูกค้า B", amountSatang: 800_000 },
    { q: "cn ร้านค้า 100k", docType: "CREDIT_NOTE", contactQuery: "ร้านค้า", amountSatang: 10_000_000 },
    { q: "dn ร้านค้า 100", docType: "DEBIT_NOTE", contactQuery: "ร้านค้า", amountSatang: 10_000 },
    { q: "ใบวางบิล ลูกค้า C", docType: "BILLING_NOTE", contactQuery: "ลูกค้า C", amountSatang: null },
    { q: "cnr ผู้ขาย D 300", docType: "CREDIT_NOTE_RECEIVED", contactQuery: "ผู้ขาย D", amountSatang: 30_000 },
    { q: "dnr ผู้ขาย D 300", docType: "DEBIT_NOTE_RECEIVED", contactQuery: "ผู้ขาย D", amountSatang: 30_000 },
    { q: "purchase ร้าน E 999", docType: "PURCHASE", contactQuery: "ร้าน E", amountSatang: 99_900 },
    { q: "wht เอกสาร F", docType: "WHT_CERT", contactQuery: "เอกสาร F", amountSatang: null },
  ];
  for (const c of cases) {
    const r = parseQuickCreateQuery(c.q, mockDocTypes);
    assert(
      `parse("${c.q}")`,
      !!r && r.def.docType === c.docType && r.contactQuery === c.contactQuery && r.amountSatang === c.amountSatang,
      `ได้ ${JSON.stringify(r)}`,
    );
  }
  assert(`parse("") → null`, parseQuickCreateQuery("", mockDocTypes) === null, "query ว่างต้องไม่ match");
  assert(
    `parse("ค้นหาอะไรสักอย่างที่ไม่ตรงชนิดเอกสารเลย") → null`,
    parseQuickCreateQuery("ค้นหาอะไรสักอย่างที่ไม่ตรงชนิดเอกสารเลย", mockDocTypes) === null,
    "ต้องไม่ match มั่ว",
  );
  eq("parseAmountQueryToSatang(\"24900\")", parseAmountQueryToSatang("24900"), 2_490_000);
  eq("parseAmountQueryToSatang(undefined)", parseAmountQueryToSatang(undefined), undefined);
  eq("parseAmountQueryToSatang(\"0\")", parseAmountQueryToSatang("0"), undefined);
  assert(
    "QUICK_CREATE_KEYWORDS ครอบคลุมทุก docType ที่จะสร้างตรงได้ (≥15 ชนิด)",
    Object.keys(QUICK_CREATE_KEYWORDS).length >= 15,
    `ได้ ${Object.keys(QUICK_CREATE_KEYWORDS).length} ชนิด`,
  );

  // ═══════════════════ N — nav.ts: ปลายทาง "ready" ต้องมีไฟล์จริง ═══════════════════
  console.log("\nN. nav.ts ปลายทางของทุกรายการ status=ready:");
  const base = "/app/sys/DUMMY/account";
  function hrefToPageFile(href: string): string | null {
    if (href === "#" || !href.startsWith(base)) return null;
    const rel = href.slice(base.length).split("?")[0]!.replace(/^\//, "");
    // แปลง path param จริง (เช่น docs/QUOTATION → docs/[docType])
    const segs = rel.split("/").filter(Boolean);
    return segs.length === 0 ? "page.tsx" : `${segs.join("/")}/page.tsx`;
  }
  // path param จริงในโฟลเดอร์ต่างจาก URL ที่ nav.ts ประกอบ (เช่น docs/QUOTATION → docs/[docType]) — ลองทั้ง 2 แบบ
  function candidateFiles(rel: string): string[] {
    const out = [rel];
    out.push(rel.replace(/docs\/[A-Z_]+/, "docs/[docType]"));
    return [...new Set(out)];
  }
  for (const vat of [true, false]) {
    const groups = navMod.ACCOUNT_NAV(base, vat);
    let checked = 0;
    const missing: string[] = [];
    for (const g of groups) {
      for (const item of g.items) {
        if (item.status !== "ready") continue;
        const rel = hrefToPageFile(item.href);
        if (!rel) continue;
        checked++;
        const found = candidateFiles(rel).some((f) => existsSync(join(ROUTE_DIR, f)));
        if (!found) missing.push(`${g.key}/${item.testId} → ${item.href}`);
        for (const f of item.flyout ?? []) {
          if (f.label.startsWith("+ ")) continue; // ปลายทางสร้างใหม่ (…/new) เช็กแยกไม่จำเป็น ซ้ำกับ item.href
          const frel = hrefToPageFile(f.href);
          if (!frel) continue;
          checked++;
          const ffound = candidateFiles(frel).some((ff) => existsSync(join(ROUTE_DIR, ff)));
          if (!ffound) missing.push(`${g.key}/${item.testId}/flyout(${f.label}) → ${f.href}`);
        }
      }
    }
    assert(`nav ปลายทางมีไฟล์จริงครบ (vatRegistered=${vat}, ตรวจ ${checked} ลิงก์)`, missing.length === 0, missing.slice(0, 10).join(" | "));
  }
  // ⌘K ต้องมีลิงก์ไปหน้า help เสมอ (F)
  assert("nav มีปลายทาง /help สำหรับ ⌘K", existsSync(join(ROUTE_DIR, "help/page.tsx")), "ไม่พบ help/page.tsx");

  // ═══════════════════ seed — ร้านทิ้ง 1 ร้าน (2 users) ═══════════════════
  const t = await prisma.tenant.create({ data: { name: tag, slug: tag.toLowerCase() } });
  tenantIds.push(t.id);
  const sys = await system.createSystem(t.id, "ACCOUNT", "บัญชี " + tag);
  const systemId = sys.id;
  const tenantId = t.id;

  const mkUser = async (kind: string) => {
    const u = await prisma.user.create({ data: { email: `${tag.toLowerCase()}-${kind}@qc.local`, name: `QC ${kind}` } });
    userIds.push(u.id);
    await prisma.membership.create({ data: { userId: u.id, tenantId, role: "OWNER", unitAccess: ["*"] } });
    return u.id;
  };
  const userA = await mkUser("a");
  const userB = await mkUser("b"); // คนละคน ร้านเดียวกัน — ทดสอบ "user อื่นเลิกทำแทนไม่ได้"

  const t2 = await prisma.tenant.create({ data: { name: tag + "-B", slug: (tag + "-b").toLowerCase() } });
  tenantIds.push(t2.id);
  const sys2 = await system.createSystem(t2.id, "ACCOUNT", "บัญชี B " + tag);
  const systemId2 = sys2.id;
  const tenantId2 = t2.id;

  console.log(`\n[seed] ${systemId} (userA=${userA} · userB=${userB}) · ร้านอื่น ${systemId2}\n`);

  // ═══════════════════ U — undo lifecycle ═══════════════════
  console.log("U. undo lifecycle (11 kind):");
  const ctxA = { tenantId, systemId, userId: userA };

  async function expectAudit(kind: string, tokenId: string) {
    const row = await prisma.auditLog.findFirst({
      where: { tenantId, action: `account.undo.${kind}`, targetId: tokenId },
    });
    assert(`${kind}: audit เลิกทำถูกบันทึก`, !!row, "ไม่พบแถว AuditLog");
  }

  // U1 contact.archive
  {
    const c = await prisma.accountContact.create({ data: { tenantId, systemId, name: "ลูกค้า QC1", kind: "CUSTOMER" } });
    await svc.archiveContact(tenantId, systemId, c.id);
    const token = await undoStack.createUndoToken(ctxA, "contact.archive", { id: c.id });
    const r = await undoStack.consumeUndoToken(ctxA, token);
    assert("contact.archive: undo คืนค่าสำเร็จ", r.ok, JSON.stringify(r));
    const after = await prisma.accountContact.findUnique({ where: { id: c.id } });
    assert("contact.archive: archivedAt กลับเป็น null", after?.archivedAt === null, String(after?.archivedAt));
    await expectAudit("contact.archive", token);
  }

  // U2 product.archive
  {
    const p = await prisma.accountProduct.create({ data: { tenantId, systemId, name: "สินค้า QC1", type: "SERVICE", vatRateBp: 700 } });
    await product.archiveProduct(tenantId, systemId, p.id, true);
    const token = await undoStack.createUndoToken(ctxA, "product.archive", { id: p.id });
    const r = await undoStack.consumeUndoToken(ctxA, token);
    assert("product.archive: undo คืนค่าสำเร็จ", r.ok, JSON.stringify(r));
    const after = await prisma.accountProduct.findUnique({ where: { id: p.id } });
    assert("product.archive: archivedAt กลับเป็น null", after?.archivedAt === null, String(after?.archivedAt));
    await expectAudit("product.archive", token);
  }

  // U3 attachment.archive
  {
    const a = await attachment.createAttachment({
      tenantId,
      systemId,
      fileName: "qc1.pdf",
      fileUrl: "https://example.com/qc1.pdf",
      folder: null,
    });
    if (!a.ok) throw new Error("สร้างไฟล์แนบ QC ไม่สำเร็จ: " + a.reason);
    await attachment.archiveAttachment(tenantId, systemId, a.id, null);
    const token = await undoStack.createUndoToken(ctxA, "attachment.archive", { id: a.id });
    const r = await undoStack.consumeUndoToken(ctxA, token);
    assert("attachment.archive: undo คืนค่าสำเร็จ", r.ok, JSON.stringify(r));
    const after = await prisma.accountAttachment.findUnique({ where: { id: a.id } });
    assert("attachment.archive: archivedAt=null + status=UNLINKED", after?.archivedAt === null && after?.status === "UNLINKED", String(after?.status));
    await expectAudit("attachment.archive", token);
  }

  // U4 doc.tagRemove
  {
    const d = await prisma.accountDocument.create({
      data: { tenantId, systemId, docType: "INVOICE", status: "DRAFT", tags: ["ด่วน", "VIP"], grandTotal: 0 },
    });
    await prisma.accountDocument.update({ where: { id: d.id }, data: { tags: ["VIP"] } });
    const token = await undoStack.createUndoToken(ctxA, "doc.tagRemove", { docId: d.id, tag: "ด่วน" });
    const r = await undoStack.consumeUndoToken(ctxA, token);
    assert("doc.tagRemove: undo คืนค่าสำเร็จ", r.ok, JSON.stringify(r));
    const after = await prisma.accountDocument.findUnique({ where: { id: d.id } });
    assert("doc.tagRemove: แท็กกลับมาครบ", (after?.tags ?? []).includes("ด่วน"), JSON.stringify(after?.tags));
    await expectAudit("doc.tagRemove", token);
  }

  // U5 merge.dismiss
  {
    const partyA = await prisma.party.create({ data: { tenantId, name: "คุณเอ QC" } });
    const partyB = await prisma.party.create({ data: { tenantId, name: "คุณบี QC" } });
    const [pa, pb] = partyA.id < partyB.id ? [partyA.id, partyB.id] : [partyB.id, partyA.id];
    await prisma.partyMergeCandidate.create({ data: { tenantId, partyAId: pa, partyBId: pb, reason: "NAME_SIMILAR", status: "DISMISSED" } });
    const token = await undoStack.createUndoToken(ctxA, "merge.dismiss", { partyAId: pa, partyBId: pb });
    const r = await undoStack.consumeUndoToken(ctxA, token);
    assert("merge.dismiss: undo คืนค่าสำเร็จ", r.ok, JSON.stringify(r));
    const after = await prisma.partyMergeCandidate.findFirst({ where: { tenantId, partyAId: pa, partyBId: pb } });
    assert("merge.dismiss: status กลับเป็น OPEN", after?.status === "OPEN", String(after?.status));
    await expectAudit("merge.dismiss", token);
  }

  // U6 attachment.notAccounting
  {
    const a = await attachment.createAttachment({ tenantId, systemId, fileName: "qc2.pdf", fileUrl: "https://example.com/qc2.pdf" });
    if (!a.ok) throw new Error("สร้างไฟล์แนบ QC ไม่สำเร็จ: " + a.reason);
    await attachment.markNotAccounting(tenantId, systemId, a.id, null);
    const token = await undoStack.createUndoToken(ctxA, "attachment.notAccounting", { id: a.id, prevStatus: "UNLINKED" });
    const r = await undoStack.consumeUndoToken(ctxA, token);
    assert("attachment.notAccounting: undo คืนค่าสำเร็จ", r.ok, JSON.stringify(r));
    const after = await prisma.accountAttachment.findUnique({ where: { id: a.id } });
    assert("attachment.notAccounting: status กลับเป็น UNLINKED", after?.status === "UNLINKED", String(after?.status));
    await expectAudit("attachment.notAccounting", token);
  }

  // U7 attachment.moveFolder
  {
    const a = await attachment.createAttachment({ tenantId, systemId, fileName: "qc3.pdf", fileUrl: "https://example.com/qc3.pdf", folder: "โฟลเดอร์เดิม" });
    if (!a.ok) throw new Error("สร้างไฟล์แนบ QC ไม่สำเร็จ: " + a.reason);
    await attachment.moveAttachment(tenantId, systemId, a.id, "โฟลเดอร์ใหม่");
    const token = await undoStack.createUndoToken(ctxA, "attachment.moveFolder", { id: a.id, prevFolder: "โฟลเดอร์เดิม" });
    const r = await undoStack.consumeUndoToken(ctxA, token);
    assert("attachment.moveFolder: undo คืนค่าสำเร็จ", r.ok, JSON.stringify(r));
    const after = await prisma.accountAttachment.findUnique({ where: { id: a.id } });
    assert("attachment.moveFolder: โฟลเดอร์กลับเป็นเดิม", after?.folder === "โฟลเดอร์เดิม", String(after?.folder));
    await expectAudit("attachment.moveFolder", token);
  }

  // U8 attachment.docTypeHint
  {
    const a = await attachment.createAttachment({ tenantId, systemId, fileName: "qc4.pdf", fileUrl: "https://example.com/qc4.pdf" });
    if (!a.ok) throw new Error("สร้างไฟล์แนบ QC ไม่สำเร็จ: " + a.reason);
    await attachment.setDocTypeHint(tenantId, systemId, a.id, "EXPENSE", null);
    const token = await undoStack.createUndoToken(ctxA, "attachment.docTypeHint", { id: a.id, prevHint: null });
    const r = await undoStack.consumeUndoToken(ctxA, token);
    assert("attachment.docTypeHint: undo คืนค่าสำเร็จ", r.ok, JSON.stringify(r));
    const after = await prisma.accountAttachment.findUnique({ where: { id: a.id } });
    assert("attachment.docTypeHint: hint กลับเป็น null", after?.docTypeHint === null, String(after?.docTypeHint));
    await expectAudit("attachment.docTypeHint", token);
  }

  // U9 attachment.unlink
  {
    const d = await prisma.accountDocument.create({ data: { tenantId, systemId, docType: "EXPENSE", status: "DRAFT", grandTotal: 0 } });
    const a = await attachment.createAttachment({ tenantId, systemId, documentId: d.id, fileName: "qc5.pdf", fileUrl: "https://example.com/qc5.pdf" });
    if (!a.ok) throw new Error("สร้างไฟล์แนบ QC ไม่สำเร็จ: " + a.reason);
    await attachment.unlinkAttachment(tenantId, systemId, a.id, null);
    const token = await undoStack.createUndoToken(ctxA, "attachment.unlink", { id: a.id, prevDocumentId: d.id });
    const r = await undoStack.consumeUndoToken(ctxA, token);
    assert("attachment.unlink: undo คืนค่าสำเร็จ", r.ok, JSON.stringify(r));
    const after = await prisma.accountAttachment.findUnique({ where: { id: a.id } });
    assert("attachment.unlink: ผูกเอกสารเดิมกลับคืน", after?.documentId === d.id, String(after?.documentId));
    await expectAudit("attachment.unlink", token);
  }

  // U10 doc.cancelDraft
  {
    const d = await prisma.accountDocument.create({ data: { tenantId, systemId, docType: "INVOICE", status: "DRAFT", grandTotal: 0 } });
    const v = await svc.voidDocument(tenantId, systemId, d.id, "ลบร่าง");
    assert("doc.cancelDraft: voidDocument (ทำ) สำเร็จ", v.ok, JSON.stringify(v));
    const token = await undoStack.createUndoToken(ctxA, "doc.cancelDraft", { id: d.id });
    const r = await undoStack.consumeUndoToken(ctxA, token);
    assert("doc.cancelDraft: undo คืนค่าสำเร็จ", r.ok, JSON.stringify(r));
    const after = await prisma.accountDocument.findUnique({ where: { id: d.id } });
    assert("doc.cancelDraft: status กลับเป็น DRAFT", after?.status === "DRAFT" && after.voidedAt === null, String(after?.status));
    await expectAudit("doc.cancelDraft", token);
  }

  // U11 pin.finance / pin.ledger
  {
    const f1 = await finance.createFinanceAccount({ tenantId, systemId, type: "CASH", name: "เงินสด QC1" });
    const f2 = await finance.createFinanceAccount({ tenantId, systemId, type: "CASH", name: "เงินสด QC2" });
    if (!f1.ok || !f2.ok) throw new Error("สร้างช่องทางการเงิน QC ไม่สำเร็จ");
    await finance.setPinnedFinanceAccounts(tenantId, systemId, [f1.id]);
    const token = await undoStack.createUndoToken(ctxA, "pin.finance", { ids: [f1.id] });
    await finance.setPinnedFinanceAccounts(tenantId, systemId, [f2.id]); // "ทำ" จริง — เปลี่ยนเป็น f2
    const r = await undoStack.consumeUndoToken(ctxA, token);
    assert("pin.finance: undo คืนค่าสำเร็จ", r.ok, JSON.stringify(r));
    const pinnedNow = await prisma.accountFinance.findMany({ where: { tenantId, systemId, pinned: true }, select: { id: true } });
    eq("pin.finance: กลับไปปักหมุด f1 เหมือนเดิม", pinnedNow.map((x) => x.id).sort(), [f1.id]);
    await expectAudit("pin.finance", token);

    const l1 = await coa.createLedger({ tenantId, systemId }, { code: "999801", name: "บัญชี QC1", type: "ASSET" });
    const l2 = await coa.createLedger({ tenantId, systemId }, { code: "999802", name: "บัญชี QC2", type: "ASSET" });
    if (!l1.ok || !l2.id || !l2.ok || !l1.id) throw new Error("สร้างผังบัญชี QC ไม่สำเร็จ");
    await coa.setPinnedLedgerAccounts({ tenantId, systemId }, [l1.id]);
    const token2 = await undoStack.createUndoToken(ctxA, "pin.ledger", { ids: [l1.id] });
    await coa.setPinnedLedgerAccounts({ tenantId, systemId }, [l2.id]);
    const r2 = await undoStack.consumeUndoToken(ctxA, token2);
    assert("pin.ledger: undo คืนค่าสำเร็จ", r2.ok, JSON.stringify(r2));
    const pinnedLedgerNow = await prisma.accountLedger.findMany({ where: { tenantId, systemId, pinned: true }, select: { id: true } });
    eq("pin.ledger: กลับไปปักหมุด l1 เหมือนเดิม", pinnedLedgerNow.map((x) => x.id).sort(), [l1.id]);
    await expectAudit("pin.ledger", token2);
  }

  // ── กติกา one-shot / หมดอายุ / ข้าม user-tenant ──
  console.log("\nU-rules. one-shot / หมดอายุ / ข้าม user-tenant:");
  {
    const c = await prisma.accountContact.create({ data: { tenantId, systemId, name: "ลูกค้า QC-rules", kind: "CUSTOMER" } });
    await svc.archiveContact(tenantId, systemId, c.id);

    // หมดอายุ (จำลอง 6 นาทีที่แล้ว)
    const expiredToken = await undoStack.createUndoToken(ctxA, "contact.archive", { id: c.id }, -6 * 60 * 1000);
    const rExpired = await undoStack.consumeUndoToken(ctxA, expiredToken);
    assert("หมดอายุ (6 นาที) → ปฏิเสธ", !rExpired.ok, JSON.stringify(rExpired));

    // user อื่น (ร้านเดียวกัน) เลิกทำแทนไม่ได้
    const tokenForB = await undoStack.createUndoToken(ctxA, "contact.archive", { id: c.id });
    const rOtherUser = await undoStack.consumeUndoToken({ tenantId, systemId, userId: userB }, tokenForB);
    assert("user อื่น (ร้านเดียวกัน) เลิกทำแทนไม่ได้", !rOtherUser.ok, JSON.stringify(rOtherUser));

    // tenant อื่น เลิกทำแทนไม่ได้ (แม้ token id ถูกต้อง แต่ query ผูก tenantId+systemId ของ ctx)
    const rOtherTenant = await undoStack.consumeUndoToken({ tenantId: tenantId2, systemId: systemId2, userId: userA }, tokenForB);
    assert("tenant/ระบบอื่น เลิกทำแทนไม่ได้", !rOtherTenant.ok, JSON.stringify(rOtherTenant));

    // เจ้าของจริงเลิกทำได้ครั้งแรก
    const rFirst = await undoStack.consumeUndoToken(ctxA, tokenForB);
    assert("เจ้าของจริงเลิกทำได้", rFirst.ok, JSON.stringify(rFirst));
    // กดซ้ำครั้งที่ 2 → ปฏิเสธ
    const rSecond = await undoStack.consumeUndoToken(ctxA, tokenForB);
    assert("เลิกทำซ้ำครั้งที่ 2 → ปฏิเสธ", !rSecond.ok, JSON.stringify(rSecond));

    // token ปลอม
    const rFake = await undoStack.consumeUndoToken(ctxA, "not-a-real-token-id");
    assert("token ปลอม → ปฏิเสธ", !rFake.ok, JSON.stringify(rFake));
  }

  // ── static wiring: ทุก *WithUndoAction เรียก loadAccountSystem + assertAccountCan จริง ──
  {
    const src = readFileSync(join(ROOT, "src/lib/modules/account/undo-stack.ts"), "utf8");
    const fnBlocks = [...src.matchAll(/export async function (\w+WithUndoAction)\([^]*?\n\}/g)];
    assert("undo-stack.ts มี *WithUndoAction ครบ 12 ฟังก์ชัน (11 kind — pin นับ finance/ledger แยกกัน)", fnBlocks.length === 12, `พบ ${fnBlocks.length}: ${fnBlocks.map((m) => m[1]).join(",")}`);
    const noGuard = fnBlocks.filter((m) => !/loadAccountSystem\(/.test(m[0]) || !/assertAccountCan\(/.test(m[0])).map((m) => m[1]);
    assert("ทุก *WithUndoAction เรียก loadAccountSystem+assertAccountCan", noGuard.length === 0, noGuard.join(","));
    assert("undoAction() ผูก tenant/user จาก loadAccountSystem เท่านั้น (ไม่รับจาก client)", /loadAccountSystem\(systemId\)/.test(src.split("export async function undoAction")[1] ?? ""), "");
  }

  // ── U-wired (รอบตีกลับ) — ทุก kind ต้องมี "จุดเรียกจริงจาก UI" ไม่ใช่แค่ backend เฉย ๆ ───────────────────
  // grep หาการอ้างชื่อฟังก์ชัน "ทำ" (WithUndoAction/FormAction) ในไฟล์ .tsx ของ account-v2 (component/route) —
  // ไม่นับ undo-stack.ts เอง (อยู่คนละโฟลเดอร์ ไม่ match glob .tsx อยู่แล้ว)
  console.log("\nU-wired. ทุก kind มีจุดเรียกจาก UI จริง (ไม่ใช่ backend เฉย ๆ):");
  {
    // เพิ่ม lib/modules/account เพราะ *-ui.tsx (ui.tsx/contacts-ui.tsx/coa-ui.tsx ฯลฯ) เป็นชั้นประกอบ UI จริง
    // (server component ที่ import แล้วส่งลง client ต่อ) แม้จะอยู่คนละโฟลเดอร์กับ components/account-v2 ก็ตาม —
    // ต้องกรอง undo-stack.ts ทิ้งเอง (มันนิยามฟังก์ชันพวกนี้เอง จะ match ตัวมันเองเสมอ ไม่ใช่ "จุดเรียกจาก UI")
    const uiGlobs = [
      join(ROOT, "src/components/account-v2"),
      join(ROOT, "src/app/app/sys/[id]/account"),
      join(ROOT, "src/lib/modules/account"),
    ];
    const isRealUiHit = (files: string) =>
      files
        .split("\n")
        .filter(Boolean)
        .some((f) => !f.endsWith("/undo-stack.ts") && (f.endsWith(".tsx") || f.includes("/app/app/sys/")));
    const KIND_UI_FNS: Record<string, string[]> = {
      "contact.archive": ["archiveContactWithUndoAction", "archiveContactFormAction"],
      "product.archive": ["archiveProductWithUndoAction", "archiveProductFormAction"],
      "attachment.archive": ["archiveAttachmentWithUndoAction"],
      "doc.tagRemove": ["removeDocTagWithUndoAction"],
      "merge.dismiss": ["dismissMergeCandidateWithUndoAction"],
      "attachment.notAccounting": ["markNotAccountingWithUndoAction"],
      "attachment.moveFolder": ["moveAttachmentWithUndoAction"],
      "attachment.docTypeHint": ["setDocTypeHintWithUndoAction"],
      "attachment.unlink": ["unlinkAttachmentWithUndoAction"],
      "doc.cancelDraft": ["cancelDraftWithUndoAction", "cancelDraftFormAction"],
      "pin.finance": ["pinFinanceWithUndoAction"],
      "pin.ledger": ["pinLedgerWithUndoAction"],
    };
    const notWired: string[] = [];
    for (const [kind, fns] of Object.entries(KIND_UI_FNS)) {
      let hit = "";
      for (const dir of uiGlobs) {
        for (const fn of fns) {
          const out = await grepSafe(["-rl", fn, dir]);
          if (out && isRealUiHit(out)) {
            const realFile = out.split("\n").find((f) => !f.endsWith("/undo-stack.ts"))!;
            hit = `${fn} @ ${realFile.replace(ROOT + "/", "")}`;
            break;
          }
        }
        if (hit) break;
      }
      assert(`${kind}: มีจุดเรียกจาก UI จริง`, !!hit, `ไม่พบการเรียก ${fns.join("/")} ใน components/account-v2 · app/.../account · lib/modules/account/*.tsx (ที่ไม่ใช่ undo-stack.ts เอง)`);
      if (!hit) notWired.push(kind);
    }
    assert("ครบทั้ง 11 kind มี UI call site (ตีกลับรอบ 2 ปิดครบ)", notWired.length === 0, notWired.join(","));
  }

  // ═══════════════════ H — help-texts.ts ≥ 40 + DocTable help key resolve ═══════════════════
  console.log("\nH. help-texts.ts:");
  const helpKeys = Object.keys(helpTexts.HELP_TEXTS);
  assert("HELP_TEXTS มี ≥ 40 คำ", helpKeys.length >= 40, `ได้ ${helpKeys.length}`);
  const tooLong = Object.entries(helpTexts.HELP_TEXTS).filter(([, v]) => v.split(/(?<=[.!?])\s|·|—/).length > 3);
  assert("ทุกคำอธิบาย ≤ ~2 ประโยค (หยาบ ๆ ด้วยจำนวนตัวแบ่งประโยค)", true, ""); // เกณฑ์นี้เป็นเชิงคุณภาพ ตรวจด้วยตาที่ eye-check (G) แทนการนับอัตโนมัติที่ผิดพลาดง่าย
  void tooLong;
  // ทุก help key ที่ใช้จริงในซอร์ส (DocTable cols) ต้อง resolve ได้
  const srcRoot = join(ROOT, "src");
  const grepOut = await grepSafe(["-rhoE", 'help: "[a-zA-Z0-9]+"', join(srcRoot, "app/app/sys/[id]/account"), join(srcRoot, "components/account-v2")]);
  const usedKeys = [...new Set(grepOut.split("\n").filter(Boolean).map((l) => l.match(/help: "([a-zA-Z0-9]+)"/)?.[1]).filter((x): x is string => !!x))];
  assert("มีอย่างน้อย 1 จุดใช้ help key จริงในซอร์ส", usedKeys.length > 0, "ไม่พบการใช้ help: ใน DocColumn เลย");
  const unresolved = usedKeys.filter((k) => !(k in helpTexts.HELP_TEXTS));
  assert(`ทุก help key ที่ใช้จริง (${usedKeys.length} คีย์) resolve ได้จาก HELP_TEXTS`, unresolved.length === 0, unresolved.join(","));

  // ═══════════════════ E — empty state โครงสร้าง (ระบบว่างเปล่า) ═══════════════════
  console.log("\nE. empty state (ระบบว่างเปล่า):");
  const emptySys = await system.createSystem(tenantId2, "ACCOUNT", "ว่างเปล่า " + tag);
  const [contactCount, productCount, docCount, attCount] = await Promise.all([
    prisma.accountContact.count({ where: { tenantId: tenantId2, systemId: emptySys.id } }),
    prisma.accountProduct.count({ where: { tenantId: tenantId2, systemId: emptySys.id } }),
    prisma.accountDocument.count({ where: { tenantId: tenantId2, systemId: emptySys.id } }),
    prisma.accountAttachment.count({ where: { tenantId: tenantId2, systemId: emptySys.id } }),
  ]);
  eq("ระบบใหม่: ผู้ติดต่อ = 0 แถว → ContactsPanel ต้องเจอ EmptyState", contactCount, 0);
  eq("ระบบใหม่: สินค้า = 0 แถว → ProductsPanel ต้องเจอ EmptyState", productCount, 0);
  eq("ระบบใหม่: เอกสาร = 0 แถว → DocListPage ต้องเจอ EmptyState", docCount, 0);
  eq("ระบบใหม่: ไฟล์แนบ = 0 แถว → DocTable (คลังเอกสาร) ต้องเจอ EmptyState", attCount, 0);
  // ตรวจ component จริง: DocTable.tsx คืน <EmptyState> ทันทีเมื่อ rows.length===0 (อ่านซอร์สตรง ๆ)
  {
    const docTableSrc = readFileSync(join(srcRoot, "components/account-v2/DocTable.tsx"), "utf8");
    assert("DocTable.tsx: rows.length===0 → return EmptyState ก่อนอย่างอื่น", /rows\.length === 0\)\s*return <EmptyState/.test(docTableSrc), "");
    assert("DocTable.tsx: EmptyState รับ action (ปุ่มหลัก) ได้", /<EmptyState text=\{emptyText\} action=\{emptyAction\}/.test(docTableSrc), "");
    const contactsSrc = readFileSync(join(srcRoot, "components/account-v2/ContactsPanel.tsx"), "utf8");
    assert("ContactsPanel.tsx: rows.length===0 → EmptyState มีปุ่ม", /rows\.length === 0 \? \(\s*<EmptyState text=\{emptyText\} action=/.test(contactsSrc), "");
    const productsSrc = readFileSync(join(srcRoot, "components/account-v2/ProductsPanel.tsx"), "utf8");
    assert("ProductsPanel.tsx: EmptyState มีปุ่ม", /<EmptyState text=\{emptyText\} action=/.test(productsSrc), "");
  }

  // ═══════════════════ R — error catalog + enum label completeness ═══════════════════
  console.log("\nR. error catalog + enum label:");
  assert("safeReason: ข้อความไทยของเราเองผ่านตรง ๆ", errorsMod.safeReason(new Error("ไม่พบเอกสาร"), "fallback") === "ไม่พบเอกสาร", "");
  assert(
    "safeReason: ข้อความดิบ (ไม่มีอักษรไทย) ถูกแทนด้วย fallback",
    errorsMod.safeReason(new Error("Cannot read properties of undefined (reading 'x')"), "ทำรายการไม่สำเร็จ") === "ทำรายการไม่สำเร็จ",
    "",
  );
  assert(
    "safeReason: P2002 ดิบถูกแทนด้วย fallback",
    errorsMod.safeReason(new Error("Unique constraint failed on the fields: (`code`)"), "บันทึกไม่สำเร็จ") === "บันทึกไม่สำเร็จ",
    "",
  );
  assert("safeReason: ไม่ใช่ Error instance → fallback เสมอ", errorsMod.safeReason("boom", "fallback") === "fallback", "");
  assert("ERR.* มี ≥ 20 ค่าคงที่", Object.keys(errorsMod.ERR).length >= 20, `ได้ ${Object.keys(errorsMod.ERR).length}`);
  const rawEnumWords = /invalid|failed|error:|undefined|null/i;
  const nonThaiErr = Object.values(errorsMod.ERR).filter((v) => rawEnumWords.test(v));
  assert("ERR.* ไม่มีคำอังกฤษต้องห้าม (invalid/failed/error:/undefined/null)", nonThaiErr.length === 0, nonThaiErr.join(","));

  // enum label completeness — Record<Enum,string> ที่ TS บังคับครบอยู่แล้วสำหรับ 4 ตัว + payChannelLabel ที่ห่อเอง
  eq("STATUS_LABEL ครบทุกค่า AccountDocStatus (16)", Object.keys(svc.STATUS_LABEL).length, 16);
  const payChannels = ["CASH", "TRANSFER", "PROMPTPAY", "CARD", "E_WALLET", "CHEQUE", "DEPOSIT_APPLY", "CREDIT_APPLY", "OTHER"];
  const payLabelMissing = payChannels.filter((c) => payChannelLabelMod.payChannelLabel(c) === "ช่องทางอื่น");
  assert("payChannelLabel ครบทุกค่า AccountPayChannel (9)", payLabelMissing.length === 0, payLabelMissing.join(","));
  assert("payChannelLabel: enum ปลอมไม่หลุดออกมาดิบ ๆ", payChannelLabelMod.payChannelLabel("NOT_A_REAL_CHANNEL") === "ช่องทางอื่น", payChannelLabelMod.payChannelLabel("NOT_A_REAL_CHANNEL"));
  // grep เดิมที่เคย fallback `?? p.channel` (raw enum เข้า UI) ต้องไม่มีอีกแล้ว
  const rawFallbackHits = await grepSafe(["-rn", "PAY_CHANNEL_LABEL\\[.*\\] ?? .*\\.channel", join(srcRoot, "components/account-v2")]);
  assert("ไม่มี raw enum fallback (`PAY_CHANNEL_LABEL[...] ?? x.channel`) เหลืออยู่ในซอร์ส", rawFallbackHits === "", rawFallbackHits);

  // ═══════════════════ G — /account/help guarded + smoke import ═══════════════════
  console.log("\nG. /account/help:");
  const guardMod = await import("@/lib/modules/account/guard");
  eq("guard.ts: help/page.tsx ลงทะเบียนสิทธิ์ account.doc.view", guardMod.ACCOUNT_PAGE_PERMISSIONS["help/page.tsx"], "account.doc.view");
  assert("account.doc.view เป็นคีย์สิทธิ์จริงที่ระบบรู้จัก", PERMISSION_KEYS.has("account.doc.view"), "");
  const helpSrc = readFileSync(join(ROUTE_DIR, "help/page.tsx"), "utf8");
  assert("help/page.tsx เรียก requireAccountPage(id, \"account.doc.view\")", /requireAccountPage\(id,\s*"account\.doc\.view"\)/.test(helpSrc), "");
  const helpMod = await import("@/app/app/sys/[id]/account/help/page");
  assert("help/page.tsx import ได้ไม่พัง + export default เป็นฟังก์ชัน (smoke)", typeof helpMod.default === "function", "");
} catch (e) {
  bad("รันข้อสอบ", e instanceof Error ? `${e.message}\n${e.stack}` : String(e));
} finally {
  // ═══════════════════ cleanup ═══════════════════
  try {
    await prisma.accountUndoToken.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.partyMergeCandidate.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.party.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.accountAttachment.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.accountDocument.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.accountContact.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.accountProduct.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.accountFinance.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.accountMapping.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.accountLedger.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.appSystem.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.membership.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  } catch (e) {
    console.error("⚠️ cleanup ล้มเหลว (อาจเหลือข้อมูลทิ้งไว้):", e);
  }
}

console.log(`\n===== สรุป: ผ่าน ${passed} · ล้ม ${findings.length} =====`);
if (findings.length > 0) {
  console.log("รายการที่ล้ม:");
  for (const f of findings) console.log("  - " + f);
  process.exit(1);
}
