// ถ่ายภาพหน้าจอจริงของ "ระบบสมาชิก v2" (RUN Member System) — เดสก์ท็อป 1440×900 + มือถือ 390×844 (fullPage)
//
// ใช้:
//   bash scripts/acc-v2-serve.sh                       # production build บน .env.qc :3215 (ต้องมีก่อน)
//   pnpm exec tsx scripts/visual-member.mts 1.3        # ถ่ายชุดของ WO M1.3 (ดู SPECS ด้านล่าง)
//   pnpm exec tsx scripts/visual-member.mts 1.3 --user thana        # สายตา STAFF สาขาป่าตอง (default owner)
//   pnpm exec tsx scripts/visual-member.mts 2.9 --user customer:M-0001   # สายตาลูกค้า (/m/* · session ลูกค้า — มีตั้งแต่ M2.9)
//   pnpm exec tsx scripts/visual-member.mts path /app/sys/<sys>/member/members   # หน้าเดียวตามใจ
//   bash scripts/acc-v2-serve.sh stop
//
// 🔴 ชื่อไฟล์จงใจไม่ขึ้นต้น qc- (ต้อง build+server+chromium — ไม่เข้า qc:all)
// 🔴 session ที่ mint ต้องถูกลบเสมอ — ปักธง userAgent = "qc-visual-member" (ลบใน finally)
// 🔴 ชื่อคุกกี้ผูกกับ APP_ENV: http = `shark_session` · https = `__Host-shark_session`
// 🔴 ทุกบล็อก "เตรียมของ" ต่อ WO ต้องคืนสภาพใน restoreSeed() (อยู่ใน finally — พังกลางทางก็คืน)
// โครง/ขั้นตอน (Step) สืบทอดจาก scripts/visual-kanban.mts (K1.5–K3.9)

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
const mq = (await import("./member-qc-env.mts" as string)) as { MQC: Any };
const { MQC } = mq;
const { prisma } = await import("@/lib/core/db");
const { sha256 } = await import("@/lib/core/hash");

const argv = process.argv.slice(2);
const WO = argv[0] ?? "1.3";
const userKey = argv.includes("--user") ? argv[argv.indexOf("--user") + 1]! : "owner";
const BASE = process.env.QC_BASE ?? "http://127.0.0.1:3215";
const OUT = `${MQC.shotsDir}/${WO}`;
mkdirSync(OUT, { recursive: true });
if (!existsSync(MQC.expectedPath)) { console.error(`❌ ไม่พบเฉลย ${MQC.expectedPath} — รัน seed ก่อน`); process.exit(2); }
const E = JSON.parse(readFileSync(MQC.expectedPath, "utf8"));
const SYS: string = E.systemId;
const MEMBER_BASE = `/app/sys/${SYS}/member`;

type Step =
  | { click: string }
  | { fill: string; value: string }
  | { press: string }
  | { waitFor: string; timeoutMs?: number }
  | { drag: { from: string; to: string; steps?: number } }
  | { dragBy: { on: string; dx: number; dy?: number; steps?: number } }
  | { wait: number }
  | { swipe: { on: string; dx: number } }
  | { upload: { on: string; filePath: string } }
  | { longPress: { on: string; ms?: number } }
  | { scrollTo: string };
type Spec = {
  name: string;
  path: string;
  note?: string;
  steps?: Step[];
  onlyDevice?: "desktop" | "mobile";
  expect?: string[];
  /** งานฝั่งข้อมูลก่อนสเปคนี้ (รันครั้งเดียวต่อสเปค) — ต้องคืนใน restoreSeed() */
  before?: () => Promise<void>;
};

// ── ของชั่วคราวต่อ WO (จำไว้คืนใน restoreSeed) ──
const TMP = { fieldIds: [] as string[], sectionIds: [] as string[] };

