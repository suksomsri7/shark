// QC — SVC D.12 · ย้ายออก · ย้ายห้อง · ต่อสัญญา + คืนเงินประกัน (หอ) · oracle ของผู้เขียนข้อสอบ — builder ห้ามแก้ไฟล์นี้
// สัญญา: ledger/svc-briefs/svc-brief-d.12.md · ledger/SVC-MASTER-PLAN.md แถว D.12 · ledger/DESIGN-DORM-HOTEL.md A9 A2 + ภาคผนวก ก หอ #46–49
//        · ภาพ ledger/design-dorm/07-moveout-deposit.png · README หอ "ห้อง 207 ธนพล … ฿9,000 − 594.72 − 96.00 − 350 − 200 = ฿7,759.28"
//
// กลุ่มข้อ:
//   S  โครงสร้าง: ไฟล์ · facade · จอไม่ลาก server · ด่านหน้า/action · สิทธิ์ · event 4 ตัว · อนุมัติ · งานตามเวลา · ค่าตั้ง · ไม่มีทางเงินใหม่ · ไม่ยิงเงินขนาน
//   PC positive control (เขียวตั้งแต่ก่อนมีงาน): settleDeposit D.1 (207) · ตัวตรวจกฎหมาย · settleSecurityDeposit D.2 · รอบบิล D.8 · D.8 ข้ามสัญญาที่มีใบย้ายออก
//      · lateFeeLedger D.11 · ตัวยิง 4 โพรเซส · setHkStatus R0.8
//   N แจ้งย้ายออก (นับ N วันจาก snapshot · สั้นกว่า = ต้องมีเหตุผล · ห้องว่างตามวันออก · ยกเลิก · พร้อมกัน) · I ตรวจห้อง (หลักฐานทุกโหมด · ค่าเสื่อมหักไม่ได้ · ไฟล์ร้านอื่นไม่นับ · มิเตอร์วันออก)
//   M สรุปเงิน (207 ทุกสตางค์ · ฐานมิเตอร์ = เลขที่ออกบิลแล้ว · ค้าง · ค่าห้องเศษเดือน · ค่าปรับค้าง D.11 · ผู้เช่าค้างเพิ่ม · ไม่มี PII) · U จอ 07
//   L ส่งให้ผู้เช่า/ตรึง (precheck · ใบแจ้งหนี้ 1 ใบ · แม่แบบมีคำต้องห้าม · หลังตรึงแก้ไม่ได้ · D.11 ยกเว้นไม่ได้) · A อนุมัติเกินวงเงิน
//   T ปิดประกัน (JV เดียว Dr ประกัน/Cr ลูกหนี้/Cr เงินคืน · สถานะ · สัญญาจบ · event · ห้องทำความสะอาด · ซ้ำ · ค้าง · ไม่มีประกัน · STALE · BILL_PENDING · D.9)
//   R เปิดใบสรุปใหม่ (ใบลดหนี้ ไม่ลบ) · P แข่งหลายโพรเซส (ปิด∥ปิด · ปิด∥รอบบิล · ปิด∥ค่าปรับ · ฆ่ากลางทาง) · C นับถอยหลัง/เตือนทุกวัน (เที่ยงคืนไทย · X5 · STRICT)
//   X ย้ายห้อง (ประกันตามต้นสาย ไม่มีเงินใหม่ · ไม่เก็บซ้ำ · พร้อมกัน · ย้ายห้อง∥รอบบิล) · W ต่อสัญญา (ขึ้นราคาได้ตอนนี้ · snapshot ใหม่ · พร้อมกัน · งานปิดสัญญาเดิม)
//   H หน้าแรก (todo) · Y ข้ามร้าน/สิทธิ์สด · K บัญชี (ทุก JV สมดุล · ไม่ลบ) · Q ฉาก svcqc · V ภาพ (QC_BASE) · Z ล้างครบ · G regression (รันหลังล้างข้อมูล)
//
// ข้อมูลทดสอบใต้ร้านชั่วคราว slug `qc-svc-d12-*` + ผู้ใช้ `svc-d12-*@shark.local` · วันที่ตายตัว (deps.now / runDormMoveOutJobs(now))
// รัน: bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-d.12.mts
//      `--no-regression` ข้ามหมวด G (SKIP)
/* eslint-disable @typescript-eslint/no-explicit-any */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { svcQcHostMark } from "./svc-qc-hosts.mjs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes as d12RandomBytes } from "node:crypto";

const SELF = fileURLToPath(import.meta.url);
const ROOT = join(dirname(SELF), "..");
const LABEL = "qc-svc-d.12";
const SVC_HOST = svcQcHostMark(); // ORACLE-EDIT (ผู้คุม 31 ต.ค. · ฐานต่อเลน) เดิม "ep-mute-scene"
const FORBIDDEN_HOSTS = ["ep-royal-night", "ep-plain-art", "ep-cool-shadow", "ep-weathered-river", "ep-frosty-lab", "ep-fragrant-thunder"];
const RUN_CMD = "bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-d.12.mts";

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
// ORACLE-EDIT (ผู้คุม 30 ต.ค. · d12-M8) ลิงก์ไฟล์ส่วนตัวเซ็นด้วย SESSION_SECRET — qc-svc.sh ไม่ส่งค่านี้ ⇒ ตั้งค่าสุ่มเหมือน qc-svc-d.5.mts
if ((process.env.SESSION_SECRET ?? "").length < 32) process.env.SESSION_SECRET = d12RandomBytes(32).toString("hex");

const DORM_IDX = "src/lib/modules/dorm/index.ts";
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 260);

