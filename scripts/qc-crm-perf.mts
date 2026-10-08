// qc-crm-perf.mts — วัดเกณฑ์ประสิทธิภาพ §12 ของ CRM v2 บนข้อมูลขนาดจริง (ใบ C5.1 · มติ C26)
// requires: crm-perf-seed   (scripts/seed-crm-perf.mts — ร้าน `crm-perf-qc` บน QC2)
// Run:  bash scripts/iso.sh bash scripts/qc2.sh pnpm exec tsx scripts/qc-crm-perf.mts [--runs 20] [--only board,contacts]
//
// วิธีวัด: Prisma client ตัวเดียวของแอป (`@/lib/core/db`) ถูกสร้างล่วงหน้าพร้อม `log: query` แล้ววางไว้ที่ globalThis.prisma
//   (db.ts ใช้ตัวที่มีอยู่แล้วเมื่อไม่ใช่ production) ⇒ ทุกคำสั่ง SQL ที่ service จริงยิง ถูกนับผ่าน `$on("query")`
//   · เรียกฟังก์ชันชั้นบริการตัวเดียวกับที่หน้า/REST เรียก (route handler จริงสำหรับ tracking/inbound) — ไม่มี SQL เขียนเอง
//   · ต่อฉาก: อุ่น 2 รอบ แล้ววัด 20 รอบ → p50/p95/max ของเวลา (ms) + จำนวน query ต่อรอบ + รูปคำสั่งที่ยิง
//   · N+1: เรียกรายการเดิมด้วยขนาดหน้า 10/50/200 — จำนวน query โตตามขนาดหน้า = N+1
//   · EXPLAIN (ANALYZE, BUFFERS) ของคำสั่งที่ช้าที่สุด (อ่านอย่างเดียว) → `.qc-shots/crm/perf/explain/`
//   · เวลาที่วัดรวมเวลาเดินทางเครือข่าย VPS → Neon สิงคโปร์ (RTT วัดแยกและรายงานไว้คู่กัน)
// ผล: `.qc-shots/crm/perf/summary.json` + ตารางอ่านง่าย `.qc-shots/crm/perf/summary.txt` · บรรทัดสุดท้าย JSON_SUMMARY
// ของที่เขียน: ทุกอย่างอยู่ในร้าน crm-perf-qc (ลบทั้งร้านด้วย seed --drop) · ถังนับความถี่ (`ChatRateBucket`) ที่ฉาก tracking สร้าง
//   ถูกลบด้วยกุญแจตรงตัวใน finally
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { mkdirSync, writeFileSync } from "node:fs";

const ARGV = process.argv.slice(2);
const argVal = (k: string) => {
  const i = ARGV.indexOf(k);
  return i >= 0 ? ARGV[i + 1] : undefined;
};
const RUNS = Math.max(3, Number(argVal("--runs") ?? 20));
const WARM = 2;
const ONLY = (argVal("--only") ?? "").split(",").filter(Boolean);
const want = (group: string) => ONLY.length === 0 || ONLY.includes(group);
const OUT = argVal("--out") ?? ".qc-shots/crm/perf";
mkdirSync(`${OUT}/explain`, { recursive: true });

const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const env = accEnv.loadQcEnv();
for (const u of [process.env.DATABASE_URL ?? "", process.env.DIRECT_URL ?? ""]) {
  if (!u.includes("ep-cool-shadow") || process.env.QC_BRANCH !== "qc2") {
    console.error("🔴 qc-crm-perf: ต้องรันผ่าน scripts/qc2.sh (QC2 · ep-cool-shadow) เท่านั้น — หยุด");
    process.exit(4);
  }
}
// route อีเมลขาเข้าเปิดบริการเมื่อมีความลับ — ตั้งเฉพาะใน process นี้ (ไม่แตะไฟล์ env ใด ๆ)
process.env.EMAIL_INBOUND_SECRET = process.env.EMAIL_INBOUND_SECRET || "perf-c51-inbound-secret-local-only";
process.env.APP_URL = process.env.APP_URL || "http://localhost:3000";

// ═══════════════════ Prisma client ที่นับ query (ต้องสร้างก่อน import @/lib/core/db) ═══════════════════
const { PrismaClient } = (await import("@prisma/client")) as Any;
const { PrismaPg } = (await import("@prisma/adapter-pg")) as Any;
type QEv = { query: string; params: string; duration: number };
let sink: QEv[] | null = null;
const client = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  log: [{ emit: "event", level: "query" }],
  transactionOptions: { timeout: 30_000, maxWait: 10_000 },
});
client.$on("query", (e: QEv) => {
  if (sink) sink.push({ query: e.query, params: e.params, duration: Number(e.duration) });
});
(globalThis as Any).prisma = client;
const { prisma } = (await import("@/lib/core/db")) as Any;
if (prisma !== client) {
  console.error("🔴 @/lib/core/db ไม่ได้ใช้ client ที่นับ query (NODE_ENV=production?) — วัดไม่ได้");
  process.exit(2);
}

