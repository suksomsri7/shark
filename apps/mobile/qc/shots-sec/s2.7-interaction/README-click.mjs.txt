// S2.7–S2.9 interaction run (QC only): serves the exported dist, mocks shark.in.th from fixtures, clicks through the settings screens.
// usage: node s27-click.mjs <dist> <owner-fixture> <staff-fixture> <outdir> <port>
import puppeteer from "/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";

const [DIST, OWNER, STAFF, OUT, PORT] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
const MIME = { ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".ttf": "font/ttf", ".ico": "image/x-icon" };
const server = await new Promise((ok) => {
  const s = createServer((req, res) => {
    const u = new URL(req.url ?? "/", "http://x");
    let f = join(DIST, decodeURIComponent(u.pathname));
    if (!f.startsWith(DIST) || !existsSync(f) || statSync(f).isDirectory()) f = join(DIST, "index.html");
    res.writeHead(200, { "content-type": MIME[extname(f)] ?? "application/octet-stream" });
    res.end(readFileSync(f));
  });
  s.listen(Number(PORT), "127.0.0.1", () => ok(s));
});
const BASE = `http://127.0.0.1:${PORT}`;
const UDD = `/tmp/chr-s27-${process.pid}`;
const browser = await puppeteer.launch({ executablePath: "/usr/bin/chromium-browser", headless: true, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars", `--user-data-dir=${UDD}`] });
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function open(fixturePath, route) {
  const FX = JSON.parse(readFileSync(fixturePath, "utf8"));
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.setRequestInterception(true);
  const log = [];
  page.on("request", (req) => {
    const u = new URL(req.url());
    if (u.host !== "shark.in.th") return req.continue();
    const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS" };
    if (req.method() === "OPTIONS") return req.respond({ status: 204, headers: cors, body: "" });
    let body = null;
    try { body = req.postData() ? JSON.parse(req.postData()) : null; } catch { body = req.postData(); }
    log.push({ method: req.method(), path: u.pathname, search: u.search, body });
    const k1 = `${req.method()} ${u.pathname}`;
    const hit = Object.prototype.hasOwnProperty.call(FX.endpoints, k1) ? FX.endpoints[k1] : Object.prototype.hasOwnProperty.call(FX.endpoints, u.pathname) ? FX.endpoints[u.pathname] : undefined;
    if (hit === undefined) return req.respond({ status: 404, headers: cors, contentType: "application/json", body: '{"error":"not_found"}' });
    return req.respond({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify(hit) });
  });
  await page.evaluateOnNewDocument(() => { localStorage.clear(); localStorage.setItem("shark_theme", "light"); localStorage.setItem("shark_token", "qc-mock"); localStorage.setItem("shark_tenant", "t1"); });
  await page.goto(BASE + route, { waitUntil: "networkidle0", timeout: 60000 });
  await sleep(800);
  return { page, log };
}
const tid = (id) => `[data-testid="${id}"]`;
const writes = (log, method, path) => log.filter((x) => x.method === method && x.path === path);
async function click(page, id) { await page.waitForSelector(tid(id), { timeout: 15000 }); await page.click(tid(id)); await sleep(700); }
async function typeInto(page, id, text) {
  await page.waitForSelector(tid(id), { timeout: 15000 });
  await page.click(tid(id));
  await page.keyboard.down("Control"); await page.keyboard.press("KeyA"); await page.keyboard.up("Control");
  await page.keyboard.press("Backspace");
  await page.keyboard.type(text);
  await sleep(300);
}
const shot = (page, n) => page.screenshot({ path: join(OUT, n + ".png") });

try {
  // 1) B2 save profile → PUT secretary
  {
    const { page, log } = await open(OWNER, "/secretary/settings/secretary");
    await click(page, "sec-me-save");
    const putBefore = writes(log, "PUT", "/api/mobile/secretary/secretary").length;
    await typeInto(page, "sec-me-name", "Nova");
    await click(page, "sec-me-tone-friendly");
    await click(page, "sec-me-suffix-kha");
    const sample = await page.$eval(tid("sec-me-sample"), (e) => e.innerText);
    await click(page, "sec-me-save");
    await sleep(600);
    const put = writes(log, "PUT", "/api/mobile/secretary/secretary");
    await shot(page, "b2-saved");
    check("B2 save does nothing until edited", putBefore === 0, `PUT before edit=${putBefore}`);
    check("B2 live sample uses new name/suffix", /Nova/.test(sample) && sample.includes("ค่ะ"), JSON.stringify(sample));
    check("B2 save → PUT secretary {name,suffix,tone,languages}", put.length === 1 && put[0].body.name === "Nova" && put[0].body.suffix === "ค่ะ" && put[0].body.tone === "friendly" && Array.isArray(put[0].body.languages), JSON.stringify(put.map((x) => x.body)));
    check("B2 refreshes secretary/me after save", log.filter((x) => x.method === "GET" && x.path === "/api/mobile/secretary/me").length >= 2, "");
    await page.close();
  }
  // 2) B4 rules as OWNER: toggle chat.send → PUT · limit 30000 → PUT limitSatang · locked toggle → no PUT
  {
    const { page, log } = await open(OWNER, "/secretary/settings/rules");
    await click(page, "sec-rules-row-money-toggle");
    const afterLocked = writes(log, "PUT", "/api/mobile/secretary/rules").length;
    await click(page, "sec-rules-row-chat.send-toggle");
    await sleep(500);
    await typeInto(page, "sec-rules-limit", "30000");
    await page.keyboard.press("Enter");
    await sleep(800);
    const put = writes(log, "PUT", "/api/mobile/secretary/rules");
    await shot(page, "b4-toggled");
    check("B4 locked (always-approve) toggle sends nothing", afterLocked === 0, `PUT=${afterLocked}`);
    check("B4 toggle chat.send → PUT {key:'chat.send', enabled:false}", put.some((x) => x.body.key === "chat.send" && x.body.enabled === false), JSON.stringify(put.map((x) => x.body)));
    check("B4 limit 30000 baht → PUT {key:'money.limit', limitSatang:3000000}", put.some((x) => x.body.key === "money.limit" && x.body.limitSatang === 3000000), JSON.stringify(put.map((x) => x.body)));
    await page.close();
  }
  // 3) B3 access as OWNER: chat → OFF → PUT · auto slot not clickable
  {
    const { page, log } = await open(OWNER, "/secretary/settings/access");
    await click(page, "sec-access-level-chat-auto");
    const afterAuto = writes(log, "PUT", "/api/mobile/secretary/access").length;
    await click(page, "sec-access-level-chat-OFF");
    const put = writes(log, "PUT", "/api/mobile/secretary/access");
    await shot(page, "b3-chat-off");
    check("B3 'act alone' slot is locked (no PUT)", afterAuto === 0, `PUT=${afterAuto}`);
    check("B3 OFF → PUT {module:'chat', level:'OFF'}", put.length === 1 && put[0].body.module === "chat" && put[0].body.level === "OFF", JSON.stringify(put.map((x) => x.body)));
    await page.close();
  }
  // 4) B5 log: undo l2 → POST · filters → query
  {
    const { page, log } = await open(OWNER, "/secretary/settings/log");
    const undoButtons = await page.$$eval('[data-testid^="sec-log-undo-"]', (els) => els.map((e) => e.getAttribute("data-testid")));
    const strike = await page.$eval(tid("sec-log-item-l6"), (e) => getComputedStyle(e.querySelector("div[dir], div") ?? e).textDecorationLine + "|" + e.innerText);
    await click(page, "sec-log-undo-l2");
    await sleep(500);
    const post = writes(log, "POST", "/api/mobile/secretary/log/l2/undo");
    const note = await page.$eval(tid("sec-log-note"), (e) => e.innerText).catch(() => "");
    await shot(page, "b5-undone");
    check("B5 undo button only on undoable rows (l2)", JSON.stringify(undoButtons) === JSON.stringify(["sec-log-undo-l2"]), JSON.stringify(undoButtons));
    check("B5 undo → POST log/l2/undo body {} (no now)", post.length === 1 && JSON.stringify(post[0].body) === "{}", JSON.stringify(post.map((x) => x.body)));
    check("B5 server note shown", /ย้อนกลับแล้ว/.test(note), note);
    const deco = await page.$eval(tid("sec-log-item-l6"), (e) => [...e.querySelectorAll("*")].map((x) => getComputedStyle(x).textDecorationLine).filter((d) => d && d !== "none"));
    check("B5 undone row l6 is struck through", deco.includes("line-through"), JSON.stringify(deco));
    await click(page, "sec-log-filter-today");
    await click(page, "sec-log-filter-m-crm");
    const gets = log.filter((x) => x.method === "GET" && x.path === "/api/mobile/secretary/log").map((x) => x.search);
    check("B5 filters → ?day=YYYY-MM-DD and ?module=crm", gets.some((s) => /day=\d{4}-\d{2}-\d{2}/.test(s)) && gets.some((s) => /module=crm/.test(s)), JSON.stringify(gets));
    void strike;
    await page.close();
  }
  // 5) B6 knowledge: confirm/reject lesson + memory
  {
    const { page, log } = await open(OWNER, "/secretary/settings/knowledge");
    const rejectedShown = await page.$(tid("sec-know-lesson-ls3"));
    await click(page, "sec-know-confirm-ls1");
    await click(page, "sec-know-reject-ls2");
    await click(page, "sec-know-confirm-mm1");
    await click(page, "sec-know-reject-mm2");
    await shot(page, "b6-acted");
    check("B6 REJECTED lesson hidden", !rejectedShown, "");
    check("B6 confirm lesson → POST lessons/ls1/confirm", writes(log, "POST", "/api/mobile/secretary/lessons/ls1/confirm").length === 1, "");
    check("B6 reject lesson → DELETE lessons/ls2", writes(log, "DELETE", "/api/mobile/secretary/lessons/ls2").length === 1, "");
    check("B6 confirm memory → POST memories/mm1/confirm", writes(log, "POST", "/api/mobile/secretary/memories/mm1/confirm").length === 1, "");
    check("B6 delete memory → DELETE memories/mm2", writes(log, "DELETE", "/api/mobile/secretary/memories/mm2").length === 1, "");
    await page.close();
  }
  // 6) B7 after-hours: disclosure without AI rejected client-side · with AI → PUT
  {
    const { page, log } = await open(OWNER, "/secretary/settings/customers");
    await click(page, "sec-cust-afterhours");
    await typeInto(page, "sec-cust-disclosure", "ข้อความจากร้าน ทีมงานจะตอบกลับพรุ่งนี้");
    await click(page, "sec-cust-save");
    const err = await page.$eval(tid("sec-cust-disclosure-error"), (e) => e.innerText).catch(() => "");
    const put0 = writes(log, "PUT", "/api/mobile/secretary/after-hours").length;
    await shot(page, "b7-no-ai-rejected");
    check("B7 disclosure without AI → error shown, no PUT", !!err && put0 === 0, `${err} · PUT=${put0}`);
    await typeInto(page, "sec-cust-disclosure", "ตอบโดย Shark ผู้ช่วย AI ของร้าน");
    await click(page, "sec-cust-save");
    await sleep(500);
    const put = writes(log, "PUT", "/api/mobile/secretary/after-hours");
    await shot(page, "b7-saved");
    check("B7 valid disclosure → PUT {reply:false, handoff:true, disclosure}", put.length === 1 && put[0].body.reply === false && put[0].body.handoff === true && /AI/.test(put[0].body.disclosure), JSON.stringify(put.map((x) => x.body)));
    await page.close();
  }
  // 7) STAFF read-only: no writes possible
  {
    const { page, log } = await open(STAFF, "/secretary/settings/access");
    await click(page, "sec-access-level-pos-OFF");
    const a = writes(log, "PUT", "/api/mobile/secretary/access").length;
    await page.close();
    const r = await open(STAFF, "/secretary/settings/rules");
    await click(r.page, "sec-rules-row-chat.send-toggle");
    const b = writes(r.log, "PUT", "/api/mobile/secretary/rules").length;
    const limitEditable = await r.page.$eval(tid("sec-rules-limit"), (e) => !e.readOnly && !e.disabled);
    await r.page.close();
    const k = await open(STAFF, "/secretary/settings/customers");
    const ah = k.log.filter((x) => x.path === "/api/mobile/secretary/after-hours").length;
    await k.page.close();
    check("STAFF access picker read-only (no PUT)", a === 0, `PUT=${a}`);
    check("STAFF rules toggle read-only (no PUT) · limit not editable", b === 0 && !limitEditable, `PUT=${b} editable=${limitEditable}`);
    check("STAFF customers page does not call after-hours", ah === 0, `calls=${ah}`);
  }
} finally {
  await browser.close();
  server.close();
  for (const d of [UDD, `/tmp/snap-private-tmp/snap.chromium/tmp/chr-s27-${process.pid}`]) rmSync(d, { recursive: true, force: true });
}
writeFileSync(join(OUT, "results.json"), JSON.stringify(results, null, 1));
const bad = results.filter((r) => !r.ok);
console.log(`INTERACTION ${results.length - bad.length}/${results.length} pass`);
process.exit(bad.length ? 1 : 0);
