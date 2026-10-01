// visual-pos.mts — ถ่ายภาพหน้าจอจริงของ POS 3 ขนาด (RUN POS · ใบ P0.1)
//
// ใช้:
//   pnpm exec tsx scripts/visual-pos.mts <wo|all> --user owner|cashier --base http://127.0.0.1:<port> [--tenant coffee|resto] [--page register]
//   pnpm exec tsx scripts/visual-pos.mts all --user cashier --dry        # พิมพ์แผนการถ่าย (ไม่ต่อ DB · ไม่ต่อเซิร์ฟเวอร์ · ไม่เปิด chromium)
//   ฐานข้อมูลของ "เซิร์ฟเวอร์" ต้องเป็นฐานเดียวกับที่สคริปต์นี้ mint session (ระหว่าง CRM RUN = QC4):
//   bash scripts/iso.sh bash scripts/qc4.sh pnpm exec tsx scripts/visual-pos.mts all --user owner --base http://127.0.0.1:<port>
//
// ถ่ายอะไร: หน้าที่มีจริงวันนี้ `/app/sys/[id]/pos/{register,sales,products,close}` (POS_PAGES) ×
//   1440×900 · 1024×768 (iPad แนวนอน) · 390×844 → `.qc-shots/pos/<wo>/<page>-<user>-<w>x<h>.png`
//   บันทึกต่อภาพ: HTTP status เทียบ PAGE_EXPECT (owner 200 · cashier บันทึกอย่างเดียว) · URL ปลายทาง (เด้งไป /login = mint ไม่ติด) ·
//   console error · ล้นแนวนอนที่ html/body/main (scrollWidth > clientWidth) · คำขอย่อย 5xx = ตก (4xx บันทึกอย่างเดียว)
//   <wo> รับเฉพาะ ^[A-Za-z0-9._-]+$ ไม่มี '..' · SIGINT/SIGTERM/SIGHUP = ทำความสะอาดแบบเดียวกับ finally ก่อนออก
//   ท้ายสุด `JSON_SUMMARY {...}` + `.qc-shots/pos/<wo>/summary-<user>.json`
//
// 🔴 ไม่มีค่าปริยายของ base — ไม่ส่ง `--base`/`QC_BASE` = exit 2 · ต่อไม่ได้ = exit 2 · `:3215` = exit 2
//    (พอร์ต 3215 เป็นของเซิร์ฟเวอร์ CRM RUN — LANE-RULES ข้อ 4 · ตั้ง POS_VISUAL_ALLOW_3215=1 เมื่อ CRM ปิดแล้วเท่านั้น)
// 🔴 ชื่อไฟล์จงใจไม่ขึ้นต้น qc- (ต้องมีเซิร์ฟเวอร์ + chromium — ไม่เข้า qc:all)
// 🔴 session ที่ mint ต้องถูกลบเสมอ: ปักธง userAgent `qc-visual-pos` · ลบ "เฉพาะ id ของรอบนี้" ใน finally + กวาดซากที่หมดอายุแล้ว
//    (ห้าม process.exit() ระหว่าง mint→finally — exit ข้าม finally = token ค้างในฐาน QC)
// 🔴 โปรไฟล์ chromium (`/tmp/chr-pos-<pid>` + สำเนาใน snap-private-tmp) ลบทุกครั้ง ทั้งจบปกติ/ตาย/ถูก Ctrl-C
//    (snap chromium ทิ้งโปรไฟล์ ~GB ต่อรอบ — เคยทำดิสก์ VPS 99%) · ลบเฉพาะของ pid นี้ ห้ามกวาด /tmp

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { PQC, POS_PAGES, POS_VIEWPORTS, type PosPage } from "./pos-qc-env.mjs";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

// ═══════════════════ 1. อาร์กิวเมนต์ ═══════════════════
const argv = process.argv.slice(2);
const flag = (name: string): string | null => (argv.includes(name) ? (argv[argv.indexOf(name) + 1] ?? null) : null);
const DRY = argv.includes("--dry");
const WO = argv[0] && !argv[0].startsWith("--") ? argv[0] : null;
const USERS = ["owner", "cashier"] as const;
type UserKey = (typeof USERS)[number];
const userKey = (flag("--user") ?? "owner") as UserKey;
const tenantKey = (flag("--tenant") ?? "coffee") as "coffee" | "resto";
const onlyPage = flag("--page");

