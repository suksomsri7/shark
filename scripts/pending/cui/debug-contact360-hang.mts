// CRM C4.2-fix r2 ▸ debug: does contact 360 hang as thana for a fresh probe contact with a deal-with-lines? (seeded shop,
//   probe-owned rows deleted by id) — each protocol call raced against 15 s so a hang is reported instead of stalling ◂
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
const accEnv = (await import("../../acc-v2-env.mts" as string)) as Any;
accEnv.loadQcEnv();
const { prisma } = (await import("@/lib/core/db" as string)) as Any;
const { sha256 } = (await import("@/lib/core/hash" as string)) as Any;
const lib = (await import("../../crm-journeys/lib.mts" as string)) as Any;
const CRM = (await import("@/lib/modules/crm" as string)) as Any;
const env = await lib.resolveEnv(prisma);
const { ctx, actor } = await lib.actorFor(prisma, env, "owner");
const BASE = "http://127.0.0.1:3218";
const minter = new lib.SessionMinter(prisma, sha256, BASE, "qc-cui-dbg");
const browser = await lib.launchBrowser(process.pid);
const race = <T,>(p: Promise<T>, label: string) => Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`HANG ${label}`)), 15_000))]);
const tag = `qc-cui-dbg-${Date.now().toString(36)}`;
const made: { k?: string; d?: string } = {};
try {
  const thanaId = env.users.thana.userId;
  made.k = (await CRM.contacts.createContact(ctx, actor, { firstName: `ดีบัก ${tag}`, phone: `08${Math.floor(10_000_000 + Math.random() * 89_999_999)}`, ownerUserId: thanaId })).contact.id;
  const page = await browser.newPage();
  page.on("console", (m: Any) => { if (m.type() === "error") console.log(`   console.error: ${m.text().slice(0, 200)}`); });
  page.on("pageerror", (e: Any) => console.log(`   pageerror: ${String(e).slice(0, 200)}`));
  await page.setViewport({ width: 1440, height: 900 });
  await page.setCookie(...minter.withTenant(await minter.staff(thanaId), env.tenantId));
  for (const withDeal of [false, true]) {
    if (withDeal) {
      const d = await CRM.deals.createDeal(ctx, actor, { pipelineId: env.pipelines.b2b.id, title: `ดีล ${tag}`, contactId: made.k, ownerUserId: thanaId, lines: [{ name: "x", qty: 1, unitPriceSatang: 1000, discountBp: 0, productId: null, vatRateBp: 700, note: null }], discountBp: 0 });
      made.d = String(d?.id ?? d?.deal?.id);
    }
    const t0 = Date.now();
    const r = await page.goto(`${BASE}/app/sys/${env.SYS}/crm/contacts/${made.k}`, { waitUntil: "networkidle2", timeout: 60_000 }).catch((e: Any) => ({ status: () => `goto-err ${e.message}` }));
    console.log(`withDeal=${withDeal} status=${r?.status?.()} ${Date.now() - t0} ms`);
    try {
      console.log(`  eval1: ${await race(page.evaluate(() => 1), "evaluate")}`);
      console.log(`  menu-btn: ${await race(page.$$eval('[data-testid="contact-menu-btn"]', (e: Any[]) => e.length), "$$eval")}`);
      await race(page.click('[data-testid="contact-menu-btn"]'), "click");
      await new Promise((r) => setTimeout(r, 400));
      console.log(`  menu items: ${await race(page.$$eval('[role="menuitem"]', (e: Any[]) => e.map((x) => x.getAttribute("data-testid")).join(",")), "items")}`);
    } catch (e) {
      console.log(`  ${String((e as Error).message)}`);
    }
  }
} finally {
  if (made.d) await CRM.deals.deleteDeal(ctx, actor, made.d, { confirm: true, reason: "ลบดีลดีบักของ probe" }).catch(() => {});
  if (made.k) { await prisma.crmActivity.deleteMany({ where: { contactId: made.k } }).catch(() => {}); await prisma.crmContact.delete({ where: { id: made.k } }).catch(() => console.log("contact not deleted (FK)")); }
  await minter.cleanup();
  await browser.close().catch(() => {});
  lib.cleanupChromiumProfile(process.pid);
  await prisma.$disconnect();
}