const SPECS: Record<string, Spec[]> = {
  // M1.5 — หน้ารวมสมาชิก (ภาพ 01) + สมาชิก 360 (ภาพ 02) · owner / thana (STAFF ป่าตอง — ส่วนสุขภาพต้อง "ซ่อน") / noperm (404)
  "1.5": [
    {
      name: `members-home-${userKey}`,
      path: `${MEMBER_BASE}/members`,
      note: userKey === "owner" ? "เทียบภาพ 01: KPI 6 · แถบกรอง (ค้นหา/ระดับ/สาขา/แท็ก/ฟิลด์กำหนดเอง) + มุมมองบันทึก · ตาราง 10 คอลัมน์ · bulk · เพิ่ม/นำเข้า" : userKey === "thana" ? "ธนาเห็นเฉพาะสมาชิกสาขาป่าตอง (KPI total ตาม scope)" : "ไม่มีสิทธิ์ member.* → 404",
      expect: userKey === "noperm" ? [] : ["[data-testid=members-page]", "[data-testid=members-kpi]", "[data-testid=members-filter]", "[data-testid=members-table]"],
      steps: userKey === "noperm" ? [{ wait: 800 }] : [{ waitFor: "[data-testid=members-table]" }, { wait: 500 }],
    },
    ...(userKey === "noperm" ? [] : [{
      name: `member-360-${userKey}`,
      path: `${MEMBER_BASE}/members/${E.members[0].id}`,
      note: userKey === "owner" ? "เทียบภาพ 02: หัว+ปุ่ม 5 · ตัวเลข 6 · แท็บ 5 · ส่วนตามเลย์เอาต์ (รวมสุขภาพเห็นค่า) · แถบขวา AI/การเชื่อมต่อ/PDPA/ระดับถัดไป" : "ธนา: ส่วนสุขภาพต้องเป็นกล่อง 'ซ่อน' (testid member-360-section-hidden) ไม่มีค่า",
      expect: ["[data-testid=member-360]", "[data-testid=member-360-header]", "[data-testid=member-360-tabs]", "[data-testid=member-360-stats]", ...(userKey === "thana" ? ["[data-testid=member-360-section-hidden]"] : [])],
      steps: [{ waitFor: "[data-testid=member-360]" }, { wait: 500 }],
    }]),
  ],
  // M1.8 — ช่องทางที่มา (ภาพ 13): KPI · แท่งต่อช่องทาง first/last · ตารางลิงก์/QR · โมดัลสร้างลิงก์
  "1.8": [
    {
      name: `settings-sources-${userKey}`,
      path: `${MEMBER_BASE}/settings/sources`,
      note: userKey === "owner" ? "เทียบภาพ 13: KPI · แท่งต่อช่องทาง (first vs last) · ลิงก์/QR ที่มา" : "ธนา → 404",
      expect: userKey === "owner" ? ["[data-testid=sources-page]", "[data-testid=sources-kpi]", "[data-testid=sources-chart]", "[data-testid=sources-links]"] : [],
      steps: userKey === "owner" ? [{ waitFor: "[data-testid=sources-page]" }, { wait: 500 }] : [{ wait: 800 }],
    },
    ...(userKey === "owner" ? [{
      name: "sources-link-new-modal",
      path: `${MEMBER_BASE}/settings/sources`,
      onlyDevice: "desktop" as const,
      note: "กด 'สร้างลิงก์/QR' → โมดัล (ชื่อ/ที่มา/สาขา/แคมเปญ/ต้นทุน) — ถ่ายตอนเปิด",
      expect: ["[data-testid=sources-link-new-modal]"],
      steps: [{ waitFor: "[data-testid=sources-link-new]" }, { click: "[data-testid=sources-link-new]" }, { waitFor: "[data-testid=sources-link-new-modal]" }, { wait: 400 }],
    }] : []),
  ],
  // M1.7 — ตั้งค่าความเป็นส่วนตัว (ภาพ 14): นโยบายเวอร์ชัน · ช่องทางยินยอม · ใครดูอ่อนไหว (ชิปตำแหน่ง HR + เตือนยังไม่ผูก) · บันทึกการดู · คำขอ PDPA · ลบอัตโนมัติ
  "1.7": [
    {
      name: `settings-privacy-${userKey}`,
      path: `${MEMBER_BASE}/settings/privacy`,
      note: userKey === "owner" ? "เทียบภาพ 14 ทั้ง 6 บล็อก · ชิปตำแหน่ง/แผนกจาก HR · คำเตือน 'n คนยังไม่ผูก'" : "ธนา (ไม่มี member.privacy.manage) → 404",
      expect: userKey === "owner" ? ["[data-testid=privacy-page]", "[data-testid=privacy-policies]", "[data-testid=privacy-consent-channels]", "[data-testid=privacy-sensitive]", "[data-testid=privacy-access-log]", "[data-testid=privacy-requests]", "[data-testid=privacy-auto-erase]"] : [],
      steps: userKey === "owner" ? [{ waitFor: "[data-testid=privacy-page]" }, { wait: 500 }] : [{ wait: 800 }],
    },
  ],
  // M1.3 — ตัวออกแบบฟิลด์ · เทียบภาพ ledger/design-member/03-field-designer.png
  //   palette 11 ชนิดซ้าย · ผืนกลางลากเรียงส่วน/ฟิลด์ (dnd-kit) · แผงคุณสมบัติขวา 10 รายการ · ตัวอย่างมือถือ · dropdown เทมเพลต · ตัวนับ n/60
  "1.3": [
    {
      name: `field-designer-${userKey}`,
      path: `${MEMBER_BASE}/settings/fields`,
      note: userKey === "owner"
        ? "เทียบภาพ 03: palette 11 ชนิด · ส่วน (ข้อมูลพื้นฐาน/ช่องทางติดต่อ/ที่อยู่/ข้อมูลภายใน/ข้อมูลดำน้ำ/สุขภาพ 🔒) · ฟิลด์ระบบมีป้าย 'ระบบ' · แผงคุณสมบัติขวา · ตัวอย่างมือถือ · ตัวนับ 33/60 · dropdown เทมเพลตกิจการ"
        : "ธนา (STAFF · ไม่มี member.settings.manage) → 404/ไม่มีสิทธิ์ ไม่ใช่หน้าว่าง",
      expect: userKey === "owner" ? ["[data-testid=field-designer]", "[data-testid=field-palette]", "[data-testid=field-props]", "[data-testid=field-template-select]"] : [],
      steps: userKey === "owner" ? [{ waitFor: "[data-testid=field-designer]" }, { wait: 500 }] : [{ wait: 800 }],
    },
    ...(userKey !== "owner" ? [] : [{
      name: "field-designer-selected",
      path: `${MEMBER_BASE}/settings/fields`,
      onlyDevice: "desktop" as const,
      note: "คลิกฟิลด์ 'ระดับใบรับรอง' → แผงขวาแสดงคุณสมบัติ 10 รายการ (ป้าย/ชนิด/ตัวเลือก/บังคับ/ค่าเริ่มต้น/ไม่ซ้ำ/กรองได้/แสดงในตาราง/ลูกค้าแก้เอง/อ่อนไหว/เก็บประวัติ) และตัวอย่างมือถือเลื่อนไปที่ฟิลด์นั้น",
      expect: ["[data-testid=field-props]", "[data-testid=field-props-label]"],
      steps: [{ waitFor: "[data-testid=field-designer]" }, { click: `[data-testid=field-item-certLevel]` }, { waitFor: "[data-testid=field-props-label]" }, { wait: 400 }],
    }]),
  ],
};

