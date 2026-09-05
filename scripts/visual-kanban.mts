// ถ่ายภาพหน้าจอจริงของ "บอร์ดงาน" (RUN kanban→Trello) — เดสก์ท็อป 1440×900 + มือถือ 390×844 (fullPage)
//
// ใช้:
//   bash scripts/acc-v2-serve.sh                 # production build บน .env.qc :3215 (ต้องมีก่อน)
//   pnpm exec tsx scripts/visual-kanban.mts 1.5  # ถ่ายชุดของ WO K1.5 (ดู SPECS ด้านล่าง)
//   pnpm exec tsx scripts/visual-kanban.mts 1.5 --user thana   # ถ่ายในสายตา STAFF (default owner)
//   pnpm exec tsx scripts/visual-kanban.mts path /app/sys/<sys>/kanban/boards  # หน้าเดียวตามใจ
//   bash scripts/acc-v2-serve.sh stop
//
// 🔴 ชื่อไฟล์จงใจไม่ขึ้นต้น qc- (ต้อง build+server+chromium — ไม่เข้า qc:all)
// 🔴 session ที่ mint ต้องถูกลบเสมอ — ปักธง userAgent = "qc-visual-kanban" (ลบใน finally)
// 🔴 ชื่อคุกกี้ผูกกับ APP_ENV: http = `shark_session` · https = `__Host-shark_session`
// ขั้น "ลาก/คลิก/พิมพ์" ทำผ่าน puppeteer บน production build (dev ไม่ hydrate ใน headless — บทเรียน 13 ส.ค.)

import { existsSync, mkdirSync, readFileSync } from "node:fs";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
const kq = (await import("./kanban-qc-env.mts" as string)) as { KQC: Any };
const { KQC } = kq;
const { prisma } = await import("@/lib/core/db");
const { sha256 } = await import("@/lib/core/hash");

const argv = process.argv.slice(2);
const WO = argv[0] ?? "1.5";
const userKey = argv.includes("--user") ? argv[argv.indexOf("--user") + 1]! : "owner";
const BASE = process.env.QC_BASE ?? "http://127.0.0.1:3215";
const OUT = `${KQC.shotsDir}/${WO}`;
mkdirSync(OUT, { recursive: true });
if (!existsSync(KQC.expectedPath)) { console.error(`❌ ไม่พบเฉลย ${KQC.expectedPath} — รัน seed ก่อน`); process.exit(2); }
const E = JSON.parse(readFileSync(KQC.expectedPath, "utf8"));
const SYS: string = E.systemId;
const B = (k: "patong" | "maint" | "kata") => E.boards[k].id as string;

type Step =
  | { click: string }
  | { fill: string; value: string }
  | { press: string }
  | { waitFor: string; timeoutMs?: number }
  | { drag: { from: string; to: string; steps?: number } }
  | { wait: number }
  | { swipe: { on: string; dx: number } };
type Spec = { name: string; path: string; note?: string; steps?: Step[]; onlyDevice?: "desktop" | "mobile"; expect?: string[] };

