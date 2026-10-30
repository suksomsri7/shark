// QC — SVC D.8 · รอบบิลรายเดือน (ภาพ หอ 04) · oracle ของผู้คุม — builder ห้ามแก้ไฟล์นี้
// สัญญา: ledger/svc-briefs/svc-brief-d.8.md · ledger/SVC-MASTER-PLAN.md แถว D.8 · ledger/DESIGN-DORM-HOTEL.md A5 + ภาคผนวก ก หอ #23–30
//        · ledger/design-dorm/README.md (รอบ พ.ย. 31 บิล ฿174,126.40) · ข้อสอบ D.1 หมวด จ. (RAW ชุดเดียวกัน)
//
// กลุ่มข้อ:
//   S  โครงสร้าง: ไฟล์ · facade 11 ชื่อ · จอไม่ลาก server · ด่านหน้า/action/พิมพ์ · สิทธิ์ dorm.bill.send · event dorm.billrun.sent · F5.1/any/getDay
//      · ห้ามยิงเงินขนาน (หนี้ D.2 N2) · ใช้ชิ้นเดิม (D.1/D.2/D.6/D.7) · งานตามเวลา · คำต้องห้าม สคบ.
//   PC positive control (เขียวตั้งแต่ก่อนมีงาน): สูตร D.1 ฉาก พ.ย. · utilityCharges/gate D.7 ของฉาก · createExternalInvoice+ลิงก์จ่าย D.2 · heldRooms/periodUsage D.6 · ตัวยิง 4 โพรเซส
//   R  รอบ พ.ย. 2569 บ้านสวน 36 ห้อง: 31 บิล ทุกสตางค์ตรง buildDormBill · ฿174,126.40 หลังค่าปรับมือ 203/211 · ข้าม 207 (ย้ายออก) · snapshot สัญญา (dueDay) · เตรียมซ้ำไม่เขียน · พร้อมกัน = รอบเดียว · VAT
//   H  พักบิล (ป้ายมิเตอร์ · ยังไม่จด) · ปล่อย · ด่าน D.7 สด (STRICT/WARN) · Σ ตอนออกจริงหลังปล่อย HELD (หนี้ D.7 (5)) · RUN_STALE · VAT ไม่ตรงสมุด · ไม่ผูกสมุด
//   N  ส่ง: ใบแจ้งหนี้ 1 ใบ/ห้อง ยอดตรง · GL · บรรทัดมีหน่วย+อัตรา · ลิงก์จ่าย · event (payload 6 คีย์ ไม่มี PII) · กดซ้ำ · 10 ทางในโพรเซส · 4 โพรเซส · ช่องทาง · ตั้งเวลา · ล็อกหลังส่ง
//   A  แก้หลังส่ง = ใบลดหนี้/เพิ่มหนี้ (ไม่แก้ทับ · idempotent · เหตุผล · audit)
//   F  บิลแรก: เศษวัน (snapshot prorate) · ค่าเช่าล่วงหน้า · บริการจาก snapshot · ผู้พักร่วม · MOVE_IN · ย้ายออกหลังงวด · FIRST_RENT พัก · เพิ่มสัญญาเข้าใหม่ในรอบที่ส่งแล้ว
//   X  ข้ามร้าน/ข้ามหน่วย/สิทธิ์สด · U จอ หอ 04 (renderToStaticMarkup) · E กล่องประมาณจอ 03 · C CSV (X6) · J งานตามเวลา (X5) · P perf
//   Q ฉาก svcqc · V ภาพ (QC_BASE) · Z ล้างครบ · G regression (รันหลังล้างข้อมูล — บทเรียน D.5: outbox ค้างทำ drain ของชุดอื่นอด)
//
// ข้อมูลทดสอบใต้ร้านชั่วคราว slug `qc-svc-d8-*` + ผู้ใช้ `svc-d8-*@shark.local` · วันที่ตายตัว (รอบ 2026-11 · น้ำไฟ 2026-10 · now ฉีดผ่าน deps.now)
// รัน: bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-d.8.mts
//      `--no-regression` ข้ามหมวด G (SKIP) · `--perf-rooms=N` ขนาดฉาก P-3 (ค่าเริ่ม 300 · รับใบต้อง 300)
/* eslint-disable @typescript-eslint/no-explicit-any */
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn, spawnSync } from "node:child_process";