async function restoreSeed(): Promise<void> {
  const P = prisma as Any;
  if (TMP.fieldIds.length) { await P.memberFieldValue.deleteMany({ where: { fieldId: { in: TMP.fieldIds } } }); await P.memberField.deleteMany({ where: { id: { in: TMP.fieldIds } } }); }
  if (TMP.sectionIds.length) await P.memberSection.deleteMany({ where: { id: { in: TMP.sectionIds } } });
}

const specs: Spec[] = WO === "path" ? [{ name: "custom", path: argv[1]! }] : (SPECS[WO] ?? []);
if (specs.length === 0) { console.error(`❌ ไม่มี spec ของ WO ${WO}`); process.exit(2); }

// ── mint session ──
const UA = "qc-visual-member";
const token = "mb" + Math.random().toString(36).slice(2) + Date.now().toString(36);
const ttl = new Date(Date.now() + 60 * 60 * 1000);
let cookies: Any[] = [];
const https = BASE.startsWith("https:");
const host = new URL(BASE).hostname;
const isCustomer = userKey.startsWith("customer:");
if (isCustomer) {
  // M2.9 — session ลูกค้า (platform_auth) · ผู้ทำ M2.9 ต้อง export `mintCustomerSession(customerId, {userAgent})` ที่ `src/lib/modules/member/customer-session.ts`
  const code = userKey.slice("customer:".length);
  const cust = (E.members as Any[]).find((m) => m.memberCode === code) ?? (await prisma.customer.findFirst({ where: { tenantId: E.tenantId, memberCode: code }, select: { id: true } }));
  if (!cust) { console.error(`❌ ไม่พบสมาชิก ${code}`); process.exit(2); }
  const cs = (await import("@/lib/modules/member/customer-session" as string).catch(() => null)) as Any;
  if (!cs?.mintCustomerSession) { console.error("❌ ยังไม่มี customer-session.ts (M2.9)"); process.exit(2); }
  const minted = await cs.mintCustomerSession(cust.id, { userAgent: UA });
  cookies = https
    ? [{ name: minted.cookieName, value: minted.token, url: BASE, path: "/", secure: true }]
    : [{ name: minted.cookieName, value: minted.token, domain: host, path: "/" }];
} else {
  const email = userKey === "owner" ? MQC.ownerEmail : userKey === "manager" ? MQC.managerEmail : userKey === "noperm" ? MQC.noPermEmail : (MQC.staff.find((s: Any) => s.key === userKey)?.email ?? MQC.ownerEmail);
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) { console.error(`❌ ไม่พบผู้ใช้ ${email}`); process.exit(2); }
  await prisma.session.create({ data: { userId: user.id, tokenHash: sha256(token), userAgent: UA, idleExpiresAt: ttl, expiresAt: ttl } });
  cookies = https
    ? [{ name: "__Host-shark_session", value: token, url: BASE, path: "/", secure: true }, { name: "shark_tenant", value: E.tenantId, url: BASE, path: "/", secure: true }]
    : [{ name: "shark_session", value: token, domain: host, path: "/" }, { name: "shark_tenant", value: E.tenantId, domain: host, path: "/" }];
}

