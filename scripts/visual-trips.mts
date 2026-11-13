// visual-trips.mts — ถ่ายภาพหน้าจอจริงของ RUN TRIPS (จอร้าน) เพื่อทำภาพคู่ MOCKUP|RENDER — เดสก์ท็อป 1440×900 (ภาพคู่) + มือถือ 390×844 (ตรวจล้นแนวนอนเท่านั้น)
// โครงลอกจาก scripts/visual-svc.mts (mint session · puppeteer-core · ตรวจล้นแนวนอน · ลบ session ใน finally) + ขั้นกด/กรอกก่อนถ่าย
//
// ใช้ (ต้องมี QC server ของ TRIPS — production build บน .env.qc-trips · builder ห้าม build ⇒ ผู้คุมเปิด server เอง):
//   bash scripts/iso.sh bash scripts/qc-trips.sh pnpm exec tsx scripts/visual-trips.mts t1.1 --base http://127.0.0.1:<port>
//   … t1.1 --list                       # พิมพ์สเปกของใบ (ไม่ต่อ server · ไม่ mint session)
//   … t1.1 --only settings-unit         # ถ่ายฉากเดียว
//   … t1.1 --ex-date 2026-12-31         # ปักรอบตัวอย่างของราชา (ปริยาย = รอบ ส. 14 พ.ย. ของฟิกซ์เจอร์ · ไม่ขึ้นกับวันนี้)
//   … t1.2 --week 2026-11-11 --month 2026-11 --dec-date 2026-12-31   # T1.2: ปักสัปดาห์/เดือน/รอบราชาของฉากแผง (ปริยาย = ค่าในฟิกซ์เจอร์ · ไม่ขึ้นกับวันนี้)
//   ⚠️ T1.2: สถานะ "เดินทางแล้ว/ออกเรือแล้ว/ต่ำกว่าขั้นต่ำ" ของช่องคิดจากนาฬิกาจริงของ server (หน้าไม่รับเวลา) — ฉากแผง/กล่องตัดสินใช้รอบ 31 ธ.ค. ที่ต่ำกว่าขั้นต่ำจนถึงวันนั้น
// ⚠️ ตัวโหลดใช้นาฬิกาจริง (ตั้งใจ — production): รอบตัวอย่าง/ลูกค้าจะเห็น ปักผ่าน ?ex= ได้เสมอ แต่ "2 รอบถัดไป" และป้าย "ใช้อยู่" ของฤดูกาลขึ้นกับวันที่ถ่าย
//   หรือส่ง base ทาง env: QC_BASE=http://127.0.0.1:<port>
// ภาพคู่: bash scripts/parity-trips.sh <16|17> .qc-shots/trips/t1.1/<ฉาก>-desktop.png .qc-shots/trips/t1.1/<ฉาก>-PARITY.png
//
// 🔴 ไม่มี base ปริยาย · :3215 (server ของ CRM) ⇒ exit 2 · ต่อ server ไม่ได้ ⇒ exit 2 ก่อน mint session
// 🔴 session ที่ mint ปักธง userAgent "qc-visual-trips" แล้วลบ **เฉพาะแถวของรอบนี้** ใน finally (ห้าม process.exit ระหว่าง mint/ถ่าย)
// 🔴 ล้นแนวนอน = ❌ (ทั้ง 1440 และ 390) · HTTP ≥ 400 = ❌ · page error = ❌ · ขั้นกด/กรอกหาเป้าไม่เจอ = ❌ · ภาพ → .qc-shots/trips/<wo>/<ชื่อ>-<desktop|mobile>.png
// 🔴 ฉากที่มีกล่องโต้ตอบ (fullPage: false) ถ่ายเฉพาะจอ — fullPage จะยืดจอแล้วเย็บหน้าหลังกล่องเข้ามา
// 🔴 ผู้ใช้ = เจ้าของร้านตัวอย่าง SHOP_DIVE (seed-trips-qc) · id ของสินค้า/รอบหาจาก slug ตอนรัน (ไม่ฝัง id)
// 🔴 ฉาก settings-similan-warning: กรอกตารางยกเลิก 50/30/0 → กดบันทึก ⇒ กล่องคำเตือน W01 → W03 · ถ่ายก่อนยืนยัน **ไม่กดยืนยัน** (ไม่เขียนฐาน)
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadTripsQcEnv } from "./trips-qc-env.mjs";
import { CALENDAR_WEEK_1111, DEPARTURE_RACHA_1114, RACHA_DEPARTURE_PRICE_1231, SHOP_DIVE, TRIPS_VISUAL_SIMILAN_LADDER } from "./trips-fixture.mjs";

