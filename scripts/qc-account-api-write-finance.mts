// QC — API บัญชี WO D1: WRITE การเงิน — ช่องทาง/ยอดยกมา/โอน/เงินสดย่อย · เช็ค lifecycle · WHT ออก 50 ทวิ/ยื่น/ยกเลิกยื่น
// Fable oracle · Builder ห้ามแตะ · สัญญาอยู่ที่ ledger/ACCOUNT-API-RUN.md §D1
// 🔴 tenant ใหม่ของตัวเอง · ลบทิ้งใน finally
// ⚠️ standalone-typesafe: dynamic import + wide cast
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-account-api-write-finance");
// ⏭️ WO ยังไม่สร้าง → ข้ามแบบเห็นชัด (exit 0) ไม่ทำ qc:all/CI แดงค้าง (บทเรียน WO 0.7) — ด่านนี้หายไปเองเมื่อ WO ลงจริง
if (!((await import("@/lib/modules/account/api/registry" as string)) as { ACCOUNT_OPS: { id: string }[] }).ACCOUNT_OPS.some((o) => o.id === "finance-accounts.create")) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (finance-accounts.create)");
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
const idem = () => ({ "idempotency-key": `d1-${Date.now()}-${Math.random().toString(16).slice(2)}` });
const ymd = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(d);

