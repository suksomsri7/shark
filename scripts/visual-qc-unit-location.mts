// visual-qc-unit-location — QC สายตาหน้า "ตั้งค่าสาขา" (WO-CV14 · D14) บน prod หลัง deploy
//
// ทำไมต้องมี: dev ไม่ hydrate (memory reference_shark_prod_visual_qc) ⇒ หน้าใหม่ต้องดูจอจริงบน prod
// ทำอะไร: สร้าง session ของ OWNER (ลบทิ้งท้ายรอบ) → เปิด /app/settings/systems ดูปุ่ม "ตั้งค่าสาขา"
//   → เปิดหน้าสาขา → กรอกที่อยู่+ลิงก์แผนที่ → บันทึก → ต้องเห็นข้อความสำเร็จ + ค่าใน DB ตรง
//   → คืนค่าเดิมของ settings ให้สาขานั้น (ไม่ทิ้งข้อมูลทดสอบไว้บน prod)
// ใช้: QC_BASE=https://shark.in.th pnpm exec tsx scripts/visual-qc-unit-location.mts
// 🔴 `.env` ชี้ prod จริง — session/ค่าที่แก้ต้องถูกคืนเสมอ (finally)
process.loadEnvFile?.(".env");
const BASE = (process.env.QC_BASE ?? "https://shark.in.th").replace(/\/+$/, "");
const SHOT = "/tmp/claude-0/qc-unit-location";
const { mkdirSync } = await import("node:fs");
mkdirSync(SHOT, { recursive: true });
const { prisma } = (await import("@/lib/core/db" as string)) as { prisma: import("@prisma/client").PrismaClient };
const { sha256 } = (await import("@/lib/core/hash" as string)) as { sha256: (s: string) => string };

const results: { id: string; ok: boolean; note: string }[] = [];
const chk = (id: string, ok: boolean, note: string) => { results.push({ id, ok, note }); console.log(`${ok ? "✅" : "❌"} ${id} ${note}`); };

// เลือกร้านที่มีระบบแชท + สาขา ≥1 + OWNER
const unit = await prisma.businessUnit.findFirst({
  where: { status: "ACTIVE", tenant: { memberships: { some: { role: "OWNER", acceptedAt: { not: null } } } } },
  orderBy: { createdAt: "asc" },
  select: { id: true, tenantId: true, name: true, settings: true },
});
if (!unit) { console.log("RESULT NO_UNIT"); process.exit(2); }
const owner = await prisma.membership.findFirst({ where: { tenantId: unit.tenantId, role: "OWNER", acceptedAt: { not: null } }, include: { user: true } });
if (!owner) { console.log("RESULT NO_OWNER"); process.exit(2); }
const originalSettings = unit.settings;
const token = "qcul" + Math.random().toString(36).slice(2) + Date.now().toString(36);
const ttl = new Date(Date.now() + 20 * 60 * 1000);
await prisma.session.create({ data: { userId: owner.userId, tokenHash: sha256(token), userAgent: "qc-unit-location", idleExpiresAt: ttl, expiresAt: ttl } });
console.log(`TARGET สาขา "${unit.name}" (${unit.id}) · ผู้ใช้ ${owner.user.email} · ${BASE}`);

