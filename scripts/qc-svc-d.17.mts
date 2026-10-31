// QC — SVC D.17 · ประกาศ + อ่านแล้ว (ทั้งหน่วย/อาคาร/ชั้น/ห้อง · LINE + พอร์ทัล · นับอ่านไม่ซ้ำ) · oracle ของผู้เขียนข้อสอบ — builder ห้ามแก้ไฟล์นี้ (แย้ง = wo-notes)
// สัญญา: ledger/svc-briefs/svc-brief-d.17.md (§3 สัญญา · §4 DOM · §6 จุดที่เลือกเอง) · ledger/SVC-MASTER-PLAN.md แถว D.17
//        CC §4.4 (notifyCustomer · ServiceMessageLog dedupe) §4.5 (signLink) §7 (dorm.announcement.published) §8 (dorm.announce)
//        ต่อจาก D.9 (สัญญา live · ด่าน token · precheck) · D.11 (ตัวตรวจคำก่อนส่ง) · D.13 (ขอบเขตอาคาร #64)
//
// กลุ่มข้อ:
//   S  โครงสร้าง/ไฟล์/ค่าตั้ง/สิทธิ์/event/งานตามเวลา/ไม่ส่ง LINE ตรง/any·เวลาดิบ·prisma ดิบ/คำต้องห้ามในซอร์ส/หน้า/คอมโพเนนต์
//   PC ตัวควบคุม (เขียวตั้งแต่ก่อนมีงาน): ฉาก · notifyCustomer ข้อความประกาศ + dedupe · เวลาเงียบ · ตัวตรวจคำ · unique การอ่าน · สัญญา live D.9 · ขอบเขตอาคาร D.13
//   W  ถ้อยคำ: ตัวตรวจบนหัวเรื่อง/เนื้อหาดิบ · คร่อมช่อง · อังกฤษ · แก้ร่าง · แถว/แม่แบบที่หลุดเข้าฐาน ⇒ ไม่ส่ง · รูปข้อมูล
//   X  แยกร้าน/หน่วย/อาคาร/สิทธิ์: NOT_FOUND ผลเดียวกันทุกไบต์ · ผู้ดูแลอาคาร (#64)
//   A  กลุ่มผู้รับถูกคน · N ไม่ซ้ำ (เผยแพร่พร้อมกัน · ส่ง 24 ทาง 3 โพรเซส · consumer ซ้ำ · ส่งซ้ำ · เวลาเงียบ + งานซ้อน)
//   R  อ่านแล้ว (GET ไม่นับ · พร้อมกัน = 1 · คนเดียว 2 สัญญา = 1 · ด่าน token X7 · ผู้เช่าใหม่ไม่เห็นของคนเก่า · หน้าต่างวัน)
//   P  เมนู LINE "ประกาศ" · E event/PII · U DOM · M นอกเครื่อง · Z ล้าง · S-1/S-2 ไฟล์ที่แตะ (ตอนรับใบเท่านั้น) · V ภาพจอพนักงาน · G regression
//
// 🔴 ไม่ยิง LINE จริง: ตัวจำลอง (node:http 127.0.0.1) + LINE_API_BASE + ครอบ fetch (นอกเครื่อง = บล็อก) · โพรเซสลูกได้ LINE_API_BASE/APP_URL เดียวกัน
// 🔴 APP_URL = https://qc-d17.invalid · ร้านทดสอบ slug `qc-svc-d17-*` · ผู้ใช้ `svc-d17-*@shark.local` · ลบใน finally (+ กวาดค้างตอนเริ่ม) · ไม่แตะร้าน svcqc
// รัน: cd /root/projects/shark-svc-l3 && bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-d.17.mts [--no-regression]
//      (ห้าม timeout ครอบ · `--no-regression` = G เป็น SKIP · QC_BASE=http://127.0.0.1:<port> เปิด V-1)
/* eslint-disable @typescript-eslint/no-explicit-any */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { randomBytes, randomInt } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { isDeepStrictEqual } from "node:util";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
import { SQC_DORM_ANNOUNCE, SQC_VISUAL_SPECS } from "./svc-qc-data.mjs";

type Any = any;
const SELF = fileURLToPath(import.meta.url);
const ROOT = join(dirname(SELF), "..");
const LABEL = "qc-svc-d.17";
const NO_REG = process.argv.includes("--no-regression") || process.env.SVC_D17_NO_REGRESSION === "1";
const SD = SQC_DORM_ANNOUNCE;
const ORIGIN = SD.origin;
const F = {
  mod: "src/lib/modules/dorm/announce.ts",
  plat: "src/lib/platform/dorm-announce.ts",
  dormIndex: "src/lib/modules/dorm/index.ts",
  staffPage: "src/app/app/u/[unitSlug]/dorm/announce/page.tsx",
  staffActions: "src/app/app/u/[unitSlug]/dorm/announce/actions.ts",
  comp: "src/components/dorm/DormAnnounce.tsx",
  newsPage: "src/app/(store)/d/[token]/news/page.tsx",
  newsActions: "src/app/(store)/d/[token]/news/actions.ts",
  newsComp: "src/components/dorm/portal/DormPortalNews.tsx",
  defs: "src/lib/core/settings/defs/rooms.ts",
  perm: "src/lib/core/permissions.ts",
  consumers: "src/lib/outbox-consumers.ts",
  autoLabels: "src/lib/automation/labels.ts",
  webLabels: "src/lib/webhooks/labels.ts",
  minute: "src/lib/platform/minute-jobs.ts",
  line: "src/lib/platform/dorm-line.ts",
} as const;
const NEW_FILES = [F.mod, F.plat, F.staffPage, F.staffActions, F.comp, F.newsPage, F.newsActions, F.newsComp];
const EV = "dorm.announcement.published";

loadSvcQcEnv(LABEL); // ด่านฐาน: ไม่ใช่ qc-svc ⇒ exit 4 ก่อนแตะฐาน
if (process.env.CI) { console.error(`🔴 ${LABEL}: ห้าม export CI (with-gate-lock ข้าม flock)`); process.exit(4); }
if (process.env.APP_ENV === "production") { console.error(`🔴 ${LABEL}: APP_ENV=production`); process.exit(4); }
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 300);

