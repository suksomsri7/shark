// QC — SVC D.3 · VAT แยกบรรทัด + ใบกำกับภาษี (หอ) · oracle ของผู้เขียนข้อสอบ — builder ห้ามแก้ไฟล์นี้
// สัญญา: ledger/svc-briefs/svc-brief-d.3.md · ledger/SVC-MASTER-PLAN.md แถว D.3 · ledger/DESIGN-DORM-HOTEL.md §3 (VAT/หัก ณ ที่จ่าย/ใบกำกับ) + A4 + ภาคผนวก ก หอ #19–22
//        · ประมวลรัษฎากร ม.78 ม.78/1 ม.81(1)(ต) ม.86/4 ม.86/6 ม.86/9 ม.86/10 · คำสั่ง ป.86/2542 (ยกเลิกแล้วออกฉบับใหม่)
//
// กลุ่มข้อ:
//   S  โครงสร้าง: ไฟล์ · facade dorm 3 ชื่อ · facade บัญชี 4 ชื่อ · ใบพิมพ์ไม่ลาก server · ด่านหน้า · actions · F5.1/any/getDay · ห้าม ABB/ยิงขนาน · คำต้องห้าม · ไม่มี migration
//   PC positive control (เขียวตั้งแต่ก่อนมีงาน): บิลผสมของ D.8 · ตัวยิง 4 โพรเซส · ด่าน ม.86/4 เดิม · checksum เลขผู้เสียภาษี · ด่าน D.7 หอไม่มีมิเตอร์ · pipeline-M2
//   M  VAT แยกบรรทัดถึงเอกสาร: บิลผสม (ห้องยกเว้น + น้ำไฟ/ส่วนกลาง/ที่จอด VAT + ค่าปรับ NONE) · ราคารวม/ไม่รวม VAT · ไม่จด VAT · ยกเว้นล้วน · ปัดเศษตรง computeTotals
//   T  ใบกำกับต่อบิล: 1 ใบ/ใบแจ้งหนี้ · เฉพาะบรรทัด VAT · ผู้ขาย/ผู้ซื้อ (ม.86/4) · วันที่ · ความสัมพันธ์ · ทางกู้ · รหัสผิด · ตัวอ่าน
//   K  เลขที่: ตามชุดที่ตั้งไว้ · ต่อเนื่อง ไม่ข้าม ไม่ซ้ำ · 3 หอ 1 สมุด 4 โพรเซส · 10 ทาง · ล้ม = ไม่กินเลข
//   H  ด่านผู้ขายไม่มีเลขผู้เสียภาษี · ผู้ซื้อเลขผิด (พักบิล/ล้มต่อบิล) · ปล่อยพักแล้วส่ง
//   R  ยกเลิกแล้วออกฉบับใหม่แทน: เลขใหม่ · เลขเดิมคงอยู่ · ยอดเท่าเดิม · หมายเหตุอ้างฉบับเดิม · idempotent/พร้อมกัน · ALREADY_REPLACED · GL ลงวันเดียวกัน · PERIOD_LOCKED · วันออกใหม่ · audit
//   B  บัญชี: 2205→2200 · ภ.พ.30 ฐานไม่รวมค่าห้อง · สมุด ON_PAYMENT ไม่ออกใบกำกับต่อการรับเงิน · ด่าน void · ทางแปลงเดิม · ใบลดหนี้อ้างใบกำกับ
//   W  หัก ณ ที่จ่าย (ปิดค่าเริ่ม · แสดงอย่างเดียว) · ค่าตั้งใหม่ในทะเบียน
//   U  จอ: ตัวอย่างบิล (VAT · เลขใบกำกับ · หัก ณ ที่จ่าย) · ใบกำกับพิมพ์ (ม.86/4 ครบ · ใบแทน · ใบยกเลิก)
//   X  ข้ามร้าน/ข้ามหน่วย/สิทธิ์สด/ชนิดหน่วย · เลขที่แยกต่อสมุด · Z ล้างครบ · G regression (รันหลังล้างข้อมูล — บทเรียน D.5)
//
// ข้อมูลทดสอบใต้ร้านชั่วคราว slug `qc-svc-d3-*` + ผู้ใช้ `svc-d3-*@shark.local` · รอบ 2026-11 · น้ำไฟ 2026-10 · now ฉีดผ่าน deps.now (26 ต.ค. 2569 14:05)
// รัน: bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-d.3.mts      (`--no-regression` ข้ามหมวด G)
/* eslint-disable @typescript-eslint/no-explicit-any */
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn, spawnSync } from "node:child_process";

