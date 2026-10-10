// CRM C4.2-fix r2 ▸ debug (read-only apart from its own session row): what thana's /contacts shows on :3218 ◂
/* eslint-disable @typescript-eslint/no-explicit-any */
const accEnv = (await import("../../acc-v2-env.mts" as string)) as any;
accEnv.loadQcEnv();
const { prisma } = (await import("@/lib/core/db" as string)) as any;
const { sha256 } = (await import("@/lib/core/hash" as string)) as any;
const lib = (await import("../../crm-journeys/lib.mts" as string)) as any;
const env = await lib.resolveEnv(prisma);
const BASE = "http://127.0.0.1:3218";
const minter = new lib.SessionMinter(prisma, sha256, BASE, "qc-cui-peek");
const browser = await lib.launchBrowser(process.pid);
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.setCookie(...minter.withTenant(await minter.staff(env.users.thana.userId), env.tenantId));
  await page.goto(`${BASE}/app/sys/${env.SYS}/crm/contacts`, { waitUntil: "networkidle2", timeout: 60_000 });
  const r = await page.evaluate(() => ["contacts-select-all", "contacts-card-select", "contacts-row-select", "contacts-import-btn"].map((t) => {
    const els = [...document.querySelectorAll(`[data-testid="${t}"]`)];
    return `${t}:${els.length}/${els.filter((e) => e.getClientRects().length > 0).length}`;
  }).join(" "));
  console.log(r);
} finally {
  await minter.cleanup();
  await browser.close();
  lib.cleanupChromiumProfile(process.pid);
  await prisma.$disconnect();
}