loadTripsQcEnv("visual-trips");

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const UA = "qc-visual-trips";
const SHOTS_DIR = ".qc-shots/trips";
const FORBIDDEN_PORTS = ["3215"];
const VIEWPORT = { width: 1440, height: 900 } as const;
const DEVICES = [
  { device: "desktop", width: VIEWPORT.width, height: VIEWPORT.height, mobile: false },
  { device: "mobile", width: 390, height: 844, mobile: true },
] as const;

// ═══════════════ สเปกภาพ (คีย์ = ใบงาน) ═══════════════
type Ids = { unitSlug: string; racha: string; similan: string; racha1114: string; racha1231: string; week: string; month: string; decWeek: string; shopSlug: string; bookMonth: string; bookDate: string };
type Action =
  | { click: { selector: string; text?: string } }
  | { fill: { selector: string; nth?: number; value: string } }
  | { waitFor: string }
  | { reveal: string }
  | { pause: number };
// TRIPS W1.1 ▸ public = หน้าสาธารณะ: ไม่ใส่คุกกี้ session (บริบทเบราว์เซอร์ใหม่) + ตั้งหัว x-forwarded-for (หน้าต้องรู้ IP) · expectStatus = รหัสสถานะที่ต้องได้ (ปริยาย: ต่ำกว่า 400) ◂
type Spec = { name: string; mockup: "11" | "16" | "17" | "19" | "01"; path: (ids: Ids) => string; actions?: Action[]; fullPage?: boolean; public?: true; expectStatus?: number };
const PUBLIC_CLIENT_IP = "198.51.100.77";
const BOOK_RACHA = "racha-yai-day-trip";
// ตัวแก้ตารางของฟอร์มกลาง (ทะเบียนมี tableTh ของขั้นบันได) — ช่องย่อยมีป้ายไทยต่อช่อง [data-table-cell=<ช่อง>]
const LADDER = '[role="dialog"] [data-setting-key="trips.cancel.ladder"]';
const LADDER_DAYS = `${LADDER} [data-table-cell="fromDaysBefore"] input`;
const LADDER_PCT = `${LADDER} [data-table-cell="refundPct"] input`;
export const TRIPS_VISUAL_SPECS: Record<string, Spec[]> = {
  "t1.1": [
    // ภาพ 16 — ตัวแก้ราชา · รอบตัวอย่างปัก ?ex= (ปริยาย ส. 14 พ.ย. ⇒ ลูกค้าจะเห็น 11,450.00 · --ex-date เปลี่ยนได้)
    { name: "products-racha", mockup: "16", path: (i) => `/app/u/${i.unitSlug}/trips/products?p=${i.racha}&ex=${i.racha1114}` },
    // ภาพ 17 — ค่าตั้งชั้นหน่วย (ต่างจากแม่แบบ 3 · ตั้งรายสินค้า 6)
    { name: "settings-unit", mockup: "17", path: (i) => `/app/u/${i.unitSlug}/trips/settings` },
    // ภาพ 17 การ์ด Liveaboard — ชั้นสินค้าสิมิลัน หมวดยกเลิก: กรอก 60/50 · 31/30 · 0/0 → บันทึก ⇒ กล่อง W01 (สูง) ก่อน W03 · ไม่กดยืนยัน
    {
      name: "settings-similan-warning",
      mockup: "17",
      path: (i) => `/app/u/${i.unitSlug}/trips/settings?scope=PRODUCT&id=${i.similan}&section=cancel`,
      fullPage: false,
      actions: [
        { waitFor: LADDER_DAYS },
        ...TRIPS_VISUAL_SIMILAN_LADDER.flatMap((s, k) => [
          { fill: { selector: LADDER_DAYS, nth: k, value: String(s.fromDaysBefore) } },
          { fill: { selector: LADDER_PCT, nth: k, value: String(s.refundPct) } },
        ]),
        { click: { selector: '[role="dialog"] button', text: "บันทึก" } },
        { waitFor: '[role="alertdialog"]' },
        // จบที่ภาพกล่อง W01 + W03 อยู่ในจอ (กล่องโต้ตอบเลื่อนให้เองด้วย · ขั้นนี้กันพลาด) — ไม่กดยืนยัน
        { reveal: '[role="alertdialog"]' },
        { pause: 600 },
      ],
    },
  ],
  // TRIPS T1.2 ▸ ปฏิทินรอบ (ภาพ 11) — ทุกฉาก 1440 + 390 · วันที่ปักด้วย --week/--month/--dec-date (ไม่พึ่งวันนี้) · กล่องโต้ตอบถ่ายแบบ viewport ◂
  "t1.2": [
    // ภาพ 11 ทั้งหน้า: สัปดาห์ 11–17 พ.ย. + แผงรอบราชา ส. 14 เปิด
    { name: "calendar-week", mockup: "11", path: (i) => `/app/u/${i.unitSlug}/trips/departures?view=week&start=${i.week}&dep=${i.racha1114}` },
    // เดือน พ.ย. 2569 (ตาราง 7 คอลัมน์ · มือถือ = จุด/จำนวน)
    { name: "calendar-month", mockup: "11", path: (i) => `/app/u/${i.unitSlug}/trips/departures?view=month&month=${i.month}` },
    // แผงราชา 31 ธ.ค. → กล่องราคาเฉพาะรอบ 4,500/3,150
    {
      name: "departure-panel",
      mockup: "11",
      path: (i) => `/app/u/${i.unitSlug}/trips/departures?view=week&start=${i.decWeek}&dep=${i.racha1231}`,
      fullPage: false,
      actions: [{ waitFor: '[data-testid="trips-dep-price"]' }, { click: { selector: '[data-testid="trips-dep-price"]' } }, { waitFor: '[data-testid="trips-price-dialog"]' }, { pause: 500 }],
    },
    // แผงราชา 31 ธ.ค. (ต่ำกว่าขั้นต่ำจนถึงวันนั้น) → กล่องตัดสิน 3 ทางเลือก · ไม่กดยืนยัน
    {
      name: "belowmin-decision",
      mockup: "11",
      path: (i) => `/app/u/${i.unitSlug}/trips/departures?view=week&start=${i.decWeek}&dep=${i.racha1231}`,
      fullPage: false,
      actions: [{ waitFor: '[data-testid="trips-dep-decide"]' }, { click: { selector: '[data-testid="trips-dep-decide"]' } }, { waitFor: '[data-testid="trips-decide-dialog"]' }, { pause: 500 }],
    },
  ],
  // TRIPS W1.1 ▸ หน้าจองสาธารณะ /book/[shop] (ภาพ 19 จอใหญ่อังกฤษ · ภาพ 01 จอ ก มือถือไทย) — ทุกฉาก 1440 + 390 · ไม่มีคุกกี้ · เดือน/วันปักด้วย --book-month/--book-date (หน้าใช้นาฬิกาจริง) ◂
  "w1.1": [
    { name: "book-index", mockup: "19", public: true, path: (i) => `/book/${i.shopSlug}` },
    { name: "book-product", mockup: "01", public: true, path: (i) => `/book/${i.shopSlug}/t/${BOOK_RACHA}?m=${i.bookMonth}&d=${i.bookDate}` },
    { name: "book-product-en", mockup: "19", public: true, path: (i) => `/book/${i.shopSlug}/t/${BOOK_RACHA}?lang=en&m=${i.bookMonth}&d=${i.bookDate}` },
    // Liveaboard ที่เผยแพร่แล้วยังไม่เปิดหน้าสาธารณะ ⇒ ต้องได้ 404 จริง
    { name: "book-not-found", mockup: "19", public: true, expectStatus: 404, path: (i) => `/book/${i.shopSlug}/t/similan-4-nights` },
  ],
};

