// C4.4-fix: screenshots of the two new UI controls on the QC3 server (:3218) — read-only (opens pages/modals, never submits)
// Run: QC_BASE=http://127.0.0.1:3218 bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/c44f/shot-ui.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { mkdirSync } from "node:fs";
const BASE = process.env.QC_BASE ?? "http://127.0.0.1:3218";
const OUT = ".qc-shots/crm/c44f";
mkdirSync(OUT, { recursive: true });
const { prisma } = await import("@/lib/core/db");
const { sha256 } = (await import("@/lib/core/hash")) as Any;
const lib = (await import("../../crm-journeys/lib.mts" as string)) as Any;
const env = await lib.resolveEnv(prisma);
const minter = new lib.SessionMinter(prisma, sha256, BASE, "qc-c44f-shot");
const browser = await lib.launchBrowser(process.pid);
const ctx = new lib.JourneyCtx({ dry: false, prisma, env, BASE, story: "US3", browser, minter });
const out: string[] = [];
try {
  for (const [w, h] of [[1440, 900], [390, 844]] as const) {
    const page = await ctx.loginStaff("owner");
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1, ...(w < 500 ? { isMobile: true, hasTouch: true } : {}) });
    await page.goto(`${BASE}/app/sys/${env.SYS}/crm/settings/pipelines`, { waitUntil: "networkidle2", timeout: 60_000 });
    await page.waitForSelector(`[data-testid="pl-quote-accept-${env.pipelines.b2b.id}"]`, { timeout: 20_000 });
    const f = `${OUT}/settings-pipelines-${w}.png`;
    await page.screenshot({ path: f, fullPage: true });
    out.push(f);
    await page.close();
  }
  const lead = await (prisma as Any).crmContact.findFirst({ where: { tenantId: env.tenantId, systemId: env.SYS, convertedAt: null, archivedAt: null, mergedIntoId: null }, orderBy: { createdAt: "asc" }, select: { id: true } });
  if (lead) {
    const page = await ctx.loginStaff("owner");
    await page.goto(`${BASE}/app/sys/${env.SYS}/crm/contacts/${lead.id}`, { waitUntil: "networkidle2", timeout: 60_000 });
    await page.waitForSelector("[data-testid=contact-convert-btn]", { timeout: 20_000 });
    await page.click("[data-testid=contact-convert-btn]");
    await page.waitForSelector("[data-testid=contact-convert-company-taxid]", { timeout: 10_000 });
    await page.type("[data-testid=contact-convert-company-taxid]", "0105561000004", { delay: 5 }); // bad checksum → shows the calm inline message on submit? (not submitted)
    const role = await page.$eval("[data-testid=contact-convert-company-role]", (el: Any) => el.value);
    const f = `${OUT}/contact-convert-modal-1440.png`;
    const modal = await page.$("[data-testid=contact-convert-modal]");
    await (modal ?? page).screenshot({ path: f });
    out.push(`${f} (role default=${role})`);
    await page.close();
  }
  console.log(JSON.stringify({ ok: true, shots: out, consoleErrors: ctx.checks?.length ?? 0 }));
} catch (e) {
  console.log(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e), shots: out }));
} finally {
  await browser.close().catch(() => undefined);
  lib.cleanupChromiumProfile(process.pid);
  await minter.cleanup().catch(() => undefined);
  await prisma.$disconnect();
}
