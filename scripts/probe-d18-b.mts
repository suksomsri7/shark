// PROBE — SVC D.18 reviewer B (X1 ขอบเขต · X7 ลิงก์สาธารณะ · X10 รูปส่วนตัว + X3/X5 พร้อมกันหลายโพรเซส + 40P01) · ไม่ใช่ข้อสอบ · ไม่แก้ src
// รัน: bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/probe-d18-b.mts
// ข้อมูลใต้ร้าน `qc-svc-d18pb-*` + ผู้ใช้ `svc-d18pb-*@shark.local` · ไม่ยิง LINE จริง (ตัวจำลอง 127.0.0.1 + LINE_API_BASE) · ล้างใน finally
// หมวด: RC รับพร้อมกัน · PU รับของพร้อมกัน · TK token/rate · XS ข้ามร้าน/หน่วย/อาคาร · FX รูปส่วนตัว · JB เตือนค้าง · DL 40P01
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
loadSvcQcEnv("probe-d18-b");
if (process.env.CI || process.env.APP_ENV === "production") { console.error("🔴 probe: env ต้องห้าม"); process.exit(4); }
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 260);
const J = (x: unknown) => { try { return JSON.stringify(x); } catch { return String(x); } };
const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const pngB = (seed: string) => Uint8Array.from(Buffer.concat([Buffer.from(PNG_SIG), createHash("sha256").update(`pb18:${seed}`).digest()]));
const png = (seed: string) => ({ data: pngB(seed), contentType: "image/png" });
const noopDeps = { put: async () => {}, del: async () => 200 };
const b64 = (u: Uint8Array) => Buffer.from(u).toString("base64");
const unb64 = (s: string) => Uint8Array.from(Buffer.from(s, "base64"));
process.env.APP_URL = "https://qc-d18pb.invalid";

