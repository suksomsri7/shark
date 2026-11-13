// QC — API บัญชี ACC T2c (เลน 1): T2.1 คำเตือนใบกำกับเต็มรูป · T2.4 คืน/ริบมัดจำ · T2c A6 ใบเสร็จอัตโนมัติ · T2.9 ผู้ขายที่ตรึง
// test id ของ op: documents.legal-warnings = "T2.1-B7" · documents.deposit-settlement = "T2.4-D8" · documents.forfeit-deposit = "T2.4-D9" (ด่าน OA-5.2)
//   (documents.refund-deposit = "C2-P5.4" อยู่ใน qc-account-api-write-payments — ที่นี่ตรวจรูปผลใหม่: creditNote + warnings)
// 🔴 tenant ใหม่ของตัวเอง · ลบทิ้งใน finally
// รัน: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-account-api-t2c.mts
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-account-api-t2c");
const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
const idem = () => ({ "idempotency-key": `t2c-${Date.now()}-${Math.random().toString(16).slice(2)}` });
const j = (v: unknown) => JSON.stringify(v)?.slice(0, 400) ?? "";

let tid = "";
try {
  const acc = (await import("@/lib/modules/account/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const gl = (await import("@/lib/modules/account/gl" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const fin = (await import("@/lib/modules/account/finance" as string)) as Any;
  const ak = (await import("@/lib/api-keys/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const scopes = (await import("@/lib/api-keys/scopes" as string)) as Record<string, Any>;
  const route = (await import("@/app/api/v1/account/[...path]/route" as string)) as Record<string, (req: Request, ctx: { params: Promise<{ path: string[] }> }) => Promise<Response>>;
  const skills = (await import("@/lib/ai/skills" as string)) as Any;

  const stamp = Date.now();
  const t = await prisma.tenant.create({ data: { name: "QC API T2c", slug: `qc-api-t2c-${stamp}` } });
  tid = t.id;
  const owner = await prisma.user.create({ data: { email: `qc-at2c-${stamp}@qc.local`, name: "เจ้าของ API T2c" } });
  await prisma.membership.create({ data: { userId: owner.id, tenantId: tid, role: "OWNER", unitAccess: ["*"], acceptedAt: new Date() } });
  const SYS = (await sys.createSystem(tid, "ACCOUNT", "บัญชี API T2c")).id;
  await acc.saveSettings(tid, SYS, { orgName: "ร้าน API T2c", vatRegistered: true, vatRateBp: 700, taxId: "0105561000002", address: "2 ถ.API" });
  await gl.ensureAccounting({ tenantId: tid, systemId: SYS });
  const bank = await fin.createFinanceAccount({ tenantId: tid, systemId: SYS, type: "BANK", name: "ออมทรัพย์", bankName: "กสิกรไทย" });
  const kW = await ak.createApiKey({ tenantId: tid }, "T2c write", { scopes: scopes.expandBundles(["accountant"]), systemId: SYS });
  const kR = await ak.createApiKey({ tenantId: tid }, "T2c read", { scopes: scopes.expandBundles(["read-only"]), systemId: SYS });
  const kO = await ak.createApiKey({ tenantId: tid }, "T2c owner", { scopes: [...scopes.expandBundles(["accountant"]), "account.doc.void", "account.settings.manage"], systemId: SYS });
  const call = async (method: string, path: string, key: string, body?: unknown) => {
    const headers: Record<string, string> = { authorization: `Bearer ${key}`, ...(method === "GET" ? {} : idem()) };
    let b: string | undefined;
    if (body !== undefined) { b = JSON.stringify(body); headers["content-type"] = "application/json"; }
    const req = new Request(`http://x/api/v1/account${path}`, { method, headers, body: b });
    const segs = path.split("?")[0]!.split("/").filter(Boolean);
    const res = await route[method]!(req, { params: Promise.resolve({ path: segs }) });
    const text = await res.text();
    let parsed: Any = null; try { parsed = JSON.parse(text); } catch { parsed = { _raw: text }; }
    return { status: res.status, body: parsed };
  };
  const W = kW.rawKey;
  const R = kR.rawKey;
  const O = kO.rawKey;
  const noAddr = await acc.createContact({ tenantId: tid, systemId: SYS, kind: "CUSTOMER", legalType: "COMPANY", name: "บริษัท ไม่มีที่อยู่ API", taxId: "0105561999002", branchCode: "00000" });

  // ── T2.1-B7 documents.legal-warnings ──
  const ti = await acc.createDocument({ tenantId: tid, systemId: SYS, docType: "TAX_INVOICE", contactId: noAddr.id, vatMode: "EXCLUDE", issueDate: new Date("2026-09-01T05:00:00Z"), lines: [{ description: "ค่าบริการ", qty: 1, unitPrice: 100_000, vatRateBp: 700, lineKind: "SERVICE" }], createdById: owner.id });
  const lw = await call("GET", `/documents/${ti.id}/legal-warnings`, R);
  const w = (lw.body?.data?.warnings ?? []) as Any[];
  chk("T2.1-B7", "GET /documents/{id}/legal-warnings: ใบกำกับไม่มีที่อยู่ผู้ซื้อ ⇒ TAX_INVOICE_BUYER_ADDRESS_MISSING (tag V · needsAcknowledge false · citation ม.86/4(3))", lw.status === 200 && w.some((x) => x.code === "TAX_INVOICE_BUYER_ADDRESS_MISSING" && x.tag === "V" && x.needsAcknowledge === false && /86\/4/.test(x.citation)), "200 + code", `${lw.status} ${j(lw.body)}`);
  const lw404 = await call("GET", `/documents/nope/legal-warnings`, R);
  chk("T2.1-B7b", "id ของร้านอื่น/ไม่มี ⇒ 404", lw404.status === 404, "404", String(lw404.status), "MAJOR");

  // ── T2.4 มัดจำ ──
  const dep = await acc.createDocument({ tenantId: tid, systemId: SYS, docType: "DEPOSIT_RECEIPT", contactId: noAddr.id, vatMode: "EXCLUDE", issueDate: new Date("2026-09-02T05:00:00Z"), lines: [{ description: "มัดจำ API", qty: 1, unitPrice: 100_000, vatRateBp: 700 }], createdById: owner.id });
  await acc.issueDocument(tid, SYS, dep.id);
  await acc.recordPayment(tid, SYS, dep.id, { paidAt: new Date("2026-09-02T05:00:00Z"), financeAccountId: bank.id, channel: "TRANSFER", amount: 107_000, createdById: owner.id, idempotencyKey: `api-dep-${stamp}` });
  const st = await call("GET", `/documents/${dep.id}/deposit-settlement`, R);
  chk("T2.4-D8", "GET /documents/{id}/deposit-settlement: remainingSatang 107000 · vatSatang 7000 · creditNoteOnRefund true · forfeitMode KEEP_VAT · refundWarnings DEPOSIT_REFUND_CREDIT_NOTE", st.status === 200 && st.body?.data?.remainingSatang === 107_000 && st.body.data.vatSatang === 7_000 && st.body.data.creditNoteOnRefund === true && st.body.data.forfeitMode === "KEEP_VAT" && st.body.data.refundWarnings?.[0]?.code === "DEPOSIT_REFUND_CREDIT_NOTE", "200", `${st.status} ${j(st.body)}`);
  const rf = await call("POST", `/documents/${dep.id}/refund-deposit`, O, { reason: "ลูกค้ายกเลิก API", date: "2026-10-05", confirm: true });
  chk("C2-P5.4b", "POST /documents/{id}/refund-deposit (มีใบกำกับ): 200 · refundedSatang 107000 · creditNote{id,docNo} · warnings DEPOSIT_REFUND_CREDIT_NOTE · status DEDUCTED", rf.status === 200 && rf.body?.data?.refundedSatang === 107_000 && !!rf.body.data.creditNote?.docNo && rf.body.data.warnings?.[0]?.code === "DEPOSIT_REFUND_CREDIT_NOTE" && rf.body.data.status === "DEDUCTED", "200", `${rf.status} ${j(rf.body)}`);
  const cnId = rf.body?.data?.creditNote?.id;
  const cn = cnId ? await prisma.accountDocument.findUnique({ where: { id: cnId } }) : null;
  chk("C2-P5.4c", "ใบลดหนี้ลงวันที่ที่ส่ง (2026-10-05) · เหตุ CN_DEPOSIT_REFUND", !!cn && cn.issueDate.toISOString().slice(0, 10) === "2026-10-05" && cn.adjustReasonCode === "CN_DEPOSIT_REFUND", "2026-10-05", j(cn && [cn.issueDate, cn.adjustReasonCode]), "MAJOR");

  const dep2 = await acc.createDocument({ tenantId: tid, systemId: SYS, docType: "DEPOSIT_RECEIPT", contactId: noAddr.id, vatMode: "EXCLUDE", issueDate: new Date("2026-09-03T05:00:00Z"), lines: [{ description: "มัดจำ API 2", qty: 1, unitPrice: 50_000, vatRateBp: 700 }], createdById: owner.id });
  await acc.issueDocument(tid, SYS, dep2.id);
  await acc.recordPayment(tid, SYS, dep2.id, { paidAt: new Date("2026-09-03T05:00:00Z"), financeAccountId: bank.id, channel: "TRANSFER", amount: 53_500, createdById: owner.id, idempotencyKey: `api-dep2-${stamp}` });
  const ff0 = await call("POST", `/documents/${dep2.id}/forfeit-deposit`, O, { reason: "ลูกค้าไม่มา API" });
  const ff = await call("POST", `/documents/${dep2.id}/forfeit-deposit`, O, { reason: "ลูกค้าไม่มา API", date: "2026-09-25", confirm: true });
  chk("T2.4-D9", "POST /documents/{id}/forfeit-deposit: ไม่ส่ง confirm = 409 confirm_required · ส่งแล้ว 200 forfeitedSatang 53500 · mode KEEP_VAT · creditNote null · warnings DEPOSIT_FORFEIT_VAT (tag U)", ff0.status === 409 && ff.status === 200 && ff.body?.data?.forfeitedSatang === 53_500 && ff.body.data.mode === "KEEP_VAT" && ff.body.data.creditNote === null && ff.body.data.warnings?.[0]?.code === "DEPOSIT_FORFEIT_VAT" && ff.body.data.warnings[0].tag === "U", "409 → 200", `${ff0.status} ${ff.status} ${j(ff.body)}`);
  const ffR = await call("POST", `/documents/${dep2.id}/forfeit-deposit`, R, { reason: "อ่านอย่างเดียว", confirm: true });
  chk("T2.4-D9b", "คีย์อ่านอย่างเดียว ⇒ 403", ffR.status === 403, "403", String(ffR.status), "MAJOR");

  // ── T2c A6 settings.documents.update ──
  const s0 = await call("PATCH", `/settings/documents/INVOICE`, O, { autoReceiptOnPayment: false });
  chk("D4-S2.1b", "PATCH /settings/documents: ปิดใบเสร็จอัตโนมัติ ไม่ส่ง acknowledge ⇒ 409 legal_ack_required + RECEIPT_AUTO_OFF", s0.status === 409 && s0.body?.error?.code === "legal_ack_required" && (s0.body.error.warnings ?? []).some((x: Any) => x.code === "RECEIPT_AUTO_OFF"), "409", `${s0.status} ${j(s0.body)}`);
  const s1 = await call("PATCH", `/settings/documents/INVOICE`, O, { autoReceiptOnPayment: false, depositForfeit: "CREDIT_NOTE", depositTaxInvoiceOnReceipt: false, acknowledge: ["RECEIPT_AUTO_OFF"] });
  const ds = (await import("@/lib/modules/account/doc-settings" as string)) as Any;
  const after = await ds.getDocSettings({ tenantId: tid, systemId: SYS });
  chk("D4-S2.1c", "ส่ง acknowledge ⇒ 200 · receipt.autoOnPayment false · deposit.forfeit CREDIT_NOTE · depositOnReceipt false", s1.status === 200 && after.receipt.autoOnPayment === false && after.deposit.forfeit === "CREDIT_NOTE" && after.autoTaxInvoice.depositOnReceipt === false, "200", `${s1.status} ${j(s1.body)} ${j([after.receipt, after.deposit, after.autoTaxInvoice.depositOnReceipt])}`);

  // ── T2.9 documents.get → seller ──
  await acc.issueDocument(tid, SYS, ti.id);
  const g = await call("GET", `/documents/${ti.id}`, R);
  chk("B1-D3.1b", "GET /documents/{id}: seller ที่ตรึงตอนออก (name · taxId · frozenVia ISSUE)", g.status === 200 && g.body?.data?.seller?.name === "ร้าน API T2c" && g.body.data.seller.taxId === "0105561000002" && g.body.data.seller.frozenVia === "ISSUE", "seller", `${g.status} ${j(g.body?.data?.seller)}`, "MAJOR");

  // ── AI tools ──
  const tools = (skills.SKILLS as Any[]).flatMap((s) => s.tools as string[]);
  const want = ["account_document_legal_warnings", "account_deposit_settlement", "account_refund_deposit", "account_forfeit_deposit"];
  chk("AI-T2c", "เครื่องมือเลขา 4 ตัวลงทะเบียนในทักษะเดียว (ไม่ซ้ำ)", want.every((n) => tools.filter((x) => x === n).length === 1), "1 ครั้ง/ตัว", j(want.map((n) => [n, tools.filter((x) => x === n).length])));
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? `${e.message.slice(0, 260)} ${e.stack?.split("\n").slice(1, 3).join(" ")}` : String(e));
} finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  if (tid) {
    const P = prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown>; updateMany: (a: unknown) => Promise<unknown> }>;
    await d(() => P.accountJournalLine.deleteMany({ where: { tenantId: tid } }));
    await d(() => P.accountJournalEntry.updateMany({ where: { tenantId: tid }, data: { reversalOfId: null } }));
    await d(() => P.accountJournalEntry.deleteMany({ where: { tenantId: tid } }));
    await d(() => P.accountDocumentRelation.deleteMany({ where: { tenantId: tid } }));
    await d(() => P.accountDocumentLine.deleteMany({ where: { tenantId: tid } }));
    await d(() => P.accountDocumentPayment.deleteMany({ where: { tenantId: tid } }));
    await d(() => P.accountDocument.updateMany({ where: { tenantId: tid }, data: { sourceDocId: null, replacedById: null, sourcePaymentId: null } }));
    for (const m of ["accountDocumentPrint", "accountDocument", "settingChange", "settingValue", "accountDocSequence", "accountContact", "accountFinance", "accountMapping", "accountPeriod", "accountSettings", "apiIdempotency", "apiKey", "auditLog", "outboxEvent", "membership", "appSystemUnit"]) {
      await d(() => P[m].deleteMany({ where: { tenantId: tid } }));
    }
    await d(() => P.accountLedger.updateMany({ where: { tenantId: tid }, data: { parentId: null } }));
    await d(() => P.accountLedger.deleteMany({ where: { tenantId: tid } }));
    await d(() => P.appSystem.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.businessUnit.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.tenant.delete({ where: { id: tid } }));
    await d(() => prisma.user.deleteMany({ where: { email: { contains: "@qc.local" }, name: { in: ["เจ้าของ API T2c"] } } }));
  }
  await d(() => prisma.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE key LIKE 'acct:api:%'`));
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Account API T2c (เลน 1) =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.length > 0 ? 1 : 0);
