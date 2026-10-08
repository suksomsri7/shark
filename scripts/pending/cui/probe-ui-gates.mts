// CRM C4.2-fix ▸ UI permission-gate probe (B1 B2 B3 B4 B5 B6 + sweep) · r2: contact assign = crm.contact.update · archive = crm.contact.delete (SF-3 re-ruling) — headless against a PRODUCTION build ◂
//   For every persona the EXPECTED visibility comes from the real `crmCan` on the persona's live membership (the same
//   decider the server actions use) — a control visible without its key = LEAK (red) · the owner (holds every key)
//   must see each control that the page state allows = positive control (proves the selector is right).
//   B3: the notification tabs expose role=tab + aria-selected (exactly one selected) inside role=tablist.
//   B4: every "open parent" link a persona can see must open (HTTP 200, not 404) for that persona.
// Writes: only its own Session rows (deleted in finally). Screenshots 1440 + 390 per page/persona with --shots.
// Run: QC_BASE=http://127.0.0.1:3218 pnpm exec tsx scripts/pending/cui/probe-ui-gates.mts [--shots <dir-name>]
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { mkdirSync } from "node:fs";
const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const envInfo = accEnv.loadQcEnv();
if (!String(envInfo?.host ?? "").includes("ep-plain-art")) {
  console.error(`not QC1 (${envInfo?.host}) — stop`);
  process.exit(4);
}
const { prisma } = (await import("@/lib/core/db" as string)) as Any;
const { sha256 } = (await import("@/lib/core/hash" as string)) as Any;
const { crmCan } = (await import("@/lib/modules/crm/access" as string)) as Any;
const lib = (await import("../../crm-journeys/lib.mts" as string)) as Any;

const BASE = process.env.QC_BASE ?? "http://127.0.0.1:3218";
if (!/127\.0\.0\.1:3218/.test(BASE)) {
  console.error("this probe only targets the cui server on :3218");
  process.exit(4);
}
const argv = process.argv.slice(2);
const SHOTS = argv.includes("--shots") ? argv[argv.indexOf("--shots") + 1] : null;
const OUT = SHOTS ? `.qc-shots/crm/cui/${SHOTS}` : null;
if (OUT) mkdirSync(OUT, { recursive: true });

let pass = 0;
let fail = 0;
const reds: string[] = [];
const chk = (id: string, ok: boolean, msg: string) => {
  if (ok) pass++;
  else {
    fail++;
    reds.push(id);
  }
  console.log(`${ok ? "✅" : "❌"} ${id} ${msg}`);
};

const env = await lib.resolveEnv(prisma);
const SYS = env.SYS as string;
const CRM = `${BASE}/app/sys/${SYS}/crm`;
const ROLES = ["owner", "manager", "thana", "nok"] as const;
const minter = new lib.SessionMinter(prisma, sha256, BASE, "qc-cui-probe");
const browser = await lib.launchBrowser(process.pid);

async function actorOf(role: string): Promise<Any> {
  const u = env.users[role];
  const m = await prisma.membership.findFirst({ where: { tenantId: env.tenantId, userId: u.userId }, select: { role: true, permissions: true, unitAccess: true } });
  return { userId: u.userId, role: m.role, permissions: m.permissions ?? {}, unitAccess: m.unitAccess ?? [] };
}

