// QC — API บัญชี WO B1: READ เอกสาร/แดชบอร์ด/ภาพรวม/แท็ก/รายการโปรด/ไฟล์แนบ/parse/เอกสารประจำ
// Fable oracle · Builder ห้ามแตะ · สัญญาอยู่ที่ ledger/ACCOUNT-API-RUN.md §B1
// requires: acc-v2-seed (SIAM DIVE QC + scripts/acc-v2-expected.json) — ใช้เฉลยของ seed เป็นตัวตรวจ
// ⚠️ standalone-typesafe: dynamic import + wide cast
//
// รัน: `QC_ENV_FILE=.env.qc` หรือ export env ของ .env.qc แล้ว `pnpm exec tsx scripts/qc-account-api-read-docs.mts`
import { readFileSync } from "node:fs";
const accEnv = (await import("./acc-v2-env.mts" as string)) as {
  loadQcEnv: () => { databaseUrl: string; host: string };
  QC: { expectedPath: string; ownerEmail: string };
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
const SYS: string = E.systemId;
const TID: string = E.tenantId;
const ymd = /^\d{4}-\d{2}-\d{2}$/;
const ymdNow = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
const noLeak = (v: unknown) => { const s = JSON.stringify(v); return !/"tenantId"|"systemId"|"publicToken"|"keyHash"/.test(s); };

let tidB = "";
const created: string[] = [];
try {
  const ak = (await import("@/lib/api-keys/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const scopes = (await import("@/lib/api-keys/scopes" as string)) as Record<string, Any>;
  const route = (await import("@/app/api/v1/account/[...path]/route" as string)) as Record<string, (req: Request, ctx: { params: Promise<{ path: string[] }> }) => Promise<Response>>;
  const readOnly = scopes.expandBundles(["read-only"]) as string[];
  const kRead = await ak.createApiKey({ tenantId: TID }, "QC B1 read", { scopes: readOnly, systemId: SYS });
  created.push(kRead.id);
  const tB = await prisma.tenant.create({ data: { name: "QC B1 other", slug: `qc-b1-${Date.now()}` } });
  tidB = tB.id;
  const accB = await sys.createSystem(tidB, "ACCOUNT", "บัญชี B");
  const kB = await ak.createApiKey({ tenantId: tidB }, "QC B1 B", { scopes: readOnly, systemId: accB.id });

  const call = async (method: string, path: string, opts: { key?: string; body?: unknown } = {}) => {
    const headers: Record<string, string> = {};
    if (opts.key) headers.authorization = `Bearer ${opts.key}`;
    let body: string | undefined;
    if (opts.body !== undefined) { body = JSON.stringify(opts.body); headers["content-type"] = "application/json"; }
    const req = new Request(`http://x/api/v1/account${path}`, { method, headers, body });
    const segs = path.split("?")[0]!.split("/").filter(Boolean);
    const res = await route[method]!(req, { params: Promise.resolve({ path: segs }) });
    const text = await res.text();
    let parsed: Any = null; try { parsed = JSON.parse(text); } catch { parsed = { _raw: text }; }
    return { status: res.status, headers: res.headers, body: parsed };
  };
  const K = kRead.rawKey;

  // ═══ D1 dashboard ═══
  const dash = await call("GET", `/dashboard?asOf=${E.today}`, { key: K });
  const kpi = dash.body?.data?.kpi;
  chk("B1-D1.1", "GET /dashboard → 200 kpi.receivable = เฉลย (amountSatang/count)", dash.status === 200 && kpi?.receivable?.amountSatang === E.receivable && kpi?.receivable?.count === E.receivableDocs, `${E.receivable}/${E.receivableDocs}`, `${dash.status} ${JSON.stringify(kpi?.receivable)}`);
  chk("B1-D1.2", "kpi.payable = เฉลย", kpi?.payable?.amountSatang === E.payable && kpi?.payable?.count === E.payableDocs, `${E.payable}/${E.payableDocs}`, JSON.stringify(kpi?.payable));
  chk("B1-D1.3", "kpi.overdue รวม AR+AP + แยก receivable/payable — receivable ตรงเฉลย (amount/count) · payable.count ตรงเฉลย · รวม = ผลบวก", kpi?.overdue?.receivable?.amountSatang === E.overdueAmount && kpi?.overdue?.receivable?.count === E.overdueDocs && kpi?.overdue?.payable?.count === E.payableOverdueDocs && kpi?.overdue?.count === E.overdueDocs + E.payableOverdueDocs && kpi?.overdue?.amountSatang === kpi?.overdue?.receivable?.amountSatang + kpi?.overdue?.payable?.amountSatang, `${E.overdueAmount}/${E.overdueDocs} + AP ${E.payableOverdueDocs}`, JSON.stringify(kpi?.overdue));
  chk("B1-D1.4", "kpi.cashTotalSatang (asOf = วันเฉลย) = ยอดรวมช่องทางการเงินตามเฉลย", kpi?.cashTotalSatang === E.finance.total, `${E.finance.total}`, `${kpi?.cashTotalSatang}`);
  const dashNow = await call("GET", "/dashboard", { key: K });
  chk("B1-D1.4b", "GET /dashboard ไม่ส่ง asOf → asOf = วันนี้ (เวลาไทย) และ asOf ผิดรูป → 422", dashNow.status === 200 && dashNow.body?.data?.asOf === ymdNow && (await call("GET", "/dashboard?asOf=x", { key: K })).status === 422, `${ymdNow}`, `${dashNow.status} ${dashNow.body?.data?.asOf}`, "MAJOR");
  chk("B1-D1.5", "dashboard มี asOf/periodKey/year + recent[] + topCustomers[] + topVendors[] + topProducts[] + pending + arap + cash", !!dash.body?.data && ymd.test(dash.body.data.asOf ?? "") && /^\d{4}-\d{2}$/.test(dash.body.data.periodKey ?? "") && Array.isArray(dash.body.data.recent) && Array.isArray(dash.body.data.topCustomers) && Array.isArray(dash.body.data.topVendors) && Array.isArray(dash.body.data.topProducts) && !!dash.body.data.pending && !!dash.body.data.arap && !!dash.body.data.cash, "ครบ", JSON.stringify(Object.keys(dash.body?.data ?? {})));
  chk("B1-D1.6", "dashboard ไม่มี glRows/base/href/tenantId หลุด (ของ UI)", !("glRows" in (dash.body?.data ?? {})) && !/"href"|"base"/.test(JSON.stringify(dash.body?.data ?? {}).slice(0, 5000)) && noLeak(dash.body), "สะอาด", "หลุด", "MAJOR");
  const series = await call("GET", "/dashboard/series?year=2026", { key: K });
  chk("B1-D1.7", "GET /dashboard/series?year= → months[] 12 เดือน มี incomeSatang/expenseSatang", series.status === 200 && Array.isArray(series.body?.data?.months) && series.body.data.months.length === 12 && series.body.data.months.every((m: Any) => /^\d{4}-\d{2}$/.test(m.period) && Number.isInteger(m.incomeSatang) && Number.isInteger(m.expenseSatang)), "12 เดือน", `${series.status} ${JSON.stringify(series.body?.data).slice(0, 160)}`);
  const badYear = await call("GET", "/dashboard/series?year=abc", { key: K });
  chk("B1-D1.8", "year ไม่ใช่ตัวเลข → 422 validation", badYear.status === 422, "422", `${badYear.status}`, "MAJOR");
  const ov = await call("GET", "/overview?side=revenue", { key: K });
  chk("B1-D1.9", "GET /overview?side=revenue → 200 series/issued/topCustomers/topProducts/topIncomeCategories/tracked (ไม่มี base/now)", ov.status === 200 && ov.body?.data?.side === "revenue" && Array.isArray(ov.body.data.topCustomers) && !!ov.body.data.series && !!ov.body.data.issued && !("base" in ov.body.data) && !("now" in ov.body.data), "200", `${ov.status} ${JSON.stringify(Object.keys(ov.body?.data ?? {}))}`);
  const ovBad = await call("GET", "/overview?side=nope", { key: K });
  chk("B1-D1.10", "side ไม่ถูกต้อง → 422", ovBad.status === 422, "422", `${ovBad.status}`, "MAJOR");

  // ═══ D2 documents list ═══
  const inv = await call("GET", "/documents?type=INVOICE", { key: K });
  const d2 = inv.body?.data;
  chk("B1-D2.1", "GET /documents?type=INVOICE → 200 data[] + page{page,pageSize,pageCount,total,hasMore} + tabCounts", inv.status === 200 && Array.isArray(d2) && inv.body?.page && Number.isInteger(inv.body.page.total) && typeof inv.body.page.hasMore === "boolean" && !!inv.body?.tabCounts, "200", `${inv.status} ${JSON.stringify(inv.body?.page)}`);
  chk("B1-D2.2", "page.total ของ INVOICE (ทั้งหมด) = เฉลย all", inv.body?.page?.total === E.invoiceTabs.all, `${E.invoiceTabs.all}`, `${inv.body?.page?.total}`);
  chk("B1-D2.3", "tabCounts ของ INVOICE ตรงเฉลย (draft/awaiting/partial/paid/overdue)", ["draft", "awaiting", "partial", "paid", "overdue"].every((k) => inv.body?.tabCounts?.[k] === E.invoiceTabs[k]), JSON.stringify(E.invoiceTabs), JSON.stringify(inv.body?.tabCounts));
  const row = d2?.[0];
  chk("B1-D2.4", "แถวเอกสารมี id/type/docNo/status/issueDate(YYYY-MM-DD)/dueDate/contact{id,name}/grandTotalSatang/paidSatang/remainSatang/overdue/tags", !!row && row.type === "INVOICE" && ymd.test(row.issueDate ?? "") && (row.dueDate === null || ymd.test(row.dueDate)) && Number.isInteger(row.grandTotalSatang) && Number.isInteger(row.paidSatang) && Number.isInteger(row.remainSatang) && typeof row.overdue === "boolean" && Array.isArray(row.tags) && (row.contact === null || (typeof row.contact?.id === "string" && typeof row.contact?.name === "string")), "ครบ", JSON.stringify(row).slice(0, 240));
  chk("B1-D2.5", "แถวไม่รั่ว tenantId/systemId/publicToken", noLeak(d2), "สะอาด", "หลุด");
  const paid = await call("GET", "/documents?type=INVOICE&tab=paid&pageSize=100", { key: K });
  chk("B1-D2.6", "tab=paid → total = เฉลย paid และทุกแถว status PAID", paid.body?.page?.total === E.invoiceTabs.paid && (paid.body?.data ?? []).every((r: Any) => r.status === "PAID"), `${E.invoiceTabs.paid}`, `${paid.body?.page?.total}`);
  const overdue = await call("GET", "/documents?type=INVOICE&tab=overdue", { key: K });
  chk("B1-D2.7", "tab=overdue → total = เฉลย overdue และทุกแถว overdue=true", overdue.body?.page?.total === E.invoiceTabs.overdue && (overdue.body?.data ?? []).every((r: Any) => r.overdue === true), `${E.invoiceTabs.overdue}`, `${overdue.body?.page?.total}`);
  const pg = await call("GET", "/documents?type=INVOICE&pageSize=10&page=2", { key: K });
  chk("B1-D2.8", "แบ่งหน้า pageSize=10 page=2 → data 10 แถว · page.page=2 · pageCount=ceil(total/10) · hasMore ถูก", pg.body?.data?.length === 10 && pg.body?.page?.page === 2 && pg.body?.page?.pageCount === Math.ceil(E.invoiceTabs.all / 10) && pg.body?.page?.hasMore === (2 < Math.ceil(E.invoiceTabs.all / 10)), "10/2", JSON.stringify(pg.body?.page));
  const big = await call("GET", "/documents?type=INVOICE&pageSize=1000", { key: K });
  chk("B1-D2.9", "pageSize เกิน 100 → ถูก clamp เป็น 100 (ไม่ error)", big.status === 200 && big.body?.page?.pageSize === 100, "100", `${big.status} ${big.body?.page?.pageSize}`, "MAJOR");
  const q = await call("GET", `/documents?type=INVOICE&q=${encodeURIComponent(row?.contact?.name ?? "x")}`, { key: K });
  chk("B1-D2.10", "q=ชื่อผู้ติดต่อ → ทุกแถวเป็นผู้ติดต่อนั้น (≥1)", q.status === 200 && (q.body?.data?.length ?? 0) >= 1 && q.body.data.every((r: Any) => r.contact?.name === row?.contact?.name), "ตรง", `${q.body?.data?.length}`);
  const byContact = await call("GET", `/documents?type=INVOICE&contactId=${row?.contact?.id}`, { key: K });
  chk("B1-D2.11", "contactId= → ทุกแถว contact.id ตรง", byContact.status === 200 && byContact.body.data.length >= 1 && byContact.body.data.every((r: Any) => r.contact?.id === row?.contact?.id), "ตรง", `${byContact.body?.data?.length}`);
  const range = await call("GET", "/documents?type=INVOICE&from=2026-08-01&to=2026-08-31", { key: K });
  chk("B1-D2.12", "from/to → issueDate ทุกแถวอยู่ในช่วง", range.status === 200 && range.body.data.every((r: Any) => r.issueDate >= "2026-08-01" && r.issueDate <= "2026-08-31"), "ในช่วง", `${range.status} ${range.body?.data?.length}`);
  const badType = await call("GET", "/documents?type=NOPE", { key: K });
  chk("B1-D2.13", "type ไม่รู้จัก → 422 validation", badType.status === 422, "422", `${badType.status}`);
  const multi = await call("GET", "/documents?type=INVOICE,RECEIPT&pageSize=100", { key: K });
  chk("B1-D2.14", "type หลายค่า (คั่นด้วย ,) → ได้ทั้ง 2 ชนิด", multi.status === 200 && new Set(multi.body.data.map((r: Any) => r.type)).size === 2, "2 ชนิด", `${multi.status}`, "MAJOR");
  const expense = await call("GET", "/documents?type=EXPENSE", { key: K });
  chk("B1-D2.15", "type=EXPENSE (ฝั่งรายจ่าย) ใช้ endpoint เดียวกันได้ · direction ฝั่งจ่าย", expense.status === 200 && expense.body.data.length >= 1 && expense.body.data.every((r: Any) => r.type === "EXPENSE"), "200", `${expense.status} ${expense.body?.data?.length}`);
  const noType = await call("GET", "/documents", { key: K });
  chk("B1-D2.16", "ไม่ส่ง type → 200 ทุกชนิด (total ≥ INVOICE all)", noType.status === 200 && noType.body?.page?.total >= E.invoiceTabs.all, "200", `${noType.status} ${noType.body?.page?.total}`, "MAJOR");
  const badDate = await call("GET", "/documents?type=INVOICE&from=31/08/2026", { key: K });
  chk("B1-D2.17", "from รูปแบบผิด → 422", badDate.status === 422, "422", `${badDate.status}`, "MAJOR");

  // ═══ D3 document detail ═══
  const det = await call("GET", `/documents/${row?.id}`, { key: K });
  const d = det.body?.data;
  const dbDoc = await prisma.accountDocument.findUnique({ where: { id: row?.id }, include: { lines: true, payments: { where: { voidedAt: null } } } });
  chk("B1-D3.1", "GET /documents/{id} → 200 ตัวเลขตรง DB (grandTotal/subTotal/vat/paid)", det.status === 200 && d?.grandTotalSatang === dbDoc?.grandTotal && d?.subTotalSatang === dbDoc?.subTotal && d?.vatSatang === dbDoc?.vatAmount && d?.paidSatang === dbDoc?.paidTotal, "ตรง DB", `${det.status} ${JSON.stringify({ g: d?.grandTotalSatang, s: d?.subTotalSatang })}`);
  chk("B1-D3.2", "detail มี lines[] (description/qty/unitPriceSatang/discountSatang/vatRateBp/amountSatang/account) จำนวนเท่า DB", Array.isArray(d?.lines) && d.lines.length === dbDoc?.lines.length && d.lines.every((l: Any) => typeof l.description === "string" && typeof l.qty === "number" && Number.isInteger(l.unitPriceSatang) && Number.isInteger(l.amountSatang) && Number.isInteger(l.vatRateBp)), "ครบ", JSON.stringify(d?.lines?.[0]).slice(0, 200));
  chk("B1-D3.3", "detail มี payments[]/related[]/timeline[]/jv[]/attachments[]/tags[] + remainSatang + overdue + label", ["payments", "related", "timeline", "jv", "attachments", "tags"].every((k) => Array.isArray(d?.[k])) && Number.isInteger(d?.remainSatang) && typeof d?.overdue === "boolean" && typeof d?.label === "string", "ครบ", JSON.stringify(Object.keys(d ?? {})));
  chk("B1-D3.4", "payments[] จำนวนเท่า DB (ไม่รวม voided) · แต่ละตัวมี paidAt/channel/amountSatang", d?.payments?.filter((p: Any) => !p.voidedAt).length === dbDoc?.payments.length && (d?.payments ?? []).every((p: Any) => typeof p.channel === "string" && Number.isInteger(p.amountSatang) && typeof p.paidAt === "string"), "ตรง", `${d?.payments?.length}/${dbDoc?.payments.length}`);
  chk("B1-D3.5", "detail ไม่รั่ว publicToken/tenantId/systemId · ไม่มี auditLogs (แยก endpoint)", noLeak(d) && !("auditLogs" in (d ?? {})), "สะอาด", "หลุด");
  chk("B1-D3.6", "jv[] แต่ละรายการมี journalNo/date/lines[{accountCode,accountName,debitSatang,creditSatang}] และ Σdr=Σcr", (d?.jv ?? []).every((j: Any) => typeof j.journalNo === "string" && Array.isArray(j.lines) && j.lines.reduce((s: number, l: Any) => s + l.debitSatang, 0) === j.lines.reduce((s: number, l: Any) => s + l.creditSatang, 0)), "สมดุล", JSON.stringify(d?.jv?.[0]).slice(0, 200), "MAJOR");
  const nf = await call("GET", "/documents/does-not-exist", { key: K });
  chk("B1-D3.7", "id ไม่มี → 404 not_found", nf.status === 404 && nf.body?.error?.code === "not_found", "404", `${nf.status}`);
  const cross = await call("GET", `/documents/${row?.id}`, { key: kB.rawKey });
  chk("B1-D3.8", "คีย์ร้านอื่นอ่านเอกสารร้าน QC → 404 (ไม่ใช่ 403 ไม่บอกว่ามี)", cross.status === 404, "404", `${cross.status}`);
  const crossList = await call("GET", "/documents?type=INVOICE", { key: kB.rawKey });
  chk("B1-D3.9", "คีย์ร้านอื่น list → 200 ว่าง total 0", crossList.status === 200 && crossList.body?.page?.total === 0, "0", `${crossList.status} ${crossList.body?.page?.total}`);

  // ═══ D4 tags / favorites / attachments ═══
  const tags = await call("GET", "/tags", { key: K });
  chk("B1-D4.1", "GET /tags → data string[] (เรียง)", tags.status === 200 && Array.isArray(tags.body?.data) && tags.body.data.every((t: Any) => typeof t === "string"), "string[]", `${tags.status}`);
  const fav = await call("GET", "/favorites", { key: K });
  chk("B1-D4.2", "GET /favorites → data[] (name/docType/lines)", fav.status === 200 && Array.isArray(fav.body?.data), "array", `${fav.status}`);
  const att = await call("GET", `/documents/${row?.id}/attachments`, { key: K });
  chk("B1-D4.3", "GET /documents/{id}/attachments → data[] เท่ากับ detail.attachments", att.status === 200 && Array.isArray(att.body?.data) && att.body.data.length === d?.attachments?.length, "เท่ากัน", `${att.status} ${att.body?.data?.length}/${d?.attachments?.length}`);
  const attNf = await call("GET", "/documents/does-not-exist/attachments", { key: K });
  chk("B1-D4.4", "attachments ของ id ที่ไม่มี → 404", attNf.status === 404, "404", `${attNf.status}`, "MAJOR");

  // ═══ D5 parse (⌘K) — POST แต่ kind=read (ไม่เขียน ไม่ต้อง Idempotency-Key) ═══
  const parsed = await call("POST", "/documents/parse", { key: K, body: { text: "ใบแจ้งหนี้ ณัฐพล 24900" } });
  chk("B1-D5.1", "POST /documents/parse → 200 type INVOICE · amountSatang 2490000 · contactQuery 'ณัฐพล' · contacts[] มีชื่อที่ตรง", parsed.status === 200 && parsed.body?.data?.type === "INVOICE" && parsed.body?.data?.amountSatang === 2490000 && parsed.body?.data?.contactQuery === "ณัฐพล" && Array.isArray(parsed.body?.data?.contacts) && parsed.body.data.contacts.some((c: Any) => /ณัฐพล/.test(c.name ?? "")), "INVOICE 2490000 + contacts", `${parsed.status} ${JSON.stringify(parsed.body?.data).slice(0, 200)}`);
  const parsedNone = await call("POST", "/documents/parse", { key: K, body: { text: "สวัสดี" } });
  chk("B1-D5.2", "ข้อความไม่ตรง docType → 200 data null (ไม่ error)", parsedNone.status === 200 && parsedNone.body?.data === null, "null", `${parsedNone.status} ${JSON.stringify(parsedNone.body?.data)}`, "MAJOR");
  const parsedEmpty = await call("POST", "/documents/parse", { key: K, body: {} });
  chk("B1-D5.3", "ไม่มี text → 422", parsedEmpty.status === 422, "422", `${parsedEmpty.status}`, "MAJOR");

  // ═══ D6 recurring ═══
  const rec = await call("GET", "/recurring", { key: K });
  const dbRules = await prisma.accountRecurringRule.count({ where: { tenantId: TID, systemId: SYS } });
  chk("B1-D6.1", "GET /recurring → data[] จำนวนเท่า DB · แต่ละตัวมี id/name/docType/frequency/active/nextRunAt", rec.status === 200 && rec.body?.data?.length === dbRules && (rec.body?.data ?? []).every((r: Any) => typeof r.id === "string" && typeof r.docType === "string" && typeof r.active === "boolean"), `${dbRules}`, `${rec.status} ${rec.body?.data?.length}`);
  const firstRule = rec.body?.data?.[0];
  if (firstRule) {
    const runs = await call("GET", `/recurring/${firstRule.id}/runs`, { key: K });
    chk("B1-D6.2", "GET /recurring/{id}/runs → data[]", runs.status === 200 && Array.isArray(runs.body?.data), "array", `${runs.status}`);
  }

  // ═══ D7 scope/registry ═══
  const registry = (await import("@/lib/modules/account/api/registry" as string)) as Record<string, Any>;
  const ops = registry.ACCOUNT_OPS as Any[];
  const need = ["documents.list", "documents.get", "documents.attachments", "documents.parse", "tags.list", "favorites.list", "recurring.list", "recurring.runs", "dashboard.get", "dashboard.series", "overview.get"];
  const missing = need.filter((id) => !ops.some((o) => o.id === id));
  chk("B1-D7.1", "registry มี op ครบ 11 ตัวของ B1 (id ตามสัญญา)", missing.length === 0, "ครบ", missing.join(","));
  const readOps = ops.filter((o) => need.includes(o.id));
  chk("B1-D7.2", "op ของ B1 ทุกตัว kind=read · action=account.doc.view · dashboard/overview rate=report", readOps.every((o) => o.kind === "read" && o.action === "account.doc.view") && readOps.filter((o) => /^(dashboard|overview)/.test(o.id)).every((o) => o.rate === "report"), "ตรง", readOps.map((o) => `${o.id}:${o.kind}:${o.action}:${o.rate ?? "-"}`).join(" "));
  chk("B1-D7.3", "op read ที่มี input มี zod schema (GET=query)", readOps.filter((o) => o.id !== "tags.list" && o.id !== "favorites.list" && o.id !== "recurring.list").every((o) => !!o.input), "มี", readOps.filter((o) => !o.input).map((o) => o.id).join(","), "MAJOR");
  // scope: คีย์ที่ไม่มี doc.view (มีแค่ settings.manage) → 403 ทุก op
  const kNo = await ak.createApiKey({ tenantId: TID }, "QC B1 noview", { scopes: ["account.settings.manage"], systemId: SYS });
  created.push(kNo.id);
  const denied = await call("GET", "/documents?type=INVOICE", { key: kNo.rawKey });
  chk("B1-D7.4", "คีย์ไม่มี account.doc.view → 403 scope_missing", denied.status === 403 && denied.body?.error?.code === "scope_missing", "403", `${denied.status}`);
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 220) : String(e));
} finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  await d(() => prisma.apiKey.deleteMany({ where: { tenantId: TID, name: { startsWith: "QC B1 " } } }));
  await d(() => prisma.auditLog.deleteMany({ where: { tenantId: TID, actorType: "API_KEY" as Any, after: { path: ["keyName"], string_starts_with: "QC B1 " } } }));
  if (tidB) {
    for (const m of ["apiIdempotency", "apiKey", "auditLog", "appSystemUnit", "appSystem"]) await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: tidB } }));
    await d(() => prisma.businessUnit.deleteMany({ where: { tenantId: tidB } }));
    await d(() => prisma.tenant.delete({ where: { id: tidB } }));
  }
  await d(() => prisma.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE key LIKE 'acct:api:%'`));
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Account API READ docs (B1) =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
