// C4.4-fix item 1 through the REAL UI on :3218 (QC3, throwaway tenant): convert modal — bad taxId ⇒ calm inline message,
//   nothing written · valid taxId + role ⇒ CrmCompany.taxId + link role DECISION_MAKER (default) · swept by the fixture
// Run: QC_BASE=http://127.0.0.1:3218 bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/c44f/ui-convert-taxid.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
const BASE = process.env.QC_BASE ?? "http://127.0.0.1:3218";
const { fixture, validTaxId } = (await import("./_fx.mts" as string)) as Any;
const realFetch = globalThis.fetch;
const { P, prisma, TAG, chk, mkShop, done } = await fixture("ui");
globalThis.fetch = realFetch;
const { sha256 } = (await import("@/lib/core/hash")) as Any;
const lib = (await import("../../crm-journeys/lib.mts" as string)) as Any;
const minter = new lib.SessionMinter(prisma, sha256, BASE, "qc-c44f-ui");
const browser = await lib.launchBrowser(process.pid);
try {
  const CRM = (await import("@/lib/modules/crm" as string)) as Any;
  const shop = await mkShop("a");
  const k = (await CRM.contacts.createContact(shop.ctx, shop.owner, { firstName: `ลีด UI ${TAG}`, phone: `08${Math.floor(10_000_000 + Math.random() * 89_999_999)}`, ownerUserId: shop.uid })).contact;
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.evaluateOnNewDocument("window.__name = function (f) { return f; };");
  await page.setCookie(...minter.withTenant(await minter.staff(shop.uid), shop.tid));
  const open = async (contactId: string, w = 1440) => {
    await page.setViewport(w < 500 ? { width: w, height: 844, isMobile: true, hasTouch: true } : { width: w, height: 900 });
    await page.goto(`${BASE}/app/sys/${shop.S}/crm/contacts/${contactId}`, { waitUntil: "networkidle2", timeout: 60_000 });
    await page.click("[data-testid=contact-convert-btn]");
    await page.waitForSelector("[data-testid=contact-convert-company-taxid]", { timeout: 15_000 });
    await page.click("[data-testid=contact-convert-member]"); // no member system in this shop — untick
    await page.click("[data-testid=contact-convert-deal]"); // untick deal (company only)
    await page.click("[data-testid=contact-convert-company-name]", { clickCount: 3 });
    await page.keyboard.type(`บริษัท UI ${TAG}`);
  };
  // S3 · bad checksum ⇒ message UNDER the taxId field (not the generic box), 1440 + 390
  for (const w of [1440, 390]) {
    await open(k.id, w);
    await page.type("[data-testid=contact-convert-company-taxid]", "0105561000004");
    await page.click("[data-testid=contact-convert-submit]");
    await page.waitForSelector("[data-testid=contact-convert-company-taxid-error]", { timeout: 10_000 });
    const err = await page.$eval("[data-testid=contact-convert-company-taxid-error]", (e: Any) => e.textContent);
    const box = await page.$("[data-testid=contact-convert-error]");
    const described = await page.$eval("[data-testid=contact-convert-company-taxid]", (e: Any) => e.getAttribute("aria-invalid"));
    const modal = await page.$("[data-testid=contact-convert-modal]");
    await (modal ?? page).screenshot({ path: `.qc-shots/crm/c44f/contact-convert-bad-taxid-${w}.png` });
    const n0 = await P.crmCompany.count({ where: { tenantId: shop.tid } });
    chk(`ui1.1-${w}`, /เลขตรวจสอบ/.test(String(err)) && !box && described === "true" && n0 === 0, `bad checksum ⇒ under-field "${err}" · generic box shown=${!!box} · aria-invalid=${described} · companies=${n0}`);
  }
  // server-side field error also lands under the field: hidden-by-tax is not testable as owner, so use a server-only bad value
  //   (client accepts "0105561000004"? no — same checker) ⇒ covered by probe-7 (service) + the client path above
  const tax = validTaxId(`0105${Date.now()}`.slice(0, 12));
  await page.click("[data-testid=contact-convert-company-taxid]", { clickCount: 3 });
  await page.keyboard.type(tax);
  const role = await page.$eval("[data-testid=contact-convert-company-role]", (e: Any) => e.value);
  await page.click("[data-testid=contact-convert-submit]");
  await page.waitForFunction(() => !document.querySelector("[data-testid=contact-convert-modal]"), { timeout: 20_000 }).catch(() => undefined);
  const co = await lib.pollUntil(() => P.crmCompany.findFirst({ where: { tenantId: shop.tid, taxId: tax }, select: { id: true, name: true } }), { timeoutMs: 10_000 });
  const link = co ? await P.crmCompanyContact.findFirst({ where: { companyId: co.id, contactId: k.id }, select: { role: true } }) : null;
  chk("ui1.2", !!co && link?.role === "DECISION_MAKER" && role === "DECISION_MAKER", `valid taxId typed + default role ⇒ company.taxId=${tax} link.role=${link?.role} (select default ${role})`);
  // S2 · second lead types the SAME taxId with another name ⇒ reused, the modal names the existing company
  const k2 = (await CRM.contacts.createContact(shop.ctx, shop.owner, { firstName: `ลีด UI2 ${TAG}`, phone: `08${Math.floor(10_000_000 + Math.random() * 89_999_999)}`, ownerUserId: shop.uid })).contact;
  await open(k2.id, 1440);
  await page.click("[data-testid=contact-convert-company-name]", { clickCount: 3 });
  await page.keyboard.type(`ชื่ออื่น ${TAG}`);
  await page.type("[data-testid=contact-convert-company-taxid]", tax);
  await page.click("[data-testid=contact-convert-submit]");
  await page.waitForSelector("[data-testid=contact-convert-reused]", { timeout: 20_000 });
  const note = await page.$eval("[data-testid=contact-convert-reused]", (e: Any) => e.textContent);
  const modal2 = await page.$("[data-testid=contact-convert-modal]");
  await (modal2 ?? page).screenshot({ path: ".qc-shots/crm/c44f/contact-convert-reused-1440.png" });
  await page.click("[data-testid=contact-convert-done]");
  await page.waitForFunction(() => !document.querySelector("[data-testid=contact-convert-modal]"), { timeout: 10_000 }).catch(() => undefined);
  const gone = !(await page.$("[data-testid=contact-convert-modal]"));
  const link2 = co ? await P.crmCompanyContact.findFirst({ where: { companyId: co.id, contactId: k2.id }, select: { id: true } }) : null;
  const nCo = await P.crmCompany.count({ where: { tenantId: shop.tid, taxId: tax } });
  chk("ui1.3", !!co && String(note).includes(co.name) && !!link2 && nCo === 1 && gone, `same taxId, another name ⇒ notice "${note}" · linked to the existing company · rows=${nCo} · closed=${gone}`);
  await page.close();
} catch (e) {
  chk("FATAL", false, e instanceof Error ? `${e.message}\n${e.stack}` : String(e));
} finally {
  await browser.close().catch(() => undefined);
  lib.cleanupChromiumProfile(process.pid);
  await minter.cleanup().catch(() => undefined);
  await done("ui-convert-taxid");
}
