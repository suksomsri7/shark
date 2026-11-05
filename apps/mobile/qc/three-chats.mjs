// QC (ใบ S2.20) — ข้อสอบ "3 แชทไม่ปน": พิมพ์ในห้องลูกค้า ≠ สั่งเลขา ≠ แชท AI ของ 1.0 · puppeteer + web export เดียวกับ qc/shoot-sec.mjs
// ไม่แตะ prod · API ถูก mock ทั้งหมดจาก fixture (ปริยาย qc/fixtures/secretary/s2.20.json) · ไม่ build แอป (ไม่มี eas/OTA)
//
//   (1) /customers/x1        พิมพ์ในช่อง cust-input แล้วกด cust-send       ⇒ ส่งได้ทางเดียว: POST /api/mobile/inbox/conversations/x1/reply
//   (2) /secretary/room/r1   พิมพ์ในช่อง sec-room-input แล้วกด sec-room-send ⇒ ส่งได้ทางเดียว: POST /api/mobile/secretary/rooms/r1/send
//   (3) /chat/c1 (จอ 1.0)    พิมพ์ในช่อง "พิมพ์ข้อความ…" แล้วกดปุ่มส่ง      ⇒ ส่งได้ทางเดียว: POST /api/mobile/chat/send (เส้นเดิม)
// ทุกข้อ: ข้อความที่พิมพ์ (ไม่ซ้ำกันต่อข้อ) ต้องอยู่ใน body ของ request ที่คาดเท่านั้น · ไม่มี request "ส่งข้อความ" ไปเส้นของอีก 2 แชท
//   (เส้นส่ง = …/inbox/conversations/<id>/reply · …/secretary/rooms(/<id>/send)? · …/mobile/chat/send) · request อื่นของจอ (อ่านแล้ว · ร่างคำตอบ · badge) ไม่นับเป็นการส่ง
//
// ตัวแปร: QC_PREPARE=1 (rsync + expo export ในสำเนา เหมือน shoot-sec · QC_SKIP_EXPORT=1 = เสิร์ฟ dist เดิม) · QC_COPY · QC_NODE_MODULES · QC_PORT (ปริยาย 4716) · QC_BASE · FIXTURE · QC_OUT
// ผล: <QC_OUT>/three-chats.json = { ok, generatedAt, fixture:{path,sha256}, chats:[{ name, route, typed, expected, sends[], leaks[], ok, why }] } + ภาพ three-chats-<name>.png
// รัน (จากรากรีโป · export หนัก → iso.sh):
//   bash scripts/iso.sh env QC_PREPARE=1 QC_SKIP_EXPORT=1 QC_COPY=/root/qc-shark-mobile-sec-d node apps/mobile/qc/three-chats.mjs
import puppeteer from "/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";
import { execSync } from "node:child_process";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_MOBILE = resolve(HERE, "..");
const OUT = resolve(process.env.QC_OUT ?? join(REPO_MOBILE, "qc", "shots-sec"));
const COPY = process.env.QC_COPY ?? "/root/qc-shark-mobile-sec";
const PORT = Number(process.env.QC_PORT ?? 4716);
mkdirSync(OUT, { recursive: true });

const FIXTURE_PATH = resolve(process.env.FIXTURE ?? join(REPO_MOBILE, "qc", "fixtures", "secretary", "s2.20.json"));
const FIXTURE_TEXT = readFileSync(FIXTURE_PATH, "utf8");
const FIXTURE_SHA = createHash("sha256").update(FIXTURE_TEXT).digest("hex");
const FX = JSON.parse(FIXTURE_TEXT);
const ENDPOINTS = FX.endpoints ?? {};
function mock(method, path) {
  for (const k of [`${method} ${path}`, path]) if (Object.prototype.hasOwnProperty.call(ENDPOINTS, k)) return ENDPOINTS[k];
  return undefined;
}

