// QC — SVC D.16 · แจ้งซ่อม → บอร์ดงาน → LINE (ผู้เช่าแจ้งในพอร์ทัล/เมนู ⇒ การ์ด `dorm.repair#<id>` ผ่านสะพาน ⇒ การ์ดเสร็จ ⇒ สถานะ ⇒ LINE ⇒ ให้คะแนน · มือถือช่าง หอ 13ค)
// oracle ของผู้เขียนข้อสอบ — builder ห้ามแก้ไฟล์นี้ (แย้ง = wo-notes)
// สัญญา: ledger/svc-briefs/svc-brief-d.16.md (§2 มติ · §3 สัญญาโค้ด · §4 สะพาน · §5 DOM · §6 หน้า · §8 ฉาก · §11 คำขอเคาะ) · ledger/SVC-MASTER-PLAN.md แถว D.16
//        CC §4.4 (notifyCustomer + precheck) §4.5 (signLink) §7 (dorm.repair.created/done) §8 (dorm.repair.manage) · DH A10 + ภาคผนวก ก หอ #59 #60 #61 #64
//
// กลุ่มข้อ:
//   S  โครงสร้าง/ไฟล์/ทะเบียน event 3 ที่/สะพานบอร์ดงาน/สิทธิ์ออกจาก planned/งานตามเวลา/หน้า/สุขอนามัยโค้ด (+ S-1/S-2/S-18 git ท้ายไฟล์ = ตอนรับใบ)
//   PC ตัวควบคุม (เขียวก่อนมีงาน): ฉาก · createCardFromExternal กันซ้ำ · moveCard ยิง event · notifyCustomer repairDone · privateFileUrl · ขอบเขตอาคาร · สัญญา live · rate · ค่าตั้ง #59/#60
//   R  ผู้เช่าแจ้งซ่อม (พอร์ทัล): แถว/รูปส่วนตัว/event · คีย์ซ้ำ = แถวเดียว · พร้อมกันหลายโพรเซส · input/ไฟล์ผิด · token ผิดทุกแบบ/สัญญาจบ = ไม่พบเดียวกัน (X7) · rate · เพดานงานค้าง
//   K  การ์ด: 1 ใบต่อคำแจ้ง (ซ้ำ/พร้อมกัน/งานกวาด) · บอร์ดตามชื่อในค่าตั้ง #59 · ไม่มีบอร์ด = ไม่มีการ์ด แล้วงานกวาดเติมทีหลัง · ผู้รับผิดชอบตามหมวด
//      · ย้ายการ์ด ⇒ กำลังซ่อม · การ์ดเสร็จ ⇒ DONE + event + LINE ครั้งเดียว (ซ้ำ/เปิดใหม่/ปิดซ้ำ) · ช่างกดเสร็จ ⇒ การ์ดเข้าคอลัมน์เสร็จ · กันการ์ดปลอมข้ามร้าน · งานกวาดตามการ์ดที่เสร็จเงียบ
//   N  LINE ซ่อมเสร็จ: ข้อความ/ปุ่มลิงก์ให้คะแนน · สัญญาจบ = ไม่ส่ง · ยังไม่เสร็จ = ไม่ส่ง · เวลาเงียบ + งานส่งซ้ำ
//   T  ให้คะแนน: ครั้งเดียว (พร้อมกัน = 1) · ค่าผิด · ยังไม่เสร็จ · ข้ามสัญญา = ไม่พบเดียวกัน
//   X  ขอบเขตพนักงาน: ข้ามร้าน/หน่วย/อาคาร/ไม่มีสิทธิ์ ⇒ ไม่พบเดียวกันทุกไบต์ · รายการตามอาคาร · พอร์ทัลข้ามสัญญา/ผู้เช่าใหม่ห้องเดิม
//   P  postback dorm.repair · F รูปส่วนตัว X10 · U DOM (พอร์ทัล · รายการ · มือถือช่าง) · J งานตามเวลา (กวาดการ์ด/ส่งซ้ำ — keyset ไม่อดอยาก · X5 · จำกัดร้าน)
//   M  PII/ข้อความ/ไม่ออกนอกเครื่อง · Z ล้าง · Q ฉาก svcqc · V ภาพ (QC_BASE) · G regression (หลังล้าง)
//
// 🔴 ไม่ยิง LINE จริง: ตัวจำลอง (node:http 127.0.0.1) + LINE_API_BASE + ครอบ fetch (นอกเครื่อง = บล็อก) · โพรเซสลูกได้ env เดียวกัน
// 🔴 APP_URL = https://qc-d16.invalid ในโพรเซสนี้ · ร้านทดสอบ slug `qc-svc-d16-*` · ผู้ใช้ `svc-d16-*@shark.local` · ลบใน finally (+ กวาดค้างตอนเริ่ม) · ไม่เขียนค่าตั้งของร้าน svcqc
// 🔴 วันที่ตายตัวใน ก.ย. 2569 (อดีตเทียบนาฬิกาจริง — แถว ServiceMessageLog เขียนด้วยเวลาจริงจึงอยู่ใน "3 วันล่าสุด" ของ now ที่ฉีดเสมอ)
// รัน: cd /root/projects/shark-svc-l3 && bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-d.16.mts [--no-regression]
//      (ห้าม timeout ครอบ · ห้าม kill กลางคัน · `--no-regression` = G เป็น SKIP · QC_BASE=http://127.0.0.1:<port> เปิด V-1)
/* eslint-disable @typescript-eslint/no-explicit-any */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { createHash, randomBytes, randomInt } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { isDeepStrictEqual } from "node:util";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
import { SQC_TENANT, SQC_UNITS, SQC_USERS, SQC_DORM_REPAIR_SCENE, SQC_VISUAL_SPECS } from "./svc-qc-data.mjs";

type Any = any;
const SELF = fileURLToPath(import.meta.url);
const ROOT = join(dirname(SELF), "..");
const LABEL = "qc-svc-d.16";
const NO_REG = process.argv.includes("--no-regression") || process.env.SVC_D16_NO_REGRESSION === "1";
const ORIGIN = "https://qc-d16.invalid";
const SRC_PREFIX = "dorm.repair#";
const F = {
  repair: "src/lib/modules/dorm/repair.ts",
  dormIndex: "src/lib/modules/dorm/index.ts",
  bridges: "src/lib/platform/kanban-bridges.ts",
  pubPage: "src/app/(store)/d/[token]/repair/page.tsx",
  pubActions: "src/app/(store)/d/[token]/repair/actions.ts",
  pubComp: "src/components/dorm/portal/DormPortalRepair.tsx",
  page: "src/app/app/u/[unitSlug]/dorm/repairs/page.tsx",
  jobPage: "src/app/app/u/[unitSlug]/dorm/repairs/[repairId]/page.tsx",
  actions: "src/app/app/u/[unitSlug]/dorm/repairs/actions.ts",
  listComp: "src/components/dorm/DormRepairs.tsx",
  jobComp: "src/components/dorm/DormRepairJob.tsx",
  scene: "scripts/svc-qc-repair-scene.mts",
  line: "src/lib/platform/dorm-line.ts",
  perms: "src/lib/core/permissions.ts",
  consumers: "src/lib/outbox-consumers.ts",
  autoLabels: "src/lib/automation/labels.ts",
  minute: "src/lib/platform/minute-jobs.ts",
  unitHome: "src/app/app/u/[unitSlug]/page.tsx",
  fitness: "scripts/fitness.mts",
} as const;

loadSvcQcEnv(LABEL); // ด่านฐาน: ไม่ใช่ qc-svc ⇒ exit 4 ก่อนแตะฐาน
if (process.env.CI) { console.error(`🔴 ${LABEL}: ห้าม export CI (with-gate-lock ข้าม flock)`); process.exit(4); }
if (process.env.APP_ENV === "production") { console.error(`🔴 ${LABEL}: APP_ENV=production`); process.exit(4); }
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 300);
const PNG_SIG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** รูป PNG ที่ผ่าน magic (เนื้อกำหนดจาก seed) */
const pngOf = (seed: string): Uint8Array => Uint8Array.from(Buffer.concat([Buffer.from(PNG_SIG), createHash("sha256").update(`qc-d16:${seed}`).digest(), createHash("sha256").update(seed).digest()]));
const png = (seed: string) => ({ data: pngOf(seed), contentType: "image/png" });
const svg = () => ({ data: Uint8Array.from(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>')), contentType: "image/svg+xml" });
const fakeJpeg = () => ({ data: Uint8Array.from(Buffer.from("not-a-jpeg-at-all-0123456789")), contentType: "image/jpeg" });
const noopDeps = { put: async () => {}, del: async () => 200 };
const b64 = (u: Uint8Array) => Buffer.from(u).toString("base64");
const unb64 = (s: string) => Uint8Array.from(Buffer.from(s, "base64"));

// ═══════════════ โหมดโพรเซสลูก (`--child <base64 JSON>`) — ยิงพร้อมกันจากโพรเซสแยก (ไม่สร้างข้อมูล/ไม่ล้าง) ═══════════════
{
  const ix = process.argv.indexOf("--child");
  if (ix >= 0) {
    let out: unknown[] = [];
    try {
      const job = JSON.parse(Buffer.from(process.argv[ix + 1] ?? "", "base64url").toString("utf8")) as { op: string; items: Any[]; at: number };
      const D = (await import("@/lib/modules/dorm" as string)) as Any;
      const fileIn = (f: Any) => (f ? { data: unb64(f.data), contentType: f.contentType } : undefined);
      const wait = job.at - Date.now();
      const runOne = async (x: Any): Promise<unknown> => {
        if (job.op === "submit") {
          if (typeof D.submitPortalRepair !== "function") return { childFail: "ไม่มี submitPortalRepair" };
          return D.submitPortalRepair(x.token, { ...x.input, photos: (x.input.photos ?? []).map(fileIn) }, { clientKey: x.clientKey, now: new Date(x.now), deps: noopDeps });
        }
        if (job.op === "complete") {
          if (typeof D.completeDormRepair !== "function") return { childFail: "ไม่มี completeDormRepair" };
          return D.completeDormRepair(x.ctx, x.input, { now: new Date(x.now), deps: noopDeps });
        }
        if (job.op === "rate") {
          if (typeof D.ratePortalRepair !== "function") return { childFail: "ไม่มี ratePortalRepair" };
          return D.ratePortalRepair(x.token, x.input, { clientKey: x.clientKey, now: new Date(x.now) });
        }
        if (job.op === "sweep") {
          const br = (await import("@/lib/platform/kanban-bridges" as string)) as Any;
          if (typeof br.sweepDormRepairCards !== "function") return { childFail: "ไม่มี sweepDormRepairCards" };
          return br.sweepDormRepairCards(new Date(x.now), { tenantId: x.tenantId, budgetMs: 90_000 });
        }
        if (job.op === "consume") { await (await import("@/lib/outbox-consumers" as string)).consumers[x.type](x.evt); return { ok: true }; }
        return { childFail: `op ${job.op}` };
      };
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      out = await Promise.all(job.items.map(async (x) => { try { return await runOne(x); } catch (e) { return { threw: errMsg(e) }; } }));
    } catch (e) { out = [{ childFail: errMsg(e) }]; }
    console.log(`CHILD_RESULT ${JSON.stringify(out)}`);
    try { const { prisma } = (await import("@/lib/core/db" as string)) as Any; await prisma.$disconnect(); } catch { /* ไม่เป็นไร */ }
    process.exit(0);
  }
}

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
const PHONE_RE = /(?<![0-9A-Za-z])(\+?66|0)[689]\d{8}(?![0-9A-Za-z])/;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const tryImport = async (spec: string): Promise<{ mod: Any; err: string }> => { try { return { mod: await import(spec), err: "" }; } catch (e) { return { mod: null, err: errMsg(e) }; } };
const loadIf = async (rel: string) => (existsSync(join(ROOT, rel)) ? tryImport(pathToFileURL(join(ROOT, rel)).href) : { mod: null, err: `ยังไม่มีไฟล์ «${rel}»` });
const fnOf = (load: { mod: Any; err: string }, name: string, rel: string): ((...a: Any[]) => Any) => {
  const f = load.mod?.[name];
  if (typeof f !== "function") throw new AssertFail(load.mod ? `«${rel}» ยังไม่มี export ${name}` : `โหลด «${rel}» ไม่ได้: ${load.err}`);
  return f;
};
const valOf = (load: { mod: Any; err: string }, name: string, rel: string): Any => {
  const v = load.mod?.[name];
  if (v === undefined) throw new AssertFail(load.mod ? `«${rel}» ยังไม่มี export ${name}` : `โหลด «${rel}» ไม่ได้: ${load.err}`);
  return v;
};
const codeOf = (r: Any) => (r?.ok === true ? "ok" : r?.code ?? (r?.threw ? `threw:${r.threw}` : r?.childFail ? `child:${r.childFail}` : J(r)?.slice(0, 80)));
const failIs = (r: Any, code: string) => r?.ok === false && r?.code === code && typeof r?.reason === "string" && THAI.test(r.reason);

// ═══════════════ ตัวจำลอง LINE + ครอบ fetch ═══════════════
process.env.APP_URL = ORIGIN;
type FakeReq = { method: string; path: string; auth: string; json: Any; status: number };
const FAKE: FakeReq[] = [];
const server = createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on("data", (c: Buffer) => chunks.push(c));
  req.on("end", () => {
    const raw = Buffer.concat(chunks);
    const path = (req.url ?? "").split("?")[0] ?? "";
    let json: Any = null;
    if (String(req.headers["content-type"] ?? "").includes("json")) { try { json = JSON.parse(raw.toString("utf8")); } catch { json = null; } }
    const rec: FakeReq = { method: req.method ?? "", path, auth: String(req.headers.authorization ?? ""), json, status: 0 };
    FAKE.push(rec);
    const send = (code: number, obj: unknown) => { rec.status = code; if (res.writableEnded) return; res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
    if (req.method === "POST" && path === "/v2/bot/message/push") return send(200, { sentMessages: [{ id: `fm${FAKE.length}` }] });
    if (req.method === "POST" && path === "/v2/bot/message/reply") return send(200, { sentMessages: [{ id: `fr${FAKE.length}` }] });
    if (req.method === "GET" && path.startsWith("/v2/bot/profile/")) return send(200, { displayName: "ผู้เช่าคิวซี", userId: path.split("/").pop() });
    return send(200, {});
  });
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
const FAKE_BASE = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const LINE_API_BASE_SAVED = process.env.LINE_API_BASE;
process.env.LINE_API_BASE = FAKE_BASE;
const REAL_FETCH = globalThis.fetch;
const BLOCKED: string[] = [];
globalThis.fetch = (async (input: Any, init?: Any): Promise<Response> => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : String(input?.url ?? "");
  let host = "";
  try { host = new URL(url).hostname; } catch { /* ไม่ใช่ URL */ }
  if (host === "127.0.0.1" || host === "localhost" || host.endsWith(".neon.tech")) return REAL_FETCH(input, init);
  BLOCKED.push(host.slice(0, 80));
  return new Response(JSON.stringify({ message: "blocked by qc" }), { status: 503, headers: { "content-type": "application/json" } });
}) as typeof fetch;
const mark = () => FAKE.length;
const pushes = (m = 0) => FAKE.slice(m).filter((r) => r.method === "POST" && r.path === "/v2/bot/message/push");
const pushesTo = (ext: string, m = 0) => pushes(m).filter((r) => r.json?.to === ext);
const textOfPush = (r: FakeReq | undefined): string => J(r?.json?.messages ?? "");

// ═══════════════ โหลดโมดูล (หลัง env) ═══════════════
const repairL = await loadIf(F.repair);
const dormL = await tryImport("@/lib/modules/dorm");
const brL = await loadIf(F.bridges);
const lineL = await loadIf(F.line);
const dbL = await tryImport("@/lib/core/db");
const prisma: Any = dbL.mod?.prisma;
if (!prisma) { console.error(`🔴 ${LABEL}: โหลด prisma ไม่ได้ (${dbL.err})`); process.exit(4); }
const SL = (await tryImport("@/lib/core/signed-link")).mod as Any;
const PB = (await tryImport("@/lib/platform/postback-routes")).mod as Any;
const NC = (await tryImport("@/lib/platform/notify-customer")).mod as Any;
const SET = (await tryImport("@/lib/core/settings")).mod as Any;
const STO = (await tryImport("@/lib/storage/service")).mod as Any;
const RL = (await tryImport("@/lib/core/rate-limit-db")).mod as Any;
const OC = (await tryImport("@/lib/outbox-consumers")).mod as Any;
const PERM = (await tryImport("@/lib/core/permissions")).mod as Any;
const KL = (await tryImport("@/lib/modules/kanban/links")).mod as Any;
const KM = (await tryImport("@/lib/modules/kanban/moves")).mod as Any;
const PRISMA_NS = ((await tryImport("@prisma/client")).mod as Any)?.Prisma;
const FIDX = F.dormIndex;
const D = {
  submit: () => fnOf(dormL, "submitPortalRepair", FIDX),
  load: () => fnOf(dormL, "loadPortalRepairs", FIDX),
  rate: () => fnOf(dormL, "ratePortalRepair", FIDX),
  url: () => fnOf(dormL, "repairPortalUrl", FIDX),
  list: () => fnOf(dormL, "listDormRepairs", FIDX),
  job: () => fnOf(dormL, "dormRepairJob", FIDX),
  complete: () => fnOf(dormL, "completeDormRepair", FIDX),
  notice: () => fnOf(dormL, "sendRepairDoneNotice", FIDX),
  onDone: () => fnOf(dormL, "onRepairDone", FIDX),
  jobs: () => fnOf(dormL, "runDormRepairJobs", FIDX),
  NF: (): string => { const t = valOf(dormL, "REPAIR_NF_REASON", FIDX); ok(typeof t === "string" && THAI.test(t), "REPAIR_NF_REASON ต้องเป็นข้อความไทย"); return t; },
};
const BR = {
  onCreated: () => fnOf(brL, "onDormRepairCreated", F.bridges),
  onDone: () => fnOf(brL, "onDormRepairDone", F.bridges),
  onMoved: () => fnOf(brL, "onDormRepairCardMoved", F.bridges),
  onCompleted: () => fnOf(brL, "onDormRepairCardCompleted", F.bridges),
  sweep: () => fnOf(brL, "sweepDormRepairCards", F.bridges),
};
const PORTAL_RE = /https:\/\/qc-d16\.invalid\/d\/([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\/repair(?:\?r=([A-Za-z0-9_-]+))?/g;
const repairLinks = (v: unknown): { token: string; r: string | null; sub: { tenantId: string; subjectId: string } | null }[] =>
  [...J(v).matchAll(PORTAL_RE)].map((m) => ({ token: m[1], r: m[2] ?? null, sub: SL?.verifyLink?.(m[1], "dorm.portal") ?? null }));

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
  const soft = async (f: () => Promise<unknown>) => { try { await f(); } catch { /* ไม่เป็นไร */ } };
  await soft(() => prisma.accountJournalEntry.updateMany({ where: { tenantId: { in: tids } }, data: { reversalOfId: null } }));
  await soft(() => prisma.accountDocument.updateMany({ where: { tenantId: { in: tids } }, data: { sourceDocId: null, replacedById: null, sourcePaymentId: null } }));
  await soft(() => prisma.accountLedger.updateMany({ where: { tenantId: { in: tids } }, data: { parentId: null } }));
  let pending = [...(await tablesWithTenant())];
  for (let pass = 0; pass < 14 && pending.length; pass++) {
    const next: string[] = [];
    for (const t of pending) { try { await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, tids); } catch { next.push(t); } }
    pending = next;
  }
  if (pending.length) console.log(`  ⚠️ cleanup: ลบไม่หมด ${pending.join(", ")}`);
  try { await prisma.tenant.deleteMany({ where: { id: { in: tids } } }); } catch (e) { console.log(`  ⚠️ cleanup tenant: ${errMsg(e)}`); }
}
const STAMP = `${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;
const CK = (k: string) => `qc-d16-${STAMP}-${k}`;
const K = (k: string) => `qcd16${STAMP}${k}`.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80);
async function cleanupMisc() {
  try { await prisma.user.deleteMany({ where: { email: { startsWith: "svc-d16-" } } }); } catch (e) { console.log(`  ⚠️ ลบ user: ${errMsg(e)}`); }
  try { await prisma.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE key LIKE $1`, `%qc-d16-${STAMP}%`); } catch (e) { console.log(`  ⚠️ ลบ rate bucket: ${errMsg(e)}`); }
}
const parkOutbox = async (tids: string[]) => { await prisma.$executeRawUnsafe(`UPDATE "OutboxEvent" SET "availableAt" = now() + interval '2 days' WHERE "tenantId" = ANY($1::text[]) AND status::text = 'PENDING'`, tids); };

