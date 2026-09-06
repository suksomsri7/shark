// ถ่ายภาพหน้าจอจริงของ "ตราสินค้าและธีมกิจการ" (ledger/BRANDING-RUN.md §สัญญา B2) — เดสก์ท็อป 1440×900 + มือถือ 390×844
//
// ใช้:
//   bash scripts/acc-v2-serve.sh                    # production build บน .env.qc :3215 (ต้องมีก่อน)
//   pnpm exec tsx scripts/visual-branding.mts b2     # ถ่ายชุดของ WO B2
//   pnpm exec tsx scripts/visual-branding.mts b3     # ถ่ายชุดของ WO B3 (โครงแอป 3 โทน · ราง · ปัดขวา · แจ้งปัญหา)
//   pnpm exec tsx scripts/visual-branding.mts b4     # ถ่ายชุดของ WO B4 (หน้าร้านสาธารณะ เทียล+โลโก้ → applyStorefront=false)
//   bash scripts/acc-v2-serve.sh stop
//
// ยืมร้าน QC ของบอร์ดงาน (siam-dive-kanban-qc · kb-owner@shark.local) แทนการสร้างร้านใหม่ —
// ไม่ชนกันเพราะ B2 แค่แก้ TenantBranding ของร้านนั้น แล้ว**คืนเป็นค่าเริ่มต้นใน finally เสมอ**
//
// 🔴 session ที่ mint ต้องถูกลบเสมอ — ปักธง userAgent = "qc-visual-branding" (ลบใน finally)
// 🔴 ชื่อคุกกี้ผูกกับ APP_ENV: http = `shark_session` · https = `__Host-shark_session`
// ขั้น "คลิก/พิมพ์" ทำผ่าน puppeteer บน production build (dev ไม่ hydrate ใน headless — บทเรียน 13 ส.ค.)

import { existsSync, mkdirSync } from "node:fs";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
const kq = (await import("./kanban-qc-env.mts" as string)) as { KQC: Any; resolveKanbanScope: (p: Any) => Promise<{ tenantId: string; systemId: string } | null> };
const { KQC, resolveKanbanScope } = kq;
const { prisma } = await import("@/lib/core/db");
const { sha256 } = await import("@/lib/core/hash");
const { setBranding, invalidateBrandingCache } = (await import("@/lib/branding/service" as string)) as Any;
const { setUserPreferences } = (await import("@/lib/core/user-preferences" as string)) as Any;

const argv = process.argv.slice(2);
const WO = argv[0] ?? "b2";
const BASE = process.env.QC_BASE ?? "http://127.0.0.1:3215";
const OUT = `.qc-shots/branding/${WO}`;
mkdirSync(OUT, { recursive: true });

const scope = await resolveKanbanScope(prisma);
if (!scope) {
  console.error("❌ ไม่พบร้าน QC บอร์ดงาน (siam-dive-kanban-qc) — seed ก่อน (ดู kanban-qc-env.mts)");
  process.exit(2);
}
const { tenantId } = scope;
const SETTINGS_PATH = "/app/settings/branding";

type Step =
  | { click: string }
  | { fill: string; value: string }
  | { waitFor: string; timeoutMs?: number }
  | { wait: number }
  /** ปัดนิ้วจากขอบซ้ายไปทางขวา (ท่าเปิดเมนูของ B3) — ใช้ touchscreen จริงผ่าน CDP ไม่ใช่ event ปลอม */
  | { swipeFromLeftEdge: true };
type Spec = {
  name: string;
  /** หน้าที่จะถ่าย (ปริยาย = หน้าตั้งค่าธีมของ B2) */
  path?: string;
  /** ถ่ายเฉพาะจอเดียว (ปริยาย = ทุก viewport) */
  onlyDevice?: "desktop" | "mobile";
  /** ตั้งธีมของร้าน QC ก่อนถ่าย — เปลี่ยนเมื่อไหร่ต้องรอแคชโทเคน 60 วิของเซิร์ฟเวอร์หมดอายุก่อน */
  branding?: {
    navTone: "LIGHT" | "BRAND" | "DARK";
    brandColor: string;
    /** B4: โลโก้ของร้าน (ปริยาย = ไม่แตะ — ค่าว่างล้างโลโก้) */
    logoUrl?: string;
    /** B4: false = หน้าร้านสาธารณะกลับไปหน้าตาปริยาย (ปริยาย = true) */
    applyStorefront?: boolean;
  };
  steps?: Step[];
  note?: string;
};

