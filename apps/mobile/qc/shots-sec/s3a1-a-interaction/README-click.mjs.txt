// S3a.1-A interaction check — QC web export ของ /root/qc-shark-mobile-sec-d/dist · mock จาก fixture (+override ต่อกรณี) · ไม่มี server จริง
// รัน: cp README-click.mjs.txt <scratch>/s3a1a-click.mjs && bash scripts/iso.sh node <scratch>/s3a1a-click.mjs $PWD/apps/mobile/qc/fixtures/secretary $PWD/apps/mobile/qc/shots-sec/s3a1-a-interaction
import puppeteer from "/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";
import { createServer } from "node:http"; import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync, rmSync } from "node:fs"; import { join, extname } from "node:path";
const DIST = "/root/qc-shark-mobile-sec-d/dist", FXD = process.argv[2], OUT = process.argv[3];
const fx = (f) => JSON.parse(readFileSync(join(FXD, f), "utf8"));
mkdirSync(OUT, { recursive: true });
const PORT = 4726;
const srv = createServer((q, r) => { let f = join(DIST, decodeURIComponent(new URL(q.url, "http://x").pathname)); if (!existsSync(f) || statSync(f).isDirectory()) f = join(DIST, "index.html"); r.writeHead(200, { "content-type": { ".html": "text/html", ".js": "application/javascript", ".ttf": "font/ttf", ".png": "image/png" }[extname(f)] ?? "application/octet-stream" }); r.end(readFileSync(f)); }).listen(PORT);
const UDD = `/tmp/chr-s3a1a-${process.pid}`;
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
const S21 = fx("s2.21.json"), DEL = fx("s2.21-delete.json"), LOCK = fx("s2.21-delete-locked.json"), S22 = fx("s2.2.json"), S24 = fx("s2.4.json"), S217 = fx("s2.17.json");
const toCode = async (p) => { await p.click('[data-testid="acct-delete"]'); await p.waitForSelector('[data-testid="acct-delete-input"]'); await sleep(700); await p.type('[data-testid="acct-delete-input"]', "ลบบัญชี"); await sleep(200); };
try {
  // ── R-Z29 ขั้น 1 → 2 (SMS เบอร์ตัวเอง) → ลบสำเร็จ ──
  await step("smsFlow", async () => { const { p, log, close } = await open("/secretary/settings/account", S21);
    await p.waitForSelector('[data-testid="acct-delete"]'); await p.click('[data-testid="acct-delete"]'); await p.waitForSelector('[data-testid="acct-delete-input"]'); await sleep(700);
    res.wordStepDisabledEmpty = await dis(p, "acct-delete-confirm"); res.wordStepLabel = await text(p, "acct-delete-confirm");
    await p.type('[data-testid="acct-delete-input"]', "ลบบัญชี"); await sleep(200); res.wordStepDisabledTyped = await dis(p, "acct-delete-confirm");
    await p.screenshot({ path: `${OUT}/z29-1-word.png` });
    res.deleteBeforeCode = bodies(log, "POST /api/mobile/secretary/account/delete").length;
    await p.click('[data-testid="acct-delete-confirm"]'); await sleep(1200);
    const rq = log.find((x) => x.k === "POST /api/mobile/auth/sms/request"); res.smsRequest = { body: rq?.body ?? null, tenant: rq?.tenant ?? null, bearer: !!rq?.auth };
    res.codeStep = { sent: await text(p, "acct-delete-sent"), input: await has(p, "acct-delete-code"), wordInputGone: !(await has(p, "acct-delete-input")), resend: await text(p, "acct-delete-resend"), resendDisabled: await dis(p, "acct-delete-resend"), finalDisabled: await dis(p, "acct-delete-final"), confirmGone: !(await has(p, "acct-delete-confirm")) };
    await p.screenshot({ path: `${OUT}/z29-2-code.png` });
    await p.type('[data-testid="acct-delete-code"]', "12a345"); await sleep(200); res.code5 = { value: await val(p, "acct-delete-code"), finalDisabled: await dis(p, "acct-delete-final") };
    await p.click('[data-testid="acct-delete-final"]'); await sleep(300); res.deleteAt5 = bodies(log, "POST /api/mobile/secretary/account/delete").length;
    await p.type('[data-testid="acct-delete-code"]', "6"); await sleep(200); res.code6 = { value: await val(p, "acct-delete-code"), finalDisabled: await dis(p, "acct-delete-final") };
    await p.screenshot({ path: `${OUT}/z29-3-code-filled.png` });
    // กดสองครั้งติด ⇒ POST ครั้งเดียว (R-Z30)
    await p.$eval('[data-testid="acct-delete-final"]', (e) => { e.click(); e.click(); }); await sleep(2000);
    const del = log.filter((x) => x.k === "POST /api/mobile/secretary/account/delete"); res.deletePost = { n: del.length, body: del[0]?.body ?? null, tenant: del[0]?.tenant ?? null };
    res.afterDelete = { logout: bodies(log, "POST /api/mobile/auth/logout").length, url: path(p), token: await p.evaluate(() => localStorage.getItem("shark_token")) };
    await close(); });
  // ── มืด: ขั้นใส่รหัส ──
  await step("smsDark", async () => { const { p, close } = await open("/secretary/settings/account", S21, {}, { dark: true }); await p.waitForSelector('[data-testid="acct-delete"]'); await toCode(p); await p.screenshot({ path: `${OUT}/z29-1-word-dark.png` }); await p.click('[data-testid="acct-delete-confirm"]'); await sleep(1200); await p.screenshot({ path: `${OUT}/z29-2-code-dark.png` }); await close(); });
  // ── ส่งรหัสอีกครั้ง (cooldown 0) ──
  await step("resend", async () => { const { p, log, close } = await open("/secretary/settings/account", S21, { "POST /api/mobile/auth/sms/request": { body: { ok: true, resendAfterSec: 0 } } }); await p.waitForSelector('[data-testid="acct-delete"]'); await toCode(p); await p.click('[data-testid="acct-delete-confirm"]'); await sleep(1000);
    res.resend0 = { label: await text(p, "acct-delete-resend"), disabled: await dis(p, "acct-delete-resend") }; await p.type('[data-testid="acct-delete-code"]', "111"); await p.click('[data-testid="acct-delete-resend"]'); await sleep(1000);
    res.resendAfter = { requests: bodies(log, "POST /api/mobile/auth/sms/request").length, codeCleared: (await val(p, "acct-delete-code")) === "" }; await close(); });
  // ── อีเมล (ไม่มีเบอร์) + รหัสผิด 401 (fixture s2.21-delete) ──
  await step("emailWrong", async () => { const { p, log, close } = await open("/secretary/settings/account", DEL); await p.waitForSelector('[data-testid="acct-delete"]'); await toCode(p);
    await p.screenshot({ path: `${OUT}/z29-4-email-word.png` });
    await p.click('[data-testid="acct-delete-confirm"]'); await sleep(1200);
    const rq = log.find((x) => x.k === "POST /api/mobile/auth/otp"); res.emailOtp = { body: rq?.body ?? null, tenant: rq?.tenant ?? null, sms: bodies(log, "POST /api/mobile/auth/sms/request").length };
    res.emailSent = await text(p, "acct-delete-sent"); await p.screenshot({ path: `${OUT}/z29-5-email-code.png` });
    await p.type('[data-testid="acct-delete-code"]', "000000"); await sleep(200); await p.click('[data-testid="acct-delete-final"]'); await sleep(1200);
    res.wrong = { body: bodies(log, "POST /api/mobile/secretary/account/delete")[0] ?? null, note: await text(p, "acct-delete-note"), codeCleared: (await val(p, "acct-delete-code")) === "", stillOpen: await has(p, "acct-delete-final"), url: path(p), token: await p.evaluate(() => localStorage.getItem("shark_token")) };
    await p.screenshot({ path: `${OUT}/z29-6-wrong-code.png` }); await close(); });
  // ── 401 locked (ผิดเกินเพดาน) ⇒ ข้อความของมันเอง + ปิดช่องรหัส/ปุ่มลบ · ขอรหัสใหม่ ⇒ เปิดคืน ──
  await step("locked", async () => { const { p, log, close } = await open("/secretary/settings/account", LOCK); await p.waitForSelector('[data-testid="acct-delete"]'); await toCode(p); await p.click('[data-testid="acct-delete-confirm"]'); await sleep(1000);
    await p.type('[data-testid="acct-delete-code"]', "999999"); await p.click('[data-testid="acct-delete-final"]'); await sleep(1200);
    res.locked = { note: await text(p, "acct-delete-note"), codeCleared: (await val(p, "acct-delete-code")) === "", codeReadOnly: await p.$eval('[data-testid="acct-delete-code"]', (e) => e.readOnly).catch(() => null), finalDisabled: await dis(p, "acct-delete-final"), token: await p.evaluate(() => localStorage.getItem("shark_token")) };
    await p.type('[data-testid="acct-delete-code"]', "123456"); await sleep(200); res.lockedTypeIgnored = (await val(p, "acct-delete-code")) === "";
    await p.screenshot({ path: `${OUT}/z29-7-locked.png` });
    await p.click('[data-testid="acct-delete-resend"]'); await sleep(1000);
    res.lockedAfterResend = { sms: bodies(log, "POST /api/mobile/auth/sms/request").length, codeReadOnly: await p.$eval('[data-testid="acct-delete-code"]', (e) => e.readOnly).catch(() => null), note: await text(p, "acct-delete-note") };
    await p.type('[data-testid="acct-delete-code"]', "123456"); await sleep(200); res.lockedAfterResend.finalDisabled = await dis(p, "acct-delete-final"); await close(); });
  // ── code_required (server ไม่ได้รับรหัส) ⇒ คงขั้นใส่รหัส + ข้อความ ──
  await step("codeRequired", async () => { const { p, close } = await open("/secretary/settings/account", S21, { "POST /api/mobile/secretary/account/delete": { status: 400, body: { error: "code_required", message: "ต้องยืนยันด้วยรหัส" } } }); await p.waitForSelector('[data-testid="acct-delete"]'); await toCode(p); await p.click('[data-testid="acct-delete-confirm"]'); await sleep(1000); await p.type('[data-testid="acct-delete-code"]', "123456"); await p.click('[data-testid="acct-delete-final"]'); await sleep(1000);
    res.codeRequired = { note: await text(p, "acct-delete-note"), step2: await has(p, "acct-delete-code"), token: await p.evaluate(() => localStorage.getItem("shark_token")) }; await close(); });
  // ── sms ล้ม (503 · 429) ⇒ อยู่ขั้น 1 + ข้อความ ──
  await step("smsFail", async () => { for (const [st, err] of [[503, "sms_unavailable"], [429, "rate_limited"]]) { const { p, close } = await open("/secretary/settings/account", S21, { "POST /api/mobile/auth/sms/request": { status: st, body: { error: err } } }); await p.waitForSelector('[data-testid="acct-delete"]'); await toCode(p); await p.click('[data-testid="acct-delete-confirm"]'); await sleep(1000);
    res[`sms${st}`] = { note: await text(p, "acct-delete-note"), step1: await has(p, "acct-delete-input") }; await close(); } });
  // ── R-Z28/R-Z30 new.tsx: 409 pending ×2 แล้ว 200 ⇒ รหัสเดิม 3 ครั้ง · ไม่โชว์ error · ไปห้อง ──
  await step("newPending", async () => { let n = 0; const t0 = []; const { p, log, close } = await open("/secretary/new", S22, { "POST /api/mobile/secretary/rooms": () => { n++; t0.push(Date.now()); return n <= 2 ? { status: 409, body: { error: "pending", message: "กำลังเปิดห้องงานนี้อยู่ ลองใหม่อีกครั้ง" } } : { body: { roomId: "r1", conversationId: "c1" } }; } });
    await p.waitForSelector('[data-testid="sec-new-input-field"]'); await p.type('[data-testid="sec-new-input-field"]', "สรุปยอดขายวันนี้"); await sleep(200);
    await p.click('[data-testid="sec-new-send"]'); await sleep(800); res.newPendingErrMid = await has(p, "sec-new-error"); await sleep(3500);
    const bs = bodies(log, "POST /api/mobile/secretary/rooms").map((x) => JSON.parse(x)); res.newPending = { posts: bs.length, sameCmid: new Set(bs.map((x) => x.clientMessageId)).size === 1, gapsMs: t0.slice(1).map((t, i) => t - t0[i]), err: await has(p, "sec-new-error"), url: path(p) }; await close(); });
  await step("newPendingExhaust", async () => { const { p, log, close } = await open("/secretary/new", S22, { "POST /api/mobile/secretary/rooms": { status: 409, body: { error: "pending", message: "กำลังเปิดห้องงานนี้อยู่ ลองใหม่อีกครั้ง" } } });
    await p.waitForSelector('[data-testid="sec-new-input-field"]'); await p.type('[data-testid="sec-new-input-field"]', "สรุปยอดขายวันนี้"); await p.click('[data-testid="sec-new-send"]'); await sleep(6500);
    const n1 = bodies(log, "POST /api/mobile/secretary/rooms").length; res.newExhaust = { posts: n1, err: await text(p, "sec-new-error") };
    // กดส่งอีกครั้งด้วยคำสั่งเดิม = รหัสเดิม · แก้คำสั่ง = รหัสใหม่
    await p.click('[data-testid="sec-new-send"]'); await sleep(6500); await p.type('[data-testid="sec-new-input-field"]', " ด่วน"); await p.click('[data-testid="sec-new-send"]'); await sleep(6500);
    const ids = bodies(log, "POST /api/mobile/secretary/rooms").map((x) => JSON.parse(x).clientMessageId); res.newCmid = { total: ids.length, firstTwoRoundsSame: new Set(ids.slice(0, 8)).size === 1, thirdRoundNew: ids[8] !== ids[0], thirdRoundSelfSame: new Set(ids.slice(8)).size === 1 }; await close(); });
  await step("newDouble", async () => { const { p, log, close } = await open("/secretary/new", S22, { "POST /api/mobile/secretary/rooms": { delay: 1500, body: { roomId: "r1" } } });
    await p.waitForSelector('[data-testid="sec-new-input-field"]'); await p.type('[data-testid="sec-new-input-field"]', "สรุปยอดขายวันนี้"); await sleep(200); await p.$eval('[data-testid="sec-new-send"]', (e) => { e.click(); e.click(); e.click(); }); await sleep(2500);
    res.newDouble = { posts: bodies(log, "POST /api/mobile/secretary/rooms").length, url: path(p) }; await close(); });
  // ── room/[id] send: 409 pending แล้ว 200 ⇒ รหัสเดิม · ไม่โชว์ error ──
  await step("roomPending", async () => { let n = 0; const { p, log, close } = await open("/secretary/room/r1", S24, { "POST /api/mobile/secretary/rooms/r1/send": () => (++n === 1 ? { status: 409, body: { error: "pending", message: "ข้อความนี้กำลังส่งอยู่" } } : { body: { ok: true, messageId: "m9", jobId: "j9" } }) });
    await p.waitForSelector('[data-testid="sec-room-input-field"]').catch(() => {}); const inp = (await p.$('[data-testid="sec-room-input-field"]')) ? "sec-room-input-field" : null; res.roomInput = inp;
    if (inp) { await p.type(`[data-testid="${inp}"]`, "ขอรายละเอียดเพิ่ม"); await p.click('[data-testid="sec-room-send"]'); await sleep(3000);
      const bs = bodies(log, "POST /api/mobile/secretary/rooms/r1/send").map((x) => JSON.parse(x)); res.roomPending = { posts: bs.length, sameCmid: new Set(bs.map((x) => x.clientMessageId)).size === 1, sendErr: await p.evaluate(() => document.body.innerText.includes("ข้อความนี้กำลังส่งอยู่")), draftCleared: (await val(p, inp)) === "" }; }
    await close(); });
  // ── customers info: สั่ง Shark — 409 pending แล้ว 200 · กดซ้ำหลังล้ม = รหัสเดิม ──
  await step("infoAsk", async () => { let n = 0; const { p, log, close } = await open("/customers/x1/info", S217, { "POST /api/mobile/secretary/rooms": () => (++n === 1 ? { status: 500, body: { error: "server_error" } } : n === 2 ? { status: 409, body: { error: "pending", message: "กำลังเปิดห้องงานนี้อยู่" } } : { body: { roomId: "r7" } }) });
    await p.waitForSelector('[data-testid="cust-info-ask-shark"]'); await p.click('[data-testid="cust-info-ask-shark"]'); await p.waitForSelector('[data-testid="cust-info-ask-input"]'); await p.type('[data-testid="cust-info-ask-input"]', "สรุปประวัติลูกค้านี้"); await sleep(200);
    await p.click('[data-testid="cust-info-ask-send"]'); await sleep(1000); res.infoFirstErr = await text(p, "cust-info-ask-error");
    await p.click('[data-testid="cust-info-ask-send"]'); await sleep(3000);
    const bs = bodies(log, "POST /api/mobile/secretary/rooms").map((x) => JSON.parse(x)); res.infoAsk = { posts: bs.length, sameCmid: new Set(bs.map((x) => x.clientMessageId)).size === 1, context: bs[0]?.context ?? null, url: path(p) }; await close(); });
} finally {
  writeFileSync(join(OUT, "result.json"), JSON.stringify(res, null, 1) + "\n");
  console.log(JSON.stringify(res, null, 1));
  await b.close().catch(() => {}); srv.close(); rmSync(UDD, { recursive: true, force: true });
}
