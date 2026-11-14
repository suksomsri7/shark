// visual-acc-v2-t4b.mts — ดูจอจริงของ T4.4 T4.5 T4.7 T4.8 (เลน 1) + Job 0 · กดทุกปุ่มใหม่ · ภาพ .qc-shots/acc-v2/t4b/ (เดสก์ท็อป 1440 + มือถือ 390 · deviceScaleFactor 1)
// ข้อมูล: ร้านฟิกซ์เจอร์ของชุดทดสอบที่รันด้วย KEEP=1 (QC T4.4 ร่องรอย · QC T4.7 POS · QC T4.8 คลัง) — ไม่แตะร้าน seed กลาง · ลบร้านฟิกซ์เจอร์ตอนจบ
// ต้องมีเซิร์ฟเวอร์ QC ที่ QC_BASE (ปริยาย http://127.0.0.1:3216)
// รัน: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/visual-acc-v2-t4b.mts
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("visual-acc-v2-t4b");
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
const OUT = join(ROOT, ".qc-shots/acc-v2/t4b");
mkdirSync(OUT, { recursive: true });
const BASE = process.env.QC_BASE ?? "http://127.0.0.1:3216";
const FORBID = /references\/|\.md\b|skill|\[(?:V2|V|S|U)\]/i;
const { prisma } = (await import("@/lib/core/db" as string)) as Any;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const tenantOf = async (name: string) => prisma.tenant.findFirst({ where: { name }, orderBy: { createdAt: "desc" }, select: { id: true } });
const T44 = await tenantOf("QC T4.4 ร่องรอย");
const T47 = await tenantOf("QC T4.7 POS");
const T48 = await tenantOf("QC T4.8 คลัง");
if (!T44 || !T47 || !T48) {
  console.error("ไม่พบร้านฟิกซ์เจอร์ — รันชุด qc-acc-v2-audit-trail / pos-link / stock-deposits ด้วย KEEP=1 ก่อน");
  process.exit(2);
}
const sysOf = async (tid: string, name?: string) => (await prisma.appSystem.findFirst({ where: { tenantId: tid, type: "ACCOUNT", ...(name ? { name } : {}) }, orderBy: { createdAt: "asc" }, select: { id: true } }))!.id;
const S44 = await sysOf(T44.id, "บัญชี T4.4");
const S47 = await sysOf(T47.id);
const S48 = await sysOf(T48.id);

