// QC — API บัญชี WO B4: READ บัญชี — ผังบัญชี / mapping / สมุดรายวัน / แยกประเภท / งบ 6 ตัว (+CSV) / งวด / สินทรัพย์ / audit / ตั้งค่า / นโยบาย / เชื่อมต่อ / คลังเอกสาร / กล่องขาเข้า / glossary
// Fable oracle · Builder ห้ามแตะ · สัญญาอยู่ที่ ledger/ACCOUNT-API-RUN.md §B4
// requires: acc-v2-seed (SIAM DIVE QC + scripts/acc-v2-expected.json)
// ⚠️ standalone-typesafe: dynamic import + wide cast
import { readFileSync } from "node:fs";
const accEnv = (await import("./acc-v2-env.mts" as string)) as {
  loadQcEnv: () => { databaseUrl: string; host: string };
  QC: { expectedPath: string };
};
const { loadQcEnv, QC } = accEnv;
loadQcEnv();
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
const E = JSON.parse(readFileSync(QC.expectedPath, "utf8")) as Any;
const W = E.wo62;
const SYS: string = E.systemId;
const TID: string = E.tenantId;
const ymd = /^\d{4}-\d{2}-\d{2}$/;
const noLeak = (v: unknown) => { const s = JSON.stringify(v); return !/"tenantId"|"systemId"|"keyHash"|"href"/.test(s); };
const sumBy = (rows: Any[], k: string) => rows.reduce((s, r) => s + (r?.[k] ?? 0), 0);

