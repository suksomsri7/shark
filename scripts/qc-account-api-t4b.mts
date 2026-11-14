// QC — API บัญชี ACC T4.4 T4.5 T4.7 T4.8 (เลน 1): รายงานการแก้ไข · หน้าที่เก็บเอกสาร · ค่ากฎหมายอื่น/ทิป · POS ↔ บัญชี · สาเหตุเบิก · เงินประกันหอ · แต้มคงค้าง
// test id ของ op (ด่าน fitness F13.1): T44-R1 · T45-R1 · T45-R2 · T45-R3 · T47-R1 · T47-R2 · T47-R3 · T47-R4 · T48-R1 · T48-R2 · T48-R3 · สร้างใบเบิก (C3-M4.1 ส่วนเพิ่ม T48-W1)
// ข้อสอบเต็มของงาน: qc-acc-v2-audit-trail · qc-acc-v2-shop-delete · qc-acc-v2-pos-link · qc-acc-v2-stock-deposits — ชุดนี้ตรวจรูปคำตอบ REST + สิทธิ์ + เครื่องมือเลขา
// 🔴 tenant ใหม่ของตัวเอง · ลบทิ้งใน finally
// รัน: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-account-api-t4b.mts
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-account-api-t4b");
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
  tid = (await prisma.tenant.create({ data: { name: "QC API T4b", slug: `qc-api-t4b-${stamp}` } })).id;
  const owner = await prisma.user.create({ data: { email: `qc-at4b-${stamp}@qc.local`, name: "เจ้าของ API T4b" } });
  await prisma.membership.create({ data: { userId: owner.id, tenantId: tid, role: "OWNER", unitAccess: ["*"], acceptedAt: new Date() } });
  const SYS = (await sys.createSystem(tid, "ACCOUNT", "บัญชี API T4b")).id;
  await acc.saveSettings(tid, SYS, { orgName: "ร้าน API T4b", vatRegistered: true, vatRateBp: 700, taxId: "0105561000077" });
  await gl.ensureAccounting({ tenantId: tid, systemId: SYS });
  const kR = await ak.createApiKey({ tenantId: tid }, "T4b read", { scopes: scopes.expandBundles(["read-only"]), systemId: SYS });
  const kO = await ak.createApiKey({ tenantId: tid }, "T4b owner", { scopes: [...scopes.expandBundles(["accountant"]), "account.settings.manage", "account.journal.adjust", "account.product.manage"], systemId: SYS });
  const call = async (method: string, path: string, key: string, body?: unknown) => {
    const headers: Record<string, string> = { authorization: `Bearer ${key}`, ...(method === "GET" ? {} : { "idempotency-key": `t4b-${Date.now()}-${Math.random().toString(16).slice(2)}` }) };
    let b: string | undefined;
    if (body !== undefined) { b = JSON.stringify(body); headers["content-type"] = "application/json"; }
    const req = new Request(`http://x/api/v1/account${path}`, { method, headers, body: b });
    const res = await route[method]!(req, { params: Promise.resolve({ path: path.split("?")[0]!.split("/").filter(Boolean) }) });
    const text = await res.text();
    let p: Any = null; try { p = JSON.parse(text); } catch { p = { _raw: text }; }
    return { status: res.status, body: p };
  };
  const cust = await acc.createContact({ tenantId: tid, systemId: SYS, kind: "CUSTOMER", legalType: "COMPANY", name: "ลูกค้า API T4b", taxId: "0105561999977", branchCode: "00000" });
  const d = await acc.createDocument({ tenantId: tid, systemId: SYS, docType: "RECEIPT", contactId: cust.id, issueDate: new Date(), vatMode: "EXCLUDE", lines: [{ description: "ขาย", qty: 1, unitPrice: 100_000, vatRateBp: 700 }], createdById: owner.id });
  await acc.issueDocument(tid, SYS, d.id);
  await acc.voidDocument(tid, SYS, d.id, "ทดสอบยกเลิก");
  await prisma.auditLog.create({ data: { tenantId: tid, actorType: "USER", actorId: owner.id, action: "account.doc.void", targetType: "AccountDocument", targetId: d.id, after: { ok: true, reason: "ทดสอบยกเลิก" } } });

  const a1 = await call("GET", "/audit/changes?kind=cancel", kR.rawKey);
  const rows = a1.body?.data ?? [];
  chk("T44-R1", "GET /audit/changes?kind=cancel: ยกเลิกเอกสาร (เหตุผล) + กลับรายการ 1 · total · nextCursor", a1.status === 200 && rows.some((r: Any) => r.action === "account.doc.void" && r.reason === "ทดสอบยกเลิก" && r.amountSatang === 107_000) && rows.some((r: Any) => r.action === "journal.reversal") && a1.body?.total === 2, "200", `${a1.status} ${JSON.stringify(a1.body).slice(0, 400)}`);
  const a2 = await call("GET", "/audit/changes?kind=nope", kR.rawKey);
  chk("T44-R1b", "kind ผิด → 422", a2.status === 422, "422", `${a2.status}`);

  const b1 = await call("GET", "/books/retention", kR.rawKey);
  chk("T45-R1", "GET /books/retention: สมุดนี้ · ระยะเก็บ 5 · เก็บถึง · คำเตือน 2 (ข้อความไม่มี path ภายใน) · exportPath", b1.status === 200 && b1.body?.data?.book?.retentionYears === 5 && /^\d{4}-12-31$/.test(b1.body.data.book.keepUntil ?? "") && b1.body.data.warnings.length === 2 && !FORBID.test(b1.body.data.warnings.map((w: Any) => w.messageTh).join(" ")) && /export\/books$/.test(b1.body.data.exportPath), "200", `${b1.status} ${JSON.stringify(b1.body).slice(0, 400)}`);
  const c1 = await call("GET", "/settings/compliance", kR.rawKey);
  chk("T45-R2", "GET /settings/compliance: 4 ค่า (5 · 7 · 6 · 3) · ทิป LIABILITY + คำเตือน", c1.status === 200 && c1.body?.data?.effective?.map((r: Any) => r.value).join() === "5,7,6,3" && c1.body.data.tipTreatment === "LIABILITY" && c1.body.data.tipWarning?.code === "POS_TIP_LIABILITY_REVIEW", "200", `${c1.status} ${JSON.stringify(c1.body).slice(0, 400)}`);
  const c2 = await call("PATCH", "/settings/compliance", kO.rawKey, { rows: [{ key: "DORM_DEPOSIT_MAX_RENT_MULTIPLE", value: 5, from: null, to: null, source: "นักบัญชี" }], tipTreatment: "REVENUE_VAT", reason: "ทดสอบ" });
  chk("T45-R3", "PATCH /settings/compliance: ร้านตั้ง 5 เท่า + ทิปรายได้ → บันทึก · คำเตือน SHOP_DIFFERS + POS_TIP_REVENUE_VAT", c2.status === 200 && c2.body?.data?.compliance?.effective?.find((r: Any) => r.key === "DORM_DEPOSIT_MAX_RENT_MULTIPLE")?.value === 5 && c2.body.data.tipTreatment === "REVENUE_VAT" && c2.body.data.warnings.some((w: Any) => w.code === "SHOP_DIFFERS_FROM_DEFAULT") && c2.body.data.warnings.some((w: Any) => w.code === "POS_TIP_REVENUE_VAT"), "200", `${c2.status} ${JSON.stringify(c2.body).slice(0, 400)}`);
  const c3 = await call("PATCH", "/settings/compliance", kR.rawKey, { tipTreatment: "LIABILITY" });
  chk("T45-R3b", "คีย์อ่านอย่างเดียว PATCH → 403", c3.status === 403, "403", `${c3.status}`);
  const c4 = await call("PATCH", "/settings/compliance", kO.rawKey, { tipTreatment: "SOMETHING" });
  chk("T45-R3c", "ค่าทิปไม่รู้จัก → 422", c4.status === 422, "422", `${c4.status}`);

  const p1 = await call("GET", "/pos/unposted-bills", kR.rawKey);
  chk("T47-R1", "GET /pos/unposted-bills (ยังไม่เชื่อมจุดขาย): 0 บิล", p1.status === 200 && p1.body?.data?.count === 0 && Array.isArray(p1.body.data.bills), "200", `${p1.status} ${JSON.stringify(p1.body).slice(0, 300)}`);
  const p2 = await call("GET", "/pos/daily-reconciliation?from=2026-11-01&to=2026-11-30", kR.rawKey);
  chk("T47-R2", "GET /pos/daily-reconciliation: days[] · totals · warnings (ทิปรายได้)", p2.status === 200 && Array.isArray(p2.body?.data?.days) && p2.body.data.totals.bills === 0 && p2.body.data.warnings.some((w: Any) => w.code === "POS_TIP_REVENUE_VAT"), "200", `${p2.status} ${JSON.stringify(p2.body).slice(0, 300)}`);
  const p3 = await call("GET", "/pos/shift-variances", kR.rawKey);
  chk("T47-R3", "GET /pos/shift-variances: []", p3.status === 200 && Array.isArray(p3.body?.data) && p3.body.data.length === 0, "200", `${p3.status}`);
  const p4 = await call("POST", "/pos/shift-variances/post", kO.rawKey, {});
  chk("T47-R4", "POST /pos/shift-variances/post: ไม่มีกะค้าง → posted 0", (p4.status === 200 || p4.status === 201) && p4.body?.data?.posted?.length === 0, "200", `${p4.status} ${JSON.stringify(p4.body).slice(0, 300)}`);
  const p5 = await call("POST", "/pos/shift-variances/post", kR.rawKey, {});
  chk("T47-R4b", "คีย์อ่านอย่างเดียว POST → 403", p5.status === 403, "403", `${p5.status}`);

  const s1 = await call("GET", "/stock/issue-reasons", kR.rawKey);
  chk("T48-R1", "GET /stock/issue-reasons: 10 สาเหตุ · ใช้ส่วนตัว deemedSale + คำเตือนต้องยืนยัน", s1.status === 200 && s1.body?.data?.length === 10 && s1.body.data.find((r: Any) => r.code === "PERSONAL_USE")?.deemedSale === true && s1.body.data.find((r: Any) => r.code === "PERSONAL_USE")?.warnings[0]?.ack === true, "200", `${s1.status} ${JSON.stringify(s1.body).slice(0, 300)}`);
  const s2 = await call("GET", "/dorm/deposit-check", kR.rawKey);
  chk("T48-R2", "GET /dorm/deposit-check: ไม่มีหอ → rows [] · เพดานของร้าน 5 เท่า (ตั้งข้างบน)", s2.status === 200 && s2.body?.data?.rows?.length === 0 && s2.body.data.maxMultiple === 5 && s2.body.data.maxYears === 3, "200", `${s2.status} ${JSON.stringify(s2.body).slice(0, 300)}`);
  const s3 = await call("GET", "/points/outstanding?asOf=2026-10-31", kR.rawKey);
  chk("T48-R3", "GET /points/outstanding: asOf · totals 0", s3.status === 200 && s3.body?.data?.asOf === "2026-10-31" && s3.body.data.totalPoints === 0, "200", `${s3.status} ${JSON.stringify(s3.body).slice(0, 300)}`);
  const prod = await prisma.accountProduct.create({ data: { tenantId: tid, systemId: SYS, name: "สินค้า API T4b", type: "GOODS", buyPrice: 1_000, qtyOnHand: 10 } });
  const w1 = await call("POST", "/stock-documents", kO.rawKey, { type: "GOODS_ISSUE", reason: "PERSONAL_USE", lines: [{ productId: prod.id, qty: 1 }], allowNegative: true });
  const w2 = await call("POST", "/stock-documents", kO.rawKey, { type: "GOODS_ISSUE", reason: "PERSONAL_USE", lines: [{ productId: prod.id, qty: 1 }], allowNegative: true, acknowledge: ["STOCK_ISSUE_PERSONAL_USE"] });
  chk("T48-W1", "POST /stock-documents สาเหตุ PERSONAL_USE: ไม่ยืนยัน 409 legal_ack_required · ยืนยัน 201 + warnings", w1.status === 409 && w1.body?.error?.code === "legal_ack_required" && (w2.status === 200 || w2.status === 201) && w2.body?.data?.warnings?.some((w: Any) => w.code === "STOCK_ISSUE_PERSONAL_USE"), "409→201", `${w1.status} ${w2.status} ${JSON.stringify(w2.body).slice(0, 300)}`);

  // เครื่องมือเลขา: ลงทะเบียนสกิลเดียว · ผลไม่มี path ภายใน
  const names = ["account_audit_changes", "account_books_retention", "account_compliance_values", "account_update_compliance_values", "account_pos_unposted", "account_pos_daily_recon", "account_pos_shift_variances", "account_post_shift_variances", "account_stock_issue_reasons", "account_dorm_deposit_check", "account_points_outstanding"];
  const toolNames = AO.accountToolNames();
  const homes = names.map((n) => (SK.SKILLS as Any[]).filter((s) => s.tools.includes(n)).map((s) => s.id));
  chk("T4B-AI1", "เครื่องมือเลขา 11 ตัวมีในทะเบียน op + อยู่ในสกิลเดียว (account)", names.every((n) => toolNames.includes(n)) && homes.every((h) => h.length === 1 && h[0] === "account"), "11 · account", JSON.stringify(homes));
  const run = await AO.runAccountTool(tid, "account_compliance_values", {}, { systemId: SYS });
  const txt = JSON.stringify(run ?? {});
  chk("T4B-AI2", "ผลเครื่องมือเลขา (ค่ากฎหมายอื่น · คำเตือนทิป): อ้างอิงกฎหมายภาษาไทย ไม่มี citation ดิบ/path ภายใน", run?.mode !== "error" && /อ้างอิงกฎหมาย/.test(txt) && !/"citation"/.test(txt) && !/references\//.test(txt), "สะอาด", txt.slice(0, 400));
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
  await prisma.user.deleteMany({ where: { email: { startsWith: "qc-at4b-" } } }).catch(() => undefined);
}
const failed = cks.filter((c) => !c.ok);
console.log(`\n===== QC API T4b: ผ่าน ${cks.length - failed.length}/${cks.length} =====`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - failed.length, findings: failed.map((c) => c.id) })}`);
await prisma.$disconnect();
process.exit(failed.length ? 1 : 0);
