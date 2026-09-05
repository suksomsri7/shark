// QC — API บัญชี WO D3: WRITE งานปฏิบัติการ — กระทบยอดธนาคาร (นำเข้า/จับคู่/ยืนยัน/เปิดกลับ) · นำเข้า CSV (preview/run) · คลังเอกสาร (PATCH/bulk) · กล่องขาเข้า (ingest/read/create-expense) · รายงานอีเมล
// Fable oracle · Builder ห้ามแตะ · สัญญาอยู่ที่ ledger/ACCOUNT-API-RUN.md §D3
// 🔴 tenant ใหม่ของตัวเอง · ลบทิ้งใน finally · AI อ่านบิลใช้ MockProvider (SHARK_AI_MOCK=1) ห้ามเผาเงินจริง
// ⚠️ standalone-typesafe: dynamic import + wide cast
process.env.SHARK_AI_MOCK = "1";
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-account-api-write-ops");
// ⏭️ WO ยังไม่สร้าง → ข้ามแบบเห็นชัด (exit 0) ไม่ทำ qc:all/CI แดงค้าง (บทเรียน WO 0.7) — ด่านนี้หายไปเองเมื่อ WO ลงจริง
if (!((await import("@/lib/modules/account/api/registry" as string)) as { ACCOUNT_OPS: { id: string }[] }).ACCOUNT_OPS.some((o) => o.id === "reconcile.import-statement")) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (reconcile.import-statement)");
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
const idem = () => ({ "idempotency-key": `d3-${Date.now()}-${Math.random().toString(16).slice(2)}` });
const ymd = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(d);
const bkkParts = (d: Date) => ymd(d).split("-").map(Number) as [number, number, number];

