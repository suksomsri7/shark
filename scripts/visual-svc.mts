// visual-svc.mts — ถ่ายภาพหน้าจอจริงของ RUN SVC (จองคิว · หอ · โรงแรม) — เดสก์ท็อป 1440×900 + มือถือ 390×844 (fullPage)
// โครงลอกจาก scripts/visual-crm.mts (mint session · puppeteer-core · ตรวจล้นแนวนอน · ลบ session ใน finally)
//
// ใช้ (ต้องมี QC server ของ SVC — production build บน .env.qc-svc · builder ห้าม build ⇒ ผู้คุมเปิด server เอง):
//   bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/visual-svc.mts r0.2 --base http://127.0.0.1:<port>
//   … r0.2 --user manager --base http://127.0.0.1:<port>      # สายตาบทบาทอื่น (ดู SQC_VISUAL_USERS)
//   … r0.2 --list                                             # พิมพ์ VISUAL_SPECS ของใบ (ไม่ต่อ server · ไม่ mint session)
//   หรือส่ง base ทาง env: QC_BASE=http://127.0.0.1:<port>
//
// 🔴 ไม่มี base ปริยาย: ไม่ส่ง --base/QC_BASE ⇒ exit 2 · :3215 (server ของ CRM) ⇒ exit 2 · --user แปลก ⇒ exit 2
// 🔴 ต่อ server ไม่ได้ ⇒ exit 2 ทันที (≤ 8 วิ) **ก่อน** mint session
// 🔴 session ที่ mint ปักธง userAgent "qc-visual-svc" แล้วลบ **เฉพาะแถวของรอบนี้** ใน finally
//    (mint อยู่ในกรอบ try เสมอ · ห้าม process.exit() ระหว่าง mint/ถ่าย — exit ข้าม finally = token ค้างในฐาน QC)
// 🔴 ล้นแนวนอน = ❌ (exit 1) · HTTP ≥ 400 = ❌ · ภาพ → .qc-shots/svc/<wo>/<ชื่อ>-<desktop|mobile>.png
// 🔴 ชื่อคุกกี้ผูกกับโปรโตคอล: http = `shark_session` · https = `__Host-shark_session` (+ `shark_tenant` = ร้านของผู้ใช้)
// ใบหลังเพิ่มหน้าที่ `SQC_VISUAL_SPECS` ใน scripts/svc-qc-data.mts (คีย์ = ชื่อใบ)
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
import { SQC, SQC_VISUAL_SPECS, SQC_VISUAL_USERS } from "./svc-qc-data.mjs";

