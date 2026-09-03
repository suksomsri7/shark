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
type PageSpec = {
  name: string;
  path: string;
  note?: string;
  expect?: string[];
  /** selector ที่ต้องคลิกหลังหน้าโหลด/hydrate เสร็จ (ทำตามลำดับ) — ใช้เปิด dropdown/sheet ก่อนถ่ายภาพ */
  click?: string[];
  /** selector ที่ต้อง hover (ไม่คลิก) หลัง click ครบ — ใช้เปิด flyout ระดับ 2 บนเดสก์ท็อปโดยไม่ navigate ออกจากหน้า */
  hover?: string[];
  /** เวลารอ (ms) หลัง click/hover ครบ ก่อนถ่ายภาพ — ค่าเริ่มต้น 300 (ตาม WO 0.4 "wait 300ms") */
  waitAfterClick?: number;
  /** จำกัดให้ถ่าย/ตรวจเฉพาะอุปกรณ์นี้ (ไม่ระบุ = ทั้ง 2) — ใช้กับ interaction ที่มีความหมายแค่ device เดียว
   *  เช่น hover flyout (เดสก์ท็อปเท่านั้น) / sheet ชั้น 2 (มือถือเท่านั้น) */
  onlyDevice?: "desktop" | "mobile";
};
const PAGES: Record<string, PageSpec[]> = {
  "0.1": [
    { name: "hub", path: `/app/sys/${SYS}`, note: "หน้าแรกระบบบัญชี (AccountContent)", expect: ["บัญชี", E.tenantName] },
    { name: "invoice-list", path: `/app/sys/${SYS}/account/docs/INVOICE`, note: "หน้ารายการใบแจ้งหนี้ (เฟรม f3)", expect: ["ใบแจ้งหนี้", E.fixtures.invNattapholDocNo] },
    { name: "account-root", path: `/app/sys/${SYS}/account`, note: "⚠️ ยังไม่มี page.tsx → 404 (ลิงก์ '← ระบบบัญชี' ใน layout ตายอยู่ — ยังไม่ถูกแก้หลัง WO 0.2 → ส่งต่อ WO 0.4 shell V2)" },
  ],
  // WO 0.4 (Shell V2): แถบเมนู 9 หมวด + dropdown 2 ระดับ (เดสก์ท็อป) / bottom sheet 2 ชั้น (มือถือ) + breadcrumb
  // "account-root" ของ 0.1 คือ "hub" ที่นี่ — ตอนนี้มี page.tsx แล้ว (แก้บั๊ก 404 ledger/wo-notes/0.1.md ข้อ 8)
  "0.5": [
    { name: "gallery", path: `/app/sys/${SYS}/account/dev-components`, note: "gallery ส่วนประกอบกลาง V2 (เทียบ f3/g1/g5/g17/g18)", expect: ["บัญชี"] },
  ],
  "0.4": [
    { name: "hub", path: `/app/sys/${SYS}/account`, note: "หน้า hub บัญชี — แก้ 404 เดิม (WO 0.1 บันทึกไว้เป็นข้อ 8)", expect: ["บัญชี"] },
    { name: "invoice-list", path: `/app/sys/${SYS}/account/docs/INVOICE`, note: "หน้ารายการใบแจ้งหนี้ (เฟรม f3) ใต้แถบเมนู V2", expect: ["ใบแจ้งหนี้"] },
    {
      name: "menu-open",
      path: `/app/sys/${SYS}/account`,
      note: 'เปิดหมวด "รายรับ" — เดสก์ท็อป = dropdown 2 ระดับ (f2) · มือถือ = bottom sheet (f12/g18)',
      expect: ["บัญชี"],
      click: ['[data-testid="acc-menu-revenue"]'],
      waitAfterClick: 300,
    },
    {
      name: "menu-flyout",
      path: `/app/sys/${SYS}/account`,
      note: 'คลิก "รายรับ" แล้ว hover "ใบแจ้งหนี้" — เปิด flyout ระดับ 2 (f2 พาเนลขวา: +สร้าง ปุ่มดำ/สถานะพร้อมตัวนับ/ดูทั้งหมด/ล่าสุด)',
      expect: ["บัญชี"],
      onlyDevice: "desktop",
      click: ['[data-testid="acc-menu-revenue"]'],
      hover: ['[data-testid="acc-item-INVOICE"]'],
      waitAfterClick: 300,
    },
    {
      name: "sheet-l2",
      path: `/app/sys/${SYS}/account`,
      note: 'แตะ "รายรับ" แล้วแตะ "ใบแจ้งหนี้ (ใบส่งของ)" — sheet ชั้น 2 พร้อมปุ่มย้อนกลับ (g18)',
      expect: ["บัญชี"],
      onlyDevice: "mobile",
      click: ['[data-testid="acc-menu-revenue"]', '[data-testid="acc-item-INVOICE"]'],
      waitAfterClick: 300,
    },
  ],
  // WO 1.1 (DocListPage): หน้ารายการทุกชนิด — เทียบ f3-invoice-list.png (เดสก์ท็อป) + f13-m-invoice-list.png (มือถือ)
  // ตัวเลขแท็บของ INVOICE ต้องตรง acc-v2-expected.json.invoiceTabs เป๊ะ (ASSERT_MAP ด้านล่าง) · size=20 ให้ตรงกับ
  // pageCount ที่คาด (51 ใบ / 20 = 3 หน้า → "หน้า 1/3")
  "1.1": [
    {
      name: "invoice-list",
      path: `/app/sys/${SYS}/account/docs/INVOICE?size=20`,
      note: "หน้ารายการใบแจ้งหนี้ default tab ทั้งหมด (f3) — ตัวนับแท็บ + pagination หน้า 1/3",
      expect: ["ใบแจ้งหนี้", "หน้า 1/3"],
    },
    {
      name: "invoice-list-overdue",
      path: `/app/sys/${SYS}/account/docs/INVOICE?tab=overdue`,
      note: "แท็บพ้นกำหนด (f3 — แถวสีแดง)",
      expect: ["พ้นกำหนด"],
    },
    {
      name: "quotation-list",
      path: `/app/sys/${SYS}/account/docs/QUOTATION`,
      note: "หน้ารายการใบเสนอราคา (§5.1: เลขที่/ลูกค้า/วันที่ออก/ใช้ได้ถึง/มูลค่าสุทธิ/สถานะ)",
      expect: ["ใบเสนอราคา"],
    },
    {
      name: "expense-list",
      path: `/app/sys/${SYS}/account/expense`,
      note: "หน้ารายการบันทึกค่าใช้จ่าย (ฝั่งจ่าย — listExpenseDocsPaged)",
      expect: ["บันทึกค่าใช้จ่าย"],
    },
    {
      name: "po-list",
      path: `/app/sys/${SYS}/account/po`,
      note: "หน้ารายการใบสั่งซื้อ (§5.1: เลขที่/ผู้ขาย/วันที่/มูลค่าสุทธิ/สถานะ)",
      expect: ["ใบสั่งซื้อ"],
    },
    {
      name: "goods-issue-list",
      path: `/app/sys/${SYS}/account/goods-issue`,
      note: "หน้ารายการใบเบิกสินค้า PRR (เลขที่/วันที่/สาเหตุการเบิก/จำนวนที่เบิก/สถานะ)",
      expect: ["ใบเบิกสินค้า"],
    },
  ],
};