const TEAL = "#0E7490";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const SPECS: Record<string, Spec[]> = {
  // B2 — หน้าตั้งค่าค่าปริยาย → เลือกเทียล+BRAND (ดูตัวอย่างสดเปลี่ยน) → DARK → บันทึก → รีโหลด
  "b2": [
    { name: "settings-default", note: "ค่าปริยายของร้าน QC (ยังไม่ตั้งธีม) — เทียบ mockup 01" },
    {
      name: "preview-teal-brand",
      note: "เลือกสวอตช์เทียล + โทน BRAND — ตัวอย่างสด (ขวา) ต้องเปลี่ยนทันทีโดยยังไม่บันทึก",
      steps: [
        { waitFor: `[data-testid="branding-swatch-${TEAL}"]` },
        { click: `[data-testid="branding-swatch-${TEAL}"]` },
        { click: '[data-testid="branding-tone-BRAND"]' },
        { wait: 300 },
      ],
    },
    {
      name: "preview-dark",
      note: "สลับโทนเป็น DARK ต่อ (สียังเป็นเทียล) — ตัวอย่างสดต้องเปลี่ยนอีกครั้งโดยยังไม่บันทึก",
      steps: [
        { waitFor: `[data-testid="branding-swatch-${TEAL}"]` },
        { click: `[data-testid="branding-swatch-${TEAL}"]` },
        { click: '[data-testid="branding-tone-DARK"]' },
        { wait: 300 },
      ],
    },
    {
      name: "after-save",
      note: "กด 'บันทึกและใช้กับทั้งร้าน' — ต้องเห็นข้อความยืนยันสีเขียว",
      steps: [
        { waitFor: `[data-testid="branding-swatch-${TEAL}"]` },
        { click: `[data-testid="branding-swatch-${TEAL}"]` },
        { click: '[data-testid="branding-tone-DARK"]' },
        { click: '[data-testid="branding-save"]' },
        { wait: 1500 },
      ],
    },
    {
      name: "after-reload",
      note: "โหลดหน้าใหม่ (ไม่มี step) — ค่าที่บันทึกไว้ (เทียล + DARK) ต้องเป็นค่าเริ่มต้นที่เห็นทันที",
    },
  ],

  // B3 — โครงแอปจริงใน 3 โทน + ราง + ปัดขวาเปิดเมนู + แผ่นแจ้งปัญหา (เทียบ mockup 02/03/04)
  // 🔴 เรียงตามโทน: เปลี่ยนธีม 1 ครั้ง = ต้องรอแคชโทเคน 60 วิของเซิร์ฟเวอร์ QC หมดอายุ (คนละโปรเซสกับสคริปต์นี้)
  "b3": [
    {
      name: "light-shell",
      path: "/app",
      branding: { navTone: "LIGHT", brandColor: "" },
      note: "โทนสว่าง (ค่าปริยาย) = ต้องเหมือนระบบเดิมทุกประการ · แถบบน: ตัวย่อ+ชื่อร้าน ซ้าย · ขวา 2 ปุ่ม (แจ้งปัญหา + orb)",
    },
    {
      name: "brand-shell",
      path: "/app",
      onlyDevice: "desktop",
      branding: { navTone: "BRAND", brandColor: TEAL },
      note: "เทียบ mockup 02: แถบเมนูเทียลเต็ม 288px · หัวแถบมีตราสัญลักษณ์+ชื่อ+▾ · ปุ่ม + เพิ่มระบบ กลับสี · ไม่มี ☰ บนแถบบน",
    },
    {
      name: "brand-rail",
      path: "/app",
      onlyDevice: "desktop",
      note: "กด ‹ (nav-collapse) → ยุบเป็นรางไอคอน 56px โทนเดียวกับแถบ · ไม่มีตราสัญลักษณ์บนราง (mockup 03)",
      steps: [{ waitFor: '[data-testid="nav-collapse"]' }, { click: '[data-testid="nav-collapse"]' }, { wait: 700 }],
    },
    {
      name: "brand-board-rail",
      path: "__BOARD__",
      onlyDevice: "desktop",
      note: "หน้าบอร์ดงานยังบังคับรางเหมือนเดิม (K1.5) — โทนรางตามธีมร้าน ไม่ใช่ดำ",
    },
    {
      name: "brand-issue-sheet",
      path: "/app",
      onlyDevice: "desktop",
      note: "กดปุ่ม 'แจ้งปัญหาการใช้งาน' → แผ่นเล็ก: 3 ประเภท · ช่องข้อความ · แนบรูป · บอกว่าแนบบริบทให้เอง",
      steps: [{ waitFor: '[data-testid="report-issue"]' }, { click: '[data-testid="report-issue"]' }, { wait: 500 }],
    },
    {
      name: "brand-mobile-swiped",
      path: "/app",
      onlyDevice: "mobile",
      note: "มือถือ: ไม่มี ☰ ในแอป · ปัดจากขอบซ้ายไปขวา ≥60px แล้วเมนูต้องเลื่อนเข้ามา (ท้ายเมนูมี 'แจ้งปัญหาการใช้งาน')",
      steps: [{ wait: 400 }, { swipeFromLeftEdge: true }, { wait: 700 }],
    },
    {
      name: "dark-shell",
      path: "/app",
      branding: { navTone: "DARK", brandColor: TEAL },
      note: "โทนเข้ม #111827 — ตัวอักษร/ไอคอนต้องอ่านออกทั้งแถบ · จุดเน้น (accent) ยังเป็นเทียล",
    },
    {
      name: "dark-rail",
      path: "/app",
      onlyDevice: "desktop",
      note: "โทนเข้ม + ราง — ปุ่ม › (nav-expand) ท้ายรางต้องเห็นได้",
      steps: [{ waitFor: '[data-testid="nav-collapse"]' }, { click: '[data-testid="nav-collapse"]' }, { wait: 700 }],
    },
  ],

  // B4 — หน้าร้านสาธารณะ (SHOP) ของร้าน QC (siam-dive-kanban-qc/patong) เทียล+โลโก้ → applyStorefront=false กลับปริยาย
  // 🔴 ร้าน QC บอร์ดงานมี BusinessUnit type SHOP อยู่แล้ว (patong/kata) — ไม่ต้องสร้างเอง (ดู kanban-qc-env.mts)
  // 🔴 ไม่มีโลโก้จริงของร้าน QC ในฐานข้อมูล/Bunny CDN ที่หยิบมาใช้ได้ตรง ๆ → ใช้ asset คงที่ของแอปเอง
  //    (`${BASE}/apple-touch-icon.png`) แทน — ยังพิสูจน์ path โลโก้ทำงานจริง แค่ไม่ใช่โลโก้ QC ของจริง
  "b4": [
    {
      name: "shop-teal-logo",
      path: `/s/${KQC.tenantSlug}/${KQC.units[0]!.slug}/shop`,
      branding: { navTone: "LIGHT", brandColor: TEAL, logoUrl: `${BASE}/apple-touch-icon.png`, applyStorefront: true },
      note: "หน้าร้านสาธารณะตั้งธีมเทียล+โลโก้ — หัวหน้าต้องเห็นโลโก้+ชื่อร้าน · accent เทียล ไม่ใช่น้ำเงินเดิม",
    },
    {
      name: "shop-storefront-off",
      path: `/s/${KQC.tenantSlug}/${KQC.units[0]!.slug}/shop`,
      branding: { navTone: "LIGHT", brandColor: TEAL, logoUrl: `${BASE}/apple-touch-icon.png`, applyStorefront: false },
      note: "applyStorefront=false — สี/โลโก้ของร้านหาย กลับไปหน้าตาปริยาย (ชื่อร้านยังอยู่)",
    },
  ],
};
const specs: Spec[] = SPECS[WO] ?? [];
if (specs.length === 0) {
  console.error(`❌ ไม่มี spec ของ WO ${WO}`);
  process.exit(2);
}