// ═══════════════════ SKIP guard: ต้องมีร้าน perf ═══════════════════
const tenant = await prisma.tenant.findFirst({ where: { slug: "crm-perf-qc" }, select: { id: true } });
const sysRow = tenant ? await prisma.appSystem.findFirst({ where: { tenantId: tenant.id, type: "CRM" }, select: { id: true, settings: true } }) : null;
if (!tenant || !sysRow || !(sysRow.settings as Any)?.perfSeed?.done?.analyze) {
  console.log("SKIPPED — ยังไม่มีชุดข้อมูล crm-perf-qc ที่สร้างเสร็จ (รัน scripts/seed-crm-perf.mts ก่อน)");
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: "qc-crm-perf", skipped: true })}`);
  process.exit(0);
}
const tenantId: string = tenant.id;
const SYS: string = sysRow.id;
const ctx = { tenantId, systemId: SYS, actorUserId: null as string | null };

const members = (await prisma.membership.findMany({ where: { tenantId }, include: { user: { select: { email: true } } } })) as Any[];
const memberByN = (n: number) => members.find((m) => m.user.email === `crm-perf-qc+u${String(n).padStart(2, "0")}@example.test`);
const { toMemberActor } = (await import("@/lib/modules/member")) as Any;
const actorOf = (n: number) => {
  const m = memberByN(n);
  return toMemberActor(m.userId, m);
};
const ACTORS: Record<string, { n: number; label: string }> = {
  owner: { n: 1, label: "OWNER (ทั้งร้าน)" },
  mgrHkt: { n: 3, label: "MANAGER จำกัดสาขาภูเก็ต" },
  lead: { n: 4, label: "STAFF หัวหน้าทีม (TEAM)" },
  staff: { n: 5, label: "STAFF ลูกทีม" },
};
const actor = (k: string) => actorOf(ACTORS[k]!.n);
const ctxFor = (k: string) => ({ ...ctx, actorUserId: memberByN(ACTORS[k]!.n).userId as string });

const crm = (await import("@/lib/modules/crm")) as Any;
const D = (await import("@/lib/modules/crm/deals")) as Any;
const C = (await import("@/lib/modules/crm/contacts")) as Any;
const CO = (await import("@/lib/modules/crm/companies")) as Any;
const AC = (await import("@/lib/modules/crm/activities")) as Any;
const R = (await import("@/lib/modules/crm/reports")) as Any;
const OB = (await import("@/lib/modules/crm/objects")) as Any;
const EM = (await import("@/lib/modules/crm/emails")) as Any;
const TR = (await import("@/lib/modules/crm/tracking")) as Any;
const HOME = (await import("@/lib/modules/crm/home-data")) as Any;
const VIEWS = (await import("@/lib/modules/crm/views")) as Any;
const SEQ = (await import("@/lib/modules/crm/sequences")) as Any;
const routeOpen = (await import("../src/app/t/o/[token]/route" as string)) as Any;
const routeClick = (await import("../src/app/t/c/[token]/route" as string)) as Any;
const routeLink = (await import("../src/app/l/[code]/route" as string)) as Any;
const routeCollect = (await import("../src/app/t/e/route" as string)) as Any;
const routeInbound = (await import("../src/app/api/email/inbound/route" as string)) as Any;
// C5.1-fix ▸ 1 รอบของฉาก = 1 คำขอ: ในหน้า (RSC) `cache()` ของ React ให้ขอบเขต memo ต่อคำขอ — สคริปต์ไม่มี React request
//   จึงจำลองด้วย `crmScope` (ขอบเขตเดียวกันทุกประการ: Map ใหม่ต่อรอบ · หมดรอบ = ทิ้ง) · โค้ดก่อนแก้ไม่มีไฟล์นี้ = ไม่ครอบ (วัดแบบเดิม)
const crmScope: <T>(fn: () => Promise<T>) => Promise<T> = await import("@/lib/modules/crm/request-scope" as string)
  .then((m: Any) => m.crmScope)
  .catch(() => (fn: () => Promise<unknown>) => fn());

// ═══════════════════ ตัววัด ═══════════════════
type One = { ms: number; q: number; dbMs: number; evs: QEv[]; err?: string };
async function once(fn: () => Promise<unknown>): Promise<One> {
  sink = [];
  const s = performance.now();
  let err: string | undefined;
  try {
    await crmScope(fn);
  } catch (e) {
    const msg = String((e as Error)?.message ?? e).split("\n").map((x) => x.trim()).filter(Boolean);
    err = `${(e as Any)?.code ?? ""} ${msg[msg.length - 1] ?? ""}`.slice(0, 240);
  }
  const ms = performance.now() - s;
  const evs = sink;
  sink = null;
  return { ms, q: evs.length, dbMs: evs.reduce((a, e) => a + e.duration, 0), evs, err };
}
const pct = (xs: number[], p: number) => {
  const a = [...xs].sort((x, y) => x - y);
  return a.length ? a[Math.min(a.length - 1, Math.ceil((p / 100) * a.length) - 1)]! : 0;
};
const r1 = (x: number) => Math.round(x * 10) / 10;
/** คำสั่ง "ด่าน/เมตา" (ระบบ · การมองเห็น · ทีม · สิทธิ์ · นิยามฟิลด์) — แยกจากคำสั่งข้อมูลในผล */
const GUARD_RE = /FROM "public"\."(AppSystem|TeamMember|Team|CrmVisibilityPolicy|Membership|MemberField|MemberSection)"|WITH mine AS|SELECT \(SELECT count\(\*\) FROM "Team"|FROM "Team" WHERE|^\s*(BEGIN|COMMIT)/i;
const shape = (sql: string) => sql.replace(/\s+/g, " ").replace(/\$\d+/g, "$").trim().slice(0, 170);

type Budget = { maxQueries?: number; p95Ms?: number; note?: string };
type Result = {
  id: string; group: string; title: string; actor: string; budget: Budget; runs: number;
  p50: number; p95: number; max: number; qMin: number; qMax: number; qData: number; netP95: number; dbMsP95: number;
  pass: boolean | null; verdict: string; errors: string[]; shapes: { sql: string; n: number; maxMs: number }[];
  extra?: Record<string, unknown>;
};
const results: Result[] = [];
const slowPool: { id: string; ev: QEv }[] = [];

async function bench(group: string, id: string, title: string, actorKey: string, budget: Budget, fn: (i: number) => Promise<unknown>, opts: { runs?: number; warm?: number; extra?: (runs: One[]) => Record<string, unknown> } = {}): Promise<Result> {
  const runsN = opts.runs ?? RUNS;
  for (let w = 0; w < (opts.warm ?? WARM); w += 1) await once(() => fn(-1 - w));
  const runs: One[] = [];
  for (let i = 0; i < runsN; i += 1) runs.push(await once(() => fn(i)));
  const ms = runs.map((r) => r.ms);
  const qs = runs.map((r) => r.q);
  const errors = [...new Set(runs.filter((r) => r.err).map((r) => r.err!))];
  const last = runs[runs.length - 1]!;
  const byShape = new Map<string, { n: number; maxMs: number }>();
  for (const e of last.evs) {
    const k = shape(e.query);
    const cur = byShape.get(k) ?? { n: 0, maxMs: 0 };
    cur.n += 1;
    cur.maxMs = Math.max(cur.maxMs, e.duration);
    byShape.set(k, cur);
  }
  // คำสั่งที่ช้าที่สุดของฉากนี้ (จากทุกรอบ) → คิว EXPLAIN
  const slowest = runs.flatMap((r) => r.evs).sort((a, b) => b.duration - a.duration)[0];
  if (slowest && slowest.duration >= 60) slowPool.push({ id, ev: slowest });
  const p95 = pct(ms, 95);
  const qMax = Math.max(...qs);
  const fails: string[] = [];
  if (budget.maxQueries !== undefined && qMax > budget.maxQueries) fails.push(`query ${qMax} > ${budget.maxQueries}`);
  if (budget.p95Ms !== undefined && p95 > budget.p95Ms) fails.push(`p95 ${r1(p95)}ms > ${budget.p95Ms}ms`);
  if (errors.length) fails.push(`error: ${errors[0]}`);
  const hasBudget = budget.maxQueries !== undefined || budget.p95Ms !== undefined;
  const res: Result = {
    id, group, title, actor: ACTORS[actorKey]?.label ?? actorKey, budget, runs: runsN,
    p50: r1(pct(ms, 50)), p95: r1(p95), max: r1(Math.max(...ms)), qMin: Math.min(...qs), qMax,
    qData: last.evs.filter((e) => !GUARD_RE.test(e.query)).length, netP95: r1(Math.max(0, p95 - qMax * RTT.p50)), dbMsP95: r1(pct(runs.map((r) => r.dbMs), 95)),
    pass: hasBudget ? fails.length === 0 : errors.length ? false : null,
    verdict: fails.length ? `FAIL — ${fails.join(" · ")}` : hasBudget ? "PASS" : "info",
    errors,
    shapes: [...byShape.entries()].map(([sql, v]) => ({ sql, n: v.n, maxMs: r1(v.maxMs) })).sort((a, b) => b.maxMs - a.maxMs),
    extra: opts.extra?.(runs),
  };
  results.push(res);
  console.log(`${res.pass === false ? "❌" : res.pass ? "✅" : "ℹ️ "} ${id.padEnd(22)} ${res.title.slice(0, 60).padEnd(60)} p50 ${String(res.p50).padStart(7)} p95 ${String(res.p95).padStart(7)} ms · q ${res.qMin}–${res.qMax}${res.verdict !== "PASS" && res.verdict !== "info" ? ` · ${res.verdict}` : ""}`);
  return res;
}

// ═══════════════════ ค่าที่ใช้ในฉาก ═══════════════════
const pipes = (await prisma.crmPipeline.findMany({ where: { tenantId, systemId: SYS }, orderBy: { sortOrder: "asc" }, include: { stages: { orderBy: { sortOrder: "asc" } } } })) as Any[];
const P1 = pipes.find((p) => p.isDefault)!;
const P2 = pipes.find((p) => !p.isDefault)!;
const anchor = new Date((sysRow.settings as Any).perfSeed.anchor as string);
const thaiYmd = (d: Date) => new Date(d.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
const heavyContact = ((await prisma.$queryRawUnsafe(`SELECT "contactId" AS id, count(*)::int AS n FROM "CrmActivity" WHERE "systemId" = $1 AND "contactId" IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 1`, SYS)) as Any[])[0];
const lightContact = ((await prisma.$queryRawUnsafe(`SELECT c."id", (SELECT count(*)::int FROM "CrmActivity" a WHERE a."contactId" = c."id") AS n FROM "CrmContact" c WHERE c."systemId" = $1 AND c."id" = 'pfct_0150001'`, SYS)) as Any[])[0];
const bigCompany = ((await prisma.$queryRawUnsafe(`SELECT "companyId" AS id, count(*)::int AS n FROM "CrmContact" WHERE "systemId" = $1 AND "companyId" IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 1`, SYS)) as Any[])[0];
const bigDeal = ((await prisma.$queryRawUnsafe(`SELECT "dealId" AS id, count(*)::int AS n FROM "CrmActivity" WHERE "systemId" = $1 AND "dealId" IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 1`, SYS)) as Any[])[0];
const staff5Id = memberByN(5).userId as string;
console.log(`ร้าน ${tenantId} · ระบบ ${SYS} · anchor ${anchor.toISOString()} · ผู้ติดต่อหนัก ${heavyContact.id} (${heavyContact.n} กิจกรรม) · บริษัทใหญ่ ${bigCompany.id} (${bigCompany.n} คน) · ดีลหนัก ${bigDeal.id} (${bigDeal.n})`);

// RTT (เครือข่าย VPS → Neon) — ตัวเทียบของทุกเวลา
const rtt: number[] = [];
for (let i = 0; i < 25; i += 1) {
  const s = performance.now();
  await prisma.$queryRawUnsafe("SELECT 1");
  rtt.push(performance.now() - s);
}
const RTT = { p50: r1(pct(rtt.slice(5), 50)), p95: r1(pct(rtt.slice(5), 95)) };
console.log(`RTT SELECT 1: p50 ${RTT.p50} ms · p95 ${RTT.p95} ms (เวลาทุกฉากรวมค่านี้ × จำนวน round-trip ที่ต่อกัน)\n`);

// ═══════════════════ 1. กระดานดีล — ≤ 8 query ≤ 400 ms p95 ═══════════════════
if (want("board")) {
  for (const k of ["owner", "lead", "staff", "mgrHkt"]) {
    await bench("board", `board.p1.${k}`, `กระดานดีล pipeline 1 (5 ขั้น) getBoard`, k, { maxQueries: 8, p95Ms: 400 }, () => D.getBoard(ctxFor(k), actor(k), { pipelineId: P1.id }), {
      extra: () => ({}),
    });
  }
  await bench("board", "board.p2.owner", "กระดานดีล pipeline 2 (6 ขั้น) getBoard", "owner", { maxQueries: 8, p95Ms: 400 }, () => D.getBoard(ctxFor("owner"), actor("owner"), { pipelineId: P2.id }));
  await bench("board", "board.p1.filtered", "กระดาน + ตัวกรอง owner/closeFrom/stale", "owner", { maxQueries: 8, p95Ms: 400 }, () =>
    D.getBoard(ctxFor("owner"), actor("owner"), { pipelineId: P1.id, owner: staff5Id, closeFrom: thaiYmd(anchor), closeTo: thaiYmd(new Date(anchor.getTime() + 180 * 86_400_000)) }),
  );
  // ข้อมูลทั้งหน้า /crm/deals (ตัวเลือก 7 ชุด + กระดาน) — ต่อเพจจริงนอกจาก requireTenant/appSystem/uiVersion ของหน้า
  await bench("board", "board.page.owner", "หน้า /crm/deals ทั้งหน้า (options ×7 + getBoard)", "owner", { note: "ข้อมูลประกอบ — เกณฑ์ §12 วัดที่ getBoard" }, async () => {
    const c = ctxFor("owner");
    const a = actor("owner");
    await Promise.all([D.pipelineOptions(c, a), D.ownerOptions(c, a), D.savedViewOptions(c, a), D.lostReasonOptions(c, a), D.dealFieldLayout(c, a), VIEWS.viewOptions(c, a, "deal"), VIEWS.viewTeamOptions(c, a)]);
    await D.getBoard(c, a, { pipelineId: P1.id });
  });
  for (const ps of [10, 50, 200]) {
    await bench("n+1", `deals.list.ps${ps}`, `listDeals pageSize ${ps}`, "owner", {}, () => D.listDeals(ctxFor("owner"), actor("owner"), { pageSize: ps }));
  }
}

// ═══════════════════ 2. รายชื่อผู้ติดต่อ 50 แถว + ตัวกรอง 5 (กำหนดเอง 2) — ≤ 12 query ═══════════════════
const FILTER5 = { stage: "PROSPECT", leadStatus: "CONTACTED", scoreBand: "COLD", f: { industry_pref: "tech,retail", budget: "5000.." } };
if (want("contacts")) {
  for (const k of ["owner", "lead", "staff", "mgrHkt"]) {
    await bench("contacts", `contacts.f5.${k}`, "listContacts 50 แถว + ตัวกรอง 5 (กำหนดเอง 2)", k, { maxQueries: 12 }, () => C.listContacts(ctxFor(k), actor(k), { ...FILTER5, pageSize: 50 }), {
      extra: () => ({ filters: FILTER5 }),
    });
  }
  await bench("contacts", "contacts.f5wide.owner", "listContacts + ตัวกรองกำหนดเองกว้าง (vip=true · region=bkk)", "owner", { maxQueries: 12 }, () =>
    C.listContacts(ctxFor("owner"), actor("owner"), { stage: "LEAD", scoreBand: "COLD", source: "WEB_FORM", f: { vip: "true", region: "bkk" }, pageSize: 50 }),
  );
  // ตัวกรองกำหนดเองที่แคบ (แต่ละตัว < 32,766 แถว) — แยก "เพดานจำนวน query" ออกจากบั๊ก P2029 ของตัวกรองกว้าง
  const FILTER5N = { stage: "PROSPECT", leadStatus: "CONTACTED", scoreBand: "COLD", f: { nps: "=10", segment: "=gov" } };
  for (const k of ["owner", "lead", "staff", "mgrHkt"]) {
    await bench("contacts", `contacts.f5narrow.${k}`, "listContacts 50 แถว + ตัวกรอง 5 (กำหนดเอง 2 แบบแคบ)", k, { maxQueries: 12 }, () => C.listContacts(ctxFor(k), actor(k), { ...FILTER5N, pageSize: 50 }), {
      extra: () => ({ filters: FILTER5N }),
    });
  }
  await bench("contacts", "contacts.page.owner", "หน้า /crm/contacts ทั้งหน้า (options ×6 + listContacts f5)", "owner", { note: "ข้อมูลประกอบ" }, async () => {
    const c = ctxFor("owner");
    const a = actor("owner");
    await Promise.all([C.ownerOptions(c, a), C.savedViewOptions(c, a), C.customFieldLayout(c, a).catch(() => []), SEQ.sequenceOptions(c, a).catch(() => []), VIEWS.viewOptions(c, a, "contact"), VIEWS.viewTeamOptions(c, a)]);
    await C.listContacts(c, a, { ...FILTER5, pageSize: 50 });
  });
  await bench("contacts", "contacts.q.owner", "ค้นหาผู้ติดต่อด้วยชื่อ (q=สมชาย)", "owner", {}, () => C.listContacts(ctxFor("owner"), actor("owner"), { q: "สมชาย ศรีสุข", pageSize: 50 }));
  await bench("contacts", "contacts.qphone.owner", "ค้นหาผู้ติดต่อด้วยเบอร์ (q=0812)", "owner", {}, () => C.listContacts(ctxFor("owner"), actor("owner"), { q: "081234", pageSize: 50 }));
  for (const ps of [10, 50, 200]) {
    await bench("n+1", `contacts.list.ps${ps}`, `listContacts pageSize ${ps} (ไม่กรอง)`, "owner", {}, () => C.listContacts(ctxFor("owner"), actor("owner"), { pageSize: ps }));
  }
  for (const ps of [10, 50, 200]) {
    await bench("n+1", `contacts.f5.ps${ps}`, `listContacts pageSize ${ps} + ตัวกรอง 5`, "staff", {}, () => C.listContacts(ctxFor("staff"), actor("staff"), { ...FILTER5, pageSize: ps }));
  }
}

// ═══════════════════ 3. forecast 12 เดือน × 4 หมวด — ≤ 2 query (aggregate) ═══════════════════
const aggCount = (runs: One[]) => {
  const last = runs[runs.length - 1]!;
  const agg = last.evs.filter((e) => /FROM "(public"\.")?CrmDeal"?\s|FROM "CrmDeal" d/i.test(e.query) && /(sum|count)\(/i.test(e.query));
  return { aggregateQueries: agg.length, aggregateMsMax: r1(Math.max(0, ...agg.map((e) => e.duration))) };
};
if (want("forecast")) {
  const from = thaiYmd(anchor);
  const to = thaiYmd(new Date(anchor.getTime() + 365 * 86_400_000));
  for (const k of ["owner", "lead", "mgrHkt"]) {
    await bench("forecast", `forecast.report.${k}`, "รายงาน forecast 12 เดือน × 4 หมวด (reports.forecast)", k, { maxQueries: 2, note: "นับเฉพาะ aggregate ในผลแยก · qMax = ทั้งหมด" }, () => R.forecast(ctxFor(k), actor(k), { from, to, groupBy: "month" }), { extra: aggCount });
  }
  await bench("forecast", "forecast.deals.owner", "พยากรณ์หน้าดีล (deals.forecast · month)", "owner", { maxQueries: 2 }, () => D.forecast(ctxFor("owner"), actor("owner"), { groupBy: "month", from, to }), { extra: aggCount });
  await bench("forecast", "forecast.deals.lead", "พยากรณ์หน้าดีล (deals.forecast · month)", "lead", { maxQueries: 2 }, () => D.forecast(ctxFor("lead"), actor("lead"), { groupBy: "month", from, to }), { extra: aggCount });
}

// ═══════════════════ 4. funnel จาก StageHistory — ≤ 1 query/ขั้น ═══════════════════
if (want("funnel")) {
  const nStagesP1 = P1.stages.filter((s: Any) => s.kind !== "LOST").length;
  const nStagesP2 = P2.stages.filter((s: Any) => s.kind !== "LOST").length;
  for (const k of ["owner", "lead"]) {
    await bench("funnel", `funnel.p1.${k}`, `funnel pipeline 1 (${nStagesP1} ขั้นที่แสดง)`, k, { maxQueries: nStagesP1 }, () => R.funnel(ctxFor(k), actor(k), { pipelineId: P1.id }));
  }
  await bench("funnel", "funnel.p2.owner", `funnel pipeline 2 (${nStagesP2} ขั้นที่แสดง)`, "owner", { maxQueries: nStagesP2 }, () => R.funnel(ctxFor("owner"), actor("owner"), { pipelineId: P2.id }));
}

// ═══════════════════ 5. tracking endpoints — ≤ 50 ms (route handler จริง) ═══════════════════
const rateKeys = new Set<string>();
if (want("tracking")) {
  const outs = (await prisma.$queryRawUnsafe(
    `SELECT "id" FROM "CrmEmailMessage" WHERE "systemId" = $1 AND "direction" = 'OUT' AND "sentAt" < now() - interval '1 minute' ORDER BY "id" LIMIT ${RUNS + WARM + 2}`,
    SYS,
  )) as { id: string }[];
  const nOf = (id: string) => Number(id.slice(5));
  const ipFor = (tag: number, i: number) => `198.51.${100 + tag}.${(i + 10) & 255}`;
  const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
  const req = (url: string, ip: string, init: RequestInit = {}) => new Request(url, { ...init, headers: { "user-agent": UA, "x-forwarded-for": ip, ...(init.headers as Record<string, string> | undefined) } });
  const openTok = (i: number) => {
    const id = outs[(i + WARM + 2) % outs.length]!.id;
    return `${id}~pftok${nOf(id)}`;
  };
  const clickTok = (i: number) => {
    const id = outs[(i + WARM + 2) % outs.length]!.id;
    return `${id}~pfclk${nOf(id)}`;
  };
  await bench("tracking", "track.open", "GET /t/o/<token>.gif (เปิดอ่าน · นับจริง)", "public", { p95Ms: 50 }, async (i) => {
    const tok = openTok(i);
    const ip = ipFor(1, i + 5);
    for (const k of EM.trackRateKeys("o", { ip, token: tok })) rateKeys.add(k);
    const res = await routeOpen.GET(req(`http://localhost:3000/t/o/${tok}.gif`, ip), { params: Promise.resolve({ token: `${tok}.gif` }) });
    if (res.status !== 200) throw new Error(`status ${res.status}`);
  });
  await bench("tracking", "track.click", "GET /t/c/<token> (คลิกในอีเมล · นับ + ตั๋วระบุตัวตน)", "public", { p95Ms: 50 }, async (i) => {
    const tok = clickTok(i);
    const ip = ipFor(2, i + 5);
    for (const k of EM.trackRateKeys("c", { ip, token: tok })) rateKeys.add(k);
    const res = await routeClick.GET(req(`http://localhost:3000/t/c/${tok}`, ip), { params: Promise.resolve({ token: tok }) });
    if (res.status !== 302 || !String(res.headers.get("location")).startsWith("https://perf.example.co.th/")) throw new Error(`redirect ผิด ${res.status} ${res.headers.get("location")}`);
  });
  await bench("tracking", "track.link", "GET /l/<code> (ลิงก์ติดตาม · นับ)", "public", { p95Ms: 50 }, async (i) => {
    const code = `pfl${String((Math.abs(i) % 150) + 1).padStart(4, "0")}`;
    const ip = ipFor(3, i + 5);
    rateKeys.add(`crm:l:${TR.ipHashFor(ip).slice(0, 32)}`);
    const res = await routeLink.GET(req(`http://localhost:3000/l/${code}`, ip), { params: Promise.resolve({ code }) });
    if (res.status !== 302 || !String(res.headers.get("location")).startsWith("https://perf.example.co.th/")) throw new Error(`redirect ผิด ${res.status}`);
  });
  // POST /t/e — การเข้าชมที่ยินยอมแล้วและยังไม่หมดเวลา (เส้นทางปกติของ shark.js)
  const visitor = "5f0c51aa-0c51-4c51-8c51-0c51c51c51c5";
  await prisma.crmWebSession.deleteMany({ where: { tenantId, systemId: SYS, visitorId: visitor } });
  await prisma.crmWebSession.create({ data: { tenantId, systemId: SYS, visitorId: visitor, consentVersion: 1, consentAt: new Date(), firstUrl: "https://perf.example.co.th/", startedAt: new Date(), lastSeenAt: new Date(), pageViews: 0 } });
  rateKeys.add("crm:ts:perfqcsite0001");
  const before = await prisma.crmWebEvent.count({ where: { tenantId, session: { visitorId: visitor } } });
  await bench("tracking", "track.collect", "POST /t/e (page view จาก shark.js)", "public", { p95Ms: 50 }, async (i) => {
    const ip = ipFor(4, i + 5);
    rateKeys.add(`crm:te:${TR.ipHashFor(ip).slice(0, 32)}`);
    const body = JSON.stringify({ k: "perfqcsite0001", v: visitor, cv: 1, t: "page", u: `https://perf.example.co.th/p/${Math.abs(i)}`, ti: "หน้าทดสอบ", d: 12 });
    const res = await routeCollect.POST(req("http://localhost:3000/t/e", ip, { method: "POST", body, headers: { origin: "https://perf.example.co.th", "content-type": "application/json", "content-length": String(Buffer.byteLength(body)) } }));
    if (res.status !== 204) throw new Error(`status ${res.status}`);
  });
  const after = await prisma.crmWebEvent.count({ where: { tenantId, session: { visitorId: visitor } } });
  const opened = await prisma.crmEmailEvent.count({ where: { tenantId, kind: "OPEN", at: { gte: new Date(Date.now() - 30 * 60_000) } } });
  const clicked = await prisma.crmEmailEvent.count({ where: { tenantId, kind: "CLICK", at: { gte: new Date(Date.now() - 30 * 60_000) } } });
  const written = { webEventsWritten: after - before, emailOpensWritten: opened, emailClicksWritten: clicked };
  console.log(`   (positive control: เขียนจริง ${JSON.stringify(written)})`);
  results.filter((r) => r.group === "tracking").forEach((r) => (r.extra = { ...(r.extra ?? {}), ...written }));
}

