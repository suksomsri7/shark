// QC Account REST — คำสั่งของ ACC T5 (เลน 2) ผ่าน route จริง /api/v1/account + เครื่องมือเลขา AI (ทะเบียนเดียวกัน)
//   GET /settings/tax/deadlines (calendar · T5-API.1) · GET /reports/cash-book (+CSV · T5-API.2) · GET /tax/vat-threshold (T5-API.3)
//   GET /reports/tax-add-back (T5-API.5a) · PATCH /chart/{id}/tax-add-back (T5-API.5b) · GET /tax/checks (T5-API.6a) · POST /documents/{id}/stamp-duty-ref (T5-API.6b)
//   GET /bad-debt (T5-API.7a) · POST /documents/{id}/write-off (409 legal_ack_required → acknowledge · T5-API.7b) · POST /bad-debt/allowance (T5-API.7c)
// ร้านทดสอบแยก "QC T5 REST" · รัน: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-account-api-tax-t5.mts
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-account-api-tax-t5");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, exp: unknown, act: unknown, sev: Sev = "CRITICAL") => {
  cks.push({ id, ok, sev });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${JSON.stringify(exp)} | act ${JSON.stringify(act)?.slice(0, 900)}`}`);
};
const eq = (id: string, n: string, act: unknown, exp: unknown, sev: Sev = "CRITICAL") => chk(id, n, JSON.stringify(act) === JSON.stringify(exp), exp, act, sev);

const KEEP = process.env.KEEP === "1";
const F: Any = await import("./qc-acc-v2-wht-fixture.mts" as string);
const ak: Any = await import("@/lib/api-keys/service" as string);
const scopes: Any = await import("@/lib/api-keys/scopes" as string);
const route: Any = await import("@/app/api/v1/account/[...path]/route" as string);
const AO: Any = await import("@/lib/ai/account-ops" as string);
const SK: Any = await import("@/lib/ai/skills" as string);
const AS: Any = await import("@/lib/modules/account/asset" as string);

const LV: Any = await import("@/lib/modules/account/legal-values" as string);
const clock: Any = await import("@/lib/modules/account/clock" as string);

console.log("\n── A0 เครื่องมือเลขา AI (ทะเบียนเดียวกับ REST) ──");
{
  const tools = AO.accountToolInfos();
  const want: Record<string, [string, boolean]> = {
    account_tax_deadlines: ["settings.tax.deadlines", false],
    account_vat_threshold: ["tax.vat-threshold", false],
    account_tax_add_back: ["reports.tax-add-back", false],
    account_set_tax_add_back: ["chart.set-tax-add-back", true],
    account_tax_checks: ["tax.checks", false],
    account_set_stamp_duty_ref: ["documents.stamp-duty-ref", true],
    account_bad_debt: ["bad-debt.summary", false],
    account_write_off_bad_debt: ["bad-debt.write-off", true],
    account_set_doubtful_allowance: ["bad-debt.allowance", true],
  };
  eq("A0.1", "เครื่องมือ T5 ผูก op · เขียน = ข้อเสนอ", Object.keys(want).map((n) => {
    const t = tools.find((x: Any) => x.name === n);
    return t ? [t.opId, t.write] : null;
  }), Object.values(want));
  const kinds = (tools.find((x: Any) => x.name === "account_report")?.parameters?.properties?.kind?.enum ?? []) as string[];
  eq("A0.2", "account_report kind มี cash-book", kinds.includes("cash-book"), true);
  const inSkills = (n: string) => (SK.SKILLS ?? []).filter((s: Any) => (s.tools ?? []).includes(n)).map((s: Any) => s.id);
  eq("A0.3", "ทุกเครื่องมือใหม่อยู่ในสกิล account สกิลเดียว", Object.keys(want).map(inSkills), Object.keys(want).map(() => ["account"]));
  // test id ของ op ใหม่ (ด่าน OA-5.2 อ่านจากไฟล์นี้) — ตรงกับทะเบียน
  const T5_TEST_IDS: Record<string, string> = { "reports.cash-book": "T5-API.2", "tax.vat-threshold": "T5-API.3", "reports.tax-add-back": "T5-API.5a", "chart.set-tax-add-back": "T5-API.5b", "tax.checks": "T5-API.6a", "documents.stamp-duty-ref": "T5-API.6b", "bad-debt.summary": "T5-API.7a", "bad-debt.write-off": "T5-API.7b", "bad-debt.allowance": "T5-API.7c" };
  const REG: Any = await import("@/lib/modules/account/api/registry" as string);
  eq("A0.4", "op ใหม่ 9 ตัวอยู่ในทะเบียน + test id ตรง (T5-API.1 = op เดิม settings.tax.deadlines)", Object.keys(T5_TEST_IDS).map((id) => (REG.ACCOUNT_OPS as Any[]).find((o) => o.id === id)?.test ?? null), Object.values(T5_TEST_IDS));
}