// ═══════════ โหมดลูก ═══════════
{
  const ix = process.argv.indexOf("--child");
  if (ix >= 0) {
    let out: unknown[] = [];
    try {
      const job = JSON.parse(Buffer.from(process.argv[ix + 1] ?? "", "base64url").toString("utf8")) as { op: string; items: any[]; at: number };
      const D = (await import("@/lib/modules/dorm" as string)) as any;
      const fileIn = (f: any) => (f ? { data: unb64(f.data), contentType: f.contentType } : undefined);
      const one = async (x: any) => {
        if (job.op === "receive") return D.receiveParcel(x.ctx, { ...x.input, photo: fileIn(x.input.photo) }, { now: new Date(x.now), deps: noopDeps });
        if (job.op === "pickup") {
          const proof = x.input.proof.kind === "SIGNATURE" ? { kind: "SIGNATURE", file: fileIn(x.input.proof.file) } : x.input.proof;
          return D.pickupParcel(x.ctx, { ...x.input, proof }, { now: new Date(x.now), deps: noopDeps });
        }
        if (job.op === "jobs") return D.runDormParcelJobs(new Date(x.now), { tenantId: x.tenantId });
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
const pushesTo = (ext: string, m = 0) => FAKE.slice(m).filter((r) => r.method === "POST" && r.path === "/v2/bot/message/push" && r.json?.to === ext);

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
const codeOf = (x: any) => (x?.threw ? "THREW" : x?.childFail ? "CHILD" : x === null ? "null" : x?.ok === true ? (x.replayed ? "OK_REPLAY" : "OK") : x?.code ?? J(x).slice(0, 40));
const tally = (rs: any[]) => { const t: Record<string, number> = {}; for (const x of rs) t[codeOf(x)] = (t[codeOf(x)] ?? 0) + 1; return t; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function fanout(op: string, groups: any[][], leadMs = 13_000): Promise<any[]> {
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

const { prisma } = (await import("@/lib/core/db" as string)) as { prisma: any };
const dorm: any = await import("@/lib/modules/dorm" as string);
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
const K = (k: string) => `pb18${STAMP}${k}`.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80);
const tenantIds: string[] = [];
let dlInstalled = false;
const T0 = "2026-09-01T03:00:00.000Z";
const dbDate = (ymd: string) => new Date(`${ymd}T00:00:00Z`);
let exitCode = 0;
try {
  const stale = await prisma.tenant.findMany({ where: { slug: { startsWith: "qc-svc-d18pb-" } }, select: { id: true } });
  if (stale.length) await cleanup(stale.map((t: { id: string }) => t.id));
  await prisma.user.deleteMany({ where: { email: { startsWith: "svc-d18pb-" } } });

  // ═══════════ fixtures ═══════════
  const mkTenant = async (tag: string) => { const t = await prisma.tenant.create({ data: { name: `PB D18 ${tag}`, slug: `qc-svc-d18pb-${tag}-${STAMP}` } }); tenantIds.push(t.id); return t.id as string; };
  const A = await mkTenant("a"), B = await mkTenant("b");
  const mkUnit = async (tenantId: string, tag: string, type = "DORM") => (await prisma.businessUnit.create({ data: { tenantId, type, name: `หอ PB18 ${tag}`, slug: `pb18${tag}-${STAMP}` } })).id as string;
  const DA = await mkUnit(A, "a"), DB = await mkUnit(B, "b"), NU = await mkUnit(A, "n", "SHOP");
  const mem: Record<string, string> = {};
  const mkUser = async (key: string, tenantId: string, role: string, unitAccess: string[], perms: string[] = []) => {
    const u = await prisma.user.create({ data: { email: `svc-d18pb-${STAMP}-${key}@shark.local`, name: `PB18 ${key}` } });
    const m = await prisma.membership.create({ data: { userId: u.id, tenantId, role, unitAccess, permissions: Object.fromEntries(perms.map((p) => [p, true])), acceptedAt: new Date() } });
    mem[key] = m.id;
    return u.id as string;
  };
  const setVal = async (tenantId: string, key: string, scopeId: string, value: unknown) => {
    await prisma.settingValue.deleteMany({ where: { tenantId, key, scope: "UNIT", scopeId } });
    await prisma.settingValue.create({ data: { tenantId, key, scope: "UNIT", scopeId, value: value === null ? PRISMA_NS.JsonNull : value, setById: "pb-d18" } });
  };
  const ty = async (t: string, u: string) => (await prisma.hotelRoomType.create({ data: { tenantId: t, unitId: u, name: "มาตรฐาน", capacity: 2, baseRateSatang: 450_000, depositSatang: 0, rentMode: "MONTHLY", areaSqm: 24 } })).id as string;
  const bld = async (t: string, u: string, name: string, s: number) => (await prisma.roomBuilding.create({ data: { tenantId: t, unitId: u, name, floors: 3, sortOrder: s } })).id as string;
  const RM: Record<string, string> = {};
  const room = async (t: string, u: string, tyId: string, b: string, n: string) => (await prisma.hotelRoom.create({ data: { tenantId: t, unitId: u, roomTypeId: tyId, number: n, buildingId: b, floorNo: 1, floor: "1" } })).id as string;
  const tyA = await ty(A, DA), tyB = await ty(B, DB);
  const B1 = await bld(A, DA, "อาคาร หนึ่ง", 1), B2 = await bld(A, DA, "อาคาร สอง", 2), BB = await bld(B, DB, "อาคาร บี", 1);
  for (const n of ["101", "102", "103", "104", "105"]) RM[n] = await room(A, DA, tyA, B1, n);
  RM["201"] = await room(A, DA, tyA, B2, "201");
  RM.b101 = await room(B, DB, tyB, BB, "101");
  const OWN = await mkUser("own", A, "OWNER", ["*"]);
  const PK = await mkUser("pk", A, "STAFF", [DA], ["dorm.view", "dorm.parcel.manage"]);
  const PK2 = await mkUser("pk2", A, "STAFF", [DA], ["dorm.view", "dorm.parcel.manage"]);
  const VW = await mkUser("vw", A, "STAFF", [DA], ["dorm.view"]);
  const OWNB = await mkUser("ownb", B, "OWNER", ["*"]);
  for (const [t, u] of [[A, DA], [B, DB]] as const) {
    await setVal(t, "messaging.quietHours", u, null);
    await setVal(t, "messaging.channelOrder", u, ["LINE", "WEB_LINK"]);
    await setVal(t, "rooms.parcel.enabled", u, true);
  }
  await setVal(A, "rooms.parcel.holdDays", DA, 3);
  await setVal(A, "rooms.access.managerScope", DA, "BUILDING");
  await setVal(A, "rooms.access.buildingAssignments", DA, { [mem.pk]: [B1], [mem.pk2]: [B1, B2], [mem.vw]: [B1] });
  const sysA = (await prisma.appSystem.create({ data: { tenantId: A, type: "CHAT", name: `pb18-chat-${STAMP}` } })).id;
  const sysB = (await prisma.appSystem.create({ data: { tenantId: B, type: "CHAT", name: `pb18-chat-b-${STAMP}` } })).id;
  const RAND = randomBytes(3).toString("hex");
  const mkConn = async (t: string, sys: string, tag: string) => (await prisma.chatChannelConnection.create({ data: { tenantId: t, systemId: sys, type: "LINE", displayName: `pb18-${tag}-${STAMP}`, externalAccountId: `pb18-${tag}-${STAMP}`, credentials: { channelAccessToken: `pb18tok${tag}${RAND}`, channelSecret: `pb18sec${tag}${RAND}` }, meta: { basicId: `@pb18${tag}` } } })).id as string;
  const OA1 = await mkConn(A, sysA, "a1"), OAB = await mkConn(B, sysB, "b");
  await setVal(A, "messaging.lineConnectionId", DA, OA1);
  await setVal(B, "messaging.lineConnectionId", DB, OAB);
  const NAMES: string[] = [], PHONES: string[] = [];
  const mkParty = async (t: string, name: string) => { const ph = `08${String(10_000_000 + Math.floor(Math.random() * 89_999_999))}`; NAMES.push(name); PHONES.push(ph); return (await prisma.party.create({ data: { tenantId: t, name, phone: ph } })).id as string; };
  const mkLease = async (t: string, u: string, roomId: string, partyId: string, status = "ACTIVE") => (await prisma.dormLease.create({ data: {
    tenantId: t, unitId: u, roomId, partyId, status, startDate: dbDate("2026-01-01"), endDate: dbDate("2027-12-31"), rentSatang: 450_000, commonFeeSatang: 0, depositSatang: 0, advanceRentSatang: 0, bookingFeeSatang: 0, signedAt: new Date(), createdById: "pb-d18",
    ...(status === "ENDED" ? { endedAt: new Date("2026-08-31T10:00:00Z"), endReason: "MOVE_OUT" } : {}) } })).id as string;
  const P: Record<string, string> = {}, L: Record<string, string> = {};
  for (const [k, n] of [["1", "ปรีชา ทดสอบหนึ่ง"], ["2", "กมลา ทดสอบสอง"], ["3", "สุรชัย ออกแล้ว"], ["4", "นภา ทดสอบสี่"], ["5", "ชาตรี ทดสอบห้า"], ["6", "อำไพ อาคารสอง"]] as const) P[k] = await mkParty(A, n);
  P.b = await mkParty(B, "ร้านบี คนเช่า");
  L["1"] = await mkLease(A, DA, RM["101"], P["1"]); L["2"] = await mkLease(A, DA, RM["102"], P["2"]); L["3"] = await mkLease(A, DA, RM["103"], P["3"], "ENDED");
  L["4"] = await mkLease(A, DA, RM["104"], P["4"]); L["5"] = await mkLease(A, DA, RM["105"], P["5"]); L["6"] = await mkLease(A, DA, RM["201"], P["6"]); L.b = await mkLease(B, DB, RM.b101, P.b);
  const C: Record<string, string> = {};
  for (const k of ["1", "2", "4", "5", "6"]) { const ext = `Upb18${k}${RAND}`; await prisma.chatContact.create({ data: { tenantId: A, systemId: sysA, channel: "LINE", channelConnectionId: OA1, externalUserId: ext, partyId: P[k], lang: "th" } }); C[k] = ext; }
  { const ext = `Upb18b${RAND}`; await prisma.chatContact.create({ data: { tenantId: B, systemId: sysB, channel: "LINE", channelConnectionId: OAB, externalUserId: ext, partyId: P.b, lang: "th" } }); C.b = ext; }

  const cO = { tenantId: A, actorUserId: OWN }, cPK = { tenantId: A, actorUserId: PK }, cPK2 = { tenantId: A, actorUserId: PK2 }, cVW = { tenantId: A, actorUserId: VW }, cB = { tenantId: B, actorUserId: OWNB };
  const park = () => prisma.$executeRawUnsafe(`UPDATE "OutboxEvent" SET "availableAt" = now() + interval '2 days' WHERE "tenantId" = ANY($1::text[]) AND status::text = 'PENDING'`, tenantIds);
  const recv = async (ctx: any, unitId: string, roomId: string, key: string, extra: Record<string, unknown> = {}, now = T0) => {
    const r = await dorm.receiveParcel(ctx, { unitId, roomId, carrier: "Flash", trackingNo: null, photo: png(key), idempotencyKey: K(key), ...extra }, { now: new Date(now), deps: noopDeps });
    await park();
    return r;
  };
  const files = (t = A) => prisma.fileAsset.count({ where: { tenantId: t } });
  const evts = async (type: string, parcelId: string) => (await prisma.outboxEvent.findMany({ where: { tenantId: { in: tenantIds }, type } })).filter((x: any) => x.payload?.parcelId === parcelId);
  const tokenOf = async (tenantId: string, parcelId: string) => { const u: string = await dorm.parcelPickupUrl({ tenantId }, { parcelId }); return /\/dp\/([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/.exec(u)?.[1] ?? ""; };
  const NF = J({ ok: false, code: "NOT_FOUND", reason: dorm.PARCEL_NF_REASON });
  let ck = 0;
  const view = (token: string) => dorm.loadParcelPickup(token, { clientKey: `pb18-${STAMP}-${++ck}` });

  // ═══════════ RC รับพร้อมกันหลายโพรเซส ═══════════
  console.log("\n── RC รับพร้อมกัน ──");
  for (const [id, tracking] of [["RC-1", null], ["RC-2", "TH12345PB18"]] as const) {
    const key = `rc${id}`;
    const f0 = await files();
    const item = { ctx: cO, now: T0, input: { unitId: DA, roomId: RM["105"], carrier: "Flash", trackingNo: tracking, photo: { data: b64(pngB(key)), contentType: "image/png" }, idempotencyKey: K(key) } };
    const rs = await fanout("receive", [0, 1, 2, 3].map(() => [item, item, item]));
    await park();
    const ids = [...new Set(rs.filter((x) => x?.ok).map((x) => x.parcelId))];
    const rows = ids.length ? await prisma.dormParcel.count({ where: { id: { in: ids } } }) : 0;
    const ev = ids[0] ? await evts("dorm.parcel.received", ids[0]) : [];
    const fresh = rs.filter((x) => x?.ok && x.replayed === false).length;
    const f1 = await files();
    rec(id, !badOf(rs).length && ids.length === 1 && rows === 1 && ev.length === 1 && fresh === 1 && f1 - f0 === 1, "CRITICAL",
      `receive ×12 (4 โพรเซส) คีย์เดียว${tracking ? " + เลขพัสดุ" : ""} ⇒ 1 แถว · 1 event · fresh 1 · รูปเหลือ 1`, { tally: tally(rs), ids: ids.length, rows, ev: ev.length, fresh, filesDelta: f1 - f0, bad: badOf(rs).slice(0, 2) });
    if (ids[0]) await prisma.dormParcel.update({ where: { id: ids[0] }, data: { status: "RETURNED" } }); // ปล่อยเลขพัสดุให้ข้อถัดไป
  }
  {
    const f0 = await files();
    const items = Array.from({ length: 12 }, (_, i) => ({ ctx: cO, now: T0, input: { unitId: DA, roomId: RM["105"], carrier: "Flash", trackingNo: "th 999-pb18", photo: { data: b64(pngB(`rc3${i}`)), contentType: "image/png" }, idempotencyKey: K(`rc3k${i}`) } }));
    const rs = await fanout("receive", [0, 1, 2, 3].map((g) => items.slice(g * 3, g * 3 + 3)));
    await park();
    const okN = rs.filter((x) => x?.ok).length, dupN = rs.filter((x) => x?.code === "DUPLICATE").length;
    const rows = await prisma.dormParcel.count({ where: { tenantId: A, trackingNo: "TH999-PB18", status: "WAITING" } });
    const f1 = await files();
    rec("RC-3", !badOf(rs).length && okN === 1 && dupN === 11 && rows === 1 && f1 - f0 === 1, "CRITICAL", "คนละคีย์ เลขพัสดุเดียวกัน (ปกติรูป) ×12 พร้อมกัน ⇒ ok 1 · DUPLICATE 11 · แถว 1 · รูปผู้แพ้ถูกลบ", { tally: tally(rs), rows, filesDelta: f1 - f0 });
  }
  {
    const ra = await recv(cO, DA, RM["101"], "same-across");
    const rb = await recv(cB, DB, RM.b101, "same-across");
    rec("RC-4", ra?.ok && rb?.ok && ra.parcelId !== rb.parcelId && !ra.replayed && !rb.replayed, "CRITICAL", "คีย์เดียวกัน คนละร้าน ⇒ id ไม่ชนกัน (ต่างแถว ไม่ replay ข้ามร้าน)", { a: codeOf(ra), b: codeOf(rb), same: ra?.parcelId === rb?.parcelId });
    // replay ข้ามอาคาร: PK2 รับห้อง 201 ด้วยคีย์ k · PK (อาคาร 1) ส่งคีย์เดียวกันกับห้อง 101 ⇒ ควรไม่ได้ parcelId ของอาคาร 2
    const r2 = await recv(cPK2, DA, RM["201"], "xbld-key");
    const r1 = await recv(cPK, DA, RM["101"], "xbld-key");
    const leak = r1?.ok && r1.parcelId === r2?.parcelId;
    rec("RC-5", !leak, "INFO", "คีย์รับซ้ำของผู้ดูแลอาคารอื่น ⇒ ไม่คืน parcelId นอกขอบเขต (คีย์มาจากเครื่องลูกข่าย — สุ่ม UUID)", { pk2: codeOf(r2), pk: codeOf(r1), leak });
  }

  // ═══════════ PU รับของพร้อมกัน (สแกน + เซ็นผสม) ═══════════
  console.log("\n── PU รับของพร้อมกัน ──");
  const pu = await recv(cO, DA, RM["101"], "pu1");
  const puTok = pu?.ok ? await tokenOf(A, pu.parcelId) : "";
  {
    const f0 = await files();
    const mk = (i: number) => {
      const kind = i % 3;
      const proof = kind === 0 ? { kind: "SCAN", token: `https://qc-d18pb.invalid/dp/${puTok}` } : kind === 1 ? { kind: "SCAN", token: puTok } : { kind: "SIGNATURE", file: { data: b64(pngB(`sig${i}`)), contentType: "image/png" } };
      return { ctx: i % 2 ? cO : cPK, now: T0, input: { unitId: DA, parcelId: kind === 2 ? pu.parcelId : null, proof } };
    };
    const rs = await fanout("pickup", [0, 1, 2, 3].map((g) => [0, 1, 2].map((j) => mk(g * 3 + j))));
    const okRs = rs.filter((x) => x?.ok);
    const lose = rs.filter((x) => x?.code === "ALREADY_PICKED_UP").length;
    const row = pu?.ok ? await prisma.dormParcel.findUnique({ where: { id: pu.parcelId } }) : null;
    const ev = pu?.ok ? await evts("dorm.parcel.picked_up", pu.parcelId) : [];
    const f1 = await files();
    const wantFiles = okRs[0]?.method === "SIGNATURE" ? 1 : 0;
    rec("PU-1", !!puTok && !badOf(rs).length && okRs.length === 1 && lose === 11 && row?.status === "PICKED_UP" && ev.length === 1 && f1 - f0 === wantFiles && (wantFiles ? !!row?.signatureFileId : !row?.signatureFileId), "CRITICAL",
      "pickup ×12 (4 โพรเซส · สแกน URL/token + เซ็น) ⇒ สำเร็จ 1 · ALREADY_PICKED_UP 11 · 1 event · ลายเซ็นผู้แพ้ถูกลบ", { tally: tally(rs), method: okRs[0]?.method, ev: ev.length, filesDelta: f1 - f0, wantFiles, sig: !!row?.signatureFileId });
    const v = await view(puTok);
    const again = await dorm.pickupParcel(cO, { unitId: DA, proof: { kind: "SCAN", token: puTok } }, { deps: noopDeps });
    rec("PU-2", v === null && again?.code === "ALREADY_PICKED_UP", "CRITICAL", "token ที่ใช้แล้ว ⇒ หน้าสาธารณะ null · สแกนซ้ำ ⇒ ALREADY_PICKED_UP (ข้อยกเว้นพนักงานที่เห็นพัสดุ)", { view: v === null ? "null" : "VIEW", again: codeOf(again) });
  }

  // ═══════════ TK token ผิดทุกแบบ + rate limit ═══════════
  console.log("\n── TK token ──");
  const tk = await recv(cO, DA, RM["102"], "tk1", { trackingNo: "KERRY0000PB18LAST" });
  const good = tk?.ok ? await tokenOf(A, tk.parcelId) : "";
  {
    const v = await view(good);
    const j = J(v);
    const leak = [tk?.parcelId, L["2"], P["2"], RM["102"], A, DA, "/api/files", "private", "KERRY0000PB18LAST", ...NAMES, ...PHONES].filter((x) => x && j.includes(x));
    rec("TK-0", v !== null && !leak.length && v.trackingLast4 === "LAST" && /^data:image\/svg\+xml;base64,/.test(v.qrSvgDataUrl), "MAJOR", "ตัวควบคุม: token ดี ⇒ มีหน้า · ไม่มี id/ชื่อ/เบอร์/รูป/เลขพัสดุเต็ม", { ok: v !== null, leak, keys: v ? Object.keys(v) : null });
  }
  {
    const [p, s] = good.split(".");
    const flip = (x: string, i: number) => x.slice(0, i) + (x[i] === "A" ? "B" : "A") + x.slice(i + 1);
    const tb = await recv(cB, DB, RM.b101, "tk-b");
    const rp = await recv(cO, DA, RM["104"], "tk-ret");
    const rpTok = rp?.ok ? await tokenOf(A, rp.parcelId) : "";
    if (rp?.ok) await dorm.returnParcel(cO, { unitId: DA, parcelId: rp.parcelId, reason: "ตีกลับทดสอบ probe" });
    const le = await recv(cO, DA, RM["105"], "tk-le");
    const leTok = le?.ok ? await tokenOf(A, le.parcelId) : "";
    let expTok = "";
    try { expTok = SL.signLink({ tenantId: A, purpose: "dorm.parcel", subjectId: tk.parcelId, expMin: 1 }); } catch { /* */ }
    const variants: Record<string, string> = {
      tamperPayload: `${flip(p, 5)}.${s}`,
      tamperSig: `${p}.${flip(s, 3)}`,
      truncated: good.slice(0, -4),
      extraDot: `${good}.x`,
      empty: "",
      garbage: "../../etc/passwd",
      otherPurpose: SL.signLink({ tenantId: A, purpose: "dorm.portal", subjectId: tk.parcelId, expMin: 60 }),
      otherTenant: SL.signLink({ tenantId: B, purpose: "dorm.parcel", subjectId: tk.parcelId, expMin: 60 }),
      unknownSubject: SL.signLink({ tenantId: A, purpose: "dorm.parcel", subjectId: "pclnotexist0000000000000000", expMin: 60 }),
      used: puTok,
      returned: rpTok,
    };
    // สัญญาจบหลังออก token
    await prisma.dormLease.update({ where: { id: L["5"] }, data: { status: "ENDED", endedAt: new Date("2026-09-02T00:00:00Z"), endReason: "MOVE_OUT" } });
    variants.leaseEnded = leTok;
    const pub: Record<string, string> = {};
    for (const [k, t] of Object.entries(variants)) pub[k] = (await view(t)) === null ? "null" : "VIEW";
    // หมดอายุ: เลื่อนนาฬิกาในโพรเซส +61 วิ
    const realNow = Date.now;
    try { Date.now = () => realNow() + 61_000; pub.expired = (await view(expTok)) === null ? "null" : "VIEW"; } finally { Date.now = realNow; }
    const allNull = Object.values(pub).every((x) => x === "null");
    rec("TK-1", allNull && !!expTok, "CRITICAL", "หน้าสาธารณะ: ปลอม/ตัดท้าย/purpose อื่น/ร้านอื่น/ไม่มีพัสดุ/ใช้แล้ว/ตีกลับ/สัญญาจบ/หมดอายุ ⇒ null เดียวกันทุกแบบ", pub);
    // สแกนด้วย token ผิด ⇒ NOT_FOUND ทุกไบต์ (ยกเว้น used = ALREADY_PICKED_UP · returned = BAD_STATE)
    const scan: Record<string, string> = {};
    const exempt: Record<string, string> = { used: "ALREADY_PICKED_UP", returned: "BAD_STATE" };
    const badScan: string[] = [];
    for (const [k, t] of Object.entries(variants)) {
      const r = await dorm.pickupParcel(cO, { unitId: DA, proof: { kind: "SCAN", token: t } }, { deps: noopDeps });
      scan[k] = codeOf(r);
      if (exempt[k] ? r?.code !== exempt[k] : J(r) !== NF) badScan.push(`${k}:${J(r).slice(0, 80)}`);
    }
    // token ของร้าน B สแกนบนหน่วยร้าน A / token ร้าน A สแกนบน DB โดยเจ้าของ B
    const tbTok = tb?.ok ? await tokenOf(B, tb.parcelId) : "";
    const x1 = await dorm.pickupParcel(cO, { unitId: DA, proof: { kind: "SCAN", token: tbTok } }, { deps: noopDeps });
    const x2 = await dorm.pickupParcel(cB, { unitId: DB, proof: { kind: "SCAN", token: good } }, { deps: noopDeps });
    const x3 = await dorm.pickupParcel(cO, { unitId: DA, parcelId: rp?.parcelId, proof: { kind: "SCAN", token: good } }, { deps: noopDeps }); // parcelId ไม่ตรง subject
    for (const [k, r] of [["tokenB@DA", x1], ["tokenA@DB", x2], ["parcelIdMismatch", x3]] as const) { scan[k] = codeOf(r); if (J(r) !== NF) badScan.push(`${k}:${J(r).slice(0, 80)}`); }
    rec("TK-2", !badScan.length && !!tbTok, "CRITICAL", "สแกน token ผิดทุกแบบ/ข้ามร้าน/parcelId ไม่ตรง ⇒ NOT_FOUND ทุกไบต์ (ข้อยกเว้นตามใบ: ใช้แล้ว/ตีกลับ)", { scan, badScan });
    const still = await prisma.dormParcel.findUnique({ where: { id: tk.parcelId } });
    rec("TK-3", still?.status === "WAITING", "CRITICAL", "หลังยิง token ผิดทั้งหมด พัสดุจริงยัง WAITING", still?.status);
  }
  {
    const key = `pb18-${STAMP}-rl`;
    let nullN = 0;
    for (let i = 0; i < 120; i++) if ((await dorm.loadParcelPickup(`garbage${i}`, { clientKey: key })) === null) nullN++;
    const over = await dorm.loadParcelPickup(good, { clientKey: key });
    const ctrl = await dorm.loadParcelPickup(good, { clientKey: `${key}-ctrl` });
    rec("TK-4", nullN === 120 && over === null && ctrl !== null, "CRITICAL", "rate limit ก่อนตรวจ token: 120 ครั้ง token ขยะนับด้วย ⇒ ครั้งที่ 121 token ดียังได้ null · คีย์อื่นได้หน้า", { nullN, over: over === null ? "null" : "VIEW", ctrl: ctrl === null ? "null" : "VIEW" });
  }

  // ═══════════ XS ข้ามร้าน/หน่วย/อาคาร ═══════════
  console.log("\n── XS ข้ามร้าน/หน่วย/อาคาร ──");
  {
    const z = await recv(cO, DA, RM["201"], "xs-z");
    const zTok = z?.ok ? await tokenOf(A, z.parcelId) : "";
    const bP = await prisma.dormParcel.findFirst({ where: { tenantId: B, status: "WAITING" } });
    const cases: [string, () => Promise<unknown>][] = [
      ["list OWNB@DA", () => dorm.listParcels(cB, { unitId: DA })],
      ["list OWN-A@DB", () => dorm.listParcels(cO, { unitId: DB })],
      ["list OWN@non-DORM", () => dorm.listParcels(cO, { unitId: NU })],
      ["list OWN@random", () => dorm.listParcels(cO, { unitId: "cnotaunit000000000000000" })],
      ["list VW(no perm)", () => dorm.listParcels(cVW, { unitId: DA })],
      ["recv PK@201(อาคาร2)", () => recv(cPK, DA, RM["201"], "xs-r1")],
      ["recv OWN@DA room-of-B", () => recv(cO, DA, RM.b101, "xs-r2")],
      ["recv OWNB@DA", () => recv(cB, DA, RM["101"], "xs-r3")],
      ["recv OWN@DB", () => recv(cO, DB, RM.b101, "xs-r4")],
      ["sign PK@201", () => dorm.pickupParcel(cPK, { unitId: DA, parcelId: z.parcelId, proof: { kind: "SIGNATURE", file: png("x") } }, { deps: noopDeps })],
      ["sign OWN@DA parcel-of-B", () => dorm.pickupParcel(cO, { unitId: DA, parcelId: bP?.id, proof: { kind: "SIGNATURE", file: png("x") } }, { deps: noopDeps })],
      ["sign OWNB@DA", () => dorm.pickupParcel(cB, { unitId: DA, parcelId: z.parcelId, proof: { kind: "SIGNATURE", file: png("x") } }, { deps: noopDeps })],
      ["scan PK token-201", () => dorm.pickupParcel(cPK, { unitId: DA, proof: { kind: "SCAN", token: zTok } }, { deps: noopDeps })],
      ["return PK@201", () => dorm.returnParcel(cPK, { unitId: DA, parcelId: z.parcelId, reason: "ทดสอบข้ามอาคาร" })],
      ["return OWNB@DA", () => dorm.returnParcel(cB, { unitId: DA, parcelId: z.parcelId, reason: "ทดสอบข้ามร้าน" })],
      ["return OWN@DA parcel-of-B", () => dorm.returnParcel(cO, { unitId: DA, parcelId: bP?.id, reason: "ทดสอบข้ามร้าน" })],
      ["return OWN@DA bad-id", () => dorm.returnParcel(cO, { unitId: DA, parcelId: "x'; DROP TABLE x;--", reason: "ทดสอบรหัสแปลก" })],
    ];
    const bad: string[] = [];
    const got: Record<string, string> = {};
    for (const [k, f] of cases) { let r: unknown; try { r = await f(); } catch (e) { r = { threw: errMsg(e) }; } got[k] = codeOf(r); if (J(r) !== NF) bad.push(`${k}: ${J(r).slice(0, 100)}`); }
    const zRow = z?.ok ? await prisma.dormParcel.findUnique({ where: { id: z.parcelId } }) : null;
    const ctl = await dorm.listParcels(cPK2, { unitId: DA });
    const pkList = await dorm.listParcels(cPK, { unitId: DA, status: "ALL" });
    const pkSees201 = pkList?.ok && pkList.rows.some((r: any) => r.roomId === RM["201"]);
    const pkCount = pkList?.ok ? pkList.counts : null;
    const ctrlOk = ctl?.ok && ctl.rows.some((r: any) => r.parcelId === z.parcelId);
    rec("XS-1", !bad.length && zRow?.status === "WAITING" && !!zTok, "CRITICAL", "ข้ามร้าน/ไม่ใช่หอ/ไม่มีสิทธิ์/นอกอาคาร ⇒ NOT_FOUND ทุกไบต์ทุกฟังก์ชัน · พัสดุอาคาร 2 ไม่เปลี่ยน", { got, bad });
    const waitingTotal = await prisma.dormParcel.count({ where: { tenantId: A, unitId: DA, status: "WAITING" } });
    const waitingB1 = await prisma.dormParcel.count({ where: { tenantId: A, unitId: DA, status: "WAITING", roomId: { not: RM["201"] } } });
    rec("XS-2", ctrlOk && !pkSees201 && pkCount?.waiting === waitingB1 && waitingTotal > waitingB1, "CRITICAL", "ขอบเขตอาคาร: PK ไม่เห็นแถว/นับห้อง 201 (rows + counts) · ตัวควบคุม PK2 เห็น", { ctrlOk, pkSees201, pkWaiting: pkCount?.waiting, waitingB1, waitingTotal });
    // ถอนสิทธิ์สด: เอา dorm.parcel.manage ออกจาก PK ⇒ NOT_FOUND ทันที
    await prisma.membership.update({ where: { id: mem.pk }, data: { permissions: { "dorm.view": true } } });
    const revoked = await dorm.listParcels(cPK, { unitId: DA });
    await prisma.membership.update({ where: { id: mem.pk }, data: { permissions: { "dorm.view": true, "dorm.parcel.manage": true } } });
    rec("XS-3", J(revoked) === NF, "MAJOR", "ถอนสิทธิ์ dorm.parcel.manage ⇒ ผลสดทันที NOT_FOUND ทุกไบต์", codeOf(revoked));
  }

  // ═══════════ FX รูปส่วนตัว X10 ═══════════
  console.log("\n── FX รูปส่วนตัว ──");
  {
    const lst = await dorm.listParcels(cPK, { unitId: DA, status: "ALL" });
    const nowS = Math.floor(Date.now() / 1000);
    const bad: string[] = [];
    let n = 0;
    for (const r of lst?.ok ? lst.rows : []) {
      if (!r.photoUrl) continue;
      n++;
      const m = /^\/api\/files\/([a-z0-9]+)\?exp=(\d+)&sig=([0-9a-f]{64})$/i.exec(r.photoUrl);
      if (!m) { bad.push(`url ${r.photoUrl}`); continue; }
      const row = await prisma.dormParcel.findUnique({ where: { id: r.parcelId } });
      if (row?.photoFileId !== m[1]) bad.push("fileId ไม่ตรงแถว");
      if (!STO.privateFileSignatureOk(m[1], m[2], m[3], { kind: "STAFF", id: PK })) bad.push("ผู้ดูเจ้าของลิงก์ไม่ผ่าน");
      for (const [who, v] of [["PK2", PK2], ["OWN", OWN], ["OWNB", OWNB]] as const) if (STO.privateFileSignatureOk(m[1], m[2], m[3], { kind: "STAFF", id: v })) bad.push(`${who} ผ่าน`);
      if (STO.privateFileSignatureOk(m[1], m[2], m[3], { kind: "CUSTOMER", id: PK })) bad.push("CUSTOMER id เดียวกันผ่าน");
      if (STO.privateFileSignatureOk(m[1], m[2], m[3], { kind: "STAFF", id: PK }, Number(m[2]) + 1)) bad.push("หมดอายุผ่าน");
      if (Number(m[2]) - nowS > 900) bad.push(`อายุ ${Number(m[2]) - nowS}s`);
      // ลายเซ็นไฟล์หนึ่งใช้กับไฟล์อื่นไม่ได้
      const other = await prisma.dormParcel.findFirst({ where: { tenantId: A, photoFileId: { not: m[1] } } });
      if (other?.photoFileId && STO.privateFileSignatureOk(other.photoFileId, m[2], m[3], { kind: "STAFF", id: PK })) bad.push("ลายเซ็นใช้ข้ามไฟล์");
    }
    const j = J(lst);
    if (/private:\/\/|\/private\/|cdnUrl|b-cdn|storagePath/i.test(j)) bad.push("DTO มี path/cdn");
    if (PHONES.some((p) => j.includes(p)) || NAMES.some((nm) => j.includes(nm))) bad.push("DTO มีเบอร์/ชื่อเต็ม");
    rec("FX-1", lst?.ok && n >= 3 && !bad.length, "CRITICAL", "photoUrl ผูกผู้ดู PK เท่านั้น (คนอื่น/ลูกค้า/หมดอายุ/ข้ามไฟล์ ไม่ผ่าน) · อายุ ≤ 900 วิ · ไม่มี path · ไม่มีเบอร์/ชื่อเต็ม", { n, bad: [...new Set(bad)] });
    // ช่องทางไม่มีรูป: หน้าสาธารณะ · postback · ข้อความ LINE
    const m0 = FAKE.length;
    const notice = await dorm.sendParcelNotice({ tenantId: A }, { parcelId: tk.parcelId }, { now: new Date(T0) });
    const msgs = J(pushesTo(C["2"], m0).map((x) => x.json));
    const pb = await dorm.parcelsForLeases({ tenantId: A }, [{ id: L["2"], unitId: DA }]);
    const v = await view(good);
    const leaks = [["line", msgs], ["postback", J(pb)], ["view", J(v)]].filter(([, s]) => /\/api\/files|photo|private:/i.test(s as string));
    const tkRow = await prisma.dormParcel.findUnique({ where: { id: tk.parcelId } });
    const fileLeak = [["line", msgs], ["postback", J(pb)], ["view", J(v)]].filter(([, s]) => tkRow?.photoFileId && (s as string).includes(tkRow.photoFileId));
    const phoneLeak = [msgs, J(pb), J(v)].some((s) => PHONES.some((p) => s.includes(p)) || NAMES.some((nm) => s.includes(nm)));
    rec("FX-2", notice?.status === "SENT" && msgs.includes("/dp/") && pb?.items?.length === 1 && v !== null && !leaks.length && !fileLeak.length && !phoneLeak, "CRITICAL",
      "LINE/postback/หน้าสาธารณะ ไม่มีรูป/ไฟล์ id/ชื่อ/เบอร์ (มีแต่ลิงก์ /dp)", { notice: notice?.status, pbItems: pb?.items?.length, leaks: leaks.map((x) => x[0]), fileLeak: fileLeak.map((x) => x[0]), phoneLeak });
    // postback ของคนอื่น: สัญญาของ P1 ⇒ ไม่เห็นพัสดุของห้อง 102
    const pbOther = await dorm.parcelsForLeases({ tenantId: A }, [{ id: L["1"], unitId: DA }]);
    const pbCross = await dorm.parcelsForLeases({ tenantId: B }, [{ id: L["2"], unitId: DA }]);
    rec("FX-3", !J(pbOther).includes(tk.parcelId) && pbOther.items.every((x: any) => x.roomNumber !== "102") && pbCross.items.length === 0, "MAJOR", "postback: สัญญาคนอื่น/ร้านอื่น ⇒ ไม่เห็นพัสดุห้อง 102", { other: pbOther.items.map((x: any) => x.roomNumber), cross: pbCross });
  }

  // ═══════════ JB เตือนค้าง ═══════════
  console.log("\n── JB เตือนค้าง ──");
  {
    // พัสดุ tk (ห้อง 102 · รับ 1 ก.ย. · holdDays 3) ⇒ ค้างตั้งแต่ 4 ก.ย.
    const m0 = FAKE.length;
    const at = "2026-09-05T03:00:00.000Z";
    const rs = await fanout("jobs", [[{ now: at, tenantId: A }, { now: at, tenantId: A }], [{ now: at, tenantId: A }, { now: at, tenantId: A }]]);
    const p1 = pushesTo(C["2"], m0).length;
    const row = await prisma.dormParcel.findUnique({ where: { id: tk.parcelId } });
    rec("JB-1", !badOf(rs).length && p1 === 1 && row?.remindCount === 1, "CRITICAL", "runDormParcelJobs ×4 ซ้อน (2 โพรเซส) วันเดียว ⇒ ข้อความเตือน 1 · remindCount 1", { rs: rs.map((x) => J(x)), pushes: p1, remindCount: row?.remindCount });
    const m1 = FAKE.length;
    const again = await dorm.runDormParcelJobs(new Date("2026-09-05T09:00:00.000Z"), { tenantId: A });
    rec("JB-2", pushesTo(C["2"], m1).length === 0, "CRITICAL", "วันเดียวกันรอบหลัง ⇒ ไม่ส่งเพิ่ม", { again, pushes: pushesTo(C["2"], m1).length });
    await setVal(A, "messaging.quietHours", DA, { start: "21:00", end: "08:00" });
    try {
      const m2 = FAKE.length;
      await dorm.runDormParcelJobs(new Date("2026-09-06T15:00:00.000Z"), { tenantId: A }); // 22:00 ไทย 6 ก.ย.
      const q = pushesTo(C["2"], m2).length;
      const m3 = FAKE.length;
      await dorm.runDormParcelJobs(new Date("2026-09-07T01:05:00.000Z"), { tenantId: A }); // 08:05 ไทย 7 ก.ย.
      await dorm.runDormParcelJobs(new Date("2026-09-07T01:10:00.000Z"), { tenantId: A });
      const after = pushesTo(C["2"], m3).length;
      const logs = await prisma.serviceMessageLog.findMany({ where: { tenantId: A, dedupeKey: { startsWith: `rooms:parcelReminder:${tk.parcelId}:` } }, select: { dedupeKey: true, status: true } });
      rec("JB-3", q === 0 && after === 1 && !logs.some((l: any) => l.dedupeKey.endsWith("20260906") && l.status === "SENT"), "MAJOR", "เวลาเงียบ: 22:00 ไม่ส่ง · 08:05 วันถัดไปส่ง 1 (ไม่ส่งย้อนของวันที่เงียบ)", { quiet: q, after, logs });
    } finally { await setVal(A, "messaging.quietHours", DA, null); }
  }
  {
    // คอขวด: พัสดุ WAITING ที่ส่งไม่ได้ถาวร (สัญญาจบแล้ว · ห้อง 103) 500 ชิ้นที่เก่ากว่า ⇒ พัสดุที่ถึงเวลาเตือนจริงถูกบังหรือไม่
    const N = 500;
    const ab = Array.from({ length: N }, (_, i) => ({ id: `pclpb18ab${SQLS}${String(i).padStart(4, "0")}`.slice(0, 40), tenantId: A, unitId: DA, roomId: RM["103"], leaseId: L["3"], partyId: P["3"], carrier: "old", status: "WAITING", receivedAt: new Date(Date.UTC(2026, 0, 2, 0, 0, i % 60, 0) + i * 60_000), receivedById: OWN }));
    await prisma.dormParcel.createMany({ data: ab });
    const m0 = FAKE.length;
    const t0 = Date.now();
    const r = await dorm.runDormParcelJobs(new Date("2026-09-08T03:00:00.000Z"), { tenantId: A });
    const ms = Date.now() - t0;
    const sent = pushesTo(C["2"], m0).length;
    await prisma.dormParcel.deleteMany({ where: { id: { in: ab.map((x) => x.id) } } });
    const m1 = FAKE.length;
    const r2 = await dorm.runDormParcelJobs(new Date("2026-09-08T03:30:00.000Z"), { tenantId: A });
    const ctrl = pushesTo(C["2"], m1).length;
    rec("JB-4", sent === 1, "MAJOR", `พัสดุค้างที่ส่งไม่ได้ (สัญญาจบ) ${N} ชิ้นเก่ากว่า ⇒ พัสดุที่ถึงกำหนดยังได้เตือน (ตัวควบคุม: ลบ ${N} ชิ้นแล้วส่ง)`, { sentWithBacklog: sent, r, ms, ctrlAfterDelete: ctrl, r2 });
  }

  // ═══════════ DL 40P01 ═══════════
  console.log("\n── DL 40P01 ──");
  {
    const fn = `probe_d18_dl_${SQLS}`, sa = `probe_d18_sa_${SQLS}`, so = `probe_d18_so_${SQLS}`, sp = `probe_d18_sp_${SQLS}`, tg = `probe_d18_tg_${SQLS}`;
    for (const s of [sa, so, sp]) await prisma.$executeRawUnsafe(`CREATE SEQUENCE IF NOT EXISTS "${s}"`);
    await prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION "${fn}"() RETURNS trigger LANGUAGE plpgsql AS $f$
      BEGIN
        IF NEW."tenantId" = '${A}' THEN
          IF TG_OP = 'INSERT' AND NEW."carrier" = 'PROBEDLA' THEN PERFORM nextval('"${sa}"'); RAISE EXCEPTION 'deadlock detected (probe d18)' USING ERRCODE = '40P01'; END IF;
          IF TG_OP = 'INSERT' AND NEW."carrier" = 'PROBEDLO' THEN IF nextval('"${so}"') = 1 THEN RAISE EXCEPTION 'deadlock detected (probe d18)' USING ERRCODE = '40P01'; END IF; END IF;
          IF TG_OP = 'UPDATE' AND OLD."carrier" = 'PROBEDLP' AND NEW."status" = 'PICKED_UP' THEN PERFORM nextval('"${sp}"'); RAISE EXCEPTION 'deadlock detected (probe d18)' USING ERRCODE = '40P01'; END IF;
        END IF;
        RETURN NEW;
      END $f$`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER "${tg}" BEFORE INSERT OR UPDATE ON "DormParcel" FOR EACH ROW EXECUTE FUNCTION "${fn}"()`);
    dlInstalled = true;
    const cnt = async (s: string) => { const r: any[] = await prisma.$queryRawUnsafe(`SELECT last_value, is_called FROM "${s}"`); return r[0]?.is_called ? Number(r[0].last_value) : 0; };
    try {
      const f0 = await files();
      const ra = await recv(cO, DA, RM["104"], "dl-a", { carrier: "PROBEDLA" });
      const rowA = await prisma.dormParcel.count({ where: { tenantId: A, carrier: "PROBEDLA" } });
      const f1 = await files();
      rec("DL-1", ra?.code === "BUSY" && (await cnt(sa)) === 2 && rowA === 0 && f1 === f0 && !BADRX.test(J(ra)), "MAJOR", "receive: 40P01 ทุกครั้ง ⇒ ลองซ้ำ 1 ครั้ง (2 ครั้งพอดี) แล้ว BUSY · ไม่มีแถว · รูปถูกลบ · ไม่หลุด", { r: ra, attempts: await cnt(sa), rowA, filesDelta: f1 - f0 });
      const ro = await recv(cO, DA, RM["104"], "dl-o", { carrier: "PROBEDLO" });
      const evO = ro?.ok ? await evts("dorm.parcel.received", ro.parcelId) : [];
      rec("DL-2", ro?.ok === true && ro.replayed === false && (await cnt(so)) === 2 && evO.length === 1, "MAJOR", "receive: 40P01 ครั้งแรกครั้งเดียว ⇒ ลองซ้ำสำเร็จ · event 1", { r: codeOf(ro), attempts: await cnt(so), ev: evO.length });
      const rp = await recv(cO, DA, RM["104"], "dl-p", { carrier: "PROBEDLP" });
      const f2 = await files();
      const pr = rp?.ok ? await dorm.pickupParcel(cO, { unitId: DA, parcelId: rp.parcelId, proof: { kind: "SIGNATURE", file: png("dlsig") } }, { deps: noopDeps }) : null;
      const rowP = rp?.ok ? await prisma.dormParcel.findUnique({ where: { id: rp.parcelId } }) : null;
      const f3 = await files();
      const evP = rp?.ok ? await evts("dorm.parcel.picked_up", rp.parcelId) : [];
      rec("DL-3", pr?.code === "BUSY" && (await cnt(sp)) === 2 && rowP?.status === "WAITING" && f3 === f2 && evP.length === 0, "MAJOR", "pickup: 40P01 ทุกครั้ง ⇒ 2 ครั้งแล้ว BUSY · ยัง WAITING · ลายเซ็นถูกลบ · ไม่มี event", { r: pr, attempts: await cnt(sp), status: rowP?.status, filesDelta: f3 - f2, ev: evP.length });
    } finally {
      try { await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${tg}" ON "DormParcel"`); } catch (e) { console.log(`  ⚠️ drop trigger ${errMsg(e)}`); }
      try { await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${fn}"()`); } catch { /* */ }
      for (const s of [sa, so, sp]) { try { await prisma.$executeRawUnsafe(`DROP SEQUENCE IF EXISTS "${s}"`); } catch { /* */ } }
      dlInstalled = false;
    }
  }
} catch (e) {
  console.log(`🔴 probe ล้ม: ${errMsg(e)}`);
  exitCode = 1;
} finally {
  if (dlInstalled) {
    try { await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "probe_d18_tg_${SQLS}" ON "DormParcel"`); await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "probe_d18_dl_${SQLS}"()`); } catch { /* */ }
  }
  await cleanup(tenantIds);
  try { await prisma.user.deleteMany({ where: { email: { startsWith: "svc-d18pb-" } } }); } catch { /* */ }
  try { await prisma.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE key LIKE $1`, `%pb18-${STAMP}%`); } catch { /* */ }
  const left = await prisma.tenant.count({ where: { slug: { startsWith: "qc-svc-d18pb-" } } });
  const trig: any[] = await prisma.$queryRawUnsafe(`SELECT tgname FROM pg_trigger WHERE tgname LIKE 'probe_d18_%'`);
  console.log(`(cleanup: tenant ค้าง ${left} · trigger ค้าง ${trig.length})`);
  const breach = results.filter((r) => !r.ok && r.sev !== "INFO");
  console.log(`PROBE_SUMMARY ${J({ total: results.length, hold: results.filter((r) => r.ok).length, breach: breach.map((r) => r.id), info: results.filter((r) => !r.ok && r.sev === "INFO").map((r) => r.id), cleanupLeft: left, triggersLeft: trig.length })}`);
  try { await prisma.$disconnect(); } catch { /* */ }
  server.close();
  process.exit(exitCode);
}
