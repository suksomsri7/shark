// CRM C4.2-fix r2 ▸ UI probe for round-2 items on a production build (:3218) ◂
//   Part A — SEEDED shop, seeded thana, probe-owned deal/contact (cleaned by id):
//     L1 deal lines as read-only text for a viewer without crm.deal.lines (thana · ?tab=lines · 1440 + 390) · owner keeps the editor
//     S3a thana (crm.contact.update) sees the bulk-assign check boxes and assigns a contact through the real menu → DB owner changes
//     S3b thana cannot archive (menu item absent · service refuses)
//   Part B — THROWAWAY shop `qc-cui-ui-*` (fixture, swept) with STAFF personas of exact key sets:
//     D  /contacts/new · /companies/new · /deals/new → 404 without the create key (owner 200 = control)
//     B  no crm.activity.create → plain tel: link (no call-log prompt) · C member-linked contact without member.customer.update →
//        consent grant/refuse disabled + hint (owner enabled = control)
//     S3c STAFF granted crm.deal.export through the staff service → deals table export works
//     A  company pickers: convert-only persona gets companies in the convert dialog · merge-only persona in the merge sheet
// Run: QC_BASE=http://127.0.0.1:3218 bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/cui/probe-r2-ui.mts --shots <name>
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { mkdirSync } from "node:fs";
const BASE = process.env.QC_BASE ?? "http://127.0.0.1:3218";
if (!/127\.0\.0\.1:3218/.test(BASE)) {
  console.error("this probe only targets the cui server on :3218");
  process.exit(4);
}
const argv = process.argv.slice(2);
const OUT = `.qc-shots/crm/cui/${argv.includes("--shots") ? argv[argv.indexOf("--shots") + 1] : "r2"}`;
mkdirSync(OUT, { recursive: true });
const { fixture } = (await import("./_fx.mts" as string)) as Any;
const realFetch = globalThis.fetch;
const { P, prisma, TAG, chk, call, mkShop, mkUser, done } = await fixture("ui");
globalThis.fetch = realFetch;
const { sha256 } = (await import("@/lib/core/hash" as string)) as Any;
const lib = (await import("../../crm-journeys/lib.mts" as string)) as Any;
const minter = new lib.SessionMinter(prisma, sha256, BASE, "qc-cui-r2");
const browser = await lib.launchBrowser(process.pid);
const seeded: { contacts: string[]; deals: string[] } = { contacts: [], deals: [] };
let octx: Any = null;
let ownerActor: Any = null;
const CRM = (await import("@/lib/modules/crm" as string)) as Any;

