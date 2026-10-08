// visual-hr.mts — ถ่ายภาพหน้าจอจริงของหน้า HR (RUN HR V2 · ใบ H0.4 R4) — 1440×900 · 1024×768 · 390×844 (fullPage)
//
// ใช้:
//   pnpm exec tsx scripts/visual-hr.mts all --dry --user owner                       # พิมพ์ตาราง หน้า × ขนาดจอ (ไม่แตะ DB/เซิร์ฟเวอร์)
//   bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 \
//     pnpm exec tsx scripts/visual-hr.mts 0.4 --user staff --base http://127.0.0.1:3226  # ถ่ายจริง (CONTROLLER-RUN)
//   ผู้ใช้: owner · manager · payroll · staff · kiosk · member (HQC.users) · ต้อง seed-hr-qc ก่อน (อ่าน scripts/hr-expected.json)
//   ใบ UI หลัง ๆ ลงทะเบียนหน้าของตัวเองใน SPECS["<wo>"] (SPECS["0.4"] = ทุกหน้าของวันนี้)
//
// 🔴 CONTROLLER-RUN: เซิร์ฟเวอร์ = `ACC_V2_PORT=3226 bash scripts/acc-v2-serve.sh start` (production build) — builder ส่งแค่ --dry
// 🔴 ไม่มี --base (และไม่ใช่ --dry) / ต่อ --base ไม่ได้ ⇒ exit 2 ทันทีพร้อมเหตุผล (ไม่โหลด env · ไม่แตะ DB · < 5 วิ)
// 🔴 session ที่ mint ปักธง userAgent = "qc-visual-hr" และลบ **เฉพาะแถวของรอบนี้** ใน finally ·
//    ไม่มี process.exit() ในกรอบ try (exit ข้าม finally = token ค้างในฐาน QC ที่ใช้ร่วมกัน) — ใช้ Fatal + exitCode
// 🔴 ล้นแนวนอน (scrollWidth > clientWidth ของ documentElement หรือ body) = ❌ (กติกา visual-crm) · HTTP 0/5xx = ❌ ·
//    4xx = ⚠️ (บางบทบาทถูกกันออกโดยตั้งใจ — บันทึกไว้ให้ผู้คุมงานดู) · console error = บันทึก + ⚠️
// 🔴 ชื่อคุกกี้ผูกกับโปรโตคอล: http = `shark_session` · https = `__Host-shark_session` (+ `shark_tenant`)
// 🔴 โปรไฟล์ chromium `/tmp/chr-hr-<pid>` (+ คู่ใน snap-private-tmp) ลบใน finally เสมอ

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { HQC, type HqcUserKey } from "./hr-qc-env.mjs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

// ═══════════════════ 1. args (ก่อนแตะ env/DB ใด ๆ) ═══════════════════
const argv = process.argv.slice(2);
const opt = (k: string) => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv[i + 1] : undefined;
};
const DRY = argv.includes("--dry");
const WO = argv[0] && !argv[0].startsWith("--") ? argv[0] : "";
const USER = (opt("--user") ?? "owner") as HqcUserKey;
const BASE = (opt("--base") ?? "").replace(/\/$/, "");
const USERS = Object.keys(HQC.users) as HqcUserKey[];

