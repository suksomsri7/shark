// QC — API บัญชี WO B3: READ การเงิน — ช่องทาง / statement / ภาพรวม / ปฏิทิน / เงินสดย่อย / ลิงก์ชำระเงิน / กระทบยอด / เช็ค / WHT
// Fable oracle · Builder ห้ามแตะ · สัญญาอยู่ที่ ledger/ACCOUNT-API-RUN.md §B3
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
const SYS: string = E.systemId;
const TID: string = E.tenantId;
const ymd = /^\d{4}-\d{2}-\d{2}$/;
const noLeak = (v: unknown) => { const s = JSON.stringify(v); return !/"tenantId"|"systemId"|"keyHash"|"href"|"base"/.test(s); };

let tidB = "";
try {
  const ak = (await import("@/lib/api-keys/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const scopes = (await import("@/lib/api-keys/scopes" as string)) as Record<string, Any>;
  const route = (await import("@/app/api/v1/account/[...path]/route" as string)) as Record<string, (req: Request, ctx: { params: Promise<{ path: string[] }> }) => Promise<Response>>;
  const readOnly = scopes.expandBundles(["read-only"]) as string[];
  const kRead = await ak.createApiKey({ tenantId: TID }, "QC B3 read", { scopes: readOnly, systemId: SYS });
  const kFin = await ak.createApiKey({ tenantId: TID }, "QC B3 finance", { scopes: [...readOnly, "account.finance.manage", "account.cheque.manage", "account.wht.manage"], systemId: SYS });
  const tB = await prisma.tenant.create({ data: { name: "QC B3 other", slug: `qc-b3-${Date.now()}` } });
  tidB = tB.id;
  const accB = await sys.createSystem(tidB, "ACCOUNT", "บัญชี B");
  const kB = await ak.createApiKey({ tenantId: tidB }, "QC B3 B", { scopes: [...readOnly, "account.finance.manage"], systemId: accB.id });

  const call = async (method: string, path: string, key: string, headers: Record<string, string> = {}) => {
    const req = new Request(`http://x/api/v1/account${path}`, { method, headers: { authorization: `Bearer ${key}`, ...headers } });
    const segs = path.split("?")[0]!.split("/").filter(Boolean);
    const res = await route[method]!(req, { params: Promise.resolve({ path: segs }) });
    const text = await res.text();
    let body: Any = null; try { body = JSON.parse(text); } catch { body = { _raw: text }; }
    return { status: res.status, headers: res.headers, body, text };
  };
  const K = kFin.rawKey;

  // ═══ F1 finance accounts ═══
  const fa = await call("GET", "/finance-accounts", K);
  const rows = fa.body?.data as Any[];
  const byCode = new Map((rows ?? []).map((r) => [r.code, r]));
  chk("B3-F1.1", "GET /finance-accounts → 200 data[] ทุกช่องทาง balanceSatang/openingSatang ตรงเฉลย", fa.status === 200 && (E.financeAccounts as Any[]).every((e) => byCode.get(e.code)?.balanceSatang === e.balance && byCode.get(e.code)?.openingSatang === e.opening), JSON.stringify(E.finance), JSON.stringify((rows ?? []).map((r) => [r.code, r.balanceSatang])));
  chk("B3-F1.2", "แถวมี id/code/name/type/bankName/accountNo/promptpayId/showOnDocuments/ledgerAccountCode", (rows ?? []).every((r) => typeof r.id === "string" && typeof r.code === "string" && typeof r.type === "string" && "bankName" in r && "accountNo" in r && "promptpayId" in r && typeof r.showOnDocuments === "boolean" && "ledgerAccountCode" in r), "ครบ", JSON.stringify(rows?.[0]).slice(0, 220));
  chk("B3-F1.3", "groups[{key,label,totalSatang}] ตรงเฉลย financeGroups + totalSatang = เฉลย total", Array.isArray(fa.body?.groups) && Object.entries(E.financeGroups as Record<string, number>).every(([k, v]) => fa.body.groups.find((g: Any) => g.key === k)?.totalSatang === v) && fa.body?.totalSatang === E.finance.total, JSON.stringify(E.financeGroups), JSON.stringify(fa.body?.groups?.map((g: Any) => [g.key, g.totalSatang])));
  chk("B3-F1.4", "ไม่รั่ว tenantId/systemId", noLeak(fa.body), "สะอาด", "หลุด");
  const readDenied = await call("GET", "/finance-accounts", kRead.rawKey);
  chk("B3-F1.5", "คีย์อ่านอย่างเดียว (ไม่มี finance.manage) → 403 (ช่องทางเงินเป็นข้อมูลอ่อนไหว)", readDenied.status === 403, "403", `${readDenied.status}`);
  const asOf = await call("GET", "/finance-accounts?asOf=2026-01-01", K);
  chk("B3-F1.6", "asOf=2026-01-01 → ยอดต่างจากปัจจุบัน (คำนวณ ณ วันที่จริง)", asOf.status === 200 && asOf.body?.totalSatang !== E.finance.total, "ต่าง", `${asOf.status} ${asOf.body?.totalSatang}`, "MAJOR");
  const one = await call("GET", `/finance-accounts/${byCode.get("BSV001")?.id}`, K);
  chk("B3-F1.7", "GET /finance-accounts/{id} → account + openingEntries[] + balanceSatang", one.status === 200 && one.body?.data?.code === "BSV001" && Array.isArray(one.body?.data?.openingEntries) && Number.isInteger(one.body?.data?.balanceSatang), "ครบ", `${one.status} ${JSON.stringify(Object.keys(one.body?.data ?? {}))}`);
  const stmt = await call("GET", `/finance-accounts/${byCode.get("BSV001")?.id}/statement?from=2026-09-01&to=2026-09-30`, K);
  const sd = stmt.body?.data;
  chk("B3-F1.8", "GET /finance-accounts/{id}/statement?from&to → account + openingSatang + closingSatang + rows[{date,journalNo,memo,inSatang,outSatang,balanceSatang}] · running balance ต่อเนื่อง", stmt.status === 200 && Number.isInteger(sd?.openingSatang) && Number.isInteger(sd?.closingSatang) && Array.isArray(sd?.rows) && sd.rows.every((r: Any, i: number) => ymd.test(r.date) && Number.isInteger(r.inSatang) && Number.isInteger(r.outSatang) && r.balanceSatang === (i === 0 ? sd.openingSatang : sd.rows[i - 1].balanceSatang) + r.inSatang - r.outSatang) && (sd.rows.length === 0 || sd.rows[sd.rows.length - 1].balanceSatang === sd.closingSatang), "ต่อเนื่อง", `${stmt.status} rows=${sd?.rows?.length} ${JSON.stringify(sd?.rows?.[0]).slice(0, 160)}`);
  const stmtCsv = await call("GET", `/finance-accounts/${byCode.get("BSV001")?.id}/statement?from=2026-09-01&to=2026-09-30`, K, { accept: "text/csv" });
  chk("B3-F1.9", "statement + Accept: text/csv → text/csv UTF-8 BOM + หัวคอลัมน์ + จำนวนบรรทัด = rows+1", /text\/csv/.test(stmtCsv.headers.get("content-type") ?? "") && stmtCsv.text.charCodeAt(0) === 0xfeff && stmtCsv.text.trim().split("\n").length === (sd?.rows?.length ?? 0) + 1, "csv", `${stmtCsv.headers.get("content-type")} lines=${stmtCsv.text.trim().split("\n").length}`, "MAJOR");
  const stmtNf = await call("GET", "/finance-accounts/does-not-exist/statement", K);
  chk("B3-F1.10", "statement ของ id ไม่มี → 404", stmtNf.status === 404, "404", `${stmtNf.status}`);
  const cross = await call("GET", `/finance-accounts/${byCode.get("BSV001")?.id}`, kB.rawKey);
  chk("B3-F1.11", "คีย์ร้านอื่น → 404", cross.status === 404, "404", `${cross.status}`);

  // ═══ F2 overview / calendar / petty cash ═══
  const ov = await call("GET", "/finance/overview?month=2026-09", K);
  chk("B3-F2.1", "GET /finance/overview?month= → 200 tiles/cash/cheques/monthChanges (ไม่มี base/href)", ov.status === 200 && !!ov.body?.data && noLeak(ov.body) && Object.keys(ov.body.data).length >= 3, "200", `${ov.status} ${JSON.stringify(Object.keys(ov.body?.data ?? {}))}`);
  const badMonth = await call("GET", "/finance/overview?month=2026-13", K);
  chk("B3-F2.2", "month ผิดรูป → 422", badMonth.status === 422, "422", `${badMonth.status}`, "MAJOR");
  const cal = await call("GET", "/finance/calendar?month=2026-09", K);
  chk("B3-F2.3", "GET /finance/calendar?month= → days[] (date, inSatang, outSatang, items[])", cal.status === 200 && Array.isArray(cal.body?.data?.days) && cal.body.data.days.every((d: Any) => ymd.test(d.date) && Number.isInteger(d.inSatang) && Number.isInteger(d.outSatang)), "days[]", `${cal.status} ${JSON.stringify(cal.body?.data?.days?.[0]).slice(0, 160)}`);
  const petty = await call("GET", "/petty-cash", K);
  chk("B3-F2.4", "GET /petty-cash → data[{id,code,name,balanceSatang,holder,pendingSatang}] · PTY001 balance ตรงเฉลย", petty.status === 200 && (petty.body?.data ?? []).find((p: Any) => p.code === "PTY001")?.balanceSatang === E.pettyCash.balance, `${E.pettyCash.balance}`, `${petty.status} ${JSON.stringify(petty.body?.data).slice(0, 200)}`);

  // ═══ F3 payment requests ═══
  const prRow = await prisma.accountPaymentRequest.findFirst({ where: { tenantId: TID, systemId: SYS }, select: { documentId: true } });
  if (prRow) {
    const pr = await call("GET", `/payment-requests?documentId=${prRow.documentId}`, kRead.rawKey);
    chk("B3-F3.1", "GET /payment-requests?documentId= → data[{id,url,amountSatang,method,status,qrPayload,financeAccount,expiresAt,paidAt}] (ไม่มี token แยก)", pr.status === 200 && Array.isArray(pr.body?.data) && pr.body.data.length >= 1 && pr.body.data.every((r: Any) => typeof r.url === "string" && Number.isInteger(r.amountSatang) && typeof r.status === "string" && !("token" in r)), "ครบ", `${pr.status} ${JSON.stringify(pr.body?.data?.[0]).slice(0, 200)}`);
  } else chk("B3-F3.1", "seed มี payment request (ข้ามถ้าไม่มี)", true, "-", "-", "MINOR");
  const prMissing = await call("GET", "/payment-requests", kRead.rawKey);
  chk("B3-F3.2", "ไม่ส่ง documentId → 422", prMissing.status === 422, "422", `${prMissing.status}`, "MAJOR");

  // ═══ F4 reconcile ═══
  const ch = await call("GET", "/reconcile/channels", K);
  chk("B3-F4.1", "GET /reconcile/channels → data[{id,code,name,bankName,accountNo}] (BANK/E_WALLET ที่ผูก GL)", ch.status === 200 && Array.isArray(ch.body?.data) && ch.body.data.length >= 1 && ch.body.data.every((c: Any) => typeof c.code === "string"), "array", `${ch.status} ${ch.body?.data?.length}`);
  const st = await prisma.accountBankStatement.findFirst({ where: { tenantId: TID, systemId: SYS }, select: { financeId: true, periodKey: true } });
  const recPath = st ? `/reconcile?financeAccountId=${st.financeId}&period=${st.periodKey}` : `/reconcile?financeAccountId=${ch.body?.data?.[0]?.id}&period=2026-09`;
  const rec = await call("GET", recPath, K);
  const rd = rec.body?.data;
  chk("B3-F4.2", "GET /reconcile?financeAccountId&period → summary{hasStatement,statementBalanceSatang,systemBalanceSatang,differenceSatang,matchedCount,totalCount,pendingCount,unmatchedCount,confirmedAt,canConfirm} + lines[] + systemEntries[]", rec.status === 200 && typeof rd?.summary?.hasStatement === "boolean" && Number.isInteger(rd?.summary?.systemBalanceSatang) && Number.isInteger(rd?.summary?.matchedCount) && Array.isArray(rd?.lines) && Array.isArray(rd?.systemEntries), "ครบ", `${rec.status} ${JSON.stringify(Object.keys(rd?.summary ?? {})).slice(0, 300)}`);
  if (st) chk("B3-F4.3", "seed มี statement → hasStatement=true · lines[] ≥1 · แต่ละ line มี date/description/amountSatang/status", rd?.summary?.hasStatement === true && rd.lines.length >= 1 && rd.lines.every((l: Any) => ymd.test(l.date) && Number.isInteger(l.amountSatang) && typeof l.status === "string"), "true", JSON.stringify(rd?.lines?.[0]).slice(0, 160));
  const recBad = await call("GET", "/reconcile?financeAccountId=x&period=2026-09", K);
  chk("B3-F4.4", "financeAccountId ไม่มี → 404", recBad.status === 404, "404", `${recBad.status}`, "MAJOR");
  const recDenied = await call("GET", recPath, kRead.rawKey);
  chk("B3-F4.5", "คีย์ไม่มี finance.manage/reconcile → 403", recDenied.status === 403, "403", `${recDenied.status}`);

  // ═══ F5 cheques ═══
  const dbIn = await prisma.accountCheque.count({ where: { tenantId: TID, systemId: SYS, direction: "IN" } });
  const cq = await call("GET", "/cheques?direction=IN&pageSize=100", K);
  chk("B3-F5.1", "GET /cheques?direction=IN → data[] total = DB · summary{pendingSatang,dueSoonCount} · statusCounts · totalSatang", cq.status === 200 && cq.body?.page?.total === dbIn && Number.isInteger(cq.body?.summary?.pendingSatang) && Number.isInteger(cq.body?.summary?.dueSoonCount) && !!cq.body?.statusCounts && Number.isInteger(cq.body?.totalSatang), `${dbIn}`, `${cq.status} ${cq.body?.page?.total} ${JSON.stringify(cq.body?.summary)}`);
  const cq0 = cq.body?.data?.[0];
  chk("B3-F5.2", "แถวเช็คมี id/direction/chequeNo/bankName/branch/chequeDate/amountSatang/status/contact/document", !!cq0 && cq0.direction === "IN" && typeof cq0.chequeNo === "string" && ymd.test(cq0.chequeDate) && Number.isInteger(cq0.amountSatang) && typeof cq0.status === "string" && "contact" in cq0 && "document" in cq0, "ครบ", JSON.stringify(cq0).slice(0, 220));
  const cqOne = await call("GET", `/cheques/${cq0?.id}`, K);
  chk("B3-F5.3", "GET /cheques/{id} → 200 ตรง id", cqOne.status === 200 && cqOne.body?.data?.id === cq0?.id, "200", `${cqOne.status}`);
  const cqNoDir = await call("GET", "/cheques", K);
  chk("B3-F5.4", "ไม่ส่ง direction → 422", cqNoDir.status === 422, "422", `${cqNoDir.status}`, "MAJOR");
  const cqStatus = await call("GET", `/cheques?direction=IN&status=${cq0?.status}`, K);
  chk("B3-F5.5", "status= กรองได้ ทุกแถวสถานะตรง", cqStatus.status === 200 && cqStatus.body.data.length >= 1 && cqStatus.body.data.every((c: Any) => c.status === cq0?.status), "ตรง", `${cqStatus.body?.data?.length}`, "MAJOR");

  // ═══ F6 WHT ═══
  const dbWhtIn = await prisma.accountDocument.count({ where: { tenantId: TID, systemId: SYS, docType: "WHT_CERT", direction: "IN" } });
  const wh = await call("GET", "/wht?direction=IN&pageSize=100", K);
  chk("B3-F6.1", "GET /wht?direction=IN → data[] total = จำนวน 50 ทวิ ฝั่งเราหัก · totals{baseSatang,whtSatang}", wh.status === 200 && wh.body?.page?.total === dbWhtIn && Number.isInteger(wh.body?.totals?.whtSatang) && Number.isInteger(wh.body?.totals?.baseSatang), `${dbWhtIn}`, `${wh.status} ${wh.body?.page?.total} ${JSON.stringify(wh.body?.totals)}`);
  const w0 = wh.body?.data?.[0];
  chk("B3-F6.2", "แถว WHT มี id/docNo/date/contact{id,name,taxId}/incomeType/rateBp/baseSatang/whtSatang/status/filedPeriod", !!w0 && typeof w0.docNo === "string" && ymd.test(w0.date) && w0.contact?.name && Number.isInteger(w0.rateBp) && Number.isInteger(w0.baseSatang) && Number.isInteger(w0.whtSatang) && "filedPeriod" in w0, "ครบ", JSON.stringify(w0).slice(0, 240));
  const cert = await call("GET", `/wht/certs/${w0?.id}`, K);
  chk("B3-F6.3", "GET /wht/certs/{id} → 200 ใบ 50 ทวิ (payer/payee/incomeType/baseSatang/whtSatang/date/docNo)", cert.status === 200 && cert.body?.data?.id === w0?.id && cert.body?.data?.payee?.name && Number.isInteger(cert.body?.data?.whtSatang), "200", `${cert.status} ${JSON.stringify(Object.keys(cert.body?.data ?? {}))}`);
  const period = w0?.date?.slice(0, 7) ?? "2026-09";
  const pnd = await call("GET", `/wht/pnd?type=53&period=${period}`, K);
  chk("B3-F6.4", "GET /wht/pnd?type=53&period= → rows[] + byIncomeType[] + grandBaseSatang + grandWhtSatang", pnd.status === 200 && Array.isArray(pnd.body?.data?.rows) && Array.isArray(pnd.body?.data?.byIncomeType) && Number.isInteger(pnd.body?.data?.grandWhtSatang), "ครบ", `${pnd.status} ${JSON.stringify(Object.keys(pnd.body?.data ?? {}))}`);
  const pndCsv = await call("GET", `/wht/pnd?type=53&period=${period}`, K, { accept: "text/csv" });
  chk("B3-F6.5", "pnd + Accept: text/csv → CSV BOM (ไฟล์ยื่น ภ.ง.ด.53)", /text\/csv/.test(pndCsv.headers.get("content-type") ?? "") && pndCsv.text.charCodeAt(0) === 0xfeff, "csv", `${pndCsv.headers.get("content-type")}`, "MAJOR");
  const pndBad = await call("GET", "/wht/pnd?type=7&period=2026-09", K);
  chk("B3-F6.6", "type ไม่ใช่ 3/53 → 422", pndBad.status === 422, "422", `${pndBad.status}`, "MAJOR");
  const credits = await call("GET", "/wht/credits?year=2026", K);
  chk("B3-F6.7", "GET /wht/credits?year= → rows[] + totalWhtSatang + totalBaseSatang + yearTotalSatang", credits.status === 200 && Array.isArray(credits.body?.data?.rows) && Number.isInteger(credits.body?.data?.totalWhtSatang) && Number.isInteger(credits.body?.data?.yearTotalSatang), "ครบ", `${credits.status} ${JSON.stringify(Object.keys(credits.body?.data ?? {}))}`);
  const filings = await call("GET", "/wht/filings", K);
  const dbFilings = await prisma.accountWhtFiling.count({ where: { tenantId: TID, systemId: SYS } });
  chk("B3-F6.8", "GET /wht/filings → data[] จำนวนเท่า DB (period/form/filedAt/certCount/whtSatang)", filings.status === 200 && filings.body?.data?.length === dbFilings, `${dbFilings}`, `${filings.status} ${filings.body?.data?.length}`);
  const whtDenied = await call("GET", "/wht?direction=IN", kRead.rawKey);
  chk("B3-F6.9", "คีย์ read-only (มี tax.view) อ่าน WHT ได้ (tax.view ครอบ)", whtDenied.status === 200, "200", `${whtDenied.status}`, "MAJOR");

  // ═══ F7 registry ═══
  const registry = (await import("@/lib/modules/account/api/registry" as string)) as Record<string, Any>;
  const ops = registry.ACCOUNT_OPS as Any[];
  const need: [string, string][] = [["finance-accounts.list", "account.finance.manage"], ["finance-accounts.get", "account.finance.manage"], ["finance-accounts.statement", "account.finance.manage"], ["finance.overview", "account.finance.manage"], ["finance.calendar", "account.finance.manage"], ["petty-cash.list", "account.finance.manage"], ["payment-requests.list", "account.doc.view"], ["reconcile.channels", "account.reconcile"], ["reconcile.get", "account.reconcile"], ["cheques.list", "account.cheque.manage"], ["cheques.get", "account.cheque.manage"], ["wht.list", "account.tax.view"], ["wht.cert", "account.tax.view"], ["wht.pnd", "account.tax.view"], ["wht.credits", "account.tax.view"], ["wht.filings", "account.tax.view"]];
  const bad = need.filter(([id, action]) => { const o = ops.find((x) => x.id === id); return !o || o.kind !== "read" || o.action !== action; });
  chk("B3-F7.1", "registry มี op ครบ 16 ตัวของ B3 · kind=read · action ตามสัญญา", bad.length === 0, "ครบ", bad.map(([id]) => id).join(","));
  chk("B3-F7.2", "op รายงาน (overview/calendar/pnd/credits/statement) rate=report", ["finance.overview", "finance.calendar", "wht.pnd", "wht.credits", "finance-accounts.statement"].every((id) => ops.find((o) => o.id === id)?.rate === "report"), "report", "?", "MINOR");
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 220) : String(e));
} finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  await d(() => prisma.apiKey.deleteMany({ where: { tenantId: TID, name: { startsWith: "QC B3 " } } }));
  if (tidB) {
    for (const m of ["apiIdempotency", "apiKey", "auditLog", "appSystemUnit", "appSystem"]) await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: tidB } }));
    await d(() => prisma.businessUnit.deleteMany({ where: { tenantId: tidB } }));
    await d(() => prisma.tenant.delete({ where: { id: tidB } }));
  }
  await d(() => prisma.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE key LIKE 'acct:api:%'`));
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Account API READ finance (B3) =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