function die(msg: string): never {
  console.error(`❌ ${msg}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ wo: WO, user: userKey, shots: [], failures: 0, fatal: msg })}`);
  process.exit(2);
}
if (!WO) die("ต้องระบุ <wo|all> เป็นอาร์กิวเมนต์แรก เช่น `visual-pos.mts p1.3 --user owner --base http://127.0.0.1:3300`");
// wo กลายเป็นชื่อโฟลเดอร์ใต้ .qc-shots/pos — รับเฉพาะตัวอักษรปลอดภัย ห้าม `..` (กันเขียนไฟล์ออกนอกโฟลเดอร์)
if (!/^[A-Za-z0-9._-]+$/.test(WO) || WO.includes("..")) die(`<wo> "${WO}" ไม่ถูกต้อง — ใช้ได้เฉพาะ A-Z a-z 0-9 . _ - และห้ามมี ".."`);
if (!(USERS as readonly string[]).includes(userKey)) die(`--user ${userKey} ไม่รู้จัก — ใช้ได้: ${USERS.join(" · ")}`);
if (tenantKey !== "coffee" && tenantKey !== "resto") die(`--tenant ${tenantKey} ไม่รู้จัก — ใช้ได้: coffee · resto`);
if (onlyPage && !(POS_PAGES as readonly string[]).includes(onlyPage)) die(`--page ${onlyPage} ไม่รู้จัก — ใช้ได้: ${POS_PAGES.join(" · ")}`);

const T = PQC[tenantKey];
const U = T.users[userKey];
// สาขาที่ผู้ใช้เข้าได้ (แคชเชียร์ = สาขาเดียว) — ใส่ ?unit= ให้หน้าขายเปิดสาขาที่ถูก
const unitKey = U.units[0] === "*" ? Object.keys(T.units)[0]! : U.units[0]!;
const unitId = (T.units as Record<string, { id: string }>)[unitKey]!.id;
const SYS = T.systems.POS.id;
const pages: PosPage[] = onlyPage ? [onlyPage as PosPage] : [...POS_PAGES];
/**
 * สิ่งที่คาดต่อหน้า ต่อบทบาท (HTTP) — owner ต้องได้ 200 · cashier = "record" (บันทึกอย่างเดียว ไม่ตัดสิน)
 * จนกว่าผู้คุมงานรันจริงครั้งแรกแล้วกำหนด 200|404 ตามพฤติกรรมจริง (มติรอบ 2 · ใบ P1.15/P4.2 เป็นเจ้าของตาราง)
 */
const PAGE_EXPECT: Record<PosPage, Record<UserKey, number | "record">> = {
  register: { owner: 200, cashier: "record" },
  sales: { owner: 200, cashier: "record" },
  products: { owner: 200, cashier: "record" },
  close: { owner: 200, cashier: "record" },
};
const pathOf = (p: PosPage) => `/app/sys/${SYS}/pos/${p}${p === "register" ? `?unit=${unitId}` : ""}`;
const OUT = `${PQC.shotsDir}/${WO}`;
const fileOf = (p: PosPage, w: number, h: number) => `${OUT}/${p}-${userKey}-${w}x${h}.png`;

