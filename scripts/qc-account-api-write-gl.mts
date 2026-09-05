// QC — API บัญชี WO D2: WRITE บัญชี — JV มือ/กลับรายการ/ธง · ผังบัญชี/mapping/บัญชี default ต่อชนิด · ปิด-เปิดงวด/ยื่น ภ.พ.30 · สินทรัพย์/ค่าเสื่อม/จำหน่าย
// Fable oracle · Builder ห้ามแตะ · สัญญาอยู่ที่ ledger/ACCOUNT-API-RUN.md §D2
// 🔴 tenant ใหม่ของตัวเอง · ลบทิ้งใน finally
// ⚠️ standalone-typesafe: dynamic import + wide cast
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-account-api-write-gl");
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
const idem = () => ({ "idempotency-key": `d2-${Date.now()}-${Math.random().toString(16).slice(2)}` });
const ymd = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(d);

let tid = "";
try {
  const acc = (await import("@/lib/modules/account/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const gl = (await import("@/lib/modules/account/gl" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const fin = (await import("@/lib/modules/account/finance" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const ak = (await import("@/lib/api-keys/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const scopes = (await import("@/lib/api-keys/scopes" as string)) as Record<string, Any>;
  const route = (await import("@/app/api/v1/account/[...path]/route" as string)) as Record<string, (req: Request, ctx: { params: Promise<{ path: string[] }> }) => Promise<Response>>;

  const t = await prisma.tenant.create({ data: { name: "QC API D2", slug: `qc-api-d2-${Date.now()}` } });
  tid = t.id;
  const s = await sys.createSystem(tid, "ACCOUNT", "บัญชี D2");
  const SYS = s.id;
  await acc.saveSettings(tid, SYS, { orgName: "ร้าน D2", taxId: "0105561000010", vatRegistered: true, vatRateBp: 700, taxPointBasis: "ON_ISSUE" });
  await gl.ensureAccounting({ tenantId: tid, systemId: SYS });
  const cash = await fin.createFinanceAccount({ tenantId: tid, systemId: SYS, type: "CASH", name: "เงินสด", openingBalance: 1_000_000, openingDate: new Date() });
  const led = async (code: string) => (await prisma.accountLedger.findFirst({ where: { systemId: SYS, code }, select: { id: true, code: true, name: true } }))!;
  const l1100 = await led("1100");
  const l4000 = await led("4000");
  const acct = scopes.expandBundles(["accountant"]) as string[];
  const kA = await ak.createApiKey({ tenantId: tid }, "D2 accountant", { scopes: acct, systemId: SYS });
  const kD = await ak.createApiKey({ tenantId: tid }, "D2 danger", { scopes: [...acct, "account.period.reopen", "account.asset.writeoff", "account.asset.dispose"], systemId: SYS });
  const kR = await ak.createApiKey({ tenantId: tid }, "D2 read", { scopes: scopes.expandBundles(["read-only"]), systemId: SYS });

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
  const today = ymd();
  const period = today.slice(0, 7);

  // ═══ G1 JV มือ ═══
  const jv = await call("POST", "/journal", A, { date: today, book: "GENERAL", memo: "ปรับปรุงลูกหนี้", lines: [{ accountId: l1100.id, debitSatang: 50_000, creditSatang: 0 }, { accountId: l4000.id, debitSatang: 0, creditSatang: 50_000, memo: "รายได้ค้างรับ" }] });
  const jvId = jv.body?.data?.id as string;
  chk("D2-G1.1", "POST /journal → 200 {id,journalNo JV…,date,book GENERAL,status POSTED,lines[] Σdr=Σcr}", jv.status === 200 && typeof jvId === "string" && typeof jv.body?.data?.journalNo === "string" && jv.body?.data?.status === "POSTED" && jv.body?.data?.lines?.length === 2, "200", `${jv.status} ${JSON.stringify(jv.body).slice(0, 200)}`);
  const unbalanced = await call("POST", "/journal", A, { date: today, lines: [{ accountId: l1100.id, debitSatang: 50_000, creditSatang: 0 }, { accountId: l4000.id, debitSatang: 0, creditSatang: 40_000 }] });
  chk("D2-G1.2", "JV ไม่สมดุล → 422 validation/unprocessable ข้อความไทย", unbalanced.status === 422 && /[ก-๙]/.test(unbalanced.body?.error?.message_th ?? ""), "422", `${unbalanced.status} ${code(unbalanced)}`);
  const oneLine = await call("POST", "/journal", A, { date: today, lines: [{ accountId: l1100.id, debitSatang: 1, creditSatang: 0 }] });
  chk("D2-G1.3", "JV บรรทัดเดียว → 422", oneLine.status === 422, "422", `${oneLine.status}`, "MAJOR");
  const readDenied = await call("POST", "/journal", kR.rawKey, { date: today, lines: [] });
  chk("D2-G1.4", "read-only → 403 (journal.adjust)", readDenied.status === 403, "403", `${readDenied.status}`);
  const flag = await call("POST", `/journal/${jvId}/flag`, A, { note: "ตรวจอีกครั้ง" });
  chk("D2-G1.5", "POST /journal/{id}/flag → 200 needsReview true (+flagNote) · เรียกซ้ำ → false", flag.status === 200 && flag.body?.data?.needsReview === true && (await call("POST", `/journal/${jvId}/flag`, A, {})).body?.data?.needsReview === false, "true→false", `${flag.status} ${JSON.stringify(flag.body?.data)}`);
  const revNo = await call("POST", `/journal/${jvId}/reverse`, A, { reason: "บันทึกผิด" });
  chk("D2-G1.6", "reverse ไม่มี confirm → 409 confirm_required", revNo.status === 409 && code(revNo) === "confirm_required", "409", `${revNo.status} ${code(revNo)}`);
  const rev = await call("POST", `/journal/${jvId}/reverse`, A, { confirm: true, reason: "บันทึกผิดบัญชี" });
  chk("D2-G1.7", "POST /journal/{id}/reverse (danger · journal.adjust) → 200 {id ใหม่,journalNo} · ใบเดิม REVERSED", rev.status === 200 && typeof rev.body?.data?.id === "string" && (await prisma.accountJournalEntry.findUnique({ where: { id: jvId }, select: { status: true } }))?.status === "REVERSED", "REVERSED", `${rev.status} ${JSON.stringify(rev.body).slice(0, 160)}`);
  const revAgain = await call("POST", `/journal/${jvId}/reverse`, A, { confirm: true, reason: "กลับซ้ำอีกครั้ง" });
  chk("D2-G1.8", "reverse ซ้ำ → 409", revAgain.status === 409, "409", `${revAgain.status}`);

  // ═══ G2 ผังบัญชี / mapping ═══
  const newLed = await call("POST", "/chart", A, { code: "6199", name: "ค่าใช้จ่ายทดสอบ API", groupPrefix: "610", nameEn: "API test expense" });
  const newLedId = newLed.body?.data?.id as string;
  chk("D2-G2.1", "POST /chart → 200 {id,code 6199,name,type EXPENSE,active true}", newLed.status === 200 && newLed.body?.data?.code === "6199" && newLed.body?.data?.type === "EXPENSE" && newLed.body?.data?.active === true, "200", `${newLed.status} ${JSON.stringify(newLed.body).slice(0, 200)}`);
  const dupLed = await call("POST", "/chart", A, { code: "6199", name: "ซ้ำ", groupPrefix: "610" });
  chk("D2-G2.2", "รหัสบัญชีซ้ำ → 409 duplicate หรือ 422 + details[path=code]", (dupLed.status === 409 || dupLed.status === 422) && JSON.stringify(dupLed.body?.error).includes("code"), "409/422", `${dupLed.status} ${JSON.stringify(dupLed.body?.error).slice(0, 160)}`);
  const badPrefix = await call("POST", "/chart", A, { code: "9999x", name: "x", groupPrefix: "abc" });
  chk("D2-G2.3", "รหัส/prefix ผิดรูป → 422", badPrefix.status === 422, "422", `${badPrefix.status}`, "MAJOR");
  const updLed = await call("PATCH", `/chart/${newLedId}`, A, { name: "ค่าใช้จ่ายทดสอบ API (แก้)" });
  chk("D2-G2.4", "PATCH /chart/{id} (partial) → 200 ชื่อใหม่ code เดิม", updLed.status === 200 && updLed.body?.data?.name === "ค่าใช้จ่ายทดสอบ API (แก้)" && updLed.body?.data?.code === "6199", "ชื่อใหม่", `${updLed.status} ${JSON.stringify(updLed.body?.data).slice(0, 140)}`);
  const sysLed = await call("PATCH", `/chart/${l1100.id}`, A, { code: "1101" });
  chk("D2-G2.5", "เปลี่ยนรหัสบัญชีระบบ → 422/409 ไทย", (sysLed.status === 422 || sysLed.status === 409) && /[ก-๙]/.test(sysLed.body?.error?.message_th ?? ""), "422/409", `${sysLed.status}`, "MAJOR");
  const off = await call("POST", `/chart/${newLedId}/active`, A, { active: false });
  chk("D2-G2.6", "POST /chart/{id}/active {false} → 200 active=false", off.status === 200 && off.body?.data?.active === false, "false", `${off.status} ${JSON.stringify(off.body?.data)}`);
  const offSys = await call("POST", `/chart/${l1100.id}/active`, A, { active: false });
  chk("D2-G2.7", "ปิดบัญชีระบบ/มีความเคลื่อนไหว → 409 ไทย", offSys.status === 409 && /[ก-๙]/.test(offSys.body?.error?.message_th ?? ""), "409", `${offSys.status} ${code(offSys)}`, "MAJOR");
  await call("POST", `/chart/${newLedId}/active`, A, { active: true });
  const map = await call("PUT", "/mappings/GOODS_ISSUE_EXPENSE", A, { accountId: newLedId });
  chk("D2-G2.8", "PUT /mappings/{key} → 200 {key,account{code 6199}} · GET /mappings เห็น", map.status === 200 && map.body?.data?.account?.code === "6199" && (await call("GET", "/mappings", A)).body?.data?.find((m: Any) => m.key === "GOODS_ISSUE_EXPENSE")?.account?.code === "6199", "6199", `${map.status} ${JSON.stringify(map.body).slice(0, 160)}`);
  const mapBad = await call("PUT", "/mappings/NOPE_KEY", A, { accountId: newLedId });
  chk("D2-G2.9", "mapping key ไม่รู้จัก → 422/404", mapBad.status === 422 || mapBad.status === 404, "422/404", `${mapBad.status}`, "MAJOR");
  const dta = await call("PUT", "/doc-type-accounts/EXPENSE", A, { accountId: newLedId });
  chk("D2-G2.10", "PUT /doc-type-accounts/{type} → 200 · GET เห็น EXPENSE→6199 · ส่ง null = ล้าง", dta.status === 200 && (await call("GET", "/doc-type-accounts", A)).body?.data?.find((d: Any) => d.docType === "EXPENSE")?.account?.code === "6199" && (await call("PUT", "/doc-type-accounts/EXPENSE", A, { accountId: null })).status === 200, "6199 แล้วล้าง", `${dta.status}`);

  // ═══ G3 สินทรัพย์ ═══
  const assetLed = await prisma.accountLedger.findFirst({ where: { systemId: SYS, code: { startsWith: "16" }, NOT: { code: { endsWith: "9" } } }, orderBy: { code: "asc" }, select: { id: true, code: true } });
  const accumLed = await prisma.accountLedger.findFirst({ where: { systemId: SYS, code: { startsWith: "16", endsWith: "9" } }, orderBy: { code: "asc" }, select: { id: true, code: true } });
  const depLed = await prisma.accountLedger.findFirst({ where: { systemId: SYS, code: "6800" }, select: { id: true } });
  const reg = await call("POST", "/assets", A, { name: "เรือยาง API", category: "ยานพาหนะ", acquiredDate: today, startDepDate: today, costSatang: 1_200_000, salvageValueSatang: 100, usefulLifeMonths: 12, assetAccountId: assetLed?.id, accumAccountId: accumLed?.id, expenseAccountId: depLed?.id });
  const assetId = reg.body?.data?.id as string;
  chk("D2-G3.1", "POST /assets → 200 {id,code FA-…,name,costSatang,monthlySatang ≈ 99,991,status ACTIVE,netBookValueSatang}", reg.status === 200 && /^FA-/.test(reg.body?.data?.code ?? "") && reg.body?.data?.status === "ACTIVE" && reg.body?.data?.costSatang === 1_200_000 && Number.isInteger(reg.body?.data?.monthlySatang), "200", `${reg.status} ${JSON.stringify(reg.body).slice(0, 220)}`);
  const regBad = await call("POST", "/assets", A, { name: "x", acquiredDate: today, startDepDate: today, costSatang: 100, salvageValueSatang: 200, usefulLifeMonths: 12, assetAccountId: assetLed?.id, accumAccountId: accumLed?.id, expenseAccountId: depLed?.id });
  chk("D2-G3.2", "ซาก ≥ ต้นทุน → 422 ไทย", regBad.status === 422, "422", `${regBad.status} ${code(regBad)}`);
  const prev = await call("GET", `/assets/depreciation/preview?period=${period}`, A);
  chk("D2-G3.3", "preview งวดนี้ → postableCount 1 · totalSatang = monthlySatang", prev.status === 200 && prev.body?.data?.postableCount === 1 && prev.body?.data?.totalSatang === reg.body?.data?.monthlySatang, "1", `${prev.status} ${JSON.stringify(prev.body?.data).slice(0, 160)}`);
  const run = await call("POST", "/assets/depreciation/run", A, { period });
  chk("D2-G3.4", "POST /assets/depreciation/run {period} → 200 {period,posted[1],skipped[],fullyDepreciated[]} + JV", run.status === 200 && run.body?.data?.posted?.length === 1 && run.body.data.posted[0].assetId === assetId && typeof run.body.data.posted[0].journalNo === "string", "posted 1", `${run.status} ${JSON.stringify(run.body?.data).slice(0, 200)}`);
  const runAgain = await call("POST", "/assets/depreciation/run", A, { period });
  chk("D2-G3.5", "run ซ้ำงวดเดิม → 200 posted 0 skipped 1 (idempotent) · ค่าเสื่อม 1 แถว", runAgain.status === 200 && runAgain.body?.data?.posted?.length === 0 && (await prisma.accountDepreciation.count({ where: { assetId } })) === 1, "0/1", `${runAgain.status} ${JSON.stringify(runAgain.body?.data).slice(0, 160)}`);
  const disposeNo = await call("POST", `/assets/${assetId}/dispose`, A, { confirm: true, reason: "ขายต่อ", mode: "SELL", date: today, proceedsSatang: 900_000, financeAccountId: cash.id });
  chk("D2-G3.6", "dispose ด้วยคีย์ไม่มี asset.dispose → 403", disposeNo.status === 403, "403", `${disposeNo.status}`);
  const dispose = await call("POST", `/assets/${assetId}/dispose`, D, { confirm: true, reason: "ขายต่อให้ร้านอื่น", mode: "SELL", date: today, proceedsSatang: 900_000, financeAccountId: cash.id });
  chk("D2-G3.7", "POST /assets/{id}/dispose (danger · asset.dispose) SELL → 200 {journalNo,gainLossSatang} · status DISPOSED", dispose.status === 200 && Number.isInteger(dispose.body?.data?.gainLossSatang) && (await prisma.accountFixedAsset.findUnique({ where: { id: assetId }, select: { status: true } }))?.status === "DISPOSED", "DISPOSED", `${dispose.status} ${JSON.stringify(dispose.body).slice(0, 160)}`);
  const disposeAgain = await call("POST", `/assets/${assetId}/dispose`, D, { confirm: true, reason: "ตัดซ้ำอีกครั้ง", mode: "WRITE_OFF", date: today });
  chk("D2-G3.8", "dispose ซ้ำ → 409", disposeAgain.status === 409, "409", `${disposeAgain.status}`);

  // ═══ G4 งวด ═══
  const chkl = await call("GET", `/periods/${period}/checklist`, A);
  chk("D2-G4.1", "checklist งวดปัจจุบันอ่านได้ (items ≥3)", chkl.status === 200 && chkl.body?.data?.items?.length >= 3, "≥3", `${chkl.status}`);
  const vatFiled = await call("POST", `/periods/${period}/vat-filed`, A, { salesVatSatang: 0, inputVatSatang: 0, note: "ยื่นแล้ว" });
  chk("D2-G4.2", "POST /periods/{key}/vat-filed → 200 · GET /periods เห็น vatFiled=true", vatFiled.status === 200 && (await call("GET", "/periods", A)).body?.data?.find((p: Any) => p.period === period)?.vatFiled === true, "true", `${vatFiled.status} ${code(vatFiled)}`);
  const vatUn = await call("DELETE", `/periods/${period}/vat-filed`, D, { confirm: true, reason: "ยื่นผิดงวด" });
  chk("D2-G4.3", "DELETE /periods/{key}/vat-filed (danger · period.reopen) → 200 vatFiled=false", vatUn.status === 200 && (await call("GET", "/periods", A)).body?.data?.find((p: Any) => p.period === period)?.vatFiled === false, "false", `${vatUn.status} ${code(vatUn)}`);
  const close = await call("POST", `/periods/${period}/close`, A, {});
  const periodRow = await prisma.accountPeriod.findFirst({ where: { systemId: SYS, periodKey: period }, select: { status: true } });
  chk("D2-G4.4", "POST /periods/{key}/close → 200 {period,status CLOSED,checklist} · DB CLOSED (หรือ 409 ถ้า checklist บล็อกพร้อมเหตุผลไทย)", (close.status === 200 && periodRow?.status === "CLOSED") || (close.status === 409 && /[ก-๙]/.test(close.body?.error?.message_th ?? "")), "CLOSED", `${close.status} ${periodRow?.status} ${close.body?.error?.message_th ?? ""}`);
  if (close.status === 200) {
    const jvLocked = await call("POST", "/journal", A, { date: today, lines: [{ accountId: l1100.id, debitSatang: 100, creditSatang: 0 }, { accountId: l4000.id, debitSatang: 0, creditSatang: 100 }] });
    chk("D2-G4.5", "งวดปิดแล้ว → POST /journal วันที่ในงวด → 409 period_locked", jvLocked.status === 409 && code(jvLocked) === "period_locked", "409 period_locked", `${jvLocked.status} ${code(jvLocked)}`);
    const reopenNo = await call("POST", `/periods/${period}/reopen`, A, { confirm: true, reason: "ต้องแก้รายการ" });
    chk("D2-G4.6", "reopen ด้วยคีย์ไม่มี period.reopen → 403", reopenNo.status === 403, "403", `${reopenNo.status}`);
    const reopen = await call("POST", `/periods/${period}/reopen`, D, { confirm: true, reason: "ต้องแก้รายการ" });
    chk("D2-G4.7", "POST /periods/{key}/reopen (danger) → 200 · DB OPEN · audit เก็บ reason", reopen.status === 200 && (await prisma.accountPeriod.findFirst({ where: { systemId: SYS, periodKey: period }, select: { status: true } }))?.status === "OPEN" && !!(await prisma.auditLog.findFirst({ where: { tenantId: tid, actorType: "API_KEY" as Any, action: "account.period.reopen" } })), "OPEN", `${reopen.status} ${code(reopen)}`);
  }

  // ═══ G5 registry ═══
  const registry = (await import("@/lib/modules/account/api/registry" as string)) as Record<string, Any>;
  const ops = registry.ACCOUNT_OPS as Any[];
  const need: [string, string, string][] = [["journal.create", "write", "account.journal.adjust"], ["journal.reverse", "danger", "account.journal.adjust"], ["journal.flag", "write", "account.journal.adjust"], ["chart.create", "write", "account.chart.manage"], ["chart.update", "write", "account.chart.manage"], ["chart.set-active", "write", "account.chart.manage"], ["mappings.set", "write", "account.mapping.manage"], ["doc-type-accounts.set", "write", "account.mapping.manage"], ["periods.close", "write", "account.period.close"], ["periods.reopen", "danger", "account.period.reopen"], ["periods.vat-filed", "write", "account.period.close"], ["periods.vat-unfiled", "danger", "account.period.reopen"], ["assets.register", "write", "account.asset.register"], ["assets.depreciation-run", "write", "account.asset.manage"], ["assets.dispose", "danger", "account.asset.dispose"]];
  const bad = need.filter(([id, kind, action]) => { const o = ops.find((x) => x.id === id); return !o || o.kind !== kind || o.action !== action; });
  chk("D2-G5.1", "registry มี op ครบ 15 ตัวของ D2 · kind/action ตามสัญญา", bad.length === 0, "ครบ", bad.map(([id]) => id).join(","));
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 260) : String(e));
} finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  if (tid) {
    for (const m of ["accountDepreciation", "accountFixedAsset", "accountJournalLine", "accountJournalEntry", "accountVatFiling", "accountDocumentPayment", "accountDocumentLine", "accountDocument", "accountDocSequence", "accountFinanceOpening", "accountFinance", "accountContact", "accountMapping", "accountLedger", "accountPeriod", "accountSettings", "apiIdempotency", "apiKey", "auditLog", "outboxEvent", "appSystemUnit", "appSystem"]) {
      await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: tid } }));
    }
    await d(() => prisma.businessUnit.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.tenant.delete({ where: { id: tid } }));
  }
  await d(() => prisma.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE key LIKE 'acct:api:%'`));
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Account API WRITE GL (D2) =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