const argv = process.argv.slice(2);
const argOf = (flag: string): string | undefined => {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
};
const WO = argv[0] && !argv[0].startsWith("--") ? argv[0] : "";
const allSpecs = TRIPS_VISUAL_SPECS[WO];
if (!WO || !allSpecs) {
  console.error(`❌ ไม่มีสเปกภาพของใบ "${WO}" — มี: ${Object.keys(TRIPS_VISUAL_SPECS).join(" · ")}`);
  process.exit(2);
}
const only = argOf("--only");
const EX_DATE = argOf("--ex-date") ?? DEPARTURE_RACHA_1114.date;
if (!/^\d{4}-\d{2}-\d{2}$/.test(EX_DATE)) {
  console.error(`❌ --ex-date ต้องเป็น YYYY-MM-DD: ${EX_DATE}`);
  process.exit(2);
}
const WEEK = argOf("--week") ?? CALENDAR_WEEK_1111.rows.racha[0].date;
const MONTH = argOf("--month") ?? WEEK.slice(0, 7);
const DEC_DATE = argOf("--dec-date") ?? RACHA_DEPARTURE_PRICE_1231.date;
const BOOK_DATE = argOf("--book-date") ?? RACHA_DEPARTURE_PRICE_1231.date;
const BOOK_MONTH = argOf("--book-month") ?? BOOK_DATE.slice(0, 7);
for (const [flag, v, re] of [["--week", WEEK, /^\d{4}-\d{2}-\d{2}$/], ["--month", MONTH, /^\d{4}-\d{2}$/], ["--dec-date", DEC_DATE, /^\d{4}-\d{2}-\d{2}$/], ["--book-date", BOOK_DATE, /^\d{4}-\d{2}-\d{2}$/], ["--book-month", BOOK_MONTH, /^\d{4}-\d{2}$/]] as const) {
  if (!re.test(v)) {
    console.error(`❌ ${flag} รูปแบบผิด: ${v}`);
    process.exit(2);
  }
}
const specs = only ? allSpecs.filter((s) => s.name === only) : allSpecs;
if (!specs.length) {
  console.error(`❌ --only ${only} ไม่มีในสเปก ${WO}: ${allSpecs.map((s) => s.name).join(" · ")}`);
  process.exit(2);
}
if (argv.includes("--list")) {
  console.log(`VISUAL_SPECS ${JSON.stringify(specs.map((s) => ({ name: s.name, mockup: s.mockup, actions: s.actions?.length ?? 0, fullPage: s.fullPage !== false, devices: DEVICES.map((d) => `${d.width}x${d.height}`) })))} · exDate ${EX_DATE} · week ${WEEK} · month ${MONTH} · decDate ${DEC_DATE}`);
  process.exit(0);
}
const BASE = (argOf("--base") ?? process.env.QC_BASE ?? "").replace(/\/+$/, "");
if (!BASE) {
  console.error("❌ ไม่ได้ระบุ server — ส่ง --base http://127.0.0.1:<port> หรือ QC_BASE (ไม่มีค่าปริยาย)");
  process.exit(2);
}
let baseUrl: URL;
try {
  baseUrl = new URL(BASE);
} catch {
  console.error(`❌ --base อ่านไม่ได้: ${BASE}`);
  process.exit(2);
}
if (FORBIDDEN_PORTS.includes(baseUrl.port)) {
  console.error(`❌ ${BASE} คือ server ของ CRM (:${baseUrl.port}) — TRIPS ต้องใช้ server ของตัวเอง`);
  process.exit(2);
}
{
  const ping = await fetch(`${BASE}/`, { redirect: "manual", signal: AbortSignal.timeout(8_000) }).catch((e: unknown) => (e instanceof Error ? e : new Error(String(e))));
  if (ping instanceof Error) {
    console.error(`❌ ต่อ QC server ${BASE} ไม่ได้ (${ping.message.slice(0, 80)}) — เปิด server ของ TRIPS ก่อนแล้วรันซ้ำ`);
    process.exit(2);
  }
  console.log(`🌐 QC server ${BASE} ตอบ HTTP ${ping.status}`);
}

