// QC — SVC D.18 · พัสดุ (รับ+รูป ⇒ LINE แจ้ง ⇒ สแกน/เซ็นรับ ⇒ เตือนค้างตาม #62) · oracle ของผู้เขียนข้อสอบ — builder ห้ามแก้ไฟล์นี้ (แย้ง = wo-notes)
// สัญญา: ledger/svc-briefs/svc-brief-d.18.md (§2 มติ · §3 สัญญาโค้ด · §4 DOM · §5 หน้า · §7 ฉาก · §10 คำขอเคาะ) · ledger/SVC-MASTER-PLAN.md แถว D.18
//        CC §4.4 (notifyCustomer + precheck) §4.5 (signLink) §7 (dorm.parcel.*) §8 (dorm.parcel.manage) · DH A10 + ภาคผนวก ก หอ #62 #64
//
// กลุ่มข้อ:
//   S  โครงสร้าง/ไฟล์/ทะเบียน event 3 ที่/ค่าตั้ง+แม่แบบ/สิทธิ์ออกจาก planned/งานตามเวลา/หน้า/สุขอนามัยโค้ด (+ S-1/S-2 git ท้ายไฟล์)
//   PC ตัวควบคุม (เขียวตั้งแต่ก่อนมีงาน): ฉาก · signLink · notifyCustomer+ตัวจำลอง LINE · privateFileUrl ผูกผู้ดู · ขอบเขตอาคาร D.13 · สัญญา live D.9 · rate limit
//   R  รับพัสดุ: แถว/รูปส่วนตัว/event · คีย์ซ้ำ = แถวเดียว · พร้อมกันหลายโพรเซส · เลขพัสดุซ้ำ · ไฟล์/รูปแบบผิด · ปิดระบบ · ห้องไม่มีสัญญา · X1 ไม่พบเดียวกัน
//   N  แจ้งมาถึง: consumer ⇒ LINE 1 ข้อความ (OA ของหน่วย) + ลิงก์เซ็น · ซ้ำ/พร้อมกัน = 1 (X4) · สัญญาจบ/รับแล้วก่อนส่ง = ไม่ส่ง · เวลาเงียบ + งานส่งซ้ำ
//   T  รับของ: หน้าสาธารณะ (ไม่มีรูป/ชื่อ) · token ผิดทุกแบบ = null เดียว (X7) · rate limit ก่อนตรวจ · สแกน = ใช้ครั้งเดียว · พร้อมกัน N ทาง = 1 (X3)
//      · ลายเซ็น · ผู้เช่าห้องอื่น/ร้านอื่น/purpose อื่น = ไม่พบเดียวกัน · ขอบเขตอาคาร · ตีกลับ (เหตุผล + audit)
//   P  postback dorm.parcel: ของผู้กดเท่านั้น · ข้อความกลางเดิม (ไม่ใช่ผู้เช่า/OA อื่น/สัญญาจบ) · ปิดระบบ · ไม่เขียนฐาน
//   J  เตือนค้าง: ตาม rooms.parcel.holdDays (หน่วย 3 · ค่าเริ่ม 14) · วันละครั้ง · งานซ้อน/หลายโพรเซส = 1 (X5) · เวลาเงียบไม่ส่งย้อนหลัง
//      · หยุดเมื่อรับ/ตีกลับ/สัญญาจบ/ปิดระบบ · จำกัดร้านด้วย tenantId
//   F  รูปส่วนตัว X10 (privateFileUrl ผูกผู้ดู ≤ 900 วิ · ไม่มี path) · รายการตามขอบเขต · ไม่พบเดียวกัน · ปิดระบบยังดูได้
//   U  DOM (DormParcels · DormParcelPickup) · M PII/token ไม่อยู่ในฐาน/สคบ./ไม่ออกนอกเครื่อง · Z ล้าง · Q ฉาก svcqc · G regression (หลังล้าง)
//
// 🔴 ไม่ยิง LINE จริง: ตัวจำลอง (node:http 127.0.0.1) + LINE_API_BASE + ครอบ fetch (นอกเครื่อง = บล็อก) · โพรเซสลูกได้ env เดียวกัน
// 🔴 APP_URL = https://qc-d18.invalid ในโพรเซสนี้ · ร้านทดสอบ slug `qc-svc-d18-*` · ผู้ใช้ `svc-d18-*@shark.local` · ลบใน finally (+ กวาดค้างตอนเริ่ม)
// 🔴 วันที่ตายตัวใน ก.ย. 2569 (อดีตเทียบนาฬิกาจริง — แถว ServiceMessageLog เขียนด้วยเวลาจริงจึงอยู่ใน "3 วันล่าสุด" ของ now ที่ฉีดเสมอ)
// รัน: cd /root/projects/shark-svc-l4 && bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-d.18.mts [--no-regression]
//      (ห้าม timeout ครอบ · ห้าม kill กลางคัน · `--no-regression` = G เป็น SKIP)
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
import { SQC_TENANT, SQC_UNITS, SQC_USERS, SQC_DORM_PARCEL_SCENE } from "./svc-qc-data.mjs";