// ── ตัวช่วยของ B3: ตั้งธีมร้าน / คืนค่าสถานะแถบเมนูของผู้ใช้ / หาบอร์ดตัวอย่าง ──
// 🔴 getBrandingTokens แคช 60 วิ **ในโปรเซสของเซิร์ฟเวอร์ QC** ซึ่งเป็นคนละโปรเซสกับสคริปต์นี้
//    ⇒ invalidateBrandingCache() ที่นี่ล้างของเซิร์ฟเวอร์ไม่ได้ · ถ้าเคยโหลดหน้าไปแล้วหลังตั้งธีมครั้งก่อน
//    ต้อง "รอให้หมดอายุ" จริง ๆ ไม่งั้นภาพโทนใหม่จะได้สีเก่าแบบเงียบ ๆ (ผลลบปลอมที่หลอกตาที่สุด)
let pageLoadedSinceBranding = false;
async function applyBranding(
  navTone: string,
  brandColor: string,
  opts?: { logoUrl?: string; applyStorefront?: boolean },
): Promise<void> {
  if (pageLoadedSinceBranding) {
    console.log("  ⏳ รอแคชโทเคนธีม 60 วิของเซิร์ฟเวอร์ QC หมดอายุก่อนเปลี่ยนโทน…");
    await sleep(62_000);
  }
  await setBranding(
    { tenantId },
    {
      displayName: "",
      logoUrl: opts?.logoUrl ?? "",
      brandColor,
      navTone,
      applyStorefront: opts?.applyStorefront ?? true,
      applyMobile: true,
      updatedById: null,
    },
  );
  invalidateBrandingCache(tenantId);
  pageLoadedSinceBranding = false;
}

