// QC render จอ "CRM" ของแอปพนักงาน (ใบ C3.7 · ภาพ 13) — สำเนาของ qc/shoot-member.mjs · web export + chromium · API ถูก mock ทั้งหมด
// ไม่แตะ prod · ไม่มี token จริง · ไม่ build แอป (ไม่มีคำสั่งบิลด์/OTA ใด ๆ ในไฟล์นี้)
//
// ข้อมูลของ mock = fixture ที่ข้อสอบ `scripts/qc-crm-c3.7.mts` เขียนจาก SEED ในสายตา thana ผ่าน route จริง
//   QC_CRM_FIXTURE (ปริยาย <repo>/.qc-shots/crm/3.7/fixture-thana.json) = { deals, tasks, callLog } — sha256 ของไฟล์ลงใน summary
//   (ข้อสอบเทียบ sha256 กับ fixture ปัจจุบัน ⇒ ภาพเก่าของ fixture เก่าไม่ผ่าน · งานวันนี้เปลี่ยนตามวันไทย: ถ่ายและรันข้อสอบวันเดียวกัน)
//
// ผลลัพธ์ (ในรีโปเสมอ ไม่ใช่ในสำเนา): apps/mobile/qc/shots-crm/{crm-deals,crm-tasks,crm-call-log,crm-scan-card,crm-drawer}-iphone.png
//   + apps/mobile/qc/shots-crm/summary.json = { generatedAt, base, view, fixture: { path, sha256 },
//       screens: [{ name, ok, errors[], missing[], overflow, expect[], texts (document.body.innerText ≤ 6000), unmocked[], url, file }] }
//
// วิธีรัน (ผู้คุมงาน):
//   A) ครบวงจร — สำเนา + patch + web export + เสิร์ฟ + ถ่าย (ใช้เวลา export ~1–3 นาที · งานหนัก → ผ่าน with-gate-lock)
//        QC_PREPARE=1 node apps/mobile/qc/shoot-crm.mjs
//      ขั้นตอนที่สคริปต์ทำให้ (ตาม qc/README.md):
//        1. rsync ซอร์ส apps/mobile ของรีโปนี้ → สำเนา QC_COPY (ปริยาย /root/qc-shark-mobile-crm — แยกจากสำเนาของจอสมาชิก)
//           node_modules ของสำเนา = symlink ไป /root/qc-shark-mobile/node_modules (มี react-native-web แล้ว · package.json เดียวกัน)
//        2. patch สำเนา: src/lib/session.ts → localStorage · app/login.tsx ห่อ GoogleSignin.configure ด้วย try/catch
//        3. `npx expo export --platform web --output-dir dist` ในสำเนา
//        4. เสิร์ฟ dist ด้วยเซิร์ฟเวอร์ไฟล์ในตัวสคริปต์ (SPA fallback → index.html) ที่พอร์ต QC_PORT (ปริยาย 4712) แล้วถ่าย
//   B) มี dist เสิร์ฟอยู่แล้ว — ถ่ายอย่างเดียว:  QC_BASE=http://127.0.0.1:4700 node apps/mobile/qc/shoot-crm.mjs
//
// 🔴 ข้อมูลในภาพ = ข้อมูลของร้าน QC (seed) ผ่าน fixture — ไม่ใช่ข้อมูลร้านจริง · นามบัตร/การบันทึกเป็นคำตอบจำลอง
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
const OUT = join(REPO_MOBILE, "qc", "shots-crm");
const COPY = process.env.QC_COPY ?? "/root/qc-shark-mobile-crm";
/** สำเนาเดิมของ qc/README.md ที่ติดตั้ง react-native-web ไว้แล้ว — สำเนาใหม่ symlink node_modules มาจากที่นี่ */
const BASE_COPY_MODULES = process.env.QC_NODE_MODULES ?? "/root/qc-shark-mobile/node_modules";
const PREPARE = process.env.QC_PREPARE === "1";
/** QC_SKIP_EXPORT=1 (คู่กับ QC_PREPARE=1) = เสิร์ฟ dist เดิมของสำเนาแล้วถ่ายเลย ไม่ rsync/export ใหม่ */
const SKIP_EXPORT = process.env.QC_SKIP_EXPORT === "1";
const PORT = Number(process.env.QC_PORT ?? 4712);
mkdirSync(OUT, { recursive: true });