const { prisma } = await import("@/lib/core/db");
const { sha256 } = await import("@/lib/core/hash");

const OUT = join(ROOT, SHOTS_DIR, WO);
mkdirSync(OUT, { recursive: true });
class Fatal extends Error {}
const MINE = { sessionIds: [] as string[] };
type Cookie = { name: string; value: string; url?: string; domain?: string; path: string; secure?: boolean };

const owner = SHOP_DIVE.users[0];
async function mintSession(): Promise<Cookie[]> {
  const row = await prisma.user.findUnique({ where: { email: owner.email }, select: { id: true } });
  if (!row) throw new Fatal(`ไม่พบผู้ใช้เจ้าของร้าน (${owner.email}) — รัน scripts/seed-trips-qc.mts ก่อน`);
  const token = "trp" + Math.random().toString(36).slice(2) + Date.now().toString(36) + Math.random().toString(36).slice(2);
  const ttl = new Date(Date.now() + 60 * 60 * 1000);
  const s = await prisma.session.create({ data: { userId: row.id, tokenHash: sha256(token), userAgent: UA, idleExpiresAt: ttl, expiresAt: ttl }, select: { id: true } });
  MINE.sessionIds.push(s.id);
  const tenantId = SHOP_DIVE.tenant.id;
  return baseUrl.protocol === "https:"
    ? [{ name: "__Host-shark_session", value: token, url: BASE, path: "/", secure: true }, { name: "shark_tenant", value: tenantId, url: BASE, path: "/", secure: true }]
    : [{ name: "shark_session", value: token, domain: baseUrl.hostname, path: "/" }, { name: "shark_tenant", value: tenantId, domain: baseUrl.hostname, path: "/" }];
}
async function idsFromSeed(): Promise<Ids> {
  const tenantId = SHOP_DIVE.tenant.id;
  const unit = SHOP_DIVE.units.trips;
  const prod = async (slug: string) => {
    const p = await prisma.tripProduct.findFirst({ where: { tenantId, unitId: unit.id, slug }, select: { id: true } });
    if (!p) throw new Fatal(`ไม่พบสินค้า ${slug} — รัน scripts/seed-trips-qc.mts ก่อน`);
    return p.id;
  };
  const racha = await prod("racha-yai-day-trip");
  const similan = await prod("similan-4-nights");
  const dep = await prisma.tripDeparture.findFirst({ where: { tenantId, unitId: unit.id, productId: racha, localDate: new Date(`${EX_DATE}T00:00:00.000Z`), status: { not: "CANCELLED" } }, select: { id: true } });
  if (!dep) throw new Fatal(`ไม่พบรอบราชา ${EX_DATE} (ที่ไม่ยกเลิก) — รัน seed ก่อน หรือส่ง --ex-date ของรอบที่มีจริง`);
  const dec = await prisma.tripDeparture.findFirst({ where: { tenantId, unitId: unit.id, productId: racha, localDate: new Date(`${DEC_DATE}T00:00:00.000Z`), status: { not: "CANCELLED" } }, select: { id: true } });
  if (!dec && WO === "t1.2") throw new Fatal(`ไม่พบรอบราชา ${DEC_DATE} (ที่ไม่ยกเลิก) — รัน seed ก่อน หรือส่ง --dec-date ของรอบที่มีจริง`);
  const decWeek = new Date(Date.parse(`${DEC_DATE}T00:00:00.000Z`) - 86_400_000).toISOString().slice(0, 10);
  return { unitSlug: unit.slug, racha, similan, racha1114: dep.id, racha1231: dec?.id ?? "", week: WEEK, month: MONTH, decWeek, shopSlug: SHOP_DIVE.tenant.slug, bookMonth: BOOK_MONTH, bookDate: BOOK_DATE };
}