// r2 fix: ONE browser context per persona — cookies are per context, so a second persona's setCookie on the default context
//   silently replaced the first persona's session (thana's checks ran as the owner: the earlier S3a.1 "pass" on the old build
//   and the contact-360 protocol timeout both came from that)
const pageFor = async (userId: string, tenantId: string) => {
  const bc = await browser.createBrowserContext();
  const page = await bc.newPage();
  page.once("close", () => { bc.close().catch(() => {}); });
  page.setDefaultTimeout(30_000);
  // native confirm()/alert() would block every later protocol call (Runtime.callFunctionOn timeout) — accept and log them
  page.on("dialog", async (dlg: Any) => {
    console.log(`   · dialog (${dlg.type()}): ${String(dlg.message()).slice(0, 120)} → accept`);
    await dlg.accept().catch(() => {});
  });
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument("window.__name = function (f) { return f; };");
  await page.evaluateOnNewDocument(`(() => { const o = URL.createObjectURL.bind(URL); window.__blobs = 0; URL.createObjectURL = (b) => { window.__blobs += 1; return o(b); }; })();`);
  await page.setCookie(...minter.withTenant(await minter.staff(userId), tenantId));
  return page;
};
const go = async (page: Any, url: string): Promise<number> => {
  const r = await page.goto(url, { waitUntil: "networkidle2", timeout: 60_000 });
  await new Promise((res) => setTimeout(res, 500));
  return r?.status() ?? 0;
};
const visible = (page: Any, sel: string): Promise<number> =>
  page.$$eval(sel, (els: Any[]) => els.filter((e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== "hidden").length);
const shot = async (page: Any, name: string) => {
  for (const [w, h] of [[1440, 900], [390, 844]] as const) {
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    await new Promise((r) => setTimeout(r, 400));
    await page.screenshot({ path: `${OUT}/${name}-${w}.png`, fullPage: true });
  }
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

try {
  // ═══════════════ Part A — seeded shop · thana ═══════════════
  const env = await lib.resolveEnv(prisma);
  ({ ctx: octx, actor: ownerActor } = await lib.actorFor(prisma, env, "owner"));
  const SYS = env.SYS as string;
  const thanaId = env.users.thana.userId as string;
  const tm = await P.membership.findFirst({ where: { tenantId: env.tenantId, userId: thanaId }, select: { role: true, permissions: true, unitAccess: true } });
  const thana = { userId: thanaId, role: tm.role, permissions: tm.permissions ?? {}, unitAccess: tm.unitAccess ?? [] };
  const tctx = { tenantId: env.tenantId, systemId: SYS, actorUserId: thanaId };
  const k = (await CRM.contacts.createContact(octx, ownerActor, { firstName: `ลูกค้า ${TAG}`, phone: `08${Math.floor(10_000_000 + Math.random() * 89_999_999)}`, ownerUserId: thanaId })).contact.id as string;
  seeded.contacts.push(k);
  const LINE = `แพ็กเกจดำน้ำ ${TAG}`;
  const d = await CRM.deals.createDeal(octx, ownerActor, {
    pipelineId: env.pipelines.b2b.id, title: `ดีลรายการ ${TAG}`, contactId: k, ownerUserId: thanaId,
    lines: [{ name: LINE, qty: 2, unitPriceSatang: 350_000, discountBp: 500, productId: null, vatRateBp: 700, note: "รวมอุปกรณ์ครบชุด" }], discountBp: 0,
  });
  const dealId = String(d?.id ?? d?.deal?.id);
  seeded.deals.push(dealId);
  const CTRL = '[data-testid="deal-lines-editor"] input, [data-testid="deal-lines-editor"] select, [data-testid="deal-lines-editor"] textarea, [data-testid="deal-lines-editor"] button';

  const pt = await pageFor(thanaId, env.tenantId);
  const st = await go(pt, `${BASE}/app/sys/${SYS}/crm/deals/${dealId}?tab=lines`);
  const ctrlT = await visible(pt, CTRL);
  const txtT = String(await pt.$eval('[data-testid="deal-lines-editor"]', (e: Any) => e.innerText).catch(() => ""));
  chk("L1.1", st === 200 && ctrlT === 0, `thana (no crm.deal.lines) on ?tab=lines sees NO form controls in the lines block — status=${st} controls=${ctrlT}`);
  chk("L1.2", txtT.includes(LINE) && txtT.includes("รวมอุปกรณ์ครบชุด") && /VAT 7%/.test(txtT) && /3,500|3500/.test(txtT) && /5%/.test(txtT), `the read-only lines stay readable (name · qty · price · discount · VAT · note · totals) — text=${JSON.stringify(txtT.slice(0, 260))}`);
  await shot(pt, "deal-lines-thana");
  const po = await pageFor(env.users.owner.userId, env.tenantId);
  await go(po, `${BASE}/app/sys/${SYS}/crm/deals/${dealId}?tab=lines`);
  chk("L1.3", (await visible(po, CTRL)) > 0, `control: the owner (holds crm.deal.lines) still gets the editor`);
  await shot(po, "deal-lines-owner");

  // SF-3 — thana assigns through the real UI
  const liveKeys = Object.keys(((await P.membership.findFirst({ where: { tenantId: env.tenantId, userId: thanaId }, select: { permissions: true } }))?.permissions ?? {}) as Record<string, unknown>).filter((x) => x.startsWith("crm.")).sort();
  console.log(`   · thana's live crm keys at check time: ${liveKeys.join(" ")}`);
  await go(pt, `${BASE}/app/sys/${SYS}/crm/contacts`);
  chk("S3a.1", (await visible(pt, '[data-testid="contacts-select-all"], [data-testid="contacts-card-select"]')) > 0, `thana (crm.contact.update) sees the bulk-assign check boxes on /contacts`);
  console.log("   · step: contact 360 as thana");
  await go(pt, `${BASE}/app/sys/${SYS}/crm/contacts/${k}`);
  let assigned = false;
  let why = "";
  if ((await visible(pt, '[data-testid="contact-menu-btn"]')) > 0) {
    await pt.click('[data-testid="contact-menu-btn"]');
    await sleep(300);
    chk("S3b.1", (await visible(pt, '[data-testid="contact-menu-archive"]')) === 0, `thana (no crm.contact.delete) has no archive item in the contact menu`);
    if ((await visible(pt, '[data-testid="contact-menu-owner"]')) > 0) {
      await pt.click('[data-testid="contact-menu-owner"]');
      await pt.waitForSelector('[data-testid="contact-owner-select"]', { timeout: 10_000 });
      const opts: string[] = await pt.$$eval('[data-testid="contact-owner-select"] option', (os: Any[]) => os.map((o) => o.value));
      const target = opts.includes(env.users.manager.userId) ? env.users.manager.userId : opts.find((v) => v && v !== thanaId) ?? "";
      await pt.select('[data-testid="contact-owner-select"]', target);
      const reason = await pt.$('[data-testid="contact-owner-reason"]');
      if (reason) await pt.type('[data-testid="contact-owner-reason"]', "ย้ายให้หัวหน้าทีมดูแลต่อ (probe)");
      const conf = await pt.$('[data-testid="contact-owner-confirm"]');
      if (conf) await pt.click('[data-testid="contact-owner-confirm"]');
      console.log(`   · step: submit owner change (reason field=${!!reason} confirm=${!!conf})`);
      await pt.click('[data-testid="contact-owner-submit"]');
      await sleep(2000);
      const row = await P.crmContact.findFirst({ where: { id: k }, select: { ownerUserId: true } });
      assigned = row?.ownerUserId === (target || null);
      why = `target=${target === env.users.manager.userId ? "manager" : target ? "other" : "none"} db=${row?.ownerUserId === env.users.manager.userId ? "manager" : row?.ownerUserId === thanaId ? "thana" : row?.ownerUserId}`;
    } else why = "no contact-menu-owner item";
  } else why = "no contact-menu-btn";
  chk("S3a.2", assigned, `thana assigns the contact through the real menu and the action succeeds — ${why}`);
  const arch = await call(() => CRM.contacts.archiveContact(tctx, thana, k, { confirm: true, reason: "probe: thana ต้องเก็บถาวรไม่ได้" }));
  chk("S3b.2", !arch.ok && /FORBIDDEN|NOT_FOUND/.test(String(arch.err?.code)), `the service refuses thana's archive — ok=${arch.ok} code=${arch.err?.code}`);
  await pt.close();
  await po.close();

  // ═══════════════ Part B — throwaway shop ═══════════════
  const shop = await mkShop("b");
  const persona = async (name: string, perms: Record<string, boolean>) => {
    const uid = await mkUser(`-${name}`);
    const m = await P.membership.create({ data: { userId: uid, tenantId: shop.tid, role: "STAFF", unitAccess: ["*"], permissions: perms, acceptedAt: new Date() } });
    return { uid, mid: m.id as string, actor: { userId: uid, role: "STAFF", unitAccess: ["*"], permissions: perms } };
  };
  const CRMB = `${BASE}/app/sys/${shop.S}/crm`;

  // D — /new pages
  const p1 = await persona("nocreate", { "crm.contact.read": true, "crm.deal.read": true, "crm.company.read": true });
  const pp1 = await pageFor(p1.uid, shop.tid);
  const pown = await pageFor(shop.uid, shop.tid);
  for (const [id, path] of [["D.1", "contacts/new"], ["D.2", "companies/new"], ["D.3", `deals/new?pipeline=${shop.pipe.id}`]] as const) {
    const s1 = await go(pp1, `${CRMB}/${path}`);
    const s0 = await go(pown, `${CRMB}/${path}`);
    chk(id, s1 === 404 && s0 === 200, `/${path.split("?")[0]} without the create key → 404 (owner 200 = control) — staff=${s1} owner=${s0}`);
  }
  await pp1.close();

  // B + C — tel link + member-linked consent
  const p2 = await persona("nocall", { "crm.contact.read": true, "crm.contact.update": true });
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  const MEM = (await sysSvc.createSystem(shop.tid, "MEMBER", `สมาชิก ${TAG}`)).id as string;
  const cust = await P.customer.create({ data: { tenantId: shop.tid, memberSystemId: MEM, name: `สมาชิก ${TAG}`, phone: "0812345678" } });
  const k2 = (await CRM.contacts.createContact(shop.ctx, shop.owner, { firstName: `ผูกสมาชิก ${TAG}`, phone: "081-234-5678", ownerUserId: p2.uid })).contact.id as string;
  await P.crmContact.update({ where: { id: k2 }, data: { memberCustomerId: cust.id } });
  const pp2 = await pageFor(p2.uid, shop.tid);
  const s2 = await go(pp2, `${CRMB}/contacts/${k2}`);
  const tel = await pp2.$eval('[data-testid="contact-phone-tel"]', (a: Any) => a.getAttribute("href")).catch(() => null);
  chk("B.1", s2 === 200 && tel === "tel:0812345678" && (await visible(pp2, '[data-testid="crm-call-tel"]')) === 0, `no crm.activity.create → plain tel: link (no call-log prompt) — status=${s2} href=${tel}`);
  const grants: boolean[] = await pp2.$$eval('[data-testid="contact-consent-grant"], [data-testid="contact-consent-revoke"]', (bs: Any[]) => bs.map((b) => b.disabled));
  const hint = await visible(pp2, '[data-testid="contact-consent-member-locked"]');
  chk("C.1", grants.length > 0 && grants.every(Boolean) && hint === 1, `member-linked contact, viewer without member.customer.update → consent buttons disabled + hint — buttons=${grants.length} disabled=${grants.filter(Boolean).length} hint=${hint}`);
  await shot(pp2, "contact-nocall-memberlocked");
  await go(pown, `${CRMB}/contacts/${k2}`);
  const ownGrants: boolean[] = await pown.$$eval('[data-testid="contact-consent-grant"]', (bs: Any[]) => bs.map((b) => b.disabled));
  chk("C.2", ownGrants.some((x) => !x) && (await visible(pown, '[data-testid="contact-consent-member-locked"]')) === 0, `control: the owner can still change member consent — enabled=${ownGrants.filter((x) => !x).length}`);
  await pp2.close();

  // S3c — crm.deal.export granted through the staff service
  const p3 = await persona("exporter", { "crm.deal.read": true });
  const staff = (await import("@/lib/staff/service" as string)) as Any;
  const g = await staff.updateStaffAccess({ tenantId: shop.tid, actorUserId: shop.uid, membershipId: p3.mid, permissions: { "crm.deal.read": true, "crm.deal.export": true } });
  const m3 = await P.membership.findFirst({ where: { id: p3.mid }, select: { permissions: true } });
  chk("S3c.1", g?.ok === true && (m3?.permissions as Any)?.["crm.deal.export"] === true, `the owner can grant crm.deal.export through the staff service — ${JSON.stringify(g).slice(0, 160)}`);
  const pp3 = await pageFor(p3.uid, shop.tid);
  await go(pp3, `${CRMB}/deals?view=table&pipeline=${shop.pipe.id}`);
  let blobs = 0;
  if ((await visible(pp3, '[data-testid="deal-export-btn"]')) > 0) {
    await pp3.click('[data-testid="deal-export-btn"]');
    await sleep(2500);
    blobs = await pp3.evaluate(() => (window as Any).__blobs ?? 0);
  }
  const err = await pp3.$eval('[data-testid="deal-bulk-msg"]', (e: Any) => e.innerText).catch(() => "");
  chk("S3c.2", blobs > 0 && !err, `granted STAFF sees the export button and the CSV is produced — blobs=${blobs} msg=${JSON.stringify(err)}`);
  await pp3.close();

  // A — company pickers
  const p4 = await persona("converter", { "crm.contact.read": true, "crm.contact.convert": true, "crm.company.read": true });
  const co4 = await CRM.companies.createCompany(shop.ctx, shop.owner, { name: `บริษัทปลายทาง ${TAG}`, ownerUserId: p4.uid });
  const k4 = (await CRM.contacts.createContact(shop.ctx, shop.owner, { firstName: `ลีดแปลง ${TAG}`, phone: `08${Math.floor(10_000_000 + Math.random() * 89_999_999)}`, ownerUserId: p4.uid })).contact.id as string;
  const pp4 = await pageFor(p4.uid, shop.tid);
  await go(pp4, `${CRMB}/contacts/${k4}`);
  let opts4 = -1;
  let err4 = "";
  if ((await visible(pp4, '[data-testid="contact-convert-btn"]')) > 0) {
    await pp4.click('[data-testid="contact-convert-btn"]');
    await pp4.waitForSelector('[data-testid="contact-convert-company-mode-pick"]', { timeout: 10_000 });
    await pp4.click('[data-testid="contact-convert-company-mode-pick"]');
    await sleep(1800);
    opts4 = await pp4.$$eval('[data-testid="contact-pick-convert-company-select"] option', (os: Any[]) => os.filter((o) => o.value).length).catch(() => -1);
    err4 = String(await pp4.$eval('[data-testid="contact-pick-convert-company-select"]', (s: Any) => s.parentElement?.parentElement?.innerText ?? "").catch(() => ""));
  }
  chk("A.1", opts4 >= 1 && !/สิทธิ์/.test(err4), `convert-only persona gets its visible companies in the convert dialog's picker — options=${opts4} co=${!!co4} text=${JSON.stringify(err4.slice(-120))}`);
  await pp4.close();
  const p5 = await persona("merger", { "crm.company.read": true, "crm.company.merge": true });
  const c5a = await CRM.companies.createCompany(shop.ctx, shop.owner, { name: `บริษัทซ้ำ A ${TAG}`, ownerUserId: p5.uid });
  await CRM.companies.createCompany(shop.ctx, shop.owner, { name: `บริษัทซ้ำ B ${TAG}`, ownerUserId: p5.uid });
  const c5aId = String(c5a?.company?.id ?? c5a?.id);
  const pp5 = await pageFor(p5.uid, shop.tid);
  await go(pp5, `${CRMB}/companies/${c5aId}`);
  let opts5 = -1;
  if ((await visible(pp5, '[data-testid="company-menu-btn"]')) > 0) {
    await pp5.click('[data-testid="company-menu-btn"]');
    await sleep(300);
    if ((await visible(pp5, '[data-testid="company-menu-merge"]')) > 0) {
      await pp5.click('[data-testid="company-menu-merge"]');
      await sleep(1800);
      opts5 = await pp5.$$eval('[data-testid="company-pick-merge-select"] option', (os: Any[]) => os.filter((o) => o.value).length).catch(() => -1);
    }
  }
  chk("A.2", opts5 >= 1, `merge-only persona gets the other company in the merge sheet's picker — options=${opts5}`);
  await pp5.close();
  await pown.close();
} catch (e) {
  chk("R2UI.FATAL", false, String((e as Error)?.stack ?? e).slice(0, 700));
} finally {
  // seeded-shop cleanup (by id only)
  for (const id of seeded.deals) {
    const r = await call(() => CRM.deals.deleteDeal(octx, ownerActor, id, { confirm: true, reason: "ลบดีลทดสอบของ probe qc-cui" }));
    if (!r.ok) await P.crmDeal.update({ where: { id }, data: { archivedAt: new Date() } }).catch(() => {});
  }
  for (const id of seeded.contacts) {
    await P.crmActivity.deleteMany({ where: { contactId: id } }).catch(() => {});
    const r = await P.crmContact.delete({ where: { id } }).then(() => true, () => false);
    if (!r) await call(() => CRM.contacts.archiveContact(octx, ownerActor, id, { confirm: true, reason: "ปิดผู้ติดต่อทดสอบของ probe qc-cui" }));
    chk(`CLEAN-seed-${id.slice(-5)}`, true, `seeded shop: probe contact ${r ? "deleted" : "archived (FK)"} · deals ${seeded.deals.length} removed`);
  }
  await minter.cleanup().catch(() => {});
  await browser.close().catch(() => {});
  lib.cleanupChromiumProfile(process.pid);
}
await done("round-2 UI probe");