// ═══════════════════ 6. อีเมลขาเข้า — ≤ 1.5 วิ (route จริง POST /api/email/inbound) ═══════════════════
if (want("inbound")) {
  const known = (await prisma.$queryRawUnsafe(`SELECT "email" FROM "CrmContact" WHERE "systemId" = $1 AND "email" LIKE '%@gmail.com' AND "archivedAt" IS NULL ORDER BY "id" DESC LIMIT 40`, SYS)) as { email: string }[];
  const runTag = Date.now().toString(36);
  const post = async (payload: Record<string, unknown>) => {
    const body = JSON.stringify(payload);
    const res = await routeInbound.POST(new Request("http://localhost:3000/api/email/inbound", { method: "POST", body, headers: { "content-type": "application/json", "x-inbound-secret": process.env.EMAIL_INBOUND_SECRET!, "content-length": String(Buffer.byteLength(body)) } }));
    const j = (await res.json()) as Any;
    if (res.status !== 200 || !j.handled) throw new Error(`inbound ไม่ถูกเก็บ ${res.status} ${JSON.stringify(j)}`);
  };
  await bench("inbound", "inbound.known", "อีเมลขาเข้าจากผู้ติดต่อที่มีอยู่ (จับคู่อีเมล)", "public", { p95Ms: 1500 }, (i) =>
    post({ messageId: `<c51-k-${runTag}-${i}@mail.example>`, to: ["crm+perfqcab@shark.in.th"], from: `ลูกค้า <${known[(i + 40) % known.length]!.email}>`, subject: "สอบถามใบเสนอราคา", text: "สวัสดีครับ ขอใบเสนอราคาหน่อย", headers: {} }),
  );
  await bench("inbound", "inbound.domain", "อีเมลขาเข้าจากโดเมนบริษัท (ไม่รู้จักคน)", "public", { p95Ms: 1500 }, (i) =>
    post({ messageId: `<c51-d-${runTag}-${i}@mail.example>`, to: ["crm+perfqcab@shark.in.th"], from: `new${i}-${runTag}@co${1000 + (Math.abs(i) % 500)}.example.co.th`, subject: "ติดต่อเรื่องสัญญา", text: "สวัสดีค่ะ", headers: {} }),
  );
  await bench("inbound", "inbound.stranger", "อีเมลขาเข้าจากคนแปลกหน้า → lead ใหม่", "public", { p95Ms: 1500 }, (i) =>
    post({ messageId: `<c51-s-${runTag}-${i}@mail.example>`, to: ["crm+perfqcab@shark.in.th"], from: `คนใหม่ <stranger-${runTag}-${i}@unknown-perf.example>`, subject: "สนใจบริการ", text: "สนใจค่ะ", headers: {} }),
  );
  await bench("inbound", "inbound.reply", "อีเมลตอบกลับ (In-Reply-To เธรดเดิม)", "public", { p95Ms: 1500 }, (i) =>
    post({ messageId: `<c51-r-${runTag}-${i}@mail.example>`, to: ["crm+perfqcab@shark.in.th"], from: known[(i + 40) % known.length]!.email, subject: "Re: ใบเสนอราคา", text: "ตอบกลับ", headers: { "In-Reply-To": `<pf-${1 + (Math.abs(i) % 100) * 3}@perf.example.co.th>` } }),
  );
}

