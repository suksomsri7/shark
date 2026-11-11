// PROBE — SVC D.16 reviewer B (X1 ขอบเขต · X3/X4 ครั้งเดียวหลายโพรเซส · X7 ลิงก์สาธารณะ · X10 รูปส่วนตัว · อดอยาก · 40P01) · ไม่ใช่ข้อสอบ · ไม่แก้ src
// รัน: bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/probe-d16-b.mts
// ข้อมูลใต้ร้าน `qc-svc-d16pb-*` + ผู้ใช้ `svc-d16pb-*@shark.local` · ไม่ยิง LINE จริง (ตัวจำลอง 127.0.0.1 + LINE_API_BASE) · ล้างใน finally
// หมวด: SB แจ้งพร้อมกัน · KC การ์ด consumer∥กวาด · KD การ์ดเสร็จ/เปิดซ้ำ · TC ช่างกดเสร็จ · EL สัญญาจบ · TK token/rate · XS ขอบเขต · FX รูปส่วนตัว · JB อดอยาก · DL 40P01
/* eslint-disable @typescript-eslint/no-explicit-any */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";

const SELF = fileURLToPath(import.meta.url);
const ROOT = join(dirname(SELF), "..");
loadSvcQcEnv("probe-d16-b");
if (process.env.CI || process.env.APP_ENV === "production") { console.error("🔴 probe: env ต้องห้าม"); process.exit(4); }
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 260);
const J = (x: unknown) => { try { return JSON.stringify(x); } catch { return String(x); } };
const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const pngB = (seed: string) => Uint8Array.from(Buffer.concat([Buffer.from(PNG_SIG), createHash("sha256").update(`pb16:${seed}`).digest()]));
const png = (seed: string) => ({ data: pngB(seed), contentType: "image/png" });
const noopDeps = { put: async () => {}, del: async () => 200 };
const b64 = (u: Uint8Array) => Buffer.from(u).toString("base64");
const unb64 = (s: string) => Uint8Array.from(Buffer.from(s, "base64"));
process.env.APP_URL = "https://qc-d16pb.invalid";

// ═══════════ โหมดลูก ═══════════
{
  const ix = process.argv.indexOf("--child");
  if (ix >= 0) {
    let out: unknown[] = [];
    try {
      const job = JSON.parse(Buffer.from(process.argv[ix + 1] ?? "", "base64url").toString("utf8")) as { op: string; items: any[]; at: number };
      if (process.env.LINE_API_BASE) {
        const RF = globalThis.fetch;
        globalThis.fetch = (async (input: any, init?: any) => {
          const url = typeof input === "string" ? input : input instanceof URL ? input.href : String(input?.url ?? "");
          let host = ""; try { host = new URL(url).hostname; } catch { /* */ }
          if (host === "127.0.0.1" || host === "localhost" || host.endsWith(".neon.tech")) return RF(input, init);
          return new Response("{}", { status: 503 });
        }) as typeof fetch;
      }
      const D = (await import("@/lib/modules/dorm" as string)) as any;
      const fileIn = (f: any) => ({ data: unb64(f.data), contentType: f.contentType });
      const one = async (x: any) => {
        if (job.op === "submit") return D.submitPortalRepair(x.token, { ...x.input, photos: (x.input.photos ?? []).map(fileIn) }, { clientKey: x.clientKey, now: new Date(x.now), deps: noopDeps });
        if (job.op === "complete") return D.completeDormRepair(x.ctx, { ...x.input, ...(x.input.afterPhotos ? { afterPhotos: x.input.afterPhotos.map(fileIn) } : {}) }, { now: new Date(x.now), deps: noopDeps });
        if (job.op === "consume") { await (await import("@/lib/outbox-consumers" as string)).consumers[x.type](x.evt); return { ok: true }; }
        if (job.op === "sweep") return (await import("@/lib/platform/kanban-bridges" as string)).sweepDormRepairCards(new Date(x.now), { tenantId: x.tenantId, budgetMs: 90_000 });
        if (job.op === "jobs") return D.runDormRepairJobs(new Date(x.now), { tenantId: x.tenantId, budgetMs: 90_000 });
        return { childFail: `op ${job.op}` };
      };
      const w = job.at - Date.now();
      if (w > 0) await new Promise((r) => setTimeout(r, w));
      out = await Promise.all(job.items.map(async (x) => { try { return await one(x); } catch (e) { return { threw: errMsg(e) }; } }));
    } catch (e) { out = [{ childFail: errMsg(e) }]; }
    console.log(`CHILD_RESULT ${JSON.stringify(out)}`);
    try { const { prisma } = (await import("@/lib/core/db" as string)) as any; await prisma.$disconnect(); } catch { /* */ }
    process.exit(0);
  }
}

// ═══════════ ตัวจำลอง LINE + กันออกนอกเครื่อง ═══════════
type FakeReq = { method: string; path: string; json: any };
const FAKE: FakeReq[] = [];
const server = createServer((req, res) => {
  const ch: Buffer[] = [];
  req.on("data", (c: Buffer) => ch.push(c));
  req.on("end", () => {
    let json: any = null;
    try { json = JSON.parse(Buffer.concat(ch).toString("utf8")); } catch { /* */ }
    const path = (req.url ?? "").split("?")[0] ?? "";
    FAKE.push({ method: req.method ?? "", path, json });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(path.includes("/push") ? { sentMessages: [{ id: `m${FAKE.length}` }] } : path.includes("/profile/") ? { displayName: "x", userId: "x" } : {}));
  });
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
process.env.LINE_API_BASE = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const REAL_FETCH = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : String(input?.url ?? "");
  let host = ""; try { host = new URL(url).hostname; } catch { /* */ }
  if (host === "127.0.0.1" || host === "localhost" || host.endsWith(".neon.tech")) return REAL_FETCH(input, init);
  return new Response("{}", { status: 503 });
}) as typeof fetch;
const allPushes = (m = 0) => FAKE.slice(m).filter((r) => r.method === "POST" && r.path === "/v2/bot/message/push");
const pushesTo = (ext: string, m = 0) => allPushes(m).filter((r) => r.json?.to === ext);

// ═══════════ ตัวช่วยผล ═══════════
type R = { id: string; ok: boolean; sev: string; what: string; detail: string };
const results: R[] = [];
const rec = (id: string, ok: boolean, sev: string, what: string, detail: unknown) => {
  const d = typeof detail === "string" ? detail : J(detail);
  results.push({ id, ok, sev, what, detail: d });
  console.log(`  ${ok ? "✅ HOLD" : "❌ BREACH"} [${id}] (${sev}) ${what} — ${d.slice(0, 1600)}`);
};
const BADRX = /P2028|P2024|P2002|P2034|P2010|40P01|Unique constraint|timed out|Transaction already closed/i;
const badOf = (rs: any[]) => rs.filter((x) => x?.threw || x?.childFail || BADRX.test(J(x)));
const codeOf = (x: any) => (x?.threw ? "THREW" : x?.childFail ? "CHILD" : x === null ? "null" : x === undefined ? "undef" : x?.ok === true ? (x.replayed ? "OK_REPLAY" : "OK") : x?.code ?? J(x).slice(0, 40));
const tally = (rs: any[]) => { const t: Record<string, number> = {}; for (const x of rs) t[codeOf(x)] = (t[codeOf(x)] ?? 0) + 1; return t; };
async function fanout(op: string, groups: any[][], leadMs = 15_000): Promise<any[]> {
  const at = Date.now() + leadMs;
  const outs = await Promise.all(groups.map((items) => new Promise<any[]>((resolve) => {
    const child = spawn(process.execPath, [...process.execArgv, SELF, "--child", Buffer.from(JSON.stringify({ op, items, at })).toString("base64url")], { cwd: ROOT, env: process.env });
    let buf = "";
    child.stdout.on("data", (d) => { buf += String(d); });
    child.stderr.on("data", (d) => { buf += String(d); });
    child.on("close", (code) => {
      const m = /CHILD_RESULT (\[.*\])/.exec(buf);
      try { resolve(m ? JSON.parse(m[1]) : items.map(() => ({ childFail: `exit=${code} ${buf.split("\n").slice(-3).join(" | ").slice(0, 200)}` }))); } catch { resolve(items.map(() => ({ childFail: "parse" }))); }
    });
  })));
  return outs.flat();
}
/** รอถึงเวลา at แล้วยิงในโพรเซสนี้พร้อมกัน (ผสมกับลูก) */
async function inProcAt(at: number, fns: (() => Promise<unknown>)[]): Promise<any[]> {
  const w = at - Date.now();
  if (w > 0) await new Promise((r) => setTimeout(r, w));
  return Promise.all(fns.map(async (f) => { try { return await f(); } catch (e) { return { threw: errMsg(e) }; } }));
}

