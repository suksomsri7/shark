// ถ่ายภาพหน้าจอจริงของงาน T2c (เลน 1) — เดสก์ท็อป 1440×900 + มือถือ 390×844 · deviceScaleFactor 1 · ใบพิมพ์ = PDF → PNG
//
// ใช้ (ต้องมีเซิร์ฟเวอร์ production build ที่ QC_BASE ก่อน):
//   QC_BASE=http://127.0.0.1:3216 bash scripts/iso.sh pnpm exec tsx scripts/shot-acc-t2c.mts
// 🔴 สร้างข้อมูลประกอบภาพในร้าน QC (seed) — รัน seed ใหม่ก่อนรันข้อสอบชุดเต็ม · session ที่ mint ลบทิ้งเสมอ (userAgent qc-shot-t2c)
// 🔴 ชื่อไฟล์ไม่ขึ้นต้นด้วย qc- (ต้องมี build + เซิร์ฟเวอร์ + chromium)
import { mkdirSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => unknown; QC: { ownerEmail: string; expectedPath: string } };
accEnv.loadQcEnv();
const BASE = process.env.QC_BASE ?? "http://127.0.0.1:3216";
const OUT = ".qc-shots/acc-v2/t2c";
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
const DS = (await import("@/lib/modules/account/doc-settings" as string)) as Any;
const PL = (await import("@/lib/modules/account/print-log" as string)) as Any;
const cfg = (await import("@/lib/modules/account/doc-editor-config" as string)) as Any;
const ctx = { tenantId: TID, systemId: S };
const owner = await prisma.user.findUnique({ where: { email: accEnv.QC.ownerEmail }, select: { id: true } });
if (!owner) throw new Error("ไม่พบเจ้าของร้าน QC — รัน seed ก่อน");
const D = (s: string) => new Date(`${s}T05:00:00.000Z`);
const bank = await prisma.accountFinance.findFirst({ where: { systemId: S, type: "BANK", archivedAt: null }, orderBy: { createdAt: "asc" } });
const ack = (codes: string[]) => ({ ack: { codes, actorId: owner.id, via: "qc-shot" } });
const L = (amt: number, extra: Any = {}) => ({ description: "ทริปดำน้ำเกาะเต่า", qty: 1, unitPrice: amt, vatRateBp: 700, lineKind: "SERVICE", ...extra });
const mkContact = async (o: Any) => (await prisma.accountContact.findFirst({ where: { systemId: S, name: o.name, archivedAt: null } })) ?? acc.createContact({ tenantId: TID, systemId: S, kind: "CUSTOMER", ...o });
const mk = (docType: string, contactId: string | null, date: string, lines: Any[], extra: Any = {}) =>
  acc.createDocument({ tenantId: TID, systemId: S, docType, contactId, vatMode: "EXCLUDE", issueDate: D(date), dueDate: D(date), lines, createdById: owner.id, ...extra });
const issue = async (id: string) => {
  const r = await acc.issueDocument(TID, S, id, ack(["SALE_WITHOUT_VAT_REGISTERED", "TAX_INVOICE_SELLER_TAX_ID_MISSING"]));
  if (!r.ok) throw new Error(`ออกไม่ได้ ${JSON.stringify(r)}`);
};
const pay = (id: string, amt: number, date: string, key: string) =>
  acc.recordPayment(TID, S, id, { paidAt: D(date), financeAccountId: bank?.id ?? null, channel: "TRANSFER", amount: amt, createdById: owner.id, idempotencyKey: `shot-t2c-${key}-${Date.now()}` });
const det = (dt: string, id: string) => cfg.editorDetailPath(base, dt, id) as string;