type Page = {
  setViewport(v: object): Promise<void>;
  setCookie(...c: Cookie[]): Promise<void>;
  setExtraHTTPHeaders(h: Record<string, string>): Promise<void>;
  on(ev: string, f: (x: never) => void): void;
  goto(url: string, o: object): Promise<{ status(): number } | null>;
  evaluate<R, A>(f: (a: A) => R, a?: A): Promise<R>;
  waitForSelector(sel: string, o: object): Promise<unknown>;
  screenshot(o: object): Promise<unknown>;
  close(): Promise<void>;
};
type Browser = { newPage(): Promise<Page>; close(): Promise<void>; createBrowserContext?(): Promise<{ newPage(): Promise<Page>; close(): Promise<void> }> };
type Pptr = { default: { launch(o: object): Promise<Browser> } };

/** ขั้นกด/กรอกก่อนถ่าย — หาเป้าไม่เจอ ⇒ ข้อความผิดพลาด (ฉากนั้น ❌) */
async function runAction(page: Page, a: Action): Promise<string | null> {
  if ("pause" in a) {
    await new Promise((r) => setTimeout(r, a.pause));
    return null;
  }
  if ("reveal" in a) {
    const ok = await page.evaluate((sel: string) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      el.scrollIntoView({ block: "start" });
      return true;
    }, a.reveal);
    await new Promise((r) => setTimeout(r, 300));
    return ok ? null : `เลื่อนไป ${a.reveal} ไม่ได้`;
  }
  if ("waitFor" in a) {
    const ok = await page.waitForSelector(a.waitFor, { timeout: 15_000 }).then(() => true).catch(() => false);
    return ok ? null : `รอ ${a.waitFor} ไม่ขึ้น`;
  }
  if ("fill" in a) {
    const ok = await page.evaluate((x: { selector: string; nth: number; value: string }) => {
      const el = document.querySelectorAll(x.selector)[x.nth];
      if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) return false;
      const proto = el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, x.value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }, { selector: a.fill.selector, nth: a.fill.nth ?? 0, value: a.fill.value });
    await new Promise((r) => setTimeout(r, 150));
    return ok ? null : `กรอก ${a.fill.selector}[${a.fill.nth ?? 0}] ไม่ได้`;
  }
  const ok = await page.evaluate((x: { selector: string; text: string | null }) => {
    const els = Array.from(document.querySelectorAll(x.selector)).filter((e) => x.text === null || (e.textContent ?? "").trim() === x.text);
    const el = els.find((e) => e instanceof HTMLElement && !(e as HTMLButtonElement).disabled);
    if (!(el instanceof HTMLElement)) return false;
    el.click();
    return true;
  }, { selector: a.click.selector, text: a.click.text ?? null });
  await new Promise((r) => setTimeout(r, 400));
  return ok ? null : `กด ${a.click.selector}${a.click.text ? ` "${a.click.text}"` : ""} ไม่ได้`;
}

