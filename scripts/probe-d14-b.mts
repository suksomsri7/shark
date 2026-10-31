// PROBE — SVC D.14 reviewer B (credit.ts R1 ref กันหักซ้ำ · ข้อเสนอพร้อมกันหลายโพรเซส · provider ล้ม · aiProposalId ปลอม/ข้ามร้าน · X1 · 40P01) · ไม่ใช่ข้อสอบ · ไม่แก้ src
// รัน: bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/probe-d14-b.mts
// ข้อมูลใต้ร้าน `qc-svc-d14pb-*` + ผู้ใช้ `svc-d14pb-*@shark.local` · ไม่เรียก AI จริง (ตัวอ่านจำลองเท่านั้น · fetch นอกเครื่อง/openrouter = บล็อก) · ล้างใน finally
// หมวด: CR credit.ts ตรง · NR ผู้เรียกเดิม (ไม่มี ref) · CC เสนอพร้อมกัน · XT ข้ามร้าน · PF provider ล้ม · FG aiProposalId ปลอม · XS ไม่พบเดียวกัน · DL 40P01
/* eslint-disable @typescript-eslint/no-explicit-any */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";

const SELF = fileURLToPath(import.meta.url);
const ROOT = join(dirname(SELF), "..");
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 260);
const J = (x: unknown) => { try { return JSON.stringify(x); } catch { return String(x); } };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const b64 = (u: Uint8Array) => Buffer.from(u).toString("base64");
const unb64 = (s: string) => Uint8Array.from(Buffer.from(s, "base64"));
const JPG = [0xff, 0xd8, 0xff, 0xe0];
const jpgB = (seed: string) => Uint8Array.from(Buffer.concat([Buffer.from(JPG), createHash("sha256").update(`pb14:${seed}`).digest()]));
const jpg = (seed: string) => ({ data: jpgB(seed), contentType: "image/jpeg" });
const sha = (u: Uint8Array) => createHash("sha256").update(Buffer.from(u)).digest("hex");
const MODEL = "anthropic/claude-sonnet-5";
const PUT = async () => {};

// ═══════════ กันออกนอกเครื่อง (หลัก+ลูก) · ไม่มี provider จริง ═══════════
const BLOCKED: string[] = [];
const REAL_FETCH = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : String(input?.url ?? "");
  let host = ""; try { host = new URL(url).hostname; } catch { /* */ }
  if (host === "127.0.0.1" || host === "localhost" || host.endsWith(".neon.tech")) return REAL_FETCH(input, init);
  BLOCKED.push(host.slice(0, 80));
  return new Response(JSON.stringify({ message: "blocked by probe" }), { status: 503, headers: { "content-type": "application/json" } });
}) as typeof fetch;
process.env.SHARK_AI_KEY = "probe-d14-fake-key";
delete process.env.SHARK_AI_MOCK;
delete process.env.SHARK_AI_MODEL;
delete process.env.SHARK_AI_PRICE_MARKUP;

type StubSpec = { value?: unknown; confidence?: unknown; delayMs?: number; throws?: boolean; tin?: number; tout?: number };
const mkReader = (spec: StubSpec, onRead?: () => Promise<void>) => {
  const calls: any[] = [];
  return {
    calls,
    reader: {
      async read(input: any) {
        calls.push(input);
        if (onRead) await onRead();
        if (spec.delayMs) await sleep(spec.delayMs);
        if (spec.throws) throw new Error("probe stub reader failed");
        return { value: spec.value as any, confidence: spec.confidence as any, model: MODEL, tokensIn: spec.tin ?? 1200, tokensOut: spec.tout ?? 30 };
      },
    },
  };
};

// ═══════════ โหมดลูก ═══════════
{
  const ix = process.argv.indexOf("--child");
  if (ix >= 0) {
    let out: any = { results: [], calls: -1 };
    try {
      const job = JSON.parse(Buffer.from(process.argv[ix + 1] ?? "", "base64url").toString("utf8")) as { op: string; items: any[]; stub: StubSpec; at: number };
      const D = (await import("@/lib/modules/dorm" as string)) as any;
      const CR = (await import("@/lib/ai/credit" as string)) as any;
      const st = mkReader(job.stub ?? {});
      const w = job.at - Date.now();
      if (w > 0) await sleep(w);
      const results = await Promise.all(job.items.map(async (x: any) => {
        try {
          if (job.op === "propose") return await D.proposeMeterReading(x.ctx, { ...x.input, photo: { data: unb64(x.input.photo.data), contentType: x.input.photo.contentType } }, { reader: st.reader, put: PUT });
          if (job.op === "charge") return { amount: await CR.chargeUsage({ tenantId: x.tenantId }, x.input) };
          return { childFail: `op ${job.op}` };
        } catch (e) { return { threw: errMsg(e) }; }
      }));
      out = { results, calls: st.calls.length };
    } catch (e) { out = { results: [{ childFail: errMsg(e) }], calls: -1 }; }
    console.log(`CHILD_RESULT ${JSON.stringify(out)}`);
    try { const { prisma } = (await import("@/lib/core/db" as string)) as any; await prisma.$disconnect(); } catch { /* */ }
    process.exit(0);
  }
}

loadSvcQcEnv("probe-d14-b");
if (process.env.CI || process.env.APP_ENV === "production") { console.error("🔴 probe: env ต้องห้าม"); process.exit(4); }