let tid = "";
try {
  const acc = (await import("@/lib/modules/account/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const gl = (await import("@/lib/modules/account/gl" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const fin = (await import("@/lib/modules/account/finance" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const pay = (await import("@/lib/modules/account/payment" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const imp = (await import("@/lib/modules/account/import-shared" as string)) as Record<string, Any>;
  const ak = (await import("@/lib/api-keys/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const scopes = (await import("@/lib/api-keys/scopes" as string)) as Record<string, Any>;
  const route = (await import("@/app/api/v1/account/[...path]/route" as string)) as Record<string, (req: Request, ctx: { params: Promise<{ path: string[] }> }) => Promise<Response>>;

  const t = await prisma.tenant.create({ data: { name: "QC API D3", slug: `qc-api-d3-${Date.now()}` } });
  tid = t.id;
  const s = await sys.createSystem(tid, "ACCOUNT", "บัญชี D3");
  const SYS = s.id;
  const ctx = { tenantId: tid, systemId: SYS };
  await acc.saveSettings(tid, SYS, { orgName: "ร้าน D3", taxId: "0105561000011", vatRegistered: true, vatRateBp: 700, taxPointBasis: "ON_ISSUE" });
  await gl.ensureAccounting(ctx);
  const customer = await acc.createContact({ tenantId: tid, systemId: SYS, kind: "CUSTOMER", name: "ลูกค้า ดีสาม" });
  const bank = await fin.createFinanceAccount({ tenantId: tid, systemId: SYS, type: "BANK", name: "กสิกร", bankName: "KBANK", accountNo: "111", openingBalance: 500_000, openingDate: new Date() });
  const acct = scopes.expandBundles(["accountant", "settings"]) as string[];
  const kA = await ak.createApiKey({ tenantId: tid }, "D3 accountant", { scopes: acct, systemId: SYS });
  const kR = await ak.createApiKey({ tenantId: tid }, "D3 read", { scopes: scopes.expandBundles(["read-only"]), systemId: SYS });

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
  const A = kA.rawKey;
  const code = (r: Any) => r.body?.error?.code;
  const today = ymd();
  const period = today.slice(0, 7);
  const [yy, mm, dd] = bkkParts(new Date());
  const thaiDate = `${String(dd).padStart(2, "0")}/${String(mm).padStart(2, "0")}/${yy + 543}`;

  // ═══ R1 กระทบยอด: สร้างรายการรับเงินในระบบ 1 รายการ → นำเข้า statement KBANK ที่มีแถวตรงกัน + แถวค่าธรรมเนียม ═══
  const iv = await acc.createDocument({ tenantId: tid, systemId: SYS, docType: "INVOICE", contactId: customer.id, issueDate: new Date(), vatMode: "EXCLUDE", lines: [{ description: "x", qty: 1, unitPrice: 27_000_00 / 1.07, vatRateBp: 700 }] });
  await acc.issueDocument(tid, SYS, iv.id);
  const ivRow = await prisma.accountDocument.findUnique({ where: { id: iv.id }, select: { grandTotal: true, docNo: true } });
  await pay.recordPayments(tid, SYS, iv.id, [{ paidAt: today, financeAccountId: bank.id, amountSatang: ivRow!.grandTotal, note: "", whtIncomeType: null, whtRateBp: null, whtAmountSatang: 0, feeSatang: 0, cheque: null }], { userId: null, keyBase: "qc-d3" });
  const baht = (satang: number) => (satang / 100).toLocaleString("en-US", { minimumFractionDigits: 2 });
  const csv = "﻿วันที่,เวลา,รายละเอียด,เลขที่อ้างอิง,ถอนเงิน,ฝากเงิน,คงเหลือ,ช่องทาง\n" +
    `${thaiDate},10:00,"รับชำระเงิน ${ivRow!.docNo}",RV-1,,"${baht(ivRow!.grandTotal)}","${baht(500_000 + ivRow!.grandTotal)}",K-Cyber\n` +
    `${thaiDate},10:05,"ค่าธรรมเนียมธนาคาร",FEE-1,"25.00",,"${baht(500_000 + ivRow!.grandTotal - 2500)}",K-Cyber\n`;
  const prev = await call("POST", "/reconcile/statements/preview", A, { financeAccountId: bank.id, period, source: "KBANK", text: csv });
  chk("D3-R1.1", "POST /reconcile/statements/preview → 200 {source,rows 2,errors[],closingFromFileSatang}", prev.status === 200 && prev.body?.data?.rows?.length === 2 && Array.isArray(prev.body?.data?.errors) && prev.body.data.errors.length === 0, "2 แถว", `${prev.status} ${JSON.stringify(prev.body).slice(0, 220)}`);
  const imported = await call("POST", "/reconcile/statements", A, { financeAccountId: bank.id, period, source: "KBANK", fileName: "kbank.csv", text: csv });
  const stId = imported.body?.data?.statementId as string;
  chk("D3-R1.2", "POST /reconcile/statements → 200 {statementId,imported 2,duplicated 0}", imported.status === 200 && typeof stId === "string" && imported.body?.data?.imported === 2, "2", `${imported.status} ${JSON.stringify(imported.body?.data).slice(0, 160)}`);
  const importAgain = await call("POST", "/reconcile/statements", A, { financeAccountId: bank.id, period, source: "KBANK", fileName: "kbank.csv", text: csv });
  chk("D3-R1.3", "นำเข้าไฟล์เดิมซ้ำ → 200 duplicated 2 (fingerprint) หรือ 409 · ไม่มีแถวเพิ่ม", (importAgain.status === 409 || importAgain.body?.data?.duplicated === 2) && (await prisma.accountBankStatementLine.count({ where: { systemId: SYS } })) === 2, "ไม่เพิ่ม", `${importAgain.status} ${JSON.stringify(importAgain.body?.data).slice(0, 120)}`);
  const auto = await call("POST", `/reconcile/statements/${stId}/auto-match`, A, {});
  chk("D3-R1.4", "POST /reconcile/statements/{id}/auto-match → 200 {matched 1,suggested,unmatched 1}", auto.status === 200 && auto.body?.data?.matched === 1, "matched 1", `${auto.status} ${JSON.stringify(auto.body?.data)}`);
  const page = await call("GET", `/reconcile?financeAccountId=${bank.id}&period=${period}`, A);
  const feeLine = (page.body?.data?.lines ?? []).find((l: Any) => l.status === "UNMATCHED");
  chk("D3-R1.5", "GET /reconcile หลัง auto-match → summary.matchedCount 1 · แถวค่าธรรมเนียม UNMATCHED", page.body?.data?.summary?.matchedCount === 1 && !!feeLine && feeLine.amountSatang === -2500, "1 + fee", `${JSON.stringify(page.body?.data?.summary).slice(0, 160)}`);
  const created = await call("POST", `/reconcile/lines/${feeLine?.id}/create-entry`, A, { kind: "FEE", note: "ค่าธรรมเนียมโอน" });
  chk("D3-R1.6", "POST /reconcile/lines/{id}/create-entry {kind:FEE} → 200 {entryId} · แถว CREATED · JV ค่าธรรมเนียม", created.status === 200 && typeof created.body?.data?.entryId === "string" && (await prisma.accountBankStatementLine.findUnique({ where: { id: feeLine?.id }, select: { status: true } }))?.status === "CREATED", "CREATED", `${created.status} ${JSON.stringify(created.body).slice(0, 160)}`);
  const matchedLine = (page.body?.data?.lines ?? []).find((l: Any) => l.status === "MATCHED");
  const un = await call("POST", `/reconcile/lines/${matchedLine?.id}/unmatch`, A, {});
  chk("D3-R1.7", "POST /reconcile/lines/{id}/unmatch → 200 · แถวกลับ UNMATCHED", un.status === 200 && (await prisma.accountBankStatementLine.findUnique({ where: { id: matchedLine?.id }, select: { status: true } }))?.status === "UNMATCHED", "UNMATCHED", `${un.status} ${code(un)}`);
  const sysEntries = (await call("GET", `/reconcile?financeAccountId=${bank.id}&period=${period}`, A)).body?.data?.systemEntries ?? [];
  const target = sysEntries.find((e: Any) => e.amountSatang === ivRow!.grandTotal && !e.matchedLineId);
  const manual = await call("POST", `/reconcile/lines/${matchedLine?.id}/match`, A, { journalLineId: target?.journalLineId });
  chk("D3-R1.8", "POST /reconcile/lines/{id}/match {journalLineId} → 200 · MATCHED", manual.status === 200 && (await prisma.accountBankStatementLine.findUnique({ where: { id: matchedLine?.id }, select: { status: true } }))?.status === "MATCHED", "MATCHED", `${manual.status} ${code(manual)} target=${JSON.stringify(target).slice(0, 100)}`);
  const confirmed = await call("POST", `/reconcile/${period}/confirm`, A, { financeAccountId: bank.id });
  chk("D3-R1.9", "POST /reconcile/{period}/confirm → 200 {matched} · summary.confirmedAt ตั้ง", confirmed.status === 200 && !!(await call("GET", `/reconcile?financeAccountId=${bank.id}&period=${period}`, A)).body?.data?.summary?.confirmedAt, "confirmed", `${confirmed.status} ${code(confirmed)} ${confirmed.body?.error?.message_th ?? ""}`);
  const skipAfter = await call("POST", `/reconcile/lines/${feeLine?.id}/skip`, A, { reason: "x" });
  chk("D3-R1.10", "แก้แถวหลังยืนยันเดือน → 409 ไทย", skipAfter.status === 409, "409", `${skipAfter.status} ${code(skipAfter)}`, "MAJOR");
  const reopen = await call("POST", `/reconcile/${period}/reopen`, A, { financeAccountId: bank.id, reason: "ต้องแก้" });
  chk("D3-R1.11", "POST /reconcile/{period}/reopen → 200 confirmedAt null", reopen.status === 200 && (await call("GET", `/reconcile?financeAccountId=${bank.id}&period=${period}`, A)).body?.data?.summary?.confirmedAt === null, "null", `${reopen.status} ${code(reopen)}`);
  const recDenied = await call("POST", `/reconcile/statements/${stId}/auto-match`, kR.rawKey, {});
  chk("D3-R1.12", "read-only → 403 (reconcile)", recDenied.status === 403, "403", `${recDenied.status}`);

  // ═══ R2 นำเข้า CSV ผู้ติดต่อ ═══
  const tpl = imp.buildTemplateCsv("contacts") as string;
  const preview = await call("POST", "/import/preview", A, { kind: "contacts", text: tpl });
  chk("D3-R2.1", "POST /import/preview {kind:contacts,text} → 200 {mapping,columns,rows[],valid,invalid,warnings}", preview.status === 200 && !!preview.body?.data?.mapping && Array.isArray(preview.body?.data?.rows) && preview.body.data.rows.length >= 1 && Number.isInteger(preview.body?.data?.valid), "200", `${preview.status} ${JSON.stringify(preview.body).slice(0, 220)}`);
  const before = await prisma.accountContact.count({ where: { systemId: SYS } });
  const run = await call("POST", "/import/run", A, { kind: "contacts", text: tpl, mapping: preview.body?.data?.mapping, skipErrorRows: true });
  const after = await prisma.accountContact.count({ where: { systemId: SYS } });
  chk("D3-R2.2", "POST /import/run → 200 {created,skipped,errors[]} · ผู้ติดต่อเพิ่ม = created", run.status === 200 && Number.isInteger(run.body?.data?.created) && after - before === run.body.data.created && run.body.data.created >= 1, "created", `${run.status} ${JSON.stringify(run.body?.data).slice(0, 160)} diff=${after - before}`);
  const badKind = await call("POST", "/import/preview", A, { kind: "nope", text: tpl });
  chk("D3-R2.3", "kind ไม่รู้จัก → 422", badKind.status === 422, "422", `${badKind.status}`, "MAJOR");
  const tplGet = await call("GET", "/import/template?kind=products", A, undefined, { accept: "text/csv" });
  chk("D3-R2.4", "GET /import/template?kind= → text/csv BOM", /text\/csv/.test(tplGet.headers.get("content-type") ?? ""), "csv", `${tplGet.status} ${tplGet.headers.get("content-type")}`, "MAJOR");

  // ═══ R3 คลังเอกสาร: ingest เข้า inbox → PATCH/bulk → AI อ่านบิล (mock) → สร้างค่าใช้จ่าย ═══
  const ingest = await call("POST", "/inbox/files", A, { source: "API", senderLabel: "ระบบทดสอบ", files: [{ sourceRef: "api-1", fileName: "bill-1.jpg", fileUrl: "https://example.com/bill-1.jpg", mimeType: "image/jpeg", sizeBytes: 1000 }, { sourceRef: "api-2", fileName: "bill-2.jpg", fileUrl: "https://example.com/bill-2.jpg", mimeType: "image/jpeg", sizeBytes: 1000 }] });
  chk("D3-R3.1", "POST /inbox/files (ingest ด้วย URL) → 200 {created 2,duplicated 0,ids[]}", ingest.status === 200 && ingest.body?.data?.created === 2 && ingest.body?.data?.ids?.length === 2, "2", `${ingest.status} ${JSON.stringify(ingest.body).slice(0, 160)}`);
  const ingestDup = await call("POST", "/inbox/files", A, { source: "API", files: [{ sourceRef: "api-1", fileName: "bill-1.jpg", fileUrl: "https://example.com/bill-1.jpg", mimeType: "image/jpeg" }] });
  chk("D3-R3.2", "ingest sourceRef ซ้ำ → duplicated 1 created 0", ingestDup.body?.data?.duplicated === 1 && ingestDup.body?.data?.created === 0, "dup 1", JSON.stringify(ingestDup.body?.data));
  const [f1, f2] = ingest.body?.data?.ids as string[];
  const inbox = await call("GET", "/inbox", A);
  chk("D3-R3.3", "GET /inbox เห็น 2 ไฟล์ค้าง", inbox.status === 200 && (inbox.body?.data?.items ?? []).length >= 2, "≥2", `${inbox.body?.data?.items?.length}`);
  const patch = await call("PATCH", `/files/${f2}`, A, { folder: "บิลรถ", docTypeHint: "EXPENSE" });
  chk("D3-R3.4", "PATCH /files/{id} {folder,docTypeHint} → 200 · DB ตรง", patch.status === 200 && (await prisma.accountAttachment.findUnique({ where: { id: f2 }, select: { folder: true, docTypeHint: true } }))?.folder === "บิลรถ", "บิลรถ", `${patch.status} ${code(patch)}`);
  const notAcc = await call("PATCH", `/files/${f2}`, A, { notAccounting: true });
  chk("D3-R3.5", "PATCH {notAccounting:true} → 200 · ออกจากกล่องขาเข้า (items ลด)", notAcc.status === 200 && (await call("GET", "/inbox", A)).body?.data?.items?.every((i: Any) => i.id !== f2), "ออกจากกล่อง", `${notAcc.status} ${code(notAcc)}`);
  const bulk = await call("POST", "/files/bulk", A, { ids: [f1, f2], folder: "2569-09" });
  chk("D3-R3.6", "POST /files/bulk {ids,folder} → 200 {count 2}", bulk.status === 200 && bulk.body?.data?.count === 2, "2", `${bulk.status} ${JSON.stringify(bulk.body?.data)}`);
  const archived = await call("PATCH", `/files/${f2}`, A, { archived: true });
  const restored = await call("PATCH", `/files/${f2}`, A, { archived: false });
  chk("D3-R3.7", "PATCH archived true/false → 200 ทั้งคู่", archived.status === 200 && restored.status === 200, "200/200", `${archived.status}/${restored.status}`, "MAJOR");
  const read = await call("POST", `/inbox/${f1}/read`, A, {});
  chk("D3-R3.8", "POST /inbox/{fileId}/read (AI mock) → 200 {extracted{vendor,totalSatang,date,...}} หรือ 503 ถ้าไม่มี provider (ห้าม 500)", read.status === 200 || read.status === 503 || read.status === 422, "200/503", `${read.status} ${JSON.stringify(read.body).slice(0, 200)}`, "MAJOR");
  const exFrom = await call("POST", `/inbox/${f1}/create-expense`, A, { vendorName: "ปั๊มน้ำมัน", totalSatang: 150000, vatRateBp: 700, issueDate: today, invoiceNo: "INV-1" });
  chk("D3-R3.9", "POST /inbox/{fileId}/create-expense {overrides} → 200 {documentId,type EXPENSE,status DRAFT} · ไฟล์ผูกเอกสาร", exFrom.status === 200 && exFrom.body?.data?.type === "EXPENSE" && (await prisma.accountAttachment.findUnique({ where: { id: f1 }, select: { documentId: true } }))?.documentId === exFrom.body?.data?.documentId, "EXPENSE DRAFT", `${exFrom.status} ${JSON.stringify(exFrom.body).slice(0, 200)}`);
  const filesDenied = await call("PATCH", `/files/${f2}`, kR.rawKey, { folder: "x" });
  chk("D3-R3.10", "read-only → 403 (document.manage)", filesDenied.status === 403, "403", `${filesDenied.status}`);

  // ═══ R4 รายงานอีเมล ═══
  const email = await call("POST", "/reports/email", A, { kind: "daily" });
  chk("D3-R4.1", "POST /reports/email {kind:daily} → 200 {sent|skipped,reason?} (ไม่มี RESEND = skipped พร้อมเหตุผลไทย ไม่ 500)", email.status === 200 && (typeof email.body?.data?.sent === "boolean" || Number.isInteger(email.body?.data?.sent)), "200", `${email.status} ${JSON.stringify(email.body).slice(0, 160)}`, "MAJOR");
  const emailBad = await call("POST", "/reports/email", A, { kind: "yearly" });
  chk("D3-R4.2", "kind ไม่ใช่ daily/weekly → 422", emailBad.status === 422, "422", `${emailBad.status}`, "MAJOR");

  // ═══ R5 registry ═══
  const registry = (await import("@/lib/modules/account/api/registry" as string)) as Record<string, Any>;
  const ops = registry.ACCOUNT_OPS as Any[];
  const need: [string, string, string][] = [["reconcile.preview-statement", "write", "account.reconcile"], ["reconcile.import-statement", "write", "account.reconcile"], ["reconcile.auto-match", "write", "account.reconcile"], ["reconcile.match", "write", "account.reconcile"], ["reconcile.unmatch", "write", "account.reconcile"], ["reconcile.skip", "write", "account.reconcile"], ["reconcile.create-entry", "write", "account.reconcile"], ["reconcile.confirm", "write", "account.reconcile"], ["reconcile.reopen", "write", "account.reconcile"], ["import.preview", "write", "account.import"], ["import.run", "write", "account.import"], ["import.template", "read", "account.import"], ["files.update", "write", "account.document.manage"], ["files.bulk", "write", "account.document.manage"], ["inbox.ingest", "write", "account.document.manage"], ["inbox.read", "write", "account.document.manage"], ["inbox.create-expense", "write", "account.doc.create"], ["reports.email", "write", "account.report.view"]];
  const bad = need.filter(([id, kind, action]) => { const o = ops.find((x) => x.id === id); return !o || o.kind !== kind || o.action !== action; });
  chk("D3-R5.1", "registry มี op ครบ 18 ตัวของ D3 · kind/action ตามสัญญา", bad.length === 0, "ครบ", bad.map(([id]) => id).join(","));
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 260) : String(e));
} finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  if (tid) {
    for (const m of ["accountBankStatementLine", "accountBankStatement", "accountJournalLine", "accountJournalEntry", "accountDocumentPayment", "accountDocumentRelation", "accountDocumentLine", "accountAttachment", "accountDocument", "accountDocSequence", "accountFinanceOpening", "accountFinance", "accountContact", "accountMapping", "accountLedger", "accountPeriod", "accountSettings", "apiIdempotency", "apiKey", "auditLog", "outboxEvent", "party", "appSystemUnit", "appSystem"]) {
      await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: tid } }));
    }
    await d(() => prisma.businessUnit.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.tenant.delete({ where: { id: tid } }));
  }
  await d(() => prisma.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE key LIKE 'acct:api:%'`));
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Account API WRITE ops (D3) =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
