// ถ่ายภาพหน้าจอจริงของงาน T4.1 / T4.2 / T4.3 / T4.6 (เลน 2) — เดสก์ท็อป 1440×900 + มือถือ 390×844 · deviceScaleFactor 1 · ใบพิมพ์ PDF → PNG
//
// ใช้ (ต้องมีเซิร์ฟเวอร์ production build ที่ QC_BASE ก่อน):
//   QC_BASE=http://127.0.0.1:3217 bash scripts/iso.sh pnpm exec tsx scripts/shot-acc-t4a.mts
// 🔴 ข้อมูลประกอบภาพอยู่ใน "ร้านแยก" (QC T4 จอ) — ไม่แตะสมุด QC ที่ seed ไว้ · ลบร้านทิ้งตอนจบ (KEEP=1 = เก็บไว้ดูต่อ)
// 🔴 session ที่ mint ลบทิ้งเสมอ · ชื่อไฟล์ไม่ขึ้นต้นด้วย qc- (ต้องมี build + เซิร์ฟเวอร์ + chromium)
import { mkdirSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => unknown };
accEnv.loadQcEnv();
const BASE = process.env.QC_BASE ?? "http://127.0.0.1:3217";
const OUT = ".qc-shots/acc-v2/t4a";
mkdirSync(OUT, { recursive: true });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const KEEP = process.env.KEEP === "1";
const F: Any = await import("./qc-acc-v2-wht-fixture.mts" as string);
const { sha256 } = await import("@/lib/core/hash");
const GL: Any = await import("@/lib/modules/account/gl" as string);
const AS: Any = await import("@/lib/modules/account/asset" as string);
const PO: Any = await import("@/lib/modules/account/policy" as string);
const acc: Any = await import("@/lib/modules/account/service" as string);

const S = await F.setupWhtShop("QC T4 จอ", "qc-t4-shot");
const prisma = S.prisma;
const SYS: string = S.SYS;
const base = `/app/sys/${SYS}/account`;
const D = (s: string) => new Date(`${s}T12:00:00+07:00`);
const results: string[] = [];

