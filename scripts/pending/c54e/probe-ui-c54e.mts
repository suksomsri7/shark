// CRM C5.4-E ▸ UI probe on a production build of THIS worktree (:3219 · QC3) — throwaway shop `qc-c54e-ui-*` (swept in done()) ◂
//   U-M1  deal 360 stepper → stage that requires NUMBER + SELECT + BOOLEAN: the dialog shows typed controls (number input · select
//         with the option LABELS · ใช่/ไม่ใช่) · filling them the way a person would (50000 · "โรงงาน" · ใช่) moves the deal (DB)
//         (adaptive: a text box gets the typed text — that is what the old dialog offered)
//   U-E4  member-linked contact viewed by a STAFF without member.customer.update: consent buttons disabled AND look disabled
//         (computed opacity < 1 · cursor not-allowed) · control: the owner's buttons are not dimmed
//   U-m11 contacts list with a TEAM saved view whose filter field was archived: rows still listed + the "skipped" note names the field
//   U-M5  company 360 after a WON deal: header badge "ลูกค้า" and no "คะแนน 0" badge
//   U-CO  (round 2 ruling 1) OWNER corrects a CUSTOMER company → มีโอกาส from the 360 header
//   U-R5  (round 2 SF-5) a task due earlier today: listed in the today tab and its row is not labelled "เลยกำหนด"
// Run: QC_BASE=http://127.0.0.1:3219 bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/c54e/probe-ui-c54e.mts --shots <name>
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { mkdirSync } from "node:fs";
const BASE = process.env.QC_BASE ?? "http://127.0.0.1:3219";
if (!/127\.0\.0\.1:3219/.test(BASE)) {
  console.error("this probe only targets the c54e server on :3219");
  process.exit(4);
}
const argv = process.argv.slice(2);
const OUT = `.qc-shots/crm/c54e/${argv.includes("--shots") ? argv[argv.indexOf("--shots") + 1] : "ui"}`;
mkdirSync(OUT, { recursive: true });
const { fixture } = (await import("./_fx.mts" as string)) as Any;
const realFetch = globalThis.fetch;
const { P, prisma, TAG, chk, call, mkShop, mkUser, done } = await fixture("ui");
globalThis.fetch = realFetch;
const { sha256 } = (await import("@/lib/core/hash" as string)) as Any;
const lib = (await import("../../crm-journeys/lib.mts" as string)) as Any;
const minter = new lib.SessionMinter(prisma, sha256, BASE, "qc-c54e-ui");
const browser = await lib.launchBrowser(process.pid);
const CRM = (await import("@/lib/modules/crm" as string)) as Any;
const MEMF = (await import("@/lib/modules/member" as string)) as Any;