const ADDR = "[qc] 123 ถนนทดสอบ แขวงทดสอบ กรุงเทพฯ 10110";
const MAP = "https://maps.app.goo.gl/qc-visual-test";
try {
  const pptr = await import("/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js" as string);
  const browser = await pptr.default.launch({ executablePath: "/usr/bin/chromium-browser", args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--user-data-dir=/tmp/chr-qcunitloc"] });
  try {
    for (const [label, w, h] of [["mobile", 390, 844], ["desktop", 1440, 900]] as const) {
      const page = await browser.newPage();
      await page.evaluateOnNewDocument("window.__name = window.__name || ((f) => f);");
      await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
      await page.setCookie(
        { name: "__Host-shark_session", value: token, url: BASE, path: "/", secure: true },
        { name: "shark_tenant", value: unit.tenantId, url: BASE, path: "/", secure: true },
      );
      // 1) ปุ่มในหน้าจัดการระบบ
      await page.goto(`${BASE}/app/settings/systems`, { waitUntil: "networkidle2", timeout: 60_000 });
      await page.screenshot({ path: `${SHOT}/${label}-systems.png`, fullPage: true });
      const hasBtn = await page.evaluate((id: string) => !!document.querySelector(`a[href="/app/settings/units/${id}"]`), unit.id);
      chk(`VU-1-${label}`, hasBtn, "หน้าจัดการระบบมีลิงก์ 'ตั้งค่าสาขา' ของสาขานี้");
      // 2) หน้าตั้งค่าสาขา
      await page.goto(`${BASE}/app/settings/units/${unit.id}`, { waitUntil: "networkidle2", timeout: 60_000 });
      await page.screenshot({ path: `${SHOT}/${label}-form-empty.png`, fullPage: true });
      const probe = await page.evaluate(() => ({
        text: document.body.innerText,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        fields: ["address", "mapUrl", "lat", "lng"].map((n) => !!document.querySelector(`[name="${n}"]`)),
        hydrated: !!(window as unknown as { __next_f?: unknown }).__next_f,
      }));
      chk(`VU-2-${label}`, probe.text.includes(unit.name) && probe.fields.every(Boolean), `หัวข้อมีชื่อสาขา + ช่องครบ 4 (${probe.fields.join(",")})`);
      chk(`VU-3-${label}`, probe.overflow <= 0, `ไม่ล้นแนวนอน (overflow ${probe.overflow}px)`);
      if (label === "mobile") {
        // 3) กรอก + บันทึก (ทำครั้งเดียวบนมือถือ)
        await page.click('[name="address"]'); await page.evaluate(() => { (document.querySelector('[name="address"]') as HTMLTextAreaElement).value = ""; });
        await page.type('[name="address"]', ADDR);
        await page.evaluate(() => { (document.querySelector('[name="mapUrl"]') as HTMLInputElement).value = ""; });
        await page.type('[name="mapUrl"]', MAP);
        await page.click('button[type="submit"]');
        await new Promise((r) => setTimeout(r, 4000));
        await page.screenshot({ path: `${SHOT}/${label}-form-saved.png`, fullPage: true });
        const after = await page.evaluate(() => document.body.innerText);
        chk("VU-4", after.includes("บันทึกที่อยู่สาขาเรียบร้อย"), "หลังกดบันทึกเห็นข้อความสำเร็จ inline");
        const row = await prisma.businessUnit.findUnique({ where: { id: unit.id }, select: { settings: true } });
        const s = (row?.settings ?? {}) as Record<string, unknown>;
        chk("VU-5", s.address === ADDR && s.mapUrl === MAP, `DB บันทึกจริง (address/mapUrl ตรง) · คีย์อื่นคงอยู่: ${Object.keys(s).join(",")}`);
        // 4) ค่าผิด → error inline ไม่ใช่ alert
        await page.evaluate(() => { (document.querySelector('[name="mapUrl"]') as HTMLInputElement).value = ""; });
        await page.type('[name="mapUrl"]', "http://example.com/map");
        await page.click('button[type="submit"]');
        await new Promise((r) => setTimeout(r, 3000));
        await page.screenshot({ path: `${SHOT}/${label}-form-error.png`, fullPage: true });
        const err = await page.evaluate(() => document.body.innerText);
        chk("VU-6", /https:\/\//.test(err), "ลิงก์ http → ข้อความบอกว่าต้อง https (inline)");
      }
      await page.close();
    }
  } finally { await browser.close(); }
} finally {
  await prisma.businessUnit.update({ where: { id: unit.id }, data: { settings: (originalSettings ?? {}) as import("@prisma/client").Prisma.InputJsonValue } });
  await prisma.session.deleteMany({ where: { userAgent: "qc-unit-location" } });
  const fails = results.filter((r) => !r.ok);
  console.log(`\nRESULT ${results.length - fails.length}/${results.length} · screenshots ${SHOT}`);
  await prisma.$disconnect();
  process.exit(fails.length ? 1 : 0);
}
