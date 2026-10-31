// QC — SVC D.6 · มิเตอร์ + จดมือถือ (ไล่ทีละห้อง · ออฟไลน์แล้วส่งทีหลัง · ผิดปกติ 3 แบบ · พักบิล) · oracle ของผู้คุม — builder ห้ามแก้ไฟล์นี้
// สัญญา: ledger/svc-briefs/svc-brief-d.6.md · ledger/SVC-MASTER-PLAN.md แถว D.6 · ledger/DESIGN-DORM-HOTEL.md A3 + ภาคผนวก ก #9 #14 #16 #17 · CC §7 §8
//
// กลุ่มข้อ:
//   S  โครงสร้าง: ไฟล์ · facade · คิว pure · MeterWalk 'use client' ไม่ลาก server · หน้า/ action มีด่านสิทธิ์ · ทะเบียน event · F5/F2 · ไม่มีคำต้องห้าม สคบ.
//   M  createMeter / listMeters — ผูกห้อง · MAIN ต่ออาคาร · ซ้ำ ⇒ DUPLICATE (พร้อมกันก็ไม่ throw) · ข้ามหน่วย/ร้าน ⇒ NOT_FOUND
//   R  submitReadings — idempotent ต่อ มิเตอร์×งวด (ซ้ำ 3 รอบ/พร้อมกัน 3·10 ทาง = 1 แถว) · UPDATED · REJECTED รายการ · ชุดผิด · รูปเป็นไฟล์ส่วนตัว
//   A  ผิดปกติ: ±% เฉลี่ย 3 เดือน (มากกว่าเท่านั้น) · เลขถอยหลังไม่คิดติดลบ · ห้องว่างใช้เกิน · ห้องว่างใช้น้อย = ปกติ · ค่าตั้งระดับหน่วยมีผล
//   E  event dorm.meter.flagged: payload 6 คีย์ · ครั้งเดียวต่อแถว×ป้าย · ไม่มีเมื่อปกติ
//   K  การ์ดบอร์ดงานห้องว่าง: 1 ใบ (sourceKey) · 10 ทางพร้อมกัน = 1 ใบ · ไม่มีบอร์ด = ไม่มีการ์ดแต่ไม่ throw · ลงบอร์ดตามค่าตั้งหมวดซ่อม
//   H  พักบิล (heldRooms) · ยืนยัน/จดใหม่ · LOCKED · เลขถอยหลังยืนยันเฉย ๆ ไม่ได้ · เปลี่ยนมิเตอร์ (หน่วยรวม 2 segment)
//   W  meterWalk / periodUsage — ตามชั้น · ห้องว่างอยู่ในรายการ · ความคืบหน้า · MAIN แยก
//   P  dormAccess — คนจดมิเตอร์เห็นแค่หน้าจด
//   X  ข้ามร้าน/ข้ามหน่วย (ระดับฐานข้อมูลจริง)
//   U  MeterWalk (renderToStaticMarkup) + คิวออฟไลน์ pure
//   Q  ฉากภาพ svcqc (scripts/svc-qc-meter-scene.mts) · V ภาพ (QC_BASE) · G regression · Z ล้างครบ
//
// งวดสัมพัทธ์กับ "เดือนนี้ (ไทย)" · ข้อมูลทดสอบอยู่ใต้ tenant ชั่วคราว slug `qc-svc-d6-*` · ลบใน finally ทุกตารางที่มี tenantId (วนจน FK ไม่ค้าง)
// รัน: bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-d.6.mts
//      ต่อท้าย `--no-regression` ข้ามหมวด G (SKIP — ไม่นับผ่าน · iso.sh ทิ้ง env จึงใช้ SVC_D6_NO_REGRESSION=1 ผ่าน iso ไม่ได้)
/* eslint-disable @typescript-eslint/no-explicit-any */
import { existsSync, readFileSync } from "node:fs";
import { svcQcHostMark } from "./svc-qc-hosts.mjs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "qc-svc-d.6";
const SVC_HOST = svcQcHostMark(); // ORACLE-EDIT (ผู้คุม 31 ต.ค. · ฐานต่อเลน) เดิม "ep-mute-scene"
const FORBIDDEN_HOSTS = ["ep-royal-night", "ep-plain-art", "ep-cool-shadow", "ep-weathered-river", "ep-frosty-lab", "ep-fragrant-thunder"];
const RUN_CMD = "bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-d.6.mts";

// ═══════════════ 0. ด่านฐานข้อมูล ═══════════════
{
  for (const n of ["DATABASE_URL", "DIRECT_URL"] as const) {
    const u = process.env[n] ?? "";
    if (!u) { console.error(`🔴 ${LABEL}: ไม่มี ${n} — รันผ่าน: ${RUN_CMD}`); process.exit(4); }
    const bad = FORBIDDEN_HOSTS.find((h) => u.includes(h));
    if (bad) { console.error(`🔴 ${LABEL}: ${n} ชี้ฐานต้องห้าม (${bad}) — หยุด`); process.exit(4); }
    let hn = "";
    try { hn = new URL(u).hostname; } catch { /* อ่านไม่ได้ = ปฏิเสธ */ }
    if (!hn.includes(SVC_HOST)) { console.error(`🔴 ${LABEL}: ${n} host ไม่ใช่ qc-svc (${SVC_HOST}) — หยุด`); process.exit(4); }
  }
  if (process.env.APP_ENV === "production") { console.error(`🔴 ${LABEL}: APP_ENV=production`); process.exit(4); }
  if (process.env.CI) { console.error(`🔴 ${LABEL}: ห้าม export CI (with-gate-lock ข้าม flock)`); process.exit(4); }
}

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Res = "PASS" | "FAIL" | "SKIP";
const cks: { id: string; res: Res; sev: Sev; why: string }[] = [];
const pass = (id: string, name: string) => { cks.push({ id, res: "PASS", sev: "CRITICAL", why: "" }); console.log(`  ✅ [${id}] ${name}`); };
const fail = (id: string, name: string, why: string, sev: Sev) => { cks.push({ id, res: "FAIL", sev, why }); console.log(`  ❌ [${id}] ${name} — ${why}`); };
const skip = (id: string, name: string, why: string, sev: Sev = "CRITICAL") => { cks.push({ id, res: "SKIP", sev, why }); console.log(`  ⏭️  [${id}] ${name} — SKIP: ${why}`); };
const chk = (id: string, name: string, ok: boolean, why: string, sev: Sev) => (ok ? pass(id, name) : fail(id, name, why, sev));
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 260);
const J = (x: unknown) => { try { return JSON.stringify(x) ?? String(x); } catch { return String(x); } };
const read = (p: string) => (existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), "utf8") : "");
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
const THAI = /[฀-๿]/;

// ═══════════════ งวด (สัมพัทธ์กับเดือนนี้ไทย) ═══════════════
const DAY = 86_400_000;
const TODAY = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const D = (n: number) => addDays(TODAY, n);
const dbDate = (ymd: string) => new Date(`${ymd}T00:00:00Z`);
const P = (k: number) => { const y = Number(TODAY.slice(0, 4)), m = Number(TODAY.slice(5, 7)) - 1 + k; const yy = y + Math.floor(m / 12), mm = ((m % 12) + 12) % 12; return `${yy}-${String(mm + 1).padStart(2, "0")}`; };
const P0 = P(0);
const EV = "dorm.meter.flagged";
const FLAGS = ["HIGH", "LOW", "BACKWARDS", "VACANT_USAGE"];
/** ข้าม G — iso.sh ทิ้ง env ⇒ ส่งเป็นอาร์กิวเมนต์ `--no-regression` (env ใช้ได้เมื่อรันนอก iso) */
const NO_REG = process.argv.includes("--no-regression") || process.env.SVC_D6_NO_REGRESSION === "1";

// ═══════════════ โหลดโมดูล ═══════════════
const { prisma } = (await import("@/lib/core/db")) as { prisma: any };
const DORM_IDX = "src/lib/modules/dorm/index.ts";
let dorm: any = null;
let dormWhy = "";
if (!existsSync(join(ROOT, DORM_IDX))) dormWhy = `ยังไม่มี ${DORM_IDX} (facade หอ)`;
else { try { dorm = await import(pathToFileURL(join(ROOT, DORM_IDX)).href); } catch (e) { dormWhy = `import facade dorm ล้ม: ${errMsg(e)}`; } }
const fn = (name: string): ((...a: any[]) => any) | null => (dorm && typeof dorm[name] === "function" ? dorm[name] : null);

const WALK_FILE = "src/components/dorm/MeterWalk.tsx";
let walkMod: any = null;
let walkWhy = "";
if (!existsSync(join(ROOT, WALK_FILE))) walkWhy = `ยังไม่มี ${WALK_FILE}`;
else { try { walkMod = await import(pathToFileURL(join(ROOT, WALK_FILE)).href); } catch (e) { walkWhy = `import MeterWalk ล้ม: ${errMsg(e)}`; } }
const React = (await import("react" as string)) as any;
const RDS = (await import("react-dom/server" as string)) as any;
const WalkC: any = walkMod ? (typeof walkMod.default === "function" ? walkMod.default : typeof walkMod.MeterWalk === "function" ? walkMod.MeterWalk : null) : null;
if (walkMod && !WalkC && !walkWhy) walkWhy = "MeterWalk.tsx ไม่มี default export / export MeterWalk ที่เป็นคอมโพเนนต์";

/** ตัวรันข้อ — needs = ชื่อฟังก์ชันใน facade dorm (ขาด = FAIL ไม่ใช่ SKIP: ของที่ใบต้องส่ง) · ui = ต้องใช้คอมโพเนนต์ */
async function T(id: string, name: string, needs: string[], body: () => Promise<[boolean, string?]>, sev: Sev = "CRITICAL", ui = false) {
  const miss = needs.filter((n) => !fn(n));
  if (miss.length) return fail(id, name, dorm ? `facade dorm ไม่มี ${miss.join(", ")}` : dormWhy, sev);
  if (ui && !WalkC) return fail(id, name, walkWhy || "ไม่มีคอมโพเนนต์ MeterWalk", sev);
  try {
    const [ok, why] = await body();
    if (ok) pass(id, name); else fail(id, name, why ?? "ไม่ตรง", sev);
  } catch (e) {
    fail(id, name, `throw: ${errMsg(e)}`, sev);
  }
}

// ═══════════════ ตัวช่วย render ═══════════════
const render = (props: Record<string, unknown>): string => String(RDS.renderToStaticMarkup(React.createElement(WalkC, props))).replace(/<!-- -->/g, "");
const unesc = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'");
const textOf = (html: string) => unesc(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const attrsOf = (openTag: string): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const m of openTag.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:="([^"]*)")?/g)) if (m[1] !== openTag.slice(1).split(/[\s>]/)[0]) out[m[1].toLowerCase()] = unesc(m[2] ?? "");
  return out;
};
/** ตัดกล่องทุกตัวที่มี attr ชื่อนี้ (แท็กสมดุล) → { attrs, html } */
function boxes(html: string, attr: string): { attrs: Record<string, string>; html: string }[] {
  const out: { attrs: Record<string, string>; html: string }[] = [];
  const re = new RegExp(`\\s${attr}(?:="|[\\s/>])`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const open = html.lastIndexOf("<", m.index);
    const openEnd = html.indexOf(">", m.index);
    const openTag = html.slice(open, openEnd + 1);
    const tag = /^<([a-zA-Z0-9-]+)/.exec(openTag)?.[1] ?? "div";
    let end = openEnd + 1;
    if (!openTag.endsWith("/>") && !["input", "img", "br", "hr"].includes(tag)) {
      const tagRe = new RegExp(`<(/?)${tag}\\b[^>]*?(/?)>`, "g");
      tagRe.lastIndex = open;
      let depth = 0;
      let mm: RegExpExecArray | null;
      while ((mm = tagRe.exec(html))) {
        if (mm[2] === "/") { if (depth === 0) { end = tagRe.lastIndex; break; } continue; }
        depth += mm[1] === "/" ? -1 : 1;
        if (depth === 0) { end = tagRe.lastIndex; break; }
      }
    }
    out.push({ attrs: attrsOf(openTag), html: html.slice(open, end) });
  }
  return out;
}
const LEGAL_BAD = /ล็อ[กค]ห้อง|ล็อ[กค]ประตู|ตัดน้ำ|ตัดไฟ|ระงับ(การ)?(จ่าย)?(น้ำ|ไฟ)|งด(จ่าย)?(น้ำ|ไฟ)|ยึดทรัพย์|ขนของออก/;
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9]);

