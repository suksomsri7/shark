// S2.2/S2.3 interaction check (QC web export · mocks from fixture · no real server)
import puppeteer from "/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";
import { createServer } from "node:http"; import { readFileSync, existsSync, statSync, mkdirSync, rmSync } from "node:fs"; import { join, extname } from "node:path";
const DIST = "/root/qc-shark-mobile-sec-d/dist", FX = JSON.parse(readFileSync(process.argv[2], "utf8")), EMPTY = JSON.parse(readFileSync(process.argv[3], "utf8")), OUT = process.argv[4];
mkdirSync(OUT, { recursive: true });
const srv = createServer((q, r) => { let f = join(DIST, decodeURIComponent(new URL(q.url, "http://x").pathname)); if (!existsSync(f) || statSync(f).isDirectory()) f = join(DIST, "index.html"); r.writeHead(200, { "content-type": { ".html": "text/html", ".js": "application/javascript", ".ttf": "font/ttf", ".png": "image/png" }[extname(f)] ?? "application/octet-stream" }); r.end(readFileSync(f)); }).listen(4725);
const UDD = `/tmp/chr-s22-${process.pid}`;
const b = await puppeteer.launch({ executablePath: "/usr/bin/chromium-browser", headless: true, args: ["--no-sandbox", `--user-data-dir=${UDD}`] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const res = {};
async function open(route, fx, over = {}) {
  const p = await b.newPage(); await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 }); await p.setRequestInterception(true);
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,OPTIONS" };
  const log = [];
  p.on("request", (q) => { const u = new URL(q.url()); if (u.host === "shark.in.th") { if (q.method() === "OPTIONS") return q.respond({ status: 204, headers: cors, body: "" }); const k = `${q.method()} ${u.pathname}`; log.push({ k, body: q.postData() ?? null }); if (over[k]) return q.respond({ status: over[k].status, headers: cors, contentType: "application/json", body: JSON.stringify(over[k].body) }); const body = fx.endpoints[k]; return q.respond({ status: body ? 200 : 404, headers: cors, contentType: "application/json", body: JSON.stringify(body ?? { error: "x" }) }); } q.continue(); });
  await p.evaluateOnNewDocument(() => { localStorage.clear(); localStorage.setItem("shark_theme", "light"); localStorage.setItem("shark_token", "qc-mock"); localStorage.setItem("shark_tenant", "t1"); });
  await p.goto("http://127.0.0.1:4725" + route, { waitUntil: "networkidle0" });
  return { p, log };
}
const cards = (p) => p.$$eval('[data-testid^="sec-home-card-"]', (els) => els.map((e) => e.getAttribute("data-testid")));
try {
  // 1 ตัวกรอง + ค้นหา + polling
  { const { p, log } = await open("/secretary", FX); await p.waitForSelector('[data-testid="sec-home-card-r1"]');
    res.all = await cards(p);
    await p.click('[data-testid="sec-home-filter-approval"]'); await sleep(400); res.approval = await cards(p); await p.screenshot({ path: `${OUT}/filter-approval.png` });
    await p.click('[data-testid="sec-home-filter-done"]'); await sleep(400); res.done = await cards(p);
    await p.click('[data-testid="sec-home-filter-all"]'); await p.type('[data-testid="sec-home-search"]', "204"); await sleep(400); res.search204 = await cards(p);
    await p.evaluate(() => { const el = document.querySelector('[data-testid="sec-home-search"]'); }); 
    const before = log.filter((x) => x.k === "GET /api/mobile/secretary/rooms").length; await sleep(16000); res.pollRoomsGets = [before, log.filter((x) => x.k === "GET /api/mobile/secretary/rooms").length];
    await p.close(); }
  // 2 แตะการ์ด → ห้อง
  { const { p } = await open("/secretary", FX); await p.waitForSelector('[data-testid="sec-home-card-r4"]'); await p.click('[data-testid="sec-home-card-r4"]'); await sleep(1200); res.cardNav = new URL(p.url()).pathname;
    await p.goBack(); await sleep(800);
    await p.click('[data-testid="sec-home-new"]'); await sleep(1200); res.newNav = new URL(p.url()).pathname; await p.close(); }
  // 3 A2: แตะข้อเสนอ = เติม · ส่ง → ห้องใหม่
  { const { p, log } = await open("/secretary/new", FX); await p.waitForSelector('[data-testid="sec-new-suggestion-follow_quiet"]');
    res.sendDisabledEmpty = await p.$eval('[data-testid="sec-new-send"]', (e) => e.getAttribute("aria-disabled"));
    await p.click('[data-testid="sec-new-suggestion-follow_quiet"]'); await sleep(300);
    res.filled = await p.$eval('[data-testid="sec-new-input-field"]', (e) => e.value);
    res.postsBeforeSend = log.filter((x) => x.k === "POST /api/mobile/secretary/rooms").length;
    await p.click('[data-testid="sec-new-frequent-1"]'); await sleep(300); res.filledFrequent = await p.$eval('[data-testid="sec-new-input-field"]', (e) => e.value);
    await p.screenshot({ path: `${OUT}/new-filled.png` });
    await p.click('[data-testid="sec-new-send"]'); await sleep(1500);
    res.sendNav = new URL(p.url()).pathname; res.postBody = log.find((x) => x.k === "POST /api/mobile/secretary/rooms")?.body; await p.close(); }
  // 4 A2: 402 quota
  { const { p } = await open("/secretary/new", FX, { "POST /api/mobile/secretary/rooms": { status: 402, body: { error: "quota_exhausted", message: "x" } } }); await p.waitForSelector('[data-testid="sec-new-input-field"]');
    await p.type('[data-testid="sec-new-input-field"]', "สรุปยอดขาย"); await p.click('[data-testid="sec-new-send"]'); await p.waitForSelector('[data-testid="sec-new-quota"]', { timeout: 5000 }).catch(() => {});
    res.quotaCard = !!(await p.$('[data-testid="sec-new-quota"]')); await p.screenshot({ path: `${OUT}/new-quota.png` });
    await p.click('[data-testid="sec-new-quota-link"]'); await sleep(1000); res.quotaNav = new URL(p.url()).pathname; await p.close(); }
  // 5 403 ⇒ จอยังเปิดใช้ไม่ได้
  { const { p } = await open("/secretary", FX, { "GET /api/mobile/secretary/rooms": { status: 403, body: { error: "forbidden" } } }); await p.waitForSelector('[data-testid="sec-home-denied"]', { timeout: 8000 }).catch(() => {});
    res.denied = !!(await p.$('[data-testid="sec-home-denied"]')); res.deniedNoC3 = !(await p.$('[data-testid="sec-home-empty"]')); await p.screenshot({ path: `${OUT}/denied-403.png` }); await p.close(); }
  // 6 C3: แตะข้อเสนอ → /secretary/new เติมคำสั่ง
  { const { p } = await open("/secretary", EMPTY); await p.waitForSelector('[data-testid="sec-suggest-s2"]'); await p.click('[data-testid="sec-suggest-s2"]'); await sleep(1500);
    res.c3Nav = new URL(p.url()).pathname; res.c3Filled = await p.$eval('[data-testid="sec-new-input-field"]', (e) => e.value).catch(() => null); await p.close(); }
  // 7 สลับกิจการจากจอลึก → รากโซน (R-S2.1c)
  { const { p } = await open("/secretary", FX); await p.waitForSelector('[data-testid="sec-home-card-r1"]'); await p.click('[data-testid="sec-home-card-r1"]'); await sleep(1200);
    await p.click('[data-testid="sec-top-tenant"]'); await p.waitForSelector('[data-testid="sec-switch-tenant-t2"]'); await p.click('[data-testid="sec-switch-tenant-t2"]'); await sleep(1500);
    res.switchNav = new URL(p.url()).pathname; res.switchTenant = await p.evaluate(() => localStorage.getItem("shark_tenant")); await p.screenshot({ path: `${OUT}/switched-from-room.png` }); await p.close(); }
} finally { await b.close(); srv.close(); for (const d of [UDD, `/tmp/snap-private-tmp/snap.chromium/tmp/chr-s22-${process.pid}`]) rmSync(d, { recursive: true, force: true }); }
console.log(JSON.stringify(res, null, 1));
