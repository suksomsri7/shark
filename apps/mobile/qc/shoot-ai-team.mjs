// QC render จอ "ทีมพนักงาน AI" (SHARK HUB v2 · ใบ T0.3) — สำเนาของ qc/shoot-crm.mjs · web export + chromium · API ถูก mock ทั้งหมดจาก fixture
// ไม่แตะ prod · ไม่มี token จริง · ไม่ build แอป (ไม่มีคำสั่งบิลด์/OTA ใด ๆ ในไฟล์นี้) · สัญญาเต็ม = หัวไฟล์ scripts/qc-ai-t0.3.mts ข้อ [4]
//
// ใช้:  node apps/mobile/qc/shoot-ai-team.mjs [--dark]
//   env ROUTES   รายการ path ของแอปคั่นด้วย , เช่น  /team/_gallery,/team/_gallery?screen=a8            (บังคับ)
//       FIXTURE  ไฟล์ fixture ตามรูปแบบของ qc/fixtures/ai-team/README.md                              (บังคับ · ไม่มีไฟล์ ⇒ exit 2)
//       WO       ชื่อโฟลเดอร์ผลลัพธ์ (ปริยาย = `wo` ของ fixture)
//       QC_PREPARE=1      rsync apps/mobile → สำเนา QC_COPY (ปริยาย /root/qc-shark-mobile-ai) · node_modules = symlink ไปสำเนาที่มี react-native-web
//                         · patch 2 จุดเดียวกับ shoot-crm.mjs · `EXPO_PUBLIC_TEAM_GALLERY=1 npx expo export --platform web --output-dir dist --clear`
//                         "ในสำเนา" (ไม่เคย export ใน worktree) · เสิร์ฟ dist ที่ QC_PORT (ปริยาย 4713)
//       QC_SKIP_EXPORT=1  (คู่กับ QC_PREPARE=1) เสิร์ฟ dist เดิมของสำเนาแล้วถ่ายเลย — ใช้ตอนไล่แก้ parity/ถ่ายโหมดมืดต่อจากโหมดสว่าง
//       QC_KEEP_CACHE=1   export โดยไม่ล้างแคช Metro (แคชผูกกับเนื้อไฟล์ ปลอดภัย) — สำหรับลองใหม่บนเครื่องที่โหลดสูง
//       QC_BASE           ถ่ายจาก export ที่เสิร์ฟอยู่แล้วแทน (ไม่เตรียมสำเนา)
//   --dark  จำลอง `prefers-color-scheme: dark` และตั้ง localStorage `shark_theme` = "dark" ก่อนแอปบูต · ไม่ใส่ = light และไม่มี key นี้
//
// 🔴 งานหนัก (export + chromium) ต้องต่อคิวล็อกเครื่อง:
//      ISO_MEM=6500M bash scripts/iso.sh bash scripts/with-gate-lock.sh env QC_PREPARE=1 ROUTES=… FIXTURE=… node apps/mobile/qc/shoot-ai-team.mjs
//
// mock: ทุก request ไป shark.in.th ตอบจาก fixture (กติกาใน README ของ fixture: CORS · OPTIONS 204 · short key + `routes` · byTenant · $status/$delayMs/$sse)
//       ไม่มีในไฟล์ ⇒ 404 และลงรายการ `unmocked` (จอนั้นไม่ผ่าน) · bearer ของ mock = `qc-mock` · กิจการ = fixture.session.tenantId
// ภาพ: 390×844 · deviceScaleFactor 2 ⇒ PNG 780×1688
// ผลลัพธ์ (ในรีโปเสมอ ไม่ใช่ในสำเนา): apps/mobile/qc/shots-ai-team/<wo>/<slug>-<mode>.png   slug = route ตัวเล็ก · ช่วงที่ไม่ใช่ [a-z0-9] → "-" · ตัดหัวท้าย
//   + apps/mobile/qc/shots-ai-team/<wo>/summary.json = { generatedAt, base, view: { tag, w, h }, wo, mode, ok, fixture: { path, sha256 },
//       screens: [{ name, route, mode, ok, errors[], missing[], overflow, expect[], texts, unmocked[], requests: [{ method, path, tenant }], url, file }] }
//     `mode`/`ok` = ของรอบนี้ · รายการของอีกโหมดใน summary.json เดิม (sha256 ของ fixture ตรงกัน) ถูกเก็บไว้
// exit 0 = ทุกจอของรอบนี้ ok · 2 = ใช้ผิด (ไม่มี ROUTES / FIXTURE) · 1 = นอกนั้น
// 🔴 ต้องใส่ CORS headers ให้ mock (ไม่งั้น fetch ของ RN web ล้มเงียบ) · ห้ามฆ่า process ด้วยการจับคู่สตริงของคำสั่งตัวเอง
import puppeteer from "/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";
import { execSync } from "node:child_process";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_MOBILE = process.env.QC_REPO_MOBILE ?? resolve(HERE, "..");
const REPO_ROOT = resolve(REPO_MOBILE, "..", "..");
const COPY = process.env.QC_COPY ?? "/root/qc-shark-mobile-ai";
/** สำเนาเดิมของ qc/README.md ที่ติดตั้ง react-native-web ไว้แล้ว — สำเนาใหม่ symlink node_modules มาจากที่นี่ */
const BASE_COPY_MODULES = process.env.QC_NODE_MODULES ?? "/root/qc-shark-mobile/node_modules";
const PREPARE = process.env.QC_PREPARE === "1";
const SKIP_EXPORT = process.env.QC_SKIP_EXPORT === "1";
const KEEP_CACHE = process.env.QC_KEEP_CACHE === "1";
const PORT = Number(process.env.QC_PORT ?? 4713);
const DARK = process.argv.slice(2).includes("--dark");
const MODE = DARK ? "dark" : "light";
const VIEW = { tag: "iphone", w: 390, h: 844 };