// ───────────────────────── (1–3) เตรียมสำเนา + web export ─────────────────────────
const SESSION_WEB = `// QC ONLY PATCH (ไม่ commit · shoot-crm.mjs เขียนให้): เว็บ export ไม่มี SecureStore → ใช้ localStorage
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
  const sh = (cmd, cwd) => execSync(cmd, { cwd, stdio: "inherit", env: { ...process.env, CI: "1" } });
  mkdirSync(COPY, { recursive: true });
  sh(`rsync -a --delete --exclude node_modules --exclude dist --exclude .expo --exclude 'credentials*' --exclude 'qc/shots*' "${REPO_MOBILE}/" "${COPY}/"`);
  if (!existsSync(join(COPY, "node_modules"))) symlinkSync(BASE_COPY_MODULES, join(COPY, "node_modules"), "dir");
  if (!existsSync(join(COPY, "node_modules", "react-native-web"))) {
    throw new Error(`node_modules ของสำเนา ${COPY} ยังไม่มี react-native-web — ทำขั้น 3 ของ qc/README.md (npm install --no-save react-native-web@~0.21.0) ก่อน`);
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
const BASE = process.env.QC_BASE ?? (PREPARE ? `http://127.0.0.1:${PORT}` : "http://127.0.0.1:4700");

// ───────────────────────── fixture (ข้อสอบเขียนจาก SEED ในสายตา thana) ─────────────────────────
const FIXTURE_PATH = resolve(process.env.QC_CRM_FIXTURE ?? join(REPO_MOBILE, "..", "..", ".qc-shots", "crm", "3.7", "fixture-thana.json"));
if (!existsSync(FIXTURE_PATH)) {
  console.error(`❌ ไม่พบ fixture ${FIXTURE_PATH} — รันข้อสอบ scripts/qc-crm-c3.7.mts ก่อน (ข้อสอบเขียนไฟล์นี้จาก seed ในสายตา thana)`);
  if (server) server.close();
  process.exit(2);
}
const FIXTURE_TEXT = readFileSync(FIXTURE_PATH, "utf8");
const FIXTURE_SHA = createHash("sha256").update(FIXTURE_TEXT).digest("hex");
const FX = JSON.parse(FIXTURE_TEXT);
const DEALS = FX.deals ?? { items: [], stages: [] };
const TASKS = FX.tasks ?? { items: [], counts: { today: 0, overdue: 0, done: 0 } };
const PROMPT = FX.callLog ?? null;

// ───────────────────────── mock API ─────────────────────────
const ME = {
  user: { id: "u-thana", email: "thana@qc.invalid", name: "ธนา (พนักงาน)" },
  memberships: [{ tenantId: "t1", name: "SIAM DIVE CENTER", role: "STAFF" }],
};
const CARD = { proposalId: "qc-proposal", draft: { name: "คุณประกาศิต ทองแท้", phone: "089-441-2290", email: "", company: "โรงแรมกะตะ คลิฟ", jobTitle: "ผจก.ฝ่ายจัดซื้อ" } };