let failures = 0;
const shots: string[] = [];
/** สรุปต่อภาพ (HTTP · selector ที่หาไม่เจอ · console error) — เขียนลง `${OUT}/summary-${userKey}.json` ให้ oracle อ่าน */
const results: { name: string; device: string; status: number; missing: string[]; errors: string[]; file: string }[] = [];
try {
  const pptr = await import("/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js" as string);
  const browser = await pptr.default.launch({
    executablePath: "/usr/bin/chromium-browser",
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", `--user-data-dir=/tmp/chr-member-${process.pid}`],
  });
  try {
    for (const spec of specs) {
      if (spec.before) await spec.before();
      const viewports: readonly (readonly [string, number, number])[] = process.env.KQC_VIEWPORTS
        ? process.env.KQC_VIEWPORTS.split(",").map((v) => { const [name, wh] = v.split(":"); const [w, h] = wh!.split("x").map(Number); return [name!, w!, h!] as const; })
        : ([["desktop", 1440, 900], ["mobile", 390, 844]] as const);
      for (const [device, w, h] of viewports) {
        if (spec.onlyDevice && spec.onlyDevice !== device) continue;
        const page = await browser.newPage();
        if (process.env.KQC_UA) await page.setUserAgent(`${await browser.userAgent()} ${process.env.KQC_UA}`);
        await page.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: device === "mobile", hasTouch: device === "mobile" });
        await page.setCookie(...cookies);
        const errors: string[] = [];
        page.on("pageerror", (e: Error) => errors.push(e.message.slice(0, 120)));
        page.on("console", (m: Any) => { if (m.type() === "error") errors.push(String(m.text()).slice(0, 120)); });
        const resp = await page.goto(`${BASE}${spec.path}`, { waitUntil: "domcontentloaded", timeout: 60_000 }).catch(() => null);
        await new Promise((r) => setTimeout(r, 1200));
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
              const sx = a.x + a.width / 2, sy = a.y + a.height / 2, tx = b.x + b.width / 2, ty = b.y + 8;
              await page.mouse.move(sx, sy); await page.mouse.down();
              await new Promise((r) => setTimeout(r, 350));
              const n = step.drag.steps ?? 12;
              for (let i = 1; i <= n; i++) { await page.mouse.move(sx + ((tx - sx) * i) / n, sy + ((ty - sy) * i) / n); await new Promise((r) => setTimeout(r, 30)); }
              await page.mouse.up();
            } else if ("dragBy" in step) {
              const el = await page.$(step.dragBy.on);
              if (!el) throw new Error(`ไม่พบ element สำหรับลาก ${step.dragBy.on}`);
              const bb = (await el.boundingBox())!;
              const sx = bb.x + bb.width / 2, sy = bb.y + bb.height / 2;
              const dx = step.dragBy.dx, dy = step.dragBy.dy ?? 0;
              await page.mouse.move(sx, sy); await page.mouse.down();
              await new Promise((r) => setTimeout(r, 250));
              const n = step.dragBy.steps ?? 10;
              for (let i = 1; i <= n; i++) { await page.mouse.move(sx + (dx * i) / n, sy + (dy * i) / n); await new Promise((r) => setTimeout(r, 30)); }
              await page.mouse.up();
            } else if ("upload" in step) {
              const input = await page.$(step.upload.on);
              if (!input) throw new Error(`ไม่พบ input สำหรับอัปโหลด ${step.upload.on}`);
              await input.uploadFile(step.upload.filePath);
            } else if ("swipe" in step) {
              const el = await page.$(step.swipe.on); const bb = (await el!.boundingBox())!;
              const y = bb.y + bb.height / 2; const x0 = bb.x + bb.width / 2;
              await page.touchscreen.touchStart(x0, y); for (let i = 1; i <= 8; i++) await page.touchscreen.touchMove(x0 + (step.swipe.dx * i) / 8, y); await page.touchscreen.touchEnd();
            } else if ("scrollTo" in step) {
              const sel = step.scrollTo;
              await page.evaluate((q: string) => { document.querySelector(q)?.scrollIntoView({ block: "center", inline: "nearest" }); }, sel);
            } else if ("longPress" in step) {
              const el = await page.$(step.longPress.on);
              if (!el) throw new Error(`ไม่พบ element สำหรับกดค้าง ${step.longPress.on}`);
              const bb = (await el.boundingBox())!;
              await page.touchscreen.touchStart(bb.x + bb.width / 2, bb.y + bb.height / 2);
              await new Promise((r) => setTimeout(r, step.longPress.ms ?? 400));
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
        results.push({ name: spec.name, device, status, missing, errors, file });
        console.log(`  ${ok ? "✅" : "❌"} ${spec.name} [${device}] HTTP ${status} → ${file}${missing.length ? ` · ไม่พบ ${missing.join(",")}` : ""}${errors.length ? ` · console error ${errors.length}: ${errors[0]}` : ""}${spec.note ? `\n       ↳ ${spec.note}` : ""}`);
        await page.close();
      }
    }
  } finally { await browser.close(); }
} finally {
  try { await restoreSeed(); } catch (e) { failures++; console.log(`  ❌ คืนสภาพ seed ไม่สำเร็จ — ${e instanceof Error ? e.message.slice(0, 200) : e}`); }
  const { count } = await prisma.session.deleteMany({ where: { userAgent: UA } });
  if (isCustomer) { try { await (prisma as Any).platformSession.deleteMany({ where: { userAgent: UA } }); } catch { /* ยังไม่มี */ } }
  await prisma.$disconnect();
  writeFileSync(`${OUT}/summary-${userKey}.json`, JSON.stringify({ wo: WO, user: userKey, at: new Date().toISOString(), results }, null, 2));
  console.log(`\n🧹 ลบ session QC ${count} · ภาพ ${shots.length} ใบใน ${OUT} · สรุป summary-${userKey}.json`);
}
console.log(`JSON_SUMMARY ${JSON.stringify({ wo: WO, user: userKey, shots, failures })}`);
process.exit(failures > 0 ? 1 : 0);