const usage = (msg) => {
  console.error(`❌ shoot-ai-team: ${msg}`);
  console.error("   usage: ROUTES=/team/_gallery,/team/_gallery?screen=a8 FIXTURE=apps/mobile/qc/fixtures/ai-team/<wo>.json [WO=<wo>] [QC_PREPARE=1 | QC_BASE=http://…] node apps/mobile/qc/shoot-ai-team.mjs [--dark]");
  process.exit(2);
};

// ───────────────────────── อาร์กิวเมนต์ + fixture (ตรวจก่อนงานหนักทุกอย่าง) ─────────────────────────
const ROUTES = String(process.env.ROUTES ?? "").split(",").map((r) => r.trim()).filter(Boolean);
if (ROUTES.length === 0) usage("ROUTES is required (comma list of app paths)");
if (ROUTES.some((r) => !r.startsWith("/"))) usage("every ROUTES entry must start with /");
if (!process.env.FIXTURE) usage("FIXTURE is required (path of a fixture JSON)");
const FIXTURE_PATH = resolve(process.env.FIXTURE);
if (!existsSync(FIXTURE_PATH)) usage(`fixture not found: ${process.env.FIXTURE}`);
const FIXTURE_TEXT = readFileSync(FIXTURE_PATH, "utf8");
const FIXTURE_SHA = createHash("sha256").update(FIXTURE_TEXT).digest("hex");
let FX;
try {
  FX = JSON.parse(FIXTURE_TEXT);
} catch {
  usage(`fixture is not JSON: ${process.env.FIXTURE}`);
}
const WO = String(process.env.WO ?? FX.wo ?? "").trim();
if (!/^[a-z0-9][a-z0-9._-]*$/.test(WO)) usage("WO (or the fixture's `wo`) must be a lower-case folder name");
if (!PREPARE && !process.env.QC_BASE) usage("set QC_PREPARE=1 (copy + export + serve) or QC_BASE=<url of a served export>");
const TENANT = String(FX.session?.tenantId ?? "t1");
const OUT = join(REPO_MOBILE, "qc", "shots-ai-team", WO);
const slugOf = (route) => route.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const shown = (p) => relative(REPO_ROOT, p).startsWith("..") ? p : relative(REPO_ROOT, p);

