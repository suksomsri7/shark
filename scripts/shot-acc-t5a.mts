// ถ่ายภาพหน้าจอจริงของงาน T5 (เลน 2) + Job 0 (ภาพ T4 ที่ยังไม่ได้เปิดดู) — เดสก์ท็อป 1440×900 + มือถือ 390×844 · deviceScaleFactor 1
//
// ใช้ (ต้องมีเซิร์ฟเวอร์ production build ที่ QC_BASE ก่อน):
//   QC_BASE=http://127.0.0.1:3217 bash scripts/iso.sh pnpm exec tsx scripts/shot-acc-t5a.mts
// 🔴 ข้อมูลประกอบภาพอยู่ใน "ร้านแยก" (QC T5 จอ) — ไม่แตะสมุด QC ที่ seed ไว้ · ลบร้านทิ้งตอนจบ (KEEP=1 = เก็บไว้ดูต่อ)
// 🔴 session ที่ mint ลบทิ้งเสมอ · ชื่อไฟล์ไม่ขึ้นต้นด้วย qc- (ต้องมี build + เซิร์ฟเวอร์ + chromium)
import { mkdirSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => unknown };
accEnv.loadQcEnv();
const BASE = process.env.QC_BASE ?? "http://127.0.0.1:3217";
const OUT = ".qc-shots/acc-v2/t5a";
mkdirSync(OUT, { recursive: true });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const KEEP = process.env.KEEP === "1";
const ONLY = process.env.ONLY ?? "";
const F: Any = await import("./qc-acc-v2-wht-fixture.mts" as string);
const { sha256 } = await import("@/lib/core/hash");
const GL: Any = await import("@/lib/modules/account/gl" as string);
const LV: Any = await import("@/lib/modules/account/legal-values" as string);
const BD: Any = await import("@/lib/modules/account/bad-debt" as string);
const acc: Any = await import("@/lib/modules/account/service" as string);
const exp: Any = await import("@/lib/modules/account/expense" as string);
const clock: Any = await import("@/lib/modules/account/clock" as string);

const S = await F.setupWhtShop("QC T5 จอ", "qc-t5-shot");
const prisma = S.prisma;
const SYS: string = S.SYS;
const base = `/app/sys/${SYS}/account`;
const D = (s: string) => new Date(`${s}T12:00:00+07:00`);
const ym = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(clock.accountNow()).slice(0, 7);
const results: string[] = [];

