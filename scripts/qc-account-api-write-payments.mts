// QC — API บัญชี WO C2: WRITE การชำระ — รับ/จ่ายชำระ (หลายรายการ/WHT/ค่าธรรมเนียม) · ยกเลิกการชำระ · มัดจำ (หัก/คืน) · ลิงก์ PromptPay · ใบวางบิล/ใบรวมจ่าย
// Fable oracle · Builder ห้ามแตะ · สัญญาอยู่ที่ ledger/ACCOUNT-API-RUN.md §C2
// 🔴 tenant ใหม่ของตัวเอง (ไม่แตะ seed) · ลบทิ้งใน finally
// ⚠️ standalone-typesafe: dynamic import + wide cast
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-account-api-write-payments");
// ⏭️ WO ยังไม่สร้าง → ข้ามแบบเห็นชัด (exit 0) ไม่ทำ qc:all/CI แดงค้าง (บทเรียน WO 0.7) — ด่านนี้หายไปเองเมื่อ WO ลงจริง
if (!((await import("@/lib/modules/account/api/registry" as string)) as { ACCOUNT_OPS: { id: string }[] }).ACCOUNT_OPS.some((o) => o.id === "payments.record")) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (payments.record)");
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
const idem = () => ({ "idempotency-key": `c2-${Date.now()}-${Math.random().toString(16).slice(2)}` });

