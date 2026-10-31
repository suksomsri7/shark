// QC — SVC D.14 · AI อ่านเลขมิเตอร์จากรูป (ระบบเสนอ · คนยืนยัน) · oracle ของผู้เขียนข้อสอบ — builder ห้ามแก้ไฟล์นี้ (แย้ง = wo-notes)
// สัญญา: ledger/svc-briefs/svc-brief-d.14.md (§2 มติ · §3 สัญญาโค้ด · §4 บันทึก · §5 จอ · §7 ฉาก · §9 มติขอเคาะ R1–R6) · ledger/SVC-MASTER-PLAN.md แถว D.14
//        svc-brief-d.6.md (submitReadings · ป้าย · confirmReading · คิว) · svc-brief-d.4.md §3.2 (ตัวต่อ AI เสียบได้) · src/lib/ai/credit.ts (เครดิตเดิม)
//
// กลุ่มข้อ:
//   S  โครงสร้าง/ไฟล์/ค่าตั้ง/สุขอนามัยโค้ด (+ S-1/S-2/S-13 git ท้ายไฟล์ — ตอนรับใบเท่านั้น)
//   PC ตัวควบคุม (เขียวตั้งแต่ก่อนมีงาน): ข้อมูลทดสอบ · submitReadings D.6 · ตัวจำลอง OpenRouter + บล็อกเน็ต · เครดิตเดิม · ขอบเขตอาคาร D.13
//   P  เสนอ: ผล AI · ไม่บันทึกเลข · รูปส่วนตัว · รูปเดิมซ้ำ = ครั้งเดียว · รูปใหม่ = ครั้งใหม่ · มั่นใจต่ำ · ค่าไม่สมเหตุผล · อ่านไม่ออก · ล้ม/หมดเวลา
//      · ปิดต่อหน่วย · ไม่มี provider · เครดิตหมด · ไฟล์อันตราย · งวดผิด/ถอด/ล็อก
//   C  คิดเงิน: แถว USAGE ตรงทุกช่อง · ไม่มี PII · ref กันซ้ำ (credit.ts) · พร้อมกันในโพรเซส · 10 ทางจาก 5 โพรเซส · ไม่หักร้านอื่น · สถานะอ่านอย่างเดียว
//   K  คนยืนยัน: บันทึกจากข้อเสนอ (source AI · aiValue · รูปเดิม) · แก้ค่า · มั่นใจต่ำต้องติ๊ก · ป้าย D.6 ต้อง confirmReading · ไม่มี AI = ทางเดียวกัน · ข้อเสนอผิดที่ = ไม่พบ
//   X  ขอบเขต X1: ไม่พบเดียวกัน 8 กรณี · อาคาร · รายการข้อเสนอ · previewReading
//   M  PDPA X8: ตัวต่อจริง (defaultMeterReader) ผ่านตัวจำลอง OpenRouter — รูปเดียว ไม่มีเลขห้อง/ชื่อ/id · ไม่ออกนอก provider · ไม่มีคีย์ = ไม่มี AI · ไม่มีรูปในฐาน · ตอบเพี้ยน/ล้ม
//   U  จอ MeterWalk (render) + คิวออฟไลน์ pure · Z ล้าง · Q ฉาก svcqc · V ภาพ · G regression (หลังล้าง)
//
// 🔴 ไม่เรียก AI จริง: SHARK_AI_KEY ในโพรเซสนี้ = คีย์ปลอม (ทับค่าจาก .env.qc-svc) · ครอบ fetch: openrouter.ai = ตัวจำลองในโพรเซส · ปลายทางนอกเครื่องอื่น = บล็อก
//    · โพรเซสลูกครอบ fetch แบบเดียวกัน (บล็อกทั้งหมด) และใช้ตัวอ่านจำลองที่ส่งผ่าน deps.reader
// 🔴 ร้านทดสอบ slug `qc-svc-d14-*` · ผู้ใช้ `svc-d14-*@shark.local` · ลบใน finally (+ กวาดค้างตอนเริ่ม) · งวดสัมพัทธ์กับเดือนนี้ไทย
// รัน: cd /root/projects/shark-svc-l4 && bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-d.14.mts [--no-regression]
//      (ห้าม timeout ครอบ · ห้าม kill กลางคัน · `--no-regression` = G เป็น SKIP)
/* eslint-disable @typescript-eslint/no-explicit-any */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
import { SQC_TENANT, SQC_UNITS, SQC_USERS, SQC_VISUAL_SPECS, SQC_DORM_METER_AI_SCENE, sqcMeterAiPhoto } from "./svc-qc-data.mjs";

type Any = any;
const SELF = fileURLToPath(import.meta.url);
const ROOT = join(dirname(SELF), "..");
const LABEL = "qc-svc-d.14";
const NO_REG = process.argv.includes("--no-regression") || process.env.SVC_D14_NO_REGRESSION === "1";
const F = {
  ai: "src/lib/modules/dorm/meter-ai.ts",
  meter: "src/lib/modules/dorm/meter.ts",
  queue: "src/lib/modules/dorm/meter-queue.ts",
  dormIndex: "src/lib/modules/dorm/index.ts",
  comp: "src/components/dorm/MeterWalk.tsx",
  page: "src/app/app/u/[unitSlug]/dorm/meter/page.tsx",
  actions: "src/app/app/u/[unitSlug]/dorm/meter/actions.ts",
  defs: "src/lib/core/settings/defs/rooms.ts",
  credit: "src/lib/ai/credit.ts",
  scene: "scripts/svc-qc-meter-ai-scene.mts",
  fitness: "scripts/fitness.mts",
} as const;

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 300);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const b64 = (u: Uint8Array) => Buffer.from(u).toString("base64");
const unb64 = (s: string) => Uint8Array.from(Buffer.from(s, "base64"));
const FAKE_KEY = "qc-d14-fake-key";
const MODEL = "anthropic/claude-sonnet-5";