// ── ข้อมูลประกอบภาพ ──
const cAddr = await mkContact({ legalType: "COMPANY", name: "บริษัท ทะเลใส ทัวร์ จำกัด", taxId: "0105561777001", branchCode: "00000", address: "88/8 ถ.ชายหาด ต.เกาะเต่า อ.เกาะพะงัน จ.สุราษฎร์ธานี 84360" });
const cNoAddr = await mkContact({ legalType: "COMPANY", name: "บริษัท ไม่มีที่อยู่ (ภาพ T2.1) จำกัด" });
// มัดจำ 2 ใบ (คืน / ริบ)
const depA = await mk("DEPOSIT_RECEIPT", cAddr.id, "2026-09-10", [{ description: "มัดจำทริปเกาะเต่า 3 วัน", qty: 1, unitPrice: 1_000_000, vatRateBp: 700 }]);
await issue(depA.id);
await pay(depA.id, 1_070_000, "2026-09-10", "depA");
const depB = await mk("DEPOSIT_RECEIPT", cAddr.id, "2026-09-12", [{ description: "มัดจำห้องพักเรือ", qty: 1, unitPrice: 500_000, vatRateBp: 700 }]);
await issue(depB.id);
await pay(depB.id, 535_000, "2026-09-12", "depB");
// ใบกำกับร่างไม่มีที่อยู่ผู้ซื้อ (T2.1)
const tiDraft = await mk("TAX_INVOICE", cNoAddr.id, "2026-09-20", [L(250_000)]);
// ใบกำกับมีส่วนลดรายบรรทัด (T2.1 B12)
const tiDisc = await mk("TAX_INVOICE", cAddr.id, "2026-09-21", [{ description: "อุปกรณ์ดำน้ำ (เช่า)", qty: 2, unitPrice: 500_000, discount: 100_000, vatRateBp: 700, lineKind: "GOODS" }, L(200_000, { description: "ค่าครูสอน" })]);
await issue(tiDisc.id);
// ใบแจ้งหนี้ → รับเงิน → ใบกำกับงวด (A3)
const ivPay = await mk("INVOICE", cAddr.id, "2026-09-05", [L(300_000)]);
await issue(ivPay.id);
const p = await pay(ivPay.id, 321_000, "2026-09-06", "ivpay");
const payTi = await prisma.accountDocument.findFirst({ where: { systemId: S, docType: "TAX_INVOICE", sourcePaymentId: p.paymentId } });
// ใบแทน (A1) + ใบเสร็จ → ใบกำกับ → ออกแทน (A7 · หน้าพิมพ์หมายเหตุครั้งเดียว)
const tiSub = await mk("TAX_INVOICE", cAddr.id, "2026-09-02", [L(120_000)]);
await issue(tiSub.id);
await PL.recordDocPrint(ctx, tiSub.id, { request: "PRINT", channel: "SCREEN", actorId: owner.id });
await PL.recordDocPrint(ctx, tiSub.id, { request: "SUBSTITUTE", channel: "SCREEN", actorId: owner.id, substitute: { reason: "ลูกค้าทำต้นฉบับหาย", date: new Date("2026-09-25T12:00:00+07:00") } });
const rc = await mk("RECEIPT", cAddr.id, "2026-09-08", [L(150_000)]);
await issue(rc.id);
const cv = await acc.convertDocument(TID, S, rc.id, "TAX_INVOICE", owner.id);
await issue(cv.newId);
const rp = await acc.replaceTaxInvoice(ctx, cv.newId, { reason: "ชื่อผู้ซื้อสะกดผิด", buyer: { name: "บริษัท ทะเลใส ทัวร์ จำกัด (สำนักงานใหญ่)" }, ...ack(["TAX_INVOICE_REPLACE"]), createdById: owner.id });
// ร่างใบเสร็จ (ป้ายร่างของเลน 1 บนใบพิมพ์)
const rcDraft = await mk("RECEIPT", cAddr.id, "2026-09-28", [L(50_000)]);
// ขอใบเต็มรูปจากใบเสร็จผ่านลิงก์ (T2.5)
const rcLink = await mk("RECEIPT", cAddr.id, "2026-09-03", [L(80_000)]);
await issue(rcLink.id);
const link = await acc.ensurePublicTaxInvoiceLink(TID, S, rcLink.id);
await acc.issuePublicTaxInvoice(link.token, { name: "นาย ขอใบ เต็มรูป", taxId: "", address: "12 ถ.สุขุมวิท กรุงเทพฯ" });
const linkDraft = await prisma.accountDocument.findFirst({ where: { systemId: S, docType: "TAX_INVOICE", sourceDocId: rcLink.id } });
console.log("fixtures ok", { depA: depA.id, depB: depB.id, tiDraft: tiDraft.id, tiDisc: tiDisc.id, payTi: payTi?.id, tiSub: tiSub.id, rp: rp.newId, rcDraft: rcDraft.id, linkDraft: linkDraft?.id });

