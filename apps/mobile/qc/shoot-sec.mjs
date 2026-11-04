// QC render จอ "เลขา AI" ของแอป (ใบ S0.2) — สำเนาของ qc/shoot-crm.mjs · web export + chromium · API ถูก mock ทั้งหมดจาก fixture
// ไม่แตะ prod · ไม่มี token จริง · ไม่ build แอป (ไม่มีคำสั่ง eas/OTA ใด ๆ ในไฟล์นี้)
//
// ตัวแปร:
//   ROUTES      รายการ path คั่นด้วย , (ปริยาย "/secretary") เช่น ROUTES=/secretary,/secretary/_gallery,/login,/sessions
//               ใส่ query ได้ (ROUTES=/otp?phone=0812345678&mode=signup) — ชื่อภาพ/expect/noAuth/tall ใช้ path ไม่รวม query
//   FIXTURE     ไฟล์ JSON (ปริยาย qc/fixtures/secretary/s0.2.json · รูปแบบดู qc/fixtures/secretary/README.md)
//               fixture.endpoints = { "<path>" | "<METHOD> <path>": body } · endpoint ที่ไม่มีใน fixture ⇒ 404 + ลงใน unmocked[]
//               fixture.noAuth    = [path…] จอที่ต้องเปิดแบบยังไม่ login (ปริยาย ["/login"])
//               fixture.expect    = { "<path>": [testID…] } testID ที่ต้องเห็นในจอนั้น (รอ + ตรวจ)
//               fixture.tall      = { "<path>": ความสูง } จอยาว (เช่น gallery) ถ่ายด้วย viewport สูงขึ้น — ความกว้างคง 390
//   QC_PREPARE=1        rsync + patch + `expo export --platform web` ในสำเนา แล้วเสิร์ฟเอง (QC_SKIP_EXPORT=1 = เสิร์ฟ dist เดิม)
//   QC_COPY             สำเนา (ปริยาย /root/qc-shark-mobile-sec — แยกจากสำเนาของ CRM/สมาชิก)
//   QC_NODE_MODULES     node_modules ที่มี react-native-web แล้ว (ปริยาย /root/projects/shark-in-th/apps/mobile/node_modules · expo 57.0.9 ชุดเดียวกัน)
//   QC_PORT             พอร์ตเสิร์ฟ (ปริยาย 4714 · 4700/4711/4712/4713 ถูกใช้โดยเครื่องมืออื่น)
//   QC_BASE             มี dist เสิร์ฟอยู่แล้ว → ถ่ายอย่างเดียว
//   QC_OUT              โฟลเดอร์ผลลัพธ์ (ปริยาย qc/shots-sec ในรีโป)
// อาร์กิวเมนต์: (ไม่มี) = โหมดสว่าง · --dark = โหมดมืด (emulate prefers-color-scheme: dark + ตั้ง theme-store = dark ก่อนโหลด) · --both = ทั้งสองโหมด
//
// ผลลัพธ์: <QC_OUT>/<ชื่อ route>[-dark].png (390×844 @2x) + <QC_OUT>/summary.json
//   summary.json = { generatedAt, base, view, fixture: { path, sha256 }, screens: [{ name, route, dark, ok, fixtureSha256, viewportH, errors[], missing[], overflow, expect[], texts, unmocked[], url, file, generatedAt }] }
//   (รูปเดียวกับ shoot-crm + route/dark) · รันซ้ำ = แทนที่ screen ชื่อเดิม เก็บชื่ออื่นไว้ (สว่าง+มืดอยู่ไฟล์เดียวกันได้)
//
// วิธีรัน (จากรากรีโป · export เป็นงานหนัก → ผ่าน iso.sh):
//   QC_PREPARE=1 bash scripts/iso.sh env QC_PREPARE=1 ROUTES=/secretary node apps/mobile/qc/shoot-sec.mjs --both
// 🔴 ต้องใส่ CORS headers ให้ mock (ไม่งั้น fetch ของ RN web ล้มเงียบ) · ห้าม `pkill -f` ด้วยสตริงในคำสั่งตัวเอง
import puppeteer from "/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";
import { execSync } from "node:child_process";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_MOBILE = process.env.QC_REPO_MOBILE ?? resolve(HERE, "..");
const OUT = resolve(process.env.QC_OUT ?? join(REPO_MOBILE, "qc", "shots-sec"));
const COPY = process.env.QC_COPY ?? "/root/qc-shark-mobile-sec";
const BASE_COPY_MODULES = process.env.QC_NODE_MODULES ?? "/root/projects/shark-in-th/apps/mobile/node_modules";
const PREPARE = process.env.QC_PREPARE === "1";
const SKIP_EXPORT = process.env.QC_SKIP_EXPORT === "1";
const PORT = Number(process.env.QC_PORT ?? 4714);
const ARGS = process.argv.slice(2);
const MODES = ARGS.includes("--both") ? [false, true] : ARGS.includes("--dark") ? [true] : [false];
const ROUTES = String(process.env.ROUTES ?? "/secretary").split(",").map((s) => s.trim()).filter(Boolean);
mkdirSync(OUT, { recursive: true });

