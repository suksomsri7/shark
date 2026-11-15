// ถ่ายภาพหน้าจอจริงของงาน T5c + T5.4 (เลน 2) — เดสก์ท็อป 1440×900 + มือถือ 390×844 · deviceScaleFactor 1
//
// ใช้ (ต้องมีเซิร์ฟเวอร์ production build ที่ QC_BASE ก่อน · env ของเซิร์ฟเวอร์ = .env.qc → APP_ENV=development ⇒ อีเมล e-Tax ถูกจับไว้ ไม่ส่งจริง):
//   QC_BASE=http://127.0.0.1:3217 bash scripts/iso.sh pnpm exec tsx scripts/shot-acc-t5c.mts
// 🔴 ข้อมูลประกอบภาพอยู่ใน "ร้านแยก" (QC T5c จอ) — ลบร้านทิ้งตอนจบ (KEEP=1 = เก็บไว้ดูต่อ) · session ที่ mint ลบทิ้งเสมอ
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => unknown };
accEnv.loadQcEnv();
const BASE = process.env.QC_BASE ?? "http://127.0.0.1:3217";
const OUT = ".qc-shots/acc-v2/t5c";
mkdirSync(OUT, { recursive: true });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const KEEP = process.env.KEEP === "1";
const ONLY = process.env.ONLY ?? "";
const F: Any = await import("./qc-acc-v2-wht-fixture.mts" as string);
const { sha256 } = await import("@/lib/core/hash");
const GL: Any = await import("@/lib/modules/account/gl" as string);
const BD: Any = await import("@/lib/modules/account/bad-debt" as string);
const acc: Any = await import("@/lib/modules/account/service" as string);
const exp: Any = await import("@/lib/modules/account/expense" as string);
const W: Any = await import("@/lib/core/settings/legal/warnings" as string);

const S = await F.setupWhtShop("QC T5c จอ", "qc-t5c-shot");
const prisma = S.prisma;
const SYS: string = S.SYS;
const base = `/app/sys/${SYS}/account`;
const D = (s: string) => new Date(`${s}T12:00:00+07:00`);
const results: string[] = [];
const ACK = { codes: W.LEGAL_WARNING_CODES, actorId: S.owner.id, via: "qc-shot" };
const L = async (code: string) => (await prisma.accountLedger.findFirstOrThrow({ where: { systemId: SYS, code }, select: { id: true } })).id as string;