// เตรียมสำเนา + export: ใช้ขั้นเดียวกับ shoot-sec (เรียกสคริปต์นั้นด้วย ROUTES ว่างไม่ได้ — จึงทำเองแบบย่อ: ต้องมี dist แล้ว หรือ QC_PREPARE=1 + ไม่ข้าม export)
if (process.env.QC_PREPARE === "1" && process.env.QC_SKIP_EXPORT !== "1") {
  execSync(`node ${JSON.stringify(join(HERE, "shoot-sec.mjs"))}`, { stdio: "inherit", env: { ...process.env, ROUTES: "/secretary", FIXTURE: FIXTURE_PATH, QC_OUT: join(OUT, "three-chats-prepare") } });
}
const DIST = join(COPY, "dist");
const MIME = { ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".ttf": "font/ttf", ".otf": "font/otf", ".woff": "font/woff", ".woff2": "font/woff2", ".ico": "image/x-icon", ".map": "application/json" };
let server = null;
if (!process.env.QC_BASE) {
  if (!existsSync(join(DIST, "index.html"))) {
    console.error(`❌ ไม่มี ${DIST}/index.html — รัน shoot-sec.mjs ด้วย QC_PREPARE=1 QC_COPY=${COPY} ก่อน`);
    process.exit(2);
  }
  server = await new Promise((ok) => {
    const s = createServer((req, res) => {
      const u = new URL(req.url ?? "/", "http://x");
      let file = join(DIST, decodeURIComponent(u.pathname));
      if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) file = join(DIST, "index.html");
      res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
      res.end(readFileSync(file));
    });
    s.listen(PORT, "127.0.0.1", () => ok(s));
  });
}
const BASE = process.env.QC_BASE ?? `http://127.0.0.1:${PORT}`;

// เส้น "ส่งข้อความ" ของ 3 แชท
const SEND_RE = [
  { chat: "customer", re: /^\/api\/mobile\/inbox\/conversations\/[^/]+\/reply$/ },
  { chat: "secretary", re: /^\/api\/mobile\/secretary\/rooms(\/[^/]+\/send)?$/ },
  { chat: "ai10", re: /^\/api\/mobile\/chat\/send$/ },
];
const sendChatOf = (path) => SEND_RE.find((x) => x.re.test(path))?.chat ?? null;

const CHATS = [
  { name: "customer", route: "/customers/x1", field: '[data-testid="cust-input-field"]', send: '[data-testid="cust-send"]', typed: "QC3C-ลูกค้า-เครดิต45วัน", expected: "POST /api/mobile/inbox/conversations/x1/reply" },
  { name: "secretary", route: "/secretary/room/r1", field: '[data-testid="sec-room-input-field"]', send: '[data-testid="sec-room-send"]', typed: "QC3C-เลขา-สรุปยอดขาย", expected: "POST /api/mobile/secretary/rooms/r1/send" },
  // จอ 1.0 ไม่มี testID (ห้ามแตะจอ 1.0) — ช่องพิมพ์หาจาก placeholder เดิม · ปุ่มส่ง = ลูกตัวสุดท้ายของแถบพิมพ์
  { name: "ai10", route: "/chat/c1", field: 'textarea[placeholder="พิมพ์ข้อความ…"]', send: null, typed: "QC3C-แชท10-ยอดวันนี้", expected: "POST /api/mobile/chat/send" },
];