// ───────────────────────── (1–3) เตรียมสำเนา + web export ─────────────────────────
const SESSION_WEB = `// QC ONLY PATCH (ไม่ commit · shoot-ai-team.mjs เขียนให้ · ข้อความเดียวกับ shoot-crm.mjs): เว็บ export ไม่มี SecureStore → ใช้ localStorage
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

/** แพ็กเกจฟอนต์ที่ package.json ของแอปมี แต่ node_modules ร่วมของสำเนา QC (symlink ไปสำเนาเก่า) ยังไม่มี → วางสำเนาไว้ใน <COPY>/src/node_modules
 *  (Metro ไล่หา node_modules ขึ้นจากไฟล์ที่ import: src/lib/fonts.ts → src/node_modules) · ไม่แตะสำเนาเก่าของคนอื่น · rsync ไม่ลบโฟลเดอร์นี้ (ชื่อ node_modules ถูก exclude) */
const VENDOR_PACKAGES = ["@expo-google-fonts/inter"];
function vendorMissingPackages() {
  for (const name of VENDOR_PACKAGES) {
    if (existsSync(join(COPY, "node_modules", name, "package.json"))) continue;
    const from = join(REPO_MOBILE, "node_modules", name);
    if (!existsSync(join(from, "package.json"))) throw new Error(`${name} is not installed in ${shown(join(REPO_MOBILE, "node_modules"))} — run npm ci in apps/mobile first`);
    const to = join(COPY, "src", "node_modules", name);
    rmSync(to, { recursive: true, force: true });
    mkdirSync(dirname(to), { recursive: true });
    cpSync(from, to, { recursive: true, dereference: true });
  }
}

function prepare() {
  const sh = (cmd, cwd, env = {}) => execSync(cmd, { cwd, stdio: "inherit", env: { ...process.env, CI: "1", ...env } });
  mkdirSync(COPY, { recursive: true });
  sh(`rsync -a --delete --exclude node_modules --exclude dist --exclude .expo --exclude 'credentials*' --exclude '.env*' --exclude 'qc/shots*' "${REPO_MOBILE}/" "${COPY}/"`);
  if (!existsSync(join(COPY, "node_modules"))) symlinkSync(BASE_COPY_MODULES, join(COPY, "node_modules"), "dir");
  if (!existsSync(join(COPY, "node_modules", "react-native-web"))) {
    throw new Error(`node_modules ของสำเนา ${COPY} ยังไม่มี react-native-web — ทำขั้น 3 ของ qc/README.md (npm install --no-save react-native-web@~0.21.0) ก่อน`);
  }
  vendorMissingPackages();
  writeFileSync(join(COPY, "src/lib/session.ts"), SESSION_WEB);
  const loginPath = join(COPY, "app/login.tsx");
  const login = readFileSync(loginPath, "utf8");
  if (!login.includes("QC ONLY PATCH")) {
    const patched = login.replace(/GoogleSignin\.configure\(\{[\s\S]*?\}\);/, (m) => `// QC ONLY PATCH: web export ไม่มี native module ของ google-signin\ntry {\n  ${m}\n} catch {\n  /* เว็บ QC */\n}`);
    writeFileSync(loginPath, patched);
  }
  // แกลเลอรี/จอพิสูจน์เปิดได้เฉพาะเมื่อมีธงนี้ (web export = production bundle: __DEV__ เป็น false)
  sh(`npx expo export --platform web --output-dir dist${KEEP_CACHE ? "" : " --clear"}`, COPY, { EXPO_PUBLIC_TEAM_GALLERY: "1" });
}

