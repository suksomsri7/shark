// ภาพหน้าจอ H0.1 (CONTROLLER-RUN) — แถวรอบจ่าย DRAFT ที่มีปุ่ม "ดึงข้อมูลใหม่" / "ลบร่าง" ที่ 1440×900 และ 390×844
// วิธี: สร้างร้านทดสอบชั่วคราวบน QC4 (HR + บัญชี · พนักงาน 3 คนตามชุดข้อมูลภาพ 06 · รายการเพิ่ม/หักที่อนุมัติแล้ว · รอบ DRAFT)
//       mint session เจ้าของร้านตรงใน DB (แบบ shot-account-current) → puppeteer เปิดหน้า payroll → ถ่าย → ลบทุกอย่างใน finally
// รัน:  bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/hr-shot-h0.1.mts --base http://127.0.0.1:3226 [--keep]
// 🔴 ต้องมีเซิร์ฟเวอร์ของ branch นี้วิ่งอยู่ที่ --base (next start) · ห้าม :3215 (CRM) / :3225 (POS)
type Any = any;
const ARGV = process.argv.slice(2);
const flag = (k: string) => { const i = ARGV.indexOf(k); return i >= 0 ? ARGV[i + 1] : undefined; };
const BASE = (flag("--base") ?? process.env.QC_BASE ?? "").replace(/\/$/, "");
const KEEP = ARGV.includes("--keep");
const OUT = flag("--out") ?? "/root/qc/hr-h0.1";
if (!BASE || /:3215\b|:3225\b/.test(BASE)) { console.log("ต้องส่ง --base http://127.0.0.1:<port> (ห้าม 3215/3225)"); process.exit(2); }

const { prisma } = (await import("@/lib/core/db" as string)) as Any;
const P = prisma as Any;
const sys = (await import("@/lib/modules/system/service" as string)) as Any;
const hrSvc = (await import("@/lib/modules/hr/service" as string)) as Any;
const PAY = (await import("@/lib/modules/hr/payroll" as string)) as Any;
const { sha256, randomToken } = (await import("@/lib/core/hash" as string)) as Any;
const { mkdirSync } = await import("node:fs");
mkdirSync(OUT, { recursive: true });