function mock(method, path) {
  if (path === "/api/mobile/me") return ME;
  if (path === "/api/mobile/usage") return { used: 12, limit: 100, pct: 12 };
  if (path === "/api/mobile/crm/deals" && method === "GET") return DEALS;
  if (path.startsWith("/api/mobile/crm/deals/") && method === "GET") {
    const id = decodeURIComponent(path.slice("/api/mobile/crm/deals/".length));
    const deal = (DEALS.items ?? []).find((d) => d.id === id);
    return deal ? { deal } : null;
  }
  if (path === "/api/mobile/crm/tasks" && method === "GET") return TASKS;
  if (/^\/api\/mobile\/crm\/tasks\/[^/]+\/complete$/.test(path) && method === "POST") return { id: path.split("/")[5], done: true };
  if (path === "/api/mobile/crm/call-log" && method === "GET") return PROMPT;
  if (path === "/api/mobile/crm/call-log" && method === "POST") return { activityId: "qc-activity", replayed: false };
  if (path === "/api/mobile/crm/scan-card" && method === "POST") return CARD;
  if (/^\/api\/mobile\/crm\/scan-card\/[^/]+\/accept$/.test(path) && method === "POST") return { contactId: "qc-contact" };
  if (/^\/api\/mobile\/crm\/scan-card\/[^/]+\/reject$/.test(path) && method === "POST") return { ok: true };
  if (path === "/api/mobile/push" || path.startsWith("/api/mobile/push/")) return { ok: true };
  return null;
}

// ───────────────────────── จอที่ถ่าย ─────────────────────────
const firstDeal = (DEALS.items ?? []).find((d) => d.contact?.id) ?? null;
const callPath = PROMPT
  ? `/crm/call-log?contactId=${encodeURIComponent(PROMPT.contact.id)}${PROMPT.deal ? `&dealId=${encodeURIComponent(PROMPT.deal.id)}` : ""}&durationSec=272`
  : `/crm/call-log?contactId=${encodeURIComponent(firstDeal?.contact?.id ?? "none")}&durationSec=272`;
const SCREENS = [
  {
    name: "crm-deals",
    path: "/crm",
    expect: ["crm-deals", "crm-deal-filter-all", ...(DEALS.items?.[0] ? [`crm-deal-card-${DEALS.items[0].id}`] : [])],
    run: async (page) => {
      await page.waitForSelector('[data-testid="crm-deal-filter-all"]', { timeout: 30000 });
      if (DEALS.items?.[0]) await page.waitForSelector(`[data-testid="crm-deal-card-${DEALS.items[0].id}"]`, { timeout: 15000 });
    },
  },
  {
    name: "crm-tasks",
    path: "/crm/tasks",
    expect: ["crm-tasks", "crm-tasks-count-today", "crm-tasks-count-overdue", "crm-tasks-count-done", "crm-scan-card-open", ...(TASKS.items?.[0] ? [`crm-task-${TASKS.items[0].id}`] : [])],
    run: async (page) => {
      await page.waitForSelector('[data-testid="crm-tasks-count-today"]', { timeout: 30000 });
      if (TASKS.items?.[0]) await page.waitForSelector(`[data-testid="crm-task-${TASKS.items[0].id}"]`, { timeout: 15000 });
    },
  },
  {
    // แผ่นบันทึกสายหลังวางสาย: กรอกโน้ต → บันทึก → แถบ "บันทึกสายแล้ว" ในจอ (ไม่มี Alert)
    name: "crm-call-log",
    path: callPath,
    expect: ["crm-call-log", "crm-call-outcome-0", "crm-call-direction-OUT", "crm-call-direction-IN", "crm-call-duration", "crm-call-note", "crm-call-next-task", "crm-call-save", "crm-call-saved"],
    run: async (page) => {
      await page.waitForSelector('[data-testid="crm-call-save"]', { timeout: 30000 });
      await page.click('[data-testid="crm-call-note"]');
      await page.type('[data-testid="crm-call-note"]', "สนใจแพ็กเกจ ขอใบเสนอราคาก่อนศุกร์นี้");
      await page.click('[data-testid="crm-call-save"]');
      await page.waitForSelector('[data-testid="crm-call-saved"]', { timeout: 15000 });
    },
  },
  {
    name: "crm-scan-card",
    path: "/crm/scan-card",
    expect: ["crm-scan-card", "crm-scan-pick"],
    run: async (page) => {
      await page.waitForSelector('[data-testid="crm-scan-pick"]', { timeout: 30000 });
    },
  },
  {
    // ทางเข้า: ปุ่ม ☰ บนจอดีลเปิด Drawer ได้จริง และ Drawer มีเมนู "CRM ขาย" (+ "สมาชิก" เดิมยังอยู่)
    name: "crm-drawer",
    path: "/crm",
    expect: ["drawer-crm", "drawer-member"],
    run: async (page) => {
      await page.waitForSelector('[aria-label="เปิดเมนู"]', { timeout: 30000 });
      await page.click('[aria-label="เปิดเมนู"]');
      await page.waitForSelector('[data-testid="drawer-crm"]', { visible: true, timeout: 15000 });
    },
  },
];

