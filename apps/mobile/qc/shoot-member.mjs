// QC render จอ "สมาชิก" ของแอปพนักงาน (M3.11 · ภาพ 28) — web export + chromium · API ถูก mock ทั้งหมด
// แบบเดียวกับ qc/shoot-ipad.mjs: ไม่แตะ prod · ไม่มี token จริง · ไม่ build แอป (ไม่มี eas/OTA)
//
// ผลลัพธ์ (ในรีโปเสมอ ไม่ใช่ในสำเนา): apps/mobile/qc/shots-member/{member-search,member-summary,member-stamp}-iphone.png
//                                    + apps/mobile/qc/shots-member/summary.json  { screens: [{ name, ok, errors[], missing[] }] }
//
// วิธีรัน (ผู้คุมงาน):
//   A) ครบวงจร — สำเนา + patch + web export + เสิร์ฟ + ถ่าย (ใช้เวลา export ~1–3 นาที · งานหนัก → ผ่าน with-gate-lock)
//        QC_PREPARE=1 node apps/mobile/qc/shoot-member.mjs
//      ขั้นตอนที่สคริปต์ทำให้ (ตาม qc/README.md):
//        1. rsync ซอร์ส apps/mobile ของรีโปนี้ → สำเนา QC_COPY (ปริยาย /root/qc-shark-mobile-member — แยกจากสำเนาของงานธีม)
//           node_modules ของสำเนา = symlink ไป /root/qc-shark-mobile/node_modules (มี react-native-web แล้ว · package.json เดียวกัน)
//        2. patch สำเนา: src/lib/session.ts → localStorage · app/login.tsx ห่อ GoogleSignin.configure ด้วย try/catch
//        3. `npx expo export --platform web --output-dir dist` ในสำเนา
//        4. เสิร์ฟ dist ด้วยเซิร์ฟเวอร์ไฟล์ในตัวสคริปต์ (SPA fallback → index.html) ที่พอร์ต QC_PORT (ปริยาย 4711) แล้วถ่าย
//   B) มี dist เสิร์ฟอยู่แล้ว — ถ่ายอย่างเดียว:  QC_BASE=http://127.0.0.1:4700 node apps/mobile/qc/shoot-member.mjs
//
// 🔴 ข้อมูลทั้งหมดในไฟล์นี้เป็นข้อมูลจำลองของ QC (ชื่อ/ตัวเลขตามภาพ 28) — ไม่ใช่ข้อมูลร้านจริง
// 🔴 ต้องใส่ CORS headers ให้ mock (ไม่งั้น fetch ของ RN web ล้มเงียบ) · ห้าม `pkill -f` ด้วยสตริงในคำสั่งตัวเอง
import puppeteer from "/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";
import { execSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_MOBILE = process.env.QC_REPO_MOBILE ?? resolve(HERE, "..");
const OUT = join(REPO_MOBILE, "qc", "shots-member");
const COPY = process.env.QC_COPY ?? "/root/qc-shark-mobile-member";
/** สำเนาเดิมของ qc/README.md ที่ติดตั้ง react-native-web ไว้แล้ว — สำเนาใหม่ symlink node_modules มาจากที่นี่ */
const BASE_COPY_MODULES = process.env.QC_NODE_MODULES ?? "/root/qc-shark-mobile/node_modules";
const PREPARE = process.env.QC_PREPARE === "1";
/** QC_SKIP_EXPORT=1 (คู่กับ QC_PREPARE=1) = เสิร์ฟ dist เดิมของสำเนาแล้วถ่ายเลย ไม่ rsync/export ใหม่ */
const SKIP_EXPORT = process.env.QC_SKIP_EXPORT === "1";
const PORT = Number(process.env.QC_PORT ?? 4711);
mkdirSync(OUT, { recursive: true });

// ───────────────────────── (1–3) เตรียมสำเนา + web export ─────────────────────────
const SESSION_WEB = `// QC ONLY PATCH (ไม่ commit · shoot-member.mjs เขียนให้): เว็บ export ไม่มี SecureStore → ใช้ localStorage
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

// ───────────────────────── mock API (ข้อมูลจำลองตามภาพ 28) ─────────────────────────
const ME = {
  user: { id: "u1", email: "thana@example.com", name: "ธนา (พนักงาน)" },
  memberships: [{ tenantId: "t1", name: "SIAM DIVE CENTER", role: "STAFF" }],
};
const M1 = { id: "c1", memberCode: "M-2568-0042", name: "สมชาย ใจดี", phoneMasked: "081-xxx-5678", tier: { name: "Gold", color: "AMBER" }, points: 2340 };
const SEARCH = {
  items: [
    M1,
    { id: "c2", memberCode: "M-2568-0107", name: "สมหญิง แซ่ตั้ง", phoneMasked: "089-xxx-1234", tier: { name: "Silver", color: "BLUE" }, points: 820 },
    { id: "c3", memberCode: "M-2568-0188", name: "สมพงษ์ รักดี", phoneMasked: "082-xxx-9900", tier: { name: "Member", color: "SLATE" }, points: 120 },
  ],
};
const day = (n) => new Date(Date.now() - n * 86400e3).toISOString();
const SUMMARY = {
  member: M1,
  stats: { points: 2340, vouchers: 2, stamp: { name: "ดำน้ำครบ 10 ไดฟ์ฟรี 1", stamps: 7, slots: 10 } },
  history: [
    { id: "h1", at: day(8), kind: "purchase", title: "ซื้อบิล R-1042", sub: "฿3,500 · ได้แต้ม +156" },
    { id: "h2", at: day(22), kind: "booking", title: "จองเรือ Sea Fox", sub: "มาแล้ว" },
    { id: "h3", at: day(24), kind: "review", title: "รีวิว 5 ดาว", sub: "คอร์ส Open Water" },
  ],
  links: { redeem: "/app/sys/s1/member/members/c1?tab=wallet", points: "/app/sys/s1/member/points/adjust", voucher: "/app/sys/s1/member/promotions/vouchers" },
  canStamp: true,
};
const CARD = { cardId: "k1", name: "ดำน้ำครบ 10 ไดฟ์ฟรี 1", slots: 10, stamps: 7, pinRequired: true, reward: "ดำน้ำฟรี 1 ไดฟ์" };
const STAMP_OK = { card: { ...CARD, stamps: 8 }, completed: false, banner: "ประทับสำเร็จ · 8/10 · อีก 2 ครั้ง ได้ดำน้ำฟรี 1 ไดฟ์" };

function mock(method, path) {
  if (path === "/api/mobile/me") return ME;
  if (path === "/api/mobile/usage") return { used: 12, limit: 100, pct: 12 };
  if (path === "/api/mobile/member/search") return SEARCH;
  if (path === "/api/mobile/member/scan" && method === "POST") return { member: M1 };
  if (path === "/api/mobile/member/summary") return SUMMARY;
  if (path === "/api/mobile/member/stamp" && method === "GET") return { cards: [CARD] };
  if (path === "/api/mobile/member/stamp" && method === "POST") return STAMP_OK;
  if (path === "/api/mobile/push" || path.startsWith("/api/mobile/push/")) return { ok: true };
  return null;
}

// ───────────────────────── จอที่ถ่าย ─────────────────────────
const SCREENS = [
  {
    name: "member-search",
    path: "/member",
    expect: ["member-search", "member-scan", "member-result-0", "member-result-2"],
    run: async (page) => {
      await page.waitForSelector('[data-testid="member-search"]', { timeout: 30000 });
      await page.click('[data-testid="member-search"]');
      await page.type('[data-testid="member-search"]', "สม");
      await page.waitForSelector('[data-testid="member-result-0"]', { timeout: 15000 });
    },
  },
  {
    name: "member-summary",
    path: "/member/c1",
    expect: ["member-summary", "member-summary-stats", "member-action-stamp", "member-action-redeem", "member-action-points", "member-action-voucher", "member-history"],
    run: async (page) => {
      await page.waitForSelector('[data-testid="member-history"]', { timeout: 30000 });
    },
  },
  {
    name: "member-stamp",
    path: "/member/stamp?customerId=c1&name=" + encodeURIComponent("สมชาย ใจดี"),
    expect: ["member-stamp-card", "member-stamp-pin", "member-stamp-submit", "member-stamp-banner"],
    run: async (page) => {
      await page.waitForSelector('[data-testid="member-stamp-pin"]', { timeout: 30000 });
      await page.click('[data-testid="member-stamp-pin"]');
      await page.type('[data-testid="member-stamp-pin"]', "1234");
      await page.click('[data-testid="member-stamp-submit"]');
      await page.waitForSelector('[data-testid="member-stamp-banner"]', { timeout: 15000 });
    },
  },
  {
    // ทางเข้า: ปุ่ม ☰ บนจอค้นต้องเปิด Drawer ได้จริง และ Drawer มีเมนู "สมาชิก" (ไม่ใช้ @react-navigation ตรง — SDK 56+)
    name: "member-drawer",
    path: "/member",
    expect: ["drawer-member"],
    run: async (page) => {
      await page.waitForSelector('[aria-label="เปิดเมนู"]', { timeout: 30000 });
      await page.click('[aria-label="เปิดเมนู"]');
      await page.waitForSelector('[data-testid="drawer-member"]', { visible: true, timeout: 15000 });
    },
  },
];

const VIEW = { tag: "iphone", w: 390, h: 844 };
const browser = await puppeteer.launch({ executablePath: "/usr/bin/chromium-browser", headless: true, args: ["--no-sandbox", "--disable-gpu", "--font-render-hinting=none"] });
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
    const ok = errors.length === 0 && missing.length === 0 && !overflow;
    results.push({ name: s.name, ok, errors, missing, overflow, unmocked, url: page.url().replace(BASE, ""), file });
    await page.close();
  }
} finally {
  await browser.close();
  if (server) server.close();
}
writeFileSync(join(OUT, "summary.json"), JSON.stringify({ generatedAt: new Date().toISOString(), base: BASE, view: VIEW, screens: results }, null, 1));
console.log(JSON.stringify(results.map((r) => ({ name: r.name, ok: r.ok, errors: r.errors, missing: r.missing, overflow: r.overflow, unmocked: r.unmocked })), null, 1));
process.exit(results.every((r) => r.ok) ? 0 : 1);