type Any = any;
const SELF = fileURLToPath(import.meta.url);
const ROOT = join(dirname(SELF), "..");
const LABEL = "qc-svc-d.18";
const NO_REG = process.argv.includes("--no-regression") || process.env.SVC_D18_NO_REGRESSION === "1";
const ORIGIN = "https://qc-d18.invalid";
const F = {
  parcel: "src/lib/modules/dorm/parcel.ts",
  dormIndex: "src/lib/modules/dorm/index.ts",
  page: "src/app/app/u/[unitSlug]/dorm/parcels/page.tsx",
  actions: "src/app/app/u/[unitSlug]/dorm/parcels/actions.ts",
  comp: "src/components/dorm/DormParcels.tsx",
  pubPage: "src/app/(store)/dp/[token]/page.tsx",
  pubComp: "src/components/dorm/DormParcelPickup.tsx",
  scene: "scripts/svc-qc-parcel-scene.mts",
  line: "src/lib/platform/dorm-line.ts",
  perms: "src/lib/core/permissions.ts",
  defs: "src/lib/core/settings/defs/rooms.ts",
  policyShared: "src/components/dorm/dorm-policy-shared.ts",
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
const pngOf = (seed: string): Uint8Array => Uint8Array.from(Buffer.concat([Buffer.from(PNG_SIG), createHash("sha256").update(`qc-d18:${seed}`).digest(), createHash("sha256").update(seed).digest()]));
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
        if (job.op === "receive") {
          if (typeof D.receiveParcel !== "function") return { childFail: "ไม่มี receiveParcel" };
          return D.receiveParcel(x.ctx, { ...x.input, photo: fileIn(x.input.photo) }, { now: new Date(x.now), deps: noopDeps });
        }
        if (job.op === "pickup") {
          if (typeof D.pickupParcel !== "function") return { childFail: "ไม่มี pickupParcel" };
          const proof = x.input.proof.kind === "SIGNATURE" ? { kind: "SIGNATURE", file: fileIn(x.input.proof.file) } : x.input.proof;
          return D.pickupParcel(x.ctx, { ...x.input, proof }, { now: new Date(x.now), deps: noopDeps });
        }
        if (job.op === "jobs") {
          if (typeof D.runDormParcelJobs !== "function") return { childFail: "ไม่มี runDormParcelJobs" };
          return D.runDormParcelJobs(new Date(x.now), { tenantId: x.tenantId });
        }
        if (job.op === "consume") { await (await import("@/lib/outbox-consumers" as string)).consumers["dorm.parcel.received"](x.evt); return { ok: true }; }
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
const PHONE_RE = /(?<![0-9A-Za-z])(\+?66|0)[689]\d{8}(?![0-9A-Za-z])/; // ORACLE-EDIT (ผู้คุม 31 ต.ค. · d18-F1) กันชนเลขสุ่มใน hex ลายเซ็น URL (~1.85%/URL) · เบอร์ที่คั่นด้วยช่องว่าง/เครื่องหมาย/อัญประกาศยังจับได้
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
const tokenExpSec = (token: string): number => { try { return Number(JSON.parse(Buffer.from(token.split(".")[0] ?? "", "base64url").toString("utf8")).e); } catch { return NaN; } };

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
const parcelL = await loadIf(F.parcel);
const dormL = await tryImport("@/lib/modules/dorm");
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
const PRISMA_NS = ((await tryImport("@prisma/client")).mod as Any)?.Prisma;
const FIDX = F.dormIndex;
const D = {
  receive: () => fnOf(dormL, "receiveParcel", FIDX),
  list: () => fnOf(dormL, "listParcels", FIDX),
  pickup: () => fnOf(dormL, "pickupParcel", FIDX),
  ret: () => fnOf(dormL, "returnParcel", FIDX),
  url: () => fnOf(dormL, "parcelPickupUrl", FIDX),
  notice: () => fnOf(dormL, "sendParcelNotice", FIDX),
  onReceived: () => fnOf(dormL, "onParcelReceived", FIDX),
  jobs: () => fnOf(dormL, "runDormParcelJobs", FIDX),
  load: () => fnOf(dormL, "loadParcelPickup", FIDX),
  NF: (): string => { const t = valOf(dormL, "PARCEL_NF_REASON", FIDX); ok(typeof t === "string" && THAI.test(t), "PARCEL_NF_REASON ต้องเป็นข้อความไทย"); return t; },
};
const URL_RE = /https:\/\/qc-d18\.invalid\/dp\/([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/g;
const pickupLinks = (v: unknown): { token: string; sub: { tenantId: string; subjectId: string } | null }[] =>
  [...J(v).matchAll(URL_RE)].map((m) => ({ token: m[1], sub: SL?.verifyLink?.(m[1], "dorm.parcel") ?? null }));
const SEEN_TOKENS = new Set<string>();
const seen = (v: unknown) => { for (const l of pickupLinks(v)) SEEN_TOKENS.add(l.token); return v; };

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
const CK = (k: string) => `qc-d18-${STAMP}-${k}`;
const K = (k: string) => `qcd18${STAMP}${k}`.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80);
async function cleanupMisc() {
  try { await prisma.user.deleteMany({ where: { email: { startsWith: "svc-d18-" } } }); } catch (e) { console.log(`  ⚠️ ลบ user: ${errMsg(e)}`); }
  try { await prisma.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE key LIKE $1`, `%qc-d18-${STAMP}%`); } catch (e) { console.log(`  ⚠️ ลบ rate bucket: ${errMsg(e)}`); }
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
const T0 = "2026-09-01T03:00:00.000Z";            // 1 ก.ย. 10:00 ไทย — รับพัสดุ
const T_QUIET = "2026-09-01T15:00:00.000Z";       // 1 ก.ย. 22:00 ไทย (เวลาเงียบ 21–08)
const T_QUIET_EARLY = "2026-09-02T00:30:00.000Z"; // 2 ก.ย. 07:30 ไทย (ยังเงียบ)
const T_QUIET_END = "2026-09-02T01:05:00.000Z";   // 2 ก.ย. 08:05 ไทย
const dbDate = (ymd: string) => new Date(`${ymd}T00:00:00Z`);
const tenantIds: string[] = [];
const PHONES: string[] = [];
const NAMES: string[] = [];
const RESULTS: unknown[] = [];
const keep = <X,>(r: X): X => { RESULTS.push(r); return r; };
let ready = false;
const needReady = () => ok(ready, "ฉากข้อมูลทดสอบสร้างไม่สำเร็จ (ดู PC-1)");
const ids: Record<string, string> = {};
const R: Record<string, string> = {};          // เลขห้อง → roomId (หน่วย DA · DX "x301" · DB "b101")
const C: Record<string, { id: string; ext: string; partyId: string | null; conn: string }> = {};
const P: Record<string, string> = {};          // ชื่อพัสดุในข้อสอบ → parcelId
const TOK: Record<string, string> = {};        // ชื่อพัสดุ → token รับพัสดุ (จากข้อความ/ลิงก์)
let viewT1: Any = null;
let NF_REF = "";                               // J ของผลไม่พบอ้างอิง

console.log(`\n(ตัวจำลอง LINE ${FAKE_BASE} · APP_URL ${ORIGIN})`);

try {
  const stale = await prisma.tenant.findMany({ where: { slug: { startsWith: "qc-svc-d18-" } }, select: { id: true } });
  if (stale.length) { console.log(`(กวาด tenant ค้างจากรอบก่อน ${stale.length})`); await cleanup(stale.map((t: { id: string }) => t.id)); }
  await cleanupMisc();

  // ═══════════════ S (ไม่แตะฐาน) ═══════════════
  console.log("\n── S โครงสร้าง ──");
  const NEW_FILES = [F.parcel, F.page, F.actions, F.comp, F.pubPage, F.pubComp, F.scene];
  await st("S-3", "มีไฟล์ใหม่ของใบครบ 7 ไฟล์ (§1)", () => { const miss = NEW_FILES.filter((f) => !existsSync(join(ROOT, f))); ok(!miss.length, `ขาด ${miss.join(", ")}`); });
  await st("S-4", "facade @/lib/modules/dorm: 9 ฟังก์ชัน + PARCEL_PICKUP_PURPOSE = dorm.parcel · PARCEL_RATE · PARCEL_NF_REASON (ไทย)", () => {
    const names = ["receiveParcel", "listParcels", "pickupParcel", "returnParcel", "parcelPickupUrl", "sendParcelNotice", "onParcelReceived", "runDormParcelJobs", "loadParcelPickup"];
    const miss = names.filter((n) => typeof dormL.mod?.[n] !== "function");
    ok(!miss.length, `ขาด ${miss.join(", ")} (${dormL.err || parcelL.err || "โหลดได้"})`);
    eq(dormL.mod.PARCEL_PICKUP_PURPOSE, "dorm.parcel", "PARCEL_PICKUP_PURPOSE");
    eq(J(dormL.mod.PARCEL_RATE), J({ view: { limit: 120, windowMs: 600_000 } }), "PARCEL_RATE");
    ok(typeof dormL.mod.PARCEL_NF_REASON === "string" && THAI.test(dormL.mod.PARCEL_NF_REASON), "PARCEL_NF_REASON");
  });
  await st("S-5", "สิทธิ์ dorm.parcel.manage: อยู่ในโมดูล dorm ป้ายไทย · ออกจาก planned แล้ว (มีโค้ดเรียกจริงใน parcel.ts)", () => {
    const p = (PERM?.PERMISSIONS ?? []).find((x: Any) => x.key === "dorm.parcel.manage");
    ok(p && p.module === "dorm" && THAI.test(p.label ?? ""), `ไม่มี/ป้ายผิด ${J(p)}`);
    ok(!p.planned, "ยังอยู่ใน planned");
    ok(/["']dorm\.parcel\.manage["']/.test(stripComments(read(F.parcel))), "parcel.ts ไม่เรียกคีย์ dorm.parcel.manage");
  }, "MAJOR");
  await st("S-6", "event dorm.parcel.received + dorm.parcel.picked_up ลง 3 ทะเบียน (consumers · automation ป้ายไทย · webhooks) · received = งานจริง (dynamic import facade → onParcelReceived)", () => {
    const bad: string[] = [];
    for (const ev of ["dorm.parcel.received", "dorm.parcel.picked_up"]) if (typeof OC?.consumers?.[ev] !== "function") bad.push(`consumer ${ev}`);
    const s = stripComments(read(F.consumers));
    const i = s.search(/["']dorm\.parcel\.received["']\s*:/);
    const blk = i >= 0 ? s.slice(i, i + 400) : "";
    if (!(/import\(\s*["']@\/lib\/modules\/dorm["']\s*\)/.test(blk) && /onParcelReceived\s*\(/.test(blk))) bad.push(`บล็อก received: ${blk.slice(0, 120).replace(/\s+/g, " ")}`);
    ok(!bad.length, bad.join(" · "));
  }, "MAJOR");
  await st("S-6b", "ป้าย automation (ไทย) + webhooks (ได้จาก spread) ของ 2 event", async () => {
    const al = (await import("@/lib/automation/labels" as string)) as Any;
    const wl = (await import("@/lib/webhooks/labels" as string)) as Any;
    const bad: string[] = [];
    for (const ev of ["dorm.parcel.received", "dorm.parcel.picked_up"]) {
      const lab = Array.isArray(al.AUTOMATION_EVENTS) ? al.AUTOMATION_EVENTS.find((e: Any) => e.value === ev) : null;
      if (!lab || !THAI.test(lab.label ?? "")) bad.push(`automation ${ev}`);
      if (!(Array.isArray(wl.WEBHOOK_EVENTS) && wl.WEBHOOK_EVENTS.some((e: Any) => e.value === ev))) bad.push(`webhooks ${ev}`);
    }
    ok(!bad.length, bad.join(" · "));
  }, "MAJOR");
  await st("S-7", "ค่าตั้ง #62 เดิมคงรูป (enabled bool ปิด · holdDays 1–90 ค่าเริ่ม 14 · ชั้น UNIT) + แม่แบบ rooms.msg.parcelReceived/parcelReminder (template · กลุ่ม msg · ป้ายไทย · ตัวแปรครบ · ไม่มีคำต้องห้าม) + ป้ายตัวแปรไทยครบ + parcel.ts อ่านค่าตั้งจากทะเบียน (ไม่ฝัง 14)", async () => {
    const bad: string[] = [];
    const en = SET?.getDef?.("rooms.parcel.enabled"), hd = SET?.getDef?.("rooms.parcel.holdDays");
    if (!en || en.type !== "bool" || en.defaults?._fallback !== false || !(en.chain as string[]).includes("UNIT")) bad.push(`enabled ${J({ t: en?.type, d: en?.defaults })}`);
    if (!hd || hd.type !== "days" || hd.defaults?._fallback !== 14 || hd.schema?.safeParse?.(0)?.success || hd.schema?.safeParse?.(91)?.success || !hd.schema?.safeParse?.(3)?.success) bad.push(`holdDays ${J({ t: hd?.type, d: hd?.defaults })}`);
    const need: Record<string, string[]> = {
      "rooms.msg.parcelReceived": ["roomNo", "unitName", "carrier", "receivedDate", "pickupLink"],
      "rooms.msg.parcelReminder": ["roomNo", "unitName", "carrier", "receivedDate", "pickupLink", "daysWaiting"],
    };
    for (const [k, vars] of Object.entries(need)) {
      const d = SET?.getDef?.(k);
      if (!d) { bad.push(`${k} ไม่มี`); continue; }
      const th = d.defaults?._fallback?.th ?? "";
      if (d.type !== "template" || d.group !== "msg" || !THAI.test(d.labelTh ?? "") || !THAI.test(th) || LEGAL_BAD.test(th)) bad.push(`${k} ${J({ t: d.type, g: d.group })}`);
      const miss = vars.filter((v) => !(d.templateVars ?? []).includes(v));
      if (miss.length) bad.push(`${k} ขาดตัวแปร ${miss.join(",")}`);
      if (!/\{pickupLink\}/.test(th)) bad.push(`${k} ค่าเริ่มไม่มี {pickupLink}`);
    }
    const PS = await loadIf(F.policyShared);
    const L = PS.mod?.DORM_MSG_VAR_LABEL_TH as Record<string, string> | undefined;
    const allVars = [...new Set((SET?.listDefs?.("rooms") ?? []).filter((d: Any) => d.group === "msg").flatMap((d: Any) => (d.templateVars ?? []) as string[]))] as string[];
    const noLab = allVars.filter((v) => !L || !THAI.test(L[v] ?? ""));
    if (noLab.length) bad.push(`ป้ายตัวแปรไม่มี ${noLab.join(",")}`);
    const ps = stripComments(read(F.parcel));
    for (const k of ["rooms.parcel.enabled", "rooms.parcel.holdDays"]) if (!ps.includes(k)) bad.push(`parcel.ts ไม่อ่าน ${k}`);
    if (/(\?\?|\|\|)\s*14\b|holdDays\s*[:=]\s*14\b/.test(ps)) bad.push("ฝังค่า 14 ใน parcel.ts");
    ok(ps && !bad.length, bad.join(" · ") || "ยังไม่มี parcel.ts");
  }, "MAJOR");
  await st("S-8", "minute-jobs: งาน dorm.parcel (lazy import facade → runDormParcelJobs · ส่ง budget/signal)", () => {
    const mj = stripComments(read(F.minute));
    const i = mj.search(/name:\s*["']dorm\.parcel["']/);
    ok(i >= 0, "ไม่มีงาน dorm.parcel");
    const blk = mj.slice(i, i + 500);
    ok(/everyMinutes:\s*\d+/.test(blk) && /import\(\s*["']@\/lib\/modules\/dorm["']\s*\)/.test(blk) && /runDormParcelJobs\s*\(/.test(blk), blk.slice(0, 200).replace(/\s+/g, " "));
  }, "MAJOR");
  await st("S-9", "หน้า /dp/[token]: server · loadParcelPickup → notFound · force-dynamic · noindex · referrer no-referrer · clientKey จาก x-real-ip · ไม่แตะ session/prisma", () => {
    const raw = read(F.pubPage), s = stripComments(raw);
    ok(s, `ยังไม่มี ${F.pubPage}`);
    const bad: string[] = [];
    if (/^\s*["']use client["']/.test(raw)) bad.push("use client");
    if (!/loadParcelPickup\s*\(/.test(s) || !/notFound\s*\(/.test(s)) bad.push("ไม่เรียก loadParcelPickup/notFound");
    if (!/force-dynamic/.test(s) || !/index:\s*false/.test(s) || !/referrer:\s*["']no-referrer["']/.test(s)) bad.push("force-dynamic/noindex/referrer");
    if (!/x-real-ip/.test(s)) bad.push("clientKey ไม่อ่าน x-real-ip");
    if (/requireUnit|getSession|requireMembership|@\/lib\/core\/db|@prisma\//.test(s)) bad.push("แตะ session/prisma");
    ok(!bad.length, bad.join(" · "));
  }, "MAJOR");
  await st("S-10", "จอพนักงาน: page (requireUnit · DORM · listParcels → notFound) · actions 'use server' export async function 3 ตัวเท่านั้น (ร้าน/ผู้กระทำจาก session · ไม่อ่าน tenantId/unitId/actorUserId จากฟอร์ม · ไม่ส่ง deps) · DormParcels 'use client' · คอมโพเนนต์ไม่ import โมดูล server", () => {
    const pg = stripComments(read(F.page)), raw = read(F.actions), a = stripComments(raw), c = read(F.comp), pc = read(F.pubComp);
    ok(pg && a && c && pc, "ยังไม่มีไฟล์จอ");
    const bad: string[] = [];
    if (!/requireUnit\s*\(/.test(pg) || !/["']DORM["']/.test(pg) || !/listParcels\s*\(/.test(pg) || !/notFound\s*\(/.test(pg)) bad.push("page: requireUnit/DORM/listParcels/notFound");
    if (!/^\s*["']use server["']/.test(raw)) bad.push("actions: ไม่มี use server");
    if (/export\s+(const|let|type|interface|default|class|function\s)/.test(a.replace(/export\s+async\s+function/g, ""))) bad.push("actions: export อื่น");
    for (const n of ["receiveParcelAction", "pickupParcelAction", "returnParcelAction"]) if (!new RegExp(`export\\s+async\\s+function\\s+${n}\\b`).test(a)) bad.push(`actions: ไม่มี ${n}`);
    if (!/requireUnit\s*\(/.test(a)) bad.push("actions: ไม่ใช้ requireUnit");
    if (/get\(\s*["'](tenantId|unitId|actorUserId|userId)["']\s*\)/.test(a)) bad.push("actions: อ่าน tenantId/unitId/ผู้กระทำจากฟอร์ม");
    if (/\bdeps\s*:|\bput\s*:/.test(a)) bad.push("actions: ส่ง deps");
    if (!/^\s*["']use client["']/.test(c) || !/export\s+default\b/.test(c)) bad.push("DormParcels: use client/default export");
    for (const [n, s] of [["DormParcels", c], ["DormParcelPickup", pc]] as const) {
      const imps = [...s.matchAll(/^\s*import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/gm)].filter((m) => !m[1]).map((m) => m[2]);
      const banned = imps.filter((x) => /^@prisma\//.test(x) || /^@\/lib\/(modules|platform|core\/db|core\/settings|payment|storage)/.test(x) || /^next\//.test(x) || /actions$/.test(x));
      if (banned.length) bad.push(`${n} import ต้องห้าม ${banned.join(",")}`);
    }
    if (!/export\s+default\b/.test(pc)) bad.push("DormParcelPickup: ไม่มี default export");
    ok(!bad.length, bad.join(" · "));
  }, "MAJOR");
  await st("S-11", "parcel.ts ใช้ชิ้นเดิม: tenantDb (ไม่ import prisma ดิบ) · notifyCustomer (dynamic import) · signLink/verifyLink · checkRateLimitDb · uploadFile visibility private · privateFileUrl · emitOutbox · ขอบเขตอาคาร (dormVisibleRoomsFor/scope) · ไม่ส่ง LINE ตรง", () => {
    const s = stripComments(read(F.parcel));
    ok(s, "ยังไม่มี parcel.ts");
    const need: [string, RegExp][] = [["tenantDb", /tenantDb\s*\(/], ["notifyCustomer", /notifyCustomer\s*\(/], ["import notify-customer", /import\(\s*["']@\/lib\/platform\/notify-customer["']\s*\)/],
      ["signLink", /signLink\s*\(/], ["verifyLink", /verifyLink\s*\(/], ["checkRateLimitDb", /checkRateLimitDb\s*\(/], ["uploadFile", /uploadFile\s*\(/], ["private", /visibility:\s*["']private["']/],
      ["privateFileUrl", /privateFileUrl\s*\(/], ["emitOutbox", /emitOutbox\s*\(/], ["ขอบเขตอาคาร", /dormVisibleRoomsFor|dormVisibleRoomIds|dormScopeFor|dormBuildingScope/]];
    const miss = need.filter(([, re]) => !re.test(s)).map(([n]) => n);
    const banned = /import\s*\{[^}]*\bprisma\b[^}]*\}\s*from\s+["']@\/lib\/core\/db["']/.test(read(F.parcel)) ? ["import prisma ดิบ"] : [];
    const line = /\b(pushLineMessagesToContact|pushFlexToParty|sendLineToParty|pushToContact|replyFlex|replyLineMessages)\b|api(-data)?\.line\.me/.exec(s);
    ok(!miss.length && !banned.length && !line, `ขาด ${miss.join(", ") || "—"} · ${banned.join(",") || ""} ${line ? `ส่ง LINE ตรง ${line[0]}` : ""}`);
  }, "MAJOR");
  await st("S-12", "ไม่มี any · ไม่มี getDay/getDate/getMonth/getHours/getFullYear ดิบ · ไม่มีคำต้องห้าม สคบ. ในไฟล์ของใบ", () => {
    const files = [...NEW_FILES.filter((f) => f !== F.scene)];
    const miss = files.filter((f) => !existsSync(join(ROOT, f)));
    ok(!miss.length, `ยังไม่มี ${miss.join(", ")}`);
    const anyUse = files.filter((f) => /:\s*any\b|as\s+any\b|<any>/.test(stripComments(read(f))));
    const raw = files.filter((f) => /\.(getDay|getDate|getMonth|getHours|getFullYear)\s*\(\s*\)/.test(stripComments(read(f))));
    const legal = files.filter((f) => LEGAL_BAD.test(stripComments(read(f))));
    ok(!anyUse.length && !raw.length && !legal.length, `any=${anyUse.join(",") || "—"} เวลาเครื่อง=${raw.join(",") || "—"} คำต้องห้าม=${legal.join(",") || "—"}`);
  }, "MAJOR");
  await st("S-14", "ทางเข้าจอ: UNIT_NAV.DORM มี /dorm/parcels (แท็บหอคงเดิม — d.13 K-6)", () => {
    ok(/DORM\s*:\s*\[[\s\S]{0,600}["']\/dorm\/parcels["']/.test(read(F.unitHome)), "UNIT_NAV.DORM ไม่มี /dorm/parcels");
  }, "MINOR");
  await st("S-15", "(ผู้เขียนข้อสอบตั้งแล้ว) SQC_DORM_PARCEL_SCENE ครบ (prefix · ห้อง 106/204/305 · overdueDays > 14)", () => {
    const s = SQC_DORM_PARCEL_SCENE;
    ok(s.trackingPrefix === "SQCD18" && s.rooms.waitingOverdue === "106" && s.rooms.waiting === "204" && s.rooms.pickedUp === "305" && s.overdueDays > 14, J(s));
  }, "MINOR");

  // ═══════════════ ข้อมูลทดสอบ ═══════════════
  console.log("\n── สร้างข้อมูลทดสอบ ──");
  const mkTenant = async (tag: string) => { const t = await prisma.tenant.create({ data: { name: `QC D18 ${tag}`, slug: `qc-svc-d18-${tag}-${STAMP}` } }); tenantIds.push(t.id); return t.id as string; };
  const A = await mkTenant("a"), B = await mkTenant("b");
  ids.A = A; ids.B = B;
  const mkUnit = async (tenantId: string, tag: string, name: string) => (await prisma.businessUnit.create({ data: { tenantId, type: "DORM", name, slug: `d18${tag}-${STAMP}` } })).id as string;
  const mkUser = async (key: string, tenantId: string, role: string, unitAccess: string[], perms: string[] = []) => {
    const u = await prisma.user.create({ data: { email: `svc-d18-${STAMP}-${key}@shark.local`, name: `QC D18 ${key}` } });
    const m = await prisma.membership.create({ data: { userId: u.id, tenantId, role, unitAccess, permissions: Object.fromEntries(perms.map((p) => [p, true])), acceptedAt: new Date() } });
    ids[`mb_${key}`] = m.id;
    return u.id as string;
  };
  const setVal = async (tenantId: string, key: string, scopeId: string, value: unknown) => {
    await prisma.settingValue.deleteMany({ where: { tenantId, key, scope: "UNIT", scopeId } });
    await prisma.settingValue.create({ data: { tenantId, key, scope: "UNIT", scopeId, value: value === null ? PRISMA_NS.JsonNull : value, setById: "qc-d18" } });
  };
  const unsetVal = (tenantId: string, key: string, scopeId: string) => prisma.settingValue.deleteMany({ where: { tenantId, key, scope: "UNIT", scopeId } });
  const newPhone = () => { for (;;) { const p = `08${randomInt(10_000_000, 99_999_999)}`; if (!PHONES.includes(p)) { PHONES.push(p); return p; } } };
  const mkParty = async (tenantId: string, name: string) => { NAMES.push(name); return (await prisma.party.create({ data: { tenantId, name, phone: newPhone() } })).id as string; };
  const mkLease = async (tenantId: string, unitId: string, roomId: string, partyId: string, status = "ACTIVE") =>
    (await prisma.dormLease.create({ data: {
      tenantId, unitId, roomId, partyId, status, startDate: dbDate("2026-01-01"), endDate: dbDate("2027-12-31"),
      rentSatang: 450_000, commonFeeSatang: 0, depositSatang: 0, advanceRentSatang: 0, bookingFeeSatang: 0, signedAt: new Date(), createdById: "qc-d18",
      ...(status === "ENDED" ? { endedAt: new Date("2026-08-31T10:00:00Z"), endReason: "MOVE_OUT" } : {}),
    } })).id as string;

  try {
    const DA = await mkUnit(A, "a", "หอดีสิบแปดเอ"), DX = await mkUnit(A, "x", "หอดีสิบแปดปิดพัสดุ"), DB = await mkUnit(B, "b", "หอดีสิบแปดบี");
    Object.assign(ids, { DA, DX, DB });
    const ty = async (tenantId: string, unitId: string) => (await prisma.hotelRoomType.create({ data: { tenantId, unitId, name: "มาตรฐาน", capacity: 2, baseRateSatang: 450_000, depositSatang: 0, rentMode: "MONTHLY", areaSqm: 24 } })).id as string;
    const bld = async (tenantId: string, unitId: string, name: string, sortOrder: number) => (await prisma.roomBuilding.create({ data: { tenantId, unitId, name, floors: 3, sortOrder } })).id as string;
    const room = async (tenantId: string, unitId: string, roomTypeId: string, buildingId: string, number: string) =>
      (await prisma.hotelRoom.create({ data: { tenantId, unitId, roomTypeId, number, buildingId, floorNo: Number(number.replace(/\D/g, "")[0] ?? 1), floor: number[0] } })).id as string;
    const tyA = await ty(A, DA), tyX = await ty(A, DX), tyB = await ty(B, DB);
    ids.B1 = await bld(A, DA, "อาคาร หนึ่ง", 1); ids.B2 = await bld(A, DA, "อาคาร สอง", 2);
    const BX = await bld(A, DX, "อาคาร เอ็กซ์", 1), BB = await bld(B, DB, "อาคาร บี", 1);
    for (const n of ["101", "102", "103", "104", "105", "106"]) R[n] = await room(A, DA, tyA, ids.B1, n);
    R["201"] = await room(A, DA, tyA, ids.B2, "201");
    R.x301 = await room(A, DX, tyX, BX, "301");
    R.b101 = await room(B, DB, tyB, BB, "101");
    // ผู้ใช้: OWN เจ้าของ · PK ผู้ดูแลอาคาร 1 (dorm.parcel.manage) · PK2 อาคาร 1+2 · VW ดูอย่างเดียว · OWNB เจ้าของร้าน B
    ids.OWN = await mkUser("owner", A, "OWNER", ["*"]);
    ids.PK = await mkUser("pk", A, "STAFF", [DA, DX], ["dorm.view", "dorm.parcel.manage"]);
    ids.PK2 = await mkUser("pk2", A, "STAFF", [DA], ["dorm.view", "dorm.parcel.manage"]);
    ids.VW = await mkUser("vw", A, "STAFF", [DA], ["dorm.view"]);
    ids.OWNB = await mkUser("owner-b", B, "OWNER", ["*"]);
    // ค่าตั้ง (หน่วย)
    for (const [t, u] of [[A, DA], [A, DX], [B, DB]] as const) {
      await setVal(t, "messaging.quietHours", u, null);
      await setVal(t, "messaging.channelOrder", u, ["LINE", "WEB_LINK"]);
    }
    await setVal(A, "rooms.parcel.enabled", DA, true);
    await setVal(A, "rooms.parcel.holdDays", DA, 3);
    await setVal(B, "rooms.parcel.enabled", DB, true); // holdDays ค่าเริ่ม 14
    await setVal(A, "rooms.access.managerScope", DA, "BUILDING");
    await setVal(A, "rooms.access.buildingAssignments", DA, { [ids.mb_pk]: [ids.B1], [ids.mb_pk2]: [ids.B1, ids.B2], [ids.mb_vw]: [ids.B1] });
    // LINE OA (ตัวจำลอง): OA1 = ของ DA + DX · OA2 = OA อื่นของร้าน A · OAB = ร้าน B
    const sysA = (await prisma.appSystem.create({ data: { tenantId: A, type: "CHAT", name: `qc-d18-chat-${STAMP}` } })).id;
    const sysB = (await prisma.appSystem.create({ data: { tenantId: B, type: "CHAT", name: `qc-d18-chat-b-${STAMP}` } })).id;
    const RAND = randomBytes(3).toString("hex");
    const mkConn = async (tenantId: string, sys: string, tag: string) =>
      (await prisma.chatChannelConnection.create({ data: { tenantId, systemId: sys, type: "LINE", displayName: `qc-d18-${tag}-${STAMP}`, externalAccountId: `qc-d18-${tag}-${STAMP}`, credentials: { channelAccessToken: `qcd18tok${tag}${RAND}`, channelSecret: `qcd18sec${tag}${RAND}` }, meta: { basicId: `@qcd18${tag}` } } })).id as string;
    ids.OA1 = await mkConn(A, sysA, "a1"); ids.OA2 = await mkConn(A, sysA, "a2"); ids.OAB = await mkConn(B, sysB, "b");
    ids.TOK1 = `Bearer qcd18toka1${RAND}`; ids.TOKB = `Bearer qcd18tokb${RAND}`;
    await setVal(A, "messaging.lineConnectionId", DA, ids.OA1);
    await setVal(A, "messaging.lineConnectionId", DX, ids.OA1);
    await setVal(B, "messaging.lineConnectionId", DB, ids.OAB);
    // ผู้เช่า/สัญญา
    for (const [k, n] of [["P1", "สมชาย พัสดุหนึ่ง"], ["P2", "สมหญิง พัสดุสอง"], ["P3", "ธนพล ย้ายออกแล้ว"], ["P4", "วิไล พัสดุสี่"], ["P5", "ประเสริฐ จะย้ายออก"], ["P6", "อรุณ อาคารสอง"], ["P9", "มานี ไม่มีพัสดุ"], ["PX", "คนนอก ไม่เช่า"], ["PXD", "หอปิด พัสดุ"]] as const) ids[k] = await mkParty(A, n);
    ids.PB = await mkParty(B, "ร้านบี ผู้เช่าพัสดุ");
    ids.L1 = await mkLease(A, DA, R["101"], ids.P1); ids.L2 = await mkLease(A, DA, R["102"], ids.P2); ids.L3 = await mkLease(A, DA, R["103"], ids.P3, "ENDED");
    ids.L4 = await mkLease(A, DA, R["104"], ids.P4); ids.L5 = await mkLease(A, DA, R["105"], ids.P5); ids.L6 = await mkLease(A, DA, R["201"], ids.P6);
    ids.L9 = await mkLease(A, DA, R["106"], ids.P9); ids.LX = await mkLease(A, DX, R.x301, ids.PXD); ids.LB = await mkLease(B, DB, R.b101, ids.PB);
    const mkContact = async (key: string, tenantId: string, sys: string, conn: string, partyId: string | null) => {
      const ext = `Uqcd18${key}${RAND}`;
      const row = await prisma.chatContact.create({ data: { tenantId, systemId: sys, channel: "LINE", channelConnectionId: conn, externalUserId: ext, partyId, lang: "th" } });
      C[key] = { id: row.id, ext, partyId, conn };
    };
    for (const k of ["1", "2", "3", "4", "5", "6", "9", "X", "XD"]) await mkContact(`C${k}`, A, sysA, ids.OA1, ids[`P${k}`]);
    await mkContact("C1b", A, sysA, ids.OA2, ids.P1);
    await mkContact("CB", B, sysB, ids.OAB, ids.PB);
    ready = true;
  } catch (e) { console.log(`  ⚠️ ฉาก: ${errMsg(e)}`); }

  const { DA, DX, DB } = ids;
  const cO = { tenantId: A, actorUserId: ids.OWN }, cPK = { tenantId: A, actorUserId: ids.PK }, cPK2 = { tenantId: A, actorUserId: ids.PK2 }, cVW = { tenantId: A, actorUserId: ids.VW }, cB = { tenantId: B, actorUserId: ids.OWNB };
  const recv = async (ctx: Any, unitId: string, roomId: string, key: string, extra: Record<string, unknown> = {}, now = T0) => {
    const r = keep(await D.receive()(ctx, { unitId, roomId, carrier: "Kerry Express", trackingNo: null, photo: png(key), idempotencyKey: K(key), ...extra }, { now: new Date(now), deps: noopDeps }));
    await parkOutbox(tenantIds);
    return r;
  };
  const evtOf = async (tenantId: string, parcelId: string): Promise<Any> => {
    const rows = await prisma.outboxEvent.findMany({ where: { tenantId, type: "dorm.parcel.received" } });
    const r = rows.find((x: Any) => x.payload?.parcelId === parcelId);
    return r ? { id: r.id, tenantId: r.tenantId, type: r.type, payload: r.payload, unitId: r.unitId ?? null } : null;
  };
  const outboxOf = async (type: string, parcelId: string) => (await prisma.outboxEvent.findMany({ where: { tenantId: { in: tenantIds }, type } })).filter((x: Any) => x.payload?.parcelId === parcelId);
  const filesA = () => prisma.fileAsset.count({ where: { tenantId: A } });
  const parcelRow = (id: string): Promise<Any> => prisma.dormParcel.findUnique({ where: { id } });
  const urlOf = async (parcelId: string): Promise<string> => { const u = await D.url()({ tenantId: A }, { parcelId }); seen(u); return u; };
  const tokenOf = async (parcelId: string): Promise<string> => { const u = await urlOf(parcelId); const m = /\/dp\/([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/.exec(u); return m ? m[1] : ""; };
  const scan = (ctx: Any, unitId: string, token: string, parcelId: string | null = null, now = T0) => D.pickup()(ctx, { unitId, parcelId, proof: { kind: "SCAN", token } }, { now: new Date(now), deps: noopDeps }).then(keep);
  const sign = (ctx: Any, unitId: string, parcelId: string | null, file: Any = png(`sig-${parcelId}`), now = T0) => D.pickup()(ctx, { unitId, parcelId, proof: { kind: "SIGNATURE", file } }, { now: new Date(now), deps: noopDeps }).then(keep);
  const pctx = (key: string) => ({ tenantId: C[key]?.partyId === ids.PB ? B : A, connectionId: C[key]?.conn, chatContactId: C[key]?.id, partyId: C[key]?.partyId ?? null, replyToken: null });
  const pb = async (key: string) => { const evt = PB.parsePostbackData("dorm.parcel"); ok(evt, "parse dorm.parcel"); return seen(await fnOf(lineL, "onDormPostback", F.line)(pctx(key), evt)) as Any; };
  const jobs = async (now: string, tenantId = A) => keep(await D.jobs()(new Date(now), { tenantId }));
  const linksFor = (ext: string, m = 0) => pushesTo(ext, m).flatMap((p) => pickupLinks(seen(p.json)));
  const pushCountFor = (parcelId: string, m = 0) => pushes(m).filter((p) => pickupLinks(p.json).some((l) => l.sub?.subjectId === parcelId)).length;

  // ═══════════════ PC ตัวควบคุม ═══════════════
  console.log("\n── PC ตัวควบคุม ──");
  await st("PC-1", "ฉากข้อมูลทดสอบ: 2 ร้าน · 3 หน่วยหอ · 2 อาคาร · สัญญา 9 · ผู้ติดต่อ LINE 11 · ค่าตั้งหน่วย", () => ok(ready && Object.keys(C).length === 11, `ready=${ready} contacts=${Object.keys(C).length}`));
  await st("PC-2", "signLink/verifyLink (R0.7): purpose dorm.parcel ไป-กลับได้ · purpose อื่น/ลายเซ็นปลอม ⇒ null · nonce 128 บิต (token ไม่ซ้ำ)", () => {
    const t1 = SL.signLink({ tenantId: "qc-a", purpose: "dorm.parcel", subjectId: "pclx", expMin: 60 }), t2 = SL.signLink({ tenantId: "qc-a", purpose: "dorm.parcel", subjectId: "pclx", expMin: 60 });
    eq(SL.verifyLink(t1, "dorm.parcel"), { tenantId: "qc-a", subjectId: "pclx" }, "ไป-กลับ");
    ok(SL.verifyLink(t1, "dorm.portal") === null && SL.verifyLink(`${t1.split(".")[0]}.AAAA`, "dorm.parcel") === null && t1 !== t2, "ปฏิเสธ/ไม่ซ้ำ");
    const n = JSON.parse(Buffer.from(t1.split(".")[0], "base64url").toString("utf8")).n;
    ok(Buffer.from(n, "base64url").length >= 16, `nonce ${n}`);
  });
  await st("PC-3", "notifyCustomer (R0.7) + ตัวจำลอง LINE: rooms.msg.bill ถึง P1 บน OA1 ⇒ push 1 ครั้ง (Bearer OA1) · คีย์เดิมซ้ำ ⇒ duplicate ไม่ push เพิ่ม", async () => {
    needReady();
    const m = mark();
    const input = { unitId: DA, domain: "rooms", messageKey: "bill", partyId: ids.P1, vars: { tenantName: "x", roomNo: "101", unitName: "หอ", period: "ก.ย.", amount: "฿1.00", dueDate: "5 ก.ย.", payLink: "https://qc-d18.invalid/x" }, dedupeKey: `qc-d18-pc3-${STAMP}`, at: new Date(T0) };
    const r1 = await NC.notifyCustomer({ tenantId: A }, input), r2 = await NC.notifyCustomer({ tenantId: A }, input);
    const p = pushesTo(C.C1.ext, m);
    ok(r1?.status === "SENT" && r2?.duplicate === true && p.length === 1 && p[0].auth === ids.TOK1, `r1=${J(r1)} r2=${J(r2)} push=${p.length}`);
    await prisma.serviceMessageLog.deleteMany({ where: { tenantId: A, dedupeKey: `qc-d18-pc3-${STAMP}` } });
  });
  await st("PC-4", "privateFileUrl (storage) ผูกผู้ดู: ผู้ดูเดียวกันผ่าน · คนอื่นไม่ผ่าน · หมดอายุไม่ผ่าน", () => {
    const u = STO.privateFileUrl("abcdefghij0123456789", { kind: "STAFF", id: "qc-a" });
    const p = /^\/api\/files\/([a-z0-9]+)\?exp=(\d+)&sig=([0-9a-f]{64})$/i.exec(u ?? "");
    ok(p && STO.privateFileSignatureOk(p[1], p[2], p[3], { kind: "STAFF", id: "qc-a" }) && !STO.privateFileSignatureOk(p[1], p[2], p[3], { kind: "STAFF", id: "qc-b" }) && !STO.privateFileSignatureOk(p[1], p[2], p[3], { kind: "STAFF", id: "qc-a" }, Number(p[2]) + 1), `url=${u}`);
  });
  await st("PC-5", "ขอบเขตอาคาร D.13 (dormVisibleRoomsFor): PK = ห้องอาคาร 1 (6 ห้อง) · PK2 = 7 ห้อง · เจ้าของ = ทั้งหน่วย (null)", async () => {
    needReady();
    const f = dormL.mod?.dormVisibleRoomsFor;
    ok(typeof f === "function", "ไม่มี dormVisibleRoomsFor");
    const a = await f({ tenantId: A }, { unitId: DA, userId: ids.PK }), b = await f({ tenantId: A }, { unitId: DA, userId: ids.PK2 }), o = await f({ tenantId: A }, { unitId: DA, userId: ids.OWN });
    ok(a instanceof Set && a.size === 6 && !a.has(R["201"]) && b instanceof Set && b.size === 7 && o === null, `pk=${a?.size} pk2=${b?.size} own=${J(o)}`);
  });
  await st("PC-6", "สัญญา live (D.9 portalLiveLease): L1 ✓ · L3 (ENDED) ✗ · DORM_POSTBACK_NOT_FOUND ของ D.9 เป็นข้อความไทย", async () => {
    needReady();
    const f = dormL.mod?.portalLiveLease;
    ok(typeof f === "function", "ไม่มี portalLiveLease");
    ok(!!(await f(A, ids.L1, "2026-09-01")) && (await f(A, ids.L3, "2026-09-01")) === null, "live");
    ok(THAI.test(String(lineL.mod?.DORM_POSTBACK_NOT_FOUND ?? "")), "ไม่มี DORM_POSTBACK_NOT_FOUND");
  }, "MAJOR");
  await st("PC-7", "checkRateLimitDb: เพดาน 2 ⇒ ครั้งที่ 3 ไม่ผ่าน (ตัวควบคุมของ T-2)", async () => {
    const k = CK("pc7"), o = { limit: 2, windowMs: 600_000 };
    const r = [await RL.checkRateLimitDb(k, o), await RL.checkRateLimitDb(k, o), await RL.checkRateLimitDb(k, o)];
    eq(r.map((x: Any) => x.ok), [true, true, false], "ผล");
  }, "MAJOR");

  // ═══════════════ R รับพัสดุ ═══════════════
  console.log("\n── R รับพัสดุ ──");
  await st("R-1", "เจ้าของรับพัสดุห้อง 101 (Kerry · เลข KEX1234567890 · รูป PNG) ⇒ ok · แถว WAITING ผูกสัญญา L1/P1 · ผู้รับ = ผู้กระทำ · receivedAt = now · รูปเป็นไฟล์ส่วนตัว t/<ร้าน>/private/ · event dorm.parcel.received 1 ตัว payload ตรง 3 คีย์", async () => {
    needReady();
    const r = await recv(cO, DA, R["101"], "r1", { trackingNo: "KEX1234567890" });
    ok(r?.ok === true && typeof r.parcelId === "string" && r.replayed === false && r.leaseLinked === true, `ผล ${J(r)}`);
    P.r1 = r.parcelId;
    const row = await parcelRow(r.parcelId);
    eq([row?.tenantId, row?.unitId, row?.roomId, row?.status, row?.leaseId, row?.partyId, row?.receivedById, row?.carrier], [A, DA, R["101"], "WAITING", ids.L1, ids.P1, ids.OWN, "Kerry Express"], "แถว");
    ok(row?.receivedAt?.toISOString?.() === T0, `receivedAt ${row?.receivedAt?.toISOString?.()}`);
    const fa = row?.photoFileId ? await prisma.fileAsset.findUnique({ where: { id: row.photoFileId } }) : null;
    ok(fa && String(fa.path).startsWith(`t/${A}/private/`), `รูป ${J(fa?.path)}`);
    const ev = await outboxOf("dorm.parcel.received", r.parcelId);
    ok(ev.length === 1, `event ${ev.length}`);
    eq(Object.keys(ev[0].payload).sort(), ["parcelId", "roomId", "unitId"], "payload คีย์");
    eq([ev[0].payload.parcelId, ev[0].payload.roomId, ev[0].payload.unitId], [r.parcelId, R["101"], DA], "payload ค่า");
  });
  await st("R-2", "ส่งซ้ำคีย์เดิม (มีรูป · และไม่มีรูป) ⇒ ok replayed:true parcelId เดิม · แถว 1 · ไฟล์ไม่เพิ่ม · event ไม่เพิ่ม", async () => {
    needReady();
    ok(P.r1, "ไม่มีพัสดุจาก R-1");
    const f0 = await filesA();
    const a = await recv(cO, DA, R["101"], "r1", { trackingNo: "KEX1234567890" });
    const b = keep(await D.receive()(cO, { unitId: DA, roomId: R["101"], idempotencyKey: K("r1") }, { now: new Date(T0), deps: noopDeps }));
    eq([a?.ok, a?.replayed, a?.parcelId, b?.ok, b?.replayed, b?.parcelId], [true, true, P.r1, true, true, P.r1], "ผลซ้ำ");
    eq(await prisma.dormParcel.count({ where: { tenantId: A, roomId: R["101"] } }), 1, "แถว");
    eq(await filesA(), f0, "ไฟล์");
    eq((await outboxOf("dorm.parcel.received", P.r1)).length, 1, "event");
  });
  await st("R-3", "X3 คีย์เดียวพร้อมกัน 14 ทาง (ในโพรเซส 6 + โพรเซสลูก 2×4) ห้อง 102 ⇒ ทุกทาง ok parcelId เดียว · แถว 1 · ไฟล์ +1 (ผู้แพ้ลบรูปตัวเอง) · event 1 · ไม่มี throw/P2002", async () => {
    needReady();
    const f0 = await filesA();
    const at = atIn();
    const input = { unitId: DA, roomId: R["102"], carrier: "Flash", trackingNo: null, idempotencyKey: K("r3") };
    const kids = fanout("receive", [0, 1].map(() => [0, 1, 2, 3].map(() => ({ ctx: cO, input: { ...input, photo: { data: b64(pngOf("r3")), contentType: "image/png" } }, now: T0 }))), at);
    const mine = inProcAt(at, [0, 1, 2, 3, 4, 5].map(() => () => D.receive()(cO, { ...input, photo: png("r3") }, { now: new Date(T0), deps: noopDeps })));
    const rs = [...(await mine), ...(await kids)];
    await parkOutbox(tenantIds);
    eq(badOf(rs), [], "throw/ชน");
    const idsSet = [...new Set(rs.map((r: Any) => r?.parcelId))];
    ok(rs.every((r: Any) => r?.ok === true) && idsSet.length === 1, `ผล ${[...new Set(rs.map(codeOf))].join(",")} ids=${idsSet.length}`);
    P.r3 = idsSet[0] as string;
    eq(await prisma.dormParcel.count({ where: { tenantId: A, roomId: R["102"] } }), 1, "แถว");
    eq((await filesA()) - f0, 1, "ไฟล์ที่เพิ่ม");
    eq((await outboxOf("dorm.parcel.received", P.r3)).length, 1, "event");
    eq(rs.filter((r: Any) => r?.replayed === false).length, 1, "replayed:false ต้องมีทางเดียว");
  });
  await st("R-4", "เลขพัสดุซ้ำ (ของเดิมยังรอรับ · คนละคีย์ · ตัวพิมพ์/ช่องว่างต่าง) ⇒ DUPLICATE ไม่มีแถว/ไฟล์เพิ่ม · พร้อมกัน 8 คีย์เลขเดียว (ในโพรเซส 4 + ลูก 2×2) ⇒ แถว 1 พอดี", async () => {
    needReady();
    const a = await recv(cO, DA, R["104"], "r4a", { trackingNo: "TH0001DUP" });
    ok(a?.ok === true, `ตัวแรก ${codeOf(a)}`);
    P.r4a = a.parcelId;
    const f0 = await filesA();
    const b = await recv(cO, DA, R["104"], "r4b", { trackingNo: " th0001dup " });
    ok(failIs(b, "DUPLICATE"), `ซ้ำ ${codeOf(b)}`);
    eq(await filesA(), f0, "ไฟล์หลัง DUPLICATE");
    const at = atIn();
    const mk = (i: number) => ({ unitId: DA, roomId: R["104"], carrier: null, trackingNo: "TH0002RACE", idempotencyKey: K(`r4r${i}`) });
    const kids = fanout("receive", [[0, 1], [2, 3]].map((g) => g.map((i) => ({ ctx: cO, input: { ...mk(i), photo: { data: b64(pngOf(`r4r${i}`)), contentType: "image/png" } }, now: T0 }))), at);
    const mine = inProcAt(at, [4, 5, 6, 7].map((i) => () => D.receive()(cO, { ...mk(i), photo: png(`r4r${i}`) }, { now: new Date(T0), deps: noopDeps })));
    const rs = [...(await mine), ...(await kids)];
    await parkOutbox(tenantIds);
    eq(badOf(rs), [], "throw/ชน");
    const okN = rs.filter((r: Any) => r?.ok === true).length, dupN = rs.filter((r: Any) => r?.code === "DUPLICATE").length;
    const rows = (await prisma.dormParcel.findMany({ where: { tenantId: A, unitId: DA } })).filter((x: Any) => String(x.trackingNo ?? "").replace(/\s+/g, "").toUpperCase() === "TH0002RACE");
    ok(okN === 1 && dupN === 7 && rows.length === 1, `ok=${okN} dup=${dupN} แถว=${rows.length}`);
    P.r4race = rows[0]?.id;
  });
  await st("R-5", "input/ไฟล์ผิด ⇒ ไม่มีรูป INVALID_INPUT · SVG INVALID_FILE · ไบต์หัวไม่ตรง JPEG INVALID_FILE · คีย์สั้น INVALID_INPUT · ขนส่งยาว 41 INVALID_INPUT — ไม่มีแถว/ไฟล์เพิ่ม", async () => {
    needReady();
    const n0 = await prisma.dormParcel.count({ where: { tenantId: A } }), f0 = await filesA();
    const call = (key: string, extra: Record<string, unknown>) => D.receive()(cO, { unitId: DA, roomId: R["105"], carrier: "Kerry", trackingNo: null, photo: png(key), idempotencyKey: K(key), ...extra }, { now: new Date(T0), deps: noopDeps });
    const rs = [await call("r5a", { photo: undefined }), await call("r5b", { photo: svg() }), await call("r5c", { photo: fakeJpeg() }), await call("r5d", { idempotencyKey: "x" }), await call("r5e", { carrier: "ก".repeat(41) })];
    eq(rs.map(codeOf), ["INVALID_INPUT", "INVALID_FILE", "INVALID_FILE", "INVALID_INPUT", "INVALID_INPUT"], "รหัส");
    ok(rs.every((r: Any) => THAI.test(r?.reason ?? "")), "เหตุผลไทย");
    eq([await prisma.dormParcel.count({ where: { tenantId: A } }), await filesA()], [n0, f0], "แถว/ไฟล์");
  }, "MAJOR");
  await st("R-6", "หน่วยปิดระบบพัสดุ (DX · ค่าเริ่ม ปิด) ⇒ DISABLED (เหตุผลไทย) · ไม่มีแถว", async () => {
    needReady();
    const r = await recv(cO, DX, R.x301, "r6");
    ok(failIs(r, "DISABLED"), codeOf(r));
    eq(await prisma.dormParcel.count({ where: { tenantId: A, unitId: DX } }), 0, "แถว");
  }, "MAJOR");
  await st("R-7", "ห้องไม่มีสัญญา live (103 · L3 ENDED) ⇒ ok leaseLinked:false · leaseId/partyId = null · sendParcelNotice = NO_LEASE ไม่มี log/push · ลิงก์รับพัสดุ = \"\"", async () => {
    needReady();
    const m = mark();
    const r = await recv(cO, DA, R["103"], "r7");
    ok(r?.ok === true && r.leaseLinked === false, codeOf(r));
    P.r7 = r.parcelId;
    const row = await parcelRow(r.parcelId);
    eq([row?.leaseId, row?.partyId], [null, null], "ผูกสัญญา");
    const n = keep(await D.notice()({ tenantId: A }, { parcelId: r.parcelId }, { now: new Date(T0) }));
    eq([n?.status, n?.dedupeKey], ["NO_LEASE", null], "ส่ง");
    eq(await prisma.serviceMessageLog.count({ where: { tenantId: A, dedupeKey: { contains: r.parcelId } } }), 0, "log");
    eq([pushesTo(C.C3.ext, m).length, await urlOf(r.parcelId)], [0, ""], "push/ลิงก์");
  }, "MAJOR");
  await st("R-8", "X1 ไม่พบเดียวกันทุกไบต์: PK ห้องอาคาร 2 · VW ไม่มีสิทธิ์ · เจ้าของร้าน B บนหน่วย A · ห้องร้าน B · หน่วยร้าน B · ห้องหน่วยอื่น · ห้องขยะ ⇒ NOT_FOUND เดียวกัน · ไม่มีแถว · (ตัวควบคุม: PK ห้องอาคาร 1 ได้)", async () => {
    needReady();
    const n0 = await prisma.dormParcel.count({ where: { tenantId: { in: [A, B] } } });
    const ref = await recv(cO, DA, "nope-room", "r8ref");
    ok(failIs(ref, "NOT_FOUND"), `อ้างอิง ${codeOf(ref)}`);
    NF_REF = J(ref);
    ok(ref.reason === D.NF(), "เหตุผล = PARCEL_NF_REASON");
    const rs = [await recv(cPK, DA, R["201"], "r8a"), await recv(cVW, DA, R["105"], "r8b"), await recv(cB, DA, R["105"], "r8c"), await recv(cO, DA, R.b101, "r8d"), await recv(cO, DB, R.b101, "r8e"), await recv(cO, DA, R.x301, "r8f"), await recv(cPK, DX, R["105"], "r8g")];
    const diff = rs.map((r, i) => [i, J(r)] as const).filter(([, j]) => j !== NF_REF);
    ok(!diff.length, `ต่าง: ${diff.map(([i, j]) => `#${i} ${j.slice(0, 80)}`).join(" · ")}`);
    eq(await prisma.dormParcel.count({ where: { tenantId: { in: [A, B] } } }), n0, "แถว");
    const okc = await recv(cPK, DA, R["105"], "r8ok");
    ok(okc?.ok === true, `ตัวควบคุม PK ห้อง 105 ${codeOf(okc)}`);
    P.r8ok = okc.parcelId; // ห้อง 105 (L5) — ใช้ใน N-3
  });

  // ═══════════════ N แจ้งมาถึง ═══════════════
  console.log("\n── N แจ้งพัสดุมาถึง ──");
  await st("N-1", "consumer dorm.parcel.received (R-1) ⇒ LINE 1 ข้อความถึงผู้ติดต่อของ P1 บน OA1 · มีห้อง 101 + ลิงก์ https://qc-d18.invalid/dp/<token> (verify purpose dorm.parcel = พัสดุนี้ · อายุ ≥ holdDays และ ≤ 90 วัน) · ไม่มีเบอร์ · log คีย์ rooms:parcelReceived:<id> SENT", async () => {
    needReady();
    ok(P.r1, "ไม่มีพัสดุ R-1");
    const evt = await evtOf(A, P.r1);
    ok(evt, "ไม่มี event");
    const m = mark();
    await OC.consumers["dorm.parcel.received"](evt);
    const p = pushesTo(C.C1.ext, m);
    ok(p.length === 1 && p[0].auth === ids.TOK1, `push ${p.length} auth=${p[0]?.auth === ids.TOK1}`);
    const t = textOfPush(p[0]);
    const ls = pickupLinks(seen(p[0].json));
    ok(t.includes("101") && ls.length >= 1 && ls.every((l) => l.sub?.subjectId === P.r1 && l.sub?.tenantId === A), `ข้อความ ${t.slice(0, 160)}`);
    TOK.r1 = ls[0].token;
    const now = Date.now() / 1000, e = tokenExpSec(ls[0].token);
    ok(e >= now + 3 * 86_400 - 300 && e <= now + 90 * 86_400 + 300, `อายุ token ${Math.round((e - now) / 86_400)} วัน`);
    ok(!PHONE_RE.test(t) && !LEGAL_BAD.test(t), "เบอร์/คำต้องห้าม");
    const log = await prisma.serviceMessageLog.findMany({ where: { tenantId: A, dedupeKey: `rooms:parcelReceived:${P.r1}` } });
    eq(log.map((x: Any) => x.status), ["SENT"], "log");
  });
  await st("N-2", "X4 consumer ซ้ำ: เรียกซ้ำ 1 + พร้อมกันในโพรเซส 6 + โพรเซสลูก 2×2 ⇒ ไม่มีข้อความเพิ่ม · ไม่ throw", async () => {
    needReady();
    const evt = await evtOf(A, P.r1);
    const m = mark();
    await OC.consumers["dorm.parcel.received"](evt);
    const at = atIn();
    const kids = fanout("consume", [0, 1].map(() => [0, 1].map(() => ({ evt }))), at);
    const mine = inProcAt(at, [0, 1, 2, 3, 4, 5].map(() => () => OC.consumers["dorm.parcel.received"](evt)));
    const rs = [...(await mine), ...(await kids)];
    eq(rs.filter((r: Any) => r?.threw || r?.childFail).length, 0, "throw");
    eq(pushesTo(C.C1.ext, m).length, 0, "ข้อความเพิ่ม");
  });
  await st("N-3", "อ่านสด: สัญญา L5 จบหลังรับ (R-8 ห้อง 105) ⇒ consumer ไม่ส่ง · sendParcelNotice = NO_LEASE", async () => {
    needReady();
    ok(P.r8ok, "ไม่มีพัสดุห้อง 105");
    await prisma.dormLease.update({ where: { id: ids.L5 }, data: { status: "ENDED", endedAt: new Date("2026-09-01T05:00:00Z"), endReason: "MOVE_OUT" } });
    const m = mark();
    await OC.consumers["dorm.parcel.received"](await evtOf(A, P.r8ok));
    const n = keep(await D.notice()({ tenantId: A }, { parcelId: P.r8ok }, { now: new Date(T0) }));
    eq([pushesTo(C.C5.ext, m).length, n?.status], [0, "NO_LEASE"], "push/สถานะ");
  });
  await st("N-4", "อ่านสด: รับของ (ลายเซ็น) ก่อน consumer ทำงาน ⇒ ไม่ส่ง · sendParcelNotice = NOT_WAITING", async () => {
    needReady();
    const r = await recv(cO, DA, R["102"], "n4");
    ok(r?.ok === true, codeOf(r));
    P.n4 = r.parcelId;
    const s = await sign(cO, DA, r.parcelId);
    ok(s?.ok === true && s.method === "SIGNATURE", `เซ็น ${codeOf(s)}`);
    const m = mark();
    await OC.consumers["dorm.parcel.received"](await evtOf(A, r.parcelId));
    const n = keep(await D.notice()({ tenantId: A }, { parcelId: r.parcelId }, { now: new Date(T0) }));
    eq([pushCountFor(r.parcelId, m), n?.status], [0, "NOT_WAITING"], "push/สถานะ");
  }, "MAJOR");
  await st("N-5", "เวลาเงียบ 21:00–08:00: ส่งตอน 22:00 ⇒ SKIPPED_QUIET ไม่ push · งาน 07:30 ยังไม่ส่ง · 08:05 ⇒ ส่ง 1 (resent ≥ 1) · รันซ้ำ ⇒ ไม่เพิ่ม", async () => {
    needReady();
    await setVal(A, "messaging.quietHours", DA, { start: "21:00", end: "08:00" });
    try {
      const r = await recv(cO, DA, R["104"], "n5", {}, T0);
      ok(r?.ok === true, codeOf(r));
      P.n5 = r.parcelId;
      const m = mark();
      const n = keep(await D.notice()({ tenantId: A }, { parcelId: r.parcelId }, { now: new Date(T_QUIET) }));
      ok(n?.status === "SKIPPED_QUIET" && pushCountFor(r.parcelId, m) === 0, `22:00 ${J(n)}`);
      await jobs(T_QUIET_EARLY);
      eq(pushCountFor(r.parcelId, m), 0, "07:30");
      const j = await jobs(T_QUIET_END);
      ok(pushCountFor(r.parcelId, m) === 1 && pushesTo(C.C4.ext, m).length >= 1 && (j?.resent ?? 0) >= 1, `08:05 push=${pushCountFor(r.parcelId, m)} ผล=${J(j)}`);
      await jobs(T_QUIET_END);
      eq(pushCountFor(r.parcelId, m), 1, "รันซ้ำ");
    } finally { await setVal(A, "messaging.quietHours", DA, null); }
  }, "MAJOR");

  // ═══════════════ T รับของ ═══════════════
  console.log("\n── T รับของ (หน้าสาธารณะ · สแกน · ลายเซ็น) ──");
  await st("T-1", "loadParcelPickup(token R-1): ห้อง 101 · ชื่อหน่วย · ขนส่ง · เลขท้าย 7890 · QR svg ของ pickupUrl (= ลิงก์พัสดุนี้) · ไม่มีรูป/ชื่อ/เบอร์/id/ไฟล์", async () => {
    needReady();
    ok(TOK.r1, "ไม่มี token จาก N-1");
    viewT1 = await D.load()(TOK.r1, { clientKey: CK("t1") });
    ok(viewT1, "null");
    eq([viewT1.roomNumber, viewT1.unitName, viewT1.carrier, viewT1.trackingLast4], ["101", "หอดีสิบแปดเอ", "Kerry Express", "7890"], "ค่า");
    ok(/^data:image\/svg\+xml/.test(viewT1.qrSvgDataUrl ?? "") && pickupLinks(seen(viewT1.pickupUrl)).some((l) => l.sub?.subjectId === P.r1), "QR/pickupUrl");
    const j = J(viewT1);
    const leak = [P.r1, ids.L1, ids.P1, "/api/files", "private", ...NAMES, ...PHONES].filter((x) => x && j.includes(x));
    ok(!leak.length && !PHONE_RE.test(j), `หลุด ${leak.join(",")}`);
  });
  await st("T-2", "X7 token ผิดทุกแบบ ⇒ null เหมือนกัน (ขยะ · ลายเซ็นปลอม · ตัดท้าย · purpose dorm.portal · subject พัสดุร้าน B ด้วยร้าน A · ร้าน B subject พัสดุ A · ห้องไม่มีสัญญา · สัญญาจบ) · rate limit ก่อนตรวจ: เต็ม 120 ⇒ token ถูกก็ null · คีย์อื่นได้", async () => {
    needReady();
    ok(TOK.r1, "ไม่มี token จาก N-1");
    const rb = keep(await D.receive()(cB, { unitId: DB, roomId: R.b101, carrier: null, trackingNo: null, photo: png("t2b"), idempotencyKey: K("t2b") }, { now: new Date(T0), deps: noopDeps }));
    await parkOutbox(tenantIds);
    ok(rb?.ok === true, `ร้าน B ${codeOf(rb)}`);
    P.b1 = rb.parcelId;
    const [p, s] = TOK.r1.split(".");
    const sg = (tenantId: string, purpose: string, subjectId: string) => SL.signLink({ tenantId, purpose, subjectId, expMin: 60 });
    const bads = ["abc", `${p}.${s.slice(0, -2)}${s.slice(-2) === "AA" ? "AB" : "AA"}`, TOK.r1.slice(0, -1), sg(A, "dorm.portal", P.r1), sg(A, "dorm.parcel", P.b1), sg(B, "dorm.parcel", P.r1), sg(A, "dorm.parcel", P.r7), sg(A, "dorm.parcel", P.r8ok), sg(A, "dorm.parcel", "pcl-nope")];
    const out = [];
    for (const [i, t] of bads.entries()) out.push(await D.load()(t, { clientKey: CK(`t2-${i}`) }));
    eq(out, bads.map(() => null), "ผล");
    const key = CK("t2rl");
    for (let i = 0; i < 120; i++) await RL.checkRateLimitDb(`dorm:parcel:view:${key}`, { limit: 120, windowMs: 600_000 });
    eq(await D.load()(TOK.r1, { clientKey: key }), null, "เกินเพดาน");
    ok(await D.load()(TOK.r1, { clientKey: CK("t2fresh") }), "คีย์ใหม่ต้องได้");
  });
  await st("T-3", "สแกน (PK อาคาร 1 · วาง URL เต็ม) ⇒ ok SCAN · แถว PICKED_UP pickedUpAt = now · pickedUpByPartyId = P1 · event picked_up 1 (3 คีย์) · token เดิม: หน้าสาธารณะ null · สแกนซ้ำ ALREADY_PICKED_UP", async () => {
    needReady();
    ok(TOK.r1, "ไม่มี token");
    const now = "2026-09-01T05:00:00.000Z";
    const r = await scan(cPK, DA, `${ORIGIN}/dp/${TOK.r1}`, null, now);
    ok(r?.ok === true && r.method === "SCAN" && r.parcelId === P.r1, codeOf(r));
    const row = await parcelRow(P.r1);
    ok(row?.status === "PICKED_UP" && row.pickedUpAt?.toISOString?.() === now && row.pickedUpByPartyId === ids.P1, J([row?.status, row?.pickedUpAt, row?.pickedUpByPartyId]));
    const ev = await outboxOf("dorm.parcel.picked_up", P.r1);
    ok(ev.length === 1 && isDeepStrictEqual(Object.keys(ev[0].payload).sort(), ["parcelId", "roomId", "unitId"]), `event ${J(ev.map((e: Any) => e.payload))}`);
    eq(await D.load()(TOK.r1, { clientKey: CK("t3") }), null, "หน้าสาธารณะหลังรับ");
    ok(failIs(await scan(cPK, DA, TOK.r1), "ALREADY_PICKED_UP"), "สแกนซ้ำ");
  });
  await st("T-4", "X3 รับของพร้อมกัน 10 ทาง (ในโพรเซส สแกน 3 + เซ็น 3 · ลูก 2×(สแกน+เซ็น)) พัสดุห้อง 102 ⇒ สำเร็จ 1 พอดี · ที่เหลือ ALREADY_PICKED_UP · event 1 · ไฟล์ลายเซ็นค้าง ≤ ของผู้ชนะ · ไม่มี throw", async () => {
    needReady();
    ok(P.r3, "ไม่มีพัสดุ R-3");
    const tok = await tokenOf(P.r3);
    ok(tok, "ไม่มีลิงก์รับพัสดุ (parcelPickupUrl)");
    const f0 = await filesA();
    const at = atIn();
    const sigFile = (i: number) => ({ data: b64(pngOf(`t4sig${i}`)), contentType: "image/png" });
    const kids = fanout("pickup", [0, 1].map((g) => [
      { ctx: cPK2, input: { unitId: DA, parcelId: null, proof: { kind: "SCAN", token: tok } }, now: T0 },
      { ctx: cO, input: { unitId: DA, parcelId: P.r3, proof: { kind: "SIGNATURE", file: sigFile(10 + g) } }, now: T0 },
    ]), at);
    const mine = inProcAt(at, [
      ...[0, 1, 2].map(() => () => D.pickup()(cPK, { unitId: DA, parcelId: null, proof: { kind: "SCAN", token: tok } }, { now: new Date(T0), deps: noopDeps })),
      ...[0, 1, 2].map((i) => () => D.pickup()(cO, { unitId: DA, parcelId: P.r3, proof: { kind: "SIGNATURE", file: png(`t4s${i}`) } }, { now: new Date(T0), deps: noopDeps })),
    ]);
    const rs = [...(await mine), ...(await kids)];
    eq(badOf(rs), [], "throw/ชน");
    const wins = rs.filter((r: Any) => r?.ok === true);
    ok(wins.length === 1 && rs.filter((r: Any) => r?.code === "ALREADY_PICKED_UP").length === rs.length - 1, `ผล ${rs.map(codeOf).join(",")}`);
    eq((await outboxOf("dorm.parcel.picked_up", P.r3)).length, 1, "event");
    const row = await parcelRow(P.r3);
    const want = wins[0]?.method === "SIGNATURE" ? 1 : 0;
    ok(row?.status === "PICKED_UP" && (await filesA()) - f0 === want && (want === 0 || !!row.signatureFileId), `ไฟล์เพิ่ม ${(await filesA()) - f0} ต้อง ${want} · ${J([row?.status, row?.signatureFileId])}`);
  });
  await st("T-5", "ลายเซ็น (ห้อง 103 ไม่มีสัญญา): SVG ⇒ INVALID_FILE · ไม่ระบุ parcelId ⇒ ไม่สำเร็จ · PNG ⇒ ok · signatureFileId เป็นไฟล์ส่วนตัว · pickedUpByPartyId null", async () => {
    needReady();
    ok(P.r7, "ไม่มีพัสดุ R-7");
    ok(failIs(await sign(cO, DA, P.r7, svg()), "INVALID_FILE"), "svg");
    const none = await sign(cO, DA, null);
    ok(none?.ok === false, `ไม่ระบุ parcelId ${codeOf(none)}`);
    eq((await parcelRow(P.r7))?.status, "WAITING", "ยังรอ");
    const r = await sign(cO, DA, P.r7);
    ok(r?.ok === true && r.method === "SIGNATURE", codeOf(r));
    const row = await parcelRow(P.r7);
    const fa = row?.signatureFileId ? await prisma.fileAsset.findUnique({ where: { id: row.signatureFileId } }) : null;
    ok(row?.status === "PICKED_UP" && row.pickedUpByPartyId === null && fa && String(fa.path).startsWith(`t/${A}/private/`), J([row?.status, row?.pickedUpByPartyId, fa?.path]));
  }, "MAJOR");
  await st("T-6", "X7 สแกน token ผิด/ของคนอื่น ⇒ NOT_FOUND เดียวกันทุกไบต์ (ขยะ · ปลอม · purpose dorm.portal · ร้าน B · ห้องที่สัญญาจบ · token ห้อง 101 แต่ระบุ parcelId ห้อง 104 = ผู้เช่าห้องอื่นกดรับไม่ได้) · พัสดุยังรอรับ", async () => {
    needReady();
    ok(NF_REF, "ไม่มีผลอ้างอิงจาก R-8");
    const x = await recv(cO, DA, R["101"], "t6x");
    ok(x?.ok === true && P.r4a, `พัสดุ ${codeOf(x)}`);
    P.t6x = x.parcelId;
    const tx = await tokenOf(P.t6x), tb = SL.signLink({ tenantId: B, purpose: "dorm.parcel", subjectId: P.b1, expMin: 60 });
    const [p, s] = tx.split(".");
    const rs = [
      await scan(cO, DA, "abc"), await scan(cO, DA, `${p}.${s.slice(0, -2)}${s.slice(-2) === "AA" ? "AB" : "AA"}`),
      await scan(cO, DA, SL.signLink({ tenantId: A, purpose: "dorm.portal", subjectId: ids.L1, expMin: 60 })), await scan(cO, DA, tb),
      await scan(cO, DA, SL.signLink({ tenantId: A, purpose: "dorm.parcel", subjectId: P.r8ok, expMin: 60 })), await scan(cO, DA, tx, P.r4a),
    ];
    const diff = rs.map((r, i) => [i, J(r)] as const).filter(([, j]) => j !== NF_REF);
    ok(!diff.length, `ต่าง: ${diff.map(([i, j]) => `#${i} ${j.slice(0, 80)}`).join(" · ")}`);
    eq([(await parcelRow(P.t6x))?.status, (await parcelRow(P.r4a))?.status, (await parcelRow(P.r8ok))?.status], ["WAITING", "WAITING", "WAITING"], "สถานะ");
  });
  await st("T-7", "X1 ขอบเขต: พัสดุห้อง 201 (อาคาร 2): PK สแกน ⇒ NOT_FOUND เดียวกัน · VW ⇒ NOT_FOUND · เจ้าของร้าน B (หน่วย DB/DA) ⇒ NOT_FOUND · ยังรอรับ · (ตัวควบคุม: PK2 เห็น/รับได้ — ทดสอบด้วย listParcels ใน F-1)", async () => {
    needReady();
    const z = await recv(cO, DA, R["201"], "t7z");
    ok(z?.ok === true, codeOf(z));
    P.z = z.parcelId;
    const tz = await tokenOf(P.z);
    ok(tz, "ไม่มีลิงก์");
    const rs = [await scan(cPK, DA, tz), await scan(cVW, DA, tz), await scan(cB, DB, tz), await scan(cB, DA, tz), await sign(cPK, DA, P.z)];
    const diff = rs.map((r, i) => [i, J(r)] as const).filter(([, j]) => j !== NF_REF);
    ok(!diff.length, `ต่าง: ${diff.map(([i, j]) => `#${i} ${j.slice(0, 80)}`).join(" · ")}`);
    eq((await parcelRow(P.z))?.status, "WAITING", "สถานะ");
  });
  await st("T-8", "X9 ตีกลับ: เหตุผลว่าง ⇒ INVALID_INPUT · มีเหตุผล ⇒ RETURNED + audit dorm.parcel.returned · ตีกลับซ้ำ/รับของหลังตีกลับ ⇒ BAD_STATE · PK ตีกลับพัสดุอาคาร 2 ⇒ NOT_FOUND เดียวกัน", async () => {
    needReady();
    ok(P.r4a && P.z, "ไม่มีพัสดุ");
    const ret = (ctx: Any, parcelId: string, reason: string) => D.ret()(ctx, { unitId: DA, parcelId, reason }, { now: new Date(T0) }).then(keep);
    ok(failIs(await ret(cO, P.r4a, ""), "INVALID_INPUT"), "เหตุผลว่าง");
    const r = await ret(cO, P.r4a, "ผู้เช่าแจ้งว่าไม่ใช่ของตน ส่งคืนขนส่ง");
    ok(r?.ok === true, codeOf(r));
    eq((await parcelRow(P.r4a))?.status, "RETURNED", "สถานะ");
    ok((await prisma.auditLog.count({ where: { tenantId: A, action: "dorm.parcel.returned", targetId: P.r4a } })) === 1, "audit");
    ok(failIs(await ret(cO, P.r4a, "ซ้ำอีกครั้ง"), "BAD_STATE") && failIs(await sign(cO, DA, P.r4a), "BAD_STATE"), "หลังตีกลับ");
    eq(J(await ret(cPK, P.z, "นอกขอบเขตอาคาร")), NF_REF, "นอกอาคาร");
  }, "MAJOR");

  // พัสดุค้างบนหน่วยที่ปิดระบบ (เขียนตรง — รับผ่านฟังก์ชันไม่ได้เพราะ DISABLED): ใช้ใน P-2 · J-4 · F-3 · U-2
  const parcelDX = ready ? (await prisma.dormParcel.create({ data: { tenantId: A, unitId: DX, roomId: R.x301, leaseId: ids.LX, partyId: ids.PXD, carrier: "ไปรษณีย์ไทย", receivedAt: new Date(T0), receivedById: ids.OWN } })).id as string : "";
  // ═══════════════ P postback ═══════════════
  console.log("\n── P postback dorm.parcel ──");
  await st("P-1", "C1 (P1 · สัญญา 101) กด \"พัสดุ\" ⇒ ลิงก์รับพัสดุของพัสดุที่รอรับของ L1 เท่านั้น (ไม่มีที่รับแล้ว/ของห้องอื่น) · มี \"101\" · ไม่เขียน ServiceMessageLog/AuditLog", async () => {
    needReady();
    const want = (await prisma.dormParcel.findMany({ where: { tenantId: A, leaseId: ids.L1, status: "WAITING" }, select: { id: true } })).map((x: Any) => x.id).sort();
    ok(want.length >= 1, "ไม่มีพัสดุรอรับของ L1 (ฉาก)");
    const n0 = [await prisma.serviceMessageLog.count({ where: { tenantId: A } }), await prisma.auditLog.count({ where: { tenantId: A } })];
    const r = await pb("C1");
    const subs = [...new Set(pickupLinks(r).map((l) => l.sub?.subjectId))].sort();
    eq(subs, want, "พัสดุในลิงก์");
    ok(J(r).includes("101") && !PHONE_RE.test(J(r)) && !NAMES.some((n) => J(r).includes(n)), `ข้อความ ${J(r).slice(0, 160)}`);
    eq([await prisma.serviceMessageLog.count({ where: { tenantId: A } }), await prisma.auditLog.count({ where: { tenantId: A } })], n0, "แถวที่เขียน");
  }, "MAJOR");
  await st("P-2", "ไม่ใช่เจ้าของ ⇒ DORM_POSTBACK_NOT_FOUND ตรงตัว (คนนอก CX · OA อื่น C1b · สัญญาจบ C3) · ผู้เช่าไม่มีพัสดุ (C9) ⇒ ข้อความไทยไม่มีลิงก์ (ไม่ใช่ข้อความกลาง) · หน่วยปิดระบบ (CXD) ⇒ ข้อความไทยไม่มีลิงก์", async () => {
    needReady();
    const NFT = valOf(lineL, "DORM_POSTBACK_NOT_FOUND", F.line);
    for (const k of ["CX", "C1b", "C3"]) eq((await pb(k))?.text, NFT, `ข้อความกลาง ${k}`);
    for (const k of ["C9", "CXD"]) {
      const r = await pb(k);
      ok(typeof r?.text === "string" && THAI.test(r.text) && r.text !== NFT && pickupLinks(r).length === 0 && !LEGAL_BAD.test(r.text), `${k}: ${J(r).slice(0, 120)}`);
    }
  }, "MAJOR");

  // ═══════════════ J เตือนค้าง ═══════════════
  console.log("\n── J เตือนค้าง (งานตามเวลา) ──");
  // พัสดุที่รอรับของหน่วย DA (ทุกตัวรับเมื่อ T0 · holdDays 3): t6x (101) · r4race (104) · n5 (104) · z (201) — ห้ามเตือน: r8ok (สัญญา L5 จบ) · r4a (ตีกลับ) · r1/r3/n4/r7 (รับแล้ว) · parcelDX (หน่วยปิดระบบ)
  const remindRows = async (parcelId: string) => (await prisma.serviceMessageLog.findMany({ where: { tenantId: { in: tenantIds }, dedupeKey: { startsWith: `rooms:parcelReminder:${parcelId}:` } } })).map((x: Any) => [x.dedupeKey, x.status]);
  const jm = mark();
  const never = () => ({ r8ok: pushCountFor(P.r8ok, jm), r4a: pushCountFor(P.r4a, jm), r1: pushCountFor(P.r1, jm), r3: pushCountFor(P.r3, jm), dx: pushCountFor(parcelDX, jm), cxd: pushesTo(C.CXD?.ext ?? "-", jm).length, c5: pushesTo(C.C5?.ext ?? "-", jm).length });
  await st("J-1", "holdDays หน่วย = 3: วันที่ 3 ก.ย. (รอ 2 วัน) ⇒ ไม่เตือน · 4 ก.ย. 10:00 (รอ 3 วัน) ⇒ t6x เตือน 1 ถึง C1 (ห้อง 101 + ลิงก์ของพัสดุนี้ + เลข 3) · remindCount 1 · lastRemindedAt · log rooms:parcelReminder:<id>:20260904 SENT", async () => {
    needReady();
    ok(P.t6x, "ไม่มีพัสดุ t6x");
    await jobs("2026-09-03T03:00:00.000Z");
    eq(pushCountFor(P.t6x, jm), 0, "3 ก.ย.");
    const r = await jobs("2026-09-04T03:00:00.000Z");
    const p = pushesTo(C.C1.ext, jm).filter((x) => pickupLinks(x.json).some((l) => l.sub?.subjectId === P.t6x));
    ok(p.length === 1 && textOfPush(p[0]).includes("101") && textOfPush(p[0]).includes("3") && (r?.reminded ?? 0) >= 1, `push=${p.length} ผล=${J(r)} ${textOfPush(p[0]).slice(0, 120)}`);
    seen(p[0]?.json);
    const row = await parcelRow(P.t6x);
    ok(row?.remindCount === 1 && !!row.lastRemindedAt, J([row?.remindCount, row?.lastRemindedAt]));
    eq(await remindRows(P.t6x), [[`rooms:parcelReminder:${P.t6x}:20260904`, "SENT"]], "log");
  });
  await st("J-2", "X5 วันเดียวกัน: รันซ้ำ 15:00 + พร้อมกันในโพรเซส 2 + โพรเซสลูก 2 ⇒ ไม่มีเตือนเพิ่ม (ทุกพัสดุ ≤ 1 ต่อวัน) · remindCount คง 1", async () => {
    needReady();
    const before = { t6x: pushCountFor(P.t6x, jm), r4race: pushCountFor(P.r4race, jm), n5: pushCountFor(P.n5, jm), z: pushCountFor(P.z, jm) };
    ok(Object.values(before).every((n) => n === 1), `หลัง J-1 ทุกพัสดุที่รอต้องได้ 1: ${J(before)}`);
    await jobs("2026-09-04T08:00:00.000Z");
    const at = atIn();
    const kids = fanout("jobs", [[{ now: "2026-09-04T08:10:00.000Z", tenantId: A }], [{ now: "2026-09-04T08:10:00.000Z", tenantId: A }]], at);
    const mine = inProcAt(at, [0, 1].map(() => () => D.jobs()(new Date("2026-09-04T08:10:00.000Z"), { tenantId: A })));
    const rs = [...(await mine), ...(await kids)];
    eq(rs.filter((r: Any) => r?.threw || r?.childFail).length, 0, "throw");
    eq({ t6x: pushCountFor(P.t6x, jm), r4race: pushCountFor(P.r4race, jm), n5: pushCountFor(P.n5, jm), z: pushCountFor(P.z, jm) }, before, "จำนวนเตือน");
    eq((await parcelRow(P.t6x))?.remindCount, 1, "remindCount");
  });
  await st("J-3", "วันถัดไป 5 ก.ย. ⇒ เตือนอีก 1 (รวม 2) · remindCount 2", async () => {
    needReady();
    await jobs("2026-09-05T03:00:00.000Z");
    eq([pushCountFor(P.t6x, jm), (await parcelRow(P.t6x))?.remindCount], [2, 2], "เตือน/นับ");
  });
  await st("J-4", "ไม่เตือน: สัญญาจบ (105) · ตีกลับ (104 r4a) · รับแล้ว (101 r1 · 102 r3) · หน่วยปิดระบบ (DX) — push 0 · remindCount 0", async () => {
    needReady();
    eq(never(), { r8ok: 0, r4a: 0, r1: 0, r3: 0, dx: 0, cxd: 0, c5: 0 }, "push");
    const rc = await prisma.dormParcel.findMany({ where: { id: { in: [P.r8ok, P.r4a, P.r1, P.r3, parcelDX].filter(Boolean) } }, select: { remindCount: true } });
    ok(rc.length === 5 && rc.every((x: Any) => x.remindCount === 0), J(rc));
  });
  await st("J-5", "เวลาเงียบ: 6 ก.ย. 22:00 และ 7 ก.ย. 06:30 ⇒ ไม่ส่ง · 7 ก.ย. 08:05 ⇒ ส่ง 1 (ของ 6 ก.ย. ไม่ส่งย้อนหลัง · รวม 3)", async () => {
    needReady();
    await setVal(A, "messaging.quietHours", DA, { start: "21:00", end: "08:00" });
    try {
      await jobs("2026-09-06T15:00:00.000Z");
      await jobs("2026-09-06T23:30:00.000Z");
      eq(pushCountFor(P.t6x, jm), 2, "ช่วงเงียบ");
      await jobs("2026-09-07T01:05:00.000Z");
      eq([pushCountFor(P.t6x, jm), (await parcelRow(P.t6x))?.remindCount], [3, 3], "08:05");
      await jobs("2026-09-07T02:00:00.000Z");
      eq(pushCountFor(P.t6x, jm), 3, "รันซ้ำวันเดียวกัน");
    } finally { await setVal(A, "messaging.quietHours", DA, null); }
  }, "MAJOR");
  await st("J-6", "ค่าเริ่ม 14 (ร้าน B) + จำกัดร้าน: งานของร้าน A วันที่ 15 ก.ย. ไม่ส่งถึงร้าน B · ร้าน B 14 ก.ย. (รอ 13 วัน) ⇒ ไม่เตือน · 15 ก.ย. (รอ 14) ⇒ เตือน 1 ถึง CB ผ่าน OA ของร้าน B", async () => {
    needReady();
    ok(P.b1, "ไม่มีพัสดุร้าน B (T-2)");
    const m = mark();
    await jobs("2026-09-15T03:00:00.000Z", A);
    eq(pushesTo(C.CB.ext, m).length, 0, "งานร้าน A");
    await jobs("2026-09-14T03:00:00.000Z", B);
    eq(pushesTo(C.CB.ext, m).length, 0, "14 ก.ย.");
    await jobs("2026-09-15T03:00:00.000Z", B);
    const p = pushesTo(C.CB.ext, m);
    ok(p.length === 1 && p[0].auth === ids.TOKB && pickupLinks(seen(p[0].json)).every((l) => l.sub?.tenantId === B && l.sub?.subjectId === P.b1), `push=${p.length} ${textOfPush(p[0]).slice(0, 100)}`);
  }, "MAJOR");

  // ═══════════════ F รูปส่วนตัว · รายการ ═══════════════
  console.log("\n── F รายการ · รูปส่วนตัว (X10) ──");
  await st("F-1", "listParcels(PK · อาคาร 1 · ALL): เฉพาะห้องอาคาร 1 (ไม่มี 201) · photoUrl = /api/files/<photoFileId>?exp&sig ผ่านเฉพาะ PK · คนอื่น/หมดอายุไม่ผ่าน · อายุ ≤ 900 วิ · ไม่มี path/private:// · ชื่อแรกเท่านั้น · ตัวควบคุม: PK2 เห็น 201", async () => {
    needReady();
    const now = "2026-09-07T03:00:00.000Z";
    const r = keep(await D.list()(cPK, { unitId: DA, status: "ALL" }, { now: new Date(now) }));
    ok(r?.ok === true && Array.isArray(r.rows), codeOf(r));
    const rooms = [...new Set(r.rows.map((x: Any) => x.roomNumber))];
    ok(!rooms.includes("201") && r.rows.length >= 6, `ห้อง ${rooms.join(",")} n=${r.rows.length}`);
    const bad: string[] = [];
    const nowS = Math.floor(Date.now() / 1000);
    for (const row of r.rows) {
      const db = await parcelRow(row.parcelId);
      if (!db || db.roomId !== row.roomId) { bad.push(`แถว ${row.parcelId}`); continue; }
      if (!db.photoFileId) { if (row.photoUrl !== null) bad.push("photoUrl ไม่ null"); continue; }
      const p = /^\/api\/files\/([a-z0-9]+)\?exp=(\d+)&sig=([0-9a-f]{64})$/i.exec(row.photoUrl ?? "");
      if (!p || p[1] !== db.photoFileId) { bad.push(`url ${row.photoUrl}`); continue; }
      if (!STO.privateFileSignatureOk(p[1], p[2], p[3], { kind: "STAFF", id: ids.PK })) bad.push("ผู้ดูเดียวกันไม่ผ่าน");
      if (STO.privateFileSignatureOk(p[1], p[2], p[3], { kind: "STAFF", id: ids.OWN })) bad.push("คนอื่นผ่าน");
      if (STO.privateFileSignatureOk(p[1], p[2], p[3], { kind: "STAFF", id: ids.PK }, Number(p[2]) + 1)) bad.push("หมดอายุผ่าน");
      if (Number(p[2]) - nowS > 900) bad.push(`อายุ ${Number(p[2]) - nowS}`);
    }
    const j = J(r);
    if (/private:\/\/|t\/[^"]*\/private\//.test(j)) bad.push("มี path ส่วนตัว");
    if (PHONE_RE.test(j) || NAMES.some((n) => j.includes(n))) bad.push("มีเบอร์/ชื่อเต็ม");
    const t6 = r.rows.find((x: Any) => x.parcelId === P.t6x);
    if (!t6 || t6.tenantFirstName !== "สมชาย" || t6.overdue !== true || t6.daysWaiting !== 6 || t6.status !== "WAITING") bad.push(`t6x ${J(t6)}`);
    ok(!bad.length, [...new Set(bad)].join(" · "));
    const r2 = await D.list()(cPK2, { unitId: DA, status: "WAITING" }, { now: new Date(now) });
    ok(r2?.ok === true && r2.rows.some((x: Any) => x.parcelId === P.z), "PK2 ต้องเห็น 201");
  });
  await st("F-2", "listParcels ค่าเริ่ม = WAITING · counts ตรงแถวที่เห็น · ไม่พบเดียวกัน: VW · เจ้าของร้าน B บน DA · เจ้าของ A บน DB ⇒ NOT_FOUND ทุกไบต์เท่าผลอ้างอิง", async () => {
    needReady();
    const now = new Date("2026-09-07T03:00:00.000Z");
    const r = await D.list()(cO, { unitId: DA }, { now });
    ok(r?.ok === true && r.rows.every((x: Any) => x.status === "WAITING"), codeOf(r));
    const all = await D.list()(cO, { unitId: DA, status: "ALL" }, { now });
    const cnt = (s: string) => all.rows.filter((x: Any) => x.status === s).length;
    eq([r.counts?.waiting, r.counts?.overdue, r.counts?.pickedUp, r.counts?.returned], [cnt("WAITING"), all.rows.filter((x: Any) => x.overdue).length, cnt("PICKED_UP"), cnt("RETURNED")], "counts");
    const rs = [await D.list()(cVW, { unitId: DA }, { now }), await D.list()(cB, { unitId: DA }, { now }), await D.list()(cO, { unitId: DB }, { now })];
    eq(rs.map((x) => J(x)), rs.map(() => NF_REF), "ไม่พบ");
  });
  await st("F-3", "หน่วยปิดระบบยังดูรายการได้: listParcels(DX) ⇒ ok enabled:false · มีพัสดุที่ค้างอยู่", async () => {
    needReady();
    const r = await D.list()(cO, { unitId: DX }, { now: new Date(T0) });
    ok(r?.ok === true && r.enabled === false && r.rows.some((x: Any) => x.parcelId === parcelDX) && r.holdDays === 14, J(r).slice(0, 200));
  }, "MAJOR");

  // ═══════════════ U DOM ═══════════════
  console.log("\n── U DOM ──");
  const compL = await loadIf(F.comp), pubCompL = await loadIf(F.pubComp);
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
  const noopActions = { receive: async () => ({}), pickup: async () => ({}), returnParcel: async () => ({}) };
  await st("U-1", "DormParcels (เปิดระบบ): ราก data-dorm-parcels data-enabled=true · ฟอร์มรับ (ห้อง · ขนส่ง · เลข · กล้อง accept=image/* capture=environment · idempotencyKey) · แถวครบ + สถานะ + ป้ายเกินกำหนด · รูปจาก /api/files · ฟอร์มสแกน token · ช่องเซ็น/ตีกลับ · ไม่มีเบอร์/ชื่อเต็ม/token", async () => {
    needReady();
    const model = await D.list()(cO, { unitId: DA, status: "ALL" }, { now: new Date("2026-09-07T03:00:00.000Z") });
    ok(model?.ok === true, codeOf(model));
    const rooms = Object.entries(R).filter(([k]) => /^\d+$/.test(k)).map(([n, id]) => ({ roomId: id, roomNumber: n }));
    const h = render(compL, F.comp, { model, canReceive: true, rooms, actions: noopActions });
    ok(/data-enabled="true"/.test(tagWith(h, "data-dorm-parcels") ?? ""), "ราก");
    ok(tagWith(h, "data-parcel-receive") && /<select[^>]*name="roomId"/.test(h) && /name="carrier"/.test(h) && /name="trackingNo"/.test(h) && /name="idempotencyKey"/.test(h), "ฟอร์มรับ");
    const file = /<input[^>]*type="file"[^>]*name="photo"[^>]*>|<input[^>]*name="photo"[^>]*type="file"[^>]*>/.exec(h)?.[0] ?? "";
    ok(/accept="image\/\*"/.test(file) && /capture="environment"/.test(file), `กล้อง ${file}`);
    eq((h.match(/data-parcel-row="/g) ?? []).length, model.rows.length, "จำนวนแถว");
    ok(tagWith(h, "data-parcel-row", P.t6x) && tagWith(h, "data-parcel-overdue") && /data-parcel-status="PICKED_UP"/.test(h), "แถว/สถานะ/เกินกำหนด");
    ok(/<img[^>]*data-parcel-photo[^>]*src="\/api\/files\//.test(h) || /<img[^>]*src="\/api\/files\/[^"]*"[^>]*data-parcel-photo/.test(h), "รูป");
    ok(tagWith(h, "data-parcel-scan") && /name="token"/.test(h) && tagWith(h, "data-parcel-sign", P.t6x) && tagWith(h, "data-parcel-return", P.t6x), "สแกน/เซ็น/ตีกลับ");
    const t = textOf(h);
    ok(!PHONE_RE.test(h) && !NAMES.some((n) => t.includes(n)) && !/private:\/\//.test(h) && ![...SEEN_TOKENS].some((x) => h.includes(x.split(".")[1] ?? "~")), "เบอร์/ชื่อเต็ม/token");
  }, "MAJOR");
  await st("U-2", "DormParcels (ปิดระบบ DX): data-enabled=false · \"ระบบพัสดุปิดอยู่\" · ไม่มีฟอร์มรับ", async () => {
    needReady();
    const model = await D.list()(cO, { unitId: DX, status: "ALL" }, { now: new Date(T0) });
    const h = render(compL, F.comp, { model, canReceive: true, rooms: [{ roomId: R.x301, roomNumber: "301" }], actions: noopActions });
    ok(/data-enabled="false"/.test(tagWith(h, "data-dorm-parcels") ?? "") && textOf(h).includes("ระบบพัสดุปิดอยู่") && !tagWith(h, "data-parcel-receive"), textOf(h).slice(0, 120));
  }, "MAJOR");
  await st("U-3", "DormParcelPickup: ราก data-parcel-pickup · \"พัสดุห้อง 101\" · img data-parcel-qr (svg) · ข้อความให้แสดง QR · ไม่มีรูปพัสดุ/ชื่อ/เบอร์", () => {
    needReady();
    ok(viewT1, "ไม่มี view จาก T-1");
    const h = render(pubCompL, F.pubComp, { view: viewT1 });
    const q = tagWith(h, "data-parcel-qr") ?? "";
    ok(tagWith(h, "data-parcel-pickup") && textOf(h).includes("พัสดุห้อง 101") && /src="data:image\/svg\+xml/.test(q) && /QR/.test(textOf(h)), `${textOf(h).slice(0, 120)}`);
    ok(!/\/api\/files\//.test(h) && !PHONE_RE.test(h) && !NAMES.some((n) => textOf(h).includes(n)), "รูป/ชื่อ/เบอร์");
  }, "MAJOR");

  // ═══════════════ M PII · token · สคบ. ═══════════════
  console.log("\n── M PII · token · ข้อความ ──");
  await st("M-1", "X8 payload event dorm.parcel.* ทุกตัว = 3 คีย์ id ล้วน · audit dorm.parcel.* · ServiceMessageLog ของใบ ไม่มีเบอร์/ชื่อ/token · dedupeKey รูป rooms:parcelReceived:<id> / rooms:parcelReminder:<id>:<YYYYMMDD>", async () => {
    needReady();
    const ev = await prisma.outboxEvent.findMany({ where: { tenantId: { in: tenantIds }, type: { startsWith: "dorm.parcel." } } });
    const au = await prisma.auditLog.findMany({ where: { tenantId: { in: tenantIds }, action: { startsWith: "dorm.parcel." } } });
    const sml = await prisma.serviceMessageLog.findMany({ where: { tenantId: { in: tenantIds }, messageKey: { in: ["parcelReceived", "parcelReminder"] } } });
    ok(ev.length >= 8 && au.length >= 1 && sml.length >= 3, `ev=${ev.length} audit=${au.length} sml=${sml.length}`);
    const badEv = ev.filter((e: Any) => !isDeepStrictEqual(Object.keys(e.payload ?? {}).sort(), ["parcelId", "roomId", "unitId"]));
    const blob = J([ev, au, sml]);
    const leak = [...NAMES, ...PHONES].filter((x) => blob.includes(x));
    const badKey = sml.filter((s: Any) => !/^rooms:parcel(Received:[A-Za-z0-9_-]+|Reminder:[A-Za-z0-9_-]+:\d{8})$/.test(s.dedupeKey));
    ok(!badEv.length && !leak.length && !PHONE_RE.test(blob) && !badKey.length && ![...SEEN_TOKENS].some((t) => blob.includes(t.split(".")[1] ?? "~")), `payload=${badEv.length} หลุด=${leak.join(",")} key=${J(badKey.map((s: Any) => s.dedupeKey)).slice(0, 120)}`);
  });
  await st("M-2", "X7 token ไม่อยู่ในฐาน (ไม่มีทั้งตัวดิบในตารางใดของร้านทดสอบ — เก็บได้แค่ hash/ไม่เก็บ) · เห็น token ≥ 3 ตัวระหว่างข้อสอบ", async () => {
    needReady();
    const toks = [...SEEN_TOKENS];
    ok(toks.length >= 3, `token ที่เห็น ${toks.length}`);
    // ลายเซ็น HMAC (ส่วนหลังจุด) ของทุก token — base64url ไม่มีอักขระพิเศษของ regex ยกเว้น "-" (นอกวงเล็บเหลี่ยม = ตัวอักษรธรรมดา)
    const sigs = toks.map((t) => t.split(".")[1] ?? "").filter((x) => x.length >= 20);
    const alt = `(${sigs.join("|")})`;
    const hit: string[] = [];
    for (const t of await tablesWithTenant()) {
      const r: { n: bigint }[] = await prisma.$queryRawUnsafe(`SELECT count(*)::bigint AS n FROM "${t}" x WHERE x."tenantId" = ANY($1::text[]) AND x::text ~ $2`, tenantIds, alt);
      if (Number(r[0]?.n ?? 0)) hit.push(t);
    }
    // ตัวควบคุม: regex เดียวกันต้องเจอ token ถ้าเขียนลงตาราง (ใส่แถว AuditLog ปลอมชั่วคราวในร้านทดสอบ)
    const probe = await prisma.auditLog.create({ data: { tenantId: A, actorType: "SYSTEM", action: "qc.d18.probe", targetType: "QC", targetId: "probe", after: { t: toks[0] } } });
    const pr: { n: bigint }[] = await prisma.$queryRawUnsafe(`SELECT count(*)::bigint AS n FROM "AuditLog" x WHERE x."tenantId" = ANY($1::text[]) AND x::text ~ $2`, tenantIds, alt);
    await prisma.auditLog.delete({ where: { id: probe.id } });
    ok(Number(pr[0]?.n ?? 0) === 1, `ตัวควบคุม regex ไม่เจอ token ที่ใส่เอง (${pr[0]?.n})`);
    eq(hit, [], "ตารางที่มี token");
  });
  await st("M-3", "ข้อความที่ส่งจริงทุกตัวของใบ: ไทย · ไม่มีคำต้องห้าม สคบ. · ไม่มีเบอร์ · ไม่มีชื่อเต็ม", () => {
    needReady();
    const mine = pushes().filter((p) => pickupLinks(p.json).length > 0);
    ok(mine.length >= 5, `ข้อความของใบ ${mine.length}`);
    const bad = mine.filter((p) => { const t = textOfPush(p); return !THAI.test(t) || LEGAL_BAD.test(t) || PHONE_RE.test(t) || NAMES.some((n) => t.includes(n)); });
    eq(bad.map((p) => textOfPush(p).slice(0, 80)), [], "ข้อความผิด");
  }, "MAJOR");
  await st("M-4", "ไม่มีคำขอออกนอกเครื่อง (ไม่ยิง LINE จริง)", () => eq(BLOCKED, [], "คำขอนอกเครื่อง"), "MINOR");
} catch (e) {
  record("CRASH", "จบกลางทาง", "FAIL", errMsg(e), "CRITICAL");
} finally {
  // ═══════════════ Z ล้างข้อมูล ═══════════════
  console.log("\n── Z: ล้างข้อมูล ──");
  try { await cleanup(tenantIds); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); }
  await cleanupMisc();
  await st("Z-1", "หลังล้าง: tenant `qc-svc-d18-*` 0 · แถวของร้านทดสอบ 0 ทุกตาราง (พัสดุ/ไฟล์/log/outbox/ค่าตั้ง/audit) · ผู้ใช้ทดสอบ 0 · rate bucket ของรอบ 0", async () => {
    eq(await prisma.tenant.count({ where: { slug: { startsWith: "qc-svc-d18-" } } }), 0, "tenant");
    const left: string[] = [];
    if (tenantIds.length) for (const t of await tablesWithTenant()) { const r: { n: bigint }[] = await prisma.$queryRawUnsafe(`SELECT count(*)::bigint AS n FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, tenantIds); if (Number(r[0]?.n ?? 0)) left.push(t); }
    eq(left, [], "ตารางที่ค้าง");
    eq(await prisma.user.count({ where: { email: { startsWith: "svc-d18-" } } }), 0, "user");
    const rb: { n: bigint }[] = await prisma.$queryRawUnsafe(`SELECT count(*)::bigint AS n FROM "ChatRateBucket" WHERE key LIKE $1`, `%qc-d18-${STAMP}%`);
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
const OWN_EDIT = [F.dormIndex, F.line, F.perms, F.defs, F.policyShared, F.consumers, F.autoLabels, F.minute, F.unitHome];
const OWN_FIXED = new Set<string>([F.parcel, F.page, F.actions, F.comp, F.pubPage, F.pubComp, ...OWN_EDIT]);
{
  const ch = dirty(["src", "prisma", "public"]);
  const headHas = (() => { try { git(["cat-file", "-e", `HEAD:${F.parcel}`]); return true; } catch { return false; } })();
  if (ch.length === 0 && headHas) skip("S-1", "แตะเฉพาะไฟล์ของใบ (§1)", "D.18 merge แล้ว — ข้อนี้ตรวจเฉพาะตอนรับใบ (git status ของทรีงาน)");
  else await st("S-1", "แตะเฉพาะไฟล์ของใบ (§1 · git status ตอนรับใบ) · มีไฟล์ใหม่ครบ", () => {
    const outside = ch.filter((f) => !OWN_FIXED.has(f));
    ok(outside.length === 0, `ไฟล์นอกใบ: ${outside.slice(0, 8).join(", ")}`);
    const miss = [F.parcel, F.page, F.comp, F.pubPage].filter((f) => !existsSync(join(ROOT, f)));
    ok(miss.length === 0, `ยังไม่มี: ${miss.join(", ")}`);
  });
}
await st("S-2", "ไม่แตะชิ้นต้องห้าม: prisma · core (นอก permissions/defs/rooms) · notify-customer · postback-routes · dorm-portal · พอร์ทัล /d · storage · /api/files · แชท · payment · บัญชี · โมดูลหอเดิม · แท็บหอ · layout หอ · webhooks/labels", () => {
  const banned = dirty(["prisma", "src/lib/core", "src/lib/platform/notify-customer.ts", "src/lib/platform/postback-routes.ts", "src/lib/platform/dorm-portal.ts", "src/app/(store)/d", "src/lib/storage", "src/app/api/files",
    "src/lib/modules/chat", "src/lib/payment", "src/lib/modules/account", "src/lib/modules/dorm", "src/components/dorm/dorm-home-shared.ts", "src/app/app/u/[unitSlug]/dorm/layout.tsx", "src/lib/webhooks/labels.ts"])
    .filter((f) => ![F.perms, F.defs, F.parcel, F.dormIndex].includes(f as never));
  eq(banned, [], "ไฟล์");
});
await st("S-13", "แก้ไฟล์ร่วมแบบเพิ่ม: dorm-line.ts ลบ ≤ 1 บรรทัด + มี case \"parcel\" · dorm/index.ts · consumers · automation labels · minute-jobs · defs/rooms · dorm-policy-shared ไม่ลบบรรทัด · permissions ลบ ≤ 1 (planned) · หน้าแรกหน่วยไม่ลบบรรทัด", () => {
  const rm = (f: string) => diffLines(f).filter((l) => l.startsWith("-") && l.slice(1).trim()).length;
  const bad: string[] = [];
  if (rm(F.line) > 1) bad.push(`dorm-line ลบ ${rm(F.line)}`);
  if (!/case\s+["']parcel["']\s*:/.test(stripComments(read(F.line)))) bad.push("dorm-line ไม่มี case parcel");
  for (const f of [F.dormIndex, F.consumers, F.autoLabels, F.minute, F.defs, F.policyShared, F.unitHome]) if (rm(f) > 0) bad.push(`${f} ลบ ${rm(f)}`);
  if (rm(F.perms) > 1) bad.push(`permissions ลบ ${rm(F.perms)}`);
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
  const sceneRows = () => prisma.dormParcel.findMany({ where: { tenantId: SQC_TENANT.id, trackingNo: { startsWith: SQC_DORM_PARCEL_SCENE.trackingPrefix } } });
  const n1 = "ฉาก svc-qc-parcel-scene: รันได้ · รันซ้ำ = 0/0/0 · แถว 106 WAITING (เกินกำหนด) · 204 WAITING · 305 PICKED_UP · ไม่เขียน SettingValue/OutboxEvent/ServiceMessageLog";
  const n2 = "บนฉาก: listParcels(owner svcqc) ⇒ enabled:false (ระบบคงปิด) · รอ 2 · เกินกำหนด 1 · fai (ไม่มี dorm.parcel.manage) ⇒ NOT_FOUND · --clear ลบเฉพาะแถวฉาก แล้วรันคืน";
  if (why) { skip("Q-1", n1, why, "MAJOR"); skip("Q-2", n2, why, "MAJOR"); }
  else {
    await st("Q-1", n1, async () => {
      ok(existsSync(join(ROOT, F.scene)), `ยังไม่มี ${F.scene}`);
      const c0 = [await prisma.settingValue.count({ where: { tenantId: SQC_TENANT.id } }), await prisma.outboxEvent.count({ where: { tenantId: SQC_TENANT.id } }), await prisma.serviceMessageLog.count({ where: { tenantId: SQC_TENANT.id } })];
      const a = runScene();
      ok(a.status === 0, `รอบแรก exit=${a.status} ${`${a.stdout}${a.stderr}`.split("\n").slice(-3).join(" | ").slice(0, 200)}`);
      const b = runScene();
      eq(summary(`${b.stdout}`), { created: 0, updated: 0, removed: 0 }, "รอบสอง");
      const rows = await sceneRows();
      const rooms = await prisma.hotelRoom.findMany({ where: { id: { in: rows.map((r: Any) => r.roomId) } }, select: { id: true, number: true } });
      const num = new Map(rooms.map((r: Any) => [r.id, r.number]));
      const got = rows.map((r: Any) => `${num.get(r.roomId)}:${r.status}`).sort();
      eq(got, ["106:WAITING", "204:WAITING", "305:PICKED_UP"], "แถวฉาก");
      ok(rows.every((r: Any) => r.unitId === unitId), "หน่วย");
      eq([await prisma.settingValue.count({ where: { tenantId: SQC_TENANT.id } }), await prisma.outboxEvent.count({ where: { tenantId: SQC_TENANT.id } }), await prisma.serviceMessageLog.count({ where: { tenantId: SQC_TENANT.id } })], c0, "SettingValue/Outbox/SML ของ svcqc");
    }, "MAJOR");
    await st("Q-2", n2, async () => {
      const owner = SQC_USERS.find((u) => u.key === "owner")!, fai = SQC_USERS.find((u) => u.key === "fai")!;
      const now = new Date();
      const r = await D.list()({ tenantId: SQC_TENANT.id, actorUserId: owner.userId }, { unitId }, { now });
      const mine = (r?.rows ?? []).filter((x: Any) => String(x.trackingNo ?? "").startsWith(SQC_DORM_PARCEL_SCENE.trackingPrefix));
      ok(r?.ok === true && r.enabled === false && mine.length === SQC_DORM_PARCEL_SCENE.expect.waiting && mine.filter((x: Any) => x.overdue).length === SQC_DORM_PARCEL_SCENE.expect.overdue, J(r).slice(0, 200));
      const f = await D.list()({ tenantId: SQC_TENANT.id, actorUserId: fai.userId }, { unitId }, { now });
      ok(f?.ok === false && f.code === "NOT_FOUND", `fai ${codeOf(f)}`);
      const others0 = await prisma.dormParcel.count({ where: { tenantId: SQC_TENANT.id, NOT: { trackingNo: { startsWith: SQC_DORM_PARCEL_SCENE.trackingPrefix } } } });
      const c = runScene(["--clear"]);
      ok(c.status === 0 && (await sceneRows()).length === 0, `--clear exit=${c.status}`);
      eq(await prisma.dormParcel.count({ where: { tenantId: SQC_TENANT.id, NOT: { trackingNo: { startsWith: SQC_DORM_PARCEL_SCENE.trackingPrefix } } } }), others0, "แถวอื่นของ svcqc");
      const back = runScene();
      ok(back.status === 0 && (await sceneRows()).length === 3, "รันคืน");
    }, "MAJOR");
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
  { s: "qc-svc-d.9", args: ["--no-regression"], judge: (out) => { const s = summaryOf(out); return !!s && s.failed.every((id) => id === "S-1" || id === "S-2"); }, note: "ไม่มี FAIL ยกเว้น S-1/S-2 = ข้อ 'ไฟล์ของใบ D.9'" },
  { s: "qc-svc-d.13", args: ["--no-regression"], judge: judgeNoFail, note: "ไม่มี FAIL" },
  { s: "qc-svc-smoke" },
];
{
  const hasWork = typeof dormL.mod?.receiveParcel === "function" && typeof dormL.mod?.runDormParcelJobs === "function";
  const why = !hasWork ? "ยังไม่มีงานของใบ (receiveParcel / runDormParcelJobs) — regression รันเมื่อมีงาน" : NO_REG ? "--no-regression / SVC_D18_NO_REGRESSION=1" : "";
  for (const [i, g] of REG.entries()) {
    const id = `G-${i + 1}`;
    const name = `${g.s}${g.args?.length ? ` ${g.args.join(" ")}` : ""}${g.note ? ` (${g.note})` : " exit 0"}`;
    if (why) { skip(id, name, why); continue; }
    if (!existsSync(join(ROOT, "scripts", `${g.s}.mts`))) { record(id, name, "FAIL", "ไม่มีไฟล์ชุด", "CRITICAL"); continue; }
    const t = Date.now();
    const r = spawnSync("pnpm", ["exec", "tsx", `scripts/${g.s}.mts`, ...(g.args ?? [])], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, timeout: 45 * 60_000 });
    const all = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
    const log = `/tmp/svc-d18-reg-${g.s}.log`;
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
console.log(`\n===== QC SVC D.18 · พัสดุ =====\nผ่าน ${passed}/${cks.length}${skipped.length ? ` (SKIP ${skipped.length})` : ""}`);
console.log(`FINDINGS: CRITICAL ${failed.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${failed.filter((c) => c.sev === "MAJOR").length} · MINOR ${failed.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), findings: [...failed, ...skipped].map((c) => c.id) })}`);
// รับใบ = ผ่านทุกข้อ (SKIP ที่ยอมได้ระหว่างทำ: G-* เมื่อ --no-regression · Q-* svcqc ยังไม่มีฉาก D.13 · S-1 หลัง merge — ผู้คุมรันซ้ำครบก่อนรับ)
process.exit(failed.length + skipped.length > 0 ? 1 : 0);