// ─────────── ตารางตัวเลขที่อ่านจาก data-testid (ว่างไว้ก่อน — WO ถัดไปเติม) ───────────
// รูปแบบ: { page: { "testid": ค่าที่คาดหวังเป็นสตางค์ | สตริง } }
const ASSERT_MAP: Record<string, Record<string, Record<string, number | string>>> = {
  "0.1": {},
  "0.4": {},
  "0.5": {},
  // WO 1.1: ตัวนับแท็บของ INVOICE ต้องตรง acc-v2-expected.json.invoiceTabs เป๊ะ (ground truth = f3-invoice-list.png)
  "1.1": {
    "invoice-list": {
      "tab-all-count": E.invoiceTabs.all,
      "tab-draft-count": E.invoiceTabs.draft,
      "tab-awaiting-count": E.invoiceTabs.awaiting,
      "tab-partial-count": E.invoiceTabs.partial,
      "tab-paid-count": E.invoiceTabs.paid,
      "tab-overdue-count": E.invoiceTabs.overdue,
      "tab-cancelled-count": E.invoiceTabs.cancelled,
    },
  },
};

const specs = PAGES[WO];
if (!specs) {
  console.error(`❌ ยังไม่ได้ประกาศรายการหน้าของ WO "${WO}" ใน scripts/visual-acc-v2.mts`);
  process.exit(2);
}