// ═══════════════════ 2. --dry: แผนการถ่าย (ไม่แตะอะไรเลย) ═══════════════════
const BASE_RAW = flag("--base") ?? process.env.QC_BASE ?? "";
if (DRY) {
  const plan = pages.flatMap((p) => POS_VIEWPORTS.map((v) => ({ page: p, viewport: `${v.w}x${v.h}`, device: v.name, path: pathOf(p), file: fileOf(p, v.w, v.h), expect: PAGE_EXPECT[p][userKey] })));
  console.log(`แผนการถ่าย POS · wo ${WO} · ผู้ใช้ ${userKey} (${U.email}) · ร้าน ${T.slug} · สาขา ${unitKey} · base ${BASE_RAW || "(ยังไม่ระบุ — รันจริงต้องมี --base)"}`);
  for (const s of plan) console.log(`  ${s.page.padEnd(9)} ${s.viewport.padEnd(9)} ${s.device.padEnd(8)} คาด ${String(s.expect).padEnd(6)} ${s.path} → ${s.file}`);
  console.log(`รวม ${pages.length} หน้า × ${POS_VIEWPORTS.length} ขนาด × 1 ผู้ใช้ = ${plan.length} ภาพ`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ wo: WO, user: userKey, tenant: tenantKey, dry: true, pages: pages.length, viewports: POS_VIEWPORTS.length, shots: plan.length, plan })}`);
  process.exit(0);
}

// ═══════════════════ 3. base: ต้องระบุ · ห้าม 3215 · ต้องต่อได้ ═══════════════════
if (!BASE_RAW) die("ไม่ได้ระบุเซิร์ฟเวอร์ — ส่ง `--base http://127.0.0.1:<port>` หรือ QC_BASE (ไม่มีค่าปริยาย · ห้ามใช้ :3215 ของ CRM)");
let BASE: string;
try {
  const u = new URL(BASE_RAW);
  if (u.port === "3215" && process.env.POS_VISUAL_ALLOW_3215 !== "1") die(`${BASE_RAW} คือเซิร์ฟเวอร์ของ CRM RUN (:3215) — POS ห้ามใช้ (LANE-RULES ข้อ 4)`);
  BASE = u.origin;
} catch {
  die(`--base ${BASE_RAW} ไม่ใช่ URL`);
}
{
  const ping = await fetch(BASE, { redirect: "manual", signal: AbortSignal.timeout(8_000) }).catch((e: unknown) => e as Error);
  if (ping instanceof Error) die(`ต่อเซิร์ฟเวอร์ ${BASE} ไม่ได้ (${ping.message}) — ให้ผู้คุมงานเปิดเซิร์ฟเวอร์ QC ของ POS ก่อน (CONTROLLER-RUN)`);
}

// ═══════════════════ 4. env + DB (หลังด่านทั้งหมด — --dry/ไม่มี base ไม่เคยถึงตรงนี้) ═══════════════════
const { loadPosQcEnv } = await import("./pos-qc-env.mjs");
loadPosQcEnv("visual-pos");
const { prisma } = await import("@/lib/core/db");
const { sha256 } = await import("@/lib/core/hash");

const UA = "qc-visual-pos";
const PROFILE_DIRS = [`/tmp/chr-pos-${process.pid}`, `/tmp/snap-private-tmp/snap.chromium/tmp/chr-pos-${process.pid}`];
const cleanProfiles = () => {
  for (const d of PROFILE_DIRS) {
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      /* ไม่มี/ไม่มีสิทธิ์ */
    }
  }
};
class Fatal extends Error {}
const MINE: string[] = [];
let BROWSER: Any = null;
/** ลบ session ที่รอบนี้ mint (เฉพาะ id ของตัวเอง) + ซากที่หมดอายุแล้ว — เรียกได้ซ้ำ (finally และ signal) */
let sessionsCleaned = false;
async function cleanSessions(): Promise<{ removed: number; stale: number }> {
  if (sessionsCleaned) return { removed: 0, stale: 0 };
  sessionsCleaned = true;
  let removed = 0;
  if (MINE.length) removed = (await prisma.session.deleteMany({ where: { id: { in: MINE } } })).count;
  // ซากของรอบที่ถูก kill -9: แท็กเดียวกัน + หมดอายุแล้ว (รอบที่ยังวิ่งมีอายุอีก 1 ชม. จึงไม่โดน)
  const stale = (await prisma.session.deleteMany({ where: { userAgent: UA, expiresAt: { lt: new Date() } } })).count;
  return { removed, stale };
}
// ถูก Ctrl-C/kill/ปิดเทอร์มินัล: ทำความสะอาดแบบเดียวกับ finally (ปิด chromium · ลบ session ของรอบนี้ · ลบโปรไฟล์) แล้วค่อยออก
process.on("exit", cleanProfiles);
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
  process.on(sig, () => {
    console.error(`\n⚠️ ได้รับ ${sig} — ทำความสะอาดก่อนออก`);
    const done = (async () => {
      try {
        await BROWSER?.close();
      } catch {
        /* ปิดไม่ได้ก็ลบโปรไฟล์ต่อ */
      }
      try {
        const r = await cleanSessions();
        console.error(`🧹 ลบ session ${r.removed} (+ซาก ${r.stale})`);
      } catch (e) {
        console.error(`❌ ลบ session ไม่สำเร็จ: ${e instanceof Error ? e.message : e}`);
      }
      cleanProfiles();
    })();
    void done.finally(() => process.exit(130));
  });
}
type Shot = { page: string; viewport: string; file: string; status: number; expect: number | "record"; http5xx: number; finalUrl: string; redirectedToLogin: boolean; overflow: boolean; overflowEl: string | null; consoleErrors: string[]; httpErrors: string[]; ok: boolean };
const shots: Shot[] = [];
let failures = 0;
let fatal = "";
mkdirSync(OUT, { recursive: true });

