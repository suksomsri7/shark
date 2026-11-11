// S2.4 interaction check (QC web export of /root/qc-shark-mobile-sec-d/dist · mocks from fixtures · no real server)
// รัน: cp README-click.mjs.txt <scratch>/s24-click.mjs && node <scratch>/s24-click.mjs <s2.4.json> <s2.4-running.json> <outdir>
import puppeteer from "/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";
import { createServer } from "node:http"; import { readFileSync, existsSync, statSync, mkdirSync, rmSync } from "node:fs"; import { join, extname } from "node:path";
const DIST = "/root/qc-shark-mobile-sec-d/dist", FX = JSON.parse(readFileSync(process.argv[2], "utf8")), RUN = JSON.parse(readFileSync(process.argv[3], "utf8")), OUT = process.argv[4];
mkdirSync(OUT, { recursive: true });
const srv = createServer((q, r) => { let f = join(DIST, decodeURIComponent(new URL(q.url, "http://x").pathname)); if (!existsSync(f) || statSync(f).isDirectory()) f = join(DIST, "index.html"); r.writeHead(200, { "content-type": { ".html": "text/html", ".js": "application/javascript", ".ttf": "font/ttf", ".png": "image/png" }[extname(f)] ?? "application/octet-stream" }); r.end(readFileSync(f)); }).listen(4725);
const UDD = `/tmp/chr-s24-${process.pid}`;
const b = await puppeteer.launch({ executablePath: "/usr/bin/chromium-browser", headless: true, args: ["--no-sandbox", `--user-data-dir=${UDD}`] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const res = {};
async function open(route, fx, over = {}) {
  const p = await b.newPage(); await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 }); await p.setRequestInterception(true);
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,OPTIONS" };
  const log = [];
  p.on("request", (q) => { const u = new URL(q.url()); if (u.host === "shark.in.th") { if (q.method() === "OPTIONS") return q.respond({ status: 204, headers: cors, body: "" }); const k = `${q.method()} ${u.pathname}`; const body = q.postData() ?? null; log.push({ k, q: u.search, body, t: Date.now() }); const o = over[k]; if (o) { const r = typeof o === "function" ? o(body) : o; return q.respond({ status: r.status ?? 200, headers: cors, contentType: "application/json", body: JSON.stringify(r.body) }); } const bd = fx.endpoints[k]; return q.respond({ status: bd ? 200 : 404, headers: cors, contentType: "application/json", body: JSON.stringify(bd ?? { error: "x" }) }); } q.continue(); });
  await p.evaluateOnNewDocument(() => { localStorage.clear(); localStorage.setItem("shark_theme", "light"); localStorage.setItem("shark_token", "qc-mock"); localStorage.setItem("shark_tenant", "t1"); });
  await p.goto("http://127.0.0.1:4725" + route, { waitUntil: "networkidle0" });
  return { p, log };
}
const ROOM = "GET /api/mobile/secretary/rooms/r1";
const nth = async (p, id, i = 0) => (await p.$$(`[data-testid="${id}"]`))[i];
const text = (p, id) => p.$eval(`[data-testid="${id}"]`, (e) => e.innerText).catch(() => null);
const bodies = (log, k) => log.filter((x) => x.k === k).map((x) => x.body);
try {
  // 1 polling: WAITING = 15 วิ · RUNNING = 5 วิ · blur (ไปจออื่น) = หยุด
  { const { p, log } = await open("/secretary/room/r1", FX); await p.waitForSelector('[data-testid="sec-room-approve"]');
    const t0 = log.filter((x) => x.k === ROOM).length; await sleep(16500); res.pollWaiting16s = [t0, log.filter((x) => x.k === ROOM).length];
    await (await nth(p, "sec-room-repeat")).click(); await sleep(1200); res.repeatUrl = decodeURIComponent(new URL(p.url()).pathname + new URL(p.url()).search);
    res.repeatFilled = await p.$eval('[data-testid="sec-new-input-field"]', (e) => e.value).catch(() => null);
    const b0 = log.filter((x) => x.k === ROOM).length; await sleep(16500); res.pollAfterBlur16s = [b0, log.filter((x) => x.k === ROOM).length]; await p.close(); }
  { const { p, log } = await open("/secretary/room/r1", RUN); await p.waitForSelector('[data-testid="sec-room-background"]');
    const t0 = log.filter((x) => x.k === ROOM).length; await sleep(11000); const g = log.filter((x) => x.k === ROOM); res.pollRunning11s = [t0, g.length]; res.pollRunningGapsMs = g.slice(1).map((x, i) => x.t - g[i].t);
    await p.close(); }
  // 2 อนุมัติ destructive → needsSecondConfirm → ชีตยืนยัน → อนุมัติ {confirm2x:true}
  { const { p, log } = await open("/secretary/room/r1", FX, { "POST /api/mobile/secretary/proposals/p-card/approve": (body) => ({ body: body && body.includes("confirm2x") ? { ok: true, note: "สร้างการ์ดแล้ว" } : { ok: false, needsSecondConfirm: true, note: "งานนี้ย้อนไม่ได้ ต้องยืนยันอีกครั้ง" } }) });
    await p.waitForSelector('[data-testid="sec-room-approve"]');
    await (await nth(p, "sec-room-approve", 1)).click(); await p.waitForSelector('[data-testid="sec-room-confirm2x-ok"]', { timeout: 5000 }).catch(() => {});
    res.confirm2xSheet = !!(await p.$('[data-testid="sec-room-confirm2x"]')); await p.screenshot({ path: `${OUT}/confirm2x-sheet.png` });
    await p.click('[data-testid="sec-room-confirm2x-ok"]'); await sleep(1200);
    res.approveBodies = bodies(log, "POST /api/mobile/secretary/proposals/p-card/approve"); res.approveFlash = await text(p, "sec-room-flash"); res.sheetClosed = !(await p.$('[data-testid="sec-room-confirm2x"]'));
    // อนุมัติ chat.send (ไม่ต้องยืนยัน 2 ชั้น) · ไม่มีปุ่มแก้บนการ์ด chat.send
    res.editButtons = (await p.$$('[data-testid="sec-room-edit"]')).length;
    await (await nth(p, "sec-room-approve", 0)).click(); await sleep(1000); res.approveChatBodies = bodies(log, "POST /api/mobile/secretary/proposals/p-chat/approve"); await p.close(); }
  // 3 อนุมัติไม่ผ่าน (ok:false note) ⇒ note บนการ์ด · การ์ดยังอยู่
  { const { p } = await open("/secretary/room/r1", FX, { "POST /api/mobile/secretary/proposals/p-chat/approve": { body: { ok: false, note: "งานนี้ต้องให้เจ้าของหรือผู้จัดการอนุมัติ" } } });
    await p.waitForSelector('[data-testid="sec-room-approve"]'); await (await nth(p, "sec-room-approve", 0)).click(); await sleep(1000);
    res.deniedNote = await text(p, "sec-room-approval-note"); res.cardsAfterDenied = (await p.$$('[data-testid="sec-room-approval"]')).length; await p.screenshot({ path: `${OUT}/approve-denied-note.png` }); await p.close(); }
  // 4 ตีกลับ C4: RULE ต้องมีหมายเหตุ · body {note, remember:"RULE"} · JOB ไม่มีหมายเหตุ = {remember:"JOB"}
  { const { p, log } = await open("/secretary/room/r1", FX); await p.waitForSelector('[data-testid="sec-room-reject"]');
    await (await nth(p, "sec-room-reject", 0)).click(); await p.waitForSelector('[data-testid="sec-room-reject-sheet-note"]');
    res.ruleDisabledEmpty = await p.$eval('[data-testid="sec-room-reject-sheet-rule"]', (e) => e.getAttribute("aria-disabled"));
    await p.type('[data-testid="sec-room-reject-sheet-note"]', "ข้อความถึงลูกค้าต้องลงท้ายด้วยชื่อร้านทุกครั้ง"); await sleep(300);
    res.ruleDisabledFilled = await p.$eval('[data-testid="sec-room-reject-sheet-rule"]', (e) => e.getAttribute("aria-disabled"));
    await p.screenshot({ path: `${OUT}/reject-sheet-c4.png` });
    await p.click('[data-testid="sec-room-reject-sheet-rule"]'); await sleep(1000);
    res.rejectRuleBody = bodies(log, "POST /api/mobile/secretary/proposals/p-chat/reject"); res.rejectFlash = await text(p, "sec-room-flash");
    await (await nth(p, "sec-room-reject", 1)).click(); await p.waitForSelector('[data-testid="sec-room-reject-sheet-job"]'); await p.click('[data-testid="sec-room-reject-sheet-job"]'); await sleep(1000);
    res.rejectJobBody = bodies(log, "POST /api/mobile/secretary/proposals/p-card/reject"); await p.close(); }
  // 5 แก้ → patch เฉพาะช่องที่เปลี่ยน
  { const { p, log } = await open("/secretary/room/r1", FX); await p.waitForSelector('[data-testid="sec-room-edit"]');
    await p.click('[data-testid="sec-room-edit"]'); await p.waitForSelector('[data-testid="sec-room-edit-sheet-field-title"]');
    const f = await p.$('[data-testid="sec-room-edit-sheet-field-title"]'); await f.click({ clickCount: 3 }); await p.keyboard.press("End"); await p.type('[data-testid="sec-room-edit-sheet-field-title"]', " (โทร)");
    await p.screenshot({ path: `${OUT}/edit-sheet.png` }); await p.click('[data-testid="sec-room-edit-sheet-save"]'); await sleep(1000);
    res.editBody = bodies(log, "POST /api/mobile/secretary/proposals/p-card/edit"); res.editFlash = await text(p, "sec-room-flash"); await p.close(); }
  // 6 ย้อน · สอน · เปิดของจริง · ส่ง · เมนู
  { const { p, log } = await open("/secretary/room/r1", FX); await p.waitForSelector('[data-testid="sec-room-undo"]');
    await p.click('[data-testid="sec-room-undo"]'); await sleep(1000); res.undoBody = bodies(log, "POST /api/mobile/secretary/log/l1/undo"); res.undoNote = await text(p, "sec-room-undo-note");
    await p.screenshot({ path: `${OUT}/undo-note.png` });
    await p.click('[data-testid="sec-room-teach"]'); await sleep(500); res.teachValue = await p.$eval('[data-testid="sec-room-input-field"]', (e) => e.value);
    await p.type('[data-testid="sec-room-input-field"]', "ใส่ชื่อร้านท้ายข้อความ"); await p.click('[data-testid="sec-room-send"]'); await sleep(1200);
    res.sendBody = bodies(log, "POST /api/mobile/secretary/rooms/r1/send"); res.inputAfterSend = await p.$eval('[data-testid="sec-room-input-field"]', (e) => e.value);
    await p.click('[data-testid="sec-room-menu"]'); await p.waitForSelector('[data-testid="sec-room-menu-close"]'); await p.screenshot({ path: `${OUT}/menu-sheet.png` });
    await p.click('[data-testid="sec-room-menu-close"]'); await sleep(800); res.closeBody = bodies(log, "POST /api/mobile/secretary/rooms/r1/close");
    await p.click('[data-testid="sec-room-menu"]'); await p.waitForSelector('[data-testid="sec-room-menu-help"]'); await p.click('[data-testid="sec-room-menu-help"]'); await sleep(1000);
    res.helpUrl = new URL(p.url()).pathname + new URL(p.url()).search; await p.close(); }
  { const { p } = await open("/secretary/room/r1", FX); await p.waitForSelector('[data-testid="sec-room-open-link"]'); await p.click('[data-testid="sec-room-open-link"]'); await sleep(1200);
    res.openLinkUrl = new URL(p.url()).pathname + new URL(p.url()).search; await p.close(); }
  // 7 ห้องไม่พบ (404) ⇒ จอ "ไม่พบห้อง" ไม่ใช่จอว่าง
  { const { p } = await open("/secretary/room/r1", FX, { [ROOM]: { status: 404, body: { error: "not_found", message: "ไม่พบห้องงานนี้" } } }); await p.waitForSelector('[data-testid="sec-room-gone"]', { timeout: 8000 }).catch(() => {});
    res.notFound = !!(await p.$('[data-testid="sec-room-gone"]')); await p.screenshot({ path: `${OUT}/room-404.png` }); await p.close(); }
} finally { await b.close(); srv.close(); for (const d of [UDD, `/tmp/snap-private-tmp/snap.chromium/tmp/chr-s24-${process.pid}`]) rmSync(d, { recursive: true, force: true }); }
console.log(JSON.stringify(res, null, 1));
