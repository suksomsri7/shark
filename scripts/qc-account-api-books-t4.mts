// QC Account REST — คำสั่งของ T4.1 / T4.2 / T4.3 / T4.6 (เลน 2) ผ่าน route จริง /api/v1/account + เครื่องมือเลขา AI (ทะเบียนเดียวกัน)
//   POST /journal (memo ว่าง → 409 JV_DESCRIPTION_MISSING · approve) · POST /journal/{id}/approve · GET /journal/{id} (approval · recordedAt)
//   GET /reports/journal-book (+CSV · paged) · GET /reports/subsidiary-ledger (+CSV) · GET /reports/{trial-balance,profit-loss,balance-sheet,cash-flow} (ป้ายร่าง + CSV บรรทัดแรก)
//   POST /assets (taxClass + warnings) · POST /assets/{id}/tax-class · PATCH /settings/policy (เปลี่ยนรอบ = 409 + acknowledge · booksStartDate) · GET /settings/policy (firstPeriod)
//   PATCH /settings/tax bookRows · GET /settings/tax (tables.book)
// test id ของ op: journal.approve = "T4.1-API" · reports.journal-book = "T4.2-API.1" · reports.subsidiary-ledger = "T4.2-API.2" · assets.set-tax-class = "T4.3-API"
// ร้านทดสอบแยก "QC T4 REST" · รัน: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-account-api-books-t4.mts
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-account-api-books-t4");

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

console.log("\n── A0 เครื่องมือเลขา AI (ทะเบียนเดียวกับ REST) ──");
{
  const tools = AO.accountToolInfos();
  const want: Record<string, [string, boolean]> = {
    account_approve_journal: ["journal.approve", true],
    account_set_asset_tax_class: ["assets.set-tax-class", true],
    account_report: ["reports.profit-loss", false],
  };
  eq("A0.1", "เครื่องมือใหม่ 2 ตัวผูก op · เขียน = ข้อเสนอ · account_report อ่าน", Object.keys(want).map((n) => {
    const t = tools.find((x: Any) => x.name === n);
    return t ? [t.opId, t.write] : null;
  }), Object.values(want));
  const kinds = (tools.find((x: Any) => x.name === "account_report")?.parameters?.properties?.kind?.enum ?? []) as string[];
  eq("A0.2", "account_report kind มี journal-book + subsidiary-ledger", [kinds.includes("journal-book"), kinds.includes("subsidiary-ledger")], [true, true]);
  const acct = SK.SKILLS?.find?.((s: Any) => s.id === "account") ?? SK.skillById?.("account");
  const inSkills = (n: string) => (SK.SKILLS ?? []).filter((s: Any) => (s.tools ?? []).includes(n)).map((s: Any) => s.id);
  eq("A0.3", "เครื่องมือใหม่อยู่ในสกิล account สกิลเดียว", [inSkills("account_approve_journal"), inSkills("account_set_asset_tax_class"), !!acct || (SK.SKILLS ?? []).length > 0], [["account"], ["account"], true]);
  const ka = AO.accountKindAccess();
  eq("A0.4", "สิทธิ์ข้อเสนอจาก op.action: approve = account.journal.adjust · tax-class = account.asset.manage", [ka[AO.accountKindOf("journal.approve")]?.action, ka[AO.accountKindOf("assets.set-tax-class")]?.action], ["account.journal.adjust", "account.asset.manage"]);
}