const { prisma } = (await import("@/lib/core/db" as string)) as { prisma: any };
const dorm: any = await import("@/lib/modules/dorm" as string);
const OC: any = await import("@/lib/outbox-consumers" as string);
const BR: any = await import("@/lib/platform/kanban-bridges" as string);
const KM: any = await import("@/lib/modules/kanban/moves" as string);
const KL: any = await import("@/lib/modules/kanban/links" as string);
const SL: any = await import("@/lib/core/signed-link" as string);
const STO: any = await import("@/lib/storage/service" as string);
const PRISMA_NS: any = (await import("@prisma/client" as string)).Prisma;

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
const SQLS = STAMP.replace(/[^a-z0-9]/g, "");
const K = (k: string) => `pb16${STAMP}${k}`.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80);
const tenantIds: string[] = [];
let dlInstalled = false;
const dbDate = (ymd: string) => new Date(`${ymd}T00:00:00Z`);
const nowIso = () => new Date().toISOString();
let exitCode = 0;
try {
  const stale = await prisma.tenant.findMany({ where: { slug: { startsWith: "qc-svc-d16pb-" } }, select: { id: true } });
  if (stale.length) await cleanup(stale.map((t: { id: string }) => t.id));
  await prisma.user.deleteMany({ where: { email: { startsWith: "svc-d16pb-" } } });

  // ═══════════ fixtures ═══════════
  const mkTenant = async (tag: string) => { const t = await prisma.tenant.create({ data: { name: `PB D16 ${tag}`, slug: `qc-svc-d16pb-${tag}-${STAMP}` } }); tenantIds.push(t.id); return t.id as string; };
  const A = await mkTenant("a"), B = await mkTenant("b");
  const mkUnit = async (tenantId: string, tag: string, type = "DORM") => (await prisma.businessUnit.create({ data: { tenantId, type, name: `หอ PB16 ${tag}`, slug: `pb16${tag}-${STAMP}` } })).id as string;
  const DA = await mkUnit(A, "a"), DZ = await mkUnit(A, "z"), DB = await mkUnit(B, "b"), NU = await mkUnit(A, "n", "SHOP");
  const mem: Record<string, string> = {};
  const mkUser = async (key: string, tenantId: string, role: string, unitAccess: string[], perms: string[] = []) => {
    const u = await prisma.user.create({ data: { email: `svc-d16pb-${STAMP}-${key}@shark.local`, name: `PB16 ${key}` } });
    const m = await prisma.membership.create({ data: { userId: u.id, tenantId, role, unitAccess, permissions: Object.fromEntries(perms.map((p) => [p, true])), acceptedAt: new Date() } });
    mem[key] = m.id;
    return u.id as string;
  };
  const setVal = async (tenantId: string, key: string, scopeId: string, value: unknown) => {
    await prisma.settingValue.deleteMany({ where: { tenantId, key, scope: "UNIT", scopeId } });
    await prisma.settingValue.create({ data: { tenantId, key, scope: "UNIT", scopeId, value: value === null ? PRISMA_NS.JsonNull : value, setById: "pb-d16" } });
  };
  const ty = async (t: string, u: string) => (await prisma.hotelRoomType.create({ data: { tenantId: t, unitId: u, name: "มาตรฐาน", capacity: 2, baseRateSatang: 450_000, depositSatang: 0, rentMode: "MONTHLY", areaSqm: 24 } })).id as string;
  const bld = async (t: string, u: string, name: string, s: number) => (await prisma.roomBuilding.create({ data: { tenantId: t, unitId: u, name, floors: 3, sortOrder: s } })).id as string;
  const RM: Record<string, string> = {};
  const room = async (t: string, u: string, tyId: string, b: string, n: string) => (await prisma.hotelRoom.create({ data: { tenantId: t, unitId: u, roomTypeId: tyId, number: n, buildingId: b, floorNo: 1, floor: "1" } })).id as string;
  const tyA = await ty(A, DA), tyZ = await ty(A, DZ), tyB = await ty(B, DB);
  const B1 = await bld(A, DA, "อาคาร หนึ่ง", 1), B2 = await bld(A, DA, "อาคาร สอง", 2), BZ = await bld(A, DZ, "อาคาร แซด", 1), BB = await bld(B, DB, "อาคาร บี", 1);
  for (const n of ["101", "102", "103", "104", "105", "106"]) RM[n] = await room(A, DA, tyA, B1, n);
  RM["201"] = await room(A, DA, tyA, B2, "201");
  RM.z101 = await room(A, DZ, tyZ, BZ, "101");
  RM.b101 = await room(B, DB, tyB, BB, "101");
  const OWN = await mkUser("own", A, "OWNER", ["*"]);
  const TK = await mkUser("tk", A, "STAFF", [DA, DZ], ["dorm.view", "dorm.repair.manage"]);
  const TK2 = await mkUser("tk2", A, "STAFF", [DA], ["dorm.view", "dorm.repair.manage"]);
  const VW = await mkUser("vw", A, "STAFF", [DA], ["dorm.view"]);
  const OWNB = await mkUser("ownb", B, "OWNER", ["*"]);
  const cats = (board: string) => [["ELECTRIC", "ไฟฟ้า"], ["PLUMBING", "ประปา"], ["OTHER", "อื่น ๆ"]].map(([code, labelTh]) => ({ code, labelTh, board }));
  for (const [t, u] of [[A, DA], [A, DZ], [B, DB]] as const) {
    await setVal(t, "messaging.quietHours", u, null);
    await setVal(t, "messaging.channelOrder", u, ["LINE", "WEB_LINK"]);
  }
  await setVal(A, "rooms.access.managerScope", DA, "BUILDING");
  await setVal(A, "rooms.access.buildingAssignments", DA, { [mem.tk]: [B1], [mem.tk2]: [B1, B2], [mem.vw]: [B1] });
  await setVal(A, "rooms.repair.categories", DA, cats("ซ่อมหอ"));
  await setVal(A, "rooms.repair.categories", DZ, cats("บอร์ดที่ไม่มีจริง"));
  await setVal(B, "rooms.repair.categories", DB, cats("ซ่อมหอ"));
  const sysA = (await prisma.appSystem.create({ data: { tenantId: A, type: "CHAT", name: `pb16-chat-${STAMP}` } })).id;
  const sysB = (await prisma.appSystem.create({ data: { tenantId: B, type: "CHAT", name: `pb16-chat-b-${STAMP}` } })).id;
  const RAND = randomBytes(3).toString("hex");
  const mkConn = async (t: string, sys: string, tag: string) => (await prisma.chatChannelConnection.create({ data: { tenantId: t, systemId: sys, type: "LINE", displayName: `pb16-${tag}-${STAMP}`, externalAccountId: `pb16-${tag}-${STAMP}`, credentials: { channelAccessToken: `pb16tok${tag}${RAND}`, channelSecret: `pb16sec${tag}${RAND}` }, meta: { basicId: `@pb16${tag}` } } })).id as string;
  const OA1 = await mkConn(A, sysA, "a1"), OAB = await mkConn(B, sysB, "b");
  await setVal(A, "messaging.lineConnectionId", DA, OA1);
  await setVal(A, "messaging.lineConnectionId", DZ, OA1);
  await setVal(B, "messaging.lineConnectionId", DB, OAB);
  const NAMES: string[] = [], PHONES: string[] = [];
  const mkParty = async (t: string, name: string) => { const ph = `08${String(10_000_000 + Math.floor(Math.random() * 89_999_999))}`; NAMES.push(name); PHONES.push(ph); return (await prisma.party.create({ data: { tenantId: t, name, phone: ph } })).id as string; };
  const mkLease = async (t: string, u: string, roomId: string, partyId: string, status = "ACTIVE") => (await prisma.dormLease.create({ data: {
    tenantId: t, unitId: u, roomId, partyId, status, startDate: dbDate("2026-01-01"), endDate: dbDate("2027-12-31"), rentSatang: 450_000, commonFeeSatang: 0, depositSatang: 0, advanceRentSatang: 0, bookingFeeSatang: 0, signedAt: new Date(), createdById: "pb-d16",
    ...(status === "ENDED" ? { endedAt: new Date("2026-08-31T10:00:00Z"), endReason: "MOVE_OUT" } : {}) } })).id as string;
  const P: Record<string, string> = {}, L: Record<string, string> = {};
  for (const [k, n] of [["1", "ปรีชา ซ่อมหนึ่ง"], ["2", "กมลา ซ่อมสอง"], ["3", "สุรชัย ออกแล้ว"], ["4", "นภา ซ่อมสี่"], ["5", "ชาตรี จะออก"], ["6", "อำไพ อาคารสอง"], ["7", "วิชัย ซ่อมเจ็ด"], ["z", "ซีซี ตึกแซด"]] as const) P[k] = await mkParty(A, n);
  P.b = await mkParty(B, "ร้านบี คนเช่า");
  L["1"] = await mkLease(A, DA, RM["101"], P["1"]); L["2"] = await mkLease(A, DA, RM["102"], P["2"]); L["3"] = await mkLease(A, DA, RM["103"], P["3"], "ENDED");
  L["4"] = await mkLease(A, DA, RM["104"], P["4"]); L["5"] = await mkLease(A, DA, RM["105"], P["5"]); L["6"] = await mkLease(A, DA, RM["201"], P["6"]);
  L["7"] = await mkLease(A, DA, RM["106"], P["7"]); L.z = await mkLease(A, DZ, RM.z101, P.z); L.b = await mkLease(B, DB, RM.b101, P.b);
  const C: Record<string, string> = {};
  for (const k of ["1", "2", "3", "4", "5", "6", "7", "z"]) { const ext = `Upb16${k}${RAND}`; await prisma.chatContact.create({ data: { tenantId: A, systemId: sysA, channel: "LINE", channelConnectionId: OA1, externalUserId: ext, partyId: P[k], lang: "th" } }); C[k] = ext; }
  { const ext = `Upb16b${RAND}`; await prisma.chatContact.create({ data: { tenantId: B, systemId: sysB, channel: "LINE", channelConnectionId: OAB, externalUserId: ext, partyId: P.b, lang: "th" } }); C.b = ext; }
  // บอร์ดงานร้าน A: "ซ่อมหอ" แจ้งเข้า → กำลังซ่อม → เสร็จ · ร้าน B ไม่มีระบบบอร์ดงาน
  const KS = (await prisma.appSystem.create({ data: { tenantId: A, type: "KANBAN", name: `pb16-kanban-${STAMP}` } })).id as string;
  const KB = (await prisma.kanbanBoard.create({ data: { tenantId: A, systemId: KS, name: "ซ่อมหอ" } })).id as string;
  const mkCol = async (name: string, i: number, done = false) => (await prisma.kanbanColumn.create({ data: { tenantId: A, systemId: KS, boardId: KB, name, sortOrder: i, position: `a${i}`, isDoneColumn: done } })).id as string;
  const KC0 = await mkCol("แจ้งเข้า", 0), KC1 = await mkCol("กำลังซ่อม", 1), KC2 = await mkCol("เสร็จ", 2, true);
  const kctx = { tenantId: A, systemId: KS, actorUserId: OWN };

  const cO = { tenantId: A, actorUserId: OWN }, cTK = { tenantId: A, actorUserId: TK }, cTK2 = { tenantId: A, actorUserId: TK2 }, cVW = { tenantId: A, actorUserId: VW }, cB = { tenantId: B, actorUserId: OWNB };
  const park = () => prisma.$executeRawUnsafe(`UPDATE "OutboxEvent" SET "availableAt" = now() + interval '2 days' WHERE "tenantId" = ANY($1::text[]) AND status::text = 'PENDING'`, tenantIds);
  const tok = (leaseId: string, tenantId = A, purpose = "dorm.portal", expMin = 600) => SL.signLink({ tenantId, purpose, subjectId: leaseId, expMin });
  let ck = 0;
  const CK = (k = "") => `pb16-${STAMP}-${k}${++ck}`;
  const TEXTS: string[] = [];
  const input = (key: string, extra: Record<string, unknown> = {}) => { const text = `ก๊อกน้ำหยด ${key}`; TEXTS.push(text); return { category: "PLUMBING", text, allowEntry: false, preferredTime: "หลัง 17:00", photos: [png(`${key}-1`)], idempotencyKey: K(key), ...extra }; };
  const submit = async (leaseId: string, key: string, extra: Record<string, unknown> = {}, tenantId = A) => {
    const r = await dorm.submitPortalRepair(tok(leaseId, tenantId), input(key, extra), { clientKey: CK("s"), deps: noopDeps });
    await park();
    return r;
  };
  const filesA = () => prisma.fileAsset.count({ where: { tenantId: A } });
  const outboxOf = async (type: string, key: string, val: string) => (await prisma.outboxEvent.findMany({ where: { tenantId: { in: tenantIds }, type }, orderBy: { createdAt: "asc" } })).filter((x: any) => x.payload?.[key] === val);
  const evtOf = (r: any) => ({ id: r.id, tenantId: r.tenantId, type: r.type, payload: r.payload, systemId: r.systemId ?? null, unitId: r.unitId ?? null });
  const consumeAll = async (type: string, key: string, val: string) => { for (const r of await outboxOf(type, key, val)) { await OC.consumers[type](evtOf(r)); await park(); } };
  const cardsOf = (repairId: string) => prisma.kanbanCard.findMany({ where: { tenantId: { in: tenantIds }, sourceKey: `dorm.repair#${repairId}` } });
  const repairRow = (id: string): Promise<any> => prisma.dormRepair.findUnique({ where: { id } });
  const moveTo = async (cardId: string, col: string) => { const r = await KM.moveCard(kctx, { cardId, toColumnId: col }); await park(); return r; };
  const NF = J({ ok: false, code: "NOT_FOUND", reason: dorm.REPAIR_NF_REASON });

  // ═══════════ SB แจ้งพร้อมกันหลายโพรเซส ═══════════
  console.log("\n── SB แจ้งพร้อมกัน ──");
  const RP: Record<string, string> = {};
  {
    const f0 = await filesA();
    const t = tok(L["1"]);
    const inp = input("sb1");
    const item = (i: number) => ({ token: t, input: { ...inp, photos: [{ data: b64(pngB(`sb1-${i}`)), contentType: "image/png" }] }, clientKey: CK("sb1"), now: nowIso() });
    const rs = await fanout("submit", [0, 1, 2, 3].map((g) => [0, 1, 2].map((j) => item(g * 3 + j))));
    await park();
    const ids = [...new Set(rs.filter((x) => x?.ok).map((x) => x.repairId))];
    const rows = ids.length ? await prisma.dormRepair.count({ where: { id: { in: ids } } }) : 0;
    const ev = ids[0] ? await outboxOf("dorm.repair.created", "repairId", ids[0]) : [];
    const fresh = rs.filter((x) => x?.ok && x.replayed === false).length;
    const f1 = await filesA();
    RP.sb1 = ids[0];
    rec("SB-1", !badOf(rs).length && ids.length === 1 && rows === 1 && ev.length === 1 && fresh === 1 && f1 - f0 === 1, "CRITICAL",
      "submit ×12 (4 โพรเซส) คีย์เดียว ⇒ 1 แถว · 1 event · fresh 1 · รูปผู้แพ้ถูกลบ (เหลือ 1)", { tally: tally(rs), ids: ids.length, rows, ev: ev.length, fresh, filesDelta: f1 - f0, bad: badOf(rs).slice(0, 2) });
    // consumer created ×9 (3 โพรเซส + ในโพรเซส) ⇒ การ์ด 1
    if (ev[0]) {
      const e = evtOf(ev[0]);
      const at = Date.now() + 15_000;
      const kids = fanout("consume", [0, 1].map(() => [0, 1, 2].map(() => ({ type: "dorm.repair.created", evt: e }))), 15_000);
      const mine = inProcAt(at, [0, 1, 2].map(() => () => OC.consumers["dorm.repair.created"](e)));
      const all = [...(await kids), ...(await mine)];
      await park();
      const cards = await cardsOf(RP.sb1);
      const row = await repairRow(RP.sb1);
      rec("SB-2", !badOf(all).length && cards.length === 1 && row?.kanbanCardId === cards[0]?.id, "CRITICAL", "consumer dorm.repair.created ×9 (2 โพรเซส + ในโพรเซส) ⇒ การ์ด 1 ใบ · kanbanCardId ผูกใบนั้น", { cards: cards.length, linked: row?.kanbanCardId === cards[0]?.id, bad: badOf(all).slice(0, 2) });
    } else rec("SB-2", false, "CRITICAL", "consumer created ×9 ⇒ การ์ด 1", "ไม่มี event");
  }
  {
    // คนละคีย์ สัญญาเดียว ×14 พร้อมกัน ⇒ ok ≤ 10 (เพดานค้าง) — ตรวจ deviation 3
    const t = tok(L["4"]);
    const items = Array.from({ length: 14 }, (_, i) => ({ token: t, input: { ...input(`sb3-${i}`), photos: [] }, clientKey: CK("sb3"), now: nowIso() }));
    const rs = await fanout("submit", [0, 1].map((g) => items.slice(g * 7, g * 7 + 7)));
    await park();
    const active = await prisma.dormRepair.count({ where: { tenantId: A, leaseId: L["4"], status: { in: ["OPEN", "IN_PROGRESS"] } } });
    const okN = rs.filter((x) => x?.ok && !x.replayed).length, tm = rs.filter((x) => x?.code === "TOO_MANY").length;
    rec("SB-3", !badOf(rs).length && okN === 10 && tm === 4 && active === 10, "MAJOR", "คนละคีย์ สัญญาเดียว ×14 (2 โพรเซส) ⇒ ok 10 · TOO_MANY 4 · ค้างจริง 10 (เพดานไม่ทะลุใต้การแข่ง)", { tally: tally(rs), active });
    await prisma.dormRepair.updateMany({ where: { tenantId: A, leaseId: L["4"] }, data: { status: "CANCELLED" } });
  }

  // ═══════════ KC consumer ∥ ตัวกวาด ⇒ การ์ด 1 ═══════════
  console.log("\n── KC consumer ∥ กวาด ──");
  {
    const r = await submit(L["2"], "kc1");
    RP.kc1 = r?.repairId;
    const ev = r?.ok ? await outboxOf("dorm.repair.created", "repairId", r.repairId) : [];
    if (ev[0]) {
      const e = evtOf(ev[0]);
      const at = Date.now() + 15_000;
      const kidsC = fanout("consume", [[0, 1, 2].map(() => ({ type: "dorm.repair.created", evt: e }))], 15_000);
      const kidsS = fanout("sweep", [[{ now: nowIso(), tenantId: A }], [{ now: nowIso(), tenantId: A }]], 15_000);
      const mine = inProcAt(at, [() => OC.consumers["dorm.repair.created"](e), () => OC.consumers["dorm.repair.created"](e), () => BR.sweepDormRepairCards(new Date(), { tenantId: A, budgetMs: 90_000 })]);
      const all = [...(await kidsC), ...(await kidsS), ...(await mine)];
      await park();
      const cards = await cardsOf(r.repairId);
      const row = await repairRow(r.repairId);
      const created = all.reduce((n, x) => n + (typeof x?.created === "number" ? x.created : 0), 0);
      rec("KC-1", !badOf(all).length && cards.length === 1 && row?.kanbanCardId === cards[0]?.id && created <= 1, "CRITICAL", "consumer ×5 ∥ sweep ×3 (3 โพรเซส + ในโพรเซส) ⇒ การ์ด 1 · ผูกถูกใบ · created รวม ≤ 1", { cards: cards.length, linked: row?.kanbanCardId === cards[0]?.id, sweepCreated: created, bad: badOf(all).slice(0, 2) });
      // การ์ดไม่มีไฟล์/ชื่อ/เบอร์/id ไฟล์
      const c = cards[0];
      const att = c ? await prisma.kanbanAttachment.count({ where: { cardId: c.id } }) : -1;
      const fids = (Array.isArray(row?.files) ? row.files : []).map((f: any) => f.fileId);
      const s = J(c);
      const leak = [...NAMES, ...PHONES, ...fids, "/api/files", "private:"].filter((x) => x && s.includes(x));
      rec("KC-2", !!c && att === 0 && !leak.length, "CRITICAL", "การ์ดไม่มีไฟล์แนบ · ไม่มีชื่อ/เบอร์/id ไฟล์/ลิงก์ไฟล์", { att, leak });
    } else rec("KC-1", false, "CRITICAL", "consumer ∥ sweep", { r });
  }

  // ═══════════ KD การ์ดเสร็จ ×N ⇒ LINE 1 · เปิดซ้ำ/ปิดซ้ำ ⇒ ไม่ส่งซ้ำ ═══════════
  console.log("\n── KD การ์ดเสร็จ ──");
  {
    const rid = RP.kc1;
    const card = rid ? (await cardsOf(rid))[0] : null;
    if (card) {
      await moveTo(card.id, KC1);
      await consumeAll("kanban.card.moved", "cardId", card.id);
      const midRow = await repairRow(rid);
      await moveTo(card.id, KC2);
      const cp = await outboxOf("kanban.card.completed", "cardId", card.id);
      const e = cp[0] ? evtOf(cp[0]) : null;
      const at = Date.now() + 15_000;
      const kids = e ? fanout("consume", [0, 1].map(() => [0, 1, 2, 3].map(() => ({ type: "kanban.card.completed", evt: e }))), 15_000) : Promise.resolve([]);
      const mine = e ? inProcAt(at, [0, 1, 2].map(() => () => OC.consumers["kanban.card.completed"](e))) : Promise.resolve([]);
      // moved (เข้าคอลัมน์เสร็จ) ด้วย — ต้องไม่ถอยสถานะ
      const all = [...(await kids), ...(await mine)];
      await consumeAll("kanban.card.moved", "cardId", card.id);
      await park();
      const row = await repairRow(rid);
      const dEv = await outboxOf("dorm.repair.done", "repairId", rid);
      // consume dorm.repair.done ×8 (2 โพรเซส + ในโพรเซส) ⇒ LINE 1
      const m0 = FAKE.length;
      if (dEv[0]) {
        const de = evtOf(dEv[0]);
        const at2 = Date.now() + 15_000;
        const k2 = fanout("consume", [0, 1].map(() => [0, 1, 2].map(() => ({ type: "dorm.repair.done", evt: de }))), 15_000);
        const m2 = inProcAt(at2, [0, 1].map(() => () => OC.consumers["dorm.repair.done"](de)));
        await k2; await m2; await park();
      }
      const p1 = pushesTo(C["2"], m0).length;
      const logs = await prisma.serviceMessageLog.findMany({ where: { tenantId: A, dedupeKey: `rooms:repairDone:${rid}` } });
      rec("KD-1", !badOf(all).length && midRow?.status === "IN_PROGRESS" && row?.status === "DONE" && dEv.length === 1 && p1 === 1 && logs.length === 1, "CRITICAL",
        "ย้าย → กำลังซ่อม · การ์ดเสร็จ: consumer completed ×11 (2 โพรเซส + ในโพรเซส) ⇒ DONE · event done 1 · consumer done ×8 ⇒ LINE 1", { mid: midRow?.status, status: row?.status, doneEv: dEv.length, pushes: p1, logs: logs.map((l: any) => l.status), bad: badOf(all).slice(0, 2) });
      const pushJ = J(pushesTo(C["2"], m0).map((x) => x.json));
      const fids = (Array.isArray(row?.files) ? row.files : []).map((f: any) => f.fileId);
      const leak = [...fids, "/api/files", "private:", ...PHONES].filter((x) => x && pushJ.includes(x));
      rec("KD-1b", p1 === 1 && !leak.length && pushJ.includes(`r=${rid}`), "MAJOR", "ข้อความ LINE ซ่อมเสร็จ: มีปุ่มลิงก์ให้คะแนน ?r= · ไม่มีไฟล์/เบอร์", { leak, hasRate: pushJ.includes(`r=${rid}`) });
      // เปิดซ้ำ → ปิดซ้ำ ⇒ ไม่เปลี่ยน · ไม่มี event ใหม่ · ไม่ส่ง
      const m1 = FAKE.length;
      const doneAt0 = row?.doneAt?.toISOString?.();
      await moveTo(card.id, KC1);
      await consumeAll("kanban.card.moved", "cardId", card.id);
      const reopened = await repairRow(rid);
      await moveTo(card.id, KC2);
      await consumeAll("kanban.card.completed", "cardId", card.id);
      await consumeAll("kanban.card.moved", "cardId", card.id);
      await consumeAll("dorm.repair.done", "repairId", rid);
      const sw = await BR.sweepDormRepairCards(new Date(), { tenantId: A, budgetMs: 60_000 });
      const jb = await dorm.runDormRepairJobs(new Date(), { tenantId: A, budgetMs: 60_000 });
      const after = await repairRow(rid);
      const dEv2 = await outboxOf("dorm.repair.done", "repairId", rid);
      const p2 = pushesTo(C["2"], m1).length;
      rec("KD-2", reopened?.status === "DONE" && after?.status === "DONE" && after?.doneAt?.toISOString?.() === doneAt0 && dEv2.length === 1 && p2 === 0, "CRITICAL",
        "เปิดการ์ดซ้ำ (→ กำลังซ่อม) แล้วปิดซ้ำ + กวาด + งานส่งซ้ำ ⇒ คำแจ้งยัง DONE (doneAt เดิม) · event done ยัง 1 · LINE 0", { reopened: reopened?.status, after: after?.status, doneAtSame: after?.doneAt?.toISOString?.() === doneAt0, doneEv: dEv2.length, pushes: p2, sw, jb });
    } else rec("KD-1", false, "CRITICAL", "การ์ดเสร็จ", "ไม่มีการ์ดจาก KC");
  }

  // ═══════════ TC ช่างกดเสร็จ ×10 ⇒ 1 · ผสม consumer การ์ดเสร็จ ═══════════
  console.log("\n── TC ช่างกดเสร็จ ──");
  {
    const r = await submit(L["1"], "tc1");
    RP.tc1 = r?.repairId;
    await consumeAll("dorm.repair.created", "repairId", r.repairId);
    const f0 = await filesA();
    const item = (i: number) => ({ ctx: i % 2 ? cTK : cO, input: { unitId: DA, repairId: r.repairId, afterPhotos: [{ data: b64(pngB(`tc-${i}`)), contentType: "image/png" }] }, now: nowIso() });
    const rs = await fanout("complete", [0, 1].map((g) => [0, 1, 2, 3, 4].map((j) => item(g * 5 + j))));
    await park();
    const okN = rs.filter((x) => x?.ok).length, lose = rs.filter((x) => x?.code === "ALREADY_DONE").length;
    const row = await repairRow(r.repairId);
    const dEv = await outboxOf("dorm.repair.done", "repairId", r.repairId);
    const f1 = await filesA();
    const after = (Array.isArray(row?.files) ? row.files : []).filter((f: any) => f.role === "AFTER").length;
    rec("TC-1", !badOf(rs).length && okN === 1 && lose === 9 && row?.status === "DONE" && dEv.length === 1 && f1 - f0 === 1 && after === 1, "CRITICAL",
      "ช่างกดเสร็จ ×10 (2 โพรเซส · 2 คน) ⇒ ok 1 · ALREADY_DONE 9 · event done 1 · รูปหลังซ่อมผู้แพ้ถูกลบ", { tally: tally(rs), status: row?.status, doneEv: dEv.length, filesDelta: f1 - f0, after, bad: badOf(rs).slice(0, 2) });
    // done → สะพานปิดการ์ด (completed event) + LINE 1 ครั้ง แม้ consumer ซ้ำ
    const m0 = FAKE.length;
    for (let i = 0; i < 3; i++) await consumeAll("dorm.repair.done", "repairId", r.repairId);
    const card = (await cardsOf(r.repairId))[0];
    if (card) { await consumeAll("kanban.card.completed", "cardId", card.id); await consumeAll("kanban.card.moved", "cardId", card.id); }
    const dEv2 = await outboxOf("dorm.repair.done", "repairId", r.repairId);
    const cardRow = card ? await prisma.kanbanCard.findUnique({ where: { id: card.id } }) : null;
    const p = pushesTo(C["1"], m0).length;
    rec("TC-2", p === 1 && dEv2.length === 1 && cardRow?.columnId === KC2, "CRITICAL", "หลังช่างกดเสร็จ: consumer done ×3 ⇒ LINE 1 · สะพานย้ายการ์ดเข้าคอลัมน์เสร็จ · completed กลับมาไม่ยิง done ซ้ำ", { pushes: p, doneEv: dEv2.length, cardInDone: cardRow?.columnId === KC2 });
  }
  {
    // ผสม: การ์ดอยู่คอลัมน์เสร็จแล้ว (completed ค้าง) ∥ ช่างกดเสร็จ ×5 ∥ consumer completed ×5 ∥ กวาด ⇒ DONE ครั้งเดียว
    const r = await submit(L["7"], "tc3");
    RP.tc3 = r?.repairId;
    await consumeAll("dorm.repair.created", "repairId", r.repairId);
    const card = (await cardsOf(r.repairId))[0];
    if (card) {
      await moveTo(card.id, KC2);
      const cp = await outboxOf("kanban.card.completed", "cardId", card.id);
      const e = evtOf(cp[0]);
      const at = Date.now() + 15_000;
      const kidsT = fanout("complete", [[0, 1, 2, 3, 4].map(() => ({ ctx: cO, input: { unitId: DA, repairId: r.repairId }, now: nowIso() }))], 15_000);
      const kidsC = fanout("consume", [[0, 1, 2, 3, 4].map(() => ({ type: "kanban.card.completed", evt: e }))], 15_000);
      const kidsS = fanout("sweep", [[{ now: nowIso(), tenantId: A }]], 15_000);
      const mine = inProcAt(at, [() => dorm.completeDormRepair(cO, { unitId: DA, repairId: r.repairId }, { deps: noopDeps }), () => OC.consumers["kanban.card.completed"](e)]);
      const t = await kidsT, c = await kidsC, s = await kidsS, mm = await mine;
      await park();
      const all = [...t, ...c, ...s, ...mm];
      const dEv = await outboxOf("dorm.repair.done", "repairId", r.repairId);
      const audits = await prisma.auditLog.count({ where: { tenantId: A, targetId: r.repairId, action: "dorm.repair.done" } });
      const okT = [...t, mm[0]].filter((x) => x?.ok).length;
      const m0 = FAKE.length;
      for (const d of dEv) { const de = evtOf(d); await Promise.all([0, 1, 2].map(() => OC.consumers["dorm.repair.done"](de))); }
      await park();
      rec("TC-3", !badOf(all).length && dEv.length === 1 && audits === 1 && okT <= 1 && pushesTo(C["7"], m0).length === 1, "CRITICAL",
        "การ์ดเสร็จค้าง ∥ ช่างกดเสร็จ ×6 ∥ consumer completed ×6 ∥ กวาด (3 โพรเซส + ในโพรเซส) ⇒ event done 1 · audit done 1 · LINE 1", { tTally: tally([...t, mm[0]]), doneEv: dEv.length, audits, pushes: pushesTo(C["7"], m0).length, bad: badOf(all).slice(0, 2) });
    } else rec("TC-3", false, "CRITICAL", "ผสม", "ไม่มีการ์ด");
  }

  // ═══════════ EL สัญญาจบ ═══════════
  console.log("\n── EL สัญญาจบ ──");
  {
    const t3 = tok(L["3"]);
    const s3 = await dorm.submitPortalRepair(t3, input("el1"), { clientKey: CK("el"), deps: noopDeps });
    const v3 = await dorm.loadPortalRepairs(t3, { r: null }, { clientKey: CK("el") });
    const rows3 = await prisma.dormRepair.count({ where: { tenantId: A, leaseId: L["3"] } });
    rec("EL-1", J(s3) === NF && v3 === null && rows3 === 0, "CRITICAL", "สัญญาจบ ⇒ submit NOT_FOUND ทุกไบต์ · หน้า null · ไม่มีแถว", { s: codeOf(s3), v: v3 === null ? "null" : "VIEW", rows3 });
    // L5: แจ้ง → ช่างปิด → สัญญาจบก่อน consumer done ⇒ ไม่ส่ง
    const r = await submit(L["5"], "el2");
    const c = r?.ok ? await dorm.completeDormRepair(cO, { unitId: DA, repairId: r.repairId }, { deps: noopDeps }) : null;
    await park();
    const tk5 = tok(L["5"]);
    await prisma.dormLease.update({ where: { id: L["5"] }, data: { status: "ENDED", endedAt: new Date(), endReason: "MOVE_OUT" } });
    const m0 = FAKE.length;
    if (r?.ok) await consumeAll("dorm.repair.done", "repairId", r.repairId);
    const direct = r?.ok ? await dorm.sendRepairDoneNotice({ tenantId: A }, { repairId: r.repairId }) : null;
    const jb = await dorm.runDormRepairJobs(new Date(), { tenantId: A, budgetMs: 60_000 });
    const p = pushesTo(C["5"], m0).length;
    const s5 = await dorm.submitPortalRepair(tk5, input("el3"), { clientKey: CK("el"), deps: noopDeps });
    const rt5 = r?.ok ? await dorm.ratePortalRepair(tk5, { repairId: r.repairId, rating: 5 }, { clientKey: CK("el") }) : null;
    rec("EL-2", c?.ok === true && p === 0 && direct?.status === "NO_LEASE" && J(s5) === NF && J(rt5) === NF, "CRITICAL",
      "สัญญาจบหลังปิดงาน ⇒ consumer/ส่งตรง/งานส่งซ้ำ ไม่ส่ง LINE (NO_LEASE) · token เดิม submit/rate ⇒ NOT_FOUND ทุกไบต์", { complete: codeOf(c), pushes: p, direct, jb, s5: codeOf(s5), rt5: codeOf(rt5) });
  }

  // ═══════════ TK token ผิดทุกแบบ + หมดอายุ + rate limit ═══════════
  console.log("\n── TK token/rate ──");
  {
    const good = tok(L["1"]);
    const [p, s] = good.split(".");
    const flip = (x: string, i: number) => x.slice(0, i) + (x[i] === "A" ? "B" : "A") + x.slice(i + 1);
    const exp = tok(L["1"], A, "dorm.portal", 1);
    const variants: Record<string, string> = {
      tamperPayload: `${flip(p, 5)}.${s}`,
      tamperSig: `${p}.${flip(s, 3)}`,
      truncated: good.slice(0, -4),
      extraDot: `${good}.x`,
      empty: "",
      garbage: "../../etc/passwd",
      otherPurpose: tok(L["1"], A, "dorm.parcel"),
      otherTenant: tok(L["1"], B),
      unknownSubject: tok("dlsnotexist000000000000000"),
      endedLease: tok(L["3"]),
      bTokenOnALease: tok(L.b, A),
    };
    const sub: Record<string, string> = {}, rate: Record<string, string> = {}, view: Record<string, string> = {};
    const bad: string[] = [];
    const doneId = RP.tc1;
    for (const [k, t] of Object.entries(variants)) {
      const a = await dorm.submitPortalRepair(t, input(`tk-${k}`), { clientKey: CK("tk"), deps: noopDeps });
      const b = await dorm.ratePortalRepair(t, { repairId: doneId, rating: 4 }, { clientKey: CK("tk") });
      const c = await dorm.loadPortalRepairs(t, { r: null }, { clientKey: CK("tk") });
      sub[k] = codeOf(a); rate[k] = codeOf(b); view[k] = c === null ? "null" : "VIEW";
      if (J(a) !== NF) bad.push(`submit ${k}: ${J(a).slice(0, 80)}`);
      if (J(b) !== NF) bad.push(`rate ${k}: ${J(b).slice(0, 80)}`);
      if (c !== null) bad.push(`view ${k}`);
    }
    const realNow = Date.now;
    try {
      Date.now = () => realNow() + 61_000;
      const a = await dorm.submitPortalRepair(exp, input("tk-exp"), { clientKey: CK("tk"), deps: noopDeps });
      const b = await dorm.ratePortalRepair(exp, { repairId: doneId, rating: 4 }, { clientKey: CK("tk") });
      const c = await dorm.loadPortalRepairs(exp, { r: null }, { clientKey: CK("tk") });
      sub.expired = codeOf(a); rate.expired = codeOf(b); view.expired = c === null ? "null" : "VIEW";
      if (J(a) !== NF) bad.push(`submit expired: ${J(a).slice(0, 80)}`);
      if (J(b) !== NF) bad.push(`rate expired: ${J(b).slice(0, 80)}`);
      if (c !== null) bad.push("view expired");
    } finally { Date.now = realNow; }
    const ctrlV = await dorm.loadPortalRepairs(good, { r: null }, { clientKey: CK("tk") });
    const ctrlE = await dorm.loadPortalRepairs(exp, { r: null }, { clientKey: CK("tk") });
    const rows = await prisma.dormRepair.count({ where: { tenantId: { in: tenantIds }, text: { startsWith: "ก๊อกน้ำหยด tk-" } } });
    rec("TK-1", !bad.length && ctrlV !== null && ctrlE !== null && rows === 0, "CRITICAL", "token ปลอม/ตัดท้าย/purpose อื่น/ร้านอื่น/ไม่มีสัญญา/สัญญาจบ/หมดอายุ ⇒ submit/rate NOT_FOUND ทุกไบต์ · หน้า null · ไม่มีแถว (ตัวควบคุม token ดี/ก่อนหมดอายุ ได้หน้า)", { sub, rate, view, bad, rows });
    // repairId ของสัญญาอื่น/ร้านอื่น
    const bRep = await submit(L.b, "tk-b", {}, B);
    const otherLease = await dorm.ratePortalRepair(tok(L["2"]), { repairId: doneId, rating: 4 }, { clientKey: CK("tk") });
    const otherShop = bRep?.ok ? await dorm.ratePortalRepair(tok(L["1"]), { repairId: bRep.repairId, rating: 4 }, { clientKey: CK("tk") }) : null;
    const vOther = await dorm.loadPortalRepairs(tok(L["2"]), { r: doneId }, { clientKey: CK("tk") });
    const vShop = bRep?.ok ? await dorm.loadPortalRepairs(tok(L["1"]), { r: bRep.repairId }, { clientKey: CK("tk") }) : "x";
    const vGood = await dorm.loadPortalRepairs(tok(L["1"]), { r: doneId }, { clientKey: CK("tk") });
    const vj = J(vGood);
    const vLeak = [...NAMES, ...PHONES, "/api/files", "private:", L["1"], P["1"], A, DA].filter((x) => x && vj.includes(x));
    RP.b = bRep?.repairId;
    rec("TK-2", J(otherLease) === NF && J(otherShop) === NF && vOther === null && vShop === null && vGood !== null && !vLeak.length, "CRITICAL",
      "งานของสัญญาอื่น/ร้านอื่นผ่าน token ที่ดี ⇒ rate NOT_FOUND ทุกไบต์ · หน้า ?r= ⇒ null · หน้าเจ้าของไม่มีชื่อ/เบอร์/ไฟล์/id ภายใน", { otherLease: codeOf(otherLease), otherShop: codeOf(otherShop), vOther: vOther === null, vShop: vShop === null, vLeak });
  }
  {
    // rate limit ก่อน token: 10 ครั้ง token ขยะ ⇒ ครั้งที่ 11 token ดี = RATE_LIMITED · คีย์อื่นผ่าน
    const key = CK("rl");
    let nf = 0;
    for (let i = 0; i < 10; i++) if (J(await dorm.submitPortalRepair(`garbage${i}`, input(`rl${i}`), { clientKey: key, deps: noopDeps })) === NF) nf++;
    const over = await dorm.submitPortalRepair(tok(L["1"]), input("rl-over"), { clientKey: key, deps: noopDeps });
    const overRate = await dorm.ratePortalRepair(tok(L["1"]), { repairId: RP.tc1, rating: 5 }, { clientKey: key });
    const ctrl = await dorm.ratePortalRepair(tok(L["1"]), { repairId: RP.tc1, rating: 5 }, { clientKey: CK("rl-ctrl") });
    const vkey = CK("rlv");
    let vn = 0;
    for (let i = 0; i < 120; i++) if ((await dorm.loadPortalRepairs(`garbage${i}`, { r: null }, { clientKey: vkey })) === null) vn++;
    const vOver = await dorm.loadPortalRepairs(tok(L["1"]), { r: null }, { clientKey: vkey });
    const overRow = await prisma.dormRepair.count({ where: { tenantId: A, text: "ก๊อกน้ำหยด rl-over" } });
    rec("TK-3", nf === 10 && over?.code === "RATE_LIMITED" && overRate?.code === "RATE_LIMITED" && ctrl?.ok === true && vn === 120 && vOver === null && overRow === 0, "CRITICAL",
      "rate limit ก่อน token: submit 10 ขยะ ⇒ ครั้งที่ 11 token ดี RATE_LIMITED (ทั้ง submit/rate ถังเดียว) · view 120 ขยะ ⇒ 121 null · คีย์อื่นผ่าน", { nf, over: codeOf(over), overRate: codeOf(overRate), ctrl: codeOf(ctrl), vn, vOver: vOver === null ? "null" : "VIEW", overRow });
  }

  // ═══════════ XS ข้ามร้าน/หน่วย/อาคาร ═══════════
  console.log("\n── XS ข้ามร้าน/หน่วย/อาคาร ──");
  {
    const r201 = await submit(L["6"], "xs201");
    const rz = await submit(L.z, "xsz");
    RP.r201 = r201?.repairId; RP.z = rz?.repairId;
    const cases: [string, () => Promise<unknown>][] = [
      ["list OWNB@DA", () => dorm.listDormRepairs(cB, { unitId: DA })],
      ["list OWN@DB", () => dorm.listDormRepairs(cO, { unitId: DB })],
      ["list OWN@SHOP", () => dorm.listDormRepairs(cO, { unitId: NU })],
      ["list OWN@random", () => dorm.listDormRepairs(cO, { unitId: "cnotaunit000000000000000" })],
      ["list VW(no perm)", () => dorm.listDormRepairs(cVW, { unitId: DA })],
      ["list TK2@DZ(no unit access)", () => dorm.listDormRepairs(cTK2, { unitId: DZ })],
      ["job TK@201(อาคาร2)", () => dorm.dormRepairJob(cTK, { unitId: DA, repairId: r201.repairId })],
      ["job OWN@DA repair-of-B", () => dorm.dormRepairJob(cO, { unitId: DA, repairId: RP.b })],
      ["job OWN@DA repair-of-DZ", () => dorm.dormRepairJob(cO, { unitId: DA, repairId: rz.repairId })],
      ["job OWNB@DA", () => dorm.dormRepairJob(cB, { unitId: DA, repairId: RP.sb1 })],
      ["job OWNB@DB repair-of-A", () => dorm.dormRepairJob(cB, { unitId: DB, repairId: RP.sb1 })],
      ["job VW", () => dorm.dormRepairJob(cVW, { unitId: DA, repairId: RP.sb1 })],
      ["job OWN bad-id", () => dorm.dormRepairJob(cO, { unitId: DA, repairId: "x'; DROP TABLE x;--" })],
      ["complete TK@201", () => dorm.completeDormRepair(cTK, { unitId: DA, repairId: r201.repairId }, { deps: noopDeps })],
      ["complete OWNB@DA", () => dorm.completeDormRepair(cB, { unitId: DA, repairId: r201.repairId }, { deps: noopDeps })],
      ["complete OWN@DA repair-of-B", () => dorm.completeDormRepair(cO, { unitId: DA, repairId: RP.b }, { deps: noopDeps })],
      ["complete OWN@DA repair-of-DZ", () => dorm.completeDormRepair(cO, { unitId: DA, repairId: rz.repairId }, { deps: noopDeps })],
      ["complete VW", () => dorm.completeDormRepair(cVW, { unitId: DA, repairId: r201.repairId }, { deps: noopDeps })],
    ];
    const bad: string[] = [];
    const got: Record<string, string> = {};
    for (const [k, f] of cases) { let r: unknown; try { r = await f(); } catch (e) { r = { threw: errMsg(e) }; } got[k] = codeOf(r); if (J(r) !== NF) bad.push(`${k}: ${J(r).slice(0, 100)}`); }
    const s201 = (await repairRow(r201.repairId))?.status, sB = RP.b ? (await repairRow(RP.b))?.status : null, sZ = (await repairRow(rz.repairId))?.status;
    rec("XS-1", !bad.length && s201 === "OPEN" && sB === "OPEN" && sZ === "OPEN", "CRITICAL", "ข้ามร้าน/ไม่ใช่หอ/ไม่มีสิทธิ์/นอกอาคาร/หน่วยไม่ตรง ⇒ NOT_FOUND ทุกไบต์ (list/job/complete) · งานเป้าหมายไม่เปลี่ยน", { got, bad, s201, sB, sZ });
    const tkList = await dorm.listDormRepairs(cTK, { unitId: DA, status: "ALL" });
    const tk2List = await dorm.listDormRepairs(cTK2, { unitId: DA, status: "ALL" });
    const sees201 = tkList?.ok && tkList.rows.some((x: any) => x.roomId === RM["201"]);
    const total = (c: any) => (c ? c.open + c.inProgress + c.done + c.cancelled : -1);
    const allA = await prisma.dormRepair.count({ where: { tenantId: A, unitId: DA } });
    const allB1 = await prisma.dormRepair.count({ where: { tenantId: A, unitId: DA, roomId: { not: RM["201"] } } });
    rec("XS-2", tk2List?.ok && tk2List.rows.some((x: any) => x.repairId === r201.repairId) && !sees201 && total(tkList?.counts) === allB1 && total(tk2List?.counts) === allA, "CRITICAL",
      "ขอบเขตอาคาร (#64): TK ไม่เห็นแถว/ไม่นับห้อง 201 · TK2 เห็น", { sees201, tkTotal: total(tkList?.counts), allB1, tk2Total: total(tk2List?.counts), allA });
    await prisma.membership.update({ where: { id: mem.tk }, data: { permissions: { "dorm.view": true } } });
    const revoked = await dorm.dormRepairJob(cTK, { unitId: DA, repairId: RP.sb1 });
    await prisma.membership.update({ where: { id: mem.tk }, data: { permissions: { "dorm.view": true, "dorm.repair.manage": true } } });
    // ผู้ดูแลอาคารไม่ได้รับมอบหมาย (fail closed)
    await setVal(A, "rooms.access.buildingAssignments", DA, { [mem.tk2]: [B1, B2], [mem.vw]: [B1] });
    const unassigned = await dorm.listDormRepairs(cTK, { unitId: DA, status: "ALL" });
    await setVal(A, "rooms.access.buildingAssignments", DA, { [mem.tk]: [B1], [mem.tk2]: [B1, B2], [mem.vw]: [B1] });
    const unRows = unassigned?.ok ? unassigned.rows.length : 0;
    rec("XS-3", J(revoked) === NF && (J(unassigned) === NF || (unassigned?.ok && unRows === 0 && total(unassigned.counts) === 0)), "MAJOR", "ถอนสิทธิ์สด ⇒ NOT_FOUND · ไม่ได้รับมอบหมายอาคาร ⇒ ไม่เห็นอะไร (fail closed)", { revoked: codeOf(revoked), unassigned: unassigned?.ok ? { rows: unRows, counts: unassigned.counts } : codeOf(unassigned) });
    // การ์ดปลอมข้ามร้าน: การ์ดร้าน A sourceKey ชี้งานร้าน B ⇒ completed ไม่ทำอะไร
    if (RP.b) {
      const fake = await KL.createCardFromExternal({ tenantId: A, systemId: KS, actorUserId: null }, { boardId: KB, title: "ปลอม", sourceType: "AUTOMATION", sourceKey: `dorm.repair#${RP.b}` });
      await park();
      await moveTo(fake.cardId, KC2);
      await consumeAll("kanban.card.completed", "cardId", fake.cardId);
      await consumeAll("kanban.card.moved", "cardId", fake.cardId);
      const b = await repairRow(RP.b);
      const dB = await outboxOf("dorm.repair.done", "repairId", RP.b);
      rec("XS-4", b?.status === "OPEN" && !b?.kanbanCardId && dB.length === 0, "CRITICAL", "การ์ดร้าน A ที่ sourceKey ชี้งานร้าน B ย้ายเข้าเสร็จ ⇒ งานร้าน B ไม่เปลี่ยน", { status: b?.status, card: b?.kanbanCardId, doneEv: dB.length });
    }
  }

  // ═══════════ FX รูปส่วนตัว X10 ═══════════
  console.log("\n── FX รูปส่วนตัว ──");
  {
    const j = await dorm.dormRepairJob(cTK, { unitId: DA, repairId: RP.tc1 });
    const row = await repairRow(RP.tc1);
    const fids = (Array.isArray(row?.files) ? row.files : []).map((f: any) => f.fileId);
    const urls: string[] = j?.ok ? [...j.job.photos, ...j.job.afterPhotos].map((x: any) => x.url) : [];
    const nowS = Math.floor(Date.now() / 1000);
    const bad: string[] = [];
    for (const u of urls) {
      const m = /^\/api\/files\/([a-z0-9]+)\?exp=(\d+)&sig=([0-9a-f]{64})$/i.exec(u);
      if (!m) { bad.push(`url ${u}`); continue; }
      if (!fids.includes(m[1])) bad.push("fileId ไม่ใช่ของแถว");
      if (!STO.privateFileSignatureOk(m[1], m[2], m[3], { kind: "STAFF", id: TK })) bad.push("เจ้าของลิงก์ไม่ผ่าน");
      for (const [who, v] of [["TK2", TK2], ["OWN", OWN], ["OWNB", OWNB]] as const) if (STO.privateFileSignatureOk(m[1], m[2], m[3], { kind: "STAFF", id: v })) bad.push(`${who} ผ่าน`);
      if (STO.privateFileSignatureOk(m[1], m[2], m[3], { kind: "CUSTOMER", id: TK })) bad.push("CUSTOMER id เดียวกันผ่าน");
      if (STO.privateFileSignatureOk(m[1], m[2], m[3], { kind: "STAFF", id: TK }, Number(m[2]) + 1)) bad.push("หมดอายุผ่าน");
      if (Number(m[2]) - nowS > 900) bad.push(`อายุ ${Number(m[2]) - nowS}s`);
      const other = fids.find((f: string) => f !== m[1]);
      if (other && STO.privateFileSignatureOk(other, m[2], m[3], { kind: "STAFF", id: TK })) bad.push("ลายเซ็นใช้ข้ามไฟล์");
    }
    const assets = fids.length ? await prisma.fileAsset.findMany({ where: { id: { in: fids } } }) : [];
    const pub = assets.filter((a: any) => !String(a.cdnUrl ?? "").startsWith("private://") || !String(a.path ?? "").includes("/private/"));
    const lst = await dorm.listDormRepairs(cTK, { unitId: DA, status: "ALL" });
    const lj = J(lst);
    const listLeak = /\/api\/files|private:|b-cdn|cdnUrl/.test(lj) || fids.some((f: string) => lj.includes(f)) || PHONES.some((p) => lj.includes(p)) || NAMES.some((n) => lj.includes(n));
    const view = await dorm.loadPortalRepairs(tok(L["1"]), { r: RP.tc1 }, { clientKey: CK("fx") });
    const vj = J(view);
    const viewLeak = /\/api\/files|private:|photo/i.test(vj) || fids.some((f: string) => vj.includes(f));
    const card = (await cardsOf(RP.tc1))[0];
    const cj = J(card);
    const cardLeak = fids.some((f: string) => cj.includes(f)) || /\/api\/files/.test(cj) || (card ? await prisma.kanbanAttachment.count({ where: { cardId: card.id } }) : 0) > 0;
    rec("FX-1", j?.ok && urls.length === 2 && !bad.length && assets.length === 2 && !pub.length, "CRITICAL", "รูปผู้เช่า+หลังซ่อม = ไฟล์ private · ลิงก์ผูกผู้ดู TK เท่านั้น (TK2/OWN/OWNB/CUSTOMER/หมดอายุ/ข้ามไฟล์ ไม่ผ่าน) · อายุ ≤ 900 วิ", { n: urls.length, bad: [...new Set(bad)], pub: pub.length });
    rec("FX-2", lst?.ok && view !== null && !listLeak && !viewLeak && !cardLeak, "CRITICAL", "รายการ/พอร์ทัล/การ์ด ไม่มีลิงก์ไฟล์/id ไฟล์/ชื่อเต็ม/เบอร์", { listLeak, viewLeak, cardLeak });
  }

  // ═══════════ JB อดอยาก ═══════════
  console.log("\n── JB อดอยาก ──");
  {
    // (ก) ตัวกวาดการ์ด: 600 คำแจ้ง DZ (ไม่มีบอร์ดตามหมวด — ถาวร) เก่ากว่า + งานดี 1 (DA · ไม่มีการ์ด) ใหม่สุด ⇒ รอบเดียวได้การ์ด
    const N = 600;
    const base = Date.now() - 2 * 86_400_000;
    const ab = Array.from({ length: N }, (_, i) => ({ id: `reppb16ab${SQLS}${String(i).padStart(4, "0")}`.slice(0, 40), tenantId: A, unitId: DZ, roomId: RM.z101, leaseId: L.z, partyId: P.z, category: "PLUMBING", text: "ค้างถาวร", status: "OPEN", createdAt: new Date(base + i * 1000) }));
    // + 600 ที่หมวดถูกลบไปแล้ว (หมวดไม่อยู่ในค่าตั้ง) ใน DA
    const ac = Array.from({ length: N }, (_, i) => ({ id: `reppb16ac${SQLS}${String(i).padStart(4, "0")}`.slice(0, 40), tenantId: A, unitId: DA, roomId: RM["103"], leaseId: L["3"], partyId: P["3"], category: "GONE_CAT", text: "หมวดหาย", status: "OPEN", createdAt: new Date(base + i * 1000) }));
    await prisma.dormRepair.createMany({ data: [...ab, ...ac] });
    const good = await prisma.dormRepair.create({ data: { id: `reppb16good${SQLS}`.slice(0, 40), tenantId: A, unitId: DA, roomId: RM["104"], leaseId: L["4"], partyId: P["4"], category: "ELECTRIC", text: "ไฟดับ งานดี", status: "OPEN", createdAt: new Date(Date.now() - 60_000) } });
    const t0 = Date.now();
    const r = await BR.sweepDormRepairCards(new Date(), { tenantId: A, budgetMs: 60_000 });
    const ms = Date.now() - t0;
    const gc = await cardsOf(good.id);
    const gr = await repairRow(good.id);
    rec("JB-1", gc.length === 1 && gr?.kanbanCardId === gc[0]?.id, "MAJOR", `ตัวกวาดการ์ด: ${N * 2} แถวค้างถาวร (ไม่มีบอร์ด/หมวดหาย) เก่ากว่า ⇒ งานดีได้การ์ดในรอบเดียว`, { r, ms, cards: gc.length });
    // งบหมด / signal ⇒ คืนเร็ว ไม่ throw
    const ac2 = new AbortController(); ac2.abort();
    const t1 = Date.now();
    const rA = await BR.sweepDormRepairCards(new Date(), { tenantId: A, budgetMs: 60_000, signal: ac2.signal });
    const rJ = await dorm.runDormRepairJobs(new Date(), { tenantId: A, budgetMs: 60_000, signal: ac2.signal });
    rec("JB-2", Date.now() - t1 < 5_000 && rA?.created === 0 && rJ?.resent === 0, "MINOR", "signal ถูกยกเลิก ⇒ ตัวกวาด/งานส่งซ้ำคืนทันที ไม่ทำงาน", { ms: Date.now() - t1, rA, rJ });
    await prisma.dormRepair.deleteMany({ where: { id: { in: [...ab, ...ac].map((x) => x.id) } } });
  }
  {
    // (ข) งานส่งซ้ำ: log FAILED/SKIPPED_QUIET 600 แถวที่ส่งไม่ได้ถาวร (งานหาย 200 · สัญญาจบ 200 · ไม่ DONE 200) เก่ากว่า + งานดี 1 ⇒ รอบเดียวส่ง 1 · แถวถาวรปิดเป็นสถานะจบ
    const N = 600;
    const base = Date.now() - 2 * 86_400_000;
    // 200 งาน DONE ของสัญญาจบ (L3) · 200 งาน OPEN (L2) · 200 คีย์ที่ไม่มีงาน
    const third = N / 3;
    const deadReps = Array.from({ length: third }, (_, i) => ({ id: `reppb16dd${SQLS}${String(i).padStart(4, "0")}`.slice(0, 40), tenantId: A, unitId: DA, roomId: RM["103"], leaseId: L["3"], partyId: P["3"], category: "PLUMBING", text: "สัญญาจบ", status: "DONE", doneAt: new Date() }));
    const openReps = Array.from({ length: third }, (_, i) => ({ id: `reppb16op${SQLS}${String(i).padStart(4, "0")}`.slice(0, 40), tenantId: A, unitId: DA, roomId: RM["102"], leaseId: L["2"], partyId: P["2"], category: "PLUMBING", text: "ยังไม่เสร็จ", status: "CANCELLED" }));
    await prisma.dormRepair.createMany({ data: [...deadReps, ...openReps] });
    const logs = Array.from({ length: N }, (_, i) => {
      const kind = i % 3, j = Math.floor(i / 3);
      const key = kind === 0 ? `rooms:repairDone:repnotexist${SQLS}${j}` : kind === 1 ? `rooms:repairDone:${deadReps[j].id}` : `rooms:repairDone:${openReps[j].id}`;
      return { id: `smlpb16${SQLS}${String(i).padStart(4, "0")}`.slice(0, 40), tenantId: A, unitId: DA, domain: "rooms", messageKey: "repairDone", dedupeKey: key, channel: "NONE", status: i % 2 ? "FAILED" : "SKIPPED_QUIET", partyId: P["2"], at: new Date(base + i * 1000) };
    });
    // งานดี: DONE · สัญญา live L4 · log FAILED ใหม่สุด
    const goodRep = await prisma.dormRepair.create({ data: { id: `reppb16gd2${SQLS}`.slice(0, 40), tenantId: A, unitId: DA, roomId: RM["104"], leaseId: L["4"], partyId: P["4"], category: "PLUMBING", text: "งานดีส่งซ้ำ", status: "DONE", doneAt: new Date() } });
    await prisma.serviceMessageLog.createMany({ data: [...logs, { id: `smlpb16good${SQLS}`.slice(0, 40), tenantId: A, unitId: DA, domain: "rooms", messageKey: "repairDone", dedupeKey: `rooms:repairDone:${goodRep.id}`, channel: "LINE", status: "FAILED", partyId: P["4"], at: new Date(Date.now() - 60_000) }] });
    const m0 = FAKE.length;
    const t0 = Date.now();
    const r = await dorm.runDormRepairJobs(new Date(), { tenantId: A, budgetMs: 60_000 });
    const ms = Date.now() - t0;
    const sent = pushesTo(C["4"], m0).length;
    const left = await prisma.serviceMessageLog.count({ where: { tenantId: A, id: { in: logs.map((x) => x.id) }, status: { in: ["FAILED", "SKIPPED_QUIET"] } } });
    const m1 = FAKE.length;
    const rs = await fanout("jobs", [[{ now: nowIso(), tenantId: A }, { now: nowIso(), tenantId: A }], [{ now: nowIso(), tenantId: A }]]);
    const again = pushesTo(C["4"], m1).length;
    rec("JB-3", sent === 1 && left === 0 && again === 0 && !badOf(rs).length, "MAJOR", `งานส่งซ้ำ: ${N} แถวส่งไม่ได้ถาวร (ไม่มีงาน/สัญญาจบ/ยกเลิก) เก่ากว่า ⇒ รอบเดียวส่งงานดี 1 · แถวถาวรปิดหมด · รันซ้อน 3 ทาง (2 โพรเซส) ไม่ส่งเพิ่ม`, { r, ms, sent, left, again, rs });
  }

  // ═══════════ DL 40P01 ═══════════
  console.log("\n── DL 40P01 ──");
  {
    const fn = `probe_d16_dl_${SQLS}`, sa = `probe_d16_sa_${SQLS}`, so = `probe_d16_so_${SQLS}`, sp = `probe_d16_sp_${SQLS}`, tg = `probe_d16_tg_${SQLS}`;
    for (const s of [sa, so, sp]) await prisma.$executeRawUnsafe(`CREATE SEQUENCE IF NOT EXISTS "${s}"`);
    await prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION "${fn}"() RETURNS trigger LANGUAGE plpgsql AS $f$
      BEGIN
        IF NEW."tenantId" = '${A}' THEN
          IF TG_OP = 'INSERT' AND NEW."text" = 'PROBEDLA' THEN PERFORM nextval('"${sa}"'); RAISE EXCEPTION 'deadlock detected (probe d16)' USING ERRCODE = '40P01'; END IF;
          IF TG_OP = 'INSERT' AND NEW."text" = 'PROBEDLO' THEN IF nextval('"${so}"') = 1 THEN RAISE EXCEPTION 'deadlock detected (probe d16)' USING ERRCODE = '40P01'; END IF; END IF;
          IF TG_OP = 'UPDATE' AND OLD."text" = 'PROBEDLP' AND NEW."status" = 'DONE' THEN PERFORM nextval('"${sp}"'); RAISE EXCEPTION 'deadlock detected (probe d16)' USING ERRCODE = '40P01'; END IF;
        END IF;
        RETURN NEW;
      END $f$`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER "${tg}" BEFORE INSERT OR UPDATE ON "DormRepair" FOR EACH ROW EXECUTE FUNCTION "${fn}"()`);
    dlInstalled = true;
    const cnt = async (s: string) => { const r: any[] = await prisma.$queryRawUnsafe(`SELECT last_value, is_called FROM "${s}"`); return r[0]?.is_called ? Number(r[0].last_value) : 0; };
    try {
      const f0 = await filesA();
      const ra = await submit(L["1"], "dl-a", { text: "PROBEDLA" });
      const rowA = await prisma.dormRepair.count({ where: { tenantId: A, text: "PROBEDLA" } });
      const f1 = await filesA();
      rec("DL-1", ra?.code === "BUSY" && (await cnt(sa)) === 2 && rowA === 0 && f1 === f0 && !BADRX.test(J(ra)), "MAJOR", "submit: 40P01 ทุกครั้ง ⇒ ลองซ้ำ 1 ครั้ง (2 ครั้งพอดี) แล้ว BUSY · ไม่มีแถว · รูปถูกลบ · ไม่หลุด", { r: ra, attempts: await cnt(sa), rowA, filesDelta: f1 - f0 });
      const ro = await submit(L["1"], "dl-o", { text: "PROBEDLO" });
      const evO = ro?.ok ? await outboxOf("dorm.repair.created", "repairId", ro.repairId) : [];
      rec("DL-2", ro?.ok === true && ro.replayed === false && (await cnt(so)) === 2 && evO.length === 1, "MAJOR", "submit: 40P01 ครั้งแรกครั้งเดียว ⇒ ลองซ้ำสำเร็จ · event 1", { r: codeOf(ro), attempts: await cnt(so), ev: evO.length });
      const rp = await submit(L["1"], "dl-p", { text: "PROBEDLP" });
      const f2 = await filesA();
      const pr = rp?.ok ? await dorm.completeDormRepair(cO, { unitId: DA, repairId: rp.repairId, afterPhotos: [png("dl-after")] }, { deps: noopDeps }) : null;
      const rowP = rp?.ok ? await repairRow(rp.repairId) : null;
      const f3 = await filesA();
      const evP = rp?.ok ? await outboxOf("dorm.repair.done", "repairId", rp.repairId) : [];
      rec("DL-3", pr?.code === "BUSY" && (await cnt(sp)) === 2 && rowP?.status === "OPEN" && f3 === f2 && evP.length === 0 && !BADRX.test(J(pr)), "MAJOR", "complete: 40P01 ทุกครั้ง ⇒ 2 ครั้งแล้ว BUSY · ยัง OPEN · รูปหลังซ่อมถูกลบ · ไม่มี event", { r: pr, attempts: await cnt(sp), status: rowP?.status, filesDelta: f3 - f2, ev: evP.length });
      // สะพานเรียก applyRepairCardState ภายใต้ 40P01 ⇒ ไม่ throw (changed false)
      let thrown = "";
      let st: any = null;
      try { st = rp?.ok ? await dorm.applyRepairCardState({ tenantId: A }, { repairId: rp.repairId, cardId: "cfakecard0000000000000000", state: "DONE" }) : null; } catch (e) { thrown = errMsg(e); }
      rec("DL-4", !thrown && st?.changed === false, "MINOR", "applyRepairCardState ภายใต้ 40P01 ⇒ ไม่ throw · changed false", { st, thrown });
    } finally {
      try { await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${tg}" ON "DormRepair"`); } catch (e) { console.log(`  ⚠️ drop trigger ${errMsg(e)}`); }
      try { await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${fn}"()`); } catch { /* */ }
      for (const s of [sa, so, sp]) { try { await prisma.$executeRawUnsafe(`DROP SEQUENCE IF EXISTS "${s}"`); } catch { /* */ } }
      dlInstalled = false;
    }
  }

  // ═══════════ M PII ใน payload/audit ═══════════
  {
    const evs = await prisma.outboxEvent.findMany({ where: { tenantId: { in: tenantIds }, type: { in: ["dorm.repair.created", "dorm.repair.done"] } } });
    const keysBad = evs.filter((e: any) => J(Object.keys(e.payload ?? {}).sort()) !== J(["category", "repairId", "roomId", "unitId"]));
    const aud = await prisma.auditLog.findMany({ where: { tenantId: { in: tenantIds }, action: { startsWith: "dorm.repair." } } });
    const blob = J(evs.map((e: any) => e.payload)) + J(aud.map((a: any) => [a.after, a.before]));
    const leak = [...NAMES, ...PHONES, ...TEXTS.slice(0, 50)].filter((x) => x && blob.includes(x));
    rec("M-1", evs.length > 0 && !keysBad.length && !leak.length, "MAJOR", "payload event ตรง 4 คีย์ · payload/audit ไม่มีชื่อ/เบอร์/ข้อความผู้เช่า", { evs: evs.length, keysBad: keysBad.length, leak: leak.slice(0, 3) });
  }
} catch (e) {
  console.log(`🔴 probe ล้ม: ${errMsg(e)}`);
  exitCode = 1;
} finally {
  if (dlInstalled) {
    try { await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "probe_d16_tg_${SQLS}" ON "DormRepair"`); await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "probe_d16_dl_${SQLS}"()`); } catch { /* */ }
  }
  await cleanup(tenantIds);
  try { await prisma.user.deleteMany({ where: { email: { startsWith: "svc-d16pb-" } } }); } catch { /* */ }
  try { await prisma.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE key LIKE $1`, `%pb16-${STAMP}%`); } catch { /* */ }
  const left = await prisma.tenant.count({ where: { slug: { startsWith: "qc-svc-d16pb-" } } });
  const trig: any[] = await prisma.$queryRawUnsafe(`SELECT tgname FROM pg_trigger WHERE tgname LIKE 'probe_d16_%'`);
  console.log(`(cleanup: tenant ค้าง ${left} · trigger ค้าง ${trig.length})`);
  const breach = results.filter((r) => !r.ok && r.sev !== "INFO");
  console.log(`PROBE_SUMMARY ${J({ total: results.length, hold: results.filter((r) => r.ok).length, breach: breach.map((r) => r.id), info: results.filter((r) => !r.ok && r.sev === "INFO").map((r) => r.id), cleanupLeft: left, triggersLeft: trig.length })}`);
  try { await prisma.$disconnect(); } catch { /* */ }
  server.close();
  process.exit(exitCode);
}
