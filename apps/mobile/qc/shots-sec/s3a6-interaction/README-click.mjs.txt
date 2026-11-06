// S3a.6-A interaction check (แปลภาษาห้องแชทลูกค้า) — QC web export ของ /root/qc-shark-mobile-sec-d/dist · mock จาก fixture (+override ต่อกรณี) · ไม่มี server จริง
// รัน: cp README-click.mjs.txt <scratch>/s3a6-click.mjs && bash scripts/iso.sh node <scratch>/s3a6-click.mjs $PWD/apps/mobile/qc/fixtures/secretary $PWD/apps/mobile/qc/shots-sec/s3a6-interaction
import puppeteer from "/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";
import { createServer } from "node:http"; import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync, rmSync } from "node:fs"; import { join, extname } from "node:path";
const DIST = "/root/qc-shark-mobile-sec-d/dist", FXD = process.argv[2], OUT = process.argv[3];
const fx = (f) => JSON.parse(readFileSync(join(FXD, f), "utf8"));
mkdirSync(OUT, { recursive: true });
const PORT = 4727;
const srv = createServer((q, r) => { let f = join(DIST, decodeURIComponent(new URL(q.url, "http://x").pathname)); if (!existsSync(f) || statSync(f).isDirectory()) f = join(DIST, "index.html"); r.writeHead(200, { "content-type": { ".html": "text/html", ".js": "application/javascript", ".ttf": "font/ttf", ".png": "image/png" }[extname(f)] ?? "application/octet-stream" }); r.end(readFileSync(f)); }).listen(PORT);
const UDD = `/tmp/chr-s3a6a-${process.pid}`;
const b = await puppeteer.launch({ executablePath: "/usr/bin/chromium-browser", headless: true, args: ["--no-sandbox", `--user-data-dir=${UDD}`] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const res = {};
async function open(route, F, over = {}, store = {}) {
  const ctx = await b.createBrowserContext();
  const p = await ctx.newPage(); await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 }); await p.setRequestInterception(true);
  await p.emulateMediaFeatures([{ name: "prefers-color-scheme", value: store.dark ? "dark" : "light" }]);
  await p.evaluateOnNewDocument(() => Object.defineProperty(navigator, "language", { get: () => "th-TH" }));
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS" };
  const log = [];
  p.on("request", async (q) => { const u = new URL(q.url()); if (u.host === "shark.in.th") { if (q.method() === "OPTIONS") return q.respond({ status: 204, headers: cors, body: "" }); const k = `${q.method()} ${u.pathname}`; const body = q.postData() ?? null; log.push({ k, body, tenant: q.headers()["x-tenant-id"] ?? null, auth: q.headers()["authorization"] ?? null, t: Date.now() }); const o = over[k]; if (o) { const r = typeof o === "function" ? o(body, log) : o; if (r.delay) await sleep(r.delay); return q.respond({ status: r.status ?? 200, headers: cors, contentType: "application/json", body: JSON.stringify(r.body) }).catch(() => {}); } let bd = F.endpoints[k]; let st = 200; if (bd && typeof bd === "object" && "__status" in bd) { st = bd.__status; bd = bd.__body; } return q.respond({ status: bd !== undefined ? st : 404, headers: cors, contentType: "application/json", body: JSON.stringify(bd ?? { error: "x" }) }).catch(() => {}); } if (u.hostname === "127.0.0.1" || /fonts/.test(u.host) || u.protocol === "data:" || u.protocol === "blob:") return q.continue(); return q.respond({ status: 204, headers: cors, body: "" }); });
  await p.evaluateOnNewDocument((st) => { if (sessionStorage.getItem("qc-init")) return; sessionStorage.setItem("qc-init", "1"); localStorage.clear(); localStorage.setItem("shark_theme", st.dark ? "dark" : "light"); localStorage.setItem("shark_token", "qc-mock"); localStorage.setItem("shark_tenant", "t1"); }, store);
  await p.goto(`http://127.0.0.1:${PORT}` + route, { waitUntil: "networkidle0" }).catch(() => {});
  await sleep(500);
  const close = async () => { await p.close().catch(() => {}); await ctx.close().catch(() => {}); };
  return { p, log, close };
}
const text = (p, id) => p.$eval(`[data-testid="${id}"]`, (e) => e.innerText).catch(() => null);
const dis = (p, id) => p.$eval(`[data-testid="${id}"]`, (e) => e.getAttribute("aria-disabled")).catch(() => "none");
const val = (p, id) => p.$eval(`[data-testid="${id}"]`, (e) => e.value).catch(() => null);
const has = async (p, id) => !!(await p.$(`[data-testid="${id}"]`));
const bodies = (log, k) => log.filter((x) => x.k === k).map((x) => x.body);
const path = (p) => new URL(p.url()).pathname;
const step = async (name, fn) => { try { await fn(); } catch (e) { res[name + "_ERROR"] = String(e).slice(0, 300); } };
const F6 = fx("s3a6.json"), FF = fx("s3a6-fail.json");
const R = "/customers/x9";
const field = '[data-testid="cust-input-field"]';
try {
  await step("translateMsg", async () => { const { p, log, close } = await open(R, F6); await p.waitForSelector('[data-testid="cust-bubble-translate"]');
    res.before = { buttons: (await p.$$('[data-testid="cust-bubble-translate"]')).length, translations: (await p.$$('[data-testid="cust-bubble-translation"]')).length, gloss: await text(p, "cust-draft-gloss") };
    await p.$eval('[data-testid="cust-bubble-translate"]', (e) => { e.click(); e.click(); }); await sleep(1200);
    const rq = log.filter((x) => x.k.endsWith("/messages/m91/translate")); res.translatePost = { n: rq.length, body: rq[0]?.body ?? null, tenant: rq[0]?.tenant ?? null };
    res.after = { buttons: (await p.$$('[data-testid="cust-bubble-translate"]')).length, translations: await p.$$eval('[data-testid="cust-bubble-translation"]', (es) => es.map((e) => e.innerText)) };
    await p.evaluate(() => window.scrollTo(0, 0)); await p.$eval('[data-testid="cust-bubble-translation"]', (e) => e.scrollIntoView({ block: "center" }));
    await sleep(300); await p.screenshot({ path: `${OUT}/s3a6-1-translated.png` }); await close(); });
  await step("draftSendBody", async () => { const { p, log, close } = await open(R, F6); await p.waitForSelector('[data-testid="cust-draft-send"]'); await p.click('[data-testid="cust-draft-send"]'); await sleep(1200);
    const b = JSON.parse(bodies(log, "POST /api/mobile/inbox/conversations/x9/reply")[0] ?? "{}"); res.draftSend = { body: b.body, suggestionId: b.suggestionId }; await close(); });
  await step("translateDraft", async () => { const { p, log, close } = await open(R, F6); await p.waitForSelector(field);
    res.trBtnDisabledEmpty = await dis(p, "cust-translate-send");
    await p.type(field, "ส่งได้วันพุธค่ะ เดี๋ยวส่งใบเสนอราคาให้วันนี้"); await sleep(200); res.trBtnDisabledTyped = await dis(p, "cust-translate-send");
    await p.$eval('[data-testid="cust-translate-send"]', (e) => { e.click(); e.click(); }); await sleep(1300);
    const rq = log.filter((x) => x.k === "POST /api/mobile/inbox/conversations/x9/translate-draft"); res.trDraftPost = { n: rq.length, body: rq[0]?.body ?? null };
    res.sheet = { open: await has(p, "cust-tr-sheet"), original: await text(p, "cust-tr-original"), text: await text(p, "cust-tr-text") };
    await p.screenshot({ path: `${OUT}/s3a6-2-sheet.png` });
    await p.click('[data-testid="cust-tr-send"]'); await sleep(1500);
    const rp = log.filter((x) => x.k === "POST /api/mobile/inbox/conversations/x9/reply"); res.trSend = { n: rp.length, body: JSON.parse(rp[0]?.body ?? "{}").body, sheetClosed: !(await has(p, "cust-tr-sheet")), fieldCleared: (await val(p, "cust-input-field")) === "" }; await close(); });
  await step("translateEditCancel", async () => { const { p, log, close } = await open(R, F6); await p.waitForSelector(field); await p.type(field, "ขอบคุณค่ะ"); await sleep(200);
    await p.click('[data-testid="cust-translate-send"]'); await sleep(1200); await p.click('[data-testid="cust-tr-edit"]'); await sleep(500);
    res.edit = { field: await val(p, "cust-input-field"), sheetClosed: !(await has(p, "cust-tr-sheet")), replies: bodies(log, "POST /api/mobile/inbox/conversations/x9/reply").length };
    await p.click('[data-testid="cust-translate-send"]'); await sleep(1200); await p.click('[data-testid="cust-tr-cancel"]'); await sleep(500);
    res.cancel = { sheetClosed: !(await has(p, "cust-tr-sheet")), replies: bodies(log, "POST /api/mobile/inbox/conversations/x9/reply").length }; await close(); });
  await step("dark", async () => { const { p, close } = await open(R, F6, {}, { dark: true }); await p.waitForSelector(field); await p.type(field, "ส่งได้วันพุธค่ะ"); await p.click('[data-testid="cust-translate-send"]'); await sleep(1300); await p.screenshot({ path: `${OUT}/s3a6-2-sheet-dark.png` }); await close(); });
  await step("failSoft", async () => { const { p, close } = await open(R, FF); await p.waitForSelector('[data-testid="cust-bubble-translate"]'); await p.click('[data-testid="cust-bubble-translate"]'); await sleep(1200);
    res.failMsg = { note: await text(p, "cust-room-note"), stillButton: await has(p, "cust-bubble-translate") };
    await p.type(field, "ขอบคุณค่ะ"); await p.click('[data-testid="cust-translate-send"]'); await sleep(1200);
    res.failDraft = { note: await text(p, "cust-send-note"), sheet: await has(p, "cust-tr-sheet"), field: await val(p, "cust-input-field") };
    await p.screenshot({ path: `${OUT}/s3a6-3-failsoft.png` }); await close(); });
  await step("noTranslate", async () => { const F0 = JSON.parse(JSON.stringify(F6)); const cv = F0.endpoints["GET /api/mobile/inbox/conversations/x9"].conversation; cv.can.translate = false;
    const { p, close } = await open(R, F0); await p.waitForSelector(field); await sleep(500); res.disabledFeature = { translateBtn: await has(p, "cust-bubble-translate"), sendBtn: await has(p, "cust-translate-send"), cachedTranslation: await has(p, "cust-bubble-translation") }; await close();
    const F1 = JSON.parse(JSON.stringify(F6)); F1.endpoints["GET /api/mobile/inbox/conversations/x9"].conversation.contactLang = "th";
    const q = await open(R, F1); await q.p.waitForSelector(field); await sleep(500); res.sameLang = { sendBtn: await has(q.p, "cust-translate-send"), translateBtn: await has(q.p, "cust-bubble-translate") }; await q.close(); });
} finally {
  writeFileSync(join(OUT, "result.json"), JSON.stringify(res, null, 1) + "\n");
  console.log(JSON.stringify(res, null, 1));
  await b.close().catch(() => {}); srv.close(); rmSync(UDD, { recursive: true, force: true });
}