// ── ข้อมูลประกอบภาพ ──
await GL.postManualJV(S.ctx, { date: D("2026-01-05"), memo: "ทุนจดทะเบียนชำระแล้ว", book: "GENERAL", postedById: S.owner.id, lines: [{ accountId: S.bank.ledgerAccountId, debit: 100_000_000, credit: 0 }, { accountId: await L("3000"), debit: 0, credit: 100_000_000 }] });
const mkDoc = async (docType: string, contactId: string, d: string, lines: Any[], vatMode = "EXCLUDE", extra: Any = {}) => {
  const x = await acc.createDocument({ tenantId: S.tid, systemId: SYS, docType, contactId, issueDate: D(d), dueDate: D(d), vatMode, lines, createdById: S.owner.id, ...extra });
  const r = await acc.issueDocument(S.tid, SYS, x.id, { ack: ACK });
  if (r.ok === false) throw new Error(`issue ${docType} ${d}: ${r.reason}`);
  return x.id as string;
};
const svc = (amt: number, rate = 0, desc = "ทริปดำน้ำ") => [{ description: desc, qty: 1, unitPrice: amt, vatRateBp: rate, lineKind: "SERVICE" }];
await mkDoc("INVOICE", S.cust.id, "2026-03-02", svc(100_000_000, 0, "เหมาเรือทั้งฤดู"), "NONE");
const spend = async (accountId: string, amount: number, d: string, key: string) => {
  const e = await exp.createExpenseDoc({ tenantId: S.tid, systemId: SYS, docType: "EXPENSE", contactId: S.vJur.id, issueDate: D(d), vatMode: "NONE", lines: [{ description: key, qty: 1, unitPrice: amount, vatRateBp: 0, accountId }], createdById: S.owner.id });
  const r = await exp.issueExpenseDoc(S.tid, SYS, e.id);
  if (!r.ok) throw new Error(`${key}: ${r.reason}`);
};
await spend(await L("6900"), 60_000_000, "2026-04-10", "ค่าใช้จ่ายดำเนินงาน");
await spend(await L("6980"), 1_000_000, "2026-05-10", "บริจาคมูลนิธิรักษ์ทะเล");
await spend(await L("6940"), 9_000_000, "2026-06-10", "ค่าเช่ารถยนต์นั่ง 2 คัน");
// หนี้สูญ: ตัดทั้งใบ · รับบางส่วนแล้วตัด · ตัดบางส่วน · บริการมี VAT ตัดทั้งใบ
const custB = await acc.createContact({ tenantId: S.tid, systemId: SYS, kind: "CUSTOMER", legalType: "PERSON", name: "คุณมาลี ทะเลงาม", address: "8 ถ.ชายหาด ภูเก็ต" });
const ivFull = await mkDoc("INVOICE", custB.id, "2026-08-01", svc(1_800_000, 0, "ค่าเช่าอุปกรณ์ดำน้ำ"), "NONE");
const ivPart = await mkDoc("INVOICE", S.cust.id, "2026-08-05", svc(1_000_000, 0, "ทริปเกาะราชา"), "NONE");
await acc.recordPayment(S.tid, SYS, ivPart, { paidAt: D("2026-08-10"), channel: "TRANSFER", financeAccountId: S.bank.id, amount: 600_000, createdById: S.owner.id, idempotencyKey: `t5c-shot-p-${S.tid}` });
const ivHalf = await mkDoc("INVOICE", S.cust.id, "2026-08-07", svc(2_000_000, 0, "เหมาเรือ 2 วัน"), "NONE");
const ivVat = await mkDoc("INVOICE", custB.id, "2026-08-09", svc(1_000_000, 700, "ค่าบริการดำน้ำ (มี VAT)"));
const W_ACK = { codes: ["BAD_DEBT_TAX_CONDITIONS"], actorId: S.owner.id, via: "qc-shot" };
await BD.writeOffBadDebt(S.ctx, { documentId: ivFull, date: D("2026-10-01"), ack: W_ACK, note: "ทวงถาม 3 ครั้ง" });
await BD.writeOffBadDebt(S.ctx, { documentId: ivPart, date: D("2026-10-01"), ack: W_ACK });
await BD.writeOffBadDebt(S.ctx, { documentId: ivHalf, amount: 500_000, date: D("2026-10-01"), ack: W_ACK });
await BD.writeOffBadDebt(S.ctx, { documentId: ivVat, date: D("2026-10-02"), ack: W_ACK });
await BD.recoverBadDebt(S.ctx, { documentId: ivFull, amount: 300_000, date: D("2026-11-01"), channel: "TRANSFER", financeAccountId: S.bank.id, note: "ลูกค้าโอนมาบางส่วน" });
// e-Tax: ผู้ซื้อมีอีเมล · ใบกำกับ · ใบลดหนี้ · ใบเสร็จ (ไม่ครอบ) · ผู้ซื้อไม่มีอีเมล
const buyer = await acc.createContact({ tenantId: S.tid, systemId: SYS, kind: "CUSTOMER", legalType: "COMPANY", name: "บริษัท ทะเลใส ทัวร์ จำกัด", taxId: F.thaiTaxId("010556155551"), branchCode: "00000", address: "55 ถ.ทะเลใส ต.ป่าตอง อ.กะทู้ จ.ภูเก็ต 83150", email: "account@talaysai.example" });
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
const tx = await mkDoc("TAX_INVOICE", buyer.id, today, [{ description: "ค่าบริการดำน้ำลึกแบบเรือค้างคืน 3 วัน 2 คืน พร้อมอุปกรณ์และอาหาร", qty: 2, unitPrice: 1_250_000, discount: 0, vatRateBp: 700 }, { description: "ค่าธรรมเนียมอุทยาน", qty: 2, unitPrice: 50_000, discount: 0, vatRateBp: 700 }]);
const cn = await mkDoc("CREDIT_NOTE", buyer.id, today, [{ description: "ลดค่าบริการ (ทริปสั้นลง 1 วัน)", qty: 1, unitPrice: 214_000, discount: 0, vatRateBp: 700 }], "INCLUDE", { sourceDocId: tx, adjustReasonCode: "CN_SERVICE_NOT_PROVIDED", adjustReason: "ทริปสั้นลง 1 วันเพราะคลื่นลมแรง" });
const rc = await mkDoc("RECEIPT", buyer.id, today, svc(107_000, 700, "ค่าเช่าหน้ากาก"));
const txNoMail = await mkDoc("TAX_INVOICE", custB.id, today, svc(500_000, 700, "ทริปดำน้ำตื้น"));
console.log("fixtures ok", { tx, cn, rc, ivFull });