let failures = 0;
let fatal = "";
const shots: string[] = [];
const results: { name: string; device: string; mockup: string; status: number; errors: string[]; overflow: boolean; file: string }[] = [];
const profile = `/tmp/chr-trips-${process.pid}`;
try {
  const ids = await idsFromSeed();
  const cookies = specs.some((s) => !s.public) ? await mintSession() : [];
  const pptr = (await import("/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js" as string).catch((e: unknown) => {
    throw new Fatal(`เปิด puppeteer-core ไม่ได้ (${e instanceof Error ? e.message : e})`);
  })) as Pptr;
  const browser = await pptr.default.launch({
    executablePath: "/usr/bin/chromium-browser",
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", `--user-data-dir=${profile}`],
  });
  try {
    for (const spec of specs) for (const dev of DEVICES) {
      // หน้าสาธารณะ: บริบทใหม่ (ไม่มีคุกกี้ของฉากอื่น) + หัว IP ของผู้ใช้ (ไม่พึ่งว่า server เติมให้)
      const ctx = spec.public && browser.createBrowserContext ? await browser.createBrowserContext() : null;
      const page = await (ctx ?? browser).newPage();
      await page.setViewport({ width: dev.width, height: dev.height, deviceScaleFactor: 1, isMobile: dev.mobile, hasTouch: dev.mobile });
      if (spec.public) await page.setExtraHTTPHeaders({ "x-forwarded-for": PUBLIC_CLIENT_IP });
      else await page.setCookie(...cookies);
      const errors: string[] = [];
      page.on("pageerror", (e: never) => errors.push(String((e as Error).message).slice(0, 120)));
      const resp = await page.goto(`${BASE}${spec.path(ids)}`, { waitUntil: "networkidle2", timeout: 90_000 }).catch(() => null);
      await new Promise((r) => setTimeout(r, 1200));
      for (const a of spec.actions ?? []) {
        const err = await runAction(page, a);
        if (err) {
          errors.push(err);
          break;
        }
      }
      if (!spec.actions?.length) await page.evaluate(() => window.scrollTo(0, 0)).catch(() => undefined);
      const overflow = await page.evaluate((vw: number) => document.documentElement.scrollWidth > vw + 2, dev.width).catch(() => false);
      const file = join(OUT, `${spec.name}-${dev.device}.png`);
      await page.screenshot({ path: file, fullPage: spec.fullPage !== false });
      shots.push(file);
      const status = resp?.status() ?? 0;
      const statusOk = spec.expectStatus !== undefined ? status === spec.expectStatus : status > 0 && status < 400;
      const ok = statusOk && !overflow && errors.length === 0;
      if (!ok) failures++;
      results.push({ name: spec.name, device: dev.device, mockup: spec.mockup, status, errors, overflow, file });
      console.log(`  ${ok ? "✅" : "❌"} ${spec.name} [${dev.device} ${dev.width}] (↔ ภาพ ${spec.mockup}) HTTP ${status} → ${file}${overflow ? " · ล้นแนวนอน" : ""}${errors.length ? ` · ${errors.length} ข้อผิดพลาด: ${errors[0]}` : ""}`);
      await page.close();
      await ctx?.close();
    }
  } finally {
    await browser.close();
  }
} catch (e) {
  fatal = e instanceof Fatal ? e.message : `ผิดพลาดกลางคัน — ${e instanceof Error ? (e.stack ?? e.message).slice(0, 400) : String(e)}`;
} finally {
  let count = 0;
  if (MINE.sessionIds.length) count = (await prisma.session.deleteMany({ where: { id: { in: MINE.sessionIds } } })).count;
  const stale = await prisma.session.deleteMany({ where: { userAgent: UA, expiresAt: { lt: new Date() } } });
  await prisma.$disconnect();
  for (const d of [profile, `/tmp/snap-private-tmp/snap.chromium${profile}`]) {
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      /* ไม่มี/ไม่มีสิทธิ์ */
    }
  }
  writeFileSync(join(OUT, "summary.json"), JSON.stringify({ wo: WO, at: new Date().toISOString(), results }, null, 2));
  console.log(`\n🧹 ลบ session ของรอบนี้ ${count}${stale.count ? ` (+ซากหมดอายุ ${stale.count})` : ""} · ภาพ ${shots.length} ใบใน ${OUT}`);
}
if (fatal) console.error(`❌ ${fatal}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ wo: WO, shots: shots.length, failures, fatal: fatal || null })}`);
process.exit(fatal ? 2 : failures > 0 ? 1 : 0);