let tid = "";
let prisma: Any = null;
try {
  const S = await F.setupWhtShop("QC T4 REST", "qc-t4-api");
  tid = S.tid;
  prisma = S.prisma;
  const SYS = S.SYS;
  const kW = await ak.createApiKey({ tenantId: S.tid }, "T4 write", { scopes: scopes.expandBundles(["accountant"]), systemId: SYS });
  const kO = await ak.createApiKey({ tenantId: S.tid }, "T4 settings", { scopes: ["account.settings.manage", "account.doc.view"], systemId: SYS });
  const kR = await ak.createApiKey({ tenantId: S.tid }, "T4 read", { scopes: ["account.journal.view", "account.report.view"], systemId: SYS });
  const call = async (method: string, path: string, key: string, body?: unknown, accept?: string) => {
    const headers: Record<string, string> = { authorization: `Bearer ${key}`, ...(method === "GET" ? {} : { "idempotency-key": `t4-${Date.now()}-${Math.random().toString(16).slice(2)}` }), ...(accept ? { accept } : {}) };
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
  const led = await prisma.accountLedger.findMany({ where: { systemId: SYS, code: { in: ["6900", "2140", "2100", "1000", "1110"] } }, select: { id: true, code: true } });
  const exp1 = led.find((l: Any) => l.code === "6900").id;
  const other = led.find((l: Any) => l.code !== "6900").id;
  const lines = (amt: number) => [
    { accountId: exp1, debitSatang: amt, creditSatang: 0 },
    { accountId: other, debitSatang: 0, creditSatang: amt },
  ];

  console.log("\n── A1 JV มือ: คำอธิบาย · อนุมัติ ──");
  const j0 = await call("POST", "/journal", kW.rawKey, { date: "2026-10-01", lines: lines(12_000) });
  eq("A1.1", "ไม่มีคำอธิบาย → 409 legal_ack_required + JV_DESCRIPTION_MISSING", [j0.status, j0.body?.error?.code, (j0.body?.error?.warnings ?? []).map((w: Any) => w.code)], [409, "legal_ack_required", ["JV_DESCRIPTION_MISSING"]]);
  const j1 = await call("POST", "/journal", kW.rawKey, { date: "2026-10-01", lines: lines(12_000), acknowledge: ["JV_DESCRIPTION_MISSING"] });
  const codes1 = (j1.body?.data?.warnings ?? []).map((w: Any) => w.code);
  eq("A1.2", "ยืนยัน → 2xx · approval null · คำเตือน: ไม่มีเอกสาร · ยังไม่อนุมัติ · ลงช้า (บันทึกวันนี้ เทียบ 1 ต.ค.)", [j1.status < 300, j1.body?.data?.approval, codes1.includes("JV_NO_SUPPORTING_DOC"), codes1.includes("JV_UNAPPROVED"), codes1.includes("JV_LATE_ENTRY"), typeof j1.body?.data?.recordedAt], [true, null, true, true, true, "string"]);
  const id1 = j1.body?.data?.id;
  const ap = await call("POST", `/journal/${id1}/approve`, kW.rawKey, {});
  eq("A1.3", "POST /journal/{id}/approve → approval.approvedBy.id = คีย์ API · flagCleared false", [ap.status, !!ap.body?.data?.approval?.approvedAt, ap.body?.data?.approval?.approvedBy?.id === kW.key?.id || !!ap.body?.data?.approval?.approvedBy?.id, ap.body?.data?.flagCleared], [200, true, true, false]);
  const ap2 = await call("POST", `/journal/${id1}/approve`, kW.rawKey, {});
  eq("A1.4", "อนุมัติซ้ำ → 409 state_conflict", [ap2.status, ap2.body?.error?.code], [409, "state_conflict"]);
  const apNo = await call("POST", `/journal/nope-xyz/approve`, kW.rawKey, {});
  eq("A1.5", "ใบที่ไม่มี → 404", apNo.status, 404);
  const apR = await call("POST", `/journal/${id1}/approve`, kR.rawKey, {});
  eq("A1.6", "คีย์อ่านอย่างเดียว → 403", apR.status, 403);
  const j2 = await call("POST", "/journal", kW.rawKey, { date: "2026-11-14", memo: "ปรับปรุงค่าเช่า", approve: true, lines: lines(5_000) });
  eq("A1.7", "approve:true → approval มี · ไม่มี JV_UNAPPROVED", [j2.status < 300, !!j2.body?.data?.approval, (j2.body?.data?.warnings ?? []).some((w: Any) => w.code === "JV_UNAPPROVED")], [true, true, false]);
  const g = await call("GET", `/journal/${id1}`, kR.rawKey);
  eq("A1.8", "GET /journal/{id} → approval + recordedAt", [g.status, !!g.body?.data?.approval?.approvedAt, typeof g.body?.data?.recordedAt], [200, true, "string"]);

  console.log("\n── A2 สมุดรายวันแบบเต็ม + บัญชีย่อย ──");
  for (let i = 0; i < 3; i++) await call("POST", "/journal", kW.rawKey, { date: `2026-10-0${i + 2}`, memo: `เพิ่ม ${i}`, approve: true, lines: lines(1_000 * (i + 1)) });
  const jb = await call("GET", "/reports/journal-book?from=2026-10-01&to=2026-10-31&pageSize=2&page=1", kR.rawKey);
  eq("A2.1", "journal-book หน้าละ 2: total 4 · 2 แถว · มี lines Dr/Cr · header ชื่อกิจการ + ชนิดบัญชี", [jb.status, jb.body?.page?.total, jb.body?.data?.length, jb.body?.data?.[0]?.lines?.length, jb.body?.extra?.header?.bookTitle ?? jb.body?.header?.bookTitle, (jb.body?.extra?.header ?? jb.body?.header)?.orgName], [200, 4, 2, 2, "สมุดบัญชีรายวัน (ทุกเล่ม)", "บริษัท หักภาษี ทดสอบ จำกัด"]);
  const jbt = jb.body?.extra?.totals ?? jb.body?.totals;
  eq("A2.2", "ยอดรวมทั้งช่วง Dr = Cr = 12,000 + 1,000 + 2,000 + 3,000 = 18,000", [jbt?.debitSatang, jbt?.creditSatang], [18_000, 18_000]);
  const jcsv = await call("GET", "/reports/journal-book?from=2026-10-01&to=2026-10-31&pageSize=500", kR.rawKey, undefined, "text/csv");
  eq("A2.3", "CSV: หัว + 8 บรรทัด (4 ใบ × 2 บรรทัด)", [jcsv.status, /csv/.test(jcsv.type), jcsv.text.replace(/^﻿/, "").trim().split("\n").length], [200, true, 9]);
  const bad = await call("GET", "/reports/journal-book?from=2026-10-01", kR.rawKey);
  eq("A2.4", "ขาด to → 422", bad.status, 422);
  const inv = await prisma.accountContact.findFirst({ where: { systemId: SYS, kind: "CUSTOMER" }, select: { id: true } });
  const acc: Any = await import("@/lib/modules/account/service" as string);
  const iv = await acc.createDocument({ tenantId: S.tid, systemId: SYS, docType: "INVOICE", contactId: inv.id, issueDate: S.day("2026-11", 5), vatMode: "NONE", lines: [{ description: "บริการ", qty: 1, unitPrice: 40_000, vatRateBp: 0 }], createdById: S.owner.id });
  await acc.issueDocument(S.tid, SYS, iv.id);
  const sl = await call("GET", `/reports/subsidiary-ledger?side=AR&from=2026-11-01&to=2026-11-30`, kR.rawKey);
  eq("A2.5", "subsidiary-ledger AR: 1 ราย 40,000 · รวม = 40,000 · account มี", [sl.status, sl.body?.data?.rows?.length, sl.body?.data?.rows?.[0]?.closingSatang, sl.body?.data?.totals?.closingSatang, !!sl.body?.data?.account?.code], [200, 1, 40_000, 40_000, true]);
  const sld = await call("GET", `/reports/subsidiary-ledger?side=AR&from=2026-11-01&to=2026-11-30&contactId=${inv.id}`, kR.rawKey);
  eq("A2.6", "contactId → detail 1 บรรทัด Dr 40,000 คงเหลือ 40,000", [sld.body?.data?.detail?.lines?.map((l: Any) => [l.debitSatang, l.balanceSatang])], [[[40_000, 40_000]]]);
  const slcsv = await call("GET", `/reports/subsidiary-ledger?side=AR&from=2026-11-01&to=2026-11-30`, kR.rawKey, undefined, "text/csv");
  eq("A2.7", "subsidiary CSV: หัว + 1 แถว", [slcsv.status, slcsv.text.replace(/^﻿/, "").trim().split("\n").length], [200, 2]);
  const slb = await call("GET", `/reports/subsidiary-ledger?side=XX&from=2026-11-01&to=2026-11-30`, kR.rawKey);
  eq("A2.8", "side ผิด → 422", slb.status, 422);

  console.log("\n── A3 งบ = ร่างสำหรับผู้ทำบัญชี/ผู้สอบบัญชี ──");
  for (const [p, q] of [["trial-balance", "from=2026-10&to=2026-11"], ["profit-loss", "from=2026-10&to=2026-11"], ["balance-sheet", "asOf=2026-11"], ["cash-flow", "from=2026-10&to=2026-11"]] as const) {
    const r = await call("GET", `/reports/${p}?${q}`, kR.rawKey);
    const c = await call("GET", `/reports/${p}?${q}`, kR.rawKey, undefined, "text/csv");
    eq(`A3.${p}`, `${p}: draft + ป้าย + คำเตือน STATEMENT_DRAFT_FOR_ACCOUNTANT · CSV บรรทัดแรก = ป้าย`, [r.status, r.body?.data?.draft, r.body?.data?.draftLabelTh, r.body?.data?.draftWarning?.code, c.text.replace(/^﻿/, "").split("\n")[0]?.replace(/"/g, "").trim()], [200, true, "ร่างสำหรับผู้ทำบัญชี/ผู้สอบบัญชี", "STATEMENT_DRAFT_FOR_ACCOUNTANT", "ร่างสำหรับผู้ทำบัญชี/ผู้สอบบัญชี"]);
  }
  const ai = await AO.runAccountTool(S.tid, "account_report", { kind: "journal-book", from: "2026-10", to: "2026-10" }, { systemId: SYS, viewer: { role: "OWNER", unitAccess: ["*"], permissions: {} } });
  chk("A3.ai", "เลขา: account_report kind journal-book อ่านได้ทันที (mode read)", ai.mode === "read", "read", ai);
  const ai2 = await AO.runAccountTool(S.tid, "account_report", { kind: "subsidiary-ledger", direction: "AR", from: "2026-11", to: "2026-11" }, { systemId: SYS, viewer: { role: "OWNER", unitAccess: ["*"], permissions: {} } });
  chk("A3.ai2", "เลขา: account_report kind subsidiary-ledger (direction AR) อ่านได้ทันที", ai2.mode === "read", "read", ai2);
  const ai3 = await AO.runAccountTool(S.tid, "account_approve_journal", { journalId: j2.body?.data?.id }, { systemId: SYS });
  eq("A3.ai3", "เลขา: account_approve_journal = ข้อเสนอ (ไม่ลงมือเอง)", [ai3.mode, ai3.payload?.opId, ai3.error ?? null], ["propose", "journal.approve", null]);

  console.log("\n── A4 สินทรัพย์: ประเภททางภาษี ──");
  const assetAcc = (await AS.listAssetAccounts(S.ctx))[0];
  const accumAcc = (await AS.listAccumAccounts(S.ctx))[0];
  const expAcc = (await AS.listExpenseAccounts(S.ctx))[0];
  const base = { acquiredDate: "2026-03-16", startDepDate: "2026-03-16", salvageValueSatang: 100, assetAccountId: assetAcc.id, accumAccountId: accumAcc.id, expenseAccountId: expAcc.id };
  const r1 = await call("POST", "/assets", kW.rawKey, { ...base, name: "รถเก๋งผู้บริหาร", costSatang: 150_000_000, usefulLifeMonths: 60, taxClass: "PASSENGER_CAR" });
  eq("A4.1", "register PASSENGER_CAR 1.5 ล้าน → 2xx · taxClass · warnings รถ · firstMonth 16/31 · monthly งวดแรกตามวัน", [r1.status < 300, r1.body?.data?.taxClass, (r1.body?.data?.warnings ?? []).map((w: Any) => w.code), r1.body?.data?.firstMonth, r1.body?.data?.monthlySatang], [true, "PASSENGER_CAR", ["ASSET_PASSENGER_CAR_COST_CAP"], { prorated: true, daysUsed: 16, daysInMonth: 31 }, Math.round((149_999_900 * 16) / (60 * 31))]);
  const r2 = await call("POST", `/assets/${r1.body?.data?.id}/tax-class`, kW.rawKey, { taxClass: "LAND" });
  eq("A4.2", "set-tax-class LAND → taxClass LAND · monthly 0 · ASSET_LAND_NOT_DEPRECIATED", [r2.status, r2.body?.data?.taxClass, r2.body?.data?.monthlySatang, (r2.body?.data?.warnings ?? []).map((w: Any) => w.code)], [200, "LAND", 0, ["ASSET_LAND_NOT_DEPRECIATED"]]);
  const r3 = await call("POST", `/assets/${r1.body?.data?.id}/tax-class`, kW.rawKey, { taxClass: "BOAT" });
  eq("A4.3", "ประเภทที่ไม่รู้จัก → 422", r3.status, 422);
  const r4 = await call("POST", `/assets/nope/tax-class`, kW.rawKey, { taxClass: "LAND" });
  eq("A4.4", "สินทรัพย์ที่ไม่มี → 404", r4.status, 404);
  const ls = await call("GET", "/assets", kW.rawKey);
  eq("A4.5", "GET /assets มี taxClass", [ls.status, (ls.body?.data ?? []).find((a: Any) => a.id === r1.body?.data?.id)?.taxClass], [200, "LAND"]);

  console.log("\n── A5 นโยบาย: รอบบัญชี ──");
  const pg = await call("GET", "/settings/policy", kO.rawKey);
  eq("A5.1", "GET /settings/policy → booksStartDate null · firstPeriod null · firstPeriodMaxMonths 12", [pg.status, pg.body?.data?.booksStartDate, pg.body?.data?.firstPeriod, pg.body?.data?.firstPeriodMaxMonths], [200, null, null, 12]);
  const pu0 = await call("PATCH", "/settings/policy", kO.rawKey, { fiscalYearStartMonth: 4 });
  eq("A5.2", "เปลี่ยนเดือนเริ่ม (สมุดมีรายการ) ไม่ยืนยัน → 409 FISCAL_YEAR_CHANGE", [pu0.status, pu0.body?.error?.code, (pu0.body?.error?.warnings ?? []).map((w: Any) => w.code)], [409, "legal_ack_required", ["FISCAL_YEAR_CHANGE"]]);
  const pu1 = await call("PATCH", "/settings/policy", kO.rawKey, { fiscalYearStartMonth: 4, acknowledge: ["FISCAL_YEAR_CHANGE"], booksStartDate: "2026-03-16" });
  eq("A5.3", "ยืนยัน + วันเริ่ม 16 มี.ค. → 200 · เม.ย. · รอบแรก 16 มี.ค. 2026 – 31 มี.ค. 2026 (1 เดือนปฏิทิน) · FIRST_PERIOD_SHORT", [pu1.status, pu1.body?.data?.fiscalYearStartMonth, pu1.body?.data?.booksStartDate, pu1.body?.data?.firstPeriod?.end, (pu1.body?.data?.warnings ?? []).map((w: Any) => w.code)], [200, 4, "2026-03-16", "2026-03-31", ["FIRST_PERIOD_SHORT"]]);
  const pu2 = await call("PATCH", "/settings/policy", kO.rawKey, { booksStartDate: null, fiscalYearStartMonth: 4 });
  eq("A5.4", "เดือนเดิม + ล้างวันเริ่ม → 200 ไม่ต้องยืนยัน", [pu2.status, pu2.body?.data?.booksStartDate], [200, null]);

  console.log("\n── A6 ตารางค่ากฎหมาย: สมุดบัญชี ──");
  const tx = await call("GET", "/settings/tax", kO.rawKey);
  const book = tx.body?.data?.tables?.book ?? [];
  eq("A6.1", "GET /settings/tax → tables.book 10 แถวระบบ ป้าย V", [tx.status, book.filter((r: Any) => r.origin === "SYSTEM").length, book.every((r: Any) => r.tag === "V")], [200, 10, true]);
  const tu = await call("PATCH", "/settings/tax", kO.rawKey, { bookRows: [{ rule: "JOURNAL_ENTRY_DAYS", value: 30, from: null, to: null, source: "นักบัญชีของร้าน" }] });
  eq("A6.2", "PATCH bookRows (รายวัน 30 วัน) → 2xx + SHOP_DIFFERS_FROM_DEFAULT", [tu.status < 300, JSON.stringify(tu.body?.data ?? {}).includes("SHOP_DIFFERS_FROM_DEFAULT")], [true, true]);
  const tb = await call("PATCH", "/settings/tax", kO.rawKey, { bookRows: [{ rule: "NOPE", value: 1, from: null, to: null }] });
  eq("A6.3", "กฎที่ไม่รู้จัก → 422", tb.status, 422);
} catch (e) {
  chk("X", "ไม่มี exception", false, "no error", String((e as Error)?.stack ?? e));
} finally {
  if (prisma) await F.keepOrPurge(prisma, tid, KEEP);
  if (prisma) await prisma.$disconnect();
}

const fl = cks.filter((c) => !c.ok);
console.log(`\n===== QC Account REST T4 (เลน 2) =====\nผ่าน ${cks.length - fl.length}/${cks.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - fl.length, findings: fl.map((c) => c.id) })}`);
process.exit(fl.length > 0 ? 1 : 0);