// ── เบราว์เซอร์ ──
const UA = "qc-shot-t2c";
const token = "t2c" + Math.random().toString(36).slice(2) + Date.now().toString(36);
const ttl = new Date(Date.now() + 60 * 60 * 1000);
await prisma.session.create({ data: { userId: owner.id, tokenHash: sha256(token), userAgent: UA, idleExpiresAt: ttl, expiresAt: ttl } });
const host = new URL(BASE).hostname;
const cookies = [
  { name: "shark_session", value: token, domain: host, path: "/" },
  { name: "shark_tenant", value: TID, domain: host, path: "/" },
];
const results: string[] = [];
try {
  const pptr = await import("/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js" as string);
  const browser = await pptr.default.launch({ executablePath: "/usr/bin/chromium-browser", args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", `--user-data-dir=/tmp/chr-t2c-${process.pid}`] });
  const open = async (w: number, h: number) => {
    const page = await browser.newPage();
    await page.evaluateOnNewDocument("window.__name = window.__name || ((f) => f);");
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    await page.setCookie(...cookies);
    return page;
  };
  const shot = async (name: string, path: string, opts: { mobile?: boolean; act?: (page: Any) => Promise<void>; full?: boolean } = {}) => {
    for (const [dev, w, h] of opts.mobile === undefined ? ([["desktop", 1440, 900]] as const) : opts.mobile ? ([["desktop", 1440, 900], ["mobile", 390, 844]] as const) : ([["desktop", 1440, 900]] as const)) {
      const page = await open(w, h);
      try {
        await page.goto(BASE + path, { waitUntil: "networkidle2", timeout: 90_000 });
        if (opts.act) await opts.act(page);
        await new Promise((r) => setTimeout(r, 500));
        await page.screenshot({ path: `${OUT}/${name}-${dev}.png`, fullPage: opts.full ?? true });
        results.push(`ok ${name}-${dev} ${page.url().replace(BASE, "")}`);
      } catch (e) {
        results.push(`FAIL ${name}-${dev}: ${String(e).slice(0, 200)}`);
      } finally {
        await page.close();
      }
    }
  };
  const pdf = async (name: string, path: string) => {
    const page = await open(1200, 900);
    try {
      await page.goto(BASE + path, { waitUntil: "networkidle2", timeout: 90_000 });
      await page.pdf({ path: `${OUT}/${name}.pdf`, format: "A4", printBackground: true });
      execFileSync("pdftoppm", ["-png", "-r", "70", `${OUT}/${name}.pdf`, `${OUT}/${name}`]);
      results.push(`ok pdf ${name} ${page.url().replace(BASE, "")}`);
    } catch (e) {
      results.push(`FAIL pdf ${name}: ${String(e).slice(0, 200)}`);
    } finally {
      await page.close();
    }
  };
  const click = (sel: string) => async (page: Any) => {
    await page.waitForSelector(sel, { timeout: 20_000 });
    await page.click(sel);
    await new Promise((r) => setTimeout(r, 600));
  };

  // T2.4 — ใบรับมัดจำ + กล่องคืน/ริบ (คลิกปุ่มใหม่) + ส่งจริง
  await shot("c-deposit-detail", det("DEPOSIT_RECEIPT", depA.id), { mobile: true });
  await shot("c-deposit-refund-dialog", det("DEPOSIT_RECEIPT", depA.id), { mobile: true, act: click('[data-testid="deposit-refund-trigger"]'), full: false });
  await shot("c-deposit-forfeit-dialog", det("DEPOSIT_RECEIPT", depB.id), { mobile: true, act: click('[data-testid="deposit-forfeit-trigger"]'), full: false });
  {
    const page = await open(1440, 900);
    try {
      await page.goto(BASE + det("DEPOSIT_RECEIPT", depA.id), { waitUntil: "networkidle2", timeout: 90_000 });
      await click('[data-testid="deposit-refund-trigger"]')(page);
      await page.type('[data-testid="deposit-refund-reason"]', "ลูกค้ายกเลิกทริปเพราะพายุ");
      await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2", timeout: 90_000 }), page.click('[data-testid="deposit-refund-sheet"] button[type="submit"]')]);
      await page.screenshot({ path: `${OUT}/c-refund-result-cn-desktop.png`, fullPage: true });
      results.push(`ok c-refund-result-cn ${page.url().replace(BASE, "")}`);
    } catch (e) { results.push(`FAIL c-refund-submit: ${String(e).slice(0, 200)}`); } finally { await page.close(); }
  }
  {
    const page = await open(1440, 900);
    try {
      await page.goto(BASE + det("DEPOSIT_RECEIPT", depB.id), { waitUntil: "networkidle2", timeout: 90_000 });
      await click('[data-testid="deposit-forfeit-trigger"]')(page);
      await page.type('[data-testid="deposit-forfeit-reason"]', "ลูกค้าไม่มาตามนัด");
      await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2", timeout: 90_000 }), page.click('[data-testid="deposit-forfeit-sheet"] button[type="submit"]')]);
      await page.screenshot({ path: `${OUT}/c-forfeit-result-desktop.png`, fullPage: true });
      results.push(`ok c-forfeit-result ${page.url().replace(BASE, "")}`);
    } catch (e) { results.push(`FAIL c-forfeit-submit: ${String(e).slice(0, 200)}`); } finally { await page.close(); }
  }
  const cn = await prisma.accountDocument.findFirst({ where: { systemId: S, docType: "CREDIT_NOTE", refType: "DepositRefund", refId: depA.id } });
  if (cn) await pdf("c-cn-print", `${base}/print/${cn.id}`);

  // T2.1 — ร่างใบกำกับไม่มีที่อยู่ (คำเตือน) · ใบกำกับมีส่วนลด (PDF · ปิดที่อยู่ในเทมเพลต)
  await shot("b-ti-draft-noaddr", det("TAX_INVOICE", tiDraft.id), { mobile: true });
  const cur = await DS.getDocSettings(ctx);
  await DS.saveDocSettings(ctx, { print: { ...cur.print, fields: { ...cur.print.fields, buyerAddress: false } } });
  await pdf("b-ti-discount-print", `${base}/print/${tiDisc.id}`);
  await DS.saveDocSettings(ctx, { print: cur.print });
  await shot("b-ti-discount-detail", det("TAX_INVOICE", tiDisc.id));
  await shot("b-settings-print", `${base}/settings/documents?s=print`);

  // A3 — ใบกำกับของงวดรับเงิน (ป้ายยอดท้าย)
  if (payTi) await shot("a3-payti-detail", det("TAX_INVOICE", payTi.id), { mobile: true });
  // A4 — ฟอร์มใบแจ้งหนี้ ร้านไม่จด VAT (ชั่วคราว)
  await prisma.accountSettings.updateMany({ where: { systemId: S }, data: { vatRegistered: false } });
  await shot("a4-invoice-editor-novat", cfg.editorNewPath(base, "INVOICE"), { mobile: true });
  await prisma.accountSettings.updateMany({ where: { systemId: S }, data: { vatRegistered: true } });
  // A6 — ตั้งค่า: ใบเสร็จอัตโนมัติ (คลิกปิด → คำเตือน)
  await shot("a6-settings-autotax", `${base}/settings/documents?s=autotax`, { mobile: true });
  await shot("a6-settings-receipt-off", `${base}/settings/documents?s=autotax`, { mobile: true, act: click('[data-testid="toggle-receiptAutoOnPayment"] button[role="switch"]') });
  // A1/A7 — รายงานภาษีขาย ก.ย. (แถวใบแทน + หมายเหตุออกแทนในแถวใบเสร็จ)
  await shot("a1-a7-salestax-sep", `${base}/reports/pp30?period=2026-09`);
  // M — ใบพิมพ์: ใบกำกับที่ออกแทน (หมายเหตุครั้งเดียว) · ใบเดิม · ร่างใบเสร็จ · ใบกำกับงวด (86/4)
  if (rp.ok) await pdf("m-replacement-print", `${base}/print/${rp.newId}`);
  await pdf("m-replaced-old-print", `${base}/print/${cv.newId}`);
  await pdf("m-draft-receipt-print", `${base}/print/${rcDraft.id}`);
  await pdf("m-draft-ti-print", `${base}/print/${tiDraft.id}`);
  if (payTi) await pdf("m-payti-print", `${base}/print/${payTi.id}`);
  // T2.5 — คำขอใบเต็มรูปจากลิงก์ (ร่าง · วันที่ใบเสร็จ · อ้างเลข)
  if (linkDraft) await shot("d-link-request-draft", det("TAX_INVOICE", linkDraft.id), { mobile: true });
  // T2.9 — ผู้ขายที่ตรึงบนหน้ารายละเอียด
  await shot("e-seller-frozen", det("TAX_INVOICE", tiDisc.id), { mobile: false });
  await browser.close();
} finally {
  await prisma.session.deleteMany({ where: { userAgent: UA } });
  console.log(results.join("\n"));
  await prisma.$disconnect();
}