type R = { id: string; ok: boolean; sev: string; what: string; detail: string };
const results: R[] = [];
const rec = (id: string, ok: boolean, sev: string, what: string, detail: unknown) => {
  const d = typeof detail === "string" ? detail : J(detail);
  results.push({ id, ok, sev, what, detail: d });
  console.log(`  ${ok ? "✅ HOLD" : "❌ BREACH"} [${id}] (${sev}) ${what} — ${d.slice(0, 1400)}`);
};
const BADRX = /P2028|P2024|P2002|P2034|P2010|40P01|Unique constraint|timed out|Transaction already closed/i;
const badOf = (rs: any[]) => rs.filter((x) => x?.threw || x?.childFail || BADRX.test(J(x)));
const codeOf = (x: any) => (x?.threw ? "THREW" : x?.childFail ? "CHILD" : x?.ok === true ? (x.cached ? "OK_CACHED" : "OK") : x?.code ?? (typeof x?.amount === "number" ? `amt:${x.amount}` : J(x).slice(0, 40)));
const tally = (rs: any[]) => { const t: Record<string, number> = {}; for (const x of rs) t[codeOf(x)] = (t[codeOf(x)] ?? 0) + 1; return t; };
async function fanout(op: string, groups: any[][], stub: StubSpec = {}, leadMs = 13_000): Promise<{ results: any[]; calls: number }> {
  const at = Date.now() + leadMs;
  const outs = await Promise.all(groups.map((items) => new Promise<{ results: any[]; calls: number }>((resolve) => {
    const child = spawn(process.execPath, [...process.execArgv, SELF, "--child", Buffer.from(JSON.stringify({ op, items, stub, at })).toString("base64url")], { cwd: ROOT, env: process.env });
    let buf = "";
    child.stdout.on("data", (d) => { buf += String(d); });
    child.stderr.on("data", (d) => { buf += String(d); });
    child.on("close", (code) => {
      const m = /CHILD_RESULT (\{.*\})/.exec(buf);
      try { resolve(m ? JSON.parse(m[1]) : { results: items.map(() => ({ childFail: `exit=${code} ${buf.split("\n").slice(-3).join(" | ").slice(0, 200)}` })), calls: -1 }); } catch { resolve({ results: items.map(() => ({ childFail: "parse" })), calls: -1 }); }
    });
  })));
  return { results: outs.flatMap((o) => o.results), calls: outs.reduce((s, o) => s + (o.calls < 0 ? 1000 : o.calls), 0) };
}

const { prisma } = (await import("@/lib/core/db" as string)) as { prisma: any };
const D: any = await import("@/lib/modules/dorm" as string);
const CR: any = await import("@/lib/ai/credit" as string);
const PR: any = await import("@/lib/ai/pricing" as string);
const COST = PR.costMicroUsd(MODEL, 1200, 30) as number;

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
async function leftovers(tids: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const t of await tablesWithTenant()) {
    try { const r: { n: number }[] = await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, tids); if ((r[0]?.n ?? 0) > 0) out.push(`${t}:${r[0].n}`); } catch { /* */ }
  }
  if (await prisma.tenant.count({ where: { id: { in: tids } } })) out.push("Tenant");
  return out;
}

