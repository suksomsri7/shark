// QC — SVC D.11 · เตือน · ทวง · ค่าปรับ (หอ) · oracle ของผู้เขียนข้อสอบ — builder ห้ามแก้ไฟล์นี้
// สัญญา: ledger/svc-briefs/svc-brief-d.11.md · ledger/SVC-MASTER-PLAN.md แถว D.11 · ledger/DESIGN-DORM-HOTEL.md A8 + ภาคผนวก ก หอ #31–39
//        · README หอ ("ปรับช้า ต.ค. 4 วัน" ฿200 · การ์ด "ค้างจาก ต.ค. · ส่งเตือนแล้ว 3 ครั้ง" ภาพ 06) · หนี้ D.8 F14/F15/m7 (/root/svc-runs/fix/d8.md)
//
// กลุ่มข้อ:
//   S  โครงสร้าง: ไฟล์ · facade 8 ชื่อ · จอไม่ลาก server · ด่านหน้า/action · สิทธิ์ · event dorm.bill.overdue · อนุมัติ (labels/allowlist/effects) · งานตามเวลา
//      · ค่าตั้งใหม่ในทะเบียน · F5.1/any/getDay · ใช้ชิ้นเดิม (lateFee/evaluateLegal/notifyCustomer/ตัวตรวจคำ) · เพดานกันพิมพ์ผิดย้ายเข้า settings · ไม่ยิงเงินขนาน · คำต้องห้าม
//   PC positive control (เขียวตั้งแต่ก่อนมีงาน): lateFee D.1 · evaluateLegal LATE_FEE_CAP+params · รอบ ต.ค. ผ่าน D.8 (หน่วยไม่มีน้ำไฟ) · recordExternalPayment paidAt
//      · notifyCustomer dedupe (R0.7) · เครื่องยนต์ค่าตั้งบล็อกแม่แบบ "ตัดไฟ" (R0.3)
//   W  ยกเว้นค่าปรับ: ก่อนลงบิล · ใน DRAFT · หลังส่ง = ใบลดหนี้ (ไม่แก้ทับ) · ยื่นขอ/อนุมัติ/ปฏิเสธ (สายอนุมัติ + ทางสำรองงานตามเวลา) · โหมด · ซ้ำ/พร้อมกัน · จ่ายครบแล้ว
//   F  ค่าปรับอัตโนมัติรอบ พ.ย. (snapshot สัญญา · ผ่อนผัน · ต่อวัน/ครั้งเดียว/% · ไม่มีค่าปรับ · เพดานสัญญา/กฎหมาย/กันพิมพ์ผิด · ปิดอัตโนมัติ · เตรียมซ้ำ/พร้อมกัน)
//   N  เงิน: ใบแจ้งหนี้มีบรรทัดค่าปรับตรงทุกสตางค์ · ใบลดหนี้ของการยกเว้น · GL สมดุล · ลูกหนี้ = เอกสาร
//   R  รอบ ธ.ค.: ส่วนเพิ่มหลังจ่ายช้า · เพดาน 2 ชั้น (ต่อบิลต้นทาง/ปลายทาง) · ไม่ทบต้น (ค่าปรับไม่ก่อค่าปรับ · % ไม่รวมค่าปรับ) · ตรวจทั้งหน่วย
//   M  บรรทัดมือ/ใบเพิ่มหนี้: เพดานรวมค่าปรับอัตโนมัติ · เพดานกันพิมพ์ผิดจากค่าตั้ง (หนี้ F15)
//   D  เตือน/ทวง (ร้าน C): ตารางก่อนครบ/หลังเลย · เวลาเงียบ · จ่ายแล้วหยุด · นัดจ่าย · สัญญาจบ · ไม่รัวส่งย้อนหลัง · แม่แบบมีคำต้องห้ามไม่ส่ง · ทวงมือ · งานซ้อน (X5)
//   O  event dorm.bill.overdue (1 ต่อบิล · payload 7 คีย์ ไม่มี PII) · T หนังสือบอกเลิก · J งานรอบบิลซ้อนกับค่าปรับ (X5) · U จอค้างชำระ · X ข้ามร้าน/สิทธิ์สด
//   Q ฉาก svcqc · V ภาพ (QC_BASE) · Z ล้างครบ · G regression (รันหลังล้างข้อมูล)
//
// ข้อมูลทดสอบใต้ร้านชั่วคราว slug `qc-svc-d11-*` + ผู้ใช้ `svc-d11-*@shark.local` · วันที่ตายตัว (now ฉีดผ่าน deps.now / runDormDunningJobs(now))
// รัน: bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-d.11.mts
//      `--no-regression` ข้ามหมวด G (SKIP)
/* eslint-disable @typescript-eslint/no-explicit-any */
import { existsSync, readFileSync } from "node:fs";
import { svcQcHostMark } from "./svc-qc-hosts.mjs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn, spawnSync } from "node:child_process";

const SELF = fileURLToPath(import.meta.url);
const ROOT = join(dirname(SELF), "..");
const LABEL = "qc-svc-d.11";
const SVC_HOST = svcQcHostMark(); // ORACLE-EDIT (ผู้คุม 31 ต.ค. · ฐานต่อเลน) เดิม "ep-mute-scene"
const FORBIDDEN_HOSTS = ["ep-royal-night", "ep-plain-art", "ep-cool-shadow", "ep-weathered-river", "ep-frosty-lab", "ep-fragrant-thunder"];
const RUN_CMD = "bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-d.11.mts";

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

const DORM_IDX = "src/lib/modules/dorm/index.ts";
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 260);