// ═══════════════════ 7. หน้าอื่น ๆ (ไม่มีเกณฑ์ตัวเลขใน §12 — หา N+1/คำสั่งช้า) ═══════════════════
if (want("other")) {
  await bench("other", "contact360.heavy", `ผู้ติดต่อ 360 — ตัวหนัก (${heavyContact.n} กิจกรรม)`, "owner", {}, () => C.getContact360(ctxFor("owner"), actor("owner"), heavyContact.id));
  await bench("other", "contact360.light", `ผู้ติดต่อ 360 — ตัวเบา (${lightContact?.n ?? "?"} กิจกรรม)`, "owner", {}, () => C.getContact360(ctxFor("owner"), actor("owner"), "pfct_0150001"));
  await bench("other", "company360.big", `บริษัท 360 — ใหญ่สุด (${bigCompany.n} ผู้ติดต่อ)`, "owner", {}, () => CO.getCompany360(ctxFor("owner"), actor("owner"), bigCompany.id));
  await bench("other", "deal360.heavy", `ดีล 360 — ตัวหนัก (${bigDeal.n} กิจกรรม)`, "owner", {}, () => D.getDeal360(ctxFor("owner"), actor("owner"), bigDeal.id));
  for (const ps of [10, 50, 100]) await bench("n+1", `companies.list.ps${ps}`, `listCompanies pageSize ${ps}`, "owner", {}, () => CO.listCompanies(ctxFor("owner"), actor("owner"), { pageSize: ps }));
  for (const ps of [10, 50, 200]) await bench("n+1", `activities.list.ps${ps}`, `listActivities pageSize ${ps} (ค้าง)`, "staff", {}, () => AC.listActivities(ctxFor("staff"), actor("staff"), { status: "pending", pageSize: ps }));
  await bench("other", "activities.list.owner", "listActivities ทั้งร้าน (เลยกำหนด)", "owner", {}, () => AC.listActivities(ctxFor("owner"), actor("owner"), { status: "overdue" }));
  const monthStart = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1) - 7 * 3_600_000);
  await bench("other", "calendar.month", "ปฏิทินกิจกรรม 1 เดือน (ทั้งร้าน)", "owner", {}, () => AC.calendar(ctxFor("owner"), actor("owner"), { from: monthStart, to: new Date(monthStart.getTime() + 31 * 86_400_000) }));
  for (const ps of [10, 50, 100]) await bench("n+1", `records.car.ps${ps}`, `รายการวัตถุ "รถ" pageSize ${ps}`, "staff", {}, () => OB.records.list(ctxFor("staff"), actor("staff"), "car", { pageSize: ps }));
  await bench("other", "records.car.filter", `รายการวัตถุ "รถ" + ตัวกรอง brand/year`, "owner", {}, () => OB.records.list(ctxFor("owner"), actor("owner"), "car", { pageSize: 50, f: { brand: "toyota", year: "2018.." } }));
  await bench("other", "records.car.filterNarrow", `รายการวัตถุ "รถ" + ตัวกรองแคบ brand=bmw/year=2024`, "owner", {}, () => OB.records.list(ctxFor("owner"), actor("owner"), "car", { pageSize: 50, f: { brand: "bmw", year: "=2024" } }));
  for (const ps of [10, 50, 100]) await bench("n+1", `emails.threads.ps${ps}`, `listThreads pageSize ${ps}`, "owner", {}, () => EM.listThreads(ctxFor("owner"), actor("owner"), { pageSize: ps }));
  await bench("other", "home.owner", "หน้าแรก CRM (homeData)", "owner", {}, () => HOME.homeData(ctxFor("owner"), actor("owner"), {}));
  await bench("other", "home.staff", "หน้าแรก CRM (homeData)", "staff", {}, () => HOME.homeData(ctxFor("staff"), actor("staff"), {}));
  const from = thaiYmd(new Date(anchor.getTime() - 365 * 86_400_000));
  const to = thaiYmd(anchor);
  for (const tab of ["overview", "reps", "activities", "lost", "sources", "scores"]) {
    await bench("reports", `report.${tab}`, `รายงานแท็บ ${tab} (12 เดือน)`, "owner", tab === "overview" ? { maxQueries: 12, note: "เพดานของใบ C3.1 (overview ≤ 12)" } : {}, () => R.getReport(ctxFor("owner"), actor("owner"), tab, { from, to }));
  }
}