const SPECS: Record<string, Spec[]> = {
  // K1.5 — หน้าบอร์ดใหม่ + ลากวาง (เทียบภาพ 02)
  "1.5": [
    { name: "boards-home", path: `/app/sys/${SYS}/kanban/boards`, note: "หน้ารวมบอร์ดปัจจุบัน (ยังไม่ใช่แบบใหม่จนกว่า K1.12)" },
    { name: "board-patong", path: `/app/sys/${SYS}/kanban/b/${B("patong")}`, note: "เทียบ mockup 02: หัวบอร์ด · รางไอคอน · คอลัมน์ 240px · การ์ดมีตรา", expect: ["[data-testid=board-header]", "[data-testid=column]", "[data-testid=card]"] },
    { name: "board-patong-dragged", path: `/app/sys/${SYS}/kanban/b/${B("patong")}`, onlyDevice: "desktop", note: "ลากการ์ดใบแรกของคอลัมน์ 1 ไปวางระหว่างใบ 1-2 ของคอลัมน์ 3 แล้วถ่ายทันที (optimistic) → โหลดใหม่ต้องคง", steps: [{ waitFor: "[data-testid=card]" }, { drag: { from: "[data-testid=column]:nth-of-type(1) [data-testid=card]:nth-of-type(1)", to: "[data-testid=column]:nth-of-type(3) [data-testid=card]:nth-of-type(2)" } }, { wait: 800 }] },
    { name: "board-patong-after-reload", path: `/app/sys/${SYS}/kanban/b/${B("patong")}`, onlyDevice: "desktop", note: "โหลดใหม่หลังลาก — การ์ดต้องอยู่ที่วางไว้" },
    { name: "board-maint", path: `/app/sys/${SYS}/kanban/b/${B("maint")}`, note: "บอร์ด TENANT 4 คอลัมน์" },
    { name: "my-tasks", path: `/app/sys/${SYS}/kanban/my-tasks`, note: "งานของฉัน (แบบเดิมจนกว่า K1.13)" },
  ],
  // K1.6 — หลังการ์ด (เทียบภาพ 03)
  "1.6": [
    { name: "card-back", path: `/app/sys/${SYS}/kanban/b/${B("patong")}?card=${E.boards.patong.cardIds[6]}`, note: "เปิดหลังการ์ดตรงจาก URL", expect: ["[data-testid=card-back]"] },
    { name: "card-back-edit-title", path: `/app/sys/${SYS}/kanban/b/${B("patong")}?card=${E.boards.patong.cardIds[6]}`, onlyDevice: "desktop", steps: [{ waitFor: "[data-testid=card-back]" }, { click: "[data-testid=card-title]" }, { fill: "[data-testid=card-title-input]", value: "ทำใบเสนอราคาทริปเรือ Sea Fox — แก้ชื่อผ่าน QC" }, { press: "Enter" }, { wait: 800 }] },
  ],
  "1.12": [
    { name: "boards-home-new", path: `/app/sys/${SYS}/kanban/boards`, note: "เทียบ mockup 01: ดาว · จัดกลุ่มสาขา · แถวเทมเพลต", expect: ["[data-testid=boards-starred]", "[data-testid=templates-row]"] },
  ],
  "1.13": [
    { name: "mobile-board", path: `/app/sys/${SYS}/kanban/b/${B("patong")}`, onlyDevice: "mobile", note: "เทียบภาพ 07(ก)" },
    { name: "mobile-card-back", path: `/app/sys/${SYS}/kanban/b/${B("patong")}?card=${E.boards.patong.cardIds[6]}`, onlyDevice: "mobile", note: "เทียบภาพ 07(ข)" },
    { name: "mobile-my-tasks", path: `/app/sys/${SYS}/kanban/my-tasks`, onlyDevice: "mobile", note: "เทียบภาพ 07(ค)/06" },
  ],
};
const specs: Spec[] = WO === "path" ? [{ name: "custom", path: argv[1]! }] : (SPECS[WO] ?? []);
if (specs.length === 0) { console.error(`❌ ไม่มี spec ของ WO ${WO}`); process.exit(2); }

// ── mint session ของผู้ใช้ที่เลือก ──
const email = userKey === "owner" ? KQC.ownerEmail : userKey === "manager" ? KQC.managerEmail : userKey === "noperm" ? KQC.noPermEmail : (KQC.staff.find((s: Any) => s.key === userKey)?.email ?? KQC.ownerEmail);
const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
if (!user) { console.error(`❌ ไม่พบผู้ใช้ ${email}`); process.exit(2); }
const UA = "qc-visual-kanban";
const token = "kb" + Math.random().toString(36).slice(2) + Date.now().toString(36);
const ttl = new Date(Date.now() + 60 * 60 * 1000);
await prisma.session.create({ data: { userId: user.id, tokenHash: sha256(token), userAgent: UA, idleExpiresAt: ttl, expiresAt: ttl } });

