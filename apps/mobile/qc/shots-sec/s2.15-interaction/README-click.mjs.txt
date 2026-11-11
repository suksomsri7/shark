// S2.15 interaction check (QC web export of /root/qc-shark-mobile-sec-c/dist · mocks from fixture s2.15.json · no real server)
// รัน: cp README-click.mjs.txt <scratch>/s215-click.mjs && bash scripts/iso.sh node <scratch>/s215-click.mjs <s2.15.json> <small.png> <big.png> <vec.svg> <outdir>
import puppeteer from "/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";
import { createServer } from "node:http"; import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync } from "node:fs"; import { join, extname } from "node:path";
const DIST = "/root/qc-shark-mobile-sec-c/dist", FX = JSON.parse(readFileSync(process.argv[2], "utf8")), PHOTO = process.argv[3], BIG = process.argv[4], SVG = process.argv[5], OUT = process.argv[6];
mkdirSync(OUT, { recursive: true });
const seen = [];
const srv = createServer((q, r) => { if (q.url.startsWith("/__upload")) { if (q.method === "OPTIONS") { r.writeHead(204, { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST,OPTIONS" }); return r.end(); } const chunks = []; q.on("data", (d) => chunks.push(d)); q.on("end", () => { const buf = Buffer.concat(chunks); seen.push({ contentLength: q.headers["content-length"] ?? null, transferEncoding: q.headers["transfer-encoding"] ?? null, bytes: buf.length, ct: q.headers["content-type"], auth: !!q.headers.authorization, tenant: q.headers["x-tenant-id"] ?? null, fileField: /name="file"; filename="[^"]+"/.test(buf.toString("latin1")), partType: (/Content-Type: ([^\r\n]+)/.exec(buf.toString("latin1")) ?? [])[1] ?? null }); r.writeHead(200, { "access-control-allow-origin": "*", "content-type": "application/json" }); r.end(JSON.stringify({ url: "https://cdn.qc.invalid/help/upload-2.png", name: "qc-photo-s215.png", kind: "image", mimeType: "image/png", size: 162 })); }); return; } let f = join(DIST, decodeURIComponent(new URL(q.url, "http://x").pathname)); if (!existsSync(f) || statSync(f).isDirectory()) f = join(DIST, "index.html"); r.writeHead(200, { "content-type": { ".html": "text/html", ".js": "application/javascript", ".ttf": "font/ttf", ".png": "image/png" }[extname(f)] ?? "application/octet-stream" }); r.end(readFileSync(f)); }).listen(4725);
const UDD = `/tmp/chr-s215-${process.pid}`;
const b = await puppeteer.launch({ executablePath: "/usr/bin/chromium-browser", headless: true, args: ["--no-sandbox", `--user-data-dir=${UDD}`] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const res = {};
const clone = (x) => JSON.parse(JSON.stringify(x));
async function open(route, fx, over = {}) {
  const p = await b.newPage(); await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 }); await p.setRequestInterception(true);
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS" };
  const log = [];
  p.on("request", async (q) => { const u = new URL(q.url()); if (u.host === "shark.in.th") { if (q.method() === "OPTIONS") return q.respond({ status: 204, headers: cors, body: "" }); const k = `${q.method()} ${u.pathname}`; const h = q.headers(); const body = q.postData() ?? null; log.push({ k, q: u.search, body, ct: h["content-type"] ?? null, len: h["content-length"] ?? null, tenant: h["x-tenant-id"] ?? null, t: Date.now() }); const o = over[k]; if (o) { const r = typeof o === "function" ? o(body, log) : o; return q.respond({ status: r.status ?? 200, headers: cors, contentType: "application/json", body: JSON.stringify(r.body) }); } const bd = fx.endpoints[k]; return q.respond({ status: bd ? 200 : 404, headers: cors, contentType: "application/json", body: JSON.stringify(bd ?? { error: "not_found" }) }); } q.continue(); });
  await p.evaluateOnNewDocument(() => { localStorage.clear(); localStorage.setItem("shark_theme", "light"); localStorage.setItem("shark_token", "qc-mock"); localStorage.setItem("shark_tenant", "t1"); });
  await p.goto("http://127.0.0.1:4725" + route, { waitUntil: "networkidle0" });
  return { p, log };
}
const nth = async (p, id, i = 0) => (await p.$$(`[data-testid="${id}"]`))[i];
const count = async (p, id) => (await p.$$(`[data-testid="${id}"]`)).length;
const text = (p, id) => p.$eval(`[data-testid="${id}"]`, (e) => e.innerText).catch(() => null);
const val = (p, id) => p.$eval(`[data-testid="${id}"]`, (e) => e.value).catch(() => null);
const bodies = (log, k) => log.filter((x) => x.k === k).map((x) => { try { return JSON.parse(x.body); } catch { return x.body; } });
const hits = (log, k) => log.filter((x) => x.k === k).length;
const path = (p) => { const u = new URL(p.url()); return u.pathname + u.search; };
const type = async (p, id, s) => { await p.click(`[data-testid="${id}"]`); await p.type(`[data-testid="${id}"]`, s); };
const OPEN = "POST /api/mobile/secretary/support/cases", REPLY = "POST /api/mobile/secretary/support/cases/c1/reply", RESOLVE = "POST /api/mobile/secretary/support/cases/c1/resolve", UP = "POST /api/mobile/secretary/support/upload";
const pickFile = async (p, btn, file) => { const [ch] = await Promise.all([p.waitForFileChooser({ timeout: 8000 }), p.click(`[data-testid="${btn}"]`)]); await ch.accept([file]); await sleep(1500); };
const c9 = (fx) => { fx.endpoints["GET /api/mobile/secretary/support/cases/c9"] = { case: { id: "c9", caseNo: 43, subject: "x", status: "OPEN", category: "bug", roomId: null, createdAt: "2026-11-05T04:00:00.000Z", updatedAt: "2026-11-05T04:00:00.000Z" }, messages: [{ id: "n1", side: "SHOP", mine: true, body: "x", attachments: [], createdAt: "2026-11-05T04:00:00.000Z" }] }; return fx; };
try {
  // ── H1 รายการ: 3 แถว · จุด 3 สี · ตัวนับ · ชิป 5 ──
  { const { p, log } = await open("/secretary/help", FX); await p.waitForSelector('[data-testid="help-case-row"]');
    res.h1Rows = await count(p, "help-case-row"); res.h1Dots = { run: await count(p, "help-dot-run"), wait: await count(p, "help-dot-wait"), done: await count(p, "help-dot-done") };
    res.h1DotColors = await p.$$eval('[data-testid^="help-dot-"]', (es) => es.map((e) => e.getAttribute("data-testid") + "=" + getComputedStyle(e).backgroundColor));
    res.h1Unread = await count(p, "help-case-row-unread"); res.h1Chips = await p.$$eval('[data-testid="help-chip"]', (es) => es.map((e) => e.innerText));
    res.h1ListTenant = log.filter((x) => x.k === "GET /api/mobile/secretary/support/cases").map((x) => x.tenant);
    res.h1HelpBtnSelected = await p.$eval('[data-testid="sec-top-help"]', (e) => e.getAttribute("aria-selected"));
    await (await nth(p, "help-case-row", 0)).click(); await p.waitForSelector('[data-testid="help-room"]'); res.h1RowOpens = path(p); await p.close(); }
  // ── H1 จากห้องงาน (?roomId=r1): ชิปเลขาทำผิดถูกเลือกไว้ · การ์ดห้อง · เลือกชิปอื่น → category ตามชิป · roomId ส่งไป ──
  { const fx = c9(clone(FX)); const { p, log } = await open("/secretary/help?roomId=r1", fx); await p.waitForSelector('[data-testid="help-room-attached"]'); await sleep(500);
    res.h1RoomCard = await text(p, "help-room-attached"); res.h1Preselected = await p.$$eval('[data-testid="help-chip"]', (es) => es.filter((e) => e.getAttribute("aria-selected") === "true").map((e) => e.innerText));
    await p.screenshot({ path: `${OUT}/h1-from-room.png` });
    await type(p, "help-input-field", "เลขาส่งใบเสนอราคาให้ลูกค้าผิดคน"); await p.click('[data-testid="help-send"]'); await sleep(1200);
    res.h1OpenBodyFromRoom = bodies(log, OPEN); res.h1AfterOpenUrl = path(p); await p.close(); }
  { const fx = c9(clone(FX)); const { p, log } = await open("/secretary/help?roomId=r1", fx); await p.waitForSelector('[data-testid="help-room-attached"]');
    await (await nth(p, "help-chip", 0)).click(); await p.click('[data-testid="help-room-detach"]'); await sleep(200); res.h1DetachedCard = await count(p, "help-room-attached");
    await type(p, "help-input-field", "ปุ่มพิมพ์ใบเสร็จกดไม่ได้"); await p.click('[data-testid="help-send"]'); await sleep(1200);
    res.h1OpenBodyDetached = bodies(log, OPEN); await p.close(); }
  // ไม่เลือกชิป ⇒ ไม่ส่ง category · รหัสห้องเพี้ยนใน query ⇒ ไม่แนบ · แนบรูปจาก H1 ⇒ attachments
  { const fx = c9(clone(FX)); const { p, log } = await open("/secretary/help?roomId=..%2Fx", fx); await p.waitForSelector('[data-testid="help-input-field"]');
    res.h1BadRoomCard = await count(p, "help-room-attached");
    await pickFile(p, "help-home-attach", PHOTO); res.h1Upload = log.filter((x) => x.k === UP).map((x) => ({ multipart: /multipart\/form-data/.test(x.ct ?? ""), len: x.len })); res.h1Attached = await count(p, "help-attached-item");
    await type(p, "help-input-field", "ข้อความทดสอบ"); await p.click('[data-testid="help-send"]'); await sleep(1200); res.h1OpenBodyAtt = bodies(log, OPEN); await p.close(); }
  // 429 ⇒ ข้อความไทย ไม่เปลี่ยนจอ
  { const { p } = await open("/secretary/help", FX, { [OPEN]: { status: 429, body: { error: "rate_limited", retryAfterSec: 30 } } }); await p.waitForSelector('[data-testid="help-input-field"]');
    await type(p, "help-input-field", "ทดสอบ"); await p.click('[data-testid="help-send"]'); await sleep(900); res.h1RateFlash = await text(p, "help-flash"); res.h1RateUrl = path(p); res.h1RateInput = await val(p, "help-input-field"); await p.close(); }
  // ไม่มีเรื่อง ⇒ ว่าง
  { const fx = clone(FX); fx.endpoints["GET /api/mobile/secretary/support/cases"] = { items: [], unread: 0, categories: [] }; const { p } = await open("/secretary/help", fx); await p.waitForSelector('[data-testid="help-empty"]'); res.h1Empty = await text(p, "help-empty"); await p.close(); }

  // ── H2 ห้อง c1: ฟอง · ลิงก์ · การ์ดห้องงาน · ตอบ ──
  { const { p, log } = await open("/secretary/help/c1", FX); await p.waitForSelector('[data-testid="help-resolved-card"]');
    res.h2Bubbles = await count(p, "help-bubble"); res.h2Links = await p.$$eval('[data-testid="help-link"]', (es) => es.map((e) => e.innerText.split("\n").slice(0, 2).join(" | "))); res.h2Att = await text(p, "help-bubble-att");
    res.h2HeaderDot = await p.$$eval('[data-testid^="help-room-dot-"]', (es) => es.map((e) => e.getAttribute("data-testid"))); res.h2Status = await text(p, "help-room-status");
    res.h2RoomCard = await text(p, "help-room-card"); res.h2Get = hits(log, "GET /api/mobile/secretary/support/cases/c1");
    await type(p, "help-input-field", "ลองเชื่อมแล้วครับ"); await p.click('[data-testid="help-send"]'); await sleep(1200);
    res.h2Reply = bodies(log, REPLY); res.h2InputAfter = await val(p, "help-input-field"); res.h2ReloadAfterReply = hits(log, "GET /api/mobile/secretary/support/cases/c1"); await p.close(); }
  // ลิงก์ในแอป: sharkai:// → /secretary/settings/customers · path ภายใน → /secretary/room/r1 · การ์ดห้องงาน → /secretary/room/r1
  { const { p } = await open("/secretary/help/c1", FX); await p.waitForSelector('[data-testid="help-link"]'); await (await nth(p, "help-link", 0)).click(); await sleep(800); res.h2Link0 = path(p); await p.close(); }
  { const { p } = await open("/secretary/help/c1", FX); await p.waitForSelector('[data-testid="help-link"]'); await (await nth(p, "help-link", 1)).click(); await sleep(800); res.h2Link1 = path(p); await p.close(); }
  { const { p } = await open("/secretary/help/c1", FX); await p.waitForSelector('[data-testid="help-room-card"]'); await p.evaluate(() => document.querySelector('[data-testid="help-room-card"]').scrollIntoView()); await p.click('[data-testid="help-room-card"]'); await sleep(800); res.h2RoomCardUrl = path(p); await p.close(); }
  // ลิงก์ภายนอก/อันตรายไม่เป็นปุ่ม
  { const fx = clone(FX); fx.endpoints["GET /api/mobile/secretary/support/cases/c1"].messages.push({ id: "m6", side: "PLATFORM", mine: false, body: "ดูที่ https://evil.example/x หรือ [กด](javascript:alert(1)) หรือ sharkai://../../etc หรือ /app/settings/chat", attachments: [], createdAt: "2026-11-05T03:13:00.000Z" });
    const { p } = await open("/secretary/help/c1", fx); await p.waitForSelector('[data-testid="help-link"]'); res.h2LinksWithUnsafe = await p.$$eval('[data-testid="help-link"]', (es) => es.map((e) => e.innerText.split("\n")[1]));
    await (await nth(p, "help-link", 2)).click(); await sleep(800); res.h2WebLinkUrl = path(p); await p.close(); }
  // แก้แล้ว ⇒ POST resolve {} · การ์ดหายเมื่อสถานะเป็น RESOLVED
  { let resolved = false; const fx = clone(FX); const base = fx.endpoints["GET /api/mobile/secretary/support/cases/c1"];
    const { p, log } = await open("/secretary/help/c1", fx, { [RESOLVE]: () => { resolved = true; return { body: { ok: true } }; }, "GET /api/mobile/secretary/support/cases/c1": () => ({ body: resolved ? { ...base, case: { ...base.case, status: "RESOLVED" } } : base }) });
    await p.waitForSelector('[data-testid="help-resolve-yes"]'); await p.click('[data-testid="help-resolve-yes"]'); await sleep(1200);
    res.h2Resolve = bodies(log, RESOLVE); res.h2ResolveFlash = await text(p, "help-flash"); res.h2CardAfterResolve = await count(p, "help-resolved-card"); res.h2Closed = await text(p, "help-closed");
    res.h2DotAfterResolve = await p.$$eval('[data-testid^="help-room-dot-"]', (es) => es.map((e) => e.getAttribute("data-testid"))); await p.screenshot({ path: `${OUT}/h2-resolved.png` }); await p.close(); }
  // ยังไม่แก้ ⇒ reply "ยังไม่หาย" + เปิดช่องพิมพ์ · ไม่มี resolve
  { let reopened = false; const fx = clone(FX); const base = fx.endpoints["GET /api/mobile/secretary/support/cases/c1"];
    const { p, log } = await open("/secretary/help/c1", fx, { [REPLY]: () => { reopened = true; return { body: { ok: true } }; }, "GET /api/mobile/secretary/support/cases/c1": () => ({ body: reopened ? { ...base, case: { ...base.case, status: "OPEN" } } : base }) });
    await p.waitForSelector('[data-testid="help-resolve-no"]'); await p.click('[data-testid="help-resolve-no"]'); await sleep(1200);
    res.h2No = bodies(log, REPLY); res.h2NoResolve = hits(log, RESOLVE); res.h2NoFlash = await text(p, "help-flash"); res.h2CardAfterNo = await count(p, "help-resolved-card");
    res.h2DotAfterNo = await p.$$eval('[data-testid^="help-room-dot-"]', (es) => es.map((e) => e.getAttribute("data-testid"))); res.h2NoFocused = await p.evaluate(() => document.activeElement?.getAttribute("data-testid")); await p.screenshot({ path: `${OUT}/h2-not-fixed.png` }); await p.close(); }
  // แนบรูป: เล็ก ⇒ multipart 1 ครั้ง → reply.attachments · ใหญ่ > 4 MB ⇒ ไม่อัปโหลด + ข้อความ · svg ⇒ ไม่อัปโหลด + ข้อความ · 415 ของเซิร์ฟเวอร์ ⇒ ข้อความเซิร์ฟเวอร์
  { const { p, log } = await open("/secretary/help/c1", FX); await p.waitForSelector('[data-testid="help-attach"]');
    await pickFile(p, "help-attach", PHOTO); const up = log.filter((x) => x.k === UP); res.h2Upload = up.map((x) => ({ multipart: /multipart\/form-data/.test(x.ct ?? ""), len: x.len, tenant: x.tenant, hasFileField: /name="file"; filename="qc-photo-s215.png"/.test(x.body ?? "") }));
    res.h2Attached = await count(p, "help-attached-item"); await p.screenshot({ path: `${OUT}/h2-attached.png` });
    await p.click('[data-testid="help-send"]'); await sleep(1200); res.h2AttachReply = bodies(log, REPLY); res.h2AttachedAfterSend = await count(p, "help-attached-item"); await p.close(); }
  { const { p, log } = await open("/secretary/help/c1", FX); await p.waitForSelector('[data-testid="help-attach"]');
    await pickFile(p, "help-attach", BIG); res.h2BigUploads = hits(log, UP); res.h2BigFlash = await text(p, "help-flash"); await p.screenshot({ path: `${OUT}/h2-too-big.png` });
    await pickFile(p, "help-attach", SVG); res.h2SvgUploads = hits(log, UP); res.h2SvgFlash = await text(p, "help-flash"); await p.close(); }
  { const { p, log } = await open("/secretary/help/c1", FX, { [UP]: { status: 415, body: { error: "unsupported", message: "แนบได้เฉพาะรูป JPG · PNG · WEBP · HEIC · GIF" } } }); await p.waitForSelector('[data-testid="help-attach"]');
    await pickFile(p, "help-attach", PHOTO); res.h2Up415 = { posts: hits(log, UP), flash: await text(p, "help-flash"), attached: await count(p, "help-attached-item") }; await p.close(); }
  // Content-Length จริงที่เครือข่าย: ส่งคำขออัปโหลดต่อไปยังเซิร์ฟเวอร์ในเครื่อง (อ่าน header/body ดิบ)
  { const p = await b.newPage(); await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 }); await p.setRequestInterception(true);
    const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,OPTIONS" };
    p.on("request", (q) => { const u = new URL(q.url()); if (u.host === "shark.in.th") { if (u.pathname === "/api/mobile/secretary/support/upload") return q.continue({ url: "http://127.0.0.1:4725/__upload" }); if (q.method() === "OPTIONS") return q.respond({ status: 204, headers: cors, body: "" }); const bd = FX.endpoints[`${q.method()} ${u.pathname}`]; return q.respond({ status: bd ? 200 : 404, headers: cors, contentType: "application/json", body: JSON.stringify(bd ?? { error: "x" }) }); } q.continue(); });
    await p.evaluateOnNewDocument(() => { localStorage.clear(); localStorage.setItem("shark_theme", "light"); localStorage.setItem("shark_token", "qc-mock"); localStorage.setItem("shark_tenant", "t1"); });
    await p.goto("http://127.0.0.1:4725/secretary/help/c1", { waitUntil: "networkidle0" }); await p.waitForSelector('[data-testid="help-attach"]');
    await pickFile(p, "help-attach", PHOTO); res.h2UploadWire = seen.slice(); res.h2UploadWireAttached = await count(p, "help-attached-item"); await p.close(); }
  // เมนู ⋯
  { const { p } = await open("/secretary/help/c1", FX); await p.waitForSelector('[data-testid="help-menu"]'); await p.click('[data-testid="help-menu"]'); await p.waitForSelector('[data-testid="help-menu-sheet"]');
    res.h2Menu = { room: await count(p, "help-menu-room"), resolve: await count(p, "help-menu-resolve"), list: await count(p, "help-menu-list") }; await p.screenshot({ path: `${OUT}/h2-menu.png` }); await p.close(); }
  // 404 ⇒ ไม่พบเรื่อง
  { const { p } = await open("/secretary/help/zz", FX); await p.waitForSelector('[data-testid="help-gone"]'); res.h2Gone = await text(p, "help-gone"); res.h2GoneInput = await count(p, "help-input"); await p.screenshot({ path: `${OUT}/h2-not-found.png` }); await p.close(); }
  // ห้องงานในแอป: เมนู ⋯ "แจ้งปัญหาเรื่องงานนี้" → /secretary/help?roomId=r1 (มีอยู่แล้วจาก S2.4 — ยืนยันปลายทาง)
} catch (e) { res.error = String(e && e.stack || e); }
writeFileSync(`${OUT}/result.json`, JSON.stringify(res, null, 1));
console.log(JSON.stringify(res, null, 1));
await b.close(); srv.close(); process.exit(0);