const STAMP = `${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;
const TODAY = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const P = (k: number) => { const y = Number(TODAY.slice(0, 4)), m = Number(TODAY.slice(5, 7)) - 1 + k; const yy = y + Math.floor(m / 12), mm = ((m % 12) + 12) % 12; return `${yy}-${String(mm + 1).padStart(2, "0")}`; };
const P0 = P(0);
const tenantIds: string[] = [];
let exitCode = 0;
try {
  const stale = await prisma.tenant.findMany({ where: { slug: { startsWith: "qc-svc-d14pb-" } }, select: { id: true } });
  if (stale.length) await cleanup(stale.map((t: { id: string }) => t.id));
  await prisma.user.deleteMany({ where: { email: { startsWith: "svc-d14pb-" } } });

  // ═══════════ fixtures ═══════════
  const mkTenant = async (tag: string) => { const t = await prisma.tenant.create({ data: { name: `PB D14 ${tag}`, slug: `qc-svc-d14pb-${tag}-${STAMP}` } }); tenantIds.push(t.id); return t.id as string; };
  const A = await mkTenant("a"), B = await mkTenant("b"), N = await mkTenant("n");
  const mkUnit = async (tenantId: string, tag: string, type = "DORM") => (await prisma.businessUnit.create({ data: { tenantId, type, name: `หอ PB14 ${tag}`, slug: `pb14${tag}-${STAMP}` } })).id as string;
  const DA = await mkUnit(A, "a"), DA2 = await mkUnit(A, "a2"), DB = await mkUnit(B, "b"), HA = await mkUnit(A, "h", "HOTEL");
  const mem: Record<string, string> = {};
  const mkUser = async (key: string, tenantId: string, role: string, unitAccess: string[], perms: string[] = []) => {
    const u = await prisma.user.create({ data: { email: `svc-d14pb-${STAMP}-${key}@shark.local`, name: `PB14 ${key}` } });
    const m = await prisma.membership.create({ data: { userId: u.id, tenantId, role, unitAccess, permissions: Object.fromEntries(perms.map((p) => [p, true])), acceptedAt: new Date() } });
    mem[key] = m.id;
    return u.id as string;
  };
  const setVal = async (tenantId: string, key: string, scopeId: string, value: unknown) => {
    await prisma.settingValue.deleteMany({ where: { tenantId, key, scope: "UNIT", scopeId } });
    await prisma.settingValue.create({ data: { tenantId, key, scope: "UNIT", scopeId, value, setById: "pb-d14" } });
  };
  const ty = async (t: string, u: string) => (await prisma.hotelRoomType.create({ data: { tenantId: t, unitId: u, name: "มาตรฐาน", capacity: 2, baseRateSatang: 450_000, depositSatang: 0, rentMode: "MONTHLY" } })).id as string;
  const bld = async (t: string, u: string, name: string, s: number) => (await prisma.roomBuilding.create({ data: { tenantId: t, unitId: u, name, floors: 3, sortOrder: s } })).id as string;
  const room = async (t: string, u: string, tyId: string, b: string, n: string) => (await prisma.hotelRoom.create({ data: { tenantId: t, unitId: u, roomTypeId: tyId, number: n, buildingId: b, floorNo: 1, floor: "1" } })).id as string;
  const ME: Record<string, string> = {};
  const meter = async (t: string, u: string, roomId: string | null, kind: string, extra: Record<string, unknown> = {}) => {
    const id = (await prisma.dormMeter.create({ data: { tenantId: t, unitId: u, roomId, kind, role: roomId ? "ROOM" : "MAIN", startReading: 900, digits: 5, ...extra } })).id as string;
    for (const [k, v] of [[-4, 1000], [-3, 1100], [-2, 1200], [-1, 1300]] as const)
      await prisma.dormMeterReading.create({ data: { tenantId: t, unitId: u, meterId: id, periodKey: P(k), kind: "PERIOD", value: v, source: "IMPORT", readAt: new Date(`${P(k)}-25T03:00:00Z`) } });
    return id;
  };
  const tyA = await ty(A, DA), tyA2 = await ty(A, DA2), tyB = await ty(B, DB);
  const B1 = await bld(A, DA, "อาคาร หนึ่ง", 1), B2 = await bld(A, DA, "อาคาร สอง", 2), BA2 = await bld(A, DA2, "อาคาร", 1), BB = await bld(B, DB, "อาคาร บี", 1);
  const RM: Record<string, string> = {};
  for (const n of ["101", "102", "103", "104", "105", "106", "107", "108"]) { RM[n] = await room(A, DA, tyA, B1, n); ME[n] = await meter(A, DA, RM[n], "ELEC"); }
  RM["201"] = await room(A, DA, tyA, B2, "201"); ME["201"] = await meter(A, DA, RM["201"], "ELEC");
  ME.MAIN2 = await meter(A, DA, null, "ELEC", { buildingId: B2 });
  RM.a2 = await room(A, DA2, tyA2, BA2, "301"); ME.a2 = await meter(A, DA2, RM.a2, "ELEC");
  RM.b1 = await room(B, DB, tyB, BB, "101"); ME.b1 = await meter(B, DB, RM.b1, "ELEC"); ME.b2 = await meter(B, DB, RM.b1, "WATER");
  const OWN = await mkUser("own", A, "OWNER", ["*"]);
  const MS = await mkUser("ms", A, "STAFF", [DA], ["dorm.meter.read"]);
  const VW = await mkUser("vw", A, "STAFF", [DA], ["dorm.view"]);
  const OWNB = await mkUser("ownb", B, "OWNER", ["*"]);
  await setVal(A, "rooms.access.managerScope", DA, "BUILDING");
  await setVal(A, "rooms.access.buildingAssignments", DA, { [mem.ms]: [B1] });
  for (const t of [A, B]) await prisma.aiCreditWallet.create({ data: { tenantId: t, balanceMicro: 5_000_000, grantedAt: new Date() } });
  const cO = { tenantId: A, actorUserId: OWN }, cMS = { tenantId: A, actorUserId: MS }, cVW = { tenantId: A, actorUserId: VW }, cB = { tenantId: B, actorUserId: OWNB };
  const bal = async (t: string) => (await prisma.aiCreditWallet.findUnique({ where: { tenantId: t } }))?.balanceMicro ?? null;
  const usageBy = (t: string, ref?: string) => prisma.aiCreditTxn.findMany({ where: { tenantId: t, kind: "USAGE", ...(ref !== undefined ? { ref } : {}) } });
  const refOf = (meterId: string, data: Uint8Array, periodKey = P0) => `dorm.meter.ai:${meterId}:${periodKey}:${sha(data)}`;
  const props = (t: string, ref: string) => prisma.auditLog.findMany({ where: { tenantId: t, action: "dorm.meter.ai.proposed", after: { path: ["ref"], equals: ref } } });
  const files = (t = A) => prisma.fileAsset.count({ where: { tenantId: t } });
  const propose = (ctx: any, unitId: string, meterId: string, photo: any, deps: any = {}) => D.proposeMeterReading(ctx, { unitId, meterId, periodKey: P0, photo }, { put: PUT, ...deps });
  const submit1 = async (ctx: any, unitId: string, item: any) => { const r = await D.submitReadings(ctx, { unitId, periodKey: P0, items: [item] }, { put: PUT }); return r?.ok ? r.results?.[0] : r; };
  const rowsOf = (meterId: string) => prisma.dormMeterReading.count({ where: { meterId, periodKey: P0, kind: "PERIOD" } });
  console.log(`(ร้าน A/B/N · งวด ${P0} · COST ${COST})`);

  // ═══════════ CR credit.ts ตรง (R1) ═══════════
  console.log("\n── CR credit.ts ref ──");
  {
    const ref = `probe-cr-${STAMP}`;
    const b0 = await bal(A);
    const a1 = await CR.chargeUsage({ tenantId: A }, { source: "CHAT", model: MODEL, tokensIn: 1200, tokensOut: 30, ref });
    const a2 = await CR.chargeUsage({ tenantId: A }, { source: "CHAT", model: MODEL, tokensIn: 1200, tokensOut: 30, ref });
    const a3 = await CR.chargeUsage({ tenantId: A }, { source: "CHAT", model: MODEL, tokensIn: 9000, tokensOut: 900, ref }); // ref เดิม คนละยอด
    const b1 = await bal(A);
    const rows = await usageBy(A, ref);
    rec("CR-1", a1 === COST && a2 === 0 && a3 === 0 && b0! - b1! === COST && rows.length === 1 && rows[0].amountMicro === -COST && rows[0].balanceAfter === b1, "CRITICAL",
      "ref เดิมซ้ำ (ยอดเท่า/ต่างยอด) ⇒ หักครั้งเดียว · ครั้งหลังคืน 0 · กระเป๋าลดเท่ายอดแรก · แถว 1 · balanceAfter ตรงกระเป๋า", { a1, a2, a3, delta: b0! - b1!, rows: rows.length, balanceAfter: rows[0]?.balanceAfter, wallet: b1 });
    const bb0 = await bal(B);
    const bA = await CR.chargeUsage({ tenantId: B }, { source: "CHAT", model: MODEL, tokensIn: 1200, tokensOut: 30, ref });
    const bb1 = await bal(B);
    rec("CR-2", bA === COST && bb0! - bb1! === COST && (await usageBy(B, ref)).length === 1 && (await bal(A)) === b1, "CRITICAL", "ref เดียวกันคนละร้าน ⇒ ร้าน B หักของตัวเอง 1 ครั้ง (unique ต่อร้าน) · ร้าน A ไม่ถูกแตะ", { bA, deltaB: bb0! - bb1!, aAfter: await bal(A) });
    // พร้อมกัน 16 ทางจาก 4 โพรเซส ref เดียว
    const ref2 = `probe-cr-cc-${STAMP}`;
    const c0 = await bal(A);
    const item = { tenantId: A, input: { source: "CHAT", model: MODEL, tokensIn: 1200, tokensOut: 30, ref: ref2 } };
    const fo = await fanout("charge", [0, 1, 2, 3].map(() => [item, item, item, item]));
    const c1 = await bal(A);
    const paid = fo.results.filter((x) => x?.amount === COST).length, zero = fo.results.filter((x) => x?.amount === 0).length;
    rec("CR-3", paid === 1 && zero === 15 && c0! - c1! === COST && (await usageBy(A, ref2)).length === 1, "CRITICAL", "chargeUsage ref เดียว ×16 (4 โพรเซส) ⇒ หัก 1 · คืน 0 อีก 15 · ไม่ throw · กระเป๋าลด 1 ครั้ง", { tally: tally(fo.results), delta: c0! - c1! });
    // ref ชนกับแถว GRANT/TOPUP ของร้าน (ชื่อเดียวกันในตารางเดียว) — ทดสอบความหมายของ namespace
    const gref = `probe-topup-${STAMP}`;
    await CR.topUp(N, 1_000_000, { ref: gref });
    const n0 = await bal(N);
    const nc = await CR.chargeUsage({ tenantId: N }, { source: "CHAT", model: MODEL, tokensIn: 1200, tokensOut: 30, ref: gref });
    const nw = await CR.chargeUsage({ tenantId: N }, { source: "CHAT", model: MODEL, tokensIn: 1200, tokensOut: 30, ref: "welcome-grant" });
    const n1 = await bal(N);
    rec("CR-4", true, "INFO", "ข้อสังเกต: ref ของ USAGE ใช้ namespace เดียวกับ TOPUP/GRANT — ref ชนแถวเติมเงิน/welcome-grant ⇒ ไม่หักเงียบ ๆ (คืน 0) · D.14 ใช้คำนำหน้า dorm.meter.ai: ที่เซิร์ฟเวอร์ประกอบเอง ⇒ ผู้ใช้คุมไม่ได้", { vsTopup: nc, vsWelcome: nw, delta: n0! - n1! });
    // ref ว่าง = ไม่ใช้ ref
    const e0 = await bal(A);
    const e1 = await CR.chargeUsage({ tenantId: A }, { source: "CHAT", model: MODEL, tokensIn: 1200, tokensOut: 30, ref: "" });
    const e2 = await CR.chargeUsage({ tenantId: A }, { source: "CHAT", model: MODEL, tokensIn: 1200, tokensOut: 30, ref: "" });
    rec("CR-5", e1 === COST && e2 === COST && e0! - (await bal(A))! === 2 * COST, "MAJOR", "ref \"\" ⇒ เหมือนไม่ส่ง (หักทุกครั้ง · ไม่เขียน ref ว่าง)", { e1, e2 });
  }

  // ═══════════ NR ผู้เรียกเดิม (ไม่มี ref) ═══════════
  console.log("\n── NR ผู้เรียกเดิมไม่มี ref ──");
  {
    const b0 = await bal(A);
    const r1 = await CR.chargeUsage({ tenantId: A }, { source: "CHAT", model: MODEL, tokensIn: 1200, tokensOut: 30, note: "nr" });
    const r2 = await CR.chargeUsage({ tenantId: A }, { source: "CHAT", model: MODEL, tokensIn: 1200, tokensOut: 30, note: "nr" });
    const rows = await prisma.aiCreditTxn.findMany({ where: { tenantId: A, note: "nr" } });
    rec("NR-1", r1 === COST && r2 === COST && b0! - (await bal(A))! === 2 * COST && rows.length === 2 && rows.every((x: any) => x.ref === null), "CRITICAL", "ไม่ส่ง ref ×2 ⇒ หัก 2 ครั้ง · ref null (พฤติกรรมเดิม)", { r1, r2, rows: rows.length });
    const z = await CR.chargeUsage({ tenantId: A }, { source: "CHAT", model: MODEL, tokensIn: 0, tokensOut: 0 });
    rec("NR-2", z === 0, "MAJOR", "token 0 ⇒ 0 ไม่มีแถว (เดิม)", { z });
    let threw = "";
    try { await CR.chargeUsage({ tenantId: `nowallet-${STAMP}` }, { source: "CHAT", model: MODEL, tokensIn: 10, tokensOut: 1 }); } catch (e) { threw = (e as any)?.code ?? errMsg(e); }
    let threwRef = "";
    try { await CR.chargeUsage({ tenantId: `nowallet-${STAMP}` }, { source: "CHAT", model: MODEL, tokensIn: 10, tokensOut: 1, ref: "x" }); } catch (e) { threwRef = (e as any)?.code ?? errMsg(e); }
    const safe = await CR.chargeUsageSafe({ tenantId: `nowallet-${STAMP}` }, { source: "CHAT", model: MODEL, tokensIn: 10, tokensOut: 1 });
    rec("NR-3", !!threw && threw === threwRef && safe === 0, "MAJOR", "ไม่มีกระเป๋า ⇒ throw เหมือนเดิม (ไม่มี/มี ref ได้ error เดียวกัน · ไม่ถูกกลืนเป็น 0) · Safe ⇒ 0", { threw, threwRef, safe });
    const c0 = await bal(A);
    const item = { tenantId: A, input: { source: "CHAT", model: MODEL, tokensIn: 1200, tokensOut: 30, note: "nrcc" } };
    const fo = await fanout("charge", [0, 1, 2, 3].map(() => [item, item]));
    const rows2 = await prisma.aiCreditTxn.findMany({ where: { tenantId: A, note: "nrcc" }, orderBy: { balanceAfter: "desc" } });
    const after = rows2.map((x: any) => x.balanceAfter);
    const chain = after.every((v: number, i: number) => v === c0! - (i + 1) * COST);
    rec("NR-4", fo.results.every((x) => x?.amount === COST) && rows2.length === 8 && c0! - (await bal(A))! === 8 * COST && chain, "CRITICAL", "ไม่มี ref ×8 พร้อมกัน (4 โพรเซส) ⇒ หัก 8 · balanceAfter ต่อเนื่องไม่ซ้ำ (เดิม)", { tally: tally(fo.results), rows: rows2.length, chain });
  }

  // ═══════════ CC เสนอพร้อมกัน ═══════════
  console.log("\n── CC เสนอพร้อมกัน ──");
  {
    const ph = jpg("cc1");
    const ref = refOf(ME["101"], ph.data);
    const b0 = await bal(A), f0 = await files();
    const item = { ctx: cO, input: { unitId: DA, meterId: ME["101"], periodKey: P0, photo: { data: b64(ph.data), contentType: ph.contentType } } };
    const fo = await fanout("propose", [0, 1, 2, 3].map(() => [item, item, item]), { value: 1412, confidence: 0.94, delayMs: 900 });
    const ids = [...new Set(fo.results.filter((x) => x?.ok).map((x) => x.proposalId))];
    const u = await usageBy(A, ref), pr = await props(A, ref);
    const charged = fo.results.filter((x) => x?.charged === true).length;
    const b1 = await bal(A), f1 = await files();
    rec("CC-1", !badOf(fo.results).length && ids.length === 1 && fo.calls === 1 && u.length === 1 && pr.length === 1 && b0! - b1! === COST && charged === 1 && f1 - f0 === 1, "CRITICAL",
      "propose ×12 (4 โพรเซส) รูปเดียว มิเตอร์เดียว ⇒ ข้อเสนอ 1 · ตัวอ่าน 1 ครั้ง · หัก 1 · charged true 1 · ไฟล์สุทธิ +1", { tally: tally(fo.results), ids: ids.length, readerCalls: fo.calls, usage: u.length, proposals: pr.length, delta: b0! - b1!, charged, filesDelta: f1 - f0, bad: badOf(fo.results).slice(0, 2) });
    // ในโพรเซสเดียว 10 ทาง
    const ph2 = jpg("cc2");
    const ref2 = refOf(ME["102"], ph2.data);
    const st = mkReader({ value: 1405, confidence: 0.9, delayMs: 700 });
    const c0 = await bal(A), g0 = await files();
    const rs = await Promise.all(Array.from({ length: 10 }, () => propose(cO, DA, ME["102"], ph2, { reader: st.reader }).catch((e: unknown) => ({ threw: errMsg(e) }))));
    const ids2 = [...new Set(rs.filter((x: any) => x?.ok).map((x: any) => x.proposalId))];
    rec("CC-2", !badOf(rs).length && ids2.length === 1 && st.calls.length === 1 && (await usageBy(A, ref2)).length === 1 && c0! - (await bal(A))! === COST && (await files()) - g0 === 1 && rs.every((x: any) => x?.ok), "CRITICAL",
      "propose ×10 ในโพรเซสเดียว ⇒ ข้อเสนอ 1 · ตัวอ่าน 1 · หัก 1 · ไฟล์ +1 · ไม่มี P2024/P2028", { tally: tally(rs), calls: st.calls.length, ids: ids2.length, filesDelta: (await files()) - g0, bad: badOf(rs).slice(0, 2) });
    // ส่งซ้ำหลังจบ ⇒ cached ไม่หัก
    const again = await propose(cO, DA, ME["101"], ph, { reader: mkReader({ value: 9, confidence: 1 }).reader });
    rec("CC-3", again?.ok && again.cached === true && again.charged === false && again.value === 1412 && (await usageBy(A, ref)).length === 1, "CRITICAL", "รูปเดิมซ้ำภายหลัง ⇒ cached · ค่าเดิม · ไม่หัก", { code: codeOf(again), value: again?.value, charged: again?.charged });
  }

  // ═══════════ XT รูปเดียวกันคนละร้าน ═══════════
  console.log("\n── XT คนละร้าน ──");
  {
    const ph = jpg("xt-same");
    const a0 = await bal(A), b0 = await bal(B);
    const ra = await propose(cO, DA, ME["103"], ph, { reader: mkReader({ value: 1410, confidence: 0.95 }).reader });
    const rb = await propose(cB, DB, ME.b1, ph, { reader: mkReader({ value: 1410, confidence: 0.95 }).reader });
    const da = a0! - (await bal(A))!, db = b0! - (await bal(B))!;
    rec("XT-1", ra?.ok && rb?.ok && ra.charged && rb.charged && !rb.cached && ra.proposalId !== rb.proposalId && da === COST && db === COST, "CRITICAL", "รูปเดียวกันคนละร้าน ⇒ แต่ละร้านหักของตัวเอง 1 ครั้ง · ไม่ได้ cached ข้ามร้าน · คนละ proposalId", { a: codeOf(ra), b: codeOf(rb), da, db });
    // ร้าน B เสนอซ้ำ ⇒ ไม่แตะ A
    const a1 = await bal(A);
    const rb2 = await propose(cB, DB, ME.b1, ph, { reader: mkReader({ value: 1, confidence: 1 }).reader });
    rec("XT-2", rb2?.ok && rb2.cached && (await bal(A)) === a1, "CRITICAL", "B ซ้ำ ⇒ cached ของ B · กระเป๋า A ไม่ขยับ", { b2: codeOf(rb2) });
  }

  // ═══════════ PF provider ล้ม ═══════════
  console.log("\n── PF provider ล้ม ──");
  {
    const ph = jpg("pf1");
    const ref = refOf(ME["104"], ph.data);
    const b0 = await bal(A);
    const r1 = await propose(cO, DA, ME["104"], ph, { reader: mkReader({ throws: true }).reader });
    const item = { ctx: cO, input: { unitId: DA, meterId: ME["104"], periodKey: P0, photo: { data: b64(ph.data), contentType: ph.contentType } } };
    const fo = await fanout("propose", [0, 1, 2].map(() => [item, item]), { throws: true, delayMs: 200 });
    const b1 = await bal(A);
    rec("PF-1", r1?.ok && r1.source === "MANUAL" && r1.manualReason === "AI_FAILED" && r1.charged === false && fo.results.every((x) => x?.ok && x.manualReason === "AI_FAILED" && !x.charged) && b0 === b1 && (await usageBy(A, ref)).length === 0, "CRITICAL",
      "ตัวอ่าน throw ×7 (1 + 6 จาก 3 โพรเซส) ⇒ MANUAL AI_FAILED · ไม่หัก · ไม่มีแถว USAGE", { r1: codeOf(r1), reason: r1?.manualReason, tally: tally(fo.results), delta: b0! - b1! });
    const pr = await props(A, ref);
    rec("PF-2", pr.length === 1 && new Set(fo.results.map((x) => x?.proposalId)).size === 1 && fo.results[0]?.proposalId === r1?.proposalId, "MAJOR", "ล้มซ้ำ ⇒ ข้อเสนอเดิม (ไม่งอกแถว AuditLog)", { proposals: pr.length });
    // หมดเวลา ⇒ ไม่หัก (รอผลที่มาช้า)
    const ph2 = jpg("pf-timeout");
    const ref2 = refOf(ME["105"], ph2.data);
    const c0 = await bal(A);
    const t0 = Date.now();
    const rt = await propose(cO, DA, ME["105"], ph2, { reader: mkReader({ value: 1400, confidence: 0.99, delayMs: 2000 }).reader, timeoutMs: 300 });
    const el = Date.now() - t0;
    await sleep(2300);
    rec("PF-3", rt?.ok && rt.manualReason === "AI_FAILED" && rt.charged === false && el < 1800 && c0 === (await bal(A)) && (await usageBy(A, ref2)).length === 0, "CRITICAL", "หมดเวลา 300ms (ตัวอ่าน 2 วิ) ⇒ AI_FAILED ทันที · ผลที่มาช้าไม่หัก", { code: codeOf(rt), el, delta: c0! - (await bal(A))! });
    // แล้วสำเร็จ ⇒ หัก 1
    const ok2 = await propose(cO, DA, ME["104"], ph, { reader: mkReader({ value: 1399, confidence: 0.9 }).reader });
    rec("PF-4", ok2?.ok && ok2.source === "AI" && ok2.charged && ok2.proposalId === r1?.proposalId && (await usageBy(A, ref)).length === 1, "MAJOR", "หลังล้ม ส่งรูปเดิมแล้วอ่านได้ ⇒ proposalId เดิม · หัก 1", { code: codeOf(ok2), charged: ok2?.charged });
    // UNREADABLE (R3) ⇒ หัก 1 ครั้ง แล้ว cached
    const ph3 = jpg("pf-unread");
    const ref3 = refOf(ME["106"], ph3.data);
    const u1 = await propose(cO, DA, ME["106"], ph3, { reader: mkReader({ value: null, confidence: 0.1 }).reader });
    const u2 = await propose(cO, DA, ME["106"], ph3, { reader: mkReader({ value: 1400, confidence: 0.9 }).reader });
    rec("PF-5", u1?.ok && u1.manualReason === "UNREADABLE" && u1.charged && u2?.ok && u2.cached && u2.manualReason === "UNREADABLE" && !u2.charged && (await usageBy(A, ref3)).length === 1, "MAJOR", "R3: อ่านไม่ออก ⇒ หัก 1 · ซ้ำ ⇒ cached ไม่หัก", { u1: codeOf(u1), u2: codeOf(u2) });
  }

  // ═══════════ FG aiProposalId ปลอม/ข้ามร้าน ═══════════
  console.log("\n── FG ยืนยันด้วย aiProposalId ปลอม ──");
  {
    const pA = await propose(cO, DA, ME["107"], jpg("fg-a"), { reader: mkReader({ value: 1410, confidence: 0.95 }).reader });
    const pB = await propose(cB, DB, ME.b2, jpg("fg-b"), { reader: mkReader({ value: 1410, confidence: 0.95 }).reader });
    const p201 = await propose(cO, DA, ME["201"], jpg("fg-201"), { reader: mkReader({ value: 1410, confidence: 0.95 }).reader });
    const otherAudit = await prisma.auditLog.create({ data: { tenantId: A, unitId: DA, actorType: "USER", actorId: OWN, action: "dorm.something.else", targetType: "DormMeter", targetId: ME["108"], after: { periodKey: P0, photoSha: "x", ref: "x", source: "AI", value: 1410, lowConfidence: false } } });
    // ข้อเสนอ AI ปลอมที่ AuditLog ของร้านอื่น (B) แต่ชี้มิเตอร์ A
    const forgedB = await prisma.auditLog.create({ data: { tenantId: B, unitId: DB, actorType: "USER", actorId: OWNB, action: "dorm.meter.ai.proposed", targetType: "DormMeter", targetId: ME["108"], after: { periodKey: P0, photoSha: "x", ref: "x", source: "AI", value: 1410, lowConfidence: false, fileId: null } } });
    const cases: [string, any][] = [
      ["random", `cl${randomBytes(10).toString("hex")}`],
      ["ร้าน B", pB?.proposalId],
      ["มิเตอร์อื่น (107→108)", pA?.proposalId],
      ["action อื่น", otherAudit.id],
      ["AuditLog ร้าน B ชี้มิเตอร์ A", forgedB.id],
      ["ยาว 65", "x".repeat(65)],
    ];
    const out: Record<string, string> = {};
    for (const [k, id] of cases) { const x = await submit1(cO, DA, { meterId: ME["108"], value: 1410, aiProposalId: id }); out[k] = `${x?.status}/${x?.code ?? ""}`; }
    const rows108 = await rowsOf(ME["108"]);
    // งวดอื่น: ข้อเสนอของ 107 งวดนี้ ใช้กับงวดถัดไป
    const xp = await D.submitReadings(cO, { unitId: DA, periodKey: P(1), items: [{ meterId: ME["107"], value: 1500, aiProposalId: pA?.proposalId }] }, { put: PUT });
    out["งวดอื่น"] = `${xp?.results?.[0]?.status}/${xp?.results?.[0]?.code ?? ""}`;
    // ร้าน B ใช้ proposalId ของ A กับมิเตอร์ของ B
    const xb = await D.submitReadings(cB, { unitId: DB, periodKey: P0, items: [{ meterId: ME.b1, value: 1410, aiProposalId: pA?.proposalId }] }, { put: PUT });
    out["B ใช้ id ของ A"] = `${xb?.results?.[0]?.status}/${xb?.results?.[0]?.code ?? ""}`;
    const allNF = Object.values(out).every((v) => v === "REJECTED/NOT_FOUND");
    rec("FG-1", pA?.ok && pB?.ok && allNF && rows108 === 0 && (await prisma.dormMeterReading.count({ where: { meterId: ME["107"], periodKey: P(1) } })) === 0, "CRITICAL",
      "aiProposalId ปลอม (สุ่ม/ร้านอื่น/มิเตอร์อื่น/งวดอื่น/action อื่น/AuditLog ร้านอื่น/ยาวเกิน) ⇒ REJECTED NOT_FOUND ทุกกรณี · ไม่มีแถว", out);
    // ตัวควบคุมบวก: id จริงของ 107 ⇒ CREATED source AI
    const good = await submit1(cO, DA, { meterId: ME["107"], value: 1410, aiProposalId: pA?.proposalId });
    const row = await prisma.dormMeterReading.findFirst({ where: { meterId: ME["107"], periodKey: P0, kind: "PERIOD" } });
    rec("FG-2", good?.status === "CREATED" && row?.source === "AI" && row?.aiValue === 1410 && !!row?.photoFileId, "MAJOR", "ตัวควบคุม: id จริง ⇒ CREATED source AI · aiValue · รูปของข้อเสนอ", { good: `${good?.status}/${good?.code ?? ""}`, src: row?.source, aiValue: row?.aiValue, photo: !!row?.photoFileId });
    // ผู้ใช้อาคาร 1 (MS) ใช้ proposalId ของมิเตอร์อาคาร 2 (201)
    const ms201 = await submit1(cMS, DA, { meterId: ME["201"], value: 1410, aiProposalId: p201?.proposalId });
    rec("FG-3", ms201?.status !== "CREATED" && ms201?.status !== "UPDATED", "INFO", "submitReadings (D.6 · ด่านอยู่ที่ action) โดยผู้ใช้ถูกจำกัดอาคาร 1 กับมิเตอร์อาคาร 2 + aiProposalId จริง — บันทึกได้หรือไม่ (D.6 เดิมไม่ตรวจอาคารใน service)", { r: `${ms201?.status ?? ms201?.code}/${ms201?.code ?? ""}`, rows201: await rowsOf(ME["201"]) });
  }

  // ═══════════ XS ไม่พบเดียวกัน ═══════════
  console.log("\n── XS ข้ามร้าน/หน่วย/อาคาร ──");
  {
    const st = mkReader({ value: 1410, confidence: 0.95 });
    const a0 = await bal(A), b0 = await bal(B), fa0 = await files(A), fb0 = await files(B);
    const ph = jpg("xs");
    const cases: [string, any, string, string][] = [
      ["B ctx → หน่วย/มิเตอร์ A", cB, DA, ME["101"]],
      ["A ctx → หน่วย B", cO, DB, ME.b1],
      ["A ctx หน่วย A → มิเตอร์ B", cO, DA, ME.b1],
      ["มิเตอร์หน่วยอื่น (DA2) ผ่าน DA", cO, DA, ME.a2],
      ["หน่วยโรงแรม", cO, HA, ME["101"]],
      ["MS อาคาร 1 → ห้อง 201 (อาคาร 2)", cMS, DA, ME["201"]],
      ["MS อาคาร 1 → MAIN อาคาร 2", cMS, DA, ME.MAIN2],
      ["VW ไม่มี dorm.meter.read", cVW, DA, ME["101"]],
      ["ไม่มี actorUserId", { tenantId: A }, DA, ME["101"]],
      ["actor ของร้าน B ใส่ tenant A", { tenantId: A, actorUserId: OWNB }, DA, ME["101"]],
      ["มิเตอร์ไม่มีจริง", cO, DA, `cl${randomBytes(10).toString("hex")}`],
    ];
    const outs: Record<string, string> = {};
    for (const [k, ctx, u, m] of cases) outs[k] = J(await propose(ctx, u, m, ph, { reader: st.reader }));
    const uniq = [...new Set(Object.values(outs))];
    const lists: Record<string, number> = {};
    for (const [k, ctx, u] of [["B→A", cB, DA], ["VW", cVW, DA], ["noactor", { tenantId: A }, DA]] as const) lists[k] = (await D.meterProposals(ctx, { unitId: u, periodKey: P0 })).length;
    const msList = await D.meterProposals(cMS, { unitId: DA, periodKey: P0 });
    const msSees201 = msList.some((p: any) => p.meterId === ME["201"] || p.meterId === ME.MAIN2);
    rec("XS-1", uniq.length === 1 && JSON.parse(uniq[0]).code === "NOT_FOUND" && st.calls.length === 0 && a0 === (await bal(A)) && b0 === (await bal(B)) && fa0 === (await files(A)) && fb0 === (await files(B)), "CRITICAL",
      "11 กรณี (ร้าน/หน่วย/อาคาร/สิทธิ์/actor) ⇒ ผลเดียวกัน deep-equal NOT_FOUND · ไม่เรียกตัวอ่าน · ไม่หัก · ไม่อัปไฟล์", { distinct: uniq.length, sample: uniq.slice(0, 3), readerCalls: st.calls.length });
    rec("XS-2", Object.values(lists).every((n) => n === 0) && !msSees201, "CRITICAL", "meterProposals: ร้านอื่น/ไม่มีสิทธิ์/ไม่มี actor ⇒ [] · MS ไม่เห็นข้อเสนอของอาคาร 2", { lists, msN: msList.length, msSees201 });
  }

  // ═══════════ DL 40P01 ═══════════
  console.log("\n── DL 40P01 ──");
  {
    // ทำให้ K มีข้อเสนอ AI_FAILED ก่อน (ครั้งถัดไปจะ UPDATE แถว AuditLog เดิมใต้ล็อก)
    const ph = jpg("dl1");
    const ref = refOf(ME["105"], ph.data);
    const r0 = await propose(cO, DA, ME["105"], ph, { reader: mkReader({ throws: true }).reader });
    const recId = r0?.proposalId as string;
    const lockKey = `dorm.meter.ai:${DA}:${ref}`;
    // คู่ชน: ล็อกแถว AuditLog ก่อน แล้วขอ advisory ของ K (propose ถือ K อยู่และจะรอแถวนี้ ⇒ วงล็อก · propose รอก่อน ⇒ propose เป็นผู้ถูกยกเลิก)
    let rivals: Promise<unknown>[] = [];
    const mkRival = (sig: { locked: () => void }) => prisma.$transaction(async (tx: any) => {
      await tx.$executeRaw`UPDATE "AuditLog" SET "ip" = "ip" WHERE id = ${recId}`;
      sig.locked();
      await sleep(300);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
    }, { timeout: 20_000, maxWait: 10_000 }).catch((e: unknown) => ({ rivalErr: errMsg(e) }));
    let budget = 2;
    const onRead = async () => {
      if (budget <= 0) return;
      budget--;
      await new Promise<void>((res) => { rivals.push(mkRival({ locked: res })); });
    };
    const st = mkReader({ value: 1402, confidence: 0.95 }, onRead);
    const b0 = await bal(A), f0 = await files();
    const t0 = Date.now();
    const busy = await propose(cO, DA, ME["105"], ph, { reader: st.reader });
    const el = Date.now() - t0;
    const rv = await Promise.all(rivals);
    const recAfter = (await props(A, ref))[0];
    rec("DL-1", busy?.ok === false && busy.code === "BUSY" && st.calls.length === 2 && b0 === (await bal(A)) && (await usageBy(A, ref)).length === 0 && f0 === (await files()) && (recAfter?.after as any)?.manualReason === "AI_FAILED", "CRITICAL",
      "40P01 สองครั้งติด ⇒ ลองใหม่ 1 ครั้งแล้ว BUSY · ไม่หัก · ไม่มีไฟล์ค้าง · ข้อเสนอเดิมไม่ถูกเขียนทับ", { r: codeOf(busy), reason: busy?.reason, readerCalls: st.calls.length, el, rivals: rv.map((x) => J(x ?? "ok").slice(0, 80)), rec: (recAfter?.after as any)?.manualReason });
    // ชนครั้งเดียว ⇒ ลองใหม่สำเร็จ
    rivals = []; budget = 1;
    const st2 = mkReader({ value: 1402, confidence: 0.95 }, onRead);
    const c0 = await bal(A);
    const ok1 = await propose(cO, DA, ME["105"], ph, { reader: st2.reader });
    await Promise.all(rivals);
    rec("DL-2", ok1?.ok === true && ok1.source === "AI" && ok1.charged && st2.calls.length === 2 && c0! - (await bal(A))! === COST && (await usageBy(A, ref)).length === 1, "CRITICAL", "40P01 ครั้งเดียว ⇒ ลองใหม่สำเร็จ · หัก 1 ครั้ง (ไม่หักของรอบที่ย้อน)", { r: codeOf(ok1), calls: st2.calls.length, delta: c0! - (await bal(A))! });
  }

  rec("NET-1", BLOCKED.length === 0, "MAJOR", "ไม่มีคำขอออกนอกเครื่อง (provider จริงไม่ถูกเรียก)", { blocked: BLOCKED.slice(0, 5) });
} catch (e) {
  console.log(`🔴 probe พัง: ${errMsg(e)}`);
  exitCode = 2;
} finally {
  try { await cleanup(tenantIds); await prisma.user.deleteMany({ where: { email: { startsWith: "svc-d14pb-" } } }); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); }
  const left = tenantIds.length ? await leftovers(tenantIds) : [];
  rec("Z-1", left.length === 0, "MINOR", "ล้างข้อมูลหมด", { left });
  globalThis.fetch = REAL_FETCH;
}
const breaches = results.filter((r) => !r.ok);
console.log(`\nPROBE_SUMMARY ${JSON.stringify({ total: results.length, hold: results.length - breaches.length, breach: breaches.map((b) => `${b.id}(${b.sev})`) })}`);
try { await prisma.$disconnect(); } catch { /* */ }
process.exit(exitCode || (breaches.some((b) => b.sev === "CRITICAL") ? 1 : 0));