// ── ข้อมูลประกอบภาพ (บริษัท จด VAT · รอบ ม.ค.–ธ.ค.) ──
const L = async (code: string) => (await prisma.accountLedger.findFirstOrThrow({ where: { systemId: SYS, code }, select: { id: true } })).id as string;
const ACK = { codes: ["SALE_WITHOUT_VAT_REGISTERED", "BUYER_TAX_ID_MISSING", "TAX_INVOICE_NOT_VAT_REGISTERED"], actorId: S.owner.id, via: "qc-shot" };
await GL.postManualJV(S.ctx, { date: D("2026-01-05"), memo: "ทุนจดทะเบียนชำระแล้ว", book: "GENERAL", postedById: S.owner.id, lines: [{ accountId: S.bank.ledgerAccountId, debit: 100_000_000, credit: 0 }, { accountId: await L("3000"), debit: 0, credit: 100_000_000 }] });
const inv = async (contactId: string, d: string, lines: Any[], vatMode = "NONE", due?: string) => {
  const x = await acc.createDocument({ tenantId: S.tid, systemId: SYS, docType: "INVOICE", contactId, issueDate: D(d), dueDate: D(due ?? d), vatMode, lines, createdById: S.owner.id });
  const r = await acc.issueDocument(S.tid, SYS, x.id, { ack: ACK });
  if (r.ok === false) throw new Error(`issue ${d}: ${r.reason}`);
  return x.id as string;
};
const svc = (amt: number, rate = 0, desc = "ทริปดำน้ำ") => [{ description: desc, qty: 1, unitPrice: amt, vatRateBp: rate, lineKind: "SERVICE" }];
await inv(S.cust.id, "2026-03-02", svc(200_000_000, 0, "เหมาเรือทั้งฤดู"));
const spend = async (accountId: string, amounts: number[], d: string, key: string, vendorId = S.vJur.id) => {
  const e = await exp.createExpenseDoc({ tenantId: S.tid, systemId: SYS, docType: "EXPENSE", contactId: vendorId, issueDate: D(d), vatMode: "NONE", lines: amounts.map((a, i) => ({ description: `${key} ${i + 1}`, qty: 1, unitPrice: a, vatRateBp: 0, accountId })), createdById: S.owner.id });
  const r = await exp.issueExpenseDoc(S.tid, SYS, e.id);
  if (!r.ok) throw new Error(`${key}: ${r.reason}`);
  return e.id as string;
};
await spend(await L("6930"), [150_000, 150_000, 150_000, 150_000], "2026-04-10", "เลี้ยงรับรองลูกค้า");
await spend(await L("6930"), [300_000], "2026-05-10", "ของขวัญปีใหม่ลูกค้า");
await spend(await L("6985"), [120_000], "2026-06-10", "เงินเพิ่มภาษี");
// ลูกหนี้เลยกำหนด (บริการ 7% · รับครึ่ง) + ลูกหนี้ ต.ค. สำหรับบัญชีย่อย
const custB = await acc.createContact({ tenantId: S.tid, systemId: SYS, kind: "CUSTOMER", legalType: "PERSON", name: "คุณมาลี ทะเลงาม", address: "8 ถ.ชายหาด" });
const ivOver = await inv(S.cust.id, "2026-10-01", svc(1_000_000, 700, "ค่าบริการดำน้ำ (ค้าง)"), "EXCLUDE", "2026-10-15");
await acc.recordPayment(S.tid, SYS, ivOver, { paidAt: D("2026-10-05"), channel: "TRANSFER", financeAccountId: S.bank.id, amount: 535_000, createdById: S.owner.id, idempotencyKey: `t5shot-half-${S.tid}` });
const ivB = await inv(custB.id, "2026-10-12", svc(1_800_000), "NONE", "2026-10-31");
await S.payVendor({ vendorId: S.vJur.id, ym: "2026-10", d: 8, base: 3_000_000, wht: 90_000, rateBp: 300, incomeType: "M40_8", key: "t5shot-ap" });
await BD.setDoubtfulAllowance(S.ctx, { target: 200_000, date: D("2026-10-20"), note: "ลูกหนี้เกิน 90 วัน" });
// เดือนนี้: ใบผสมยกเว้น/7% · ภาษีซื้อ · จ่ายผู้ขายสิงคโปร์ · ใบเสนอราคาจ้างทำของที่ลูกค้ายอมรับ
await inv(S.cust.id, `${ym}-01`, [{ description: "ค่าเช่าห้องพัก (ยกเว้น)", qty: 1, unitPrice: 5_000_000, vatRateBp: -1, lineKind: "SERVICE" }, { description: "ค่าบริการดำน้ำ", qty: 1, unitPrice: 15_000_000, vatRateBp: 700, lineKind: "SERVICE" }], "EXCLUDE");
const vatIn = (await prisma.accountMapping.findFirstOrThrow({ where: { systemId: SYS, key: "VAT_INPUT" }, select: { accountId: true } })).accountId;
await GL.postManualJV(S.ctx, { date: D(`${ym}-01`), memo: "ภาษีซื้อค่าน้ำมันเรือ", book: "GENERAL", postedById: S.owner.id, lines: [{ accountId: vatIn, debit: 70_000, credit: 0 }, { accountId: S.bank.ledgerAccountId, debit: 0, credit: 70_000 }] });
await S.payVendor({ vendorId: S.vForeign.id, ym, d: 1, base: 3_000_000, wht: 0, rateBp: 0, key: "t5shot-sg" });
const q = await acc.createDocument({ tenantId: S.tid, systemId: SYS, docType: "QUOTATION", contactId: S.cust.id, issueDate: D(`${ym}-01`), vatMode: "EXCLUDE", lines: [{ description: "จ้างทำป้ายท่าเรือ", qty: 1, unitPrice: 12_345_600, vatRateBp: 700, lineKind: "SERVICE" }], createdById: S.owner.id });
await acc.issueDocument(S.tid, SYS, q.id, { ack: ACK });
await acc.setQuotationResponse(S.tid, SYS, q.id, true);
// ข้อมูลเดิมก่อน T4.2: บรรทัดลูกหนี้ไม่มีผู้ติดต่อ อ้างใบของคุณมาลี (เพิ่มใบใหม่ ไม่แก้แถวเดิม)
const legacyDoc = await acc.createDocument({ tenantId: S.tid, systemId: SYS, docType: "INVOICE", contactId: custB.id, issueDate: D("2026-10-20"), vatMode: "NONE", lines: svc(700_000, 0, "ค่าเช่าอุปกรณ์ (ข้อมูลเดิม)"), createdById: S.owner.id });
await prisma.accountJournalEntry.create({ data: { tenantId: S.tid, systemId: SYS, docNo: `JV-LEGACY-${S.tid.slice(-6)}`, book: "SALES", journal: "DOC", date: D("2026-10-20"), periodKey: "2026-10", refType: "AccountDocument", refId: legacyDoc.id, memo: "ข้อมูลเดิมก่อนเขียนผู้ติดต่อบนบรรทัด", source: "AUTO", lines: { create: [{ tenantId: S.tid, systemId: SYS, accountId: await L("1100"), debit: 700_000, credit: 0 }, { tenantId: S.tid, systemId: SYS, accountId: await L("4030"), debit: 0, credit: 700_000 }] } } });
console.log("fixtures ok", { ivOver, ivB, q: q.id });