// ═══════════════ ยิงพร้อมกันจากโพรเซสลูก ═══════════════
const SYNC_MS = 13_000;
async function fanout(op: string, groups: Any[][], at: number): Promise<Any[]> {
  const outs = await Promise.all(groups.map((items) => new Promise<Any[]>((resolve) => {
    const job = { op, items, at };
    const child = spawn(process.execPath, [...process.execArgv, SELF, "--child", Buffer.from(JSON.stringify(job)).toString("base64url")], { cwd: ROOT, env: process.env });
    let buf = "";
    child.stdout.on("data", (d) => { buf += String(d); });
    child.stderr.on("data", (d) => { buf += String(d); });
    child.on("close", (code) => {
      const m = /CHILD_RESULT (\[.*\])/.exec(buf);
      try { resolve(m ? (JSON.parse(m[1]) as Any[]) : items.map(() => ({ childFail: `exit=${code} ${buf.split("\n").slice(-3).join(" | ").slice(0, 200)}` }))); }
      catch { resolve(items.map(() => ({ childFail: "อ่านผลลูกไม่ได้" }))); }
    });
  })));
  return outs.flat();
}
const atIn = (ms = SYNC_MS) => Date.now() + ms;
const inProcAt = async <T,>(at: number, calls: (() => Promise<T>)[]) => { const w = at - Date.now(); if (w > 0) await sleep(w); return Promise.all(calls.map(async (c) => { try { return await c(); } catch (e) { return { threw: errMsg(e) } as Any; } })); };
const badOf = (rs: Any[]) => rs.filter((r) => r?.threw || r?.childFail || /P2028|P2024|P2002|40P01|Unique constraint/i.test(J(r)));

// ═══════════════ ฉาก (วันที่ตายตัว · เวลาไทย = UTC+7) ═══════════════
const T0 = "2026-09-01T03:00:00.000Z";            // 1 ก.ย. 10:00 ไทย — แจ้งซ่อม
const T1 = "2026-09-02T03:00:00.000Z";            // 2 ก.ย. 10:00 ไทย — ช่างปิดงาน/ให้คะแนน
const T_QUIET = "2026-09-02T15:00:00.000Z";       // 2 ก.ย. 22:00 ไทย (เวลาเงียบ 21–08)
const T_QUIET_EARLY = "2026-09-03T00:30:00.000Z"; // 3 ก.ย. 07:30 ไทย (ยังเงียบ)
const T_QUIET_END = "2026-09-03T01:05:00.000Z";   // 3 ก.ย. 08:05 ไทย
const T_SWEEP = "2026-09-10T03:00:00.000Z";       // 10 ก.ย. — งานกวาด (หน้าต่าง 14 วัน ⇒ แถวตั้งแต่ 27 ส.ค.)
const dbDate = (ymd: string) => new Date(`${ymd}T00:00:00Z`);
const tenantIds: string[] = [];
const PHONES: string[] = [];
const NAMES: string[] = [];
const TEXTS: string[] = [];
let ready = false;
const needReady = () => ok(ready, "ฉากข้อมูลทดสอบสร้างไม่สำเร็จ (ดู PC-1)");
const ids: Record<string, string> = {};
const R: Record<string, string> = {};          // ห้อง → roomId
const C: Record<string, { id: string; ext: string; partyId: string | null; conn: string }> = {};
const RP: Record<string, string> = {};         // ชื่อคำแจ้งในข้อสอบ → repairId
const SNAP: Record<string, Any> = {};
let NF_STAFF = "";
let NF_PORTAL = "";

console.log(`\n(ตัวจำลอง LINE ${FAKE_BASE} · APP_URL ${ORIGIN})`);