// ───────────────────────── fixture ─────────────────────────
const FIXTURE_PATH = resolve(process.env.FIXTURE ?? join(REPO_MOBILE, "qc", "fixtures", "secretary", "s0.2.json"));
if (!existsSync(FIXTURE_PATH)) {
  console.error(`❌ ไม่พบ FIXTURE ${FIXTURE_PATH}`);
  process.exit(2);
}
const FIXTURE_TEXT = readFileSync(FIXTURE_PATH, "utf8");
const FIXTURE_SHA = createHash("sha256").update(FIXTURE_TEXT).digest("hex");
const FX = JSON.parse(FIXTURE_TEXT);
const ENDPOINTS = FX.endpoints ?? {};
const NO_AUTH = new Set(FX.noAuth ?? ["/login"]);
const EXPECT = FX.expect ?? {};
const TALL = FX.tall ?? {};

/** mock = ค้น "<METHOD> <path>" ก่อน แล้วค่อย "<path>" · ไม่เจอ = undefined (⇒ 404 + unmocked) */
function mock(method, path) {
  const k1 = `${method} ${path}`;
  if (Object.prototype.hasOwnProperty.call(ENDPOINTS, k1)) return ENDPOINTS[k1];
  if (Object.prototype.hasOwnProperty.call(ENDPOINTS, path)) return ENDPOINTS[path];
  return undefined;
}

// ───────────────────────── (1–3) เตรียมสำเนา + web export ─────────────────────────
const SESSION_WEB = `// QC ONLY PATCH (ไม่ commit · shoot-sec.mjs เขียนให้): เว็บ export ไม่มี SecureStore → ใช้ localStorage
const KEY_TOKEN = "shark_token";
const KEY_TENANT = "shark_tenant";
const KEY_BRAND = "shark_brand";
const get = async (k: string) => (typeof localStorage === "undefined" ? null : localStorage.getItem(k));
const set = async (k: string, v: string) => { if (typeof localStorage !== "undefined") localStorage.setItem(k, v); };
const del = async (k: string) => { if (typeof localStorage !== "undefined") localStorage.removeItem(k); };
export const getToken = () => get(KEY_TOKEN);
export const setToken = (t: string) => set(KEY_TOKEN, t);
export const getTenantId = () => get(KEY_TENANT);
export const setTenantId = (id: string) => set(KEY_TENANT, id);
export const getCachedBrand = () => get(KEY_BRAND);
export const setCachedBrand = (json: string) => set(KEY_BRAND, json);
export async function clearSession(): Promise<void> { await del(KEY_TOKEN); await del(KEY_TENANT); await del(KEY_BRAND); }
`;

function prepare() {
  // EXPO_PUBLIC_QC=1 ⇒ จอ dev-only (/secretary/_gallery) เปิดได้ใน export ของสำเนา QC เท่านั้น
  const sh = (cmd, cwd) => execSync(cmd, { cwd, stdio: "inherit", env: { ...process.env, CI: "1", EXPO_PUBLIC_QC: "1" } });
  mkdirSync(COPY, { recursive: true });
  sh(`rsync -a --delete --exclude node_modules --exclude dist --exclude .expo --exclude 'credentials*' --exclude 'qc/shots*' "${REPO_MOBILE}/" "${COPY}/"`);
  if (!existsSync(join(COPY, "node_modules"))) symlinkSync(BASE_COPY_MODULES, join(COPY, "node_modules"), "dir");
  if (!existsSync(join(COPY, "node_modules", "react-native-web"))) {
    throw new Error(`node_modules ของสำเนา ${COPY} ยังไม่มี react-native-web — ทำขั้น 3 ของ qc/README.md ก่อน`);
  }
  writeFileSync(join(COPY, "src/lib/session.ts"), SESSION_WEB);
  const loginPath = join(COPY, "app/login.tsx");
  const login = readFileSync(loginPath, "utf8");
  if (!login.includes("QC ONLY PATCH")) {
    const patched = login.replace(/GoogleSignin\.configure\(\{[\s\S]*?\}\);/, (m) => `// QC ONLY PATCH: web export ไม่มี native module ของ google-signin\ntry {\n  ${m}\n} catch {\n  /* เว็บ QC */\n}`);
    writeFileSync(loginPath, patched);
  }
  sh("npx expo export --platform web --output-dir dist --clear", COPY);
}

const MIME = { ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".ttf": "font/ttf", ".otf": "font/otf", ".woff": "font/woff", ".woff2": "font/woff2", ".ico": "image/x-icon", ".map": "application/json" };

function serveDist(dir, port) {
  return new Promise((ok) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://x");
      let file = join(dir, decodeURIComponent(url.pathname));
      if (!file.startsWith(dir) || !existsSync(file) || statSync(file).isDirectory()) file = join(dir, "index.html"); // SPA fallback
      res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
      res.end(readFileSync(file));
    });
    server.listen(port, "127.0.0.1", () => ok(server));
  });
}

let server = null;
if (PREPARE) {
  if (!SKIP_EXPORT) prepare();
  server = await serveDist(join(COPY, "dist"), PORT);
}
const BASE = process.env.QC_BASE ?? `http://127.0.0.1:${PORT}`;

