// QC — SVC D.5 · ผู้เช่า · สัญญา · เงินประกัน · oracle ของผู้คุม — builder ห้ามแก้ไฟล์นี้
// สัญญา: ledger/svc-briefs/svc-brief-d.5.md · ledger/SVC-MASTER-PLAN.md แถว D.5 · ledger/DESIGN-DORM-HOTEL.md §3 A2 + ภาคผนวก ก หอ #6 #40–52 · CC §5.3 §6.2 §7 §8
//
// กลุ่มข้อ:
//   S  โครงสร้าง: ไฟล์ · facade · จอไม่ลาก server · ด่านหน้า/action · สิทธิ์ · ทะเบียน event · entity อนุมัติ · F5/F2 · snapshot keys · คำต้องห้าม สคบ.
//   PC positive control (ต้องเขียวตั้งแต่ก่อนมีงาน): EXCLUDE ของห้อง · postSecurityDeposit · ตัวตรวจกฎหมาย 3 โหมด · snapshot เปลี่ยนตามค่าตั้ง · ลิงก์ไฟล์ส่วนตัว · ข้อบังคับ · ตัวยิง 4 โพรเซส
//   L  ตัวกั้นประกัน+ล่วงหน้าตามโหมด (STRICT บล็อก · WARN ต้องยอมรับ+อนุมัติขั้นเจ้าของ · นอกขอบเขต) — ไม่มีแถวเกิดเมื่อปฏิเสธ
//   C  สัญญา: ข้อบังคับ 7 ข้อถ้อยคำตรงตัวเสมอ · แก้/ทับไม่ได้ · คำต้องห้ามบล็อกทุกโหมด · ข้อความสัญญาไม่เปลี่ยนตามค่าตั้งภายหลัง
//   N  policySnapshot ไม่เปลี่ยนเมื่อแก้ค่าตั้ง (positive: สัญญาใหม่ได้ค่าใหม่) · moveIn ใช้ค่าใน snapshot
//   R  ห้อง: ROOM_TAKEN จากฐาน (EXCLUDE) · ช่วงวัน · 12 ทางจาก 4 โพรเซส = 1 สัญญา · ยกเลิกร่างคืนห้อง
//   P  ผู้เช่า = Party: หาซ้ำเบอร์/เลขบัตร · 12 ทางเบอร์ใหม่เดียวกัน = Party 1 · ไม่มีเบอร์เต็ม/เลขบัตรใน DTO
//   M  เงินประกัน: เงินจองหักเข้าประกัน · postSecurityDeposit ยอดรวม = ประกันพอดี · ซ้ำ/พร้อมกัน/สลับกัน = ครั้งเดียว · ไม่ผูกบัญชี = ไม่เปลี่ยนอะไร · ผูกผู้เช่า (F3)
//   F  ไฟล์ส่วนตัว + ลิงก์หมดอายุ (X10) · รูปวันเข้า ≥ N · ลงชื่อครั้งเดียว · event dorm.lease.signed · มิเตอร์วันเข้า
//   // ORACLE-EDIT 29 ต.ค. (review รอบ 2) (/root/svc-runs/fix/d5.md K8 K9): C-10 C-11 · P-11 · M-13 M-14
//   A  สิทธิ์ (leaseAccess · Membership สด) · X ข้ามร้าน/ข้ามหน่วย · U จอ หอ 02 (renderToStaticMarkup) · Q ฉาก svcqc · V ภาพ · G regression · Z ล้างครบ
//   // ORACLE-EDIT 29 ต.ค. (review) (/root/svc-runs/fix/d5.md K1–K7): PC-8 · L-14 · C-7 C-8 C-9 · P-8 P-9 P-10 · M-10 M-11 M-12 (≥ 20–30 คำขอใน **โพรเซสเดียว** เกิน pool 10 + รุ่นข้ามโพรเซส) · F-10 · U-5
//
// ข้อมูลทดสอบใต้ร้านชั่วคราว slug `qc-svc-d5-*` + ผู้ใช้ `svc-d5-*@shark.local` · ลบใน finally ทุกตารางที่มี tenantId (วนจน FK ไม่ค้าง)
// ข้อพร้อมกัน (R-4 P-5 M-4 M-7 F-8) ยิงจาก 4 โพรเซสลูกของไฟล์นี้เอง (`--child`) × 3 คำขอ = 12 ทาง (การเชื่อมต่อฐานแยกกันจริง)
// รัน: bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-d.5.mts
//      ต่อท้าย `--no-regression` ข้ามหมวด G (SKIP — ไม่นับผ่าน · iso.sh ทิ้ง env จึงใช้ SVC_D5_NO_REGRESSION=1 ผ่าน iso ไม่ได้)
/* eslint-disable @typescript-eslint/no-explicit-any */
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const SELF = fileURLToPath(import.meta.url);
const ROOT = join(dirname(SELF), "..");
const LABEL = "qc-svc-d.5";
const SVC_HOST = "ep-mute-scene";
const FORBIDDEN_HOSTS = ["ep-royal-night", "ep-plain-art", "ep-cool-shadow", "ep-weathered-river", "ep-frosty-lab", "ep-fragrant-thunder"];
const RUN_CMD = "bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-d.5.mts";

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
// ลิงก์ไฟล์ส่วนตัวเซ็นด้วย SESSION_SECRET (อ่านตอนเรียก) — qc-svc.sh ไม่ส่งค่านี้ ⇒ ตั้งค่าสุ่มของรอบ (ลูกโพรเซสได้ค่าเดียวกันทาง env)
if ((process.env.SESSION_SECRET ?? "").length < 32) process.env.SESSION_SECRET = randomBytes(32).toString("hex");

const DORM_IDX = "src/lib/modules/dorm/index.ts";
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 260);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9]);
const putNoop = async () => {};