type Ids = { hr: string; namfon: string; paidRun: string };
type PageSpec = { key: string; path: (ids: Ids) => string; users: readonly HqcUserKey[] | "all"; why: string };
/** หน้าที่มีอยู่จริงวันนี้ (7 page.tsx ของ HR) */
const PAGES: readonly PageSpec[] = [
  { key: "employees", path: (i) => `/app/sys/${i.hr}/hr/employees`, users: "all", why: "ทะเบียนพนักงาน" },
  { key: "employee-namfon", path: (i) => `/app/sys/${i.hr}/hr/employees/${i.namfon}`, users: "all", why: "โปรไฟล์น้ำฝน (ช่องอ่อนไหวตามผู้ดู)" },
  { key: "attendance", path: (i) => `/app/sys/${i.hr}/hr/attendance`, users: "all", why: "ลงเวลา" },
  { key: "leave", path: (i) => `/app/sys/${i.hr}/hr/leave`, users: "all", why: "ใบลา" },
  { key: "kiosk", path: (i) => `/app/sys/${i.hr}/hr/kiosk`, users: "all", why: "kiosk PIN" },
  { key: "payroll", path: (i) => `/app/sys/${i.hr}/hr/payroll`, users: "all", why: "เงินเดือน (เห็นเฉพาะผู้ดูเงินเดือน)" },
  { key: "slip-namfon", path: (i) => `/app/sys/${i.hr}/payroll/${i.paidRun}/slip/${i.namfon}`, users: ["owner", "staff"], why: "สลิปน้ำฝน (เจ้าของ + ตัวน้ำฝนเอง)" },
];
/** ชุดหน้าต่อใบงาน — ใบ UI หลัง ๆ เพิ่มของตัวเอง (เช่น SPECS["2.5"] = [หน้าลงเวลาใหม่]) */
const SPECS: Record<string, readonly PageSpec[]> = {
  "0.4": PAGES,
};
const VIEWPORTS = [
  { name: "desktop", w: 1440, h: 900, mobile: false, touch: false },
  { name: "ipad", w: 1024, h: 768, mobile: false, touch: true },
  { name: "mobile", w: 390, h: 844, mobile: true, touch: true },
] as const;

function die(msg: string): never {
  console.error(`❌ visual-hr: ${msg}`);
  process.exit(2);
}
if (!WO) die(`ต้องระบุใบงาน: ${[...Object.keys(SPECS), "all"].join(" · ")} — เช่น pnpm exec tsx scripts/visual-hr.mts all --dry --user owner`);
if (WO !== "all" && !SPECS[WO]) die(`ใบงาน "${WO}" ยังไม่มีใน SPECS (มี: ${Object.keys(SPECS).join(" · ")} · all)`);
if (!USERS.includes(USER)) die(`--user ${USER} ไม่รู้จัก — ใช้ได้: ${USERS.join(" · ")}`);
const spec = (WO === "all" ? PAGES : SPECS[WO]!).filter((p) => p.users === "all" || p.users.includes(USER));
const OUT = `${HQC.shotsDir}/${WO === "all" ? "all" : WO}`;
const fileOf = (p: PageSpec, v: (typeof VIEWPORTS)[number]) => `${OUT}/${p.key}-${USER}-${v.w}x${v.h}.png`;

// ═══════════════════ 2. --dry: พิมพ์ตารางแล้วจบ (ไม่มี env · DB · เซิร์ฟเวอร์) ═══════════════════
if (DRY) {
  const ph: Ids = { hr: "<hr>", namfon: "<น้ำฝน>", paidRun: "<paidRun>" };
  console.log(`🧪 visual-hr --dry · ใบ ${WO} · ผู้ใช้ ${USER} (${HQC.users[USER].role}) · ${spec.length} หน้า × ${VIEWPORTS.length} ขนาดจอ = ${spec.length * VIEWPORTS.length} ภาพ`);
  for (const p of spec) {
    console.log(`  ${p.key.padEnd(16)} ${p.path(ph)}   — ${p.why}`);
    for (const v of VIEWPORTS) console.log(`      ${v.name.padEnd(8)} ${String(v.w).padStart(4)}×${String(v.h).padEnd(4)} → ${fileOf(p, v)}`);
  }
  const skipped = PAGES.filter((p) => !spec.includes(p) && (WO === "all" || SPECS[WO]!.includes(p)));
  for (const p of skipped) console.log(`  ⏭  ${p.key} — ไม่ถ่ายด้วย ${USER} (${p.why})`);
  console.log(`DRY_SUMMARY ${JSON.stringify({ wo: WO, user: USER, pages: spec.length, viewports: VIEWPORTS.length, shots: spec.length * VIEWPORTS.length })}`);
  process.exit(0);
}

