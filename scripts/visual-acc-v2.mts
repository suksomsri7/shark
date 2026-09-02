// ถ่ายภาพหน้าจอจริงของงานบัญชี V2 — เดสก์ท็อป 1440×900 + มือถือ 390×844 (fullPage)
//
// ใช้:
//   bash scripts/acc-v2-serve.sh                       # ต้องมีเซิร์ฟเวอร์ก่อน (production build)
//   pnpm exec tsx scripts/visual-acc-v2.mts 0.1        # ถ่ายหน้าของ WO 0.1
//   pnpm exec tsx scripts/visual-acc-v2.mts 0.1 --assert   # + อ่านตัวเลขจาก data-testid มาเทียบเฉลย
//   bash scripts/acc-v2-serve.sh stop
//
// 🔴 ชื่อไฟล์จงใจไม่ขึ้นต้นด้วย `qc-` — ชุดนี้ต้องมี build + เซิร์ฟเวอร์ + chromium ซึ่ง CI ไม่มี
//    (บทเรียน 31 ส.ค.: ตั้งชื่อ qc-* แล้ว qc:all แดงถาวร)
// 🔴 session ที่ mint ต้องถูกลบทิ้งเสมอ — ปักธง userAgent = "qc-visual-acc-v2"
// 🔴 ชื่อคุกกี้ผูกกับ APP_ENV: dev/http = `shark_session` · https = `__Host-shark_session`

import { mkdirSync, readFileSync, existsSync } from "node:fs";
// tsconfig ไม่ได้เปิด allowImportingTsExtensions → import แบบ static ที่ลงท้าย .mts จะ typecheck ไม่ผ่าน
// ⇒ โหลดแบบ dynamic (tsx resolve ตอนรันได้ปกติ) แล้วประกาศชนิดไว้เอง
const accEnv = (await import("./acc-v2-env.mts" as string)) as {
  loadQcEnv: () => { databaseUrl: string; host: string };
  QC: {
    tenantName: string;
    tenantSlug: string;
    ownerEmail: string;
    ownerName: string;
    expectedPath: string;
    shotsDir: string;
    today: string;
    oracleValidUntil: string;
  };
};
const { loadQcEnv, QC } = accEnv;

loadQcEnv();

const WO = (process.argv[2] ?? "0.1").replace(/^-+/, "");
const ASSERT = process.argv.includes("--assert");
const BASE = process.env.QC_BASE ?? "http://127.0.0.1:3215";

if (!existsSync(QC.expectedPath)) {
  console.error(`❌ ไม่พบเฉลย ${QC.expectedPath} — รัน seed ก่อน`);
  process.exit(2);
}
const E = JSON.parse(readFileSync(QC.expectedPath, "utf8"));
const SYS: string = E.systemId;

// ─────────── รายการหน้าต่อ WO (เติมทีละ WO ตาม BLUEPRINT §3) ───────────
// expect = ข้อความที่ต้องเจอบนหน้า (ว่าง = ไม่ตรวจ) — พิสูจน์ว่าเปิดถูกหน้า **และต่อ DB QC จริง**
// (Next โหลด .env ของ prod ให้อัตโนมัติตอน build/start แต่ไม่ทับ env ที่ส่งเข้ามา → ต้องมีหลักฐานจากหน้าจอ)
type PageSpec = { name: string; path: string; note?: string; expect?: string[] };
const PAGES: Record<string, PageSpec[]> = {
  "0.1": [
    { name: "hub", path: `/app/sys/${SYS}`, note: "หน้าแรกระบบบัญชี (AccountContent)", expect: ["บัญชี", E.tenantName] },
    { name: "invoice-list", path: `/app/sys/${SYS}/account/docs/INVOICE`, note: "หน้ารายการใบแจ้งหนี้ (เฟรม f3)", expect: ["ใบแจ้งหนี้", E.fixtures.invNattapholDocNo] },
    { name: "account-root", path: `/app/sys/${SYS}/account`, note: "⚠️ ยังไม่มี page.tsx → 404 (ลิงก์ '← ระบบบัญชี' ใน layout ตายอยู่ — ยังไม่ถูกแก้หลัง WO 0.2 → ส่งต่อ WO 0.4 shell V2)" },
  ],
};