// ═══════════════ โหมดลูก (`--child <base64 JSON>`) — ยิงพร้อมกันจากโพรเซสแยก ═══════════════
//   op ปกติ = ชื่อฟังก์ชันใน facade dorm เรียก f(ctx, input, deps) · "__dunning" / "__billing" = งานตามเวลา (input = { now, tenantId })
const CHILD_AT = process.argv.indexOf("--child");
if (CHILD_AT >= 0) {
  let out: unknown[] = [];
  try {
    const job = JSON.parse(Buffer.from(process.argv[CHILD_AT + 1] ?? "", "base64url").toString("utf8")) as { op: string; ctx: unknown; inputs: any[]; deps: any; at: number };
    const dorm = (await import(pathToFileURL(join(ROOT, DORM_IDX)).href)) as Record<string, unknown>;
    let f: ((...a: any[]) => Promise<any>) | null = null;
    if (job.op === "__dunning" && typeof dorm.runDormDunningJobs === "function") {
      const g = dorm.runDormDunningJobs as (...a: any[]) => Promise<any>;
      f = (_c: unknown, x: any) => g(new Date(x.now), { tenantId: x.tenantId });
    } else if (job.op === "__billing" && typeof dorm.runDormBillingJobs === "function") {
      const g = dorm.runDormBillingJobs as (...a: any[]) => Promise<any>;
      f = (_c: unknown, x: any) => g(new Date(x.now), { tenantId: x.tenantId });
    } else f = typeof dorm[job.op] === "function" ? (dorm[job.op] as (...a: any[]) => Promise<any>) : null;
    const deps = job.deps ? { ...job.deps, ...(typeof job.deps.now === "string" ? { now: new Date(job.deps.now) } : {}) } : undefined;
    if (!f) out = job.inputs.map(() => ({ childFail: `facade ไม่มี ${job.op}` }));
    else {
      const wait = job.at - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      out = await Promise.all(job.inputs.map(async (x) => {
        const t0 = Date.now();
        try { const r = await f!(job.ctx, x, deps); return { ...(r && typeof r === "object" ? r : { value: r }), __ms: Date.now() - t0 }; }
        catch (e) { return { threw: errMsg(e), __ms: Date.now() - t0 }; }
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
const LEGAL_BAD = /ล็อ[กค]ห้อง|ล็อ[กค]ประตู|ตัดน้ำ|ตัดไฟ|ระงับ(การ)?(จ่าย)?(น้ำ|ไฟ)|งด(จ่าย)?(น้ำ|ไฟ)|ยึดทรัพย์|ยึดของ|ขนของออก/;
const PHONE_RE = /(\+?66|0)[689]\d{8}/;
const NO_REG = process.argv.includes("--no-regression") || process.env.SVC_D11_NO_REGRESSION === "1";

// ═══════════════ วันที่ตายตัวของฉาก ═══════════════
const P1 = "2026-10";                       // รอบ ต.ค. (ครบ 5 ต.ค.)
const P2 = "2026-11";                       // รอบ พ.ย. (ครบ 5 พ.ย.)
const P3 = "2026-12";                       // รอบ ธ.ค. (ครบ 5 ธ.ค.)
const NOW1 = "2026-09-25T03:00:00.000Z";    // 25 ก.ย. 10:00 ไทย — เตรียม/ส่งรอบ ต.ค.
const NOW_W1 = "2026-10-20T03:00:00.000Z";  // 20 ต.ค. — ยกเว้นก่อนลงบิล
const NOW2 = "2026-10-25T03:00:00.000Z";    // 25 ต.ค. — เตรียม/ส่งรอบ พ.ย. (asOf ค่าปรับ = 2026-10-25)
const NOW_A = "2026-10-27T03:00:00.000Z";   // 27 ต.ค. — ยกเว้นหลังส่ง · งานกวาดผลอนุมัติ
const NOW3 = "2026-11-26T03:00:00.000Z";    // 26 พ.ย. — เตรียมรอบ ธ.ค. (asOf 2026-11-26)
const PAY = (ymd: string) => new Date(`${ymd}T05:00:00.000Z`);   // 12:00 ไทย
const dbDate = (ymd: string) => new Date(`${ymd}T00:00:00Z`);
const bkkYmd = (d: unknown) => (d instanceof Date ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(d) : typeof d === "string" ? d.slice(0, 10) : "");
const ymdOf = (d: unknown) => (d instanceof Date ? d.toISOString().slice(0, 10) : typeof d === "string" ? d.slice(0, 10) : "");

// ═══════════════ โหลดโมดูล ═══════════════
const tryImport = async (spec: string): Promise<any> => { try { return await import(spec); } catch (e) { console.log(`  (โหลด ${spec} ไม่ได้: ${errMsg(e)})`); return null; } };
const { prisma } = (await import("@/lib/core/db" as string)) as { prisma: any };
let dorm: any = null;
let dormWhy = "";
if (!existsSync(join(ROOT, DORM_IDX))) dormWhy = `ยังไม่มี ${DORM_IDX}`;
else { try { dorm = await import(pathToFileURL(join(ROOT, DORM_IDX)).href); } catch (e) { dormWhy = `import facade dorm ล้ม: ${errMsg(e)}`; } }
const fn = (name: string): ((...a: any[]) => any) | null => (dorm && typeof dorm[name] === "function" ? dorm[name] : null);
const calc = (await import(pathToFileURL(join(ROOT, "src/lib/modules/dorm/calc.ts")).href)) as any;
const legal = (await import(pathToFileURL(join(ROOT, "src/lib/core/settings/legal/th-rental-2568.ts")).href)) as any;
const ACC: any = await tryImport("@/lib/modules/account");
const SYS: any = await tryImport("@/lib/modules/system/service");
const ASV: any = await tryImport("@/lib/modules/account/service");
const GL: any = await tryImport("@/lib/modules/account/gl");
const SET: any = await tryImport("@/lib/core/settings");
const APS: any = await tryImport("@/lib/modules/approval/service");
const NC: any = await tryImport("@/lib/platform/notify-customer");
const PRISMA_NS: any = (await tryImport("@prisma/client"))?.Prisma;

const SCREEN_FILE = "src/components/dorm/OverdueScreen.tsx";
const loadComp = async (file: string, named: string): Promise<[any, string]> => {
  if (!existsSync(join(ROOT, file))) return [null, `ยังไม่มี ${file}`];
  try {
    const m: any = await import(pathToFileURL(join(ROOT, file)).href);
    const c = typeof m.default === "function" ? m.default : typeof m[named] === "function" ? m[named] : null;
    return c ? [c, ""] : [null, `${file} ไม่มี default export ที่เป็นคอมโพเนนต์`];
  } catch (e) { return [null, `import ${file} ล้ม: ${errMsg(e)}`]; }
};
const [ScreenC, screenWhy] = await loadComp(SCREEN_FILE, "OverdueScreen");
const React = (await import("react" as string)) as any;
const RDS = (await import("react-dom/server" as string)) as any;

/** ตัวรันข้อ — needs = ชื่อฟังก์ชันใน facade dorm (ขาด = FAIL ไม่ใช่ SKIP) · ui = ต้องใช้คอมโพเนนต์ OverdueScreen */
async function T(id: string, name: string, needs: string[], body: () => Promise<[boolean, string?]>, sev: Sev = "CRITICAL", ui = false) {
  const miss = needs.filter((n) => !fn(n));
  if (miss.length) return fail(id, name, dorm ? `facade dorm ไม่มี ${miss.join(", ")}` : dormWhy, sev);
  if (ui && !ScreenC) return fail(id, name, screenWhy || "ไม่มีคอมโพเนนต์ OverdueScreen", sev);
  try {
    const [ok, why] = await body();
    if (ok) pass(id, name); else fail(id, name, why ?? "ไม่ตรง", sev);
  } catch (e) { fail(id, name, `throw: ${errMsg(e)}`, sev); }
}
const codeOf = (r: any) => (r && r.ok === false ? String(r.code) : r?.ok === true ? "OK" : r?.threw ? `THREW(${r.threw})` : J(r).slice(0, 80));
const failOk = (r: any, code: string) => r?.ok === false && r?.code === code && typeof r?.reason === "string" && THAI.test(r.reason) && !/prisma|invalid `|Unique constraint|violates/i.test(r.reason);

// ═══════════════ render ═══════════════
const ACTIONS = new Proxy({}, { get: () => async () => ({ ok: true }) });
const renderScreen = (model: unknown): string => String(RDS.renderToStaticMarkup(React.createElement(ScreenC, { model, unitSlug: "qc-d11", actions: ACTIONS }))).replace(/<!-- -->/g, "");
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
const box1 = (html: string, attr: string, val?: string) => boxes(html, attr).find((b) => val === undefined || b.attrs[attr] === val) ?? null;

// ═══════════════ ล้างข้อมูล ═══════════════
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
  const soft = async (f: () => Promise<unknown>) => { try { await f(); } catch { /* ไม่เป็นไร */ } };
  await soft(() => prisma.accountJournalEntry.updateMany({ where: { tenantId: { in: tids } }, data: { reversalOfId: null } }));
  await soft(() => prisma.accountDocumentPayment.updateMany({ where: { tenantId: { in: tids } }, data: { chequeId: null, whtCertDocId: null } }));
  await soft(() => prisma.accountDocument.updateMany({ where: { tenantId: { in: tids } }, data: { sourceDocId: null, replacedById: null, sourcePaymentId: null } }));
  await soft(() => prisma.accountLedger.updateMany({ where: { tenantId: { in: tids } }, data: { parentId: null } }));
  await soft(() => prisma.dormMeter.updateMany({ where: { tenantId: { in: tids } }, data: { replacedById: null } }));
  let pending = [...(await tablesWithTenant())];
  for (let pass = 0; pass < 14 && pending.length; pass++) {
    const next: string[] = [];
    for (const t of pending) {
      try { await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, tids); } catch { next.push(t); }
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
  const un = await prisma.user.count({ where: { email: { startsWith: "svc-d11-" } } });
  if (un) out.push({ table: "User(svc-d11-*)", n: un });
  return out;
}
async function pendingOutbox(tids: string[]): Promise<{ all: number; mine: number }> {
  const all = await prisma.outboxEvent.count({ where: { status: "PENDING" } });
  const mine = tids.length ? await prisma.outboxEvent.count({ where: { status: "PENDING", tenantId: { in: tids } } }) : 0;
  return { all, mine };
}

// ═══════════════ ยิงพร้อมกันจากโพรเซสลูก ═══════════════
async function fanout(op: string, ctx: unknown, inputs: any[], deps: any = null, procs = 4, delayMs = 14_000): Promise<any[]> {
  const per = Math.ceil(inputs.length / procs);
  const at = Date.now() + delayMs;
  const jobs = Array.from({ length: procs }, (_, p) => ({ op, ctx, inputs: inputs.slice(p * per, p * per + per), deps, at })).filter((j) => j.inputs.length);
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
const inProc = async (calls: (() => Promise<any>)[]) => Promise.all(calls.map(async (c) => { try { return await c(); } catch (e) { return { threw: errMsg(e) }; } }));
/** ยิงในโพรเซสนี้ตรงเวลาเดียวกับโพรเซสลูกของ fanout (delay เท่ากัน) */
const SYNC_MS = 14_000;
const inProcAt = (delayMs: number, calls: (() => Promise<any>)[]) => new Promise((r) => setTimeout(r, delayMs)).then(() => inProc(calls));
const badOf = (rs: any[], okCodes: string[] = ["RUN_BUSY"]) => rs.filter((r) => r?.threw || r?.childFail || (r?.ok === false && !okCodes.includes(r?.code)) || /P2028|P2024|P2002|40P01|timed out|Unable to start a transaction/i.test(J(r)));

// ═══════════════ ฉาก ═══════════════
const RENT = 450_000, COMMON = 30_000, BASE = RENT + COMMON;   // บิลละ 480,000 (หน่วยไม่มีน้ำไฟ)
const NOVAT = { registered: false, pricesIncludeVat: true };
const lineOf = (b: any, code: string) => (Array.isArray(b?.lines) ? b.lines.find((l: any) => l.code === code) : undefined);
const lateOf = (b: any) => { const l = lineOf(b, "LATE_FEE"); return l ? Number(l.grossSatang ?? l.amountSatang ?? 0) : 0; };
const autoOf = (b: any): any[] | null => {
  const l = lineOf(b, "LATE_FEE");
  if (!l) return [];
  const a = l?.meta?.auto;
  if (a === undefined) return [];
  try { const v = typeof a === "string" ? JSON.parse(a) : a; return Array.isArray(v) ? v : null; } catch { return null; }
};
const expBill = (fee: number) => calc.buildDormBill({ rentSatang: RENT, commonFeeSatang: COMMON, lateFeeSatang: fee, vat: NOVAT });

const tenantIds: string[] = [];
let pendingAtOldG: { all: number; mine: number } | null = null;
const SV: any = await tryImport(pathToFileURL(join(ROOT, "scripts/svc-qc-data.mts")).href);

try {
  const stale = await prisma.tenant.findMany({ where: { slug: { startsWith: "qc-svc-d11-" } }, select: { id: true } });
  if (stale.length) { console.log(`  (กวาด tenant ค้างจากรอบก่อน ${stale.length})`); await cleanup(stale.map((t: { id: string }) => t.id)); }
  await prisma.user.deleteMany({ where: { email: { startsWith: "svc-d11-" } } });

  // ═══════════════ S. โครงสร้าง ═══════════════
  console.log("\n── S โครงสร้าง ──");
  const F = {
    latefee: "src/lib/modules/dorm/latefee.ts",
    dunning: "src/lib/modules/dorm/dunning.ts",
    billing: "src/lib/modules/dorm/billing.ts",
    index: DORM_IDX,
    screen: SCREEN_FILE,
    page: "src/app/app/u/[unitSlug]/dorm/overdue/page.tsx",
    actions: "src/app/app/u/[unitSlug]/dorm/overdue/actions.ts",
    notice: "src/app/app/u/[unitSlug]/dorm/overdue/[leaseId]/notice/page.tsx",
    scene: "scripts/svc-qc-overdue-scene.mts",
  };
  {
    const miss = [F.latefee, F.dunning, F.screen, F.page, F.actions, F.notice, F.scene].filter((p) => !existsSync(join(ROOT, p)));
    chk("S-1", "มีไฟล์ของใบครบ (latefee.ts · dunning.ts · OverdueScreen.tsx · overdue/page · actions · [leaseId]/notice · ฉาก svc-qc-overdue-scene.mts)", !miss.length, `ขาด ${miss.join(", ")}`, "CRITICAL");
  }
  const API = ["lateFeeLedger", "waiveLateFee", "applyLateFeeWaiverApproval", "runDormDunningJobs", "sendDunningNow", "setPaymentPromise", "overdueModel", "terminationNotice"];
  {
    const miss = API.filter((n) => !fn(n));
    chk("S-2", "facade @/lib/modules/dorm export ครบ 8 ชื่อ (§3–§8)", !miss.length, dorm ? `ขาด ${miss.join(", ")}` : dormWhy, "CRITICAL");
  }
  const importsOf = (src: string) => [...src.matchAll(/^\s*import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/gm)].map((m) => ({ typeOnly: !!m[1], spec: m[2] }))
    .concat([...src.matchAll(/^\s*import\s+["']([^"']+)["']/gm)].map((m) => ({ typeOnly: false, spec: m[1] })))
    .concat([...src.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)].map((m) => ({ typeOnly: false, spec: m[1] })));
  const screenSrc = read(F.screen);
  {
    const BAD = (s: string) => /^@prisma\//.test(s) || /^@\/lib\/core\/(db|tenant-db|outbox|settings|context|session)/.test(s) || /^@\/lib\/modules\//.test(s) || /^@\/lib\/(platform|automation|webhooks|storage)\//.test(s) || /actions$/.test(s) || /^next\//.test(s);
    const bad = importsOf(screenSrc).filter((i) => !i.typeOnly && BAD(i.spec)).map((i) => i.spec);
    const useClient = /^\s*["']use client["']/.test(screenSrc);
    const prismaWord = /\bprisma\b|tenantDb\(/.test(stripComments(screenSrc));
    chk("S-3", "OverdueScreen.tsx: 'use client' บรรทัดแรก · ไม่ import prisma/โมดูล server/actions/next/* (เฉพาะ import type) — render ด้วย renderToStaticMarkup ได้",
      !!screenSrc && useClient && !bad.length && !prismaWord, screenSrc ? `use client=${useClient} import ต้องห้าม=${bad.join(",") || "—"} prisma=${prismaWord}` : "ยังไม่มีไฟล์", "CRITICAL");
  }
  const gateOk = (p: string) => !!p && !/^\s*["']use client["']/.test(p) && /requireUnit\s*\(/.test(p) && /["']DORM["']/.test(p) && /notFound\s*\(/.test(p)
    && /dormAccess\s*\(/.test(p) && /\.money\b/.test(p) && /from\s+["']@\/lib\/modules\/dorm["']/.test(p) && !/["']@\/lib\/modules\/dorm\//.test(p) && !/@\/lib\/core\/db|@prisma\//.test(p);
  {
    const p = read(F.page), n = read(F.notice);
    const ok = gateOk(p) && /OverdueScreen/.test(p) && /overdueModel\s*\(/.test(p) && gateOk(n) && /terminationNotice\s*\(/.test(n);
    chk("S-4", "หน้า /dorm/overdue + /[leaseId]/notice: server · requireUnit + DORM · dormAccess(...) .money ไม่ผ่าน ⇒ notFound · overdueModel/terminationNotice ผ่าน facade · ไม่แตะ prisma", ok,
      `page=${gateOk(p)} model=${/overdueModel\s*\(/.test(p)} notice=${gateOk(n)} terminationNotice=${/terminationNotice\s*\(/.test(n)}`, "CRITICAL");
  }
  {
    const code = stripComments(read(F.actions));
    const firstUseServer = /^\s*["']use server["']/.test(code);
    const exportsOther = [...code.matchAll(/^\s*export\s+(?!async\s+function)(\S+)/gm)].map((m) => m[1]);
    const names = ["sendDunningNowAction", "waiveLateFeeAction", "setPaymentPromiseAction"].filter((n) => !new RegExp(`export\\s+async\\s+function\\s+${n}\\b`).test(code));
    const gate = /requireUnit\s*\(/.test(code) && /["']DORM["']/.test(code);
    const trustInput = /input\??\.tenantId|tenantId\s*:\s*input\.|input\??\.actorUserId/.test(code);
    chk("S-5", "actions.ts: 'use server' · export async function เท่านั้น (3 ชื่อ) · requireUnit + DORM · ร้าน/ผู้กระทำจาก session",
      !!code && firstUseServer && !exportsOther.length && !names.length && gate && !trustInput,
      code ? `use server=${firstUseServer} export อื่น=${exportsOther.join(",") || "—"} ขาด=${names.join(",") || "—"} ด่าน=${gate} รับจาก input=${trustInput}` : "ยังไม่มีไฟล์", "CRITICAL");
  }
  {
    let why = "";
    try {
      const pm = (await import("@/lib/core/permissions" as string)) as any;
      const k = "dorm.latefee.waive";
      const l = pm.permissionLabel?.(k);
      if (!pm.isPermissionKey?.(k) || typeof l !== "string" || !THAI.test(l)) why += `${k} ไม่อยู่/ไม่มีป้ายไทย · `;
      const permSrc = read("src/lib/core/permissions.ts");
      const plannedBlk = /module:\s*"dorm"[\s\S]*?planned:\s*\[([\s\S]*?)\]/.exec(permSrc)?.[1] ?? "";
      if (/["']dorm\.latefee\.waive["']/.test(plannedBlk)) why += "dorm.latefee.waive ยังอยู่ใน planned · ";
    } catch (e) { why = `import permissions ล้ม: ${errMsg(e)}`; }
    chk("S-6", "permissions: dorm.latefee.waive ใช้จริง (ออกจาก planned · ป้ายไทย)", !why, why, "MAJOR");
  }
  const EV = "dorm.bill.overdue";
  {
    let why = "";
    try {
      const oc = (await import("@/lib/outbox-consumers" as string)) as any;
      const al = (await import("@/lib/automation/labels" as string)) as any;
      const wl = (await import("@/lib/webhooks/labels" as string)) as any;
      const a = typeof oc.consumers?.[EV] === "function";
      const lab = Array.isArray(al.AUTOMATION_EVENTS) ? al.AUTOMATION_EVENTS.find((e: { value: string }) => e.value === EV) : null;
      const c = Array.isArray(wl.WEBHOOK_EVENTS) && wl.WEBHOOK_EVENTS.some((e: { value: string }) => e.value === EV);
      const early = ["dorm.bill.paid", "dorm.bill.partially_paid"].filter((x) => typeof oc.consumers?.[x] === "function");
      if (!(a && lab && THAI.test(lab.label ?? "") && c) || early.length) why = `consumers=${a} automation=${!!lab} ป้ายไทย=${THAI.test(lab?.label ?? "")} webhooks=${c} ลงล่วงหน้า=${early.join(",") || "—"}`;
    } catch (e) { why = `import ทะเบียนล้ม: ${errMsg(e)}`; }
    chk("S-7", `event ${EV} ลง 3 ทะเบียน (ป้ายไทย) · ไม่ลง dorm.bill.paid/partially_paid ล่วงหน้า (D.10)`, !why, why, "MAJOR");
  }
  {
    let why = "";
    try {
      const l = (await import("@/lib/modules/approval/labels" as string)) as any;
      const e = (l.ENTITY_TYPES ?? []).find((x: any) => x.value === "dorm.latefee.waive");
      if (!e || !THAI.test(e.label ?? "")) why += "labels ไม่มี dorm.latefee.waive (ป้ายไทย) · ";
      if (!/["']dorm\.latefee\.waive["']/.test(stripComments(read("src/lib/modules/approval/actions.ts")))) why += "approval/actions.ts allowlist ไม่มี · ";
      const eff = stripComments(read("src/lib/approval-effects.ts"));
      const i = eff.search(/["']dorm\.latefee\.waive["']/);
      const blk = i >= 0 ? eff.slice(i, i + 700) : "";
      if (i < 0 || !/import\(\s*["']@\/lib\/modules\/dorm["']\s*\)/.test(blk) || !/applyLateFeeWaiverApproval\s*\(/.test(blk)) why += "approval-effects ไม่มีกิ่ง dorm.latefee.waive → applyLateFeeWaiverApproval (dynamic import facade) · ";
    } catch (e) { why = `import approval labels ล้ม: ${errMsg(e)}`; }
    chk("S-8", "สายอนุมัติ: entityType dorm.latefee.waive ลง labels (ไทย) + allowlist + approval-effects เรียก applyLateFeeWaiverApproval ผ่าน facade", !why, why, "MAJOR");
  }
  {
    const mj = read("src/lib/platform/minute-jobs.ts");
    const i = mj.search(/name:\s*["']dorm\.dunning["']/);
    const blk = i >= 0 ? mj.slice(i, i + 600) : "";
    const ok = i >= 0 && /everyMinutes:\s*5\b/.test(blk) && /import\(\s*["']@\/lib\/modules\/dorm["']\s*\)/.test(blk) && /runDormDunningJobs\s*\(/.test(blk) && !/^import[^\n]*modules\/dorm/m.test(mj);
    chk("S-9", "minute-jobs: งาน dorm.dunning ทุก 5 นาที (import facade ตอนรัน · เรียก runDormDunningJobs)", ok, i < 0 ? "ไม่มีงาน dorm.dunning" : blk.slice(0, 200).replace(/\s+/g, " "), "MAJOR");
  }
  {
    let why = "";
    try {
      const d = (k: string) => SET?.getDef?.(k);
      const fb = (k: string) => d(k)?.defaults?._fallback;
      const parse = (k: string, v: unknown) => { try { return d(k)?.schema?.safeParse?.(v)?.success === true; } catch { return false; } };
      if (!d("rooms.lateFee.autoCharge") || fb("rooms.lateFee.autoCharge") !== true) why += "autoCharge (bool · ค่าเริ่ม true) · ";
      if (!d("rooms.lateFee.guardRentBp") || fb("rooms.lateFee.guardRentBp") !== 10_000 || !parse("rooms.lateFee.guardRentBp", null) || parse("rooms.lateFee.guardRentBp", -1)) why += "guardRentBp (bp · 10,000 · null ได้) · ";
      if (!d("rooms.notify.promiseMaxDays") || fb("rooms.notify.promiseMaxDays") !== 30) why += "promiseMaxDays (30) · ";
      if (!d("rooms.lease.terminationNoticeDays") || fb("rooms.lease.terminationNoticeDays") !== 30 || parse("rooms.lease.terminationNoticeDays", 14) || !parse("rooms.lease.terminationNoticeDays", 15)) why += "terminationNoticeDays (30 · ต่ำสุด 15) · ";
      const t = d("rooms.msg.terminationNotice");
      if (!t || t.type !== "template" || !(t.legal ?? []).includes("TEMPLATE_NO_THREAT") || !["tenantName", "roomNo", "overdueAmount", "effectiveDate"].every((v) => (t.templateVars ?? []).includes(v))) why += "แม่แบบ terminationNotice (TEMPLATE_NO_THREAT · ตัวแปร) · ";
      const pend = read("src/lib/core/settings/defs/rooms.ts");
      const pendBlk = /PENDING_LEGAL_REVIEW_KEYS[^=]*=\s*\[([\s\S]*?)\]/.exec(pend)?.[1] ?? "";
      if (!/rooms\.lease\.terminationNoticeDays/.test(pendBlk) || !/rooms\.lateFee\.guardRentBp/.test(pendBlk)) why += "PENDING_LEGAL_REVIEW_KEYS ขาด terminationNoticeDays/guardRentBp · ";
    } catch (e) { why = `อ่านทะเบียนค่าตั้งล้ม: ${errMsg(e)}`; }
    chk("S-10", "ค่าตั้งใหม่ในทะเบียน: rooms.lateFee.autoCharge · rooms.lateFee.guardRentBp · rooms.notify.promiseMaxDays · rooms.lease.terminationNoticeDays · rooms.msg.terminationNotice (+ ป้ายรอที่ปรึกษา)", !why, why, "MAJOR");
  }
  const lfSrc = stripComments(read(F.latefee)), dnSrc = stripComments(read(F.dunning)), bSrc = stripComments(read(F.billing));
  {
    const raw = [F.latefee, F.dunning].filter((f) => /import\s*\{[^}]*\bprisma\b[^}]*\}\s*from\s+["']@\/lib\/core\/db["']/.test(read(f)));
    const anyUse = [F.latefee, F.dunning, F.screen, F.page, F.actions, F.notice].filter((f) => /:\s*any\b|as\s+any\b|<any>/.test(stripComments(read(f))));
    const getDay = [F.latefee, F.dunning, F.screen].filter((f) => /\.getDay\(\)|\.getDate\(\)|\.getMonth\(\)/.test(stripComments(read(f))));
    chk("S-11", "latefee.ts/dunning.ts ไม่ import prisma ดิบ (F5.1) · ไม่มี any · ไม่มี getDay/getDate/getMonth ดิบ", !!lfSrc && !!dnSrc && !raw.length && !anyUse.length && !getDay.length,
      lfSrc && dnSrc ? `prisma ดิบ=${raw.join(",") || "—"} any=${anyUse.join(",") || "—"} getDay=${getDay.join(",") || "—"}` : "ยังไม่มีไฟล์", "MAJOR");
  }
  {
    const need: [string, string, RegExp][] = [["latefee", "lateFee(", /\blateFee\s*\(/], ["latefee", "evaluateLegal(LATE_FEE_CAP)", /evaluateLegal\s*\(\s*["']LATE_FEE_CAP["']/], ["latefee", "submitForApproval(", /submitForApproval\s*\(/],
      ["dunning", "notifyCustomer(", /notifyCustomer\s*\(/], ["dunning", "ตัวตรวจคำต้องห้าม (findForbiddenTerms / TEMPLATE_NO_THREAT)", /findForbiddenTerms\s*\(|["']TEMPLATE_NO_THREAT["']/], ["dunning", "emitOutbox(", /emitOutbox\s*\(/],
      ["billing", "rooms.lateFee.guardRentBp", /rooms\.lateFee\.guardRentBp/]];
    const src: Record<string, string> = { latefee: lfSrc, dunning: dnSrc, billing: bSrc };
    const miss = need.filter(([f, , re]) => !re.test(src[f])).map(([f, n]) => `${f}:${n}`);
    const hard = /เกินค่าเช่า 1 เดือน/.test(read(F.billing));
    chk("S-12", "ใช้ชิ้นเดิม: latefee → lateFee (D.1) · evaluateLegal LATE_FEE_CAP · submitForApproval · dunning → notifyCustomer · ตัวตรวจคำต้องห้าม · emitOutbox · billing อ่าน guardRentBp (ไม่มีเพดาน 'ค่าเช่า 1 เดือน' ตายตัว — หนี้ F15)",
      !miss.length && !hard, `ขาด ${miss.join(", ") || "—"} · ข้อความตายตัวเดิม=${hard}`, "MAJOR");
  }
  {
    const par = /Promise\.(all|allSettled|any|race)\s*\([\s\S]{0,600}?(createExternalCreditNote|createExternalDebitNote|adjustSentBill|recordExternalPayment)/.test(lfSrc);
    const mapAsync = /\.map\(\s*async[\s\S]{0,400}?(createExternalCreditNote|adjustSentBill)/.test(lfSrc);
    chk("S-13", "ใบลดหนี้ของการยกเว้นเรียกทีละใบ (หนี้ D.2 N2): ไม่มี Promise.all/map(async) ครอบ", !!lfSrc && !par && !mapAsync, lfSrc ? `Promise.*=${par} map(async)=${mapAsync}` : "ยังไม่มี latefee.ts", "CRITICAL");
  }
  {
    const files = [F.latefee, F.dunning, F.screen, F.page, F.notice];
    const bad = files.filter((f) => LEGAL_BAD.test(read(f)));
    const fnBad = [lfSrc, dnSrc].some((s) => /function\s+\w*(cutWater|cutPower|cutElec|lockRoom|seize)\w*/i.test(s));
    const specs = SV?.SQC_VISUAL_SPECS?.["d.11"];
    chk("S-14", "ไม่มีคำต้องห้าม สคบ./ฟังก์ชันตัดน้ำไฟ-ล็อกห้อง-ยึดของ ในโค้ดของใบ · (ผู้คุมตั้งแล้ว) SQC_VISUAL_SPECS d.11 = /dorm/overdue", !bad.length && !fnBad && Array.isArray(specs) && specs.some((s: any) => /\/dorm\/overdue/.test(s.path)),
      `คำต้องห้าม=${bad.join(",") || "—"} ฟังก์ชัน=${fnBad} specs=${J(specs)}`, "MAJOR");
  }
  {
    const fit = read("scripts/fitness.mts");
    const used = new Set<string>();
    const deep: string[] = [];
    for (const f of [F.latefee, F.dunning]) for (const i of importsOf(read(f))) {
      const m = /^@\/lib\/modules\/([^/]+)(\/.*)?$/.exec(i.spec);
      if (!m || m[1] === "dorm" || i.typeOnly) continue;
      used.add(m[1]);
      if (m[2]) deep.push(i.spec);
    }
    const missing = [...used].filter((x) => !fit.includes(`"dorm→${x}"`));
    chk("S-15", "เส้นข้ามโมดูลของ latefee.ts/dunning.ts มีใน ALLOWED_EDGES · ใช้ผ่าน facade (ไม่ล้วง subpath)", !!lfSrc && !!dnSrc && !missing.length && !deep.length,
      `ใช้=${[...used].join(",") || "—"} ขาด=${missing.join(",") || "—"} ล้วงลึก=${deep.join(",") || "—"}`, "MAJOR");
  }

  // ═══════════════ PC-1 · PC-2 (pure) ═══════════════
  console.log("\n── PC positive control ──");
  {
    const pol = (x: Record<string, unknown>) => ({ kind: "PER_DAY", amountSatang: 5000, capSatang: 50_000, graceDays: 0, ...x });
    const a = calc.lateFee({ policy: pol({}), dueDate: "2026-10-05", paidDate: "2026-10-09", overdueSatang: BASE });
    const b = calc.lateFee({ policy: pol({ kind: "PERCENT", percentBp: 500, capSatang: null }), dueDate: "2026-10-05", paidDate: "2026-10-07", overdueSatang: 200_000 });
    const c = calc.lateFee({ policy: pol({ graceDays: 3 }), dueDate: "2026-10-05", paidDate: "2026-10-25", overdueSatang: BASE });
    const d = calc.lateFee({ policy: pol({ graceDays: 3 }), dueDate: "2026-10-05", paidDate: "2026-10-08", overdueSatang: BASE });
    chk("PC-1", "lateFee D.1: ช้า 4 วันผ่อนผัน 0 ⇒ 20,000 (README ฿200) · 5% ของ 200,000 ⇒ 10,000 · ช้า 20 วันผ่อนผัน 3 ⇒ 85,000 ติดเพดาน 50,000 · ช้า 3 วันผ่อนผัน 3 ⇒ 0",
      a.feeSatang === 20_000 && a.daysLate === 4 && b.feeSatang === 10_000 && c.feeSatang === 50_000 && c.capped === true && c.chargeableDays === 17 && d.feeSatang === 0,
      J({ a, b, c, d }), "CRITICAL");
  }
  {
    const x = legal.evaluateLegal("LATE_FEE_CAP", { feeSatang: 20_000 }, { mode: "STRICT", params: { lateFeeCapSatang: 15_000 } });
    const y = legal.evaluateLegal("LATE_FEE_CAP", { feeSatang: 20_000 }, { mode: "STRICT" });
    chk("PC-2", "evaluateLegal LATE_FEE_CAP: params lateFeeCapSatang 15,000 ⇒ BLOCK · ไม่มี params (ค่าเริ่ม null) ⇒ OK + รอที่ปรึกษา", x.level === "BLOCK" && y.level === "OK" && y.pendingReview === true, J({ x: [x.level, x.code], y: [y.level, y.pendingReview] }), "CRITICAL");
  }

  // ═══════════════ fixtures ═══════════════
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const mkTenant = async (tag: string) => { const t = await prisma.tenant.create({ data: { name: `QC D11 ${tag}`, slug: `qc-svc-d11-${tag}-${stamp}` } }); tenantIds.push(t.id); return t.id as string; };
  const A = await mkTenant("a"), B = await mkTenant("b"), C = await mkTenant("c");
  const mkUnit = async (tenantId: string, type: string, tag: string, name?: string) => (await prisma.businessUnit.create({ data: { tenantId, type, name: name ?? `หอ D11 ${tag}`, slug: `d11${tag}-${stamp}` } })).id as string;
  const mkBook = async (tenantId: string, name: string) => {
    const s = await SYS.createSystem(tenantId, "ACCOUNT", name);
    await ASV.saveSettings(tenantId, s.id, { orgName: name, vatRegistered: false });
    await GL.ensureAccounting({ tenantId, systemId: s.id });
    await prisma.accountFinance.create({ data: { tenantId, systemId: s.id, type: "BANK", name: "บัญชีรับเงินหอ", promptpayId: "0812345678", useForReceive: true } });
    return s.id as string;
  };
  const link = (tenantId: string, systemId: string, unitId: string) => prisma.accountSystemLink.create({ data: { tenantId, systemId, linkedKind: "BUSINESS", linkedId: unitId, enabled: true } });
  const mkUser = async (key: string, tenantId: string, role: string, unitAccess: string[], perms: string[] = [], accepted = true) => {
    const u = await prisma.user.create({ data: { email: `svc-d11-${stamp}-${key}@shark.local`, name: `QC D11 ${key}` } });
    const m = await prisma.membership.create({ data: { userId: u.id, tenantId, role, unitAccess, permissions: Object.fromEntries(perms.map((p) => [p, true])), acceptedAt: accepted ? new Date() : null } });
    return { id: u.id as string, membershipId: m.id as string };
  };
  const mkType = async (tenantId: string, unitId: string) =>
    (await prisma.hotelRoomType.create({ data: { tenantId, unitId, name: "มาตรฐาน", capacity: 2, baseRateSatang: RENT, depositSatang: 0, rentMode: "MONTHLY", areaSqm: 24 } })).id as string;
  const mkBld = async (tenantId: string, unitId: string, name: string) => (await prisma.roomBuilding.create({ data: { tenantId, unitId, name, floors: 3, sortOrder: 1 } })).id as string;
  const mkRoom = async (tenantId: string, unitId: string, typeId: string, bld: string, number: string) =>
    (await prisma.hotelRoom.create({ data: { tenantId, unitId, roomTypeId: typeId, number, buildingId: bld, floorNo: 1, floor: "1" } })).id as string;
  const setVal = async (tenantId: string, key: string, scope: string, scopeId: string, value: unknown) => {
    await prisma.settingValue.deleteMany({ where: { tenantId, key, scope, scopeId } });
    await prisma.settingValue.create({ data: { tenantId, key, scope, scopeId, value: value === null ? PRISMA_NS.JsonNull : value, setById: "qc-d11" } });
  };
  const unsetVal = (tenantId: string, key: string, scopeId: string) => prisma.settingValue.deleteMany({ where: { tenantId, key, scope: "UNIT", scopeId } });
  const U = (tenantId: string, unitId: string, key: string, value: unknown) => setVal(tenantId, key, "UNIT", unitId, value);
  const snap = async (tenantId: string, unitId: string, roomTypeId: string, roomId: string, patch: Record<string, unknown> = {}) => {
    const s = await SET.snapshotPolicy({ tenantId }, "lease", { unitId, roomTypeId, roomId });
    return { ...s, values: { ...(s?.values ?? {}), ...patch } };
  };
  let seq = 0;
  const RUNNUM = 100000 + Math.floor(Math.random() * 800000);
  const newPhone = () => `08${String((RUNNUM % 1000) * 100000 + ++seq).padStart(8, "0").slice(-8)}`;
  const mkLease = async (o: { tenantId: string; unitId: string; roomId: string; roomTypeId: string; name: string; patch?: Record<string, unknown> }) => {
    const party = await prisma.party.create({ data: { tenantId: o.tenantId, name: o.name, phone: newPhone() } });
    const l = await prisma.dormLease.create({ data: {
      tenantId: o.tenantId, unitId: o.unitId, roomId: o.roomId, partyId: party.id, status: "ACTIVE", startDate: dbDate("2026-01-01"), endDate: dbDate("2027-12-31"),
      rentSatang: RENT, commonFeeSatang: COMMON, depositSatang: 0, advanceRentSatang: 0, bookingFeeSatang: 0,
      coTenants: { occupants: [], vehicles: [] }, policySnapshot: await snap(o.tenantId, o.unitId, o.roomTypeId, o.roomId, o.patch), signedAt: new Date(), createdById: "qc-d11",
    } });
    const oc = await prisma.roomOccupancy.create({ data: { tenantId: o.tenantId, unitId: o.unitId, roomId: o.roomId, startDate: dbDate("2026-01-01"), endDate: dbDate("2028-01-01"), kind: "LEASE", refType: "DormLease", refId: l.id } });
    await prisma.dormLease.update({ where: { id: l.id }, data: { occupancyId: oc.id } });
    return { leaseId: l.id as string, partyId: party.id as string };
  };
  /** หอไม่มีน้ำไฟ (มิเตอร์ NONE ทั้งคู่) · ผูกสมุด · คืน ห้อง/สัญญา */
  const dormUnit = async (tenantId: string, tag: string, book: string, rooms: { no: string; patch?: Record<string, unknown> }[], extra: Record<string, unknown> = {}) => {
    const u = await mkUnit(tenantId, "DORM", tag);
    await link(tenantId, book, u);
    await U(tenantId, u, "rooms.utility.elec.metering", "NONE");
    await U(tenantId, u, "rooms.utility.water.metering", "NONE");
    for (const [k, v] of Object.entries(extra)) await U(tenantId, u, k, v);
    const ty = await mkType(tenantId, u), b = await mkBld(tenantId, u, `อาคาร ${tag}`);
    const R: Record<string, string> = {}, L: Record<string, { leaseId: string; partyId: string }> = {};
    for (const r of rooms) {
      R[r.no] = await mkRoom(tenantId, u, ty, b, r.no);
      L[r.no] = await mkLease({ tenantId, unitId: u, roomId: R[r.no], roomTypeId: ty, name: `ผู้เช่าห้อง ${r.no}`, patch: r.patch });
    }
    return { u, ty, b, R, L };
  };
  const prep = (ctx: any, unitId: string, periodKey: string, now: string, deps: Record<string, unknown> = {}): Promise<any> => fn("prepareBillRun")!(ctx, { unitId, periodKey }, { now: new Date(now), ...deps });
  const send = (ctx: any, unitId: string, runId: string, now: string): Promise<any> => fn("sendBillRun")!(ctx, { unitId, runId }, { now: new Date(now) });
  const sendAll = async (ctx: any, unitId: string, runId: string, now: string) => {
    let last: any = null;
    for (let i = 0; i < 40; i++) { last = await send(ctx, unitId, runId, now); if (!last?.ok || last.done) break; }
    return last;
  };
  const billOf = async (unitId: string, leaseId: string, periodKey: string): Promise<any> => prisma.dormBill.findFirst({ where: { unitId, leaseId, periodKey } });
  const runOf = async (unitId: string, periodKey: string): Promise<any> => prisma.dormBillRun.findFirst({ where: { unitId, periodKey } });

  // ── ผู้ใช้ ──
  const OWN = await mkUser("owner", A, "OWNER", ["*"]);
  const OWNB = await mkUser("owner-b", B, "OWNER", ["*"]);
  const OWNC = await mkUser("owner-c", C, "OWNER", ["*"]);
  const cO = { tenantId: A, actorUserId: OWN.id }, cB = { tenantId: B, actorUserId: OWNB.id }, cC = { tenantId: C, actorUserId: OWNC.id };
  const mOwnerA = { role: "OWNER", unitAccess: ["*"], permissions: {}, userId: OWN.id };

  // ── DL: หอ 16 ห้อง (ร้าน A) · สัญญาละนโยบายค่าปรับ (snapshot) ──
  const BOOK_L = await mkBook(A, `บัญชีหอ D11 L ${stamp}`);
  const G0 = { "rooms.lateFee.graceDays": 0 };
  const SPEC: [string, string, Record<string, unknown>][] = [
    ["L1", "101", G0], ["L2", "102", {}], ["L3", "103", {}], ["L4", "104", { "rooms.lateFee.capPerBill": 100_000 }],
    ["L5", "105", { "rooms.lateFee.kind": "ONCE", "rooms.lateFee.amount": 30_000 }],
    ["L6", "106", { "rooms.lateFee.kind": "PERCENT", "rooms.lateFee.percentBp": 500, "rooms.lateFee.graceDays": 0 }],
    ["L7", "107", { "rooms.lateFee.kind": "NONE" }],
    ["L8", "108", { "rooms.lateFee.capPerBill": null, "rooms.lateFee.amount": 100_000, "rooms.lateFee.graceDays": 0 }],
    ["L9", "109", {}], ["L10", "110", {}], ["L11", "111", G0], ["L12", "112", G0], ["L13", "201", G0], ["L14", "202", G0], ["L15", "203", {}],
    ["L16", "204", { "rooms.lateFee.capPerBill": null }],
  ];
  const DLx = await dormUnit(A, "l", BOOK_L, SPEC.map(([, no, patch]) => ({ no, patch })));
  const DL = DLx.u;
  const LS: Record<string, string> = {};   // L1 → leaseId
  for (const [k, no] of SPEC) LS[k] = DLx.L[no].leaseId;
  const MGR = await mkUser("mgr", A, "MANAGER", [DL]);
  const CARE = await mkUser("care", A, "STAFF", [DL], ["dorm.view", "dorm.bill.run", "dorm.bill.send", "dorm.slip.review", "dorm.payment.manual"]);
  const MTR = await mkUser("meter", A, "STAFF", [DL], ["dorm.meter.read"]);
  const VIEW = await mkUser("view", A, "STAFF", [DL], ["dorm.view"]);
  const PEND = await mkUser("pend", A, "MANAGER", [DL], [], false);
  const cM = { tenantId: A, actorUserId: MGR.id }, cCare = { tenantId: A, actorUserId: CARE.id };
  const DX = await mkUnit(A, "DORM", "x");
  const HB = await mkUnit(A, "HOTEL", "hb");

  // ── PC-3: รอบ ต.ค. ผ่าน D.8 (หน่วยไม่มีน้ำไฟ) ──
  const S1: Record<string, any> = {};   // บิล ต.ค. ต่อสัญญา
  {
    let why = "";
    const r = await fn("prepareBillRun")?.(cO, { unitId: DL, periodKey: P1 }, { now: new Date(NOW1) });
    const s = r?.ok ? await sendAll(cO, DL, r.runId, NOW1) : null;
    for (const k of Object.keys(LS)) S1[k] = await billOf(DL, LS[k], P1);
    const sent = Object.values(S1).filter((b: any) => b?.status === "SENT" && b?.accountDocumentId && ymdOf(b?.dueDate) === "2026-10-05" && b?.totalSatang === BASE).length;
    if (!(r?.ok === true && r.billCount === 16 && r.totalSatang === 16 * BASE && r.gate?.ok === true && s?.ok === true && s.done === true && sent === 16)) why = J({ r: codeOf(r), c: r?.billCount, t: r?.totalSatang, gate: r?.gate, s: codeOf(s), sent });
    chk("PC-3", "D.8 บนหน่วยไม่มีน้ำไฟ: เตรียม+ส่งรอบ ต.ค. 16 บิล × 480,000 · ครบกำหนด 2026-10-05 · ใบแจ้งหนี้ครบ (ฐานของฉากเงินทั้งหมด)", !why, why, "CRITICAL");
    if (why) throw new Error(`ฉากรอบ ต.ค. ไม่ผ่าน (PC-3) — ทำต่อไม่ได้: ${why}`);
  }
  let payN = 0;
  const pay = async (billOrKey: any, amount: number, ymd: string) => {
    const b = billOrKey;
    const r = await ACC.recordExternalPayment({ tenantId: A, unitId: DL, docId: b.accountDocumentId, amountSatang: amount, idempotencyKey: `qc-d11-${stamp}-${++payN}`, paidAt: PAY(ymd) });
    if (!r?.ok) throw new Error(`fixture รับชำระ ${b?.id}: ${codeOf(r)} ${r?.reason ?? ""}`);
    return r;
  };
  // รับชำระบิล ต.ค. (L4 · L8 · L15 ค้าง)
  const OCT_PAY: [string, number, string][] = [["L1", BASE, "2026-10-09"], ["L2", BASE, "2026-10-08"], ["L3", BASE, "2026-10-10"], ["L5", BASE, "2026-10-12"],
    ["L6", 280_000, "2026-10-03"], ["L6", 200_000, "2026-10-07"], ["L7", BASE, "2026-10-20"], ["L9", BASE, "2026-10-15"], ["L10", BASE, "2026-10-05"],
    ["L11", BASE, "2026-10-09"], ["L12", BASE, "2026-10-09"], ["L13", BASE, "2026-10-09"], ["L14", BASE, "2026-10-09"], ["L16", BASE, "2026-10-05"]];
  for (const [k, amt, d] of OCT_PAY) await pay(S1[k], amt, d);
  {
    const sysId = BOOK_L;
    const rows = await ACC.listDocPayments(A, sysId, S1.L1.accountDocumentId);
    const lg = await ACC.docPaymentLedger(A, S1.L6.accountDocumentId);
    chk("PC-4", "recordExternalPayment: แถวรับชำระมี paidAt วันไทย 2026-10-09 (L1) · L6 สองครั้งรวม 480,000 ถึงสมุด (ฐานของวันจ่าย/เงินต้นค้าง)",
      Array.isArray(rows) && rows.length === 1 && bkkYmd(rows[0]?.paidAt) === "2026-10-09" && lg?.liveCashSatang === BASE, J({ rows: (rows ?? []).map((x: any) => [bkkYmd(x.paidAt), x.amount]), lg }), "CRITICAL");
  }

  // ═══════════════ W-1 · W-2 ยกเว้นก่อนลงบิล ═══════════════
  console.log("\n── W ยกเว้นค่าปรับ (ก่อนลงบิล) ──");
  const RSN = "ผู้เช่าแจ้งล่วงหน้าว่าโอนผิดบัญชี ตรวจสอบแล้วจริง";
  const waive = (ctx: any, k: string, now: string, reason = RSN, unitId = DL): Promise<any> => fn("waiveLateFee")!(ctx, { unitId, sourceBillId: S1[k]?.id, reason }, { now: new Date(now) });
  const waivedAudits = async (billId: string) => prisma.auditLog.findMany({ where: { tenantId: A, action: "dorm.latefee.waived", targetId: billId } });
  await T("W-1", "เจ้าของยกเว้นค่าปรับ L9 (จ่ายช้า 10 วัน · ยังไม่ลงบิล) ⇒ WAIVED created · ไม่มีใบลดหนี้ · audit dorm.latefee.waived 1 แถว (targetType DormBill · after มี leaseId/sourceBillId/reason)", ["waiveLateFee"], async () => {
    const r = await waive(cO, "L9", NOW_W1);
    const a = await waivedAudits(S1.L9.id);
    const af: any = a[0]?.after ?? {};
    return [r?.ok === true && r.status === "WAIVED" && r.created === true && Array.isArray(r.creditNotes) && r.creditNotes.length === 0 && a.length === 1 && a[0].targetType === "DormBill"
      && af.sourceBillId === S1.L9.id && af.leaseId === LS.L9 && af.reason === RSN, J({ r, a: a.map((x: any) => [x.targetType, x.after]) })];
  });
  await T("W-2", "ปฏิเสธ (ไม่มีอะไรเกิด): เหตุผลสั้น ⇒ REASON_REQUIRED · L10 จ่ายตรงวันครบ ⇒ NOT_OVERDUE · บิลไม่มีอยู่ ⇒ NOT_FOUND · ยกเว้น L9 ซ้ำ ⇒ WAIVED created false", ["waiveLateFee"], async () => {
    const a0 = await prisma.auditLog.count({ where: { tenantId: A, action: { startsWith: "dorm.latefee" } } });
    const a = await waive(cO, "L1", NOW_W1, "ช้า");
    const b = await waive(cO, "L10", NOW_W1);
    const c = await fn("waiveLateFee")!(cO, { unitId: DL, sourceBillId: "nope-bill", reason: RSN }, { now: new Date(NOW_W1) });
    const d = await waive(cO, "L9", NOW_W1);
    const a1 = await prisma.auditLog.count({ where: { tenantId: A, action: { startsWith: "dorm.latefee" } } });
    return [failOk(a, "REASON_REQUIRED") && failOk(b, "NOT_OVERDUE") && failOk(c, "NOT_FOUND") && d?.ok === true && d.status === "WAIVED" && d.created === false && a0 === a1,
      J({ a: codeOf(a), b: codeOf(b), c: codeOf(c), d: [codeOf(d), d?.created], a0, a1 })];
  });

  // ค่าตั้งหน่วยเปลี่ยนหลังทำสัญญา — ค่าปรับต้องคิดตาม snapshot ของสัญญา (ถ้าใช้ค่าตั้งใหม่ L1 = ONCE 10,000 · L3 = 10,000 ติดเพดาน 20,000 ฯลฯ)
  await U(A, DL, "rooms.lateFee.kind", "ONCE");
  await U(A, DL, "rooms.lateFee.amount", 10_000);
  await U(A, DL, "rooms.lateFee.graceDays", 0);
  await U(A, DL, "rooms.lateFee.capPerBill", 20_000);

  // ═══════════════ F. ค่าปรับอัตโนมัติ รอบ พ.ย. ═══════════════
  console.log("\n── F ค่าปรับอัตโนมัติ รอบ พ.ย. 2569 (asOf 25 ต.ค.) ──");
  const FEE2: Record<string, number> = { L1: 20_000, L2: 0, L3: 10_000, L4: 85_000, L5: 30_000, L6: 10_000, L7: 0, L8: 450_000, L9: 0, L10: 0, L11: 20_000, L12: 20_000, L13: 20_000, L14: 20_000, L15: 50_000, L16: 0 };
  const sumFee = (m: Record<string, number>) => Object.values(m).reduce((s, v) => s + v, 0);
  const bills2 = async () => { const o: Record<string, any> = {}; for (const k of Object.keys(LS)) o[k] = await billOf(DL, LS[k], P2); return o; };
  const feeDiff = (bs: Record<string, any>, want: Record<string, number>) => Object.keys(want).filter((k) => lateOf(bs[k]) !== want[k]).map((k) => `${k}:${lateOf(bs[k])}≠${want[k]}`);
  let run2 = "";
  await T("F-1", "prepareBillRun(DL, 2026-11, now 25 ต.ค.): 16 บิล · ค่าปรับต่อสัญญาตาม snapshot (L1 20,000 · L3 10,000 · L4 85,000 · L5 30,000 · L6 10,000 · L8 450,000 · L11–L14 20,000 · L15 50,000 · L2/L7/L9/L10/L16 ไม่มี) · ยอดรอบ 8,415,000", ["prepareBillRun"], async () => {
    const r = await prep(cO, DL, P2, NOW2);
    run2 = r?.runId ?? "";
    const bs = await bills2();
    const bad = feeDiff(bs, FEE2);
    return [r?.ok === true && r.created === true && r.billCount === 16 && r.totalSatang === 16 * BASE + sumFee(FEE2) && !bad.length, J({ r: codeOf(r), c: r?.billCount, t: r?.totalSatang, want: 16 * BASE + sumFee(FEE2), bad })];
  });
  await T("F-2", "ทุกบิลตรง buildDormBill ของ D.1 ทุกสตางค์ (ค่าห้อง 450,000 + ส่วนกลาง 30,000 + LATE_FEE) · ค่าปรับเป็นบรรทัด LATE_FEE แยก (ชนิดภาษี NONE · ไม่ใช่บรรทัดอื่น)", ["prepareBillRun"], async () => {
    const bs = await bills2();
    const bad: string[] = [];
    for (const k of Object.keys(LS)) {
      const b = bs[k], e = expBill(FEE2[k]);
      if (b?.totalSatang !== e.totalSatang || b?.subtotalSatang !== e.subtotalSatang) bad.push(`${k}:${b?.totalSatang}≠${e.totalSatang}`);
      if (FEE2[k] > 0 && lineOf(b, "LATE_FEE")?.taxKind !== "NONE") bad.push(`${k}:taxKind=${lineOf(b, "LATE_FEE")?.taxKind}`);
      const other = (b?.lines ?? []).filter((l: any) => !["RENT", "COMMON", "LATE_FEE"].includes(l.code)).map((l: any) => l.code);
      if (other.length) bad.push(`${k}:บรรทัดเกิน ${other.join(",")}`);
    }
    return [!bad.length, bad.slice(0, 6).join(" · ")];
  });
  await T("F-3", "meta.auto ของบรรทัดค่าปรับ: L1 = [{ sourceBillId = บิล ต.ค. L1 · periodKey 2026-10 · daysLate 4 · chargeableDays 4 · amountSatang 20,000 }] · L4 daysLate 20 chargeable 17 (ผ่อนผัน 3 ของ snapshot · ไม่ใช่ 0 ของค่าตั้งใหม่)", ["prepareBillRun"], async () => {
    const bs = await bills2();
    const a1 = autoOf(bs.L1), a4 = autoOf(bs.L4);
    const e1 = a1?.[0], e4 = a4?.[0];
    return [a1?.length === 1 && e1?.sourceBillId === S1.L1.id && e1?.periodKey === P1 && e1?.daysLate === 4 && e1?.chargeableDays === 4 && e1?.amountSatang === 20_000
      && a4?.length === 1 && e4?.sourceBillId === S1.L4.id && e4?.daysLate === 20 && e4?.chargeableDays === 17 && e4?.amountSatang === 85_000, J({ a1, a4 })];
  });
  await T("F-4", "ชนิดค่าปรับจาก snapshot: L5 ครั้งเดียว 30,000 · L6 5% ของเงินต้นที่ยังค้าง ณ วันครบ (200,000 ⇒ 10,000 · จ่าย 280,000 ก่อนครบแล้ว) · L7 ไม่มีค่าปรับ · L2 ช้า 3 วันในผ่อนผัน 3 ⇒ ไม่มี · L10 จ่ายวันครบ ⇒ ไม่มี", ["prepareBillRun"], async () => {
    const bs = await bills2();
    return [lateOf(bs.L5) === 30_000 && lateOf(bs.L6) === 10_000 && !lineOf(bs.L7, "LATE_FEE") && !lineOf(bs.L2, "LATE_FEE") && !lineOf(bs.L10, "LATE_FEE"),
      J({ L5: lateOf(bs.L5), L6: lateOf(bs.L6), L7: !!lineOf(bs.L7, "LATE_FEE"), L2: !!lineOf(bs.L2, "LATE_FEE"), L10: !!lineOf(bs.L10, "LATE_FEE") })];
  });
  await T("F-5", "เพดาน: L15 ช้า 20 วัน (85,000) ติดเพดานสัญญา 50,000 (capped 1) · L4 เพดานสัญญา 100,000 ไม่ติด · L8 สัญญาไม่มีเพดาน ⇒ กันพิมพ์ผิดจากค่าตั้ง guardRentBp 10,000 = ค่าเช่า 1 เดือน 450,000 (จากสูตร 2,000,000) · L9 ยกเว้นแล้ว ⇒ ไม่มีบรรทัด", ["prepareBillRun"], async () => {
    const bs = await bills2();
    const a15 = autoOf(bs.L15)?.[0], a8 = autoOf(bs.L8)?.[0];
    return [lateOf(bs.L15) === 50_000 && a15?.capped === 1 && lateOf(bs.L4) === 85_000 && lateOf(bs.L8) === 450_000 && a8?.capped === 1 && !lineOf(bs.L9, "LATE_FEE"),
      J({ L15: [lateOf(bs.L15), a15], L8: [lateOf(bs.L8), a8], L9: !!lineOf(bs.L9, "LATE_FEE") })];
  });
  await T("F-6", "lateFeeLedger L4 (now 25 ต.ค.): บิลต้นทาง ต.ค. · ค้าง (paidDate null) · daysLate 20 · accrued 85,000 · cap 100,000 · due 85,000 · charged 85,000 ในบิล พ.ย. · policy PER_DAY 5,000 ผ่อนผัน 3 · L9 ledger: waiver APPLIED · due 0 · charged 0", ["lateFeeLedger"], async () => {
    const g = await fn("lateFeeLedger")!(cO, { unitId: DL, leaseId: LS.L4 }, { now: new Date(NOW2) });
    const it = g?.items?.find((x: any) => x.sourceBillId === S1.L4.id);
    const g9 = await fn("lateFeeLedger")!(cO, { unitId: DL, leaseId: LS.L9 }, { now: new Date(NOW2) });
    const i9 = g9?.items?.find((x: any) => x.sourceBillId === S1.L9.id);
    const b4 = await billOf(DL, LS.L4, P2);
    return [it?.paidDate === null && it?.daysLate === 20 && it?.accruedSatang === 85_000 && it?.capSatang === 100_000 && it?.dueSatang === 85_000 && it?.chargedSatang === 85_000
      && J((it?.charges ?? []).map((c: any) => [c.billId, c.amountSatang])) === J([[b4?.id, 85_000]]) && it?.policy?.kind === "PER_DAY" && it?.policy?.amountSatang === 5_000 && it?.policy?.graceDays === 3
      && i9?.waiver?.status === "APPLIED" && i9?.dueSatang === 0 && i9?.chargedSatang === 0, J({ it, i9 })];
  });
  await T("F-7", "เพดานกฎหมาย (deps.legalParams lateFeeCapSatang 15,000 → evaluateLegal): เตรียมซ้ำ ⇒ ทุกค่าปรับ ≤ 15,000 (L1 15,000 · L3 10,000 · L4 15,000 · L8 15,000) changed 9 · เตรียมซ้ำไม่มี params ⇒ กลับค่าเดิม changed 9", ["prepareBillRun"], async () => {
    const a = await prep(cO, DL, P2, NOW2, { legalParams: { lateFeeCapSatang: 15_000 } });
    const bs = await bills2();
    const capped: Record<string, number> = Object.fromEntries(Object.entries(FEE2).map(([k, v]) => [k, Math.min(v, 15_000)]));
    const bad = feeDiff(bs, capped);
    const b = await prep(cO, DL, P2, NOW2);
    const bad2 = feeDiff(await bills2(), FEE2);
    return [a?.ok === true && a.changed === 9 && !bad.length && b?.ok === true && b.changed === 9 && !bad2.length, J({ a: [codeOf(a), a?.changed], bad, b: [codeOf(b), b?.changed], bad2 })];
  });
  FEE2.L8 = 45_000;
  await T("F-8", "ค่าตั้งปัจจุบัน guardRentBp 1,000 (10% ของค่าเช่า) ⇒ เตรียมซ้ำ: L8 = 45,000 · changed 1 · ยอดรอบ 8,010,000 (กันพิมพ์ผิดอ่านค่าตั้งของหน่วย ไม่ใช่ตัวเลขในโค้ด)", ["prepareBillRun"], async () => {
    await U(A, DL, "rooms.lateFee.guardRentBp", 1_000);
    const r = await prep(cO, DL, P2, NOW2);
    const bs = await bills2();
    return [r?.ok === true && r.changed === 1 && lateOf(bs.L8) === 45_000 && r.totalSatang === 16 * BASE + sumFee(FEE2), J({ r: [codeOf(r), r?.changed, r?.totalSatang], L8: lateOf(bs.L8) })];
  });
  await T("F-9", "เตรียมซ้ำ (now เดิม) ⇒ changed 0 · ไม่มีแถวใด updatedAt ขยับ · ค่าปรับคงเดิม", ["prepareBillRun"], async () => {
    const before = await prisma.dormBill.findMany({ where: { runId: run2 } });
    const r = await prep(cO, DL, P2, NOW2);
    const after = await prisma.dormBill.findMany({ where: { runId: run2 } });
    const moved = after.filter((a: any) => before.find((b: any) => b.id === a.id)?.updatedAt?.getTime() !== a.updatedAt?.getTime()).length;
    return [r?.ok === true && r.changed === 0 && !moved && !feeDiff(await bills2(), FEE2).length, J({ r: [codeOf(r), r?.changed], moved })];
  });
  await T("F-10", "rooms.lateFee.autoCharge ปิด ⇒ เตรียมซ้ำ: ไม่มีค่าปรับอัตโนมัติ (ยอดรอบ 7,680,000) · เปิดคืน ⇒ กลับมาเท่าเดิม", ["prepareBillRun"], async () => {
    await U(A, DL, "rooms.lateFee.autoCharge", false);
    const a = await prep(cO, DL, P2, NOW2);
    const none = Object.values(await bills2()).every((b: any) => !lineOf(b, "LATE_FEE"));
    await unsetVal(A, "rooms.lateFee.autoCharge", DL);
    const b = await prep(cO, DL, P2, NOW2);
    return [a?.ok === true && a.totalSatang === 16 * BASE && none && b?.ok === true && b.totalSatang === 16 * BASE + sumFee(FEE2) && !feeDiff(await bills2(), FEE2).length,
      J({ a: [codeOf(a), a?.totalSatang], none, b: [codeOf(b), b?.totalSatang] })];
  });
  await T("F-11", "billRunModel kpi.lateFeeSatang = 330,000 (Σ ค่าปรับจริง) · getBill L1: บรรทัด LATE_FEE ยอด 20,000 · detail มี \"ต.ค.\" \"2569\" \"4 วัน\"", ["billRunModel", "getBill"], async () => {
    const m = await fn("billRunModel")!(cO, { unitId: DL, periodKey: P2 });
    const b1 = await billOf(DL, LS.L1, P2);
    const g = await fn("getBill")!(cO, { unitId: DL, billId: b1?.id });
    const ln = (g?.lines ?? []).find((l: any) => l.code === "LATE_FEE");
    return [m?.kpi?.lateFeeSatang === sumFee(FEE2) && ln?.amountSatang === 20_000 && /ต\.ค\./.test(ln?.detail ?? "") && /2569/.test(ln?.detail ?? "") && /4\s*วัน/.test(ln?.detail ?? ""),
      J({ kpi: m?.kpi?.lateFeeSatang, ln })];
  }, "MAJOR");
  await T("F-12", "X3 เตรียมรอบ พ.ย. ซ้อน 4 โพรเซส × 2 ⇒ ไม่มี throw · ทุกบิลมีรายการอัตโนมัติไม่เกิน 1 ต่อบิลต้นทาง · ค่าปรับ/ยอดเท่าเดิมทุกสตางค์", ["prepareBillRun"], async () => {
    const rs = await fanout("prepareBillRun", cO, Array.from({ length: 8 }, () => ({ unitId: DL, periodKey: P2 })), { now: NOW2 });
    const bs = await bills2();
    const dup = Object.entries(bs).filter(([, b]) => { const a = autoOf(b) ?? []; return new Set(a.map((x: any) => x.sourceBillId)).size !== a.length; }).map(([k]) => k);
    const run = await prisma.dormBillRun.findFirst({ where: { id: run2 } });
    return [!badOf(rs).length && !dup.length && !feeDiff(bs, FEE2).length && run?.totalSatang === 16 * BASE + sumFee(FEE2), J({ bad: badOf(rs).slice(0, 3), dup, t: run?.totalSatang })];
  });

  // ═══════════════ W-3..W-6 (บิลปลายทางยัง DRAFT) ═══════════════
  console.log("\n── W ยกเว้นค่าปรับ (บิลปลายทาง DRAFT · ยื่นขอ) ──");
  await T("W-3", "เจ้าของยกเว้น L12 ขณะบิล พ.ย. ยัง DRAFT ⇒ บรรทัดค่าปรับหายทันที (บิล 480,000 · ยอดรอบ −20,000) · ไม่มีใบลดหนี้ · เตรียมซ้ำไม่เด้งกลับ", ["waiveLateFee", "prepareBillRun"], async () => {
    const r = await waive(cO, "L12", NOW2);
    const b = await billOf(DL, LS.L12, P2);
    const run = await prisma.dormBillRun.findFirst({ where: { id: run2 } });
    FEE2.L12 = 0;
    const p = await prep(cO, DL, P2, NOW2);
    const b2 = await billOf(DL, LS.L12, P2);
    return [r?.ok === true && r.status === "WAIVED" && r.created === true && (r.creditNotes ?? []).length === 0 && b?.totalSatang === BASE && !lineOf(b, "LATE_FEE")
      && run?.totalSatang === 16 * BASE + sumFee(FEE2) && p?.ok === true && p.changed === 0 && b2?.totalSatang === BASE, J({ r, b: b?.totalSatang, run: run?.totalSatang, p: [codeOf(p), p?.changed] })];
  });
  await T("W-4", "X3 แข่ง: ยกเว้น L15 (6 ทาง) พร้อมเตรียมรอบ (6 ทาง) จาก 4 โพรเซส ⇒ audit ยกเว้น 1 · WAIVED created true 1 ราย · สุดท้ายบิล L15 ไม่มีค่าปรับของบิล ต.ค. (ไม่เด้งกลับ) · ไม่มี throw", ["waiveLateFee", "prepareBillRun"], async () => {
    const wIn = Array.from({ length: 6 }, () => ({ unitId: DL, sourceBillId: S1.L15.id, reason: RSN }));
    const pIn = Array.from({ length: 6 }, () => ({ unitId: DL, periodKey: P2 }));
    const [ws, ps] = await Promise.all([fanout("waiveLateFee", cO, wIn, { now: NOW2 }, 2), fanout("prepareBillRun", cO, pIn, { now: NOW2 }, 2)]);
    const p = await prep(cO, DL, P2, NOW2);
    const b = await billOf(DL, LS.L15, P2);
    const a = await waivedAudits(S1.L15.id);
    FEE2.L15 = 0;
    return [!badOf(ws).length && !badOf(ps).length && ws.filter((x) => x?.created === true).length === 1 && a.length === 1 && p?.ok === true && !lineOf(b, "LATE_FEE") && b?.totalSatang === BASE,
      J({ ws: ws.map(codeOf), created: ws.filter((x) => x?.created === true).length, ps: badOf(ps).slice(0, 2), audits: a.length, b: b?.totalSatang })];
  });
  let reqL13 = "", reqL14 = "";
  await T("W-5", "ผู้ดูแล (ไม่ถือคีย์ยกเว้น · โหมดเริ่ม OWNER_APPROVAL) ยื่นขอ L13: ไม่มีสายอนุมัติ ⇒ NEEDS_APPROVAL (ไม่มีคำขอ) · ตั้งสายอนุมัติขั้น OWNER ⇒ PENDING_APPROVAL + requestId (entityType dorm.latefee.waive · entityId บิล ต.ค. · unitId) · ยื่นซ้ำ ⇒ requestId เดิม · ค่าปรับยังอยู่", ["waiveLateFee"], async () => {
    const a = await waive(cCare, "L13", NOW2);
    const n0 = await prisma.approvalRequest.count({ where: { tenantId: A } });
    await APS.createPolicy({ tenantId: A }, { name: "ยกเว้นค่าปรับหอ", entityType: "dorm.latefee.waive", steps: [{ order: 1, approverRole: "OWNER" }] });
    const b = await waive(cCare, "L13", NOW2);
    reqL13 = b?.requestId ?? "";
    const c = await waive(cCare, "L13", NOW2);
    const q = reqL13 ? await prisma.approvalRequest.findFirst({ where: { id: reqL13, tenantId: A } }) : null;
    const bl = await billOf(DL, LS.L13, P2);
    return [failOk(a, "NEEDS_APPROVAL") && n0 === 0 && b?.ok === true && b.status === "PENDING_APPROVAL" && !!reqL13 && c?.ok === true && c.requestId === reqL13 && c.created === false
      && q?.entityType === "dorm.latefee.waive" && q?.entityId === S1.L13.id && q?.unitId === DL && q?.status === "PENDING" && lateOf(bl) === 20_000 && (await waivedAudits(S1.L13.id)).length === 0,
      J({ a: codeOf(a), n0, b, c: [c?.requestId === reqL13, c?.created], q: q && [q.entityType, q.entityId === S1.L13.id, q.unitId === DL, q.status], fee: lateOf(bl) })];
  });
  await T("W-6", "ผู้ดูแลยื่นขอ L14 ⇒ PENDING · เจ้าของปฏิเสธในสายอนุมัติ ⇒ ค่าปรับคงอยู่ · ledger waiver REJECTED · ยื่นซ้ำ ⇒ ALREADY_REJECTED", ["waiveLateFee", "lateFeeLedger"], async () => {
    const r = await waive(cCare, "L14", NOW2);
    reqL14 = r?.requestId ?? "";
    const d = reqL14 ? await APS.decide(mOwnerA, { tenantId: A }, reqL14, { decision: "REJECTED", note: "ไม่อนุมัติ" }) : null;
    const again = await waive(cCare, "L14", NOW2);
    const g = await fn("lateFeeLedger")!(cO, { unitId: DL, leaseId: LS.L14 }, { now: new Date(NOW2) });
    const it = g?.items?.find((x: any) => x.sourceBillId === S1.L14.id);
    const p = await prep(cO, DL, P2, NOW2);
    return [r?.status === "PENDING_APPROVAL" && d?.ok === true && failOk(again, "ALREADY_REJECTED") && it?.waiver?.status === "REJECTED" && p?.ok === true && lateOf(await billOf(DL, LS.L14, P2)) === 20_000,
      J({ r: codeOf(r), d: d?.ok, again: codeOf(again), w: it?.waiver })];
  });

  // ═══════════════ N-1 ส่งรอบ พ.ย. ═══════════════
  console.log("\n── N ส่งรอบ พ.ย. · เงิน ──");
  const docLines = async (docId: string) => prisma.accountDocumentLine.findMany({ where: { documentId: docId } });
  await T("N-1", "ส่งรอบ พ.ย.: 16 ใบแจ้งหนี้ · ยอดใบ = ยอดบิลทุกใบ · Σ 7,940,000 · ใบ L1 มีบรรทัด \"ค่าปรับ...\" 20,000 (qty×ราคา) · บิลไม่มีค่าปรับไม่มีบรรทัดนี้", ["sendBillRun"], async () => {
    const s = await sendAll(cO, DL, run2, NOW2);
    const bs = await bills2();
    const bad: string[] = [];
    let sum = 0;
    for (const k of Object.keys(LS)) {
      const b = bs[k];
      const d: any = b?.accountDocumentId ? await prisma.accountDocument.findFirst({ where: { id: b.accountDocumentId } }) : null;
      if (!d || d.grandTotal !== b.totalSatang || d.docType !== "INVOICE") { bad.push(`${k}:${d?.grandTotal}≠${b?.totalSatang}`); continue; }
      sum += d.grandTotal;
      const fl = (await docLines(d.id)).filter((l: any) => /ค่าปรับ/.test(l.description));
      const amt = fl.reduce((x: number, l: any) => x + Number(l.amount), 0);
      if (amt !== FEE2[k]) bad.push(`${k}:บรรทัดค่าปรับ ${amt}≠${FEE2[k]}`);
    }
    return [s?.ok === true && s.done === true && !bad.length && sum === 16 * BASE + sumFee(FEE2) && sum === 7_940_000, J({ s: codeOf(s), sum, bad: bad.slice(0, 5) })];
  });

  // ═══════════════ W-7..W-11 หลังส่ง ═══════════════
  console.log("\n── W ยกเว้นค่าปรับ (หลังส่ง = ใบลดหนี้ · อนุมัติ · โหมด) ──");
  const cnOf = async (docId: string) => prisma.accountDocument.findMany({ where: { tenantId: A, docType: "CREDIT_NOTE", sourceDocId: docId } });
  const b11before = await billOf(DL, LS.L11, P2);
  await T("W-7", "X3 เจ้าของยกเว้น L11 หลังส่ง 8 ทางพร้อมกัน (4 ในโพรเซส + 4 โพรเซสลูก) ⇒ ใบลดหนี้ 1 ใบ 20,000 อ้างใบ พ.ย. L11 · ref DormBillAdjust/<billId>:waive:<บิลต้นทาง> · created true 1 ราย · audit ยกเว้น 1", ["waiveLateFee"], async () => {
    const kids = fanout("waiveLateFee", cO, Array.from({ length: 4 }, () => ({ unitId: DL, sourceBillId: S1.L11.id, reason: RSN })), { now: NOW_A }, 2, SYNC_MS);
    const mine = inProcAt(SYNC_MS, Array.from({ length: 4 }, () => () => waive(cO, "L11", NOW_A)));
    const rs = [...(await mine), ...(await kids)];
    const cns = await cnOf(b11before?.accountDocumentId ?? "");
    const cn = cns[0];
    const a = await waivedAudits(S1.L11.id);
    return [!badOf(rs).length && rs.filter((x) => x?.created === true).length === 1 && cns.length === 1 && cn?.grandTotal === 20_000 && cn?.refType === "DormBillAdjust" && cn?.refId === `${b11before?.id}:waive:${S1.L11.id}` && a.length === 1,
      J({ codes: rs.map(codeOf), created: rs.filter((x) => x?.created === true).length, cns: cns.map((d: any) => [d.grandTotal, d.refType, d.refId]), audits: a.length })];
  });
  await T("W-8", "ไม่แก้ทับ: บิล พ.ย. L11 lines/totalSatang/สถานะเหมือนก่อนยกเว้นทุกไบต์ · audit dorm.bill.adjusted มี docId ของใบลดหนี้ · ยกเว้นซ้ำ ⇒ created false ไม่มีใบใหม่", ["waiveLateFee"], async () => {
    const after = await billOf(DL, LS.L11, P2);
    const cns = await cnOf(b11before?.accountDocumentId ?? "");
    const adj = await prisma.auditLog.findMany({ where: { tenantId: A, action: "dorm.bill.adjusted" } });
    const again = await waive(cO, "L11", NOW_A);
    const cns2 = await cnOf(b11before?.accountDocumentId ?? "");
    return [J(after?.lines) === J(b11before?.lines) && after?.totalSatang === b11before?.totalSatang && after?.status === b11before?.status && adj.some((x: any) => x.after?.docId === cns[0]?.id)
      && again?.ok === true && again.created === false && cns2.length === 1, J({ t: [after?.totalSatang, b11before?.totalSatang], adj: adj.length, again: [codeOf(again), again?.created], cns2: cns2.length })];
  });
  await T("W-9", "เจ้าของอนุมัติคำขอ L13 ในสายอนุมัติ ⇒ ledger APPROVED · งานตามเวลา (ทางสำรอง) ซ้อน 3 ทาง (1 ในโพรเซส + 2 โพรเซส) ⇒ ใบลดหนี้ 20,000 1 ใบ · audit ยกเว้น 1 (approvalId = requestId) · applyLateFeeWaiverApproval ซ้ำ ⇒ ALREADY", ["runDormDunningJobs", "applyLateFeeWaiverApproval", "lateFeeLedger"], async () => {
    const d = await APS.decide(mOwnerA, { tenantId: A }, reqL13, { decision: "APPROVED" });
    const g0 = await fn("lateFeeLedger")!(cO, { unitId: DL, leaseId: LS.L13 }, { now: new Date(NOW_A) });
    const w0 = g0?.items?.find((x: any) => x.sourceBillId === S1.L13.id)?.waiver?.status;
    const job = fn("runDormDunningJobs")!;
    const [kids, a] = await Promise.all([fanout("__dunning", null, [{ now: NOW_A, tenantId: A }, { now: NOW_A, tenantId: A }], null, 2, SYNC_MS), inProcAt(SYNC_MS, [() => job(new Date(NOW_A), { tenantId: A })])]);
    const b13 = await billOf(DL, LS.L13, P2);
    const cns = await cnOf(b13?.accountDocumentId ?? "");
    const au = await waivedAudits(S1.L13.id);
    const again = await fn("applyLateFeeWaiverApproval")!({ tenantId: A, requestId: reqL13, sourceBillId: S1.L13.id });
    return [d?.ok === true && w0 === "APPROVED" && !badOf([...a, ...kids]).length && cns.length === 1 && cns[0]?.grandTotal === 20_000 && au.length === 1 && (au[0]?.after as any)?.approvalId === reqL13 && again?.status === "ALREADY",
      J({ d: d?.ok, w0, jobs: [...a, ...kids].map((x) => x?.waiversApplied ?? codeOf(x)), cns: cns.length, au: au.map((x: any) => x.after?.approvalId), again })];
  });
  await T("W-10", "คำขอที่ถูกปฏิเสธ (L14) งานตามเวลาไม่ทำอะไร: ไม่มีใบลดหนี้ · ไม่มี audit ยกเว้น · applyLateFeeWaiverApproval ⇒ SKIPPED", ["applyLateFeeWaiverApproval"], async () => {
    const b14 = await billOf(DL, LS.L14, P2);
    const r = await fn("applyLateFeeWaiverApproval")!({ tenantId: A, requestId: reqL14, sourceBillId: S1.L14.id });
    return [(await cnOf(b14?.accountDocumentId ?? "")).length === 0 && (await waivedAudits(S1.L14.id)).length === 0 && r?.status === "SKIPPED", J({ r })];
  });
  await T("W-11", "โหมด (ค่าตั้ง waiverApproval): OWNER_ONLY ⇒ ผู้จัดการ/ผู้ดูแล OWNER_ONLY · MANAGER_DIRECT ⇒ ผู้จัดการ (ถือคีย์) ยกเว้น L3 ได้ทันที ⇒ ใบลดหนี้ 10,000", ["waiveLateFee"], async () => {
    await U(A, DL, "rooms.lateFee.waiverApproval", "OWNER_ONLY");
    const a = await waive(cM, "L3", NOW_A), b = await waive(cCare, "L3", NOW_A);
    await U(A, DL, "rooms.lateFee.waiverApproval", "MANAGER_DIRECT");
    const c = await waive(cM, "L3", NOW_A);
    await unsetVal(A, "rooms.lateFee.waiverApproval", DL);
    const b3 = await billOf(DL, LS.L3, P2);
    const cns = await cnOf(b3?.accountDocumentId ?? "");
    return [failOk(a, "OWNER_ONLY") && failOk(b, "OWNER_ONLY") && c?.ok === true && c.status === "WAIVED" && (c.creditNotes ?? []).length === 1 && cns.length === 1 && cns[0]?.grandTotal === 10_000,
      J({ a: codeOf(a), b: codeOf(b), c: [codeOf(c), c?.creditNotes], cns: cns.map((d: any) => d.grandTotal) })];
  });

  // ═══════════════ R. รอบ ธ.ค. ═══════════════
  console.log("\n── R ค่าปรับรอบ ธ.ค. 2569 (asOf 26 พ.ย.) · ส่วนเพิ่ม · เพดาน 2 ชั้น · ไม่ทบต้น ──");
  const S2: Record<string, any> = await bills2();   // บิล พ.ย. (ส่งแล้ว)
  await pay(S1.L4, BASE, "2026-10-28");                              // L4 จ่าย ต.ค. ช้า 23 วัน (หลังลงค่าปรับ 85,000 ไปแล้ว)
  await pay(S2.L1, BASE + 20_000, "2026-11-03");                     // L1 จ่าย พ.ย. ครบ (รวมค่าปรับ) ตรงเวลา
  for (const k of ["L2", "L7", "L9", "L10", "L16"]) await pay(S2[k], BASE, "2026-11-05");
  await pay(S2.L3, BASE, "2026-11-05");                              // L3 พ.ย. 490,000 − ลดหนี้ 10,000 = 480,000
  await pay(S2.L5, BASE, "2026-11-04");                              // L5 จ่ายเฉพาะเงินต้น · ค่าปรับ 30,000 ค้าง
  await pay(S2.L6, BASE + 10_000, "2026-11-07");                     // L6 จ่ายช้า 2 วันทั้งใบ 490,000
  await T("W-12", "ยกเว้นค่าปรับ L1 หลังผู้เช่าจ่ายบิล พ.ย. ครบแล้ว ⇒ ALREADY_PAID · ไม่มีใบลดหนี้ · ไม่มี audit ยกเว้น (คืนเงิน = D.12/บัญชี)", ["waiveLateFee"], async () => {
    const r = await waive(cO, "L1", NOW3);
    return [failOk(r, "ALREADY_PAID") && (await cnOf(S2.L1.accountDocumentId)).length === 0 && (await waivedAudits(S1.L1.id)).length === 0, J({ r: codeOf(r) })];
  });
  const bills3 = async () => { const o: Record<string, any> = {}; for (const k of Object.keys(LS)) o[k] = await billOf(DL, LS[k], P3); return o; };
  let run3 = "";
  await T("R-1", "เตรียมรอบ ธ.ค. (now 26 พ.ย.): L4 ค่าปรับ 100,000 = ส่วนเพิ่มของ ต.ค. 15,000 (จ่ายช้า 23 วัน ⇒ 100,000 − ลงแล้ว 85,000) + ของ พ.ย. 85,000 (สูตร 90,000 ตัดตามเพดานบิลปลายทาง 100,000 · capped 1)", ["prepareBillRun"], async () => {
    const r = await prep(cO, DL, P3, NOW3);
    run3 = r?.runId ?? "";
    const b = await billOf(DL, LS.L4, P3);
    const a = autoOf(b) ?? [];
    const o = a.find((x: any) => x.sourceBillId === S1.L4.id), n = a.find((x: any) => x.sourceBillId === S2.L4.id);
    return [r?.ok === true && lateOf(b) === 100_000 && a.length === 2 && o?.amountSatang === 15_000 && o?.periodKey === P1 && n?.amountSatang === 85_000 && n?.periodKey === P2 && n?.capped === 1,
      J({ r: codeOf(r), fee: lateOf(b), a })];
  });
  await T("R-2", "lateFeeLedger L4 (now 26 พ.ย.): ต.ค. paidDate 2026-10-28 · daysLate 23 · accrued 100,000 · charged 100,000 (2 บิล) · พ.ย. ค้าง daysLate 21 · accrued 90,000 · charged 85,000", ["lateFeeLedger"], async () => {
    const g = await fn("lateFeeLedger")!(cO, { unitId: DL, leaseId: LS.L4 }, { now: new Date(NOW3) });
    const o = g?.items?.find((x: any) => x.sourceBillId === S1.L4.id), n = g?.items?.find((x: any) => x.sourceBillId === S2.L4.id);
    return [o?.paidDate === "2026-10-28" && o?.daysLate === 23 && o?.accruedSatang === 100_000 && o?.chargedSatang === 100_000 && (o?.charges ?? []).length === 2
      && n?.paidDate === null && n?.daysLate === 21 && n?.accruedSatang === 90_000 && n?.chargedSatang === 85_000, J({ o, n })];
  });
  await T("R-3", "ไม่ทบต้น: L5 จ่ายเงินต้น พ.ย. ตรงเวลา ค้างเฉพาะค่าปรับ 30,000 ⇒ บิล ธ.ค. ไม่มีค่าปรับ · L6 (5%) จ่ายช้า 2 วันทั้งใบ 490,000 ⇒ 24,000 (5% ของเงินต้น 480,000 ไม่ใช่ 24,500 ของยอดรวมค่าปรับ)", ["prepareBillRun"], async () => {
    const bs = await bills3();
    const a6 = autoOf(bs.L6) ?? [];
    return [!lineOf(bs.L5, "LATE_FEE") && lateOf(bs.L6) === 24_000 && a6.length === 1 && a6[0]?.sourceBillId === S2.L6.id, J({ L5: lateOf(bs.L5), L6: lateOf(bs.L6), a6 })];
  });
  await T("R-4", "เพดานต่อบิลต้นทาง: L8 บิล ต.ค. ลงครบเพดานกันพิมพ์ผิด 45,000 แล้ว (ยังค้าง 52 วัน) ⇒ ไม่เพิ่ม · บิล ธ.ค. มีเฉพาะของ พ.ย. 45,000", ["prepareBillRun"], async () => {
    const b = await billOf(DL, LS.L8, P3);
    const a = autoOf(b) ?? [];
    return [lateOf(b) === 45_000 && a.length === 1 && a[0]?.sourceBillId === S2.L8.id, J({ fee: lateOf(b), a })];
  });
  await T("R-5", "จ่าย พ.ย. ตรงเวลา ⇒ บิล ธ.ค. ไม่มีค่าปรับ: L1 · L2 · L3 · L7 · L9 · L10 · L16", ["prepareBillRun"], async () => {
    const bs = await bills3();
    const has = ["L1", "L2", "L3", "L7", "L9", "L10", "L16"].filter((k) => !!lineOf(bs[k], "LATE_FEE"));
    return [!has.length && Object.keys(bs).length === 16 && Object.values(bs).every((b: any) => !!b), J({ has })];
  });
  const capOf = (k: string) => { const p = SPEC.find((s) => s[0] === k)?.[2] ?? {}; const c = "rooms.lateFee.capPerBill" in p ? (p["rooms.lateFee.capPerBill"] as number | null) : 50_000; return c === null ? Math.floor(RENT * 1_000 / 10_000) : c; };
  await T("R-6", "ตรวจทั้งหน่วย (ทุกบิลทุกงวด): Σ LATE_FEE ต่อบิลปลายทาง ≤ เพดาน E ของสัญญา · Σ รายการอัตโนมัติต่อบิลต้นทาง ≤ E · ไม่มีบิลต้นทางที่ยกเว้นแล้วถูกลงในบิล DRAFT", ["prepareBillRun"], async () => {
    const all = await prisma.dormBill.findMany({ where: { unitId: DL } });
    const lk = Object.fromEntries(Object.entries(LS).map(([k, v]) => [v, k]));
    const bad: string[] = [];
    const perSrc = new Map<string, number>();
    const waived = new Set([S1.L9.id, S1.L12.id, S1.L15.id, S1.L11.id, S1.L13.id, S1.L3.id]);
    for (const b of all) {
      const k = lk[b.leaseId];
      if (lateOf(b) > capOf(k)) bad.push(`${k}/${b.periodKey}:${lateOf(b)}>${capOf(k)}`);
      for (const e of autoOf(b) ?? []) {
        perSrc.set(e.sourceBillId, (perSrc.get(e.sourceBillId) ?? 0) + Number(e.amountSatang));
        if (b.status === "DRAFT" && waived.has(e.sourceBillId)) bad.push(`${k}/${b.periodKey}: ลงค่าปรับของบิลที่ยกเว้นแล้ว`);
      }
    }
    const src = new Map(all.map((b: any) => [b.id, lk[b.leaseId]]));
    for (const [s, v] of perSrc) if (v > capOf(src.get(s) as string)) bad.push(`src ${src.get(s)}:${v}`);
    return [all.length === 48 && !bad.length, J({ n: all.length, bad: bad.slice(0, 6) })];
  });

  // ═══════════════ M. บรรทัดมือ / ใบเพิ่มหนี้ ═══════════════
  console.log("\n── M บรรทัดมือ · ใบเพิ่มหนี้ · เพดานกันพิมพ์ผิดจากค่าตั้ง (หนี้ F15) ──");
  const FEE = (a: number) => [{ kind: "LATE_FEE", labelTh: "ค่าปรับชำระล่าช้า", amountSatang: a, note: "ปรับมือ" }];
  const xl = (k: string, a: number) => billOf(DL, LS[k], P3).then((b: any) => fn("setBillExtraLines")!(cO, { unitId: DL, billId: b?.id, lines: a ? FEE(a) : [] }));
  await T("M-1", "L10 (เพดานสัญญา 50,000 · ไม่มีค่าปรับอัตโนมัติ): บรรทัดมือ 50,000 ได้ · 50,001 ⇒ LATE_FEE_OVER_CAP · ล้างได้", ["setBillExtraLines"], async () => {
    const a = await xl("L10", 50_000), b = await xl("L10", 50_001), c = await xl("L10", 0);
    return [a?.ok === true && failOk(b, "LATE_FEE_OVER_CAP") && c?.ok === true, J([codeOf(a), codeOf(b), codeOf(c)])];
  });
  await T("M-2", "L16 (สัญญาไม่มีเพดาน): กันพิมพ์ผิดจากค่าตั้ง guardRentBp 1,000 ⇒ 45,000 ได้ · 45,001 ⇒ LATE_FEE_OVER_CAP · ค่าตั้ง null (ไม่จำกัด) ⇒ 100,000 ได้", ["setBillExtraLines"], async () => {
    const a = await xl("L16", 45_000), b = await xl("L16", 45_001);
    await U(A, DL, "rooms.lateFee.guardRentBp", null);
    const c = await xl("L16", 100_000);
    await U(A, DL, "rooms.lateFee.guardRentBp", 1_000);
    const d = await xl("L16", 0);
    return [a?.ok === true && failOk(b, "LATE_FEE_OVER_CAP") && c?.ok === true && d?.ok === true, J([codeOf(a), codeOf(b), codeOf(c), codeOf(d)])];
  });
  await T("M-3", "L4 บิล ธ.ค. ค่าปรับอัตโนมัติ 100,000 = เพดาน ⇒ บรรทัดมือเพิ่ม 100 ⇒ LATE_FEE_OVER_CAP (Σ รวมอัตโนมัติ) · บิลไม่เปลี่ยน", ["setBillExtraLines"], async () => {
    const b0 = await billOf(DL, LS.L4, P3);
    const r = await xl("L4", 100);
    const b1 = await billOf(DL, LS.L4, P3);
    return [failOk(r, "LATE_FEE_OVER_CAP") && b1?.totalSatang === b0?.totalSatang && b1?.updatedAt?.getTime() === b0?.updatedAt?.getTime(), J({ r: codeOf(r), t: [b0?.totalSatang, b1?.totalSatang] })];
  });
  await T("M-4", "ใบเพิ่มหนี้ LATE_FEE บนบิล พ.ย. L4 (ค่าปรับอัตโนมัติในบิล 85,000 · เพดาน 100,000) 20,000 ⇒ LATE_FEE_OVER_CAP · ไม่มีใบเพิ่มหนี้เกิด (F14 รวมอัตโนมัติ)", ["adjustSentBill"], async () => {
    const r = await fn("adjustSentBill")!(cO, { unitId: DL, billId: S2.L4.id, kind: "DEBIT", reason: "ค่าปรับเพิ่มตามที่ตกลงกับผู้เช่าแล้ว", idempotencyKey: "m4", lines: [{ code: "LATE_FEE", labelTh: "ค่าปรับชำระล่าช้า", amountSatang: 20_000 }] });
    const n = await prisma.accountDocument.count({ where: { tenantId: A, docType: "DEBIT_NOTE" } });
    return [failOk(r, "LATE_FEE_OVER_CAP") && n === 0, J({ r: codeOf(r), n })];
  });

  // ═══════════════ N-2..N-4 เงิน/GL ═══════════════
  await T("N-2", "ใบลดหนี้ของการยกเว้นครบและเท่านั้น: L11 20,000 · L13 20,000 · L3 10,000 · ไม่มีของ L12/L15 (DRAFT) · L9 (ก่อนลงบิล) · L14 (ปฏิเสธ) · L1 (จ่ายแล้ว)", [], async () => {
    const cns = await prisma.accountDocument.findMany({ where: { tenantId: A, docType: "CREDIT_NOTE" } });
    const by = (k: string) => cns.filter((d: any) => d.sourceDocId === S2[k]?.accountDocumentId).map((d: any) => d.grandTotal);
    return [cns.length === 3 && J(by("L11")) === J([20_000]) && J(by("L13")) === J([20_000]) && J(by("L3")) === J([10_000]), J(cns.map((d: any) => [d.grandTotal, d.refId]))];
  });
  await T("N-3", "GL สมุดหอ: ทุกรายการสมุดรายวันสมดุล · ลูกหนี้ 1100 สุทธิ = Σ ใบแจ้งหนี้ − Σ ใบลดหนี้ − Σ รับชำระที่ตัดลูกหนี้ (ตรงทุกสตางค์)", [], async () => {
    const ar = await prisma.accountLedger.findFirst({ where: { systemId: BOOK_L, code: "1100" } });
    const lines = await prisma.accountJournalLine.findMany({ where: { systemId: BOOK_L }, select: { entryId: true, accountId: true, debit: true, credit: true } });
    const arNet = lines.filter((l: any) => l.accountId === ar?.id).reduce((s: number, l: any) => s + l.debit - l.credit, 0);
    const byE = new Map<string, number>();
    for (const l of lines) byE.set(l.entryId, (byE.get(l.entryId) ?? 0) + l.debit - l.credit);
    const unbal = [...byE.values()].filter((v) => v !== 0).length;
    const docs = await prisma.accountDocument.findMany({ where: { tenantId: A, systemId: BOOK_L, docType: { in: ["INVOICE", "CREDIT_NOTE", "DEBIT_NOTE"] }, status: { notIn: ["DRAFT", "VOIDED", "CANCELLED"] } }, select: { docType: true, grandTotal: true } });
    const payRows = await prisma.accountDocumentPayment.findMany({ where: { tenantId: A, systemId: BOOK_L, voidedAt: null }, select: { amount: true } });
    const want = docs.reduce((s: number, d: any) => s + (d.docType === "CREDIT_NOTE" ? -d.grandTotal : d.grandTotal), 0) - payRows.reduce((s: number, p: any) => s + p.amount, 0);
    return [!unbal && byE.size > 0 && arNet === want, J({ arNet, want, unbal, entries: byE.size })];
  });

  // ═══════════════ ร้าน C: เตือน/ทวง ═══════════════
  console.log("\n── D เตือน · ทวง (ร้าน C · รอบ ธ.ค. ครบ 5 ธ.ค.) ──");
  const BOOK_C = await mkBook(C, `บัญชีหอ D11 C ${stamp}`);
  const DDx = await dormUnit(C, "dd", BOOK_C, ["C1", "C2", "C3", "C4", "C5"].map((no) => ({ no })));
  const DEx = await dormUnit(C, "de", BOOK_C, [{ no: "E1" }]);
  const DD = DDx.u, DE = DEx.u;
  const NOW_C = "2026-11-25T03:00:00.000Z";
  const CB: Record<string, any> = {};
  for (const [u, rooms] of [[DD, ["C1", "C2", "C3", "C4", "C5"]], [DE, ["E1"]]] as const) {
    const r = await prep(cC, u, P3, NOW_C);
    const s = r?.ok ? await sendAll(cC, u, r.runId, NOW_C) : null;
    if (!(r?.ok && s?.ok && s.done)) throw new Error(`ฉากร้าน C รอบ ธ.ค. ${u}: ${codeOf(r)} ${codeOf(s)}`);
    for (const no of rooms) CB[no] = await billOf(u, (u === DD ? DDx : DEx).L[no].leaseId, P3);
  }
  const payC = async (b: any, amount: number, ymd: string) => {
    const r = await ACC.recordExternalPayment({ tenantId: C, unitId: b.unitId, docId: b.accountDocumentId, amountSatang: amount, idempotencyKey: `qc-d11-c-${stamp}-${++payN}`, paidAt: PAY(ymd) });
    if (!r?.ok) throw new Error(`fixture รับชำระ C ${b?.id}: ${codeOf(r)}`);
  };
  // PC-5 · PC-6
  {
    const call = () => NC.notifyCustomer({ tenantId: C }, { unitId: DD, domain: "rooms", messageKey: "dunning", partyId: DDx.L.C1.partyId, vars: { roomNo: "C1" }, dedupeKey: `qc-d11-pc5-${stamp}` });
    const rs = await inProc([call, call, call]);
    const n = await prisma.serviceMessageLog.count({ where: { tenantId: C, dedupeKey: `qc-d11-pc5-${stamp}` } });
    await prisma.serviceMessageLog.deleteMany({ where: { tenantId: C, dedupeKey: `qc-d11-pc5-${stamp}` } });
    chk("PC-5", "notifyCustomer (R0.7) คีย์เดียว 3 ทางพร้อมกัน ⇒ ServiceMessageLog 1 แถว · ไม่มี LINE ⇒ NO_CHANNEL (ฐานของข้อ D)", n === 1 && rs.every((r: any) => r && !r.threw), J({ n, rs: rs.map((r: any) => [r?.status, r?.duplicate]) }), "CRITICAL");
  }
  {
    const actor = { userId: OWNC.id, role: "OWNER", unitAccess: ["*"], permissions: {} };
    const r = await SET.setSettings(actor, { tenantId: C }, [{ key: "rooms.msg.dunning", scope: "UNIT", scopeId: DD, value: { th: "ค้างชำระ {amount} จะตัดไฟทันที", en: "x" } }], {});
    const n = await prisma.settingValue.count({ where: { tenantId: C, key: "rooms.msg.dunning" } });
    chk("PC-6", "เครื่องยนต์ค่าตั้ง (R0.3 TEMPLATE_NO_THREAT): แม่แบบทวงมีคำ \"ตัดไฟ\" ⇒ บันทึกไม่ได้", r?.ok === false && n === 0, J({ r: r?.ok ?? r, code: r?.code, n }), "CRITICAL");
  }
  // แม่แบบที่หลุดเข้าฐาน (เขียนตรง ไม่ผ่านเครื่องยนต์) ของหน่วย DE — ระบบต้องไม่ส่ง
  await U(C, DE, "rooms.msg.dunning", { th: "ห้อง {roomNo} ค้าง {amount} ถ้าไม่จ่ายจะตัดไฟและล็อกห้อง", en: "x" });
  await U(C, DE, "rooms.msg.terminationNotice", { th: "บอกเลิกสัญญาห้อง {roomNo} และจะตัดน้ำตัดไฟ", en: "x" });
  const sml = async (prefix: string) => prisma.serviceMessageLog.findMany({ where: { tenantId: C, dedupeKey: { startsWith: prefix } } });
  const rk = (no: string, d: number) => `rooms:reminder:${CB[no].id}:${d}`;
  const dk = (no: string, d: number | string) => `rooms:dunning:${CB[no].id}:${d}`;
  const jobC = (iso: string) => fn("runDormDunningJobs")!(new Date(iso), { tenantId: C });
  const FINAL = ["SENT", "NO_CHANNEL", "SKIPPED_CONSENT", "QUOTA"];
  let smlA0 = 0;
  await T("D-1", "งาน 2 ธ.ค. 10:00 (ก่อนครบ 3 วัน · ตาราง [2, 0]) ⇒ ไม่มีข้อความ", ["runDormDunningJobs"], async () => {
    smlA0 = await prisma.serviceMessageLog.count({ where: { tenantId: A } });
    const r = await jobC("2026-12-02T03:00:00.000Z");
    return [!!r && (await sml("rooms:")).length === 0, J({ r, rows: (await sml("rooms:")).length })];
  });
  await T("D-2", "X5 งาน 3 ธ.ค. 10:00 ซ้อน 4 ทาง (2 ในโพรเซส + 2 โพรเซส) ⇒ เตือน \"2 วัน\" 6 แถวพอดี (C1–C5 + E1 · คีย์ rooms:reminder:<billId>:2) · สถานะจบ · Σ reminders ของทุกทาง = 6 · ไม่มี throw", ["runDormDunningJobs"], async () => {
    const at = "2026-12-03T03:00:00.000Z";
    const [kids, a] = await Promise.all([fanout("__dunning", null, [{ now: at, tenantId: C }, { now: at, tenantId: C }], null, 2, SYNC_MS), inProcAt(SYNC_MS, [() => jobC(at), () => jobC(at)])]);
    const rows = await sml("rooms:reminder:");
    const want = ["C1", "C2", "C3", "C4", "C5", "E1"].map((no) => rk(no, 2)).sort();
    const tot = [...a, ...kids].reduce((s, r) => s + Number(r?.reminders ?? 0), 0);
    return [!badOf([...a, ...kids]).length && J(rows.map((r: any) => r.dedupeKey).sort()) === J(want) && rows.every((r: any) => FINAL.includes(r.status) && r.domain === "rooms" && r.messageKey === "reminder") && tot === 6,
      J({ rows: rows.map((r: any) => [r.dedupeKey.slice(-12), r.status]), tot, bad: badOf([...a, ...kids]).slice(0, 2) })];
  });
  await payC(CB.C2, BASE, "2026-12-04");
  await T("D-3", "5 ธ.ค. 00:30 (เวลาเงียบ 21:00–08:00) ⇒ เตือน \"วันครบ\" 5 แถว SKIPPED_QUIET (C1 C3 C4 C5 E1 · C2 จ่ายแล้วไม่มี) · 08:05 ⇒ แถวเดิมสถานะจบ ไม่มีแถวใหม่", ["runDormDunningJobs"], async () => {
    await jobC("2026-12-04T17:30:00.000Z");
    const q = await sml("rooms:reminder:");
    const zero = q.filter((r: any) => r.dedupeKey.endsWith(":0"));
    await jobC("2026-12-05T01:05:00.000Z");
    const z2 = (await sml("rooms:reminder:")).filter((r: any) => r.dedupeKey.endsWith(":0"));
    const want = ["C1", "C3", "C4", "C5", "E1"].map((no) => rk(no, 0)).sort();
    return [J(zero.map((r: any) => r.dedupeKey).sort()) === J(want) && zero.every((r: any) => r.status === "SKIPPED_QUIET") && J(z2.map((r: any) => r.dedupeKey).sort()) === J(want) && z2.every((r: any) => FINAL.includes(r.status)),
      J({ q: zero.map((r: any) => r.status), after: z2.map((r: any) => r.status), n: z2.length })];
  });
  await T("D-4", "นัดจ่าย: C3 นัด 12 ธ.ค. (now 6 ธ.ค.) ⇒ ok · วันอดีต/เกิน 30 วัน/รูปผิด ⇒ INVALID_INPUT · บิลจ่ายครบ (C2) ⇒ NOT_OVERDUE · audit dorm.bill.promise", ["setPaymentPromise"], async () => {
    const now = { now: new Date("2026-12-06T03:00:00.000Z") };
    const sp = (no: string, d: string | null) => fn("setPaymentPromise")!(cC, { unitId: no === "E1" ? DE : DD, billId: CB[no].id, promiseDate: d }, now);
    const a = await sp("C3", "2026-12-12"), b = await sp("C3", "2026-12-01"), c = await sp("C3", "2027-01-10"), d = await sp("C3", "12/12/2026"), e = await sp("C2", "2026-12-10");
    const au = await prisma.auditLog.findMany({ where: { tenantId: C, action: "dorm.bill.promise" } });
    return [a?.ok === true && a.promiseDate === "2026-12-12" && failOk(b, "INVALID_INPUT") && failOk(c, "INVALID_INPUT") && failOk(d, "INVALID_INPUT") && failOk(e, "NOT_OVERDUE") && au.length === 1,
      J({ a, b: codeOf(b), c: codeOf(c), d: codeOf(d), e: codeOf(e), au: au.length })];
  });
  await prisma.dormLease.update({ where: { id: DDx.L.C5.leaseId }, data: { status: "ENDED", endedAt: new Date("2026-12-06T03:00:00.000Z") } });
  await T("D-5", "6 ธ.ค. (เลย 1 วัน) ⇒ ยังไม่มีข้อความทวง (ขั้นแรก +3) · event dorm.bill.overdue 5 รายการ (C1 C3 C4 C5 E1)", ["runDormDunningJobs"], async () => {
    await jobC("2026-12-06T03:00:00.000Z");
    const ev = await prisma.outboxEvent.findMany({ where: { tenantId: C, type: EV } });
    return [(await sml("rooms:dunning:")).length === 0 && ev.length === 5, J({ dun: (await sml("rooms:dunning:")).length, ev: ev.length })];
  });
  let modelD8: any = null;
  await T("D-6", "X5 8 ธ.ค. (เลย 3 วัน) ซ้อน 3 ทาง ⇒ ทวง \"+3\" เฉพาะ C1 · C4 (C3 นัดจ่าย · C5 สัญญาจบ) · E1 แม่แบบมีคำต้องห้าม ⇒ ไม่มีแถว + audit dorm.dunning.template_blocked 1 · หน่วยอื่นไม่สะดุด", ["runDormDunningJobs", "overdueModel"], async () => {
    const at = "2026-12-08T03:00:00.000Z";
    const [kids, a] = await Promise.all([fanout("__dunning", null, [{ now: at, tenantId: C }, { now: at, tenantId: C }], null, 2, SYNC_MS), inProcAt(SYNC_MS, [() => jobC(at)])]);
    const rows = await sml("rooms:dunning:");
    const tb = await prisma.auditLog.findMany({ where: { tenantId: C, action: "dorm.dunning.template_blocked" } });
    modelD8 = await fn("overdueModel")!(cC, { unitId: DD }, { now: new Date(at) });
    return [!badOf([...a, ...kids]).length && J(rows.map((r: any) => r.dedupeKey).sort()) === J([dk("C1", 3), dk("C4", 3)].sort()) && tb.length === 1 && tb[0].unitId === DE,
      J({ rows: rows.map((r: any) => r.dedupeKey.slice(-10)), tb: tb.map((x: any) => x.unitId === DE), bad: badOf([...a, ...kids]).slice(0, 2) })];
  });
  await T("D-7", "8 ธ.ค. 15:00 งานรอบหลังวันเดียวกัน ⇒ ไม่มีแถวใหม่ · audit แม่แบบผิดยังเป็น 1 (วันละครั้งต่อหน่วย)", ["runDormDunningJobs"], async () => {
    const n0 = (await sml("rooms:")).length;
    await jobC("2026-12-08T08:00:00.000Z");
    return [(await sml("rooms:")).length === n0 && (await prisma.auditLog.count({ where: { tenantId: C, action: "dorm.dunning.template_blocked" } })) === 1, `${n0} → ${(await sml("rooms:")).length}`];
  }, "MAJOR");
  await T("D-8", "ไม่รัวส่งย้อนหลัง: 20 ธ.ค. (เลย 15 วัน) ⇒ ขั้น \"+14\" เท่านั้นของ C1 · C3 (นัดเลยแล้ว) · C4 · ไม่มี \"+7\" ของใคร · รวมแถวทวง 5", ["runDormDunningJobs"], async () => {
    await jobC("2026-12-20T03:00:00.000Z");
    const rows = (await sml("rooms:dunning:")).map((r: any) => r.dedupeKey).sort();
    const want = [dk("C1", 3), dk("C4", 3), dk("C1", 14), dk("C3", 14), dk("C4", 14)].sort();
    return [J(rows) === J(want), J(rows.map((x: string) => x.slice(-12)))];
  });
  await T("D-9", "ทวงมือ (now 20 ธ.ค.): C4 ⇒ ok duplicate false (คีย์ rooms:dunning:<billId>:m20261220) · กดซ้ำวันเดียวกัน ⇒ duplicate true · C2 จ่ายแล้ว ⇒ NOT_OVERDUE · E1 แม่แบบผิด ⇒ TEMPLATE_BLOCKED · C5 สัญญาจบ ⇒ ทวงมือได้", ["sendDunningNow"], async () => {
    const now = { now: new Date("2026-12-20T03:00:00.000Z") };
    const s = (no: string) => fn("sendDunningNow")!(cC, { unitId: no === "E1" ? DE : DD, billId: CB[no].id }, now);
    const a = await s("C4"), b = await s("C4"), c = await s("C2"), d = await s("E1"), e = await s("C5");
    const m = await sml(dk("C4", "m20261220"));
    return [a?.ok === true && a.duplicate === false && b?.ok === true && b.duplicate === true && failOk(c, "NOT_OVERDUE") && failOk(d, "TEMPLATE_BLOCKED") && e?.ok === true && m.length === 1,
      J({ a: [codeOf(a), a?.duplicate, a?.status], b: [codeOf(b), b?.duplicate], c: codeOf(c), d: codeOf(d), e: codeOf(e), m: m.length })];
  });
  await T("D-10", "overdueModel (8 ธ.ค.): 4 แถว C1 C3 C4 C5 · เลย 3 วัน · ค้างแถวละ 480,000 · KPI count 4 · outstanding 1,920,000 · promised 1 (C3 นัด 2026-12-12) · C1 ทวงแล้ว 1 ครั้ง", ["overdueModel"], async () => {
    const m = modelD8;
    const rows = (m?.rows ?? []).map((r: any) => r.roomNumber);
    const c3 = (m?.rows ?? []).find((r: any) => r.roomNumber === "C3"), c1 = (m?.rows ?? []).find((r: any) => r.roomNumber === "C1");
    return [J(rows) === J(["C1", "C3", "C4", "C5"]) && (m?.rows ?? []).every((r: any) => r.daysLate === 3 && r.outstandingSatang === BASE && r.hasDoc === true) && m?.kpi?.count === 4 && m?.kpi?.outstandingSatang === 4 * BASE
      && m?.kpi?.promised === 1 && c3?.promiseDate === "2026-12-12" && c1?.dunning?.count === 1, J({ rows, kpi: m?.kpi, c3: c3?.promiseDate, c1: c1?.dunning })];
  });
  await T("D-11", "overdueModel (20 ธ.ค.): เลย 15 วัน · ทวง C1 2 · C3 1 · C4 3 (รวมทวงมือ) · C5 1 · ค่าปรับที่ถึงกำหนด C1 50,000 (12 วัน × 5,000 = 60,000 ติดเพดาน) ยังไม่ลงบิล (charged 0) · นัด C3 เลยแล้ว ⇒ promiseDate null", ["overdueModel"], async () => {
    const m = await fn("overdueModel")!(cC, { unitId: DD }, { now: new Date("2026-12-20T03:00:00.000Z") });
    const r = (no: string) => (m?.rows ?? []).find((x: any) => x.roomNumber === no);
    return [r("C1")?.daysLate === 15 && r("C1")?.dunning?.count === 2 && r("C3")?.dunning?.count === 1 && r("C4")?.dunning?.count === 3 && r("C5")?.dunning?.count === 1
      && r("C1")?.lateFee?.dueSatang === 50_000 && r("C1")?.lateFee?.chargedSatang === 0 && r("C3")?.promiseDate === null && m?.kpi?.promised === 0,
      J({ C1: r("C1"), C3: [r("C3")?.dunning, r("C3")?.promiseDate], C4: r("C4")?.dunning, C5: r("C5")?.dunning })];
  });
  await T("D-12", "จำกัดร้าน: งานที่รันด้วย tenantId C ไม่สร้างข้อความ/event ให้ร้าน A", [], async () => {
    const n = await prisma.serviceMessageLog.count({ where: { tenantId: A } });
    return [n === smlA0, `A: ${smlA0} → ${n}`];
  });
  await T("D-13", "ข้อความเตือน/ทวงทุกแถวมี partyId ของผู้เช่าบิลนั้น · ไม่มีเบอร์ใน dedupeKey", [], async () => {
    const rows = await sml("rooms:");
    const party = new Map(Object.values(CB).map((b: any) => [b.id, b.partyId]));
    const bad = rows.filter((r: any) => { const id = r.dedupeKey.split(":")[2]; return r.partyId && party.get(id) && r.partyId !== party.get(id); }).length + rows.filter((r: any) => PHONE_RE.test(r.dedupeKey)).length;
    return [rows.length > 0 && bad === 0, J({ n: rows.length, bad })];
  }, "MAJOR");

  // ═══════════════ O. event ═══════════════
  console.log("\n── O event dorm.bill.overdue ──");
  await T("O-1", "หลังงานหลายรอบ: event 1 ต่อบิลพอดี (C1 C3 C4 C5 E1 · ไม่มี C2) · idempotencyKey dorm.bill.overdue:<billId> · unitId ของแถว = หน่วย", [], async () => {
    const ev = await prisma.outboxEvent.findMany({ where: { tenantId: C, type: EV } });
    const keys = ev.map((e: any) => e.idempotencyKey).sort();
    const want = ["C1", "C3", "C4", "C5", "E1"].map((no) => `dorm.bill.overdue:${CB[no].id}`).sort();
    return [J(keys) === J(want) && ev.every((e: any) => e.unitId === (e.idempotencyKey.endsWith(CB.E1.id) ? DE : DD)), J({ keys: keys.length })];
  });
  await T("O-2", "payload ตรง 7 คีย์ { unitId billId leaseId periodKey dueDate outstandingSatang daysLate } · ไม่มีชื่อ/เบอร์ · ค่า: งวด 2026-12 · ครบ 2026-12-05 · ค้าง 480,000 · daysLate จำนวนเต็ม ≥ 1", [], async () => {
    const ev = await prisma.outboxEvent.findMany({ where: { tenantId: C, type: EV } });
    const K = ["billId", "daysLate", "dueDate", "leaseId", "outstandingSatang", "periodKey", "unitId"];
    const bad = ev.filter((e: any) => { const p = e.payload ?? {}; return J(Object.keys(p).sort()) !== J(K) || p.periodKey !== P3 || p.dueDate !== "2026-12-05" || p.outstandingSatang !== BASE || !Number.isInteger(p.daysLate) || p.daysLate < 1 || /ผู้เช่า/.test(J(p)) || PHONE_RE.test(J(p)); });
    return [ev.length === 5 && !bad.length, J(bad.slice(0, 2).map((e: any) => e.payload))];
  });

  // ═══════════════ T. หนังสือบอกเลิก ═══════════════
  console.log("\n── T หนังสือบอกเลิกสัญญาจากแม่แบบ ──");
  await T("T-1", "terminationNotice C1 (now 20 ธ.ค.): ok · noticeDate 2026-12-20 · effectiveDate 2027-01-19 (+30 วันจากค่าตั้ง) · ค้าง 480,000 (บิล ธ.ค.) · ข้อความมีเลขห้อง · ไม่มีคำต้องห้าม · audit dorm.lease.termination_notice", ["terminationNotice"], async () => {
    const r = await fn("terminationNotice")!(cC, { unitId: DD, leaseId: DDx.L.C1.leaseId }, { now: new Date("2026-12-20T03:00:00.000Z") });
    const au = await prisma.auditLog.count({ where: { tenantId: C, action: "dorm.lease.termination_notice" } });
    return [r?.ok === true && r.noticeDate === "2026-12-20" && r.effectiveDate === "2027-01-19" && r.totalOutstandingSatang === BASE && J((r.overdue ?? []).map((x: any) => x.billId)) === J([CB.C1.id])
      && /C1/.test(r.textTh ?? "") && THAI.test(r.textTh ?? "") && legal.findForbiddenTerms(r.textTh ?? "").length === 0 && !LEGAL_BAD.test(r.textTh ?? "") && au >= 1, J({ r: { ...r, textTh: String(r?.textTh ?? "").slice(0, 80) }, au })];
  });
  await T("T-2", "ค่าตั้ง terminationNoticeDays 45 ⇒ effectiveDate 2027-02-03 · ตั้ง 10 ผ่านเครื่องยนต์ ⇒ ไม่ได้ (ต่ำสุด 15) · C2 ไม่ค้าง ⇒ NOT_OVERDUE", ["terminationNotice"], async () => {
    await U(C, DD, "rooms.lease.terminationNoticeDays", 45);
    const now = { now: new Date("2026-12-20T03:00:00.000Z") };
    const a = await fn("terminationNotice")!(cC, { unitId: DD, leaseId: DDx.L.C1.leaseId }, now);
    const actor = { userId: OWNC.id, role: "OWNER", unitAccess: ["*"], permissions: {} };
    const s = await SET.setSettings(actor, { tenantId: C }, [{ key: "rooms.lease.terminationNoticeDays", scope: "UNIT", scopeId: DD, value: 10 }], {});
    await unsetVal(C, "rooms.lease.terminationNoticeDays", DD);
    const b = await fn("terminationNotice")!(cC, { unitId: DD, leaseId: DDx.L.C2.leaseId }, now);
    return [a?.ok === true && a.effectiveDate === "2027-02-03" && s?.ok === false && failOk(b, "NOT_OVERDUE"), J({ a: [codeOf(a), a?.effectiveDate], s: s?.ok, b: codeOf(b) })];
  });
  await T("T-3", "แม่แบบหนังสือบอกเลิกที่หลุดเข้าฐานมีคำต้องห้าม (DE) ⇒ LEGAL_BLOCK · ไม่มีข้อความออก", ["terminationNotice"], async () => {
    const r = await fn("terminationNotice")!(cC, { unitId: DE, leaseId: DEx.L.E1.leaseId }, { now: new Date("2026-12-20T03:00:00.000Z") });
    return [failOk(r, "LEGAL_BLOCK") && !("textTh" in (r ?? {})), J({ r: codeOf(r) })];
  });

  // ═══════════════ J. งานรอบบิลซ้อน + ค่าปรับ (X5) ═══════════════
  console.log("\n── J งานรอบบิลตามเวลาซ้อน (ค่าปรับลงครั้งเดียว · X5) ──");
  //   ฉาก J (ร้าน B · หน่วย DJ): รอบ ต.ค. ส่งแล้ว · J1 J3 ค้าง · J2 จ่ายตรงเวลา ⇒ งาน 25 ต.ค. เตรียมรอบ พ.ย. (น้ำไฟ ต.ค. — ด่านน้ำไฟจำกัดงวด ≤ เดือนหน้าตามนาฬิกาจริง)
  const BOOK_J = await mkBook(B, `บัญชีหอ D11 J ${stamp}`);
  const DJx = await dormUnit(B, "dj", BOOK_J, ["J1", "J2", "J3"].map((no) => ({ no })));
  const JB: Record<string, any> = {};
  {
    const r = await prep(cB, DJx.u, P1, NOW1);
    const s = r?.ok ? await sendAll(cB, DJx.u, r.runId, NOW1) : null;
    if (!(r?.ok && s?.ok && s.done)) throw new Error(`ฉาก J รอบ ต.ค.: ${codeOf(r)} ${codeOf(s)}`);
    for (const no of ["J1", "J2", "J3"]) JB[no] = await billOf(DJx.u, DJx.L[no].leaseId, P1);
    const pr = await ACC.recordExternalPayment({ tenantId: B, unitId: DJx.u, docId: JB.J2.accountDocumentId, amountSatang: BASE, idempotencyKey: `qc-d11-j-${stamp}`, paidAt: PAY("2026-10-05") });
    if (!pr?.ok) throw new Error(`ฉาก J รับชำระ: ${codeOf(pr)}`);
  }
  const jobAtJ = "2026-10-25T03:00:00.000Z";
  await T("J-1", "X5 25 ต.ค. งาน dorm.billing ซ้อน 3 ทาง (1 ในโพรเซส + 2 โพรเซส · ร้าน B) ⇒ รอบ พ.ย. ของ DJ 1 รอบ · 3 บิล · J1 J3 ค่าปรับ 50,000 (ช้า 20 วัน − ผ่อนผัน 3 ติดเพดาน) รายการอัตโนมัติ 1 รายการ (บิล ต.ค.) · J2 ไม่มี · เจ้าของส่ง ⇒ ใบแจ้งหนี้ พ.ย. 3 ใบ ยอด = บิล", ["runDormBillingJobs", "sendBillRun"], async () => {
    const bj = fn("runDormBillingJobs")!;
    const [kids, a] = await Promise.all([fanout("__billing", null, [{ now: jobAtJ, tenantId: B }, { now: jobAtJ, tenantId: B }], null, 2, SYNC_MS), inProcAt(SYNC_MS, [() => bj(new Date(jobAtJ), { tenantId: B })])]);
    const runs = await prisma.dormBillRun.findMany({ where: { unitId: DJx.u, periodKey: P2 } });
    const s = runs[0] ? await sendAll(cB, DJx.u, runs[0].id, jobAtJ) : null;
    const bs = await prisma.dormBill.findMany({ where: { unitId: DJx.u, periodKey: P2 } });
    const lk = Object.fromEntries(Object.entries(DJx.L).map(([no, v]) => [v.leaseId, no]));
    const bad: string[] = [];
    for (const b of bs) {
      const no = lk[b.leaseId];
      const au = autoOf(b) ?? [];
      const want = no === "J2" ? 0 : 50_000;
      if (lateOf(b) !== want || (want && (au.length !== 1 || au[0]?.sourceBillId !== JB[no].id))) bad.push(`${no}:${lateOf(b)}/${au.length}`);
      const d = b.accountDocumentId ? await prisma.accountDocument.findFirst({ where: { id: b.accountDocumentId } }) : null;
      if (!d || d.grandTotal !== b.totalSatang) bad.push(`${no}:ใบ ${d?.grandTotal}≠${b.totalSatang}`);
    }
    const inv = await prisma.accountDocument.count({ where: { tenantId: B, refSystemId: DJx.u, docType: "INVOICE", refId: { endsWith: `:${P2}` } } });
    return [!badOf([...a, ...kids]).length && runs.length === 1 && s?.ok === true && s.done === true && bs.length === 3 && !bad.length && inv === 3,
      J({ runs: runs.length, s: codeOf(s), sReason: s?.reason, n: bs.length, bad, inv, jobs: [...a, ...kids].map(codeOf) })];
  });
  await T("J-2", "งานรอบบิลซ้ำวันเดียวกัน ⇒ ไม่มีรอบ/ใบแจ้งหนี้ใหม่ · ค่าปรับไม่ซ้ำ (≤ 1 รายการต่อบิลต้นทาง)", ["runDormBillingJobs"], async () => {
    await fn("runDormBillingJobs")!(new Date("2026-10-25T06:00:00.000Z"), { tenantId: B });
    const inv = await prisma.accountDocument.count({ where: { tenantId: B, refSystemId: DJx.u, docType: "INVOICE", refId: { endsWith: `:${P2}` } } });
    const runs = await prisma.dormBillRun.count({ where: { unitId: DJx.u, periodKey: P2 } });
    const bs = await prisma.dormBill.findMany({ where: { unitId: DJx.u, periodKey: P2 } });
    return [inv === 3 && runs === 1 && bs.every((b: any) => { const au = autoOf(b) ?? []; return new Set(au.map((x: any) => x.sourceBillId)).size === au.length; }), J({ inv, runs })];
  });

  // ═══════════════ U. จอค้างชำระ ═══════════════
  console.log("\n── U จอ \"ค้างชำระ · ทวง · ค่าปรับ\" ──");
  const synth = (base: any) => {
    const m = JSON.parse(J(base));
    const r = m.rows?.[0];
    if (r) { r.dunning = { count: 3, delivered: 3, lastAt: "2026-12-08T03:00:00.000Z" }; r.lateFee = { dueSatang: 20_000, chargedSatang: 0, waiver: "APPLIED" }; }
    const r2 = m.rows?.[1];
    if (r2) r2.lateFee = { dueSatang: 20_000, chargedSatang: 0, waiver: "PENDING" };
    m.can = { dun: true, waive: true, requestWaive: false, promise: true, notice: true };
    return m;
  };
  await T("U-1", "OverdueScreen (โมเดล 8 ธ.ค.): data-overdue + data-as-of · หัว \"ค้างชำระ\" · KPI count \"4\" · outstanding \"฿19,200.00\" · แถว data-overdue-row C1 C3 C4 C5 (data-days-late 3 · data-period 2026-12)", ["overdueModel"], async () => {
    if (!ScreenC) return [false, screenWhy];
    const h = modelD8 ? renderScreen(modelD8) : "";
    const w = box1(h, "data-overdue");
    const rows = boxes(h, "data-overdue-row");
    const k = (v: string) => textOf(box1(h, "data-overdue-kpi", v)?.html ?? "");
    return [!!w && !!w.attrs["data-as-of"] && /ค้างชำระ/.test(textOf(h)) && /(^|\D)4(\D|$)/.test(k("count")) && k("outstanding").includes("฿19,200.00")
      && J(rows.map((r) => r.attrs["data-overdue-row"])) === J(["C1", "C3", "C4", "C5"]) && rows.every((r) => r.attrs["data-days-late"] === "3" && r.attrs["data-period"] === P3),
      J({ asOf: w?.attrs["data-as-of"], count: k("count"), out: k("outstanding"), rows: rows.map((r) => [r.attrs["data-overdue-row"], r.attrs["data-days-late"]]) })];
  }, "MAJOR", true);
  await T("U-2", "เซลล์: data-col=dunning \"ส่งเตือนแล้ว 3 ครั้ง\" (delivered) · lateFee \"ยกเว้นแล้ว\" (APPLIED) / \"รออนุมัติ\" (PENDING) · outstanding เงินรูป 4,800.00", ["overdueModel"], async () => {
    if (!ScreenC || !modelD8) return [false, screenWhy || "ไม่มีโมเดล"];
    const h = renderScreen(synth(modelD8));
    const rows = boxes(h, "data-overdue-row");
    const c = (r: any, col: string) => textOf(box1(r?.html ?? "", "data-col", col)?.html ?? "");
    return [/ส่งเตือนแล้ว\s*3\s*ครั้ง/.test(c(rows[0], "dunning")) && /ยกเว้นแล้ว/.test(c(rows[0], "lateFee")) && /รออนุมัติ/.test(c(rows[1], "lateFee")) && /4,800\.00/.test(c(rows[0], "outstanding")),
      J([c(rows[0], "dunning"), c(rows[0], "lateFee"), c(rows[1], "lateFee"), c(rows[0], "outstanding")])];
  }, "MAJOR", true);
  await T("U-3", "ปุ่มตามสิทธิ์: can ครบ ⇒ data-dunning-send / data-latefee-waive / data-promise (= billId) · data-notice <a href=\".../dorm/overdue/<leaseId>/notice\"> · can ปิดหมด ⇒ ไม่มีปุ่มเลย · requestWaive ⇒ data-latefee-request แทน", ["overdueModel"], async () => {
    if (!ScreenC || !modelD8) return [false, screenWhy || "ไม่มีโมเดล"];
    const m = synth(modelD8);
    const r0 = m.rows[0];
    const h1 = renderScreen(m);
    const h0 = renderScreen({ ...m, can: { dun: false, waive: false, requestWaive: false, promise: false, notice: false } });
    const h2 = renderScreen({ ...m, can: { dun: false, waive: false, requestWaive: true, promise: false, notice: false } });
    const nt = box1(h1, "data-notice", r0.leaseId);
    const ok1 = !!box1(h1, "data-dunning-send", r0.billId) && !!box1(h1, "data-latefee-waive", r0.billId) && !!box1(h1, "data-promise", r0.billId) && /^<a\b/.test(nt?.html ?? "") && new RegExp(`/dorm/overdue/${r0.leaseId}/notice`).test(nt?.html ?? "");
    const ok0 = ["data-dunning-send", "data-latefee-waive", "data-latefee-request", "data-promise", "data-notice"].every((a) => !boxes(h0, a).length);
    const ok2 = !!box1(h2, "data-latefee-request", r0.billId) && !boxes(h2, "data-latefee-waive").length;
    return [ok1 && ok0 && ok2, J({ ok1, ok0, ok2 })];
  }, "MAJOR", true);
  await T("U-4", "จอไม่มีคำต้องห้าม สคบ. (ตัดน้ำไฟ/ล็อกห้อง/ยึดของ) · ไม่มีเบอร์โทรผู้เช่า · ไม่มี \"฿\" ติดลบ", ["overdueModel"], async () => {
    if (!ScreenC || !modelD8) return [false, screenWhy || "ไม่มีโมเดล"];
    const t = textOf(renderScreen(synth(modelD8)));
    return [!LEGAL_BAD.test(t) && !PHONE_RE.test(t) && !/฿\s*-/.test(t), t.slice(0, 160)];
  }, "MAJOR", true);
  await T("U-5", "ไม่มีงานค้าง ⇒ จอแสดงว่างได้ (rows [] · KPI 0) ไม่ throw", ["overdueModel"], async () => {
    if (!ScreenC || !modelD8) return [false, screenWhy || "ไม่มีโมเดล"];
    const h = renderScreen({ ...modelD8, rows: [], kpi: { count: 0, outstandingSatang: 0, lateFeeDueSatang: 0, promised: 0 } });
    return [!!box1(h, "data-overdue") && !boxes(h, "data-overdue-row").length, textOf(h).slice(0, 100)];
  }, "MINOR", true);

  // ═══════════════ X. ข้ามร้าน · สิทธิ์สด ═══════════════
  console.log("\n── X ข้ามร้าน/ข้ามหน่วย · สิทธิ์ (Membership สด) ──");
  await T("X-1", "ร้าน B กระทำบนบิล/สัญญาของร้าน A/C ⇒ NOT_FOUND ทุกตัว (ยกเว้น · นัดจ่าย · ทวงมือ · หนังสือบอกเลิก) · ไม่มี audit/เอกสาร/ข้อความใหม่", ["waiveLateFee", "setPaymentPromise", "sendDunningNow", "terminationNotice"], async () => {
    const n0 = [await prisma.auditLog.count({ where: { tenantId: { in: [A, B, C] } } }), await prisma.accountDocument.count({ where: { tenantId: { in: [A, B] } } }), await prisma.serviceMessageLog.count({ where: { tenantId: { in: [A, B, C] } } })];
    const now = { now: new Date("2026-12-20T03:00:00.000Z") };
    const a = await fn("waiveLateFee")!(cB, { unitId: DL, sourceBillId: S1.L14.id, reason: RSN }, now);
    const b = await fn("setPaymentPromise")!(cB, { unitId: DD, billId: CB.C1.id, promiseDate: "2026-12-25" }, now);
    const c = await fn("sendDunningNow")!(cB, { unitId: DD, billId: CB.C1.id }, now);
    const d = await fn("terminationNotice")!(cB, { unitId: DD, leaseId: DDx.L.C1.leaseId }, now);
    const n1 = [await prisma.auditLog.count({ where: { tenantId: { in: [A, B, C] } } }), await prisma.accountDocument.count({ where: { tenantId: { in: [A, B] } } }), await prisma.serviceMessageLog.count({ where: { tenantId: { in: [A, B, C] } } })];
    return [[a, b, c, d].every((x) => failOk(x, "NOT_FOUND")) && J(n0) === J(n1), J({ codes: [a, b, c, d].map(codeOf), n0, n1 })];
  });
  await T("X-2", "ร้าน B อ่าน: lateFeeLedger ⇒ null · overdueModel ⇒ null", ["lateFeeLedger", "overdueModel"], async () => {
    const a = await fn("lateFeeLedger")!(cB, { unitId: DL, leaseId: LS.L4 });
    const b = await fn("overdueModel")!(cB, { unitId: DD });
    return [a === null && b === null, J([!!a, !!b])];
  });
  await T("X-3", "เจ้าของ A ใช้บิลของหน่วย DL กับ unitId ของหน่วยอื่น (DX) ⇒ NOT_FOUND · ledger ⇒ null · หน่วยโรงแรม ⇒ overdueModel null", ["waiveLateFee", "lateFeeLedger", "overdueModel"], async () => {
    const a = await fn("waiveLateFee")!(cO, { unitId: DX, sourceBillId: S1.L14.id, reason: RSN });
    const b = await fn("lateFeeLedger")!(cO, { unitId: DX, leaseId: LS.L4 });
    const c = await fn("overdueModel")!(cO, { unitId: HB });
    return [failOk(a, "NOT_FOUND") && b === null && c === null, J([codeOf(a), !!b, !!c])];
  });
  await T("X-4", "ไม่เห็นเงิน: คนจดมิเตอร์ / ดูอย่างเดียว (dorm.view ไม่มีคีย์เงิน) ⇒ overdueModel null · ledger null · ยกเว้น/ทวงมือ ⇒ NOT_FOUND", ["overdueModel", "lateFeeLedger", "waiveLateFee", "sendDunningNow"], async () => {
    const out: any[] = [];
    for (const u of [MTR, VIEW]) {
      const cx = { tenantId: A, actorUserId: u.id };
      out.push(await fn("overdueModel")!(cx, { unitId: DL }), await fn("lateFeeLedger")!(cx, { unitId: DL, leaseId: LS.L4 }),
        await fn("waiveLateFee")!(cx, { unitId: DL, sourceBillId: S1.L14.id, reason: RSN }), await fn("sendDunningNow")!(cx, { unitId: DL, billId: S2.L4.id }, { now: new Date(NOW3) }));
    }
    return [out[0] === null && out[1] === null && failOk(out[2], "NOT_FOUND") && failOk(out[3], "NOT_FOUND") && out[4] === null && out[5] === null && failOk(out[6], "NOT_FOUND") && failOk(out[7], "NOT_FOUND"),
      J(out.map((x) => (x === null ? null : codeOf(x))))];
  });
  await T("X-5", "Membership ยังไม่ตอบรับ (acceptedAt null) ⇒ NOT_FOUND / null", ["overdueModel", "waiveLateFee"], async () => {
    const cx = { tenantId: A, actorUserId: PEND.id };
    const a = await fn("overdueModel")!(cx, { unitId: DL });
    const b = await fn("waiveLateFee")!(cx, { unitId: DL, sourceBillId: S1.L14.id, reason: RSN });
    return [a === null && failOk(b, "NOT_FOUND"), J([!!a, codeOf(b)])];
  });
  await T("X-6", "สิทธิ์สด: ถอนคีย์ของผู้ดูแลกลางทาง (permissions {}) ⇒ ยื่นขอยกเว้น/นัดจ่ายทันที NOT_FOUND (ไม่แคชสิทธิ์)", ["waiveLateFee", "setPaymentPromise"], async () => {
    await prisma.membership.update({ where: { id: CARE.membershipId }, data: { permissions: {} } });
    const a = await fn("waiveLateFee")!(cCare, { unitId: DL, sourceBillId: S1.L14.id, reason: RSN }, { now: new Date(NOW3) });
    const b = await fn("setPaymentPromise")!(cCare, { unitId: DL, billId: S2.L4.id, promiseDate: "2026-11-30" }, { now: new Date(NOW3) });
    return [failOk(a, "NOT_FOUND") && failOk(b, "NOT_FOUND"), J([codeOf(a), codeOf(b)])];
  });
  await T("X-7", "overdueModel ร้าน A (เจ้าของ · now 26 พ.ย.): เห็นเฉพาะบิลของหน่วย DL · ไม่มีบิลร้านอื่น · ทุกแถว daysLate ≥ 1 ค้าง > 0", ["overdueModel"], async () => {
    const m = await fn("overdueModel")!(cO, { unitId: DL }, { now: new Date(NOW3) });
    const ids = new Set((await prisma.dormBill.findMany({ where: { unitId: DL }, select: { id: true } })).map((b: any) => b.id));
    const rows = m?.rows ?? [];
    return [rows.length > 0 && rows.every((r: any) => ids.has(r.billId) && r.daysLate >= 1 && r.outstandingSatang > 0), J({ n: rows.length, rooms: rows.map((r: any) => `${r.roomNumber}/${r.periodKey}`).slice(0, 8) })];
  }, "MAJOR");

  // ═══════════════ Q. ฉาก svcqc ═══════════════
  console.log("\n── Q ฉากค้างชำระ (svcqc · ค้าง ต.ค. 106 · 305) ──");
  {
    const svcT = SV?.SQC_TENANT?.id as string | undefined, svcDorm = SV?.SQC_UNITS?.dorm?.id as string | undefined;
    const sc = SV?.SQC_DORM_OVERDUE_SCENE;
    const prevUnpaid = SV?.SQC_DORM_HOME_SCENE?.prevUnpaid as Record<string, number> | undefined;
    const todayBkk = bkkYmd(new Date());
    const ready = svcT && svcDorm && sc && prevUnpaid ? await (async () => {
      const rooms = await prisma.hotelRoom.findMany({ where: { tenantId: svcT, unitId: svcDorm, number: { in: Object.keys(prevUnpaid) } }, select: { id: true } });
      const n = await prisma.dormBill.count({ where: { tenantId: svcT, unitId: svcDorm, roomId: { in: rooms.map((r: any) => r.id) }, status: "SENT", dueDate: { lt: dbDate(todayBkk) } } });
      return { rooms: rooms.length, overdueBills: n };
    })() : null;
    const runTsx = (file: string, args: string[] = []) => {
      const r = spawnSync("pnpm", ["exec", "tsx", file, ...args], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
      const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
      const m = /SCENE_SUMMARY (\{.*\})/.exec(out);
      let sum: any = null;
      try { sum = m ? JSON.parse(m[1]) : null; } catch { /* อ่านไม่ได้ */ }
      return { status: r.status, out, sum };
    };
    if (!ready || ready.rooms !== 2 || ready.overdueBills < 2) {
      for (const [id, n] of [["Q-1", "ฉากรันได้"], ["Q-2", "โมเดลฉาก"], ["Q-3", "รันซ้ำไม่เขียน"]]) skip(id, n, `ร้าน svcqc ยังไม่พร้อม ${J(ready)} — seed-svc-qc + ฉาก roomboard → lease → dorm-home (D.13) ก่อน`, "MAJOR");
    } else {
      await T("Q-1", "ฉากค้างชำระรันได้ (exit 0) · พิมพ์ SCENE_SUMMARY {created,updated,removed}", [], async () => {
        if (!existsSync(join(ROOT, F.scene))) return [false, `ยังไม่มี ${F.scene}`];
        const r = runTsx(F.scene);
        return [r.status === 0 && !!r.sum && ["created", "updated", "removed"].every((k) => typeof r.sum[k] === "number"), `exit=${r.status} ${r.sum ? J(r.sum) : r.out.split("\n").slice(-4).join(" | ").slice(0, 240)}`];
      }, "MAJOR");
      await T("Q-2", "overdueModel svcqc (เจ้าของ): มีแถว 106 · 305 ค้าง 521,400 · 498,640 · ทวงส่งแล้ว 3 ครั้งทั้งคู่", ["overdueModel"], async () => {
        const ou = (SV.SQC_USERS ?? []).find((u: any) => u.key === "owner");
        const m = await fn("overdueModel")!({ tenantId: svcT, actorUserId: ou?.userId }, { unitId: svcDorm });
        const r = (no: string) => (m?.rows ?? []).find((x: any) => x.roomNumber === no);
        return [r("106")?.outstandingSatang === prevUnpaid!["106"] && r("305")?.outstandingSatang === prevUnpaid!["305"] && r("106")?.dunning?.delivered === sc.delivered && r("305")?.dunning?.delivered === sc.delivered,
          J({ r106: r("106"), r305: r("305")?.dunning })];
      }, "MAJOR");
      await T("Q-3", "รันฉากซ้ำ ⇒ SCENE_SUMMARY 0/0/0", [], async () => {
        if (!existsSync(join(ROOT, F.scene))) return [false, `ยังไม่มี ${F.scene}`];
        const r = runTsx(F.scene);
        return [r.status === 0 && r.sum?.created === 0 && r.sum?.updated === 0 && r.sum?.removed === 0, `exit=${r.status} ${J(r.sum)}`];
      }, "MAJOR");
    }
  }

  // ═══════════════ V. ภาพ ═══════════════
  console.log("\n── V ภาพ จอค้างชำระ (อ้างอิงภาพ หอ 06 การ์ดค้าง + ตาราง) ──");
  {
    const specs = SV?.SQC_VISUAL_SPECS?.["d.11"];
    const base = process.env.QC_BASE ?? "";
    const name = "ภาพ dorm-overdue 1440 + 390 ด้วยผู้ใช้ owner · HTTP < 400 · ไม่ล้นแนวนอน";
    if (!Array.isArray(specs) || !specs.length) fail("V-1", name, `ไม่มี SQC_VISUAL_SPECS d.11 ${J(specs)}`, "MAJOR");
    else if (!base) skip("V-1", name, "ไม่มี QC_BASE — ผู้คุม build QC ผ่าน iso + reseed + ฉาก (roomboard→lease→dorm-home→overdue) แล้วรันซ้ำด้วย QC_BASE=http://127.0.0.1:<port>", "MAJOR");
    else {
      const r = spawnSync("pnpm", ["exec", "tsx", "scripts/visual-svc.mts", "d.11", "--user", "owner", "--base", base], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
      const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
      if (r.status === 0) pass("V-1", `${name} (ภาพ .qc-shots/svc/d.11 — ผู้คุมเทียบ PARITY กับ ledger/design-dorm/06-slip-payments.png การ์ด "ค้างจาก ต.ค." + ตาราง)`);
      else fail("V-1", name, `exit=${r.status} ${out.split("\n").filter((l) => l.includes("❌")).slice(0, 3).join(" | ").slice(0, 300)}`, "MAJOR");
    }
  }
  pendingAtOldG = await pendingOutbox(tenantIds);
  console.log(`\n  (G order) outbox PENDING ก่อนล้าง: ทั้งฐาน ${pendingAtOldG.all} · ของร้านทดสอบนี้ ${pendingAtOldG.mine}`);
} catch (e) {
  fail("CRASH", "จบกลางทาง", errMsg(e), "CRITICAL");
} finally {
  try { await cleanup(tenantIds); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); }
  try { await prisma.user.deleteMany({ where: { email: { startsWith: "svc-d11-" } } }); } catch (e) { console.log(`  ⚠️ cleanup users: ${errMsg(e)}`); }
  try {
    const left = await leftovers(tenantIds);
    if (!left.length) pass("Z-1", `ล้างครบ: ทุกตารางที่มี tenantId ของร้านทดสอบ ${tenantIds.length} ร้าน + ผู้ใช้ svc-d11-* = 0 แถว (ฉาก svcqc คงไว้ให้ถ่ายภาพ — ล้างด้วย scripts/svc-qc-overdue-scene.mts --clear)`);
    else fail("Z-1", "ล้างครบ", J(left), "MAJOR");
  } catch (e) { fail("Z-1", "ล้างครบ", `ตรวจไม่ได้: ${errMsg(e)}`, "MAJOR"); }
  // ═══════════════ G. regression — รันหลังล้างข้อมูล ═══════════════
  try {
    const pend = await pendingOutbox(tenantIds);
    console.log(`\n── G regression (ลูกโพรเซส · env เดียวกัน · หลังล้างข้อมูล · ผ่าน = JSON_SUMMARY ไม่มี failed / exit 0) ──`);
    console.log(`  (G order) outbox PENDING ตอนเริ่ม G: ทั้งฐาน ${pend.all} · ของร้านทดสอบนี้ ${pend.mine} (ก่อนล้าง: ${pendingAtOldG ? `${pendingAtOldG.all}/${pendingAtOldG.mine}` : "ไม่ได้วัด — จบกลางทาง"})`);
    // [id, ชุด, args, ข้อที่ยอมให้แดงพร้อมเหตุผล]
    //   d.8 S-7 = "ไม่ลง dorm.bill.overdue ล่วงหน้า (D.10/D.11)" — ใบนี้ลงตามแผน ⇒ แดงโดยตั้งใจ · ขอ ORACLE-EDIT d.8 S-7 (ตรวจเฉพาะก่อนมี dunning.ts) — ใบสั่ง §12
    const REG: [string, string, string[], string[]][] = [
      ["G-1", "qc-svc-d.8", ["--no-regression"], ["S-7"]], ["G-2", "qc-svc-d.3", ["--no-regression"], []], ["G-3", "qc-svc-d.2", [], []],
      ["G-4", "qc-svc-d.13", ["--no-regression"], []], ["G-5", "qc-svc-smoke", [], []],
    ];
    for (const [id, f, args, allow] of REG) {
      if (NO_REG) { skip(id, `regression ${f}`, "--no-regression / SVC_D11_NO_REGRESSION=1", "CRITICAL"); continue; }
      const r = spawnSync("pnpm", ["exec", "tsx", `scripts/${f}.mts`, ...args], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
      const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
      const js = [...out.matchAll(/JSON_SUMMARY (\{.*\})/g)].map((m) => m[1]).pop();
      let sum: any = null;
      try { sum = js ? JSON.parse(js) : null; } catch { /* อ่านไม่ได้ */ }
      const failedIds: string[] = Array.isArray(sum?.failed) ? sum.failed : [];
      const real = failedIds.filter((x) => !allow.includes(x));
      const ok = !!sum && real.length === 0 && (r.status === 0 || failedIds.length > 0);
      if (ok) pass(id, `regression ${f} ไม่มีข้อแดง (${sum.passed}/${sum.total}${sum.skipped?.length ? ` · SKIP ${sum.skipped.length}` : ""}${failedIds.length ? ` · ยอมตามใบสั่ง: ${failedIds.join(",")}` : ""})`);
      else fail(id, `regression ${f} ไม่มีข้อแดง`, `exit=${r.status} failed=${J(failedIds)} · ${out.split("\n").filter((l) => l.includes("❌")).slice(0, 3).join(" | ").slice(0, 300)}`, "CRITICAL");
    }
  } catch (e) { fail("G-CRASH", "หมวด G จบกลางทาง", errMsg(e), "CRITICAL"); }
  await prisma.$disconnect();
}

const failed = cks.filter((c) => c.res === "FAIL");
const skipped = cks.filter((c) => c.res === "SKIP");
const passed = cks.length - failed.length - skipped.length;
console.log(`\n===== QC SVC D.11 · เตือน · ทวง · ค่าปรับ =====\nผ่าน ${passed}/${cks.length}${skipped.length ? ` (SKIP ${skipped.length})` : ""}`);
console.log(`FINDINGS: CRITICAL ${failed.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${failed.filter((c) => c.sev === "MAJOR").length} · MINOR ${failed.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id) })}`);
// exit 0 เมื่อไม่มีข้อแดง · รับใบ = ผ่านทุกข้อ (SKIP ที่ยอมได้: V-1 ไม่มี QC_BASE · Q-* ร้าน svcqc ยังไม่พร้อม · G-* เมื่อ --no-regression — ผู้คุมรันซ้ำครบก่อนรับ)
process.exit(failed.length > 0 ? 1 : 0);