// ═══════════════════ 3. ต้องมีเซิร์ฟเวอร์ที่ต่อได้ (ก่อนโหลด env) ═══════════════════
if (!BASE) die("ไม่ได้ส่ง --base http://127.0.0.1:<port> (เซิร์ฟเวอร์ QC เป็นงาน CONTROLLER-RUN · ใช้ --dry เพื่อดูตาราง)");
if (/:3215\b|:3225\b/.test(BASE)) die(`--base ${BASE} เป็นพอร์ตของเลนอื่น (3215 = CRM · 3225 = POS) — ใช้พอร์ตของ HR เช่น 3226`);
{
  const ping = await fetch(BASE, { redirect: "manual", signal: AbortSignal.timeout(4_000) }).catch((e: unknown) => e as Error);
  if (ping instanceof Error) die(`ต่อเซิร์ฟเวอร์ ${BASE} ไม่ได้ (${ping.message}) — ให้ผู้คุมงานเปิด ACC_V2_PORT=3226 bash scripts/acc-v2-serve.sh start`);
}

// ═══════════════════ 4. env + เฉลย ═══════════════════
const envMod = await import("./hr-qc-env.mjs");
await envMod.loadHrQcEnv("visual-hr");
if (!existsSync(HQC.expectedPath)) die(`ไม่พบ ${HQC.expectedPath} — รัน seed-hr-qc ก่อน`);
const E = JSON.parse(readFileSync(HQC.expectedPath, "utf8")) as Any;
const { prisma } = (await import("@/lib/core/db" as string)) as Any;
const { sha256 } = (await import("@/lib/core/hash" as string)) as Any;
const scope = await envMod.findQcTenant(prisma);
if (!scope || scope.tenantId !== E.tenant?.id) {
  await prisma.$disconnect?.();
  die(`เฉลย ${HQC.expectedPath} ไม่ตรงกับฐาน (ร้านในฐาน ${scope?.tenantId ?? "ไม่มี"} · เฉลย ${E.tenant?.id}) — รัน seed-hr-qc ใหม่`);
}
const IDS: Ids = { hr: E.systems.HR, namfon: E.employees.namfon, paidRun: E.paidRun.id };
mkdirSync(OUT, { recursive: true });

// ═══════════════════ 5. ถ่าย ═══════════════════
const UA = "qc-visual-hr";
class Fatal extends Error {}
const MINE: string[] = []; // id แถว session ของรอบนี้เท่านั้น
type Shot = { page: string; user: string; viewport: string; path: string; file: string; status: number; finalUrl: string; consoleErrors: string[]; overflow: { html: boolean; body: boolean; scrollWidth: number; clientWidth: number }; ok: boolean; note?: string };
const shots: Shot[] = [];
let fatal = "";
const PROFILE = `/tmp/chr-hr-${process.pid}`;

async function mintSession(key: HqcUserKey): Promise<Any[]> {
  const userId: string | undefined = E.users?.[key]?.userId;
  if (!userId) throw new Fatal(`เฉลยไม่มีผู้ใช้ ${key}`);
  const token = "hrv" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  const ttl = new Date(Date.now() + 60 * 60 * 1000);
  const row = await prisma.session.create({ data: { userId, tokenHash: sha256(token), userAgent: UA, idleExpiresAt: ttl, expiresAt: ttl }, select: { id: true } });
  MINE.push(row.id);
  const https = BASE.startsWith("https:");
  const host = new URL(BASE).hostname;
  return https
    ? [{ name: "__Host-shark_session", value: token, url: BASE, path: "/", secure: true }, { name: "shark_tenant", value: E.tenant.id, url: BASE, path: "/", secure: true }]
    : [{ name: "shark_session", value: token, domain: host, path: "/" }, { name: "shark_tenant", value: E.tenant.id, domain: host, path: "/" }];
}

