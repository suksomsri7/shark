// QC — API บัญชี ACC T1.7 + T1.9: ผลต่างหลังยื่น · รายได้ที่ไม่มี VAT (คำสั่งอ่าน 2 ตัว)
// test id ของ op: periods.filed-differences = "F17-R1" · reports.revenue-without-vat = "T1.9-R1" (ด่าน fitness F13.1)
// ข้อสอบเต็มของงาน: scripts/qc-acc-v2-filed.mts · scripts/qc-acc-v2-novat-mapping.mts — ชุดนี้ตรวจรูปคำตอบ REST + สิทธิ์
// 🔴 tenant ใหม่ของตัวเอง · ลบทิ้งใน finally
// รัน: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-account-api-filed-novat.mts
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-account-api-filed-novat");
const { prisma } = await import("@/lib/core/db");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const cks: { id: string; ok: boolean }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string) => {
  cks.push({ id, ok });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
let tid = "";
try {
  const acc = (await import("@/lib/modules/account/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const gl = (await import("@/lib/modules/account/gl" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const PC = (await import("@/lib/modules/account/period-close" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const sys = await import("@/lib/modules/system/service");
  const ak = (await import("@/lib/api-keys/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const scopes = (await import("@/lib/api-keys/scopes" as string)) as Record<string, Any>;
  const route = (await import("@/app/api/v1/account/[...path]/route" as string)) as Record<string, (req: Request, ctx: { params: Promise<{ path: string[] }> }) => Promise<Response>>;
  tid = (await prisma.tenant.create({ data: { name: "QC API T17/T19", slug: `qc-api-t1719-${Date.now()}` } })).id;
  const owner = await prisma.user.create({ data: { email: `qc-at1719-${Date.now()}@qc.local`, name: "เจ้าของ API T17" } });
  await prisma.membership.create({ data: { userId: owner.id, tenantId: tid, role: "OWNER", unitAccess: ["*"], acceptedAt: new Date() } });
  const SYS = (await sys.createSystem(tid, "ACCOUNT", "บัญชี API T17")).id;
  await acc.saveSettings(tid, SYS, { orgName: "ร้าน API T17", vatRegistered: true, vatRateBp: 700, taxId: "0105561000077" });
  await gl.ensureAccounting({ tenantId: tid, systemId: SYS });
  const kR = await ak.createApiKey({ tenantId: tid }, "T17 read", { scopes: scopes.expandBundles(["read-only"]), systemId: SYS });
  const call = async (path: string, key: string) => {
    const req = new Request(`http://x/api/v1/account${path}`, { method: "GET", headers: { authorization: `Bearer ${key}` } });
    const res = await route.GET!(req, { params: Promise.resolve({ path: path.split("?")[0]!.split("/").filter(Boolean) }) });
    const text = await res.text();
    let b: Any = null; try { b = JSON.parse(text); } catch { b = { _raw: text }; }
    return { status: res.status, body: b };
  };
  const cust = await acc.createContact({ tenantId: tid, systemId: SYS, kind: "CUSTOMER", legalType: "COMPANY", name: "ลูกค้า API T17", taxId: "0105561999977", branchCode: "00000" });
  const mk = async (date: string, vatMode: string, bp: number, amt: number) => {
    const d = await acc.createDocument({ tenantId: tid, systemId: SYS, docType: "RECEIPT", contactId: cust.id, issueDate: new Date(`${date}T10:00:00+07:00`), vatMode, lines: [{ description: "ขาย", qty: 1, unitPrice: amt, vatRateBp: bp }], createdById: owner.id });
    const r = await acc.issueDocument(tid, SYS, d.id);
    if (!r.ok) throw new Error(r.reason);
  };
  await mk("2026-03-05", "EXCLUDE", 700, 100_000);
  const m = await PC.markVatFiled({ tenantId: tid, systemId: SYS }, { periodKey: "2026-03", userId: owner.id });
  if (!m.ok) throw new Error(m.reason);
  await new Promise((r) => setTimeout(r, 20));
  await mk("2026-03-20", "EXCLUDE", 700, 50_000); // งานเบื้องหลัง: ลงเดือนที่ยื่นแล้ว ไม่บล็อก → ผลต่าง +3,500
  await mk("2026-03-21", "NONE", 0, 20_000); // ขายไม่คิด VAT (งานเบื้องหลัง) → รายได้ไม่มี VAT 20,000

  const fd = await call("/periods/2026-03/filed-differences", kR.rawKey);
  const v = fd.body?.data?.vat;
  chk("F17-R1", "GET /periods/{key}/filed-differences (คีย์อ่านอย่างเดียว): vat.filed · 1 แถว ภาษีขาย +3,500 (ไม่มีการยืนยัน = งานเบื้องหลัง) · totals · history MARK · pnd ว่าง", fd.status === 200 && v?.filed === true && v.rows.length === 1 && v.rows[0].outputSatang === 3_500 && v.rows[0].acknowledged === false && v.totals.outputSatang === 3_500 && v.history.length === 1 && v.history[0].action === "MARK" && fd.body.data.pnd.rows.length === 0, "200", `${fd.status} ${JSON.stringify(fd.body?.data ?? fd.body).slice(0, 300)}`);
  const bad = await call("/periods/2026-13/filed-differences", kR.rawKey);
  chk("F17-R1b", "งวดผิดรูป → 422", bad.status === 422, "422", `${bad.status}`);
  const nv = await call("/reports/revenue-without-vat?from=2026-03&to=2026-03", kR.rawKey);
  chk("T1.9-R1", "GET /reports/revenue-without-vat: ไม่คิด VAT 20,000 · 1 แถว UNTAXED · vatRegistered", nv.status === 200 && nv.body?.data?.totals?.untaxedSatang === 20_000 && nv.body.data.rows.length === 1 && nv.body.data.rows[0].category === "UNTAXED" && nv.body.data.vatRegistered === true, "200", `${nv.status} ${JSON.stringify(nv.body?.data ?? nv.body).slice(0, 300)}`);
  const nv2 = await call("/reports/revenue-without-vat?from=2026-05&to=2026-03", kR.rawKey);
  chk("T1.9-R1b", "from หลัง to → 422", nv2.status === 422, "422", `${nv2.status}`);
} catch (e) {
  chk("CRASH", "รันจบไม่ล้ม", false, "no crash", e instanceof Error ? `${e.message} ${e.stack}` : String(e));
} finally {
  if (tid) {
    const rows: { table_name: string }[] = await prisma.$queryRaw`SELECT c.table_name FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema WHERE c.table_schema = 'public' AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE'`;
    let pending = rows.map((r) => r.table_name);
    for (let pass = 0; pass < 12 && pending.length; pass++) {
      const still: string[] = [];
      for (const t of pending) { try { await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, tid); } catch { still.push(t); } }
      if (still.length === pending.length) break;
      pending = still;
    }
    await prisma.tenant.deleteMany({ where: { id: tid } });
  }
}
const failed = cks.filter((c) => !c.ok);
console.log(`\n===== QC API T1.7/T1.9: ผ่าน ${cks.length - failed.length}/${cks.length} =====`);
await prisma.$disconnect();
process.exit(failed.length ? 1 : 0);