const SELF = fileURLToPath(import.meta.url);
const ROOT = join(dirname(SELF), "..");
const LABEL = "qc-svc-d.3";
const SVC_HOST = "ep-mute-scene";
const FORBIDDEN_HOSTS = ["ep-royal-night", "ep-plain-art", "ep-cool-shadow", "ep-weathered-river", "ep-frosty-lab", "ep-fragrant-thunder"];
const RUN_CMD = "bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-d.3.mts";

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
const CHILD_AT = process.argv.indexOf("--child");
if (CHILD_AT >= 0) {
  let out: unknown[] = [];
  try {
    const job = JSON.parse(Buffer.from(process.argv[CHILD_AT + 1] ?? "", "base64url").toString("utf8")) as { op: string; ctx: unknown; inputs: any[]; deps: any; at: number };
    let f: ((...a: any[]) => Promise<any>) | null = null;
    if (job.op.startsWith("acc:")) {
      const acc = (await import("@/lib/modules/account" as string)) as any;
      const name = job.op.slice(4);
      f = typeof acc[name] === "function" ? (_ctx: unknown, input: unknown) => acc[name](input) : null;
    } else {
      const dorm = (await import(pathToFileURL(join(ROOT, DORM_IDX)).href)) as Record<string, unknown>;
      f = typeof dorm[job.op] === "function" ? (dorm[job.op] as (...a: any[]) => Promise<any>) : null;
    }
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
const LEGAL_BAD = /ล็อ[กค]ห้อง|ล็อ[กค]ประตู|ตัดน้ำ|ตัดไฟ|ระงับ(การ)?(จ่าย)?(น้ำ|ไฟ)|งด(จ่าย)?(น้ำ|ไฟ)|ยึดทรัพย์|ขนของออก/;
const NO_REG = process.argv.includes("--no-regression") || process.env.SVC_D3_NO_REGRESSION === "1";

// ═══════════════ วันที่ตายตัวของฉาก ═══════════════
const P_RUN = "2026-11";
const P_UTIL = "2026-10";
const NOW_N = "2026-10-26T07:05:00.000Z";      // จ. 26 ต.ค. 2569 14:05 ⇒ วันออกบิล/ใบกำกับ 2026-10-26
const NOW_LATE = "2026-11-20T03:00:00.000Z";   // ออกใบแทนแบบ REISSUE_DAY
const ISSUE = "2026-10-26";
const READ_AT = (p: string) => new Date(`${p}-25T03:00:00.000Z`);
const dbDate = (ymd: string) => new Date(`${ymd}T00:00:00Z`);
const bkkYmd = (d: unknown) => (d instanceof Date ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(d) : typeof d === "string" ? d.slice(0, 10) : "");
const baht = (s: number) => `${Math.trunc(Math.abs(s) / 100).toLocaleString("en-US")}.${String(Math.abs(s) % 100).padStart(2, "0")}`;

// เลขผู้เสียภาษี (checksum mod-11 ตรวจแล้ว)
const SELLER_V = "0105561000003", SELLER_Q = "0105563333336";
const BUYER_CO = "0105562222221", BUYER_PERSON = "3101001234565", BAD_TAX = "1234567890123";

// ═══════════════ โหลดโมดูล ═══════════════
const tryImport = async (spec: string): Promise<any> => { try { return await import(spec); } catch (e) { console.log(`  (โหลด ${spec} ไม่ได้: ${errMsg(e)})`); return null; } };
const { prisma } = (await import("@/lib/core/db" as string)) as { prisma: any };
let dorm: any = null;
let dormWhy = "";
if (!existsSync(join(ROOT, DORM_IDX))) dormWhy = `ยังไม่มี ${DORM_IDX}`;
else { try { dorm = await import(pathToFileURL(join(ROOT, DORM_IDX)).href); } catch (e) { dormWhy = `import facade dorm ล้ม: ${errMsg(e)}`; } }
const fn = (name: string): ((...a: any[]) => any) | null => (dorm && typeof dorm[name] === "function" ? dorm[name] : null);
const ACC: any = await tryImport("@/lib/modules/account");
const af = (name: string): ((...a: any[]) => any) | null => (ACC && typeof ACC[name] === "function" ? ACC[name] : null);
const SYS: any = await tryImport("@/lib/modules/system/service");
const ASV: any = await tryImport("@/lib/modules/account/service");
const GL: any = await tryImport("@/lib/modules/account/gl");
const TOT: any = await tryImport("@/lib/modules/account/totals");
const REP: any = await tryImport("@/lib/modules/account/reports");
const POL: any = await tryImport("@/lib/modules/account/policy");
const NUM: any = await tryImport("@/lib/modules/account/doc-numbering");
const SET: any = await tryImport("@/lib/core/settings");

const SCREEN_FILE = "src/components/dorm/BillingRunScreen.tsx";
const PRINT_FILE = "src/components/dorm/TaxInvoicePrint.tsx";
const loadComp = async (file: string, named: string): Promise<[any, string]> => {
  if (!existsSync(join(ROOT, file))) return [null, `ยังไม่มี ${file}`];
  try {
    const m: any = await import(pathToFileURL(join(ROOT, file)).href);
    const c = typeof m.default === "function" ? m.default : typeof m[named] === "function" ? m[named] : null;
    return c ? [c, ""] : [null, `${file} ไม่มี default export ที่เป็นคอมโพเนนต์`];
  } catch (e) { return [null, `import ${file} ล้ม: ${errMsg(e)}`]; }
};
const [ScreenC, screenWhy] = await loadComp(SCREEN_FILE, "BillingRunScreen");
const [PrintC, printWhy] = await loadComp(PRINT_FILE, "TaxInvoicePrint");
const React = (await import("react" as string)) as any;
const RDS = (await import("react-dom/server" as string)) as any;

/** ตัวรันข้อ — needs = ชื่อใน facade dorm · accNeeds = ชื่อใน facade บัญชี (ขาด = FAIL ไม่ใช่ SKIP) */
async function T(id: string, name: string, needs: string[], body: () => Promise<[boolean, string?]>, sev: Sev = "CRITICAL", accNeeds: string[] = []) {
  const miss = needs.filter((n) => !fn(n));
  const missA = accNeeds.filter((n) => !af(n));
  if (miss.length || missA.length) return fail(id, name, `${miss.length ? (dorm ? `facade dorm ไม่มี ${miss.join(", ")}` : dormWhy) : ""}${missA.length ? ` facade บัญชีไม่มี ${missA.join(", ")}` : ""}`.trim(), sev);
  try {
    const [ok, why] = await body();
    if (ok) pass(id, name); else fail(id, name, why ?? "ไม่ตรง", sev);
  } catch (e) { fail(id, name, `throw: ${errMsg(e)}`, sev); }
}
const codeOf = (r: any) => (r && r.ok === false ? String(r.code) : r?.ok === true ? "OK" : r?.threw ? `THREW(${r.threw})` : J(r).slice(0, 80));
const failOk = (r: any, code: string) => r?.ok === false && r?.code === code && typeof r?.reason === "string" && THAI.test(r.reason) && !/prisma|invalid `|Unique constraint|violates/i.test(r.reason);
const notOk = (r: any) => r?.ok === false && typeof r?.reason === "string" && THAI.test(r.reason) && !/prisma|invalid `|Unique constraint|violates/i.test(r.reason);

// ═══════════════ render ═══════════════
const ACTIONS = new Proxy({}, { get: () => async () => ({ ok: true }) });
const renderScreen = (model: unknown): string => String(RDS.renderToStaticMarkup(React.createElement(ScreenC, { model, unitSlug: "qc-d3", actions: ACTIONS }))).replace(/<!-- -->/g, "");
const renderPrint = (model: unknown): string => String(RDS.renderToStaticMarkup(React.createElement(PrintC, { model }))).replace(/<!-- -->/g, "");
const unesc = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'");
const textOf = (html: string) => unesc(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const digitsOf = (s: string) => s.replace(/\D/g, "");
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
  await soft(() => prisma.accountDocument.updateMany({ where: { tenantId: { in: tids } }, data: { sourceDocId: null, replacedById: null, sourcePaymentId: null, supersededByDocId: null } }));
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
  const un = await prisma.user.count({ where: { email: { startsWith: "svc-d3-" } } });
  if (un) out.push({ table: "User(svc-d3-*)", n: un });
  return out;
}
async function pendingOutbox(tids: string[]): Promise<{ all: number; mine: number }> {
  const all = await prisma.outboxEvent.count({ where: { status: "PENDING" } });
  const mine = tids.length ? await prisma.outboxEvent.count({ where: { status: "PENDING", tenantId: { in: tids } } }) : 0;
  return { all, mine };
}

// ═══════════════ ยิงพร้อมกันจากโพรเซสลูก ═══════════════
async function fanout(op: string, ctx: unknown, inputs: any[], deps: any = null, procs = 4): Promise<any[]> {
  const per = Math.ceil(inputs.length / procs);
  const at = Date.now() + 14_000;
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
const badOf = (rs: any[]) => rs.filter((r) => r?.threw || r?.childFail || (r?.ok === false && r?.code !== "RUN_BUSY") || /P2028|P2024|P2002|40P01|timed out|Unable to start a transaction/i.test(J(r)));

const tenantIds: string[] = [];
let pendingAtOldG: { all: number; mine: number } | null = null;

try {
  const stale = await prisma.tenant.findMany({ where: { slug: { startsWith: "qc-svc-d3-" } }, select: { id: true } });
  if (stale.length) { console.log(`  (กวาด tenant ค้างจากรอบก่อน ${stale.length})`); await cleanup(stale.map((t: { id: string }) => t.id)); }
  await prisma.user.deleteMany({ where: { email: { startsWith: "svc-d3-" } } });

  // ═══════════════ S. โครงสร้าง ═══════════════
  console.log("\n── S โครงสร้าง ──");
  const F = {
    tax: "src/lib/modules/dorm/tax-invoice.ts",
    billing: "src/lib/modules/dorm/billing.ts",
    index: DORM_IDX,
    print: PRINT_FILE,
    page: "src/app/app/u/[unitSlug]/dorm/billing/[billId]/tax-invoice/page.tsx",
    actions: "src/app/app/u/[unitSlug]/dorm/billing/actions.ts",
    accIdx: "src/lib/modules/account/index.ts",
    rooms: "src/lib/core/settings/defs/rooms.ts",
  };
  {
    const miss = [F.tax, F.print, F.page].filter((p) => !existsSync(join(ROOT, p)));
    chk("S-1", "มีไฟล์ใหม่ของใบครบ (dorm/tax-invoice.ts · TaxInvoicePrint.tsx · billing/[billId]/tax-invoice/page.tsx)", !miss.length, `ขาด ${miss.join(", ")}`, "CRITICAL");
  }
  {
    const miss = ["billTaxInvoice", "issueBillTaxInvoice", "reissueBillTaxInvoice"].filter((n) => !fn(n));
    chk("S-2", "facade @/lib/modules/dorm export billTaxInvoice · issueBillTaxInvoice · reissueBillTaxInvoice (§3.2–3.4)", !miss.length, dorm ? `ขาด ${miss.join(", ")}` : dormWhy, "CRITICAL");
  }
  {
    const miss = ["createExternalTaxInvoice", "replaceExternalTaxInvoice", "externalTaxInvoicesOf", "externalTaxSeller"].filter((n) => !af(n));
    chk("S-3", "facade @/lib/modules/account export createExternalTaxInvoice · replaceExternalTaxInvoice · externalTaxInvoicesOf · externalTaxSeller (§3.1)", !miss.length, ACC ? `ขาด ${miss.join(", ")}` : "import บัญชีล้ม", "CRITICAL");
  }
  const importsOf = (src: string) => [...src.matchAll(/^\s*import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/gm)].map((m) => ({ typeOnly: !!m[1], spec: m[2] }))
    .concat([...src.matchAll(/^\s*import\s+["']([^"']+)["']/gm)].map((m) => ({ typeOnly: false, spec: m[1] })))
    .concat([...src.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)].map((m) => ({ typeOnly: false, spec: m[1] })));
  {
    const src = read(F.print);
    const BAD = (s: string) => /^@prisma\//.test(s) || /^@\/lib\/core\/(db|tenant-db|outbox|settings|context|session)/.test(s) || /^@\/lib\/modules\//.test(s) || /^@\/lib\/(platform|automation|webhooks|storage)\//.test(s) || /actions$/.test(s) || /^next\//.test(s);
    const bad = importsOf(src).filter((i) => !i.typeOnly && BAD(i.spec)).map((i) => i.spec);
    const useServer = /^\s*["']use server["']/.test(src);
    const prismaWord = /\bprisma\b|tenantDb\(/.test(stripComments(src));
    chk("S-4", "TaxInvoicePrint.tsx: render ล้วน · ไม่ import prisma/โมดูล server/actions/next/* (ได้เฉพาะ import type) · ไม่ใช่ 'use server'", !!src && !bad.length && !useServer && !prismaWord,
      src ? `import ต้องห้าม=${bad.join(",") || "—"} use server=${useServer} prisma=${prismaWord}` : "ยังไม่มีไฟล์", "CRITICAL");
  }
  {
    const p = read(F.page);
    const ok = !!p && !/^\s*["']use client["']/.test(p) && /requireUnit\s*\(/.test(p) && /["']DORM["']/.test(p) && /notFound\s*\(/.test(p) && /dormAccess\s*\(/.test(p) && /\.board\b/.test(p)
      && /billTaxInvoice\s*\(/.test(p) && /from\s+["']@\/lib\/modules\/dorm["']/.test(p) && !/["']@\/lib\/modules\/dorm\//.test(p) && !/@\/lib\/core\/db|@prisma\//.test(p) && /TaxInvoicePrint/.test(p);
    chk("S-5", "หน้า /dorm/billing/[billId]/tax-invoice: server · requireUnit + DORM · dormAccess(...).board ไม่ผ่าน ⇒ notFound · billTaxInvoice ผ่าน facade · render TaxInvoicePrint · ไม่แตะ prisma", ok, p ? p.slice(0, 160).replace(/\s+/g, " ") : "ยังไม่มีไฟล์", "CRITICAL");
  }
  {
    const code = stripComments(read(F.actions));
    const names = ["issueTaxInvoiceAction", "reissueTaxInvoiceAction"].filter((n) => !new RegExp(`export\\s+async\\s+function\\s+${n}\\b`).test(code));
    const exportsOther = [...code.matchAll(/^\s*export\s+(?!async\s+function)(\S+)/gm)].map((m) => m[1]);
    const trustInput = /input\??\.tenantId|tenantId\s*:\s*input\.|input\??\.actorUserId/.test(code);
    chk("S-6", "actions.ts: issueTaxInvoiceAction · reissueTaxInvoiceAction (export async function · requireUnit + DORM · ร้าน/ผู้กระทำจาก session)",
      !!code && /^\s*["']use server["']/.test(code) && !names.length && !exportsOther.length && /requireUnit\s*\(/.test(code) && /["']DORM["']/.test(code) && !trustInput,
      `ขาด=${names.join(",") || "—"} export อื่น=${exportsOther.join(",") || "—"} รับจาก input=${trustInput}`, "MAJOR");
  }
  const tSrc = stripComments(read(F.tax));
  const bSrc = stripComments(read(F.billing));
  {
    const raw = /import\s*\{[^}]*\bprisma\b[^}]*\}\s*from\s+["']@\/lib\/core\/db["']/.test(read(F.tax));
    const anyUse = [F.tax, F.print, F.page].filter((f) => /:\s*any\b|as\s+any\b|<any>/.test(stripComments(read(f))));
    const getDay = [F.tax, F.print].filter((f) => /\.getDay\(\)|\.getDate\(\)|\.getMonth\(\)/.test(stripComments(read(f))));
    const deep = importsOf(read(F.tax)).filter((i) => !i.typeOnly && /^@\/lib\/modules\/account\//.test(i.spec)).map((i) => i.spec);
    chk("S-7", "tax-invoice.ts ไม่ import prisma ดิบ (F5.1) · ไม่ล้วง account/* (ผ่าน facade) · ไม่มี any · ไม่มี getDay/getDate/getMonth ดิบ", !!tSrc && !raw && !anyUse.length && !getDay.length && !deep.length,
      tSrc ? `prisma=${raw} any=${anyUse.join(",") || "—"} getDay=${getDay.join(",") || "—"} ล้วงลึก=${deep.join(",") || "—"}` : "ยังไม่มีไฟล์", "MAJOR");
  }
  {
    const abb = [F.tax, F.billing, F.print].filter((f) => /TAX_INVOICE_ABB/.test(stripComments(read(f))));
    const par = [tSrc, bSrc].some((s) => /Promise\.(all|allSettled|any|race)\s*\([\s\S]{0,600}?(createExternalTaxInvoice|replaceExternalTaxInvoice|createExternalInvoice)/.test(s) || /\.map\(\s*async[\s\S]{0,400}?(createExternalTaxInvoice|replaceExternalTaxInvoice)/.test(s));
    const uses = /createExternalTaxInvoice\s*\(/.test(bSrc) || /issueBillTaxInvoice|issueTaxFor|taxInvoiceFor/.test(bSrc);
    chk("S-8", "ห้ามใบกำกับอย่างย่อ (TAX_INVOICE_ABB) ในโค้ดหอ · ไม่ยิงทางเอกสารขนาน (Promise.all/map async) · billing.ts ออกใบกำกับในทางส่ง", !abb.length && !par && uses,
      `ABB=${abb.join(",") || "—"} ขนาน=${par} billingเรียก=${uses}`, "CRITICAL");
  }
  {
    const fit = read("scripts/fitness.mts");
    const used = new Set<string>();
    for (const i of importsOf(read(F.tax))) {
      const m = /^@\/lib\/modules\/([^/]+)/.exec(i.spec);
      if (m && m[1] !== "dorm" && !i.typeOnly) used.add(m[1]);
    }
    const missing = [...used].filter((x) => !fit.includes(`"dorm→${x}"`));
    chk("S-9", "เส้นข้ามโมดูลของ tax-invoice.ts มีใน ALLOWED_EDGES", !!tSrc && !missing.length, tSrc ? `ใช้=${[...used].join(",") || "—"} ขาด=${missing.join(",") || "—"}` : "ยังไม่มีไฟล์", "MAJOR");
  }
  {
    const bad = [F.tax, F.print, F.page].filter((f) => LEGAL_BAD.test(read(f)));
    chk("S-10", "ไม่มีคำต้องห้าม สคบ. ในไฟล์ใหม่ของใบ", !bad.length, bad.join(","), "MAJOR");
  }
  {
    const r = spawnSync("git", ["status", "--porcelain", "--", "prisma"], { cwd: ROOT, encoding: "utf8" });
    const dirty = (r.stdout ?? "").trim();
    chk("S-11", "ไม่มี migration/ไม่แตะ prisma/ (ใบนี้ห้าม migration)", r.status === 0 && !dirty, dirty.slice(0, 200), "CRITICAL");
  }

  // ═══════════════ fixtures ═══════════════
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const mkTenant = async (tag: string) => { const t = await prisma.tenant.create({ data: { name: `QC D3 ${tag}`, slug: `qc-svc-d3-${tag}-${stamp}` } }); tenantIds.push(t.id); return t.id as string; };
  const A = await mkTenant("a"), B = await mkTenant("b");
  const mkUnit = async (tenantId: string, type: string, tag: string, name?: string) => (await prisma.businessUnit.create({ data: { tenantId, type, name: name ?? `หอ D3 ${tag}`, slug: `d3${tag}-${stamp}` } })).id as string;
  type BookOpt = { vat?: boolean; taxId?: string | null; onPayment?: boolean; branchCode?: string; address?: string | null };
  const mkBook = async (tenantId: string, name: string, o: BookOpt = {}) => {
    const s = await SYS.createSystem(tenantId, "ACCOUNT", name);
    await ASV.saveSettings(tenantId, s.id, {
      orgName: name, vatRegistered: o.vat === true, taxId: o.taxId ?? null, branchCode: o.branchCode ?? "00000", address: o.address === undefined ? "99 ถนนสุขุมวิท แขวงคลองตัน เขตคลองเตย กรุงเทพฯ 10110" : o.address,
      ...(o.vat ? { vatRateBp: 700 } : {}), ...(o.onPayment ? { taxPointBasis: "ON_PAYMENT" } : {}),
    });
    await GL.ensureAccounting({ tenantId, systemId: s.id });
    await prisma.accountFinance.create({ data: { tenantId, systemId: s.id, type: "BANK", name: "บัญชีรับเงินหอ", promptpayId: "0812345678", useForReceive: true } });
    return s.id as string;
  };
  const link = (tenantId: string, systemId: string, unitId: string) => prisma.accountSystemLink.create({ data: { tenantId, systemId, linkedKind: "BUSINESS", linkedId: unitId, enabled: true } });
  const mkUser = async (key: string, tenantId: string, role: string, unitAccess: string[], perms: string[] = [], accepted = true) => {
    const u = await prisma.user.create({ data: { email: `svc-d3-${stamp}-${key}@shark.local`, name: `QC D3 ${key}` } });
    await prisma.membership.create({ data: { userId: u.id, tenantId, role, unitAccess, permissions: Object.fromEntries(perms.map((p) => [p, true])), acceptedAt: accepted ? new Date() : null } });
    return { id: u.id as string };
  };
  const mkType = async (tenantId: string, unitId: string, rent: number) =>
    (await prisma.hotelRoomType.create({ data: { tenantId, unitId, name: "มาตรฐาน", capacity: 2, baseRateSatang: rent, depositSatang: 0, rentMode: "MONTHLY", areaSqm: 24 } })).id as string;
  const mkBld = async (tenantId: string, unitId: string, name: string) => (await prisma.roomBuilding.create({ data: { tenantId, unitId, name, floors: 3, sortOrder: 1 } })).id as string;
  const mkRoom = async (tenantId: string, unitId: string, typeId: string, bld: string, number: string) =>
    (await prisma.hotelRoom.create({ data: { tenantId, unitId, roomTypeId: typeId, number, buildingId: bld, floorNo: 1, floor: "1" } })).id as string;
  const setVal = async (tenantId: string, key: string, scope: string, scopeId: string, value: unknown) => {
    await prisma.settingValue.deleteMany({ where: { tenantId, key, scope, scopeId } });
    await prisma.settingValue.create({ data: { tenantId, key, scope, scopeId, value, setById: "qc-d3" } });
  };
  const U = (tenantId: string, unitId: string, key: string, value: unknown) => setVal(tenantId, key, "UNIT", unitId, value);
  let seq = 0;
  const RUNNUM = 100000 + Math.floor(Math.random() * 800000);
  const newPhone = () => `08${String((RUNNUM % 1000) * 100000 + ++seq).padStart(8, "0").slice(-8)}`;
  type PartyOpt = { kind?: "PERSON" | "COMPANY"; taxId?: string | null; branchCode?: string | null; address?: string | null };
  const mkLease = async (o: { tenantId: string; unitId: string; roomId: string; roomTypeId: string; name: string; party?: PartyOpt; common?: number; patch?: Record<string, unknown> }) => {
    const party = await prisma.party.create({ data: { tenantId: o.tenantId, name: o.name, phone: newPhone(), kind: o.party?.kind ?? "PERSON", taxId: o.party?.taxId ?? null,
      branchCode: o.party?.branchCode ?? "00000", address: o.party?.address ?? null } });
    const s = await SET.snapshotPolicy({ tenantId: o.tenantId }, "lease", { unitId: o.unitId, roomTypeId: o.roomTypeId, roomId: o.roomId });
    const l = await prisma.dormLease.create({ data: {
      tenantId: o.tenantId, unitId: o.unitId, roomId: o.roomId, partyId: party.id, status: "ACTIVE", startDate: dbDate("2026-01-01"), endDate: dbDate("2027-03-31"),
      rentSatang: 450_000, commonFeeSatang: o.common ?? 0, depositSatang: 0, advanceRentSatang: 0, bookingFeeSatang: 0,
      coTenants: { occupants: [], vehicles: [] }, policySnapshot: { ...s, values: { ...(s?.values ?? {}), ...(o.patch ?? {}) } }, signedAt: new Date(), createdById: "qc-d3",
    } });
    const oc = await prisma.roomOccupancy.create({ data: { tenantId: o.tenantId, unitId: o.unitId, roomId: o.roomId, startDate: dbDate("2026-01-01"), endDate: dbDate("2027-04-01"), kind: "LEASE", refType: "DormLease", refId: l.id } });
    await prisma.dormLease.update({ where: { id: l.id }, data: { occupancyId: oc.id } });
    return { leaseId: l.id as string, partyId: party.id as string };
  };
  const mkMeter = async (tenantId: string, unitId: string, roomId: string, kind: string, startReading: number) =>
    (await prisma.dormMeter.create({ data: { tenantId, unitId, roomId, kind, role: "ROOM", startReading } })).id as string;
  const rd = async (tenantId: string, unitId: string, meterId: string, value: number) =>
    prisma.dormMeterReading.create({ data: { tenantId, unitId, meterId, periodKey: P_UTIL, kind: "PERIOD", value, source: "IMPORT", readAt: READ_AT(P_UTIL) } });

  const OWN = await mkUser("owner", A, "OWNER", ["*"]);
  const OWNB = await mkUser("owner-b", B, "OWNER", ["*"]);
  const cO = { tenantId: A, actorUserId: OWN.id }, cB = { tenantId: B, actorUserId: OWNB.id };
  const AUTH = async (ctx: any, unitId: string, kind: string, billSatang: number, units: number) => {
    const r = await fn("recordAuthorityBill")?.(ctx, { unitId, kind, periodKey: P_UTIL, billSatang, units });
    if (!r?.ok) throw new Error(`recordAuthorityBill ${kind}: ${codeOf(r)}`);
  };
  type RoomSpec = { no: string; name: string; party?: PartyOpt; common?: number; patch?: Record<string, unknown>; elec?: [number, number] | null; water?: [number, number] | null };
  type Dorm = { u: string; book: string | null; R: Record<string, string>; L: Record<string, { leaseId: string; partyId: string }> };
  /** หอ n ห้อง — registered/include = ค่าตั้ง VAT ของหน่วย · water/elec null = ไม่มีมิเตอร์ชนิดนั้น (metering NONE ทั้งหน่วย) */
  const mkDorm = async (tenantId: string, ctx: any, tag: string, book: string | null, rooms: RoomSpec[], o: { registered: boolean; include?: boolean; water?: boolean; elec?: boolean; auth?: { elec?: [number, number]; water?: [number, number] }; name?: string }): Promise<Dorm> => {
    const u = await mkUnit(tenantId, "DORM", tag, o.name);
    if (book) await link(tenantId, book, u);
    await U(tenantId, u, "rooms.vat.registered", o.registered);
    await U(tenantId, u, "rooms.vat.pricesIncludeVat", o.include !== false);
    if (o.water === false) await U(tenantId, u, "rooms.utility.water.metering", "NONE");
    if (o.elec === false) await U(tenantId, u, "rooms.utility.elec.metering", "NONE");
    const ty = await mkType(tenantId, u, 450_000), b = await mkBld(tenantId, u, `อาคาร ${tag}`);
    const R: Record<string, string> = {}, L: Record<string, { leaseId: string; partyId: string }> = {};
    for (const r of rooms) {
      R[r.no] = await mkRoom(tenantId, u, ty, b, r.no);
      L[r.no] = await mkLease({ tenantId, unitId: u, roomId: R[r.no], roomTypeId: ty, name: r.name, party: r.party, common: r.common ?? 0, patch: r.patch });
      if (o.elec !== false && r.elec !== null) { const e = r.elec ?? [0, 100]; await rd(tenantId, u, await mkMeter(tenantId, u, R[r.no], "ELEC", e[0]), e[1]); }
      if (o.water !== false && r.water !== null) { const w = r.water ?? [0, 5]; await rd(tenantId, u, await mkMeter(tenantId, u, R[r.no], "WATER", w[0]), w[1]); }
    }
    if (o.elec !== false) await AUTH(ctx, u, "ELEC", (o.auth?.elec ?? [500_000, 1000])[0], (o.auth?.elec ?? [500_000, 1000])[1]);
    if (o.water !== false) await AUTH(ctx, u, "WATER", (o.auth?.water ?? [384_000, 240])[0], (o.auth?.water ?? [384_000, 240])[1]);
    return { u, book, R, L };
  };

  // ── สมุดบัญชี ──
  const BOOK_V = await mkBook(A, `บริษัท หอวีไอพี จำกัด ${stamp}`, { vat: true, taxId: SELLER_V });
  const BOOK_X = await mkBook(A, `หอ X ${stamp}`, { vat: true, taxId: SELLER_V });
  const BOOK_N = await mkBook(A, `หอไม่จด ${stamp}`, { vat: false });
  const BOOK_E = await mkBook(A, `หอยกเว้น ${stamp}`, { vat: true, taxId: SELLER_V });
  const BOOK_S = await mkBook(A, `หอไม่มีเลขผู้ขาย ${stamp}`, { vat: true, taxId: null });
  const BOOK_H = await mkBook(A, `หอ H ${stamp}`, { vat: true, taxId: SELLER_V });
  const BOOK_OP = await mkBook(A, `หอรับรู้ตอนรับเงิน ${stamp}`, { vat: true, taxId: SELLER_V, onPayment: true });
  const BOOK_Q = await mkBook(A, `หอ Q ${stamp}`, { vat: true, taxId: SELLER_Q });
  const BOOK_PC = await mkBook(A, `หอ PC ${stamp}`, { vat: true, taxId: SELLER_V });
  const BOOK_B = await mkBook(B, `หอร้าน B ${stamp}`, { vat: true, taxId: SELLER_Q });

  // ── DV: หอจด VAT · ราคารวม VAT · 4 ห้อง (บิลผสม) ──
  const PARKING = [{ code: "PARKING", labelTh: "ที่จอดรถ", amountSatang: 50_000, required: true, taxKind: "VAT7" }];
  const CO_ADDR = "1 ถนนพระราม 9 แขวงห้วยขวาง เขตห้วยขวาง กรุงเทพฯ 10310";
  const DV = await mkDorm(A, cO, "v", BOOK_V, [
    { no: "V1", name: "สมชาย ใจดี", common: 30_000, patch: { "rooms.services.catalog": PARKING }, elec: [1287, 1412], water: [312, 318] },
    { no: "V2", name: "บริษัท ผู้เช่าดี จำกัด", party: { kind: "COMPANY", taxId: BUYER_CO, branchCode: "00001", address: CO_ADDR }, common: 30_000, patch: { "rooms.tax.withholdingCorporateBp": 500 }, elec: [0, 50], water: [0, 3] },
    { no: "V3", name: "วิภา รักดี", party: { taxId: BAD_TAX }, common: 30_000, elec: [100, 160], water: [10, 14] },
    { no: "V4", name: "ห้างหุ้นส่วนจำกัด ทดสอบ", party: { kind: "COMPANY" }, common: 30_000, elec: [200, 230], water: [20, 22] },
  ], { registered: true, include: true, auth: { elec: [1_982_400, 4200], water: [384_000, 240] }, name: "หอวีไอพี" });
  const DX = await mkDorm(A, cO, "x", BOOK_X, [{ no: "X1", name: "ผู้เช่า X1", common: 30_000, elec: [0, 100], water: [0, 5] }], { registered: true, include: false, auth: { elec: [500_000, 1000], water: [50_000, 50] } });
  const DN = await mkDorm(A, cO, "n", BOOK_N, [{ no: "N1", name: "ผู้เช่า N1", common: 30_000 }], { registered: false, water: false });
  const DE = await mkDorm(A, cO, "e", BOOK_E, [{ no: "E1", name: "ผู้เช่า E1", common: 0 }], { registered: true, water: false, elec: false });
  const DS = await mkDorm(A, cO, "s", BOOK_S, [{ no: "S1", name: "ผู้เช่า S1", common: 30_000 }], { registered: true, water: false });
  const DH = await mkDorm(A, cO, "h", BOOK_H, [{ no: "H1", name: "ผู้เช่า H1", common: 30_000 }, { no: "H2", name: "ผู้เช่า H2", common: 30_000 }], { registered: true, water: false });
  const DOP = await mkDorm(A, cO, "op", BOOK_OP, [{ no: "O1", name: "ผู้เช่า O1", common: 30_000 }], { registered: true, water: false });
  const DQ: Dorm[] = [];
  for (const q of ["q1", "q2", "q3"]) DQ.push(await mkDorm(A, cO, q, BOOK_Q, [1, 2, 3, 4].map((i) => ({ no: `${q.toUpperCase()}-${i}`, name: `ผู้เช่า ${q} ${i}`, common: 30_000, elec: [0, 40 + i] as [number, number] })), { registered: true, water: false }));
  const DPC = await mkUnit(A, "DORM", "pc"); await link(A, BOOK_PC, DPC);
  const DPS = await mkUnit(A, "DORM", "ps"); await link(A, BOOK_S, DPS);
  const DNL = await mkUnit(A, "DORM", "nl");
  const HB = await mkUnit(A, "HOTEL", "hb");
  const DB = await mkDorm(B, cB, "b", BOOK_B, [{ no: "B1", name: "ผู้เช่าร้าน B", common: 30_000 }], { registered: true, water: false });

  // ── ตัวช่วย ──
  const prep = (ctx: any, unitId: string, now = NOW_N): Promise<any> => fn("prepareBillRun")!(ctx, { unitId, periodKey: P_RUN }, { now: new Date(now) });
  const send = (ctx: any, unitId: string, runId: string, now = NOW_N): Promise<any> => fn("sendBillRun")!(ctx, { unitId, runId }, { now: new Date(now) });
  const sendAll = async (ctx: any, unitId: string, runId: string) => {
    const calls: any[] = [];
    for (let i = 0; i < 30; i++) { const r = await send(ctx, unitId, runId); calls.push(r); if (!r?.ok || r.done) break; }
    return calls;
  };
  const runOf = async (unitId: string) => prisma.dormBillRun.findFirst({ where: { unitId, periodKey: P_RUN } });
  const billOf = async (d: Dorm, no: string) => prisma.dormBill.findFirst({ where: { unitId: d.u, leaseId: d.L[no].leaseId, periodKey: P_RUN } });
  const lineOf = (b: any, code: string) => (Array.isArray(b?.lines) ? b.lines.find((l: any) => l.code === code) : undefined);
  const vatLines = (b: any) => (Array.isArray(b?.lines) ? b.lines.filter((l: any) => l.taxKind === "VAT7") : []);
  const LIVE = { notIn: ["VOIDED", "CANCELLED"] };
  const tisOf = async (invoiceId: string | null | undefined, live = true) => invoiceId
    ? prisma.accountDocument.findMany({ where: { docType: "TAX_INVOICE", sourceDocId: invoiceId, ...(live ? { status: LIVE } : {}) }, orderBy: { createdAt: "asc" } }) : [];
  const docOf = async (id: string | null | undefined) => (id ? prisma.accountDocument.findFirst({ where: { id } }) : null);
  const linesOfDoc = async (id: string) => prisma.accountDocumentLine.findMany({ where: { documentId: id }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
  const seqLast = async (systemId: string) => (await prisma.accountDocSequence.findMany({ where: { systemId, docType: "TAX_INVOICE" } })).reduce((s: number, r: any) => s + Number(r.lastNo), 0);
  const tiDocsOfBook = async (systemId: string) => prisma.accountDocument.findMany({ where: { systemId, docType: "TAX_INVOICE", docNo: { not: null } }, orderBy: { createdAt: "asc" } });
  const tailNo = (docNo: string | null) => { const m = /(\d+)\s*$/.exec(docNo ?? ""); return m ? Number.parseInt(m[1], 10) : -1; };
  const headNo = (docNo: string | null) => (docNo ?? "").replace(/\d+\s*$/, "");
  /** ยอดคาดหวังของใบกำกับ = computeTotals ของบรรทัดใบแจ้งหนี้ที่ vatRateBp > 0 (สูตรบัญชี V2) */
  const expectTi = async (invoice: any) => {
    const ls = (await linesOfDoc(invoice.id)).filter((l: any) => l.vatRateBp > 0);
    const t = TOT.computeTotals({ lines: ls.map((l: any) => ({ description: l.description, qty: Number(l.qty), unitPrice: l.unitPrice, discount: l.discount, vatRateBp: l.vatRateBp })), vatMode: invoice.vatMode, vatRegistered: true, vatRateBp: 700 });
    return { n: ls.length, sub: t.subTotal, vat: t.vatAmount, grand: t.grandTotal, desc: ls.map((l: any) => l.description) };
  };
  const ledgerBal = async (systemId: string, code: string) => {
    const led = await prisma.accountLedger.findFirst({ where: { systemId, code } });
    if (!led) return 0;
    const ls = await prisma.accountJournalLine.findMany({ where: { systemId, accountId: led.id }, select: { debit: true, credit: true } });
    return ls.reduce((s: number, l: any) => s + l.credit - l.debit, 0);
  };
  const pp30Of = async (systemId: string, tenantId: string, period: string) => REP.pp30({ tenantId, systemId }, period);

  // ═══════════════ PC ═══════════════
  console.log("\n── PC positive control ──");
  let runV = "";
  {
    const r = await prep(cO, DV.u);
    runV = r?.runId ?? "";
    const b: any = await billOf(DV, "V1");
    const ls = (b?.lines ?? []) as any[];
    const t = TOT.computeTotals({ lines: ls.map((l: any) => ({ description: l.code, qty: 1, unitPrice: l.amountSatang, vatRateBp: l.taxKind === "VAT7" ? 700 : -1 })), vatMode: "INCLUDE", vatRegistered: true, vatRateBp: 700 });
    const perLine = ls.every((l: any, i: number) => l.vatSatang === t.lines[i].vat && l.netSatang === t.lines[i].net && l.grossSatang === t.lines[i].gross);
    const codes = ls.map((l: any) => `${l.code}:${l.taxKind}`);
    chk("PC-1", "D.8 เตรียมรอบหอจด VAT (DV · ราคารวม VAT): V1 บิลผสม RENT:EXEMPT · COMMON/ELEC/WATER/SERVICE:PARKING:VAT7 · VAT ต่อบรรทัด = computeTotals INCLUDE ทุกสตางค์ · vatSatang > 0",
      r?.ok === true && J(codes) === J(["RENT:EXEMPT", "COMMON:VAT7", "ELEC:VAT7", "WATER:VAT7", "SERVICE:PARKING:VAT7"]) && perLine && b?.vatSatang === t.vatAmount && b?.vatSatang > 0 && b?.totalSatang === t.grandTotal,
      J({ r: codeOf(r), codes, vat: [b?.vatSatang, t.vatAmount], total: [b?.totalSatang, t.grandTotal], perLine }), "CRITICAL");
  }
  {
    const input = { tenantId: A, sourceKind: "DORM", unitId: DPC, refType: "QcD3Pc", refId: "pc2", customer: { name: "ผู้เช่า PC" },
      lines: [{ description: "ค่าห้อง", qty: 1, unitPriceSatang: 450_000, taxKind: "EXEMPT" }, { description: "ค่าไฟฟ้า", qty: 1, unitPriceSatang: 10_700, taxKind: "VAT7" }], vat: { registered: true, pricesIncludeVat: true }, issueDate: ISSUE };
    const rs = await fanout("acc:createExternalInvoice", null, Array.from({ length: 12 }, () => input));
    const n = await prisma.accountDocument.count({ where: { tenantId: A, refType: "QcD3Pc", refId: "pc2" } });
    chk("PC-2", "ตัวยิง 4 โพรเซส × 3 (facade บัญชี): ใบแจ้งหนี้หอ ref เดียว 12 ทาง = 1 ใบ · ทุกผล ok", n === 1 && rs.every((r) => r?.ok === true), J({ n, codes: rs.map(codeOf) }), "CRITICAL");
  }
  {
    const inv = await ACC.createExternalInvoice({ tenantId: A, sourceKind: "DORM", unitId: DPS, refType: "QcD3Pc", refId: "pc3", customer: { name: "ผู้เช่า PC3" },
      lines: [{ description: "ค่าไฟฟ้า", qty: 1, unitPriceSatang: 10_700, taxKind: "VAT7" }], vat: { registered: true, pricesIncludeVat: true }, issueDate: ISSUE });
    const cv = inv?.ok ? await ASV.convertDocument(A, BOOK_S, inv.docId, "TAX_INVOICE") : null;
    const is = cv?.ok ? await ASV.issueDocument(A, BOOK_S, cv.newId) : null;
    if (cv?.ok) await ASV.cancelDraft(A, BOOK_S, cv.newId);
    chk("PC-3", "ด่านเดิมของบัญชี ม.86/4: สมุดจด VAT ไม่มีเลขผู้เสียภาษีผู้ขาย ⇒ issueDocument TAX_INVOICE ไม่ผ่าน (ฐานของ SELLER_TAX_ID_MISSING)",
      inv?.ok === true && cv?.ok === true && is?.ok === false && /86\/4|เลขประจำตัวผู้เสียภาษี/.test(is?.reason ?? ""), J({ inv: codeOf(inv), cv: cv?.ok, is }), "CRITICAL");
  }
  chk("PC-4", "isValidThaiTaxId (บัญชี) กับเลขในฉาก: ผู้ขาย/ผู้ซื้อ 4 เลขผ่าน · 1234567890123 ไม่ผ่าน",
    [SELLER_V, SELLER_Q, BUYER_CO, BUYER_PERSON].every((x) => ASV.isValidThaiTaxId(x)) && !ASV.isValidThaiTaxId(BAD_TAX), "checksum", "CRITICAL");
  {
    const g = await fn("utilityBillingGate")?.(cO, { unitId: DE.u, periodKey: P_UTIL });
    const r = await prep(cO, DE.u);
    const b: any = await billOf(DE, "E1");
    chk("PC-5", "หอไม่มีมิเตอร์ (DE · จด VAT · ส่วนกลาง 0): ด่าน D.7 ผ่าน · บิลมีแต่ RENT EXEMPT · VAT 0", g?.ok === true && r?.ok === true && J((b?.lines ?? []).map((l: any) => `${l.code}:${l.taxKind}`)) === J(["RENT:EXEMPT"]) && b?.vatSatang === 0,
      J({ g: g?.ok, r: codeOf(r), lines: b?.lines }), "CRITICAL");
  }
  {
    const inv = await ACC.createExternalInvoice({ tenantId: A, sourceKind: "DORM", unitId: DPC, refType: "QcD3Pc", refId: "pc6", customer: { name: "ผู้เช่า PC6" },
      lines: [{ description: "ค่าไฟฟ้า", qty: 1, unitPriceSatang: 10_700, taxKind: "VAT7" }], vat: { registered: true, pricesIncludeVat: true }, issueDate: ISSUE });
    const c1 = inv?.ok ? await ASV.convertDocument(A, BOOK_PC, inv.docId, "TAX_INVOICE") : null;
    const i1 = c1?.ok ? await ASV.issueDocument(A, BOOK_PC, c1.newId) : null;
    const c2 = inv?.ok ? await ASV.convertDocument(A, BOOK_PC, inv.docId, "TAX_INVOICE") : null;
    const i2 = c2?.ok ? await ASV.issueDocument(A, BOOK_PC, c2.newId) : null;
    if (c2?.ok) await ASV.cancelDraft(A, BOOK_PC, c2.newId);
    chk("PC-6", "ด่านเดิม pipeline-M2: ใบกำกับจากต้นทางเดิมใบที่ 2 ถูกปฏิเสธ (ทางแปลงเอกสารทั่วไป)", i1?.ok === true && (c2?.ok === false || i2?.ok === false), J({ i1, c2, i2 }), "CRITICAL");
  }

  // ═══════════════ เตรียมรอบที่เหลือ (D.8) ═══════════════
  for (const d of [DX, DN, DS, DH, DOP, ...DQ]) { const r = await prep(cO, d.u); if (!r?.ok) console.log(`  (เตรียมรอบ ${d.u} ล้ม: ${codeOf(r)})`); }
  { const r = await prep(cB, DB.u); if (!r?.ok) console.log(`  (เตรียมรอบ DB ล้ม: ${codeOf(r)})`); }
  const peekV = await NUM.peekDocNo(prisma, { systemId: BOOK_V, docType: "TAX_INVOICE", fallbackPrefix: ASV.docNoFallbackPrefix("TAX_INVOICE"), date: new Date(`${ISSUE}T05:00:00Z`) });
  const FEE = { kind: "LATE_FEE", labelTh: "ค่าปรับชำระล่าช้า", amountSatang: 20_000, note: "ปรับช้า ต.ค. 4 วัน" };
  { const b1: any = await billOf(DV, "V1"); const r = await fn("setBillExtraLines")?.(cO, { unitId: DV.u, billId: b1?.id, lines: [FEE] }); if (!r?.ok) console.log(`  (ค่าปรับ V1 ล้ม: ${codeOf(r)})`); }

  // ═══════════════ H (ก่อนส่ง) ด่านผู้ขาย/ผู้ซื้อ ═══════════════
  console.log("\n── H ด่านผู้ขาย · ผู้ซื้อ ──");
  await T("H-1", "เตรียมรอบหอจด VAT ที่สมุดไม่มีเลขผู้เสียภาษีผู้ขาย (DS) ⇒ gate.ok false · blocks มี SELLER_TAX_ID_MISSING (kind null · ข้อความไทย)", ["prepareBillRun"], async () => {
    const r = await prep(cO, DS.u);
    const it = (r?.gate?.blocks ?? []).find((x: any) => x.code === "SELLER_TAX_ID_MISSING");
    return [r?.ok === true && r.gate?.ok === false && !!it && it.kind === null && THAI.test(it.messageTh ?? ""), J({ r: codeOf(r), gate: r?.gate })];
  });
  await T("H-2", "ส่งรอบ DS ⇒ SELLER_TAX_ID_MISSING · ไม่มีใบแจ้งหนี้/ใบกำกับ/event · บิลยัง DRAFT", ["sendBillRun"], async () => {
    const run: any = await runOf(DS.u);
    const r = await send(cO, DS.u, run?.id);
    const docs = await prisma.accountDocument.count({ where: { systemId: BOOK_S, refType: { in: ["DormBill", "DormBillTax"] } } });
    const ev = await prisma.outboxEvent.count({ where: { type: "dorm.billrun.sent", unitId: DS.u } });
    const b: any = await billOf(DS, "S1");
    return [failOk(r, "SELLER_TAX_ID_MISSING") && docs === 0 && ev === 0 && b?.status === "DRAFT", J({ r: codeOf(r), docs, ev, st: b?.status })];
  });
  await T("H-3", "ผู้ซื้อเลขผู้เสียภาษีไม่ผ่าน checksum (V3) ⇒ บิล HELD · holdReason ขึ้นต้น BUYER_TAX_ID_INVALID · ไม่นับในยอดรอบ", ["prepareBillRun"], async () => {
    const b: any = await billOf(DV, "V3");
    const run: any = await runOf(DV.u);
    const others = await prisma.dormBill.findMany({ where: { runId: run?.id, status: { notIn: ["HELD", "VOID"] } } });
    return [b?.status === "HELD" && /^BUYER_TAX_ID_INVALID/.test(b?.holdReason ?? "") && run?.billCount === others.length && run?.totalSatang === others.reduce((s: number, x: any) => s + x.totalSatang, 0),
      J({ st: b?.status, hr: b?.holdReason, run: [run?.billCount, run?.totalSatang] })];
  });

  // ═══════════════ ส่ง (D.8 + D.3) ═══════════════
  const sendRes: Record<string, any[]> = {};
  for (const [k, d] of [["V", DV], ["X", DX], ["N", DN], ["E", DE], ["OP", DOP]] as const) { const run: any = await runOf(d.u); sendRes[k] = run ? await sendAll(cO, d.u, run.id) : []; }

  // ═══════════════ M. VAT แยกบรรทัดถึงเอกสาร ═══════════════
  console.log("\n── M VAT แยกบรรทัด ──");
  const invOfBill = async (d: Dorm, no: string) => docOf((await billOf(d, no) as any)?.accountDocumentId);
  await T("M-1", "ใบแจ้งหนี้ V1: ค่าห้อง vatRateBp −1 · บรรทัด VAT 700 · vatAmount = bill.vatSatang · vatMode INCLUDE · vatTiming/taxPointBasis ON_ISSUE (§2.4)", ["sendBillRun"], async () => {
    const b: any = await billOf(DV, "V1");
    const inv: any = await docOf(b?.accountDocumentId);
    const ls = inv ? await linesOfDoc(inv.id) : [];
    const rent = ls.find((l: any) => /ค่าห้อง/.test(l.description));
    return [b?.status === "SENT" && !!inv && rent?.vatRateBp === -1 && ls.filter((l: any) => l.vatRateBp === 700).length === vatLines(b).length && inv.vatAmount === b.vatSatang && inv.vatMode === "INCLUDE"
      && inv.vatTiming === "ON_ISSUE" && inv.taxPointBasis === "ON_ISSUE", J({ st: b?.status, inv: inv && [inv.vatAmount, inv.vatMode, inv.vatTiming, inv.taxPointBasis], bill: b?.vatSatang, ls: ls.map((l: any) => l.vatRateBp) })];
  });
  await T("M-2", "ราคาไม่รวม VAT (DX): VAT ต่อบรรทัด = round(ยอด×7%) · ยอดบิล = Σ gross · ใบกำกับ = Σ บรรทัด VAT7 ของบิล (net/vat/gross)", ["sendBillRun"], async () => {
    const b: any = await billOf(DX, "X1");
    const bad = vatLines(b).filter((l: any) => l.vatSatang !== Math.round(l.amountSatang * 0.07) || l.grossSatang !== l.amountSatang + l.vatSatang);
    const [ti]: any[] = await tisOf(b?.accountDocumentId);
    const vl = vatLines(b);
    const sum = (k: string) => vl.reduce((s: number, l: any) => s + l[k], 0);
    return [b?.status === "SENT" && !bad.length && b.totalSatang === (b.lines as any[]).reduce((s, l) => s + l.grossSatang, 0) && !!ti && ti.vatAmount === sum("vatSatang") && ti.subTotal === sum("netSatang") && ti.grandTotal === sum("grossSatang"),
      J({ st: b?.status, bad, ti: ti && [ti.subTotal, ti.vatAmount, ti.grandTotal], exp: [sum("netSatang"), sum("vatSatang"), sum("grossSatang")] })];
  });
  await T("M-3", "หอไม่จด VAT (DN): ทุกบรรทัด NONE · VAT 0 · ใบแจ้งหนี้ vatMode NONE · ไม่มีใบกำกับเลย · ส่งจบ taxInvoicePending 0", ["sendBillRun"], async () => {
    const b: any = await billOf(DN, "N1");
    const inv: any = await docOf(b?.accountDocumentId);
    const tis = await prisma.accountDocument.count({ where: { systemId: BOOK_N, docType: { in: ["TAX_INVOICE", "TAX_INVOICE_ABB"] } } });
    const last = sendRes.N[sendRes.N.length - 1];
    return [b?.status === "SENT" && (b.lines as any[]).every((l) => l.taxKind === "NONE") && b.vatSatang === 0 && inv?.vatMode === "NONE" && tis === 0 && last?.ok === true && last.taxInvoicePending === 0,
      J({ st: b?.status, kinds: (b?.lines ?? []).map((l: any) => l.taxKind), inv: inv?.vatMode, tis, last })];
  });
  await T("M-4", "หอจด VAT แต่บิลยกเว้นล้วน (DE · ค่าห้องอย่างเดียว) ⇒ ส่งได้ · ไม่มีใบกำกับ (ไม่มีส่วน VAT)", ["sendBillRun"], async () => {
    const b: any = await billOf(DE, "E1");
    const tis = await prisma.accountDocument.count({ where: { systemId: BOOK_E, docType: { in: ["TAX_INVOICE", "TAX_INVOICE_ABB"] } } });
    return [b?.status === "SENT" && b.vatSatang === 0 && tis === 0, J({ st: b?.status, vat: b?.vatSatang, tis, last: sendRes.E[sendRes.E.length - 1] })];
  });
  await T("M-5", "ใบกำกับ V1 มีเฉพาะบรรทัด VAT (ส่วนกลาง · ไฟ · น้ำ · ที่จอด = 4 บรรทัด) · ไม่มีค่าห้อง (ยกเว้น) · ไม่มีค่าปรับ (NONE) · คำอธิบายตรงใบแจ้งหนี้", ["sendBillRun"], async () => {
    const inv: any = await invOfBill(DV, "V1");
    const [ti]: any[] = await tisOf(inv?.id);
    const ls = ti ? await linesOfDoc(ti.id) : [];
    const exp = inv ? await expectTi(inv) : null;
    const d = ls.map((l: any) => l.description);
    return [!!ti && ls.length === 4 && J(d) === J(exp?.desc) && !d.some((x: string) => /ค่าห้อง|ค่าปรับ/.test(x)) && ls.every((l: any) => l.vatRateBp === 700), J({ d, exp: exp?.desc })];
  });
  await T("M-6", "ปัดเศษตรงบัญชี V2: ทุกใบกำกับของ DV/DX = computeTotals(บรรทัด VAT ของใบแจ้งหนี้) ทุกสตางค์ · ใบแจ้งหนี้ − ใบกำกับ = Σ gross บรรทัด EXEMPT/NONE", ["sendBillRun"], async () => {
    const bad: string[] = [];
    let n = 0;
    for (const [d, no] of [[DV, "V1"], [DV, "V2"], [DV, "V4"], [DX, "X1"]] as const) {
      const b: any = await billOf(d, no);
      const inv: any = await docOf(b?.accountDocumentId);
      const [ti]: any[] = await tisOf(inv?.id);
      if (!inv || !ti) { bad.push(`${no}:ไม่มีใบ`); continue; }
      n++;
      const e = await expectTi(inv);
      const nonVat = (b.lines as any[]).filter((l) => l.taxKind !== "VAT7").reduce((s, l) => s + l.grossSatang, 0);
      if (ti.subTotal !== e.sub || ti.vatAmount !== e.vat || ti.grandTotal !== e.grand || inv.grandTotal - ti.grandTotal !== nonVat) bad.push(`${no}:${[ti.subTotal, ti.vatAmount, ti.grandTotal]}≠${[e.sub, e.vat, e.grand]}`);
    }
    return [n === 4 && !bad.length, bad.join(" · ")];
  });
  await T("M-7", "VAT ทั้งสาย: bill.vatSatang = ใบแจ้งหนี้.vatAmount = ใบกำกับ.vatAmount ทุกบิลที่มี VAT (V1 V2 V4 X1 O1)", ["sendBillRun"], async () => {
    const bad: string[] = [];
    for (const [d, no] of [[DV, "V1"], [DV, "V2"], [DV, "V4"], [DX, "X1"], [DOP, "O1"]] as const) {
      const b: any = await billOf(d, no);
      const inv: any = await docOf(b?.accountDocumentId);
      const [ti]: any[] = await tisOf(inv?.id);
      if (!(b?.vatSatang > 0 && inv?.vatAmount === b.vatSatang && ti?.vatAmount === b.vatSatang)) bad.push(`${no}:${b?.vatSatang}/${inv?.vatAmount}/${ti?.vatAmount}`);
    }
    return [!bad.length, bad.join(" · ")];
  });

  // ═══════════════ T. ใบกำกับต่อบิล ═══════════════
  console.log("\n── T ใบกำกับภาษีต่อบิล ──");
  await T("T-1", "DV ส่งแล้ว: V1 V2 V4 SENT · มีใบกำกับที่ยังมีผลบิลละ 1 ใบ · TAX_INVOICE (ไม่ใช่ ABB) · ISSUED · source DORM · refSystemId หน่วย · refType DormBillTax · refId = id ใบแจ้งหนี้ · sourceDocId · sourcePaymentId null", ["sendBillRun"], async () => {
    const bad: string[] = [];
    for (const no of ["V1", "V2", "V4"]) {
      const b: any = await billOf(DV, no);
      const tis: any[] = await tisOf(b?.accountDocumentId);
      const t = tis[0];
      if (b?.status !== "SENT" || tis.length !== 1 || t.status !== "ISSUED" || t.source !== "DORM" || t.refSystemId !== DV.u || t.refType !== "DormBillTax" || t.refId !== b.accountDocumentId || t.sourcePaymentId !== null)
        bad.push(`${no}:${J({ st: b?.status, n: tis.length, t: t && [t.status, t.source, t.refType, t.refId === b?.accountDocumentId, t.sourcePaymentId] })}`);
    }
    const abb = await prisma.accountDocument.count({ where: { tenantId: A, docType: "TAX_INVOICE_ABB" } });
    return [!bad.length && abb === 0, `${bad.join(" · ")} abb=${abb}`];
  });
  await T("T-2", "วันที่ใบกำกับ = วันที่ใบแจ้งหนี้ (2026-10-26 ไทย) · vatTiming/taxPointBasis ON_ISSUE · docNo ไม่ว่าง", ["sendBillRun"], async () => {
    const inv: any = await invOfBill(DV, "V1");
    const [ti]: any[] = await tisOf(inv?.id);
    return [!!ti && bkkYmd(ti.issueDate) === ISSUE && bkkYmd(inv.issueDate) === ISSUE && ti.vatTiming === "ON_ISSUE" && ti.taxPointBasis === "ON_ISSUE" && !!ti.docNo,
      J(ti && { d: bkkYmd(ti.issueDate), t: [ti.vatTiming, ti.taxPointBasis], no: ti.docNo })];
  });
  await T("T-3", "ความสัมพันธ์ TAX_FOR จากใบแจ้งหนี้ → ใบกำกับ ยอด = grandTotal ใบกำกับ", ["sendBillRun"], async () => {
    const inv: any = await invOfBill(DV, "V1");
    const [ti]: any[] = await tisOf(inv?.id);
    const rel = ti ? await prisma.accountDocumentRelation.findMany({ where: { fromId: inv.id, toId: ti.id } }) : [];
    return [rel.length === 1 && rel[0].type === "TAX_FOR" && rel[0].amount === ti.grandTotal, J(rel)];
  });
  await T("T-4", "ผู้ซื้อ freeze ใน contactSnapshot (ม.86/4(3)): V1 บุคคล ไม่มีเลขภาษี · ที่อยู่ = ห้อง V1 ของหอ · V2 นิติบุคคล เลข 0105562222221 สาขา 00001 ที่อยู่ของ Party · V4 นิติบุคคลไม่มีเลข ⇒ ออกได้ taxId null", ["sendBillRun"], async () => {
    const s = async (no: string) => ((await tisOf((await billOf(DV, no) as any)?.accountDocumentId))[0] as any)?.contactSnapshot ?? null;
    const a = await s("V1"), b = await s("V2"), c = await s("V4");
    const ok = a?.name === "สมชาย ใจดี" && !a?.taxId && /V1/.test(a?.address ?? "") && /หอวีไอพี/.test(a?.address ?? "") && a?.legalType === "PERSON"
      && b?.name === "บริษัท ผู้เช่าดี จำกัด" && b?.taxId === BUYER_CO && b?.branchCode === "00001" && b?.address === CO_ADDR && b?.legalType === "COMPANY"
      && c?.legalType === "COMPANY" && !c?.taxId && /V4/.test(c?.address ?? "");
    return [ok, J({ a, b, c })];
  });
  await T("T-5", "ผลส่งรอบ DV: เรียกสุดท้าย done · taxInvoicePending 0 · ส่งซ้ำ ⇒ ไม่มีใบกำกับเพิ่ม", ["sendBillRun"], async () => {
    const last = sendRes.V[sendRes.V.length - 1];
    const n0 = await prisma.accountDocument.count({ where: { systemId: BOOK_V, docType: "TAX_INVOICE" } });
    const r = await send(cO, DV.u, runV);
    const n1 = await prisma.accountDocument.count({ where: { systemId: BOOK_V, docType: "TAX_INVOICE" } });
    return [last?.ok === true && last.done === true && last.taxInvoicePending === 0 && r?.ok === true && r.taxInvoicePending === 0 && n0 === 3 && n1 === 3, J({ last, r, n0, n1 })];
  });
  await T("T-6", "issueBillTaxInvoice (ทางกู้) บนบิลที่มีใบแล้ว: ok created false ใบเดิม · 10 ทางพร้อมกัน = ใบเดิมทุกทาง · ยังมี 1 ใบ", ["issueBillTaxInvoice"], async () => {
    const b: any = await billOf(DV, "V1");
    const [ti]: any[] = await tisOf(b?.accountDocumentId);
    const r = await fn("issueBillTaxInvoice")!(cO, { unitId: DV.u, billId: b?.id });
    const rs = await inProc(Array.from({ length: 10 }, () => () => fn("issueBillTaxInvoice")!(cO, { unitId: DV.u, billId: b?.id })));
    const n = (await tisOf(b?.accountDocumentId)).length;
    return [r?.ok === true && r.created === false && r.docId === ti?.id && r.docNo === ti?.docNo && rs.every((x) => x?.ok === true && x.docId === ti?.id) && n === 1, J({ r, codes: rs.map(codeOf), n })];
  });
  await T("T-7", "issueBillTaxInvoice รหัส: หอไม่จด (N1) ⇒ NOT_VAT_REGISTERED · ยกเว้นล้วน (E1) ⇒ NO_VAT_LINES · บิล HELD (V3) ⇒ NOT_SENT", ["issueBillTaxInvoice"], async () => {
    const n1: any = await billOf(DN, "N1"), e1: any = await billOf(DE, "E1"), v3: any = await billOf(DV, "V3");
    const a = await fn("issueBillTaxInvoice")!(cO, { unitId: DN.u, billId: n1?.id });
    const b = await fn("issueBillTaxInvoice")!(cO, { unitId: DE.u, billId: e1?.id });
    const c = await fn("issueBillTaxInvoice")!(cO, { unitId: DV.u, billId: v3?.id });
    return [failOk(a, "NOT_VAT_REGISTERED") && failOk(b, "NO_VAT_LINES") && failOk(c, "NOT_SENT"), J([codeOf(a), codeOf(b), codeOf(c)])];
  }, "MAJOR");
  await T("T-8", "billTaxInvoice V1: form FULL · ผู้ขาย (ชื่อสมุด · 0105561000003 · สำนักงานใหญ่ · ที่อยู่) · ผู้ซื้อ · บรรทัดโค้ด = บรรทัด VAT7 ของบิลตามลำดับ · ยอดตรงเอกสาร · invoiceDocNo · history 1", ["billTaxInvoice"], async () => {
    const b: any = await billOf(DV, "V1");
    const inv: any = await docOf(b?.accountDocumentId);
    const [ti]: any[] = await tisOf(inv?.id);
    const v = await fn("billTaxInvoice")!(cO, { unitId: DV.u, billId: b?.id });
    const codes = vatLines(b).map((l: any) => l.code);
    const ok = v?.form === "FULL" && v.docId === ti?.id && v.docNo === ti?.docNo && v.status === "ISSUED" && v.issueDate === ISSUE && v.billId === b?.id && v.roomNumber === "V1" && v.invoiceDocNo === inv?.docNo
      && /หอวีไอพี/.test(v.seller?.name ?? "") && v.seller?.taxId === SELLER_V && v.seller?.branchLabel === "สำนักงานใหญ่" && /สุขุมวิท/.test(v.seller?.address ?? "")
      && v.buyer?.name === "สมชาย ใจดี" && v.buyer?.taxId === null && /V1/.test(v.buyer?.address ?? "") && v.buyer?.kind === "PERSON"
      && J((v.lines ?? []).map((l: any) => l.code)) === J(codes) && v.subTotalSatang === ti?.subTotal && v.vatSatang === ti?.vatAmount && v.totalSatang === ti?.grandTotal
      && v.pricesIncludeVat === true && v.replaces === null && Array.isArray(v.history) && v.history.length === 1;
    return [ok, J({ v: v && { ...v, lines: (v.lines ?? []).map((l: any) => l.code) }, codes })];
  });
  await T("T-9", "createExternalTaxInvoice รหัส (facade): ต้นทาง id มั่ว ⇒ NOT_FOUND · ใบร่าง ⇒ NOT_PAYABLE · ผู้ซื้อชื่อว่าง ⇒ INVALID_INPUT · สมุดไม่จด VAT (ใบ N1) ⇒ NOT_VAT_REGISTERED · ไม่มีบรรทัด VAT ⇒ NO_VAT_LINES", [], async () => {
    const buyer = { name: "ผู้ซื้อ", address: "ห้อง 1" };
    const draft = await ACC.createExternalInvoice({ tenantId: A, sourceKind: "DORM", unitId: DPC, refType: "QcD3Pc", refId: "t9-draft", customer: { name: "ผู้เช่า" }, draft: true,
      lines: [{ description: "ค่าไฟฟ้า", qty: 1, unitPriceSatang: 10_700, taxKind: "VAT7" }], vat: { registered: true, pricesIncludeVat: true }, issueDate: ISSUE });
    const ex = await ACC.createExternalInvoice({ tenantId: A, sourceKind: "DORM", unitId: DPC, refType: "QcD3Pc", refId: "t9-ex", customer: { name: "ผู้เช่า" },
      lines: [{ description: "ค่าห้อง", qty: 1, unitPriceSatang: 450_000, taxKind: "EXEMPT" }], vat: { registered: true, pricesIncludeVat: true }, issueDate: ISSUE });
    const n1: any = await billOf(DN, "N1");
    const c = (x: any) => af("createExternalTaxInvoice")!({ tenantId: A, buyer, ...x });
    const a = await c({ unitId: DPC, sourceDocId: "nope-" + stamp }), b = await c({ unitId: DPC, sourceDocId: draft?.docId });
    const d = await c({ unitId: DPC, sourceDocId: ex?.docId, buyer: { name: " ", address: "x" } });
    const e = await c({ unitId: DN.u, sourceDocId: n1?.accountDocumentId }), f = await c({ unitId: DPC, sourceDocId: ex?.docId });
    return [failOk(a, "NOT_FOUND") && failOk(b, "NOT_PAYABLE") && failOk(d, "INVALID_INPUT") && failOk(e, "NOT_VAT_REGISTERED") && failOk(f, "NO_VAT_LINES"), J([a, b, d, e, f].map(codeOf))];
  }, "MAJOR", ["createExternalTaxInvoice"]);
  await T("T-10", "externalTaxSeller: DV ok จด VAT · taxIdValid · สำนักงานใหญ่ · DS (ไม่มีเลข) taxIdValid false · หน่วยไม่ผูกสมุด ⇒ NOT_LINKED", [], async () => {
    const a = await af("externalTaxSeller")!({ tenantId: A, unitId: DV.u }), b = await af("externalTaxSeller")!({ tenantId: A, unitId: DPS }), c = await af("externalTaxSeller")!({ tenantId: A, unitId: DNL });
    return [a?.ok === true && a.vatRegistered === true && a.taxIdValid === true && a.taxId === SELLER_V && a.branchLabel === "สำนักงานใหญ่" && b?.ok === true && b.taxIdValid === false && failOk(c, "NOT_LINKED"), J([a, b, codeOf(c)])];
  }, "MAJOR", ["externalTaxSeller"]);
  await T("T-11", "externalTaxInvoicesOf(ใบแจ้งหนี้ V1) = 1 แถวตรงเอกสาร (buyer · lines vatRateBp 700) · หน่วยอื่นอ่านใบนี้ ⇒ []", [], async () => {
    const inv: any = await invOfBill(DV, "V1");
    const [ti]: any[] = await tisOf(inv?.id);
    const rows = await af("externalTaxInvoicesOf")!({ tenantId: A, unitId: DV.u, sourceDocId: inv?.id });
    const other = await af("externalTaxInvoicesOf")!({ tenantId: A, unitId: DX.u, sourceDocId: inv?.id });
    const r = rows?.[0];
    return [Array.isArray(rows) && rows.length === 1 && r.docId === ti?.id && r.vatSatang === ti?.vatAmount && r.buyer?.name === "สมชาย ใจดี" && (r.lines ?? []).length === 4 && r.lines.every((l: any) => l.vatRateBp === 700)
      && Array.isArray(other) && other.length === 0, J({ rows, other })];
  }, "MAJOR", ["externalTaxInvoicesOf"]);

  // ═══════════════ H (หลังส่ง) ═══════════════
  await T("H-4", "แก้เลขผู้เสียภาษี V3 ใน Party แล้วปล่อยพัก ⇒ DRAFT · ส่ง ⇒ SENT + ใบกำกับมีเลขผู้ซื้อ + สาขา 00000", ["releaseHeldBill", "sendBillRun"], async () => {
    const b: any = await billOf(DV, "V3");
    await prisma.party.update({ where: { id: DV.L.V3.partyId }, data: { taxId: BUYER_PERSON } });
    const rl = await fn("releaseHeldBill")!(cO, { unitId: DV.u, billId: b?.id }, { now: new Date(NOW_N) });
    const s = await sendAll(cO, DV.u, runV);
    const b2: any = await billOf(DV, "V3");
    const [ti]: any[] = await tisOf(b2?.accountDocumentId);
    return [rl?.ok === true && b2?.status === "SENT" && ti?.contactSnapshot?.taxId === BUYER_PERSON && ti?.contactSnapshot?.branchCode === "00000", J({ rl: codeOf(rl), last: s[s.length - 1], st: b2?.status, snap: ti?.contactSnapshot })];
  });
  await T("H-5", "เลขผู้ซื้อเสียหลังเตรียมรอบ (DH · H1) ⇒ ส่ง: H1 failed BUYER_TAX_ID_INVALID (หรือ RUN_STALE ถ้าการคำนวณสดเห็นว่าต้องพัก) ไม่มีใบใด · H2 SENT + ใบกำกับ · เลขที่ไม่ถูกกิน (ตัวนับ = จำนวนใบ) · แก้แล้วส่งต่อได้", ["sendBillRun"], async () => {
    await prisma.party.update({ where: { id: DH.L.H1.partyId }, data: { taxId: BAD_TAX } });
    const run: any = await runOf(DH.u);
    const r = await send(cO, DH.u, run?.id);
    const h1: any = await billOf(DH, "H1"), h2: any = await billOf(DH, "H2");
    const f = (r?.failed ?? []).find((x: any) => x.billId === h1?.id);
    const docsH1 = await prisma.accountDocument.count({ where: { systemId: BOOK_H, refId: { startsWith: `${DH.L.H1.leaseId}:` } } });
    const ti2 = await tisOf(h2?.accountDocumentId);
    const seqA = await seqLast(BOOK_H), cntA = (await tiDocsOfBook(BOOK_H)).length;
    await prisma.party.update({ where: { id: DH.L.H1.partyId }, data: { taxId: null } });
    const s2 = await sendAll(cO, DH.u, run?.id);
    const h1b: any = await billOf(DH, "H1");
    const seqB = await seqLast(BOOK_H), cntB = (await tiDocsOfBook(BOOK_H)).length;
    return [r?.ok === true && ["BUYER_TAX_ID_INVALID", "RUN_STALE"].includes(f?.code) && h1?.status !== "SENT" && docsH1 === 0 && h2?.status === "SENT" && ti2.length === 1 && seqA === 1 && cntA === 1
      && h1b?.status === "SENT" && seqB === 2 && cntB === 2, J({ r: { ok: r?.ok, failed: r?.failed, sent: r?.sent }, docsH1, h2: h2?.status, seqA, cntA, h1b: h1b?.status, seqB, cntB, s2: codeOf(s2[s2.length - 1]) })];
  });
  await T("H-6", "ใส่เลขผู้เสียภาษีผู้ขายให้สมุด DS แล้ว ⇒ เตรียมรอบ gate ผ่าน · ส่ง SENT + ใบกำกับ 1 ใบ", ["prepareBillRun", "sendBillRun"], async () => {
    await ASV.saveSettings(A, BOOK_S, { orgName: `หอไม่มีเลขผู้ขาย ${stamp}`, taxId: SELLER_V, branchCode: "00000", address: "99 ถนนสุขุมวิท แขวงคลองตัน เขตคลองเตย กรุงเทพฯ 10110" }); // saveSettings เขียนทับทั้งแถว (ยกเว้น VAT)
    const r = await prep(cO, DS.u);
    const s = await sendAll(cO, DS.u, r?.runId);
    const b: any = await billOf(DS, "S1");
    const tis = await tisOf(b?.accountDocumentId);
    return [r?.ok === true && r.gate?.ok === true && b?.status === "SENT" && tis.length === 1, J({ gate: r?.gate, last: s[s.length - 1], st: b?.status, n: tis.length })];
  });

  // ═══════════════ K. เลขที่ ═══════════════
  console.log("\n── K เลขที่ใบกำกับ ──");
  await T("K-1", "ใบกำกับใบแรกของสมุด DV ได้เลขตามชุดที่ตั้งไว้ (= peekDocNo TAX_INVOICE ก่อนส่ง) · ห้องเรียงเลข ⇒ V1 ได้ใบแรก", ["sendBillRun"], async () => {
    const [ti]: any[] = await tisOf((await billOf(DV, "V1") as any)?.accountDocumentId);
    return [!!ti && ti.docNo === peekV, J({ docNo: ti?.docNo, peekV })];
  });
  await T("K-2", "X3 สามหอใช้สมุดเดียว (BOOK_Q · 12 ห้อง) ส่งพร้อมกัน 4 โพรเซส ⇒ ใบกำกับ 12 ใบ บิลละ 1 · เลขไม่ซ้ำ · ต่อเนื่อง 1..12 · ตัวนับ = 12 · ใบแจ้งหนี้ก็ต่อเนื่อง · ไม่มี throw", ["sendBillRun"], async () => {
    const runs: any[] = [];
    for (const d of DQ) runs.push(await runOf(d.u));
    const inputs = Array.from({ length: 12 }, (_, i) => ({ unitId: DQ[i % 3].u, runId: runs[i % 3]?.id }));
    const rs = await fanout("sendBillRun", cO, inputs, { now: NOW_N });
    for (let i = 0; i < 3; i++) await sendAll(cO, DQ[i].u, runs[i]?.id);
    const tis = await tiDocsOfBook(BOOK_Q);
    const nos = tis.map((t: any) => tailNo(t.docNo)).sort((a: number, b: number) => a - b);
    const heads = new Set(tis.map((t: any) => headNo(t.docNo)));
    const invs = await prisma.accountDocument.findMany({ where: { systemId: BOOK_Q, docType: "INVOICE", refType: "DormBill" } });
    const invNos = invs.map((d: any) => tailNo(d.docNo)).sort((a: number, b: number) => a - b);
    const perInv = await Promise.all(invs.map(async (d: any) => (await tisOf(d.id)).length));
    const contiguous = (xs: number[], n: number) => xs.length === n && xs.every((x, i) => x === i + 1);
    return [!badOf(rs).length && tis.length === 12 && new Set(tis.map((t: any) => t.docNo)).size === 12 && heads.size === 1 && contiguous(nos, 12) && (await seqLast(BOOK_Q)) === 12
      && contiguous(invNos, 12) && perInv.every((n: number) => n === 1), J({ bad: badOf(rs).slice(0, 3), n: tis.length, nos, heads: [...heads], invNos, perInv })];
  });
  await T("K-3", "X3 issueBillTaxInvoice 10 ทาง + 4 โพรเซส×3 บนบิล Q1-1 ⇒ ใบเดิมทุกทาง · ไม่มีใบ/เลขเพิ่ม", ["issueBillTaxInvoice"], async () => {
    const b: any = await billOf(DQ[0], "Q1-1");
    const s0 = await seqLast(BOOK_Q);
    const rs = await inProc(Array.from({ length: 10 }, () => () => fn("issueBillTaxInvoice")!(cO, { unitId: DQ[0].u, billId: b?.id })));
    const rp = await fanout("issueBillTaxInvoice", cO, Array.from({ length: 12 }, () => ({ unitId: DQ[0].u, billId: b?.id })));
    const ids = new Set([...rs, ...rp].map((x: any) => x?.docId));
    return [[...rs, ...rp].every((x: any) => x?.ok === true && x.created === false) && ids.size === 1 && (await tisOf(b?.accountDocumentId)).length === 1 && (await seqLast(BOOK_Q)) === s0,
      J({ codes: [...rs, ...rp].map(codeOf).slice(0, 6), ids: ids.size, s0 })];
  });
  let k4Inv = "";
  await T("K-4", "X3 facade ใบแจ้งหนี้ใหม่ (DPC) createExternalTaxInvoice 12 ทาง 4 โพรเซส ⇒ ใบกำกับที่ยังมีผล 1 ใบ · created true ตัวเดียว · ตัวนับ +1 พอดี", [], async () => {
    const inv = await ACC.createExternalInvoice({ tenantId: A, sourceKind: "DORM", unitId: DPC, refType: "QcD3Pc", refId: "k4", customer: { name: "ผู้เช่า K4" },
      lines: [{ description: "ค่าห้อง", qty: 1, unitPriceSatang: 450_000, taxKind: "EXEMPT" }, { description: "ค่าไฟฟ้า 100 หน่วย", qty: 1, unitPriceSatang: 46_700, taxKind: "VAT7" }], vat: { registered: true, pricesIncludeVat: true }, issueDate: ISSUE });
    k4Inv = inv?.docId ?? "";
    const s0 = await seqLast(BOOK_PC);
    const rs = await fanout("acc:createExternalTaxInvoice", null, Array.from({ length: 12 }, () => ({ tenantId: A, unitId: DPC, sourceDocId: k4Inv, buyer: { name: "ผู้เช่า K4", address: "ห้อง K4" } })));
    const live = await tisOf(k4Inv);
    return [inv?.ok === true && rs.every((r) => r?.ok === true && r.docId === live[0]?.id) && rs.filter((r) => r.created === true).length === 1 && live.length === 1 && (await seqLast(BOOK_PC)) === s0 + 1,
      J({ codes: rs.map(codeOf), created: rs.filter((r) => r?.created).length, live: live.length, s0, s1: await seqLast(BOOK_PC) })];
  }, "CRITICAL", ["createExternalTaxInvoice"]);
  await T("K-5", "ล้มไม่กินเลข: ผู้ซื้อเลขผิด ⇒ BUYER_TAX_ID_INVALID · ต้นทางไม่มี VAT ⇒ NO_VAT_LINES · ตัวนับไม่ขยับ · ใบถัดไปได้เลขต่อจากเดิมพอดี", [], async () => {
    const inv = await ACC.createExternalInvoice({ tenantId: A, sourceKind: "DORM", unitId: DPC, refType: "QcD3Pc", refId: "k5", customer: { name: "ผู้เช่า K5" },
      lines: [{ description: "ค่าน้ำประปา", qty: 1, unitPriceSatang: 9_600, taxKind: "VAT7" }], vat: { registered: true, pricesIncludeVat: true }, issueDate: ISSUE });
    const s0 = await seqLast(BOOK_PC);
    const a = await af("createExternalTaxInvoice")!({ tenantId: A, unitId: DPC, sourceDocId: inv?.docId, buyer: { name: "ผู้เช่า K5", address: "ห้อง K5", taxId: BAD_TAX } });
    const ex: any = await prisma.accountDocument.findFirst({ where: { systemId: BOOK_PC, refType: "QcD3Pc", refId: "t9-ex" } });
    const b = await af("createExternalTaxInvoice")!({ tenantId: A, unitId: DPC, sourceDocId: ex?.id, buyer: { name: "ผู้เช่า", address: "ห้อง" } });
    const s1 = await seqLast(BOOK_PC);
    const c = await af("createExternalTaxInvoice")!({ tenantId: A, unitId: DPC, sourceDocId: inv?.docId, buyer: { name: "ผู้เช่า K5", address: "ห้อง K5", taxId: BUYER_PERSON } });
    const d: any = await docOf(c?.docId);
    const prev = (await tisOf(k4Inv))[0] as any;
    return [failOk(a, "BUYER_TAX_ID_INVALID") && failOk(b, "NO_VAT_LINES") && s1 === s0 && c?.ok === true && (await seqLast(BOOK_PC)) === s0 + 1 && tailNo(d?.docNo) === tailNo(prev?.docNo) + 1 && headNo(d?.docNo) === headNo(prev?.docNo),
      J({ a: codeOf(a), b: codeOf(b), s0, s1, c: codeOf(c), no: d?.docNo, prev: prev?.docNo })];
  }, "CRITICAL", ["createExternalTaxInvoice"]);
  await T("K-6", "ร้าน B เลขแยกต่อสมุด: ส่งบิล B1 ⇒ ใบกำกับเลขลำดับ 1 ของสมุด B · ตัวนับสมุด A ไม่ขยับ", ["sendBillRun"], async () => {
    const sQ = await seqLast(BOOK_Q);
    const run: any = await runOf(DB.u);
    const s = await sendAll(cB, DB.u, run?.id);
    const b: any = await billOf(DB, "B1");
    const [ti]: any[] = await tisOf(b?.accountDocumentId);
    return [b?.status === "SENT" && tailNo(ti?.docNo) === 1 && ti?.tenantId === B && (await seqLast(BOOK_Q)) === sQ, J({ last: s[s.length - 1], st: b?.status, no: ti?.docNo })];
  });

  // ═══════════════ R. ยกเลิกแล้วออกฉบับใหม่แทน ═══════════════
  console.log("\n── R ออกใบกำกับฉบับใหม่แทน ──");
  const reissue = (billNo: string, key: string, extra: Record<string, unknown> = {}, now = NOW_N, ctx: any = cO) =>
    billOf(DV, billNo).then((b: any) => fn("reissueBillTaxInvoice")!(ctx, { unitId: DV.u, billId: b?.id, reason: "แก้ชื่อและเลขผู้เสียภาษีของผู้ซื้อตามคำขอ", idempotencyKey: key, ...extra }, { now: new Date(now) }));
  const v1Inv: any = await invOfBill(DV, "V1");
  const v1Orig: any = (await tisOf(v1Inv?.id))[0] ?? null;
  const pp30Before = REP ? await pp30Of(BOOK_V, A, "2026-10") : null;
  await T("R-1", "เหตุผลสั้น (< 10 ตัวจริง) ⇒ REASON_REQUIRED · คีย์ว่าง ⇒ INVALID_INPUT · ไม่มีอะไรเปลี่ยน (ใบเดิมยังมีผล · ตัวนับเดิม)", ["reissueBillTaxInvoice"], async () => {
    const s0 = await seqLast(BOOK_V);
    const a = await reissue("V1", "r0", { reason: "แก้ ๆ ๆ" });
    const b = await reissue("V1", "", {});
    const t: any = await docOf(v1Orig?.id);
    return [failOk(a, "REASON_REQUIRED") && failOk(b, "INVALID_INPUT") && t?.status === "ISSUED" && (await seqLast(BOOK_V)) === s0, J({ a: codeOf(a), b: codeOf(b), st: t?.status })];
  }, "MAJOR");
  let r2: any = null;
  await T("R-2", "ออกฉบับใหม่แทน (V1 · ผู้ซื้อใหม่ นายสมชาย ใจดี 3101001234565): ใบเดิม VOIDED + voidReason + replacedById · เลขเดิมคงอยู่ · ใบใหม่เลขใหม่ ยอด/บรรทัดเท่าเดิมทุกสตางค์ · วันที่ = ใบเดิม (ORIGINAL)", ["reissueBillTaxInvoice"], async () => {
    r2 = await reissue("V1", "r1", { buyer: { name: "นายสมชาย ใจดี", taxId: BUYER_PERSON } });
    const old: any = await docOf(v1Orig?.id), nw: any = await docOf(r2?.docId);
    const lo = old ? await linesOfDoc(old.id) : [], ln = nw ? await linesOfDoc(nw.id) : [];
    const sameLines = lo.length === ln.length && lo.every((l: any, i: number) => l.description === ln[i].description && l.unitPrice === ln[i].unitPrice && l.vatRateBp === ln[i].vatRateBp && l.amount === ln[i].amount);
    const ok = r2?.ok === true && r2.created === true && r2.replacedDocId === v1Orig?.id && r2.replacedDocNo === v1Orig?.docNo && old?.status === "VOIDED" && old.docNo === v1Orig?.docNo && old.replacedById === nw?.id
      && /แก้ชื่อ/.test(old.voidReason ?? "") && nw?.docType === "TAX_INVOICE" && nw.status === "ISSUED" && nw.docNo && nw.docNo !== old.docNo && nw.sourceDocId === v1Inv?.id
      && nw.subTotal === old.subTotal && nw.vatAmount === old.vatAmount && nw.grandTotal === old.grandTotal && sameLines && bkkYmd(nw.issueDate) === ISSUE && r2.issueDate === ISSUE
      && nw.contactSnapshot?.name === "นายสมชาย ใจดี" && nw.contactSnapshot?.taxId === BUYER_PERSON && nw.contactSnapshot?.branchCode === "00000";
    return [ok, J({ r2, old: old && [old.status, old.docNo, old.replacedById === nw?.id, old.voidReason], nw: nw && [nw.docNo, nw.status, bkkYmd(nw.issueDate), nw.contactSnapshot], sameLines })];
  });
  await T("R-3", "หมายเหตุใบใหม่: \"ยกเลิกและออกใบกำกับภาษีฉบับใหม่แทนฉบับเดิม เลขที่ <เลขเดิม>\" + เหตุผล · adjustReason = เหตุผล · ref = <idใบแจ้งหนี้>#r1", ["reissueBillTaxInvoice"], async () => {
    const nw: any = await docOf(r2?.docId);
    return [!!nw && /ยกเลิกและออกใบกำกับภาษีฉบับใหม่แทนฉบับเดิม/.test(nw.note ?? "") && (nw.note ?? "").includes(v1Orig?.docNo ?? "@@") && /แก้ชื่อ/.test(nw.note ?? "") && /แก้ชื่อ/.test(nw.adjustReason ?? "")
      && nw.refType === "DormBillTax" && nw.refId === `${v1Inv?.id}#r1`, J(nw && { note: nw.note, adj: nw.adjustReason, ref: [nw.refType, nw.refId] })];
  }, "MAJOR");
  await T("R-4", "X3 คีย์เดิม r1: ซ้ำ ⇒ created false ใบเดิม · 10 ทาง ⇒ ใบเดิมทุกทาง · คีย์ใหม่ r2 4 โพรเซส×3 ⇒ ใบใหม่ 1 ใบ (ทุกผลชี้ใบเดียวกัน) · ใบที่ยังมีผลของบิล = 1 เสมอ", ["reissueBillTaxInvoice"], async () => {
    const again = await reissue("V1", "r1", { buyer: { name: "นายสมชาย ใจดี", taxId: BUYER_PERSON } });
    const rs = await inProc(Array.from({ length: 10 }, () => () => reissue("V1", "r1", { buyer: { name: "นายสมชาย ใจดี", taxId: BUYER_PERSON } })));
    const live1 = await tisOf(v1Inv?.id);
    const b: any = await billOf(DV, "V1");
    const rp = await fanout("reissueBillTaxInvoice", cO, Array.from({ length: 12 }, () => ({ unitId: DV.u, billId: b?.id, reason: "ออกใหม่เพราะใบเดิมพิมพ์ไม่ชัดเจน", idempotencyKey: "r2" })), { now: NOW_N });
    const live2 = await tisOf(v1Inv?.id);
    const ids = new Set(rp.map((x: any) => x?.docId));
    return [again?.ok === true && again.created === false && again.docId === r2?.docId && rs.every((x: any) => x?.ok === true && x.docId === r2?.docId) && live1.length === 1
      && rp.every((x: any) => x?.ok === true) && ids.size === 1 && rp.filter((x: any) => x.created === true).length === 1 && live2.length === 1 && live2[0].id === [...ids][0],
      J({ again: codeOf(again), rs: rs.map(codeOf).slice(0, 3), rp: rp.map(codeOf).slice(0, 4), ids: ids.size, live: [live1.length, live2.length] })];
  });
  await T("R-5", "ใบที่ถูกแทนแล้วสั่งแทนอีกด้วยคีย์ใหม่ (facade) ⇒ ALREADY_REPLACED · ประวัติ V1 = 3 ใบ (2 VOIDED เลขคงอยู่ · 1 ISSUED) · billTaxInvoice.history 3 · replaces ชี้เลขก่อนหน้า", ["billTaxInvoice"], async () => {
    const a = await af("replaceExternalTaxInvoice")!({ tenantId: A, unitId: DV.u, taxInvoiceDocId: v1Orig?.id, reason: "ลองแทนใบที่ถูกแทนไปแล้ว", idempotencyKey: "r9" });
    const all: any[] = await tisOf(v1Inv?.id, false);
    const v = await fn("billTaxInvoice")!(cO, { unitId: DV.u, billId: (await billOf(DV, "V1") as any)?.id });
    const st = all.map((t) => t.status);
    return [failOk(a, "ALREADY_REPLACED") && all.length === 3 && J(st) === J(["VOIDED", "VOIDED", "ISSUED"]) && all.every((t) => !!t.docNo) && v?.history?.length === 3 && v?.replaces?.docNo === all[1].docNo && v?.docId === all[2].id,
      J({ a: codeOf(a), st, v: v && { h: v.history, rep: v.replaces } })];
  }, "MAJOR", ["replaceExternalTaxInvoice"]);
  await T("R-6", "GL ใบแทน (ORIGINAL): JV กลับรายการของใบเดิมลงวันที่ 2026-10-26 (ไม่ใช่วันที่เครื่อง) · ภ.พ.30 ต.ค. VAT รวมเท่าก่อนออกใบแทน · ไม่มีแถวของใบที่ถูกแทน · มีแถวใบปัจจุบัน ฐาน = subTotal", ["reissueBillTaxInvoice"], async () => {
    const all: any[] = await tisOf(v1Inv?.id, false);
    const revs = await prisma.accountJournalEntry.findMany({ where: { systemId: BOOK_V, refType: "AccountDocument", refId: { in: all.slice(0, 2).map((t) => t.id) }, journal: "REVERSAL" } });
    const after = await pp30Of(BOOK_V, A, "2026-10");
    const rows: any[] = after?.output?.rows ?? [];
    const cur = all[2];
    const row = rows.find((r) => r.docNo === cur?.docNo);
    return [revs.length === 2 && revs.every((e: any) => bkkYmd(e.date) === ISSUE) && after?.output?.total === pp30Before?.output?.total && !rows.some((r) => r.docNo === all[0]?.docNo || r.docNo === all[1]?.docNo)
      && row?.base === cur?.subTotal && row?.vat === cur?.vatAmount, J({ revs: revs.map((e: any) => bkkYmd(e.date)), before: pp30Before?.output?.total, after: after?.output?.total, row })];
  });
  await T("R-7", "ช่วงล็อกของสมุด (lockBeforeDate 2026-10-27) ⇒ ออกใบแทนวันที่เดิม = PERIOD_LOCKED · ไม่มีอะไรเปลี่ยน (ใบ · ตัวนับ)", ["reissueBillTaxInvoice"], async () => {
    const s0 = await seqLast(BOOK_V), n0 = (await tisOf(v1Inv?.id, false)).length;
    await POL.savePolicy({ tenantId: A, systemId: BOOK_V }, { lockBeforeDate: new Date("2026-10-27T00:00:00+07:00") });
    let r: any = null;
    try { r = await reissue("V1", "r-lock"); } finally { await POL.savePolicy({ tenantId: A, systemId: BOOK_V }, { lockBeforeDate: null }); }
    return [failOk(r, "PERIOD_LOCKED") && (await seqLast(BOOK_V)) === s0 && (await tisOf(v1Inv?.id, false)).length === n0 && (await tisOf(v1Inv?.id)).length === 1, J({ r: codeOf(r) })];
  }, "MAJOR");

  // ═══════════════ B. บัญชี ═══════════════
  console.log("\n── B บัญชี ──");
  await T("B-1", "GL สมุด DV: 2205 (VAT รอใบกำกับ) คงเหลือ 0 · 2200 = Σ VAT ใบกำกับที่ยังมีผล · JV ใบกำกับ V1 ปัจจุบัน Dr 2205 / Cr 2200 = vatAmount", ["sendBillRun"], async () => {
    const live = await prisma.accountDocument.findMany({ where: { systemId: BOOK_V, docType: "TAX_INVOICE", status: LIVE } });
    const vat = live.reduce((s: number, d: any) => s + d.vatAmount, 0);
    const b2205 = await ledgerBal(BOOK_V, "2205"), b2200 = await ledgerBal(BOOK_V, "2200");
    const cur: any = (await tisOf(v1Inv?.id))[0];
    const je = cur ? await prisma.accountJournalEntry.findFirst({ where: { systemId: BOOK_V, refType: "AccountDocument", refId: cur.id, status: "POSTED" }, include: { lines: { include: { account: true } } } }) : null;
    const dr = je?.lines.find((l: any) => l.account.code === "2205"), cr = je?.lines.find((l: any) => l.account.code === "2200");
    return [live.length === 4 && vat > 0 && b2205 === 0 && b2200 === vat && dr?.debit === cur?.vatAmount && cr?.credit === cur?.vatAmount, J({ live: live.length, vat, b2205, b2200, je: je?.lines.map((l: any) => [l.account.code, l.debit, l.credit]) })];
  });
  await T("B-2", "ภ.พ.30 ต.ค. สมุด DV: ภาษีขายรวม = Σ VAT ใบกำกับที่ยังมีผล · ทุกแถวเป็นเลขใบกำกับ (ไม่ใช่ใบแจ้งหนี้) · ฐาน = subTotal ใบกำกับ (ไม่รวมค่าห้อง) · อัตรา 700", ["sendBillRun"], async () => {
    const live = await prisma.accountDocument.findMany({ where: { systemId: BOOK_V, docType: "TAX_INVOICE", status: LIVE } });
    const p = await pp30Of(BOOK_V, A, "2026-10");
    const rows: any[] = p?.output?.rows ?? [];
    const bad = live.filter((d: any) => { const r = rows.find((x) => x.docNo === d.docNo); return !r || r.base !== d.subTotal || r.vat !== d.vatAmount || r.rateBp !== 700; });
    const invNos = new Set((await prisma.accountDocument.findMany({ where: { systemId: BOOK_V, docType: "INVOICE" }, select: { docNo: true } })).map((d: any) => d.docNo));
    return [live.length === 4 && p?.output?.total === live.reduce((s: number, d: any) => s + d.vatAmount, 0) && rows.length === live.length && !bad.length && !rows.some((r) => invNos.has(r.docNo)),
      J({ total: p?.output?.total, rows: rows.map((r) => [r.docNo, r.base, r.vat, r.rateBp]), bad: bad.map((d: any) => d.docNo) })];
  });
  await T("B-3", "สมุดตั้งจุดรับรู้ ON_PAYMENT (DOP): ใบแจ้งหนี้หอยัง ON_ISSUE · ใบกำกับ 1 ใบ · รับเงินเต็ม (recordExternalPayment) ⇒ ไม่มีใบกำกับต่อการรับเงิน (sourcePaymentId) · ใบกำกับที่ยังมีผลยัง 1 · 2210 = 0", ["sendBillRun"], async () => {
    const b: any = await billOf(DOP, "O1");
    const inv: any = await docOf(b?.accountDocumentId);
    const t0 = await tisOf(inv?.id);
    const pay = inv ? await ACC.recordExternalPayment({ tenantId: A, unitId: DOP.u, docId: inv.id, amountSatang: inv.grandTotal, idempotencyKey: `d3-op-${stamp}` }) : null;
    const perPay = pay?.paymentId ? await prisma.accountDocument.count({ where: { docType: "TAX_INVOICE", sourcePaymentId: pay.paymentId } }) : -1;
    const t1 = await tisOf(inv?.id);
    return [inv?.vatTiming === "ON_ISSUE" && inv?.taxPointBasis === "ON_ISSUE" && t0.length === 1 && pay?.ok === true && perPay === 0 && t1.length === 1 && (await ledgerBal(BOOK_OP, "2210")) === 0,
      J({ inv: inv && [inv.vatTiming, inv.taxPointBasis], t0: t0.length, pay: codeOf(pay), perPay, t1: t1.length, b2210: await ledgerBal(BOOK_OP, "2210") })];
  });
  await T("B-4", "ด่าน voidDocument (เฉพาะ DORM): ยกเลิกใบแจ้งหนี้ V2 ที่มีใบกำกับ ⇒ ไม่ผ่าน · ยกเลิกใบกำกับของหอตรง ๆ ⇒ ไม่ผ่าน · ทั้งคู่ยังมีผล", ["sendBillRun"], async () => {
    const inv: any = await invOfBill(DV, "V2");
    const [ti]: any[] = await tisOf(inv?.id);
    const a = inv ? await ASV.voidDocument(A, BOOK_V, inv.id, "ทดสอบยกเลิกใบแจ้งหนี้") : null;
    const b = ti ? await ASV.voidDocument(A, BOOK_V, ti.id, "ทดสอบยกเลิกใบกำกับ") : null;
    const inv2: any = await docOf(inv?.id), ti2: any = await docOf(ti?.id);
    return [a?.ok === false && THAI.test(a?.reason ?? "") && b?.ok === false && THAI.test(b?.reason ?? "") && !["VOIDED", "CANCELLED"].includes(inv2?.status) && ti2?.status === "ISSUED",
      J({ a, b, st: [inv2?.status, ti2?.status] })];
  });
  await T("B-5", "ทางแปลงเอกสารเดิม (convertDocument → issueDocument TAX_INVOICE) บนใบแจ้งหนี้หอที่มีใบกำกับ ⇒ ออกไม่ได้ (ไม่มีใบกำกับที่ 2 ที่รวมค่าห้อง)", ["sendBillRun"], async () => {
    const inv: any = await invOfBill(DV, "V4");
    const cv = inv ? await ASV.convertDocument(A, BOOK_V, inv.id, "TAX_INVOICE") : null;
    const is = cv?.ok ? await ASV.issueDocument(A, BOOK_V, cv.newId) : null;
    if (cv?.ok) await ASV.cancelDraft(A, BOOK_V, cv.newId);
    return [(cv?.ok === false || is?.ok === false) && (await tisOf(inv?.id)).length === 1, J({ cv, is })];
  });

  // ── ออกใบแทนแบบ REISSUE_DAY (ข้ามเดือน · หลังตรวจ ภ.พ.30 ต.ค. แล้ว) ──
  await T("R-8", "ค่าตั้ง rooms.vat.reissueDate = REISSUE_DAY + now 20 พ.ย. ⇒ ใบแทนของ V2 ลงวันที่ 2026-11-20 · JV กลับรายการใบเดิมลง 2026-11-20 · ภ.พ.30 พ.ย. สุทธิ 0 (กลับเดิม + ลงใหม่)", ["reissueBillTaxInvoice"], async () => {
    const inv: any = await invOfBill(DV, "V2");
    const [old]: any[] = await tisOf(inv?.id);
    await U(A, DV.u, "rooms.vat.reissueDate", "REISSUE_DAY");
    let r: any = null;
    try { r = await reissue("V2", "r-day", { reason: "ผู้เช่าขอแก้ที่อยู่สำนักงานบนใบกำกับ" }, NOW_LATE); }
    finally { await prisma.settingValue.deleteMany({ where: { tenantId: A, key: "rooms.vat.reissueDate" } }); }
    const nw: any = await docOf(r?.docId);
    const rev = old ? await prisma.accountJournalEntry.findFirst({ where: { systemId: BOOK_V, refType: "AccountDocument", refId: old.id, journal: "REVERSAL" } }) : null;
    const nov = await pp30Of(BOOK_V, A, "2026-11");
    return [r?.ok === true && r.issueDate === "2026-11-20" && bkkYmd(nw?.issueDate) === "2026-11-20" && bkkYmd(rev?.date) === "2026-11-20" && nov?.output?.total === 0 && nw?.vatAmount === old?.vatAmount,
      J({ r: codeOf(r), iss: r?.issueDate, nw: bkkYmd(nw?.issueDate), rev: bkkYmd(rev?.date), nov: nov?.output?.total })];
  }, "MAJOR");
  await T("R-9", "audit dorm.taxinvoice.reissued: 1 แถว/การออกใบแทนที่สร้างจริง (r1 · r2 · r-day = 3) · after มี billId/oldDocId/newDocId/reason · ไม่มีเลขผู้เสียภาษี/ชื่อผู้ซื้อ (X8)", ["reissueBillTaxInvoice"], async () => {
    const rows = await prisma.auditLog.findMany({ where: { tenantId: A, action: "dorm.taxinvoice.reissued" } });
    const bad = rows.filter((x: any) => !x.after?.billId || !x.after?.oldDocId || !x.after?.newDocId || !THAI.test(String(x.after?.reason ?? "")) || /\d{13}/.test(J(x)) || /สมชาย|ผู้เช่าดี/.test(J(x)));
    return [rows.length === 3 && !bad.length, J({ n: rows.length, bad: bad.slice(0, 2) })];
  }, "MAJOR");

  // ── ใบลดหนี้ของบิลที่มีใบกำกับ ──
  await T("B-6", "ใบลดหนี้ไฟของ V1 (฿107 รวม VAT): VAT ใบลดหนี้ = computeTotals (700) · note อ้าง \"ใบกำกับภาษีเลขที่ <เลขปัจจุบัน>\" · ภ.พ.30 เดือนใบลดหนี้มีแถวติดลบ −700", ["adjustSentBill"], async () => {
    const b: any = await billOf(DV, "V1");
    const cur: any = (await tisOf(b?.accountDocumentId))[0];
    const r = await fn("adjustSentBill")!(cO, { unitId: DV.u, billId: b?.id, kind: "CREDIT", reason: "จดเลขมิเตอร์ไฟผิดเกินไปหนึ่งหน่วย", idempotencyKey: "cn-elec", lines: [{ code: "ELEC", labelTh: "ค่าไฟฟ้า (ลดหนี้)", amountSatang: 10_700 }] });
    const cn: any = await docOf(r?.docId);
    const exp = TOT.computeTotals({ lines: [{ description: "x", qty: 1, unitPrice: 10_700, vatRateBp: 700 }], vatMode: "INCLUDE", vatRegistered: true, vatRateBp: 700 });
    const p = cn ? await pp30Of(BOOK_V, A, `${bkkYmd(cn.issueDate).slice(0, 7)}`) : null;
    const row = (p?.output?.rows ?? []).find((x: any) => x.docNo === cn?.docNo);
    return [r?.ok === true && cn?.docType === "CREDIT_NOTE" && cn.vatAmount === exp.vatAmount && exp.vatAmount === 700 && (cn.note ?? "").includes(cur?.docNo ?? "@@") && /ใบกำกับภาษี/.test(cn.note ?? "") && row?.vat === -700,
      J({ r: codeOf(r), cn: cn && [cn.vatAmount, cn.note], cur: cur?.docNo, row })];
  });
  await T("B-7", "ใบลดหนี้ค่าห้องของ V1 (ยกเว้น VAT): VAT 0 · note ยังอ้างใบกำกับ · ใบกำกับที่ยังมีผลไม่ถูกแตะ (ยอดเดิม)", ["adjustSentBill"], async () => {
    const b: any = await billOf(DV, "V1");
    const cur: any = (await tisOf(b?.accountDocumentId))[0];
    const r = await fn("adjustSentBill")!(cO, { unitId: DV.u, billId: b?.id, kind: "CREDIT", reason: "ลดค่าห้องเพราะแอร์เสียสามวันตามตกลง", idempotencyKey: "cn-rent", lines: [{ code: "RENT", labelTh: "ค่าห้อง (ลดหนี้)", amountSatang: 30_000 }] });
    const cn: any = await docOf(r?.docId);
    const cur2: any = await docOf(cur?.id);
    return [r?.ok === true && cn?.vatAmount === 0 && (cn.note ?? "").includes(cur?.docNo ?? "@@") && cur2?.status === "ISSUED" && cur2.vatAmount === cur.vatAmount && cur2.grandTotal === cur.grandTotal, J({ r: codeOf(r), cn: cn && [cn.vatAmount, cn.note] })];
  }, "MAJOR");

  // ═══════════════ W. หัก ณ ที่จ่าย · ค่าตั้ง ═══════════════
  console.log("\n── W หัก ณ ที่จ่าย · ค่าตั้ง ──");
  {
    let why = "";
    try {
      const w = SET.getDef("rooms.tax.withholdingCorporateBp"), r = SET.getDef("rooms.vat.reissueDate");
      const rooms = (await import(pathToFileURL(join(ROOT, F.rooms)).href)) as any;
      const pend: string[] = rooms.PENDING_LEGAL_REVIEW_KEYS ?? [];
      if (!w || SET.defaultFor(w, null) !== 0) why += `withholding ค่าเริ่ม=${w ? SET.defaultFor(w, null) : "ไม่มี def"} · `;
      if (!r) why += "ไม่มี def rooms.vat.reissueDate · ";
      else {
        if (SET.defaultFor(r, null) !== "ORIGINAL") why += `reissueDate ค่าเริ่ม=${SET.defaultFor(r, null)} · `;
        if (!r.schema?.safeParse?.("REISSUE_DAY")?.success || r.schema?.safeParse?.("TOMORROW")?.success) why += "schema reissueDate ไม่ใช่ ORIGINAL|REISSUE_DAY · ";
        if (r.sensitivity !== "MONEY" || !THAI.test(r.labelTh ?? "") || !/^⚠️ รอที่ปรึกษากฎหมายตรวจ/.test(r.helpTh ?? "") || !pend.includes("rooms.vat.reissueDate")) why += `ป้าย/ความอ่อนไหว/PENDING ไม่ครบ (${r.sensitivity} · ${r.helpTh?.slice(0, 20)} · pending=${pend.includes("rooms.vat.reissueDate")})`;
      }
    } catch (e) { why = `อ่านทะเบียนล้ม: ${errMsg(e)}`; }
    chk("W-1", "ทะเบียนค่าตั้ง: rooms.tax.withholdingCorporateBp ค่าเริ่ม 0 (ปิด) · rooms.vat.reissueDate enum ORIGINAL|REISSUE_DAY ค่าเริ่ม ORIGINAL · MONEY · ป้ายไทย · รอที่ปรึกษา (PENDING)", !why, why, "MAJOR");
  }
  await T("W-2", "BillPreview หัก ณ ที่จ่าย: V2 (นิติบุคคล · snapshot 500) ⇒ { rateBp 500, ฐาน = gross RENT, ยอด 5% } · V1 (บุคคล) ⇒ null · V4 (นิติบุคคล · snapshot ค่าเริ่มใหม่ 0) ⇒ null", ["getBill"], async () => {
    const g = async (no: string) => fn("getBill")!(cO, { unitId: DV.u, billId: (await billOf(DV, no) as any)?.id });
    const b2: any = await billOf(DV, "V2");
    const rent = lineOf(b2, "RENT")?.grossSatang ?? -1;
    const p2 = await g("V2"), p1 = await g("V1"), p4 = await g("V4");
    return [p2?.withholding?.rateBp === 500 && p2.withholding.baseSatang === rent && p2.withholding.amountSatang === Math.round(rent * 500 / 10000) && p1?.withholding === null && p4?.withholding === null,
      J({ w2: p2?.withholding, w1: p1?.withholding, w4: p4?.withholding, rent })];
  }, "MAJOR");
  await T("W-3", "BillPreview.taxInvoice ของ V1 = ใบปัจจุบัน (docNo · ISSUED) · DN (ไม่จด) = null · billRunModel.rows[].taxInvoiceNo ตรง", ["getBill", "billRunModel"], async () => {
    const b: any = await billOf(DV, "V1");
    const cur: any = (await tisOf(b?.accountDocumentId))[0];
    const p = await fn("getBill")!(cO, { unitId: DV.u, billId: b?.id });
    const pn = await fn("getBill")!(cO, { unitId: DN.u, billId: (await billOf(DN, "N1") as any)?.id });
    const m = await fn("billRunModel")!(cO, { unitId: DV.u, periodKey: P_RUN });
    const row = (m?.rows ?? []).find((r: any) => r.roomNumber === "V1");
    return [!!cur && p?.taxInvoice?.docId === cur?.id && p.taxInvoice.docNo === cur?.docNo && p.taxInvoice.status === "ISSUED" && pn?.taxInvoice === null && row?.taxInvoiceNo === cur?.docNo,
      J({ ti: p?.taxInvoice, n: pn?.taxInvoice, row: row?.taxInvoiceNo, cur: cur?.docNo })];
  }, "MAJOR");

  // ═══════════════ U. จอ ═══════════════
  console.log("\n── U จอ (renderToStaticMarkup) ──");
  await T("U-1", "ตัวอย่างบิล V1 (จด VAT): data-preview-vat มี \"VAT 7%\" + ยอด VAT · ไม่มี \"ไม่มี VAT\" · data-preview-tax-invoice=<เลข> + ลิงก์ /dorm/billing/<billId>/tax-invoice", ["billRunModel"], async () => {
    if (!ScreenC) return [false, screenWhy];
    const b: any = await billOf(DV, "V1");
    const cur: any = (await tisOf(b?.accountDocumentId))[0];
    const m = await fn("billRunModel")!(cO, { unitId: DV.u, periodKey: P_RUN, previewRoom: "V1" });
    const h = renderScreen(m);
    const pv = box1(h, "data-bill-preview");
    const vat = pv ? box1(pv.html, "data-preview-vat") : null, ti = pv ? box1(pv.html, "data-preview-tax-invoice") : null;
    const href = ti ? /href="([^"]+)"/.exec(ti.html)?.[1] ?? "" : "";
    return [!!vat && /VAT\s*7\s*%/.test(textOf(vat.html)) && textOf(vat.html).includes(baht(b?.vatSatang ?? -1)) && !/ไม่มี VAT/.test(textOf(pv?.html ?? "")) && ti?.attrs["data-preview-tax-invoice"] === cur?.docNo
      && textOf(ti?.html ?? "").includes(cur?.docNo ?? "@@") && href.endsWith(`/dorm/billing/${b?.id}/tax-invoice`), J({ vat: vat && textOf(vat.html), ti: ti && [ti.attrs, textOf(ti.html), href] })];
  }, "MAJOR");
  await T("U-2", "ตัวอย่างบิล V2: data-preview-wht \"หัก ณ ที่จ่าย 5%\" + ยอด · DN (ไม่จด VAT) ยังมี \"ไม่มี VAT\" และไม่มีกล่อง VAT/ใบกำกับ/หัก ณ ที่จ่าย", ["billRunModel"], async () => {
    if (!ScreenC) return [false, screenWhy];
    const b2: any = await billOf(DV, "V2");
    const rent = lineOf(b2, "RENT")?.grossSatang ?? 0;
    const h2 = renderScreen(await fn("billRunModel")!(cO, { unitId: DV.u, periodKey: P_RUN, previewRoom: "V2" }));
    const w = box1(h2, "data-preview-wht");
    const hn = renderScreen(await fn("billRunModel")!(cO, { unitId: DN.u, periodKey: P_RUN, previewRoom: "N1" }));
    const pn = box1(hn, "data-bill-preview");
    return [!!w && /หัก ณ ที่จ่าย\s*5\s*%/.test(textOf(w.html)) && textOf(w.html).includes(baht(Math.round(rent * 0.05))) && /ไม่มี VAT/.test(textOf(pn?.html ?? ""))
      && !box1(hn, "data-preview-vat") && !box1(hn, "data-preview-tax-invoice") && !box1(hn, "data-preview-wht"), J({ w: w && textOf(w.html), n: pn && textOf(pn.html).slice(0, 120) })];
  }, "MAJOR");
  const tiPrint = async (no: string, docId?: string) => {
    const b: any = await billOf(DV, no);
    const v = await fn("billTaxInvoice")!(cO, { unitId: DV.u, billId: b?.id, ...(docId ? { docId } : {}) });
    return { v, h: v && PrintC ? renderPrint(v) : "" };
  };
  await T("U-3", "ใบกำกับพิมพ์ (ม.86/4) V2: \"ใบกำกับภาษี\" ไม่มี \"อย่างย่อ\" · ผู้ขาย ชื่อ/เลข 13 หลัก/สำนักงานใหญ่/ที่อยู่ · ผู้ซื้อ ชื่อ/ที่อยู่/เลข/สาขาที่ 00001 · เลขที่ · วันที่ไทย · บรรทัด VAT เท่านั้น · มูลค่า/VAT/รวม แยก", ["billTaxInvoice"], async () => {
    if (!PrintC) return [false, printWhy];
    const { v, h } = await tiPrint("V2");
    const root = box1(h, "data-tax-invoice"), sel = box1(h, "data-ti-seller"), buy = box1(h, "data-ti-buyer");
    const lines = boxes(h, "data-ti-line").map((x) => x.attrs["data-ti-line"]);
    const t = textOf(h);
    // ORACLE-EDIT (ผู้คุม 29 ต.ค. · D.3) — R-8 รันก่อนและออกใบแทนของ V2 แบบ REISSUE_DAY ลง 2026-11-20 แล้ว ⇒ วันที่คาดอ่านจาก issueDate
    // ของใบกำกับที่ยังมีผลในฐาน (ไม่ใช่ค่าที่วิวคืน) แปลงเป็นวันที่ไทย พ.ศ. ด้วยตัวแปลงของออราเคิลเอง · ยังตรวจรูปแบบ "วัน เดือนย่อ พ.ศ." จริง
    const TH_MON = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
    const liveTi: any = (await tisOf((await invOfBill(DV, "V2") as any)?.id))[0];
    const ymd = bkkYmd(liveTi?.issueDate);
    const expDate = /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? `${Number(ymd.slice(8, 10))} ${TH_MON[Number(ymd.slice(5, 7)) - 1]} ${Number(ymd.slice(0, 4)) + 543}` : "@@ไม่มีใบกำกับที่ยังมีผล";
    const ok = !!v && !!liveTi && v.docId === liveTi.id && root?.attrs["data-tax-invoice"] === v.docNo && root?.attrs["data-ti-status"] === "ISSUED" && /ใบกำกับภาษี/.test(t) && !/อย่างย่อ/.test(t)
      && !!sel && digitsOf(textOf(sel.html)).includes(SELLER_V) && /สำนักงานใหญ่/.test(textOf(sel.html)) && /หอวีไอพี/.test(textOf(sel.html)) && /สุขุมวิท/.test(textOf(sel.html))
      && !!buy && /บริษัท ผู้เช่าดี จำกัด/.test(textOf(buy.html)) && digitsOf(textOf(buy.html)).includes(BUYER_CO) && /สาขาที่\s*00001/.test(textOf(buy.html)) && /พระราม 9/.test(textOf(buy.html))
      && textOf(box1(h, "data-ti-no")?.html ?? "").includes(v.docNo ?? "@@") && textOf(box1(h, "data-ti-date")?.html ?? "").includes(expDate) /* ORACLE-EDIT (ผู้คุม 29 ต.ค. · D.3) แทน /26 ต.ค. 2569/ */
      && J(lines) === J((v.lines ?? []).map((l: any) => l.code)) && !lines.includes("RENT") && !lines.includes("LATE_FEE")
      && textOf(box1(h, "data-ti-subtotal")?.html ?? "").includes(baht(v.subTotalSatang)) && textOf(box1(h, "data-ti-vat")?.html ?? "").includes(baht(v.vatSatang)) && textOf(box1(h, "data-ti-total")?.html ?? "").includes(baht(v.totalSatang));
    return [ok, J({ root: root?.attrs, sel: sel && textOf(sel.html), buy: buy && textOf(buy.html), lines, date: textOf(box1(h, "data-ti-date")?.html ?? ""), expDate, live: liveTi?.docNo })];
  }, "CRITICAL");
  await T("U-4", "ใบกำกับฉบับใหม่ V1 พิมพ์: data-ti-replaces มี \"ยกเลิกและออกใบกำกับภาษีฉบับใหม่แทนฉบับเดิม\" + เลขฉบับก่อน + เหตุผล · ฉบับเดิม (docId) สถานะ VOIDED มีคำ \"ยกเลิก\"", ["billTaxInvoice"], async () => {
    if (!PrintC) return [false, printWhy];
    const all: any[] = await tisOf(v1Inv?.id, false);
    const cur = await tiPrint("V1"), old = await tiPrint("V1", all[0]?.id);
    const rep = box1(cur.h, "data-ti-replaces");
    const oroot = box1(old.h, "data-tax-invoice");
    return [!!rep && /ยกเลิกและออกใบกำกับภาษีฉบับใหม่แทนฉบับเดิม/.test(textOf(rep.html)) && textOf(rep.html).includes(all[1]?.docNo ?? "@@") && /พิมพ์ไม่ชัดเจน/.test(textOf(rep.html))
      && oroot?.attrs["data-ti-status"] === "VOIDED" && old.v?.status === "VOIDED" && /ยกเลิก/.test(textOf(old.h)), J({ rep: rep && textOf(rep.html), old: oroot?.attrs })];
  }, "MAJOR");
  await T("U-5", "ใบพิมพ์/ตัวอย่างบิลไม่มีคำต้องห้าม สคบ. · ไม่มีเบอร์โทรผู้เช่า", ["billTaxInvoice", "billRunModel"], async () => {
    if (!PrintC || !ScreenC) return [false, printWhy || screenWhy];
    const phones = (await prisma.party.findMany({ where: { tenantId: A, id: { in: Object.values(DV.L).map((x) => x.partyId) } }, select: { phone: true } })).map((p: any) => p.phone).filter(Boolean);
    const hs = [(await tiPrint("V1")).h, (await tiPrint("V2")).h, renderScreen(await fn("billRunModel")!(cO, { unitId: DV.u, periodKey: P_RUN, previewRoom: "V2" }))];
    const bad = hs.filter((h) => LEGAL_BAD.test(textOf(h)) || phones.some((p: string) => digitsOf(textOf(h)).includes(p)));
    return [hs.every((h) => !!h) && !bad.length, `bad=${bad.length}`];
  }, "MAJOR");

  // ═══════════════ X. ขอบเขต ═══════════════
  console.log("\n── X ขอบเขต ──");
  const v1Bill: any = await billOf(DV, "V1");
  await T("X-1", "X1 ร้าน B อ่าน/ออก/ออกแทนใบกำกับของร้าน A ⇒ null / NOT_FOUND ×2 · ไม่มีอะไรเปลี่ยน", ["billTaxInvoice", "issueBillTaxInvoice", "reissueBillTaxInvoice"], async () => {
    const n0 = (await tisOf(v1Inv?.id, false)).length;
    const a = await fn("billTaxInvoice")!(cB, { unitId: DV.u, billId: v1Bill?.id });
    const b = await fn("issueBillTaxInvoice")!(cB, { unitId: DV.u, billId: v1Bill?.id });
    const c = await reissue("V1", "x1", {}, NOW_N, cB);
    return [a === null && failOk(b, "NOT_FOUND") && failOk(c, "NOT_FOUND") && (await tisOf(v1Inv?.id, false)).length === n0, J({ a, b: codeOf(b), c: codeOf(c) })];
  }, "CRITICAL");
  await T("X-2", "X1 facade บัญชีด้วย tenantId ร้าน B + เอกสารร้าน A ⇒ ไม่สำเร็จ (ข้อความไทย) · externalTaxInvoicesOf ⇒ []", [], async () => {
    const cur: any = (await tisOf(v1Inv?.id))[0];
    const a = await af("createExternalTaxInvoice")!({ tenantId: B, unitId: DV.u, sourceDocId: v1Inv?.id, buyer: { name: "x", address: "y" } });
    const b = await af("replaceExternalTaxInvoice")!({ tenantId: B, unitId: DV.u, taxInvoiceDocId: cur?.id, reason: "ร้านอื่นพยายามแทนใบ", idempotencyKey: "x2" });
    const c = await af("externalTaxInvoicesOf")!({ tenantId: B, unitId: DV.u, sourceDocId: v1Inv?.id });
    const d = await af("createExternalTaxInvoice")!({ tenantId: B, unitId: DB.u, sourceDocId: v1Inv?.id, buyer: { name: "x", address: "y" } });
    return [notOk(a) && notOk(b) && Array.isArray(c) && c.length === 0 && failOk(d, "NOT_FOUND") && (await tisOf(v1Inv?.id)).length === 1, J({ a: codeOf(a), b: codeOf(b), c, d: codeOf(d) })];
  }, "CRITICAL", ["createExternalTaxInvoice", "replaceExternalTaxInvoice", "externalTaxInvoicesOf"]);
  await T("X-3", "X1 ข้ามหน่วยในร้านเดียวกัน: billTaxInvoice(DX, บิล V1) ⇒ null · issueBillTaxInvoice(DX, บิล V1) ⇒ NOT_FOUND · facade หน่วย DX + ใบแจ้งหนี้ DV ⇒ ไม่สำเร็จ", ["billTaxInvoice", "issueBillTaxInvoice"], async () => {
    const a = await fn("billTaxInvoice")!(cO, { unitId: DX.u, billId: v1Bill?.id });
    const b = await fn("issueBillTaxInvoice")!(cO, { unitId: DX.u, billId: v1Bill?.id });
    const c = af("createExternalTaxInvoice") ? await af("createExternalTaxInvoice")!({ tenantId: A, unitId: DX.u, sourceDocId: v1Inv?.id, buyer: { name: "x", address: "y" } }) : { ok: false, code: "MISSING", reason: "ไม่มี" };
    return [a === null && failOk(b, "NOT_FOUND") && notOk(c), J({ a, b: codeOf(b), c: codeOf(c) })];
  }, "CRITICAL");
  const STV = await mkUser("staff-view", A, "STAFF", [DV.u], ["dorm.view"]);
  const PEND = await mkUser("owner-pending", A, "OWNER", ["*"], [], false);
  await T("X-4", "สิทธิ์สด: พนักงาน dorm.view อ่านใบกำกับได้ · ออก/ออกแทน ⇒ NOT_FOUND · สมาชิกยังไม่ตอบรับคำเชิญ ⇒ อ่าน null", ["billTaxInvoice", "issueBillTaxInvoice", "reissueBillTaxInvoice"], async () => {
    const cS = { tenantId: A, actorUserId: STV.id }, cP = { tenantId: A, actorUserId: PEND.id };
    const a = await fn("billTaxInvoice")!(cS, { unitId: DV.u, billId: v1Bill?.id });
    const b = await fn("issueBillTaxInvoice")!(cS, { unitId: DV.u, billId: v1Bill?.id });
    const c = await reissue("V1", "x4", {}, NOW_N, cS);
    const d = await fn("billTaxInvoice")!(cP, { unitId: DV.u, billId: v1Bill?.id });
    return [!!a?.docId && failOk(b, "NOT_FOUND") && failOk(c, "NOT_FOUND") && d === null, J({ a: !!a, b: codeOf(b), c: codeOf(c), d })];
  }, "CRITICAL");
  await T("X-5", "หน่วยชนิด HOTEL / id บิลมั่ว ⇒ billTaxInvoice null · issueBillTaxInvoice NOT_FOUND", ["billTaxInvoice", "issueBillTaxInvoice"], async () => {
    const a = await fn("billTaxInvoice")!(cO, { unitId: HB, billId: v1Bill?.id });
    const b = await fn("billTaxInvoice")!(cO, { unitId: DV.u, billId: `nope-${stamp}` });
    const c = await fn("issueBillTaxInvoice")!(cO, { unitId: HB, billId: v1Bill?.id });
    return [a === null && b === null && failOk(c, "NOT_FOUND"), J({ a, b, c: codeOf(c) })];
  }, "MAJOR");
  await T("X-6", "เลขที่ไม่ซ้ำ/ไม่ข้ามทั้งสมุด DV หลังทุกขั้น (ส่ง 4 · ออกแทน 3 ครั้ง · ข้ามเดือน = 7 ใบ): ตัวนับรวม = จำนวนใบกำกับที่มีเลข · เลขไม่ซ้ำ · ใบ VOIDED เลขคงอยู่ · ใบที่ยังมีผล 1 ใบ/ใบแจ้งหนี้", ["sendBillRun"], async () => {
    const tis = await tiDocsOfBook(BOOK_V);
    const all = await prisma.accountDocument.count({ where: { systemId: BOOK_V, docType: "TAX_INVOICE" } });
    const invs = await prisma.accountDocument.findMany({ where: { systemId: BOOK_V, docType: "INVOICE", refType: "DormBill" }, select: { id: true } });
    const per = await Promise.all(invs.map(async (d: any) => (await tisOf(d.id)).length));
    return [tis.length === all && (await seqLast(BOOK_V)) === tis.length && new Set(tis.map((t: any) => t.docNo)).size === tis.length && tis.length === 7 && per.every((n: number) => n === 1),
      J({ tis: tis.map((t: any) => [t.docNo, t.status]), all, seq: await seqLast(BOOK_V), per })];
  }, "CRITICAL");

  pendingAtOldG = await pendingOutbox(tenantIds);
  console.log(`\n  (G order) outbox PENDING ก่อนล้าง: ทั้งฐาน ${pendingAtOldG.all} · ของร้านทดสอบนี้ ${pendingAtOldG.mine}`);
} catch (e) {
  fail("CRASH", "จบกลางทาง", errMsg(e), "CRITICAL");
} finally {
  try { await cleanup(tenantIds); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); }
  try { await prisma.user.deleteMany({ where: { email: { startsWith: "svc-d3-" } } }); } catch (e) { console.log(`  ⚠️ cleanup users: ${errMsg(e)}`); }
  try {
    const left = await leftovers(tenantIds);
    if (!left.length) pass("Z-1", `ล้างครบ: ทุกตารางที่มี tenantId ของร้านทดสอบ ${tenantIds.length} ร้าน + ผู้ใช้ svc-d3-* = 0 แถว`);
    else fail("Z-1", "ล้างครบ", J(left), "MAJOR");
  } catch (e) { fail("Z-1", "ล้างครบ", `ตรวจไม่ได้: ${errMsg(e)}`, "MAJOR"); }
  // ═══════════════ G. regression — รันหลังล้างข้อมูล ═══════════════
  try {
    const pend = await pendingOutbox(tenantIds);
    console.log(`\n── G regression (ลูกโพรเซส · env เดียวกัน · หลังล้างข้อมูล · ผ่าน = JSON_SUMMARY ไม่มี failed / exit 0) ──`);
    console.log(`  (G order) outbox PENDING ตอนเริ่ม G: ทั้งฐาน ${pend.all} · ของร้านทดสอบนี้ ${pend.mine} (ก่อนล้าง: ${pendingAtOldG ? `${pendingAtOldG.all}/${pendingAtOldG.mine}` : "ไม่ได้วัด — จบกลางทาง"})`);
    const REG: [string, string, string[]][] = [
      ["G-1", "qc-svc-d.8", ["--no-regression"]], ["G-2", "qc-svc-d.7", ["--no-regression"]], ["G-3", "qc-svc-d.2", []], ["G-4", "qc-svc-smoke", []],
      ["G-5", "qc-acc-v2-gl-inclvat", []], ["G-6", "qc-acc-v2-guard", []], ["G-7", "qc-account-api-write-docs", []],
    ];
    for (const [id, f, args] of REG) {
      if (NO_REG) { skip(id, `regression ${f}`, "--no-regression / SVC_D3_NO_REGRESSION=1", "CRITICAL"); continue; }
      const r = spawnSync("pnpm", ["exec", "tsx", `scripts/${f}.mts`, ...args], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
      const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
      const js = [...out.matchAll(/JSON_SUMMARY (\{.*\})/g)].map((m) => m[1]).pop();
      let sum: any = null;
      try { sum = js ? JSON.parse(js) : null; } catch { /* อ่านไม่ได้ */ }
      const failedIds: string[] = Array.isArray(sum?.failed) ? sum.failed : [];
      const ok = r.status === 0 && failedIds.length === 0;
      if (ok) pass(id, `regression ${f} ไม่มีข้อแดง (${sum ? `${sum.passed}/${sum.total}${sum.skipped?.length ? ` · SKIP ${sum.skipped.length}` : ""}` : "exit 0"})`);
      else fail(id, `regression ${f} ไม่มีข้อแดง`, `exit=${r.status} failed=${J(failedIds)} · ${out.split("\n").filter((l) => l.includes("❌")).slice(0, 3).join(" | ").slice(0, 300)}`, "CRITICAL");
    }
  } catch (e) { fail("G-CRASH", "หมวด G จบกลางทาง", errMsg(e), "CRITICAL"); }
  await prisma.$disconnect();
}

const failed = cks.filter((c) => c.res === "FAIL");
const skipped = cks.filter((c) => c.res === "SKIP");
const passed = cks.length - failed.length - skipped.length;
console.log(`\n===== QC SVC D.3 · VAT + ใบกำกับภาษี (หอ) =====\nผ่าน ${passed}/${cks.length}${skipped.length ? ` (SKIP ${skipped.length})` : ""}`);
console.log(`FINDINGS: CRITICAL ${failed.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${failed.filter((c) => c.sev === "MAJOR").length} · MINOR ${failed.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id) })}`);
// exit 0 เมื่อไม่มีข้อแดง · รับใบ = ผ่านทุกข้อ (SKIP ที่ยอมได้: G-* เมื่อ --no-regression — ผู้คุมรันซ้ำครบก่อนรับ)
process.exit(failed.length > 0 ? 1 : 0);