let failures = 0;
const shots: string[] = [];
try {
  const pptr = await import("/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js" as string);
  const browser = await pptr.default.launch({
    executablePath: "/usr/bin/chromium-browser",
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", `--user-data-dir=/tmp/chr-kanban-${process.pid}`],
  });
  try {
    const https = BASE.startsWith("https:");
    const host = new URL(BASE).hostname;
    const cookies = https
      ? [{ name: "__Host-shark_session", value: token, url: BASE, path: "/", secure: true }, { name: "shark_tenant", value: E.tenantId, url: BASE, path: "/", secure: true }]
      : [{ name: "shark_session", value: token, domain: host, path: "/" }, { name: "shark_tenant", value: E.tenantId, domain: host, path: "/" }];
    for (const spec of specs) {
      for (const [device, w, h] of [["desktop", 1440, 900], ["mobile", 390, 844]] as const) {
        if (spec.onlyDevice && spec.onlyDevice !== device) continue;
        const page = await browser.newPage();
        await page.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: device === "mobile", hasTouch: device === "mobile" });
        await page.setCookie(...cookies);
        const errors: string[] = [];
        page.on("pageerror", (e: Error) => errors.push(e.message.slice(0, 120)));
        page.on("console", (m: Any) => { if (m.type() === "error") errors.push(String(m.text()).slice(0, 120)); });
        const resp = await page.goto(`${BASE}${spec.path}`, { waitUntil: "domcontentloaded", timeout: 60_000 }).catch(() => null);
        await new Promise((r) => setTimeout(r, 1200)); // ให้ hydrate
        for (const step of spec.steps ?? []) {
          try {
            if ("waitFor" in step) await page.waitForSelector(step.waitFor, { timeout: step.timeoutMs ?? 10_000 });
            else if ("click" in step) await page.click(step.click);
            else if ("fill" in step) { await page.click(step.fill, { clickCount: 3 }); await page.keyboard.type(step.value, { delay: 15 }); }
            else if ("press" in step) await page.keyboard.press(step.press as Any);
            else if ("wait" in step) await new Promise((r) => setTimeout(r, step.wait));
            else if ("drag" in step) {
              const from = await page.$(step.drag.from); const to = await page.$(step.drag.to);
              if (!from || !to) throw new Error(`ไม่พบ element สำหรับลาก ${!from ? step.drag.from : step.drag.to}`);
              const a = (await from.boundingBox())!; const b = (await to.boundingBox())!;
              const sx = a.x + a.width / 2, sy = a.y + a.height / 2, tx = b.x + b.width / 2, ty = b.y + 8; // วางเหนือใบเป้าหมาย
              await page.mouse.move(sx, sy); await page.mouse.down();
              await new Promise((r) => setTimeout(r, 350)); // กดค้าง (มือถือ 300ms)
              const n = step.drag.steps ?? 12;
              for (let i = 1; i <= n; i++) { await page.mouse.move(sx + ((tx - sx) * i) / n, sy + ((ty - sy) * i) / n); await new Promise((r) => setTimeout(r, 30)); }
              await page.mouse.up();
            } else if ("swipe" in step) {
              const el = await page.$(step.swipe.on); const bb = (await el!.boundingBox())!;
              const y = bb.y + bb.height / 2; const x0 = bb.x + bb.width / 2;
              await page.touchscreen.touchStart(x0, y); for (let i = 1; i <= 8; i++) await page.touchscreen.touchMove(x0 + (step.swipe.dx * i) / 8, y); await page.touchscreen.touchEnd();
            }
          } catch (e) { failures++; console.log(`  ❌ step ${JSON.stringify(step).slice(0, 80)} — ${e instanceof Error ? e.message.slice(0, 120) : e}`); }
        }
        await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
        await new Promise((r) => setTimeout(r, 250));
        const file = `${OUT}/${spec.name}-${device}.png`;
        await page.screenshot({ path: file, fullPage: true });
        shots.push(file);
        const missing: string[] = [];
        for (const sel of spec.expect ?? []) { if (!(await page.$(sel))) missing.push(sel); }
        const status = resp?.status() ?? 0;
        const ok = status < 400 && missing.length === 0 && errors.length === 0;
        if (!ok) failures++;
        console.log(`  ${ok ? "✅" : "❌"} ${spec.name} [${device}] HTTP ${status} → ${file}${missing.length ? ` · ไม่พบ ${missing.join(",")}` : ""}${errors.length ? ` · console error ${errors.length}: ${errors[0]}` : ""}${spec.note ? `\n       ↳ ${spec.note}` : ""}`);
        await page.close();
      }
    }
  } finally { await browser.close(); }
} finally {
  const { count } = await prisma.session.deleteMany({ where: { userAgent: UA } });
  await prisma.$disconnect();
  console.log(`\n🧹 ลบ session QC ${count} · ภาพ ${shots.length} ใบใน ${OUT}`);
}
console.log(`JSON_SUMMARY ${JSON.stringify({ wo: WO, user: userKey, shots, failures })}`);
process.exit(failures > 0 ? 1 : 0);