const SELF = fileURLToPath(import.meta.url);
const ROOT = join(dirname(SELF), "..");
const LABEL = "qc-svc-d.8";
const SVC_HOST = "ep-mute-scene";
const FORBIDDEN_HOSTS = ["ep-royal-night", "ep-plain-art", "ep-cool-shadow", "ep-weathered-river", "ep-frosty-lab", "ep-fragrant-thunder"];
const RUN_CMD = "bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-d.8.mts";

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
    if (job.op === "__pc_invoice") {
      const acc = (await import("@/lib/modules/account" as string)) as any;
      f = (_ctx: unknown, input: unknown) => acc.createExternalInvoice(input);
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
const NO_REG = process.argv.includes("--no-regression") || process.env.SVC_D8_NO_REGRESSION === "1";
const PERF_ROOMS = (() => { const a = process.argv.find((x) => x.startsWith("--perf-rooms=")); const n = a ? Number(a.split("=")[1]) : 300; return Number.isInteger(n) && n >= 10 && n <= 1000 ? n : 300; })();

// ═══════════════ perf (ใบสั่ง §8 · §9 มติ 1 — ผู้คุมปรับได้) ═══════════════
const PERF_PREPARE_36_MS = 5_000;
const PERF_PREPARE_300_MS = 30_000;
const PERF_CALL_MS = 30_000;
const PERF_SEND_31_TOTAL_MS = 60_000;

// ═══════════════ วันที่ตายตัวของฉาก ═══════════════
const P_RUN = "2026-11";          // ออกบิลรอบ พ.ย. 2569
const P_UTIL = "2026-10";         // น้ำไฟ ต.ค. (เลข 25 ต.ค.)
const P_DEC = "2026-12";
const NOW_N = "2026-10-26T07:05:00.000Z";      // จ. 26 ต.ค. 2569 14:05 (ภาพ 04)
const NOW_ADD = "2026-11-20T03:00:00.000Z";
const NOW_DEC = "2026-11-25T03:00:00.000Z";
const READ_AT = (p: string) => new Date(`${p}-25T03:00:00.000Z`);
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

const SCREEN_FILE = "src/components/dorm/BillingRunScreen.tsx";
const WALK_FILE = "src/components/dorm/MeterWalk.tsx";
const loadComp = async (file: string, named: string): Promise<[any, string]> => {
  if (!existsSync(join(ROOT, file))) return [null, `ยังไม่มี ${file}`];
  try {
    const m: any = await import(pathToFileURL(join(ROOT, file)).href);
    const c = typeof m.default === "function" ? m.default : typeof m[named] === "function" ? m[named] : null;
    return c ? [c, ""] : [null, `${file} ไม่มี default export ที่เป็นคอมโพเนนต์`];
  } catch (e) { return [null, `import ${file} ล้ม: ${errMsg(e)}`]; }
};
const [ScreenC, screenWhy] = await loadComp(SCREEN_FILE, "BillingRunScreen");
const [WalkC, walkWhy] = await loadComp(WALK_FILE, "MeterWalk");
const React = (await import("react" as string)) as any;
const RDS = (await import("react-dom/server" as string)) as any;

/** ตัวรันข้อ — needs = ชื่อฟังก์ชันใน facade dorm (ขาด = FAIL ไม่ใช่ SKIP) · ui = ต้องใช้คอมโพเนนต์ BillingRunScreen */
async function T(id: string, name: string, needs: string[], body: () => Promise<[boolean, string?]>, sev: Sev = "CRITICAL", ui = false) {
  const miss = needs.filter((n) => !fn(n));
  if (miss.length) return fail(id, name, dorm ? `facade dorm ไม่มี ${miss.join(", ")}` : dormWhy, sev);
  if (ui && !ScreenC) return fail(id, name, screenWhy || "ไม่มีคอมโพเนนต์ BillingRunScreen", sev);
  try {
    const [ok, why] = await body();
    if (ok) pass(id, name); else fail(id, name, why ?? "ไม่ตรง", sev);
  } catch (e) { fail(id, name, `throw: ${errMsg(e)}`, sev); }
}
const codeOf = (r: any) => (r && r.ok === false ? String(r.code) : r?.ok === true ? "OK" : r?.threw ? `THREW(${r.threw})` : J(r).slice(0, 80));
const failOk = (r: any, code: string) => r?.ok === false && r?.code === code && typeof r?.reason === "string" && THAI.test(r.reason) && !/prisma|invalid `|Unique constraint|violates/i.test(r.reason);

// ═══════════════ render ═══════════════
const ACTIONS = new Proxy({}, { get: () => async () => ({ ok: true }) });
const renderScreen = (model: unknown): string => String(RDS.renderToStaticMarkup(React.createElement(ScreenC, { model, unitSlug: "qc-d8", actions: ACTIONS }))).replace(/<!-- -->/g, "");
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
  const un = await prisma.user.count({ where: { email: { startsWith: "svc-d8-" } } });
  if (un) out.push({ table: "User(svc-d8-*)", n: un });
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
const badOf = (rs: any[]) => rs.filter((r) => r?.threw || r?.childFail || (r?.ok === false && r?.code !== "RUN_BUSY") || /P2028|P2024|P2002|timed out|Unable to start a transaction/i.test(J(r)));

// ═══════════════ ฉาก README (ชุดเดียวกับข้อสอบ D.1 หมวด จ.) ═══════════════
// [ห้อง, หน่วยไฟ, หน่วยน้ำ, ค่าปรับ, ยอดบนจอ]
const RAW: [string, number, number, boolean, number?][] = [
  ["101", 118, 8, false], ["102", 88, 6, false], ["103", 95, 7, false], ["104", 120, 1, false, 538_240], ["105", 102, 6, false], ["106", 148, 6, false],
  ["107", 76, 5, false], ["109", 91, 7, false], ["110", 84, 6, false], ["111", 99, 7, false], ["112", 173, 8, false],
  ["201", 142, 7, false, 628_224], ["202", 156, 11, false, 571_232], ["203", 98, 5, true, 554_256], ["204", 125, 6, false, 548_600], ["205", 110, 6, false, 541_520], ["206", 131, 9, false, 556_232],
  ["208", 105, 7, false], ["209", 87, 6, false], ["211", 139, 5, true], ["212", 121, 8, false],
  ["301", 110, 8, false], ["303", 82, 6, false], ["304", 93, 7, false], ["305", 152, 6, false], ["306", 79, 5, false], ["307", 90, 6, false], ["308", 86, 7, false],
  ["309", 412, 6, false, 684_064], ["310", 128, 5, false], ["312", 80, 5, false],
];
const LARGE = new Set(["101", "112", "201", "212", "301", "312"]);
const NAMES: Record<string, string> = { "201": "อรอุมา", "202": "จักรพันธ์", "203": "นิภา", "204": "ณัฐชา", "205": "ภานุ", "206": "รัตนา", "309": "เมธี" };
type Seg = { start: number; end: number };
const SEG: Record<string, { elec: Seg[]; water: Seg[] }> = {};
RAW.forEach(([room, e, w], i) => {
  let elec: Seg[] = [{ start: 1000 + i * 97, end: 1000 + i * 97 + e }];
  let water: Seg[] = [{ start: 100 + i * 11, end: 100 + i * 11 + w }];
  if (room === "204") { elec = [{ start: 1287, end: 1412 }]; water = [{ start: 312, end: 318 }]; }
  if (room === "112") elec = [{ start: 8904, end: 8951 }, { start: 0, end: 126 }];
  SEG[room] = { elec, water };
});
const NOVAT = { registered: false, pricesIncludeVat: true };
const expN = (room: string, fee: boolean, vat = NOVAT) => calc.buildDormBill({
  rentSatang: LARGE.has(room) ? 520_000 : 450_000, commonFeeSatang: 30_000,
  electricity: { kind: "METERED", segments: SEG[room].elec, method: { kind: "FIXED_RATE", satangPerUnit: 472 } },
  water: { kind: "METERED", segments: SEG[room].water, method: { kind: "FIXED_RATE", satangPerUnit: 1600 } },
  lateFeeSatang: fee ? 20_000 : 0, vat,
});
const BILL_SNAPSHOT_KEYS = ["rooms.legal.mode", "rooms.money.rounding", "rooms.utility.elec.method", "rooms.utility.water.method", "rooms.utility.elec.fixedRate", "rooms.utility.water.fixedRate",
  "rooms.utility.elec.flat", "rooms.utility.water.flat", "rooms.utility.minimum", "rooms.utility.sharedBasis", "rooms.vat.registered", "rooms.vat.pricesIncludeVat", "rooms.vat.taxKinds",
  "rooms.billing.rentTiming", "rooms.billing.utilityTiming", "rooms.billing.prorate", "rooms.utility.elec.tariffRef", "rooms.utility.water.tariffRef"];
const sumLines = (bills: any[]) => {
  const byCode: Record<string, number> = {};
  const qty: Record<string, number> = {};
  for (const b of bills) for (const l of (Array.isArray(b.lines) ? b.lines : [])) { byCode[l.code] = (byCode[l.code] ?? 0) + Number(l.grossSatang ?? 0); qty[l.code] = (qty[l.code] ?? 0) + Number(l.qty ?? 0); }
  return { byCode, qty };
};
const lineOf = (b: any, code: string) => (Array.isArray(b?.lines) ? b.lines.find((l: any) => l.code === code) : undefined);

const tenantIds: string[] = [];
let pendingAtOldG: { all: number; mine: number } | null = null;
const SV: any = await tryImport(pathToFileURL(join(ROOT, "scripts/svc-qc-data.mts")).href);

try {
  const stale = await prisma.tenant.findMany({ where: { slug: { startsWith: "qc-svc-d8-" } }, select: { id: true } });
  if (stale.length) { console.log(`  (กวาด tenant ค้างจากรอบก่อน ${stale.length})`); await cleanup(stale.map((t: { id: string }) => t.id)); }
  await prisma.user.deleteMany({ where: { email: { startsWith: "svc-d8-" } } });

  // ═══════════════ S. โครงสร้าง ═══════════════
  console.log("\n── S โครงสร้าง ──");
  const F = {
    billing: "src/lib/modules/dorm/billing.ts",
    index: DORM_IDX,
    screen: SCREEN_FILE,
    page: "src/app/app/u/[unitSlug]/dorm/billing/page.tsx",
    actions: "src/app/app/u/[unitSlug]/dorm/billing/actions.ts",
    print: "src/app/app/u/[unitSlug]/dorm/billing/[billId]/print/page.tsx",
    meterPage: "src/app/app/u/[unitSlug]/dorm/meter/page.tsx",
    scene: "scripts/svc-qc-billing-scene.mts",
  };
  {
    const miss = Object.values(F).filter((p) => !existsSync(join(ROOT, p)));
    chk("S-1", "มีไฟล์ของใบครบ (billing.ts · BillingRunScreen.tsx · billing/page · actions · [billId]/print · ฉาก svc-qc-billing-scene.mts)", !miss.length, `ขาด ${miss.join(", ")}`, "CRITICAL");
  }
  const API = ["prepareBillRun", "setBillExtraLines", "releaseHeldBill", "scheduleBillRun", "sendBillRun", "adjustSentBill", "billRunModel", "getBill", "billRunCsv", "meterEstimates", "runDormBillingJobs"];
  {
    const miss = API.filter((n) => !fn(n));
    chk("S-2", "facade @/lib/modules/dorm export ครบ 11 ชื่อ (§3)", !miss.length, dorm ? `ขาด ${miss.join(", ")}` : dormWhy, "CRITICAL");
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
    chk("S-3", "BillingRunScreen.tsx: 'use client' บรรทัดแรก · ไม่ import prisma/โมดูล server/actions/next/* (ได้เฉพาะ import type) — render ด้วย renderToStaticMarkup ได้",
      !!screenSrc && useClient && !bad.length && !prismaWord, screenSrc ? `use client=${useClient} import ต้องห้าม=${bad.join(",") || "—"} prisma=${prismaWord}` : "ยังไม่มีไฟล์", "CRITICAL");
  }
  const gateOk = (p: string) => !!p && !/^\s*["']use client["']/.test(p) && /requireUnit\s*\(/.test(p) && /["']DORM["']/.test(p) && /notFound\s*\(/.test(p)
    && /dormAccess\s*\(/.test(p) && /\.board\b/.test(p) && /from\s+["']@\/lib\/modules\/dorm["']/.test(p) && !/["']@\/lib\/modules\/dorm\//.test(p) && !/@\/lib\/core\/db|@prisma\//.test(p);
  {
    const p = read(F.page), pr = read(F.print);
    const ok = gateOk(p) && /BillingRunScreen/.test(p) && /billRunModel\s*\(/.test(p) && gateOk(pr) && /getBill\s*\(/.test(pr);
    chk("S-4", "หน้า /dorm/billing + /[billId]/print: server · requireUnit + DORM · dormAccess(...).board ไม่ผ่าน ⇒ notFound · billRunModel/getBill ผ่าน facade · ไม่แตะ prisma", ok,
      `page=${gateOk(p)} model=${/billRunModel\s*\(/.test(p)} print=${gateOk(pr)} getBill=${/getBill\s*\(/.test(pr)}`, "CRITICAL");
  }
  {
    const code = stripComments(read(F.actions));
    const firstUseServer = /^\s*["']use server["']/.test(code);
    const exportsOther = [...code.matchAll(/^\s*export\s+(?!async\s+function)(\S+)/gm)].map((m) => m[1]);
    const names = ["prepareBillRunAction", "setBillExtraLinesAction", "releaseHeldBillAction", "scheduleBillRunAction", "sendBillRunAction", "adjustSentBillAction", "exportBillRunCsvAction"]
      .filter((n) => !new RegExp(`export\\s+async\\s+function\\s+${n}\\b`).test(code));
    const gate = /requireUnit\s*\(/.test(code) && /["']DORM["']/.test(code);
    const trustInput = /input\??\.tenantId|tenantId\s*:\s*input\.|input\??\.actorUserId/.test(code);
    const floatMoney = /parseFloat|\*\s*100\b|Math\.round\([^)]*100/.test(code);
    chk("S-5", "actions.ts: 'use server' · export async function เท่านั้น (7 ชื่อ) · requireUnit + DORM · ร้าน/ผู้กระทำจาก session · ไม่แปลงเงินด้วยทศนิยม×100",
      !!code && firstUseServer && !exportsOther.length && !names.length && gate && !trustInput && !floatMoney,
      code ? `use server=${firstUseServer} export อื่น=${exportsOther.join(",") || "—"} ขาด=${names.join(",") || "—"} ด่าน=${gate} รับจาก input=${trustInput} ทศนิยม=${floatMoney}` : "ยังไม่มีไฟล์", "CRITICAL");
  }
  {
    let why = "";
    try {
      const pm = (await import("@/lib/core/permissions" as string)) as any;
      for (const k of ["dorm.bill.run", "dorm.bill.send"]) {
        if (!pm.isPermissionKey?.(k)) { why += `${k} ไม่อยู่ในทะเบียน · `; continue; }
        const l = pm.permissionLabel?.(k);
        if (typeof l !== "string" || l === k || !THAI.test(l)) why += `${k} ไม่มีป้ายไทย · `;
      }
      const early = ["dorm.slip.review", "dorm.payment.manual", "dorm.latefee.waive"].filter((k) => pm.isPermissionKey?.(k));
      // ORACLE-EDIT (ผู้คุม 29 ต.ค.): หลัง merge D.13 คีย์หอที่เหลือตาม CC §8 ลงทะเบียนโดย D.13 (dorm/access.ts DORM_ROLE_ROWS) — ไม่ใช่ D.8 เพิ่มล่วงหน้า
      const d13 = existsSync(join(ROOT, "src/lib/modules/dorm/policy.ts"));
      if (early.length && !d13) why += `เพิ่มคีย์ล่วงหน้า ${early.join(",")}`;
    } catch (e) { why = `import permissions ล้ม: ${errMsg(e)}`; }
    chk("S-6", "permissions.ts: dorm.bill.send (ใหม่) + dorm.bill.run ป้ายไทย · ไม่เพิ่มคีย์หอของใบอื่นล่วงหน้า", !why, why, "MAJOR");
  }
  const EV = "dorm.billrun.sent";
  {
    let why = "";
    try {
      const oc = (await import("@/lib/outbox-consumers" as string)) as any;
      const al = (await import("@/lib/automation/labels" as string)) as any;
      const wl = (await import("@/lib/webhooks/labels" as string)) as any;
      const a = typeof oc.consumers?.[EV] === "function";
      const lab = Array.isArray(al.AUTOMATION_EVENTS) ? al.AUTOMATION_EVENTS.find((e: { value: string }) => e.value === EV) : null;
      const c = Array.isArray(wl.WEBHOOK_EVENTS) && wl.WEBHOOK_EVENTS.some((e: { value: string }) => e.value === EV);
      // ORACLE-EDIT (ผู้คุม 30 ต.ค. · D.11): dorm.bill.overdue เป็นของ D.11 (latefee.ts/dunning.ts) — มีไฟล์ D.11 แล้วไม่นับเป็น "ลงล่วงหน้า"
      const d11 = existsSync(join(ROOT, "src/lib/modules/dorm/dunning.ts"));
      const early = ["dorm.bill.paid", "dorm.bill.partially_paid", ...(d11 ? [] : ["dorm.bill.overdue"])].filter((x) => typeof oc.consumers?.[x] === "function");
      if (!(a && lab && THAI.test(lab.label ?? "") && c) || early.length) why = `consumers=${a} automation=${!!lab} ป้ายไทย=${THAI.test(lab?.label ?? "")} webhooks=${c} ลงล่วงหน้า=${early.join(",") || "—"}`;
    } catch (e) { why = `import ทะเบียนล้ม: ${errMsg(e)}`; }
    chk("S-7", `event ${EV} ลง 3 ทะเบียน (ป้ายไทย) · ไม่ลง dorm.bill.paid/partially_paid/overdue ล่วงหน้า (D.10/D.11)`, !why, why, "MAJOR");
  }
  const bSrc = stripComments(read(F.billing));
  {
    const raw = /import\s*\{[^}]*\bprisma\b[^}]*\}\s*from\s+["']@\/lib\/core\/db["']/.test(read(F.billing));
    const anyUse = [F.billing, F.screen, F.page, F.actions, F.print].filter((f) => /:\s*any\b|as\s+any\b|<any>/.test(stripComments(read(f))));
    const getDay = [F.billing, F.screen].filter((f) => /\.getDay\(\)|\.getDate\(\)|\.getMonth\(\)/.test(stripComments(read(f))));
    chk("S-8", "billing.ts ไม่ import prisma ดิบ (F5.1) · ไม่มี any · ไม่มี getDay/getDate/getMonth ดิบ", !!bSrc && !raw && !anyUse.length && !getDay.length,
      bSrc ? `prisma ดิบ=${raw} any=${anyUse.join(",") || "—"} getDay=${getDay.join(",") || "—"}` : "ยังไม่มี billing.ts", "MAJOR");
  }
  {
    const par = /Promise\.(all|allSettled|any|race)\s*\([\s\S]{0,600}?(createExternalInvoice|createExternalCreditNote|createExternalDebitNote|createPaymentRequestForDoc|recordExternalPayment)/.test(bSrc);
    const mapAsync = /\.map\(\s*async[\s\S]{0,400}?(createExternalInvoice|createPaymentRequestForDoc)/.test(bSrc);
    chk("S-9", "เงินหอเรียกทีละใบ (หนี้ D.2 N2): ไม่มี Promise.all/allSettled/map(async) ครอบ createExternalInvoice/ใบลด-เพิ่มหนี้/ลิงก์จ่าย", !!bSrc && !par && !mapAsync, bSrc ? `Promise.*=${par} map(async)=${mapAsync}` : "ยังไม่มี billing.ts", "CRITICAL");
  }
  {
    const need: [string, RegExp][] = [["buildDormBill", /buildDormBill\s*\(/], ["prorate", /prorate\s*\(/], ["occupiedDays", /occupiedDays\s*\(/], ["utilityCharges", /utilityCharges\s*\(/],
      ["utilityBillingGate", /utilityBillingGate\s*\(/], ["heldRooms", /heldRooms\s*\(/], ["createExternalInvoice", /createExternalInvoice\s*\(/], ["dormBillInvoiceLines", /dormBillInvoiceLines\s*\(/],
      ["createPaymentRequestForDoc", /createPaymentRequestForDoc\s*\(/], ["createExternalCreditNote", /createExternalCreditNote\s*\(/], ["createExternalDebitNote", /createExternalDebitNote\s*\(/],
      ["snapshotPolicy", /snapshotPolicy\s*\(/], ["evaluateLegal", /evaluateLegal\s*\(/], ["emitOutbox", /emitOutbox\s*\(/], ["csvRow", /csvRow\s*\(/]];
    const miss = need.filter(([, re]) => !re.test(bSrc)).map(([n]) => n);
    chk("S-10", "billing.ts ใช้ชิ้นเดิม (ไม่เขียนสูตร/ตัวตรวจ/ทางเงินซ้ำ): buildDormBill · prorate · occupiedDays · utilityCharges · utilityBillingGate · heldRooms · createExternalInvoice · dormBillInvoiceLines · createPaymentRequestForDoc · ใบลด/เพิ่มหนี้ · snapshotPolicy · evaluateLegal · emitOutbox · csvRow",
      !!bSrc && !miss.length, bSrc ? `ขาด ${miss.join(", ")}` : "ยังไม่มี billing.ts", "MAJOR");
  }
  {
    const fit = read("scripts/fitness.mts");
    const used = new Set<string>();
    const deep: string[] = [];
    for (const i of importsOf(read(F.billing))) {
      const m = /^@\/lib\/modules\/([^/]+)(\/.*)?$/.exec(i.spec);
      if (!m || m[1] === "dorm" || i.typeOnly) continue;
      used.add(m[1]);
      if (m[2]) deep.push(i.spec);
    }
    const missing = [...used].filter((x) => !fit.includes(`"dorm→${x}"`));
    chk("S-11", "เส้นข้ามโมดูลของ billing.ts มีใน ALLOWED_EDGES · ใช้ account ผ่าน facade (ไม่ล้วง subpath)", !!bSrc && !missing.length && !deep.length && used.has("account"),
      bSrc ? `ใช้=${[...used].join(",") || "—"} ขาด=${missing.join(",") || "—"} ล้วงลึก=${deep.join(",") || "—"}` : "ยังไม่มี billing.ts", "MAJOR");
  }
  {
    const mj = read("src/lib/platform/minute-jobs.ts");
    const i = mj.search(/name:\s*["']dorm\.billing["']/);
    const blk = i >= 0 ? mj.slice(i, i + 600) : "";
    const ok = i >= 0 && /import\(\s*["']@\/lib\/modules\/dorm["']\s*\)/.test(blk) && /runDormBillingJobs\s*\(/.test(blk) && !/^import[^\n]*modules\/dorm/m.test(mj);
    chk("S-12", "minute-jobs: งาน dorm.billing (import facade ตอนรัน · เรียก runDormBillingJobs · ไม่ import หอตอนโหลดไฟล์)", ok, i < 0 ? "ไม่มีงาน dorm.billing" : blk.slice(0, 200).replace(/\s+/g, " "), "MAJOR");
  }
  {
    const files = [F.billing, F.screen, F.print];
    const bad = files.filter((f) => LEGAL_BAD.test(read(f)));
    const specs = SV?.SQC_VISUAL_SPECS?.["d.8"];
    chk("S-13", "ไม่มีคำต้องห้าม สคบ. ในโค้ดของใบ · (ผู้คุมตั้งแล้ว) SQC_VISUAL_SPECS d.8 = /dorm/billing", !bad.length && Array.isArray(specs) && specs.some((s: any) => /\/dorm\/billing/.test(s.path)),
      `คำต้องห้าม=${bad.join(",") || "—"} specs=${J(specs)}`, "MAJOR");
  }

  // ═══════════════ PC-1 สูตร D.1 (pure) ═══════════════
  console.log("\n── PC positive control ──");
  {
    const bills = RAW.map(([room, , , fee]) => expN(room, fee));
    const s = calc.sumBills(bills);
    const rooms = RAW.filter((r) => r[4] !== undefined).every(([room, , , fee, scr]) => expN(room, fee).totalSatang === scr);
    chk("PC-1", "สูตร D.1 ฉาก พ.ย.: 31 บิล ฿174,126.40 · RENT 14,370,000 · COMMON 930,000 · ELEC 1,755,840 · WATER 316,800 · LATE 40,000 · ยอดห้องตรงจอ",
      s.count === 31 && s.totalSatang === 17_412_640 && J([s.byCode.RENT, s.byCode.COMMON, s.byCode.ELEC, s.byCode.WATER, s.byCode.LATE_FEE]) === J([14_370_000, 930_000, 1_755_840, 316_800, 40_000]) && rooms,
      J({ count: s.count, total: s.totalSatang, by: s.byCode, rooms }), "CRITICAL");
  }

  // ═══════════════ fixtures ═══════════════
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const mkTenant = async (tag: string) => { const t = await prisma.tenant.create({ data: { name: `QC D8 ${tag}`, slug: `qc-svc-d8-${tag}-${stamp}` } }); tenantIds.push(t.id); return t.id as string; };
  const A = await mkTenant("a"), B = await mkTenant("b"), C = await mkTenant("c");
  const mkUnit = async (tenantId: string, type: string, tag: string, name?: string) => (await prisma.businessUnit.create({ data: { tenantId, type, name: name ?? `หอ D8 ${tag}`, slug: `d8${tag}-${stamp}` } })).id as string;
  const mkBook = async (tenantId: string, name: string, vat = false) => {
    const s = await SYS.createSystem(tenantId, "ACCOUNT", name);
    // ORACLE-EDIT (ผู้คุม 29 ต.ค. · D.3): สมุดที่จด VAT ต้องมีเลขผู้ขาย (ม.86/4(2)) — D.3 พักบิลของสมุด VAT ที่ไม่มีเลข
    await ASV.saveSettings(tenantId, s.id, { orgName: name, vatRegistered: vat, ...(vat ? { taxId: "0105561000003" } : {}) });
    await GL.ensureAccounting({ tenantId, systemId: s.id });
    await prisma.accountFinance.create({ data: { tenantId, systemId: s.id, type: "BANK", name: "บัญชีรับเงินหอ", promptpayId: "0812345678", useForReceive: true } });
    return s.id as string;
  };
  const link = (tenantId: string, systemId: string, unitId: string) => prisma.accountSystemLink.create({ data: { tenantId, systemId, linkedKind: "BUSINESS", linkedId: unitId, enabled: true } });
  type QU = { id: string };
  const mkUser = async (key: string, tenantId: string, role: string, unitAccess: string[], perms: string[] = [], accepted = true): Promise<QU> => {
    const u = await prisma.user.create({ data: { email: `svc-d8-${stamp}-${key}@shark.local`, name: `QC D8 ${key}` } });
    await prisma.membership.create({ data: { userId: u.id, tenantId, role, unitAccess, permissions: Object.fromEntries(perms.map((p) => [p, true])), acceptedAt: accepted ? new Date() : null } });
    return { id: u.id as string };
  };
  const mkType = async (tenantId: string, unitId: string, name: string, rent: number) =>
    (await prisma.hotelRoomType.create({ data: { tenantId, unitId, name, capacity: 2, baseRateSatang: rent, depositSatang: 0, rentMode: "MONTHLY", areaSqm: 24 } })).id as string;
  const mkBld = async (tenantId: string, unitId: string, name: string) => (await prisma.roomBuilding.create({ data: { tenantId, unitId, name, floors: 3, sortOrder: 1 } })).id as string;
  const mkRoom = async (tenantId: string, unitId: string, typeId: string, bld: string | null, number: string, floorNo = 1) =>
    (await prisma.hotelRoom.create({ data: { tenantId, unitId, roomTypeId: typeId, number, buildingId: bld, floorNo, floor: String(floorNo) } })).id as string;
  const setVal = async (tenantId: string, key: string, scope: string, scopeId: string, value: unknown) => {
    await prisma.settingValue.deleteMany({ where: { tenantId, key, scope, scopeId } });
    await prisma.settingValue.create({ data: { tenantId, key, scope, scopeId, value, setById: "qc-d8" } });
  };
  const U = (tenantId: string, unitId: string, key: string, value: unknown) => setVal(tenantId, key, "UNIT", unitId, value);
  let seq = 0;
  const RUNNUM = 100000 + Math.floor(Math.random() * 800000);
  const newPhone = () => `08${String((RUNNUM % 1000) * 100000 + ++seq).padStart(8, "0").slice(-8)}`;
  const snap = async (tenantId: string, unitId: string, roomTypeId: string, roomId: string, patch: Record<string, unknown> = {}) => {
    const s = await SET.snapshotPolicy({ tenantId }, "lease", { unitId, roomTypeId, roomId });
    return { ...s, values: { ...(s?.values ?? {}), ...patch } };
  };
  type LeaseOpt = { tenantId: string; unitId: string; roomId: string; roomTypeId: string; name: string; phone?: string | null; rent?: number; common?: number; start?: string; end?: string;
    status?: string; advance?: number; booking?: number; coTenants?: unknown; patch?: Record<string, unknown>; occ?: boolean };
  const mkLease = async (o: LeaseOpt) => {
    const party = await prisma.party.create({ data: { tenantId: o.tenantId, name: o.name, phone: o.phone === undefined ? newPhone() : o.phone } });
    const start = o.start ?? "2026-01-01", end = o.end ?? "2027-03-31";
    const l = await prisma.dormLease.create({ data: {
      tenantId: o.tenantId, unitId: o.unitId, roomId: o.roomId, partyId: party.id, status: o.status ?? "ACTIVE", startDate: dbDate(start), endDate: dbDate(end),
      rentSatang: o.rent ?? 450_000, commonFeeSatang: o.common ?? 0, depositSatang: 0, advanceRentSatang: o.advance ?? 0, bookingFeeSatang: o.booking ?? 0,
      coTenants: o.coTenants ?? { occupants: [], vehicles: [] }, policySnapshot: await snap(o.tenantId, o.unitId, o.roomTypeId, o.roomId, o.patch), signedAt: new Date(), createdById: "qc-d8",
    } });
    if (o.occ !== false) {
      const endEx = new Date(Date.parse(`${end}T00:00:00Z`) + 86_400_000);
      const oc = await prisma.roomOccupancy.create({ data: { tenantId: o.tenantId, unitId: o.unitId, roomId: o.roomId, startDate: dbDate(start), endDate: endEx, kind: "LEASE", refType: "DormLease", refId: l.id } });
      await prisma.dormLease.update({ where: { id: l.id }, data: { occupancyId: oc.id } });
    }
    return { leaseId: l.id as string, partyId: party.id as string };
  };
  const mkMeter = async (tenantId: string, unitId: string, roomId: string | null, kind: string, startReading: number) =>
    (await prisma.dormMeter.create({ data: { tenantId, unitId, roomId, kind, role: roomId ? "ROOM" : "MAIN", startReading } })).id as string;
  const rd = async (tenantId: string, unitId: string, meterId: string, periodKey: string, value: number, extra: Record<string, unknown> = {}) =>
    (await prisma.dormMeterReading.create({ data: { tenantId, unitId, meterId, periodKey, kind: "PERIOD", value, source: "IMPORT", readAt: READ_AT(periodKey), ...extra } })).id as string;

  // ── ผู้ใช้ ──
  const OWN = await mkUser("owner", A, "OWNER", ["*"]);
  const OWNB = await mkUser("owner-b", B, "OWNER", ["*"]);
  const OWNC = await mkUser("owner-c", C, "OWNER", ["*"]);
  const cO = { tenantId: A, actorUserId: OWN.id }, cB = { tenantId: B, actorUserId: OWNB.id }, cC = { tenantId: C, actorUserId: OWNC.id };
  const mCtx = { tenantId: A, actorUserId: OWN.id };
  const AUTH = async (unitId: string, kind: string, periodKey: string, billSatang: number, units: number, ctx: any = cO) => {
    const r = await fn("recordAuthorityBill")?.(ctx, { unitId, kind, periodKey, billSatang, units });
    if (!r?.ok) throw new Error(`recordAuthorityBill ${kind} ${periodKey}: ${codeOf(r)}`);
  };

  // ── DN: บ้านสวนอพาร์ตเมนต์ 36 ห้อง (README · ภาพ 04) ──
  const DN = await mkUnit(A, "DORM", "n", "บ้านสวนอพาร์ตเมนต์");
  const BOOK_N = await mkBook(A, `บัญชีหอ D8 N ${stamp}`); await link(A, BOOK_N, DN);
  const tyStd = await mkType(A, DN, "มาตรฐาน", 450_000), tyLg = await mkType(A, DN, "ห้องใหญ่", 520_000);
  const bN = await mkBld(A, DN, "อาคาร A");
  const RN: Record<string, string> = {};
  const roomNoOf: Record<string, string> = {};
  for (let f = 1; f <= 3; f++) for (let n = 1; n <= 12; n++) {
    const no = `${f}${String(n).padStart(2, "0")}`;
    RN[no] = await mkRoom(A, DN, LARGE.has(no) ? tyLg : tyStd, bN, no, f);
    roomNoOf[RN[no]] = no;
  }
  const LN: Record<string, { leaseId: string; partyId: string }> = {};
  for (const [room] of RAW) {
    LN[room] = await mkLease({ tenantId: A, unitId: DN, roomId: RN[room], roomTypeId: LARGE.has(room) ? tyLg : tyStd, name: NAMES[room] ?? `ผู้เช่าห้อง ${room}`,
      phone: room === "305" ? null : undefined, rent: LARGE.has(room) ? 520_000 : 450_000, common: 30_000,
      patch: room === "206" ? { "rooms.billing.dueDay": 10 } : {} });
  }
  LN["207"] = await mkLease({ tenantId: A, unitId: DN, roomId: RN["207"], roomTypeId: tyStd, name: "ธนพล", rent: 450_000, common: 30_000, start: "2025-11-01", end: "2026-10-31", status: "NOTICE" });
  await prisma.dormMoveOut.create({ data: { tenantId: A, unitId: DN, leaseId: LN["207"].leaseId, status: "NOTICE", moveOutDate: dbDate("2026-10-31") } });
  await U(A, DN, "rooms.billing.dueDay", 7); // ค่าตั้งเปลี่ยนหลังทำสัญญา ⇒ บิลใช้ dueDay ของ snapshot (5 · 206 = 10)
  const MN: Record<string, { e: string; w: string }> = {};
  let oldMeter112 = "", read112 = "";
  for (const [room] of RAW) {
    const s = SEG[room];
    const e = await mkMeter(A, DN, RN[room], "ELEC", s.elec[0].start);
    const w = await mkMeter(A, DN, RN[room], "WATER", s.water[0].start);
    MN[room] = { e, w };
    if (room === "112") { oldMeter112 = e; read112 = await rd(A, DN, e, P_UTIL, 126, { flag: "BACKWARDS" }); }
    else await rd(A, DN, e, P_UTIL, s.elec[0].end, room === "309" ? { flag: "HIGH", confirmedAt: new Date(), confirmedById: OWN.id } : {});
    await rd(A, DN, w, P_UTIL, s.water[0].end);
  }
  for (const [room, e0, e1, w0, w1, flag] of [["207", 2000, 2104, 383, 387, null], ["108", 700, 700, 50, 50, null], ["311", 900, 900, 70, 70, null], ["210", 500, 518, 60, 60, "VACANT_USAGE"]] as const) {
    const e = await mkMeter(A, DN, RN[room], "ELEC", e0), w = await mkMeter(A, DN, RN[room], "WATER", w0);
    MN[room] = { e, w };
    await rd(A, DN, e, P_UTIL, e1, flag ? { flag } : {}); await rd(A, DN, w, P_UTIL, w1);
  }
  {
    const r = await fn("replaceMeter")?.(mCtx, { unitId: DN, meterId: oldMeter112, oldFinalReading: 8951, newStartReading: 0, readingId: read112, readAt: READ_AT(P_UTIL).toISOString() });
    if (!r?.ok) throw new Error(`fixture replaceMeter 112: ${codeOf(r)}`);
    MN["112"].e = r.newMeterId;
  }
  await AUTH(DN, "ELEC", P_UTIL, 1_982_400, 4200);
  await AUTH(DN, "WATER", P_UTIL, 384_000, 240);

  // ── PC-2 · PC-4 (ฉาก DN ผ่านชิ้นเดิม) ──
  {
    const uc = await fn("utilityCharges")?.(mCtx, { unitId: DN, periodKey: P_UTIL });
    const gate = await fn("utilityBillingGate")?.(mCtx, { unitId: DN, periodKey: P_UTIL });
    const rows = uc?.rows ?? [];
    const okE = rows.filter((r: any) => r.kind === "ELEC" && r.status === "OK");
    const r204 = rows.find((r: any) => r.roomId === RN["204"] && r.kind === "ELEC"), w204 = rows.find((r: any) => r.roomId === RN["204"] && r.kind === "WATER");
    const r112 = rows.find((r: any) => r.roomId === RN["112"] && r.kind === "ELEC");
    chk("PC-2", "D.7 บนฉาก: แถวไฟ OK 32 ห้อง (31 + 207) · 204 ไฟ 125×472 = 59,000 · น้ำ 9,600 · 112 = 173 หน่วย · ด่านผ่าน",
      okE.length === 32 && r204?.units === 125 && r204?.rateSatangPerUnit === 472 && r204?.amountSatang === 59_000 && w204?.amountSatang === 9_600 && r112?.units === 173 && gate?.ok === true,
      J({ okE: okE.length, r204, w204: w204?.amountSatang, r112: r112?.units, gate: gate?.ok, blocks: gate?.blocks }), "CRITICAL");
    const held = await fn("heldRooms")?.(mCtx, { unitId: DN, periodKey: P_UTIL });
    const pu = await fn("periodUsage")?.(mCtx, { unitId: DN, periodKey: P_UTIL });
    const u112 = (pu ?? []).find((r: any) => r.meterId === MN["112"].e);
    chk("PC-4", "D.6 บนฉาก: heldRooms = [210] (ห้องว่างใช้ไฟ · 309 ยืนยันแล้ว) · periodUsage 112 ตัวใหม่ 173 หน่วย 2 ช่วง",
      J(held) === J([RN["210"]]) && u112?.units === 173 && u112?.segments?.length === 2, J({ held: (held ?? []).map((x: string) => roomNoOf[x] ?? x), u112 }), "CRITICAL");
  }

  // ── หน่วยอื่น (tenant A) ──
  const BOOK_S = await mkBook(A, `บัญชีหอ D8 S ${stamp}`);
  /** หอเล็ก n ห้อง · ไฟมิเตอร์ห้อง (น้ำ NONE) · บิลไฟ (ถ้ามี) · คืน ห้อง/สัญญา/มิเตอร์ */
  const small = async (tag: string, rooms: { no: string; reading?: number | null; flag?: string; start?: number }[], o: { book?: string | null; auth?: [number, number] | null; method?: [string, number] | null } = {}) => {
    const u = await mkUnit(A, "DORM", tag);
    if (o.book !== null) await link(A, o.book ?? BOOK_S, u);
    const ty = await mkType(A, u, "มาตรฐาน", 450_000);
    const b = await mkBld(A, u, `อาคาร ${tag}`);
    await U(A, u, "rooms.utility.water.metering", "NONE");
    if (o.method) { await U(A, u, "rooms.utility.elec.method", o.method[0]); await U(A, u, "rooms.utility.elec.fixedRate", o.method[1]); }
    const R: Record<string, string> = {}, L: Record<string, { leaseId: string; partyId: string }> = {}, M: Record<string, string> = {}, RD: Record<string, string> = {};
    for (const r of rooms) {
      R[r.no] = await mkRoom(A, u, ty, b, r.no);
      L[r.no] = await mkLease({ tenantId: A, unitId: u, roomId: R[r.no], roomTypeId: ty, name: `ผู้เช่า ${tag} ${r.no}` });
      M[r.no] = await mkMeter(A, u, R[r.no], "ELEC", r.start ?? 0);
      if (r.reading !== null) RD[r.no] = await rd(A, u, M[r.no], P_UTIL, r.reading ?? 100, r.flag ? { flag: r.flag } : {});
    }
    if (o.auth !== null) await AUTH(u, "ELEC", P_UTIL, (o.auth ?? [500_000, 1000])[0], (o.auth ?? [500_000, 1000])[1]);
    return { u, ty, b, R, L, M, RD };
  };
  const DH = await small("h", [{ no: "H1", reading: 100 }, { no: "H2", reading: 300, flag: "HIGH" }, { no: "H3", reading: null }]);
  const DS = await small("s", [{ no: "S1", reading: 100 }, { no: "S2", reading: 150, flag: "HIGH" }], { auth: [94_400, 200], method: ["FIXED_RATE", 472] });
  const DG1 = await small("g1", [{ no: "G1" }, { no: "G2" }, { no: "G3" }], { auth: null, method: ["FIXED_RATE", 400] });
  const DG2 = await small("g2", [{ no: "W1" }, { no: "W2" }, { no: "W3" }], { auth: null, method: ["FIXED_RATE", 400] });
  await U(A, DG2.u, "rooms.legal.mode", "WARN");
  const DT = await small("t", [{ no: "T1", reading: 125 }, { no: "T2", reading: 80 }], { auth: [1_982_400, 4200] });
  const BOOK_C = await mkBook(A, `บัญชีหอ D8 C ${stamp}`), BOOK_P = await mkBook(A, `บัญชีหอ D8 P ${stamp}`), BOOK_M = await mkBook(A, `บัญชีหอ D8 M ${stamp}`);
  const DC = await small("c", Array.from({ length: 8 }, (_, i) => ({ no: `C${i + 1}`, reading: 50 + i })), { book: BOOK_C });
  const DP = await small("p", Array.from({ length: 8 }, (_, i) => ({ no: `P${i + 1}`, reading: 60 + i })), { book: BOOK_P });
  const DM = await small("m", Array.from({ length: 6 }, (_, i) => ({ no: `M${i + 1}`, reading: 40 + i })), { book: BOOK_M });
  const DVX = await small("vx", [{ no: "X1" }, { no: "X2" }, { no: "X3" }]);
  await U(A, DVX.u, "rooms.vat.registered", true);
  const DNL = await small("nl", [{ no: "N1" }, { no: "N2" }, { no: "N3" }], { book: null });
  // DV: หอจด VAT (ราคารวม VAT) · สมุดจด VAT
  const BOOK_V = await mkBook(A, `บัญชีหอ D8 V ${stamp}`, true);
  const DV = await mkUnit(A, "DORM", "v");
  await link(A, BOOK_V, DV);
  await U(A, DV, "rooms.vat.registered", true); await U(A, DV, "rooms.vat.pricesIncludeVat", true);
  const tyV = await mkType(A, DV, "มาตรฐาน", 450_000), bV = await mkBld(A, DV, "อาคาร V");
  const RV1 = await mkRoom(A, DV, tyV, bV, "V1"), RV2 = await mkRoom(A, DV, tyV, bV, "V2");
  await mkLease({ tenantId: A, unitId: DV, roomId: RV1, roomTypeId: tyV, name: "ผู้เช่า V1", common: 30_000 });
  await mkLease({ tenantId: A, unitId: DV, roomId: RV2, roomTypeId: tyV, name: "ผู้เช่า V2", common: 30_000 });
  for (const [r, e0, e1, w0, w1] of [[RV1, 1287, 1412, 312, 318], [RV2, 0, 50, 0, 3]] as const) {
    await rd(A, DV, await mkMeter(A, DV, r, "ELEC", e0), P_UTIL, e1); await rd(A, DV, await mkMeter(A, DV, r, "WATER", w0), P_UTIL, w1);
  }
  await AUTH(DV, "ELEC", P_UTIL, 1_982_400, 4200); await AUTH(DV, "WATER", P_UTIL, 384_000, 240);
  // DPC: positive control ของบัญชี
  const BOOK_PC = await mkBook(A, `บัญชีหอ D8 PC ${stamp}`);
  const DPC = await mkUnit(A, "DORM", "pc");
  await link(A, BOOK_PC, DPC);
  const HB = await mkUnit(A, "HOTEL", "hb");

  // ── PC-3 · PC-5 ──
  {
    const inv = (ref: string) => ACC.createExternalInvoice({ tenantId: A, sourceKind: "DORM", unitId: DPC, refType: "QcD8Pc", refId: ref, customer: { name: "ผู้เช่า PC" },
      lines: [{ description: "ค่าห้อง", qty: 1, unitPriceSatang: 450_000, taxKind: "EXEMPT" }], vat: NOVAT, issueDate: "2026-10-26", dueDate: "2026-11-05" });
    const a = await inv("pc3"), b = await inv("pc3");
    const fin = await ACC.firstReceiveFinanceId({ tenantId: A, systemId: BOOK_PC });
    const pr = a?.ok ? await ACC.createPaymentRequestForDoc({ tenantId: A, systemId: BOOK_PC }, a.docId, { financeId: fin }) : null;
    chk("PC-3", "D.2 createExternalInvoice DORM ซ้ำ ref = ใบเดิม (created false) · ยอด 450,000 · createPaymentRequestForDoc ได้ลิงก์ (สมุดมีช่องรับเงิน+พร้อมเพย์)",
      a?.ok === true && b?.ok === true && a.docId === b.docId && b.created === false && a.totalSatang === 450_000 && pr?.ok === true, J({ a: codeOf(a), b: [b?.docId === a?.docId, b?.created], pr: pr?.ok ?? pr?.reason }), "CRITICAL");
    const input = { tenantId: A, sourceKind: "DORM", unitId: DPC, refType: "QcD8Pc", refId: "pc5", customer: { name: "ผู้เช่า PC" },
      lines: [{ description: "ค่าห้อง", qty: 1, unitPriceSatang: 450_000, taxKind: "EXEMPT" }], vat: NOVAT, issueDate: "2026-10-26" };
    const rs = await fanout("__pc_invoice", null, Array.from({ length: 12 }, () => input));
    const n = await prisma.accountDocument.count({ where: { tenantId: A, refType: "QcD8Pc", refId: "pc5" } });
    chk("PC-5", "ตัวยิง 4 โพรเซส × 3: ใบแจ้งหนี้ ref เดียว 12 ทาง = 1 ใบ (D.2 X3 · ฐานของ N-9/P-3)", n === 1 && rs.every((r) => r?.ok === true), J({ n, codes: rs.map(codeOf) }), "CRITICAL");
  }

  // ═══════════════ R. รอบ พ.ย. 2569 (DN) ═══════════════
  console.log("\n── R รอบบิล พ.ย. 2569 · บ้านสวน 36 ห้อง ──");
  const prep = (ctx: any, unitId: string, periodKey: string, now: string): Promise<any> => fn("prepareBillRun")!(ctx, { unitId, periodKey }, { now: new Date(now) });
  const billsOfRun = async (runId: string) => prisma.dormBill.findMany({ where: { runId }, orderBy: { createdAt: "asc" } });
  const billOf = async (unitId: string, leaseId: string, periodKey = P_RUN) => prisma.dormBill.findFirst({ where: { unitId, leaseId, periodKey } });
  let runN = "";
  let prepMs = -1;
  await T("R-1", "prepareBillRun(DN, 2026-11, now 26 ต.ค. 14:05): created · DRAFT · น้ำไฟ 2026-10 · 31 บิล · พัก 0 · ยอด 17,372,640 (ก่อนค่าปรับ) · ข้าม 207 MOVE_OUT · ด่านผ่าน", ["prepareBillRun"], async () => {
    const t0 = Date.now();
    const r = await prep(cO, DN, P_RUN, NOW_N);
    prepMs = Date.now() - t0;
    runN = r?.runId ?? "";
    const sk = (r?.skipped ?? []).map((s: any) => `${s.roomNumber}:${s.reason}`);
    return [r?.ok === true && r.created === true && r.status === "DRAFT" && r.utilityPeriodKey === P_UTIL && r.billCount === 31 && r.heldCount === 0 && r.totalSatang === 17_372_640
      && J(sk) === J(["207:MOVE_OUT"]) && r.gate?.ok === true, J({ ...r, gate: r?.gate?.ok, ms: prepMs })];
  });
  await T("R-2", "แถว DormBill 31 แถว: ห้องตรงรายการ README (ไม่มี 207/108/210/311/302) · งวด 2026-11 · DRAFT · unique สัญญา", ["prepareBillRun"], async () => {
    const bs = await billsOfRun(runN);
    const rooms: string[] = bs.map((b: any) => roomNoOf[b.roomId]).sort();
    const want = RAW.map((r) => r[0]).sort();
    return [J(rooms) === J(want) && bs.every((b: any) => b.periodKey === P_RUN && b.status === "DRAFT" && b.unitId === DN) && new Set(bs.map((b: any) => b.leaseId)).size === 31, J({ n: bs.length, extra: rooms.filter((x: string) => !want.includes(x)) })];
  });
  await T("R-3", "ยอดทุกห้องตรง buildDormBill ของ D.1 ทุกสตางค์ (31 ห้อง · ก่อนค่าปรับ) · ห้องบนจอ 201 202 204 205 206 309 104", ["prepareBillRun"], async () => {
    const bs = await billsOfRun(runN);
    const bad: string[] = [];
    for (const b of bs) {
      const room = roomNoOf[b.roomId];
      const e = expN(room, false);
      if (b.totalSatang !== e.totalSatang || b.subtotalSatang !== e.subtotalSatang || b.vatSatang !== e.vatSatang) bad.push(`${room}:${b.totalSatang}≠${e.totalSatang}`);
    }
    return [bs.length === 31 && !bad.length, bad.slice(0, 6).join(" · ")];
  });
  await T("R-4", "204: บรรทัด RENT 450,000 · COMMON 30,000 · ELEC 125×472 = 59,000 (1,287→1,412) · WATER 6×1,600 = 9,600 · ชนิดภาษี NONE (ไม่จด VAT)", ["prepareBillRun"], async () => {
    const b: any = await billOf(DN, LN["204"].leaseId);
    const l = (b?.lines ?? []) as any[];
    const el = lineOf(b, "ELEC"), wl = lineOf(b, "WATER");
    const ok = J(l.map((x) => x.code)) === J(["RENT", "COMMON", "ELEC", "WATER"]) && lineOf(b, "RENT")?.amountSatang === 450_000 && lineOf(b, "COMMON")?.amountSatang === 30_000
      && el?.qty === 125 && el?.unitPriceSatang === 472 && el?.amountSatang === 59_000 && el?.meta?.from === 1287 && el?.meta?.to === 1412
      && wl?.qty === 6 && wl?.unitPriceSatang === 1600 && wl?.amountSatang === 9_600 && l.every((x) => x.taxKind === "NONE") && b?.totalSatang === 548_600;
    return [ok, J(l)];
  });
  await T("R-5", "112 เปลี่ยนมิเตอร์: ELEC 173 หน่วย 2 ช่วง ฿816.56 · 309 (ป้ายสูงยืนยันแล้ว = ไม่พัก) ELEC 412 หน่วย ฿1,944.64", ["prepareBillRun"], async () => {
    const b112: any = await billOf(DN, LN["112"].leaseId), b309: any = await billOf(DN, LN["309"].leaseId);
    const e1 = lineOf(b112, "ELEC"), e3 = lineOf(b309, "ELEC");
    return [e1?.qty === 173 && e1?.meta?.segments === 2 && e1?.amountSatang === 81_656 && b309?.status === "DRAFT" && e3?.qty === 412 && e3?.amountSatang === 194_464, J({ e1, e3, s309: b309?.status })];
  });
  await T("R-6", "DormBillRun: DRAFT · issueDate 2026-10-26 · billCount 31 · totalSatang 17,372,640 · ทุกบิลมี policySnapshot (v1 · คีย์ SNAPSHOT bill ครบ 18)", ["prepareBillRun"], async () => {
    const run = await prisma.dormBillRun.findFirst({ where: { id: runN } });
    const bs = await billsOfRun(runN);
    const missKeys = bs.flatMap((b: any) => BILL_SNAPSHOT_KEYS.filter((k) => !(b.policySnapshot?.values && k in b.policySnapshot.values)).map((k) => `${roomNoOf[b.roomId]}:${k}`));
    return [run?.status === "DRAFT" && ymdOf(run?.issueDate) === "2026-10-26" && run?.billCount === 31 && run?.totalSatang === 17_372_640 && bs.every((b: any) => b.policySnapshot?.v === 1) && !missKeys.length,
      J({ status: run?.status, issue: ymdOf(run?.issueDate), c: run?.billCount, t: run?.totalSatang, missKeys: missKeys.slice(0, 4) })];
  });
  await T("R-7", "วันครบกำหนดจาก snapshot สัญญา: ทุกห้อง 2026-11-05 · 206 = 2026-11-10 (snapshot dueDay 10) — ค่าตั้งหน่วยแก้เป็น 7 หลังทำสัญญาไม่มีผล", ["prepareBillRun"], async () => {
    const bs = await billsOfRun(runN);
    const bad = bs.filter((b: any) => ymdOf(b.dueDate) !== (roomNoOf[b.roomId] === "206" ? "2026-11-10" : "2026-11-05")).map((b: any) => `${roomNoOf[b.roomId]}:${ymdOf(b.dueDate)}`);
    return [bs.length === 31 && !bad.length, bad.join(",")];
  });
  const FEE_LINE = { kind: "LATE_FEE", labelTh: "ค่าปรับชำระล่าช้า", amountSatang: 20_000, note: "ปรับช้า ต.ค. 4 วัน" };
  await T("R-8", "setBillExtraLines 203 · 211 LATE_FEE ฿200 ⇒ 203 = 554,256 · รอบ 31 บิล ฿174,126.40 · แยกประเภทตรง README (RENT 14,370,000 · COMMON 930,000 · ELEC 1,755,840 · WATER 316,800 · LATE 40,000 · ไฟ 3,720 / น้ำ 198 หน่วย)", ["setBillExtraLines"], async () => {
    const b203: any = await billOf(DN, LN["203"].leaseId), b211: any = await billOf(DN, LN["211"].leaseId);
    const r1 = await fn("setBillExtraLines")!(cO, { unitId: DN, billId: b203?.id, lines: [FEE_LINE] });
    const r2 = await fn("setBillExtraLines")!(cO, { unitId: DN, billId: b211?.id, lines: [FEE_LINE] });
    const bs = await billsOfRun(runN);
    const s = sumLines(bs);
    const run = await prisma.dormBillRun.findFirst({ where: { id: runN } });
    const n203: any = bs.find((b: any) => b.id === b203?.id);
    const ok = r1?.ok && r2?.ok && r1.totalSatang === 554_256 && n203?.totalSatang === 554_256 && run?.totalSatang === 17_412_640 && run?.billCount === 31
      && J([s.byCode.RENT, s.byCode.COMMON, s.byCode.ELEC, s.byCode.WATER, s.byCode.LATE_FEE]) === J([14_370_000, 930_000, 1_755_840, 316_800, 40_000]) && s.qty.ELEC === 3720 && s.qty.WATER === 198
      && bs.every((b: any) => b.totalSatang === expN(roomNoOf[b.roomId], ["203", "211"].includes(roomNoOf[b.roomId])).totalSatang);
    return [!!ok, J({ r1: codeOf(r1), r2: codeOf(r2), run: run?.totalSatang, by: s.byCode, qty: [s.qty.ELEC, s.qty.WATER] })];
  });
  await T("R-9", "ค่าปรับเกินเพดานของสัญญา (snapshot capPerBill ฿500) ⇒ LATE_FEE_OVER_CAP · ยอด 0/ติดลบ/ทศนิยม ⇒ INVALID_INPUT · บิลไม่เปลี่ยน", ["setBillExtraLines"], async () => {
    const b: any = await billOf(DN, LN["204"].leaseId);
    const over = await fn("setBillExtraLines")!(cO, { unitId: DN, billId: b?.id, lines: [{ ...FEE_LINE, amountSatang: 60_000 }] });
    const bad = await Promise.all([0, -100, 100.5].map((a) => fn("setBillExtraLines")!(cO, { unitId: DN, billId: b?.id, lines: [{ ...FEE_LINE, amountSatang: a }] })));
    const after: any = await billOf(DN, LN["204"].leaseId);
    return [failOk(over, "LATE_FEE_OVER_CAP") && bad.every((x) => failOk(x, "INVALID_INPUT")) && after?.totalSatang === 548_600 && after?.updatedAt?.getTime() === b?.updatedAt?.getTime(), J({ over: codeOf(over), bad: bad.map(codeOf), t: after?.totalSatang })];
  });
  await T("R-10", "เตรียมซ้ำ (now เดิม) ⇒ created false · changed 0 · ไม่มีแถวใด updatedAt ขยับ · ค่าปรับมือคงอยู่ (203 = 554,256)", ["prepareBillRun"], async () => {
    const before = await billsOfRun(runN);
    const r = await prep(cO, DN, P_RUN, NOW_N);
    const after = await billsOfRun(runN);
    const moved = after.filter((a: any) => before.find((b: any) => b.id === a.id)?.updatedAt?.getTime() !== a.updatedAt?.getTime()).map((a: any) => roomNoOf[a.roomId]);
    const b203 = after.find((b: any) => b.leaseId === LN["203"].leaseId);
    return [r?.ok === true && r.created === false && r.runId === runN && r.changed === 0 && r.totalSatang === 17_412_640 && !moved.length && after.length === 31 && b203?.totalSatang === 554_256,
      J({ r: { ok: r?.ok, created: r?.created, changed: r?.changed, total: r?.totalSatang }, moved })];
  });
  await T("R-11", "X3 เตรียมรอบพร้อมกัน: DC 10 ทางในโพรเซสเดียว + DP 12 ทางจาก 4 โพรเซส ⇒ รอบเดียว/หน่วย · บิล 8 · ไม่มี throw · created true ตัวเดียว", ["prepareBillRun"], async () => {
    const rs = await inProc(Array.from({ length: 10 }, () => () => prep(cO, DC.u, P_RUN, NOW_N)));
    const rp = await fanout("prepareBillRun", cO, Array.from({ length: 12 }, () => ({ unitId: DP.u, periodKey: P_RUN })), { now: NOW_N });
    const runsC = await prisma.dormBillRun.count({ where: { unitId: DC.u } }), runsP = await prisma.dormBillRun.count({ where: { unitId: DP.u } });
    const bc = await prisma.dormBill.count({ where: { unitId: DC.u } }), bp = await prisma.dormBill.count({ where: { unitId: DP.u } });
    const cr = (xs: any[]) => xs.filter((x) => x?.created === true).length;
    return [runsC === 1 && runsP === 1 && bc === 8 && bp === 8 && !badOf(rs).length && !badOf(rp).length && cr(rs) === 1 && cr(rp) === 1,
      J({ runsC, runsP, bc, bp, bad: [...badOf(rs), ...badOf(rp)].slice(0, 3), created: [cr(rs), cr(rp)] })];
  });
  await T("R-12", "ตรวจอินพุต: งวด 2026-13 ⇒ INVALID_INPUT · 2027-06 (เกินเดือนนี้+2) ⇒ BAD_PERIOD · ไม่มีรอบเกิด", ["prepareBillRun"], async () => {
    const a = await prep(cO, DN, "2026-13", NOW_N), b = await prep(cO, DN, "2027-06", NOW_N);
    const n = await prisma.dormBillRun.count({ where: { unitId: DN } });
    return [failOk(a, "INVALID_INPUT") && failOk(b, "BAD_PERIOD") && n === 1, J({ a: codeOf(a), b: codeOf(b), n })];
  });
  await T("R-13", "VAT (DV จด VAT · ราคารวม VAT): ยอดตรง buildDormBill(vat รวม) ทุกสตางค์ · RENT EXEMPT VAT 0 · COMMON/ELEC/WATER VAT7 · vatSatang = Σ บรรทัด", ["prepareBillRun"], async () => {
    const r = await prep(cO, DV, P_RUN, NOW_N);
    const bs = await billsOfRun(r?.runId ?? "");
    const segs: Record<string, Seg[][]> = { [RV1]: [[{ start: 1287, end: 1412 }], [{ start: 312, end: 318 }]], [RV2]: [[{ start: 0, end: 50 }], [{ start: 0, end: 3 }]] };
    const bad: string[] = [];
    for (const b of bs) {
      const s = segs[b.roomId];
      const e = calc.buildDormBill({ rentSatang: 450_000, commonFeeSatang: 30_000, electricity: { kind: "METERED", segments: s[0], method: { kind: "FIXED_RATE", satangPerUnit: 472 } },
        water: { kind: "METERED", segments: s[1], method: { kind: "FIXED_RATE", satangPerUnit: 1600 } }, vat: { registered: true, pricesIncludeVat: true } });
      const rent = lineOf(b, "RENT");
      if (b.totalSatang !== e.totalSatang || b.vatSatang !== e.vatSatang || rent?.taxKind !== "EXEMPT" || rent?.vatSatang !== 0 || ["COMMON", "ELEC", "WATER"].some((c) => lineOf(b, c)?.taxKind !== "VAT7") || b.vatSatang <= 0)
        bad.push(`${b.roomId === RV1 ? "V1" : "V2"} ${b.totalSatang}/${e.totalSatang} vat ${b.vatSatang}/${e.vatSatang}`);
    }
    return [r?.ok === true && bs.length === 2 && !bad.length, J({ r: codeOf(r), bad })];
  });

  // ═══════════════ U. จอ หอ 04 (สถานะ DRAFT หลังค่าปรับ — ตรงภาพ) ═══════════════
  console.log("\n── U BillingRunScreen (renderToStaticMarkup · DOM §5) ──");
  const STV = await mkUser("staff-view", A, "STAFF", [DN], ["dorm.view"]);
  const STR = await mkUser("staff-run", A, "STAFF", [DN], ["dorm.view", "dorm.bill.run"]);
  const STM = await mkUser("staff-meter", A, "STAFF", [DN], ["dorm.meter.read"]);
  const STO = await mkUser("staff-other", A, "STAFF", [DH.u], ["dorm.view", "dorm.bill.run", "dorm.bill.send"]);
  const MGRX = await mkUser("manager-revoked", A, "MANAGER", ["*"], [], false);
  const cV = { tenantId: A, actorUserId: STV.id }, cR = { tenantId: A, actorUserId: STR.id }, cM = { tenantId: A, actorUserId: STM.id };
  let mU: any = null, hU = "";
  await T("U-1", "billRunModel (เจ้าของ · 2026-11 · ตัวอย่าง 204): KPI 31 · 14,370,000 · 930,000 · ไฟ 1,755,840/3,720/472 · น้ำ 316,800/198/1600 · ค่าปรับ 40,000 · รวม 17,412,640 · กฎหมายผ่าน · แถว 32 (207 SKIPPED) · counts 31/31/0", ["billRunModel"], async () => {
    mU = await fn("billRunModel")!(cO, { unitId: DN, periodKey: P_RUN, previewRoom: "204" });
    const k = mU?.kpi ?? {};
    const r207 = (mU?.rows ?? []).find((r: any) => r.roomNumber === "207");
    const ghosts = (mU?.rows ?? []).filter((r: any) => ["108", "210", "311", "302"].includes(r.roomNumber)).length;
    const ok = mU?.status === "DRAFT" && mU?.utilityPeriodKey === P_UTIL && k.billCount === 31 && k.rentSatang === 14_370_000 && k.commonSatang === 930_000 && k.elecSatang === 1_755_840 && k.elecUnits === 3720
      && k.elecRateSatang === 472 && k.waterSatang === 316_800 && k.waterUnits === 198 && k.waterRateSatang === 1600 && k.lateFeeSatang === 40_000 && k.totalSatang === 17_412_640
      && mU?.legal?.ok === true && mU?.legal?.elec?.billSatang === 1_982_400 && mU?.legal?.elec?.units === 4200 && mU?.legal?.water?.rateSatang === 1600
      && (mU?.rows ?? []).length === 32 && r207?.status === "SKIPPED" && r207?.skipReason === "MOVE_OUT" && !ghosts && mU?.preview?.roomNumber === "204"
      && J(mU?.counts) === J({ total: 31, reviewed: 31, held: 0 }) && mU?.canPrepare === true && mU?.canSend === true;
    return [!!ok, J({ status: mU?.status, kpi: k, legal: mU?.legal?.ok, rows: mU?.rows?.length, r207: r207?.status, counts: mU?.counts, can: [mU?.canPrepare, mU?.canSend] })];
  });
  await T("U-2", "ตัวห่อ data-billing-run (period · run-status) · หัว \"ออกบิลรอบ พ.ย. 2569\" · ขั้น 1 จดมิเตอร์ done · ขั้น 2 ตรวจบิล current", ["billRunModel"], async () => {
    hU = mU ? renderScreen(mU) : "";
    const w = box1(hU, "data-billing-run");
    const st = (n: string) => box1(hU, "data-run-step", n);
    return [!!w && w.attrs["data-period"] === P_RUN && w.attrs["data-run-status"] === "DRAFT" && /ออกบิลรอบ\s*พ\.ย\.\s*2569/.test(textOf(hU))
      && st("1")?.attrs["data-step-state"] === "done" && /จดมิเตอร์\s*\d+\s*\/\s*\d+/.test(textOf(st("1")?.html ?? "")) && st("2")?.attrs["data-step-state"] === "current" && /ตรวจบิล/.test(textOf(st("2")?.html ?? "")),
      `wrap=${J(w?.attrs)} s1=${J(st("1")?.attrs)} s2=${J(st("2")?.attrs)}`];
  }, "MAJOR", true);
  await T("U-3", "KPI: 31 ใบ · ฿153,000 (143,700 + 9,300) · ฿17,558.40 (3,720 หน่วย × ฿4.72) · ฿3,168.00 (198 หน่วย × ฿16.00) · ฿174,126.40 (ค่าปรับ ฿400)", ["billRunModel"], async () => {
    const t = (k: string) => textOf(box1(hU, "data-run-kpi", k)?.html ?? "");
    const ok = /\b31\b/.test(t("count")) && t("rentCommon").includes("฿153,000") && /143,700\s*\+\s*9,300/.test(t("rentCommon")) && t("elec").includes("฿17,558.40") && /3,720\s*หน่วย\s*×\s*฿4\.72/.test(t("elec"))
      && t("water").includes("฿3,168.00") && /198\s*หน่วย\s*×\s*฿16\.00/.test(t("water")) && t("total").includes("฿174,126.40") && t("total").includes("฿400");
    return [ok, J(["count", "rentCommon", "elec", "water", "total"].map(t))];
  }, "CRITICAL", true);
  await T("U-4", "กล่องกฎหมาย data-run-legal level OK: ฿4.72 · ฿19,824.00 · 4,200 หน่วย · ฿16.00 · ฿3,840.00 · 240 หน่วย", ["billRunModel"], async () => {
    const b = box1(hU, "data-run-legal");
    const t = textOf(b?.html ?? "");
    return [b?.attrs["data-level"] === "OK" && ["฿4.72", "฿19,824.00", "฿16.00", "฿3,840.00"].every((x) => t.includes(x)) && /4,200\s*หน่วย/.test(t) && /240\s*หน่วย/.test(t), `${b?.attrs["data-level"]} "${t.slice(0, 200)}"`];
  }, "MAJOR", true);
  await T("U-5", "ตาราง: 32 แถว data-bill-row · 201 ห้อง+ส่วนกลาง 5,500.00 · 204 ไฟ 590.00 (125 หน่วย) น้ำ 96.00 (6 หน่วย) รวม 5,486.00 · 203 อื่น ๆ 200.00 + \"ปรับช้า\"", ["billRunModel"], async () => {
    const rows = boxes(hU, "data-bill-row");
    const cell = (room: string, col: string) => textOf(box1(rows.find((r) => r.attrs["data-bill-row"] === room)?.html ?? "", "data-col", col)?.html ?? "");
    const ok = rows.length === 32 && cell("201", "rentCommon").includes("5,500.00") && cell("204", "elec").includes("590.00") && /125\s*หน่วย/.test(cell("204", "elec"))
      && cell("204", "water").includes("96.00") && /6\s*หน่วย/.test(cell("204", "water")) && cell("204", "total").includes("5,486.00") && cell("203", "other").includes("200.00") && /ปรับช้า/.test(cell("203", "other"))
      && !cell("204", "total").includes("฿");
    return [ok, J({ n: rows.length, c201: cell("201", "rentCommon"), e204: cell("204", "elec"), t204: cell("204", "total"), o203: cell("203", "other") })];
  }, "CRITICAL", true);
  await T("U-6", "แถว 207 SKIPPED \"ไม่ออกบิล\" + \"ย้ายออก\" · แถว 309 data-meter-flag=HIGH + \"ยืนยันแล้ว\"", ["billRunModel"], async () => {
    const rows = boxes(hU, "data-bill-row");
    const r207 = rows.find((r) => r.attrs["data-bill-row"] === "207"), r309 = rows.find((r) => r.attrs["data-bill-row"] === "309");
    const t7 = textOf(r207?.html ?? ""), t9 = textOf(r309?.html ?? "");
    return [r207?.attrs["data-bill-status"] === "SKIPPED" && /ไม่ออกบิล/.test(t7) && /ย้ายออก/.test(t7) && !!box1(r309?.html ?? "", "data-meter-flag", "HIGH") && /ยืนยันแล้ว/.test(t9), `207="${t7.slice(0, 80)}" 309="${t9.slice(0, 120)}"`];
  }, "MAJOR", true);
  await T("U-7", "ท้ายตาราง data-run-footer \"31 บิล · ฿174,126.40\" · แถบล่าง \"ตรวจครบแล้ว 31/31 · พักไว้ 0\"", ["billRunModel"], async () => {
    const f = textOf(box1(hU, "data-run-footer")?.html ?? ""), all = textOf(hU);
    return [/31\s*บิล\s*·\s*฿174,126\.40/.test(f) && /ตรวจครบแล้ว\s*31\s*\/\s*31\s*·\s*พักไว้\s*0/.test(all), `footer="${f}"`];
  }, "MAJOR", true);
  await T("U-8", "ตัวอย่างบิล 204: บรรทัด RENT/COMMON/ELEC/WATER · ไฟ \"1,287→1,412\" \"125×4.72\" · \"ยอดชำระ\" 5,486.00 · \"ครบกำหนด\" 5 พ.ย. 2569 · \"ไม่มี VAT\"", ["billRunModel"], async () => {
    const p = box1(hU, "data-bill-preview", "204");
    const t = textOf(p?.html ?? "");
    const codes = boxes(p?.html ?? "", "data-preview-line").map((x) => x.attrs["data-preview-line"]);
    const el = textOf(box1(p?.html ?? "", "data-preview-line", "ELEC")?.html ?? "");
    return [J(codes) === J(["RENT", "COMMON", "ELEC", "WATER"]) && /1,287\s*→\s*1,412/.test(el) && /125\s*×\s*4\.72/.test(el) && /ยอดชำระ/.test(t) && t.includes("5,486.00") && /ครบกำหนด/.test(t) && /5\s*พ\.ย\.\s*2569/.test(t) && /ไม่มี\s*VAT/.test(t),
      J({ codes, el, t: t.slice(0, 260) })];
  }, "CRITICAL", true);
  await T("U-9", "ปุ่ม: เจ้าของ send \"ส่งบิล 31 ใบตอนนี้\" ไม่ disabled + schedule + save + export · ผู้ดูอย่างเดียว (dorm.view) ⇒ โมเดล canSend false · ไม่มีปุ่ม send/schedule", ["billRunModel"], async () => {
    const send = box1(hU, "data-run-action", "send");
    const mV = await fn("billRunModel")!(cV, { unitId: DN, periodKey: P_RUN });
    const hV = mV ? renderScreen(mV) : "";
    const ok = !!send && /ส่งบิล\s*31\s*ใบ/.test(textOf(send.html)) && !("disabled" in send.attrs) && !!box1(hU, "data-run-action", "schedule") && !!box1(hU, "data-run-action", "export")
      && mV?.canSend === false && mV?.canPrepare === false && !!hV && !box1(hV, "data-run-action", "send") && !box1(hV, "data-run-action", "schedule");
    return [ok, J({ send: send?.attrs, sendTxt: textOf(send?.html ?? ""), mV: mV ? [mV.canPrepare, mV.canSend] : null, vSend: !!box1(hV, "data-run-action", "send") })];
  }, "CRITICAL", true);
  await T("U-12", "จอไม่มีคำต้องห้าม สคบ. · ไม่มีเบอร์โทรผู้เช่า", ["billRunModel"], async () => {
    const phones = (await prisma.party.findMany({ where: { tenantId: A, id: { in: Object.values(LN).map((x) => x.partyId) } }, select: { phone: true } })).map((p: any) => p.phone).filter(Boolean);
    const leak = phones.filter((p: string) => hU.includes(p) || hU.includes(p.slice(-7)));
    return [!!hU && !LEGAL_BAD.test(textOf(hU)) && !leak.length, `คำต้องห้าม=${LEGAL_BAD.exec(textOf(hU))?.[0] ?? "—"} เบอร์=${leak.length}`];
  }, "MAJOR", true);

  // ═══════════════ E. กล่องประมาณจอ 03 ═══════════════
  console.log("\n── E กล่องประมาณค่าน้ำไฟ (จอ 03) ──");
  let est: any = null;
  await T("E-1", "meterEstimates(DN, 2026-10)[204] = รวม 68,600 · ไฟ 125/472/59,000 · น้ำ 6/1600/9,600 · คนจดมิเตอร์ ⇒ {}", ["meterEstimates"], async () => {
    est = await fn("meterEstimates")!(cO, { unitId: DN, periodKey: P_UTIL });
    const e = est?.[RN["204"]];
    const m = await fn("meterEstimates")!(cM, { unitId: DN, periodKey: P_UTIL });
    return [e?.totalSatang === 68_600 && J([e?.elec?.units, e?.elec?.rateSatangPerUnit, e?.elec?.amountSatang]) === J([125, 472, 59_000]) && J([e?.water?.units, e?.water?.rateSatangPerUnit, e?.water?.amountSatang]) === J([6, 1600, 9_600])
      && m && typeof m === "object" && Object.keys(m).length === 0, J({ e, meter: m })];
  });
  await T("E-2", "MeterWalk + estimates ห้อง 204 ⇒ data-meter-estimate \"฿686.00\" \"125 × ฿4.72\" \"6 × ฿16.00\" · ไม่ส่ง estimates ⇒ ไม่มีกล่อง ไม่มี ฿ (จอ D.6 เดิม)", ["meterWalk", "meterEstimates"], async () => {
    if (!WalkC) return [false, walkWhy];
    const walk = await fn("meterWalk")!(mCtx, { unitId: DN, periodKey: P_UTIL });
    const base = { unitId: DN, periodKey: P_UTIL, walk, flags: [], submit: async () => ({ ok: true }), initialRoomId: RN["204"] };
    const h1 = String(RDS.renderToStaticMarkup(React.createElement(WalkC, { ...base, estimates: est }))).replace(/<!-- -->/g, "");
    const h0 = String(RDS.renderToStaticMarkup(React.createElement(WalkC, base))).replace(/<!-- -->/g, "");
    const b = box1(h1, "data-meter-estimate", RN["204"]);
    const t = textOf(b?.html ?? "");
    return [!!b && t.includes("฿686.00") && /125\s*×\s*฿4\.72/.test(t) && /6\s*×\s*฿16\.00/.test(t) && !boxes(h0, "data-meter-estimate").length && !textOf(h0).includes("฿"), `"${t}" h0฿=${textOf(h0).includes("฿")}`];
  }, "MAJOR");
  {
    const p = stripComments(read(F.meterPage));
    const i = p.search(/meterEstimates\s*\(/);
    chk("E-3", "หน้า meter: เรียก meterEstimates เฉพาะเมื่อ dormAccess(...).board (คนจดมิเตอร์ไม่เห็นเงิน) · ส่ง estimates เข้า MeterWalk", i >= 0 && /\.board\b/.test(p.slice(Math.max(0, i - 400), i + 50)) && /estimates\s*=/.test(p),
      i < 0 ? "ไม่เรียก meterEstimates" : p.slice(Math.max(0, i - 200), i + 60).replace(/\s+/g, " "), "MAJOR");
  }

  // ═══════════════ H. พักบิล · ด่าน ═══════════════
  console.log("\n── H พักบิล · ด่านกฎหมาย/ต้นทุน (สดทุกครั้ง) ──");
  const send = (ctx: any, unitId: string, runId: string, now = NOW_N, deps: Record<string, unknown> = {}): Promise<any> => fn("sendBillRun")!(ctx, { unitId, runId }, { now: new Date(now), ...deps });
  const sendAll = async (ctx: any, unitId: string, runId: string, now = NOW_N) => {
    const calls: { ms: number; r: any }[] = [];
    for (let i = 0; i < 40; i++) {
      const t0 = Date.now();
      const r = await send(ctx, unitId, runId, now);
      calls.push({ ms: Date.now() - t0, r });
      if (!r?.ok || r.done) break;
    }
    return calls;
  };
  const docsOf = async (unitId: string, docType = "INVOICE") => prisma.accountDocument.findMany({ where: { tenantId: A, refSystemId: unitId, source: "DORM", docType } });
  const evsOf = async (unitId: string) => prisma.outboxEvent.findMany({ where: { type: EV, unitId } });
  let runH = "", mHeld: any = null;
  await T("H-1", "DH: H1 DRAFT · H2 HELD (METER_HIGH ป้ายยังไม่ยืนยัน) · H3 HELD (NO_READING) · billCount 1 · heldCount 2 · ยอดรอบ = H1 เท่านั้น", ["prepareBillRun", "billRunModel"], async () => {
    const r = await prep(cO, DH.u, P_RUN, NOW_N);
    runH = r?.runId ?? "";
    const b = (no: string) => billOf(DH.u, DH.L[no].leaseId);
    const [h1, h2, h3]: any[] = [await b("H1"), await b("H2"), await b("H3")];
    mHeld = await fn("billRunModel")!(cO, { unitId: DH.u, periodKey: P_RUN });
    return [r?.ok === true && r.billCount === 1 && r.heldCount === 2 && r.totalSatang === h1?.totalSatang && h1?.status === "DRAFT" && h1?.totalSatang === 500_000
      && h2?.status === "HELD" && /^METER_HIGH/.test(h2?.holdReason ?? "") && h3?.status === "HELD" && /^NO_READING/.test(h3?.holdReason ?? ""),
      J({ r: { c: r?.billCount, h: r?.heldCount, t: r?.totalSatang }, h1: [h1?.status, h1?.totalSatang], h2: [h2?.status, h2?.holdReason], h3: [h3?.status, h3?.holdReason] })];
  });
  await T("U-11", "จอแถว HELD: H2 data-bill-status=HELD · เหตุผลไทย · ปุ่ม data-release-bill · แถบล่าง \"พักไว้ 2\"", ["billRunModel"], async () => {
    if (!ScreenC) return [false, screenWhy];
    const h = mHeld ? renderScreen(mHeld) : "";
    const r2 = boxes(h, "data-bill-row").find((r) => r.attrs["data-bill-row"] === "H2");
    const t = textOf(r2?.html ?? "");
    return [r2?.attrs["data-bill-status"] === "HELD" && THAI.test(t) && !/METER_HIGH/.test(t) && !!box1(r2?.html ?? "", "data-release-bill") && /พักไว้\s*2/.test(textOf(h)), `"${t.slice(0, 160)}"`];
  }, "MAJOR", true);
  await T("H-2", "ส่ง DH ⇒ done · SENT · ออก 1 ใบ (H1) · held 2 · H2/H3 ไม่มีใบแจ้งหนี้", ["sendBillRun"], async () => {
    const calls = await sendAll(cO, DH.u, runH);
    const last = calls[calls.length - 1]?.r;
    const run = await prisma.dormBillRun.findFirst({ where: { id: runH } });
    const docs = await docsOf(DH.u);
    const h2: any = await billOf(DH.u, DH.L["H2"].leaseId);
    return [last?.ok === true && last.done === true && last.held === 2 && run?.status === "SENT" && docs.length === 1 && !h2?.accountDocumentId, J({ last, status: run?.status, docs: docs.length })];
  });
  await T("H-3", "ปล่อยพัก: H1 ⇒ NOT_HELD · H3 (ยังไม่จด) ⇒ STILL_HELD · ยืนยันป้าย H2 (D.6 ACCEPT) ⇒ releaseHeldBill DRAFT 600,000 ⇒ ส่ง ⇒ ใบที่ 2 · จดเลข H3 แล้วปล่อยได้", ["releaseHeldBill", "sendBillRun", "confirmReading"], async () => {
    const id = async (no: string) => ((await billOf(DH.u, DH.L[no].leaseId)) as any)?.id;
    const a = await fn("releaseHeldBill")!(cO, { unitId: DH.u, billId: await id("H1") });
    const b = await fn("releaseHeldBill")!(cO, { unitId: DH.u, billId: await id("H3") });
    const cf = await fn("confirmReading")!(mCtx, { unitId: DH.u, readingId: DH.RD["H2"], action: "ACCEPT", note: "ตรวจแล้ว เปิดแอร์ทั้งเดือน" });
    const c = await fn("releaseHeldBill")!(cO, { unitId: DH.u, billId: await id("H2") });
    const s = await sendAll(cO, DH.u, runH);
    const docs = await docsOf(DH.u);
    await rd(A, DH.u, DH.M["H3"], P_UTIL, 80);
    const d = await fn("releaseHeldBill")!(cO, { unitId: DH.u, billId: await id("H3") });
    return [failOk(a, "NOT_HELD") && failOk(b, "STILL_HELD") && cf?.ok === true && c?.ok === true && c.status === "DRAFT" && c.totalSatang === 600_000 && s[s.length - 1]?.r?.done === true && docs.length === 2 && d?.ok === true && d.totalSatang === 490_000,
      J({ a: codeOf(a), b: codeOf(b), cf: codeOf(cf), c, send: s.map((x) => codeOf(x.r)), docs: docs.length, d })];
  });
  await T("H-4", "Σ ตอนออกจริง (หนี้ D.7 (5)): DS อัตราคงที่ ฿4.72 บิล ฿944 · ส่ง S1 แล้ว · ปล่อย S2 (150 หน่วย) ⇒ Σ 118,000 > 94,400 ⇒ ส่งไม่ได้ (UTILITY_GATE_BLOCKED/UTIL_TOTAL_EXCEEDS_BILL) · ไม่มีใบ/event ใหม่", ["prepareBillRun", "sendBillRun", "releaseHeldBill"], async () => {
    const r = await prep(cO, DS.u, P_RUN, NOW_N);
    const s1 = await sendAll(cO, DS.u, r?.runId ?? "");
    const cf = await fn("confirmReading")!(mCtx, { unitId: DS.u, readingId: DS.RD["S2"], action: "ACCEPT", note: "ยืนยันเลขจริง" });
    const b2: any = await billOf(DS.u, DS.L["S2"].leaseId);
    const rel = await fn("releaseHeldBill")!(cO, { unitId: DS.u, billId: b2?.id });
    const ev0 = (await evsOf(DS.u)).length;
    const s2 = await send(cO, DS.u, r?.runId ?? "");
    const docs = await docsOf(DS.u);
    const after: any = await billOf(DS.u, DS.L["S2"].leaseId);
    return [r?.ok === true && s1[s1.length - 1]?.r?.done === true && cf?.ok === true && rel?.ok === true && s2?.ok === false && ["UTILITY_GATE_BLOCKED", "UTIL_TOTAL_EXCEEDS_BILL"].includes(s2?.code) && THAI.test(s2?.reason ?? "")
      && docs.length === 1 && !after?.accountDocumentId && (await evsOf(DS.u)).length === ev0, J({ s1: s1.map((x) => codeOf(x.r)), rel: codeOf(rel), s2: codeOf(s2), docs: docs.length })];
  });
  await T("H-5", "STRICT ไม่มีบิลการไฟฟ้า (DG1 อัตราคงที่): เตรียมได้แต่ gate.ok false (UTIL_COST_UNKNOWN) · ส่ง ⇒ UTILITY_GATE_BLOCKED + blocks · ไม่มีใบ/event · รอบยัง DRAFT", ["prepareBillRun", "sendBillRun"], async () => {
    const r = await prep(cO, DG1.u, P_RUN, NOW_N);
    const s = await send(cO, DG1.u, r?.runId ?? "");
    const run = await prisma.dormBillRun.findFirst({ where: { id: r?.runId ?? "" } });
    return [r?.ok === true && r.gate?.ok === false && J(r.gate?.blocks).includes("UTIL_COST_UNKNOWN") && failOk(s, "UTILITY_GATE_BLOCKED") && Array.isArray(s.blocks) && s.blocks.length > 0
      && (await docsOf(DG1.u)).length === 0 && (await evsOf(DG1.u)).length === 0 && run?.status === "DRAFT", J({ gate: r?.gate, s: codeOf(s), run: run?.status })];
  });
  await T("H-6", "WARN ไม่มีบิล (DG2): ส่ง ⇒ UTILITY_GATE_BLOCKED (ต้องยอมรับ) · เจ้าของ acceptUtilityLegalWarn (D.7) ⇒ ส่งได้ 3 ใบ", ["prepareBillRun", "sendBillRun", "acceptUtilityLegalWarn"], async () => {
    const r = await prep(cO, DG2.u, P_RUN, NOW_N);
    const s1 = await send(cO, DG2.u, r?.runId ?? "");
    const need = r?.gate?.needsAcceptance?.[0];
    const acc = await fn("acceptUtilityLegalWarn")!(cO, { unitId: DG2.u, periodKey: P_UTIL, kind: need?.kind ?? "ELEC", buildingId: need?.buildingId ?? DG2.b, reason: "เจ้าของยอมรับอัตราชั่วคราวรอบิลการไฟฟ้ามาถึง" });
    const s2 = await sendAll(cO, DG2.u, r?.runId ?? "");
    return [r?.ok === true && (r.gate?.needsAcceptance ?? []).length > 0 && failOk(s1, "UTILITY_GATE_BLOCKED") && acc?.ok === true && s2[s2.length - 1]?.r?.done === true && (await docsOf(DG2.u)).length === 3,
      J({ need: r?.gate?.needsAcceptance, s1: codeOf(s1), acc: codeOf(acc), s2: s2.map((x) => codeOf(x.r)) })];
  });
  await T("H-7", "RUN_STALE: DT เตรียมแล้วบิลการไฟฟ้าแก้เป็น ฿18,900 (อัตรา 450) ⇒ ส่ง ⇒ RUN_STALE ไม่มีใบ · เตรียมใหม่ changed 2 · ไฟ 450/หน่วย · ส่งได้ ยอดใบ = บิล", ["prepareBillRun", "sendBillRun"], async () => {
    const r = await prep(cO, DT.u, P_RUN, NOW_N);
    await AUTH(DT.u, "ELEC", P_UTIL, 1_890_000, 4200);
    const s1 = await send(cO, DT.u, r?.runId ?? "");
    const d0 = (await docsOf(DT.u)).length;
    const r2 = await prep(cO, DT.u, P_RUN, NOW_N);
    const t1: any = await billOf(DT.u, DT.L["T1"].leaseId);
    const s2 = await sendAll(cO, DT.u, r?.runId ?? "");
    const docs = await docsOf(DT.u);
    const t1b: any = await billOf(DT.u, DT.L["T1"].leaseId);
    const doc = docs.find((d: any) => d.id === t1b?.accountDocumentId);
    return [failOk(s1, "RUN_STALE") && d0 === 0 && r2?.ok === true && r2.changed === 2 && lineOf(t1, "ELEC")?.unitPriceSatang === 450 && lineOf(t1, "ELEC")?.amountSatang === 56_250
      && s2[s2.length - 1]?.r?.done === true && docs.length === 2 && doc?.grandTotal === t1b?.totalSatang, J({ s1: codeOf(s1), d0, changed: r2?.changed, el: lineOf(t1, "ELEC"), s2: s2.map((x) => codeOf(x.r)), docs: docs.length })];
  });
  await T("H-8", "VAT ค่าตั้งหอ ≠ สมุด (DVX) ⇒ VAT_SETTING_MISMATCH · ไม่ผูกสมุด (DNL) ⇒ NOT_LINKED — ไม่มีใบ/event · บิลยัง DRAFT", ["prepareBillRun", "sendBillRun"], async () => {
    const rx = await prep(cO, DVX.u, P_RUN, NOW_N), rn = await prep(cO, DNL.u, P_RUN, NOW_N);
    const sx = await send(cO, DVX.u, rx?.runId ?? ""), sn = await send(cO, DNL.u, rn?.runId ?? "");
    const codeX = sx?.ok === false ? sx.code : (sx?.failed ?? [])[0]?.code, codeN = sn?.ok === false ? sn.code : (sn?.failed ?? [])[0]?.code;
    const drafts = await prisma.dormBill.count({ where: { unitId: { in: [DVX.u, DNL.u] }, status: "DRAFT" } });
    return [codeX === "VAT_SETTING_MISMATCH" && codeN === "NOT_LINKED" && (sx?.sent ?? 0) === 0 && (sn?.sent ?? 0) === 0 && drafts === 6
      && (await prisma.accountDocument.count({ where: { tenantId: A, refSystemId: { in: [DVX.u, DNL.u] } } })) === 0 && (await prisma.outboxEvent.count({ where: { type: EV, unitId: { in: [DVX.u, DNL.u] } } })) === 0,
      J({ sx: codeOf(sx), codeX, sn: codeOf(sn), codeN, drafts })];
  });
  await T("U-10", "จอเมื่อด่านไม่ผ่าน (DG1): data-run-legal level BLOCK · ข้อความไทยของ blocks · ลิงก์ /dorm/settings/utility · ปุ่ม send disabled", ["billRunModel"], async () => {
    if (!ScreenC) return [false, screenWhy];
    const m = await fn("billRunModel")!(cO, { unitId: DG1.u, periodKey: P_RUN });
    const h = m ? renderScreen(m) : "";
    const lg = box1(h, "data-run-legal");
    const sendB = box1(h, "data-run-action", "send");
    return [m?.legal?.ok === false && lg?.attrs["data-level"] === "BLOCK" && THAI.test(textOf(lg?.html ?? "")) && /href="[^"]*\/dorm\/settings\/utility/.test(lg?.html ?? "") && (!sendB || "disabled" in sendB.attrs),
      J({ ok: m?.legal?.ok, level: lg?.attrs["data-level"], send: sendB?.attrs })];
  }, "MAJOR", true);

  // ═══════════════ N. ส่ง DN ═══════════════
  console.log("\n── N ส่งรอบ พ.ย. (DN) · ซ้ำ · พร้อมกัน ──");
  let sendCallsN: { ms: number; r: any }[] = [];
  let sendWallN = -1;
  await T("N-1", "sendBillRun DN จนจบ: 31 บิล SENT · accountDocumentId ไม่ซ้ำ · sentAt · sentVia · รอบ SENT (sentAt) · billCount 31 · ฿174,126.40", ["sendBillRun"], async () => {
    const t0 = Date.now();
    sendCallsN = await sendAll(cO, DN, runN);
    sendWallN = Date.now() - t0;
    const bs = await billsOfRun(runN);
    const run = await prisma.dormBillRun.findFirst({ where: { id: runN } });
    const last = sendCallsN[sendCallsN.length - 1]?.r;
    return [last?.ok === true && last.done === true && bs.length === 31 && bs.every((b: any) => b.status === "SENT" && b.accountDocumentId && b.sentAt && ["LINE", "SMS", "PRINT"].includes(b.sentVia))
      && new Set(bs.map((b: any) => b.accountDocumentId)).size === 31 && run?.status === "SENT" && !!run?.sentAt && run?.billCount === 31 && run?.totalSatang === 17_412_640,
      J({ calls: sendCallsN.map((c) => [codeOf(c.r), c.r?.sent, c.ms]), status: run?.status, bad: bs.filter((b: any) => b.status !== "SENT").length })];
  });
  const billsN = async () => billsOfRun(runN);
  await T("N-2", "ใบแจ้งหนี้: INVOICE · source DORM · refSystemId หน่วย · ref DormBill/<leaseId>:2026-11 · ยอด = บิลทุกใบ · AWAITING_PAYMENT · มีเลขที่ · ออก 26 ต.ค. · ครบกำหนดตามบิล · มีผู้ติดต่อ · Σ 17,412,640", ["sendBillRun"], async () => {
    const bs = await billsN();
    const docs = await prisma.accountDocument.findMany({ where: { id: { in: bs.map((b: any) => b.accountDocumentId).filter(Boolean) } } });
    const bad: string[] = [];
    for (const b of bs) {
      const d: any = docs.find((x: any) => x.id === b.accountDocumentId);
      if (!d || d.docType !== "INVOICE" || d.source !== "DORM" || d.refSystemId !== DN || d.refType !== "DormBill" || d.refId !== `${b.leaseId}:${P_RUN}` || d.grandTotal !== b.totalSatang
        || d.status !== "AWAITING_PAYMENT" || !d.docNo || bkkYmd(d.issueDate) !== "2026-10-26" || bkkYmd(d.dueDate) !== ymdOf(b.dueDate) || !d.contactId) bad.push(`${roomNoOf[b.roomId]}:${J([d?.docType, d?.status, d?.refId, d?.grandTotal, b.totalSatang, bkkYmd(d?.issueDate), bkkYmd(d?.dueDate)])}`);
    }
    const sum = docs.reduce((s: number, d: any) => s + d.grandTotal, 0);
    return [docs.length === 31 && !bad.length && sum === 17_412_640, `${docs.length} ${sum} ${bad.slice(0, 3).join(" | ")}`];
  });
  await T("N-3", "GL สมุดหอ: ลูกหนี้ 1100 สุทธิ = 17,412,640 · ทุกรายการสมุดรายวันของสมุดสมดุล", ["sendBillRun"], async () => {
    const ar = await prisma.accountLedger.findFirst({ where: { systemId: BOOK_N, code: "1100" } });
    const lines = await prisma.accountJournalLine.findMany({ where: { systemId: BOOK_N }, select: { entryId: true, accountId: true, debit: true, credit: true } });
    const arNet = lines.filter((l: any) => l.accountId === ar?.id).reduce((s: number, l: any) => s + l.debit - l.credit, 0);
    const byE = new Map<string, number>();
    for (const l of lines) byE.set(l.entryId, (byE.get(l.entryId) ?? 0) + l.debit - l.credit);
    const unbal = [...byE.values()].filter((v) => v !== 0).length;
    return [arNet === 17_412_640 && !unbal && byE.size > 0, J({ arNet, unbal, entries: byE.size })];
  });
  await T("N-4", "บรรทัดใบแจ้งหนี้ 204 = dormBillInvoiceLines: 4 บรรทัด · ค่าไฟแสดง 125 หน่วย + 4.72 บาท · ค่าน้ำ 6 หน่วย + 16.00 · ค่าห้องยกเว้น VAT (vatRateBp −1)", ["sendBillRun"], async () => {
    const b: any = await billOf(DN, LN["204"].leaseId);
    const ls = await prisma.accountDocumentLine.findMany({ where: { documentId: b?.accountDocumentId ?? "" }, orderBy: { id: "asc" } });
    const de = ls.map((l: any) => String(l.description));
    const el = de.find((d: string) => /ค่าไฟฟ้า/.test(d)) ?? "", wl = de.find((d: string) => /ค่าน้ำ/.test(d)) ?? "", rl: any = ls.find((l: any) => /ค่าห้อง/.test(l.description));
    return [ls.length === 4 && /125/.test(el) && /4\.72/.test(el) && /\b6\b/.test(wl) && /16\.00/.test(wl) && rl?.vatRateBp === -1, J(de)];
  });
  await T("N-5", "ลิงก์จ่าย: ทุกบิลมี paymentRequestId · คำขอ PENDING ยอด = บิล ชี้ใบของบิล · payLinkPending 0", ["sendBillRun"], async () => {
    const bs = await billsN();
    const prs = await prisma.accountPaymentRequest.findMany({ where: { id: { in: bs.map((b: any) => b.paymentRequestId).filter(Boolean) } } });
    const bad = bs.filter((b: any) => { const p: any = prs.find((x: any) => x.id === b.paymentRequestId); return !p || p.amountSatang !== b.totalSatang || p.documentId !== b.accountDocumentId; });
    const pend = sendCallsN.reduce((s, c) => Math.max(s, Number(c.r?.payLinkPending ?? 0)), 0);
    return [bs.length === 31 && !bad.length && sendCallsN[sendCallsN.length - 1]?.r?.payLinkPending === 0, J({ bad: bad.map((b: any) => roomNoOf[b.roomId]).slice(0, 5), prs: prs.length, pend })];
  });
  await T("N-6", "event dorm.billrun.sent: 31 แถว (1/บิล) · key dorm.billrun.sent:<billId> · unitId หน่วย · payload ตรง 6 คีย์ · ยอด = บิล · ไม่มีชื่อ/เบอร์", ["sendBillRun"], async () => {
    const ev = await evsOf(DN);
    const bs = await billsN();
    const KEYS = J(["amountSatang", "billId", "leaseId", "periodKey", "runId", "unitId"]);
    const names = Object.values(NAMES).concat(["ผู้เช่าห้อง"]);
    const bad = ev.filter((e: any) => {
      const p = e.payload ?? {};
      const b: any = bs.find((x: any) => x.id === p.billId);
      return J(Object.keys(p).sort()) !== KEYS || !b || p.amountSatang !== b.totalSatang || p.leaseId !== b.leaseId || p.periodKey !== P_RUN || p.runId !== runN || p.unitId !== DN
        || e.idempotencyKey !== `dorm.billrun.sent:${p.billId}` || names.some((n) => J(p).includes(n)) || /0\d{8,9}/.test(J(p));
    });
    return [ev.length === 31 && new Set(ev.map((e: any) => e.payload?.billId)).size === 31 && !bad.length, J({ n: ev.length, bad: bad.slice(0, 2).map((e: any) => e.payload) })];
  });
  const countsN = async () => ({ docs: (await docsOf(DN)).length, ev: (await evsOf(DN)).length, pr: await prisma.accountPaymentRequest.count({ where: { systemId: BOOK_N } }) });
  await T("N-7", "ส่งซ้ำรอบที่ SENT ⇒ ok done sent 0 · ใบ/event/ลิงก์ไม่เพิ่ม", ["sendBillRun"], async () => {
    const c0 = await countsN();
    const r = await send(cO, DN, runN);
    const c1 = await countsN();
    return [r?.ok === true && r.done === true && r.sent === 0 && J(c0) === J(c1) && c0.docs === 31, J({ r, c0, c1 })];
  });
  const exactlyOne = async (unit: { u: string; L: Record<string, { leaseId: string }> }, book: string) => {
    const docs = await docsOf(unit.u);
    const leases = Object.values(unit.L).map((x) => x.leaseId);
    const perLease = leases.map((l) => docs.filter((d: any) => d.refId === `${l}:${P_RUN}`).length);
    const ev = await evsOf(unit.u);
    const pr = await prisma.accountPaymentRequest.count({ where: { systemId: book } });
    const bills = await prisma.dormBill.findMany({ where: { unitId: unit.u, periodKey: P_RUN } });
    return { ok: docs.length === leases.length && perLease.every((n) => n === 1) && ev.length === leases.length && pr === leases.length && bills.every((b: any) => b.status === "SENT"), docs: docs.length, ev: ev.length, pr, perLease };
  };
  await T("N-8", "X3 กดส่งซ้ำ 10 ทางในโพรเซสเดียว (DC 8 ห้อง) ⇒ ไม่มี throw · แต่ละผล ok หรือ RUN_BUSY · ส่งต่อจนจบ ⇒ ใบ 1/สัญญา · event 8 · ลิงก์ 8", ["sendBillRun"], async () => {
    const runC: any = await prisma.dormBillRun.findFirst({ where: { unitId: DC.u } });
    const rs = await inProc(Array.from({ length: 10 }, () => () => send(cO, DC.u, runC?.id)));
    const fin = await sendAll(cO, DC.u, runC?.id);
    const x = await exactlyOne(DC, BOOK_C);
    return [!badOf(rs).length && fin[fin.length - 1]?.r?.done === true && x.ok, J({ codes: rs.map(codeOf), x })];
  });
  await T("N-9", "X3 4 โพรเซส × 3 (DP 8 ห้อง) ⇒ ใบ 1/สัญญา · event 8 · ลิงก์ 8 · ไม่มี throw", ["sendBillRun"], async () => {
    const runP: any = await prisma.dormBillRun.findFirst({ where: { unitId: DP.u } });
    const rs = await fanout("sendBillRun", cO, Array.from({ length: 12 }, () => ({ unitId: DP.u, runId: runP?.id })), { now: NOW_N });
    const fin = await sendAll(cO, DP.u, runP?.id);
    const x = await exactlyOne(DP, BOOK_P);
    return [!badOf(rs).length && fin[fin.length - 1]?.r?.done === true && x.ok, J({ codes: rs.map(codeOf), x })];
  });
  await T("N-10", "ช่องทาง: ไม่ผูก LINE + มีเบอร์ ⇒ SMS (204) · ไม่มีเบอร์ ⇒ PRINT (305) · โมเดลแถว channel ตรง", ["billRunModel"], async () => {
    const b204: any = await billOf(DN, LN["204"].leaseId), b305: any = await billOf(DN, LN["305"].leaseId);
    const m = await fn("billRunModel")!(cO, { unitId: DN, periodKey: P_RUN });
    const ch = (no: string) => (m?.rows ?? []).find((r: any) => r.roomNumber === no)?.channel;
    return [b204?.sentVia === "SMS" && b305?.sentVia === "PRINT" && ch("204") === "SMS" && ch("305") === "PRINT", J({ v204: b204?.sentVia, v305: b305?.sentVia, m: [ch("204"), ch("305")] })];
  }, "MAJOR");
  await T("N-11", "หลังส่ง: เตรียมซ้ำบนรอบ SENT ⇒ ok added 0 · บิล SENT ไม่ถูกแตะ (updatedAt เดิม) · setBillExtraLines ⇒ BILL_SENT · scheduleBillRun ⇒ RUN_SENT", ["prepareBillRun", "setBillExtraLines", "scheduleBillRun"], async () => {
    const before = await billsN();
    const r = await prep(cO, DN, P_RUN, NOW_N);
    const after = await billsN();
    const moved = after.filter((a: any) => before.find((b: any) => b.id === a.id)?.updatedAt?.getTime() !== a.updatedAt?.getTime()).length;
    const b: any = after.find((x: any) => x.leaseId === LN["204"].leaseId);
    const x = await fn("setBillExtraLines")!(cO, { unitId: DN, billId: b?.id, lines: [FEE_LINE] });
    const s = await fn("scheduleBillRun")!(cO, { unitId: DN, runId: runN, at: "2026-11-01T01:00:00.000Z" }, { now: new Date(NOW_N) });
    return [r?.ok === true && r.added === 0 && !moved && failOk(x, "BILL_SENT") && failOk(s, "RUN_SENT"), J({ r: [codeOf(r), r?.added], moved, x: codeOf(x), s: codeOf(s) })];
  });
  await T("N-12", "VAT (DV): ใบแจ้งหนี้ vatAmount = bill.vatSatang · subTotal = bill.subtotal · grandTotal = bill.total ทุกใบ", ["sendBillRun"], async () => {
    const run: any = await prisma.dormBillRun.findFirst({ where: { unitId: DV } });
    await sendAll(cO, DV, run?.id);
    const bs = await billsOfRun(run?.id);
    const docs = await prisma.accountDocument.findMany({ where: { id: { in: bs.map((b: any) => b.accountDocumentId).filter(Boolean) } } });
    const bad = bs.filter((b: any) => { const d: any = docs.find((x: any) => x.id === b.accountDocumentId); return !d || d.vatAmount !== b.vatSatang || d.subTotal !== b.subtotalSatang || d.grandTotal !== b.totalSatang; });
    return [bs.length === 2 && docs.length === 2 && !bad.length, J({ bs: bs.map((b: any) => [b.totalSatang, b.vatSatang, b.subtotalSatang]), docs: docs.map((d: any) => [d.grandTotal, d.vatAmount, d.subTotal]) })];
  });
  await T("N-13", "ตั้งเวลา: at ในอดีต/ผิดรูป ⇒ INVALID_INPUT · ตั้งได้ ⇒ REVIEW + scheduledSendAt · null ⇒ ยกเลิก กลับ DRAFT (DM ยังไม่ส่ง)", ["prepareBillRun", "scheduleBillRun"], async () => {
    const r = await prep(cO, DM.u, P_RUN, NOW_N);
    const sch = (at: string | null) => fn("scheduleBillRun")!(cO, { unitId: DM.u, runId: r?.runId, at }, { now: new Date(NOW_N) });
    const a = await sch("2026-10-01T00:00:00.000Z"), b = await sch("พรุ่งนี้");
    const c = await sch("2026-11-01T01:00:00.000Z");
    const run1: any = await prisma.dormBillRun.findFirst({ where: { id: r?.runId } });
    const d = await sch(null);
    const run2: any = await prisma.dormBillRun.findFirst({ where: { id: r?.runId } });
    return [failOk(a, "INVALID_INPUT") && failOk(b, "INVALID_INPUT") && c?.ok === true && c.status === "REVIEW" && run1?.status === "REVIEW" && run1?.scheduledSendAt?.toISOString() === "2026-11-01T01:00:00.000Z"
      && d?.ok === true && run2?.status === "DRAFT" && run2?.scheduledSendAt === null, J({ a: codeOf(a), b: codeOf(b), c, run1: [run1?.status, run1?.scheduledSendAt], run2: [run2?.status, run2?.scheduledSendAt] })];
  }, "MAJOR");

  // ═══════════════ A. แก้หลังส่ง ═══════════════
  console.log("\n── A แก้หลังส่ง = ใบลดหนี้/เพิ่มหนี้ ──");
  const adj = (billId: string, kind: string, amount: number, key: string, code = "ELEC", reason = "จดเลขมิเตอร์ผิด ผู้เช่าแจ้งและตรวจแล้ว"): Promise<any> =>
    fn("adjustSentBill")!(cO, { unitId: DN, billId, kind, reason, idempotencyKey: key, lines: [{ code, labelTh: code === "ELEC" ? "ค่าไฟฟ้า (ปรับปรุง)" : "อื่น ๆ", amountSatang: amount }] });
  let b204: any = null, credit1: any = null;
  await T("A-1", "ใบลดหนี้ 204 ฿50 ⇒ CREDIT_NOTE อ้างใบ 204 · ยอด 5,000 · DormBill 204 lines/total ไม่เปลี่ยน (ไม่แก้ทับ)", ["adjustSentBill"], async () => {
    b204 = await billOf(DN, LN["204"].leaseId);
    credit1 = await adj(b204?.id, "CREDIT", 5_000, "k1");
    const d: any = credit1?.ok ? await prisma.accountDocument.findFirst({ where: { id: credit1.docId } }) : null;
    const after: any = await billOf(DN, LN["204"].leaseId);
    return [credit1?.ok === true && credit1.created === true && credit1.totalSatang === 5_000 && d?.docType === "CREDIT_NOTE" && d?.sourceDocId === b204?.accountDocumentId
      && J(after?.lines) === J(b204?.lines) && after?.totalSatang === 548_600 && after?.status === b204?.status, J({ r: codeOf(credit1), d: [d?.docType, d?.sourceDocId === b204?.accountDocumentId], t: after?.totalSatang })];
  });
  await T("A-2", "idempotent: คีย์ k1 ซ้ำ ⇒ ใบเดิม created false · คีย์ k2 ยิง 10 ทางพร้อมกัน ⇒ ใบลดหนี้ใหม่ 1 ใบ · ไม่มี throw", ["adjustSentBill"], async () => {
    const again = await adj(b204?.id, "CREDIT", 5_000, "k1");
    const rs = await inProc(Array.from({ length: 10 }, () => () => adj(b204?.id, "CREDIT", 1_000, "k2")));
    const n = await prisma.accountDocument.count({ where: { tenantId: A, docType: "CREDIT_NOTE", sourceDocId: b204?.accountDocumentId } });
    return [again?.ok === true && again.docId === credit1?.docId && again.created === false && n === 2 && rs.every((r) => r?.ok === true) && new Set(rs.map((r) => r.docId)).size === 1, J({ again: [codeOf(again), again?.created], n, codes: rs.map(codeOf) })];
  });
  await T("A-3", "ใบเพิ่มหนี้ 309 ฿100 ⇒ DEBIT_NOTE อ้างใบ 309 · ยอด 10,000 · บิล 309 ไม่เปลี่ยน", ["adjustSentBill"], async () => {
    const b: any = await billOf(DN, LN["309"].leaseId);
    const r = await adj(b?.id, "DEBIT", 10_000, "d1", "OTHER", "ค่าเปลี่ยนกุญแจที่ผู้เช่าตกลงแล้ว มีใบเสร็จ");
    const d: any = r?.ok ? await prisma.accountDocument.findFirst({ where: { id: r.docId } }) : null;
    const after: any = await billOf(DN, LN["309"].leaseId);
    return [r?.ok === true && r.totalSatang === 10_000 && d?.docType === "DEBIT_NOTE" && d?.sourceDocId === b?.accountDocumentId && after?.totalSatang === 684_064, J({ r: codeOf(r), d: d?.docType })];
  });
  await T("A-4", "ปฏิเสธ (ไม่มีเอกสารเกิด): บิลยังไม่ส่ง (DM) ⇒ NOT_SENT · เหตุผลสั้น ⇒ REASON_REQUIRED · ลดหนี้เกินคงค้าง ⇒ EXCEEDS_REMAINING · ยอด 0 ⇒ INVALID_INPUT", ["adjustSentBill"], async () => {
    const n0 = await prisma.accountDocument.count({ where: { tenantId: A, docType: { in: ["CREDIT_NOTE", "DEBIT_NOTE"] } } });
    const dm: any = await prisma.dormBill.findFirst({ where: { unitId: DM.u } });
    const a = await fn("adjustSentBill")!(cO, { unitId: DM.u, billId: dm?.id, kind: "CREDIT", reason: "แก้ยอดตามที่ตกลงกันแล้ว", idempotencyKey: "x", lines: [{ code: "ELEC", labelTh: "ค่าไฟ", amountSatang: 100 }] });
    const b = await adj(b204?.id, "CREDIT", 1_000, "x2", "ELEC", "ผิด");
    const c = await adj(b204?.id, "CREDIT", 600_000, "x3");
    const d = await adj(b204?.id, "CREDIT", 0, "x4");
    const n1 = await prisma.accountDocument.count({ where: { tenantId: A, docType: { in: ["CREDIT_NOTE", "DEBIT_NOTE"] } } });
    return [failOk(a, "NOT_SENT") && failOk(b, "REASON_REQUIRED") && failOk(c, "EXCEEDS_REMAINING") && failOk(d, "INVALID_INPUT") && n0 === n1, J({ a: codeOf(a), b: codeOf(b), c: codeOf(c), d: codeOf(d), n0, n1 })];
  });
  await T("A-5", "audit dorm.bill.adjusted 3 แถว (k1 · k2 · d1 — ซ้ำ/พร้อมกันไม่เพิ่ม) มี billId · docId", ["adjustSentBill"], async () => {
    const rows = await prisma.auditLog.findMany({ where: { tenantId: A, action: "dorm.bill.adjusted" } });
    return [rows.length === 3 && rows.every((r: any) => r.after?.billId && r.after?.docId), J(rows.map((r: any) => r.after))];
  }, "MAJOR");
  await T("A-6", "billRunModel แถว 204: adjustments CREDIT 5,000 + 1,000 (มีเลขที่) · totalSatang ยังเป็น 548,600", ["billRunModel"], async () => {
    const m = await fn("billRunModel")!(cO, { unitId: DN, periodKey: P_RUN });
    const r = (m?.rows ?? []).find((x: any) => x.roomNumber === "204");
    const a = (r?.adjustments ?? []).map((x: any) => `${x.kind}:${x.totalSatang}`).sort();
    return [J(a) === J(["CREDIT:1000", "CREDIT:5000"]) && (r?.adjustments ?? []).every((x: any) => !!x.docNo) && r?.totalSatang === 548_600, J(r?.adjustments)];
  }, "MAJOR");

  // ═══════════════ F. บิลแรก · เศษวัน · บริการ (DF) ═══════════════
  console.log("\n── F บิลแรก · เศษวัน · ค่าเช่าล่วงหน้า · บริการจาก snapshot · MOVE_IN ──");
  const BOOK_F = await mkBook(A, `บัญชีหอ D8 F ${stamp}`);
  const DF = await mkUnit(A, "DORM", "f");
  await link(A, BOOK_F, DF);
  await U(A, DF, "rooms.utility.water.metering", "NONE"); await U(A, DF, "rooms.utility.elec.method", "FIXED_RATE"); await U(A, DF, "rooms.utility.elec.fixedRate", 400);
  await U(A, DF, "rooms.services.catalog", [{ code: "PARKING", labelTh: "ที่จอดรถ", amountSatang: 50_000, required: true, taxKind: "VAT7" }, { code: "WIFI", labelTh: "อินเทอร์เน็ตเพิ่ม", amountSatang: 20_000, required: false, taxKind: "VAT7" }]);
  await U(A, DF, "rooms.services.extraOccupantFee", 20_000);
  const tyF = await mkType(A, DF, "มาตรฐาน", 450_000), bF = await mkBld(A, DF, "อาคาร F");
  const RF: Record<string, string> = {};
  for (const no of ["F1", "F2", "F3", "F4", "F5", "F6"]) RF[no] = await mkRoom(A, DF, tyF, bF, no);
  const NOSVC = { "rooms.services.catalog": [], "rooms.services.extraOccupantFee": null };
  const LF1 = await mkLease({ tenantId: A, unitId: DF, roomId: RF.F1, roomTypeId: tyF, name: "=HYPERLINK(\"http://x.invalid\",\"x\")",
    coTenants: { occupants: [{ name: "ผู้พักร่วม ก", phone: null }, { name: "ผู้พักร่วม ข", phone: null }], vehicles: [] } });
  const LF2 = await mkLease({ tenantId: A, unitId: DF, roomId: RF.F2, roomTypeId: tyF, name: "เบญจา", start: "2026-11-15", advance: 450_000, patch: NOSVC });
  const LF3 = await mkLease({ tenantId: A, unitId: DF, roomId: RF.F3, roomTypeId: tyF, name: "ผู้เช่า F3", patch: NOSVC });
  await prisma.dormMoveOut.create({ data: { tenantId: A, unitId: DF, leaseId: LF3.leaseId, status: "NOTICE", moveOutDate: dbDate("2026-12-31") } });
  const LF4 = await mkLease({ tenantId: A, unitId: DF, roomId: RF.F4, roomTypeId: tyF, name: "ผู้เช่า F4", booking: 100_000, patch: { ...NOSVC, "rooms.lease.reservationAppliesTo": "FIRST_RENT" } });
  await U(A, DF, "rooms.services.catalog", [{ code: "PARKING", labelTh: "ที่จอดรถ", amountSatang: 70_000, required: true, taxKind: "VAT7" }]); // แก้หลังทำสัญญา
  const MF: Record<string, string> = {};
  for (const [no, s, v] of [["F1", 0, 100], ["F2", 0, 50], ["F3", 0, 80], ["F4", 0, 70], ["F5", 0, 0], ["F6", 0, 0]] as const) { MF[no] = await mkMeter(A, DF, RF[no], "ELEC", s); await rd(A, DF, MF[no], P_UTIL, v); }
  await AUTH(DF, "ELEC", P_UTIL, 500_000, 1000);
  let runF = "";
  await T("F-1", "F1 (ทั้งเดือน): RENT 450,000 · ELEC 100×400 · SERVICE:PARKING 50,000 (snapshot · ไม่ใช่ 70,000 ของค่าตั้งใหม่) · SERVICE:EXTRA_OCCUPANT 40,000 (2 คน × 200) · ไม่มี WIFI (ไม่บังคับ) · ยอด = buildDormBill", ["prepareBillRun"], async () => {
    const r = await prep(cO, DF, P_RUN, NOW_N);
    runF = r?.runId ?? "";
    const b: any = await billOf(DF, LF1.leaseId);
    const e = calc.buildDormBill({ rentSatang: 450_000, commonFeeSatang: 0, electricity: { kind: "METERED", segments: [{ start: 0, end: 100 }], method: { kind: "FIXED_RATE", satangPerUnit: 400 } },
      services: [{ code: "PARKING", labelTh: "ที่จอดรถ", amountSatang: 50_000, taxKind: "VAT7" }, { code: "EXTRA_OCCUPANT", labelTh: "ค่าคนพักเพิ่ม", amountSatang: 40_000 }], vat: NOVAT });
    return [r?.ok === true && b?.totalSatang === e.totalSatang && lineOf(b, "SERVICE:PARKING")?.amountSatang === 50_000 && lineOf(b, "SERVICE:EXTRA_OCCUPANT")?.amountSatang === 40_000
      && !lineOf(b, "SERVICE:WIFI") && lineOf(b, "ELEC")?.amountSatang === 40_000 && !lineOf(b, "SERVICE:ADVANCE_RENT"), J({ r: codeOf(r), t: b?.totalSatang, want: e.totalSatang, codes: (b?.lines ?? []).map((l: any) => `${l.code}:${l.amountSatang}`) })];
  });
  await T("F-2", "F2 บิลแรก เข้า 15 พ.ย.: RENT เศษวัน 16/30 = 240,000 (ACTUAL_DAYS ของ snapshot) · SERVICE:ADVANCE_RENT 450,000 EXEMPT · ไม่มีน้ำไฟ (ไม่ได้อยู่ ต.ค.) · F3 ย้ายออก 31 ธ.ค. ⇒ บิล พ.ย. ปกติ", ["prepareBillRun"], async () => {
    const b2: any = await billOf(DF, LF2.leaseId), b3: any = await billOf(DF, LF3.leaseId);
    const adv = lineOf(b2, "SERVICE:ADVANCE_RENT");
    return [lineOf(b2, "RENT")?.amountSatang === 240_000 && adv?.amountSatang === 450_000 && adv?.taxKind !== "VAT7" && !lineOf(b2, "ELEC") && b2?.totalSatang === 690_000 && b3?.status === "DRAFT" && b3?.totalSatang === 482_000,
      J({ b2: (b2?.lines ?? []).map((l: any) => `${l.code}:${l.amountSatang}:${l.taxKind}`), b3: [b3?.status, b3?.totalSatang] })];
  });
  await T("F-3", "F4 snapshot FIRST_RENT + เงินจอง ⇒ บิลแรก HELD รหัส BOOKING_FEE_FIRST_RENT (ไม่เงียบ)", ["prepareBillRun"], async () => {
    const b: any = await billOf(DF, LF4.leaseId);
    return [b?.status === "HELD" && /^BOOKING_FEE_FIRST_RENT/.test(b?.holdReason ?? ""), J([b?.status, b?.holdReason])];
  }, "MAJOR");
  let LF5: { leaseId: string } = { leaseId: "" };
  await T("F-4", "ส่งรอบ พ.ย. (DF) แล้วย้ายเข้าใหม่ F5 (20 พ.ย.) ⇒ เตรียมบนรอบ SENT: added 1 · บิล SENT เดิมไม่ถูกแตะ · F5 RENT 11/30 = 165,000 · ส่งเพิ่ม sent 1", ["prepareBillRun", "sendBillRun"], async () => {
    const s1 = await sendAll(cO, DF, runF);
    LF5 = await mkLease({ tenantId: A, unitId: DF, roomId: RF.F5, roomTypeId: tyF, name: "ผู้เช่า F5", start: "2026-11-20", patch: NOSVC });
    const before = (await billsOfRun(runF)).filter((b: any) => b.status === "SENT");
    const r = await prep(cO, DF, P_RUN, NOW_ADD);
    const after = await billsOfRun(runF);
    const moved = before.filter((b: any) => after.find((a: any) => a.id === b.id)?.updatedAt?.getTime() !== b.updatedAt?.getTime()).length;
    const b5: any = after.find((b: any) => b.leaseId === LF5.leaseId);
    const s2 = await send(cO, DF, runF, NOW_ADD);
    const b5s: any = await billOf(DF, LF5.leaseId);
    return [s1[s1.length - 1]?.r?.done === true && before.length === 3 && r?.ok === true && r.added === 1 && !moved && lineOf(b5, "RENT")?.amountSatang === 165_000 && s2?.ok === true && s2.sent === 1 && b5s?.status === "SENT",
      J({ s1: s1.map((x) => codeOf(x.r)), sent: before.length, r: [codeOf(r), r?.added], moved, rent: lineOf(b5, "RENT")?.amountSatang, s2: [codeOf(s2), s2?.sent] })];
  });
  await T("F-5", "รอบ ธ.ค. (now 25 พ.ย. · น้ำไฟ พ.ย.): F2 ไม่มี ADVANCE_RENT (ไม่ใช่บิลแรก) · RENT เต็ม · ไฟจาก MOVE_IN 60→160 = 100 หน่วย (ไม่ใช่ 110) · F6 เข้า 10 ธ.ค. DIV_30 ⇒ 330,000 · F3 ย้ายออก 31 ธ.ค. ⇒ SKIPPED MOVE_OUT", ["prepareBillRun"], async () => {
    await prisma.dormMeterReading.create({ data: { tenantId: A, unitId: DF, meterId: MF.F2, leaseId: LF2.leaseId, periodKey: "2026-11", kind: "MOVE_IN", value: 60, source: "MANUAL", readAt: new Date("2026-11-15T03:00:00.000Z") } });
    for (const [no, v] of [["F1", 190], ["F2", 160], ["F3", 150], ["F4", 100], ["F5", 30]] as const) await rd(A, DF, MF[no], "2026-11", v);
    await AUTH(DF, "ELEC", "2026-11", 500_000, 1000);
    const LF6 = await mkLease({ tenantId: A, unitId: DF, roomId: RF.F6, roomTypeId: tyF, name: "ผู้เช่า F6", start: "2026-12-10", patch: { ...NOSVC, "rooms.billing.prorate": "DIV_30" } });
    const r = await prep(cO, DF, P_DEC, NOW_DEC);
    const b2: any = await billOf(DF, LF2.leaseId, P_DEC), b6: any = await billOf(DF, LF6.leaseId, P_DEC), b3: any = await billOf(DF, LF3.leaseId, P_DEC);
    const el = lineOf(b2, "ELEC");
    return [r?.ok === true && !lineOf(b2, "SERVICE:ADVANCE_RENT") && lineOf(b2, "RENT")?.amountSatang === 450_000 && el?.qty === 100 && el?.amountSatang === 40_000
      && lineOf(b6, "RENT")?.amountSatang === 330_000 && !b3 && (r.skipped ?? []).some((s: any) => s.leaseId === LF3.leaseId && s.reason === "MOVE_OUT"),
      J({ r: codeOf(r), b2: (b2?.lines ?? []).map((l: any) => `${l.code}:${l.qty}:${l.amountSatang}`), b6: lineOf(b6, "RENT")?.amountSatang, b3: !!b3, skipped: r?.skipped })];
  });

  // ═══════════════ C. CSV ═══════════════
  console.log("\n── C ส่งออก CSV ──");
  await T("C-1", "billRunCsv DN: หัว + 31 แถว (ไม่รวม 207) · แถว 204 มียอด 5486 (เงินเป็นตัวเลขบาท)", ["billRunCsv"], async () => {
    const csv = await fn("billRunCsv")!(cO, { unitId: DN, runId: runN });
    const lines = String(csv ?? "").split(/\r?\n/).filter((l) => l.trim());
    const r204 = lines.find((l) => /(^|,)"?204"?(,|$)/.test(l)) ?? "";
    return [typeof csv === "string" && lines.length === 32 && /5486(\.0+)?(,|$)/.test(r204) && !lines.some((l) => /(^|,)"?207"?,/.test(l)), J({ n: lines.length, head: lines[0], r204 })];
  }, "MAJOR");
  await T("C-2", "X6 ชื่อผู้เช่า =HYPERLINK(...) ถูกกันสูตร (ขึ้นต้น ') · ไม่มีช่องใดขึ้นต้นด้วย = ดิบ", ["billRunCsv"], async () => {
    const csv = String((await fn("billRunCsv")!(cO, { unitId: DF, runId: runF })) ?? "");
    const raw = /(^|,)=|(^|,)"=/m.test(csv);
    return [csv.includes("'=HYPERLINK") && !raw, csv.split("\n").find((l) => l.includes("HYPERLINK")) ?? "ไม่มีแถว"];
  }, "MAJOR");

  // ═══════════════ X. ข้ามร้าน · สิทธิ์สด ═══════════════
  console.log("\n── X ข้ามร้าน/ข้ามหน่วย · สิทธิ์ (Membership สด) ──");
  const runsN0 = await prisma.dormBillRun.count({ where: { tenantId: A } });
  await T("X-1", "ร้าน B เตรียม/ส่ง/ตั้งเวลา บนหน่วย/รอบของร้าน A ⇒ NOT_FOUND ทุกตัว · ไม่มีรอบใหม่", ["prepareBillRun", "sendBillRun", "scheduleBillRun"], async () => {
    const a = await prep(cB, DN, P_DEC, NOW_DEC);
    const b = await send(cB, DN, runN);
    const c = await fn("scheduleBillRun")!(cB, { unitId: DN, runId: runN, at: "2026-12-01T01:00:00.000Z" }, { now: new Date(NOW_DEC) });
    return [failOk(a, "NOT_FOUND") && failOk(b, "NOT_FOUND") && failOk(c, "NOT_FOUND") && (await prisma.dormBillRun.count({ where: { tenantId: A } })) === runsN0, J([codeOf(a), codeOf(b), codeOf(c)])];
  });
  await T("X-2", "ร้าน B อ่าน: billRunModel ⇒ null · getBill ⇒ null · billRunCsv ⇒ null · meterEstimates ⇒ {}", ["billRunModel", "getBill", "billRunCsv", "meterEstimates"], async () => {
    const m = await fn("billRunModel")!(cB, { unitId: DN, periodKey: P_RUN });
    const g = await fn("getBill")!(cB, { unitId: DN, billId: b204?.id });
    const c = await fn("billRunCsv")!(cB, { unitId: DN, runId: runN });
    const e = await fn("meterEstimates")!(cB, { unitId: DN, periodKey: P_UTIL });
    return [m === null && g === null && c === null && !!e && Object.keys(e).length === 0, J({ m: !!m, g: !!g, c: !!c, e })];
  });
  await T("X-3", "ร้าน B ใบลดหนี้บนบิลร้าน A ⇒ NOT_FOUND · เจ้าของ A ใช้ billId ของหน่วยอื่น (DN บิล + unitId DH) ⇒ NOT_FOUND · ไม่มีเอกสาร", ["adjustSentBill", "getBill"], async () => {
    const n0 = await prisma.accountDocument.count({ where: { tenantId: A, docType: "CREDIT_NOTE" } });
    const a = await fn("adjustSentBill")!(cB, { unitId: DN, billId: b204?.id, kind: "CREDIT", reason: "ทดสอบข้ามร้านเท่านั้น ห้ามผ่าน", idempotencyKey: "xb", lines: [{ code: "ELEC", labelTh: "x", amountSatang: 100 }] });
    const b = await fn("adjustSentBill")!(cO, { unitId: DH.u, billId: b204?.id, kind: "CREDIT", reason: "ทดสอบข้ามหน่วยเท่านั้น ห้ามผ่าน", idempotencyKey: "xu", lines: [{ code: "ELEC", labelTh: "x", amountSatang: 100 }] });
    const g = await fn("getBill")!(cO, { unitId: DH.u, billId: b204?.id });
    return [failOk(a, "NOT_FOUND") && failOk(b, "NOT_FOUND") && g === null && (await prisma.accountDocument.count({ where: { tenantId: A, docType: "CREDIT_NOTE" } })) === n0, J([codeOf(a), codeOf(b), !!g])];
  });
  await T("X-4", "หน่วยโรงแรม ⇒ prepare NOT_FOUND · model null", ["prepareBillRun", "billRunModel"], async () => {
    const a = await prep(cO, HB, P_RUN, NOW_N);
    const m = await fn("billRunModel")!(cO, { unitId: HB, periodKey: P_RUN });
    return [failOk(a, "NOT_FOUND") && m === null, J([codeOf(a), !!m])];
  });
  await T("X-5", "สิทธิ์: dorm.view ⇒ เตรียม/ส่ง NOT_FOUND · dorm.bill.run ⇒ เตรียมได้ (DN ธ.ค.) แต่ส่ง/ลดหนี้ NOT_FOUND · คนจดมิเตอร์ ⇒ model null · สิทธิ์หน่วยอื่น ⇒ NOT_FOUND", ["prepareBillRun", "sendBillRun", "billRunModel", "adjustSentBill"], async () => {
    const v1 = await prep(cV, DN, P_DEC, NOW_DEC);
    const v2 = await send(cV, DN, runN);
    const r1 = await prep(cR, DN, P_DEC, NOW_DEC);
    const r2 = await send(cR, DN, r1?.runId ?? runN, NOW_DEC);
    const r3 = await fn("adjustSentBill")!(cR, { unitId: DN, billId: b204?.id, kind: "CREDIT", reason: "ผู้ไม่มีสิทธิ์ส่งพยายามลดหนี้", idempotencyKey: "xr", lines: [{ code: "ELEC", labelTh: "x", amountSatang: 100 }] });
    const m = await fn("billRunModel")!(cM, { unitId: DN, periodKey: P_RUN });
    const o = await prep({ tenantId: A, actorUserId: STO.id }, DN, P_DEC, NOW_DEC);
    return [failOk(v1, "NOT_FOUND") && failOk(v2, "NOT_FOUND") && r1?.ok === true && failOk(r2, "NOT_FOUND") && failOk(r3, "NOT_FOUND") && m === null && failOk(o, "NOT_FOUND"),
      J({ v1: codeOf(v1), v2: codeOf(v2), r1: codeOf(r1), r2: codeOf(r2), r3: codeOf(r3), m: !!m, o: codeOf(o) })];
  });
  await T("X-6", "Membership ยังไม่ตอบรับ (acceptedAt null · ผู้จัดการ) ⇒ NOT_FOUND / null", ["prepareBillRun", "billRunModel"], async () => {
    const cx = { tenantId: A, actorUserId: MGRX.id };
    const a = await prep(cx, DH.u, P_DEC, NOW_DEC);
    const m = await fn("billRunModel")!(cx, { unitId: DN, periodKey: P_RUN });
    return [failOk(a, "NOT_FOUND") && m === null, J([codeOf(a), !!m])];
  });

  // ═══════════════ J. งานตามเวลา (ร้าน C) ═══════════════
  console.log("\n── J งานตามเวลา dorm.billing (X5) ──");
  const BOOK_J = await mkBook(C, `บัญชีหอ D8 J ${stamp}`);
  const cUnit = async (tag: string, readings: (number | null)[], autoSend: boolean) => {
    const u = await mkUnit(C, "DORM", tag);
    await link(C, BOOK_J, u);
    await setVal(C, "rooms.utility.water.metering", "UNIT", u, "NONE");
    if (autoSend) await setVal(C, "rooms.billing.autoSend", "UNIT", u, true);
    const ty = await mkType(C, u, "มาตรฐาน", 450_000), b = await mkBld(C, u, `อาคาร ${tag}`);
    const L: string[] = [];
    for (const [i, v] of readings.entries()) {
      const r = await mkRoom(C, u, ty, b, `${tag.toUpperCase()}${i + 1}`);
      L.push((await mkLease({ tenantId: C, unitId: u, roomId: r, roomTypeId: ty, name: `ผู้เช่า ${tag}${i + 1}` })).leaseId);
      const m = (await prisma.dormMeter.create({ data: { tenantId: C, unitId: u, roomId: r, kind: "ELEC", role: "ROOM", startReading: 0 } })).id;
      if (v !== null) await prisma.dormMeterReading.create({ data: { tenantId: C, unitId: u, meterId: m, periodKey: P_UTIL, kind: "PERIOD", value: v, source: "IMPORT", readAt: READ_AT(P_UTIL) } });
    }
    await AUTH(u, "ELEC", P_UTIL, 500_000, 1000, cC);
    return { u, L };
  };
  const DJ = await cUnit("j", [100, 110, 120], true);
  const DK = await cUnit("k", [100, 110, null], false);
  const job = (iso: string) => fn("runDormBillingJobs")!(new Date(iso), { tenantId: C });
  const docsC = async (u: string) => prisma.accountDocument.count({ where: { tenantId: C, refSystemId: u, docType: "INVOICE" } });
  await T("J-1", "23 ต.ค. (ก่อนวันออกบิล 25): DJ มิเตอร์ครบ + autoSend ⇒ เตรียม+ส่ง 3 ใบ · DK ยังจดไม่ครบ ⇒ ไม่มีรอบ", ["runDormBillingJobs"], async () => {
    const r = await job("2026-10-23T02:00:00.000Z");
    const rj = await prisma.dormBillRun.findFirst({ where: { unitId: DJ.u, periodKey: P_RUN } });
    const rk = await prisma.dormBillRun.count({ where: { unitId: DK.u } });
    return [rj?.status === "SENT" && (await docsC(DJ.u)) === 3 && rk === 0, J({ r, rj: rj?.status, docs: await docsC(DJ.u), rk })];
  });
  await T("J-2", "25 ต.ค. งานซ้อน 2 รอบพร้อมกัน ⇒ DK รอบเดียว DRAFT (autoSend ปิด) · บิล 2 DRAFT + 1 HELD NO_READING · DJ ใบยัง 3", ["runDormBillingJobs"], async () => {
    const rs = await inProc([() => job("2026-10-25T02:00:00.000Z"), () => job("2026-10-25T02:00:30.000Z")]);
    const runs = await prisma.dormBillRun.findMany({ where: { unitId: DK.u } });
    const bills = await prisma.dormBill.findMany({ where: { unitId: DK.u } });
    return [!rs.some((r) => r?.threw) && runs.length === 1 && runs[0].status === "DRAFT" && bills.filter((b: any) => b.status === "DRAFT").length === 2 && bills.filter((b: any) => b.status === "HELD").length === 1
      && (await docsC(DK.u)) === 0 && (await docsC(DJ.u)) === 3, J({ rs, runs: runs.map((r: any) => r.status), bills: bills.map((b: any) => b.status) })];
  });
  await T("J-3", "ตั้งส่ง DK 26 ต.ค. 08:00 ⇒ งาน 07:30 ไม่ส่ง · งานซ้อน 2 รอบ 08:05 ⇒ ส่ง 2 ใบพอดี · รอบ SENT · HELD ค้าง", ["scheduleBillRun", "runDormBillingJobs"], async () => {
    const run: any = await prisma.dormBillRun.findFirst({ where: { unitId: DK.u } });
    const s = await fn("scheduleBillRun")!(cC, { unitId: DK.u, runId: run?.id, at: "2026-10-26T01:00:00.000Z" }, { now: new Date("2026-10-25T03:00:00.000Z") });
    await job("2026-10-26T00:30:00.000Z");
    const d0 = await docsC(DK.u);
    const rs = await inProc([() => job("2026-10-26T01:05:00.000Z"), () => job("2026-10-26T01:05:20.000Z")]);
    const after: any = await prisma.dormBillRun.findFirst({ where: { id: run?.id } });
    return [s?.ok === true && d0 === 0 && !rs.some((r) => r?.threw) && (await docsC(DK.u)) === 2 && after?.status === "SENT" && (await prisma.dormBill.count({ where: { unitId: DK.u, status: "HELD" } })) === 1,
      J({ s: codeOf(s), d0, docs: await docsC(DK.u), status: after?.status })];
  });

  // ═══════════════ P. perf ═══════════════
  console.log(`\n── P perf (เตรียม ${PERF_PREPARE_36_MS} ms · ต่อการเรียก ${PERF_CALL_MS} ms · ส่ง 31 ใบ ≤ ${PERF_SEND_31_TOTAL_MS} ms · ฉาก ${PERF_ROOMS} ห้อง) ──`);
  chk("P-1", `เตรียมรอบ DN 36 ห้อง (R-1) < ${PERF_PREPARE_36_MS} ms`, prepMs >= 0 && prepMs < PERF_PREPARE_36_MS, `${prepMs} ms`, "MAJOR");
  {
    const maxCall = sendCallsN.reduce((m, c) => Math.max(m, c.ms), 0);
    const sent = sendCallsN.reduce((s, c) => s + Number(c.r?.sent ?? 0), 0);
    chk("P-2", `ส่ง DN 31 บิล: ทุกการเรียก ≤ ${PERF_CALL_MS} ms · รวม ≤ ${PERF_SEND_31_TOTAL_MS} ms`, sendCallsN.length > 0 && sent === 31 && maxCall <= PERF_CALL_MS && sendWallN <= PERF_SEND_31_TOTAL_MS,
      `calls=${sendCallsN.length} max=${maxCall} ms รวม=${sendWallN} ms ≈ ${sent ? Math.round(sendWallN / sent) : "-"} ms/ใบ`, "MAJOR");
  }
  // ฉาก P-3 (สร้างนอกข้อ — ฉากพังต้องเห็นเป็น CRASH ไม่ใช่ซ่อนใต้ FAIL ของฟังก์ชันที่ยังไม่มี)
  const Zfx = await (async () => {
    const BOOK_300 = await mkBook(A, `บัญชีหอ D8 300 ${stamp}`);
    const u = await mkUnit(A, "DORM", "z");
    await link(A, BOOK_300, u);
    await U(A, u, "rooms.utility.water.metering", "NONE");
    const ty = await mkType(A, u, "มาตรฐาน", 450_000), b = await mkBld(A, u, "อาคาร Z");
    const ids = Array.from({ length: PERF_ROOMS }, (_, i) => ({ room: `qc-d8-z-r-${stamp}-${i}`, party: `qc-d8-z-p-${stamp}-${i}`, lease: `qc-d8-z-l-${stamp}-${i}`, occ: `qc-d8-z-o-${stamp}-${i}`, meter: `qc-d8-z-m-${stamp}-${i}` }));
    await prisma.hotelRoom.createMany({ data: ids.map((x, i) => ({ id: x.room, tenantId: A, unitId: u, roomTypeId: ty, number: `Z${String(i + 1).padStart(3, "0")}`, buildingId: b, floorNo: 1 + Math.floor(i / 30), floor: String(1 + Math.floor(i / 30)) })) });
    await prisma.party.createMany({ data: ids.map((x, i) => ({ id: x.party, tenantId: A, name: `ผู้เช่า Z${i + 1}`, phone: newPhone() })) });
    const sp = await snap(A, u, ty, ids[0].room);
    await prisma.dormLease.createMany({ data: ids.map((x) => ({ id: x.lease, tenantId: A, unitId: u, roomId: x.room, partyId: x.party, status: "ACTIVE", startDate: dbDate("2026-01-01"), endDate: dbDate("2027-03-31"),
      rentSatang: 450_000, commonFeeSatang: 30_000, occupancyId: x.occ, policySnapshot: sp, signedAt: new Date(), createdById: "qc-d8", coTenants: { occupants: [], vehicles: [] } })) });
    await prisma.roomOccupancy.createMany({ data: ids.map((x) => ({ id: x.occ, tenantId: A, unitId: u, roomId: x.room, startDate: dbDate("2026-01-01"), endDate: dbDate("2027-04-01"), kind: "LEASE", refType: "DormLease", refId: x.lease })) });
    await prisma.dormMeter.createMany({ data: ids.map((x) => ({ id: x.meter, tenantId: A, unitId: u, roomId: x.room, kind: "ELEC", role: "ROOM", startReading: 0 })) });
    await prisma.dormMeterReading.createMany({ data: ids.map((x) => ({ tenantId: A, unitId: u, meterId: x.meter, periodKey: P_UTIL, kind: "PERIOD", value: 100, source: "IMPORT", readAt: READ_AT(P_UTIL) })) });
    await AUTH(u, "ELEC", P_UTIL, PERF_ROOMS * 100 * 500, PERF_ROOMS * 100);
    return { u };
  })();
  await T("P-3", `${PERF_ROOMS} ห้อง: เตรียม < ${PERF_PREPARE_300_MS} ms · ส่งเป็นชุด (ทุกการเรียก ≤ ${PERF_CALL_MS} ms · done:false แล้วเรียกต่อ) + 2 โพรเซสยิงซ้อนกลางทาง ⇒ ใบแจ้งหนี้ = ${PERF_ROOMS} พอดี (1/สัญญา) · event ${PERF_ROOMS}`, ["prepareBillRun", "sendBillRun"], async () => {
    const u = Zfx.u;
    const t0 = Date.now();
    const r = await prep(cO, u, P_RUN, NOW_N);
    const pms = Date.now() - t0;
    const calls: number[] = [];
    let last: any = null, child: any[] = [];
    const tS = Date.now();
    for (let i = 0; i < 80; i++) {
      const c0 = Date.now();
      if (i === 1) {
        const [mine, ch] = await Promise.all([send(cO, u, r?.runId), fanout("sendBillRun", cO, [{ unitId: u, runId: r?.runId }, { unitId: u, runId: r?.runId }], { now: NOW_N }, 2)]);
        last = mine; child = ch;
      } else last = await send(cO, u, r?.runId);
      calls.push(Date.now() - c0);
      if (!last?.ok || last.done) break;
    }
    const wall = Date.now() - tS;
    const docs = await prisma.accountDocument.findMany({ where: { tenantId: A, refSystemId: u, docType: "INVOICE" }, select: { refId: true } });
    const ev = await prisma.outboxEvent.count({ where: { type: EV, unitId: u } });
    const childMax = child.reduce((m, c) => Math.max(m, Number(c?.__ms ?? 0)), 0);
    const maxCall = Math.max(...calls, childMax);
    return [r?.ok === true && r.billCount === PERF_ROOMS && pms < PERF_PREPARE_300_MS && last?.ok === true && last.done === true && maxCall <= PERF_CALL_MS && calls.length >= 2
      && docs.length === PERF_ROOMS && new Set(docs.map((d: any) => d.refId)).size === PERF_ROOMS && ev === PERF_ROOMS && !badOf(child).length,
      J({ prepare: pms, calls, childMs: child.map((c) => [codeOf(c), c?.__ms]), wall, perBill: Math.round(wall / PERF_ROOMS), docs: docs.length, ev, payLinkPending: last?.payLinkPending })];
  }, "MAJOR");
  await T("P-4", "X5 ทำต่อได้: DM maxBills 2 ⇒ done false · sent 2 · remaining 4 · เรียกต่อ maxBills 2 ⇒ sent 2 · เรียกต่อ ⇒ done · ใบ 6 พอดี", ["sendBillRun"], async () => {
    const run: any = await prisma.dormBillRun.findFirst({ where: { unitId: DM.u } });
    const a = await send(cO, DM.u, run?.id, NOW_N, { maxBills: 2 });
    const b = await send(cO, DM.u, run?.id, NOW_N, { maxBills: 2 });
    const c = await sendAll(cO, DM.u, run?.id);
    const x = await exactlyOne(DM, BOOK_M);
    return [a?.ok === true && a.done === false && a.sent === 2 && a.remaining === 4 && b?.ok === true && b.sent === 2 && b.remaining === 2 && c[c.length - 1]?.r?.done === true && x.ok,
      J({ a: [a?.done, a?.sent, a?.remaining], b: [b?.sent, b?.remaining], c: c.map((y) => codeOf(y.r)), x })];
  }, "CRITICAL");

  // ═══════════════ Q. ฉาก svcqc ═══════════════
  console.log("\n── Q ฉากรอบบิล (svcqc · บ้านสวนอพาร์ตเมนต์) ──");
  {
    const svcT = SV?.SQC_TENANT?.id as string | undefined, svcDorm = SV?.SQC_UNITS?.dorm?.id as string | undefined;
    const bkkMonth = (k: number) => { const t = bkkYmd(new Date()); const y = Number(t.slice(0, 4)), m = Number(t.slice(5, 7)) - 1 + k; return `${y + Math.floor(m / 12)}-${String((((m % 12) + 12) % 12) + 1).padStart(2, "0")}`; };
    const PQ = bkkMonth(0), PQU = bkkMonth(-1);
    const ready = svcT && svcDorm ? {
      rooms: await prisma.hotelRoom.count({ where: { tenantId: svcT, unitId: svcDorm } }),
      leases: await prisma.dormLease.count({ where: { tenantId: svcT, unitId: svcDorm, status: "ACTIVE" } }),
      auth: await prisma.dormUtilityRate.count({ where: { tenantId: svcT, unitId: svcDorm, periodKey: PQU, authorityBillSatang: { not: null } } }),
    } : null;
    const runTsx = (file: string, args: string[] = []) => {
      const r = spawnSync("pnpm", ["exec", "tsx", file, ...args], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
      const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
      const m = /SCENE_SUMMARY (\{.*\})/.exec(out);
      let sum: any = null;
      try { sum = m ? JSON.parse(m[1]) : null; } catch { /* อ่านไม่ได้ */ }
      return { status: r.status, out, sum };
    };
    if (!ready || ready.rooms !== 36 || ready.leases !== 31 || ready.auth < 1) {
      for (const [id, n] of [["Q-1", "ฉากรันได้"], ["Q-2", "โมเดลฉาก"], ["Q-3", "รันซ้ำไม่เขียน"]]) skip(id, n, `ร้าน svcqc ยังไม่พร้อม ${J(ready)} — seed-svc-qc + ฉาก roomboard → lease → meter → utility ก่อน`, "MAJOR");
    } else {
      await T("Q-1", "ฉากรอบบิลรันได้ (exit 0) · พิมพ์ SCENE_SUMMARY {created,updated,removed}", [], async () => {
        if (!existsSync(join(ROOT, F.scene))) return [false, `ยังไม่มี ${F.scene}`];
        const r = runTsx(F.scene);
        return [r.status === 0 && !!r.sum && ["created", "updated", "removed"].every((k) => typeof r.sum[k] === "number"), `exit=${r.status} ${r.sum ? J(r.sum) : r.out.split("\n").slice(-4).join(" | ").slice(0, 240)}`];
      }, "MAJOR");
      await T("Q-2", `billRunModel svcqc (เจ้าของ · ${PQ}): DRAFT · 31 บิล · ค่าห้อง 14,370,000 · ค่าปรับ 40,000 (203/211) · พัก 0`, ["billRunModel"], async () => {
        const ou = (SV.SQC_USERS ?? []).find((u: any) => u.key === "owner");
        const m = await fn("billRunModel")!({ tenantId: svcT, actorUserId: ou?.userId }, { unitId: svcDorm, periodKey: PQ });
        return [m?.status === "DRAFT" && m?.kpi?.billCount === 31 && m?.kpi?.rentSatang === 14_370_000 && m?.kpi?.lateFeeSatang === 40_000 && m?.counts?.held === 0, J({ status: m?.status, kpi: m?.kpi, counts: m?.counts })];
      }, "MAJOR");
      await T("Q-3", "รันฉากซ้ำ ⇒ SCENE_SUMMARY 0/0/0", [], async () => {
        if (!existsSync(join(ROOT, F.scene))) return [false, `ยังไม่มี ${F.scene}`];
        const r = runTsx(F.scene);
        return [r.status === 0 && r.sum?.created === 0 && r.sum?.updated === 0 && r.sum?.removed === 0, `exit=${r.status} ${J(r.sum)}`];
      }, "MAJOR");
    }
  }

  // ═══════════════ V. ภาพ ═══════════════
  console.log("\n── V ภาพ ออกบิลรอบเดือน (ภาพ หอ 04) ──");
  {
    const specs = SV?.SQC_VISUAL_SPECS?.["d.8"];
    const base = process.env.QC_BASE ?? "";
    for (const [id, user] of [["V-1", "owner"], ["V-2", "fai"]] as const) {
      const name = `ภาพ dorm-billing-run 1440 + 390 ด้วยผู้ใช้ ${user}${user === "fai" ? " (ดูอย่างเดียว · ไม่มีปุ่มส่ง)" : ""} · HTTP < 400 · ไม่ล้นแนวนอน`;
      if (!Array.isArray(specs) || !specs.length) fail(id, name, `ไม่มี SQC_VISUAL_SPECS d.8 ${J(specs)}`, "MAJOR");
      else if (!base) skip(id, name, "ไม่มี QC_BASE — ผู้คุม build QC ผ่าน iso + reseed + รันฉาก (roomboard→lease→meter→utility→billing) แล้วรันซ้ำด้วย QC_BASE=http://127.0.0.1:<port>", "MAJOR");
      else {
        const r = spawnSync("pnpm", ["exec", "tsx", "scripts/visual-svc.mts", "d.8", "--user", user, "--base", base], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
        const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
        if (r.status === 0) pass(id, `${name} (ภาพ .qc-shots/svc/d.8 — ผู้คุมเทียบ PARITY กับ ledger/design-dorm/04-billing-run.png)`);
        else fail(id, name, `exit=${r.status} ${out.split("\n").filter((l) => l.includes("❌")).slice(0, 3).join(" | ").slice(0, 300)}`, "MAJOR");
      }
    }
  }
  pendingAtOldG = await pendingOutbox(tenantIds);
  console.log(`\n  (G order) outbox PENDING ก่อนล้าง: ทั้งฐาน ${pendingAtOldG.all} · ของร้านทดสอบนี้ ${pendingAtOldG.mine}`);
} catch (e) {
  fail("CRASH", "จบกลางทาง", errMsg(e), "CRITICAL");
} finally {
  try { await cleanup(tenantIds); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); }
  try { await prisma.user.deleteMany({ where: { email: { startsWith: "svc-d8-" } } }); } catch (e) { console.log(`  ⚠️ cleanup users: ${errMsg(e)}`); }
  try {
    const left = await leftovers(tenantIds);
    if (!left.length) pass("Z-1", `ล้างครบ: ทุกตารางที่มี tenantId ของร้านทดสอบ ${tenantIds.length} ร้าน + ผู้ใช้ svc-d8-* = 0 แถว (ฉาก svcqc คงไว้ให้ถ่ายภาพ — ล้างด้วย scripts/svc-qc-billing-scene.mts --clear)`);
    else fail("Z-1", "ล้างครบ", J(left), "MAJOR");
  } catch (e) { fail("Z-1", "ล้างครบ", `ตรวจไม่ได้: ${errMsg(e)}`, "MAJOR"); }
  // ═══════════════ G. regression — รันหลังล้างข้อมูล (outbox ของรอบนี้ถูกลบแล้ว) ═══════════════
  try {
    const pend = await pendingOutbox(tenantIds);
    console.log(`\n── G regression (ลูกโพรเซส · env เดียวกัน · หลังล้างข้อมูล · ผ่าน = JSON_SUMMARY ไม่มี failed / exit 0) ──`);
    console.log(`  (G order) outbox PENDING ตอนเริ่ม G: ทั้งฐาน ${pend.all} · ของร้านทดสอบนี้ ${pend.mine} (ก่อนล้าง: ${pendingAtOldG ? `${pendingAtOldG.all}/${pendingAtOldG.mine}` : "ไม่ได้วัด — จบกลางทาง"})`);
    const REG: [string, string, string[]][] = [
      ["G-1", "qc-svc-d.2", []], ["G-2", "qc-svc-d.7", ["--no-regression"]], ["G-3", "qc-svc-d.6", ["--no-regression"]], ["G-4", "qc-svc-d.5", ["--no-regression"]], ["G-5", "qc-svc-d.1", []],
      ["G-6", "qc-acc-v2-gl-inclvat", []], ["G-7", "qc-acc-v2-payments", []], ["G-8", "qc-acc-v2-guard", []], ["G-9", "qc-account-api-write-docs", []], ["G-10", "qc-svc-smoke", []],
    ];
    for (const [id, f, args] of REG) {
      if (NO_REG) { skip(id, `regression ${f}`, "--no-regression / SVC_D8_NO_REGRESSION=1", "CRITICAL"); continue; }
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
console.log(`\n===== QC SVC D.8 · รอบบิลรายเดือน =====\nผ่าน ${passed}/${cks.length}${skipped.length ? ` (SKIP ${skipped.length})` : ""}`);
console.log(`FINDINGS: CRITICAL ${failed.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${failed.filter((c) => c.sev === "MAJOR").length} · MINOR ${failed.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id) })}`);
// exit 0 เมื่อไม่มีข้อแดง · รับใบ = ผ่านทุกข้อ (SKIP ที่ยอมได้: V-* ไม่มี QC_BASE · Q-* ร้าน svcqc ยังไม่พร้อม · G-* เมื่อ --no-regression — ผู้คุมรันซ้ำครบก่อนรับ)
process.exit(failed.length > 0 ? 1 : 0);