// ═══════════════════ 8. index ที่ §12 บังคับ ═══════════════════
const idxRows = (await prisma.$queryRawUnsafe(`SELECT tablename, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename IN ('CrmDeal','CrmEmailMessage','CrmWebSession','CustomRecordValue','CrmDealStageHistory','CrmActivity','CrmContact')`)) as { tablename: string; indexdef: string }[];
const hasIdx = (table: string, cols: string[]) => idxRows.some((r) => r.tablename === table && r.indexdef.replace(/"/g, "").includes(`(${cols.join(", ")})`));
const indexChecks = [
  { need: 'CrmDeal(systemId, ownerUserId, kind, expectedCloseAt)', ok: hasIdx("CrmDeal", ["systemId", "ownerUserId", "kind", "expectedCloseAt"]) },
  { need: "CrmEmailMessage(threadKey, sentAt)", ok: hasIdx("CrmEmailMessage", ["threadKey", "sentAt"]) },
  { need: "CrmWebSession(visitorId) — มีเป็น (systemId, visitorId)", ok: hasIdx("CrmWebSession", ["systemId", "visitorId"]) || hasIdx("CrmWebSession", ["visitorId"]) },
  { need: "CustomRecordValue(fieldId, valueDate)", ok: hasIdx("CustomRecordValue", ["fieldId", "valueDate"]) },
];
for (const c of indexChecks) console.log(`${c.ok ? "✅" : "❌"} index ${c.need}`);

// ═══════════════════ 9. EXPLAIN ANALYZE ของคำสั่งที่ช้าที่สุด (อ่านอย่างเดียว) ═══════════════════
const explains: { id: string; ms: number; sql: string; file: string; seqScans: string[]; execMs: number | null }[] = [];
const seen = new Set<string>();
const topSlow = slowPool.sort((a, b) => b.ev.duration - a.ev.duration).filter((s) => {
  const k = s.ev.query.replace(/\s+/g, " ");
  if (seen.has(k) || !/^\s*(SELECT|WITH)\b/i.test(s.ev.query) || /\b(UPDATE|INSERT|DELETE)\b/i.test(s.ev.query)) return false;
  seen.add(k);
  return true;
}).slice(0, 30);
for (const [i, s] of topSlow.entries()) {
  let params: unknown[] = [];
  try {
    params = JSON.parse(s.ev.params);
  } catch {
    params = [];
  }
  const file = `${OUT}/explain/${String(i + 1).padStart(2, "0")}-${s.id}.txt`;
  try {
    const rows = (await prisma.$queryRawUnsafe(`EXPLAIN (ANALYZE, BUFFERS) ${s.ev.query}`, ...params)) as Record<string, string>[];
    const plan = rows.map((r) => Object.values(r)[0]).join("\n");
    writeFileSync(file, `-- ${s.id} · ${r1(s.ev.duration)} ms (วัดในฉาก)\n-- params: ${s.ev.params.slice(0, 2000)}\n${s.ev.query}\n\n${plan}\n`);
    const seqScans = [...plan.matchAll(/Seq Scan on "?(\w+)"?[^\n]*rows=(\d+)/g)].filter((m) => Number(m[2]) >= 1000).map((m) => `${m[1]} (${m[2]} rows)`);
    const exec = /Execution Time: ([\d.]+) ms/.exec(plan);
    explains.push({ id: s.id, ms: r1(s.ev.duration), sql: shape(s.ev.query), file, seqScans, execMs: exec ? Number(exec[1]) : null });
  } catch (e) {
    writeFileSync(file, `-- ${s.id} EXPLAIN ล้ม: ${(e as Error).message.slice(0, 500)}\n${s.ev.query}\n`);
    explains.push({ id: s.id, ms: r1(s.ev.duration), sql: shape(s.ev.query), file, seqScans: ["(explain failed)"], execMs: null });
  }
}

// ═══════════════════ 10. N+1 (จำนวน query โตตามขนาดหน้า) ═══════════════════
const n1: { list: string; q: Record<string, number>; grows: boolean }[] = [];
const byPrefix = new Map<string, Result[]>();
for (const r of results.filter((x) => x.group === "n+1")) {
  const k = r.id.replace(/\.ps\d+$/, "");
  byPrefix.set(k, [...(byPrefix.get(k) ?? []), r]);
}
for (const [k, rs] of byPrefix) {
  const q = Object.fromEntries(rs.map((r) => [r.id.match(/ps(\d+)$/)![1]!, r.qMax]));
  const vals = Object.values(q);
  n1.push({ list: k, q, grows: Math.max(...vals) > Math.min(...vals) });
}

// ═══════════════════ ผล ═══════════════════
try {
  // ถังนับความถี่ที่ฉาก tracking สร้าง (ตารางกลาง ไม่มี tenantId) — ลบด้วยกุญแจตรงตัว
  if (rateKeys.size) {
    const n = await prisma.chatRateBucket.deleteMany({ where: { key: { in: [...rateKeys] } } });
    console.log(`\nลบถังนับความถี่ของฉาก tracking ${n.count}/${rateKeys.size} แถว`);
  }
} catch (e) {
  console.error(`⚠️ ลบถังนับความถี่ไม่สำเร็จ: ${(e as Error).message.slice(0, 200)}`);
}
const budgeted = results.filter((r) => r.pass !== null);
const summary = {
  suite: "qc-crm-perf", at: new Date().toISOString(), db: env.host.replace(/^([^.]+).*/, "$1"), runs: RUNS, rtt: RTT, anchor: anchor.toISOString(),
  dataset: { contacts: 200_000, companies: 50_000, openDeals: 20_000, closedDeals: 6_000, activities: 1_000_000, customFields: 30, customObjects: "3 × 100,000" },
  pass: budgeted.filter((r) => r.pass).length, fail: budgeted.filter((r) => r.pass === false).length, info: results.length - budgeted.length,
  results, n1, indexChecks, explains,
};
writeFileSync(`${OUT}/summary.json`, JSON.stringify(summary, null, 1));
const line = (cols: (string | number)[], w: number[]) => cols.map((c, i) => String(c).padEnd(w[i]!)).join(" | ");
const W = [24, 58, 26, 8, 8, 8, 9, 8, 22];
const table = [
  `CRM v2 C5.1 — performance at real size · ${summary.at} · QC2 ${summary.db} · ${RUNS} runs/scene · RTT p50 ${RTT.p50} ms`,
  line(["id", "scene", "actor", "p50 ms", "p95 ms", "net p95", "queries", "q data", "budget → verdict"], W),
  line(W.map((w) => "-".repeat(w)), W),
  ...results.map((r) => line([r.id, r.title.slice(0, 58), r.actor.slice(0, 26), r.p50, r.p95, r.netP95, r.qMin === r.qMax ? r.qMax : `${r.qMin}-${r.qMax}`, r.qData, `${r.budget.maxQueries !== undefined ? `≤${r.budget.maxQueries}q ` : ""}${r.budget.p95Ms !== undefined ? `≤${r.budget.p95Ms}ms ` : ""}${r.verdict}`], W)),
  "",
  "net p95 = p95 − queries × RTT p50 (optimistic: assumes every round-trip is sequential) · q data = queries excluding system/visibility/team/field-definition guards",
  "N+1 (queries per page size): " + n1.map((x) => `${x.list} ${JSON.stringify(x.q)}${x.grows ? " ⚠ GROWS" : ""}`).join(" · "),
  "Required indexes: " + indexChecks.map((c) => `${c.ok ? "✓" : "✗"} ${c.need}`).join(" · "),
  "Slowest queries (EXPLAIN): " + explains.map((e) => `${e.id} ${e.ms}ms exec ${e.execMs ?? "?"}ms${e.seqScans.length ? ` seq[${e.seqScans.join(", ")}]` : ""}`).join(" · "),
].join("\n");
writeFileSync(`${OUT}/summary.txt`, table + "\n");
console.log(`\n${table}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: "qc-crm-perf", pass: summary.pass, fail: summary.fail, info: summary.info, rttP50: RTT.p50, n1Grows: n1.filter((x) => x.grows).map((x) => x.list), failing: budgeted.filter((r) => r.pass === false).map((r) => `${r.id}: ${r.verdict}`) })}`);
await prisma.$disconnect();
