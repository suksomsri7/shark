// ถ่ายจอหน้าโมดูลบัญชี "ของจริงบน prod" (ก่อน redesign) — ใช้เป็นแผ่นเทียบ ของจริง | แบบใหม่
// วิธีเข้า: mint session ของเจ้าของร้านตรงใน DB (แบบเดียวกับ visual-qc-chat-v2) แล้วลบทิ้งตอนจบ (userAgent "qc-shot-account")
process.loadEnvFile?.(".env");
const BASE = process.env.QC_BASE ?? "https://shark.in.th";
const OUT = "/root/projects/shark-accounting/docs/design/account-v2/current";
const { prisma } = await import("@/lib/core/db" as string);
const { sha256 } = await import("@/lib/core/hash" as string);
const { mkdirSync } = await import("node:fs");
mkdirSync(OUT, { recursive: true });

const systems = await prisma.appSystem.findMany({ where: { type: "ACCOUNT", active: true } });
let best: { id: string; tenantId: string; name: string; docs: number } | null = null;
for (const s of systems) {
  const docs = await prisma.accountDocument.count({ where: { systemId: s.id } });
  if (!best || docs > best.docs) best = { id: s.id, tenantId: s.tenantId, name: s.name, docs };
}
if (!best) { console.log("NO_ACCOUNT_SYSTEM"); process.exit(2); }
const owner = await prisma.membership.findFirst({
  where: { tenantId: best.tenantId, role: "OWNER", acceptedAt: { not: null } }, include: { user: true },
});
if (!owner) { console.log("NO_OWNER"); process.exit(2); }
const latest = await prisma.accountDocument.findFirst({ where: { systemId: best.id, docNo: { not: null } }, orderBy: { updatedAt: "desc" } });
const token = "shot" + Math.random().toString(36).slice(2) + Date.now().toString(36);
const ttl = new Date(Date.now() + 20 * 60 * 1000);
await prisma.session.create({ data: { userId: owner.userId, tokenHash: sha256(token), userAgent: "qc-shot-account", idleExpiresAt: ttl, expiresAt: ttl } });
console.log(`TARGET "${best.name}" · ${best.docs} docs · ${owner.user.email} · sys ${best.id}`);
const base = `/app/sys/${best.id}/account`;
const pages: [string, string][] = [
  ["hub", base], ["invoice-list", `${base}/docs/INVOICE`], ["quotation-list", `${base}/docs/QUOTATION`],
  ...(latest ? [[`doc-detail`, `${base}/docs/${latest.docType}/${latest.id}`] as [string, string]] : []),
  ["expense", `${base}/expense`], ["purchase", `${base}/purchase`], ["contacts", `${base}/contacts`],
  ["products", `${base}/products`], ["finance", `${base}/finance`], ["reports", `${base}/reports`],
  ["journal", `${base}/journal`], ["aging", `${base}/aging`], ["settings", `${base}/settings`], ["app-home", `/app`],
];
try {
  const pptr = await import("/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js" as string);
  const browser = await pptr.default.launch({ executablePath: "/usr/bin/chromium-browser",
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--user-data-dir=/tmp/chr-shot-acc"] });
  try {
    for (const [tag, w, h] of [["desktop", 1440, 900], ["mobile", 390, 844]] as const) {
      const page = await browser.newPage();
      await page.setViewport({ width: w, height: h, deviceScaleFactor: 1.5 });
      await page.setCookie(
        { name: "__Host-shark_session", value: token, url: BASE, path: "/", secure: true },
        { name: "shark_tenant", value: best.tenantId, url: BASE, path: "/", secure: true },
      );
      for (const [name, path] of pages) {
        try {
          await page.goto(BASE + path, { waitUntil: "networkidle2", timeout: 45000 });
          await new Promise((r) => setTimeout(r, 800));
          await page.screenshot({ path: `${OUT}/${tag}-${name}.png`, fullPage: true });
          console.log(`ok ${tag}-${name}`);
        } catch (e) { console.log(`FAIL ${tag}-${name}: ${String(e).slice(0, 120)}`); }
      }
      await page.close();
    }
  } finally { await browser.close(); }
} finally {
  const { count } = await prisma.session.deleteMany({ where: { userAgent: "qc-shot-account" } });
  console.log(`swept sessions: ${count}`);
  await prisma.$disconnect();
}