// ═══════════════ โหมดลูก (`--child <base64 JSON>`) — ยิงคำขอพร้อมกันจากโพรเซสแยก ═══════════════
const CHILD_AT = process.argv.indexOf("--child");
if (CHILD_AT >= 0) {
  let out: unknown[] = [];
  try {
    const job = JSON.parse(Buffer.from(process.argv[CHILD_AT + 1] ?? "", "base64url").toString("utf8")) as { op: string; ctx: unknown; inputs: any[]; at: number; files: boolean };
    let f: unknown;
    if (job.op === "__pc_claimRoom") {
      // positive control ของตัวยิงหลายโพรเซส (PC-7) — ไม่ใช้ facade หอ
      const rooms = (await import("@/lib/modules/rooms" as string)) as any;
      const { prisma } = (await import("@/lib/core/db" as string)) as any;
      f = (_ctx: unknown, input: unknown) => prisma.$transaction((tx: unknown) => rooms.claimRoom(tx, input));
    } else {
      const dorm = (await import(pathToFileURL(join(ROOT, DORM_IDX)).href)) as Record<string, unknown>;
      f = dorm[job.op];
    }
    if (typeof f !== "function") out = job.inputs.map(() => ({ childFail: `facade ไม่มี ${job.op}` }));
    else {
      const mat = (x: any) => {
        const o = { ...x };
        if (typeof o.paidAt === "string") o.paidAt = new Date(o.paidAt);
        if (o.file === "PNG") o.file = { data: PNG, contentType: "image/png" };
        return o;
      };
      const wait = job.at - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      out = await Promise.all(job.inputs.map(async (x) => {
        try { return await (f as (...a: unknown[]) => Promise<unknown>)(job.ctx, mat(x), job.files ? { put: putNoop } : undefined); }
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
const THAI = /[฀-๿]/;
const LEGAL_BAD = /ล็อ[กค]ห้อง|ล็อ[กค]ประตู|ตัดน้ำ|ตัดไฟ|ระงับ(การ)?(จ่าย)?(น้ำ|ไฟ)|งด(จ่าย)?(น้ำ|ไฟ)|ยึดทรัพย์|ขนของออก/;
const NO_REG = process.argv.includes("--no-regression") || process.env.SVC_D5_NO_REGRESSION === "1";

// ═══════════════ วันที่ (วันไทย · ข้อความ YYYY-MM-DD) ═══════════════
const DAY = 86_400_000;
const bkkYmd = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const TODAY = bkkYmd(new Date());
const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const D = (n: number) => addDays(TODAY, n);
const dbDate = (ymd: string) => new Date(`${ymd}T00:00:00Z`);
const ymdOf = (d: unknown) => (d instanceof Date ? d.toISOString().slice(0, 10) : typeof d === "string" ? d.slice(0, 10) : "");
/** วันสุดท้ายของสัญญา (รวมวันนั้น) = start + months (วันเดียวกัน · เกินสิ้นเดือน ⇒ สิ้นเดือน) − 1 วัน — ใบสั่ง §2.2 */
const leaseEnd = (start: string, months: number) => {
  const y = Number(start.slice(0, 4)), m = Number(start.slice(5, 7)) - 1 + months, d = Number(start.slice(8, 10));
  const yy = y + Math.floor(m / 12), mm = ((m % 12) + 12) % 12;
  const dim = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();
  const nx = new Date(Date.UTC(yy, mm, Math.min(d, dim))).toISOString().slice(0, 10);
  return addDays(nx, -1);
};
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);

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
const STO: any = await tryImport("@/lib/storage/service");
const APS: any = await tryImport("@/lib/modules/approval/service");

const SCREEN_FILE = "src/components/dorm/TenantsScreen.tsx";
let screenMod: any = null;
let screenWhy = "";
if (!existsSync(join(ROOT, SCREEN_FILE))) screenWhy = `ยังไม่มี ${SCREEN_FILE}`;
else { try { screenMod = await import(pathToFileURL(join(ROOT, SCREEN_FILE)).href); } catch (e) { screenWhy = `import TenantsScreen ล้ม: ${errMsg(e)}`; } }
const React = (await import("react" as string)) as any;
const RDS = (await import("react-dom/server" as string)) as any;
const ScreenC: any = screenMod ? (typeof screenMod.default === "function" ? screenMod.default : typeof screenMod.TenantsScreen === "function" ? screenMod.TenantsScreen : null) : null;
if (screenMod && !ScreenC && !screenWhy) screenWhy = "TenantsScreen.tsx ไม่มี default export / export TenantsScreen ที่เป็นคอมโพเนนต์";

/** ตัวรันข้อ — needs = ชื่อฟังก์ชันใน facade dorm (ขาด = FAIL ไม่ใช่ SKIP) · ui = ต้องใช้คอมโพเนนต์ */
async function T(id: string, name: string, needs: string[], body: () => Promise<[boolean, string?]>, sev: Sev = "CRITICAL", ui = false) {
  const miss = needs.filter((n) => !fn(n));
  if (miss.length) return fail(id, name, dorm ? `facade dorm ไม่มี ${miss.join(", ")}` : dormWhy, sev);
  if (ui && !ScreenC) return fail(id, name, screenWhy || "ไม่มีคอมโพเนนต์ TenantsScreen", sev);
  try {
    const [ok, why] = await body();
    if (ok) pass(id, name); else fail(id, name, why ?? "ไม่ตรง", sev);
  } catch (e) {
    fail(id, name, `throw: ${errMsg(e)}`, sev);
  }
}
const codeOf = (r: any) => (r && r.ok === false ? String(r.code) : r?.ok === true ? "OK" : r?.threw ? `THREW(${r.threw})` : J(r).slice(0, 80));
const failOk = (r: any, code: string) => r?.ok === false && r?.code === code && typeof r?.reason === "string" && THAI.test(r.reason) && !/prisma|invalid `|Unique constraint|violates/i.test(r.reason);

// ═══════════════ ตัวช่วย render ═══════════════
const render = (props: Record<string, unknown>): string => String(RDS.renderToStaticMarkup(React.createElement(ScreenC, props))).replace(/<!-- -->/g, "");
const unesc = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'");
const textOf = (html: string) => unesc(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
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

// ═══════════════ ล้างข้อมูล: ทุกตารางที่มี "tenantId" (วนหลายรอบจน FK RESTRICT ไม่ค้าง) + ผู้ใช้ทดสอบ ═══════════════
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
  const soft = async (f: () => Promise<unknown>) => { try { await f(); } catch { /* ตารางอาจไม่มีคอลัมน์ — ไม่เป็นไร */ } };
  // ตัดการอ้างตัวเองของตารางบัญชีก่อน (FK ภายในตารางเดียวกัน)
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
  const un = await prisma.user.count({ where: { email: { startsWith: "svc-d5-" } } });
  if (un) out.push({ table: "User(svc-d5-*)", n: un });
  return out;
}

// ═══════════════ ยิงพร้อมกันจาก 4 โพรเซส × 3 คำขอ ═══════════════
async function fanout(op: string, ctx: unknown, inputs: any[], opts: { procs?: number; files?: boolean } = {}): Promise<any[]> {
  const procs = opts.procs ?? 4;
  const per = Math.ceil(inputs.length / procs);
  const at = Date.now() + 14_000;
  const jobs = Array.from({ length: procs }, (_, p) => ({ op, ctx, inputs: inputs.slice(p * per, p * per + per), at, files: !!opts.files })).filter((j) => j.inputs.length);
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

// ═══════════════ เลขบัตรประชาชน (เลขตรวจถูก) · เบอร์ไม่ซ้ำต่อรอบ ═══════════════
const thaiId = (first12: string) => {
  const d = first12.split("").map(Number);
  const s = d.reduce((a, x, i) => a + x * (13 - i), 0);
  return `${first12}${(11 - (s % 11)) % 10}`;
};
const RUNNUM = 100000 + Math.floor(Math.random() * 800000);
let seq = 0;
const newPhone = () => `08${String((RUNNUM % 1000) * 100000 + ++seq).padStart(8, "0").slice(-8)}`; // ORACLE-EDIT 29 ต.ค. (review): เดิมวนซ้ำทุก 100 เบอร์ ⇒ ชนเบอร์คนอื่น (K3 จะถามยืนยัน)
const newIdCard = () => thaiId(`1${String(RUNNUM).padStart(6, "0")}${String(++seq).padStart(5, "0")}`.slice(0, 12));

const tenantIds: string[] = [];
// ORACLE-EDIT 29 ต.ค. (G order): นับ outbox ที่ค้าง (PENDING) — ทั้งฐาน / เฉพาะร้านทดสอบ
let pendingAtOldG: { all: number; mine: number } | null = null;
async function pendingOutbox(tids: string[]): Promise<{ all: number; mine: number }> {
  const all = await prisma.outboxEvent.count({ where: { status: "PENDING" } });
  const mine = tids.length ? await prisma.outboxEvent.count({ where: { status: "PENDING", tenantId: { in: tids } } }) : 0;
  return { all, mine };
}
try {
  const stale = await prisma.tenant.findMany({ where: { slug: { startsWith: "qc-svc-d5-" } }, select: { id: true } });
  if (stale.length) { console.log(`  (กวาด tenant ค้างจากรอบก่อน ${stale.length})`); await cleanup(stale.map((t: { id: string }) => t.id)); }
  await prisma.user.deleteMany({ where: { email: { startsWith: "svc-d5-" } } });

  // ═══════════════ S. โครงสร้าง ═══════════════
  console.log("\n── S โครงสร้าง ──");
  const F = {
    lease: "src/lib/modules/dorm/lease.ts",
    access: "src/lib/modules/dorm/lease-access.ts",
    index: DORM_IDX,
    screen: SCREEN_FILE,
    page: "src/app/app/u/[unitSlug]/dorm/tenants/page.tsx",
    newPage: "src/app/app/u/[unitSlug]/dorm/tenants/new/page.tsx",
    print: "src/app/app/u/[unitSlug]/dorm/tenants/[leaseId]/print/page.tsx",
    actions: "src/app/app/u/[unitSlug]/dorm/tenants/actions.ts",
    scene: "scripts/svc-qc-lease-scene.mts",
  };
  {
    const miss = Object.values(F).filter((p) => !existsSync(join(ROOT, p)));
    chk("S-1", "มีไฟล์ของใบครบ (lease.ts · lease-access.ts · index.ts · TenantsScreen.tsx · tenants/page · new/page · print/page · actions.ts · ฉาก svc-qc-lease-scene.mts)", !miss.length, `ขาด ${miss.join(", ")}`, "CRITICAL");
  }
  const API = ["createLease", "findTenantCandidates", "receiveBookingFee", "moveIn", "signLease", "addLeaseFiles", "leaseFileLinks", "getLease", "listLeases", "leaseContract", "cancelLease", "updateLeaseOccupants", "leaseAccess"];
  {
    const miss = API.filter((n) => !fn(n));
    chk("S-2", "facade @/lib/modules/dorm export ครบ 13 ชื่อ (§3 §5)", !miss.length, dorm ? `ขาด ${miss.join(", ")}` : dormWhy, "CRITICAL");
  }
  const importsOf = (src: string) => [...src.matchAll(/^\s*import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/gm)].map((m) => ({ typeOnly: !!m[1], spec: m[2] }))
    .concat([...src.matchAll(/^\s*import\s+["']([^"']+)["']/gm)].map((m) => ({ typeOnly: false, spec: m[1] })))
    .concat([...src.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)].map((m) => ({ typeOnly: false, spec: m[1] })));
  const screenSrc = read(F.screen);
  {
    const BAD = (s: string) => /^@prisma\//.test(s) || /^@\/lib\/core\/(db|tenant-db|outbox|settings|context|session)/.test(s) || /^@\/lib\/modules\//.test(s) || /^@\/lib\/(platform|automation|webhooks|storage)\//.test(s) || /actions$/.test(s) || /^next\/(navigation|headers)$/.test(s);
    const bad = importsOf(screenSrc).filter((i) => !i.typeOnly && BAD(i.spec)).map((i) => i.spec);
    const prismaWord = /\bprisma\b|tenantDb\(/.test(stripComments(screenSrc));
    chk("S-3", "TenantsScreen.tsx: ไม่ import prisma/โมดูล server/actions/next navigation|headers (ได้เฉพาะ import type) — render ด้วย renderToStaticMarkup ได้",
      !!screenSrc && !bad.length && !prismaWord, screenSrc ? `import ต้องห้าม=${bad.join(",") || "—"} prisma=${prismaWord}` : "ยังไม่มีไฟล์", "CRITICAL");
  }
  const gateOk = (p: string, prop: "view" | "manage") => !!p && !/^\s*["']use client["']/.test(p) && /requireUnit\s*\(/.test(p) && /["']DORM["']/.test(p) && /notFound\s*\(/.test(p)
    && /leaseAccess\s*\(/.test(p) && new RegExp(`\\.${prop}\\b`).test(p) && /from\s+["']@\/lib\/modules\/dorm["']/.test(p) && !/["']@\/lib\/modules\/dorm\//.test(p) && !/@\/lib\/core\/db|@prisma\//.test(p);
  {
    const p = read(F.page);
    const ok = gateOk(p, "view") && /TenantsScreen/.test(p) && /listLeases\s*\(/.test(p) && /getLease\s*\(/.test(p);
    chk("S-4", "หน้า /dorm/tenants: server · requireUnit + DORM · leaseAccess(...).view ไม่ผ่าน ⇒ notFound · listLeases/getLease ผ่าน facade · ส่งเข้า TenantsScreen · ไม่แตะ prisma", ok, p ? "ขาดด่าน/facade/คอมโพเนนต์ (ดู §7)" : "ยังไม่มีไฟล์", "CRITICAL");
  }
  {
    const a = read(F.actions);
    const code = stripComments(a);
    const firstUseServer = /^\s*["']use server["']/.test(code);
    const exportsAll = [...code.matchAll(/^\s*export\s+(?!async\s+function)(\S+)/gm)].map((m) => m[1]);
    const names = ["createLeaseAction", "receiveBookingFeeAction", "addLeaseFilesAction", "signLeaseAction", "moveInAction", "cancelLeaseAction"].filter((n) => !new RegExp(`export\\s+async\\s+function\\s+${n}\\b`).test(code));
    const gate = /requireUnit\s*\(/.test(code) && /leaseAccess\s*\(/.test(code) && /\.manage\b/.test(code);
    const trustInput = /input\??\.tenantId|tenantId\s*:\s*input\.|input\??\.actorUserId/.test(code);
    chk("S-5", "actions.ts: 'use server' · export async function เท่านั้น (6 ชื่อ) · ด่าน requireUnit + leaseAccess(...).manage · ร้าน/ผู้กระทำจาก session ไม่รับจาก input",
      !!a && firstUseServer && !exportsAll.length && !names.length && gate && !trustInput, a ? `use server=${firstUseServer} export อื่น=${exportsAll.join(",") || "—"} ขาด=${names.join(",") || "—"} ด่าน=${gate} รับจาก input=${trustInput}` : "ยังไม่มีไฟล์", "CRITICAL");
  }
  {
    const n = read(F.newPage), pr = read(F.print);
    const ok = gateOk(n, "manage") && gateOk(pr, "view") && /leaseContract\s*\(/.test(pr);
    chk("S-6", "หน้า new (leaseAccess.manage) + print (leaseAccess.view · leaseContract) มีด่าน requireUnit + DORM + notFound · ผ่าน facade", ok, `new=${gateOk(n, "manage")} print=${gateOk(pr, "view")} leaseContract=${/leaseContract\s*\(/.test(pr)}`, "MAJOR");
  }
  {
    let why = "";
    try {
      const pm = (await import("@/lib/core/permissions" as string)) as any;
      const k = "dorm.lease.manage";
      if (!pm.isPermissionKey?.(k)) why += `${k} ไม่อยู่ในทะเบียน · `;
      else { const l = pm.permissionLabel?.(k); if (typeof l !== "string" || l === k || !THAI.test(l)) why += `${k} ไม่มีป้ายไทย · `; }
      if (pm.moduleOfPermissionKey?.(k) !== "dorm") why += `moduleOfPermissionKey=${pm.moduleOfPermissionKey?.(k)} · `;
    } catch (e) { why = `import permissions ล้ม: ${errMsg(e)}`; }
    chk("S-7", "permissions.ts: โมดูล dorm · คีย์ dorm.lease.manage ป้ายไทย", !why, why, "MAJOR");
  }
  const EV = "dorm.lease.signed";
  {
    let why = "";
    try {
      const oc = (await import("@/lib/outbox-consumers" as string)) as any;
      const al = (await import("@/lib/automation/labels" as string)) as any;
      const wl = (await import("@/lib/webhooks/labels" as string)) as any;
      const a = typeof oc.consumers?.[EV] === "function";
      const lab = Array.isArray(al.AUTOMATION_EVENTS) ? al.AUTOMATION_EVENTS.find((e: { value: string }) => e.value === EV) : null;
      const c = Array.isArray(wl.WEBHOOK_EVENTS) && wl.WEBHOOK_EVENTS.some((e: { value: string }) => e.value === EV);
      const early = ["dorm.lease.renewed", "dorm.lease.ended"].filter((x) => typeof oc.consumers?.[x] === "function");
      if (!(a && lab && THAI.test(lab.label ?? "") && c) || early.length) why = `consumers=${a} automation=${!!lab} ป้ายไทย=${THAI.test(lab?.label ?? "")} webhooks=${c} ลงล่วงหน้า=${early.join(",") || "—"}`;
    } catch (e) { why = `import ทะเบียนล้ม: ${errMsg(e)}`; }
    chk("S-8", `event ${EV} ลง 3 ทะเบียน (ป้ายไทย) · ไม่ลง renewed/ended ล่วงหน้า (D.12)`, !why, why, "MAJOR");
  }
  {
    let why = "";
    try {
      const l = (await import("@/lib/modules/approval/labels" as string)) as any;
      const e = (l.ENTITY_TYPES ?? []).find((x: any) => x.value === "dorm.lease.legal_override");
      if (!e || !THAI.test(e.label ?? "")) why += "labels.ts ไม่มี dorm.lease.legal_override (ป้ายไทย) · ";
      if (!/["']dorm\.lease\.legal_override["']/.test(stripComments(read("src/lib/modules/approval/actions.ts")))) why += "approval/actions.ts allowlist ไม่มี · ";
    } catch (e) { why = `import approval labels ล้ม: ${errMsg(e)}`; }
    chk("S-9", "approval entityType dorm.lease.legal_override ลง labels (ป้ายไทย) + allowlist สร้างสายอนุมัติ", !why, why, "MAJOR");
  }
  const dormSrcFiles = [F.lease, F.access, F.index];
  {
    const leaseSrc = stripComments(read(F.lease));
    const raw = dormSrcFiles.filter((f) => /import\s*\{[^}]*\bprisma\b[^}]*\}\s*from\s+["']@\/lib\/core\/db["']/.test(read(f)));
    const anyUse = dormSrcFiles.concat([F.screen, F.page, F.newPage, F.print, F.actions]).filter((f) => /:\s*any\b|as\s+any\b|<any>/.test(stripComments(read(f))));
    const getDay = dormSrcFiles.concat([F.screen]).filter((f) => /\.getDay\(\)|\.getDate\(\)|\.getMonth\(\)/.test(stripComments(read(f))));
    const par = /Promise\.all(Settled)?\s*\([\s\S]{0,400}?(postSecurityDeposit|settleSecurityDeposit|recordExternalPayment)/.test(leaseSrc);
    chk("S-10", "ไฟล์หอใหม่: ไม่ import prisma ดิบ (F5.1) · ไม่มี any · ไม่มี getDay/getDate/getMonth ดิบ · เงินหอไม่ยิง Promise.all (หนี้ D.2 N2)",
      !!leaseSrc && !raw.length && !anyUse.length && !getDay.length && !par, leaseSrc ? `prisma ดิบ=${raw.join(",") || "—"} any=${anyUse.join(",") || "—"} getDay=${getDay.join(",") || "—"} Promise.all เงิน=${par}` : "ยังไม่มี lease.ts", "MAJOR");
  }
  {
    const fit = read("scripts/fitness.mts");
    const used = new Set<string>();
    const deep: string[] = [];
    for (const f of dormSrcFiles) for (const i of importsOf(read(f))) {
      const m = /^@\/lib\/modules\/([^/]+)(\/.*)?$/.exec(i.spec);
      if (!m || m[1] === "dorm" || i.typeOnly) continue;
      used.add(m[1]);
      if (m[2]) deep.push(i.spec);
    }
    const missing = [...used].filter((x) => !fit.includes(`"dorm→${x}"`));
    const ok = existsSync(join(ROOT, F.lease)) && !missing.length && !deep.length && ["rooms", "account", "party"].every((x) => used.has(x));
    chk("S-11", "เส้นข้ามโมดูลของหอมีใน ALLOWED_EDGES ครบ · ใช้ rooms/account/party ผ่าน facade (ไม่ล้วง subpath)", ok,
      existsSync(join(ROOT, F.lease)) ? `ใช้=${[...used].join(",") || "—"} ขาดใน allowlist=${missing.join(",") || "—"} ล้วงลึก=${deep.join(",") || "—"}` : "ยังไม่มี lease.ts", "MAJOR");
  }
  {
    const m = stripComments(read(F.lease));
    const need: [string, RegExp][] = [["claimRoom", /claimRoom\s*\(/], ["releaseOccupancy", /releaseOccupancy\s*\(/], ["postSecurityDeposit(InTx)", /postSecurityDeposit(InTx)?\s*\(/] /* ORACLE-EDIT 29 ต.ค. (review) K1: รุ่นรับ tx */, ["evaluateLegal", /evaluateLegal\s*\(/],
      ["MANDATORY_CLAUSES", /MANDATORY_CLAUSES/], ["snapshotPolicy", /snapshotPolicy\s*\(/], ["findOrCreate", /findOrCreate\s*\(/], ["uploadFile private", /visibility\s*:\s*["']private["']/],
      ["privateFileUrl", /privateFileUrl\s*\(/], ["emitOutbox", /emitOutbox\s*\(/], ["submitForApproval", /submitForApproval\s*\(/], ["advisory lock", /pg_advisory_xact_lock/]];
    const miss = need.filter(([, re]) => !re.test(m)).map(([n]) => n);
    chk("S-12", "lease.ts ใช้ชิ้นเดิม: claimRoom/releaseOccupancy · postSecurityDeposit · evaluateLegal + MANDATORY_CLAUSES · snapshotPolicy · party.findOrCreate + advisory lock · ไฟล์ private + privateFileUrl · emitOutbox · submitForApproval", !!m && !miss.length, m ? `ขาด ${miss.join(", ")}` : "ยังไม่มี lease.ts", "MINOR");
  }
  {
    const S = SET?.SNAPSHOT_KEYS?.lease ?? [];
    const want = ["rooms.lease.contractTemplate", "rooms.lease.extraClauses", "rooms.lease.moveInPhotosMin", "rooms.lease.reservationAppliesTo", "rooms.lease.signMethod", "rooms.legal.mode", "rooms.rent.monthly", "rooms.lateFee.amount", "rooms.billing.dueDay", "rooms.deposit.months", "rooms.lease.advanceMonths", "rooms.services.catalog"];
    const miss = want.filter((k) => !S.includes(k));
    chk("S-13", "SNAPSHOT_KEYS.lease มี 5 คีย์ใหม่ของใบ (แม่แบบ · ข้อเพิ่ม · รูปวันเข้า · เงินจองหักเข้า · วิธีลงชื่อ — ORACLE-EDIT 29 ต.ค. K7) + คีย์เดิมของ D.1 ไม่หาย", !miss.length, `ขาด ${miss.join(", ")}`, "MAJOR");
  }
  chk("S-14", "account facade export securityDepositReceipts (additive อ่านอย่างเดียว · §3.9)", typeof ACC?.securityDepositReceipts === "function", `typeof=${typeof ACC?.securityDepositReceipts}`, "MAJOR");
  {
    const all = [F.screen, F.page, F.newPage, F.print, F.actions, F.lease].map((f) => stripComments(read(f))).join("\n");
    const legal = LEGAL_BAD.exec(all);
    chk("S-15", "จอ/หน้า/service ผู้เช่าไม่มีคำต้องห้าม สคบ. (ตัดไฟ/ตัดน้ำ/ล็อกห้อง/ยึดทรัพย์…)", !!screenSrc && !legal, screenSrc ? `พบ "${legal?.[0] ?? ""}"` : "ยังไม่มี TenantsScreen.tsx", "CRITICAL");
  }

  // ═══════════════ fixtures ═══════════════
  console.log("\n── fixtures: ร้าน A/B · หน่วยหอ 14 · สมุดบัญชี · ผู้ใช้ ──");
  const stamp = `${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;
  const tA = await prisma.tenant.create({ data: { name: "QC D5 A", slug: `qc-svc-d5-a-${stamp}` } }); tenantIds.push(tA.id);
  const tB = await prisma.tenant.create({ data: { name: "QC D5 B", slug: `qc-svc-d5-b-${stamp}` } }); tenantIds.push(tB.id);
  const A = tA.id as string, B = tB.id as string;
  const mkUnit = async (tenantId: string, type: string, tag: string) => (await prisma.businessUnit.create({ data: { tenantId, type, name: `หอ D5 ${tag}`, slug: `d5${tag}-${stamp}` } })).id as string;
  const U: Record<string, string> = {};
  for (const k of ["DS", "DW", "DO", "DQ", "DC", "DX", "DFS", "DFW", "DFO", "DT", "DN", "DS2", "DU"]) U[k] = await mkUnit(A, "DORM", k.toLowerCase());
  U.HA = await mkUnit(A, "HOTEL", "ha");
  // ORACLE-EDIT 29 ต.ค. (review): หน่วยเพิ่ม — DM เงินพร้อมกัน · DTS/DTW/DTO แม่แบบคั่นตัวแปร · DUN ชื่อหอมีคำต้องห้าม · DUV ตัวแปรไม่รู้จัก · DLT แม่แบบมีคำต้องห้ามตรง ๆ · DSM วิธีลงชื่อ
  for (const k of ["DM", "DTS", "DTW", "DTO", "DUV", "DLT", "DSM", "DTN"]) U[k] = await mkUnit(A, "DORM", k.toLowerCase());
  U.DUN = (await prisma.businessUnit.create({ data: { tenantId: A, type: "DORM", name: "หอพักล็อกห้องได้ D5", slug: `d5dun-${stamp}` } })).id as string;
  U.DB = await mkUnit(B, "DORM", "db");
  const mkType = async (tenantId: string, unitId: string, name: string, monthly: number | null, rentMode = "MONTHLY") =>
    (await prisma.hotelRoomType.create({ data: { tenantId, unitId, name, capacity: 2, baseRateSatang: 0, depositSatang: 0, rentMode, monthlyRateSatang: monthly } })).id as string;
  const RT: Record<string, string> = {};
  const RM: Record<string, string> = {};
  const mkRoom = async (tenantId: string, unitId: string, typeId: string, number: string, extra: Record<string, unknown> = {}) => {
    const id = (await prisma.hotelRoom.create({ data: { tenantId, unitId, roomTypeId: typeId, number, floorNo: Number(number.replace(/\D/g, "")[0] ?? 1), floor: "1", ...extra } })).id as string;
    return id;
  };
  for (const k of Object.keys(U)) {
    const tenantId = k === "DB" ? B : A;
    RT[k] = await mkType(tenantId, U[k], "มาตรฐาน", 450000);
  }
  RT.DSbig = await mkType(A, U.DS, "ห้องใหญ่ (ประกัน 4 เดือนหลุดตัวตรวจ)", 520000);
  RT.DSnorate = await mkType(A, U.DS, "ไม่มีราคา", null);
  RT.DSnight = await mkType(A, U.DS, "รายคืน", null, "NIGHTLY");
  for (let i = 1; i <= 40; i++) RM[`DS-${i}`] = await mkRoom(A, U.DS, RT.DS, `S${String(i).padStart(2, "0")}`);
  RM["DS-big"] = await mkRoom(A, U.DS, RT.DSbig, "S91");
  RM["DS-norate"] = await mkRoom(A, U.DS, RT.DSnorate, "S92");
  RM["DS-night"] = await mkRoom(A, U.DS, RT.DSnight, "S93");
  RM["DS-ooo"] = await mkRoom(A, U.DS, RT.DS, "S94", { hkStatus: "OUT_OF_ORDER" });
  for (const k of ["DW", "DO", "DQ", "DC", "DX", "DFS", "DFW", "DFO", "DT", "DN", "DS2", "HA"]) for (let i = 1; i <= 8; i++) RM[`${k}-${i}`] = await mkRoom(A, U[k], RT[k], `${k}${i}`);
  for (const n of ["201", "202", "203", "204", "205", "206"]) RM[`DU-${n}`] = await mkRoom(A, U.DU, RT.DU, n);
  for (let i = 1; i <= 110; i++) RM[`DM-${i}`] = await mkRoom(A, U.DM, RT.DM, `M${String(i).padStart(2, "0")}`); // ORACLE-EDIT 29 ต.ค. (review)
  for (const k of ["DTS", "DTW", "DTO", "DUV", "DLT", "DSM", "DUN", "DTN"]) for (let i = 1; i <= 3; i++) RM[`${k}-${i}`] = await mkRoom(A, U[k], RT[k], `${k}${i}`);
  for (let i = 1; i <= 3; i++) RM[`DB-${i}`] = await mkRoom(B, U.DB, RT.DB, `B${i}`);

  // ── ค่าตั้ง (เขียนตรง — จำลองค่าที่ตั้งไว้แล้ว/ค่าที่หลุดตัวตรวจ) ──
  const setU = async (tenantId: string, scope: string, scopeId: string, key: string, value: unknown) => {
    await prisma.settingValue.deleteMany({ where: { tenantId, key, scope, scopeId } });
    await prisma.settingValue.create({ data: { tenantId, key, scope, scopeId, value, setById: "qc-d5" } });
  };
  const REASON_OOS = "หน่วยนี้ให้เช่าเพียงสองห้องจึงอยู่นอกขอบเขตประกาศ สคบ.";
  await setU(A, "UNIT", U.DW, "rooms.legal.mode", "WARN");
  await setU(A, "UNIT", U.DFW, "rooms.legal.mode", "WARN");
  for (const k of ["DO", "DFO"]) { await setU(A, "UNIT", U[k], "rooms.legal.mode", "OUT_OF_SCOPE"); await setU(A, "UNIT", U[k], "rooms.legal.outOfScopeReason", REASON_OOS); }
  await setU(A, "UNIT", U.DQ, "rooms.legal.mode", "OUT_OF_SCOPE");
  await setU(A, "ROOM_TYPE", RT.DSbig, "rooms.deposit.months", 4);
  const TPL_NO_PLACEHOLDER = { th: "สัญญาเช่าห้อง {roomNo} ผู้เช่า {tenantName} ค่าเช่าเดือนละ {rent}\n\n{extraClauses}" };
  const EXTRA_OK = [{ id: "pets", textTh: "ห้ามเลี้ยงสัตว์ที่ส่งเสียงรบกวนผู้อื่นภายในห้องพัก" }];
  await setU(A, "UNIT", U.DC, "rooms.lease.contractTemplate", TPL_NO_PLACEHOLDER);
  await setU(A, "UNIT", U.DC, "rooms.lease.extraClauses", EXTRA_OK);
  await setU(A, "UNIT", U.DX, "rooms.lease.extraClauses", [{ id: "deposit-return", textTh: "ผู้ให้เช่าคืนเงินประกันภายใน 60 วันหลังสัญญาสิ้นสุด" }]);
  const EXTRA_THREAT = [{ id: "late", textTh: "หากค้างชำระเกิน 7 วัน ผู้ให้เช่าจะตัดน้ำตัดไฟห้องพักทันที" }];
  for (const k of ["DFS", "DFW", "DFO"]) await setU(A, "UNIT", U[k], "rooms.lease.extraClauses", EXTRA_THREAT);

  // ORACLE-EDIT 29 ต.ค. (review): แม่แบบคั่นตัวแปร (ช่องโหว่ BLOCKER-2) · ตัวแปรไม่รู้จัก · คำต้องห้ามตรง ๆ
  const TPL_SPLIT = { th: "ค้างชำระเกิน 7 วัน ผู้ให้เช่าจะตัด{extraClauses}ไฟ และล็อก{extraClauses}ห้อง\n{mandatoryClauses}" };
  for (const k of ["DTS", "DTW", "DTO"]) await setU(A, "UNIT", U[k], "rooms.lease.contractTemplate", TPL_SPLIT);
  await setU(A, "UNIT", U.DTW, "rooms.legal.mode", "WARN");
  await setU(A, "UNIT", U.DTO, "rooms.legal.mode", "OUT_OF_SCOPE");
  await setU(A, "UNIT", U.DTO, "rooms.legal.outOfScopeReason", REASON_OOS);
  await setU(A, "UNIT", U.DUV, "rooms.lease.contractTemplate", { th: "สัญญาเช่าห้อง {roomNo} ผู้เช่า {tenantName} {x}\n{mandatoryClauses}" });
  await setU(A, "UNIT", U.DLT, "rooms.lease.contractTemplate", { th: "หากค้างชำระ ผู้ให้เช่าจะตัดไฟห้องพัก\n{mandatoryClauses}" });
  // ORACLE-EDIT 29 ต.ค. (review รอบ 2) K8: คำต้องห้ามคร่อมขอบตัวแปร {tenantName} (NEW-MAJOR-1) · DTN = 110 ห้อง DM ใช้ M-13/M-14 ด้วย
  await setU(A, "UNIT", U.DTN, "rooms.lease.contractTemplate", { th: "หากค้างชำระ ผู้ให้เช่าจะตัด{tenantName}\n{mandatoryClauses}" });
  // ── สมุดบัญชี (ไม่จด VAT) + ลิงก์ BUSINESS — DN ไม่ผูก ──
  const mkBook = async (tenantId: string, name: string) => {
    const s = await SYS.createSystem(tenantId, "ACCOUNT", name);
    await ASV.saveSettings(tenantId, s.id, { orgName: name, vatRegistered: false });
    await GL.ensureAccounting({ tenantId, systemId: s.id });
    return s.id as string;
  };
  const BOOK_A = await mkBook(A, `บัญชีหอ D5 A ${stamp}`);
  const BOOK_B = await mkBook(B, `บัญชีหอ D5 B ${stamp}`);
  for (const k of ["DS", "DW", "DO", "DQ", "DC", "DX", "DFS", "DFW", "DFO", "DT", "DS2", "DU", "DM", "DTS", "DTW", "DTO", "DUV", "DLT", "DSM", "DUN", "DTN"]) await prisma.accountSystemLink.create({ data: { tenantId: A, systemId: BOOK_A, linkedKind: "BUSINESS", linkedId: U[k], enabled: true } });
  await prisma.accountSystemLink.create({ data: { tenantId: B, systemId: BOOK_B, linkedKind: "BUSINESS", linkedId: U.DB, enabled: true } });

  // ── ผู้ใช้ (Membership จริง — facade อ่านสด) ──
  type QU = { id: string; role: "OWNER" | "MANAGER" | "STAFF"; unitAccess: string[]; permissions: Record<string, boolean> };
  const mkUser = async (key: string, tenantId: string, role: QU["role"], unitAccess: string[], perms: string[] = []): Promise<QU> => {
    const u = await prisma.user.create({ data: { email: `svc-d5-${stamp}-${key}@shark.local`, name: `QC D5 ${key}` } });
    const permissions = Object.fromEntries(perms.map((p) => [p, true]));
    await prisma.membership.create({ data: { userId: u.id, tenantId, role, unitAccess, permissions, acceptedAt: new Date() } });
    return { id: u.id as string, role, unitAccess, permissions };
  };
  const ALL_A = Object.entries(U).filter(([k]) => k !== "DB").map(([, v]) => v);
  const OWN = await mkUser("owner", A, "OWNER", ["*"]);
  const MGR = await mkUser("manager", A, "MANAGER", ALL_A);
  const STL = await mkUser("staff-lease", A, "STAFF", [U.DS, U.DU], ["dorm.lease.manage"]);
  const STV = await mkUser("staff-view", A, "STAFF", [U.DS, U.DU], ["dorm.view"]);
  const STM = await mkUser("staff-meter", A, "STAFF", [U.DS, U.DU], ["dorm.meter.read"]);
  const STO2 = await mkUser("staff-other-unit", A, "STAFF", [U.DW], ["dorm.lease.manage"]);
  const OWNB = await mkUser("owner-b", B, "OWNER", ["*"]);
  const cx = (u: QU, tenantId = A) => ({ tenantId, actorUserId: u.id });
  const cO = cx(OWN), cM = cx(MGR), cB = cx(OWNB, B);

  // ── ตัวเรียก facade ──
  const T_ = (name?: string, phone?: string | null, idCardNo?: string | null) => ({ name: name ?? `ผู้เช่า ${stamp} ${++seq}`, phone: phone === undefined ? newPhone() : phone, ...(idCardNo ? { idCardNo } : {}) });
  const mkLease = (ctx: unknown, unitId: string, roomId: string, o: Record<string, unknown> = {}): Promise<any> => fn("createLease")!(ctx, {
    unitId, roomId, startDate: "2031-05-01", months: 12, tenant: T_(), rentSatang: 450000, depositSatang: 900000, advanceRentSatang: 0, bookingFeeSatang: 0, ...o,
  });
  const photos = (n: number, ct = "image/jpeg") => Array.from({ length: n }, () => ({ data: ct === "image/png" ? PNG : JPEG, contentType: ct }));
  const addFiles = (ctx: unknown, unitId: string, leaseId: string, kind: string, files: unknown[]): Promise<any> => fn("addLeaseFiles")!(ctx, { unitId, leaseId, kind, files }, { put: putNoop });
  const sign = (ctx: unknown, unitId: string, leaseId: string, o: Record<string, unknown> = {}): Promise<any> => fn("signLease")!(ctx, { unitId, leaseId, file: { data: PNG, contentType: "image/png" }, ...o }, { put: putNoop });
  const moveIn = (ctx: unknown, unitId: string, leaseId: string, o: Record<string, unknown> = {}): Promise<any> => fn("moveIn")!(ctx, { unitId, leaseId, paidAt: new Date(), channel: "TRANSFER", ...o });
  const getL = (ctx: unknown, unitId: string, leaseId: string): Promise<any> => fn("getLease")!(ctx, { unitId, leaseId });
  /** ร่าง → รูป 6 → ลงชื่อ → เข้าอยู่ (ทีละขั้น · คืนผล moveIn) */
  const activate = async (ctx: unknown, unitId: string, leaseId: string, nPhotos = 6) => {
    const a = await addFiles(ctx, unitId, leaseId, "ROOM_PHOTO", photos(nPhotos));
    if (!a?.ok) return { ok: false, code: `addFiles:${codeOf(a)}` };
    const s = await sign(ctx, unitId, leaseId);
    if (!s?.ok) return { ok: false, code: `sign:${codeOf(s)}` };
    return moveIn(ctx, unitId, leaseId);
  };
  // ORACLE-EDIT 29 ต.ค. (review): ยิงพร้อมกันในโพรเซสเดียว (เกิน pool 10 — ที่โพรเซสละ 3 มองไม่เห็น) · เตรียมสัญญาที่ลงชื่อแล้วเป็นชุด
  const inProc = async (calls: (() => Promise<any>)[]) => {
    const t0 = Date.now();
    const rs = await Promise.all(calls.map(async (c) => { try { return await c(); } catch (e) { return { threw: errMsg(e) }; } }));
    return { rs, ms: Date.now() - t0 };
  };
  const BAD_CODES = new Set(["UNAVAILABLE", "RETRY_SAFE"]);
  const badOf = (rs: any[]) => rs.filter((r) => r?.threw || r?.childFail || (r?.ok === false && BAD_CODES.has(String(r?.code))) || /P2028|P2024|timed out|Unable to start a transaction/i.test(J(r)));
  const tally = (rs: any[]) => { const m: Record<string, number> = {}; for (const r of rs) { const k = codeOf(r); m[k] = (m[k] ?? 0) + 1; } return J(m); };
  const prepSigned = async (rooms: string[], o: Record<string, unknown> = {}) => {
    const ids: string[] = [];
    for (let i = 0; i < rooms.length; i += 4) {
      const part = await Promise.all(rooms.slice(i, i + 4).map(async (rk) => {
        const r = await mkLease(cO, U.DM, RM[rk], { depositSatang: 900000, bookingFeeSatang: 300000, ...o });
        if (!r?.leaseId) return `ERR:${codeOf(r)}`;
        const a = await addFiles(cO, U.DM, r.leaseId, "ROOM_PHOTO", photos(6));
        const sg = await sign(cO, U.DM, r.leaseId);
        return a?.ok && sg?.ok ? (r.leaseId as string) : `ERR:${codeOf(a)}/${codeOf(sg)}`;
      }));
      ids.push(...part);
    }
    return ids;
  };
  const DMR = (from: number, n: number) => Array.from({ length: n }, (_, i) => `DM-${from + i}`);
  const rowCounts = async (tenantId: string) => ({
    lease: await prisma.dormLease.count({ where: { tenantId } }),
    occ: await prisma.roomOccupancy.count({ where: { tenantId } }),
    party: await prisma.party.count({ where: { tenantId } }),
    appr: await prisma.approvalRequest.count({ where: { tenantId } }),
    audit: await prisma.auditLog.count({ where: { tenantId, action: { startsWith: "dorm.lease" } } }),
    outbox: await prisma.outboxEvent.count({ where: { tenantId, type: { startsWith: "dorm." } } }),
    files: await prisma.fileAsset.count({ where: { tenantId } }),
  });
  const depJVs = async (tenantId: string, unitId: string, leaseId: string) => ((await prisma.accountJournalEntry.findMany({
    where: { tenantId, refType: "DormSecurityDeposit", refId: `${unitId}:${leaseId}` }, orderBy: { createdAt: "asc" },
    include: { lines: { include: { account: { select: { code: true, type: true } } } } },
  })) as any[]);
  const liabNet = (es: any[]) => es.reduce((s, e) => s + e.lines.filter((l: any) => l.account.type === "LIABILITY").reduce((a: number, l: any) => a + l.credit - l.debit, 0), 0);
  const incomeTouched = (es: any[]) => es.some((e) => e.lines.some((l: any) => /INCOME|REVENUE/.test(String(l.account.type)) && (l.debit || l.credit)));
  const held = (unitId: string, leaseId: string): Promise<number> => ACC.securityDepositHeld({ tenantId: A, unitId, leaseId });
  const legalCodeOf = (r: any) => r?.legal?.code ?? null;

  // ═══════════════ PC. positive control ═══════════════
  console.log("\n── PC positive control (ต้องเขียวก่อนมีงาน) ──");
  const OCC_ROOM = RM["DS-40"];
  await prisma.roomOccupancy.create({ data: { tenantId: A, unitId: U.DS, roomId: OCC_ROOM, startDate: dbDate("2031-01-01"), endDate: dbDate("2033-01-01"), kind: "LEASE", refType: "QcD5Other", refId: `other-${stamp}` } });
  await (async () => {
    const name = "claimRoom (R0.8 facade) บนห้องที่มี LEASE ซ้อนช่วง ⇒ ROOM_TAKEN จาก EXCLUDE ของฐาน (ข้อ R-1/R-4 ทำได้จริง)";
    try {
      const r = await prisma.$transaction((tx: any) => ROOMS.claimRoom(tx, { tenantId: A, unitId: U.DS, roomId: OCC_ROOM, start: "2031-05-01", end: "2032-05-01", kind: "LEASE", refType: "DormLease", refId: `pc1-${stamp}` }));
      chk("PC-1", name, r?.ok === false && r?.code === "ROOM_TAKEN", J(r), "CRITICAL");
    } catch (e) { fail("PC-1", name, `throw: ${errMsg(e)}`, "CRITICAL"); }
  })();
  const PARTY_PC = (await prisma.party.create({ data: { tenantId: A, name: `ผู้เช่า PC ${stamp}` } })).id as string;
  await (async () => {
    const name = "postSecurityDeposit (D.2) บนหน่วย DS: ok · คีย์เดิม ⇒ duplicate · securityDepositHeld = ยอด (เส้นเงินของใบใช้ได้จริง)";
    try {
      const inp = { tenantId: A, unitId: U.DS, leaseId: `pc2-${stamp}`, amountSatang: 100000, idempotencyKey: `qc-d5-pc2-${stamp}`, partyId: PARTY_PC, channel: "CASH", paidAt: new Date() };
      const a = await ACC.postSecurityDeposit(inp);
      const b = await ACC.postSecurityDeposit(inp);
      const h = await ACC.securityDepositHeld({ tenantId: A, unitId: U.DS, leaseId: inp.leaseId });
      chk("PC-2", name, a?.ok === true && b?.ok === true && b?.duplicate === true && h === 100000, `${J(a)} ${J(b)} held=${h}`, "CRITICAL");
    } catch (e) { fail("PC-2", name, `throw: ${errMsg(e)}`, "CRITICAL"); }
  })();
  await (async () => {
    const name = "evaluateLegal DEPOSIT_ADVANCE_LIMIT ประกัน 3 + ล่วงหน้า 1 เดือน: STRICT ⇒ BLOCK · WARN ⇒ WARN + needsOwnerApproval · OUT_OF_SCOPE+เหตุผล ⇒ OK";
    try {
      const inp = { leaseKind: "SHORT", monthlyRentSatang: 450000, depositSatang: 1350000, advanceRentSatang: 450000 };
      const s = LEGAL.evaluateLegal("DEPOSIT_ADVANCE_LIMIT", inp, { mode: "STRICT" });
      const w = LEGAL.evaluateLegal("DEPOSIT_ADVANCE_LIMIT", inp, { mode: "WARN" });
      const o = LEGAL.evaluateLegal("DEPOSIT_ADVANCE_LIMIT", inp, { mode: "OUT_OF_SCOPE", outOfScopeReason: REASON_OOS });
      chk("PC-3", name, s.level === "BLOCK" && w.level === "WARN" && w.needsOwnerApproval === true && o.level === "OK", `${s.level}/${w.level}:${w.needsOwnerApproval}/${o.level}`, "CRITICAL");
    } catch (e) { fail("PC-3", name, `throw: ${errMsg(e)}`, "CRITICAL"); }
  })();
  await (async () => {
    const name = "snapshotPolicy(lease) ก่อน/หลังแก้ค่าตั้งหน่วย ⇒ ค่าในสแนปช็อตใหม่เปลี่ยนจริง (ข้อ N-2 ไม่ว่างเปล่า)";
    try {
      const s1 = await SET.snapshotPolicy({ tenantId: A }, "lease", { unitId: U.DT });
      await setU(A, "UNIT", U.DT, "rooms.lateFee.amount", 12345);
      const s2 = await SET.snapshotPolicy({ tenantId: A }, "lease", { unitId: U.DT });
      await prisma.settingValue.deleteMany({ where: { tenantId: A, key: "rooms.lateFee.amount", scope: "UNIT", scopeId: U.DT } });
      chk("PC-4", name, s2?.values?.["rooms.lateFee.amount"] === 12345 && s1?.values?.["rooms.lateFee.amount"] !== 12345, `ก่อน=${J(s1?.values?.["rooms.lateFee.amount"])} หลัง=${J(s2?.values?.["rooms.lateFee.amount"])}`, "CRITICAL");
    } catch (e) { fail("PC-4", name, `throw: ${errMsg(e)}`, "CRITICAL"); }
  })();
  const parseUrl = (url: string) => { const m = /^\/api\/files\/([a-z0-9]+)\?exp=(\d+)&sig=([0-9a-f]{64})$/i.exec(url ?? ""); return m ? { id: m[1], exp: m[2], sig: m[3] } : null; };
  await (async () => {
    const name = "privateFileUrl (storage) ผูกผู้ดู: ผู้ดูเดียวกันผ่าน · คนอื่นไม่ผ่าน · หมดอายุไม่ผ่าน (ข้อ F-4 ตรวจได้จริง)";
    try {
      const u = STO.privateFileUrl("abcdefghij0123456789", { kind: "STAFF", id: "qc-a" });
      const p = parseUrl(u);
      const okSame = !!p && STO.privateFileSignatureOk(p.id, p.exp, p.sig, { kind: "STAFF", id: "qc-a" });
      const okOther = !!p && STO.privateFileSignatureOk(p.id, p.exp, p.sig, { kind: "STAFF", id: "qc-b" });
      const okExp = !!p && STO.privateFileSignatureOk(p.id, p.exp, p.sig, { kind: "STAFF", id: "qc-a" }, Number(p.exp));
      chk("PC-5", name, okSame && !okOther && !okExp, `same=${okSame} other=${okOther} expired=${okExp} url=${u}`, "CRITICAL");
    } catch (e) { fail("PC-5", name, `throw: ${errMsg(e)}`, "CRITICAL"); }
  })();
  await (async () => {
    const name = "D.1: MANDATORY_CLAUSES 7 ข้อ · ขาด 1 ข้อ ⇒ BLOCK (STRICT) · คำต้องห้ามในข้อสัญญา ⇒ BLOCK แม้ OUT_OF_SCOPE";
    try {
      const M = LEGAL.MANDATORY_CLAUSES as { id: string; textTh: string }[];
      const all = M.map((m) => ({ id: m.id, text: m.textTh }));
      const missing = LEGAL.evaluateLegal("CONTRACT_MANDATORY_CLAUSES", { clauses: all.slice(1) }, { mode: "STRICT" });
      const threat = LEGAL.evaluateLegal("CONTRACT_MANDATORY_CLAUSES", { clauses: [...all, { id: "x", text: EXTRA_THREAT[0].textTh }] }, { mode: "OUT_OF_SCOPE", outOfScopeReason: REASON_OOS });
      const okAll = LEGAL.evaluateLegal("CONTRACT_MANDATORY_CLAUSES", { clauses: all }, { mode: "STRICT" });
      chk("PC-6", name, M.length === 7 && missing.level === "BLOCK" && threat.level === "BLOCK" && okAll.level === "OK", `n=${M.length} missing=${missing.level} threat=${threat.level}/${threat.code} ok=${okAll.level}`, "CRITICAL");
    } catch (e) { fail("PC-6", name, `throw: ${errMsg(e)}`, "CRITICAL"); }
  })();

  await (async () => {
    const name = "ตัวยิงพร้อมกัน 4 โพรเซส × 3: claimRoom ห้องว่างเดียวกัน 12 ทาง ⇒ ok 1 · ROOM_TAKEN 11 (ตัวยิงของ R-4/P-5/M-4/M-7/F-8 ทำงานจริง)";
    try {
      const rs = await fanout("__pc_claimRoom", null, Array.from({ length: 12 }, (_, i) => ({ tenantId: A, unitId: U.DS2, roomId: RM["DS2-8"], start: "2031-05-01", end: "2032-05-01", kind: "LEASE", refType: "QcD5Pc7", refId: `pc7-${i}-${stamp}` })));
      const okN = rs.filter((r) => r?.ok === true).length, taken = rs.filter((r) => r?.ok === false && r?.code === "ROOM_TAKEN").length;
      chk("PC-7", name, rs.length === 12 && okN === 1 && taken === 11, `ok=${okN} taken=${taken} อื่น=${J(rs.filter((r) => r?.ok !== true && r?.code !== "ROOM_TAKEN")).slice(0, 240)}`, "CRITICAL");
    } catch (e) { fail("PC-7", name, `throw: ${errMsg(e)}`, "CRITICAL"); }
  })();
  // ORACLE-EDIT 29 ต.ค. (review): positive control ของการยิง 30 ทางในโพรเซสเดียว — tx ที่ใช้ connection เดียวต่อคำขอไม่ล้ม (ข้อ M-10/M-11/M-12 ทำได้จริง)
  await (async () => {
    const name = "ยิง 30 ทางในโพรเซสเดียว (เกิน pool 10): claimRoom ใน $transaction ห้องเดียวกัน ⇒ ok 1 · ROOM_TAKEN 29 · ไม่มี P2028/timeout (วินัย 1 connection ต่อ tx ทำได้จริง)";
    try {
      const { rs, ms } = await inProc(Array.from({ length: 30 }, (_, i) => () => prisma.$transaction((tx: any) => ROOMS.claimRoom(tx, { tenantId: A, unitId: U.DS2, roomId: RM["DS2-7"], start: "2031-05-01", end: "2032-05-01", kind: "LEASE", refType: "QcD5Pc8", refId: `pc8-${i}-${stamp}` }))));
      const okN = rs.filter((r) => r?.ok === true).length, taken = rs.filter((r) => r?.ok === false && r?.code === "ROOM_TAKEN").length;
      chk("PC-8", name, okN === 1 && taken === 29 && !badOf(rs).length, `ok=${okN} taken=${taken} ${tally(rs)} ${ms}ms`, "CRITICAL");
    } catch (e) { fail("PC-8", name, `throw: ${errMsg(e)}`, "CRITICAL"); }
  })();

  // ═══════════════ L. ตัวกั้นประกัน + ล่วงหน้า ตามโหมดกฎหมาย ═══════════════
  console.log("\n── L ประกัน + ล่วงหน้า × โหมดกฎหมาย ──");
  const R31 = { depositSatang: 1350000, advanceRentSatang: 450000 }; // ประกัน 3 + ล่วงหน้า 1 = 4 เดือน
  await T("L-1", "STRICT: ประกัน 3 + ล่วงหน้า 1 เดือน ⇒ LEGAL_BLOCK (legal.code DEPOSIT_ADVANCE_LIMIT · ไทย) · ไม่มีแถวใดเกิด (สัญญา/ห้อง/Party/คำขอ/audit/outbox)", ["createLease"], async () => {
    const c0 = await rowCounts(A);
    const r = await mkLease(cO, U.DS, RM["DS-1"], { ...R31 });
    const c1 = await rowCounts(A);
    return [failOk(r, "LEGAL_BLOCK") && legalCodeOf(r) === "DEPOSIT_ADVANCE_LIMIT" && J(c0) === J(c1), `${codeOf(r)} legal=${J(r?.legal)} แถว ${J(c0)} → ${J(c1)}`];
  });
  await T("L-2", "STRICT: ประกัน 2 + ล่วงหน้า 1 = 3 เดือนพอดี ⇒ สร้างได้ (legal.level OK) · ขอบเขตไม่ใช่ < 3", ["createLease"], async () => {
    const r = await mkLease(cO, U.DS, RM["DS-2"], { depositSatang: 900000, advanceRentSatang: 450000 });
    return [r?.ok === true && r?.legal?.level === "OK" && r?.legal?.approvalId === null, J(r)];
  });
  await T("L-3", "STRICT: ประกัน 3 เดือน + 1 สตางค์ (ล่วงหน้า 0) ⇒ LEGAL_BLOCK (สตางค์ไม่ปัด)", ["createLease"], async () => {
    const r = await mkLease(cO, U.DS, RM["DS-3"], { depositSatang: 1350001, advanceRentSatang: 0 });
    return [failOk(r, "LEGAL_BLOCK") && legalCodeOf(r) === "DEPOSIT_ADVANCE_LIMIT", `${codeOf(r)} ${J(r?.legal)}`];
  });
  await T("L-4", "สัญญายาว 37 เดือน (LONG): ประกัน 12 เดือนพอดี ⇒ ได้ · 12 เดือน + 1 สตางค์ ⇒ LEGAL_BLOCK", ["createLease"], async () => {
    const a = await mkLease(cO, U.DS, RM["DS-4"], { months: 37, depositSatang: 5400000 });
    const b = await mkLease(cO, U.DS, RM["DS-5"], { months: 37, depositSatang: 5400001 });
    return [a?.ok === true && failOk(b, "LEGAL_BLOCK"), `12m=${codeOf(a)} 12m+1=${codeOf(b)}`];
  });
  await T("L-5", "ค่าเริ่มจากค่าตั้ง: ประเภทห้องตั้งประกัน 4 เดือน (หลุดตัวตรวจ เขียนตรงฐาน) · ไม่ส่งยอดประกัน ⇒ คิดจากค่าตั้ง แล้ว LEGAL_BLOCK (ไม่เชื่อค่าตั้งเฉย ๆ)", ["createLease"], async () => {
    const r = await fn("createLease")!(cO, { unitId: U.DS, roomId: RM["DS-big"], startDate: "2031-05-01", months: 12, tenant: T_() });
    return [failOk(r, "LEGAL_BLOCK") && legalCodeOf(r) === "DEPOSIT_ADVANCE_LIMIT", `${codeOf(r)} ${J(r?.legal)}`];
  });
  await T("L-6", "STRICT: เจ้าของส่ง legalAck + เหตุผล ⇒ ยังเป็น LEGAL_BLOCK (โหมดเข้มงวดข้ามไม่ได้)", ["createLease"], async () => {
    const r = await mkLease(cO, U.DS, RM["DS-6"], { ...R31, legalAck: { reason: "ผู้เช่าขอวางประกันเพิ่มเองเพื่อความสบายใจ" } });
    return [failOk(r, "LEGAL_BLOCK"), codeOf(r)];
  });
  await T("L-7", "WARN: ไม่ส่ง legalAck ⇒ NEEDS_APPROVAL · ไม่มีแถว/คำขออนุมัติ", ["createLease"], async () => {
    const c0 = await rowCounts(A);
    const r = await mkLease(cO, U.DW, RM["DW-1"], { ...R31 });
    const c1 = await rowCounts(A);
    return [failOk(r, "NEEDS_APPROVAL") && J(c0) === J(c1), `${codeOf(r)} แถว ${J(c0)} → ${J(c1)}`];
  });
  await T("L-8", "WARN: legalAck เหตุผลสั้น (< 10 ตัวอักษร) ⇒ REASON_REQUIRED · ไม่มีแถว", ["createLease"], async () => {
    const c0 = await rowCounts(A);
    const r = await mkLease(cO, U.DW, RM["DW-1"], { ...R31, legalAck: { reason: "ตกลง" } });
    const c1 = await rowCounts(A);
    return [failOk(r, "REASON_REQUIRED") && J(c0) === J(c1), `${codeOf(r)} แถว ${J(c0)} → ${J(c1)}`];
  });
  const ACK = { reason: "ผู้เช่าขอจ่ายล่วงหน้าเองเพื่อสะดวกในการเดินทางไปต่างประเทศ" };
  let leaseWarnOwner = "";
  await T("L-9", "WARN: เจ้าของ ack+เหตุผล ⇒ สร้างได้ legal.level WARN (code DEPOSIT_ADVANCE_LIMIT · approvalId null) · AuditLog dorm.lease.legal_override มี code+reason · getLease.legal ตรง", ["createLease", "getLease"], async () => {
    const r = await mkLease(cO, U.DW, RM["DW-1"], { ...R31, legalAck: ACK });
    leaseWarnOwner = r?.leaseId ?? "";
    const au = leaseWarnOwner ? await prisma.auditLog.findFirst({ where: { tenantId: A, action: "dorm.lease.legal_override", targetType: "DormLease", targetId: leaseWarnOwner } }) : null;
    const g = leaseWarnOwner ? await getL(cO, U.DW, leaseWarnOwner) : null;
    const ok = r?.ok === true && r?.legal?.level === "WARN" && r?.legal?.code === "DEPOSIT_ADVANCE_LIMIT" && r?.legal?.approvalId === null
      && !!au && J(au.after).includes("DEPOSIT_ADVANCE_LIMIT") && J(au.after).includes(ACK.reason)
      && g?.legal?.level === "WARN" && g?.legal?.reason === ACK.reason && g?.legal?.approvalStatus === "NONE";
    return [ok, `${J(r)} audit=${J(au?.after).slice(0, 160)} legal=${J(g?.legal)}`];
  });
  await T("L-10", "WARN: ผู้จัดการ ack+เหตุผล แต่ไม่มีสายอนุมัติขั้นเจ้าของ ⇒ NEEDS_APPROVAL · ไม่สร้างสัญญา/คำขอ (ไม่ autoApprove)", ["createLease"], async () => {
    const c0 = await rowCounts(A);
    const r = await mkLease(cM, U.DW, RM["DW-2"], { ...R31, legalAck: ACK });
    const c1 = await rowCounts(A);
    return [failOk(r, "NEEDS_APPROVAL") && !r?.approvalId && J(c0) === J(c1), `${codeOf(r)} แถว ${J(c0)} → ${J(c1)}`];
  });
  let leasePending = "", reqPending = "", leaseRej = "", reqRej = "";
  await T("L-11", "WARN: มีสายอนุมัติ (ขั้น OWNER) ⇒ ผู้จัดการสร้างร่างได้ + คำขอ PENDING entityType dorm.lease.legal_override entityId=leaseId unitId · getLease approvalStatus PENDING · ลงชื่อ/เข้าอยู่ ⇒ NEEDS_APPROVAL (ไม่มีเงิน)", ["createLease", "getLease", "signLease", "moveIn"], async () => {
    await APS.createPolicy({ tenantId: A }, { name: "QC D5 ข้ามคำเตือนกฎหมายในสัญญา", entityType: "dorm.lease.legal_override", steps: [{ order: 1, approverRole: "OWNER" }] });
    const r = await mkLease(cM, U.DW, RM["DW-2"], { ...R31, legalAck: ACK });
    leasePending = r?.leaseId ?? ""; reqPending = r?.legal?.approvalId ?? "";
    const q = reqPending ? await prisma.approvalRequest.findFirst({ where: { id: reqPending, tenantId: A } }) : null;
    const g = leasePending ? await getL(cO, U.DW, leasePending) : null;
    const s = leasePending ? await sign(cO, U.DW, leasePending) : null;
    const jv0 = leasePending ? (await depJVs(A, U.DW, leasePending)).length : -1;
    const m = leasePending ? await moveIn(cO, U.DW, leasePending) : null;
    const jv1 = leasePending ? (await depJVs(A, U.DW, leasePending)).length : -1;
    const ok = r?.ok === true && r?.legal?.level === "WARN" && !!reqPending && q?.entityType === "dorm.lease.legal_override" && q?.entityId === leasePending && q?.unitId === U.DW && q?.status === "PENDING" && q?.requestedById === MGR.id
      && g?.legal?.approvalStatus === "PENDING" && g?.status === "DRAFT" && failOk(s, "NEEDS_APPROVAL") && failOk(m, "NEEDS_APPROVAL") && jv0 === 0 && jv1 === 0;
    return [ok, `create=${codeOf(r)} req=${J(q && { e: q.entityType, id: q.entityId === leasePending, u: q.unitId === U.DW, s: q.status })} status=${g?.legal?.approvalStatus} sign=${codeOf(s)} moveIn=${codeOf(m)} jv=${jv0}/${jv1}`];
  });
  await T("L-12", "เจ้าของปฏิเสธ ⇒ ลงชื่อ LEGAL_REJECTED · เจ้าของอนุมัติ (คำขออีกใบ) ⇒ ลงชื่อได้ (อ่านสถานะสดทุกครั้ง · ไม่มี effect)", ["createLease", "signLease"], async () => {
    const r2 = await mkLease(cM, U.DW, RM["DW-3"], { ...R31, legalAck: ACK });
    leaseRej = r2?.leaseId ?? ""; reqRej = r2?.legal?.approvalId ?? "";
    if (!reqPending || !reqRej) return [false, `ไม่มีคำขอ (L-11=${reqPending} ใหม่=${codeOf(r2)})`];
    const mO = { role: "OWNER", unitAccess: ["*"], permissions: {}, userId: OWN.id };
    const d1 = await APS.decide(mO, { tenantId: A }, reqRej, { decision: "REJECTED", note: "ไม่อนุญาต" });
    const d2 = await APS.decide(mO, { tenantId: A }, reqPending, { decision: "APPROVED" });
    const sR = await sign(cO, U.DW, leaseRej);
    const sA = await sign(cO, U.DW, leasePending);
    return [d1?.ok && d2?.ok && failOk(sR, "LEGAL_REJECTED") && sA?.ok === true, `decide=${d1?.ok}/${d2?.ok} rejected=${codeOf(sR)} approved=${codeOf(sA)}`];
  });
  await T("L-13", "OUT_OF_SCOPE + เหตุผล ⇒ 3+1 เดือนสร้างได้ (legal OK) · OUT_OF_SCOPE ไม่มีเหตุผล ⇒ LEGAL_BLOCK OUT_OF_SCOPE_REASON_REQUIRED แม้ยอดปกติ", ["createLease"], async () => {
    const a = await mkLease(cO, U.DO, RM["DO-1"], { ...R31 });
    const b = await mkLease(cO, U.DQ, RM["DQ-1"], { depositSatang: 900000, advanceRentSatang: 0 });
    return [a?.ok === true && a?.legal?.level === "OK" && failOk(b, "LEGAL_BLOCK") && legalCodeOf(b) === "OUT_OF_SCOPE_REASON_REQUIRED", `oos=${codeOf(a)}/${a?.legal?.level} ไม่มีเหตุผล=${codeOf(b)}/${legalCodeOf(b)}`];
  });

  // ORACLE-EDIT 29 ต.ค. (review) K7: วิธีลงชื่ออยู่ใน snapshot
  await T("L-14", "rooms.lease.signMethod อยู่ใน policySnapshot (ON_SCREEN) · แก้หน่วยเป็น PAPER หลังทำสัญญา ⇒ สัญญาเดิมลงชื่อด้วย PDF ไม่ได้ (INVALID_FILE · ยังเป็น ON_SCREEN) · สัญญาใหม่ลงชื่อด้วย PDF ได้", ["createLease", "getLease", "signLease"], async () => {
    const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a]);
    const r1 = await mkLease(cO, U.DSM, RM["DSM-1"]);
    const g1 = r1?.leaseId ? await getL(cO, U.DSM, r1.leaseId) : null;
    await setU(A, "UNIT", U.DSM, "rooms.lease.signMethod", "PAPER");
    const s1 = r1?.leaseId ? await sign(cO, U.DSM, r1.leaseId, { file: { data: PDF, contentType: "application/pdf" } }) : null;
    const r2 = await mkLease(cO, U.DSM, RM["DSM-2"]);
    const s2 = r2?.leaseId ? await sign(cO, U.DSM, r2.leaseId, { file: { data: PDF, contentType: "application/pdf" } }) : null;
    const ok = g1?.policySnapshot?.values?.["rooms.lease.signMethod"] === "ON_SCREEN" && failOk(s1, "INVALID_FILE") && r2?.ok === true && s2?.ok === true;
    return [ok, `snap=${J(g1?.policySnapshot?.values?.["rooms.lease.signMethod"])} เดิม+PDF=${codeOf(s1)} ใหม่+PDF=${codeOf(s2)}`];
  }, "MAJOR");

  // ═══════════════ C. สัญญา · ข้อบังคับ ═══════════════
  console.log("\n── C สัญญา · ข้อบังคับตามประกาศ ──");
  const norm = (s: string) => (LEGAL?.normalizeLegalText ? LEGAL.normalizeLegalText(s) : s.replace(/\s+/g, " ").trim());
  const MAND = ((LEGAL?.MANDATORY_CLAUSES ?? []) as { id: string; textTh: string }[]);
  const hasAllMandatory = (c: any) => MAND.every((m) => (c?.clauses ?? []).some((x: any) => x.id === m.id && x.mandatory === true && norm(x.textTh) === norm(m.textTh)) && norm(c?.textTh ?? "").includes(norm(m.textTh)));
  let leaseC1 = "", tenantC1 = "";
  await T("C-1", "leaseContract: ข้อบังคับ 7 ข้อถ้อยคำตรงตัว (mandatory true) อยู่ทั้งใน clauses และ textTh · แทนค่าตัวแปร (ชื่อผู้เช่า · เลขห้อง · ค่าเช่า 4,500)", ["createLease", "leaseContract"], async () => {
    tenantC1 = `สมหญิง สัญญาดี ${stamp}`;
    const r = await mkLease(cO, U.DS, RM["DS-7"], { tenant: T_(tenantC1) });
    leaseC1 = r?.leaseId ?? "";
    const c = leaseC1 ? await fn("leaseContract")!(cO, { unitId: U.DS, leaseId: leaseC1 }) : null;
    const t = c?.textTh ?? "";
    return [c?.ok === true && hasAllMandatory(c) && t.includes(tenantC1) && t.includes("S07") && /4,500/.test(t) && !/\{(tenantName|roomNo|rent|mandatoryClauses)\}/.test(t), `${codeOf(c)} mandatory=${hasAllMandatory(c)} name=${t.includes(tenantC1)} room=${t.includes("S07")} rent=${/4,500/.test(t)}`];
  });
  let leaseDC = "";
  await T("C-2", "แม่แบบของหน่วยไม่มี {mandatoryClauses} ⇒ สัญญาใหม่ยังมีข้อบังคับครบ 7 ข้อ (ระบบใส่เอง · ลบด้วยแม่แบบไม่ได้)", ["createLease", "leaseContract"], async () => {
    const r = await mkLease(cO, U.DC, RM["DC-1"]);
    leaseDC = r?.leaseId ?? "";
    const c = leaseDC ? await fn("leaseContract")!(cO, { unitId: U.DC, leaseId: leaseDC }) : null;
    return [r?.ok === true && c?.ok === true && hasAllMandatory(c), `${codeOf(r)} ${codeOf(c)} mandatory=${hasAllMandatory(c)}`];
  });
  await T("C-3", "ข้อเพิ่มของหน่วยใช้ id ซ้ำข้อบังคับ (คืนประกัน 60 วัน) ⇒ INVALID_CLAUSE · ไม่มีแถว (แก้ถ้อยคำข้อบังคับไม่ได้ทุกโหมด)", ["createLease"], async () => {
    const c0 = await rowCounts(A);
    const r = await mkLease(cO, U.DX, RM["DX-1"]);
    const c1 = await rowCounts(A);
    return [failOk(r, "INVALID_CLAUSE") && J(c0) === J(c1), `${codeOf(r)} แถว ${J(c0)} → ${J(c1)}`];
  });
  await T("C-4", "ข้อเพิ่มมีคำต้องห้าม (ตัดน้ำตัดไฟ — หลุดเข้าฐาน) ⇒ LEGAL_BLOCK CONTRACT_FORBIDDEN_TERM ทุกโหมด: STRICT · WARN (เจ้าของ ack) · OUT_OF_SCOPE+เหตุผล", ["createLease"], async () => {
    const s = await mkLease(cO, U.DFS, RM["DFS-1"]);
    const w = await mkLease(cO, U.DFW, RM["DFW-1"], { legalAck: ACK });
    const o = await mkLease(cO, U.DFO, RM["DFO-1"]);
    const ok = [s, w, o].every((r) => failOk(r, "LEGAL_BLOCK") && legalCodeOf(r) === "CONTRACT_FORBIDDEN_TERM");
    return [ok, `STRICT=${codeOf(s)}/${legalCodeOf(s)} WARN=${codeOf(w)}/${legalCodeOf(w)} OOS=${codeOf(o)}/${legalCodeOf(o)}`];
  });
  let contractDC: any = null;
  await T("C-5", "ข้อเพิ่มปกติของหน่วยอยู่ในสัญญา (mandatory false · ถ้อยคำตรง)", ["leaseContract"], async () => {
    contractDC = leaseDC ? await fn("leaseContract")!(cO, { unitId: U.DC, leaseId: leaseDC }) : null;
    const x = (contractDC?.clauses ?? []).find((c: any) => c.id === "pets");
    return [!!x && x.mandatory === false && norm(x.textTh) === norm(EXTRA_OK[0].textTh) && (contractDC?.textTh ?? "").includes(EXTRA_OK[0].textTh), J(x)];
  });
  await T("C-6", "แก้แม่แบบ + ข้อเพิ่มของหน่วยหลังทำสัญญา ⇒ leaseContract ของสัญญาเดิมเหมือนเดิมทุกตัวอักษร", ["leaseContract"], async () => {
    await setU(A, "UNIT", U.DC, "rooms.lease.contractTemplate", { th: "แม่แบบใหม่ {roomNo}\n{mandatoryClauses}" });
    await setU(A, "UNIT", U.DC, "rooms.lease.extraClauses", [{ id: "quiet", textTh: "งดใช้เสียงดังหลังเวลา 22.00 น." }]);
    const c2 = leaseDC ? await fn("leaseContract")!(cO, { unitId: U.DC, leaseId: leaseDC }) : null;
    return [!!contractDC?.ok && J(c2) === J(contractDC), `ก่อน=${J(contractDC).length} หลัง=${J(c2).length} เท่ากัน=${J(c2) === J(contractDC)}`];
  });

  // ORACLE-EDIT 29 ต.ค. (review) K2: ตัวแปรไม่รู้จัก · ชื่อผู้เช่าไม่ทำให้ผิด (C-7 อยู่ท้ายไฟล์ — กวาดทุกสัญญาที่สร้าง)
  await T("C-8", "แม่แบบมีตัวแปรไม่รู้จัก {x} ⇒ INVALID_TEMPLATE (ไม่แทนค่าว่าง) · ไม่มีแถว", ["createLease"], async () => {
    const c0 = await rowCounts(A);
    const r = await mkLease(cO, U.DUV, RM["DUV-1"]);
    const c1 = await rowCounts(A);
    return [failOk(r, "INVALID_TEMPLATE") && J(c0) === J(c1), `${codeOf(r)} แถว ${J(c0)} → ${J(c1)}`];
  });
  let leaseC9 = "";
  await T("C-9", "(positive control) ชื่อผู้เช่ามีคำคล้ายคำต้องห้าม (\"สมชาย ตัดไฟ\") ⇒ ทำสัญญาได้ + ชื่ออยู่ในสัญญา (แทนชื่อด้วยคำกลางก่อนตรวจ) · แม่แบบมีคำ \"ตัดไฟ\" ตรง ๆ ⇒ LEGAL_BLOCK", ["createLease", "leaseContract"], async () => {
    const nm = `สมชาย ตัดไฟ ${stamp}`;
    const r = await mkLease(cO, U.DS, RM["DS-8"], { startDate: "2036-05-01", tenant: T_(nm) });
    leaseC9 = r?.leaseId ?? "";
    const c = leaseC9 ? await fn("leaseContract")!(cO, { unitId: U.DS, leaseId: leaseC9 }) : null;
    const lit = await mkLease(cO, U.DLT, RM["DLT-1"]);
    return [r?.ok === true && c?.ok === true && String(c?.textTh ?? "").includes(nm) && failOk(lit, "LEGAL_BLOCK"), `ชื่อ=${codeOf(r)}/${codeOf(c)} มีชื่อ=${String(c?.textTh ?? "").includes(nm)} แม่แบบตัดไฟ=${codeOf(lit)}/${legalCodeOf(lit)}`];
  });

  // ═══════════════ N. snapshot ═══════════════
  console.log("\n── N policySnapshot ล็อกตอนทำสัญญา ──");
  let leaseN = "", snapN: any = null, colsN: any = null;
  await T("N-1", "policySnapshot มีทุกคีย์ของ SNAPSHOT_KEYS.lease (รวม 4 คีย์ใหม่) + contract + legal · คอลัมน์เงิน/วัน = ที่ส่ง", ["createLease", "getLease"], async () => {
    const r = await mkLease(cO, U.DT, RM["DT-1"], { rentSatang: 450000, commonFeeSatang: 30000, depositSatang: 900000, advanceRentSatang: 0, bookingFeeSatang: 450000 });
    leaseN = r?.leaseId ?? "";
    const g = leaseN ? await getL(cO, U.DT, leaseN) : null;
    snapN = g?.policySnapshot ?? null;
    colsN = leaseN ? await prisma.dormLease.findUnique({ where: { id: leaseN } }) : null;
    const keys: string[] = SET?.SNAPSHOT_KEYS?.lease ?? [];
    const miss = keys.filter((k) => !Object.prototype.hasOwnProperty.call(snapN?.values ?? {}, k));
    const ok = r?.ok === true && keys.length > 0 && !miss.length && !!snapN?.contract && Array.isArray(snapN?.contract?.clauses) && !!snapN?.legal
      && colsN?.rentSatang === 450000 && colsN?.commonFeeSatang === 30000 && colsN?.depositSatang === 900000 && colsN?.bookingFeeSatang === 450000 && colsN?.status === "DRAFT" && colsN?.termType === "FIXED";
    return [ok, `${codeOf(r)} ขาด=${miss.join(",") || "—"} contract=${!!snapN?.contract} legal=${!!snapN?.legal} cols=${J(colsN && { r: colsN.rentSatang, c: colsN.commonFeeSatang, d: colsN.depositSatang, b: colsN.bookingFeeSatang, s: colsN.status, t: colsN.termType })}`];
  });
  await T("N-2", "แก้ค่าตั้งหน่วย (ค่าปรับ · วันครบกำหนด · ประกัน · รูปวันเข้า · ค่าบริการ · แม่แบบ) หลังทำสัญญา ⇒ policySnapshot + คอลัมน์ของสัญญาเดิมไม่เปลี่ยนเลย", ["getLease"], async () => {
    await setU(A, "UNIT", U.DT, "rooms.lateFee.amount", 20000);
    await setU(A, "UNIT", U.DT, "rooms.billing.dueDay", 10);
    await setU(A, "UNIT", U.DT, "rooms.deposit.months", 1);
    await setU(A, "UNIT", U.DT, "rooms.lease.moveInPhotosMin", 2);
    await setU(A, "UNIT", U.DT, "rooms.services.catalog", [{ code: "PARK", labelTh: "ที่จอดรถ", amountSatang: 50000, required: false, taxKind: "VAT7" }]);
    await setU(A, "UNIT", U.DT, "rooms.lease.contractTemplate", { th: "แม่แบบใหม่หลังทำสัญญา {roomNo}\n{mandatoryClauses}" });
    const g = leaseN ? await getL(cO, U.DT, leaseN) : null;
    const cols = leaseN ? await prisma.dormLease.findUnique({ where: { id: leaseN } }) : null;
    const same = !!snapN && J(g?.policySnapshot) === J(snapN) && J({ ...cols, updatedAt: null }) === J({ ...colsN, updatedAt: null });
    return [same, `snapshot เท่าเดิม=${J(g?.policySnapshot) === J(snapN)} คอลัมน์เท่าเดิม=${J({ ...cols, updatedAt: null }) === J({ ...colsN, updatedAt: null })}`];
  });
  await T("N-3", "(positive) สัญญาใหม่หลังแก้ค่าตั้ง ⇒ snapshot ได้ค่าใหม่ (ค่าปรับ 20000 · ครบกำหนดวันที่ 10 · รูป 2) + ประกันเริ่ม 1 เดือน", ["createLease", "getLease"], async () => {
    const r = await fn("createLease")!(cO, { unitId: U.DT, roomId: RM["DT-2"], startDate: "2031-05-01", months: 12, tenant: T_(), rentSatang: 450000 });
    const g = r?.leaseId ? await getL(cO, U.DT, r.leaseId) : null;
    const v = g?.policySnapshot?.values ?? {};
    return [r?.ok === true && v["rooms.lateFee.amount"] === 20000 && v["rooms.billing.dueDay"] === 10 && v["rooms.lease.moveInPhotosMin"] === 2 && g?.depositSatang === 450000 && g?.moveInPhotosMin === 2,
      `${codeOf(r)} values=${J({ fee: v["rooms.lateFee.amount"], due: v["rooms.billing.dueDay"], ph: v["rooms.lease.moveInPhotosMin"] })} deposit=${g?.depositSatang}`];
  });
  await T("N-4", "moveIn ใช้รูปขั้นต่ำจาก snapshot: สัญญาเดิมทำตอนขั้นต่ำ 6 · ค่าตั้งลดเหลือ 2 · มีรูป 3 + ลงชื่อแล้ว ⇒ PHOTOS_REQUIRED · ไม่มี JV", ["addLeaseFiles", "signLease", "moveIn"], async () => {
    const a = await addFiles(cO, U.DT, leaseN, "ROOM_PHOTO", photos(3));
    const s = await sign(cO, U.DT, leaseN);
    const m = await moveIn(cO, U.DT, leaseN);
    const jv = (await depJVs(A, U.DT, leaseN)).length;
    return [a?.ok === true && s?.ok === true && failOk(m, "PHOTOS_REQUIRED") && jv === 0, `files=${codeOf(a)} sign=${codeOf(s)} moveIn=${codeOf(m)} jv=${jv}`];
  });

  // ═══════════════ R. ห้อง · occupancy ═══════════════
  console.log("\n── R ห้อง · RoomOccupancy ──");
  await T("R-1", "ห้องที่มีสัญญาอื่นซ้อนช่วง ⇒ ROOM_TAKEN (ไทย · ไม่บอก refId ของคนอื่น) · ไม่มีสัญญา/Party ใหม่", ["createLease"], async () => {
    const c0 = await rowCounts(A);
    const r = await mkLease(cO, U.DS, OCC_ROOM, { tenant: T_(`ผู้เช่าชนห้อง ${stamp}`) });
    const c1 = await rowCounts(A);
    return [failOk(r, "ROOM_TAKEN") && !J(r).includes(`other-${stamp}`) && J(c0) === J(c1), `${codeOf(r)} ${J(r).slice(0, 160)} แถว ${J(c0)} → ${J(c1)}`];
  });
  await T("R-2", "occupancy = LEASE · refType DormLease · refId leaseId · [start, end+1) · lease.occupancyId · endDate รวมวันสุดท้าย (1 พ.ค.+12 ⇒ 30 เม.ย. · 15 ส.ค.+6 ⇒ 14 ก.พ. · 31 ม.ค.+1 ⇒ สิ้น ก.พ.)", ["createLease"], async () => {
    const cases: [string, number, string][] = [["2031-05-01", 12, "DS-8"], ["2031-08-15", 6, "DS-9"], ["2031-01-31", 1, "DS-10"]];
    const bad: string[] = [];
    for (const [s, m, room] of cases) {
      const r = await mkLease(cO, U.DS, RM[room], { startDate: s, months: m });
      const want = leaseEnd(s, m);
      const row = r?.leaseId ? await prisma.dormLease.findUnique({ where: { id: r.leaseId } }) : null;
      const occ = r?.occupancyId ? await prisma.roomOccupancy.findUnique({ where: { id: r.occupancyId } }) : null;
      const ok = r?.ok === true && r?.endDate === want && ymdOf(row?.endDate) === want && ymdOf(row?.startDate) === s && row?.occupancyId === r.occupancyId
        && occ?.kind === "LEASE" && occ?.refType === "DormLease" && occ?.refId === r.leaseId && occ?.active === true && ymdOf(occ?.startDate) === s && ymdOf(occ?.endDate) === addDays(want, 1) && occ?.roomId === RM[room];
      if (!ok) bad.push(`${s}+${m}: ${codeOf(r)} end=${r?.endDate}/${want} occ=${J(occ && { k: occ.kind, t: occ.refType, s: ymdOf(occ.startDate), e: ymdOf(occ.endDate) })}`);
    }
    return [!bad.length, bad.join(" | ")];
  });
  await T("R-3", "ต่อท้ายพอดี (สัญญาใหม่เริ่มวันถัดจากวันสุดท้ายของสัญญาเดิม) ⇒ ได้ · เริ่มก่อน 1 วัน ⇒ ROOM_TAKEN", ["createLease"], async () => {
    const a = await mkLease(cO, U.DS, RM["DS-11"], { startDate: "2031-05-01", months: 12 });
    const b = await mkLease(cO, U.DS, RM["DS-11"], { startDate: "2032-05-01", months: 12 });
    const c = await mkLease(cO, U.DS, RM["DS-11"], { startDate: "2033-04-30", months: 12 });
    return [a?.ok === true && b?.ok === true && failOk(c, "ROOM_TAKEN"), `${codeOf(a)} ${codeOf(b)} ${codeOf(c)}`];
  });
  await T("R-4", "12 ทางพร้อมกัน (4 โพรเซส × 3) ห้องเดียวช่วงเดียว ⇒ ok 1 · ROOM_TAKEN 11 · DormLease 1 · occupancy active 1 (X3)", ["createLease"], async () => {
    const inputs = Array.from({ length: 12 }, (_, i) => ({ unitId: U.DS, roomId: RM["DS-12"], startDate: "2031-05-01", months: 12, tenant: T_(`ผู้เช่าแข่ง ${i} ${stamp}`), rentSatang: 450000, depositSatang: 900000, advanceRentSatang: 0, bookingFeeSatang: 0 }));
    const rs = await fanout("createLease", cO, inputs);
    const okN = rs.filter((r) => r?.ok === true).length, taken = rs.filter((r) => r?.ok === false && r?.code === "ROOM_TAKEN").length;
    const leases = await prisma.dormLease.count({ where: { tenantId: A, roomId: RM["DS-12"] } });
    const occ = await prisma.roomOccupancy.count({ where: { tenantId: A, roomId: RM["DS-12"], active: true } });
    return [rs.length === 12 && okN === 1 && taken === 11 && leases === 1 && occ === 1, `ok=${okN} taken=${taken} lease=${leases} occ=${occ} อื่น=${J(rs.filter((r) => r?.ok !== true && r?.code !== "ROOM_TAKEN")).slice(0, 200)}`];
  });
  await T("R-5", "ห้องปิดซ่อม ⇒ ROOM_UNAVAILABLE · ห้องรายคืน ⇒ RENT_MODE_MISMATCH · ไม่มีแถว", ["createLease"], async () => {
    const c0 = await rowCounts(A);
    const a = await mkLease(cO, U.DS, RM["DS-ooo"]);
    const b = await mkLease(cO, U.DS, RM["DS-night"]);
    const c1 = await rowCounts(A);
    return [failOk(a, "ROOM_UNAVAILABLE") && failOk(b, "RENT_MODE_MISMATCH") && J(c0) === J(c1), `${codeOf(a)} ${codeOf(b)} แถว ${J(c0)} → ${J(c1)}`];
  });
  await T("R-6", "cancelLease ร่าง: เหตุผลสั้น ⇒ INVALID_INPUT · ok ⇒ CANCELLED + occupancy ปิด + ห้องทำสัญญาใหม่ได้ · มีเงินจองถือ ⇒ DEPOSIT_HELD", ["createLease", "cancelLease", "receiveBookingFee"], async () => {
    const r = await mkLease(cO, U.DS, RM["DS-13"]);
    const short = await fn("cancelLease")!(cO, { unitId: U.DS, leaseId: r?.leaseId, reason: "ไม" });
    const c = await fn("cancelLease")!(cO, { unitId: U.DS, leaseId: r?.leaseId, reason: "ผู้เช่าเปลี่ยนใจก่อนวางเงินจอง" });
    const row = r?.leaseId ? await prisma.dormLease.findUnique({ where: { id: r.leaseId } }) : null;
    const occ = r?.occupancyId ? await prisma.roomOccupancy.findUnique({ where: { id: r.occupancyId } }) : null;
    const again = await mkLease(cO, U.DS, RM["DS-13"]);
    const bk = await mkLease(cO, U.DS, RM["DS-14"], { bookingFeeSatang: 450000 });
    const rb = bk?.leaseId ? await fn("receiveBookingFee")!(cO, { unitId: U.DS, leaseId: bk.leaseId, channel: "CASH" }) : null;
    const ch = bk?.leaseId ? await fn("cancelLease")!(cO, { unitId: U.DS, leaseId: bk.leaseId, reason: "ผู้เช่าขอยกเลิกการจอง" }) : null;
    const ok = failOk(short, "INVALID_INPUT") && c?.ok === true && row?.status === "CANCELLED" && occ?.active === false && again?.ok === true && rb?.ok === true && failOk(ch, "DEPOSIT_HELD");
    return [ok, `short=${codeOf(short)} cancel=${codeOf(c)} status=${row?.status} occ=${occ?.active} ใหม่=${codeOf(again)} จอง=${codeOf(rb)} ยกเลิกมีเงิน=${codeOf(ch)}`];
  });
  await T("R-7", "อินพุตผิด ⇒ INVALID_INPUT (months 0/361/1.5 · วันที่ผิด · ค่าห้องติดลบ) · ไม่มีค่าห้องทั้งค่าตั้ง/ประเภท ⇒ RENT_REQUIRED · เงินจอง > ประกัน ⇒ INVALID_AMOUNT · เงินจองหักค่าห้องแรก (FIRST_RENT) ⇒ NOT_SUPPORTED", ["createLease"], async () => {
    const c0 = await rowCounts(A);
    const bad = [
      await mkLease(cO, U.DS, RM["DS-15"], { months: 0 }), await mkLease(cO, U.DS, RM["DS-15"], { months: 361 }), await mkLease(cO, U.DS, RM["DS-15"], { months: 1.5 }),
      await mkLease(cO, U.DS, RM["DS-15"], { startDate: "2031-02-30" }), await mkLease(cO, U.DS, RM["DS-15"], { rentSatang: -1 }),
    ];
    const nr = await fn("createLease")!(cO, { unitId: U.DS, roomId: RM["DS-norate"], startDate: "2031-05-01", months: 12, tenant: T_() });
    const amt = await mkLease(cO, U.DS, RM["DS-15"], { depositSatang: 900000, bookingFeeSatang: 900001 });
    await setU(A, "UNIT", U.DS2, "rooms.lease.reservationAppliesTo", "FIRST_RENT");
    const fr = await mkLease(cO, U.DS2, RM["DS2-1"], { bookingFeeSatang: 450000 });
    await prisma.settingValue.deleteMany({ where: { tenantId: A, key: "rooms.lease.reservationAppliesTo", scopeId: U.DS2 } });
    const c1 = await rowCounts(A);
    const ok = bad.every((r) => failOk(r, "INVALID_INPUT")) && failOk(nr, "RENT_REQUIRED") && failOk(amt, "INVALID_AMOUNT") && failOk(fr, "NOT_SUPPORTED") && J(c0) === J(c1);
    return [ok, `${bad.map(codeOf).join(",")} norate=${codeOf(nr)} จอง>ประกัน=${codeOf(amt)} FIRST_RENT=${codeOf(fr)} แถว=${J(c0) === J(c1)}`];
  });

  // ═══════════════ P. ผู้เช่า = Party ═══════════════
  console.log("\n── P ผู้เช่า = Party ──");
  const PH1 = newPhone(), ID1 = newIdCard();
  let partyP1 = "";
  await T("P-1", "ผู้เช่าใหม่ ⇒ Party ใหม่ (ชื่อ · phoneNorm · taxId = เลขบัตร) · partyCreated true · lease.partyId ตรง", ["createLease"], async () => {
    const r = await mkLease(cO, U.DS, RM["DS-16"], { tenant: { name: `นิภา วงศ์ใหญ่ ${stamp}`, phone: PH1, idCardNo: ID1 } });
    partyP1 = r?.partyId ?? "";
    const p = partyP1 ? await prisma.party.findUnique({ where: { id: partyP1 } }) : null;
    const row = r?.leaseId ? await prisma.dormLease.findUnique({ where: { id: r.leaseId } }) : null;
    return [r?.ok === true && r?.partyCreated === true && p?.tenantId === A && p?.phoneNorm === PH1 && p?.taxId === ID1 && row?.partyId === partyP1, `${codeOf(r)} created=${r?.partyCreated} party=${J(p && { ph: p.phoneNorm === PH1, tax: p.taxId === ID1 })}`];
  });
  await T("P-2", "findTenantCandidates: เบอร์รูป +66 ⇒ เจอ (matchedBy PHONE) · เลขบัตร ⇒ ID_CARD · phoneMasked เหลือ 4 ตัวท้าย · DTO ไม่มีเบอร์เต็ม/เลขบัตร · ร้าน B ไม่เห็น", ["findTenantCandidates"], async () => {
    const f = fn("findTenantCandidates")!;
    const a = await f(cO, { unitId: U.DS, phone: `+66 ${PH1.slice(1, 3)} ${PH1.slice(3, 6)} ${PH1.slice(6)}` });
    const b = await f(cO, { unitId: U.DS, idCardNo: ID1 });
    const x = await f(cB, { unitId: U.DB, phone: PH1 });
    const dto = J([a, b]);
    const ok = Array.isArray(a) && a.some((c: any) => c.partyId === partyP1 && c.matchedBy === "PHONE" && typeof c.phoneMasked === "string" && c.phoneMasked.endsWith(PH1.slice(-4)))
      && Array.isArray(b) && b.some((c: any) => c.partyId === partyP1 && c.matchedBy === "ID_CARD") && !dto.includes(PH1) && !dto.includes(PH1.slice(1)) && !dto.includes(ID1)
      && Array.isArray(x) && x.length === 0;
    return [ok, `a=${J(a).slice(0, 160)} b=${J(b).slice(0, 120)} ร้านB=${J(x)}`];
  });
  await T("P-3", "ทำสัญญาอีกห้องด้วยเบอร์เดิม (ชื่อเดียวกัน ช่องว่างต่าง) ⇒ ใช้ Party เดิม (partyCreated false)", ["createLease"], async () => {
    const r = await mkLease(cO, U.DS, RM["DS-17"], { tenant: { name: `  นิภา  วงศ์ใหญ่ ${stamp}`, phone: PH1 } } /* ORACLE-EDIT 29 ต.ค. (review) K3: ชื่อเดียวกันหลังตัดช่องว่าง — ชื่อต่างจริงต้องถามยืนยัน (P-9) */);
    return [r?.ok === true && r?.partyId === partyP1 && r?.partyCreated === false, J(r)];
  });
  await T("P-4", "เลขบัตรเลขตรวจผิด ⇒ INVALID_ID_CARD · ไม่มีทั้งเบอร์และเลขบัตร ⇒ INVALID_INPUT · ไม่มีแถว", ["createLease"], async () => {
    const c0 = await rowCounts(A);
    const badId = ID1.slice(0, 12) + String((Number(ID1[12]) + 1) % 10);
    const a = await mkLease(cO, U.DS, RM["DS-18"], { tenant: { name: "ทดสอบ เลขบัตรผิด", idCardNo: badId, phone: null } });
    const b = await mkLease(cO, U.DS, RM["DS-18"], { tenant: { name: "ทดสอบ ไม่มีเบอร์" , phone: null } });
    const c1 = await rowCounts(A);
    return [failOk(a, "INVALID_ID_CARD") && failOk(b, "INVALID_INPUT") && J(c0) === J(c1), `${codeOf(a)} ${codeOf(b)} แถว ${J(c0)} → ${J(c1)}`];
  });
  await T("P-5", "12 ทางพร้อมกัน (4 โพรเซส) คนละห้อง เบอร์ใหม่เดียวกัน ⇒ สัญญา 12 · Party ของเบอร์นี้ 1 ราย (advisory lock · X3)", ["createLease"], async () => {
    const ph = newPhone();
    const inputs = Array.from({ length: 12 }, (_, i) => ({ unitId: U.DS, roomId: RM[`DS-${19 + i}`], startDate: "2031-05-01", months: 12, tenant: { name: `ผู้เช่าเบอร์เดียว ${stamp}`, phone: ph }, rentSatang: 450000, depositSatang: 900000, advanceRentSatang: 0, bookingFeeSatang: 0 }));
    const rs = await fanout("createLease", cO, inputs);
    const parties = await prisma.party.count({ where: { tenantId: A, phoneNorm: ph } });
    const ids = new Set(rs.map((r) => r?.partyId).filter(Boolean));
    return [rs.filter((r) => r?.ok === true).length === 12 && parties === 1 && ids.size === 1, `ok=${rs.filter((r) => r?.ok === true).length} party=${parties} ids=${ids.size} ${J(rs.filter((r) => r?.ok !== true)).slice(0, 200)}`];
  });
  await T("P-6", "partyId ของร้าน B ⇒ NOT_FOUND · Party ที่ถูกรวมแล้ว ⇒ ใช้ปลายทาง (resolveCanonical)", ["createLease"], async () => {
    const pb = (await prisma.party.create({ data: { tenantId: B, name: "ผู้เช่าร้าน B" } })).id;
    const a = await mkLease(cO, U.DS, RM["DS-31"], { tenant: { partyId: pb } });
    const target = (await prisma.party.create({ data: { tenantId: A, name: `ปลายทางการรวม ${stamp}` } })).id;
    const merged = (await prisma.party.create({ data: { tenantId: A, name: `ถูกรวม ${stamp}`, mergedIntoId: target } })).id;
    const b = await mkLease(cO, U.DS, RM["DS-31"], { tenant: { partyId: merged } });
    return [failOk(a, "NOT_FOUND") && b?.ok === true && b?.partyId === target, `ร้านB=${codeOf(a)} รวมแล้ว=${codeOf(b)} party=${b?.partyId === target}`];
  });
  await T("P-7", "ผู้พักร่วม/รถ: เก็บตามรูปทรง · getLease ปิดเบอร์ผู้พักร่วม · 11 คน ⇒ INVALID_INPUT · updateLeaseOccupants แก้ได้", ["createLease", "getLease", "updateLeaseOccupants"], async () => {
    const coPh = newPhone();
    const r = await mkLease(cO, U.DS, RM["DS-32"], { occupants: [{ name: "เพื่อนร่วมห้อง", phone: coPh }], vehicles: [{ plate: "1กข 1234", kind: "MOTORBIKE" }] });
    const g = r?.leaseId ? await getL(cO, U.DS, r.leaseId) : null;
    const many = await mkLease(cO, U.DS, RM["DS-33"], { occupants: Array.from({ length: 11 }, (_, i) => ({ name: `คน ${i}` })) });
    const u = r?.leaseId ? await fn("updateLeaseOccupants")!(cO, { unitId: U.DS, leaseId: r.leaseId, occupants: [], vehicles: [{ plate: "2ขค 5678", kind: "CAR", note: null }] }) : null;
    const g2 = r?.leaseId ? await getL(cO, U.DS, r.leaseId) : null;
    const ok = r?.ok === true && g?.occupants?.[0]?.name === "เพื่อนร่วมห้อง" && !J(g).includes(coPh) && String(g?.occupants?.[0]?.phoneMasked ?? "").endsWith(coPh.slice(-4)) && g?.vehicles?.[0]?.plate === "1กข 1234"
      && failOk(many, "INVALID_INPUT") && u?.ok === true && g2?.occupants?.length === 0 && g2?.vehicles?.[0]?.kind === "CAR";
    return [ok, `${codeOf(r)} occ=${J(g?.occupants)} veh=${J(g?.vehicles)} 11คน=${codeOf(many)} update=${codeOf(u)} หลัง=${J(g2?.vehicles)}`];
  });

  // ORACLE-EDIT 29 ต.ค. (review) K3 K7: จับคู่ผู้เช่า
  await T("P-8", "เบอร์เดิม (Party ยังไม่มีเลขบัตร · ชื่อตรง) + เลขบัตรใหม่ ⇒ ใช้ Party เดิม + เติมเลขบัตร (ไม่เกิด Party ซ้ำ) · เบอร์ตรง Party ที่มีเลขบัตรอื่น ⇒ Party ใหม่ + บันทึกคู่อาจซ้ำ (PartyMergeCandidate)", ["createLease"], async () => {
    const ph = newPhone(), id = newIdCard(), nm = `ปิยะ เติมบัตร ${stamp}`;
    const old = (await prisma.party.create({ data: { tenantId: A, name: nm, phone: ph, phoneNorm: ph } })).id;
    const a = await mkLease(cO, U.DS, RM["DS-9"], { startDate: "2036-05-01", tenant: { name: nm, phone: ph, idCardNo: id } });
    const pOld = await prisma.party.findUnique({ where: { id: old } });
    const nPh = await prisma.party.count({ where: { tenantId: A, phoneNorm: ph } });
    const ph2 = newPhone(), idOther = newIdCard(), idNew = newIdCard(), nm2 = `วิชัย บัตรอื่น ${stamp}`;
    const other = (await prisma.party.create({ data: { tenantId: A, name: nm2, phone: ph2, phoneNorm: ph2, taxId: idOther } })).id;
    const b = await mkLease(cO, U.DS, RM["DS-10"], { startDate: "2036-05-01", tenant: { name: nm2, phone: ph2, idCardNo: idNew } });
    const mc = b?.partyId ? await prisma.partyMergeCandidate.count({ where: { tenantId: A, OR: [{ partyAId: other, partyBId: b.partyId }, { partyAId: b.partyId, partyBId: other }] } }) : 0;
    const ok = a?.ok === true && a?.partyId === old && a?.partyCreated === false && pOld?.taxId === id && nPh === 1
      && b?.ok === true && b?.partyCreated === true && b?.partyId !== other && mc === 1;
    return [ok, `เติมบัตร=${codeOf(a)} same=${a?.partyId === old} created=${a?.partyCreated} tax=${pOld?.taxId === id} nPh=${nPh} · บัตรอื่น=${codeOf(b)} new=${b?.partyCreated} merge=${mc}`];
  });
  await T("P-9", "ชื่อไม่ตรง (ทางเบอร์ · ทางเลขบัตร) ⇒ TENANT_MATCH_CONFIRM + candidates (ไม่มีเบอร์เต็ม/เลขบัตร) ไม่มีแถว · ส่ง confirmPartyId ⇒ ใช้ Party นั้น · createNewParty ⇒ Party ใหม่ · ไม่ทิ้งชื่อที่กรอกเงียบ ๆ", ["createLease"], async () => {
    const ph = newPhone(), id = newIdCard();
    const px = (await prisma.party.create({ data: { tenantId: A, name: `เจ้าของเบอร์ ${stamp}`, phone: ph, phoneNorm: ph } })).id;
    const py = (await prisma.party.create({ data: { tenantId: A, name: `เจ้าของบัตร ${stamp}`, taxId: id } })).id;
    const c0 = await rowCounts(A);
    const a = await mkLease(cO, U.DS, RM["DS-11"], { startDate: "2036-05-01", tenant: { name: `คนอื่นใช้เบอร์ ${stamp}`, phone: ph } });
    const b = await mkLease(cO, U.DS, RM["DS-11"], { startDate: "2036-05-01", tenant: { name: `คนอื่นใช้บัตร ${stamp}`, idCardNo: id, phone: null } });
    const c1 = await rowCounts(A);
    const candOk = (r: any, pid: string) => Array.isArray(r?.candidates) && r.candidates.some((c: any) => c.partyId === pid) && !J(r).includes(ph) && !J(r).includes(ph.slice(1)) && !J(r).includes(id);
    const cf = await mkLease(cO, U.DS, RM["DS-11"], { startDate: "2036-05-01", tenant: { name: `คนอื่นใช้เบอร์ ${stamp}`, phone: ph, confirmPartyId: px } });
    const nw = await mkLease(cO, U.DS, RM["DS-12"], { startDate: "2036-05-01", tenant: { name: `คนอื่นใช้บัตร ${stamp}`, idCardNo: newIdCard(), phone: ph, createNewParty: true } });
    const nwP = nw?.partyId ? await prisma.party.findUnique({ where: { id: nw.partyId } }) : null;
    const ok = failOk(a, "TENANT_MATCH_CONFIRM") && candOk(a, px) && failOk(b, "TENANT_MATCH_CONFIRM") && candOk(b, py) && J(c0) === J(c1)
      && cf?.ok === true && cf?.partyId === px && nw?.ok === true && nw?.partyCreated === true && nw?.partyId !== px && nwP?.name === `คนอื่นใช้บัตร ${stamp}`;
    return [ok, `เบอร์=${codeOf(a)}/${candOk(a, px)} บัตร=${codeOf(b)}/${candOk(b, py)} แถว=${J(c0) === J(c1)} ยืนยัน=${codeOf(cf)}/${cf?.partyId === px} ใหม่=${codeOf(nw)}/${nw?.partyCreated}/${nwP?.name}`];
  });
  await T("P-10", "findTenantCandidates ต้อง dorm.lease.manage: STAFF dorm.view ⇒ ว่าง/NOT_FOUND (ไม่มีชื่อผู้เช่าหลุด) · STAFF dorm.lease.manage ⇒ เจอ (positive)", ["findTenantCandidates"], async () => {
    const f = fn("findTenantCandidates")!;
    const v = await f(cx(STV), { unitId: U.DS, phone: PH1 });
    const m = await f(cx(STL), { unitId: U.DS, phone: PH1 });
    const vOk = (Array.isArray(v) && v.length === 0) || failOk(v, "NOT_FOUND");
    return [vOk && Array.isArray(m) && m.some((c: any) => c.partyId === partyP1), `view=${J(v).slice(0, 120)} manage=${Array.isArray(m) ? m.length : codeOf(m)}`];
  }, "MAJOR");

  // ORACLE-EDIT 29 ต.ค. (review รอบ 2) K9: confirmPartyId ต้องเติมเลขบัตร/เบอร์ที่กรอกให้ Party ที่ยืนยัน (ถ้ายังไม่มี) — ไม่ทิ้งเงียบ ๆ
  await T("P-11", "confirmPartyId: Party มีแต่เบอร์ (ชื่อต่าง) + กรอกเลขบัตรใหม่ ⇒ ยืนยันแล้วเติมเลขบัตร · Party มีแต่เลขบัตร + กรอกเบอร์ใหม่ ⇒ ยืนยันแล้วเติมเบอร์ · ไม่เกิด Party ใหม่", ["createLease"], async () => {
    const ph = newPhone(), idNew = newIdCard();
    const px = (await prisma.party.create({ data: { tenantId: A, name: `ยืนยันเบอร์ ${stamp}`, phone: ph, phoneNorm: ph } })).id;
    const a0 = await mkLease(cO, U.DS, RM["DS-13"], { startDate: "2036-05-01", tenant: { name: `ชื่อในบัตร ${stamp}`, phone: ph, idCardNo: idNew } });
    const a = await mkLease(cO, U.DS, RM["DS-13"], { startDate: "2036-05-01", tenant: { name: `ชื่อในบัตร ${stamp}`, phone: ph, idCardNo: idNew, confirmPartyId: px } });
    const pX = await prisma.party.findUnique({ where: { id: px } });
    const idY = newIdCard(), phNew = newPhone();
    const py = (await prisma.party.create({ data: { tenantId: A, name: `ยืนยันบัตร ${stamp}`, taxId: idY } })).id;
    const b = await mkLease(cO, U.DS, RM["DS-14"], { startDate: "2036-05-01", tenant: { name: `ชื่อเล่นอื่น ${stamp}`, idCardNo: idY, phone: phNew, confirmPartyId: py } });
    const pY = await prisma.party.findUnique({ where: { id: py } });
    const nNew = await prisma.party.count({ where: { tenantId: A, OR: [{ taxId: idNew }, { phoneNorm: phNew }] } });
    const ok = failOk(a0, "TENANT_MATCH_CONFIRM") && a?.ok === true && a?.partyId === px && pX?.taxId === idNew && b?.ok === true && b?.partyId === py && pY?.phoneNorm === phNew && nNew === 2;
    return [ok, `ถามก่อน=${codeOf(a0)} ยืนยันเบอร์=${codeOf(a)}/${a?.partyId === px} เติมบัตร=${pX?.taxId === idNew} · ยืนยันบัตร=${codeOf(b)}/${b?.partyId === py} เติมเบอร์=${pY?.phoneNorm === phNew} · Party ที่มีเลข/เบอร์ใหม่=${nNew} (ต้อง 2 = รายเดิมทั้งคู่)`];
  });

  // ═══════════════ M. เงินประกัน ═══════════════
  console.log("\n── M เงินจอง · เงินประกัน (postSecurityDeposit) ──");
  let leaseM1 = "", partyM1 = "";
  await T("M-1", "receiveBookingFee (DRAFT · ยอด = คอลัมน์ ฿4,500): JV 1 · ยอดถือ 450000 · ซ้ำ ⇒ duplicate ไม่มี JV ใหม่ · เงินจอง 0 ⇒ NO_BOOKING_FEE", ["createLease", "receiveBookingFee"], async () => {
    const r = await mkLease(cO, U.DS, RM["DS-34"], { depositSatang: 900000, bookingFeeSatang: 450000 });
    leaseM1 = r?.leaseId ?? ""; partyM1 = r?.partyId ?? "";
    const a = await fn("receiveBookingFee")!(cO, { unitId: U.DS, leaseId: leaseM1, channel: "CASH" });
    const b = await fn("receiveBookingFee")!(cO, { unitId: U.DS, leaseId: leaseM1, channel: "CASH" });
    const es = await depJVs(A, U.DS, leaseM1);
    const h = await held(U.DS, leaseM1);
    const z = await mkLease(cO, U.DS, RM["DS-35"], { bookingFeeSatang: 0 });
    const nz = z?.leaseId ? await fn("receiveBookingFee")!(cO, { unitId: U.DS, leaseId: z.leaseId }) : null;
    return [a?.ok === true && a?.duplicate === false && typeof a?.entryNo === "string" && a.entryNo && b?.ok === true && b?.duplicate === true && es.length === 1 && h === 450000 && failOk(nz, "NO_BOOKING_FEE"),
      `a=${J(a)} b=${codeOf(b)}/${b?.duplicate} jv=${es.length} held=${h} 0=${codeOf(nz)}`];
  });
  await T("M-2", "moveIn หลังรับเงินจอง: ยอดถือ = ประกัน 900000 พอดี · JV 2 (จอง + ส่วนที่เหลือ) · หนี้สินสุทธิ +900000 · ไม่แตะรายได้ · ACTIVE · depositDocumentId = JV ส่วนที่เหลือ · getLease.receipts 2 ใบมีเลขที่", ["addLeaseFiles", "signLease", "moveIn", "getLease"], async () => {
    const m = await activate(cO, U.DS, leaseM1);
    const es = await depJVs(A, U.DS, leaseM1);
    const h = await held(U.DS, leaseM1);
    const row = await prisma.dormLease.findUnique({ where: { id: leaseM1 } });
    const g = await getL(cO, U.DS, leaseM1);
    const depReceipt = (m?.receipts ?? []).find((x: any) => x.kind === "DEPOSIT");
    const ok = m?.ok === true && m?.status === "ACTIVE" && m?.heldSatang === 900000 && h === 900000 && es.length === 2 && liabNet(es) === 900000 && !incomeTouched(es)
      && row?.status === "ACTIVE" && !!depReceipt && row?.depositDocumentId === depReceipt.entryId && es.some((e) => e.id === row?.depositDocumentId)
      && (g?.receipts ?? []).length === 2 && g.receipts.every((x: any) => typeof x.entryNo === "string" && x.entryNo) && g?.heldSatang === 900000;
    return [ok, `${codeOf(m)} held=${h} jv=${es.length} net=${liabNet(es)} income=${incomeTouched(es)} status=${row?.status} depDoc=${row?.depositDocumentId === depReceipt?.entryId} receipts=${J(g?.receipts).slice(0, 160)}`];
  });
  await T("M-3", "moveIn โดยไม่เคยรับเงินจองก่อน (จอง ฿4,500) ⇒ ลงทั้งสองคีย์ตอนเข้าอยู่ · ยอดถือ = ประกันพอดี (ไม่ขาด/ไม่เกิน)", ["createLease", "moveIn"], async () => {
    const r = await mkLease(cO, U.DS, RM["DS-36"], { depositSatang: 900000, bookingFeeSatang: 450000 });
    const m = r?.leaseId ? await activate(cO, U.DS, r.leaseId) : null;
    const es = r?.leaseId ? await depJVs(A, U.DS, r.leaseId) : [];
    const h = r?.leaseId ? await held(U.DS, r.leaseId) : -1;
    return [m?.ok === true && h === 900000 && liabNet(es) === 900000 && es.length === 2, `${codeOf(m)} held=${h} jv=${es.length}`];
  });
  await T("M-4", "moveIn 12 ทางพร้อมกัน (4 โพรเซส) ⇒ ทุกตัว ok (duplicate หรือไม่) · ACTIVE 1 ครั้ง · JV 2 · ยอดถือ = ประกัน (X3)", ["createLease", "moveIn"], async () => {
    const r = await mkLease(cO, U.DS, RM["DS-37"], { depositSatang: 900000, bookingFeeSatang: 300000 });
    const L = r?.leaseId;
    if (!L) return [false, `สร้างไม่ได้ ${codeOf(r)}`];
    await addFiles(cO, U.DS, L, "ROOM_PHOTO", photos(6));
    await sign(cO, U.DS, L);
    const rs = await fanout("moveIn", cO, Array.from({ length: 12 }, () => ({ unitId: U.DS, leaseId: L, channel: "TRANSFER", paidAt: new Date().toISOString() })));
    const es = await depJVs(A, U.DS, L);
    const h = await held(U.DS, L);
    const fresh = rs.filter((x) => x?.ok === true && x?.duplicate === false).length;
    return [rs.length === 12 && rs.every((x) => x?.ok === true) && fresh <= 1 && es.length === 2 && h === 900000 && liabNet(es) === 900000, `ok=${rs.filter((x) => x?.ok === true).length} สด=${fresh} jv=${es.length} held=${h} อื่น=${J(rs.filter((x) => x?.ok !== true)).slice(0, 200)}`];
  });
  await T("M-5", "moveIn ซ้ำหลัง ACTIVE ⇒ ok duplicate true · ไม่มี JV/แถวอ่านมิเตอร์ใหม่ (X4)", ["moveIn"], async () => {
    const b4 = (await depJVs(A, U.DS, leaseM1)).length;
    const m = await moveIn(cO, U.DS, leaseM1);
    const af = (await depJVs(A, U.DS, leaseM1)).length;
    return [m?.ok === true && m?.duplicate === true && b4 === af && m?.heldSatang === 900000, `${J(m).slice(0, 160)} jv ${b4}→${af}`];
  });
  await T("M-6", "หน่วยไม่ผูกบัญชี ⇒ moveIn NOT_LINKED · สัญญายัง DRAFT · ไม่มี JV/แถวมิเตอร์วันเข้า (เงินก่อนสถานะ)", ["createLease", "moveIn"], async () => {
    const r = await mkLease(cO, U.DN, RM["DN-1"], { depositSatang: 900000, bookingFeeSatang: 0 });
    const L = r?.leaseId;
    if (!L) return [false, codeOf(r)];
    const mt = (await prisma.dormMeter.create({ data: { tenantId: A, unitId: U.DN, roomId: RM["DN-1"], kind: "ELEC", role: "ROOM", startReading: 100 } })).id;
    await addFiles(cO, U.DN, L, "ROOM_PHOTO", photos(6));
    await sign(cO, U.DN, L);
    const m = await moveIn(cO, U.DN, L, { meterReadings: [{ meterId: mt, value: 412 }] });
    const row = await prisma.dormLease.findUnique({ where: { id: L } });
    const jv = await prisma.accountJournalEntry.count({ where: { tenantId: A, refType: "DormSecurityDeposit", refId: `${U.DN}:${L}` } });
    const rd = await prisma.dormMeterReading.count({ where: { tenantId: A, leaseId: L } });
    return [failOk(m, "NOT_LINKED") && row?.status === "DRAFT" && jv === 0 && rd === 0, `${codeOf(m)} status=${row?.status} jv=${jv} readings=${rd}`];
  });
  await T("M-7", "สลับกัน: receiveBookingFee 6 + moveIn 6 พร้อมกัน (4 โพรเซส) ⇒ ยอดถือ = ประกันพอดี · JV 2 · ACTIVE", ["createLease", "receiveBookingFee", "moveIn"], async () => {
    const r = await mkLease(cO, U.DS, RM["DS-38"], { depositSatang: 900000, bookingFeeSatang: 450000 });
    const L = r?.leaseId;
    if (!L) return [false, codeOf(r)];
    await addFiles(cO, U.DS, L, "ROOM_PHOTO", photos(6));
    await sign(cO, U.DS, L);
    const half = Array.from({ length: 6 }, () => ({ unitId: U.DS, leaseId: L, channel: "CASH", paidAt: new Date().toISOString() }));
    const [ra, rb] = await Promise.all([fanout("receiveBookingFee", cO, half, { procs: 2 }), fanout("moveIn", cO, half, { procs: 2 })]);
    const es = await depJVs(A, U.DS, L);
    const h = await held(U.DS, L);
    const row = await prisma.dormLease.findUnique({ where: { id: L } });
    const bad = [...ra, ...rb].filter((x) => x?.threw || x?.childFail);
    return [h === 900000 && es.length === 2 && liabNet(es) === 900000 && row?.status === "ACTIVE" && !bad.length, `held=${h} jv=${es.length} status=${row?.status} จอง=${ra.map(codeOf).join(",")} เข้า=${rb.map(codeOf).join(",")}`];
  });
  await T("M-8", "ประกัน 0 + จอง 0 ⇒ เข้าอยู่ได้ · ไม่มี JV · depositDocumentId null", ["createLease", "moveIn"], async () => {
    const r = await mkLease(cO, U.DS, RM["DS-39"], { depositSatang: 0, bookingFeeSatang: 0 });
    const m = r?.leaseId ? await activate(cO, U.DS, r.leaseId) : null;
    const jv = r?.leaseId ? (await depJVs(A, U.DS, r.leaseId)).length : -1;
    const row = r?.leaseId ? await prisma.dormLease.findUnique({ where: { id: r.leaseId } }) : null;
    return [m?.ok === true && jv === 0 && row?.status === "ACTIVE" && row?.depositDocumentId === null, `${codeOf(m)} jv=${jv} status=${row?.status} doc=${row?.depositDocumentId}`];
  });
  await T("M-9", "ประกันผูกผู้เช่าของสัญญา (F3): ปิดประกันหักใบแจ้งหนี้ DORM ของผู้เช่าคนอื่น ⇒ NOT_FOUND · ของผู้เช่าเอง ⇒ หักได้ (partyId ส่งถูกคน)", ["getLease"], async () => {
    if (!leaseM1 || !partyM1) return [false, "ไม่มีสัญญา M-1"];
    const inv = (partyId: string, tag: string) => ACC.createExternalInvoice({ tenantId: A, sourceKind: "DORM", unitId: U.DS, refType: "DormBill", refId: `qc-d5-m9-${tag}-${stamp}`, customer: { name: `ผู้เช่า ${tag}` }, partyId,
      lines: [{ description: "ค่าน้ำประปา", qty: 1, unitPriceSatang: 30000, taxKind: "NONE" }], vat: { registered: false, pricesIncludeVat: true }, issueDate: TODAY, dueDate: TODAY });
    const other = await inv(PARTY_PC, "other");
    const own = await inv(partyM1, "own");
    const s1 = other?.ok ? await ACC.settleSecurityDeposit({ tenantId: A, unitId: U.DS, leaseId: leaseM1, idempotencyKey: `qc-d5-m9a-${stamp}`, applyToDocIds: [other.docId], refund: { channel: "TRANSFER" } }) : null;
    const s2 = own?.ok ? await ACC.settleSecurityDeposit({ tenantId: A, unitId: U.DS, leaseId: leaseM1, idempotencyKey: `qc-d5-m9b-${stamp}`, applyToDocIds: [own.docId], refund: { channel: "TRANSFER" } }) : null;
    return [other?.ok === true && own?.ok === true && s1?.ok === false && s1?.code === "NOT_FOUND" && s2?.ok === true && s2?.appliedSatang === 30000, `คนอื่น=${codeOf(s1)} ตัวเอง=${codeOf(s2)} applied=${s2?.appliedSatang}`];
  });

  // ORACLE-EDIT 29 ต.ค. (review) K1 K6: เงินกับสถานะสัญญา commit พร้อมกัน — ยิงเกิน pool ในโพรเซสเดียว (BLOCKER-1) + รุ่นข้ามโพรเซส
  const leaseInv = async (L: string) => {
    const row = await prisma.dormLease.findUnique({ where: { id: L } });
    const h = await ACC.securityDepositHeld({ tenantId: A, unitId: U.DM, leaseId: L });
    const jv = (await depJVs(A, U.DM, L)).length;
    return { status: row?.status as string, held: h as number, jv };
  };
  await T("M-10", "moveIn สัญญาเดียว 30 ทางในโพรเซสเดียว (+ รุ่น 3 โพรเซส × 10) ⇒ ไม่มี throw/UNAVAILABLE/RETRY_SAFE/P2028 · ทุกตัว ok · ทำจริง ≤ 1 · ACTIVE · ยอดถือ = ประกัน 900000 · JV 2 · จบใน 40 วิ", ["createLease", "moveIn"], async () => {
    const [L1, L2] = await prepSigned(DMR(1, 2));
    if (!L1 || L1.startsWith("ERR")) return [false, `เตรียมไม่ได้ ${L1}`];
    const { rs, ms } = await inProc(Array.from({ length: 30 }, () => () => moveIn(cO, U.DM, L1)));
    const i1 = await leaseInv(L1);
    const xs = L2 && !L2.startsWith("ERR") ? await fanout("moveIn", cO, Array.from({ length: 30 }, () => ({ unitId: U.DM, leaseId: L2, channel: "TRANSFER", paidAt: new Date().toISOString() })), { procs: 3 }) : [{ childFail: `เตรียม L2 ไม่ได้ ${L2}` }];
    const i2 = L2 && !L2.startsWith("ERR") ? await leaseInv(L2) : null;
    const good = (r: any[], inv: any) => !badOf(r).length && r.every((x) => x?.ok === true) && r.filter((x) => x?.duplicate === false).length <= 1 && inv?.status === "ACTIVE" && inv?.held === 900000 && inv?.jv === 2;
    return [good(rs, i1) && ms < 40_000 && good(xs, i2), `ในโพรเซส ${tally(rs)} ${ms}ms ${J(i1)} · ข้ามโพรเซส ${tally(xs)} ${J(i2)}`];
  });
  await T("M-11", "moveIn 20 สัญญาต่างกันพร้อมกันในโพรเซสเดียว (+ อีก 20 สัญญาจาก 2 โพรเซส × 10) ⇒ ทุกสัญญา ACTIVE · ยอดถือ 900000 · JV 2 · ไม่มีสัญญา DRAFT ที่มีเงินประกันเกินเงินจอง · ไม่มี UNAVAILABLE", ["createLease", "moveIn"], async () => {
    const Ls = await prepSigned(DMR(3, 20));
    const Lx = await prepSigned(DMR(23, 20));
    const errs = [...Ls, ...Lx].filter((x) => x.startsWith("ERR"));
    if (errs.length) return [false, `เตรียมไม่ได้ ${errs.slice(0, 3).join(",")}`];
    const { rs, ms } = await inProc(Ls.map((L) => () => moveIn(cO, U.DM, L)));
    const xs = await fanout("moveIn", cO, Lx.map((L) => ({ unitId: U.DM, leaseId: L, channel: "TRANSFER", paidAt: new Date().toISOString() })), { procs: 2 });
    // ORACLE-EDIT (ผู้คุม 29 ต.ค.): ใต้โหลดเครื่อง (หลายเลนรันพร้อมกัน) คิวเงินระดับร้าน ~0.7 วิ/สัญญา ⇒ RETRY_SAFE เป็นคำตอบที่ถูก (ไม่มีอะไรเปลี่ยน)
    //   เกณฑ์ = ผลแรกเป็น ok หรือ RETRY_SAFE เท่านั้น · กดซ้ำทีละตัวเฉพาะ RETRY_SAFE ⇒ ทุกสัญญา ACTIVE ฿9,000 JV 2 (perf ไม่ใช่เกณฑ์ของ D.5 ตามหลักเจ้าของ)
    const firstBad = [...rs, ...xs].filter((x) => !(x?.ok === true || x?.code === "RETRY_SAFE"));
    const retryIdx = [...rs, ...xs].map((x, i) => (x?.ok === true ? -1 : i)).filter((i) => i >= 0);
    const all = [...Ls, ...Lx];
    const again = [];
    for (const i of retryIdx) again.push(await moveIn(cO, U.DM, all[i]));
    const invs = [];
    for (const L of all) invs.push(await leaseInv(L));
    const wrong = invs.filter((i) => !(i.status === "ACTIVE" && i.held === 900000 && i.jv === 2));
    const draftMoney = invs.filter((i) => i.status === "DRAFT" && i.held > 300000).length;
    return [!badOf(rs).length && !badOf(xs).length && !firstBad.length && again.every((x) => x?.ok === true) && !wrong.length && !draftMoney,
      `ในโพรเซส ${tally(rs)} ${ms}ms · ข้ามโพรเซส ${tally(xs)} · กดซ้ำ ${again.length} ${tally(again)} · ผิด ${wrong.length} ${J(wrong.slice(0, 3))} · DRAFT มีเงิน ${draftMoney}`];
  });
  await T("M-12", "cancelLease ∥ receiveBookingFee ∥ moveIn บน 10 สัญญาพร้อมกัน (30 คำขอในโพรเซสเดียว) ⇒ ไม่มี UNAVAILABLE/throw · CANCELLED ⇒ ยอดถือ 0 ไม่มี JV · DRAFT ⇒ ยอดถือ 0 หรือเท่าเงินจอง · ACTIVE ⇒ 900000", ["createLease", "cancelLease", "receiveBookingFee", "moveIn"], async () => {
    const Ls = await prepSigned(DMR(43, 10));
    if (Ls.some((x) => x.startsWith("ERR"))) return [false, `เตรียมไม่ได้ ${Ls.find((x) => x.startsWith("ERR"))}`];
    const calls: (() => Promise<any>)[] = [];
    for (const L of Ls) {
      calls.push(() => fn("cancelLease")!(cO, { unitId: U.DM, leaseId: L, reason: "ผู้เช่าเปลี่ยนใจกะทันหัน" }));
      calls.push(() => fn("receiveBookingFee")!(cO, { unitId: U.DM, leaseId: L, channel: "CASH" }));
      calls.push(() => moveIn(cO, U.DM, L));
    }
    const { rs, ms } = await inProc(calls);
    const invs = [];
    for (const L of Ls) invs.push({ L, ...(await leaseInv(L)) });
    const wrong = invs.filter((i) => !((i.status === "CANCELLED" && i.held === 0 && i.jv === 0) || (i.status === "DRAFT" && (i.held === 0 || i.held === 300000)) || (i.status === "ACTIVE" && i.held === 900000)));
    return [!badOf(rs).length && !wrong.length, `${tally(rs)} ${ms}ms · สถานะ ${J(invs.map((i) => `${i.status}/${i.held}/${i.jv}`))}`];
  });

  // ORACLE-EDIT 29 ต.ค. (review รอบ 2): M-13 เตรียมผู้ติดต่อบัญชีไว้ก่อน (ฝั่งเงินชนะได้ ⇒ ทาง DEPOSIT_HELD ถูกทดสอบจริง) · M-14 40 สัญญาในโพรเซสเดียว (เพดานคิวระดับร้าน)
  await T("M-13", "cancel ∥ booking ∥ moveIn 12 สัญญา (36 คำขอในโพรเซสเดียว · ผู้เช่าคนเดียวที่มีผู้ติดต่อบัญชีแล้ว) ⇒ ไม่มี UNAVAILABLE/throw · ฝั่งเงินชนะได้จริง (มี DEPOSIT_HELD หรือ ACTIVE ≥ 1) · CANCELLED ⇒ ฿0 ไม่มี JV · ACTIVE ⇒ ฿9,000 JV 2 · DRAFT ⇒ ฿0/เงินจอง", ["createLease", "cancelLease", "receiveBookingFee", "moveIn"], async () => {
    const warm = await mkLease(cO, U.DM, RM["DM-94"], { depositSatang: 900000, bookingFeeSatang: 300000 });
    const P = warm?.partyId as string | undefined;
    const wb = warm?.leaseId ? await fn("receiveBookingFee")!(cO, { unitId: U.DM, leaseId: warm.leaseId, channel: "CASH" }) : null;
    if (!P || wb?.ok !== true) return [false, `เตรียมผู้ติดต่อไม่ได้ ${codeOf(warm)}/${codeOf(wb)}`];
    const Ls = await prepSigned(DMR(95, 12), { tenant: { partyId: P } });
    if (Ls.some((x) => x.startsWith("ERR"))) return [false, `เตรียมไม่ได้ ${Ls.find((x) => x.startsWith("ERR"))}`];
    const calls: (() => Promise<any>)[] = [];
    for (const L of Ls) {
      calls.push(() => moveIn(cO, U.DM, L));
      calls.push(() => fn("receiveBookingFee")!(cO, { unitId: U.DM, leaseId: L, channel: "CASH" }));
      calls.push(() => fn("cancelLease")!(cO, { unitId: U.DM, leaseId: L, reason: "ผู้เช่าเปลี่ยนใจกะทันหัน" }));
    }
    const { rs, ms } = await inProc(calls);
    const invs = [];
    for (const L of Ls) invs.push(await leaseInv(L));
    const wrong = invs.filter((i) => !((i.status === "CANCELLED" && i.held === 0 && i.jv === 0) || (i.status === "DRAFT" && (i.held === 0 || i.held === 300000)) || (i.status === "ACTIVE" && i.held === 900000 && i.jv === 2)));
    const moneyWon = rs.some((r) => r?.ok === false && r?.code === "DEPOSIT_HELD") || invs.some((i) => i.status === "ACTIVE");
    return [!badOf(rs).length && !wrong.length && moneyWon, `${tally(rs)} ${ms}ms · สถานะ ${J(invs.map((i) => `${i.status}/${i.held}/${i.jv}`))} · เงินชนะ=${moneyWon}`];
  });
  await T("M-14", "moveIn 40 สัญญาต่างกันพร้อมกันในโพรเซสเดียว ⇒ ไม่มี throw/P2028 · ไม่มี DRAFT ที่มีเงินเกินเงินจอง · ตัวที่ล้มต้องเป็นโค้ดตรงความจริง (\"ยังไม่มีอะไรเปลี่ยน\" ⇒ ยัง DRAFT ไม่มีเงินประกัน · RETRY_SAFE ได้) · กดซ้ำทีละตัว ⇒ ทุกสัญญา ACTIVE ฿9,000 JV 2", ["createLease", "moveIn"], async () => {
    const Ls = await prepSigned(DMR(54, 40));
    if (Ls.some((x) => x.startsWith("ERR"))) return [false, `เตรียมไม่ได้ ${Ls.find((x) => x.startsWith("ERR"))}`];
    const { rs, ms } = await inProc(Ls.map((L) => () => moveIn(cO, U.DM, L)));
    const hard = rs.filter((r) => r?.threw || /P2028|P2024|timed out|Unable to start a transaction|prisma/i.test(J(r)));
    const lies: string[] = [];
    for (let i = 0; i < Ls.length; i++) {
      const r = rs[i];
      if (r?.ok === true) continue;
      const inv = await leaseInv(Ls[i]);
      if (!(typeof r?.reason === "string" && THAI.test(r.reason))) lies.push(`${codeOf(r)}: ไม่มีเหตุผลไทย`);
      else if (/ยังไม่มีอะไรเปลี่ยน|ไม่มีอะไรเปลี่ยน/.test(r.reason) && !(inv.status === "DRAFT" && inv.held <= 300000)) lies.push(`${codeOf(r)} บอกไม่เปลี่ยนแต่ ${inv.status}/${inv.held}`);
    }
    const mid = [];
    for (const L of Ls) mid.push(await leaseInv(L));
    const draftMoney = mid.filter((i) => i.status === "DRAFT" && i.held > 300000).length;
    for (let i = 0; i < Ls.length; i++) if (mid[i].status !== "ACTIVE") await moveIn(cO, U.DM, Ls[i]);
    const fin = [];
    for (const L of Ls) fin.push(await leaseInv(L));
    const notDone = fin.filter((i) => !(i.status === "ACTIVE" && i.held === 900000 && i.jv === 2));
    return [!hard.length && !lies.length && !draftMoney && !notDone.length, `${tally(rs)} ${ms}ms · throw/P2028=${hard.length} · ข้อความไม่ตรง=${lies.slice(0, 3).join(" | ")} · DRAFT มีเงิน=${draftMoney} · หลังกดซ้ำยังไม่ครบ=${notDone.length}`];
  });

  // ═══════════════ F. ไฟล์ · ลงชื่อ · event · มิเตอร์วันเข้า ═══════════════
  console.log("\n── F ไฟล์ส่วนตัว · ลงชื่อ · dorm.lease.signed ──");
  let leaseF = "";
  await T("F-1", "addLeaseFiles ROOM_PHOTO 3 + ID_CARD 1 (pdf): FileAsset ของร้าน · path t/<tenant>/private/ · cdnUrl private:// · counts ถูก", ["createLease", "addLeaseFiles"], async () => {
    const r = await mkLease(cO, U.DU, RM["DU-204"], { startDate: "2026-05-01", months: 12, tenant: { name: "ณัฐชา ใจดี", phone: newPhone(), idCardNo: newIdCard() } });
    leaseF = r?.leaseId ?? "";
    const a = await addFiles(cO, U.DU, leaseF, "ROOM_PHOTO", photos(3));
    const b = await addFiles(cO, U.DU, leaseF, "ID_CARD", [{ data: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]), contentType: "application/pdf" }]);
    const ids = [...(a?.added ?? []), ...(b?.added ?? [])].map((x: any) => x.fileId);
    const fa = ids.length ? await prisma.fileAsset.findMany({ where: { id: { in: ids } } }) : [];
    const ok = a?.ok === true && b?.ok === true && fa.length === 4 && fa.every((f: any) => f.tenantId === A && f.path.startsWith(`t/${A}/private/`) && String(f.cdnUrl).startsWith("private://"))
      && b?.counts?.ROOM_PHOTO === 3 && b?.counts?.ID_CARD === 1;
    return [ok, `${codeOf(a)} ${codeOf(b)} assets=${fa.length} paths=${J(fa.map((f: any) => String(f.path).split("/").slice(0, 3).join("/")))} counts=${J(b?.counts)}`];
  });
  await T("F-2", "ไฟล์ผิด ⇒ INVALID_FILE ทั้งคำขอ (svg · text/html · > 10 MB) · 21 ไฟล์ ⇒ TOO_MANY · ไม่มี FileAsset เพิ่ม", ["addLeaseFiles"], async () => {
    const f0 = await prisma.fileAsset.count({ where: { tenantId: A } });
    const svg = await addFiles(cO, U.DU, leaseF, "ROOM_PHOTO", [{ data: JPEG, contentType: "image/jpeg" }, { data: new Uint8Array([60, 115, 118, 103, 62]), contentType: "image/svg+xml" }]);
    const html = await addFiles(cO, U.DU, leaseF, "DOCUMENT", [{ data: new Uint8Array([60, 104]), contentType: "text/html" }]);
    const big = await addFiles(cO, U.DU, leaseF, "ROOM_PHOTO", [{ data: new Uint8Array(10 * 1024 * 1024 + 1), contentType: "image/jpeg" }]);
    const many = await addFiles(cO, U.DU, leaseF, "ROOM_PHOTO", photos(21));
    const f1 = await prisma.fileAsset.count({ where: { tenantId: A } });
    return [failOk(svg, "INVALID_FILE") && failOk(html, "INVALID_FILE") && failOk(big, "INVALID_FILE") && failOk(many, "TOO_MANY") && f0 === f1, `${codeOf(svg)} ${codeOf(html)} ${codeOf(big)} ${codeOf(many)} assets ${f0}→${f1}`];
  });
  await T("F-3", "addLeaseFiles 6 ครั้งพร้อมกัน (ครั้งละรูป) ⇒ รูปเพิ่มครบ 6 (ไม่มีการเขียนทับกัน) · รวม ROOM_PHOTO = 9", ["addLeaseFiles", "getLease"], async () => {
    const rs = await Promise.all(Array.from({ length: 6 }, () => addFiles(cO, U.DU, leaseF, "ROOM_PHOTO", photos(1))));
    const g = await getL(cO, U.DU, leaseF);
    const row = await prisma.dormLease.findUnique({ where: { id: leaseF } });
    const list = Array.isArray(row?.moveInPhotos) ? row.moveInPhotos : [];
    return [rs.every((x) => x?.ok === true) && g?.files?.ROOM_PHOTO === 9 && list.filter((x: any) => x?.kind === "ROOM_PHOTO").length === 9 && list.every((x: any) => typeof x?.fileId === "string"), `ok=${rs.filter((x) => x?.ok).length} getLease=${J(g?.files)} json=${list.length}`];
  });
  await T("F-4", "leaseFileLinks (เจ้าของ): url = /api/files/<id>?exp&sig · ผ่านเฉพาะผู้ดูคนนั้น · ผู้ใช้อื่นไม่ผ่าน · หมดอายุไม่ผ่าน · อายุ ≤ 900 วิ · ไม่มี path/private:// ใน DTO", ["leaseFileLinks"], async () => {
    const r = await fn("leaseFileLinks")!(cO, { unitId: U.DU, leaseId: leaseF });
    const now = Math.floor(Date.now() / 1000);
    const bad: string[] = [];
    for (const f of r?.files ?? []) {
      const p = parseUrl(f.url);
      if (!p || p.id !== f.fileId) { bad.push(`url ${f.url}`); continue; }
      if (!STO.privateFileSignatureOk(p.id, p.exp, p.sig, { kind: "STAFF", id: OWN.id })) bad.push("ผู้ดูเดียวกันไม่ผ่าน");
      if (STO.privateFileSignatureOk(p.id, p.exp, p.sig, { kind: "STAFF", id: MGR.id })) bad.push("คนอื่นผ่าน");
      if (STO.privateFileSignatureOk(p.id, p.exp, p.sig, { kind: "STAFF", id: OWN.id }, Number(p.exp) + 1)) bad.push("หมดอายุยังผ่าน");
      if (Number(p.exp) - now > 900) bad.push(`อายุ ${Number(p.exp) - now}`);
    }
    const dto = J(r);
    return [r?.ok === true && (r?.files ?? []).length === 10 && !bad.length && !/private:\/\/|t\/[^"]*\/private\//.test(dto), `${codeOf(r)} n=${(r?.files ?? []).length} ${[...new Set(bad)].join(" · ")}`];
  });
  await T("F-5", "moveIn รูปห้องไม่ครบ (สัญญาใหม่มีรูป 5 + บัตร 1 · ขั้นต่ำ 6) ⇒ PHOTOS_REQUIRED (บัตรไม่นับ) · ไม่มี JV", ["createLease", "addLeaseFiles", "signLease", "moveIn"], async () => {
    const r = await mkLease(cO, U.DS, RM["DS-1"], { startDate: "2034-05-01", months: 12 });
    const L = r?.leaseId;
    if (!L) return [false, codeOf(r)];
    await addFiles(cO, U.DS, L, "ROOM_PHOTO", photos(5));
    await addFiles(cO, U.DS, L, "ID_CARD", photos(1));
    await sign(cO, U.DS, L);
    const m = await moveIn(cO, U.DS, L);
    const jv = (await depJVs(A, U.DS, L)).length;
    return [failOk(m, "PHOTOS_REQUIRED") && jv === 0, `${codeOf(m)} jv=${jv}`];
  });
  await T("F-6", "ลงชื่อ: moveIn ก่อนลงชื่อ ⇒ NOT_SIGNED · ไฟล์ svg ⇒ INVALID_FILE · ลงชื่อ ok (signedAt · signatureFileId ไฟล์ส่วนตัว) · ลงซ้ำ ⇒ ALREADY_SIGNED ไม่มีไฟล์ใหม่", ["moveIn", "signLease"], async () => {
    const ns = await moveIn(cO, U.DU, leaseF);
    const sv = await sign(cO, U.DU, leaseF, { file: { data: new Uint8Array([60, 115]), contentType: "image/svg+xml" } });
    const s = await sign(cO, U.DU, leaseF);
    const f0 = await prisma.fileAsset.count({ where: { tenantId: A } });
    const s2 = await sign(cO, U.DU, leaseF);
    const f1 = await prisma.fileAsset.count({ where: { tenantId: A } });
    const row = await prisma.dormLease.findUnique({ where: { id: leaseF } });
    const fa = row?.signatureFileId ? await prisma.fileAsset.findUnique({ where: { id: row.signatureFileId } }) : null;
    const ok = failOk(ns, "NOT_SIGNED") && failOk(sv, "INVALID_FILE") && s?.ok === true && !!row?.signedAt && row?.signatureFileId === s?.signatureFileId && String(fa?.path ?? "").startsWith(`t/${A}/private/`)
      && failOk(s2, "ALREADY_SIGNED") && f0 === f1;
    return [ok, `ก่อนลงชื่อ=${codeOf(ns)} svg=${codeOf(sv)} ลงชื่อ=${codeOf(s)} ซ้ำ=${codeOf(s2)} files ${f0}→${f1} path=${String(fa?.path ?? "").split("/").slice(0, 3).join("/")}`];
  });
  await T("F-7", "event dorm.lease.signed: 1 แถวต่อสัญญา · unitId ของแถว = หน่วย · payload ตรง 3 คีย์ {unitId, leaseId, roomId} · ไม่มีชื่อ/เบอร์/เงิน (X8)", [], async () => {
    const ev = (await prisma.outboxEvent.findMany({ where: { tenantId: A, type: EV } })).filter((e: any) => e.payload?.leaseId === leaseF);
    const p = ev[0]?.payload ?? {};
    const ok = ev.length === 1 && J(Object.keys(p).sort()) === J(["leaseId", "roomId", "unitId"]) && p.unitId === U.DU && p.roomId === RM["DU-204"] && ev[0]?.unitId === U.DU && !/ณัฐชา|ใจดี|\d{9,}/.test(J(p));
    return [ok, `n=${ev.length} payload=${J(p)} unit=${ev[0]?.unitId === U.DU}`];
  });
  await T("F-8", "ลงชื่อ 12 ทางพร้อมกัน (4 โพรเซส) ⇒ ok 1 · ALREADY_SIGNED 11 · event 1", ["createLease", "signLease"], async () => {
    const r = await mkLease(cO, U.DS, RM["DS-2"], { startDate: "2034-05-01", months: 12 });
    const L = r?.leaseId;
    if (!L) return [false, codeOf(r)];
    const rs = await fanout("signLease", cO, Array.from({ length: 12 }, () => ({ unitId: U.DS, leaseId: L, file: "PNG" })), { files: true });
    const ev = (await prisma.outboxEvent.findMany({ where: { tenantId: A, type: EV } })).filter((e: any) => e.payload?.leaseId === L).length;
    const okN = rs.filter((x) => x?.ok === true).length, dup = rs.filter((x) => x?.ok === false && x?.code === "ALREADY_SIGNED").length;
    return [okN === 1 && dup === 11 && ev === 1, `ok=${okN} already=${dup} event=${ev} อื่น=${J(rs.filter((x) => x?.ok !== true && x?.code !== "ALREADY_SIGNED")).slice(0, 200)}`];
  });
  await T("F-9", "มิเตอร์วันเข้า: มิเตอร์ห้องอื่น ⇒ NOT_FOUND (ไม่มีเงิน) · ok ⇒ DormMeterReading MOVE_IN (leaseId · งวดเดือนเริ่ม · ค่า) · moveIn ซ้ำไม่เพิ่มแถว", ["moveIn"], async () => {
    const mOwn = (await prisma.dormMeter.create({ data: { tenantId: A, unitId: U.DU, roomId: RM["DU-204"], kind: "ELEC", role: "ROOM", startReading: 400 } })).id;
    const mOther = (await prisma.dormMeter.create({ data: { tenantId: A, unitId: U.DU, roomId: RM["DU-205"], kind: "ELEC", role: "ROOM", startReading: 10 } })).id;
    const x = await moveIn(cO, U.DU, leaseF, { meterReadings: [{ meterId: mOther, value: 20 }] });
    const jv0 = (await depJVs(A, U.DU, leaseF)).length;
    const m = await moveIn(cO, U.DU, leaseF, { meterReadings: [{ meterId: mOwn, value: 412 }] });
    const m2 = await moveIn(cO, U.DU, leaseF, { meterReadings: [{ meterId: mOwn, value: 412 }] });
    const rows = await prisma.dormMeterReading.findMany({ where: { tenantId: A, leaseId: leaseF } });
    const ok = failOk(x, "NOT_FOUND") && jv0 === 0 && m?.ok === true && m2?.ok === true && rows.length === 1 && rows[0].kind === "MOVE_IN" && rows[0].value === 412 && rows[0].meterId === mOwn && rows[0].periodKey === "2026-05";
    return [ok, `ห้องอื่น=${codeOf(x)} jv=${jv0} moveIn=${codeOf(m)} ซ้ำ=${codeOf(m2)} rows=${J(rows.map((r: any) => ({ k: r.kind, v: r.value, p: r.periodKey })))}`];
  });

  // ORACLE-EDIT 29 ต.ค. (review) K7: HEIC ตรวจ brand
  await T("F-10", "ไฟล์ MP4 (ftyp mp42) ประกาศเป็น image/heic ⇒ INVALID_FILE ไม่มี FileAsset · HEIC จริง (brand heic) ⇒ ok (positive)", ["createLease", "addLeaseFiles"], async () => {
    const ab = (t: string) => [...t].map((c) => c.charCodeAt(0));
    const MP4 = new Uint8Array([0, 0, 0, 0x18, ...ab("ftypmp42"), 0, 0, 0, 0, ...ab("mp42isom")]);
    const HEIC = new Uint8Array([0, 0, 0, 0x18, ...ab("ftypheic"), 0, 0, 0, 0, ...ab("mif1heic")]);
    const r = await mkLease(cO, U.DS, RM["DS-7"], { startDate: "2036-05-01" });
    const f0 = await prisma.fileAsset.count({ where: { tenantId: A } });
    const bad = r?.leaseId ? await addFiles(cO, U.DS, r.leaseId, "ROOM_PHOTO", [{ data: MP4, contentType: "image/heic" }]) : null;
    const f1 = await prisma.fileAsset.count({ where: { tenantId: A } });
    const good = r?.leaseId ? await addFiles(cO, U.DS, r.leaseId, "ROOM_PHOTO", [{ data: HEIC, contentType: "image/heic" }]) : null;
    return [failOk(bad, "INVALID_FILE") && f0 === f1 && good?.ok === true, `mp4=${codeOf(bad)} assets ${f0}→${f1} heic=${codeOf(good)}`];
  }, "MAJOR");

  // ═══════════════ A. สิทธิ์ ═══════════════
  console.log("\n── A สิทธิ์ (leaseAccess · Membership สด) ──");
  await T("A-1", "leaseAccess: OWNER ทั้งคู่ · STAFF dorm.lease.manage ⇒ ทั้งคู่ · STAFF dorm.view ⇒ view เท่านั้น · คนจดมิเตอร์ ⇒ ไม่มี · STAFF หน่วยอื่น ⇒ ไม่มี · null ⇒ ไม่มี", ["leaseAccess"], async () => {
    const la = fn("leaseAccess")!;
    const got = [la(OWN, U.DS), la(STL, U.DS), la(STV, U.DS), la(STM, U.DS), la(STO2, U.DS), la(null, U.DS)].map((x: any) => `${x?.view}/${x?.manage}`);
    return [J(got) === J(["true/true", "true/true", "true/false", "false/false", "false/false", "false/false"]), J(got)];
  }, "MAJOR");
  await T("A-2", "facade บังคับสิทธิ์: STAFF dorm.view ⇒ createLease NOT_FOUND (ไม่มีแถว) · getLease ได้ · leaseFileLinks NOT_FOUND · คนจดมิเตอร์ ⇒ getLease null · listLeases ว่าง · STAFF dorm.lease.manage ⇒ สร้างได้", ["createLease", "getLease", "leaseFileLinks", "listLeases"], async () => {
    const c0 = await rowCounts(A);
    const v = await mkLease(cx(STV), U.DS, RM["DS-3"], { startDate: "2035-05-01" });
    const c1 = await rowCounts(A);
    const gv = await getL(cx(STV), U.DU, leaseF);
    const lv = await fn("leaseFileLinks")!(cx(STV), { unitId: U.DU, leaseId: leaseF });
    const gm = await getL(cx(STM), U.DU, leaseF);
    const lm = await fn("listLeases")!(cx(STM), { unitId: U.DU });
    const sl = await mkLease(cx(STL), U.DS, RM["DS-3"], { startDate: "2035-05-01" });
    const ok = failOk(v, "NOT_FOUND") && J(c0) === J(c1) && gv?.leaseId === leaseF && failOk(lv, "NOT_FOUND") && gm === null && (lm?.rows ?? []).length === 0 && sl?.ok === true;
    return [ok, `view สร้าง=${codeOf(v)} แถว=${J(c0) === J(c1)} view อ่าน=${!!gv} view ไฟล์=${codeOf(lv)} meter อ่าน=${J(gm)} meter รายการ=${(lm?.rows ?? []).length} lease สร้าง=${codeOf(sl)}`];
  });
  await T("A-3", "Membership อ่านสด: ถอนสิทธิ์ dorm.lease.manage แล้ว ⇒ NOT_FOUND ทันที · acceptedAt null ⇒ NOT_FOUND · คืนสิทธิ์ ⇒ ได้", ["createLease"], async () => {
    await prisma.membership.updateMany({ where: { userId: STL.id, tenantId: A }, data: { permissions: {} } });
    const a = await mkLease(cx(STL), U.DS, RM["DS-4"], { startDate: "2035-05-01" });
    await prisma.membership.updateMany({ where: { userId: STL.id, tenantId: A }, data: { permissions: { "dorm.lease.manage": true }, acceptedAt: null } });
    const b = await mkLease(cx(STL), U.DS, RM["DS-4"], { startDate: "2035-05-01" });
    await prisma.membership.updateMany({ where: { userId: STL.id, tenantId: A }, data: { acceptedAt: new Date() } });
    const c = await mkLease(cx(STL), U.DS, RM["DS-4"], { startDate: "2035-05-01" });
    return [failOk(a, "NOT_FOUND") && failOk(b, "NOT_FOUND") && c?.ok === true, `ถอน=${codeOf(a)} ไม่รับเชิญ=${codeOf(b)} คืน=${codeOf(c)}`];
  }, "MAJOR");

  // ═══════════════ X. ข้ามร้าน · ข้ามหน่วย ═══════════════
  console.log("\n── X ข้ามร้าน/ข้ามหน่วย (X1) ──");
  await T("X-1", "ร้าน B เรียกด้วย leaseId/unitId ของร้าน A ⇒ ทุกฟังก์ชันเขียน NOT_FOUND · อ่าน null · reason เดียวกับ id สุ่ม (ไม่บอกว่ามีอยู่)", API.filter((n) => n !== "leaseAccess" && n !== "findTenantCandidates" && n !== "listLeases"), async () => {
    const bad: string[] = [];
    const reasons = new Set<string>();
    for (const [ctx, unitId, leaseId] of [[cB, U.DS, leaseM1], [cB, U.DB, leaseM1], [cO, U.DS, `nope${stamp}`]] as const) {
      const calls: [string, any][] = [
        ["signLease", await sign(ctx, unitId, leaseId)], ["moveIn", await moveIn(ctx, unitId, leaseId)],
        ["receiveBookingFee", await fn("receiveBookingFee")!(ctx, { unitId, leaseId })], ["cancelLease", await fn("cancelLease")!(ctx, { unitId, leaseId, reason: "ทดสอบข้ามร้าน" })],
        ["addLeaseFiles", await addFiles(ctx, unitId, leaseId, "ROOM_PHOTO", photos(1))], ["leaseFileLinks", await fn("leaseFileLinks")!(ctx, { unitId, leaseId })],
        ["leaseContract", await fn("leaseContract")!(ctx, { unitId, leaseId })], ["updateLeaseOccupants", await fn("updateLeaseOccupants")!(ctx, { unitId, leaseId, occupants: [], vehicles: [] })],
      ];
      for (const [n, r] of calls) { if (!failOk(r, "NOT_FOUND")) bad.push(`${n}=${codeOf(r)}`); else reasons.add(r.reason); }
      const g = await getL(ctx, unitId, leaseId);
      if (g !== null) bad.push(`getLease=${J(g).slice(0, 40)}`);
    }
    return [!bad.length && reasons.size === 1, `${bad.join(" · ")} reasons=${reasons.size}`];
  });
  await T("X-2", "createLease: ห้องของร้าน B · ห้องหน่วยอื่นในร้าน · หน่วยโรงแรม (ไม่ใช่ DORM) · ผู้กระทำร้าน B บน ctx ร้าน A ⇒ NOT_FOUND ทั้งหมด · ไม่มีแถว", ["createLease"], async () => {
    const c0 = await rowCounts(A);
    const a = await mkLease(cO, U.DS, RM["DB-1"]);
    const b = await mkLease(cO, U.DS, RM["DW-5"]);
    const c = await mkLease(cO, U.HA, RM["HA-1"]);
    const d = await mkLease({ tenantId: A, actorUserId: OWNB.id }, U.DS, RM["DS-5"], { startDate: "2035-05-01" });
    const c1 = await rowCounts(A);
    return [[a, b, c, d].every((r) => failOk(r, "NOT_FOUND")) && J(c0) === J(c1), `${[a, b, c, d].map(codeOf).join(",")} แถว=${J(c0) === J(c1)}`];
  });
  await T("X-3", "listLeases/findTenantCandidates: ร้าน B ไม่เห็นของร้าน A · หน่วย DS2 ไม่เห็นสัญญาหน่วย DS", ["listLeases", "findTenantCandidates"], async () => {
    const b = await fn("listLeases")!(cB, { unitId: U.DS });
    const b2 = await fn("listLeases")!(cB, { unitId: U.DB });
    const s2 = await fn("listLeases")!(cO, { unitId: U.DS2, tab: "BOOKED" });
    const ds = await fn("listLeases")!(cO, { unitId: U.DS, tab: "BOOKED" });
    const leak = (x: any) => (x?.rows ?? []).some((r: any) => r.leaseId === leaseM1 || r.leaseId === leaseC1);
    const fc = await fn("findTenantCandidates")!(cB, { unitId: U.DS, phone: PH1 });
    return [!leak(b) && !leak(b2) && !leak(s2) && (s2?.rows ?? []).every((r: any) => r.roomNumber.startsWith("DS2")) && (ds?.rows ?? []).length > 0 && Array.isArray(fc) && fc.length === 0,
      `B=${(b?.rows ?? []).length}/${(b2?.rows ?? []).length} DS2=${(s2?.rows ?? []).length} DS=${(ds?.rows ?? []).length} fc=${J(fc).slice(0, 60)}`];
  });
  await T("X-4", "STAFF ที่มี dorm.lease.manage เฉพาะหน่วยอื่น ⇒ NOT_FOUND ที่หน่วยนี้ (สร้าง · อ่าน) · ร้าน B เรียกหน่วยตัวเองได้ปกติ (positive)", ["createLease", "getLease"], async () => {
    const a = await mkLease(cx(STO2), U.DS, RM["DS-6"], { startDate: "2035-05-01" });
    const g = await getL(cx(STO2), U.DS, leaseM1);
    const bOwn = await mkLease(cB, U.DB, RM["DB-1"], { tenant: T_("ผู้เช่าร้าน B") });
    return [failOk(a, "NOT_FOUND") && g === null && bOwn?.ok === true, `${codeOf(a)} get=${J(g)} B=${codeOf(bOwn)}`];
  });

  // ═══════════════ ORACLE-EDIT 29 ต.ค. (review) K2: C-7 ข้อความสัญญาที่ render แล้วต้องไม่มีคำต้องห้าม (วางท้าย — กวาดทุกสัญญาที่ข้อสอบสร้าง) ═══════════════
  await T("C-7", "แม่แบบคั่นตัวแปร \"ตัด{extraClauses}ไฟ / ล็อก{extraClauses}ห้อง\" ⇒ LEGAL_BLOCK ทุกโหมด (STRICT · WARN+เจ้าของ ack · OUT_OF_SCOPE) ไม่มีแถว · ชื่อหอ \"หอพักล็อกห้องได้\" ⇒ LEGAL_BLOCK · ทุกสัญญาที่สร้างสำเร็จ: leaseContract ไม่มีคำต้องห้าม (แทนชื่อผู้เช่าก่อนตรวจ) · snapshot ที่ถูกแก้ให้มีคำต้องห้าม ⇒ leaseContract/signLease ไม่ปล่อยข้อความออก", ["createLease", "leaseContract", "signLease"], async () => {
    const okBlock = (r: any) => failOk(r, "LEGAL_BLOCK") && ["TEMPLATE_NO_THREAT", "CONTRACT_FORBIDDEN_TERM"].includes(String(legalCodeOf(r)));
    const c0 = await rowCounts(A);
    const ts = await mkLease(cO, U.DTS, RM["DTS-1"]);
    const tw = await mkLease(cO, U.DTW, RM["DTW-1"], { legalAck: ACK });
    const to = await mkLease(cO, U.DTO, RM["DTO-1"]);
    const un = await mkLease(cO, U.DUN, RM["DUN-1"]);
    const c1 = await rowCounts(A);
    const bad: string[] = [];
    if (![ts, tw, to, un].every(okBlock)) bad.push(`แม่แบบ ${[ts, tw, to, un].map((r) => `${codeOf(r)}/${legalCodeOf(r)}`).join(",")}`);
    if (J(c0) !== J(c1)) bad.push(`แถว ${J(c0)} → ${J(c1)}`);
    const findF = LEGAL.findForbiddenTerms as (t: string) => string[];
    const live = await prisma.dormLease.findMany({ where: { tenantId: A, status: { in: ["DRAFT", "ACTIVE", "NOTICE"] } }, select: { id: true, unitId: true, partyId: true } });
    let scanned = 0;
    for (const l of live) {
      const c = await fn("leaseContract")!(cO, { unitId: l.unitId, leaseId: l.id });
      if (c?.ok !== true) { bad.push(`leaseContract ${codeOf(c)}`); continue; }
      const p = await prisma.party.findUnique({ where: { id: l.partyId }, select: { name: true } });
      const text = String(c.textTh ?? "").split(String(p?.name ?? "\u0000")).join("ผู้เช่า");
      const hit = findF(text);
      if (hit.length) bad.push(`สัญญามีคำต้องห้าม ${hit.join(",")}`);
      scanned++;
    }
    const tamper = leaseC1 ? await prisma.dormLease.findUnique({ where: { id: leaseC1 } }) : null;
    let leak = "ไม่มีสัญญา C-1";
    if (tamper?.policySnapshot) {
      const snap = JSON.parse(JSON.stringify(tamper.policySnapshot));
      snap.contract = { ...(snap.contract ?? {}), textTh: `${snap.contract?.textTh ?? ""}\nหากค้างชำระ ผู้ให้เช่าจะตัดไฟและล็อกห้องทันที` };
      await prisma.dormLease.update({ where: { id: leaseC1 }, data: { policySnapshot: snap } });
      const lc = await fn("leaseContract")!(cO, { unitId: U.DS, leaseId: leaseC1 });
      const sg = await sign(cO, U.DS, leaseC1);
      const row = await prisma.dormLease.findUnique({ where: { id: leaseC1 } });
      leak = lc?.ok === false && !findF(J(lc)).length && sg?.ok === false && !row?.signedAt ? "" : `แก้ snapshot: leaseContract=${codeOf(lc)} sign=${codeOf(sg)} signed=${!!row?.signedAt}`;
    }
    if (leak) bad.push(leak);
    return [!bad.length && scanned >= 30, `${bad.slice(0, 5).join(" · ")} · กวาด ${scanned} สัญญา`];
  });

  // ORACLE-EDIT 29 ต.ค. (review รอบ 2) K8: คำต้องห้ามคร่อมขอบ {tenantName} · K9: getLease ไม่ส่งข้อความสัญญาที่มีคำต้องห้าม
  await T("C-10", "แม่แบบ \"…ผู้ให้เช่าจะตัด{tenantName}\" + ชื่อผู้เช่า \"ไฟห้องทันที สมชาย\" ⇒ LEGAL_BLOCK ไม่มีแถว (คำคร่อมขอบตัวแปร) · (positive) ชื่อปกติ ⇒ ทำสัญญาได้ และข้อความไม่มีคำต้องห้าม", ["createLease", "leaseContract"], async () => {
    const c0 = await rowCounts(A);
    const bad = await mkLease(cO, U.DTN, RM["DTN-1"], { tenant: T_(`ไฟห้องทันที สมชาย ${stamp}`) });
    const c1 = await rowCounts(A);
    const good = await mkLease(cO, U.DTN, RM["DTN-2"], { tenant: T_(`สมชาย ใจดี ${stamp}`) });
    const gc = good?.leaseId ? await fn("leaseContract")!(cO, { unitId: U.DTN, leaseId: good.leaseId }) : null;
    const findF = LEGAL.findForbiddenTerms as (t: string) => string[];
    return [failOk(bad, "LEGAL_BLOCK") && J(c0) === J(c1) && good?.ok === true && gc?.ok === true && !findF(String(gc?.textTh ?? "")).length,
      `คร่อมขอบ=${codeOf(bad)}/${legalCodeOf(bad)} แถว=${J(c0) === J(c1)} · ปกติ=${codeOf(good)}/${codeOf(gc)}`];
  });
  await T("C-11", "getLease ของสัญญาที่ snapshot ถูกแก้ให้มีคำต้องห้าม (C-7) ⇒ DTO ไม่มีคำต้องห้ามเลย + legalBlocked true · (positive) สัญญาปกติ ⇒ legalBlocked false และยังเห็นข้อความสัญญา", ["getLease"], async () => {
    if (!leaseC1 || !leaseDC) return [false, "ไม่มีสัญญา C-1/C-2"];
    const findF = LEGAL.findForbiddenTerms as (t: string) => string[];
    const g = await getL(cO, U.DS, leaseC1);
    const tampered = String(J((await prisma.dormLease.findUnique({ where: { id: leaseC1 } }))?.policySnapshot)).includes("ตัดไฟ");
    const ok0 = await getL(cO, U.DC, leaseDC);
    const hit = findF(J(g));
    return [!!g && tampered && !hit.length && g?.legalBlocked === true && ok0?.legalBlocked === false && String(ok0?.policySnapshot?.contract?.textTh ?? "").length > 0,
      `snapshot ถูกแก้=${tampered} คำในDTO=${hit.join(",") || "—"} legalBlocked=${g?.legalBlocked} · ปกติ legalBlocked=${ok0?.legalBlocked} มีข้อความ=${String(ok0?.policySnapshot?.contract?.textTh ?? "").length > 0}`];
  });

  // ═══════════════ U. จอ หอ 02 ═══════════════
  console.log("\n── U จอผู้เช่าและสัญญา (ภาพ หอ 02) ──");
  // ฉาก DU: 204 ACTIVE (ณัฐชา · 2026-05-01 +12) · 202 ACTIVE ใกล้หมด · 203 NOTICE · 205 DRAFT จองรับแล้ว · 206 ENDED · 201 CANCELLED
  let uReady = false;
  const DUL: Record<string, string> = {};
  try {
    if (fn("createLease") && fn("moveIn") && leaseF) {
      DUL["204"] = leaseF;
      const g204 = await getL(cO, U.DU, leaseF);
      if (g204?.status !== "ACTIVE") await moveIn(cO, U.DU, leaseF);
      const r202 = await mkLease(cO, U.DU, RM["DU-202"], { startDate: D(-330), months: 12, tenant: T_(`จักรพันธ์ ทองดี ${stamp}`) });
      if (r202?.leaseId) { DUL["202"] = r202.leaseId; await activate(cO, U.DU, r202.leaseId); }
      const r203 = await mkLease(cO, U.DU, RM["DU-203"], { startDate: D(-100), months: 12, tenant: T_(`นิภา วงศ์ใหญ่ ${stamp}`) });
      if (r203?.leaseId) { DUL["203"] = r203.leaseId; await activate(cO, U.DU, r203.leaseId); await prisma.dormLease.update({ where: { id: r203.leaseId }, data: { status: "NOTICE" } }); }
      const r205 = await mkLease(cO, U.DU, RM["DU-205"], { startDate: D(12), months: 12, depositSatang: 900000, bookingFeeSatang: 900000, tenant: T_(`เบญจา คำแก้ว ${stamp}`) });
      if (r205?.leaseId) { DUL["205"] = r205.leaseId; await fn("receiveBookingFee")!(cO, { unitId: U.DU, leaseId: r205.leaseId, channel: "TRANSFER" }); }
      const r206 = await mkLease(cO, U.DU, RM["DU-206"], { startDate: D(-500), months: 12, tenant: T_(`ธนพล ย้ายออก ${stamp}`) });
      if (r206?.leaseId) { DUL["206"] = r206.leaseId; await prisma.dormLease.update({ where: { id: r206.leaseId }, data: { status: "ENDED", endedAt: new Date() } }); }
      const r201 = await mkLease(cO, U.DU, RM["DU-201"], { startDate: D(30), months: 12, tenant: T_(`ยกเลิก ${stamp}`) });
      if (r201?.leaseId) { DUL["201"] = r201.leaseId; await fn("cancelLease")!(cO, { unitId: U.DU, leaseId: r201.leaseId, reason: "ผู้เช่าเปลี่ยนใจ" }); }
      uReady = Object.keys(DUL).length === 6;
    }
  } catch (e) { console.log(`  ⚠️ ฉาก DU ล้ม: ${errMsg(e)}`); }
  const want = { CURRENT: ["202", "203", "204"], BOOKED: ["205"], EXPIRING: ["202"], NOTICE: ["203"], ENDED: ["206"] } as const;
  await T("U-4", "listLeases: แท็บ CURRENT=ACTIVE+NOTICE · BOOKED=DRAFT · EXPIRING=ACTIVE ≤ 60 วัน · NOTICE · ENDED (ไม่มี CANCELLED) · counts ครบ · heldTotal = Σ ยอดถือ DRAFT/ACTIVE/NOTICE · q เลขห้อง/ชื่อ/เบอร์", ["listLeases"], async () => {
    if (!uReady) return [false, `ฉาก DU ไม่ครบ ${J(Object.keys(DUL))}`];
    const L = fn("listLeases")!;
    const bad: string[] = [];
    for (const [tab, rooms] of Object.entries(want)) {
      const r = await L(cO, { unitId: U.DU, tab });
      const got = (r?.rows ?? []).map((x: any) => x.roomNumber).sort();
      if (J(got) !== J([...rooms])) bad.push(`${tab}=${J(got)}`);
      if (r?.counts?.[tab] !== rooms.length) bad.push(`counts.${tab}=${r?.counts?.[tab]}`);
    }
    const all = await L(cO, { unitId: U.DU });
    let sum = 0;
    for (const n of ["202", "203", "204", "205"]) sum += await held(U.DU, DUL[n]);
    if (all?.heldTotalSatang !== sum || sum !== 900000 * 4) bad.push(`heldTotal=${all?.heldTotalSatang} Σ=${sum}`);
    const r204 = (all?.rows ?? []).find((x: any) => x.roomNumber === "204");
    if (!r204 || r204.startDate !== "2026-05-01" || r204.endDate !== "2027-04-30" || r204.months !== 12 || r204.rentSatang !== 450000 || r204.heldSatang !== 900000 || r204.daysToEnd !== daysBetween(TODAY, "2027-04-30")) bad.push(`row204=${J(r204)}`);
    const q1 = await L(cO, { unitId: U.DU, q: "204" });
    const q2 = await L(cO, { unitId: U.DU, q: "ณัฐชา" });
    if (J((q1?.rows ?? []).map((x: any) => x.roomNumber)) !== J(["204"]) || J((q2?.rows ?? []).map((x: any) => x.roomNumber)) !== J(["204"])) bad.push(`q=${J(q1?.rows?.length)}/${J(q2?.rows?.length)}`);
    if (J(all).match(/0[689]\d{8}/)) bad.push("มีเบอร์เต็มใน DTO");
    return [!bad.length, bad.join(" · ")];
  });
  let listU: any = null, selU: any = null;
  if (uReady && fn("listLeases") && fn("getLease")) { listU = await fn("listLeases")!(cO, { unitId: U.DU, tab: "CURRENT" }); selU = await getL(cO, U.DU, DUL["204"]); }
  await T("U-1", "TenantsScreen: data-dorm-tenants · หัว \"ผู้เช่าและสัญญา\" · ลิงก์ทำสัญญาใหม่ · แท็บ 5 อัน (ป้ายไทย + ตัวเลข counts) · แถว data-lease-row ตาม rows · ท้ายตาราง \"เงินประกันที่ถือไว้ทั้งตึก\" ฿36,000", ["listLeases"], async () => {
    if (!listU) return [false, "ไม่มีข้อมูลจาก listLeases/ฉาก DU"];
    const h = render({ unitSlug: "d5du", tab: "CURRENT", q: null, list: listU, selected: selU });
    const t = textOf(h);
    const tabs = boxes(h, "data-lease-tab");
    const rows = boxes(h, "data-lease-row");
    const labels: Record<string, RegExp> = { CURRENT: /ผู้เช่าปัจจุบัน/, BOOKED: /จอง/, EXPIRING: /ใกล้หมด/, NOTICE: /แจ้งย้ายออก/, ENDED: /ย้ายออกแล้ว/ };
    const tabOk = Object.keys(labels).every((k) => { const b = tabs.find((x) => x.attrs["data-lease-tab"] === k); return !!b && labels[k].test(textOf(b.html)) && textOf(b.html).includes(String(listU.counts[k])); });
    const ok = /data-dorm-tenants/.test(h) && /ผู้เช่าและสัญญา/.test(t) && /href="\/app\/u\/d5du\/dorm\/tenants\/new"/.test(h) && tabOk
      && J(rows.map((r) => r.attrs["data-room-number"]).sort()) === J(["202", "203", "204"]) && rows.every((r) => r.attrs["data-lease-row"] && r.attrs["data-status"])
      && /เงินประกันที่ถือไว้ทั้งตึก/.test(t) && /฿36,000/.test(t);
    return [ok, `tabs=${tabs.length}/${tabOk} rows=${J(rows.map((r) => r.attrs["data-room-number"]))} new=${/dorm\/tenants\/new/.test(h)} รวม=${/฿36,000/.test(t)}`];
  }, "MAJOR", true);
  await T("U-2", "แผง data-lease-panel ห้อง 204: ชื่อ · ช่วง 1 พ.ค. 69 – 30 เม.ย. 70 · ค่าห้อง ฿4,500 · ครบกำหนดทุกวันที่ 5 · ประกันถือ ฿9,000 + เลขใบรับเงินประกัน · \"หนี้สิน\" · รูปห้องวันเข้า 9 รูป · ประกาศ สคบ. · ปุ่ม ต่อสัญญา/ย้ายห้อง/แจ้งย้ายออก · แถว 204 data-selected", ["getLease"], async () => {
    if (!listU || !selU) return [false, "ไม่มีข้อมูลฉาก"];
    const h = render({ unitSlug: "d5du", tab: "CURRENT", q: null, list: listU, selected: selU });
    const panel = boxes(h, "data-lease-panel").find((b) => b.attrs["data-lease-panel"] === DUL["204"]);
    const t = textOf(panel?.html ?? "");
    const rec = (selU?.receipts ?? [])[0]?.entryNo ?? "∅";
    const row = boxes(h, "data-lease-row").find((r) => r.attrs["data-room-number"] === "204");
    const need: [string, boolean][] = [["ชื่อ", t.includes("ณัฐชา ใจดี")], ["ห้อง", /ห้อง\s*204/.test(t)], ["ช่วง", /1 พ\.ค\. 69/.test(t) && /30 เม\.ย\. 70/.test(t)], ["ค่าห้อง", t.includes("฿4,500")],
      ["ครบกำหนด", /ทุกวันที่\s*5/.test(t)], ["ประกัน", t.includes("฿9,000")], ["ใบรับ", t.includes(rec)], ["หนี้สิน", /หนี้สิน/.test(t)], ["รูป", /รูปห้องวันเข้า\s*9\s*รูป/.test(t)], ["สคบ", /ประกาศ สคบ\./.test(t)],
      ["ปุ่ม", /ต่อสัญญา/.test(t) && /ย้ายห้อง/.test(t) && /แจ้งย้ายออก/.test(t)], ["selected", row?.attrs["data-selected"] === "true"]];
    const miss = need.filter(([, ok]) => !ok).map(([n]) => n);
    return [!!panel && !miss.length, panel ? `ขาด ${miss.join(", ")} · ${t.slice(0, 200)}` : "ไม่มี data-lease-panel ของ 204"];
  }, "MAJOR", true);
  await T("U-3", "จอไม่มีเบอร์เต็ม/เลขบัตรของผู้เช่า (X8) · ไม่มีคำต้องห้าม สคบ. · ทุกแท็บ render ได้", ["getLease"], async () => {
    if (!listU || !selU) return [false, "ไม่มีข้อมูลฉาก"];
    const p = await prisma.party.findUnique({ where: { id: selU.partyId } });
    const hs: string[] = [];
    for (const tab of Object.keys(want)) { const l = await fn("listLeases")!(cO, { unitId: U.DU, tab }); hs.push(render({ unitSlug: "d5du", tab, q: null, list: l, selected: selU })); }
    const all = hs.join("\n");
    const leaks = [p?.phoneNorm, p?.taxId].filter((x) => typeof x === "string" && x.length >= 9 && all.includes(x));
    const legal = LEGAL_BAD.exec(textOf(all));
    return [!leaks.length && !legal && hs.length === 5, `รั่ว=${leaks.length} คำต้องห้าม=${legal?.[0] ?? "—"}`];
  }, "CRITICAL", true);

  // ORACLE-EDIT 29 ต.ค. (review) K4: เลขบัตร/เบอร์ห้ามอยู่ใน URL
  {
    const n = stripComments(read("src/app/app/u/[unitSlug]/dorm/tenants/new/page.tsx"));
    const a = stripComments(read("src/app/app/u/[unitSlug]/dorm/tenants/actions.ts"));
    const getForms = [...n.matchAll(/<form\b[^>]*method\s*=\s*["'{]\s*["']?get["'][\s\S]*?<\/form>/gi)].map((m) => m[0]);
    const piiInGet = getForms.filter((f) => /name\s*=\s*["'](findId|findPhone|idCardNo|idCard|phone|tel)["']/i.test(f)).length;
    const spRead = /(searchParams|\bsp)\s*(\??\.)\s*(findId|findPhone|idCardNo|idCard|phone)\b|\[\s*["'](findId|findPhone|idCardNo|phone)["']\s*\]/.test(n);
    const action = /export\s+async\s+function\s+\w+[\s\S]{0,1500}?findTenantCandidates\s*\(/.test(a);
    chk("U-5", "หน้า new: ไม่มีฟอร์ม GET ที่ส่งเลขบัตร/เบอร์ · ไม่อ่าน findId/เบอร์จาก searchParams · ค้นผู้เช่าผ่าน server action (POST) ที่เรียก findTenantCandidates (PDPA · ไม่ลง URL/log)",
      !!n && !piiInGet && !spRead && action, n ? `GET+PII=${piiInGet} searchParams=${spRead} action=${action}` : "ยังไม่มีไฟล์", "MAJOR");
  }

  // ═══════════════ Q. ฉาก svcqc ═══════════════
  console.log("\n── Q ฉากผู้เช่า (svcqc · บ้านสวนอพาร์ตเมนต์) ──");
  const SV = (await import("./svc-qc-data.mjs" as string)) as any;
  const svcT = SV.SQC_TENANT.id as string;
  const svcDorm = SV.SQC_UNITS.dorm.id as string;
  const svcOwner = (SV.SQC_USERS as any[]).find((u) => u.key === "owner")?.userId as string;
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
    for (const [id, n] of [["Q-1", "ฉากรันได้"], ["Q-2", "ฉาก 31 + จอง 1 · ฿296,400 · 204 ณัฐชา"], ["Q-3", "รันซ้ำไม่เขียน"]]) skip(id, n, `ร้าน svcqc หอมีห้อง ${seeded} (ต้อง 36) — รัน scripts/seed-svc-qc.mts ก่อน`, "MAJOR");
  } else {
    await T("Q-1", "ฉากผัง R0.9 แล้วฉากผู้เช่ารันได้ (exit 0) · พิมพ์ SCENE_SUMMARY {created,updated,removed}", [], async () => {
      if (!existsSync(join(ROOT, F.scene))) return [false, `ยังไม่มี ${F.scene}`];
      const pre = runTsx("scripts/svc-qc-roomboard-scene.mts");
      const r = runTsx(F.scene);
      return [pre.status === 0 && r.status === 0 && !!r.sum && ["created", "updated", "removed"].every((k) => typeof r.sum[k] === "number"), `ผัง exit=${pre.status} ผู้เช่า exit=${r.status} ${r.sum ? J(r.sum) : r.out.split("\n").slice(-4).join(" | ").slice(0, 240)}`];
    }, "MAJOR");
    await T("Q-2", "listLeases svcqc: ผู้เช่าปัจจุบัน 31 · จอง/รอเข้า 1 (207) · ประกันถือรวม ฿296,400 · 204 = ณัฐชา ใจดี ฿4,500 ลงชื่อแล้ว รูปวันเข้า 18 ยอดถือ ฿9,000", ["listLeases", "getLease"], async () => {
      const ctx = { tenantId: svcT, actorUserId: svcOwner };
      const l = await fn("listLeases")!(ctx, { unitId: svcDorm });
      const b = await fn("listLeases")!(ctx, { unitId: svcDorm, tab: "BOOKED" });
      const r204 = (l?.rows ?? []).find((x: any) => x.roomNumber === "204");
      const g = r204 ? await fn("getLease")!(ctx, { unitId: svcDorm, leaseId: r204.leaseId }) : null;
      const ok = l?.counts?.CURRENT === 31 && l?.counts?.BOOKED === 1 && J((b?.rows ?? []).map((x: any) => x.roomNumber)) === J(["207"]) && l?.heldTotalSatang === 29_640_000
        && g?.tenantName === "ณัฐชา ใจดี" && g?.rentSatang === 450000 && !!g?.signedAt && g?.files?.ROOM_PHOTO === 18 && g?.heldSatang === 900000;
      return [ok, `counts=${J(l?.counts)} held=${l?.heldTotalSatang} 204=${J(g && { n: g.tenantName, r: g.rentSatang, s: !!g.signedAt, p: g.files?.ROOM_PHOTO, h: g.heldSatang })}`];
    }, "MAJOR");
    await T("Q-3", "รันฉากผู้เช่าซ้ำ ⇒ SCENE_SUMMARY 0/0/0", [], async () => {
      if (!existsSync(join(ROOT, F.scene))) return [false, `ยังไม่มี ${F.scene}`];
      const r = runTsx(F.scene);
      return [r.status === 0 && r.sum?.created === 0 && r.sum?.updated === 0 && r.sum?.removed === 0, `exit=${r.status} ${J(r.sum)}`];
    }, "MAJOR");
  }

  // ═══════════════ V. ภาพ ═══════════════
  console.log("\n── V ภาพผู้เช่าและสัญญา (ภาพ หอ 02) ──");
  {
    const specs = SV.SQC_VISUAL_SPECS?.["d.5"];
    const base = process.env.QC_BASE ?? "";
    const name = "ภาพ dorm-tenants (?room=204) 1440 + 390 ด้วยผู้ใช้ owner · HTTP < 400 · ไม่ล้นแนวนอน";
    if (!Array.isArray(specs) || !specs.some((s: any) => s.path === `/app/u/${SV.SQC_UNITS.dorm.slug}/dorm/tenants?room=204`)) fail("V-1", name, `ไม่มี SQC_VISUAL_SPECS d.5 ${J(specs)}`, "MAJOR");
    else if (!base) skip("V-1", name, "ไม่มี QC_BASE — ผู้คุม build QC ผ่าน iso + reseed + รันฉาก แล้วรันซ้ำด้วย QC_BASE=http://127.0.0.1:<port>", "MAJOR");
    else {
      const r = spawnSync("pnpm", ["exec", "tsx", "scripts/visual-svc.mts", "d.5", "--user", "owner", "--base", base], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
      const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
      if (r.status === 0) pass("V-1", `${name} (ภาพ .qc-shots/svc/d.5 — ผู้คุมเทียบ PARITY กับ ledger/design-dorm/02-tenants.png)`);
      else fail("V-1", name, `exit=${r.status} ${out.split("\n").filter((l) => l.includes("❌")).slice(0, 3).join(" | ").slice(0, 300)}`, "MAJOR");
    }
  }

  // ORACLE-EDIT 29 ต.ค. (G order): หมวด G ย้ายไปรันหลังล้างข้อมูล (finally) — ก่อนหน้านี้ G รันขณะ outbox ของร้านทดสอบ (~100 สัญญา) ยังค้าง
  //   ⇒ drainAll ของ qc-hotel-money (ลูกของ qc-svc-r0.8) ไล่ของเก่าก่อน ไม่ถึง event เช็กเอาต์ของตัวเอง (HT-2.x แดงเฉพาะตอนรันซ้อน)
  pendingAtOldG = await pendingOutbox(tenantIds);
  console.log(`\n  (G order) outbox PENDING ณ จุดที่ G เคยรัน (ก่อนล้าง): ทั้งฐาน ${pendingAtOldG.all} · ของร้านทดสอบนี้ ${pendingAtOldG.mine}`);
} catch (e) {
  fail("CRASH", "จบกลางทาง", errMsg(e), "CRITICAL");
} finally {
  try { await cleanup(tenantIds); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); }
  try { await prisma.user.deleteMany({ where: { email: { startsWith: "svc-d5-" } } }); } catch (e) { console.log(`  ⚠️ cleanup users: ${errMsg(e)}`); }
  try {
    const left = await leftovers(tenantIds);
    if (!left.length) pass("Z-1", `ล้างครบ: ทุกตารางที่มี tenantId ของร้านทดสอบ ${tenantIds.length} ร้าน + ผู้ใช้ svc-d5-* = 0 แถว (ฉาก svcqc คงไว้ให้ถ่ายภาพ — ล้างด้วย scripts/svc-qc-lease-scene.mts --clear)`);
    else fail("Z-1", "ล้างครบ", J(left), "MAJOR");
  } catch (e) { fail("Z-1", "ล้างครบ", `ตรวจไม่ได้: ${errMsg(e)}`, "MAJOR"); }
  // ═══════════════ G. regression — ORACLE-EDIT 29 ต.ค. (G order): รันหลังล้างร้านทดสอบ (outbox ของรอบนี้ถูกลบแล้ว) ═══════════════
  try {
    const pend = await pendingOutbox(tenantIds);
    console.log(`\n── G regression (ลูกโพรเซส · env เดียวกัน · หลังล้างข้อมูล · ผ่าน = JSON_SUMMARY ไม่มี failed / exit 0) ──`);
    console.log(`  (G order) outbox PENDING ตอนเริ่ม G: ทั้งฐาน ${pend.all} · ของร้านทดสอบนี้ ${pend.mine} (ก่อนย้าย: ${pendingAtOldG ? `${pendingAtOldG.all}/${pendingAtOldG.mine}` : "ไม่ได้วัด — จบกลางทาง"})`);
    for (const [id, f] of [["G-1", "qc-svc-d.2"], ["G-2", "qc-svc-r0.8"], ["G-3", "qc-svc-d.1"], ["G-4", "qc-svc-r0.3"]] as const) {
      if (NO_REG) { skip(id, `regression ${f}`, "--no-regression / SVC_D5_NO_REGRESSION=1", "CRITICAL"); continue; }
      const r = spawnSync("pnpm", ["exec", "tsx", `scripts/${f}.mts`], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
      const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
      const js = [...out.matchAll(/JSON_SUMMARY (\{.*\})/g)].map((m) => m[1]).pop();
      let sum: any = null;
      try { sum = js ? JSON.parse(js) : null; } catch { /* อ่านไม่ได้ */ }
      const ok = r.status === 0 && (!js || (!!sum && Array.isArray(sum.failed) && sum.failed.length === 0));
      if (ok) pass(id, `regression ${f} ไม่มีข้อแดง (${sum ? `${sum.passed}/${sum.total}` : "exit 0"})`);
      else fail(id, `regression ${f} ไม่มีข้อแดง`, `exit=${r.status} failed=${J(sum?.failed)} · ${out.split("\n").filter((l) => l.includes("❌")).slice(0, 3).join(" | ").slice(0, 300)}`, "CRITICAL");
    }
  } catch (e) { fail("G-CRASH", "หมวด G จบกลางทาง", errMsg(e), "CRITICAL"); }
  await prisma.$disconnect();
}

const failed = cks.filter((c) => c.res === "FAIL");
const skipped = cks.filter((c) => c.res === "SKIP");
const passed = cks.length - failed.length - skipped.length;
console.log(`\n===== QC SVC D.5 · ผู้เช่า · สัญญา · เงินประกัน =====\nผ่าน ${passed}/${cks.length}${skipped.length ? ` (SKIP ${skipped.length})` : ""}`);
console.log(`FINDINGS: CRITICAL ${failed.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${failed.filter((c) => c.sev === "MAJOR").length} · MINOR ${failed.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id) })}`);
// exit 0 เมื่อไม่มีข้อแดง · รับใบ = ผ่านทุกข้อ (SKIP ที่ยอมได้: V-1 ไม่มี QC_BASE · Q-* ไม่ได้ seed · G-* เมื่อ --no-regression — ผู้คุมรันซ้ำครบก่อนรับ)
process.exit(failed.length > 0 ? 1 : 0);