const UDD = `/tmp/chr-sec-3c-${process.pid}`;
const browser = await puppeteer.launch({ executablePath: "/usr/bin/chromium-browser", headless: true, args: ["--no-sandbox", "--disable-gpu", "--font-render-hinting=none", "--hide-scrollbars", `--user-data-dir=${UDD}`] });
const results = [];
try {
  for (const ch of CHATS) {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
    await page.setRequestInterception(true);
    const reqs = [];
    const unmocked = [];
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 160)));
    page.on("request", (req) => {
      const u = new URL(req.url());
      if (u.host !== "shark.in.th") return req.continue();
      const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS" };
      if (req.method() === "OPTIONS") return req.respond({ status: 204, headers: cors, body: "" });
      reqs.push({ method: req.method(), path: u.pathname, body: req.postData() ?? "" });
      // แชท 1.0 = SSE
      if (req.method() === "POST" && u.pathname === "/api/mobile/chat/send") {
        const done = { type: "done", result: { ok: true, conversationId: "c1", reply: "รับทราบครับ" } };
        return req.respond({ status: 200, headers: { ...cors, "content-type": "text/event-stream" }, body: `data: ${JSON.stringify({ type: "status", label: "…" })}\n\ndata: ${JSON.stringify(done)}\n\n` });
      }
      const body = mock(req.method(), u.pathname);
      if (body !== undefined) return req.respond({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify(body) });
      unmocked.push(`${req.method()} ${u.pathname}`);
      return req.respond({ status: 404, headers: cors, contentType: "application/json", body: '{"error":"not_found"}' });
    });
    await page.evaluateOnNewDocument(() => {
      localStorage.clear();
      localStorage.setItem("shark_theme", "light");
      localStorage.setItem("shark_token", "qc-mock");
      localStorage.setItem("shark_tenant", "t1");
    });
    await page.goto(BASE + ch.route, { waitUntil: "networkidle0", timeout: 60000 }).catch((e) => errors.push("goto " + String(e.message).slice(0, 100)));
    let why = "";
    try {
      await page.waitForSelector(ch.field, { timeout: 20000 });
      await new Promise((r) => setTimeout(r, 800));
      const before = reqs.length;
      await page.click(ch.field);
      await page.type(ch.field, ch.typed, { delay: 5 });
      await new Promise((r) => setTimeout(r, 300));
      if (ch.send) await page.click(ch.send);
      else {
        const box = await page.evaluate((sel) => {
          const f = document.querySelector(sel);
          const btn = f?.parentElement?.lastElementChild;
          const r = btn?.getBoundingClientRect();
          return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
        }, ch.field);
        if (!box) throw new Error("ไม่พบปุ่มส่งของจอ 1.0");
        await page.mouse.click(box.x, box.y);
      }
      await new Promise((r) => setTimeout(r, 2000));
      ch._after = reqs.slice(before);
    } catch (e) {
      why = String(e.message ?? e).slice(0, 160);
      ch._after = [];
    }
    await page.screenshot({ path: join(OUT, `three-chats-${ch.name}.png`) });
    await page.close();

    const all = reqs.filter((r) => sendChatOf(r.path) && r.method !== "GET");
    const sends = all.map((r) => ({ method: r.method, path: r.path, chat: sendChatOf(r.path), hasTyped: r.body.includes(ch.typed) }));
    const carriers = reqs.filter((r) => r.body.includes(ch.typed)).map((r) => `${r.method} ${r.path}`);
    const leaks = [
      ...sends.filter((s) => s.chat !== ch.name).map((s) => `ส่งผิดแชท: ${s.method} ${s.path}`),
      ...carriers.filter((x) => x !== ch.expected).map((x) => `ข้อความไปเส้นอื่น: ${x}`),
    ];
    const hit = sends.filter((s) => `${s.method} ${s.path}` === ch.expected && s.hasTyped).length;
    const ok = !why && errors.length === 0 && hit === 1 && leaks.length === 0;
    if (!why && !ok) why = hit !== 1 ? `เส้นที่คาดถูกยิง ${hit} ครั้ง (ต้อง 1)` : leaks.length ? leaks.join(" · ") : errors.join(" · ");
    results.push({ name: ch.name, route: ch.route, typed: ch.typed, expected: ch.expected, sends, carriers, leaks, unmocked, errors, ok, why, shot: `three-chats-${ch.name}.png` });
  }
} finally {
  await browser.close();
  if (server) server.close();
  for (const d of [UDD, `/tmp/snap-private-tmp/snap.chromium/tmp/chr-sec-3c-${process.pid}`]) rmSync(d, { recursive: true, force: true });
}
const ok = results.length === CHATS.length && results.every((r) => r.ok);
const summary = { ok, generatedAt: new Date().toISOString(), base: BASE, fixture: { path: FIXTURE_PATH.replace(REPO_MOBILE + "/", ""), sha256: FIXTURE_SHA }, chats: results };
writeFileSync(join(OUT, "three-chats.json"), JSON.stringify(summary, null, 1));
console.log(JSON.stringify(results.map((r) => ({ name: r.name, ok: r.ok, why: r.why, sends: r.sends, leaks: r.leaks, unmocked: r.unmocked })), null, 1));
console.log("JSON_SUMMARY " + JSON.stringify({ total: results.length, passed: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).map((r) => r.name) }));
process.exit(ok ? 0 : 1);