/** "/secretary/_gallery" → "secretary-_gallery" · "/" → "index" */
const routeName = (r) => r.replace(/^\/+|\/+$/g, "").replace(/[^A-Za-z0-9_]+/g, "-") || "index";

const VIEW = { tag: "iphone", w: 390, h: 844, scale: 2 };
// 🔴 โปรไฟล์ chromium ต้องถูกลบหลังปิด (snap chromium เห็น /tmp ของตัวเอง)
const UDD = `/tmp/chr-sec-app-${process.pid}`;
const browser = await puppeteer.launch({ executablePath: "/usr/bin/chromium-browser", headless: true, args: ["--no-sandbox", "--disable-gpu", "--font-render-hinting=none", "--hide-scrollbars", `--user-data-dir=${UDD}`] });
const results = [];
try {
  for (const dark of MODES) {
    for (const spec of ROUTES) {
      // S2.12: route มี query ได้ (/otp?phone=…&mode=signup) — ชื่อภาพ/expect/noAuth/tall ใช้ path ไม่รวม query · goto ใช้ทั้งก้อน
      const route = spec.split("?")[0];
      const name = routeName(route) + (dark ? "-dark" : "");
      const expect = EXPECT[route] ?? [];
      const page = await browser.newPage();
      await page.setViewport({ width: VIEW.w, height: Number(TALL[route] ?? VIEW.h), deviceScaleFactor: VIEW.scale });
      await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: dark ? "dark" : "light" }]);
      await page.setRequestInterception(true);
      const unmocked = [];
      page.on("request", (req) => {
        const u = new URL(req.url());
        if (u.host === "shark.in.th") {
          const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS" };
          if (req.method() === "OPTIONS") return req.respond({ status: 204, headers: cors, body: "" });
          const body = mock(req.method(), u.pathname);
          if (body !== undefined) return req.respond({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify(body) });
          unmocked.push(`${req.method()} ${u.pathname}`);
          return req.respond({ status: 404, headers: cors, contentType: "application/json", body: '{"error":"not_found"}' });
        }
        req.continue();
      });
      await page.evaluateOnNewDocument(
        (auth, mode) => {
          localStorage.clear();
          // theme-store (src/lib/theme-store.ts) อ่านคีย์นี้ก่อนวาด
          localStorage.setItem("shark_theme", mode);
          if (auth) {
            localStorage.setItem("shark_token", "qc-mock");
            localStorage.setItem("shark_tenant", "t1");
          }
        },
        !NO_AUTH.has(route),
        dark ? "dark" : "light",
      );
      const errors = [];
      page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 160)));
      await page.goto(BASE + spec, { waitUntil: "networkidle0", timeout: 60000 }).catch((e) => errors.push("goto " + String(e.message).slice(0, 100)));
      for (const id of expect) await page.waitForSelector(`[data-testid="${id}"]`, { timeout: 20000 }).catch((e) => errors.push("wait " + String(e.message).slice(0, 120)));
      await page.evaluate(() => document.fonts.ready).catch(() => {});
      await new Promise((r) => setTimeout(r, 1200));
      const missing = [];
      for (const id of expect) if (!(await page.$(`[data-testid="${id}"]`))) missing.push(id);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      const file = join(OUT, `${name}.png`);
      await page.screenshot({ path: file });
      const texts = String(await page.evaluate(() => document.body.innerText).catch(() => "")).slice(0, 6000);
      const ok = errors.length === 0 && missing.length === 0 && !overflow;
      results.push({ name, route, dark, ok, fixtureSha256: FIXTURE_SHA, viewportH: Number(TALL[route] ?? VIEW.h), errors, missing, overflow, expect, texts, unmocked, url: page.url().replace(BASE, ""), file, generatedAt: new Date().toISOString() });
      await page.close();
    }
  }
} finally {
  await browser.close();
  if (server) server.close();
  for (const d of [UDD, `/tmp/snap-private-tmp/snap.chromium/tmp/chr-sec-app-${process.pid}`]) rmSync(d, { recursive: true, force: true });
}

// รวมกับ summary เดิม: แทนที่ชื่อที่ถ่ายรอบนี้ · ชื่ออื่นคงไว้
const SUM = join(OUT, "summary.json");
let prev = [];
try {
  prev = existsSync(SUM) ? (JSON.parse(readFileSync(SUM, "utf8")).screens ?? []) : [];
} catch {
  prev = [];
}
const names = new Set(results.map((r) => r.name));
const screens = [...prev.filter((s) => !names.has(s.name)), ...results];
writeFileSync(SUM, JSON.stringify({ generatedAt: new Date().toISOString(), base: BASE, view: VIEW, fixture: { path: FIXTURE_PATH, sha256: FIXTURE_SHA }, screens }, null, 1));
console.log(JSON.stringify(results.map((r) => ({ name: r.name, ok: r.ok, errors: r.errors, missing: r.missing, overflow: r.overflow, unmocked: r.unmocked })), null, 1));
process.exit(results.every((r) => r.ok) ? 0 : 1);