let tidB = "";
try {
  const ak = (await import("@/lib/api-keys/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const scopes = (await import("@/lib/api-keys/scopes" as string)) as Record<string, Any>;
  const route = (await import("@/app/api/v1/account/[...path]/route" as string)) as Record<string, (req: Request, ctx: { params: Promise<{ path: string[] }> }) => Promise<Response>>;
  const readOnly = scopes.expandBundles(["read-only"]) as string[];
  const kRead = await ak.createApiKey({ tenantId: TID }, "QC B4 read", { scopes: readOnly, systemId: SYS });
  const kAcct = await ak.createApiKey({ tenantId: TID }, "QC B4 accountant", { scopes: scopes.expandBundles(["accountant", "settings"]), systemId: SYS });
  const tB = await prisma.tenant.create({ data: { name: "QC B4 other", slug: `qc-b4-${Date.now()}` } });
  tidB = tB.id;
  const accB = await sys.createSystem(tidB, "ACCOUNT", "บัญชี B");
  const kB = await ak.createApiKey({ tenantId: tidB }, "QC B4 B", { scopes: scopes.expandBundles(["accountant"]), systemId: accB.id });

  const call = async (method: string, path: string, key: string, headers: Record<string, string> = {}) => {
    const req = new Request(`http://x/api/v1/account${path}`, { method, headers: { authorization: `Bearer ${key}`, ...headers } });
    const segs = path.split("?")[0]!.split("/").filter(Boolean);
    const res = await route[method]!(req, { params: Promise.resolve({ path: segs }) });
    const text = await res.text();
    let body: Any = null; try { body = JSON.parse(text); } catch { body = { _raw: text }; }
    return { status: res.status, headers: res.headers, body, text };
  };
  const K = kAcct.rawKey;
  const R = kRead.rawKey;

  // ═══ G1 chart / mappings ═══
  const chart = await call("GET", "/chart", R);
  const flat = chart.body?.data?.accounts as Any[];
  chk("B4-G1.1", "GET /chart → 200 accounts[] (id/code/name/type/parentId/level/isSystem/active/balanceSatang) มี 1100 และ 4000", chart.status === 200 && Array.isArray(flat) && flat.some((a) => a.code === "1100") && flat.some((a) => a.code === "4000") && flat.every((a) => typeof a.code === "string" && typeof a.type === "string" && typeof a.active === "boolean" && Number.isInteger(a.balanceSatang) && Number.isInteger(a.level)), "ครบ", `${chart.status} ${JSON.stringify(flat?.[0]).slice(0, 200)}`);
  chk("B4-G1.2", "chart มี tree[] (children ซ้อน) + totalsByType", Array.isArray(chart.body?.data?.tree) && !!chart.body?.data?.totalsByType, "ครบ", JSON.stringify(Object.keys(chart.body?.data ?? {})), "MAJOR");
  const a1100 = flat?.find((a) => a.code === "1100");
  const led = await call("GET", `/chart/${a1100?.id}`, R);
  chk("B4-G1.3", "GET /chart/{id} → account + balanceSatang + monthMovement{debitSatang,creditSatang} + recentLines[] + mappings[] + financeAccounts[]", led.status === 200 && led.body?.data?.account?.code === "1100" && Number.isInteger(led.body?.data?.balanceSatang) && Array.isArray(led.body?.data?.recentLines) && Array.isArray(led.body?.data?.mappings), "ครบ", `${led.status} ${JSON.stringify(Object.keys(led.body?.data ?? {}))}`);
  chk("B4-G1.4", "balanceSatang ของ 1100 ใน detail = ใน chart", led.body?.data?.balanceSatang === a1100?.balanceSatang, `${a1100?.balanceSatang}`, `${led.body?.data?.balanceSatang}`);
  const chartAsOf = await call("GET", "/chart?asOf=2026-01-01", R);
  chk("B4-G1.5", "asOf=2026-01-01 → ยอด 1100 ต่างจากปัจจุบัน", chartAsOf.status === 200 && (chartAsOf.body?.data?.accounts as Any[])?.find((a) => a.code === "1100")?.balanceSatang !== a1100?.balanceSatang, "ต่าง", `${chartAsOf.status}`, "MAJOR");
  const maps = await call("GET", "/mappings", K);
  chk("B4-G1.6", "GET /mappings (scope mapping.manage) → data[{key,label,account{id,code,name}|null}] มี AR/AP/VAT_OUTPUT/VAT_INPUT", maps.status === 200 && ["AR", "AP", "VAT_OUTPUT", "VAT_INPUT"].every((k) => (maps.body?.data ?? []).some((m: Any) => m.key === k && m.account?.code)), "ครบ", `${maps.status} ${JSON.stringify(maps.body?.data?.slice(0, 3))}`);
  const mapsDenied = await call("GET", "/mappings", R);
  chk("B4-G1.7", "read-only ขอ mappings → 403", mapsDenied.status === 403, "403", `${mapsDenied.status}`);
  const dta = await call("GET", "/doc-type-accounts", K);
  chk("B4-G1.8", "GET /doc-type-accounts → data[{docType,account{code,name}|null}]", dta.status === 200 && Array.isArray(dta.body?.data), "array", `${dta.status}`, "MAJOR");

  // ═══ G2 journal ═══
  const jl = await call("GET", "/journal?range=all&pageSize=50", R);
  chk("B4-G2.1", "GET /journal?range=all → data[] + page + byBook ตรงเฉลย (SALES/PURCHASES/RECEIPTS/PAYMENTS/GENERAL) + page.total = เฉลย entries", jl.status === 200 && Object.entries(W.byBook as Record<string, number>).every(([b, n]) => jl.body?.byBook?.[b] === n) && jl.body?.page?.total === W.entries, JSON.stringify(W.byBook), `${jl.status} ${JSON.stringify(jl.body?.byBook)} total=${jl.body?.page?.total}`);
  const j0 = jl.body?.data?.[0];
  chk("B4-G2.2", "แถวสมุดรายวันมี id/journalNo/date/period/book/memo/status/needsReview/debitSatang/creditSatang/ref{type,id,docNo}", !!j0 && typeof j0.journalNo === "string" && ymd.test(j0.date) && typeof j0.book === "string" && typeof j0.needsReview === "boolean" && Number.isInteger(j0.debitSatang) && j0.debitSatang === j0.creditSatang && "ref" in j0, "ครบ", JSON.stringify(j0).slice(0, 240));
  const flagged = await call("GET", "/journal?range=all&needsReview=true", R);
  chk("B4-G2.3", "needsReview=true → total = เฉลย needsReview", flagged.body?.page?.total === W.needsReview, `${W.needsReview}`, `${flagged.body?.page?.total}`);
  const book = await call("GET", "/journal?range=all&book=GENERAL&pageSize=100", R);
  chk("B4-G2.4", "book=GENERAL → total = เฉลย · ทุกแถว book GENERAL", book.body?.page?.total === W.byBook.GENERAL && (book.body?.data ?? []).every((r: Any) => r.book === "GENERAL"), `${W.byBook.GENERAL}`, `${book.body?.page?.total}`);
  const sept = await call("GET", "/journal?from=2026-09-01&to=2026-09-30&pageSize=200", R);
  chk("B4-G2.5", "from/to ก.ย. → total = เฉลย septRange.entries · Σdebit = เฉลย", sept.body?.page?.total === W.septRange.entries && sept.body?.totals?.debitSatang === W.septRange.debit, `${W.septRange.entries}/${W.septRange.debit}`, `${sept.body?.page?.total}/${sept.body?.totals?.debitSatang}`);
  const je = await call("GET", `/journal/${W.fixtures.manualJvId}`, R);
  const jd = je.body?.data;
  chk("B4-G2.6", "GET /journal/{id} (JV มือ) → lines[{account{code,name},debitSatang,creditSatang,memo}] Σdr=Σcr · book GENERAL · source MANUAL", je.status === 200 && Array.isArray(jd?.lines) && sumBy(jd.lines, "debitSatang") === sumBy(jd.lines, "creditSatang") && jd.book === "GENERAL" && jd.lines.every((l: Any) => l.account?.code), "สมดุล", `${je.status} ${JSON.stringify(jd).slice(0, 240)}`);
  const rev = await call("GET", `/journal/${W.fixtures.reversedJvId}`, R);
  chk("B4-G2.7", "JV ที่ถูกกลับรายการ → status REVERSED + reversal{id,journalNo}", rev.status === 200 && rev.body?.data?.status === "REVERSED" && rev.body?.data?.reversal?.id === W.fixtures.reversalJvId, "REVERSED", `${rev.status} ${rev.body?.data?.status} ${JSON.stringify(rev.body?.data?.reversal)}`);
  const jnf = await call("GET", "/journal/does-not-exist", R);
  chk("B4-G2.8", "JV ไม่มี → 404", jnf.status === 404, "404", `${jnf.status}`);
  const jcross = await call("GET", `/journal/${W.fixtures.manualJvId}`, kB.rawKey);
  chk("B4-G2.9", "คีย์ร้านอื่น → 404", jcross.status === 404, "404", `${jcross.status}`);

  // ═══ G3 general ledger + reports ═══
  const a6100 = flat?.find((a) => a.code === "6100");
  const gl = await call("GET", `/reports/general-ledger?accountId=${a6100?.id}&from=2026-09-01&to=2026-09-30`, R);
  const g = gl.body?.data;
  chk("B4-G3.1", "GET /reports/general-ledger?accountId&from&to → account + openingSatang + rows[{date,journalNo,memo,debitSatang,creditSatang,balanceSatang}] + closingSatang · Σdebit ตรง drill เฉลย 6100", gl.status === 200 && g?.account?.code === "6100" && Number.isInteger(g?.openingSatang) && Array.isArray(g?.rows) && g.rows.length === W.drill["6100"].lines && sumBy(g.rows, "debitSatang") === W.drill["6100"].debit && sumBy(g.rows, "creditSatang") === W.drill["6100"].credit, JSON.stringify(W.drill["6100"]), `${gl.status} rows=${g?.rows?.length} dr=${sumBy(g?.rows ?? [], "debitSatang")}`);
  chk("B4-G3.2", "general ledger running balance ต่อเนื่อง + closing = แถวสุดท้าย", (g?.rows ?? []).every((r: Any, i: number) => r.balanceSatang === (i === 0 ? g.openingSatang : g.rows[i - 1].balanceSatang) + r.debitSatang - r.creditSatang) && (g?.rows?.length === 0 || g?.closingSatang === g?.rows?.[g.rows.length - 1]?.balanceSatang), "ต่อเนื่อง", "?");
  const glCsv = await call("GET", `/reports/general-ledger?accountId=${a6100?.id}&from=2026-09-01&to=2026-09-30`, R, { accept: "text/csv" });
  chk("B4-G3.3", "general-ledger CSV (BOM + rows+1 บรรทัด)", /text\/csv/.test(glCsv.headers.get("content-type") ?? "") && glCsv.text.charCodeAt(0) === 0xfeff, "csv", `${glCsv.headers.get("content-type")}`, "MAJOR");
  const tb = await call("GET", "/reports/trial-balance?from=2026-09-01&to=2026-09-30", R);
  chk("B4-G3.4", "GET /reports/trial-balance?from&to → rows[{code,name,type,openingDebitSatang,…,closingCreditSatang}] + totals + balanced=true", tb.status === 200 && Array.isArray(tb.body?.data?.rows) && tb.body.data.balanced === true && Number.isInteger(tb.body?.data?.totals?.closingDebitSatang) && tb.body.data.totals.closingDebitSatang === tb.body.data.totals.closingCreditSatang, "balanced", `${tb.status} ${JSON.stringify(tb.body?.data?.totals)}`);
  const tbMonth = await call("GET", "/reports/trial-balance?from=2026-09&to=2026-09", R);
  chk("B4-G3.5", "trial-balance รับ from/to แบบ YYYY-MM ได้ (ทั้งเดือน) ผลเท่ากับ YYYY-MM-DD", tbMonth.status === 200 && JSON.stringify(tbMonth.body?.data?.totals) === JSON.stringify(tb.body?.data?.totals), "เท่ากัน", `${tbMonth.status}`, "MAJOR");
  const pl = await call("GET", "/reports/profit-loss?from=2026-09&to=2026-09&compare=true", R);
  const pld = pl.body?.data;
  chk("B4-G3.6", "GET /reports/profit-loss?from&to&compare → revenue/cogs/expenses{rows,totalSatang} + grossProfitSatang + netProfitSatang + compare{…}", pl.status === 200 && Number.isInteger(pld?.revenue?.totalSatang) && Number.isInteger(pld?.netProfitSatang) && !!pld?.compare && Number.isInteger(pld?.compare?.netProfitSatang), "ครบ", `${pl.status} ${JSON.stringify(Object.keys(pld ?? {}))}`);
  chk("B4-G3.7", "netProfit = revenue − cogs − expenses", pld && pld.netProfitSatang === pld.revenue.totalSatang - pld.cogs.totalSatang - pld.expenses.totalSatang, "สมการตรง", `${pld?.netProfitSatang}`);
  const bs = await call("GET", "/reports/balance-sheet?asOf=2026-09", R);
  const bsd = bs.body?.data;
  chk("B4-G3.8", "GET /reports/balance-sheet?asOf → assets/liabilities/equity{rows,totalSatang} + retainedEarningsSatang + currentPeriodProfitSatang + totalEquitySatang · สมดุล assets = liabilities + totalEquity", bs.status === 200 && Number.isInteger(bsd?.assets?.totalSatang) && bsd.assets.totalSatang === bsd.liabilities.totalSatang + bsd.totalEquitySatang, "สมดุล", `${bs.status} a=${bsd?.assets?.totalSatang} l=${bsd?.liabilities?.totalSatang} e=${bsd?.totalEquitySatang}`);
  const cf = await call("GET", "/reports/cash-flow?from=2026-09-01&to=2026-09-30", R);
  const cfd = cf.body?.data;
  chk("B4-G3.9", "GET /reports/cash-flow → openingCashSatang + operating/investing/financing{rows,totalSatang} + netChangeSatang + closingCashSatang · closing = opening + net", cf.status === 200 && Number.isInteger(cfd?.openingCashSatang) && cfd.closingCashSatang === cfd.openingCashSatang + cfd.netChangeSatang, "สมการตรง", `${cf.status} ${JSON.stringify(cfd).slice(0, 160)}`);
  const vat = await call("GET", "/reports/vat-pp30?period=2026-09", R);
  chk("B4-G3.10", "GET /reports/vat-pp30?period → output/input{baseSatang,vatSatang,rows} + carryForwardSatang + netPayableSatang + creditCarrySatang", vat.status === 200 && Number.isInteger(vat.body?.data?.output?.vatSatang) && Number.isInteger(vat.body?.data?.input?.vatSatang) && Number.isInteger(vat.body?.data?.netPayableSatang), "ครบ", `${vat.status} ${JSON.stringify(Object.keys(vat.body?.data ?? {}))}`);
  const vatCsv = await call("GET", "/reports/vat-pp30?period=2026-09", R, { accept: "text/csv" });
  chk("B4-G3.11", "vat-pp30 CSV (ไฟล์ยื่น) BOM", /text\/csv/.test(vatCsv.headers.get("content-type") ?? "") && vatCsv.text.charCodeAt(0) === 0xfeff, "csv", `${vatCsv.headers.get("content-type")}`, "MAJOR");
  const ar = await call("GET", "/reports/aging?direction=AR", R);
  const ard = ar.body?.data;
  chk("B4-G3.12", "GET /reports/aging?direction=AR → rows[{contact{id,name},buckets{current,d1_30,d31_60,d61_90,d90plus},totalSatang,docs,overdueDocs}] + grand · grand.totalSatang = เฉลย receivable", ar.status === 200 && Array.isArray(ard?.rows) && ard?.grand?.totalSatang === E.receivable && ard.rows.every((r: Any) => Number.isInteger(r.totalSatang) && r.buckets && Number.isInteger(r.buckets.current)), `${E.receivable}`, `${ar.status} ${ard?.grand?.totalSatang}`);
  const ap = await call("GET", "/reports/aging?direction=AP", R);
  chk("B4-G3.13", "aging AP grand.totalSatang = เฉลย payable", ap.body?.data?.grand?.totalSatang === E.payable, `${E.payable}`, `${ap.body?.data?.grand?.totalSatang}`);
  const agingBad = await call("GET", "/reports/aging?direction=XX", R);
  chk("B4-G3.14", "direction ไม่ถูกต้อง → 422", agingBad.status === 422, "422", `${agingBad.status}`, "MAJOR");
  const tbCsv = await call("GET", "/reports/trial-balance?from=2026-09&to=2026-09", R, { accept: "text/csv" });
  chk("B4-G3.15", "trial-balance CSV BOM + จำนวนบรรทัด = rows+หัว+รวม", /text\/csv/.test(tbCsv.headers.get("content-type") ?? "") && tbCsv.text.charCodeAt(0) === 0xfeff && tbCsv.text.trim().split("\n").length >= (tb.body?.data?.rows?.length ?? 0) + 1, "csv", `${tbCsv.headers.get("content-type")}`, "MAJOR");

  // ═══ G4 periods ═══
  const periods = await call("GET", "/periods", K);
  const pr = periods.body?.data as Any[];
  chk("B4-G4.1", "GET /periods (scope period.close) → data[{period,status,entryCount,closedAt,closedBy,vatFiled}] · 2026-08 CLOSED+vatFiled · 2026-09 OPEN", periods.status === 200 && pr?.find((p) => p.period === "2026-08")?.status === "CLOSED" && pr?.find((p) => p.period === "2026-08")?.vatFiled === true && pr?.find((p) => p.period === "2026-09")?.status === "OPEN", "ตรงเฉลย", `${periods.status} ${JSON.stringify(pr?.slice(0, 3))}`);
  const chkl = await call("GET", "/periods/2026-09/checklist", K);
  chk("B4-G4.2", "GET /periods/{key}/checklist → items[{key,label,ok,detail}] + canClose", chkl.status === 200 && Array.isArray(chkl.body?.data?.items) && chkl.body.data.items.length >= 3 && typeof chkl.body?.data?.canClose === "boolean", "ครบ", `${chkl.status} ${JSON.stringify(chkl.body?.data).slice(0, 200)}`);
  const chkBad = await call("GET", "/periods/2026-13/checklist", K);
  chk("B4-G4.3", "period ผิดรูป → 422", chkBad.status === 422, "422", `${chkBad.status}`, "MAJOR");
  const perDenied = await call("GET", "/periods", R);
  chk("B4-G4.4", "read-only (ไม่มี period.close) ขอ /periods → 200 (อ่านสถานะงวดใช้ report.view ก็พอ)", perDenied.status === 200, "200", `${perDenied.status}`, "MAJOR");

  // ═══ G5 assets ═══
  const assets = await call("GET", "/assets", K);
  const fa1 = (assets.body?.data as Any[])?.find((a) => a.code === "FA-0001");
  const e1 = W.assets[0];
  chk("B4-G5.1", "GET /assets (scope asset.manage) → FA-0001 cost/salvage/usefulLifeMonths/monthlySatang/accumDepreciationSatang/netBookValueSatang/periodsPosted ตรงเฉลย", assets.status === 200 && !!fa1 && fa1.costSatang === e1.cost && fa1.salvageValueSatang === e1.salvageValue && fa1.usefulLifeMonths === e1.usefulLifeMonths && fa1.monthlySatang === e1.monthlyAmount && fa1.accumDepreciationSatang === e1.accumDepreciation && fa1.netBookValueSatang === e1.netBookValue && fa1.periodsPosted === e1.periods, JSON.stringify(e1), `${assets.status} ${JSON.stringify(fa1).slice(0, 240)}`);
  const asset = await call("GET", `/assets/${e1.id}`, K);
  chk("B4-G5.2", "GET /assets/{id} → asset + depreciations[{period,amountSatang,journalNo}] + accounts{asset,accum,expense}", asset.status === 200 && Array.isArray(asset.body?.data?.depreciations) && asset.body.data.depreciations.length === e1.periods && asset.body.data.depreciations[0]?.period === W.depreciationRows[0].periodKey && !!asset.body?.data?.accounts?.asset?.code, "ครบ", `${asset.status} ${JSON.stringify(asset.body?.data?.depreciations?.[0])}`);
  const prev = await call("GET", "/assets/depreciation/preview?period=2026-09", K);
  chk("B4-G5.3", "GET /assets/depreciation/preview?period=2026-09 → rows[] + totalSatang = เฉลย + postableCount + alreadyPostedCount", prev.status === 200 && prev.body?.data?.totalSatang === W.depreciationPreviewSept && Number.isInteger(prev.body?.data?.postableCount), `${W.depreciationPreviewSept}`, `${prev.status} ${prev.body?.data?.totalSatang}`);
  const assetsDenied = await call("GET", "/assets", R);
  chk("B4-G5.4", "read-only ขอ /assets → 403", assetsDenied.status === 403, "403", `${assetsDenied.status}`);

  // ═══ G6 audit / settings / policy / links ═══
  const audit = await call("GET", "/audit?take=5", K);
  chk("B4-G6.1", "GET /audit (scope settings.manage) → data[{id,at,actorType,actor{id,name}|null,action,actionLabel,targetType,targetId,before,after}] + nextCursor", audit.status === 200 && Array.isArray(audit.body?.data) && audit.body.data.length >= 1 && audit.body.data.every((a: Any) => typeof a.action === "string" && typeof a.actorType === "string" && typeof a.at === "string") && "nextCursor" in (audit.body ?? {}), "ครบ", `${audit.status} ${JSON.stringify(audit.body?.data?.[0]).slice(0, 200)}`);
  const auditByTarget = await call("GET", `/audit?targetId=${W.fixtures.manualJvId}`, K);
  chk("B4-G6.2", "audit?targetId= กรองได้", auditByTarget.status === 200 && (auditByTarget.body?.data ?? []).every((a: Any) => a.targetId === W.fixtures.manualJvId), "ตรง", `${auditByTarget.status}`, "MAJOR");
  const auditDenied = await call("GET", "/audit", R);
  chk("B4-G6.3", "read-only ขอ /audit → 403", auditDenied.status === 403, "403", `${auditDenied.status}`);
  const settings = await call("GET", "/settings", R);
  const sd = settings.body?.data;
  chk("B4-G6.4", "GET /settings (doc.view) → { orgName, taxId, branchCode, address, phone, email, vatRegistered, vatRateBp, taxPointBasis, fiscalYearStartMonth, currency:'THB', logoUrl } — ไม่มี stamp/signature URL", settings.status === 200 && typeof sd?.orgName === "string" && typeof sd?.vatRegistered === "boolean" && Number.isInteger(sd?.vatRateBp) && sd?.currency === "THB" && !("signatureUrl" in (sd ?? {})) && !("stampUrl" in (sd ?? {})), "ครบ", `${settings.status} ${JSON.stringify(Object.keys(sd ?? {}))}`);
  const policy = await call("GET", "/settings/policy", K);
  chk("B4-G6.5", "GET /settings/policy (settings.manage) → policy ครบ (fiscalYearStartMonth, vatTiming, whtDefaults, lockBeforeDate, dupNamePolicy, autoClose, emailReports…)", policy.status === 200 && !!policy.body?.data && "lockBeforeDate" in policy.body.data && "fiscalYearStartMonth" in policy.body.data, "ครบ", `${policy.status} ${JSON.stringify(Object.keys(policy.body?.data ?? {}))}`);
  const policyDenied = await call("GET", "/settings/policy", R);
  chk("B4-G6.6", "read-only ขอ /settings/policy → 403", policyDenied.status === 403, "403", `${policyDenied.status}`);
  const docSettings = await call("GET", "/settings/documents", K);
  chk("B4-G6.7", "GET /settings/documents → data[{docType,prefix,pattern,nextNo,example,reset,dueDays,notes,publicLink,autoTaxInvoice,printTemplate}]", docSettings.status === 200 && Array.isArray(docSettings.body?.data) && docSettings.body.data.some((d: Any) => d.docType === "INVOICE" && typeof d.example === "string"), "ครบ", `${docSettings.status} ${JSON.stringify(docSettings.body?.data?.[0]).slice(0, 200)}`);
  const links = await call("GET", "/links", K);
  chk("B4-G6.8", "GET /links → data[{kind,label,status,linkedSystem{id,name}|null,options{…},accountCodes,lastPostedAt,monthCount}] · POS linked", links.status === 200 && Array.isArray(links.body?.data) && links.body.data.find((l: Any) => l.kind === "POS")?.status === "linked", "POS linked", `${links.status} ${JSON.stringify(links.body?.data?.[0]).slice(0, 200)}`);

  // ═══ G7 files / inbox / glossary ═══
  const kDoc = await ak.createApiKey({ tenantId: TID }, "QC B4 docs", { scopes: [...readOnly, "account.document.manage"], systemId: SYS });
  const files = await call("GET", "/files?pageSize=10", kDoc.rawKey);
  chk("B4-G7.1", "GET /files (document.manage) → data[{id,fileName,mime,sizeBytes,url,status,folder,document{id,docNo}|null,uploadedAt,uploadedBy}] + page + folders[]", files.status === 200 && Array.isArray(files.body?.data) && !!files.body?.page && Array.isArray(files.body?.folders) && (files.body.data.length === 0 || (typeof files.body.data[0].fileName === "string" && typeof files.body.data[0].status === "string")), "ครบ", `${files.status} ${JSON.stringify(files.body?.data?.[0]).slice(0, 200)}`);
  const filesDenied = await call("GET", "/files", R);
  chk("B4-G7.2", "read-only ขอ /files → 403", filesDenied.status === 403, "403", `${filesDenied.status}`);
  const inbox = await call("GET", "/inbox", kDoc.rawKey);
  chk("B4-G7.3", "GET /inbox → stats{pending,thisMonth,…} + items[] + emailAddress", inbox.status === 200 && !!inbox.body?.data?.stats && Array.isArray(inbox.body?.data?.items) && "emailAddress" in inbox.body.data, "ครบ", `${inbox.status} ${JSON.stringify(Object.keys(inbox.body?.data ?? {}))}`);
  const gloss = await call("GET", "/help/glossary", R);
  chk("B4-G7.4", "GET /help/glossary → data[{key,text}] ≥ 40 คำ (ไทย)", gloss.status === 200 && Array.isArray(gloss.body?.data) && gloss.body.data.length >= 40 && gloss.body.data.every((g: Any) => typeof g.key === "string" && /[ก-๙]/.test(g.text)), "≥40", `${gloss.status} ${gloss.body?.data?.length}`);

  // ═══ G8 registry ═══
  const registry = (await import("@/lib/modules/account/api/registry" as string)) as Record<string, Any>;
  const ops = registry.ACCOUNT_OPS as Any[];
  const need: [string, string][] = [["chart.list", "account.journal.view"], ["chart.get", "account.journal.view"], ["mappings.list", "account.mapping.manage"], ["doc-type-accounts.list", "account.mapping.manage"], ["journal.list", "account.journal.view"], ["journal.get", "account.journal.view"], ["reports.general-ledger", "account.journal.view"], ["reports.trial-balance", "account.report.view"], ["reports.profit-loss", "account.report.view"], ["reports.balance-sheet", "account.report.view"], ["reports.cash-flow", "account.report.view"], ["reports.vat-pp30", "account.tax.view"], ["reports.aging", "account.report.view"], ["periods.list", "account.report.view"], ["periods.checklist", "account.period.close"], ["assets.list", "account.asset.manage"], ["assets.get", "account.asset.manage"], ["assets.depreciation-preview", "account.asset.manage"], ["audit.list", "account.settings.manage"], ["settings.get", "account.doc.view"], ["settings.policy", "account.settings.manage"], ["settings.documents", "account.settings.manage"], ["links.list", "account.settings.manage"], ["files.list", "account.document.manage"], ["inbox.get", "account.document.manage"], ["help.glossary", "account.doc.view"]];
  const bad = need.filter(([id, action]) => { const o = ops.find((x) => x.id === id); return !o || o.kind !== "read" || o.action !== action; });
  chk("B4-G8.1", "registry มี op ครบ 26 ตัวของ B4 · kind=read · action ตามสัญญา", bad.length === 0, "ครบ", bad.map(([id]) => id).join(","));
  chk("B4-G8.2", "op รายงาน 7 ตัว rate=report", ["reports.general-ledger", "reports.trial-balance", "reports.profit-loss", "reports.balance-sheet", "reports.cash-flow", "reports.vat-pp30", "reports.aging"].every((id) => ops.find((o) => o.id === id)?.rate === "report"), "report", "?", "MINOR");
  chk("B4-G8.3", "ledger/page.tsx ไม่ใช้ prisma ตรงแล้ว (ย้ายเป็น service generalLedger)", !/from "@\/lib\/core\/db"/.test(readFileSync("src/app/app/sys/[id]/account/ledger/page.tsx", "utf8")), "ไม่มี prisma ตรง", "ยังมี", "MAJOR");
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 220) : String(e));
} finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  await d(() => prisma.apiKey.deleteMany({ where: { tenantId: TID, name: { startsWith: "QC B4 " } } }));
  if (tidB) {
    for (const m of ["apiIdempotency", "apiKey", "auditLog", "appSystemUnit", "appSystem"]) await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: tidB } }));
    await d(() => prisma.businessUnit.deleteMany({ where: { tenantId: tidB } }));
    await d(() => prisma.tenant.delete({ where: { id: tidB } }));
  }
  await d(() => prisma.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE key LIKE 'acct:api:%'`));
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Account API READ GL (B4) =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