// ═══════════════ ครอบ fetch (ทั้งโพรเซสหลักและลูก) — openrouter.ai = ตัวจำลอง · นอกเครื่องอื่น = บล็อก ═══════════════
type OrReq = { url: string; auth: string; body: Any };
const OR_REQS: OrReq[] = [];
const BLOCKED: string[] = [];
let OR_MODE: "ok" | "garbage" | "error" = "ok";
let OR_VALUE: number | null = 1395;
const OR_USAGE = { prompt_tokens: 1500, completion_tokens: 40 };
const REAL_FETCH = globalThis.fetch;
const installFetch = (fakeOpenRouter: boolean) => {
  globalThis.fetch = (async (input: Any, init?: Any): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : String(input?.url ?? "");
    let host = "";
    try { host = new URL(url).hostname; } catch { /* ไม่ใช่ URL */ }
    if (host === "127.0.0.1" || host === "localhost" || host.endsWith(".neon.tech")) return REAL_FETCH(input, init);
    if (fakeOpenRouter && host === "openrouter.ai") {
      let body: Any = null;
      try { body = JSON.parse(String(init?.body ?? "null")); } catch { body = null; }
      const h = init?.headers ?? {};
      const auth = String((h as Any).Authorization ?? (h as Any).authorization ?? (typeof (h as Any).get === "function" ? (h as Any).get("authorization") : "") ?? "");
      OR_REQS.push({ url, auth, body });
      if (OR_MODE === "error") return new Response(JSON.stringify({ error: { message: "qc fake 500" } }), { status: 500, headers: { "content-type": "application/json" } });
      const content = OR_MODE === "garbage" ? "ขออภัย มองไม่เห็นตัวเลขชัดเจน" : JSON.stringify({ value: OR_VALUE, confidence: 0.94 });
      return new Response(JSON.stringify({ model: MODEL, choices: [{ message: { content } }], usage: OR_USAGE }), { status: 200, headers: { "content-type": "application/json" } });
    }
    BLOCKED.push(host.slice(0, 80));
    return new Response(JSON.stringify({ message: "blocked by qc" }), { status: 503, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
};

/** ตัวอ่านจำลอง — นับครั้ง · เก็บ input · หน่วงได้ · throw ได้ */
type StubSpec = { value?: unknown; confidence?: unknown; delayMs?: number; throws?: boolean; tin?: number; tout?: number };
const mkReader = (spec: StubSpec) => {
  const calls: Any[] = [];
  const reader = {
    async read(input: Any, _opts?: Any) {
      calls.push(input);
      if (spec.delayMs) await sleep(spec.delayMs);
      if (spec.throws) throw new Error("qc stub reader failed");
      return { value: spec.value as Any, confidence: spec.confidence as Any, model: MODEL, tokensIn: spec.tin ?? 1200, tokensOut: spec.tout ?? 30 };
    },
  };
  return { calls, reader };
};

// ═══════════════ โหมดโพรเซสลูก (`--child <base64 JSON>`) — ยิงพร้อมกันจากโพรเซสแยก (ไม่สร้างข้อมูล/ไม่ล้าง) ═══════════════
{
  const ix = process.argv.indexOf("--child");
  if (ix >= 0) {
    installFetch(false);
    let out: Any = { results: [], calls: -1 };
    try {
      const job = JSON.parse(Buffer.from(process.argv[ix + 1] ?? "", "base64url").toString("utf8")) as { op: string; items: Any[]; stub: StubSpec; at: number };
      const Dm = (await import("@/lib/modules/dorm" as string)) as Any;
      const st = mkReader(job.stub);
      const put = async () => {};
      const wait = job.at - Date.now();
      if (wait > 0) await sleep(wait);
      const results = await Promise.all(job.items.map(async (x: Any) => {
        try {
          if (typeof Dm.proposeMeterReading !== "function") return { childFail: "ไม่มี proposeMeterReading" };
          return await Dm.proposeMeterReading(x.ctx, { ...x.input, photo: { data: unb64(x.input.photo.data), contentType: x.input.photo.contentType } }, { reader: st.reader, put });
        } catch (e) { return { threw: errMsg(e) }; }
      }));
      out = { results, calls: st.calls.length };
    } catch (e) { out = { results: [{ childFail: errMsg(e) }], calls: -1 }; }
    console.log(`CHILD_RESULT ${JSON.stringify(out)}`);
    try { const { prisma } = (await import("@/lib/core/db" as string)) as Any; await prisma.$disconnect(); } catch { /* ไม่เป็นไร */ }
    process.exit(0);
  }
}

loadSvcQcEnv(LABEL); // ด่านฐาน: ไม่ใช่ qc-svc ⇒ exit 4 ก่อนแตะฐาน
if (process.env.CI) { console.error(`🔴 ${LABEL}: ห้าม export CI (with-gate-lock ข้าม flock)`); process.exit(4); }
if (process.env.APP_ENV === "production") { console.error(`🔴 ${LABEL}: APP_ENV=production`); process.exit(4); }
// 🔴 ทับคีย์ AI จากไฟล์ env ด้วยคีย์ปลอม (โพรเซสลูก/ชุด regression ได้คีย์ปลอมด้วย) · ปิดตัวจำลอง MockProvider · ไม่บังคับโมเดล
process.env.SHARK_AI_KEY = FAKE_KEY;
delete process.env.SHARK_AI_MOCK;
delete process.env.SHARK_AI_MODEL;
delete process.env.SHARK_AI_PRICE_MARKUP;
installFetch(true);

// ═══════════════ ตัวช่วย ═══════════════
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Res = "PASS" | "FAIL" | "SKIP";
const cks: { id: string; res: Res; sev: Sev; why: string }[] = [];
class AssertFail extends Error {}
const fmt = (v: unknown): string => { try { return JSON.stringify(v)?.slice(0, 260) ?? String(v); } catch { return String(v); } };
const J = (v: unknown): string => { try { return JSON.stringify(v) ?? String(v); } catch { return String(v); } };
const ok = (cond: unknown, why: string): void => { if (!cond) throw new AssertFail(why); };
const eq = (act: unknown, exp: unknown, what: string): void => { if (!isDeepStrictEqual(act, exp)) throw new AssertFail(`${what}: ได้ ${fmt(act)} ต้องเป็น ${fmt(exp)}`); };
const record = (id: string, name: string, res: Res, why: string, sev: Sev) => {
  cks.push({ id, res, sev, why });
  const icon = res === "PASS" ? "✅" : res === "FAIL" ? "❌" : "⏭️ ";
  console.log(`  ${icon} [${id}] ${name}${res !== "PASS" && why ? ` — ${res === "SKIP" ? "SKIP: " : ""}${why}` : ""}`);
};
const st = async (id: string, name: string, fn: () => unknown | Promise<unknown>, sev: Sev = "CRITICAL") => {
  try { await fn(); record(id, name, "PASS", "", sev); } catch (e) { record(id, name, "FAIL", e instanceof AssertFail ? e.message : `throw: ${errMsg(e)}`, sev); }
};
const skip = (id: string, name: string, why: string, sev: Sev = "CRITICAL") => record(id, name, "SKIP", why, sev);
const read = (rel: string) => (existsSync(join(ROOT, rel)) ? readFileSync(join(ROOT, rel), "utf8") : "");
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
const THAI = /[฀-๿]/;
const LEGAL_BAD = /ล็อ[กค]ห้อง|ล็อ[กค]ประตู|ตัดน้ำ|ตัดไฟ|ระงับ(การ)?(จ่าย)?(น้ำ|ไฟ)|งด(จ่าย)?(น้ำ|ไฟ)|ยึดทรัพย์|ยึดของ|ขนของออก|เข้าห้องโดยไม่/;
const tryImport = async (spec: string): Promise<{ mod: Any; err: string }> => { try { return { mod: await import(spec), err: "" }; } catch (e) { return { mod: null, err: errMsg(e) }; } };
const loadIf = async (rel: string) => (existsSync(join(ROOT, rel)) ? tryImport(pathToFileURL(join(ROOT, rel)).href) : { mod: null, err: `ยังไม่มีไฟล์ «${rel}»` });
const fnOf = (load: { mod: Any; err: string }, name: string, rel: string): ((...a: Any[]) => Any) => {
  const f = load.mod?.[name];
  if (typeof f !== "function") throw new AssertFail(load.mod ? `«${rel}» ยังไม่มี export ${name}` : `โหลด «${rel}» ไม่ได้: ${load.err}`);
  return f;
};
const codeOf = (r: Any) => (r?.ok === true ? "ok" : r?.code ?? (r?.threw ? `threw:${r.threw}` : r?.childFail ? `child:${r.childFail}` : J(r)?.slice(0, 80)));
const failIs = (r: Any, code: string) => r?.ok === false && r?.code === code && typeof r?.reason === "string" && THAI.test(r.reason);
const sha = (u: Uint8Array) => createHash("sha256").update(Buffer.from(u)).digest("hex");

// ═══════════════ งวด (สัมพัทธ์กับเดือนนี้ไทย) ═══════════════
const DAY = 86_400_000;
const TODAY = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const PD = (n: number) => addDays(TODAY, n);
const dbDate = (ymd: string) => new Date(`${ymd}T00:00:00Z`);
const P = (k: number) => { const y = Number(TODAY.slice(0, 4)), m = Number(TODAY.slice(5, 7)) - 1 + k; const yy = y + Math.floor(m / 12), mm = ((m % 12) + 12) % 12; return `${yy}-${String(mm + 1).padStart(2, "0")}`; };
const P0 = P(0);

// ═══════════════ โหลดโมดูล (หลัง env) ═══════════════
const aiL = await loadIf(F.ai);
const dormL = await tryImport("@/lib/modules/dorm");
const dbL = await tryImport("@/lib/core/db");
const prisma: Any = dbL.mod?.prisma;
if (!prisma) { console.error(`🔴 ${LABEL}: โหลด prisma ไม่ได้ (${dbL.err})`); process.exit(4); }
const CR = (await tryImport("@/lib/ai/credit")).mod as Any;
const PRC = (await tryImport("@/lib/ai/pricing")).mod as Any;
const PV = (await tryImport("@/lib/ai/provider")).mod as Any;
const SET = (await tryImport("@/lib/core/settings")).mod as Any;
const QL = await loadIf(F.queue);
const React = (await import("react" as string)) as Any;
const RDS = (await import("react-dom/server" as string)) as Any;
const walkL = await loadIf(F.comp);
const WalkC: Any = walkL.mod ? (typeof walkL.mod.default === "function" ? walkL.mod.default : null) : null;
const FIDX = F.dormIndex;
const D = {
  propose: () => fnOf(dormL, "proposeMeterReading", FIDX),
  proposals: () => fnOf(dormL, "meterProposals", FIDX),
  status: () => fnOf(dormL, "meterAiStatus", FIDX),
  preview: () => fnOf(dormL, "previewReading", FIDX),
  reader: () => fnOf(dormL, "defaultMeterReader", FIDX),
  submit: () => fnOf(dormL, "submitReadings", FIDX),
  confirm: () => fnOf(dormL, "confirmReading", FIDX),
  held: () => fnOf(dormL, "heldRooms", FIDX),
  walk: () => fnOf(dormL, "meterWalk", FIDX),
  scope: () => fnOf(dormL, "dormBuildingScope", FIDX),
};
const COST = (tin = 1200, tout = 30, model = MODEL): number => Number(PRC?.costMicroUsd?.(model, tin, tout));

// ═══════════════ render (แบบ d.6) ═══════════════
const render = (props: Record<string, unknown>): string => String(RDS.renderToStaticMarkup(React.createElement(WalkC, props))).replace(/<!-- -->/g, "");
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

// ═══════════════ ฐานข้อมูล: ล้าง ═══════════════
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
  let pending = [...(await tablesWithTenant())];
  for (let pass = 0; pass < 14 && pending.length; pass++) {
    const next: string[] = [];
    for (const t of pending) { try { await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, tids); } catch { next.push(t); } }
    pending = next;
  }
  if (pending.length) console.log(`  ⚠️ cleanup: ลบไม่หมด ${pending.join(", ")}`);
  try { await prisma.tenant.deleteMany({ where: { id: { in: tids } } }); } catch (e) { console.log(`  ⚠️ cleanup tenant: ${errMsg(e)}`); }
}
async function leftovers(tids: string[]): Promise<{ table: string; n: number }[]> {
  const out: { table: string; n: number }[] = [];
  for (const t of await tablesWithTenant()) {
    try {
      const r: { n: number }[] = await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, tids);
      if ((r[0]?.n ?? 0) > 0) out.push({ table: t, n: r[0].n });
    } catch { /* ตารางพิเศษ */ }
  }
  const tn = await prisma.tenant.count({ where: { id: { in: tids } } });
  if (tn) out.push({ table: "Tenant", n: tn });
  return out;
}
const STAMP = `${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;
async function cleanupMisc() {
  try { await prisma.user.deleteMany({ where: { email: { startsWith: "svc-d14-" } } }); } catch (e) { console.log(`  ⚠️ ลบ user: ${errMsg(e)}`); }
}

// ═══════════════ ยิงพร้อมกันจากโพรเซสลูก ═══════════════
const SYNC_MS = 13_000;
async function fanout(groups: Any[][], stub: StubSpec, at: number): Promise<{ results: Any[]; calls: number }> {
  const outs = await Promise.all(groups.map((items) => new Promise<{ results: Any[]; calls: number }>((resolve) => {
    const job = { op: "propose", items, stub, at };
    const child = spawn(process.execPath, [...process.execArgv, SELF, "--child", Buffer.from(JSON.stringify(job)).toString("base64url")], { cwd: ROOT, env: process.env });
    let buf = "";
    child.stdout.on("data", (d) => { buf += String(d); });
    child.stderr.on("data", (d) => { buf += String(d); });
    child.on("close", (code) => {
      const m = /CHILD_RESULT (\{.*\})/.exec(buf);
      try { resolve(m ? (JSON.parse(m[1]) as { results: Any[]; calls: number }) : { results: items.map(() => ({ childFail: `exit=${code} ${buf.split("\n").slice(-3).join(" | ").slice(0, 200)}` })), calls: -1 }); }
      catch { resolve({ results: items.map(() => ({ childFail: "อ่านผลลูกไม่ได้" })), calls: -1 }); }
    });
  })));
  return { results: outs.flatMap((o) => o.results), calls: outs.reduce((s, o) => s + (o.calls < 0 ? 1000 : o.calls), 0) };
}
const badOf = (rs: Any[]) => rs.filter((r) => r?.threw || r?.childFail || /P2028|P2024|P2002|40P01|Unique constraint/i.test(J(r)));

// ═══════════════ รูปทดสอบ ═══════════════
const JPEG_HEAD = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01];
const jpeg = (seed: string) => ({ data: Uint8Array.from([...JPEG_HEAD, ...createHash("sha256").update(`qc-d14:${STAMP}:${seed}`).digest(), ...createHash("sha256").update(seed).digest(), 0xff, 0xd9]), contentType: "image/jpeg" });
const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const pngAsJpeg = () => ({ data: Uint8Array.from([...PNG_SIG, ...createHash("sha256").update("png-as-jpeg").digest()]), contentType: "image/jpeg" });
const svg = () => ({ data: Uint8Array.from(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>')), contentType: "image/svg+xml" });
const fakeJpeg = () => ({ data: Uint8Array.from(Buffer.from("not-a-jpeg-at-all-0123456789")), contentType: "image/jpeg" });
const heic = () => ({ data: Uint8Array.from([0, 0, 0, 0x18, ...Buffer.from("ftypheic"), 0, 0, 0, 0, ...Buffer.from("mif1heic")]), contentType: "image/heic" });
const huge = () => { const a = new Uint8Array(5 * 1024 * 1024 + 1); a.set(JPEG_HEAD, 0); a[a.length - 2] = 0xff; a[a.length - 1] = 0xd9; return { data: a, contentType: "image/jpeg" }; };
const PHOTOS: Uint8Array[] = [];
const ph = (seed: string) => { const p = jpeg(seed); PHOTOS.push(p.data); return p; };

// ═══════════════ สถานะร่วม ═══════════════
const tenantIds: string[] = [];
const ids: Record<string, string> = {};
const ME: Record<string, string> = {};   // มิเตอร์: "<ห้อง>E" / "<ห้อง>W" / MAIN1 MAIN2
const R: Record<string, string> = {};    // เลขห้อง → roomId (หน่วย DA)
const PR: Record<string, Any> = {};      // ผลข้อเสนอที่ข้อหลังใช้
const FILE: Record<string, string> = {}; // FileAsset id ที่เกิดจากข้อเสนอ
let ready = false;
const needReady = () => ok(ready, "ฉากข้อมูลทดสอบสร้างไม่สำเร็จ (ดู PC-1)");
let NF_REF: Any = null;
let puts = 0;
const PUT = async () => { puts++; };
let walk0: Any = null;
let blockedBase = 0;
const PII: string[] = [];

try {
  const stale = await prisma.tenant.findMany({ where: { slug: { startsWith: "qc-svc-d14-" } }, select: { id: true } });
  if (stale.length) { console.log(`(กวาด tenant ค้างจากรอบก่อน ${stale.length})`); await cleanup(stale.map((t: { id: string }) => t.id)); }
  await cleanupMisc();

  // ═══════════════ S (ไม่แตะฐาน) ═══════════════
  console.log("\n── S โครงสร้าง ──");
  await st("S-3", "มีไฟล์ใหม่ของใบ: meter-ai.ts + ฉาก svc-qc-meter-ai-scene.mts", () => { const miss = [F.ai, F.scene].filter((f) => !existsSync(join(ROOT, f))); ok(!miss.length, `ขาด ${miss.join(", ")}`); });
  await st("S-4", "facade @/lib/modules/dorm: proposeMeterReading · meterProposals · meterAiStatus · previewReading · defaultMeterReader (+ ของ D.6 ยังอยู่)", () => {
    const names = ["proposeMeterReading", "meterProposals", "meterAiStatus", "previewReading", "defaultMeterReader", "submitReadings", "confirmReading", "meterWalk"];
    const miss = names.filter((n) => typeof dormL.mod?.[n] !== "function");
    ok(!miss.length, `ขาด ${miss.join(", ")} (${dormL.err || aiL.err || "โหลดได้"})`);
  });
  await st("S-5", "ค่าตั้ง: rooms.meter.aiRead คงรูป (bool · ค่าเริ่ม true · UNIT · ป้ายไทย) + ใหม่ rooms.meter.aiMinConfidence (int · 50–99 · ค่าเริ่ม 80 · UNIT · กลุ่ม meter · ป้ายไทย · ปฏิเสธ 49/100/80.5)", () => {
    const bad: string[] = [];
    const a = SET?.getDef?.("rooms.meter.aiRead");
    if (!a || a.type !== "bool" || a.defaults?._fallback !== true || !(a.chain as string[]).includes("UNIT") || !THAI.test(a.labelTh ?? "")) bad.push(`aiRead ${J({ t: a?.type, d: a?.defaults, c: a?.chain })}`);
    const c = SET?.getDef?.("rooms.meter.aiMinConfidence");
    if (!c) bad.push("ไม่มี rooms.meter.aiMinConfidence");
    else {
      if (c.type !== "int" || c.defaults?._fallback !== 80 || !(c.chain as string[]).includes("UNIT") || !THAI.test(c.labelTh ?? "") || c.group !== "meter") bad.push(`aiMinConfidence ${J({ t: c.type, d: c.defaults, c: c.chain, g: c.group })}`);
      for (const v of [50, 80, 99]) if (!c.schema?.safeParse?.(v)?.success) bad.push(`ปฏิเสธ ${v}`);
      for (const v of [49, 100, 80.5, "80"]) if (c.schema?.safeParse?.(v)?.success) bad.push(`ยอม ${J(v)}`);
    }
    ok(!bad.length, bad.join(" · "));
  }, "MAJOR");
  await st("S-6", "meter-ai.ts: tenantDb (ไม่ import prisma ดิบ) · resolveProvider · canSpend + chargeUsage(… ref) · canSpendPeek · uploadFile private · อ่านค่าตั้ง 2 คีย์จากทะเบียน (ไม่ฝัง 80) · dormStaffGate + dormScopeFor · ไม่ fetch เอง · ไม่ any · ไม่ getDay · ไม่ log รูป", () => {
    const raw = read(F.ai), s = stripComments(raw);
    ok(s, `ยังไม่มี ${F.ai}`);
    const need: [string, RegExp][] = [["tenantDb", /tenantDb\s*\(/], ["resolveProvider", /resolveProvider\s*\(/], ["canSpend", /canSpend\s*\(/], ["canSpendPeek", /canSpendPeek\s*\(/],
      ["chargeUsage", /chargeUsage(Safe)?\s*\(/], ["ref:", /\bref\s*[:,]/], ["uploadFile", /uploadFile\s*\(/], ["private", /visibility:\s*["']private["']/],
      ["rooms.meter.aiRead", /["']rooms\.meter\.aiRead["']/], ["rooms.meter.aiMinConfidence", /["']rooms\.meter\.aiMinConfidence["']/], ["dormStaffGate", /dormStaffGate\s*\(/], ["dormScopeFor", /dormScopeFor\s*\(/]];
    const bad = need.filter(([, re]) => !re.test(s)).map(([n]) => `ไม่มี ${n}`);
    if (/import\s*\{[^}]*\bprisma\b[^}]*\}\s*from\s+["']@\/lib\/core\/db["']/.test(raw)) bad.push("import prisma ดิบ");
    if (/\bfetch\s*\(/.test(s)) bad.push("fetch เอง");
    if (/:\s*any\b|as\s+any\b|<any>/.test(s)) bad.push("any");
    if (/\.getDay\s*\(/.test(s)) bad.push("getDay");
    if (/(\?\?|\|\|)\s*80\b/.test(s)) bad.push("ฝังค่า 80");
    if (/console\.(log|info|warn|error)\s*\([^)]*(base64|dataUrl|photo|image)/i.test(s)) bad.push("log รูป");
    ok(!bad.length, bad.join(" · "));
  }, "MAJOR");
  await st("S-7", "actions.ts: 'use server' · export async function เท่านั้น · proposeMeterReadingAction (gate เดิม · ไม่ส่ง deps/reader/timeoutMs/now) · submit ส่งต่อ aiProposalId + ackLowConfidence", () => {
    const raw = read(F.actions), a = stripComments(raw);
    const bad: string[] = [];
    if (!/^\s*["']use server["']/.test(raw)) bad.push("ไม่มี use server");
    if (/export\s+(const|let|type|interface|default|class|function\s)/.test(a.replace(/export\s+async\s+function/g, ""))) bad.push("export อื่น");
    if (!/export\s+async\s+function\s+proposeMeterReadingAction\b/.test(a)) bad.push("ไม่มี proposeMeterReadingAction");
    const i = a.search(/function\s+proposeMeterReadingAction\b/);
    const blk = i >= 0 ? a.slice(i, i + 1500).split(/export\s+async\s+function/)[0] : "";
    if (blk && (!/gate\s*\(/.test(blk) || !/proposeMeterReading\s*\(/.test(blk))) bad.push("propose: ไม่ผ่าน gate/ไม่เรียก proposeMeterReading");
    if (/\breader\s*:|\btimeoutMs\s*:|\bnow\s*:|\bput\s*:/.test(blk)) bad.push("propose: ส่ง deps");
    if (!/aiProposalId/.test(a) || !/ackLowConfidence/.test(a)) bad.push("submit ไม่ส่งต่อ aiProposalId/ackLowConfidence");
    if (/get\(\s*["'](tenantId|unitId|actorUserId|userId)["']\s*\)|input\.(tenantId|actorUserId)/.test(a)) bad.push("อ่านร้าน/ผู้กระทำจาก input");
    ok(!bad.length, bad.join(" · "));
  }, "MAJOR");
  await st("S-8", "page.tsx: meterAiStatus + meterProposals ผ่าน facade · ส่ง ai/proposals/propose (bind unitSlug) · รองรับ ?roomNo= · ไม่แตะ prisma", () => {
    const s = stripComments(read(F.page));
    const bad: string[] = [];
    for (const [n, re] of [["meterAiStatus", /meterAiStatus\s*\(/], ["meterProposals", /meterProposals\s*\(/], ["propose=", /propose=\{/], ["proposeMeterReadingAction.bind", /proposeMeterReadingAction\.bind\(/], ["ai=", /\bai=\{/], ["proposals=", /proposals=\{/], ["roomNo", /roomNo/]] as const) if (!re.test(s)) bad.push(`ไม่มี ${n}`);
    if (/@\/lib\/core\/db|@prisma\//.test(s)) bad.push("แตะ prisma");
    ok(!bad.length, bad.join(" · "));
  }, "MAJOR");
  await st("S-9", "MeterWalk.tsx: 'use client' บรรทัดแรก · default export · มี prop propose/ai/proposals · import ได้แค่ react/import type/meter-queue (ไม่ import actions/โมดูล server/next)", () => {
    const c = read(F.comp);
    const bad: string[] = [];
    if (!/^\s*["']use client["']/.test(c) || !/export\s+default\b/.test(c)) bad.push("use client/default export");
    for (const n of ["propose", "proposals", "ai"]) if (!new RegExp(`\\b${n}\\??\\s*:`).test(c)) bad.push(`ไม่มี prop ${n}`);
    const imps = [...c.matchAll(/^\s*import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/gm)].filter((m) => !m[1]).map((m) => m[2]);
    const banned = imps.filter((x) => !(x === "react" || x === "@/lib/modules/dorm/meter-queue" || x === "./meter-queue"));
    if (banned.length) bad.push(`import ต้องห้าม ${banned.join(",")}`);
    ok(!bad.length, bad.join(" · "));
  }, "MAJOR");
  await st("S-10", "meter-queue.ts ยัง pure (ไม่มี import นอกจาก import type) · QueuedReading มี aiProposalId/ackLowConfidence", () => {
    const s = read(F.queue);
    const imps = [...s.matchAll(/^\s*import\s+(type\s+)?/gm)].filter((m) => !m[1]);
    ok(!imps.length, `มี import ${imps.length}`);
    ok(/aiProposalId\??\s*:/.test(s) && /ackLowConfidence\??\s*:/.test(s), "ยังไม่มีฟิลด์ใหม่ใน QueuedReading");
  }, "MAJOR");
  await st("S-11", "credit.ts (มติ R1): ChargeInput มี ref?: string · chargeUsage เขียน ref + รับมือ P2002 (กันหักซ้ำ)", () => {
    const s = stripComments(read(F.credit));
    const ci = /export\s+type\s+ChargeInput\s*=\s*\{([\s\S]*?)\n\};/.exec(s)?.[1] ?? "";
    const cu = s.slice(s.search(/export\s+async\s+function\s+chargeUsage\s*\(/), s.search(/export\s+async\s+function\s+chargeUsageSafe\s*\(/));
    ok(/\bref\?\s*:\s*string/.test(ci), "ChargeInput ไม่มี ref?: string");
    ok(/\bref\b/.test(cu) && /P2002/.test(cu), "chargeUsage ไม่เขียน ref / ไม่จับ P2002");
  }, "MINOR");

  // ═══════════════ ข้อมูลทดสอบ ═══════════════
  console.log("\n── สร้างข้อมูลทดสอบ ──");
  const mkTenant = async (tag: string) => { const t = await prisma.tenant.create({ data: { name: `QC D14 ${tag}`, slug: `qc-svc-d14-${tag}-${STAMP}` } }); tenantIds.push(t.id); return t.id as string; };
  const mkUnit = async (tenantId: string, tag: string, name: string, type = "DORM") => (await prisma.businessUnit.create({ data: { tenantId, type, name, slug: `d14${tag}-${STAMP}` } })).id as string;
  const mkUser = async (key: string, tenantId: string, role: string, unitAccess: string[], perms: string[] = []) => {
    const u = await prisma.user.create({ data: { email: `svc-d14-${STAMP}-${key}@shark.local`, name: `QC D14 ${key}` } });
    const m = await prisma.membership.create({ data: { userId: u.id, tenantId, role, unitAccess, permissions: Object.fromEntries(perms.map((p) => [p, true])), acceptedAt: new Date() } });
    ids[`mb_${key}`] = m.id;
    PII.push(u.email);
    return u.id as string;
  };
  const setVal = async (tenantId: string, key: string, scopeId: string, value: unknown) => {
    await prisma.settingValue.deleteMany({ where: { tenantId, key, scope: "UNIT", scopeId } });
    await prisma.settingValue.create({ data: { tenantId, key, scope: "UNIT", scopeId, value, setById: "qc-d14" } });
  };
  const mkType = async (tenantId: string, unitId: string) => (await prisma.hotelRoomType.create({ data: { tenantId, unitId, name: "มาตรฐาน", capacity: 2, baseRateSatang: 450000, depositSatang: 0, rentMode: "MONTHLY" } })).id as string;
  const mkBld = async (tenantId: string, unitId: string, name: string, sortOrder = 1) => (await prisma.roomBuilding.create({ data: { tenantId, unitId, name, floors: 3, sortOrder } })).id as string;
  const mkRoom = async (tenantId: string, unitId: string, typeId: string, bld: string | null, number: string, floorNo: number) =>
    (await prisma.hotelRoom.create({ data: { tenantId, unitId, roomTypeId: typeId, number, buildingId: bld, floorNo, floor: String(floorNo) } })).id as string;
  const lease = (tenantId: string, unitId: string, roomId: string, ref: string) =>
    prisma.roomOccupancy.create({ data: { tenantId, unitId, roomId, startDate: dbDate(PD(-400)), endDate: dbDate(PD(400)), kind: "LEASE", refType: "DormLease", refId: ref } });
  const mkMeter = async (tenantId: string, unitId: string, roomId: string | null, kind: string, extra: Record<string, unknown> = {}) =>
    (await prisma.dormMeter.create({ data: { tenantId, unitId, roomId, kind, role: roomId ? "ROOM" : "MAIN", startReading: 900, digits: 5, ...extra } })).id as string;
  /** ประวัติ 4 งวด (P-4..P-1) = 1000/1100/1200/1300 ⇒ เลขก่อน 1300 · เฉลี่ย 3 เดือน 100 */
  const history = async (tenantId: string, unitId: string, meterId: string) => {
    for (const [k, v] of [[-4, 1000], [-3, 1100], [-2, 1200], [-1, 1300]] as const)
      await prisma.dormMeterReading.create({ data: { tenantId, unitId, meterId, periodKey: P(k), kind: "PERIOD", value: v, source: "IMPORT", readAt: new Date(`${P(k)}-25T03:00:00Z`) } });
  };
  const wallet = (tenantId: string, balanceMicro: number) => prisma.aiCreditWallet.create({ data: { tenantId, balanceMicro, grantedAt: new Date() } });

  try {
    const A = await mkTenant("a"), B = await mkTenant("b"), Zt = await mkTenant("z"), W = await mkTenant("w"), RT = await mkTenant("r");
    Object.assign(ids, { A, B, Z: Zt, W, RT });
    const UNIT_NAME = "หอดีสิบสี่เอ";
    const DA = await mkUnit(A, "a", UNIT_NAME), DA2 = await mkUnit(A, "a2", "หอดีสิบสี่เอสอง"), DA3 = await mkUnit(A, "a3", "หอดีสิบสี่เอสาม"), DQ = await mkUnit(A, "q", "หอดีสิบสี่คิว");
    const HA = await mkUnit(A, "h", "โรงแรมดีสิบสี่", "HOTEL");
    const DB = await mkUnit(B, "b", "หอดีสิบสี่บี"), DZ = await mkUnit(Zt, "z", "หอดีสิบสี่แซด"), DW = await mkUnit(W, "w", "หอดีสิบสี่ดับเบิลยู");
    Object.assign(ids, { DA, DA2, DA3, DQ, HA, DB, DZ, DW });
    PII.push(UNIT_NAME, "อาคาร หนึ่งดีสิบสี่", "SER-D14-PII-7731", `QC D14 a`);
    const tyA = await mkType(A, DA);
    ids.B1 = await mkBld(A, DA, "อาคาร หนึ่งดีสิบสี่", 1); ids.B2 = await mkBld(A, DA, "อาคาร สองดีสิบสี่", 2);
    for (const n of ["101", "102", "103", "104", "105", "106", "107", "7731", "7732"]) R[n] = await mkRoom(A, DA, tyA, ids.B1, n, Number(n[0]));
    for (const n of ["201", "202"]) R[n] = await mkRoom(A, DA, tyA, ids.B2, n, 2);
    for (const n of Object.keys(R)) await lease(A, DA, R[n], `lease-${n}`);
    for (const n of ["101", "102", "103", "104", "105", "106", "107", "7732", "201"]) { ME[`${n}E`] = await mkMeter(A, DA, R[n], "ELEC"); await history(A, DA, ME[`${n}E`]); }
    for (const n of ["101", "105", "106", "107"]) { ME[`${n}W`] = await mkMeter(A, DA, R[n], "WATER"); await history(A, DA, ME[`${n}W`]); }
    ME["7731E"] = await mkMeter(A, DA, R["7731"], "ELEC", { serial: "SER-D14-PII-7731" }); await history(A, DA, ME["7731E"]);
    ME["7731W"] = await mkMeter(A, DA, R["7731"], "WATER"); await history(A, DA, ME["7731W"]);
    ME["202E"] = await mkMeter(A, DA, R["202"], "ELEC", { removedAt: new Date() }); await history(A, DA, ME["202E"]);
    ME["202W"] = await mkMeter(A, DA, R["202"], "WATER"); await history(A, DA, ME["202W"]);
    ME.MAIN1 = await mkMeter(A, DA, null, "ELEC", { buildingId: ids.B1 }); await history(A, DA, ME.MAIN1);
    ME.MAIN2 = await mkMeter(A, DA, null, "ELEC", { buildingId: ids.B2 }); await history(A, DA, ME.MAIN2);
    // DA2 (ค่าตั้งความมั่นใจ 50) · DA3 (ปิด AI) · DQ (ผู้ใช้ไม่มีสิทธิ์) · ร้าน B · Z (เครดิต 0) · W (ไม่มีกระเป๋า)
    const unitRooms = async (tenantId: string, unitId: string, nos: string[]) => {
      const ty = await mkType(tenantId, unitId), b = await mkBld(tenantId, unitId, "อาคาร");
      for (const n of nos) { const rid = await mkRoom(tenantId, unitId, ty, b, n, 1); await lease(tenantId, unitId, rid, `lease-${unitId}-${n}`); ME[`${n}E`] = await mkMeter(tenantId, unitId, rid, "ELEC"); await history(tenantId, unitId, ME[`${n}E`]); }
    };
    await unitRooms(A, DA2, ["301", "302"]);
    await unitRooms(A, DA3, ["401"]);
    await unitRooms(A, DQ, ["q1"]);
    await unitRooms(B, DB, ["b1"]);
    await unitRooms(Zt, DZ, ["z1"]);
    await unitRooms(W, DW, ["w1"]);
    // แถวยืนยันแล้ว (202 น้ำ) ⇒ LOCKED
    await prisma.dormMeterReading.create({ data: { tenantId: A, unitId: DA, meterId: ME["202W"], periodKey: P0, kind: "PERIOD", value: 1350, source: "MANUAL", readAt: new Date(), confirmedAt: new Date(), confirmedById: "qc-d14" } });
    // ผู้ใช้
    ids.OWN = await mkUser("owner", A, "OWNER", ["*"]);
    ids.M1 = await mkUser("m1", A, "STAFF", [DA, DA2, DA3, HA], ["dorm.meter.read"]);
    ids.MS = await mkUser("ms", A, "STAFF", [DA], ["dorm.meter.read"]);
    ids.VW = await mkUser("vw", A, "STAFF", [DA], ["dorm.view"]);
    ids.OWNB = await mkUser("owner-b", B, "OWNER", ["*"]);
    ids.OWNZ = await mkUser("owner-z", Zt, "OWNER", ["*"]);
    ids.OWNW = await mkUser("owner-w", W, "OWNER", ["*"]);
    // ค่าตั้ง (หน่วย)
    await setVal(A, "rooms.access.managerScope", DA, "BUILDING");
    await setVal(A, "rooms.access.buildingAssignments", DA, { [ids.mb_m1]: [ids.B1, ids.B2], [ids.mb_ms]: [ids.B1] });
    await setVal(A, "rooms.meter.aiMinConfidence", DA2, 50);
    await setVal(A, "rooms.meter.aiRead", DA3, false);
    // กระเป๋าเครดิต
    await wallet(A, 5_000_000); await wallet(B, 5_000_000); await wallet(Zt, 0); await wallet(RT, 5_000_000);
    ready = true;
    console.log(`(ร้าน A/B/Z/W/R · หน่วย DA มิเตอร์ ${Object.keys(ME).length} ตัว · งวด ${P0})`);
  } catch (e) { console.log(`  ⚠️ สร้างข้อมูลไม่ครบ: ${errMsg(e)}`); }

  const A = ids.A, B = ids.B, DA = ids.DA;
  const cM1 = { tenantId: A, actorUserId: ids.M1 }, cMS = { tenantId: A, actorUserId: ids.MS }, cVW = { tenantId: A, actorUserId: ids.VW }, cOWN = { tenantId: A, actorUserId: ids.OWN };
  const cB = { tenantId: B, actorUserId: ids.OWNB }, cZ = { tenantId: ids.Z, actorUserId: ids.OWNZ }, cW = { tenantId: ids.W, actorUserId: ids.OWNW };
  const propose = (ctx: Any, unitId: string, meterId: string, photo: Any, deps: Any = {}, periodKey = P0) => D.propose()(ctx, { unitId, meterId, periodKey, photo }, { put: PUT, ...deps });
  const submit1 = async (ctx: Any, unitId: string, item: Any) => { const r = await D.submit()(ctx, { unitId, periodKey: P0, items: [item] }, { put: PUT }); return { r, x: r?.ok ? r.results?.[0] : null } as { r: Any; x: Any }; };
  const faCount = (t = A) => prisma.fileAsset.count({ where: { tenantId: t } });
  const faIds = async (t = A) => new Set<string>((await prisma.fileAsset.findMany({ where: { tenantId: t }, select: { id: true } })).map((f: Any) => f.id));
  const usage = (t: string) => prisma.aiCreditTxn.findMany({ where: { tenantId: t, kind: "USAGE" }, orderBy: { createdAt: "asc" } });
  const bal = async (t: string) => (await prisma.aiCreditWallet.findUnique({ where: { tenantId: t } }))?.balanceMicro ?? null;
  const rowsOf = (meterId: string, periodKey = P0) => prisma.dormMeterReading.findMany({ where: { meterId, periodKey, kind: "PERIOD" } });
  const refOf = (meterId: string, photo: Any, periodKey = P0) => `dorm.meter.ai:${meterId}:${periodKey}:${sha(photo.data)}`;
  const isProposal = (r: Any) => r?.ok === true && typeof r.proposalId === "string" && r.proposalId.length > 0;

  // ═══════════════ PC ตัวควบคุม ═══════════════
  console.log("\n── PC ตัวควบคุม (ต้องเขียวตั้งแต่ก่อนมีงาน) ──");
  await st("PC-1", "สร้างข้อมูลทดสอบครบ (5 ร้าน · 8 หน่วย · มิเตอร์+ประวัติ · ผู้ใช้ 7 · ค่าตั้งหน่วย · กระเป๋าเครดิต)", () => needReady());
  await st("PC-2", "submitReadings ของ D.6 ทำงานบนฉากนี้ (107 น้ำ 1395 ⇒ CREATED · source MANUAL · ไม่มีป้าย) — ฐานของข้อ K", async () => {
    needReady();
    const { x } = await submit1(cM1, DA, { meterId: ME["107W"], value: 1395 });
    const rows = await rowsOf(ME["107W"]);
    ok(x?.status === "CREATED" && x.flag === null && rows.length === 1 && rows[0].source === "MANUAL", `${J(x)} rows=${rows.length}`);
  });
  await st("PC-3", "ตัวจำลอง OpenRouter + บล็อกเน็ต: OpenRouterProvider ของระบบได้คำตอบจำลอง (เห็น Authorization คีย์ปลอม + image_url) · fetch ไป example.com ⇒ 503 ถูกบล็อก", async () => {
    const n0 = OR_REQS.length;
    const r = await new PV.OpenRouterProvider(FAKE_KEY, MODEL).chat([{ role: "user", content: "x", imageUrls: ["data:image/jpeg;base64,AAAA"] }], { maxTokens: 10 });
    ok(OR_REQS.length === n0 + 1 && /"value":1395/.test(r.text) && r.tokensIn === OR_USAGE.prompt_tokens && OR_REQS[n0].auth === `Bearer ${FAKE_KEY}`, `${J(r)} req=${OR_REQS.length - n0} auth=${OR_REQS[n0]?.auth?.slice(0, 20)}`);
    ok(J(OR_REQS[n0].body?.messages).includes("data:image/jpeg;base64,AAAA"), "ไม่เห็นรูปใน body");
    const b = await fetch("https://example.com/qc-d14");
    ok(b.status === 503 && BLOCKED.includes("example.com"), `status=${b.status}`);
    ok(PV.resolveProvider("smart") instanceof PV.OpenRouterProvider, "resolveProvider ไม่ใช่ OpenRouterProvider (คีย์ปลอมไม่มีผล?)");
    blockedBase = BLOCKED.length;
  });
  await st("PC-4", "เครดิตเดิม: canSpend(A) true · canSpend(Z เครดิต 0) false · costMicroUsd(sonnet,1200,30) = 4050 · canSpendPeek(W ไม่มีกระเป๋า) true โดยไม่เปิดกระเป๋า", async () => {
    needReady();
    ok((await CR.canSpend(A)) === true && (await CR.canSpend(ids.Z)) === false, "canSpend");
    eq(COST(), 4050, "costMicroUsd");
    ok((await CR.canSpendPeek(ids.W)) === true && (await prisma.aiCreditWallet.count({ where: { tenantId: ids.W } })) === 0, "canSpendPeek W");
  });
  await st("PC-5", "ขอบเขตอาคาร D.13 มีผลบนฉาก: dormBuildingScope MS = [อาคาร 1] · M1 = [อาคาร 1, 2]", async () => {
    needReady();
    const s1 = await D.scope()({ tenantId: A }, { unitId: DA, userId: ids.MS });
    const s2 = await D.scope()({ tenantId: A }, { unitId: DA, userId: ids.M1 });
    ok(s1?.all === false && J(s1.buildingIds) === J([ids.B1]) && s2?.all === false && J([...s2.buildingIds].sort()) === J([ids.B1, ids.B2].sort()), `${J(s1)} ${J(s2)}`);
  });
  try { walk0 = ready ? await D.walk()({ tenantId: A }, { unitId: DA, periodKey: P0 }) : null; } catch { walk0 = null; }

  // ═══════════════ P เสนอ ═══════════════
  console.log("\n── P เสนอ (ถ่ายรูป ⇒ ข้อเสนอ · ยังไม่บันทึก) ──");
  const p101a = ph("101a"), p101b = ph("101b");
  const s101a = mkReader({ value: 1412, confidence: 0.94 });
  let snap: Any = null;
  await st("P-1", "101 ไฟ ตัวอ่านจำลอง 1412 (0.94) ⇒ ok · source AI · value 1412 · prev 1300 · units 112 · ไม่มีป้าย · ไม่ต่ำ · ไม่ต้องยืนยัน · cached false · charged true · ตัวอ่านถูกเรียก 1 ครั้งด้วย {image, kind, digits} เท่านั้น", async () => {
    needReady();
    snap = { fa: await faIds(), puts, ob: await prisma.outboxEvent.count({ where: { tenantId: A } }), rd: await prisma.dormMeterReading.count({ where: { tenantId: A, periodKey: P0 } }),
      upd: (await prisma.dormMeterReading.aggregate({ where: { tenantId: A }, _max: { updatedAt: true } }))._max.updatedAt?.toISOString() ?? null };
    const r = await propose(cM1, DA, ME["101E"], p101a, { reader: s101a.reader });
    PR.p101a = r;
    const want = { ok: true, meterId: ME["101E"], periodKey: P0, source: "AI", manualReason: null, value: 1412, confidence: 0.94, prevValue: 1300, units: 112, flag: null, lowConfidence: false, needsConfirm: false, cached: false, charged: true };
    eq(Object.fromEntries(Object.keys(want).map((k) => [k, r?.[k]])), want, "ผล");
    ok(isProposal(r) && !Number.isNaN(Date.parse(r.createdAt)), `proposalId/createdAt ${J(r).slice(0, 120)}`);
    eq(s101a.calls.length, 1, "ครั้งที่เรียกตัวอ่าน");
    const inp = s101a.calls[0];
    eq(Object.keys(inp ?? {}).sort(), ["digits", "image", "kind"], "คีย์ input ของตัวอ่าน");
    ok(inp.kind === "ELEC" && inp.digits === 5 && inp.image?.contentType === "image/jpeg" && Buffer.compare(Buffer.from(inp.image.data), Buffer.from(p101a.data)) === 0, `input ${J({ kind: inp.kind, digits: inp.digits, ct: inp.image?.contentType })}`);
  });
  await st("P-2", "เสนอ ≠ บันทึก: ไม่มีแถว DormMeterReading งวดนี้เพิ่ม · ไม่มี OutboxEvent · แถวเดิมไม่ถูกแตะ (updatedAt สูงสุดเท่าเดิม)", async () => {
    ok(snap && isProposal(PR.p101a), "P-1 ไม่ผ่าน");
    eq(await prisma.dormMeterReading.count({ where: { tenantId: A, periodKey: P0 } }), snap.rd, "แถวงวดนี้");
    eq(await prisma.outboxEvent.count({ where: { tenantId: A } }), snap.ob, "outbox");
    eq((await prisma.dormMeterReading.aggregate({ where: { tenantId: A }, _max: { updatedAt: true } }))._max.updatedAt?.toISOString() ?? null, snap.upd, "updatedAt");
    eq((await rowsOf(ME["101E"])).length, 0, "แถว 101 ไฟ");
  });
  await st("P-3", "X10: รูปเป็น FileAsset ใหม่ 1 ไฟล์ · ATTACHMENT · ส่วนตัว (/private/ · cdnUrl ไม่ใช่ http) · put 1 ครั้ง", async () => {
    ok(snap && isProposal(PR.p101a), "P-1 ไม่ผ่าน");
    const now = await prisma.fileAsset.findMany({ where: { tenantId: A } });
    const fresh = now.filter((f: Any) => !snap.fa.has(f.id));
    ok(fresh.length === 1 && fresh[0].kind === "ATTACHMENT" && String(fresh[0].path).includes("/private/") && !/^https?:/.test(fresh[0].cdnUrl) && puts - snap.puts === 1, `ไฟล์ใหม่=${fresh.length} ${J(fresh.map((f: Any) => ({ k: f.kind, p: String(f.path).replace(/[^/]+$/, "…"), c: String(f.cdnUrl).slice(0, 12) })))} put=${puts - snap.puts}`);
    FILE.p101a = fresh[0].id;
  });
  await st("P-4", "X4 รูปเดิมซ้ำ 2 รอบ (ตัวอ่านใหม่) ⇒ proposalId เดิม · cached true · charged false · ตัวอ่านไม่ถูกเรียก · ไฟล์ไม่เพิ่ม · แถว USAGE ของ ref นี้ 1", async () => {
    ok(isProposal(PR.p101a), "P-1 ไม่ผ่าน");
    const s2 = mkReader({ value: 9999, confidence: 0.99 });
    const fa0 = await faCount();
    const a = await propose(cM1, DA, ME["101E"], p101a, { reader: s2.reader });
    const b = await propose(cM1, DA, ME["101E"], { data: Uint8Array.from(p101a.data), contentType: "image/jpeg" }, { reader: s2.reader });
    for (const r of [a, b]) ok(r?.ok === true && r.proposalId === PR.p101a.proposalId && r.cached === true && r.charged === false && r.value === 1412, J(r).slice(0, 200));
    eq(s2.calls.length, 0, "ตัวอ่านรอบซ้ำ");
    eq(await faCount(), fa0, "FileAsset");
    eq((await usage(A)).filter((t: Any) => t.ref === refOf(ME["101E"], p101a)).length, 1, "แถว USAGE ref นี้");
  });
  await st("P-5", "รูปใหม่ของมิเตอร์เดิม = ครั้งใหม่: proposalId ใหม่ · value 1415 · charged true · FileAsset +1 · USAGE ของ 101 ไฟ = 2 แถว (ref ต่างกัน)", async () => {
    ok(isProposal(PR.p101a), "P-1 ไม่ผ่าน");
    const fa0 = await faIds();
    const s = mkReader({ value: 1415, confidence: 0.9 });
    const r = await propose(cM1, DA, ME["101E"], p101b, { reader: s.reader });
    PR.p101b = r;
    ok(isProposal(r) && r.proposalId !== PR.p101a.proposalId && r.value === 1415 && r.charged === true && r.cached === false && s.calls.length === 1, J(r).slice(0, 200));
    const fresh = (await prisma.fileAsset.findMany({ where: { tenantId: A }, select: { id: true } })).filter((f: Any) => !fa0.has(f.id));
    eq(fresh.length, 1, "FileAsset ใหม่");
    FILE.p101b = fresh[0].id;
    const mine = (await usage(A)).filter((t: Any) => String(t.ref ?? "").startsWith(`dorm.meter.ai:${ME["101E"]}:`));
    ok(mine.length === 2 && new Set(mine.map((t: Any) => t.ref)).size === 2, `แถว ${mine.length} ${J(mine.map((t: Any) => t.ref))}`);
  });
  await st("P-6", "ความมั่นใจต่ำ (ค่าตั้งหน่วย): DA 102 0.60 ⇒ low+needsConfirm · DA 107 0.80 = เกณฑ์ 80 ⇒ ไม่ต่ำ · DA2 (เกณฑ์ 50) 301 0.60 ⇒ ไม่ต่ำ · 302 0.49 ⇒ ต่ำ", async () => {
    needReady();
    const r102 = await propose(cM1, DA, ME["102E"], ph("102"), { reader: mkReader({ value: 1410, confidence: 0.6 }).reader });
    const r107 = await propose(cM1, DA, ME["107E"], ph("107"), { reader: mkReader({ value: 1390, confidence: 0.8 }).reader });
    const r301 = await propose(cM1, ids.DA2, ME["301E"], ph("301"), { reader: mkReader({ value: 1390, confidence: 0.6 }).reader });
    const r302 = await propose(cM1, ids.DA2, ME["302E"], ph("302"), { reader: mkReader({ value: 1390, confidence: 0.49 }).reader });
    PR.p102 = r102;
    const got = [r102, r107, r301, r302].map((r) => `${r?.source}:${r?.lowConfidence}:${r?.needsConfirm}:${r?.flag}`);
    eq(got, ["AI:true:true:null", "AI:false:false:null", "AI:false:false:null", "AI:true:true:null"], "source:low:needsConfirm:flag");
  });
  await st("P-7", "ค่าไม่สมเหตุผล = ตัวตรวจ D.6 ล่วงหน้า: 103 อ่าน 1200 (< 1300) ⇒ flag BACKWARDS · needsConfirm · 104 อ่าน 1500 (200 หน่วย > เฉลี่ย 100 +50%) ⇒ HIGH units 200 · previewReading 104/1500 ให้ผลเดียวกัน", async () => {
    needReady();
    const r103 = await propose(cM1, DA, ME["103E"], ph("103"), { reader: mkReader({ value: 1200, confidence: 0.95 }).reader });
    const r104 = await propose(cM1, DA, ME["104E"], ph("104"), { reader: mkReader({ value: 1500, confidence: 0.95 }).reader });
    PR.p103 = r103; PR.p104 = r104;
    ok(r103?.ok && r103.flag === "BACKWARDS" && r103.needsConfirm === true && r103.lowConfidence === false && r103.units === null && r103.value === 1200, `103 ${J(r103).slice(0, 200)}`);
    ok(r104?.ok && r104.flag === "HIGH" && r104.units === 200 && r104.needsConfirm === true, `104 ${J(r104).slice(0, 200)}`);
    const pv = await D.preview()(cM1, { unitId: DA, meterId: ME["104E"], periodKey: P0, value: 1500 });
    eq({ ok: pv?.ok, prevValue: pv?.prevValue, units: pv?.units, flag: pv?.flag }, { ok: true, prevValue: 1300, units: 200, flag: "HIGH" }, "previewReading");
  });
  await st("P-8", "อ่านไม่ออก (มติ R3): ค่า null · 1.5 · −3 · 100000 (เกิน 5 หลัก) ⇒ source MANUAL · UNREADABLE · value/confidence null · charged true (เรียกสำเร็จ = จ่าย) · รูปเดิมซ้ำ ⇒ cached ไม่เรียก/ไม่หักซ้ำ", async () => {
    needReady();
    const bad: string[] = [];
    let firstPhoto: Any = null;
    for (const [i, v] of ([null, 1.5, -3, 100000] as const).entries()) {
      const p = ph(`105-unreadable-${i}`);
      if (!firstPhoto) firstPhoto = p;
      const r = await propose(cM1, DA, ME["105E"], p, { reader: mkReader({ value: v, confidence: 0.9 }).reader });
      if (!(isProposal(r) && r.source === "MANUAL" && r.manualReason === "UNREADABLE" && r.value === null && r.confidence === null && r.charged === true)) bad.push(`${J(v)} ⇒ ${J(r).slice(0, 160)}`);
    }
    const s = mkReader({ value: 1400, confidence: 0.9 });
    const again = await propose(cM1, DA, ME["105E"], firstPhoto, { reader: s.reader });
    if (!(again?.ok && again.cached === true && again.charged === false && again.manualReason === "UNREADABLE" && s.calls.length === 0)) bad.push(`ซ้ำ ⇒ ${J(again).slice(0, 160)} calls=${s.calls.length}`);
    eq((await usage(A)).filter((t: Any) => String(t.ref ?? "").startsWith(`dorm.meter.ai:${ME["105E"]}:`)).length, 4, "แถว USAGE 105 ไฟ");
    ok(!bad.length, bad.join(" · "));
  });
  await st("P-9", "ตัวอ่าน throw ⇒ MANUAL AI_FAILED · charged false · ไม่มีแถว USAGE · มี proposalId (รูปเก็บไว้) · ส่งรูปเดิมใหม่ (ตัวอ่านดี) ⇒ proposalId เดิม · AI 1395 · charged true · ไฟล์ของรูปนี้ 1", async () => {
    needReady();
    const p = ph("105w");
    const fa0 = await faCount();
    const r1 = await propose(cM1, DA, ME["105W"], p, { reader: mkReader({ throws: true }).reader });
    ok(isProposal(r1) && r1.source === "MANUAL" && r1.manualReason === "AI_FAILED" && r1.charged === false && r1.value === null, `ล้ม ${J(r1).slice(0, 200)}`);
    eq((await usage(A)).filter((t: Any) => t.ref === refOf(ME["105W"], p)).length, 0, "USAGE หลังล้ม");
    const r2 = await propose(cM1, DA, ME["105W"], p, { reader: mkReader({ value: 1395, confidence: 0.9 }).reader });
    PR.p105w = r2;
    ok(r2?.ok && r2.proposalId === r1.proposalId && r2.source === "AI" && r2.value === 1395 && r2.charged === true && r2.cached === false, `ลองใหม่ ${J(r2).slice(0, 200)}`);
    eq(await faCount() - fa0, 1, "FileAsset ของรูปนี้");
    eq((await usage(A)).filter((t: Any) => t.ref === refOf(ME["105W"], p)).length, 1, "USAGE หลังลองใหม่");
  });
  await st("P-10", "หมดเวลา (timeoutMs 300 · ตัวอ่านช้า 2 วิ) ⇒ AI_FAILED ภายใน 1.5 วิ · ผลที่มาช้าไม่ถูกใช้ ไม่หัก (รอ 2.3 วิแล้วยังไม่มีแถว USAGE)", async () => {
    needReady();
    const p = ph("105-timeout");
    const t0 = Date.now();
    const r = await propose(cM1, DA, ME["105E"], p, { reader: mkReader({ value: 1400, confidence: 0.9, delayMs: 2000 }).reader, timeoutMs: 300 });
    const ms = Date.now() - t0;
    ok(r?.ok === true && r.manualReason === "AI_FAILED" && r.charged === false && ms < 1500, `${ms} ms ${J(r).slice(0, 160)}`);
    await sleep(2300);
    eq((await usage(A)).filter((t: Any) => t.ref === refOf(ME["105E"], p)).length, 0, "USAGE หลังผลมาช้า");
  });
  await st("P-11", "ปิด AI ระดับหน่วย (DA3 rooms.meter.aiRead=false) ⇒ MANUAL AI_OFF · ไม่เรียกตัวอ่าน · ไม่หัก · มี proposalId", async () => {
    needReady();
    const s = mkReader({ value: 1390, confidence: 0.9 });
    const u0 = (await usage(A)).length;
    const r = await propose(cM1, ids.DA3, ME["401E"], ph("401"), { reader: s.reader });
    PR.p401 = r;
    ok(isProposal(r) && r.source === "MANUAL" && r.manualReason === "AI_OFF" && r.charged === false && s.calls.length === 0, J(r).slice(0, 200));
    eq((await usage(A)).length, u0, "USAGE");
  });
  await st("P-12", "ไม่มีตัวอ่าน (deps.reader = null) ⇒ MANUAL NO_PROVIDER · ไม่หัก", async () => {
    needReady();
    const u0 = (await usage(A)).length;
    const r = await propose(cM1, DA, ME["101W"], ph("101w-noprov"), { reader: null });
    ok(isProposal(r) && r.source === "MANUAL" && r.manualReason === "NO_PROVIDER" && r.charged === false, J(r).slice(0, 200));
    eq((await usage(A)).length, u0, "USAGE");
  });
  await st("P-13", "เครดิตหมด (ร้าน Z ยอด 0) ⇒ MANUAL NO_CREDIT · ไม่เรียกตัวอ่าน · ยอด/แถวของ Z ไม่เปลี่ยน", async () => {
    needReady();
    const s = mkReader({ value: 1390, confidence: 0.9 });
    const r = await propose(cZ, ids.DZ, ME["z1E"], ph("z1"), { reader: s.reader });
    ok(isProposal(r) && r.source === "MANUAL" && r.manualReason === "NO_CREDIT" && s.calls.length === 0, J(r).slice(0, 200));
    ok((await bal(ids.Z)) === 0 && (await usage(ids.Z)).length === 0, "ยอด Z");
  });
  await st("P-14", "X6 ไฟล์: SVG · JPEG ปลอม · PNG แต่บอกว่า JPEG · ว่าง · HEIC · > 5 MB ⇒ INVALID_FILE (ไทย) · ไม่มีไฟล์/ไม่เรียกตัวอ่าน/ไม่หัก", async () => {
    needReady();
    const s = mkReader({ value: 1390, confidence: 0.9 });
    const fa0 = await faCount(), u0 = (await usage(A)).length, p0 = puts;
    const out: string[] = [];
    for (const f of [svg(), fakeJpeg(), pngAsJpeg(), { data: new Uint8Array(0), contentType: "image/jpeg" }, heic(), huge()]) {
      const r = await propose(cM1, DA, ME["101W"], f, { reader: s.reader });
      if (!failIs(r, "INVALID_FILE")) out.push(`${f.contentType}/${f.data.length} ⇒ ${codeOf(r)}`);
    }
    ok(!out.length, out.join(" · "));
    ok((await faCount()) === fa0 && (await usage(A)).length === u0 && s.calls.length === 0 && puts === p0, `fa=${(await faCount()) - fa0} calls=${s.calls.length} put=${puts - p0}`);
  });
  await st("P-15", "ลำดับปฏิเสธ: งวด 2026-13 ⇒ INVALID_INPUT · มิเตอร์ถูกถอด (202 ไฟ) ⇒ METER_REMOVED · แถวงวดนี้ยืนยันแล้ว (202 น้ำ) ⇒ LOCKED — ไม่เรียกตัวอ่าน/ไม่หัก/ไม่มีไฟล์", async () => {
    needReady();
    const s = mkReader({ value: 1390, confidence: 0.9 });
    const fa0 = await faCount(), u0 = (await usage(A)).length;
    const a = await propose(cM1, DA, ME["101W"], ph("bad-period"), { reader: s.reader }, "2026-13");
    const b = await propose(cM1, DA, ME["202E"], ph("removed"), { reader: s.reader });
    const c = await propose(cM1, DA, ME["202W"], ph("locked"), { reader: s.reader });
    eq([codeOf(a), codeOf(b), codeOf(c)], ["INVALID_INPUT", "METER_REMOVED", "LOCKED"], "โค้ด");
    ok([a, b, c].every((r) => THAI.test(r?.reason ?? "")), "reason ไทย");
    ok((await faCount()) === fa0 && (await usage(A)).length === u0 && s.calls.length === 0, "มีผลข้างเคียง");
  });

  // ═══════════════ C คิดเงิน ═══════════════
  console.log("\n── C คิดเงิน (เครดิต AI เดิม · ไม่หักซ้ำ · ไม่หักร้านอื่น) ──");
  await st("C-1", "แถว USAGE ของ 101 ไฟ (รูป a) ตรงทุกช่อง: ร้าน A · source CHAT (R2) · model/token ของตัวอ่าน · amountMicro = −costMicroUsd · userId = ผู้ถ่าย · note dorm.meter.readPhoto · ref = dorm.meter.ai:<มิเตอร์>:<งวด>:<sha256> · ยอด A = เริ่ม − ผลรวม USAGE · B ไม่ถูกแตะ", async () => {
    ok(isProposal(PR.p101a), "P-1 ไม่ผ่าน");
    const rows = (await usage(A)).filter((t: Any) => t.ref === refOf(ME["101E"], p101a));
    eq(rows.length, 1, "แถว");
    const t = rows[0];
    eq({ tenantId: t.tenantId, source: t.source, model: t.model, tokensIn: t.tokensIn, tokensOut: t.tokensOut, amountMicro: t.amountMicro, userId: t.userId, note: t.note },
      { tenantId: A, source: "CHAT", model: MODEL, tokensIn: 1200, tokensOut: 30, amountMicro: -COST(), userId: ids.M1, note: "dorm.meter.readPhoto" }, "แถว");
    const all = await usage(A);
    const spent = all.reduce((s: number, x: Any) => s - x.amountMicro, 0);
    eq(await bal(A), 5_000_000 - spent, "ยอด A");
    ok(all.every((x: Any) => x.amountMicro === -COST() || x.amountMicro === -COST(OR_USAGE.prompt_tokens, OR_USAGE.completion_tokens)), `ยอดต่อแถว ${J(all.map((x: Any) => x.amountMicro))}`);
    ok((await bal(B)) === 5_000_000 && (await usage(B)).length === 0, "B ถูกแตะ");
  });
  await st("C-2", "ไม่มี PII ในแถวเครดิต: ref ทุกแถวของ A ตรงรูป dorm.meter.ai:<id>:<YYYY-MM>:<hex64> และ id เป็นมิเตอร์ของ A · note ไม่มีเลขห้อง/ชื่อหอ/ชื่อ/อีเมล", async () => {
    needReady();
    const all = await usage(A);
    ok(all.length > 0, "ไม่มีแถว");
    const mine = new Set((await prisma.dormMeter.findMany({ where: { tenantId: A }, select: { id: true } })).map((m: Any) => m.id));
    const bad = all.filter((x: Any) => { const m = /^dorm\.meter\.ai:([^:]+):(\d{4}-\d{2}):([0-9a-f]{64})$/.exec(String(x.ref ?? "")); return !m || !mine.has(m[1]) || x.note !== "dorm.meter.readPhoto"; });
    ok(!bad.length, J(bad.map((x: Any) => ({ ref: x.ref, note: x.note }))).slice(0, 200));
    const blob = J(all);
    const leak = PII.filter((p) => blob.includes(p));
    ok(!leak.length, `พบ ${leak.join(",")}`);
  });
  await st("C-3", "X4 credit.ts ref (R1): chargeUsage ref เดิม 2 รอบ ⇒ 1 แถว · รอบสองคืน 0 · หักครั้งเดียว · พร้อมกัน 5 ทาง ref เดียว ⇒ 1 แถว · ตัวควบคุม: ไม่ส่ง ref 2 ครั้ง ⇒ 2 แถว หัก 2 เท่า", async () => {
    needReady();
    const RT = ids.RT;
    const inp = (ref: string) => ({ source: "CHAT", model: MODEL, tokensIn: 1200, tokensOut: 30, note: "qc-d14", ref });
    const b0 = await bal(RT);
    const a1 = await CR.chargeUsage({ tenantId: RT }, inp("qc-d14-ref-1"));
    let a2: Any;
    try { a2 = await CR.chargeUsage({ tenantId: RT }, inp("qc-d14-ref-1")); } catch (e) { a2 = `throw ${errMsg(e)}`; }
    const n1 = await prisma.aiCreditTxn.count({ where: { tenantId: RT, ref: "qc-d14-ref-1" } });
    const b1 = await bal(RT);
    const par = await Promise.all(Array.from({ length: 5 }, async () => { try { return await CR.chargeUsage({ tenantId: RT }, inp("qc-d14-ref-2")); } catch (e) { return `throw ${errMsg(e)}`; } }));
    const n2 = await prisma.aiCreditTxn.count({ where: { tenantId: RT, ref: "qc-d14-ref-2" } });
    const b2 = await bal(RT);
    // ตัวควบคุม (เขียวแม้ยังไม่มี ref): ไม่ส่ง ref 2 ครั้ง ⇒ 2 แถว · หัก 2 เท่า — ยืนยันว่าตัวนับแถว/ยอดของข้อนี้ทำงานจริง
    const bc0 = await bal(RT);
    const ctl = { source: "CHAT", model: MODEL, tokensIn: 1200, tokensOut: 30, note: "qc-d14-ctl" };
    await CR.chargeUsage({ tenantId: RT }, ctl); await CR.chargeUsage({ tenantId: RT }, ctl);
    const n3 = await prisma.aiCreditTxn.count({ where: { tenantId: RT, note: "qc-d14-ctl" } });
    ok(n3 === 2 && bc0! - (await bal(RT))! === 2 * COST(), `ตัวควบคุม (ไม่มี ref) แถว=${n3}`);
    ok(a1 === COST() && a2 === 0 && n1 === 1 && b0! - b1! === COST(), `ซ้ำ: a1=${a1} a2=${J(a2)} แถว=${n1} หัก=${b0! - b1!}`);
    ok(n2 === 1 && b1! - b2! === COST() && par.every((x) => typeof x === "number") && par.reduce((s: number, x: Any) => s + Number(x), 0) === COST(), `พร้อมกัน: แถว=${n2} หัก=${b1! - b2!} ผล=${J(par)}`);
  });
  await st("C-4", "X3 พร้อมกันในโพรเซส 4 ทาง รูปเดียว (106 ไฟ · ตัวอ่านช้า 300 ms) ⇒ ok ทุกทาง · proposalId/value เดียว · ตัวอ่าน 1 ครั้ง · USAGE 1 · FileAsset +1 · ไม่ throw", async () => {
    needReady();
    const p = ph("106-inproc");
    const s = mkReader({ value: 1388, confidence: 0.9, delayMs: 300 });
    const fa0 = await faCount();
    const rs = await Promise.all(Array.from({ length: 4 }, () => propose(cM1, DA, ME["106E"], { data: Uint8Array.from(p.data), contentType: p.contentType }, { reader: s.reader }).catch((e: unknown) => ({ threw: errMsg(e) }))));
    ok(!badOf(rs).length && rs.every((r: Any) => r?.ok === true), `ผล ${J(rs.map(codeOf))}`);
    ok(new Set(rs.map((r: Any) => r.proposalId)).size === 1 && rs.every((r: Any) => r.value === 1388), `proposalId ${new Set(rs.map((r: Any) => r.proposalId)).size}`);
    eq(s.calls.length, 1, "ตัวอ่าน");
    eq((await usage(A)).filter((t: Any) => t.ref === refOf(ME["106E"], p)).length, 1, "USAGE");
    eq(await faCount() - fa0, 1, "FileAsset");
    eq(rs.filter((r: Any) => r.charged === true).length, 1, "charged true");
  });
  await st("C-5", "X3 10 ทางจาก 5 โพรเซส (2 ทาง/โพรเซส · รูปเดียว 106 น้ำ · ตัวอ่านช้า 400 ms) ⇒ ok ทุกทาง · proposalId เดียว · ตัวอ่านรวม 1 ครั้ง · USAGE 1 · FileAsset +1 · ไม่มี P2002/P2028/throw", async () => {
    needReady();
    const p = ph("106w-fanout");
    const fa0 = await faCount();
    const item = { ctx: cM1, input: { unitId: DA, meterId: ME["106W"], periodKey: P0, photo: { data: b64(p.data), contentType: p.contentType } } };
    const { results, calls } = await fanout(Array.from({ length: 5 }, () => [item, item]), { value: 1391, confidence: 0.9, delayMs: 400 }, Date.now() + SYNC_MS);
    ok(!badOf(results).length && results.length === 10 && results.every((r: Any) => r?.ok === true), `ผล ${J(results.map(codeOf))}`);
    ok(new Set(results.map((r: Any) => r.proposalId)).size === 1 && results.every((r: Any) => r.value === 1391), `proposalId ${new Set(results.map((r: Any) => r.proposalId)).size}`);
    eq(calls, 1, "ตัวอ่านรวม");
    eq((await usage(A)).filter((t: Any) => t.ref === refOf(ME["106W"], p)).length, 1, "USAGE");
    eq(await faCount() - fa0, 1, "FileAsset");
  });
  await st("C-6", "ไม่หักร้านอื่น: เจ้าของร้าน B เสนอบนมิเตอร์ร้าน A ⇒ NOT_FOUND · ตัวอ่านไม่ถูกเรียก · USAGE/ยอดของ A และ B ไม่เปลี่ยน · ไม่มีไฟล์ใหม่ทั้งสองร้าน", async () => {
    needReady();
    const s = mkReader({ value: 1390, confidence: 0.9 });
    const before = [(await usage(A)).length, (await usage(B)).length, await bal(A), await bal(B), await faCount(A), await faCount(B)];
    const r = await propose(cB, DA, ME["101E"], ph("cross-b"), { reader: s.reader });
    NF_REF = r;
    ok(failIs(r, "NOT_FOUND"), `ได้ ${codeOf(r)}`);
    eq(s.calls.length, 0, "ตัวอ่าน");
    eq([(await usage(A)).length, (await usage(B)).length, await bal(A), await bal(B), await faCount(A), await faCount(B)], before, "A/B");
  });
  await st("C-7", "meterAiStatus อ่านอย่างเดียว: DA {true,true,80} · DA2 minConfidence 50 · DA3 ปิด ⇒ {false,false} · Z เครดิต 0 ⇒ available false · W ไม่มีกระเป๋า ⇒ available true และยังไม่มีกระเป๋า/แถว GRANT", async () => {
    needReady();
    const f = D.status();
    const a = await f(cOWN, { unitId: DA }), a2 = await f(cM1, { unitId: ids.DA2 }), a3 = await f(cM1, { unitId: ids.DA3 }), z = await f(cZ, { unitId: ids.DZ }), w = await f(cW, { unitId: ids.DW });
    eq([a, { m: a2?.minConfidence }, { e: a3?.enabled, a: a3?.available }, { a: z?.available }, { a: w?.available }],
      [{ enabled: true, available: true, minConfidence: 80 }, { m: 50 }, { e: false, a: false }, { a: false }, { a: true }], "สถานะ");
    eq([await prisma.aiCreditWallet.count({ where: { tenantId: ids.W } }), await prisma.aiCreditTxn.count({ where: { tenantId: ids.W } })], [0, 0], "กระเป๋า/แถว W");
  });

  // ═══════════════ K คนยืนยัน ═══════════════
  console.log("\n── K คนยืนยัน (บันทึกจากข้อเสนอผ่าน submitReadings) ──");
  await st("K-1", "บันทึกค่าเท่าที่เสนอ (101 ไฟ 1415 + aiProposalId รูป b) ⇒ CREATED · source AI · aiValue 1415 · photoFileId = ไฟล์ของข้อเสนอ · readById ผู้กด · ไม่อัปไฟล์ใหม่ · ไม่มีป้าย", async () => {
    ok(isProposal(PR.p101b) && FILE.p101b, "P-5 ไม่ผ่าน");
    const fa0 = await faCount(), u0 = (await usage(A)).length;
    const { x } = await submit1(cM1, DA, { meterId: ME["101E"], value: 1415, aiProposalId: PR.p101b.proposalId });
    const [row] = await rowsOf(ME["101E"]);
    ok(x?.status === "CREATED" && x.flag === null, `ผล ${J(x)}`);
    eq({ source: row?.source, aiValue: row?.aiValue, photoFileId: row?.photoFileId, readById: row?.readById, value: row?.value }, { source: "AI", aiValue: 1415, photoFileId: FILE.p101b, readById: ids.M1, value: 1415 }, "แถว");
    eq([await faCount() - fa0, (await usage(A)).length - u0], [0, 0], "ไฟล์/USAGE เพิ่ม");
  });
  await st("K-2", "คนแก้ค่า (105 น้ำ เสนอ 1395 · บันทึก 1396) ⇒ CREATED · source MANUAL · aiValue 1395 (หลักฐานข้อเสนอ) · photoFileId ไฟล์ของข้อเสนอ", async () => {
    ok(isProposal(PR.p105w), "P-9 ไม่ผ่าน");
    const { x } = await submit1(cM1, DA, { meterId: ME["105W"], value: 1396, aiProposalId: PR.p105w.proposalId });
    const [row] = await rowsOf(ME["105W"]);
    const f = row?.photoFileId ? await prisma.fileAsset.findUnique({ where: { id: row.photoFileId } }) : null;
    ok(x?.status === "CREATED" && row?.source === "MANUAL" && row?.aiValue === 1395 && row?.value === 1396 && f?.tenantId === A && String(f?.path).includes("/private/"), `${J(x)} ${J(row && { s: row.source, ai: row.aiValue, v: row.value, f: !!f })}`);
  });
  await st("K-3", "ความมั่นใจต่ำต้องติ๊ก: 102 ไฟ 1410 ไม่ส่ง ack ⇒ REJECTED AI_NEEDS_CONFIRM ไม่มีแถว · ส่ง ackLowConfidence true ⇒ CREATED source AI aiValue 1410", async () => {
    ok(isProposal(PR.p102) && PR.p102.lowConfidence === true, "P-6 ไม่ผ่าน");
    const a = await submit1(cM1, DA, { meterId: ME["102E"], value: 1410, aiProposalId: PR.p102.proposalId });
    ok(a.x?.status === "REJECTED" && a.x.code === "AI_NEEDS_CONFIRM", `ไม่ ack ${J(a.x ?? a.r)}`);
    eq((await rowsOf(ME["102E"])).length, 0, "แถวหลังไม่ ack");
    const b = await submit1(cM1, DA, { meterId: ME["102E"], value: 1410, aiProposalId: PR.p102.proposalId, ackLowConfidence: true });
    const [row] = await rowsOf(ME["102E"]);
    ok(b.x?.status === "CREATED" && row?.source === "AI" && row?.aiValue === 1410, `ack ${J(b.x)} ${J(row && { s: row.source, ai: row.aiValue })}`);
  });
  await st("K-4", "ค่าไม่สมเหตุผลต้องยืนยันชัด (ตัวตรวจ D.6): 103 BACKWARDS ⇒ แถวพัก · heldRooms มี 103 · ACCEPT ⇒ BACKWARDS_NEEDS_REPLACE · 104 HIGH ⇒ พัก · ACCEPT ⇒ ok ไม่พัก", async () => {
    ok(isProposal(PR.p103) && isProposal(PR.p104), "P-7 ไม่ผ่าน");
    const a = await submit1(cM1, DA, { meterId: ME["103E"], value: 1200, aiProposalId: PR.p103.proposalId });
    const b = await submit1(cM1, DA, { meterId: ME["104E"], value: 1500, aiProposalId: PR.p104.proposalId });
    ok(a.x?.status === "CREATED" && a.x.flag === "BACKWARDS" && a.x.held === true && b.x?.status === "CREATED" && b.x.flag === "HIGH" && b.x.held === true, `${J(a.x)} ${J(b.x)}`);
    const held = await D.held()({ tenantId: A }, { unitId: DA, periodKey: P0 });
    ok(held.includes(R["103"]) && held.includes(R["104"]), `heldRooms ${J(held)}`);
    const c1 = await D.confirm()(cM1, { unitId: DA, readingId: a.x.readingId, action: "ACCEPT" });
    const c2 = await D.confirm()(cM1, { unitId: DA, readingId: b.x.readingId, action: "ACCEPT" });
    ok(codeOf(c1) === "BACKWARDS_NEEDS_REPLACE" && c2?.ok === true && c2.held === false, `${codeOf(c1)} ${J(c2)}`);
  });
  await st("K-5", "ไม่มี AI = ทางเดียวกัน: DA3 401 (AI_OFF) พิมพ์ 1390 + aiProposalId ⇒ CREATED · source MANUAL · aiValue null · photoFileId = รูปที่ถ่ายตอนเสนอ", async () => {
    ok(isProposal(PR.p401), "P-11 ไม่ผ่าน");
    const { x } = await D.submit()(cM1, { unitId: ids.DA3, periodKey: P0, items: [{ meterId: ME["401E"], value: 1390, aiProposalId: PR.p401.proposalId }] }, { put: PUT }).then((r: Any) => ({ x: r?.ok ? r.results[0] : r }));
    const [row] = await rowsOf(ME["401E"]);
    const f = row?.photoFileId ? await prisma.fileAsset.findUnique({ where: { id: row.photoFileId } }) : null;
    ok(x?.status === "CREATED" && row?.source === "MANUAL" && row?.aiValue === null && f?.tenantId === A, `${J(x)} ${J(row && { s: row.source, ai: row.aiValue, f: !!f })}`);
  });
  await st("K-6", "X1 ข้อเสนอผิดที่ ⇒ รายการ REJECTED NOT_FOUND ไม่มีแถว: ของ 101 ใช้กับ 107 · ของงวดก่อนใช้กับงวดนี้ · ของร้าน B ใช้ในร้าน A · ของร้าน A ใช้ในร้าน B · id มั่ว", async () => {
    needReady();
    ok(isProposal(PR.p101a), "P-1 ไม่ผ่าน");
    const prev = await propose(cM1, DA, ME["107E"], ph("107-prev"), { reader: mkReader({ value: 1300, confidence: 0.9 }).reader }, P(-1));
    const pb = await propose(cB, ids.DB, ME["b1E"], ph("b1"), { reader: mkReader({ value: 1390, confidence: 0.9 }).reader });
    ok(isProposal(prev) && isProposal(pb), `เตรียม ${codeOf(prev)} ${codeOf(pb)}`);
    const tries: [string, Any, string, string, string][] = [
      ["101→107", cM1, DA, ME["107E"], PR.p101a.proposalId], ["งวดก่อน", cM1, DA, ME["107E"], prev.proposalId], ["B→A", cM1, DA, ME["107E"], pb.proposalId],
      ["A→B", cB, ids.DB, ME["b1E"], PR.p101a.proposalId], ["มั่ว", cM1, DA, ME["107E"], "qc-d14-no-such-proposal"]];
    const bad: string[] = [];
    for (const [n, ctx, unitId, meterId, pid] of tries) {
      const r = await D.submit()(ctx, { unitId, periodKey: P0, items: [{ meterId, value: 1390, aiProposalId: pid }] }, { put: PUT });
      const x = r?.ok ? r.results[0] : r;
      if (!(x?.status === "REJECTED" && x.code === "NOT_FOUND")) bad.push(`${n} ⇒ ${J(x).slice(0, 100)}`);
    }
    ok(!bad.length, bad.join(" · "));
    eq([(await rowsOf(ME["107E"])).length, (await rowsOf(ME["b1E"])).length], [0, 0], "แถว");
  });
  await st("K-7", "X4 ส่งบันทึกซ้ำ (K-1 เดิม) ⇒ UNCHANGED · ไม่มีไฟล์/USAGE เพิ่ม · แถวเดิม", async () => {
    ok(isProposal(PR.p101b), "P-5 ไม่ผ่าน");
    const fa0 = await faCount(), u0 = (await usage(A)).length;
    const { x } = await submit1(cM1, DA, { meterId: ME["101E"], value: 1415, aiProposalId: PR.p101b.proposalId });
    ok(x?.status === "UNCHANGED" && (await rowsOf(ME["101E"])).length === 1, J(x));
    eq([await faCount() - fa0, (await usage(A)).length - u0], [0, 0], "ไฟล์/USAGE");
  });
  await st("K-8", "§4 ข้อ 6: แก้แถว AI โดยพิมพ์เองไม่มีข้อเสนอ (101 ไฟ 1420) ⇒ UPDATED · source MANUAL · aiValue null", async () => {
    ok(isProposal(PR.p101b), "P-5 ไม่ผ่าน");
    const { x } = await submit1(cM1, DA, { meterId: ME["101E"], value: 1420 });
    const [row] = await rowsOf(ME["101E"]);
    ok(x?.status === "UPDATED" && row?.source === "MANUAL" && row?.aiValue === null && row?.value === 1420, `${J(x)} ${J(row && { s: row.source, ai: row.aiValue, v: row.value })}`);
  });

  // ═══════════════ X ขอบเขต ═══════════════
  console.log("\n── X ขอบเขต (X1 ไม่พบเดียวกัน) ──");
  await st("X-1", "ไม่พบเดียวกัน (deep-equal) 8 กรณี: ร้านอื่น · หน่วยที่ไม่มีสิทธิ์ · หน่วยโรงแรม · มิเตอร์ไม่มีจริง · มิเตอร์ของหน่วยอื่น · นอกอาคาร · ไม่มี dorm.meter.read · ไม่มี actorUserId — ไม่เรียกตัวอ่าน · ไม่มีไฟล์/USAGE", async () => {
    needReady();
    ok(failIs(NF_REF, "NOT_FOUND"), "C-6 ไม่ผ่าน (ไม่มีผลอ้างอิง)");
    const s = mkReader({ value: 1390, confidence: 0.9 });
    const fa0 = await faCount(), u0 = (await usage(A)).length;
    const cases: [string, Any, string, string][] = [
      ["ร้านอื่น", cB, DA, ME["107W"]], ["หน่วยไม่มีสิทธิ์", cM1, ids.DQ, ME["q1E"]], ["หน่วยโรงแรม", cM1, ids.HA, ME["107W"]], ["ไม่มีจริง", cM1, DA, "qc-d14-no-meter"],
      ["มิเตอร์หน่วยอื่น", cM1, DA, ME["301E"]], ["นอกอาคาร", cMS, DA, ME["201E"]], ["ไม่มีสิทธิ์จด", cVW, DA, ME["107W"]], ["ไม่มีผู้กระทำ", { tenantId: A }, DA, ME["107W"]]];
    const bad: string[] = [];
    for (const [n, ctx, unitId, meterId] of cases) { const r = await propose(ctx, unitId, meterId, ph(`x1-${n}`), { reader: s.reader }); if (!isDeepStrictEqual(r, NF_REF)) bad.push(`${n} ⇒ ${J(r).slice(0, 90)}`); }
    ok(!bad.length, bad.join(" · "));
    ok(s.calls.length === 0 && (await faCount()) === fa0 && (await usage(A)).length === u0, `calls=${s.calls.length} fa=${(await faCount()) - fa0}`);
  });
  await st("X-2", "ขอบเขตอาคาร: MS (อาคาร 1) เสนอ 107 น้ำ ⇒ ok · มิเตอร์รวมอาคาร 1 ⇒ ok · มิเตอร์รวมอาคาร 2 ⇒ ไม่พบเดียวกัน · M1 (อาคาร 1+2) เสนอ 201 ⇒ ok", async () => {
    needReady();
    const a = await propose(cMS, DA, ME["107W"], ph("ms-107w"), { reader: mkReader({ value: 1396, confidence: 0.9 }).reader });
    const b = await propose(cMS, DA, ME.MAIN1, ph("ms-main1"), { reader: mkReader({ value: 1390, confidence: 0.9 }).reader });
    const c = await propose(cMS, DA, ME.MAIN2, ph("ms-main2"), { reader: mkReader({ value: 1390, confidence: 0.9 }).reader });
    const d = await propose(cM1, DA, ME["201E"], ph("m1-201"), { reader: mkReader({ value: 1390, confidence: 0.9 }).reader });
    PR.p201 = d;
    ok(isProposal(a) && isProposal(b) && isDeepStrictEqual(c, NF_REF) && isProposal(d), `${codeOf(a)} ${codeOf(b)} ${codeOf(c)} ${codeOf(d)}`);
  });
  await st("X-3", "meterProposals: M1 เห็นข้อเสนอค้างล่าสุดต่อมิเตอร์ (มี 106 ไฟ/น้ำ · 201 · 105 ไฟ ครั้งเดียว) · ไม่มีมิเตอร์ที่จดแล้ว (101/102/103/104 ไฟ · 105 น้ำ) · MS ไม่เห็นอาคาร 2 · VW/ร้าน B ⇒ []", async () => {
    needReady();
    const f = D.proposals();
    const m1 = await f(cM1, { unitId: DA, periodKey: P0 }), ms = await f(cMS, { unitId: DA, periodKey: P0 }), vw = await f(cVW, { unitId: DA, periodKey: P0 }), b = await f(cB, { unitId: DA, periodKey: P0 });
    ok(Array.isArray(m1) && Array.isArray(ms), `ไม่ใช่อาร์เรย์ ${J(m1).slice(0, 80)}`);
    const mids = m1.map((p: Any) => p.meterId);
    const bad: string[] = [];
    for (const k of ["106E", "106W", "201E", "105E"]) if (mids.filter((x: string) => x === ME[k]).length !== 1) bad.push(`ไม่มี/ซ้ำ ${k}`);
    for (const k of ["101E", "102E", "103E", "104E", "105W"]) if (mids.includes(ME[k])) bad.push(`มี ${k} ที่จดแล้ว`);
    const p106 = m1.find((p: Any) => p.meterId === ME["106E"]);
    if (!(p106?.value === 1388 && p106.source === "AI" && p106.periodKey === P0 && typeof p106.proposalId === "string")) bad.push(`106 ${J(p106).slice(0, 100)}`);
    if (ms.some((p: Any) => p.meterId === ME["201E"] || p.meterId === ME.MAIN2)) bad.push("MS เห็นอาคาร 2");
    if (!ms.some((p: Any) => p.meterId === ME["106E"])) bad.push("MS ไม่เห็นอาคาร 1");
    if (!(Array.isArray(vw) && vw.length === 0 && Array.isArray(b) && b.length === 0)) bad.push(`VW=${J(vw).slice(0, 40)} B=${J(b).slice(0, 40)}`);
    ok(!bad.length, bad.join(" · "));
  });
  await st("X-4", "previewReading: ร้าน B บนมิเตอร์ A ⇒ NOT_FOUND · ค่าไม่ใช่จำนวนเต็ม ⇒ INVALID_INPUT · ไม่มีการเขียน", async () => {
    needReady();
    const n0 = await prisma.dormMeterReading.count({ where: { tenantId: A } });
    const a = await D.preview()(cB, { unitId: DA, meterId: ME["107E"], periodKey: P0, value: 1390 });
    const b = await D.preview()(cM1, { unitId: DA, meterId: ME["107E"], periodKey: P0, value: 1.5 });
    eq([codeOf(a), codeOf(b)], ["NOT_FOUND", "INVALID_INPUT"], "โค้ด");
    eq(await prisma.dormMeterReading.count({ where: { tenantId: A } }), n0, "แถว");
  });

  // ═══════════════ M PDPA · ตัวต่อจริง ═══════════════
  console.log("\n── M PDPA (X8) · ตัวต่อจริงผ่านตัวจำลอง OpenRouter ──");
  await st("M-1", "defaultMeterReader (ไม่ส่ง deps.reader) บน 7731 ไฟ: provider ของระบบ 1 คำขอ · รูปเดียว = data URL ของไบต์ที่ส่งตรงตัว · คีย์ปลอม · ข้อความไม่มีเลขห้อง/ชื่อหอ/อาคาร/serial/id/อีเมล · ได้ AI 1395 (0.94) · หักตาม model/usage ที่ provider ตอบ", async () => {
    needReady();
    const p = ph("7731e");
    OR_MODE = "ok"; OR_VALUE = 1395;
    const n0 = OR_REQS.length;
    const r = await propose(cM1, DA, ME["7731E"], p, {});
    ok(r?.ok === true && r.source === "AI" && r.value === 1395 && r.confidence === 0.94 && r.charged === true, `ผล ${J(r).slice(0, 200)}`);
    const reqs = OR_REQS.slice(n0);
    eq(reqs.length, 1, "คำขอไป openrouter");
    const q = reqs[0];
    ok(q.auth === `Bearer ${FAKE_KEY}`, "Authorization ไม่ใช่คีย์ปลอม");
    const imgs: string[] = [];
    const walkJ = (v: Any) => { if (Array.isArray(v)) v.forEach(walkJ); else if (v && typeof v === "object") { if (typeof v.image_url?.url === "string") imgs.push(v.image_url.url); Object.values(v).forEach(walkJ); } };
    walkJ(q.body?.messages);
    eq(imgs, [`data:image/jpeg;base64,${b64(p.data)}`], "รูปที่ส่ง");
    const text = J(q.body?.messages).split(b64(p.data)).join("");
    const ban = [...PII, "7731", A, DA, ME["7731E"], ids.M1, ids.B1].filter((x) => x && text.includes(x));
    ok(!ban.length, `ข้อความมี ${ban.join(", ")}`);
    const t = (await usage(A)).filter((x: Any) => x.ref === refOf(ME["7731E"], p));
    ok(t.length === 1 && t[0].model === MODEL && t[0].tokensIn === OR_USAGE.prompt_tokens && t[0].tokensOut === OR_USAGE.completion_tokens && t[0].amountMicro === -COST(OR_USAGE.prompt_tokens, OR_USAGE.completion_tokens), `USAGE ${J(t)}`);
  });
  await st("M-2", "รูปไม่ออกนอก provider ที่อนุญาต: ตั้งแต่ PC-3 ไม่มีคำขอถูกบล็อก (ไม่มีปลายทางอื่น) · ทุกคำขอ AI ไป https://openrouter.ai เท่านั้น", () => {
    ok(BLOCKED.length === blockedBase, `ถูกบล็อก ${J(BLOCKED.slice(blockedBase))}`);
    ok(OR_REQS.every((q) => q.url.startsWith("https://openrouter.ai/")), J(OR_REQS.map((q) => q.url)));
  });
  await st("M-3", "ไม่มีคีย์ระบบ (SHARK_AI_KEY ว่าง): defaultMeterReader ⇒ null · เสนอ (ไม่ส่ง reader) ⇒ MANUAL NO_PROVIDER ไม่มีคำขอ · meterAiStatus available false", async () => {
    needReady();
    const n0 = OR_REQS.length;
    delete process.env.SHARK_AI_KEY;
    try {
      const rd = await D.reader()({ tenantId: A });
      const r = await propose(cM1, DA, ME["7731W"], ph("7731w-nokey"), {});
      const s = await D.status()(cOWN, { unitId: DA });
      ok(rd === null && r?.ok === true && r.manualReason === "NO_PROVIDER" && OR_REQS.length === n0 && s?.available === false && s?.enabled === true, `reader=${J(rd)} ${J(r).slice(0, 120)} status=${J(s)}`);
    } finally { process.env.SHARK_AI_KEY = FAKE_KEY; }
  });
  await st("M-4", "ไม่มีรูป/base64/PII ในฐาน: AuditLog + OutboxEvent ของร้าน A ไม่มีชิ้น base64 ของรูปที่ใช้ · ไม่มีชื่อหอ/อาคาร/serial/อีเมล", async () => {
    needReady();
    const blob = J(await prisma.auditLog.findMany({ where: { tenantId: A } })) + J(await prisma.outboxEvent.findMany({ where: { tenantId: A } }));
    const leakImg = PHOTOS.filter((u) => blob.includes(b64(u).slice(16, 56))).length;
    const leak = PII.filter((p) => blob.includes(p));
    ok(leakImg === 0 && !leak.length, `รูป ${leakImg} · PII ${leak.join(",")}`);
  });
  await st("M-5", "provider ตอบเพี้ยน (ไม่ใช่ JSON) ⇒ UNREADABLE ไม่ throw · หัก 1 ครั้ง (เรียกสำเร็จ)", async () => {
    needReady();
    const p = ph("7731w-garbage");
    OR_MODE = "garbage";
    try {
      const r = await propose(cM1, DA, ME["7731W"], p, {});
      ok(r?.ok === true && r.manualReason === "UNREADABLE" && r.value === null && r.charged === true, J(r).slice(0, 200));
      eq((await usage(A)).filter((x: Any) => x.ref === refOf(ME["7731W"], p)).length, 1, "USAGE");
    } finally { OR_MODE = "ok"; }
  });
  await st("M-6", "provider HTTP 500 ⇒ AI_FAILED ไม่ throw · ไม่หัก", async () => {
    needReady();
    const p = ph("7732e-error");
    OR_MODE = "error";
    try {
      const r = await propose(cM1, DA, ME["7732E"], p, {});
      ok(r?.ok === true && r.manualReason === "AI_FAILED" && r.charged === false, J(r).slice(0, 200));
      eq((await usage(A)).filter((x: Any) => x.ref === refOf(ME["7732E"], p)).length, 0, "USAGE");
    } finally { OR_MODE = "ok"; }
  });

  // ═══════════════ U จอ + คิว ═══════════════
  console.log("\n── U MeterWalk (render) · คิวออฟไลน์ ──");
  const noop = async () => ({ ok: true, results: [] });
  const AI_ON = { enabled: true, available: true, minConfidence: 80 };
  const prop = (over: Record<string, unknown> = {}) => ({ proposalId: "qc-p1", meterId: ME["101E"], periodKey: P0, source: "AI", manualReason: null, value: 1412, confidence: 0.94, prevValue: 1300, units: 112, flag: null, lowConfidence: false, needsConfirm: false, createdAt: new Date().toISOString(), ...over });
  const panel = (proposals: Any[], ai: Any = AI_ON) => { ok(WalkC, walkL.err || "MeterWalk ไม่มี default export"); ok(walk0, "meterWalk ของฉากอ่านไม่ได้"); return render({ unitId: DA, periodKey: P0, walk: walk0, flags: [], submit: noop, propose: noop, ai, proposals, initialRoomId: R["101"] }); };
  const legalCheck = (h: string) => { const t = textOf(h); ok(!LEGAL_BAD.test(t) && !/฿/.test(t), `คำต้องห้าม/฿: ${LEGAL_BAD.exec(t)?.[0] ?? "฿"}`); };
  await st("U-1", "แผงห้อง 101 + ข้อเสนอ AI: data-ai-proposal=<มิเตอร์> data-ai-source=AI · ช่อง data-meter-input เติม 1412 · \"อ่านจากรูป\" · ปุ่มรูป \"ระบบอ่านเลข\" · ปุ่ม \"บันทึก\" (ไม่ส่งเอง)", () => {
    const h = panel([prop()]);
    const box = boxes(h, "data-ai-proposal").find((b) => b.attrs["data-ai-proposal"] === ME["101E"]);
    const inp = boxes(h, "data-meter-input").find((b) => b.attrs["data-meter-input"] === ME["101E"]);
    const t = textOf(h);
    ok(box?.attrs["data-ai-source"] === "AI" && /อ่านจากรูป/.test(textOf(box.html)), `กล่อง ${J(box?.attrs)}`);
    ok(inp?.attrs.value === "1412", `ช่องกรอก value=${inp?.attrs.value}`);
    ok(/ระบบอ่านเลข/.test(t) && /บันทึก/.test(t), "ข้อความปุ่ม");
    legalCheck(h);
  }, "MAJOR");
  await st("U-2", "ความมั่นใจต่ำ: data-ai-low=true · \"ไม่แน่ใจ\" · checkbox data-ai-ack=<มิเตอร์> + \"ตรวจกับรูปแล้ว\"", () => {
    const h = panel([prop({ confidence: 0.6, lowConfidence: true, needsConfirm: true })]);
    const box = boxes(h, "data-ai-proposal").find((b) => b.attrs["data-ai-proposal"] === ME["101E"]);
    ok(box?.attrs["data-ai-low"] === "true", `attrs ${J(box?.attrs)}`);
    const ack = [...h.matchAll(/<input[^>]*data-ai-ack="([^"]*)"[^>]*>/g)].map((m) => attrsOf(m[0]));
    ok(ack.length === 1 && ack[0]["data-ai-ack"] === ME["101E"] && ack[0].type === "checkbox", `ack ${J(ack)}`);
    ok(/ไม่แน่ใจ/.test(textOf(box!.html)) && /ตรวจกับรูปแล้ว/.test(textOf(h)), "ข้อความ");
  }, "MAJOR");
  await st("U-3", "ป้ายล่วงหน้า: BACKWARDS ⇒ data-ai-flag=BACKWARDS + \"เลขถอยหลัง\" · HIGH ⇒ \"สูงกว่าปกติ\"", () => {
    const h = panel([prop({ value: 1200, units: null, flag: "BACKWARDS", needsConfirm: true })]);
    const box = boxes(h, "data-ai-proposal")[0];
    ok(box?.attrs["data-ai-flag"] === "BACKWARDS" && /เลขถอยหลัง/.test(textOf(box.html)), `${J(box?.attrs)}`);
    const h2 = panel([prop({ value: 1500, units: 200, flag: "HIGH", needsConfirm: true })]);
    ok(/สูงกว่าปกติ/.test(textOf(boxes(h2, "data-ai-proposal")[0]?.html ?? "")), "HIGH");
    legalCheck(h); legalCheck(h2);
  }, "MAJOR");
  await st("U-4", "ข้อเสนอ MANUAL (อ่านไม่ได้/ไม่มี AI): data-ai-source=MANUAL · \"พิมพ์เอง\" · ช่องกรอกว่าง", () => {
    const h = panel([prop({ source: "MANUAL", manualReason: "UNREADABLE", value: null, confidence: null, units: null })]);
    const box = boxes(h, "data-ai-proposal")[0];
    const inp = boxes(h, "data-meter-input").find((b) => b.attrs["data-meter-input"] === ME["101E"]);
    ok(box?.attrs["data-ai-source"] === "MANUAL" && /พิมพ์เอง/.test(textOf(box.html)) && !(inp?.attrs.value ?? ""), `${J(box?.attrs)} value=${inp?.attrs.value}`);
  }, "MAJOR");
  await st("U-5", "ไม่ส่ง ai / ai.enabled false ⇒ เท่า D.6: ไม่มี attr data-ai-* · ไม่มี \"ระบบอ่านเลข\" · ปุ่ม \"ถ่ายรูปมิเตอร์\" เดิม", () => {
    ok(WalkC && walk0, "ไม่มีคอมโพเนนต์/ฉาก");
    const h1 = render({ unitId: DA, periodKey: P0, walk: walk0, flags: [], submit: noop, initialRoomId: R["101"] });
    const h2 = panel([prop()], { enabled: false, available: false, minConfidence: 80 });
    for (const [n, h] of [["ไม่ส่ง ai", h1], ["ปิด", h2]] as const) ok(!/\sdata-ai-/.test(h) && !/ระบบอ่านเลข/.test(textOf(h)) && /ถ่ายรูปมิเตอร์/.test(textOf(h)), `${n}: มี data-ai/ป้ายผิด`);
  }, "MAJOR");
  await st("U-6", "หน้าเดียวกันหลายข้อเสนอ: ทุกมิเตอร์ของห้องมีกล่องของตัวเอง (ไฟ AI · น้ำ MANUAL) ไม่ปนกัน", () => {
    const h = panel([prop(), prop({ proposalId: "qc-p2", meterId: ME["101W"], source: "MANUAL", manualReason: "AI_FAILED", value: null, confidence: null, units: null })]);
    const bx = boxes(h, "data-ai-proposal").map((b) => `${b.attrs["data-ai-proposal"] === ME["101E"] ? "E" : b.attrs["data-ai-proposal"] === ME["101W"] ? "W" : "?"}:${b.attrs["data-ai-source"]}`).sort();
    eq(bx, ["E:AI", "W:MANUAL"], "กล่อง");
  }, "MINOR");
  await st("U-7", "คิวออฟไลน์ (pure): ส่งต่อ aiProposalId/ackLowConfidence ใน nextBatch · จดซ้ำไม่มีรูป/ข้อเสนอ ⇒ คงรูป+ข้อเสนอเดิม แต่ไม่คง ack · ข้อเสนอใหม่ (ไม่มีรูป) ⇒ ใช้ข้อเสนอใหม่ คงรูป (กติกา D.6)", () => {
    const E = fnOf(QL, "enqueueReading", F.queue), N = fnOf(QL, "nextBatch", F.queue);
    const photo = { dataUrl: "data:image/jpeg;base64,AAAA", contentType: "image/jpeg" };
    const at = `${TODAY}T03:00:00.000Z`;
    let q = E([], { meterId: "m", periodKey: P0, value: 5, readAt: at, clientKey: "k1", photo, aiProposalId: "pp1", ackLowConfidence: true });
    const b1 = N(q)?.items?.[0];
    ok(b1?.aiProposalId === "pp1" && b1?.ackLowConfidence === true, `nextBatch ${J(b1)}`);
    q = E(q, { meterId: "m", periodKey: P0, value: 6, readAt: at, clientKey: "k2", photo: null });
    const i2 = q.find((x: Any) => x.meterId === "m");
    ok(q.length === 1 && i2?.value === 6 && i2?.photo?.dataUrl === photo.dataUrl && i2?.aiProposalId === "pp1" && !i2?.ackLowConfidence, `จดซ้ำ ${J(i2)}`);
    q = E(q, { meterId: "m", periodKey: P0, value: 7, readAt: at, clientKey: "k3", photo: null, aiProposalId: "pp2" });
    const i3 = q.find((x: Any) => x.meterId === "m");
    ok(i3?.aiProposalId === "pp2" && i3?.photo?.dataUrl === photo.dataUrl && i3?.value === 7, `ข้อเสนอใหม่ ${J(i3)}`);
  }, "MAJOR");
} catch (e) {
  record("CRASH", "จบกลางทาง", "FAIL", errMsg(e), "CRITICAL");
} finally {
  try { await cleanup(tenantIds); await cleanupMisc(); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); }
  try {
    const left = await leftovers(tenantIds);
    const u = await prisma.user.count({ where: { email: { startsWith: "svc-d14-" } } });
    if (!left.length && u === 0) record("Z-1", `ล้างครบ: ทุกตารางที่มี tenantId ของร้านทดสอบ ${tenantIds.length} ร้าน = 0 แถว + ผู้ใช้ svc-d14-* = 0`, "PASS", "", "MAJOR");
    else record("Z-1", "ล้างครบ", "FAIL", `${J(left)} users=${u}`, "MAJOR");
  } catch (e) { record("Z-1", "ล้างครบ", "FAIL", `ตรวจไม่ได้: ${errMsg(e)}`, "MAJOR"); }
}

// ═══════════════ S (git · ตอนรับใบเท่านั้น) ═══════════════
console.log("\n── S: ไฟล์ที่แตะ (git) ──");
const git = (args: string[]) => execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const dirty = (paths: string[]) => git(["status", "--porcelain", "--untracked-files=all", "--", ...paths]).split("\n").filter(Boolean).map((l) => l.slice(3).trim().replace(/^"|"$/g, ""));
const diffLines = (f: string) => git(["diff", "-U0", "HEAD", "--", f]).split("\n").filter((l) => /^[+-](?![+-])/.test(l));
const OWN = new Set<string>([F.ai, F.meter, F.queue, F.dormIndex, F.comp, F.page, F.actions, F.defs, F.credit]);
{
  const ch = dirty(["src", "prisma", "public"]);
  const headHas = (() => { try { git(["cat-file", "-e", `HEAD:${F.ai}`]); return true; } catch { return false; } })();
  if (ch.length === 0 && headHas) skip("S-1", "แตะเฉพาะไฟล์ของใบ (§1)", "D.14 merge แล้ว — ข้อนี้ตรวจเฉพาะตอนรับใบ (git status ของทรีงาน)");
  else await st("S-1", "แตะเฉพาะไฟล์ของใบ (§1 · git status ตอนรับใบ) · มี meter-ai.ts", () => {
    const outside = ch.filter((f) => !OWN.has(f));
    ok(outside.length === 0, `ไฟล์นอกใบ: ${outside.slice(0, 8).join(", ")}`);
    ok(existsSync(join(ROOT, F.ai)), `ยังไม่มี ${F.ai}`);
  });
}
await st("S-2", "ไม่แตะชิ้นต้องห้าม: prisma · core (นอก defs/rooms.ts) · ai (นอก credit.ts) · โมดูลหออื่น (นอก meter/meter-queue/meter-ai/index) · outbox/automation/webhooks · permissions · storage · /api · fitness", () => {
  const banned = dirty(["prisma", "src/lib/core", "src/lib/ai", "src/lib/modules/dorm", "src/lib/outbox-consumers.ts", "src/lib/automation", "src/lib/webhooks", "src/lib/storage", "src/app/api", F.fitness])
    .filter((f) => !OWN.has(f));
  eq(banned, [], "ไฟล์");
});
await st("S-13", "แก้ไฟล์ร่วมแบบเพิ่ม: defs/rooms.ts · dorm/index.ts ไม่ลบบรรทัด · credit.ts ลบ ≤ 3 · meter-queue.ts ลบ ≤ 6", () => {
  const rm = (f: string) => diffLines(f).filter((l) => l.startsWith("-") && l.slice(1).trim()).length;
  const bad: string[] = [];
  for (const f of [F.defs, F.dormIndex]) if (rm(f) > 0) bad.push(`${f} ลบ ${rm(f)}`);
  if (rm(F.credit) > 3) bad.push(`credit.ts ลบ ${rm(F.credit)}`);
  if (rm(F.queue) > 6) bad.push(`meter-queue.ts ลบ ${rm(F.queue)}`);
  ok(!bad.length, bad.join(" · "));
}, "MAJOR");

// ═══════════════ Q ฉาก svcqc ═══════════════
console.log("\n── Q ฉาก svcqc (ข้อเสนอค้างห้อง 209 · อยู่ร่วมกับฉาก D.6) ──");
{
  let why = "";
  let unitId = "";
  let w0: Any = null;
  const owner = SQC_USERS.find((u) => u.key === SQC_DORM_METER_AI_SCENE.actor)!;
  try {
    const u = await prisma.businessUnit.findFirst({ where: { tenantId: SQC_TENANT.id, slug: SQC_UNITS.dorm.slug }, select: { id: true } });
    if (!u) why = "ร้าน svcqc ยังไม่มีหน่วยหอ (reseed ก่อน)";
    else if (typeof dormL.mod?.meterWalk !== "function") why = "facade ไม่มี meterWalk";
    else {
      unitId = u.id;
      w0 = await dormL.mod.meterWalk({ tenantId: SQC_TENANT.id }, { unitId, periodKey: P0 });
      if (w0?.progress?.rooms !== 36 || w0?.progress?.done !== 27) why = `ฉาก D.6 ยังไม่ครบ (progress ${J(w0?.progress)}) — รัน svc-qc-roomboard-scene แล้ว svc-qc-meter-scene ก่อน`;
    }
  } catch (e) { why = `อ่าน svcqc ไม่ได้: ${errMsg(e)}`; }
  const runScene = (args: string[] = []) => spawnSync("pnpm", ["exec", "tsx", F.scene, ...args], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  const summary = (out: string) => { const l = out.split("\n").reverse().find((x) => x.startsWith("SCENE_SUMMARY ")); try { return l ? JSON.parse(l.slice(14)) : null; } catch { return null; } };
  const e209 = (w: Any) => (w?.floors ?? []).flatMap((f: Any) => f.rooms ?? []).find((r: Any) => r.number === SQC_DORM_METER_AI_SCENE.room)?.meters?.find((m: Any) => m.kind === SQC_DORM_METER_AI_SCENE.kind);
  const counts = async () => [await prisma.dormMeterReading.count({ where: { tenantId: SQC_TENANT.id } }), await prisma.settingValue.count({ where: { tenantId: SQC_TENANT.id } }),
    await prisma.outboxEvent.count({ where: { tenantId: SQC_TENANT.id } }), await prisma.aiCreditTxn.count({ where: { tenantId: SQC_TENANT.id, kind: "USAGE" } })];
  const sceneProp = async () => { const m = e209(w0); const ps = await dormL.mod.meterProposals({ tenantId: SQC_TENANT.id, actorUserId: owner.userId }, { unitId, periodKey: P0 }); return { m, p: (Array.isArray(ps) ? ps : []).find((x: Any) => x.meterId === m?.meterId) }; };
  const n1 = "ฉาก svc-qc-meter-ai-scene: รันได้ · รันซ้ำ = 0/0/0 · ข้อเสนอค้าง 209 ไฟ = เลขก่อน + 150 · 0.62 · ต่ำ · ไม่มีป้าย · ไม่เขียน DormMeterReading/SettingValue/OutboxEvent/USAGE · progress คง 36/27";
  const n2 = "ฉาก --clear ลบเฉพาะข้อเสนอของฉาก (meterProposals ไม่มี 209 ไฟ · แถวอื่นคงเดิม) แล้วรันคืน";
  if (why) { skip("Q-1", n1, why, "MAJOR"); skip("Q-2", n2, why, "MAJOR"); }
  else {
    await st("Q-1", n1, async () => {
      ok(existsSync(join(ROOT, F.scene)), `ยังไม่มี ${F.scene}`);
      ok(typeof dormL.mod?.meterProposals === "function", "facade ไม่มี meterProposals");
      const c0 = await counts();
      const a = runScene();
      ok(a.status === 0, `รอบแรก exit=${a.status} ${`${a.stdout}${a.stderr}`.split("\n").slice(-3).join(" | ").slice(0, 200)}`);
      const b = runScene();
      eq(summary(`${b.stdout}`), { created: 0, updated: 0, removed: 0 }, "รอบสอง");
      const { m, p } = await sceneProp();
      ok(m && p, `ไม่พบข้อเสนอ 209 ไฟ (meter=${!!m})`);
      eq({ source: p.source, value: p.value, confidence: p.confidence, lowConfidence: p.lowConfidence, needsConfirm: p.needsConfirm, flag: p.flag },
        { source: "AI", value: (m.prevValue ?? 0) + SQC_DORM_METER_AI_SCENE.unitsOverPrev, confidence: SQC_DORM_METER_AI_SCENE.confidence, lowConfidence: true, needsConfirm: true, flag: null }, "ข้อเสนอ");
      eq(await counts(), c0, "DormMeterReading/SettingValue/Outbox/USAGE ของ svcqc");
      const w1 = await dormL.mod.meterWalk({ tenantId: SQC_TENANT.id }, { unitId, periodKey: P0 });
      eq({ rooms: w1?.progress?.rooms, done: w1?.progress?.done }, SQC_DORM_METER_AI_SCENE.expect.progress, "progress");
      void sqcMeterAiPhoto;
    }, "MAJOR");
    await st("Q-2", n2, async () => {
      ok(existsSync(join(ROOT, F.scene)), `ยังไม่มี ${F.scene}`);
      const c0 = await counts();
      const c = runScene(["--clear"]);
      ok(c.status === 0 && !(await sceneProp()).p, `--clear exit=${c.status}`);
      eq(await counts(), c0, "แถวอื่นของ svcqc");
      const back = runScene();
      ok(back.status === 0 && !!(await sceneProp()).p, "รันคืน");
    }, "MAJOR");
  }
}

// ═══════════════ V ภาพ ═══════════════
console.log("\n── V ภาพ (หอ 03 แผง ข) ──");
{
  const specs = SQC_VISUAL_SPECS["d.14"];
  const base = process.env.QC_BASE ?? "";
  const name = "ภาพ dorm-meter-ai (?roomNo=209) 1440 + 390 ด้วยผู้ใช้ meter · HTTP < 400 · ไม่ล้นแนวนอน (ผู้คุมเทียบ PARITY กับ ledger/design-dorm/03-meter-mobile.png แผง ข)";
  if (!Array.isArray(specs) || !specs.length) record("V-1", name, "FAIL", "ไม่มี SQC_VISUAL_SPECS d.14", "MAJOR");
  else if (!base) skip("V-1", name, "ไม่มี QC_BASE — ผู้คุม build QC ผ่าน iso + ฉาก roomboard → meter → meter-ai แล้วรันซ้ำด้วย QC_BASE=http://127.0.0.1:<port>", "MAJOR");
  else {
    const r = spawnSync("pnpm", ["exec", "tsx", "scripts/visual-svc.mts", "d.14", "--user", "meter", "--base", base], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
    const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
    record("V-1", name, r.status === 0 ? "PASS" : "FAIL", r.status === 0 ? "" : `exit=${r.status} ${out.split("\n").filter((l) => l.includes("❌")).slice(0, 3).join(" | ").slice(0, 300)}`, "MAJOR");
  }
}

// ═══════════════ G regression (หลังล้างข้อมูล) ═══════════════
console.log("\n── G: regression ──");
const summaryOf = (out: string): { failed: string[] } | null => {
  const line = out.split("\n").reverse().find((l) => l.startsWith("JSON_SUMMARY "));
  if (!line) return null;
  try { return JSON.parse(line.slice(13)) as { failed: string[] }; } catch { return null; }
};
const judgeNoFail = (out: string) => (summaryOf(out)?.failed.length ?? 1) === 0;
const REG: { s: string; args?: string[]; judge?: (out: string, code: number | null) => boolean; note?: string }[] = [
  // ORACLE-EDIT (ผู้คุม 31 ต.ค. · d14-G1) d.6 --no-regression (เต็มพ่วง r0.9/r0.2 ช้า+สุ่มแดง · ผู้คุมรันเต็มตอนด่านรวม) · ยอม S-5 ที่แดงตั้งแต่ฐาน (หนี้ D.6 ค้างผู้คุม · เหมือน d.12 G-3)
  { s: "qc-svc-d.6", args: ["--no-regression"], judge: (out: string) => (summaryOf(out)?.failed ?? ["?"]).every((x: string) => x === "S-5"), note: "ไม่มี FAIL นอก S-5 (ฐาน)" },
  { s: "qc-svc-d.8", args: ["--no-regression"], judge: judgeNoFail, note: "ไม่มี FAIL" },
  { s: "qc-svc-d.13", args: ["--no-regression"], judge: judgeNoFail, note: "ไม่มี FAIL" },
  { s: "qc-svc-smoke" },
];
{
  const hasWork = typeof dormL.mod?.proposeMeterReading === "function" && typeof dormL.mod?.meterProposals === "function";
  const why = !hasWork ? "ยังไม่มีงานของใบ (proposeMeterReading / meterProposals) — regression รันเมื่อมีงาน" : NO_REG ? "--no-regression / SVC_D14_NO_REGRESSION=1" : "";
  for (const [i, g] of REG.entries()) {
    const id = `G-${i + 1}`;
    const name = `${g.s}${g.args?.length ? ` ${g.args.join(" ")}` : ""}${g.note ? ` (${g.note})` : " exit 0"}`;
    if (why) { skip(id, name, why); continue; }
    if (!existsSync(join(ROOT, "scripts", `${g.s}.mts`))) { record(id, name, "FAIL", "ไม่มีไฟล์ชุด", "CRITICAL"); continue; }
    const t = Date.now();
    const r = spawnSync("pnpm", ["exec", "tsx", `scripts/${g.s}.mts`, ...(g.args ?? [])], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, timeout: 60 * 60_000 });
    const all = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
    const log = `/tmp/svc-d14-reg-${g.s}.log`;
    try { writeFileSync(log, all); } catch { /* ไม่เป็นไร */ }
    const pass = g.judge ? g.judge(all, r.status) : r.status === 0;
    const tail = all.split("\n").filter((l) => /ผ่าน|JSON_SUMMARY|หยุด|❌|Error/.test(l)).slice(-2).join(" ¦ ").slice(0, 220);
    record(id, `${name} (${Math.round((Date.now() - t) / 1000)} วิ)`, pass ? "PASS" : "FAIL", pass ? "" : `exit=${r.status ?? r.signal} · ${tail} · log ${log}`, "CRITICAL");
  }
}

globalThis.fetch = REAL_FETCH;
try { await prisma.$disconnect(); } catch { /* ไม่เป็นไร */ }
const failed = cks.filter((c) => c.res === "FAIL");
const skipped = cks.filter((c) => c.res === "SKIP");
const passed = cks.length - failed.length - skipped.length;
console.log(`\n===== QC SVC D.14 · AI อ่านเลขมิเตอร์ =====\nผ่าน ${passed}/${cks.length}${skipped.length ? ` (SKIP ${skipped.length})` : ""}`);
console.log(`FINDINGS: CRITICAL ${failed.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${failed.filter((c) => c.sev === "MAJOR").length} · MINOR ${failed.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), findings: [...failed, ...skipped].map((c) => c.id) })}`);
// รับใบ = ผ่านทุกข้อ (SKIP ที่ยอมได้ระหว่างทำ: G-* เมื่อ --no-regression · V-1 ไม่มี QC_BASE · Q-* svcqc ยังไม่มีฉาก D.6 · S-1 หลัง merge — ผู้คุมรันซ้ำครบก่อนรับ)
process.exit(failed.length + skipped.length > 0 ? 1 : 0);