// ═══════════════ ล้างข้อมูล: ทุกตารางที่มี "tenantId" (วนหลายรอบจน FK RESTRICT ไม่ค้าง) ═══════════════
let tenantTables: string[] | null = null;
async function tablesWithTenant(): Promise<string[]> {
  if (tenantTables) return tenantTables;
  const rows: { t: string }[] = await prisma.$queryRawUnsafe(
    `SELECT c.table_name AS t FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
      WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE'`);
  tenantTables = rows.map((r) => r.t).filter((t) => t !== "Tenant");
  return tenantTables;
}
async function cleanup(tids: string[]) {
  if (!tids.length) return;
  const tables = await tablesWithTenant();
  let pending = [...tables];
  for (let pass = 0; pass < 10 && pending.length; pass++) {
    const next: string[] = [];
    for (const t of pending) {
      try { await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, tids); }
      catch { next.push(t); }
    }
    pending = next;
  }
  if (pending.length) console.log(`  ⚠️ cleanup: ลบไม่หมด ${pending.join(", ")}`);
  try { await prisma.tenant.deleteMany({ where: { id: { in: tids } } }); } catch (e) { console.log(`  ⚠️ cleanup tenant: ${errMsg(e)}`); }
}
async function leftovers(tids: string[]): Promise<{ table: string; n: number }[]> {
  if (!tids.length) return [];
  const out: { table: string; n: number }[] = [];
  for (const t of await tablesWithTenant()) {
    const r: { n: bigint }[] = await prisma.$queryRawUnsafe(`SELECT count(*)::bigint AS n FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, tids);
    const n = Number(r[0]?.n ?? 0);
    if (n) out.push({ table: t, n });
  }
  const tn = await prisma.tenant.count({ where: { id: { in: tids } } });
  if (tn) out.push({ table: "Tenant", n: tn });
  return out;
}

const tenantIds: string[] = [];
try {
  const stale = await prisma.tenant.findMany({ where: { slug: { startsWith: "qc-svc-d6-" } }, select: { id: true } });
  if (stale.length) { console.log(`  (กวาด tenant ค้างจากรอบก่อน ${stale.length})`); await cleanup(stale.map((t: { id: string }) => t.id)); }

  // ═══════════════ S. โครงสร้าง ═══════════════
  console.log("\n── S โครงสร้าง ──");
  const F = {
    meter: "src/lib/modules/dorm/meter.ts",
    access: "src/lib/modules/dorm/access.ts",
    queue: "src/lib/modules/dorm/meter-queue.ts",
    index: DORM_IDX,
    walk: WALK_FILE,
    page: "src/app/app/u/[unitSlug]/dorm/meter/page.tsx",
    actions: "src/app/app/u/[unitSlug]/dorm/meter/actions.ts",
    board: "src/app/app/u/[unitSlug]/dorm/page.tsx",
    scene: "scripts/svc-qc-meter-scene.mts",
  };
  {
    const miss = Object.values(F).filter((p) => !existsSync(join(ROOT, p)));
    chk("S-1", "มีไฟล์ของใบครบ (meter.ts · access.ts · meter-queue.ts · index.ts · MeterWalk.tsx · dorm/meter/page.tsx · actions.ts · ฉาก svc-qc-meter-scene.mts)", !miss.length, `ขาด ${miss.join(", ")}`, "CRITICAL");
  }
  const API = ["createMeter", "listMeters", "submitReadings", "confirmReading", "replaceMeter", "meterWalk", "meterFlags", "heldRooms", "periodUsage", "dormAccess", "enqueueReading", "nextBatch", "settleBatch"];
  {
    const miss = API.filter((n) => !fn(n));
    chk("S-2", "facade @/lib/modules/dorm export ครบ 13 ชื่อ (§3 §5 §6)", !miss.length, dorm ? `ขาด ${miss.join(", ")}` : dormWhy, "CRITICAL");
  }
  const importsOf = (src: string) => [...src.matchAll(/^\s*import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/gm)].map((m) => ({ typeOnly: !!m[1], spec: m[2] }))
    .concat([...src.matchAll(/^\s*import\s+["']([^"']+)["']/gm)].map((m) => ({ typeOnly: false, spec: m[1] })))
    .concat([...src.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)].map((m) => ({ typeOnly: false, spec: m[1] })));
  {
    const q = read(F.queue);
    const bad = importsOf(q).filter((i) => !i.typeOnly).map((i) => i.spec);
    const io = /\bprisma\b|localStorage|indexedDB|fetch\(|process\.env/.test(stripComments(q));
    chk("S-3", "meter-queue.ts pure: ไม่มี import นอกจาก import type · ไม่แตะ prisma/storage/fetch/env", !!q && !bad.length && !io, q ? `import=${bad.join(",") || "—"} io=${io}` : "ยังไม่มีไฟล์", "MAJOR");
  }
  const walkSrc = read(F.walk);
  {
    const useClient = /^(?:\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/))*\s*["']use client["']/.test(walkSrc);
    const BAD = (s: string) => /^@prisma\//.test(s) || /^@\/lib\/core\/(db|tenant-db|outbox|settings|context)/.test(s) || (/^@\/lib\/modules\//.test(s) && s !== "@/lib/modules/dorm/meter-queue") || /^@\/lib\/(platform|automation|webhooks|storage)\//.test(s) || /actions$/.test(s) || /^next\/(navigation|link|headers)$/.test(s);
    const bad = importsOf(walkSrc).filter((i) => !i.typeOnly && BAD(i.spec)).map((i) => i.spec);
    const prismaWord = /\bprisma\b|tenantDb\(/.test(stripComments(walkSrc));
    chk("S-4", "MeterWalk.tsx: 'use client' บรรทัดแรก · ไม่ import prisma/โมดูล server/actions/next hook (ได้เฉพาะ import type + meter-queue) — action รับทาง prop",
      !!walkSrc && useClient && !bad.length && !prismaWord, walkSrc ? `use client=${useClient} import ต้องห้าม=${bad.join(",") || "—"} prisma=${prismaWord}` : "ยังไม่มีไฟล์", "CRITICAL");
  }
  {
    const all = [F.walk, F.page, F.actions, F.meter].map(read).join("\n");
    const legal = LEGAL_BAD.exec(all);
    const money = /฿|Satang|toFixed\(\s*2\s*\)|currency\s*:\s*["']THB/.test(stripComments(walkSrc));
    chk("S-5", "จอ/หน้า/service มิเตอร์ไม่มีคำต้องห้าม สคบ. (ตัดไฟ/ตัดน้ำ/ล็อกห้อง…) · MeterWalk ไม่คิดเงิน (กล่องประมาณเงิน = D.7)", !!walkSrc && !legal && !money, walkSrc ? `คำต้องห้าม=${legal?.[0] ?? "—"} เงิน=${money}` : "ยังไม่มี MeterWalk.tsx", "CRITICAL");
  }
  {
    const p = read(F.page);
    const ok = !!p && !/^\s*["']use client["']/.test(p) && /requireUnit\s*\(/.test(p) && /["']DORM["']/.test(p) && /notFound\s*\(/.test(p) && /dormAccess\s*\(/.test(p) && /\.meter\b/.test(p)
      && /from\s+["']@\/lib\/modules\/dorm["']/.test(p) && !/["']@\/lib\/modules\/dorm\//.test(p) && !/@\/lib\/core\/db|@prisma\//.test(p) && /MeterWalk/.test(p) && /meterWalk\s*\(/.test(p);
    chk("S-6", "หน้า /dorm/meter: server component · requireUnit + DORM เท่านั้น · dormAccess(...).meter ไม่ผ่าน ⇒ notFound · meterWalk ผ่าน facade · ส่งเข้า MeterWalk · ไม่แตะ prisma", ok, p ? "ขาดด่าน/facade/คอมโพเนนต์ (ดู §7)" : "ยังไม่มีไฟล์", "CRITICAL");
  }
  {
    const a = read(F.actions);
    const code = stripComments(a);
    const firstUseServer = /^\s*["']use server["']/.test(code);
    const exportsAll = [...code.matchAll(/^\s*export\s+(?!async\s+function)(\S+)/gm)].map((m) => m[1]);
    const names = ["submitMeterReadingsAction", "confirmMeterReadingAction", "replaceMeterAction"].filter((n) => !new RegExp(`export\\s+async\\s+function\\s+${n}\\b`).test(code));
    const gate = /requireUnit\s*\(/.test(code) && /dormAccess\s*\(/.test(code) && /\.meter\b/.test(code);
    const trustInput = /input\??\.tenantId|tenantId\s*:\s*input\./.test(code);
    chk("S-7", "actions.ts: 'use server' · export async function เท่านั้น (3 ชื่อ) · ด่าน requireUnit + dormAccess(...).meter · ร้าน/ผู้กระทำจาก session ไม่รับ tenantId จาก input",
      !!a && firstUseServer && !exportsAll.length && !names.length && gate && !trustInput, a ? `use server=${firstUseServer} export อื่น=${exportsAll.join(",") || "—"} ขาด=${names.join(",") || "—"} ด่าน=${gate} tenantId จาก input=${trustInput}` : "ยังไม่มีไฟล์", "CRITICAL");
  }
  {
    const b = read(F.board);
    const ok = /dormAccess\s*\(/.test(b) && /\.board\b/.test(b) && /notFound\s*\(/.test(b) && /RoomBoard/.test(b) && /roomBoard\s*\(/.test(b) && /requireUnit\s*\(/.test(b);
    chk("S-8", "หน้า /dorm (ผัง R0.9) เพิ่มด่าน dormAccess(...).board ⇒ notFound · ของเดิม (RoomBoard · roomBoard · requireUnit) ยังอยู่", ok, `dormAccess=${/dormAccess\s*\(/.test(b)} .board=${/\.board\b/.test(b)} R0.9 เดิม=${/RoomBoard/.test(b) && /roomBoard\s*\(/.test(b)}`, "MAJOR");
  }
  {
    let why = "";
    try {
      const pm = (await import("@/lib/core/permissions" as string)) as any;
      for (const k of ["dorm.view", "dorm.meter.read"]) {
        if (!pm.isPermissionKey?.(k)) { why += `${k} ไม่อยู่ในทะเบียน · `; continue; }
        const l = pm.permissionLabel?.(k);
        if (typeof l !== "string" || l === k || !THAI.test(l)) why += `${k} ไม่มีป้ายไทย · `;
      }
      if (pm.moduleOfPermissionKey?.("dorm.meter.read") !== "dorm") why += `moduleOfPermissionKey(dorm.meter.read)=${pm.moduleOfPermissionKey?.("dorm.meter.read")} · `;
    } catch (e) { why = `import permissions ล้ม: ${errMsg(e)}`; }
    chk("S-9", "permissions.ts: โมดูล dorm · คีย์ dorm.view + dorm.meter.read มีป้ายไทย", !why, why, "MAJOR");
  }
  {
    let why = "";
    try {
      const oc = (await import("@/lib/outbox-consumers" as string)) as any;
      const al = (await import("@/lib/automation/labels" as string)) as any;
      const wl = (await import("@/lib/webhooks/labels" as string)) as any;
      const a = typeof oc.consumers?.[EV] === "function";
      const lab = Array.isArray(al.AUTOMATION_EVENTS) ? al.AUTOMATION_EVENTS.find((e: { value: string }) => e.value === EV) : null;
      const c = Array.isArray(wl.WEBHOOK_EVENTS) && wl.WEBHOOK_EVENTS.some((e: { value: string }) => e.value === EV);
      if (!(a && lab && THAI.test(lab.label ?? "") && c)) why = `consumers=${a} automation=${!!lab} ป้ายไทย=${THAI.test(lab?.label ?? "")} webhooks=${c}`;
    } catch (e) { why = `import ทะเบียนล้ม: ${errMsg(e)}`; }
    chk("S-10", `event ${EV} ลง 3 ทะเบียน (ป้ายไทย)`, !why, why, "MAJOR");
  }
  const dormSrcFiles = [F.meter, F.access, F.queue, F.index];
  {
    const raw = dormSrcFiles.filter((f) => /import\s*\{[^}]*\bprisma\b[^}]*\}\s*from\s+["']@\/lib\/core\/db["']/.test(read(f)));
    const anyUse = dormSrcFiles.concat([F.walk, F.page, F.actions]).filter((f) => /:\s*any\b|as\s+any\b|<any>/.test(stripComments(read(f))));
    const getDay = dormSrcFiles.concat([F.walk]).filter((f) => /\.getDay\(\)|\.getDate\(\)|\.getMonth\(\)/.test(stripComments(read(f))));
    chk("S-11", "ไฟล์หอใหม่: ไม่ import prisma ดิบ (fitness F5.1) · ไม่มี any · ไม่มี getDay/getDate/getMonth ดิบ", !raw.length && !anyUse.length && !getDay.length && existsSync(join(ROOT, F.meter)),
      existsSync(join(ROOT, F.meter)) ? `prisma ดิบ=${raw.join(",") || "—"} any=${anyUse.join(",") || "—"} getDay=${getDay.join(",") || "—"}` : "ยังไม่มี meter.ts", "MAJOR");
  }
  {
    const fit = read("scripts/fitness.mts");
    const used = new Set<string>();
    const deep: string[] = [];
    for (const f of dormSrcFiles) for (const i of importsOf(read(f))) {
      const m = /^@\/lib\/modules\/([^/]+)(\/.*)?$/.exec(i.spec);
      if (!m || m[1] === "dorm" || i.typeOnly) continue;
      used.add(m[1]);
      if (m[1] === "kanban" && m[2] !== "/links") deep.push(i.spec);
      if (m[1] !== "kanban" && m[2]) deep.push(i.spec);
    }
    const missing = [...used].filter((x) => !fit.includes(`"dorm→${x}"`));
    chk("S-12", "เส้นข้ามโมดูลของหอมีใน ALLOWED_EDGES ครบ · rooms ผ่าน facade · kanban ผ่าน kanban/links เท่านั้น", existsSync(join(ROOT, F.meter)) && !missing.length && !deep.length,
      existsSync(join(ROOT, F.meter)) ? `ใช้=${[...used].join(",") || "—"} ขาดใน allowlist=${missing.join(",") || "—"} ล้วงลึก=${deep.join(",") || "—"}` : "ยังไม่มี meter.ts", "MAJOR");
  }
  {
    const m = stripComments(read(F.meter));
    const ok = /createCardFromExternal/.test(m) && /rooms\.meter\.anomaly/.test(m) && /meterUnits/.test(m) && /occupancyRange/.test(m) && /emitOutbox\s*\(/.test(m) && /visibility\s*:\s*["']private["']/.test(m);
    chk("S-13", "meter.ts ใช้ชิ้นเดิม: createCardFromExternal · ค่าตั้ง rooms.meter.anomaly · meterUnits (D.1) · occupancyRange · emitOutbox ใน tx · ไฟล์ private", ok,
      `card=${/createCardFromExternal/.test(m)} ค่าตั้ง=${/rooms\.meter\.anomaly/.test(m)} meterUnits=${/meterUnits/.test(m)} occupancyRange=${/occupancyRange/.test(m)} emitOutbox=${/emitOutbox\s*\(/.test(m)} private=${/visibility\s*:\s*["']private["']/.test(m)}`, "MINOR");
  }
  const SV = (await import("./svc-qc-data.mjs" as string)) as any;
  {
    const users: any[] = SV.SQC_USERS ?? [];
    const meterU = users.find((u) => u.key === "meter"), fai = users.find((u) => u.key === "fai");
    const specs = SV.SQC_VISUAL_SPECS?.["d.6"];
    const ok = meterU && J(Object.keys(meterU.permissions).sort()) === J(["dorm.meter.read"]) && fai?.permissions?.["dorm.view"] === true && Array.isArray(specs) && specs.some((s: any) => s.path === `/app/u/${SV.SQC_UNITS.dorm.slug}/dorm/meter`);
    chk("S-14", "(เงื่อนไขก่อน · ผู้คุมตั้งแล้ว) svc-qc-data: ผู้ใช้ meter = dorm.meter.read อย่างเดียว · fai + dorm.view · SQC_VISUAL_SPECS d.6 หน้า /dorm/meter", !!ok, `meter=${J(meterU?.permissions)} fai=${J(fai?.permissions)} specs=${J(specs)}`, "MINOR");
  }

  // ═══════════════ fixtures ═══════════════
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const tA = await prisma.tenant.create({ data: { name: "QC D6 A", slug: `qc-svc-d6-a-${stamp}` } }); tenantIds.push(tA.id);
  const tB = await prisma.tenant.create({ data: { name: "QC D6 B", slug: `qc-svc-d6-b-${stamp}` } }); tenantIds.push(tB.id);
  const A = tA.id, B = tB.id;
  const ACTOR = "qc-d6-actor";
  const ctxA = { tenantId: A, actorUserId: ACTOR }, ctxB = { tenantId: B, actorUserId: "qc-d6-actor-b" };
  const mkUnit = async (tenantId: string, type: string, tag: string) => (await prisma.businessUnit.create({ data: { tenantId, type, name: `หอ D6 ${tag}`, slug: `d6${tag}-${stamp}` } })).id as string;
  const DA = await mkUnit(A, "DORM", "a");     // หน่วยหลัก
  const DA2 = await mkUnit(A, "DORM", "a2");   // ค่าตั้งระดับหน่วย + ข้ามหน่วย
  const DM = await mkUnit(A, "DORM", "m");     // ข้อ M (createMeter)
  const HA = await mkUnit(A, "HOTEL", "h");    // ไม่ใช่ DORM
  const DB = await mkUnit(B, "DORM", "b");
  const mkType = async (tenantId: string, unitId: string) => (await prisma.hotelRoomType.create({ data: { tenantId, unitId, name: "มาตรฐาน", capacity: 2, baseRateSatang: 450000, depositSatang: 0, rentMode: "MONTHLY" } })).id as string;
  const mkBld = async (tenantId: string, unitId: string, name: string) => (await prisma.roomBuilding.create({ data: { tenantId, unitId, name, floors: 3, sortOrder: 1 } })).id as string;
  const mkRoom = async (tenantId: string, unitId: string, typeId: string, bld: string | null, number: string, floorNo: number | null) =>
    (await prisma.hotelRoom.create({ data: { tenantId, unitId, roomTypeId: typeId, number, buildingId: bld, floorNo, floor: floorNo === null ? null : String(floorNo) } })).id as string;
  const lease = (tenantId: string, unitId: string, roomId: string, s: string, e: string, ref: string) =>
    prisma.roomOccupancy.create({ data: { tenantId, unitId, roomId, startDate: dbDate(s), endDate: dbDate(e), kind: "LEASE", refType: "DormLease", refId: ref } });
  const mkMeter = async (tenantId: string, unitId: string, roomId: string | null, kind: string, extra: Record<string, unknown> = {}) =>
    (await prisma.dormMeter.create({ data: { tenantId, unitId, roomId, kind, role: roomId ? "ROOM" : "MAIN", startReading: 900, ...extra } })).id as string;
  /** ประวัติ 4 งวด (P-4..P-1) = 1000/1100/1200/1300 ⇒ หน่วย 3 งวดก่อน = 100 ทุกงวด · เฉลี่ย 100 */
  const history = async (tenantId: string, unitId: string, meterId: string) => {
    for (const [k, v] of [[-4, 1000], [-3, 1100], [-2, 1200], [-1, 1300]] as const)
      await prisma.dormMeterReading.create({ data: { tenantId, unitId, meterId, periodKey: P(k), kind: "PERIOD", value: v, source: "IMPORT", readAt: new Date(`${P(k)}-25T03:00:00Z`) } });
  };

  // ── หน่วยหลัก DA: อาคาร 1 หลัง 2 ชั้น ──
  const tyA = await mkType(A, DA);
  const bA = await mkBld(A, DA, "อาคาร A");
  const R: Record<string, string> = {};
  for (const no of ["101", "102", "103", "104", "105", "106", "201", "202", "203", "204", "205", "206", "207"]) R[no] = await mkRoom(A, DA, tyA, bA, no, Number(no[0]));
  const LEASED = ["101", "102", "103", "104", "105", "106", "201", "206"];
  for (const no of LEASED) await lease(A, DA, R[no], D(-400), D(400), `lease-${no}`);
  await lease(A, DA, R["204"], D(-500), D(-200), "lease-204-old");          // สัญญาจบนานแล้ว ⇒ ห้องว่างในช่วงจด
  const ME: Record<string, string> = {};   // มิเตอร์ไฟ
  const MW: Record<string, string> = {};   // มิเตอร์น้ำ
  for (const no of ["101", "102", "103", "104", "105", "106", "201", "202", "203", "204", "205", "206"]) { ME[no] = await mkMeter(A, DA, R[no], "ELEC"); await history(A, DA, ME[no]); }
  for (const no of ["101", "106", "206"]) { MW[no] = await mkMeter(A, DA, R[no], "WATER"); await history(A, DA, MW[no]); }
  const MAIN = await mkMeter(A, DA, null, "ELEC", { buildingId: bA });
  await history(A, DA, MAIN);
  // ห้อง 207 ไม่มีมิเตอร์ (ต้องไม่อยู่ใน walk)

  // ── DA2: ค่าตั้งระดับหน่วย pct 20 · ห้องว่าง ≤ 30 ──
  const tyA2 = await mkType(A, DA2);
  const bA2 = await mkBld(A, DA2, "อาคาร B");
  const R2: Record<string, string> = {};
  for (const no of ["301", "302", "303"]) R2[no] = await mkRoom(A, DA2, tyA2, bA2, no, 3);
  await lease(A, DA2, R2["301"], D(-400), D(400), "lease-301");
  const M2: Record<string, string> = {};
  for (const no of ["301", "302", "303"]) { M2[no] = await mkMeter(A, DA2, R2[no], "ELEC"); await history(A, DA2, M2[no]); }
  await prisma.settingValue.create({ data: { tenantId: A, key: "rooms.meter.anomaly", scope: "UNIT", scopeId: DA2, value: { pctFromAvg3: 20, vacantMaxUnits: 30, flagBackwards: true }, setById: "qc-d6" } });

  // ── DM: ข้อ M ──
  const tyM = await mkType(A, DM);
  const bM = await mkBld(A, DM, "อาคาร M");
  const RM1 = await mkRoom(A, DM, tyM, bM, "M1", 1), RM2 = await mkRoom(A, DM, tyM, bM, "M2", 1);

  // ── ร้าน B: หอ ห้องว่าง 1 ห้อง · ไม่มีระบบบอร์ดงาน ──
  const tyB = await mkType(B, DB);
  const bB = await mkBld(B, DB, "อาคาร B");
  const RB1 = await mkRoom(B, DB, tyB, bB, "B1", 1);
  const MB1 = await mkMeter(B, DB, RB1, "ELEC");
  await history(B, DB, MB1);

  // ── บอร์ดงานร้าน A: "งานทั่วไป" (เก่าสุด) + "ซ่อมหอ" (ชื่อตามค่าตั้งหมวดซ่อม) ──
  const kSys = (await prisma.appSystem.create({ data: { tenantId: A, type: "KANBAN", name: "บอร์ดงาน D6" } })).id as string;
  const kGeneral = (await prisma.kanbanBoard.create({ data: { tenantId: A, systemId: kSys, name: "งานทั่วไป", createdAt: new Date(Date.now() - 86_400_000) } })).id as string;
  await prisma.kanbanColumn.create({ data: { tenantId: A, systemId: kSys, boardId: kGeneral, name: "ต้องทำ", sortOrder: 0, position: "a0" } });
  const kRepair = (await prisma.kanbanBoard.create({ data: { tenantId: A, systemId: kSys, name: "ซ่อมหอ" } })).id as string;
  await prisma.kanbanColumn.create({ data: { tenantId: A, systemId: kSys, boardId: kRepair, name: "แจ้งเข้า", sortOrder: 0, position: "a0" } });

  const submit = (ctx: any, unitId: string, items: any[], deps?: any): Promise<any> => fn("submitReadings")!(ctx, { unitId, periodKey: P0, items }, deps);
  const one = async (ctx: any, unitId: string, meterId: string, value: number, extra: Record<string, unknown> = {}, deps?: any) => {
    const r = await submit(ctx, unitId, [{ meterId, value, ...extra }], deps);
    return { r, x: r?.ok ? r.results?.[0] : null } as { r: any; x: any };
  };
  const rowsOf = (meterId: string, periodKey = P0) => prisma.dormMeterReading.findMany({ where: { meterId, periodKey, kind: "PERIOD" } });
  const evOf = async (tenantId: string, meterId?: string) => (await prisma.outboxEvent.findMany({ where: { tenantId, type: EV }, orderBy: { createdAt: "asc" } })).filter((e: any) => !meterId || e.payload?.meterId === meterId);
  const cardKey = (meterId: string) => `dorm.meter.vacant:${meterId}:${P0}`;

  // ═══════════════ M. มิเตอร์ ═══════════════
  console.log("\n── M createMeter / listMeters ──");
  let mM1 = "";
  await T("M-1", "createMeter ROOM ผูกห้อง ⇒ ok + แถวตรง (role ROOM · roomId · startReading · tenant/unit) · listMeters เห็น", ["createMeter", "listMeters"], async () => {
    const r = await fn("createMeter")!(ctxA, { unitId: DM, kind: "ELEC", roomId: RM1, startReading: 1287, serial: "E-M1", digits: 5 });
    mM1 = r?.meterId ?? "";
    const row = mM1 ? await prisma.dormMeter.findUnique({ where: { id: mM1 } }) : null;
    const list = await fn("listMeters")!(ctxA, { unitId: DM });
    const ok = r?.ok === true && row?.role === "ROOM" && row?.roomId === RM1 && row?.startReading === 1287 && row?.digits === 5 && row?.tenantId === A && row?.unitId === DM && row?.removedAt === null
      && Array.isArray(list) && list.some((m: any) => m.meterId === mM1 && m.kind === "ELEC" && m.role === "ROOM" && m.roomId === RM1 && m.startReading === 1287);
    return [ok, `${J(r)} row=${J(row && { role: row.role, roomId: row.roomId, startReading: row.startReading })} list=${J(list).slice(0, 160)}`];
  }, "MAJOR");
  await T("M-2", "ห้องเดิมชนิดเดิมซ้ำ ⇒ DUPLICATE (reason ไทย) · ชนิดน้ำของห้องเดียวกัน ⇒ ok", ["createMeter"], async () => {
    const a = await fn("createMeter")!(ctxA, { unitId: DM, kind: "ELEC", roomId: RM1 });
    const b = await fn("createMeter")!(ctxA, { unitId: DM, kind: "WATER", roomId: RM1 });
    const n = await prisma.dormMeter.count({ where: { roomId: RM1, kind: "ELEC", removedAt: null } });
    return [a?.ok === false && a?.code === "DUPLICATE" && THAI.test(a?.reason ?? "") && b?.ok === true && n === 1, `ซ้ำ=${J(a)} น้ำ=${J(b)} ไฟ active=${n}`];
  }, "MAJOR");
  await T("M-3", "MAIN ต่ออาคาร ⇒ ok (roomId null) · MAIN + roomId ⇒ INVALID_INPUT · ROOM ไม่มี roomId ⇒ INVALID_INPUT", ["createMeter"], async () => {
    const a = await fn("createMeter")!(ctxA, { unitId: DM, kind: "ELEC", role: "MAIN", buildingId: bM });
    const row = a?.meterId ? await prisma.dormMeter.findUnique({ where: { id: a.meterId } }) : null;
    const b = await fn("createMeter")!(ctxA, { unitId: DM, kind: "WATER", role: "MAIN", roomId: RM2 });
    const c = await fn("createMeter")!(ctxA, { unitId: DM, kind: "WATER", role: "ROOM" });
    return [a?.ok === true && row?.role === "MAIN" && row?.roomId === null && row?.buildingId === bM && b?.code === "INVALID_INPUT" && c?.code === "INVALID_INPUT", `${J(a)} ${J(b)} ${J(c)}`];
  }, "MAJOR");
  await T("M-4", "ค่าผิด ⇒ INVALID_INPUT ไม่สร้างแถว: kind GAS · startReading −1 · startReading 1.5 · digits 13", ["createMeter"], async () => {
    const before = await prisma.dormMeter.count({ where: { unitId: DM } });
    const rs = [
      await fn("createMeter")!(ctxA, { unitId: DM, kind: "GAS", roomId: RM2 }),
      await fn("createMeter")!(ctxA, { unitId: DM, kind: "ELEC", roomId: RM2, startReading: -1 }),
      await fn("createMeter")!(ctxA, { unitId: DM, kind: "ELEC", roomId: RM2, startReading: 1.5 }),
      await fn("createMeter")!(ctxA, { unitId: DM, kind: "ELEC", roomId: RM2, digits: 13 }),
    ];
    const after = await prisma.dormMeter.count({ where: { unitId: DM } });
    return [rs.every((r) => r?.ok === false && r?.code === "INVALID_INPUT" && THAI.test(r?.reason ?? "")) && after === before, `${rs.map((r) => r?.code).join(",")} แถว ${before}→${after}`];
  }, "MAJOR");
  await T("M-5", "X1: ห้องของหน่วยอื่น/ร้านอื่น · อาคารของหน่วยอื่น · หน่วยไม่ใช่ DORM ⇒ NOT_FOUND · ไม่มีแถว", ["createMeter"], async () => {
    const before = await prisma.dormMeter.count({ where: { tenantId: { in: [A, B] } } });
    const rs = [
      await fn("createMeter")!(ctxA, { unitId: DM, kind: "ELEC", roomId: R2["303"] }),
      await fn("createMeter")!(ctxA, { unitId: DM, kind: "ELEC", roomId: RB1 }),
      await fn("createMeter")!(ctxA, { unitId: DM, kind: "ELEC", role: "MAIN", buildingId: bA }),
      await fn("createMeter")!(ctxA, { unitId: HA, kind: "ELEC", role: "MAIN" }),
      await fn("createMeter")!(ctxB, { unitId: DM, kind: "ELEC", roomId: RM2 }),
    ];
    const after = await prisma.dormMeter.count({ where: { tenantId: { in: [A, B] } } });
    return [rs.every((r) => r?.ok === false && r?.code === "NOT_FOUND") && after === before, `${rs.map((r) => r?.code).join(",")} แถว ${before}→${after}`];
  }, "CRITICAL");
  await T("M-6", "X3: createMeter ห้องเดียวกันชนิดเดียวกันพร้อมกัน 5 ทาง ⇒ ok 1 · DUPLICATE 4 · ไม่ throw · ฐานมี active 1", ["createMeter"], async () => {
    const rs = await Promise.all(Array.from({ length: 5 }, () => fn("createMeter")!(ctxA, { unitId: DM, kind: "ELEC", roomId: RM2 }).catch((e: unknown) => ({ thrown: errMsg(e) }))));
    const n = await prisma.dormMeter.count({ where: { roomId: RM2, kind: "ELEC", removedAt: null } });
    const ok = rs.filter((r: any) => r?.ok === true).length === 1 && rs.filter((r: any) => r?.ok === false && r?.code === "DUPLICATE").length === 4 && n === 1;
    return [ok, `${J(rs.map((r: any) => r?.code ?? (r?.ok ? "ok" : r?.thrown)))} active=${n}`];
  }, "MAJOR");
  await T("M-7", "listMeters: ร้านอื่นขอหน่วยเรา ⇒ [] · หน่วยไม่ใช่ DORM ⇒ []", ["listMeters"], async () => {
    const a = await fn("listMeters")!(ctxB, { unitId: DA });
    const b = await fn("listMeters")!(ctxA, { unitId: HA });
    return [Array.isArray(a) && a.length === 0 && Array.isArray(b) && b.length === 0, `B→A=${a?.length} HOTEL=${b?.length}`];
  }, "CRITICAL");

  // ═══════════════ R. ส่งเลข + idempotent ═══════════════
  console.log("\n── R submitReadings · ส่งซ้ำ = ค่าเดียว ──");
  await T("R-1", "ส่ง 101 ไฟ 1395 ⇒ CREATED · units 95 · ไม่มีป้าย · แถว PERIOD/MANUAL/readById/งวด/หน่วยถูก", ["submitReadings"], async () => {
    const { r, x } = await one(ctxA, DA, ME["101"], 1395);
    const rows = await rowsOf(ME["101"]);
    const row = rows[0];
    const ok = r?.ok === true && x?.status === "CREATED" && x?.meterId === ME["101"] && x?.readingId === row?.id && x?.flag === null && x?.held === false && x?.units === 95
      && rows.length === 1 && row.value === 1395 && row.source === "MANUAL" && row.readById === ACTOR && row.tenantId === A && row.unitId === DA && row.flag === null;
    return [ok, `${J(r).slice(0, 200)} rows=${rows.length} row=${J(row && { value: row.value, source: row.source, readById: row.readById, flag: row.flag })}`];
  });
  await T("R-2", "X4: ส่งซ้ำ 3 รอบ (206 ไฟ 1390) ⇒ CREATED → UNCHANGED → UNCHANGED · แถวเดียว · readingId เดิม · updatedAt ไม่ขยับ", ["submitReadings"], async () => {
    const a = await one(ctxA, DA, ME["206"], 1390);
    const u1 = (await rowsOf(ME["206"]))[0]?.updatedAt?.getTime();
    const b = await one(ctxA, DA, ME["206"], 1390);
    const c = await one(ctxA, DA, ME["206"], 1390);
    const rows = await rowsOf(ME["206"]);
    const ok = [a.x?.status, b.x?.status, c.x?.status].join() === "CREATED,UNCHANGED,UNCHANGED" && rows.length === 1 && rows[0].value === 1390
      && a.x?.readingId === rows[0].id && b.x?.readingId === rows[0].id && c.x?.readingId === rows[0].id && rows[0].updatedAt.getTime() === u1;
    return [ok, `สถานะ=${[a.x?.status, b.x?.status, c.x?.status].join()} แถว=${rows.length} updatedAt ขยับ=${rows[0]?.updatedAt?.getTime() !== u1}`];
  });
  await T("R-3", "X4: คิวออฟไลน์ส่งพร้อมกัน 3 ทาง (101 น้ำ 1395) ⇒ ok ทุกทาง · CREATED 1 · UNCHANGED 2 · ไม่มี REJECTED · แถวเดียว", ["submitReadings"], async () => {
    const rs = await Promise.all([0, 1, 2].map(() => submit(ctxA, DA, [{ meterId: MW["101"], value: 1395, clientKey: "q-101w" }]).catch((e: unknown) => ({ thrown: errMsg(e) }))));
    const st = rs.map((r: any) => r?.results?.[0]?.status ?? r?.code ?? r?.thrown);
    const rows = await rowsOf(MW["101"]);
    return [rs.every((r: any) => r?.ok === true) && st.filter((s) => s === "CREATED").length === 1 && st.filter((s) => s === "UNCHANGED").length === 2 && rows.length === 1, `${J(st)} แถว=${rows.length}`];
  });
  await T("R-4", "คิวออฟไลน์ทั้งชุด (3 รายการ) ส่งซ้ำ 3 รอบ ⇒ ทุกมิเตอร์ 1 แถว · 104 CREATED รอบแรกรอบเดียว", ["submitReadings"], async () => {
    const batch = [{ meterId: ME["101"], value: 1395 }, { meterId: ME["206"], value: 1390 }, { meterId: ME["104"], value: 1450 }];
    const r1 = await submit(ctxA, DA, batch), r2 = await submit(ctxA, DA, batch), r3 = await submit(ctxA, DA, batch);
    const c = await Promise.all([ME["101"], ME["206"], ME["104"]].map(async (m) => (await rowsOf(m)).length));
    const s104 = [r1, r2, r3].map((r: any) => r?.results?.find((x: any) => x.meterId === ME["104"])?.status);
    return [J(c) === "[1,1,1]" && s104.join() === "CREATED,UNCHANGED,UNCHANGED" && [r1, r2, r3].every((r: any) => r?.results?.length === 3), `แถว=${J(c)} 104=${s104.join()}`];
  });
  await T("R-5", "X3: 10 ทางพร้อมกัน (105 ไฟ 1460 = สูงผิดปกติ) ⇒ แถวเดียว · CREATED 1 · event 1", ["submitReadings"], async () => {
    const rs = await Promise.all(Array.from({ length: 10 }, () => submit(ctxA, DA, [{ meterId: ME["105"], value: 1460 }]).catch((e: unknown) => ({ thrown: errMsg(e) }))));
    const st = rs.map((r: any) => r?.results?.[0]?.status ?? r?.code ?? r?.thrown);
    const rows = await rowsOf(ME["105"]);
    const ev = await evOf(A, ME["105"]);
    return [st.filter((s) => s === "CREATED").length === 1 && st.filter((s) => s === "UNCHANGED").length === 9 && rows.length === 1 && ev.length === 1, `${J(st)} แถว=${rows.length} event=${ev.length}`];
  }, "CRITICAL");
  await T("R-6", "ค่าเปลี่ยนก่อนยืนยัน (106 ไฟ 1390 → 1395) ⇒ UPDATED · แถวเดิม (readingId เดิม) ค่าใหม่", ["submitReadings"], async () => {
    const a = await one(ctxA, DA, ME["106"], 1390);
    const b = await one(ctxA, DA, ME["106"], 1395);
    const rows = await rowsOf(ME["106"]);
    return [a.x?.status === "CREATED" && b.x?.status === "UPDATED" && b.x?.readingId === a.x?.readingId && rows.length === 1 && rows[0].value === 1395 && b.x?.units === 95, `${a.x?.status}→${b.x?.status} แถว=${rows.length} ค่า=${rows[0]?.value}`];
  });
  await T("R-7", "REJECTED รายการ (ชุดอื่นทำต่อ): มิเตอร์ร้านอื่น/หน่วยอื่น/ไม่มีจริง ⇒ NOT_FOUND · ค่า −5/1.5 ⇒ INVALID_VALUE · 203 ปกติ ⇒ CREATED · ไม่มีแถวรั่ว", ["submitReadings"], async () => {
    const r = await submit(ctxA, DA, [
      { meterId: ME["203"], value: 1303 }, { meterId: MB1, value: 1310 }, { meterId: M2["303"], value: 1310 }, { meterId: "nope-meter", value: 1 },
      { meterId: MW["106"], value: -5 }, { meterId: MW["206"], value: 1.5 },
    ]);
    const by = (m: string) => r?.results?.find((x: any) => x.meterId === m);
    const leak = (await rowsOf(MB1)).length + (await rowsOf(M2["303"])).length + (await rowsOf(MW["106"])).length + (await rowsOf(MW["206"])).length;
    const ok = r?.ok === true && r.results.length === 6 && by(ME["203"])?.status === "CREATED"
      && [MB1, M2["303"], "nope-meter"].every((m) => by(m)?.status === "REJECTED" && by(m)?.code === "NOT_FOUND" && by(m)?.readingId === null)
      && [MW["106"], MW["206"]].every((m) => by(m)?.status === "REJECTED" && by(m)?.code === "INVALID_VALUE") && leak === 0;
    return [ok, `${J(r?.results?.map((x: any) => `${x.status}/${x.code ?? ""}`))} แถวรั่ว=${leak}`];
  }, "CRITICAL");
  await T("R-8", "ระดับชุด: หน่วยร้านอื่น/หน่วย HOTEL ⇒ NOT_FOUND · periodKey ผิด/items ว่าง ⇒ INVALID_INPUT · 201 รายการ ⇒ TOO_MANY · ไม่มีแถวใหม่", ["submitReadings"], async () => {
    const before = await prisma.dormMeterReading.count({ where: { tenantId: { in: [A, B] } } });
    const S = fn("submitReadings")!;
    const rs = [
      await S(ctxA, { unitId: DB, periodKey: P0, items: [{ meterId: MB1, value: 1310 }] }),
      await S(ctxA, { unitId: HA, periodKey: P0, items: [{ meterId: ME["202"], value: 1310 }] }),
      await S(ctxA, { unitId: DA, periodKey: `${TODAY.slice(0, 4)}-13`, items: [{ meterId: ME["202"], value: 1310 }] }),
      await S(ctxA, { unitId: DA, periodKey: P0, items: [] }),
      await S(ctxA, { unitId: DA, periodKey: P0, items: Array.from({ length: 201 }, () => ({ meterId: ME["202"], value: 1310 })) }),
    ];
    const after = await prisma.dormMeterReading.count({ where: { tenantId: { in: [A, B] } } });
    const codes = rs.map((r: any) => (r?.ok === false ? r.code : "ok"));
    return [J(codes) === J(["NOT_FOUND", "NOT_FOUND", "INVALID_INPUT", "INVALID_INPUT", "TOO_MANY"]) && rs.every((r: any) => THAI.test(r?.reason ?? "")) && after === before, `${J(codes)} แถว ${before}→${after}`];
  }, "MAJOR");
  await T("R-9", "X10: รูปมิเตอร์ (106 น้ำ · ส่งซ้ำ 3 รอบพร้อมรูป) ⇒ FileAsset 1 ไฟล์ · ส่วนตัว (/private/ · cdnUrl ไม่ใช่ http) · photoFileId ผูก · put ครั้งเดียว", ["submitReadings"], async () => {
    let puts = 0;
    const deps = { put: async () => { puts++; } };
    const item = { meterId: MW["106"], value: 1395, photo: { data: JPEG, contentType: "image/jpeg" } };
    for (let i = 0; i < 3; i++) await submit(ctxA, DA, [item], deps);
    const files = await prisma.fileAsset.findMany({ where: { tenantId: A } });
    const row = (await rowsOf(MW["106"]))[0];
    const ok = files.length === 1 && files[0].path.includes("/private/") && !/^https?:/.test(files[0].cdnUrl) && files[0].kind === "ATTACHMENT" && row?.photoFileId === files[0].id && puts === 1;
    return [ok, `ไฟล์=${files.length} path=${files[0]?.path?.replace(/[^/]+$/, "…")} photoFileId ตรง=${row?.photoFileId === files[0]?.id} put=${puts}`];
  }, "MAJOR");
  await T("R-10", "มิเตอร์ MAIN ส่งได้ (1395 + readAt ที่ส่ง) ⇒ CREATED · units 95 · ไม่มีป้ายห้องว่าง · readAt ตรง", ["submitReadings"], async () => {
    const at = new Date(Date.now() - 3_600_000).toISOString();
    const { x } = await one(ctxA, DA, MAIN, 1395, { readAt: at });
    const row = (await rowsOf(MAIN))[0];
    return [x?.status === "CREATED" && x?.units === 95 && x?.flag === null && row?.readAt?.toISOString() === at, `${J(x)} readAt=${row?.readAt?.toISOString()} ต้อง ${at}`];
  }, "MINOR");

  // ═══════════════ A. ผิดปกติ ═══════════════
  console.log("\n── A ผิดปกติ 3 แบบ (ค่าเริ่ม ±50% · ห้องว่าง > 5 · เลขถอยหลัง) ──");
  const flagOf = async (meterId: string) => (await rowsOf(meterId))[0]?.flag ?? null;
  await T("A-1", "102 มีผู้เช่า 1300→1460 = 160 หน่วย (เฉลี่ย 100 · เกิน 150) ⇒ HIGH · พัก · units 160 · แถว flag HIGH", ["submitReadings"], async () => {
    const { x } = await one(ctxA, DA, ME["102"], 1460);
    return [x?.flag === "HIGH" && x?.held === true && x?.units === 160 && (await flagOf(ME["102"])) === "HIGH", J(x)];
  });
  await T("A-2", "103 มีผู้เช่า 1300→1340 = 40 หน่วย (ต่ำกว่า 50) ⇒ LOW · พัก", ["submitReadings"], async () => {
    const { x } = await one(ctxA, DA, ME["103"], 1340);
    return [x?.flag === "LOW" && x?.held === true && x?.units === 40 && (await flagOf(ME["103"])) === "LOW", J(x)];
  });
  await T("A-3", "positive control เกณฑ์: 104 = 150 หน่วยพอดีเกณฑ์ ⇒ ไม่มีป้าย (มากกว่าเท่านั้น) · 101 = 95 ⇒ ไม่มีป้าย", [], async () => {
    const f104 = await flagOf(ME["104"]), f101 = await flagOf(ME["101"]);
    const n104 = (await rowsOf(ME["104"])).length;
    return [n104 === 1 && f104 === null && f101 === null, `104 แถว=${n104} flag=${f104} · 101 flag=${f101}`];
  }, "MAJOR");
  await T("A-4", "201 เลขถอยหลัง 1300→126 ⇒ BACKWARDS · units null (ไม่ติดลบ ไม่ใช่ 0) · พัก", ["submitReadings"], async () => {
    const { x } = await one(ctxA, DA, ME["201"], 126);
    const row = (await rowsOf(ME["201"]))[0];
    return [x?.flag === "BACKWARDS" && x?.units === null && x?.held === true && row?.value === 126 && row?.flag === "BACKWARDS", `${J(x)} row=${row?.value}/${row?.flag}`];
  }, "CRITICAL");
  let card202 = "";
  await T("A-5", "202 ห้องว่าง ใช้ 18 หน่วย (> 5) ⇒ VACANT_USAGE · พัก · cardId", ["submitReadings"], async () => {
    const { x } = await one(ctxA, DA, ME["202"], 1318);
    card202 = x?.cardId ?? "";
    return [x?.flag === "VACANT_USAGE" && x?.held === true && x?.units === 18 && typeof x?.cardId === "string" && !!x.cardId, J(x)];
  }, "CRITICAL");
  await T("A-6", "203 ห้องว่างใช้ 3 หน่วย ⇒ ไม่มีป้าย (จดห้องว่างได้ · ห้องว่างไม่ตรวจ ±% แม้ 3 ≪ เฉลี่ย 100)", [], async () => {
    const rows = await rowsOf(ME["203"]);
    return [rows.length === 1 && rows[0].value === 1303 && rows[0].flag === null, `แถว=${rows.length} flag=${rows[0]?.flag}`];
  }, "MAJOR");
  await T("A-7", "204 สัญญาจบก่อนช่วงจด (D−200) ใช้ 20 หน่วย ⇒ VACANT_USAGE (ห้องว่างดูจาก occupancy ในช่วงจด ไม่ใช่ 'เคยมีสัญญา')", ["submitReadings"], async () => {
    const { x } = await one(ctxA, DA, ME["204"], 1320);
    return [x?.flag === "VACANT_USAGE" && x?.units === 20, J(x)];
  }, "MAJOR");
  await T("A-8", "ค่าตั้งระดับหน่วย (DA2 pct 20 · ห้องว่าง ≤ 30) มีผล: 301 มีผู้เช่า 130 หน่วย ⇒ HIGH · 302 ห้องว่าง 18 หน่วย ⇒ ไม่มีป้าย", ["submitReadings"], async () => {
    const r = await submit(ctxA, DA2, [{ meterId: M2["301"], value: 1430 }, { meterId: M2["302"], value: 1318 }]);
    const a = r?.results?.find((x: any) => x.meterId === M2["301"]), b = r?.results?.find((x: any) => x.meterId === M2["302"]);
    return [a?.flag === "HIGH" && a?.units === 130 && b?.status === "CREATED" && b?.flag === null && b?.units === 18, `301=${J(a)} 302=${J(b)}`];
  }, "MAJOR");
  await T("A-9", "ป้ายที่บันทึกในฐาน = ผลที่คืน (102 HIGH · 103 LOW · 105 HIGH · 201 BACKWARDS · 202/204 VACANT_USAGE) · ค่าป้ายอยู่ใน 4 ค่าที่กำหนด", [], async () => {
    const want: [string, string][] = [["102", "HIGH"], ["103", "LOW"], ["105", "HIGH"], ["201", "BACKWARDS"], ["202", "VACANT_USAGE"], ["204", "VACANT_USAGE"]];
    const got = await Promise.all(want.map(async ([no]) => [no, await flagOf(ME[no])] as const));
    const all = await prisma.dormMeterReading.findMany({ where: { tenantId: A, flag: { not: null } }, select: { flag: true } });
    return [got.every(([no, f], i) => f === want[i][1] && no === want[i][0]) && all.every((r: any) => FLAGS.includes(r.flag)), J(got)];
  }, "MAJOR");

  // ═══════════════ E. event ═══════════════
  console.log(`\n── E event ${EV} ──`);
  await T("E-1", "X8: event ของ 102 = 1 ตัว · payload ตรง 6 คีย์ {unitId,meterId,roomId,readingId,periodKey,flag} ค่าถูก · outbox.unitId = หน่วย · ไม่มี PII", ["submitReadings"], async () => {
    const ev = await evOf(A, ME["102"]);
    const row = (await rowsOf(ME["102"]))[0];
    const p = ev[0]?.payload ?? {};
    const ok = ev.length === 1 && Object.keys(p).sort().join(",") === "flag,meterId,periodKey,readingId,roomId,unitId" && p.unitId === DA && p.meterId === ME["102"] && p.roomId === R["102"]
      && p.readingId === row?.id && p.periodKey === P0 && p.flag === "HIGH" && ev[0].unitId === DA && !/@|\d{9,}/.test(J(p).replace(/"[a-z0-9]{20,}"/g, ""));
    return [ok, `event=${ev.length} ${J(p)}`];
  }, "MAJOR");
  await T("E-2", "X4: ส่ง 102 ค่าเดิมซ้ำอีก 2 รอบ ⇒ event ยัง 1 · 202/204/201/103 มีคนละ 1", ["submitReadings"], async () => {
    await one(ctxA, DA, ME["102"], 1460); await one(ctxA, DA, ME["102"], 1460);
    const n = await Promise.all(["102", "202", "204", "201", "103"].map(async (no) => (await evOf(A, ME[no])).length));
    return [J(n) === "[1,1,1,1,1]", J(n)];
  }, "MAJOR");
  await T("E-3", "ค่าปกติไม่มี event (101 · 104 · 203 · 206 · MAIN) — positive control: แถวงวดนี้ของทั้ง 5 มีอยู่จริง", [], async () => {
    const ms = [ME["101"], ME["104"], ME["203"], ME["206"], MAIN];
    const rows = await Promise.all(ms.map(async (m) => (await rowsOf(m)).length));
    const n = await Promise.all(ms.map(async (m) => (await evOf(A, m)).length));
    return [rows.every((x) => x === 1) && n.every((x) => x === 0), `แถว=${J(rows)} event=${J(n)}`];
  }, "MINOR");

  // ═══════════════ K. การ์ดบอร์ดงานห้องว่าง ═══════════════
  console.log("\n── K การ์ดบอร์ดงาน (ห้องว่างใช้เกิน) ──");
  const cardsOf = (meterId: string) => prisma.kanbanCard.findMany({ where: { tenantId: A, sourceKey: cardKey(meterId) } });
  await T("K-1", "202: การ์ด 1 ใบ sourceKey dorm.meter.vacant:<meterId>:<งวด> · sourceType AUTOMATION · ชื่อมีเลขห้อง 202 + 18 หน่วย · ตรง cardId ที่คืน", [], async () => {
    const cs = await cardsOf(ME["202"]);
    const c = cs[0];
    return [cs.length === 1 && c.sourceType === "AUTOMATION" && /202/.test(c.title) && /18/.test(c.title) && /ห้องว่าง/.test(c.title) && c.id === card202, `การ์ด=${cs.length} ${J(c && { title: c.title, sourceType: c.sourceType, id: c.id === card202 })}`];
  }, "CRITICAL");
  await T("K-2", "X4: 202 ส่งซ้ำ 2 รอบ + ค่าใหม่ที่ยังว่างเกิน (1320) ⇒ การ์ดยัง 1 ใบ · cardId เดิม", ["submitReadings"], async () => {
    const a = await one(ctxA, DA, ME["202"], 1318);
    const b = await one(ctxA, DA, ME["202"], 1318);
    const c = await one(ctxA, DA, ME["202"], 1320);
    const cs = await cardsOf(ME["202"]);
    return [cs.length === 1 && [a.x?.cardId, b.x?.cardId, c.x?.cardId].every((id) => id === cs[0]?.id) && c.x?.status === "UPDATED" && c.x?.flag === "VACANT_USAGE", `การ์ด=${cs.length} ${J([a.x?.cardId === cs[0]?.id, b.x?.cardId === cs[0]?.id, c.x?.cardId === cs[0]?.id, c.x?.status])}`];
  }, "CRITICAL");
  await T("K-3", "X3: 205 ห้องว่าง ส่งพร้อมกัน 10 ทาง ⇒ แถว 1 · การ์ด 1 · event 1 · ไม่มี throw", ["submitReadings"], async () => {
    const rs = await Promise.all(Array.from({ length: 10 }, () => submit(ctxA, DA, [{ meterId: ME["205"], value: 1318 }]).catch((e: unknown) => ({ thrown: errMsg(e) }))));
    const rows = await rowsOf(ME["205"]);
    const cs = await cardsOf(ME["205"]);
    const ev = await evOf(A, ME["205"]);
    return [rs.every((r: any) => r?.ok === true) && rows.length === 1 && cs.length === 1 && ev.length === 1, `ok=${rs.filter((r: any) => r?.ok).length}/10 แถว=${rows.length} การ์ด=${cs.length} event=${ev.length}`];
  }, "CRITICAL");
  await T("K-4", "ร้าน B ไม่มีบอร์ดงาน: ห้องว่างใช้ 10 หน่วย ⇒ CREATED · VACANT_USAGE · cardId null · ไม่ throw · ไม่มีการ์ดในร้าน B", ["submitReadings"], async () => {
    const { r, x } = await one(ctxB, DB, MB1, 1310);
    const n = await prisma.kanbanCard.count({ where: { tenantId: B } });
    return [r?.ok === true && x?.status === "CREATED" && x?.flag === "VACANT_USAGE" && (x?.cardId ?? null) === null && n === 0, `${J(x)} การ์ดร้าน B=${n}`];
  }, "MAJOR");
  await T("K-5", "การ์ดลงบอร์ดตามค่าตั้งหมวดซ่อม (ไฟ → ELECTRIC → \"ซ่อมหอ\") ไม่ใช่บอร์ดเก่าสุด \"งานทั่วไป\" (positive control ตัวเลือกสำรอง)", [], async () => {
    const cs = [...(await cardsOf(ME["202"])), ...(await cardsOf(ME["204"])), ...(await cardsOf(ME["205"]))];
    return [cs.length === 3 && cs.every((c: any) => c.boardId === kRepair), `การ์ด=${cs.length} บอร์ด=${J(cs.map((c: any) => (c.boardId === kRepair ? "ซ่อมหอ" : c.boardId === kGeneral ? "งานทั่วไป" : c.boardId)))}`];
  }, "MINOR");

  // ═══════════════ H. พักบิล · ยืนยัน · เปลี่ยนมิเตอร์ ═══════════════
  console.log("\n── H พักบิล · ยืนยัน · จดใหม่ · เปลี่ยนมิเตอร์ ──");
  const heldSet = async (unitId = DA) => new Set<string>(((await fn("heldRooms")!(ctxA, { unitId, periodKey: P0 })) ?? []) as string[]);
  const nos = (s: Set<string>) => Object.entries(R).filter(([, id]) => s.has(id)).map(([no]) => no).sort();
  await T("H-1", "heldRooms = ห้องที่มีป้ายยังไม่ยืนยัน {102,103,105,201,202,204,205} พอดี (ไม่รวม MAIN · ไม่ซ้ำ)", ["heldRooms"], async () => {
    const raw = await fn("heldRooms")!(ctxA, { unitId: DA, periodKey: P0 });
    const s = new Set<string>(raw);
    return [Array.isArray(raw) && raw.length === s.size && J(nos(s)) === J(["102", "103", "105", "201", "202", "204", "205"]) && s.size === 7, `${J(nos(s))} (ยาว ${raw?.length})`];
  }, "CRITICAL");
  await T("H-2", "meterFlags: 7 แถวที่พัก · 102 HIGH value 1460 prev 1300 units 160 avg3 100 · 201 BACKWARDS units null · roomNumber ถูก", ["meterFlags"], async () => {
    const fl = await fn("meterFlags")!(ctxA, { unitId: DA, periodKey: P0 });
    const f102 = fl?.find((f: any) => f.meterId === ME["102"]), f201 = fl?.find((f: any) => f.meterId === ME["201"]);
    const ok = Array.isArray(fl) && fl.length === 7 && f102?.flag === "HIGH" && f102?.value === 1460 && f102?.prevValue === 1300 && f102?.units === 160 && f102?.avg3 === 100 && f102?.roomNumber === "102" && f102?.roomId === R["102"]
      && f201?.flag === "BACKWARDS" && f201?.units === null && f201?.roomNumber === "201";
    return [ok, `${fl?.length} 102=${J(f102)} 201=${J(f201)}`];
  }, "MAJOR");
  await T("H-3", "ยืนยัน (ACCEPT) 103 LOW ⇒ ok held false · ฐาน confirmedAt/confirmedById = ผู้กระทำ · flag LOW คงไว้เป็นประวัติ · หลุดจาก heldRooms", ["confirmReading", "heldRooms"], async () => {
    const id = (await rowsOf(ME["103"]))[0]?.id;
    const r = await fn("confirmReading")!(ctxA, { unitId: DA, readingId: id, action: "ACCEPT", note: "ผู้เช่าไปต่างจังหวัด" });
    const row = await prisma.dormMeterReading.findUnique({ where: { id } });
    const s = await heldSet();
    return [r?.ok === true && r?.held === false && !!row?.confirmedAt && row?.confirmedById === ACTOR && row?.flag === "LOW" && !s.has(R["103"]), `${J(r)} confirmedBy=${row?.confirmedById} flag=${row?.flag} ยังพัก=${s.has(R["103"])}`];
  }, "CRITICAL");
  await T("H-4", "ยืนยันแล้วล็อก: ส่ง 103 ค่าใหม่ ⇒ LOCKED (ค่าไม่เปลี่ยน) · ค่าเดิม ⇒ UNCHANGED · REREAD ⇒ LOCKED", ["submitReadings", "confirmReading"], async () => {
    const a = await one(ctxA, DA, ME["103"], 1345);
    const b = await one(ctxA, DA, ME["103"], 1340);
    const id = (await rowsOf(ME["103"]))[0]?.id;
    const c = await fn("confirmReading")!(ctxA, { unitId: DA, readingId: id, action: "REREAD", value: 1350 });
    const row = (await rowsOf(ME["103"]))[0];
    return [a.x?.status === "LOCKED" && b.x?.status === "UNCHANGED" && c?.ok === false && c?.code === "LOCKED" && row?.value === 1340, `${a.x?.status} ${b.x?.status} reread=${J(c)} ค่า=${row?.value}`];
  }, "MAJOR");
  await T("H-5", "จดใหม่ (REREAD) 102 → 1390 ⇒ flag null · held false · ฐานค่า 1390 flag null · ไม่มี event เพิ่ม · หลุดจาก heldRooms", ["confirmReading"], async () => {
    const id = (await rowsOf(ME["102"]))[0]?.id;
    const e0 = (await evOf(A, ME["102"])).length;
    const r = await fn("confirmReading")!(ctxA, { unitId: DA, readingId: id, action: "REREAD", value: 1390 });
    const row = await prisma.dormMeterReading.findUnique({ where: { id } });
    const e1 = (await evOf(A, ME["102"])).length;
    const s = await heldSet();
    return [r?.ok === true && r?.flag === null && r?.held === false && r?.units === 90 && row?.value === 1390 && row?.flag === null && e1 === e0 && !s.has(R["102"]), `${J(r)} ค่า=${row?.value} event ${e0}→${e1}`];
  }, "MAJOR");
  await T("H-6", "ป้ายเปลี่ยนชนิด ⇒ event ใหม่: 105 REREAD 1250 (ถอยหลัง) ⇒ BACKWARDS · event ของ 105 = 2 (HIGH, BACKWARDS)", ["confirmReading"], async () => {
    const id = (await rowsOf(ME["105"]))[0]?.id;
    const r = await fn("confirmReading")!(ctxA, { unitId: DA, readingId: id, action: "REREAD", value: 1250 });
    const ev = await evOf(A, ME["105"]);
    return [r?.ok === true && r?.flag === "BACKWARDS" && r?.units === null && ev.length === 2 && J(ev.map((e: any) => e.payload?.flag)) === J(["HIGH", "BACKWARDS"]), `${J(r)} event=${J(ev.map((e: any) => e.payload?.flag))}`];
  }, "MAJOR");
  await T("H-7", "เลขถอยหลังยืนยันเฉย ๆ ไม่ได้: ACCEPT 201 ⇒ BACKWARDS_NEEDS_REPLACE · ฐานไม่เปลี่ยน · REREAD ไม่ส่ง value ⇒ INVALID_INPUT", ["confirmReading"], async () => {
    const row0 = (await rowsOf(ME["201"]))[0];
    const r = await fn("confirmReading")!(ctxA, { unitId: DA, readingId: row0?.id, action: "ACCEPT" });
    const r2 = await fn("confirmReading")!(ctxA, { unitId: DA, readingId: row0?.id, action: "REREAD" });
    const row1 = (await rowsOf(ME["201"]))[0];
    return [r?.ok === false && r?.code === "BACKWARDS_NEEDS_REPLACE" && THAI.test(r?.reason ?? "") && r2?.code === "INVALID_INPUT" && row1?.confirmedAt === null && row1?.updatedAt.getTime() === row0?.updatedAt.getTime(), `${J(r)} ${r2?.code}`];
  }, "CRITICAL");
  await T("H-8", "replaceMeter ปฏิเสธโดยไม่แตะอะไร: เลขตัวเก่า 1200 < ก่อนหน้า 1300 · เลขเริ่มตัวใหม่ 200 > 126 ⇒ INVALID_INPUT · ร้านอื่น ⇒ NOT_FOUND", ["replaceMeter"], async () => {
    const id = (await rowsOf(ME["201"]))[0]?.id;
    const RM = fn("replaceMeter")!;
    const a = await RM(ctxA, { unitId: DA, meterId: ME["201"], oldFinalReading: 1200, newStartReading: 0, readingId: id });
    const b = await RM(ctxA, { unitId: DA, meterId: ME["201"], oldFinalReading: 1350, newStartReading: 200, readingId: id });
    const c = await RM(ctxB, { unitId: DA, meterId: ME["201"], oldFinalReading: 1350, newStartReading: 0, readingId: id });
    const meters = await prisma.dormMeter.findMany({ where: { roomId: R["201"] } });
    return [a?.code === "INVALID_INPUT" && b?.code === "INVALID_INPUT" && c?.code === "NOT_FOUND" && meters.length === 1 && meters[0].removedAt === null, `${a?.code} ${b?.code} ${c?.code} มิเตอร์ห้อง 201=${meters.length}`];
  }, "MAJOR");
  let newMeter201 = "";
  await T("H-9", "replaceMeter 201 (ตัวเก่าถอดที่ 1350 · ตัวใหม่เริ่ม 0 · ย้ายแถว 126) ⇒ units 176 = (1350−1300)+(126−0) · ตัวเก่า removedAt+replacedById · แถว REPLACE 1350 · แถว PERIOD ย้ายไปตัวใหม่ ป้ายหาย · หลุดจาก heldRooms", ["replaceMeter", "heldRooms"], async () => {
    const id = (await rowsOf(ME["201"]))[0]?.id;
    const r = await fn("replaceMeter")!(ctxA, { unitId: DA, meterId: ME["201"], oldFinalReading: 1350, newStartReading: 0, readingId: id, serial: "E-201-new" });
    newMeter201 = r?.newMeterId ?? "";
    const old = await prisma.dormMeter.findUnique({ where: { id: ME["201"] } });
    const nw = newMeter201 ? await prisma.dormMeter.findUnique({ where: { id: newMeter201 } }) : null;
    const rep = await prisma.dormMeterReading.findMany({ where: { meterId: ME["201"], kind: "REPLACE" } });
    const moved = await prisma.dormMeterReading.findUnique({ where: { id } });
    const s = await heldSet();
    const ok = r?.ok === true && r?.oldMeterId === ME["201"] && r?.units === 176 && !!old?.removedAt && old?.replacedById === newMeter201
      && nw?.roomId === R["201"] && nw?.kind === "ELEC" && nw?.role === "ROOM" && nw?.startReading === 0 && nw?.removedAt === null
      && rep.length === 1 && rep[0].value === 1350 && rep[0].periodKey === P0 && moved?.meterId === newMeter201 && moved?.value === 126 && moved?.flag === null && !s.has(R["201"]);
    return [ok, `${J(r)} old.removed=${!!old?.removedAt} replacedBy ตรง=${old?.replacedById === newMeter201} REPLACE=${J(rep.map((x: any) => x.value))} ย้าย=${moved?.meterId === newMeter201}/${moved?.flag}`];
  }, "CRITICAL");
  await T("H-10", "หลังเปลี่ยน: คิวค้างส่งเข้าตัวเก่า ⇒ REJECTED METER_REMOVED · replaceMeter ตัวเก่าซ้ำ ⇒ ok:false · มิเตอร์ห้อง 201 = 2 ตัว (active 1)", ["submitReadings", "replaceMeter"], async () => {
    const { x } = await one(ctxA, DA, ME["201"], 126);
    const again = await fn("replaceMeter")!(ctxA, { unitId: DA, meterId: ME["201"], oldFinalReading: 1350, newStartReading: 0 });
    const all = await prisma.dormMeter.findMany({ where: { roomId: R["201"] } });
    return [x?.status === "REJECTED" && x?.code === "METER_REMOVED" && again?.ok === false && all.length === 2 && all.filter((m: any) => m.removedAt === null).length === 1, `${J(x)} again=${J(again)} มิเตอร์=${all.length}`];
  }, "MAJOR");

  // ═══════════════ W. meterWalk / periodUsage ═══════════════
  console.log("\n── W meterWalk / periodUsage ──");
  let walk: any = null;
  await T("W-1", "meterWalk: 2 ชั้น (ชั้น 1 → ชั้น 2 · key ไม่ซ้ำ) · ห้องเรียงเลข · 207 (ไม่มีมิเตอร์) ไม่อยู่ · ห้องว่าง 202/203/204/205 vacant true · ที่เหลือ false", ["meterWalk"], async () => {
    walk = await fn("meterWalk")!(ctxA, { unitId: DA, periodKey: P0 });
    const fl = walk?.floors ?? [];
    const rooms = fl.flatMap((f: any) => f.rooms ?? []);
    const vac = rooms.filter((x: any) => x.vacant).map((x: any) => x.number).sort();
    const ok = walk?.periodKey === P0 && fl.length === 2 && fl[0].floorNo === 1 && fl[1].floorNo === 2 && /ชั้น 1/.test(fl[0].label) && /ชั้น 2/.test(fl[1].label) && fl[0].key !== fl[1].key
      && J(fl[0].rooms.map((x: any) => x.number)) === J(["101", "102", "103", "104", "105", "106"]) && J(fl[1].rooms.map((x: any) => x.number)) === J(["201", "202", "203", "204", "205", "206"])
      && J(vac) === J(["202", "203", "204", "205"]);
    return [ok, `ชั้น=${J(fl.map((f: any) => `${f.label}:${(f.rooms ?? []).map((x: any) => x.number).join("/")}`))} ว่าง=${J(vac)}`];
  }, "MAJOR");
  await T("W-2", "ความคืบหน้า: rooms 12 · done 11 (206 น้ำยังไม่จด) · flagged 4 (105 · 202 · 204 · 205) · room.flag ถูก", ["meterWalk"], async () => {
    const rooms = (walk?.floors ?? []).flatMap((f: any) => f.rooms ?? []);
    const by = (no: string) => rooms.find((x: any) => x.number === no);
    const flagged = rooms.filter((x: any) => x.flag).map((x: any) => `${x.number}:${x.flag}`).sort();
    const ok = walk?.progress?.rooms === 12 && walk?.progress?.done === 11 && walk?.progress?.flagged === 4 && by("206")?.done === false && by("101")?.done === true
      && J(flagged) === J(["105:BACKWARDS", "202:VACANT_USAGE", "204:VACANT_USAGE", "205:VACANT_USAGE"]);
    return [ok, `${J(walk?.progress)} ป้าย=${J(flagged)}`];
  }, "MAJOR");
  await T("W-3", "รายมิเตอร์: 104 ไฟ prev 1300 value 1450 units 150 · 201 มีแค่ตัวใหม่ prev 0 value 126 units 176 · 206 น้ำ value null readingId null · 106 น้ำ photo true", ["meterWalk"], async () => {
    const rooms = (walk?.floors ?? []).flatMap((f: any) => f.rooms ?? []);
    const m = (no: string, kind: string) => rooms.find((x: any) => x.number === no)?.meters?.filter((y: any) => y.kind === kind) ?? [];
    const [e104] = m("104", "ELEC"), e201 = m("201", "ELEC"), [w206] = m("206", "WATER"), [w106] = m("106", "WATER");
    const ok = e104?.prevValue === 1300 && e104?.value === 1450 && e104?.units === 150 && e201.length === 1 && e201[0].meterId === newMeter201 && e201[0].prevValue === 0 && e201[0].value === 126 && e201[0].units === 176
      && w206?.value === null && w206?.readingId === null && w106?.photo === true;
    return [ok, `104=${J(e104)} 201=${J(e201)} 206W=${J(w206)} 106W.photo=${w106?.photo}`];
  }, "MAJOR");
  await T("W-4", "MAIN อยู่ใน main (ไม่อยู่ในชั้น): value 1395 · units 95 · buildingId", ["meterWalk"], async () => {
    const main = walk?.main ?? [];
    const inFloors = (walk?.floors ?? []).some((f: any) => (f.rooms ?? []).some((x: any) => (x.meters ?? []).some((y: any) => y.meterId === MAIN)));
    return [main.length === 1 && main[0].meterId === MAIN && main[0].value === 1395 && main[0].units === 95 && main[0].buildingId === bA && !inFloors, `${J(main)} ในชั้น=${inFloors}`];
  }, "MINOR");
  await T("W-5", "periodUsage: มิเตอร์ active ทุกตัว (16) · ตัวเก่า 201 ไม่อยู่ · 201 ใหม่ segments 2 ช่วง units 176 · 105 units null held · ไม่มี units ติดลบ", ["periodUsage"], async () => {
    const pu = await fn("periodUsage")!(ctxA, { unitId: DA, periodKey: P0 });
    const by = (id: string) => pu?.find((x: any) => x.meterId === id);
    const n201 = by(newMeter201);
    const ok = Array.isArray(pu) && pu.length === 16 && !by(ME["201"]) && n201?.units === 176 && J(n201?.segments) === J([{ start: 1300, end: 1350 }, { start: 0, end: 126 }])
      && by(ME["105"])?.units === null && by(ME["105"])?.held === true && by(MAIN)?.role === "MAIN" && pu.every((x: any) => x.units === null || (Number.isInteger(x.units) && x.units >= 0));
    return [ok, `แถว=${pu?.length} 201ใหม่=${J(n201)} 105=${J(by(ME["105"]))}`];
  }, "CRITICAL");

  // ═══════════════ P. สิทธิ์ ═══════════════
  console.log("\n── P dormAccess — คนจดมิเตอร์เห็นแค่หน้าจด ──");
  const acc = (m: any, unitId = DA) => fn("dormAccess")!(m, unitId);
  const st = (perms: Record<string, boolean>, ua: string[] = [DA]) => ({ role: "STAFF", unitAccess: ua, permissions: perms });
  await T("P-1", "คนจดมิเตอร์ (STAFF · dorm.meter.read) ⇒ {board:false, meter:true} · หน่วยที่ไม่ได้คุม ⇒ ทั้งคู่ false", ["dormAccess"], async () => {
    const a = await acc(st({ "dorm.meter.read": true })), b = await acc(st({ "dorm.meter.read": true }), DA2);
    return [a?.board === false && a?.meter === true && b?.board === false && b?.meter === false, `${J(a)} หน่วยอื่น=${J(b)}`];
  }, "CRITICAL");
  await T("P-2", "ผู้ดูแล (dorm.view + hotel.room.setStatus) ⇒ {board:true, meter:false} · STAFF ไม่มีสิทธิ์ ⇒ false/false · STAFF dorm.* ⇒ true/true", ["dormAccess"], async () => {
    const a = await acc(st({ "dorm.view": true, "hotel.room.setStatus": true })), b = await acc(st({})), c = await acc(st({ "dorm.*": true }));
    return [a?.board === true && a?.meter === false && b?.board === false && b?.meter === false && c?.board === true && c?.meter === true, `${J(a)} ${J(b)} ${J(c)}`];
  }, "MAJOR");
  await T("P-3", "OWNER ⇒ ทั้งคู่ · MANAGER คุมหน่วย ⇒ ทั้งคู่ · MANAGER ไม่คุมหน่วย/ null ⇒ false/false", ["dormAccess"], async () => {
    const o = await acc({ role: "OWNER", unitAccess: [], permissions: {} }), m1 = await acc({ role: "MANAGER", unitAccess: [DA], permissions: {} }),
      m2 = await acc({ role: "MANAGER", unitAccess: [DA2], permissions: {} }), n = await acc(null);
    return [o?.board && o?.meter && m1?.board && m1?.meter && m2?.board === false && m2?.meter === false && n?.board === false && n?.meter === false, `${J(o)} ${J(m1)} ${J(m2)} ${J(n)}`];
  }, "MAJOR");

  // ═══════════════ X. ข้ามร้าน / ข้ามหน่วย ═══════════════
  console.log("\n── X ข้ามร้าน · ข้ามหน่วย (ระดับฐานข้อมูล) ──");
  await T("X-1", "ร้าน B ส่งเลขเข้ามิเตอร์ร้าน A (ผ่านหน่วยของ B) ⇒ REJECTED NOT_FOUND · แถวของ A ไม่ขยับ (ค่า/updatedAt)", ["submitReadings"], async () => {
    const before = (await rowsOf(ME["101"]))[0];
    const { x } = await one(ctxB, DB, ME["101"], 9999);
    const after = (await rowsOf(ME["101"]))[0];
    const nB = await prisma.dormMeterReading.count({ where: { tenantId: B, meterId: ME["101"] } });
    return [x?.status === "REJECTED" && x?.code === "NOT_FOUND" && after?.value === 1395 && after?.updatedAt.getTime() === before?.updatedAt.getTime() && nB === 0, `${J(x)} ค่า=${after?.value}`];
  }, "CRITICAL");
  await T("X-2", "ร้าน B ใช้ unitId ของ A ⇒ NOT_FOUND ทั้งชุด · ไม่มีแถว/event ใหม่", ["submitReadings"], async () => {
    const r0 = await prisma.dormMeterReading.count({ where: { tenantId: { in: [A, B] } } });
    const e0 = await prisma.outboxEvent.count({ where: { tenantId: { in: [A, B] }, type: EV } });
    const r = await submit(ctxB, DA, [{ meterId: ME["106"], value: 1500 }]);
    const r1 = await prisma.dormMeterReading.count({ where: { tenantId: { in: [A, B] } } });
    const e1 = await prisma.outboxEvent.count({ where: { tenantId: { in: [A, B] }, type: EV } });
    return [r?.ok === false && r?.code === "NOT_FOUND" && r1 === r0 && e1 === e0, `${J(r)} แถว ${r0}→${r1} event ${e0}→${e1}`];
  }, "CRITICAL");
  await T("X-3", "ร้าน B อ่านหน่วย A: meterWalk ว่าง (floors [] · main [] · progress 0) · meterFlags [] · heldRooms [] · periodUsage []", ["meterWalk", "meterFlags", "heldRooms", "periodUsage"], async () => {
    const w = await fn("meterWalk")!(ctxB, { unitId: DA, periodKey: P0 });
    const f = await fn("meterFlags")!(ctxB, { unitId: DA, periodKey: P0 });
    const h = await fn("heldRooms")!(ctxB, { unitId: DA, periodKey: P0 });
    const u = await fn("periodUsage")!(ctxB, { unitId: DA, periodKey: P0 });
    const ok = (w?.floors?.length ?? -1) === 0 && (w?.main?.length ?? -1) === 0 && w?.progress?.rooms === 0 && Array.isArray(f) && !f.length && Array.isArray(h) && !h.length && Array.isArray(u) && !u.length;
    return [ok, `walk=${J(w).slice(0, 120)} flags=${f?.length} held=${h?.length} usage=${u?.length}`];
  }, "CRITICAL");
  await T("X-4", "ข้ามหน่วยร้านเดียวกัน: confirm/replace ด้วย unitId DA กับแถว/มิเตอร์ของ DA2 ⇒ NOT_FOUND · DA2 ไม่ขยับ", ["confirmReading", "replaceMeter"], async () => {
    const row = (await rowsOf(M2["301"]))[0];
    const a = await fn("confirmReading")!(ctxA, { unitId: DA, readingId: row?.id, action: "ACCEPT" });
    const b = await fn("replaceMeter")!(ctxA, { unitId: DA, meterId: M2["301"], oldFinalReading: 1500, newStartReading: 0 });
    const row2 = (await rowsOf(M2["301"]))[0];
    const m = await prisma.dormMeter.findUnique({ where: { id: M2["301"] } });
    return [a?.code === "NOT_FOUND" && b?.code === "NOT_FOUND" && row2?.confirmedAt === null && m?.removedAt === null, `${a?.code} ${b?.code}`];
  }, "CRITICAL");
  await T("X-5", "ร้าน B ยืนยัน/จดใหม่แถวของร้าน A (ใส่ unitId ของ A) ⇒ NOT_FOUND · แถวไม่ขยับ", ["confirmReading"], async () => {
    const row = (await rowsOf(ME["202"]))[0];
    const a = await fn("confirmReading")!(ctxB, { unitId: DA, readingId: row?.id, action: "ACCEPT" });
    const b = await fn("confirmReading")!(ctxB, { unitId: DB, readingId: row?.id, action: "REREAD", value: 1 });
    const row2 = (await rowsOf(ME["202"]))[0];
    return [a?.code === "NOT_FOUND" && b?.code === "NOT_FOUND" && row2?.confirmedAt === null && row2?.value === row?.value, `${a?.code} ${b?.code}`];
  }, "CRITICAL");
  await T("X-6", "event แยกร้าน: event ของร้าน B (ห้องว่าง B1) อยู่ tenant B · unitId DB · ไม่มี meterId ของ B ใน event ร้าน A", [], async () => {
    const eb = await evOf(B, MB1);
    const leak = (await evOf(A)).filter((e: any) => e.payload?.meterId === MB1).length;
    return [eb.length === 1 && eb[0].unitId === DB && eb[0].payload?.unitId === DB && leak === 0, `B=${eb.length} unit=${eb[0]?.unitId === DB} รั่ว=${leak}`];
  }, "MAJOR");

  // ═══════════════ U. จอ + คิวออฟไลน์ ═══════════════
  console.log("\n── U MeterWalk (render) · คิวออฟไลน์ pure ──");
  const q = (meterId: string, value: number, periodKey = P0, clientKey = `${meterId}-${value}`, photo: any = null) => ({ meterId, periodKey, value, readAt: `${TODAY}T03:00:00.000Z`, clientKey, photo });
  await T("U-1", "enqueueReading: จด มิเตอร์×งวด เดิม 3 ครั้ง ⇒ 1 รายการค่าล่าสุด · อาร์เรย์เดิมไม่ถูกแก้", ["enqueueReading"], async () => {
    const E = fn("enqueueReading")!;
    const q0: any[] = [];
    const q1 = E(q0, q("m1", 100)), q2 = E(q1, q("m1", 101)), q3 = E(q2, q("m1", 102));
    return [q0.length === 0 && q1.length === 1 && q1[0].value === 100 && q3.length === 1 && q3[0].value === 102 && q3 !== q2, `ยาว ${q1.length}/${q2.length}/${q3.length} ค่า=${q3[0]?.value} q1 ถูกแก้=${q1[0]?.value !== 100}`];
  }, "CRITICAL");
  await T("U-2", "enqueueReading: ค่าใหม่ไม่มีรูป ⇒ คงรูปเดิม · มิเตอร์อื่น/งวดอื่น แยกรายการ", ["enqueueReading"], async () => {
    const E = fn("enqueueReading")!;
    const ph = { dataUrl: "data:image/jpeg;base64,AA==", contentType: "image/jpeg" };
    let qq: any[] = E([], q("m1", 100, P0, "k1", ph));
    qq = E(qq, q("m1", 105, P0, "k2", null));
    qq = E(qq, q("m2", 7));
    qq = E(qq, q("m1", 90, P(-1)));
    const m1 = qq.find((x: any) => x.meterId === "m1" && x.periodKey === P0);
    return [qq.length === 3 && m1?.value === 105 && m1?.photo?.dataUrl === ph.dataUrl && m1?.clientKey === "k2", `ยาว=${qq.length} m1=${J(m1)}`];
  }, "MAJOR");
  await T("U-3", "nextBatch: งวดเก่าสุดก่อน · ไม่เกิน max · คิวว่าง ⇒ null · max เกิน 200 ⇒ ตัดที่ 200", ["enqueueReading", "nextBatch"], async () => {
    const E = fn("enqueueReading")!, N = fn("nextBatch")!;
    let qq: any[] = [];
    for (const [m, p] of [["a", P0], ["b", P(-1)], ["c", P0], ["d", P(-1)], ["e", P(-1)]] as const) qq = E(qq, q(m, 1, p));
    const b1 = N(qq, 2);
    let big: any[] = [];
    for (let i = 0; i < 250; i++) big = E(big, q(`x${i}`, i));
    const b2 = N(big, 500);
    return [b1?.periodKey === P(-1) && J(b1?.items?.map((x: any) => x.meterId)) === J(["b", "d"]) && N([]) === null && b2?.items?.length === 200, `b1=${J(b1?.items?.map((x: any) => x.meterId))}@${b1?.periodKey} big=${b2?.items?.length}`];
  }, "MAJOR");
  await T("U-4", "settleBatch: เอาออกเฉพาะที่ส่งและ clientKey ยังตรง · ไม่มีผล (เน็ตหลุด) ⇒ คงไว้ · REJECTED/LOCKED ⇒ rejected พร้อม code", ["enqueueReading", "settleBatch"], async () => {
    const E = fn("enqueueReading")!, S = fn("settleBatch")!;
    let qq: any[] = [];
    for (const m of ["a", "b", "c", "d", "e"]) qq = E(qq, q(m, 1, P0, `${m}-1`));
    const sent = qq.slice();
    qq = E(qq, q("b", 2, P0, "b-2"));                      // ระหว่างส่ง จดค่าใหม่ของ b
    const res = [{ meterId: "a", status: "CREATED" }, { meterId: "b", status: "UNCHANGED" }, { meterId: "c", status: "REJECTED", code: "NOT_FOUND" }, { meterId: "d", status: "LOCKED" }];
    const out = S(qq, sent, res);
    const left = (out?.queue ?? []).map((x: any) => `${x.meterId}:${x.clientKey}`).sort();
    const rej = (out?.rejected ?? []).map((x: any) => `${x.meterId}:${x.code ?? "null"}`).sort();
    const rejOk = J(rej) === J(["c:NOT_FOUND", "d:null"]) || J(rej) === J(["c:NOT_FOUND", "d:LOCKED"]);
    return [J(left) === J(["b:b-2", "e:e-1"]) && rejOk, `เหลือ=${J(left)} rejected=${J(rej)}`];
  }, "CRITICAL");
  const flags = fn("meterFlags") ? await fn("meterFlags")!(ctxA, { unitId: DA, periodKey: P0 }).catch(() => []) : [];
  const noop = async () => ({ ok: true, results: [] });
  await T("U-5", "render ค่าเริ่ม: data-meter-walk + data-period · \"จดแล้ว 11 / 12 ห้อง\" · \"ผิดปกติ 4\" · แท็บชั้น 2 · ชั้นเริ่ม = ชั้นแรกที่ยังไม่ครบ (ชั้น 2) · แถวมี attr · ห้องว่างมีคำว่า \"ห้องว่าง\" · ป้ายพักมี data-flag", ["meterWalk"], async () => {
    const h = render({ unitId: DA, periodKey: P0, walk, flags, submit: noop });
    const root = boxes(h, "data-meter-walk")[0];
    const tabs = boxes(h, "data-floor-tab");
    const rows = boxes(h, "data-room-id");
    const t = textOf(h);
    const r202 = rows.find((r) => r.attrs["data-room-number"] === "202");
    const r205 = rows.find((r) => r.attrs["data-room-number"] === "205");
    const ok = !!root && root.attrs["data-period"] === P0 && /จดแล้ว\s*11\s*\/\s*12\s*ห้อง/.test(t) && /ผิดปกติ\s*4/.test(t) && tabs.length === 2 && tabs.some((x) => /ชั้น 1/.test(textOf(x.html))) && tabs.some((x) => /ชั้น 2/.test(textOf(x.html)))
      && J(rows.map((r) => r.attrs["data-room-number"]).sort()) === J(["201", "202", "203", "204", "205", "206"]) && rows.every((r) => r.attrs["data-room-id"] && ["true", "false"].includes(r.attrs["data-vacant"]) && ["true", "false"].includes(r.attrs["data-done"]))
      && r202?.attrs["data-vacant"] === "true" && /ห้องว่าง/.test(textOf(r202.html)) && r205?.attrs["data-flag"] === "VACANT_USAGE" && rows.find((r) => r.attrs["data-room-number"] === "206")?.attrs["data-done"] === "false";
    return [ok, `root=${!!root} tabs=${tabs.length} rows=${J(rows.map((r) => r.attrs["data-room-number"]))} text=${t.slice(0, 120)}`];
  }, "MAJOR", true);
  await T("U-6", "initialFloor = key ชั้น 1 ⇒ แถว 101–106 ทั้งหมด data-done true · ไม่มีแถวชั้น 2", ["meterWalk"], async () => {
    const h = render({ unitId: DA, periodKey: P0, walk, flags, submit: noop, initialFloor: walk?.floors?.[0]?.key });
    const rows = boxes(h, "data-room-id");
    return [J(rows.map((r) => r.attrs["data-room-number"]).sort()) === J(["101", "102", "103", "104", "105", "106"]) && rows.every((r) => r.attrs["data-done"] === "true"), J(rows.map((r) => `${r.attrs["data-room-number"]}:${r.attrs["data-done"]}`))];
  }, "MAJOR", true);
  await T("U-7", "initialRoomId = 101 ⇒ แผงห้อง: ช่องกรอก data-meter-input ต่อมิเตอร์ (ไฟ+น้ำ) inputmode numeric · เลขก่อนหน้า 1,300/1300 · ปุ่มถ่ายรูป accept image capture · \"บันทึก\"", ["meterWalk"], async () => {
    const h = render({ unitId: DA, periodKey: P0, walk, flags, submit: noop, initialRoomId: R["101"] });
    const ins = boxes(h, "data-meter-input");
    const cam = [...h.matchAll(/<input[^>]*type="file"[^>]*>/g)].map((m) => attrsOf(m[0]));
    const t = textOf(h);
    const ok = J(ins.map((i) => i.attrs["data-meter-input"]).sort()) === J([ME["101"], MW["101"]].sort()) && ins.every((i) => i.attrs.inputmode === "numeric")
      && /1,?300/.test(t) && cam.some((c) => /image/.test(c.accept ?? "") && "capture" in c) && /บันทึก/.test(t);
    return [ok, `inputs=${J(ins.map((i) => i.attrs["data-meter-input"] === ME["101"] ? "E" : i.attrs["data-meter-input"] === MW["101"] ? "W" : "?"))} inputmode=${J(ins.map((i) => i.attrs.inputmode))} camera=${cam.length}`];
  }, "MAJOR", true);
  await T("U-8", "initialView flags ⇒ การ์ด data-flag-reading ครบทุกแถวพัก · BACKWARDS มี \"เปลี่ยนมิเตอร์\" · ห้องว่างมี \"ข้าม\" + งานตรวจ · HIGH/LOW มี \"ยืนยันค่านี้\" (ถ้ามี)", ["meterWalk"], async () => {
    const h = render({ unitId: DA, periodKey: P0, walk, flags, submit: noop, initialView: "flags" });
    const cards = boxes(h, "data-flag-reading");
    const ids = new Set(cards.map((c) => c.attrs["data-flag-reading"]));
    const want = (flags ?? []).map((f: any) => f.readingId);
    const back = cards.find((c) => c.attrs["data-flag-reading"] === (flags ?? []).find((f: any) => f.flag === "BACKWARDS")?.readingId);
    const vac = cards.find((c) => c.attrs["data-flag-reading"] === (flags ?? []).find((f: any) => f.flag === "VACANT_USAGE")?.readingId);
    const ok = want.length === 4 && cards.length === want.length && want.every((id: string) => ids.has(id)) && /เปลี่ยนมิเตอร์/.test(textOf(back?.html ?? "")) && /ข้าม/.test(textOf(vac?.html ?? "")) && /งานตรวจ/.test(textOf(vac?.html ?? ""));
    return [ok, `การ์ด=${cards.length} ต้อง ${want.length} back=${textOf(back?.html ?? "").slice(0, 80)} vac=${textOf(vac?.html ?? "").slice(0, 80)}`];
  }, "MAJOR", true);
  await T("U-9", "จอมี \"ออฟไลน์ได้\" + \"รอส่ง\" · ไม่มีคำต้องห้าม สคบ. · ไม่มี ฿ (ทุกมุมมอง)", ["meterWalk"], async () => {
    const hs = [render({ unitId: DA, periodKey: P0, walk, flags, submit: noop }), render({ unitId: DA, periodKey: P0, walk, flags, submit: noop, initialRoomId: R["202"] }), render({ unitId: DA, periodKey: P0, walk, flags, submit: noop, initialView: "flags" })];
    const t0 = textOf(hs[0]);
    const bad = hs.map((h) => LEGAL_BAD.exec(textOf(h))?.[0] ?? (/฿/.test(h) ? "฿" : "")).filter(Boolean);
    return [/ออฟไลน์ได้/.test(t0) && /รอส่ง/.test(t0) && !bad.length, `ออฟไลน์=${/ออฟไลน์ได้/.test(t0)} รอส่ง=${/รอส่ง/.test(t0)} ต้องห้าม=${J(bad)}`];
  }, "CRITICAL", true);

  // ═══════════════ Q. ฉาก svcqc ═══════════════
  console.log("\n── Q ฉากจดมิเตอร์ (svcqc · บ้านสวนอพาร์ตเมนต์) ──");
  const svcT = SV.SQC_TENANT.id as string;
  const svcDorm = SV.SQC_UNITS.dorm.id as string;
  const seeded = await prisma.hotelRoom.count({ where: { tenantId: svcT, unitId: svcDorm } });
  const runTsx = (file: string, args: string[] = []) => {
    const r = spawnSync("pnpm", ["exec", "tsx", file, ...args], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
    const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
    const m = /SCENE_SUMMARY (\{.*\})/.exec(out);
    let sum: any = null;
    try { sum = m ? JSON.parse(m[1]) : null; } catch { /* อ่านไม่ได้ */ }
    return { status: r.status, out, sum };
  };
  if (seeded !== 36) {
    for (const [id, n] of [["Q-1", "ฉากรันได้"], ["Q-2", "ฉาก 27/36 · ผิดปกติ 3"], ["Q-3", "รันซ้ำไม่เขียน"]]) skip(id, n, `ร้าน svcqc หอมีห้อง ${seeded} (ต้อง 36) — รัน scripts/seed-svc-qc.mts ก่อน`, "MAJOR");
  } else {
    await T("Q-1", "ฉากผัง R0.9 แล้วฉากมิเตอร์รันได้ (exit 0) · พิมพ์ SCENE_SUMMARY {created,updated,removed}", [], async () => {
      if (!existsSync(join(ROOT, F.scene))) return [false, `ยังไม่มี ${F.scene}`];
      const pre = runTsx("scripts/svc-qc-roomboard-scene.mts");
      const r = runTsx(F.scene);
      return [pre.status === 0 && r.status === 0 && !!r.sum && ["created", "updated", "removed"].every((k) => typeof r.sum[k] === "number"), `ผัง exit=${pre.status} มิเตอร์ exit=${r.status} ${r.sum ? J(r.sum) : r.out.split("\n").slice(-4).join(" | ").slice(0, 240)}`];
    }, "MAJOR");
    await T("Q-2", "meterWalk svcqc เดือนนี้: progress 36/27 · ห้องพัก 3 = 309 HIGH · 112 BACKWARDS · 210 VACANT_USAGE · 204 ไฟ 1287→1412 · มี MAIN", ["meterWalk"], async () => {
      const w = await fn("meterWalk")!({ tenantId: svcT }, { unitId: svcDorm, periodKey: P0 });
      const rooms = (w?.floors ?? []).flatMap((f: any) => f.rooms ?? []);
      const flagged = rooms.filter((x: any) => x.flag).map((x: any) => `${x.number}:${x.flag}`).sort();
      const e204 = rooms.find((x: any) => x.number === "204")?.meters?.find((m: any) => m.kind === "ELEC");
      const ok = w?.progress?.rooms === 36 && w?.progress?.done === 27 && w?.progress?.flagged === 3 && J(flagged) === J(["112:BACKWARDS", "210:VACANT_USAGE", "309:HIGH"])
        && e204?.prevValue === 1287 && e204?.value === 1412 && (w?.main?.length ?? 0) >= 1;
      return [ok, `${J(w?.progress)} ป้าย=${J(flagged)} 204=${J(e204 && { prev: e204.prevValue, v: e204.value })} main=${w?.main?.length}`];
    }, "MAJOR");
    await T("Q-3", "รันฉากมิเตอร์ซ้ำ ⇒ SCENE_SUMMARY 0/0/0", [], async () => {
      if (!existsSync(join(ROOT, F.scene))) return [false, `ยังไม่มี ${F.scene}`];
      const r = runTsx(F.scene);
      return [r.status === 0 && r.sum?.created === 0 && r.sum?.updated === 0 && r.sum?.removed === 0, `exit=${r.status} ${J(r.sum)}`];
    }, "MAJOR");
  }

  // ═══════════════ V. ภาพ ═══════════════
  console.log("\n── V ภาพจดมิเตอร์ (ภาพ หอ 03) ──");
  {
    const specs = SV.SQC_VISUAL_SPECS?.["d.6"];
    const base = process.env.QC_BASE ?? "";
    for (const [id, user] of [["V-1", "owner"], ["V-2", "meter"]] as const) {
      const name = `ภาพ dorm-meter-walk/flags 1440 + 390 ด้วยผู้ใช้ ${user}${user === "meter" ? " (คนจดมิเตอร์เปิดหน้าจดได้)" : ""} · HTTP < 400 · ไม่ล้นแนวนอน`;
      if (!Array.isArray(specs) || !specs.length) fail(id, name, `ไม่มี SQC_VISUAL_SPECS d.6 ${J(specs)}`, "MAJOR");
      else if (!base) skip(id, name, "ไม่มี QC_BASE — ผู้คุม build QC ผ่าน iso + reseed + รันฉาก แล้วรันซ้ำด้วย QC_BASE=http://127.0.0.1:<port>", "MAJOR");
      else {
        const r = spawnSync("pnpm", ["exec", "tsx", "scripts/visual-svc.mts", "d.6", "--user", user, "--base", base], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
        const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
        if (r.status === 0) pass(id, `${name} (ภาพ .qc-shots/svc/d.6 — ผู้คุมเทียบ PARITY กับ ledger/design-dorm/03-meter-mobile.png)`);
        else fail(id, name, `exit=${r.status} ${out.split("\n").filter((l) => l.includes("❌")).slice(0, 3).join(" | ").slice(0, 300)}`, "MAJOR");
      }
    }
  }

  // ═══════════════ G. regression ═══════════════
  console.log("\n── G regression (ลูกโพรเซส · env เดียวกัน · ผ่าน = JSON_SUMMARY ไม่มี failed) ──");
  for (const [id, f] of [["G-1", "qc-svc-r0.9"], ["G-2", "qc-svc-r0.2"]] as const) {
    if (NO_REG) { skip(id, `regression ${f}`, "--no-regression / SVC_D6_NO_REGRESSION=1", "CRITICAL"); continue; }
    const r = spawnSync("pnpm", ["exec", "tsx", `scripts/${f}.mts`], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
    const js = [...out.matchAll(/JSON_SUMMARY (\{.*\})/g)].map((m) => m[1]).pop();
    let sum: any = null;
    try { sum = js ? JSON.parse(js) : null; } catch { /* อ่านไม่ได้ */ }
    const ok = !!sum && Array.isArray(sum.failed) && sum.failed.length === 0;
    if (ok) pass(id, `regression ${f} ไม่มีข้อแดง (${sum.passed}/${sum.total} · SKIP ${sum.skipped?.length ?? 0} = ข้อภาพที่รอ QC_BASE)`);
    else fail(id, `regression ${f} ไม่มีข้อแดง`, `exit=${r.status} failed=${J(sum?.failed)} · ${out.split("\n").filter((l) => l.includes("❌")).slice(0, 3).join(" | ").slice(0, 300)}`, "CRITICAL");
  }
} catch (e) {
  fail("CRASH", "จบกลางทาง", errMsg(e), "CRITICAL");
} finally {
  try { await cleanup(tenantIds); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); }
  try {
    const left = await leftovers(tenantIds);
    if (!left.length) pass("Z-1", `ล้างครบ: ทุกตารางที่มี tenantId ของร้านทดสอบ ${tenantIds.length} ร้าน = 0 แถว (ฉาก svcqc คงไว้ให้ถ่ายภาพ — ล้างด้วย scripts/svc-qc-meter-scene.mts --clear)`);
    else fail("Z-1", "ล้างครบ", J(left), "MAJOR");
  } catch (e) { fail("Z-1", "ล้างครบ", `ตรวจไม่ได้: ${errMsg(e)}`, "MAJOR"); }
  await prisma.$disconnect();
}

const failed = cks.filter((c) => c.res === "FAIL");
const skipped = cks.filter((c) => c.res === "SKIP");
const passed = cks.length - failed.length - skipped.length;
console.log(`\n===== QC SVC D.6 · มิเตอร์ + จดมือถือ =====\nผ่าน ${passed}/${cks.length}${skipped.length ? ` (SKIP ${skipped.length})` : ""}`);
console.log(`FINDINGS: CRITICAL ${failed.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${failed.filter((c) => c.sev === "MAJOR").length} · MINOR ${failed.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id) })}`);
// exit 0 เมื่อไม่มีข้อแดง · รับใบ = ผ่านทุกข้อ (SKIP ที่ยอมได้: V-1/V-2 ไม่มี QC_BASE · G-* เมื่อ --no-regression — ผู้คุมรันซ้ำครบก่อนรับ)
process.exit(failed.length > 0 ? 1 : 0);
