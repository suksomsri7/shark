// visual-acc-v2-t5b.mts — ดูจอจริงของ T5.8 T5.9 T5.10 T5.11 (เลน 1) · กดทุกปุ่มใหม่ · ภาพ .qc-shots/acc-v2/t5b/ (เดสก์ท็อป 1440 + มือถือ 390 · deviceScaleFactor 1)
// ข้อมูล: ร้านฟิกซ์เจอร์ของชุดทดสอบที่รันด้วย KEEP=1 (QC T5.8 ส่วนของเจ้าของ · QC T5.9 สินค้า · QC T5.10 รับล่วงหน้า · QC T5.11 สาขา) — ไม่แตะร้าน seed กลาง · ลบร้านฟิกซ์เจอร์ตอนจบ
// ต้องมีเซิร์ฟเวอร์ QC ที่ QC_BASE (ปริยาย http://127.0.0.1:3216)
// รัน: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/visual-acc-v2-t5b.mts
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("visual-acc-v2-t5b");
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const cks: { id: string; ok: boolean }[] = [];
const chk = (id: string, n: string, ok: boolean, act?: unknown) => {
  cks.push({ id, ok });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — ${JSON.stringify(act)?.slice(0, 400)}`}`);
};
const ROOT = process.cwd();
const OUT = join(ROOT, ".qc-shots/acc-v2/t5b");
mkdirSync(OUT, { recursive: true });
const BASE = process.env.QC_BASE ?? "http://127.0.0.1:3216";
const FORBID = /references\/|\.md\b|skill|\[(?:V2|V|S|U)\]|ถูกกฎหมาย/i;
const { prisma } = (await import("@/lib/core/db" as string)) as Any;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const NAMES = ["QC T5.8 ส่วนของเจ้าของ", "QC T5.9 สินค้า", "QC T5.10 รับล่วงหน้า", "QC T5.11 สาขา"];
const tenantOf = async (name: string) => prisma.tenant.findFirst({ where: { name }, orderBy: { createdAt: "desc" }, select: { id: true } });
const [T58, T59, T510, T511] = await Promise.all(NAMES.map(tenantOf));
if (!T58 || !T59 || !T510 || !T511) {
  console.error("ไม่พบร้านฟิกซ์เจอร์ — รัน qc-acc-v2-equity / goods / deferral / branches ด้วย KEEP=1 ก่อน");
  process.exit(2);
}
const sysOf = async (tid: string) => (await prisma.appSystem.findFirst({ where: { tenantId: tid, type: "ACCOUNT" }, orderBy: { createdAt: "asc" }, select: { id: true } }))!.id;
const [S58, S59, S510, S511] = await Promise.all([T58, T59, T510, T511].map((t) => sysOf(t.id)));

async function purgeTenant(tenantId: string) {
  const rows: { table_name: string }[] = await prisma.$queryRaw`
    SELECT c.table_name FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
    WHERE c.table_schema = 'public' AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE'`;
  let pending = rows.map((r) => r.table_name).filter((t) => t !== "TenantDeletionLog");
  for (let pass = 0; pass < 12 && pending.length > 0; pass++) {
    const still: string[] = [];
    for (const t of pending) {
      try {
        await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, tenantId);
      } catch {
        still.push(t);
      }
    }
    if (still.length === pending.length) break;
    pending = still;
  }
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
}

const stamp = Date.now().toString(36);
const viewer = await prisma.user.create({ data: { email: `qc-vis-t5b-${stamp}@qc.local`, name: "ผู้ตรวจจอ T5b" } });
for (const t of [T58, T59, T510, T511]) await prisma.membership.create({ data: { userId: viewer.id, tenantId: t.id, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
const token = `qcvist5b${stamp}${Math.random().toString(36).slice(2)}`;
const ttl = new Date(Date.now() + 3 * 3600_000);
await prisma.session.create({ data: { userId: viewer.id, tokenHash: createHash("sha256").update(token).digest("hex"), userAgent: "visual-acc-v2-t5b", idleExpiresAt: ttl, expiresAt: ttl } });

const pptr = await import("/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js" as string);
const browser = await pptr.default.launch({ executablePath: "/usr/bin/chromium-browser", args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", `--user-data-dir=${ROOT}/.qc-shots/chr-t5b-${process.pid}`] });
const host = new URL(BASE).hostname;
const open = async (tenantId: string, path: string, w = 1440) => {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument("window.__name = window.__name || ((f) => f);");
  await page.setViewport({ width: w, height: w > 500 ? 900 : 844, deviceScaleFactor: 1 });
  await page.setCookie({ name: "shark_session", value: token, domain: host, path: "/" }, { name: "shark_tenant", value: tenantId, domain: host, path: "/" });
  const errs: string[] = [];
  page.on("pageerror", (e: Any) => errs.push(String(e).slice(0, 200)));
  const r = await page.goto(BASE + path, { waitUntil: "networkidle2", timeout: 120_000 });
  return { page, status: r?.status() ?? 0, errs };
};
const shot = async (page: Any, name: string) => {
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true });
  writeFileSync(join(OUT, `${name}.txt`), await page.evaluate(() => document.body.innerText));
};
const text = (page: Any) => page.evaluate(() => document.body.innerText) as Promise<string>;
const both = async (tenantId: string, path: string, name: string) => {
  const d = await open(tenantId, path, 1440);
  await shot(d.page, `${name}-d`);
  const m = await open(tenantId, path, 390);
  await shot(m.page, `${name}-m`);
  const t = await text(d.page);
  await m.page.close();
  return { ...d, t };
};
const submit = async (page: Any, sel: string) => {
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60_000 }).catch(() => null), page.click(sel)]);
  await sleep(300);
};

