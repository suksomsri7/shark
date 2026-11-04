// S2.5 interaction check (QC web export of /root/qc-shark-mobile-sec-d/dist · mocks from fixture s2.5.json · no real server)
// run: cp README-click.mjs.txt <scratch>/s25-click.mjs && node <scratch>/s25-click.mjs <s2.5.json> <outdir>
import puppeteer from "/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";
import { createServer } from "node:http"; import { readFileSync, existsSync, statSync, mkdirSync, rmSync, writeFileSync } from "node:fs"; import { join, extname } from "node:path";
const DIST = "/root/qc-shark-mobile-sec-d/dist", FX = JSON.parse(readFileSync(process.argv[2], "utf8")), OUT = process.argv[3];
mkdirSync(OUT, { recursive: true });
const srv = createServer((q, r) => { let f = join(DIST, decodeURIComponent(new URL(q.url, "http://x").pathname)); if (!existsSync(f) || statSync(f).isDirectory()) f = join(DIST, "index.html"); r.writeHead(200, { "content-type": { ".html": "text/html", ".js": "application/javascript", ".ttf": "font/ttf", ".png": "image/png" }[extname(f)] ?? "application/octet-stream" }); r.end(readFileSync(f)); }).listen(4726);
const UDD = `/tmp/chr-s25-${process.pid}`;
const b = await puppeteer.launch({ executablePath: "/usr/bin/chromium-browser", headless: true, args: ["--no-sandbox", `--user-data-dir=${UDD}`] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const res = {};
async function open(route, over = {}) {
  const p = await b.newPage(); await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 }); await p.setRequestInterception(true);
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS" };
  const log = [];
  p.on("request", (q) => { const u = new URL(q.url()); if (u.host === "shark.in.th") { if (q.method() === "OPTIONS") return q.respond({ status: 204, headers: cors, body: "" }); const k = `${q.method()} ${u.pathname}`; const body = q.postData() ?? null; log.push({ k, q: u.search, body, tenant: q.headers()["x-tenant-id"] ?? null }); const o = over[k]; if (o) { const r = typeof o === "function" ? o(body) : o; return q.respond({ status: r.status ?? 200, headers: cors, contentType: "application/json", body: JSON.stringify(r.body) }); } const bd = FX.endpoints[k]; return q.respond({ status: bd ? 200 : 404, headers: cors, contentType: "application/json", body: JSON.stringify(bd ?? { error: "x" }) }); } q.continue(); });
  await p.evaluateOnNewDocument(() => { localStorage.clear(); localStorage.setItem("shark_theme", "light"); localStorage.setItem("shark_token", "qc-mock"); localStorage.setItem("shark_tenant", "t1"); });
  await p.goto("http://127.0.0.1:4726" + route, { waitUntil: "networkidle0" });
  return { p, log };
}
const nth = async (p, id, i = 0) => (await p.$$(`[data-testid="${id}"]`))[i];
const text = (p, id) => p.$eval(`[data-testid="${id}"]`, (e) => e.innerText).catch(() => null);
const calls = (log, k) => log.filter((x) => x.k === k).map((x) => ({ body: x.body, tenant: x.tenant }));
const aria = (p, id, i = 0) => p.$$eval(`[data-testid="${id}"]`, (es, i) => es[i]?.getAttribute("aria-disabled") ?? null, i);
const INBOX = "GET /api/mobile/secretary/inbox", SCHED = "GET /api/mobile/secretary/scheduled";
const items = FX.endpoints[INBOX].items, tasks = FX.endpoints[SCHED];
try {
  // ── A กล่องรวม ──
  // A1 GET inbox ไม่มี x-tenant-id · การ์ด 5 · แผน canApprove=false ปุ่มปิด + บรรทัดเหตุผล
  { const { p, log } = await open("/secretary/inbox"); await p.waitForSelector('[data-testid="sec-inbox-item"]');
    res.inboxGet = log.filter((x) => x.k === INBOX).map((x) => ({ q: x.q, tenant: x.tenant }));
    res.cards = (await p.$$('[data-testid="sec-inbox-item"]')).length;
    res.groups = await p.$$eval('[data-testid="sec-inbox-group"]', (es) => es.length);
    res.planApproveAria = await aria(p, "sec-inbox-approve", 4); res.planRejectAria = await aria(p, "sec-inbox-reject", 4); res.cannot = await text(p, "sec-inbox-cannot");
    await (await nth(p, "sec-inbox-approve", 4)).click(); await sleep(600); res.planApproveCalls = calls(log, "POST /api/mobile/secretary/plans/plan-rent/approve").length;
    await p.evaluate(() => document.querySelector('[data-testid="sec-inbox-cannot"]').scrollIntoView()); await sleep(300); await p.screenshot({ path: `${OUT}/inbox-cannot-approve.png` });
    // แท็บ
    for (const k of ["money", "customer", "delete", "all"]) { await p.click(`[data-testid="sec-inbox-tab-${k}"]`); await sleep(300); res[`tab_${k}`] = (await p.$$('[data-testid="sec-inbox-item"]')).length; }
    await p.close(); }
  // A2 อนุมัติ t1 และ t2 จาก active t1 ⇒ x-tenant-id ของรายการ · กิจการ active ไม่เปลี่ยน
  { const { p, log } = await open("/secretary/inbox", { "POST /api/mobile/secretary/proposals/p-refund/approve": { body: { ok: true, note: "คืนมัดจำแล้ว" } } }); await p.waitForSelector('[data-testid="sec-inbox-approve"]');
    // ลำดับการ์ด: กลุ่ม t1 (p-quote, p-review, p-del) แล้ว t2 (p-refund, plan-rent)
    await (await nth(p, "sec-inbox-approve", 0)).click(); await sleep(900); res.approveQuote = calls(log, "POST /api/mobile/secretary/proposals/p-quote/approve"); res.approveFlash = await text(p, "sec-inbox-flash");
    await (await nth(p, "sec-inbox-approve", 3)).click(); await sleep(900); res.approveRefund = calls(log, "POST /api/mobile/secretary/proposals/p-refund/approve");
    res.activeAfterApprove = await p.evaluate(() => localStorage.getItem("shark_tenant")); res.inboxReloads = log.filter((x) => x.k === INBOX).length;
    await p.close(); }
  // A3 ลบถาวร: needsSecondConfirm ⇒ ชีต ⇒ {confirm2x:true} · ok:false ⇒ note บนการ์ด
  { const { p, log } = await open("/secretary/inbox", { "POST /api/mobile/secretary/proposals/p-del/approve": (body) => ({ body: body && body.includes("confirm2x") ? { ok: true, note: "ลบแล้ว" } : { ok: false, needsSecondConfirm: true, note: "ย้อนไม่ได้ ต้องยืนยันอีกครั้ง" } }), "POST /api/mobile/secretary/proposals/p-review/approve": { body: { ok: false, note: "รายการนี้หมดอายุแล้ว" } } });
    await p.waitForSelector('[data-testid="sec-inbox-approve"]');
    await (await nth(p, "sec-inbox-approve", 2)).click(); await p.waitForSelector('[data-testid="sec-inbox-confirm2x-ok"]', { timeout: 5000 }).catch(() => {}); await p.screenshot({ path: `${OUT}/inbox-confirm2x.png` });
    await p.click('[data-testid="sec-inbox-confirm2x-ok"]'); await sleep(900); res.approveDel = calls(log, "POST /api/mobile/secretary/proposals/p-del/approve");
    await (await nth(p, "sec-inbox-approve", 1)).click(); await sleep(900); res.deniedNote = await text(p, "sec-inbox-note"); await p.close(); }
  // A4 ตีกลับ (C4 เดิม) ด้วย header ร้านของรายการ
  { const { p, log } = await open("/secretary/inbox"); await p.waitForSelector('[data-testid="sec-inbox-reject"]');
    await (await nth(p, "sec-inbox-reject", 3)).click(); await p.waitForSelector('[data-testid="sec-inbox-reject-sheet-job"]'); await p.screenshot({ path: `${OUT}/inbox-reject-sheet.png` });
    await p.click('[data-testid="sec-inbox-reject-sheet-job"]'); await sleep(900); res.rejectRefund = calls(log, "POST /api/mobile/secretary/proposals/p-refund/reject"); await p.close(); }
  // A5 แตะรายการร้าน t2 ⇒ สลับร้าน ⇒ เปิดห้อง
  { const { p, log } = await open("/secretary/inbox"); await p.waitForSelector('[data-testid="sec-inbox-item"]');
    await (await nth(p, "sec-inbox-item", 3)).click(); await sleep(1500); res.tapUrl = new URL(p.url()).pathname; res.tapActive = await p.evaluate(() => localStorage.getItem("shark_tenant"));
    res.roomFetchTenant = log.filter((x) => x.k === "GET /api/mobile/secretary/rooms/r2").map((x) => x.tenant)[0] ?? null; await p.close(); }
  { const { p } = await open("/secretary/inbox"); await p.waitForSelector('[data-testid="sec-inbox-open"]'); await (await nth(p, "sec-inbox-open", 0)).click(); await sleep(1200);
    res.openSameTenantUrl = new URL(p.url()).pathname; res.openSameTenantActive = await p.evaluate(() => localStorage.getItem("shark_tenant")); await p.close(); }
  // A6 ว่าง
  { const { p } = await open("/secretary/inbox", { [INBOX]: { body: { items: [] } }, "GET /api/mobile/secretary/inbox/count": { body: { total: 0, canApprove: 0 } } }); await p.waitForSelector('[data-testid="sec-inbox-empty"]', { timeout: 8000 }).catch(() => {});
    res.inboxEmpty = !!(await p.$('[data-testid="sec-inbox-empty"]')); await p.screenshot({ path: `${OUT}/inbox-empty.png` }); await p.close(); }

  // ── B งานประจำ ──
  // B1 สวิตช์ ⇒ PUT {active:false} · ล้ม ⇒ คืนค่า + ข้อความ
  { const { p, log } = await open("/secretary/scheduled"); await p.waitForSelector('[data-testid="sec-sched-toggle"]');
    res.schedGetTenant = log.filter((x) => x.k === SCHED).map((x) => x.tenant)[0];
    await (await nth(p, "sec-sched-toggle", 0)).click(); await sleep(800); res.togglePut = calls(log, "PUT /api/mobile/secretary/scheduled/st1");
    res.toggleChecked = await p.$$eval('[data-testid="sec-sched-toggle"]', (es) => es[0].getAttribute("aria-checked")); await p.close(); }
  { const { p } = await open("/secretary/scheduled", { "PUT /api/mobile/secretary/scheduled/st2": { status: 404, body: { error: "not_found", message: "ไม่พบงานประจำนี้" } } }); await p.waitForSelector('[data-testid="sec-sched-toggle"]');
    await (await nth(p, "sec-sched-toggle", 1)).click(); await sleep(900); res.toggleFailChecked = await p.$$eval('[data-testid="sec-sched-toggle"]', (es) => es[1].getAttribute("aria-checked")); res.toggleFailMsg = await text(p, "sec-sched-flash"); await p.close(); }
  // B2 เพิ่ม: ตรวจช่องว่าง · ทุกสัปดาห์ จ.+พ. · 18:00 · เฉพาะห้องงาน
  { const { p, log } = await open("/secretary/scheduled"); await p.waitForSelector('[data-testid="sec-sched-add"]');
    await p.click('[data-testid="sec-sched-add"]'); await p.waitForSelector('[data-testid="sec-sched-save"]'); await p.screenshot({ path: `${OUT}/sched-sheet-new.png` });
    res.monthlyOption = !!(await p.$('[data-testid="sec-sched-freq-monthly"]'));
    await p.click('[data-testid="sec-sched-save"]'); await sleep(300); res.emptyErr = await text(p, "sec-sched-error");
    await p.type('[data-testid="sec-sched-instruction"]', "สรุปรีวิวใหม่ของสัปดาห์");
    await p.click('[data-testid="sec-sched-freq-weekly"]'); await sleep(200); await p.click('[data-testid="sec-sched-day-1"]'); await sleep(150);
    await p.click('[data-testid="sec-sched-save"]'); await sleep(300); res.noDayErr = await text(p, "sec-sched-error");
    await p.click('[data-testid="sec-sched-day-1"]'); await p.click('[data-testid="sec-sched-day-3"]');
    await p.$eval('[data-testid="sec-sched-hour-18"]', (e) => e.scrollIntoView()); await p.click('[data-testid="sec-sched-hour-18"]'); await p.click('[data-testid="sec-sched-ch-push"]'); await sleep(200);
    await p.screenshot({ path: `${OUT}/sched-sheet-weekly.png` });
    await p.click('[data-testid="sec-sched-save"]'); await sleep(1000); res.createPost = calls(log, "POST /api/mobile/secretary/scheduled"); res.createFlash = await text(p, "sec-sched-flash"); res.sheetClosed = !(await p.$('[data-testid="sec-sched-sheet"]')); await p.close(); }
  // B3 เซิร์ฟเวอร์ตอบ 400 ไทย ⇒ แสดงในชีต
  { const { p } = await open("/secretary/scheduled", { "POST /api/mobile/secretary/scheduled": { status: 400, body: { error: "invalid", message: "ตั้งงานประจำได้สูงสุด 10 รายการต่อร้าน — ลบหรือปิดรายการเดิมก่อนถ้าต้องการเพิ่ม" } } });
    await p.waitForSelector('[data-testid="sec-sched-add"]'); await p.click('[data-testid="sec-sched-add"]'); await p.waitForSelector('[data-testid="sec-sched-instruction"]'); await p.type('[data-testid="sec-sched-instruction"]', "ทดสอบ"); await p.click('[data-testid="sec-sched-save"]'); await sleep(900);
    res.server400 = await text(p, "sec-sched-error"); await p.close(); }
  // B4 แก้ (ของฉัน · ยังไม่เต็ม) ⇒ POST ใหม่ แล้ว DELETE ของเดิม
  { const { p, log } = await open("/secretary/scheduled"); await p.waitForSelector('[data-testid="sec-sched-item"]');
    await (await nth(p, "sec-sched-item", 0)).click(); await p.waitForSelector('[data-testid="sec-sched-hour-7"]'); await p.screenshot({ path: `${OUT}/sched-sheet-edit.png` });
    await p.$eval('[data-testid="sec-sched-hour-7"]', (e) => e.scrollIntoView()); await p.click('[data-testid="sec-sched-hour-7"]'); await p.click('[data-testid="sec-sched-save"]'); await sleep(1200);
    res.editOrder = log.filter((x) => /scheduled/.test(x.k) && x.k !== SCHED).map((x) => `${x.k.split(" ")[0]} ${x.k.split("/").pop()} ${x.body ?? ""}`); await p.close(); }
  // B5 แก้ตอนเต็มเพดาน (max=3) ⇒ DELETE ก่อน แล้ว POST · POST ล้ม ⇒ ตั้งของเดิมคืน
  { const full = { ...tasks, max: 3 }; let posts = 0;
    const { p, log } = await open("/secretary/scheduled", { [SCHED]: { body: full }, "POST /api/mobile/secretary/scheduled": () => (++posts === 1 ? { status: 400, body: { error: "invalid", message: "ข้อมูลไม่ถูกต้อง" } } : { body: { id: "st-back" } }) });
    await p.waitForSelector('[data-testid="sec-sched-item"]'); await (await nth(p, "sec-sched-item", 0)).click(); await p.waitForSelector('[data-testid="sec-sched-hour-7"]');
    await p.$eval('[data-testid="sec-sched-hour-7"]', (e) => e.scrollIntoView()); await p.click('[data-testid="sec-sched-hour-7"]'); await p.click('[data-testid="sec-sched-save"]'); await sleep(1500);
    res.editAtCapOrder = log.filter((x) => /scheduled/.test(x.k) && x.k !== SCHED).map((x) => `${x.k.split(" ")[0]} ${x.k.split("/").pop()} ${x.body ?? ""}`); res.editAtCapErr = await text(p, "sec-sched-error");
    await p.close(); }
  // เพิ่มตอนเต็ม (3/3) ⇒ ข้อความเพดาน ไม่เปิดชีต ไม่ยิง POST
  { const { p, log } = await open("/secretary/scheduled", { [SCHED]: { body: { ...tasks, max: 3 } } }); await p.waitForSelector('[data-testid="sec-sched-add"]');
    await p.click('[data-testid="sec-sched-add"]'); await sleep(500);
    res.capMsg = await text(p, "sec-sched-cap"); res.capSheet = !!(await p.$('[data-testid="sec-sched-save"]')); res.capPost = calls(log, "POST /api/mobile/secretary/scheduled").length; await p.screenshot({ path: `${OUT}/sched-cap.png` }); await p.close(); }
  // B6 ลบ ⇒ ยืนยันก่อน
  { const { p, log } = await open("/secretary/scheduled", { "DELETE /api/mobile/secretary/scheduled/st2": { body: { ok: true } } }); await p.waitForSelector('[data-testid="sec-sched-item"]');
    await (await nth(p, "sec-sched-item", 1)).click(); await p.waitForSelector('[data-testid="sec-sched-delete"]'); await p.click('[data-testid="sec-sched-delete"]'); await sleep(300);
    res.deleteBeforeConfirm = calls(log, "DELETE /api/mobile/secretary/scheduled/st2").length; await p.screenshot({ path: `${OUT}/sched-delete-confirm.png` });
    await p.click('[data-testid="sec-sched-delete-confirm"]'); await sleep(900); res.deleteAfterConfirm = calls(log, "DELETE /api/mobile/secretary/scheduled/st2"); res.deleteFlash = await text(p, "sec-sched-flash"); await p.close(); }
  // B7 งานของคนอื่น: เจ้าของกิจการ = ชีตล็อก (ไม่มีบันทึก มีลบ) · พนักงาน = สวิตช์ปิด แตะไม่เปิดชีต
  { const { p } = await open("/secretary/scheduled"); await p.waitForSelector('[data-testid="sec-sched-item"]'); await (await nth(p, "sec-sched-item", 2)).click(); await sleep(600);
    res.ownerOtherSave = !!(await p.$('[data-testid="sec-sched-save"]')); res.ownerOtherDelete = !!(await p.$('[data-testid="sec-sched-delete"]')); await p.screenshot({ path: `${OUT}/sched-sheet-locked.png` }); await p.close(); }
  { const me = JSON.parse(JSON.stringify(FX.endpoints["GET /api/mobile/me"])); me.memberships[0].role = "STAFF";
    const { p, log } = await open("/secretary/scheduled", { "GET /api/mobile/me": { body: me } }); await p.waitForSelector('[data-testid="sec-sched-item"]');
    res.staffOtherToggleAria = await aria(p, "sec-sched-toggle", 2); await (await nth(p, "sec-sched-toggle", 2)).click(); await sleep(400);
    await (await nth(p, "sec-sched-item", 2)).click(); await sleep(500); res.staffOtherSheet = !!(await p.$('[data-testid="sec-sched-sheet"]')); res.staffOtherPut = calls(log, "PUT /api/mobile/secretary/scheduled/st3").length; await p.close(); }
  { const { p } = await open("/secretary/scheduled", { [SCHED]: { body: { items: [], max: 10 } } }); await p.waitForSelector('[data-testid="sec-sched-empty"]', { timeout: 8000 }).catch(() => {});
    res.schedEmpty = !!(await p.$('[data-testid="sec-sched-empty"]')); await p.screenshot({ path: `${OUT}/sched-empty.png` }); await p.close(); }
} finally {
  writeFileSync(`${OUT}/result.json`, JSON.stringify(res, null, 1));
  console.log(JSON.stringify(res, null, 1));
  await b.close(); srv.close(); rmSync(UDD, { recursive: true, force: true });
}
