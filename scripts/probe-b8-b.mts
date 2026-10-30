// PROBE — SVC B.8 reviewer B (โจมตีด้วยหลายโพรเซสจริง) · มัดจำรุ่นแรก · ไม่ใช่ข้อสอบ · ไม่แก้ src/
// รัน: bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/probe-b8-b.mts
// ข้อมูลใต้ร้าน slug `qc-svc-b8pb-*` · id `svcb8pb_*` · IP `svcb8pb-*` · ผู้ใช้ `svc-b8pb-*@shark.local` · ไฟล์ชั่วคราว /tmp/svc-b8b-* · ล้างใน finally (+ กวาดค้างตอนเริ่ม)
/* eslint-disable @typescript-eslint/no-explicit-any */
import { existsSync, writeFileSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { createHash, randomBytes } from "node:crypto";
import pg from "pg";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
import { sqcIdentityToken } from "./svc-qc-data.mjs";

loadSvcQcEnv("probe-b8-b");
if (process.env.CI) { console.error("🔴 probe-b8-b: ห้าม CI"); process.exit(4); }
if (!process.env.INTEGRATIONS_CREDENTIALS_KEY) process.env.INTEGRATIONS_CREDENTIALS_KEY = randomBytes(32).toString("hex");
process.env.INTEGRATIONS_FAKE = "1";
for (const k of ["SHARK_BUNNY_ZONE", "SHARK_BUNNY_KEY", "SHARK_BUNNY_CDN"]) delete process.env[k];

const SELF = fileURLToPath(import.meta.url);
const ROOT = join(dirname(SELF), "..");
const errMsg = (e: unknown) => (e instanceof Error ? `${(e as { code?: string }).code ?? ""} ${e.message}` : String(e)).replace(/\s+/g, " ").trim().slice(0, 300);
const J = (x: unknown) => { try { return JSON.stringify(x); } catch { return String(x); } };
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const MIN = 60_000;

// ── โมดูล (import แบบ string ⇒ any · next build ตรวจ type ของไฟล์นี้) ──
const D: any = await import("@/lib/modules/booking/deposit" as string);
const ON: any = await import("@/lib/modules/booking/online" as string);
const BK: any = await import("@/lib/modules/booking/service" as string);
const SV: any = await import("@/lib/payment/slip-verify" as string);
const CONS: any = await import("@/lib/outbox-consumers" as string);
const DB: any = await import("@/lib/core/db" as string);
const P: any = DB.prisma;

// ── สลิป ──
const PNG_SIG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const png = (): Uint8Array => Uint8Array.from(Buffer.concat([PNG_SIG, randomBytes(96)]));
const put = async (_p: string, _d: Uint8Array, _c: string): Promise<void> => { void _p; void _d; void _c; };
const del = async (_p: string): Promise<number> => { void _p; return 200; };
const RECV_ID = "0812345678";
const fakeSlip = (o: Record<string, unknown>) => `FAKESLIP:${Buffer.from(JSON.stringify(o), "utf8").toString("base64url")}`;
const newTR = () => `B8PB${Date.now().toString(36)}${randomBytes(4).toString("hex")}`.toUpperCase();
const goodSlip = (amountSatang: number, payerName: string) =>
  fakeSlip({ status: "VALID", amountSatang, transRef: newTR(), payerName, receiverMasked: `xxx-xxx-${RECV_ID.slice(-4)}`, transferredAt: new Date(Date.now() - 5 * MIN).toISOString() });

// ═══════════ โหมดลูก ═══════════
type Call = { op: string; a: any[]; delayMs?: number; tag?: string };
const goFile = (run: string, key: string) => `/tmp/svc-b8b-go-${run}-${key}`;
const slim = (r: any) => (r && typeof r === "object"
  ? { ok: r.ok, code: r.code ?? null, status: r.status ?? null, state: r.state ?? r.info?.state ?? null, dup: r.duplicated ?? null, dep: r.depositSatang ?? null, url: r.manageUrl ?? null, forfeited: r.forfeited ?? null, forfeit: r.forfeit ?? null, reason: typeof r.reason === "string" ? r.reason.slice(0, 120) : null, expired: r.expired ?? null }
  : r ?? null);
async function runOp(c: Call): Promise<any> {
  const t0 = Date.now();
  if (c.delayMs) await sleep(c.delayMs);
  const a = c.a;
  try {
    let r: any;
    if (c.op === "submit") r = await D.submitDepositSlip(a[0], { file: { data: png(), contentType: "image/png" }, ...(a[1] ? { qrPayload: a[1] } : {}), idempotencyKey: a[2] }, { ip: a[4], deps: { put, del }, ...(a[3] ? { now: new Date(a[3]) } : {}) });
    else if (c.op === "expire") r = { ok: true, ...(await BK.expireDepositHolds(new Date(a[0]))) };
    else if (c.op === "cancel") r = await ON.cancelOnline(a[0], { ip: a[1], ...(a[2] ? { now: new Date(a[2]) } : {}), ...(a[3] ? { acceptForfeit: true } : {}) });
    else if (c.op === "confirm") r = await D.confirmDepositByShop(a[0], a[1]);
    else if (c.op === "refund") r = await D.refundDepositByShop(a[0], a[1]);
    else if (c.op === "consume") { await D.onDepositSlipApproved(a[0]); r = { ok: true }; }
    else if (c.op === "consumeEvt") {
      const ev = await P.outboxEvent.findUnique({ where: { id: a[0] } });
      await CONS.consumers[ev.type]({ id: ev.id, tenantId: ev.tenantId, type: ev.type, payload: ev.payload, unitId: ev.unitId, systemId: null });
      r = { ok: true };
    } else if (c.op === "decide") r = await SV.decideSlip({ userId: a[0] }, { tenantId: a[1] }, a[2], { reason: "ตรวจกับแอปธนาคารแล้ว", transRef: newTR(), ...a[3] });
    else if (c.op === "noshow") r = await BK.setAppointmentStatus(a[0], a[1], a[2], "NO_SHOW");
    else if (c.op === "forfeitNS") r = await BK.forfeitAfterNoShow(a[0], a[1], a[2]);
    else if (c.op === "forfeitLate") r = await BK.forfeitAfterLateCancel(a[0], a[1], a[2]);
    else if (c.op === "book") r = await ON.bookOnline(a[0], a[1], { ip: a[2] });
    else r = { unknownOp: c.op };
    return { op: c.op, tag: c.tag ?? null, r: slim(r), ms: Date.now() - t0 };
  } catch (e) {
    return { op: c.op, tag: c.tag ?? null, threw: errMsg(e), ms: Date.now() - t0 };
  }
}
if (process.env.PROBE_B8B_CHILD) {
  const spec = JSON.parse(process.env.PROBE_B8B_CHILD) as { run: string; key: string; calls: Call[]; hang?: boolean };
  try {
    await P.$queryRawUnsafe("SELECT 1");
    console.log(`READY ${spec.key}`);
    const t0 = Date.now();
    while (!existsSync(goFile(spec.run, spec.key))) { if (Date.now() - t0 > 300_000) process.exit(5); await sleep(5); }
    const outs = await Promise.all(spec.calls.map(runOp));
    console.log(`RES ${spec.key} ${JSON.stringify(outs)}`);
    await P.$disconnect();
    process.exit(0);
  } catch (e) {
    console.log(`CHILD_ERR ${errMsg(e)}`);
    process.exit(3);
  }
}

// ═══════════ โพรเซสหลัก ═══════════
const RUN = Date.now().toString(36);
const goFiles: string[] = [];
let fanSeq = 0;
/** ยิงพร้อมกันข้ามโพรเซส: ลูกละ 1 ชุด call (ใน 1 ลูก call รันพร้อมกันด้วย) · killAfterMs = ฆ่าลูกทุกตัวหลังปล่อย go */
async function fan(label: string, perChild: Call[][], o: { killAfterMs?: number } = {}): Promise<any[]> {
  const key = `${label}-${++fanSeq}`;
  const n = perChild.length;
  const ready = new Set<number>(); const res = new Map<number, any[]>(); const dead = new Set<number>(); const errs: string[] = [];
  const kids = perChild.map((calls, idx) => {
    const ch = spawn(process.execPath, [...process.execArgv, SELF], { cwd: ROOT, env: { ...process.env, PROBE_B8B_CHILD: JSON.stringify({ run: RUN, key, calls }) }, stdio: ["ignore", "pipe", "pipe"] });
    createInterface({ input: ch.stdout }).on("line", (l) => {
      if (l === `READY ${key}`) ready.add(idx);
      else if (l.startsWith(`RES ${key} `)) res.set(idx, JSON.parse(l.slice(`RES ${key} `.length)));
      else if (l.startsWith("CHILD_ERR")) errs.push(`#${idx} ${l}`);
    });
    let tail = "";
    ch.stderr.on("data", (b: Buffer) => { tail = (tail + b.toString()).slice(-600); });
    ch.on("exit", (code, sig) => { dead.add(idx); if (code !== 0 && !(o.killAfterMs && sig)) errs.push(`#${idx} exit ${code} ${tail.split("\n").filter(Boolean).slice(-2).join(" | ")}`); });
    return ch;
  });
  const waitFor = async (cond: () => boolean, ms: number) => { const t = Date.now(); while (!cond()) { if (Date.now() - t > ms) return false; await sleep(10); } return true; };
  try {
    await waitFor(() => ready.size === n || dead.size > 0, 240_000);
    if (ready.size < n) throw new Error(`ลูกไม่พร้อม ${ready.size}/${n} ${errs.slice(0, 2).join(" · ")}`);
    const f = goFile(RUN, key); writeFileSync(f, "go"); goFiles.push(f);
    if (o.killAfterMs !== undefined) { await sleep(o.killAfterMs); for (const k of kids) if (k.exitCode === null) k.kill("SIGKILL"); }
    await waitFor(() => res.size + [...dead].filter((i) => !res.has(i)).length >= n, 240_000);
  } finally {
    await waitFor(() => dead.size === n, 30_000);
    for (const k of kids) if (k.exitCode === null) k.kill("SIGKILL");
  }
  if (errs.length) console.log(`  (ลูก: ${errs.slice(0, 3).join(" · ")})`);
  return [...res.values()].flat();
}

type Rs = { id: string; ok: boolean; sev: string; what: string; detail: string };
const results: Rs[] = [];
const rec = (id: string, ok: boolean, sev: string, what: string, detail: unknown = "") => {
  const d = typeof detail === "string" ? detail : J(detail);
  results.push({ id, ok, sev, what, detail: d });
  console.log(`  ${ok ? "✅ HOLD" : "🔴 BREACH"} [${id}] (${sev}) ${what}${d ? ` — ${d.slice(0, 1500)}` : ""}`);
};
const info = (id: string, what: string, detail: unknown = "") => console.log(`  ℹ️  [${id}] ${what} — ${(typeof detail === "string" ? detail : J(detail)).slice(0, 1500)}`);
const BADRX = /P2028|P2024|P2034|40P01|deadlock|timed out|Unable to start a transaction|Transaction already closed|INTERNAL/i;
const badOf = (outs: any[]) => outs.filter((o) => o.threw || BADRX.test(J(o)));
const step = async (id: string, fn: () => Promise<void>) => { try { await fn(); } catch (e) { rec(id, false, "ERR", "probe ล้มเอง (ไม่ใช่ผลตัดสิน)", errMsg(e)); } };
const busyLog: { id: string; outs: any[] }[] = [];
const noteBusy = (id: string, outs: any[]) => { const b = badOf(outs); const busy = outs.filter((o) => o?.r?.code === "BUSY"); if (b.length || busy.length) busyLog.push({ id, outs: [...b, ...busy] }); };

// ═══════════ ฐาน + ล้าง ═══════════
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 6 });
const q = async (sql: string, p: unknown[] = []): Promise<any[]> => (await pool.query(sql, p)).rows;
const SLUG = "qc-svc-b8pb-";
const TOKENS = new Set<string>();
async function cleanup(idsToDel: string[]) {
  if (!idsToDel.length) return;
  const tables = (await q(`SELECT DISTINCT c.table_name FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE'`)).map((r) => r.table_name as string);
  let pending = tables;
  for (let pass = 0; pass < 10 && pending.length; pass++) {
    const failed: string[] = [];
    for (const t of pending) { try { await pool.query(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, [idsToDel]); } catch { failed.push(t); } }
    pending = failed;
  }
  if (pending.length) console.log(`  ⚠️ ลบไม่ได้: ${pending.join(", ")}`);
  try { await pool.query(`DELETE FROM "Tenant" WHERE id = ANY($1::text[])`, [idsToDel]); } catch (e) { console.log(`  ⚠️ ลบ Tenant: ${errMsg(e)}`); }
}
async function cleanupGlobal() {
  try {
    await pool.query(`DELETE FROM "ChatRateBucket" WHERE key LIKE '%svcb8pb%' OR key LIKE '%qc-svc-b8pb-%' OR key LIKE '%b8pb-%'`);
    const keys = [...TOKENS].map((t) => `bq:manage:tk:${createHash("sha256").update(t).digest("hex").slice(0, 32)}`);
    if (keys.length) await pool.query(`DELETE FROM "ChatRateBucket" WHERE key = ANY($1::text[])`, [keys]);
    await pool.query(`DELETE FROM "User" WHERE email LIKE 'svc-b8pb-%@shark.local'`);
  } catch (e) { console.log(`  ⚠️ ลบถัง/ผู้ใช้: ${errMsg(e)}`); }
}