// ─────────── ตารางตัวเลขที่อ่านจาก data-testid (ว่างไว้ก่อน — WO ถัดไปเติม) ───────────
// รูปแบบ: { page: { "testid": ค่าที่คาดหวังเป็นสตางค์ | สตริง } }
const ASSERT_MAP: Record<string, Record<string, Record<string, number | string>>> = {
  "0.1": {},
};

const specs = PAGES[WO];
if (!specs) {
  console.error(`❌ ยังไม่ได้ประกาศรายการหน้าของ WO "${WO}" ใน scripts/visual-acc-v2.mts`);
  process.exit(2);
}

const OUT = `${QC.shotsDir}/${WO}`;
mkdirSync(OUT, { recursive: true });

const { sha256 } = await import("@/lib/core/hash");

// prisma: ปกติใช้ตัวเดียวกับแอป (`@/lib/core/db`) — ตัวนั้นมี boot assert ว่า "ทุก model ใน schema
// ต้องลงทะเบียนใน scope.ts" ซึ่งจะโยนถ้า worktree กำลังถูกแก้ค้างอยู่โดย WO อื่น (schema เปลี่ยนแล้ว
// แต่ยังไม่ `prisma generate`) — สคริปต์นี้เป็น "กล้องถ่ายรูป" ไม่ควรถูกบล็อกด้วยเหตุนั้น
// ⇒ ล้มเมื่อไหร่ ให้ต่อ DB ตรงแทน **พร้อมเตือนเสียงดัง** (ไม่ใช่เงียบ ๆ)
let prisma: {
  user: { findUnique: (a: unknown) => Promise<{ id: string } | null> };
  session: {
    create: (a: unknown) => Promise<unknown>;
    deleteMany: (a: unknown) => Promise<{ count: number }>;
    count: (a: unknown) => Promise<number>;
  };
  $disconnect: () => Promise<void>;
};
try {
  prisma = (await import("@/lib/core/db")).prisma as unknown as typeof prisma;
} catch (e) {
  console.warn(
    `⚠️  โหลด @/lib/core/db ไม่ได้ (${e instanceof Error ? e.message.split("\n")[0] : e})\n` +
      `   → worktree น่าจะถูกแก้ค้างโดย WO อื่นอยู่ · ต่อ DB QC ตรงแทนเพื่อถ่ายภาพให้จบ\n`,
  );
  const { PrismaClient } = await import("@prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }) as unknown as typeof prisma;
}

const UA = "qc-visual-acc-v2";
const owner = await prisma.user.findUnique({ where: { email: QC.ownerEmail }, select: { id: true } });
if (!owner) {
  console.error(`❌ ไม่พบผู้ใช้ ${QC.ownerEmail} — รัน seed ก่อน`);
  process.exit(2);
}
const token = "accv2" + Math.random().toString(36).slice(2) + Date.now().toString(36);
const ttl = new Date(Date.now() + 60 * 60 * 1000);
await prisma.session.create({
  data: { userId: owner.id, tokenHash: sha256(token), userAgent: UA, idleExpiresAt: ttl, expiresAt: ttl },
});

let failures = 0;
try {
  const pptr = await import(
    "/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js" as string
  );
  const browser = await pptr.default.launch({
    executablePath: "/usr/bin/chromium-browser",
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", `--user-data-dir=/tmp/chr-accv2-${process.pid}`],
  });
  try {
    const https = BASE.startsWith("https:");
    const host = new URL(BASE).hostname;
    const cookies = https
      ? [
          { name: "__Host-shark_session", value: token, url: BASE, path: "/", secure: true },
          { name: "shark_tenant", value: E.tenantId, url: BASE, path: "/", secure: true },
        ]
      : [
          { name: "shark_session", value: token, domain: host, path: "/" },
          { name: "shark_tenant", value: E.tenantId, domain: host, path: "/" },
        ];

    for (const spec of specs) {
      const line: string[] = [];
      for (const [device, w, h] of [
        ["desktop", 1440, 900],
        ["mobile", 390, 844],
      ] as const) {
        const page = await browser.newPage();
        // tsx/esbuild ห่อฟังก์ชันที่ส่งเข้า page.evaluate ด้วย __name(...) ซึ่งเบราว์เซอร์ไม่มี → ฉีด shim
        await page.evaluateOnNewDocument("window.__name = window.__name || ((f) => f);");
        await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
        await page.setCookie(...cookies);
        // สถานะ HTTP อ่านจาก fetch ตรง ๆ — ไม่ผูกกับ puppeteer เพราะ waitUntil อาจ timeout
        // ทั้งที่หน้าเรนเดอร์เรียบร้อยแล้ว (หน้ารายการมี stream/suspense) → เคยได้ status 0 หลอก
        const status = await fetch(`${BASE}${spec.path}`, {
          headers: { cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; ") },
          redirect: "manual",
        })
          .then((r) => r.status)
          .catch(() => 0);
        const navOk = await page
          .goto(`${BASE}${spec.path}`, { waitUntil: "domcontentloaded", timeout: 60_000 })
          .then(() => true)
          .catch(() => false);
        await new Promise((r) => setTimeout(r, 1500)); // ให้ hydrate/สตรีมจบก่อนถ่าย
        const file = `${OUT}/${spec.name}-${device}.png`;
        await page.screenshot({ path: file, fullPage: true });
        const probe = await page.evaluate(() => ({
          title: document.title,
          h1: document.querySelector("h1")?.textContent?.trim() ?? "",
          all: (document.body.innerText ?? "").slice(0, 20000),
          text: (document.querySelector("main")?.textContent ?? document.body.textContent ?? "").slice(0, 4000),
          overflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
          testids: Object.fromEntries(
            [...document.querySelectorAll("[data-testid]")].map((el) => [
              el.getAttribute("data-testid") ?? "",
              (el as HTMLElement).innerText.trim(),
            ]),
          ),
        }));
        line.push(`${device} HTTP ${status} · ${w}px · ล้นแนวนอน ${probe.overflow}px${navOk ? "" : " · nav timeout"}`);

        // กันถ่ายหน้า login/404 มาแล้วนึกว่าผ่าน: ต้อง HTTP 200 + เจอข้อความที่ประกาศไว้ครบ
        for (const want of spec.expect ?? []) {
          const ok = status === 200 && probe.all.includes(want);
          if (!ok) failures++;
          console.log(`  ${ok ? "✅" : "❌"} [${spec.name}/${device}] HTTP ${status} · เจอ "${want}" บนหน้า${ok ? "" : ` — title="${probe.title}" h1="${probe.h1}"`}`);
        }
        if (ASSERT) {
          const want = ASSERT_MAP[WO]?.[spec.name] ?? {};
          for (const [tid, expected] of Object.entries(want)) {
            const got = probe.testids[tid];
            const ok = String(got ?? "").includes(String(expected));
            if (!ok) failures++;
            console.log(`  ${ok ? "✅" : "❌"} [${spec.name}/${device}] data-testid="${tid}" = ${JSON.stringify(got)} (คาด ${JSON.stringify(expected)})`);
          }
        }
        await page.close();
      }
      console.log(`📸 ${spec.name.padEnd(14)} ${spec.path}\n   ${line.join(" | ")}${spec.note ? `\n   ${spec.note}` : ""}`);
      console.log(`   ${OUT}/${spec.name}-desktop.png · ${OUT}/${spec.name}-mobile.png`);
    }
  } finally {
    await browser.close();
  }
} finally {
  const { count } = await prisma.session.deleteMany({ where: { userAgent: UA } });
  const left = await prisma.session.count({ where: { userAgent: UA } });
  console.log(`\nลบ session ทดสอบ ${count} แถว · เหลือค้าง ${left} (ต้องเป็น 0)`);
  await prisma.$disconnect();
}

console.log(`\n===== VISUAL ACC V2 · WO ${WO} =====`);
console.log(failures === 0 ? `ผ่านทั้งหมด · ภาพอยู่ที่ ${OUT}/` : `ตก ${failures} ข้อ`);
process.exit(failures > 0 ? 1 : 0);
