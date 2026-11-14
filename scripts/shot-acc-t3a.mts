// ถ่ายภาพหน้าจอจริงของงาน T3 เลน 1 (Job A ค้าง A6 + T3.1/T3.2/T3.6/T3.7) — เดสก์ท็อป 1440×900 + มือถือ 390×844 · deviceScaleFactor 1
//
// ใช้ (ต้องมีเซิร์ฟเวอร์ production build ที่ QC_BASE ก่อน):
//   QC_BASE=http://127.0.0.1:3216 bash scripts/iso.sh pnpm exec tsx scripts/shot-acc-t3a.mts
// 🔴 สร้างข้อมูลประกอบภาพในร้าน QC (seed) — reseed ก่อนรันชุดทดสอบเต็ม · session ที่ mint ลบทิ้งเสมอ (userAgent qc-shot-t3a)
// 🔴 ชื่อไฟล์ไม่ขึ้นต้นด้วย qc- (ต้องมี build + เซิร์ฟเวอร์ + chromium)
import { mkdirSync, readFileSync } from "node:fs";
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => unknown; QC: { ownerEmail: string; expectedPath: string } };
accEnv.loadQcEnv();
const BASE = process.env.QC_BASE ?? "http://127.0.0.1:3216";
const OUT = ".qc-shots/acc-v2/t3a";
mkdirSync(OUT, { recursive: true });
const E = JSON.parse(readFileSync(accEnv.QC.expectedPath, "utf8"));
const S: string = E.systemId;
const TID: string = E.tenantId;
const base = `/app/sys/${S}/account`;