async function visible(page: Any, sel: string): Promise<number> {
  return page.$$eval(sel, (els: Any[]) => els.filter((e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== "hidden").length);
}

async function shot(page: Any, name: string) {
  if (!OUT) return;
  for (const [w, h, tag] of [[1440, 900, "1440"], [390, 844, "390"]] as const) {
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    await new Promise((r) => setTimeout(r, 350));
    await page.screenshot({ path: `${OUT}/${name}-${tag}.png`, fullPage: true });
  }
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
}

async function open(page: Any, url: string): Promise<number> {
  const r = await page.goto(url, { waitUntil: "networkidle2", timeout: 45_000 });
  await new Promise((res) => setTimeout(res, 400));
  return r?.status() ?? 0;
}

/** status of a same-origin GET made by this persona's browser (the link's real target) */
async function statusOf(page: Any, href: string): Promise<number> {
  return page.evaluate(async (u: string) => (await fetch(u, { credentials: "include", redirect: "manual" })).status, href);
}

try {
  for (const role of ROLES) {
    const actor = await actorOf(role);
    const can = (...keys: string[]) => keys.every((k) => crmCan(actor, k));
    const any = (...keys: string[]) => keys.some((k) => crmCan(actor, k));
    const cookies = minter.withTenant(await minter.staff(env.users[role].userId), env.tenantId);
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await page.evaluateOnNewDocument("window.__name = function (f) { return f; };");
    await page.setCookie(...cookies);
    const owner = role === "owner";
    // expectation helper: leak = visible without the key · owner must see it (positive control) when `mustForOwner`
    const expect = async (id: string, sel: string, allowed: boolean, mustForOwner = true) => {
      const n = await visible(page, sel);
      if (!allowed) chk(`${id}[${role}]`, n === 0, `${sel} hidden without the key — visible=${n}`);
      else if (owner && mustForOwner) chk(`${id}[${role}]`, n > 0, `${sel} visible with the key (positive control) — visible=${n}`);
      else console.log(`   · ${id}[${role}] allowed · visible=${n}`);
    };

    // ── B1 + sweep: contacts list ──
    const s1 = await open(page, `${CRM}/contacts`);
    if (s1 === 200) {
      await expect("B1.import", '[data-testid="contacts-import-btn"]', can("crm.contact.import"));
      await expect("B1.export", '[data-testid="contacts-export-btn"]', can("crm.contact.export"));
      await expect("SW.contacts-new", '[data-testid="contacts-new-btn"]', can("crm.contact.create"));
      await expect("SW.contacts-select", '[data-testid="contacts-select-all"]', can("crm.contact.update"));
      await shot(page, `contacts-${role}`);
    } else console.log(`   · /contacts → ${s1} for ${role}`);

    // ── B5 + sweep: contact 360 (a live, visible contact) ──
    const contact = await prisma.crmContact.findFirst({
      where: { systemId: SYS, archivedAt: null, mergedIntoId: null, ownerUserId: role === "owner" || role === "manager" ? env.users.thana.userId : env.users[role].userId },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (contact) {
      const s2 = await open(page, `${CRM}/contacts/${contact.id}`);
      if (s2 === 200) {
        await expect("B5.convert", '[data-testid="contact-convert-btn"]', can("crm.contact.convert"));
        const menuBtn = await visible(page, '[data-testid="contact-menu-btn"]');
        if (menuBtn > 0) {
          await page.click('[data-testid="contact-menu-btn"]');
          await new Promise((r) => setTimeout(r, 250));
          const items = await visible(page, '[data-testid^="contact-menu-"][role="menuitem"]');
          chk(`SW.contact-menu-nonempty[${role}]`, items > 0, `the contact menu, when shown, is not empty — items=${items}`);
          await expect("SW.contact-menu-owner", '[data-testid="contact-menu-owner"]', can("crm.contact.update"));
          await expect("SW.contact-menu-merge", '[data-testid="contact-menu-merge"]', can("crm.contact.merge"));
          await expect("SW.contact-menu-archive", '[data-testid="contact-menu-archive"]', can("crm.contact.delete"));
          await expect("SW.contact-menu-edit", '[data-testid="contact-menu-edit"]', can("crm.contact.update"));
          if (OUT) await shot(page, `contact360-menu-${role}`);
          await page.click('[data-testid="contact-menu-btn"]');
        } else {
          chk(`SW.contact-menu-hidden-ok[${role}]`, !any("crm.contact.update", "crm.contact.merge") , `menu button hidden only when no menu item is allowed`);
        }
        // B2 on the contact page (ActivityPanel) — delete never visible without crm.activity.delete
        await expect("B2.delete@contact", '[data-testid="activity-row-delete"]', can("crm.activity.delete", "crm.activity.create"), false);
        await shot(page, `contact360-${role}`);
      } else console.log(`   · contact 360 → ${s2} for ${role}`);
    }

    // ── B2: activities page ──
    const s3 = await open(page, `${CRM}/activities?scope=team&status=pending`);
    if (s3 === 200) {
      await expect("B2.delete", '[data-testid="activity-row-delete"]', can("crm.activity.delete", "crm.activity.create"));
      await expect("SW.activity-pin", '[data-testid="activity-row-pin"]', can("crm.activity.create"), false);
      await expect("SW.activity-reschedule", '[data-testid="activity-row-reschedule"]', can("crm.activity.create", "crm.activity.complete"), false);
      await shot(page, `activities-${role}`);
    }

    // ── B6: deals table ──
    const s4 = await open(page, `${CRM}/deals?view=table&pipeline=${env.pipelines.b2b.id}`);
    if (s4 === 200) {
      await expect("B6.export", '[data-testid="deal-export-btn"]', can("crm.deal.export"));
      await expect("B6.bulk-move", '[data-testid="deal-bulk-move"]', can("crm.deal.move"));
      await expect("B6.bulk-reassign", '[data-testid="deal-bulk-reassign"]', can("crm.deal.reassign"));
      await expect("B6.bulk-tag", '[data-testid="deal-bulk-tag"]', can("crm.deal.update"));
      await expect("B6.check-all", '[data-testid="deal-check-all"]', any("crm.deal.move", "crm.deal.reassign", "crm.deal.update"));
      await expect("SW.deals-new", '[data-testid="deals-new-btn"]', can("crm.deal.create"));
      await shot(page, `deals-table-${role}`);
    }

    // ── sweep: deal 360 ──
    const deal = await prisma.crmDeal.findFirst({
      where: { systemId: SYS, kind: "OPEN", archivedAt: null, ownerUserId: role === "owner" || role === "manager" ? env.users.thana.userId : env.users[role].userId },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (deal) {
      const s5 = await open(page, `${CRM}/deals/${deal.id}`);
      if (s5 === 200) {
        await expect("SW.ai-next-step", '[data-testid="crm-ai-deal-next-step"]', can("crm.deal.update"));
        await expect("SW.stage-step", '[data-testid^="deal-stage-step-"]', can("crm.deal.move"));
        await expect("SW.lost", '[data-testid="deal-lost-btn"]', can("crm.deal.move"));
        await expect("SW.quote", '[data-testid="deal-quote-btn"]', can("crm.deal.quote"), false);
        await expect("SW.owner-select", '[data-testid="deal-owner-select"]', can("crm.deal.reassign"));
        await expect("SW.forecast-select", '[data-testid="deal-forecast-select"]', can("crm.deal.forecast"));
        await expect("SW.lines-save", '[data-testid="deal-lines-save"]', can("crm.deal.lines"), false);
        if ((await visible(page, '[data-testid="deal-menu"]')) > 0) {
          await page.click('[data-testid="deal-menu"]');
          await new Promise((r) => setTimeout(r, 250));
          await expect("SW.deal-delete", '[data-testid="deal-delete-btn"]', can("crm.deal.delete"));
          await page.click('[data-testid="deal-menu"]');
        }
        await shot(page, `deal360-${role}`);
      }
    }

    // ── B4: parent links of custom-object records (list + record page) must open for this persona ──
    const s6 = await open(page, `${CRM}/objects/contract`);
    if (s6 === 200) {
      const links: string[] = await page.$$eval('[data-testid="object-record-parent-link"]', (els: Any[]) => els.map((e) => e.getAttribute("href")));
      let bad = 0;
      for (const h of [...new Set(links)].slice(0, 12)) if ((await statusOf(page, h)) !== 200) bad++;
      chk(`B4.list[${role}]`, bad === 0, `every visible parent link on /objects/contract opens for ${role} — ${links.length} links · ${bad} not-200`);
      const recs: string[] = await page.$$eval('[data-testid="object-record-link"]', (els: Any[]) => els.map((e) => e.getAttribute("href")));
      await shot(page, `objects-list-${role}`);
      let badRec = 0;
      let seenRec = 0;
      for (const r of recs.slice(0, 4)) {
        if ((await open(page, `${BASE}${r}`)) !== 200) continue;
        const ph: string[] = await page.$$eval('[data-testid="object-record-parent-link"]', (els: Any[]) => els.map((e) => e.getAttribute("href")));
        for (const h of ph) {
          seenRec++;
          if ((await statusOf(page, h)) !== 200) badRec++;
        }
      }
      chk(`B4.record[${role}]`, badRec === 0, `record pages: every visible parent link opens — ${seenRec} links · ${badRec} not-200`);
      if (recs[0]) {
        await open(page, `${BASE}${recs[0]}`);
        await shot(page, `object-record-${role}`);
      }
    }

    // ── B3: notification tabs aria state ──
    const s7 = await open(page, `${CRM}/settings/notifications`);
    if (s7 === 200) {
      const tabs: Any[] = await page.$$eval('[data-testid^="crm-notify-tab-"]', (els: Any[]) =>
        els.map((e) => ({ id: e.getAttribute("data-testid"), role: e.getAttribute("role"), sel: e.getAttribute("aria-selected"), list: e.parentElement?.getAttribute("role") ?? null })),
      );
      const ok = tabs.length > 0 && tabs.every((t) => t.role === "tab" && (t.sel === "true" || t.sel === "false") && t.list === "tablist") && tabs.filter((t) => t.sel === "true").length === 1;
      chk(`B3.tabs[${role}]`, ok, `notification tabs = role=tab + aria-selected (1 selected) in role=tablist — ${JSON.stringify(tabs)}`);
      if (tabs.length > 1) {
        const other = tabs.find((t) => t.sel !== "true");
        if (other) {
          await page.click(`[data-testid="${other.id}"]`);
          await new Promise((r) => setTimeout(r, 400));
          const after = await page.$eval(`[data-testid="${other.id}"]`, (e: Any) => e.getAttribute("aria-selected"));
          chk(`B3.switch[${role}]`, after === "true", `clicking the other tab moves aria-selected to it — got ${after}`);
        }
      }
      await shot(page, `notify-${role}`);
    } else console.log(`   · /settings/notifications → ${s7} for ${role}`);

    await page.close();
  }
} finally {
  const n = await minter.cleanup().catch(() => -1);
  console.log(`   (cleanup: ${n} session rows removed)`);
  await browser.close().catch(() => {});
  lib.cleanupChromiumProfile(process.pid);
  await prisma.$disconnect();
}
console.log(`\nUI gates probe: ${pass} pass · ${fail} fail${reds.length ? ` · RED: ${reds.join(" ")}` : ""}`);
process.exit(fail ? 1 : 0);