// ── เบราว์เซอร์ ──
const UA = "qc-shot-t5c";
const token = "t5c" + Math.random().toString(36).slice(2) + Date.now().toString(36);
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
  const browser = await pptr.default.launch({ executablePath: "/usr/bin/chromium-browser", args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", `--user-data-dir=/tmp/chr-t5c-${process.pid}`] });
  const open = async (w: number, h: number) => {
    const page = await browser.newPage();
    await page.evaluateOnNewDocument("window.__name = window.__name || ((f) => f);");
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    await page.setCookie(...cookies);
    page.on("pageerror", (e: Any) => results.push(`PAGEERROR ${String(e?.message ?? e).slice(0, 300)}`));
    page.on("console", (m: Any) => { if (m.type() === "error") results.push(`CONSOLE ${m.text().slice(0, 300)}`); });
    return page;
  };
  const DEV = [["desktop", 1440, 900], ["mobile", 390, 844]] as const;
  const shot = async (name: string, path: string, opts: { act?: (page: Any) => Promise<void>; full?: boolean; desktopOnly?: boolean; pdf?: boolean } = {}) => {
    for (const [dev, w, h] of opts.desktopOnly ? [DEV[0]] : DEV) {
      const page = await open(w, h);
      try {
        await page.goto(BASE + path, { waitUntil: "networkidle2", timeout: 90_000 });
        if (opts.act) await opts.act(page);
        await sleep(600);
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
  const click = (sel: string, wait = 900) => async (page: Any) => {
    await page.waitForSelector(sel, { timeout: 25_000 });
    await page.$eval(sel, (el: Any) => el.scrollIntoView({ block: "center" }));
    await page.click(sel);
    await sleep(wait);
  };
  const seq = (...fs: ((p: Any) => Promise<void>)[]) => async (page: Any) => {
    for (const f of fs) await f(page);
  };
  const typeInto = (sel: string, text: string) => async (page: Any) => {
    await page.waitForSelector(sel, { timeout: 20_000 });
    await page.click(sel, { clickCount: 3 });
    await page.type(sel, text, { delay: 15 });
    await sleep(300);
  };
  const scrollTo = (sel: string) => async (page: Any) => {
    await page.waitForSelector(sel, { timeout: 20_000 });
    await page.$eval(sel, (el: Any) => el.scrollIntoView({ block: "start" }));
    await sleep(300);
  };
  const setDate = (sel: string, ymd: string) => async (page: Any) => {
    await page.waitForSelector(sel, { timeout: 20_000 });
    await page.$eval(sel, (el: Any, v: string) => {
      el.scrollIntoView({ block: "center" });
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }, ymd);
    await sleep(500);
  };
  const want = (n: string) => !ONLY || ONLY.split(",").some((x) => n.startsWith(x));
  const textOf = async (page: Any, sel: string) => page.$eval(sel, (el: Any) => el.textContent).catch(() => null);

  // ═══ A1/A2 หนี้สูญ · สถานะตัดหนี้สูญ ═══
  if (want("a1")) {
    await shot("a1-bad-debt", `${base}/aging/bad-debt`, { pdf: true });
    await shot("a1-recover-open", `${base}/aging/bad-debt`, { act: click(`[data-testid="recover-${ivFull}-open"]`), full: false, desktopOnly: true });
    {
      const page = await open(1440, 900);
      try {
        await page.goto(`${BASE}${base}/aging/bad-debt`, { waitUntil: "networkidle2", timeout: 90_000 });
        await click(`[data-testid="recover-${ivVat}-open"]`)(page);
        await typeInto(`[data-testid="recover-${ivVat}-amount"]`, "500")(page);
        await click(`[data-testid="recover-${ivVat}-save"]`, 2500)(page);
        await page.screenshot({ path: `${OUT}/a1-recover-saved-desktop.png`, fullPage: true });
        results.push(`a1 recover saved: warnings=${await textOf(page, `[data-testid="recover-${ivVat}-warnings"]`)}`);
        const rid = (await prisma.accountBadDebtRecovery.findFirst({ where: { documentId: ivVat, voidedAt: null } }))?.id;
        await click(`[data-testid="recovery-void-${rid}-open"]`)(page);
        await typeInto(`[data-testid="recovery-void-${rid}-reason"]`, "บันทึกผิดยอด")(page);
        await page.screenshot({ path: `${OUT}/a1-recover-void-open-desktop.png`, fullPage: false });
        await click(`[data-testid="recovery-void-${rid}-confirm"]`, 2500)(page);
        await page.screenshot({ path: `${OUT}/a1-recover-voided-desktop.png`, fullPage: true });
        results.push(`a1 void done: voided=${!!(await prisma.accountBadDebtRecovery.findFirst({ where: { id: rid } }))?.voidedAt}`);
      } catch (e) {
        results.push(`FAIL a1 recover flow: ${String(e).slice(0, 220)}`);
        await page.screenshot({ path: `${OUT}/a1-recover-FAIL.png`, fullPage: true }).catch(() => {});
      } finally {
        await page.close();
      }
    }
    await shot("a2-invoice-list", `${base}/docs/INVOICE`);
    await shot("a2-invoice-detail-full", `${base}/docs/INVOICE/${ivFull}`, { full: false });
    await shot("a2-invoice-detail-partial", `${base}/docs/INVOICE/${ivPart}`, { full: false, desktopOnly: true });
    await shot("a2-aging", `${base}/aging`, { desktopOnly: true });
  }

  // ═══ A3 วันประชุมใหญ่ ═══
  if (want("a3")) {
    await shot("a3-calendar-before", `${base}/tax/calendar`, { act: scrollTo('[data-testid="tax-calendar"]') });
    const page = await open(1440, 900);
    try {
      await page.goto(`${BASE}${base}/tax/calendar`, { waitUntil: "networkidle2", timeout: 90_000 });
      const fyEnd = await page.$eval('[data-testid="cal-FS_COMPANY"]', (el: Any) => el.getAttribute("data-period")).catch(() => null);
      const y = Number(String(fyEnd ?? "FY:2025-12-31").slice(3, 7));
      await setDate('[data-testid="meeting-date"]', `${y + 1}-04-20`)(page);
      await click('[data-testid="meeting-save"]', 2500)(page);
      await scrollTo('[data-testid="tax-calendar"]')(page);
      await page.screenshot({ path: `${OUT}/a3-calendar-after-desktop.png`, fullPage: false });
      results.push(`a3 FS_COMPANY row after save: ${await textOf(page, '[data-testid="cal-FS_COMPANY"]')}`);
    } catch (e) {
      results.push(`FAIL a3: ${String(e).slice(0, 220)}`);
    } finally {
      await page.close();
    }
    await shot("a3-calendar-after", `${base}/tax/calendar`, { act: scrollTo('[data-testid="tax-calendar"]'), full: false, desktopOnly: false });
  }

  // ═══ A4/A5 บวกกลับ (ตัวช่วย + ใบพิมพ์) ═══
  if (want("a4")) {
    await shot("a4-addback", `${base}/reports/tax-add-back?asOf=2026-12-31`, { pdf: true });
    await shot("a4-addback-car", `${base}/reports/tax-add-back?asOf=2026-12-31`, {
      act: seq(typeInto('[data-testid="addback-car-months"]', "2"), click('[data-testid="addback-apply"]', 2500), scrollTo('[data-testid="car-rent-cap"]')),
      pdf: true,
    });
  }

  // ═══ B e-Tax ประทับเวลา ═══
  if (want("b")) {
    await shot("b1-settings-off", `${base}/settings/tax`, { act: scrollTo('[data-testid="etax-settings"]'), full: false });
    {
      const page = await open(1440, 900);
      try {
        await page.goto(`${BASE}${base}/settings/tax`, { waitUntil: "networkidle2", timeout: 90_000 });
        await scrollTo('[data-testid="etax-settings"]')(page);
        await click('[data-testid="etax-enabled"]', 300)(page);
        await typeInto('[data-testid="etax-sender"]', "tax@talaysai-shop.example")(page);
        await click('[data-testid="etax-settings-save"]', 2500)(page);
        await page.screenshot({ path: `${OUT}/b1-settings-saved-desktop.png`, fullPage: false });
        await click('[data-testid="etax-legal-rows"] summary', 600)(page);
        await page.screenshot({ path: `${OUT}/b1-settings-rows-desktop.png`, fullPage: false });
        await scrollTo('[data-testid="etax-provider-card"]')(page);
        await page.screenshot({ path: `${OUT}/b1-provider-card-desktop.png`, fullPage: false });
        results.push(`b1 provider button disabled: ${await page.$eval('[data-testid="etax-provider-connect"]', (el: Any) => el.disabled)}`);
      } catch (e) {
        results.push(`FAIL b1: ${String(e).slice(0, 220)}`);
        await page.screenshot({ path: `${OUT}/b1-FAIL.png`, fullPage: true }).catch(() => {});
      } finally {
        await page.close();
      }
    }
    await shot("b1-settings-on", `${base}/settings/tax`, { act: scrollTo('[data-testid="etax-settings"]'), full: false });
    await shot("b2-tx-before", `${base}/docs/TAX_INVOICE/${tx}`, { act: scrollTo('[data-testid="etax-block"]'), full: false });
    {
      const page = await open(1440, 900);
      try {
        await page.goto(`${BASE}${base}/docs/TAX_INVOICE/${tx}`, { waitUntil: "networkidle2", timeout: 90_000 });
        await click('[data-testid="etax-send-open"]', 2500)(page);
        await page.screenshot({ path: `${OUT}/b2-send-warnings-desktop.png`, fullPage: false });
        const disabled = await page.$eval('[data-testid="etax-send-confirm"]', (el: Any) => el.disabled);
        await click('[data-testid="etax-send-warnings-ack"]', 400)(page);
        const enabled = !(await page.$eval('[data-testid="etax-send-confirm"]', (el: Any) => el.disabled));
        results.push(`b2 confirm disabled before ack=${disabled} enabled after ack=${enabled}`);
        await click('[data-testid="etax-send-confirm"]', 6000)(page);
        await scrollTo('[data-testid="etax-block"]')(page);
        await page.screenshot({ path: `${OUT}/b2-sent-desktop.png`, fullPage: false });
        results.push(`b2 state after send: ${await textOf(page, '[data-testid="etax-state"]')} · ${await textOf(page, '[data-testid="etax-ok"]')}`);
        // ไฟล์ที่ส่ง → PDF → PNG (ดูหน้าตาไฟล์จริง)
        const sub = await prisma.accountEtaxSubmission.findFirst({ where: { documentId: tx }, orderBy: { attemptNo: "desc" } });
        const f = sub?.pdfFileId ? await prisma.accountEtaxFile.findFirst({ where: { id: sub.pdfFileId } }) : null;
        if (f) {
          writeFileSync(`${OUT}/b2-etax-file.pdf`, Buffer.from(f.bytes));
          execFileSync("pdftoppm", ["-png", "-r", "90", `${OUT}/b2-etax-file.pdf`, `${OUT}/b2-etax-file`]);
          results.push(`b2 file ${f.fileName} ${f.sizeBytes} bytes · subject ${sub?.subject} · to ${sub?.toAddress} cc ${sub?.ccAddress} · transport ${sub?.transport}`);
          // อัปโหลดไฟล์ "ประทับเวลา" (จำลอง: ไบต์เดิม + คอมเมนต์ท้าย) ผ่านจอ
          writeFileSync(`${process.cwd()}/${OUT}/b3-stamped-upload.pdf`, Buffer.concat([Buffer.from(f.bytes), Buffer.from("\n%SIMULATED-STAMP\n")]));
          const input = await page.$('[data-testid="etax-stamped-file"]');
          await input.uploadFile(`${process.cwd()}/${OUT}/b3-stamped-upload.pdf`);
          await click('[data-testid="etax-stamped-save"]', 4000)(page);
          await scrollTo('[data-testid="etax-block"]')(page);
          await page.screenshot({ path: `${OUT}/b3-stamped-desktop.png`, fullPage: false });
          results.push(`b3 state after upload: ${await textOf(page, '[data-testid="etax-state"]')} · ${await textOf(page, '[data-testid="etax-ok"]')}`);
          const href = await page.$eval('[data-testid="etax-file-sent-1"]', (el: Any) => el.getAttribute("href")).catch(() => null);
          if (href) {
            const res = await page.evaluate(async (u: string) => { const r = await fetch(u); return { status: r.status, type: r.headers.get("content-type"), sha: r.headers.get("x-content-sha256"), len: (await r.arrayBuffer()).byteLength }; }, href);
            results.push(`b3 download sent file: ${JSON.stringify(res)} stored=${f.sha256.slice(0, 12)}`);
          }
          await click('[data-testid="etax-resend-stamped-open"]', 1500)(page);
          await page.screenshot({ path: `${OUT}/b3-resend-stamped-open-desktop.png`, fullPage: false });
          await click('[data-testid="etax-send-cancel"]', 500)(page);
        }
      } catch (e) {
        results.push(`FAIL b2: ${String(e).slice(0, 220)}`);
        await page.screenshot({ path: `${OUT}/b2-FAIL.png`, fullPage: true }).catch(() => {});
      } finally {
        await page.close();
      }
    }
    await shot("b3-tx-stamped", `${base}/docs/TAX_INVOICE/${tx}`, { act: scrollTo('[data-testid="etax-block"]'), full: false });
    await shot("b4-cn", `${base}/docs/CREDIT_NOTE/${cn}`, { act: scrollTo('[data-testid="etax-block"]'), full: false });
    await shot("b5-receipt-no-etax", `${base}/docs/RECEIPT/${rc}`, { desktopOnly: true });
    results.push(`b5 receipt has etax block: ${await (async () => { const p = await open(1440, 900); try { await p.goto(`${BASE}${base}/docs/RECEIPT/${rc}`, { waitUntil: "networkidle2", timeout: 90_000 }); return !!(await p.$('[data-testid="etax-block"]')); } finally { await p.close(); } })()}`);
    await shot("b6-no-email", `${base}/docs/TAX_INVOICE/${txNoMail}`, { act: scrollTo('[data-testid="etax-block"]'), full: false });
  }
  await browser.close();
} finally {
  await prisma.session.deleteMany({ where: { userAgent: UA } });
  console.log(results.join("\n"));
  await F.keepOrPurge(prisma, S.tid, KEEP);
  await prisma.$disconnect();
}
