// C4.4-fix item 2 through the REAL UI on :3218 (QC3): owner picks "accepted → WON stage" on /settings/pipelines, saves, DB
//   changes; manager (no crm.settings.manage) gets no page · the original value is restored in finally
// Run: QC_BASE=http://127.0.0.1:3218 bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/c44f/ui-pipeline-quote.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
const BASE = process.env.QC_BASE ?? "http://127.0.0.1:3218";
const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const { sha256 } = (await import("@/lib/core/hash")) as Any;
const lib = (await import("../../crm-journeys/lib.mts" as string)) as Any;
const env = await lib.resolveEnv(prisma);
const minter = new lib.SessionMinter(prisma, sha256, BASE, "qc-c44f-ui");
const browser = await lib.launchBrowser(process.pid);
const ctx = new lib.JourneyCtx({ dry: false, prisma, env, BASE, story: "US3", browser, minter });
const pid = env.pipelines.b2b.id as string;
const won = env.pipelines.b2b.stages.find((s: Any) => s.kind === "WON");
const orig = await P.crmPipeline.findFirst({ where: { id: pid }, select: { stageOnQuoteAcceptedId: true, stageOnQuoteRejectedId: true } });
const res: string[] = [];
let ok = true;
try {
  const page = await ctx.loginStaff("owner");
  await page.goto(`${BASE}/app/sys/${env.SYS}/crm/settings/pipelines`, { waitUntil: "networkidle2", timeout: 60_000 });
  await page.waitForSelector(`[data-testid="pl-quote-accept-${pid}"]`, { timeout: 20_000 });
  await page.select(`[data-testid="pl-quote-accept-${pid}"]`, won.id);
  await page.click(`[data-testid="pl-quote-save-${pid}"]`);
  await page.waitForSelector("[data-testid=pl-msg]", { timeout: 15_000 });
  const msg = await page.$eval("[data-testid=pl-msg]", (e: Any) => e.textContent);
  await page.screenshot({ path: ".qc-shots/crm/c44f/settings-pipelines-after-save-1440.png", fullPage: true });
  const after = await lib.pollUntil(() => P.crmPipeline.findFirst({ where: { id: pid, stageOnQuoteAcceptedId: won.id }, select: { stageOnQuoteAcceptedId: true } }), { timeoutMs: 10_000 });
  const a = after?.stageOnQuoteAcceptedId === won.id;
  ok = ok && a;
  res.push(`owner save → DB stageOnQuoteAcceptedId=${after?.stageOnQuoteAcceptedId ?? null} (want ${won.id}) msg="${msg}" ${a ? "✅" : "❌"}`);
  await page.close();
  const pm = await ctx.loginStaff("manager");
  const r = await pm.goto(`${BASE}/app/sys/${env.SYS}/crm/settings/pipelines`, { waitUntil: "networkidle2", timeout: 60_000 });
  const has = !!(await pm.$(`[data-testid="pl-quote-accept-${pid}"]`));
  ok = ok && !has;
  res.push(`manager → HTTP ${r?.status()} control visible=${has} ${!has ? "✅" : "❌"}`);
  await pm.close();
} catch (e) {
  ok = false;
  res.push(`error ${e instanceof Error ? e.message : String(e)}`);
} finally {
  await P.crmPipeline.update({ where: { id: pid }, data: { stageOnQuoteAcceptedId: orig?.stageOnQuoteAcceptedId ?? null, stageOnQuoteRejectedId: orig?.stageOnQuoteRejectedId ?? null } });
  await browser.close().catch(() => undefined);
  lib.cleanupChromiumProfile(process.pid);
  await minter.cleanup().catch(() => undefined);
  await prisma.$disconnect();
}
for (const l of res) console.log(`  ${l}`);
console.log(`${ok ? "🟢" : "🔴"} ui-pipeline-quote (restored to ${JSON.stringify(orig)})`);
process.exit(ok ? 0 : 1);