try {
  const cookies = await mintSession(USER);
  const pptr = (await import("/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js" as string)) as Any;
  const browser = await pptr.default.launch({ executablePath: "/usr/bin/chromium-browser", args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", `--user-data-dir=${PROFILE}`] });
  try {
    for (const p of spec) {
      const path = p.path(IDS);
      for (const v of VIEWPORTS) {
        const page = await browser.newPage();
        const cErr: string[] = [];
        try {
          await page.setViewport({ width: v.w, height: v.h, deviceScaleFactor: 1, isMobile: v.mobile, hasTouch: v.touch });
          // tsx (esbuild keepNames) ห่อฟังก์ชันด้วย __name(...) — ในเบราว์เซอร์ไม่มี ⇒ ใส่ตัวว่าง
          await page.evaluateOnNewDocument("window.__name = function (f) { return f; };");
          await page.setCookie(...cookies);
          page.on("pageerror", (e: Error) => cErr.push(e.message.slice(0, 160)));
          page.on("console", (m: Any) => {
            if (m.type() === "error") cErr.push(String(m.text()).slice(0, 160));
          });
          const resp = await page.goto(`${BASE}${path}`, { waitUntil: "networkidle2", timeout: 60_000 }).catch(() => null);
          await new Promise((r) => setTimeout(r, 600));
          const ov = (await page.evaluate(() => {
            const d = document.documentElement;
            const b = document.body;
            return { html: d.scrollWidth > d.clientWidth, body: !!b && b.scrollWidth > b.clientWidth, scrollWidth: Math.max(d.scrollWidth, b?.scrollWidth ?? 0), clientWidth: d.clientWidth };
          })) as Shot["overflow"];
          const file = fileOf(p, v);
          await page.screenshot({ path: file, fullPage: true });
          const status = resp?.status() ?? 0;
          const ok = !ov.html && !ov.body && status > 0 && status < 500;
          shots.push({ page: p.key, user: USER, viewport: `${v.w}x${v.h}`, path, file, status, finalUrl: page.url().replace(BASE, ""), consoleErrors: cErr, overflow: ov, ok, ...(status >= 400 && status < 500 ? { note: "4xx — ตรวจว่าตั้งใจกันบทบาทนี้" } : {}) });
          const mark = !ok ? "❌" : cErr.length || status >= 400 ? "⚠️ " : "✅";
          console.log(`  ${mark} ${p.key} [${USER} ${v.w}×${v.h}] HTTP ${status}${ov.html || ov.body ? ` · ล้นแนวนอน ${ov.scrollWidth}>${ov.clientWidth}` : ""}${cErr.length ? ` · console error ${cErr.length}` : ""} → ${file}`);
        } finally {
          await page.close().catch(() => {});
        }
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }
} catch (e) {
  fatal = e instanceof Fatal ? e.message : `ผิดพลาดกลางคัน — ${e instanceof Error ? (e.stack ?? e.message).slice(0, 400) : String(e)}`;
} finally {
  for (const d of [PROFILE, `/tmp/snap-private-tmp/snap.chromium/tmp/chr-hr-${process.pid}`]) {
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      /* ไม่มี/ไม่มีสิทธิ์ */
    }
  }
  const del = MINE.length ? (await prisma.session.deleteMany({ where: { id: { in: MINE }, userAgent: UA } })).count : 0;
  console.log(`🧹 ลบ session ของรอบนี้ ${del}/${MINE.length}`);
  await prisma.$disconnect?.();
}

const bad = shots.filter((s) => !s.ok);
writeFileSync(`${OUT}/summary.json`, JSON.stringify({ wo: WO, user: USER, base: BASE, at: new Date().toISOString(), fatal: fatal || null, shots }, null, 1) + "\n");
if (fatal) console.error(`❌ ${fatal}`);
console.log(`\nJSON_SUMMARY ${JSON.stringify({ suite: "visual-hr", wo: WO, user: USER, total: shots.length, passed: shots.length - bad.length, findings: bad.map((s) => `${s.page}@${s.viewport}: HTTP ${s.status}${s.overflow.html || s.overflow.body ? " overflow" : ""}`), fatal: fatal || null })}`);
process.exit(fatal || bad.length ? 1 : 0);
