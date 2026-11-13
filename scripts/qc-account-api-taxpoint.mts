// QC — API บัญชี ACC T1.2: ภาษีขายที่ค้างพัก + ปล่อย VAT + ชนิดบรรทัด
// test id ของ op: reports.parked-vat = "T1.2-TP8" · documents.release-vat = "T1.2-TP9" (ด่าน OA-5.2)
// 🔴 tenant ใหม่ของตัวเอง · ลบทิ้งใน finally
// รัน: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-account-api-taxpoint.mts
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-account-api-taxpoint");
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
const idem = () => ({ "idempotency-key": `t12-${Date.now()}-${Math.random().toString(16).slice(2)}` });

let tid = "";
try {
  const acc = (await import("@/lib/modules/account/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const gl = (await import("@/lib/modules/account/gl" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const ak = (await import("@/lib/api-keys/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const scopes = (await import("@/lib/api-keys/scopes" as string)) as Record<string, Any>;
  const route = (await import("@/app/api/v1/account/[...path]/route" as string)) as Record<string, (req: Request, ctx: { params: Promise<{ path: string[] }> }) => Promise<Response>>;

  const t = await prisma.tenant.create({ data: { name: "QC API T12", slug: `qc-api-t12-${Date.now()}` } });
  tid = t.id;
  const owner = await prisma.user.create({ data: { email: `qc-at12-${Date.now()}@qc.local`, name: "เจ้าของ API T12" } });
  await prisma.membership.create({ data: { userId: owner.id, tenantId: tid, role: "OWNER", unitAccess: ["*"], acceptedAt: new Date() } });
  const SYS = (await sys.createSystem(tid, "ACCOUNT", "บัญชี API T12")).id;
  await acc.saveSettings(tid, SYS, { orgName: "ร้าน API T12", vatRegistered: true, vatRateBp: 700, taxId: "0105561000000" });
  await gl.ensureAccounting({ tenantId: tid, systemId: SYS });
  const kW = await ak.createApiKey({ tenantId: tid }, "T12 write", { scopes: scopes.expandBundles(["accountant"]), systemId: SYS });
  const kR = await ak.createApiKey({ tenantId: tid }, "T12 read", { scopes: scopes.expandBundles(["read-only"]), systemId: SYS });
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
  const cust = await acc.createContact({ tenantId: tid, systemId: SYS, kind: "CUSTOMER", legalType: "COMPANY", name: "ลูกค้า API T12", taxId: "0105561999991", branchCode: "00000" });

  // ชนิดบรรทัดผ่าน REST: สร้างใบผสม (สินค้า + บริการที่ระบุ kind) แล้วอ่านกลับ
  const cr = await call("POST", "/documents", W, {
    type: "INVOICE", contactId: cust.id, issueDate: "2026-10-15", vatMode: "EXCLUDE",
    lines: [
      { description: "สินค้า", qty: 1, unitPriceSatang: 1_000_000, kind: "GOODS" },
      { description: "ค่าบริการ", qty: 1, unitPriceSatang: 500_000, kind: "SERVICE" },
    ],
  });
  const docId = cr.body?.data?.id;
  const got = await call("GET", `/documents/${docId}`, R);
  const kinds = (got.body?.data?.lines ?? []).map((l: Any) => l.kind);
  chk("T12-API.1", "POST /documents รับ lines[].kind · GET /documents/{id} คืน kind ในบรรทัด", cr.status === 201 || cr.status === 200 ? JSON.stringify(kinds) === JSON.stringify(["GOODS", "SERVICE"]) : false, "GOODS,SERVICE", `${cr.status} ${JSON.stringify(kinds)} ${JSON.stringify(cr.body?.error ?? "").slice(0, 200)}`);
  // ปิดสวิตช์ต่อใบ → VAT สินค้าพัก (จำลองข้อมูลเก่า)
  await prisma.accountDocument.update({ where: { id: docId }, data: { autoTaxInvoice: false } });
  const is = await call("POST", `/documents/${docId}/issue`, W, {});
  chk("T12-API.1b", "ออกใบแจ้งหนี้ผ่าน REST ได้", is.status === 200, "200", `${is.status} ${JSON.stringify(is.body?.error ?? "").slice(0, 200)}`);

  // T1.2-TP8 GET /reports/parked-vat
  const pv = await call("GET", "/reports/parked-vat?asOf=2026-11-02", R);
  const row = pv.body?.data?.rows?.find((r: Any) => r.documentId === docId);
  chk("T1.2-TP8", "GET /reports/parked-vat (read-only) → แถวใบนี้ สินค้า 70,000 · บริการ 35,000 · ข้ามเดือน + คำเตือน OUTPUT_VAT_PARKED_PAST_MONTH (รูปทะเบียน: citation/tag/checkedAt)", pv.status === 200 && row?.goodsVatSatang === 70_000 && row?.serviceVatSatang === 35_000 && row?.pastMonth === true && row?.warning?.code === "OUTPUT_VAT_PARKED_PAST_MONTH" && !!row?.warning?.citation && row?.warning?.tag === "V" && !!row?.warning?.checkedAt && pv.body?.data?.warning?.code === "OUTPUT_VAT_PARKED_PAST_MONTH", "ครบ", `${pv.status} ${JSON.stringify(pv.body?.data ?? pv.body).slice(0, 300)}`);

  // T1.2-TP9 POST /documents/{id}/release-vat
  const noDate = await call("POST", `/documents/${docId}/release-vat`, W, {});
  chk("T12-API.2a", "ไม่ส่ง date → 422 (ร้านต้องเลือก ไม่มีค่าเริ่ม)", noDate.status === 422, "422", `${noDate.status}`);
  const ro = await call("POST", `/documents/${docId}/release-vat`, R, { date: "INVOICE_DATE" });
  chk("T12-API.2b", "คีย์อ่านอย่างเดียว → 403", ro.status === 403, "403", `${ro.status}`);
  const noAck = await call("POST", `/documents/${docId}/release-vat`, W, { date: "INVOICE_DATE" });
  chk("T12-API.2c", "ไม่ยืนยัน → 409 legal_ack_required + warnings[TAX_INVOICE_LATE_DATE_CHOICE]", noAck.status === 409 && noAck.body?.error?.code === "legal_ack_required" && noAck.body?.error?.warnings?.[0]?.code === "TAX_INVOICE_LATE_DATE_CHOICE", "409", `${noAck.status} ${JSON.stringify(noAck.body?.error ?? "").slice(0, 200)}`);
  const ok = await call("POST", `/documents/${docId}/release-vat`, W, { date: "INVOICE_DATE", acknowledge: ["TAX_INVOICE_LATE_DATE_CHOICE"] });
  chk("T1.2-TP9", "ยืนยันแล้ว → 200 ใบกำกับ 70,000 (สินค้าเท่านั้น · บริการยังรอรับเงิน) ลงวันที่ 2026-10-15", ok.status === 200 && ok.body?.data?.vatSatang === 70_000 && ok.body?.data?.goodsVatSatang === 70_000 && ok.body?.data?.serviceVatSatang === 0 && ok.body?.data?.date === "2026-10-15" && !!ok.body?.data?.taxInvoiceNo, "ครบ", `${ok.status} ${JSON.stringify(ok.body?.data ?? ok.body?.error).slice(0, 260)}`);
  const ackRows = await prisma.auditLog.findMany({ where: { tenantId: tid, action: "legal.warning.ack", targetId: docId } });
  chk("T12-API.2d", "บันทึกผู้ยืนยันเป็น API key (via rest)", ackRows.length === 1 && ackRows[0].actorType === "API_KEY" && (ackRows[0].after as Any)?.via === "rest", "1 แถว API_KEY", JSON.stringify(ackRows.map((r) => [r.actorType, (r.after as Any)?.via])));
  const again = await call("POST", `/documents/${docId}/release-vat`, W, { date: "TODAY", acknowledge: ["TAX_INVOICE_LATE_DATE_CHOICE"] });
  chk("T12-API.2e", "ปล่อยซ้ำ (ไม่มีสินค้าพักแล้ว) → 4xx พร้อมเหตุผลไทย", again.status >= 400 && again.status < 500 && /[ก-๙]/.test(JSON.stringify(again.body?.error ?? "")), "4xx", `${again.status}`);

  const registry = (await import("@/lib/modules/account/api/registry" as string)) as Record<string, Any>;
  const ops = registry.ACCOUNT_OPS as Any[];
  const need: [string, string, string][] = [["reports.parked-vat", "read", "account.tax.view"], ["documents.release-vat", "write", "account.doc.issue"]];
  const bad = need.filter(([id, kind, action]) => { const o = ops.find((x) => x.id === id); return !o || o.kind !== kind || o.action !== action || !o.tool; });
  chk("T12-API.3", "registry มี reports.parked-vat / documents.release-vat (+ tool ให้เลขา AI)", bad.length === 0, "ครบ", bad.map(([id]) => id).join(","));
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
    await d(() => prisma.user.deleteMany({ where: { email: { contains: "@qc.local" }, name: { in: ["เจ้าของ API T12"] } } }));
  }
  await d(() => prisma.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE key LIKE 'acct:api:%'`));
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Account API taxpoint (T1.2) =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
