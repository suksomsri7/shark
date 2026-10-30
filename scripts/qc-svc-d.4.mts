// QC — SVC D.4 · นำเข้า Excel (อัปโหลด → เดาคอลัมน์ → ตรวจ → พรีวิว → สร้าง → ย้อนกลับ) · oracle ของผู้คุม — builder ห้ามแก้ไฟล์นี้
// สัญญา: ledger/svc-briefs/svc-brief-d.4.md · ledger/SVC-MASTER-PLAN.md แถว D.4 · ภาพ ledger/design-dorm/12-import-excel.png · CC §1.7 §8 · SVC-RUN §1.5 X1 X3 X4 X6 X8 X9
//
// กลุ่มข้อ:
//   S  โครงสร้าง: ไฟล์ · facade · pure · จอไม่ลาก server · ด่านหน้า/action/route · สิทธิ์ · ค่าตั้ง X6 · ไม่มีเส้นเงินแยก · ไม่มีคำต้องห้าม สคบ.
//   PC positive control (ต้องเขียวก่อนมีงาน): เส้นเงิน D.5 · มิเตอร์ D.6 · ตัวตรวจกฎหมาย 3 โหมด · ไฟล์ตัวอย่าง CSV/cp874/UTF-16/XLSX ถูกต้อง · zip ระเบิดจริง · ตัวยิง 4 โพรเซส
//   F  แยกไฟล์/แปลงค่า (pure): CSV UTF-8/BOM · windows-874 · UTF-16LE · XLSX store/deflate/sharedStrings/inline/สูตร · ชีต · รูปแบบที่ไม่รองรับ · วันที่ พ.ศ. · เงิน · เดาหัวคอลัมน์
//   C6 เพดาน X6 จากทะเบียนค่าตั้ง (แถว · ขนาด · คอลัมน์ · เซลล์ยาว · zip ระเบิด)
//   N  เซลล์อันตราย (= + - @ tab CR ตัวเต็มความกว้าง DDE) ขาเข้า + ขาออก/สะท้อนกลับ
//   M  เดาคอลัมน์ (AI ผ่านตัวต่อที่เสียบได้ · ไม่ส่งชื่อ/เบอร์จริง · ล้ม = ไม่ throw) · คนยืนยัน (ไม่ยืนยัน ⇒ สร้างไม่ได้)
//   P  ตรวจ + พรีวิว: ตัวเลขภาพ 12 (32/3/1) · กฎ สคบ. ตามโหมด STRICT/WARN/OUT_OF_SCOPE · พรีวิวไม่เขียนข้อมูล · hash/STALE · ปัญหาแต่ละชนิด
//   L  แถวเตือนกฎหมาย (โหมด WARN): สร้างได้เฉพาะเจ้าของ + ยอมรับ
//   K  สร้าง: ไฟล์ 36 ห้องสร้างครบ (ห้อง · Party · สัญญา · ประกันยกมาผ่าน JV เดียวกับ D.5 · มิเตอร์ + เลขล่าสุด) · ค้างยกมาไม่ออกใบ
//   I  นำเข้าซ้ำ = ไม่ซ้ำ (ไฟล์เดิม · XLSX/CSV ข้อมูลเดิม · ไฟล์ที่มีห้องเพิ่ม)
//   U  ย้อนกลับ: ครบทุกอย่าง · บัญชีกลับรายการ (ไม่ลบ) · หน้าต่างเวลา · ตัวกั้น · สร้างใหม่หลังย้อน
//   R  พร้อมกัน: 4 โพรเซส × 3 (อัปโหลด/สร้าง) · 30 ทางในโพรเซสเดียว (ย้อน) · ย้อน ∥ สร้าง ⇒ ผู้ชนะเดียว · สองไฟล์ห้องทับกัน
//   A  สิทธิ์ (dorm.import · dorm.lease.manage · Membership สด) · X ข้ามร้าน/ข้ามหน่วย (X1)
//   W  จอ หอ 12 (renderToStaticMarkup) · Q ฉาก (ร้าน B) · V ภาพ · Z ล้างครบ · G regression (หลังล้าง)
//
// ข้อมูลทดสอบใต้ร้านชั่วคราว slug `qc-svc-d4-*` + ผู้ใช้ `svc-d4-*@shark.local` · ลบใน finally ทุกตารางที่มี tenantId (วนจน FK ไม่ค้าง)
// ไฟล์ตัวอย่างสร้างในข้อสอบนี้จาก `sqcImportSample` (scripts/svc-qc-data.mts บล็อก D.4) — CSV/TSV/XLSX เขียนเอง (ไม่มีไลบรารี xlsx ในโปรเจกต์ · มติ §2.2)
// ข้อสอบเขียนแบบไม่ขึ้นกับที่เก็บชุดนำเข้า (RULING-1 ทาง ก/ข ผ่านได้ทั้งคู่) — ตรวจผ่าน facade + ตารางธุรกิจ (ห้อง · สัญญา · Party · มิเตอร์ · เลข · JV)
// รัน: bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-d.4.mts
//      ต่อท้าย `--no-regression` ข้ามหมวด G (SKIP — ไม่นับผ่าน · iso.sh ทิ้ง env จึงใช้ SVC_D4_NO_REGRESSION=1 ผ่าน iso ไม่ได้)
/* eslint-disable @typescript-eslint/no-explicit-any */
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import * as zlib from "node:zlib";

const SELF = fileURLToPath(import.meta.url);
const ROOT = join(dirname(SELF), "..");
const LABEL = "qc-svc-d.4";
const SVC_HOST = "ep-mute-scene";
const FORBIDDEN_HOSTS = ["ep-royal-night", "ep-plain-art", "ep-cool-shadow", "ep-weathered-river", "ep-frosty-lab", "ep-fragrant-thunder"];
const RUN_CMD = "bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-d.4.mts";

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
if ((process.env.SESSION_SECRET ?? "").length < 32) process.env.SESSION_SECRET = randomBytes(32).toString("hex");

const DORM_IDX = "src/lib/modules/dorm/index.ts";
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 260);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9]);
const putNoop = async () => {};

// ═══════════════ โหมดลูก (`--child <base64 JSON>`) — ยิงคำขอพร้อมกันจากโพรเซสแยก ═══════════════
//   input ที่มี `__b64` ⇒ แปลงเป็น `data: Uint8Array` · ส่ง deps { put: noop } ให้ทุกฟังก์ชัน (ฟังก์ชันที่ไม่ใช้ก็ไม่เป็นไร)
const CHILD_AT = process.argv.indexOf("--child");
if (CHILD_AT >= 0) {
  let out: unknown[] = [];
  try {
    const job = JSON.parse(Buffer.from(process.argv[CHILD_AT + 1] ?? "", "base64url").toString("utf8")) as { op: string; ctx: unknown; inputs: any[]; at: number };
    let f: unknown;
    if (job.op === "__pc_claimRoom") {
      const rooms = (await import("@/lib/modules/rooms" as string)) as any;
      const { prisma } = (await import("@/lib/core/db" as string)) as any;
      f = (_ctx: unknown, input: unknown) => prisma.$transaction((tx: unknown) => rooms.claimRoom(tx, input));
    } else {
      const dorm = (await import(pathToFileURL(join(ROOT, DORM_IDX)).href)) as Record<string, unknown>;
      f = dorm[job.op];
    }
    if (typeof f !== "function") out = job.inputs.map(() => ({ childFail: `facade ไม่มี ${job.op}` }));
    else {
      const mat = (x: any) => { const o = { ...x }; if (typeof o.__b64 === "string") { o.data = new Uint8Array(Buffer.from(o.__b64, "base64")); delete o.__b64; } return o; };
      const wait = job.at - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      out = await Promise.all(job.inputs.map(async (x) => {
        try { return await (f as (...a: unknown[]) => Promise<unknown>)(job.ctx, mat(x), { put: putNoop }); }
        catch (e) { return { threw: errMsg(e) }; }
      }));
    }
  } catch (e) { out = [{ childFail: errMsg(e) }]; }
  console.log(`CHILD_RESULT ${JSON.stringify(out)}`);
  try { const { prisma } = (await import("@/lib/core/db" as string)) as any; await prisma.$disconnect(); } catch { /* ไม่เป็นไร */ }
  process.exit(0);
}

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Res = "PASS" | "FAIL" | "SKIP";
const cks: { id: string; res: Res; sev: Sev; why: string }[] = [];
const pass = (id: string, name: string) => { cks.push({ id, res: "PASS", sev: "CRITICAL", why: "" }); console.log(`  ✅ [${id}] ${name}`); };
const fail = (id: string, name: string, why: string, sev: Sev) => { cks.push({ id, res: "FAIL", sev, why }); console.log(`  ❌ [${id}] ${name} — ${why}`); };
const skip = (id: string, name: string, why: string, sev: Sev = "CRITICAL") => { cks.push({ id, res: "SKIP", sev, why }); console.log(`  ⏭️  [${id}] ${name} — SKIP: ${why}`); };
const chk = (id: string, name: string, ok: boolean, why: string, sev: Sev) => (ok ? pass(id, name) : fail(id, name, why, sev));
const J = (x: unknown) => { try { return JSON.stringify(x) ?? String(x); } catch { return String(x); } };
const read = (p: string) => (existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), "utf8") : "");
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
const LEGAL_BAD = /ล็อ[กค]ห้อง|ล็อ[กค]ประตู|ตัดน้ำ|ตัดไฟ|ระงับ(การ)?(จ่าย)?(น้ำ|ไฟ)|งด(จ่าย)?(น้ำ|ไฟ)|ยึดทรัพย์|ขนของออก/;
/** ขึ้นต้นด้วยอักขระสูตร (หลังตัดช่องว่างหัว) หรือ tab/CR/LF ดิบ */
const FORMULA_START = /^(?:[\t\r\n]|[ ]*[=+\-@＝＋－＠])/;
const NO_REG = process.argv.includes("--no-regression") || process.env.SVC_D4_NO_REGRESSION === "1";
const codeOf = (r: any) => (r?.ok === true ? "OK" : r?.threw ? `THROW:${r.threw}` : r?.childFail ? `CHILD:${r.childFail}` : String(r?.code ?? "?"));

// ═══════════════ วันที่ (วันไทย) ═══════════════
const DAY = 86_400_000;
const bkkYmd = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const TODAY = bkkYmd(new Date());
const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const ymdOf = (d: unknown) => (d instanceof Date ? d.toISOString().slice(0, 10) : typeof d === "string" ? d.slice(0, 10) : "");
const leaseEnd = (start: string, months: number) => {
  const y = Number(start.slice(0, 4)), m = Number(start.slice(5, 7)) - 1 + months, d = Number(start.slice(8, 10));
  const yy = y + Math.floor(m / 12), mm = ((m % 12) + 12) % 12;
  const dim = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();
  return addDays(new Date(Date.UTC(yy, mm, Math.min(d, dim))).toISOString().slice(0, 10), -1);
};
/** "1/5/69" (พ.ศ. 2 หลัก) ⇒ "2026-05-01" — เฉลยของข้อสอบ (ไม่ใช้โค้ดของใบ) */
const beToIso = (s: string) => { const [d, m, y] = s.split("/").map(Number); const be = y < 100 ? 2500 + y : y; return `${be - 543}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`; };

// ═══════════════ โหลดโมดูล ═══════════════
const tryImport = async (spec: string): Promise<any> => { try { return await import(spec); } catch (e) { console.log(`  (โหลด ${spec} ไม่ได้: ${errMsg(e)})`); return null; } };
const { prisma } = (await import("@/lib/core/db" as string)) as { prisma: any };
let dorm: any = null;
let dormWhy = "";
if (!existsSync(join(ROOT, DORM_IDX))) dormWhy = `ยังไม่มี ${DORM_IDX} (facade หอ)`;
else { try { dorm = await import(pathToFileURL(join(ROOT, DORM_IDX)).href); } catch (e) { dormWhy = `import facade dorm ล้ม: ${errMsg(e)}`; } }
const fn = (name: string): ((...a: any[]) => any) | null => (dorm && typeof dorm[name] === "function" ? dorm[name] : null);
const ROOMS: any = await tryImport("@/lib/modules/rooms");
const ACC: any = await tryImport("@/lib/modules/account");
const SYS: any = await tryImport("@/lib/modules/system/service");
const ASV: any = await tryImport("@/lib/modules/account/service");
const GL: any = await tryImport("@/lib/modules/account/gl");
const SET: any = await tryImport("@/lib/core/settings");
const LEGAL: any = await tryImport("@/lib/core/settings/legal/th-rental-2568");
const CSV: any = await tryImport("@/lib/core/csv");
const SV = (await import("./svc-qc-data.mjs" as string)) as any;

const SCREEN_FILE = "src/components/dorm/ImportScreen.tsx";
let screenMod: any = null;
let screenWhy = "";
if (!existsSync(join(ROOT, SCREEN_FILE))) screenWhy = `ยังไม่มี ${SCREEN_FILE}`;
else { try { screenMod = await import(pathToFileURL(join(ROOT, SCREEN_FILE)).href); } catch (e) { screenWhy = `import ImportScreen ล้ม: ${errMsg(e)}`; } }
const React = (await import("react" as string)) as any;
const RDS = (await import("react-dom/server" as string)) as any;
const ScreenC: any = screenMod ? (typeof screenMod.default === "function" ? screenMod.default : typeof screenMod.ImportScreen === "function" ? screenMod.ImportScreen : null) : null;
if (screenMod && !ScreenC && !screenWhy) screenWhy = "ImportScreen.tsx ไม่มี default export / export ImportScreen ที่เป็นคอมโพเนนต์";

/** ตัวรันข้อ — needs = ชื่อฟังก์ชันใน facade dorm (ขาด = FAIL ไม่ใช่ SKIP) · ui = ต้องใช้คอมโพเนนต์ */
async function T(id: string, name: string, needs: string[], body: () => Promise<[boolean, string?]>, sev: Sev = "CRITICAL", ui = false) {
  const miss = needs.filter((n) => !fn(n));
  if (miss.length) return fail(id, name, dorm ? `facade dorm ไม่มี ${miss.join(", ")}` : dormWhy, sev);
  if (ui && !ScreenC) return fail(id, name, screenWhy || "ไม่มีคอมโพเนนต์ ImportScreen", sev);
  try {
    const [ok, why] = await body();
    if (ok) pass(id, name); else fail(id, name, why ?? "ไม่ตรง", sev);
  } catch (e) { fail(id, name, `throw: ${errMsg(e)}`, sev); }
}

// ═══════════════ ตัวช่วย render ═══════════════
const render = (props: Record<string, unknown>): string => String(RDS.renderToStaticMarkup(React.createElement(ScreenC, props))).replace(/<!-- -->/g, "");
const unesc = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'");
const textOf = (html: string) => unesc(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const textNodes = (html: string) => html.split(/<[^>]+>/).map((t) => unesc(t)).filter((t) => t.trim() !== "");
const attrsOf = (openTag: string): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const m of openTag.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:="([^"]*)")?/g)) if (m[1] !== openTag.slice(1).split(/[\s>]/)[0]) out[m[1].toLowerCase()] = unesc(m[2] ?? "");
  return out;
};
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