const { prisma } = await import("@/lib/core/db");
const { sha256 } = await import("@/lib/core/hash");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const acc = (await import("@/lib/modules/account/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
const exp = (await import("@/lib/modules/account/expense" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
const DS = (await import("@/lib/modules/account/doc-settings" as string)) as Any;
const LV = (await import("@/lib/modules/account/legal-values" as string)) as Any;
const cfg = (await import("@/lib/modules/account/doc-editor-config" as string)) as Any;
const ctx = { tenantId: TID, systemId: S };
const owner = await prisma.user.findUnique({ where: { email: accEnv.QC.ownerEmail }, select: { id: true } });
if (!owner) throw new Error("ไม่พบเจ้าของร้าน QC — รัน seed ก่อน");
const D = (s: string) => new Date(`${s}T05:00:00.000Z`);
const bank = await prisma.accountFinance.findFirst({ where: { systemId: S, type: "BANK", archivedAt: null }, orderBy: { createdAt: "asc" } });
const ack = (codes: string[]) => ({ ack: { codes, actorId: owner.id, via: "qc-shot" } });
const det = (dt: string, id: string) => cfg.editorDetailPath(base, dt, id) as string;
const actor = { role: "OWNER", unitAccess: ["*"], permissions: {}, userId: owner.id };

// ── ข้อมูลประกอบภาพ ──
const vendor = async (name: string, extra: Any = {}) =>
  (await prisma.accountContact.findFirst({ where: { systemId: S, name, archivedAt: null } })) ??
  acc.createContact({ tenantId: TID, systemId: S, kind: "VENDOR", legalType: "COMPANY", name, taxId: null, branchCode: "00000", address: "9 ถ.ผู้ขาย ภูเก็ต", ...extra });
const mkExp = async (contactId: string, lines: Any[], date = "2026-09-20") => {
  const r = await exp.createExpenseDoc({ tenantId: TID, systemId: S, docType: "EXPENSE", contactId, vatMode: "EXCLUDE", issueDate: D(date), dueDate: D("2026-09-30"), lines: lines.map((l: Any) => ({ description: l.description, qty: 1, unitPrice: l.amount, vatRateBp: 700 })), createdById: owner.id });
  const ls = await prisma.accountDocumentLine.findMany({ where: { documentId: r.id }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }], select: { id: true } });
  for (let i = 0; i < ls.length; i++) await prisma.accountDocumentLine.update({ where: { id: ls[i]!.id }, data: { lineKind: lines[i].lineKind ?? null, whtIncomeType: lines[i].whtIncomeType ?? null, whtRateBp: lines[i].whtRateBp ?? null } });
  const i = await exp.issueExpenseDoc(TID, S, r.id, ack(["INPUT_VAT_VENDOR_NO_TAX_ID", "INPUT_VAT_CLAIM_WITHOUT_VENDOR_TAX_ID", "EXPENSE_PAYEE_MISSING"]));
  if (!i.ok) throw new Error(`อนุมัติไม่ได้ ${JSON.stringify(i)}`);
  return r.id as string;
};
await LV.saveBookTax(actor, ctx, { entityKind: "COMPANY", ewhtEnabled: true });
const vAds = await vendor("บริษัท ป้ายโฆษณาอันดามัน จำกัด", { taxId: "0835561000123" });
const vAgent = await vendor("บริษัท แพลตฟอร์มจองทัวร์ จำกัด (ตัวแทนหักภาษี)", { taxId: "0105561000456", whtAgent: true });
const vForeign = await vendor("Coral Media Pte. Ltd.", { country: "SG", taxIdCountry: "SG" });
const eMix = await mkExp(vAds.id, [
  { description: "ค่าโฆษณาป้ายริมถนน ก.ย.", amount: 2_000_000, lineKind: "SERVICE", whtIncomeType: "M40_8", whtRateBp: 200 },
  { description: "โครงเหล็กป้าย (สินค้า)", amount: 500_000, lineKind: "GOODS" },
]);
const eAgent = await mkExp(vAgent.id, [{ description: "ค่าคอมมิชชันจองทัวร์ ก.ย.", amount: 1_000_000 }]);
const eForeign = await mkExp(vForeign.id, [{ description: "Facebook ad management", amount: 1_500_000 }]);
// มัดจำ: คืน (ใบลดหนี้) · ริบ (โหมดใบลดหนี้)
const cust = (await prisma.accountContact.findFirst({ where: { systemId: S, kind: "CUSTOMER", taxId: { not: null }, archivedAt: null }, orderBy: { createdAt: "asc" } }))!;
const mkDep = async (amt: number, date: string, key: string) => {
  const d = await acc.createDocument({ tenantId: TID, systemId: S, docType: "DEPOSIT_RECEIPT", contactId: cust.id, vatMode: "EXCLUDE", issueDate: D(date), dueDate: D(date), lines: [{ description: "มัดจำทริปสิมิลัน", qty: 1, unitPrice: amt, vatRateBp: 700 }], createdById: owner.id });
  await acc.issueDocument(TID, S, d.id, ack(["SALE_WITHOUT_VAT_REGISTERED", "TAX_INVOICE_SELLER_TAX_ID_MISSING"]));
  await acc.recordPayment(TID, S, d.id, { paidAt: D(date), financeAccountId: bank?.id ?? null, channel: "TRANSFER", amount: Math.round(amt * 1.07), createdById: owner.id, idempotencyKey: `shot-t3a-${key}-${Date.now()}` });
  return d.id as string;
};
const depR = await mkDep(1_000_000, "2026-09-11", "r");
await acc.refundDeposit(TID, S, depR, "ลูกค้ายกเลิกทริป", { createdById: owner.id });
const depF = await mkDep(600_000, "2026-09-12", "f");
const curDoc = await DS.getDocSettings(ctx);
await DS.saveDocSettings(ctx, { deposit: { ...(curDoc.deposit ?? {}), forfeit: "CREDIT_NOTE" } });
// ใบเสร็จสำหรับลิงก์สาธารณะ
const rc = await acc.createDocument({ tenantId: TID, systemId: S, docType: "RECEIPT", contactId: null, vatMode: "EXCLUDE", issueDate: D("2026-09-14"), lines: [{ description: "ค่าดำน้ำ 1 วัน", qty: 1, unitPrice: 250_000, vatRateBp: 700, lineKind: "SERVICE" }], createdById: owner.id });
await acc.issueDocument(TID, S, rc.id, ack(["SALE_WITHOUT_VAT_REGISTERED"]));
const link = await acc.ensurePublicTaxInvoiceLink(TID, S, rc.id);
console.log("fixtures ok", { eMix, eAgent, eForeign, depR, depF, link: link.ok });

// ── เบราว์เซอร์ ──
const UA = "qc-shot-t3a";
const token = "t3a" + Math.random().toString(36).slice(2) + Date.now().toString(36);
const ttl = new Date(Date.now() + 60 * 60 * 1000);
await prisma.session.create({ data: { userId: owner.id, tokenHash: sha256(token), userAgent: UA, idleExpiresAt: ttl, expiresAt: ttl } });
const host = new URL(BASE).hostname;
const cookies = [
  { name: "shark_session", value: token, domain: host, path: "/" },
  { name: "shark_tenant", value: TID, domain: host, path: "/" },
];
const results: string[] = [];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
try {
  const pptr = await import("/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js" as string);
  const browser = await pptr.default.launch({ executablePath: "/usr/bin/chromium-browser", args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", `--user-data-dir=/tmp/chr-t3a-${process.pid}`] });
  const open = async (w: number, h: number, withCookies = true) => {
    const page = await browser.newPage();
    await page.evaluateOnNewDocument("window.__name = window.__name || ((f) => f);");
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    if (withCookies) await page.setCookie(...cookies);
    return page;
  };
  const DEV = [["desktop", 1440, 900], ["mobile", 390, 844]] as const;
  const shot = async (name: string, path: string, opts: { act?: (page: Any) => Promise<void>; full?: boolean; desktopOnly?: boolean; anon?: boolean } = {}) => {
    for (const [dev, w, h] of opts.desktopOnly ? [DEV[0]] : DEV) {
      const page = await open(w, h, !opts.anon);
      try {
        await page.goto(BASE + path, { waitUntil: "networkidle2", timeout: 90_000 });
        if (opts.act) await opts.act(page);
        await sleep(500);
        await page.screenshot({ path: `${OUT}/${name}-${dev}.png`, fullPage: opts.full ?? true });
        results.push(`ok ${name}-${dev} ${page.url().replace(BASE, "")}`);
      } catch (e) {
        results.push(`FAIL ${name}-${dev}: ${String(e).slice(0, 220)}`);
        await page.screenshot({ path: `${OUT}/${name}-${dev}-FAIL.png`, fullPage: true }).catch(() => {});
      } finally {
        await page.close();
      }
    }
  };
  const click = (sel: string, wait = 700) => async (page: Any) => {
    await page.waitForSelector(sel, { timeout: 25_000 });
    await page.$eval(sel, (el: Any) => el.scrollIntoView({ block: "center" }));
    await page.click(sel);
    await sleep(wait);
  };
  const seq = (...fs: ((p: Any) => Promise<void>)[]) => async (page: Any) => {
    for (const f of fs) await f(page);
  };
  const select = (sel: string, value: string) => async (page: Any) => {
    await page.waitForSelector(sel, { timeout: 20_000 });
    await page.select(sel, value);
    await sleep(500);
  };
  const typeInto = (sel: string, text: string) => async (page: Any) => {
    await page.waitForSelector(sel, { timeout: 20_000 });
    await page.click(sel, { clickCount: 3 });
    await page.type(sel, text, { delay: 30 });
    await page.keyboard.press("Tab"); // MoneyInput ยืนยันค่าตอนออกจากช่อง
    await sleep(500);
  };
  const scrollTo = (sel: string) => async (page: Any) => {
    await page.waitForSelector(sel, { timeout: 20_000 });
    await page.$eval(sel, (el: Any) => el.scrollIntoView({ block: "start" }));
    await sleep(300);
  };

  // ═══ T3.1/T3.2 แผงบันทึกจ่าย ═══
  const openPay = seq(click('[data-testid="btn-open-payment"]', 2500), click('[data-testid="pay-mode-advanced"]'));
  await shot("t31-pay-panel-wht-on", det("EXPENSE", eMix), { act: seq(openPay, click('[data-testid="pay-wht-toggle-1"] '), scrollTo('[data-testid="pay-box-1"]')), full: false });
  await shot("t31-pay-panel-advertising", det("EXPENSE", eMix), { act: seq(openPay, click('[data-testid="pay-wht-toggle-1"]'), select('[data-testid="pay-wht-type-1"]', "ADVERTISING"), scrollTo('[data-testid="pay-box-1"]')), full: false });
  await shot("t31-pay-panel-rate-changed", det("EXPENSE", eMix), { act: seq(openPay, click('[data-testid="pay-wht-toggle-1"]'), select('[data-testid="pay-wht-type-1"]', "ADVERTISING"), typeInto('[data-testid="pay-wht-rate-1"]', "3"), scrollTo('[data-testid="pay-wht-info-1"]')), full: false });
  await shot("t32-pay-panel-partial", det("EXPENSE", eMix), { act: seq(openPay, click('[data-testid="pay-wht-toggle-1"]'), select('[data-testid="pay-wht-type-1"]', "ADVERTISING"), typeInto('[data-testid="pay-amount-1"]', "10000"), scrollTo('[data-testid="pay-wht-info-1"]')), full: false });
  await shot("t36-pay-panel-grossup", det("EXPENSE", eMix), { act: seq(openPay, click('[data-testid="pay-wht-toggle-1"]'), select('[data-testid="pay-wht-type-1"]', "ADVERTISING"), select('[data-testid="pay-wht-condition-1"]', "PAY_ALWAYS"), scrollTo('[data-testid="pay-wht-info-1"]')), full: false });
  await shot("t37-pay-panel-ewht", det("EXPENSE", eMix), { act: seq(openPay, click('[data-testid="pay-wht-toggle-1"]'), select('[data-testid="pay-wht-type-1"]', "ADVERTISING"), click('[data-testid="pay-wht-ewht-1"]'), typeInto('[data-testid="pay-wht-ewht-ref-1"]', "KB-2609-001"), scrollTo('[data-testid="pay-wht-info-1"]')), full: false });
  {
    const page = await open(1440, 900);
    try {
      await page.goto(BASE + det("EXPENSE", eAgent), { waitUntil: "networkidle2", timeout: 90_000 });
      await openPay(page);
      await page.click('[data-testid="pay-note-1"]');
      await page.type('[data-testid="pay-note-1"]', "งวด ก.ย.", { delay: 30 });
      results.push(`note typed → ${await page.$eval('[data-testid="pay-note-1"]', (e: Any) => e.value)}`);
    } catch (e) { results.push(`FAIL note typing: ${String(e).slice(0, 200)}`); } finally { await page.close(); }
  }
  await shot("t36-pay-panel-agent", det("EXPENSE", eAgent), { act: seq(openPay, click('[data-testid="pay-wht-toggle-1"]'), scrollTo('[data-testid="pay-box-1"]')), full: false });
  await shot("t31-pay-panel-foreign", det("EXPENSE", eForeign), { act: seq(openPay, scrollTo('[data-testid="pay-box-1"]')), full: false });
  // ส่งจริง: ต่างประเทศไม่หัก → คำเตือนต้องยืนยัน → ติ๊ก → บันทึก
  {
    const page = await open(1440, 900);
    try {
      await page.goto(BASE + det("EXPENSE", eForeign), { waitUntil: "networkidle2", timeout: 90_000 });
      await openPay(page);
      await click('[data-testid="btn-record-payments"]', 3000)(page);
      await page.screenshot({ path: `${OUT}/t31-foreign-ack-required-desktop.png`, fullPage: false });
      await click('[data-testid="pay-legal-warnings-ack"]')(page);
      await click('[data-testid="btn-record-payments"]', 4000)(page);
      await page.screenshot({ path: `${OUT}/t31-foreign-saved-desktop.png`, fullPage: false });
      results.push("ok t31-foreign submit");
    } catch (e) { results.push(`FAIL t31-foreign submit: ${String(e).slice(0, 200)}`); } finally { await page.close(); }
  }
  // ส่งจริง: ค่าโฆษณา 2% (ใบผสม) → 50 ทวิ
  {
    const page = await open(1440, 900);
    try {
      await page.goto(BASE + det("EXPENSE", eMix), { waitUntil: "networkidle2", timeout: 90_000 });
      await openPay(page);
      await click('[data-testid="pay-wht-toggle-1"]')(page);
      await select('[data-testid="pay-wht-type-1"]', "ADVERTISING")(page);
      await click('[data-testid="btn-record-payments"]', 4000)(page);
      await page.screenshot({ path: `${OUT}/t32-mix-saved-desktop.png`, fullPage: false });
      results.push("ok t32-mix submit");
    } catch (e) { results.push(`FAIL t32-mix submit: ${String(e).slice(0, 200)}`); } finally { await page.close(); }
  }
  const cert = await prisma.accountDocument.findFirst({ where: { systemId: S, docType: "WHT_CERT", sourceDocId: eMix } });
  results.push(`cert after mix: ${cert ? `${cert.docNo} base ${cert.subTotal} wht ${cert.whtAmount} code ${cert.whtIncomeCode}` : "none"}`);

  // ═══ T3.6 ผู้ติดต่อ: ประเภทผู้รับ + ตัวแทนหักภาษี ═══
  await shot("t36-contact-modal-wht", `${base}/contacts?edit=${vAgent.id}&tab=advanced`, { act: scrollTo('[data-testid="contact-wht-recipient"]'), full: false });
  await shot("t36-contact-modal-wht-click", `${base}/contacts?edit=${vAds.id}&tab=advanced`, { act: seq(scrollTo('[data-testid="contact-wht-recipient"]'), select('[data-testid="contact-wht-recipient"]', "FOREIGN_PE"), click('[data-testid="contact-wht-agent"]')), full: false, desktopOnly: true });
  {
    const page = await open(1440, 900);
    try {
      await page.goto(`${BASE}${base}/contacts?edit=${vAds.id}&tab=advanced`, { waitUntil: "networkidle2", timeout: 90_000 });
      await scrollTo('[data-testid="contact-wht-recipient"]')(page);
      await select('[data-testid="contact-wht-recipient"]', "JURISTIC_TH")(page);
      await click('[data-testid="contact-wht-agent"]')(page);
      const btn = await page.$$('button[type="submit"]');
      await btn[btn.length - 1].click();
      await sleep(3500);
      const c = await prisma.accountContact.findUnique({ where: { id: vAds.id }, select: { whtAgent: true, whtRecipient: true } });
      results.push(`contact save → ${JSON.stringify(c)}`);
      await page.screenshot({ path: `${OUT}/t36-contact-saved-desktop.png`, fullPage: false });
    } catch (e) { results.push(`FAIL contact save: ${String(e).slice(0, 200)}`); } finally { await page.close(); }
  }

  // ═══ T3.6/T3.7 ตั้งค่า › อัตราภาษีและกำหนดยื่น ═══
  await shot("t37-tax-settings", `${base}/settings/tax`, { full: false });
  await shot("t37-tax-settings-cards", `${base}/settings/tax`, { act: scrollTo('[data-testid="upcoming-deadlines"]'), full: false });
  await shot("t37-tax-settings-ewht-off", `${base}/settings/tax`, { act: seq(click('[data-testid="wht-ewht-enabled"]', 2500)), desktopOnly: true });
  await shot("t36-tax-settings-formula", `${base}/settings/tax`, { act: seq(select('[data-testid="wht-grossUpAlways"]', "NET_TIMES_RATE"), sleep.bind(null, 2500) as Any, scrollTo('[data-testid="wht-settings-card"]')), desktopOnly: true, full: false });
  await LV.saveBookTax(actor, ctx, { ewhtEnabled: true, grossUpAlways: "GROSS_UP_CONVERGED" });

  // ═══ A2 ป้ายมัดจำ (รายการ + รายละเอียด) ═══
  await shot("a2-deposit-list", `${cfg.editorListPath(base, "DEPOSIT_RECEIPT")}`);
  await shot("a2-deposit-refunded-detail", det("DEPOSIT_RECEIPT", depR));

  // ═══ A6 ภาพที่ค้าง ═══
  // ริบมัดจำโหมด CREDIT_NOTE: กล่องยืนยัน + ส่งจริง
  await shot("a6-forfeit-cn-dialog", det("DEPOSIT_RECEIPT", depF), { act: click('[data-testid="deposit-forfeit-trigger"]'), full: false });
  {
    const page = await open(1440, 900);
    try {
      await page.goto(BASE + det("DEPOSIT_RECEIPT", depF), { waitUntil: "networkidle2", timeout: 90_000 });
      await click('[data-testid="deposit-forfeit-trigger"]')(page);
      await page.type('[data-testid="deposit-forfeit-reason"]', "ลูกค้าไม่มาตามนัด");
      await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2", timeout: 90_000 }), page.click('[data-testid="deposit-forfeit-sheet"] button[type="submit"]')]);
      await page.screenshot({ path: `${OUT}/a6-forfeit-cn-result-desktop.png`, fullPage: true });
      results.push(`ok a6-forfeit-cn-result ${page.url().replace(BASE, "")}`);
    } catch (e) { results.push(`FAIL a6-forfeit-cn submit: ${String(e).slice(0, 200)}`); } finally { await page.close(); }
  }
  await DS.saveDocSettings(ctx, { deposit: curDoc.deposit });
  // หน้าสาธารณะขอใบกำกับ (ไม่ล็อกอิน)
  if (link.ok) {
    await shot("a6-public-request", `/r/${link.token}`, { anon: true });
    {
      const page = await open(390, 844, false);
      try {
        await page.goto(`${BASE}/r/${link.token}`, { waitUntil: "networkidle2", timeout: 90_000 });
        await click('[data-testid="buyer-kind-company"]')(page);
        await page.type('input[name="name"]', "บริษัท ทดสอบไม่ให้เลข จำกัด");
        await page.type('textarea[name="address"]', "1 ถ.ทดสอบ ภูเก็ต");
        await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2", timeout: 90_000 }), page.click('form button')]);
        await page.screenshot({ path: `${OUT}/a6-public-request-submitted-mobile.png`, fullPage: true });
        results.push(`ok a6-public submitted ${page.url().replace(BASE, "")}`);
      } catch (e) { results.push(`FAIL a6-public submit: ${String(e).slice(0, 200)}`); } finally { await page.close(); }
    }
    const draft = await prisma.accountDocument.findFirst({ where: { systemId: S, docType: "TAX_INVOICE", sourceDocId: rc.id, status: "DRAFT" } });
    if (draft) await shot("a5-public-draft-business-noid", det("TAX_INVOICE", draft.id));
  }
  // บันทึกค่าตั้งพร้อมติ๊กยืนยัน (ปิดใบเสร็จอัตโนมัติ)
  {
    const page = await open(1440, 900);
    try {
      await page.goto(`${BASE}${base}/settings/documents?s=autotax`, { waitUntil: "networkidle2", timeout: 90_000 });
      await click('[data-testid="receipt-auto-field"] button[role="switch"]')(page);
      await click('[data-testid="receipt-auto-off-warning-ack"]')(page);
      await page.screenshot({ path: `${OUT}/a6-settings-ack-ticked-desktop.png`, fullPage: false });
      await click('[data-testid="settings-save"]', 3500)(page);
      await page.screenshot({ path: `${OUT}/a6-settings-ack-saved-desktop.png`, fullPage: false });
      results.push("ok a6-settings-ack saved");
    } catch (e) { results.push(`FAIL a6-settings-ack: ${String(e).slice(0, 200)}`); } finally { await page.close(); }
  }
  const after = await DS.getDocSettings(ctx);
  results.push(`receipt.autoOnPayment after save: ${JSON.stringify(after?.receipt ?? after?.autoReceipt ?? null)}`);
  await browser.close();
} finally {
  await prisma.session.deleteMany({ where: { userAgent: UA } });
  console.log(results.join("\n"));
  await prisma.$disconnect();
}