const VIEW = { tag: "iphone", w: 390, h: 844 };
// 🔴 โปรไฟล์ chromium ต้องถูกลบหลังปิด (snap chromium เห็น /tmp ของตัวเอง = /tmp/snap-private-tmp/snap.chromium/tmp — เคยทำดิสก์เต็ม)
const UDD = `/tmp/chr-crm-app-${process.pid}`;
const browser = await puppeteer.launch({ executablePath: "/usr/bin/chromium-browser", headless: true, args: ["--no-sandbox", "--disable-gpu", "--font-render-hinting=none", `--user-data-dir=${UDD}`] });
const results = [];
try {
  for (const s of SCREENS) {
    const page = await browser.newPage();
    await page.setViewport({ width: VIEW.w, height: VIEW.h, deviceScaleFactor: 2 });
    await page.setRequestInterception(true);
    const unmocked = [];
    page.on("request", (req) => {
      const u = new URL(req.url());
      if (u.host === "shark.in.th") {
        const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS" };
        if (req.method() === "OPTIONS") return req.respond({ status: 204, headers: cors, body: "" });
        const body = mock(req.method(), u.pathname);
        if (body) return req.respond({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify(body) });
        unmocked.push(`${req.method()} ${u.pathname}`);
        return req.respond({ status: 404, headers: cors, contentType: "application/json", body: '{"error":"not_found"}' });
      }
      req.continue();
    });
    await page.evaluateOnNewDocument(() => {
      localStorage.clear();
      localStorage.setItem("shark_token", "qc-mock");
      localStorage.setItem("shark_tenant", "t1");
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 160)));
    await page.goto(BASE + s.path, { waitUntil: "networkidle0", timeout: 60000 }).catch((e) => errors.push("goto " + String(e.message).slice(0, 100)));
    await s.run(page).catch((e) => errors.push("step " + String(e.message).slice(0, 120)));
    await new Promise((r) => setTimeout(r, 800));
    const missing = [];
    for (const id of s.expect) if (!(await page.$(`[data-testid="${id}"]`))) missing.push(id);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    const file = join(OUT, `${s.name}-${VIEW.tag}.png`);
    await page.screenshot({ path: file });
    const texts = String(await page.evaluate(() => document.body.innerText).catch(() => "")).slice(0, 6000);
    const ok = errors.length === 0 && missing.length === 0 && !overflow;
    results.push({ name: s.name, ok, errors, missing, overflow, expect: s.expect, texts, unmocked, url: page.url().replace(BASE, ""), file });
    await page.close();
  }
} finally {
  await browser.close();
  if (server) server.close();
  for (const d of [UDD, `/tmp/snap-private-tmp/snap.chromium/tmp/chr-crm-app-${process.pid}`]) rmSync(d, { recursive: true, force: true });
}
writeFileSync(join(OUT, "summary.json"), JSON.stringify({ generatedAt: new Date().toISOString(), base: BASE, view: VIEW, fixture: { path: FIXTURE_PATH, sha256: FIXTURE_SHA }, screens: results }, null, 1));
console.log(JSON.stringify(results.map((r) => ({ name: r.name, ok: r.ok, errors: r.errors, missing: r.missing, overflow: r.overflow, unmocked: r.unmocked })), null, 1));
process.exit(results.every((r) => r.ok) ? 0 : 1);