try {
  // ── mint session (ผู้ใช้ QC id ตายตัวจาก PQC · ต้อง seed-pos-qc ก่อน) ──
  const user = await prisma.user.findUnique({ where: { id: U.userId }, select: { id: true, email: true } });
  if (!user || user.email !== U.email) throw new Fatal(`ไม่พบผู้ใช้ ${U.email} (${U.userId}) ในฐานนี้ — รัน seed-pos-qc บนฐานเดียวกับเซิร์ฟเวอร์ก่อน`);
  const token = "pos" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  const ttl = new Date(Date.now() + 60 * 60 * 1000);
  const row = await prisma.session.create({ data: { userId: user.id, tokenHash: sha256(token), userAgent: UA, idleExpiresAt: ttl, expiresAt: ttl }, select: { id: true } });
  MINE.push(row.id);
  const https = BASE.startsWith("https:");
  const host = new URL(BASE).hostname;
  // ชื่อคุกกี้ผูกกับโปรโตคอล: http = shark_session · https = __Host-shark_session (เหมือน visual-crm)
  const cookies: Any[] = https
    ? [{ name: "__Host-shark_session", value: token, url: BASE, path: "/", secure: true }, { name: "shark_tenant", value: T.tenantId, url: BASE, path: "/", secure: true }]
    : [{ name: "shark_session", value: token, domain: host, path: "/" }, { name: "shark_tenant", value: T.tenantId, domain: host, path: "/" }];

  const pptr = (await import("/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js" as string).catch((e: unknown) => {
    throw new Fatal(`เปิด puppeteer-core ไม่ได้ (${e instanceof Error ? e.message : e}) — ต้องมี /root/dive3d/node_modules/puppeteer-core`);
  })) as Any;
  const browser = (BROWSER = await pptr.default.launch({
    executablePath: "/usr/bin/chromium-browser",
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", `--user-data-dir=${PROFILE_DIRS[0]}`],
  }));
  try {
    for (const p of pages) {
      for (const v of POS_VIEWPORTS) {
        const page = await browser.newPage();
        await page.setViewport({ width: v.w, height: v.h, deviceScaleFactor: 2, isMobile: v.mobile, hasTouch: v.name !== "desktop" });
        await page.setCookie(...cookies);
        const consoleErrors: string[] = [];
        const httpErrors: string[] = [];
        const http5xx: string[] = [];
        page.on("pageerror", (e: Error) => consoleErrors.push(e.message.slice(0, 160)));
        page.on("console", (m: Any) => {
          if (m.type() === "error") consoleErrors.push(String(m.text()).slice(0, 160));
        });
        page.on("response", (r: Any) => {
          try {
            const line = `HTTP ${r.status()} ${String(r.url()).replace(BASE, "").slice(0, 160)}`;
            if (r.status() >= 500) http5xx.push(line); // คำขอย่อย 5xx = ภาพตก
            else if (r.status() >= 400) httpErrors.push(line); // 4xx = บันทึกอย่างเดียว
          } catch {
            /* ignore */
          }
        });
        const resp = await page.goto(`${BASE}${pathOf(p)}`, { waitUntil: "networkidle2", timeout: 60_000 }).catch(() => null);
        await new Promise((r) => setTimeout(r, 800));
        const finalUrl = String(page.url()).replace(BASE, "");
        // ล้นแนวนอน = เนื้อหากว้างกว่ากรอบที่มองเห็น (เกณฑ์ X10 — ไม่มี overflow ทั้ง 3 ขนาด)
        const ov = (await page
          .evaluate(() => {
            const d = document.documentElement;
            // ตรวจ html · body · กรอบเลื่อนหลัก (main / [role=main]) — เลย์เอาต์ที่ล็อก html แล้วให้ main เลื่อนเองจะไม่ล้นที่ html
            const boxes = [d, document.body, ...Array.from(document.querySelectorAll("main, [role=main]"))].filter(Boolean) as Element[];
            const overBox = boxes.find((b) => b.scrollWidth > b.clientWidth + 1);
            const over = !!overBox;
            if (!over) return { over, el: null as string | null };
            const boxName = overBox === d ? "html" : overBox === document.body ? "body" : overBox!.tagName.toLowerCase();
            let best: { r: number; d: string } | null = null;
            for (const el of Array.from(document.querySelectorAll("body *"))) {
              const cs = getComputedStyle(el);
              if (cs.position === "fixed" || cs.display === "none") continue;
              const b = el.getBoundingClientRect();
              if (b.width === 0 || b.right <= d.clientWidth + 1) continue;
              if (!best || b.right > best.r) {
                const tid = el.getAttribute("data-testid");
                best = { r: b.right, d: `${el.tagName.toLowerCase()}${tid ? `[data-testid=${tid}]` : ""} right=${Math.round(b.right)}` };
              }
            }
            return { over, el: `${boxName}: ${best?.d ?? "?"}` };
          })
          .catch(() => ({ over: false, el: null }))) as { over: boolean; el: string | null };
        const file = fileOf(p, v.w, v.h);
        await page.screenshot({ path: file, fullPage: true });
        const status = resp?.status() ?? 0;
        const redirectedToLogin = /\/login\b/.test(finalUrl);
        const exp = PAGE_EXPECT[p][userKey];
        const statusOk = exp === "record" ? true : status === exp && !redirectedToLogin;
        const judged = exp === "record" ? status > 0 && status < 400 : true; // record-only: หน้าที่ถูกปฏิเสธ ไม่ตัดสินเลย์เอาต์/console
        const ok = statusOk && (!judged || (consoleErrors.length === 0 && !ov.over && http5xx.length === 0));
        if (!ok) failures++;
        shots.push({ page: p, viewport: `${v.w}x${v.h}`, file, status, expect: exp, finalUrl, redirectedToLogin, overflow: ov.over, overflowEl: ov.el, consoleErrors, httpErrors: [...http5xx, ...httpErrors], http5xx: http5xx.length, ok });
        console.log(
          `  ${ok ? "✅" : "❌"} ${p} ${v.w}x${v.h} HTTP ${status} (คาด ${exp})${http5xx.length ? ` · คำขอย่อย 5xx ${http5xx.length}: ${http5xx[0]}` : ""}${redirectedToLogin ? " · เด้งไป /login" : ""}${ov.over ? ` · ล้นแนวนอน ${ov.el ?? "?"}` : ""}${consoleErrors.length ? ` · console error ${consoleErrors.length}: ${consoleErrors[0]}` : ""} → ${file}`,
        );
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
} catch (e) {
  fatal = e instanceof Fatal ? e.message : `ผิดพลาดกลางคัน — ${e instanceof Error ? (e.stack ?? e.message).slice(0, 400) : String(e)}`;
} finally {
  const { removed, stale } = await cleanSessions();
  await prisma.$disconnect();
  cleanProfiles();
  writeFileSync(`${OUT}/summary-${userKey}.json`, JSON.stringify({ wo: WO, user: userKey, tenant: tenantKey, base: BASE, at: new Date().toISOString(), shots }, null, 2));
  console.log(`\n🧹 ลบ session ของรอบนี้ ${removed}${stale ? ` (+ซากหมดอายุ ${stale})` : ""} · ลบโปรไฟล์ chromium ${PROFILE_DIRS[0]} · ภาพ ${shots.length} ใบใน ${OUT}`);
}
if (fatal) console.error(`❌ ${fatal}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ wo: WO, user: userKey, tenant: tenantKey, base: BASE, shots: shots.map(({ consoleErrors, httpErrors, ...s }) => ({ ...s, consoleErrors: consoleErrors.length, httpErrors: httpErrors.length })), failures, fatal: fatal || null })}`);
process.exit(fatal ? 2 : failures > 0 ? 1 : 0);