// ── เบราว์เซอร์ ──
const UA = "qc-shot-t5a";
const token = "t5a" + Math.random().toString(36).slice(2) + Date.now().toString(36);
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
  const browser = await pptr.default.launch({ executablePath: "/usr/bin/chromium-browser", args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", `--user-data-dir=/tmp/chr-t5a-${process.pid}`] });
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

  const want = (n: string) => !ONLY || ONLY.split(",").some((x) => n.startsWith(x));

  // ═══ Job 0 — ภาพ T4 ที่ยังไม่ได้เปิดดู (สร้างใหม่หลัง build) ═══
  if (want("j0")) {
    await shot("j0-bs", `${base}/reports/balance-sheet?asOf=2026-10`, { desktopOnly: true });
    await shot("j0-tb", `${base}/reports/trial-balance?from=2026-10&to=2026-10`, { desktopOnly: true });
    await shot("j0-cf", `${base}/reports/cash-flow?from=2026-10&to=2026-10`, { desktopOnly: true });
    await shot("j0-sub-ap", `${base}/ledger/subsidiary?side=AP&from=2026-10-01&to=2026-10-31`, { desktopOnly: true });
    await shot("j0-sub-ar", `${base}/ledger/subsidiary?side=AR&from=2026-10-01&to=2026-10-31`);
    await shot("j0-sub-ar-legacy", `${base}/ledger/subsidiary?side=AR&from=2026-10-01&to=2026-10-31&contact=${custB.id}`, { desktopOnly: true });
    await shot("j0-jv-pristine", `${base}/journal?new=1`, { full: false });
    const accOpt = async (page: Any, i: number, code: string) => {
      const v = await page.$eval(`[data-testid="jv-account-${i}"]`, (el: Any, c: string) => ([...el.options].find((o: Any) => o.value && o.textContent.trim().startsWith(c)))?.value ?? "", code);
      await page.select(`[data-testid="jv-account-${i}"]`, v);
    };
    await shot("j0-jv-lines", `${base}/journal?new=1`, { act: seq(async (p: Any) => { await p.waitForSelector('[data-testid="jv-account-0"]', { timeout: 25_000 }); await accOpt(p, 0, "6900"); await sleep(400); }, scrollTo('[data-testid="jv-legal-warnings"]')), full: false });
    {
      const page = await open(1440, 900);
      try {
        await page.goto(`${BASE}${base}/journal?new=1`, { waitUntil: "networkidle2", timeout: 90_000 });
        const before = await page.$('[data-testid="jv-legal-warnings"]');
        results.push(`j0 jv pristine warnings shown? ${!!before}`);
        await page.click('[data-testid="jv-submit"]').catch(() => {});
        await sleep(1500);
        await page.screenshot({ path: `${OUT}/j0-jv-try-save-desktop.png`, fullPage: false });
        results.push(`j0 jv after try-save warnings shown? ${!!(await page.$('[data-testid="jv-legal-warnings"]'))}`);
      } catch (e) {
        results.push(`FAIL j0 jv try-save: ${String(e).slice(0, 220)}`);
      } finally {
        await page.close();
      }
    }
  }

  // ═══ T5.1 + T5.6 ปฏิทินภาษี · ตรวจภาษีประจำเดือน ═══
  if (want("t51")) {
    await shot("t51-calendar-company", `${base}/tax/calendar`);
    await shot("t56-checks", `${base}/tax/calendar?period=${ym}`, { act: scrollTo('[data-testid="tax-checks"]'), full: false });
    {
      const page = await open(1440, 900);
      try {
        await page.goto(`${BASE}${base}/tax/calendar?period=${ym}`, { waitUntil: "networkidle2", timeout: 90_000 });
        await typeInto(`[data-testid="stamp-ref-form-${q.id}"] [data-testid="stamp-ref-input"]`, "ES-6911-000123")(page);
        await click(`[data-testid="stamp-ref-form-${q.id}"] [data-testid="stamp-ref-save"]`, 3000)(page);
        await scrollTo(`[data-testid="stamp-${q.id}"]`)(page);
        await page.screenshot({ path: `${OUT}/t56-stamp-saved-desktop.png`, fullPage: false });
        const db = await prisma.accountDocument.findFirst({ where: { id: q.id }, select: { stampDutyRef: true } });
        results.push(`t56 stamp ref saved → db ${db?.stampDutyRef} · msg ${await page.$eval('[data-testid="stamp-ref-ok"]', (e: Any) => e.textContent).catch(() => "-")}`);
      } catch (e) {
        results.push(`FAIL t56 stamp: ${String(e).slice(0, 220)}`);
      } finally {
        await page.close();
      }
    }
    await shot("t51-settings-deadlines", `${base}/settings/tax`, { act: scrollTo('[data-testid="upcoming-deadlines"]'), full: false, desktopOnly: true });
    await shot("t51-reports-index", `${base}/reports`, { desktopOnly: true });
  }

  // ═══ T5.5 บวกกลับ ═══
  if (want("t55")) {
    await shot("t55-addback", `${base}/reports/tax-add-back?asOf=2026-12-31`);
    {
      const page = await open(1440, 900);
      try {
        const fine = await L("6985");
        await page.goto(`${BASE}${base}/reports/tax-add-back?asOf=2026-12-31`, { waitUntil: "networkidle2", timeout: 90_000 });
        await select(`[data-testid="addback-select-${fine}"]`, "NONE")(page);
        await sleep(2500);
        await page.reload({ waitUntil: "networkidle2" });
        await page.screenshot({ path: `${OUT}/t55-addback-unflag-desktop.png`, fullPage: true });
        const db = await prisma.accountLedger.findFirst({ where: { id: fine }, select: { taxAddBack: true } });
        results.push(`t55 unflag 6985 → db ${db?.taxAddBack} · row gone? ${!(await page.$('[data-testid="addback-row-6985"]'))}`);
        await click('[data-testid="addback-unflagged"] summary')(page);
        await select(`[data-testid="addback-select-${fine}"]`, "DEFAULT")(page);
        await sleep(2500);
        await page.reload({ waitUntil: "networkidle2" });
        results.push(`t55 restore default → row back? ${!!(await page.$('[data-testid="addback-row-6985"]'))}`);
        await typeInto('[data-testid="addback-capital"]', "5000000")(page);
        await click('[data-testid="addback-apply"]', 3000)(page);
        await scrollTo('[data-testid="entertainment-cap"]')(page);
        await page.screenshot({ path: `${OUT}/t55-addback-capital-desktop.png`, fullPage: false });
        results.push(`t55 capital 5,000,000 → cap ${await page.$eval('[data-testid="ent-cap"]', (e: Any) => e.textContent).catch(() => "-")} excess ${await page.$eval('[data-testid="ent-excess"]', (e: Any) => e.textContent).catch(() => "-")}`);
      } catch (e) {
        results.push(`FAIL t55 flag: ${String(e).slice(0, 220)}`);
      } finally {
        await page.close();
      }
    }
  }

  // ═══ T5.7 หนี้สูญ ═══
  if (want("t57")) {
    await shot("t57-baddebt", `${base}/aging/bad-debt`);
    await shot("t57-aging-link", `${base}/aging`, { desktopOnly: true, full: false });
    {
      const page = await open(1440, 900);
      try {
        await page.goto(`${BASE}${base}/aging/bad-debt`, { waitUntil: "networkidle2", timeout: 90_000 });
        await click(`[data-testid="writeoff-open-${ivOver}"]`, 2500)(page);
        await scrollTo(`[data-testid="writeoff-form-${ivOver}"]`)(page);
        await page.screenshot({ path: `${OUT}/t57-writeoff-form-desktop.png`, fullPage: false });
        const dis = await page.$eval('[data-testid="writeoff-save"]', (b: Any) => b.disabled);
        results.push(`t57 save disabled before ack? ${dis}`);
        await click('[data-testid="writeoff-warnings-ack"]')(page);
        await typeInto('[data-testid="writeoff-note"]', "ทวงถาม 3 ครั้ง ไม่ติดต่อกลับ")(page);
        await click('[data-testid="writeoff-save"]', 4000)(page);
        await page.reload({ waitUntil: "networkidle2" });
        await page.screenshot({ path: `${OUT}/t57-after-writeoff-desktop.png`, fullPage: true });
        const d = await prisma.accountDocument.findFirst({ where: { id: ivOver }, select: { status: true, paidTotal: true } });
        results.push(`t57 write-off → doc ${d?.status} paid ${d?.paidTotal}`);
        await typeInto('[data-testid="allowance-target"]', "1500")(page);
        await click('[data-testid="allowance-save"]', 3500)(page);
        await scrollTo('[data-testid="allowance-card"]')(page);
        await page.screenshot({ path: `${OUT}/t57-allowance-saved-desktop.png`, fullPage: false });
        results.push(`t57 allowance → ${await page.$eval('[data-testid="allowance-balance"]', (e: Any) => e.textContent).catch(() => "-")}`);
      } catch (e) {
        results.push(`FAIL t57: ${String(e).slice(0, 220)}`);
      } finally {
        await page.close();
      }
    }
    await shot("t57-doc-payments", `${base}/docs/INVOICE/${ivOver}`, {
      desktopOnly: true,
      full: false,
      act: async (page: Any) => {
        const ok = await page.evaluate(() => {
          const el = [...document.querySelectorAll("button, a, [role=tab]")].find((e) => (e.textContent ?? "").trim().startsWith("การชำระเงิน"));
          if (el) (el as HTMLElement).click();
          return !!el;
        });
        results.push(`t57 payments tab clicked? ${ok}`);
        await sleep(1500);
        await page.evaluate(() => window.scrollTo(0, 420));
      },
    });
  }

  // ═══ ร้านบุคคลธรรมดา ไม่จด VAT: T5.2 · T5.3 · T5.1 ═══
  if (want("t52") || want("t53")) {
    await acc.saveSettings(S.tid, SYS, { vatRegistered: false });
    await LV.saveBookTax(S.ownerActor, S.ctx, { entityKind: "INDIVIDUAL" }, "qc-shot");
    const cashRes = await (await import("@/lib/modules/account/finance" as string)).createFinanceAccount({ tenantId: S.tid, systemId: SYS, type: "CASH", name: "เงินสดหน้าร้าน" });
    const cash = await prisma.accountFinance.findFirstOrThrow({ where: { id: cashRes.id }, select: { ledgerAccountId: true } });
    await GL.postManualJV(S.ctx, { date: D(`${ym}-02`), memo: "ถอนเงินเข้าลิ้นชัก", book: "GENERAL", postedById: S.owner.id, lines: [{ accountId: cash.ledgerAccountId, debit: 500_000, credit: 0 }, { accountId: S.bank.ledgerAccountId, debit: 0, credit: 500_000 }] });
    await GL.postManualJV(S.ctx, { date: D(`${ym}-03`), memo: "ถอนใช้ส่วนตัว", book: "GENERAL", postedById: S.owner.id, lines: [{ accountId: await L("3000"), debit: 200_000, credit: 0 }, { accountId: cash.ledgerAccountId, debit: 0, credit: 200_000 }] });
    const ivC = await inv(custB.id, `${ym}-04`, svc(350_000, 0, "ทริปดำน้ำวันเดียว"));
    await acc.recordPayment(S.tid, SYS, ivC, { paidAt: D(`${ym}-04`), channel: "TRANSFER", financeAccountId: S.bank.id, amount: 350_000, createdById: S.owner.id, idempotencyKey: `t5shot-c-${S.tid}` });
    await spend(await L("6100"), [800_000], `${ym}-05`, "ค่าเช่าท่าเรือ", S.vInd.id).then(async (id) => exp.recordVendorPayment(S.tid, SYS, id, { paidAt: D(`${ym}-05`), channel: "TRANSFER", financeAccountId: S.bank.id, amount: 800_000, createdById: S.owner.id, idempotencyKey: `t5shot-rent-${S.tid}` }));
    await shot("t52-cashbook", `${base}/reports/cash-book?from=${ym}&to=${ym}`, { pdf: true });
    await shot("t53-dashboard", `${base}`, { act: scrollTo('[data-testid="dash-vat-threshold"]'), full: false });
    await shot("t53-calendar-individual", `${base}/tax/calendar`);
  }
  await browser.close();
} finally {
  await prisma.session.deleteMany({ where: { userAgent: UA } });
  console.log(results.join("\n"));
  await F.keepOrPurge(prisma, S.tid, KEEP);
  await prisma.$disconnect();
}