// ── ข้อมูลประกอบภาพ ──
const led = await prisma.accountLedger.findMany({ where: { systemId: SYS, code: { in: ["6900", "6100", "2140", "1000", "1110", "2100"] } }, select: { id: true, code: true } });
const exp1 = led.find((l: Any) => l.code === "6900").id;
const other = (led.find((l: Any) => l.code.startsWith("21")) ?? led.find((l: Any) => l.code !== "6900")).id;
for (let i = 1; i <= 46; i++) {
  await GL.postManualJV(S.ctx, { date: D(`2026-10-${String(1 + (i % 28)).padStart(2, "0")}`), memo: `ค่าใช้จ่ายเบ็ดเตล็ด ${i}`, book: i % 3 === 0 ? "PAYMENTS" : "GENERAL", postedById: S.owner.id, lines: [{ accountId: exp1, debit: 10_000 + i * 100, credit: 0 }, { accountId: other, debit: 0, credit: 10_000 + i * 100, note: `ค้างจ่าย ${i}` }] });
}
const JV: Any = await import("@/lib/modules/account/journal-v2" as string);
const LG: Any = await import("@/lib/modules/account/legal-gate" as string);
const jvUn = await LG.withScreenLegal({ codes: ["JV_DESCRIPTION_MISSING"], actorId: S.owner.id, via: "qc-shot" }, () => JV.createManualEntry(S.ctx, { dateKey: "2026-10-02", memo: "", lines: [{ accountId: exp1, debit: 250_000, credit: 0 }, { accountId: other, debit: 0, credit: 250_000 }], postedById: S.owner.id }));
const iv = async (contactId: string, d: string, amt: number) => {
  const x = await acc.createDocument({ tenantId: S.tid, systemId: SYS, docType: "INVOICE", contactId, issueDate: D(d), vatMode: "NONE", lines: [{ description: "ทริปดำน้ำ", qty: 1, unitPrice: amt, vatRateBp: 0 }], createdById: S.owner.id });
  await acc.issueDocument(S.tid, SYS, x.id, { ack: { codes: ["SALE_WITHOUT_VAT_REGISTERED"], actorId: S.owner.id, via: "qc-shot" } });
  return x.id as string;
};
const custB = await acc.createContact({ tenantId: S.tid, systemId: SYS, kind: "CUSTOMER", legalType: "PERSON", name: "คุณมาลี ทะเลงาม", address: "8 ถ.ชายหาด" });
const ivA = await iv(S.cust.id, "2026-10-05", 4_500_000);
await iv(custB.id, "2026-10-12", 1_800_000);
await acc.recordPayment(S.tid, SYS, ivA, { paidAt: D("2026-10-20"), channel: "TRANSFER", financeAccountId: S.bank.id, amount: 2_000_000, createdById: S.owner.id, idempotencyKey: `t4shot-${S.tid}` });
await S.payVendor({ vendorId: S.vJur.id, ym: "2026-10", d: 8, base: 3_000_000, wht: 90_000, rateBp: 300, incomeType: "M40_8", key: "t4shot-ap" });
const assetAcc = (await AS.listAssetAccounts(S.ctx))[0];
const accumAcc = (await AS.listAccumAccounts(S.ctx))[0];
const expAcc = (await AS.listExpenseAccounts(S.ctx)).find((l: Any) => l.code === "6800") ?? (await AS.listExpenseAccounts(S.ctx))[0];
const reg = (o: Any) => AS.registerAsset(S.ctx, { category: "ยานพาหนะ", acquiredDate: D(o.start), startDepDate: D(o.start), salvageValue: 100, assetAccountId: assetAcc.id, accumAccountId: accumAcc.id, expenseAccountId: expAcc.id, ...o });
const car = await reg({ name: "รถตู้รับส่งนักดำน้ำ", start: "2026-03-16", cost: 150_000_000, usefulLifeMonths: 36, taxClass: "PASSENGER_CAR" });
const land = await reg({ name: "ที่ดินท่าเรือราไวย์", start: "2026-03-05", cost: 800_000_000, usefulLifeMonths: 600, taxClass: "LAND", category: "ที่ดิน" });
for (const p of ["2026-03", "2026-04", "2026-05"]) await AS.runDepreciation(S.ctx, p);
await PO.savePolicy(S.ctx, { booksStartDate: D("2026-03-16") });
console.log("fixtures ok", { jvUn: jvUn.entryId, car: car.id, land: land.id });