let tid = "";
let tidB = "";
try {
  const acc = (await import("@/lib/modules/account/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const gl = (await import("@/lib/modules/account/gl" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const fin = (await import("@/lib/modules/account/finance" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const ak = (await import("@/lib/api-keys/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const scopes = (await import("@/lib/api-keys/scopes" as string)) as Record<string, Any>;
  const route = (await import("@/app/api/v1/account/[...path]/route" as string)) as Record<string, (req: Request, ctx: { params: Promise<{ path: string[] }> }) => Promise<Response>>;

  const t = await prisma.tenant.create({ data: { name: "QC API C2", slug: `qc-api-c2-${Date.now()}` } });
  tid = t.id;
  const s = await sys.createSystem(tid, "ACCOUNT", "บัญชี C2");
  const SYS = s.id;
  const ctx = { tenantId: tid, systemId: SYS };
  await acc.saveSettings(tid, SYS, { orgName: "ร้าน C2", taxId: "0105561000003", vatRegistered: true, vatRateBp: 700, taxPointBasis: "ON_ISSUE" });
  await gl.ensureAccounting(ctx);
  const customer = await acc.createContact({ tenantId: tid, systemId: SYS, kind: "CUSTOMER", legalType: "COMPANY", name: "บริษัท ลูกค้า ซีทู จำกัด", taxId: "0105561000004" });
  const cash = await fin.createFinanceAccount({ tenantId: tid, systemId: SYS, type: "CASH", name: "เงินสด" });
  const bank = await fin.createFinanceAccount({ tenantId: tid, systemId: SYS, type: "BANK", name: "กสิกร", bankName: "KBANK", accountNo: "1234567890", promptpayId: "0105561000003", useForReceive: true });
  const tB = await prisma.tenant.create({ data: { name: "QC API C2 B", slug: `qc-api-c2b-${Date.now()}` } });
  tidB = tB.id;
  const accB = await sys.createSystem(tidB, "ACCOUNT", "บัญชี B");
  const issueScopes = scopes.expandBundles(["issue-and-collect"]) as string[];
  const kW = await ak.createApiKey({ tenantId: tid }, "C2 write", { scopes: issueScopes, systemId: SYS });
  const kD = await ak.createApiKey({ tenantId: tid }, "C2 danger", { scopes: [...issueScopes, "account.payment.void", "account.doc.void"], systemId: SYS });
  const kR = await ak.createApiKey({ tenantId: tid }, "C2 read", { scopes: scopes.expandBundles(["read-only"]), systemId: SYS });
  const kB = await ak.createApiKey({ tenantId: tidB }, "C2 B", { scopes: [...issueScopes, "account.payment.void"], systemId: accB.id });

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
  const W = kW.rawKey;
  const D = kD.rawKey;
  const code = (r: Any) => r.body?.error?.code;
  const today = ymd();
  const docStatus = async (id: string) => (await prisma.accountDocument.findUnique({ where: { id }, select: { status: true, paidTotal: true, grandTotal: true } }))!;
  const entriesFor = (refId: string) => prisma.accountJournalEntry.findMany({ where: { systemId: SYS, refId }, include: { lines: { include: { account: { select: { code: true } } } } } });
  const balanced = (e: Any) => e.lines.reduce((s: number, l: Any) => s + l.debit, 0) === e.lines.reduce((s: number, l: Any) => s + l.credit, 0);
  const makeInvoice = async (lines: Any[], contactId = customer.id) => {
    const d = await acc.createDocument({ tenantId: tid, systemId: SYS, docType: "INVOICE", contactId, issueDate: new Date(), vatMode: "EXCLUDE", lines });
    const r = await acc.issueDocument(tid, SYS, d.id);
    if (!r.ok) throw new Error(`issue ล้ม: ${r.reason}`);
    return d.id as string;
  };

  // ═══ P1 รับชำระเต็มจำนวน ═══
  const iv1 = await makeInvoice([{ description: "ทริปดำน้ำ", qty: 2, unitPrice: 500000, vatRateBp: 700 }]); // 1,070,000
  const p1 = await call("POST", "/payments", W, { documentId: iv1, rows: [{ paidAt: today, financeAccountId: cash.id, amountSatang: 1_070_000 }] });
  const st1 = await docStatus(iv1);
  chk("C2-P1.1", "POST /payments เต็มจำนวน → 200 data{documentId,status PAID,paidSatang,outstandingSatang 0,payments[ids],whtCertNos[]} + DB PAID", p1.status === 200 && p1.body?.data?.status === "PAID" && p1.body?.data?.outstandingSatang === 0 && Array.isArray(p1.body?.data?.payments) && p1.body.data.payments.length === 1 && st1.status === "PAID" && st1.paidTotal === 1_070_000, "PAID", `${p1.status} ${JSON.stringify(p1.body).slice(0, 220)}`);
  const pay1 = p1.body?.data?.payments?.[0] as string;
  const payEntries = await entriesFor(pay1);
  chk("C2-P1.2", "JV ของการชำระ 1 ใบ สมดุล · Cr 1100 = 1,070,000 · Dr บัญชีเงินสด", payEntries.length === 1 && balanced(payEntries[0]) && payEntries[0]!.lines.filter((l: Any) => l.account.code === "1100").reduce((s: number, l: Any) => s + l.credit, 0) === 1_070_000, "JV สมดุล", `entries=${payEntries.length}`);
  const bal = await fin.financeBalances(tid, SYS);
  chk("C2-P1.3", "ยอดเงินสดเพิ่ม 1,070,000", (bal as Any[]).find((b) => b.id === cash.id)?.balance === 1_070_000, "1070000", JSON.stringify((bal as Any[]).map((b) => [b.code, b.balance])));
  const over = await call("POST", "/payments", W, { documentId: iv1, rows: [{ paidAt: today, financeAccountId: cash.id, amountSatang: 100 }] });
  chk("C2-P1.4", "ชำระใบที่ PAID แล้ว → 409 state_conflict/422 ไทย (ไม่บันทึกเพิ่ม)", (over.status === 409 || over.status === 422) && (await docStatus(iv1)).paidTotal === 1_070_000, "409/422", `${over.status} ${code(over)}`);
  const readDenied = await call("POST", "/payments", kR.rawKey, { documentId: iv1, rows: [{ paidAt: today, financeAccountId: cash.id, amountSatang: 1 }] });
  chk("C2-P1.5", "คีย์ read-only → 403", readDenied.status === 403, "403", `${readDenied.status}`);
  const badAmt = await call("POST", "/payments", W, { documentId: iv1, rows: [{ paidAt: today, financeAccountId: cash.id, amountSatang: 0 }] });
  chk("C2-P1.6", "amountSatang 0 → 422", badAmt.status === 422, "422", `${badAmt.status}`, "MAJOR");
  const list = await call("GET", `/documents/${iv1}/payments`, W);
  chk("C2-P1.7", "GET /documents/{id}/payments → panel{grandTotalSatang,paidSatang,outstandingSatang,whtBaseSatang} + rows[{id,paidAt,channel,financeAccount,amountSatang,whtSatang,feeSatang,voidedAt}]", list.status === 200 && list.body?.data?.panel?.outstandingSatang === 0 && list.body?.data?.rows?.length === 1 && list.body.data.rows[0].amountSatang === 1_070_000, "ครบ", `${list.status} ${JSON.stringify(list.body?.data).slice(0, 220)}`);

  // ═══ P2 บางส่วน + แข่งกันชำระ (row lock) ═══
  const iv2 = await makeInvoice([{ description: "คอร์สเรียน", qty: 1, unitPrice: 1_000_000, vatRateBp: 700 }]); // 1,070,000
  const part = await call("POST", "/payments", W, { documentId: iv2, rows: [{ paidAt: today, financeAccountId: bank.id, amountSatang: 70_000, feeSatang: 1_000, note: "โอน" }] });
  chk("C2-P2.1", "ชำระบางส่วน + ค่าธรรมเนียม → PARTIAL outstanding 1,000,000", part.status === 200 && part.body?.data?.status === "PARTIAL" && part.body?.data?.outstandingSatang === 1_000_000, "PARTIAL 1000000", `${part.status} ${JSON.stringify(part.body?.data).slice(0, 160)}`);
  const race = await Promise.all([
    call("POST", "/payments", W, { documentId: iv2, rows: [{ paidAt: today, financeAccountId: cash.id, amountSatang: 1_000_000 }] }),
    call("POST", "/payments", W, { documentId: iv2, rows: [{ paidAt: today, financeAccountId: cash.id, amountSatang: 1_000_000 }] }),
  ]);
  const st2 = await docStatus(iv2);
  chk("C2-P2.2", "ยิงชำระยอดเต็มพร้อมกัน 2 คำขอ (คนละ Idempotency-Key) → สำเร็จ 1 · paidTotal = grandTotal พอดี (ไม่จ่ายซ้ำ)", race.filter((r) => r.status === 200).length === 1 && st2.paidTotal === st2.grandTotal && st2.status === "PAID", "1 สำเร็จ", `${race.map((r) => r.status).join("/")} paid=${st2.paidTotal}/${st2.grandTotal}`);

  // ═══ P3 WHT (ลูกค้าหักเรา) ═══
  const iv3 = await makeInvoice([{ description: "ค่าบริการที่ปรึกษา", qty: 1, unitPrice: 100_000, vatRateBp: 700 }]); // 107,000 · WHT 3% ของ 100,000 = 3,000
  const wht = await call("POST", "/payments", W, { documentId: iv3, rows: [{ paidAt: today, financeAccountId: bank.id, amountSatang: 104_000, whtIncomeType: "SERVICE", whtRateBp: 300, whtAmountSatang: 3_000 }] });
  chk("C2-P3.1", "ชำระพร้อม WHT 3% → PAID · whtCertNos 1 ใบ (ถูกหัก ณ ที่จ่าย)", wht.status === 200 && wht.body?.data?.status === "PAID" && wht.body?.data?.whtCertNos?.length === 1, "PAID + cert", `${wht.status} ${JSON.stringify(wht.body?.data).slice(0, 200)}`);
  const whtRow = await prisma.accountDocumentPayment.findFirst({ where: { documentId: iv3 }, select: { whtAmountSatang: true, amount: true } });
  chk("C2-P3.2", "DB payment: amount 104,000 · wht 3,000", whtRow?.amount === 104_000 && whtRow?.whtAmountSatang === 3_000, "104000/3000", JSON.stringify(whtRow));

  // ═══ P4 void การชำระ (danger) ═══
  const voidNo = await call("POST", `/payments/${pay1}/void`, W, { documentId: iv1, confirm: true, reason: "บันทึกผิดใบ" });
  chk("C2-P4.1", "void ด้วยคีย์ไม่มี payment.void → 403", voidNo.status === 403, "403", `${voidNo.status}`);
  const voided = await call("POST", `/payments/${pay1}/void`, D, { documentId: iv1, confirm: true, reason: "บันทึกผิดใบ" });
  const st1b = await docStatus(iv1);
  const payEntries2 = await entriesFor(pay1);
  chk("C2-P4.2", "void → 200 · เอกสารกลับ AWAITING_PAYMENT paidTotal 0 · reversal JV (2 ใบ สมดุล)", voided.status === 200 && st1b.status === "AWAITING_PAYMENT" && st1b.paidTotal === 0 && payEntries2.length === 2 && payEntries2.every(balanced), "AWAITING_PAYMENT", `${voided.status} ${st1b.status} paid=${st1b.paidTotal} entries=${payEntries2.length}`);
  const voidAgain = await call("POST", `/payments/${pay1}/void`, D, { documentId: iv1, confirm: true, reason: "ยกเลิกซ้ำอีก" });
  chk("C2-P4.3", "void ซ้ำ → 409", voidAgain.status === 409, "409", `${voidAgain.status}`);
  const voidCross = await call("POST", `/payments/${pay1}/void`, kB.rawKey, { documentId: iv1, confirm: true, reason: "แฮกยกเลิก" });
  chk("C2-P4.4", "คีย์ร้านอื่น void → 404", voidCross.status === 404, "404", `${voidCross.status}`);

  // ═══ P5 มัดจำ: DR → รับเงิน → หักในใบแจ้งหนี้ → คืนมัดจำ ═══
  const dr = await acc.createDocument({ tenantId: tid, systemId: SYS, docType: "DEPOSIT_RECEIPT", contactId: customer.id, issueDate: new Date(), vatMode: "EXCLUDE", lines: [{ description: "มัดจำ", qty: 1, unitPrice: 200_000, vatRateBp: 700 }] });
  await acc.issueDocument(tid, SYS, dr.id);
  const drPay = await call("POST", "/payments", W, { documentId: dr.id, rows: [{ paidAt: today, financeAccountId: cash.id, amountSatang: 214_000 }] });
  chk("C2-P5.1", "รับเงินมัดจำ → DR สถานะ AWAITING_DEDUCT (รอหัก)", drPay.status === 200 && (await docStatus(dr.id)).status === "AWAITING_DEDUCT", "AWAITING_DEDUCT", `${drPay.status} ${(await docStatus(dr.id)).status}`);
  const iv4 = await acc.createDocument({ tenantId: tid, systemId: SYS, docType: "INVOICE", contactId: customer.id, issueDate: new Date(), vatMode: "EXCLUDE", lines: [{ description: "งานเต็ม", qty: 1, unitPrice: 1_000_000, vatRateBp: 700 }] });
  const deps = await call("GET", `/documents/${iv4.id}/deposits`, W);
  chk("C2-P5.2", "GET /documents/{id}/deposits (ร่าง IV ของลูกค้าเดียวกัน) → เห็น DR availableSatang 214,000", deps.status === 200 && (deps.body?.data ?? []).some((d: Any) => d.id === dr.id && d.availableSatang === 214_000), "214000", `${deps.status} ${JSON.stringify(deps.body?.data).slice(0, 200)}`);
  const setDep = await call("PUT", `/documents/${iv4.id}/deposits`, W, { picks: [{ depositId: dr.id, amountSatang: 214_000 }] });
  chk("C2-P5.3", "PUT deposits → grandTotalSatang ลดเหลือ 856,000 (1,070,000 − 214,000)", setDep.status === 200 && setDep.body?.data?.grandTotalSatang === 856_000 && setDep.body?.data?.depositDeductedSatang === 214_000, "856000", `${setDep.status} ${JSON.stringify(setDep.body?.data)}`);
  const dr2 = await acc.createDocument({ tenantId: tid, systemId: SYS, docType: "DEPOSIT_RECEIPT", contactId: customer.id, issueDate: new Date(), vatMode: "EXCLUDE", lines: [{ description: "มัดจำ 2", qty: 1, unitPrice: 50_000, vatRateBp: 700 }] });
  await acc.issueDocument(tid, SYS, dr2.id);
  await call("POST", "/payments", W, { documentId: dr2.id, rows: [{ paidAt: today, financeAccountId: cash.id, amountSatang: 53_500 }] });
  const refund = await call("POST", `/documents/${dr2.id}/refund-deposit`, D, { confirm: true, reason: "ลูกค้ายกเลิกทริป" });
  chk("C2-P5.4", "POST /refund-deposit (danger · doc.void) → 200 refundedSatang 53,500 + สถานะมัดจำเปลี่ยน", refund.status === 200 && refund.body?.data?.refundedSatang === 53_500 && (await docStatus(dr2.id)).status !== "AWAITING_DEDUCT", "53500", `${refund.status} ${JSON.stringify(refund.body).slice(0, 160)}`);

  // ═══ P6 ลิงก์ชำระเงิน PromptPay ═══
  const iv5 = await makeInvoice([{ description: "อุปกรณ์", qty: 1, unitPrice: 300_000, vatRateBp: 700 }]);
  const pr = await call("POST", "/payment-requests", W, { documentId: iv5, financeAccountId: bank.id, expiresInDays: 3 });
  chk("C2-P6.1", "POST /payment-requests → 200 data{id,url,qrPayload,amountSatang 321,000,status PENDING,expiresAt} (ไม่มี token แยก)", pr.status === 200 && typeof pr.body?.data?.url === "string" && typeof pr.body?.data?.qrPayload === "string" && pr.body?.data?.amountSatang === 321_000 && pr.body?.data?.status === "PENDING" && !("token" in (pr.body?.data ?? {})), "PENDING", `${pr.status} ${JSON.stringify(pr.body).slice(0, 220)}`);
  const prCash = await call("POST", "/payment-requests", W, { documentId: iv5, financeAccountId: cash.id });
  chk("C2-P6.2", "ช่องทางที่ไม่มี PromptPay → 422 ไทย", prCash.status === 422 && /[ก-๙]/.test(prCash.body?.error?.message_th ?? ""), "422", `${prCash.status} ${code(prCash)}`, "MAJOR");
  const confirm = await call("POST", `/payment-requests/${pr.body?.data?.id}/confirm`, W, {});
  chk("C2-P6.3", "POST /payment-requests/{id}/confirm (ยืนยันมือ) → 200 paymentId + เอกสาร PAID", confirm.status === 200 && typeof confirm.body?.data?.paymentId === "string" && (await docStatus(iv5)).status === "PAID", "PAID", `${confirm.status} ${JSON.stringify(confirm.body).slice(0, 160)}`);
  const confirmAgain = await call("POST", `/payment-requests/${pr.body?.data?.id}/confirm`, W, {});
  chk("C2-P6.4", "confirm ซ้ำ → 200 duplicated:true หรือ 409 (ไม่บันทึกซ้ำ) · paidTotal คงเดิม", (confirmAgain.status === 409 || confirmAgain.body?.data?.duplicated === true) && (await docStatus(iv5)).paidTotal === 321_000, "ไม่ซ้ำ", `${confirmAgain.status} ${JSON.stringify(confirmAgain.body?.data)}`);
  const cancel = await call("POST", `/payment-requests/${pr.body?.data?.id}/cancel`, W, {});
  chk("C2-P6.5", "cancel คำขอที่จ่ายแล้ว → 409", cancel.status === 409, "409", `${cancel.status}`, "MAJOR");
  const prPaidDoc = await call("POST", "/payment-requests", W, { documentId: iv5, financeAccountId: bank.id });
  chk("C2-P6.6", "สร้างลิงก์ให้ใบที่ PAID → 409/422", prPaidDoc.status === 409 || prPaidDoc.status === 422, "409/422", `${prPaidDoc.status}`, "MAJOR");
  const prList = await call("GET", `/payment-requests?documentId=${iv5}`, W);
  chk("C2-P6.7", "GET /payment-requests?documentId → 1 รายการ status PAID", prList.status === 200 && prList.body?.data?.length === 1 && prList.body.data[0].status === "PAID", "PAID", `${prList.status} ${JSON.stringify(prList.body?.data?.[0]).slice(0, 120)}`);

  // ═══ P7 ใบวางบิลรวม + รับชำระกลุ่ม ═══
  const ivA = await makeInvoice([{ description: "A", qty: 1, unitPrice: 100_000, vatRateBp: 700 }]); // 107,000
  const ivB = await makeInvoice([{ description: "B", qty: 1, unitPrice: 200_000, vatRateBp: 700 }]); // 214,000
  const cand = await call("GET", `/documents/group-candidates?type=BILLING_NOTE&contactId=${customer.id}`, W);
  chk("C2-P7.1", "GET /documents/group-candidates?type=BILLING_NOTE&contactId → เห็น ivA/ivB eligible", cand.status === 200 && [ivA, ivB].every((id) => (cand.body?.data ?? []).some((c: Any) => c.id === id && c.eligible === true)), "2 ใบ", `${cand.status} ${cand.body?.data?.length}`);
  const bn = await call("POST", "/documents", W, { type: "BILLING_NOTE", contactId: customer.id, issueDate: today, childIds: [ivA, ivB] });
  const bnId = bn.body?.data?.id as string;
  chk("C2-P7.2", "POST /documents BILLING_NOTE + childIds → 200 docNo BN… grandTotalSatang 321,000 status AWAITING_PAYMENT", bn.status === 200 && /^BN/.test(bn.body?.data?.docNo ?? "") && bn.body?.data?.grandTotalSatang === 321_000, "BN 321000", `${bn.status} ${JSON.stringify(bn.body).slice(0, 200)}`);
  const gp = await call("POST", "/payments/group", W, { groupId: bnId, paidAt: today, financeAccountId: bank.id, tieOffSatang: 321_000, feeSatang: 0, note: "โอนรวม", wht: [] });
  chk("C2-P7.3", "POST /payments/group → 200 batchKey + allocations 2 ใบ · ลูกทั้งสอง PAID", gp.status === 200 && typeof gp.body?.data?.batchKey === "string" && gp.body?.data?.allocations?.length === 2 && (await docStatus(ivA)).status === "PAID" && (await docStatus(ivB)).status === "PAID", "PAID ×2", `${gp.status} ${JSON.stringify(gp.body?.data).slice(0, 220)}`);
  const gv = await call("POST", `/payments/group/${gp.body?.data?.batchKey}/void`, D, { groupId: bnId, confirm: true, reason: "โอนผิดบัญชี" });
  chk("C2-P7.4", "POST /payments/group/{batchKey}/void (danger) → 200 voided 2 · ลูกกลับ AWAITING_PAYMENT", gv.status === 200 && gv.body?.data?.voided === 2 && (await docStatus(ivA)).status === "AWAITING_PAYMENT", "voided 2", `${gv.status} ${JSON.stringify(gv.body?.data)}`);

  // ═══ P8 audit + registry ═══
  const audits = await prisma.auditLog.count({ where: { tenantId: tid, actorType: "API_KEY" as Any, action: { in: ["account.payment.record", "account.payment.void"] } } });
  chk("C2-P8.1", "audit API_KEY ของ payment.record/void ≥ 8", audits >= 8, "≥8", `${audits}`, "MAJOR");
  const registry = (await import("@/lib/modules/account/api/registry" as string)) as Record<string, Any>;
  const ops = registry.ACCOUNT_OPS as Any[];
  const need: [string, string, string][] = [["payments.record", "write", "account.payment.record"], ["payments.list", "read", "account.doc.view"], ["payments.void", "danger", "account.payment.void"], ["documents.refund-deposit", "danger", "account.doc.void"], ["payment-requests.create", "write", "account.payment.record"], ["payment-requests.confirm", "write", "account.payment.record"], ["payment-requests.cancel", "write", "account.payment.record"], ["documents.group-candidates", "read", "account.doc.view"], ["payments.record-group", "write", "account.payment.record"], ["payments.void-group", "danger", "account.payment.void"]];
  const bad = need.filter(([id, kind, action]) => { const o = ops.find((x) => x.id === id); return !o || o.kind !== kind || o.action !== action; });
  chk("C2-P8.2", "registry มี op ครบ 10 ตัวของ C2 · kind/action ตามสัญญา", bad.length === 0, "ครบ", bad.map(([id]) => id).join(","));
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 260) : String(e));
} finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  for (const id of [tid, tidB]) {
    if (!id) continue;
    for (const m of ["accountJournalLine", "accountJournalEntry", "accountPaymentRequest", "accountDocumentPayment", "accountDocumentRelation", "accountDocumentLine", "accountAttachment", "accountDocument", "accountDocSequence", "accountCheque", "accountFinanceOpening", "accountFinance", "accountContact", "accountMapping", "accountLedger", "accountPeriod", "accountSettings", "apiIdempotency", "apiKey", "auditLog", "outboxEvent", "appSystemUnit", "appSystem"]) {
      await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: id } }));
    }
    await d(() => prisma.businessUnit.deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.tenant.delete({ where: { id } }));
  }
  await d(() => prisma.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE key LIKE 'acct:api:%'`));
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Account API WRITE payments (C2) =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