const rand = Math.random().toString(36).slice(2, 8).replace(/[^a-z0-9]/g, "q");
const SLUG = `qc-hr-shot-${rand}`;
const B = (baht: number) => Math.round(baht * 100);
type Ctx = { tenantId: string; systemId: string };
let tenantId = "";
let userId = "";
try {
  const t = await P.tenant.create({ data: { name: "คาเฟ่ตัวอย่าง (QC ภาพ H0.1)", slug: SLUG } });
  tenantId = t.id;
  const H = (await sys.createSystem(tenantId, "HR", "บุคคล")).id as string;
  await sys.createSystem(tenantId, "ACCOUNT", "บัญชี");
  const ctx: Ctx = { tenantId, systemId: H };
  const u = await P.user.create({ data: { email: `${SLUG}-owner@qc.invalid`, name: "เจ้าของร้าน (QC)" } });
  userId = u.id;
  await P.membership.create({ data: { userId, tenantId, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
  const emp = async (name: string, baht: number) => {
    const e = await hrSvc.createEmployee(ctx, { name });
    await PAY.setSalaryProfile(ctx, { employeeId: e.id, baseSalarySatang: B(baht), ssoEligible: true });
    return e.id as string;
  };
  const e1 = await emp("น้ำฝน ใจดี", 18_000);
  const e2 = await emp("แพร สุขใจ", 15_500);
  const e3 = await emp("โบว์ รักงาน", 22_000);
  const adj = async (employeeId: string, kind: string, satang: number) => {
    const r = await PAY.requestAdjustment(ctx, { employeeId, periodKey: "2026-09", kind, amountSatang: satang, requestedById: userId });
    if (!r?.ok) throw new Error(`requestAdjustment: ${JSON.stringify(r)}`);
    const d = await PAY.decideAdjustment(ctx, r.id, "APPROVED", { userId, isOwner: true });
    if (!d?.ok) throw new Error(`decideAdjustment: ${JSON.stringify(d)}`);
  };
  await adj(e1, "OT", B(1_200));
  await adj(e2, "BONUS", B(2_000));
  await adj(e3, "DEDUCTION", B(500));
  const run = await PAY.createPayrollRun(ctx, { periodKey: "2026-09", payDate: new Date("2026-09-25T00:00:00Z") });
  console.log(`fixture: tenant ${tenantId} · hr ${H} · draft run ${run.id} · net ${run.totalNetSatang}`);

  const token = randomToken(32) as string;
  const ttl = new Date(Date.now() + 30 * 60 * 1000);
  await P.session.create({ data: { userId, tokenHash: sha256(token), userAgent: "qc-shot-hr-h0.1", idleExpiresAt: ttl, expiresAt: ttl } });
  const https = BASE.startsWith("https://");
  const host = new URL(BASE).hostname;
  const cookies: Any[] = https
    ? [{ name: "__Host-shark_session", value: token, url: BASE, path: "/", secure: true }, { name: "shark_tenant", value: tenantId, url: BASE, path: "/", secure: true }]
    : [{ name: "shark_session", value: token, domain: host, path: "/" }, { name: "shark_tenant", value: tenantId, domain: host, path: "/" }];

  const pptr = await import("/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js" as string);
  const browser = await pptr.default.launch({ executablePath: "/usr/bin/chromium-browser", args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", `--user-data-dir=/tmp/chr-shot-hr-${rand}`] });
  try {
    for (const [tag, w, h] of [["1440", 1440, 900], ["390", 390, 844]] as const) {
      const page = await browser.newPage();
      await page.setViewport({ width: w, height: h, deviceScaleFactor: 1.5 });
      await page.setCookie(...cookies);
      const url = `${BASE}/app/sys/${H}/hr/payroll`;
      await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
      await new Promise((r) => setTimeout(r, 800));
      await page.screenshot({ path: `${OUT}/${tag}-payroll-draft.png`, fullPage: true });
      console.log(`ok ${tag}-payroll-draft (${page.url()})`);
      // เปิดกล่องยืนยัน "ลบร่าง" ถ้ามี data-testid
      for (const [name, sel] of [["delete-dialog", '[data-testid="hr-payroll-run-2026-09-delete-trigger"]'], ["recompute-dialog", '[data-testid="hr-payroll-run-2026-09-recompute-trigger"]']] as const) {
        try {
          const el = await page.$(sel);
          if (!el) { console.log(`skip ${tag}-${name}: no ${sel}`); continue; }
          await el.click();
          await new Promise((r) => setTimeout(r, 500));
          await page.screenshot({ path: `${OUT}/${tag}-${name}.png`, fullPage: false });
          console.log(`ok ${tag}-${name}`);
          // ConfirmDialog ไม่ฟัง Escape — ปิดด้วยการโหลดหน้าใหม่ ไม่งั้นคลิกถัดไปโดน backdrop
          await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
          await new Promise((r) => setTimeout(r, 500));
        } catch (e) { console.log(`FAIL ${tag}-${name}: ${String(e).slice(0, 120)}`); }
      }
      await page.close();
    }
  } finally { await browser.close(); }
} finally {
  if (KEEP) { console.log(`KEEP: tenant ${tenantId} user ${userId} (ลบเองด้วย --cleanup ภายหลัง)`); }
  else {
    await P.session.deleteMany({ where: { userAgent: "qc-shot-hr-h0.1" } });
    if (tenantId) {
      await P.hrPayAdjustment.deleteMany({ where: { tenantId } }).catch(() => null);
      await P.hrPayrollRun.deleteMany({ where: { tenantId } }).catch(() => null);
      await P.auditLog?.deleteMany?.({ where: { tenantId } }).catch(() => null);
      await P.tenant.delete({ where: { id: tenantId } }).catch(async (e: Any) => { console.log(`tenant delete failed: ${String(e).slice(0, 160)}`); });
    }
    if (userId) await P.user.delete({ where: { id: userId } }).catch(() => null);
    const left = await P.tenant.count({ where: { slug: SLUG } });
    console.log(`cleanup: tenants left ${left}`);
  }
  await prisma.$disconnect?.();
}