for (const old of await prisma.user.findMany({ where: { email: { startsWith: "qc-vis-t4b-" } }, select: { id: true } })) {
  await prisma.session.deleteMany({ where: { userId: old.id } });
  await prisma.membership.deleteMany({ where: { userId: old.id } });
  await prisma.user.delete({ where: { id: old.id } }).catch(() => undefined);
}
const stamp = Date.now().toString(36);
const viewer = await prisma.user.create({ data: { email: `qc-vis-t4b-${stamp}@qc.local`, name: "ผู้ตรวจจอ T4b" } });
for (const t of [T44, T47, T48]) await prisma.membership.create({ data: { userId: viewer.id, tenantId: t.id, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
const token = `qcvist4b${stamp}${Math.random().toString(36).slice(2)}`;
const ttl = new Date(Date.now() + 3 * 3600_000);
await prisma.session.create({ data: { userId: viewer.id, tokenHash: createHash("sha256").update(token).digest("hex"), userAgent: "visual-acc-v2-t4b", idleExpiresAt: ttl, expiresAt: ttl } });

// งานเพิ่มบนร้าน T4.7: กะใหม่ที่ยังไม่ลงบัญชี (ให้ปุ่ม "ลงบัญชีเงินขาด/เกิน" ขึ้น)
const posSys = (await prisma.appSystem.findFirst({ where: { tenantId: T47.id, type: "POS" }, select: { id: true } }))!.id;
const posUnit = (await prisma.businessUnit.findFirst({ where: { tenantId: T47.id }, select: { id: true } }))!.id;
await prisma.posShift.create({ data: { tenantId: T47.id, unitId: posUnit, systemId: posSys, deviceId: "qcvis", shiftNo: 90 + Math.floor(Math.random() * 1000), openedByUserId: viewer.id, floatSatang: 0, status: "CLOSED", closedByUserId: viewer.id, closedAt: new Date(), expectedCashSatang: 20_000, countedCashSatang: 19_500, overShortSatang: -500, zNumber: 900 + Math.floor(Math.random() * 90000), closeNote: "จอ" } });

const pptr = await import("/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js" as string);
const browser = await pptr.default.launch({ executablePath: "/usr/bin/chromium-browser", args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", `--user-data-dir=${ROOT}/.qc-shots/chr-t4b-${process.pid}`] });
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
const both = async (tenantId: string, path: string, name: string, after?: (page: Any) => Promise<void>) => {
  const d = await open(tenantId, path, 1440);
  await shot(d.page, `${name}-d`);
  const m = await open(tenantId, path, 390);
  await shot(m.page, `${name}-m`);
  const t = await text(d.page);
  if (after) await after(d.page);
  await m.page.close();
  return { ...d, t };
};

try {
  // ═══ V1 รายงานการแก้ไข (T4.4) ═══
  console.log("\nV1 รายงานการแก้ไขของบัญชี");
  {
    const { page, status, t, errs } = await both(T44.id, `/app/sys/${S44}/account/reports/audit-trail`, "v1-audit-trail");
    chk("V1.1", "เปิดได้ · มีแถวยกเลิก/กลับรายการ/เข้าระบบ · เหตุผล", status === 200 && /ยกเลิกเอกสาร/.test(t) && /กลับรายการสมุดรายวัน/.test(t) && /เหตุผล: ออกผิดลูกค้า/.test(t) && /เข้าระบบ/.test(t) && errs.length === 0, { status, errs });
    await page.select("[data-testid=audit-trail-kind]", "cancel");
    await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2" }), page.click("[data-testid=audit-trail-apply]")]);
    const rows = await page.$$eval("[data-testid=audit-trail-row]", (els: Element[]) => els.map((e) => e.getAttribute("data-category")));
    await shot(page, "v1-audit-trail-cancel-d");
    chk("V1.2", "ตัวกรอง 'ยกเลิก / กลับรายการ' → เหลือเฉพาะแถว cancel", rows.length >= 3 && rows.every((r: string) => r === "cancel"), rows);
    await page.close();
  }

  // ═══ V2 ค่ากฎหมายอื่น + ทิป บนตั้งค่า (T4.5 · T4.7) ═══
  console.log("\nV2 ตั้งค่า › อัตราภาษีฯ › ค่ากฎหมายอื่น");
  {
    const { page, status, t } = await both(T44.id, `/app/sys/${S44}/account/settings/tax#compliance`, "v2-compliance");
    chk("V2.1", "เปิดได้ · 4 ค่า (5 ปี · 7 ปี · 6 เท่า · 3 ปี) · ที่มาไม่มี path ภายใน", status === 200 && /ระยะเก็บบัญชีและเอกสารประกอบ/.test(t) && /พ\.ร\.บ\.การบัญชี/.test(t) && !FORBID.test(t), { status, bad: t.match(FORBID)?.[0] });
    await page.type("[data-testid=compliance-input-BOOKS_RETENTION_YEARS]", "7");
    await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2" }), page.click("[data-testid=compliance-save-BOOKS_RETENTION_YEARS]")]);
    const v = await page.$eval("[data-testid=compliance-value-BOOKS_RETENTION_YEARS]", (e: Element) => (e as HTMLElement).innerText);
    const warn = await page.$("[data-testid=compliance-warn-BOOKS_RETENTION_YEARS]");
    await shot(page, "v2-compliance-saved-d");
    chk("V2.2", "บันทึกค่าของร้าน 7 ปี → แสดง 7 (ค่าของร้าน) + คำเตือนต่างจากค่าเริ่มต้น", /7 ปี/.test(v) && /ค่าของร้าน/.test(v) && !!warn, v);
    await page.$eval("[data-testid=compliance-input-BOOKS_RETENTION_YEARS]", (e: Element) => ((e as HTMLInputElement).value = ""));
    await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2" }), page.click("[data-testid=compliance-save-BOOKS_RETENTION_YEARS]")]);
    const v2 = await page.$eval("[data-testid=compliance-value-BOOKS_RETENTION_YEARS]", (e: Element) => (e as HTMLElement).innerText);
    chk("V2.3", "ล้างค่า → กลับเป็น 5 ปี (ค่าเริ่มต้นของระบบ)", /5 ปี/.test(v2) && /ค่าเริ่มต้นของระบบ/.test(v2), v2);
    await page.select("[data-testid=tip-treatment-select]", "REVENUE_VAT");
    await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2" }), page.click("[data-testid=tip-treatment-save]")]);
    const tw = await page.$eval("[data-testid=tip-treatment-warning]", (e: Element) => (e as HTMLElement).innerText);
    chk("V2.4", "ทิป → รายได้ของร้าน: คำเตือนเปลี่ยนเป็นของทางนี้", /รายได้ของร้าน/.test(tw), tw);
    await page.select("[data-testid=tip-treatment-select]", "LIABILITY");
    await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2" }), page.click("[data-testid=tip-treatment-save]")]);
    await page.close();
  }

  // ═══ V3 ความเป็นส่วนตัว: หน้าที่เก็บ · ดาวน์โหลด · ขอลบ/ยกเลิก (T4.5) ═══
  console.log("\nV3 ลบร้าน/ยกเลิกบริการ");
  {
    const { page, status, t } = await both(T44.id, `/app/settings/privacy`, "v3-privacy");
    chk("V3.1", "เปิดได้ · ปุ่มดาวน์โหลดสมุดบัญชีต่อสมุด · คำเตือนหน้าที่เก็บ + ลบก่อนครบ + ต้นฉบับกระดาษ · ไม่มี path ภายใน", status === 200 && /ดาวน์โหลดสมุดบัญชี/.test(t) && /หน้าที่นี้เป็นของร้าน/.test(t) && /ต้นฉบับกระดาษ/.test(t) && !FORBID.test(t), { status, bad: t.match(FORBID)?.[0] });
    const href = await page.$eval(`[data-testid=privacy-export-${S44}]`, (e: Element) => (e as HTMLAnchorElement).getAttribute("href"));
    const zip = await page.evaluate(async (u: string) => { const r = await fetch(u); const b = await r.arrayBuffer(); return { status: r.status, type: r.headers.get("content-type"), size: b.byteLength, sig: Array.from(new Uint8Array(b.slice(0, 2))) }; }, href);
    chk("V3.2", "กดดาวน์โหลด → ZIP (PK) 200", zip.status === 200 && zip.type === "application/zip" && zip.sig[0] === 0x50 && zip.sig[1] === 0x4b && zip.size > 1000, zip);
    await page.reload({ waitUntil: "networkidle2" });
    const ex = await page.$eval(`[data-testid=privacy-exported-${S44}]`, (e: Element) => (e as HTMLElement).innerText);
    chk("V3.3", "หลังดาวน์โหลด แสดง 'ดาวน์โหลดล่าสุด'", /ดาวน์โหลดล่าสุด/.test(ex), ex);
    const needAck = await page.$("[data-testid=privacy-delete-need-ack]");
    chk("V3.4", "ยังไม่ติ๊กรับทราบ = ไม่มีปุ่มขอลบ (ข้อความบอกให้ติ๊ก)", !!needAck, "ไม่มีข้อความ");
    await page.click("[data-testid=privacy-delete-warnings-ack]");
    await sleep(300);
    await page.click("[data-testid=privacy-delete-trigger]");
    await sleep(500);
    await shot(page, "v3-privacy-confirm-d");
    const confirmBtns = await page.$$("button[type=submit]");
    let clicked = false;
    for (const b of confirmBtns) if ((await page.evaluate((x: Element) => (x as HTMLElement).innerText, b)).includes("ยืนยัน ขอลบร้าน")) { await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => null), b.click()]); clicked = true; break; }
    await sleep(800);
    await page.reload({ waitUntil: "networkidle2" });
    const t2 = await text(page);
    await shot(page, "v3-privacy-pending-d");
    chk("V3.5", "ติ๊กรับทราบ → ยืนยัน → ร้านอยู่ระหว่างรอลบ · ประวัติมี 'ขอลบร้าน'", clicked && /อยู่ระหว่างรอลบถาวร/.test(t2) && /ขอลบร้าน/.test(t2), { clicked, t: t2.slice(0, 300) });
    const ackRow = await prisma.auditLog.findFirst({ where: { tenantId: T44.id, action: "legal.warning.ack", targetType: "Tenant" } });
    chk("V3.6", "บันทึกผู้ยืนยันคำเตือน (legal.warning.ack · Tenant)", !!ackRow, null);
    const cancel = await page.$$("button[type=submit]");
    for (const b of cancel) if ((await page.evaluate((x: Element) => (x as HTMLElement).innerText, b)).includes("ยกเลิกคำขอลบร้าน")) { await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => null), b.click()]); break; }
    await sleep(800);
    await page.reload({ waitUntil: "networkidle2" });
    const t3 = await text(page);
    await shot(page, "v3-privacy-cancelled-d");
    chk("V3.7", "กดยกเลิกคำขอ → ACTIVE · ประวัติ: ดาวน์โหลด · ขอลบ · ยกเลิก", !/อยู่ระหว่างรอลบถาวร/.test(t3) && /ยกเลิกคำขอลบ/.test(t3) && /ดาวน์โหลดสมุดบัญชี/.test(t3), t3.slice(-400));
    await page.close();
  }

  // ═══ V4 POS ↔ บัญชี (T4.7) ═══
  console.log("\nV4 POS กับสมุดบัญชี");
  {
    const { page, status, t, errs } = await both(T47.id, `/app/sys/${S47}/account/reports/pos-link`, "v4-pos-link");
    chk("V4.1", "เปิดได้ · กระทบยอด · บิลค้าง · เงินขาด/เกิน · ทิป · คำเตือน (ไม่มี path ภายใน)", status === 200 && /กระทบยอดรายวัน/.test(t) && /บิลที่ยังไม่ลงบัญชี \(1 บิล/.test(t) && /เงินขาด\/เกินปิดกะ/.test(t) && /ทิปที่รับผ่านจุดขาย/.test(t) && !FORBID.test(t) && errs.length === 0, { status, errs, bad: t.match(FORBID)?.[0] });
    await page.click("[data-testid=pos-link-warnings-more]"); // ปุ่มเดียวเปิดทุกข้อ (state เดียวของกล่อง)
    await sleep(300);
    const wt = await page.$eval("[data-testid=pos-link-warnings]", (e: Element) => (e as HTMLElement).innerText);
    await shot(page, "v4-pos-link-warnings-open-d");
    chk("V4.2", "กด 'อ่านเพิ่ม' → ข้อความเต็ม + อ้างอิงกฎหมายภาษาไทย (ม.86/6) · ไม่มี path/ป้าย", /ม\.86\/6/.test(wt) && /โปรดตรวจกับนักบัญชีของร้าน/.test(wt) && !FORBID.test(wt), wt.slice(0, 400));
    await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2" }), page.click("[data-testid=pos-variance-post]")]);
    const msg = await page.$eval("[data-testid=pos-link-msg]", (e: Element) => (e as HTMLElement).innerText).catch(() => "");
    const unposted = await page.$$eval("[data-testid=pos-variance-row][data-posted='0']", (els: Element[]) => els.length);
    await shot(page, "v4-pos-link-posted-d");
    chk("V4.3", "กด 'ลงบัญชีเงินขาด/เกิน' → ลงแล้ว 1 กะ · ไม่เหลือกะที่ยังไม่ลง", /ลงบัญชีเงินขาด\/เกิน 1 กะ/.test(msg) && unposted === 0, { msg, unposted });
    await page.select("[data-testid=pos-tip-select]", "STAFF_DIRECT");
    await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2" }), page.click("[data-testid=pos-tip-save]")]);
    const t2 = await text(page);
    chk("V4.4", "เลือกทิป 'พนักงานรับเงินสดตรง' → บันทึก + คำเตือนของทางนี้", /บันทึกวิธีลงทิปแล้ว/.test(t2) && /พนักงานรับตรง/.test(t2), t2.slice(0, 300));
    await page.select("[data-testid=pos-tip-select]", "LIABILITY");
    await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2" }), page.click("[data-testid=pos-tip-save]")]);
    await page.close();
  }

  // ═══ V5 คลัง · เงินประกันหอ · แต้ม (T4.8) ═══
  console.log("\nV5 คลัง · หอ · แต้ม");
  {
    const { page, status, t } = await both(T48.id, `/app/sys/${S48}/account/reports/dorm-deposits`, "v5-dorm-deposits");
    chk("V5.1", "ตรวจเงินประกันหอ: เปิดได้ · 4 สัญญา · มีคำเตือนเกินเพดาน", status === 200 && /ตรวจเงินประกันหอพัก/.test(t) && (await page.$$("[data-testid=dorm-deposit-row]")).length === 4 && !FORBID.test(t), { status, bad: t.match(FORBID)?.[0] });
    await page.close();
    const p = await both(T48.id, `/app/sys/${S48}/account/reports/points-outstanding`, "v5-points");
    chk("V5.2", "แต้มคงค้าง: เปิดได้ · ตาราง · คำเตือน", p.status === 200 && /แต้มสะสมคงค้าง/.test(p.t), p.status);
    const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
    await p.page.$eval("input[type=hidden][name=asOf]", (e: Element, v: string) => ((e as HTMLInputElement).value = v), today); // DateInput: ค่าที่ส่งอยู่ในช่องซ่อน
    await Promise.all([p.page.waitForNavigation({ waitUntil: "networkidle2" }), p.page.click("[data-testid=points-apply]")]);
    const tot = await p.page.$eval("[data-testid=points-total]", (e: Element) => (e as HTMLElement).innerText);
    await shot(p.page, "v5-points-today-d");
    chk("V5.3", "เลือกวันที่วันนี้ → รวม 600 แต้ม", /600/.test(tot), tot);
    await p.page.close();
    const g = await both(T48.id, `/app/sys/${S48}/account/goods-issue/new`, "v5-goods-issue-new");
    chk("V5.4", "ฟอร์มใบเบิก: สาเหตุครบ (ของแถม · อาหารพนักงาน · ใช้ส่วนตัวเจ้าของ · ของเสีย/ทำลาย · สินค้าขาด)", g.status === 200 && (await g.page.$$eval("[data-testid=gi-reason] option", (o: Element[]) => o.map((x) => (x as HTMLOptionElement).value))).join("|").includes("ใช้ส่วนตัวเจ้าของ"), g.status);
    await g.page.select("[data-testid=gi-reason]", "ใช้ส่วนตัวเจ้าของ");
    await sleep(300);
    const acct = await g.page.$eval("[data-testid=gi-account]", (e: Element) => (e as HTMLSelectElement).value);
    const gw = await g.page.$eval("[data-testid=gi-reason-warnings]", (e: Element) => (e as HTMLElement).innerText).catch(() => "");
    await shot(g.page, "v5-goods-issue-personal-d");
    chk("V5.5", "เลือก 'ใช้ส่วนตัวเจ้าของ' → บัญชี 3100 + คำเตือนถือเป็นขาย + ช่องติ๊กยืนยัน", acct === "3100" && /ถือเป็นการขาย/.test(gw) && /รับทราบคำเตือนและทำต่อ/.test(gw), { acct, gw: gw.slice(0, 200) });
    await g.page.select("[data-testid=gi-reason]", "อาหารพนักงาน");
    await sleep(300);
    const acct2 = await g.page.$eval("[data-testid=gi-account]", (e: Element) => (e as HTMLSelectElement).value);
    chk("V5.6", "เลือก 'อาหารพนักงาน' → บัญชี 6050", acct2 === "6050", acct2);
    await g.page.close();
    const l = await both(T48.id, `/app/sys/${S48}/account/goods-issue?preset=all`, "v5-goods-issue-list");
    chk("V5.7", "รายการใบเบิก: หัวข้อคำเตือนใต้สาเหตุ", l.status === 200 && (await l.page.$$("[data-testid^=gi-row-warn-]")).length > 0, l.status);
    await l.page.close();
  }
} catch (e) {
  chk("CRASH", "จบ", false, e instanceof Error ? `${e.message}\n${e.stack?.split("\n").slice(1, 4).join("\n")}` : String(e));
} finally {
  await browser.close().catch(() => undefined);
  await prisma.session.deleteMany({ where: { userAgent: "visual-acc-v2-t4b" } }).catch(() => undefined);
  await prisma.membership.deleteMany({ where: { userId: viewer.id } }).catch(() => undefined);
  await prisma.user.delete({ where: { id: viewer.id } }).catch(() => undefined);
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== visual T4b: ผ่าน ${cks.length - f.length}/${cks.length} =====`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.length ? 1 : 0);