const OUT = `${QC.shotsDir}/${WO}`;
mkdirSync(OUT, { recursive: true });

const { sha256 } = await import("@/lib/core/hash");

// listDocumentsPaged: ใช้ยืนยันตัวนับใน flyout เมนู V2 ตรงกับ query จริงของหน้ารายการ (แหล่งอิสระ ไม่ใช่เช็คตัวเองกับตัวเอง)
// เป็น optional เหมือน prisma ด้านล่าง — ถ้า worktree กำลังถูกแก้ค้างโดย WO อื่นจน import พัง ให้ข้ามเช็คนี้ไปเงียบ ๆ
// (ไม่ควรบล็อกกล้องถ่ายรูป) แต่พิมพ์เตือนให้เห็นว่าข้ามไปทำไม
let listDocumentsPaged: ((tenantId: string, systemId: string, input: Record<string, unknown>) => Promise<{ total: number }>) | null = null;
try {
  listDocumentsPaged = (await import("@/lib/modules/account/service")).listDocumentsPaged as unknown as typeof listDocumentsPaged;
} catch (e) {
  console.warn(`⚠️  โหลด listDocumentsPaged ไม่ได้ (${e instanceof Error ? e.message.split("\n")[0] : e}) — ข้ามเช็คตัวนับ flyout กับ DB ตรง ๆ`);
}

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
        if (spec.onlyDevice && spec.onlyDevice !== device) continue; // interaction นี้มีความหมายแค่ device เดียว
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

        // WO 0.4: เปิด dropdown/sheet ก่อนถ่าย (เดสก์ท็อป=dropdown 2 ระดับ · มือถือ=bottom sheet — คลิกปุ่มเดียวกัน
        // AccountTabBar ตัดสินพฤติกรรมจาก matchMedia ตอนคลิกเอง ไม่ต้องแยกโค้ดที่นี่)
        for (const sel of spec.click ?? []) {
          await page.click(sel).catch(() => {});
        }
        // hover (ไม่ใช่ click) — เปิด flyout ระดับ 2 บนเดสก์ท็อปโดยไม่ navigate ออกจากรายการ (Link ของแถวระดับ 1 มี href จริง)
        for (const sel of spec.hover ?? []) {
          await page.hover(sel).catch(() => {});
        }
        if (spec.click?.length || spec.hover?.length) await new Promise((r) => setTimeout(r, spec.waitAfterClick ?? 300));
        // Fable QC รอบ 2: page.hover() ของ puppeteer เรียก scrollIntoViewIfNeeded ก่อนเสมอ — ถ้า element ที่ hover
        // เคยโดน overflow ของ ancestor บัง (ดู AccountTabBar แก้แล้ว) จะสกอลหน้าไปตำแหน่งแปลก ๆ ก่อนถ่าย ⇒ รีเซ็ตกลับ 0
        // เสมอก่อนถ่ายภาพ (fullPage screenshot ควรไม่ขึ้นกับตำแหน่งสกอลอยู่แล้ว แต่กันไว้สองชั้น)
        await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});

        const file = `${OUT}/${spec.name}-${device}.png`;
        await page.screenshot({ path: file, fullPage: true });
        const probe = await page.evaluate(() => {
          // เช็ค "เปิดอยู่จริงบนจอ" ด้วย getBoundingClientRect + computed style — **ห้ามใช้ offsetParent**
          // (offsetParent เป็น null เสมอสำหรับ position:fixed ตามสเปก แม้ element จะมองเห็นได้จริง ๆ บนจอ —
          // บทเรียน VR-6.2 ที่ Fable เจอ: sheet ของ AccountTabBar เป็น `fixed inset-0` ⇒ offsetParent เช็คพลาดเสมอ)
          const isVisible = (el: Element | null): boolean => {
            if (!el) return false;
            const r = el.getBoundingClientRect();
            if (r.width <= 0 || r.height <= 0) return false;
            const cs = getComputedStyle(el);
            return cs.visibility !== "hidden" && cs.display !== "none";
          };
          const rectOf = (el: Element | null) => {
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
          };
          const tabbarEl = document.querySelector('[data-testid="acc-tabbar"]');
          const dropdownEl = document.querySelector('[data-testid="acc-dropdown"]');
          return {
            title: document.title,
            h1: document.querySelector("h1")?.textContent?.trim() ?? "",
            all: (document.body.innerText ?? "").slice(0, 20000),
            text: (document.querySelector("main")?.textContent ?? document.body.textContent ?? "").slice(0, 4000),
            overflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
            viewportH: window.innerHeight,
            testids: Object.fromEntries(
              [...document.querySelectorAll("[data-testid]")].map((el) => [
                el.getAttribute("data-testid") ?? "",
                (el as HTMLElement).innerText.trim(),
              ]),
            ),
            // WO 0.4 shell V2: ตัวเลขโครงสร้างเมนู — อ่านแยกจาก testids ตรง ๆ เพราะต้อง "นับ" ไม่ใช่อ่านข้อความ
            acc: {
              hasTabbar: !!tabbarEl,
              menuCount: document.querySelectorAll('[data-testid^="acc-menu-"]').length,
              breadcrumbText: document.querySelector('[data-testid="acc-breadcrumb"]')?.textContent?.trim() ?? "",
              // ลิงก์ระดับ 1 ที่เปิดอยู่ (dropdown เดสก์ท็อป หรือ sheet มือถือ) — href="#" ต้องมีชิป "เร็ว ๆ นี้" กำกับเสมอ
              badDeadLink: (() => {
                const scopes = [
                  ...document.querySelectorAll('[role="menu"]'),
                  ...document.querySelectorAll(".fixed.inset-0"),
                ];
                for (const scope of scopes) {
                  for (const a of scope.querySelectorAll("a[href]")) {
                    const href = a.getAttribute("href") ?? "";
                    const hasChip = (a.textContent ?? "").includes("เร็ว ๆ นี้");
                    if (href === "#" && !hasChip) return a.textContent?.trim() ?? "(ไม่มีข้อความ)";
                  }
                }
                return null;
              })(),
              dropdownVisible: isVisible(dropdownEl),
              flyoutVisible: isVisible(document.querySelector('[data-testid="acc-flyout"]')),
              sheetL1Visible: isVisible(document.querySelector('[data-testid="acc-sheet-l1"]')),
              sheetL2Visible: isVisible(document.querySelector('[data-testid="acc-sheet-l2"]')),
              sheetL2HasBackArrow: (() => {
                const sheet = document.querySelector('[data-testid="acc-sheet-l2"]');
                if (!sheet) return false;
                return [...sheet.querySelectorAll("button")].some((b) => (b.getAttribute("aria-label") ?? "") === "ย้อนกลับ");
              })(),
              // Fable QC รอบ 2 ข้อ 1: dropdown ต้องอยู่ใต้แถบเมนูพอดี ไม่ทะลุขอบล่างจอ
              tabbarRect: rectOf(tabbarEl),
              dropdownRect: rectOf(dropdownEl),
            },
          };
        });
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

        // WO 0.4 shell V2 — เช็คโครงสร้างเมนู (ทุกหน้าที่มี layout บัญชี จะมี tabbar/breadcrumb เหมือนกัน)
        if (ASSERT && WO === "0.4") {
          const checks: [boolean, string][] = [
            [probe.acc.hasTabbar, `แถบเมนู [data-testid="acc-tabbar"] มีอยู่จริง`],
            [probe.acc.menuCount === 9, `แถบเมนูมี 9 หมวด (เจอ ${probe.acc.menuCount})`],
            [probe.acc.breadcrumbText.startsWith("บัญชี"), `breadcrumb ขึ้นต้นด้วย "บัญชี" (เจอ "${probe.acc.breadcrumbText}")`],
            [probe.acc.badDeadLink === null, `ไม่มีลิงก์ href="#" ที่ไม่มีชิป "เร็ว ๆ นี้"${probe.acc.badDeadLink ? ` (เจอ "${probe.acc.badDeadLink}")` : ""}`],
          ];
          if (spec.name === "hub") checks.push([status === 200 && probe.h1.length > 0, `account root คืน 200 + มี h1 (h1="${probe.h1}")`]);
          // เช็คที่มาจากบั๊กที่ Fable เจอตอนตรวจภาพจริงรอบ 2: dropdown เปิดด้วยคลิกไม่ค้าง (ปิดเองก่อนถ่าย)
          if (spec.name === "menu-open") {
            if (device === "desktop") checks.push([probe.acc.dropdownVisible, `คลิก "รายรับ" แล้ว dropdown [data-testid="acc-dropdown"] ต้องเปิดค้างอยู่ (rect > 0 + visible)`]);
            else checks.push([probe.acc.sheetL1Visible, `แตะ "รายรับ" แล้ว bottom sheet ชั้น 1 ต้องเปิดอยู่`]);
          }
          if (spec.name === "menu-flyout") {
            checks.push([probe.acc.dropdownVisible, `dropdown ระดับ 1 ยังเปิดอยู่ขณะ hover เข้ารายการ`]);
            checks.push([probe.acc.flyoutVisible, `hover "ใบแจ้งหนี้" แล้ว flyout ระดับ 2 [data-testid="acc-flyout"] ต้องเปิด (f2 พาเนลขวา)`]);
            // Fable QC รอบ 2 ข้อ 1: dropdown ต้องอยู่ใต้แถบเมนูพอดี (top ≥ ก้นแถบเมนู) และไม่ทะลุขอบล่างจอ
            if (probe.acc.tabbarRect && probe.acc.dropdownRect) {
              const tb = probe.acc.tabbarRect;
              const dd = probe.acc.dropdownRect;
              checks.push([
                dd.top >= tb.bottom - 1, // เผื่อ 1px ปัดเศษ subpixel
                `dropdown.top (${dd.top.toFixed(1)}) ≥ แถบเมนู.bottom (${tb.bottom.toFixed(1)})`,
              ]);
              checks.push([
                dd.bottom <= probe.viewportH + 1,
                `dropdown.bottom (${dd.bottom.toFixed(1)}) ≤ ความสูงจอ (${probe.viewportH})`,
              ]);
            } else {
              checks.push([false, `อ่าน getBoundingClientRect ของแถบเมนู/dropdown ไม่ได้ (element หาย)`]);
            }
          }
          if (spec.name === "sheet-l2") {
            checks.push([probe.acc.sheetL2Visible, `แตะ "ใบแจ้งหนี้" แล้ว sheet ชั้น 2 [data-testid="acc-sheet-l2"] ต้องเปิด (g18)`]);
            checks.push([probe.acc.sheetL2HasBackArrow, `sheet ชั้น 2 ต้องมีปุ่มย้อนกลับ (‹) ในหัว`]);
          }
          for (const [ok, label] of checks) {
            if (!ok) failures++;
            console.log(`  ${ok ? "✅" : "❌"} [${spec.name}/${device}] ${label}`);
          }

          // Fable QC รอบ 2 ข้อ 2: ตัวนับใน flyout ต้องตรงกับ tabCounts จริงของหน้ารายการ (แหล่งเดียวกัน ไม่ใช่สูตรที่สอง)
          // เทียบ DOM (badge ที่ AccountTabBar เรนเดอร์จาก accountFlyoutCounts()) กับผลลัพธ์ตรงจาก listDocumentsPaged()
          // ที่ query DB จริงด้วยฟิลเตอร์เดียวกับหน้ารายการ (excludeOverdue) — เป็นแหล่งอิสระคนละทาง ไม่ใช่เช็คฟังก์ชันกับตัวเอง
          if (spec.name === "menu-flyout" && device === "desktop" && listDocumentsPaged) {
            const ldp = listDocumentsPaged; // alias เพื่อให้ TS narrow ทะลุ Promise.all ได้ (let ไม่ narrow ข้าม closure)
            const awaiting: { total: number } = await ldp(E.tenantId, SYS, { docType: "INVOICE", status: "AWAITING_PAYMENT", excludeOverdue: true, pageSize: 1 });
            const overdue: { total: number } = await ldp(E.tenantId, SYS, { docType: "INVOICE", status: "OVERDUE", pageSize: 1 });
            const all: { total: number } = await ldp(E.tenantId, SYS, { docType: "INVOICE", status: "ALL", pageSize: 1 });
            const domChecks: [string, number][] = [
              ["acc-count-INVOICE:awaiting", awaiting.total],
              ["acc-count-INVOICE:overdue", overdue.total],
              ["acc-count-INVOICE:all", all.total],
            ];
            for (const [tid, expected] of domChecks) {
              const got = probe.testids[tid];
              const ok = String(got ?? "") === String(expected);
              if (!ok) failures++;
              console.log(`  ${ok ? "✅" : "❌"} [${spec.name}/${device}] [data-testid="${tid}"] = ${JSON.stringify(got)} · listDocumentsPaged() ตรงจาก DB = ${expected}`);
            }
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