// ── mint session ของเจ้าของร้าน QC บอร์ดงาน ──
const user = await prisma.user.findUnique({ where: { email: KQC.ownerEmail }, select: { id: true } });
if (!user) {
  console.error(`❌ ไม่พบผู้ใช้ ${KQC.ownerEmail}`);
  process.exit(2);
}
// หน้าบอร์ดตัวอย่างของร้าน QC (ใช้กับ spec ที่ path = "__BOARD__") — บอร์ดสาขาป่าตองตามชุดข้อมูล K1
const qcBoard = await prisma.kanbanBoard.findFirst({
  where: { tenantId, name: KQC.boards.patong },
  select: { id: true },
});
const BOARD_PATH = qcBoard ? `/app/sys/${scope.systemId}/kanban/b/${qcBoard.id}` : "/app";

const UA = "qc-visual-branding";
const token = "br" + Math.random().toString(36).slice(2) + Date.now().toString(36);
const ttl = new Date(Date.now() + 60 * 60 * 1000);
await prisma.session.create({ data: { userId: user.id, tokenHash: sha256(token), userAgent: UA, idleExpiresAt: ttl, expiresAt: ttl } });

let failures = 0;
const shots: string[] = [];
try {
  const pptr = await import("/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js" as string);
  const browser = await pptr.default.launch({
    executablePath: "/usr/bin/chromium-browser",
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", `--user-data-dir=/tmp/chr-branding-${process.pid}`],
  });
  try {
    const https = BASE.startsWith("https:");
    const host = new URL(BASE).hostname;
    const cookies = https
      ? [{ name: "__Host-shark_session", value: token, url: BASE, path: "/", secure: true }, { name: "shark_tenant", value: tenantId, url: BASE, path: "/", secure: true }]
      : [{ name: "shark_session", value: token, domain: host, path: "/" }, { name: "shark_tenant", value: tenantId, domain: host, path: "/" }];

    // KQC_VIEWPORTS="ipad-portrait:820x1180" ใช้แทนชุดปริยายได้เหมือนกันกับ visual-kanban.mts
    const viewports: readonly (readonly [string, number, number])[] = process.env.KQC_VIEWPORTS
      ? process.env.KQC_VIEWPORTS.split(",").map((v) => { const [name, wh] = v.split(":"); const [w, h] = wh!.split("x").map(Number); return [name!, w!, h!] as const; })
      : ([["desktop", 1440, 900], ["mobile", 390, 844]] as const);

    for (const spec of specs) {
      // ตั้งธีมของร้านก่อนถ่าย (เฉพาะ spec ที่ประกาศ) — รอแคชของเซิร์ฟเวอร์หมดอายุให้เรียบร้อย
      if (spec.branding) {
        await applyBranding(spec.branding.navTone, spec.branding.brandColor, {
          logoUrl: spec.branding.logoUrl,
          applyStorefront: spec.branding.applyStorefront,
        });
      }
      // 🔴 คืนสถานะแถบเมนูของผู้ใช้เป็น "กางเต็ม" ก่อนทุก spec — spec ก่อนหน้าที่กด ‹ ได้บันทึกค่าจริงลง
      //    User.prefs ไปแล้ว ถ้าไม่คืน ภาพถัดไปจะเป็นรางทั้งที่ไม่ได้ตั้งใจ (และไล่หาสาเหตุยากมาก)
      await setUserPreferences(user.id, { navCollapsed: false });
      for (const [device, w, h] of viewports) {
        if (spec.onlyDevice && spec.onlyDevice !== device) continue;
        const page = await browser.newPage();
        await page.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: device === "mobile", hasTouch: device === "mobile" });
        await page.setCookie(...cookies);
        const errors: string[] = [];
        page.on("pageerror", (e: Error) => errors.push(e.message.slice(0, 120)));
        page.on("console", (m: Any) => { if (m.type() === "error") errors.push(String(m.text()).slice(0, 120)); });
        const path = spec.path === "__BOARD__" ? BOARD_PATH : (spec.path ?? SETTINGS_PATH);
        const resp = await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 60_000 }).catch(() => null);
        pageLoadedSinceBranding = true;
        await new Promise((r) => setTimeout(r, 1200)); // ให้ hydrate

        for (const step of spec.steps ?? []) {
          try {
            if ("waitFor" in step) await page.waitForSelector(step.waitFor, { timeout: step.timeoutMs ?? 10_000 });
            else if ("click" in step) await page.click(step.click);
            else if ("fill" in step) { await page.click(step.fill, { clickCount: 3 }); await page.keyboard.type(step.value, { delay: 15 }); }
            else if ("wait" in step) await new Promise((r) => setTimeout(r, step.wait));
            else if ("swipeFromLeftEdge" in step) {
              // นิ้วจริงผ่าน CDP: แตะที่ x=6 (อยู่ในเขตขอบ ≤24px) แล้วลากไปขวาเกิน 60px
              const y = Math.round(h / 2);
              await page.touchscreen.touchStart(6, y);
              for (const x of [24, 48, 80, 120]) {
                await page.touchscreen.touchMove(x, y);
                await new Promise((r) => setTimeout(r, 60));
              }
              await page.touchscreen.touchEnd();
            }
          } catch (e) {
            failures++;
            console.log(`  ❌ step ${JSON.stringify(step).slice(0, 80)} — ${e instanceof Error ? e.message.slice(0, 120) : e}`);
          }
        }

        await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
        await new Promise((r) => setTimeout(r, 250));
        const file = `${OUT}/${spec.name}-${device}.png`;
        await page.screenshot({ path: file, fullPage: true });
        shots.push(file);
        const status = resp?.status() ?? 0;
        const ok = status < 400 && errors.length === 0;
        if (!ok) failures++;
        console.log(`  ${ok ? "✅" : "❌"} ${spec.name} [${device}] HTTP ${status} → ${file}${errors.length ? ` · console error ${errors.length}: ${errors[0]}` : ""}${spec.note ? `\n       ↳ ${spec.note}` : ""}`);
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
} finally {
  // 🔴 คืนธีมของร้าน QC เป็นค่าเริ่มต้นเสมอ ไม่ว่าถ่ายภาพจะสำเร็จหรือพังกลางทาง (ห้ามให้ QC บอร์ดงาน
  //    เจอร้านตัวเองมีธีมเทียล/เข้มติดค้างอยู่โดยไม่มีใครรู้ว่าเพราะ harness ตัวนี้)
  try {
    await setBranding(
      { tenantId },
      { displayName: "", logoUrl: "", brandColor: "", navTone: "LIGHT", applyStorefront: true, applyMobile: true, updatedById: null },
    );
    invalidateBrandingCache(tenantId);
    // ค่าย่อ/ขยายแถบเมนูของเจ้าของร้าน QC เป็นของ "คน" — spec ที่กด ‹ เขียนลง DB จริง ต้องคืนเสมอ
    await setUserPreferences(user.id, { navCollapsed: false });
    console.log(`🧹 คืนธีมของร้าน QC (${tenantId}) เป็นค่าเริ่มต้น (ว่าง/LIGHT) + navCollapsed=false แล้ว`);
  } catch (e) {
    failures++;
    console.log(`  ❌ คืนธีมของร้าน QC ไม่สำเร็จ — ${e instanceof Error ? e.message.slice(0, 200) : e}`);
  }
  const { count } = await prisma.session.deleteMany({ where: { userAgent: UA } });
  await prisma.$disconnect();
  console.log(`\n🧹 ลบ session QC ${count} · ภาพ ${shots.length} ใบใน ${OUT}`);
}
console.log(`JSON_SUMMARY ${JSON.stringify({ wo: WO, shots, failures })}`);
process.exit(failures > 0 ? 1 : 0);
