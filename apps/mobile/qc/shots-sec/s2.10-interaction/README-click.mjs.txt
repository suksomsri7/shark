// S2.10 interaction check (QC web export of /root/qc-shark-mobile-sec-c/dist · mocks from fixtures · no real server)
// รัน: cp README-click.mjs.txt <scratch>/s210-click.mjs && bash scripts/iso.sh node <scratch>/s210-click.mjs <s2.10.json> <s2.4.json> <s2.4-running.json> <outdir>
import puppeteer from "/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";
import { createServer } from "node:http"; import { readFileSync, existsSync, statSync, mkdirSync, rmSync } from "node:fs"; import { join, extname } from "node:path";
const DIST = "/root/qc-shark-mobile-sec-c/dist", FX = JSON.parse(readFileSync(process.argv[2], "utf8")), F24 = JSON.parse(readFileSync(process.argv[3], "utf8")), RUN = JSON.parse(readFileSync(process.argv[4], "utf8")), OUT = process.argv[5];
mkdirSync(OUT, { recursive: true });
const srv = createServer((q, r) => { let f = join(DIST, decodeURIComponent(new URL(q.url, "http://x").pathname)); if (!existsSync(f) || statSync(f).isDirectory()) f = join(DIST, "index.html"); r.writeHead(200, { "content-type": { ".html": "text/html", ".js": "application/javascript", ".ttf": "font/ttf", ".png": "image/png" }[extname(f)] ?? "application/octet-stream" }); r.end(readFileSync(f)); }).listen(4725);
const UDD = `/tmp/chr-s210-${process.pid}`;
const b = await puppeteer.launch({ executablePath: "/usr/bin/chromium-browser", headless: true, args: ["--no-sandbox", `--user-data-dir=${UDD}`] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const res = {};
async function open(route, fx, over = {}) {
  const p = await b.newPage(); await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 }); await p.setRequestInterception(true);
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS" };
  const log = [];
  p.on("request", async (q) => { const u = new URL(q.url()); if (u.host === "shark.in.th") { if (q.method() === "OPTIONS") return q.respond({ status: 204, headers: cors, body: "" }); const k = `${q.method()} ${u.pathname}`; const body = q.postData() ?? null; log.push({ k, q: u.search, body, t: Date.now() }); const o = over[k]; if (o) { const r = typeof o === "function" ? o(body, log) : o; if (r.delay) await sleep(r.delay); return q.respond({ status: r.status ?? 200, headers: cors, contentType: "application/json", body: JSON.stringify(r.body) }); } const bd = fx.endpoints[k]; return q.respond({ status: bd ? 200 : 404, headers: cors, contentType: "application/json", body: JSON.stringify(bd ?? { error: "x" }) }); } q.continue(); });
  await p.evaluateOnNewDocument(() => { localStorage.clear(); localStorage.setItem("shark_theme", "light"); localStorage.setItem("shark_token", "qc-mock"); localStorage.setItem("shark_tenant", "t1"); });
  await p.goto("http://127.0.0.1:4725" + route, { waitUntil: "networkidle0" });
  return { p, log };
}
const nth = async (p, id, i = 0) => (await p.$$(`[data-testid="${id}"]`))[i];
const count = async (p, id) => (await p.$$(`[data-testid="${id}"]`)).length;
const text = (p, id) => p.$eval(`[data-testid="${id}"]`, (e) => e.innerText).catch(() => null);
const texts = (p, id) => p.$$eval(`[data-testid="${id}"]`, (es) => es.map((e) => e.innerText));
const bodies = (log, k) => log.filter((x) => x.k === k).map((x) => x.body);
const hits = (log, k) => log.filter((x) => x.k === k).length;
try {
  // ── D1 รายชื่อ ──
  { const { p, log } = await open("/secretary/staff", FX); await p.waitForSelector('[data-testid="sec-staff-row"]');
    res.d1Rows = await count(p, "sec-staff-row"); res.d1Chat = await texts(p, "sec-staff-chat-badge"); res.d1Pending = await count(p, "sec-staff-pending");
    await p.click('[data-testid="sec-staff-pending-resend"]'); await sleep(900); res.d1ResendPosts = bodies(log, "POST /api/mobile/secretary/staff/invites/inv1/resend"); res.d1ResendNote = await text(p, "sec-staff-note");
    await p.click('[data-testid="sec-staff-pending-cancel"]'); await p.waitForSelector('[data-testid="sec-staff-cancel-sheet-ok"]'); res.d1CancelBeforeOk = hits(log, "DELETE /api/mobile/secretary/staff/invites/inv1");
    await p.screenshot({ path: `${OUT}/d1-cancel-confirm.png` }); await p.click('[data-testid="sec-staff-cancel-sheet-ok"]'); await sleep(900); res.d1CancelAfterOk = hits(log, "DELETE /api/mobile/secretary/staff/invites/inv1");
    await (await nth(p, "sec-staff-row", 0)).click(); await sleep(1000); res.d1RowUrl = new URL(p.url()).pathname; await p.close(); }
  // D1 ในบทบาท STAFF (403) ⇒ ไม่มีปุ่ม
  { const fx = JSON.parse(JSON.stringify(FX)); fx.endpoints["GET /api/mobile/me"].memberships[0].role = "STAFF";
    const { p } = await open("/secretary/staff", fx, { "GET /api/mobile/secretary/staff": { status: 403, body: { error: "forbidden", message: "ไม่มีสิทธิ์" } } }); await p.waitForSelector('[data-testid="sec-staff-denied"]', { timeout: 8000 }).catch(() => {});
    res.d1StaffDenied = !!(await p.$('[data-testid="sec-staff-denied"]')); res.d1StaffInviteBtn = await count(p, "sec-staff-invite"); res.d1StaffPlus = await count(p, "sec-top-new"); await p.screenshot({ path: `${OUT}/d1-staff-role-denied.png` }); await p.close(); }
  // ── D3 เพิ่ม 2 คน seeHistory ปิด ⇒ 2 POST ──
  { const { p, log } = await open("/secretary/room/r2", FX); await p.waitForSelector('[data-testid="sec-room-add-member"]');
    await p.click('[data-testid="sec-room-add-member"]'); await p.waitForSelector('[data-testid="sec-room-add-row"]');
    res.d3Candidates = await texts(p, "sec-room-add-row"); res.d3HistoryDefault = await p.$eval('[data-testid="sec-room-add-history"]', (e) => e.getAttribute("aria-checked"));
    await (await nth(p, "sec-room-add-row", 0)).click(); await (await nth(p, "sec-room-add-row", 1)).click(); await sleep(300);
    res.d3ConfirmLabel = await text(p, "sec-room-add-confirm"); await p.screenshot({ path: `${OUT}/d3-add-sheet.png` });
    await p.click('[data-testid="sec-room-add-confirm"]'); await sleep(1500);
    res.d3Posts = bodies(log, "POST /api/mobile/secretary/rooms/r2/members"); res.d3SheetClosed = !(await p.$('[data-testid="sec-room-add-sheet"]')); await p.close(); }
  // ── D3 ถอด (ยืนยัน) ⇒ DELETE ──
  { const { p, log } = await open("/secretary/room/r2", FX); await p.waitForSelector('[data-testid="sec-room-menu"]');
    await p.click('[data-testid="sec-room-menu"]'); await p.waitForSelector('[data-testid="sec-room-menu-members"]'); await p.click('[data-testid="sec-room-menu-members"]');
    await p.waitForSelector('[data-testid="sec-room-member-remove"]'); await (await nth(p, "sec-room-member-remove", 0)).click(); await p.waitForSelector('[data-testid="sec-room-remove-confirm-ok"]');
    res.d3RemoveBeforeOk = hits(log, "DELETE /api/mobile/secretary/rooms/r2/members/u-qc-2"); await p.screenshot({ path: `${OUT}/d3-remove-confirm.png` });
    await p.click('[data-testid="sec-room-remove-confirm-ok"]'); await sleep(1000); res.d3RemoveAfterOk = hits(log, "DELETE /api/mobile/secretary/rooms/r2/members/u-qc-2"); await p.close(); }
  // ── §S EditSheet allowlist + ช่องที่แก้จาก res.input ──
  { const { p, log } = await open("/secretary/room/r2", FX); await p.waitForSelector('[data-testid="sec-room-edit"]');
    await p.click('[data-testid="sec-room-edit"]'); await p.waitForSelector('[data-testid="sec-room-edit-sheet-field-title"]');
    res.editFieldIds = await p.$$eval('[data-testid^="sec-room-edit-sheet-field-"]', (es) => es.map((e) => e.getAttribute("data-testid")));
    const f = await p.$('[data-testid="sec-room-edit-sheet-field-note"]'); await f.click(); await p.keyboard.press("End"); await p.type('[data-testid="sec-room-edit-sheet-field-note"]', " (โทรยืนยัน)");
    await p.screenshot({ path: `${OUT}/edit-sheet-allowlist.png` }); await p.click('[data-testid="sec-room-edit-sheet-save"]'); await sleep(1200);
    res.editBody = bodies(log, "POST /api/mobile/secretary/proposals/p-quote/edit"); res.editedFields = await text(p, "sec-room-approval-fields"); await p.screenshot({ path: `${OUT}/edited-fields.png` }); await p.close(); }
  // ── §S approve ok ⇒ การ์ดออกทันที (ก่อนโหลดใหม่เสร็จ) ──
  { let approved = false;
    const { p, log } = await open("/secretary/room/r2", FX, {
      "POST /api/mobile/secretary/proposals/p-quote/approve": () => { approved = true; return { body: { ok: true, note: "ออกใบเสนอราคา Q-0012 แล้ว" } }; },
      "GET /api/mobile/secretary/rooms/r2/proposals": () => (approved ? { delay: 3000, body: { items: [] } } : { body: FX.endpoints["GET /api/mobile/secretary/rooms/r2/proposals"] }),
    });
    await p.waitForSelector('[data-testid="sec-room-approve"]'); res.cardsBefore = await count(p, "sec-room-approval");
    await p.click('[data-testid="sec-room-approve"]'); await sleep(600); res.cardsAt600ms = await count(p, "sec-room-approval"); res.proposalsGetsAt600ms = hits(log, "GET /api/mobile/secretary/rooms/r2/proposals");
    res.approveFlash = await text(p, "sec-room-flash"); await sleep(3200); res.cardsAfterReload = await count(p, "sec-room-approval"); await p.close(); }
  // ── §S ok:false ⇒ โหลดใหม่ทันที ──
  { const { p, log } = await open("/secretary/room/r2", FX, { "POST /api/mobile/secretary/proposals/p-quote/approve": { body: { ok: false, note: "หมดอายุแล้ว" } } });
    await p.waitForSelector('[data-testid="sec-room-approve"]'); const g0 = hits(log, "GET /api/mobile/secretary/rooms/r2"); await p.click('[data-testid="sec-room-approve"]'); await sleep(800);
    res.deniedReloadGets = [g0, hits(log, "GET /api/mobile/secretary/rooms/r2")]; res.deniedNote = await text(p, "sec-room-approval-note"); await p.close(); }
  // ── §S ปิดห้องมีชีตยืนยัน ──
  { const { p, log } = await open("/secretary/room/r2", FX); await p.waitForSelector('[data-testid="sec-room-menu"]');
    await p.click('[data-testid="sec-room-menu"]'); await p.waitForSelector('[data-testid="sec-room-menu-close"]'); await p.click('[data-testid="sec-room-menu-close"]'); await p.waitForSelector('[data-testid="sec-room-close-confirm-ok"]');
    res.closeBeforeOk = hits(log, "POST /api/mobile/secretary/rooms/r2/close"); await p.screenshot({ path: `${OUT}/close-confirm.png` });
    await p.click('[data-testid="sec-room-close-confirm-ok"]'); await sleep(900); res.closeAfterOk = bodies(log, "POST /api/mobile/secretary/rooms/r2/close"); await p.close(); }
  // ── §S clientMessageId: ล้ม → ส่งซ้ำข้อความเดิม = รหัสเดิม · แก้ร่าง = รหัสใหม่ · duplicate ⇒ แจ้ง ──
  { let n = 0; const { p, log } = await open("/secretary/room/r2", FX, { "POST /api/mobile/secretary/rooms/r2/send": () => (++n <= 2 ? { status: 500, body: { error: "server_error", message: "ลองใหม่" } } : { body: { ok: true, duplicate: true } }) });
    await p.waitForSelector('[data-testid="sec-room-input-field"]'); await p.type('[data-testid="sec-room-input-field"]', "ส่งใบเสนอราคาเลย");
    await p.click('[data-testid="sec-room-send"]'); await sleep(800); await p.click('[data-testid="sec-room-send"]'); await sleep(800);
    await p.type('[data-testid="sec-room-input-field"]', " ด่วน"); await p.click('[data-testid="sec-room-send"]'); await sleep(900);
    const ids = bodies(log, "POST /api/mobile/secretary/rooms/r2/send").map((x) => JSON.parse(x).clientMessageId);
    res.cmidSameOnRetry = ids[0] === ids[1]; res.cmidNewAfterEdit = ids[2] !== ids[1]; res.cmidCount = ids.length; res.dupFlash = await text(p, "sec-room-flash"); await p.close(); }
  // ── §S ย้อนต่อแถว + ยืนยัน (s2.4 r1) · chat.send ลงชื่อ ──
  { const { p, log } = await open("/secretary/room/r1", F24); await p.waitForSelector('[data-testid="sec-room-undo"]');
    res.undoButtons = await count(p, "sec-room-undo"); res.signature = await text(p, "sec-room-approval-signature");
    await p.click('[data-testid="sec-room-undo"]'); await p.waitForSelector('[data-testid="sec-room-undo-confirm-ok"]'); res.undoConfirmItem = await text(p, "sec-room-undo-confirm-item"); res.undoBeforeOk = hits(log, "POST /api/mobile/secretary/log/l1/undo");
    await p.screenshot({ path: `${OUT}/undo-confirm.png` }); await p.click('[data-testid="sec-room-undo-confirm-ok"]'); await sleep(1000);
    res.undoAfterOk = bodies(log, "POST /api/mobile/secretary/log/l1/undo"); res.undoNote = await text(p, "sec-room-undo-note"); await p.close(); }
  // canUndo=false จากเซิร์ฟเวอร์ (แม้ undoableUntil ยังไม่ถึง) ⇒ ไม่มีปุ่มย้อน
  { const fx = JSON.parse(JSON.stringify(F24)); fx.endpoints["GET /api/mobile/secretary/log"].items[0].canUndo = false; fx.endpoints["GET /api/mobile/secretary/log"].items[0].undoableUntil = "2099-01-01T00:00:00.000Z";
    const { p } = await open("/secretary/room/r1", fx); await p.waitForSelector('[data-testid="sec-room-done"]'); res.undoHiddenWhenServerSaysNo = (await count(p, "sec-room-undo")) === 0; await p.close(); }
  // ── §S แผน: ทำแล้ว N/M + note ขั้นที่ล้ม ──
  { const fx = JSON.parse(JSON.stringify(F24)); fx.endpoints["GET /api/mobile/secretary/rooms/r1/proposals"].items = [{ id: "pl-x", type: "plan", title: "ตัดสต็อกและออกบิล", hasDestructive: false, canApprove: true, createdAt: "2026-11-04T19:41:30.000Z", expiresAt: "2026-11-07T19:41:30.000Z", steps: [{ kind: "inventory.stock.adjust", summary: "ตัดสต็อก 2 ชุด" }, { kind: "account.documents.create", summary: "ออกใบแจ้งหนี้" }] }];
    const { p, log } = await open("/secretary/room/r1", fx, { "POST /api/mobile/secretary/plans/pl-x/approve": { body: { ok: false, doneCount: 1, results: [{ summary: "ตัดสต็อก 2 ชุด", ok: true, note: "ตัดแล้ว" }, { summary: "ออกใบแจ้งหนี้", ok: false, note: "ยังไม่ได้ตั้งเลขผู้เสียภาษี" }] } } });
    await p.waitForSelector('[data-testid="sec-room-approve"]'); await p.click('[data-testid="sec-room-approve"]'); await sleep(900);
    res.planFlash = await text(p, "sec-room-flash"); res.planCardsAfter = await count(p, "sec-room-approval"); res.planReloaded = hits(log, "GET /api/mobile/secretary/rooms/r1/proposals") >= 2; await p.screenshot({ path: `${OUT}/plan-partial.png` }); await p.close(); }
  // ── §S AppState: เบื้องหลัง = หยุด poll · กลับมา = โหลดทันที (running 5 วิ) ──
  { const { p, log } = await open("/secretary/room/r1", RUN); await p.waitForSelector('[data-testid="sec-room-background"]'); const K = "GET /api/mobile/secretary/rooms/r1";
    await sleep(6000); const a = hits(log, K);
    await p.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" }); Object.defineProperty(document, "hidden", { configurable: true, get: () => true }); document.dispatchEvent(new Event("visibilitychange")); });
    await sleep(500); const b0 = hits(log, K); await sleep(11000); const b1 = hits(log, K);
    await p.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" }); Object.defineProperty(document, "hidden", { configurable: true, get: () => false }); document.dispatchEvent(new Event("visibilitychange")); });
    await sleep(800); const c1 = hits(log, K); res.appState = { foreground6s: a, hiddenStart: b0, hiddenAfter11s: b1, afterVisible800ms: c1 }; await p.close(); }
  // ── §S ออฟไลน์ถอยห่าง: GET ห้องล้ม (500) ⇒ ช่วงห่างโต 5→10→20 วิ ──
  { const { p, log } = await open("/secretary/room/r1", RUN); await p.waitForSelector('[data-testid="sec-room-background"]'); const K = "GET /api/mobile/secretary/rooms/r1";
    await p.setRequestInterception(true); p.removeAllListeners("request");
    const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS" };
    p.on("request", (q) => { const u = new URL(q.url()); if (u.host === "shark.in.th") { if (q.method() === "OPTIONS") return q.respond({ status: 204, headers: cors, body: "" }); log.push({ k: `${q.method()} ${u.pathname}`, t: Date.now() }); return q.abort("failed"); } q.continue(); });
    await sleep(40000); const g = log.filter((x) => x.k === K).map((x) => x.t); res.offlineGapsMs = g.slice(-5).map((x, i, arr) => (i ? x - arr[i - 1] : null)).filter((x) => x !== null); await p.close(); }
  // ── C1 บันทึก ⇒ PUT แล้วไป /secretary ──
  { const { p, log } = await open("/secretary/onboarding/name", FX, { "PUT /api/mobile/secretary/secretary": (body) => ({ body: { ...JSON.parse(body), languages: ["th"], sample: "", saved: true } }) });
    await p.waitForSelector('[data-testid="sec-onb-name-input"]'); res.c1Default = await p.$eval('[data-testid="sec-onb-name-input"]', (e) => e.value);
    const f = await p.$('[data-testid="sec-onb-name-input"]'); await f.click({ clickCount: 3 }); await p.keyboard.press("Backspace"); await p.type('[data-testid="sec-onb-name-input"]', "Nana");
    await p.click('[data-testid="sec-onb-suffix-kha"]');
    await sleep(300); res.c1Preview = await text(p, "sec-onb-preview"); res.c1SaveLabel = await text(p, "sec-onb-save"); await p.screenshot({ path: `${OUT}/c1-edited.png` });
    await p.click('[data-testid="sec-onb-save"]'); await sleep(1500); res.c1Put = bodies(log, "PUT /api/mobile/secretary/secretary"); res.c1Url = new URL(p.url()).pathname; await p.close(); }
  // C1 ข้าม ⇒ ไม่ PUT
  { const { p, log } = await open("/secretary/onboarding/name", FX); await p.waitForSelector('[data-testid="sec-onb-skip"]'); await p.click('[data-testid="sec-onb-skip"]'); await sleep(1200);
    res.c1SkipPuts = hits(log, "PUT /api/mobile/secretary/secretary"); res.c1SkipUrl = new URL(p.url()).pathname; await p.close(); }
} finally { await b.close(); srv.close(); for (const d of [UDD, `/tmp/snap-private-tmp/snap.chromium/tmp/chr-s210-${process.pid}`]) rmSync(d, { recursive: true, force: true }); }
console.log(JSON.stringify(res, null, 1));
