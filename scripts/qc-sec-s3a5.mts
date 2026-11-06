// QC — SECRETARY S3a.5 ส่วน A · ลิงก์สาธารณะใบเสนอราคา (`/doc/<token>`) + ออกเอกสารตอนส่ง chat.send kind=quote
// สัญญา: ledger/secretary-briefs/sec-brief-S3a.5.md (ส่วน A เท่านั้น) · docs/modules/31-secretary.md §1.5 · docs/api/SECRETARY-API.md (approve)
//   Q1 token: QUOTATION ออกแล้ว ⇒ token idempotent · DRAFT ⇒ reason ไทย · RECEIPT ⇒ ไม่ใช่ชนิดของลิงก์นี้ · ensurePublicTaxInvoiceLink เดิมยังทำงาน
//   Q2 chat.send quote บน DRAFT ⇒ ออกเอกสาร (AWAITING_ACCEPT + docNo) + ข้อความมีเลขที่/ยอด/ลิงก์ /doc/ · ผู้กดไม่มีสิทธิ์ออก ⇒ ไทย + PENDING · ออกแล้ว ⇒ ไม่ออกซ้ำ
//   Q3 GET /doc/<token> (route handler จริง): 200 + เลขที่/ยอด/ชื่อร้าน · token ผิด 404 · ร้านปิดลิงก์ 404 · เกินเพดาน 429 · noindex/no-referrer/no-store
//   Q4 GET /doc/<token>/pdf (ส่วน B) ⇒ 200 application/pdf · %PDF · attachment <docNo>.pdf (+RFC 5987) · ≤ 300 KB · ข้อความมีเลขที่ (pdftotext ถ้ามี) · token ผิด 404
//   Q5 หน้าไม่มีเลขผู้เสียภาษี/เบอร์เต็มของลูกค้า (ปิดเหลือ 4 หลัก)
//   Q6 (รอบ 2 · R-Z62) ใบชนิดอื่น ⇒ ปฏิเสธไม่ออก · documentId ห้องอื่น ⇒ ปฏิเสธ · summary "แนบใบเสนอราคา … ของ …" · ร้านปิดลิงก์ ⇒ ไม่มี "ดูใบ" ·
//      CANCELLED/REJECTED ⇒ 404 + ปฏิเสธ · ส่งล้มหลังออกใบ ⇒ note + บันทึกการกระทำ · XSS ยิงหน้าจริง · ปิดเบอร์หลายรูปแบบ · (Q4) ยอด PDF = HTML · ตัดบรรทัดไทยไม่มีขีด
// รัน: bash scripts/iso.sh bash scripts/qc-sec.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 SHARK_AI_MOCK=1 pnpm exec tsx scripts/qc-sec-s3a5.mts
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "qc-sec-s3a5";
const FORCED = process.env.QC_FORCE === "1";
const SEC_HOST = "ep-calm-flower-aosbmxhm";
const STARTED = existsSync(join(ROOT, "src/app/(store)/doc/[token]/route.ts"));
if (!FORCED && !STARTED) {
  console.log(`⏭️  ${LABEL}: ยังไม่มี src/app/(store)/doc/[token]/route.ts (ใบยังไม่เริ่ม) และไม่ได้ตั้ง QC_FORCE=1 — SKIP`);
  console.log("JSON_SUMMARY " + JSON.stringify({ total: 0, passed: 0, failed: [], skipped: ["ALL"], reason: "not-started" }));
  process.exit(0);
}
{
  const hostOf = (u: string) => { try { return new URL(u).hostname.toLowerCase(); } catch { return ""; } };
  for (const n of ["DATABASE_URL", "DIRECT_URL"] as const) { const u = process.env[n] ?? ""; if (!u || !hostOf(u).startsWith(SEC_HOST)) { console.error(`🔴 ${LABEL}: ${n} ไม่ใช่ฐาน QC เลขา — รันผ่าน scripts/qc-sec.sh`); process.exit(4); } }
  if (process.env.SEC_QC_HOST !== SEC_HOST || process.env.APP_ENV === "production") { console.error(`🔴 ${LABEL}: SEC_QC_HOST/APP_ENV ไม่ถูก — หยุด`); process.exit(4); }
}
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv(LABEL);
process.env.SHARK_AI_MOCK = "1";
type Res = "PASS" | "FAIL";
const cks: { id: string; res: Res; why: string }[] = [];
const chk = (id: string, name: string, ok: boolean, detail = "") => { cks.push({ id, res: ok ? "PASS" : "FAIL", why: detail }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${!ok && detail ? ` — ${detail}` : ""}`); };
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200);
const thai = (s: unknown) => typeof s === "string" && /[฀-๿]/.test(s);
type AnyMod = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Handler = (r: Request, c: { params: Promise<Record<string, string>> }) => Promise<Response>;

const { prisma } = await import("@/lib/core/db");
const proposals = (await import("@/lib/ai/proposals")) as AnyMod;
const rooms = (await import("@/lib/ai/secretary/rooms")) as AnyMod;
const sys = (await import("@/lib/modules/system/service")) as AnyMod;
const acc = (await import("@/lib/modules/account/service")) as AnyMod;
const docSettings = (await import("@/lib/modules/account/doc-settings")) as AnyMod;
const gl = (await import("@/lib/modules/account/gl")) as AnyMod;
const docRoute = (await import("@/app/(store)/doc/[token]/route")) as unknown as Record<string, Handler>;
const pdfRoute = (await import("@/app/(store)/doc/[token]/pdf/route")) as unknown as Record<string, Handler>;

const STAMP = Date.now().toString(36);
const SLUG = `qc-sec-s3a5-${STAMP}`;
const U = { owner: `qcs3a5-owner-${STAMP}`, staff: `qcs3a5-staff-${STAMP}` };
const IP_BASE = `10.35.${Math.floor(Math.random() * 200)}`;
let tid = "";

async function wipeTenant(): Promise<number> {
  if (!tid) return 0;
  const s = (await prisma.$queryRawUnsafe(`SELECT slug FROM "Tenant" WHERE id = $1`, tid)) as AnyMod[];
  if (s.length && s[0].slug !== SLUG) throw new Error("slug ไม่ตรง — ไม่ลบ");
  const tables = ((await prisma.$queryRawUnsafe(
    `SELECT c.table_name AS t FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
     WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE' ORDER BY 1`,
  )) as AnyMod[]).map((r) => String(r.t));
  await prisma.$executeRawUnsafe(`UPDATE "AccountJournalEntry" SET "reversalOfId" = NULL WHERE "tenantId" = $1`, tid).catch(() => 0);
  let pending = [...tables];
  for (let pass = 0; pass < 10 && pending.length; pass++) {
    const next: string[] = [];
    for (const tb of pending) { try { await prisma.$executeRawUnsafe(`DELETE FROM "${tb}" WHERE "tenantId" = $1`, tid); } catch { next.push(tb); } }
    pending = next;
  }
  await prisma.$executeRawUnsafe(`DELETE FROM "Tenant" WHERE id = $1 AND slug = $2`, tid, SLUG).catch(() => 0);
  let left = 0;
  for (const tb of tables) { try { left += Number(((await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${tb}" WHERE "tenantId" = $1`, tid)) as AnyMod[])[0]?.n ?? 0); } catch { /* */ } }
  left += Number(((await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "Tenant" WHERE id = $1`, tid)) as AnyMod[])[0]?.n ?? 0);
  return left;
}
const tokensMade: string[] = [];
async function cleanup(): Promise<number> {
  let left = 0;
  try { left = await wipeTenant(); } catch (e) { console.log(`  ⚠️ wipe: ${errMsg(e)}`); left = -1; }
  for (const m of ["session", "aiSecretary", "aiNotifyPref", "pushDevice"]) { try { await (prisma as AnyMod)[m].deleteMany({ where: { userId: { in: Object.values(U) } } }); } catch { /* */ } }
  try { await prisma.user.deleteMany({ where: { id: { in: Object.values(U) } } }); } catch { /* */ }
  // ถังเพดานอัตราของรอบนี้ (ต่อ IP ทดสอบ · ต่อ token ที่สร้าง/ยิง)
  try { await prisma.chatRateBucket.deleteMany({ where: { OR: [{ key: { contains: IP_BASE } }, { key: { contains: STAMP } }, ...tokensMade.map((t) => ({ key: { contains: t } }))] } }); } catch { /* */ }
  try { await prisma.tenant.deleteMany({ where: { slug: { startsWith: "qc-sec-s3a5-" }, createdAt: { lt: new Date(Date.now() - 3_600_000) } } }); } catch { /* */ }
  left += await prisma.user.count({ where: { id: { in: Object.values(U) } } });
  return left;
}

const OWNER_M = { role: "OWNER", unitAccess: ["*"], permissions: {} };
const STAFF_PERM = { "ai.chat.send": true, "chat.conversation.read": true, "chat.message.send": true };
const STAFF_M = { role: "STAFF", unitAccess: ["*"], permissions: STAFF_PERM };
const actor = () => ({ kind: "member" as const, tenantId: tid, userId: U.owner, membership: OWNER_M });
let ipN = 0;
const get = async (h: Record<string, Handler>, token: string, ip = `${IP_BASE}.${(ipN++ % 250) + 1}`) => {
  tokensMade.push(token);
  const res = await h.GET!(new Request(`http://qc.local/doc/${token}`, { headers: { "x-forwarded-for": ip } }), { params: Promise.resolve({ token }) });
  return { status: res.status, text: await res.text(), h: res.headers };
};

let residue = 0;
try {
  const t = await prisma.tenant.create({ data: { name: "QC SEC S3a.5", slug: SLUG } }); tid = t.id;
  await prisma.user.create({ data: { id: U.owner, email: `${U.owner}@example.com`, name: "คุณเจ้าของ" } });
  await prisma.user.create({ data: { id: U.staff, email: `${U.staff}@example.com`, name: "น้องขาย" } });
  await prisma.membership.create({ data: { tenantId: tid, userId: U.owner, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } as never });
  await prisma.membership.create({ data: { tenantId: tid, userId: U.staff, role: "STAFF", unitAccess: ["*"], permissions: STAFF_PERM, acceptedAt: new Date() } as never });
  const unit = await prisma.businessUnit.create({ data: { tenantId: tid, type: "SHOP", name: "สาขาหลัก", slug: `s3a5-${STAMP}` } as never });
  const accSys = await sys.createSystem(tid, "ACCOUNT", "บัญชี");
  const chatSys = await sys.createSystem(tid, "CHAT", "แชทลูกค้า");
  const memSys = await sys.createSystem(tid, "MEMBER", "สมาชิก");
  const A = accSys.id as string;
  await acc.saveSettings(tid, A, { orgName: "ร้านกาแฟสุขใจ QC", taxId: "0105561000099", address: "99/1 ถนนสุขุมวิท", phone: "021234567", vatRegistered: true, vatRateBp: 700, taxPointBasis: "ON_ISSUE" });
  await gl.ensureAccounting({ tenantId: tid, systemId: A });
  for (const m of ["chat", "account"]) await (prisma as AnyMod).aiSystemAccess.upsert({ where: { tenantId_module: { tenantId: tid, module: m } }, create: { tenantId: tid, module: m, level: "DRAFT", setById: U.owner }, update: { level: "DRAFT" } });
  const BUYER_TAX = "0105561000013", BUYER_PHONE = "081-234-5678";
  const contact = await acc.createContact({ tenantId: tid, systemId: A, kind: "CUSTOMER", name: "คุณสมชาย ใจดี", taxId: BUYER_TAX, address: `12 ซอยสุข โทร ${BUYER_PHONE}`, phone: BUYER_PHONE });
  const mkQuote = async (n: number) => {
    const d = await acc.createDocument({ tenantId: tid, systemId: A, docType: "QUOTATION", contactId: contact.id, lines: [{ description: `เครื่องชงกาแฟ ${n}`, qty: 2, unitPrice: 450000 }] });
    return String(d?.id ?? "");
  };
  const docRow = (id: string) => prisma.accountDocument.findFirst({ where: { id, tenantId: tid }, select: { id: true, status: true, docNo: true, grandTotal: true, publicToken: true } });
  const cust = await prisma.customer.create({ data: { tenantId: tid, memberSystemId: memSys.id, memberCode: "QCS5A1", name: "คุณสมชาย ใจดี" } as never });
  const cContact = await prisma.chatContact.create({ data: { tenantId: tid, systemId: chatSys.id, channel: "WEBCHAT", externalUserId: `qcs3a5-web-${STAMP}`, displayName: "คุณสมชาย", customerId: cust.id } as never });
  const cconv = await prisma.chatConversation.create({ data: { tenantId: tid, systemId: chatSys.id, channel: "WEBCHAT", contactId: cContact.id, status: "OPEN", unitId: unit.id, lastMessageAt: new Date(), firstCustomerMessageAt: new Date(), staffUnreadCount: 1 } as never });
  await prisma.chatMessage.create({ data: { tenantId: tid, systemId: chatSys.id, conversationId: cconv.id, direction: "IN", type: "TEXT", body: "ขอใบเสนอราคาหน่อยครับ" } as never });
  const quoteProposal = (conversationId: string, documentId?: string) => prisma.aiProposal.create({ data: { tenantId: tid, conversationId, kind: "chat.send", risk: "NORMAL", summary: "ส่งใบเสนอราคาถึงลูกค้า", payload: { systemId: chatSys.id, conversationId: cconv.id, contactId: cContact.id, body: "เรียนคุณสมชาย ส่งใบเสนอราคาตามที่ขอครับ", kind: "quote", ...(documentId ? { refs: { documentId } } : {}) }, status: "PENDING", expiresAt: new Date(Date.now() + 3_600_000) } as never });
  const linkDocToRoom = async (room: AnyMod, docId: string) => {
    const p = await prisma.aiProposal.create({ data: { tenantId: tid, conversationId: room.conversationId, kind: "account.documents.create", risk: "NORMAL", summary: "สร้างใบเสนอราคา", payload: {}, status: "EXECUTED", executedAt: new Date(), expiresAt: new Date(Date.now() + 3_600_000) } as never });
    await prisma.aiActionLog.create({ data: { tenantId: tid, roomId: room.roomId, userId: U.owner, approverId: U.owner, module: "account", kind: "account.documents.create", summary: "สร้างใบเสนอราคา", payload: {}, proposalId: p.id, entityType: "account.document", entityId: docId } as never });
  };
  const outFor = (proposalId: string) => prisma.chatMessage.findFirst({ where: { tenantId: tid, conversationId: cconv.id, direction: "OUT", clientMessageId: { contains: proposalId } } as never, select: { body: true } });

  // ───────── Q1 ─────────
  console.log("── Q1: ensurePublicDocumentLink ──");
  let issuedToken = "";
  let Q2DOC = "";
  let issuedQuote = "";
  {
    const qDraft = await mkQuote(1);
    const d1 = await acc.ensurePublicDocumentLink(tid, A, qDraft);
    chk("Q1-1", "ใบเสนอราคา DRAFT ⇒ ok:false · reason ไทย (ต้องออกเอกสารก่อน) · ไม่มี token", d1?.ok === false && thai(d1?.reason) && !(await docRow(qDraft))?.publicToken, JSON.stringify(d1));
    const iss = await acc.issueDocument(tid, A, qDraft);
    const t1 = await acc.ensurePublicDocumentLink(tid, A, qDraft);
    const t2 = await acc.ensurePublicDocumentLink(tid, A, qDraft);
    const row = await docRow(qDraft);
    issuedToken = t1?.ok ? String(t1.token) : ""; issuedQuote = qDraft;
    chk("Q1-2", "ออกแล้ว (AWAITING_ACCEPT) ⇒ token · เรียกซ้ำได้ token เดิม · ตรงกับ publicToken ในฐาน · ยาว ≥ 24", iss?.ok === true && row?.status === "AWAITING_ACCEPT" && t1?.ok === true && t2?.ok === true && t1.token === t2.token && row?.publicToken === t1.token && String(t1.token).length >= 24, JSON.stringify({ iss, t1, t2, st: row?.status }).slice(0, 240));
    const rcp = await prisma.accountDocument.create({ data: { tenantId: tid, systemId: A, docType: "RECEIPT", status: "PAID", docNo: `RC-S5-${STAMP}`, grandTotal: 10700 } as never });
    const r1 = await acc.ensurePublicDocumentLink(tid, A, rcp.id);
    const r2 = await acc.ensurePublicTaxInvoiceLink(tid, A, rcp.id);
    if (r2?.ok) tokensMade.push(String(r2.token));
    chk("Q1-3", "RECEIPT ⇒ ensurePublicDocumentLink ปฏิเสธ (ไทย) · ensurePublicTaxInvoiceLink เดิมยังให้ token (/r/ ไม่เปลี่ยน)", r1?.ok === false && thai(r1?.reason) && r2?.ok === true && typeof r2.token === "string", JSON.stringify({ r1, r2 }).slice(0, 200));
    const other = await acc.ensurePublicDocumentLink(tid, "nosuch-system", qDraft);
    chk("Q1-4", "เล่มอื่น/ร้านอื่นหาใบไม่เจอ ⇒ ok:false ไม่พบเอกสาร", other?.ok === false && thai(other?.reason), JSON.stringify(other));
  }

  // ───────── Q2 ─────────
  console.log("── Q2: chat.send kind=quote ออกเอกสาร + ลิงก์ ──");
  {
    const room = await rooms.startRoom({ tenantId: tid, actor: actor() }, { instruction: `ห้อง S3a.5 ${STAMP}`, context: { chatConversationId: cconv.id } });
    if (!room?.ok) throw new Error(`startRoom: ${JSON.stringify(room).slice(0, 160)}`);
    const qid = await mkQuote(2);
    await linkDocToRoom(room, qid);
    const before = await docRow(qid);
    // (ก) STAFF (ห้อง AI เดิมของตัวเอง · มีสิทธิ์ส่งแชท ไม่มีสิทธิ์บัญชี) อนุมัติใบที่ยังเป็น DRAFT ⇒ ไทย + PENDING · ใบยัง DRAFT
    const staffConv = await prisma.aiConversation.create({ data: { id: `u~${U.staff}~qcs3a5-${STAMP}`, tenantId: tid, title: "qc staff" } });
    const pS = await quoteProposal(staffConv.id, qid);
    const eS = await proposals.executeProposal(STAFF_M, { tenantId: tid }, pS.id, { userId: U.staff });
    const sS = await prisma.aiProposal.findUnique({ where: { id: pS.id }, select: { status: true } });
    const afterS = await docRow(qid);
    // ด่านผู้อนุมัติ R-Z17 (chat.send = OWNER/MANAGER เสมอ) หยุด STAFF ก่อนถึงด่านออกเอกสาร ⇒ ด่าน `account.doc.issue` เป็นชั้นป้องกันซ้อน — ตรวจตัวตัดสินตรงด้วย
    const ao = (await import("@/lib/ai/account-ops")) as AnyMod;
    const canStaff = ao.approverCanIssueDocument(STAFF_M, tid, A, U.staff), canOwner = ao.approverCanIssueDocument(OWNER_M, tid, A, U.owner), canMgr = ao.approverCanIssueDocument({ role: "MANAGER", unitAccess: ["*"], permissions: {} }, tid, A, U.owner);
    chk("Q2-1", "ผู้กดไม่มีสิทธิ์ออกเอกสาร (STAFF ไม่มี account.doc.issue) ⇒ ok:false ไทย · ข้อเสนอคง PENDING · ใบยัง DRAFT · ไม่มีข้อความออก · ตัวตัดสินออกเอกสาร STAFF=false OWNER/MANAGER=true", eS?.ok === false && thai(eS?.note) && sS?.status === "PENDING" && afterS?.status === "DRAFT" && !afterS?.docNo && !(await outFor(pS.id)) && canStaff === false && canOwner === true && canMgr === true, JSON.stringify({ eS, sS, st: afterS?.status, canStaff, canOwner, canMgr }).slice(0, 300));
    // (ข) OWNER อนุมัติในห้องเลขา (ใบ DRAFT ที่ห้องอ้าง · ไม่ระบุ documentId) ⇒ ออกเอกสาร + ข้อความมีเลขที่/ยอด/ลิงก์
    const p1 = await quoteProposal(room.conversationId);
    const e1 = await proposals.executeProposal(OWNER_M, { tenantId: tid }, p1.id, { userId: U.owner });
    const d1 = await docRow(qid);
    const body1 = String((await outFor(p1.id))?.body ?? "");
    if (d1?.publicToken) tokensMade.push(d1.publicToken);
    const total = d1 ? (d1.grandTotal / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "?";
    const audit = await prisma.auditLog.count({ where: { tenantId: tid, action: "account.doc.issue" } as never });
    chk("Q2-2", "OWNER อนุมัติ ⇒ ok · ใบ DRAFT → AWAITING_ACCEPT + docNo · audit account.doc.issue · ข้อความ OUT มี 'เลขที่ <docNo>' + 'ยอด <บาท> บาท' + '/doc/<token>'", e1?.ok === true && before?.status === "DRAFT" && d1?.status === "AWAITING_ACCEPT" && !!d1?.docNo && audit >= 1 && body1.includes(`เลขที่ ${d1.docNo}`) && body1.includes(`ยอด ${total} บาท`) && !!d1.publicToken && body1.includes(`/doc/${d1.publicToken}`), JSON.stringify({ e1, st: d1?.status, no: d1?.docNo, audit, body: body1.slice(0, 220) }).slice(0, 400));
    // (ค) ใบออกแล้ว ⇒ ข้อเสนอที่สองไม่ออกซ้ำ (เลขที่เดิม · token เดิม · audit ไม่เพิ่ม)
    const p2 = await quoteProposal(room.conversationId);
    const e2 = await proposals.executeProposal(OWNER_M, { tenantId: tid }, p2.id, { userId: U.owner });
    const d2 = await docRow(qid);
    const body2 = String((await outFor(p2.id))?.body ?? "");
    const audit2 = await prisma.auditLog.count({ where: { tenantId: tid, action: "account.doc.issue" } as never });
    chk("Q2-3", "ใบออกแล้ว ⇒ ไม่ออกซ้ำ: docNo/token เดิม · audit ออกเอกสารไม่เพิ่ม · ข้อความยังมีเลขที่+ยอด+ลิงก์เดิม", e2?.ok === true && d2?.docNo === d1?.docNo && d2?.publicToken === d1?.publicToken && audit2 === audit && body2.includes(`เลขที่ ${d1?.docNo}`) && body2.includes(`/doc/${d1?.publicToken}`), JSON.stringify({ e2, no: [d1?.docNo, d2?.docNo], audit: [audit, audit2] }).slice(0, 260));
    // (ง) R-Z62 M2: documentId ที่มีบันทึกในห้องนี้ ⇒ ok (token เดิม) · documentId ที่ไม่ได้สร้างในห้องนี้ (ใบ Q1) ⇒ ปฏิเสธไทย คง PENDING
    const p3 = await quoteProposal(room.conversationId, qid);
    const e3 = await proposals.executeProposal(OWNER_M, { tenantId: tid }, p3.id, { userId: U.owner });
    const body3 = String((await outFor(p3.id))?.body ?? "");
    const p3b = await quoteProposal(room.conversationId, issuedQuote);
    const e3b = await proposals.executeProposal(OWNER_M, { tenantId: tid }, p3b.id, { userId: U.owner });
    const s3b = await prisma.aiProposal.findUnique({ where: { id: p3b.id }, select: { status: true } });
    chk("Q2-4", "documentId ที่สร้างในห้องนี้ ⇒ ok + ลิงก์ token เดิม · documentId ที่ไม่ได้สร้างในห้องนี้ ⇒ ok:false ไทย · คง PENDING · ไม่มีข้อความออก (R-Z62 M2)", e3?.ok === true && body3.includes(`/doc/${d1?.publicToken}`) && e3b?.ok === false && thai(e3b?.note) && /งานนี้|ห้อง/.test(String(e3b?.note)) && s3b?.status === "PENDING" && !(await outFor(p3b.id)), JSON.stringify({ e3: e3?.ok, e3b, s3b }).slice(0, 300));
    Q2DOC = qid;
  }

  // ───────── Q6 (R-Z62) ─────────
  console.log("── Q6: R-Z62 — ชนิดเอกสาร · ห้องอื่น · summary · ร้านปิดลิงก์ · ยกเลิก/ปฏิเสธ · ส่งล้มหลังออกใบ ──");
  {
    const tools = (await import("@/lib/ai/tools")) as AnyMod;
    const newRoom = async (n: string, convId = cconv.id) => {
      const r = await rooms.startRoom({ tenantId: tid, actor: actor() }, { instruction: `ห้อง S3a.5 ${n} ${STAMP}`, context: { chatConversationId: convId } });
      if (!r?.ok) throw new Error(`startRoom ${n}: ${JSON.stringify(r).slice(0, 160)}`);
      return r as AnyMod;
    };
    // (ก) M1: ใบแจ้งหนี้ร่างที่ห้องอ้าง ⇒ ปฏิเสธ · ใบยัง DRAFT ไม่มีเลข
    const rInv = await newRoom("invoice");
    const inv = await acc.createDocument({ tenantId: tid, systemId: A, docType: "INVOICE", contactId: contact.id, lines: [{ description: "ค่าบริการ", qty: 1, unitPrice: 100000 }] });
    await linkDocToRoom(rInv, String(inv.id));
    const pInv = await quoteProposal(rInv.conversationId);
    const eInv = await proposals.executeProposal(OWNER_M, { tenantId: tid }, pInv.id, { userId: U.owner });
    const sInv = await prisma.aiProposal.findUnique({ where: { id: pInv.id }, select: { status: true } });
    const dInv = await docRow(String(inv.id));
    chk("Q6-1", "ห้องอ้างใบแจ้งหนี้ร่าง (INVOICE DRAFT) ⇒ ok:false ไทย 'เฉพาะใบเสนอราคา' · คง PENDING · ใบยัง DRAFT ไม่มีเลข · ไม่มีข้อความออก (M1)", eInv?.ok === false && /ใบเสนอราคา/.test(String(eInv?.note)) && sInv?.status === "PENDING" && dInv?.status === "DRAFT" && !dInv?.docNo && !(await outFor(pInv.id)), JSON.stringify({ eInv, sInv, d: [dInv?.status, dInv?.docNo] }).slice(0, 300));
    // (ข) M2: ใบเสนอราคาของห้องอื่น (ระบุ documentId) ⇒ ปฏิเสธ · ใบนั้นไม่ถูกออก
    const rA = await newRoom("A"), rB = await newRoom("B");
    const qA = await mkQuote(61);
    await linkDocToRoom(rA, qA);
    const pB = await quoteProposal(rB.conversationId, qA);
    const eB = await proposals.executeProposal(OWNER_M, { tenantId: tid }, pB.id, { userId: U.owner });
    const sB = await prisma.aiProposal.findUnique({ where: { id: pB.id }, select: { status: true } });
    const dA = await docRow(qA);
    chk("Q6-2", "documentId ของห้องอื่น ⇒ ok:false ไทย · คง PENDING · ใบนั้นยัง DRAFT (ไม่ถูกออกจากห้องอื่น) (M2)", eB?.ok === false && thai(eB?.note) && sB?.status === "PENDING" && dA?.status === "DRAFT" && !(await outFor(pB.id)), JSON.stringify({ eB, sB, st: dA?.status }).slice(0, 260));
    // (ค) summary ตอนเสนอ: ห้อง A มีใบร่าง (EXECUTED create) ⇒ "แนบใบเสนอราคา ฉบับร่าง ของ คุณสมชาย" · ห้องที่มีใบออกแล้ว ⇒ "เลขที่ <docNo>" · documentId ห้องอื่น ⇒ error ไม่สร้างข้อเสนอ
    const tctx = (convId: string) => ({ tenantId: tid, actor: actor(), conversationId: convId });
    const parse = (x: string) => { try { return JSON.parse(x) as AnyMod; } catch { return { raw: x } as AnyMod; } };
    const tA = parse(await tools.runTool(tctx(rA.conversationId), "send_customer_message", { conversationId: cconv.id, body: "ส่งใบเสนอราคาครับ", kind: "quote" }));
    const sumA = String((await prisma.aiProposal.findFirst({ where: { id: String(tA.proposalId ?? "") }, select: { summary: true } }))?.summary ?? "");
    const roomQ2 = await prisma.aiActionLog.findFirst({ where: { tenantId: tid, entityType: "account.document", entityId: Q2DOC }, select: { roomId: true } });
    const roomQ2Conv = roomQ2?.roomId ? (await prisma.aiRoom.findFirst({ where: { id: roomQ2.roomId }, select: { conversationId: true } }))?.conversationId ?? "" : "";
    const tQ = parse(await tools.runTool(tctx(roomQ2Conv), "send_customer_message", { conversationId: cconv.id, body: "ส่งใบเสนอราคาครับ", kind: "quote" }));
    const sumQ = String((await prisma.aiProposal.findFirst({ where: { id: String(tQ.proposalId ?? "") }, select: { summary: true } }))?.summary ?? "");
    const q2no = (await docRow(Q2DOC))?.docNo ?? "?";
    const tX = parse(await tools.runTool(tctx(rB.conversationId), "send_customer_message", { conversationId: cconv.id, body: "x", kind: "quote", documentId: qA }));
    chk("Q6-3", "summary ของข้อเสนอ chat.send quote บอก 'แนบใบเสนอราคา <ฉบับร่าง|เลขที่ X> ของ <ผู้ซื้อ>' · documentId ห้องอื่น ⇒ error ไม่สร้างข้อเสนอ", /แนบใบเสนอราคา ฉบับร่าง ของ คุณสมชาย/.test(sumA) && sumQ.includes(`แนบใบเสนอราคา เลขที่ ${q2no} ของ คุณสมชาย`) && typeof tX.error === "string" && thai(tX.error) && !tX.proposalId, JSON.stringify({ sumA: sumA.slice(-80), sumQ: sumQ.slice(-80), tX }).slice(0, 360));
    // (ง) ร้านปิดลิงก์สาธารณะ ⇒ ข้อความมีเลขที่+ยอด แต่ไม่มี "ดูใบ"
    await docSettings.saveDocSettings({ tenantId: tid, systemId: A }, { publicView: { enabled: false, showOutstanding: true, promptPayButton: true, expiryDays: 0 } });
    const rOff = await newRoom("off");
    const qOff = await mkQuote(62);
    await linkDocToRoom(rOff, qOff);
    const pOff = await quoteProposal(rOff.conversationId);
    const eOff = await proposals.executeProposal(OWNER_M, { tenantId: tid }, pOff.id, { userId: U.owner });
    await docSettings.saveDocSettings({ tenantId: tid, systemId: A }, { publicView: { enabled: true, showOutstanding: true, promptPayButton: true, expiryDays: 0 } });
    const bOff = String((await outFor(pOff.id))?.body ?? "");
    const dOff = await docRow(qOff);
    chk("Q6-4", "ร้านปิดลิงก์สาธารณะ ⇒ อนุมัติ ok · ข้อความมีเลขที่ + ยอด แต่ไม่มี 'ดูใบ' / '/doc/'", eOff?.ok === true && !!dOff?.docNo && bOff.includes(`เลขที่ ${dOff.docNo}`) && /ยอด [\d,]+\.\d{2} บาท/.test(bOff) && !bOff.includes("ดูใบ") && !bOff.includes("/doc/"), JSON.stringify({ eOff: eOff?.ok, body: bOff.slice(0, 200) }).slice(0, 300));
    // (จ) ใบที่ยกเลิก/ถูกปฏิเสธ ⇒ หน้า 404 + chat.send ปฏิเสธ
    const out: string[] = [];
    for (const st of ["CANCELLED", "REJECTED"] as const) {
      const r = await newRoom(st);
      const q = await mkQuote(st === "CANCELLED" ? 63 : 64);
      await acc.issueDocument(tid, A, q);
      const lk = await acc.ensurePublicDocumentLink(tid, A, q);
      await prisma.accountDocument.update({ where: { id: q }, data: { status: st } });
      await linkDocToRoom(r, q);
      const page = lk?.ok ? await get(docRoute, String(lk.token)) : { status: 0 };
      const pq = await quoteProposal(r.conversationId);
      const eq = await proposals.executeProposal(OWNER_M, { tenantId: tid }, pq.id, { userId: U.owner });
      const sq = await prisma.aiProposal.findUnique({ where: { id: pq.id }, select: { status: true } });
      out.push(`${st}:${page.status}:${eq?.ok}:${sq?.status}:${thai(eq?.note)}`);
    }
    chk("Q6-5", "ใบ CANCELLED / REJECTED ⇒ หน้า /doc 404 · chat.send ok:false ไทย คง PENDING", out.every((x) => /:404:false:PENDING:true$/.test(x)), out.join(" | "));
    // (ฉ) ส่งล้มหลังออกเอกสาร (ห้อง LINE ที่ไม่มีการเชื่อมต่อ) ⇒ note บอกว่าออกใบแล้ว + บันทึกการกระทำ account.documents.issue
    const lineContact = await prisma.chatContact.create({ data: { tenantId: tid, systemId: chatSys.id, channel: "LINE", externalUserId: `Uqcs3a5${STAMP}`, displayName: "คุณสมชาย LINE", customerId: cust.id } as never });
    const lineConv = await prisma.chatConversation.create({ data: { tenantId: tid, systemId: chatSys.id, channel: "LINE", contactId: lineContact.id, status: "OPEN", unitId: unit.id, lastMessageAt: new Date(), firstCustomerMessageAt: new Date() } as never });
    const rF = await newRoom("fail", lineConv.id);
    const qF = await mkQuote(65);
    await linkDocToRoom(rF, qF);
    const pF = await prisma.aiProposal.create({ data: { tenantId: tid, conversationId: rF.conversationId, kind: "chat.send", risk: "NORMAL", summary: "ส่งใบ", payload: { systemId: chatSys.id, conversationId: lineConv.id, contactId: lineContact.id, body: "ส่งใบเสนอราคาครับ", kind: "quote" }, status: "PENDING", expiresAt: new Date(Date.now() + 3_600_000) } as never });
    const eF = await proposals.executeProposal(OWNER_M, { tenantId: tid }, pF.id, { userId: U.owner });
    const dF = await docRow(qF);
    const sF = await prisma.aiProposal.findUnique({ where: { id: pF.id }, select: { status: true, resultNote: true } as never }) as AnyMod;
    const logF = await prisma.aiActionLog.count({ where: { tenantId: tid, kind: "account.documents.issue", entityId: qF } });
    const noteF = `${eF?.note ?? ""} ${sF?.resultNote ?? ""}`;
    chk("Q6-6", "ส่งล้มหลังออกใบ ⇒ ok:false · note 'ออกใบ <เลขที่> แล้ว แต่ส่งข้อความ…ไม่สำเร็จ' · ใบออกแล้ว (มีเลข) · บันทึกการกระทำ account.documents.issue 1 แถว", eF?.ok === false && !!dF?.docNo && noteF.includes(`ออกใบ ${dF.docNo} แล้ว`) && /ไม่สำเร็จ/.test(noteF) && logF === 1, JSON.stringify({ eF, st: sF?.status, no: dF?.docNo, logF }).slice(0, 320));
    // (ช) XSS: ค่าจากฐาน (ชื่อลูกค้า/รายการ/หมายเหตุ) มีแท็ก ⇒ หน้า /doc จริง escape ทั้งหมด
    const evil = await acc.createContact({ tenantId: tid, systemId: A, kind: "CUSTOMER", name: `<script>alert(1)</script>"onerror="x` });
    const xd = await acc.createDocument({ tenantId: tid, systemId: A, docType: "QUOTATION", contactId: evil.id, note: `"><img src=x onerror=alert(2)>`, lines: [{ description: `<svg onload=alert(3)>เครื่องชง`, qty: 1, unitPrice: 10000 }] });
    await acc.issueDocument(tid, A, String(xd.id));
    const xl = await acc.ensurePublicDocumentLink(tid, A, String(xd.id));
    const xp = xl?.ok ? await get(docRoute, String(xl.token)) : { status: 0, text: "" };
    const raw = /<script>alert|<img src=x|<svg onload|"onerror="x/i.test(xp.text.replace(/<script nonce="[^"]+">[^<]*<\/script>/g, ""));
    chk("Q6-7", "XSS: แท็ก/แอตทริบิวต์จากชื่อลูกค้า รายการ หมายเหตุ ถูก escape ในหน้า /doc จริง (มี &lt;script&gt; · ไม่มีแท็กดิบ · สคริปต์มีแค่ตัวที่มี nonce)", xp.status === 200 && !raw && xp.text.includes("&lt;script&gt;alert(1)&lt;/script&gt;") && xp.text.includes("&lt;svg onload=alert(3)&gt;") && (xp.text.match(/<script/g) ?? []).length === 1, JSON.stringify({ s: xp.status, raw }).slice(0, 200));
    // (ซ) mask เบอร์รูปต่าง ๆ · ไม่รวมเลขคนละก้อน
    const pd = (await import("@/lib/modules/account/public-doc")) as AnyMod;
    const mk = (x: string) => String(pd.maskLongNumbers(x));
    const cases: [string, string][] = [["โทร (081) 234 5678", "โทร xxxxxx5678"], ["081.234.5678", "xxxxxx5678"], ["+66 81 234 5678", "xxxxxxx5678"], ["ถนนสุข 10260 12345", "ถนนสุข 10260 12345"], ["เลข 0105561000013", "เลข xxxxxxxxx0013"]];
    const bad = cases.filter(([a, b]) => mk(a) !== b).map(([a]) => `${a}→${mk(a)}`);
    chk("Q6-8", "ปิดเบอร์: (081) 234 5678 · 081.234.5678 · +66 … ⇒ 4 หลักท้าย · '10260 12345' ไม่ถูกรวมเป็นเบอร์ · เลขภาษี 13 หลัก ⇒ 4 หลักท้าย", bad.length === 0, bad.join(" | "));
  }

  // ───────── Q3 ─────────
  console.log("── Q3: หน้า /doc/<token> ──");
  {
    const ok = await get(docRoute, issuedToken);
    const row = await docRow(issuedQuote);
    const total = row ? (row.grandTotal / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "?";
    chk("Q3-1", "token ถูก ⇒ 200 text/html · มีเลขที่ใบ + ยอดรวม + ชื่อร้าน + ปุ่มดาวน์โหลด/พิมพ์", ok.status === 200 && /text\/html/.test(ok.h.get("content-type") ?? "") && !!row?.docNo && ok.text.includes(String(row.docNo)) && ok.text.includes(total) && ok.text.includes("ร้านกาแฟสุขใจ QC") && ok.text.includes(`/doc/${issuedToken}/pdf`) && ok.text.includes("doc-print"), JSON.stringify({ s: ok.status, ct: ok.h.get("content-type"), no: row?.docNo, total }).slice(0, 200));
    chk("Q3-2", "header: X-Robots-Tag noindex · Referrer-Policy no-referrer · Cache-Control no-store · CSP script nonce", /noindex/.test(ok.h.get("x-robots-tag") ?? "") && ok.h.get("referrer-policy") === "no-referrer" && /no-store/.test(ok.h.get("cache-control") ?? "") && /script-src 'nonce-/.test(ok.h.get("content-security-policy") ?? "") && /<meta name="robots" content="noindex/.test(ok.text), JSON.stringify({ r: ok.h.get("x-robots-tag"), ref: ok.h.get("referrer-policy"), cc: ok.h.get("cache-control") }));
    const bad = await get(docRoute, `nosuchtoken${STAMP}xyz`);
    const draftQ = await mkQuote(9);
    await prisma.accountDocument.update({ where: { id: draftQ }, data: { publicToken: `draftTok${STAMP}abcd` } });
    const draft = await get(docRoute, `draftTok${STAMP}abcd`);
    chk("Q3-3", "token ผิด ⇒ 404 ไทย · ใบ DRAFT ที่มี token (ฝังมือ) ⇒ 404 · ไม่บอกใบ้", bad.status === 404 && thai(bad.text) && draft.status === 404 && !bad.text.includes("ร้านกาแฟสุขใจ"), JSON.stringify({ bad: bad.status, draft: draft.status }));
    const off = await docSettings.saveDocSettings({ tenantId: tid, systemId: A }, { publicView: { enabled: false, showOutstanding: true, promptPayButton: true, expiryDays: 0 } });
    const closed = await get(docRoute, issuedToken);
    await docSettings.saveDocSettings({ tenantId: tid, systemId: A }, { publicView: { enabled: true, showOutstanding: true, promptPayButton: true, expiryDays: 0 } });
    const reopened = await get(docRoute, issuedToken);
    chk("Q3-4", "ร้านปิดลิงก์สาธารณะ (§9.2 publicView) ⇒ 404 · เปิดคืน ⇒ 200", off?.ok !== false && closed.status === 404 && reopened.status === 200, JSON.stringify({ off, closed: closed.status, reopened: reopened.status }));
    // เพดานต่อ IP: IP เดียวยิง token สุ่ม 61 ครั้ง ⇒ ครั้งที่ 61 = 429 · เพดานต่อ token: token เดียวจากหลาย IP 31 ครั้ง ⇒ 429
    const ip = `${IP_BASE}.251`;
    let lastIp = 0;
    for (let i = 0; i < 61; i++) lastIp = (await get(docRoute, `rateTok${STAMP}${i}x`, ip)).status;
    const rlTok = `${issuedToken}`;
    let lastTok = 0; let tokText = ""; let retry = "";
    for (let i = 0; i < 31; i++) { const r = await get(docRoute, rlTok, `${IP_BASE}.${10 + (i % 200)}.${i}`); lastTok = r.status; tokText = r.text; retry = r.h.get("retry-after") ?? ""; }
    chk("Q3-5", "เกินเพดาน ⇒ 429 ไทย + Retry-After (ต่อ IP 60/นาที · ต่อ token 30/นาที)", lastIp === 429 && lastTok === 429 && thai(tokText) && Number(retry) > 0, JSON.stringify({ lastIp, lastTok, retry }));
  }

  // ───────── Q4 ─────────
  console.log("── Q4: /doc/<token>/pdf (ส่วน B) ──");
  {
    // token จากใบที่ออกในข้อ Q2 (ถังต่อ token ของใบ Q1 ถูกยิงจนเต็มในข้อ Q3-5)
    const q2 = await prisma.accountDocument.findFirst({ where: { tenantId: tid, id: Q2DOC }, select: { publicToken: true, docNo: true, grandTotal: true } });
    const tok = String(q2?.publicToken ?? "");
    tokensMade.push(tok);
    const t0 = Date.now();
    const res = await pdfRoute.GET!(new Request(`http://qc.local/doc/${tok}/pdf`, { headers: { "x-forwarded-for": `${IP_BASE}.240` } }), { params: Promise.resolve({ token: tok }) });
    const ms = Date.now() - t0;
    const buf = Buffer.from(await res.arrayBuffer());
    const cd = res.headers.get("content-disposition") ?? "";
    if (process.env.QC_S3A5_PDF_OUT) writeFileSync(process.env.QC_S3A5_PDF_OUT, buf); // ตรวจด้วยตา (ไม่บังคับ)
    const docNo = String(q2?.docNo ?? "");
    const asciiNo = docNo.replace(/[^A-Za-z0-9._-]/g, "_");
    // ข้อความในไฟล์: pdftotext ของระบบ (ถ้ามี — ไม่ติดตั้งเพิ่ม) · ไม่มี ⇒ ตรวจขนาด > 10 KB แทน
    let text = ""; let extractor = "none";
    const which = spawnSync("sh", ["-c", "command -v pdftotext"], { encoding: "utf8" });
    if (which.status === 0 && which.stdout.trim()) {
      const dir = mkdtempSync(join(tmpdir(), "qcs3a5-"));
      const f = join(dir, "q.pdf");
      writeFileSync(f, buf);
      const r = spawnSync("pdftotext", ["-enc", "UTF-8", f, "-"], { encoding: "utf8", timeout: 30_000 });
      text = r.stdout ?? ""; extractor = "pdftotext";
      rmSync(dir, { recursive: true, force: true });
    }
    const contentOk = extractor === "pdftotext" ? text.includes(docNo) && /ใบเสนอราคา/.test(text) : buf.length > 10_240;
    chk("Q4-1", "200 application/pdf · ขึ้นต้น %PDF · attachment filename=\"<docNo>.pdf\" + filename*=UTF-8'' · ขนาด ≤ 300 KB · no-store/noindex · ข้อความในไฟล์มีเลขที่ + 'ใบเสนอราคา' (ฟอนต์ไทยฝังแล้ว)", res.status === 200 && /application\/pdf/.test(res.headers.get("content-type") ?? "") && buf.subarray(0, 5).toString("latin1") === "%PDF-" && cd.startsWith("attachment;") && cd.includes(`filename="${asciiNo}.pdf"`) && cd.includes("filename*=UTF-8''") && buf.length <= 300 * 1024 && /no-store/.test(res.headers.get("cache-control") ?? "") && /noindex/.test(res.headers.get("x-robots-tag") ?? "") && contentOk, JSON.stringify({ s: res.status, ct: res.headers.get("content-type"), cd, kb: Math.round(buf.length / 1024), ms, extractor, hasNo: text.includes(docNo), thai: /ใบเสนอราคา/.test(text) }).slice(0, 360));
    const bad = await get(pdfRoute, `nosuchpdf${STAMP}xyz`);
    chk("Q4-2", "token ผิด ⇒ 404 ข้อความไทย (ไม่สร้างไฟล์)", bad.status === 404 && thai(bad.text), JSON.stringify({ bad: bad.status }));
    // R-Z62: ยอดใน PDF = ยอดในหน้า HTML (ใบเดียวกัน)
    const html = await get(docRoute, tok);
    const totalStr = q2 ? (q2.grandTotal / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "?";
    const htmlTotal = (/data-testid="doc-total"><div class="row total"><span>[^<]*<\/span><span>฿([^<]+)<\/span>/.exec(html.text) ?? [])[1] ?? "";
    chk("Q4-3", "ยอดรวมใน PDF (pdftotext) = ยอดรวมในหน้า HTML = grandTotal ของใบ", extractor !== "pdftotext" || (htmlTotal === totalStr && text.includes(`฿${totalStr}`)), JSON.stringify({ htmlTotal, totalStr, inPdf: text.includes(`฿${totalStr}`) }));
    // R-Z62: ตัดบรรทัดภาษาไทยใน PDF ไม่ใส่ขีด · ข้อความยาวครบทุกตัว (เทียบหลังตัดช่องว่าง/ขึ้นบรรทัด · สระอำเป็นรูปแยกในไฟล์)
    const longDesc = "ค่าบริการติดตั้งเครื่องชงกาแฟพร้อมระบบกรองน้ำและการอบรมพนักงานสองวันเต็มที่สาขาลาดพร้าวรวมค่าเดินทางและค่าอุปกรณ์สิ้นเปลืองทั้งหมด";
    const ld = await acc.createDocument({ tenantId: tid, systemId: A, docType: "QUOTATION", contactId: contact.id, note: longDesc + longDesc, lines: [{ description: longDesc, qty: 1, unitPrice: 123400 }] });
    await acc.issueDocument(tid, A, String(ld.id));
    const ll = await acc.ensurePublicDocumentLink(tid, A, String(ld.id));
    let longText = ""; let longOk = extractor !== "pdftotext";
    if (ll?.ok && extractor === "pdftotext") {
      tokensMade.push(String(ll.token));
      const r2 = await pdfRoute.GET!(new Request(`http://qc.local/doc/${ll.token}/pdf`, { headers: { "x-forwarded-for": `${IP_BASE}.241` } }), { params: Promise.resolve({ token: String(ll.token) }) });
      const b2 = Buffer.from(await r2.arrayBuffer());
      if (process.env.QC_S3A5_PDF_OUT) writeFileSync(process.env.QC_S3A5_PDF_OUT.replace(/\.pdf$/, "-long.pdf"), b2);
      const dir = mkdtempSync(join(tmpdir(), "qcs3a5-"));
      writeFileSync(join(dir, "l.pdf"), b2);
      longText = spawnSync("pdftotext", ["-enc", "UTF-8", join(dir, "l.pdf"), "-"], { encoding: "utf8", timeout: 30_000 }).stdout ?? "";
      rmSync(dir, { recursive: true, force: true });
      const norm = (x: string) => x.replace(/\u0E4D\u0E32/g, "\u0E33").replace(/\s+/g, "");
      longOk = r2.status === 200 && !/[\u0E00-\u0E7F]-\s*$/m.test(longText) && norm(longText).includes(norm(longDesc));
    }
    chk("Q4-4", "PDF ข้อความไทยยาว: ตัดบรรทัดโดยไม่มีขีดท้ายบรรทัด · ข้อความครบทุกตัว (pdftotext)", longOk, JSON.stringify({ extractor, hyphen: /[\u0E00-\u0E7F]-\s*$/m.test(longText), lines: longText.split("\n").filter(Boolean).length }).slice(0, 200));
  }

  // ───────── Q5 ─────────
  console.log("── Q5: ไม่มีเลขผู้เสียภาษี/เบอร์เต็มของลูกค้า ──");
  {
    const q2 = await prisma.accountDocument.findFirst({ where: { tenantId: tid, id: Q2DOC }, select: { publicToken: true, contactSnapshot: true } });
    const page = await get(docRoute, String(q2?.publicToken ?? ""));
    const html = page.text;
    const digits = html.replace(/[^0-9x]/g, " ");
    const snapTax = String(((q2?.contactSnapshot ?? {}) as AnyMod).taxId ?? "");
    chk("Q5-1", "หน้าไม่มีเลขผู้เสียภาษีลูกค้าเต็ม / เบอร์ลูกค้าเต็ม (ทุกรูปแบบ) · มีแบบปิดเหลือ 4 หลัก · เลขภาษีของร้านยังแสดง", page.status === 200 && !html.includes(BUYER_TAX) && !html.includes(BUYER_PHONE) && !html.includes(BUYER_PHONE.replace(/-/g, "")) && !digits.includes("0812345678") && (snapTax ? html.includes(`xxxxxxxxx${BUYER_TAX.slice(-4)}`) : true) && html.includes("0105561000099"), JSON.stringify({ s: page.status, snapTax: !!snapTax }));
  }
} catch (e) {
  console.log(`  💥 ${errMsg(e)}`); chk("CRASH", "ข้อสอบรันจบ", false, errMsg(e));
} finally {
  residue = await cleanup();
}
chk("Z-1", "residue 0 (ร้าน/ผู้ใช้ทดสอบลบหมด)", residue === 0, String(residue));
const passed = cks.filter((c) => c.res === "PASS").length; const failed = cks.filter((c) => c.res === "FAIL");
console.log(`\n${LABEL}: ${passed}/${cks.length} ผ่าน · ${failed.length} ไม่ผ่าน`);
console.log("JSON_SUMMARY " + JSON.stringify({ total: cks.length, passed, failed: failed.map((c) => c.id), skipped: [], residue }));
await prisma.$disconnect().catch(() => undefined);
process.exit(failed.length ? 1 : 0);