try {
  const stale = await prisma.tenant.findMany({ where: { slug: { startsWith: "qc-svc-d16-" } }, select: { id: true } });
  if (stale.length) { console.log(`(กวาด tenant ค้างจากรอบก่อน ${stale.length})`); await cleanup(stale.map((t: { id: string }) => t.id)); }
  await cleanupMisc();

  // ═══════════════ S (ไม่แตะฐาน) ═══════════════
  console.log("\n── S โครงสร้าง ──");
  const NEW_FILES = [F.repair, F.pubPage, F.pubActions, F.pubComp, F.page, F.jobPage, F.actions, F.listComp, F.jobComp, F.scene];
  await st("S-3", "มีไฟล์ใหม่ของใบครบ 10 ไฟล์ (§1)", () => { const miss = NEW_FILES.filter((f) => !existsSync(join(ROOT, f))); ok(!miss.length, `ขาด ${miss.join(", ")}`); });
  await st("S-4", "facade @/lib/modules/dorm: 12 ฟังก์ชัน + REPAIR_SOURCE_PREFIX = dorm.repair# · REPAIR_RATE · REPAIR_NF_REASON (ไทย) · สะพาน 5 ฟังก์ชันใน kanban-bridges.ts", () => {
    const names = ["submitPortalRepair", "loadPortalRepairs", "ratePortalRepair", "repairPortalUrl", "listDormRepairs", "dormRepairJob", "completeDormRepair", "applyRepairCardState", "linkRepairCard", "sendRepairDoneNotice", "onRepairDone", "runDormRepairJobs"];
    const miss = names.filter((n) => typeof dormL.mod?.[n] !== "function");
    ok(!miss.length, `facade ขาด ${miss.join(", ")} (${dormL.err || repairL.err || "โหลดได้"})`);
    eq(dormL.mod.REPAIR_SOURCE_PREFIX, SRC_PREFIX, "REPAIR_SOURCE_PREFIX");
    eq(J(dormL.mod.REPAIR_RATE), J({ submit: { limit: 10, windowMs: 600_000 } }), "REPAIR_RATE");
    ok(typeof dormL.mod.REPAIR_NF_REASON === "string" && THAI.test(dormL.mod.REPAIR_NF_REASON), "REPAIR_NF_REASON");
    const bmiss = ["onDormRepairCreated", "onDormRepairDone", "onDormRepairCardMoved", "onDormRepairCardCompleted", "sweepDormRepairCards"].filter((n) => typeof brL.mod?.[n] !== "function");
    ok(!bmiss.length, `สะพานขาด ${bmiss.join(", ")} (${brL.err || "โหลดได้"})`);
  });
  await st("S-5", "สิทธิ์ dorm.repair.manage: โมดูล dorm ป้ายไทยเดิม · ออกจาก planned · repair.ts เรียกคีย์จริง", () => {
    const p = (PERM?.PERMISSIONS ?? []).find((x: Any) => x.key === "dorm.repair.manage");
    ok(p && p.module === "dorm" && THAI.test(p.label ?? ""), `ไม่มี/ป้ายผิด ${J(p)}`);
    ok(!p.planned, "ยังอยู่ใน planned");
    ok(/["']dorm\.repair\.manage["']/.test(stripComments(read(F.repair))), "repair.ts ไม่เรียกคีย์ dorm.repair.manage");
  }, "MAJOR");
  await st("S-6", "event dorm.repair.created + dorm.repair.done ลง consumers: created → สะพาน onDormRepairCreated (dynamic import kanban-bridges) · done → facade onRepairDone + สะพาน onDormRepairDone", () => {
    const bad: string[] = [];
    for (const ev of ["dorm.repair.created", "dorm.repair.done"]) if (typeof OC?.consumers?.[ev] !== "function") bad.push(`consumer ${ev}`);
    const s = stripComments(read(F.consumers));
    const blk = (ev: string) => { const i = s.search(new RegExp(`["']${ev.replace(/\./g, "\\.")}["']\\s*:`)); return i >= 0 ? s.slice(i, i + 500) : ""; };
    const c = blk("dorm.repair.created"), d = blk("dorm.repair.done");
    if (!/onDormRepairCreated/.test(c)) bad.push(`บล็อก created: ${c.slice(0, 100).replace(/\s+/g, " ")}`);
    if (!/onRepairDone/.test(d) || !/onDormRepairDone/.test(d)) bad.push(`บล็อก done: ${d.slice(0, 140).replace(/\s+/g, " ")}`);
    if (!/["']onDormRepairCreated["']/.test(s) || !/kanban-bridges/.test(s)) bad.push("ไม่ผ่าน kanbanBridge (dynamic import kanban-bridges)");
    ok(!bad.length, bad.join(" · "));
  }, "MAJOR");
  await st("S-6b", "ป้าย automation (ไทย) + webhooks (ได้จาก spread) ของ 2 event", async () => {
    const al = (await import("@/lib/automation/labels" as string)) as Any;
    const wl = (await import("@/lib/webhooks/labels" as string)) as Any;
    const bad: string[] = [];
    for (const ev of ["dorm.repair.created", "dorm.repair.done"]) {
      const lab = Array.isArray(al.AUTOMATION_EVENTS) ? al.AUTOMATION_EVENTS.find((e: Any) => e.value === ev) : null;
      if (!lab || !THAI.test(lab.label ?? "")) bad.push(`automation ${ev}`);
      if (!(Array.isArray(wl.WEBHOOK_EVENTS) && wl.WEBHOOK_EVENTS.filter((e: Any) => e.value === ev).length === 1)) bad.push(`webhooks ${ev} (ต้องมี 1 แถว)`);
    }
    ok(!bad.length, bad.join(" · "));
  }, "MAJOR");
  await st("S-7", "kanban.card.moved → onDormRepairCardMoved · kanban.card.completed → onDormRepairCardCompleted (ต่อท้ายด้วย compose · ขาออกเดิม kanbanOutbound/memberBridge/crmKanbanCardCompleted คงอยู่)", () => {
    const s = stripComments(read(F.consumers));
    const blk = (ev: string) => { const i = s.search(new RegExp(`["']${ev.replace(/\./g, "\\.")}["']\\s*:`)); return i >= 0 ? s.slice(i, i + 600) : ""; };
    const mv = blk("kanban.card.moved"), cp = blk("kanban.card.completed");
    const bad: string[] = [];
    if (!/onDormRepairCardMoved/.test(mv)) bad.push("moved ไม่เรียก onDormRepairCardMoved");
    if (!/onDormRepairCardCompleted/.test(cp)) bad.push("completed ไม่เรียก onDormRepairCardCompleted");
    if (!/kanbanOutbound\(\s*["']cardCompleted["']\s*\)/.test(cp) || !/memberBridge\(\s*["']onKanbanCardCompleted["']\s*\)/.test(cp) || !/crmKanbanCardCompleted/.test(cp)) bad.push("completed ทำขาออกเดิมหาย");
    ok(!bad.length, bad.join(" · "));
  }, "MAJOR");
  await st("S-8", "minute-jobs: dorm.repair (facade → runDormRepairJobs) + dorm.repair.cards (kanban-bridges → sweepDormRepairCards) · lazy import · ส่ง budget/signal", () => {
    const mj = stripComments(read(F.minute));
    const blk = (name: string) => { const i = mj.search(new RegExp(`name:\\s*["']${name.replace(/\./g, "\\.")}["']`)); return i >= 0 ? mj.slice(i, i + 500) : ""; };
    const a = blk("dorm.repair"), b = blk("dorm.repair.cards");
    ok(a && /import\(\s*["']@\/lib\/modules\/dorm["']\s*\)/.test(a) && /runDormRepairJobs\s*\(/.test(a) && /signal/.test(a), `dorm.repair: ${a.slice(0, 160).replace(/\s+/g, " ")}`);
    ok(b && /import\(\s*["']@\/lib\/platform\/kanban-bridges["']\s*\)/.test(b) && /sweepDormRepairCards\s*\(/.test(b) && /signal/.test(b), `dorm.repair.cards: ${b.slice(0, 160).replace(/\s+/g, " ")}`);
  }, "MAJOR");
  await st("S-9", "หน้า /d/[token]/repair: server · loadPortalRepairs → notFound · force-dynamic · noindex · no-referrer · clientKey จาก IP · actions 'use server' (submitRepairAction · rateRepairAction) ไม่รับร้าน/หน่วย/สัญญาจากฟอร์ม · ไม่แตะ session/prisma", () => {
    const raw = read(F.pubPage), s = stripComments(raw), araw = read(F.pubActions), a = stripComments(araw);
    ok(s && a, "ยังไม่มีไฟล์หน้า/actions สาธารณะ");
    const bad: string[] = [];
    if (/^\s*["']use client["']/.test(raw)) bad.push("page use client");
    if (!/loadPortalRepairs\s*\(/.test(s) || !/notFound\s*\(/.test(s)) bad.push("page ไม่เรียก loadPortalRepairs/notFound");
    if (!/force-dynamic/.test(s) || !/index:\s*false/.test(s) || !/referrer:\s*["']no-referrer["']/.test(s)) bad.push("force-dynamic/noindex/referrer");
    if (!/x-real-ip|portalClientKey/.test(s) || !/x-real-ip|portalClientKey/.test(a)) bad.push("clientKey ไม่อ่าน IP");
    if (!/^\s*["']use server["']/.test(araw)) bad.push("actions ไม่มี use server");
    if (/export\s+(const|let|type|interface|default|class|function\s)/.test(a.replace(/export\s+async\s+function/g, ""))) bad.push("actions export อื่น");
    for (const n of ["submitRepairAction", "rateRepairAction"]) if (!new RegExp(`export\\s+async\\s+function\\s+${n}\\b`).test(a)) bad.push(`ไม่มี ${n}`);
    if (/get\(\s*["'](tenantId|unitId|leaseId|partyId|roomId)["']\s*\)/.test(a)) bad.push("actions อ่านร้าน/หน่วย/สัญญาจากฟอร์ม");
    if (/\bdeps\s*:|\bput\s*:/.test(a)) bad.push("actions ส่ง deps");
    for (const x of [s, a]) if (/requireUnit|getSession|requireMembership|@\/lib\/core\/db|@prisma\//.test(x)) { bad.push("แตะ session/prisma"); break; }
    ok(!bad.length, bad.join(" · "));
  }, "MAJOR");
  await st("S-10", "จอพนักงาน: page รายการ + page มือถือช่าง (requireUnit · DORM · listDormRepairs/dormRepairJob → notFound) · actions 'use server' completeRepairAction เท่านั้น (ร้าน/ผู้กระทำจาก session) · คอมโพเนนต์ 3 ตัว 'use client' + default export · ไม่ import โมดูล server", () => {
    const pg = stripComments(read(F.page)), jp = stripComments(read(F.jobPage)), raw = read(F.actions), a = stripComments(raw);
    const comps: [string, string][] = [["DormRepairs", read(F.listComp)], ["DormRepairJob", read(F.jobComp)], ["DormPortalRepair", read(F.pubComp)]];
    ok(pg && jp && a && comps.every(([, c]) => c), "ยังไม่มีไฟล์จอ");
    const bad: string[] = [];
    if (!/requireUnit\s*\(/.test(pg) || !/["']DORM["']/.test(pg) || !/listDormRepairs\s*\(/.test(pg) || !/notFound\s*\(/.test(pg)) bad.push("page: requireUnit/DORM/listDormRepairs/notFound");
    if (!/requireUnit\s*\(/.test(jp) || !/["']DORM["']/.test(jp) || !/dormRepairJob\s*\(/.test(jp) || !/notFound\s*\(/.test(jp)) bad.push("jobPage: requireUnit/DORM/dormRepairJob/notFound");
    if (!/^\s*["']use server["']/.test(raw)) bad.push("actions: ไม่มี use server");
    if (/export\s+(const|let|type|interface|default|class|function\s)/.test(a.replace(/export\s+async\s+function/g, ""))) bad.push("actions: export อื่น");
    if (!/export\s+async\s+function\s+completeRepairAction\b/.test(a)) bad.push("actions: ไม่มี completeRepairAction");
    if (!/requireUnit\s*\(/.test(a)) bad.push("actions: ไม่ใช้ requireUnit");
    if (/get\(\s*["'](tenantId|unitId|actorUserId|userId)["']\s*\)/.test(a)) bad.push("actions: อ่านร้าน/หน่วย/ผู้กระทำจากฟอร์ม");
    if (/\bdeps\s*:|\bput\s*:/.test(a)) bad.push("actions: ส่ง deps");
    for (const [n, c] of comps) {
      if (!/^\s*["']use client["']/.test(c) || !/export\s+default\b/.test(c)) bad.push(`${n}: use client/default export`);
      const imps = [...c.matchAll(/^\s*import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/gm)].filter((m) => !m[1]).map((m) => m[2]);
      const banned = imps.filter((x) => /^@prisma\//.test(x) || /^@\/lib\/(modules|platform|core\/db|core\/settings|payment|storage)/.test(x) || /^next\/(?!link$)/.test(x) || /actions$/.test(x));
      if (banned.length) bad.push(`${n} import ต้องห้าม ${banned.join(",")}`);
    }
    ok(!bad.length, bad.join(" · "));
  }, "MAJOR");
  await st("S-11", "repair.ts ใช้ชิ้นเดิม: tenantDb (ไม่ import prisma ดิบ) · notifyCustomer (dynamic import) + precheck · signLink/verifyLink · checkRateLimitDb · uploadFile private · privateFileUrl · emitOutbox · portalLiveLease · ขอบเขตอาคาร · ไม่ import บอร์ดงาน (การ์ดผ่านสะพานเท่านั้น) · ไม่ส่ง LINE ตรง", () => {
    const s = stripComments(read(F.repair));
    ok(s, "ยังไม่มี repair.ts");
    const need: [string, RegExp][] = [["tenantDb", /tenantDb\s*\(/], ["notifyCustomer", /notifyCustomer\s*\(/], ["import notify-customer", /import\(\s*["']@\/lib\/platform\/notify-customer["']\s*\)/], ["precheck", /precheck\s*[:(]/],
      ["signLink", /signLink\s*\(/], ["verifyLink", /verifyLink\s*\(/], ["checkRateLimitDb", /checkRateLimitDb\s*\(/], ["uploadFile", /uploadFile\s*\(/], ["private", /visibility:\s*["']private["']/],
      ["privateFileUrl", /privateFileUrl\s*\(/], ["emitOutbox", /emitOutbox\s*\(/], ["portalLiveLease", /portalLiveLease\s*\(/], ["ขอบเขตอาคาร", /dormVisibleRoomsFor|dormVisibleRoomIds|dormScopeFor|dormBuildingScope/]];
    const miss = need.filter(([, re]) => !re.test(s)).map(([n]) => n);
    const rawSrc = read(F.repair);
    const banned = [
      /import\s*\{[^}]*\bprisma\b[^}]*\}\s*from\s+["']@\/lib\/core\/db["']/.test(rawSrc) ? "import prisma ดิบ" : "",
      /["']@\/lib\/modules\/kanban|["']@\/lib\/platform\/kanban/.test(rawSrc) ? "import บอร์ดงาน" : "",
      /["']@\/lib\/platform\//.test(rawSrc.replace(/import\(\s*["']@\/lib\/platform\/notify-customer["']\s*\)/g, "")) ? "import platform อื่น" : "",
    ].filter(Boolean);
    const line = /\b(pushLineMessagesToContact|pushFlexToParty|sendLineToParty|pushToContact|replyFlex|replyLineMessages)\b|api(-data)?\.line\.me/.exec(s);
    ok(!miss.length && !banned.length && !line, `ขาด ${miss.join(", ") || "—"} · ${banned.join(",") || ""} ${line ? `ส่ง LINE ตรง ${line[0]}` : ""}`);
  }, "MAJOR");
  await st("S-12", "kanban-bridges.ts บล็อก SVC D.16: การ์ดผ่าน createCardFromExternal (sourceKey dorm.repair#) · ย้ายผ่าน moveCard/closeCard · ไม่แนบไฟล์ (attachments) · ไม่ import storage · ไม่เขียนตาราง DormRepair ตรง (ผ่าน facade) · ทุก export ใหม่เรียก integrationsFor ก่อน prisma หรือไม่อ้างถึงเลย (กติกา K3.3-S2.2)", () => {
    const src = read(F.bridges);
    const a = src.indexOf("SVC D.16 ▸"), b = src.indexOf("◂ SVC D.16");
    ok(a >= 0 && b > a, "ไม่มีบล็อก // SVC D.16 ▸ … // ◂ SVC D.16");
    const blk = stripComments(src.slice(a, b));
    const bad: string[] = [];
    if (!/createCardFromExternal\s*\(/.test(blk) || !/dorm\.repair#|REPAIR_SOURCE_PREFIX/.test(blk)) bad.push("ไม่สร้างการ์ดด้วย createCardFromExternal + sourceKey dorm.repair#");
    if (!/closeCard\s*\(|moveCard\s*\(/.test(blk)) bad.push("ไม่ย้ายการ์ดด้วย closeCard/moveCard");
    if (/attachments\s*:/.test(blk)) bad.push("แนบไฟล์เข้าการ์ด (ไฟล์ส่วนตัวห้ามไปเป็นไฟล์แนบสาธารณะ)");
    if (/@\/lib\/storage/.test(src)) bad.push("import storage");
    if (/dormRepair\.(update|updateMany|create|createMany|upsert|delete)/.test(blk) || /(UPDATE|INSERT INTO)\s+"DormRepair"/i.test(blk)) bad.push("เขียน DormRepair ตรง");
    const fns = stripComments(src).split(/export (?:const|async function) /).slice(1);
    const hs = fns.filter((f) => /integrationsFor|getIntegrations/.test(f));
    const wrong = hs.filter((f) => { const g = f.search(/getIntegrations|integrationsFor/); const p = f.search(/prisma\./); return p !== -1 && g > p; }).map((f) => f.slice(0, 30));
    if (wrong.length) bad.push(`สวิตช์หลัง prisma: ${wrong.join(" | ")}`);
    ok(!bad.length, bad.join(" · "));
  }, "MAJOR");
  await st("S-13", "ไม่มี any · ไม่มี getDay/getDate/getMonth/getHours/getFullYear ดิบ · ไม่มีคำต้องห้าม สคบ. ในไฟล์ใหม่ของใบ", () => {
    const files = NEW_FILES.filter((f) => f !== F.scene);
    const miss = files.filter((f) => !existsSync(join(ROOT, f)));
    ok(!miss.length, `ยังไม่มี ${miss.join(", ")}`);
    const anyUse = files.filter((f) => /:\s*any\b|as\s+any\b|<any>/.test(stripComments(read(f))));
    const raw = files.filter((f) => /\.(getDay|getDate|getMonth|getHours|getFullYear)\s*\(\s*\)/.test(stripComments(read(f))));
    const legal = files.filter((f) => LEGAL_BAD.test(stripComments(read(f))));
    ok(!anyUse.length && !raw.length && !legal.length, `any=${anyUse.join(",") || "—"} เวลาเครื่อง=${raw.join(",") || "—"} คำต้องห้าม=${legal.join(",") || "—"}`);
  }, "MAJOR");
  await st("S-14", "ทางเข้าจอ: UNIT_NAV.DORM มี /dorm/repairs (แท็บหอคงเดิม — d.13 K-6)", () => {
    ok(/DORM\s*:\s*\[[\s\S]{0,800}["']\/dorm\/repairs["']/.test(read(F.unitHome)), "UNIT_NAV.DORM ไม่มี /dorm/repairs");
  }, "MINOR");
  await st("S-15", "(ผู้เขียนข้อสอบตั้งแล้ว) SQC_DORM_REPAIR_SCENE ครบ (ห้อง 204 · ห้ามเข้า · IN_PROGRESS) + SQC_VISUAL_SPECS d.16 = มือถือช่าง + รายการ", () => {
    const s = SQC_DORM_REPAIR_SCENE;
    ok(s.id === "sqcd16-rep-204" && s.room === "204" && s.allowEntry === false && s.status === "IN_PROGRESS" && s.expect.payer === "DORM", J(s));
    const v = SQC_VISUAL_SPECS["d.16"] ?? [];
    ok(v.length === 2 && v.some((x) => x.path.endsWith(`/dorm/repairs/${s.id}`)), J(v));
  }, "MINOR");
  await st("S-16", "dorm-line.ts: case \"repair\" ไม่ตอบข้อความคงที่ T.REPAIR แล้ว · ตอบลิงก์พอร์ทัล /repair ของสัญญาผู้กด (leaseLinksText หรือ repairPortalUrl)", () => {
    const s = stripComments(read(F.line));
    const i = s.search(/case\s+["']repair["']\s*:/);
    ok(i >= 0, "ไม่มี case repair");
    const blk = s.slice(i, i + 500);
    const end = blk.search(/\n\s*case\s+["'](?!repair)/);
    const body = end > 0 ? blk.slice(0, end) : blk;
    ok(!/T\.REPAIR/.test(body) && /["']\/repair["']|repairPortalUrl/.test(body), body.slice(0, 200).replace(/\s+/g, " "));
  }, "MAJOR");
  await st("S-17", "ฉาก svc-qc-repair-scene.mts: เขียนเฉพาะแถว DormRepair (ไม่แตะ settingValue · appSystem · kanban* · outboxEvent · serviceMessageLog) · มี --clear · พิมพ์ SCENE_SUMMARY", () => {
    const s = stripComments(read(F.scene));
    ok(s, `ยังไม่มี ${F.scene}`);
    const bad = /settingValue\.|appSystem\.|kanban[A-Za-z]*\.|outboxEvent\.|serviceMessageLog\.|emitOutbox|notifyCustomer/.exec(s);
    ok(!bad && /--clear/.test(s) && /SCENE_SUMMARY/.test(s) && /SQC_DORM_REPAIR_SCENE/.test(s), bad ? `แตะ ${bad[0]}` : "ขาด --clear/SCENE_SUMMARY/SQC_DORM_REPAIR_SCENE");
  }, "MAJOR");

  // ═══════════════ ข้อมูลทดสอบ ═══════════════
  console.log("\n── สร้างข้อมูลทดสอบ ──");
  const mkTenant = async (tag: string) => { const t = await prisma.tenant.create({ data: { name: `QC D16 ${tag}`, slug: `qc-svc-d16-${tag}-${STAMP}` } }); tenantIds.push(t.id); return t.id as string; };
  const A = await mkTenant("a"), B = await mkTenant("b");
  ids.A = A; ids.B = B;
  const mkUnit = async (tenantId: string, tag: string, name: string) => (await prisma.businessUnit.create({ data: { tenantId, type: "DORM", name, slug: `d16${tag}-${STAMP}` } })).id as string;
  const mkUser = async (key: string, tenantId: string, role: string, unitAccess: string[], perms: string[] = []) => {
    const u = await prisma.user.create({ data: { email: `svc-d16-${STAMP}-${key}@shark.local`, name: `QC D16 ${key}` } });
    const m = await prisma.membership.create({ data: { userId: u.id, tenantId, role, unitAccess, permissions: Object.fromEntries(perms.map((p) => [p, true])), acceptedAt: new Date() } });
    ids[`mb_${key}`] = m.id;
    return u.id as string;
  };
  const setVal = async (tenantId: string, key: string, scopeId: string, value: unknown) => {
    await prisma.settingValue.deleteMany({ where: { tenantId, key, scope: "UNIT", scopeId } });
    await prisma.settingValue.create({ data: { tenantId, key, scope: "UNIT", scopeId, value: value === null ? PRISMA_NS.JsonNull : value, setById: "qc-d16" } });
  };
  const newPhone = () => { for (;;) { const p = `08${randomInt(10_000_000, 99_999_999)}`; if (!PHONES.includes(p)) { PHONES.push(p); return p; } } };
  const mkParty = async (tenantId: string, name: string) => { NAMES.push(name); return (await prisma.party.create({ data: { tenantId, name, phone: newPhone() } })).id as string; };
  const mkLease = async (tenantId: string, unitId: string, roomId: string, partyId: string, status = "ACTIVE", start = "2026-01-01") =>
    (await prisma.dormLease.create({ data: {
      tenantId, unitId, roomId, partyId, status, startDate: dbDate(start), endDate: dbDate("2027-12-31"),
      rentSatang: 450_000, commonFeeSatang: 0, depositSatang: 0, advanceRentSatang: 0, bookingFeeSatang: 0, signedAt: new Date(), createdById: "qc-d16",
      ...(status === "ENDED" ? { endedAt: new Date("2026-08-31T10:00:00Z"), endReason: "MOVE_OUT" } : {}),
    } })).id as string;
  const cats = (board: string, extra: Record<string, string | null> = {}) => [["ELECTRIC", "ไฟฟ้า"], ["PLUMBING", "ประปา"], ["AIRCON", "แอร์"], ["FURNITURE", "เฟอร์นิเจอร์"], ["DOOR_LOCK", "ประตู/กุญแจ"], ["OTHER", "อื่น ๆ"]]
    .map(([code, labelTh]) => ({ code, labelTh, board, ...(extra[code] !== undefined ? { assigneeId: extra[code] } : {}) }));

  try {
    const DA = await mkUnit(A, "a", "หอดีสิบหกเอ"), DN = await mkUnit(A, "n", "หอดีสิบหกตึกใหม่"), DZ = await mkUnit(A, "z", "หอดีสิบหกไม่มีบอร์ด"), DB = await mkUnit(B, "b", "หอดีสิบหกบี");
    Object.assign(ids, { DA, DN, DZ, DB });
    const ty = async (tenantId: string, unitId: string) => (await prisma.hotelRoomType.create({ data: { tenantId, unitId, name: "มาตรฐาน", capacity: 2, baseRateSatang: 450_000, depositSatang: 0, rentMode: "MONTHLY", areaSqm: 24 } })).id as string;
    const bld = async (tenantId: string, unitId: string, name: string, sortOrder: number) => (await prisma.roomBuilding.create({ data: { tenantId, unitId, name, floors: 3, sortOrder } })).id as string;
    const room = async (tenantId: string, unitId: string, roomTypeId: string, buildingId: string, number: string) =>
      (await prisma.hotelRoom.create({ data: { tenantId, unitId, roomTypeId, number, buildingId, floorNo: Number(number.replace(/\D/g, "")[0] ?? 1), floor: number[0] } })).id as string;
    const tyA = await ty(A, DA), tyN = await ty(A, DN), tyZ = await ty(A, DZ), tyB = await ty(B, DB);
    ids.B1 = await bld(A, DA, "อาคาร หนึ่ง", 1); ids.B2 = await bld(A, DA, "อาคาร สอง", 2);
    const BN = await bld(A, DN, "อาคาร ใหม่", 1), BZ = await bld(A, DZ, "อาคาร แซด", 1), BB = await bld(B, DB, "อาคาร บี", 1);
    for (const n of ["101", "102", "103", "104", "105", "106"]) R[n] = await room(A, DA, tyA, ids.B1, n);
    R["201"] = await room(A, DA, tyA, ids.B2, "201");
    R.n101 = await room(A, DN, tyN, BN, "101");
    R.z101 = await room(A, DZ, tyZ, BZ, "101");
    R.b101 = await room(B, DB, tyB, BB, "101");
    // ผู้ใช้: OWN เจ้าของ · TK ช่าง (dorm.repair.manage · อาคาร 1) · TK2 อาคาร 1+2 · VW ดูอย่างเดียว · OWNB เจ้าของร้าน B
    ids.OWN = await mkUser("owner", A, "OWNER", ["*"]);
    ids.TK = await mkUser("tk", A, "STAFF", [DA, DN], ["dorm.view", "dorm.repair.manage"]);
    ids.TK2 = await mkUser("tk2", A, "STAFF", [DA], ["dorm.view", "dorm.repair.manage"]);
    ids.VW = await mkUser("vw", A, "STAFF", [DA], ["dorm.view"]);
    ids.OWNB = await mkUser("owner-b", B, "OWNER", ["*"]);
    for (const [t, u] of [[A, DA], [A, DN], [A, DZ], [B, DB]] as const) {
      await setVal(t, "messaging.quietHours", u, null);
      await setVal(t, "messaging.channelOrder", u, ["LINE", "WEB_LINK"]);
    }
    await setVal(A, "rooms.access.managerScope", DA, "BUILDING");
    await setVal(A, "rooms.access.buildingAssignments", DA, { [ids.mb_tk]: [ids.B1], [ids.mb_tk2]: [ids.B1, ids.B2], [ids.mb_vw]: [ids.B1] });
    // #59: ไฟฟ้า → ช่าง TK · แอร์ → ผู้ใช้ที่ไม่มีในร้าน (ต้องไม่มอบหมาย) · #60: เฟอร์นิเจอร์ = ผู้เช่าจ่าย
    await setVal(A, "rooms.repair.categories", DA, cats("ซ่อมหอ", { ELECTRIC: ids.TK, AIRCON: "qc-d16-nobody-user" }));
    await setVal(A, "rooms.repair.payer", DA, { _default: "DORM", FURNITURE: "TENANT" });
    await setVal(A, "rooms.repair.categories", DN, cats("ซ่อมตึกใหม่"));
    await setVal(A, "rooms.repair.categories", DZ, cats("บอร์ดที่ไม่มีจริง"));
    // LINE OA (ตัวจำลอง): OA1 = ของ DA + DN · OAB = ร้าน B
    const sysA = (await prisma.appSystem.create({ data: { tenantId: A, type: "CHAT", name: `qc-d16-chat-${STAMP}` } })).id;
    const sysB = (await prisma.appSystem.create({ data: { tenantId: B, type: "CHAT", name: `qc-d16-chat-b-${STAMP}` } })).id;
    const RAND = randomBytes(3).toString("hex");
    const mkConn = async (tenantId: string, sys: string, tag: string) =>
      (await prisma.chatChannelConnection.create({ data: { tenantId, systemId: sys, type: "LINE", displayName: `qc-d16-${tag}-${STAMP}`, externalAccountId: `qc-d16-${tag}-${STAMP}`, credentials: { channelAccessToken: `qcd16tok${tag}${RAND}`, channelSecret: `qcd16sec${tag}${RAND}` }, meta: { basicId: `@qcd16${tag}` } } })).id as string;
    ids.OA1 = await mkConn(A, sysA, "a1"); ids.OAB = await mkConn(B, sysB, "b");
    ids.TOK1 = `Bearer qcd16toka1${RAND}`;
    await setVal(A, "messaging.lineConnectionId", DA, ids.OA1);
    await setVal(A, "messaging.lineConnectionId", DN, ids.OA1);
    await setVal(B, "messaging.lineConnectionId", DB, ids.OAB);
    // ผู้เช่า/สัญญา
    for (const [k, n] of [["P1", "ณัฐชา ซ่อมหนึ่ง"], ["P2", "สมหญิง ซ่อมสอง"], ["P3", "ธนพล ย้ายออกแล้ว"], ["P4", "วิไล ซ่อมสี่"], ["P5", "ประเสริฐ จะย้ายออก"], ["P6", "อรุณ อาคารสอง"], ["P9", "มานี ผู้เช่าใหม่"], ["PN", "นิพนธ์ ตึกใหม่"], ["PX", "คนนอก ไม่เช่า"]] as const) ids[k] = await mkParty(A, n);
    ids.PB = await mkParty(B, "ร้านบี ผู้เช่าซ่อม");
    ids.L1 = await mkLease(A, DA, R["101"], ids.P1); ids.L2 = await mkLease(A, DA, R["102"], ids.P2); ids.L3 = await mkLease(A, DA, R["103"], ids.P3, "ENDED");
    ids.L4 = await mkLease(A, DA, R["104"], ids.P4); ids.L5 = await mkLease(A, DA, R["105"], ids.P5); ids.L6 = await mkLease(A, DA, R["201"], ids.P6);
    ids.LN = await mkLease(A, DN, R.n101, ids.PN); ids.LB = await mkLease(B, DB, R.b101, ids.PB);
    const mkContact = async (key: string, tenantId: string, sys: string, conn: string, partyId: string | null) => {
      const ext = `Uqcd16${key}${RAND}`;
      const row = await prisma.chatContact.create({ data: { tenantId, systemId: sys, channel: "LINE", channelConnectionId: conn, externalUserId: ext, partyId, lang: "th" } });
      C[key] = { id: row.id, ext, partyId, conn };
    };
    for (const k of ["1", "2", "3", "4", "5", "6", "9", "N", "X"]) await mkContact(`C${k}`, A, sysA, ids.OA1, ids[`P${k}`]);
    await mkContact("CB", B, sysB, ids.OAB, ids.PB);
    // บอร์ดงานร้าน A: "ซ่อมหอ" ที่เก็บแล้ว (เก่าสุด) · "งานทั่วไป" · "ซ่อมหอ" ใช้งาน (แจ้งเข้า → กำลังซ่อม → เสร็จ) — ร้าน B ไม่มีระบบบอร์ดงาน
    ids.KS = (await prisma.appSystem.create({ data: { tenantId: A, type: "KANBAN", name: `qc-d16-kanban-${STAMP}` } })).id;
    const mkBoard = async (name: string, agoDays: number, status = "ACTIVE") => (await prisma.kanbanBoard.create({ data: { tenantId: A, systemId: ids.KS, name, status, createdAt: new Date(Date.now() - agoDays * 86_400_000) } })).id as string;
    const mkCol = async (boardId: string, name: string, i: number, done = false) => (await prisma.kanbanColumn.create({ data: { tenantId: A, systemId: ids.KS, boardId, name, sortOrder: i, position: `a${i}`, isDoneColumn: done } })).id as string;
    ids.KBOLD = await mkBoard("ซ่อมหอ", 3, "ARCHIVED"); ids.KCOLD = await mkCol(ids.KBOLD, "แจ้งเข้า", 0);
    ids.KGEN = await mkBoard("งานทั่วไป", 2); ids.KCGEN = await mkCol(ids.KGEN, "ต้องทำ", 0);
    ids.KB = await mkBoard("ซ่อมหอ", 1);
    ids.KC0 = await mkCol(ids.KB, "แจ้งเข้า", 0); ids.KC1 = await mkCol(ids.KB, "กำลังซ่อม", 1); ids.KC2 = await mkCol(ids.KB, "เสร็จ", 2, true);
    ready = true;
  } catch (e) { console.log(`  ⚠️ ฉาก: ${errMsg(e)}`); }

  const { DA, DN, DZ, DB } = ids;
  const cO = { tenantId: A, actorUserId: ids.OWN }, cTK = { tenantId: A, actorUserId: ids.TK }, cTK2 = { tenantId: A, actorUserId: ids.TK2 }, cVW = { tenantId: A, actorUserId: ids.VW }, cB = { tenantId: B, actorUserId: ids.OWNB };
  const kctx = { tenantId: A, systemId: ids.KS, actorUserId: ids.OWN };
  const tok = (leaseId: string, tenantId = A, purpose = "dorm.portal") => SL.signLink({ tenantId, purpose, subjectId: leaseId, expMin: 600 });
  const popt = (k: string, now: string = T0) => ({ clientKey: CK(k), now: new Date(now) });
  const baseInput = (key: string, extra: Record<string, unknown> = {}) => {
    const text = `ก๊อกน้ำหยด ${key}`;
    TEXTS.push(text);
    return { category: "PLUMBING", text, allowEntry: false, preferredTime: "จ.–ศ. หลัง 17:00", photos: [png(`${key}-1`)], idempotencyKey: K(key), ...extra };
  };
  const submit = async (leaseId: string, key: string, extra: Record<string, unknown> = {}, now = T0, tenantId = A) => {
    const r = await D.submit()(tok(leaseId, tenantId), baseInput(key, extra), { clientKey: CK(`s-${key}-${randomBytes(2).toString("hex")}`), now: new Date(now), deps: noopDeps });
    await parkOutbox(tenantIds);
    return r;
  };
  const repairRow = (id: string): Promise<Any> => prisma.dormRepair.findUnique({ where: { id } });
  const outboxOf = async (type: string, key: string, val: string) => (await prisma.outboxEvent.findMany({ where: { tenantId: { in: tenantIds }, type }, orderBy: { createdAt: "asc" } })).filter((x: Any) => x.payload?.[key] === val);
  const evtOf = (r: Any) => ({ id: r.id, tenantId: r.tenantId, type: r.type, payload: r.payload, systemId: r.systemId ?? null, unitId: r.unitId ?? null });
  const consume = async (type: string, evt: Any) => { await OC.consumers[type](evt); await parkOutbox(tenantIds); };
  const consumeAll = async (type: string, key: string, val: string) => { for (const r of await outboxOf(type, key, val)) await consume(type, evtOf(r)); };
  const cardsOf = (repairId: string) => prisma.kanbanCard.findMany({ where: { tenantId: { in: tenantIds }, sourceKey: `${SRC_PREFIX}${repairId}` } });
  const toCard = async (repairId: string) => { await consumeAll("dorm.repair.created", "repairId", repairId); const c = await cardsOf(repairId); return c[0] as Any; };
  const moveTo = async (cardId: string, col: string) => { const r = await KM.moveCard(kctx, { cardId, toColumnId: col }); await parkOutbox(tenantIds); return r; };
  const kanbanAll = async (cardId: string) => {
    await consumeAll("kanban.card.moved", "cardId", cardId);
    await consumeAll("kanban.card.completed", "cardId", cardId);
  };
  const doneAll = async (repairId: string) => consumeAll("dorm.repair.done", "repairId", repairId);
  const filesA = () => prisma.fileAsset.count({ where: { tenantId: A } });
  const job = (ctx: Any, unitId: string, repairId: string, now = T1) => D.job()(ctx, { unitId, repairId }, { now: new Date(now) });
  const complete = async (ctx: Any, unitId: string, repairId: string, now = T1, extra: Record<string, unknown> = {}) => {
    const r = await D.complete()(ctx, { unitId, repairId, ...extra }, { now: new Date(now), deps: noopDeps });
    await parkOutbox(tenantIds);
    return r;
  };
  const pushCountFor = (repairId: string, m = 0) => pushes(m).filter((p) => repairLinks(p.json).some((l) => l.r === repairId) || J(p.json).includes(`r=${repairId}`)).length;

  // ═══════════════ PC ตัวควบคุม ═══════════════
  console.log("\n── PC ตัวควบคุม ──");
  await st("PC-1", "ฉากข้อมูลทดสอบ: 2 ร้าน · 4 หน่วยหอ · สัญญา 8 · ผู้ติดต่อ LINE 10 · บอร์ดงาน 3 ใบ (ซ่อมหอที่เก็บแล้ว · งานทั่วไป · ซ่อมหอ 3 คอลัมน์) · ค่าตั้งหน่วย", () => ok(ready && Object.keys(C).length === 10 && ids.KC2, `ready=${ready} contacts=${Object.keys(C).length}`));
  await st("PC-2", "createCardFromExternal (K3.3) กันซ้ำด้วย sourceKey: เรียก 2 ครั้ง ⇒ การ์ดเดียว created true/false", async () => {
    needReady();
    const inp = { boardId: ids.KB, title: "QC D16 การ์ดควบคุม", sourceType: "AUTOMATION", sourceKey: `qc-d16-pc2-${STAMP}` };
    const a = await KL.createCardFromExternal({ tenantId: A, systemId: ids.KS, actorUserId: null }, inp), b = await KL.createCardFromExternal({ tenantId: A, systemId: ids.KS, actorUserId: null }, inp);
    await parkOutbox(tenantIds);
    ok(a?.created === true && b?.created === false && a.cardId === b.cardId, `${J(a)} ${J(b)}`);
    ids.PC2 = a.cardId;
  });
  await st("PC-3", "moveCard (K1.4) ไปคอลัมน์เสร็จ ⇒ outbox kanban.card.moved + kanban.card.completed (payload cardId · completedAt · actorUserId)", async () => {
    needReady();
    ok(ids.PC2, "ไม่มีการ์ดจาก PC-2");
    const r = await moveTo(ids.PC2, ids.KC2);
    ok(r?.ok !== false, `ย้าย ${J(r)}`);
    const mv = await outboxOf("kanban.card.moved", "cardId", ids.PC2), cp = await outboxOf("kanban.card.completed", "cardId", ids.PC2);
    ok(mv.length === 1 && cp.length === 1 && typeof cp[0].payload.completedAt === "string", `moved=${mv.length} completed=${cp.length}`);
  });
  await st("PC-4", "notifyCustomer (R0.7) + ตัวจำลอง LINE: แม่แบบเดิม rooms.msg.repairDone ถึง P1 บน OA1 ⇒ push 1 (Bearer OA1) · คีย์เดิมซ้ำ ⇒ duplicate", async () => {
    needReady();
    const m = mark();
    const input = { unitId: DA, domain: "rooms", messageKey: "repairDone", partyId: ids.P1, vars: { tenantName: "x", roomNo: "101", unitName: "หอ", ticketNo: "R-0001" }, dedupeKey: `qc-d16-pc4-${STAMP}`, at: new Date(T0) };
    const r1 = await NC.notifyCustomer({ tenantId: A }, input), r2 = await NC.notifyCustomer({ tenantId: A }, input);
    const p = pushesTo(C.C1.ext, m);
    ok(r1?.status === "SENT" && r2?.duplicate === true && p.length === 1 && p[0].auth === ids.TOK1, `r1=${J(r1)} r2=${J(r2)} push=${p.length}`);
    await prisma.serviceMessageLog.deleteMany({ where: { tenantId: A, dedupeKey: `qc-d16-pc4-${STAMP}` } });
  });
  await st("PC-5", "privateFileUrl (storage) ผูกผู้ดู: ผู้ดูเดียวกันผ่าน · คนอื่นไม่ผ่าน · หมดอายุไม่ผ่าน", () => {
    const u = STO.privateFileUrl("abcdefghij0123456789", { kind: "STAFF", id: "qc-a" });
    const p = /^\/api\/files\/([a-z0-9]+)\?exp=(\d+)&sig=([0-9a-f]{64})$/i.exec(u ?? "");
    ok(p && STO.privateFileSignatureOk(p[1], p[2], p[3], { kind: "STAFF", id: "qc-a" }) && !STO.privateFileSignatureOk(p[1], p[2], p[3], { kind: "STAFF", id: "qc-b" }) && !STO.privateFileSignatureOk(p[1], p[2], p[3], { kind: "STAFF", id: "qc-a" }, Number(p[2]) + 1), `url=${u}`);
  });
  await st("PC-6", "ขอบเขตอาคาร D.13 (dormVisibleRoomsFor): TK = อาคาร 1 (6 ห้อง) · TK2 = 7 ห้อง · เจ้าของ = ทั้งหน่วย (null)", async () => {
    needReady();
    const f = dormL.mod?.dormVisibleRoomsFor;
    ok(typeof f === "function", "ไม่มี dormVisibleRoomsFor");
    const a = await f({ tenantId: A }, { unitId: DA, userId: ids.TK }), b = await f({ tenantId: A }, { unitId: DA, userId: ids.TK2 }), o = await f({ tenantId: A }, { unitId: DA, userId: ids.OWN });
    ok(a instanceof Set && a.size === 6 && !a.has(R["201"]) && b instanceof Set && b.size === 7 && o === null, `tk=${a?.size} tk2=${b?.size} own=${J(o)}`);
  });
  await st("PC-7", "สัญญา live (D.9 portalLiveLease): L1 ✓ · L3 (ENDED) ✗ · signLink dorm.portal ไป-กลับได้ · DORM_POSTBACK_NOT_FOUND ไทย", async () => {
    needReady();
    const f = dormL.mod?.portalLiveLease;
    ok(typeof f === "function", "ไม่มี portalLiveLease");
    ok(!!(await f(A, ids.L1, "2026-09-01")) && (await f(A, ids.L3, "2026-09-01")) === null, "live");
    eq(SL.verifyLink(tok(ids.L1), "dorm.portal"), { tenantId: A, subjectId: ids.L1 }, "token");
    ok(THAI.test(String(lineL.mod?.DORM_POSTBACK_NOT_FOUND ?? "")), "ไม่มี DORM_POSTBACK_NOT_FOUND");
  }, "MAJOR");
  await st("PC-8", "checkRateLimitDb: เพดาน 2 ⇒ ครั้งที่ 3 ไม่ผ่าน (ตัวควบคุมของ R-6)", async () => {
    const k = CK("pc8"), o = { limit: 2, windowMs: 600_000 };
    const r = [await RL.checkRateLimitDb(k, o), await RL.checkRateLimitDb(k, o), await RL.checkRateLimitDb(k, o)];
    eq(r.map((x: Any) => x.ok), [true, true, false], "ผล");
  }, "MAJOR");
  await st("PC-9", "ค่าตั้งเดิม #59/#60/#61 + แม่แบบ rooms.msg.repairDone (มีอยู่แล้ว · ใบนี้ไม่เพิ่มค่าตั้ง): อ่านค่าที่ฉากตั้งบน DA ได้ (ไฟฟ้า → TK · เฟอร์นิเจอร์ = TENANT)", async () => {
    needReady();
    const d1 = SET?.getDef?.("rooms.repair.categories"), d2 = SET?.getDef?.("rooms.repair.payer"), d3 = SET?.getDef?.("rooms.access.roomEntry"), t = SET?.getDef?.("rooms.msg.repairDone");
    ok(d1?.type === "table" && d2?.type === "table" && d3 && t?.type === "template", "นิยาม");
    for (const v of ["tenantName", "roomNo", "unitName", "ticketNo"]) ok((t.templateVars ?? []).includes(v), `แม่แบบขาด ${v}`);
    const r = await SET.resolveSettings({ tenantId: A }, ["rooms.repair.categories", "rooms.repair.payer"], { unitId: DA });
    const el = (r["rooms.repair.categories"]?.value as Any[]).find((x) => x.code === "ELECTRIC");
    ok(el?.assigneeId === ids.TK && r["rooms.repair.payer"]?.value?.FURNITURE === "TENANT", J(r).slice(0, 200));
  }, "MAJOR");

  // ═══════════════ R ผู้เช่าแจ้งซ่อม (พอร์ทัล) ═══════════════
  console.log("\n── R ผู้เช่าแจ้งซ่อม ──");
  await st("R-1", "ผู้เช่าห้อง 101 แจ้ง (ประปา · ข้อความ · ห้ามเข้าตอนไม่อยู่ · เวลาสะดวก · รูป 2) ⇒ ok · แถว OPEN ผูก L1/P1/ห้อง · createdAt = now · รูปเป็นไฟล์ส่วนตัว t/<ร้าน>/private/ ใน files[] (role TENANT) · event dorm.repair.created 1 ตัว payload ตรง 4 คีย์ · audit dorm.repair.created", async () => {
    needReady();
    const r = await submit(ids.L1, "r1", { photos: [png("r1a"), png("r1b")] });
    ok(r?.ok === true && typeof r.repairId === "string" && r.replayed === false, `ผล ${J(r)}`);
    RP.r1 = r.repairId;
    const row = await repairRow(r.repairId);
    eq([row?.tenantId, row?.unitId, row?.roomId, row?.leaseId, row?.partyId, row?.category, row?.status, row?.allowEntry, row?.preferredTime, row?.kanbanCardId], [A, DA, R["101"], ids.L1, ids.P1, "PLUMBING", "OPEN", false, "จ.–ศ. หลัง 17:00", null], "แถว");
    ok(row?.createdAt?.toISOString?.() === T0, `createdAt ${row?.createdAt?.toISOString?.()}`);
    const files = Array.isArray(row?.files) ? row.files : [];
    ok(files.length === 2 && files.every((f: Any) => f?.role === "TENANT" && typeof f?.fileId === "string"), `files ${J(files)}`);
    const fa = await prisma.fileAsset.findMany({ where: { id: { in: files.map((f: Any) => f.fileId) } } });
    ok(fa.length === 2 && fa.every((x: Any) => String(x.path).startsWith(`t/${A}/private/`) && !/^https?:/.test(String(x.cdnUrl))), `รูป ${J(fa.map((x: Any) => x.path))}`);
    const ev = await outboxOf("dorm.repair.created", "repairId", r.repairId);
    ok(ev.length === 1, `event ${ev.length}`);
    eq(Object.keys(ev[0].payload).sort(), ["category", "repairId", "roomId", "unitId"], "payload คีย์");
    eq([ev[0].payload.repairId, ev[0].payload.roomId, ev[0].payload.unitId, ev[0].payload.category], [r.repairId, R["101"], DA, "PLUMBING"], "payload ค่า");
    eq(await prisma.auditLog.count({ where: { tenantId: A, action: "dorm.repair.created", targetId: r.repairId } }), 1, "audit");
  });
  await st("R-2", "ส่งซ้ำคีย์เดิม (มีรูป · และไม่มีรูป) ⇒ ok replayed:true repairId เดิม · แถว 1 · ไฟล์ไม่เพิ่ม · event ไม่เพิ่ม", async () => {
    needReady();
    ok(RP.r1, "ไม่มีคำแจ้งจาก R-1");
    const f0 = await filesA();
    const a = await submit(ids.L1, "r1", { photos: [png("r1a"), png("r1b")] });
    const b = await submit(ids.L1, "r1", { photos: [] });
    eq([a?.ok, a?.replayed, a?.repairId, b?.ok, b?.replayed, b?.repairId], [true, true, RP.r1, true, true, RP.r1], "ผลซ้ำ");
    eq(await prisma.dormRepair.count({ where: { tenantId: A, leaseId: ids.L1 } }), 1, "แถว");
    eq(await filesA(), f0, "ไฟล์");
    eq((await outboxOf("dorm.repair.created", "repairId", RP.r1)).length, 1, "event");
  });
  await st("R-3", "X3 คีย์เดียวพร้อมกัน 14 ทาง (ในโพรเซส 6 + โพรเซสลูก 2×4) ห้อง 102 ⇒ ทุกทาง ok repairId เดียว · แถว 1 · ไฟล์ +1 (ผู้แพ้ลบรูปตัวเอง) · event 1 · replayed:false ทางเดียว · ไม่มี throw/P2002", async () => {
    needReady();
    const f0 = await filesA();
    const at = atIn();
    const input = { ...baseInput("r3"), photos: undefined };
    const t = tok(ids.L2);
    const kids = fanout("submit", [0, 1].map((g) => [0, 1, 2, 3].map((i) => ({ token: t, input: { ...input, photos: [{ data: b64(pngOf("r3")), contentType: "image/png" }] }, clientKey: CK(`r3k${g}${i}`), now: T0 }))), at);
    const mine = inProcAt(at, [0, 1, 2, 3, 4, 5].map((i) => () => D.submit()(t, { ...input, photos: [png("r3")] }, { clientKey: CK(`r3m${i}`), now: new Date(T0), deps: noopDeps })));
    const rs = [...(await mine), ...(await kids)];
    await parkOutbox(tenantIds);
    eq(badOf(rs), [], "throw/ชน");
    const idsSet = [...new Set(rs.map((r: Any) => r?.repairId))];
    ok(rs.every((r: Any) => r?.ok === true) && idsSet.length === 1, `ผล ${[...new Set(rs.map(codeOf))].join(",")} ids=${idsSet.length}`);
    RP.r3 = idsSet[0] as string;
    eq(await prisma.dormRepair.count({ where: { tenantId: A, leaseId: ids.L2 } }), 1, "แถว");
    eq((await filesA()) - f0, 1, "ไฟล์ที่เพิ่ม");
    eq((await outboxOf("dorm.repair.created", "repairId", RP.r3)).length, 1, "event");
    eq(rs.filter((r: Any) => r?.replayed === false).length, 1, "replayed:false ต้องมีทางเดียว");
  });
  await st("R-4", "input/ไฟล์ผิด ⇒ หมวดที่ไม่มีในค่าตั้ง · ข้อความว่าง · ข้อความ 1001 · เวลาสะดวก 121 · รูป 5 · allowEntry ไม่ใช่ boolean · คีย์สั้น ⇒ INVALID_INPUT · SVG / ไบต์หัวไม่ตรง ⇒ INVALID_FILE · ขนาดรวม > 10 MB (แจ้งขนาด) ⇒ INVALID_FILE โดยไม่อ่านไบต์ — ไม่มีแถว/ไฟล์เพิ่ม · เหตุผลไทย", async () => {
    needReady();
    const n0 = await prisma.dormRepair.count({ where: { tenantId: A } }), f0 = await filesA();
    let reads = 0;
    const lazy = (mb: number) => ({ size: mb * 1024 * 1024, contentType: "image/png", read: async () => { reads++; return pngOf("big"); } });
    const rs = [
      await submit(ids.L4, "r4a", { category: "SPA" }), await submit(ids.L4, "r4b", { text: "   " }), await submit(ids.L4, "r4c", { text: "ก".repeat(1001) }),
      await submit(ids.L4, "r4d", { preferredTime: "ก".repeat(121) }), await submit(ids.L4, "r4e", { photos: [1, 2, 3, 4, 5].map((i) => png(`r4e${i}`)) }),
      await submit(ids.L4, "r4f", { allowEntry: "yes" }), await submit(ids.L4, "r4g", { idempotencyKey: "x" }),
      await submit(ids.L4, "r4h", { photos: [svg()] }), await submit(ids.L4, "r4i", { photos: [fakeJpeg()] }), await submit(ids.L4, "r4j", { photos: [lazy(6), lazy(6)] }),
    ];
    eq(rs.map(codeOf), ["INVALID_INPUT", "INVALID_INPUT", "INVALID_INPUT", "INVALID_INPUT", "INVALID_INPUT", "INVALID_INPUT", "INVALID_INPUT", "INVALID_FILE", "INVALID_FILE", "INVALID_FILE"], "รหัส");
    ok(rs.every((r: Any) => THAI.test(r?.reason ?? "")), "เหตุผลไทย");
    eq(reads, 0, "อ่านไบต์ทั้งที่ขนาดที่แจ้งเกิน");
    eq([await prisma.dormRepair.count({ where: { tenantId: A } }), await filesA()], [n0, f0], "แถว/ไฟล์");
  }, "MAJOR");
  await st("R-5", "X7 ไม่พบเดียวกันทุกไบต์: ลายเซ็นปลอม · ตัดท้าย · purpose อื่น (dorm.parcel) · สัญญาจบ (L3) · ร้านใน token ไม่ตรง · สัญญาที่ไม่มี · ขยะ ⇒ submit = {ok:false, NOT_FOUND, REPAIR_NF_REASON} เหมือนกัน · ไม่อ่านไบต์รูป · ไม่มีแถว · loadPortalRepairs = null ทุกกรณี (ตัวควบคุม: L1 ได้ view)", async () => {
    needReady();
    const n0 = await prisma.dormRepair.count({ where: { tenantId: { in: [A, B] } } });
    const good = tok(ids.L1);
    const [h, s] = good.split(".");
    const forged = `${h}.${Buffer.from(randomBytes(32)).toString("base64url")}`;
    const cases = [forged, good.slice(0, -4), tok(ids.L1, A, "dorm.parcel"), tok(ids.L3), tok(ids.L1, B), tok("qc-d16-no-such-lease"), "abc", `${s}.${h}`];
    let reads = 0;
    const spy = { size: 1000, contentType: "image/png", read: async () => { reads++; return pngOf("spy"); } };
    const outs: string[] = [];
    const loads: Any[] = [];
    for (const [i, t] of cases.entries()) {
      outs.push(J(await D.submit()(t, { ...baseInput(`r5${i}`), photos: [spy] }, { clientKey: CK(`r5${i}`), now: new Date(T0), deps: noopDeps })));
      loads.push(await D.load()(t, { r: null }, popt(`r5l${i}`)));
    }
    NF_PORTAL = outs[0];
    ok(new Set(outs).size === 1 && JSON.parse(outs[0])?.code === "NOT_FOUND" && JSON.parse(outs[0])?.reason === D.NF(), `ผลต่างกัน: ${[...new Set(outs)].join(" | ").slice(0, 260)}`);
    eq(Object.keys(JSON.parse(outs[0])).sort(), ["code", "ok", "reason"], "คีย์ของผลไม่พบ");
    eq(loads, cases.map(() => null), "load");
    eq(reads, 0, "อ่านไบต์ก่อนผ่านด่าน");
    eq(await prisma.dormRepair.count({ where: { tenantId: { in: [A, B] } } }), n0, "แถว");
    const v = await D.load()(good, { r: null }, popt("r5ok"));
    ok(v && v.roomNumber === "101" && Array.isArray(v.items), `ตัวควบคุม ${J(v).slice(0, 120)}`);
  });
  await st("R-6", "rate limit ก่อนตรวจลิงก์: ถังแจ้งซ่อม 10 ครั้ง/10 นาทีต่อ clientKey (token ปลอม 10 ครั้ง) ⇒ ครั้งที่ 11 แม้ token ถูก = RATE_LIMITED ไม่มีแถว · หน้า view ใช้ถัง dorm:portal:view ของ D.9 (120 ⇒ ครั้งที่ 121 = null)", async () => {
    needReady();
    const o = { clientKey: CK("r6"), now: new Date(T0), deps: noopDeps };
    for (let i = 0; i < 10; i++) await D.submit()("abc.def", baseInput(`r6${i}`), o);
    const n0 = await prisma.dormRepair.count({ where: { tenantId: A } });
    const r = await D.submit()(tok(ids.L4), baseInput("r6ok"), o);
    ok(failIs(r, "RATE_LIMITED"), codeOf(r));
    eq(await prisma.dormRepair.count({ where: { tenantId: A } }), n0, "แถว");
    const t = tok(ids.L1), v = popt("r6v");
    let lastOk = true;
    for (let i = 0; i < 120; i++) { if (!(await D.load()(t, { r: null }, v))) { lastOk = false; break; } }
    ok(lastOk, "ยังไม่ถึง 120 ก็ถูกปฏิเสธ");
    eq(await D.load()(t, { r: null }, v), null, "ครั้งที่ 121");
  }, "MAJOR");
  await st("R-7", "เพดานงานค้างต่อสัญญา: OPEN/IN_PROGRESS ครบ 10 (L4) ⇒ คำแจ้งใหม่ = TOO_MANY ไม่มีแถว · งานที่เสร็จ/ยกเลิกไม่นับ", async () => {
    needReady();
    const rows = Array.from({ length: 10 }, (_, i) => ({ id: `qcd16cap${STAMP}${i}`, tenantId: A, unitId: DA, roomId: R["104"], leaseId: ids.L4, partyId: ids.P4, category: "OTHER", text: `ค้าง ${i}`, status: "OPEN", createdAt: new Date(T0) }));
    await prisma.dormRepair.createMany({ data: rows });
    try {
      const r = await submit(ids.L4, "r7");
      ok(failIs(r, "TOO_MANY"), codeOf(r));
      await prisma.dormRepair.updateMany({ where: { id: rows[0].id }, data: { status: "CANCELLED" } });
      const r2 = await submit(ids.L4, "r7b");
      ok(r2?.ok === true, `หลังยกเลิก 1 ${codeOf(r2)}`);
      RP.r7b = r2.repairId;
    } finally { await prisma.dormRepair.updateMany({ where: { id: { in: rows.map((x) => x.id) } }, data: { status: "CANCELLED" } }); }
  }, "MINOR");

  // ═══════════════ K การ์ดบอร์ดงาน ═══════════════
  console.log("\n── K การ์ดบอร์ดงาน ──");
  await st("K-1", "consumer dorm.repair.created (R-1) ⇒ การ์ด 1 ใบบนบอร์ด \"ซ่อมหอ\" ที่ใช้งาน (ไม่ใช่ใบที่เก็บแล้ว/งานทั่วไป) คอลัมน์แรก · sourceKey dorm.repair#<id> · AUTOMATION · ชื่อมีห้อง 101 + ประปา · รายละเอียดมีป้ายห้ามเข้า + เวลาสะดวก + ลิงก์จอช่าง /dorm/repairs/<id> · ไม่มีไฟล์แนบ/ลิงก์ไฟล์/ชื่อ/เบอร์ · DormRepair.kanbanCardId = การ์ด", async () => {
    needReady();
    ok(RP.r1, "ไม่มีคำแจ้ง R-1");
    const c = await toCard(RP.r1);
    const all = await cardsOf(RP.r1);
    ok(all.length === 1 && c, `การ์ด ${all.length}`);
    eq([c.boardId, c.columnId, c.sourceType], [ids.KB, ids.KC0, "AUTOMATION"], "บอร์ด/คอลัมน์/ชนิด");
    ok(/101/.test(c.title) && /ประปา/.test(c.title), `ชื่อ ${c.title}`);
    const d = String(c.description ?? "");
    ok(/ห้ามเข้า/.test(d) && d.includes("จ.–ศ. หลัง 17:00") && d.includes(`/dorm/repairs/${RP.r1}`), `รายละเอียด ${d.slice(0, 200)}`);
    ok(!/\/api\/files|private:\/\/|b-cdn|bunny/i.test(J(c)) && !PHONE_RE.test(J(c)) && !NAMES.some((n) => J(c).includes(n)), "ไฟล์/ชื่อ/เบอร์ในการ์ด");
    eq(await prisma.kanbanAttachment.count({ where: { cardId: c.id } }), 0, "ไฟล์แนบ");
    eq((await repairRow(RP.r1))?.kanbanCardId, c.id, "kanbanCardId");
    ids.CARD1 = c.id;
  });
  await st("K-2", "X4 consumer created ซ้ำ: ซ้ำ 1 + ในโพรเซส 6 + โพรเซสลูก 2×3 ⇒ การ์ดยัง 1 ใบ · kanbanCardId ไม่เปลี่ยน · ไม่ throw", async () => {
    needReady();
    const ev = (await outboxOf("dorm.repair.created", "repairId", RP.r1)).map(evtOf)[0];
    ok(ev, "ไม่มี event");
    await consume("dorm.repair.created", ev);
    const at = atIn();
    const kids = fanout("consume", [0, 1].map(() => [0, 1, 2].map(() => ({ type: "dorm.repair.created", evt: ev }))), at);
    const mine = inProcAt(at, [0, 1, 2, 3, 4, 5].map(() => () => OC.consumers["dorm.repair.created"](ev)));
    const rs = [...(await mine), ...(await kids)];
    await parkOutbox(tenantIds);
    eq(rs.filter((r: Any) => r?.threw || r?.childFail).length, 0, "throw");
    eq((await cardsOf(RP.r1)).length, 1, "การ์ด");
    eq((await repairRow(RP.r1))?.kanbanCardId, ids.CARD1, "kanbanCardId");
  });
  await st("K-3", "1 การ์ดต่อคำแจ้งเมื่อส่งพร้อมกัน (R-3) + consumer 4 ทาง + งานกวาด 3 ทาง (ในโพรเซส 1 + ลูก 2) พร้อมกัน ⇒ การ์ด 1 ใบ · kanbanCardId = การ์ดนั้น", async () => {
    needReady();
    ok(RP.r3, "ไม่มีคำแจ้ง R-3");
    const ev = (await outboxOf("dorm.repair.created", "repairId", RP.r3)).map(evtOf)[0];
    const at = atIn();
    const kids = fanout("sweep", [[{ now: T0, tenantId: A }], [{ now: T0, tenantId: A }]], at);
    const mine = inProcAt(at, [...[0, 1, 2, 3].map(() => () => OC.consumers["dorm.repair.created"](ev)), () => BR.sweep()(new Date(T0), { tenantId: A, budgetMs: 90_000 })]);
    const rs = [...(await mine), ...(await kids)];
    await parkOutbox(tenantIds);
    eq(rs.filter((r: Any) => r?.threw || r?.childFail).length, 0, "throw");
    const cs = await cardsOf(RP.r3);
    ok(cs.length === 1 && (await repairRow(RP.r3))?.kanbanCardId === cs[0].id, `การ์ด ${cs.length}`);
    ids.CARD3 = cs[0].id;
  });
  await st("K-4", "ป้ายเข้าห้อง + ผู้รับผิดชอบตามหมวด: ไฟฟ้า อนุญาตเข้า (L4) ⇒ รายละเอียด \"อนุญาต\" ไม่มี \"ห้ามเข้า\" · มอบหมาย TK (ค่าตั้ง #59 assigneeId) · แอร์ (assigneeId ไม่ใช่สมาชิก) ⇒ การ์ดเกิด ไม่มีผู้รับผิดชอบ", async () => {
    needReady();
    const a = await submit(ids.L4, "k4", { category: "ELECTRIC", allowEntry: true, text: "ปลั๊กไฟห้องนอนไม่มีไฟ" });
    TEXTS.push("ปลั๊กไฟห้องนอนไม่มีไฟ");
    ok(a?.ok === true, codeOf(a));
    RP.k4 = a.repairId;
    const c = await toCard(a.repairId);
    ok(c, "ไม่มีการ์ด");
    const d = String(c.description ?? "");
    ok(/อนุญาต/.test(d) && !/ห้ามเข้า/.test(d), `รายละเอียด ${d.slice(0, 160)}`);
    eq((await prisma.kanbanCardAssignee.findMany({ where: { cardId: c.id } })).map((x: Any) => x.userId), [ids.TK], "ผู้รับผิดชอบ");
    const b = await submit(ids.L4, "k4b", { category: "AIRCON" });
    ok(b?.ok === true, codeOf(b));
    RP.k4b = b.repairId;
    const cb = await toCard(b.repairId);
    ok(cb, "แอร์ไม่มีการ์ด");
    eq(await prisma.kanbanCardAssignee.count({ where: { cardId: cb.id } }), 0, "แอร์ผู้รับผิดชอบ");
  }, "MAJOR");
  await st("K-5", "ไม่มีบอร์ดชื่อตามค่าตั้ง (DN · \"ซ่อมตึกใหม่\") ⇒ consumer ไม่สร้างการ์ด (ไม่ตกไปบอร์ดอื่น) · ไม่ throw · รายการพนักงานบอกว่ายังไม่มีการ์ด · สร้างบอร์ดแล้ว ⇒ งานกวาดสร้างการ์ด 1 ใบบนบอร์ดนั้น · กวาดซ้ำ = ไม่เพิ่ม", async () => {
    needReady();
    const r = await submit(ids.LN, "k5");
    ok(r?.ok === true, codeOf(r));
    RP.k5 = r.repairId;
    const n0 = await prisma.kanbanCard.count({ where: { tenantId: A } });
    await consumeAll("dorm.repair.created", "repairId", r.repairId);
    eq([(await cardsOf(r.repairId)).length, await prisma.kanbanCard.count({ where: { tenantId: A } })], [0, n0], "การ์ดก่อนมีบอร์ด");
    const l = await D.list()(cO, { unitId: DN, status: "ALL" }, { now: new Date(T0) });
    const row = (l?.rows ?? []).find((x: Any) => x.repairId === r.repairId);
    ok(l?.ok === true && row && row.cardLinked === false, `รายการ ${J(row)}`);
    const nb = (await prisma.kanbanBoard.create({ data: { tenantId: A, systemId: ids.KS, name: "ซ่อมตึกใหม่" } })).id;
    await prisma.kanbanColumn.create({ data: { tenantId: A, systemId: ids.KS, boardId: nb, name: "แจ้งเข้า", sortOrder: 0, position: "a0" } });
    const s1 = await BR.sweep()(new Date("2026-09-01T04:00:00.000Z"), { tenantId: A, budgetMs: 90_000 });
    await parkOutbox(tenantIds);
    const cs = await cardsOf(r.repairId);
    ok(cs.length === 1 && cs[0].boardId === nb && (s1?.created ?? 0) >= 1, `หลังกวาด การ์ด=${cs.length} ผล=${J(s1)}`);
    await BR.sweep()(new Date("2026-09-01T04:05:00.000Z"), { tenantId: A, budgetMs: 90_000 });
    eq((await cardsOf(r.repairId)).length, 1, "กวาดซ้ำ");
  }, "MAJOR");
  await st("K-6", "ร้านไม่มีระบบบอร์ดงาน (ร้าน B): แจ้งได้ · consumer ไม่สร้างการ์ด ไม่ throw · งานกวาดร้าน B = 0", async () => {
    needReady();
    const r = await submit(ids.LB, "k6", {}, T0, B);
    ok(r?.ok === true, codeOf(r));
    RP.k6 = r.repairId;
    await consumeAll("dorm.repair.created", "repairId", r.repairId);
    const s = await BR.sweep()(new Date(T0), { tenantId: B, budgetMs: 30_000 });
    ok((await prisma.kanbanCard.count({ where: { tenantId: B } })) === 0 && (s?.created ?? 0) === 0, `ผล ${J(s)}`);
  }, "MAJOR");
  await st("K-7", "ย้ายการ์ด (R-1) ไป \"กำลังซ่อม\" ⇒ consumer kanban.card.moved ⇒ IN_PROGRESS · consumer ซ้ำ 3 ⇒ ไม่เปลี่ยน · ไม่มี dorm.repair.done", async () => {
    needReady();
    ok(ids.CARD1, "ไม่มีการ์ด K-1");
    const r = await moveTo(ids.CARD1, ids.KC1);
    ok(r?.ok !== false, `ย้าย ${J(r)}`);
    await kanbanAll(ids.CARD1);
    await kanbanAll(ids.CARD1);
    const row = await repairRow(RP.r1);
    eq([row?.status, row?.doneAt], ["IN_PROGRESS", null], "สถานะ");
    eq((await outboxOf("dorm.repair.done", "repairId", RP.r1)).length, 0, "done event");
  });
  await st("K-8", "การ์ด (R-1) เข้าคอลัมน์เสร็จ ⇒ consumer completed ⇒ DONE + doneAt + event dorm.repair.done 1 ตัว (payload 4 คีย์) · consumer done ⇒ LINE 1 ข้อความถึง P1 (OA1) · ซ้ำ: completed ในโพรเซส 6 + ลูก 2×2 + done ซ้ำ ⇒ event/ข้อความไม่เพิ่ม", async () => {
    needReady();
    const m = mark();
    SNAP.k8mark = m;
    const r = await moveTo(ids.CARD1, ids.KC2);
    ok(r?.ok !== false, `ย้าย ${J(r)}`);
    await kanbanAll(ids.CARD1);
    const row = await repairRow(RP.r1);
    ok(row?.status === "DONE" && row?.doneAt, `สถานะ ${row?.status}`);
    SNAP.r1doneAt = row.doneAt.toISOString();
    const ev = await outboxOf("dorm.repair.done", "repairId", RP.r1);
    ok(ev.length === 1, `done event ${ev.length}`);
    eq(Object.keys(ev[0].payload).sort(), ["category", "repairId", "roomId", "unitId"], "payload คีย์");
    await doneAll(RP.r1);
    const p = pushesTo(C.C1.ext, m);
    ok(p.length === 1 && p[0].auth === ids.TOK1, `push ${p.length}`);
    SNAP.k8push = p[0];
    const cp = (await outboxOf("kanban.card.completed", "cardId", ids.CARD1)).map(evtOf)[0];
    const at = atIn();
    const kids = fanout("consume", [0, 1].map(() => [0, 1].map(() => ({ type: "kanban.card.completed", evt: cp }))), at);
    const mine = inProcAt(at, [0, 1, 2, 3, 4, 5].map(() => () => OC.consumers["kanban.card.completed"](cp)));
    const rs = [...(await mine), ...(await kids)];
    await parkOutbox(tenantIds);
    eq(rs.filter((x: Any) => x?.threw || x?.childFail).length, 0, "throw");
    await doneAll(RP.r1);
    eq([(await outboxOf("dorm.repair.done", "repairId", RP.r1)).length, pushesTo(C.C1.ext, m).length], [1, 1], "event/ข้อความหลังซ้ำ");
  });
  await st("K-9", "เปิดการ์ดใหม่แล้วปิดซ้ำ (ออกจากคอลัมน์เสร็จ → กลับเข้า) ⇒ completed ใบใหม่ แต่คำแจ้งคง DONE · doneAt เดิม · dorm.repair.done ยัง 1 · ไม่มี LINE เพิ่ม", async () => {
    needReady();
    const m = mark();
    ok((await moveTo(ids.CARD1, ids.KC1))?.ok !== false, "ย้ายออก");
    await kanbanAll(ids.CARD1);
    ok((await moveTo(ids.CARD1, ids.KC2))?.ok !== false, "ย้ายกลับ");
    await kanbanAll(ids.CARD1);
    await doneAll(RP.r1);
    ok((await outboxOf("kanban.card.completed", "cardId", ids.CARD1)).length >= 2, "ไม่มี completed ใบที่สอง (ตัวควบคุม)");
    const row = await repairRow(RP.r1);
    eq([row?.status, row?.doneAt?.toISOString?.()], ["DONE", SNAP.r1doneAt], "สถานะ/doneAt");
    eq([(await outboxOf("dorm.repair.done", "repairId", RP.r1)).length, pushesTo(C.C1.ext, m).length], [1, 0], "event/ข้อความ");
  });
  await st("K-10", "การ์ดปลอม: การ์ดร้าน A ที่ sourceKey = dorm.repair#<คำแจ้งร้าน B> ปิด ⇒ คำแจ้งร้าน B ไม่เปลี่ยน · การ์ดทั่วไป (sourceKey อื่น) ปิด ⇒ ไม่มีอะไรเปลี่ยน · ไม่ throw", async () => {
    needReady();
    ok(RP.k6, "ไม่มีคำแจ้งร้าน B");
    const fake = await KL.createCardFromExternal({ tenantId: A, systemId: ids.KS, actorUserId: null }, { boardId: ids.KB, title: "ปลอม", sourceType: "AUTOMATION", sourceKey: `${SRC_PREFIX}${RP.k6}` });
    await parkOutbox(tenantIds);
    ok((await moveTo(fake.cardId, ids.KC1))?.ok !== false && (await moveTo(fake.cardId, ids.KC2))?.ok !== false, "ย้ายการ์ดปลอม");
    await kanbanAll(fake.cardId);
    const b = await repairRow(RP.k6);
    eq([b?.status, b?.kanbanCardId, b?.doneAt], ["OPEN", null, null], "คำแจ้งร้าน B");
    eq((await outboxOf("dorm.repair.done", "repairId", RP.k6)).length, 0, "event");
    await kanbanAll(ids.PC2);
  });
  await st("K-11", "ช่างกดเสร็จจากมือถือ (R-3 · การ์ดอยู่คอลัมน์แรก) พร้อมกัน 10 ทาง (ในโพรเซส 4 + ลูก 2×3) ⇒ ok 1 พอดี ที่เหลือ ALREADY_DONE · DONE · event 1 · consumer done ⇒ LINE 1 + การ์ดเข้าคอลัมน์เสร็จ (completedAt) · consumer ของการ์ดที่ปิดตามมา ⇒ ไม่มี event/ข้อความเพิ่ม", async () => {
    needReady();
    ok(RP.r3 && ids.CARD3, "ไม่มีคำแจ้ง/การ์ด R-3");
    const m = mark();
    const at = atIn();
    const kids = fanout("complete", [0, 1].map(() => [0, 1, 2].map(() => ({ ctx: cO, input: { unitId: DA, repairId: RP.r3 }, now: T1 }))), at);
    const mine = inProcAt(at, [0, 1, 2, 3].map(() => () => D.complete()(cO, { unitId: DA, repairId: RP.r3 }, { now: new Date(T1), deps: noopDeps })));
    const rs = [...(await mine), ...(await kids)];
    await parkOutbox(tenantIds);
    eq(badOf(rs), [], "throw/ชน");
    const okN = rs.filter((r: Any) => r?.ok === true).length, dupN = rs.filter((r: Any) => r?.code === "ALREADY_DONE").length;
    ok(okN === 1 && dupN === 9, `ok=${okN} already=${dupN} ${[...new Set(rs.map(codeOf))].join(",")}`);
    eq((await repairRow(RP.r3))?.status, "DONE", "สถานะ");
    eq((await outboxOf("dorm.repair.done", "repairId", RP.r3)).length, 1, "event");
    await doneAll(RP.r3);
    const card = await prisma.kanbanCard.findUnique({ where: { id: ids.CARD3 } });
    ok(card?.columnId === ids.KC2 && card?.completedAt, `การ์ด col=${card?.columnId === ids.KC2} completed=${!!card?.completedAt}`);
    await kanbanAll(ids.CARD3);
    await doneAll(RP.r3);
    eq([(await outboxOf("dorm.repair.done", "repairId", RP.r3)).length, pushesTo(C.C2.ext, m).length], [1, 1], "event/ข้อความ");
  });
  await st("K-12", "การ์ดเสร็จแบบเงียบ (คอลัมน์เสร็จ + completedAt โดยไม่มี event — consumer เคยล้ม/ข้าม) ⇒ งานกวาด ⇒ DONE + event 1 · กวาดซ้ำ ⇒ ไม่เพิ่ม", async () => {
    needReady();
    const r = await submit(ids.L6, "k12", { category: "DOOR_LOCK" });
    ok(r?.ok === true, codeOf(r));
    RP.k12 = r.repairId;
    const c = await toCard(r.repairId);
    ok(c, "ไม่มีการ์ด");
    await prisma.kanbanCard.update({ where: { id: c.id }, data: { columnId: ids.KC2, completedAt: new Date(T1) } });
    await BR.sweep()(new Date(T1), { tenantId: A, budgetMs: 90_000 });
    await parkOutbox(tenantIds);
    eq((await repairRow(r.repairId))?.status, "DONE", "สถานะหลังกวาด");
    await BR.sweep()(new Date(T1), { tenantId: A, budgetMs: 90_000 });
    eq((await outboxOf("dorm.repair.done", "repairId", r.repairId)).length, 1, "event");
  }, "MAJOR");

  // ═══════════════ N LINE ซ่อมเสร็จ ═══════════════
  console.log("\n── N LINE ซ่อมเสร็จ ──");
  await st("N-1", "ข้อความซ่อมเสร็จ (K-8): ไทย · มีห้อง 101 + เลขงาน (ticketNo ของจอช่าง) · ปุ่ม/ลิงก์ https://qc-d16.invalid/d/<token>/repair?r=<id> (verify dorm.portal = L1) · ไม่มีเบอร์/คำต้องห้าม · log rooms:repairDone:<id> SENT 1 แถว", async () => {
    needReady();
    const p = SNAP.k8push;
    ok(p, "ไม่มีข้อความจาก K-8");
    const t = textOfPush(p);
    const j = await job(cO, DA, RP.r1);
    ok(j?.ok === true, `job ${codeOf(j)}`);
    ok(THAI.test(t) && t.includes("101") && t.includes(j.job.ticketNo), `ข้อความ ${t.slice(0, 200)}`);
    const ls = repairLinks(p.json);
    ok(ls.length >= 1 && ls.every((l) => l.sub?.subjectId === ids.L1 && l.sub?.tenantId === A) && ls.some((l) => l.r === RP.r1), `ลิงก์ ${J(ls.map((l) => [l.r, l.sub]))}`);
    ok(!PHONE_RE.test(t) && !LEGAL_BAD.test(t), "เบอร์/คำต้องห้าม");
    eq((await prisma.serviceMessageLog.findMany({ where: { tenantId: A, dedupeKey: `rooms:repairDone:${RP.r1}` } })).map((x: Any) => x.status), ["SENT"], "log");
  });
  await st("N-2", "สัญญาจบก่อนข้อความออก (L5 ย้ายออกหลังแจ้ง) ⇒ ช่างปิดงานได้ · ไม่มี LINE · sendRepairDoneNotice = NO_LEASE (หรือ log สถานะจบที่ไม่ใช่ SENT)", async () => {
    needReady();
    const r = await submit(ids.L5, "n2");
    ok(r?.ok === true, codeOf(r));
    RP.n2 = r.repairId;
    await prisma.dormLease.update({ where: { id: ids.L5 }, data: { status: "ENDED", endedAt: new Date("2026-09-01T05:00:00Z"), endReason: "MOVE_OUT" } });
    const m = mark();
    const c = await complete(cO, DA, r.repairId);
    ok(c?.ok === true, `ปิดงาน ${codeOf(c)}`);
    await doneAll(r.repairId);
    const n = await D.notice()({ tenantId: A }, { repairId: r.repairId }, { now: new Date(T1) });
    const logs = await prisma.serviceMessageLog.findMany({ where: { tenantId: A, dedupeKey: `rooms:repairDone:${r.repairId}` } });
    ok(pushesTo(C.C5.ext, m).length === 0 && (n?.status === "NO_LEASE" || logs.every((x: Any) => x.status !== "SENT" && x.status !== "SKIPPED_QUIET" && x.status !== "FAILED")), `push=${pushesTo(C.C5.ext, m).length} n=${J(n)} log=${J(logs.map((x: Any) => x.status))}`);
  });
  await st("N-3", "ยังไม่เสร็จ ⇒ sendRepairDoneNotice = NOT_DONE (dedupeKey null · ไม่มี log/push) · คำแจ้งร้านอื่น ⇒ NOT_FOUND · onRepairDone ไม่ใช่ type ของตัวเอง = ไม่ทำอะไร ไม่ throw", async () => {
    needReady();
    const m = mark();
    const a = await D.notice()({ tenantId: A }, { repairId: RP.k4 }, { now: new Date(T1) });
    const b = await D.notice()({ tenantId: A }, { repairId: RP.k6 }, { now: new Date(T1) });
    await D.onDone()({ id: "x", tenantId: A, type: "dorm.repair.created", payload: { repairId: RP.k4 }, unitId: DA, systemId: null });
    eq([a?.status, a?.dedupeKey, b?.status], ["NOT_DONE", null, "NOT_FOUND"], "สถานะ");
    eq([pushes(m).length, await prisma.serviceMessageLog.count({ where: { tenantId: A, dedupeKey: `rooms:repairDone:${RP.k4}` } })], [0, 0], "push/log");
  }, "MAJOR");
  await st("N-4", "เวลาเงียบ 21:00–08:00: ปิดงาน 22:00 ⇒ SKIPPED_QUIET ไม่ push · งาน 07:30 ยังไม่ส่ง · 08:05 ⇒ ส่ง 1 (resent ≥ 1) · รันซ้ำ ⇒ ไม่เพิ่ม", async () => {
    needReady();
    await setVal(A, "messaging.quietHours", DA, { start: "21:00", end: "08:00" });
    try {
      const r = await submit(ids.L4, "n4", { category: "OTHER" });
      ok(r?.ok === true, codeOf(r));
      RP.n4 = r.repairId;
      ok((await complete(cO, DA, r.repairId, T_QUIET))?.ok === true, "ปิดงาน");
      const m = mark();
      const n = await D.notice()({ tenantId: A }, { repairId: r.repairId }, { now: new Date(T_QUIET) });
      ok(n?.status === "SKIPPED_QUIET" && pushesTo(C.C4.ext, m).length === 0, `22:00 ${J(n)}`);
      await D.jobs()(new Date(T_QUIET_EARLY), { tenantId: A });
      eq(pushesTo(C.C4.ext, m).length, 0, "07:30");
      const j = await D.jobs()(new Date(T_QUIET_END), { tenantId: A });
      ok(pushesTo(C.C4.ext, m).length === 1 && (j?.resent ?? 0) >= 1, `08:05 push=${pushesTo(C.C4.ext, m).length} ผล=${J(j)}`);
      await D.jobs()(new Date(T_QUIET_END), { tenantId: A });
      eq(pushesTo(C.C4.ext, m).length, 1, "รันซ้ำ");
    } finally { await setVal(A, "messaging.quietHours", DA, null); }
  }, "MAJOR");

  // ═══════════════ T ให้คะแนน ═══════════════
  console.log("\n── T ให้คะแนน ──");
  await st("T-1", "ผู้เช่าห้อง 101 ให้คะแนนงานที่เสร็จ (5 · หมายเหตุ) ⇒ ok · rating/ratingNote ในแถว · audit dorm.repair.rated · ให้ซ้ำ ⇒ ALREADY_RATED แถวไม่เปลี่ยน · view แสดง rating + canRate false", async () => {
    needReady();
    const r = await D.rate()(tok(ids.L1), { repairId: RP.r1, rating: 5, note: "ช่างมาเร็วมาก" }, popt("t1", T1));
    ok(r?.ok === true, codeOf(r));
    const row = await repairRow(RP.r1);
    eq([row?.rating, row?.ratingNote], [5, "ช่างมาเร็วมาก"], "แถว");
    eq(await prisma.auditLog.count({ where: { tenantId: A, action: "dorm.repair.rated", targetId: RP.r1 } }), 1, "audit");
    const r2 = await D.rate()(tok(ids.L1), { repairId: RP.r1, rating: 1 }, popt("t1b", T1));
    ok(failIs(r2, "ALREADY_RATED"), codeOf(r2));
    eq((await repairRow(RP.r1))?.rating, 5, "แถวหลังซ้ำ");
    const v = await D.load()(tok(ids.L1), { r: RP.r1 }, popt("t1v", T1));
    const it = (v?.items ?? []).find((x: Any) => x.repairId === RP.r1);
    ok(it && it.rating === 5 && it.canRate === false && it.status === "DONE" && it.current === true, `view ${J(it)}`);
  });
  await st("T-2", "X3 ให้คะแนนพร้อมกัน 10 ทาง (ในโพรเซส 4 + ลูก 2×3 · คะแนนต่างกัน) งาน R-3 ⇒ ok 1 พอดี ที่เหลือ ALREADY_RATED · แถวมีคะแนนของผู้ชนะ · audit 1", async () => {
    needReady();
    const t = tok(ids.L2);
    const at = atIn();
    const kids = fanout("rate", [0, 1].map((g) => [0, 1, 2].map((i) => ({ token: t, input: { repairId: RP.r3, rating: 1 + ((g * 3 + i) % 5) }, clientKey: CK(`t2k${g}${i}`), now: T1 }))), at);
    const mine = inProcAt(at, [0, 1, 2, 3].map((i) => () => D.rate()(t, { repairId: RP.r3, rating: 1 + (i % 5) }, popt(`t2m${i}`, T1))));
    const rs = [...(await mine), ...(await kids)];
    eq(badOf(rs), [], "throw/ชน");
    const okN = rs.filter((r: Any) => r?.ok === true).length, dupN = rs.filter((r: Any) => r?.code === "ALREADY_RATED").length;
    ok(okN === 1 && dupN === 9, `ok=${okN} already=${dupN}`);
    const row = await repairRow(RP.r3);
    ok(Number.isInteger(row?.rating) && row.rating >= 1 && row.rating <= 5, `rating ${row?.rating}`);
    eq(await prisma.auditLog.count({ where: { tenantId: A, action: "dorm.repair.rated", targetId: RP.r3 } }), 1, "audit");
  });
  await st("T-3", "ค่าผิด ⇒ 0 · 6 · 2.5 · \"5\" · หมายเหตุ 301 ⇒ INVALID_INPUT · งานที่ยังไม่เสร็จ (k4) ⇒ NOT_DONE · ไม่มีแถวเปลี่ยน", async () => {
    needReady();
    const t4 = tok(ids.L4);
    const rs = [
      await D.rate()(t4, { repairId: RP.n4, rating: 0 }, popt("t3a", T1)), await D.rate()(t4, { repairId: RP.n4, rating: 6 }, popt("t3b", T1)),
      await D.rate()(t4, { repairId: RP.n4, rating: 2.5 }, popt("t3c", T1)), await D.rate()(t4, { repairId: RP.n4, rating: "5" }, popt("t3d", T1)),
      await D.rate()(t4, { repairId: RP.n4, rating: 4, note: "ก".repeat(301) }, popt("t3e", T1)), await D.rate()(t4, { repairId: RP.k4, rating: 4 }, popt("t3f", T1)),
    ];
    eq(rs.map(codeOf), ["INVALID_INPUT", "INVALID_INPUT", "INVALID_INPUT", "INVALID_INPUT", "INVALID_INPUT", "NOT_DONE"], "รหัส");
    eq([(await repairRow(RP.n4))?.rating, (await repairRow(RP.k4))?.rating], [null, null], "แถว");
  }, "MAJOR");
  await st("T-4", "X1 ข้ามสัญญา: token L2 ให้คะแนนงานของ L1 · token สัญญาจบ (L5) ให้คะแนนงานของตัวเอง · token ปลอม ⇒ NOT_FOUND เหมือนกันทุกไบต์ (= ผลไม่พบของ R-5) · loadPortalRepairs(L2, r=งานของ L1) = null", async () => {
    needReady();
    ok(NF_PORTAL, "ไม่มีผลอ้างอิงจาก R-5");
    const outs = [
      J(await D.rate()(tok(ids.L2), { repairId: RP.r7b ?? RP.k4, rating: 4 }, popt("t4a", T1))),
      J(await D.rate()(tok(ids.L5), { repairId: RP.n2, rating: 4 }, popt("t4b", T1))),
      J(await D.rate()("abc.def", { repairId: RP.r1, rating: 4 }, popt("t4c", T1))),
      J(await D.rate()(tok(ids.L1), { repairId: RP.k6, rating: 4 }, popt("t4d", T1))),
    ];
    const diff = outs.filter((o) => o !== NF_PORTAL);
    ok(!diff.length, `ต่าง: ${diff.join(" | ").slice(0, 240)}`);
    eq(await D.load()(tok(ids.L2), { r: RP.r1 }, popt("t4v", T1)), null, "view งานคนอื่น");
  });

  // ═══════════════ X ขอบเขตพนักงาน ═══════════════
  console.log("\n── X ขอบเขตพนักงาน · พอร์ทัล ──");
  await st("X-1", "X1 ไม่พบเดียวกันทุกไบต์ (listDormRepairs · dormRepairJob · completeDormRepair): ไม่มีสิทธิ์ (VW) · เจ้าของร้าน B บนหน่วย A · หน่วยร้าน B ด้วยงานร้าน A · หน่วยอื่นของร้านเดียวกัน · ช่างอาคาร 1 กับงานอาคาร 2 · id ขยะ ⇒ {ok:false, NOT_FOUND, REPAIR_NF_REASON} · ไม่มีอะไรเปลี่ยน · (ตัวควบคุม TK2 เห็นงานอาคาร 2)", async () => {
    needReady();
    const ref = await job(cO, DA, "qc-d16-no-such-repair");
    ok(failIs(ref, "NOT_FOUND") && ref.reason === D.NF(), `อ้างอิง ${codeOf(ref)}`);
    NF_STAFF = J(ref);
    const b2 = await submit(ids.L6, "x1", { category: "OTHER" });
    ok(b2?.ok === true, codeOf(b2));
    RP.x1 = b2.repairId;
    const target = RP.k4;
    const before = J(await repairRow(target));
    const outs = [
      await job(cVW, DA, target), await job(cB, DA, target), await job(cO, DB, target), await job(cO, DN, target), await job(cTK, DA, RP.x1), await job(cO, DA, "x"),
      await D.list()(cVW, { unitId: DA }, { now: new Date(T1) }), await D.list()(cB, { unitId: DA }, { now: new Date(T1) }), await D.list()(cO, { unitId: "qc-d16-no-unit" }, { now: new Date(T1) }),
      await complete(cVW, DA, target), await complete(cB, DA, target), await complete(cO, DB, target), await complete(cO, DN, target), await complete(cTK, DA, RP.x1),
    ].map((r) => J(r));
    const diff = outs.map((o, i) => [i, o] as const).filter(([, o]) => o !== NF_STAFF);
    ok(!diff.length, `ต่าง: ${diff.map(([i, o]) => `#${i} ${o.slice(0, 80)}`).join(" · ")}`);
    eq(J(await repairRow(target)), before, "แถวงาน k4");
    eq((await repairRow(RP.x1))?.status, "OPEN", "แถวงานอาคาร 2");
    const c = await job(cTK2, DA, RP.x1);
    ok(c?.ok === true && c.job.roomNumber === "201", `ตัวควบคุม ${codeOf(c)}`);
  });
  await st("X-2", "รายการตามขอบเขต: TK (อาคาร 1) ไม่มีงานห้อง 201 · TK2 มี · เจ้าของเห็นทุกห้อง · counts นับเฉพาะในขอบเขต · ACTIVE = OPEN+IN_PROGRESS", async () => {
    needReady();
    const a = await D.list()(cTK, { unitId: DA, status: "ALL" }, { now: new Date(T1) }), b = await D.list()(cTK2, { unitId: DA, status: "ALL" }, { now: new Date(T1) }), o = await D.list()(cO, { unitId: DA, status: "ACTIVE" }, { now: new Date(T1) });
    ok(a?.ok && b?.ok && o?.ok, `${codeOf(a)} ${codeOf(b)} ${codeOf(o)}`);
    const rooms = (m: Any) => new Set((m.rows as Any[]).map((x) => x.roomNumber));
    ok(!rooms(a).has("201") && rooms(b).has("201"), `TK ${[...rooms(a)]} TK2 ${[...rooms(b)]}`);
    ok((o.rows as Any[]).every((x) => x.status === "OPEN" || x.status === "IN_PROGRESS") && (o.rows as Any[]).some((x) => x.repairId === RP.k4), "ACTIVE");
    const sum = (m: Any) => (m.counts?.open ?? 0) + (m.counts?.inProgress ?? 0) + (m.counts?.done ?? 0);
    ok(sum(a) < sum(b) && sum(b) >= (b.rows as Any[]).filter((x) => x.status !== "CANCELLED").length, `counts ${J(a.counts)} ${J(b.counts)}`);
  }, "MAJOR");
  await st("X-3", "พอร์ทัล: view ของ L1 เห็นเฉพาะงานของสัญญา L1 · ผู้เช่าใหม่ห้องเดิม (L2 จบ → L2n เริ่ม 5 ก.ย.) ไม่เห็นงานของคนเก่า · ให้คะแนนงานคนเก่า = ไม่พบ", async () => {
    needReady();
    const v = await D.load()(tok(ids.L1), { r: null }, popt("x3a", T1));
    ok(v && (v.items as Any[]).length >= 1 && (v.items as Any[]).every((x) => x.repairId === RP.r1), `L1 items ${J((v?.items ?? []).map((x: Any) => x.repairId))}`);
    await prisma.dormLease.update({ where: { id: ids.L2 }, data: { status: "ENDED", endedAt: new Date("2026-09-03T05:00:00Z"), endReason: "MOVE_OUT", endDate: dbDate("2026-09-03") } });
    ids.L2n = await mkLease(A, DA, R["102"], ids.P9, "ACTIVE", "2026-09-05");
    const vn = await D.load()(tok(ids.L2n), { r: null }, popt("x3b", T_SWEEP));
    ok(vn && (vn.items as Any[]).length === 0 && vn.roomNumber === "102", `L2n ${J(vn).slice(0, 160)}`);
    eq(J(await D.rate()(tok(ids.L2n), { repairId: RP.r3, rating: 3 }, popt("x3c", T_SWEEP))), NF_PORTAL, "ให้คะแนนงานคนเก่า");
  }, "MAJOR");
  await st("X-4", "จอช่าง (dormRepairJob): ชื่อผู้เช่า = ชื่อแรกเท่านั้น · ไม่มีเบอร์/นามสกุล · payer ตามหมวด (#60: ประปา = DORM ค่าเริ่ม · เฟอร์นิเจอร์ = TENANT) · allowEntry · boardName = ชื่อบอร์ดของหมวด", async () => {
    needReady();
    const f = await submit(ids.L4, "x4", { category: "FURNITURE", allowEntry: true });
    ok(f?.ok === true, codeOf(f));
    RP.x4 = f.repairId;
    const a = await job(cO, DA, RP.r1), b = await job(cO, DA, f.repairId);
    ok(a?.ok && b?.ok, `${codeOf(a)} ${codeOf(b)}`);
    eq([a.job.payer, b.job.payer, a.job.allowEntry, b.job.allowEntry, a.job.boardName, a.job.tenantFirstName], ["DORM", "TENANT", false, true, "ซ่อมหอ", "ณัฐชา"], "ค่า");
    ok(THAI.test(a.job.payerLabelTh ?? "") && THAI.test(a.job.categoryLabel ?? ""), "ป้ายไทย");
    const s = J(a) + J(b);
    ok(!PHONE_RE.test(s) && !NAMES.some((n) => s.includes(n)), "เบอร์/ชื่อเต็ม");
  }, "MAJOR");

  // ═══════════════ P postback ═══════════════
  console.log("\n── P postback dorm.repair ──");
  await st("P-1", "เมนู LINE \"แจ้งซ่อม\": ผู้เช่าห้อง 101 ⇒ ข้อความไทย (ไม่ใช่ข้อความกลาง/T.REPAIR เดิม) + ลิงก์ /d/<token>/repair ของ L1 · คนไม่เช่า/สัญญาจบ ⇒ ข้อความกลางเดิม · ไม่เขียน ServiceMessageLog/AuditLog", async () => {
    needReady();
    const NF = lineL.mod?.DORM_POSTBACK_NOT_FOUND;
    const n0 = [await prisma.serviceMessageLog.count({ where: { tenantId: A } }), await prisma.auditLog.count({ where: { tenantId: A } })];
    const pb = async (k: string) => { const evt = PB.parsePostbackData("dorm.repair"); ok(evt, "parse dorm.repair"); return fnOf(lineL, "onDormPostback", F.line)({ tenantId: A, connectionId: C[k].conn, chatContactId: C[k].id, partyId: C[k].partyId, replyToken: null }, evt, { now: new Date(T1) }); };
    const r = await pb("C1");
    ok(typeof r?.text === "string" && THAI.test(r.text) && r.text !== NF && !LEGAL_BAD.test(r.text), `คำตอบ ${fmt(r)}`);
    const ls = repairLinks(r);
    ok(ls.length >= 1 && ls.every((l) => l.sub?.subjectId === ids.L1), `ลิงก์ ${J(ls.map((l) => l.sub))}`);
    eq([(await pb("CX"))?.text, (await pb("C3"))?.text], [NF, NF], "ไม่ใช่ผู้เช่า");
    eq([await prisma.serviceMessageLog.count({ where: { tenantId: A } }), await prisma.auditLog.count({ where: { tenantId: A } })], n0, "แถวที่เขียน");
  }, "MAJOR");

  // ═══════════════ F รูปส่วนตัว (X10) ═══════════════
  console.log("\n── F รูปส่วนตัว (X10) ──");
  await st("F-1", "X10 จอช่าง: รูปผู้เช่า 2 = /api/files/<id>?exp&sig ผูกผู้ดู (เจ้าของผ่าน · ช่างคนอื่นไม่ผ่าน) อายุ ≤ 900 วิ · DTO ไม่มี path/cdn/private:// · รายการ (list) ไม่มีลิงก์ไฟล์ · พอร์ทัลไม่มีไฟล์เลย", async () => {
    needReady();
    const a = await job(cO, DA, RP.r1);
    ok(a?.ok === true && Array.isArray(a.job.photos) && a.job.photos.length === 2, `photos ${J(a?.job?.photos)}`);
    const now = Math.floor(Date.now() / 1000);
    for (const p of a.job.photos as Any[]) {
      const m = /^\/api\/files\/([A-Za-z0-9]+)\?exp=(\d+)&sig=([0-9a-f]{64})$/.exec(p.url ?? "");
      ok(m, `url ${p.url}`);
      ok(STO.privateFileSignatureOk(m![1], m![2], m![3], { kind: "STAFF", id: ids.OWN }) && !STO.privateFileSignatureOk(m![1], m![2], m![3], { kind: "STAFF", id: ids.TK }) && Number(m![2]) <= now + 900 + 5, "ลายเซ็น/อายุ");
    }
    const s = J(a);
    ok(!/private:\/\/|\/private\/|b-cdn|bunnycdn/i.test(s) && !s.includes(`t/${A}/`), "DTO มี path/cdn");
    const l = await D.list()(cO, { unitId: DA, status: "ALL" }, { now: new Date(T1) });
    ok(l?.ok && !/\/api\/files|private:\/\//.test(J(l)) && (l.rows as Any[]).find((x) => x.repairId === RP.r1)?.photoCount === 2, "รายการ");
    const v = await D.load()(tok(ids.L1), { r: RP.r1 }, popt("f1", T1));
    ok(v && !/\/api\/files|private|fileId/i.test(J(v)), "พอร์ทัลมีไฟล์");
  });
  await st("F-2", "ช่างแนบรูปหลังซ่อมตอนปิดงาน: SVG ⇒ INVALID_FILE (สถานะไม่เปลี่ยน) · PNG ⇒ ok · files[] เพิ่ม role AFTER (ไฟล์ส่วนตัว) · จอช่างมี afterPhotos 1 ลิงก์ /api/files", async () => {
    needReady();
    const bad = await complete(cO, DA, RP.k4, T1, { afterPhotos: [svg()] });
    ok(failIs(bad, "INVALID_FILE") && (await repairRow(RP.k4))?.status === "OPEN", `svg ${codeOf(bad)}`);
    const r = await complete(cO, DA, RP.k4, T1, { afterPhotos: [png("after-k4")] });
    ok(r?.ok === true, codeOf(r));
    const row = await repairRow(RP.k4);
    const after = (Array.isArray(row?.files) ? row.files : []).filter((f: Any) => f?.role === "AFTER");
    ok(after.length === 1, `files ${J(row?.files)}`);
    const fa = await prisma.fileAsset.findUnique({ where: { id: after[0].fileId } });
    ok(fa && String(fa.path).startsWith(`t/${A}/private/`), "ไฟล์ส่วนตัว");
    const j = await job(cO, DA, RP.k4);
    ok(j?.ok && (j.job.afterPhotos as Any[]).length === 1 && /^\/api\/files\//.test(j.job.afterPhotos[0].url), `job ${J(j?.job?.afterPhotos)}`);
    await doneAll(RP.k4);
  }, "MAJOR");

  // ═══════════════ U DOM ═══════════════
  console.log("\n── U DOM ──");
  const pubL = await loadIf(F.pubComp), listL = await loadIf(F.listComp), jobL = await loadIf(F.jobComp);
  const React = (await tryImport("react")).mod as Any;
  const RDS = (await tryImport("react-dom/server")).mod as Any;
  const render = (L: { mod: Any; err: string }, rel: string, props: Any): string => {
    const Comp = L.mod?.default;
    if (typeof Comp !== "function") throw new AssertFail(`โหลด ${rel} ไม่ได้: ${L.err || "ไม่มี default export"}`);
    return String(RDS.renderToStaticMarkup(React.createElement(Comp, props))).replace(/<!-- -->/g, "");
  };
  const unesc = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'");
  const textOf = (h: string) => unesc(h.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
  const tagWith = (h: string, attr: string, val?: string): string | null => {
    const re = new RegExp(`<[^>]*\\s${attr}(?:="([^"]*)")?[^>]*>`, "g");
    for (const m of h.matchAll(re)) if (val === undefined || m[1] === val) return m[0];
    return null;
  };
  const inputTag = (h: string, name: string): string => [...h.matchAll(/<input[^>]*>/g)].map((m) => m[0]).find((t) => new RegExp(`name="${name}"`).test(t)) ?? "";
  const noop = async () => ({});
  const privacy = (h: string) => { const t = textOf(h); ok(!PHONE_RE.test(h) && !NAMES.some((n) => t.includes(n)) && !/private:\/\//.test(h), "เบอร์/ชื่อเต็ม/private://"); };
  await st("U-1", "DormPortalRepair (หอ 05ค): ราก data-dorm-repair · \"แจ้งซ่อม · ห้อง 101\" · หมวดเป็น radio name=category ครบตามค่าตั้ง · textarea name=text maxlength 1000 · รูป file name=photos accept=image/* multiple · checkbox allowEntry · preferredTime maxlength 120 · idempotencyKey · ปุ่ม \"ส่งเรื่องแจ้งซ่อม\" · ประวัติ data-repair-item + สถานะ · งานที่ให้คะแนนแล้วไม่มีฟอร์มคะแนน · ไม่มีลิงก์ไฟล์", async () => {
    needReady();
    const v = await D.load()(tok(ids.L1), { r: null }, popt("u1", T1));
    ok(v, "ไม่มี view");
    const h = render(pubL, F.pubComp, { view: v, submitAction: noop, rateAction: noop });
    ok(tagWith(h, "data-dorm-repair") && /แจ้งซ่อม/.test(textOf(h)) && textOf(h).includes("101"), `หัว ${textOf(h).slice(0, 80)}`);
    const radios = [...h.matchAll(/<input[^>]*name="category"[^>]*>/g)].map((m) => /value="([^"]+)"/.exec(m[0])?.[1]);
    eq(radios.sort(), ["AIRCON", "DOOR_LOCK", "ELECTRIC", "FURNITURE", "OTHER", "PLUMBING"], "หมวด");
    ok(/<textarea[^>]*name="text"[^>]*maxLength="1000"|<textarea[^>]*maxLength="1000"[^>]*name="text"/i.test(h), "textarea");
    const fi = inputTag(h, "photos");
    ok(/type="file"/.test(fi) && /accept="image\/\*"/.test(fi) && /multiple/.test(fi), `file ${fi}`);
    ok(/type="checkbox"/.test(inputTag(h, "allowEntry")) && /maxLength="120"/i.test(inputTag(h, "preferredTime")) && /type="hidden"/.test(inputTag(h, "idempotencyKey")), "allowEntry/preferredTime/key");
    ok(textOf(h).includes("ส่งเรื่องแจ้งซ่อม"), "ปุ่ม");
    ok(tagWith(h, "data-repair-item", RP.r1) && !tagWith(h, "data-repair-rate", RP.r1), "ประวัติ/ฟอร์มคะแนน");
    ok(!/\/api\/files/.test(h), "ลิงก์ไฟล์");
    privacy(h);
  }, "MAJOR");
  await st("U-2", "DormPortalRepair: งานเสร็จที่ยังไม่ให้คะแนน (L4 · n4) ⇒ form data-repair-rate=<id> มี radio name=rating 1–5 + hidden repairId", async () => {
    needReady();
    const v = await D.load()(tok(ids.L4), { r: null }, popt("u2", T1));
    ok(v, "ไม่มี view");
    const h = render(pubL, F.pubComp, { view: v, submitAction: noop, rateAction: noop });
    const i = h.indexOf(`data-repair-rate="${RP.n4}"`);
    ok(i >= 0, "ไม่มีฟอร์มคะแนนของงาน n4");
    const form = h.slice(i, h.indexOf("</form>", i));
    const vals = [...form.matchAll(/<input[^>]*name="rating"[^>]*>/g)].map((m) => /value="(\d)"/.exec(m[0])?.[1]);
    ok(isDeepStrictEqual(vals, ["1", "2", "3", "4", "5"]) && /name="repairId"[^>]*value="|value="[^"]*"[^>]*name="repairId"/.test(form), `คะแนน ${J(vals)}`);
  }, "MAJOR");
  await st("U-3", "DormRepairJob (หอ 13ค): ราก data-repair-job=<id> · ห้อง+ข้อความ · ป้าย data-repair-entry=DENY \"ห้ามเข้าตอนไม่อยู่\" · เวลาสะดวก · รูป img data-repair-photo src=/api/files · ชิปใครจ่าย data-payer DORM/TENANT (ตัวที่ตั้งเป็น data-on=true) · form data-repair-complete + ปุ่ม \"ซ่อมเสร็จ · แจ้งผู้เช่าทาง LINE\" + รูปหลังซ่อม (accept image/* capture environment) · งานเสร็จแล้ว ⇒ ไม่มีฟอร์ม + \"ซ่อมเสร็จแล้ว\"", async () => {
    needReady();
    const j = await job(cO, DA, RP.x1);
    ok(j?.ok, codeOf(j));
    await prisma.dormRepair.update({ where: { id: RP.x1 }, data: { files: (await repairRow(RP.r1))?.files ?? null } }); // ยืมรูป r1 ให้มีรูปบนจอ (แถวในร้านทดสอบ)
    const j2 = await job(cTK2, DA, RP.x1);
    const h = render(jobL, F.jobComp, { job: j2.job, completeAction: noop });
    ok(tagWith(h, "data-repair-job", RP.x1) && textOf(h).includes("201"), "ราก/ห้อง");
    ok(/ห้ามเข้าตอนไม่อยู่/.test(textOf(h)) && tagWith(h, "data-repair-entry", "DENY"), "ป้ายห้ามเข้า");
    ok(textOf(h).includes("จ.–ศ. หลัง 17:00"), "เวลาสะดวก");
    ok((h.match(/<img[^>]*data-repair-photo[^>]*>/g) ?? []).filter((t) => /src="\/api\/files\//.test(t)).length === 2, "รูป");
    const on = [...h.matchAll(/<[^>]*data-payer="(DORM|TENANT)"[^>]*>/g)].map((m) => [m[1], /data-on="true"/.test(m[0])]);
    ok(on.length === 2 && on.find((x) => x[0] === "DORM")?.[1] === true && on.find((x) => x[0] === "TENANT")?.[1] === false && /ใครจ่ายค่าซ่อม/.test(textOf(h)), `ชิป ${J(on)}`);
    const fi = inputTag(h, "afterPhotos");
    ok(tagWith(h, "data-repair-complete") && textOf(h).includes("ซ่อมเสร็จ · แจ้งผู้เช่าทาง LINE") && /accept="image\/\*"/.test(fi) && /capture="environment"/.test(fi), `ฟอร์มปิดงาน ${fi}`);
    privacy(h);
    const d = await job(cO, DA, RP.r1);
    const hd = render(jobL, F.jobComp, { job: d.job, completeAction: noop });
    ok(!tagWith(hd, "data-repair-complete") && textOf(hd).includes("ซ่อมเสร็จแล้ว") && tagWith(hd, "data-repair-entry", "DENY"), "งานเสร็จ");
  }, "MAJOR");
  await st("U-4", "DormRepairs (รายการ): ราก data-dorm-repairs · แถว a[data-repair-row] = จำนวนแถว · href = <basePath>/repairs/<id> · data-status · ป้ายเข้าห้อง · งานที่ยังไม่มีการ์ด ⇒ data-repair-nocard · ไม่มีเบอร์/ชื่อเต็ม", async () => {
    needReady();
    const m = await D.list()(cO, { unitId: DA, status: "ALL" }, { now: new Date(T1) });
    ok(m?.ok, codeOf(m));
    const base = "/app/u/qc-d16/dorm";
    const h = render(listL, F.listComp, { model: m, basePath: base });
    ok(tagWith(h, "data-dorm-repairs"), "ราก");
    const rows = [...h.matchAll(/<a[^>]*data-repair-row="([^"]+)"[^>]*>/g)];
    eq(rows.length, m.rows.length, "จำนวนแถว");
    ok(rows.every((r) => r[0].includes(`href="${base}/repairs/${r[1]}"`) && /data-status="(OPEN|IN_PROGRESS|DONE|CANCELLED)"/.test(r[0])), "href/สถานะ");
    ok(tagWith(h, "data-repair-entry", "DENY") && tagWith(h, "data-repair-entry", "ALLOW"), "ป้ายเข้าห้อง");
    const nocard = (m.rows as Any[]).filter((x) => !x.cardLinked).length;
    eq((h.match(/data-repair-nocard/g) ?? []).length, nocard, "ป้ายยังไม่มีการ์ด");
    privacy(h);
  }, "MAJOR");

  // ═══════════════ J งานตามเวลา ═══════════════
  console.log("\n── J งานตามเวลา (keyset · ไม่อดอยาก · X5) ──");
  await st("J-1", "งานกวาดการ์ดไม่อดอยาก: งานค้างที่ไม่มีบอร์ด 600 แถว (DZ) คร่อมทั้งเก่ากว่าและใหม่กว่างานปกติ 2 แถว (DA ยังไม่มีการ์ด) ⇒ กวาด 1 รอบ = งานปกติได้การ์ดครบ 2 · งานค้างไม่มีการ์ด · ไม่ throw · กวาดซ้ำ ⇒ created 0 สำหรับ 2 แถวนี้", async () => {
    needReady();
    const mk = (id: string, unitId: string, roomId: string, at: string) => ({ id, tenantId: A, unitId, roomId, leaseId: null, partyId: null, category: "OTHER", text: "งานค้างทดสอบ", status: "OPEN", createdAt: new Date(at) });
    const old = Array.from({ length: 300 }, (_, i) => mk(`qcd16stk${STAMP}o${String(i).padStart(3, "0")}`, DZ, R.z101, new Date(Date.parse("2026-09-04T00:00:00Z") + i * 1000).toISOString()));
    const neu = Array.from({ length: 300 }, (_, i) => mk(`qcd16stk${STAMP}n${String(i).padStart(3, "0")}`, DZ, R.z101, new Date(Date.parse("2026-09-08T00:00:00Z") + i * 1000).toISOString()));
    const gOld = mk(`qcd16good${STAMP}a`, DA, R["106"], "2026-09-03T00:00:00Z"), gNew = mk(`qcd16good${STAMP}b`, DA, R["106"], "2026-09-09T00:00:00Z");
    const gMid = mk(`qcd16good${STAMP}c`, DA, R["106"], "2026-09-06T00:00:00Z");
    await prisma.dormRepair.createMany({ data: [...old, gOld, gMid, ...neu, gNew] });
    RP.gOld = gOld.id; RP.gNew = gNew.id; RP.gMid = gMid.id;
    const r = await BR.sweep()(new Date(T_SWEEP), { tenantId: A, budgetMs: 100_000 });
    await parkOutbox(tenantIds);
    const got = [(await cardsOf(gOld.id)).length, (await cardsOf(gMid.id)).length, (await cardsOf(gNew.id)).length];
    ok(isDeepStrictEqual(got, [1, 1, 1]), `การ์ดงานปกติ ${J(got)} ผล ${J(r)}`);
    eq(await prisma.kanbanCard.count({ where: { tenantId: A, sourceKey: { startsWith: `${SRC_PREFIX}qcd16stk${STAMP}` } } }), 0, "การ์ดของงานค้าง");
    eq(await prisma.dormRepair.count({ where: { tenantId: A, id: { startsWith: `qcd16stk${STAMP}` }, kanbanCardId: { not: null } } }), 0, "kanbanCardId งานค้าง");
    await BR.sweep()(new Date(T_SWEEP), { tenantId: A, budgetMs: 100_000 });
    eq([(await cardsOf(gOld.id)).length, (await cardsOf(gNew.id)).length], [1, 1], "กวาดซ้ำ");
  });
  await st("J-2", "X5 กวาดซ้อน 4 ทาง (ในโพรเซส 2 + ลูก 2) บนงานใหม่ 3 แถวที่ยังไม่มีการ์ด ⇒ การ์ด 1 ใบต่อแถว · kanbanCardId ตรงการ์ด · ไม่ throw", async () => {
    needReady();
    const rows = [0, 1, 2].map((i) => ({ id: `qcd16race${STAMP}${i}`, tenantId: A, unitId: DA, roomId: R["106"], leaseId: null, partyId: null, category: "ELECTRIC", text: "ไฟดับทดสอบ", status: "OPEN", createdAt: new Date("2026-09-09T05:00:00Z") }));
    await prisma.dormRepair.createMany({ data: rows });
    const at = atIn();
    const kids = fanout("sweep", [[{ now: T_SWEEP, tenantId: A }], [{ now: T_SWEEP, tenantId: A }]], at);
    const mine = inProcAt(at, [0, 1].map(() => () => BR.sweep()(new Date(T_SWEEP), { tenantId: A, budgetMs: 90_000 })));
    const rs = [...(await mine), ...(await kids)];
    await parkOutbox(tenantIds);
    eq(rs.filter((r: Any) => r?.threw || r?.childFail).length, 0, "throw");
    for (const x of rows) {
      const cs = await cardsOf(x.id);
      ok(cs.length === 1 && (await repairRow(x.id))?.kanbanCardId === cs[0].id, `${x.id} การ์ด ${cs.length}`);
    }
  });
  await st("J-3", "งานส่งซ้ำไม่อดอยาก: log FAILED/SKIPPED_QUIET 450 แถวของงานที่ส่งไม่ได้แล้ว (สัญญาจบ) + งานที่ส่งได้ 1 (ใหม่สุด) ⇒ รัน 1 รอบ = ส่งงานที่ส่งได้ 1 ข้อความ · แถวที่ส่งไม่ได้ปิดเป็นสถานะจบ (ไม่ใช่ FAILED/SKIPPED_QUIET) · รันซ้ำ = ไม่ส่งเพิ่ม", async () => {
    needReady();
    const dead = Array.from({ length: 450 }, (_, i) => ({ id: `qcd16dead${STAMP}${String(i).padStart(3, "0")}`, tenantId: A, unitId: DA, roomId: R["103"], leaseId: ids.L3, partyId: ids.P3, category: "OTHER", text: "งานเก่า", status: "DONE", doneAt: new Date("2026-09-09T00:00:00Z"), createdAt: new Date("2026-09-08T00:00:00Z") }));
    await prisma.dormRepair.createMany({ data: dead });
    await prisma.serviceMessageLog.createMany({ data: dead.map((d, i) => ({ tenantId: A, unitId: DA, domain: "rooms", messageKey: "repairDone", dedupeKey: `rooms:repairDone:${d.id}`, channel: "LINE", status: i % 2 ? "FAILED" : "SKIPPED_QUIET", partyId: ids.P3, at: new Date(Date.now() - 3_600_000 + i) })) });
    const good = await submit(ids.L6, "j3", { category: "OTHER" });
    ok(good?.ok === true, codeOf(good));
    RP.j3 = good.repairId;
    await setVal(A, "messaging.quietHours", DA, { start: "21:00", end: "08:00" });
    try {
      ok((await complete(cO, DA, good.repairId, T_QUIET))?.ok === true, "ปิดงาน");
      const n = await D.notice()({ tenantId: A }, { repairId: good.repairId }, { now: new Date(T_QUIET) });
      ok(n?.status === "SKIPPED_QUIET", `เงียบ ${J(n)}`);
    } finally { await setVal(A, "messaging.quietHours", DA, null); }
    const m = mark();
    const r = await D.jobs()(new Date(T_SWEEP), { tenantId: A, budgetMs: 110_000 });
    ok(pushesTo(C.C6.ext, m).length === 1 && (r?.resent ?? 0) >= 1, `ส่ง ${pushesTo(C.C6.ext, m).length} ผล ${J(r)}`);
    const left = await prisma.serviceMessageLog.count({ where: { tenantId: A, dedupeKey: { startsWith: `rooms:repairDone:qcd16dead${STAMP}` }, status: { in: ["FAILED", "SKIPPED_QUIET", "SENDING"] } } });
    eq(left, 0, "แถวที่ยังเปิดอยู่");
    eq(pushesTo(C.C3.ext, m).length, 0, "ส่งถึงผู้เช่าที่ย้ายออก");
    await D.jobs()(new Date(T_SWEEP), { tenantId: A, budgetMs: 60_000 });
    eq(pushesTo(C.C6.ext, m).length, 1, "รันซ้ำ");
  });
  await st("J-4", "จำกัดร้าน: กวาด/ส่งซ้ำด้วย tenantId ร้าน B ไม่แตะงานร้าน A (งาน A ที่ยังไม่มีการ์ดยังไม่มี) · งานตามเวลาไม่ throw เมื่อ opts ว่าง/งบหมด", async () => {
    needReady();
    const x = { id: `qcd16iso${STAMP}`, tenantId: A, unitId: DA, roomId: R["106"], leaseId: null, partyId: null, category: "OTHER", text: "แยกร้าน", status: "OPEN", createdAt: new Date("2026-09-09T06:00:00Z") };
    await prisma.dormRepair.create({ data: x });
    await BR.sweep()(new Date(T_SWEEP), { tenantId: B, budgetMs: 30_000 });
    await D.jobs()(new Date(T_SWEEP), { tenantId: B, budgetMs: 30_000 });
    eq((await cardsOf(x.id)).length, 0, "การ์ดงานร้าน A");
    const ctl = new AbortController(); ctl.abort();
    const a = await BR.sweep()(new Date(T_SWEEP), { tenantId: A, budgetMs: 1, signal: ctl.signal });
    const b = await D.jobs()(new Date(T_SWEEP), { tenantId: A, budgetMs: 1, signal: ctl.signal });
    ok(typeof a?.created === "number" && typeof b?.resent === "number", `${J(a)} ${J(b)}`);
  }, "MAJOR");

  // ═══════════════ M PII · ข้อความ ═══════════════
  console.log("\n── M PII · ข้อความ ──");
  await st("M-1", "X8 payload event dorm.repair.* ทุกตัว = 4 คีย์ (unitId · repairId · roomId · category) ไม่มีชื่อ/เบอร์/ข้อความ · audit dorm.repair.* ไม่มีชื่อ/เบอร์/ข้อความแจ้ง · ServiceMessageLog ของใบไม่มีเบอร์/ชื่อ", async () => {
    needReady();
    const evs = await prisma.outboxEvent.findMany({ where: { tenantId: { in: tenantIds }, type: { in: ["dorm.repair.created", "dorm.repair.done"] } } });
    ok(evs.length >= 6, `event ${evs.length}`);
    const badEv = evs.filter((e: Any) => !isDeepStrictEqual(Object.keys(e.payload ?? {}).sort(), ["category", "repairId", "roomId", "unitId"]));
    eq(badEv.length, 0, "payload คีย์");
    const au = await prisma.auditLog.findMany({ where: { tenantId: { in: tenantIds }, action: { startsWith: "dorm.repair." } } });
    ok(au.length >= 3, `audit ${au.length}`);
    const s = J(evs.map((e: Any) => e.payload)) + J(au.map((a: Any) => [a.before, a.after]));
    ok(!PHONE_RE.test(s) && !NAMES.some((n) => s.includes(n)) && !TEXTS.some((t) => s.includes(t)), "PII/ข้อความในเหตุการณ์/audit");
    const logs = J(await prisma.serviceMessageLog.findMany({ where: { tenantId: A, messageKey: "repairDone" } }));
    ok(!PHONE_RE.test(logs) && !NAMES.some((n) => logs.includes(n)), "log");
  });
  await st("M-2", "ข้อความ LINE ทุกตัวของใบ: ไทย · ไม่มีคำต้องห้าม สคบ. · ไม่มีเบอร์ · ไม่มีลิงก์ไฟล์", () => {
    const all = pushes(0).filter((p) => J(p.json).includes("/repair"));
    ok(all.length >= 3, `ข้อความ ${all.length}`);
    for (const p of all) { const t = textOfPush(p); ok(THAI.test(t) && !LEGAL_BAD.test(t) && !PHONE_RE.test(t) && !/\/api\/files|private:\/\//.test(t), t.slice(0, 160)); }
  }, "MAJOR");
  await st("M-3", "การ์ดทุกใบของใบ (sourceKey dorm.repair#): ไม่มีชื่อ/เบอร์ผู้เช่า · ไม่มีลิงก์ไฟล์ · ไม่มีไฟล์แนบ", async () => {
    const cs = await prisma.kanbanCard.findMany({ where: { tenantId: A, sourceKey: { startsWith: SRC_PREFIX } } });
    ok(cs.length >= 5, `การ์ด ${cs.length}`);
    const s = J(cs.map((c: Any) => [c.title, c.description]));
    ok(!PHONE_RE.test(s) && !NAMES.some((n) => s.includes(n)) && !/\/api\/files|private:\/\//.test(s), "PII/ไฟล์");
    eq(await prisma.kanbanAttachment.count({ where: { cardId: { in: cs.map((c: Any) => c.id) } } }), 0, "ไฟล์แนบ");
  }, "MAJOR");
  await st("M-4", "ไม่มีคำขอออกนอกเครื่อง (ไม่ยิง LINE จริง)", () => eq(BLOCKED, [], "คำขอนอกเครื่อง"), "MINOR");
} catch (e) {
  record("CRASH", "จบกลางทาง", "FAIL", errMsg(e), "CRITICAL");
} finally {
  // ═══════════════ Z ล้างข้อมูล ═══════════════
  console.log("\n── Z: ล้างข้อมูล ──");
  try { await cleanup(tenantIds); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); }
  await cleanupMisc();
  await st("Z-1", "หลังล้าง: tenant `qc-svc-d16-*` 0 · แถวของร้านทดสอบ 0 ทุกตาราง (คำแจ้ง/การ์ด/ไฟล์/log/outbox/ค่าตั้ง/audit) · ผู้ใช้ทดสอบ 0 · rate bucket ของรอบ 0", async () => {
    eq(await prisma.tenant.count({ where: { slug: { startsWith: "qc-svc-d16-" } } }), 0, "tenant");
    const left: string[] = [];
    if (tenantIds.length) for (const t of await tablesWithTenant()) { const r: { n: bigint }[] = await prisma.$queryRawUnsafe(`SELECT count(*)::bigint AS n FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, tenantIds); if (Number(r[0]?.n ?? 0)) left.push(t); }
    eq(left, [], "ตารางที่ค้าง");
    eq(await prisma.user.count({ where: { email: { startsWith: "svc-d16-" } } }), 0, "user");
    const rb: { n: bigint }[] = await prisma.$queryRawUnsafe(`SELECT count(*)::bigint AS n FROM "ChatRateBucket" WHERE key LIKE $1`, `%qc-d16-${STAMP}%`);
    eq(Number(rb[0]?.n ?? 0), 0, "rate bucket");
  }, "MAJOR");
  globalThis.fetch = REAL_FETCH;
  if (LINE_API_BASE_SAVED === undefined) delete process.env.LINE_API_BASE; else process.env.LINE_API_BASE = LINE_API_BASE_SAVED;
  server.close();
}

// ═══════════════ S (git · รูปตอนรับใบเท่านั้น) ═══════════════
console.log("\n── S: ไฟล์ที่แตะ (git) ──");
const git = (args: string[]) => execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const dirty = (paths: string[]) => git(["status", "--porcelain", "--untracked-files=all", "--", ...paths]).split("\n").filter(Boolean).map((l) => l.slice(3).trim().replace(/^"|"$/g, ""));
const diffLines = (f: string) => git(["diff", "-U0", "HEAD", "--", f]).split("\n").filter((l) => /^[+-](?![+-])/.test(l));
const OWN_EDIT = [F.dormIndex, F.bridges, F.line, F.perms, F.consumers, F.autoLabels, F.minute, F.unitHome];
const OWN_FIXED = new Set<string>([F.repair, F.pubPage, F.pubActions, F.pubComp, F.page, F.jobPage, F.actions, F.listComp, F.jobComp, ...OWN_EDIT]);
{
  const ch = dirty(["src", "prisma", "public"]);
  const headHas = (() => { try { git(["cat-file", "-e", `HEAD:${F.repair}`]); return true; } catch { return false; } })();
  if (ch.length === 0 && headHas) skip("S-1", "แตะเฉพาะไฟล์ของใบ (§1)", "D.16 merge แล้ว — ข้อนี้ตรวจเฉพาะตอนรับใบ (git status ของทรีงาน)");
  else await st("S-1", "แตะเฉพาะไฟล์ของใบ (§1 · git status ตอนรับใบ) · มีไฟล์ใหม่ครบ", () => {
    const outside = ch.filter((f) => !OWN_FIXED.has(f));
    ok(outside.length === 0, `ไฟล์นอกใบ: ${outside.slice(0, 8).join(", ")}`);
    const miss = [F.repair, F.pubPage, F.page, F.jobPage, F.jobComp].filter((f) => !existsSync(join(ROOT, f)));
    ok(miss.length === 0, `ยังไม่มี: ${miss.join(", ")}`);
  });
}
await st("S-2", "ไม่แตะชิ้นต้องห้าม: prisma · core (นอก permissions) · notify-customer · postback-routes · dorm-portal · dorm-announce · kanban-outbound · โมดูลบอร์ดงาน · พอร์ทัล /d เดิม (นอก repair/) · storage · /api/files · แชท · payment · บัญชี · โมดูลหอเดิม · ไฟล์ร่วมหอ (home/policy-shared) · layout หอ · webhooks/labels", () => {
  const banned = dirty(["prisma", "src/lib/core", "src/lib/platform/notify-customer.ts", "src/lib/platform/postback-routes.ts", "src/lib/platform/dorm-portal.ts", "src/lib/platform/dorm-announce.ts", "src/lib/platform/kanban-outbound.ts",
    "src/lib/modules/kanban", "src/app/(store)/d", "src/lib/storage", "src/app/api/files", "src/lib/modules/chat", "src/lib/payment", "src/lib/modules/account", "src/lib/modules/dorm",
    "src/components/dorm/dorm-home-shared.ts", "src/components/dorm/dorm-policy-shared.ts", "src/app/app/u/[unitSlug]/dorm/layout.tsx", "src/lib/webhooks/labels.ts"])
    .filter((f) => ![F.perms, F.repair, F.dormIndex, F.pubPage, F.pubActions].includes(f as never));
  eq(banned, [], "ไฟล์");
});
await st("S-18", "แก้ไฟล์ร่วมแบบเพิ่ม: dorm-line ลบ ≤ 1 บรรทัด (return T.REPAIR) · permissions ลบ ≤ 1 (planned) · outbox-consumers ลบ ≤ 4 (union kanbanBridge + 2 consumer ของการ์ด) · kanban-bridges · dorm/index · automation labels · minute-jobs · หน้าแรกหน่วย ไม่ลบบรรทัด", () => {
  const rm = (f: string) => diffLines(f).filter((l) => l.startsWith("-") && l.slice(1).trim()).length;
  const bad: string[] = [];
  if (rm(F.line) > 1) bad.push(`dorm-line ลบ ${rm(F.line)}`);
  if (rm(F.perms) > 1) bad.push(`permissions ลบ ${rm(F.perms)}`);
  if (rm(F.consumers) > 4) bad.push(`outbox-consumers ลบ ${rm(F.consumers)}`);
  for (const f of [F.bridges, F.dormIndex, F.autoLabels, F.minute, F.unitHome]) if (rm(f) > 0) bad.push(`${f} ลบ ${rm(f)}`);
  if (dirty([F.fitness]).length && rm(F.fitness) > 0) bad.push("fitness ลบบรรทัด");
  ok(!bad.length, bad.join(" · "));
}, "MAJOR");

// ═══════════════ Q ฉาก svcqc ═══════════════
console.log("\n── Q ฉาก svcqc ──");
{
  let why = "";
  let unitId = "";
  try {
    const t = await prisma.tenant.findUnique({ where: { id: SQC_TENANT.id }, select: { id: true } });
    const u = t ? await prisma.businessUnit.findFirst({ where: { tenantId: SQC_TENANT.id, slug: SQC_UNITS.dorm.slug }, select: { id: true } }) : null;
    const nl = u ? await prisma.dormLease.count({ where: { tenantId: SQC_TENANT.id, unitId: u.id, status: "ACTIVE" } }) : 0;
    if (!t || !u || nl === 0) why = "ร้าน svcqc ยังไม่มีฉาก D.13 (reseed → roomboard → lease → dorm-home ก่อน)";
    else unitId = u.id;
  } catch (e) { why = `อ่าน svcqc ไม่ได้: ${errMsg(e)}`; }
  const runScene = (args: string[] = []) => spawnSync("pnpm", ["exec", "tsx", F.scene, ...args], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  const summary = (out: string) => { const l = out.split("\n").reverse().find((x) => x.startsWith("SCENE_SUMMARY ")); try { return l ? JSON.parse(l.slice(14)) : null; } catch { return null; } };
  const S = SQC_DORM_REPAIR_SCENE;
  const n1 = "ฉาก svc-qc-repair-scene: รันได้ · รันซ้ำ = 0/0/0 · แถว sqcd16-rep-204 (ห้อง 204 · ประปา · ห้ามเข้า · IN_PROGRESS · มีสัญญา live ของห้อง) · ไม่เขียน SettingValue/AppSystem/การ์ด/OutboxEvent/ServiceMessageLog ของ svcqc · OPEN ของ D.13 ไม่ขยับ";
  const n2 = "บนฉาก: dormRepairJob(owner svcqc) ⇒ allowEntry false · payer DORM · ยังไม่มีการ์ด · fai (ไม่มี dorm.repair.manage) ⇒ NOT_FOUND · --clear ลบเฉพาะแถวฉาก แล้วรันคืน";
  if (why) { skip("Q-1", n1, why, "MAJOR"); skip("Q-2", n2, why, "MAJOR"); }
  else {
    await st("Q-1", n1, async () => {
      ok(existsSync(join(ROOT, F.scene)), `ยังไม่มี ${F.scene}`);
      const counts = async () => [await prisma.settingValue.count({ where: { tenantId: SQC_TENANT.id } }), await prisma.appSystem.count({ where: { tenantId: SQC_TENANT.id } }), await prisma.kanbanCard.count({ where: { tenantId: SQC_TENANT.id } }),
        await prisma.outboxEvent.count({ where: { tenantId: SQC_TENANT.id } }), await prisma.serviceMessageLog.count({ where: { tenantId: SQC_TENANT.id } }), await prisma.dormRepair.count({ where: { tenantId: SQC_TENANT.id, status: "OPEN" } })];
      const c0 = await counts();
      const a = runScene();
      ok(a.status === 0, `รอบแรก exit=${a.status} ${`${a.stdout}${a.stderr}`.split("\n").slice(-3).join(" | ").slice(0, 200)}`);
      const b = runScene();
      eq(summary(`${b.stdout}`), { created: 0, updated: 0, removed: 0 }, "รอบสอง");
      const row = await prisma.dormRepair.findUnique({ where: { id: S.id } });
      const rm = row ? await prisma.hotelRoom.findUnique({ where: { id: row.roomId }, select: { number: true } }) : null;
      eq([row?.unitId, rm?.number, row?.category, row?.allowEntry, row?.status, row?.text, row?.preferredTime], [unitId, S.room, S.category, S.allowEntry, S.status, S.text, S.preferredTime], "แถวฉาก");
      ok(row?.leaseId && (await prisma.dormLease.count({ where: { id: row.leaseId, status: "ACTIVE" } })) === 1, "สัญญา live");
      eq(await counts(), c0, "SettingValue/AppSystem/การ์ด/Outbox/SML/OPEN ของ svcqc");
    }, "MAJOR");
    await st("Q-2", n2, async () => {
      const owner = SQC_USERS.find((u) => u.key === "owner")!, fai = SQC_USERS.find((u) => u.key === "fai")!;
      const now = new Date();
      const r = await D.job()({ tenantId: SQC_TENANT.id, actorUserId: owner.userId }, { unitId, repairId: S.id }, { now });
      ok(r?.ok === true && r.job.allowEntry === false && r.job.payer === S.expect.payer && r.job.cardLinked === false && r.job.roomNumber === S.room, J(r).slice(0, 200));
      const f = await D.job()({ tenantId: SQC_TENANT.id, actorUserId: fai.userId }, { unitId, repairId: S.id }, { now });
      ok(f?.ok === false && f.code === "NOT_FOUND", `fai ${codeOf(f)}`);
      const others0 = await prisma.dormRepair.count({ where: { tenantId: SQC_TENANT.id, NOT: { id: S.id } } });
      const c = runScene(["--clear"]);
      ok(c.status === 0 && !(await prisma.dormRepair.findUnique({ where: { id: S.id } })), `--clear exit=${c.status}`);
      eq(await prisma.dormRepair.count({ where: { tenantId: SQC_TENANT.id, NOT: { id: S.id } } }), others0, "แถวอื่นของ svcqc");
      const back = runScene();
      ok(back.status === 0 && !!(await prisma.dormRepair.findUnique({ where: { id: S.id } })), "รันคืน");
    }, "MAJOR");
  }
}

// ═══════════════ V ภาพ (ต้องมี QC server) ═══════════════
console.log("\n── V ภาพ ──");
{
  const base = process.env.QC_BASE ?? "";
  const n1 = "visual-svc d.16 (มือถือช่าง หอ 13ค 390 + รายการแจ้งซ่อม · svcqc · HTTP < 400 · ไม่ล้น) — PARITY 13ค ผู้คุมเปิดดูเอง";
  if (!base) skip("V-1", n1, "ไม่มี QC_BASE — ผู้คุม build QC ผ่าน iso + ฉาก D.13 + svc-qc-repair-scene แล้วรันซ้ำด้วย QC_BASE", "MAJOR");
  else {
    const r = spawnSync("pnpm", ["exec", "tsx", "scripts/visual-svc.mts", "d.16", "--user", "owner", "--base", base], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
    const o = `${r.stdout ?? ""}${r.stderr ?? ""}`;
    record("V-1", n1, r.status === 0 ? "PASS" : "FAIL", r.status === 0 ? "" : `exit=${r.status} ${o.split("\n").filter((l) => l.includes("❌")).slice(0, 3).join(" | ").slice(0, 300)}`, "MAJOR");
  }
}

// ═══════════════ G regression (หลังล้างข้อมูล) ═══════════════
console.log("\n── G: regression ──");
type Sum = { failed?: string[]; findings?: string[] };
const summaryOf = (out: string): Sum | null => {
  const line = out.split("\n").reverse().find((l) => l.startsWith("JSON_SUMMARY "));
  if (!line) return null;
  try { return JSON.parse(line.slice(13)) as Sum; } catch { return null; }
};
/** ผ่าน = มีสรุป และ FAIL ทุกตัวอยู่ในรายการที่ยอม (ข้อ "ไฟล์ของใบนั้น" ซึ่งตรวจได้แค่ตอนรับใบของมันเอง) */
const failedOnly = (allow: string[]) => (out: string) => { const s = summaryOf(out); return !!s && Array.isArray(s.failed) && s.failed.every((id) => allow.includes(id)); };
const findingsOnly = (allow: string[]) => (out: string) => { const s = summaryOf(out); return !!s && Array.isArray(s.findings) && s.findings.every((id) => allow.includes(id)); };
const REG: { s: string; args?: string[]; judge?: (out: string, code: number | null) => boolean; note?: string }[] = [
  { s: "qc-svc-d.9", args: ["--no-regression"], judge: failedOnly(["S-1", "S-2"]), note: "ไม่มี FAIL ยกเว้น S-1/S-2 = ข้อ 'ไฟล์ของใบ D.9'" },
  { s: "qc-svc-d.13", args: ["--no-regression"], judge: failedOnly([]), note: "ไม่มี FAIL" },
  { s: "qc-svc-d.17", args: ["--no-regression"], judge: failedOnly(["S-1", "S-2"]), note: "ไม่มี FAIL ยกเว้น S-1/S-2 = ข้อ 'ไฟล์ของใบ D.17'" },
  { s: "qc-svc-d.18", args: ["--no-regression"], judge: failedOnly(["S-1", "S-2", "S-13"]), note: "ไม่มี FAIL ยกเว้น S-1/S-2/S-13 = ข้อ 'ไฟล์ของใบ D.18' (S-13 นับบรรทัดที่ลบของ outbox-consumers เทียบ HEAD — D.16 ต้องแก้ 2 consumer ของการ์ด)" },
  { s: "qc-kanban-k3.3", judge: findingsOnly(["K3.3-S9.2"]), note: "สะพานขาเข้า · ยอมเฉพาะ S9.2 ภาพ (แดงตั้งแต่ฐาน a57e0ed4)" },
  { s: "qc-kanban-k3.4", judge: findingsOnly([]), note: "ขาออก kanban.card.completed · ไม่มี finding" },
  { s: "qc-svc-smoke" },
];
{
  const hasWork = typeof dormL.mod?.submitPortalRepair === "function" && typeof brL.mod?.onDormRepairCreated === "function";
  const why = !hasWork ? "ยังไม่มีงานของใบ (facade submitPortalRepair / สะพาน onDormRepairCreated) — regression รันเมื่อมีงาน" : NO_REG ? "--no-regression / SVC_D16_NO_REGRESSION=1" : "";
  for (const [i, g] of REG.entries()) {
    const id = `G-${i + 1}`;
    const name = `${g.s}${g.args?.length ? ` ${g.args.join(" ")}` : ""}${g.note ? ` (${g.note})` : " exit 0"}`;
    if (why) { skip(id, name, why); continue; }
    if (!existsSync(join(ROOT, "scripts", `${g.s}.mts`))) { record(id, name, "FAIL", "ไม่มีไฟล์ชุด", "CRITICAL"); continue; }
    const t = Date.now();
    const r = spawnSync("pnpm", ["exec", "tsx", `scripts/${g.s}.mts`, ...(g.args ?? [])], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, timeout: 45 * 60_000 });
    const all = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
    const log = `/tmp/svc-d16-reg-${g.s}.log`;
    try { writeFileSync(log, all); } catch { /* ไม่เป็นไร */ }
    const pass = g.judge ? g.judge(all, r.status) : r.status === 0;
    const tail = all.split("\n").filter((l) => /ผ่าน|JSON_SUMMARY|หยุด|❌|Error/.test(l)).slice(-2).join(" ¦ ").slice(0, 220);
    record(id, `${name} (${Math.round((Date.now() - t) / 1000)} วิ)`, pass ? "PASS" : "FAIL", pass ? "" : `exit=${r.status ?? r.signal} · ${tail} · log ${log}`, "CRITICAL");
  }
}

try { await prisma.$disconnect(); } catch { /* ไม่เป็นไร */ }
const failed = cks.filter((c) => c.res === "FAIL");
const skipped = cks.filter((c) => c.res === "SKIP");
const passed = cks.length - failed.length - skipped.length;
console.log(`\n===== QC SVC D.16 · แจ้งซ่อม → บอร์ดงาน → LINE =====\nผ่าน ${passed}/${cks.length}${skipped.length ? ` (SKIP ${skipped.length})` : ""}`);
console.log(`FINDINGS: CRITICAL ${failed.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${failed.filter((c) => c.sev === "MAJOR").length} · MINOR ${failed.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), findings: [...failed, ...skipped].map((c) => c.id) })}`);
// รับใบ = ผ่านทุกข้อ (SKIP ที่ยอมได้ระหว่างทำ: G-* เมื่อ --no-regression · Q-* svcqc ยังไม่มีฉาก D.13 · V-1 ไม่มี QC_BASE · S-1 หลัง merge — ผู้คุมรันซ้ำครบก่อนรับ)
process.exit(failed.length + skipped.length > 0 ? 1 : 0);