let tid = "";
try {
  const acc = (await import("@/lib/modules/account/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const gl = (await import("@/lib/modules/account/gl" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const fin = (await import("@/lib/modules/account/finance" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const exp = (await import("@/lib/modules/account/expense" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const ak = (await import("@/lib/api-keys/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const scopes = (await import("@/lib/api-keys/scopes" as string)) as Record<string, Any>;
  const route = (await import("@/app/api/v1/account/[...path]/route" as string)) as Record<string, (req: Request, ctx: { params: Promise<{ path: string[] }> }) => Promise<Response>>;

  const t = await prisma.tenant.create({ data: { name: "QC API D1", slug: `qc-api-d1-${Date.now()}` } });
  tid = t.id;
  const s = await sys.createSystem(tid, "ACCOUNT", "บัญชี D1");
  const SYS = s.id;
  await acc.saveSettings(tid, SYS, { orgName: "ร้าน D1", taxId: "0105561000008", vatRegistered: true, vatRateBp: 700, taxPointBasis: "ON_ISSUE" });
  await gl.ensureAccounting({ tenantId: tid, systemId: SYS });
  const vendor = await acc.createContact({ tenantId: tid, systemId: SYS, kind: "VENDOR", legalType: "COMPANY", name: "บริษัท ผู้ขาย ดีวัน จำกัด", taxId: "0105561000009" });
  const customer = await acc.createContact({ tenantId: tid, systemId: SYS, kind: "CUSTOMER", name: "ลูกค้า ดีวัน" });
  const expenseLedger = await prisma.accountLedger.findFirst({ where: { systemId: SYS, type: "EXPENSE" }, orderBy: { code: "asc" }, select: { id: true } });
  const acct = scopes.expandBundles(["accountant"]) as string[];
  const kA = await ak.createApiKey({ tenantId: tid }, "D1 accountant", { scopes: acct, systemId: SYS });
  const kD = await ak.createApiKey({ tenantId: tid }, "D1 danger", { scopes: [...acct, "account.cheque.void", "account.wht.unmark"], systemId: SYS });
  const kR = await ak.createApiKey({ tenantId: tid }, "D1 read", { scopes: scopes.expandBundles(["read-only"]), systemId: SYS });

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
  const D = kD.rawKey;
  const code = (r: Any) => r.body?.error?.code;
  const balanceOf = async (id: string) => ((await fin.financeBalances(tid, SYS)) as Any[]).find((b) => b.id === id)?.balance as number;
  const today = ymd();

  // ═══ F1 ช่องทางการเงิน ═══
  const cash = await call("POST", "/finance-accounts", A, { type: "CASH", name: "เงินสดหน้าร้าน", openingSatang: 500000, openingDate: today });
  const cashId = cash.body?.data?.id as string;
  chk("D1-F1.1", "POST /finance-accounts CASH + ยอดยกมา → 200 {id,code CSH…,balanceSatang 500,000,ledgerAccountCode}", cash.status === 200 && /^CSH/.test(cash.body?.data?.code ?? "") && cash.body?.data?.balanceSatang === 500000 && typeof cash.body?.data?.ledgerAccountCode === "string", "200", `${cash.status} ${JSON.stringify(cash.body).slice(0, 200)}`);
  const bank = await call("POST", "/finance-accounts", A, { type: "BANK", name: "กสิกร ออมทรัพย์", bankSubtype: "SAVINGS", bankName: "KBANK", accountNo: "0123456789", promptpayId: "0105561000008", useForReceive: true });
  const bankId = bank.body?.data?.id as string;
  chk("D1-F1.2", "POST BANK → 200 code BSV…", bank.status === 200 && /^BSV/.test(bank.body?.data?.code ?? ""), "BSV", `${bank.status} ${bank.body?.data?.code}`);
  const petty = await call("POST", "/finance-accounts", A, { type: "PETTY_CASH", name: "เงินสดย่อย", limitSatang: 300000 });
  const pettyId = petty.body?.data?.id as string;
  chk("D1-F1.3", "POST PETTY_CASH → 200 code PTY…", petty.status === 200 && /^PTY/.test(petty.body?.data?.code ?? ""), "PTY", `${petty.status} ${petty.body?.data?.code}`);
  const badType = await call("POST", "/finance-accounts", A, { type: "CRYPTO", name: "x" });
  chk("D1-F1.4", "type ไม่รู้จัก → 422", badType.status === 422, "422", `${badType.status}`);
  const readDenied = await call("POST", "/finance-accounts", kR.rawKey, { type: "CASH", name: "x" });
  chk("D1-F1.5", "read-only → 403", readDenied.status === 403, "403", `${readDenied.status}`);
  const upd = await call("PATCH", `/finance-accounts/${bankId}`, A, { accountName: "บจก. ร้าน D1", useForPay: true });
  chk("D1-F1.6", "PATCH → 200 accountName ใหม่", upd.status === 200 && upd.body?.data?.accountName === "บจก. ร้าน D1", "ใหม่", `${upd.status} ${JSON.stringify(upd.body?.data).slice(0, 160)}`);
  const open2 = await call("POST", `/finance-accounts/${bankId}/opening`, A, { date: today, amountSatang: 1_000_000, note: "ยอดยกมา" });
  chk("D1-F1.7", "POST /finance-accounts/{id}/opening → 200 {seq} · ยอดธนาคาร 1,000,000 · JV ยอดยกมาโพสต์", open2.status === 200 && Number.isInteger(open2.body?.data?.seq) && (await balanceOf(bankId)) === 1_000_000, "1000000", `${open2.status} ${await balanceOf(bankId)}`);
  const tr = await call("POST", "/finance-transfers", A, { fromId: bankId, toId: cashId, amountSatang: 200_000, date: today, note: "ถอนมาใช้" });
  chk("D1-F1.8", "POST /finance-transfers → 200 {transferId} · ธนาคาร 800,000 · เงินสด 700,000", tr.status === 200 && typeof tr.body?.data?.transferId === "string" && (await balanceOf(bankId)) === 800_000 && (await balanceOf(cashId)) === 700_000, "800000/700000", `${tr.status} ${await balanceOf(bankId)}/${await balanceOf(cashId)}`);
  const k1 = idem();
  await call("POST", "/finance-transfers", A, { fromId: bankId, toId: cashId, amountSatang: 100_000 }, k1);
  await call("POST", "/finance-transfers", A, { fromId: bankId, toId: cashId, amountSatang: 100_000 }, k1);
  chk("D1-F1.9", "โอนซ้ำ Idempotency-Key เดิม → โอนครั้งเดียว (ธนาคาร 700,000)", (await balanceOf(bankId)) === 700_000, "700000", `${await balanceOf(bankId)}`);
  const trOver = await call("POST", "/finance-transfers", A, { fromId: cashId, toId: bankId, amountSatang: 99_000_000 });
  chk("D1-F1.10", "โอนเกินยอด → 409/422 ไทย (หรือ 200 ถ้า service ยอมติดลบ — ต้องบอกใน wo-notes)", trOver.status === 409 || trOver.status === 422 || trOver.status === 200, "409/422", `${trOver.status} ${code(trOver)}`, "MINOR");
  const trSame = await call("POST", "/finance-transfers", A, { fromId: cashId, toId: cashId, amountSatang: 1000 });
  chk("D1-F1.11", "โอนเข้าบัญชีเดียวกัน → 422", trSame.status === 422, "422", `${trSame.status}`, "MAJOR");
  const top = await call("POST", "/petty-cash/top-up", A, { pettyId, sourceFinanceAccountId: bankId, amountSatang: 300_000, date: today });
  chk("D1-F1.12", "POST /petty-cash/top-up → 200 · เงินสดย่อย 300,000 · ธนาคาร 400,000", top.status === 200 && (await balanceOf(pettyId)) === 300_000 && (await balanceOf(bankId)) === 400_000, "300000/400000", `${top.status} ${await balanceOf(pettyId)}/${await balanceOf(bankId)}`);
  // ค่าใช้จ่ายจ่ายจากเงินสดย่อย แล้วเบิกชดเชย
  const ex = await exp.createExpenseDoc({ tenantId: tid, systemId: SYS, docType: "EXPENSE", contactId: vendor.id, issueDate: new Date(), vatMode: "NONE", lines: [{ description: "ค่าแท็กซี่", qty: 1, unitPrice: 20_000, vatRateBp: -1, accountId: expenseLedger?.id }] });
  await exp.issueExpenseDoc(tid, SYS, ex.id);
  const payPetty = await call("POST", "/payments", A, { documentId: ex.id, rows: [{ paidAt: today, financeAccountId: pettyId, amountSatang: 20_000 }] });
  const reimb = await call("POST", "/petty-cash/reimburse", A, { paymentId: payPetty.body?.data?.payments?.[0], sourceFinanceAccountId: bankId, date: today });
  chk("D1-F1.13", "จ่ายจากเงินสดย่อย 20,000 แล้ว POST /petty-cash/reimburse → 200 · เงินสดย่อยกลับ 300,000", payPetty.status === 200 && reimb.status === 200 && (await balanceOf(pettyId)) === 300_000, "300000", `${payPetty.status}/${reimb.status} ${await balanceOf(pettyId)}`);
  const arch = await call("DELETE", `/finance-accounts/${cashId}`, A);
  chk("D1-F1.14", "DELETE ช่องทางที่มียอด → 409 ไทย (service กัน) หรือ 200 archived", arch.status === 409 || arch.status === 200, "409/200", `${arch.status} ${code(arch)}`, "MINOR");

  // ═══ F2 เช็ค ═══
  const chq = await call("POST", "/cheques", A, { direction: "IN", chequeNo: "1234567", bankName: "SCB", bankBranch: "ป่าตอง", chequeDate: today, amountSatang: 150_000, financeAccountId: bankId, note: "เช็คลูกค้า" });
  const chqId = chq.body?.data?.id as string;
  chk("D1-F2.1", "POST /cheques IN → 200 {id,direction,chequeNo,status ON_HAND,amountSatang}", chq.status === 200 && chq.body?.data?.status === "ON_HAND" && chq.body?.data?.amountSatang === 150_000, "ON_HAND", `${chq.status} ${JSON.stringify(chq.body?.data).slice(0, 160)}`);
  const chqBad = await call("POST", "/cheques", A, { direction: "IN", chequeNo: "", bankName: "SCB", chequeDate: today, amountSatang: 100 });
  chk("D1-F2.2", "เลขที่เช็คว่าง → 422", chqBad.status === 422, "422", `${chqBad.status}`);
  const clearEarly = await call("POST", `/cheques/${chqId}/clear`, A, {});
  chk("D1-F2.3", "clear ก่อน deposit → 409 state_conflict", clearEarly.status === 409, "409", `${clearEarly.status} ${code(clearEarly)}`, "MAJOR");
  const dep = await call("POST", `/cheques/${chqId}/deposit`, A, { depositedAt: today });
  chk("D1-F2.4", "POST /deposit → 200 status DEPOSITED", dep.status === 200 && dep.body?.data?.status === "DEPOSITED", "DEPOSITED", `${dep.status} ${dep.body?.data?.status}`);
  const clr = await call("POST", `/cheques/${chqId}/clear`, A, { clearedDate: today });
  chk("D1-F2.5", "POST /clear → 200 status CLEARED · มี JV ของเช็ค", clr.status === 200 && clr.body?.data?.status === "CLEARED" && (await prisma.accountJournalEntry.count({ where: { systemId: SYS, refId: chqId } })) >= 1, "CLEARED + JV", `${clr.status} ${clr.body?.data?.status}`);
  const bounceCleared = await call("POST", `/cheques/${chqId}/bounce`, A, { reason: "x" });
  chk("D1-F2.6", "bounce เช็คที่ CLEARED → 409", bounceCleared.status === 409, "409", `${bounceCleared.status}`, "MAJOR");
  const chq2 = await call("POST", "/cheques", A, { direction: "IN", chequeNo: "7654321", bankName: "BBL", chequeDate: today, amountSatang: 90_000, financeAccountId: bankId });
  await call("POST", `/cheques/${chq2.body?.data?.id}/deposit`, A, {});
  const bounced = await call("POST", `/cheques/${chq2.body?.data?.id}/bounce`, A, { reason: "เงินไม่พอ" });
  chk("D1-F2.7", "POST /bounce → 200 status BOUNCED", bounced.status === 200 && bounced.body?.data?.status === "BOUNCED", "BOUNCED", `${bounced.status} ${bounced.body?.data?.status}`);
  const chq3 = await call("POST", "/cheques", A, { direction: "OUT", chequeNo: "0001", bankName: "KBANK", chequeDate: today, amountSatang: 30_000, financeAccountId: bankId });
  const voidNo = await call("POST", `/cheques/${chq3.body?.data?.id}/void`, A, { confirm: true, reason: "ออกผิดใบ" });
  chk("D1-F2.8", "void เช็คด้วยคีย์ไม่มี cheque.void → 403", voidNo.status === 403, "403", `${voidNo.status}`);
  const voided = await call("POST", `/cheques/${chq3.body?.data?.id}/void`, D, { confirm: true, reason: "ออกผิดใบ" });
  chk("D1-F2.9", "POST /cheques/{id}/void (danger) → 200 VOIDED", voided.status === 200 && voided.body?.data?.status === "VOIDED", "VOIDED", `${voided.status} ${voided.body?.data?.status}`);
  const list = await call("GET", "/cheques?direction=IN", A);
  chk("D1-F2.10", "GET /cheques?direction=IN → statusCounts CLEARED 1 · BOUNCED 1", list.body?.statusCounts?.CLEARED === 1 && list.body?.statusCounts?.BOUNCED === 1, "1/1", JSON.stringify(list.body?.statusCounts));

  // ═══ F3 WHT ═══
  const ex2 = await exp.createExpenseDoc({ tenantId: tid, systemId: SYS, docType: "EXPENSE", contactId: vendor.id, issueDate: new Date(), vatMode: "EXCLUDE", lines: [{ description: "ค่าบริการซ่อมเรือ", qty: 1, unitPrice: 100_000, vatRateBp: 700, accountId: expenseLedger?.id }] });
  await exp.issueExpenseDoc(tid, SYS, ex2.id);
  const payWht = await call("POST", "/payments", A, { documentId: ex2.id, rows: [{ paidAt: today, financeAccountId: bankId, amountSatang: 104_000, whtRateBp: 300, whtAmountSatang: 3_000 }] });
  const payId = payWht.body?.data?.payments?.[0] as string;
  chk("D1-F3.1", "จ่ายผู้ขายพร้อมหัก ณ ที่จ่าย 3% (ไม่ระบุ incomeType) → PAID ยังไม่มีใบ 50 ทวิ", payWht.status === 200 && payWht.body?.data?.status === "PAID" && (payWht.body?.data?.whtCertNos?.length ?? 0) === 0, "PAID 0 cert", `${payWht.status} ${JSON.stringify(payWht.body?.data).slice(0, 160)}`);
  const cert = await call("POST", "/wht/certs", A, { paymentId: payId, whtIncomeType: "SERVICE" });
  chk("D1-F3.2", "POST /wht/certs {paymentId,whtIncomeType} → 200 {certId,docNo WHT…}", cert.status === 200 && /^WHT/.test(cert.body?.data?.docNo ?? "") && typeof cert.body?.data?.certId === "string", "WHT…", `${cert.status} ${JSON.stringify(cert.body).slice(0, 160)}`);
  const certAgain = await call("POST", "/wht/certs", A, { paymentId: payId, whtIncomeType: "SERVICE" });
  chk("D1-F3.3", "ออก 50 ทวิ ซ้ำ payment เดิม → 409 (ใบเดียว)", certAgain.status === 409 && (await prisma.accountDocument.count({ where: { systemId: SYS, docType: "WHT_CERT" } })) === 1, "409", `${certAgain.status} ${code(certAgain)}`);
  const period = today.slice(0, 7);
  const filed = await call("POST", "/wht/filings", A, { form: 53, period, note: "ยื่นผ่านอินเทอร์เน็ต" });
  chk("D1-F3.4", "POST /wht/filings {form:53,period} → 200 {certCount 1,totalBaseSatang 100,000,totalTaxSatang 3,000}", filed.status === 200 && filed.body?.data?.certCount === 1 && filed.body?.data?.totalBaseSatang === 100_000 && filed.body?.data?.totalTaxSatang === 3_000, "1/100000/3000", `${filed.status} ${JSON.stringify(filed.body?.data)}`);
  const filedList = await call("GET", "/wht/filings", A);
  chk("D1-F3.5", "GET /wht/filings → 1 แถว form 53 period ตรง", filedList.body?.data?.length === 1 && filedList.body.data[0].form === 53 && filedList.body.data[0].period === period, "1", JSON.stringify(filedList.body?.data));
  const unmarkNo = await call("DELETE", `/wht/filings/53/${period}`, A, { confirm: true, reason: "ยื่นผิดงวด" });
  chk("D1-F3.6", "unmark ด้วยคีย์ไม่มี wht.unmark → 403", unmarkNo.status === 403, "403", `${unmarkNo.status}`);
  const unmark = await call("DELETE", `/wht/filings/53/${period}`, D, { confirm: true, reason: "ยื่นผิดงวด" });
  chk("D1-F3.7", "DELETE /wht/filings/{form}/{period} (danger · wht.unmark) → 200 แล้ว filings ว่าง", unmark.status === 200 && (await call("GET", "/wht/filings", A)).body?.data?.length === 0, "0", `${unmark.status} ${code(unmark)}`);
  const badForm = await call("POST", "/wht/filings", A, { form: 7, period });
  chk("D1-F3.8", "form ไม่ใช่ 3/53 → 422", badForm.status === 422, "422", `${badForm.status}`, "MAJOR");

  // ═══ F4 registry ═══
  const registry = (await import("@/lib/modules/account/api/registry" as string)) as Record<string, Any>;
  const ops = registry.ACCOUNT_OPS as Any[];
  const need: [string, string, string][] = [["finance-accounts.create", "write", "account.finance.manage"], ["finance-accounts.update", "write", "account.finance.manage"], ["finance-accounts.archive", "write", "account.finance.manage"], ["finance-accounts.add-opening", "write", "account.finance.manage"], ["finance.transfer", "write", "account.finance.manage"], ["petty-cash.top-up", "write", "account.finance.manage"], ["petty-cash.reimburse", "write", "account.finance.manage"], ["cheques.create", "write", "account.cheque.manage"], ["cheques.deposit", "write", "account.cheque.deposit"], ["cheques.clear", "write", "account.cheque.clear"], ["cheques.bounce", "write", "account.cheque.bounce"], ["cheques.void", "danger", "account.cheque.void"], ["wht.issue-cert", "write", "account.wht.manage"], ["wht.mark-filed", "write", "account.wht.manage"], ["wht.unmark-filed", "danger", "account.wht.unmark"]];
  const bad = need.filter(([id, kind, action]) => { const o = ops.find((x) => x.id === id); return !o || o.kind !== kind || o.action !== action; });
  chk("D1-F4.1", "registry มี op ครบ 15 ตัวของ D1 · kind/action ตามสัญญา", bad.length === 0, "ครบ", bad.map(([id]) => id).join(","));
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 260) : String(e));
} finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  if (tid) {
    for (const m of ["accountJournalLine", "accountJournalEntry", "accountWhtFiling", "accountCheque", "accountDocumentPayment", "accountDocumentRelation", "accountDocumentLine", "accountDocument", "accountDocSequence", "accountFinanceTransfer", "accountFinanceOpening", "accountFinance", "accountContact", "accountMapping", "accountLedger", "accountPeriod", "accountSettings", "apiIdempotency", "apiKey", "auditLog", "outboxEvent", "party", "appSystemUnit", "appSystem"]) {
      await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: tid } }));
    }
    await d(() => prisma.businessUnit.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.tenant.delete({ where: { id: tid } }));
  }
  await d(() => prisma.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE key LIKE 'acct:api:%'`));
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Account API WRITE finance (D1) =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