const pageFor = async (userId: string, tenantId: string) => {
  const bc = await browser.createBrowserContext();
  const page = await bc.newPage();
  page.once("close", () => { bc.close().catch(() => {}); });
  page.setDefaultTimeout(30_000);
  page.on("dialog", async (dlg: Any) => { await dlg.accept().catch(() => {}); });
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument("window.__name = function (f) { return f; };");
  await page.setCookie(...minter.withTenant(await minter.staff(userId), tenantId));
  return page;
};
const go = async (page: Any, url: string): Promise<number> => {
  const r = await page.goto(url, { waitUntil: "networkidle2", timeout: 60_000 });
  await new Promise((res) => setTimeout(res, 500));
  return r?.status() ?? 0;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const shot = async (page: Any, name: string, full = true) => {
  for (const [w, h] of [[1440, 900], [390, 844]] as const) {
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    await sleep(400);
    await page.screenshot({ path: `${OUT}/${name}-${w}.png`, fullPage: full });
  }
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
};
const overflow = async (page: Any): Promise<number> => {
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await sleep(300);
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  return sw as number;
};

try {
  const shop = await mkShop("a");
  const CRMB = `${BASE}/app/sys/${shop.S}/crm`;
  const own = await pageFor(shop.uid, shop.tid);

  // ═══════════ U-M1 · typed controls in the stage-requirements dialog ═══════════
  {
    const fctx = { ...shop.ctx, objectKey: "deal", actor: shop.owner };
    const sec = await MEMF.fields.createSection(fctx, { key: `qcU${TAG.slice(-4)}`, label: "ข้อมูลดีล U" });
    await MEMF.fields.createField(fctx, { sectionId: sec.id, key: "qcAmt", label: "งบประมาณ", type: "NUMBER" });
    await MEMF.fields.createField(fctx, { sectionId: sec.id, key: "qcKind", label: "ประเภทลูกค้า", type: "SELECT", options: { choices: [{ value: "option", label: "โรงงาน" }, { value: "option_2", label: "ร้านค้า" }] } });
    await MEMF.fields.createField(fctx, { sectionId: sec.id, key: "qcVip", label: "ลูกค้าวีไอพี", type: "BOOLEAN" });
    const st = shop.stages.find((s: Any) => s.name === "เสนอราคา");
    await CRM.pipelines.updateStage(shop.ctx, shop.owner, st.id, { requireFields: ["qcAmt", "qcKind", "qcVip"] });
    const k = (await CRM.contacts.createContact(shop.ctx, shop.owner, { firstName: `ลูกค้า U ${TAG}`, phone: "0845556677" })).contact.id as string;
    const d = await CRM.deals.createDeal(shop.ctx, shop.owner, { pipelineId: shop.pipe.id, title: `ดีล U ${TAG}`, contactId: k });
    const s = await go(own, `${CRMB}/deals/${d.id}`);
    await own.click(`[data-testid="deal-stage-step-${st.id}"]`);
    await own.waitForSelector('[data-testid="deal-req-modal"]', { timeout: 15_000 });
    const kinds = await own.$$eval('[data-testid^="deal-req-field-"]', (els: Any[]) => els.map((e) => `${e.getAttribute("data-testid").replace("deal-req-field-", "")}:${e.tagName.toLowerCase()}${e.tagName === "INPUT" ? `[${e.type}]` : ""}`));
    const kindOpts = await own.$eval('[data-testid="deal-req-field-qcKind"]', (e: Any) => (e.tagName === "SELECT" ? [...e.options].map((o: Any) => o.textContent) : [])).catch(() => []);
    await shot(own, "m1-dialog");
    // fill like a person: number / label / yes (a text box gets the text the old dialog asked for)
    const fill = async (key: string, text: string, optLabel?: string) => {
      const tag = await own.$eval(`[data-testid="deal-req-field-${key}"]`, (e: Any) => e.tagName);
      if (tag === "SELECT") {
        const v = await own.$eval(`[data-testid="deal-req-field-${key}"]`, (e: Any, l: string) => [...e.options].find((o: Any) => o.textContent === l)?.value ?? "", optLabel ?? text);
        await own.select(`[data-testid="deal-req-field-${key}"]`, v);
      } else {
        await own.type(`[data-testid="deal-req-field-${key}"]`, text);
      }
    };
    await fill("qcAmt", "50000");
    await fill("qcKind", "โรงงาน");
    await fill("qcVip", "ใช่", "ใช่");
    await own.click('[data-testid="deal-req-submit"]');
    await sleep(2500);
    const err = await own.$eval('[data-testid="deal-req-error"]', (e: Any) => e.textContent).catch(() => null);
    const row = await P.crmDeal.findUnique({ where: { id: d.id }, select: { stageId: true } });
    chk("U-M1", s === 200 && row?.stageId === st.id && kinds.includes("qcAmt:input[number]") && kinds.includes("qcKind:select") && kinds.includes("qcVip:select") && kindOpts.includes("โรงงาน"),
      `status=${s} controls=${JSON.stringify(kinds)} kindOptions=${JSON.stringify(kindOpts)} error=${err} moved=${row?.stageId === st.id}`);
    if (row?.stageId !== st.id) await shot(own, "m1-dialog-after-submit");
  }

  // ═══════════ U-E4 · member-locked consent buttons look disabled ═══════════
  {
    const uid = await mkUser("-nomem");
    await P.membership.create({ data: { userId: uid, tenantId: shop.tid, role: "STAFF", unitAccess: ["*"], permissions: { "crm.contact.read": true, "crm.contact.update": true }, acceptedAt: new Date() } });
    const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
    const MEM = (await sysSvc.createSystem(shop.tid, "MEMBER", `สมาชิก ${TAG}`)).id as string;
    const cust = await P.customer.create({ data: { tenantId: shop.tid, memberSystemId: MEM, name: `สมาชิก ${TAG}`, phone: "0812345678" } });
    const k2 = (await CRM.contacts.createContact(shop.ctx, shop.owner, { firstName: `ผูกสมาชิก ${TAG}`, phone: "081-234-5678", ownerUserId: uid })).contact.id as string;
    await P.crmContact.update({ where: { id: k2 }, data: { memberCustomerId: cust.id } });
    const pp = await pageFor(uid, shop.tid);
    const s = await go(pp, `${CRMB}/contacts/${k2}`);
    const look = async (page: Any) => page.$$eval('[data-testid="contact-consent-grant"], [data-testid="contact-consent-revoke"]', (bs: Any[]) => bs.map((b) => ({ d: b.disabled, o: Number(getComputedStyle(b).opacity), c: getComputedStyle(b).cursor })));
    const staffLook = await look(pp);
    for (const [w, h] of [[1440, 900], [390, 844]] as const) {
      await pp.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
      await sleep(400);
      const el = await pp.$('[data-testid="contact-consent"]');
      await el?.screenshot({ path: `${OUT}/e4-consent-locked-${w}.png` });
    }
    await pp.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await go(own, `${CRMB}/contacts/${k2}`);
    const ownerLook = await look(own);
    chk("U-E4", s === 200 && staffLook.length > 0 && staffLook.every((x: Any) => x.d && x.o < 1 && x.c === "not-allowed") && ownerLook.some((x: Any) => !x.d && x.o === 1),
      `status=${s} staff=${JSON.stringify(staffLook)} owner(control)=${JSON.stringify(ownerLook)} · 390 scrollWidth=${await overflow(pp)}`);
    await pp.close();
  }

  // ═══════════ U-m11 · saved view after its filter field was archived ═══════════
  {
    const cf = { ...shop.ctx, objectKey: "contact", actor: shop.owner };
    const sec = await MEMF.fields.createSection(cf, { key: `qcV${TAG.slice(-4)}`, label: "กลุ่ม" });
    const fld = await MEMF.fields.createField(cf, { sectionId: sec.id, key: "qcSeg", label: "กลุ่มลูกค้า", type: "TEXT", filterable: true });
    const k = (await CRM.contacts.createContact(shop.ctx, shop.owner, { firstName: `ในมุมมอง ${TAG}`, phone: "0856667788" })).contact.id as string;
    await MEMF.fields.setFieldValues(cf, k, { qcSeg: "vip" }, { via: "STAFF", byUserId: shop.uid });
    const tv = await P.team.create({ data: { tenantId: shop.tid, name: `ทีม ${TAG}` } });
    const v = await CRM.views.createView(shop.ctx, shop.owner, { objectKey: "contact", name: `VIP ${TAG}`, scope: "TEAM", teamId: tv.id, filters: { f: { qcSeg: "vip" } } });
    await MEMF.fields.archiveField(cf, fld.id);
    const s = await go(own, `${CRMB}/contacts?view=${v.id}`);
    const note = await own.$eval('[data-testid="contacts-view-skipped"]', (e: Any) => e.textContent).catch(() => null);
    const err = await own.$eval('[data-testid="contacts-list-error"]', (e: Any) => e.textContent).catch(() => null);
    const listed = await own.evaluate((name: string) => document.body.innerText.includes(name), `ในมุมมอง ${TAG}`);
    await shot(own, "m11-view-skipped");
    chk("U-m11", s === 200 && !err && listed && !!note && note.includes("กลุ่มลูกค้า"), `status=${s} error=${err} listed=${listed} note=${note} · 390 scrollWidth=${await overflow(own)}`);
  }

  // ═══════════ U-M5 · company header after a WON deal ═══════════
  {
    const co = (await CRM.companies.createCompany(shop.ctx, shop.owner, { name: `บริษัทชนะ ${TAG}` })).company.id as string;
    const k = (await CRM.contacts.createContact(shop.ctx, shop.owner, { firstName: `ผู้ซื้อ ${TAG}`, phone: "0867778899" })).contact.id as string;
    await CRM.companies.addContact(shop.ctx, shop.owner, co, { contactId: k, isPrimary: true });
    const d = await CRM.deals.createDeal(shop.ctx, shop.owner, { pipelineId: shop.pipe.id, title: `ดีลบริษัท ${TAG}`, contactId: k, companyId: co, valueSatang: 5_000_000 });
    const won = shop.stages.find((s: Any) => s.kind === "WON");
    const mv = await call(() => CRM.deals.moveDeal(shop.ctx, shop.owner, d.id, { stageId: won.id }));
    const s = await go(own, `${CRMB}/companies/${co}`);
    const head = await own.$eval('[data-testid="company-360"]', (e: Any) => e.innerText.slice(0, 400));
    await shot(own, "m5-company-won", false);
    chk("U-M5", mv.ok && s === 200 && head.includes("ลูกค้า") && !/คะแนน\s*0/.test(head), `move=${mv.ok} status=${s} header=${JSON.stringify(head.split("\n").slice(0, 6))}`);
  }

  // ═══════════ U-CO · round 2 ruling (1): OWNER corrects a CUSTOMER company back to "มีโอกาส" ═══════════
  {
    const co = (await CRM.companies.createCompany(shop.ctx, shop.owner, { name: `บริษัทแก้ขั้น ${TAG}` })).company.id as string;
    await P.crmCompany.update({ where: { id: co }, data: { lifecycleStage: "CUSTOMER" } });
    const s = await go(own, `${CRMB}/companies/${co}`);
    const btn = await own.$('[data-testid="company-lifecycle-correct"]');
    if (btn) {
      await btn.click();
      await own.waitForSelector('[data-testid="company-lifecycle-correct-confirm"]', { timeout: 10_000 }).catch(() => null);
      await shot(own, "co-correct-sheet", false);
      await own.click('[data-testid="company-lifecycle-correct-confirm"]').catch(() => undefined);
      await sleep(2500);
    }
    const row = await P.crmCompany.findUnique({ where: { id: co }, select: { lifecycleStage: true } });
    chk("U-CO", s === 200 && !!btn && row?.lifecycleStage === "PROSPECT", `status=${s} button=${!!btn} stage=${row?.lifecycleStage}`);
  }

  // ═══════════ U-R5 · review SF-5: a task due earlier TODAY is in the "today" tab and its row is not labelled "เลยกำหนด" ═══════════
  {
    const nowMs = Date.now();
    const dayStart = Math.floor((nowMs + 7 * 3_600_000) / 86_400_000) * 86_400_000 - 7 * 3_600_000;
    const k = (await CRM.contacts.createContact(shop.ctx, shop.owner, { firstName: `งานเช้า ${TAG}`, phone: "0878889900" })).contact.id as string;
    const title = `โทรเช้านี้ ${TAG}`;
    await P.crmActivity.create({ data: { tenantId: shop.tid, systemId: shop.S, type: "TASK", title, ownerUserId: shop.uid, contactId: k, dueAt: new Date(dayStart + 60_000) } });
    const s = await go(own, `${CRMB}/activities?status=today`);
    const rowText = await own.$$eval('[data-testid="activity-row"]', (els: Any[], t: string) => els.map((e) => e.innerText).find((x: string) => x.includes(t)) ?? null, title);
    await shot(own, "r5-activities-today", false);
    chk("U-R5", s === 200 && nowMs - dayStart > 120_000 && !!rowText && !rowText.includes("เลยกำหนด"), `status=${s} row=${JSON.stringify(rowText)}`);
  }
  await own.close();
} catch (e) {
  chk("FATAL", false, e instanceof Error ? `${e.message}\n${e.stack}` : String(e));
} finally {
  await browser.close().catch(() => {});
  await done("probe-ui-c54e");
}