try {
  // ═══ V0 ดัชนีรายงาน ═══
  {
    const { page, status, t } = await both(T58.id, `/app/sys/${S58}/account/reports`, "v0-reports-index");
    chk("V0.1", "ดัชนีรายงานมี 4 หน้าใหม่", status === 200 && /งบแสดงการเปลี่ยนแปลงส่วนของเจ้าของ/.test(t) && /รายงานสินค้าและวัตถุดิบ/.test(t) && /รายได้รับล่วงหน้าทยอยรับรู้/.test(t) && /สาขาและรายงานภาษีแยกสาขา/.test(t), status);
    await page.close();
  }
  // ═══ V1 งบแสดงการเปลี่ยนแปลงส่วนของเจ้าของ + เทียบงวดก่อน (T5.8) ═══
  console.log("\nV1 งบส่วนของเจ้าของ");
  {
    const { page, status, t, errs } = await both(T58.id, `/app/sys/${S58}/account/reports/equity?to=2026-12`, "v1-equity");
    const close = await page.$eval("[data-testid=equity-current-CLOSING-total]", (e: Element) => (e as HTMLElement).innerText).catch(() => "");
    chk("V1.1", "เปิดได้ · ป้ายร่าง · ปลายงวด 170,000 · งวดก่อนแสดง (ค่าเริ่ม) · ไม่มีแถบไม่สมดุล", status === 200 && /ร่างสำหรับผู้ทำบัญชี\/ผู้สอบบัญชี/.test(t) && /170,000\.00/.test(close) && !!(await page.$("[data-testid=equity-prior]")) && !/ไม่สมดุล/.test(t) && errs.length === 0, { status, close, errs });
    await page.click("[data-testid=report-compare-toggle] input");
    await page.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => null);
    await sleep(500);
    await shot(page, "v1-equity-nocompare-d");
    chk("V1.2", "ติ๊กออก 'เทียบงวดก่อน' → cmp=0 · ไม่มีงวดก่อน", /cmp=0/.test(page.url()) && !(await page.$("[data-testid=equity-prior]")), page.url());
    await page.close();
    const bs = await both(T58.id, `/app/sys/${S58}/account/reports/balance-sheet?asOf=2026-12`, "v1-bs-default");
    chk("V1.3", "งบฐานะ: เทียบเป็นค่าเริ่ม · เทียบ ณ สิ้นเดือน 2025-12", bs.status === 200 && (await bs.page.$$("[data-testid^=bs-prev-]")).length > 0 && /เทียบ ณ สิ้นเดือน 2025-12/.test(bs.t), bs.t.slice(0, 200));
    await bs.page.close();
    const pl = await both(T58.id, `/app/sys/${S58}/account/reports/profit-loss?from=2026-01&to=2026-12`, "v1-pl-default");
    chk("V1.4", "งบกำไรขาดทุน: เทียบงวดก่อนเป็นค่าเริ่ม (2025)", pl.status === 200 && /2025/.test(pl.t), pl.t.slice(0, 200));
    await pl.page.close();
  }
  // ═══ V2 สินค้า · ของเสีย · ถือเป็นขาย (T5.9) ═══
  console.log("\nV2 สินค้า");
  {
    const { page, status, t, errs } = await both(T59.id, `/app/sys/${S59}/account/reports/goods`, "v2-goods");
    chk("V2.1", "รับ·จ่าย·คงเหลือ: 1 แถว · คงเหลือ 18 · คำเตือนไม่มี path", status === 200 && (await page.$$("[data-testid=goods-row]")).length === 1 && /18/.test(await page.$eval("[data-testid=goods-row]", (e: Element) => (e as HTMLElement).innerText)) && !FORBID.test(t) && errs.length === 0, { status, errs, bad: t.match(FORBID)?.[0] });
    await submit(page, "[data-testid=goods-tab-waste]");
    await shot(page, "v2-goods-waste-d");
    const wrows = (await page.$$("[data-testid=waste-row]")).length;
    chk("V2.2", "แท็บของเสีย/ทำลาย: 2 ใบ", wrows === 2, wrows);
    const inputs = await page.$$("[data-testid=waste-witness]");
    await inputs[inputs.length - 1].click({ clickCount: 3 });
    await inputs[inputs.length - 1].type("พยานบนจอ");
    const saves = await page.$$("[data-testid=waste-save]");
    await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => null), saves[saves.length - 1].click()]);
    await sleep(400);
    const t2 = await text(page);
    await shot(page, "v2-goods-waste-saved-d");
    chk("V2.3", "กดบันทึกพยาน → ข้อความบันทึกแล้ว · แสดงชื่อพยาน", /บันทึกพยานแล้ว/.test(t2) && /พยานบนจอ/.test(t2), t2.slice(0, 300));
    await submit(page, "[data-testid=goods-tab-deemed]");
    await shot(page, "v2-goods-deemed-d");
    const dv = await page.$$eval("[data-testid=deemed-vat]", (els: Element[]) => els.map((e) => (e as HTMLElement).innerText));
    chk("V2.4", "แท็บถือเป็นขาย: 2 แถว + ภาษีขายโดยประมาณ · ของแถม 1", dv.length === 2 && (await page.$$("[data-testid=giveaway-row]")).length === 1, dv);
    await page.select("[data-testid=deemed-setting]", "OFF");
    await submit(page, "[data-testid=deemed-save]");
    const t3 = await text(page);
    await shot(page, "v2-goods-deemed-off-d");
    chk("V2.5", "ตั้ง OFF → บันทึก · ซ่อนคอลัมน์ภาษี · คำเตือนว่าปิดอยู่", /บันทึกค่าตั้งแล้ว/.test(t3) && (await page.$$("[data-testid=deemed-vat]")).length === 0 && /ร้านปิดการแสดงยอดถือเป็นขาย|ร้านตั้งไม่ให้แสดงยอด/.test(t3), t3.slice(0, 300));
    await page.select("[data-testid=deemed-setting]", "WARN");
    await submit(page, "[data-testid=deemed-save]");
    await page.close();
    const m = await open(T59.id, `/app/sys/${S59}/account/reports/goods?tab=deemed`, 390);
    await shot(m.page, "v2-goods-deemed-m");
    await m.page.close();
    const mw = await open(T59.id, `/app/sys/${S59}/account/reports/goods?tab=waste`, 390);
    await shot(mw.page, "v2-goods-waste-m");
    await mw.page.close();
  }
  // ═══ V3 รายได้รับล่วงหน้า (T5.10) ═══
  console.log("\nV3 รายได้รับล่วงหน้า");
  {
    const { page, status, t, errs } = await both(T510.id, `/app/sys/${S510}/account/reports/deferrals`, "v3-deferrals");
    chk("V3.1", "เปิดได้ · 2 ตาราง (DONE + ยกเลิก) · คำเตือนจุดรับผิดภาษี", status === 200 && (await page.$$("[data-testid=def-row]")).length === 2 && /ไม่เปลี่ยนจุดรับผิดภาษี/.test(t) && !FORBID.test(t) && errs.length === 0, { status, errs, bad: t.match(FORBID)?.[0] });
    await page.type("[data-testid=def-desc]", "ค่าสมาชิกบนจอ");
    await page.type("[data-testid=def-amount]", "1200");
    await page.$eval("[data-testid=def-start]", (e: Element) => ((e as HTMLInputElement).value = "2026-01"));
    await submit(page, "[data-testid=def-submit]");
    const t2 = await text(page);
    await shot(page, "v3-deferrals-created-d");
    chk("V3.2", "ตั้งรายได้รับล่วงหน้า 1,200 บาท 12 เดือน → 3 แถว", /ตั้งรายได้รับล่วงหน้าแล้ว/.test(t2) && (await page.$$("[data-testid=def-row]")).length === 3, t2.slice(0, 300));
    await page.$eval("[data-testid=def-upto]", (e: Element) => ((e as HTMLInputElement).value = "2026-03"));
    await submit(page, "[data-testid=def-recognize]");
    const t3 = await text(page);
    const rec = await page.$$eval("[data-testid=def-recognized]", (els: Element[]) => els.map((e) => (e as HTMLElement).innerText));
    await shot(page, "v3-deferrals-recognized-d");
    chk("V3.3", "รับรู้ถึง 2026-03 → ลง 3 รายการ · รับรู้แล้ว 300.00", /ลงรายการรับรู้รายได้ 3 รายการ/.test(t3) && rec.some((x: string) => /300\.00/.test(x)), { t: t3.slice(0, 200), rec });
    const reasons = await page.$$("[data-testid=def-cancel-reason]");
    await reasons[0].type("ทดสอบจอ ยกเลิก");
    const cancels = await page.$$("[data-testid=def-cancel]");
    await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => null), cancels[0].click()]);
    await sleep(400);
    const t4 = await text(page);
    await shot(page, "v3-deferrals-cancelled-d");
    chk("V3.4", "ยกเลิก (กลับรายการ) พร้อมเหตุผล → ยกเลิกแล้ว 4 ใบ", /ยกเลิกแล้ว \(กลับรายการ 4 ใบ\)/.test(t4), t4.slice(0, 300));
    await page.close();
  }
  // ═══ V4 สาขา (T5.11) ═══
  console.log("\nV4 สาขา");
  {
    const { page, status, t, errs } = await both(T511.id, `/app/sys/${S511}/account/reports/branch-tax`, "v4-branch-hq");
    chk("V4.1", "เปิดได้ · สนญ. ภาษีขาย 7,000.00 (70.00 บาท) 1 แถว", status === 200 && (await page.$$("[data-testid=br-sales-row]")).length === 1 && /70\.00/.test(await page.$eval("[data-testid=br-sales-vat]", (e: Element) => (e as HTMLElement).innerText)) && !FORBID.test(t) && errs.length === 0, { status, errs, bad: t.match(FORBID)?.[0] });
    await page.select("[data-testid=br-select]", "00001");
    await submit(page, "[data-testid=br-apply]");
    await shot(page, "v4-branch-00001-d");
    const v = await page.$eval("[data-testid=br-sales-vat]", (e: Element) => (e as HTMLElement).innerText);
    chk("V4.2", "เลือกสาขา 00001 → 2 แถว ภาษี 350.00 · หัว 'สาขาที่ 00001 (เชียงใหม่)'", (await page.$$("[data-testid=br-sales-row]")).length === 2 && /350\.00/.test(v) && /สาขาที่ 00001 \(เชียงใหม่\)/.test(await text(page)), v);
    const last = (await page.$$("[data-testid=br-edit-row]")).length - 1;
    await page.type(`[data-testid=br-code-${last}]`, "00003");
    await page.type(`[data-testid=br-name-${last}]`, "ขอนแก่น");
    await submit(page, "[data-testid=br-save]");
    const t2 = await text(page);
    await shot(page, "v4-branch-saved-d");
    chk("V4.3", "เพิ่มสาขา 00003 ขอนแก่น → บันทึก · มีในตัวเลือก", /บันทึกสาขาแล้ว/.test(t2) && (await page.$$eval("[data-testid=br-select] option", (o: Element[]) => o.map((x) => (x as HTMLOptionElement).value))).includes("00003"), t2.slice(0, 200));
    await page.select("[data-testid=br-mode]", "COMBINED");
    await submit(page, "[data-testid=br-save]");
    const t3 = await text(page);
    chk("V4.4", "ยื่นรวมไม่ติ๊กยืนยัน → ข้อความให้ยืนยัน (ไม่บันทึก)", /ยื่นรวมต้องติ๊กยืนยัน/.test(t3), t3.slice(0, 200));
    await page.select("[data-testid=br-mode]", "COMBINED");
    await page.click("[data-testid=br-ack]");
    await submit(page, "[data-testid=br-save]");
    const t4 = await text(page);
    await shot(page, "v4-branch-combined-d");
    chk("V4.5", "ติ๊กยืนยัน → บันทึก · คำเตือนยื่นรวม (ม.83 วรรคสี่)", /บันทึกสาขาแล้ว/.test(t4) && /ยื่น ภ\.พ\.30 รวมทุกสาขา|ยื่นแบบแยกแต่ละแห่ง/.test(t4), t4.slice(0, 300));
    await page.close();
    const m = await open(T511.id, `/app/sys/${S511}/account/reports/branch-tax?branch=00001`, 390);
    await shot(m.page, "v4-branch-00001-m");
    await m.page.close();
  }
} catch (e) {
  chk("CRASH", "จบ", false, e instanceof Error ? `${e.message}\n${e.stack?.split("\n").slice(1, 4).join("\n")}` : String(e));
} finally {
  await browser.close().catch(() => undefined);
  await prisma.session.deleteMany({ where: { userAgent: "visual-acc-v2-t5b" } }).catch(() => undefined);
  await prisma.membership.deleteMany({ where: { userId: viewer.id } }).catch(() => undefined);
  await prisma.user.delete({ where: { id: viewer.id } }).catch(() => undefined);
  if (process.env.KEEP_FIXTURES !== "1") for (const t of [T58, T59, T510, T511]) await purgeTenant(t.id).catch(() => undefined);
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== visual T5b: ผ่าน ${cks.length - f.length}/${cks.length} =====`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.length ? 1 : 0);