// ═══════════════ ไฟล์ตัวอย่าง: CSV · windows-874 · UTF-16LE · XLSX (เขียนเอง) ═══════════════
const csvField = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v); // ดิบ — ไม่ทำให้เป็นกลาง (ไฟล์ต้องมีเซลล์อันตรายจริง)
const toCsvText = (headers: string[], rows: string[][], delim = ",") => [headers, ...rows].map((r) => r.map(csvField).join(delim)).join("\r\n") + "\r\n";
const enc = (s: string) => new Uint8Array(Buffer.from(s, "utf8"));
const csvBytes = (headers: string[], rows: string[][], bom = true) => enc((bom ? "﻿" : "") + toCsvText(headers, rows));
/** TIS-620/windows-874: ก–๛ (U+0E01–U+0E5B) ⇒ 0xA1–0xFB · ASCII คงเดิม */
const cp874 = (s: string) => new Uint8Array([...s].map((ch) => { const c = ch.codePointAt(0)!; if (c < 0x80) return c; if (c >= 0x0e01 && c <= 0x0e5b) return c - 0x0e00 + 0xa0; return 0x3f; }));
const utf16 = (s: string) => new Uint8Array(Buffer.from("﻿" + s, "utf16le"));
const crc32 = (b: Uint8Array): number => (zlib as any).crc32(b) >>> 0;
type ZipEntry = { name: string; data: Uint8Array; deflate?: boolean; declaredSize?: number };
function zipBytes(entries: ZipEntry[]): Uint8Array {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let off = 0;
  for (const e of entries) {
    const nameB = Buffer.from(e.name, "utf8");
    const raw = Buffer.from(e.data);
    const comp = e.deflate ? zlib.deflateRawSync(raw) : raw;
    const crc = crc32(raw);
    const size = e.declaredSize ?? raw.length;
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(e.deflate ? 8 : 0, 8);
    lh.writeUInt32LE(0, 10); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(size, 22); lh.writeUInt16LE(nameB.length, 26); lh.writeUInt16LE(0, 28);
    parts.push(lh, nameB, comp);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(e.deflate ? 8 : 0, 10);
    ch.writeUInt32LE(0, 12); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(size, 24); ch.writeUInt16LE(nameB.length, 28);
    ch.writeUInt16LE(0, 30); ch.writeUInt16LE(0, 32); ch.writeUInt16LE(0, 34); ch.writeUInt16LE(0, 36); ch.writeUInt32LE(0, 38); ch.writeUInt32LE(off, 42);
    central.push(ch, nameB);
    off += lh.length + nameB.length + comp.length;
  }
  const cd = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10); eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(off, 16);
  return new Uint8Array(Buffer.concat([...parts, cd, eocd]));
}
/** ตัวคลาย zip ของข้อสอบเอง (positive control ของตัวเขียน) */
function unzipSelf(b: Uint8Array): Record<string, Buffer> {
  const buf = Buffer.from(b);
  const eo = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const n = buf.readUInt16LE(eo + 10), cdOff = buf.readUInt32LE(eo + 16);
  const out: Record<string, Buffer> = {};
  let p = cdOff;
  for (let i = 0; i < n; i++) {
    const method = buf.readUInt16LE(p + 10), crc = buf.readUInt32LE(p + 16), csize = buf.readUInt32LE(p + 20), nl = buf.readUInt16LE(p + 28), el = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), lo = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nl).toString("utf8");
    const lnl = buf.readUInt16LE(lo + 26), lel = buf.readUInt16LE(lo + 28);
    const comp = buf.subarray(lo + 30 + lnl + lel, lo + 30 + lnl + lel + csize);
    const data = method === 8 ? zlib.inflateRawSync(comp) : Buffer.from(comp);
    if (crc32(data) !== crc) throw new Error(`crc ไม่ตรง ${name}`);
    out[name] = data;
    p += 46 + nl + el + cl;
  }
  return out;
}
const xmlEsc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const colRef = (i: number) => { let s = ""; let n = i + 1; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };
type XCell = string | { n: number } | { f: string; v: string } | { inline: string };
/** XLSX: ชีตละ { name, rows (แถวแรก = หัว) } · ข้อความ → sharedStrings (หรือ inline เมื่อ opts.inline) · เลขล้วน (ไม่มีศูนย์นำ) → ตัวเลข */
function xlsxBytes(sheets: { name: string; rows: XCell[][] }[], opts: { deflate?: boolean; inline?: boolean; numeric?: boolean } = {}): Uint8Array {
  const sst: string[] = [];
  const sIdx = (s: string) => { let i = sst.indexOf(s); if (i < 0) { sst.push(s); i = sst.length - 1; } return i; };
  const cellXml = (c: XCell, ref: string) => {
    if (typeof c === "object" && "n" in c) return `<c r="${ref}"><v>${c.n}</v></c>`;
    if (typeof c === "object" && "f" in c) return `<c r="${ref}" t="str"><f>${xmlEsc(c.f)}</f><v>${xmlEsc(c.v)}</v></c>`;
    if (typeof c === "object" && "inline" in c) return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(c.inline)}</t></is></c>`;
    if (c === "") return "";
    if (opts.numeric !== false && /^(0|[1-9]\d*)(\.\d+)?$/.test(c)) return `<c r="${ref}"><v>${Number(c)}</v></c>`;
    if (opts.inline) return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(c)}</t></is></c>`;
    return `<c r="${ref}" t="s"><v>${sIdx(c)}</v></c>`;
  };
  const sheetXml = (rows: XCell[][]) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows
    .map((r, ri) => `<row r="${ri + 1}">${r.map((c, ci) => cellXml(c, `${colRef(ci)}${ri + 1}`)).join("")}</row>`).join("")}</sheetData></worksheet>`;
  const sheetsXml = sheets.map((s) => sheetXml(s.rows));
  const entries: ZipEntry[] = [
    { name: "[Content_Types].xml", data: enc(`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>`) },
    { name: "_rels/.rels", data: enc(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`) },
    { name: "xl/workbook.xml", data: enc(`<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${xmlEsc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`) },
    { name: "xl/_rels/workbook.xml.rels", data: enc(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>`) },
    ...sheetsXml.map((x, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: enc(x), deflate: !!opts.deflate })),
  ];
  entries.push({ name: "xl/sharedStrings.xml", data: enc(`<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${sst.length}" uniqueCount="${sst.length}">${sst.map((s) => `<si><t xml:space="preserve">${xmlEsc(s)}</t></si>`).join("")}</sst>`), deflate: !!opts.deflate });
  return zipBytes(entries);
}

// ═══════════════ ล้างข้อมูล: ทุกตารางที่มี "tenantId" + ผู้ใช้ทดสอบ ═══════════════
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
  const soft = async (f: () => Promise<unknown>) => { try { await f(); } catch { /* ตารางอาจไม่มีคอลัมน์ */ } };
  await soft(() => prisma.accountJournalEntry.updateMany({ where: { tenantId: { in: tids } }, data: { reversalOfId: null } }));
  await soft(() => prisma.accountDocumentPayment.updateMany({ where: { tenantId: { in: tids } }, data: { chequeId: null, whtCertDocId: null } }));
  await soft(() => prisma.accountDocument.updateMany({ where: { tenantId: { in: tids } }, data: { sourceDocId: null, replacedById: null, sourcePaymentId: null } }));
  await soft(() => prisma.accountLedger.updateMany({ where: { tenantId: { in: tids } }, data: { parentId: null } }));
  const tables = await tablesWithTenant();
  let pending = [...tables];
  for (let pass = 0; pass < 12 && pending.length; pass++) {
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
  const out: { table: string; n: number }[] = [];
  if (tids.length) {
    for (const t of await tablesWithTenant()) {
      const r: { n: bigint }[] = await prisma.$queryRawUnsafe(`SELECT count(*)::bigint AS n FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, tids);
      const n = Number(r[0]?.n ?? 0);
      if (n) out.push({ table: t, n });
    }
    const tn = await prisma.tenant.count({ where: { id: { in: tids } } });
    if (tn) out.push({ table: "Tenant", n: tn });
  }
  const un = await prisma.user.count({ where: { email: { startsWith: "svc-d4-" } } });
  if (un) out.push({ table: "User(svc-d4-*)", n: un });
  return out;
}

// ═══════════════ ยิงพร้อมกัน: 4 โพรเซส × 3 · ในโพรเซสเดียว ═══════════════
async function fanout(op: string, ctx: unknown, inputs: any[], opts: { procs?: number; at?: number } = {}): Promise<any[]> {
  const procs = opts.procs ?? 4;
  const per = Math.ceil(inputs.length / procs);
  const at = opts.at ?? Date.now() + 14_000;
  const jobs = Array.from({ length: procs }, (_, p) => ({ op, ctx, inputs: inputs.slice(p * per, p * per + per), at })).filter((j) => j.inputs.length);
  const outs = await Promise.all(jobs.map((job) => new Promise<any[]>((resolve) => {
    const child = spawn(process.execPath, [...process.execArgv, SELF, "--child", Buffer.from(JSON.stringify(job)).toString("base64url")], { cwd: ROOT, env: process.env });
    let buf = "";
    child.stdout.on("data", (d) => { buf += String(d); });
    child.stderr.on("data", (d) => { buf += String(d); });
    child.on("close", (code) => {
      const m = /CHILD_RESULT (\[.*\])/.exec(buf);
      try { resolve(m ? (JSON.parse(m[1]) as any[]) : job.inputs.map(() => ({ childFail: `exit=${code} ${buf.split("\n").slice(-3).join(" | ").slice(0, 200)}` }))); }
      catch { resolve(job.inputs.map(() => ({ childFail: "อ่านผลลูกไม่ได้" }))); }
    });
  })));
  return outs.flat();
}
const inProc = async (calls: (() => Promise<any>)[]) => {
  const t0 = Date.now();
  const rs = await Promise.all(calls.map(async (c) => { try { return await c(); } catch (e) { return { threw: errMsg(e) }; } }));
  return { rs, ms: Date.now() - t0 };
};
const badOf = (rs: any[]) => rs.filter((r) => r?.threw || r?.childFail || (r?.ok === false && ["UNAVAILABLE", "RETRY_SAFE", "ERROR"].includes(String(r?.code))) || /P2028|P2024|P2002|timed out|Unable to start a transaction|deadlock/i.test(J(r)));
const tally = (rs: any[]) => { const m: Record<string, number> = {}; for (const r of rs) { const k = r?.ok === true ? (r.duplicate ? "OK_DUP" : "OK") : codeOf(r); m[k] = (m[k] ?? 0) + 1; } return J(m); };

// ═══════════════ ตัวเลขของไฟล์ตัวอย่าง (เฉลยอิสระจาก sqcImportSample) ═══════════════
const EXPECTED_MAP: Record<string, string> = { "0": "room", "1": "tenantName", "2": "phone", "3": "startDate", "4": "rent", "5": "deposit", "6": "elecReading", "7": "waterReading", "8": "arrears", "9": "IGNORE", "10": "note" };
const tenantIds: string[] = [];
try {
  const stale = await prisma.tenant.findMany({ where: { slug: { startsWith: "qc-svc-d4-" } }, select: { id: true } });
  if (stale.length) { console.log(`  (กวาด tenant ค้างจากรอบก่อน ${stale.length})`); await cleanup(stale.map((t: { id: string }) => t.id)); }
  await prisma.user.deleteMany({ where: { email: { startsWith: "svc-d4-" } } });

  // ═══════════════ S. โครงสร้าง ═══════════════
  console.log("\n── S โครงสร้าง ──");
  const F = {
    parse: "src/lib/modules/dorm/import-parse.ts",
    svc: "src/lib/modules/dorm/import.ts",
    ai: "src/lib/modules/dorm/import-ai.ts",
    index: DORM_IDX,
    screen: SCREEN_FILE,
    shared: "src/components/dorm/import-shared.ts",
    page: "src/app/app/u/[unitSlug]/dorm/tenants/import/page.tsx",
    actions: "src/app/app/u/[unitSlug]/dorm/tenants/import/actions.ts",
    route: "src/app/app/u/[unitSlug]/dorm/tenants/import/template/route.ts",
    scene: "scripts/svc-qc-import-scene.mts",
  };
  {
    const miss = Object.values(F).filter((p) => !existsSync(join(ROOT, p)));
    chk("S-1", "มีไฟล์ของใบครบ (import-parse.ts · import.ts · import-ai.ts · ImportScreen.tsx · import-shared.ts · หน้า/actions/route แม่แบบ · ฉาก svc-qc-import-scene.mts)", !miss.length, `ขาด ${miss.join(", ")}`, "CRITICAL");
  }
  const API = ["uploadImport", "guessColumns", "previewImport", "createImport", "undoImport", "getImport", "listImports", "importIssuesCsv",
    "parseImportFile", "neutralizeCell", "parseThaiDate", "parseMoneySatang", "headerGuess", "importTemplateCsv"];
  {
    const miss = API.filter((n) => !fn(n));
    const fields = Array.isArray(dorm?.IMPORT_FIELDS) ? dorm.IMPORT_FIELDS : null;
    const keys = (fields ?? []).map((f: any) => f?.key);
    const want = ["room", "building", "floor", "roomType", "tenantName", "phone", "idCard", "startDate", "months", "rent", "deposit", "advanceRent", "elecReading", "waterReading", "arrears", "note"];
    const kMiss = want.filter((k) => !keys.includes(k));
    chk("S-2", "facade @/lib/modules/dorm export ครบ 14 ฟังก์ชัน + IMPORT_FIELDS 16 ฟิลด์ (§3 §4)", !miss.length && !!fields && !kMiss.length, dorm ? `ขาด ${miss.join(", ") || "—"} · IMPORT_FIELDS ขาด ${fields ? kMiss.join(",") || "—" : "ทั้งหมด"}` : dormWhy, "CRITICAL");
  }
  const importsOf = (src: string) => [...src.matchAll(/^\s*import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/gm)].map((m) => ({ typeOnly: !!m[1], spec: m[2] }))
    .concat([...src.matchAll(/^\s*import\s+["']([^"']+)["']/gm)].map((m) => ({ typeOnly: false, spec: m[1] })))
    .concat([...src.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)].map((m) => ({ typeOnly: false, spec: m[1] })));
  {
    const p = read(F.parse);
    const bad = importsOf(p).filter((i) => !i.typeOnly && !["node:zlib", "node:crypto"].includes(i.spec)).map((i) => i.spec);
    const io = /\bprisma\b|tenantDb\(|process\.env|fetch\(|readFileSync|writeFileSync/.test(stripComments(p));
    chk("S-3", "import-parse.ts pure: import ได้แค่ node:zlib/node:crypto + import type · ไม่แตะ prisma/env/fetch/ไฟล์", !!p && !bad.length && !io, p ? `import=${bad.join(",") || "—"} io=${io}` : "ยังไม่มีไฟล์", "MAJOR");
  }
  const scrSrc = read(F.screen);
  {
    const useClient = /^(?:\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/))*\s*["']use client["']/.test(scrSrc);
    const BAD = (s: string) => /^@prisma\//.test(s) || /^@\/lib\/core\/(db|tenant-db|outbox|settings|context)/.test(s) || /^@\/lib\/modules\//.test(s) || /^@\/lib\/(platform|automation|webhooks|storage|ai)\//.test(s) || /actions$/.test(s) || /^next\/(navigation|headers)$/.test(s);
    const bad = importsOf(scrSrc).filter((i) => !i.typeOnly && BAD(i.spec)).map((i) => i.spec);
    chk("S-4", "ImportScreen.tsx: 'use client' บรรทัดแรก · ไม่ import prisma/โมดูล server/actions/next navigation|headers (ได้เฉพาะ import type + import-shared) — action รับทาง prop",
      !!scrSrc && useClient && !bad.length && !/\bprisma\b|tenantDb\(/.test(stripComments(scrSrc)), scrSrc ? `use client=${useClient} import ต้องห้าม=${bad.join(",") || "—"}` : "ยังไม่มีไฟล์", "CRITICAL");
  }
  {
    const p = read(F.page);
    const ok = !!p && !/^\s*["']use client["']/.test(p) && /requireUnit\s*\(/.test(p) && /["']DORM["']/.test(p) && /notFound\s*\(/.test(p) && /dorm\.import/.test(p)
      && /from\s+["']@\/lib\/modules\/dorm["']/.test(p) && !/["']@\/lib\/modules\/dorm\//.test(p) && !/@\/lib\/core\/db|@prisma\//.test(p) && /ImportScreen/.test(p) && /getImport\s*\(/.test(p);
    chk("S-5", "หน้า /dorm/tenants/import: server · requireUnit + DORM · ไม่มี dorm.import ⇒ notFound · getImport ผ่าน facade · ส่งเข้า ImportScreen · ไม่แตะ prisma", ok, p ? "ขาดด่าน/facade/คอมโพเนนต์ (ดู §8.1)" : "ยังไม่มีไฟล์", "CRITICAL");
  }
  {
    const a = read(F.actions);
    const code = stripComments(a);
    const firstUseServer = /^\s*["']use server["']/.test(code);
    const exportsAll = [...code.matchAll(/^\s*export\s+(?!async\s+function)(\S+)/gm)].map((m) => m[1]);
    const names = ["uploadImportAction", "guessColumnsAction", "previewImportAction", "createImportAction", "undoImportAction"].filter((n) => !new RegExp(`export\\s+async\\s+function\\s+${n}\\b`).test(code));
    const gate = /requireUnit\s*\(/.test(code) && /dorm\.import/.test(code);
    const trustInput = /input\??\.tenantId|tenantId\s*:\s*input\./.test(code);
    chk("S-6", "actions.ts: 'use server' · export async function เท่านั้น (5 ชื่อ) · ด่าน requireUnit + dorm.import · ร้าน/ผู้กระทำจาก session",
      !!a && firstUseServer && !exportsAll.length && !names.length && gate && !trustInput, a ? `use server=${firstUseServer} export อื่น=${exportsAll.join(",") || "—"} ขาด=${names.join(",") || "—"} ด่าน=${gate} tenantId จาก input=${trustInput}` : "ยังไม่มีไฟล์", "CRITICAL");
  }
  {
    const r = read(F.route);
    const ok = !!r && /export\s+async\s+function\s+GET\b/.test(r) && /requireUnit\s*\(/.test(r) && /dorm\.import/.test(r) && /importTemplateCsv\s*\(/.test(r) && /text\/csv/.test(r) && /attachment/.test(r);
    chk("S-7", "route แม่แบบ: GET · ด่านเดียวกับหน้า (requireUnit + dorm.import) · text/csv · attachment · importTemplateCsv()", ok, r ? "ขาดด่าน/ส่วนหัว (ดู §8.3)" : "ยังไม่มีไฟล์", "MAJOR");
  }
  chk("S-8", "account facade (additive RULING-2): reverseSecurityDepositReceiptInTx + reverseSecurityDepositReceipt (กลับรายการรับเงินประกัน · ไม่ลบ)",
    typeof ACC?.reverseSecurityDepositReceiptInTx === "function" && typeof ACC?.reverseSecurityDepositReceipt === "function", `InTx=${typeof ACC?.reverseSecurityDepositReceiptInTx} tx=${typeof ACC?.reverseSecurityDepositReceipt}`, "CRITICAL");
  {
    let why = "";
    try {
      const pm = (await import("@/lib/core/permissions" as string)) as any;
      if (!pm.isPermissionKey?.("dorm.import")) why += "dorm.import ไม่อยู่ในทะเบียน · ";
      const src = read("src/lib/core/permissions.ts");
      const planned = /planned:\s*\[([^\]]*)\]/g;
      let m: RegExpExecArray | null;
      while ((m = planned.exec(src))) if (/["']dorm\.import["']/.test(m[1])) why += "dorm.import ยังอยู่ใน planned";
    } catch (e) { why = errMsg(e); }
    chk("S-9", "สิทธิ์ dorm.import ใช้จริง: อยู่ในทะเบียน · เอาออกจาก planned ของโมดูล dorm", !why, why, "MAJOR");
  }
  {
    let why = "";
    try {
      const reg = (await import("@/lib/core/settings/registry" as string)) as any;
      const want: [string, unknown, unknown[]][] = [["rooms.import.maxRows", 1000, [6000, 5]], ["rooms.import.maxFileBytes", 2_000_000, [20_000_000, 5000]], ["rooms.import.undoDays", 0, [8, -1]]];
      for (const [k, dflt, bads] of want) {
        const d = reg.getDef?.(k);
        if (!d) { why += `${k} ไม่มี · `; continue; }
        if (d.defaults?._fallback !== dflt) why += `${k} ค่าเริ่ม ${J(d.defaults?._fallback)} ≠ ${dflt} · `;
        for (const b of bads) if (d.schema?.safeParse?.(b)?.success) why += `${k} รับ ${b} · `;
        if (!Array.isArray(d.chain) || !d.chain.includes("UNIT")) why += `${k} chain ไม่มี UNIT · `;
      }
      if (reg.getDef?.("rooms.import.undoDays") && !reg.getDef("rooms.import.undoDays").ownerOnly) why += "undoDays ไม่ ownerOnly";
    } catch (e) { why = errMsg(e); }
    chk("S-10", "ค่าตั้ง X6 ในทะเบียน (§2.3): maxRows 1000 (10–5000) · maxFileBytes 2,000,000 (10k–10M) · undoDays 0 (0–7 · ownerOnly) · chain UNIT", !why, why, "CRITICAL");
  }
  {
    const svc = stripComments(read(F.svc));
    const money = /createExternalInvoice|recordExternalPayment|postSecurityDeposit\b|postSecurityDepositInTx|settleSecurityDeposit|dormPostSecurityDeposit/.exec(svc);
    const raw = /import\s*\{[^}]*\bprisma\b[^}]*\}\s*from\s*["']@\/lib\/core\/db["']|\$queryRawUnsafe|\$executeRawUnsafe/.test(svc);
    const legal = LEGAL_BAD.exec([F.svc, F.screen, F.shared, F.page, F.actions, F.parse].map(read).join("\n"));
    chk("S-11", "ไม่มีเส้นเงินแยก: import.ts ไม่เรียก createExternalInvoice/recordExternalPayment/postSecurityDeposit* ตรง (เงินผ่าน moveIn ของ D.5) · ไม่ import prisma ดิบ/raw unsafe · ไม่มีคำต้องห้าม สคบ.",
      !!svc && !money && !raw && !legal, svc ? `เงินตรง=${money?.[0] ?? "—"} prisma/raw=${raw} คำต้องห้าม=${legal?.[0] ?? "—"}` : "ยังไม่มี import.ts", "CRITICAL");
  }
  {
    const svc = stripComments(read(F.svc));
    const pa = /Promise\.all\s*\(/.test(svc);
    const dl = /40P01/.test(svc) && /BUSY/.test(svc);
    chk("S-12", "import.ts: ไม่ใช้ Promise.all (เงิน/สัญญาทีละรายการ · หนี้ D.2 N2) · จัดการ 40P01 (ลองใหม่ 1 ครั้ง ⇒ BUSY)", !!svc && !pa && dl, svc ? `Promise.all=${pa} 40P01+BUSY=${dl}` : "ยังไม่มีไฟล์", "MINOR");
  }

  // ═══════════════ fixtures ═══════════════
  console.log("\n── fixtures: ร้าน A/B · หน่วยหอ · สมุดบัญชี · ผู้ใช้ ──");
  const stamp = `${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;
  const tA = await prisma.tenant.create({ data: { name: "QC D4 A", slug: `qc-svc-d4-a-${stamp}` } }); tenantIds.push(tA.id);
  const tB = await prisma.tenant.create({ data: { name: "QC D4 B", slug: `qc-svc-d4-b-${stamp}` } }); tenantIds.push(tB.id);
  const A = tA.id as string, B = tB.id as string;
  const mkUnit = async (tenantId: string, type: string, tag: string) => (await prisma.businessUnit.create({ data: { tenantId, type, name: `หอ D4 ${tag}`, slug: `d4${tag}-${stamp}` } })).id as string;
  const U: Record<string, string> = {};
  const DORM_A = ["DK", "DS", "DW", "DO", "DQ", "DC", "DN", "DR", "DR2", "DX", "DB2", "DE", "DT", "DPC", "DL"];
  for (const k of DORM_A) U[k] = await mkUnit(A, "DORM", k.toLowerCase());
  U.HA = await mkUnit(A, "HOTEL", "ha");
  U.DB = await mkUnit(B, "DORM", "db");
  const setU = async (tenantId: string, scope: string, scopeId: string, key: string, value: unknown) => {
    await prisma.settingValue.deleteMany({ where: { tenantId, key, scope, scopeId } });
    await prisma.settingValue.create({ data: { tenantId, key, scope, scopeId, value, setById: "qc-d4" } });
  };
  const unsetU = (tenantId: string, scope: string, scopeId: string, key: string) => prisma.settingValue.deleteMany({ where: { tenantId, key, scope, scopeId } });
  const REASON_OOS = "หน่วยนี้ให้เช่าเพียงสองห้องจึงอยู่นอกขอบเขตประกาศ สคบ.";
  for (const k of ["DW", "DL"]) await setU(A, "UNIT", U[k], "rooms.legal.mode", "WARN");
  await setU(A, "UNIT", U.DO, "rooms.legal.mode", "OUT_OF_SCOPE");
  await setU(A, "UNIT", U.DO, "rooms.legal.outOfScopeReason", REASON_OOS);
  await setU(A, "UNIT", U.DQ, "rooms.legal.mode", "OUT_OF_SCOPE");
  const mkBook = async (tenantId: string, name: string) => {
    const s = await SYS.createSystem(tenantId, "ACCOUNT", name);
    await ASV.saveSettings(tenantId, s.id, { orgName: name, vatRegistered: false });
    await GL.ensureAccounting({ tenantId, systemId: s.id });
    return s.id as string;
  };
  const BOOK_A = await mkBook(A, `บัญชีหอ D4 A ${stamp}`);
  const BOOK_B = await mkBook(B, `บัญชีหอ D4 B ${stamp}`);
  for (const k of DORM_A) if (k !== "DN") await prisma.accountSystemLink.create({ data: { tenantId: A, systemId: BOOK_A, linkedKind: "BUSINESS", linkedId: U[k], enabled: true } });
  await prisma.accountSystemLink.create({ data: { tenantId: B, systemId: BOOK_B, linkedKind: "BUSINESS", linkedId: U.DB, enabled: true } });
  type QU = { id: string };
  const mkUser = async (key: string, tenantId: string, role: "OWNER" | "MANAGER" | "STAFF", unitAccess: string[], perms: string[] = [], accepted = true): Promise<QU> => {
    const u = await prisma.user.create({ data: { email: `svc-d4-${stamp}-${key}@shark.local`, name: `QC D4 ${key}` } });
    await prisma.membership.create({ data: { userId: u.id, tenantId, role, unitAccess, permissions: Object.fromEntries(perms.map((p) => [p, true])), acceptedAt: accepted ? new Date() : null } });
    return { id: u.id as string };
  };
  const ALL_A = Object.entries(U).filter(([k]) => k !== "DB").map(([, v]) => v);
  const OWN = await mkUser("owner", A, "OWNER", ["*"]);
  const MGR = await mkUser("manager", A, "MANAGER", ALL_A);
  const STV = await mkUser("staff-view", A, "STAFF", [U.DE], ["dorm.view", "dorm.lease.manage"]);
  const STI = await mkUser("staff-import", A, "STAFF", [U.DE], ["dorm.import"]);
  const STO = await mkUser("staff-import-other", A, "STAFF", [U.DS], ["dorm.import", "dorm.lease.manage"]);
  const PEND = await mkUser("pending", A, "OWNER", ["*"], [], false);
  const OWNB = await mkUser("owner-b", B, "OWNER", ["*"]);
  const cO = { tenantId: A, actorUserId: OWN.id }, cM = { tenantId: A, actorUserId: MGR.id }, cB = { tenantId: B, actorUserId: OWNB.id };

  // ── ไฟล์ตัวอย่าง ──
  const CLEAN = SV.sqcImportSample(TODAY, { variant: "clean" });
  const SCENE = SV.sqcImportSample(TODAY, { variant: "scene" });
  const READ_P = String(CLEAN.readDate).slice(0, 7);
  const OPTS = { dateFormat: "BE_DMY", meterReadDate: CLEAN.readDate, depositChannel: "TRANSFER" };
  const rowNoOf = (room: string) => (CLEAN.rows as string[][]).findIndex((r) => r[0] === room) + 2;
  const withPrefix = (pre: string, variant: "clean" | "scene" = "clean") => SV.sqcImportSample(TODAY, { variant, phonePrefix: pre });
  const subset = (s: any, rooms: string[]) => (s.rows as string[][]).filter((r) => rooms.includes(r[0]));

  // ── ตัวเรียก facade ──
  const up = (ctx: unknown, unitId: string, data: Uint8Array, fileName = "ทะเบียนหอ.csv", sheet?: string): Promise<any> => fn("uploadImport")!(ctx, { unitId, fileName, contentType: fileName.endsWith(".xlsx") ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/csv", data, ...(sheet ? { sheet } : {}) }, { put: putNoop });
  const pv = (ctx: unknown, unitId: string, batchId: string, o: Record<string, unknown> = {}): Promise<any> => fn("previewImport")!(ctx, { unitId, batchId, ...o });
  const pvMap = (ctx: unknown, unitId: string, batchId: string, o: Record<string, unknown> = {}) => pv(ctx, unitId, batchId, { mapping: EXPECTED_MAP, options: OPTS, ...o });
  const cr = (ctx: unknown, unitId: string, batchId: string, previewHash: string, legalAck?: { reason: string } | null): Promise<any> => fn("createImport")!(ctx, { unitId, batchId, previewHash, ...(legalAck ? { legalAck } : {}) });
  const ud = (ctx: unknown, unitId: string, batchId: string, reason = "นำเข้าไฟล์ผิดรอบ ขอย้อนกลับ", now?: Date): Promise<any> => fn("undoImport")!(ctx, { unitId, batchId, reason }, now ? { now } : undefined);
  /** อัปโหลด → พรีวิว (ยืนยันแมป) → สร้าง · คืนทุกขั้น */
  const importAll = async (ctx: unknown, unitId: string, data: Uint8Array, o: Record<string, unknown> = {}, legalAck?: { reason: string }) => {
    const u = await up(ctx, unitId, data, (o.fileName as string) ?? "ทะเบียนหอ.csv");
    if (!u?.ok) return { u, p: null as any, c: null as any };
    const p = await pvMap(ctx, unitId, u.batchId, o.decisions ? { decisions: o.decisions } : {});
    if (!p?.ok) return { u, p, c: null as any };
    const c = await cr(ctx, unitId, u.batchId, p.previewHash, legalAck);
    return { u, p, c };
  };
  const counts = async (tenantId: string, unitId: string) => ({
    rooms: await prisma.hotelRoom.count({ where: { tenantId, unitId, active: true } }),
    roomsAll: await prisma.hotelRoom.count({ where: { tenantId, unitId } }),
    leasesLive: await prisma.dormLease.count({ where: { tenantId, unitId, status: { in: ["DRAFT", "ACTIVE", "NOTICE"] } } }),
    leasesAll: await prisma.dormLease.count({ where: { tenantId, unitId } }),
    meters: await prisma.dormMeter.count({ where: { tenantId, unitId, removedAt: null } }),
    readings: await prisma.dormMeterReading.count({ where: { tenantId, unitId } }),
    jv: await prisma.accountJournalEntry.count({ where: { tenantId, refType: "DormSecurityDeposit", refId: { startsWith: `${unitId}:` } } }),
    parties: await prisma.party.count({ where: { tenantId } }),
    docs: await prisma.accountDocument.count({ where: { tenantId } }),
  });
  const bizCounts = async (tenantId: string) => ({
    rooms: await prisma.hotelRoom.count({ where: { tenantId } }), leases: await prisma.dormLease.count({ where: { tenantId } }), parties: await prisma.party.count({ where: { tenantId } }),
    meters: await prisma.dormMeter.count({ where: { tenantId } }), readings: await prisma.dormMeterReading.count({ where: { tenantId } }),
    jv: await prisma.accountJournalEntry.count({ where: { tenantId } }), occ: await prisma.roomOccupancy.count({ where: { tenantId } }),
    outbox: await prisma.outboxEvent.count({ where: { tenantId } }), buildings: await prisma.roomBuilding.count({ where: { tenantId } }), types: await prisma.hotelRoomType.count({ where: { tenantId } }),
  });
  const depJVs = async (tenantId: string, unitId: string, leaseId: string) => ((await prisma.accountJournalEntry.findMany({
    where: { tenantId, refType: "DormSecurityDeposit", refId: `${unitId}:${leaseId}` }, orderBy: { createdAt: "asc" },
    include: { lines: { include: { account: { select: { code: true, type: true } } } } },
  })) as any[]);
  const liabNet = (es: any[]) => es.reduce((s, e) => s + e.lines.filter((l: any) => l.account.type === "LIABILITY").reduce((a: number, l: any) => a + l.credit - l.debit, 0), 0);
  const incomeTouched = (es: any[]) => es.some((e) => e.lines.some((l: any) => /INCOME|REVENUE/.test(String(l.account.type)) && (l.debit || l.credit)));
  const balanced = (es: any[]) => es.every((e) => e.lines.reduce((a: number, l: any) => a + l.debit - l.credit, 0) === 0);
  const held = (unitId: string, leaseId: string, tenantId = A): Promise<number> => ACC.securityDepositHeld({ tenantId, unitId, leaseId });
  const batchLeases = async (tenantId: string, unitId: string, batchId: string) => ((await prisma.dormLease.findMany({ where: { tenantId, unitId }, include: { room: { select: { number: true } } } })) as any[])
    .filter((l) => (l.policySnapshot as any)?.import?.batchId === batchId);
  const issuesOf = (p: any, room: string) => ((p?.issues ?? []) as any[]).filter((i) => i.room === room);
  const sevOf = (p: any, room: string, code: string) => issuesOf(p, room).find((i) => i.code === code)?.severity ?? null;

  // ═══════════════ PC. positive control ═══════════════
  console.log("\n── PC positive control (ต้องเขียวก่อนมีงาน) ──");
  await (async () => {
    const name = "เส้นเงิน D.5 บนหน่วย DPC: createLease → รูป 6 → ลงชื่อ → moveIn ⇒ ACTIVE · ยอดถือ ฿9,000 · JV รับ 1 คีย์ลงท้าย #RECEIVE:dorm.lease:<id>:deposit · หนี้สินสุทธิ = ประกัน (รูปแบบที่ K-6 ใช้)";
    try {
      const rt = (await prisma.hotelRoomType.create({ data: { tenantId: A, unitId: U.DPC, name: "มาตรฐาน", capacity: 2, baseRateSatang: 0, depositSatang: 0, rentMode: "MONTHLY", monthlyRateSatang: 450000 } })).id;
      const room = (await prisma.hotelRoom.create({ data: { tenantId: A, unitId: U.DPC, roomTypeId: rt, number: "P01", floorNo: 1, floor: "1" } })).id;
      const c = await fn("createLease")!(cO, { unitId: U.DPC, roomId: room, startDate: addDays(TODAY, -30), months: 12, tenant: { name: "ผู้เช่า PC D4", phone: `09${String(Date.now()).slice(-8)}` }, rentSatang: 450000, depositSatang: 900000, advanceRentSatang: 0, bookingFeeSatang: 0 });
      const lid = c?.leaseId as string;
      const a = await fn("addLeaseFiles")!(cO, { unitId: U.DPC, leaseId: lid, kind: "ROOM_PHOTO", files: Array.from({ length: 6 }, () => ({ data: JPEG, contentType: "image/jpeg" })) }, { put: putNoop });
      const s = await fn("signLease")!(cO, { unitId: U.DPC, leaseId: lid, file: { data: PNG, contentType: "image/png" } }, { put: putNoop });
      const m = await fn("moveIn")!(cO, { unitId: U.DPC, leaseId: lid, paidAt: new Date(), channel: "TRANSFER" });
      const es = await depJVs(A, U.DPC, lid);
      const h = await held(U.DPC, lid);
      chk("PC-1", name, c?.ok && a?.ok && s?.ok && m?.ok && h === 900000 && es.length === 1 && String(es[0].idempotencyKey ?? "").endsWith(`#RECEIVE:dorm.lease:${lid}:deposit`) && liabNet(es) === 900000 && !incomeTouched(es),
        `${codeOf(c)}/${codeOf(a)}/${codeOf(s)}/${codeOf(m)} held=${h} jv=${es.length} key=${es[0]?.idempotencyKey} net=${liabNet(es)}`, "CRITICAL");
    } catch (e) { fail("PC-1", name, `throw: ${errMsg(e)}`, "CRITICAL"); }
  })();
  await (async () => {
    const name = "มิเตอร์ D.6 บนหน่วย DPC: createMeter(startReading 1287) + submitReadings งวดเดือนอ่าน ⇒ แถว PERIOD 1 (รูปแบบที่ K-7 ใช้)";
    try {
      const room = (await prisma.hotelRoom.findFirst({ where: { tenantId: A, unitId: U.DPC } })).id;
      const m = await fn("createMeter")!(cO, { unitId: U.DPC, kind: "ELEC", roomId: room, startReading: 1287 });
      const s = await fn("submitReadings")!(cO, { unitId: U.DPC, periodKey: READ_P, items: [{ meterId: m?.meterId, value: 1287 }] });
      const n = await prisma.dormMeterReading.count({ where: { tenantId: A, unitId: U.DPC, kind: "PERIOD", periodKey: READ_P, value: 1287 } });
      chk("PC-2", name, m?.ok && s?.ok && n === 1, `${codeOf(m)}/${codeOf(s)} rows=${n}`, "CRITICAL");
    } catch (e) { fail("PC-2", name, `throw: ${errMsg(e)}`, "CRITICAL"); }
  })();
  await (async () => {
    const name = "evaluateLegal DEPOSIT_ADVANCE_LIMIT ห้อง 310 (ค่าเช่า ฿4,500 · ประกัน ฿15,000 = 3.3 เดือน · สัญญาสั้น): STRICT ⇒ BLOCK · WARN ⇒ WARN · นอกขอบเขต+เหตุผล ⇒ OK · นอกขอบเขตไม่มีเหตุผล ⇒ BLOCK";
    try {
      const inp = { leaseKind: "SHORT", monthlyRentSatang: 450000, depositSatang: 1500000, advanceRentSatang: 0 };
      const s = LEGAL.evaluateLegal("DEPOSIT_ADVANCE_LIMIT", inp, { mode: "STRICT" });
      const w = LEGAL.evaluateLegal("DEPOSIT_ADVANCE_LIMIT", inp, { mode: "WARN" });
      const o = LEGAL.evaluateLegal("DEPOSIT_ADVANCE_LIMIT", inp, { mode: "OUT_OF_SCOPE", outOfScopeReason: REASON_OOS });
      const q = LEGAL.evaluateLegal("DEPOSIT_ADVANCE_LIMIT", inp, { mode: "OUT_OF_SCOPE" });
      const okv = LEGAL.evaluateLegal("DEPOSIT_ADVANCE_LIMIT", { ...inp, depositSatang: 900000 }, { mode: "STRICT" });
      chk("PC-3", name, s.level === "BLOCK" && w.level === "WARN" && o.level === "OK" && q.level === "BLOCK" && okv.level === "OK", `${s.level}/${w.level}/${o.level}/${q.level}:${q.code}/ok=${okv.level}`, "CRITICAL");
    } catch (e) { fail("PC-3", name, `throw: ${errMsg(e)}`, "CRITICAL"); }
  })();
  await (async () => {
    const name = "ไฟล์ตัวอย่าง (เฉลย): sqcImportSample clean = 36 แถว 11 คอลัมน์ · ตัวแยก CSV กลางอ่านกลับได้ตรง · ผลรวมประกัน 33 สัญญา = ฿305,400 · scene = ฿296,400 (ไม่รวม 310) · csvRow ทำให้ =x เป็นกลาง";
    try {
      const t = CSV.parseCsv(Buffer.from(csvBytes(CLEAN.headers, CLEAN.rows)).toString("utf8"));
      const named = (CLEAN.rows as string[][]).filter((r) => r[1] !== "");
      const dep = named.reduce((a, r) => a + Number(r[5]) * 100, 0);
      const depScene = (SCENE.rows as string[][]).filter((r) => r[1] !== "" && r[0] !== "310").reduce((a, r) => a + Number(r[5]) * 100, 0);
      const ok = t.headers.length === 11 && t.rows.length === 36 && J(t.rows[3]) === J(CLEAN.rows[3]) && named.length === 33 && dep === CLEAN.expect.depositSatang && depScene === SCENE.expect.depositSatang
        && CSV.csvRow(["=x", "a"]).startsWith("'=x") && CLEAN.expect.depositSatang === 30_540_000;
      chk("PC-4", name, ok, `h=${t.headers.length} r=${t.rows.length} named=${named.length} dep=${dep} scene=${depScene}`, "CRITICAL");
    } catch (e) { fail("PC-4", name, `throw: ${errMsg(e)}`, "CRITICAL"); }
  })();
  await (async () => {
    const name = "ตัวเขียน XLSX ของข้อสอบ: store + deflate · CRC ถูก · คลายกลับได้ · sheet1 มี 37 แถว · workbook มีชีต ผู้เช่า/มิเตอร์";
    try {
      const x1 = unzipSelf(xlsxBytes([{ name: "ผู้เช่า", rows: [CLEAN.headers, ...CLEAN.rows] }, { name: "มิเตอร์", rows: [["ห้อง"], ...CLEAN.rows.map((r: string[]) => [r[0]])] }]));
      const x2 = unzipSelf(xlsxBytes([{ name: "ผู้เช่า", rows: [CLEAN.headers, ...CLEAN.rows] }], { deflate: true }));
      const rows1 = (x1["xl/worksheets/sheet1.xml"].toString("utf8").match(/<row /g) ?? []).length;
      const ok = rows1 === 37 && /name="ผู้เช่า"/.test(x1["xl/workbook.xml"].toString("utf8")) && /name="มิเตอร์"/.test(x1["xl/workbook.xml"].toString("utf8")) && x2["xl/worksheets/sheet1.xml"].length > 1000;
      chk("PC-5", name, ok, `rows=${rows1} entries=${Object.keys(x1).length}/${Object.keys(x2).length}`, "CRITICAL");
    } catch (e) { fail("PC-5", name, `throw: ${errMsg(e)}`, "CRITICAL"); }
  })();
  await (async () => {
    const name = "รหัสอักขระ: windows-874 ที่ข้อสอบเข้ารหัส ถอดด้วย TextDecoder('windows-874') ได้ข้อความไทยเดิม · UTF-16LE มี BOM FF FE";
    try {
      const s = toCsvText(CLEAN.headers, CLEAN.rows.slice(0, 5));
      const back = new TextDecoder("windows-874").decode(cp874(s));
      const u16 = utf16(s);
      chk("PC-6", name, back === s && u16[0] === 0xff && u16[1] === 0xfe, `eq=${back === s}`, "CRITICAL");
    } catch (e) { fail("PC-6", name, `throw: ${errMsg(e)}`, "CRITICAL"); }
  })();
  const BOMB = (() => {
    const big = Buffer.alloc(40_000_000, 0x41);
    return zipBytes([
      { name: "[Content_Types].xml", data: enc("<Types/>") },
      { name: "xl/workbook.xml", data: enc(`<workbook xmlns:r="r"><sheets><sheet name="ผู้เช่า" sheetId="1" r:id="rId1"/></sheets></workbook>`) },
      { name: "xl/_rels/workbook.xml.rels", data: enc(`<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`) },
      { name: "xl/worksheets/sheet1.xml", data: new Uint8Array(big), deflate: true },
    ]);
  })();
  await (async () => {
    const name = "zip ระเบิดของข้อสอบเป็นของจริง: ไฟล์ < 200 KB · คลายแล้ว 40 MB (ข้อ C6-6 มีความหมาย)";
    try {
      const n = Object.values(unzipSelf(BOMB)).reduce((a, b) => a + b.length, 0);
      chk("PC-7", name, BOMB.length < 200_000 && n >= 40_000_000, `zip=${BOMB.length} คลาย=${n}`, "CRITICAL");
    } catch (e) { fail("PC-7", name, `throw: ${errMsg(e)}`, "CRITICAL"); }
  })();
  await (async () => {
    const name = "ตัวยิงพร้อมกัน 4 โพรเซส × 3: claimRoom ห้องว่างเดียวกัน 12 ทาง ⇒ ok 1 · ROOM_TAKEN 11 (ตัวยิงของ R-* ทำงานจริง)";
    try {
      const rt = (await prisma.hotelRoomType.findFirst({ where: { tenantId: A, unitId: U.DPC } })).id;
      const room = (await prisma.hotelRoom.create({ data: { tenantId: A, unitId: U.DPC, roomTypeId: rt, number: "P02", floorNo: 1, floor: "1" } })).id;
      const rs = await fanout("__pc_claimRoom", null, Array.from({ length: 12 }, (_, i) => ({ tenantId: A, unitId: U.DPC, roomId: room, start: "2031-05-01", end: "2032-05-01", kind: "LEASE", refType: "QcD4Pc", refId: `pc-${i}-${stamp}` })));
      const okN = rs.filter((r) => r?.ok === true).length, taken = rs.filter((r) => r?.ok === false && r?.code === "ROOM_TAKEN").length;
      chk("PC-8", name, rs.length === 12 && okN === 1 && taken === 11, `ok=${okN} taken=${taken} ${tally(rs)}`, "CRITICAL");
    } catch (e) { fail("PC-8", name, `throw: ${errMsg(e)}`, "CRITICAL"); }
  })();

  // ═══════════════ F. แยกไฟล์ · แปลงค่า (pure) ═══════════════
  console.log("\n── F แยกไฟล์ · แปลงค่า (pure) ──");
  const P_ = (data: Uint8Array, o?: Record<string, unknown>) => fn("parseImportFile")!(data, o);
  const sameAsClean = (r: any) => r?.ok === true && J(r.headers) === J(CLEAN.headers) && r.rows?.length === 36 && J(r.rows[5]) === J(CLEAN.rows[5]) && J(r.rows[35]) === J(CLEAN.rows[35]);
  await T("F-1", "CSV UTF-8 + BOM: หัว 11 · แถว 36 · ค่าดิบตรงไฟล์ · format CSV · encoding utf-8", ["parseImportFile"], async () => {
    const r = P_(csvBytes(CLEAN.headers, CLEAN.rows));
    return [sameAsClean(r) && r.format === "CSV" && r.encoding === "utf-8", `${J({ ok: r?.ok, f: r?.format, e: r?.encoding, h: r?.headers?.length, n: r?.rows?.length })}`];
  });
  await T("F-2", "CSV windows-874 (Excel ไทย 'CSV' ธรรมดา) ⇒ ข้อความไทยถูก · encoding windows-874", ["parseImportFile"], async () => {
    const r = P_(cp874(toCsvText(CLEAN.headers, CLEAN.rows)));
    return [sameAsClean(r) && r.encoding === "windows-874", `${J({ ok: r?.ok, e: r?.encoding, h0: r?.headers?.[1] })}`];
  });
  await T("F-3", "TSV UTF-16LE + BOM (Excel 'Unicode Text') ⇒ เหมือน CSV", ["parseImportFile"], async () => {
    const r = P_(utf16(toCsvText(CLEAN.headers, CLEAN.rows, "\t")));
    return [sameAsClean(r) && r.encoding === "utf-16le", `${J({ ok: r?.ok, e: r?.encoding, n: r?.rows?.length })}`];
  });
  const XLSX2 = xlsxBytes([{ name: "ผู้เช่า", rows: [CLEAN.headers, ...CLEAN.rows] }, { name: "มิเตอร์", rows: [["ห้อง", "ไฟ"], ...CLEAN.rows.map((r: string[]) => [r[0], r[6]])] }]);
  await T("F-4", "XLSX (store · sharedStrings · ตัวเลข) 2 ชีต: ค่าเริ่ม = ชีตแรก 'ผู้เช่า' ตรงไฟล์ · sheets [{ผู้เช่า,36},{มิเตอร์,36}] · sheet 'มิเตอร์' เลือกได้ · ชีตไม่มี ⇒ SHEET_NOT_FOUND", ["parseImportFile"], async () => {
    const r = P_(XLSX2);
    const m = P_(XLSX2, { sheet: "มิเตอร์" });
    const z = P_(XLSX2, { sheet: "ไม่มีชีตนี้" });
    const sh = J((r?.sheets ?? []).map((s: any) => [s.name, s.rowCount]));
    return [sameAsClean(r) && r.format === "XLSX" && sh === J([["ผู้เช่า", 36], ["มิเตอร์", 36]]) && m?.ok && m.headers?.[1] === "ไฟ" && m.rows?.length === 36 && z?.ok === false && z.code === "SHEET_NOT_FOUND",
      `main=${J({ ok: r?.ok, f: r?.format, r5: r?.rows?.[5] })} sheets=${sh} m=${J(m?.headers)} z=${codeOf(z)}`];
  });
  await T("F-5", "XLSX deflate + inlineStr + สูตร (ใช้ค่าแคช ไม่คำนวณ) + เซลล์ขาดกลางแถวเติม '' ", ["parseImportFile"], async () => {
    const rows: XCell[][] = [["ห้อง", "ชื่อผู้เช่า", "ค่าเช่า", "หมายเหตุ"], ["101", { inline: "สมชาย ใจดี" }, { f: "4000+500", v: "4500" }, "x"], ["102", "", { n: 4500 }, "ท้าย"]];
    const r = P_(xlsxBytes([{ name: "S1", rows }], { deflate: true }));
    return [r?.ok === true && J(r.rows) === J([["101", "สมชาย ใจดี", "4500", "x"], ["102", "", "4500", "ท้าย"]]), J(r?.rows ?? r)];
  });
  await T("F-6", "รูปแบบไม่รองรับ ⇒ UNSUPPORTED_FORMAT (ตัดสินจากไบต์ ไม่ใช่นามสกุล): .xls (OLE2 D0CF11E0) · PDF · zip ที่ไม่ใช่ xlsx · ไฟล์ว่าง ⇒ EMPTY_FILE", ["parseImportFile"], async () => {
    const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]);
    const pdf = enc("%PDF-1.4\n%âã\n1 0 obj\n");
    const docx = zipBytes([{ name: "word/document.xml", data: enc("<w:document/>") }]);
    const rs = [P_(ole), P_(pdf), P_(docx), P_(enc("")), P_(enc("﻿\r\n\r\n"))].map(codeOf);
    return [J(rs) === J(["UNSUPPORTED_FORMAT", "UNSUPPORTED_FORMAT", "UNSUPPORTED_FORMAT", "EMPTY_FILE", "EMPTY_FILE"]), J(rs)];
  });
  await T("F-7", "parseThaiDate: '1/5/69' · '01/05/2569' ⇒ 2026-05-01 · ISO · Excel serial 46143 ⇒ 2026-05-01 · CE_DMY · วันไม่มีจริง/ขยะ ⇒ null", ["parseThaiDate"], async () => {
    const f = fn("parseThaiDate")!;
    const got = [f("1/5/69"), f("01/05/2569"), f("2026-05-01", "ISO"), f("46143"), f("1/5/2026", "CE_DMY"), f("31/2/69"), f("abc"), f("")];
    const want = ["2026-05-01", "2026-05-01", "2026-05-01", "2026-05-01", "2026-05-01", null, null, null];
    return [J(got) === J(want), J(got)];
  });
  await T("F-8", "parseMoneySatang: '4,500' 450000 · '฿4,500.50' 450050 · '4986.40' 498640 · '4500 บาท' 450000 · สูตร/ติดลบ/ทศนิยม 3 ตำแหน่ง/ขยะ/ว่าง ⇒ null", ["parseMoneySatang"], async () => {
    const f = fn("parseMoneySatang")!;
    const got = ["4,500", "฿4,500.50", "4986.40", "4500 บาท", "=1+1", "-500", "4.505", "abc", ""].map((v) => f(v));
    return [J(got) === J([450000, 450050, 498640, 450000, null, null, null, null, null]), J(got)];
  });
  await T("F-9", "headerGuess หัวคอลัมน์ภาพ 12 (ห้อง · ชื่อผู้เช่า · โทร · เข้าอยู่ · ค่าเช่า · ประกัน · ไฟ <เดือน> · น้ำ <เดือน> · ค้าง · LINE · หมายเหตุ) ⇒ แมปตามเฉลย (LINE = IGNORE)", ["headerGuess"], async () => {
    const m = fn("headerGuess")!(CLEAN.headers);
    return [J(Object.keys(EXPECTED_MAP).map((k) => m?.[k])) === J(Object.values(EXPECTED_MAP)), J(m)];
  });
  await T("F-10", "importTemplateCsv: BOM + หัว 11 คอลัมน์ (ตัวแยกกลางอ่านได้ · headerGuess ได้ room) · ไม่มีช่องขึ้นต้นด้วยสูตร", ["importTemplateCsv", "headerGuess"], async () => {
    const s = String(fn("importTemplateCsv")!());
    const t = CSV.parseCsv(s);
    const bad = [t.headers, ...t.rows].flat().filter((c: string) => FORMULA_START.test(c));
    const g = fn("headerGuess")!(t.headers);
    return [s.startsWith("﻿") && t.headers.length >= 11 && Object.values(g ?? {}).includes("room") && !bad.length, `h=${t.headers.length} สูตร=${J(bad)}`];
  }, "MAJOR");

  // ═══════════════ C6. เพดาน X6 ═══════════════
  console.log("\n── C6 เพดาน X6 (ค่าตั้ง) ──");
  const many = (n: number) => Array.from({ length: n }, (_, i) => [`${9000 + i}`, "", "", "", "4500", "", "", "", "", "", ""]);
  await T("C6-1", "ค่าเริ่ม (ไม่มีแถวค่าตั้ง): ไฟล์ 36 ห้องผ่าน · rowCount 36 · columnCount 11 · format CSV", ["uploadImport"], async () => {
    const r = await up(cO, U.DC, csvBytes(CLEAN.headers, CLEAN.rows));
    return [r?.ok === true && r.rowCount === 36 && r.columnCount === 11 && r.format === "CSV" && typeof r.batchId === "string", J(r)];
  });
  await T("C6-2", "rooms.import.maxRows = 40 (หน่วย DC): 41 แถว ⇒ TOO_MANY_ROWS ไม่มีชุดใหม่ · 40 แถวผ่าน", ["uploadImport", "listImports"], async () => {
    await setU(A, "UNIT", U.DC, "rooms.import.maxRows", 40);
    const before = (await fn("listImports")!(cO, { unitId: U.DC }))?.length ?? -1;
    const a = await up(cO, U.DC, csvBytes(CLEAN.headers, many(41)));
    const mid = (await fn("listImports")!(cO, { unitId: U.DC }))?.length ?? -1;
    const b = await up(cO, U.DC, csvBytes(CLEAN.headers, many(40)));
    await unsetU(A, "UNIT", U.DC, "rooms.import.maxRows");
    return [a?.ok === false && a.code === "TOO_MANY_ROWS" && mid === before && b?.ok === true && b.rowCount === 40, `41=${codeOf(a)} 40=${codeOf(b)} ชุด ${before}→${mid}`];
  });
  await T("C6-3", "rooms.import.maxFileBytes = 10,000: ไฟล์ ~12 KB ⇒ FILE_TOO_LARGE (ไม่มี FileAsset/ชุดใหม่) · ~8 KB ผ่าน", ["uploadImport"], async () => {
    await setU(A, "UNIT", U.DC, "rooms.import.maxFileBytes", 10_000);
    const pad = (n: number) => csvBytes(["ห้อง", "หมายเหตุ"], Array.from({ length: n }, (_, i) => [`${7000 + i}`, "ห้องพักชั้นล่างติดถนนใหญ่".repeat(1)]));
    let big = pad(10), small = pad(10);
    for (let n = 10; big.length <= 12_000; n += 5) big = pad(n);
    for (let n = 10; pad(n + 5).length < 8_000; n += 5) small = pad(n + 5);
    const files0 = await prisma.fileAsset.count({ where: { tenantId: A } });
    const a = await up(cO, U.DC, big);
    const files1 = await prisma.fileAsset.count({ where: { tenantId: A } });
    const b = await up(cO, U.DC, small);
    await unsetU(A, "UNIT", U.DC, "rooms.import.maxFileBytes");
    return [a?.ok === false && a.code === "FILE_TOO_LARGE" && files1 === files0 && b?.ok === true, `big=${big.length}:${codeOf(a)} small=${small.length}:${codeOf(b)} files ${files0}→${files1}`];
  });
  await T("C6-4", "61 คอลัมน์ ⇒ TOO_MANY_COLUMNS · เซลล์ชื่อ 1,500 ตัวอักษร ⇒ พรีวิวมีปัญหา CELL_TOO_LONG ระดับ MUST_FIX", ["uploadImport", "previewImport"], async () => {
    const hdr = Array.from({ length: 61 }, (_, i) => `c${i}`);
    const a = await up(cO, U.DC, csvBytes(hdr, [hdr.map(() => "1")]));
    const rows = [["9101", "ก".repeat(1500), "081-910-1441", "1/5/69", "4500", "9000", "1000", "200", "", "", ""]];
    const u = await up(cO, U.DC, csvBytes(CLEAN.headers, rows));
    const p = u?.ok ? await pvMap(cO, U.DC, u.batchId) : null;
    return [a?.ok === false && a.code === "TOO_MANY_COLUMNS" && sevOf(p, "9101", "CELL_TOO_LONG") === "MUST_FIX", `61=${codeOf(a)} long=${J(issuesOf(p, "9101").map((i: any) => [i.code, i.severity]))}`];
  });
  await T("C6-5", "zip ระเบิด (คลาย 40 MB): parseImportFile ⇒ UNSAFE_FILE < 5 วิ ไม่ throw · uploadImport ⇒ UNSAFE_FILE ไม่มีชุด", ["parseImportFile", "uploadImport"], async () => {
    const t0 = Date.now();
    const r = fn("parseImportFile")!(BOMB);
    const ms = Date.now() - t0;
    const u = await up(cO, U.DC, BOMB, "bomb.xlsx");
    return [r?.ok === false && r.code === "UNSAFE_FILE" && ms < 5000 && u?.ok === false && u.code === "UNSAFE_FILE", `parse=${codeOf(r)} ${ms}ms upload=${codeOf(u)}`];
  });

  // ═══════════════ N. เซลล์อันตราย ═══════════════
  console.log("\n── N เซลล์อันตราย (CSV/formula injection) ──");
  const DANGER_ROWS = [
    ["101", '=HYPERLINK("http://evil.example","คลิก")', "081-801-4410", "1/5/69", "4500", "9000", "1000", "200", "", "", "@SUM(1+1)*cmd|' /C calc'!A0"],
    ["102", "+สมชาย ใจดี", "+66 81 802 4410", "1/5/69", "4500", "9000", "1001", "201", "", "", "-2+3"],
    ["103", "\t=1+1 ประยุทธ", "081-803-4410", "1/5/69", "4500", "9000", "1002", "202", "", "", "\r=cmd"],
    ["104", "＝ทดสอบ เต็มความกว้าง", "081-804-4410", "1/5/69", "4500", "9000", "1003", "203", "", "", "ปกติ"],
    ["105", "สุดา ปกติ", "081-805-4410", "1/5/69", "=4500*2", "9000", "1004", "204", "", "", ""],
  ];
  const DANGER = csvBytes(CLEAN.headers, DANGER_ROWS);
  await T("N-1", "neutralizeCell: = + - @ tab CR LF ตัวเต็มความกว้าง และช่องว่างนำหน้า ⇒ ขึ้นต้นด้วย ' · ข้อความปกติ/ตัวเลขไม่แตะ", ["neutralizeCell"], async () => {
    const f = fn("neutralizeCell")!;
    const bad = ["=1+1", "+cmd", "-2+3", "@SUM(A1)", "\t=1", "\r=1", "\nx", "＝x", "＋x", "－x", "＠x", "  =1", "\t"];
    const good = ["สมชาย ใจดี", "4500", "นาย ก"];
    const b = bad.map((v) => f(v)), g = good.map((v) => f(v));
    return [b.every((x: string) => typeof x === "string" && x.startsWith("'")) && J(g) === J(good), `${J(b)} ${J(g)}`];
  });
  let dangerBatch = "";
  await T("N-2", "อัปโหลดไฟล์เซลล์อันตราย: headers/samples ทุกช่องไม่ขึ้นต้นด้วยสูตร/tab/CR · เบอร์ใน samples ปิดเลขกลาง (ไม่มีเบอร์เต็ม)", ["uploadImport"], async () => {
    const r = await up(cO, U.DT, DANGER);
    dangerBatch = r?.batchId ?? "";
    const cells = [...(r?.headers ?? []), ...(r?.samples ?? []).flat()];
    const bad = cells.filter((c: string) => FORMULA_START.test(String(c)));
    const fullPhone = /0818014410|081-801-4410|0818024410/.test(J(r));
    return [r?.ok === true && cells.length > 11 && !bad.length && !fullPhone, `${codeOf(r)} สูตร=${J(bad).slice(0, 200)} เบอร์เต็ม=${fullPhone}`];
  }, "CRITICAL");
  let dangerPv: any = null;
  await T("N-3", "พรีวิว: TEXT_NEUTRALIZED (WARN) ที่ 101–104 · ค่าเช่า '=4500*2' ⇒ MONEY_INVALID (MUST_FIX · ไม่ประเมินสูตร) · ทุก issue.value ไม่ขึ้นต้นด้วยสูตร · เบอร์ '+66 81 802 4410' ไม่ถือเป็นสูตร", ["previewImport"], async () => {
    dangerPv = await pvMap(cO, U.DT, dangerBatch);
    const tn = ["101", "102", "103", "104"].map((r) => sevOf(dangerPv, r, "TEXT_NEUTRALIZED"));
    const money = sevOf(dangerPv, "105", "MONEY_INVALID");
    const phone102 = issuesOf(dangerPv, "102").some((i: any) => i.field === "phone");
    const vals = ((dangerPv?.issues ?? []) as any[]).map((i) => i.value).filter((v) => typeof v === "string").filter((v: string) => FORMULA_START.test(v));
    return [dangerPv?.ok === true && tn.every((s) => s === "WARN") && money === "MUST_FIX" && !phone102 && !vals.length, `tn=${J(tn)} money=${money} phone102=${phone102} value สูตร=${J(vals)}`];
  });
  await T("N-4", "importIssuesCsv (ส่งออกปัญหา): อ่านกลับด้วยตัวแยกกลางแล้ว ไม่มีช่องใดขึ้นต้นด้วย = + - @ tab CR", ["importIssuesCsv"], async () => {
    const s = await fn("importIssuesCsv")!(cO, { unitId: U.DT, batchId: dangerBatch });
    const t = typeof s === "string" ? CSV.parseCsv(s) : null;
    const bad = t ? [t.headers, ...t.rows].flat().filter((c: string) => FORMULA_START.test(c)) : ["ไม่มี"];
    return [!!t && t.rows.length >= 5 && !bad.length, `rows=${t?.rows?.length} สูตร=${J(bad).slice(0, 200)}`];
  });
  await T("N-5", "สร้าง (ข้ามแถว 105): ชื่อ Party/ชื่อในสัญญาของ 101–104 และหมายเหตุห้อง 101 ขึ้นต้นด้วย ' (ไม่มีช่องที่ขึ้นต้นด้วยสูตร) · 102 เบอร์ +66 ⇒ phoneNorm 0818024410", ["previewImport", "createImport", "getLease"], async () => {
    const p = await pvMap(cO, U.DT, dangerBatch, { decisions: { [String(DANGER_ROWS.findIndex((r) => r[0] === "105") + 2)]: [{ action: "SKIP" }] } });
    const c = p?.ok ? await cr(cO, U.DT, dangerBatch, p.previewHash) : p;
    const ls = await batchLeases(A, U.DT, dangerBatch);
    const parties = await prisma.party.findMany({ where: { id: { in: ls.map((l) => l.partyId) } } });
    const names = await Promise.all(ls.map(async (l) => (await fn("getLease")!(cO, { unitId: U.DT, leaseId: l.id }))?.tenantName as string));
    const note = (await prisma.hotelRoom.findFirst({ where: { tenantId: A, unitId: U.DT, number: "101" } }))?.note ?? "";
    const allQ = [...parties.map((x: any) => x.name), ...names].every((n: string) => typeof n === "string" && !FORMULA_START.test(n));
    const q = parties.filter((x: any) => String(x.name).startsWith("'")).length;
    const p102 = parties.find((x: any) => x.phoneNorm === "0818024410");
    return [c?.ok === true && ls.length === 4 && q === 4 && allQ && String(note).startsWith("'") && !!p102, `${codeOf(c)} leases=${ls.length} ' นำหน้า=${q} note=${J(note)} p102=${!!p102}`];
  });

  // ═══════════════ M. เดาคอลัมน์ · ยืนยัน ═══════════════
  console.log("\n── M เดาคอลัมน์ (AI ผ่านตัวต่อ) · คนยืนยัน ──");
  const SCENE_CSV = csvBytes(SCENE.headers, SCENE.rows);
  let sBatch = "";
  {
    const u = fn("uploadImport") ? await up(cO, U.DS, SCENE_CSV, "ทะเบียนหอ ต.ค.69.csv") : null;
    sBatch = u?.batchId ?? "";
  }
  const aiMap = (n: number) => Array.from({ length: n }, (_, col) => ({ col, field: EXPECTED_MAP[String(col)], confidence: 0.9 }));
  await T("M-1", "guessColumns + guesser ที่ฉีด (ตายตัว): source AI · mapping ตามที่เดา · guessed 10 / columns 11 (LINE = IGNORE ไม่นับ)", ["guessColumns"], async () => {
    const g = await fn("guessColumns")!(cO, { unitId: U.DS, batchId: sBatch }, { guesser: { guess: async () => aiMap(11) } });
    return [g?.ok === true && g.source === "AI" && J(Object.keys(EXPECTED_MAP).map((k) => g.mapping?.[k])) === J(Object.values(EXPECTED_MAP)) && g.guessed === 10 && g.columns === 11, J(g)];
  });
  await T("M-2", "สิ่งที่ส่งให้ AI ไม่มีข้อมูลส่วนตัวจริง: ไม่มีเบอร์เต็ม · ไม่มีชื่อผู้เช่าจากไฟล์ (เช่น ณัฐชา ใจดี) · มีหัวคอลัมน์ครบ", ["guessColumns"], async () => {
    let seen: any = null;
    const g = await fn("guessColumns")!(cO, { unitId: U.DS, batchId: sBatch }, { guesser: { guess: async (inp: any) => { seen = inp; return aiMap(11); } } });
    const s = J(seen);
    const leak = /081-?204-?4410|0812044410|ณัฐชา|วรพล|อรอุมา/.exec(s);
    return [g?.ok === true && !!seen && J(seen.headers) === J(SCENE.headers) && !leak, `leak=${leak?.[0] ?? "—"} headers=${J(seen?.headers)}`];
  });
  await T("M-3", "guesser throw ⇒ ไม่ throw · source HEADER · mapping = headerGuess", ["guessColumns", "headerGuess"], async () => {
    const g = await fn("guessColumns")!(cO, { unitId: U.DS, batchId: sBatch }, { guesser: { guess: async () => { throw new Error("AI ล่ม"); } } });
    return [g?.ok === true && g.source === "HEADER" && J(g.mapping) === J(fn("headerGuess")!(SCENE.headers)), J(g)];
  });
  await T("M-4", "ไม่มี AI (guesser null): ไฟล์หัวมาตรฐาน ⇒ HEADER · ไฟล์หัวแปลก (c1,c2…) ⇒ NONE · guessed 0", ["guessColumns", "uploadImport"], async () => {
    const g = await fn("guessColumns")!(cO, { unitId: U.DS, batchId: sBatch }, { guesser: null });
    const u = await up(cO, U.DS, csvBytes(["c1", "c2", "c3"], [["101", "ก", "4500"]]), "odd.csv");
    const g2 = u?.ok ? await fn("guessColumns")!(cO, { unitId: U.DS, batchId: u.batchId }, { guesser: null }) : u;
    return [g?.source === "HEADER" && g2?.ok === true && g2.source === "NONE" && g2.guessed === 0, `${g?.source} / ${J(g2)}`];
  });
  await T("M-5", "ผล AI ผิดรูป (field ไม่รู้จัก · คอลัมน์นอกช่วง · field ซ้ำ) ⇒ ทิ้งรายการนั้น ไม่ throw", ["guessColumns"], async () => {
    const g = await fn("guessColumns")!(cO, { unitId: U.DS, batchId: sBatch }, { guesser: { guess: async () => [{ col: 0, field: "room", confidence: 1 }, { col: 1, field: "hack", confidence: 1 }, { col: 99, field: "rent", confidence: 1 }, { col: 2, field: "room", confidence: 1 }] } });
    const vals = Object.values(g?.mapping ?? {});
    return [g?.ok === true && g.mapping?.["0"] === "room" && !vals.includes("hack") && vals.filter((v) => v === "room").length === 1 && !("99" in (g.mapping ?? {})), J(g?.mapping)];
  });
  await T("M-6", "พรีวิวโดยไม่ส่ง mapping (ใช้ข้อเสนอ AI) ⇒ confirmed false · createImport ⇒ NOT_CONFIRMED ไม่มีแถวธุรกิจเกิด", ["previewImport", "createImport"], async () => {
    const before = await bizCounts(A);
    const p = await pv(cO, U.DS, sBatch, { options: OPTS, decisions: { [String(rowNoOf("310"))]: [{ action: "SKIP" }] } });
    const c = p?.ok ? await cr(cO, U.DS, sBatch, p.previewHash) : p;
    const after = await bizCounts(A);
    return [p?.ok === true && p.confirmed === false && c?.ok === false && c.code === "NOT_CONFIRMED" && J(before) === J(after), `confirmed=${p?.confirmed} create=${codeOf(c)} ${J(before) === J(after) ? "" : `${J(before)}→${J(after)}`}`];
  });
  await T("M-7", "แมปผิด ⇒ INVALID_MAPPING: field ซ้ำ 2 คอลัมน์ · ไม่มี room · field ไม่รู้จัก", ["previewImport"], async () => {
    const a = await pv(cO, U.DS, sBatch, { mapping: { ...EXPECTED_MAP, "1": "room" }, options: OPTS });
    const { "0": _r, ...noRoom } = EXPECTED_MAP;
    const b = await pv(cO, U.DS, sBatch, { mapping: { ...noRoom, "0": "IGNORE" }, options: OPTS });
    const c = await pv(cO, U.DS, sBatch, { mapping: { ...EXPECTED_MAP, "10": "password" }, options: OPTS });
    return [[a, b, c].every((r) => r?.ok === false && r.code === "INVALID_MAPPING"), `${codeOf(a)}/${codeOf(b)}/${codeOf(c)}`];
  }, "MAJOR");

  // ═══════════════ P. ตรวจ + พรีวิว + กฎหมายตามโหมด ═══════════════
  console.log("\n── P ตรวจ · พรีวิว · กฎ สคบ. ตามโหมด ──");
  let pS: any = null;
  await T("P-1", "หน่วย STRICT ไฟล์ภาพ 12: พร้อม 32 · เตือน 3 · ต้องแก้ 1 · rows 36 · confirmed true (ส่ง mapping)", ["previewImport"], async () => {
    pS = await pvMap(cO, U.DS, sBatch);
    const s = pS?.summary;
    return [pS?.ok === true && pS.confirmed === true && s?.rows === 36 && s?.ready === 32 && s?.warn === 3 && s?.mustFix === 1, J(s ?? pS)];
  });
  await T("P-2", "ปัญหาต่อห้องตามภาพ 12: 310 DEPOSIT_LEGAL MUST_FIX (+legal.code/citation · rowNo ตรง) · 211 PHONE_DUP_IN_FILE WARN · 108 VACANT_WITH_RENT WARN · 112 METER_OUTLIER WARN · 106/305 ARREARS_NOT_IMPORTED INFO", ["previewImport"], async () => {
    const i310 = issuesOf(pS, "310").find((i: any) => i.code === "DEPOSIT_LEGAL");
    const got = { "310": i310?.severity, "211": sevOf(pS, "211", "PHONE_DUP_IN_FILE"), "108": sevOf(pS, "108", "VACANT_WITH_RENT"), "112": sevOf(pS, "112", "METER_OUTLIER"), "106": sevOf(pS, "106", "ARREARS_NOT_IMPORTED"), "305": sevOf(pS, "305", "ARREARS_NOT_IMPORTED") };
    const want = { "310": "MUST_FIX", "211": "WARN", "108": "WARN", "112": "WARN", "106": "INFO", "305": "INFO" };
    return [J(got) === J(want) && i310?.rowNo === rowNoOf("310") && !!i310?.legal?.code && !!i310?.legal?.citation, `${J(got)} 310=${J(i310)}`];
  });
  await T("P-3", "แผน (ภาพ 12): อาคาร 1 · ชั้น 3 · ห้อง 36 · ประเภท 2 · สัญญา 32 · Party ใหม่ 31 · มิเตอร์ 72 · เลข 72 · ประกันเปิดยอด ฿296,400 · ค้างยกมา 2 ใบ ฿10,200.40 (แสดงเท่านั้น)", ["previewImport"], async () => {
    const p = pS?.plan;
    const ok = p && p.buildings === 1 && p.floors === 3 && p.rooms === 36 && p.roomTypes === 2 && p.leases === 32 && p.parties === 31 && p.meters === 72 && p.readings === 72 && p.depositSatang === 29_640_000 && p.arrears?.count === 2 && p.arrears?.satang === 1_020_040;
    return [!!ok, J(p)];
  });
  await T("P-4", "พรีวิวไม่เขียนข้อมูลธุรกิจ (ห้อง · สัญญา · Party · มิเตอร์ · เลข · JV · occupancy · outbox · อาคาร · ประเภทห้อง ของร้าน A ไม่เปลี่ยน)", ["previewImport"], async () => {
    const a = await bizCounts(A);
    await pvMap(cO, U.DS, sBatch);
    await pvMap(cO, U.DS, sBatch, { decisions: { [String(rowNoOf("310"))]: [{ action: "SET", field: "deposit", value: "9000" }] } });
    const b = await bizCounts(A);
    return [J(a) === J(b), `${J(a)} → ${J(b)}`];
  });
  await T("P-5", "โหมด WARN (หน่วย DW): 310 DEPOSIT_LEGAL = WARN (ไม่ใช่ MUST_FIX) · พร้อม 32 · เตือน 4 · ต้องแก้ 0", ["uploadImport", "previewImport"], async () => {
    const u = await up(cO, U.DW, SCENE_CSV);
    const p = u?.ok ? await pvMap(cO, U.DW, u.batchId) : u;
    return [sevOf(p, "310", "DEPOSIT_LEGAL") === "WARN" && J(p?.summary) === J({ rows: 36, ready: 32, warn: 4, mustFix: 0 }), `${sevOf(p, "310", "DEPOSIT_LEGAL")} ${J(p?.summary ?? p)}`];
  });
  await T("P-6", "นอกขอบเขต + เหตุผล (หน่วย DO): 310 ไม่มีปัญหากฎหมาย · เตือน 3 · ต้องแก้ 0", ["uploadImport", "previewImport"], async () => {
    const u = await up(cO, U.DO, SCENE_CSV);
    const p = u?.ok ? await pvMap(cO, U.DO, u.batchId) : u;
    return [p?.ok === true && !sevOf(p, "310", "DEPOSIT_LEGAL") && p.summary?.mustFix === 0 && p.summary?.warn === 3, `${J(p?.summary ?? p)} 310=${J(issuesOf(p, "310"))}`];
  });
  await T("P-7", "นอกขอบเขตไม่มีเหตุผล (หน่วย DQ): 310 DEPOSIT_LEGAL MUST_FIX + legal.code OUT_OF_SCOPE_REASON_REQUIRED", ["uploadImport", "previewImport"], async () => {
    const u = await up(cO, U.DQ, SCENE_CSV);
    const p = u?.ok ? await pvMap(cO, U.DQ, u.batchId) : u;
    const i = issuesOf(p, "310").find((x: any) => x.code === "DEPOSIT_LEGAL");
    return [i?.severity === "MUST_FIX" && i?.legal?.code === "OUT_OF_SCOPE_REASON_REQUIRED", J(i ?? p)];
  });
  await T("P-8", "createImport ขณะยังมีต้องแก้ ⇒ MUST_FIX_REMAINING · ไม่มีแถวธุรกิจเกิด", ["createImport"], async () => {
    const a = await bizCounts(A);
    const c = await cr(cO, U.DS, sBatch, pS?.previewHash ?? "x");
    const b = await bizCounts(A);
    return [c?.ok === false && c.code === "MUST_FIX_REMAINING" && J(a) === J(b), `${codeOf(c)} ${J(a) === J(b) ? "" : "มีแถวเกิด"}`];
  });
  await T("P-9", "ตัดสินแถว 310: SET ประกัน 9000 ⇒ ต้องแก้ 0 · แผนประกัน ฿305,400 สัญญา 33 · SKIP ⇒ สัญญา 32 · hash ต่างกันตามการตัดสิน · พรีวิวซ้ำค่าเดิม = hash เดิม", ["previewImport"], async () => {
    const r310 = String(rowNoOf("310"));
    const s1 = await pvMap(cO, U.DS, sBatch, { decisions: { [r310]: [{ action: "SET", field: "deposit", value: "9000" }] } });
    const s1b = await pvMap(cO, U.DS, sBatch, { decisions: { [r310]: [{ action: "SET", field: "deposit", value: "9000" }] } });
    const s2 = await pvMap(cO, U.DS, sBatch, { decisions: { [r310]: [{ action: "SKIP" }] } });
    return [s1?.summary?.mustFix === 0 && s1.plan?.depositSatang === 30_540_000 && s1.plan?.leases === 33 && s2?.plan?.leases === 32 && s1.previewHash === s1b?.previewHash && s1.previewHash !== s2?.previewHash && s2?.previewHash !== pS?.previewHash,
      `s1=${J(s1?.summary)}:${s1?.plan?.depositSatang} s2=${s2?.plan?.leases} hash ${s1?.previewHash === s1b?.previewHash}/${s1?.previewHash !== s2?.previewHash}`];
  });
  await T("P-10", "ตรวจ→เขียนใต้ล็อก: พรีวิว (ยืนยัน) แล้วเปลี่ยนโหมดกฎหมายหน่วยเป็น WARN ก่อนสร้าง ⇒ STALE_PREVIEW (+previewHash ใหม่) ไม่มีแถวเกิด", ["previewImport", "createImport"], async () => {
    const r310 = String(rowNoOf("310"));
    const p = await pvMap(cO, U.DS, sBatch, { decisions: { [r310]: [{ action: "SKIP" }] } });
    await setU(A, "UNIT", U.DS, "rooms.legal.mode", "WARN");
    const a = await bizCounts(A);
    const c = await cr(cO, U.DS, sBatch, p?.previewHash ?? "x");
    const b = await bizCounts(A);
    await unsetU(A, "UNIT", U.DS, "rooms.legal.mode");
    return [c?.ok === false && c.code === "STALE_PREVIEW" && typeof c.previewHash === "string" && c.previewHash !== p?.previewHash && J(a) === J(b), `${codeOf(c)} new=${c?.previewHash ? "มี" : "ไม่มี"}`];
  });
  await T("P-11", "DTO พรีวิว/getImport/listImports ไม่มีเบอร์เต็ม (081-xxx-4410 ⇒ ปิด) ไม่มีเลขบัตร 13 หลัก", ["previewImport", "getImport", "listImports"], async () => {
    const g = await fn("getImport")!(cO, { unitId: U.DS, batchId: sBatch });
    const l = await fn("listImports")!(cO, { unitId: U.DS });
    const s = J([pS, g, l]);
    const leak = /\b0\d{9}\b|\b0\d{2}-\d{3}-\d{4}\b|\b\d{13}\b/.exec(s);
    return [!!g && Array.isArray(l) && !leak, `leak=${leak?.[0] ?? "—"}`];
  });
  await T("P-12", "ปัญหาต้องแก้ชนิดอื่น: ห้องซ้ำในไฟล์ ROOM_DUP_IN_FILE · วันที่ผิด DATE_INVALID · เข้าอยู่อนาคต START_IN_FUTURE · ไม่มีเบอร์/บัตร TENANT_CONTACT_REQUIRED · เลขบัตรผิด IDCARD_INVALID · ไม่มีค่าเช่า RENT_REQUIRED · มิเตอร์ติดลบ METER_INVALID", ["uploadImport", "previewImport"], async () => {
    const fut = (() => { const d = addDays(TODAY, 40); return `${Number(d.slice(8))}/${Number(d.slice(5, 7))}/${(Number(d.slice(0, 4)) + 543) % 100}`; })();
    const hdr = [...CLEAN.headers, "เลขบัตร"];
    const map = { ...EXPECTED_MAP, "11": "idCard" };
    const rows = [
      ["501", "ก หนึ่ง", "081-501-4410", "1/5/69", "4500", "9000", "1", "1", "", "", "", ""],
      ["501", "ข สอง", "081-502-4410", "1/5/69", "4500", "9000", "1", "1", "", "", "", ""],
      ["503", "ค สาม", "081-503-4410", "32/13/69", "4500", "9000", "1", "1", "", "", "", ""],
      ["504", "ง สี่", "081-504-4410", fut, "4500", "9000", "1", "1", "", "", "", ""],
      ["505", "จ ห้า", "", "1/5/69", "4500", "9000", "1", "1", "", "", "", ""],
      ["506", "ฉ หก", "081-506-4410", "1/5/69", "4500", "9000", "1", "1", "", "", "", "1234567890123"],
      ["507", "ช เจ็ด", "081-507-4410", "1/5/69", "", "9000", "1", "1", "", "", "", ""],
      ["508", "ซ แปด", "081-508-4410", "1/5/69", "4500", "9000", "-5", "1", "", "", "", ""],
    ];
    const u = await up(cO, U.DE, csvBytes(hdr, rows));
    const p = u?.ok ? await pv(cO, U.DE, u.batchId, { mapping: map, options: OPTS }) : u;
    const got = [sevOf(p, "501", "ROOM_DUP_IN_FILE"), sevOf(p, "503", "DATE_INVALID"), sevOf(p, "504", "START_IN_FUTURE"), sevOf(p, "505", "TENANT_CONTACT_REQUIRED"), sevOf(p, "506", "IDCARD_INVALID"), sevOf(p, "507", "RENT_REQUIRED"), sevOf(p, "508", "METER_INVALID")];
    return [got.every((s) => s === "MUST_FIX"), J(got)];
  });
  await T("P-13", "สัญญาในไฟล์ครบกำหนดแล้ว (เข้าอยู่ 3 ปีก่อน · ไม่มีคอลัมน์ระยะ) ⇒ WARN LEASE_ENDED_IN_FILE (ต่ออายุให้ครอบวันนี้ · ไม่ใช่ต้องแก้)", ["uploadImport", "previewImport"], async () => {
    const y = (Number(TODAY.slice(0, 4)) - 3 + 543) % 100;
    const u = await up(cO, U.DE, csvBytes(CLEAN.headers, [["601", "ฌ เก้า", "081-601-4410", `1/1/${y}`, "4500", "9000", "1", "1", "", "", ""]]));
    const p = u?.ok ? await pvMap(cO, U.DE, u.batchId) : u;
    return [sevOf(p, "601", "LEASE_ENDED_IN_FILE") === "WARN" && p?.summary?.mustFix === 0, J(issuesOf(p, "601"))];
  }, "MAJOR");
  await T("P-14", "เบอร์ชน Party เดิมของร้านแต่ชื่อไม่ตรง ⇒ TENANT_MATCH_CONFIRM ต้องแก้ · ตัดสิน TENANT confirmPartyId ⇒ หาย (D.5 K3)", ["uploadImport", "previewImport"], async () => {
    const other = await prisma.party.create({ data: { tenantId: A, name: "คนอื่น ชื่อไม่ตรง", phone: "0817014410", phoneNorm: "0817014410" } });
    const u = await up(cO, U.DE, csvBytes(CLEAN.headers, [["701", "ญ สิบ", "081-701-4410", "1/5/69", "4500", "9000", "1", "1", "", "", ""]]));
    const p = u?.ok ? await pvMap(cO, U.DE, u.batchId) : u;
    const p2 = u?.ok ? await pvMap(cO, U.DE, u.batchId, { decisions: { "2": [{ action: "TENANT", confirmPartyId: other.id }] } }) : u;
    return [sevOf(p, "701", "TENANT_MATCH_CONFIRM") === "MUST_FIX" && p2?.summary?.mustFix === 0 && p2?.plan?.parties === 0, `${J(issuesOf(p, "701"))} → ${J(p2?.summary)} parties=${p2?.plan?.parties}`];
  }, "MAJOR");

  // ═══════════════ L. แถวเตือนกฎหมาย (โหมด WARN) ═══════════════
  console.log("\n── L แถวเตือนกฎหมาย (หน่วย DL โหมด WARN) ──");
  {
    const lrows = [["801", "ฎ ประกันเกิน", "081-811-4410", "1/5/69", "4500", "15000", "1", "1", "", "", ""], ["802", "ฏ ปกติ", "081-812-4410", "1/5/69", "4500", "9000", "1", "1", "", "", ""]];
    const u = fn("uploadImport") ? await up(cO, U.DL, csvBytes(CLEAN.headers, lrows)) : null;
    const lb = u?.batchId ?? "";
    await T("L-1", "ผู้จัดการ (ไม่ใช่เจ้าของ) + legalAck ⇒ NEEDS_OWNER · เจ้าของไม่มี legalAck ⇒ NEEDS_OWNER · ไม่มีแถวเกิด", ["previewImport", "createImport"], async () => {
      const a = await bizCounts(A);
      const p = await pvMap(cM, U.DL, lb);
      const c1 = await cr(cM, U.DL, lb, p?.previewHash ?? "x", { reason: "ผู้เช่าเดิมจ่ายประกันมาก่อนประกาศมีผลบังคับ" });
      const p2 = await pvMap(cO, U.DL, lb);
      const c2 = await cr(cO, U.DL, lb, p2?.previewHash ?? "x");
      const b = await bizCounts(A);
      return [c1?.ok === false && c1.code === "NEEDS_OWNER" && c2?.ok === false && c2.code === "NEEDS_OWNER" && J(a) === J(b), `${codeOf(c1)}/${codeOf(c2)}`];
    });
    await T("L-2", "เจ้าของ + legalAck ⇒ สร้าง · สัญญา 801 legal.level WARN · AuditLog dorm.lease.legal_override (ทางเดียวกับ D.5)", ["previewImport", "createImport", "getLease"], async () => {
      const p = await pvMap(cO, U.DL, lb);
      const c = await cr(cO, U.DL, lb, p?.previewHash ?? "x", { reason: "ผู้เช่าเดิมจ่ายประกันมาก่อนประกาศมีผลบังคับ" });
      const ls = await batchLeases(A, U.DL, lb);
      const l801 = ls.find((l) => l.room.number === "801");
      const g = l801 ? await fn("getLease")!(cO, { unitId: U.DL, leaseId: l801.id }) : null;
      const au = l801 ? await prisma.auditLog.count({ where: { tenantId: A, action: "dorm.lease.legal_override", targetId: l801.id } }) : 0;
      return [c?.ok === true && ls.length === 2 && g?.legal?.level === "WARN" && au >= 1 && g?.status === "ACTIVE", `${codeOf(c)} leases=${ls.length} legal=${g?.legal?.level} audit=${au} st=${g?.status}`];
    });
  }

  // ═══════════════ K. สร้าง (ไฟล์ 36 ห้อง) ═══════════════
  console.log("\n── K สร้าง: ไฟล์ตัวอย่าง 36 ห้อง (หน่วย DK · STRICT · ว่างเปล่า) ──");
  const KCSV = csvBytes(CLEAN.headers, CLEAN.rows);
  let kBatch = "";
  let kPreview: any = null;
  let kCreate: any = null;
  const kBefore = await counts(A, U.DK);
  if (fn("uploadImport") && fn("previewImport") && fn("createImport")) {
    try {
      const r = await importAll(cO, U.DK, KCSV);
      kBatch = r.u?.batchId ?? "";
      kPreview = r.p;
      kCreate = r.c;
      console.log(`  (สร้าง DK: upload=${codeOf(r.u)} preview=${codeOf(r.p)} create=${codeOf(r.c)})`);
    } catch (e) { console.log(`  (สร้าง DK throw: ${errMsg(e)})`); }
  }
  const kAfter = await counts(A, U.DK);
  const kLeases = kBatch ? await batchLeases(A, U.DK, kBatch) : [];
  await T("K-1", "createImport ok · status CREATED · created = แผนพรีวิว (ห้อง 36 · สัญญา 33 · Party 32 · มิเตอร์ 72 · เลข 72 · ประกัน ฿305,400) · พรีวิว 33/3/0", ["createImport"], async () => {
    const p = kCreate?.created;
    const ok = kCreate?.ok === true && kCreate.status === "CREATED" && kCreate.duplicate === false && J(kPreview?.summary) === J({ rows: 36, ready: 33, warn: 3, mustFix: 0 })
      && p?.rooms === 36 && p?.leases === 33 && p?.parties === 32 && p?.meters === 72 && p?.readings === 72 && p?.depositSatang === 30_540_000 && p?.buildings === 1 && p?.roomTypes === 2;
    return [ok, `${codeOf(kCreate)} preview=${J(kPreview?.summary)} created=${J(p)}`];
  });
  await T("K-2", "ห้อง: 36 ห้อง active ในหน่วย · อาคาร 1 · ชั้นจากเลขห้อง (1/2/3) · ประเภท 2 (฿4,500 / ฿5,200 รายเดือน) · หมายเหตุ 204 'มีแมว 1 ตัว'", ["createImport"], async () => {
    const rooms = await prisma.hotelRoom.findMany({ where: { tenantId: A, unitId: U.DK, active: true }, include: { roomType: true } });
    const bld = await prisma.roomBuilding.count({ where: { tenantId: A, unitId: U.DK } });
    const floorsOk = rooms.every((r: any) => r.floorNo === Number(r.number[0]));
    const rates = [...new Set(rooms.map((r: any) => r.roomType?.monthlyRateSatang))].sort();
    const modes = [...new Set(rooms.map((r: any) => r.roomType?.rentMode))];
    const r204 = rooms.find((r: any) => r.number === "204");
    const large = rooms.filter((r: any) => r.roomType?.monthlyRateSatang === 520000).map((r: any) => r.number).sort();
    return [rooms.length === 36 && bld === 1 && floorsOk && J(rates) === J([450000, 520000]) && J(modes) === J(["MONTHLY"]) && r204?.note === "มีแมว 1 ตัว" && J(large) === J(["101", "112", "201", "212", "301", "312"]),
      `rooms=${rooms.length} bld=${bld} floors=${floorsOk} rates=${J(rates)} modes=${J(modes)} note=${r204?.note} large=${J(large)}`];
  });
  await T("K-3", "สัญญา: 33 ACTIVE ติดเครื่องหมาย policySnapshot.import.batchId · ค่าเช่า/ประกันตามไฟล์ · วันเริ่มจาก พ.ศ. · วันจบ = เริ่ม + 12 เดือน − 1 วัน · ห้องว่าง 108/210/311 ไม่มีสัญญา", ["createImport"], async () => {
    const byRoom = new Map(kLeases.map((l) => [l.room.number, l]));
    const bad: string[] = [];
    for (const r of CLEAN.rows as string[][]) {
      const l = byRoom.get(r[0]);
      if (!r[1]) { if (l) bad.push(`${r[0]}:มีสัญญา`); continue; }
      if (!l) { bad.push(`${r[0]}:ไม่มี`); continue; }
      const start = beToIso(r[3]);
      if (l.status !== "ACTIVE" || l.rentSatang !== Number(r[4]) * 100 || l.depositSatang !== Number(r[5]) * 100 || ymdOf(l.startDate) !== start || ymdOf(l.endDate) !== leaseEnd(start, 12)) bad.push(`${r[0]}:${l.status}/${l.rentSatang}/${l.depositSatang}/${ymdOf(l.startDate)}/${ymdOf(l.endDate)}`);
    }
    return [kLeases.length === 33 && !bad.length, `leases=${kLeases.length} ผิด=${bad.slice(0, 5).join(" · ")}`];
  });
  await T("K-4", "ผู้เช่า = Party: Party ใหม่ 32 ราย · 105 กับ 211 Party เดียวกัน (รวมตามค่าเริ่ม MERGE) · 204 = ณัฐชา ใจดี", ["createImport"], async () => {
    const p105 = kLeases.find((l) => l.room.number === "105")?.partyId, p211 = kLeases.find((l) => l.room.number === "211")?.partyId;
    const p204 = kLeases.find((l) => l.room.number === "204")?.partyId;
    const n204 = p204 ? (await prisma.party.findFirst({ where: { id: p204 } }))?.name : null;
    return [kAfter.parties - kBefore.parties === 32 && !!p105 && p105 === p211 && n204 === "ณัฐชา ใจดี", `Δparty=${kAfter.parties - kBefore.parties} 105=211:${p105 === p211} 204=${n204}`];
  });
  await T("K-5", "ประกันยกมา: ยอดถือ (securityDepositHeld) ต่อสัญญา = ประกันในไฟล์ทุกสัญญา · รวม ฿305,400 · listLeases heldTotalSatang = ฿305,400 · CURRENT 33", ["createImport", "listLeases"], async () => {
    let sum = 0;
    const bad: string[] = [];
    for (const l of kLeases) { const h = await held(U.DK, l.id); sum += h; if (h !== l.depositSatang) bad.push(`${l.room.number}:${h}`); }
    const ll = await fn("listLeases")!(cO, { unitId: U.DK });
    return [kLeases.length === 33 && !bad.length && sum === 30_540_000 && ll?.heldTotalSatang === 30_540_000 && ll?.counts?.CURRENT === 33, `sum=${sum} ผิด=${bad.join(",")} list=${ll?.heldTotalSatang}/${ll?.counts?.CURRENT}`];
  });
  await T("K-6", "บัญชี: JV เงินประกันของหน่วย 33 รายการ (หนึ่งต่อสัญญา) · คีย์ลงท้าย #RECEIVE:dorm.lease:<id>:deposit (เส้นเดียวกับ D.5 moveIn) · POSTED · หนี้สินสุทธิ = ประกัน · ไม่แตะรายได้ · สมดุลทุกรายการ", ["createImport"], async () => {
    const bad: string[] = [];
    let all: any[] = [];
    for (const l of kLeases) {
      const es = await depJVs(A, U.DK, l.id);
      all = all.concat(es);
      if (es.length !== 1 || !String(es[0].idempotencyKey ?? "").endsWith(`#RECEIVE:dorm.lease:${l.id}:deposit`) || es[0].status !== "POSTED" || liabNet(es) !== l.depositSatang) bad.push(`${l.room.number}:${es.length}/${es[0]?.idempotencyKey}`);
    }
    return [kLeases.length === 33 && kAfter.jv - kBefore.jv === 33 && !bad.length && !incomeTouched(all) && balanced(all), `Δjv=${kAfter.jv - kBefore.jv} ผิด=${bad.slice(0, 3).join(" · ")} รายได้=${incomeTouched(all)} สมดุล=${balanced(all)}`];
  });
  await T("K-7", "มิเตอร์: 72 ตัว (ไฟ 36 + น้ำ 36) เลขเริ่มตามไฟล์ · เลข PERIOD 72 แถว source IMPORT งวด = เดือนของวันจด · ค่าเท่าไฟล์ (112 = 8,904)", ["createImport"], async () => {
    const ms = await prisma.dormMeter.findMany({ where: { tenantId: A, unitId: U.DK, removedAt: null }, include: { room: { select: { number: true } } } });
    const rd = await prisma.dormMeterReading.findMany({ where: { tenantId: A, unitId: U.DK, kind: "PERIOD" } });
    const bad: string[] = [];
    for (const r of CLEAN.rows as string[][]) for (const [kind, col] of [["ELEC", 6], ["WATER", 7]] as const) {
      const m = ms.find((x: any) => x.room?.number === r[0] && x.kind === kind);
      const v = rd.find((x: any) => x.meterId === m?.id);
      if (!m || m.startReading !== Number(r[col]) || !v || v.value !== Number(r[col]) || v.periodKey !== READ_P || v.source !== "IMPORT") bad.push(`${r[0]}${kind}:${m?.startReading}/${v?.value}/${v?.periodKey}/${v?.source}`);
    }
    return [ms.length === 72 && rd.length === 72 && !bad.length, `meters=${ms.length} readings=${rd.length} ผิด=${bad.slice(0, 4).join(" · ")}`];
  });
  await T("K-8", "ยอดค้างยกมา (106 · 305) ไม่ออกใบแจ้งหนี้ (RULING-4) — ไม่มี AccountDocument ใหม่ในร้าน", ["createImport"], async () => [kCreate?.ok === true && kAfter.docs === kBefore.docs, `docs ${kBefore.docs}→${kAfter.docs}`], "MAJOR");
  await T("K-9", "getLease (D.5) อ่านสัญญานำเข้า 204: ACTIVE · ณัฐชา ใจดี · ฿4,500 · ยอดถือ ฿9,000 · ไม่มีเบอร์เต็มใน DTO · audit dorm.import.created 1 แถว after ไม่มีชื่อ/เบอร์", ["getLease"], async () => {
    const l = kLeases.find((x) => x.room.number === "204");
    const g = l ? await fn("getLease")!(cO, { unitId: U.DK, leaseId: l.id }) : null;
    const au = await prisma.auditLog.findMany({ where: { tenantId: A, action: "dorm.import.created" } });
    const mine = au.filter((a: any) => J(a.after).includes(kBatch));
    const leak = /ณัฐชา|081-?204|0812044410/.test(J(mine));
    return [g?.status === "ACTIVE" && g?.tenantName === "ณัฐชา ใจดี" && g?.rentSatang === 450000 && g?.heldSatang === 900000 && !/0812044410|081-204-4410/.test(J(g)) && mine.length === 1 && !leak,
      `get=${J(g && { s: g.status, n: g.tenantName, h: g.heldSatang })} audit=${mine.length} leak=${leak}`];
  });

  // ═══════════════ I. นำเข้าซ้ำ = ไม่ซ้ำ ═══════════════
  console.log("\n── I นำเข้าซ้ำ = ไม่ซ้ำ (X4) ──");
  await T("I-1", "createImport ชุดเดิมซ้ำ ⇒ ok duplicate:true · ไม่มีแถวใหม่ (ห้อง/สัญญา/JV/มิเตอร์/เลข/Party)", ["createImport"], async () => {
    const a = await counts(A, U.DK);
    const c = await cr(cO, U.DK, kBatch, kPreview?.previewHash ?? "x");
    const b = await counts(A, U.DK);
    return [c?.ok === true && c.duplicate === true && J(a) === J(b), `${codeOf(c)} dup=${c?.duplicate} ${J(a) === J(b) ? "" : `${J(a)}→${J(b)}`}`];
  });
  await T("I-2", "อัปโหลดไบต์เดิม ⇒ batchId เดิม · duplicate:true · status CREATED", ["uploadImport"], async () => {
    const u = await up(cO, U.DK, KCSV);
    return [u?.ok === true && u.batchId === kBatch && u.duplicate === true && u.status === "CREATED", J(u && { b: u.batchId === kBatch, d: u.duplicate, s: u.status, c: u.code })];
  });
  let xBatch = "";
  await T("I-3", "XLSX ข้อมูลเดียวกัน (ไฟล์ต่าง · hash ต่าง) ⇒ ชุดใหม่ · พรีวิว: แผนใหม่ทั้งหมด 0 (ห้อง/สัญญา/Party/มิเตอร์/เลข/ประกัน) · existing ห้อง 36 สัญญา 33 · สร้าง ⇒ ไม่มีแถวใหม่", ["uploadImport", "previewImport", "createImport"], async () => {
    const u = await up(cO, U.DK, xlsxBytes([{ name: "ผู้เช่า", rows: [CLEAN.headers, ...CLEAN.rows] }]), "ทะเบียนหอ.xlsx");
    xBatch = u?.batchId ?? "";
    const p = u?.ok ? await pvMap(cO, U.DK, u.batchId) : u;
    const a = await counts(A, U.DK);
    const c = p?.ok ? await cr(cO, U.DK, u.batchId, p.previewHash) : p;
    const b = await counts(A, U.DK);
    const pl = p?.plan;
    const zero = pl && pl.rooms === 0 && pl.leases === 0 && pl.parties === 0 && pl.meters === 0 && pl.readings === 0 && pl.depositSatang === 0 && pl.existing?.rooms === 36 && pl.existing?.leases === 33;
    return [u?.ok === true && u.batchId !== kBatch && !!zero && c?.ok === true && J(a) === J(b), `plan=${J(pl)} create=${codeOf(c)} ${J(a) === J(b) ? "" : `${J(a)}→${J(b)}`}`];
  });
  await T("I-4", "CSV windows-874 ข้อมูลเดียวกัน ⇒ พรีวิวแผนใหม่ 0 · ทุกแถว SKIP_EXISTS หรือ VACANT", ["uploadImport", "previewImport"], async () => {
    const u = await up(cO, U.DK, cp874(toCsvText(CLEAN.headers, CLEAN.rows)));
    const p = u?.ok ? await pvMap(cO, U.DK, u.batchId) : u;
    const acts = [...new Set(((p?.rows ?? []) as any[]).map((r) => r.action))].sort();
    return [p?.plan?.leases === 0 && p?.plan?.rooms === 0 && acts.every((a: string) => ["SKIP_EXISTS", "VACANT"].includes(a)), `${J(p?.plan)} actions=${J(acts)}`];
  }, "MAJOR");
  let plusBatch = "";
  await T("I-5", "ไฟล์เดิม + ห้องใหม่ 2 (113 · 114 มีผู้เช่า) ⇒ สร้างเฉพาะ 2 ห้อง/2 สัญญา/2 JV/4 มิเตอร์ · ห้องเดิมไม่ซ้ำ", ["uploadImport", "previewImport", "createImport"], async () => {
    const extra = [["113", "ฐ ใหม่หนึ่ง", "081-113-4410", "1/5/69", "4500", "9000", "1500", "300", "", "", ""], ["114", "ฑ ใหม่สอง", "081-114-4410", "1/5/69", "4500", "9000", "1501", "301", "", "", ""]];
    const a = await counts(A, U.DK);
    const r = await importAll(cO, U.DK, csvBytes(CLEAN.headers, [...CLEAN.rows, ...extra]));
    plusBatch = r.u?.batchId ?? "";
    const b = await counts(A, U.DK);
    const d = { rooms: b.rooms - a.rooms, leases: b.leasesLive - a.leasesLive, jv: b.jv - a.jv, meters: b.meters - a.meters, parties: b.parties - a.parties };
    return [r.c?.ok === true && J(d) === J({ rooms: 2, leases: 2, jv: 2, meters: 4, parties: 2 }), `${codeOf(r.c)} Δ=${J(d)}`];
  });

  // ═══════════════ U. ย้อนกลับ ═══════════════
  console.log("\n── U ย้อนกลับ (บัญชีกลับรายการ · ไม่ลบ) ──");
  const origJvIds: string[] = [];
  for (const l of kLeases) for (const e of await depJVs(A, U.DK, l.id)) origJvIds.push(e.id);
  const uBefore = await counts(A, U.DK);
  await T("U-1", "undoImport เหตุผลสั้น ⇒ INVALID_INPUT · ชุด DRAFT (ยังไม่สร้าง) ⇒ NOT_CREATED · ไม่มีอะไรเปลี่ยน", ["undoImport"], async () => {
    const a = await ud(cO, U.DK, kBatch, "x");
    const b = await ud(cO, U.DS, sBatch);
    const after = await counts(A, U.DK);
    return [a?.ok === false && a.code === "INVALID_INPUT" && b?.ok === false && b.code === "NOT_CREATED" && J(after) === J(uBefore), `${codeOf(a)}/${codeOf(b)}`];
  }, "MAJOR");
  let undoRes: any = null;
  await T("U-2", "undoImport ⇒ UNDONE · undone: สัญญา 33 · กลับรายการประกัน 33 · ฿305,400 · มิเตอร์ 72 · เลข 72 · ห้อง 36", ["undoImport"], async () => {
    undoRes = await ud(cO, U.DK, kBatch);
    const u = undoRes?.undone;
    return [undoRes?.ok === true && undoRes.status === "UNDONE" && undoRes.duplicate === false && u?.leases === 33 && u?.depositReversals === 33 && u?.reversedSatang === 30_540_000 && u?.meters === 72 && u?.readings === 72 && u?.rooms === 36, J(undoRes)];
  });
  const uAfter = await counts(A, U.DK);
  await T("U-3", "สัญญาของชุด: ทั้ง 33 CANCELLED (endReason IMPORT_UNDONE…) · occupancy ไม่ active · listLeases เหลือเฉพาะ 113/114 (CURRENT 2 · ยอดถือรวม ฿18,000)", ["undoImport", "listLeases"], async () => {
    const ls = await batchLeases(A, U.DK, kBatch);
    const bad = ls.filter((l) => l.status !== "CANCELLED" || !String(l.endReason ?? "").startsWith("IMPORT_UNDONE"));
    const occ = await prisma.roomOccupancy.count({ where: { tenantId: A, unitId: U.DK, refType: "DormLease", refId: { in: ls.map((l) => l.id) }, active: true } });
    const ll = await fn("listLeases")!(cO, { unitId: U.DK });
    return [ls.length === 33 && !bad.length && occ === 0 && ll?.counts?.CURRENT === 2 && ll?.heldTotalSatang === 1_800_000, `leases=${ls.length} ผิด=${bad.length} occ=${occ} list=${J(ll?.counts)}/${ll?.heldTotalSatang}`];
  });
  await T("U-4", "บัญชีกลับรายการ ไม่ลบ: JV รับเดิม 33 ยังอยู่ (status REVERSED) · JV กลับรายการ 33 (reversalOfId ชี้ตัวเดิม) · หนี้สินสุทธิต่อสัญญา 0 · ยอดถือ 0 · สมดุลทุกรายการ · ไม่มี JV ถูกลบ", ["undoImport"], async () => {
    const still = await prisma.accountJournalEntry.findMany({ where: { id: { in: origJvIds } } });
    const revs = await prisma.accountJournalEntry.count({ where: { reversalOfId: { in: origJvIds } } });
    const bad: string[] = [];
    let all: any[] = [];
    for (const l of kLeases) {
      const es = await depJVs(A, U.DK, l.id);
      all = all.concat(es);
      const h = await held(U.DK, l.id);
      if (liabNet(es) !== 0 || h !== 0) bad.push(`${l.room.number}:${liabNet(es)}/${h}`);
    }
    return [origJvIds.length === 33 && still.length === 33 && still.every((e: any) => e.status === "REVERSED") && revs === 33 && !bad.length && balanced(all) && uAfter.jv - uBefore.jv === 33,
      `เดิม=${still.length}/${origJvIds.length} REVERSED=${still.filter((e: any) => e.status === "REVERSED").length} กลับ=${revs} Δjv=${uAfter.jv - uBefore.jv} ผิด=${bad.slice(0, 3).join(",")}`];
  });
  await T("U-5", "securityDepositReceipts ของสัญญา 204 หลังย้อน = [] (ไม่แสดงใบรับที่ถูกกลับ)", ["undoImport"], async () => {
    const l = kLeases.find((x) => x.room.number === "204");
    const r = l ? await ACC.securityDepositReceipts({ tenantId: A, unitId: U.DK, leaseId: l.id }) : null;
    return [Array.isArray(r) && r.length === 0, J(r)];
  }, "MAJOR");
  await T("U-6", "มิเตอร์/เลข/ห้องของชุดหายจากการใช้งาน: มิเตอร์ active เหลือ 4 (113/114) · เลข IMPORT ของชุดไม่เหลือ · ห้อง active เหลือ 2 · อาคาร/ประเภทที่ชุดสร้างไม่ active", ["undoImport"], async () => {
    const rd = await prisma.dormMeterReading.count({ where: { tenantId: A, unitId: U.DK, kind: "PERIOD", source: "IMPORT" } });
    const types = await prisma.hotelRoomType.count({ where: { tenantId: A, unitId: U.DK, active: true } });
    return [uAfter.meters === 4 && uAfter.rooms === 2 && rd === 4 && types >= 1, `meters=${uAfter.meters} rooms=${uAfter.rooms} readingsIMPORT=${rd} typesActive=${types}`];
  });
  await T("U-7", "undoImport ซ้ำ ⇒ ok duplicate:true · ไม่มี JV ใหม่", ["undoImport"], async () => {
    const a = await counts(A, U.DK);
    const r = await ud(cO, U.DK, kBatch);
    const b = await counts(A, U.DK);
    return [r?.ok === true && r.duplicate === true && J(a) === J(b), `${codeOf(r)} dup=${r?.duplicate}`];
  });
  await T("U-8", "สร้างใหม่หลังย้อน (ไฟล์เดิม · พรีวิวใหม่) ⇒ ห้อง 36 กลับมา (ไม่ชนเลขห้องเดิม) · สัญญา ACTIVE 33 ใหม่ · ประกัน ฿305,400 · Party ไม่เพิ่ม (จับคู่คนเดิม)", ["previewImport", "createImport"], async () => {
    const a = await counts(A, U.DK);
    const p = await pvMap(cO, U.DK, kBatch);
    const c = p?.ok ? await cr(cO, U.DK, kBatch, p.previewHash) : p;
    const b = await counts(A, U.DK);
    const ls = (await batchLeases(A, U.DK, kBatch)).filter((l) => l.status === "ACTIVE");
    let sum = 0;
    for (const l of ls) sum += await held(U.DK, l.id);
    return [c?.ok === true && b.rooms === 38 && ls.length === 33 && sum === 30_540_000 && b.parties === a.parties, `${codeOf(c)} rooms=${b.rooms} active=${ls.length} held=${sum} Δparty=${b.parties - a.parties}`];
  });
  {
    // หน้าต่างเวลา + ตัวกั้น บนหน่วย DB2 (ไฟล์เล็ก 3 ห้อง)
    const small = withPrefix("083");
    const r = fn("createImport") ? await importAll(cO, U.DB2, csvBytes(small.headers, subset(small, ["201", "202", "203"]))) : null;
    const b2 = r?.u?.batchId ?? "";
    const tomorrow = new Date(Date.parse(`${addDays(TODAY, 1)}T00:00:01+07:00`));
    await T("U-9", "หน้าต่างย้อนกลับ: undoDays 0 + เวลาพรุ่งนี้ 00:00:01 ไทย (deps.now) ⇒ UNDO_EXPIRED ไม่มีอะไรเปลี่ยน", ["undoImport"], async () => {
      const a = await counts(A, U.DB2);
      const x = await ud(cO, U.DB2, b2, "ทดสอบหน้าต่างเวลา", tomorrow);
      const b = await counts(A, U.DB2);
      return [r?.c?.ok === true && x?.ok === false && x.code === "UNDO_EXPIRED" && J(a) === J(b), `create=${codeOf(r?.c)} undo=${codeOf(x)}`];
    });
    await T("U-10", "ตัวกั้น: จดมิเตอร์งวดถัดไปบนมิเตอร์ของชุด ⇒ UNDO_BLOCKED (METER_READ_AFTER_IMPORT) · มีบิลของสัญญา ⇒ UNDO_BLOCKED (BILL_EXISTS) · ไม่มีอะไรถูกย้อน", ["undoImport", "submitReadings"], async () => {
      const m = await prisma.dormMeter.findFirst({ where: { tenantId: A, unitId: U.DB2, removedAt: null } });
      const nextP = (() => { const [y, mo] = READ_P.split("-").map(Number); return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`; })();
      const s = await fn("submitReadings")!(cO, { unitId: U.DB2, periodKey: nextP, items: [{ meterId: m?.id, value: (m?.startReading ?? 0) + 50 }] });
      const x1 = await ud(cO, U.DB2, b2);
      await prisma.dormMeterReading.deleteMany({ where: { tenantId: A, unitId: U.DB2, periodKey: nextP } });
      const l = (await batchLeases(A, U.DB2, b2))[0];
      const run = await prisma.dormBillRun.create({ data: { tenantId: A, unitId: U.DB2, periodKey: nextP } });
      await prisma.dormBill.create({ data: { tenantId: A, unitId: U.DB2, runId: run.id, leaseId: l.id, roomId: l.roomId, partyId: l.partyId, periodKey: nextP, lines: [], subtotalSatang: 0, totalSatang: 0 } });
      const x2 = await ud(cO, U.DB2, b2);
      await prisma.dormBill.deleteMany({ where: { runId: run.id } });
      await prisma.dormBillRun.deleteMany({ where: { id: run.id } });
      const live = (await batchLeases(A, U.DB2, b2)).filter((z) => z.status === "ACTIVE").length;
      const codes1 = J(x1?.blockers?.map((b: any) => b.code)), codes2 = J(x2?.blockers?.map((b: any) => b.code));
      return [s?.ok === true && x1?.code === "UNDO_BLOCKED" && codes1.includes("METER_READ_AFTER_IMPORT") && x2?.code === "UNDO_BLOCKED" && codes2.includes("BILL_EXISTS") && live === 3,
        `read=${codeOf(s)} x1=${codeOf(x1)}${codes1} x2=${codeOf(x2)}${codes2} ACTIVE=${live}`];
    });
    await T("U-11", "positive: เอาตัวกั้นออก + undoDays 1 (ค่าตั้งหน่วย) + เวลาพรุ่งนี้ ⇒ ย้อนได้ UNDONE · ยอดถือ 0 ทุกสัญญา", ["undoImport"], async () => {
      await setU(A, "UNIT", U.DB2, "rooms.import.undoDays", 1);
      const x = await ud(cO, U.DB2, b2, "ทดสอบหน้าต่างเวลา 1 วัน", tomorrow);
      const ls = await batchLeases(A, U.DB2, b2);
      let h = 0;
      for (const l of ls) h += await held(U.DB2, l.id);
      return [x?.ok === true && x.status === "UNDONE" && ls.length === 3 && ls.every((l) => l.status === "CANCELLED") && h === 0, `${codeOf(x)} held=${h}`];
    });
  }

  // ═══════════════ R. พร้อมกัน ═══════════════
  console.log("\n── R พร้อมกัน (X3 · 4 โพรเซส × 3 · 30 ทางในโพรเซสเดียว) ──");
  const RFILE = withPrefix("084");
  const RCSV = csvBytes(RFILE.headers, RFILE.rows);
  let rBatch = "";
  await T("R-1", "uploadImport ไบต์เดียวกัน 12 ทาง (4 โพรเซส) ⇒ batchId เดียวทุกคำขอ · ไม่มี throw/P2002 · ชุดของหน่วย = 1", ["uploadImport", "listImports"], async () => {
    const rs = await fanout("uploadImport", cO, Array.from({ length: 12 }, () => ({ unitId: U.DR, fileName: "r.csv", contentType: "text/csv", __b64: Buffer.from(RCSV).toString("base64") })));
    const ids = [...new Set(rs.filter((r) => r?.ok).map((r) => r.batchId))];
    rBatch = ids[0] ?? "";
    const l = await fn("listImports")!(cO, { unitId: U.DR });
    return [rs.every((r) => r?.ok === true) && ids.length === 1 && l?.length === 1 && !badOf(rs).length, `${tally(rs)} ids=${ids.length} list=${l?.length}`];
  });
  await T("R-2", "createImport ชุดเดียว 12 ทาง (4 โพรเซส) ⇒ ทำงานจริงไม่เกิน 1 (ที่เหลือ BUSY/duplicate) · ผลสุดท้าย = แผนพอดี (ห้อง 36 · สัญญา 33 · JV 33 · มิเตอร์ 72 · เลข 72) · ไม่มี throw/P2028", ["previewImport", "createImport"], async () => {
    const p = await pvMap(cO, U.DR, rBatch);
    const rs = await fanout("createImport", cO, Array.from({ length: 12 }, () => ({ unitId: U.DR, batchId: rBatch, previewHash: p?.previewHash })));
    let fin = await fn("getImport")!(cO, { unitId: U.DR, batchId: rBatch });
    if (fin?.status !== "CREATED") { await cr(cO, U.DR, rBatch, p?.previewHash); fin = await fn("getImport")!(cO, { unitId: U.DR, batchId: rBatch }); }
    const c = await counts(A, U.DR);
    const workers = rs.filter((r) => r?.ok === true && r.duplicate === false).length;
    const others = rs.filter((r) => !(r?.ok === true && r.duplicate === false)).every((r) => (r?.ok === true && r.duplicate === true) || r?.code === "BUSY");
    return [workers <= 1 && others && !badOf(rs).length && fin?.status === "CREATED" && c.rooms === 36 && c.leasesLive === 33 && c.jv === 33 && c.meters === 72 && c.readings === 72, `${tally(rs)} final=${fin?.status} ${J(c)}`];
  });
  await T("R-3", "undoImport 30 ทางในโพรเซสเดียว (เกิน pool) ⇒ ย้อนครั้งเดียว · JV กลับรายการ 33 พอดี · ไม่มี P2028/P2024/throw", ["undoImport"], async () => {
    const a = await counts(A, U.DR);
    const { rs, ms } = await inProc(Array.from({ length: 30 }, () => () => ud(cO, U.DR, rBatch)));
    let fin = await fn("getImport")!(cO, { unitId: U.DR, batchId: rBatch });
    if (fin?.status !== "UNDONE") { await ud(cO, U.DR, rBatch); fin = await fn("getImport")!(cO, { unitId: U.DR, batchId: rBatch }); }
    const b = await counts(A, U.DR);
    const workers = rs.filter((r) => r?.ok === true && r.duplicate === false).length;
    return [workers <= 1 && !badOf(rs).length && fin?.status === "UNDONE" && b.jv - a.jv === 33 && b.leasesLive === 0, `${tally(rs)} ${ms}ms final=${fin?.status} Δjv=${b.jv - a.jv} live=${b.leasesLive}`];
  });
  await T("R-4", "undo 6 ทาง ∥ create 6 ทาง (2 กลุ่มโพรเซสพร้อมกัน) บนชุด CREATED แล้ว create ∥ undo บนชุด UNDONE ⇒ ผู้ชนะเดียว: ทุกสัญญาของชุด ACTIVE+ยอดถือ=ประกัน หรือ CANCELLED+0 — ห้ามครึ่ง ๆ", ["previewImport", "createImport", "undoImport"], async () => {
    const small = withPrefix("086");
    const r0 = await importAll(cO, U.DR2, csvBytes(small.headers, subset(small, ["101", "102", "103", "104", "105", "106"])));
    const b = r0.u?.batchId ?? "";
    const check = async () => {
      const ls = await batchLeases(A, U.DR2, b);
      const live = ls.filter((l) => l.status === "ACTIVE");
      const dead = ls.filter((l) => l.status === "CANCELLED");
      let bad = 0;
      for (const l of live) if ((await held(U.DR2, l.id)) !== l.depositSatang) bad++;
      for (const l of dead) if ((await held(U.DR2, l.id)) !== 0) bad++;
      const drafts = (await prisma.dormLease.count({ where: { tenantId: A, unitId: U.DR2, status: "DRAFT" } }));
      const liveIds = new Set(live.map((l) => l.roomId));
      return { live: live.length, bad, drafts, half: live.length > 0 && liveIds.size !== 6 };
    };
    const at = Date.now() + 14_000;
    const p1 = await pvMap(cO, U.DR2, b);
    const [ua, ca] = await Promise.all([
      fanout("undoImport", cO, Array.from({ length: 6 }, () => ({ unitId: U.DR2, batchId: b, reason: "ทดสอบแข่งกัน ย้อนกับสร้าง" })), { procs: 2, at }),
      fanout("createImport", cO, Array.from({ length: 6 }, () => ({ unitId: U.DR2, batchId: b, previewHash: p1?.previewHash })), { procs: 2, at }),
    ]);
    const s1 = await check();
    const p2 = await pvMap(cO, U.DR2, b);
    const at2 = Date.now() + 14_000;
    const [ub, cb] = await Promise.all([
      fanout("undoImport", cO, Array.from({ length: 6 }, () => ({ unitId: U.DR2, batchId: b, reason: "ทดสอบแข่งกัน ย้อนกับสร้าง" })), { procs: 2, at: at2 }),
      fanout("createImport", cO, Array.from({ length: 6 }, () => ({ unitId: U.DR2, batchId: b, previewHash: p2?.previewHash })), { procs: 2, at: at2 }),
    ]);
    const s2 = await check();
    const all = [...ua, ...ca, ...ub, ...cb];
    const ok = r0.c?.ok === true && !badOf(all).length && [s1, s2].every((s) => s.bad === 0 && s.drafts === 0 && !s.half && (s.live === 0 || s.live === 6));
    return [ok, `รอบ1=${J(s1)} รอบ2=${J(s2)} ${tally(all)}`];
  });
  await T("R-5", "สองไฟล์ห้องทับกัน (36 ห้อง ∥ 101–112 + 113/114) พรีวิวทั้งคู่แล้วสร้างพร้อมกัน ⇒ ไม่มีห้อง/สัญญาซ้อน · ฝั่งแพ้ BUSY/STALE_PREVIEW · พรีวิวใหม่แล้วสร้างได้เฉพาะ 2 ห้องใหม่ · รวม ACTIVE 35 · ยอดถือ = ประกันทุกสัญญา", ["uploadImport", "previewImport", "createImport"], async () => {
    const f1 = withPrefix("087");
    const extra = [["113", "ฒ ใหม่", "087-113-4410", "1/5/69", "4500", "9000", "1500", "300", "", "", ""], ["114", "ณ ใหม่", "087-114-4410", "1/5/69", "4500", "9000", "1501", "301", "", "", ""]];
    const u1 = await up(cO, U.DX, csvBytes(f1.headers, f1.rows));
    const u2 = await up(cO, U.DX, csvBytes(f1.headers, [...subset(f1, f1.rows.slice(0, 12).map((r: string[]) => r[0])), ...extra]));
    const p1 = await pvMap(cO, U.DX, u1?.batchId), p2 = await pvMap(cO, U.DX, u2?.batchId);
    const rs = await fanout("createImport", cO, [{ unitId: U.DX, batchId: u1?.batchId, previewHash: p1?.previewHash }, { unitId: U.DX, batchId: u2?.batchId, previewHash: p2?.previewHash }], { procs: 2 });
    for (const [u] of [[u1], [u2]] as any[]) {
      for (let i = 0; i < 3; i++) {
        const g = await fn("getImport")!(cO, { unitId: U.DX, batchId: u?.batchId });
        if (g?.status === "CREATED") break;
        const p = await pvMap(cO, U.DX, u?.batchId);
        await cr(cO, U.DX, u?.batchId, p?.previewHash);
      }
    }
    const leases = await prisma.dormLease.findMany({ where: { tenantId: A, unitId: U.DX, status: { in: ["DRAFT", "ACTIVE", "NOTICE"] } } });
    const perRoom = new Map<string, number>();
    for (const l of leases) perRoom.set(l.roomId, (perRoom.get(l.roomId) ?? 0) + 1);
    let heldBad = 0;
    for (const l of leases) if ((await held(U.DX, l.id)) !== l.depositSatang) heldBad++;
    const rooms = await prisma.hotelRoom.count({ where: { tenantId: A, unitId: U.DX, active: true } });
    const active = leases.filter((l: any) => l.status === "ACTIVE").length;
    return [!badOf(rs).length && [...perRoom.values()].every((n) => n === 1) && rooms === 38 && active === 35 && heldBad === 0 && leases.length === 35, `${tally(rs)} rooms=${rooms} active=${active}/${leases.length} heldBad=${heldBad}`];
  });

  // ═══════════════ A. สิทธิ์ ═══════════════
  console.log("\n── A สิทธิ์ (dorm.import · dorm.lease.manage · Membership สด) ──");
  const NF = new Set(["NOT_FOUND"]);
  await T("A-1", "STAFF มี dorm.view + dorm.lease.manage แต่ไม่มี dorm.import ⇒ uploadImport NOT_FOUND · getImport null · listImports []", ["uploadImport", "getImport", "listImports"], async () => {
    const c = { tenantId: A, actorUserId: STV.id };
    const u = await up(c, U.DE, KCSV);
    const g = await fn("getImport")!(c, { unitId: U.DS, batchId: sBatch });
    const l = await fn("listImports")!(c, { unitId: U.DE });
    return [NF.has(codeOf(u)) && g === null && Array.isArray(l) && l.length === 0, `${codeOf(u)} get=${J(g)?.slice(0, 40)} list=${l?.length}`];
  });
  await T("A-2", "STAFF มี dorm.import แต่ไม่มี dorm.lease.manage ⇒ อัปโหลด/พรีวิวได้ · createImport NOT_FOUND ไม่มีแถวเกิด", ["uploadImport", "previewImport", "createImport"], async () => {
    const c = { tenantId: A, actorUserId: STI.id };
    const small = withPrefix("088");
    const u = await up(c, U.DE, csvBytes(small.headers, subset(small, ["101"])));
    const p = u?.ok ? await pvMap(c, U.DE, u.batchId) : u;
    const a = await bizCounts(A);
    const x = p?.ok ? await cr(c, U.DE, u.batchId, p.previewHash) : p;
    const b = await bizCounts(A);
    return [u?.ok === true && p?.ok === true && NF.has(codeOf(x)) && J(a) === J(b), `${codeOf(u)}/${codeOf(p)}/${codeOf(x)}`];
  });
  await T("A-3", "Membership ยังไม่ตอบรับ (acceptedAt null · OWNER) ⇒ NOT_FOUND · STAFF dorm.import ของหน่วยอื่น ⇒ NOT_FOUND", ["uploadImport"], async () => {
    const a = await up({ tenantId: A, actorUserId: PEND.id }, U.DE, KCSV);
    const b = await up({ tenantId: A, actorUserId: STO.id }, U.DE, KCSV);
    return [NF.has(codeOf(a)) && NF.has(codeOf(b)), `${codeOf(a)}/${codeOf(b)}`];
  });

  // ═══════════════ X. ข้ามร้าน/ข้ามหน่วย ═══════════════
  console.log("\n── X ข้ามร้าน/ข้ามหน่วย (X1) ──");
  await T("X-1", "ร้าน B ใช้ batchId + unitId ของร้าน A ⇒ getImport null · previewImport/createImport/undoImport NOT_FOUND · reason เดียวกับชุดที่ไม่มีจริง", ["getImport", "previewImport", "createImport", "undoImport"], async () => {
    const g = await fn("getImport")!(cB, { unitId: U.DK, batchId: kBatch });
    const p = await pvMap(cB, U.DK, kBatch);
    const c = await cr(cB, U.DK, kBatch, "x");
    const d = await ud(cB, U.DK, kBatch);
    const ghost = await pvMap(cO, U.DK, "ไม่มีชุดนี้จริง");
    return [g === null && [p, c, d].every((r) => NF.has(codeOf(r))) && p?.reason === ghost?.reason && NF.has(codeOf(ghost)), `${J(g)?.slice(0, 30)} ${codeOf(p)}/${codeOf(c)}/${codeOf(d)} reason=${p?.reason === ghost?.reason}`];
  });
  await T("X-2", "ร้าน A ใช้ batchId ของหน่วย DK กับ unitId DS ⇒ NOT_FOUND · หน่วยโรงแรม (HOTEL) ⇒ NOT_FOUND", ["previewImport", "uploadImport"], async () => {
    const a = await pvMap(cO, U.DS, kBatch);
    const b = await up(cO, U.HA, KCSV);
    return [NF.has(codeOf(a)) && NF.has(codeOf(b)), `${codeOf(a)}/${codeOf(b)}`];
  });
  await T("X-3", "ร้าน B นำเข้าไฟล์เดียวกับร้าน A ⇒ ชุดของตัวเอง (batchId ต่าง) · พรีวิวแผน Party ใหม่ 32 (ไม่จับคู่ Party ของร้าน A) · ห้อง 36", ["uploadImport", "previewImport"], async () => {
    const u = await up(cB, U.DB, KCSV);
    const p = u?.ok ? await pvMap(cB, U.DB, u.batchId) : u;
    return [u?.ok === true && u.batchId !== kBatch && p?.plan?.parties === 32 && p?.plan?.rooms === 36 && p?.plan?.leases === 33, `${codeOf(u)} plan=${J(p?.plan)}`];
  });

  // ═══════════════ W. จอ หอ 12 ═══════════════
  console.log("\n── W จอนำเข้าข้อมูลหอ (ภาพ หอ 12) ──");
  let wHtml = "";
  {
    await fn("guessColumns")?.(cO, { unitId: U.DS, batchId: sBatch }, { guesser: { guess: async () => aiMap(11) } });
    const view = fn("getImport") ? await fn("getImport")!(cO, { unitId: U.DS, batchId: sBatch }) : null;
    const preview = fn("previewImport") ? await pvMap(cO, U.DS, sBatch) : null;
    if (ScreenC && view) { try { wHtml = render({ unitSlug: "dorm-d4", view, preview }); } catch (e) { console.log(`  (render ล้ม: ${errMsg(e)})`); } }
  }
  await T("W-1", "โครง: data-dorm-import · หัว 'นำเข้าข้อมูลหอ' · ขั้น 4 (UPLOAD/MAP/CHECK/CREATE) ป้าย อัปโหลด·จับคู่คอลัมน์·ตรวจ·นำเข้า · ลิงก์ดาวน์โหลดแม่แบบ → /dorm/tenants/import/template", [], async () => {
    const steps = boxes(wHtml, "data-import-step").map((b) => b.attrs["data-import-step"]);
    const t = textOf(wHtml);
    return [/data-dorm-import/.test(wHtml) && t.includes("นำเข้าข้อมูลหอ") && J(steps) === J(["UPLOAD", "MAP", "CHECK", "CREATE"]) && ["อัปโหลด", "จับคู่คอลัมน์", "ตรวจ", "นำเข้า", "ดาวน์โหลดแม่แบบ"].every((w) => t.includes(w)) && /href="\/app\/u\/dorm-d4\/dorm\/tenants\/import\/template"/.test(wHtml),
      `steps=${J(steps)} html=${wHtml.length}`];
  }, "CRITICAL", true);
  await T("W-2", "แถบไฟล์ + ตารางจับคู่: data-import-file มีชื่อไฟล์ · '36 แถว' · '11 คอลัมน์' · data-map-col 11 แถว · data-map-source=AI 'ระบบเดาให้ 10/11'", [], async () => {
    const f = boxes(wHtml, "data-import-file")[0];
    const cols = boxes(wHtml, "data-map-col");
    const src = boxes(wHtml, "data-map-source")[0];
    return [!!f && /ทะเบียนหอ ต\.ค\.69\.csv/.test(textOf(f.html)) && /36 แถว/.test(textOf(f.html)) && /11 คอลัมน์/.test(textOf(f.html)) && cols.length === 11 && src?.attrs["data-map-source"] === "AI" && /10\/11/.test(textOf(src.html)),
      `file=${f ? textOf(f.html).slice(0, 80) : "—"} cols=${cols.length} src=${src?.attrs["data-map-source"]}`];
  }, "CRITICAL", true);
  await T("W-3", "ผลตรวจ: data-import-summary data-ready=32 data-warn=3 data-mustfix=1 · ปัญหา DEPOSIT_LEGAL ห้อง 310 MUST_FIX แสดง 'แถว N' · ปุ่ม data-import-create disabled", [], async () => {
    const s = boxes(wHtml, "data-import-summary")[0]?.attrs ?? {};
    const iss = boxes(wHtml, "data-import-issue").find((b) => b.attrs["data-import-issue"] === "DEPOSIT_LEGAL");
    const btn = boxes(wHtml, "data-import-create")[0];
    return [s["data-ready"] === "32" && s["data-warn"] === "3" && s["data-mustfix"] === "1" && iss?.attrs["data-severity"] === "MUST_FIX" && /310/.test(textOf(iss.html)) && new RegExp(`แถว ${rowNoOf("310")}`).test(textOf(iss.html)) && !!btn && "disabled" in btn.attrs,
      `summary=${J(s)} issue=${iss ? textOf(iss.html).slice(0, 80) : "—"} disabled=${btn ? "disabled" in btn.attrs : "ไม่มีปุ่ม"}`];
  }, "CRITICAL", true);
  await T("W-4", "แผน: data-import-plan · structure '1 · 3 · 36' · ผู้เช่า + สัญญา 32 · มิเตอร์ 72 · เงินประกันเปิดยอด (หนี้สิน) ฿296,400 · ค้างยกมา ฿10,200.40 'ยังไม่ออกใบ' · 'ย้อนกลับได้'", [], async () => {
    const pl = boxes(wHtml, "data-import-plan")[0];
    const t = pl ? textOf(pl.html) : "";
    const items = boxes(wHtml, "data-plan-item").map((b) => b.attrs["data-plan-item"]);
    return [!!pl && /1 · 3 · 36/.test(t) && /32/.test(t) && /72/.test(t) && /฿296,400/.test(t) && /หนี้สิน/.test(t) && /฿10,200\.40/.test(t) && /ยังไม่ออกใบ/.test(t) && /ย้อนกลับได้/.test(textOf(wHtml)) && ["structure", "leases", "meters", "arrears", "deposit"].every((k) => items.includes(k)),
      `plan=${t.slice(0, 200)} items=${J(items)}`];
  }, "CRITICAL", true);
  await T("W-5", "จอไม่มีเบอร์เต็ม/เลขบัตร · ไม่มีคำต้องห้าม สคบ. · ไม่มีข้อความ (text node) ที่ขึ้นต้นด้วยสูตร", [], async () => {
    const t = textOf(wHtml);
    const phone = /\b0\d{2}-?\d{3}-?\d{4}\b/.exec(t.replace(/\d{2}-xxx-\d{4}/g, ""));
    const legal = LEGAL_BAD.exec(t);
    const f = textNodes(wHtml).filter((x) => /^[=+@＝＋＠]/.test(x.trim()));
    return [!!wHtml && !phone && !legal && !f.length, `เบอร์=${phone?.[0] ?? "—"} คำต้องห้าม=${legal?.[0] ?? "—"} สูตร=${J(f).slice(0, 120)}`];
  }, "CRITICAL", true);

  // ═══════════════ Q. ฉาก svcqc (ร้าน B) ═══════════════
  console.log("\n── Q ฉากนำเข้า (svcqc ร้าน B · ภาพ หอ 12) ──");
  const runTsx = (file: string, args: string[] = []) => {
    const r = spawnSync("pnpm", ["exec", "tsx", file, ...args], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
    const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
    const m = /SCENE_SUMMARY (\{.*\})/.exec(out);
    let sum: any = null;
    try { sum = m ? JSON.parse(m[1]) : null; } catch { /* อ่านไม่ได้ */ }
    return { status: r.status, out, sum };
  };
  const SC = SV.SQC_IMPORT_SCENE;
  const svcSeeded = (await prisma.tenant.count({ where: { id: { in: [SV.SQC_TENANT.id, SV.SQC_OTHER.tenant.id] } } })) === 2;
  if (!svcSeeded) {
    for (const [id, n] of [["Q-1", "ฉากรันได้"], ["Q-2", "ฉาก 32/3/1 ตรงภาพ 12"], ["Q-3", "รันซ้ำไม่เขียน"]]) skip(id, n, "ร้าน svcqc ยังไม่ seed — รัน scripts/seed-svc-qc.mts ก่อน", "MAJOR");
  } else {
    await T("Q-1", "ฉากนำเข้ารันได้ (exit 0) · SCENE_SUMMARY {created,updated,removed} · ร้าน A ยังมี 4 หน่วย (smoke SM-UNITS)", [], async () => {
      if (!existsSync(join(ROOT, F.scene))) return [false, `ยังไม่มี ${F.scene}`];
      const r = runTsx(F.scene);
      const unitsA = await prisma.businessUnit.count({ where: { tenantId: SV.SQC_TENANT.id } });
      return [r.status === 0 && !!r.sum && ["created", "updated", "removed"].every((k) => typeof r.sum[k] === "number") && unitsA === 4, `exit=${r.status} ${r.sum ? J(r.sum) : r.out.split("\n").slice(-4).join(" | ").slice(0, 240)} unitsA=${unitsA}`];
    }, "MAJOR");
    await T("Q-2", "ฉาก (other-owner): ชุดล่าสุดของหน่วยฉาก ขั้น MAP (confirmed false) · ชีต ผู้เช่า 36 แถว 11 คอลัมน์ + มิเตอร์ · เดา 10/11 · พร้อม 32 เตือน 3 ต้องแก้ 1 · แผน 1·3·36 · 32 · 72 · ฿296,400", ["listImports", "getImport"], async () => {
      const ctx = { tenantId: SC.tenantId, actorUserId: SV.SQC_OTHER.owner.userId };
      const l = await fn("listImports")!(ctx, { unitId: SC.unit.id });
      const g = l?.[0] ? await fn("getImport")!(ctx, { unitId: SC.unit.id, batchId: l[0].batchId }) : null;
      const p = g?.plan, s = g?.summary;
      const ok = !!g && g.confirmed === false && g.status === "DRAFT" && g.fileName === SC.fileName && g.rowCount === 36 && g.columnCount === 11 && J((g.sheets ?? []).map((x: any) => x.name)) === J(SC.sheets)
        && g.proposal?.guessed === 10 && s?.ready === 32 && s?.warn === 3 && s?.mustFix === 1 && p?.buildings === 1 && p?.floors === 3 && p?.rooms === 36 && p?.leases === 32 && p?.meters === 72 && p?.depositSatang === 29_640_000;
      return [ok, `${J(g && { st: g.status, c: g.confirmed, f: g.fileName, sh: g.sheets, pr: g.proposal, s, p })}`];
    }, "MAJOR");
    await T("Q-3", "รันฉากซ้ำ ⇒ SCENE_SUMMARY 0/0/0", [], async () => {
      if (!existsSync(join(ROOT, F.scene))) return [false, `ยังไม่มี ${F.scene}`];
      const r = runTsx(F.scene);
      return [r.status === 0 && r.sum?.created === 0 && r.sum?.updated === 0 && r.sum?.removed === 0, `exit=${r.status} ${J(r.sum)}`];
    }, "MAJOR");
  }

  // ═══════════════ V. ภาพ ═══════════════
  console.log("\n── V ภาพนำเข้าข้อมูลหอ (ภาพ หอ 12) ──");
  {
    const specs = SV.SQC_VISUAL_SPECS?.["d.4"];
    const base = process.env.QC_BASE ?? "";
    const name = "ภาพ dorm-import 1440 + 390 ด้วยผู้ใช้ other-owner (ร้าน B · หน่วยฉาก) · HTTP < 400 · ไม่ล้นแนวนอน";
    if (!Array.isArray(specs) || !specs.some((s: any) => s.path === `/app/u/${SC.unit.slug}/dorm/tenants/import`)) fail("V-1", name, `ไม่มี SQC_VISUAL_SPECS d.4 ${J(specs)}`, "MAJOR");
    else if (!base) skip("V-1", name, "ไม่มี QC_BASE — ผู้คุม build QC ผ่าน iso + reseed + รันฉาก แล้วรันซ้ำด้วย QC_BASE=http://127.0.0.1:<port>", "MAJOR");
    else {
      const r = spawnSync("pnpm", ["exec", "tsx", "scripts/visual-svc.mts", "d.4", "--user", "other-owner", "--base", base], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
      const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
      if (r.status === 0) pass("V-1", `${name} (ภาพ .qc-shots/svc/d.4 — ผู้คุมเทียบ PARITY กับ ledger/design-dorm/12-import-excel.png)`);
      else fail("V-1", name, `exit=${r.status} ${out.split("\n").filter((l) => l.includes("❌")).slice(0, 3).join(" | ").slice(0, 300)}`, "MAJOR");
    }
  }
} catch (e) {
  fail("CRASH", "จบกลางทาง", errMsg(e), "CRITICAL");
} finally {
  try { await cleanup(tenantIds); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); }
  try { await prisma.user.deleteMany({ where: { email: { startsWith: "svc-d4-" } } }); } catch (e) { console.log(`  ⚠️ cleanup users: ${errMsg(e)}`); }
  try {
    const left = await leftovers(tenantIds);
    if (!left.length) pass("Z-1", `ล้างครบ: ทุกตารางที่มี tenantId ของร้านทดสอบ ${tenantIds.length} ร้าน + ผู้ใช้ svc-d4-* = 0 แถว (ฉาก svcqc คงไว้ให้ถ่ายภาพ — ล้างด้วย scripts/svc-qc-import-scene.mts --clear)`);
    else fail("Z-1", "ล้างครบ", J(left), "MAJOR");
  } catch (e) { fail("Z-1", "ล้างครบ", `ตรวจไม่ได้: ${errMsg(e)}`, "MAJOR"); }
  // ═══════════════ G. regression — รันหลังล้างร้านทดสอบ (บทเรียน ORACLE-EDIT G order ของ D.5) ═══════════════
  try {
    console.log(`\n── G regression (ลูกโพรเซส · env เดียวกัน · หลังล้างข้อมูล · ผ่าน = JSON_SUMMARY ไม่มี failed / exit 0) ──`);
    const G: [string, string, string[]][] = [["G-1", "qc-svc-d.5", []], ["G-2", "qc-svc-d.6", []], ["G-3", "qc-svc-d.1", []], ["G-4", "qc-svc-d.8", ["--no-regression"]], ["G-5", "qc-svc-d.13", ["--no-regression"]], ["G-6", "qc-svc-smoke", []]];
    for (const [id, f, args] of G) {
      if (NO_REG) { skip(id, `regression ${f}`, "--no-regression / SVC_D4_NO_REGRESSION=1", "CRITICAL"); continue; }
      const r = spawnSync("pnpm", ["exec", "tsx", `scripts/${f}.mts`, ...args], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
      const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
      const js = [...out.matchAll(/JSON_SUMMARY (\{.*\})/g)].map((m) => m[1]).pop();
      let sum: any = null;
      try { sum = js ? JSON.parse(js) : null; } catch { /* อ่านไม่ได้ */ }
      const ok = r.status === 0 && (!js || (!!sum && Array.isArray(sum.failed) && sum.failed.length === 0));
      if (ok) pass(id, `regression ${f}${args.length ? ` ${args.join(" ")}` : ""} ไม่มีข้อแดง (${sum ? `${sum.passed}/${sum.total}` : "exit 0"})`);
      else fail(id, `regression ${f} ไม่มีข้อแดง`, `exit=${r.status} failed=${J(sum?.failed)} · ${out.split("\n").filter((l) => l.includes("❌")).slice(0, 3).join(" | ").slice(0, 300)}`, "CRITICAL");
    }
  } catch (e) { fail("G-CRASH", "หมวด G จบกลางทาง", errMsg(e), "CRITICAL"); }
  await prisma.$disconnect();
}

const failed = cks.filter((c) => c.res === "FAIL");
const skipped = cks.filter((c) => c.res === "SKIP");
const passed = cks.length - failed.length - skipped.length;
console.log(`\n===== QC SVC D.4 · นำเข้า Excel =====\nผ่าน ${passed}/${cks.length}${skipped.length ? ` (SKIP ${skipped.length})` : ""}`);
console.log(`FINDINGS: CRITICAL ${failed.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${failed.filter((c) => c.sev === "MAJOR").length} · MINOR ${failed.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id) })}`);
// exit 0 เมื่อไม่มีข้อแดง · รับใบ = ผ่านทุกข้อ (SKIP ที่ยอมได้: V-1 ไม่มี QC_BASE · Q-* ไม่ได้ seed · G-* เมื่อ --no-regression — ผู้คุมรันซ้ำครบก่อนรับ)
process.exit(failed.length > 0 ? 1 : 0);
