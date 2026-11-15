// QC render + ภาพคู่ MOCKUP|RENDER ของจอปฏิทินเลขา (CAL2.x) — สำเนาแนวทางของ qc/shoot-sec.mjs (web export + chromium · API mock ทั้งหมด)
// ต่างจาก shoot-sec: (1) ปักนาฬิกาของหน้า (QC_NOW · ปริยาย 2026-11-16T08:05+07:00 = วันในภาพแบบ) (2) ทุกจอมีขั้นแตะ testID ก่อนถ่าย
//   (3) ตัดจอแบบจากไฟล์ HTML ของภาพที่อนุมัติ (/root/mockups/secretary-calendar/cal-[dark-]N.html · .phone ลำดับที่ k) ด้วย chromium เดียวกัน
//   แล้วต่อคู่ ซ้าย MOCKUP | ขวา RENDER ด้วย ImageMagick → <QC_OUT>/pair-<name>[-dark].png
// เส้น /api/mobile/secretary/calendar/* ไม่ mock โดยเจตนา ⇒ 404 ⇒ แอปใช้ fixture ในตัว (src/api/calendar.fixtures.ts · export QC ตั้ง EXPO_PUBLIC_QC=1)
// ไม่แตะ prod · ไม่มี token จริง · ไม่ build แอป
//
// ใช้ (จากรากรีโป · export หนัก → iso.sh):
//   QC_PREPARE=1 bash scripts/iso.sh env QC_PREPARE=1 node apps/mobile/qc/shoot-cal.mjs --both            (export ใหม่ + ถ่ายทุกจอ)
//   QC_PREPARE=1 QC_SKIP_EXPORT=1 SHOTS=day,month node apps/mobile/qc/shoot-cal.mjs --both                (ใช้ dist เดิม)
// ตัวแปร: SHOTS (ชื่อคั่น ,) · QC_COPY (ปริยาย /root/qc-shark-mobile-cal) · QC_PORT (4731) · QC_OUT (ปริยาย /root/qc/cal) · QC_NOW · FIXTURE (qc/fixtures/calendar/cal.json)
import puppeteer from "/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";
import { execSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_MOBILE = resolve(HERE, "..");
const OUT = resolve(process.env.QC_OUT ?? "/root/qc/cal");
const COPY = process.env.QC_COPY ?? "/root/qc-shark-mobile-cal";
const BASE_MODULES = process.env.QC_NODE_MODULES ?? "/root/projects/shark-in-th/apps/mobile/node_modules";
const PORT = Number(process.env.QC_PORT ?? 4731);
const NOW = process.env.QC_NOW ?? "2026-11-16T08:05:00+07:00";
const MOCK_DIR = "/root/mockups/secretary-calendar";
const ARGS = process.argv.slice(2);
const MODES = ARGS.includes("--both") ? [false, true] : ARGS.includes("--dark") ? [true] : [false];
const FX = JSON.parse(readFileSync(resolve(process.env.FIXTURE ?? join(HERE, "fixtures", "calendar", "cal.json")), "utf8"));
const ENDPOINTS = FX.endpoints ?? {};
mkdirSync(OUT, { recursive: true });

// ───────── จอที่ถ่าย: route + ขั้นแตะ + จอแบบ (sheet = cal-N.html · phone = ลำดับ .phone 1..) ─────────
// steps: { tap: testID } | { wait: testID } | { type: [testID, text] } | { sleep: ms } | { scroll: [testID, y] }
const SHOTS = FX.shots ?? [];
const ONLY = process.env.SHOTS ? new Set(process.env.SHOTS.split(",").map((s) => s.trim())) : null;

function mock(method, path) {
  for (const k of [`${method} ${path}`, path]) if (Object.prototype.hasOwnProperty.call(ENDPOINTS, k)) return ENDPOINTS[k];
  return undefined;
}

const SESSION_WEB = `// QC ONLY PATCH (shoot-cal.mjs): web export ไม่มี SecureStore → localStorage
const get = async (k: string) => (typeof localStorage === "undefined" ? null : localStorage.getItem(k));
const set = async (k: string, v: string) => { if (typeof localStorage !== "undefined") localStorage.setItem(k, v); };
const del = async (k: string) => { if (typeof localStorage !== "undefined") localStorage.removeItem(k); };
export const getToken = () => get("shark_token");
export const setToken = (t: string) => set("shark_token", t);
export const getTenantId = () => get("shark_tenant");
export const setTenantId = (id: string) => set("shark_tenant", id);
export const getCachedBrand = () => get("shark_brand");
export const setCachedBrand = (json: string) => set("shark_brand", json);
export async function clearSession(): Promise<void> { await del("shark_token"); await del("shark_tenant"); await del("shark_brand"); }
`;

function prepare() {
  const sh = (cmd, cwd) => execSync(cmd, { cwd, stdio: "inherit", env: { ...process.env, CI: "1", EXPO_PUBLIC_QC: "1" } });
  mkdirSync(COPY, { recursive: true });
  sh(`rsync -a --delete --exclude node_modules --exclude dist --exclude .expo --exclude 'credentials*' --exclude 'qc/shots*' "${REPO_MOBILE}/" "${COPY}/"`);
  if (!existsSync(join(COPY, "node_modules"))) symlinkSync(BASE_MODULES, join(COPY, "node_modules"), "dir");
  writeFileSync(join(COPY, "src/lib/session.ts"), SESSION_WEB);
  const loginPath = join(COPY, "app/login.tsx");
  const login = readFileSync(loginPath, "utf8");
  if (!login.includes("QC ONLY PATCH")) writeFileSync(loginPath, login.replace(/GoogleSignin\.configure\(\{[\s\S]*?\}\);/, (m) => `// QC ONLY PATCH\ntry {\n  ${m}\n} catch {\n  /* web */\n}`));
  sh("npx expo export --platform web --output-dir dist --clear", COPY);
}

const MIME = { ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".ttf": "font/ttf", ".otf": "font/otf", ".woff": "font/woff", ".woff2": "font/woff2", ".ico": "image/x-icon" };
function serve(dir, port) {
  return new Promise((ok) => {
    const s = createServer((req, res) => {
      const u = new URL(req.url ?? "/", "http://x");
      let f = join(dir, decodeURIComponent(u.pathname));
      if (!f.startsWith(dir) || !existsSync(f) || statSync(f).isDirectory()) f = join(dir, "index.html");
      res.writeHead(200, { "content-type": MIME[extname(f)] ?? "application/octet-stream" });
      res.end(readFileSync(f));
    });
    s.listen(port, "127.0.0.1", () => ok(s));
  });
}

let server = null;
if (process.env.QC_PREPARE === "1") {
  if (process.env.QC_SKIP_EXPORT !== "1") prepare();
  server = await serve(join(COPY, "dist"), PORT);
}
const BASE = process.env.QC_BASE ?? `http://127.0.0.1:${PORT}`;
const UDD = `/tmp/chr-cal-app-${process.pid}`;
const browser = await puppeteer.launch({ executablePath: "/usr/bin/chromium-browser", headless: true, args: ["--no-sandbox", "--disable-gpu", "--font-render-hinting=none", "--hide-scrollbars", `--user-data-dir=${UDD}`] });

async function shootMockup(sheet, phone, dark) {
  // Q8: sheet "q8" = q8/q8.html (มีแบบสว่างอย่างเดียว · มืดเทียบกับแบบสว่าง)
  const file = sheet === "q8" ? join(MOCK_DIR, "q8", "q8.html") : join(MOCK_DIR, `cal-${dark ? "dark-" : ""}${sheet}.html`);
  const out = join(OUT, `mock-${sheet}-${phone}${dark ? "-dark" : ""}.png`);
  const p = await browser.newPage();
  await p.setViewport({ width: 1900, height: 1100, deviceScaleFactor: 2 });
  await p.goto("file://" + file, { waitUntil: "networkidle0" });
  await p.evaluate(() => document.fonts.ready);
  const els = await p.$$(".phone");
  await els[phone - 1].screenshot({ path: out });
  await p.close();
  return out;
}

const results = [];
try {
  for (const dark of MODES) {
    for (const spec of SHOTS) {
      if (ONLY && !ONLY.has(spec.name)) continue;
      const name = spec.name + (dark ? "-dark" : "");
      const page = await browser.newPage();
      await page.setViewport({ width: 390, height: spec.height ?? 844, deviceScaleFactor: 2 });
      await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: dark ? "dark" : "light" }]);
      await page.setRequestInterception(true);
      const unmocked = [];
      page.on("request", (req) => {
        const u = new URL(req.url());
        if (u.host === "shark.in.th") {
          const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS" };
          if (req.method() === "OPTIONS") return req.respond({ status: 204, headers: cors, body: "" });
          const body = mock(req.method(), u.pathname);
          if (body !== undefined) return req.respond({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify(body) });
          unmocked.push(`${req.method()} ${u.pathname}`);
          return req.respond({ status: 404, headers: cors, contentType: "application/json", body: '{"error":"not_found"}' });
        }
        req.continue();
      });
      await page.evaluateOnNewDocument(
        (mode, nowIso) => {
          localStorage.clear();
          localStorage.setItem("shark_theme", mode);
          localStorage.setItem("shark_token", "qc-mock");
          localStorage.setItem("shark_tenant", "t1");
          localStorage.setItem("shark_lang", "th");
          const RD = Date;
          const delta = RD.parse(nowIso) - RD.now();
          class FD extends RD {
            constructor(...a) {
              if (a.length === 0) super(RD.now() + delta);
              else super(...a);
            }
            static now() {
              return RD.now() + delta;
            }
          }
          globalThis.Date = FD;
        },
        dark ? "dark" : "light",
        NOW,
      );
      await page.evaluateOnNewDocument(() => Object.defineProperty(navigator, "language", { get: () => "th-TH" }));
      const errors = [];
      page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 160)));
      await page.goto(BASE + spec.route, { waitUntil: "networkidle0", timeout: 60000 }).catch((e) => errors.push("goto " + String(e.message).slice(0, 100)));
      for (const st of spec.steps ?? []) {
        try {
          if (st.wait) await page.waitForSelector(`[data-testid="${st.wait}"]`, { timeout: 20000 });
          if (st.tap) {
            await page.waitForSelector(`[data-testid="${st.tap}"]`, { timeout: 20000 });
            await page.click(`[data-testid="${st.tap}"]`);
            await new Promise((r) => setTimeout(r, 600));
          }
          if (st.type) {
            await page.waitForSelector(`[data-testid="${st.type[0]}"]`, { timeout: 20000 });
            await page.type(`[data-testid="${st.type[0]}"]`, st.type[1]);
          }
          if (st.sleep) await new Promise((r) => setTimeout(r, st.sleep));
          if (st.scroll) {
            await page.waitForSelector(`[data-testid="${st.scroll}"]`, { timeout: 20000 });
            await page.$eval(`[data-testid="${st.scroll}"]`, (el) => el.scrollIntoView({ block: "start" }));
            await new Promise((r) => setTimeout(r, 500));
          }
        } catch (e) {
          errors.push("step " + JSON.stringify(st) + " " + String(e.message).slice(0, 100));
        }
      }
      await page.evaluate(() => document.fonts.ready).catch(() => {});
      await new Promise((r) => setTimeout(r, 1200));
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      const file = join(OUT, `render-${name}.png`);
      await page.screenshot({ path: file });
      const texts = String(await page.evaluate(() => document.body.innerText).catch(() => "")).slice(0, 3000);
      await page.close();
      let pair = null;
      if (spec.mock) {
        const m = await shootMockup(spec.mock[0], spec.mock[1], dark);
        pair = join(OUT, `pair-${name}.png`);
        execSync(`convert \\( "${m}" -resize x1688 \\) \\( -size 2x1688 xc:gray50 \\) \\( "${file}" -resize x1688 \\) +append "${pair}"`);
      }
      results.push({ name, route: spec.route, dark, ok: errors.length === 0 && !overflow, errors, overflow, unmocked, file, pair, texts: texts.slice(0, 400) });
      console.log(`${errors.length || overflow ? "❌" : "✅"} ${name}${pair ? " → " + pair : ""}${errors.length ? " · " + errors.join(" | ") : ""}`);
    }
  }
} finally {
  await browser.close();
  if (server) server.close();
  for (const d of [UDD, `/tmp/snap-private-tmp/snap.chromium/tmp/chr-cal-app-${process.pid}`]) rmSync(d, { recursive: true, force: true });
}
const SUM = join(OUT, "summary.json");
const prev = existsSync(SUM) ? JSON.parse(readFileSync(SUM, "utf8")).screens ?? [] : [];
const names = new Set(results.map((r) => r.name));
writeFileSync(SUM, JSON.stringify({ generatedAt: new Date().toISOString(), now: NOW, screens: [...prev.filter((p) => !names.has(p.name)), ...results] }, null, 1));
process.exit(results.every((r) => r.ok) ? 0 : 1);