// ═══════════ ข้อมูล ═══════════
const addDays = (ds: string, n: number) => { const [y, m, d] = ds.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const bkkToday = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const bkkMs = (ds: string, min: number) => { const [y, m, d] = ds.split("-").map(Number); return Date.UTC(y, m - 1, d) + (min - 420) * MIN; };
const TODAY = bkkToday();
const OPEN: string[] = [];
for (let n = 2; n <= 29; n++) OPEN.push(addDays(TODAY, n));
const T = (k: string) => `svcb8pb_${k}_${RUN}`;
const ids = {
  tA: T("tA"), tB: T("tB"), uO: T("uO"), uM: T("uM"), uX: T("uX"), uB: T("uB"),
  PERM_O: T("PERM_O"), PERM_M: T("PERM_M"), PERM_X: T("PERM_X"), PERM_B: T("PERM_B"),
  PG: T("PG"), CG: T("CG"), PS: T("PS"), CS: T("CS"), PX: T("PX"),
};
const STAFF: Record<string, string[]> = {
  [ids.uO]: [T("o1"), T("o2"), T("o3")], [ids.uM]: [T("m1"), T("m2"), T("m3")], [ids.uX]: [T("x1"), T("x2"), T("x3")], [ids.uB]: [T("b1"), T("b2")],
};
const PERM_OF: Record<string, string> = { [ids.uO]: ids.PERM_O, [ids.uM]: ids.PERM_M, [ids.uX]: ids.PERM_X, [ids.uB]: ids.PERM_B };
const TEN: Record<string, string> = { [ids.uO]: ids.tA, [ids.uM]: ids.tA, [ids.uX]: ids.tA, [ids.uB]: ids.tB };
const DEP = 30_000;
const GOLD = { name: "คุณทองโพรบบีแปด", phone: `08${(Date.now() % 100_000_000).toString().padStart(8, "0")}` };
const SILVER = { name: "คุณเงินโพรบบีแปด", phone: `09${((Date.now() + 7) % 100_000_000).toString().padStart(8, "0")}` };
const SLUGS: Record<string, string> = {};
const USERS: Record<string, string> = {};
const SECRET = process.env.SESSION_SECRET ?? "";
const ref = (u: string) => ({ tenantSlug: SLUGS[TEN[u]], unitSlug: SLUGS[u] });
let ipSeq = 0;
const ip = () => `svcb8pb-${RUN}-${++ipSeq}`;
let pseq = 0;
const RUNN = String(Date.now() % 10_000).padStart(4, "0");
const newPhone = () => `06${RUNN}${String(++pseq).padStart(4, "0")}`;
const newName = () => `คุณโพรบบีแปด${++pseq}`;
const actorOf = (k: string) => ({ userId: USERS[k], role: "OWNER", unitAccess: ["*"], permissions: {} });
const shop = (k: string, t: string = ids.tA) => ({ tenantId: t, actorUserId: USERS[k] });
const slotIdx: Record<string, number> = {};
const TIMES = [600, 720, 840, 960];
const nextSlot = (u: string) => {
  const i = (slotIdx[u] = (slotIdx[u] ?? -1) + 1);
  const staff = STAFF[u];
  const per = staff.length * TIMES.length;
  const d = OPEN[Math.floor(i / per)];
  if (!d) throw new Error(`ช่องของ ${u} หมด`);
  const r = i % per;
  return { dateStr: d, staffId: staff[Math.floor(r / TIMES.length)], startMin: TIMES[r % TIMES.length] };
};
type Appt = { id: string; token: string; unit: string; name: string; startMs: number; dep: number };
const S: any = await import("@/lib/core/settings" as string);
const setVal = async (key: string, u: string, value: unknown) => {
  const t = TEN[u];
  const r = await S.setSettings(actorOf(t === ids.tA ? "ownerA" : "ownerB"), { tenantId: t }, [{ key, scope: "UNIT", scopeId: u, value }]);
  if (r?.ok !== true) throw new Error(`setSettings ${key}=${J(value)}: ${r?.code} ${J(r?.issues)}`);
};
async function book(u: string, o: { who?: string; name?: string; phone?: string } = {}): Promise<Appt> {
  const s = nextSlot(u);
  const name = o.name ?? newName();
  const key = `svcb8pb-k-${RUN}-${randomBytes(5).toString("hex")}`;
  const r = await ON.bookOnline(ref(u), { serviceId: PERM_OF[u], staffId: s.staffId, dateStr: s.dateStr, startMin: s.startMin, name, phone: o.phone ?? newPhone(), idempotencyKey: key, ...(o.who ? { who: o.who } : {}) }, { ip: ip() });
  if (r?.ok !== true || typeof r.manageUrl !== "string") throw new Error(`bookOnline ${J(r)}`);
  const token = r.manageUrl.slice("/bq/m/".length);
  TOKENS.add(token);
  const row = (await q(`SELECT id, "depositSatang" FROM "Appointment" WHERE "tenantId" = $1 AND "idempotencyKey" = $2`, [TEN[u], key]))[0];
  return { id: row.id, token, unit: u, name, startMs: bkkMs(s.dateStr, s.startMin), dep: Number(row.depositSatang) };
}
async function bookWith(u: string, sets: [string, unknown][], o: Parameters<typeof book>[1] = {}): Promise<Appt> {
  const cur = await S.resolveSettings({ tenantId: TEN[u] }, sets.map((x) => x[0]), { unitId: u });
  const prev: [string, unknown][] = sets.map(([k]) => [k, cur[k]?.value ?? null]);
  for (const [k, v] of sets) await setVal(k, u, v);
  try { return await book(u, o); } finally { for (const [k, v] of prev) await setVal(k, u, v).catch(() => undefined); }
}
const apRow = async (id: string) => (await q(`SELECT id, status::text AS status, "cancelReason", "depositSatang", "depositPaidAt", "depositSaleId", "createdAt", "startAt", "updatedAt" FROM "Appointment" WHERE id = $1`, [id]))[0];
const receiptsOf = async (id: string) => q(`SELECT id, status::text AS status, "grandTotalSatang" AS grand, "idempotencyKey" AS key FROM "PosSale" WHERE "sourceModule" = 'POS_DEPOSIT' AND "idempotencyKey" LIKE $1 ORDER BY "createdAt"`, [`booking-deposit-${id}%`]);
const forfeitsOf = async (id: string) => q(`SELECT id, status::text AS status, "grandTotalSatang" AS grand, "idempotencyKey" AS key FROM "PosSale" WHERE "sourceModule" = 'BOOKING' AND "sourceId" = $1 AND "idempotencyKey" LIKE 'dep-forfeit:%' ORDER BY "createdAt"`, [id]);
const depRow = async (rid: string | null) => (rid ? (await q(`SELECT id, status::text AS status, "amountSatang" AS amount, "usedSatang" AS used, "refundedSatang" AS refunded FROM "PosDeposit" WHERE "receiptSaleId" = $1`, [rid]))[0] ?? null : null);
const refundsOf = async (rid: string) => q(`SELECT id, "grandTotalSatang" AS grand FROM "PosSale" WHERE "docType" = 'REFUND' AND "refSaleId" = $1`, [rid]);
const slipsOf = async (id: string) => q(`SELECT id, status::text AS status, "amountSatang" FROM "PaymentSlip" WHERE "refId" = $1 ORDER BY "createdAt"`, [id]);
const evs = async (type: string, id: string) => q(`SELECT id, "idempotencyKey" AS key, payload, status::text AS status FROM "OutboxEvent" WHERE "tenantId" = ANY($1::text[]) AND type = $2 AND payload->>'appointmentId' = $3`, [[ids.tA, ids.tB], type, id]);
const audits = async (action: string, id: string) => q(`SELECT after FROM "AuditLog" WHERE "tenantId" = ANY($1::text[]) AND action = $2 AND "targetId" = $3`, [[ids.tA, ids.tB], action, id]);
const infoOf = async (u: string, id: string) => D.depositInfo({ tenantId: TEN[u], unitId: u }, id);
const slipEvtOf = async (slipId: string) => (await q(`SELECT id, "tenantId", type, payload, "unitId" FROM "OutboxEvent" WHERE type = 'payment.slip.approved' AND payload->>'slipId' = $1 ORDER BY "createdAt"`, [slipId]));
const evtObj = (r: any) => ({ id: r.id, tenantId: r.tenantId, type: r.type, payload: r.payload, unitId: r.unitId, systemId: null });
/** ระบายคิวของร้านทดสอบ (consumer จริง · type ที่กำหนดหรือทั้งหมด) */
async function pump(types?: string[], rounds = 20): Promise<string[]> {
  const errs: string[] = [];
  for (let i = 0; i < rounds; i++) {
    const rows = await q(`SELECT id, "tenantId", type, payload, "unitId" FROM "OutboxEvent" WHERE "tenantId" = ANY($1::text[]) AND status = 'PENDING' ${types ? `AND type = ANY($2::text[])` : ""} ORDER BY "createdAt", id LIMIT 200`, types ? [[ids.tA, ids.tB], types] : [[ids.tA, ids.tB]]);
    if (!rows.length) return errs;
    for (const row of rows) {
      const claim = await pool.query(`UPDATE "OutboxEvent" SET "availableAt" = now() + interval '2 minutes' WHERE id = $1 AND status = 'PENDING' RETURNING id`, [row.id]);
      if (!claim.rowCount) continue;
      const h = CONS.consumers?.[row.type];
      let failed = false;
      if (typeof h === "function") { try { await h(evtObj(row)); } catch (e) { failed = true; errs.push(`${row.type}: ${errMsg(e).slice(0, 120)}`); } }
      await pool.query(failed ? `UPDATE "OutboxEvent" SET "availableAt" = now() WHERE id = $1` : `UPDATE "OutboxEvent" SET status = 'DONE', "processedAt" = now() WHERE id = $1 AND status = 'PENDING'`, [row.id]);
      if (failed) return errs; // ล้มแล้วหยุดรอบนี้ (ไม่วนจนหมดรอบ)
    }
  }
  return errs;
}
const submitNow = async (a: Appt, script?: string, key?: string, now?: Date) => D.submitDepositSlip(a.token, { file: { data: png(), contentType: "image/png" }, ...(script ? { qrPayload: script } : {}), idempotencyKey: key ?? `svcb8pb-s-${randomBytes(6).toString("hex")}` }, { ip: ip(), deps: { put, del }, ...(now ? { now } : {}) });
const decide = async (t: string, user: string, slipId: string, input: Record<string, unknown>) => {
  const r = await SV.decideSlip({ userId: USERS[user] }, { tenantId: t }, slipId, { reason: "ตรวจกับแอปธนาคารแล้ว", transRef: newTR(), ...input });
  if (r?.ok !== true) throw new Error(`decideSlip ${J(r)}`);
  return r;
};
const confirmShop = async (a: Appt, payType = "TRANSFER") => {
  const r = await D.confirmDepositByShop(shop("ownerA", TEN[a.unit]), { unitId: a.unit, appointmentId: a.id, payType });
  if (r?.ok !== true) throw new Error(`confirmDepositByShop ${J(r)}`);
  return r;
};
const lateNow = (a: Appt) => a.startMs - 60 * MIN;
let posSysX = "";
const patchShift = async (required: boolean) => {
  const row = await P.appSystem.findUnique({ where: { id: posSysX }, select: { settings: true } });
  const s = row?.settings && typeof row.settings === "object" && !Array.isArray(row.settings) ? JSON.parse(JSON.stringify(row.settings)) : {};
  const pos = s.pos && typeof s.pos === "object" ? s.pos : {};
  pos.shift = { ...(pos.shift && typeof pos.shift === "object" ? pos.shift : {}), required: { register: false, otherSources: required } };
  await P.appSystem.update({ where: { id: posSysX }, data: { settings: { ...s, pos } } });
};

console.log(`(probe-b8-b · วันนี้ ${TODAY} · SESSION_SECRET ${SECRET.length >= 32 ? "มี" : "ไม่มี"} · run ${RUN})`);
const TIDS = [ids.tA, ids.tB];
try {
  const stale = (await q(`SELECT id FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`])).map((r) => r.id as string);
  if (stale.length) { console.log(`(กวาดค้าง ${stale.length} ร้าน)`); await cleanup(stale); }
  await cleanupGlobal();

  // ── สร้างข้อมูล (แบบ qc-svc-b.8) ──
  const SYS: any = await import("@/lib/modules/system/service" as string);
  const ACC: any = await import("@/lib/modules/account/service" as string);
  const GL: any = await import("@/lib/modules/account/gl" as string);
  const I: any = await import("@/lib/core/integrations" as string);
  for (const [id, n, name] of [[ids.tA, "a", "Probe B8 A"], [ids.tB, "b", "Probe B8 B"]] as const) {
    SLUGS[id] = `${SLUG}${n}-${RUN}`;
    await P.tenant.create({ data: { id, name, slug: SLUGS[id] } });
  }
  for (const [id, t, n] of [[ids.uO, ids.tA, "o"], [ids.uM, ids.tA, "m"], [ids.uX, ids.tA, "x"], [ids.uB, ids.tB, "b"]] as const) {
    SLUGS[id] = `b8pb-${n}-${RUN}`;
    await P.businessUnit.create({ data: { id, tenantId: t, type: "BOOKING", name: `สาขา ${n}`, slug: SLUGS[id] } });
    for (let w = 0; w < 7; w++) await P.bookingHours.create({ data: { tenantId: t, unitId: id, weekday: w, openMin: 600, closeMin: 1200, closed: false } });
    await P.bookingService.create({ data: { id: PERM_OF[id], tenantId: t, unitId: id, name: "ดัดผม", durationMin: 120, priceSatang: 150_000, bufferMin: 0, depositSatang: 0, bookable: true, sortOrder: 1 } });
    for (const [i, s] of STAFF[id].entries()) await P.bookingStaff.create({ data: { id: s, tenantId: t, unitId: id, name: `ช่างโพรบ${i + 1}`, sortOrder: i + 1 } });
  }
  for (const [t, units, label] of [[ids.tA, [ids.uO, ids.uM, ids.uX], "A"], [ids.tB, [ids.uB], "B"]] as const) {
    const pos = await SYS.createSystem(t, "POS", `ขาย ${label}`);
    if (t === ids.tA) posSysX = pos.id;
    for (const u of units) await SYS.linkUnit(t, pos.id, u);
    const acc = await SYS.createSystem(t, "ACCOUNT", `บัญชี ${label}`);
    await ACC.saveSettings(t, acc.id, { orgName: `Probe B8 ${label} จำกัด`, taxId: "0105561177639", vatRegistered: true });
    await GL.ensureAccounting({ tenantId: t, systemId: acc.id });
    await P.accountSystemLink.create({ data: { tenantId: t, systemId: acc.id, linkedKind: "POS", linkedId: pos.id } });
  }
  const mem = await SYS.createSystem(ids.tA, "MEMBER", "สมาชิก A");
  await SYS.linkUnit(ids.tA, mem.id, ids.uO);
  await P.paymentProfile.create({ data: { tenantId: ids.tA, promptpayId: RECV_ID, displayName: "Probe B8 A" } });
  await P.paymentProfile.create({ data: { tenantId: ids.tB, promptpayId: "0898765432", displayName: "Probe B8 B" } });
  const mkUser = async (k: string, t: string, role: string) => {
    const u = await P.user.create({ data: { email: `svc-b8pb-${RUN}-${k}@shark.local`, name: `Probe B8 ${k}` } });
    await P.membership.create({ data: { userId: u.id, tenantId: t, role, unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
    USERS[k] = u.id;
  };
  await mkUser("ownerA", ids.tA, "OWNER");
  await mkUser("ownerA2", ids.tA, "OWNER");
  await mkUser("ownerB", ids.tB, "OWNER");
  for (const [pid, cid, p, tier] of [[ids.PG, ids.CG, GOLD, "GOLD"], [ids.PS, ids.CS, SILVER, "SILVER"]] as const) {
    await P.party.create({ data: { id: pid, tenantId: ids.tA, name: p.name, phone: p.phone, phoneNorm: p.phone } });
    await P.customer.create({ data: { id: cid, tenantId: ids.tA, memberSystemId: mem.id, name: p.name, phone: p.phone, tier, partyId: pid } });
  }
  // Party ผู้สวมเบอร์: ตัวตน LINE ที่ลิงก์เซ็นผ่าน แต่ Party ไม่ใช่ของสมาชิก GOLD — มีเพียงเบอร์ตรงกัน (เบอร์ใน Party ไม่ผ่าน OTP)
  await P.party.create({ data: { id: ids.PX, tenantId: ids.tA, name: "คุณสวมเบอร์โพรบ", phone: GOLD.phone, phoneNorm: GOLD.phone } });
  for (const u of [ids.uO, ids.uM, ids.uX, ids.uB]) {
    const t = TEN[u];
    const a = await S.applyTemplate(actorOf(t === ids.tA ? "ownerA" : "ownerB"), { tenantId: t }, { unitId: u, domain: "booking", templateKey: "BARBER", overwrite: "RESET_ALL" });
    if (a?.ok !== true) throw new Error(`applyTemplate ${J(a)}`);
    await setVal("booking.booking.onlineSharePct", u, 100);
    await setVal("booking.deposit.payWithinMin", u, 1440);
    await setVal("booking.booking.maxOpenPerPhone", u, null);
  }
  await setVal("booking.deposit.memberExemptTier", ids.uO, "GOLD");
  const integ = await I.saveIntegration({ tenantId: ids.tA }, actorOf("ownerA"), { create: true, kind: "SLIP_VERIFY", provider: "FAKE", label: `svcb8pb-${RUN}`, unitIds: [ids.uO], onFailure: "MANUAL", fields: { apiKey: `qcb8pb${randomBytes(14).toString("hex")}`, mode: "OK" } });
  if (!integ?.integration?.id) throw new Error(`saveIntegration ${J(integ)}`);
  await I.testIntegration({ tenantId: ids.tA }, actorOf("ownerA"), { id: integ.integration.id });
  await setVal("payments.slip.autoApprove", ids.uO, true);
  console.log("(ตั้งข้อมูลเสร็จ)");

  // ═══════════ 1. แนบสลิปพร้อมกัน ═══════════
  console.log("\n── 1. แนบสลิปพร้อมกัน (key เดียว / key ต่าง / ∥ หมดเวลา / ∥ ลูกค้ายกเลิก) ──");
  await step("P1a", async () => {
    const a = await book(ids.uM);
    const key = `svcb8pb-same-${randomBytes(6).toString("hex")}`;
    const outs = await fan("p1a", Array.from({ length: 6 }, () => [{ op: "submit", a: [a.token, undefined, key, 0, ip()] }]));
    noteBusy("P1a", outs);
    const sl = await slipsOf(a.id);
    rec("P1a", sl.length === 1 && badOf(outs).length === 0, "HIGH", "แนบสลิป key เดียว 6 โพรเซสพร้อมกัน ⇒ PaymentSlip 1 ใบ · ไม่มี throw", { slips: sl.map((s) => s.status), codes: outs.map((o) => o.r?.code ?? (o.r?.ok ? "ok" : o.threw)) });
  });
  await step("P1b", async () => {
    const a = await book(ids.uM);
    const outs = await fan("p1b", Array.from({ length: 6 }, (_, i) => [{ op: "submit", a: [a.token, undefined, `svcb8pb-dk${i}-${randomBytes(5).toString("hex")}`, 0, ip()] }]));
    noteBusy("P1b", outs);
    const sl = await slipsOf(a.id);
    const live = sl.filter((s) => ["PENDING", "NEEDS_REVIEW"].includes(s.status));
    rec("P1b", live.length <= 1, "MED", "แนบสลิป key ต่างกัน 6 โพรเซสพร้อมกัน (สาขาตรวจมือ) ⇒ สลิปค้างตรวจของนัด ≤ 1 (ด่าน IN_REVIEW ต้องตัดสินใต้ล็อก ไม่ใช่อ่านก่อน)", { slips: sl.map((s) => s.status), codes: outs.map((o) => o.r?.code ?? (o.r?.ok ? "ok" : o.threw)) });
    // ผลต่อเงิน: อนุมัติทุกใบที่ค้าง (คนละผู้ตรวจ) แล้วระบาย ⇒ ใบรับ 1 · ยอด = DEP · ใบที่เกินมี audit slip_after_paid
    for (const s of live) await decide(ids.tA, "ownerA", s.id, { decision: "APPROVE" });
    await pump(["payment.slip.approved"]);
    const rc = await receiptsOf(a.id);
    const row = await apRow(a.id);
    const dep = await depRow(row.depositSaleId);
    const sap = await audits("booking.deposit.slip_after_paid", a.id);
    rec("P1b-money", rc.filter((r) => r.status === "PAID").length === 1 && dep?.amount === DEP && row.depositSaleId === rc[0]?.id && sap.length === Math.max(0, live.length - 1), "HIGH",
      "หลังอนุมัติสลิปที่ซ้อนทุกใบ ⇒ ใบรับ 1 · ยอด 30,000 · แถวนัดอ้างใบรับนั้น · ใบที่เกินมี audit slip_after_paid ครบ", { live: live.length, receipts: rc, dep, slipAfterPaid: sap.length });
  });
  await step("P1c", async () => {
    // สาขา o อนุมัติอัตโนมัติ: สลิปดีคนละ transRef 5 ใบพร้อมกัน
    const a = await book(ids.uO);
    const outs = await fan("p1c", Array.from({ length: 5 }, (_, i) => [{ op: "submit", a: [a.token, goodSlip(DEP, a.name), `svcb8pb-ak${i}-${randomBytes(5).toString("hex")}`, 0, ip()] }]));
    noteBusy("P1c", outs);
    await pump(["payment.slip.approved"]);
    const sl = await slipsOf(a.id);
    const appr = sl.filter((s) => ["AUTO_APPROVED", "APPROVED"].includes(s.status));
    const rc = await receiptsOf(a.id);
    const row = await apRow(a.id);
    const sap = await audits("booking.deposit.slip_after_paid", a.id);
    rec("P1c", rc.length === 1 && row.depositSaleId === rc[0]?.id && Number(rc[0]?.grand) === DEP && sap.length === appr.length - 1, "HIGH",
      "สลิปอนุมัติอัตโนมัติ 5 ใบพร้อมกัน (โอนจริง 5 ครั้ง) ⇒ ใบรับ 1 ยอด 30,000 · ที่เกินมีเตือน slip_after_paid ทุกใบ", { slips: sl.map((s) => s.status), receipts: rc, slipAfterPaid: sap.length, codes: outs.map((o) => `${o.r?.code ?? (o.r?.ok ? "ok" : o.threw)}:${o.r?.state ?? ""}`) });
    rec("P1c-one", appr.length <= 1, "MED", "สลิปที่มีผล (อนุมัติ) ต่อนัด ≤ 1 — ลูกค้าโอนซ้ำได้หลายครั้งพร้อมกันโดยระบบรับทุกใบ (เงินเข้าเกินไม่มีใบรับ เหลือแค่ audit เตือน)", { approved: appr.length });
  });
  await step("P1d", async () => {
    // ∥ หมดเวลา: ถือช่อง 1 นาที · แนบตอน createdAt+50s ∥ expire(createdAt+3min) · 4 นัด
    const as: Appt[] = [];
    for (let i = 0; i < 4; i++) as.push(await bookWith(ids.uM, [["booking.deposit.payWithinMin", 1]]));
    const rows = await Promise.all(as.map((a) => apRow(a.id)));
    const per = as.map((a, i) => [
      { op: "submit", tag: `a${i}`, a: [a.token, undefined, `svcb8pb-ex${i}-${randomBytes(5).toString("hex")}`, rows[i].createdAt.getTime() + 50_000, ip()] },
      { op: "expire", a: [rows[i].createdAt.getTime() + 3 * MIN] },
    ]);
    const outs = await fan("p1d", per);
    noteBusy("P1d", outs);
    const view: any[] = [];
    let lied = 0;
    for (const [i, a] of as.entries()) {
      const r = await apRow(a.id);
      const sl = await slipsOf(a.id);
      const sub = outs.find((o) => o.op === "submit" && o.tag === `a${i}`);
      const okSub = sub?.r?.ok === true;
      if (okSub && r.status === "CANCELLED" && sl.length) lied++;
      view.push({ status: r.status, why: r.cancelReason, slips: sl.map((s) => s.status), submit: sub?.r?.code ?? (sub?.r?.ok ? `ok:${sub?.r?.state}` : sub?.threw) });
    }
    rec("P1d", lied === 0, "LOW", "แนบสลิป ∥ ปล่อยช่อง ⇒ ลูกค้าไม่ได้ ok/IN_REVIEW ทั้งที่นัดถูกปล่อยไปแล้ว (สลิปค้างบนนัด CANCELLED)", { lied, view });
    // อนุมัติสลิปค้างทั้งหมด ⇒ ไม่ปลุกนัด · ใบรับ ≤ 1 · CANCELLED+เงินเข้า = REFUND_DUE ในคิว
    for (const a of as) for (const s of (await slipsOf(a.id)).filter((x) => x.status === "NEEDS_REVIEW" || x.status === "PENDING")) await decide(ids.tA, "ownerA", s.id, { decision: "APPROVE" });
    await pump(["payment.slip.approved"]);
    const qd = await D.depositQueue(shop("ownerA"), { unitId: ids.uM, states: ["REFUND_DUE"] });
    const bad: any[] = [];
    for (const a of as) {
      const r = await apRow(a.id); const rc = await receiptsOf(a.id); const inf = await infoOf(ids.uM, a.id);
      const okRow = (r.status === "CONFIRMED" && rc.length === 1) || (r.status === "CANCELLED" && rc.length === 0) || (r.status === "CANCELLED" && rc.length === 1 && inf?.state === "REFUND_DUE" && qd.items?.some((x: any) => x.appointmentId === a.id));
      if (!okRow || (rc.length && r.depositSaleId !== rc[0].id)) bad.push({ status: r.status, rc: rc.length, state: inf?.state });
    }
    rec("P1d-money", bad.length === 0, "HIGH", "หลังอนุมัติสลิปของนัดที่แข่งกับหมดเวลา ⇒ (CONFIRMED+ใบรับ1) | (CANCELLED+ไม่มีใบรับ) | (CANCELLED+ใบรับ1+REFUND_DUE ในคิว) · ไม่มีใบรับลอย", bad);
  });
  await step("P1e", async () => {
    // ∥ ลูกค้ายกเลิก (ในเวลาฟรี) · 3 นัด
    const as: Appt[] = [];
    for (let i = 0; i < 3; i++) as.push(await book(ids.uM));
    const per = as.map((a, i) => [
      { op: "submit", a: [a.token, undefined, `svcb8pb-cx${i}-${randomBytes(5).toString("hex")}`, 0, ip()] },
      { op: "cancel", a: [a.token, ip(), 0, false] },
    ]);
    const outs = await fan("p1e", per);
    noteBusy("P1e", outs);
    for (const a of as) for (const s of (await slipsOf(a.id)).filter((x) => x.status === "NEEDS_REVIEW")) await decide(ids.tA, "ownerA", s.id, { decision: "APPROVE" });
    await pump(["payment.slip.approved"]);
    const view: any[] = []; const bad: any[] = [];
    for (const a of as) {
      const r = await apRow(a.id); const rc = await receiptsOf(a.id); const inf = await infoOf(ids.uM, a.id);
      view.push({ status: r.status, why: r.cancelReason, rc: rc.length, state: inf?.state });
      if (r.status !== "CANCELLED" || rc.length > 1 || (rc.length === 1 && (inf?.state !== "REFUND_DUE" || r.depositSaleId !== rc[0].id))) bad.push(view[view.length - 1]);
    }
    rec("P1e", bad.length === 0, "HIGH", "แนบสลิป ∥ ลูกค้ายกเลิก แล้วร้านอนุมัติ ⇒ ไม่ปลุกนัด (คง CANCELLED) · ใบรับ ≤1 ผูกแถว · REFUND_DUE", { view, codes: outs.map((o) => `${o.op}:${o.r?.code ?? (o.r?.ok ? "ok" : o.threw)}`) });
  });

  // ═══════════ 2. อนุมัติสลิป ═══════════
  console.log("\n── 2. อนุมัติสลิป (2 ผู้ตรวจพร้อมกัน · consumer ซ้อน · อนุมัติอัตโนมัติ ∥ หมดเวลา) ──");
  await step("P2a", async () => {
    const a = await book(ids.uM);
    const s = await submitNow(a);
    if (!s?.ok) throw new Error(`submit ${J(s)}`);
    const slipId = (await slipsOf(a.id))[0].id;
    const outs = await fan("p2a", [
      [{ op: "decide", a: [USERS.ownerA, ids.tA, slipId, { decision: "APPROVE" }] }],
      [{ op: "decide", a: [USERS.ownerA2, ids.tA, slipId, { decision: "APPROVE" }] }],
      [{ op: "decide", a: [USERS.ownerA, ids.tA, slipId, { decision: "APPROVE_PARTIAL", amountSatang: 10_000 }] }],
      [{ op: "decide", a: [USERS.ownerA2, ids.tA, slipId, { decision: "REJECT" }] }],
    ]);
    noteBusy("P2a", outs);
    const ev = await slipEvtOf(slipId);
    const ev2 = await fan("p2a-c", Array.from({ length: 5 }, () => ev.slice(0, 1).map((e) => ({ op: "consumeEvt", a: [e.id] }))));
    noteBusy("P2a-c", ev2);
    const rc = await receiptsOf(a.id); const row = await apRow(a.id); const sl = (await slipsOf(a.id))[0];
    const dp = await evs("booking.deposit_paid", a.id);
    const okDec = outs.filter((o) => o.r?.ok === true).length;
    rec("P2a", okDec === 1 && ev.length <= 1 && (sl.status === "REJECTED" ? rc.length === 0 : rc.length === 1 && dp.length === 1 && row.depositSaleId === rc[0].id), "HIGH",
      "ผู้ตรวจ 4 คำสั่งพร้อมกัน (อนุมัติ×2 · บางส่วน · ปฏิเสธ) + consumer 5 โพรเซส ⇒ ตัดสินสำเร็จ 1 · event อนุมัติ ≤1 · ใบรับตรงผลตัดสิน 1 ใบ · deposit_paid 1",
      { okDec, slip: sl.status, events: ev.length, receipts: rc.map((r) => r.grand), depositPaid: dp.length, decides: outs.map((o) => o.r?.code ?? (o.r?.ok ? "ok" : o.threw)) });
  });
  await step("P2b", async () => {
    // อนุมัติอัตโนมัติ ∥ หมดเวลา (สาขา o · ถือช่อง 1 นาที · 4 นัด)
    const as: Appt[] = [];
    for (let i = 0; i < 4; i++) as.push(await bookWith(ids.uO, [["booking.deposit.payWithinMin", 1]]));
    const rows = await Promise.all(as.map((a) => apRow(a.id)));
    const outs = await fan("p2b", as.map((a, i) => [
      { op: "submit", tag: `a${i}`, a: [a.token, goodSlip(DEP, a.name), `svcb8pb-ae${i}-${randomBytes(5).toString("hex")}`, rows[i].createdAt.getTime() + 55_000, ip()] },
      { op: "expire", a: [rows[i].createdAt.getTime() + 3 * MIN] },
      { op: "expire", a: [rows[i].createdAt.getTime() + 3 * MIN], delayMs: 150 },
    ]));
    noteBusy("P2b", outs);
    await pump(["payment.slip.approved", "booking.cancelled"]);
    const subs = as.map((_, i) => outs.find((o) => o.op === "submit" && o.tag === `a${i}`));
    const view: any[] = []; const bad: any[] = []; const lie: any[] = [];
    for (const [i, a] of as.entries()) {
      const r = await apRow(a.id); const rc = await receiptsOf(a.id); const sl = await slipsOf(a.id); const inf = await infoOf(ids.uO, a.id);
      const approved = sl.some((s) => ["AUTO_APPROVED", "APPROVED"].includes(s.status));
      const cancels = (await evs("booking.cancelled", a.id)).length;
      const v = { status: r.status, why: r.cancelReason, slips: sl.map((s) => s.status), rc: rc.length, state: inf?.state, cancels, submit: subs[i]?.r };
      view.push(v);
      if (approved && rc.length !== 1) bad.push(v);
      if (rc.length && r.depositSaleId !== rc[0].id) bad.push(v);
      if (cancels > 1) bad.push(v);
      if (approved && r.status === "CANCELLED" && subs[i]?.r?.ok && subs[i]?.r?.state !== "REFUND_DUE") lie.push(v);
    }
    rec("P2b", bad.length === 0, "HIGH", "สลิปอนุมัติอัตโนมัติ ∥ ปล่อยช่อง 2 ทาง ⇒ สลิปอนุมัติ = ใบรับ 1 ผูกแถว · booking.cancelled ≤1", { bad, view });
    rec("P2b-truth", lie.length === 0, "LOW", "ผลคืนของ submit (state) ตรงกับความจริงเมื่อนัดถูกปล่อยช่องพร้อมกัน", lie);
  });

  // ═══════════ 4. ร้านยืนยัน / ยอมรับยอดขาด ∥ ปล่อย/ยกเลิก ═══════════
  console.log("\n── 4. ร้านยืนยัน ∥ สลิป · ร้านยืนยัน ∥ ลูกค้ายกเลิก · ยอมรับยอดขาด ∥ ยกเลิก ──");
  await step("P4a", async () => {
    const a = await book(ids.uO);
    const outs = await fan("p4a", [
      [{ op: "submit", a: [a.token, goodSlip(DEP, a.name), `svcb8pb-cs-${randomBytes(5).toString("hex")}`, 0, ip()] }],
      [{ op: "confirm", a: [shop("ownerA"), { unitId: ids.uO, appointmentId: a.id, payType: "TRANSFER" }] }],
      [{ op: "confirm", a: [shop("ownerA2"), { unitId: ids.uO, appointmentId: a.id, payType: "CASH" }] }],
      [{ op: "confirm", a: [shop("ownerA"), { unitId: ids.uO, appointmentId: a.id }] }],
    ]);
    noteBusy("P4a", outs);
    await pump(["payment.slip.approved"]);
    const rc = await receiptsOf(a.id); const row = await apRow(a.id); const dp = await evs("booking.deposit_paid", a.id);
    const deps = await q(`SELECT count(*)::int AS n FROM "PosDeposit" WHERE "tenantId" = $1 AND "idempotencyKey" LIKE $2`, [ids.tA, `%booking-deposit-${a.id}%`]);
    rec("P4a", rc.filter((r) => r.status === "PAID").length === 1 && row.depositSaleId === rc.find((r) => r.status === "PAID")?.id && dp.length === 1 && deps[0].n === 1, "HIGH",
      "สลิปอนุมัติอัตโนมัติ ∥ ร้านกดยืนยัน 3 ทาง (TRANSFER/CASH/ค่าเริ่ม) ⇒ ใบรับ PAID 1 · PosDeposit 1 · แถวอ้างใบรับนั้น · deposit_paid 1",
      { receipts: rc, depositRows: deps[0].n, depositPaid: dp.length, codes: outs.map((o) => `${o.op}:${o.r?.code ?? (o.r?.ok ? `ok${o.r?.dup ? "(dup)" : ""}` : o.threw)}`) });
  });
  await step("P4b", async () => {
    const as: Appt[] = [];
    for (let i = 0; i < 3; i++) as.push(await book(ids.uM));
    const outs = await fan("p4b", as.map((a) => [
      { op: "cancel", a: [a.token, ip(), 0, false] },
      { op: "confirm", a: [shop("ownerA"), { unitId: ids.uM, appointmentId: a.id }] },
      { op: "confirm", a: [shop("ownerA2"), { unitId: ids.uM, appointmentId: a.id }], delayMs: 40 },
    ]));
    noteBusy("P4b", outs);
    const qd = await D.depositQueue(shop("ownerA"), { unitId: ids.uM });
    const view: any[] = []; const bad: any[] = [];
    for (const a of as) {
      const r = await apRow(a.id); const rc = await receiptsOf(a.id); const inf = await infoOf(ids.uM, a.id);
      const inQ = qd.items?.find((x: any) => x.appointmentId === a.id);
      const v = { status: r.status, rc: rc.length, bound: rc[0] ? r.depositSaleId === rc[0].id : null, state: inf?.state, due: inf?.refundDueSatang, inQueue: inQ?.info?.state ?? null };
      view.push(v);
      if (rc.length > 1 || (rc.length === 1 && r.depositSaleId !== rc[0].id)) bad.push(v);
      if (rc.length === 1 && r.status === "CANCELLED" && (inf?.state !== "REFUND_DUE" || inQ?.info?.state !== "REFUND_DUE" || inf?.refundDueSatang !== DEP)) bad.push(v);
    }
    rec("P4b", bad.length === 0, "HIGH", "ร้านยืนยันรับมัดจำ ∥ ลูกค้ายกเลิก ⇒ ไม่มีใบรับลอย · ถ้ามีเงินเข้าบนนัดยกเลิก ⇒ REFUND_DUE 30,000 เห็นในคิวมัดจำ", { bad, view, codes: outs.map((o) => `${o.op}:${o.r?.code ?? (o.r?.ok ? "ok" : o.threw)}`) });
  });
  await step("P4c", async () => {
    const as: Appt[] = [];
    for (let i = 0; i < 3; i++) as.push(await book(ids.uM));
    for (const a of as) {
      const s = await submitNow(a);
      if (!s?.ok) throw new Error(`submit ${J(s)}`);
      await decide(ids.tA, "ownerA", (await slipsOf(a.id))[0].id, { decision: "APPROVE_PARTIAL", amountSatang: 20_000 });
    }
    await pump(["payment.slip.approved"]);
    const pre = await Promise.all(as.map((a) => infoOf(ids.uM, a.id)));
    const outs = await fan("p4c", as.map((a) => [
      { op: "cancel", a: [a.token, ip(), 0, false] },
      { op: "confirm", a: [shop("ownerA"), { unitId: ids.uM, appointmentId: a.id }] },
      { op: "confirm", a: [shop("ownerA2"), { unitId: ids.uM, appointmentId: a.id }], delayMs: 30 },
    ]));
    noteBusy("P4c", outs);
    const qd = await D.depositQueue(shop("ownerA"), { unitId: ids.uM });
    const view: any[] = []; const bad: any[] = [];
    for (const a of as) {
      const r = await apRow(a.id); const rc = await receiptsOf(a.id); const inf = await infoOf(ids.uM, a.id);
      const inQ = qd.items?.find((x: any) => x.appointmentId === a.id);
      const v = { status: r.status, rc: rc.map((x) => x.grand), state: inf?.state, due: inf?.refundDueSatang, inQueue: inQ?.info?.state ?? null };
      view.push(v);
      if (rc.length !== 1 || r.depositSaleId !== rc[0].id) bad.push(v);
      else if (r.status === "CANCELLED" && (inf?.state !== "REFUND_DUE" || inf?.refundDueSatang !== 20_000 || inQ?.info?.state !== "REFUND_DUE")) bad.push(v);
    }
    rec("P4c", pre.every((x) => x?.state === "UNDERPAID") && bad.length === 0, "HIGH", "ยอมรับยอดขาด (UNDERPAID 20,000) ∥ ลูกค้ายกเลิก ⇒ ใบรับเดิม 1 ใบ (ไม่ออกเพิ่ม) · ยกเลิกแล้ว ⇒ REFUND_DUE 20,000 ในคิว", { pre: pre.map((x) => x?.state), bad, view });
  });

  // ═══════════ 3. ริบ ═══════════
  console.log("\n── 3. ริบ: ยกเลิกช้า ∥ ไม่มา ∥ consumer ซ้ำ · เงินเข้าหลังยกเลิก/ไม่มา · คืน ∥ ริบ · ตายกลางทาง ──");
  for (const pct of [50, 100]) {
    await step(`P3a-${pct}`, async () => {
      const a = await bookWith(ids.uM, [["booking.late.lateCancelMode", "FORFEIT"], ["booking.deposit.forfeitPct", pct]]);
      await confirmShop(a);
      const L = lateNow(a);
      const outs = await fan(`p3a${pct}`, [
        [{ op: "cancel", a: [a.token, ip(), L, true] }],
        [{ op: "noshow", a: [ids.tA, ids.uM, a.id] }],
        [{ op: "forfeitLate", a: [ids.tA, ids.uM, a.id] }, { op: "forfeitLate", a: [ids.tA, ids.uM, a.id], delayMs: 120 }],
        [{ op: "forfeitNS", a: [ids.tA, ids.uM, a.id], delayMs: 60 }, { op: "cancel", a: [a.token, ip(), L, true], delayMs: 10 }],
      ]);
      noteBusy(`P3a-${pct}`, outs);
      await pump();
      const fan2 = await fan(`p3a${pct}r`, [[{ op: "forfeitLate", a: [ids.tA, ids.uM, a.id] }], [{ op: "forfeitNS", a: [ids.tA, ids.uM, a.id] }], [{ op: "forfeitLate", a: [ids.tA, ids.uM, a.id] }]]);
      noteBusy(`P3a-${pct}r`, fan2);
      const r = await apRow(a.id); const fb = await forfeitsOf(a.id); const paid = fb.filter((b) => b.status === "PAID");
      const want = Math.floor((DEP * pct) / 100);
      const ev = await evs("booking.deposit_forfeited", a.id);
      const dep = await depRow(r.depositSaleId);
      const inf = await infoOf(ids.uM, a.id);
      rec(`P3a-${pct}`, paid.length === 1 && Number(paid[0].grand) === want && ev.length === 1 && dep && dep.used + dep.refunded <= dep.amount && inf?.forfeitedSatang === want, "HIGH",
        `ยกเลิกช้า(ยอมเสีย) ∥ NO_SHOW ∥ ริบซ้ำ 4 ทาง (pct ${pct}) ⇒ บิลริบ PAID 1 ใบ ${want} · deposit_forfeited 1 · ไม่เกิน pct×ที่จ่าย`,
        { status: `${r.status}/${r.cancelReason}`, bills: fb.map((b) => `${b.status}:${b.grand}`), forfeitedEv: ev.length, dep, state: inf?.state, forfeited: inf?.forfeitedSatang, due: inf?.refundDueSatang, codes: outs.map((o) => `${o.op}:${o.r?.code ?? (o.r?.ok ? "ok" : o.r?.forfeited ?? o.threw)}`) });
    });
  }
  await step("P3b", async () => {
    // BLOCK (ค่าเริ่ม) + ยอมรับ ⇒ ต้องคง LATE_CHANGE ไม่ริบ · pct null ⇒ ไม่ริบ
    const a = await book(ids.uM);
    await confirmShop(a);
    const c = await ON.cancelOnline(a.token, { ip: ip(), now: new Date(lateNow(a)), acceptForfeit: true });
    const b = await bookWith(ids.uM, [["booking.late.lateCancelMode", "FORFEIT"], ["booking.deposit.forfeitPct", null]]);
    await confirmShop(b);
    const outs = await fan("p3b", [[{ op: "cancel", a: [b.token, ip(), lateNow(b), true] }], [{ op: "noshow", a: [ids.tA, ids.uM, b.id] }], [{ op: "forfeitLate", a: [ids.tA, ids.uM, b.id], delayMs: 50 }]]);
    noteBusy("P3b", outs);
    await pump();
    const fa = await forfeitsOf(a.id); const fbb = await forfeitsOf(b.id); const ib = await infoOf(ids.uM, b.id);
    rec("P3b", c?.code === "LATE_CHANGE" && fa.length === 0 && fbb.length === 0 && ib?.state === "REFUND_DUE" && ib?.refundDueSatang === DEP, "HIGH",
      "lateCancelMode BLOCK + acceptForfeit ⇒ LATE_CHANGE ไม่ริบ · forfeitPct null ⇒ ไม่ริบเลย (REFUND_DUE เต็ม) แม้แข่ง NO_SHOW", { blockCode: c?.code, billsA: fa.length, billsB: fbb.length, stateB: ib?.state, dueB: ib?.refundDueSatang });
  });
  await step("P3c", async () => {
    // เงินเข้าหลังยกเลิกช้า (ยังไม่จ่ายตอนยกเลิก) — ลำดับ: แนบสลิป → ยกเลิกช้า(ยอมรับ) → ร้านอนุมัติ+ลงเงิน → consumer booking.cancelled (คิวช้า/ลองใหม่)
    const a = await bookWith(ids.uM, [["booking.late.lateCancelMode", "FORFEIT"], ["booking.deposit.forfeitPct", 100]]);
    const s = await submitNow(a);
    if (!s?.ok) throw new Error(`submit ${J(s)}`);
    const c = await ON.cancelOnline(a.token, { ip: ip(), now: new Date(lateNow(a)), acceptForfeit: true });
    const slipId = (await slipsOf(a.id))[0].id;
    await decide(ids.tA, "ownerA", slipId, { decision: "APPROVE" });
    await pump(["payment.slip.approved"]);
    const mid = await infoOf(ids.uM, a.id);
    await pump(["booking.cancelled"]);
    const fb = await forfeitsOf(a.id); const inf = await infoOf(ids.uM, a.id);
    rec("P3c", fb.length === 0 && inf?.state === "REFUND_DUE" && inf?.refundDueSatang === DEP, "HIGH",
      "ลูกค้ายกเลิกช้าตอนยังไม่จ่าย (ไม่มีอะไรให้ริบ) แล้วเงินจากสลิปเข้าทีหลัง ⇒ ต้องเป็น REFUND_DUE เต็ม (มติ 3) — ห้ามถูกริบเมื่อ consumer booking.cancelled (CUSTOMER_LATE) รันหลังเงินเข้า",
      { cancel: c?.ok ? "ok" : c?.code, afterMoney: mid?.state, final: inf?.state, forfeited: inf?.forfeitedSatang, due: inf?.refundDueSatang, bills: fb.map((b) => `${b.status}:${b.grand}`) });
  });
  await step("P3d", async () => {
    // แข่งจริง: ยกเลิกช้า ∥ consumer สลิปอนุมัติ (3 นัด) — ไม่ระบายคิว booking.cancelled (ดูเฉพาะการริบในตัว cancelOnline)
    const as: Appt[] = [];
    for (let i = 0; i < 3; i++) as.push(await bookWith(ids.uM, [["booking.late.lateCancelMode", "FORFEIT"], ["booking.deposit.forfeitPct", 100]]));
    const evIds: string[] = [];
    for (const a of as) {
      const s = await submitNow(a);
      if (!s?.ok) throw new Error(`submit ${J(s)}`);
      const sid = (await slipsOf(a.id))[0].id;
      await decide(ids.tA, "ownerA", sid, { decision: "APPROVE" });
      evIds.push((await slipEvtOf(sid))[0].id);
    }
    const outs = await fan("p3d", as.map((a, i) => [
      { op: "cancel", a: [a.token, ip(), lateNow(a), true] },
      { op: "consumeEvt", a: [evIds[i]], delayMs: 5 },
      { op: "consumeEvt", a: [evIds[i]], delayMs: 25 },
    ]));
    noteBusy("P3d", outs);
    const view: any[] = []; const bad: any[] = [];
    for (const a of as) {
      const r = await apRow(a.id); const fb = await forfeitsOf(a.id); const late = await audits("booking.deposit.late_money", a.id); const inf = await infoOf(ids.uM, a.id);
      const v = { status: `${r.status}/${r.cancelReason}`, lateMoney: late.length, bills: fb.length, state: inf?.state };
      view.push(v);
      if (late.length && fb.some((b) => b.status === "PAID")) bad.push(v);
    }
    rec("P3d", bad.length === 0, "MED", "ยกเลิกช้า ∥ เงินเข้า (consumer สลิป) ⇒ เงินที่ลงเป็น late_money (เข้าหลังยกเลิก) ต้องไม่ถูกริบ", { bad, view });
  });
  await step("P3e", async () => {
    // NO_SHOW (ยังไม่จ่าย) ∥ consumer สลิปอนุมัติ · 3 นัด
    const as: Appt[] = [];
    for (let i = 0; i < 3; i++) as.push(await book(ids.uM));
    const evIds: string[] = [];
    for (const a of as) {
      const s = await submitNow(a);
      if (!s?.ok) throw new Error(`submit ${J(s)}`);
      const sid = (await slipsOf(a.id))[0].id;
      await decide(ids.tA, "ownerA", sid, { decision: "APPROVE" });
      evIds.push((await slipEvtOf(sid))[0].id);
    }
    const outs = await fan("p3e", as.map((a, i) => [
      { op: "noshow", a: [ids.tA, ids.uM, a.id] },
      { op: "consumeEvt", a: [evIds[i]], delayMs: 3 + i * 10 },
      { op: "consumeEvt", a: [evIds[i]], delayMs: 30 + i * 10 },
    ]));
    noteBusy("P3e", outs);
    const view: any[] = []; const bad: any[] = [];
    for (const a of as) {
      const r = await apRow(a.id); const fb = await forfeitsOf(a.id); const late = await audits("booking.deposit.late_money", a.id); const inf = await infoOf(ids.uM, a.id); const rc = await receiptsOf(a.id);
      const v = { status: r.status, receipts: rc.length, lateMoney: late.length, bills: fb.map((b) => `${b.status}:${b.grand}`), state: inf?.state };
      view.push(v);
      if (rc.length !== 1 || (late.length && fb.some((b) => b.status === "PAID"))) bad.push(v);
    }
    rec("P3e", bad.length === 0, "MED", "NO_SHOW ∥ เงินเข้า ⇒ ใบรับ 1 · เงินที่เข้าหลัง NO_SHOW (late_money) ต้อง REFUND_DUE ไม่ถูกริบ", { bad, view });
  });
  await step("P3f", async () => {
    // คืน ∥ ยกเลิกช้า (pct 50): หน้าต่างระหว่าง commit ยกเลิก กับ บิลริบ
    const a = await bookWith(ids.uM, [["booking.late.lateCancelMode", "FORFEIT"], ["booking.deposit.forfeitPct", 50]]);
    await confirmShop(a);
    const outs = await fan("p3f", [
      [{ op: "cancel", a: [a.token, ip(), lateNow(a), true] }],
      ...[20, 60, 120, 250].map((d) => [{ op: "refund", a: [shop("ownerA"), { unitId: ids.uM, appointmentId: a.id, reason: "โอนคืนแล้ว" }], delayMs: d }]),
    ]);
    noteBusy("P3f", outs);
    await pump();
    const r = await apRow(a.id); const dep = await depRow(r.depositSaleId); const fb = (await forfeitsOf(a.id)).filter((b) => b.status === "PAID"); const cn = await refundsOf(r.depositSaleId);
    const forf = fb.reduce((t, b) => t + Number(b.grand), 0); const refd = cn.reduce((t, b) => t + Number(b.grand), 0);
    rec("P3f", fb.length <= 1 && cn.length <= 1 && forf + refd <= DEP && forf <= DEP / 2 && dep.used + dep.refunded <= dep.amount, "HIGH",
      "คืนมัดจำ 4 ทาง ∥ ยกเลิกช้า pct 50 ⇒ ริบ+คืน ≤ ที่จ่าย · ริบ ≤ 50% · บิลริบ ≤1 · ใบคืน ≤1", { forfeit: forf, refund: refd, dep, codes: outs.map((o) => `${o.op}:${o.r?.code ?? (o.r?.ok ? "ok" : o.threw)}`) });
    info("P3f-detail", "ผลลำดับ (ใครชนะ)", { state: (await infoOf(ids.uM, a.id))?.state });
  });
  await step("P3g", async () => {
    // ตายกลางทาง: สถานะ NO_SHOW commit แล้ว แต่โพรเซสตายก่อนริบ (จำลองสถานะที่ทิ้งไว้ตรงตัว: CAS + emitNoShowTx ใน tx เดียว แล้วไม่เรียกริบ)
    const a = await book(ids.uM);
    await confirmShop(a);
    await P.$transaction(async (tx: any) => {
      await tx.appointment.updateMany({ where: { id: a.id, tenantId: ids.tA, unitId: ids.uM }, data: { status: "NO_SHOW" } });
      await BK.emitNoShowTx(tx, { tenantId: ids.tA, unitId: ids.uM, appointmentId: a.id, customerId: null, serviceId: PERM_OF[ids.uM] });
    });
    const before = await infoOf(ids.uM, a.id);
    const errs = await pump();
    const after = await infoOf(ids.uM, a.id);
    const fb = await forfeitsOf(a.id);
    info("P3g-state", "สถานะที่ทิ้งไว้หลังโพรเซสตาย (ก่อน/หลังระบายคิว booking.no_show)", { before: before?.state, beforeDue: before?.refundDueSatang, after: after?.state, afterDue: after?.refundDueSatang, bills: fb.length, pumpErrs: errs });
    // ORACLE-EDIT (ผู้คุม 30 ต.ค. · V5): ไม่กู้อัตโนมัติ ⇒ ต้องค้าง FORFEIT_PENDING (ไม่ใช่ REFUND_DUE) · ไม่มีบิลริบอัตโนมัติ · ปุ่ม "ริบ" ของร้านได้ผลครั้งเดียว ยอดตาม pct
    const btn = await Promise.all([0, 1, 2].map(() => D.forfeitDepositByShop(shop("ownerA"), { unitId: ids.uM, appointmentId: a.id })));
    const fbAfter = (await forfeitsOf(a.id)).filter((b) => b.status === "PAID");
    const fin = await infoOf(ids.uM, a.id);
    rec("P3g", after?.state === "FORFEIT_PENDING" && fb.length === 0 && btn.every((x: any) => x?.ok === true) && fbAfter.length === 1 && Number(fbAfter[0].grand) === DEP && fin?.state === "FORFEITED", "MED",
      "NO_SHOW commit แล้วโพรเซสตายก่อนริบ ⇒ ค้าง FORFEIT_PENDING (ไม่กู้อัตโนมัติ · มติ V5) · ไม่มีบิลริบ · ร้านกด \"ริบ\" 3 ครั้งพร้อมกัน ⇒ บิลริบ 1 ใบ 30,000",
      { after: after?.state, due: after?.refundDueSatang, autoBills: fb.length, button: btn.map((x: any) => x?.ok ? `ok${x.duplicated ? "(dup)" : ""}` : x?.code), bills: fbAfter.map((b) => b.grand), final: fin?.state });
    // ตายจริง: ฆ่าโพรเซสระหว่าง setAppointmentStatus (หลายจังหวะ)
    const seen: any[] = [];
    for (const ms of [40, 90, 160, 260]) {
      const b = await book(ids.uM);
      await confirmShop(b);
      await fan(`p3g-kill${ms}`, [[{ op: "noshow", a: [ids.tA, ids.uM, b.id] }]], { killAfterMs: ms });
      const r = await apRow(b.id); const bills = await forfeitsOf(b.id); const inf = await infoOf(ids.uM, b.id);
      seen.push({ killMs: ms, status: r.status, bills: bills.length, state: inf?.state, due: inf?.refundDueSatang });
    }
    info("P3g-kill", "SIGKILL ระหว่าง setAppointmentStatus NO_SHOW (จังหวะต่าง ๆ)", seen);
  });

  // ═══════════ 7. กะ POS ปิด ═══════════
  console.log("\n── 7. กะ POS ปิด: ริบล้ม → เปิดกะ → ระบายคิว ⇒ ไม่ริบซ้ำ ──");
  await step("P7", async () => {
    const ns = await book(ids.uX);
    await confirmShop(ns);
    const lc = await bookWith(ids.uX, [["booking.late.lateCancelMode", "FORFEIT"], ["booking.deposit.forfeitPct", 50]]);
    await confirmShop(lc);
    await patchShift(true);
    let nsRes: any; let lcRes: any;
    try {
      nsRes = await BK.setAppointmentStatus(ids.tA, ids.uX, ns.id, "NO_SHOW");
      lcRes = await ON.cancelOnline(lc.token, { ip: ip(), now: new Date(lateNow(lc)), acceptForfeit: true });
      await pump(); // คิวทำงานระหว่างกะยังปิด
    } finally { await patchShift(false); }
    const mid = { ns: (await forfeitsOf(ns.id)).length, lc: (await forfeitsOf(lc.id)).length };
    const errs = await pump(); // เปิดกะแล้วระบาย
    const afterPump = { ns: (await forfeitsOf(ns.id)).filter((b) => b.status === "PAID").length, lc: (await forfeitsOf(lc.id)).filter((b) => b.status === "PAID").length };
    // ORACLE-EDIT (ผู้คุม 30 ต.ค. · V5): สถานะหลังเปิดกะ+ระบายคิว ต้อง FORFEIT_PENDING ทั้งคู่ (ไม่กู้อัตโนมัติ) · แล้วร้านกด "ริบ" พร้อมกัน 3 ครั้งต่อนัด
    const pendNs = (await infoOf(ids.uX, ns.id))?.state; const pendLc = (await infoOf(ids.uX, lc.id))?.state;
    const btnNs = await Promise.all([0, 1, 2].map(() => D.forfeitDepositByShop(shop("ownerA"), { unitId: ids.uX, appointmentId: ns.id })));
    const btnLc = await Promise.all([0, 1, 2].map(() => D.forfeitDepositByShop(shop("ownerA"), { unitId: ids.uX, appointmentId: lc.id })));
    const btnBills = { ns: (await forfeitsOf(ns.id)).filter((b) => b.status === "PAID").map((b) => Number(b.grand)), lc: (await forfeitsOf(lc.id)).filter((b) => b.status === "PAID").map((b) => Number(b.grand)) };
    // ทางกู้มือ/ซ้ำ: forfeitAfterNoShow + forfeitAfterLateCancel พร้อมกัน 3 โพรเซส
    const outs = await fan("p7", [0, 1, 2].map(() => [{ op: "forfeitNS", a: [ids.tA, ids.uX, ns.id] }, { op: "forfeitLate", a: [ids.tA, ids.uX, lc.id] }]));
    noteBusy("P7", outs);
    await pump();
    const fns = (await forfeitsOf(ns.id)).filter((b) => b.status === "PAID"); const flc = (await forfeitsOf(lc.id)).filter((b) => b.status === "PAID");
    const ins = await infoOf(ids.uX, ns.id); const ilc = await infoOf(ids.uX, lc.id);
    info("P7-shift", "ระหว่างกะปิด", { noShowResult: { ok: nsRes?.ok, reason: nsRes?.reason?.slice?.(0, 100) }, lateCancel: lcRes?.ok ? "ok" : lcRes?.code, billsWhileClosed: mid, afterReopenPump: afterPump, pumpErrs: errs });
    rec("P7", fns.length <= 1 && flc.length <= 1 && (fns[0] ? Number(fns[0].grand) === DEP : true) && (flc[0] ? Number(flc[0].grand) === DEP / 2 : true), "HIGH",
      "กะปิด ⇒ ริบล้ม · เปิดกะ + ระบายคิว + ริบซ้ำ 3 โพรเซส ⇒ ไม่มีบิลริบเกิน 1 ต่อมัดจำ · ยอดตาม pct", { ns: fns.map((b) => b.grand), lc: flc.map((b) => b.grand), nsState: ins?.state, lcState: ilc?.state });
    // ORACLE-EDIT (ผู้คุม 30 ต.ค. · V5): ริบที่ล้มเพราะกะปิด ⇒ ไม่กู้อัตโนมัติ · FORFEIT_PENDING · ปุ่มริบได้ผลครั้งเดียว ยอดตาม pct (ns 100% · lc 50% = ยอดที่ลูกค้ายอมรับ)
    rec("P7-recover", afterPump.lc === 0 && afterPump.ns === 0 && pendNs === "FORFEIT_PENDING" && pendLc === "FORFEIT_PENDING"
      && [...btnNs, ...btnLc].every((x: any) => x?.ok === true) && J(btnBills.ns) === J([DEP]) && J(btnBills.lc) === J([DEP / 2]), "MED",
      "ริบที่ล้มเพราะกะปิด ⇒ เปิดกะ+ระบายคิวแล้วไม่ริบเอง (มติ V5) · ค้าง FORFEIT_PENDING ทั้งไม่มา/ยกเลิกช้า · ร้านกด \"ริบ\" 3 ครั้งพร้อมกัน ⇒ บิลริบ 1 ใบต่อมัดจำ ยอดถูก",
      { afterPump, pending: { ns: pendNs, lc: pendLc }, button: { ns: btnNs.map((x: any) => x?.ok ? `ok${x.duplicated ? "(dup)" : ""}` : x?.code), lc: btnLc.map((x: any) => x?.ok ? `ok${x.duplicated ? "(dup)" : ""}` : x?.code) }, btnBills, nsDue: ins?.refundDueSatang, lcDue: ilc?.refundDueSatang });
  });

  // ═══════════ 5. ยกเว้นสมาชิก ═══════════
  console.log("\n── 5. ยกเว้นสมาชิก (ยิงพร้อมกัน · สวมเบอร์) ──");
  await step("P5", async () => {
    const tok = (pid: string) => sqcIdentityToken(SECRET, { tenantId: ids.tA, partyId: pid, nowMs: Date.now(), ttlMin: 60 });
    const mk = (kind: string, extra: Record<string, unknown>) => {
      const s = nextSlot(ids.uO);
      return { op: "book", tag: kind, a: [ref(ids.uO), { serviceId: ids.PERM_O, staffId: s.staffId, dateStr: s.dateStr, startMin: s.startMin, idempotencyKey: `svcb8pb-m-${kind}-${randomBytes(5).toString("hex")}`, name: newName(), phone: newPhone(), ...extra }, ip()] };
    };
    const outs = await fan("p5", [
      [mk("goldLine", { who: tok(ids.PG) })],
      [mk("goldPhoneOnline", { name: GOLD.name, phone: GOLD.phone })],
      [mk("plain", {})],
      [mk("spoofLine", { who: tok(ids.PX) })],
      [mk("silverLine", { who: tok(ids.PS) })],
      [mk("goldLine2", { who: tok(ids.PG) })],
    ]);
    noteBusy("P5", outs);
    const dep = Object.fromEntries(outs.map((o) => [o.tag, o.r?.ok ? o.r.dep : `fail:${o.r?.code ?? o.threw}`]));
    const want: Record<string, number> = { goldLine: 0, goldLine2: 0, goldPhoneOnline: DEP, plain: DEP, silverLine: DEP };
    const wrong = Object.entries(want).filter(([k, v]) => dep[k] !== v);
    rec("P5", wrong.length === 0, "HIGH", "จองพร้อมกัน 6 โพรเซส ⇒ GOLD ผ่าน LINE = 0 · GOLD เบอร์ออนไลน์/ลูกค้าทั่วไป/SILVER = 30,000", { dep, wrong });
    rec("P5-spoof", dep.spoofLine === DEP, "MED", "ตัวตน LINE ที่ Party ไม่ใช่ของสมาชิก GOLD (มีแค่เบอร์ตรงกัน) ⇒ ต้องไม่ได้ยกเว้น (บทเรียน B.9: ตัวตนจากลิงก์ยืนยันเท่านั้น ไม่ใช่จากเบอร์)", { spoofLine: dep.spoofLine });
    const v = await ON.loadOnlineBooking(ref(ids.uO), { who: tok(ids.PX) }, { ip: ip() });
    const shown = v?.view?.services?.map?.((x: any) => x.depositSatang) ?? v?.view?.svcs ?? null;
    info("P5-view", "หน้าจอง (ตัวตนสวมเบอร์) แสดงมัดจำ", shown);
  });

  // ═══════════ 6. ข้ามร้าน ═══════════
  console.log("\n── 6. ข้ามร้าน/ข้ามหน่วย + คำตอบเดียว ──");
  await step("P6", async () => {
    const a = await book(ids.uM);
    const b = await book(ids.uB);
    const flip = (t: string) => t.slice(0, -1) + (t.endsWith("A") ? "B" : "A");
    const bad = ["", "x", 12345, null, flip(a.token), randomBytes(32).toString("base64url"), `${a.token}x`, a.token.slice(0, 20)];
    const subs = await Promise.all(bad.map((t) => D.submitDepositSlip(t, { file: { data: png(), contentType: "image/png" }, idempotencyKey: `svcb8pb-x-${randomBytes(5).toString("hex")}` }, { ip: ip(), deps: { put, del } })));
    const loads = await Promise.all(bad.map((t) => D.loadDepositPay(t, { ip: ip() })));
    const sSet = new Set(subs.map((r) => J(r))); const lSet = new Set(loads.map((r) => J(r)));
    rec("P6-x7", sSet.size === 1 && lSet.size === 1 && subs[0]?.code === "NOT_FOUND", "HIGH", "token เสีย 8 แบบ ⇒ submitDepositSlip / loadDepositPay คำตอบเดียวกันทุกไบต์", { submit: [...sSet], load: [...lSet] });
    // สลิปของร้าน A ที่ refId ชี้นัดร้าน B / นัดสาขาอื่น ⇒ consumer ห้ามลงเงิน
    const raw = async (u: string, refId: string) => SV.submitSlip({ tenantId: ids.tA }, { unitId: u, domain: "BOOKING", refType: "APPT_DEPOSIT", refId, file: { data: png(), contentType: "image/png" }, qrPayload: goodSlip(DEP, "x"), expectedSatang: DEP, expectedPayerNames: ["x"], idempotencyKey: `svcb8pb-raw-${randomBytes(6).toString("hex")}` }, { put, del });
    const s1 = await raw(ids.uO, b.id);
    const s2 = await raw(ids.uO, a.id);
    const evIds = [...(await slipEvtOf(s1.slipId)), ...(await slipEvtOf(s2.slipId))].map((e) => e.id);
    const outs = await fan("p6", [evIds.map((e) => ({ op: "consumeEvt", a: [e] })), evIds.map((e) => ({ op: "consumeEvt", a: [e] })),
      [{ op: "consume", a: [{ tenantId: ids.tB, unitId: ids.uB, payload: { slipId: s1.slipId } }] }, { op: "consume", a: [{ tenantId: ids.tB, unitId: ids.uB, payload: { slipId: s2.slipId, refId: b.id, amountSatang: DEP } }] }]]);
    noteBusy("P6", outs);
    const ra = await apRow(a.id); const rb = await apRow(b.id);
    rec("P6-consumer", !ra.depositPaidAt && !rb.depositPaidAt && (await receiptsOf(a.id)).length === 0 && (await receiptsOf(b.id)).length === 0, "HIGH",
      "สลิปอนุมัติของสาขา o ที่ refId ชี้นัดร้าน B / นัดสาขา m + event ปลอม tenantId ร้าน B ⇒ ไม่ลงเงินข้ามร้าน/ข้ามหน่วย", { slip1: s1?.status, slip2: s2?.status, aPaid: !!ra.depositPaidAt, bPaid: !!rb.depositPaidAt });
    // จอร้านข้ามร้าน/ข้ามหน่วย ⇒ NOT_FOUND คำเดียว
    const nf1 = await D.confirmDepositByShop(shop("ownerB", ids.tB), { unitId: ids.uM, appointmentId: a.id });
    const nf2 = await D.confirmDepositByShop(shop("ownerA"), { unitId: ids.uM, appointmentId: b.id });
    const nf3 = await D.confirmDepositByShop(shop("ownerA"), { unitId: ids.uO, appointmentId: a.id });
    const nf4 = await D.confirmDepositByShop(shop("ownerA"), { unitId: ids.uM, appointmentId: `svcb8pb_nope_${RUN}` });
    const nf5 = await D.refundDepositByShop(shop("ownerB", ids.tB), { unitId: ids.uB, appointmentId: a.id, reason: "x" });
    const nfSet = new Set([nf1, nf2, nf3, nf4].map((r) => J(r)));
    const bill = await D.depositForBill({ tenantId: ids.tA, unitId: ids.uO }, a.id, 10_000);
    rec("P6-shop", nfSet.size === 1 && nf1?.code === "NOT_FOUND" && nf5?.code === "NOT_FOUND" && bill === null && (await receiptsOf(a.id)).length === 0, "HIGH",
      "ยืนยัน/คืน ข้ามร้าน · ข้ามหน่วย · id ไม่มีจริง ⇒ NOT_FOUND ข้อความเดียวกัน · depositForBill ข้ามหน่วย null", { confirm: [...nfSet], refund: nf5?.code, bill });
  });

  // ═══════════ 8. 40P01 / BUSY ═══════════
  console.log("\n── 8. 40P01 / BUSY / throw ในทุกฉากยิงพร้อมกัน ──");
  const hard = busyLog.flatMap((b) => b.outs.filter((o) => o.threw || BADRX.test(J(o))).map((o) => ({ id: b.id, op: o.op, threw: o.threw, r: o.r })));
  const busy = busyLog.flatMap((b) => b.outs.filter((o) => o?.r?.code === "BUSY").map((o) => ({ id: b.id, op: o.op })));
  rec("P8", hard.length === 0, "MED", "ไม่มี throw / P2028 / 40P01 / deadlock รั่วออกจากฟังก์ชันสาธารณะ/จอร้าน (BUSY คือคำตอบที่ยอมรับได้)", { hard: hard.slice(0, 8), busy });
} catch (e) {
  rec("FATAL", false, "ERR", "probe ล้ม", errMsg(e));
} finally {
  for (const f of goFiles) { try { unlinkSync(f); } catch { /* */ } }
  try { await patchShift(false).catch(() => undefined); await cleanup(TIDS); await cleanupGlobal(); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); }
  const left = (await q(`SELECT count(*)::int AS n FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`]))[0].n;
  console.log(`\n(ล้างข้อมูลแล้ว · ร้านค้าง ${left})`);
  const bad = results.filter((r) => !r.ok);
  console.log(`\n══ สรุป: ${results.length - bad.length} HOLD · ${bad.length} BREACH/ERR ══`);
  for (const r of bad) console.log(`  🔴 [${r.id}] (${r.sev}) ${r.what} — ${r.detail.slice(0, 700)}`);
  console.log(`\nPROBE_SUMMARY ${J({ total: results.length, fail: bad.map((r) => `${r.id}:${r.sev}`) })}`);
  await pool.end();
  try { await P.$disconnect(); } catch { /* */ }
  process.exit(0);
}
