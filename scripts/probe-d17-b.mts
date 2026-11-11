// PROBE — SVC D.17 ผู้ตรวจ (มติ R5 · ยิงหลายโพรเซสจริง) · ไม่ใช่ข้อสอบ · ไม่แก้ src · ไม่ยิง LINE จริง (ตัวจำลอง 127.0.0.1 + LINE_API_BASE)
// รัน: cd /root/projects/shark-svc-l3 && bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/probe-d17-b.mts
// ข้อมูลใต้ร้าน `qc-svc-d17pb-*` + ผู้ใช้ `svc-d17pb-*@shark.local` · trigger/sequence ชั่วคราว `probe_d17_*` (กรองด้วย tenantId ของ probe) · ล้างใน finally ทุกครั้ง
// หมวด: PB เผยแพร่ ×20 หลายโพรเซส · SD ส่ง ×24 หลายโพรเซส · RD อ่าน ×24 จาก 3 โพรเซส · LE สัญญาจบกลางรอบส่ง · XN NOT_FOUND ทุกไบต์ (ร้าน/หน่วย/อาคาร)
//       BZ 40P01 บังคับจากฐาน (trigger RAISE 40P01) ⇒ ลองใหม่ 1 ครั้ง แล้ว BUSY · JB งานส่งซ้ำ (ขอบเขต/อดอยาก/audit ซ้ำ)
/* eslint-disable @typescript-eslint/no-explicit-any */
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { isDeepStrictEqual } from "node:util";
import { randomBytes, randomInt } from "node:crypto";
import { svcQcHostMark } from "./svc-qc-hosts.mjs";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";

const SELF = fileURLToPath(import.meta.url);
const ROOT = join(dirname(SELF), "..");
const PLAT = "src/lib/platform/dorm-announce.ts";
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 260);
const J = (x: unknown) => { try { return JSON.stringify(x); } catch { return String(x); } };

loadSvcQcEnv("probe-d17-b"); // SESSION_SECRET ฯลฯ ของ .env.qc-svc (ด่านฐานในตัว)
for (const n of ["DATABASE_URL", "DIRECT_URL"] as const) {
  const u = process.env[n] ?? "";
  let hn = "";
  try { hn = new URL(u).hostname; } catch { /* */ }
  if (!hn.includes(svcQcHostMark())) { console.error(`🔴 probe: ${n} ไม่ใช่ฐาน qc-svc — หยุด`); process.exit(4); }
}
if (process.env.APP_ENV === "production" || process.env.CI) { console.error("🔴 probe: env ต้องห้าม"); process.exit(4); }
process.env.APP_URL = "https://qc-d17pb.invalid";

type Call = { m: "dorm" | "plat"; op: string; args: any[] };
const revive = (_k: string, v: any) => (v && typeof v === "object" && typeof v.__date === "string" ? new Date(v.__date) : v);
const D = (iso: string) => ({ __date: iso });

// ═══════════ โหมดลูก ═══════════
const CA = process.argv.indexOf("--child");
if (CA >= 0) {
  const job = JSON.parse(Buffer.from(process.argv[CA + 1] ?? "", "base64url").toString("utf8"), revive) as { calls: Call[]; at: number };
  let out: unknown[] = [];
  try {
    const mods: Record<string, any> = { dorm: await import("@/lib/modules/dorm" as string), plat: await import(pathToFileURL(join(ROOT, PLAT)).href) };
    const wait = job.at - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    out = await Promise.all(job.calls.map(async (c) => {
      const t0 = Date.now();
      try { const r = await mods[c.m][c.op](...c.args); return { op: c.op, r, ms: Date.now() - t0 }; }
      catch (e) { return { op: c.op, threw: errMsg(e), ms: Date.now() - t0 }; }
    }));
  } catch (e) { out = [{ childFail: errMsg(e) }]; }
  console.log(`CHILD_RESULT ${JSON.stringify(out)}`);
  try { const { prisma } = (await import("@/lib/core/db" as string)) as any; await prisma.$disconnect(); } catch { /* */ }
  process.exit(0);
}

