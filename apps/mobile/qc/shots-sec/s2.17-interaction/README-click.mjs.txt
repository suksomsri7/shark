// S2.17–S2.19 interaction check (+ round 2 · RESOLUTIONS §U) (QC web export of /root/qc-shark-mobile-sec-c/dist · mocks from fixture s2.17.json · no real server)
// รัน: cp README-click.mjs.txt <scratch>/s217-click.mjs && bash scripts/iso.sh node <scratch>/s217-click.mjs <s2.17.json> <photo.png> <outdir>
import puppeteer from "/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";
import { createServer } from "node:http"; import { readFileSync, existsSync, statSync, mkdirSync, rmSync, writeFileSync } from "node:fs"; import { join, extname } from "node:path";
const DIST = "/root/qc-shark-mobile-sec-c/dist", FX = JSON.parse(readFileSync(process.argv[2], "utf8")), PHOTO = process.argv[3], OUT = process.argv[4];
mkdirSync(OUT, { recursive: true });
const srv = createServer((q, r) => { let f = join(DIST, decodeURIComponent(new URL(q.url, "http://x").pathname)); if (!existsSync(f) || statSync(f).isDirectory()) f = join(DIST, "index.html"); r.writeHead(200, { "content-type": { ".html": "text/html", ".js": "application/javascript", ".ttf": "font/ttf", ".png": "image/png" }[extname(f)] ?? "application/octet-stream" }); r.end(readFileSync(f)); }).listen(4725);
const UDD = `/tmp/chr-s217-${process.pid}`;
const b = await puppeteer.launch({ executablePath: "/usr/bin/chromium-browser", headless: true, args: ["--no-sandbox", `--user-data-dir=${UDD}`] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const res = {};
const clone = (x) => JSON.parse(JSON.stringify(x));
async function open(route, fx, over = {}) {
  const p = await b.newPage(); await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 }); await p.setRequestInterception(true);
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS", "access-control-expose-headers": "Retry-After" };
  const log = [];
  p.on("request", async (q) => { const u = new URL(q.url()); if (u.host === "shark.in.th") { if (q.method() === "OPTIONS") return q.respond({ status: 204, headers: cors, body: "" }); const k = `${q.method()} ${u.pathname}`; const body = q.postData() ?? null; log.push({ k, q: u.search, body, ct: q.headers()["content-type"] ?? null, t: Date.now() }); const o = over[k]; if (o) { const r = typeof o === "function" ? o(body, log) : o; if (r.delay) await sleep(r.delay); return q.respond({ status: r.status ?? 200, headers: { ...cors, ...(r.headers ?? {}) }, contentType: "application/json", body: JSON.stringify(r.body) }); } const bd = fx.endpoints[k]; return q.respond({ status: bd ? 200 : 404, headers: cors, contentType: "application/json", body: JSON.stringify(bd ?? { error: "x" }) }); } q.continue(); });
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
const posts = (log, re) => log.filter((x) => x.k.startsWith("POST ") && re.test(x.k)).map((x) => x.k);
const R = "POST /api/mobile/inbox/conversations/x1/reply";
const type = async (p, id, s) => { await p.click(`[data-testid="${id}"]`); await p.type(`[data-testid="${id}"]`, s); };
try {
  // ── K1 รายการ + แท็บ + ค้นหา ──
  { const { p, log } = await open("/customers", FX); await p.waitForSelector('[data-testid="cust-row"]');
    res.k1Rows = await count(p, "cust-row"); res.k1Unassigned = await count(p, "cust-row-unassigned"); res.k1Counts = await text(p, "cust-counts");
    await p.click('[data-testid="cust-tab-unanswered"]'); await sleep(800); res.k1UnansweredRows = (await count(p, "cust-row")) + (await count(p, "cust-row-unassigned"));
    await p.click('[data-testid="cust-tab-mine"]'); await sleep(800); res.k1MineQuery = log.filter((x) => x.k === "GET /api/mobile/inbox/conversations").map((x) => x.q).pop();
    await p.click('[data-testid="cust-tab-closed"]'); await sleep(800); res.k1ClosedQuery = log.filter((x) => x.k === "GET /api/mobile/inbox/conversations").map((x) => x.q).pop();
    await p.click('[data-testid="cust-tab-all"]'); await type(p, "cust-search", "สม"); await sleep(1300); res.k1SearchQuery = log.filter((x) => x.k === "GET /api/mobile/inbox/conversations").map((x) => x.q).pop();
    await p.close(); }
  // ── K1 → แถวไม่มีคนรับ → K2 รับเรื่อง (assign ตัวเอง) ──
  { const fx = clone(FX); const x2 = fx.endpoints["GET /api/mobile/inbox/conversations"].items.find((x) => x.id === "x2");
    fx.endpoints["GET /api/mobile/inbox/conversations/x2"] = { conversation: x2, messages: [{ id: "n1", direction: "IN", type: "TEXT", body: "สนใจคอร์สชงกาแฟวันเสาร์ค่ะ", senderUserId: null, senderName: null, isInternal: false, deliveryStatus: "SENT", stickerMeta: null, attachments: [], meta: null, createdAt: "2026-11-05T02:40:00.000Z" }], contact: x2.contact, linkedMember: null, helpers: [], nextBefore: null };
    fx.endpoints["POST /api/mobile/inbox/conversations/x2/read"] = { ok: true }; fx.endpoints["POST /api/mobile/inbox/conversations/x2/assign"] = { ok: true };
    const { p, log } = await open("/customers", fx); await p.waitForSelector('[data-testid="cust-row-unassigned"]');
    await p.click('[data-testid="cust-row-unassigned"]'); await p.waitForSelector('[data-testid="cust-room-claim"]'); res.k1OpenUrl = new URL(p.url()).pathname + new URL(p.url()).search;
    res.k2ReadPosts = bodies(log, "POST /api/mobile/inbox/conversations/x2/read");
    await p.screenshot({ path: `${OUT}/k2-unassigned-claim.png` }); await p.click('[data-testid="cust-room-claim"]'); await sleep(1000);
    res.k2ClaimBody = bodies(log, "POST /api/mobile/inbox/conversations/x2/assign"); res.k2ClaimNote = await text(p, "cust-room-note"); await p.close(); }
  // รับเรื่องตัดหน้า (409)
  { const fx = clone(FX); const x2 = fx.endpoints["GET /api/mobile/inbox/conversations"].items.find((x) => x.id === "x2");
    fx.endpoints["GET /api/mobile/inbox/conversations/x2"] = { conversation: x2, messages: [], contact: x2.contact, linkedMember: null, helpers: [], nextBefore: null };
    const { p } = await open("/customers/x2?s=cs1", fx, { "POST /api/mobile/inbox/conversations/x2/assign": { status: 409, body: { error: "conflict", message: "ห้องนี้มีคนรับหรือย้ายไปแล้ว" } } });
    await p.waitForSelector('[data-testid="cust-room-claim"]'); await p.click('[data-testid="cust-room-claim"]'); await sleep(900); res.k2Claim409Note = await text(p, "cust-room-note"); await p.close(); }
  // ── K2 ตอบลูกค้า: clientMessageId · ไม่มี secretary/rooms (3 แชทไม่ปน) ──
  { const { p, log } = await open("/customers/x1?s=cs1", FX); await p.waitForSelector('[data-testid="cust-input-field"]');
    res.k2Bubbles = { in: await count(p, "cust-bubble-in"), out: await count(p, "cust-bubble-out"), ai: await count(p, "cust-bubble-ai"), internal: await count(p, "cust-bubble-internal"), system: await count(p, "cust-bubble-system"), sticker: await count(p, "cust-att-sticker"), image: await count(p, "cust-att-image"), audio: await count(p, "cust-att-audio"), file: await count(p, "cust-att-file"), resend: await count(p, "cust-bubble-resend") };
    res.k2AiLabel = await p.$eval('[data-testid="cust-bubble-ai"]', (e) => e.innerText.split("\n").pop()).catch(() => null);
    res.k2ReadBody = bodies(log, "POST /api/mobile/inbox/conversations/x1/read"); res.k2Suggest = hits(log, "POST /api/mobile/inbox/conversations/x1/ai-suggest");
    await type(p, "cust-input-field", "เครดิต 45 วันได้ค่ะ"); await p.click('[data-testid="cust-send"]'); await sleep(1000);
    res.k2Reply = bodies(log, R); res.k2InputAfter = await val(p, "cust-input-field");
    res.k2SecretaryPosts = posts(log, /secretary\/rooms/); res.k2AllPosts = [...new Set(posts(log, /./))]; await p.close(); }
  // ── K2 429 ⇒ รอ Retry-After แล้วลองใหม่ 1 ครั้ง (รหัสเดิม) ──
  { let n = 0; const { p, log } = await open("/customers/x1?s=cs1", FX, { [R]: () => (++n === 1 ? { status: 429, headers: { "Retry-After": "1" }, body: { error: "rate_limited", message: "ส่งถี่เกินไป รอสักครู่แล้วลองใหม่" } } : { body: { messageId: "m-new" } }) });
    await p.waitForSelector('[data-testid="cust-input-field"]'); await type(p, "cust-input-field", "ทดสอบส่งถี่"); await p.click('[data-testid="cust-send"]'); await sleep(400);
    res.k2RateNote = await text(p, "cust-send-note"); await sleep(1800);
    const rl = log.filter((x) => x.k === R); res.k2RateIds = rl.map((x) => JSON.parse(x.body).clientMessageId); res.k2RateGapMs = rl.length > 1 ? rl[1].t - rl[0].t : null; res.k2RateInputAfter = await val(p, "cust-input-field"); await p.close(); }
  // 429 สองครั้ง ⇒ ลองแค่ 1 ครั้ง แล้วแจ้ง · ส่งซ้ำข้อความเดิม = รหัสเดิม
  { const { p, log } = await open("/customers/x1?s=cs1", FX, { [R]: { status: 429, headers: { "Retry-After": "1" }, body: { error: "rate_limited", message: "ส่งถี่เกินไป รอสักครู่แล้วลองใหม่" } } });
    await p.waitForSelector('[data-testid="cust-input-field"]'); await type(p, "cust-input-field", "ส่งไม่ผ่าน"); await p.click('[data-testid="cust-send"]'); await sleep(2600);
    res.k2Rate2Posts = hits(log, R); res.k2Rate2Note = await text(p, "cust-send-note"); await p.click('[data-testid="cust-send"]'); await sleep(2600);
    const ids = bodies(log, R).map((x) => x.clientMessageId); res.k2RetrySameId = new Set(ids).size === 1 && ids.length === 4; await p.close(); }
  // ── บันทึกภายใน · ตอบเร็ว · การ์ดร่าง · ส่งใหม่ · แนบไฟล์ ──
  { const { p, log } = await open("/customers/x1?s=cs1", FX); await p.waitForSelector('[data-testid="cust-internal-toggle"]');
    await p.click('[data-testid="cust-internal-toggle"]'); res.k2InternalChecked = await p.$eval('[data-testid="cust-internal-toggle"]', (e) => e.getAttribute("aria-checked"));
    res.k2InternalPh = await p.$eval('[data-testid="cust-input-field"]', (e) => e.getAttribute("placeholder")); await type(p, "cust-input-field", "@ก้อง ช่วยดูห้องพักที"); await p.screenshot({ path: `${OUT}/k2-internal-on.png` });
    await p.click('[data-testid="cust-send"]'); await sleep(900); res.k2InternalReply = bodies(log, R).pop();
    await p.click('[data-testid="cust-internal-toggle"]');
    await (await nth(p, "cust-quick", 1)).click(); await sleep(800); res.k2QuickApply = bodies(log, "POST /api/mobile/inbox/quick-replies/q2/apply"); res.k2QuickInput = await val(p, "cust-input-field"); res.k2QuickCount = await count(p, "cust-quick");
    res.k2QuickReplyPostsBeforeSend = hits(log, R);
    await p.click('[data-testid="cust-draft-edit"]'); await sleep(300); res.k2DraftEditInput = await val(p, "cust-input-field"); res.k2DraftCardAfterEdit = await count(p, "cust-draft-card"); await p.close(); }
  { const { p, log } = await open("/customers/x1?s=cs1", FX); await p.waitForSelector('[data-testid="cust-draft-send"]');
    await p.click('[data-testid="cust-draft-send"]'); await sleep(900); res.k2DraftSend = bodies(log, R); res.k2DraftCardAfterSend = await count(p, "cust-draft-card");
    await p.click('[data-testid="cust-bubble-resend"]'); await sleep(900); res.k2Resend = bodies(log, R).slice(1); await p.close(); }
  { const { p, log } = await open("/customers/x1?s=cs1", FX); await p.waitForSelector('[data-testid="cust-attach"]');
    const [ch] = await Promise.all([p.waitForFileChooser({ timeout: 8000 }), p.click('[data-testid="cust-attach"]')]); await ch.accept([PHOTO]); await sleep(1500);
    const up = log.filter((x) => x.k === "POST /api/mobile/inbox/attachments"); res.k2Upload = { posts: up.length, multipart: up.map((x) => /multipart\/form-data/.test(x.ct ?? "")) }; res.k2Attached = await count(p, "cust-attached"); await p.screenshot({ path: `${OUT}/k2-attached.png` });
    await p.click('[data-testid="cust-send"]'); await sleep(900); res.k2AttachReply = bodies(log, R); await p.close(); }
  // ── รูปเต็มจอ ──
  { const { p } = await open("/customers/x1?s=cs1", FX); await p.waitForSelector('[data-testid="cust-att-image"]'); await p.click('[data-testid="cust-att-image"]'); await sleep(400); res.k2Viewer = await count(p, "cust-image-viewer"); await p.screenshot({ path: `${OUT}/k2-image-viewer.png` }); await p.click('[data-testid="cust-image-close"]'); await sleep(300); res.k2ViewerClosed = (await count(p, "cust-image-viewer")) === 0; await p.close(); }
  // ── K3 คนช่วย (จาก K2 ปุ่ม 👥) ──
  { const { p, log } = await open("/customers/x1?s=cs1", FX); await p.waitForSelector('[data-testid="cust-room-helper"]'); await p.click('[data-testid="cust-room-helper"]');
    await p.waitForSelector('[data-testid="cust-info-helpers-sheet-row"]'); res.k3HelperUrl = new URL(p.url()).pathname + new URL(p.url()).search; res.k3HelperChoices = await p.$$eval('[data-testid="cust-info-helpers-sheet-row"]', (es) => es.map((e) => e.innerText.split("\n")[0]));
    await (await nth(p, "cust-info-helpers-sheet-row", 0)).click(); await type(p, "cust-info-helpers-sheet-note", "ช่วยดูเรื่องห้องพัก"); await p.screenshot({ path: `${OUT}/k3-helper-sheet.png` });
    await p.click('[data-testid="cust-info-helpers-sheet-ok"]'); await sleep(900); res.k3HelperBody = bodies(log, "POST /api/mobile/inbox/conversations/x1/helpers"); res.k3HelperNote = await text(p, "cust-info-note"); await p.close(); }
  // ── K3 ส่งต่อ: 409 (ผู้ดูแลเปลี่ยนระหว่างกด) ⇒ ข้อความในชีต + โหลดห้องใหม่ ──
  { const { p, log } = await open("/customers/x1/info?s=cs1", FX, { "POST /api/mobile/inbox/conversations/x1/handoff": { status: 409, body: { error: "conflict", message: "ห้องนี้มีคนรับหรือย้ายไปแล้ว" } } });
    await p.waitForSelector('[data-testid="cust-info-handoff"]'); await p.click('[data-testid="cust-info-handoff"]'); await p.waitForSelector('[data-testid="cust-info-handoff-sheet-row"]');
    res.k3HandoffChoices = await p.$$eval('[data-testid="cust-info-handoff-sheet-row"]', (es) => es.map((e) => e.innerText.split("\n")[0]));
    await (await nth(p, "cust-info-handoff-sheet-row", 0)).click(); res.k3HandoffOkDisabledNoReason = await p.$eval('[data-testid="cust-info-handoff-sheet-ok"]', (e) => e.getAttribute("aria-disabled"));
    await type(p, "cust-info-handoff-sheet-note", "ลูกค้าถามเรื่องห้องพัก"); const g0 = hits(log, "GET /api/mobile/inbox/conversations/x1");
    await p.click('[data-testid="cust-info-handoff-sheet-ok"]'); await sleep(900); res.k3HandoffBody = bodies(log, "POST /api/mobile/inbox/conversations/x1/handoff"); res.k3Handoff409 = await text(p, "cust-info-handoff-sheet-error");
    res.k3HandoffReload = [g0, hits(log, "GET /api/mobile/inbox/conversations/x1")]; await p.screenshot({ path: `${OUT}/k3-handoff-409.png` }); await p.close(); }
  // ── K3 มอบหมาย · สถานะ · ปิดห้อง · แท็ก · ผูกสมาชิก ──
  { const { p, log } = await open("/customers/x1/info?s=cs1", FX); await p.waitForSelector('[data-testid="cust-info-assign"]');
    await p.click('[data-testid="cust-info-assign"]'); await p.waitForSelector('[data-testid="cust-info-assign-sheet-row"]'); await (await nth(p, "cust-info-assign-sheet-row", 1)).click(); await p.click('[data-testid="cust-info-assign-sheet-ok"]'); await sleep(900);
    res.k3AssignBody = bodies(log, "POST /api/mobile/inbox/conversations/x1/assign");
    await p.click('[data-testid="cust-info-status"]'); await p.waitForSelector('[data-testid="cust-info-status-opt"]'); await (await nth(p, "cust-info-status-opt", 1)).click(); await sleep(900);
    await p.click('[data-testid="cust-info-close"]'); await p.waitForSelector('[data-testid="cust-info-close-sheet-ok"]'); res.k3CloseBeforeOk = bodies(log, "POST /api/mobile/inbox/conversations/x1/status").length;
    await p.screenshot({ path: `${OUT}/k3-close-confirm.png` }); await p.click('[data-testid="cust-info-close-sheet-ok"]'); await sleep(900);
    res.k3StatusBodies = bodies(log, "POST /api/mobile/inbox/conversations/x1/status"); res.k3Tags = await text(p, "cust-info-tags"); res.k3Contact = await text(p, "cust-info-contact");
    res.k3TaskBtn = await count(p, "cust-info-task");
    await p.click('[data-testid="cust-info-link"]'); await p.waitForSelector('[data-testid="cust-info-link-search"]'); await type(p, "cust-info-link-search", "สม"); await p.click('[data-testid="cust-info-link-go"]'); await p.waitForSelector('[data-testid="cust-info-link-row"]');
    res.k3LinkSearch = log.filter((x) => x.k === "GET /api/mobile/member/search").map((x) => decodeURIComponent(x.q)); await p.screenshot({ path: `${OUT}/k3-link-sheet.png` });
    await (await nth(p, "cust-info-link-row", 0)).click(); await sleep(900); res.k3LinkBody = bodies(log, "POST /api/mobile/inbox/conversations/x1/contact");
    await p.click('[data-testid="cust-info-unlink"]'); await sleep(900); res.k3UnlinkBody = bodies(log, "POST /api/mobile/inbox/conversations/x1/contact").slice(1); await p.close(); }
  // ── K3 สั่ง Shark เรื่องลูกค้านี้ ⇒ POST secretary/rooms {context} เท่านั้น (ไม่มี …/reply) → ห้องเลขา ──
  { const { p, log } = await open("/customers/x1/info?s=cs1", FX); await p.waitForSelector('[data-testid="cust-info-ask-shark"]'); await p.click('[data-testid="cust-info-ask-shark"]');
    await p.waitForSelector('[data-testid="cust-info-ask-input"]'); await type(p, "cust-info-ask-input", "สรุปประวัติการซื้อของลูกค้าคนนี้"); await p.screenshot({ path: `${OUT}/k3-ask-shark.png` });
    await p.click('[data-testid="cust-info-ask-send"]'); await sleep(1500);
    res.k3AskBody = bodies(log, "POST /api/mobile/secretary/rooms"); res.k3AskUrl = new URL(p.url()).pathname; res.k3AskReplyPosts = hits(log, R); await p.close(); }
  // ── §U-b K2: ก่อนหน้า = cursor ของข้อความเก่าสุด · poll รวมด้วย id (ข้อความเก่าไม่หาย) ──
  { const th = clone(FX.endpoints["GET /api/mobile/inbox/conversations/x1"]); th.nextBefore = "2026-11-05T02:52:00.000Z|m1";
    const old = { id: "m0", direction: "IN", type: "TEXT", body: "ข้อความเก่าเมื่อวาน", senderUserId: null, senderName: null, isInternal: false, deliveryStatus: "SENT", stickerMeta: null, attachments: [], meta: null, createdAt: "2026-11-04T09:00:00.000Z" };
    const { p, log } = await open("/customers/x1?s=cs1", FX, { "GET /api/mobile/inbox/conversations/x1": (b, l) => { const q = l[l.length - 1].q; return q.includes("before=") ? { body: { ...th, messages: [old], nextBefore: null } } : { body: th }; } });
    await p.waitForSelector('[data-testid="cust-room-more"]'); const n0 = (await count(p, "cust-bubble-in"));
    await p.click('[data-testid="cust-room-more"]'); await sleep(900);
    res.u_olderQuery = decodeURIComponent(log.filter((x) => x.k === "GET /api/mobile/inbox/conversations/x1" && x.q.includes("before=")).map((x) => x.q).pop() ?? "");
    const n1 = await count(p, "cust-bubble-in"); await sleep(6000); const n2 = await count(p, "cust-bubble-in");
    res.u_olderMerge = { before: n0, afterOlder: n1, afterPoll: n2, polls: hits(log, "GET /api/mobile/inbox/conversations/x1"), moreBtnAfter: await count(p, "cust-room-more") }; await p.close(); }
  // ── §U-c 429 แล้วสำเร็จ ⇒ ล้างข้อความ · resend ไม่แตะรหัสข้อความที่พิมพ์ค้าง ──
  { let n = 0; const { p, log } = await open("/customers/x1?s=cs1", FX, { [R]: (body) => { n++; const j = JSON.parse(body); if (j.clientMessageId.startsWith("resend:")) return { body: { messageId: "r1" } }; return n === 1 ? { status: 429, headers: { "Retry-After": "1" }, body: { error: "rate_limited", message: "x" } } : n === 3 ? { status: 500, body: { error: "x", message: "ส่งไม่สำเร็จ" } } : { body: { messageId: "ok" } }; } });
    await p.waitForSelector('[data-testid="cust-input-field"]'); await type(p, "cust-input-field", "ทดสอบ"); await p.click('[data-testid="cust-send"]'); await sleep(2200);
    res.u_rateNoteAfterSuccess = await count(p, "cust-send-note");
    await type(p, "cust-input-field", "ข้อความค้าง"); await p.click('[data-testid="cust-send"]'); await sleep(900);
    await p.click('[data-testid="cust-bubble-resend"]'); await sleep(900); await p.click('[data-testid="cust-send"]'); await sleep(900);
    const ids = bodies(log, R).map((x) => x.clientMessageId); res.u_resendIds = ids; res.u_typedIdKeptAcrossResend = ids.length >= 5 && ids[2] === ids[4] && ids[3] === "resend:m7"; await p.close(); }
  // ── §U-c ลิงก์เปิดเฉพาะ https + ไฟล์แนบในบันทึกภายใน ──
  { const fx = clone(FX); const th = fx.endpoints["GET /api/mobile/inbox/conversations/x1"];
    th.messages = [{ id: "z1", direction: "OUT", type: "FILE", body: "แนบใบเสร็จไว้ให้ทีมดู", senderUserId: "u-qc-nam", senderName: "น้ำ", isInternal: true, deliveryStatus: "SENT", stickerMeta: null, attachments: [{ name: "evil.pdf", url: "javascript:alert(1)", kind: "FILE", mimeType: "application/pdf", durationMs: null }], meta: null, createdAt: "2026-11-05T02:50:00.000Z" }, { id: "z2", direction: "IN", type: "FILE", body: null, senderUserId: null, senderName: null, isInternal: false, deliveryStatus: "SENT", stickerMeta: null, attachments: [{ name: "plain.pdf", url: "http://cdn.qc.invalid/plain.pdf", kind: "FILE", mimeType: "application/pdf", durationMs: null }], meta: null, createdAt: "2026-11-05T02:51:00.000Z" }];
    th.conversation.aiDraft = false;
    const { p } = await open("/customers/x1?s=cs1", fx); await p.waitForSelector('[data-testid="cust-bubble-internal"]');
    res.u_internalWithFile = await p.$eval('[data-testid="cust-bubble-internal"]', (e) => e.querySelectorAll('[data-testid="cust-att-file"]').length);
    let opened = 0; b.on("targetcreated", () => opened++); const before = p.url();
    for (const el of await p.$$('[data-testid="cust-att-file"]')) { await el.click(); await sleep(400); }
    res.u_unsafeLinksOpened = { newTargets: opened, sameUrl: p.url() === before }; await p.screenshot({ path: `${OUT}/u-internal-attachment.png` }); await p.close(); }
  // ── §U-a K3: canReply=false ⇒ ไม่มีปุ่มเขียน · STAFF (ตอบได้ ไม่ใช่ผู้ดูแล) ⇒ ไม่มีผูก/ส่งต่อ · มอบหมายไม่ได้ ──
  { const fx = clone(FX); fx.endpoints["GET /api/mobile/inbox/systems"].canReply = false;
    const { p, log } = await open("/customers/x1/info?s=cs1", fx); await p.waitForSelector('[data-testid="cust-info-ask-shark"]'); await sleep(500);
    res.u_viewOnlyK3 = { link: await count(p, "cust-info-link"), unlink: await count(p, "cust-info-unlink"), handoff: await count(p, "cust-info-handoff"), close: await count(p, "cust-info-close"), askShark: await count(p, "cust-info-ask-shark") };
    await p.click('[data-testid="cust-info-assign"]'); await p.click('[data-testid="cust-info-helpers"]'); await p.click('[data-testid="cust-info-status"]'); await sleep(500);
    res.u_viewOnlyK3.sheetsOpened = (await count(p, "cust-info-assign-sheet")) + (await count(p, "cust-info-helpers-sheet")) + (await count(p, "cust-info-status-sheet")); res.u_viewOnlyK3.writes = posts(log, /inbox\/conversations\/x1\/(assign|helpers|status|handoff|contact)/).length;
    await p.screenshot({ path: `${OUT}/u-k3-view-only.png` }); await p.close(); }
  { const fx = clone(FX); fx.endpoints["GET /api/mobile/me"].memberships[0].role = "STAFF";
    const { p } = await open("/customers/x1/info?s=cs1", fx); await p.waitForSelector('[data-testid="cust-info-status"]'); await sleep(500);
    res.u_staffK3 = { link: await count(p, "cust-info-link"), handoff: await count(p, "cust-info-handoff"), close: await count(p, "cust-info-close") };
    await p.click('[data-testid="cust-info-assign"]'); await sleep(400); res.u_staffK3.assignSheet = await count(p, "cust-info-assign-sheet"); await p.close(); }
  { const fx = clone(FX); fx.endpoints["GET /api/mobile/me"].memberships[0].role = "STAFF"; fx.endpoints["GET /api/mobile/inbox/conversations/x1"].conversation.assigneeUserId = "u-qc-owner";
    const { p } = await open("/customers/x1/info?s=cs1", fx); await p.waitForSelector('[data-testid="cust-info-status"]'); await sleep(500);
    res.u_staffAssigneeHandoff = await count(p, "cust-info-handoff"); await p.close(); }
  { const fx = clone(FX); fx.endpoints["GET /api/mobile/me"].memberships[0].role = "STAFF"; const cv = fx.endpoints["GET /api/mobile/inbox/conversations/x1"].conversation; cv.assigneeUserId = null; cv.assigneeName = null;
    const { p, log } = await open("/customers/x1/info?s=cs1", fx); await p.waitForSelector('[data-testid="cust-info-assign"]'); await sleep(500); await p.click('[data-testid="cust-info-assign"]'); await sleep(900);
    res.u_staffClaimSelf = bodies(log, "POST /api/mobile/inbox/conversations/x1/assign"); await p.close(); }
  // ── K4/K5 ตั้งค่า (OWNER): ภาพเดี่ยว · กฎ PUT · เวร · แจ้งเตือน ──
  { const { p, log } = await open("/secretary/settings/customers", FX); await p.waitForSelector('[data-testid="cust-set-channels"]');
    await p.$eval('[data-testid="cust-set-channels"]', (e) => e.scrollIntoView({ block: "start" })); await sleep(400); await p.screenshot({ path: `${OUT}/k4-channels-quick-notify.png` });
    await p.$eval('[data-testid="cust-set-routing"]', (e) => e.scrollIntoView({ block: "start" })); await sleep(400); await p.screenshot({ path: `${OUT}/k5-routing.png` });
    await (await nth(p, "cust-set-rule-toggle", 2)).click(); await (await nth(p, "cust-set-rule-up", 2)).click(); await sleep(200);
    await p.click('[data-testid="cust-set-routing-save"]'); await sleep(900); res.k5RoutingPut = bodies(log, "PUT /api/mobile/inbox/routing");
    await p.$eval('[data-testid="cust-set-shift"]', (e) => e.scrollIntoView({ block: "center" })); await sleep(300); await p.screenshot({ path: `${OUT}/k5-shift.png` });
    await p.click('[data-testid="cust-set-shift-toggle"]'); await sleep(900); res.k5Shift = bodies(log, "POST /api/mobile/inbox/shift");
    await p.click('[data-testid="cust-set-notify-ASSIGNED"]'); await sleep(900); res.k4NotifyPut = bodies(log, "PUT /api/mobile/secretary/notify");
    res.k4NoSecrets = !/accessToken|channelSecret|webhookKey/.test(await p.evaluate(() => document.body.innerText)); await p.close(); }
  // K5 ในบทบาท STAFF ⇒ อ่านอย่างเดียว (ไม่มีปุ่มบันทึก/เพิ่มกฎ)
  { const fx = clone(FX); fx.endpoints["GET /api/mobile/me"].memberships[0].role = "STAFF";
    const { p } = await open("/secretary/settings/customers", fx); await p.waitForSelector('[data-testid="cust-set-routing"]');
    res.k5StaffSave = await count(p, "cust-set-routing-save"); res.k5StaffAdd = await count(p, "cust-set-rule-add"); res.k5StaffIntro = await p.$eval('[data-testid="cust-set-routing"]', (e) => e.innerText.split("\n")[0]); await p.close(); }
  // ── ไม่มีสิทธิ์ (inbox 403) ⇒ จอไม่มีสิทธิ์ + ซ่อนไอคอนลูกค้า ──
  { const deny = { status: 403, body: { error: "forbidden", message: "บัญชีนี้ยังไม่มีสิทธิ์ดูแชทลูกค้า" } };
    const { p } = await open("/customers", FX, { "GET /api/mobile/inbox/systems": deny, "GET /api/mobile/inbox/unread": deny }); await p.waitForSelector('[data-testid="cust-denied"]', { timeout: 8000 }).catch(() => {});
    res.deniedScreen = await count(p, "cust-denied"); res.deniedCustIcon = await count(p, "sec-top-customers"); res.deniedSecIcon = await count(p, "sec-top-secretary"); await p.screenshot({ path: `${OUT}/k1-denied.png` }); await p.close(); }
  { const deny = { status: 403, body: { error: "forbidden", message: "x" } };
    const { p } = await open("/secretary", FX, { "GET /api/mobile/inbox/unread": deny, "GET /api/mobile/secretary/rooms": { body: { items: [] } }, "GET /api/mobile/secretary/suggestions": { body: { items: [], frequent: [] } } }); await sleep(1500);
    res.secZoneCustIconWhenDenied = await count(p, "sec-top-customers"); await p.close(); }
  // ดูได้อย่างเดียว (canReply false) ⇒ ไม่มีช่องพิมพ์/ปุ่มรับเรื่อง
  { const fx = clone(FX); fx.endpoints["GET /api/mobile/inbox/systems"].canReply = false;
    const { p, log } = await open("/customers/x1?s=cs1", fx); await p.waitForSelector('[data-testid="cust-readonly"]', { timeout: 8000 }).catch(() => {});
    res.viewOnly = { readonly: await count(p, "cust-readonly"), input: await count(p, "cust-input"), draft: await count(p, "cust-draft-card"), quickGets: hits(log, "GET /api/mobile/inbox/quick-replies") }; await p.close(); }
} finally { await b.close(); srv.close(); for (const d of [UDD, `/tmp/snap-private-tmp/snap.chromium/tmp/chr-s217-${process.pid}`]) rmSync(d, { recursive: true, force: true }); }
writeFileSync(join(OUT, "result.json"), JSON.stringify(res, null, 1));
console.log(JSON.stringify(res, null, 1));
