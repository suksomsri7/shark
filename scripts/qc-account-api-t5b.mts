// QC — API บัญชี ACC T5.8 T5.9 T5.10 T5.11 (เลน 1): งบเปลี่ยนแปลงส่วนของเจ้าของ · สินค้า/ของเสีย/ถือเป็นขาย · รายได้รับล่วงหน้า/เงินประกัน/ผู้ออกส่วนลด · สาขา
// test id ของ op (ด่าน fitness F13.1): T58-R1 · T59-R1 · T59-R2 · T59-R3 · T59-W1 · T510-R1 · T510-W1 · T510-W2 · T510-W3 · T510-W4 · T510-W5 · T511-R1 · T511-R2 · T511-W1 · T511-W2
// ข้อสอบเต็มของงาน: qc-acc-v2-equity · qc-acc-v2-goods · qc-acc-v2-deferral · qc-acc-v2-branches — ชุดนี้ตรวจรูปคำตอบ REST + สิทธิ์ + เครื่องมือเลขา
// 🔴 tenant ใหม่ของตัวเอง · ลบทิ้งใน finally
// รัน: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-account-api-t5b.mts
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-account-api-t5b");
const { prisma } = await import("@/lib/core/db");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const cks: { id: string; ok: boolean }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string) => {
  cks.push({ id, ok });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a.slice(0, 500)}`}`);
};
const FORBID = /references\/|\.md\b|\[(?:V2|V|S|U)\]/;
let tid = "";
try {
  const acc: Any = await import("@/lib/modules/account/service" as string);
  const gl: Any = await import("@/lib/modules/account/gl" as string);
  const sys: Any = await import("@/lib/modules/system/service" as string);
  const ak: Any = await import("@/lib/api-keys/service" as string);
  const scopes: Any = await import("@/lib/api-keys/scopes" as string);
  const AO: Any = await import("@/lib/ai/account-ops" as string);
  const SK: Any = await import("@/lib/ai/skills" as string);
  const route: Any = await import("@/app/api/v1/account/[...path]/route" as string);
  const stamp = Date.now();
  tid = (await prisma.tenant.create({ data: { name: "QC API T5b", slug: `qc-api-t5b-${stamp}` } })).id;
  const owner = await prisma.user.create({ data: { email: `qc-at5b-${stamp}@qc.local`, name: "เจ้าของ API T5b" } });
  await prisma.membership.create({ data: { userId: owner.id, tenantId: tid, role: "OWNER", unitAccess: ["*"], acceptedAt: new Date() } });
  const SYS = (await sys.createSystem(tid, "ACCOUNT", "บัญชี API T5b")).id;
  await acc.saveSettings(tid, SYS, { orgName: "ร้าน API T5b", vatRegistered: true, vatRateBp: 700, taxId: "0105561000588" });
  await gl.ensureAccounting({ tenantId: tid, systemId: SYS });
  const kR = await ak.createApiKey({ tenantId: tid }, "T5b read", { scopes: scopes.expandBundles(["read-only"]), systemId: SYS });
  const kO = await ak.createApiKey({ tenantId: tid }, "T5b owner", { scopes: [...scopes.expandBundles(["accountant"]), "account.settings.manage", "account.journal.adjust", "account.product.manage"], systemId: SYS });
  const call = async (method: string, path: string, key: string, body?: unknown) => {
    const headers: Record<string, string> = { authorization: `Bearer ${key}`, ...(method === "GET" ? {} : { "idempotency-key": `t5b-${Date.now()}-${Math.random().toString(16).slice(2)}` }) };
    let b: string | undefined;
    if (body !== undefined) { b = JSON.stringify(body); headers["content-type"] = "application/json"; }
    const req = new Request(`http://x/api/v1/account${path}`, { method, headers, body: b });
    const res = await route[method]!(req, { params: Promise.resolve({ path: path.split("?")[0]!.split("/").filter(Boolean) }) });
    const text = await res.text();
    let p: Any = null; try { p = JSON.parse(text); } catch { p = { _raw: text }; }
    return { status: res.status, body: p };
  };
  const ok2 = (s: number) => s === 200 || s === 201;
  const led = async (code: string) => (await prisma.accountLedger.findFirst({ where: { systemId: SYS, code }, select: { id: true } }))!.id;
  await gl.postManualJV({ tenantId: tid, systemId: SYS }, { date: new Date("2026-02-15T12:00:00+07:00"), memo: "ทุน", lines: [{ accountId: await led("1010"), debit: 50_000, credit: 0 }, { accountId: await led("3000"), debit: 0, credit: 50_000 }] });

  // T5.8
  const e1 = await call("GET", "/reports/equity?to=2026-12", kR.rawKey);
  chk("T58-R1", "GET /reports/equity: งวด 2026-01..12 · เพิ่มทุน 50,000 สตางค์ · งวดก่อนมาด้วย · reconciled", e1.status === 200 && e1.body?.data?.current?.from === "2026-01" && e1.body.data.current.rows.find((r: Any) => r.kind === "CONTRIBUTION")?.total === 50_000 && e1.body.data.prior?.from === "2025-01" && e1.body.data.current.reconciled === true, "200", `${e1.status} ${JSON.stringify(e1.body).slice(0, 300)}`);
  const e2 = await call("GET", "/reports/equity?to=2026-12&compare=false", kR.rawKey);
  chk("T58-R1b", "compare=false → prior null · to ผิด → 422", e2.status === 200 && e2.body?.data?.prior === null && (await call("GET", "/reports/equity?to=2026-13", kR.rawKey)).status === 422, "200/422", `${e2.status}`);

  // T5.9
  const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  const g1 = await call("GET", `/stock/goods-report?from=${today.slice(0, 7)}-01&to=${today}`, kR.rawKey);
  chk("T59-R1", "GET /stock/goods-report: rows [] · totals · คำเตือนรูปแบบ (ข้อความไม่มี path)", g1.status === 200 && Array.isArray(g1.body?.data?.rows) && g1.body.data.warnings.some((w: Any) => w.code === "GOODS_REPORT_FORMAT") && !FORBID.test(g1.body.data.warnings.map((w: Any) => w.messageTh).join(" ")), "200", `${g1.status} ${JSON.stringify(g1.body).slice(0, 300)}`);
  const g1b = await call("GET", `/stock/goods-report?from=${today}&to=2000-01-01`, kR.rawKey);
  chk("T59-R1b", "from > to → 422", g1b.status === 422, "422", `${g1b.status}`);
  const prod = await prisma.accountProduct.create({ data: { tenantId: tid, systemId: SYS, name: "สินค้า API T5b", type: "GOODS", buyPrice: 1_000, salePrice: 2_000, qtyOnHand: 10 } });
  const wDoc = await call("POST", "/stock-documents", kO.rawKey, { type: "GOODS_ISSUE", reason: "WASTE", lines: [{ productId: prod.id, qty: 1 }], allowNegative: true });
  const wId = wDoc.body?.data?.id ?? wDoc.body?.data?.document?.id;
  const g2 = await call("GET", "/stock/waste-log", kR.rawKey);
  chk("T59-R2", "GET /stock/waste-log: 1 ใบ · คำเตือนขาดพยาน/รูป", g2.status === 200 && g2.body?.data?.rows?.length === 1 && g2.body.data.rows[0].warnings.some((w: Any) => w.code === "STOCK_WASTE_EVIDENCE_MISSING"), "200", `${wDoc.status} ${g2.status} ${JSON.stringify(g2.body).slice(0, 300)}`);
  const g3 = await call("PUT", `/stock/waste-log/${wId}/evidence`, kO.rawKey, { witnessName: "พยาน API" });
  const g3b = await call("PUT", `/stock/waste-log/${wId}/evidence`, kR.rawKey, { witnessName: "x" });
  const g3c = await call("PUT", `/stock/waste-log/nope/evidence`, kO.rawKey, { witnessName: "x" });
  chk("T59-W1", "PUT evidence: บันทึก · คีย์อ่านอย่างเดียว 403 · ไม่พบ 404", ok2(g3.status) && ((await prisma.accountDocument.findUnique({ where: { id: wId } })) as Any)?.stockEvidence?.witnessName === "พยาน API" && g3b.status === 403 && g3c.status === 404, "200/403/404", `${g3.status} ${g3b.status} ${g3c.status}`);
  const pu = await call("POST", "/stock-documents", kO.rawKey, { type: "GOODS_ISSUE", reason: "PERSONAL_USE", lines: [{ productId: prod.id, qty: 2 }], allowNegative: true, acknowledge: ["STOCK_ISSUE_PERSONAL_USE"] });
  const g4 = await call("GET", "/stock/deemed-sales", kR.rawKey);
  chk("T59-R3", "GET /stock/deemed-sales: ใช้ส่วนตัว 2 × 2,000 = 4,000 VAT 280 · คำเตือน STOCK_DEEMED_SALE_VAT", ok2(pu.status) && g4.status === 200 && g4.body?.data?.deemed?.[0]?.marketValueSatang === 4_000 && g4.body.data.deemedVatSatang === 280 && g4.body.data.setting === "WARN" && g4.body.data.warnings.some((w: Any) => w.code === "STOCK_DEEMED_SALE_VAT"), "200", `${pu.status} ${g4.status} ${JSON.stringify(g4.body).slice(0, 300)}`);

  // T5.10
  const d1 = await call("POST", "/deferrals", kO.rawKey, { description: "สมาชิกรายปี API", amount: 120_000, startMonth: "2026-01", months: 12, incomeAccountCode: "4030" });
  chk("T510-W1", "POST /deferrals: id + คำเตือน DEFERRED_REVENUE_TAX_POINT · คีย์อ่านอย่างเดียว 403 · เดือน 0 → 422", ok2(d1.status) && !!d1.body?.data?.id && d1.body.data.warnings[0]?.code === "DEFERRED_REVENUE_TAX_POINT" && (await call("POST", "/deferrals", kR.rawKey, { description: "x", amount: 1, startMonth: "2026-01", months: 1, incomeAccountCode: "4030" })).status === 403 && (await call("POST", "/deferrals", kO.rawKey, { description: "x", amount: 1, startMonth: "2026-01", months: 0, incomeAccountCode: "4030" })).status === 422, "201/403/422", `${d1.status} ${JSON.stringify(d1.body).slice(0, 300)}`);
  const d2 = await call("POST", "/deferrals/recognize", kO.rawKey, { upTo: "2026-03" });
  chk("T510-W2", "POST /deferrals/recognize upTo 2026-03: 3 เดือน × 10,000", ok2(d2.status) && d2.body?.data?.posted?.length === 3 && d2.body.data.posted.every((p: Any) => p.amountSatang === 10_000), "3", `${d2.status} ${JSON.stringify(d2.body).slice(0, 300)}`);
  const d3 = await call("GET", "/deferrals", kR.rawKey);
  chk("T510-R1", "GET /deferrals: รับรู้แล้ว 30,000 คงเหลือ 90,000 · ตาราง 12 เดือน", d3.status === 200 && d3.body?.data?.[0]?.recognizedSatang === 30_000 && d3.body.data[0].remainingSatang === 90_000 && d3.body.data[0].schedule.length === 12, "200", `${d3.status} ${JSON.stringify(d3.body).slice(0, 300)}`);
  const d4 = await call("POST", `/deferrals/${d1.body?.data?.id}/cancel`, kO.rawKey, { reason: "ลูกค้ายกเลิก" });
  chk("T510-W3", "POST /deferrals/{id}/cancel: กลับรายการ 4 ใบ · ไม่มีเหตุผล 422", ok2(d4.status) && d4.body?.data?.reversed === 4 && (await call("POST", `/deferrals/${d1.body?.data?.id}/cancel`, kO.rawKey, {})).status === 422, "4", `${d4.status} ${JSON.stringify(d4.body).slice(0, 300)}`);
  const svc = await prisma.accountProduct.create({ data: { tenantId: tid, systemId: SYS, name: "คีย์การ์ด API", type: "SERVICE", vatRateBp: 0 } });
  const d5 = await call("PUT", `/products/${svc.id}/deposit-kind`, kO.rawKey, { kind: "SERVICE_VAT" });
  chk("T510-W4", "PUT /products/{id}/deposit-kind SERVICE_VAT + VAT 0 → คำเตือน · ชนิดผิด 422", ok2(d5.status) && d5.body?.data?.warnings?.[0]?.code === "DEPOSIT_SERVICE_VAT_EXPECTED" && (await call("PUT", `/products/${svc.id}/deposit-kind`, kO.rawKey, { kind: "X" })).status === 422, "200", `${d5.status} ${JSON.stringify(d5.body).slice(0, 300)}`);
  const cust = await acc.createContact({ tenantId: tid, systemId: SYS, kind: "CUSTOMER", legalType: "PERSON", name: "ลูกค้า API T5b" });
  const doc = await acc.createDocument({ tenantId: tid, systemId: SYS, docType: "INVOICE", contactId: cust.id, issueDate: new Date(), vatMode: "EXCLUDE", discountAmount: 1_000, lines: [{ description: "อาหาร", qty: 1, unitPrice: 10_000, vatRateBp: 700 }] });
  const d6 = await call("PUT", `/documents/${doc.id}/discount-funder`, kO.rawKey, { funder: "PLATFORM" });
  chk("T510-W5", "PUT /documents/{id}/discount-funder PLATFORM → คำเตือน [U] · บันทึก", ok2(d6.status) && d6.body?.data?.warnings?.[0]?.code === "PLATFORM_DISCOUNT_FUNDER" && (await prisma.accountDocument.findUnique({ where: { id: doc.id } }))?.discountFundedBy === "PLATFORM", "200", `${d6.status} ${JSON.stringify(d6.body).slice(0, 300)}`);

  // T5.11
  const b1 = await call("GET", "/branches", kR.rawKey);
  chk("T511-R1", "GET /branches: สนญ. 00000 · SEPARATE", b1.status === 200 && b1.body?.data?.home?.code === "00000" && b1.body.data.vatFilingMode === "SEPARATE", "200", `${b1.status} ${JSON.stringify(b1.body).slice(0, 300)}`);
  const b2 = await call("PUT", "/branches", kO.rawKey, { branches: [{ code: "00002", name: "ภูเก็ต" }], vatFilingMode: "COMBINED" });
  const b3 = await call("PUT", "/branches", kO.rawKey, { branches: [{ code: "00002", name: "ภูเก็ต" }], vatFilingMode: "COMBINED", acknowledge: ["BRANCH_COMBINED_FILING"] });
  chk("T511-W1", "PUT /branches ยื่นรวม: ไม่ยืนยัน 409 legal_ack_required · ยืนยัน 200 + สาขา 00002 · รหัสผิด 422", b2.status === 409 && b2.body?.error?.code === "legal_ack_required" && ok2(b3.status) && b3.body?.data?.branches?.[0]?.code === "00002" && b3.body.data.vatFilingMode === "COMBINED" && (await call("PUT", "/branches", kO.rawKey, { branches: [{ code: "2", name: "x" }] })).status === 422, "409→200", `${b2.status} ${b3.status} ${JSON.stringify(b3.body).slice(0, 300)}`);
  const draft = await acc.createDocument({ tenantId: tid, systemId: SYS, docType: "RECEIPT", contactId: cust.id, issueDate: new Date(), vatMode: "EXCLUDE", lines: [{ description: "ขาย", qty: 1, unitPrice: 10_000, vatRateBp: 700 }] });
  const b4 = await call("PUT", `/documents/${draft.id}/branch`, kO.rawKey, { branchCode: "00002" });
  await acc.issueDocument(tid, SYS, draft.id);
  const issued = await prisma.accountDocument.findUnique({ where: { id: draft.id }, select: { docNo: true, branchCode: true } });
  chk("T511-W2", "PUT /documents/{id}/branch (ร่าง) → ออกเลข '00002-…' · ใบที่ออกแล้วเปลี่ยนไม่ได้ 422", ok2(b4.status) && issued?.branchCode === "00002" && /^00002-/.test(issued?.docNo ?? "") && (await call("PUT", `/documents/${draft.id}/branch`, kO.rawKey, { branchCode: null })).status === 422, "00002-", `${b4.status} ${JSON.stringify(issued)}`);
  const month = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 7);
  const b5 = await call("GET", `/reports/branch-tax?month=${month}&branch=00002`, kR.rawKey);
  chk("T511-R2", "GET /reports/branch-tax: ภาษีขายสาขา 00002 1 แถว VAT 700 · หัว = สาขาที่ 00002 (ภูเก็ต)", b5.status === 200 && b5.body?.data?.sales?.rows?.length === 1 && b5.body.data.sales.total.vat === 700 && b5.body.data.sales.header.branchLabel === "สาขาที่ 00002 (ภูเก็ต)" && (await call("GET", `/reports/branch-tax?month=${month}&branch=2`, kR.rawKey)).status === 422, "200", `${b5.status} ${JSON.stringify(b5.body).slice(0, 300)}`);

  // เครื่องมือเลขา
  const names = ["account_equity_statement", "account_goods_report", "account_waste_log", "account_deemed_sales", "account_deferrals", "account_branches", "account_branch_tax_report", "account_set_waste_evidence", "account_create_deferral", "account_recognize_deferrals", "account_cancel_deferral", "account_set_deposit_kind", "account_set_discount_funder", "account_update_branches", "account_set_document_branch"];
  const toolNames = AO.accountToolNames();
  const homes = names.map((n) => (SK.SKILLS as Any[]).filter((s) => s.tools.includes(n)).map((s) => s.id));
  chk("T5B-AI1", "เครื่องมือเลขา 15 ตัวมีในทะเบียน op + อยู่ในสกิลเดียว (account)", names.every((n) => toolNames.includes(n)) && homes.every((h) => h.length === 1 && h[0] === "account"), "15 · account", JSON.stringify(homes));
  const run = await AO.runAccountTool(tid, "account_deferrals", {}, { systemId: SYS });
  const txt = JSON.stringify(run ?? {});
  chk("T5B-AI2", "ผลเครื่องมือเลขา (รายได้รับล่วงหน้า): ไม่ error · ไม่มี path ภายใน", run?.mode !== "error" && !/references\//.test(txt), "สะอาด", txt.slice(0, 400));
} catch (e) {
  chk("CRASH", "รันจบไม่ล้ม", false, "no crash", e instanceof Error ? `${e.message} ${e.stack}` : String(e));
} finally {
  if (tid) {
    const rows: { table_name: string }[] = await prisma.$queryRaw`SELECT c.table_name FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema WHERE c.table_schema = 'public' AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE'`;
    let pending = rows.map((r) => r.table_name).filter((t) => t !== "TenantDeletionLog");
    for (let pass = 0; pass < 12 && pending.length; pass++) {
      const still: string[] = [];
      for (const t of pending) { try { await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, tid); } catch { still.push(t); } }
      if (still.length === pending.length) break;
      pending = still;
    }
    await prisma.tenant.deleteMany({ where: { id: tid } });
  }
  await prisma.user.deleteMany({ where: { email: { startsWith: "qc-at5b-" } } }).catch(() => undefined);
}
const failed = cks.filter((c) => !c.ok);
console.log(`\n===== QC API T5b: ผ่าน ${cks.length - failed.length}/${cks.length} =====`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - failed.length, findings: failed.map((c) => c.id) })}`);
await prisma.$disconnect();
process.exit(failed.length ? 1 : 0);