// ── เบราว์เซอร์ ──
const UA = "qc-shot-t4a";
const token = "t4a" + Math.random().toString(36).slice(2) + Date.now().toString(36);
const ttl = new Date(Date.now() + 60 * 60 * 1000);
await prisma.session.create({ data: { userId: S.owner.id, tokenHash: sha256(token), userAgent: UA, idleExpiresAt: ttl, expiresAt: ttl } });
const host = new URL(BASE).hostname;
const cookies = [
  { name: "shark_session", value: token, domain: host, path: "/" },
  { name: "shark_tenant", value: S.tid, domain: host, path: "/" },
];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
try {
  const pptr = await import("/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js" as string);
  const browser = await pptr.default.launch({ executablePath: "/usr/bin/chromium-browser", args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", `--user-data-dir=/tmp/chr-t4a-${process.pid}`] });
  const open = async (w: number, h: number) => {
    const page = await browser.newPage();
    await page.evaluateOnNewDocument("window.__name = window.__name || ((f) => f);");
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    await page.setCookie(...cookies);
    return page;
  };
  const DEV = [["desktop", 1440, 900], ["mobile", 390, 844]] as const;
  const shot = async (name: string, path: string, opts: { act?: (page: Any) => Promise<void>; full?: boolean; desktopOnly?: boolean; pdf?: boolean } = {}) => {
    for (const [dev, w, h] of opts.desktopOnly ? [DEV[0]] : DEV) {
      const page = await open(w, h);
      try {
        await page.goto(BASE + path, { waitUntil: "networkidle2", timeout: 90_000 });
        if (opts.act) await opts.act(page);
        await sleep(500);
        await page.screenshot({ path: `${OUT}/${name}-${dev}.png`, fullPage: opts.full ?? true });
        results.push(`ok ${name}-${dev} ${page.url().replace(BASE, "")}`);
        if (opts.pdf && dev === "desktop") {
          await page.pdf({ path: `${OUT}/${name}.pdf`, format: "A4", printBackground: true, margin: { top: "12mm", bottom: "12mm", left: "10mm", right: "10mm" } });
          execFileSync("pdftoppm", ["-png", "-r", "60", `${OUT}/${name}.pdf`, `${OUT}/${name}-print`]);
          results.push(`pdf ${name}: ${readdirSync(OUT).filter((f) => f.startsWith(`${name}-print`)).length} หน้า`);
        }
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
    await page.type(sel, text, { delay: 20 });
    await page.keyboard.press("Tab");
    await sleep(500);
  };
  const scrollTo = (sel: string) => async (page: Any) => {
    await page.waitForSelector(sel, { timeout: 20_000 });
    await page.$eval(sel, (el: Any) => el.scrollIntoView({ block: "start" }));
    await sleep(300);
  };
  const setDate = (sel: string, ymd: string) => async (page: Any) => {
    await page.waitForSelector(sel, { timeout: 20_000 });
    await page.$eval(sel, (el: Any) => el.scrollIntoView({ block: "center" }));
    await page.click(sel);
    await sleep(300);
    const [y, m, d] = ymd.split("-");
    await page.type(sel, `${m}${d}${y}`, { delay: 40 }); // ช่อง type=date ของ Chromium (en-US: mm dd yyyy)
    await page.keyboard.press("Escape");
    await page.keyboard.press("Tab");
    await sleep(600);
  };

  // ═══ T4.1 ฟอร์ม JV ═══
  await shot("t41-jv-modal-empty", `${base}/journal?new=1`, { act: scrollTo('[data-testid="jv-legal-warnings"]'), full: false });
  const accOpt = async (page: Any, i: number, code: string) => {
    const v = await page.$eval(`[data-testid="jv-account-${i}"]`, (el: Any, c: string) => ([...el.options].find((o: Any) => o.value && o.textContent.trim().startsWith(c)) ?? [...el.options].find((o: Any) => o.value && o.textContent.trim().startsWith(c[0])))?.value ?? "", code);
    results.push(`jv account ${i} ${code} → ${v ? "ok" : "MISSING"}`);
    await page.select(`[data-testid="jv-account-${i}"]`, v);
  };
  const fillJv = seq(
    async (p: Any) => {
      await p.waitForSelector('[data-testid="jv-account-0"]', { timeout: 25_000 });
      await accOpt(p, 0, "6900");
      await accOpt(p, 1, "2140");
    },
    typeInto('[data-testid="jv-debit-0"]', "1500"),
    typeInto('[data-testid="jv-credit-1"]', "1500"),
  );
  await shot("t41-jv-modal-late-date", `${base}/journal?new=1`, { act: seq(fillJv, setDate('[data-testid="jv-date"]', "2026-09-01"), scrollTo('[data-testid="jv-legal-warnings"]')), full: false });
  await shot("t41-jv-modal-memo-filled", `${base}/journal?new=1`, { act: seq(fillJv, typeInto('[data-testid="jv-memo"]', "ตั้งค่าเช่าค้างจ่าย ต.ค."), scrollTo('[data-testid="jv-balance-bar"]')), full: false });
  // ส่งจริง: ไม่มีคำอธิบาย → ต้องติ๊ก → อนุมัติ → ไปหน้ารายละเอียด
  {
    const page = await open(1440, 900);
    try {
      await page.goto(`${BASE}${base}/journal?new=1`, { waitUntil: "networkidle2", timeout: 90_000 });
      await fillJv(page);
      const disabled = await page.$eval('[data-testid="jv-submit"]', (b: Any) => b.disabled);
      results.push(`jv submit disabled before ack? ${disabled}`);
      await click('[data-testid="jv-legal-warnings-ack"]')(page);
      await page.click('[data-testid="jv-submit"]');
      await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60_000 }).catch(() => {});
      await sleep(1200);
      await page.screenshot({ path: `${OUT}/t41-jv-saved-detail-desktop.png`, fullPage: true });
      results.push(`ok t41 submit → ${page.url().replace(BASE, "")} · approved text: ${await page.$eval('[data-testid="jv-detail-recorded"]', (e: Any) => e.textContent).catch(() => "-")}`);
    } catch (e) {
      results.push(`FAIL t41 submit: ${String(e).slice(0, 220)}`);
    } finally {
      await page.close();
    }
  }
  await shot("t41-jv-detail-unapproved", `${base}/journal/${jvUn.entryId}`);
  {
    const page = await open(1440, 900);
    try {
      await page.goto(`${BASE}${base}/journal/${jvUn.entryId}`, { waitUntil: "networkidle2", timeout: 90_000 });
      await click('[data-testid="jv-approve-trigger"]')(page);
      await page.screenshot({ path: `${OUT}/t41-jv-approve-confirm-desktop.png`, fullPage: false });
      await page.click('[data-testid="jv-approve-sheet"] button[type="submit"]');
      await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60_000 }).catch(() => {});
      await sleep(1000);
      await page.screenshot({ path: `${OUT}/t41-jv-approved-desktop.png`, fullPage: true });
      results.push(`ok t41 approve → ${await page.$eval('[data-testid="jv-detail-approved"]', (e: Any) => e.textContent).catch(() => "NO APPROVED TEXT")}`);
    } catch (e) {
      results.push(`FAIL t41 approve: ${String(e).slice(0, 220)}`);
    } finally {
      await page.close();
    }
  }

  // ═══ T4.2 สมุดบัญชี ═══
  await shot("t42-journal-book", `${base}/journal/print?tab=ALL&from=2026-10-01&to=2026-10-31`, { pdf: true });
  await shot("t42-journal-book-payments", `${base}/journal/print?tab=PAYMENTS&from=2026-10-01&to=2026-10-31`, { desktopOnly: true, pdf: true });
  await shot("t42-ledger-links", `${base}/ledger?from=2026-10-01&to=2026-10-31`, { full: false });
  await shot("t42-ledger-all", `${base}/ledger/print?from=2026-10-01&to=2026-10-31`, { pdf: true });
  await shot("t42-sub-ar", `${base}/ledger/subsidiary?side=AR&from=2026-10-01&to=2026-10-31`, { pdf: true });
  await shot("t42-sub-ar-detail", `${base}/ledger/subsidiary?side=AR&from=2026-10-01&to=2026-10-31&contact=${S.cust.id}`, { pdf: true });
  await shot("t42-sub-ap", `${base}/ledger/subsidiary?side=AP&from=2026-10-01&to=2026-10-31`, { desktopOnly: true });
  await shot("t42-sub-switch", `${base}/ledger/subsidiary?side=AR&from=2026-10-01&to=2026-10-31`, { act: seq(select('[data-testid="sub-side"]', "AP"), click('[data-testid="sub-apply"]', 2500)), desktopOnly: true });

  // ═══ T4.3 สินทรัพย์ ═══
  await shot("t43-asset-car", `${base}/assets/${car.id}`);
  await shot("t43-asset-land", `${base}/assets/${land.id}`, { desktopOnly: true });
  await shot("t43-asset-register-form", `${base}/assets?add=1`, { act: scrollTo('[data-testid="asset-register-tax-class"]'), full: false });
  await shot("t43-asset-change-class", `${base}/assets/${car.id}`, { act: seq(select('[data-testid="asset-tax-class-select"]', "OTHER"), click('[data-testid="asset-tax-class-save"]', 3000)), desktopOnly: true });
  await shot("t43-dep-preview", `${base}/assets?dep=1&period=2026-06`, { desktopOnly: true });

  // ═══ T4.6 งบ + ปีบัญชี ═══
  await shot("t46-pl", `${base}/reports/profit-loss?from=2026-10&to=2026-10`, { pdf: true });
  await shot("t46-bs", `${base}/reports/balance-sheet?asOf=2026-10`, { desktopOnly: true });
  await shot("t46-tb", `${base}/reports/trial-balance?from=2026-10&to=2026-10`, { desktopOnly: true });
  await shot("t46-cf", `${base}/reports/cash-flow?from=2026-10&to=2026-10`, { desktopOnly: true });
  await shot("t46-policy-fiscal", `${base}/settings/policy?s=fiscal`);
  await shot("t46-policy-fy-change", `${base}/settings/policy?s=fiscal`, { act: seq(select('[data-testid="policy-fy-month"]', "4"), scrollTo('[data-testid="policy-fiscal-warnings"]')), full: false });
  {
    const page = await open(1440, 900);
    try {
      await page.goto(`${BASE}${base}/settings/policy?s=fiscal`, { waitUntil: "networkidle2", timeout: 90_000 });
      await select('[data-testid="policy-fy-month"]', "4")(page);
      await click('[data-testid="policy-save-bottom"]', 3500)(page);
      await page.screenshot({ path: `${OUT}/t46-policy-save-no-ack-desktop.png`, fullPage: false });
      results.push(`policy no-ack msg: ${await page.$eval('[data-testid="policy-msg"]', (e: Any) => e.textContent).catch(() => "-")}`);
      await click('[data-testid="policy-fiscal-warnings-ack"]')(page);
      await click('[data-testid="policy-save-bottom"]', 3500)(page);
      await page.screenshot({ path: `${OUT}/t46-policy-save-acked-desktop.png`, fullPage: false });
      results.push(`policy acked msg: ${await page.$eval('[data-testid="policy-msg"]', (e: Any) => e.textContent).catch(() => "-")} · db month ${(await PO.getPolicy(S.ctx)).fiscalYearStartMonth}`);
    } catch (e) {
      results.push(`FAIL policy save: ${String(e).slice(0, 220)}`);
    } finally {
      await page.close();
    }
  }
  await shot("t46-tax-book-card", `${base}/settings/tax`, { act: scrollTo('[data-testid="legal-card-book"]'), full: false });
  {
    const page = await open(1440, 900);
    try {
      await page.goto(`${BASE}${base}/settings/tax`, { waitUntil: "networkidle2", timeout: 90_000 });
      await click('[data-testid="legal-add-book"]')(page);
      await select('[data-testid="legal-ed-rule"]', "DEP_MAX_RATE_OTHER")(page);
      await typeInto('[data-testid="legal-ed-value"]', "33.34")(page);
      await page.screenshot({ path: `${OUT}/t46-tax-book-editor-desktop.png`, fullPage: false });
      await click('[data-testid="legal-ed-save"]', 3500)(page);
      await scrollTo('[data-testid="legal-card-book"]')(page);
      await page.screenshot({ path: `${OUT}/t46-tax-book-saved-desktop.png`, fullPage: false });
      results.push(`tax book row saved: ${await page.$eval('[data-testid="legal-msg-book"]', (e: Any) => e.textContent).catch(() => "-")}`);
    } catch (e) {
      results.push(`FAIL tax book: ${String(e).slice(0, 220)}`);
    } finally {
      await page.close();
    }
  }
  await shot("t43-asset-car-after-shop-row", `${base}/assets/${car.id}`, { desktopOnly: true, full: false });
  await browser.close();
} finally {
  await prisma.session.deleteMany({ where: { userAgent: UA } });
  console.log(results.join("\n"));
  await F.keepOrPurge(prisma, S.tid, KEEP);
  await prisma.$disconnect();
}
