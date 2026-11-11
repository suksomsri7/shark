// QC — SVC R0.9 · ผังห้องร่วม `RoomBoard` + occupancyRange + เก็บกวาด occupancy ค้าง + setRoomTypeRent affected · oracle ของผู้คุม — builder ห้ามแก้ไฟล์นี้
// สัญญา: ledger/svc-briefs/svc-brief-r0.9.md · ledger/SVC-CORE-CONTRACT.md §5 · ledger/SVC-MASTER-PLAN.md แถว R0.9 · ledger/wo-notes/svc-r0.8-carry.md
//
// กลุ่มข้อ:
//   S  โครงสร้าง: ไฟล์ · facade · 'use client' ไม่ลาก prisma · ผังไม่รู้เรื่องเงิน · ไม่มีปุ่มล็อกห้อง/ตัดน้ำไฟ · minute-job · หน้า dorm · สคริปต์ฉาก
//   O  occupancyRange(ctx,{unitId,start,end,roomId?}) — ช่วง [) · inactive/hold หมดเวลาไม่นับ · หน่วยอื่น/ร้านอื่น ⇒ [] · Date ⇒ วันไทย
//   W  roomBoard: ช่อง next (การครองถัดไป) · finance=null · hkStatus = แหล่งความจริง
//   U  RoomBoard (renderToStaticMarkup): 36 ห้องตามชั้น · สถานะด้วยรูปทรง+ข้อความ · ตัวกรอง · รายการ · ป้ายการเงินผู้เรียกเติม · ไม่มีคำต้องห้าม
//   K  setRoomTypeRent คืน affected (มี roomId) — เฉพาะห้องที่ตามประเภท
//   Y  sweepStaleOccupancy(now): ปล่อย occupancy ของการจองโรงแรมที่ไม่ใช่ BOOKED/CHECKED_IN · ไม่แตะของที่ยังถูกต้อง · idempotent · X5 · event
//   Q  ฉากผังห้องหอบนร้าน svcqc (scripts/svc-qc-roomboard-scene.mts): 31/3/1/1 ตาม README · รันซ้ำไม่เขียน
//   V  ภาพ dorm-floorplan (visual-svc r0.9) — ต้องมี QC_BASE (ไม่มี ⇒ SKIP พร้อมเหตุผล)
//   G  regression qc-svc-r0.8 · qc-hotel-money/public/refund (ลูกโพรเซส env เดียวกัน)
//
// วันที่สัมพัทธ์กับ "วันนี้ (ไทย)" ทั้งไฟล์ · ข้อมูลทดสอบอยู่ใต้ tenant ชั่วคราว slug `qc-svc-r09-*` · ลบใน finally ("roomOccupancy" ก่อน "hotelRoom" · FK RESTRICT)
// รัน: bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-r0.9.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { existsSync, readFileSync } from "node:fs";
import { svcQcHostMark } from "./svc-qc-hosts.mjs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "qc-svc-r0.9";
const SVC_HOST = svcQcHostMark(); // ORACLE-EDIT (ผู้คุม 31 ต.ค. · ฐานต่อเลน) เดิม "ep-mute-scene"
const FORBIDDEN_HOSTS = ["ep-royal-night", "ep-plain-art", "ep-cool-shadow", "ep-weathered-river", "ep-frosty-lab", "ep-fragrant-thunder"];
const RUN_CMD = "bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-r0.9.mts";

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
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 260);
const J = (x: unknown) => { try { return JSON.stringify(x) ?? String(x); } catch { return String(x); } };
const read = (p: string) => (existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), "utf8") : "");

// ═══════════════ วันที่ (สัมพัทธ์กับวันนี้ไทย) ═══════════════
const DAY = 86_400_000;
const TODAY = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const D = (n: number) => addDays(TODAY, n);
const dbDate = (ymd: string) => new Date(`${ymd}T00:00:00Z`);
const EV = "rooms.occupancy.changed";
const HOUR = 3_600_000;

// ═══════════════ โหลดโมดูล ═══════════════
const { prisma } = (await import("@/lib/core/db")) as { prisma: any };
const ROOMS_IDX = join(ROOT, "src/lib/modules/rooms/index.ts");
let rooms: any = null;
let roomsWhy = "";
try { rooms = await import(pathToFileURL(ROOMS_IDX).href); } catch (e) { roomsWhy = `import rooms ล้ม: ${errMsg(e)}`; }
const fn = (name: string): ((...a: any[]) => any) | null => (rooms && typeof rooms[name] === "function" ? rooms[name] : null);

const BOARD_FILE = "src/components/rooms/RoomBoard.tsx";
let boardMod: any = null;
let boardWhy = "";
if (!existsSync(join(ROOT, BOARD_FILE))) boardWhy = `ยังไม่มี ${BOARD_FILE}`;
else {
  try { boardMod = await import(pathToFileURL(join(ROOT, BOARD_FILE)).href); } catch (e) { boardWhy = `import RoomBoard ล้ม: ${errMsg(e)}`; }
}
const React = (await import("react" as string)) as any;
const RDS = (await import("react-dom/server" as string)) as any;
const BoardC: any = boardMod ? (typeof boardMod.default === "function" ? boardMod.default : typeof boardMod.RoomBoard === "function" ? boardMod.RoomBoard : null) : null;
if (boardMod && !BoardC && !boardWhy) boardWhy = "RoomBoard.tsx ไม่มี default export / export RoomBoard ที่เป็นคอมโพเนนต์";

// ตัวรันข้อ — needs = ชื่อฟังก์ชัน rooms ที่ต้องใช้ · board = ต้องใช้คอมโพเนนต์
async function T(id: string, name: string, needs: string[], body: () => Promise<[boolean, string?]>, sev: Sev = "CRITICAL", board = false) {
  const miss = needs.filter((n) => !fn(n));
  if (miss.length) return skip(id, name, rooms ? `facade rooms ไม่มี ${miss.join(", ")}` : roomsWhy, sev);
  if (board && !BoardC) return skip(id, name, boardWhy || "ไม่มีคอมโพเนนต์ RoomBoard", sev);
  try {
    const [ok, why] = await body();
    if (ok) pass(id, name); else fail(id, name, why ?? "ไม่ตรง", sev);
  } catch (e) {
    fail(id, name, `throw: ${errMsg(e)}`, sev);
  }
}

// ═══════════════ ตัวช่วย render ═══════════════
const render = (props: Record<string, unknown>): string =>
  String(RDS.renderToStaticMarkup(React.createElement(BoardC, props))).replace(/<!-- -->/g, "");
const unesc = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'");
const textOf = (html: string) => unesc(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const attrsOf = (openTag: string): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const m of openTag.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)="([^"]*)"/g)) out[m[1]] = unesc(m[2]);
  return out;
};
/** ตัดกล่องทุกตัวที่มี attr ชื่อนี้ (แท็กสมดุล) → { attrs, html } */
function boxes(html: string, attr: string): { attrs: Record<string, string>; html: string }[] {
  const out: { attrs: Record<string, string>; html: string }[] = [];
  const re = new RegExp(`\\s${attr}="`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const open = html.lastIndexOf("<", m.index);
    const openEnd = html.indexOf(">", m.index);
    const openTag = html.slice(open, openEnd + 1);
    const tag = /^<([a-zA-Z0-9-]+)/.exec(openTag)?.[1] ?? "div";
    let end = openEnd + 1;
    if (!openTag.endsWith("/>")) {
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
const cellsIn = (html: string) => boxes(html, "data-room-id");

// สัญญาสถานะ (ใบสั่ง §4): สถานะ → ป้ายข้อความ + รูปทรง
const STATUS: Record<string, { label: string; shape: string }> = {
  VACANT: { label: "ว่าง", shape: "dashed" },
  LEASED: { label: "มีผู้เช่า", shape: "solid" },
  GUEST: { label: "มีแขก", shape: "filled" },
  HOLD: { label: "ถือไว้", shape: "double" },
  BOOKED: { label: "จอง", shape: "tinted" },
  REPAIR: { label: "ปิดซ่อม", shape: "hatched" },
};
const LEGAL_BAD = /ล็อ[กค]ห้อง|ล็อ[กค]ประตู|ตัดน้ำ|ตัดไฟ|ระงับ(การ)?(จ่าย)?(น้ำ|ไฟ)|งด(จ่าย)?(น้ำ|ไฟ)|ยึดทรัพย์|ขนของออก/;

// ═══════════════ ล้างข้อมูล ("roomOccupancy" ก่อน "hotelRoom" · FK RESTRICT) ═══════════════
async function cleanup(tids: string[]) {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); } };
  for (const tenantId of tids) {
    await d(() => prisma.outboxEvent.deleteMany({ where: { tenantId } }));
    await d(() => prisma.roomOccupancy.deleteMany({ where: { tenantId } }));
    await d(() => prisma.hotelReservation.deleteMany({ where: { tenantId } }));
    await d(() => prisma.hotelRoom.deleteMany({ where: { tenantId } }));
    await d(() => prisma.roomBuilding.deleteMany({ where: { tenantId } }));
    await d(() => prisma.hotelRoomType.deleteMany({ where: { tenantId } }));
    await d(() => prisma.businessUnit.deleteMany({ where: { tenantId } }));
    await d(() => prisma.tenant.deleteMany({ where: { id: tenantId } }));
  }
}

