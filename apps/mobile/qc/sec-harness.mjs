// QC (ใบ S2.14) — ชุดเครื่องมือร่วมของ click-sec.mjs / states-sec.mjs: เสิร์ฟ dist ของสำเนา QC + chromium + mock API จาก fixture
// รูปแบบ fixture เดียวกับ qc/shoot-sec.mjs ({ endpoints: { "<METHOD> <path>" | "<path>": body }, noAuth, locale }) + ส่วนขยาย (เฉพาะเครื่องมือนี้):
//   body = { "__status": 500, "__body": {...}, "__delayMs": 30000 }  ⇒ ตอบด้วยสถานะ/หน่วงเวลาที่กำหนด (ใช้กับ fixture สถานะ loading/error)
//   body = { "__afterReq": "<METHOD> <path>", "__then": <body>, "__body": <ก่อนหน้านั้น> } ⇒ ตอบ __then เมื่อ request นั้นเกิดแล้วในหน้านี้ (เช่น me ล้มหลังผูกเบอร์)
// ไม่แตะ prod · ไม่มี token จริง · ไม่ build แอป (ไม่มี eas/OTA)
import puppeteer from "/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";
import { createServer } from "node:http";
import { existsSync, readFileSync, rmSync, statSync } from "node:fs";
import { extname, join } from "node:path";

const MIME = { ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".ttf": "font/ttf", ".otf": "font/otf", ".woff": "font/woff", ".woff2": "font/woff2", ".ico": "image/x-icon", ".map": "application/json" };

export function serveDist(dir, port) {
  if (!existsSync(join(dir, "index.html"))) throw new Error(`ไม่มี ${dir}/index.html — รัน shoot-sec.mjs ด้วย QC_PREPARE=1 ก่อน`);
  return new Promise((ok) => {
    const s = createServer((req, res) => {
      const u = new URL(req.url ?? "/", "http://x");
      let file = join(dir, decodeURIComponent(u.pathname));
      if (!file.startsWith(dir) || !existsSync(file) || statSync(file).isDirectory()) file = join(dir, "index.html");
      res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
      res.end(readFileSync(file));
    });
    s.listen(port, "127.0.0.1", () => ok(s));
  });
}

export async function launch(tag) {
  const udd = `/tmp/chr-sec-${tag}-${process.pid}`;
  const browser = await puppeteer.launch({ executablePath: "/usr/bin/chromium-browser", headless: true, args: ["--no-sandbox", "--disable-gpu", "--font-render-hinting=none", "--hide-scrollbars", `--user-data-dir=${udd}`] });
  const close = async () => {
    await browser.close().catch(() => {});
    for (const d of [udd, `/tmp/snap-private-tmp/snap.chromium/tmp/chr-sec-${tag}-${process.pid}`]) rmSync(d, { recursive: true, force: true });
  };
  return { browser, close };
}

const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS", "access-control-expose-headers": "*" };
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

/** เปิดหน้าใหม่ + mock · log = { reqs[{method,path,body,t}], unmocked[], errors[], dialogs[], external[] } */
export async function openPage(browser, { base, route, fx, dark = false, w = 390, h = 844, scale = 1 }) {
  const EP = fx.endpoints ?? {};
  const noAuth = new Set(fx.noAuth ?? ["/login"]);
  const path0 = route.split("?")[0];
  // context แยกต่อหน้า: localStorage ไม่ปนกัน (หน้าหนึ่งกด "ออกจากระบบ" แล้วหน้าที่รันพร้อมกันไม่หลุดไป /login)
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  const close0 = page.close.bind(page);
  page.close = async (o) => {
    await close0(o).catch(() => {});
    await ctx.close().catch(() => {});
  };
  await page.setViewport({ width: w, height: h, deviceScaleFactor: scale });
  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: dark ? "dark" : "light" }]);
  await page.setRequestInterception(true);
  const log = { reqs: [], unmocked: [], errors: [], dialogs: [], external: [] };
  page.on("request", (req) => {
    let u;
    try {
      u = new URL(req.url());
    } catch {
      return req.continue();
    }
    if (u.host === "shark.in.th") {
      if (req.method() === "OPTIONS") return req.respond({ status: 204, headers: CORS, body: "" });
      log.reqs.push({ method: req.method(), path: u.pathname, search: u.search, body: req.postData() ?? null, t: Date.now() });
      const k1 = `${req.method()} ${u.pathname}`;
      const kq = `${k1}${u.search}`; // คีย์ที่ระบุ query ตรงตัว (เช่น rooms?scope=tenant&take=50) ชนะคีย์ไม่มี query
      let body = u.search && has(EP, kq) ? EP[kq] : has(EP, k1) ? EP[k1] : has(EP, u.pathname) ? EP[u.pathname] : undefined;
      if (body && typeof body === "object" && has(body, "__afterReq")) body = log.reqs.slice(0, -1).some((q) => `${q.method} ${q.path}` === body.__afterReq) ? body.__then : body.__body;
      if (body === undefined) {
        log.unmocked.push(k1);
        return req.respond({ status: 404, headers: CORS, contentType: "application/json", body: '{"error":"not_found"}' });
      }
      const meta = body && typeof body === "object" && !Array.isArray(body) && (has(body, "__status") || has(body, "__delayMs")) ? body : null;
      const send = () =>
        req
          .respond({ status: meta?.__status ?? 200, headers: CORS, contentType: "application/json", body: JSON.stringify(meta ? (meta.__body ?? (meta.__status && meta.__status >= 400 ? { error: "server_error", message: "QC" } : {})) : body) })
          .catch(() => {});
      if (meta?.__delayMs) {
        setTimeout(send, meta.__delayMs);
        return;
      }
      return send();
    }
    if (u.hostname === "127.0.0.1" || u.hostname === "localhost" || u.protocol === "data:" || u.protocol === "blob:" || /fonts\.(googleapis|gstatic)\.com$/.test(u.host)) return req.continue();
    // โฮสต์ภายนอก (ลิงก์เปิดเว็บ · รูป CDN ปลอม) = ไม่ออกเน็ต
    log.external.push(`${req.method()} ${u.href.slice(0, 120)}`);
    return req.respond({ status: 204, headers: CORS, body: "" });
  });
  page.on("pageerror", (e) => log.errors.push(String(e.message).slice(0, 160)));
  page.on("dialog", (d) => {
    log.dialogs.push(d.message().slice(0, 80));
    d.dismiss().catch(() => {});
  });
  await page.evaluateOnNewDocument(
    (auth, mode) => {
      localStorage.clear();
      localStorage.setItem("shark_theme", mode);
      if (auth) {
        localStorage.setItem("shark_token", "qc-mock");
        localStorage.setItem("shark_tenant", "t1");
      }
      // window.open (Linking.openURL บนเว็บ) ⇒ จดไว้ ไม่เปิดแท็บจริง
      window.__opened = [];
      window.open = (u) => {
        window.__opened.push(String(u));
        return null;
      };
    },
    !noAuth.has(path0),
    dark ? "dark" : "light",
  );
  if (fx.locale) await page.evaluateOnNewDocument((l) => Object.defineProperty(navigator, "language", { get: () => l }), fx.locale);
  return { page, log };
}

/** รอหน้านิ่ง: networkidle (เพดาน) + ฟอนต์ + เวลาวาด */
export async function goto(page, base, route, { idleMs = 15000, waitMs = 700 } = {}) {
  await page.goto(base + route, { waitUntil: "networkidle0", timeout: idleMs }).catch(() => {});
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  await new Promise((r) => setTimeout(r, waitMs));
}
