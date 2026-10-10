// @ts-nocheck — temporary lane probe (browser-context callbacks); not product code
// probe-home.mts — PARITY 01 fix proof (lane wip/crm-parity-fix · temporary). Measures the CRM home KPI tiles + filter bar in a real browser.
//   run: run-iso.sh <log> pnpm exec tsx scripts/pending/parityfix/probe-home.mts <outDir> [user=owner]
//   Mints ONE staff session on QC1 (deleted in finally). Read-only otherwise.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
const env = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = env.loadQcEnv();
if (!host.includes("ep-plain-art")) throw new Error("not QC1");
const { prisma } = await import("@/lib/core/db");
const E = JSON.parse(readFileSync("scripts/crm-expected.json", "utf8")) as { tenantId: string; systemId: string; users: Record<string, { userId?: string }> };
const BASE = process.env.QC_BASE ?? "http://127.0.0.1:3215";
const OUT = process.argv[2]!;
const USER = process.argv[3] ?? "owner";
mkdirSync(OUT, { recursive: true });
const token = "crmpf" + Math.random().toString(36).slice(2) + Date.now().toString(36);
const ttl = new Date(Date.now() + 30 * 60 * 1000);
const row = await prisma.session.create({ data: { userId: E.users[USER]!.userId!, tokenHash: createHash("sha256").update(token).digest("hex"), userAgent: "qc-visual-crm parityfix-probe", idleExpiresAt: ttl, expiresAt: ttl }, select: { id: true } });
const hostName = new URL(BASE).hostname;
const cookies = [{ name: "shark_session", value: token, domain: hostName, path: "/" }, { name: "shark_tenant", value: E.tenantId, domain: hostName, path: "/" }];
const pptr = (await import("/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js" as string)) as any;
const udd = `/tmp/chr-crm-pf-${process.pid}`;
const browser = await pptr.default.launch({ executablePath: "/usr/bin/chromium-browser", args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", `--user-data-dir=${udd}`] });
const report: any[] = [];
try {
  const q3 = `${new Date().getUTCFullYear()}-Q3`;
  for (const [w, h] of [[1440, 900], [1280, 800], [1024, 768], [768, 900], [390, 844]] as const) {
    for (const variant of ["default", "active"] as const) {
      const page = await browser.newPage();
      await page.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: w < 500, hasTouch: w < 500 });
      await page.setCookie(...cookies);
      await page.evaluateOnNewDocument("window.__name = (f) => f"); // tsx/esbuild keepNames helper is absent in the page
      const resp = await page.goto(`${BASE}/app/sys/${E.systemId}${variant === "active" ? `?period=${q3}` : ""}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.waitForSelector("[data-testid=crm-home]", { timeout: 20_000 });
      await new Promise((r) => setTimeout(r, 1200));
      const measure = () => page.evaluate(() => {
        const r = (el: Element) => { const b = el.getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) }; };
        const tiles = [...document.querySelectorAll("[data-testid^=crm-home-kpi-]")].map((t) => {
          const v = t.children[1] as HTMLElement; const cs = getComputedStyle(v);
          const range = document.createRange(); range.selectNodeContents(v);
          const lines = new Set([...range.getClientRects()].map((x) => Math.round(x.top))).size;
          return { id: t.getAttribute("data-testid"), tile: r(t), text: v.textContent, font: cs.fontSize, textW: Math.round(range.getBoundingClientRect().width), boxW: v.clientWidth, clipped: v.scrollWidth > v.clientWidth + 1, ellipsis: cs.textOverflow, lines };
        });
        const bar = ["crm-home-search", "crm-home-filter-pipeline", "crm-home-filter-owner", "crm-home-filter-range", "crm-home-filter-apply", "crm-home-filter-reset"].map((id) => { const el = document.querySelector(`[data-testid=${id}]`); return el ? { id, ...r(el) } : { id, absent: true }; });
        const card = document.querySelector("[data-testid=crm-home-filter-form]")!.closest("section")!;
        return { tiles, bar, card: r(card), rows: new Set(bar.filter((b: any) => !b.absent).map((b: any) => Math.round((b.y + b.h / 2) / 8))).size, docOverflow: document.documentElement.scrollWidth - window.innerWidth };
      });
      const m: any = await measure();
      await page.screenshot({ path: `${OUT}/home-${USER}-${w}-${variant}.png`, fullPage: true });
      let big: any = null;
      if (variant === "default" && m.tiles.length) {
        // stress: worst-case strings the formatter can produce (compactBaht has no unit above M)
        await page.evaluate(() => {
          const vals = ["฿999.99M", "฿1,234.56M", "฿888.88M", "100%", "12,345", "98,765"];
          [...document.querySelectorAll("[data-testid^=crm-home-kpi-]")].forEach((t, i) => { (t.children[1] as HTMLElement).textContent = vals[i]!; });
        });
        big = (await measure()).tiles;
        const sec = await page.$("[data-testid=crm-home-kpi-open]");
        const box = await page.evaluate((el: Element) => { const b = el.parentElement!.getBoundingClientRect(); return { x: b.left, y: b.top + window.scrollY, width: b.width, height: b.height }; }, sec);
        await page.screenshot({ path: `${OUT}/kpi-stress-${USER}-${w}.png`, clip: { x: Math.max(0, box.x - 8), y: Math.max(0, box.y - 8), width: box.width + 16, height: box.height + 16 } });
      }
      report.push({ w, variant, http: resp?.status(), ...m, stress: big });
      await page.close();
    }
  }
} finally {
  await browser.close().catch(() => {});
  await prisma.session.deleteMany({ where: { id: row.id } });
  await prisma.$disconnect();
  const { rmSync } = await import("node:fs"); rmSync(udd, { recursive: true, force: true });
}
writeFileSync(`${OUT}/probe-${USER}.json`, JSON.stringify(report, null, 1));
for (const r of report) {
  console.log(`\n== ${r.w}px ${r.variant} http=${r.http} docOverflow=${r.docOverflow} filterRows=${r.rows} card=${JSON.stringify(r.card)}`);
  for (const t of r.tiles) console.log(`  tile ${t.id} tileW=${t.tile.w} "${t.text}" font=${t.font} textW=${t.textW}/box ${t.boxW} clipped=${t.clipped} ellipsis=${t.ellipsis} lines=${t.lines}`);
  for (const b of r.bar) console.log(`  bar ${b.id} ${b.absent ? "absent" : `x=${b.x} y=${b.y} w=${b.w} h=${b.h}`}`);
  for (const t of r.stress ?? []) console.log(`  STRESS ${t.id} "${t.text}" font=${t.font} textW=${t.textW}/box ${t.boxW} clipped=${t.clipped} lines=${t.lines}`);
}