const MIME = { ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".ttf": "font/ttf", ".otf": "font/otf", ".woff": "font/woff", ".woff2": "font/woff2", ".ico": "image/x-icon", ".map": "application/json" };

function serveDist(dir, port) {
  return new Promise((ok, fail) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://x");
      let file = join(dir, decodeURIComponent(url.pathname));
      if (!file.startsWith(dir) || !existsSync(file) || statSync(file).isDirectory()) file = join(dir, "index.html"); // SPA fallback
      res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
      res.end(readFileSync(file));
    });
    server.on("error", fail);
    server.listen(port, "127.0.0.1", () => ok(server));
  });
}

let server = null;
if (PREPARE) {
  try {
    if (!SKIP_EXPORT) prepare();
    if (!existsSync(join(COPY, "dist", "index.html"))) throw new Error(`no export at ${COPY}/dist (run once without QC_SKIP_EXPORT)`);
    server = await serveDist(join(COPY, "dist"), PORT);
  } catch (e) {
    console.error(`❌ shoot-ai-team: prepare failed — ${String(e?.message ?? e).slice(0, 300)}`);
    process.exit(1);
  }
}
const BASE = process.env.QC_BASE ?? `http://127.0.0.1:${PORT}`;

// ───────────────────────── mock API จาก fixture ─────────────────────────
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS" };
/** short key = ชื่อย่อของ route (README ของ fixture) · ตัวที่มี [id] = ค่าเป็นแผนที่ id → คำตอบ ("*" = id อื่น ๆ) */
const SHORT_KEYS = {
  me: "GET /api/mobile/me",
  summary: "GET /api/mobile/team/summary",
  quota: "GET /api/mobile/team/quota",
  employees: "GET /api/mobile/team/employees",
  positions: "GET /api/mobile/team/positions",
  recommend: "GET /api/mobile/team/positions/recommend",
  inbox: "GET /api/mobile/team/inbox",
  schedules: "GET /api/mobile/team/schedules",
  employee: "GET /api/mobile/team/employees/[id]",
  tasks: "GET /api/mobile/team/employees/[id]/tasks",
  task: "GET /api/mobile/team/tasks/[id]",
  messages: "GET /api/mobile/conversations/[id]/messages",
};
/** pattern "GET /a/[id]/b" เทียบกับ method + path จริง → { ids } หรือ null */
function matchPattern(pattern, method, path) {
  const sp = pattern.indexOf(" ");
  if (sp < 0 || pattern.slice(0, sp) !== method) return null;
  const want = pattern.slice(sp + 1).split("?")[0].split("/");
  const got = path.split("/");
  if (want.length !== got.length) return null;
  const ids = [];
  for (let i = 0; i < want.length; i++) {
    if (want[i] === "[id]") ids.push(decodeURIComponent(got[i]));
    else if (want[i] !== got[i]) return null;
  }
  return { ids };
}
function lookup(layer, method, path, search) {
  if (!layer || typeof layer !== "object") return undefined;
  const routes = layer.routes && typeof layer.routes === "object" ? layer.routes : {};
  const table = { ...Object.fromEntries(Object.entries(SHORT_KEYS).filter(([k]) => k in layer).map(([k, pattern]) => [pattern, layer[k]])), ...routes }; // routes ชนะ short key
  if (search && `${method} ${path}${search}` in table) return table[`${method} ${path}${search}`]; // key ที่ระบุ query เต็ม
  if (`${method} ${path}` in table) return table[`${method} ${path}`];
  for (const [pattern, value] of Object.entries(table)) {
    if (!pattern.includes("[id]")) continue;
    const m = matchPattern(pattern, method, path);
    if (!m) continue;
    if (value && typeof value === "object") {
      for (const id of m.ids) if (id in value) return value[id];
      if ("*" in value) return value["*"];
    }
  }
  return undefined;
}
function mock(method, path, search, tenant) {
  const hit = lookup(FX.byTenant?.[tenant], method, path, search) ?? lookup(FX, method, path, search);
  if (hit !== undefined && hit !== null) return hit;
  if (path === "/api/mobile/push" || path.startsWith("/api/mobile/push/")) return { ok: true }; // เหมือน shoot-crm.mjs
  return null;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function answer(req, body) {
  let value = body;
  if (value && typeof value === "object" && typeof value.$delayMs === "number") {
    await sleep(Math.min(value.$delayMs, 20_000));
    const { $delayMs: _d, ...rest } = value;
    value = rest;
  }
  if (value && typeof value === "object" && Array.isArray(value.$sse)) {
    return req.respond({ status: 200, headers: { ...CORS, "cache-control": "no-cache" }, contentType: "text/event-stream", body: value.$sse.map((ev) => `data: ${JSON.stringify(ev)}\n\n`).join("") });
  }
  if (value && typeof value === "object" && typeof value.$status === "number") {
    return req.respond({ status: value.$status, headers: CORS, contentType: "application/json", body: JSON.stringify(value.$body ?? {}) });
  }
  return req.respond({ status: 200, headers: CORS, contentType: "application/json", body: JSON.stringify(value) });
}

// ───────────────────────── จอที่ถ่าย ─────────────────────────
const GALLERY_IDS = ["glass-card", "orb", "avatar-stack", "pill-tabs", "stat-card", "quota-ring", "primary-button", "bottom-sheet", "segmented", "search-field", "list-row", "section-title", "empty-state", "error-state", "skeleton"].map((n) => `gallery-${n}`);
/** testID ที่ต้องเห็นของแต่ละ route — route อื่น (ใบถัดไป) ส่งมาทาง EXPECT="<slug>=id1+id2;<slug>=…" ได้ */
const EXTRA_EXPECT = Object.fromEntries(String(process.env.EXPECT ?? "").split(";").map((p) => p.trim()).filter(Boolean).map((p) => [p.split("=")[0], (p.split("=")[1] ?? "").split("+").filter(Boolean)]));
function expectOf(route) {
  const slug = slugOf(route);
  if (EXTRA_EXPECT[slug]) return EXTRA_EXPECT[slug];
  const [path, query = ""] = route.split("?");
  if (path === "/team/_gallery") return new URLSearchParams(query).get("screen") === "a8" ? ["team-a8"] : ["team-gallery", ...GALLERY_IDS];
  return [];
}
const SCREENS = ROUTES.map((route) => ({ name: slugOf(route), route, expect: expectOf(route) }));

mkdirSync(OUT, { recursive: true });
// 🔴 โปรไฟล์ chromium ต้องถูกลบหลังปิด (snap chromium เห็น /tmp ของตัวเอง = /tmp/snap-private-tmp/snap.chromium/tmp — เคยทำดิสก์เต็ม)
const UDD = `/tmp/chr-ai-team-app-${process.pid}`;
const results = [];
let fatal = null;
let browser = null;
try {
  browser = await puppeteer.launch({ executablePath: "/usr/bin/chromium-browser", headless: true, timeout: 180_000, protocolTimeout: 300_000, args: ["--no-sandbox", "--disable-gpu", "--font-render-hinting=none", `--user-data-dir=${UDD}`] });
  for (const s of SCREENS) {
    const page = await browser.newPage();
    await page.setViewport({ width: VIEW.w, height: VIEW.h, deviceScaleFactor: 2 }); // 390×844 @2x ⇒ PNG 780×1688
    await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: DARK ? "dark" : "light" }]);
    await page.setRequestInterception(true);
    const unmocked = [];
    const requests = [];
    page.on("request", (req) => {
      const u = new URL(req.url());
      if (u.host !== "shark.in.th") return void req.continue();
      if (req.method() === "OPTIONS") return void req.respond({ status: 204, headers: CORS, body: "" });
      const tenant = String(req.headers()["x-tenant-id"] ?? "");
      requests.push({ method: req.method(), path: u.pathname, tenant });
      const body = mock(req.method(), u.pathname, u.search, tenant);
      if (body !== null) return void answer(req, body).catch(() => {});
      unmocked.push(`${req.method()} ${u.pathname}`);
      return void req.respond({ status: 404, headers: CORS, contentType: "application/json", body: '{"error":"not_found"}' });
    });
    await page.evaluateOnNewDocument(
      (tenant, dark) => {
        localStorage.clear();
        localStorage.setItem("shark_token", "qc-mock");
        localStorage.setItem("shark_tenant", tenant);
        if (dark) localStorage.setItem("shark_theme", "dark"); // โหมดสว่าง: ไม่มี key นี้ (ตามโหมดเครื่อง = light ที่จำลองไว้)
      },
      TENANT,
      DARK,
    );
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e?.message ?? e).slice(0, 160)));
    await page.goto(BASE + s.route, { waitUntil: "networkidle0", timeout: 90_000 }).catch((e) => errors.push("goto " + String(e.message).slice(0, 100)));
    for (const id of s.expect) await page.waitForSelector(`[data-testid="${id}"]`, { timeout: 30_000 }).catch(() => {});
    await page.evaluate(() => document.fonts.ready.then(() => true)).catch(() => {});
    await sleep(1200);
    const missing = [];
    for (const id of s.expect) if (!(await page.$(`[data-testid="${id}"]`))) missing.push(id);
    const overflow = Boolean(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1).catch(() => true));
    const file = join(OUT, `${s.name}-${MODE}.png`);
    await page.screenshot({ path: file, type: "png" });
    const texts = String(await page.evaluate(() => document.body.innerText).catch(() => "")).slice(0, 8000);
    const ok = errors.length === 0 && missing.length === 0 && !overflow && unmocked.length === 0;
    results.push({ name: s.name, route: s.route, mode: MODE, ok, errors, missing, overflow, expect: s.expect, texts, unmocked, requests, url: page.url().replace(BASE, ""), file: shown(file) });
    await page.close();
  }
} catch (e) {
  fatal = String(e?.message ?? e).slice(0, 300);
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server) server.close();
  for (const d of [UDD, `/tmp/snap-private-tmp/snap.chromium/tmp/chr-ai-team-app-${process.pid}`]) rmSync(d, { recursive: true, force: true });
}
if (fatal) {
  console.error(`❌ shoot-ai-team: ${fatal}`);
  process.exit(1);
}