// ด่านฐาน: ไม่ใช่ qc-svc ⇒ exit 4 ก่อนทำอะไรทั้งนั้น
loadSvcQcEnv("visual-svc");

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const argOf = (flag: string): string | undefined => {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
};
const WO = argv[0] && !argv[0].startsWith("--") ? argv[0] : "";
const specs = SQC_VISUAL_SPECS[WO];
if (!WO || !specs) {
  console.error(`❌ ไม่มีสเปคภาพของใบ "${WO}" — มี: ${Object.keys(SQC_VISUAL_SPECS).join(" · ")}`);
  process.exit(2);
}
if (argv.includes("--list")) {
  console.log(`VISUAL_SPECS ${JSON.stringify(specs)}`);
  process.exit(0);
}
const userKey = argOf("--user") ?? "owner";
if (!(SQC_VISUAL_USERS as readonly string[]).includes(userKey)) {
  console.error(`❌ --user ${userKey} ไม่รู้จัก — ใช้ได้: ${SQC_VISUAL_USERS.join(" · ")}`);
  process.exit(2);
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
if ((SQC.visual.forbiddenPorts as readonly string[]).includes(baseUrl.port)) {
  console.error(`❌ ${BASE} คือ server ของ CRM (:${baseUrl.port}) — SVC ต้องใช้ server ของตัวเอง`);
  process.exit(2);
}

// ── ด่าน server: ต้องรับสายจริง ก่อน mint session ──
{
  const ping = await fetch(`${BASE}/`, { redirect: "manual", signal: AbortSignal.timeout(8_000) }).catch((e: unknown) => (e instanceof Error ? e : new Error(String(e))));
  if (ping instanceof Error) {
    console.error(`❌ ต่อ QC server ${BASE} ไม่ได้ (${ping.message.slice(0, 80)}) — เปิด server ของ SVC ก่อนแล้วรันซ้ำ`);
    process.exit(2);
  }
  console.log(`🌐 QC server ${BASE} ตอบ HTTP ${ping.status}`);
}

const { prisma } = await import("@/lib/core/db");
const { sha256 } = await import("@/lib/core/hash");

const UA = SQC.visual.userAgent;
const OUT = join(ROOT, SQC.visual.shotsDir, WO);
mkdirSync(OUT, { recursive: true });
/** ข้อผิดพลาดที่ต้องจบด้วย exit 2 — โยนแทน process.exit() เพื่อให้ finally (ลบ session) ทำงาน */
class Fatal extends Error {}
const MINE = { sessionIds: [] as string[] };

type Cookie = { name: string; value: string; url?: string; domain?: string; path: string; secure?: boolean };
async function mintSession(): Promise<Cookie[]> {
  const u = userKey === "other-owner" ? { email: SQC.other.owner.email, tenantId: SQC.other.tenant.id } : { email: SQC.users.find((x) => x.key === userKey)!.email, tenantId: SQC.tenant.id };
  const row = await prisma.user.findUnique({ where: { email: u.email }, select: { id: true } });
  if (!row) throw new Fatal(`ไม่พบผู้ใช้ ${userKey} (${u.email}) — รัน scripts/seed-svc-qc.mts ก่อน`);
  const token = "svc" + Math.random().toString(36).slice(2) + Date.now().toString(36) + Math.random().toString(36).slice(2);
  const ttl = new Date(Date.now() + 60 * 60 * 1000);
  const s = await prisma.session.create({ data: { userId: row.id, tokenHash: sha256(token), userAgent: UA, idleExpiresAt: ttl, expiresAt: ttl }, select: { id: true } });
  MINE.sessionIds.push(s.id);
  return baseUrl.protocol === "https:"
    ? [{ name: "__Host-shark_session", value: token, url: BASE, path: "/", secure: true }, { name: "shark_tenant", value: u.tenantId, url: BASE, path: "/", secure: true }]
    : [{ name: "shark_session", value: token, domain: baseUrl.hostname, path: "/" }, { name: "shark_tenant", value: u.tenantId, domain: baseUrl.hostname, path: "/" }];
}

type Page = {
  setViewport(v: object): Promise<void>;
  setCookie(...c: Cookie[]): Promise<void>;
  on(ev: string, f: (x: never) => void): void;
  goto(url: string, o: object): Promise<{ status(): number } | null>;
  evaluate<R, A>(f: (a: A) => R, a?: A): Promise<R>;
  screenshot(o: object): Promise<unknown>;
  close(): Promise<void>;
};
type Browser = { newPage(): Promise<Page>; close(): Promise<void> };
type Pptr = { default: { launch(o: object): Promise<Browser> } };

let failures = 0;
let fatal = "";
const shots: string[] = [];
const results: { name: string; device: string; status: number; errors: string[]; overflow: boolean; file: string }[] = [];
const profile = `/tmp/chr-svc-${process.pid}`;
try {
  const cookies = await mintSession();
  const pptr = (await import("/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js" as string).catch((e: unknown) => {
    throw new Fatal(`เปิด puppeteer-core ไม่ได้ (${e instanceof Error ? e.message : e})`);
  })) as Pptr;
  const browser = await pptr.default.launch({
    executablePath: "/usr/bin/chromium-browser",
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", `--user-data-dir=${profile}`],
  });
  try {
    for (const spec of specs) {
      for (const [device, w, h] of [["desktop", 1440, 900], ["mobile", 390, 844]] as const) {
        const page = await browser.newPage();
        await page.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: device === "mobile", hasTouch: device === "mobile" });
        await page.setCookie(...cookies);
        const errors: string[] = [];
        page.on("pageerror", (e: never) => errors.push(String((e as Error).message).slice(0, 120)));
        const resp = await page.goto(`${BASE}${spec.path}`, { waitUntil: "domcontentloaded", timeout: 60_000 }).catch(() => null);
        await new Promise((r) => setTimeout(r, 1200));
        await page.evaluate(() => window.scrollTo(0, 0)).catch(() => undefined);
        const overflow = await page.evaluate((vw: number) => document.documentElement.scrollWidth > vw + 2, w).catch(() => false);
        const file = join(OUT, `${spec.name}-${device}.png`);
        await page.screenshot({ path: file, fullPage: true });
        shots.push(file);
        const status = resp?.status() ?? 0;
        const ok = status > 0 && status < 400 && !overflow && errors.length === 0;
        if (!ok) failures++;
        results.push({ name: spec.name, device, status, errors, overflow, file });
        console.log(`  ${ok ? "✅" : "❌"} ${spec.name} [${device}] HTTP ${status} → ${file}${overflow ? " · ล้นแนวนอน" : ""}${errors.length ? ` · page error ${errors.length}: ${errors[0]}` : ""}`);
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
} catch (e) {
  fatal = e instanceof Fatal ? e.message : `ผิดพลาดกลางคัน — ${e instanceof Error ? (e.stack ?? e.message).slice(0, 400) : String(e)}`;
} finally {
  // ลบเฉพาะแถวของรอบนี้ (ห้ามลบด้วย userAgent เปล่า ๆ — รอบที่รันขนานจะตาย) + ซากหมดอายุของรอบที่ถูก kill
  let count = 0;
  if (MINE.sessionIds.length) count = (await prisma.session.deleteMany({ where: { id: { in: MINE.sessionIds } } })).count;
  const stale = await prisma.session.deleteMany({ where: { userAgent: UA, expiresAt: { lt: new Date() } } });
  await prisma.$disconnect();
  // โปรไฟล์ chromium ลบทุกรอบ (เฉพาะของ pid นี้)
  for (const d of [profile, `/tmp/snap-private-tmp/snap.chromium${profile}`]) {
    try { rmSync(d, { recursive: true, force: true }); } catch { /* ไม่มี/ไม่มีสิทธิ์ */ }
  }
  writeFileSync(join(OUT, `summary-${userKey}.json`), JSON.stringify({ wo: WO, user: userKey, at: new Date().toISOString(), results }, null, 2));
  console.log(`\n🧹 ลบ session ของรอบนี้ ${count}${stale.count ? ` (+ซากหมดอายุ ${stale.count})` : ""} · ภาพ ${shots.length} ใบใน ${OUT}`);
}
if (fatal) console.error(`❌ ${fatal}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ wo: WO, user: userKey, shots: shots.length, failures, fatal: fatal || null })}`);
process.exit(fatal ? 2 : failures > 0 ? 1 : 0);
