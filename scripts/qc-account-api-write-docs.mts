// QC — API บัญชี WO C1: WRITE เอกสาร — สร้าง/แก้/ยกเลิกร่าง/ออก/แปลง/ตอบรับ/อนุมัติ/void/รับใบกำกับ/มัดจำ/ลิงก์สาธารณะ/แท็ก/ไฟล์แนบ/เตือน/รายการโปรด/เอกสารประจำ
// Fable oracle · Builder ห้ามแตะ · สัญญาอยู่ที่ ledger/ACCOUNT-API-RUN.md §C1
// 🔴 ใช้ tenant ใหม่ของตัวเอง (ไม่แตะ seed SIAM DIVE QC — เฉลยเฟส B ต้องไม่เพี้ยน) · ลบทิ้งใน finally
// ⚠️ standalone-typesafe: dynamic import + wide cast
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-account-api-write-docs");
// ⏭️ WO ยังไม่สร้าง → ข้ามแบบเห็นชัด (exit 0) ไม่ทำ qc:all/CI แดงค้าง (บทเรียน WO 0.7) — ด่านนี้หายไปเองเมื่อ WO ลงจริง
if (!((await import("@/lib/modules/account/api/registry" as string)) as { ACCOUNT_OPS: { id: string }[] }).ACCOUNT_OPS.some((o) => o.id === "documents.create")) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (documents.create)");
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, findings: [], skipped: true })}`);
  process.exit(0);
}
const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok, exp: e, act: a, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
const ymd = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(d);
const idem = () => ({ "idempotency-key": `c1-${Date.now()}-${Math.random().toString(16).slice(2)}` });

let tid = "";
let tidB = "";
try {
  const acc = (await import("@/lib/modules/account/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const gl = (await import("@/lib/modules/account/gl" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const policy = (await import("@/lib/modules/account/policy" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const ak = (await import("@/lib/api-keys/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const scopes = (await import("@/lib/api-keys/scopes" as string)) as Record<string, Any>;
  const route = (await import("@/app/api/v1/account/[...path]/route" as string)) as Record<string, (req: Request, ctx: { params: Promise<{ path: string[] }> }) => Promise<Response>>;

  // ── tenant ใหม่ ──
  const t = await prisma.tenant.create({ data: { name: "QC API C1", slug: `qc-api-c1-${Date.now()}` } });
  tid = t.id;
  const s = await sys.createSystem(tid, "ACCOUNT", "บัญชี C1");
  const SYS = s.id;
  const ctx = { tenantId: tid, systemId: SYS };
  await acc.saveSettings(tid, SYS, { orgName: "ร้าน C1", taxId: "0105561000001", vatRegistered: true, vatRateBp: 700, taxPointBasis: "ON_ISSUE" });
  await gl.ensureAccounting(ctx);
  const customer = await acc.createContact({ tenantId: tid, systemId: SYS, kind: "CUSTOMER", name: "ลูกค้า ซีวัน", phone: "0811111111" });
  const vendor = await acc.createContact({ tenantId: tid, systemId: SYS, kind: "VENDOR", name: "ผู้ขาย ซีวัน", taxId: "0105561000002" });
  const expenseLedger = await prisma.accountLedger.findFirst({ where: { systemId: SYS, type: "EXPENSE" }, orderBy: { code: "asc" }, select: { id: true, code: true } });
  const tB = await prisma.tenant.create({ data: { name: "QC API C1 B", slug: `qc-api-c1b-${Date.now()}` } });
  tidB = tB.id;
  const accB = await sys.createSystem(tidB, "ACCOUNT", "บัญชี B");
  const issueScopes = scopes.expandBundles(["issue-and-collect"]) as string[];
  const kWrite = await ak.createApiKey({ tenantId: tid }, "C1 write", { scopes: issueScopes, systemId: SYS });
  const kDanger = await ak.createApiKey({ tenantId: tid }, "C1 danger", { scopes: [...issueScopes, "account.doc.void", "account.doc.approve"], systemId: SYS });
  const kRead = await ak.createApiKey({ tenantId: tid }, "C1 read", { scopes: scopes.expandBundles(["read-only"]), systemId: SYS });
  const kB = await ak.createApiKey({ tenantId: tidB }, "C1 B", { scopes: issueScopes, systemId: accB.id });

  const call = async (method: string, path: string, key: string, body?: unknown, extra: Record<string, string> = {}) => {
    const headers: Record<string, string> = { authorization: `Bearer ${key}`, ...(method === "GET" ? {} : idem()), ...extra };
    let b: string | undefined;
    if (body !== undefined) { b = JSON.stringify(body); headers["content-type"] = "application/json"; }
    const req = new Request(`http://x/api/v1/account${path}`, { method, headers, body: b });
    const segs = path.split("?")[0]!.split("/").filter(Boolean);
    const res = await route[method]!(req, { params: Promise.resolve({ path: segs }) });
    const text = await res.text();
    let parsed: Any = null; try { parsed = JSON.parse(text); } catch { parsed = { _raw: text }; }
    return { status: res.status, headers: res.headers, body: parsed };
  };
  const W = kWrite.rawKey;
  const D = kDanger.rawKey;
  const code = (r: Any) => r.body?.error?.code;
  const entriesOf = async (refId: string) => prisma.accountJournalEntry.findMany({ where: { systemId: SYS, refId }, include: { lines: { include: { account: { select: { code: true } } } } }, orderBy: { createdAt: "asc" } });
  const balanced = (e: Any) => e.lines.reduce((s: number, l: Any) => s + l.debit, 0) === e.lines.reduce((s: number, l: Any) => s + l.credit, 0);
  const today = ymd();

  // ═══ W1 ใบเสนอราคา → แก้ → ออก → ตอบรับ → แปลงเป็นใบแจ้งหนี้ → ออก (โพสต์ GL) ═══
  const qtBody = { type: "QUOTATION", contactId: customer.id, issueDate: today, validUntil: today, vatMode: "EXCLUDE", lines: [{ description: "ทริปดำน้ำ", qty: 2, unitPriceSatang: 500000, vatRateBp: 700 }], note: "จาก API" };
  const qt = await call("POST", "/documents", W, qtBody);
  chk("C1-W1.1", "POST /documents QUOTATION → 200 data{id,type,status DRAFT,docNo null,grandTotalSatang=1,070,000}", qt.status === 200 && qt.body?.data?.status === "DRAFT" && qt.body?.data?.docNo === null && qt.body?.data?.grandTotalSatang === 1_070_000 && qt.body?.data?.type === "QUOTATION", "DRAFT 1070000", `${qt.status} ${JSON.stringify(qt.body).slice(0, 220)}`);
  const qtId = qt.body?.data?.id as string;
  const readDenied = await call("POST", "/documents", kRead.rawKey, qtBody);
  chk("C1-W1.2", "คีย์ read-only สร้างเอกสาร → 403 scope_missing", readDenied.status === 403 && code(readDenied) === "scope_missing", "403", `${readDenied.status}`);
  const badLine = await call("POST", "/documents", W, { ...qtBody, lines: [{ description: "x", qty: 1, unitPriceSatang: 10.5 }] });
  chk("C1-W1.3", "unitPriceSatang ทศนิยม → 422 validation", badLine.status === 422 && code(badLine) === "validation", "422", `${badLine.status} ${code(badLine)}`);
  const noLines = await call("POST", "/documents", W, { ...qtBody, lines: [] });
  chk("C1-W1.4", "ไม่มีบรรทัด → 422", noLines.status === 422, "422", `${noLines.status}`);
  const badType = await call("POST", "/documents", W, { ...qtBody, type: "RECEIPT" });
  chk("C1-W1.5", "type ที่สร้างตรงไม่ได้ (RECEIPT) → 422 validation", badType.status === 422, "422", `${badType.status} ${code(badType)}`);
  const foreignContact = await call("POST", "/documents", kB.rawKey, { ...qtBody, contactId: customer.id });
  chk("C1-W1.6", "คีย์ร้าน B ใช้ contactId ของร้าน A → 404/422 (ไม่สร้าง)", (foreignContact.status === 404 || foreignContact.status === 422) && (await prisma.accountDocument.count({ where: { systemId: accB.id } })) === 0, "404/422 + 0 doc", `${foreignContact.status}`);
  const upd = await call("PATCH", `/documents/${qtId}`, W, { lines: [{ description: "ทริปดำน้ำ", qty: 3, unitPriceSatang: 500000, vatRateBp: 700 }], note: "แก้แล้ว" });
  chk("C1-W1.7", "PATCH ร่าง → 200 grandTotalSatang ใหม่ 1,605,000 + note", upd.status === 200 && upd.body?.data?.grandTotalSatang === 1_605_000 && upd.body?.data?.note === "แก้แล้ว", "1605000", `${upd.status} ${upd.body?.data?.grandTotalSatang}`);
  const iss = await call("POST", `/documents/${qtId}/issue`, W);
  chk("C1-W1.8", "POST /issue ใบเสนอราคา → 200 docNo QT… status AWAITING_ACCEPT", iss.status === 200 && /^QT/.test(iss.body?.data?.docNo ?? "") && iss.body?.data?.status === "AWAITING_ACCEPT", "QT… AWAITING_ACCEPT", `${iss.status} ${JSON.stringify(iss.body?.data)}`);
  const updAfter = await call("PATCH", `/documents/${qtId}`, W, { note: "x" });
  chk("C1-W1.9", "PATCH หลังออกเอกสาร → 409 state_conflict", updAfter.status === 409 && code(updAfter) === "state_conflict", "409", `${updAfter.status} ${code(updAfter)}`);
  const issAgain = await call("POST", `/documents/${qtId}/issue`, W);
  chk("C1-W1.10", "issue ซ้ำ (idempotency key ใหม่) → 409 state_conflict ไม่ออกเลขใหม่", issAgain.status === 409, "409", `${issAgain.status} ${code(issAgain)}`);
  const resp = await call("POST", `/documents/${qtId}/respond`, W, { accepted: true });
  chk("C1-W1.11", "POST /respond accepted → 200 status ACCEPTED", resp.status === 200 && resp.body?.data?.status === "ACCEPTED", "ACCEPTED", `${resp.status} ${resp.body?.data?.status}`);
  const conv = await call("POST", `/documents/${qtId}/convert`, W, { toType: "INVOICE" });
  const ivId = conv.body?.data?.id as string;
  chk("C1-W1.12", "POST /convert → INVOICE → 200 data{id ใหม่,type INVOICE,status DRAFT,sourceDocument{id=QT}}", conv.status === 200 && !!ivId && ivId !== qtId && conv.body?.data?.type === "INVOICE" && conv.body?.data?.status === "DRAFT" && conv.body?.data?.sourceDocument?.id === qtId, "INVOICE DRAFT", `${conv.status} ${JSON.stringify(conv.body?.data).slice(0, 200)}`);
  const convBad = await call("POST", `/documents/${qtId}/convert`, W, { toType: "EXPENSE" });
  chk("C1-W1.13", "convert ไปชนิดที่ไม่อนุญาต → 422 หรือ 409 (ข้อความไทย)", (convBad.status === 422 || convBad.status === 409) && /[ก-๙]/.test(convBad.body?.error?.message_th ?? ""), "422/409", `${convBad.status}`);
  const ivIssue = await call("POST", `/documents/${ivId}/issue`, W);
  const ivEntries = await entriesOf(ivId);
  chk("C1-W1.14", "issue ใบแจ้งหนี้ → docNo IV… status AWAITING_PAYMENT + โพสต์ JV 1 ใบ สมดุล · Dr 1100 = 1,605,000", ivIssue.status === 200 && /^IV/.test(ivIssue.body?.data?.docNo ?? "") && ivIssue.body?.data?.status === "AWAITING_PAYMENT" && ivEntries.length === 1 && balanced(ivEntries[0]) && ivEntries[0]!.lines.filter((l: Any) => l.account.code === "1100").reduce((s: number, l: Any) => s + l.debit, 0) === 1_605_000, "IV + JV", `${ivIssue.status} entries=${ivEntries.length}`);
  const ivGet = await call("GET", `/documents/${ivId}`, W);
  chk("C1-W1.15", "GET detail ของ IV → jv[] 1 ใบ · related มี QT", ivGet.status === 200 && ivGet.body?.data?.jv?.length === 1 && JSON.stringify(ivGet.body?.data?.related ?? []).includes(qtId), "jv 1", `${ivGet.status} jv=${ivGet.body?.data?.jv?.length}`);

  // ═══ W2 แท็ก / ลิงก์สาธารณะ / ไฟล์แนบ / เตือน / รายการโปรด ═══
  const tags = await call("PUT", `/documents/${ivId}/tags`, W, { tags: ["api", "ทดสอบ"] });
  const tagsRow = await prisma.accountDocument.findUnique({ where: { id: ivId }, select: { tags: true } });
  chk("C1-W2.1", "PUT /tags → 200 + DB tags ตรง", tags.status === 200 && JSON.stringify(tagsRow?.tags) === JSON.stringify(["api", "ทดสอบ"]), "2 แท็ก", `${tags.status} ${JSON.stringify(tagsRow?.tags)}`);
  const pub = await call("POST", `/documents/${ivId}/public-link`, W);
  chk("C1-W2.2", "POST /public-link → 200 data{url} (ไม่คืน token แยก) หรือ 422 ไทยถ้าตั้งค่าไม่เปิด", (pub.status === 200 && /^https?:\/\/.+\/r\/[A-Za-z0-9_-]{16,}$/.test(pub.body?.data?.url ?? "") && !("token" in (pub.body?.data ?? {}))) || (pub.status === 422 && /[ก-๙]/.test(pub.body?.error?.message_th ?? "")), "url", `${pub.status} ${JSON.stringify(pub.body).slice(0, 160)}`);
  const pubDenied = await call("POST", `/documents/${ivId}/public-link`, kRead.rawKey);
  chk("C1-W2.3", "public-link คีย์ไม่มี doc.public_link → 403", pubDenied.status === 403, "403", `${pubDenied.status}`);
  const att = await call("POST", `/documents/${ivId}/attachments`, W, { fileUrl: "https://example.com/files/slip-001.jpg", fileName: "slip-001.jpg", mime: "image/jpeg", sizeBytes: 12345 });
  chk("C1-W2.4", "POST /attachments (URL) → 200 data{id,fileName,url}", att.status === 200 && typeof att.body?.data?.id === "string" && att.body?.data?.fileName === "slip-001.jpg", "200", `${att.status} ${JSON.stringify(att.body).slice(0, 160)}`);
  const attBad = await call("POST", `/documents/${ivId}/attachments`, W, { fileUrl: "javascript:alert(1)", fileName: "x.jpg" });
  chk("C1-W2.5", "fileUrl ไม่ใช่ http(s) → 422", attBad.status === 422, "422", `${attBad.status}`);
  const attList = await call("GET", `/documents/${ivId}/attachments`, W);
  chk("C1-W2.6", "GET attachments → 1 ไฟล์", attList.status === 200 && attList.body?.data?.length === 1, "1", `${attList.body?.data?.length}`);
  const attDel = await call("DELETE", `/documents/${ivId}/attachments/${att.body?.data?.id}`, W);
  const attList2 = await call("GET", `/documents/${ivId}/attachments`, W);
  chk("C1-W2.7", "DELETE attachment → 200 แล้ว list ว่าง", attDel.status === 200 && attList2.body?.data?.length === 0, "0", `${attDel.status} ${attList2.body?.data?.length}`);
  const remind = await call("POST", `/documents/${ivId}/remind`, W);
  chk("C1-W2.8", "POST /remind ลูกค้าไม่มีอีเมล → 422 unprocessable message_th ไทย", remind.status === 422 && /[ก-๙]/.test(remind.body?.error?.message_th ?? ""), "422", `${remind.status} ${code(remind)}`, "MAJOR");
  const fav = await call("POST", "/favorites", W, { name: "ชุดทริป", lines: [{ description: "ทริปดำน้ำ", qty: 1, unitPriceSatang: 500000, vatRateBp: 700 }] });
  const favList = await call("GET", "/favorites", W);
  chk("C1-W2.9", "POST /favorites → 200 แล้ว GET เห็นชื่อ", fav.status === 200 && (favList.body?.data ?? []).some((f: Any) => f.name === "ชุดทริป"), "มี", `${fav.status} ${JSON.stringify(favList.body?.data).slice(0, 120)}`);

  // ═══ W3 void (danger) ═══
  const voidNoScope = await call("POST", `/documents/${ivId}/void`, W, { confirm: true, reason: "ทดสอบยกเลิก" });
  chk("C1-W3.1", "void ด้วยคีย์ไม่มี doc.void → 403", voidNoScope.status === 403, "403", `${voidNoScope.status}`);
  const voidNoConfirm = await call("POST", `/documents/${ivId}/void`, D, { reason: "ทดสอบยกเลิก" });
  chk("C1-W3.2", "void ไม่มี confirm → 409 confirm_required", voidNoConfirm.status === 409 && code(voidNoConfirm) === "confirm_required", "409", `${voidNoConfirm.status}`);
  const voided = await call("POST", `/documents/${ivId}/void`, D, { confirm: true, reason: "ทดสอบยกเลิก" });
  const ivEntries2 = await entriesOf(ivId);
  const ivRow = await prisma.accountDocument.findUnique({ where: { id: ivId }, select: { status: true, voidReason: true } });
  chk("C1-W3.3", "void → 200 status VOIDED · voidReason เก็บ · มี reversal JV (รวม 2 ใบ สมดุล) · ยอด 1100 net = 0", voided.status === 200 && ivRow?.status === "VOIDED" && ivRow?.voidReason === "ทดสอบยกเลิก" && ivEntries2.length === 2 && ivEntries2.every(balanced) && ivEntries2.flatMap((e: Any) => e.lines).filter((l: Any) => l.account.code === "1100").reduce((s: number, l: Any) => s + l.debit - l.credit, 0) === 0, "VOIDED + reversal", `${voided.status} ${ivRow?.status} entries=${ivEntries2.length}`);
  const voidAgain = await call("POST", `/documents/${ivId}/void`, D, { confirm: true, reason: "ทดสอบยกเลิกซ้ำ" });
  chk("C1-W3.4", "void ซ้ำ → 409 state_conflict (ไม่กลับรายการซ้ำ)", voidAgain.status === 409 && (await entriesOf(ivId)).length === 2, "409", `${voidAgain.status} ${code(voidAgain)}`);
  const audits = await prisma.auditLog.findMany({ where: { tenantId: tid, actorType: "API_KEY" as Any } });
  const voidAudit = audits.find((a) => a.action === "account.doc.void");
  chk("C1-W3.5", "audit ของ void: actorType API_KEY · after.reason · after.keyName = 'C1 danger'", !!voidAudit && (voidAudit.after as Any)?.reason === "ทดสอบยกเลิก" && (voidAudit.after as Any)?.keyName === "C1 danger", "มี", JSON.stringify(voidAudit?.after).slice(0, 160));

  // ═══ W4 รายจ่าย: EXPENSE → issue ═══
  const ex = await call("POST", "/documents", W, { type: "EXPENSE", contactId: vendor.id, issueDate: today, vatMode: "EXCLUDE", vatPurchaseMode: "CLAIM", lines: [{ description: "ค่าน้ำมันเรือ", qty: 1, unitPriceSatang: 300000, vatRateBp: 700, accountId: expenseLedger?.id }] });
  const exId = ex.body?.data?.id as string;
  chk("C1-W4.1", "POST /documents EXPENSE (ฝั่งจ่าย) → DRAFT grandTotalSatang 321,000", ex.status === 200 && ex.body?.data?.status === "DRAFT" && ex.body?.data?.grandTotalSatang === 321_000, "321000", `${ex.status} ${JSON.stringify(ex.body).slice(0, 200)}`);
  const exIssue = await call("POST", `/documents/${exId}/issue`, W);
  const exEntries = await entriesOf(exId);
  chk("C1-W4.2", "issue EXPENSE → docNo EX… AWAITING_PAYMENT + JV สมดุล Dr ค่าใช้จ่าย 300,000 / Cr 2100", exIssue.status === 200 && exIssue.body?.data?.status === "AWAITING_PAYMENT" && exEntries.length === 1 && balanced(exEntries[0]) && exEntries[0]!.lines.filter((l: Any) => l.account.code === expenseLedger?.code).reduce((s: number, l: Any) => s + l.debit, 0) === 300_000, "EX + JV", `${exIssue.status} ${JSON.stringify(exIssue.body?.data)} entries=${exEntries.length}`);

  // ═══ W5 ใบสั่งซื้อ: create → issue(=ส่งอนุมัติ) → approve (scope) → convert → ลบร่าง ═══
  const po = await call("POST", "/documents", W, { type: "PURCHASE_ORDER", contactId: vendor.id, issueDate: today, lines: [{ description: "ถังอากาศ", qty: 10, unitPriceSatang: 800000, vatRateBp: 700 }] });
  const poId = po.body?.data?.id as string;
  chk("C1-W5.1", "POST PURCHASE_ORDER → DRAFT", po.status === 200 && po.body?.data?.status === "DRAFT", "DRAFT", `${po.status} ${po.body?.data?.status}`);
  const poSubmit = await call("POST", `/documents/${poId}/issue`, W);
  chk("C1-W5.2", "issue PO = ส่งอนุมัติ → docNo PO… status AWAITING_APPROVAL", poSubmit.status === 200 && poSubmit.body?.data?.status === "AWAITING_APPROVAL" && /^PO/.test(poSubmit.body?.data?.docNo ?? ""), "AWAITING_APPROVAL", `${poSubmit.status} ${JSON.stringify(poSubmit.body?.data)}`);
  const apprDenied = await call("POST", `/documents/${poId}/approve`, W);
  chk("C1-W5.3", "approve ด้วยคีย์ไม่มี doc.approve → 403 scope_missing", apprDenied.status === 403 && code(apprDenied) === "scope_missing", "403", `${apprDenied.status}`);
  const appr = await call("POST", `/documents/${poId}/approve`, D);
  chk("C1-W5.4", "approve ด้วยคีย์มี doc.approve → 200 status APPROVED", appr.status === 200 && appr.body?.data?.status === "APPROVED", "APPROVED", `${appr.status} ${appr.body?.data?.status}`);
  const poConv = await call("POST", `/documents/${poId}/convert`, W, {});
  const pcId = poConv.body?.data?.id as string;
  chk("C1-W5.5", "convert PO (ไม่ระบุ toType) → PURCHASE DRAFT", poConv.status === 200 && poConv.body?.data?.type === "PURCHASE" && poConv.body?.data?.status === "DRAFT", "PURCHASE DRAFT", `${poConv.status} ${JSON.stringify(poConv.body?.data).slice(0, 160)}`);
  const del = await call("DELETE", `/documents/${pcId}`, W);
  const pcRow = await prisma.accountDocument.findUnique({ where: { id: pcId }, select: { status: true } });
  chk("C1-W5.6", "DELETE ร่าง → 200 status CANCELLED", del.status === 200 && pcRow?.status === "CANCELLED", "CANCELLED", `${del.status} ${pcRow?.status}`);
  const delIssued = await call("DELETE", `/documents/${exId}`, W);
  chk("C1-W5.7", "DELETE เอกสารที่ออกแล้ว → 409 state_conflict", delIssued.status === 409, "409", `${delIssued.status}`);
  const po2 = await call("POST", "/documents", W, { type: "PURCHASE_ORDER", contactId: vendor.id, lines: [{ description: "x", qty: 1, unitPriceSatang: 1000 }] });
  await call("POST", `/documents/${po2.body?.data?.id}/issue`, W);
  const rej = await call("POST", `/documents/${po2.body?.data?.id}/reject`, D, { reason: "ราคาสูงเกินไป" });
  chk("C1-W5.8", "POST /reject {reason} → 200 status REJECTED", rej.status === 200 && rej.body?.data?.status === "REJECTED", "REJECTED", `${rej.status} ${rej.body?.data?.status}`);

  // ═══ W6 refType/refId (กันซ้ำระดับธุรกิจ) + idempotency replay ═══
  const refBody = { type: "INVOICE", contactId: customer.id, refType: "EXTERNAL_BOOKING", refId: "BK-1001", lines: [{ description: "จองทริป", qty: 1, unitPriceSatang: 250000, vatRateBp: 700 }] };
  const ref1 = await call("POST", "/documents", W, refBody);
  const ref2 = await call("POST", "/documents", W, refBody);
  chk("C1-W6.1", "สร้างซ้ำด้วย refType/refId เดิม → 409 duplicate + hint มี id เดิม (เอกสารเดียว)", ref1.status === 200 && ref2.status === 409 && code(ref2) === "duplicate" && String(ref2.body?.error?.hint ?? "").includes(ref1.body?.data?.id) && (await prisma.accountDocument.count({ where: { systemId: SYS, refType: "EXTERNAL_BOOKING", refId: "BK-1001" } })) === 1, "409 duplicate", `${ref1.status}/${ref2.status} ${code(ref2)}`);
  const refGet = await call("GET", `/documents?refType=EXTERNAL_BOOKING&refId=BK-1001`, W);
  chk("C1-W6.2", "GET /documents?refType&refId → เจอใบเดิม", refGet.status === 200 && refGet.body?.data?.[0]?.id === ref1.body?.data?.id, "เจอ", `${refGet.status} ${refGet.body?.data?.length}`, "MAJOR");
  const k1 = idem();
  const r1 = await call("POST", "/documents", W, qtBody, k1);
  const r2 = await call("POST", "/documents", W, qtBody, k1);
  chk("C1-W6.3", "Idempotency-Key เดิม body เดิม → id เดียวกัน (สร้างใบเดียว)", r1.status === 200 && r2.status === 200 && r1.body?.data?.id === r2.body?.data?.id && r2.headers.get("idempotent-replayed") === "true", "id เดียว", `${r1.body?.data?.id}/${r2.body?.data?.id}`);

  // ═══ W7 ล็อกงวด/วันที่ ═══
  const tomorrow = ymd(new Date(Date.now() + 86_400_000));
  const pol = await policy.savePolicy(ctx, { lockBeforeDate: tomorrow });
  const locked = await call("POST", "/documents", W, qtBody);
  await policy.savePolicy(ctx, { lockBeforeDate: null });
  chk("C1-W7.1", "นโยบายล็อกก่อนวันที่ → สร้างเอกสารวันนี้ → 409 period_locked (ข้อความไทย)", pol?.ok !== false && locked.status === 409 && code(locked) === "period_locked" && /[ก-๙]/.test(locked.body?.error?.message_th ?? ""), "409 period_locked", `${locked.status} ${code(locked)} ${locked.body?.error?.message_th}`);

  // ═══ W8 เอกสารประจำ ═══
  const rule = await call("POST", "/recurring", W, { name: "ค่าบริการรายเดือน", docType: "INVOICE", contactId: customer.id, frequency: "MONTHLY", dayOfMonth: 1, startDate: today, endDate: null, leadDays: 0, autoApprove: false, active: true, template: { priceMode: "EXCL_VAT", lines: [{ name: "บริการ", description: "ค่าบริการรายเดือน", qty: 1, unitName: null, unitPriceSatang: 100000, vatRateBp: 700, discountSatang: 0, productId: null, accountId: null }], note: "", tags: ["ประจำ"], dueDays: null } });
  const ruleId = rule.body?.data?.id as string;
  chk("C1-W8.1", "POST /recurring → 200 data{id,name,active}", rule.status === 200 && typeof ruleId === "string" && rule.body?.data?.active === true, "200", `${rule.status} ${JSON.stringify(rule.body).slice(0, 200)}`);
  const ruleUpd = await call("PATCH", `/recurring/${ruleId}`, W, { name: "ค่าบริการรายเดือน (แก้)" });
  chk("C1-W8.2", "PATCH /recurring/{id} (partial) → 200 ชื่อใหม่", ruleUpd.status === 200 && ruleUpd.body?.data?.name === "ค่าบริการรายเดือน (แก้)", "ชื่อใหม่", `${ruleUpd.status} ${ruleUpd.body?.data?.name}`);
  const run = await call("POST", `/recurring/${ruleId}/run`, W);
  chk("C1-W8.3", "POST /recurring/{id}/run → 200 summary{created,skipped,errors[]} และมีร่างเอกสารเกิด ≥1", run.status === 200 && Number.isInteger(run.body?.data?.created) && (await prisma.accountDocument.count({ where: { systemId: SYS, source: "RECURRING" as Any } })) >= 1, "created ≥1", `${run.status} ${JSON.stringify(run.body?.data)}`);
  const ruleOff = await call("POST", `/recurring/${ruleId}/active`, W, { active: false });
  chk("C1-W8.4", "POST /recurring/{id}/active {active:false} → 200 active=false", ruleOff.status === 200 && ruleOff.body?.data?.active === false, "false", `${ruleOff.status} ${ruleOff.body?.data?.active}`);
  const ruleDel = await call("DELETE", `/recurring/${ruleId}`, W);
  chk("C1-W8.5", "DELETE /recurring/{id} → 200 แล้ว GET → 404", ruleDel.status === 200 && (await call("GET", `/recurring/${ruleId}/runs`, W)).status === 404, "404", `${ruleDel.status}`);

  // ═══ W9 ข้ามร้าน + audit นับ ═══
  const crossPatch = await call("PATCH", `/documents/${qtId}`, kB.rawKey, { note: "hack" });
  chk("C1-W9.1", "คีย์ร้าน B PATCH เอกสารร้าน A → 404", crossPatch.status === 404, "404", `${crossPatch.status}`);
  const crossVoid = await call("POST", `/documents/${exId}/void`, kB.rawKey, { confirm: true, reason: "แฮกยกเลิก" });
  chk("C1-W9.2", "คีย์ร้าน B void เอกสารร้าน A → 403 scope หรือ 404 (ไม่ VOIDED)", (crossVoid.status === 403 || crossVoid.status === 404) && (await prisma.accountDocument.findUnique({ where: { id: exId }, select: { status: true } }))?.status !== "VOIDED", "403/404", `${crossVoid.status}`);
  const auditAll = await prisma.auditLog.count({ where: { tenantId: tid, actorType: "API_KEY" as Any } });
  chk("C1-W9.3", "ทุก write ที่สำเร็จมี audit API_KEY (≥ 20 แถว)", auditAll >= 20, "≥20", `${auditAll}`, "MAJOR");

  // ═══ W10 registry ═══
  const registry = (await import("@/lib/modules/account/api/registry" as string)) as Record<string, Any>;
  const ops = registry.ACCOUNT_OPS as Any[];
  const need: [string, string, string][] = [["documents.create", "write", "account.doc.create"], ["documents.update", "write", "account.doc.create"], ["documents.delete", "write", "account.doc.create"], ["documents.issue", "write", "account.doc.issue"], ["documents.convert", "write", "account.doc.create"], ["documents.respond", "write", "account.doc.create"], ["documents.approve", "write", "account.doc.approve"], ["documents.reject", "write", "account.doc.approve"], ["documents.void", "danger", "account.doc.void"], ["documents.receive", "write", "account.payment.record"], ["documents.deposits", "read", "account.doc.view"], ["documents.set-deposits", "write", "account.doc.create"], ["documents.public-link", "write", "account.doc.public_link"], ["documents.set-tags", "write", "account.doc.create"], ["documents.add-attachment", "write", "account.doc.create"], ["documents.delete-attachment", "write", "account.doc.create"], ["documents.remind", "write", "account.doc.view"], ["favorites.save", "write", "account.doc.create"], ["recurring.create", "write", "account.doc.create"], ["recurring.update", "write", "account.doc.create"], ["recurring.set-active", "write", "account.doc.create"], ["recurring.delete", "write", "account.doc.create"], ["recurring.run", "write", "account.doc.create"]];
  const bad = need.filter(([id, kind, action]) => { const o = ops.find((x) => x.id === id); return !o || o.kind !== kind || o.action !== action; });
  chk("C1-W10.1", "registry มี op ครบ 23 ตัวของ C1 · kind/action ตามสัญญา", bad.length === 0, "ครบ", bad.map(([id]) => id).join(","));
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 260) : String(e));
} finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  for (const id of [tid, tidB]) {
    if (!id) continue;
    // ลบตามลำดับ FK: บรรทัด/การชำระ/JV → เอกสาร → อื่น ๆ → tenant (ตาราง account* เป็น tenant-scoped ทั้งหมด)
    for (const m of ["accountJournalLine", "accountJournalEntry", "accountDocumentPayment", "accountDocumentRelation", "accountDocumentLine", "accountAttachment", "accountRecurringRun", "accountRecurringRule", "accountDocument", "accountDocSequence", "accountContact", "accountMapping", "accountLedger", "accountPeriod", "accountSettings", "apiIdempotency", "apiKey", "auditLog", "outboxEvent", "appSystemUnit", "appSystem"]) {
      await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: id } }));
    }
    await d(() => prisma.businessUnit.deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.tenant.delete({ where: { id } }));
  }
  await d(() => prisma.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE key LIKE 'acct:api:%'`));
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Account API WRITE docs (C1) =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