// ───────────────────────── summary.json (เก็บรายการของอีกโหมดไว้ ถ้า fixture เดิม) ─────────────────────────
const SUMMARY = join(OUT, "summary.json");
let kept = [];
try {
  const prev = JSON.parse(readFileSync(SUMMARY, "utf8"));
  if (prev?.fixture?.sha256 === FIXTURE_SHA && Array.isArray(prev.screens)) kept = prev.screens.filter((x) => x && x.mode !== MODE);
} catch {
  /* ยังไม่มี summary เดิม / อ่านไม่ได้ — เริ่มใหม่ */
}
const okRun = results.length === SCREENS.length && results.every((r) => r.ok);
const order = (a, b) => (a.mode === b.mode ? 0 : a.mode === "light" ? -1 : 1);
writeFileSync(SUMMARY, JSON.stringify({ generatedAt: new Date().toISOString(), base: BASE, view: VIEW, wo: WO, mode: MODE, ok: okRun, fixture: { path: shown(FIXTURE_PATH), sha256: FIXTURE_SHA }, screens: [...kept, ...results].sort(order) }, null, 1));
console.log(JSON.stringify(results.map((r) => ({ name: r.name, mode: r.mode, ok: r.ok, errors: r.errors, missing: r.missing, overflow: r.overflow, unmocked: r.unmocked, requests: r.requests.length })), null, 1));
process.exit(okRun ? 0 : 1);