let tid = "";
let prisma: Any = null;
try {
  const S = await F.setupWhtShop("QC T5 REST", "qc-t5-api");
  tid = S.tid;
  prisma = S.prisma;
  const SYS = S.SYS;
  const kW = await ak.createApiKey({ tenantId: S.tid }, "T5 write", { scopes: scopes.expandBundles(["accountant"]), systemId: SYS });
  const kR = await ak.createApiKey({ tenantId: S.tid }, "T5 read", { scopes: ["account.journal.view", "account.report.view", "account.doc.view"], systemId: SYS });
  const call = async (method: string, path: string, key: string, body?: unknown, accept?: string) => {
    const headers: Record<string, string> = { authorization: `Bearer ${key}`, ...(method === "GET" ? {} : { "idempotency-key": `t5-${Date.now()}-${Math.random().toString(16).slice(2)}` }), ...(accept ? { accept } : {}) };
    let b: string | undefined;
    if (body !== undefined) {
      b = JSON.stringify(body);
      headers["content-type"] = "application/json";
    }
    const req = new Request(`http://x/api/v1/account${path}`, { method, headers, body: b });
    const segs = path.split("?")[0]!.split("/").filter(Boolean);
    const res = await route[method]!(req, { params: Promise.resolve({ path: segs }) });
    const text = await res.text();
    let parsed: Any = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { _raw: text };
    }
    return { status: res.status, body: parsed, type: res.headers.get("content-type") ?? "", text };
  };
  const acc: Any = await import("@/lib/modules/account/service" as string);
  const ym = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(clock.accountNow()).slice(0, 7);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(clock.accountNow());

  console.log("\n── T5.1 ปฏิทินภาษี ──");
  const dl = await call("GET", "/settings/tax/deadlines?asOf=2026-11-14", kR.rawKey);
  const cal = dl.body?.data?.calendar;
  eq("T51.1", "deadlines + calendar: บริษัทจด VAT → ภ.ง.ด.50 รอบ 2569 = 2027-05-30 · ภ.ง.ด.51 = 2027-08-31 · ยื่นงบบริษัทเป็นข้อความ · เดิม deadlines ยังอยู่", [dl.status, Array.isArray(dl.body?.data?.deadlines), cal?.entityKind, cal?.items?.find((i: Any) => i.form === "PND50")?.paper?.date, cal?.items?.find((i: Any) => i.form === "PND51")?.paper?.date, typeof cal?.items?.find((i: Any) => i.form === "FS_COMPANY")?.whenTh], [200, true, "COMPANY", "2027-05-30", "2027-08-31", "string"]);

  console.log("\n── T5.2 เงินสดรับ-จ่าย ──");
  const inv = await acc.createDocument({ tenantId: S.tid, systemId: SYS, docType: "INVOICE", contactId: S.cust.id, issueDate: new Date(`${ym}-01T10:00:00+07:00`), vatMode: "NONE", lines: [{ description: "บริการ", qty: 1, unitPrice: 500_000, vatRateBp: 0 }], createdById: S.owner.id });
  await acc.issueDocument(S.tid, SYS, inv.id, { ack: { codes: ["SALE_WITHOUT_VAT_REGISTERED", "BUYER_TAX_ID_MISSING"], actorId: S.owner.id } });
  await acc.recordPayment(S.tid, SYS, inv.id, { paidAt: new Date(`${ym}-01T11:00:00+07:00`), channel: "TRANSFER", financeAccountId: S.bank.id, amount: 200_000, createdById: S.owner.id, idempotencyKey: `t5api-pay-${S.tid}` });
  const cb = await call("GET", `/reports/cash-book?from=${ym}-01&to=${today}`, kR.rawKey);
  eq("T52.1", "cash-book: รับ 2,000 (ขายเชื่อ 5,000 ไม่ขึ้นจนรับ) · คำเตือนรูปแบบ [U]", [cb.status, cb.body?.data?.totals?.receiptSatang, cb.body?.data?.rows?.length, (cb.body?.data?.warnings ?? []).map((w: Any) => w.code)], [200, 200_000, 1, ["CASH_BOOK_FORMAT_UNVERIFIED"]]);
  const cbc = await call("GET", `/reports/cash-book?from=${ym}-01&to=${today}`, kR.rawKey, undefined, "text/csv");
  eq("T52.2", "cash-book CSV: หัว + 1 แถว", [cbc.status, /csv/.test(cbc.type), cbc.text.replace(/^\uFEFF/, "").trim().split("\n").length], [200, true, 2]);
  const cbb = await call("GET", "/reports/cash-book?from=2026-13-01", kR.rawKey);
  eq("T52.3", "วันที่ผิดรูป → 422", cbb.status, 422);

  console.log("\n── T5.3 เกณฑ์จด VAT ──");
  const vt = await call("GET", "/tax/vat-threshold", kR.rawKey);
  eq("T53.1", "สมุดจด VAT → REGISTERED ไม่มีคำเตือน", [vt.status, vt.body?.data?.status, vt.body?.data?.warnings?.length], [200, "REGISTERED", 0]);
  await acc.saveSettings(S.tid, SYS, { vatRegistered: false });
  const vt2 = await call("GET", `/tax/vat-threshold?asOf=${today}`, kR.rawKey);
  eq("T53.2", "ไม่จด VAT → ยอด 5,000 · เกณฑ์ 1,800,000 จากตาราง · BELOW", [vt2.body?.data?.status, vt2.body?.data?.salesSatang, vt2.body?.data?.thresholdSatang, vt2.body?.data?.yearBasis], ["BELOW", 500_000, 180_000_000, "FISCAL"]);
  await acc.saveSettings(S.tid, SYS, { vatRegistered: true });

  console.log("\n── T5.5 บวกกลับ ──");
  const fine = (await prisma.accountLedger.findFirstOrThrow({ where: { systemId: SYS, code: "6985" }, select: { id: true } })).id;
  const ab = await call("GET", "/reports/tax-add-back", kR.rawKey);
  eq("T55.1", "tax-add-back: บัญชีที่ติดธงค่าเริ่ม (6930 6940 6960 6710 6980 6985 6990) · sections 11", [ab.status, (ab.body?.data?.rows ?? []).map((r: Any) => r.code), ab.body?.data?.sections?.length], [200, ["6710", "6930", "6940", "6960", "6980", "6985", "6990"], 11]);
  const set = await call("PATCH", `/chart/${fine}/tax-add-back`, kW.rawKey, { section: "NONE" });
  eq("T55.2", "PATCH NONE → effective null", [set.status, set.body?.data?.effective], [200, null]);
  const setR = await call("PATCH", `/chart/${fine}/tax-add-back`, kR.rawKey, { section: "S65TRI_6" });
  eq("T55.3", "คีย์อ่านอย่างเดียว → 403", setR.status, 403);
  const setBad = await call("PATCH", `/chart/${fine}/tax-add-back`, kW.rawKey, { section: "S65TRI_99" });
  eq("T55.4", "อนุมาตราที่ไม่รู้จัก → 422", setBad.status, 422);
  const setNo = await call("PATCH", `/chart/nope-xyz/tax-add-back`, kW.rawKey, { section: null });
  eq("T55.5", "บัญชีที่ไม่มี → 404", setNo.status, 404);

  console.log("\n── T5.6 ตรวจภาษีประจำเดือน ──");
  const q = await acc.createDocument({ tenantId: S.tid, systemId: SYS, docType: "QUOTATION", contactId: S.cust.id, issueDate: new Date(`${ym}-01T10:00:00+07:00`), vatMode: "EXCLUDE", lines: [{ description: "จ้างออกแบบ", qty: 1, unitPrice: 200_000, vatRateBp: 700, lineKind: "SERVICE" }], createdById: S.owner.id });
  await acc.issueDocument(S.tid, SYS, q.id, { ack: { codes: ["BUYER_TAX_ID_MISSING"], actorId: S.owner.id } });
  await acc.setQuotationResponse(S.tid, SYS, q.id, true);
  const tc = await call("GET", `/tax/checks?period=${ym}`, kR.rawKey);
  eq("T56.1", "tax/checks: อากรใบเสนอราคา 2,000 → 2 บาท · ร้านเป็นผู้เสีย", [tc.status, (tc.body?.data?.stampDuty ?? []).map((x: Any) => [x.documentId === q.id, x.dutySatang, x.payer, x.warning?.code])], [200, [[true, 200, "SHOP", "STAMP_DUTY_INSTRUMENT"]]]);
  const sr = await call("POST", `/documents/${q.id}/stamp-duty-ref`, kW.rawKey, { ref: "ES-1" });
  const tc2 = await call("GET", `/tax/checks?period=${ym}`, kR.rawKey);
  eq("T56.2", "บันทึกรหัสอากร → เห็นใน tax/checks", [sr.status, tc2.body?.data?.stampDuty?.[0]?.stampDutyRef], [200, "ES-1"]);
  const srBad = await call("POST", `/documents/${inv.id}/stamp-duty-ref`, kW.rawKey, { ref: "ES-2" });
  eq("T56.3", "เอกสารที่ไม่ใช่ใบเสนอราคา/ใบสั่งซื้อ → 422", srBad.status, 422);
  const tcBad = await call("GET", "/tax/checks?period=2026-13", kR.rawKey);
  eq("T56.4", "period ผิดรูป → 422", tcBad.status, 422);

  console.log("\n── T5.7 หนี้สูญ ──");
  const sum0 = await call("GET", "/bad-debt", kR.rawKey);
  eq("T57.1", "bad-debt: ค่าเผื่อ 0 · ลูกหนี้ 3,000 · tiers จากตาราง", [sum0.status, sum0.body?.data?.allowanceSatang, sum0.body?.data?.receivableSatang, sum0.body?.data?.tiers], [200, 0, 300_000, { tier1MaxSatang: 20_000_000, tier2MaxSatang: 200_000_000 }]);
  const al = await call("POST", "/bad-debt/allowance", kW.rawKey, { targetSatang: 100_000 });
  eq("T57.2", "allowance 1,000 → delta 1,000 · คำเตือน BAD_DEBT_ALLOWANCE_ADD_BACK", [al.status, al.body?.data?.deltaSatang, (al.body?.data?.warnings ?? []).map((w: Any) => w.code)], [200, 100_000, ["BAD_DEBT_ALLOWANCE_ADD_BACK"]]);
  const wo = await call("POST", `/documents/${inv.id}/write-off`, kW.rawKey, {});
  eq("T57.3", "write-off ไม่ยืนยัน → 409 legal_ack_required + BAD_DEBT_TAX_CONDITIONS", [wo.status, wo.body?.error?.code, (wo.body?.error?.warnings ?? []).map((w: Any) => w.code)], [409, "legal_ack_required", ["BAD_DEBT_TAX_CONDITIONS"]]);
  const wo2 = await call("POST", `/documents/${inv.id}/write-off`, kW.rawKey, { acknowledge: ["BAD_DEBT_TAX_CONDITIONS"], note: "ทวงถามแล้ว" });
  eq("T57.4", "ยืนยัน → 2xx · ตัด 3,000 · PAID", [wo2.status < 300, wo2.body?.data?.amountSatang, wo2.body?.data?.status], [true, 300_000, "PAID"]);
  const woR = await call("POST", `/documents/${inv.id}/write-off`, kR.rawKey, { acknowledge: ["BAD_DEBT_TAX_CONDITIONS"] });
  eq("T57.5", "คีย์อ่านอย่างเดียว → 403", woR.status, 403);
  const woNo = await call("POST", `/documents/nope-xyz/write-off`, kW.rawKey, { acknowledge: ["BAD_DEBT_TAX_CONDITIONS"] });
  eq("T57.6", "เอกสารที่ไม่มี → 404", woNo.status, 404);
  const sum1 = await call("GET", "/bad-debt", kR.rawKey);
  eq("T57.7", "หลังตัด: ค่าเผื่อใช้หมด 0 · ประวัติ 1 รายการ", [sum1.body?.data?.allowanceSatang, sum1.body?.data?.writeOffs?.length], [0, 1]);
  const ai = await AO.runAccountTool(S.tid, "account_bad_debt", {}, { systemId: SYS, viewer: { role: "OWNER", unitAccess: ["*"], permissions: {} } });
  chk("T57.ai", "เลขา: account_bad_debt อ่านได้ทันที", ai.mode === "read", "read", ai);
  const ai2 = await AO.runAccountTool(S.tid, "account_write_off_bad_debt", { documentId: inv.id }, { systemId: SYS, viewer: { role: "OWNER", unitAccess: ["*"], permissions: {} } });
  chk("T57.ai2", "เลขา: account_write_off_bad_debt = ข้อเสนอ (ไม่ลงบัญชีเอง)", ai2.mode !== "read", "proposal", ai2);
  const ai3 = await AO.runAccountTool(S.tid, "account_report", { kind: "cash-book", from: ym, to: ym }, { systemId: SYS, viewer: { role: "OWNER", unitAccess: ["*"], permissions: {} } });
  chk("T52.ai", "เลขา: account_report kind cash-book อ่านได้ทันที", ai3.mode === "read", "read", ai3);
} catch (e) {
  chk("X", "ไม่มี exception", false, "no error", String((e as Error)?.stack ?? e));
} finally {
  if (prisma) await F.keepOrPurge(prisma, tid, KEEP);
  if (prisma) await prisma.$disconnect();
}

const fl = cks.filter((c) => !c.ok);
console.log(`\n===== QC Account REST — ACC T5 =====\nผ่าน ${cks.length - fl.length}/${cks.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - fl.length, findings: fl.map((c) => c.id) })}`);
process.exit(fl.length ? 1 : 0);