const tenantIds: string[] = [];
try {
  const stale = await prisma.tenant.findMany({ where: { slug: { startsWith: "qc-svc-r09-" } }, select: { id: true } });
  if (stale.length) { console.log(`  (กวาด tenant ค้างจากรอบก่อน ${stale.length})`); await cleanup(stale.map((t: { id: string }) => t.id)); }

  // ═══════════════ S. โครงสร้าง ═══════════════
  console.log("\n── S โครงสร้าง ──");
  const PAGE_FILE = "src/app/app/u/[unitSlug]/dorm/page.tsx";
  const SCENE_FILE = "scripts/svc-qc-roomboard-scene.mts";
  {
    const miss = [BOARD_FILE, PAGE_FILE, SCENE_FILE].filter((p) => !existsSync(join(ROOT, p)));
    if (!miss.length) pass("S-1", "มีไฟล์ RoomBoard.tsx · หน้า dorm/page.tsx · สคริปต์ฉาก svc-qc-roomboard-scene.mts");
    else fail("S-1", "มีไฟล์ RoomBoard.tsx · หน้า dorm/page.tsx · สคริปต์ฉาก", `ขาด ${miss.join(", ")}`, "CRITICAL");
  }
  {
    const API = ["occupancyRange", "sweepStaleOccupancy", "roomBoard", "listBuildings", "setRoomTypeRent", "claimRoom", "expireHolds", "availability"];
    const miss = API.filter((n) => !fn(n));
    if (!miss.length) pass("S-2", "facade rooms export occupancyRange · sweepStaleOccupancy (+ ชื่อเดิมของ R0.8 ยังอยู่)");
    else fail("S-2", "facade rooms export occupancyRange · sweepStaleOccupancy", rooms ? `ขาด ${miss.join(", ")}` : roomsWhy, "CRITICAL");
  }
  const boardSrc = read(BOARD_FILE);
  {
    const useClient = /^(?:\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/))*\s*["']use client["']/.test(boardSrc);
    const imports = [...boardSrc.matchAll(/^\s*import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/gm)].map((m) => ({ typeOnly: !!m[1], spec: m[2] }));
    const dynImports = [...boardSrc.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]);
    const BAD = (s: string) => /^@prisma\//.test(s) || s === "@/lib/core/db" || /^@\/lib\/core\/(db|tenant-db|outbox|settings)/.test(s) || /^@\/lib\/modules\//.test(s) || /^@\/lib\/(platform|automation|webhooks)\//.test(s) || /^\.\.?\/.*lib\/modules/.test(s);
    const bad = [...imports.filter((i) => !i.typeOnly && BAD(i.spec)).map((i) => i.spec), ...dynImports.filter(BAD)];
    const prismaWord = /\bprisma\b|tenantDb\(/.test(boardSrc.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, ""));
    if (boardSrc && useClient && bad.length === 0 && !prismaWord) pass("S-3", "RoomBoard.tsx: 'use client' บรรทัดแรก · ไม่ import prisma/db/โมดูลฝั่ง server (โมดูล rooms ใช้ได้เฉพาะ import type)");
    else fail("S-3", "RoomBoard.tsx: 'use client' · ไม่ลาก prisma", boardSrc ? `use client=${useClient} import ต้องห้าม=${bad.join(",") || "—"} prisma=${prismaWord}` : "ยังไม่มีไฟล์", "CRITICAL");
  }
  {
    const code = boardSrc.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "");
    const money = /satang|Satang|฿|\/\s*100\b|toFixed\(\s*2\s*\)|currency\s*:\s*["']THB/.test(code);
    const billing = /dorm|account|payment|invoice|bill(?!board)/i.test([...code.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]).join(" "));
    if (boardSrc && !money && !billing) pass("S-4", "ผังไม่รู้เรื่องเงินเอง: ไม่มีสตางค์/฿/คำนวณเงิน · ไม่ import โมดูลบิล/บัญชี/ชำระเงิน (ป้ายการเงิน = ผู้เรียกเติม)");
    else fail("S-4", "ผังไม่รู้เรื่องเงินเอง", boardSrc ? `คำนวณเงิน=${money} import บิล=${billing}` : "ยังไม่มีไฟล์", "MAJOR");
  }
  {
    const bad = LEGAL_BAD.exec(boardSrc);
    if (boardSrc && !bad) pass("S-5", "RoomBoard.tsx ไม่มีปุ่ม/ข้อความล็อกห้อง · ตัดน้ำไฟ (ข้อห้ามกฎหมาย สคบ.)");
    else fail("S-5", "RoomBoard.tsx ไม่มีปุ่มล็อกห้อง/ตัดน้ำไฟ", boardSrc ? `พบ "${bad?.[0]}"` : "ยังไม่มีไฟล์", "CRITICAL");
  }
  {
    let why = "";
    try {
      await import("@/lib/platform/minute-jobs" as string);
      const reg = (globalThis as any)[Symbol.for("shark.platform.minute-jobs.registry")] as Map<string, any> | undefined;
      const job = reg?.get("rooms.sweepStaleOccupancy") ?? null;
      if (!job) why = "ไม่มีงาน rooms.sweepStaleOccupancy ในทะเบียน minute-jobs";
      else if (!(Number.isInteger(job.everyMinutes) && job.everyMinutes >= 1 && job.everyMinutes <= 15) || (job.cadence ?? "minute") !== "minute" || job.vpsOnly) why = `everyMinutes=${job.everyMinutes} cadence=${job.cadence} vpsOnly=${job.vpsOnly}`;
      const src = read("src/lib/platform/minute-jobs.ts");
      const i = src.indexOf("rooms.sweepStaleOccupancy");
      if (!why && !/import\(\s*["']@\/lib\/modules\/rooms["']\s*\)/.test(src.slice(i, i + 400))) why = "ต้อง lazy import facade `@/lib/modules/rooms` ตอนรัน (แบบ rooms.expireHolds)";
    } catch (e) { why = `import minute-jobs ล้ม: ${errMsg(e)}`; }
    if (!why) pass("S-6", "minute-job rooms.sweepStaleOccupancy (1–15 นาที · cadence minute · lazy import facade)"); else fail("S-6", "minute-job rooms.sweepStaleOccupancy", why, "MAJOR");
  }
  {
    const p = read(PAGE_FILE);
    const facade = /from\s+["']@\/lib\/modules\/rooms["']/.test(p) && !/["']@\/lib\/modules\/rooms\//.test(p);
    const usesBoard = /@\/components\/rooms\/RoomBoard/.test(p) && /roomBoard\s*\(/.test(p);
    const dormOnly = /["']DORM["']/.test(p) && /notFound\s*\(/.test(p) && /requireUnit\s*\(/.test(p);
    const noPrisma = !/@\/lib\/core\/db|@prisma\//.test(p);
    const noUseClient = !/^\s*["']use client["']/.test(p);
    if (p && facade && usesBoard && dormOnly && noPrisma && noUseClient) pass("S-7", "หน้า /app/u/[unitSlug]/dorm: server component · requireUnit + DORM เท่านั้น (อื่น notFound) · roomBoard ผ่าน facade · ส่งเข้า RoomBoard · ไม่แตะ prisma");
    else fail("S-7", "หน้า dorm/page.tsx ใช้ RoomBoard ผ่าน facade", p ? `facade=${facade} board=${usesBoard} dorm=${dormOnly} noPrisma=${noPrisma} server=${noUseClient}` : "ยังไม่มีไฟล์", "MAJOR");
  }
  {
    const s = read(SCENE_FILE);
    const ok = !!s && s.includes("--clear") && s.includes("SvcQcScene") && s.includes("SCENE_SUMMARY") && /loadSvcQcEnv/.test(s) && /svc-qc-data/.test(s);
    if (ok) pass("S-8", "สคริปต์ฉาก: ด่าน loadSvcQcEnv · อ่าน SQC · refType SvcQcScene · --clear · พิมพ์ SCENE_SUMMARY");
    else fail("S-8", "สคริปต์ฉาก svc-qc-roomboard-scene.mts ครบสัญญา", s ? "ขาด --clear / SvcQcScene / SCENE_SUMMARY / loadSvcQcEnv / svc-qc-data" : "ยังไม่มีไฟล์", "MAJOR");
  }
  {
    const rsrc = ["index.ts", "service.ts", "occupancy.ts"].map((f) => read(`src/lib/modules/rooms/${f}`)).join("\n") + boardSrc;
    const anyUse = /:\s*any\b|as\s+any\b|<any>/.test(rsrc);
    const getDay = /\.getDay\(\)|\.getDate\(\)|\.getMonth\(\)/.test(boardSrc) || /\.getDay\(\)/.test(rsrc);
    if (!anyUse && !getDay) pass("S-9", "rooms/* + RoomBoard: ไม่มี any · ไม่มี getDay()/getDate()/getMonth() ดิบในผัง (วันไทยจาก YYYY-MM-DD)");
    else fail("S-9", "ไม่มี any · ไม่มี getDay ดิบ", `any=${anyUse} getDay/Date ดิบ=${getDay}`, "MINOR");
  }

  // ═══════════════ fixtures ═══════════════
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const tA = await prisma.tenant.create({ data: { name: "QC R09 A", slug: `qc-svc-r09-a-${stamp}` } }); tenantIds.push(tA.id);
  const tB = await prisma.tenant.create({ data: { name: "QC R09 B", slug: `qc-svc-r09-b-${stamp}` } }); tenantIds.push(tB.id);
  const A = tA.id, B = tB.id;
  const DA = (await prisma.businessUnit.create({ data: { tenantId: A, type: "DORM", name: "หอ R09", slug: `r09da-${stamp}` } })).id;
  const HA = (await prisma.businessUnit.create({ data: { tenantId: A, type: "HOTEL", name: "โรงแรม R09", slug: `r09ha-${stamp}` } })).id;
  const HB = (await prisma.businessUnit.create({ data: { tenantId: B, type: "HOTEL", name: "โรงแรม R09 B", slug: `r09hb-${stamp}` } })).id;
  const ctxA = { tenantId: A }, ctxB = { tenantId: B };

  const mkType = async (tenantId: string, unitId: string, name: string, rentMode = "NIGHTLY") =>
    (await prisma.hotelRoomType.create({ data: { tenantId, unitId, name, capacity: 2, baseRateSatang: 100000, depositSatang: 0, rentMode } })).id as string;
  const mkRoom = async (tenantId: string, unitId: string, roomTypeId: string, number: string, extra: Record<string, unknown> = {}) =>
    (await prisma.hotelRoom.create({ data: { tenantId, unitId, roomTypeId, number, ...extra } })).id as string;
  const rawOcc = (tenantId: string, unitId: string, roomId: string, s: string, e: string, kind: string, refType: string, refId: string, extra: Record<string, unknown> = {}) =>
    prisma.roomOccupancy.create({ data: { tenantId, unitId, roomId, startDate: dbDate(s), endDate: dbDate(e), kind, refType, refId, ...extra } });

  // ── หอ 36 ห้อง (ภาพ 01) ──
  const bldA = (await prisma.roomBuilding.create({ data: { tenantId: A, unitId: DA, name: "อาคาร A", floors: 3, sortOrder: 1 } })).id;
  const tStd = await mkType(A, DA, "มาตรฐาน", "MONTHLY");
  const tBig = await mkType(A, DA, "ใหญ่", "MONTHLY");
  const DR: Record<string, string> = {};
  for (const f of [1, 2, 3]) for (let i = 1; i <= 12; i++) {
    const no = `${f}${String(i).padStart(2, "0")}`;
    DR[no] = await mkRoom(A, DA, i === 1 || i === 12 ? tBig : tStd, no, { buildingId: bldA, floorNo: f, floor: String(f) });
  }
  const VAC = ["108", "210", "311"];
  const BOOKED_NO = "207";
  const REPAIR_NO = "302";
  const LEASED_NOS = Object.keys(DR).filter((n) => !VAC.includes(n) && n !== BOOKED_NO && n !== REPAIR_NO);
  for (const no of LEASED_NOS) await rawOcc(A, DA, DR[no], D(-150), D(215), "LEASE", "DormLease", `lease-${no}`);
  await rawOcc(A, DA, DR[BOOKED_NO], D(-400), D(-3), "LEASE", "DormLease", "lease-207-old");     // ผู้เช่าเดิมย้ายออกแล้ว (จบก่อนวันนี้)
  await rawOcc(A, DA, DR[BOOKED_NO], D(12), D(377), "LEASE", "DormLease", "lease-207-new");      // ผู้เช่าใหม่เข้าใน 12 วัน
  await rawOcc(A, DA, DR["108"], D(90), D(455), "LEASE", "DormLease", "lease-108-far");          // จองไกล 90 วัน ⇒ ยังนับ "ว่าง"
  await prisma.hotelRoom.update({ where: { id: DR[REPAIR_NO] }, data: { hkStatus: "OUT_OF_ORDER", status: "OOO" } });

  // ── โรงแรม: สถานะผสม + 2 อาคาร + ห้องไม่มีอาคาร ──
  const bH1 = (await prisma.roomBuilding.create({ data: { tenantId: A, unitId: HA, name: "ตึกริมน้ำ", floors: 2, sortOrder: 1 } })).id;
  const bH2 = (await prisma.roomBuilding.create({ data: { tenantId: A, unitId: HA, name: "ตึกสวน", floors: 1, sortOrder: 2 } })).id;
  const tH = await mkType(A, HA, "ดีลักซ์", "BOTH");
  const HR: Record<string, string> = {};
  const hRooms: [string, string | null, number | null, Record<string, unknown>][] = [
    ["G1", bH1, 1, {}], ["H1", bH1, 1, {}], ["H2", bH1, 1, {}], ["K1", bH1, 2, { hkStatus: "DIRTY", status: "CLEANING" }],
    ["K2", bH1, 2, { status: "OOO" /* hkStatus CLEAN: status เดิมไม่ใช่แหล่งความจริง */ }], ["K3", bH2, 1, {}], ["F1", bH2, 1, {}], ["E1", bH2, 1, {}],
    ["N1", null, null, {}],
  ];
  for (const [no, b, f, extra] of hRooms) HR[no] = await mkRoom(A, HA, tH, no, { buildingId: b, floorNo: f, ...extra });
  await rawOcc(A, HA, HR.G1, D(-1), D(2), "STAY", "QcStay", "stay-g1");
  await rawOcc(A, HA, HR.H1, D(0), D(3), "HOLD", "QcHold", "hold-h1", { holdExpiresAt: new Date(Date.now() + 2 * HOUR) });
  await rawOcc(A, HA, HR.H2, D(0), D(3), "HOLD", "QcHold", "hold-h2", { holdExpiresAt: new Date(Date.now() - 2 * HOUR) });
  await rawOcc(A, HA, HR.K3, D(-30), D(60), "LEASE", "DormLease", "lease-k3");
  await prisma.hotelRoom.update({ where: { id: HR.K3 }, data: { hkStatus: "OUT_OF_ORDER" } });
  await rawOcc(A, HA, HR.F1, D(90), D(92), "STAY", "QcStay", "stay-f1");
  await rawOcc(A, HA, HR.E1, D(-3), D(0), "STAY", "QcStay", "stay-e1-ends-today");
  await rawOcc(A, HA, HR.E1, D(5), D(7), "STAY", "QcStay", "stay-e1-next");
  await rawOcc(A, HA, HR.E1, D(2), D(4), "STAY", "QcStay", "stay-e1-inactive", { active: false });

  // ── ร้าน B ──
  const tHB = await mkType(B, HB, "ร้านอื่น");
  const ZB = await mkRoom(B, HB, tHB, "Z1");
  await rawOcc(B, HB, ZB, D(0), D(5), "STAY", "QcStay", "stay-zb");

  // ═══════════════ O. occupancyRange ═══════════════
  console.log("\n── O occupancyRange ──");
  const range = (ctx: any, input: Record<string, unknown>): Promise<any[]> => fn("occupancyRange")!(ctx, input);
  const refsOf = (rows: any[]) => new Set((rows ?? []).map((r: any) => r.refId));
  const setEq = (a: Set<string>, b: string[]) => a.size === b.length && b.every((x) => a.has(x));
  await T("O-1", "ช่วง [D0,D6) ของโรงแรม: ได้ทุก occupancy active ที่ซ้อนช่วง · ไม่ได้ inactive · ไม่ได้ hold หมดเวลา · ไม่ได้ของจบวันนี้ (end=start) · ไม่ได้ของหอ/ร้านอื่น", ["occupancyRange"], async () => {
    const rows = await range(ctxA, { unitId: HA, start: D(0), end: D(6) });
    const got = refsOf(rows);
    const want = ["stay-g1", "hold-h1", "lease-k3", "stay-e1-next"];
    return [Array.isArray(rows) && setEq(got, want), `ได้ ${J([...got])} ต้อง ${J(want)}`];
  });
  await T("O-2", "ขอบ [): occupancy เริ่ม = end ไม่นับ · จบ = start ไม่นับ · คร่อมทั้งช่วงนับ", ["occupancyRange"], async () => {
    const a = refsOf(await range(ctxA, { unitId: HA, start: D(3), end: D(5) }));    // e1-next เริ่ม D5 = end ⇒ ไม่นับ · h1 จบ D3 = start ⇒ ไม่นับ · k3 คร่อม
    const b = refsOf(await range(ctxA, { unitId: HA, start: D(4), end: D(6) }));    // e1-next เริ่ม D5 ⇒ นับ
    return [setEq(a, ["lease-k3"]) && setEq(b, ["lease-k3", "stay-e1-next"]), `[D3,D5)=${J([...a])} [D4,D6)=${J([...b])}`];
  });
  await T("O-3", "แถวคืน: occupancyId · roomId · kind · refType · refId · startDate/endDate เป็น YYYY-MM-DD (end ไม่รวม) ตรงฐาน", ["occupancyRange"], async () => {
    const rows = await range(ctxA, { unitId: HA, start: D(0), end: D(6) });
    const g = rows.find((r: any) => r.refId === "stay-g1");
    const db = await prisma.roomOccupancy.findFirst({ where: { tenantId: A, refId: "stay-g1" } });
    const ok = g && g.occupancyId === db?.id && g.roomId === HR.G1 && g.kind === "STAY" && g.refType === "QcStay" && g.startDate === D(-1) && g.endDate === D(2);
    return [!!ok, J(g)];
  });
  await T("O-4", "กรอง roomId: ได้เฉพาะห้องนั้น · roomId ของหน่วยอื่น/ร้านอื่น ⇒ []", ["occupancyRange"], async () => {
    const a = refsOf(await range(ctxA, { unitId: HA, roomId: HR.E1, start: D(-10), end: D(10) }));
    const b = await range(ctxA, { unitId: HA, roomId: DR["101"], start: D(-10), end: D(10) });
    const c = await range(ctxA, { unitId: HA, roomId: ZB, start: D(-10), end: D(10) });
    return [setEq(a, ["stay-e1-ends-today", "stay-e1-next"]) && Array.isArray(b) && b.length === 0 && Array.isArray(c) && c.length === 0, `E1=${J([...a])} หอ=${b?.length} ร้านB=${c?.length}`];
  });
  await T("O-5", "X1: ร้าน B ขอหน่วยของร้าน A ⇒ [] · ร้าน A ขอหน่วยร้าน B ⇒ [] · หอ ⇒ ได้ของหอเท่านั้น (34 แถวในช่วงวันนี้)", ["occupancyRange"], async () => {
    const a = await range(ctxB, { unitId: HA, start: D(-10), end: D(10) });
    const b = await range(ctxA, { unitId: HB, start: D(-10), end: D(10) });
    const c = await range(ctxA, { unitId: DA, start: D(0), end: D(1) });
    const onlyDorm = Array.isArray(c) && c.every((r: any) => Object.values(DR).includes(r.roomId));
    return [Array.isArray(a) && a.length === 0 && Array.isArray(b) && b.length === 0 && onlyDorm && c.length === LEASED_NOS.length, `B→A=${a?.length} A→B=${b?.length} หอวันนี้=${c?.length} (ต้อง ${LEASED_NOS.length}) onlyDorm=${onlyDorm}`];
  }, "CRITICAL");
  await T("O-6", "ช่วงผิด ⇒ [] ไม่ throw: end<=start · วันที่ผิดรูป (2031-02-30) · ไม่ส่ง · ช่วงเกิน 400 วัน", ["occupancyRange"], async () => {
    const a = await range(ctxA, { unitId: HA, start: D(5), end: D(5) });
    const b = await range(ctxA, { unitId: HA, start: D(5), end: D(1) });
    const c = await range(ctxA, { unitId: HA, start: "2031-02-30", end: "2031-03-05" });
    const d = await range(ctxA, { unitId: HA, start: undefined, end: D(3) });
    const e = await range(ctxA, { unitId: DA, start: D(-200), end: D(201) });
    const f = await range(ctxA, { unitId: DA, start: D(-200), end: D(200) });
    const empty = [a, b, c, d, e].every((x) => Array.isArray(x) && x.length === 0);
    return [empty && Array.isArray(f) && f.length > 0, `${[a, b, c, d, e].map((x) => x?.length).join(",")} · 400 วันพอดี=${f?.length}`];
  }, "MAJOR");
  await T("O-7", "Date ⇒ วันไทย: start = Date ของ 18:00Z วันก่อน (=00:xx ไทยของวันถัดไป)", ["occupancyRange"], async () => {
    // start = D(2) ไทย ⇒ g1 (จบ D2) ไม่นับ · end = D(3) ไทย
    const s = new Date(`${D(1)}T18:30:00Z`);
    const e = new Date(`${D(2)}T18:30:00Z`);
    const got = refsOf(await range(ctxA, { unitId: HA, start: s, end: e }));
    return [setEq(got, ["hold-h1", "lease-k3"]), `ได้ ${J([...got])}`];
  }, "MAJOR");
  await T("O-8", "เรียง startDate จากน้อยไปมาก", ["occupancyRange"], async () => {
    const rows = await range(ctxA, { unitId: HA, start: D(-40), end: D(100) });
    const s = rows.map((r: any) => r.startDate);
    return [s.length >= 5 && s.every((x: string, i: number) => i === 0 || s[i - 1] <= x), J(s)];
  }, "MINOR");

  // ═══════════════ W. roomBoard (ข้อมูล) ═══════════════
  console.log("\n── W roomBoard ──");
  const board = async (ctx: any, unitId: string, date: string | Date = TODAY): Promise<any[]> => fn("roomBoard")!(ctx, { unitId, date });
  let hotelCells: any[] = [];
  let dormCells: any[] = [];
  await T("W-1", "next = การครองถัดไป (active · ไม่ใช่ hold หมดเวลา · เริ่มหลังวันผัง) {kind,startDate} · ไม่มี ⇒ null", ["roomBoard"], async () => {
    hotelCells = await board(ctxA, HA);
    dormCells = await board(ctxA, DA);
    const by = (cells: any[], id: string) => cells.find((c: any) => c.roomId === id);
    const e1 = by(hotelCells, HR.E1), f1 = by(hotelCells, HR.F1), g1 = by(hotelCells, HR.G1), r207 = by(dormCells, DR[BOOKED_NO]), r108 = by(dormCells, DR["108"]), r101 = by(dormCells, DR["101"]);
    const ok = e1?.use === "VACANT" && e1?.next?.kind === "STAY" && e1?.next?.startDate === D(5)
      && f1?.next?.startDate === D(90) && r207?.use === "VACANT" && r207?.next?.kind === "LEASE" && r207?.next?.startDate === D(12)
      && r108?.next?.startDate === D(90) && g1?.next === null && r101?.next === null;
    return [!!ok, `E1=${J(e1?.next)} F1=${J(f1?.next)} G1=${J(g1?.next)} 207=${J(r207?.next)} 108=${J(r108?.next)} 101=${J(r101?.next)}`];
  });
  await T("W-2", "finance = null เสมอ (แกนห้องไม่รู้เรื่องบิล — ผู้เรียกเติม)", ["roomBoard"], async () => {
    const cells = hotelCells.length ? hotelCells : await board(ctxA, HA);
    return [cells.length > 0 && cells.every((c: any) => c.finance === null), J(cells.map((c: any) => c.finance))];
  }, "MAJOR");
  await T("W-3", "hkStatus = แหล่งความจริง: K2 (status OOO · hk CLEAN) ⇒ hkStatus CLEAN · K3 hk OUT_OF_ORDER ⇒ OUT_OF_ORDER · 302 OUT_OF_ORDER", ["roomBoard"], async () => {
    const k2 = hotelCells.find((c: any) => c.roomId === HR.K2), k3 = hotelCells.find((c: any) => c.roomId === HR.K3), r302 = dormCells.find((c: any) => c.roomId === DR[REPAIR_NO]);
    return [k2?.hkStatus === "CLEAN" && k3?.hkStatus === "OUT_OF_ORDER" && r302?.hkStatus === "OUT_OF_ORDER", `K2=${k2?.hkStatus} K3=${k3?.hkStatus} 302=${r302?.hkStatus}`];
  }, "MAJOR");

  // ═══════════════ U. RoomBoard (render) ═══════════════
  console.log("\n── U RoomBoard (renderToStaticMarkup) ──");
  const NAMES: Record<string, string> = { [DR["101"]]: "ณัฐวุฒิ", [DR["106"]]: "วิชัย", [DR["305"]]: "สุดารัตน์" };
  const FIN: Record<string, { tone: string; text: string }> = {};
  for (const no of LEASED_NOS) FIN[DR[no]] = { tone: "paid", text: "พ.ย. จ่ายแล้ว" };
  FIN[DR["106"]] = { tone: "overdue", text: "ค้าง ต.ค. ฿5,214" };
  FIN[DR["305"]] = { tone: "overdue", text: "ค้าง ต.ค. ฿4,986" };
  FIN[DR["104"]] = { tone: "pending", text: "สลิปรอตรวจ" };
  FIN[DR["211"]] = { tone: "unpaid", text: "พ.ย. ยังไม่จ่าย" };
  const dormProps = (extra: Record<string, unknown> = {}) => ({ cells: dormCells, date: TODAY, buildings: [{ id: bldA, name: "อาคาร A" }], ...extra });
  const nosOf = (html: string) => cellsIn(html).map((c) => c.attrs["data-room-number"] ?? "").sort();
  const cellByNo = (html: string, no: string) => cellsIn(html).find((c) => c.attrs["data-room-number"] === no);

  let floorHtml = "";
  await T("U-1", "render ได้ (ไม่ต้องมี router ของ Next) · data-view=floor ค่าปริยาย · 36 ช่อง data-room-id ไม่ซ้ำ · มี data-room-number/data-status/data-shape/data-hk ทุกช่อง", ["roomBoard"], async () => {
    floorHtml = render(dormProps());
    const cells = cellsIn(floorHtml);
    const ids = new Set(cells.map((c) => c.attrs["data-room-id"]));
    const attrsOk = cells.every((c) => c.attrs["data-room-number"] && c.attrs["data-status"] && c.attrs["data-shape"] && c.attrs["data-hk"]);
    return [/data-view="floor"/.test(floorHtml) && cells.length === 36 && ids.size === 36 && attrsOk, `view floor=${/data-view="floor"/.test(floorHtml)} ช่อง=${cells.length} ไม่ซ้ำ=${ids.size} attr ครบ=${attrsOk}`];
  }, "CRITICAL", true);
  await T("U-2", "36 ห้องตรงสถานะจาก occupancy: มีผู้เช่า 31 · ว่าง 108/210/311 (108 จองไกล 90 วันยังว่าง) · จอง 207 (เข้าใน 12 วัน) · ปิดซ่อม 302", ["roomBoard"], async () => {
    const cells = cellsIn(floorHtml || render(dormProps()));
    const st = (s: string) => cells.filter((c) => c.attrs["data-status"] === s).map((c) => c.attrs["data-room-number"]).sort();
    const leased = st("LEASED");
    const ok = leased.length === 31 && J(st("VACANT")) === J(VAC) && J(st("BOOKED")) === J([BOOKED_NO]) && J(st("REPAIR")) === J([REPAIR_NO]);
    return [ok, `LEASED=${leased.length} VACANT=${J(st("VACANT"))} BOOKED=${J(st("BOOKED"))} REPAIR=${J(st("REPAIR"))} อื่น=${J(cells.filter((c) => !["LEASED", "VACANT", "BOOKED", "REPAIR"].includes(c.attrs["data-status"])).map((c) => c.attrs["data-status"]))}`];
  }, "CRITICAL", true);
  await T("U-3", "สถานะไม่พึ่งสี: ทุกช่องมีป้ายข้อความของสถานะ + data-shape ตามสัญญา (ว่าง=dashed · มีผู้เช่า=solid · จอง=tinted · ปิดซ่อม=hatched) · ช่องจองมีคำว่า \"เข้า\"", ["roomBoard"], async () => {
    const cells = cellsIn(floorHtml || render(dormProps()));
    const bad = cells.filter((c) => {
      const s = STATUS[c.attrs["data-status"]];
      return !s || c.attrs["data-shape"] !== s.shape || !textOf(c.html).includes(s.label);
    }).map((c) => `${c.attrs["data-room-number"]}:${c.attrs["data-status"]}/${c.attrs["data-shape"]}`);
    const b207 = cellByNo(floorHtml, BOOKED_NO);
    return [bad.length === 0 && !!b207 && textOf(b207.html).includes("เข้า"), `ผิด ${bad.slice(0, 6).join(" ")} · 207="${b207 ? textOf(b207.html) : "-"}"`];
  }, "CRITICAL", true);
  await T("U-4", "ตามชั้น: 3 กลุ่ม data-floor-group หัว \"ชั้น 1/2/3\" + \"มีผู้เช่า 11/12 · 10/12 · 10/12\" · ห้องในกลุ่มเรียงเลขห้อง", ["roomBoard"], async () => {
    const groups = boxes(floorHtml || render(dormProps()), "data-floor-group");
    const info = groups.map((g) => {
      const t = textOf(g.html);
      const nos = cellsIn(g.html).map((c) => c.attrs["data-room-number"]);
      return { t, nos };
    });
    const want = [["ชั้น 1", "11/12", "101"], ["ชั้น 2", "10/12", "201"], ["ชั้น 3", "10/12", "301"]];
    const ok = info.length === 3 && want.every(([h, n, first], i) => info[i].t.includes(h) && info[i].t.includes(`มีผู้เช่า ${n}`) && info[i].nos.length === 12 && info[i].nos[0] === first && info[i].nos.every((x, j) => j === 0 || info[i].nos[j - 1] < x));
    return [ok, info.map((x) => `${x.t.slice(0, 30)}… [${x.nos.length}] ${x.nos.slice(0, 3).join(",")}`).join(" | ")];
  }, "MAJOR", true);
  await T("U-5", "คำอธิบายสัญลักษณ์ (data-legend) มีป้ายครบ 6 สถานะ: ว่าง · มีผู้เช่า · มีแขก · ถือไว้ · จอง · ปิดซ่อม", ["roomBoard"], async () => {
    const lg = boxes(floorHtml || render(dormProps()), "data-legend")[0];
    const t = lg ? textOf(lg.html) : "";
    const miss = Object.values(STATUS).map((s) => s.label).filter((l) => !t.includes(l));
    return [!!lg && miss.length === 0 && cellsIn(lg?.html ?? "").length === 0, lg ? `ขาด ${miss.join(",")}` : "ไม่มี data-legend"];
  }, "MAJOR", true);
  await T("U-6", "ตัวควบคุม: ปุ่ม \"ตามชั้น\"/\"รายการ\" · ช่องค้นหา (input) · ตัวกรองสถานะ", ["roomBoard"], async () => {
    const h = floorHtml || render(dormProps());
    const t = textOf(h);
    const input = /<input\b[^>]*(type="search"|placeholder="[^"]*ค้น)/.test(h);
    const filter = /data-filter-status|<select\b/.test(h);
    return [t.includes("ตามชั้น") && t.includes("รายการ") && input && filter, `ตามชั้น=${t.includes("ตามชั้น")} รายการ=${t.includes("รายการ")} input=${input} filter=${filter}`];
  }, "MAJOR", true);
  await T("U-7", "initialView=list ⇒ data-view=list · 36 แถว data-room-id · ทุกแถวมีเลขห้อง + ป้ายสถานะ", ["roomBoard"], async () => {
    const h = render(dormProps({ initialView: "list" }));
    const cells = cellsIn(h);
    const bad = cells.filter((c) => { const t = textOf(c.html); return !t.includes(c.attrs["data-room-number"]) || !t.includes(STATUS[c.attrs["data-status"]]?.label ?? "@@"); });
    return [/data-view="list"/.test(h) && !/data-view="floor"/.test(h) && cells.length === 36 && bad.length === 0, `list=${/data-view="list"/.test(h)} แถว=${cells.length} ผิด=${bad.length}`];
  }, "MAJOR", true);
  await T("U-8", "ตัวกรองสถานะ: VACANT ⇒ 108/210/311 เท่านั้น · REPAIR ⇒ 302 · BOOKED ⇒ 207 · กลุ่มชั้นที่ไม่เหลือห้องไม่แสดง", ["roomBoard"], async () => {
    const v = render(dormProps({ initialFilter: { status: "VACANT" } }));
    const r = render(dormProps({ initialFilter: { status: "REPAIR" } }));
    const b = render(dormProps({ initialFilter: { status: "BOOKED" } }));
    const rGroups = boxes(r, "data-floor-group").length;
    return [J(nosOf(v)) === J(VAC) && J(nosOf(r)) === J([REPAIR_NO]) && J(nosOf(b)) === J([BOOKED_NO]) && rGroups === 1, `VACANT=${J(nosOf(v))} REPAIR=${J(nosOf(r))} BOOKED=${J(nosOf(b))} กลุ่มเมื่อกรองซ่อม=${rGroups}`];
  }, "MAJOR", true);
  await T("U-9", "ค้นหา q: \"11\" ⇒ 110/111/112/211/311 · ชื่อผู้เช่าที่ผู้เรียกส่ง (occupantLabels) \"ณัฐ\" ⇒ 101 · ไม่พบ ⇒ ข้อความ \"ไม่พบห้อง\"", ["roomBoard"], async () => {
    const a = render(dormProps({ occupantLabels: NAMES, initialFilter: { q: "11" } }));
    const b = render(dormProps({ occupantLabels: NAMES, initialFilter: { q: "ณัฐ" } }));
    const c = render(dormProps({ occupantLabels: NAMES, initialFilter: { q: "zzz-ไม่มี" } }));
    const ok = J(nosOf(a)) === J(["110", "111", "112", "211", "311"]) && J(nosOf(b)) === J(["101"]) && cellsIn(c).length === 0 && textOf(c).includes("ไม่พบห้อง");
    return [ok, `"11"=${J(nosOf(a))} "ณัฐ"=${J(nosOf(b))} ไม่พบ=${cellsIn(c).length}/${textOf(c).includes("ไม่พบห้อง")}`];
  }, "MAJOR", true);
  await T("U-10", "ชื่อผู้เช่าที่ผู้เรียกส่งแสดงในช่อง (101 ณัฐวุฒิ) · ไม่ส่ง ⇒ ไม่มีชื่อ (ผังไม่ดึงชื่อเอง)", ["roomBoard"], async () => {
    const a = cellByNo(render(dormProps({ occupantLabels: NAMES })), "101");
    const b = cellByNo(floorHtml || render(dormProps()), "101");
    return [!!a && textOf(a.html).includes("ณัฐวุฒิ") && !!b && !textOf(b.html).includes("ณัฐวุฒิ"), `ส่ง="${a ? textOf(a.html) : "-"}" ไม่ส่ง="${b ? textOf(b.html) : "-"}"`];
  }, "MINOR", true);
  let finHtml = "";
  await T("U-11", "ช่องป้ายการเงิน (ผู้เรียกเติม): ข้อความตามที่ส่ง + data-finance=tone · 106 ค้าง · 104 สลิปรอตรวจ · 211 ยังไม่จ่าย · ไม่ส่ง finance ⇒ ไม่มี data-finance และไม่มีข้อความเงิน", ["roomBoard"], async () => {
    finHtml = render(dormProps({ finance: FIN }));
    const c = (no: string) => cellByNo(finHtml, no);
    const chk = (no: string, tone: string, text: string) => { const x = c(no); return !!x && x.attrs["data-finance"] === tone && textOf(x.html).includes(text); };
    const ok1 = chk("106", "overdue", "ค้าง ต.ค. ฿5,214") && chk("305", "overdue", "ค้าง ต.ค. ฿4,986") && chk("104", "pending", "สลิปรอตรวจ") && chk("211", "unpaid", "พ.ย. ยังไม่จ่าย") && chk("101", "paid", "พ.ย. จ่ายแล้ว");
    const plain = floorHtml || render(dormProps());
    const ok2 = !/data-finance=/.test(plain) && !/จ่ายแล้ว|ค้าง ต\.ค\.|฿/.test(textOf(plain));
    const vac = c("108");
    return [ok1 && ok2 && !!vac && !vac.attrs["data-finance"], `ใส่=${ok1} ไม่ใส่สะอาด=${ok2} 106="${c("106") ? textOf(c("106")!.html) : "-"}" attr=${c("106")?.attrs["data-finance"]}`];
  }, "CRITICAL", true);
  await T("U-12", "ค้างจ่ายเห็นได้โดยไม่พึ่งสี: ช่อง overdue มี data-alert=\"true\" และข้อความเงินอยู่ในช่อง · สถานะหลักยังเป็น LEASED", ["roomBoard"], async () => {
    const x = cellByNo(finHtml || render(dormProps({ finance: FIN })), "106");
    const y = cellByNo(finHtml, "101");
    return [!!x && x.attrs["data-alert"] === "true" && x.attrs["data-status"] === "LEASED" && !!y && y.attrs["data-alert"] !== "true", `106 alert=${x?.attrs["data-alert"]} status=${x?.attrs["data-status"]} · 101 alert=${y?.attrs["data-alert"]}`];
  }, "MAJOR", true);
  await T("U-13", "ตัวกรองการเงิน initialFilter.finance=overdue ⇒ 106/305 เท่านั้น · pending ⇒ 104", ["roomBoard"], async () => {
    const a = render(dormProps({ finance: FIN, initialFilter: { finance: "overdue" } }));
    const b = render(dormProps({ finance: FIN, initialFilter: { finance: "pending" } }));
    return [J(nosOf(a)) === J(["106", "305"]) && J(nosOf(b)) === J(["104"]), `overdue=${J(nosOf(a))} pending=${J(nosOf(b))}`];
  }, "MAJOR", true);
  await T("U-14", "hrefTemplate \"/x/rooms/{roomId}\" ⇒ ช่องเป็นลิงก์ <a href> ไปห้องนั้น · ไม่ส่ง ⇒ ไม่มี href", ["roomBoard"], async () => {
    const h = render(dormProps({ hrefTemplate: "/x/rooms/{roomId}" }));
    const c = cellByNo(h, "101");
    const hasLink = !!c && (c.attrs.href === `/x/rooms/${DR["101"]}` || new RegExp(`<a\\b[^>]*href="/x/rooms/${DR["101"]}"`).test(c.html));
    return [hasLink && !/href="\/x\/rooms/.test(floorHtml), `ลิงก์=${hasLink}`];
  }, "MINOR", true);
  await T("U-15", "ข้อห้ามกฎหมาย: markup ไม่มีปุ่ม/ข้อความล็อกห้อง · ตัดน้ำไฟ (ทุกมุมมอง/ตัวกรอง)", ["roomBoard"], async () => {
    const all = [floorHtml || render(dormProps()), render(dormProps({ initialView: "list", finance: FIN })), finHtml].map(textOf).join(" ");
    const m = LEGAL_BAD.exec(all);
    return [!m, m ? `พบ "${m[0]}"` : ""];
  }, "CRITICAL", true);
  await T("U-16", "โรงแรมผสม: G1 มีแขก(filled) · H1 ถือไว้(double) · H2 hold หมดเวลา ⇒ ว่าง · K1 ว่าง+ข้อความ \"รอทำ\" (data-hk=DIRTY) · K2 status OOO แต่ hk CLEAN ⇒ ว่าง (ไม่ใช่ปิดซ่อม) · K3 มีผู้เช่า+ข้อความ \"ปิดซ่อม\" · F1 จองไกล ⇒ ว่าง · E1 จบวันนี้+ถัดไปใน 5 วัน ⇒ จอง", ["roomBoard"], async () => {
    const h = render({ cells: hotelCells, date: TODAY, buildings: [{ id: bH1, name: "ตึกริมน้ำ" }, { id: bH2, name: "ตึกสวน" }], occupiedLabel: "มีแขก" });
    const st = (no: string) => { const c = cellByNo(h, no); return c ? { s: c.attrs["data-status"], shape: c.attrs["data-shape"], hk: c.attrs["data-hk"], t: textOf(c.html) } : null; };
    const g1 = st("G1"), h1 = st("H1"), h2 = st("H2"), k1 = st("K1"), k2 = st("K2"), k3 = st("K3"), f1 = st("F1"), e1 = st("E1");
    const ok = g1?.s === "GUEST" && g1.shape === "filled" && g1.t.includes("มีแขก") && h1?.s === "HOLD" && h1.shape === "double" && h1.t.includes("ถือไว้")
      && h2?.s === "VACANT" && k1?.s === "VACANT" && k1.hk === "DIRTY" && k1.t.includes("รอทำ") && k2?.s === "VACANT" && k2.hk === "CLEAN"
      && k3?.s === "LEASED" && k3.t.includes("ปิดซ่อม") && f1?.s === "VACANT" && e1?.s === "BOOKED";
    return [ok, J({ g1, h1: h1?.s, h2: h2?.s, k1: k1 && [k1.s, k1.hk], k2: k2 && [k2.s, k2.hk], k3: k3 && [k3.s, k3.t], f1: f1?.s, e1: e1?.s })];
  }, "CRITICAL", true);
  await T("U-17", "หลายอาคาร: หัวกลุ่มมีชื่ออาคาร (ตึกริมน้ำ ก่อน ตึกสวน ตาม buildings) · ห้องไม่มีอาคาร/ชั้น อยู่กลุ่ม \"ไม่ระบุ\" ท้ายสุด · occupiedLabel=\"มีแขก\" ใช้ในหัวกลุ่ม", ["roomBoard"], async () => {
    const h = render({ cells: hotelCells, date: TODAY, buildings: [{ id: bH1, name: "ตึกริมน้ำ" }, { id: bH2, name: "ตึกสวน" }], occupiedLabel: "มีแขก" });
    const gs = boxes(h, "data-floor-group").map((g) => ({ t: textOf(g.html), nos: cellsIn(g.html).map((c) => c.attrs["data-room-number"]) }));
    const iRiver = gs.findIndex((g) => g.t.includes("ตึกริมน้ำ")), iGarden = gs.findIndex((g) => g.t.includes("ตึกสวน"));
    const last = gs[gs.length - 1];
    const ok = gs.length === 4 && iRiver >= 0 && iGarden > iRiver && last?.t.includes("ไม่ระบุ") && J(last.nos) === J(["N1"]) && gs[0].t.includes("มีแขก 1/");
    return [ok, gs.map((g) => `${g.t.slice(0, 40)} [${g.nos.join(",")}]`).join(" | ")];
  }, "MINOR", true);

  // ═══════════════ K. setRoomTypeRent affected ═══════════════
  console.log("\n── K setRoomTypeRent affected ──");
  const tK = await mkType(A, HA, "K ประเภท", "NIGHTLY");
  const K1 = await mkRoom(A, HA, tK, "KR1");                          // ตามประเภท
  const K2 = await mkRoom(A, HA, tK, "KR2", { rentMode: "BOTH" });    // override ⇒ ไม่กระทบ
  const K3 = await mkRoom(A, HA, tK, "KR3");                          // ตามประเภท · การจองจบแล้ว
  const kStay1 = await rawOcc(A, HA, K1, D(10), D(12), "STAY", "HotelReservation", "k-rv1");
  await rawOcc(A, HA, K2, D(10), D(12), "STAY", "HotelReservation", "k-rv2");
  await rawOcc(A, HA, K3, D(-10), D(-8), "STAY", "HotelReservation", "k-rv3");
  await rawOcc(A, HA, K1, D(20), D(22), "STAY", "HotelReservation", "k-rv1b", { active: false });
  await T("K-1", "NIGHTLY→MONTHLY: ok + affected = [STAY ที่ยังไม่จบของห้องที่ตามประเภท] (มี roomId) · ไม่รวมห้อง override · ไม่รวมที่จบแล้ว/inactive · ประเภทเปลี่ยนจริง (ไม่บล็อก)", ["setRoomTypeRent"], async () => {
    const r = await fn("setRoomTypeRent")!(ctxA, { unitId: HA, roomTypeId: tK, rentMode: "MONTHLY", monthlyRateSatang: 450000 });
    const t = await prisma.hotelRoomType.findUnique({ where: { id: tK } });
    const af = Array.isArray(r?.affected) ? r.affected : null;
    const ok = r?.ok === true && af && af.length === 1 && af[0].occupancyId === kStay1.id && af[0].roomId === K1 && af[0].kind === "STAY" && af[0].refId === "k-rv1" && t?.rentMode === "MONTHLY";
    return [!!ok, `${J(r)} → type=${t?.rentMode}`];
  }, "MAJOR");
  await T("K-2", "MONTHLY→NIGHTLY: affected = LEASE ที่ยังไม่จบของห้องที่ตามประเภท · BOTH ⇒ affected [] (มีคีย์ affected เสมอเมื่อ ok)", ["setRoomTypeRent"], async () => {
    const lease = await rawOcc(A, HA, K3, D(30), D(60), "LEASE", "DormLease", "k-lease3");
    const a = await fn("setRoomTypeRent")!(ctxA, { unitId: HA, roomTypeId: tK, rentMode: "NIGHTLY" });
    const b = await fn("setRoomTypeRent")!(ctxA, { unitId: HA, roomTypeId: tK, rentMode: "BOTH" });
    const okA = a?.ok === true && Array.isArray(a.affected) && a.affected.length === 1 && a.affected[0].occupancyId === lease.id && a.affected[0].roomId === K3;
    const okB = b?.ok === true && Array.isArray(b.affected) && b.affected.length === 0;
    return [okA && okB, `NIGHTLY=${J(a)} BOTH=${J(b)}`];
  }, "MAJOR");
  await T("K-3", "ร้านอื่น ⇒ ok:false ไม่มี affected · ประเภทไม่เปลี่ยน", ["setRoomTypeRent"], async () => {
    const r = await fn("setRoomTypeRent")!(ctxB, { unitId: HA, roomTypeId: tK, rentMode: "MONTHLY" });
    const t = await prisma.hotelRoomType.findUnique({ where: { id: tK } });
    return [r?.ok === false && !r?.affected && t?.rentMode === "BOTH", `${J(r)} type=${t?.rentMode}`];
  }, "CRITICAL");

  // ═══════════════ Y. sweepStaleOccupancy ═══════════════
  console.log("\n── Y sweepStaleOccupancy (เก็บกวาด occupancy ค้าง) ──");
  const tY = await mkType(A, HA, "Y ประเภท");
  const yRoom: Record<string, string> = {};
  for (const k of ["OUT", "CAN", "REF", "MISS", "BK", "CI", "BKPAST", "LEASE", "BLOCK", "HOLD", "DONE", "OTHER"]) yRoom[k] = await mkRoom(A, HA, tY, `Y-${k}`);
  let rvSeq = 0;
  const mkRv = async (status: string, s: string, e: string, roomId: string, tenantId = A, unitId = HA, typeId = tY) =>
    (await prisma.hotelReservation.create({ data: { tenantId, unitId, code: `R09-${stamp}-${++rvSeq}`, status, guestName: "แขก QC", roomTypeId: typeId, roomId, checkInDate: dbDate(s), checkOutDate: dbDate(e), nights: 2 } })).id as string;
  const rvOut = await mkRv("CHECKED_OUT", D(-2), D(3), yRoom.OUT);        // เช็คเอาท์ก่อนกำหนด แต่ปล่อยห้องล้ม
  const rvCan = await mkRv("CANCELLED", D(5), D(7), yRoom.CAN);
  const rvRef = await mkRv("REFUNDED", D(-1), D(2), yRoom.REF);
  const rvBk = await mkRv("BOOKED", D(5), D(7), yRoom.BK);
  const rvCi = await mkRv("CHECKED_IN", D(-1), D(2), yRoom.CI);
  const rvBkPast = await mkRv("BOOKED", D(-5), D(-3), yRoom.BKPAST);     // no-show ค้าง: ไม่ใช่งานของตัวกวาด
  const rvDone = await mkRv("CHECKED_OUT", D(-9), D(-7), yRoom.DONE);
  const rvOther = await mkRv("CHECKED_OUT", D(1), D(4), ZB, B, HB, tHB); // การจองของร้าน B id นี้ — occupancy ร้าน A อ้าง id นี้ = ไม่ใช่ของร้านตัวเอง ⇒ ถือว่าไม่พบ
  const HRV = "HotelReservation";
  const yOcc: Record<string, any> = {};
  yOcc.OUT = await rawOcc(A, HA, yRoom.OUT, D(-2), D(3), "STAY", HRV, rvOut);
  yOcc.CAN = await rawOcc(A, HA, yRoom.CAN, D(5), D(7), "STAY", HRV, rvCan);
  yOcc.REF = await rawOcc(A, HA, yRoom.REF, D(-1), D(2), "STAY", HRV, rvRef);
  yOcc.MISS = await rawOcc(A, HA, yRoom.MISS, D(1), D(3), "STAY", HRV, `missing-${stamp}`);
  yOcc.OTHER = await rawOcc(A, HA, yRoom.OTHER, D(1), D(4), "STAY", HRV, rvOther);
  yOcc.BK = await rawOcc(A, HA, yRoom.BK, D(5), D(7), "STAY", HRV, rvBk);
  yOcc.CI = await rawOcc(A, HA, yRoom.CI, D(-1), D(2), "STAY", HRV, rvCi);
  yOcc.BKPAST = await rawOcc(A, HA, yRoom.BKPAST, D(-5), D(-3), "STAY", HRV, rvBkPast);
  yOcc.LEASE = await rawOcc(A, HA, yRoom.LEASE, D(-5), D(50), "LEASE", "DormLease", rvOut);       // refType อื่น (แม้ refId ชี้การจองที่ออกแล้ว) ⇒ ไม่แตะ
  yOcc.BLOCK = await rawOcc(A, HA, yRoom.BLOCK, D(0), D(2), "BLOCK", "Maintenance", `blk-${stamp}`);
  yOcc.HOLD = await rawOcc(A, HA, yRoom.HOLD, D(0), D(2), "HOLD", "QcHold", `hold-${stamp}`, { holdExpiresAt: new Date(Date.now() + 5 * HOUR) });
  yOcc.DONE = await rawOcc(A, HA, yRoom.DONE, D(-9), D(-7), "STAY", HRV, rvDone, { active: false });
  const STALE = ["OUT", "CAN", "REF", "MISS", "OTHER"];
  const KEEP = ["BK", "CI", "BKPAST", "LEASE", "BLOCK", "HOLD", "DONE"];
  const yEvents = async () => (await prisma.outboxEvent.findMany({ where: { tenantId: A, type: EV } })).filter((e: any) => Object.values(yRoom).includes(e.payload?.roomId));
  const ev0 = (await yEvents()).length;
  let sweepRes: any = null;
  await T("Y-1", "ปล่อย (active=false) occupancy ของการจองโรงแรมที่ CHECKED_OUT · CANCELLED · REFUNDED · ไม่พบการจอง · การจองเป็นของร้านอื่น", ["sweepStaleOccupancy"], async () => {
    sweepRes = await fn("sweepStaleOccupancy")!(new Date());
    const rows = await prisma.roomOccupancy.findMany({ where: { id: { in: STALE.map((k) => yOcc[k].id) } } });
    const still = rows.filter((r: any) => r.active).map((r: any) => STALE.find((k) => yOcc[k].id === r.id));
    return [rows.length === STALE.length && still.length === 0 && typeof sweepRes?.released === "number" && sweepRes.released >= STALE.length, `ยัง active=${J(still)} คืน=${J(sweepRes)}`];
  }, "CRITICAL");
  await T("Y-2", "ไม่แตะของที่ยังถูกต้อง: BOOKED · CHECKED_IN · BOOKED เลยวัน (no-show) · LEASE/BLOCK/HOLD refType อื่น · แถว inactive เดิม (updatedAt ไม่ขยับ)", ["sweepStaleOccupancy"], async () => {
    const rows = await prisma.roomOccupancy.findMany({ where: { id: { in: KEEP.map((k) => yOcc[k].id) } } });
    const bad = rows.filter((r: any) => {
      const k = KEEP.find((x) => yOcc[x].id === r.id)!;
      return r.active !== yOcc[k].active || r.updatedAt.getTime() !== yOcc[k].updatedAt.getTime();
    }).map((r: any) => KEEP.find((x) => yOcc[x].id === r.id));
    return [rows.length === KEEP.length && bad.length === 0, `ถูกแตะ ${J(bad)}`];
  }, "CRITICAL");
  await T("Y-3", "event rooms.occupancy.changed ต่อแถวที่ปล่อย 1 ตัว · payload ตรง 4 คีย์ {unitId,roomId,from,to} = ช่วงเดิม · outbox.unitId = หน่วย", ["sweepStaleOccupancy"], async () => {
    const ev = (await yEvents()).slice(ev0);
    const want = STALE.map((k) => ({ roomId: yRoom[k], from: J(yOcc[k].startDate).slice(1, 11), to: J(yOcc[k].endDate).slice(1, 11) }));
    const okEach = want.every((w) => ev.filter((e: any) => e.payload?.roomId === w.roomId && e.payload?.from === w.from && e.payload?.to === w.to && e.unitId === HA && e.payload?.unitId === HA && Object.keys(e.payload).sort().join(",") === "from,roomId,to,unitId").length === 1);
    return [ev.length === STALE.length && okEach, `event ${ev.length} (ต้อง ${STALE.length}) ${J(ev.map((e: any) => e.payload)).slice(0, 200)}`];
  }, "MAJOR");
  await T("Y-4", "รันซ้ำ = ไม่มีอะไรเปลี่ยน: released 0 · แถวของเราไม่ขยับ · ไม่มี event เพิ่ม", ["sweepStaleOccupancy"], async () => {
    const before = await prisma.roomOccupancy.findMany({ where: { id: { in: Object.values(yOcc).map((o: any) => o.id) } }, select: { id: true, updatedAt: true, active: true } });
    const e1 = (await yEvents()).length;
    const r = await fn("sweepStaleOccupancy")!(new Date());
    const after = await prisma.roomOccupancy.findMany({ where: { id: { in: Object.values(yOcc).map((o: any) => o.id) } }, select: { id: true, updatedAt: true, active: true } });
    const moved = after.filter((a: any) => { const b = before.find((x: any) => x.id === a.id); return !b || b.updatedAt.getTime() !== a.updatedAt.getTime() || b.active !== a.active; }).length;
    const e2 = (await yEvents()).length;
    return [r?.released === 0 && moved === 0 && e2 === e1, `released=${r?.released} แถวขยับ=${moved} event +${e2 - e1}`];
  }, "MAJOR");
  await T("Y-5", "X5: เรียกซ้อน 2 ตัวพร้อมกัน (ของค้าง 120 แถว · เกินหนึ่งชุด) ⇒ ปล่อยครบ 120 · แต่ละแถว event ครั้งเดียว · ผลรวม released ของสองตัว = 120", ["sweepStaleOccupancy"], async () => {
    const tZ = await mkType(A, HA, "Y5");
    const ids: string[] = [];
    const roomIds: string[] = [];
    for (let i = 0; i < 120; i++) {
      const room = await mkRoom(A, HA, tZ, `Y5-${i}`);
      roomIds.push(room);
      const rv = await mkRv("CANCELLED", D(3), D(5), room, A, HA, tZ);
      ids.push((await rawOcc(A, HA, room, D(3), D(5), "STAY", HRV, rv)).id);
    }
    const [a, b] = await Promise.all([fn("sweepStaleOccupancy")!(new Date()), fn("sweepStaleOccupancy")!(new Date())]);
    const left = await prisma.roomOccupancy.count({ where: { id: { in: ids }, active: true } });
    const ev = (await prisma.outboxEvent.findMany({ where: { tenantId: A, type: EV } })).filter((e: any) => roomIds.includes(e.payload?.roomId));
    const perRoom = new Map<string, number>();
    for (const e of ev) perRoom.set(e.payload.roomId, (perRoom.get(e.payload.roomId) ?? 0) + 1);
    const dup = [...perRoom.values()].filter((n) => n !== 1).length;
    return [left === 0 && ev.length === 120 && dup === 0 && (a?.released ?? 0) + (b?.released ?? 0) === 120, `ค้าง=${left} event=${ev.length} ซ้ำ=${dup} released=${a?.released}+${b?.released}`];
  }, "CRITICAL");
  await T("Y-6", "หลังกวาด ห้องว่างจริง: claim STAY ช่วงเดิมของห้องที่เช็คเอาท์แล้ว ⇒ ok", ["sweepStaleOccupancy", "claimRoom"], async () => {
    const r = await prisma.$transaction((t: any) => fn("claimRoom")!(t, { tenantId: A, unitId: HA, roomId: yRoom.OUT, start: D(0), end: D(3), kind: "STAY", refType: "QcStay", refId: "y6-new" }));
    return [r?.ok === true, J(r)];
  }, "MAJOR");
  await T("Y-7", "งาน minute-job rooms.sweepStaleOccupancy เรียกได้จริง (run(now) ไม่ throw)", [], async () => {
    const reg = (globalThis as any)[Symbol.for("shark.platform.minute-jobs.registry")] as Map<string, any> | undefined;
    const job = reg?.get("rooms.sweepStaleOccupancy");
    if (!job) return [false, "ไม่มีงานในทะเบียน"];
    const ctrl = new AbortController();
    await job.run(new Date(), 30_000, { signal: ctrl.signal, deadline: Date.now() + 30_000 });
    return [true];
  }, "MINOR");

  // ═══════════════ Q. ฉากผังห้องหอบนร้าน svcqc ═══════════════
  console.log("\n── Q ฉากผังห้องหอ (svcqc · บ้านสวนอพาร์ตเมนต์) ──");
  const SV = (await import("./svc-qc-data.mjs" as string)) as any;
  const svcT = SV.SQC_TENANT.id as string;
  const svcDorm = SV.SQC_UNITS.dorm.id as string;
  const seeded = await prisma.hotelRoom.count({ where: { tenantId: svcT, unitId: svcDorm } });
  const runScene = (args: string[] = []) => {
    const r = spawnSync("pnpm", ["exec", "tsx", SCENE_FILE, ...args], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
    const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
    const m = /SCENE_SUMMARY (\{.*\})/.exec(out);
    let sum: any = null;
    try { sum = m ? JSON.parse(m[1]) : null; } catch { /* อ่านไม่ได้ */ }
    return { status: r.status, out, sum };
  };
  const sceneSkip = !existsSync(join(ROOT, SCENE_FILE)) ? `ยังไม่มี ${SCENE_FILE}` : seeded !== 36 ? `ร้าน svcqc หอมีห้อง ${seeded} (ต้อง 36) — รัน scripts/seed-svc-qc.mts ก่อน` : "";
  if (sceneSkip) {
    for (const [id, n] of [["Q-1", "สคริปต์ฉากรันได้"], ["Q-2", "ฉาก 31/3/1/1"], ["Q-3", "รันซ้ำไม่เขียน"], ["Q-4", "หัวชั้น 11/12 · 10/12 · 10/12"]]) skip(id, n, sceneSkip, "MAJOR");
  } else {
    let first: ReturnType<typeof runScene> | null = null;
    await T("Q-1", "สคริปต์ฉากรันได้ (exit 0) · พิมพ์ SCENE_SUMMARY {created,updated,removed}", [], async () => {
      first = runScene();
      return [first.status === 0 && !!first.sum && ["created", "updated", "removed"].every((k) => typeof first!.sum[k] === "number"), `exit=${first.status} ${first.sum ? J(first.sum) : first.out.split("\n").slice(-4).join(" | ").slice(0, 240)}`];
    }, "MAJOR");
    let svcCells: any[] = [];
    await T("Q-2", "roomBoard หอ svcqc วันนี้ ตรง README: มีผู้เช่า 31 · ว่าง 108/210/311 · 207 ว่างวันนี้แต่ next LEASE ใน 12 วัน · 302 BLOCKED", ["roomBoard"], async () => {
      svcCells = await fn("roomBoard")!({ tenantId: svcT }, { unitId: svcDorm, date: TODAY });
      const byNo = new Map(svcCells.map((c: any) => [c.number, c]));
      const leased = svcCells.filter((c: any) => c.use === "LEASED").length;
      const vac = svcCells.filter((c: any) => c.use === "VACANT" && !c.next).map((c: any) => c.number).sort();
      const c207: any = byNo.get("207"), c302: any = byNo.get("302");
      const ok = svcCells.length === 36 && leased === 31 && J(vac) === J(VAC) && c207?.use === "VACANT" && c207?.next?.kind === "LEASE" && c207?.next?.startDate === D(12) && c302?.use === "BLOCKED";
      return [ok, `ห้อง=${svcCells.length} LEASED=${leased} ว่าง=${J(vac)} 207=${c207?.use}/${J(c207?.next)} 302=${c302?.use}`];
    }, "MAJOR");
    await T("Q-3", "รันฉากซ้ำ ⇒ SCENE_SUMMARY created/updated/removed = 0", [], async () => {
      const r = runScene();
      return [r.status === 0 && r.sum?.created === 0 && r.sum?.updated === 0 && r.sum?.removed === 0, `exit=${r.status} ${J(r.sum)}`];
    }, "MAJOR");
    await T("Q-4", "RoomBoard ของฉาก svcqc: หัวชั้น มีผู้เช่า 11/12 · 10/12 · 10/12 · 302 ปิดซ่อม · 207 จอง", ["roomBoard"], async () => {
      const bl = await fn("listBuildings")!({ tenantId: svcT }, { unitId: svcDorm });
      const h = render({ cells: svcCells.length ? svcCells : await fn("roomBoard")!({ tenantId: svcT }, { unitId: svcDorm, date: TODAY }), date: TODAY, buildings: bl });
      const heads = boxes(h, "data-floor-group").map((g) => textOf(g.html));
      const ok = heads.length === 3 && heads[0].includes("มีผู้เช่า 11/12") && heads[1].includes("มีผู้เช่า 10/12") && heads[2].includes("มีผู้เช่า 10/12")
        && cellByNo(h, "302")?.attrs["data-status"] === "REPAIR" && cellByNo(h, "207")?.attrs["data-status"] === "BOOKED";
      return [ok, heads.map((x) => x.slice(0, 40)).join(" | ")];
    }, "MAJOR", true);
  }

  // ═══════════════ V. ภาพ ═══════════════
  console.log("\n── V ภาพผังห้องหอ ──");
  {
    const specs = SV.SQC_VISUAL_SPECS?.["r0.9"];
    const base = process.env.QC_BASE ?? "";
    if (!Array.isArray(specs) || !specs.some((s: any) => s.path === `/app/u/${SV.SQC_UNITS.dorm.slug}/dorm`)) fail("V-1", "SQC_VISUAL_SPECS r0.9 มีหน้า dorm-floorplan", J(specs), "MAJOR");
    else if (!base) skip("V-1", "ภาพ dorm-floorplan 1440 + 390 (ไม่ล้นแนวนอน · HTTP < 400 · ไม่มี page error)", "ไม่มี QC_BASE — ต้องเปิด QC server ของ SVC (ผู้คุม build ผ่าน iso) แล้วรันซ้ำด้วย QC_BASE=http://127.0.0.1:<port>", "MAJOR");
    else {
      const r = spawnSync("pnpm", ["exec", "tsx", "scripts/visual-svc.mts", "r0.9", "--base", base], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
      const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
      if (r.status === 0) pass("V-1", "ภาพ dorm-floorplan 1440 + 390 ผ่าน (ภาพอยู่ .qc-shots/svc/r0.9 — ผู้คุมเทียบ PARITY กับ ledger/design-dorm/01-floorplan.png)");
      else fail("V-1", "ภาพ dorm-floorplan", `exit=${r.status} ${out.split("\n").filter((l) => l.includes("❌")).slice(0, 3).join(" | ").slice(0, 300)}`, "MAJOR");
    }
  }

  // ═══════════════ G. regression ═══════════════
  console.log("\n── G regression (ลูกโพรเซส · env เดียวกัน) ──");
  for (const [id, f] of [["G-1", "qc-svc-r0.8"], ["G-2", "qc-hotel-money"], ["G-3", "qc-hotel-public"], ["G-4", "qc-hotel-refund"]] as const) {
    const r = spawnSync("pnpm", ["exec", "tsx", `scripts/${f}.mts`], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
    const summ = [...out.matchAll(/ผ่าน \d+\/\d+/g)].map((m) => m[0]).pop() ?? ""; // บรรทัดสรุปของตัวเอง = ตัวท้ายสุด (ลูกโพรเซสซ้อนพิมพ์ก่อน)
    if (r.status === 0) pass(id, `regression ${f} เขียว (${summ})`);
    else fail(id, `regression ${f} เขียว`, `exit=${r.status} ${summ} · ${out.split("\n").filter((l) => l.includes("❌")).slice(0, 3).join(" | ").slice(0, 300)}`, "CRITICAL");
  }
} catch (e) {
  fail("CRASH", "จบกลางทาง", errMsg(e), "CRITICAL");
} finally {
  try { await cleanup(tenantIds); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); }
  try {
    const left = tenantIds.length ? await prisma.tenant.count({ where: { id: { in: tenantIds } } }) : 0;
    const occLeft = tenantIds.length ? await prisma.roomOccupancy.count({ where: { tenantId: { in: tenantIds } } }) : 0;
    console.log(`\n(ล้างแถวทดสอบ: tenant ค้าง ${left} · occupancy ค้าง ${occLeft} · ฉาก svcqc คงไว้ให้ถ่ายภาพ — ล้างด้วย ${"scripts/svc-qc-roomboard-scene.mts"} --clear)`);
  } catch { /* ฐานหลุด */ }
  await prisma.$disconnect();
}

const failed = cks.filter((c) => c.res === "FAIL");
const skipped = cks.filter((c) => c.res === "SKIP");
const passed = cks.length - failed.length - skipped.length;
console.log(`\n===== QC SVC R0.9 · ผังห้องร่วม RoomBoard =====\nผ่าน ${passed}/${cks.length}${skipped.length ? ` (SKIP ${skipped.length})` : ""}`);
console.log(`FINDINGS: CRITICAL ${failed.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${failed.filter((c) => c.sev === "MAJOR").length} · MINOR ${failed.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), findings: [...failed, ...skipped].map((c) => c.id) })}`);
// รับใบ = ผ่านทุกข้อ · SKIP ที่ยอมได้มีข้อเดียว: V-1 เมื่อไม่มี QC_BASE (ผู้คุมรันซ้ำพร้อม QC server ก่อนรับ)
process.exit(failed.length + skipped.length > 0 ? 1 : 0);