// ═══════════════ โหมดลูก (`--child <base64 JSON>`) — ยิงพร้อมกันจากโพรเซสแยก ═══════════════
//   op ปกติ = ชื่อฟังก์ชันใน facade dorm เรียก f(ctx, input, deps) · "__jobs" = runDormMoveOutJobs(now, {tenantId})
//   "__prepSend" = prepareBillRun แล้ว sendBillRun จนจบ (input = { unitId, periodKey, now }) · job.signal = พิมพ์ CHILD_START ก่อนเรียก (ข้อฆ่ากลางทาง)
const CHILD_AT = process.argv.indexOf("--child");
if (CHILD_AT >= 0) {
  let out: unknown[] = [];
  try {
    const job = JSON.parse(Buffer.from(process.argv[CHILD_AT + 1] ?? "", "base64url").toString("utf8")) as { op: string; ctx: any; inputs: any[]; deps: any; at: number; signal?: boolean };
    const dorm = (await import(pathToFileURL(join(ROOT, DORM_IDX)).href)) as Record<string, unknown>;
    let f: ((...a: any[]) => Promise<any>) | null = null;
    if (job.op === "__jobs" && typeof dorm.runDormMoveOutJobs === "function") {
      const g = dorm.runDormMoveOutJobs as (...a: any[]) => Promise<any>;
      f = (_c: unknown, x: any) => g(new Date(x.now), { tenantId: x.tenantId });
    } else if (job.op === "__prepSend" && typeof dorm.prepareBillRun === "function" && typeof dorm.sendBillRun === "function") {
      const prep = dorm.prepareBillRun as (...a: any[]) => Promise<any>;
      const send = dorm.sendBillRun as (...a: any[]) => Promise<any>;
      f = async (c: unknown, x: any) => {
        const r = await prep(c, { unitId: x.unitId, periodKey: x.periodKey }, { now: new Date(x.now) });
        if (!r?.ok) return { stage: "prepare", ...r };
        let last: any = null;
        for (let i = 0; i < 40; i++) { last = await send(c, { unitId: x.unitId, runId: r.runId }, { now: new Date(x.now) }); if (!last?.ok || last.done) break; }
        return { stage: "send", ...(last ?? {}), runId: r.runId };
      };
    } else f = typeof dorm[job.op] === "function" ? (dorm[job.op] as (...a: any[]) => Promise<any>) : null;
    const deps = job.deps ? { ...job.deps, ...(typeof job.deps.now === "string" ? { now: new Date(job.deps.now) } : {}) } : undefined;
    if (!f) out = job.inputs.map(() => ({ childFail: `facade ไม่มี ${job.op}` }));
    else {
      const wait = job.at - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      if (job.signal) console.log("CHILD_START");
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
const NO_REG = process.argv.includes("--no-regression") || process.env.SVC_D12_NO_REGRESSION === "1";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9]);
const SVG = new TextEncoder().encode(`<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`);
const putNoop = async () => {};

// ═══════════════ เวลา (ไทย) ═══════════════
const BK = (ymd: string, hm = "12:00") => new Date(`${ymd}T${hm.length === 5 ? `${hm}:00` : hm}+07:00`);
const ISO = (ymd: string, hm = "12:00") => BK(ymd, hm).toISOString();
const dbDate = (ymd: string) => new Date(`${ymd}T00:00:00Z`);
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
const bridge = (await import(pathToFileURL(join(ROOT, "src/lib/modules/dorm/account-bridge.ts")).href)) as any;
const legal = (await import(pathToFileURL(join(ROOT, "src/lib/core/settings/legal/th-rental-2568.ts")).href)) as any;
const ACC: any = await tryImport("@/lib/modules/account");
const SYS: any = await tryImport("@/lib/modules/system/service");
const ASV: any = await tryImport("@/lib/modules/account/service");
const GL: any = await tryImport("@/lib/modules/account/gl");
const SET: any = await tryImport("@/lib/core/settings");
const APS: any = await tryImport("@/lib/modules/approval/service");
const ROOMS: any = await tryImport("@/lib/modules/rooms");
const PRISMA_NS: any = (await tryImport("@prisma/client"))?.Prisma;

const SCREEN_FILE = "src/components/dorm/MoveOutScreen.tsx";
const loadComp = async (file: string, named: string): Promise<[any, string]> => {
  if (!existsSync(join(ROOT, file))) return [null, `ยังไม่มี ${file}`];
  try {
    const m: any = await import(pathToFileURL(join(ROOT, file)).href);
    const c = typeof m.default === "function" ? m.default : typeof m[named] === "function" ? m[named] : null;
    return c ? [c, ""] : [null, `${file} ไม่มี default export ที่เป็นคอมโพเนนต์`];
  } catch (e) { return [null, `import ${file} ล้ม: ${errMsg(e)}`]; }
};
const [ScreenC, screenWhy] = await loadComp(SCREEN_FILE, "MoveOutScreen");
const React = (await import("react" as string)) as any;
const RDS = (await import("react-dom/server" as string)) as any;

/** ตัวรันข้อ — needs = ชื่อฟังก์ชันใน facade dorm (ขาด = FAIL ไม่ใช่ SKIP) · ui = ต้องใช้คอมโพเนนต์ MoveOutScreen */
async function T(id: string, name: string, needs: string[], body: () => Promise<[boolean, string?]>, sev: Sev = "CRITICAL", ui = false) {
  const miss = needs.filter((n) => !fn(n));
  if (miss.length) return fail(id, name, dorm ? `facade dorm ไม่มี ${miss.join(", ")}` : dormWhy, sev);
  if (ui && !ScreenC) return fail(id, name, screenWhy || "ไม่มีคอมโพเนนต์ MoveOutScreen", sev);
  try {
    const [ok, why] = await body();
    if (ok) pass(id, name); else fail(id, name, why ?? "ไม่ตรง", sev);
  } catch (e) { fail(id, name, `throw: ${errMsg(e)}`, sev); }
}
const codeOf = (r: any) => (r && r.ok === false ? String(r.code) : r?.ok === true ? "OK" : r?.threw ? `THREW(${r.threw})` : J(r).slice(0, 80));
const failOk = (r: any, code: string) => r?.ok === false && r?.code === code && typeof r?.reason === "string" && THAI.test(r.reason) && !/prisma|invalid `|Unique constraint|violates/i.test(r.reason);
const legalOk = (r: any, legalCode: string) => failOk(r, "LEGAL_BLOCK") && r?.legal?.code === legalCode && THAI.test(r?.legal?.messageTh ?? "");

// ═══════════════ render ═══════════════
const ACTIONS = new Proxy({}, { get: () => async () => ({ ok: true }) });
const renderScreen = (model: unknown): string => String(RDS.renderToStaticMarkup(React.createElement(ScreenC, { model, unitSlug: "qc-d12", actions: ACTIONS }))).replace(/<!-- -->/g, "");
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
  await soft(() => prisma.dormLease.updateMany({ where: { tenantId: { in: tids } }, data: { previousLeaseId: null } }));
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
  const un = await prisma.user.count({ where: { email: { startsWith: "svc-d12-" } } });
  if (un) out.push({ table: "User(svc-d12-*)", n: un });
  return out;
}
async function pendingOutbox(tids: string[]): Promise<{ all: number; mine: number }> {
  const all = await prisma.outboxEvent.count({ where: { status: "PENDING" } });
  const mine = tids.length ? await prisma.outboxEvent.count({ where: { status: "PENDING", tenantId: { in: tids } } }) : 0;
  return { all, mine };
}

// ═══════════════ ยิงพร้อมกันจากโพรเซสลูก ═══════════════
const SYNC_MS = 14_000;
async function fanout(op: string, ctx: unknown, inputs: any[], deps: any = null, procs = 4, delayMs = SYNC_MS, at0?: number): Promise<any[]> {
  const per = Math.ceil(inputs.length / procs);
  const at = at0 ?? Date.now() + delayMs;
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
/** ยิงโพรเซสลูก 1 ตัวแล้ว SIGKILL หลังพิมพ์ CHILD_START ไป killMs */
function killDuring(op: string, ctx: unknown, input: any, deps: any, killMs: number): Promise<{ killed: boolean; out: string }> {
  return new Promise((resolve) => {
    const job = { op, ctx, inputs: [input], deps, at: Date.now(), signal: true };
    const child = spawn(process.execPath, [...process.execArgv, SELF, "--child", Buffer.from(JSON.stringify(job)).toString("base64url")], { cwd: ROOT, env: process.env });
    let buf = "";
    let killed = false;
    let armed = false;
    child.stdout.on("data", (d) => {
      buf += String(d);
      if (!armed && buf.includes("CHILD_START")) { armed = true; setTimeout(() => { if (child.exitCode === null) { killed = true; child.kill("SIGKILL"); } }, killMs); }
    });
    child.stderr.on("data", (d) => { buf += String(d); });
    child.on("close", () => resolve({ killed, out: buf.slice(-300) }));
  });
}
const badOf = (rs: any[], okCodes: string[] = []) => rs.filter((r) => r?.threw || r?.childFail || (r?.ok === false && !okCodes.includes(r?.code)) || /P2028|P2024|P2002|40P01|timed out|Unable to start a transaction/i.test(J(r)));

// ═══════════════ ค่าคงที่ฉาก ═══════════════
const RENT = 450_000, COMMON = 30_000, BASE = RENT + COMMON, DEP = 900_000;
const NOVAT = { registered: false, pricesIncludeVat: true };
const OOS_REASON = "ผู้ให้เช่ามีห้องให้เช่าน้อยกว่าสามห้อง (ข้อสอบ D.12)";
const ELEC_RATE = 472, WATER_RATE = 1600;
const NOW_OCT = ISO("2026-09-25", "10:00"), NOW_NOV = ISO("2026-10-25", "10:00");
const EVENTS = ["dorm.moveout.settled", "dorm.deposit.refund_due", "dorm.lease.renewed", "dorm.lease.ended"];
const API = ["giveMoveOutNotice", "cancelMoveOut", "addMoveOutFiles", "recordMoveOutInspection", "moveOutSummary", "moveOutModel", "sendMoveOutSummary",
  "reopenMoveOutSummary", "settleMoveOut", "transferRoom", "renewLease", "runDormMoveOutJobs", "moveOutAccess"];

const tenantIds: string[] = [];
let pendingAtOldG: { all: number; mine: number } | null = null;
const SV: any = await tryImport(pathToFileURL(join(ROOT, "scripts/svc-qc-data.mts")).href);

try {
  const stale = await prisma.tenant.findMany({ where: { slug: { startsWith: "qc-svc-d12-" } }, select: { id: true } });
  if (stale.length) { console.log(`  (กวาด tenant ค้างจากรอบก่อน ${stale.length})`); await cleanup(stale.map((t: { id: string }) => t.id)); }
  await prisma.user.deleteMany({ where: { email: { startsWith: "svc-d12-" } } });

  // ═══════════════ S. โครงสร้าง ═══════════════
  console.log("\n── S โครงสร้าง ──");
  const F = {
    moveout: "src/lib/modules/dorm/moveout.ts",
    change: "src/lib/modules/dorm/lease-change.ts",
    access: "src/lib/modules/dorm/moveout-access.ts",
    index: DORM_IDX,
    screen: SCREEN_FILE,
    page: "src/app/app/u/[unitSlug]/dorm/moveout/page.tsx",
    actions: "src/app/app/u/[unitSlug]/dorm/moveout/actions.ts",
    scene: "scripts/svc-qc-moveout-scene.mts",
    lease: "src/lib/modules/dorm/lease.ts",
    latefee: "src/lib/modules/dorm/latefee.ts",
    home: "src/lib/modules/dorm/home.ts",
  };
  {
    const miss = [F.moveout, F.change, F.access, F.screen, F.page, F.actions, F.scene].filter((p) => !existsSync(join(ROOT, p)));
    chk("S-1", "มีไฟล์ของใบครบ (moveout.ts · lease-change.ts · moveout-access.ts · MoveOutScreen.tsx · moveout/page · actions · ฉาก svc-qc-moveout-scene.mts)", !miss.length, `ขาด ${miss.join(", ")}`, "CRITICAL");
  }
  {
    const miss = API.filter((n) => !fn(n));
    chk("S-2", `facade @/lib/modules/dorm export ครบ ${API.length} ชื่อ (§3–§5)`, !miss.length, dorm ? `ขาด ${miss.join(", ")}` : dormWhy, "CRITICAL");
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
    chk("S-3", "MoveOutScreen.tsx: 'use client' บรรทัดแรก · ไม่ import prisma/โมดูล server/actions/next/* (เฉพาะ import type) — render ด้วย renderToStaticMarkup ได้",
      !!screenSrc && useClient && !bad.length && !prismaWord, screenSrc ? `use client=${useClient} import ต้องห้าม=${bad.join(",") || "—"} prisma=${prismaWord}` : "ยังไม่มีไฟล์", "CRITICAL");
  }
  {
    const p = read(F.page);
    const ok = !!p && !/^\s*["']use client["']/.test(p) && /requireUnit\s*\(/.test(p) && /["']DORM["']/.test(p) && /notFound\s*\(/.test(p) && /moveOutAccess\s*\(/.test(p) && /\.manage\b/.test(p)
      && /moveOutModel\s*\(/.test(p) && /from\s+["']@\/lib\/modules\/dorm["']/.test(p) && !/["']@\/lib\/modules\/dorm\//.test(p) && !/@\/lib\/core\/db|@prisma\//.test(p) && /SVC_QC_CLOCK/.test(p) && /MoveOutScreen/.test(p);
    chk("S-4", "หน้า /dorm/moveout: server · requireUnit + DORM · moveOutAccess(...).manage ไม่ผ่าน ⇒ notFound · moveOutModel ผ่าน facade · ?at= เฉพาะ SVC_QC_CLOCK=1 · ไม่แตะ prisma", ok,
      p ? `requireUnit=${/requireUnit\s*\(/.test(p)} access=${/moveOutAccess\s*\(/.test(p)} model=${/moveOutModel\s*\(/.test(p)} clock=${/SVC_QC_CLOCK/.test(p)} prisma=${/@\/lib\/core\/db|@prisma\//.test(p)}` : "ยังไม่มีไฟล์", "CRITICAL");
  }
  {
    const code = stripComments(read(F.actions));
    const firstUseServer = /^\s*["']use server["']/.test(code);
    const exportsOther = [...code.matchAll(/^\s*export\s+(?!async\s+function)(\S+)/gm)].map((m) => m[1]);
    const names = ["giveMoveOutNoticeAction", "recordMoveOutInspectionAction", "addMoveOutFilesAction", "sendMoveOutSummaryAction", "settleMoveOutAction", "reopenMoveOutSummaryAction", "cancelMoveOutAction", "transferRoomAction", "renewLeaseAction"]
      .filter((n) => !new RegExp(`export\\s+async\\s+function\\s+${n}\\b`).test(code));
    const gate = /requireUnit\s*\(/.test(code) && /["']DORM["']/.test(code);
    const trustInput = /input\??\.tenantId|tenantId\s*:\s*input\.|input\??\.actorUserId/.test(code);
    chk("S-5", "actions.ts: 'use server' · export async function เท่านั้น (9 ชื่อ) · requireUnit + DORM · ร้าน/ผู้กระทำจาก session",
      !!code && firstUseServer && !exportsOther.length && !names.length && gate && !trustInput,
      code ? `use server=${firstUseServer} export อื่น=${exportsOther.join(",") || "—"} ขาด=${names.join(",") || "—"} ด่าน=${gate} รับจาก input=${trustInput}` : "ยังไม่มีไฟล์", "CRITICAL");
  }
  {
    const permSrc = read("src/lib/core/permissions.ts");
    const plannedBlk = /module:\s*"dorm"[\s\S]*?planned:\s*\[([\s\S]*?)\]/.exec(permSrc)?.[1] ?? "";
    const still = ["dorm.moveout.manage", "dorm.deposit.deduct.approve"].filter((k) => new RegExp(`["']${k.replace(/\./g, "\\.")}["']`).test(plannedBlk));
    chk("S-6", "permissions: dorm.moveout.manage · dorm.deposit.deduct.approve ใช้จริง (ออกจาก planned)", !still.length, `ยังอยู่ใน planned: ${still.join(", ")}`, "MAJOR");
  }
  {
    let why = "";
    try {
      const oc = (await import("@/lib/outbox-consumers" as string)) as any;
      const al = (await import("@/lib/automation/labels" as string)) as any;
      const wl = (await import("@/lib/webhooks/labels" as string)) as any;
      for (const EV of EVENTS) {
        const a = typeof oc.consumers?.[EV] === "function";
        const lab = Array.isArray(al.AUTOMATION_EVENTS) ? al.AUTOMATION_EVENTS.find((e: { value: string }) => e.value === EV) : null;
        const c = Array.isArray(wl.WEBHOOK_EVENTS) && wl.WEBHOOK_EVENTS.some((e: { value: string }) => e.value === EV);
        if (!(a && lab && THAI.test(lab.label ?? "") && c)) why += `${EV}: consumers=${a} automation=${!!lab} ไทย=${THAI.test(lab?.label ?? "")} webhooks=${c} · `;
      }
    } catch (e) { why = `import ทะเบียนล้ม: ${errMsg(e)}`; }
    chk("S-7", `event ${EVENTS.join(" · ")} ลง 3 ทะเบียน (ป้ายไทย)`, !why, why, "MAJOR");
  }
  {
    let why = "";
    try {
      const l = (await import("@/lib/modules/approval/labels" as string)) as any;
      const e = (l.ENTITY_TYPES ?? []).find((x: any) => x.value === "dorm.moveout.deduction");
      if (!e || !THAI.test(e.label ?? "")) why += "labels ไม่มี dorm.moveout.deduction (ป้ายไทย) · ";
      if (!/["']dorm\.moveout\.deduction["']/.test(stripComments(read("src/lib/modules/approval/actions.ts")))) why += "approval/actions.ts allowlist ไม่มี · ";
    } catch (e) { why = `import approval labels ล้ม: ${errMsg(e)}`; }
    chk("S-8", "สายอนุมัติ: entityType dorm.moveout.deduction ลง labels (ไทย) + allowlist", !why, why, "MAJOR");
  }
  {
    const mj = read("src/lib/platform/minute-jobs.ts");
    const i = mj.search(/name:\s*["']dorm\.moveout["']/);
    const blk = i >= 0 ? mj.slice(i, i + 600) : "";
    const every = Number(/everyMinutes:\s*(\d+)/.exec(blk)?.[1] ?? "0");
    const ok = i >= 0 && every >= 1 && every <= 60 && /import\(\s*["']@\/lib\/modules\/dorm["']\s*\)/.test(blk) && /runDormMoveOutJobs\s*\(/.test(blk) && !/^import[^\n]*modules\/dorm/m.test(mj);
    chk("S-9", "minute-jobs: งาน dorm.moveout (≤ 60 นาที · import facade ตอนรัน · runDormMoveOutJobs)", ok, i < 0 ? "ไม่มีงาน dorm.moveout" : blk.slice(0, 200).replace(/\s+/g, " "), "MAJOR");
  }
  {
    let why = "";
    try {
      const d = (k: string) => SET?.getDef?.(k);
      const fb = (k: string) => d(k)?.defaults?._fallback;
      const t = d("rooms.msg.moveOutSummary");
      if (!t || t.type !== "template" || !(t.legal ?? []).includes("TEMPLATE_NO_THREAT") || !["tenantName", "roomNo", "refundAmount", "refundDueDate", "deductAmount"].every((v) => (t.templateVars ?? []).includes(v))) why += "แม่แบบ rooms.msg.moveOutSummary (TEMPLATE_NO_THREAT · ตัวแปร) · ";
      const cl = fb("rooms.moveout.checklist");
      if (!Array.isArray(cl) || J(cl.map((x: any) => x.key)) !== J(["wall", "screen", "keys", "appliance", "furniture"])) why += `rooms.moveout.checklist ค่าเริ่ม 5 รายการตามภาพ (${J(cl)}) · `;
      if (fb("rooms.moveout.noticeDays") !== 30 || fb("rooms.deposit.returnDays") !== 7 || fb("rooms.deposit.approvalThreshold") !== 200_000) why += "ค่าเดิม #46–48 เปลี่ยน · ";
      const snap = SET?.SNAPSHOT_KEYS?.lease ?? [];
      if (!["rooms.moveout.noticeDays", "rooms.deposit.returnDays", "rooms.billing.prorate"].every((k) => snap.includes(k))) why += "SNAPSHOT_KEYS.lease ขาด noticeDays/returnDays/prorate · ";
    } catch (e) { why = `อ่านทะเบียนค่าตั้งล้ม: ${errMsg(e)}`; }
    chk("S-10", "ค่าตั้ง: rooms.msg.moveOutSummary (แม่แบบ · TEMPLATE_NO_THREAT) · rooms.moveout.checklist (5 รายการภาพ 07) · #46–48 คงเดิม · snapshot สัญญามี noticeDays/returnDays/prorate", !why, why, "MAJOR");
  }
  const moSrc = stripComments(read(F.moveout)), chSrc = stripComments(read(F.change));
  {
    const raw = [F.moveout, F.change].filter((f) => /import\s*\{[^}]*\bprisma\b[^}]*\}\s*from\s+["']@\/lib\/core\/db["']/.test(read(f)));
    const anyUse = [F.moveout, F.change, F.access, F.screen, F.page, F.actions].filter((f) => /:\s*any\b|as\s+any\b|<any>/.test(stripComments(read(f))));
    const getDay = [F.moveout, F.change, F.screen].filter((f) => /\.getDay\(\)|\.getDate\(\)|\.getMonth\(\)/.test(stripComments(read(f))));
    chk("S-11", "moveout.ts/lease-change.ts ไม่ import prisma ดิบ (F5.1) · ไม่มี any · ไม่มี getDay/getDate/getMonth ดิบ", !!moSrc && !!chSrc && !raw.length && !anyUse.length && !getDay.length,
      moSrc && chSrc ? `prisma ดิบ=${raw.join(",") || "—"} any=${anyUse.join(",") || "—"} getDay=${getDay.join(",") || "—"}` : "ยังไม่มีไฟล์", "MAJOR");
  }
  {
    const need: [string, string, RegExp][] = [
      ["moveout", "settleDeposit( (D.1)", /\bsettleDeposit\s*\(/], ["moveout", "evaluateLegal(DEDUCTION_EVIDENCE)", /evaluateLegal\s*\(\s*["']DEDUCTION_EVIDENCE["']/],
      ["moveout", "evaluateLegal(DEPOSIT_RETURN_DAYS)", /["']DEPOSIT_RETURN_DAYS["']/], ["moveout", "settleSecurityDepositInTx(", /settleSecurityDepositInTx\s*\(/],
      ["moveout", "runDormMoneyTx(", /runDormMoneyTx\s*\(/], ["moveout", "createExternalInvoice(", /createExternalInvoice\s*\(/], ["moveout", "createExternalCreditNote(", /createExternalCreditNote\s*\(/],
      ["moveout", "notifyCustomer(", /notifyCustomer\s*\(/], ["moveout", "findForbiddenTerms(", /findForbiddenTerms\s*\(/], ["moveout", "lateFeeLedger(", /lateFeeLedger\s*\(/],
      ["moveout", "utilityCharge/utilityLine (D.1)", /utility(Charge|Line)\s*\(/], ["moveout", "prorate( (D.1)", /\bprorate\s*\(/], ["moveout", "resizeOccupancy(", /resizeOccupancy\s*\(/],
      ["moveout", "setHkStatus(", /setHkStatus\s*\(/], ["moveout", "emitOutbox(", /emitOutbox\s*\(/], ["moveout", "submitForApproval(", /submitForApproval\s*\(/], ["moveout", "requestStatuses(", /requestStatuses\s*\(/],
      ["moveout", "uploadFile(", /uploadFile\s*\(/], ["moveout", "privateFileUrl(", /privateFileUrl\s*\(/], ["moveout", "pg_advisory_xact_lock", /pg_advisory_xact_lock/],
      ["change", "claimRoom(", /claimRoom\s*\(/], ["change", "moveOccupancy(", /moveOccupancy\s*\(/], ["change", "resizeOccupancy(", /resizeOccupancy\s*\(/],
      ["change", "snapshotPolicy(", /snapshotPolicy\s*\(/], ["change", "evaluateLegal(RENT_LOCKED_IN_LEASE)", /["']RENT_LOCKED_IN_LEASE["']/],
    ];
    const src: Record<string, string> = { moveout: moSrc, change: chSrc };
    const miss = need.filter(([f, , re]) => !re.test(src[f])).map(([f, n]) => `${f}:${n}`);
    chk("S-12", "ใช้ชิ้นเดิม (ไม่เขียนสูตร/ทางซ้ำ): settleDeposit · ตัวตรวจ DEDUCTION_EVIDENCE/DEPOSIT_RETURN_DAYS · settleSecurityDepositInTx · runDormMoneyTx · ใบแจ้งหนี้/ใบลดหนี้ · notifyCustomer + ตัวตรวจคำ · lateFeeLedger · utility/prorate · rooms · outbox · อนุมัติ · ไฟล์ส่วนตัว",
      !!moSrc && !!chSrc && !miss.length, `ขาด ${miss.join(", ") || "—"}`, "MAJOR");
  }
  {
    const both = moSrc + "\n" + chSrc;
    const newMoney = ["postSecurityDeposit", "recordExternalPayment", "applyExternalDepositReceipt", "applyExternalDepositRefund", "reverseEntry", "reverseSecurityDepositSettlement", "createExternalDebitNote"]
      .filter((n) => new RegExp(`\\b${n}(InTx)?\\s*\\(`).test(both));
    const delAcc = /account\w*\.(delete|deleteMany)\s*\(|DELETE\s+FROM\s+"Account/i.test(both);
    const par = /Promise\.(all|allSettled|any|race)\s*\([\s\S]{0,600}?(settleSecurityDeposit|createExternalInvoice|createExternalCreditNote)/.test(both) || /\.map\(\s*async[\s\S]{0,400}?(settleSecurityDeposit|createExternalInvoice|createExternalCreditNote)/.test(both);
    chk("S-13", "ไม่มีทางเงินใหม่: ไม่เรียก postSecurityDeposit/recordExternalPayment/applyExternal*/reverseEntry/reverseSecurityDepositSettlement/ใบเพิ่มหนี้ · ไม่ลบแถวบัญชี · ไม่ยิงเงินขนาน",
      !!moSrc && !!chSrc && !newMoney.length && !delAcc && !par, `เรียก=${newMoney.join(",") || "—"} ลบบัญชี=${delAcc} ขนาน=${par}`, "CRITICAL");
  }
  {
    const idx = read("src/lib/modules/account/index.ts");
    const hasInTx = /export\s+async\s+function\s+settleSecurityDepositInTx\s*\(\s*tx\b/.test(idx);
    const orig = /export\s+async\s+function\s+settleSecurityDeposit\s*\(\s*input\s*:/.test(idx);
    chk("S-14", "account facade: settleSecurityDepositInTx(tx, …) เพิ่มอย่างเดียว (มติ R1) · settleSecurityDeposit(input) เดิมคงอยู่", hasInTx && orig, `InTx=${hasInTx} เดิม=${orig}`, "MAJOR");
  }
  {
    const files = [F.moveout, F.change, F.screen, F.page];
    const bad = files.filter((f) => LEGAL_BAD.test(read(f)));
    const normalDeduct = /data-deduct-normal|หักค่าเสื่อม(?!ไม่ได้)/.test(screenSrc);
    const specs = SV?.SQC_VISUAL_SPECS?.["d.12"];
    chk("S-15", "ไม่มีคำต้องห้าม สคบ. ในโค้ดของใบ · จอไม่มีตัวเลือกหักค่าเสื่อม · (ผู้คุมตั้งแล้ว) SQC_VISUAL_SPECS d.12 = /dorm/moveout?room=207",
      !bad.length && !normalDeduct && Array.isArray(specs) && specs.some((s: any) => /\/dorm\/moveout\?room=207/.test(s.path)), `คำต้องห้าม=${bad.join(",") || "—"} หักค่าเสื่อม=${normalDeduct} specs=${J(specs)}`, "MAJOR");
  }
  {
    const fit = read("scripts/fitness.mts");
    const used = new Set<string>();
    const deep: string[] = [];
    for (const f of [F.moveout, F.change]) for (const i of importsOf(read(f))) {
      const m = /^@\/lib\/modules\/([^/]+)(\/.*)?$/.exec(i.spec);
      if (!m || m[1] === "dorm" || i.typeOnly) continue;
      used.add(m[1]);
      if (m[2]) deep.push(i.spec);
    }
    const missing = [...used].filter((x) => !fit.includes(`"dorm→${x}"`));
    chk("S-16", "เส้นข้ามโมดูลของ moveout.ts/lease-change.ts มีใน ALLOWED_EDGES · ใช้ผ่าน facade (ไม่ล้วง subpath)", !!moSrc && !!chSrc && !missing.length && !deep.length,
      `ใช้=${[...used].join(",") || "—"} ขาด=${missing.join(",") || "—"} ล้วงลึก=${deep.join(",") || "—"}`, "MAJOR");
  }
  {
    const h = read(F.home);
    const kinds = /DormHomeTodoKind\s*=\s*([^;]+);/.exec(h)?.[1] ?? "";
    const lf = stripComments(read(F.latefee));
    const ls = stripComments(read(F.lease));
    chk("S-17", "แก้ไฟล์ใบอื่นตามมติ R2/R6: home.ts todo 'expired' 'refundDue' · latefee.ts MOVEOUT_FROZEN · lease.ts ยอดถือตามต้นสาย (depositLeaseIdOf)",
      /["']expired["']/.test(kinds) && /["']refundDue["']/.test(kinds) && /MOVEOUT_FROZEN/.test(lf) && /depositLeaseIdOf/.test(ls),
      `home=${/["']expired["']/.test(kinds)}/${/["']refundDue["']/.test(kinds)} latefee=${/MOVEOUT_FROZEN/.test(lf)} lease=${/depositLeaseIdOf/.test(ls)}`, "MAJOR");
  }

  // ═══════════════ PC-1 · PC-2 (pure) ═══════════════
  console.log("\n── PC positive control ──");
  const util207 = [
    { code: "ELEC", input: { kind: "METERED", segments: [{ start: 2000, end: 2126 }], method: { kind: "FIXED_RATE", satangPerUnit: ELEC_RATE } } },
    { code: "WATER", input: { kind: "METERED", segments: [{ start: 383, end: 389 }], method: { kind: "FIXED_RATE", satangPerUnit: WATER_RATE } } },
  ];
  const dmg207 = [{ labelTh: "มุ้งลวด", amountSatang: 35_000, kind: "DAMAGE", evidenceCount: 1 }, { labelTh: "กุญแจ", amountSatang: 20_000, kind: "DAMAGE", evidenceCount: 1 }];
  {
    const s = calc.settleDeposit({ depositSatang: DEP, utilities: util207, damages: dmg207, unpaidSatang: 0, approvalThresholdSatang: 200_000, legal: { mode: "STRICT" } });
    const s2 = calc.settleDeposit({ depositSatang: DEP, utilities: util207, damages: dmg207, unpaidSatang: 0, approvalThresholdSatang: 50_000, legal: { mode: "STRICT" } });
    chk("PC-1", "settleDeposit D.1 ห้อง 207: ไฟ 59,472 + น้ำ 9,600 + เสียหาย 55,000 ⇒ คืน 775,928 (฿7,759.28) · วงเงิน ฿500 ⇒ ต้องอนุมัติ",
      s.ok && s.refundSatang === 775_928 && s.utilitiesSatang === 69_072 && s.damagesSatang === 55_000 && !s.needsApproval && s2.ok && s2.needsApproval,
      J({ s: s.ok ? [s.refundSatang, s.utilitiesSatang, s.damagesSatang, s.needsApproval] : s, s2: s2.needsApproval }), "CRITICAL");
  }
  {
    const ev = (kind: string, n: number, mode: string, reason?: string) => legal.evaluateLegal("DEDUCTION_EVIDENCE", { kind, evidenceCount: n }, { mode, outOfScopeReason: reason });
    const a = ev("NORMAL_WEAR", 3, "OUT_OF_SCOPE", OOS_REASON), b = ev("DAMAGE", 0, "STRICT"), c = ev("DAMAGE", 0, "OUT_OF_SCOPE", OOS_REASON);
    const d = legal.evaluateLegal("DEPOSIT_RETURN_DAYS", { days: 10 }, { mode: "STRICT" });
    const e = legal.evaluateLegal("RENT_LOCKED_IN_LEASE", { context: "RENEWAL", oldSatang: RENT, newSatang: 480_000 }, { mode: "STRICT" });
    const f = legal.evaluateLegal("RENT_LOCKED_IN_LEASE", { context: "MID_LEASE", oldSatang: RENT, newSatang: 480_000 }, { mode: "STRICT" });
    chk("PC-2", "ตัวตรวจกฎหมาย: ค่าเสื่อม ⇒ BLOCK ทุกโหมด (รวมนอกขอบเขต) · ไม่มีหลักฐาน STRICT ⇒ BLOCK แต่นอกขอบเขต ⇒ OK (ใบนี้ต้องเข้มกว่า — มติ 5) · คืนประกัน 10 วัน STRICT ⇒ BLOCK · ขึ้นค่าเช่าตอนต่อสัญญา OK / กลางสัญญา BLOCK",
      a.level === "BLOCK" && a.code === "DEDUCT_NORMAL_WEAR" && b.level === "BLOCK" && b.code === "DEDUCT_NO_EVIDENCE" && c.level === "OK" && d.level === "BLOCK" && d.code === "DEPOSIT_RETURN_DAYS" && e.level === "OK" && f.level === "BLOCK",
      J({ a: a.code, b: b.code, c: c.level, d: d.level, e: e.level, f: f.level }), "CRITICAL");
  }

  // ═══════════════ fixtures ═══════════════
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const mkTenant = async (tag: string) => { const t = await prisma.tenant.create({ data: { name: `QC D12 ${tag}`, slug: `qc-svc-d12-${tag}-${stamp}` } }); tenantIds.push(t.id); return t.id as string; };
  const A = await mkTenant("a"), B = await mkTenant("b");
  const mkUnit = async (tenantId: string, type: string, tag: string, name?: string) => (await prisma.businessUnit.create({ data: { tenantId, type, name: name ?? `หอ D12 ${tag}`, slug: `d12${tag}-${stamp}` } })).id as string;
  const mkBook = async (tenantId: string, name: string) => {
    const s = await SYS.createSystem(tenantId, "ACCOUNT", name);
    await ASV.saveSettings(tenantId, s.id, { orgName: name, vatRegistered: false });
    await GL.ensureAccounting({ tenantId, systemId: s.id });
    await prisma.accountFinance.create({ data: { tenantId, systemId: s.id, type: "BANK", name: "บัญชีรับเงินหอ", promptpayId: "0812345678", useForReceive: true } });
    return s.id as string;
  };
  const link = (tenantId: string, systemId: string, unitId: string) => prisma.accountSystemLink.create({ data: { tenantId, systemId, linkedKind: "BUSINESS", linkedId: unitId, enabled: true } });
  const mkUser = async (key: string, tenantId: string, role: string, unitAccess: string[], perms: string[] = [], accepted = true) => {
    const u = await prisma.user.create({ data: { email: `svc-d12-${stamp}-${key}@shark.local`, name: `QC D12 ${key}` } });
    const m = await prisma.membership.create({ data: { userId: u.id, tenantId, role, unitAccess, permissions: Object.fromEntries(perms.map((p) => [p, true])), acceptedAt: accepted ? new Date() : null } });
    return { id: u.id as string, membershipId: m.id as string };
  };
  const mkType = async (tenantId: string, unitId: string) =>
    (await prisma.hotelRoomType.create({ data: { tenantId, unitId, name: "มาตรฐาน", capacity: 2, baseRateSatang: RENT, depositSatang: 0, rentMode: "MONTHLY", monthlyRateSatang: RENT, areaSqm: 24 } })).id as string;
  const mkBld = async (tenantId: string, unitId: string, name: string) => (await prisma.roomBuilding.create({ data: { tenantId, unitId, name, floors: 3, sortOrder: 1 } })).id as string;
  const mkRoom = async (tenantId: string, unitId: string, typeId: string, bld: string, number: string) =>
    (await prisma.hotelRoom.create({ data: { tenantId, unitId, roomTypeId: typeId, number, buildingId: bld, floorNo: 1, floor: "1" } })).id as string;
  const setVal = async (tenantId: string, key: string, scope: string, scopeId: string, value: unknown) => {
    await prisma.settingValue.deleteMany({ where: { tenantId, key, scope, scopeId } });
    await prisma.settingValue.create({ data: { tenantId, key, scope, scopeId, value: value === null ? PRISMA_NS.JsonNull : value, setById: "qc-d12" } });
  };
  const U = (tenantId: string, unitId: string, key: string, value: unknown) => setVal(tenantId, key, "UNIT", unitId, value);
  const unsetU = (tenantId: string, unitId: string, key: string) => prisma.settingValue.deleteMany({ where: { tenantId, key, scope: "UNIT", scopeId: unitId } });
  const snap = async (tenantId: string, unitId: string, roomTypeId: string, roomId: string, patch: Record<string, unknown> = {}) => {
    const s = await SET.snapshotPolicy({ tenantId }, "lease", { unitId, roomTypeId, roomId });
    return { ...s, values: { ...(s?.values ?? {}), ...patch } };
  };
  let seq = 0;
  const RUNNUM = 100000 + Math.floor(Math.random() * 800000);
  const newPhone = () => `08${String((RUNNUM % 1000) * 100000 + ++seq).padStart(8, "0").slice(-8)}`;
  const addDays = (ymd: string, n: number) => { const [y, m, d] = ymd.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
  type L = { leaseId: string; partyId: string; roomId: string; occupancyId: string; unitId: string; typeId: string; phone: string };
  const mkLease = async (o: { tenantId?: string; unitId: string; roomId: string; typeId: string; name: string; start?: string; end?: string; rent?: number; common?: number; deposit?: number; status?: string; patch?: Record<string, unknown>; photos?: string[] }): Promise<L> => {
    const tenantId = o.tenantId ?? A;
    const phone = newPhone();
    const party = await prisma.party.create({ data: { tenantId, name: o.name, phone } });
    const start = o.start ?? "2026-01-01", end = o.end ?? "2027-12-31";
    const l = await prisma.dormLease.create({ data: {
      tenantId, unitId: o.unitId, roomId: o.roomId, partyId: party.id, status: o.status ?? "ACTIVE", startDate: dbDate(start), endDate: dbDate(end),
      rentSatang: o.rent ?? RENT, commonFeeSatang: o.common ?? COMMON, depositSatang: o.deposit ?? DEP, advanceRentSatang: 0, bookingFeeSatang: 0,
      coTenants: { occupants: [], vehicles: [] }, policySnapshot: await snap(tenantId, o.unitId, o.typeId, o.roomId, o.patch), signedAt: new Date(), createdById: "qc-d12",
      moveInPhotos: (o.photos ?? []).map((fileId) => ({ fileId, kind: "ROOM_PHOTO", at: `${start}T03:00:00.000Z` })),
    } });
    const oc = await prisma.roomOccupancy.create({ data: { tenantId, unitId: o.unitId, roomId: o.roomId, startDate: dbDate(start), endDate: dbDate(addDays(end, 1)), kind: "LEASE", refType: "DormLease", refId: l.id } });
    await prisma.dormLease.update({ where: { id: l.id }, data: { occupancyId: oc.id } });
    return { leaseId: l.id, partyId: party.id, roomId: o.roomId, occupancyId: oc.id, unitId: o.unitId, typeId: o.typeId, phone };
  };
  let FIN = "";
  const dep = async (l: L, amount = DEP, tenantId = A) => {
    const r = await ACC.postSecurityDeposit({ tenantId, unitId: l.unitId, leaseId: l.leaseId, amountSatang: amount, idempotencyKey: `qc-d12-${stamp}-dep-${l.leaseId}`, partyId: l.partyId, financeAccountId: tenantId === A ? FIN : null, paidAt: BK("2025-10-28") });
    if (!r?.ok) throw new Error(`fixture รับประกัน ${l.leaseId}: ${codeOf(r)} ${r?.reason ?? ""}`);
    return r;
  };
  let payN = 0;
  const payDoc = async (unitId: string, docId: string, amount: number, ymd: string) => {
    const r = await ACC.recordExternalPayment({ tenantId: A, unitId, docId, amountSatang: amount, idempotencyKey: `qc-d12-${stamp}-pay-${++payN}`, paidAt: BK(ymd) });
    if (!r?.ok) throw new Error(`fixture รับชำระ ${docId}: ${codeOf(r)} ${r?.reason ?? ""}`);
    return r;
  };
  const runOf = async (unitId: string, P: string, status = "SENT") => {
    const r = await prisma.dormBillRun.findFirst({ where: { unitId, periodKey: P } });
    return r ?? prisma.dormBillRun.create({ data: { tenantId: A, unitId, periodKey: P, status, issueDate: dbDate(`${P}-01`), dueDate: dbDate(`${P}-05`), sentAt: status === "SENT" ? new Date() : null, createdById: "qc-d12" } });
  };
  /** บิลประวัติแบบที่ D.8 ออก (หน่วยมีมิเตอร์ FIXED_RATE) — ELEC/WATER meta.to = เลขที่ออกบิลแล้ว */
  const histBill = async (l: L, P: string, o: { elec: [number, number]; water: [number, number]; paid: boolean; name: string }) => {
    const run = await runOf(l.unitId, P);
    const bill = calc.buildDormBill({
      rentSatang: RENT, commonFeeSatang: 0,
      electricity: { kind: "METERED", segments: [{ start: o.elec[0], end: o.elec[1] }], method: { kind: "FIXED_RATE", satangPerUnit: ELEC_RATE } },
      water: { kind: "METERED", segments: [{ start: o.water[0], end: o.water[1] }], method: { kind: "FIXED_RATE", satangPerUnit: WATER_RATE } },
      vat: NOVAT,
    });
    const [py, pm] = P.split("-").map(Number);
    const issue = new Date(Date.UTC(py, pm - 2, 25)).toISOString().slice(0, 10);
    const inv = await ACC.createExternalInvoice({ tenantId: A, sourceKind: "DORM", unitId: l.unitId, refType: "DormBill", refId: `${l.leaseId}:${P}`, customer: { name: o.name }, partyId: l.partyId,
      lines: bridge.dormBillInvoiceLines(bill), vat: NOVAT, issueDate: issue, dueDate: `${P}-05` });
    if (!inv?.ok) throw new Error(`fixture ใบแจ้งหนี้ ${P}: ${codeOf(inv)} ${inv?.reason ?? ""}`);
    const b = await prisma.dormBill.create({ data: { tenantId: A, unitId: l.unitId, runId: run.id, leaseId: l.leaseId, roomId: l.roomId, partyId: l.partyId, periodKey: P, status: o.paid ? "PAID" : "SENT",
      lines: bill.lines, subtotalSatang: bill.subtotalSatang, vatSatang: bill.vatSatang, totalSatang: bill.totalSatang, dueDate: dbDate(`${P}-05`), accountDocumentId: inv.docId, sentAt: BK(issue), createdAt: BK(issue) } });
    if (o.paid) await payDoc(l.unitId, inv.docId, bill.totalSatang, `${P}-03`);
    return { billId: b.id as string, docId: inv.docId as string, total: bill.totalSatang as number };
  };
  const mkMeters = async (unitId: string, roomId: string, elecStart: number, waterStart: number) => {
    const e = await prisma.dormMeter.create({ data: { tenantId: A, unitId, roomId, kind: "ELEC", role: "ROOM", startReading: elecStart, digits: 5 } });
    const w = await prisma.dormMeter.create({ data: { tenantId: A, unitId, roomId, kind: "WATER", role: "ROOM", startReading: waterStart, digits: 4 } });
    return { ELEC: e.id as string, WATER: w.id as string };
  };
  const mkFile = async (tenantId: string, tag: string) =>
    (await prisma.fileAsset.create({ data: { tenantId, kind: "ATTACHMENT", path: `t/${tenantId}/private/qc-d12-${tag}-${stamp}.png`, cdnUrl: `private://qc-d12-${tag}-${stamp}`, contentType: "image/png", bytes: PNG.length } })).id as string;

  FIN = "";
  const BOOK = await mkBook(A, `บัญชีหอ D12 ${stamp}`);
  FIN = (await prisma.accountFinance.findFirst({ where: { tenantId: A, systemId: BOOK }, select: { id: true } }))?.id ?? "";
  const BOOK_B = await mkBook(B, `บัญชีหอ D12 B ${stamp}`);

  // ── ผู้ใช้ ──
  const OWN = await mkUser("owner", A, "OWNER", ["*"]);
  const OWNB = await mkUser("owner-b", B, "OWNER", ["*"]);
  const cO = { tenantId: A, actorUserId: OWN.id }, cB = { tenantId: B, actorUserId: OWNB.id };
  const mOwnerA = { role: "OWNER", unitAccess: ["*"], permissions: {}, userId: OWN.id };

  // ── หน่วย DM (มิเตอร์ · OUT_OF_SCOPE+เหตุผล · FIXED_RATE ไฟ ฿4.72 น้ำ ฿16) ──
  const DM = await mkUnit(A, "DORM", "m");
  await link(A, BOOK, DM);
  for (const [k, v] of [["rooms.legal.mode", "OUT_OF_SCOPE"], ["rooms.legal.outOfScopeReason", OOS_REASON], ["rooms.utility.elec.method", "FIXED_RATE"], ["rooms.utility.water.method", "FIXED_RATE"],
    ["rooms.utility.elec.fixedRate", ELEC_RATE], ["rooms.utility.water.fixedRate", WATER_RATE], ["rooms.deposit.damageCatalog", [{ code: "KEY_LOST", labelTh: "กุญแจหาย", amountSatang: 20_000 }]]] as [string, unknown][]) await U(A, DM, k, v);
  const tyM = await mkType(A, DM), bM = await mkBld(A, DM, "อาคาร M");
  const RM: Record<string, string> = {};
  for (const no of ["201", "202", "203", "204", "205", "206", "207", "208", "209", "210", "211"]) RM[no] = await mkRoom(A, DM, tyM, bM, no);
  const MTR: Record<string, { ELEC: string; WATER: string }> = {};
  for (const no of Object.keys(RM)) MTR[no] = await mkMeters(DM, RM[no], 1000, 300);
  const photoM1 = await mkFile(A, "movein-207");
  const M: Record<string, L> = {};
  const mSpec: [string, string, Partial<Parameters<typeof mkLease>[0]>][] = [
    ["M1", "207", { name: "ธนพล ศรีสุข", start: "2025-11-01", end: "2026-10-31", common: 0, photos: [photoM1] }],
    ["M2", "201", { name: "ผู้เช่า M2", start: "2025-11-01", end: "2027-10-31", common: 0 }],
    ["M3", "202", { name: "ผู้เช่า M3", start: "2025-11-01", end: "2027-10-31", common: 0, deposit: 300_000 }],
    ["M4", "203", { name: "ผู้เช่า M4", start: "2025-11-01", end: "2027-10-31", common: 0 }],
    ["M5", "204", { name: "ผู้เช่า M5", start: "2025-11-01", end: "2027-10-31", common: 0, deposit: 0 }],
    ["M6", "205", { name: "ผู้เช่า M6", start: "2025-11-01", end: "2027-10-31", common: 0 }],
    ["M7", "206", { name: "ผู้เช่า M7", start: "2025-11-01", end: "2027-10-31", common: 0, patch: { "rooms.deposit.returnDays": 10 } }],
    ["M8", "208", { name: "ผู้เช่า M8", start: "2025-11-01", end: "2027-10-31", common: 0 }],
    ["M9", "209", { name: "ผู้เช่า M9", start: "2025-11-01", end: "2027-10-31", common: 0 }],
    ["M10", "210", { name: "ผู้เช่า M10", start: "2025-11-01", end: "2027-10-31", common: 0 }],
  ];
  for (const [k, no, o] of mSpec) M[k] = await mkLease({ unitId: DM, roomId: RM[no], typeId: tyM, name: o.name ?? k, ...o, patch: { "rooms.lateFee.kind": "NONE", ...(o.patch ?? {}) } });
  const MD = await mkLease({ unitId: DM, roomId: RM["211"], typeId: tyM, name: "ผู้เช่า DRAFT", start: "2026-12-01", end: "2027-11-30", status: "DRAFT", common: 0 });
  for (const k of ["M1", "M2", "M3", "M4", "M6", "M7", "M8", "M9", "M10"]) await dep(M[k], k === "M3" ? 300_000 : DEP);
  // M1 = ห้อง 207 (README): MOVE_IN 1,000/300 · บิล ต.ค. ไฟ 1,880→2,000 น้ำ 375→383 (จ่ายแล้ว) · เลขจดงวด ต.ค. 2,104/387 ยังไม่ออกบิล
  for (const [kind, v] of [["ELEC", 1000], ["WATER", 300]] as const) await prisma.dormMeterReading.create({ data: { tenantId: A, unitId: DM, meterId: MTR["207"][kind], leaseId: M.M1.leaseId, periodKey: "2025-11", kind: "MOVE_IN", value: v, readAt: BK("2025-11-01", "09:00") } });
  for (const [kind, v] of [["ELEC", 2104], ["WATER", 387]] as const) await prisma.dormMeterReading.create({ data: { tenantId: A, unitId: DM, meterId: MTR["207"][kind], periodKey: "2026-10", kind: "PERIOD", value: v, readAt: BK("2026-10-25", "09:00") } });
  const HB: Record<string, { billId: string; docId: string; total: number }> = {};
  HB.M1 = await histBill(M.M1, "2026-10", { elec: [1880, 2000], water: [375, 383], paid: true, name: "ธนพล ศรีสุข" });
  for (const k of ["M2", "M3"]) HB[k] = await histBill(M[k], "2026-10", { elec: [500, 500], water: [100, 100], paid: false, name: `ผู้เช่า ${k}` });
  for (const k of ["M4", "M5", "M6", "M7", "M8", "M9", "M10"]) HB[k] = await histBill(M[k], "2026-10", { elec: [500, 500], water: [100, 100], paid: true, name: `ผู้เช่า ${k}` });
  HB.M6nov = await histBill(M.M6, "2026-11", { elec: [500, 500], water: [100, 100], paid: true, name: "ผู้เช่า M6" });

  // ── หน่วย DN (ไม่มีมิเตอร์ · STRICT · รอบบิล ต.ค. ผ่าน D.8 จริง) ──
  const DN = await mkUnit(A, "DORM", "n");
  await link(A, BOOK, DN);
  await U(A, DN, "rooms.utility.elec.metering", "NONE");
  await U(A, DN, "rooms.utility.water.metering", "NONE");
  const tyN = await mkType(A, DN), bN = await mkBld(A, DN, "อาคาร N");
  const N: Record<string, L> = {};
  const LF = { "rooms.lateFee.kind": "PER_DAY", "rooms.lateFee.amount": 5_000, "rooms.lateFee.capPerBill": 50_000, "rooms.lateFee.graceDays": 0 };
  for (let i = 1; i <= 20; i++) {
    const no = String(100 + i);
    const room = await mkRoom(A, DN, tyN, bN, no);
    const patch = i === 2 ? { "rooms.deposit.returnDays": 10 } : i === 3 || i === 6 ? LF : {};
    N[`N${i}`] = await mkLease({ unitId: DN, roomId: room, typeId: tyN, name: `ผู้เช่า N${i}`, patch });
    await dep(N[`N${i}`]);
  }
  const prep = (ctx: any, unitId: string, periodKey: string, now: string): Promise<any> => fn("prepareBillRun")!(ctx, { unitId, periodKey }, { now: new Date(now) });
  const sendAll = async (ctx: any, unitId: string, runId: string, now: string) => {
    let last: any = null;
    for (let i = 0; i < 40; i++) { last = await fn("sendBillRun")!(ctx, { unitId, runId }, { now: new Date(now) }); if (!last?.ok || last.done) break; }
    return last;
  };
  const billOf = async (leaseId: string, P: string): Promise<any> => prisma.dormBill.findFirst({ where: { leaseId, periodKey: P } });
  const NOCT: Record<string, any> = {};
  {
    let why = "";
    const r = fn("prepareBillRun") ? await prep(cO, DN, "2026-10", NOW_OCT) : { ok: false, code: "NO_D8" };
    const s = r?.ok ? await sendAll(cO, DN, r.runId, NOW_OCT) : null;
    for (const k of Object.keys(N)) NOCT[k] = await billOf(N[k].leaseId, "2026-10");
    const sent = Object.values(NOCT).filter((b: any) => b?.status === "SENT" && b?.accountDocumentId && b?.totalSatang === BASE).length;
    if (!(r?.ok === true && r.billCount === 20 && s?.ok === true && s.done === true && sent === 20)) why = J({ r: codeOf(r), c: r?.billCount, s: codeOf(s), sent });
    chk("PC-3", "D.8 บนหน่วยไม่มีน้ำไฟ (DN): เตรียม+ส่งรอบ ต.ค. 20 บิล × 480,000 · ใบแจ้งหนี้ครบ (ฐานของฉากหนี้ค้าง/ค่าปรับ/แข่งรอบบิล)", !why, why, "CRITICAL");
    if (why) throw new Error(`ฉากรอบ ต.ค. ไม่ผ่าน (PC-3) — ทำต่อไม่ได้: ${why}`);
  }
  for (const k of Object.keys(N)) if (k !== "N3" && k !== "N6") await payDoc(DN, NOCT[k].accountDocumentId, BASE, "2026-10-04");

  // ── DW (WARN) · DT (ย้ายห้อง) · DS (ต่อสัญญา) · DK (ควบคุม D.8 ข้ามใบย้ายออก) · ร้าน B ──
  const plainUnit = async (tag: string, extra: Record<string, unknown> = {}) => {
    const u = await mkUnit(A, "DORM", tag);
    await link(A, BOOK, u);
    await U(A, u, "rooms.utility.elec.metering", "NONE");
    await U(A, u, "rooms.utility.water.metering", "NONE");
    for (const [k, v] of Object.entries(extra)) await U(A, u, k, v);
    const ty = await mkType(A, u), b = await mkBld(A, u, `อาคาร ${tag}`);
    return { u, ty, b };
  };
  const DWx = await plainUnit("w", { "rooms.legal.mode": "WARN" });
  const DW = DWx.u;
  const W1 = await mkLease({ unitId: DW, roomId: await mkRoom(A, DW, DWx.ty, DWx.b, "601"), typeId: DWx.ty, name: "ผู้เช่า W1" });
  await dep(W1);
  const DTx = await plainUnit("t");
  const DT = DTx.u;
  const RT: Record<string, string> = {};
  for (const no of ["401", "402", "403", "404", "405", "406", "407", "408", "409"]) RT[no] = await mkRoom(A, DT, DTx.ty, DTx.b, no);
  const TL: Record<string, L> = {};
  for (const [k, no] of [["T1", "401"], ["T2", "402"], ["T3", "403"], ["T4", "404"]] as const) { TL[k] = await mkLease({ unitId: DT, roomId: RT[no], typeId: DTx.ty, name: `ผู้เช่า ${k}` }); await dep(TL[k]); }
  TL.T5 = await mkLease({ unitId: DT, roomId: RT["405"], typeId: DTx.ty, name: "ผู้เช่า T5", start: "2026-12-01", end: "2027-11-30" });
  await dep(TL.T5);
  for (const [P, now] of [["2026-10", NOW_OCT], ["2026-11", NOW_NOV]] as const) {
    const r = fn("prepareBillRun") ? await prep(cO, DT, P, now) : null;
    const s = r?.ok ? await sendAll(cO, DT, r.runId, now) : null;
    if (!(r?.ok && s?.ok && s.done)) throw new Error(`fixture รอบ ${P} DT: ${codeOf(r)} ${codeOf(s)}`);
    for (const k of ["T1", "T2", "T3", "T4"]) { const b = await billOf(TL[k].leaseId, P); if (b?.accountDocumentId) await payDoc(DT, b.accountDocumentId, b.totalSatang, `${P}-04`); }
  }
  const DSx = await plainUnit("s");
  const DS = DSx.u;
  const RS: Record<string, string> = {};
  for (const no of ["501", "502", "503", "504", "505", "506"]) RS[no] = await mkRoom(A, DS, DSx.ty, DSx.b, no);
  const SL: Record<string, L> = {};
  for (const [k, no] of [["R1", "501"], ["R2", "502"], ["R3", "503"], ["R4", "504"]] as const) { SL[k] = await mkLease({ unitId: DS, roomId: RS[no], typeId: DSx.ty, name: `ผู้เช่า ${k}`, end: "2026-12-31" }); await dep(SL[k]); }
  SL.E1 = await mkLease({ unitId: DS, roomId: RS["505"], typeId: DSx.ty, name: "ผู้เช่า E1", start: "2025-10-16", end: "2026-10-15" });
  await prisma.dormLease.update({ where: { id: SL.R3.leaseId }, data: { status: "NOTICE" } });
  await prisma.roomOccupancy.create({ data: { tenantId: A, unitId: DS, roomId: RS["504"], startDate: dbDate("2027-01-10"), endDate: dbDate("2027-02-01"), kind: "BLOCK", refType: "QcBlock", refId: `blk-${stamp}` } });
  const PCL = await mkLease({ unitId: DS, roomId: RS["506"], typeId: DSx.ty, name: "ผู้เช่าควบคุม", end: "2026-12-31" });
  await dep(PCL, 100_000);
  const DKx = await plainUnit("k");
  const DK = DKx.u;
  const K1 = await mkLease({ unitId: DK, roomId: await mkRoom(A, DK, DKx.ty, DKx.b, "801"), typeId: DKx.ty, name: "ผู้เช่า K1" });
  const K2 = await mkLease({ unitId: DK, roomId: await mkRoom(A, DK, DKx.ty, DKx.b, "802"), typeId: DKx.ty, name: "ผู้เช่า K2" });
  const DB_ = await mkUnit(B, "DORM", "bx");
  await link(B, BOOK_B, DB_);
  const tyB = await mkType(B, DB_), bB = await mkBld(B, DB_, "อาคาร B");
  const BL = await mkLease({ tenantId: B, unitId: DB_, roomId: await mkRoom(B, DB_, tyB, bB, "701"), typeId: tyB, name: "ผู้เช่าร้าน B" });
  const fileB = await mkFile(B, "foreign"), fileAloose = await mkFile(A, "loose");

  const CARE = await mkUser("care", A, "STAFF", [DM, DN, DW, DT, DS], ["dorm.view", "dorm.moveout.manage"]);
  const LEASEM = await mkUser("leasem", A, "STAFF", [DT, DS], ["dorm.view", "dorm.lease.manage"]);
  const VIEW = await mkUser("view", A, "STAFF", [DM, DN], ["dorm.view"]);
  const OTHERU = await mkUser("otherunit", A, "STAFF", [DW], ["dorm.view", "dorm.moveout.manage"]);
  const PEND = await mkUser("pend", A, "MANAGER", [DM, DN], [], false);
  const REV = await mkUser("revoke", A, "STAFF", [DN], ["dorm.view", "dorm.moveout.manage"]);
  const cCare = { tenantId: A, actorUserId: CARE.id }, cLease = { tenantId: A, actorUserId: LEASEM.id }, cView = { tenantId: A, actorUserId: VIEW.id };
  const cOther = { tenantId: A, actorUserId: OTHERU.id }, cPend = { tenantId: A, actorUserId: PEND.id }, cRev = { tenantId: A, actorUserId: REV.id };
  let policyWhy = "";
  try { await APS.createPolicy({ tenantId: A }, { name: "หักประกันเกินวงเงิน", entityType: "dorm.moveout.deduction", steps: [{ order: 1, approverRole: "OWNER" }] }); }
  catch (e) { policyWhy = `สร้างนโยบายอนุมัติ dorm.moveout.deduction ไม่ได้: ${errMsg(e)}`; console.log(`  (${policyWhy})`); }

  // ── ตัวช่วยเรียก facade ──
  const notice = async (ctx: any, l: L, moveOutDate: string, nowYmd: string, extra: Record<string, unknown> = {}): Promise<any> =>
    fn("giveMoveOutNotice")!(ctx, { unitId: l.unitId, leaseId: l.leaseId, moveOutDate, ...extra }, { now: BK(nowYmd, "10:00") });
  const moRow = (l: L): Promise<any> => prisma.dormMoveOut.findFirst({ where: { leaseId: l.leaseId } });
  const MO: Record<string, string> = {};
  const moId = async (k: string, l: L) => { const r = await moRow(l); if (r) MO[k] = r.id; return MO[k] ?? ""; };
  const files = async (ctx: any, l: L, mo: string, n = 1): Promise<string[]> => {
    if (!fn("addMoveOutFiles")) return [];
    const r = await fn("addMoveOutFiles")!(ctx, { unitId: l.unitId, moveOutId: mo, files: Array.from({ length: n }, (_, i) => ({ data: i % 2 ? JPEG : PNG, contentType: i % 2 ? "image/jpeg" : "image/png", filename: `ev-${i}.png` })) }, { put: putNoop });
    return r?.ok ? (r.added ?? []).map((a: any) => a.fileId) : [];
  };
  const inspect = async (ctx: any, l: L, mo: string, items: any[], meters: { meterId: string; value: number }[], nowYmd: string): Promise<any> =>
    fn("recordMoveOutInspection")!(ctx, { unitId: l.unitId, moveOutId: mo, items, meterReadings: meters }, { now: BK(nowYmd, "11:00") });
  const summary = async (ctx: any, l: L, mo: string, now: Date): Promise<any> => fn("moveOutSummary")!(ctx, { unitId: l.unitId, moveOutId: mo }, { now });
  const sendSum = async (ctx: any, l: L, mo: string, now: Date): Promise<any> => fn("sendMoveOutSummary")!(ctx, { unitId: l.unitId, moveOutId: mo }, { now });
  const settle = async (ctx: any, l: L, mo: string, now: Date): Promise<any> => fn("settleMoveOut")!(ctx, { unitId: l.unitId, moveOutId: mo, refund: { channel: "TRANSFER", financeAccountId: FIN } }, { now });
  const rootRef = (l: L) => `${l.unitId}:${l.leaseId}`;
  const settleJvs = async (unitId: string, rootLeaseId: string) =>
    (await prisma.accountJournalEntry.findMany({ where: { tenantId: A, refType: "DormSecurityDeposit", refId: `${unitId}:${rootLeaseId}`, status: "POSTED", reversalOfId: null },
      select: { id: true, idempotencyKey: true, createdAt: true, lines: { select: { debit: true, credit: true, account: { select: { code: true } } } } } }))
      .filter((e: any) => (e.idempotencyKey ?? "").includes("#SETTLE:"));
  const depJvCount = async () => prisma.accountJournalEntry.count({ where: { tenantId: A, refType: "DormSecurityDeposit" } });
  const moDocs = async (mo: string) => prisma.accountDocument.findMany({ where: { tenantId: A, refType: "DormMoveOut", refId: { startsWith: mo } }, orderBy: { createdAt: "asc" } });
  const held = async (l: L, root?: string) => ACC.securityDepositHeld({ tenantId: A, unitId: l.unitId, leaseId: root ?? l.leaseId });
  const outbox = async (type: string, pred: (p: any) => boolean = () => true) => (await prisma.outboxEvent.findMany({ where: { tenantId: A, type }, orderBy: { createdAt: "asc" } })).filter((e: any) => pred(e.payload ?? {}));
  const keysEq = (p: any, want: string[]) => J(Object.keys(p ?? {}).sort()) === J([...want].sort());
  const noPii = (x: unknown, phones: string[]) => { const s = J(x); return !PHONE_RE.test(s) && !phones.some((p) => s.includes(p) || s.includes(p.slice(-8))); };
  const lineAmt = (s: any, code: string) => (s?.lines ?? []).filter((x: any) => x.code === code).reduce((a: number, x: any) => a + Number(x.amountSatang ?? 0), 0);
  const TERMINAL = ["SETTLED", "REFUNDED"];
  const acctSnapshot = async () => ({
    jv: new Set<string>((await prisma.accountJournalEntry.findMany({ where: { tenantId: A }, select: { id: true } })).map((r: any) => r.id)),
    doc: new Set<string>((await prisma.accountDocument.findMany({ where: { tenantId: A }, select: { id: true } })).map((r: any) => r.id)),
  });
  const ACCT0 = await acctSnapshot();

  // ═══════════════ PC-4 … PC-8 ═══════════════
  {
    let why = "";
    try {
      const inv = await ACC.createExternalInvoice({ tenantId: A, sourceKind: "DORM", unitId: DS, refType: "QcControl", refId: `pc-${stamp}`, customer: { name: "ผู้เช่าควบคุม" }, partyId: PCL.partyId,
        lines: [{ description: "ค่าเสียหาย (ควบคุม)", qty: 1, unitPriceSatang: 30_000, taxKind: "NONE" }], vat: NOVAT, issueDate: "2026-10-20", dueDate: "2026-10-20" });
      const s = inv?.ok ? await ACC.settleSecurityDeposit({ tenantId: A, unitId: DS, leaseId: PCL.leaseId, idempotencyKey: `qc-d12-${stamp}-pc-settle`, applyToDocIds: [inv.docId], refund: { channel: "TRANSFER", financeAccountId: FIN } }) : null;
      const jv = await settleJvs(DS, PCL.leaseId);
      const dr = jv[0]?.lines.reduce((a: number, x: any) => a + x.debit, 0), cr = jv[0]?.lines.reduce((a: number, x: any) => a + x.credit, 0);
      if (!(s?.ok && s.appliedSatang === 30_000 && s.refundSatang === 70_000 && jv.length === 1 && dr === 100_000 && cr === 100_000 && (await held(PCL)) === 0)) why = J({ inv: codeOf(inv), s, jv: jv.length, dr, cr });
    } catch (e) { why = `throw: ${errMsg(e)}`; }
    chk("PC-4", "settleSecurityDeposit D.2 (ทางเงินเดียวของใบนี้): ประกัน 100,000 หักใบ 30,000 ⇒ คืน 70,000 · JV ปิด 1 รายการสมดุล · ยอดถือ 0", !why, why, "CRITICAL");
  }
  {
    let why = "";
    try {
      await prisma.dormMoveOut.create({ data: { tenantId: A, unitId: DK, leaseId: K1.leaseId, status: "NOTICE", moveOutDate: dbDate("2026-10-31"), createdById: "qc-d12" } });
      const r = await prep(cO, DK, "2026-11", NOW_NOV);
      const b1 = await billOf(K1.leaseId, "2026-11"), b2 = await billOf(K2.leaseId, "2026-11");
      if (!(r?.ok && !b1 && b2)) why = J({ r: codeOf(r), b1: !!b1, b2: !!b2 });
    } catch (e) { why = `throw: ${errMsg(e)}`; }
    chk("PC-5", "D.8 มติ 5: สัญญาที่มี DormMoveOut (ไม่ CANCELLED) วันออก ≤ สิ้นเดือนค่าห้อง ⇒ รอบบิลข้าม (K1 ไม่มีบิล พ.ย. · K2 มี)", !why, why, "CRITICAL");
  }
  let ledgerN3: any = null;
  {
    ledgerN3 = await fn("lateFeeLedger")?.(cO, { unitId: DN, leaseId: N.N3.leaseId }, { now: BK("2026-11-10") });
    chk("PC-6", "lateFeeLedger D.11: N3 ค้างบิล ต.ค. (ปรับวันละ ฿50 เพดาน ฿500) ณ 10 พ.ย. ⇒ ค่าปรับค้าง 50,000 ยังไม่ลงบิล (ฐานของบรรทัด LATE_FEE ในใบย้ายออก)",
      ledgerN3?.totalDueSatang === 50_000 && ledgerN3?.totalChargedSatang === 0, J(ledgerN3 && { due: ledgerN3.totalDueSatang, charged: ledgerN3.totalChargedSatang }), "CRITICAL");
  }
  {
    const rs = await fanout("lateFeeLedger", cO, Array.from({ length: 12 }, () => ({ unitId: DN, leaseId: N.N3.leaseId })), { now: ISO("2026-11-10") }, 4, 6_000);
    chk("PC-7", "ตัวยิง 4 โพรเซส × 3 คำขอทำงาน (อ่าน lateFeeLedger 12 ทาง ผลเท่ากัน · ไม่มี throw)", rs.length === 12 && rs.every((r) => r?.totalDueSatang === 50_000), J(rs.map((r) => r?.totalDueSatang ?? r?.childFail ?? r?.threw).slice(0, 4)), "CRITICAL");
  }
  {
    const a = await ROOMS?.setHkStatus?.({ tenantId: A }, { unitId: DS, roomId: RS["506"], hkStatus: "DIRTY" });
    const r1 = await prisma.hotelRoom.findFirst({ where: { id: RS["506"] }, select: { hkStatus: true } });
    const b = await ROOMS?.setHkStatus?.({ tenantId: A }, { unitId: DS, roomId: RS["506"], hkStatus: "CLEAN" });
    chk("PC-8", "rooms.setHkStatus R0.8 (ทางเปลี่ยนห้องเป็นทำความสะอาด): DIRTY แล้วคืน CLEAN", a?.ok && r1?.hkStatus === "DIRTY" && b?.ok, J({ a, r1, b }), "CRITICAL");
  }

  // ═══════════════ N. แจ้งย้ายออก ═══════════════
  console.log("\n── N แจ้งย้ายออก ──");
  await U(A, DM, "rooms.moveout.noticeDays", 60);   // ค่าปัจจุบันของหน่วยเปลี่ยน — สัญญาใช้ snapshot (30)
  await T("N-1", "แจ้งย้ายออก 207 (30 ก.ย. → 31 ต.ค.): ok · noticeDays จาก snapshot 30 (ไม่ใช่ค่าหน่วยใหม่ 60) · ไม่สั้น · ครบคืน 2026-11-07 · ใบ NOTICE · สัญญา NOTICE", ["giveMoveOutNotice"], async () => {
    const r = await notice(cO, M.M1, "2026-10-31", "2026-09-30");
    const mo = await moRow(M.M1), l = await prisma.dormLease.findFirst({ where: { id: M.M1.leaseId } });
    if (mo) MO.M1 = mo.id;
    return [r?.ok === true && r.duplicate === false && r.moveOutId === mo?.id && r.noticeDays === 30 && r.shortNotice === false && r.refundDueDate === "2026-11-07" && r.moveOutDate === "2026-10-31"
      && mo?.status === "NOTICE" && ymdOf(mo?.moveOutDate) === "2026-10-31" && l?.status === "NOTICE", J({ r, mo: mo && [mo.status, ymdOf(mo.moveOutDate)], l: l?.status })];
  });
  for (const k of ["M2", "M3", "M4", "M5", "M8", "M9", "M10"]) { await notice(cO, M[k], "2026-10-31", "2026-09-30").catch(() => null); await moId(k, M[k]); }
  await notice(cO, M.M6, "2026-12-15", "2026-09-30").catch(() => null); await moId("M6", M.M6);
  const nNotices: [string, string][] = [["N1", "2026-11-15"], ["N3", "2026-11-10"], ["N4", "2026-10-31"], ["N5", "2026-10-31"], ["N6", "2026-11-10"],
    ["N7", "2026-10-31"], ["N8", "2026-10-31"], ["N9", "2026-10-31"], ["N10", "2026-10-31"], ["N11", "2026-10-31"], ["N12", "2026-10-31"], ["N15", "2026-11-30"]];
  if (fn("giveMoveOutNotice")) for (const [k, d] of nNotices) { await notice(cO, N[k], d, "2026-10-01").catch(() => null); await moId(k, N[k]); }
  await T("N-2", "ห้องว่างตามวันออก (N1 สัญญาถึง 2027-12-31 · ออก 15 พ.ย.): endDate = 2026-11-15 · occupancy จบ 2026-11-16 (ไม่รวม) · วันจบเดิมเก็บใน inspection.originalEndDate", ["giveMoveOutNotice"], async () => {
    const l = await prisma.dormLease.findFirst({ where: { id: N.N1.leaseId } });
    const oc = await prisma.roomOccupancy.findFirst({ where: { id: N.N1.occupancyId } });
    const mo = await moRow(N.N1);
    return [ymdOf(l?.endDate) === "2026-11-15" && ymdOf(oc?.endDate) === "2026-11-16" && oc?.active === true && (mo?.inspection as any)?.originalEndDate === "2027-12-31", J({ end: ymdOf(l?.endDate), oc: ymdOf(oc?.endDate), orig: (mo?.inspection as any)?.originalEndDate })];
  });
  await T("N-3", "แจ้งสั้นกว่า 30 วัน (W1 · 10 ต.ค. → 20 ต.ค.): ไม่มีเหตุผล ⇒ SHORT_NOTICE ไม่มีแถว · มีเหตุผล ≥ 10 ตัว ⇒ ok shortNotice + AuditLog dorm.moveout.short_notice", ["giveMoveOutNotice"], async () => {
    const a = await notice(cO, W1, "2026-10-20", "2026-10-10");
    const none = await moRow(W1);
    const b = await notice(cO, W1, "2026-10-20", "2026-10-10", { shortNoticeReason: "ผู้เช่าย้ายงานกะทันหันไปต่างจังหวัด" });
    const mo = await moRow(W1);
    if (mo) MO.W1 = mo.id;
    const au = await prisma.auditLog.count({ where: { tenantId: A, action: "dorm.moveout.short_notice", targetId: mo?.id ?? "-" } });
    return [failOk(a, "SHORT_NOTICE") && !none && b?.ok === true && b.shortNotice === true && au === 1, J({ a: codeOf(a), none: !!none, b: b && [codeOf(b), b.shortNotice], au })];
  });
  await T("N-4", "วันออกผิด: หลังวันจบสัญญา ⇒ AFTER_LEASE_END · ก่อนวันเริ่ม/รูปแบบผิด ⇒ INVALID_INPUT · สัญญา DRAFT ⇒ NOT_EDITABLE · ไม่มีแถวเกิด", ["giveMoveOutNotice"], async () => {
    const x = N.N16;
    const a = await notice(cO, x, "2028-01-15", "2026-10-01"), b = await notice(cO, x, "2025-12-01", "2026-10-01"), c = await notice(cO, x, "31/12/2026", "2026-10-01");
    const d = await notice(cO, MD, "2027-01-31", "2026-10-01");
    const rows = await prisma.dormMoveOut.count({ where: { leaseId: { in: [x.leaseId, MD.leaseId] } } });
    return [failOk(a, "AFTER_LEASE_END") && failOk(b, "INVALID_INPUT") && failOk(c, "INVALID_INPUT") && failOk(d, "NOT_EDITABLE") && rows === 0, J([codeOf(a), codeOf(b), codeOf(c), codeOf(d), rows])];
  });
  await T("N-5", "กำหนดคืน: STRICT + snapshot 10 วัน (N2 ออก 20 พ.ย.) ⇒ ตัดเหลือ 7 = 2026-11-27 + legal DEPOSIT_RETURN_DAYS · นอกขอบเขต + 10 วัน (M7 ออก 31 ต.ค.) ⇒ 2026-11-10", ["giveMoveOutNotice"], async () => {
    const a = await notice(cO, N.N2, "2026-11-20", "2026-10-01");
    const b = await notice(cO, M.M7, "2026-10-31", "2026-09-30");
    await moId("M7", M.M7);
    await moId("N2", N.N2);
    return [a?.ok === true && a.refundDueDate === "2026-11-27" && a.legal?.code === "DEPOSIT_RETURN_DAYS" && b?.ok === true && b.refundDueDate === "2026-11-10", J({ a: a && [codeOf(a), a.duplicate, a.refundDueDate, a.legal], b: b && [codeOf(b), b.refundDueDate] })];
  });
  await T("N-6", "แจ้งซ้ำวันเดิม ⇒ ok duplicate:true id เดิม · วันต่าง ⇒ ALREADY_NOTICED", ["giveMoveOutNotice"], async () => {
    const a = await notice(cO, M.M1, "2026-10-31", "2026-09-30"), b = await notice(cO, M.M1, "2026-10-30", "2026-09-30");
    return [a?.ok === true && a.duplicate === true && a.moveOutId === MO.M1 && failOk(b, "ALREADY_NOTICED"), J([codeOf(a), a?.duplicate, codeOf(b)])];
  });
  await T("N-7", "แจ้งพร้อมกัน 12 ทาง (4 โพรเซส × 3 · N13): แถวเดียว · ok ทั้งหมด · duplicate:false ตัวเดียว · occupancy จบ 2026-11-01", ["giveMoveOutNotice"], async () => {
    const rs = await fanout("giveMoveOutNotice", cO, Array.from({ length: 12 }, () => ({ unitId: DN, leaseId: N.N13.leaseId, moveOutDate: "2026-10-31" })), { now: ISO("2026-10-01", "10:00") });
    const rows = await prisma.dormMoveOut.findMany({ where: { leaseId: N.N13.leaseId } });
    const oc = await prisma.roomOccupancy.findFirst({ where: { id: N.N13.occupancyId } });
    if (rows[0]) MO.N13 = rows[0].id;
    return [rows.length === 1 && rs.every((r) => r?.ok === true) && rs.filter((r) => r.duplicate === false).length === 1 && ymdOf(oc?.endDate) === "2026-11-01", J({ rows: rows.length, codes: rs.map(codeOf), dups: rs.map((r) => r?.duplicate) })];
  });
  await T("N-8", "ยกเลิกแจ้ง (N14): CANCELLED · สัญญากลับ ACTIVE · endDate/occupancy คืนเดิม · แจ้งใหม่ใช้แถวเดิม (id เดิม · NOTICE)", ["giveMoveOutNotice", "cancelMoveOut"], async () => {
    const a = await notice(cO, N.N14, "2026-11-30", "2026-10-01");
    const c = await fn("cancelMoveOut")!(cO, { unitId: DN, moveOutId: a?.moveOutId ?? "-", reason: "ผู้เช่าเปลี่ยนใจอยู่ต่อ" }, { now: BK("2026-10-02") });
    const mo = await moRow(N.N14), l = await prisma.dormLease.findFirst({ where: { id: N.N14.leaseId } }), oc = await prisma.roomOccupancy.findFirst({ where: { id: N.N14.occupancyId } });
    const again = await notice(cO, N.N14, "2026-11-30", "2026-10-03");
    const mo2 = await moRow(N.N14);
    if (mo2) MO.N14 = mo2.id;
    return [c?.ok === true && mo?.status === "CANCELLED" && l?.status === "ACTIVE" && ymdOf(l?.endDate) === "2027-12-31" && ymdOf(oc?.endDate) === "2028-01-01" && again?.ok === true && mo2?.id === mo?.id && mo2?.status === "NOTICE",
      J({ c: codeOf(c), mo: mo?.status, l: [l?.status, ymdOf(l?.endDate)], oc: ymdOf(oc?.endDate), again: codeOf(again), same: mo2?.id === mo?.id })];
  });
  await T("N-9", "ยกเลิกไม่ได้เมื่อห้องถูกจองต่อแล้ว (N15 · ช่วงหลังวันออกถูก BLOCK) ⇒ CANCEL_BLOCKED · ไม่เปลี่ยนอะไร", ["cancelMoveOut"], async () => {
    await prisma.roomOccupancy.create({ data: { tenantId: A, unitId: DN, roomId: N.N15.roomId, startDate: dbDate("2026-12-01"), endDate: dbDate("2026-12-10"), kind: "BLOCK", refType: "QcBlock", refId: `blk15-${stamp}` } });
    const c = await fn("cancelMoveOut")!(cO, { unitId: DN, moveOutId: MO.N15 ?? "-", reason: "ทดสอบยกเลิก" }, { now: BK("2026-10-05") });
    const mo = await moRow(N.N15), l = await prisma.dormLease.findFirst({ where: { id: N.N15.leaseId } });
    return [failOk(c, "CANCEL_BLOCKED") && mo?.status === "NOTICE" && l?.status === "NOTICE" && ymdOf(l?.endDate) === "2026-11-30", J({ c: codeOf(c), mo: mo?.status, l: [l?.status, ymdOf(l?.endDate)] })];
  });

  // ═══════════════ I. ตรวจห้อง ═══════════════
  console.log("\n── I ตรวจห้อง · หลักฐาน · มิเตอร์วันออก ──");
  let ev207: string[] = [];
  await T("I-1", "แนบหลักฐาน (207): png+jpeg ⇒ ok 2 ไฟล์ · FileAsset private · svg ⇒ INVALID_FILE ไม่อัปอะไร", ["addMoveOutFiles"], async () => {
    const before = await prisma.fileAsset.count({ where: { tenantId: A } });
    ev207 = await files(cO, M.M1, MO.M1 ?? "-", 2);
    const bad = await fn("addMoveOutFiles")!(cO, { unitId: DM, moveOutId: MO.M1 ?? "-", files: [{ data: PNG, contentType: "image/png" }, { data: SVG, contentType: "image/svg+xml" }] }, { put: putNoop });
    const after = await prisma.fileAsset.count({ where: { tenantId: A } });
    const fa = await prisma.fileAsset.findMany({ where: { id: { in: ev207 } } });
    return [ev207.length === 2 && fa.length === 2 && fa.every((f: any) => /\/private\//.test(f.path)) && failOk(bad, "INVALID_FILE") && after === before + 2, J({ ev: ev207.length, paths: fa.map((f: any) => f.path.slice(0, 40)), bad: codeOf(bad), d: after - before })];
  });
  const evN4 = await files(cO, N.N4, MO.N4 ?? "-", 1);
  if (fn("giveMoveOutNotice") && !MO.W1) await moId("W1", W1);
  const evW1 = await files(cO, W1, MO.W1 ?? "-", 1);
  const meters207 = (e: number, w: number) => [{ meterId: MTR["207"].ELEC, value: e }, { meterId: MTR["207"].WATER, value: w }];
  await T("I-2", "ค่าเสื่อมปกติ (NORMAL + ยอด) ⇒ LEGAL_BLOCK DEDUCT_NORMAL_WEAR ทุกโหมด (นอกขอบเขต · STRICT · WARN) · ไม่บันทึกอะไร", ["recordMoveOutInspection"], async () => {
    const it = [{ key: "wall", labelTh: "ผนัง · สี", verdict: "NORMAL", amountSatang: 10_000, evidenceFileIds: [] }];
    const a = await inspect(cO, M.M1, MO.M1 ?? "-", it, meters207(2126, 389), "2026-10-31");
    const b = await inspect(cO, N.N4, MO.N4 ?? "-", [{ ...it[0], evidenceFileIds: evN4 }], [], "2026-10-31");
    const c = await inspect(cO, W1, MO.W1 ?? "-", [{ ...it[0], evidenceFileIds: evW1 }], [], "2026-10-20");
    const rows = await prisma.dormMoveOut.findMany({ where: { id: { in: [MO.M1, MO.N4, MO.W1].filter(Boolean) } }, select: { status: true } });
    return [legalOk(a, "DEDUCT_NORMAL_WEAR") && legalOk(b, "DEDUCT_NORMAL_WEAR") && legalOk(c, "DEDUCT_NORMAL_WEAR") && rows.every((r: any) => r.status === "NOTICE"), J([codeOf(a), a?.legal?.code, b?.legal?.code, c?.legal?.code, rows.map((r: any) => r.status)])];
  });
  await T("I-3", "เสียหายไม่มีหลักฐาน ⇒ LEGAL_BLOCK DEDUCT_NO_EVIDENCE ทุกโหมด (รวมนอกขอบเขตที่ตัวตรวจปล่อย — มติ 5)", ["recordMoveOutInspection"], async () => {
    const it = [{ key: "screen", labelTh: "มุ้งลวดหน้าต่าง", verdict: "DAMAGE", amountSatang: 35_000, evidenceFileIds: [] }];
    const a = await inspect(cO, M.M1, MO.M1 ?? "-", it, meters207(2126, 389), "2026-10-31");
    const b = await inspect(cO, N.N4, MO.N4 ?? "-", it, [], "2026-10-31");
    const c = await inspect(cO, W1, MO.W1 ?? "-", it, [], "2026-10-20");
    return [legalOk(a, "DEDUCT_NO_EVIDENCE") && legalOk(b, "DEDUCT_NO_EVIDENCE") && legalOk(c, "DEDUCT_NO_EVIDENCE"), J([codeOf(a), a?.legal?.code, b?.legal?.code, c?.legal?.code])];
  });
  await T("I-4", "หลักฐานต้องแนบใบนี้: ไฟล์ร้าน B · ไฟล์ร้านเดียวกันที่ไม่ได้แนบใบนี้ · ไฟล์ที่แนบใบย้ายออกอื่น ⇒ DEDUCT_NO_EVIDENCE", ["recordMoveOutInspection"], async () => {
    const mk = (f: string) => [{ key: "screen", labelTh: "มุ้งลวดหน้าต่าง", verdict: "DAMAGE", amountSatang: 35_000, evidenceFileIds: [f] }];
    const a = await inspect(cO, M.M1, MO.M1 ?? "-", mk(fileB), meters207(2126, 389), "2026-10-31");
    const b = await inspect(cO, M.M1, MO.M1 ?? "-", mk(fileAloose), meters207(2126, 389), "2026-10-31");
    const c = await inspect(cO, M.M1, MO.M1 ?? "-", mk(evN4[0] ?? "-"), meters207(2126, 389), "2026-10-31");
    return [legalOk(a, "DEDUCT_NO_EVIDENCE") && legalOk(b, "DEDUCT_NO_EVIDENCE") && legalOk(c, "DEDUCT_NO_EVIDENCE"), J([codeOf(a), a?.legal?.code, b?.legal?.code, c?.legal?.code])];
  });
  const items207 = () => [
    { key: "wall", labelTh: "ผนัง · สี", verdict: "NORMAL", note: "รอยเทปกาวจาง ๆ" },
    { key: "screen", labelTh: "มุ้งลวดหน้าต่าง", verdict: "DAMAGE", amountSatang: 35_000, evidenceFileIds: [ev207[0] ?? "-"], note: "ขาด 20 ซม." },
    { key: "keys", labelTh: "กุญแจห้อง", verdict: "DAMAGE", amountSatang: 20_000, evidenceFileIds: [ev207[1] ?? "-"], note: "คืน 1 จาก 2 ดอก" },
    { key: "appliance", labelTh: "แอร์ · ตู้เย็น · ทีวี", verdict: "NORMAL" },
    { key: "furniture", labelTh: "เฟอร์นิเจอร์", verdict: "NORMAL" },
  ];
  await T("I-5", "ตรวจห้อง 207 ตามภาพ (มุ้งลวด ฿350 · กุญแจ ฿200 มีหลักฐาน · ที่เหลือปกติ) + มิเตอร์ 2,126/389 ⇒ INSPECTED · หัก 55,000 · ไม่ต้องอนุมัติ · MOVE_OUT 2 แถว (leaseId) · ส่งซ้ำไม่เพิ่มแถว", ["recordMoveOutInspection"], async () => {
    const a = await inspect(cO, M.M1, MO.M1 ?? "-", items207(), meters207(2126, 389), "2026-10-31");
    const b = await inspect(cO, M.M1, MO.M1 ?? "-", items207(), meters207(2126, 389), "2026-10-31");
    const rd = await prisma.dormMeterReading.findMany({ where: { leaseId: M.M1.leaseId, kind: "MOVE_OUT" } });
    const mo = await moRow(M.M1);
    return [a?.ok === true && a.status === "INSPECTED" && a.deductSatang === 55_000 && a.needsApproval === false && b?.ok === true && rd.length === 2 && J(rd.map((r: any) => r.value).sort((x: number, y: number) => x - y)) === J([389, 2126]) && mo?.status === "INSPECTED" && mo?.deductSatang === 55_000,
      J({ a: a && [codeOf(a), a.deductSatang, a.needsApproval], b: codeOf(b), rd: rd.map((r: any) => r.value), mo: mo && [mo.status, mo.deductSatang] })];
  });
  await T("I-6", "มิเตอร์: ของห้องอื่น ⇒ NOT_FOUND · ต่ำกว่าเลขฐานที่ออกบิลแล้ว (1,999 < 2,000) ⇒ METER_BACKWARDS · ไม่ทับค่าที่บันทึก", ["recordMoveOutInspection"], async () => {
    const a = await inspect(cO, M.M1, MO.M1 ?? "-", items207(), [{ meterId: MTR["201"].ELEC, value: 600 }, { meterId: MTR["207"].WATER, value: 389 }], "2026-10-31");
    const b = await inspect(cO, M.M1, MO.M1 ?? "-", items207(), meters207(1999, 389), "2026-10-31");
    const rd = await prisma.dormMeterReading.findFirst({ where: { leaseId: M.M1.leaseId, kind: "MOVE_OUT", meterId: MTR["207"].ELEC } });
    return [failOk(a, "NOT_FOUND") && failOk(b, "METER_BACKWARDS") && rd?.value === 2126, J([codeOf(a), codeOf(b), rd?.value])];
  });
  const mItems = (k: string, ev: string[], amount: number, extra: any[] = []) => [{ key: "screen", labelTh: "มุ้งลวดหน้าต่าง", verdict: "DAMAGE", amountSatang: amount, evidenceFileIds: ev }, ...extra];
  const mMeters = (no: string, e = 500, w = 100) => [{ meterId: MTR[no].ELEC, value: e }, { meterId: MTR[no].WATER, value: w }];
  await T("I-7", "แคตตาล็อกค่าเสียหาย (#49): damageCode KEY_LOST ไม่ส่งยอด ⇒ ราคาแคตตาล็อก 20,000 (M2 หักรวม 55,000) · โค้ดที่ไม่มี ⇒ INVALID_INPUT", ["recordMoveOutInspection"], async () => {
    const ev = await files(cO, M.M2, MO.M2 ?? "-", 2);
    const bad = await inspect(cO, M.M2, MO.M2 ?? "-", mItems("M2", [ev[0]], 35_000, [{ key: "keys", labelTh: "กุญแจห้อง", verdict: "DAMAGE", damageCode: "NOPE", evidenceFileIds: [ev[1]] }]), mMeters("201"), "2026-10-31");
    const ok = await inspect(cO, M.M2, MO.M2 ?? "-", mItems("M2", [ev[0]], 35_000, [{ key: "keys", labelTh: "กุญแจห้อง", verdict: "DAMAGE", damageCode: "KEY_LOST", evidenceFileIds: [ev[1]] }]), mMeters("201"), "2026-10-31");
    return [failOk(bad, "INVALID_INPUT") && ok?.ok === true && ok.deductSatang === 55_000, J([codeOf(bad), codeOf(ok), ok?.deductSatang])];
  });

  // ═══════════════ M. สรุปเงิน ═══════════════
  console.log("\n── M สรุปเงิน ──");
  const AT207 = BK("2026-10-31", "11:05");
  let s207: any = null;
  await T("M-1", "สรุป 207 ทุกสตางค์ (README): ประกัน 900,000 · ไฟ 126×4.72 = 59,472 · น้ำ 6×16 = 9,600 · มุ้งลวด 35,000 · กุญแจ 20,000 · ค้าง 0 ⇒ คืน 775,928 · ครบคืน 2026-11-07 · เหลือ 7 วัน (31 ต.ค. 11:05)", ["moveOutSummary"], async () => {
    s207 = await summary(cO, M.M1, MO.M1 ?? "-", AT207);
    const e = (s207?.lines ?? []).find((x: any) => x.code === "ELEC"), w = (s207?.lines ?? []).find((x: any) => x.code === "WATER");
    const dmg = (s207?.lines ?? []).filter((x: any) => x.code === "DAMAGE").map((x: any) => x.amountSatang).sort();
    return [s207?.heldSatang === DEP && e?.amountSatang === 59_472 && e?.qty === 126 && e?.unitPriceSatang === ELEC_RATE && w?.amountSatang === 9_600 && w?.qty === 6 && J(dmg) === J([20_000, 35_000])
      && s207?.unpaidSatang === 0 && s207?.chargesSatang === 124_072 && s207?.deductSatang === 55_000 && s207?.refundSatang === 775_928 && s207?.tenantOwesSatang === 0 && s207?.refundDueDate === "2026-11-07"
      && s207?.daysLeft === 7 && s207?.refundOverdue === false && s207?.needsApproval === false && !(s207?.lines ?? []).some((x: any) => x.code === "RENT" || x.code === "UNPAID" || x.amountSatang === 0),
      J(s207 && { held: s207.heldSatang, lines: (s207.lines ?? []).map((x: any) => `${x.code}:${x.qty ?? ""}×${x.unitPriceSatang ?? ""}=${x.amountSatang}`), charges: s207.chargesSatang, refund: s207.refundSatang, due: s207.refundDueDate, left: s207.daysLeft })];
  });
  await T("M-2", "สรุปเท่ากับสูตร D.1 settleDeposit กับชุดเดียวกัน (refund · tenantOwes · needsApproval)", ["moveOutSummary"], async () => {
    if (!s207) return [false, "ไม่มีผล M-1"];
    const util = (s207.lines ?? []).filter((x: any) => x.code === "ELEC" || x.code === "WATER").map((x: any) => ({ code: x.code, input: { kind: "ALLOCATED", amountSatang: x.amountSatang } }));
    const dmg = (s207.lines ?? []).filter((x: any) => x.code === "DAMAGE").map((x: any) => ({ labelTh: x.labelTh, amountSatang: x.amountSatang, kind: "DAMAGE", evidenceCount: 1 }));
    const c = calc.settleDeposit({ depositSatang: s207.heldSatang, utilities: util, damages: dmg, unpaidSatang: s207.unpaidSatang, approvalThresholdSatang: 200_000, legal: { mode: "OUT_OF_SCOPE", outOfScopeReason: OOS_REASON } });
    return [c.ok && c.refundSatang === s207.refundSatang && c.tenantOwesSatang === s207.tenantOwesSatang && c.needsApproval === s207.needsApproval, J({ c: c.ok ? [c.refundSatang, c.tenantOwesSatang, c.needsApproval] : c, s: [s207.refundSatang, s207.tenantOwesSatang, s207.needsApproval] })];
  });
  await T("M-3", "ฐานมิเตอร์ = เลขที่ออกบิลแล้ว (meta.to ของบิล ต.ค. 2,000 / 383) — ไม่ใช่ MOVE_IN 1,000 และไม่ใช่เลขงวดที่ยังไม่ออกบิล 2,104", ["moveOutSummary"], async () => {
    const m = (k: string) => (s207?.meters ?? []).find((x: any) => x.kind === k);
    return [m("ELEC")?.baseValue === 2000 && m("ELEC")?.value === 2126 && m("ELEC")?.units === 126 && m("WATER")?.baseValue === 383 && m("WATER")?.value === 389 && m("WATER")?.units === 6, J(s207?.meters)];
  });
  await T("M-4", "หนี้ค้างของสัญญา (M2 บิล ต.ค. ยังไม่จ่าย 450,000) ⇒ บรรทัด UNPAID (docId = ใบ ต.ค.) · คืน 900,000 − 55,000 − 450,000 = 395,000", ["moveOutSummary"], async () => {
    const s = await summary(cO, M.M2, MO.M2 ?? "-", BK("2026-10-31"));
    const u = (s?.lines ?? []).find((x: any) => x.code === "UNPAID");
    return [s?.unpaidSatang === 450_000 && u?.amountSatang === 450_000 && u?.docId === HB.M2.docId && s?.refundSatang === 395_000 && s?.chargesSatang === 55_000, J(s && { unpaid: s.unpaidSatang, u, refund: s.refundSatang, charges: s.chargesSatang })];
  });
  await T("M-5", "ค่าห้องเศษเดือน (M6 ออก 15 ธ.ค. · บิลถึง พ.ย.) ⇒ RENT = prorate D.1 (450,000 × 15/31 ACTUAL_DAYS ของ snapshot) · ไม่มีบรรทัดน้ำไฟเมื่อหน่วย 0", ["moveOutSummary", "recordMoveOutInspection"], async () => {
    await inspect(cO, M.M6, MO.M6 ?? "-", [], mMeters("205"), "2026-12-15");
    const s = await summary(cO, M.M6, MO.M6 ?? "-", BK("2026-12-15"));
    const want = calc.prorate({ monthlySatang: RENT, days: 15, daysInMonth: 31, mode: "ACTUAL_DAYS" });
    return [lineAmt(s, "RENT") === want && lineAmt(s, "ELEC") === 0 && lineAmt(s, "WATER") === 0 && s?.chargesSatang === want && s?.refundSatang === DEP - want, J(s && { rent: lineAmt(s, "RENT"), want, lines: (s.lines ?? []).map((x: any) => x.code), refund: s.refundSatang })];
  });
  await T("M-6", "ค่าปรับค้างของสัญญาที่ไม่มีบิลปลายทาง (N3 · ปิดหนี้ D.11 มติ 5): LATE_FEE = lateFeeLedger due − charged (50,000) · UNPAID 480,000", ["moveOutSummary"], async () => {
    const s = await summary(cO, N.N3, MO.N3 ?? "-", BK("2026-11-10"));
    const want = (ledgerN3?.totalDueSatang ?? -1) - (ledgerN3?.totalChargedSatang ?? 0);
    return [want > 0 && lineAmt(s, "LATE_FEE") === want && s?.unpaidSatang === BASE, J(s && { late: lineAmt(s, "LATE_FEE"), want, unpaid: s.unpaidSatang, lines: (s.lines ?? []).map((x: any) => `${x.code}:${x.amountSatang}`) })];
  });
  await T("M-7", "ผู้เช่าต้องจ่ายเพิ่ม (M3 ประกัน 300,000 · ค้าง 450,000 · เสียหาย 150,000) ⇒ คืน 0 · tenantOwes 300,000", ["moveOutSummary", "recordMoveOutInspection"], async () => {
    const ev = await files(cO, M.M3, MO.M3 ?? "-", 1);
    await inspect(cO, M.M3, MO.M3 ?? "-", mItems("M3", ev, 150_000), mMeters("202"), "2026-10-31");
    const s = await summary(cO, M.M3, MO.M3 ?? "-", BK("2026-10-31"));
    return [s?.heldSatang === 300_000 && s?.refundSatang === 0 && s?.tenantOwesSatang === 300_000 && s?.needsApproval === false, J(s && [s.heldSatang, s.refundSatang, s.tenantOwesSatang, s.needsApproval])];
  });
  await T("M-8", "ไม่มี PII (เบอร์/เลขบัตร) ในผลสรุป · รูปวันเข้าเป็นลิงก์ส่วนตัว (ไม่มี private:// หรือ path ไฟล์)", ["moveOutSummary"], async () => {
    const ph = s207?.moveInPhotos ?? [];
    return [!!s207 && noPii(s207, [M.M1.phone]) && ph.length === 1 && ph.every((p: any) => typeof p.url === "string" && p.url.length > 0 && !/private:\/\/|\/private\//.test(p.url)), J({ ph, pii: !noPii(s207, [M.M1.phone]) })];
  });
  await T("M-9", "อ่านข้ามขอบเขต ⇒ null: ร้าน B · หน่วยผิด (DN กับใบของ DM) · ผู้มีแค่ dorm.view", ["moveOutSummary"], async () => {
    const a = await fn("moveOutSummary")!(cB, { unitId: DM, moveOutId: MO.M1 ?? "-" }, { now: AT207 });
    const b = await fn("moveOutSummary")!(cO, { unitId: DN, moveOutId: MO.M1 ?? "-" }, { now: AT207 });
    const c = await fn("moveOutSummary")!(cView, { unitId: DM, moveOutId: MO.M1 ?? "-" }, { now: AT207 });
    return [a === null && b === null && c === null, J([a === null, b === null, c === null])];
  });

  // ═══════════════ U. จอ 07 (ก่อนตรึง) ═══════════════
  console.log("\n── U จอ \"ย้ายออก · คืนเงินประกัน\" (หอ 07) ──");
  let model207: any = null;
  await T("U-1", "จอ 207 (31 ต.ค. 11:05): หัว · 4 ขั้น (INSPECT current) · นับถอยหลัง \"เหลือ 7 วัน\" · แถวตรวจ 5 · มิเตอร์ \"2,000 → 2,126 (126 หน่วย)\" · สรุป −594.72 −96.00 · คืน ฿7,759.28 · ปุ่ม 2", ["moveOutModel"], async () => {
    model207 = await fn("moveOutModel")!(cO, { unitId: DM, roomNumber: "207" }, { now: AT207 });
    const html = renderScreen(model207), t = textOf(html);
    const steps = boxes(html, "data-moveout-step").map((b) => `${b.attrs["data-moveout-step"]}:${b.attrs["data-state"]}`);
    const cd = box1(html, "data-refund-countdown");
    const items = boxes(html, "data-inspect-item").map((b) => b.attrs["data-inspect-item"]);
    const el = box1(html, "data-moveout-meter", "ELEC"), sum = box1(html, "data-moveout-summary"), refund = box1(html, "data-refund-amount");
    const ok = !!box1(html, "data-dorm-moveout", MO.M1) && /ย้ายออก · ห้อง 207 · ธนพล ศรีสุข/.test(t) && J(steps) === J(["NOTICE:done", "INSPECT:current", "SUMMARY:todo", "REFUND:todo"])
      && cd?.attrs["data-days-left"] === "7" && cd?.attrs["data-overdue"] === "false" && /ต้องคืนเงินประกันภายใน/.test(textOf(cd.html)) && /7 พ\.ย\. 2569/.test(textOf(cd.html)) && /เหลือ 7 วัน/.test(textOf(cd.html))
      && J(items) === J(["wall", "screen", "keys", "appliance", "furniture"]) && /2,000\s*→\s*2,126\s*\(126 หน่วย\)/.test(textOf(el?.html ?? ""))
      && !!sum && /9,000\.00/.test(textOf(sum.html)) && /−594\.72/.test(textOf(sum.html)) && /−96\.00/.test(textOf(sum.html)) && /฿7,759\.28/.test(textOf(refund?.html ?? ""))
      && /ไม่หักค่าทาสี\/ทำความสะอาดทั่วไป/.test(t) && /ทุกรายการที่หักมีรูป\/ใบเสร็จแนบ/.test(t) && !!box1(html, "data-action", "send-summary") && !!box1(html, "data-action", "settle");
    return [ok, J({ steps, cd: cd?.attrs, items, el: textOf(el?.html ?? "").slice(0, 60), refund: textOf(refund?.html ?? ""), t: t.slice(0, 200) })];
  }, "MAJOR", true);
  await T("U-2", "ไม่มีทางหักค่าเสื่อม: แถว NORMAL แสดง \"หักไม่ได้\" ไม่มียอด ฿ · ไม่มี data-deduct-normal · ไม่มีเบอร์ · ไม่มีคำต้องห้าม", ["moveOutModel"], async () => {
    const html = renderScreen(model207);
    const normal = boxes(html, "data-inspect-item").filter((b) => b.attrs["data-verdict"] === "NORMAL");
    const dmg = boxes(html, "data-inspect-item").filter((b) => b.attrs["data-verdict"] === "DAMAGE");
    return [normal.length === 3 && normal.every((b) => /หักไม่ได้/.test(textOf(b.html)) && !/฿\s?\d/.test(textOf(b.html))) && dmg.length === 2 && /350\.00/.test(textOf(dmg.find((b) => b.attrs["data-inspect-item"] === "screen")?.html ?? ""))
      && !/data-deduct-normal/.test(html) && !PHONE_RE.test(textOf(html)) && !LEGAL_BAD.test(textOf(html)), J({ normal: normal.map((b) => textOf(b.html).slice(0, 40)), dmg: dmg.length })];
  }, "MAJOR", true);
  await T("U-3", "เลยกำหนดคืน (8 พ.ย.): แถบ data-overdue=\"true\" + \"เลยกำหนดคืนเงินประกัน 1 วัน\"", ["moveOutModel"], async () => {
    const m = await fn("moveOutModel")!(cO, { unitId: DM, roomNumber: "207" }, { now: BK("2026-11-08", "09:00") });
    const cd = box1(renderScreen(m), "data-refund-countdown");
    return [cd?.attrs["data-overdue"] === "true" && /เลยกำหนดคืนเงินประกัน 1 วัน/.test(textOf(cd?.html ?? "")), J({ a: cd?.attrs, t: textOf(cd?.html ?? "") })];
  }, "MAJOR", true);

  // ═══════════════ L. ส่งให้ผู้เช่า / ตรึง ═══════════════
  console.log("\n── L ส่งใบสรุปให้ผู้เช่า (ตรึง) ──");
  await T("L-1", "ส่งใบสรุป 207: ok rev 1 · ใบแจ้งหนี้ DORM ref DormMoveOut/<id> ยอด 124,072 (ออกแล้ว ไม่ใช่ร่าง) · frozen.invoiceDocId ตรง", ["sendMoveOutSummary"], async () => {
    const r = await sendSum(cO, M.M1, MO.M1 ?? "-", BK("2026-10-31", "11:06"));
    const docs = await moDocs(MO.M1 ?? "-");
    const mo = await moRow(M.M1);
    const fz = (mo?.deductions as any)?.frozen;
    return [r?.ok === true && r.rev === 1 && docs.length === 1 && docs[0].id === r.invoiceDocId && docs[0].refId === MO.M1 && docs[0].docType === "INVOICE" && docs[0].grandTotal === 124_072 && docs[0].status !== "DRAFT" && fz?.invoiceDocId === r.invoiceDocId,
      J({ r: r && [codeOf(r), r.rev, r.channel], docs: docs.map((d: any) => [d.refId, d.docType, d.grandTotal, d.status]), fz: !!fz })];
  });
  await T("L-2", "ส่งพร้อมกัน 12 ทาง (4 โพรเซส · M2) ⇒ ใบแจ้งหนี้ 1 ใบ · ok ทั้งหมด", ["sendMoveOutSummary"], async () => {
    const rs = await fanout("sendMoveOutSummary", cO, Array.from({ length: 12 }, () => ({ unitId: DM, moveOutId: MO.M2 ?? "-" })), { now: ISO("2026-10-31", "11:10") });
    const docs = await moDocs(MO.M2 ?? "-");
    return [docs.length === 1 && rs.every((r) => r?.ok === true && r.invoiceDocId === docs[0]?.id) && docs[0]?.grandTotal === 55_000, J({ docs: docs.length, codes: rs.map(codeOf).slice(0, 6), bad: badOf(rs).slice(0, 2) })];
  });
  await T("L-3", "precheck: แม่แบบที่หลุดเข้าฐานมีคำ \"ตัดไฟ\" ⇒ TEMPLATE_BLOCKED · ไม่ตรึง · ไม่มีใบแจ้งหนี้/ข้อความ · ใบที่ยังไม่ตรวจ ⇒ NOT_INSPECTED", ["sendMoveOutSummary", "recordMoveOutInspection"], async () => {
    await inspect(cO, N.N4, MO.N4 ?? "-", [], [], "2026-10-31");
    await U(A, DN, "rooms.msg.moveOutSummary", { th: "ห้อง {roomNo} คืนเงิน {refundAmount} หากไม่ย้ายจะตัดไฟ", en: "Room {roomNo} refund {refundAmount}" });
    const a = await sendSum(cO, N.N4, MO.N4 ?? "-", BK("2026-10-31", "12:00"));
    await unsetU(A, DN, "rooms.msg.moveOutSummary");
    const mo = await moRow(N.N4);
    const logs = await prisma.serviceMessageLog.count({ where: { tenantId: A, dedupeKey: { startsWith: `rooms:moveOutSummary:${MO.N4 ?? "-"}` } } });
    const b = await sendSum(cO, N.N1, MO.N1 ?? "-", BK("2026-11-01"));
    return [failOk(a, "TEMPLATE_BLOCKED") && !(mo?.deductions as any)?.frozen && logs === 0 && (await moDocs(MO.N4 ?? "-")).length === 0 && failOk(b, "NOT_INSPECTED"), J([codeOf(a), !!(mo?.deductions as any)?.frozen, logs, codeOf(b)])];
  });
  await T("L-4", "ข้อความผ่าน notifyCustomer: ServiceMessageLog dedupe rooms:moveOutSummary:<id>:1 (ไม่มีเบอร์) · ส่งซ้ำ ⇒ duplicate:true ใบเดิม ไม่มีใบใหม่", ["sendMoveOutSummary"], async () => {
    const logs = await prisma.serviceMessageLog.findMany({ where: { tenantId: A, dedupeKey: { startsWith: `rooms:moveOutSummary:${MO.M1 ?? "-"}` } } });
    const r = await sendSum(cO, M.M1, MO.M1 ?? "-", BK("2026-10-31", "11:20"));
    const docs = await moDocs(MO.M1 ?? "-");
    return [logs.length === 1 && logs[0].dedupeKey === `rooms:moveOutSummary:${MO.M1}:1` && logs[0].messageKey === "moveOutSummary" && !PHONE_RE.test(logs[0].dedupeKey) && r?.ok === true && r.duplicate === true && docs.length === 1,
      J({ logs: logs.map((l: any) => [l.dedupeKey, l.status]), r: r && [codeOf(r), r.duplicate], docs: docs.length })];
  });
  await T("L-5", "หลังตรึง: บันทึกตรวจห้อง/ยกเลิกแจ้ง ⇒ FROZEN", ["recordMoveOutInspection", "cancelMoveOut"], async () => {
    const a = await inspect(cO, M.M1, MO.M1 ?? "-", items207(), meters207(2126, 390), "2026-10-31");
    const b = await fn("cancelMoveOut")!(cO, { unitId: DM, moveOutId: MO.M1 ?? "-", reason: "ทดสอบหลังตรึง" }, { now: BK("2026-10-31") });
    return [failOk(a, "FROZEN") && failOk(b, "FROZEN"), J([codeOf(a), codeOf(b)])];
  });
  await T("L-6", "D.11 ยกเว้นค่าปรับหลังตรึง (N3) ⇒ MOVEOUT_FROZEN · ไม่มี AuditLog dorm.latefee.waived (ไม่มีทาง \"ยกเว้นแล้วแต่ใบวันออกยังเก็บ\")", ["sendMoveOutSummary", "waiveLateFee"], async () => {
    await inspect(cO, N.N3, MO.N3 ?? "-", [], [], "2026-11-10");
    const s = await sendSum(cO, N.N3, MO.N3 ?? "-", BK("2026-11-10"));
    const w = await fn("waiveLateFee")!(cO, { unitId: DN, sourceBillId: NOCT.N3.id, reason: "ผู้เช่าขอผ่อนผันเป็นกรณีพิเศษ" }, { now: BK("2026-11-10", "13:00") });
    const au = await prisma.auditLog.count({ where: { tenantId: A, action: "dorm.latefee.waived", targetId: NOCT.N3.id } });
    return [s?.ok === true && failOk(w, "MOVEOUT_FROZEN") && au === 0, J([codeOf(s), codeOf(w), au])];
  });

  // ═══════════════ A. อนุมัติเกินวงเงิน ═══════════════
  console.log("\n── A อนุมัติหักเกินวงเงิน (฿2,000) ──");
  let reqM4 = "";
  await T("A-1", "ผู้ดูแล (ไม่ถือ dorm.deposit.deduct.approve) หัก 250,000 > 200,000 (M4): ตรึงได้ + คำขอ dorm.moveout.deduction PENDING · ปิด ⇒ NEEDS_APPROVAL ไม่มี JV", ["recordMoveOutInspection", "sendMoveOutSummary", "settleMoveOut"], async () => {
    if (policyWhy) return [false, policyWhy];
    const ev = await files(cCare, M.M4, MO.M4 ?? "-", 1);
    const i = await inspect(cCare, M.M4, MO.M4 ?? "-", mItems("M4", ev, 250_000), mMeters("203"), "2026-10-31");
    const s = await sendSum(cCare, M.M4, MO.M4 ?? "-", BK("2026-10-31", "11:30"));
    const req = await prisma.approvalRequest.findFirst({ where: { tenantId: A, entityType: "dorm.moveout.deduction", entityId: { startsWith: MO.M4 ?? "-" } } });
    reqM4 = req?.id ?? "";
    const st = await settle(cCare, M.M4, MO.M4 ?? "-", BK("2026-10-31", "12:00"));
    return [i?.ok === true && i.needsApproval === true && s?.ok === true && s.approvalId === req?.id && req?.status === "PENDING" && failOk(st, "NEEDS_APPROVAL") && (await settleJvs(DM, M.M4.leaseId)).length === 0,
      J({ i: i && [codeOf(i), i.needsApproval], s: s && [codeOf(s), s.approvalId], req: req && [req.entityId, req.status], st: codeOf(st) })];
  });
  await T("U-4", "จอ M4 (ผู้ดูแล · รออนุมัติ): ปุ่มปิด disabled + data-blocked=\"NEEDS_APPROVAL\" + \"รออนุมัติ\" · SUMMARY current", ["moveOutModel"], async () => {
    const m = await fn("moveOutModel")!(cCare, { unitId: DM, moveOutId: MO.M4 ?? "-" }, { now: BK("2026-10-31", "12:05") });
    const html = renderScreen(m);
    const b = box1(html, "data-action", "settle");
    const st = boxes(html, "data-moveout-step").find((x) => x.attrs["data-moveout-step"] === "SUMMARY");
    return [b?.attrs["data-blocked"] === "NEEDS_APPROVAL" && "disabled" in (b?.attrs ?? {}) && /รออนุมัติ/.test(textOf(html)) && st?.attrs["data-state"] === "current", J({ b: b?.attrs, st: st?.attrs })];
  }, "MAJOR", true);
  await T("A-2", "เจ้าของอนุมัติคำขอ ⇒ ผู้ดูแลปิดได้: คืน 650,000 · JV 1", ["settleMoveOut"], async () => {
    if (!reqM4) return [false, "ไม่มีคำขอจาก A-1"];
    const d = await APS.decide(mOwnerA, { tenantId: A }, reqM4, { decision: "APPROVED" });
    const st = await settle(cCare, M.M4, MO.M4 ?? "-", BK("2026-10-31", "12:10"));
    return [st?.ok === true && st.refundSatang === 650_000 && (await settleJvs(DM, M.M4.leaseId)).length === 1, J({ d: d?.status ?? codeOf(d), st: st && [codeOf(st), st.refundSatang] })];
  });
  await T("A-3", "วงเงินอ่านค่าปัจจุบันของหน่วย: ตั้ง ฿3,000 ⇒ หัก 250,000 (M8) ไม่ต้องอนุมัติ · ไม่มีคำขอ · ผู้ดูแลปิดได้", ["recordMoveOutInspection", "sendMoveOutSummary", "settleMoveOut"], async () => {
    await U(A, DM, "rooms.deposit.approvalThreshold", 300_000);
    const ev = await files(cCare, M.M8, MO.M8 ?? "-", 1);
    const i = await inspect(cCare, M.M8, MO.M8 ?? "-", mItems("M8", ev, 250_000), mMeters("208"), "2026-10-31");
    const s = await sendSum(cCare, M.M8, MO.M8 ?? "-", BK("2026-10-31", "11:40"));
    const st = await settle(cCare, M.M8, MO.M8 ?? "-", BK("2026-10-31", "12:20"));
    await unsetU(A, DM, "rooms.deposit.approvalThreshold");
    return [i?.needsApproval === false && s?.ok === true && s.approvalId === null && st?.ok === true && st.refundSatang === 650_000, J([i?.needsApproval, codeOf(s), s?.approvalId, codeOf(st)])];
  });
  await T("A-4", "เจ้าของ (ถือ dorm.deposit.deduct.approve) หัก 250,000 (M9) ⇒ ไม่ต้องยื่นคำขอ · ปิดได้เลย", ["recordMoveOutInspection", "sendMoveOutSummary", "settleMoveOut"], async () => {
    const ev = await files(cO, M.M9, MO.M9 ?? "-", 1);
    await inspect(cO, M.M9, MO.M9 ?? "-", mItems("M9", ev, 250_000), mMeters("209"), "2026-10-31");
    const s = await sendSum(cO, M.M9, MO.M9 ?? "-", BK("2026-10-31", "11:50"));
    const st = await settle(cO, M.M9, MO.M9 ?? "-", BK("2026-10-31", "12:30"));
    const reqs = await prisma.approvalRequest.count({ where: { tenantId: A, entityType: "dorm.moveout.deduction", entityId: { startsWith: MO.M9 ?? "-" } } });
    return [s?.ok === true && s.approvalId === null && reqs === 0 && st?.ok === true && st.refundSatang === 650_000, J([codeOf(s), s?.approvalId, reqs, codeOf(st)])];
  });

  // ═══════════════ T. ปิดประกัน ═══════════════
  console.log("\n── T ปิดเงินประกัน ──");
  await T("T-1", "ก่อนวันย้ายออก (30 ต.ค.) ⇒ NOT_MOVED_OUT · ยังไม่ตรึง (M6) ⇒ NOT_FROZEN · ไม่มี JV", ["settleMoveOut"], async () => {
    const a = await settle(cO, M.M1, MO.M1 ?? "-", BK("2026-10-30"));
    const b = await settle(cO, M.M6, MO.M6 ?? "-", BK("2026-12-16"));
    return [failOk(a, "NOT_MOVED_OUT") && failOk(b, "NOT_FROZEN") && (await settleJvs(DM, M.M1.leaseId)).length === 0 && (await settleJvs(DM, M.M6.leaseId)).length === 0, J([codeOf(a), codeOf(b)])];
  });
  let st207: any = null;
  await T("T-2", "ปิด 207 (31 ต.ค. 12:00): ok REFUNDED · หัก 124,072 · คืน 775,928 · ยอดถือเหลือ 0 · ใบ: status/refundSatang/refundedAt/settlementDocumentId = entryId", ["settleMoveOut"], async () => {
    st207 = await settle(cO, M.M1, MO.M1 ?? "-", BK("2026-10-31", "12:00"));
    const mo = await moRow(M.M1);
    return [st207?.ok === true && st207.duplicate === false && st207.status === "REFUNDED" && st207.heldSatang === DEP && st207.appliedSatang === 124_072 && st207.refundSatang === 775_928 && st207.tenantOwesSatang === 0
      && mo?.status === "REFUNDED" && mo?.refundSatang === 775_928 && !!mo?.refundedAt && mo?.settlementDocumentId === st207.entryId && (await held(M.M1)) === 0,
      J({ st: st207 && [codeOf(st207), st207.status, st207.appliedSatang, st207.refundSatang], mo: mo && [mo.status, mo.refundSatang, !!mo.refundedAt, mo.settlementDocumentId === st207?.entryId] })];
  });
  await T("T-3", "JV ปิด: รายการเดียว Dr ประกัน (214x) 900,000 / Cr ลูกหนี้ 124,072 / Cr เงินคืน 775,928 · ใบวันออกชำระครบด้วยแถว DEPOSIT_APPLY", ["settleMoveOut"], async () => {
    const jv = await settleJvs(DM, M.M1.leaseId);
    const ls = jv[0]?.lines ?? [];
    const dr = ls.filter((x: any) => x.debit > 0), cr = ls.filter((x: any) => x.credit > 0).map((x: any) => x.credit).sort((a: number, b: number) => a - b);
    const doc = (await moDocs(MO.M1 ?? "-"))[0];
    const pays = doc ? await prisma.accountDocumentPayment.findMany({ where: { documentId: doc.id } }) : [];
    return [jv.length === 1 && dr.length >= 1 && dr.every((x: any) => /^214/.test(x.account.code)) && dr.reduce((a: number, x: any) => a + x.debit, 0) === DEP && J(cr) === J([124_072, 775_928])
      && doc?.paidTotal === 124_072 && pays.length === 1 && pays[0].channel === "DEPOSIT_APPLY", J({ jv: jv.length, dr: dr.map((x: any) => [x.account.code, x.debit]), cr, paid: doc?.paidTotal, pays: pays.map((p: any) => p.channel) })];
  });
  await T("T-4", "สัญญาจบ (ENDED · MOVED_OUT · endedAt) · event dorm.moveout.settled 1 (payload 5 คีย์ ไม่มี PII) · dorm.lease.ended 1 (payload 4 คีย์)", ["settleMoveOut"], async () => {
    const l = await prisma.dormLease.findFirst({ where: { id: M.M1.leaseId } });
    const ev = await outbox("dorm.moveout.settled", (p) => p.moveOutId === MO.M1);
    const en = await outbox("dorm.lease.ended", (p) => p.leaseId === M.M1.leaseId);
    const p = ev[0]?.payload ?? {};
    return [l?.status === "ENDED" && l?.endReason === "MOVED_OUT" && !!l?.endedAt && ev.length === 1 && keysEq(p, ["unitId", "leaseId", "moveOutId", "refundSatang", "dueAt"]) && p.refundSatang === 775_928
      && new Date(p.dueAt).toISOString() === "2026-11-07T17:00:00.000Z" && en.length === 1 && keysEq(en[0].payload, ["unitId", "leaseId", "roomId", "reason"]) && en[0].payload.reason === "MOVED_OUT" && noPii([ev, en], [M.M1.phone]),
      J({ l: l && [l.status, l.endReason, !!l.endedAt], ev: ev.map((e: any) => e.payload), en: en.map((e: any) => e.payload) })];
  });
  await T("T-5", "ห้อง ⇒ ทำความสะอาด (hkStatus DIRTY)", ["settleMoveOut"], async () => {
    const r = await prisma.hotelRoom.findFirst({ where: { id: RM["207"] }, select: { hkStatus: true } });
    return [r?.hkStatus === "DIRTY", J(r)];
  });
  await T("T-6", "ปิดซ้ำ ⇒ ok duplicate:true entryId เดิม · ไม่มี JV/แถวรับชำระ/event ใหม่", ["settleMoveOut"], async () => {
    const r = await settle(cO, M.M1, MO.M1 ?? "-", BK("2026-10-31", "15:00"));
    const doc = (await moDocs(MO.M1 ?? "-"))[0];
    const pays = doc ? await prisma.accountDocumentPayment.count({ where: { documentId: doc.id } }) : -1;
    return [r?.ok === true && r.duplicate === true && r.entryId === st207?.entryId && (await settleJvs(DM, M.M1.leaseId)).length === 1 && pays === 1 && (await outbox("dorm.moveout.settled", (p) => p.moveOutId === MO.M1)).length === 1,
      J({ r: r && [codeOf(r), r.duplicate], pays })];
  });
  await T("T-7", "หักค้าง (M2): หักใบวันออก 55,000 + บิล ต.ค. 450,000 ⇒ คืน 395,000 · ทั้งสองใบชำระครบ", ["settleMoveOut"], async () => {
    const r = await settle(cO, M.M2, MO.M2 ?? "-", BK("2026-10-31", "13:00"));
    const oct = await prisma.accountDocument.findFirst({ where: { id: HB.M2.docId } }), fin = (await moDocs(MO.M2 ?? "-"))[0];
    return [r?.ok === true && r.appliedSatang === 505_000 && r.refundSatang === 395_000 && oct?.paidTotal === 450_000 && fin?.paidTotal === 55_000, J({ r: r && [codeOf(r), r.appliedSatang, r.refundSatang], oct: oct?.paidTotal, fin: fin?.paidTotal })];
  });
  await T("T-8", "ผู้เช่าค้างเพิ่ม (M3): ok SETTLED · คืน 0 · ค้าง 300,000 · ยอดถือ 0 · ใบวันออกจ่ายครบ บิล ต.ค. ค้าง 300,000", ["sendMoveOutSummary", "settleMoveOut"], async () => {
    await sendSum(cO, M.M3, MO.M3 ?? "-", BK("2026-10-31", "11:55"));
    const r = await settle(cO, M.M3, MO.M3 ?? "-", BK("2026-10-31", "13:10"));
    const oct = await prisma.accountDocument.findFirst({ where: { id: HB.M3.docId } });
    return [r?.ok === true && r.status === "SETTLED" && r.refundSatang === 0 && r.tenantOwesSatang === 300_000 && (await held(M.M3)) === 0 && oct?.paidTotal === 150_000 && (await moRow(M.M3))?.status === "SETTLED",
      J({ r: r && [codeOf(r), r.status, r.refundSatang, r.tenantOwesSatang], oct: oct?.paidTotal })];
  });
  await T("T-9", "ไม่มีประกัน (M5): ปิดได้ SETTLED · entryId null · ไม่มี JV ปิด · ค้าง 35,000 (ใบวันออกยังเปิด)", ["recordMoveOutInspection", "sendMoveOutSummary", "settleMoveOut"], async () => {
    const ev = await files(cO, M.M5, MO.M5 ?? "-", 1);
    await inspect(cO, M.M5, MO.M5 ?? "-", mItems("M5", ev, 35_000), mMeters("204"), "2026-10-31");
    await sendSum(cO, M.M5, MO.M5 ?? "-", BK("2026-10-31", "11:58"));
    const r = await settle(cO, M.M5, MO.M5 ?? "-", BK("2026-10-31", "13:20"));
    return [r?.ok === true && r.status === "SETTLED" && r.entryId === null && r.tenantOwesSatang === 35_000 && (await settleJvs(DM, M.M5.leaseId)).length === 0, J(r)];
  });
  await T("T-10", "STALE: หลังตรึงมีใบเพิ่มหนี้ใหม่ของบิลในสาย (N2 · adjustSentBill) ⇒ ปิด STALE ไม่มี JV", ["recordMoveOutInspection", "sendMoveOutSummary", "settleMoveOut", "adjustSentBill"], async () => {
    await inspect(cO, N.N2, MO.N2 ?? "-", [], [], "2026-11-20");
    const s = await sendSum(cO, N.N2, MO.N2 ?? "-", BK("2026-11-20"));
    const adj = await fn("adjustSentBill")!(cO, { unitId: DN, billId: NOCT.N2.id, kind: "DEBIT", reason: "ค่าซ่อมก๊อกน้ำที่ผู้เช่าทำเสียหาย", idempotencyKey: `qc-d12-${stamp}-adj-n2`, lines: [{ code: "OTHER", labelTh: "ค่าซ่อมก๊อกน้ำ", amountSatang: 10_000 }] });
    const r = await settle(cO, N.N2, MO.N2 ?? "-", BK("2026-11-21"));
    return [s?.ok === true && adj?.ok === true && failOk(r, "STALE") && (await settleJvs(DN, N.N2.leaseId)).length === 0, J([codeOf(s), codeOf(adj), adj?.reason, codeOf(r)])];
  });
  await T("T-11", "BILL_PENDING: มีบิล DRAFT ของสัญญา (N13) ⇒ ปิดไม่ได้ ไม่มี JV", ["recordMoveOutInspection", "sendMoveOutSummary", "settleMoveOut"], async () => {
    await inspect(cO, N.N13, MO.N13 ?? "-", [], [], "2026-10-31");
    const s = await sendSum(cO, N.N13, MO.N13 ?? "-", BK("2026-10-31", "12:00"));
    const run = await runOf(DN, "2027-03", "DRAFT");
    await prisma.dormBill.create({ data: { tenantId: A, unitId: DN, runId: run.id, leaseId: N.N13.leaseId, roomId: N.N13.roomId, partyId: N.N13.partyId, periodKey: "2027-03", status: "DRAFT", lines: [], subtotalSatang: 0, totalSatang: 0 } });
    const r = await settle(cO, N.N13, MO.N13 ?? "-", BK("2026-10-31", "13:00"));
    return [s?.ok === true && failOk(r, "BILL_PENDING") && (await settleJvs(DN, N.N13.leaseId)).length === 0, J([codeOf(s), codeOf(r)])];
  });
  await T("T-12", "สัญญาจบตัดพอร์ทัล/LINE (D.9): สัญญา 207 ENDED + endedAt ≤ วันนี้ ⇒ ไม่ live · ถ้ามีโมดูลพอร์ทัล D.9 บน tip ⇒ portalLiveLease = null", ["settleMoveOut"], async () => {
    const l = await prisma.dormLease.findFirst({ where: { id: M.M1.leaseId } });
    const dir = join(ROOT, "src/lib/modules/dorm");
    const pf = readdirSync(dir).find((f) => /portal/.test(f) && f.endsWith(".ts"));
    let portal = "ไม่มีโมดูลพอร์ทัลบน tip (D.9 ยังไม่รวม) — ตรวจนิยาม live: ENDED + endedAt";
    let pOk = true;
    if (pf) {
      const m: any = await import(pathToFileURL(join(dir, pf)).href);
      if (typeof m.portalLiveLease === "function") { const r = await m.portalLiveLease(A, M.M1.leaseId, "2026-11-01"); pOk = r === null; portal = `portalLiveLease=${J(r)}`; }
    }
    return [l?.status === "ENDED" && !!l?.endedAt && pOk, `${l?.status} ${portal}`];
  });

  // ═══════════════ R. เปิดใบสรุปใหม่ ═══════════════
  console.log("\n── R เปิดใบสรุปใหม่ (ใบลดหนี้ · ไม่ลบ) ──");
  let invR1 = "";
  await T("R-1", "M10 ตรึงแล้วเปิดใหม่: ใบลดหนี้เต็มใบ (35,000) อ้างใบเดิม · ใบเดิมยังอยู่ · rev 2 · frozen null", ["recordMoveOutInspection", "sendMoveOutSummary", "reopenMoveOutSummary"], async () => {
    const ev = await files(cO, M.M10, MO.M10 ?? "-", 1);
    await inspect(cO, M.M10, MO.M10 ?? "-", mItems("M10", ev, 35_000), mMeters("210"), "2026-10-31");
    const s = await sendSum(cO, M.M10, MO.M10 ?? "-", BK("2026-10-31", "12:00"));
    invR1 = s?.invoiceDocId ?? "";
    const r = await fn("reopenMoveOutSummary")!(cO, { unitId: DM, moveOutId: MO.M10 ?? "-", reason: "ผู้เช่าโต้แย้งยอดมุ้งลวด" }, { now: BK("2026-10-31", "12:30") });
    const cn = r?.creditNoteDocId ? await prisma.accountDocument.findFirst({ where: { id: r.creditNoteDocId } }) : null;
    const orig = await prisma.accountDocument.findFirst({ where: { id: invR1 || "-" } });
    const mo = await moRow(M.M10);
    return [r?.ok === true && r.rev === 2 && cn?.docType === "CREDIT_NOTE" && cn?.sourceDocId === invR1 && cn?.grandTotal === 35_000 && !!orig && !(mo?.deductions as any)?.frozen,
      J({ s: codeOf(s), r: r && [codeOf(r), r.rev], cn: cn && [cn.docType, cn.grandTotal, cn.sourceDocId === invR1], orig: !!orig })];
  });
  await T("R-2", "ตรวจใหม่ (20,000) + ส่ง ⇒ ใบรุ่น 2 ref <id>#2 · ปิดหักเฉพาะใบรุ่น 2 (คืน 880,000) · ใบรุ่น 1 ไม่ถูกหัก", ["recordMoveOutInspection", "sendMoveOutSummary", "settleMoveOut"], async () => {
    const ev = await files(cO, M.M10, MO.M10 ?? "-", 1);
    await inspect(cO, M.M10, MO.M10 ?? "-", mItems("M10", ev, 20_000), mMeters("210"), "2026-10-31");
    const s = await sendSum(cO, M.M10, MO.M10 ?? "-", BK("2026-10-31", "13:00"));
    const docs = await moDocs(MO.M10 ?? "-");
    const r = await settle(cO, M.M10, MO.M10 ?? "-", BK("2026-10-31", "13:30"));
    const v1 = await prisma.accountDocument.findFirst({ where: { id: invR1 || "-" } });
    return [s?.ok === true && s.rev === 2 && docs.some((d: any) => d.refId === `${MO.M10}#2` && d.grandTotal === 20_000) && r?.ok === true && r.appliedSatang === 20_000 && r.refundSatang === 880_000 && v1?.paidTotal === 0,
      J({ s: s && [codeOf(s), s.rev], docs: docs.map((d: any) => [d.refId, d.grandTotal]), r: r && [codeOf(r), r.appliedSatang, r.refundSatang], v1: v1?.paidTotal })];
  });
  await T("R-3", "เปิดใหม่หลังปิดแล้ว ⇒ NOT_EDITABLE", ["reopenMoveOutSummary"], async () => {
    const r = await fn("reopenMoveOutSummary")!(cO, { unitId: DM, moveOutId: MO.M10 ?? "-", reason: "ลองเปิดหลังปิด" }, { now: BK("2026-11-01") });
    return [failOk(r, "NOT_EDITABLE"), codeOf(r)];
  });

  // ═══════════════ P. แข่งหลายโพรเซส ═══════════════
  console.log("\n── P แข่งหลายโพรเซส (ปิด∥ปิด · ปิด∥รอบบิล D.8 · ปิด∥ค่าปรับ D.11 · ฆ่ากลางทาง) ──");
  await T("P-1", "ปิด ∥ ปิด 12 ทาง (4 โพรเซส × 3 · N4): ok ทั้งหมด · duplicate:false ตัวเดียว · JV ปิด 1 · REFUNDED · event 1", ["sendMoveOutSummary", "settleMoveOut"], async () => {
    const s = await sendSum(cO, N.N4, MO.N4 ?? "-", BK("2026-10-31", "12:00"));
    const rs = await fanout("settleMoveOut", cO, Array.from({ length: 12 }, () => ({ unitId: DN, moveOutId: MO.N4 ?? "-", refund: { channel: "TRANSFER", financeAccountId: FIN } })), { now: ISO("2026-10-31", "12:30") });
    const jv = await settleJvs(DN, N.N4.leaseId);
    return [s?.ok === true && rs.every((r) => r?.ok === true) && rs.filter((r) => r.duplicate === false).length === 1 && jv.length === 1 && (await moRow(N.N4))?.status === "REFUNDED" && (await outbox("dorm.moveout.settled", (p) => p.moveOutId === MO.N4)).length === 1,
      J({ s: codeOf(s), codes: rs.map(codeOf), dup: rs.map((r) => r?.duplicate), jv: jv.length, bad: badOf(rs).slice(0, 2) })];
  });
  await T("P-2", "ปิด (N5) ∥ รอบบิล พ.ย. ของหน่วยเดียวกัน (prepare+send ในโพรเซสอื่น): สัญญาที่มีใบย้ายออก ≤ 30 พ.ย. ไม่มีบิล พ.ย. · N16–N20 บิล พ.ย. 1 ใบ/สัญญา · JV ปิด N5 = 1 · ไม่มี throw/P2028", ["sendMoveOutSummary", "settleMoveOut"], async () => {
    await inspect(cO, N.N5, MO.N5 ?? "-", [], [], "2026-10-31");
    const s = await sendSum(cO, N.N5, MO.N5 ?? "-", BK("2026-10-31", "12:00"));
    const at = Date.now() + SYNC_MS;
    const [a, b] = await Promise.all([
      fanout("settleMoveOut", cO, Array.from({ length: 6 }, () => ({ unitId: DN, moveOutId: MO.N5 ?? "-", refund: { channel: "TRANSFER", financeAccountId: FIN } })), { now: ISO("2026-10-31", "13:00") }, 2, 0, at),
      fanout("__prepSend", cO, [{ unitId: DN, periodKey: "2026-11", now: NOW_NOV }], null, 1, 0, at),
    ]);
    const run = await prisma.dormBillRun.findFirst({ where: { unitId: DN, periodKey: "2026-11" } });
    if (run) await sendAll(cO, DN, run.id, NOW_NOV);
    const mos = await prisma.dormMoveOut.findMany({ where: { unitId: DN, status: { not: "CANCELLED" }, moveOutDate: { lte: dbDate("2026-11-30") } }, select: { leaseId: true } });
    const skipIds = new Set(mos.map((m: any) => m.leaseId));
    const nov = await prisma.dormBill.findMany({ where: { unitId: DN, periodKey: "2026-11" }, select: { leaseId: true, status: true } });
    const wrong = nov.filter((x: any) => skipIds.has(x.leaseId));
    const plain = ["N16", "N17", "N18", "N19", "N20"].map((k) => nov.filter((x: any) => x.leaseId === N[k].leaseId && x.status === "SENT").length);
    const jv = await settleJvs(DN, N.N5.leaseId);
    const bad = badOf([...a, ...b], ["RUN_BUSY", "BUSY"]);
    return [s?.ok === true && wrong.length === 0 && plain.every((n) => n === 1) && jv.length === 1 && a.some((r) => r?.ok === true) && !bad.length,
      J({ s: codeOf(s), wrong: wrong.length, plain, jv: jv.length, a: a.map(codeOf), b: b.map((r) => `${r?.stage}:${codeOf(r)}`), bad: bad.slice(0, 2) })];
  });
  const ledgerN6 = await fn("lateFeeLedger")?.(cO, { unitId: DN, leaseId: N.N6.leaseId }, { now: BK("2026-11-10") });
  await T("P-3", "ตรึง ∥ ยกเว้นค่าปรับ D.11 (N6) แล้ว ปิด ∥ ใบเพิ่มหนี้ค่าปรับ: ไม่มี \"ยกเว้นแล้ว + ใบวันออกยังเก็บ\" · ปิดสำเร็จต้องไม่มีใบเพิ่มหนี้ที่เกิดก่อน JV แต่ไม่ถูกนับ · ใบวันออก ≤ 1 · ไม่มี throw", ["sendMoveOutSummary", "settleMoveOut", "waiveLateFee", "adjustSentBill"], async () => {
    await inspect(cO, N.N6, MO.N6 ?? "-", [], [], "2026-11-10");
    const at = Date.now() + SYNC_MS;
    const [a, b] = await Promise.all([
      fanout("sendMoveOutSummary", cO, Array.from({ length: 6 }, () => ({ unitId: DN, moveOutId: MO.N6 ?? "-" })), { now: ISO("2026-11-10", "12:00") }, 2, 0, at),
      fanout("waiveLateFee", cO, Array.from({ length: 3 }, () => ({ unitId: DN, sourceBillId: NOCT.N6.id, reason: "ผู้เช่าขอผ่อนผันเป็นกรณีพิเศษ" })), { now: ISO("2026-11-10", "12:00") }, 1, 0, at),
    ]);
    const waived = (await prisma.auditLog.count({ where: { tenantId: A, action: "dorm.latefee.waived", targetId: NOCT.N6.id } })) > 0;
    const docs = await moDocs(MO.N6 ?? "-");
    const mo = await moRow(N.N6);
    const late = ((mo?.deductions as any)?.frozen?.lines ?? []).filter((x: any) => x.code === "LATE_FEE").reduce((s: number, x: any) => s + Number(x.amountSatang ?? 0), 0);
    const okA = docs.length <= 1 && (waived ? late === 0 : late === (ledgerN6?.totalDueSatang ?? -1) - (ledgerN6?.totalChargedSatang ?? 0)) && !badOf([...a, ...b], ["MOVEOUT_FROZEN", "BUSY", "RUN_BUSY", "STALE"]).length;
    const at2 = Date.now() + SYNC_MS;
    const [c, d] = await Promise.all([
      fanout("settleMoveOut", cO, Array.from({ length: 6 }, () => ({ unitId: DN, moveOutId: MO.N6 ?? "-", refund: { channel: "TRANSFER", financeAccountId: FIN } })), { now: ISO("2026-11-11") }, 2, 0, at2),
      fanout("adjustSentBill", cO, Array.from({ length: 3 }, () => ({ unitId: DN, billId: NOCT.N6.id, kind: "DEBIT", reason: "ค่าปรับชำระล่าช้าเพิ่มเติม", idempotencyKey: `qc-d12-${stamp}-adj-n6`, lines: [{ code: "LATE_FEE", labelTh: "ค่าปรับชำระล่าช้า", amountSatang: 1_000 }] })), null, 1, 0, at2),
    ]);
    const jv = await settleJvs(DN, N.N6.leaseId);
    const dn = await prisma.accountDocument.findMany({ where: { tenantId: A, sourceDocId: NOCT.N6.accountDocumentId, docType: "DEBIT_NOTE" }, select: { id: true, createdAt: true, paidTotal: true } });
    const sneaky = jv.length === 1 ? dn.filter((x: any) => x.createdAt < jv[0].createdAt && x.paidTotal === 0) : [];
    const okB = jv.length <= 1 && !sneaky.length && !badOf([...c, ...d], ["STALE", "BUSY", "RUN_BUSY", "LATE_FEE_OVER_CAP", "NOT_FROZEN", "MOVEOUT_FROZEN"]).length;
    return [okA && okB, J({ waived, late, docs: docs.length, a: a.map(codeOf), b: b.map(codeOf), jv: jv.length, dn: dn.length, sneaky: sneaky.length, c: c.map(codeOf), d: d.map(codeOf) })];
  });
  await T("P-4", "ฆ่ากลางการปิด (SIGKILL 6 จังหวะ · N7–N12): ไม่มีสถานะครึ่งเดียว (มี JV ⇔ สถานะปิด) · เรียกซ้ำ ⇒ ok · JV 1 · ห้อง DIRTY", ["sendMoveOutSummary", "settleMoveOut"], async () => {
    const out: string[] = [];
    let ok = true;
    const delays = [30, 90, 180, 300, 500, 900];
    for (let i = 0; i < 6; i++) {
      const k = `N${7 + i}`;
      await inspect(cO, N[k], MO[k] ?? "-", [], [], "2026-10-31");
      await sendSum(cO, N[k], MO[k] ?? "-", BK("2026-10-31", "12:00"));
      const kd = await killDuring("settleMoveOut", cO, { unitId: DN, moveOutId: MO[k] ?? "-", refund: { channel: "TRANSFER", financeAccountId: FIN } }, { now: ISO("2026-10-31", "14:00") }, delays[i]);
      const jv0 = (await settleJvs(DN, N[k].leaseId)).length, st0 = (await moRow(N[k]))?.status;
      const half = !((jv0 === 0 && !TERMINAL.includes(st0)) || (jv0 === 1 && TERMINAL.includes(st0)));
      const r = await settle(cO, N[k], MO[k] ?? "-", BK("2026-10-31", "14:30"));
      const jv1 = (await settleJvs(DN, N[k].leaseId)).length, st1 = (await moRow(N[k]))?.status;
      const hk = (await prisma.hotelRoom.findFirst({ where: { id: N[k].roomId }, select: { hkStatus: true } }))?.hkStatus;
      if (half || r?.ok !== true || jv1 !== 1 || st1 !== "REFUNDED" || hk !== "DIRTY") ok = false;
      out.push(`${k}@${delays[i]}ms killed=${kd.killed} ก่อน[jv=${jv0},${st0}] หลัง[${codeOf(r)},jv=${jv1},${st1},${hk}]`);
    }
    return [ok, out.join(" · ")];
  });

  // ═══════════════ C. นับถอยหลัง · เตือนทุกวัน (STRICT · N1 ออก 15 พ.ย. ครบคืน 22 พ.ย.) ═══════════════
  console.log("\n── C นับถอยหลังคืนประกัน 7 วัน + เตือนทุกวัน (เที่ยงคืนไทย) ──");
  const jobs = async (now: Date) => fn("runDormMoveOutJobs")!(now, { tenantId: A });
  const dueN1 = async () => outbox("dorm.deposit.refund_due", (p) => p.moveOutId === MO.N1);
  await T("C-1", "ขอบเที่ยงคืนไทย: 22 พ.ย. 23:59:59.999 ⇒ เหลือ 0 วัน ยังไม่เลย · 23 พ.ย. 00:00:00.000 ⇒ เลยกำหนด เหลือ −1 · refundDueAt = 2026-11-22T17:00:00.000Z", ["moveOutSummary"], async () => {
    const a = await summary(cO, N.N1, MO.N1 ?? "-", new Date("2026-11-22T23:59:59.999+07:00"));
    const b = await summary(cO, N.N1, MO.N1 ?? "-", new Date("2026-11-23T00:00:00.000+07:00"));
    const mo = await moRow(N.N1);
    return [a?.refundDueDate === "2026-11-22" && a?.daysLeft === 0 && a?.refundOverdue === false && b?.daysLeft === -1 && b?.refundOverdue === true && mo?.refundDueAt?.toISOString() === "2026-11-22T17:00:00.000Z",
      J({ a: a && [a.refundDueDate, a.daysLeft, a.refundOverdue], b: b && [b.daysLeft, b.refundOverdue], at: mo?.refundDueAt })];
  });
  await T("C-2", "ก่อนวันย้ายออก (14 พ.ย.) งานไม่เตือน N1 · สัญญายัง NOTICE", ["runDormMoveOutJobs"], async () => {
    await jobs(BK("2026-11-14", "12:00"));
    return [(await dueN1()).length === 0 && (await prisma.dormLease.findFirst({ where: { id: N.N1.leaseId } }))?.status === "NOTICE", `refund_due=${(await dueN1()).length}`];
  });
  await T("C-3", "เตือนวันละครั้ง ข้ามเที่ยงคืนไทย: งาน 15 พ.ย. 23:59 + 16 พ.ย. 00:01 ⇒ 2 event (คีย์วัน 15/16) · daysLeft 7/6 · payload 6 คีย์ ไม่มี PII", ["runDormMoveOutJobs"], async () => {
    await jobs(BK("2026-11-15", "23:59"));
    await jobs(BK("2026-11-16", "00:01"));
    const ev = await dueN1();
    const keys = (await prisma.outboxEvent.findMany({ where: { tenantId: A, type: "dorm.deposit.refund_due", idempotencyKey: { startsWith: `dorm.deposit.refund_due:${MO.N1}:` } }, select: { idempotencyKey: true } })).map((e: any) => e.idempotencyKey).sort();
    return [ev.length === 2 && J(keys) === J([`dorm.deposit.refund_due:${MO.N1}:2026-11-15`, `dorm.deposit.refund_due:${MO.N1}:2026-11-16`]) && J(ev.map((e: any) => e.payload.daysLeft)) === J([7, 6])
      && ev.every((e: any) => keysEq(e.payload, ["unitId", "leaseId", "moveOutId", "refundSatang", "dueAt", "daysLeft"])) && noPii(ev, [N.N1.phone]), J({ n: ev.length, keys, p: ev.map((e: any) => e.payload) })];
  });
  await T("C-4", "งานซ้อน 4 โพรเซสเวลาเดียวกัน (17 พ.ย. 09:00) ⇒ refund_due ของวันนั้น 1 รายการ (X5)", ["runDormMoveOutJobs"], async () => {
    const rs = await fanout("__jobs", null, Array.from({ length: 4 }, () => ({ now: ISO("2026-11-17", "09:00"), tenantId: A })), null, 4);
    const n = await prisma.outboxEvent.count({ where: { tenantId: A, idempotencyKey: `dorm.deposit.refund_due:${MO.N1}:2026-11-17` } });
    return [n === 1 && !rs.some((r) => r?.threw || r?.childFail), J({ n, rs: rs.map((r) => r?.threw ?? r?.childFail ?? "ok") })];
  });
  await T("C-5", "เลยกำหนด (23 พ.ย. STRICT) ⇒ เตือน daysLeft −1 + AuditLog dorm.deposit.refund_overdue ครั้งเดียว (งานวันถัดไปไม่เพิ่ม)", ["runDormMoveOutJobs"], async () => {
    await jobs(BK("2026-11-23", "08:00"));
    await jobs(BK("2026-11-23", "18:00"));
    await jobs(BK("2026-11-24", "08:00"));
    const ev = (await dueN1()).find((e: any) => e.payload.daysLeft === -1);
    const au = await prisma.auditLog.count({ where: { tenantId: A, action: "dorm.deposit.refund_overdue", targetId: MO.N1 ?? "-" } });
    return [!!ev && au === 1, J({ ev: ev?.payload, au })];
  });
  await T("C-6", "สัญญาจบเมื่อวันออกผ่าน (งาน 16 พ.ย.) ⇒ N1 ENDED/MOVED_OUT ก่อนคืนประกัน · dorm.lease.ended 1 ครั้ง", ["runDormMoveOutJobs"], async () => {
    const l = await prisma.dormLease.findFirst({ where: { id: N.N1.leaseId } });
    const en = await outbox("dorm.lease.ended", (p) => p.leaseId === N.N1.leaseId);
    return [l?.status === "ENDED" && l?.endReason === "MOVED_OUT" && en.length === 1, J({ l: l && [l.status, l.endReason], en: en.length })];
  });
  await T("C-7", "ปิดแล้ว (คืนช้า 24 พ.ย.) ⇒ งาน 25 พ.ย. ไม่เตือน N1 · dorm.lease.ended ยังคง 1", ["recordMoveOutInspection", "sendMoveOutSummary", "settleMoveOut", "runDormMoveOutJobs"], async () => {
    await inspect(cO, N.N1, MO.N1 ?? "-", [], [], "2026-11-16");
    const s = await sendSum(cO, N.N1, MO.N1 ?? "-", BK("2026-11-16"));
    const r = await settle(cO, N.N1, MO.N1 ?? "-", BK("2026-11-24", "10:00"));
    await jobs(BK("2026-11-25", "09:00"));
    const n25 = await prisma.outboxEvent.count({ where: { tenantId: A, idempotencyKey: `dorm.deposit.refund_due:${MO.N1}:2026-11-25` } });
    return [s?.ok === true && r?.ok === true && n25 === 0 && (await outbox("dorm.lease.ended", (p) => p.leaseId === N.N1.leaseId)).length === 1, J([codeOf(s), codeOf(r), n25])];
  });

  // ═══════════════ X. ย้ายห้อง (DT) ═══════════════
  console.log("\n── X ย้ายห้อง (ประกันตามต้นสาย · ไม่เก็บซ้ำ) ──");
  const listHeld = async () => (await fn("listLeases")?.(cO, { unitId: DT }))?.heldTotalSatang;
  const heldBefore = await listHeld();
  const depBefore = await depJvCount();
  let newT1 = "";
  await T("X-1", "ย้าย T1 401 → 406 มีผล 1 ธ.ค.: สัญญาเดิม ENDED/TRANSFER endDate 30 พ.ย. · สัญญาใหม่ ACTIVE ห้อง 406 previousLeaseId · 1 ธ.ค.–31 ธ.ค. 70 · occupancy เดิมจบ 1 ธ.ค. / ใหม่ [1 ธ.ค., 1 ม.ค. 71)", ["transferRoom"], async () => {
    const r = await fn("transferRoom")!(cLease, { unitId: DT, leaseId: TL.T1.leaseId, toRoomId: RT["406"], effectiveDate: "2026-12-01" }, { now: BK("2026-11-26") });
    newT1 = r?.leaseId ?? "";
    const old = await prisma.dormLease.findFirst({ where: { id: TL.T1.leaseId } }), nl = newT1 ? await prisma.dormLease.findFirst({ where: { id: newT1 } }) : null;
    const oo = await prisma.roomOccupancy.findFirst({ where: { id: TL.T1.occupancyId } }), no = nl?.occupancyId ? await prisma.roomOccupancy.findFirst({ where: { id: nl.occupancyId } }) : null;
    return [r?.ok === true && r.mode === "NEW_LEASE" && r.carriedDepositSatang === DEP && old?.status === "ENDED" && old?.endReason === "TRANSFER" && ymdOf(old?.endDate) === "2026-11-30"
      && nl?.status === "ACTIVE" && nl?.roomId === RT["406"] && nl?.previousLeaseId === TL.T1.leaseId && nl?.partyId === TL.T1.partyId && ymdOf(nl?.startDate) === "2026-12-01" && ymdOf(nl?.endDate) === "2027-12-31"
      && ymdOf(oo?.endDate) === "2026-12-01" && no?.roomId === RT["406"] && ymdOf(no?.startDate) === "2026-12-01" && ymdOf(no?.endDate) === "2028-01-01" && no?.active === true,
      J({ r: r && [codeOf(r), r.mode, r.carriedDepositSatang], old: old && [old.status, old.endReason, ymdOf(old.endDate)], nl: nl && [nl.status, nl.previousLeaseId === TL.T1.leaseId, ymdOf(nl.startDate)], oo: ymdOf(oo?.endDate), no: no && [ymdOf(no.startDate), ymdOf(no.endDate)] })];
  });
  await T("X-2", "ประกันตามต้นสาย ไม่มีเงินใหม่: getLease(ใหม่).heldSatang = 900,000 · ยอดถือทั้งหน่วยเท่าเดิม · ไม่มี JV ประกันใหม่ · event dorm.lease.ended (TRANSFER)", ["transferRoom"], async () => {
    const g = newT1 ? await fn("getLease")!(cO, { unitId: DT, leaseId: newT1 }) : null;
    const after = await listHeld();
    const en = await outbox("dorm.lease.ended", (p) => p.leaseId === TL.T1.leaseId);
    return [g?.heldSatang === DEP && after === heldBefore && (await depJvCount()) === depBefore && en.length === 1 && en[0].payload.reason === "TRANSFER", J({ held: g?.heldSatang, before: heldBefore, after, jv: [(await depJvCount()), depBefore], en: en.map((e: any) => e.payload.reason) })];
  });
  await T("X-3", "ย้ายไม่ได้ (ไม่เปลี่ยนอะไร): กลางเดือน ⇒ TRANSFER_DATE · เดือนที่ออกบิลแล้ว (1 พ.ย.) ⇒ ALREADY_BILLED · ห้องไม่ว่าง (404) ⇒ ROOM_TAKEN · ห้องหน่วยอื่น ⇒ NOT_FOUND", ["transferRoom"], async () => {
    const tr = (to: string, d: string) => fn("transferRoom")!(cLease, { unitId: DT, leaseId: TL.T3.leaseId, toRoomId: to, effectiveDate: d }, { now: BK("2026-11-26") });
    const a = await tr(RT["407"], "2026-12-15"), b = await tr(RT["407"], "2026-11-01"), c = await tr(RT["404"], "2026-12-01"), d = await tr(RM["201"], "2026-12-01");
    const l = await prisma.dormLease.findFirst({ where: { id: TL.T3.leaseId } });
    const kids = await prisma.dormLease.count({ where: { previousLeaseId: TL.T3.leaseId } });
    return [failOk(a, "TRANSFER_DATE") && failOk(b, "ALREADY_BILLED") && failOk(c, "ROOM_TAKEN") && failOk(d, "NOT_FOUND") && l?.status === "ACTIVE" && l?.roomId === RT["403"] && kids === 0, J([codeOf(a), codeOf(b), codeOf(c), codeOf(d), l?.status, kids])];
  });
  await T("X-4", "ย้ายพร้อมกัน 12 ทาง (T4 → 407 · 4 โพรเซส) ⇒ สัญญาใหม่ 1 · ok ทั้งหมด", ["transferRoom"], async () => {
    const rs = await fanout("transferRoom", cLease, Array.from({ length: 12 }, () => ({ unitId: DT, leaseId: TL.T4.leaseId, toRoomId: RT["407"], effectiveDate: "2026-12-01" })), { now: ISO("2026-11-26") });
    const kids = await prisma.dormLease.findMany({ where: { previousLeaseId: TL.T4.leaseId } });
    return [kids.length === 1 && rs.every((r) => r?.ok === true && r.leaseId === kids[0]?.id) && rs.filter((r) => r.duplicate === false).length === 1, J({ kids: kids.length, codes: rs.map(codeOf).slice(0, 6), bad: badOf(rs).slice(0, 2) })];
  });
  await T("X-5", "ก่อนเริ่มสัญญา + ยังไม่มีบิล (T5 เริ่ม 1 ธ.ค.) ⇒ IN_PLACE: สัญญาเดิม (id เดิม) ย้ายเป็นห้อง 409 · occupancy ย้ายห้อง (moveOccupancy) · ไม่มีสัญญาใหม่", ["transferRoom"], async () => {
    const r = await fn("transferRoom")!(cLease, { unitId: DT, leaseId: TL.T5.leaseId, toRoomId: RT["409"], effectiveDate: "2026-12-01" }, { now: BK("2026-11-26") });
    const l = await prisma.dormLease.findFirst({ where: { id: TL.T5.leaseId } }), oc = await prisma.roomOccupancy.findFirst({ where: { id: TL.T5.occupancyId } });
    return [r?.ok === true && r.mode === "IN_PLACE" && r.leaseId === TL.T5.leaseId && l?.roomId === RT["409"] && l?.status === "ACTIVE" && oc?.roomId === RT["409"] && oc?.active === true && (await prisma.dormLease.count({ where: { previousLeaseId: TL.T5.leaseId } })) === 0,
      J({ r: r && [codeOf(r), r.mode], l: l?.roomId === RT["409"], oc: oc?.roomId === RT["409"] })];
  });
  await T("X-6", "รอบบิล ธ.ค. หลังย้าย: สายของ T1/T4 มีบิล ธ.ค. 1 ใบ/สาย (สัญญาใหม่) · T5 1 ใบที่ห้อง 409 · ไม่มีบิลของสัญญาเดิมที่จบแล้ว", ["transferRoom", "prepareBillRun"], async () => {
    const r = await prep(cO, DT, "2026-12", ISO("2026-11-26", "10:00"));
    const s = r?.ok ? await sendAll(cO, DT, r.runId, ISO("2026-11-26", "10:00")) : null;
    const dec = await prisma.dormBill.findMany({ where: { unitId: DT, periodKey: "2026-12" }, select: { leaseId: true, roomId: true } });
    const kidT4 = (await prisma.dormLease.findFirst({ where: { previousLeaseId: TL.T4.leaseId } }))?.id;
    const cnt = (ids: (string | undefined)[]) => dec.filter((b: any) => ids.includes(b.leaseId)).length;
    return [r?.ok === true && cnt([TL.T1.leaseId, newT1]) === 1 && cnt([newT1]) === 1 && cnt([TL.T4.leaseId, kidT4]) === 1 && cnt([kidT4]) === 1 && dec.filter((b: any) => b.leaseId === TL.T5.leaseId && b.roomId === RT["409"]).length === 1,
      J({ r: codeOf(r), s: codeOf(s), t1: [cnt([TL.T1.leaseId]), cnt([newT1])], t4: [cnt([TL.T4.leaseId]), cnt([kidT4])], dec: dec.length })];
  });
  await T("P-5", "ย้ายห้อง (T2 → 408 มีผล 1 ม.ค.) ∥ รอบบิล ม.ค. (prepare+send ในโพรเซสอื่น): ค่าห้อง ม.ค. ของสาย T2 ถูกเก็บ 1 ครั้งพอดี · ประกันของสาย 900,000", ["transferRoom"], async () => {
    const at = Date.now() + SYNC_MS;
    const [a, b] = await Promise.all([
      fanout("transferRoom", cLease, Array.from({ length: 3 }, () => ({ unitId: DT, leaseId: TL.T2.leaseId, toRoomId: RT["408"], effectiveDate: "2027-01-01" })), { now: ISO("2026-12-25") }, 1, 0, at),
      fanout("__prepSend", cO, [{ unitId: DT, periodKey: "2027-01", now: ISO("2026-12-25", "10:00") }], null, 1, 0, at),
    ]);
    const run = await prisma.dormBillRun.findFirst({ where: { unitId: DT, periodKey: "2027-01" } });
    if (run) await sendAll(cO, DT, run.id, ISO("2026-12-25", "10:00"));
    const kid = (await prisma.dormLease.findFirst({ where: { previousLeaseId: TL.T2.leaseId } }))?.id;
    const jan = await prisma.dormBill.findMany({ where: { periodKey: "2027-01", leaseId: { in: [TL.T2.leaseId, kid ?? "-"] }, status: { not: "VOID" } } });
    const g = await fn("getLease")!(cO, { unitId: DT, leaseId: kid ?? TL.T2.leaseId });
    const bad = badOf([...a, ...b], ["BILL_PENDING", "ALREADY_BILLED", "RUN_BUSY", "BUSY"]);
    return [jan.length === 1 && g?.heldSatang === DEP && !bad.length, J({ jan: jan.length, kid: !!kid, held: g?.heldSatang, a: a.map(codeOf), b: b.map((r) => `${r?.stage}:${codeOf(r)}`), bad: bad.slice(0, 2) })];
  });

  // ═══════════════ W. ต่อสัญญา (DS) ═══════════════
  console.log("\n── W ต่อสัญญา (ขึ้นราคาได้ตอนนี้เท่านั้น) ──");
  const snapR1 = J((await prisma.dormLease.findFirst({ where: { id: SL.R1.leaseId } }))?.policySnapshot);
  await U(A, DS, "rooms.lateFee.graceDays", 9);
  let newR1 = "";
  await T("W-1", "ต่อสัญญา R1 12 เดือน ค่าห้อง 480,000 (ขึ้นจาก 450,000): สัญญาใหม่ ACTIVE 1 ม.ค.–31 ธ.ค. 70 · previousLeaseId · occupancy ใหม่ · สัญญาเดิมไม่แตะ (ACTIVE · 450,000 · snapshot เดิมทุกไบต์) · event dorm.lease.renewed", ["renewLease"], async () => {
    const r = await fn("renewLease")!(cLease, { unitId: DS, leaseId: SL.R1.leaseId, months: 12, rentSatang: 480_000 }, { now: BK("2026-11-01") });
    newR1 = r?.leaseId ?? "";
    const old = await prisma.dormLease.findFirst({ where: { id: SL.R1.leaseId } }), nl = newR1 ? await prisma.dormLease.findFirst({ where: { id: newR1 } }) : null;
    const oc = nl?.occupancyId ? await prisma.roomOccupancy.findFirst({ where: { id: nl.occupancyId } }) : null;
    const ev = await outbox("dorm.lease.renewed", (p) => p.leaseId === newR1);
    return [r?.ok === true && r.startDate === "2027-01-01" && r.endDate === "2027-12-31" && r.rentSatang === 480_000 && nl?.status === "ACTIVE" && nl?.previousLeaseId === SL.R1.leaseId && nl?.rentSatang === 480_000 && nl?.roomId === SL.R1.roomId
      && old?.status === "ACTIVE" && old?.rentSatang === RENT && ymdOf(old?.endDate) === "2026-12-31" && J(old?.policySnapshot) === snapR1 && ymdOf(oc?.startDate) === "2027-01-01" && ymdOf(oc?.endDate) === "2028-01-01"
      && ev.length === 1 && keysEq(ev[0].payload, ["unitId", "leaseId", "previousLeaseId", "roomId"]),
      J({ r: r && [codeOf(r), r.startDate, r.endDate, r.rentSatang], nl: nl && [nl.status, nl.rentSatang], old: old && [old.status, old.rentSatang, J(old.policySnapshot) === snapR1], oc: oc && [ymdOf(oc.startDate), ymdOf(oc.endDate)], ev: ev.length })];
  });
  await T("W-2", "snapshot สัญญาใหม่ = ค่าตั้งปัจจุบัน (ผ่อนผัน 9 วัน) · สัญญาเดิมยังเป็นค่าตอนทำสัญญา", ["renewLease"], async () => {
    const nl = newR1 ? await prisma.dormLease.findFirst({ where: { id: newR1 } }) : null;
    const ov = (JSON.parse(snapR1 ?? "{}") as any)?.values?.["rooms.lateFee.graceDays"];
    return [(nl?.policySnapshot as any)?.values?.["rooms.lateFee.graceDays"] === 9 && ov !== 9, J({ new: (nl?.policySnapshot as any)?.values?.["rooms.lateFee.graceDays"], old: ov })];
  });
  await T("W-3", "ต่อไม่ได้: สัญญาแจ้งย้ายออก (R3) ⇒ NOT_EDITABLE · ห้องถูกจองหลังวันจบ (R4) ⇒ ROOM_TAKEN · ต่อซ้ำ R1 ⇒ ok duplicate:true ตัวเดิม · แจ้งย้ายออกสัญญาที่ต่อแล้ว ⇒ HAS_RENEWAL", ["renewLease", "giveMoveOutNotice"], async () => {
    const a = await fn("renewLease")!(cLease, { unitId: DS, leaseId: SL.R3.leaseId, months: 12 }, { now: BK("2026-11-01") });
    const b = await fn("renewLease")!(cLease, { unitId: DS, leaseId: SL.R4.leaseId, months: 12 }, { now: BK("2026-11-01") });
    const c = await fn("renewLease")!(cLease, { unitId: DS, leaseId: SL.R1.leaseId, months: 12, rentSatang: 480_000 }, { now: BK("2026-11-02") });
    const d = await notice(cO, SL.R1, "2026-12-31", "2026-11-02");
    return [failOk(a, "NOT_EDITABLE") && failOk(b, "ROOM_TAKEN") && c?.ok === true && c.duplicate === true && c.leaseId === newR1 && failOk(d, "HAS_RENEWAL"), J([codeOf(a), codeOf(b), codeOf(c), c?.duplicate, codeOf(d)])];
  });
  await T("W-4", "ต่อพร้อมกัน 12 ทาง (R2 · 4 โพรเซส) ⇒ สัญญาใหม่ 1", ["renewLease"], async () => {
    const rs = await fanout("renewLease", cLease, Array.from({ length: 12 }, () => ({ unitId: DS, leaseId: SL.R2.leaseId, months: 12 })), { now: ISO("2026-11-01") });
    const kids = await prisma.dormLease.count({ where: { previousLeaseId: SL.R2.leaseId } });
    return [kids === 1 && rs.every((r) => r?.ok === true) && rs.filter((r) => r.duplicate === false).length === 1, J({ kids, codes: rs.map(codeOf).slice(0, 6), bad: badOf(rs).slice(0, 2) })];
  });
  await T("W-5", "งานตามเวลา 1 ม.ค. 70: R1 ⇒ ENDED/RENEWED + dorm.lease.ended 1 · สัญญาใหม่ ACTIVE · ประกันของสาย 900,000 (getLease ใหม่) · ไม่มี JV ประกันใหม่", ["runDormMoveOutJobs", "renewLease"], async () => {
    const before = await depJvCount();
    await jobs(BK("2027-01-01", "09:00"));
    const old = await prisma.dormLease.findFirst({ where: { id: SL.R1.leaseId } }), nl = newR1 ? await prisma.dormLease.findFirst({ where: { id: newR1 } }) : null;
    const g = newR1 ? await fn("getLease")!(cO, { unitId: DS, leaseId: newR1 }) : null;
    const en = await outbox("dorm.lease.ended", (p) => p.leaseId === SL.R1.leaseId);
    return [old?.status === "ENDED" && old?.endReason === "RENEWED" && nl?.status === "ACTIVE" && g?.heldSatang === DEP && en.length === 1 && (await depJvCount()) === before, J({ old: old && [old.status, old.endReason], nl: nl?.status, held: g?.heldSatang, en: en.length })];
  });

  // ═══════════════ H. หน้าแรก (todo) ═══════════════
  console.log("\n── H หน้าแรกหอ \"ต้องทำวันนี้\" (หนี้ D.9 Q4 / D.13) ──");
  await T("H-1", "todo: expired (E1 สัญญาเลยวันจบยังไม่ปิด ห้อง 505) · refundDue (ใบย้ายออกที่ยังไม่คืนเงินใน DN)", ["moveOutSummary"], async () => {
    const DH: any = await tryImport(pathToFileURL(join(ROOT, F.home)).href);
    const a = await DH?.dormHomeModel?.(mOwnerA, { tenantId: A }, { unitId: DS, date: "2026-11-05" });
    const b = await DH?.dormHomeModel?.(mOwnerA, { tenantId: A }, { unitId: DN, date: "2026-11-24" });
    const ex = (a?.todo ?? []).find((t: any) => t.kind === "expired"), rd = (b?.todo ?? []).find((t: any) => t.kind === "refundDue");
    return [!!ex && /505/.test(ex.textTh) && THAI.test(ex.textTh) && !!rd && rd.count >= 1 && THAI.test(rd.textTh), J({ ex, rd, kinds: [(a?.todo ?? []).map((t: any) => t.kind), (b?.todo ?? []).map((t: any) => t.kind)] })];
  }, "MAJOR");

  // ═══════════════ Y. ข้ามร้าน · สิทธิ์ ═══════════════
  console.log("\n── Y ข้ามร้าน/ข้ามหน่วย · สิทธิ์ (Membership สด) ──");
  const NF = await fn("giveMoveOutNotice")?.(cO, { unitId: DN, leaseId: "lease-ที่ไม่มีจริง", moveOutDate: "2026-12-31" }, { now: BK("2026-11-01") });
  const sameNF = (r: any) => failOk(r, "NOT_FOUND") && r.reason === NF?.reason;
  await T("Y-1", "ร้าน B ⇒ NOT_FOUND เหตุผลเดียวกับ id ที่ไม่มีจริง: แจ้ง · ตรวจ · ส่ง · ปิด · ย้ายห้อง · ต่อสัญญา (สัญญา/ใบของร้าน A) · ร้าน A กับสัญญาร้าน B ด้วย", ["giveMoveOutNotice", "recordMoveOutInspection", "sendMoveOutSummary", "settleMoveOut", "transferRoom", "renewLease"], async () => {
    const rs = [
      await fn("giveMoveOutNotice")!(cB, { unitId: DN, leaseId: N.N16.leaseId, moveOutDate: "2026-12-31" }, { now: BK("2026-11-01") }),
      await fn("recordMoveOutInspection")!(cB, { unitId: DN, moveOutId: MO.N6 ?? "-", items: [], meterReadings: [] }, { now: BK("2026-11-10") }),
      await fn("sendMoveOutSummary")!(cB, { unitId: DN, moveOutId: MO.N6 ?? "-" }, { now: BK("2026-11-10") }),
      await fn("settleMoveOut")!(cB, { unitId: DN, moveOutId: MO.N6 ?? "-" }, { now: BK("2026-11-12") }),
      await fn("transferRoom")!(cB, { unitId: DT, leaseId: TL.T3.leaseId, toRoomId: RT["408"], effectiveDate: "2027-02-01" }, { now: BK("2026-12-26") }),
      await fn("renewLease")!(cB, { unitId: DS, leaseId: SL.R2.leaseId, months: 6 }, { now: BK("2026-11-02") }),
      await fn("giveMoveOutNotice")!(cO, { unitId: DB_, leaseId: BL.leaseId, moveOutDate: "2026-12-31" }, { now: BK("2026-11-01") }),
    ];
    return [!!NF && rs.every(sameNF), J(rs.map(codeOf))];
  });
  await T("Y-2", "สิทธิ์: ผู้มีแค่ dorm.view · ผู้ดูแลหน่วยอื่น · สมาชิกยังไม่รับเชิญ ⇒ NOT_FOUND เหตุผลเดียวกัน · ผู้ดูแล (moveout) ย้ายห้อง/ต่อสัญญาไม่ได้ (ต้อง dorm.lease.manage)", ["giveMoveOutNotice", "transferRoom", "renewLease"], async () => {
    const n = (c: any) => fn("giveMoveOutNotice")!(c, { unitId: DN, leaseId: N.N17.leaseId, moveOutDate: "2026-12-31" }, { now: BK("2026-11-01") });
    const a = await n(cView), b = await n(cOther), c = await n(cPend);
    const d = await fn("transferRoom")!(cCare, { unitId: DT, leaseId: TL.T3.leaseId, toRoomId: RT["408"], effectiveDate: "2027-02-01" }, { now: BK("2026-12-26") });
    const e = await fn("renewLease")!(cCare, { unitId: DS, leaseId: SL.R2.leaseId, months: 6 }, { now: BK("2026-11-02") });
    return [[a, b, c, d, e].every(sameNF) && !(await moRow(N.N17)), J([a, b, c, d, e].map(codeOf))];
  });
  await T("Y-3", "สิทธิ์สด: ผู้ดูแลแจ้งได้ แล้วถูกถอนสิทธิ์ ⇒ ยกเลิก/ตรวจ ⇒ NOT_FOUND ทันที", ["giveMoveOutNotice", "cancelMoveOut"], async () => {
    const a = await fn("giveMoveOutNotice")!(cRev, { unitId: DN, leaseId: N.N18.leaseId, moveOutDate: "2026-12-31" }, { now: BK("2026-11-01") });
    await prisma.membership.update({ where: { id: REV.membershipId }, data: { permissions: {} } });
    const b = await fn("cancelMoveOut")!(cRev, { unitId: DN, moveOutId: a?.moveOutId ?? "-", reason: "ทดสอบสิทธิ์" }, { now: BK("2026-11-02") });
    const c = await fn("recordMoveOutInspection")!(cRev, { unitId: DN, moveOutId: a?.moveOutId ?? "-", items: [], meterReadings: [] }, { now: BK("2026-11-02") });
    return [a?.ok === true && sameNF(b) && sameNF(c) && (await moRow(N.N18))?.status === "NOTICE", J([codeOf(a), codeOf(b), codeOf(c)])];
  });

  // ═══════════════ K. บัญชี ═══════════════
  console.log("\n── K บัญชี (สมดุล · ไม่ลบ · กลับรายการ/ปิดเท่านั้น) ──");
  {
    const es = await prisma.accountJournalEntry.findMany({ where: { tenantId: A }, select: { id: true, docNo: true, lines: { select: { debit: true, credit: true } } } });
    const off = es.filter((e: any) => e.lines.reduce((s: number, l: any) => s + l.debit - l.credit, 0) !== 0);
    chk("K-1", `ทุก JV ของร้านทดสอบสมดุล Dr = Cr (${es.length} รายการ)`, es.length > 0 && !off.length, J(off.slice(0, 3).map((e: any) => e.docNo)), "CRITICAL");
  }
  {
    const now = await acctSnapshot();
    const lostJv = [...ACCT0.jv].filter((id) => !now.jv.has(id)), lostDoc = [...ACCT0.doc].filter((id) => !now.doc.has(id));
    chk("K-2", "ไม่มีการลบ: JV/เอกสารบัญชีที่มีก่อนชุดทดสอบยังอยู่ครบ (แก้ด้วยใบลดหนี้/JV ปิดเท่านั้น)", !lostJv.length && !lostDoc.length && now.jv.size > ACCT0.jv.size, J({ lostJv: lostJv.length, lostDoc: lostDoc.length, grew: now.jv.size - ACCT0.jv.size }), "CRITICAL");
  }

  // ═══════════════ Q. ฉาก svcqc ═══════════════
  console.log("\n── Q ฉากย้ายออก 207 (svcqc) ──");
  {
    const svcT = SV?.SQC_TENANT?.id as string | undefined, svcDorm = SV?.SQC_UNITS?.dorm?.id as string | undefined;
    const sc = SV?.SQC_DORM_MOVEOUT_SCENE, days = SV?.SQC_DORM_MOVEOUT_DAYS;
    const ready = svcT && svcDorm && sc ? {
      rooms: await prisma.hotelRoom.count({ where: { tenantId: svcT, unitId: svcDorm } }),
      leases: await prisma.dormLease.count({ where: { tenantId: svcT, unitId: svcDorm, createdById: "SvcQcScene" } }),
    } : null;
    const runTsx = (file: string, args: string[] = []) => {
      const r = spawnSync("pnpm", ["exec", "tsx", file, ...args], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
      const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
      const m = /SCENE_SUMMARY (\{.*\})/.exec(out);
      let sum: any = null;
      try { sum = m ? JSON.parse(m[1]) : null; } catch { /* อ่านไม่ได้ */ }
      return { status: r.status, out, sum };
    };
    if (!ready || ready.rooms !== 36 || ready.leases < 31) {
      for (const [id, n] of [["Q-1", "ฉากรันได้"], ["Q-2", "โมเดลฉาก 207"], ["Q-3", "รันซ้ำไม่เขียน"]]) skip(id, n, `ร้าน svcqc ยังไม่พร้อม ${J(ready)} — seed-svc-qc + ฉาก roomboard → lease (D.5) → dorm-home (D.13) ก่อน`, "MAJOR");
    } else {
      await T("Q-1", "ฉากย้ายออกรันได้ (exit 0) · พิมพ์ SCENE_SUMMARY {created,updated,removed}", [], async () => {
        if (!existsSync(join(ROOT, F.scene))) return [false, `ยังไม่มี ${F.scene}`];
        const r = runTsx(F.scene);
        return [r.status === 0 && !!r.sum && ["created", "updated", "removed"].every((k) => typeof r.sum[k] === "number"), `exit=${r.status} ${r.sum ? J(r.sum) : r.out.split("\n").slice(-4).join(" | ").slice(0, 240)}`];
      }, "MAJOR");
      await T("Q-2", "moveOutModel svcqc ห้อง 207 ณ วันออก 11:05: INSPECTED · ประกัน 900,000 · ค่าใช้จ่าย 124,072 · คืน 775,928 · เหลือ 7 วัน · สัญญา ENDED · อยู่ร่วมกับ D.5 (CURRENT 31 · ยอดถือ ฿296,400)", ["moveOutModel", "listLeases"], async () => {
        const ou = (SV.SQC_USERS ?? []).find((u: any) => u.key === "owner");
        const c = { tenantId: svcT, actorUserId: ou?.userId };
        const m = await fn("moveOutModel")!(c, { unitId: svcDorm, roomNumber: sc.room }, { now: BK(days.moveOutDate, sc.shotAt) });
        const l = await fn("listLeases")!(c, { unitId: svcDorm });
        const lease = m?.leaseId ? await prisma.dormLease.findFirst({ where: { id: m.leaseId } }) : null;
        return [m?.status === sc.expect.status && m?.heldSatang === sc.expect.heldSatang && m?.chargesSatang === sc.expect.chargesSatang && m?.refundSatang === sc.expect.refundSatang && m?.daysLeft === sc.expect.daysLeftAtShot
          && lease?.status === sc.expect.leaseStatus && l?.counts?.CURRENT === 31 && l?.heldTotalSatang === 29_640_000, J({ m: m && [m.status, m.heldSatang, m.chargesSatang, m.refundSatang, m.daysLeft], lease: lease?.status, cur: l?.counts?.CURRENT, held: l?.heldTotalSatang })];
      }, "MAJOR");
      await T("Q-3", "รันฉากซ้ำ ⇒ SCENE_SUMMARY 0/0/0", [], async () => {
        if (!existsSync(join(ROOT, F.scene))) return [false, `ยังไม่มี ${F.scene}`];
        const r = runTsx(F.scene);
        return [r.status === 0 && r.sum?.created === 0 && r.sum?.updated === 0 && r.sum?.removed === 0, `exit=${r.status} ${J(r.sum)}`];
      }, "MAJOR");
    }
  }

  // ═══════════════ V. ภาพ ═══════════════
  console.log("\n── V ภาพ จอย้ายออก (หอ 07) ──");
  {
    const specs = SV?.SQC_VISUAL_SPECS?.["d.12"];
    const base = process.env.QC_BASE ?? "";
    const name = "ภาพ dorm-moveout 1440 + 390 ด้วยผู้ใช้ owner · HTTP < 400 · ไม่ล้นแนวนอน";
    if (!Array.isArray(specs) || !specs.length) fail("V-1", name, `ไม่มี SQC_VISUAL_SPECS d.12 ${J(specs)}`, "MAJOR");
    else if (!base) skip("V-1", name, "ไม่มี QC_BASE — ผู้คุม build QC ผ่าน iso + reseed + ฉาก (roomboard→lease→dorm-home→moveout) + SVC_QC_CLOCK=1 แล้วรันซ้ำด้วย QC_BASE=http://127.0.0.1:<port>", "MAJOR");
    else {
      const r = spawnSync("pnpm", ["exec", "tsx", "scripts/visual-svc.mts", "d.12", "--user", "owner", "--base", base], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
      const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
      if (r.status === 0) pass("V-1", `${name} (ภาพ .qc-shots/svc/d.12 — ผู้คุมเทียบ PARITY กับ ledger/design-dorm/07-moveout-deposit.png)`);
      else fail("V-1", name, `exit=${r.status} ${out.split("\n").filter((l) => l.includes("❌")).slice(0, 3).join(" | ").slice(0, 300)}`, "MAJOR");
    }
  }
  pendingAtOldG = await pendingOutbox(tenantIds);
  console.log(`\n  (G order) outbox PENDING ก่อนล้าง: ทั้งฐาน ${pendingAtOldG.all} · ของร้านทดสอบนี้ ${pendingAtOldG.mine}`);
} catch (e) {
  fail("CRASH", "จบกลางทาง", errMsg(e), "CRITICAL");
} finally {
  try { await cleanup(tenantIds); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); }
  try { await prisma.user.deleteMany({ where: { email: { startsWith: "svc-d12-" } } }); } catch (e) { console.log(`  ⚠️ cleanup users: ${errMsg(e)}`); }
  try {
    const left = await leftovers(tenantIds);
    if (!left.length) pass("Z-1", `ล้างครบ: ทุกตารางที่มี tenantId ของร้านทดสอบ ${tenantIds.length} ร้าน + ผู้ใช้ svc-d12-* = 0 แถว (ฉาก svcqc คงไว้ให้ถ่ายภาพ — ล้างด้วย scripts/svc-qc-moveout-scene.mts --clear)`);
    else fail("Z-1", "ล้างครบ", J(left), "MAJOR");
  } catch (e) { fail("Z-1", "ล้างครบ", `ตรวจไม่ได้: ${errMsg(e)}`, "MAJOR"); }
  // ═══════════════ G. regression — รันหลังล้างข้อมูล ═══════════════
  try {
    const pend = await pendingOutbox(tenantIds);
    console.log(`\n── G regression (ลูกโพรเซส · env เดียวกัน · หลังล้างข้อมูล · ผ่าน = JSON_SUMMARY ไม่มี failed / exit 0) ──`);
    console.log(`  (G order) outbox PENDING ตอนเริ่ม G: ทั้งฐาน ${pend.all} · ของร้านทดสอบนี้ ${pend.mine} (ก่อนล้าง: ${pendingAtOldG ? `${pendingAtOldG.all}/${pendingAtOldG.mine}` : "ไม่ได้วัด — จบกลางทาง"})`);
    // [id, ชุด, args, ข้อที่ยอมให้แดงพร้อมเหตุผล]
    //   แดงตั้งแต่ฐาน 788cdeb0 (วัดในรอบเขียนข้อสอบ 30 ต.ค. · /tmp/svc-d12-oracle-2.log · ไม่เกี่ยว D.12) — ผู้คุมลบออกเมื่อ ORACLE-EDIT ของชุดนั้นลงแล้ว:
    //   d.6 S-5 "MeterWalk ไม่คิดเงิน" แดงตั้งแต่ D.7 เพิ่มกล่องประมาณเงิน · d.6 G-2 = r0.2 D-6/D-7/D-14 ข้อมูล seed บาร์เบอร์เปลี่ยนหลัง B.x
    //   d.13 Q-2 diffCount 5≠4 บนฉาก svcqc (ORACLE-EDIT d.13 Q-2 ค้างของผู้คุม — /root/svc-runs/fix/d9.md)
    const REG: [string, string, string[], string[]][] = [
      ["G-1", "qc-svc-d.2", [], []], ["G-2", "qc-svc-d.5", [], []], ["G-3", "qc-svc-d.6", [], ["S-5", "G-2"]], ["G-4", "qc-svc-d.8", ["--no-regression"], []],
      ["G-5", "qc-svc-d.11", ["--no-regression"], []], ["G-6", "qc-svc-d.13", ["--no-regression"], ["Q-2"]], ["G-7", "qc-svc-d.9", ["--no-regression"], ["S-1", "S-2"]] /* ORACLE-EDIT (ผู้คุม 30 ต.ค. · d12-G7) d.9 S-1/S-2 = ตรวจไฟล์ตอนรับใบ D.9 เท่านั้น */, ["G-8", "qc-svc-smoke", [], []],
    ];
    for (const [id, f, args, allow] of REG) {
      if (NO_REG) { skip(id, `regression ${f}`, "--no-regression / SVC_D12_NO_REGRESSION=1", "CRITICAL"); continue; }
      if (!existsSync(join(ROOT, `scripts/${f}.mts`))) { skip(id, `regression ${f}`, `ไม่มี scripts/${f}.mts บน tip นี้ (ใบยังไม่รวม) — ผู้คุมรันหลัง merge`, "CRITICAL"); continue; }
      const r = spawnSync("pnpm", ["exec", "tsx", `scripts/${f}.mts`, ...args], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
      const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
      const js = [...out.matchAll(/JSON_SUMMARY (\{.*\})/g)].map((m) => m[1]).pop();
      let sum: any = null;
      try { sum = js ? JSON.parse(js) : null; } catch { /* อ่านไม่ได้ */ }
      const failedIds: string[] = Array.isArray(sum?.failed) ? sum.failed : [];
      const real = failedIds.filter((x) => !allow.includes(x));
      // ORACLE-EDIT (ผู้คุม 30 ต.ค. · d12-G7b) ชุดที่ exit 1 เพราะมีแต่ SKIP/findings (failed ว่าง · เช่น d.9 S-1 ตรวจตอนรับใบ) = ผ่าน
      const onlySkips = failedIds.length === 0 && Array.isArray(sum?.findings) && sum.findings.every((x: string) => (sum.skipped ?? []).includes(x));
      const ok = !!sum && real.length === 0 && (r.status === 0 || failedIds.length > 0 || onlySkips);
      if (ok) pass(id, `regression ${f} ไม่มีข้อแดง (${sum.passed}/${sum.total}${sum.skipped?.length ? ` · SKIP ${sum.skipped.length}` : ""}${failedIds.length ? ` · ยอมตามใบสั่ง: ${failedIds.join(",")}` : ""})`);
      else fail(id, `regression ${f} ไม่มีข้อแดง`, `exit=${r.status} failed=${J(failedIds)} · ${out.split("\n").filter((l) => l.includes("❌")).slice(0, 3).join(" | ").slice(0, 300)}`, "CRITICAL");
    }
  } catch (e) { fail("G-CRASH", "หมวด G จบกลางทาง", errMsg(e), "CRITICAL"); }
  await prisma.$disconnect();
}

const failed = cks.filter((c) => c.res === "FAIL");
const skipped = cks.filter((c) => c.res === "SKIP");
const passed = cks.length - failed.length - skipped.length;
console.log(`\n===== QC SVC D.12 · ย้ายออก · ย้ายห้อง · ต่อสัญญา + คืนประกัน =====\nผ่าน ${passed}/${cks.length}${skipped.length ? ` (SKIP ${skipped.length})` : ""}`);
console.log(`FINDINGS: CRITICAL ${failed.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${failed.filter((c) => c.sev === "MAJOR").length} · MINOR ${failed.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id) })}`);
// exit 0 เมื่อไม่มีข้อแดง · รับใบ = ผ่านทุกข้อ (SKIP ที่ยอมได้: V-1 ไม่มี QC_BASE · Q-* ร้าน svcqc ยังไม่พร้อม · G-* เมื่อ --no-regression หรือชุดยังไม่อยู่บน tip — ผู้คุมรันซ้ำครบก่อนรับ)
process.exit(failed.length > 0 ? 1 : 0);