// ═══════════ ตัวจำลอง LINE (โพรเซสลูกได้ LINE_API_BASE เดียวกัน) ═══════════
type Push = { to: string; at: number; json: any };
const PUSH: Push[] = [];
let pushDelayMs = 0;
let onPush: ((p: Push) => void) | null = null;
const server = createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on("data", (c: Buffer) => chunks.push(c));
  req.on("end", () => {
    const path = (req.url ?? "").split("?")[0] ?? "";
    let json: any = null;
    try { json = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { /* */ }
    const reply = (obj: unknown) => { if (res.writableEnded) return; res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
    if (req.method === "POST" && path === "/v2/bot/message/push") {
      const p = { to: String(json?.to ?? ""), at: Date.now(), json };
      PUSH.push(p);
      try { onPush?.(p); } catch { /* */ }
      if (pushDelayMs > 0) { setTimeout(() => reply({ sentMessages: [{ id: `pm${PUSH.length}` }] }), pushDelayMs); return; }
      return reply({ sentMessages: [{ id: `pm${PUSH.length}` }] });
    }
    if (req.method === "GET" && path.startsWith("/v2/bot/profile/")) return reply({ displayName: "x", userId: path.split("/").pop() });
    return reply({});
  });
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
process.env.LINE_API_BASE = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const REAL_FETCH = globalThis.fetch;
const BLOCKED: string[] = [];
globalThis.fetch = (async (input: any, init?: any): Promise<Response> => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : String(input?.url ?? "");
  let host = "";
  try { host = new URL(url).hostname; } catch { /* */ }
  if (host === "127.0.0.1" || host === "localhost" || host.endsWith(".neon.tech")) return REAL_FETCH(input, init);
  BLOCKED.push(host.slice(0, 80));
  return new Response("{}", { status: 503 });
}) as typeof fetch;

{
  const { appendFileSync } = await import("node:fs");
  const LOG = `/tmp/probe-d17-b.out.${process.pid}.log`;
  process.stdout.on("error", () => { /* */ });
  const orig = console.log.bind(console);
  console.log = (...a: unknown[]) => { try { appendFileSync(LOG, `${a.map((x) => (typeof x === "string" ? x : J(x))).join(" ")}\n`); } catch { /* */ } try { orig(...a); } catch { /* */ } };
  console.log(`(probe log: ${LOG} · start ${new Date().toISOString()} · LINE ${process.env.LINE_API_BASE})`);
}

async function procs(jobs: Call[][], leadMs = 14_000): Promise<any[]> {
  const at = Date.now() + leadMs;
  const outs = await Promise.all(jobs.map((calls) => new Promise<any[]>((resolve) => {
    const child = spawn(process.execPath, [...process.execArgv, SELF, "--child", Buffer.from(JSON.stringify({ calls, at })).toString("base64url")], { cwd: ROOT, env: process.env });
    let buf = "";
    child.stdout.on("data", (d) => { buf += String(d); });
    child.stderr.on("data", (d) => { buf += String(d); });
    child.on("close", (code) => {
      const m = /CHILD_RESULT (\[.*\])/.exec(buf);
      let out: any[] = [];
      try { out = m ? JSON.parse(m[1]) : [{ childFail: `exit=${code} ${buf.split("\n").slice(-3).join(" | ").slice(0, 200)}` }]; } catch { out = [{ childFail: "parse" }]; }
      resolve(out);
    });
  })));
  return outs.flat();
}

type F = { id: string; ok: boolean; sev: string; what: string; detail: string };
const results: F[] = [];
const rec = (id: string, ok: boolean, sev: string, what: string, detail: unknown) => {
  results.push({ id, ok, sev, what, detail: typeof detail === "string" ? detail : J(detail) });
  console.log(`  ${ok ? "✅ HOLD" : "❌ BREACH"} [${id}] (${sev}) ${what}${` — ${typeof detail === "string" ? detail : J(detail)}`.slice(0, 2400)}`);
};
const BADRX = /P2028|P2024|P2002|P2034|40P01|deadlock|timed out|Unable to start a transaction|Transaction already closed|Unique constraint/i;
const badOf = (rs: any[]) => rs.filter((x) => x?.threw || x?.childFail || BADRX.test(J(x?.r ?? x)));
const tally = (rs: any[], f: (x: any) => string) => { const t: Record<string, number> = {}; for (const x of rs) { const k = f(x); t[k] = (t[k] ?? 0) + 1; } return t; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const { prisma } = (await import("@/lib/core/db" as string)) as { prisma: any };
const dorm: any = await import("@/lib/modules/dorm" as string);
const plat: any = await import(pathToFileURL(join(ROOT, PLAT)).href);
const SL: any = await import("@/lib/core/signed-link" as string);
const PRISMA_NS: any = (await import("@prisma/client" as string)).Prisma;
const EV = "dorm.announcement.published";

// ═══════════ ล้าง ═══════════
let tenantTables: string[] | null = null;
async function tablesWithTenant(): Promise<string[]> {
  if (tenantTables) return tenantTables;
  const rows: { t: string }[] = await prisma.$queryRawUnsafe(
    `SELECT c.table_name AS t FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
      WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE'`);
  tenantTables = rows.map((r) => r.t).filter((t) => t !== "Tenant");
  return tenantTables;
}
async function dropTrap() {
  for (const s of [`DROP TRIGGER IF EXISTS probe_d17_trap ON "DormAnnouncement"`, `DROP FUNCTION IF EXISTS probe_d17_trap_fn()`, `DROP TABLE IF EXISTS probe_d17_trap_cfg`, `DROP SEQUENCE IF EXISTS probe_d17_trap_seq`]) {
    try { await prisma.$executeRawUnsafe(s); } catch (e) { console.log(`  ⚠️ drop trap: ${errMsg(e)}`); }
  }
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

const tenantIds: string[] = [];
const STAMP = `${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;
const CK = (k: string) => `pb-d17-${STAMP}-${k}`;
let exitCode = 0;
try {
  await dropTrap();
  const stale = await prisma.tenant.findMany({ where: { slug: { startsWith: "qc-svc-d17pb-" } }, select: { id: true } });
  if (stale.length) await cleanup(stale.map((t: { id: string }) => t.id));
  await prisma.user.deleteMany({ where: { email: { startsWith: "svc-d17pb-" } } });

  // ═══════════ ฉาก ═══════════
  const NOW = new Date("2026-11-03T03:00:00.000Z"); // 10:00 ไทย
  const NOW_ISO = NOW.toISOString();
  const dbDate = (ymd: string) => new Date(`${ymd}T00:00:00Z`);
  const mkTenant = async (tag: string) => { const t = await prisma.tenant.create({ data: { name: `PB D17 ${tag}`, slug: `qc-svc-d17pb-${tag}-${STAMP}` } }); tenantIds.push(t.id); return t.id as string; };
  const A = await mkTenant("a"), B = await mkTenant("b");
  const mkUnit = async (tenantId: string, tag: string) => (await prisma.businessUnit.create({ data: { tenantId, type: "DORM", name: `หอพีบี ${tag}`, slug: `pb17${tag}-${STAMP}` } })).id as string;
  const setVal = async (tenantId: string, key: string, scopeId: string, value: unknown) => {
    await prisma.settingValue.deleteMany({ where: { tenantId, key, scope: "UNIT", scopeId } });
    await prisma.settingValue.create({ data: { tenantId, key, scope: "UNIT", scopeId, value: value === null ? PRISMA_NS.JsonNull : value, setById: "pb-d17" } });
  };
  const mems: Record<string, string> = {};
  const mkUser = async (key: string, tenantId: string, role: string, unitAccess: string[], perms: string[] = []) => {
    const u = await prisma.user.create({ data: { email: `svc-d17pb-${STAMP}-${key}@shark.local`, name: `PB17 ${key}` } });
    const m = await prisma.membership.create({ data: { userId: u.id, tenantId, role, unitAccess, permissions: Object.fromEntries(perms.map((p) => [p, true])), acceptedAt: new Date() } });
    mems[key] = m.id;
    return u.id as string;
  };
  const NAMES: string[] = [];
  const PHONES: string[] = [];
  const newPhone = () => { for (;;) { const p = `08${randomInt(10_000_000, 99_999_999)}`; if (!PHONES.includes(p)) { PHONES.push(p); return p; } } };
  const mkParty = async (tenantId: string, name: string) => { NAMES.push(name); return (await prisma.party.create({ data: { tenantId, name, phone: newPhone() } })).id as string; };
  const mkLease = async (o: { tenantId: string; unitId: string; roomId: string; partyId: string; status?: string; start?: string; end?: string; ended?: boolean }) => (await prisma.dormLease.create({ data: {
    tenantId: o.tenantId, unitId: o.unitId, roomId: o.roomId, partyId: o.partyId, status: o.status ?? "ACTIVE", startDate: dbDate(o.start ?? "2026-01-01"), endDate: dbDate(o.end ?? "2027-12-31"),
    rentSatang: 450_000, commonFeeSatang: 30_000, createdById: "pb-d17", ...(o.ended ? { endedAt: new Date("2026-10-31T10:00:00Z"), endReason: "MOVE_OUT" } : {}),
  } })).id as string;
  const RAND = randomBytes(3).toString("hex");
  const EXT: Record<string, string> = {}; // key → externalUserId
  const sysA = (await prisma.appSystem.create({ data: { tenantId: A, type: "CHAT", name: `pb-d17-chat-${STAMP}` } })).id;
  const sysB = (await prisma.appSystem.create({ data: { tenantId: B, type: "CHAT", name: `pb-d17-chat-b-${STAMP}` } })).id;
  const mkConn = async (tenantId: string, sys: string, tag: string) => (await prisma.chatChannelConnection.create({ data: { tenantId, systemId: sys, type: "LINE", displayName: `pb-d17-${tag}-${STAMP}`, externalAccountId: `pb-d17-${tag}-${STAMP}`, credentials: { channelAccessToken: `pbd17tok${tag}${RAND}`, channelSecret: `pbd17sec${tag}${RAND}` }, meta: { basicId: `@pbd17${tag}` } } })).id as string;
  const OA1 = await mkConn(A, sysA, "a1"), OAB = await mkConn(B, sysB, "b");
  const mkContact = async (key: string, tenantId: string, sys: string, conn: string, partyId: string) => {
    EXT[key] = `Upbd17${key}${RAND}`;
    await prisma.chatContact.create({ data: { tenantId, systemId: sys, channel: "LINE", channelConnectionId: conn, externalUserId: EXT[key], partyId, lang: "th" } });
  };
  const keyOfTo = (to: string) => Object.keys(EXT).find((k) => EXT[k] === to) ?? `?${to.slice(0, 12)}`;
  const pushKeys = (from: number, pred?: (p: Push) => boolean) => PUSH.slice(from).filter((p) => !pred || pred(p)).map((p) => keyOfTo(p.to)).sort();

  // หน่วย DA (2 อาคาร) · DN (หน่วยที่สองของร้าน A ใช้ OA1 ร่วม) · DM (ทดสอบจบกลางรอบส่ง) · DZ (LINE ปิด · ซอมบี้) · DQ (เวลาเงียบ) · DT (แม่แบบหลุด) · DB (ร้าน B)
  const DA = await mkUnit(A, "a"), DN = await mkUnit(A, "n"), DM = await mkUnit(A, "m"), DZ = await mkUnit(A, "z"), DQ = await mkUnit(A, "q"), DT = await mkUnit(A, "t"), DB = await mkUnit(B, "b");
  for (const [t, u] of [[A, DA], [A, DN], [A, DM], [A, DZ], [A, DQ], [A, DT], [B, DB]] as const) {
    await setVal(t, "messaging.quietHours", u, null);
    await setVal(t, "messaging.channelOrder", u, ["LINE", "WEB_LINK"]);
    await setVal(t, "messaging.lineConnectionId", u, t === A ? OA1 : OAB);
  }
  await setVal(A, "rooms.notify.announceLine", DZ, false);
  await setVal(A, "messaging.quietHours", DQ, { start: "21:00", end: "08:00" });
  const OWN = await mkUser("own", A, "OWNER", ["*"]);
  const OWNB = await mkUser("ownb", B, "OWNER", ["*"]);
  const CARE = await mkUser("care", A, "STAFF", [DA], ["dorm.view", "dorm.announce"]);
  const cO = { tenantId: A, actorUserId: OWN }, cOB = { tenantId: B, actorUserId: OWNB }, cCare = { tenantId: A, actorUserId: CARE };

  const R: Record<string, string> = {};
  const L: Record<string, string> = {};
  const P: Record<string, string> = {};
  const room = async (tenantId: string, unitId: string, ty: string, no: string, bld: string | null, floor: number | null, active = true) =>
    (await prisma.hotelRoom.create({ data: { tenantId, unitId, roomTypeId: ty, number: no, buildingId: bld, floorNo: floor, floor: floor === null ? null : String(floor), active } })).id as string;
  const ty = async (tenantId: string, unitId: string) => (await prisma.hotelRoomType.create({ data: { tenantId, unitId, name: "มาตรฐาน", capacity: 2, baseRateSatang: 450_000, depositSatang: 0, rentMode: "MONTHLY" } })).id as string;
  const tyA = await ty(A, DA);
  const BA = (await prisma.roomBuilding.create({ data: { tenantId: A, unitId: DA, name: "อาคาร A", floors: 2, sortOrder: 1 } })).id as string;
  const BB = (await prisma.roomBuilding.create({ data: { tenantId: A, unitId: DA, name: "อาคาร B", floors: 2, sortOrder: 2 } })).id as string;
  for (const [n, b, f] of [["101", BA, 1], ["102", BA, 1], ["103", BA, 1], ["104", BA, 1], ["105", BA, 1], ["201", BA, 2], ["111", BB, 1], ["112", BB, 1]] as const) R[n] = await room(A, DA, tyA, n, b, f);
  R["199"] = await room(A, DA, tyA, "199", BA, 1, false); // ห้องปิด
  const tyN = await ty(A, DN);
  const BN = (await prisma.roomBuilding.create({ data: { tenantId: A, unitId: DN, name: "อาคาร N", floors: 1, sortOrder: 1 } })).id as string;
  R.N1 = await room(A, DN, tyN, "301", BN, 1);
  const tyB = await ty(B, DB);
  const BX = (await prisma.roomBuilding.create({ data: { tenantId: B, unitId: DB, name: "อาคาร X", floors: 1, sortOrder: 1 } })).id as string;
  R.B1 = await room(B, DB, tyB, "101", BX, 1);
  // ผู้เช่า DA: 101 P1 · 102 P2 (NOTICE) · 103 P3 ENDED · 104 P4 DRAFT · 105 P5 เลยวันจบ (ยังไม่ปิด) · 201 P6 · 111 P6 (คนเดียว 2 ห้อง ต่างอาคาร) · 112 P7 · 199 P8 (ห้องปิด)
  for (const k of ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "PN"]) P[k] = await mkParty(A, `ผู้เช่าพีบี ${k} นามสกุลยาว`);
  P.PB = await mkParty(B, "ผู้เช่าร้านบี พีบี");
  L["101"] = await mkLease({ tenantId: A, unitId: DA, roomId: R["101"], partyId: P.P1 });
  L["102"] = await mkLease({ tenantId: A, unitId: DA, roomId: R["102"], partyId: P.P2, status: "NOTICE" });
  L["103"] = await mkLease({ tenantId: A, unitId: DA, roomId: R["103"], partyId: P.P3, status: "ENDED", end: "2026-10-31", ended: true });
  L["104"] = await mkLease({ tenantId: A, unitId: DA, roomId: R["104"], partyId: P.P4, status: "DRAFT", start: "2026-12-01" });
  L["105"] = await mkLease({ tenantId: A, unitId: DA, roomId: R["105"], partyId: P.P5, start: "2025-10-16", end: "2026-10-15" });
  L["201"] = await mkLease({ tenantId: A, unitId: DA, roomId: R["201"], partyId: P.P6 });
  L["111"] = await mkLease({ tenantId: A, unitId: DA, roomId: R["111"], partyId: P.P6 });
  L["112"] = await mkLease({ tenantId: A, unitId: DA, roomId: R["112"], partyId: P.P7 });
  L["199"] = await mkLease({ tenantId: A, unitId: DA, roomId: R["199"], partyId: P.P8 });
  L.N1 = await mkLease({ tenantId: A, unitId: DN, roomId: R.N1, partyId: P.PN });
  L.B1 = await mkLease({ tenantId: B, unitId: DB, roomId: R.B1, partyId: P.PB });
  for (const k of ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "PN"]) await mkContact(k, A, sysA, OA1, P[k]);
  await mkContact("PB", B, sysB, OAB, P.PB);
  await setVal(A, "rooms.access.managerScope", DA, "BUILDING");
  await setVal(A, "rooms.access.buildingAssignments", DA, { [mems.care]: [BA] });
  const parkOutbox = async () => { await prisma.$executeRawUnsafe(`UPDATE "OutboxEvent" SET "availableAt" = now() + interval '2 days' WHERE "tenantId" = ANY($1::text[]) AND status::text = 'PENDING'`, tenantIds); };
  const logsOf = (annId: string) => prisma.serviceMessageLog.findMany({ where: { tenantId: { in: tenantIds }, dedupeKey: { startsWith: `rooms:announcement:${annId}:` } }, select: { dedupeKey: true, status: true, partyId: true, unitId: true, tenantId: true } });
  const mkAnn = async (ctx: any, unitId: string, audience: any, tag: string) => {
    const r = await dorm.createDormAnnouncement(ctx, { unitId, title: `ประกาศพีบี ${tag} ${STAMP}`, body: "ซ่อมบำรุงลิฟต์ วันเสาร์ 09:00–12:00 น. ขออภัยในความไม่สะดวก", audience });
    if (!r?.ok) throw new Error(`create ${tag}: ${J(r)}`);
    return r.announcementId as string;
  };
  const tok = (leaseId: string, tenantId = A) => SL.signLink({ tenantId, purpose: "dorm.portal", subjectId: leaseId, expMin: 600 });
  console.log(`\n(ฉาก: ร้าน A ${A} · B ${B} · DA ${DA})`);

  // ═══════════ PB: เผยแพร่ ×20 จาก 4 โพรเซส ═══════════
  console.log("\n── PB เผยแพร่พร้อมกัน ──");
  const ANN = await mkAnn(cO, DA, { kind: "ALL" }, "all");
  {
    const i = { unitId: DA, announcementId: ANN };
    const rs = await procs([0, 1, 2, 3].map(() => Array.from({ length: 5 }, () => ({ m: "dorm" as const, op: "publishDormAnnouncement", args: [cO, i, { now: D(NOW_ISO) }] }))));
    await parkOutbox();
    const ev = await prisma.outboxEvent.count({ where: { tenantId: A, type: EV } });
    const evK = await prisma.outboxEvent.count({ where: { tenantId: A, idempotencyKey: `${EV}:${ANN}` } });
    const au = await prisma.auditLog.count({ where: { tenantId: A, action: EV, targetId: ANN } });
    const nAnn = await prisma.dormAnnouncement.count({ where: { tenantId: A } });
    const row = await prisma.dormAnnouncement.findUnique({ where: { id: ANN }, select: { publishedAt: true } });
    const wins = rs.filter((x) => x?.r?.ok && x.r.published === true).length;
    const loses = rs.filter((x) => x?.r?.ok && x.r.published === false).length;
    const pa = [...new Set(rs.map((x) => x?.r?.publishedAt))];
    rec("PB-1", rs.length === 20 && !badOf(rs).length && wins === 1 && loses === 19 && pa.length === 1 && pa[0] === NOW_ISO && row?.publishedAt?.toISOString() === NOW_ISO && evK === 1 && ev === 1 && au === 1 && nAnn === 1, "CRITICAL",
      "publish ×20 (4 โพรเซส × 5) ⇒ ประกาศ 1 · เผยแพร่ 1 · event 1 · audit 1 · publishedAt เดียว · ไม่มี throw/40P01/BUSY",
      { n: rs.length, tally: tally(rs, (x) => (x?.threw ? "THREW" : x?.r?.ok ? `ok:${x.r.published}` : x?.r?.code ?? "?")), bad: badOf(rs).slice(0, 2), ev, evK, au, nAnn, pa, maxMs: Math.max(...rs.map((x) => x?.ms ?? 0)) });
    const e = await prisma.outboxEvent.findFirst({ where: { tenantId: A, idempotencyKey: `${EV}:${ANN}` }, select: { payload: true, unitId: true } });
    rec("PB-2", isDeepStrictEqual(Object.keys(e?.payload ?? {}).sort(), ["announcementId", "audience", "unitId"]) && e?.payload?.audience === "ALL" && e?.unitId === DA && !NAMES.some((n) => J(e).includes(n)), "MAJOR",
      "payload event = { unitId, announcementId, audience(kind) } ไม่มี PII/เนื้อหา", e);
  }

  // ═══════════ SD: ส่ง ×24 จาก 4 โพรเซส ═══════════
  console.log("\n── SD ส่งพร้อมกัน ──");
  {
    const m0 = PUSH.length;
    const rs = await procs([0, 1, 2, 3].map(() => Array.from({ length: 6 }, () => ({ m: "plat" as const, op: "sendDormAnnouncement", args: [{ tenantId: A }, { announcementId: ANN }, { now: D(NOW_ISO) }] }))));
    await sleep(500);
    const got = pushKeys(m0);
    const logs = await logsOf(ANN);
    const sum = rs.reduce((s, x) => s + (Number(x?.r?.sent) || 0), 0);
    const exp = ["P1", "P2", "P6", "P7"]; // live ในห้อง active · P6 สองห้อง = 1
    rec("SD-1", rs.length === 24 && !badOf(rs).length && isDeepStrictEqual(got, exp) && sum === 4 && logs.length === 4 && logs.every((l: any) => l.status === "SENT" && l.unitId === DA && l.tenantId === A), "CRITICAL",
      "send ×24 (4 โพรเซส × 6) ⇒ ข้อความละ 1 ต่อคน (P1 P2 P6 P7) · P6 (2 ห้อง) = 1 · log 4 แถว · Σsent 4 · ไม่มี throw",
      { got, sum, logs: logs.map((l: any) => [l.dedupeKey.split(":").pop()?.slice(-6), l.status]), tally: tally(rs, (x) => (x?.threw ? "THREW" : `${x?.r?.status}:s${x?.r?.sent}:d${x?.r?.duplicate}`)), bad: badOf(rs).slice(0, 2) });
    const leak = PUSH.slice(m0).filter((p) => ["P3", "P4", "P5", "P8", "PN", "PB"].includes(keyOfTo(p.to)));
    rec("SD-2", leak.length === 0, "CRITICAL", "ไม่มีข้อความถึงสัญญาจบ(P3)/ร่าง(P4)/เลยวันจบ(P5)/ห้องปิด(P8)/หน่วยอื่นบน OA เดียวกัน(PN)/ร้าน B(PB)", leak.map((p) => keyOfTo(p.to)));
    const blob = J(PUSH.slice(m0).map((p) => p.json));
    rec("SD-3", !NAMES.some((n) => blob.includes(n)) && !/(\+?66|0)[689]\d{8}/.test(blob) && /https:\/\/qc-d17pb\.invalid\/d\/[^"]+\/news\?a=/.test(blob), "MAJOR", "ข้อความไม่มีชื่อ/เบอร์ผู้เช่า · มีปุ่มลิงก์ /news?a=", blob.slice(0, 200));
    // คน 2 ห้อง: ลิงก์ = สัญญาห้องเลขน้อยสุด (111 < 201)
    const p6 = PUSH.slice(m0).find((p) => keyOfTo(p.to) === "P6");
    const t6 = /\/d\/([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\/news/.exec(J(p6?.json))?.[1] ?? "";
    rec("SD-4", SL.verifyLink(t6, "dorm.portal")?.subjectId === L["111"], "MINOR", "P6 ได้ลิงก์ของสัญญาตัวแทน (ห้อง 111)", { sub: SL.verifyLink(t6, "dorm.portal")?.subjectId, want: L["111"] });
    // งานส่งซ้ำ 3 โพรเซสพร้อมกันหลังส่งครบ ⇒ 0 ข้อความ
    const m1 = PUSH.length;
    const js = await procs([0, 1, 2].map(() => [{ m: "plat" as const, op: "runDormAnnounceJobs", args: [D(NOW_ISO), { tenantId: A }] }]), 10_000);
    await sleep(300);
    rec("SD-5", !badOf(js).length && PUSH.length === m1 && js.every((x) => x?.r?.resent === 0), "MAJOR", "runDormAnnounceJobs ×3 โพรเซสหลังส่งครบ ⇒ ไม่มีข้อความเพิ่ม", { js: js.map((x) => x?.r ?? x), extra: pushKeys(m1) });
  }

  // ═══════════ RD: อ่าน ×24 จาก 3 โพรเซส ═══════════
  console.log("\n── RD บันทึกอ่าน ──");
  {
    // GET ไม่นับ
    const g = await Promise.all(Array.from({ length: 5 }, () => plat.loadPortalAnnouncements(tok(L["101"]), { a: ANN }, { clientKey: CK("get"), now: NOW })));
    const n0 = await prisma.dormAnnouncementRead.count({ where: { announcementId: ANN } });
    rec("RD-0", g.every((v: any) => v?.detail?.id === ANN) && n0 === 0, "CRITICAL", "load ×5 (GET) ⇒ เห็นรายละเอียด · ไม่นับอ่าน", { n0, d: g.map((v: any) => v?.detail?.id ?? null) });
    // P6 อ่านจาก 2 สัญญา (201 + 111) ×24 จาก 3 โพรเซส
    const jobs = [0, 1, 2].map((p) => Array.from({ length: 8 }, (_, k) => ({ m: "plat" as const, op: "markPortalAnnouncementRead", args: [tok(k % 2 ? L["201"] : L["111"]), { announcementId: ANN }, { clientKey: CK(`rd${p}`), now: D(NOW_ISO) }] })));
    const rs = await procs(jobs);
    const rows = await prisma.dormAnnouncementRead.findMany({ where: { announcementId: ANN }, select: { partyId: true, tenantId: true, unitId: true } });
    const counted = rs.filter((x) => x?.r?.ok && x.r.counted === true).length;
    rec("RD-1", rs.length === 24 && !badOf(rs).length && rows.length === 1 && rows[0].partyId === P.P6 && rows[0].tenantId === A && rows[0].unitId === DA && counted === 1 && rs.every((x) => x?.r?.ok === true), "CRITICAL",
      "markRead ×24 (3 โพรเซส × 8 · คนเดียว 2 สัญญา) ⇒ แถวเดียว · counted:true 1 ราย · ไม่มี throw/P2002",
      { rows, counted, tally: tally(rs, (x) => (x?.threw ? "THREW" : x?.r?.ok ? `ok:${x.r.counted}` : x?.r?.code)), bad: badOf(rs).slice(0, 2) });
    const st = await dorm.dormAnnouncementStats(cO, { unitId: DA, announcementId: ANN }, { now: NOW });
    rec("RD-2", isDeepStrictEqual(st?.stats, { recipients: 4, sent: 4, waiting: 0, noLine: 0, reads: 1 }), "MAJOR", "สถิติ {recipients 4, sent 4, reads 1}", st);
  }

  // ═══════════ LE: สัญญาจบกลางรอบส่ง ═══════════
  console.log("\n── LE สัญญาจบระหว่างส่ง ──");
  {
    const tyM = await ty(A, DM);
    const LM: Record<string, string> = {};
    for (const n of ["501", "502", "503", "504", "505"]) {
      const rid = await room(A, DM, tyM, n, null, null);
      const pid = await mkParty(A, `ผู้เช่าห้องพีบี ${n}`);
      LM[n] = await mkLease({ tenantId: A, unitId: DM, roomId: rid, partyId: pid });
      await mkContact(`M${n}`, A, sysA, OA1, pid);
    }
    const AM = await mkAnn(cO, DM, { kind: "ALL" }, "mid");
    const pp = await dorm.publishDormAnnouncement(cO, { unitId: DM, announcementId: AM }, { now: NOW });
    await parkOutbox();
    pushDelayMs = 1_500; // ตัวจำลองตอบช้า ⇒ รอบส่งเดินทีละคน (เรียงเลขห้อง) — 505 อยู่ท้ายสุด
    let endedAt = 0;
    onPush = (p) => {
      if (endedAt || !keyOfTo(p.to).startsWith("M")) return;
      endedAt = Date.now();
      void prisma.dormLease.update({ where: { id: LM["505"] }, data: { status: "ENDED", endedAt: new Date(), endReason: "MOVE_OUT" } }).then(() => { endedAt = Date.now(); });
    };
    const m0 = PUSH.length;
    const rs = await procs([0, 1].map(() => [{ m: "plat" as const, op: "sendDormAnnouncement", args: [{ tenantId: A }, { announcementId: AM }, { now: D(NOW_ISO) }] }]), 8_000);
    onPush = null;
    pushDelayMs = 0;
    await sleep(500);
    const got = pushKeys(m0);
    const lg = (await logsOf(AM)).map((l: any) => l.status).sort();
    const js = await procs([[{ m: "plat" as const, op: "runDormAnnounceJobs", args: [D(NOW_ISO), { tenantId: A }] }]], 6_000);
    const re = await plat.resendDormAnnouncement(cO, { unitId: DM, announcementId: AM }, { now: NOW });
    await sleep(300);
    const after = pushKeys(m0);
    rec("LE-1", pp?.ok && pp.published && !badOf(rs).length && isDeepStrictEqual(got, ["M501", "M502", "M503", "M504"]) && isDeepStrictEqual(after, got) && lg.filter((s: string) => s === "SENT").length === 4 && lg.includes("SKIPPED_PRECHECK_LEASE_ENDED"), "CRITICAL",
      "สัญญาห้อง 505 จบหลังข้อความแรกออก (ส่ง 2 โพรเซสพร้อมกัน) ⇒ 505 ไม่ได้ข้อความ · log SKIPPED_PRECHECK_LEASE_ENDED · งานส่งซ้ำ/ส่งซ้ำมือ ไม่ส่งตาม",
      { got, after, lg, rs: rs.map((x) => x?.r ?? x), job: js.map((x) => x?.r ?? x), re: re?.ok ? { sent: re.sent, rc: re.recipients } : re });
  }

  // ═══════════ XN: NOT_FOUND ทุกไบต์ ═══════════
  console.log("\n── XN ข้ามร้าน/หน่วย/อาคาร ──");
  {
    const ANB = (await prisma.dormAnnouncement.create({ data: { tenantId: B, unitId: DB, title: "ร้านบี", body: "ร้านบี", audience: "ALL", publishedAt: NOW } })).id as string;
    const ANN_N = await mkAnn(cO, DN, { kind: "ALL" }, "dn");
    await dorm.publishDormAnnouncement(cO, { unitId: DN, announcementId: ANN_N }, { now: NOW });
    const ANN_BB = await mkAnn(cO, DA, { kind: "BUILDING", buildingIds: [BB] }, "bb");
    await dorm.publishDormAnnouncement(cO, { unitId: DA, announcementId: ANN_BB }, { now: NOW });
    const ANN_MIX = await mkAnn(cO, DA, { kind: "ROOM", roomIds: [R["101"], R["111"]] }, "mix");
    const ANN_CARE = await mkAnn(cCare, DA, { kind: "FLOOR", floors: [{ buildingId: BA, floorNo: 1 }] }, "care");
    await parkOutbox();
    const nf = await dorm.publishDormAnnouncement(cO, { unitId: DA, announcementId: "nonexistent-x" }, { now: NOW });
    const ref = J(nf);
    type Case = [string, () => Promise<unknown>];
    const T = "หัวเรื่องพีบี", Bd = "เนื้อหาพีบี";
    const cases: Case[] = [
      ["pub ร้าน B ann", () => dorm.publishDormAnnouncement(cO, { unitId: DA, announcementId: ANB }, { now: NOW })],
      ["pub หน่วย DB ของร้าน B", () => dorm.publishDormAnnouncement(cO, { unitId: DB, announcementId: ANB }, { now: NOW })],
      ["stats ann DN ผ่าน DA", () => dorm.dormAnnouncementStats(cO, { unitId: DA, announcementId: ANN_N }, { now: NOW })],
      ["preview ann DN ผ่าน DA", () => dorm.previewDormAnnouncement(cO, { unitId: DA, announcementId: ANN_N }, { now: NOW })],
      ["care stats ann ALL", () => dorm.dormAnnouncementStats(cCare, { unitId: DA, announcementId: ANN }, { now: NOW })],
      ["care stats ann อาคาร B", () => dorm.dormAnnouncementStats(cCare, { unitId: DA, announcementId: ANN_BB }, { now: NOW })],
      ["care publish ann ห้องผสม", () => dorm.publishDormAnnouncement(cCare, { unitId: DA, announcementId: ANN_MIX }, { now: NOW })],
      ["care update ann ห้องผสม", () => dorm.updateDormAnnouncement(cCare, { unitId: DA, announcementId: ANN_MIX, title: T, body: Bd, audience: { kind: "ROOM", roomIds: [R["101"]] } })],
      ["care create อาคาร B", () => dorm.createDormAnnouncement(cCare, { unitId: DA, title: T, body: Bd, audience: { kind: "BUILDING", buildingIds: [BB] } })],
      ["care create ชั้นอาคาร B", () => dorm.createDormAnnouncement(cCare, { unitId: DA, title: T, body: Bd, audience: { kind: "FLOOR", floors: [{ buildingId: BB, floorNo: 1 }] } })],
      ["care create ห้อง 111", () => dorm.createDormAnnouncement(cCare, { unitId: DA, title: T, body: Bd, audience: { kind: "ROOM", roomIds: [R["111"]] } })],
      ["own create ห้องร้าน B", () => dorm.createDormAnnouncement(cO, { unitId: DA, title: T, body: Bd, audience: { kind: "ROOM", roomIds: [R.B1] } })],
      ["own create ห้องหน่วย DN", () => dorm.createDormAnnouncement(cO, { unitId: DA, title: T, body: Bd, audience: { kind: "ROOM", roomIds: [R.N1] } })],
      ["own create อาคารร้าน B", () => dorm.createDormAnnouncement(cO, { unitId: DA, title: T, body: Bd, audience: { kind: "BUILDING", buildingIds: [BX] } })],
      ["own create อาคาร DN", () => dorm.createDormAnnouncement(cO, { unitId: DA, title: T, body: Bd, audience: { kind: "FLOOR", floors: [{ buildingId: BN, floorNo: 1 }] } })],
      ["ownB stats ann ร้าน A", () => dorm.dormAnnouncementStats(cOB, { unitId: DA, announcementId: ANN }, { now: NOW })],
      ["ownB create หน่วยร้าน A", () => dorm.createDormAnnouncement(cOB, { unitId: DA, title: T, body: Bd, audience: { kind: "ALL" } })],
      ["resend care ann ALL", () => plat.resendDormAnnouncement(cCare, { unitId: DA, announcementId: ANN }, { now: NOW })],
      ["resend care ann อาคาร B", () => plat.resendDormAnnouncement(cCare, { unitId: DA, announcementId: ANN_BB }, { now: NOW })],
      ["resend ownB ann A", () => plat.resendDormAnnouncement(cOB, { unitId: DA, announcementId: ANN }, { now: NOW })],
      ["resend own ann B", () => plat.resendDormAnnouncement(cO, { unitId: DA, announcementId: ANB }, { now: NOW })],
    ];
    const n0 = await prisma.dormAnnouncement.count({ where: { tenantId: { in: tenantIds } } });
    const out: Record<string, string> = {};
    for (const [k, f] of cases) { try { out[k] = J(await f()); } catch (e) { out[k] = `THREW ${errMsg(e)}`; } }
    const diff = Object.entries(out).filter(([, v]) => v !== ref);
    const n1 = await prisma.dormAnnouncement.count({ where: { tenantId: { in: tenantIds } } });
    rec("XN-1", nf?.ok === false && nf.code === "NOT_FOUND" && !diff.length && n0 === n1, "CRITICAL", `ฝั่งพนักงาน ${cases.length} กรณีข้ามร้าน/หน่วย/อาคาร ⇒ NOT_FOUND เดียวกันทุกไบต์ (รวม resend) · ไม่มีแถวใหม่`, { ref, diff: diff.slice(0, 4), n0, n1 });
    // ข้ามโพรเซส: ผลจากโพรเซสลูกก็ตรงทุกไบต์
    const kid = await procs([[
      { m: "dorm", op: "dormAnnouncementStats", args: [cCare, { unitId: DA, announcementId: ANN_BB }, { now: D(NOW_ISO) }] },
      { m: "plat", op: "resendDormAnnouncement", args: [cOB, { unitId: DA, announcementId: ANN }, { now: D(NOW_ISO) }] },
      { m: "dorm", op: "publishDormAnnouncement", args: [cO, { unitId: DA, announcementId: ANB }, { now: D(NOW_ISO) }] },
    ]], 6_000);
    rec("XN-2", kid.every((x) => J(x?.r) === ref), "MAJOR", "NOT_FOUND จากโพรเซสลูกตรงทุกไบต์", kid.map((x) => x?.r ?? x));
    // care model: ไม่มี ALL/อาคาร B/ห้องผสม · มีของตัวเอง · options เฉพาะอาคาร A
    const mdl = await dorm.dormAnnounceModel(cCare, { unitId: DA }, { now: NOW });
    const ids = (mdl?.items ?? []).map((x: any) => x.id);
    const optRooms = (mdl?.options?.rooms ?? []).map((r: any) => r.number).sort();
    rec("XN-3", mdl && mdl.canAll === false && isDeepStrictEqual(ids, [ANN_CARE]) && isDeepStrictEqual(optRooms, ["101", "102", "103", "104", "105", "201"]) && isDeepStrictEqual((mdl.options.buildings ?? []).map((b: any) => b.id), [BA]) && (mdl.options.floors ?? []).every((f: any) => f.buildingId === BA), "CRITICAL",
      "ผู้ดูแลอาคาร A: เห็นเฉพาะประกาศที่เป้าหมายอยู่ในอาคาร A ทั้งหมด · ตัวเลือกเฉพาะอาคาร A · ไม่มี ALL", { canAll: mdl?.canAll, ids, want: [ANN_CARE], optRooms, b: mdl?.options?.buildings });
    // พอร์ทัล: token L101 + ประกาศที่ไม่เห็น ⇒ NOT_FOUND เดียวกัน
    const pc: [string, () => Promise<unknown>][] = [
      ["ann ร้าน B", () => plat.markPortalAnnouncementRead(tok(L["101"]), { announcementId: ANB }, { clientKey: CK("x1"), now: NOW })],
      ["ann หน่วย DN", () => plat.markPortalAnnouncementRead(tok(L["101"]), { announcementId: ANN_N }, { clientKey: CK("x1"), now: NOW })],
      ["ann อาคาร B (101 อยู่ A)", () => plat.markPortalAnnouncementRead(tok(L["101"]), { announcementId: ANN_BB }, { clientKey: CK("x1"), now: NOW })],
      ["ann ร่าง", () => plat.markPortalAnnouncementRead(tok(L["101"]), { announcementId: ANN_MIX }, { clientKey: CK("x1"), now: NOW })],
      ["id ขยะ", () => plat.markPortalAnnouncementRead(tok(L["101"]), { announcementId: "'; DROP--" }, { clientKey: CK("x1"), now: NOW })],
      ["token สัญญาจบ", () => plat.markPortalAnnouncementRead(tok(L["103"]), { announcementId: ANN }, { clientKey: CK("x1"), now: NOW })],
      ["token ร้านปลอม", () => plat.markPortalAnnouncementRead(tok(L["101"], B), { announcementId: ANN }, { clientKey: CK("x1"), now: NOW })],
      ["token ขยะ", () => plat.markPortalAnnouncementRead("abc.def", { announcementId: ANN }, { clientKey: CK("x1"), now: NOW })],
      ["token B → ann A", () => plat.markPortalAnnouncementRead(tok(L.B1, B), { announcementId: ANN }, { clientKey: CK("x1"), now: NOW })],
    ];
    const pref = J({ ok: false, code: "NOT_FOUND" });
    const po: Record<string, string> = {};
    for (const [k, f] of pc) po[k] = J(await f());
    const pd = Object.entries(po).filter(([, v]) => v !== pref);
    const lv = await Promise.all([ANB, ANN_N, ANN_BB, ANN_MIX].map((a) => plat.loadPortalAnnouncements(tok(L["101"]), { a }, { clientKey: CK("x2"), now: NOW })));
    const rd = await prisma.dormAnnouncementRead.count({ where: { announcementId: { in: [ANB, ANN_N, ANN_BB, ANN_MIX] } } });
    rec("XN-4", !pd.length && lv.every((v: any) => v === null) && rd === 0, "CRITICAL", "พอร์ทัล: ประกาศร้าน/หน่วย/อาคารอื่น · ร่าง · token จบ/ปลอม ⇒ {ok:false,code:NOT_FOUND} ทุกไบต์ · load ⇒ null · ไม่มีแถวอ่าน", { pd, lv: lv.map((v: any) => (v ? "VIEW" : null)), rd });
  }

  // ═══════════ BZ: 40P01 บังคับจากฐาน ═══════════
  console.log("\n── BZ 40P01 ──");
  {
    // trigger BEFORE UPDATE บน DormAnnouncement: แถวของ probe ที่ id อยู่ใน cfg ⇒ RAISE 40P01 ตราบที่ nextval(seq) ≤ cfg.n (sequence ไม่ย้อนตาม rollback)
    await prisma.$executeRawUnsafe(`CREATE SEQUENCE probe_d17_trap_seq`);
    await prisma.$executeRawUnsafe(`CREATE TABLE probe_d17_trap_cfg (id text PRIMARY KEY, n int NOT NULL, msg text NOT NULL)`);
    await prisma.$executeRawUnsafe(`CREATE FUNCTION probe_d17_trap_fn() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE c record;
      BEGIN
        SELECT * INTO c FROM probe_d17_trap_cfg WHERE id = OLD."id";
        IF FOUND AND OLD."tenantId" = '${A}' AND nextval('probe_d17_trap_seq') <= c.n THEN
          RAISE EXCEPTION '%', c.msg USING ERRCODE = '40P01';
        END IF;
        RETURN NEW;
      END $$`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER probe_d17_trap BEFORE UPDATE ON "DormAnnouncement" FOR EACH ROW EXECUTE FUNCTION probe_d17_trap_fn()`);
    const arm = async (id: string, n: number, msg = "deadlock detected") => {
      await prisma.$executeRawUnsafe(`DELETE FROM probe_d17_trap_cfg`);
      await prisma.$executeRawUnsafe(`SELECT setval('probe_d17_trap_seq', 1, false)`);
      await prisma.$executeRawUnsafe(`INSERT INTO probe_d17_trap_cfg (id, n, msg) VALUES ($1, $2, $3)`, id, n, msg);
    };
    const seqNow = async () => Number((await prisma.$queryRawUnsafe(`SELECT last_value, is_called FROM probe_d17_trap_seq`))[0]?.last_value ?? 0);
    const evOf = (id: string) => prisma.outboxEvent.count({ where: { tenantId: A, idempotencyKey: `${EV}:${id}` } });
    // BZ-1: 40P01 ครั้งเดียว ⇒ ลองใหม่สำเร็จ
    const A1 = await mkAnn(cO, DA, { kind: "ROOM", roomIds: [R["101"]] }, "bz1");
    await arm(A1, 1);
    const r1 = await procs([[{ m: "dorm", op: "publishDormAnnouncement", args: [cO, { unitId: DA, announcementId: A1 }, { now: D(NOW_ISO) }] }]], 5_000);
    const s1 = await seqNow();
    rec("BZ-1", r1[0]?.r?.ok === true && r1[0].r.published === true && (await evOf(A1)) === 1 && s1 >= 2, "MAJOR", "40P01 ครั้งแรก ⇒ ลองใหม่ 1 ครั้ง สำเร็จ · event 1", { r: r1[0], seq: s1, ev: await evOf(A1) });
    // BZ-2: 40P01 ทุกครั้ง ⇒ ลองใหม่ 1 ครั้ง (2 ครั้งรวม) แล้ว BUSY · ไม่เผยแพร่ · ไม่มี event
    const A2 = await mkAnn(cO, DA, { kind: "ROOM", roomIds: [R["101"]] }, "bz2");
    await arm(A2, 99);
    const r2 = await procs([[{ m: "dorm", op: "publishDormAnnouncement", args: [cO, { unitId: DA, announcementId: A2 }, { now: D(NOW_ISO) }] }]], 5_000);
    const s2 = await seqNow();
    const row2 = await prisma.dormAnnouncement.findUnique({ where: { id: A2 }, select: { publishedAt: true } });
    rec("BZ-2", r2[0]?.r?.ok === false && r2[0].r.code === "BUSY" && /[฀-๿]/.test(r2[0].r.reason ?? "") && s2 === 2 && row2?.publishedAt === null && (await evOf(A2)) === 0, "MAJOR",
      "40P01 ทุกครั้ง ⇒ พยายามรวม 2 ครั้งพอดี แล้ว BUSY (เหตุผลไทย) · publishedAt ว่าง · event 0", { r: r2[0], attempts: s2, row2, ev: await evOf(A2) });
    // BZ-3: หลัง BUSY ปลดกับดัก แล้ว publish ×8 จาก 2 โพรเซส ⇒ 1
    await prisma.$executeRawUnsafe(`DELETE FROM probe_d17_trap_cfg`);
    const r3 = await procs([0, 1].map(() => Array.from({ length: 4 }, () => ({ m: "dorm" as const, op: "publishDormAnnouncement", args: [cO, { unitId: DA, announcementId: A2 }, { now: D(NOW_ISO) }] }))), 8_000);
    rec("BZ-3", !badOf(r3).length && r3.filter((x) => x?.r?.published === true).length === 1 && (await evOf(A2)) === 1, "MAJOR", "หลัง BUSY เผยแพร่ใหม่ ×8 (2 โพรเซส) ⇒ 1 · event 1", tally(r3, (x) => (x?.r?.ok ? `ok:${x.r.published}` : x?.r?.code ?? "THREW")));
    // BZ-4: 40P01 ที่ข้อความไม่มีคำว่า deadlock (ตรวจจากรหัสอย่างเดียว) — ข้อมูลประกอบ
    const A4 = await mkAnn(cO, DA, { kind: "ROOM", roomIds: [R["101"]] }, "bz4");
    await arm(A4, 99, "probe forced");
    const r4 = await procs([[{ m: "dorm", op: "publishDormAnnouncement", args: [cO, { unitId: DA, announcementId: A4 }, { now: D(NOW_ISO) }] }]], 5_000);
    rec("BZ-4", r4[0]?.r?.code === "BUSY" && (await seqNow()) === 2, "MINOR", "40P01 ตรวจจากรหัส (ข้อความกลาง) ⇒ ยัง BUSY หลังลอง 2 ครั้ง (ไม่ throw ถึงผู้เรียก)", { r: r4[0], attempts: await seqNow() });
    await dropTrap();
  }

  // ═══════════ JB: งานส่งซ้ำ ═══════════
  console.log("\n── JB งานส่งซ้ำ (ขอบเขต) ──");
  {
    // JB-1: ประกาศของหน่วยแม่แบบหลุด (มีคำต้องห้ามในแม่แบบ) ⇒ ทุกรอบงาน = TEMPLATE_BLOCKED + audit ใหม่
    const tv = { th: "ประกาศ {title} — ห้องค้างชำระจะถูกตัด" + "ไฟ\n{body}" };
    await setVal(A, "rooms.msg.announcement", DT, tv);
    const tyT = await ty(A, DT);
    const rt = await room(A, DT, tyT, "601", null, null);
    const pt = await mkParty(A, "ผู้เช่าแม่แบบพีบี");
    await mkLease({ tenantId: A, unitId: DT, roomId: rt, partyId: pt });
    await mkContact("T601", A, sysA, OA1, pt);
    const AT1 = await mkAnn(cO, DT, { kind: "ALL" }, "tpl");
    const pT = await dorm.publishDormAnnouncement(cO, { unitId: DT, announcementId: AT1 }, { now: NOW });
    await parkOutbox();
    const m0 = PUSH.length;
    const runs = [];
    for (let k = 0; k < 3; k++) runs.push(await plat.runDormAnnounceJobs(new Date(NOW.getTime() + k * 300_000), { tenantId: A }));
    const au = await prisma.auditLog.count({ where: { tenantId: A, action: "dorm.announcement.blocked", targetId: AT1 } });
    const lgT = await logsOf(AT1);
    rec("JB-1", !pushKeys(m0).includes("T601") && lgT.length === 0, "CRITICAL", "แม่แบบหลุด (มีคำต้องห้าม) ⇒ T601 ไม่ได้ข้อความ · ไม่มีแถว log ของประกาศนี้ (ข้อความอื่นในรอบ = ประกาศอื่นที่ยังไม่เคยส่ง)", { pT: pT?.ok ? pT.published : pT, pushes: pushKeys(m0), logs: lgT.length });
    rec("JB-2", au <= 1, "MINOR", "งานส่งซ้ำ 3 รอบบนประกาศที่ถูกบล็อก ⇒ audit dorm.announcement.blocked ไม่ซ้ำทุกรอบ (ไม่งั้น ~864 แถว/ประกาศใน 3 วัน)", { audit: au, runs });
    // JB-3: ความอดอยาก — 200 ประกาศ LINE ปิด (DZ · ไม่มีแถว log ตลอดไป) เผยแพร่ก่อน · ประกาศจริงที่รอพ้นเวลาเงียบ (DQ) ⇒ งานส่งซ้ำยังต้องถึง
    const tyQ = await ty(A, DQ);
    const rq = await room(A, DQ, tyQ, "701", null, null);
    const pq = await mkParty(A, "ผู้เช่าเวลาเงียบพีบี");
    await mkLease({ tenantId: A, unitId: DQ, roomId: rq, partyId: pq });
    await mkContact("Q701", A, sysA, OA1, pq);
    const QUIET = new Date("2026-11-03T15:30:00.000Z"), WAKE = new Date("2026-11-04T01:05:00.000Z");
    const z0 = new Date(QUIET.getTime() - 3_600_000);
    await prisma.dormAnnouncement.createMany({ data: Array.from({ length: 200 }, (_, k) => ({ tenantId: A, unitId: DZ, title: `ซอมบี้ ${k}`, body: "ซอมบี้", audience: "ALL", publishedAt: new Date(z0.getTime() + k * 1000) })) });
    const AQ = await mkAnn(cO, DQ, { kind: "ALL" }, "quiet");
    await dorm.publishDormAnnouncement(cO, { unitId: DQ, announcementId: AQ }, { now: QUIET });
    await parkOutbox();
    const sq = await plat.sendDormAnnouncement({ tenantId: A }, { announcementId: AQ }, { now: QUIET });
    const m1 = PUSH.length;
    const t0 = Date.now();
    const jr = await plat.runDormAnnounceJobs(WAKE, { tenantId: A });
    const ms = Date.now() - t0;
    await sleep(300);
    rec("JB-3", sq?.quiet === 1 && pushKeys(m1).includes("Q701"), "MAJOR", "200 ประกาศ LINE ปิด (ไม่มีแถว log) เผยแพร่ก่อน ⇒ ประกาศที่รอพ้นเวลาเงียบยังถูกส่งซ้ำ (ไม่อดอยากจาก LIMIT 200 เรียงเก่าก่อน)", { sq, jr, got: pushKeys(m1), ms });
  }
} catch (e) {
  console.error(`🔴 probe พัง: ${errMsg(e)}`);
  rec("PROBE", false, "CRITICAL", "probe ทำงานไม่จบ", errMsg(e));
  exitCode = 1;
} finally {
  try { await dropTrap(); } catch { /* */ }
  try { await cleanup(tenantIds); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); }
  try { await prisma.user.deleteMany({ where: { email: { startsWith: "svc-d17pb-" } } }); } catch { /* */ }
  try { await prisma.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE key LIKE $1`, `%pb-d17-${STAMP}%`); } catch { /* */ }
  const left = await prisma.tenant.count({ where: { slug: { startsWith: "qc-svc-d17pb-" } } }).catch(() => -1);
  const trap = await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM pg_trigger WHERE tgname = 'probe_d17_trap'`).catch(() => [{ n: -1 }]);
  rec("Z-1", left === 0 && trap[0]?.n === 0, "MINOR", "ล้างร้าน/trigger ของ probe หมด", { left, trap: trap[0]?.n });
  rec("M-1", BLOCKED.length === 0, "MINOR", "ไม่มีคำขอออกนอกเครื่องจากโพรเซสหลัก", BLOCKED.slice(0, 5));
  server.close();
  try { await prisma.$disconnect(); } catch { /* */ }
}
const breaches = results.filter((r) => !r.ok);
console.log(`\nPROBE_SUMMARY ${J({ total: results.length, hold: results.length - breaches.length, breach: breaches.map((b) => `${b.id}(${b.sev})`) })}`);
process.exit(exitCode);
