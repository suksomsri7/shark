// QC — API บัญชี ACC T1.4/T1.5: สถานะภาษีซื้อผ่าน REST · ใบกำกับภาษีซื้อรอรับ · รับใบข้ามเดือน · เคลมไม่ได้
// test id ของ op: reports.pending-input-vat = "T1.5-IV-API8" · documents.input-vat-not-claimable = "T1.5-IV-API9" · reports.purchase-tax = "T1.6-PT-API1" (ด่าน OA-5.2)
// 🔴 tenant ใหม่ของตัวเอง · ลบทิ้งใน finally
// รัน: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-account-api-inputvat.mts
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-account-api-inputvat");
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
const idem = () => ({ "idempotency-key": `t14-${Date.now()}-${Math.random().toString(16).slice(2)}` });

let tid = "";
try {
  const acc = (await import("@/lib/modules/account/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const gl = (await import("@/lib/modules/account/gl" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const ak = (await import("@/lib/api-keys/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const scopes = (await import("@/lib/api-keys/scopes" as string)) as Record<string, Any>;
  const route = (await import("@/app/api/v1/account/[...path]/route" as string)) as Record<string, (req: Request, ctx: { params: Promise<{ path: string[] }> }) => Promise<Response>>;

  const t = await prisma.tenant.create({ data: { name: "QC API T14", slug: `qc-api-t14-${Date.now()}` } });
  tid = t.id;
  const owner = await prisma.user.create({ data: { email: `qc-at14-${Date.now()}@qc.local`, name: "เจ้าของ API T14" } });
  await prisma.membership.create({ data: { userId: owner.id, tenantId: tid, role: "OWNER", unitAccess: ["*"], acceptedAt: new Date() } });
  const SYS = (await sys.createSystem(tid, "ACCOUNT", "บัญชี API T14")).id;
  await acc.saveSettings(tid, SYS, { orgName: "ร้าน API T14", vatRegistered: true, vatRateBp: 700, taxId: "0105561000000" });
  await gl.ensureAccounting({ tenantId: tid, systemId: SYS });
  const kW = await ak.createApiKey({ tenantId: tid }, "T14 write", { scopes: scopes.expandBundles(["accountant"]), systemId: SYS });
  const kR = await ak.createApiKey({ tenantId: tid }, "T14 read", { scopes: scopes.expandBundles(["read-only"]), systemId: SYS });
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
  const V0 = await acc.createContact({ tenantId: tid, systemId: SYS, kind: "VENDOR", legalType: "COMPANY", name: "ผู้ขายไม่มีเลข API" });
  const ent = (await prisma.accountLedger.findFirst({ where: { systemId: SYS, code: "6930" }, select: { id: true } }))!.id;
  const n6950 = (await prisma.accountLedger.findFirst({ where: { systemId: SYS, code: "6950" }, select: { id: true } }))!.id;
  const net = async (acct: string, refIds: string[]) => (await prisma.accountJournalLine.findMany({ where: { systemId: SYS, accountId: acct, entry: { refType: "AccountDocument", refId: { in: refIds } } }, select: { debit: true, credit: true } })).reduce((a, l) => a + l.debit - l.credit, 0);
  const L = (extra: Any = {}) => ({ description: "ค่าใช้จ่าย", qty: 1, unitPriceSatang: 1_000_000, vatRateBp: 700, ...extra });

  // 1) ไม่ระบุสถานะ + คู่ค้าไม่มีเลข ⇒ รอใบกำกับ · บรรทัดบัญชีค่ารับรอง ⇒ เคลมไม่ได้
  const c1 = await call("POST", "/documents", W, { type: "EXPENSE", contactId: V0.id, issueDate: "2026-04-10", vatMode: "EXCLUDE", lines: [L(), L({ accountId: ent })] });
  const id1 = c1.body?.data?.id;
  const d1 = await prisma.accountDocument.findFirst({ where: { id: id1 }, include: { lines: { orderBy: { sortOrder: "asc" } } } });
  chk("T14-API.1", "POST /documents EXPENSE ไม่ระบุสถานะ ⇒ PENDING (คู่ค้าไม่มีเลข) · บรรทัดค่ารับรอง NO_CLAIM/ENTERTAINMENT", (c1.status === 201 || c1.status === 200) && d1?.inputVatStatus === "PENDING" && d1?.lines[1]?.inputVatStatus === "NO_CLAIM" && d1?.lines[1]?.inputVatReason === "ENTERTAINMENT", "PENDING", `${c1.status} ${d1?.inputVatStatus} ${JSON.stringify(c1.body?.error ?? "").slice(0, 200)}`);
  const i1 = await call("POST", `/documents/${id1}/issue`, W, {});
  chk("T14-API.1b", "ออกได้ไม่ต้องยืนยัน (คำเตือนแจ้งเท่านั้น)", i1.status === 200, "200", `${i1.status} ${JSON.stringify(i1.body?.error ?? "").slice(0, 200)}`);

  // 2) vatPurchaseMode CLAIM + คู่ค้าไม่มีเลข ⇒ 409 legal_ack_required → ยืนยัน → 200
  const c2 = await call("POST", "/documents", W, { type: "EXPENSE", contactId: V0.id, issueDate: "2026-10-15", vatMode: "EXCLUDE", vatPurchaseMode: "CLAIM", lines: [L({ inputVatStatus: "CLAIM" })] });
  const id2 = c2.body?.data?.id;
  const i2 = await call("POST", `/documents/${id2}/issue`, W, {});
  chk("T14-API.2", "CLAIM กับคู่ค้าไม่มีเลข → 409 legal_ack_required + INPUT_VAT_CLAIM_WITHOUT_VENDOR_TAX_ID", i2.status === 409 && i2.body?.error?.code === "legal_ack_required" && (i2.body?.error?.warnings ?? []).some((w: Any) => w.code === "INPUT_VAT_CLAIM_WITHOUT_VENDOR_TAX_ID"), "409", `${i2.status} ${JSON.stringify(i2.body?.error ?? "").slice(0, 200)}`);
  const i2b = await call("POST", `/documents/${id2}/issue`, W, { acknowledge: ["INPUT_VAT_CLAIM_WITHOUT_VENDOR_TAX_ID"] });
  chk("T14-API.2b", "ยืนยันแล้ว → 200", i2b.status === 200, "200", `${i2b.status} ${JSON.stringify(i2b.body?.error ?? "").slice(0, 200)}`);

  // 3) GET /reports/pending-input-vat
  const pv = await call("GET", "/reports/pending-input-vat?asOf=2026-11-13", R);
  const row = pv.body?.data?.rows?.find((r: Any) => r.sourceId === id1);
  chk("T1.5-IV-API8", "GET /reports/pending-input-vat (read-only) → ใบ เม.ย. ยอดรอ 70,000 · เคลมได้ถึง 2026-10 · เลยแล้ว + คำเตือน INPUT_VAT_PENDING_PAST_WINDOW (รูปทะเบียน) · limitMonths 6", pv.status === 200 && row?.vatSatang === 70_000 && row?.lastClaimMonth === "2026-10" && row?.pastWindow === true && row?.warning?.code === "INPUT_VAT_PENDING_PAST_WINDOW" && !!row?.warning?.citation && pv.body?.data?.limitMonths === 6, "ครบ", `${pv.status} ${JSON.stringify(pv.body?.data ?? pv.body).slice(0, 300)}`);

  // 4) POST /documents/{ptx}/receive นอกเพดาน → 409 → ยืนยัน → 200 + ข้อความ
  const ptx = (await prisma.accountDocument.findFirst({ where: { systemId: SYS, docType: "PURCHASE_TAX_INVOICE", sourceDocId: id1 } }))!;
  const r0 = await call("POST", `/documents/${ptx.id}/receive`, W, { vendorInvoiceDate: "2026-04-10", vendorInvoiceNo: "V-001", claimDate: "2026-11-05" });
  chk("T14-API.3", "receive เกินเพดาน (เดือนที่ 7) → 409 + INPUT_VAT_LATE_CLAIM_OUT_OF_WINDOW", r0.status === 409 && r0.body?.error?.warnings?.[0]?.code === "INPUT_VAT_LATE_CLAIM_OUT_OF_WINDOW", "409", `${r0.status} ${JSON.stringify(r0.body?.error ?? "").slice(0, 200)}`);
  const r1 = await call("POST", `/documents/${ptx.id}/receive`, W, { vendorInvoiceDate: "2026-04-10", vendorInvoiceNo: "V-001", claimDate: "2026-11-05", acknowledge: ["INPUT_VAT_LATE_CLAIM_OUT_OF_WINDOW"] });
  const p1 = await prisma.accountDocument.findFirst({ where: { id: ptx.id } });
  chk("T14-API.3b", "ยืนยันแล้ว → 200 · RECEIVED · ข้อความ 'ถือเป็นภาษีซื้อในเดือนภาษี พฤศจิกายน 2569' · เลขที่ V-001", r1.status === 200 && p1?.status === "RECEIVED" && p1.inputVatLateNote === "ถือเป็นภาษีซื้อในเดือนภาษี พฤศจิกายน 2569" && p1.reference === "V-001", "ok", `${r1.status} ${p1?.inputVatLateNote}`);

  // 5) POST /documents/{ptx}/input-vat-not-claimable
  const c5 = await call("POST", "/documents", W, { type: "EXPENSE", contactId: V0.id, issueDate: "2026-10-15", vatMode: "EXCLUDE", lines: [L()] });
  await call("POST", `/documents/${c5.body?.data?.id}/issue`, W, {});
  const ptx5 = (await prisma.accountDocument.findFirst({ where: { systemId: SYS, docType: "PURCHASE_TAX_INVOICE", sourceDocId: c5.body?.data?.id } }))!;
  const ro = await call("POST", `/documents/${ptx5.id}/input-vat-not-claimable`, R, { reason: "ENTERTAINMENT" });
  chk("T14-API.4", "คีย์อ่านอย่างเดียว → 403", ro.status === 403, "403", `${ro.status}`);
  const bad = await call("POST", `/documents/${ptx5.id}/input-vat-not-claimable`, W, { reason: "WHATEVER" });
  chk("T14-API.4b", "เหตุนอกตาราง → 422", bad.status === 422, "422", `${bad.status}`);
  const nc = await call("POST", `/documents/${ptx5.id}/input-vat-not-claimable`, W, { reason: "ENTERTAINMENT" });
  const p5 = await prisma.accountDocument.findFirst({ where: { id: ptx5.id } });
  chk("T1.5-IV-API9", "POST /documents/{id}/input-vat-not-claimable → 200 · RECEIVED+NO_CLAIM · Dr 6950 70,000 (ค่ารับรอง = รายจ่ายได้)", nc.status === 200 && p5?.status === "RECEIVED" && p5.inputVatStatus === "NO_CLAIM" && (await net(n6950, [ptx5.id])) === 70_000, "ok", `${nc.status} ${p5?.status} ${p5?.inputVatStatus} ${JSON.stringify(nc.body?.error ?? "").slice(0, 200)}`);

  // 6) ACC T1.6 — GET /reports/purchase-tax (เดือนที่รับใบ V-001) · JSON + CSV
  const pt = await call("GET", "/reports/purchase-tax?period=2026-11", R);
  const ptRow = pt.body?.data?.rows?.find((r: Any) => r.invoiceNo === "V-001");
  chk("T1.6-PT-API1", "GET /reports/purchase-tax (read-only) → แถว V-001 ลำดับที่ 1 · วันที่ได้รับ 2026-11-05 · วันที่ใบ 2026-04-10 · ภาษี 70,000 · ข้อความเคลมข้ามเดือน · ข้อตรวจผ่าน · หัวรายงาน", pt.status === 200 && ptRow?.seq === 1 && ptRow.receivedDate === "2026-11-05" && ptRow.invoiceDate === "2026-04-10" && ptRow.vatSatang === 70_000 && ptRow.notes.includes("ถือเป็นภาษีซื้อในเดือนภาษี พฤศจิกายน 2569") && pt.body?.data?.checks?.every((c: Any) => c.ok) && pt.body?.data?.header?.taxId === "0105561000000", "ครบ", `${pt.status} ${JSON.stringify(pt.body?.data ?? pt.body).slice(0, 400)}`);
  const ptCsvReq = new Request("http://x/api/v1/account/reports/purchase-tax?period=2026-11", { method: "GET", headers: { authorization: `Bearer ${R}`, accept: "text/csv" } });
  const ptCsvRes = await route.GET!(ptCsvReq, { params: Promise.resolve({ path: ["reports", "purchase-tax"] }) });
  const ptCsv = await ptCsvRes.text();
  chk("T1.6-PT-API2", "Accept: text/csv → รายงานภาษีซื้อ CSV (หัว + แถว V-001 700.00)", ptCsvRes.status === 200 && /text\/csv/.test(ptCsvRes.headers.get("content-type") ?? "") && /รายงานภาษีซื้อ/.test(ptCsv) && /V-001.*700\.00/.test(ptCsv), "csv", `${ptCsvRes.status} ${ptCsv.slice(0, 200)}`);

  const registry = (await import("@/lib/modules/account/api/registry" as string)) as Record<string, Any>;
  const ops = registry.ACCOUNT_OPS as Any[];
  const need: [string, string, string][] = [["reports.pending-input-vat", "read", "account.tax.view"], ["documents.input-vat-not-claimable", "write", "account.payment.record"]];
  const miss = need.filter(([id, kind, action]) => { const o = ops.find((x) => x.id === id); return !o || o.kind !== kind || o.action !== action || !o.tool; });
  chk("T14-API.5", "registry มี reports.pending-input-vat / documents.input-vat-not-claimable (+ tool ให้เลขา AI)", miss.length === 0, "ครบ", miss.map(([id]) => id).join(","));
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
    await d(() => P.accountDocument.updateMany({ where: { tenantId: tid }, data: { sourceDocId: null } }));
    for (const m of ["accountDocument", "settingChange", "settingValue", "accountDocSequence", "accountContact", "accountMapping", "accountPeriod", "accountSettings", "apiIdempotency", "apiKey", "auditLog", "outboxEvent", "membership", "appSystemUnit"]) {
      await d(() => P[m].deleteMany({ where: { tenantId: tid } }));
    }
    await d(() => P.accountLedger.updateMany({ where: { tenantId: tid }, data: { parentId: null } }));
    await d(() => P.accountLedger.deleteMany({ where: { tenantId: tid } }));
    await d(() => P.appSystem.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.businessUnit.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.tenant.delete({ where: { id: tid } }));
    await d(() => prisma.user.deleteMany({ where: { email: { contains: "@qc.local" }, name: { in: ["เจ้าของ API T14"] } } }));
  }
  await d(() => prisma.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE key LIKE 'acct:api:%'`));
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Account API inputvat (T1.4/T1.5) =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