// ═══════════════ โหมดโพรเซสลูก (`--child <base64 JSON>`) — ยิงพร้อมกันจากโพรเซสแยก (ไม่สร้างข้อมูล/ไม่ล้าง) ═══════════════
{
  const ix = process.argv.indexOf("--child");
  if (ix >= 0) {
    let out: unknown[] = [];
    try {
      const job = JSON.parse(Buffer.from(process.argv[ix + 1] ?? "", "base64url").toString("utf8")) as { op: string; items: Any[]; at: number };
      const plat = existsSync(join(ROOT, F.plat)) ? ((await import(pathToFileURL(join(ROOT, F.plat)).href)) as Any) : null;
      const dorm = (await import("@/lib/modules/dorm" as string)) as Any;
      const runOne = async (x: Any): Promise<unknown> => {
        if (job.op === "publish") return typeof dorm.publishDormAnnouncement === "function" ? dorm.publishDormAnnouncement(x.ctx, x.i, { now: new Date(x.now) }) : { childFail: "ไม่มี publishDormAnnouncement" };
        if (!plat) return { childFail: `ยังไม่มี ${F.plat}` };
        if (job.op === "send") return plat.sendDormAnnouncement(x.ctx, x.i, { now: new Date(x.now) });
        if (job.op === "mark") return plat.markPortalAnnouncementRead(x.token, x.i, { clientKey: x.clientKey, now: new Date(x.now) });
        if (job.op === "jobs") return plat.runDormAnnounceJobs(new Date(x.now), { tenantId: x.tenantId });
        return { childFail: `op ${job.op}` };
      };
      const wait = job.at - Date.now();
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
const LEGAL_BAD = /ล็อ[กค]ห้อง|ล็อ[กค]ประตู|ตัดน้ำ|ตัดไฟ|ระงับ(การ)?(จ่าย)?(น้ำ|ไฟ)|งด(จ่าย)?(น้ำ|ไฟ)|ยึดทรัพย์|ยึดของ|ขนของออก|เข้าห้องโดยไม่|\bevict|\bseize/i;
const PHONE_RE = /(\+?66|0)[689]\d{8}/;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sorted = <T,>(xs: T[]) => [...xs].sort();
const uniq = <T,>(xs: T[]) => [...new Set(xs)];
const tryImport = async (spec: string): Promise<{ mod: Any; err: string }> => { try { return { mod: await import(spec), err: "" }; } catch (e) { return { mod: null, err: errMsg(e) }; } };
const loadIf = async (rel: string) => (existsSync(join(ROOT, rel)) ? tryImport(pathToFileURL(join(ROOT, rel)).href) : { mod: null, err: `ยังไม่มีไฟล์ «${rel}»` });
const fnOf = (load: { mod: Any; err: string }, name: string, rel: string): ((...a: Any[]) => Any) => {
  const f = load.mod?.[name];
  if (typeof f !== "function") throw new AssertFail(load.mod ? `«${rel}» ยังไม่มี export ${name}` : `โหลด «${rel}» ไม่ได้: ${load.err}`);
  return f;
};

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
const pushes = (m: number) => FAKE.slice(m).filter((r) => r.method === "POST" && r.path === "/v2/bot/message/push");

// ═══════════════ โหลดโมดูล (หลัง env) ═══════════════
const platL = await loadIf(F.plat);
const lineL = await loadIf(F.line);
const dbL = await tryImport("@/lib/core/db");
const prisma: Any = dbL.mod?.prisma;
if (!prisma) { console.error(`🔴 ${LABEL}: โหลด prisma ไม่ได้ (${dbL.err})`); process.exit(4); }
const dormL = await tryImport("@/lib/modules/dorm");
const SL = (await tryImport("@/lib/core/signed-link")).mod as Any;
const PB = (await tryImport("@/lib/platform/postback-routes")).mod as Any;
const NC = (await tryImport("@/lib/platform/notify-customer")).mod as Any;
const SET = (await tryImport("@/lib/core/settings")).mod as Any;
const LEGAL = (await tryImport("@/lib/core/settings/legal/th-rental-2568")).mod as Any;
const PRISMA_NS = ((await tryImport("@prisma/client")).mod as Any)?.Prisma;
const MOD = "@/lib/modules/dorm";
const DM = {
  create: () => fnOf(dormL, "createDormAnnouncement", MOD),
  update: () => fnOf(dormL, "updateDormAnnouncement", MOD),
  preview: () => fnOf(dormL, "previewDormAnnouncement", MOD),
  publish: () => fnOf(dormL, "publishDormAnnouncement", MOD),
  stats: () => fnOf(dormL, "dormAnnouncementStats", MOD),
  model: () => fnOf(dormL, "dormAnnounceModel", MOD),
};
const PL = {
  send: () => fnOf(platL, "sendDormAnnouncement", F.plat),
  resend: () => fnOf(platL, "resendDormAnnouncement", F.plat),
  onPub: () => fnOf(platL, "onDormAnnouncementPublished", F.plat),
  jobs: () => fnOf(platL, "runDormAnnounceJobs", F.plat),
  url: () => fnOf(platL, "announcementPortalUrl", F.plat),
  load: () => fnOf(platL, "loadPortalAnnouncements", F.plat),
  markRead: () => fnOf(platL, "markPortalAnnouncementRead", F.plat),
  menu: () => fnOf(platL, "dormAnnounceMenuReply", F.plat),
};
const NEWS_RE = /https:\/\/qc-d17\.invalid\/d\/([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\/news\?a=([A-Za-z0-9_-]+)/g;
const newsLinks = (v: unknown) => [...J(v).matchAll(NEWS_RE)].map((m) => ({ token: m[1], a: m[2], sub: SL?.verifyLink?.(m[1], "dorm.portal") ?? null }));

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
const STAMP = `${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;
const CK = (k: string) => `qc-d17-${STAMP}-${k}`;
async function cleanupMisc() {
  try { await prisma.user.deleteMany({ where: { email: { startsWith: "svc-d17-" } } }); } catch (e) { console.log(`  ⚠️ ลบ user: ${errMsg(e)}`); }
  try { await prisma.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE key LIKE $1`, `%qc-d17-${STAMP}%`); } catch (e) { console.log(`  ⚠️ ลบ rate bucket: ${errMsg(e)}`); }
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

// ═══════════════ ฉาก (วันที่ตายตัว) ═══════════════
const AT = SD.at;
const NOW = new Date(AT.base);
const VIEW = new Date(AT.view);
const dbDate = (ymd: string) => new Date(`${ymd}T00:00:00Z`);
const tenantIds: string[] = [];
const PHONES: string[] = [];
const NAMES: string[] = [];
const ids: Record<string, string> = {};
const C: Record<string, { id: string; ext: string; partyId: string | null; conn: string }> = {};
const AN: Record<string, string> = {};        // ประกาศที่สร้างผ่านงานของใบ
const TITLE: Record<string, string> = {};     // หัวเรื่องไม่ซ้ำต่อประกาศ (ใช้ตามหาในข้อความ)
let ready = false;
const needReady = () => ok(ready, "ฉากข้อมูลทดสอบสร้างไม่สำเร็จ (ดู PC-1)");
const needAn = (...k: string[]) => { needReady(); const miss = k.filter((x) => !AN[x]); ok(!miss.length, `ยังไม่มีประกาศ ${miss.join(",")} (ข้อก่อนหน้าสร้างไม่สำเร็จ)`); };

console.log(`\n(ตัวจำลอง LINE ${FAKE_BASE} · APP_URL ${ORIGIN})`);

try {
  const stale = await prisma.tenant.findMany({ where: { slug: { startsWith: "qc-svc-d17-" } }, select: { id: true } });
  if (stale.length) { console.log(`(กวาด tenant ค้างจากรอบก่อน ${stale.length})`); await cleanup(stale.map((t: { id: string }) => t.id)); }
  await cleanupMisc();

  // ═══════════════ S (ไม่แตะฐาน) ═══════════════
  console.log("\n── S โครงสร้าง ──");
  await st("S-3", `มีไฟล์ใหม่ของใบครบ ${NEW_FILES.length} ไฟล์ (§1)`, () => { const miss = NEW_FILES.filter((f) => !existsSync(join(ROOT, f))); ok(!miss.length, `ขาด ${miss.join(", ")}`); });
  await st("S-4", "facade @/lib/modules/dorm export 6 ชื่อ (§3.2) · dorm-announce export 8 ชื่อ (§3.3)", () => {
    const D = ["createDormAnnouncement", "updateDormAnnouncement", "previewDormAnnouncement", "publishDormAnnouncement", "dormAnnouncementStats", "dormAnnounceModel"];
    const P = ["sendDormAnnouncement", "resendDormAnnouncement", "onDormAnnouncementPublished", "runDormAnnounceJobs", "announcementPortalUrl", "loadPortalAnnouncements", "markPortalAnnouncementRead", "dormAnnounceMenuReply"];
    const md = D.filter((n) => typeof dormL.mod?.[n] !== "function"), mp = P.filter((n) => typeof platL.mod?.[n] !== "function");
    ok(!md.length && !mp.length, `facade ขาด ${md.join(",") || "—"} (${dormL.err || "โหลดได้"}) · dorm-announce ขาด ${mp.join(",") || "—"} (${platL.err || "โหลดได้"})`);
  });
  await st("S-5", "ค่าตั้งใหม่ 2 คีย์ (กลุ่ม notify · ชั้น UNIT · ป้ายไทย · ค่าเริ่ม/ช่วง) · แม่แบบ rooms.msg.announcement ตัวแปรเดิม [unitName,title,body] · ไฟล์ของใบอ่านค่าจากทะเบียน (ไม่ฝังเลขวัน)", () => {
    const want: [string, string, unknown, unknown[], unknown[]][] = [
      ["rooms.notify.announceLine", "bool", true, [true, false], ["x", 1]],
      ["rooms.notify.announcePortalDays", "days", 30, [1, 365], [0, 366, 1.5]],
    ];
    const bad: string[] = [];
    for (const [k, ty, fb, good, no] of want) {
      const d = SET?.getDef?.(k);
      if (!d) { bad.push(`${k} ไม่มี`); continue; }
      if (d.group !== "notify" || d.type !== ty || !THAI.test(d.labelTh ?? "") || !isDeepStrictEqual(d.chain, ["UNIT"]) || !isDeepStrictEqual(d.defaults?._fallback, fb)) bad.push(`${k} ${J({ g: d.group, ty: d.type, chain: d.chain, fb: d.defaults?._fallback })}`);
      for (const v of good) if (d.schema?.safeParse?.(v)?.success !== true) bad.push(`${k} ไม่รับ ${J(v)}`);
      for (const v of no) if (d.schema?.safeParse?.(v)?.success === true) bad.push(`${k} รับ ${J(v)}`);
    }
    const t = SET?.getDef?.("rooms.msg.announcement");
    if (!t || !isDeepStrictEqual([...(t.templateVars ?? [])], ["unitName", "title", "body"])) bad.push(`แม่แบบ announcement ${J(t?.templateVars)}`);
    const src = stripComments(read(F.mod) + read(F.plat));
    for (const k of ["rooms.notify.announceLine", "rooms.notify.announcePortalDays"]) if (!src.includes(k)) bad.push(`ไฟล์ของใบไม่อ่าน ${k}`);
    if (!/portalUrl\s*\(|rooms\.notify\.portalLinkDays/.test(stripComments(read(F.plat)))) bad.push("ลิงก์ไม่ได้ใช้อายุ rooms.notify.portalLinkDays (portalUrl ของ D.9)");
    if (/\b(43_?200|50_?400|2_?592_?000_?000|30\s*\*\s*(24|86_?400|1_?440))\b/.test(src)) bad.push("ฝังเลขอายุ/หน้าต่างวันในไฟล์");
    ok(read(F.mod) && read(F.plat) && !bad.length, bad.join(" · ") || "ยังไม่มีไฟล์");
  }, "MAJOR");
  await st("S-6", "permissions: dorm.announce ออกจาก planned · ป้ายไทยเดิม · announce.ts ใช้คีย์จริง", async () => {
    const permSrc = read(F.perm);
    const plannedBlk = /module:\s*"dorm"[\s\S]*?planned:\s*\[([\s\S]*?)\]/.exec(permSrc)?.[1] ?? "";
    ok(plannedBlk, "หา planned ของโมดูล dorm ไม่เจอ");
    ok(!/["']dorm\.announce["']/.test(plannedBlk), "dorm.announce ยังอยู่ใน planned");
    ok(/["']dorm\.announce["']\s*:\s*["'][^"']*[฀-๿]/.test(permSrc), "ป้ายไทยของ dorm.announce หาย");
    ok(/["']dorm\.announce["']/.test(stripComments(read(F.mod))), "announce.ts ไม่ได้ตรวจ dorm.announce");
  }, "MAJOR");
  await st("S-7", `event ${EV} ลง 3 ทะเบียน: consumer งานจริง (dorm-announce → onDormAnnouncementPublished) · AUTOMATION_EVENTS ป้ายไทย · WEBHOOK_EVENTS ครั้งเดียว (spread · ไม่ประกาศซ้ำใน webhooks/labels.ts)`, async () => {
    const oc = (await import("@/lib/outbox-consumers" as string)) as Any;
    const al = (await import("@/lib/automation/labels" as string)) as Any;
    const wl = (await import("@/lib/webhooks/labels" as string)) as Any;
    ok(typeof oc.consumers?.[EV] === "function", "ไม่มี consumer");
    const lab = (al.AUTOMATION_EVENTS as Any[] | undefined)?.find((e) => e.value === EV);
    ok(lab && THAI.test(lab.label ?? ""), "ไม่มีป้ายไทยใน AUTOMATION_EVENTS");
    eq(((wl.WEBHOOK_EVENTS as Any[]) ?? []).filter((e) => e.value === EV).length, 1, "WEBHOOK_EVENTS");
    ok(!read(F.webLabels).includes(EV), "ประกาศซ้ำใน webhooks/labels.ts");
    const s = stripComments(read(F.consumers));
    const i = s.search(new RegExp(`["']${EV.replace(/\./g, "\\.")}["']\\s*:`));
    const blk = s.slice(i, i + 400);
    ok(i >= 0 && /import\(\s*["']@\/lib\/platform\/dorm-announce["']\s*\)/.test(blk) && /onDormAnnouncementPublished\s*\(/.test(blk), `บล็อก consumer: ${blk.slice(0, 160).replace(/\s+/g, " ")}`);
  }, "MAJOR");
  await st("S-8", "minute-jobs: dorm.announce ทุก 5 นาที (import ตอนรัน · runDormAnnounceJobs · ส่ง signal)", () => {
    const mj = read(F.minute);
    const i = mj.search(/name:\s*["']dorm\.announce["']/);
    ok(i >= 0, "ไม่มีงาน dorm.announce");
    const blk = mj.slice(i, i + 500);
    ok(/everyMinutes:\s*5\b/.test(blk) && /import\(\s*["']@\/lib\/platform\/dorm-announce["']\s*\)/.test(blk) && /runDormAnnounceJobs\s*\(/.test(blk) && /signal/.test(blk), blk.slice(0, 200).replace(/\s+/g, " "));
  }, "MAJOR");
  await st("S-9", "ตัวเชื่อม: ไม่ส่ง LINE ตรง · ส่งผ่าน notifyCustomer + precheck · ตัวตรวจ findForbiddenTerms · ด่าน token verifyLink + checkRateLimitDb · เผยแพร่ emitOutbox · tenantDb (ไม่ import prisma ดิบ)", () => {
    const bad: string[] = [];
    for (const f of [F.mod, F.plat, F.staffPage, F.staffActions, F.newsPage, F.newsActions]) { const m = /\b(pushLineMessagesToContact|pushFlexToParty|sendLineToParty|pushToContact|replyFlex|replyLineMessages)\b|api(-data)?\.line\.me/.exec(stripComments(read(f))); if (m) bad.push(`${f}: ${m[0]}`); }
    const ms = stripComments(read(F.mod)), ps = stripComments(read(F.plat));
    for (const [s, re, n] of [[ps, /notifyCustomer\s*\(/, "notifyCustomer"], [ps, /precheck\s*:/, "precheck"], [ms + ps, /findForbiddenTerms\s*\(/, "findForbiddenTerms"],
      [ps, /verifyLink\s*\(/, "verifyLink"], [ps, /checkRateLimitDb\s*\(/, "checkRateLimitDb"], [ms, /emitOutbox\s*\(/, "emitOutbox"], [ms, /tenantDb\s*\(/, "tenantDb"]] as const) if (!re.test(s)) bad.push(`ไม่มี ${n}`);
    for (const f of [F.mod, F.plat]) if (/import\s*\{[^}]*\bprisma\b[^}]*\}\s*from\s+["']@\/lib\/core\/db["']/.test(read(f))) bad.push(`${f}: prisma ดิบ`);
    if (/bypassQuiet\s*:\s*true/.test(ps)) bad.push("ประกาศข้ามเวลาเงียบ");
    ok(ms && ps && !bad.length, bad.join(" · ") || "ยังไม่มีไฟล์");
  }, "MAJOR");
  await st("S-10", "ไม่มี any · ไม่มี getDay/getDate/getMonth/getHours/getFullYear ดิบ ในไฟล์ใหม่", () => {
    const miss = NEW_FILES.filter((f) => !existsSync(join(ROOT, f)));
    ok(!miss.length, `ยังไม่มี ${miss.join(", ")}`);
    const anyUse = NEW_FILES.filter((f) => /:\s*any\b|as\s+any\b|<any>/.test(stripComments(read(f))));
    const raw = NEW_FILES.filter((f) => /\.(getDay|getDate|getMonth|getHours|getFullYear)\s*\(\s*\)/.test(stripComments(read(f))));
    ok(!anyUse.length && !raw.length, `any=${anyUse.join(",") || "—"} เวลาเครื่อง=${raw.join(",") || "—"}`);
  }, "MAJOR");
  await st("S-11", "ไม่มีคำต้องห้าม สคบ. เป็นตัวอักษรในซอร์สของใบ (ตัวตรวจคืน terms เอง) · ไม่มีฟังก์ชันตัดน้ำไฟ/ล็อกห้อง", () => {
    const bad: string[] = [];
    for (const f of NEW_FILES) { const s = read(f); const m = LEGAL_BAD.exec(stripComments(s)); if (m) bad.push(`${f}: ${m[0]}`); if (/function\s+\w*(cutWater|cutPower|cutElec|lockRoom|seize|evict)\w*/i.test(s)) bad.push(`${f}: ฟังก์ชันต้องห้าม`); }
    ok(existsSync(join(ROOT, F.mod)) && !bad.length, bad.join(" · ") || "ยังไม่มีไฟล์");
  });
  await st("S-12", "จอพนักงาน: page server (requireUnit · dormAnnounceModel · notFound · ไม่แตะ prisma) · actions 'use server' export async function เท่านั้น (create/publish/resend) · ไม่รับ tenantId/unitId/actor จากฟอร์ม", () => {
    const p = read(F.staffPage), a = read(F.staffActions);
    ok(p && a, "ยังไม่มีไฟล์");
    const pc = stripComments(p), ac = stripComments(a);
    ok(!/^\s*["']use client["']/.test(p) && /requireUnit\s*\(/.test(pc) && /dormAnnounceModel\s*\(/.test(pc) && /notFound\s*\(/.test(pc) && !/@\/lib\/core\/db|@prisma\//.test(pc), "page");
    ok(/^\s*["']use server["']/.test(a), "actions ไม่มี use server บรรทัดแรก");
    ok(!/export\s+(const|let|type|interface|default|class|function\s)/.test(ac.replace(/export\s+async\s+function/g, "")), "export อื่นที่ไม่ใช่ async function");
    for (const n of ["createAnnouncementAction", "publishAnnouncementAction", "resendAnnouncementAction"]) ok(new RegExp(`export\\s+async\\s+function\\s+${n}\\b`).test(ac), `ไม่มี ${n}`);
    ok(/createDormAnnouncement\s*\(/.test(ac) && /publishDormAnnouncement\s*\(/.test(ac) && /resendDormAnnouncement\s*\(/.test(ac), "actions ไม่เรียกงานของใบ");
    ok(!/get\(\s*["'](tenantId|unitId|actorUserId|userId)["']\s*\)/.test(ac), "อ่าน tenantId/unitId/actor จากฟอร์ม");
  }, "MAJOR");
  await st("S-13", "หน้า /d/[token]/news: server · loadPortalAnnouncements → notFound · force-dynamic · noindex · no-referrer · ไม่เรียก markPortalAnnouncementRead (GET ไม่นับอ่าน) · actions 'use server' markAnnouncementReadAction → markPortalAnnouncementRead (clientKey จาก IP · ไม่ส่ง deps)", () => {
    const p = read(F.newsPage), a = read(F.newsActions);
    ok(p && a, "ยังไม่มีไฟล์");
    const pc = stripComments(p), ac = stripComments(a);
    const bad: string[] = [];
    if (/^\s*["']use client["']/.test(p)) bad.push("page use client");
    if (!/loadPortalAnnouncements\s*\(/.test(pc) || !/notFound\s*\(/.test(pc)) bad.push("page ไม่เรียก loadPortalAnnouncements/notFound");
    if (!/force-dynamic/.test(pc) || !/index:\s*false/.test(pc) || !/referrer:\s*["']no-referrer["']/.test(pc)) bad.push("force-dynamic/noindex/no-referrer");
    if (/markPortalAnnouncementRead/.test(pc)) bad.push("page นับอ่านตอน GET");
    if (/requireUnit|getSession|requireMembership|@\/lib\/core\/db|@prisma\//.test(pc)) bad.push("page แตะ session/prisma");
    if (!/^\s*["']use server["']/.test(a)) bad.push("actions ไม่มี use server");
    if (!/export\s+async\s+function\s+markAnnouncementReadAction\b/.test(ac) || !/markPortalAnnouncementRead\s*\(/.test(ac)) bad.push("ไม่มี markAnnouncementReadAction → markPortalAnnouncementRead");
    if (!/x-real-ip|portalClientKey/.test(ac)) bad.push("clientKey ไม่อ่าน IP");
    if (/\bdeps\s*:|get\(\s*["']tenantId["']\s*\)/.test(ac)) bad.push("ส่ง deps/อ่าน tenantId");
    ok(!bad.length, bad.join(" · "));
  }, "MAJOR");
  await st("S-14", "คอมโพเนนต์: 'use client' บรรทัดแรก · default export · ไม่ import โมดูล server/actions/next/* · DormPortalNews เรียก markRead ใน useEffect", () => {
    const bad: string[] = [];
    for (const f of [F.comp, F.newsComp]) {
      const s = read(f);
      if (!s) { bad.push(`ยังไม่มี ${f}`); continue; }
      if (!/^\s*["']use client["']/.test(s)) bad.push(`${f}: ไม่มี use client`);
      if (!/export\s+default\b/.test(s)) bad.push(`${f}: ไม่มี default export`);
      const imps = [...s.matchAll(/^\s*import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/gm)].filter((m) => !m[1]).map((m) => m[2]);
      const b = imps.filter((x) => /^@prisma\//.test(x) || /^@\/lib\/(modules|platform|core\/db|core\/settings|payment|storage)/.test(x) || /^next\//.test(x) || /actions$/.test(x));
      if (b.length) bad.push(`${f}: import ${b.join(",")}`);
    }
    const n = stripComments(read(F.newsComp));
    if (n && !(/useEffect\s*\(/.test(n) && /markRead\s*\(/.test(n))) bad.push("DormPortalNews ไม่เรียก markRead ใน useEffect");
    ok(!bad.length, bad.join(" · "));
  }, "MAJOR");
  await st("S-15", "dorm-line.ts: แก้เฉพาะ case \"announce\" → dormAnnounceMenuReply (import dorm-announce) · ลบบรรทัดเดิม ≤ 2", () => {
    const s = stripComments(read(F.line));
    ok(/case\s+["']announce["']\s*:/.test(s) && /dormAnnounceMenuReply\s*\(/.test(s) && /import\(\s*["'](\.\/dorm-announce|@\/lib\/platform\/dorm-announce)["']\s*\)/.test(s), "ไม่มี case announce → dormAnnounceMenuReply");
    let rm: string[] = [];
    try { rm = execFileSync("git", ["-C", ROOT, "diff", "-U0", "HEAD", "--", F.line], { encoding: "utf8" }).split("\n").filter((l) => /^-(?!-)/.test(l) && l.slice(1).trim()); } catch { rm = []; }
    ok(rm.length <= 2, `ลบ ${rm.length} บรรทัด: ${rm.slice(0, 3).join(" | ").slice(0, 160)}`);
  }, "MAJOR");
  await st("S-16", "(ผู้เขียนข้อสอบตั้งแล้ว) SQC_DORM_ANNOUNCE ครบ · SQC_VISUAL_SPECS d.17 = จอพนักงาน /dorm/announce", () => {
    const sp = SQC_VISUAL_SPECS["d.17"];
    ok(Array.isArray(sp) && sp.length === 1 && sp[0].path.endsWith("/dorm/announce"), J(sp));
    ok(SD.origin === "https://qc-d17.invalid" && SD.forbidden.length === 4 && SD.clean.length === 2, "ค่าฉาก");
  }, "MINOR");

  // ═══════════════ ข้อมูลทดสอบ ═══════════════
  console.log("\n── สร้างข้อมูลทดสอบ ──");
  const mkTenant = async (tag: string) => { const t = await prisma.tenant.create({ data: { name: `QC D17 ${tag}`, slug: `qc-svc-d17-${tag}-${STAMP}` } }); tenantIds.push(t.id); return t.id as string; };
  const A = await mkTenant("a"), B = await mkTenant("b");
  ids.A = A; ids.B = B;
  const mkUnit = async (tenantId: string, tag: string, name: string) => (await prisma.businessUnit.create({ data: { tenantId, type: "DORM", name, slug: `d17${tag}-${STAMP}` } })).id as string;
  const mkUser = async (key: string, tenantId: string, role: string, unitAccess: string[], perms: string[] = [], accepted = true) => {
    const u = await prisma.user.create({ data: { email: `svc-d17-${STAMP}-${key}@shark.local`, name: `QC D17 ${key}` } });
    const m = await prisma.membership.create({ data: { userId: u.id, tenantId, role, unitAccess, permissions: Object.fromEntries(perms.map((p) => [p, true])), acceptedAt: accepted ? new Date() : null } });
    ids[`mem:${key}`] = m.id;
    return u.id as string;
  };
  const setVal = async (tenantId: string, key: string, scopeId: string, value: unknown) => {
    await prisma.settingValue.deleteMany({ where: { tenantId, key, scope: "UNIT", scopeId } });
    await prisma.settingValue.create({ data: { tenantId, key, scope: "UNIT", scopeId, value: value === null ? PRISMA_NS.JsonNull : value, setById: "qc-d17" } });
  };
  const unsetVal = (tenantId: string, key: string, scopeId: string) => prisma.settingValue.deleteMany({ where: { tenantId, key, scope: "UNIT", scopeId } });
  const newPhone = () => { for (;;) { const p = `08${randomInt(10_000_000, 99_999_999)}`; if (!PHONES.includes(p)) { PHONES.push(p); return p; } } };
  const mkParty = async (tenantId: string, name: string) => { NAMES.push(name); return (await prisma.party.create({ data: { tenantId, name, phone: newPhone() } })).id as string; };
  const mkLease = async (o: { tenantId: string; unitId: string; roomId: string; partyId: string; status?: string; start?: string; end?: string | null; ended?: boolean }) => (await prisma.dormLease.create({ data: {
    tenantId: o.tenantId, unitId: o.unitId, roomId: o.roomId, partyId: o.partyId, status: o.status ?? "ACTIVE", startDate: dbDate(o.start ?? "2026-01-01"),
    endDate: o.end === null ? null : dbDate(o.end ?? "2027-12-31"), rentSatang: 450_000, commonFeeSatang: 30_000, createdById: "qc-d17",
    ...(o.ended ? { endedAt: new Date("2026-10-31T10:00:00Z"), endReason: "MOVE_OUT" } : {}),
  } })).id as string;
  const R: Record<string, string> = {};
  let RN = "", RB = "";
  let C_SYS_A = "", RAND = "";
  const mkContact = async (key: string, tenantId: string, sys: string, conn: string, partyId: string | null) => {
    const ext = `Uqcd17${key}${RAND}`;
    const row = await prisma.chatContact.create({ data: { tenantId, systemId: sys, channel: "LINE", channelConnectionId: conn, externalUserId: ext, partyId, lang: "th" } });
    C[key] = { id: row.id, ext, partyId, conn };
  };
  const pushTo = (key: string, m: number) => pushes(m).filter((r) => r.json?.to === C[key]?.ext);
  const pushKeys = (m: number) => sorted(pushes(m).map((r) => Object.keys(C).find((k) => C[k].ext === r.json?.to) ?? `?${r.json?.to}`));

  try {
    const DA = await mkUnit(A, "a", "หอดีสิบเจ็ดเอ"), DN = await mkUnit(A, "n", "หอดีสิบเจ็ดเอ็น"), DB = await mkUnit(B, "b", "หอดีสิบเจ็ดบี");
    Object.assign(ids, { DA, DN, DB });
    for (const [t, u] of [[A, DA], [A, DN], [B, DB]] as const) {
      await setVal(t, "messaging.quietHours", u, null);
      await setVal(t, "messaging.channelOrder", u, ["LINE", "WEB_LINK"]);
    }
    ids.OWN = await mkUser("owner", A, "OWNER", ["*"]);
    ids.OWNB = await mkUser("owner-b", B, "OWNER", ["*"]);
    ids.VIEW = await mkUser("view", A, "STAFF", [DA], ["dorm.view"]);
    ids.METER = await mkUser("meter", A, "STAFF", [DA], ["dorm.meter.read"]);
    ids.CARE = await mkUser("care", A, "STAFF", [DA], ["dorm.view", "dorm.announce"]);
    ids.MGRN = await mkUser("mgr-n", A, "MANAGER", [DN]);
    ids.REV = await mkUser("rev", A, "STAFF", [DA], ["dorm.view", "dorm.announce"], false);
    // LINE OA (ตัวจำลอง): OA1 = ของ DA และ DN (ใช้ร่วม — ตรวจแยกหน่วย) · OA2 = OA อื่นของร้าน A · OAB = ร้าน B
    C_SYS_A = (await prisma.appSystem.create({ data: { tenantId: A, type: "CHAT", name: `qc-d17-chat-${STAMP}` } })).id;
    const sysB = (await prisma.appSystem.create({ data: { tenantId: B, type: "CHAT", name: `qc-d17-chat-b-${STAMP}` } })).id;
    RAND = randomBytes(3).toString("hex");
    const mkConn = async (tenantId: string, sys: string, tag: string) =>
      (await prisma.chatChannelConnection.create({ data: { tenantId, systemId: sys, type: "LINE", displayName: `qc-d17-${tag}-${STAMP}`, externalAccountId: `qc-d17-${tag}-${STAMP}`, credentials: { channelAccessToken: `qcd17tok${tag}${RAND}`, channelSecret: `qcd17sec${tag}${RAND}` }, meta: { basicId: `@qcd17${tag}` } } })).id as string;
    ids.OA1 = await mkConn(A, C_SYS_A, "a1"); ids.OA2 = await mkConn(A, C_SYS_A, "a2"); ids.OAB = await mkConn(B, sysB, "b");
    await setVal(A, "messaging.lineConnectionId", DA, ids.OA1);
    await setVal(A, "messaging.lineConnectionId", DN, ids.OA1);
    await setVal(B, "messaging.lineConnectionId", DB, ids.OAB);
    // อาคาร/ห้อง: DA อาคาร BA (ชั้น 1: 101 102 103 · ชั้น 2: 201 202) + BB (ชั้น 1: 111 112 · ชั้น 2: 211) · ห้องปิด 104 (BA ชั้น 1 · active=false)
    const ty = (await prisma.hotelRoomType.create({ data: { tenantId: A, unitId: DA, name: "มาตรฐาน", capacity: 2, baseRateSatang: 450_000, depositSatang: 0, rentMode: "MONTHLY" } })).id as string;
    ids.BA = (await prisma.roomBuilding.create({ data: { tenantId: A, unitId: DA, name: "อาคาร A", floors: 2, sortOrder: 1 } })).id;
    ids.BB = (await prisma.roomBuilding.create({ data: { tenantId: A, unitId: DA, name: "อาคาร B", floors: 2, sortOrder: 2 } })).id;
    for (const [n, b, f] of [["101", "BA", 1], ["102", "BA", 1], ["103", "BA", 1], ["201", "BA", 2], ["202", "BA", 2], ["111", "BB", 1], ["112", "BB", 1], ["211", "BB", 2]] as const)
      R[n] = (await prisma.hotelRoom.create({ data: { tenantId: A, unitId: DA, roomTypeId: ty, number: n, buildingId: ids[b], floorNo: f, floor: String(f) } })).id;
    R["104"] = (await prisma.hotelRoom.create({ data: { tenantId: A, unitId: DA, roomTypeId: ty, number: "104", buildingId: ids.BA, floorNo: 1, floor: "1", active: false } })).id;
    const tyN = (await prisma.hotelRoomType.create({ data: { tenantId: A, unitId: DN, name: "มาตรฐาน", capacity: 2, baseRateSatang: 450_000, depositSatang: 0, rentMode: "MONTHLY" } })).id as string;
    ids.BN = (await prisma.roomBuilding.create({ data: { tenantId: A, unitId: DN, name: "อาคาร N", floors: 3, sortOrder: 1 } })).id;
    RN = (await prisma.hotelRoom.create({ data: { tenantId: A, unitId: DN, roomTypeId: tyN, number: "301", buildingId: ids.BN, floorNo: 3, floor: "3" } })).id;
    const tyB = (await prisma.hotelRoomType.create({ data: { tenantId: B, unitId: DB, name: "มาตรฐาน", capacity: 2, baseRateSatang: 450_000, depositSatang: 0, rentMode: "MONTHLY" } })).id as string;
    ids.BBX = (await prisma.roomBuilding.create({ data: { tenantId: B, unitId: DB, name: "อาคาร X", floors: 1, sortOrder: 1 } })).id;
    RB = (await prisma.hotelRoom.create({ data: { tenantId: B, unitId: DB, roomTypeId: tyB, number: "101", buildingId: ids.BBX, floorNo: 1, floor: "1" } })).id;
    ids.R_N = RN; ids.R_B = RB;
    // ผู้เช่า
    for (const [k, n] of [["P1", "สมชาย ประกาศหนึ่ง"], ["P2", "สมหญิง ประกาศสอง"], ["P3", "ธนพล ย้ายออกแล้ว"], ["P4", "วิไล ชั้นสอง"], ["P5", "วิภา สองห้อง"], ["P6", "หมดสัญญา ยังไม่ปิด"],
      ["P7", "ไม่มี ไลน์"], ["P8", "เบญจา ยังไม่เข้า"], ["P9", "ผู้เช่า เข้าใหม่"], ["P10", "แทนที่ ห้องสอง"], ["P11", "ปิดห้อง ไม่นับ"], ["PX", "คนนอก ไม่เช่า"], ["PN", "หอเอ็น ผู้เช่า"]] as const) ids[k] = await mkParty(A, n);
    ids.PB = await mkParty(B, "ร้านบี ผู้เช่า");
    ids.L1 = await mkLease({ tenantId: A, unitId: DA, roomId: R["101"], partyId: ids.P1 });
    ids.L2 = await mkLease({ tenantId: A, unitId: DA, roomId: R["102"], partyId: ids.P2, status: "NOTICE" });
    ids.L3 = await mkLease({ tenantId: A, unitId: DA, roomId: R["103"], partyId: ids.P3, status: "ENDED", end: "2026-10-31", ended: true });
    ids.L201 = await mkLease({ tenantId: A, unitId: DA, roomId: R["201"], partyId: ids.P4 });
    ids.L202 = await mkLease({ tenantId: A, unitId: DA, roomId: R["202"], partyId: ids.P5 });
    ids.L111 = await mkLease({ tenantId: A, unitId: DA, roomId: R["111"], partyId: ids.P5 });
    ids.L112 = await mkLease({ tenantId: A, unitId: DA, roomId: R["112"], partyId: ids.P6, start: "2025-10-16", end: "2026-10-15" });
    ids.L211 = await mkLease({ tenantId: A, unitId: DA, roomId: R["211"], partyId: ids.P7 });
    ids.L8 = await mkLease({ tenantId: A, unitId: DA, roomId: R["103"], partyId: ids.P8, status: "DRAFT", start: "2026-12-01" });
    ids.L104 = await mkLease({ tenantId: A, unitId: DA, roomId: R["104"], partyId: ids.P11 });
    ids.LN = await mkLease({ tenantId: A, unitId: DN, roomId: RN, partyId: ids.PN });
    ids.LB = await mkLease({ tenantId: B, unitId: DB, roomId: RB, partyId: ids.PB });
    // ผู้ติดต่อ LINE (OA1 ยกเว้นที่ระบุ) — P7 ไม่มี LINE
    for (const [k, p] of [["C1", "P1"], ["C2", "P2"], ["C3", "P3"], ["C4", "P4"], ["C5", "P5"], ["C6", "P6"], ["C8", "P8"], ["C9", "P9"], ["C11", "P11"], ["CX", "PX"], ["CN", "PN"]] as const) await mkContact(k, A, C_SYS_A, ids.OA1, ids[p]);
    await mkContact("C1b", A, C_SYS_A, ids.OA2, ids.P1);
    await mkContact("CB", B, sysB, ids.OAB, ids.PB);
    // ขอบเขตอาคาร (#64): DA = BUILDING · ผู้ดูแล care เห็นเฉพาะอาคาร A
    await setVal(A, "rooms.access.managerScope", DA, "BUILDING");
    await setVal(A, "rooms.access.buildingAssignments", DA, { [ids["mem:care"]]: [ids.BA], [ids["mem:rev"]]: [ids.BA, ids.BB] });
    // ประกาศของร้าน B (แถวตรง — ใช้ทดสอบข้ามร้าน) + ของหน่วย DN
    ids.ANB = (await prisma.dormAnnouncement.create({ data: { tenantId: B, unitId: DB, title: "ประกาศร้านบี", body: "เนื้อหาร้านบี", audience: "ALL", publishedAt: NOW } })).id;
    ready = true;
  } catch (e) {
    record("PC-1", "ฉากข้อมูลทดสอบ", "FAIL", `สร้างฉากไม่ได้: ${errMsg(e)}`, "CRITICAL");
  }
  const DA = ids.DA, DN = ids.DN, DB = ids.DB;
  const cO = { tenantId: A, actorUserId: ids.OWN };
  const cOB = { tenantId: B, actorUserId: ids.OWNB };
  const cCare = { tenantId: A, actorUserId: ids.CARE };
  const tok = (leaseId: string, tenantId = A, purpose = "dorm.portal") => SL.signLink({ tenantId, purpose, subjectId: leaseId, expMin: 600 });
  const popt = (k: string, now: Date | string = VIEW) => ({ clientKey: CK(k), now: now instanceof Date ? now : new Date(now) });
  const annRows = (tenantId: string) => prisma.dormAnnouncement.count({ where: { tenantId } });
  const logsOf = (annId: string) => prisma.serviceMessageLog.findMany({ where: { tenantId: { in: [A, B] }, dedupeKey: { startsWith: `rooms:announcement:${annId}:` } }, select: { dedupeKey: true, status: true, partyId: true, channel: true } });
  const readsOf = (annId: string) => prisma.dormAnnouncementRead.findMany({ where: { announcementId: annId }, select: { partyId: true, tenantId: true, unitId: true } });
  const createAs = async (ctx: Any, key: string, unitId: string, audience: Any, body: string = SD.clean[0].body) => {
    TITLE[key] = `ประกาศ ${key} ${STAMP}`;
    const r = await DM.create()(ctx, { unitId, title: TITLE[key], body, audience });
    if (r?.ok && typeof r.announcementId === "string") AN[key] = r.announcementId;
    return r;
  };
  const pubSend = async (key: string, now: Date = NOW, unitId = DA, ctx: Any = cO) => {
    const p = await DM.publish()(ctx, { unitId, announcementId: AN[key] }, { now });
    await parkOutbox(tenantIds);
    const s = await PL.send()({ tenantId: ctx.tenantId }, { announcementId: AN[key] }, { now });
    return { p, s };
  };

  // ═══════════════ PC ตัวควบคุม ═══════════════
  console.log("\n── PC ตัวควบคุม ──");
  if (ready) await st("PC-1", "ฉาก: ร้าน A (หอ DA 2 อาคาร 8 ห้อง + ห้องปิด · หอ DN) + ร้าน B · สัญญา ACTIVE/NOTICE/ENDED/DRAFT/เลยวันจบ · LINE OA1 ใช้ร่วม DA+DN", async () => {
    eq(await prisma.dormLease.count({ where: { tenantId: A } }), 11, "สัญญาร้าน A");
    eq(await prisma.hotelRoom.count({ where: { tenantId: A, unitId: DA } }), 9, "ห้อง DA");
  });
  await st("PC-2", "notifyCustomer(rooms · announcement) ถึง P1 บน OA ของหน่วย = ส่ง 1 · ซ้ำคีย์เดิม = duplicate ไม่ส่งเพิ่ม · ไม่ไป OA2", async () => {
    needReady();
    const m = mark();
    const i = { unitId: DA, domain: "rooms", messageKey: "announcement", partyId: ids.P1, vars: { unitName: "หอดีสิบเจ็ดเอ", title: "ทดสอบ", body: "ทดสอบ" }, dedupeKey: `qc-d17:pc2:${STAMP}`, at: NOW };
    const r1 = await NC.notifyCustomer({ tenantId: A }, i), r2 = await NC.notifyCustomer({ tenantId: A }, i);
    eq([r1?.status, r2?.duplicate, pushTo("C1", m).length, pushTo("C1b", m).length], ["SENT", true, 1, 0], "ผล");
  });
  await st("PC-3", "notifyCustomer เวลาเงียบ (22:30 ไทย) ⇒ SKIPPED_QUIET ไม่ส่ง", async () => {
    needReady();
    await setVal(A, "messaging.quietHours", DA, SD.quietHours);
    try {
      const m = mark();
      const r = await NC.notifyCustomer({ tenantId: A }, { unitId: DA, domain: "rooms", messageKey: "announcement", partyId: ids.P1, vars: { unitName: "x", title: "x", body: "x" }, dedupeKey: `qc-d17:pc3:${STAMP}`, at: new Date(AT.quiet) });
      eq([r?.status, pushes(m).length], ["SKIPPED_QUIET", 0], "ผล");
    } finally { await setVal(A, "messaging.quietHours", DA, null); }
  });
  await st("PC-4", "ตัวตรวจคำ findForbiddenTerms: จับ 4 ถ้อยคำในฉาก (ดิบ · เว้นวรรค · คร่อมบรรทัด · อังกฤษ) · ถ้อยคำสะอาด 2 ชุด (รวม \"ไฟฟ้าดับชั่วคราว\") = ไม่พบ", () => {
    const f = LEGAL?.findForbiddenTerms;
    ok(typeof f === "function", "ไม่มี findForbiddenTerms");
    for (const x of SD.forbidden) ok(f(`${x.title}\n${x.body}`).includes(x.term), `${x.why}: ${J(f(`${x.title}\n${x.body}`))}`);
    for (const x of SD.clean) eq(f(`${x.title}\n${x.body}`), [], `สะอาด ${x.title}`);
  });
  await st("PC-5", "schema: DormAnnouncementRead unique (announcementId, partyId) — ใส่ซ้ำ (skipDuplicates) = แถวเดียว", async () => {
    needReady();
    const a = await prisma.dormAnnouncement.create({ data: { tenantId: A, unitId: DN, title: "pc5", body: "pc5", audience: "ALL" } });
    try {
      const row = { tenantId: A, unitId: DN, announcementId: a.id, partyId: ids.PN };
      const n1 = await prisma.dormAnnouncementRead.createMany({ data: [row], skipDuplicates: true });
      const n2 = await prisma.dormAnnouncementRead.createMany({ data: [row, row], skipDuplicates: true });
      eq([n1.count, n2.count, await prisma.dormAnnouncementRead.count({ where: { announcementId: a.id } })], [1, 0, 1], "แถว");
    } finally { await prisma.dormAnnouncement.delete({ where: { id: a.id } }); }
  });
  await st("PC-6", "สัญญา live ของ D.9 (portalLiveLease): L1 ACTIVE · L2 NOTICE = live · L3 ENDED · L112 เลยวันจบ · L8 DRAFT = ไม่ live · ลิงก์ dorm.portal ตรวจได้", async () => {
    needReady();
    const f = fnOf(dormL, "portalLiveLease", MOD);
    const live = async (l: string) => !!(await f(A, l, "2026-11-03"));
    eq([await live(ids.L1), await live(ids.L2), await live(ids.L3), await live(ids.L112), await live(ids.L8)], [true, true, false, false, false], "live");
    eq(SL.verifyLink(tok(ids.L1), "dorm.portal")?.subjectId, ids.L1, "verifyLink");
  });
  await st("PC-7", "ขอบเขตอาคาร D.13: ผู้ดูแล care ⇒ เฉพาะอาคาร A · เจ้าของ ⇒ ทั้งหน่วย", async () => {
    needReady();
    const f = fnOf(dormL, "dormBuildingScope", MOD);
    eq([J(await f({ tenantId: A }, { unitId: DA, userId: ids.CARE })), (await f({ tenantId: A }, { unitId: DA, userId: ids.OWN }))?.all], [J({ all: false, buildingIds: [ids.BA] }), true], "scope");
  });

  // ═══════════════ W ถ้อยคำ · รูปข้อมูล ═══════════════
  console.log("\n── W ถ้อยคำ / ตัวตรวจ ──");
  await st("W-1", "หัวเรื่อง/เนื้อหาที่มีคำต้องห้าม 4 แบบ (ดิบ · เว้นวรรค · คร่อมหัวเรื่อง/เนื้อหา · อังกฤษ) ⇒ LEGAL_BLOCK + terms + เหตุผลไทย · ไม่มีแถวใหม่", async () => {
    needReady();
    const n0 = await annRows(A);
    const bad: string[] = [];
    for (const x of SD.forbidden) {
      const r = await DM.create()(cO, { unitId: DA, title: x.title, body: x.body, audience: { kind: "ALL" } });
      if (!(r?.ok === false && r.code === "LEGAL_BLOCK" && Array.isArray(r.terms) && r.terms.includes(x.term) && THAI.test(r.reason ?? ""))) bad.push(`${x.why}: ${fmt(r)}`);
    }
    eq(await annRows(A), n0, "แถวประกาศ");
    ok(!bad.length, bad.join(" · "));
  });
  await st("W-2", "ถ้อยคำสะอาด (รวม \"ไฟฟ้าดับชั่วคราว · น้ำไม่ไหลชั่วคราว\") ⇒ บันทึกร่างได้ · แก้ร่างเป็นคำต้องห้าม ⇒ LEGAL_BLOCK แถวไม่เปลี่ยน · แก้ร่างสะอาด ⇒ ok", async () => {
    needReady();
    const r = await createAs(cO, "W", DA, { kind: "ROOM", roomIds: [R["101"]] }, SD.clean[1].body);
    ok(r?.ok && AN.W, `สร้าง ${fmt(r)}`);
    const u1 = await DM.update()(cO, { unitId: DA, announcementId: AN.W, title: SD.forbidden[0].title, body: SD.forbidden[0].body, audience: { kind: "ROOM", roomIds: [R["101"]] } });
    ok(u1?.ok === false && u1.code === "LEGAL_BLOCK", `แก้เป็นคำต้องห้าม ${fmt(u1)}`);
    eq((await prisma.dormAnnouncement.findUnique({ where: { id: AN.W } }))?.title, TITLE.W, "แถวหลังถูกบล็อก");
    const u2 = await DM.update()(cO, { unitId: DA, announcementId: AN.W, title: TITLE.W, body: SD.clean[1].body, audience: { kind: "ROOM", roomIds: [R["101"], R["102"]] } });
    ok(u2?.ok === true, `แก้สะอาด ${fmt(u2)}`);
  });
  await st("W-3", "รูปข้อมูลผิด ⇒ BAD_INPUT เหตุผลไทย ไม่มีแถว: หัวเรื่องว่าง · 121 ตัว · มีขึ้นบรรทัด · เนื้อหาว่าง · 2,001 ตัว · เป้าหมายว่าง · 501 ห้อง · ชั้นติดลบ · kind แปลก", async () => {
    needReady();
    const n0 = await annRows(A);
    const T = "หัวเรื่อง", Bd = "เนื้อหา";
    const cases: [string, Any][] = [
      ["หัวเรื่องว่าง", { title: "   ", body: Bd, audience: { kind: "ALL" } }],
      ["หัวเรื่องยาว", { title: "ก".repeat(SD.limits.titleMax + 1), body: Bd, audience: { kind: "ALL" } }],
      ["หัวเรื่องขึ้นบรรทัด", { title: "บรรทัด\nสอง", body: Bd, audience: { kind: "ALL" } }],
      ["เนื้อหาว่าง", { title: T, body: "", audience: { kind: "ALL" } }],
      ["เนื้อหายาว", { title: T, body: "ข".repeat(SD.limits.bodyMax + 1), audience: { kind: "ALL" } }],
      ["อาคารว่าง", { title: T, body: Bd, audience: { kind: "BUILDING", buildingIds: [] } }],
      ["501 ห้อง", { title: T, body: Bd, audience: { kind: "ROOM", roomIds: Array.from({ length: SD.limits.targetsMax + 1 }, (_, i) => `r${i}`) } }],
      ["ชั้นติดลบ", { title: T, body: Bd, audience: { kind: "FLOOR", floors: [{ buildingId: ids.BA, floorNo: -1 }] } }],
      ["kind แปลก", { title: T, body: Bd, audience: { kind: "EVERYONE" } }],
    ];
    const bad: string[] = [];
    for (const [n, i] of cases) { const r = await DM.create()(cO, { unitId: DA, ...i }); if (!(r?.ok === false && r.code === "BAD_INPUT" && THAI.test(r.reason ?? ""))) bad.push(`${n}: ${fmt(r)}`); }
    eq(await annRows(A), n0, "แถวประกาศ");
    ok(!bad.length, bad.join(" · "));
  }, "MAJOR");

  // ═══════════════ X แยกร้าน/หน่วย/อาคาร/สิทธิ์ ═══════════════
  console.log("\n── X ขอบเขต / สิทธิ์ ──");
  let NF_REF = "";
  await st("X-1", "ไม่ถือ dorm.announce (ดูผังอย่างเดียว · คนจดมิเตอร์) · สมาชิกยังไม่ตอบรับ · หน่วยไม่มี ⇒ NOT_FOUND ผลเดียวกันทุกไบต์ · model = null · ไม่มีแถว", async () => {
    needReady();
    const n0 = await annRows(A);
    const inp = { unitId: DA, title: "ทดสอบสิทธิ์", body: "ทดสอบ", audience: { kind: "ALL" } };
    const ref = await DM.create()(cO, { ...inp, unitId: "qc-d17-no-such-unit" });
    ok(ref?.ok === false && ref.code === "NOT_FOUND" && THAI.test(ref.reason ?? ""), `อ้างอิง ${fmt(ref)}`);
    NF_REF = J(ref);
    const rs = [await DM.create()({ tenantId: A, actorUserId: ids.VIEW }, inp), await DM.create()({ tenantId: A, actorUserId: ids.METER }, inp), await DM.create()({ tenantId: A, actorUserId: ids.REV }, inp)];
    eq(rs.map(J), [NF_REF, NF_REF, NF_REF], "ผล");
    eq([await DM.model()({ tenantId: A, actorUserId: ids.VIEW }, { unitId: DA }), await DM.model()({ tenantId: A, actorUserId: ids.REV }, { unitId: DA })], [null, null], "model");
    eq(await annRows(A), n0, "แถว");
  });
  await st("X-2", "ข้ามร้าน/ข้ามหน่วย: เจ้าของร้าน B บนหน่วย A · เจ้าของ A บนหน่วยร้าน B · เป้าหมายเป็นอาคาร/ห้องของหน่วย DN หรือร้าน B · ประกาศร้าน B · ประกาศหน่วยอื่น · id ขยะ ⇒ NOT_FOUND ผลเดียวกันทุกไบต์ · ไม่มีแถว", async () => {
    needReady();
    ok(NF_REF, "ไม่มีผลอ้างอิง (X-1)");
    ok(AN.W, "ไม่มีร่าง W (W-2)");
    const n0 = [await annRows(A), await annRows(B)];
    const base = { title: "ทดสอบข้ามร้าน", body: "ทดสอบ" };
    const rs = [
      await DM.create()(cOB, { unitId: DA, ...base, audience: { kind: "ALL" } }),
      await DM.create()(cO, { unitId: DB, ...base, audience: { kind: "ALL" } }),
      await DM.create()(cO, { unitId: DA, ...base, audience: { kind: "BUILDING", buildingIds: [ids.BN] } }),
      await DM.create()(cO, { unitId: DA, ...base, audience: { kind: "BUILDING", buildingIds: [ids.BA, ids.BBX] } }),
      await DM.create()(cO, { unitId: DA, ...base, audience: { kind: "ROOM", roomIds: [R["101"], ids.R_N] } }),
      await DM.create()(cO, { unitId: DA, ...base, audience: { kind: "ROOM", roomIds: [ids.R_B] } }),
      await DM.create()(cO, { unitId: DA, ...base, audience: { kind: "FLOOR", floors: [{ buildingId: ids.BN, floorNo: 3 }] } }),
      await DM.stats()(cO, { unitId: DA, announcementId: ids.ANB }),
      await DM.stats()(cO, { unitId: DB, announcementId: ids.ANB }),
      await DM.stats()(cO, { unitId: DN, announcementId: AN.W }),
      await DM.publish()(cO, { unitId: DN, announcementId: AN.W }, { now: NOW }),
      await DM.preview()(cO, { unitId: DA, announcementId: "x' OR '1'='1" }),
      await DM.update()(cOB, { unitId: DA, announcementId: AN.W, ...base, audience: { kind: "ALL" } }),
    ];
    const bad = rs.map((r, i) => (J(r) === NF_REF ? null : `${i}: ${fmt(r)}`)).filter(Boolean);
    ok(!bad.length, bad.join(" · "));
    eq([await annRows(A), await annRows(B)], n0, "แถว");
    eq((await prisma.dormAnnouncement.findUnique({ where: { id: AN.W } }))?.publishedAt ?? null, null, "ร่าง W ถูกเผยแพร่จากหน่วยอื่น");
  });

  // ═══════════════ A กลุ่มผู้รับ ═══════════════
  console.log("\n── A กลุ่มผู้รับ ──");
  const AUD: Record<string, Any> = {
    ALL: { kind: "ALL" },
    BA: { kind: "BUILDING", buildingIds: [ids.BA] },
    BB: { kind: "BUILDING", buildingIds: [ids.BB] },
    F1: { kind: "FLOOR", floors: [{ buildingId: ids.BA, floorNo: 1 }] },
    F2: { kind: "FLOOR", floors: [{ buildingId: ids.BA, floorNo: 2 }] },
    R103: { kind: "ROOM", roomIds: [R["103"], R["104"]] },
    R5: { kind: "ROOM", roomIds: [R["202"], R["111"], R["202"]] },
    R12: { kind: "ROOM", roomIds: [R["201"], R["101"]] },
  };
  const EXP: Record<string, { rooms: string[]; recipients: number; push: string[] }> = {
    ALL: { rooms: ["101", "102", "111", "201", "202", "211"], recipients: 5, push: ["C1", "C2", "C4", "C5"] },
    BA: { rooms: ["101", "102", "201", "202"], recipients: 4, push: ["C1", "C2", "C4", "C5"] },
    BB: { rooms: ["111", "211"], recipients: 2, push: ["C5"] },
    F1: { rooms: ["101", "102"], recipients: 2, push: ["C1", "C2"] },
    F2: { rooms: ["201", "202"], recipients: 2, push: ["C4", "C5"] },
    R103: { rooms: [], recipients: 0, push: [] },
    R5: { rooms: ["111", "202"], recipients: 1, push: ["C5"] },
    R12: { rooms: ["101", "201"], recipients: 2, push: ["C1", "C4"] },
  };
  await st("A-1", "สร้างร่าง 8 กลุ่ม (ทั้งหน่วย · อาคาร A · อาคาร B · ชั้น A1 · ชั้น A2 · ห้องว่าง+ห้องปิด · 2 ห้องของคนเดียว (ซ้ำ) · 2 ห้อง) ⇒ ร่าง (publishedAt null · createdById = ผู้กระทำ) · เก็บกลุ่มไม่ซ้ำ เรียง · ยังไม่มีข้อความ/event", async () => {
    needReady();
    const bad: string[] = [];
    for (const k of Object.keys(AUD)) { const r = await createAs(cO, k, DA, AUD[k]); if (!r?.ok) bad.push(`${k}: ${fmt(r)}`); }
    ok(!bad.length, bad.join(" · "));
    const rows = await prisma.dormAnnouncement.findMany({ where: { id: { in: Object.keys(AUD).map((k) => AN[k]) } } });
    ok(rows.length === 8 && rows.every((r: Any) => r.publishedAt === null && r.createdById === ids.OWN && r.unitId === DA), "แถว");
    const byId = new Map(rows.map((r: Any) => [r.id, r]));
    const r5: Any = byId.get(AN.R5), f1: Any = byId.get(AN.F1), all: Any = byId.get(AN.ALL);
    eq([r5?.audience, r5?.audienceIds], ["ROOM", sorted([R["111"], R["202"]])], "R5 เก็บไม่ซ้ำ เรียง");
    eq([f1?.audience, f1?.audienceIds], ["FLOOR", [{ buildingId: ids.BA, floorNo: 1 }]], "F1");
    eq([all?.audience, all?.audienceIds ?? null], ["ALL", null], "ALL");
    eq([await prisma.serviceMessageLog.count({ where: { tenantId: A, dedupeKey: { startsWith: "rooms:announcement:" } } }), await prisma.outboxEvent.count({ where: { tenantId: A, type: EV } })], [0, 0], "log/event");
  });
  await st("A-2", "ดูผู้รับก่อนส่ง (preview): ห้อง/จำนวนคนตรงทุกกลุ่ม — สัญญาจบ · ยังไม่เข้า · เลยวันจบ · ห้องปิด · หน่วยอื่นไม่นับ · คน 2 ห้อง = 1 คน · ไม่มีชื่อ/เบอร์", async () => {
    needAn(...Object.keys(AUD));
    const bad: string[] = [];
    for (const k of Object.keys(AUD)) {
      const r = await DM.preview()(cO, { unitId: DA, announcementId: AN[k] }, { now: NOW });
      if (!(r?.ok && isDeepStrictEqual(sorted(r.rooms ?? []), EXP[k].rooms) && r.recipients === EXP[k].recipients)) bad.push(`${k}: ${fmt(r)}`);
      if (NAMES.some((n) => J(r).includes(n)) || PHONE_RE.test(J(r))) bad.push(`${k}: มีชื่อ/เบอร์`);
    }
    ok(!bad.length, bad.join(" · "));
  });
  let pubAll: Any[] = [];
  await st("N-1", "เผยแพร่พร้อมกัน 12 ทาง (+ 2 โพรเซส × 4) ⇒ เผยแพร่ 1 (published:true 1 ราย · ที่เหลือ ok + published:false + publishedAt เดียวกัน) · event 1 · ไม่มี throw/P2002", async () => {
    needAn("ALL");
    const i = { unitId: DA, announcementId: AN.ALL };
    const at = atIn();
    const [inproc, kids] = await Promise.all([
      inProcAt(at, Array.from({ length: 12 }, () => () => DM.publish()(cO, i, { now: NOW }))),
      fanout("publish", [0, 1].map(() => Array.from({ length: 4 }, () => ({ ctx: cO, i, now: AT.base }))), at),
    ]);
    pubAll = [...inproc, ...kids];
    await parkOutbox(tenantIds);
    eq(badOf(pubAll), [], "throw/ชน");
    eq([pubAll.filter((r) => r?.ok && r.published === true).length, pubAll.filter((r) => r?.ok && r.published === false).length], [1, pubAll.length - 1], "จำนวน");
    eq(uniq(pubAll.map((r) => r?.publishedAt)).length, 1, "publishedAt");
    const row = await prisma.dormAnnouncement.findUnique({ where: { id: AN.ALL } });
    eq(row?.publishedAt?.toISOString(), AT.base, "publishedAt ในฐาน");
    eq(await prisma.outboxEvent.count({ where: { tenantId: A, type: EV, idempotencyKey: `${EV}:${AN.ALL}` } }), 1, "event");
  });
  await st("E-1", `event ${EV}: payload = { unitId, announcementId, audience } (ไม่มีหัวเรื่อง/เนื้อหา/ชื่อ/เบอร์) · audit เผยแพร่ 1 แถว ไม่มีเนื้อหา`, async () => {
    needAn("ALL");
    const e = await prisma.outboxEvent.findFirst({ where: { tenantId: A, type: EV, idempotencyKey: `${EV}:${AN.ALL}` } });
    ok(e, "ไม่มี event");
    eq(sorted(Object.keys(e.payload ?? {})), ["announcementId", "audience", "unitId"], "คีย์ payload");
    eq([e.payload.announcementId, e.payload.unitId, e.payload.audience, e.unitId], [AN.ALL, DA, "ALL", DA], "ค่า");
    const au = await prisma.auditLog.findMany({ where: { tenantId: A, action: EV } });
    eq(au.length, 1, "audit");
    const blob = J([e, au]);
    ok(!blob.includes(TITLE.ALL) && !blob.includes(SD.clean[0].body.slice(0, 20)) && !PHONE_RE.test(blob) && !NAMES.some((n) => blob.includes(n)), "มีเนื้อหา/PII");
  }, "MAJOR");
  await st("N-2", "ส่งพร้อมกัน 24 ทาง (12 ในโพรเซส + 2 โพรเซส × 6) ⇒ ข้อความละ 1 ต่อคน (C1 C2 C4 C5) · log 5 แถว (P7 ไม่มี LINE) · Σsent = 4 · ไม่มี throw/P2002", async () => {
    needAn("ALL");
    const m = mark();
    const at = atIn();
    const [inproc, kids] = await Promise.all([
      inProcAt(at, Array.from({ length: 12 }, () => () => PL.send()({ tenantId: A }, { announcementId: AN.ALL }, { now: NOW }))),
      fanout("send", [0, 1].map(() => Array.from({ length: 6 }, () => ({ ctx: { tenantId: A }, i: { announcementId: AN.ALL }, now: AT.base }))), at),
    ]);
    const rs = [...inproc, ...kids];
    eq(badOf(rs), [], "throw/ชน");
    eq(pushKeys(m), EXP.ALL.push, "ผู้ได้ข้อความ");
    eq(rs.reduce((s, r) => s + (Number(r?.sent) || 0), 0), 4, "Σsent");
    const logs = await logsOf(AN.ALL);
    eq([logs.length, logs.filter((l: Any) => l.status === "SENT").length, logs.find((l: Any) => l.partyId === ids.P7)?.status], [5, 4, "NO_CHANNEL"], "log");
  });
  await st("A-3", "ข้อความ: หัวเรื่อง + เนื้อหา + ชื่อหน่วย · ปุ่มลิงก์ https://qc-d17.invalid/d/<token>/news?a=<ประกาศ> ของสัญญาของผู้รับเอง (P5 = ห้อง 111 เลขน้อยสุด) · ไม่มีชื่อผู้เช่า/เบอร์/คำต้องห้าม · สถิติ {5,4,0,1,0}", async () => {
    needAn("ALL");
    const all = pushes(0).filter((r) => J(r.json).includes(TITLE.ALL));
    eq(all.length, 4, "ข้อความ ALL");
    const own: Record<string, string[]> = { C1: [ids.L1], C2: [ids.L2], C4: [ids.L201], C5: [ids.L111] };
    const bad: string[] = [];
    for (const r of all) {
      const key = Object.keys(C).find((k) => C[k].ext === r.json?.to) ?? "?";
      const s = J(r.json);
      const ls = newsLinks(r.json);
      if (!s.includes("หอดีสิบเจ็ดเอ") || !s.includes(SD.clean[0].body.split("\n")[0].slice(0, 20))) bad.push(`${key}: ไม่มีชื่อหน่วย/เนื้อหา`);
      if (!(ls.length >= 1 && ls.every((l) => l.a === AN.ALL && l.sub?.tenantId === A && own[key]?.includes(l.sub?.subjectId)))) bad.push(`${key}: ลิงก์ ${J(ls.map((l) => [l.a, l.sub?.subjectId]))}`);
      if (NAMES.some((n) => s.includes(n)) || PHONE_RE.test(s) || LEGAL_BAD.test(s)) bad.push(`${key}: มีชื่อ/เบอร์/คำต้องห้าม`);
    }
    ok(!bad.length, bad.join(" · "));
    const st1 = await DM.stats()(cO, { unitId: DA, announcementId: AN.ALL }, { now: NOW });
    eq(st1?.stats, { recipients: 5, sent: 4, waiting: 0, noLine: 1, reads: 0 }, "สถิติ");
  });
  await st("N-3", "consumer dorm.announcement.published ซ้ำ 2 รอบ (event เดิม) ⇒ ไม่มีข้อความเพิ่ม · ไม่ throw · consumer งานจริงส่งได้ (ไม่ใช่ no-op)", async () => {
    needAn("ALL", "R12");
    const oc = (await import("@/lib/outbox-consumers" as string)) as Any;
    const c = oc.consumers?.[EV];
    ok(typeof c === "function", "ไม่มี consumer");
    const evt = (id: string) => ({ id: `qc-d17-evt-${id}`, tenantId: A, type: EV, unitId: DA, payload: { unitId: DA, announcementId: id, audience: "ALL" }, idempotencyKey: `${EV}:${id}`, attempts: 0, createdAt: new Date() });
    const m = mark();
    await c(evt(AN.ALL)); await c(evt(AN.ALL));
    eq(pushes(m).length, 0, "ข้อความเพิ่ม (ALL)");
    // consumer ส่งของจริง: R12 เผยแพร่แล้วให้ consumer ส่ง (เวลาจริง ⇒ เคารพเวลาเงียบของหน่วย = ปิดไว้ในฉาก)
    const p = await DM.publish()(cO, { unitId: DA, announcementId: AN.R12 }, { now: NOW });
    await parkOutbox(tenantIds);
    ok(p?.ok && p.published, `เผยแพร่ R12 ${fmt(p)}`);
    const m2 = mark();
    await c(evt(AN.R12)); await c(evt(AN.R12));
    eq(pushKeys(m2), EXP.R12.push, "consumer ส่ง R12");
  });
  await st("N-4", "ส่งซ้ำจากจอพนักงาน (resendDormAnnouncement): คนที่ได้แล้วไม่ได้ซ้ำ · ผู้เช่าเข้าใหม่ในกลุ่ม (ห้อง 103 หลังเผยแพร่) ได้ 1 ครั้ง · ส่งซ้ำอีก = 0", async () => {
    needAn("ALL");
    const m = mark();
    const r1 = await PL.resend()(cO, { unitId: DA, announcementId: AN.ALL }, { now: NOW });
    ok(r1?.ok && r1.sent === 0 && pushes(m).length === 0, `รอบแรก ${fmt(r1)}`);
    ids.L9 = await mkLease({ tenantId: A, unitId: DA, roomId: R["103"], partyId: ids.P9, start: "2026-11-03" });
    try {
      const m2 = mark();
      const r2 = await PL.resend()(cO, { unitId: DA, announcementId: AN.ALL }, { now: NOW });
      const r3 = await PL.resend()(cO, { unitId: DA, announcementId: AN.ALL }, { now: NOW });
      eq([pushKeys(m2), r2?.sent, r3?.sent], [["C9"], 1, 0], "ผู้เช่าใหม่");
    } finally { await prisma.dormLease.update({ where: { id: ids.L9 }, data: { status: "ENDED", endedAt: new Date("2026-11-03T05:00:00Z"), endDate: dbDate("2026-11-04") /* ORACLE-EDIT (ผู้คุม 31 ต.ค. · d17-N4) endDate ต้อง > startDate (DormLease_dates_check) */ } }); }
  });
  await st("A-4", "เผยแพร่+ส่งทีละกลุ่ม ⇒ ถูกคน: อาคาร A (C1 C2 C4 C5) · อาคาร B (C5 · P7 ไม่มี LINE · P6 เลยวันจบไม่ได้) · ชั้น A1 (C1 C2) · ชั้น A2 (C4 C5) · ห้องว่าง+ห้องปิด (ไม่มีใคร · recipients 0) · 2 ห้องของ P5 (C5 ครั้งเดียว) · ไม่มีใครนอกกลุ่ม", async () => {
    needAn("BA", "BB", "F1", "F2", "R103", "R5");
    const bad: string[] = [];
    for (const k of ["BA", "BB", "F1", "F2", "R103", "R5"]) {
      const m = mark();
      const { p, s } = await pubSend(k);
      if (!(p?.ok && p.published && s?.status === "DONE" && s.recipients === EXP[k].recipients)) bad.push(`${k}: ${fmt([p, s])}`);
      const got = pushKeys(m);
      if (!isDeepStrictEqual(got, EXP[k].push)) bad.push(`${k}: ได้ ${J(got)} ต้อง ${J(EXP[k].push)}`);
    }
    ok(!bad.length, bad.join(" · "));
    const never = ["C3", "C6", "C8", "C11", "CX", "CN", "C1b", "CB"].filter((k) => pushTo(k, 0).length);
    eq(never, [], "คนที่ต้องไม่ได้ข้อความ (สัญญาจบ · เลยวันจบ · ยังไม่เข้า · ห้องปิด · ไม่เช่า · หน่วยอื่น · OA อื่น · ร้านอื่น)");
  });
  await st("A-5", "แยกหน่วย/ร้าน (OA เดียวกัน): ประกาศทั้งหน่วยของ DN ⇒ CN เท่านั้น · ของร้าน B ⇒ CB เท่านั้น", async () => {
    needReady();
    const r1 = await createAs({ tenantId: A, actorUserId: ids.MGRN }, "DN", DN, { kind: "ALL" });
    const r2 = await createAs(cOB, "DB", DB, { kind: "ALL" });
    ok(r1?.ok && r2?.ok, `สร้าง ${fmt([r1, r2])}`);
    const m = mark();
    await pubSend("DN", NOW, DN, { tenantId: A, actorUserId: ids.MGRN });
    await pubSend("DB", NOW, DB, cOB);
    eq(pushKeys(m), ["CB", "CN"], "ผู้ได้ข้อความ");
  });

  // ═══════════════ R อ่านแล้ว ═══════════════
  console.log("\n── R อ่านแล้ว / พอร์ทัล ──");
  const visibleL1 = () => ["ALL", "BA", "F1", "R12"].map((k) => AN[k]);
  await st("R-1", "พอร์ทัลห้อง 101: รายการ = ประกาศที่ห้องนี้เห็นเท่านั้น (ALL · อาคาร A · ชั้น A1 · ห้อง 101/201) ใหม่→เก่า · ?a= ⇒ detail · ไม่มีชื่อ/เบอร์ · GET ไม่เขียนการอ่าน", async () => {
    needAn("ALL", "BA", "F1", "R12", "BB", "F2", "R5", "DN", "DB");
    const v = await PL.load()(tok(ids.L1), { a: null }, popt("r1"));
    ok(v && v.roomNumber === "101" && v.unitName === "หอดีสิบเจ็ดเอ", `view ${fmt(v)}`);
    const got = (v.items as Any[]).map((x) => x.id);
    for (const id of visibleL1()) ok(got.includes(id), `ขาด ${id}`);
    for (const k of ["BB", "F2", "R5", "DN", "DB"]) ok(!got.includes(AN[k]), `เห็น ${k}`);
    ok(!got.includes(ids.ANB), "เห็นของร้าน B");
    const ts = (v.items as Any[]).map((x) => Date.parse(x.publishedAt));
    ok(ts.every((t, i) => i === 0 || ts[i - 1] >= t), "ไม่เรียงใหม่→เก่า");
    const d = await PL.load()(tok(ids.L1), { a: AN.F1 }, popt("r1"));
    eq([d?.detail?.id, d?.detail?.title, d?.detail?.body, (d?.items as Any[])?.find((x) => x.id === AN.F1)?.current], [AN.F1, TITLE.F1, SD.clean[0].body, true], "detail");
    ok(!NAMES.some((n) => J([v, d]).includes(n)) && !PHONE_RE.test(J([v, d])), "มีชื่อ/เบอร์");
    eq(await prisma.dormAnnouncementRead.count({ where: { tenantId: A } }), 0, "การอ่านหลัง GET");
  });
  await st("R-2", "บันทึกอ่านพร้อมกัน 24 ทาง (12 ในโพรเซส + 2 โพรเซส × 6) ห้อง 101 ประกาศชั้น A1 ⇒ แถวเดียว (counted:true 1 ราย) · partyId = P1 · ไม่มี throw/P2002", async () => {
    needAn("F1");
    const t = tok(ids.L1);
    const at = atIn();
    const [inproc, kids] = await Promise.all([
      inProcAt(at, Array.from({ length: 12 }, (_, i) => () => PL.markRead()(t, { announcementId: AN.F1 }, popt(`r2-${i}`)))),
      fanout("mark", [0, 1].map((g) => Array.from({ length: 6 }, (_, i) => ({ token: t, i: { announcementId: AN.F1 }, clientKey: CK(`r2c${g}${i}`), now: AT.view }))), at),
    ]);
    const rs = [...inproc, ...kids];
    eq(badOf(rs), [], "throw/ชน");
    eq([rs.filter((r) => r?.ok && r.counted === true).length, rs.filter((r) => r?.ok && r.counted === false).length], [1, rs.length - 1], "counted");
    const rows = await readsOf(AN.F1);
    eq(rows.map((r: Any) => [r.partyId, r.tenantId, r.unitId]), [[ids.P1, A, DA]], "แถว");
  });
  await st("R-3", "คนเดียว 2 สัญญา (P5 · ห้อง 202 + 111) อ่านประกาศ 2 ห้องจากทั้งสองลิงก์พร้อมกัน ⇒ แถวเดียว · สถิติ reads 1 จาก recipients 1", async () => {
    needAn("R5");
    const rs = await inProcAt(Date.now(), [...Array.from({ length: 6 }, (_, i) => () => PL.markRead()(tok(ids.L202), { announcementId: AN.R5 }, popt(`r3a${i}`))),
      ...Array.from({ length: 6 }, (_, i) => () => PL.markRead()(tok(ids.L111), { announcementId: AN.R5 }, popt(`r3b${i}`)))]);
    eq(badOf(rs), [], "throw/ชน");
    eq((await readsOf(AN.R5)).map((r: Any) => r.partyId), [ids.P5], "แถว");
    const s = await DM.stats()(cO, { unitId: DA, announcementId: AN.R5 }, { now: NOW });
    eq([s?.stats?.reads, s?.stats?.recipients], [1, 1], "สถิติ");
  });
  await st("R-4", "ชั้น A1: P2 อ่าน ⇒ 2 · P1 อ่านซ้ำ ⇒ counted:false ยัง 2 · สถิติ {recipients 2 · sent 2 · reads 2} · อ่าน ≤ ผู้รับ", async () => {
    needAn("F1");
    const r1 = await PL.markRead()(tok(ids.L2), { announcementId: AN.F1 }, popt("r4a"));
    const r2 = await PL.markRead()(tok(ids.L1), { announcementId: AN.F1 }, popt("r4b"));
    eq([r1?.ok && r1.counted, r2?.ok && r2.counted === false], [true, true], "ผล");
    const s = await DM.stats()(cO, { unitId: DA, announcementId: AN.F1 }, { now: NOW });
    eq(s?.stats, { recipients: 2, sent: 2, waiting: 0, noLine: 0, reads: 2 }, "สถิติ");
  });
  await st("R-5", "ด่าน token (X7) ⇒ ผลเดียวกันทุกไบต์ ไม่มีแถว: ห้องที่ไม่อยู่ในกลุ่ม · สัญญาจบ · สัญญาเลยวันจบ · หน่วยอื่น · ร้านอื่น · token ขยะ/ลายเซ็นปลอม/purpose อื่น · ประกาศร่าง · ประกาศอาคารอื่น · ประกาศร้านอื่น · id ขยะ (load ⇒ null ทุกกรณี)", async () => {
    needAn("F1", "BB", "W", "DN");
    const good = tok(ids.L1);
    const [p, sg] = good.split(".");
    const forged = `${p}.${sg.slice(0, -2)}${sg.slice(-2) === "AA" ? "AB" : "AA"}`;
    const cases: [string, string, string][] = [
      ["ห้อง 201 · ชั้น A1", tok(ids.L201), AN.F1], ["สัญญาจบ", tok(ids.L3), AN.ALL], ["เลยวันจบ", tok(ids.L112), AN.ALL], ["หน่วย DN", tok(ids.LN), AN.F1],
      ["ร้าน B", tok(ids.LB, B), AN.F1], ["ขยะ", "abc.def", AN.F1], ["ลายเซ็นปลอม", forged, AN.F1], ["purpose อื่น", tok(ids.L1, A, "booking.manage"), AN.F1],
      ["ร่าง", good, AN.W], ["อาคาร B", good, AN.BB], ["หน่วย DN", good, AN.DN], ["ร้าน B", good, ids.ANB], ["id ขยะ", good, "x' OR 1=1"],
    ];
    const n0 = await prisma.dormAnnouncementRead.count({ where: { tenantId: { in: [A, B] } } });
    const outs: string[] = [], loads: unknown[] = [];
    for (const [n, t, a] of cases) {
      outs.push(J(await PL.markRead()(t, { announcementId: a }, popt(`r5-${n}`))));
      loads.push(await PL.load()(t, { a }, popt(`r5l-${n}`)));
    }
    ok(new Set(outs).size === 1 && JSON.parse(outs[0])?.code === "NOT_FOUND", `ผลต่างกัน: ${J(uniq(outs)).slice(0, 220)}`);
    eq(loads.map((x) => x ?? null), cases.map(() => null), "load");
    eq([await PL.load()(tok(ids.L3), { a: null }, popt("r5x"))], [null], "load ไม่ระบุประกาศ"); // ORACLE-EDIT (ผู้คุม 31 ต.ค. · d17-R5) LB = พอร์ทัลของร้าน B เอง (เห็นประกาศร้าน B ได้ตาม D.9 §3.1) · กรณี LB×AN.F1 ในตาราง cases คงไว้
    eq(await prisma.dormAnnouncementRead.count({ where: { tenantId: { in: [A, B] } } }), n0, "แถว");
  });
  await st("R-6", "rate limit ก่อนทุกอย่าง (ถัง dorm:portal:view): ครบ 120 ครั้ง/10 นาทีต่อ clientKey ⇒ ครั้งที่ 121 load = null · mark = RATE_LIMITED แม้ลิงก์ถูก", async () => {
    needAn("F1");
    const t = tok(ids.L1), o = popt("r6");
    let lastOk = true;
    for (let i = 0; i < 120; i++) { const v = await PL.load()(t, { a: null }, o); if (!v) { lastOk = false; break; } }
    ok(lastOk, "ยังไม่ถึง 120 ก็ถูกปฏิเสธ");
    eq([await PL.load()(t, { a: null }, o), (await PL.markRead()(t, { announcementId: AN.F1 }, o))?.code], [null, "RATE_LIMITED"], "หลังเกิน");
  }, "MAJOR");
  await st("P-1", "เมนู LINE \"ประกาศ\" (postback dorm.announce ของ D.9): ผู้เช่าห้อง 101 ⇒ ข้อความไทย (ไม่ใช่ข้อความกลาง) · 1–3 ลิงก์ /news?a= ของประกาศที่ห้อง 101 เห็น ลิงก์ของสัญญา L1 · ไม่มีหัวเรื่องประกาศที่ไม่เห็น · คนไม่เช่า/สัญญาจบ ⇒ ข้อความกลางเดิม", async () => {
    needAn("ALL", "BB", "F2", "R5");
    const NF = lineL.mod?.DORM_POSTBACK_NOT_FOUND;
    ok(typeof NF === "string", "ไม่มี DORM_POSTBACK_NOT_FOUND");
    const pb = async (k: string) => { const evt = PB.parsePostbackData("dorm.announce"); return fnOf(lineL, "onDormPostback", F.line)({ tenantId: A, connectionId: C[k].conn, chatContactId: C[k].id, partyId: C[k].partyId, replyToken: null }, evt, { now: VIEW }); };
    const r = await pb("C1");
    ok(typeof r?.text === "string" && THAI.test(r.text) && r.text !== NF && !LEGAL_BAD.test(r.text), `คำตอบ ${fmt(r)}`);
    const ls = newsLinks(r);
    const vis = new Set(visibleL1());
    ok(ls.length >= 1 && ls.length <= SD.limits.menuMax && ls.every((l) => vis.has(l.a) && l.sub?.subjectId === ids.L1), `ลิงก์ ${J(ls.map((l) => [l.a, l.sub?.subjectId]))}`);
    for (const k of ["BB", "F2", "R5"]) ok(!r.text.includes(TITLE[k]), `มีหัวเรื่อง ${k}`);
    eq([(await pb("CX"))?.text, (await pb("C3"))?.text], [NF, NF], "ไม่ใช่ผู้เช่า");
  }, "MAJOR");

  // ═══════════════ X-3 ผู้ดูแลอาคาร (#64) — หลังมีประกาศหลายกลุ่ม ═══════════════
  await st("X-3", "ผู้ดูแลอาคาร A: ไม่มีตัวเลือกทั้งหน่วย (canAll false · ALL ⇒ BAD_INPUT) · อาคาร B/ห้อง 111/ชั้น B1 ⇒ NOT_FOUND ผลเดียวกัน · ชั้น A1 ⇒ ok · model เห็นเฉพาะประกาศที่อยู่ในอาคาร A ทั้งหมด · สถิติ/ส่งซ้ำ/เผยแพร่ของ ALL/อาคาร B ⇒ NOT_FOUND", async () => {
    needAn("ALL", "BA", "BB", "F1", "F2", "R5", "R12");
    ok(NF_REF, "ไม่มีผลอ้างอิง (X-1)");
    const base = { unitId: DA, title: `ผู้ดูแล ${STAMP}`, body: SD.clean[0].body };
    const all = await DM.create()(cCare, { ...base, audience: { kind: "ALL" } });
    ok(all?.ok === false && all.code === "BAD_INPUT" && THAI.test(all.reason ?? ""), `ALL ${fmt(all)}`);
    const nf = [
      await DM.create()(cCare, { ...base, audience: { kind: "BUILDING", buildingIds: [ids.BB] } }),
      await DM.create()(cCare, { ...base, audience: { kind: "ROOM", roomIds: [R["111"]] } }),
      await DM.create()(cCare, { ...base, audience: { kind: "FLOOR", floors: [{ buildingId: ids.BB, floorNo: 1 }] } }),
      await DM.stats()(cCare, { unitId: DA, announcementId: AN.ALL }),
      await DM.stats()(cCare, { unitId: DA, announcementId: AN.R5 }),
      await PL.resend()(cCare, { unitId: DA, announcementId: AN.BB }, { now: NOW }),
    ];
    const bad = nf.map((r, i) => (J(r) === NF_REF ? null : `${i}: ${fmt(r)}`)).filter(Boolean);
    ok(!bad.length, `ต้อง NOT_FOUND เดียวกัน ${bad.join(" · ")}`);
    const okF = await createAs(cCare, "CARE", DA, { kind: "FLOOR", floors: [{ buildingId: ids.BA, floorNo: 1 }] });
    ok(okF?.ok, `ชั้น A1 ${fmt(okF)}`);
    const mdl = await DM.model()(cCare, { unitId: DA }, { now: NOW });
    ok(mdl && mdl.canAll === false, `model ${fmt(mdl)}`);
    eq((mdl.options.buildings as Any[]).map((b) => b.id), [ids.BA], "อาคารที่เลือกได้");
    ok((mdl.options.rooms as Any[]).every((r) => r.buildingId === ids.BA), "ห้องนอกอาคาร");
    const seen = (mdl.items as Any[]).map((x) => x.id);
    for (const k of ["BA", "F1", "F2", "R12", "CARE"]) ok(seen.includes(AN[k]), `ไม่เห็น ${k}`);
    for (const k of ["ALL", "BB", "R5", "DN"]) ok(!seen.includes(AN[k]), `เห็น ${k}`);
  });

  // ═══════════════ N-5 เวลาเงียบ + งานส่งซ้ำ ═══════════════
  await st("N-5", "เวลาเงียบ: เผยแพร่+ส่ง 22:30 ไทย ⇒ ไม่มีข้อความ (SKIPPED_QUIET 2) · งานส่งซ้ำ 08:05 ซ้อน 2 รอบ + 1 โพรเซส ⇒ C4 C5 คนละ 1 · Σresent 2 · รอบถัดไป 0 · ไม่แตะประกาศอื่น", async () => {
    needReady();
    await setVal(A, "messaging.quietHours", DA, SD.quietHours);
    try {
      const r = await createAs(cO, "Q", DA, AUD.F2);
      ok(r?.ok, `สร้าง ${fmt(r)}`);
      const m = mark();
      const { p, s } = await pubSend("Q", new Date(AT.quiet));
      ok(p?.ok && p.published && s?.quiet === 2 && pushes(m).length === 0, `ตอนเงียบ ${fmt([p, s])}`);
      eq((await logsOf(AN.Q)).map((l: Any) => l.status).sort(), ["SKIPPED_QUIET", "SKIPPED_QUIET"], "log ตอนเงียบ");
      const m2 = mark();
      const at = atIn();
      const [inproc, kids] = await Promise.all([
        inProcAt(at, [0, 1].map(() => () => PL.jobs()(new Date(AT.wake), { tenantId: A }))),
        fanout("jobs", [[{ now: AT.wake, tenantId: A }]], at),
      ]);
      const rs = [...inproc, ...kids];
      eq(badOf(rs), [], "throw/ชน");
      eq([pushKeys(m2), rs.reduce((x, y) => x + (Number(y?.resent) || 0), 0)], [["C4", "C5"], 2], "หลังพ้นเวลาเงียบ");
      const m3 = mark();
      const again = await PL.jobs()(new Date(AT.wake), { tenantId: A });
      eq([pushes(m3).length, again?.resent], [0, 0], "รอบถัดไป");
    } finally { await setVal(A, "messaging.quietHours", DA, null); }
  });

  // ═══════════════ W-4..W-6 ตอนส่ง (แถว/แม่แบบหลุดเข้าฐาน · ปิด LINE) ═══════════════
  await st("W-4", "แถวที่หลุดเข้าฐาน (เขียนตรง มีคำต้องห้ามในเนื้อหา): เผยแพร่ ⇒ LEGAL_BLOCK (ยังเป็นร่าง) · แถวที่เผยแพร่แล้ว ⇒ ส่ง TEMPLATE_BLOCKED ไม่มีข้อความ/log · พอร์ทัลไม่แสดง", async () => {
    needReady();
    const d = await prisma.dormAnnouncement.create({ data: { tenantId: A, unitId: DA, title: `แถวตรงร่าง ${STAMP}`, body: SD.forbidden[1].body, audience: "ROOM", audienceIds: [R["101"]], createdById: ids.OWN } });
    const pb = await prisma.dormAnnouncement.create({ data: { tenantId: A, unitId: DA, title: `แถวตรงเผยแพร่ ${STAMP}`, body: SD.forbidden[0].title, audience: "ROOM", audienceIds: [R["101"]], createdById: ids.OWN, publishedAt: NOW } });
    ids.AN_BAD = pb.id;
    const p = await DM.publish()(cO, { unitId: DA, announcementId: d.id }, { now: NOW });
    ok(p?.ok === false && p.code === "LEGAL_BLOCK", `เผยแพร่ร่างหลุด ${fmt(p)}`);
    eq((await prisma.dormAnnouncement.findUnique({ where: { id: d.id } }))?.publishedAt ?? null, null, "ร่างหลุดถูกเผยแพร่");
    const m = mark();
    const s = await PL.send()({ tenantId: A }, { announcementId: pb.id }, { now: NOW });
    eq([s?.status, pushes(m).length, (await logsOf(pb.id)).length], ["TEMPLATE_BLOCKED", 0, 0], "ส่ง");
    const v = await PL.load()(tok(ids.L1), { a: null }, popt("w4"));
    ok(v && !(v.items as Any[]).some((x) => x.id === pb.id), "พอร์ทัลแสดงแถวหลุด");
    ok((await PL.load()(tok(ids.L1), { a: pb.id }, popt("w4b"))) === null, "detail แถวหลุด");
  });
  await st("W-5", "แม่แบบ rooms.msg.announcement ของหน่วยที่หลุดเข้าฐาน (เขียนตรง มีคำต้องห้าม) ⇒ ส่ง TEMPLATE_BLOCKED ไม่มีข้อความ · เอาแม่แบบออก ⇒ ส่งได้ (ห้อง 101+102 = C1 C2)", async () => {
    needAn("W");
    await setVal(A, "rooms.msg.announcement", DA, { th: `ประกาศ {title} — ${SD.forbidden[0].title}\n{body}` });
    try {
      const p = await DM.publish()(cO, { unitId: DA, announcementId: AN.W }, { now: NOW });
      await parkOutbox(tenantIds);
      ok(p?.ok && p.published, `เผยแพร่ ${fmt(p)}`);
      const m = mark();
      const s = await PL.send()({ tenantId: A }, { announcementId: AN.W }, { now: NOW });
      eq([s?.status, pushes(m).length, (await logsOf(AN.W)).length], ["TEMPLATE_BLOCKED", 0, 0], "แม่แบบหลุด");
    } finally { await unsetVal(A, "rooms.msg.announcement", DA); }
    const m2 = mark();
    const s2 = await PL.send()({ tenantId: A }, { announcementId: AN.W }, { now: NOW });
    eq([s2?.status, pushKeys(m2)], ["DONE", ["C1", "C2"]], "หลังเอาแม่แบบออก");
  });
  await st("W-6", "ปิด rooms.notify.announceLine ⇒ ส่ง DISABLED (ไม่มีข้อความ/log) · พอร์ทัลยังแสดง", async () => {
    needReady();
    const r = await createAs(cO, "OFF", DA, { kind: "ROOM", roomIds: [R["201"]] });
    ok(r?.ok, `สร้าง ${fmt(r)}`);
    await setVal(A, "rooms.notify.announceLine", DA, false);
    try {
      const m = mark();
      const { p, s } = await pubSend("OFF");
      eq([p?.ok && p.published, s?.status, pushes(m).length, (await logsOf(AN.OFF)).length], [true, "DISABLED", 0, 0], "ปิด LINE");
      const v = await PL.load()(tok(ids.L201), { a: AN.OFF }, popt("w6"));
      eq(v?.detail?.id, AN.OFF, "พอร์ทัล");
    } finally { await unsetVal(A, "rooms.notify.announceLine", DA); }
  }, "MAJOR");

  // ═══════════════ A-6 สัญญาจบหลังเผยแพร่ · R-7 ผู้เช่าใหม่ · R-8 หน้าต่างวัน ═══════════════
  await st("A-6", "สัญญาจบหลังเผยแพร่ก่อนส่ง (ห้อง 102 ENDED) ⇒ ส่งถึงห้อง 101 เท่านั้น · ส่งซ้ำก็ไม่ถึง 102 · พอร์ทัลของ 102 ใช้ไม่ได้", async () => {
    needReady();
    const r = await createAs(cO, "X", DA, { kind: "ROOM", roomIds: [R["101"], R["102"]] });
    ok(r?.ok, `สร้าง ${fmt(r)}`);
    const p = await DM.publish()(cO, { unitId: DA, announcementId: AN.X }, { now: NOW });
    await parkOutbox(tenantIds);
    ok(p?.ok && p.published, `เผยแพร่ ${fmt(p)}`);
    await prisma.dormLease.update({ where: { id: ids.L2 }, data: { status: "ENDED", endedAt: new Date("2026-11-03T04:00:00Z"), endDate: dbDate(AT.endPrev), endReason: "MOVE_OUT" } });
    const m = mark();
    await PL.send()({ tenantId: A }, { announcementId: AN.X }, { now: NOW });
    await PL.resend()(cO, { unitId: DA, announcementId: AN.X }, { now: NOW });
    eq(pushKeys(m), ["C1"], "ผู้ได้ข้อความ");
    eq(await PL.load()(tok(ids.L2), { a: null }, popt("a6")), null, "พอร์ทัล 102");
  });
  await st("R-7", "ผู้เช่าใหม่ห้องเดิม (102 เข้า 10 พ.ย.): ไม่เห็นประกาศก่อนวันเข้า (ALL · ชั้น A1 · ห้อง 101/102) · เห็นประกาศอาคาร A ที่เผยแพร่หลังเข้า · อ่านประกาศเก่า ⇒ NOT_FOUND", async () => {
    needAn("ALL", "F1", "X");
    ids.L10 = await mkLease({ tenantId: A, unitId: DA, roomId: R["102"], partyId: ids.P10, start: AT.moveIn });
    const r = await createAs(cO, "NEW", DA, AUD.BA);
    ok(r?.ok, `สร้าง ${fmt(r)}`);
    const p = await DM.publish()(cO, { unitId: DA, announcementId: AN.NEW }, { now: new Date(AT.afterMoveIn) });
    await parkOutbox(tenantIds);
    ok(p?.ok && p.published, `เผยแพร่ ${fmt(p)}`);
    const v = await PL.load()(tok(ids.L10), { a: null }, popt("r7", AT.viewAfterMoveIn));
    ok(v, "พอร์ทัลผู้เช่าใหม่");
    const got = (v.items as Any[]).map((x) => x.id);
    ok(got.includes(AN.NEW), "ไม่เห็นประกาศใหม่");
    for (const k of ["ALL", "F1", "X"]) ok(!got.includes(AN[k]), `เห็นประกาศเก่า ${k}`);
    eq((await PL.markRead()(tok(ids.L10), { announcementId: AN.F1 }, popt("r7b", AT.viewAfterMoveIn)))?.code, "NOT_FOUND", "อ่านประกาศเก่า");
  });
  await st("R-8", "หน้าต่างวัน rooms.notify.announcePortalDays: ประกาศที่เผยแพร่ 1 ก.ย. ไม่แสดง (ค่าเริ่ม 30 วัน) · ตั้ง 90 วัน ⇒ แสดง", async () => {
    needReady();
    const r = await createAs(cO, "OLD", DA, { kind: "ROOM", roomIds: [R["101"]] });
    ok(r?.ok, `สร้าง ${fmt(r)}`);
    const p = await DM.publish()(cO, { unitId: DA, announcementId: AN.OLD }, { now: new Date(AT.old) });
    await parkOutbox(tenantIds);
    ok(p?.ok && p.published, `เผยแพร่ ${fmt(p)}`);
    const has = async (k: string) => ((await PL.load()(tok(ids.L1), { a: null }, popt(k)))?.items as Any[] | undefined)?.some((x) => x.id === AN.OLD);
    const a = await has("r8a");
    await setVal(A, "rooms.notify.announcePortalDays", DA, 90);
    let b: unknown;
    try { b = await has("r8b"); } finally { await unsetVal(A, "rooms.notify.announcePortalDays", DA); }
    eq([a, b], [false, true], "แสดง");
  }, "MAJOR");

  // ═══════════════ E-2 PII · U DOM ═══════════════
  await st("E-2", "log/outbox/audit ของประกาศไม่มีเบอร์/ชื่อเต็ม/เนื้อหา · dedupeKey = rooms:announcement:<id>:<partyId> (id ล้วน)", async () => {
    needReady();
    const logs = await prisma.serviceMessageLog.findMany({ where: { tenantId: { in: [A, B] }, dedupeKey: { startsWith: "rooms:announcement:" } } });
    ok(logs.length >= 10, `log น้อย ${logs.length}`);
    ok(logs.every((l: Any) => /^rooms:announcement:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/.test(l.dedupeKey)), "dedupeKey");
    const ev = await prisma.outboxEvent.findMany({ where: { tenantId: { in: [A, B] }, type: EV } });
    const au = await prisma.auditLog.findMany({ where: { tenantId: { in: [A, B] }, action: { startsWith: "dorm.announcement" } } });
    const blob = J([logs, ev, au]);
    ok(!PHONE_RE.test(blob) && !NAMES.some((n) => blob.includes(n)) && !blob.includes(SD.clean[0].body.slice(0, 20)) && !Object.values(TITLE).some((t) => blob.includes(t)), "มี PII/เนื้อหา");
  }, "MAJOR");
  const React = (await tryImport("react")).mod as Any;
  const RDS = (await tryImport("react-dom/server")).mod as Any;
  const html = async (rel: string, props: Any): Promise<string> => {
    const L = await loadIf(rel);
    const Comp = L.mod?.default;
    ok(typeof Comp === "function", `โหลด ${rel} ไม่ได้: ${L.err || "ไม่มี default export"}`);
    return String(RDS.renderToStaticMarkup(React.createElement(Comp, props))).replace(/<!-- -->/g, "");
  };
  const noop = async () => ({});
  await st("U-1", "DormAnnounce (เจ้าของ): ราก data-unit · ฟอร์ม (title maxlength 120 · body maxlength 2000 · audienceKind ALL/BUILDING/FLOOR/ROOM · ตัวเลือก 2 อาคาร 4 ชั้น 8 ห้อง) · แถวชั้น A1 \"อ่านแล้ว 2 จาก 2 คน\" + ส่งซ้ำ · แถวร่างมีปุ่มส่ง · ไม่มีชื่อ/เบอร์/คำต้องห้าม", async () => {
    needAn("F1", "BB");
    const model = await DM.model()(cO, { unitId: DA }, { now: NOW });
    ok(model?.canAll === true, `model ${fmt(model)}`);
    const h = await html(F.comp, { model, createAction: noop, publishAction: noop, resendAction: noop });
    const bad: string[] = [];
    if (!new RegExp(`data-dorm-announce[^>]*data-unit="${DA}"|data-unit="${DA}"[^>]*data-dorm-announce`).test(h)) bad.push("ราก");
    if (!/<form[^>]*data-announce-form/.test(h) || !/name="title"[^>]*maxLength="120"|maxLength="120"[^>]*name="title"/i.test(h) || !/<textarea[^>]*name="body"[^>]*maxLength="2000"|maxLength="2000"[^>]*name="body"/i.test(h)) bad.push("ฟอร์ม");
    for (const k of ["ALL", "BUILDING", "FLOOR", "ROOM"]) if (!new RegExp(`name="audienceKind"[^>]*value="${k}"|value="${k}"[^>]*name="audienceKind"`).test(h)) bad.push(`radio ${k}`);
    const opt = (k: string) => (h.match(new RegExp(`data-audience-option="${k}"`, "g")) ?? []).length;
    if (opt("BUILDING") !== 2 || opt("FLOOR") !== 4 || opt("ROOM") !== 8) bad.push(`ตัวเลือก ${opt("BUILDING")}/${opt("FLOOR")}/${opt("ROOM")}`);
    const rowF1 = new RegExp(`data-announce-row="${AN.F1}"[\\s\\S]*?data-reads="2"[^>]*data-recipients="2"|data-announce-row="${AN.F1}"[\\s\\S]*?data-recipients="2"[^>]*data-reads="2"`);
    if (!rowF1.test(h) || !/อ่านแล้ว 2 จาก 2 คน/.test(h) || !/data-announce-resend/.test(h)) bad.push("แถวเผยแพร่ F1");
    if (AN.CARE && !new RegExp(`data-announce-row="${AN.CARE}"[^>]*data-status="DRAFT"|data-status="DRAFT"[^>]*data-announce-row="${AN.CARE}"`).test(h)) bad.push("แถวร่าง CARE");
    if (!/data-announce-publish/.test(h)) bad.push("ปุ่มส่งร่าง");
    if (NAMES.some((n) => h.includes(n)) || PHONE_RE.test(h) || LEGAL_BAD.test(h)) bad.push("ชื่อ/เบอร์/คำต้องห้าม");
    ok(!bad.length, bad.join(" · "));
  }, "MAJOR");
  await st("U-2", "DormAnnounce (ผู้ดูแลอาคาร A): ไม่มี radio ALL · ตัวเลือกอาคาร 1 · ห้องเฉพาะอาคาร A (5)", async () => {
    needReady();
    const model = await DM.model()(cCare, { unitId: DA }, { now: NOW });
    const h = await html(F.comp, { model, createAction: noop, publishAction: noop, resendAction: noop });
    const opt = (k: string) => (h.match(new RegExp(`data-audience-option="${k}"`, "g")) ?? []).length;
    ok(!/value="ALL"/.test(h), "มีตัวเลือกทั้งหน่วย");
    eq([opt("BUILDING"), opt("FLOOR"), opt("ROOM")], [1, 2, 5], "ตัวเลือก");
  }, "MAJOR");
  await st("U-3", "DormPortalNews: ราก data-dorm-news · หัว \"ห้อง 101\" · แถว a[data-news-row] href ?a= · detail title/body · ลิงก์กลับพอร์ทัล /d/<token> · ไม่มีชื่อ/เบอร์", async () => {
    needAn("F1");
    const t = tok(ids.L1);
    const view = await PL.load()(t, { a: AN.F1 }, popt("u3"));
    ok(view, "ไม่มี view");
    const h = await html(F.newsComp, { view, token: t, markRead: noop });
    const bad: string[] = [];
    if (!/data-dorm-news/.test(h) || !/ห้อง 101/.test(h)) bad.push("ราก/หัว");
    if (!new RegExp(`<a[^>]*data-news-row="${AN.F1}"[^>]*href="\\?a=${AN.F1}"|<a[^>]*href="\\?a=${AN.F1}"[^>]*data-news-row="${AN.F1}"`).test(h)) bad.push("แถว");
    if (!new RegExp(`data-news-detail="${AN.F1}"`).test(h) || !/data-news-title/.test(h) || !/data-news-body/.test(h) || !h.includes(TITLE.F1)) bad.push("detail");
    if (!new RegExp(`data-news-portal[^>]*href="/d/${t.replace(/\./g, "\\.")}"|href="/d/${t.replace(/\./g, "\\.")}"[^>]*data-news-portal`).test(h)) bad.push("ลิงก์พอร์ทัล");
    if (NAMES.some((n) => h.includes(n)) || PHONE_RE.test(h)) bad.push("ชื่อ/เบอร์");
    ok(!bad.length, bad.join(" · "));
  }, "MAJOR");
  await st("M-1", "ไม่มีคำขอออกนอกเครื่อง (ไม่ยิง LINE จริง)", () => eq(BLOCKED, [], "คำขอนอกเครื่อง"), "MINOR");
} catch (e) {
  record("CRASH", "จบกลางทาง", "FAIL", errMsg(e), "CRITICAL");
} finally {
  // ═══════════════ Z ล้างข้อมูล ═══════════════
  console.log("\n── Z: ล้างข้อมูล ──");
  try { await cleanup(tenantIds); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); }
  await cleanupMisc();
  await st("Z-1", "หลังล้าง: tenant `qc-svc-d17-*` 0 · แถวของร้านทดสอบ 0 ทุกตาราง (ประกาศ/การอ่าน/log/outbox/ค่าตั้ง) · ผู้ใช้ทดสอบ 0 · rate bucket ของรอบ 0", async () => {
    eq(await prisma.tenant.count({ where: { slug: { startsWith: "qc-svc-d17-" } } }), 0, "tenant");
    const left: string[] = [];
    if (tenantIds.length) for (const t of await tablesWithTenant()) { const r: { n: bigint }[] = await prisma.$queryRawUnsafe(`SELECT count(*)::bigint AS n FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, tenantIds); if (Number(r[0]?.n ?? 0)) left.push(t); }
    eq(left, [], "ตารางที่ค้าง");
    eq(await prisma.user.count({ where: { email: { startsWith: "svc-d17-" } } }), 0, "user");
    const rb: { n: bigint }[] = await prisma.$queryRawUnsafe(`SELECT count(*)::bigint AS n FROM "ChatRateBucket" WHERE key LIKE $1`, `%qc-d17-${STAMP}%`);
    eq(Number(rb[0]?.n ?? 0), 0, "rate bucket");
  }, "MAJOR");
  globalThis.fetch = REAL_FETCH;
  if (LINE_API_BASE_SAVED === undefined) delete process.env.LINE_API_BASE; else process.env.LINE_API_BASE = LINE_API_BASE_SAVED;
  server.close();
}

// ═══════════════ S-1/S-2 ไฟล์ที่แตะ (git) — ตรวจตอนรับใบเท่านั้น ═══════════════
console.log("\n── S: ไฟล์ที่แตะ (git · ตอนรับใบ) ──");
const git = (args: string[]) => execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const dirty = (paths: string[]) => git(["status", "--porcelain", "--untracked-files=all", "--", ...paths]).split("\n").filter(Boolean).map((l) => l.slice(3).trim().replace(/^"|"$/g, ""));
const removedLines = (f: string) => git(["diff", "-U0", "HEAD", "--", f]).split("\n").filter((l) => /^-(?!-)/.test(l) && l.slice(1).trim());
const OWN = new Set<string>([...NEW_FILES, F.dormIndex, F.defs, F.perm, F.consumers, F.autoLabels, F.minute, F.line, "src/components/dorm/DormHome.tsx", "src/app/app/u/[unitSlug]/dorm/page.tsx" /* ORACLE-EDIT (ผู้คุม 31 ต.ค. · d17-S1) F7 ปุ่มประกาศบนหน้าแรกหอ */]);
{
  const headHas = (() => { try { git(["cat-file", "-e", `HEAD:${F.plat}`]); return true; } catch { return false; } })();
  const n1 = "แตะเฉพาะไฟล์ของใบ (§1)", n2 = "ไม่แตะไฟล์ต้องห้าม (prisma · core นอก defs/rooms+permissions · notify-customer · dorm-portal · postback-routes · แชท · payment · บัญชี · โมดูลหอนอก announce/index · คอมโพเนนต์หอเดิม · webhooks/labels) · ไฟล์ร่วมแก้แบบเพิ่ม (permissions ลบได้ 1 บรรทัด)";
  if (headHas) {
    skip("S-1", n1, "D.17 merge แล้ว — ข้อนี้ตรวจเฉพาะตอนรับใบ (ใบหลังแตะไฟล์ได้)", "MAJOR");
    skip("S-2", n2, "D.17 merge แล้ว — ข้อนี้ตรวจเฉพาะตอนรับใบ", "CRITICAL");
  } else {
    await st("S-1", n1, () => {
      const outside = dirty(["src", "prisma", "public"]).filter((f) => !OWN.has(f));
      ok(outside.length === 0, `ไฟล์นอกใบ: ${outside.slice(0, 8).join(", ")}`);
    }, "MAJOR");
    await st("S-2", n2, () => {
      const banned = dirty(["prisma", "src/lib/core", "src/lib/platform/notify-customer.ts", "src/lib/platform/dorm-portal.ts", "src/lib/platform/postback-routes.ts", "src/lib/modules/chat", "src/lib/payment",
        "src/lib/modules/account", "src/lib/modules/dorm", "src/components/dorm/dorm-home-shared.ts", "src/components/dorm/dorm-policy-shared.ts", "src/components/dorm/portal/DormPortal.tsx",
        "src/app/(store)/d/[token]/page.tsx", "src/app/(store)/d/[token]/actions.ts", F.webLabels]).filter((f) => ![F.defs, F.perm, F.mod, F.dormIndex].includes(f as never));
      eq(banned, [], "ไฟล์ต้องห้าม");
      const rm: Record<string, number> = {};
      for (const f of [F.defs, F.dormIndex, F.consumers, F.autoLabels, F.minute]) rm[f] = removedLines(f).length;
      const rmPerm = removedLines(F.perm);
      ok(Object.values(rm).every((n) => n === 0), `ลบบรรทัด ${J(rm)}`);
      ok(rmPerm.length <= 1 && rmPerm.every((l) => /dorm\.announce/.test(l)), `permissions ลบ ${J(rmPerm)}`);
    });
  }
}

// ═══════════════ V ภาพจอพนักงาน (ไม่มีภาพแบบ ⇒ HTTP + ไม่ล้น) ═══════════════
console.log("\n── V ภาพ ──");
{
  const base = process.env.QC_BASE ?? "";
  const n1 = "visual-svc d.17 (จอประกาศพนักงาน svcqc · 1440 + 390 ไม่ล้น · HTTP < 400 · ไม่ใช่ PARITY)";
  if (!base) skip("V-1", n1, "ไม่มี QC_BASE — ผู้คุม build QC ผ่าน iso + reseed แล้วรันซ้ำด้วย QC_BASE (ไม่ต้องรันฉาก)", "MAJOR");
  else {
    const r = spawnSync("pnpm", ["exec", "tsx", "scripts/visual-svc.mts", "d.17", "--user", "owner", "--base", base], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
    const o = `${r.stdout ?? ""}${r.stderr ?? ""}`;
    record("V-1", n1, r.status === 0 ? "PASS" : "FAIL", r.status === 0 ? "" : `exit=${r.status} ${o.split("\n").filter((l) => l.includes("❌")).slice(0, 3).join(" | ").slice(0, 300)}`, "MAJOR");
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
  { s: "qc-svc-d.9", args: ["--no-regression"], judge: (out) => { const s = summaryOf(out); return !!s && s.failed.every((id) => id === "S-1" || id === "S-2"); }, note: "ไม่มี FAIL ยกเว้น S-1/S-2 = ข้อ 'ไฟล์ของใบ D.9' (ทรีมีไฟล์ D.17)" },
  { s: "qc-svc-d.13", args: ["--no-regression"], judge: judgeNoFail, note: "ไม่มี FAIL" },
  { s: "qc-svc-d.11", args: ["--no-regression"], judge: judgeNoFail, note: "ไม่มี FAIL" },
  { s: "qc-svc-smoke" },
];
{
  const hasWork = typeof platL.mod?.sendDormAnnouncement === "function" && typeof dormL.mod?.publishDormAnnouncement === "function";
  const why = !hasWork ? "ยังไม่มีงานของใบ (dorm-announce.sendDormAnnouncement / facade publishDormAnnouncement) — regression รันเมื่อมีงาน" : NO_REG ? "--no-regression / SVC_D17_NO_REGRESSION=1" : "";
  for (const [i, g] of REG.entries()) {
    const id = `G-${i + 1}`;
    const name = `${g.s}${g.args?.length ? ` ${g.args.join(" ")}` : ""}${g.note ? ` (${g.note})` : " exit 0"}`;
    if (why) { skip(id, name, why); continue; }
    if (!existsSync(join(ROOT, "scripts", `${g.s}.mts`))) { record(id, name, "FAIL", "ไม่มีไฟล์ชุด", "CRITICAL"); continue; }
    const t = Date.now();
    const r = spawnSync("pnpm", ["exec", "tsx", `scripts/${g.s}.mts`, ...(g.args ?? [])], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, timeout: 45 * 60_000 });
    const all = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
    const log = `/tmp/svc-d17-reg-${g.s}.log`;
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
console.log(`\n===== QC SVC D.17 · ประกาศ + อ่านแล้ว =====\nผ่าน ${passed}/${cks.length}${skipped.length ? ` (SKIP ${skipped.length})` : ""}`);
console.log(`FINDINGS: CRITICAL ${failed.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${failed.filter((c) => c.sev === "MAJOR").length} · MINOR ${failed.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), findings: [...failed, ...skipped].map((c) => c.id) })}`);
// รับใบ = ผ่านทุกข้อ (SKIP ที่ยอมได้ระหว่างทำ: G-* เมื่อ --no-regression · V-1 ไม่มี QC_BASE · S-1/S-2 หลัง merge — ผู้คุมรันซ้ำครบก่อนรับ)
process.exit(failed.length + skipped.length > 0 ? 1 : 0);
