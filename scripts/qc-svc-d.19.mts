// QC — SVC D.19 · รายงานหลักหอ (ลูกหนี้ตามอายุ · อัตราเข้าพักรายเดือน · รายได้แยกประเภท · ส่งออก CSV) · oracle ของผู้เขียนข้อสอบ — builder ห้ามแก้ไฟล์นี้ (แย้ง = wo-notes)
// สัญญา: ledger/svc-briefs/svc-brief-d.19.md (§2 มติ · §3 สัญญาโค้ด · §4 DOM · §5 หน้า · §7 ฉาก · §10 คำขอเคาะ) · ledger/SVC-MASTER-PLAN.md แถว D.19
//        D.10 billBalances (ยอดค้างนิยามเดียว) · D.11 overdueModel (daysLate วันไทย) · D.8 บิล/รอบ/adjustSentBill · D.3 VAT ต่อบรรทัด · D.13 ขอบเขตอาคาร #64 · core/csv csvRow (X6)
//
// กลุ่มข้อ:
//   S  โครงสร้าง/ไฟล์/ค่าตั้ง/ชิ้นเดิม/อ่านอย่างเดียว (static) (+ S-1/S-2/S-13 git ท้ายไฟล์)
//   PC ตัวควบคุม (เขียวตั้งแต่ก่อนมีงาน): ฉากเงินผ่าน D.8/D.2/D.10 · GL 1100 = billBalances · ยอดต่อเอกสารอิสระ = billBalances · ข้อเท็จจริงบัญชี V2
//      (outstandingByContacts ไม่หักใบลดหนี้/ไม่นับใบเพิ่มหนี้ ISSUED) · บรรทัดบิล = ยอดใบแจ้งหนี้ · ขอบเขตอาคาร · csvRow · ฉากเข้าพัก
//   A  ลูกหนี้ตามอายุ = GL 1100 ทุกสตางค์ (บางส่วน · ใบลดหนี้ · ใบเพิ่มหนี้หลังจ่ายครบ · ยกเลิก · ยกยอด · จ่ายเกิน · ขอบวันไทย · สมุดร่วม · หอ VAT · อ่านสด)
//   O  อัตราเข้าพัก (ขอบเดือนไทย · ย้ายออก · ส่งต่อวันเดียวกัน · DRAFT/CANCELLED · ห้องปิด · เดือนปัจจุบัน/อนาคต · ถ่วงวัน · ขอบเขตอาคาร)
//   R  รายได้แยกประเภท (= บรรทัดบิล · ADJUST = DN − CN · รวม = เอกสารบัญชี · ใบยกเลิก · VAT ชัด · เก็บแล้ว · ช่วง/เพดานเดือน)
//   M  โมเดลจอ (ช่วง MONTH/6M/YEAR · KPI · เท่ากับฟังก์ชันย่อย) · E ส่งออก CSV (BOM · ยอดตรง · กันสูตร · เพดานจากค่าตั้ง · ชื่อแรก · ขอบเขต)
//   X  ด่าน (ไม่พบเดียวกันทุกไบต์ · ขอบเขตอาคาร · Membership สด · ร้าน B) · W อ่านอย่างเดียว · P perf 300 ห้อง × 12 งวด · U DOM · Q ฉาก svcqc · V ภาพ · Z ล้าง · G regression
//
// 🔴 ความจริงฝั่งบัญชี = บัญชีย่อยลูกหนี้ GL 1100 ต่อผู้ติดต่อ (ใบสั่ง §2 ข้อ 1 · §10 R1) — PC-3 พิสูจน์ GL = billBalances ก่อนเทียบรายงาน
// 🔴 APP_URL = https://qc-d19.invalid ในโพรเซสนี้ · ครอบ fetch (นอกเครื่อง = บล็อก) · ร้านทดสอบ slug `qc-svc-d19-*` · ผู้ใช้ `svc-d19-*@shark.local` · ลบใน finally (+ กวาดค้างตอนเริ่ม)
// 🔴 วันที่ตายตัว (ฉีด now ทุกครั้ง) · เวลาไทย = UTC+7 · งวดบิลของฉากเงิน DA ต้อง ≤ "เดือนหน้า" ของนาฬิกาจริง (ด่านน้ำไฟ D.7 อ่านเวลาเครื่อง) ⇒ ใช้ พ.ค.–ก.ย. 2569
// รัน: cd /root/projects/shark-svc-l3 && bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-d.19.mts [--no-regression]
//      (ห้าม timeout ครอบ · ห้าม kill กลางคัน · `--no-regression` = G เป็น SKIP · QC_BASE=http://127.0.0.1:<port> เปิดหมวด V)
/* eslint-disable @typescript-eslint/no-explicit-any */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync, execFileSync } from "node:child_process";
import { randomBytes, randomInt } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
import { SQC_TENANT, SQC_UNITS, SQC_USERS, SQC_VISUAL_SPECS, SQC_DORM_REPORT_SCENE, SQC_DORM_HOME_SCENE } from "./svc-qc-data.mjs";

type Any = any;
const SELF = fileURLToPath(import.meta.url);
const ROOT = join(dirname(SELF), "..");
const LABEL = "qc-svc-d.19";
const NO_REG = process.argv.includes("--no-regression") || process.env.SVC_D19_NO_REGRESSION === "1";
const ORIGIN = "https://qc-d19.invalid";
const F = {
  report: "src/lib/modules/dorm/report.ts",
  dormIndex: "src/lib/modules/dorm/index.ts",
  page: "src/app/app/u/[unitSlug]/dorm/reports/page.tsx",
  actions: "src/app/app/u/[unitSlug]/dorm/reports/actions.ts",
  comp: "src/components/dorm/DormReports.tsx",
  scene: "scripts/svc-qc-report-scene.mts",
  defs: "src/lib/core/settings/defs/rooms.ts",
  unitHome: "src/app/app/u/[unitSlug]/page.tsx",
  fitness: "scripts/fitness.mts",
} as const;

loadSvcQcEnv(LABEL); // ด่านฐาน: ไม่ใช่ qc-svc ⇒ exit 4 ก่อนแตะฐาน
if (process.env.CI) { console.error(`🔴 ${LABEL}: ห้าม export CI (with-gate-lock ข้าม flock)`); process.exit(4); }
if (process.env.APP_ENV === "production") { console.error(`🔴 ${LABEL}: APP_ENV=production`); process.exit(4); }
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 300);

// ═══════════════ ตัวช่วย ═══════════════
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Res = "PASS" | "FAIL" | "SKIP";
const cks: { id: string; res: Res; sev: Sev; why: string }[] = [];
class AssertFail extends Error {}
const fmt = (v: unknown): string => { try { return JSON.stringify(v)?.slice(0, 300) ?? String(v); } catch { return String(v); } };
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
const codeOf = (r: Any) => (r?.ok === true ? "ok" : r?.code ?? (r?.threw ? `threw:${r.threw}` : J(r)?.slice(0, 80)));
const failIs = (r: Any, code: string) => r?.ok === false && r?.code === code && typeof r?.reason === "string" && THAI.test(r.reason);
const DAY = 86_400_000;
const thaiYmd = (d: Date | string) => new Date(new Date(d).getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
const ymdOfDb = (d: Date | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : null);
const dayNo = (ymd: string) => Math.round(Date.parse(`${ymd}T00:00:00Z`) / DAY);
const monthAdd = (ym: string, n: number) => { const [y, m] = ym.split("-").map(Number); const t = y * 12 + (m - 1) + n; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`; };
const dim = (ym: string) => { const [y, m] = ym.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
const monthsOf = (from: string, to: string) => { const out: string[] = []; for (let m = from; m <= to; m = monthAdd(m, 1)) out.push(m); return out; };
const bp = (num: number, den: number) => (den > 0 ? Math.floor((num * 10000 * 2 + den) / (den * 2)) : 0); // ปัดครึ่งขึ้น (จำนวนเต็มบวก)
const baht = (s: number) => `฿${(s / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const BUCKETS = ["notDue", "d1_30", "d31_60", "d61_90", "d90plus"] as const;
type Bucket = (typeof BUCKETS)[number];
const bucketOf = (daysLate: number): Bucket => (daysLate <= 0 ? "notDue" : daysLate <= 30 ? "d1_30" : daysLate <= 60 ? "d31_60" : daysLate <= 90 ? "d61_90" : "d90plus");
type Buckets = { notDueSatang: number; d1_30Satang: number; d31_60Satang: number; d61_90Satang: number; d90plusSatang: number; totalSatang: number };
const emptyB = (): Buckets => ({ notDueSatang: 0, d1_30Satang: 0, d31_60Satang: 0, d61_90Satang: 0, d90plusSatang: 0, totalSatang: 0 });
const addB = (b: Buckets, k: Bucket, v: number) => { (b as Any)[`${k}Satang`] += v; b.totalSatang += v; };
const REV_TYPES = ["RENT", "COMMON", "ELEC", "WATER", "LATE_FEE", "OTHER", "ADJUST"] as const;
type RevType = (typeof REV_TYPES)[number];
type M3 = { netSatang: number; vatSatang: number; grossSatang: number };
const z3 = (): M3 => ({ netSatang: 0, vatSatang: 0, grossSatang: 0 });
const add3 = (a: M3, b: M3, sign = 1) => { a.netSatang += sign * b.netSatang; a.vatSatang += sign * b.vatSatang; a.grossSatang += sign * b.grossSatang; };
const typeOfCode = (code: string): RevType => (["RENT", "COMMON", "ELEC", "WATER", "LATE_FEE"].includes(code) ? (code as RevType) : "OTHER");
const SENTISH = ["SENT", "PARTIALLY_PAID", "PAID"];
const DEAD = ["DRAFT", "VOIDED", "CANCELLED"];
/** CSV RFC 4180 อ่านง่าย ๆ (ไม่มี BOM) */
const parseCsv = (s: string): string[][] => {
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; continue; }
    if (c === '"') q = true; else if (c === ",") { row.push(cell); cell = ""; } else if (c === "\n" || c === "\r") { if (c === "\r" && s[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
};
const satOfBaht = (s: string) => { ok(/^-?\d+\.\d{2}$/.test(s), `เงินในไฟล์ต้องเป็นบาททศนิยม 2 ตำแหน่ง ได้ "${s}"`); const neg = s.startsWith("-"); const [i, f] = s.replace("-", "").split("."); return (neg ? -1 : 1) * (Number(i) * 100 + Number(f)); };
const dangerous = (cell: string) => !/^-?\d+(\.\d+)?$/.test(cell) && /^[\t\r\n ]*[=+\-@]/.test(cell);

// ═══════════════ ครอบ fetch (ไม่ออกนอกเครื่อง) ═══════════════
process.env.APP_URL = ORIGIN;
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

// ═══════════════ โหลดโมดูล (หลัง env) ═══════════════
const reportL = await loadIf(F.report);
const dormL = await tryImport("@/lib/modules/dorm");
const dbL = await tryImport("@/lib/core/db");
const prisma: Any = dbL.mod?.prisma;
if (!prisma) { console.error(`🔴 ${LABEL}: โหลด prisma ไม่ได้ (${dbL.err})`); process.exit(4); }
const SET = (await tryImport("@/lib/core/settings")).mod as Any;
const CSV = (await tryImport("@/lib/core/csv")).mod as Any;
const ACC = (await tryImport("@/lib/modules/account")).mod as Any;
const SYS = (await tryImport("@/lib/modules/system/service")).mod as Any;
const ASV = (await tryImport("@/lib/modules/account/service")).mod as Any;
const AREP = (await tryImport("@/lib/modules/account/reports")).mod as Any;
const GL = (await tryImport("@/lib/modules/account/gl")).mod as Any;
const DORM = dormL.mod as Any;
const DPAY = (await tryImport("@/lib/platform/dorm-pay")).mod as Any;
const PRISMA_NS = ((await tryImport("@prisma/client")).mod as Any)?.Prisma;
const FIDX = F.dormIndex;
const D = {
  aging: () => fnOf(dormL, "dormAgingReport", FIDX),
  occ: () => fnOf(dormL, "dormOccupancyReport", FIDX),
  rev: () => fnOf(dormL, "dormRevenueReport", FIDX),
  model: () => fnOf(dormL, "dormReportModel", FIDX),
  csv: () => fnOf(dormL, "dormReportCsv", FIDX),
  NF: (): string => { const t = valOf(dormL, "DORM_REPORT_NF_REASON", FIDX); ok(typeof t === "string" && THAI.test(t), "DORM_REPORT_NF_REASON ต้องเป็นข้อความไทย"); return t; },
};
const okRes = (r: Any, what: string) => { ok(r?.ok === true, `${what}: ${codeOf(r)} ${r?.reason ?? ""}`.trim()); return r; };

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
async function cleanupMisc() {
  try { await prisma.user.deleteMany({ where: { email: { startsWith: "svc-d19-" } } }); } catch (e) { console.log(`  ⚠️ ลบ user: ${errMsg(e)}`); }
}
const parkOutbox = async (tids: string[]) => { await prisma.$executeRawUnsafe(`UPDATE "OutboxEvent" SET "availableAt" = now() + interval '2 days' WHERE "tenantId" = ANY($1::text[]) AND status::text = 'PENDING'`, tids); };

// ═══════════════ ฉาก (วันที่ตายตัว · เวลาไทย = UTC+7) ═══════════════
const P0 = "2026-05", P1 = "2026-06", P2 = "2026-07", P3 = "2026-08", P4 = "2026-09";
const PERIODS = [P0, P1, P2, P3, P4];
const RUN_AT: Record<string, string> = { [P0]: "2026-04-25T03:00:00.000Z", [P1]: "2026-05-25T03:00:00.000Z", [P2]: "2026-06-25T03:00:00.000Z", [P3]: "2026-07-25T03:00:00.000Z", [P4]: "2026-08-25T03:00:00.000Z" };
const NOW_A = "2026-08-26T03:00:00.000Z";    // พ. 26 ส.ค. 2569 10:00 ไทย — วันดูรายงานลูกหนี้ (ครบ 5 พ.ค./มิ.ย./ก.ค./ส.ค./ก.ย. ⇒ 113/82/52/21/−10 วัน)
const NOW_O = "2026-11-10T03:00:00.000Z";    // 10 พ.ย. 10:00 ไทย — เดือนปัจจุบัน พ.ย. (10 วัน)
const NOW_EDGE = "2026-11-30T17:30:00.000Z"; // 1 ธ.ค. 00:30 ไทย (UTC ยัง 30 พ.ย.)
const P_UTIL = "2026-10", P_RUN = "2026-11", NOW_N = "2026-10-26T07:05:00.000Z";
const READ_AT = (p: string) => new Date(`${p}-25T03:00:00.000Z`);
const dbDate = (ymd: string) => new Date(`${ymd}T00:00:00Z`);
const RENT = 450_000, COMMON = 30_000, BASE = RENT + COMMON;
const SELLER_V = "0105561000003";
const tenantIds: string[] = [];
const PHONES: string[] = [];
const SURNAMES: string[] = [];
let ready = false;
const needReady = () => ok(ready, "ฉากข้อมูลทดสอบสร้างไม่สำเร็จ (ดู PC-1)");
const ids: Record<string, string> = {};
const LS: Record<string, { leaseId: string; partyId: string; roomId: string; roomNo: string; unitId: string; first: string }> = {};
const bills: Record<string, Any> = {};   // "<lease>:<period>" → แถว DormBill
const RESULTS: unknown[] = [];
const keep = <X,>(r: X): X => { RESULTS.push(r); return r; };

console.log(`\n(APP_URL ${ORIGIN})`);

try {
  const stale = await prisma.tenant.findMany({ where: { slug: { startsWith: "qc-svc-d19-" } }, select: { id: true } });
  if (stale.length) { console.log(`(กวาด tenant ค้างจากรอบก่อน ${stale.length})`); await cleanup(stale.map((t: { id: string }) => t.id)); }
  await cleanupMisc();

  // ═══════════════ S (ไม่แตะฐาน) ═══════════════
  console.log("\n── S โครงสร้าง ──");
  const NEW_FILES = [F.report, F.page, F.actions, F.comp, F.scene];
  await st("S-3", "มีไฟล์ใหม่ของใบครบ 5 ไฟล์ (§1)", () => { const miss = NEW_FILES.filter((f) => !existsSync(join(ROOT, f))); ok(!miss.length, `ขาด ${miss.join(", ")}`); });
  await st("S-4", "facade @/lib/modules/dorm: dormAgingReport · dormOccupancyReport · dormRevenueReport · dormReportModel · dormReportCsv + DORM_REPORT_NF_REASON (ไทย) + DORM_REVENUE_TYPES ตรงลำดับ §3", () => {
    const names = ["dormAgingReport", "dormOccupancyReport", "dormRevenueReport", "dormReportModel", "dormReportCsv"];
    const miss = names.filter((n) => typeof dormL.mod?.[n] !== "function");
    ok(!miss.length, `ขาด ${miss.join(", ")} (${dormL.err || reportL.err || "โหลดได้"})`);
    ok(typeof dormL.mod.DORM_REPORT_NF_REASON === "string" && THAI.test(dormL.mod.DORM_REPORT_NF_REASON), "DORM_REPORT_NF_REASON");
    eq([...(dormL.mod.DORM_REVENUE_TYPES ?? [])], [...REV_TYPES], "DORM_REVENUE_TYPES");
  });
  await st("S-5", "ค่าตั้ง rooms.report.exportMaxRows (int 1–50000 · ค่าเริ่ม 5000) + rooms.report.maxMonths (int 1–36 · ค่าเริ่ม 24) · ชั้น TENANT เท่านั้น · ป้ายไทย · report.ts อ่านทั้งสองคีย์ (ไม่ฝัง 5000/24)", () => {
    const bad: string[] = [];
    const chk = (key: string, def: number, max: number) => {
      const d = SET?.getDef?.(key);
      if (!d) { bad.push(`${key} ไม่มี`); return; }
      if (d.type !== "int" || d.defaults?._fallback !== def || !isDeepStrictEqual([...(d.chain ?? [])], ["TENANT"]) || !THAI.test(d.labelTh ?? "")) bad.push(`${key} ${J({ t: d.type, d: d.defaults, c: d.chain })}`);
      if (d.schema?.safeParse?.(0)?.success || d.schema?.safeParse?.(max + 1)?.success || !d.schema?.safeParse?.(1)?.success || !d.schema?.safeParse?.(max)?.success) bad.push(`${key} schema`);
    };
    chk("rooms.report.exportMaxRows", 5000, 50000);
    chk("rooms.report.maxMonths", 24, 36);
    const s = stripComments(read(F.report));
    for (const k of ["rooms.report.exportMaxRows", "rooms.report.maxMonths"]) if (!s.includes(k)) bad.push(`report.ts ไม่อ่าน ${k}`);
    if (/(\?\?|\|\|)\s*(5000|5_000|24)\b|(exportMaxRows|maxMonths)\s*[:=]\s*\d/.test(s)) bad.push("ฝังค่าเพดานใน report.ts");
    ok(s && !bad.length, bad.join(" · ") || "ยังไม่มี report.ts");
  }, "MAJOR");
  await st("S-6", "report.ts ใช้ชิ้นเดิม: tenantDb (ไม่ import prisma ดิบ) · billBalances · ขอบเขตอาคาร (dormVisibleRoomsFor/dormScopeFor) · dormAccess · csvRow · occupiedDays · bkkYmd/bkkParts · ไม่เรียก outstandingByContacts/agingReport (§2 ข้อ 1)", () => {
    const raw = read(F.report), s = stripComments(raw);
    ok(s, "ยังไม่มี report.ts");
    const need: [string, RegExp][] = [["tenantDb", /tenantDb\s*\(/], ["billBalances", /billBalances\s*\(/], ["ขอบเขตอาคาร", /dormVisibleRoomsFor|dormScopeFor|dormVisibleRoomIds/], ["dormAccess", /dormAccess\s*\(/],
      ["csvRow", /csvRow\s*\(/], ["occupiedDays", /occupiedDays\s*\(/], ["วันไทย", /bkkYmd|bkkParts/]];
    const miss = need.filter(([, re]) => !re.test(s)).map(([n]) => n);
    const banned: string[] = [];
    if (/import\s*\{[^}]*\bprisma\b[^}]*\}\s*from\s+["']@\/lib\/core\/db["']/.test(raw)) banned.push("import prisma ดิบ");
    if (/outstandingByContacts|outstandingBothByContacts|agingReport\s*\(/.test(s)) banned.push("เรียก outstandingByContacts/agingReport");
    ok(!miss.length && !banned.length, `ขาด ${miss.join(", ") || "—"} · ${banned.join(", ") || ""}`);
  }, "MAJOR");
  await st("S-7", "อ่านอย่างเดียว (static): report.ts ไม่มี create/update/upsert/delete/$executeRaw/emitOutbox/auditLog · actions ไม่ revalidatePath", () => {
    const s = stripComments(read(F.report));
    ok(s, "ยังไม่มี report.ts");
    const hits = [/\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/, /\$executeRaw/, /emitOutbox/, /auditLog/i, /writeAudit|logAudit/].map((re) => re.exec(s)?.[0]).filter(Boolean);
    const a = stripComments(read(F.actions));
    if (/revalidatePath/.test(a)) hits.push("revalidatePath");
    ok(!hits.length, `พบ ${hits.join(", ")}`);
  }, "MAJOR");
  await st("S-8", "หน้า + actions + คอมโพเนนต์: page (requireUnit · DORM · dormReportModel → notFound · force-dynamic) · actions 'use server' export async function exportDormReportCsvAction เท่านั้น (requireUnit · ไม่อ่าน tenantId/unitId/actorUserId จาก client) · DormReports 'use client' default export · ไม่ import โมดูล server", () => {
    const pg = stripComments(read(F.page)), raw = read(F.actions), a = stripComments(raw), c = read(F.comp);
    ok(pg && a && c, "ยังไม่มีไฟล์จอ");
    const bad: string[] = [];
    if (!/requireUnit\s*\(/.test(pg) || !/["']DORM["']/.test(pg) || !/dormReportModel\s*\(/.test(pg) || !/notFound\s*\(/.test(pg) || !/force-dynamic/.test(pg)) bad.push("page: requireUnit/DORM/dormReportModel/notFound/force-dynamic");
    if (!/^\s*["']use server["']/.test(raw)) bad.push("actions: ไม่มี use server");
    if (/export\s+(const|let|type|interface|default|class|function\s)/.test(a.replace(/export\s+async\s+function/g, ""))) bad.push("actions: export อื่น");
    if (!/export\s+async\s+function\s+exportDormReportCsvAction\b/.test(a)) bad.push("actions: ไม่มี exportDormReportCsvAction");
    if (!/requireUnit\s*\(/.test(a)) bad.push("actions: ไม่ใช้ requireUnit");
    if (/get\(\s*["'](tenantId|unitId|actorUserId|userId)["']\s*\)|\b(tenantId|actorUserId)\s*:\s*(input|args|params|body)\b/.test(a)) bad.push("actions: อ่านร้าน/ผู้กระทำจาก client");
    if (!/^\s*["']use client["']/.test(c) || !/export\s+default\b/.test(c)) bad.push("DormReports: use client/default export");
    const imps = [...c.matchAll(/^\s*import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/gm)].filter((m) => !m[1]).map((m) => m[2]);
    const banned = imps.filter((x) => /^@prisma\//.test(x) || /^@\/lib\/(modules|platform|core\/db|core\/settings|payment|storage)/.test(x) || /^next\//.test(x) || /actions$/.test(x));
    if (banned.length) bad.push(`DormReports import ต้องห้าม ${banned.join(",")}`);
    ok(!bad.length, bad.join(" · "));
  }, "MAJOR");
  await st("S-9", "ไม่มี any · ไม่มี getDay/getDate/getMonth/getHours/getFullYear ดิบ · ไม่มีคำต้องห้าม สคบ. ในไฟล์ของใบ", () => {
    const files = NEW_FILES.filter((f) => f !== F.scene);
    const miss = files.filter((f) => !existsSync(join(ROOT, f)));
    ok(!miss.length, `ยังไม่มี ${miss.join(", ")}`);
    const anyUse = files.filter((f) => /:\s*any\b|as\s+any\b|<any>/.test(stripComments(read(f))));
    const raw = files.filter((f) => /\.(getDay|getDate|getMonth|getHours|getFullYear)\s*\(\s*\)/.test(stripComments(read(f))));
    const legal = files.filter((f) => LEGAL_BAD.test(stripComments(read(f))));
    ok(!anyUse.length && !raw.length && !legal.length, `any=${anyUse.join(",") || "—"} เวลาเครื่อง=${raw.join(",") || "—"} คำต้องห้าม=${legal.join(",") || "—"}`);
  }, "MAJOR");
  await st("S-10", "ทางเข้าจอ: UNIT_NAV.DORM มี /dorm/reports (แท็บหอคงเดิม — d.13 K-6)", () => {
    ok(/DORM\s*:\s*\[[\s\S]{0,800}["']\/dorm\/reports["']/.test(read(F.unitHome)), "UNIT_NAV.DORM ไม่มี /dorm/reports");
  }, "MINOR");
  await st("S-11", "(ผู้เขียนข้อสอบตั้งแล้ว) SQC_DORM_REPORT_SCENE (mark · historyOffsets −5…−2) + SQC_VISUAL_SPECS d.19 = /dorm/reports", () => {
    const s = SQC_DORM_REPORT_SCENE;
    ok(s.mark === "SvcQcScene:d19" && J(s.historyOffsets) === J([-5, -4, -3, -2]), J(s));
    const sp = SQC_VISUAL_SPECS["d.19"];
    ok(Array.isArray(sp) && sp.length === 1 && sp[0].path === `/app/u/${SQC_UNITS.dorm.slug}/dorm/reports`, J(sp));
  }, "MINOR");
  await st("S-12", "ไม่มีคีย์สิทธิ์/event ใหม่ของใบ: ไม่มี dorm.report.* ใน PERMISSIONS · ไม่มี event dorm.report.* ใน consumers", async () => {
    const PERM = (await tryImport("@/lib/core/permissions")).mod as Any;
    const OC = (await tryImport("@/lib/outbox-consumers")).mod as Any;
    ok(!(PERM?.PERMISSIONS ?? []).some((p: Any) => String(p.key).startsWith("dorm.report")), "มีคีย์ dorm.report.*");
    ok(!Object.keys(OC?.consumers ?? {}).some((k) => k.startsWith("dorm.report")), "มี event dorm.report.*");
  }, "MINOR");

  // ═══════════════ ข้อมูลทดสอบ ═══════════════
  console.log("\n── สร้างข้อมูลทดสอบ ──");
  const mkTenant = async (tag: string) => { const t = await prisma.tenant.create({ data: { name: `QC D19 ${tag}`, slug: `qc-svc-d19-${tag}-${STAMP}` } }); tenantIds.push(t.id); return t.id as string; };
  const A = await mkTenant("a"), B = await mkTenant("b");
  ids.A = A; ids.B = B;
  type BookOpt = { vat?: boolean; taxId?: string | null };
  const mkBook = async (tenantId: string, name: string, o: BookOpt = {}) => {
    const s = await SYS.createSystem(tenantId, "ACCOUNT", name);
    await ASV.saveSettings(tenantId, s.id, { orgName: name, vatRegistered: o.vat === true, taxId: o.taxId ?? null, branchCode: "00000", address: "99 ถนนสุขุมวิท แขวงคลองตัน เขตคลองเตย กรุงเทพฯ 10110", ...(o.vat ? { vatRateBp: 700 } : {}) });
    await GL.ensureAccounting({ tenantId, systemId: s.id });
    await prisma.accountFinance.create({ data: { tenantId, systemId: s.id, type: "BANK", name: "บัญชีรับเงินหอ", promptpayId: "0812345678", useForReceive: true } });
    return s.id as string;
  };
  const mkUnit = async (tenantId: string, tag: string, name: string, type = "DORM") => (await prisma.businessUnit.create({ data: { tenantId, type, name, slug: `d19${tag}-${STAMP}` } })).id as string;
  const linkBook = (tenantId: string, systemId: string, unitId: string) => prisma.accountSystemLink.create({ data: { tenantId, systemId, linkedKind: "BUSINESS", linkedId: unitId, enabled: true } });
  const mkUser = async (key: string, tenantId: string, role: string, unitAccess: string[], perms: string[] = [], accepted = true) => {
    const u = await prisma.user.create({ data: { email: `svc-d19-${STAMP}-${key}@shark.local`, name: `QC D19 ${key}` } });
    const m = await prisma.membership.create({ data: { userId: u.id, tenantId, role, unitAccess, permissions: Object.fromEntries(perms.map((p) => [p, true])), acceptedAt: accepted ? new Date() : null } });
    ids[`mb_${key}`] = m.id;
    return u.id as string;
  };
  const setVal = async (tenantId: string, key: string, scope: string, scopeId: string, value: unknown) => {
    await prisma.settingValue.deleteMany({ where: { tenantId, key, scope, scopeId } });
    await prisma.settingValue.create({ data: { tenantId, key, scope, scopeId, value: value === null ? PRISMA_NS.JsonNull : value, setById: "qc-d19" } });
  };
  const U = (tenantId: string, unitId: string, key: string, value: unknown) => setVal(tenantId, key, "UNIT", unitId, value);
  const unsetTenant = (tenantId: string, key: string) => prisma.settingValue.deleteMany({ where: { tenantId, key, scope: "TENANT", scopeId: tenantId } });
  const newPhone = () => { for (;;) { const p = `08${randomInt(10_000_000, 99_999_999)}`; if (!PHONES.includes(p)) { PHONES.push(p); return p; } } };
  const mkType = async (tenantId: string, unitId: string) => (await prisma.hotelRoomType.create({ data: { tenantId, unitId, name: "มาตรฐาน", capacity: 2, baseRateSatang: RENT, depositSatang: 0, rentMode: "MONTHLY", areaSqm: 24 } })).id as string;
  const mkBld = async (tenantId: string, unitId: string, name: string, sortOrder = 1) => (await prisma.roomBuilding.create({ data: { tenantId, unitId, name, floors: 3, sortOrder } })).id as string;
  const mkRoom = async (tenantId: string, unitId: string, typeId: string, bld: string, number: string, active = true) =>
    (await prisma.hotelRoom.create({ data: { tenantId, unitId, roomTypeId: typeId, number, buildingId: bld, floorNo: 1, floor: "1", active } })).id as string;
  /** สัญญาที่ใช้กับรอบบิลจริง (snapshot นโยบาย + RoomOccupancy LEASE) */
  const mkLease = async (key: string, o: { tenantId: string; unitId: string; roomId: string; roomNo: string; typeId: string; name: string; common?: number }) => {
    const party = await prisma.party.create({ data: { tenantId: o.tenantId, name: o.name, phone: newPhone() } });
    const tok = o.name.split(/\s+/);
    if (tok[1]) SURNAMES.push(tok.slice(1).join(" "));
    const snap = await SET.snapshotPolicy({ tenantId: o.tenantId }, "lease", { unitId: o.unitId, roomTypeId: o.typeId, roomId: o.roomId });
    const l = await prisma.dormLease.create({ data: {
      tenantId: o.tenantId, unitId: o.unitId, roomId: o.roomId, partyId: party.id, status: "ACTIVE", startDate: dbDate("2026-01-01"), endDate: dbDate("2027-12-31"),
      rentSatang: RENT, commonFeeSatang: o.common ?? COMMON, depositSatang: 0, advanceRentSatang: 0, bookingFeeSatang: 0, coTenants: { occupants: [], vehicles: [] },
      policySnapshot: snap, signedAt: new Date(), createdById: "qc-d19",
    } });
    const oc = await prisma.roomOccupancy.create({ data: { tenantId: o.tenantId, unitId: o.unitId, roomId: o.roomId, startDate: dbDate("2026-01-01"), endDate: dbDate("2028-01-01"), kind: "LEASE", refType: "DormLease", refId: l.id } });
    await prisma.dormLease.update({ where: { id: l.id }, data: { occupancyId: oc.id } });
    LS[key] = { leaseId: l.id, partyId: party.id, roomId: o.roomId, roomNo: o.roomNo, unitId: o.unitId, first: tok[0] };
    return l.id as string;
  };
  const billOf = async (key: string, periodKey: string): Promise<Any> => prisma.dormBill.findFirst({ where: { leaseId: LS[key].leaseId, periodKey } });
  const sendAll = async (ctx: Any, unitId: string, runId: string, now: string) => { let last: Any = null; for (let i = 0; i < 40; i++) { last = await DORM.sendBillRun(ctx, { unitId, runId }, { now: new Date(now) }); if (!last?.ok || last.done) break; } return last; };
  const runPeriod = async (ctx: Any, unitId: string, periodKey: string, now: string, beforeSend?: (runId: string) => Promise<void>) => {
    const r = await DORM.prepareBillRun(ctx, { unitId, periodKey }, { now: new Date(now) });
    if (r?.ok && beforeSend) await beforeSend(r.runId);
    const s = r?.ok ? await sendAll(ctx, unitId, r.runId, now) : null;
    await parkOutbox(tenantIds);
    return { r, s };
  };
  let payN = 0;
  const pay = async (tenantId: string, unitId: string, docId: string, amount: number, ymd: string) => {
    const r = await ACC.recordExternalPayment({ tenantId, unitId, docId, amountSatang: amount, idempotencyKey: `qc-d19-${STAMP}-fx${++payN}`, paidAt: new Date(`${ymd}T05:00:00.000Z`) });
    if (!r?.ok) throw new Error(`fixture รับชำระ: ${r?.code} ${r?.reason ?? ""}`);
    return r;
  };
  const mkMeter = async (tenantId: string, unitId: string, roomId: string, kind: string, startReading: number) =>
    (await prisma.dormMeter.create({ data: { tenantId, unitId, roomId, kind, role: "ROOM", startReading } })).id as string;
  const rd = async (tenantId: string, unitId: string, meterId: string, value: number) =>
    prisma.dormMeterReading.create({ data: { tenantId, unitId, meterId, periodKey: P_UTIL, kind: "PERIOD", value, source: "IMPORT", readAt: READ_AT(P_UTIL) } });
  const moneyUnit = async (tenantId: string, u: string, o: { meters?: boolean } = {}) => {
    if (!o.meters) { await U(tenantId, u, "rooms.utility.elec.metering", "NONE"); await U(tenantId, u, "rooms.utility.water.metering", "NONE"); }
    await U(tenantId, u, "messaging.quietHours", null);
    await U(tenantId, u, "messaging.channelOrder", ["WEB_LINK"]);
    await U(tenantId, u, "rooms.lateFee.autoCharge", false);
    await U(tenantId, u, "payments.receiver", { promptpayId: "0812345678", displayName: "หอดีสิบเก้า" });
  };

  const cO = () => ({ tenantId: A, actorUserId: ids.OWN });
  try {
    const BOOK_A = await mkBook(A, `บัญชีหอ D19 A ${STAMP}`), BOOK_V = await mkBook(A, `บริษัท หอดีสิบเก้าวีไอพี จำกัด ${STAMP}`, { vat: true, taxId: SELLER_V }), BOOK_B = await mkBook(B, `บัญชีหอ D19 B ${STAMP}`);
    const DA = await mkUnit(A, "a", "หอดีสิบเก้าเอ"), DA2 = await mkUnit(A, "a2", "หอดีสิบเก้าสมุดร่วม"), DV = await mkUnit(A, "v", "หอดีสิบเก้าวีไอพี"), DO = await mkUnit(A, "o", "หอดีสิบเก้าเข้าพัก");
    const DQ = await mkUnit(A, "q", "หอดีสิบเก้าว่าง"), HA = await mkUnit(A, "h", "โรงแรมดีสิบเก้า", "HOTEL"), DB = await mkUnit(B, "b", "หอดีสิบเก้าบี");
    Object.assign(ids, { BOOK_A, BOOK_V, BOOK_B, DA, DA2, DV, DO, DQ, HA, DB });
    for (const [t, bk, u] of [[A, BOOK_A, DA], [A, BOOK_A, DA2], [A, BOOK_V, DV], [B, BOOK_B, DB]] as const) await linkBook(t, bk, u);
    for (const [t, u] of [[A, DA], [A, DA2], [B, DB]] as const) await moneyUnit(t, u);
    await moneyUnit(A, DV, { meters: true });
    await U(A, DV, "rooms.vat.registered", true);
    await U(A, DV, "rooms.vat.pricesIncludeVat", true);
    // ผู้ใช้
    ids.OWN = await mkUser("owner", A, "OWNER", ["*"]);
    ids.OWNB = await mkUser("owner-b", B, "OWNER", ["*"]);
    ids.CT = await mkUser("ct", A, "STAFF", [DA, DO, DV], ["dorm.view", "dorm.slip.review"]);
    ids.CT2 = await mkUser("ct2", A, "STAFF", [DA, DO], ["dorm.view", "dorm.slip.review"]);
    ids.VW = await mkUser("vw", A, "STAFF", [DA, DO], ["dorm.view"]);
    ids.MT = await mkUser("mt", A, "STAFF", [DA], ["dorm.meter.read"]);
    ids.MGR = await mkUser("mgr", A, "MANAGER", [DQ]);
    ids.PEND = await mkUser("pend", A, "OWNER", ["*"], [], false);
    // ── DA: 8 สัญญา (อาคาร 1: 101–106 · อาคาร 2: 201–202) · ชื่อเป็นสูตร 4 คน (X6) ──
    const tyA = await mkType(A, DA), B1 = await mkBld(A, DA, "อาคาร หนึ่ง", 1), B2 = await mkBld(A, DA, "อาคาร สอง", 2);
    Object.assign(ids, { B1, B2 });
    const NAMES_A: Record<string, string> = {
      L1: `=HYPERLINK("http://x.invalid","x") สมชายดีสิบเก้า`, L2: "+66ส่วนลด ใจดีดีสิบเก้า", L3: "@SUM(A1) มั่นคงดีสิบเก้า", L4: "-2+3 รุ่งเรืองดีสิบเก้า",
      L5: "วิภา สุขใจดีสิบเก้า", L6: "ประเสริฐ ทองดีดีสิบเก้า", L7: "นิภา ศรีสุขดีสิบเก้า", L8: "อนันต์ แก้วดีดีสิบเก้า",
    };
    const ROOM_A: Record<string, [string, string]> = { L1: ["101", B1], L2: ["102", B1], L3: ["103", B1], L4: ["104", B1], L5: ["105", B1], L6: ["106", B1], L7: ["201", B2], L8: ["202", B2] };
    for (const k of Object.keys(NAMES_A)) { const [no, b] = ROOM_A[k]; const r = await mkRoom(A, DA, tyA, b, no); await mkLease(k, { tenantId: A, unitId: DA, roomId: r, roomNo: no, typeId: tyA, name: NAMES_A[k] }); }
    const tyA2 = await mkType(A, DA2), bA2 = await mkBld(A, DA2, "อาคาร สมุดร่วม");
    await mkLease("L9", { tenantId: A, unitId: DA2, roomId: await mkRoom(A, DA2, tyA2, bA2, "301"), roomNo: "301", typeId: tyA2, name: "สมุดร่วม ทดสอบดีสิบเก้า" });
    const tyB = await mkType(B, DB), bB = await mkBld(B, DB, "อาคาร บี");
    await mkLease("LB1", { tenantId: B, unitId: DB, roomId: await mkRoom(B, DB, tyB, bB, "101"), roomNo: "101", typeId: tyB, name: "ร้านบี ผู้เช่าดีสิบเก้า" });
    // ── DV: หอจด VAT (ราคารวม VAT) 3 ห้อง มิเตอร์ไฟ/น้ำ (แบบ D.3) ──
    const tyV = await mkType(A, DV), bV = await mkBld(A, DV, "อาคาร วี");
    const VROOMS: [string, string, [number, number], [number, number]][] = [["V1", "สมศรี วีไอพีดีสิบเก้า", [1287, 1412], [312, 318]], ["V2", "มานะ วีไอพีดีสิบเก้า", [0, 50], [0, 3]], ["V3", "ชูใจ วีไอพีดีสิบเก้า", [100, 160], [10, 14]]];
    for (const [no, name, e, w] of VROOMS) {
      const r = await mkRoom(A, DV, tyV, bV, no);
      await mkLease(no, { tenantId: A, unitId: DV, roomId: r, roomNo: no, typeId: tyV, name });
      await rd(A, DV, await mkMeter(A, DV, r, "ELEC", e[0]), e[1]);
      await rd(A, DV, await mkMeter(A, DV, r, "WATER", w[0]), w[1]);
    }
    for (const [kind, sat, units] of [["ELEC", 1_982_400, 4200], ["WATER", 384_000, 240]] as const) {
      const r = await DORM.recordAuthorityBill(cO(), { unitId: DV, kind, periodKey: P_UTIL, billSatang: sat, units });
      if (!r?.ok) throw new Error(`recordAuthorityBill ${kind}: ${codeOf(r)}`);
    }
    // ── รอบบิลจริง (D.8) ──
    const runs: Any[] = [];
    for (const p of PERIODS) runs.push(await runPeriod(cO(), DA, p, RUN_AT[p]));
    runs.push(await runPeriod(cO(), DA2, P3, RUN_AT[P3]));
    runs.push(await runPeriod({ tenantId: B, actorUserId: ids.OWNB }, DB, P2, RUN_AT[P2]));
    runs.push(await runPeriod(cO(), DV, P_RUN, NOW_N, async () => {
      const v1 = await billOf("V1", P_RUN);
      const x = await DORM.setBillExtraLines(cO(), { unitId: DV, billId: v1?.id, lines: [
        { kind: "LATE_FEE", labelTh: "ค่าปรับชำระล่าช้า", amountSatang: 10_000 },
        { kind: "OTHER", labelTh: "ค่าทำกุญแจสำรอง", amountSatang: 20_000, taxKind: "VAT7" },
      ] });
      if (!x?.ok) throw new Error(`setBillExtraLines V1: ${codeOf(x)} ${x?.reason ?? ""}`);
    }));
    const refresh = async () => {
      for (const k of ["L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8"]) for (const p of PERIODS) bills[`${k}:${p}`] = await billOf(k, p);
      bills[`L9:${P3}`] = await billOf("L9", P3); bills[`LB1:${P2}`] = await billOf("LB1", P2);
      for (const k of ["V1", "V2", "V3"]) bills[`${k}:${P_RUN}`] = await billOf(k, P_RUN);
    };
    await refresh();
    const sentOk = (k: string) => bills[k] && SENTISH.includes(bills[k].status) && !!bills[k].accountDocumentId;
    const want = [...["L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8"].flatMap((k) => PERIODS.map((p) => `${k}:${p}`)), `L9:${P3}`, `LB1:${P2}`, ...["V1", "V2", "V3"].map((k) => `${k}:${P_RUN}`)];
    const bad = want.filter((k) => !sentOk(k));
    const daTot = PERIODS.every((p) => ["L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8"].every((k) => bills[`${k}:${p}`]?.totalSatang === BASE));
    // ── เงิน (ฉาก A) — ค่าเริ่ม: จ่ายครบ P0–P3 · P4 ยังไม่จ่าย ──
    const payDay = (p: string) => `${p}-04`;
    const SKIP_PAY = new Set([`L2:${P0}`, `L3:${P1}`, `L4:${P2}`, `L5:${P3}`, `L6:${P2}`, `L7:${P1}`, `L8:${P1}`]);
    if (!bad.length) {
      for (const k of ["L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8"]) for (const p of [P0, P1, P2, P3]) if (!SKIP_PAY.has(`${k}:${p}`)) await pay(A, DA, bills[`${k}:${p}`].accountDocumentId, BASE, payDay(p));
      // L5 ส.ค. ผ่านทางรับเงินหอ D.10 (บิล ⇒ PAID จริง) แล้วค่อยออกใบเพิ่มหนี้
      const rp = await DPAY.recordDormPayment(cO(), { unitId: DA, billId: bills[`L5:${P3}`].id, amountSatang: BASE, channel: "CASH", idempotencyKey: `qcd19-${STAMP}-l5p3`, paidAt: payDay(P3) });
      if (!rp?.ok) throw new Error(`recordDormPayment L5: ${codeOf(rp)} ${rp?.reason ?? ""}`);
      await pay(A, DA, bills[`L3:${P1}`].accountDocumentId, 100_000, payDay(P1));                     // บางส่วน ⇒ ค้าง 3,800.00
      await pay(A, DA, bills[`L7:${P1}`].accountDocumentId, 200_000, payDay(P1));                     // บางส่วน + ยกยอด 2,800.00
      await prisma.dormBill.update({ where: { id: bills[`L7:${P1}`].id }, data: { carriedSatang: 280_000 } });
      await pay(A, DA, bills[`L8:${P1}`].accountDocumentId, BASE + 50_000, payDay(P1));               // จ่ายเกิน ⇒ 2110
      const cr = await DORM.adjustSentBill(cO(), { unitId: DA, billId: bills[`L4:${P2}`].id, kind: "CREDIT", reason: "ลดค่าส่วนกลางตามที่ตกลงกับผู้เช่า", idempotencyKey: `qcd19-${STAMP}-cr4`, lines: [{ code: "COMMON", labelTh: "ลดค่าส่วนกลาง", amountSatang: 30_000 }] });
      const dn = await DORM.adjustSentBill(cO(), { unitId: DA, billId: bills[`L5:${P3}`].id, kind: "DEBIT", reason: "ค่าซ่อมก๊อกน้ำที่ผู้เช่าตกลงจ่าย", idempotencyKey: `qcd19-${STAMP}-db5`, lines: [{ code: "OTHER", labelTh: "ค่าซ่อมก๊อกน้ำ", amountSatang: 25_000 }] });
      if (!cr?.ok || !dn?.ok) throw new Error(`adjustSentBill: ${codeOf(cr)} ${codeOf(dn)}`);
      const vd = await ASV.voidDocument(A, BOOK_A, bills[`L6:${P2}`].accountDocumentId, "ออกบิลผิดห้อง ทดสอบรายงาน");
      if (!vd?.ok) throw new Error(`voidDocument L6: ${vd?.reason}`);
      // DV: V1 จ่ายครบ · V2 ใบลดหนี้ส่วนกลาง (VAT) · V3 ใบเพิ่มหนี้อื่น
      await pay(A, DV, bills[`V1:${P_RUN}`].accountDocumentId, bills[`V1:${P_RUN}`].totalSatang, "2026-11-03");
      const crv = await DORM.adjustSentBill(cO(), { unitId: DV, billId: bills[`V2:${P_RUN}`].id, kind: "CREDIT", reason: "ลดค่าส่วนกลางเดือนนี้ตามประกาศ", idempotencyKey: `qcd19-${STAMP}-crv2`, lines: [{ code: "COMMON", labelTh: "ลดค่าส่วนกลาง", amountSatang: 5_000 }] });
      const dnv = await DORM.adjustSentBill(cO(), { unitId: DV, billId: bills[`V3:${P_RUN}`].id, kind: "DEBIT", reason: "ค่าซ่อมหน้าต่างที่ผู้เช่าตกลงจ่าย", idempotencyKey: `qcd19-${STAMP}-dbv3`, lines: [{ code: "OTHER", labelTh: "ค่าซ่อมหน้าต่าง", amountSatang: 15_000 }] });
      if (!crv?.ok || !dnv?.ok) throw new Error(`adjustSentBill DV: ${codeOf(crv)} ${codeOf(dnv)}`);
      await parkOutbox(tenantIds);
      await refresh();
    }
    await st("PC-1", `ฉากเงินผ่าน D.8 จริง: DA 8 สัญญา × 5 งวด (${PERIODS.join(" ")}) บิลละ ฿4,800.00 · DA2 1 บิล (สมุดร่วม) · ร้าน B 1 บิล · DV หอ VAT 3 บิล (ไฟ/น้ำ/ค่าปรับ/อื่น) · จ่าย/ใบลดหนี้/ใบเพิ่มหนี้/ยกเลิก/ยกยอด/จ่ายเกินตามฉาก`, () => {
      ok(!bad.length && daTot && runs.every((x) => x.s?.done), `ขาด ${bad.slice(0, 6).join(",")} · ยอด DA ${daTot} · ${J(runs.map((x) => (x.r?.ok ? x.s?.done ?? x.s : x.r))).slice(0, 400)}`);
    });
    ready = !bad.length && daTot;
  } catch (e) {
    record("PC-1", "ฉากเงินผ่าน D.8", "FAIL", `สร้างฉากไม่ได้: ${errMsg(e)}`, "CRITICAL");
  }
  const { DA, DA2, DV, DO, DQ, HA, DB, BOOK_A, BOOK_V, B1 } = ids;
  const cOwn = () => ({ tenantId: A, actorUserId: ids.OWN });
  const cCT = () => ({ tenantId: A, actorUserId: ids.CT });
  const cOB = () => ({ tenantId: B, actorUserId: ids.OWNB });
  const bl = (k: string): Any => bills[k] ?? {};
  const daLeases = ["L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8"];

  // ═══════════════ ความจริงอิสระ (oracle) ═══════════════
  /** ผู้ติดต่อบัญชีของผู้เช่าในสมุด */
  const contactOf = async (systemId: string, partyId: string): Promise<string | null> => (await prisma.accountContact.findFirst({ where: { systemId, partyId }, select: { id: true } }))?.id ?? null;
  /** GL 1100 (ลูกหนี้) ของชุดเอกสาร = Σ เดบิต − เครดิต ของบรรทัด 1100 ในใบสำคัญที่อ้างเอกสาร (refType AccountDocument) + ใบสำคัญของรายการรับชำระของเอกสาร + ใบกลับรายการของทั้งสอง
   *  (ไม่ใช้ contactId ของบรรทัด — บรรทัด AR ตอนออกเอกสารของบัญชี V2 ไม่มี contactId · PC-5) */
  const glArOfDocs = async (tenantId: string, systemId: string, docIds: string[]): Promise<number> => {
    if (!docIds.length) return 0;
    const pays: Any[] = await prisma.accountDocumentPayment.findMany({ where: { tenantId, documentId: { in: docIds } }, select: { entryId: true } });
    const base: Any[] = await prisma.accountJournalEntry.findMany({ where: { tenantId, systemId, OR: [{ refType: "AccountDocument", refId: { in: docIds } }, { id: { in: pays.map((p) => p.entryId).filter(Boolean) } }] }, select: { id: true } });
    const rev: Any[] = base.length ? await prisma.accountJournalEntry.findMany({ where: { tenantId, reversalOfId: { in: base.map((e) => e.id) } }, select: { id: true } }) : [];
    const ls: Any[] = await prisma.accountJournalLine.findMany({ where: { tenantId, entryId: { in: [...base, ...rev].map((e) => e.id) }, account: { code: "1100" } }, select: { debit: true, credit: true } });
    return ls.reduce((a, l) => a + l.debit - l.credit, 0);
  };
  /** เอกสารบัญชีทั้งครอบครัวของบิลของสัญญา (ใบแจ้งหนี้ + เอกสารที่อ้างใบแจ้งหนี้) */
  const docsOfLeases = async (keys: string[]): Promise<string[]> => {
    const bs: Any[] = await prisma.dormBill.findMany({ where: { leaseId: { in: keys.map((k) => LS[k].leaseId) }, accountDocumentId: { not: null } }, select: { accountDocumentId: true } });
    const inv = bs.map((b) => b.accountDocumentId as string);
    const kids: Any[] = inv.length ? await prisma.accountDocument.findMany({ where: { sourceDocId: { in: inv } }, select: { id: true } }) : [];
    return [...new Set([...inv, ...kids.map((k) => k.id)])];
  };
  const glArOfLeases = async (tenantId: string, systemId: string, keys: string[]) => glArOfDocs(tenantId, systemId, await docsOfLeases(keys));
  /** ค้างต่อบิลจากตารางบัญชีดิบ (อิสระจาก billBalances): ใบแจ้งหนี้ (grand − รับ − ใบลดหนี้ที่มีผล) + ใบเพิ่มหนี้ที่มีผล (grand − รับ) · ไม่มีเอกสาร = total − paid */
  const ownOf = async (b: Any): Promise<number> => {
    if (!b?.accountDocumentId) return Math.max(0, (b?.totalSatang ?? 0) - (b?.paidSatang ?? 0));
    const docs: Any[] = await prisma.accountDocument.findMany({ where: { tenantId: b.tenantId, OR: [{ id: b.accountDocumentId }, { sourceDocId: b.accountDocumentId, docType: { in: ["DEBIT_NOTE", "CREDIT_NOTE"] } }] }, select: { id: true, docType: true, status: true, grandTotal: true } });
    const pays: Any[] = await prisma.accountDocumentPayment.findMany({ where: { tenantId: b.tenantId, documentId: { in: docs.map((d) => d.id) }, voidedAt: null }, select: { documentId: true, amount: true, whtAmountSatang: true } });
    const paidOn = (id: string) => pays.filter((p) => p.documentId === id).reduce((a, p) => a + p.amount + (p.whtAmountSatang ?? 0), 0);
    const live = docs.filter((d) => !DEAD.includes(d.status));
    const cn = live.filter((d) => d.docType === "CREDIT_NOTE").reduce((a, d) => a + d.grandTotal, 0);
    let own = 0;
    const inv = live.find((d) => d.id === b.accountDocumentId);
    if (inv) own += Math.max(0, inv.grandTotal - paidOn(inv.id) - cn);
    for (const d of live.filter((x) => x.docType === "DEBIT_NOTE")) own += Math.max(0, d.grandTotal - paidOn(d.id));
    return own;
  };
  type ExpRow = { leaseId: string; roomNumber: string; buckets: Buckets; bills: { billId: string; periodKey: string; daysLate: number; bucket: Bucket; outstandingSatang: number }[] };
  /** ความจริงอายุหนี้ต่อสัญญา (บิลที่เห็น SENT/PARTIALLY_PAID/PAID ของห้องที่ระบุ) */
  const expAging = async (unitId: string, now: string, roomIds?: Set<string>): Promise<{ buckets: Buckets; rows: ExpRow[] }> => {
    const today = thaiYmd(now);
    const bs: Any[] = await prisma.dormBill.findMany({ where: { unitId, status: { in: SENTISH } }, orderBy: [{ periodKey: "asc" }] });
    const rooms: Any[] = await prisma.hotelRoom.findMany({ where: { unitId }, select: { id: true, number: true } });
    const num = new Map(rooms.map((r) => [r.id, r.number]));
    const per = new Map<string, ExpRow>();
    const tot = emptyB();
    for (const b of bs) {
      if (roomIds && !roomIds.has(b.roomId)) continue;
      const own = await ownOf(b);
      if (own <= 0) continue;
      const due = ymdOfDb(b.dueDate);
      const daysLate = due ? dayNo(today) - dayNo(due) : 0;
      const k = bucketOf(due ? daysLate : 0);
      const row: ExpRow = per.get(b.leaseId) ?? { leaseId: b.leaseId, roomNumber: num.get(b.roomId) ?? "", buckets: emptyB(), bills: [] };
      addB(row.buckets, k, own); addB(tot, k, own);
      row.bills.push({ billId: b.id, periodKey: b.periodKey, daysLate, bucket: k, outstandingSatang: own });
      per.set(b.leaseId, row);
    }
    const rows = [...per.values()].sort((x, y) => x.roomNumber.localeCompare(y.roomNumber, "th", { numeric: true }));
    return { buckets: tot, rows };
  };
  const gotRows = (r: Any) => (r?.rows ?? []).map((x: Any) => ({ leaseId: x.leaseId, roomNumber: x.roomNumber, buckets: x.buckets, bills: (x.bills ?? []).map((b: Any) => ({ billId: b.billId, periodKey: b.periodKey, daysLate: b.daysLate, bucket: b.bucket, outstandingSatang: b.outstandingSatang })) }));
  /** ความจริงรายได้ต่องวด */
  const expRevenue = async (unitId: string, from: string, to: string, roomIds?: Set<string>) => {
    const bs: Any[] = await prisma.dormBill.findMany({ where: { unitId, status: { in: SENTISH }, periodKey: { gte: from, lte: to } } });
    const months = new Map<string, Any>();
    for (const p of monthsOf(from, to)) months.set(p, { periodKey: p, bills: 0, noDocBills: 0, types: Object.fromEntries(REV_TYPES.map((t) => [t, z3()])), total: z3(), collectedSatang: 0, posted: z3() });
    for (const b of bs) {
      if (roomIds && !roomIds.has(b.roomId)) continue;
      const m = months.get(b.periodKey);
      if (!m) continue;
      let inv: Any = null;
      if (b.accountDocumentId) { inv = await prisma.accountDocument.findFirst({ where: { id: b.accountDocumentId }, select: { status: true, subTotal: true, vatAmount: true, grandTotal: true } }); if (!inv || DEAD.includes(inv.status)) continue; }
      m.bills += 1;
      if (!b.accountDocumentId) m.noDocBills += 1;
      for (const l of (b.lines as Any[]) ?? []) { const t = typeOfCode(String(l.code)); const v = { netSatang: l.netSatang, vatSatang: l.vatSatang, grossSatang: l.grossSatang }; add3(m.types[t], v); add3(m.total, v); }
      if (inv) add3(m.posted, { netSatang: inv.subTotal, vatSatang: inv.vatAmount, grossSatang: inv.grandTotal });
      if (b.accountDocumentId) {
        const adj: Any[] = await prisma.accountDocument.findMany({ where: { tenantId: b.tenantId, refType: "DormBillAdjust", refId: { startsWith: `${b.id}:` }, status: { notIn: DEAD } }, select: { id: true, docType: true, subTotal: true, vatAmount: true, grandTotal: true } });
        for (const d of adj) { const v = { netSatang: d.subTotal, vatSatang: d.vatAmount, grossSatang: d.grandTotal }; const s = d.docType === "CREDIT_NOTE" ? -1 : 1; add3(m.types.ADJUST, v, s); add3(m.total, v, s); add3(m.posted, v, s); }
        const fam: Any[] = await prisma.accountDocument.findMany({ where: { tenantId: b.tenantId, OR: [{ id: b.accountDocumentId }, { sourceDocId: b.accountDocumentId, docType: "DEBIT_NOTE" }] }, select: { id: true } });
        const p = await prisma.accountDocumentPayment.findMany({ where: { tenantId: b.tenantId, documentId: { in: fam.map((x) => x.id) }, voidedAt: null }, select: { amount: true, whtAmountSatang: true } });
        m.collectedSatang += p.reduce((a: number, x: Any) => a + x.amount + (x.whtAmountSatang ?? 0), 0);
      } else m.collectedSatang += b.paidSatang;
    }
    return [...months.values()];
  };
  const gotRev = (r: Any) => (r?.months ?? []).map((m: Any) => ({ periodKey: m.periodKey, bills: m.bills, noDocBills: m.noDocBills, types: Object.fromEntries(REV_TYPES.map((t) => [t, m.types?.[t]])), total: m.total, collectedSatang: m.collectedSatang }));
  const expRevPlain = (ms: Any[]) => ms.map((m) => ({ periodKey: m.periodKey, bills: m.bills, noDocBills: m.noDocBills, types: m.types, total: m.total, collectedSatang: m.collectedSatang }));

  // ═══════════════ PC ตัวควบคุม ═══════════════
  console.log("\n── PC ตัวควบคุม ──");
  await st("PC-2", "ข้อเท็จจริงฉาก (ตารางบัญชีดิบ): L3 มิ.ย. ค้าง 3,800.00 · L4 ก.ค. ใบลดหนี้ 300.00 ⇒ 4,500.00 · L5 ส.ค. จ่ายครบแล้วใบเพิ่มหนี้ 250.00 (ISSUED) · L6 ก.ค. ใบแจ้งหนี้ VOIDED ⇒ 0 · L7 มิ.ย. ค้าง 2,800 + carried · L8 มิ.ย. 0 (เกิน ⇒ 2110)", async () => {
    needReady();
    eq([await ownOf(bl(`L3:${P1}`)), await ownOf(bl(`L4:${P2}`)), await ownOf(bl(`L5:${P3}`)), await ownOf(bl(`L6:${P2}`)), await ownOf(bl(`L7:${P1}`)), await ownOf(bl(`L8:${P1}`))], [380_000, 450_000, 25_000, 0, 280_000, 0], "ค้างต่อบิล");
    const dn = await prisma.accountDocument.findFirst({ where: { tenantId: A, sourceDocId: bl(`L5:${P3}`).accountDocumentId, docType: "DEBIT_NOTE" }, select: { status: true } });
    eq([dn?.status, bl(`L5:${P3}`).status, (await prisma.accountDocument.findFirst({ where: { id: bl(`L6:${P2}`).accountDocumentId }, select: { status: true } }))?.status, bl(`L7:${P1}`).carriedSatang], ["ISSUED", "PAID", "VOIDED", 280_000], "สถานะ");
  });
  await st("PC-3", "ความจริงฝั่งบัญชี: GL 1100 ของเอกสารบิลของสัญญา (ใบสำคัญอ้างเอกสาร + รับชำระ + กลับรายการ) = Σ billBalances.ownOutstanding ต่อสัญญา (DA 8 · DA2 · DV 3 · ร้าน B) · GL ทุกใบสำคัญสมดุล", async () => {
    needReady();
    const bad: string[] = [];
    const groups: [string, string, string, string[]][] = [[A, BOOK_A, "DA", daLeases], [A, BOOK_A, "DA2", ["L9"]], [A, BOOK_V, "DV", ["V1", "V2", "V3"]], [B, ids.BOOK_B, "DB", ["LB1"]]];
    for (const [t, bk, , keys] of groups) for (const k of keys) {
      const bs: Any[] = await prisma.dormBill.findMany({ where: { leaseId: LS[k].leaseId }, select: { id: true } });
      const bal = await DORM.billBalances(t, bs.map((b) => b.id));
      const own = [...bal.values()].reduce((a: number, x: Any) => a + x.ownOutstandingSatang, 0);
      const g = await glArOfLeases(t, bk, [k]);
      if (own !== g) bad.push(`${k}: billBalances ${own} GL ${g}`);
    }
    const unb: { n: bigint }[] = await prisma.$queryRawUnsafe(`SELECT count(*)::bigint AS n FROM (SELECT "entryId" FROM "AccountJournalLine" WHERE "tenantId" = ANY($1::text[]) GROUP BY "entryId" HAVING sum(debit) <> sum(credit)) x`, tenantIds);
    if (Number(unb[0]?.n ?? 0)) bad.push(`ใบสำคัญไม่สมดุล ${unb[0]?.n}`);
    ok(!bad.length, bad.join(" · "));
  });
  await st("PC-4", "ยอดต่อบิลจากตารางดิบ (oracle) = billBalances.ownOutstanding ทุกบิลของฉาก (ใช้เป็นความจริงต่อถัง)", async () => {
    needReady();
    const all = Object.values(bills).filter(Boolean);
    const byT = new Map<string, Any[]>();
    for (const b of all) byT.set(b.tenantId, [...(byT.get(b.tenantId) ?? []), b]);
    const bad: string[] = [];
    for (const [t, bs] of byT) {
      const bal = await DORM.billBalances(t, bs.map((b: Any) => b.id));
      for (const b of bs) { const a = await ownOf(b), x = bal.get(b.id)?.ownOutstandingSatang; if (a !== x) bad.push(`${b.periodKey}/${b.id.slice(-5)} oracle ${a} billBalances ${x}`); }
    }
    ok(!bad.length, bad.slice(0, 6).join(" · "));
  });
  await st("PC-5", "ข้อเท็จจริงบัญชี V2 ณ tip (เหตุผล §10 R1): outstandingByContacts = GL เมื่อไม่มีใบลด/เพิ่มหนี้ (L1 L2 L3 L8) แต่ ≠ GL เมื่อมีใบลดหนี้ (L4) และใบเพิ่มหนี้ ISSUED (L5) · agingReport(contactId) = GL ที่ L4 · ≠ GL ที่ L5 · บรรทัด AR ตอนออกใบแจ้งหนี้ไม่มี contactId", async () => {
    needReady();
    const obc = async (k: string) => { const c = await contactOf(BOOK_A, LS[k].partyId); return (await ACC.outstandingByContacts(A, BOOK_A, [c])).get(c) ?? 0; };
    const ag = async (k: string) => { const c = await contactOf(BOOK_A, LS[k].partyId); return (await AREP.agingReport({ tenantId: A, systemId: BOOK_A }, { direction: "OUT", contactId: c, asOf: new Date(NOW_A) })).grand.totalSatang; };
    const g = async (k: string) => glArOfLeases(A, BOOK_A, [k]);
    for (const k of ["L1", "L2", "L3", "L8"]) eq(await obc(k), await g(k), `outstandingByContacts = GL ${k}`);
    ok((await obc("L4")) !== (await g("L4")), `L4 (ใบลดหนี้): outstandingByContacts ${await obc("L4")} = GL ${await g("L4")} — บัญชีแก้แล้ว? ผู้คุมทบทวน R1`);
    ok((await obc("L5")) !== (await g("L5")), `L5 (ใบเพิ่มหนี้ ISSUED): outstandingByContacts ${await obc("L5")} = GL ${await g("L5")}`);
    eq(await ag("L4"), await g("L4"), "agingReport = GL L4");
    ok((await ag("L5")) !== (await g("L5")), `L5: agingReport ${await ag("L5")} = GL ${await g("L5")}`);
    // บรรทัด AR ตอนออกใบแจ้งหนี้ไม่มี contactId ⇒ บัญชีย่อยลูกหนี้ "ต่อผู้ติดต่อ" ของ GL ใช้เทียบไม่ได้ (เหตุที่ oracle เทียบต่อเอกสาร)
    const inv = bl(`L1:${P0}`).accountDocumentId;
    const ent = await prisma.accountJournalEntry.findFirst({ where: { tenantId: A, refType: "AccountDocument", refId: inv }, select: { id: true } });
    const arl: Any[] = ent ? await prisma.accountJournalLine.findMany({ where: { entryId: ent.id, account: { code: "1100" } }, select: { contactId: true } }) : [];
    ok(arl.length > 0 && arl.every((l) => l.contactId === null), `บรรทัด AR ของใบแจ้งหนี้ ${J(arl)} — บัญชีแก้แล้ว? ผู้คุมทบทวน R1`);
  }, "MAJOR");
  await st("PC-6", "บรรทัดบิล (DormBill.lines net/vat/gross) = ยอดใบแจ้งหนี้ (subTotal/vatAmount/grandTotal) ทุกบิลที่ใบยังมีผล · DV มี VAT > 0 และ RENT ยกเว้น (vat 0) · net + vat = gross ทุกบรรทัด", async () => {
    needReady();
    const bad: string[] = [];
    let vat = 0;
    for (const b of Object.values(bills).filter(Boolean) as Any[]) {
      const inv = await prisma.accountDocument.findFirst({ where: { id: b.accountDocumentId }, select: { status: true, subTotal: true, vatAmount: true, grandTotal: true } });
      if (!inv || DEAD.includes(inv.status)) continue;
      const s = z3();
      for (const l of b.lines as Any[]) { add3(s, { netSatang: l.netSatang, vatSatang: l.vatSatang, grossSatang: l.grossSatang }); if (l.netSatang + l.vatSatang !== l.grossSatang) bad.push(`${b.id.slice(-5)} ${l.code} net+vat≠gross`); if (l.code === "RENT" && l.vatSatang !== 0) bad.push("RENT มี VAT"); }
      vat += s.vatSatang;
      if (!isDeepStrictEqual([s.netSatang, s.vatSatang, s.grossSatang], [inv.subTotal, inv.vatAmount, inv.grandTotal])) bad.push(`${b.periodKey}/${b.id.slice(-5)} lines ${J(s)} inv ${J([inv.subTotal, inv.vatAmount, inv.grandTotal])}`);
    }
    const v1 = bl(`V1:${P_RUN}`);
    const codes = ((v1.lines as Any[]) ?? []).map((l) => l.code);
    if (!(codes.includes("ELEC") && codes.includes("WATER") && codes.includes("LATE_FEE") && codes.some((c: string) => !["RENT", "COMMON", "ELEC", "WATER", "LATE_FEE"].includes(c)))) bad.push(`V1 codes ${J(codes)}`);
    ok(!bad.length && vat > 0, bad.slice(0, 5).join(" · ") || "ไม่มี VAT ในฉาก");
  });
  await st("PC-7", "ขอบเขตอาคาร (D.13): ตั้ง managerScope BUILDING + assignments ⇒ dormVisibleRoomsFor CT = ห้องอาคาร 1 ของ DA (6) · CT2 = ว่าง · owner = null", async () => {
    needReady();
    await setVal(A, "rooms.access.managerScope", "UNIT", DA, "BUILDING");
    await setVal(A, "rooms.access.buildingAssignments", "UNIT", DA, { [ids.mb_ct]: [B1] });
    const ct = await DORM.dormVisibleRoomsFor({ tenantId: A }, { unitId: DA, userId: ids.CT });
    const ct2 = await DORM.dormVisibleRoomsFor({ tenantId: A }, { unitId: DA, userId: ids.CT2 });
    const own = await DORM.dormVisibleRoomsFor({ tenantId: A }, { unitId: DA, userId: ids.OWN });
    eq([[...(ct ?? [])].sort(), ct2 instanceof Set ? ct2.size : -1, own], [["L1", "L2", "L3", "L4", "L5", "L6"].map((k) => LS[k].roomId).sort(), 0, null], "ขอบเขต");
  });
  await st("PC-8", "csvRow (core) กันสูตรชื่อในฉาก: =HYPERLINK · +66 · @SUM · -2+3 ⇒ ขึ้นต้น ' · ตัวเลขล้วน/ติดลบล้วนไม่แตะ", () => {
    const line = CSV.csvRow([LS.L1?.first ?? "=HYPERLINK(\"x\")", "+66ส่วนลด", "@SUM(A1)", "-2+3", "4800.00", "-50.00"]);
    const cells = parseCsv(line)[0];
    eq([cells.slice(0, 4).every((c: string) => c.startsWith("'")), cells[4], cells[5]], [true, "4800.00", "-50.00"], "csvRow");
  }, "MAJOR");

  // ═══════════════ A ลูกหนี้ตามอายุ ═══════════════
  console.log("\n── A ลูกหนี้ตามอายุ ──");
  await st("A-1", "เจ้าของ DA ณ 26 ส.ค. ไทย: ถังรวม = oracle ทุกสตางค์ (5 ถัง) · total = GL 1100 ของผู้เช่า DA ทุกสตางค์ · asOf = 2026-12-26 · noDocSatang 0", async () => {
    needReady();
    const r = okRes(keep(await D.aging()(cOwn(), { unitId: DA }, { now: new Date(NOW_A) })), "dormAgingReport");
    const e = await expAging(DA, NOW_A);
    eq(r.buckets, e.buckets, "ถัง");
    eq([r.buckets.totalSatang, r.asOf, r.noDocSatang], [await glArOfLeases(A, BOOK_A, daLeases), "2026-08-26", 0], "GL/asOf/noDoc");
  });
  await st("A-2", "แถวต่อสัญญา = oracle (เลขห้อง · ถัง · บิลเรียงงวด · daysLate · ถัง · ยอด) · แถวเฉพาะสัญญาที่ค้าง > 0 · เรียงเลขห้อง · ชื่อแรกเท่านั้น", async () => {
    needReady();
    const r = okRes(await D.aging()(cOwn(), { unitId: DA }, { now: new Date(NOW_A) }), "aging");
    const e = await expAging(DA, NOW_A);
    eq(gotRows(r), e.rows, "แถว");
    const firsts = (r.rows as Any[]).map((x) => [x.roomNumber, x.tenantFirstName]);
    eq(firsts, e.rows.map((x) => { const k = Object.keys(LS).find((q) => LS[q].leaseId === x.leaseId)!; return [x.roomNumber, LS[k].first]; }), "ชื่อแรก");
  });
  await st("A-3", "กรณีเงิน: L2 พ.ค. 4,800 ในถัง >90 · L3 มิ.ย. บางส่วน 3,800 ใน 61–90 · L4 ก.ค. หักใบลดหนี้ 4,500 (ไม่ใช่ 4,800) ใน 31–60 · L5 ส.ค. ใบเพิ่มหนี้หลังจ่ายครบ 250 ใน 1–30 · L6 ก.ค. ยกเลิก = ไม่มี · L7 ยกยอดนับครั้งเดียวที่บิลต้นทาง · L8 จ่ายเกินไม่ติดลบ · ก.ย. ทุกห้อง notDue", async () => {
    needReady();
    const r = okRes(await D.aging()(cOwn(), { unitId: DA }, { now: new Date(NOW_A) }), "aging");
    const of = (k: string) => (r.rows as Any[]).find((x) => x.leaseId === LS[k].leaseId);
    const bOf = (k: string, p: string) => of(k)?.bills?.find((b: Any) => b.periodKey === p);
    eq([bOf("L2", P0)?.bucket, bOf("L2", P0)?.outstandingSatang], ["d90plus", BASE], "L2");
    eq([bOf("L3", P1)?.bucket, bOf("L3", P1)?.outstandingSatang], ["d61_90", 380_000], "L3");
    eq([bOf("L4", P2)?.bucket, bOf("L4", P2)?.outstandingSatang], ["d31_60", 450_000], "L4");
    eq([bOf("L5", P3)?.bucket, bOf("L5", P3)?.outstandingSatang], ["d1_30", 25_000], "L5");
    eq(bOf("L6", P2), undefined, "L6 ก.ค.");
    eq([bOf("L7", P1)?.outstandingSatang, bOf("L7", P2)], [280_000, undefined], "L7");
    ok((r.rows as Any[]).every((x) => x.bills.every((b: Any) => b.outstandingSatang > 0)), "มีบิลยอด ≤ 0");
    ok(daLeases.every((k) => bOf(k, P4)?.bucket === "notDue" && bOf(k, P4)?.outstandingSatang === BASE), "ก.ย. notDue");
  });
  await st("A-4", "ขอบวันไทย (L3 มิ.ย. ครบ 5 มิ.ย.): 5 มิ.ย. ⇒ notDue · 5 ก.ค. 23:59 ไทย ⇒ 30 วัน d1_30 · 6 ก.ค. 00:00 ไทย (UTC 5 ก.ค. 17:00) ⇒ 31 วัน d31_60 · 4 ส.ค. ⇒ 60 · 5 ส.ค. ⇒ 61 d61_90 · 3 ก.ย. ⇒ 90 · 4 ก.ย. ⇒ 91 d90plus", async () => {
    needReady();
    const due = ymdOfDb(bl(`L3:${P1}`).dueDate);
    eq(due, "2026-06-05", "ครบกำหนดฉาก (rooms.billing.dueDay ค่าเริ่ม 5)");
    const at = async (iso: string) => { const r = okRes(await D.aging()(cOwn(), { unitId: DA }, { now: new Date(iso) }), iso); const b = (r.rows as Any[]).find((x) => x.leaseId === LS.L3.leaseId)?.bills?.find((x: Any) => x.periodKey === P1); return [b?.daysLate, b?.bucket]; };
    eq(await at("2026-06-05T05:00:00.000Z"), [0, "notDue"], "วันครบ");
    eq(await at("2026-07-05T16:59:00.000Z"), [30, "d1_30"], "30 วัน");
    eq(await at("2026-07-05T17:00:00.000Z"), [31, "d31_60"], "31 วัน (เที่ยงคืนไทย)");
    eq(await at("2026-08-04T05:00:00.000Z"), [60, "d31_60"], "60");
    eq(await at("2026-08-05T05:00:00.000Z"), [61, "d61_90"], "61");
    eq(await at("2026-09-03T05:00:00.000Z"), [90, "d61_90"], "90");
    eq(await at("2026-09-04T05:00:00.000Z"), [91, "d90plus"], "91");
  });
  await st("A-5", "สมุดร่วม 2 หน่วย: DA ไม่มีสัญญา L9 (DA2) · DA2 = L9 เท่านั้น · DA + DA2 = GL 1100 ของผู้เช่าทั้งสมุด A ทุกสตางค์", async () => {
    needReady();
    const a = okRes(await D.aging()(cOwn(), { unitId: DA }, { now: new Date(NOW_A) }), "DA"), b = okRes(await D.aging()(cOwn(), { unitId: DA2 }, { now: new Date(NOW_A) }), "DA2");
    ok(!(a.rows as Any[]).some((x) => x.leaseId === LS.L9.leaseId), "DA มี L9");
    eq((b.rows as Any[]).map((x) => x.leaseId), [LS.L9.leaseId], "DA2");
    eq(a.buckets.totalSatang + b.buckets.totalSatang, await glArOfLeases(A, BOOK_A, [...daLeases, "L9"]), "รวม = GL");
  });
  await st("A-6", "หอจด VAT (DV): ใบลดหนี้มี VAT + ใบเพิ่มหนี้ + ใบที่จ่ายครบ ⇒ total = GL 1100 ของผู้เช่า DV ทุกสตางค์ · ถัง = oracle", async () => {
    needReady();
    const r = okRes(await D.aging()(cOwn(), { unitId: DV }, { now: new Date(NOW_A) }), "DV");
    eq(r.buckets, (await expAging(DV, NOW_A)).buckets, "ถัง");
    eq(r.buckets.totalSatang, await glArOfLeases(A, BOOK_V, ["V1", "V2", "V3"]), "GL");
  });
  await st("A-7", "อ่านสด (ไม่แคช): รับชำระ L2 ก.ย. 2,000.00 ตอนนี้ ⇒ รายงานลด 200,000 ทันที และยังเท่ากับ GL", async () => {
    needReady();
    const before = okRes(await D.aging()(cOwn(), { unitId: DA }, { now: new Date(NOW_A) }), "ก่อน").buckets.totalSatang;
    await pay(A, DA, bl(`L2:${P0}`).accountDocumentId, 200_000, "2026-08-20");
    const after = okRes(await D.aging()(cOwn(), { unitId: DA }, { now: new Date(NOW_A) }), "หลัง").buckets;
    eq([before - after.totalSatang, after.totalSatang], [200_000, await glArOfLeases(A, BOOK_A, daLeases)], "ยอด");
    eq(after, (await expAging(DA, NOW_A)).buckets, "ถัง");
  });
  await st("A-8", "PII: ผลรายงานลูกหนี้ไม่มีเบอร์/นามสกุล/อีเมลของผู้เช่า", async () => {
    needReady();
    const s = J(await D.aging()(cOwn(), { unitId: DA }, { now: new Date(NOW_A) }));
    ok(!PHONE_RE.test(s) && !PHONES.some((p) => s.includes(p)) && !SURNAMES.some((n) => s.includes(n)), "พบเบอร์/นามสกุล");
  }, "MAJOR");

  // ═══════════════ ฉากเข้าพัก (DO · ไม่มีสมุด) ═══════════════
  const OCC: Record<string, string> = {};
  let occReady = false;
  try {
    const tyO = await mkType(A, DO), OB1 = await mkBld(A, DO, "อาคาร โอหนึ่ง", 1), OB2 = await mkBld(A, DO, "อาคาร โอสอง", 2);
    Object.assign(ids, { OB1, OB2 });
    for (const n of ["O1", "O2", "O3", "O4", "O5", "O6"]) OCC[n] = await mkRoom(A, DO, tyO, OB1, n);
    OCC.O7 = await mkRoom(A, DO, tyO, OB2, "O7");
    OCC.O8 = await mkRoom(A, DO, tyO, OB1, "O8", false);
    const lz = async (room: string, status: string, start: string, extra: Record<string, unknown> = {}) => {
      const p = await prisma.party.create({ data: { tenantId: A, name: `เข้าพัก ${room}${status} ทดสอบดีสิบเก้า`, phone: newPhone() } });
      return (await prisma.dormLease.create({ data: { tenantId: A, unitId: DO, roomId: OCC[room], partyId: p.id, status, startDate: dbDate(start), endDate: dbDate("2027-12-31"), rentSatang: RENT, createdById: "qc-d19", ...extra } })).id as string;
    };
    await lz("O1", "ACTIVE", "2026-01-01");
    await lz("O2", "ACTIVE", "2026-10-31");
    await lz("O3", "ENDED", "2026-06-01", { endedAt: new Date("2026-10-31T17:30:00.000Z"), endReason: "MOVE_OUT" });           // วันไทยของ endedAt = 1 พ.ย.
    const o4a = await lz("O4", "ENDED", "2026-03-01", { endedAt: new Date("2026-10-16T03:00:00.000Z"), endReason: "MOVE_OUT" });
    await prisma.dormMoveOut.create({ data: { tenantId: A, unitId: DO, leaseId: o4a, status: "SETTLED", moveOutDate: dbDate("2026-10-15") } }); // moveOutDate ชนะ endedAt
    await lz("O4", "ACTIVE", "2026-10-15");                                                                                        // ส่งต่อวันเดียวกัน
    await lz("O5", "CANCELLED", "2026-09-10");
    await lz("O5", "DRAFT", "2026-11-05");
    await lz("O7", "NOTICE", "2026-09-20");
    await lz("O8", "ACTIVE", "2026-01-01");                                                                                        // ห้องปิด (active false) — ไม่นับทั้งตัวตั้ง/ตัวหาร
    occReady = true;
  } catch (e) { record("PC-9", "ฉากเข้าพัก DO", "FAIL", `สร้างไม่ได้: ${errMsg(e)}`, "CRITICAL"); }
  /** ความจริงเข้าพัก (อิสระ): union วันต่อห้อง · ห้อง active ในขอบเขต · เดือนปัจจุบันถึงวันนี้ไทย */
  const expOcc = async (unitId: string, from: string, to: string, now: string, roomIds?: Set<string>) => {
    const today = thaiYmd(now), cur = today.slice(0, 7);
    const rooms: Any[] = (await prisma.hotelRoom.findMany({ where: { unitId, active: true }, select: { id: true } })).filter((r: Any) => !roomIds || roomIds.has(r.id));
    const leases: Any[] = await prisma.dormLease.findMany({ where: { unitId, status: { in: ["ACTIVE", "NOTICE", "ENDED"] } }, select: { id: true, roomId: true, status: true, startDate: true, endedAt: true, moveOut: { select: { moveOutDate: true, status: true } } } });
    const out = monthsOf(from, to).map((m) => {
      const days = m < cur ? dim(m) : m === cur ? Number(today.slice(8, 10)) : 0;
      const d0 = dayNo(`${m}-01`), d1 = d0 + days - 1;
      let occ = 0;
      for (const r of rooms) {
        const set = new Set<number>();
        for (const l of leases.filter((x) => x.roomId === r.id)) {
          const s = dayNo(ymdOfDb(l.startDate)!);
          const e = l.status === "ENDED" ? dayNo(l.moveOut && l.moveOut.status !== "CANCELLED" ? ymdOfDb(l.moveOut.moveOutDate)! : thaiYmd(l.endedAt)) : Infinity;
          for (let d = Math.max(s, d0); d <= Math.min(e, d1); d++) set.add(d);
        }
        occ += set.size;
      }
      return { month: m, rooms: rooms.length, days, roomDays: rooms.length * days, occupiedRoomDays: occ, rateBp: bp(occ, rooms.length * days) };
    });
    const so = out.reduce((a, x) => a + x.occupiedRoomDays, 0), sd = out.reduce((a, x) => a + x.roomDays, 0);
    return { months: out, averageBp: bp(so, sd) };
  };
  const gotOcc = (r: Any) => ({ months: (r?.months ?? []).map((m: Any) => ({ month: m.month, rooms: m.rooms, days: m.days, roomDays: m.roomDays, occupiedRoomDays: m.occupiedRoomDays, rateBp: m.rateBp })), averageBp: r?.averageBp });

  // ═══════════════ O อัตราเข้าพัก ═══════════════
  console.log("\n── O อัตราเข้าพัก ──");
  await st("PC-9", "ฉากเข้าพัก (oracle อิสระ): ก.ย. 101/210 · ต.ค. 125/217 · พ.ย. (10 วัน) 41/70 — ห้อง active 7 ห้อง", async () => {
    ok(occReady, "ฉากไม่พร้อม");
    const e = await expOcc(DO, "2026-09", "2026-11", NOW_O);
    eq(e.months.map((m) => [m.month, m.occupiedRoomDays, m.roomDays]), [["2026-09", 101, 210], ["2026-10", 125, 217], ["2026-11", 41, 70]], "oracle");
  });
  await st("O-1", "DO ก.ย.–พ.ย. ณ 10 พ.ย. ไทย: ทุกเดือน rooms/days/roomDays/occupiedRoomDays/rateBp = oracle · averageBp ถ่วงวัน (Σocc/ΣroomDays)", async () => {
    ok(occReady, "ฉากไม่พร้อม");
    const r = okRes(keep(await D.occ()(cOwn(), { unitId: DO, fromMonth: "2026-09", toMonth: "2026-11" }, { now: new Date(NOW_O) })), "occupancy");
    eq(gotOcc(r), await expOcc(DO, "2026-09", "2026-11", NOW_O), "เข้าพัก");
  });
  await st("O-2", "ขอบเดือนไทย: เริ่ม 31 ต.ค. ⇒ ต.ค. 1 วัน · endedAt 31 ต.ค. 17:30Z (= 1 พ.ย. ไทย) ⇒ พ.ย. นับ 1 วัน · moveOutDate 15 ต.ค. ชนะ endedAt · ส่งต่อห้องวันเดียวกันนับ 1 · CANCELLED/DRAFT ไม่นับ · ห้องปิดไม่อยู่ในตัวหาร (ห้องเดียว O8 = ok rooms 0)", async () => {
    ok(occReady, "ฉากไม่พร้อม");
    // ตัวเลขคาดหวัง 125 / 41 คิดมือใน PC-9 (กฎทุกข้อของ §2 ข้อ 6 อยู่ในตัวเลขนี้: ผิดกฎใดกฎหนึ่ง ⇒ ต่างอย่างน้อย 1 ห้อง-วัน)
    const r = okRes(await D.occ()(cOwn(), { unitId: DO, fromMonth: "2026-10", toMonth: "2026-11" }, { now: new Date(NOW_O) }), "occ");
    const [oct, nov] = r.months as Any[];
    eq([oct.rooms, oct.days, oct.occupiedRoomDays, nov.days, nov.occupiedRoomDays], [7, 31, 125, 10, 41], "ต.ค./พ.ย.");
    const e = await expOcc(DO, "2026-10", "2026-11", NOW_O);
    eq([e.months[0].occupiedRoomDays, e.months[1].occupiedRoomDays], [oct.occupiedRoomDays, nov.occupiedRoomDays], "oracle");
  });
  await st("O-3", "เดือนปัจจุบัน/อนาคต: now 1 ธ.ค. 00:30 ไทย (UTC 30 พ.ย.) ⇒ ธ.ค. days 1 · พ.ย. เต็ม 30 วัน · ม.ค. (เดือนถัดไป) days 0 rate 0 · ก.พ. ⇒ INVALID_INPUT", async () => {
    ok(occReady, "ฉากไม่พร้อม");
    const r = okRes(await D.occ()(cOwn(), { unitId: DO, fromMonth: "2026-11", toMonth: "2027-01" }, { now: new Date(NOW_EDGE) }), "edge");
    eq(gotOcc(r), await expOcc(DO, "2026-11", "2027-01", NOW_EDGE), "oracle");
    eq((r.months as Any[]).map((m) => [m.month, m.days]), [["2026-11", 30], ["2026-12", 1], ["2027-01", 0]], "วัน");
    eq((r.months as Any[])[2].rateBp, 0, "อนาคต");
    ok(failIs(await D.occ()(cOwn(), { unitId: DO, fromMonth: "2026-11", toMonth: "2027-02" }, { now: new Date(NOW_EDGE) }), "INVALID_INPUT"), "ก.พ. ต้อง INVALID_INPUT");
  });
  await st("O-4", "ช่วงผิดรูป ⇒ INVALID_INPUT ไทย: from > to · '2026-13' · '2026-9' · ไม่ใช่สตริง · เกิน maxMonths ค่าเริ่ม 24 (26 เดือน)", async () => {
    ok(occReady, "ฉากไม่พร้อม");
    const f = D.occ();
    const bad = [{ fromMonth: "2026-11", toMonth: "2026-10" }, { fromMonth: "2026-13", toMonth: "2026-11" }, { fromMonth: "2026-9", toMonth: "2026-11" }, { fromMonth: 202609, toMonth: "2026-11" }, { fromMonth: "2024-10", toMonth: "2026-11" }];
    const rs = await Promise.all(bad.map((x) => f(cOwn(), { unitId: DO, ...x }, { now: new Date(NOW_O) })));
    ok(rs.every((x) => failIs(x, "INVALID_INPUT")), rs.map(codeOf).join(","));
  }, "MAJOR");
  await st("O-5", "ขอบเขตอาคาร: CT (อาคาร โอหนึ่ง) ⇒ rooms 6 · ตัวเลข = oracle ของห้องอาคาร 1 · CT2 (ไม่มีรายชื่อ) ⇒ ok rooms 0 rate 0", async () => {
    ok(occReady, "ฉากไม่พร้อม");
    await setVal(A, "rooms.access.managerScope", "UNIT", DO, "BUILDING");
    await setVal(A, "rooms.access.buildingAssignments", "UNIT", DO, { [ids.mb_ct]: [ids.OB1] });
    const vis = new Set(["O1", "O2", "O3", "O4", "O5", "O6", "O8"].map((n) => OCC[n]));
    const r = okRes(await D.occ()(cCT(), { unitId: DO, fromMonth: "2026-09", toMonth: "2026-11" }, { now: new Date(NOW_O) }), "CT");
    eq(gotOcc(r), await expOcc(DO, "2026-09", "2026-11", NOW_O, vis), "CT");
    const r2 = okRes(await D.occ()({ tenantId: A, actorUserId: ids.CT2 }, { unitId: DO, fromMonth: "2026-09", toMonth: "2026-11" }, { now: new Date(NOW_O) }), "CT2");
    ok((r2.months as Any[]).every((m) => m.rooms === 0 && m.occupiedRoomDays === 0 && m.rateBp === 0) && r2.averageBp === 0, J(r2).slice(0, 200));
  });

  // ═══════════════ R รายได้แยกประเภท ═══════════════
  console.log("\n── R รายได้แยกประเภท ──");
  await st("R-1", "DV พ.ย. (หอ VAT): ต่อประเภท RENT/COMMON/ELEC/WATER/LATE_FEE/OTHER = ผลรวมบรรทัดบิล (net/vat/gross) · ADJUST = ใบเพิ่มหนี้ − ใบลดหนี้ (ติดลบได้) · ครบ 7 คีย์ · bills 3", async () => {
    needReady();
    const r = okRes(keep(await D.rev()(cOwn(), { unitId: DV, fromMonth: P_RUN, toMonth: P_RUN }, { now: new Date(NOW_O) })), "revenue");
    eq(gotRev(r), expRevPlain(await expRevenue(DV, P_RUN, P_RUN)), "รายได้");
    const t = (r.months as Any[])[0].types;
    ok(t.ELEC.vatSatang > 0 && t.WATER.vatSatang > 0 && t.RENT.vatSatang === 0 && t.LATE_FEE.grossSatang === 10_000 && t.OTHER.grossSatang > 20_000 - 1 && t.ADJUST.grossSatang === 15_000 - 5_000, J(t));
  });
  await st("R-2", "รวมทั้งงวด = เอกสารบัญชีที่มีผล ทุกสตางค์: Σ ใบแจ้งหนี้ (subTotal/vatAmount/grandTotal) + ใบเพิ่มหนี้ − ใบลดหนี้ ของบิลงวดนั้น (DV พ.ย. · DA ทุกงวด) · net + vat = gross ทุกประเภท", async () => {
    needReady();
    const bad: string[] = [];
    for (const [u, from, to] of [[DV, P_RUN, P_RUN], [DA, P0, P4]] as const) {
      const r = okRes(await D.rev()(cOwn(), { unitId: u, fromMonth: from, toMonth: to }, { now: new Date(u === DV ? NOW_O : NOW_A) /* ORACLE-EDIT (ผู้คุม 31 ต.ค. · d19-R2) DV ขอ 2026-11 ต้องใช้ NOW_O ตาม §3.2 (ข้อ O-3 บังคับ ≤ เดือนถัดไป) */ }), "revenue");
      const e = await expRevenue(u, from, to);
      for (const [i, m] of (r.months as Any[]).entries()) {
        if (!isDeepStrictEqual([m.total.netSatang, m.total.vatSatang, m.total.grossSatang], [e[i].posted.netSatang, e[i].posted.vatSatang, e[i].posted.grossSatang])) bad.push(`${m.periodKey} ${J(m.total)} ≠ บัญชี ${J(e[i].posted)}`);
        for (const tp of REV_TYPES) { const x = m.types[tp]; if (!x || x.netSatang + x.vatSatang !== x.grossSatang) bad.push(`${m.periodKey} ${tp} net+vat≠gross`); }
        const s = z3(); for (const tp of REV_TYPES) add3(s, m.types[tp]);
        if (!isDeepStrictEqual(s, { netSatang: m.total.netSatang, vatSatang: m.total.vatSatang, grossSatang: m.total.grossSatang })) bad.push(`${m.periodKey} Σ ประเภท ≠ total`);
      }
    }
    ok(!bad.length, bad.slice(0, 5).join(" · "));
  });
  await st("R-3", "DA พ.ค.–ก.ย. 2569: ทุกงวด = oracle · ก.ค. ไม่นับบิล L6 ที่ใบแจ้งหนี้ถูกยกเลิก (bills 7) · ADJUST ก.ค. −300.00 (ใบลดหนี้ L4) · ส.ค. +250.00 (ใบเพิ่มหนี้ L5) · grand = Σ งวด", async () => {
    needReady();
    const r = okRes(await D.rev()(cOwn(), { unitId: DA, fromMonth: P0, toMonth: P4 }, { now: new Date(NOW_A) }), "revenue");
    eq(gotRev(r), expRevPlain(await expRevenue(DA, P0, P4)), "รายได้");
    const m = (p: string) => (r.months as Any[]).find((x) => x.periodKey === p);
    eq([m(P2)?.bills, m(P2)?.types?.ADJUST?.grossSatang, m(P3)?.types?.ADJUST?.grossSatang, m(P1)?.bills], [7, -30_000, 25_000, 8], "งวด");
    const g = z3(); let col = 0; for (const x of r.months as Any[]) { add3(g, x.total); col += x.collectedSatang; }
    eq([r.grand?.total, r.grand?.collectedSatang], [g, col], "grand");
  });
  await st("R-4", "เก็บแล้ว (collectedSatang) = Σ รับชำระที่ไม่ยกเลิกของใบแจ้งหนี้+ใบเพิ่มหนี้ของบิลงวดนั้น: DA ต.ค. = 5×4,800 + 1,000 + 2,000 + 4,800 (ส่วนเกินอยู่ 2110) · DV พ.ย. = ยอด V1", async () => {
    needReady();
    const r = okRes(await D.rev()(cOwn(), { unitId: DA, fromMonth: P1, toMonth: P1 }, { now: new Date(NOW_A) }), "DA");
    eq((r.months as Any[])[0].collectedSatang, 5 * BASE + 100_000 + 200_000 + BASE, "DA มิ.ย.");
    const v = okRes(await D.rev()(cOwn(), { unitId: DV, fromMonth: P_RUN, toMonth: P_RUN }, { now: new Date(NOW_O) }), "DV");
    eq((v.months as Any[])[0].collectedSatang, bl(`V1:${P_RUN}`).totalSatang, "DV พ.ย.");
  });
  await st("R-5", "ช่วง: งวดไม่มีบิล = ศูนย์ครบ 7 คีย์ (DA เม.ย.) · from > to / รูปผิด ⇒ INVALID_INPUT · maxMonths (ค่าตั้งร้าน = 2) ⇒ 3 เดือน INVALID_INPUT · 2 เดือนผ่าน · คืนค่าตั้งแล้ว 5 เดือนผ่าน", async () => {
    needReady();
    const r = okRes(await D.rev()(cOwn(), { unitId: DA, fromMonth: "2026-04", toMonth: "2026-04" }, { now: new Date(NOW_A) }), "เม.ย.");
    eq(gotRev(r), expRevPlain(await expRevenue(DA, "2026-04", "2026-04")), "เม.ย. ศูนย์");
    ok(failIs(await D.rev()(cOwn(), { unitId: DA, fromMonth: P2, toMonth: P1 }, { now: new Date(NOW_A) }), "INVALID_INPUT"), "from > to");
    ok(failIs(await D.rev()(cOwn(), { unitId: DA, fromMonth: "2026/10", toMonth: P1 }, { now: new Date(NOW_A) }), "INVALID_INPUT"), "รูปผิด");
    await setVal(A, "rooms.report.maxMonths", "TENANT", A, 2);
    try {
      ok(failIs(await D.rev()(cOwn(), { unitId: DA, fromMonth: P0, toMonth: P2 }, { now: new Date(NOW_A) }), "INVALID_INPUT"), "3 เดือนเมื่อเพดาน 2");
      okRes(await D.rev()(cOwn(), { unitId: DA, fromMonth: P1, toMonth: P2 }, { now: new Date(NOW_A) }), "2 เดือน");
    } finally { await unsetTenant(A, "rooms.report.maxMonths"); }
    okRes(await D.rev()(cOwn(), { unitId: DA, fromMonth: P0, toMonth: P4 }, { now: new Date(NOW_A) }), "คืนค่าแล้ว");
  }, "MAJOR");
  await st("R-6", "ขอบเขตอาคาร: CT ⇒ รายได้ DA เฉพาะบิลห้องอาคาร 1 (= oracle ต่อห้อง) · CT2 ⇒ ศูนย์", async () => {
    needReady();
    const vis = new Set(["L1", "L2", "L3", "L4", "L5", "L6"].map((k) => LS[k].roomId));
    const r = okRes(await D.rev()(cCT(), { unitId: DA, fromMonth: P0, toMonth: P4 }, { now: new Date(NOW_A) }), "CT");
    eq(gotRev(r), expRevPlain(await expRevenue(DA, P0, P4, vis)), "CT");
    const r2 = okRes(await D.rev()({ tenantId: A, actorUserId: ids.CT2 }, { unitId: DA, fromMonth: P0, toMonth: P4 }, { now: new Date(NOW_A) }), "CT2");
    ok((r2.months as Any[]).every((m) => m.bills === 0 && m.total.grossSatang === 0), "CT2 ไม่ศูนย์");
  });

  // ═══════════════ M โมเดลจอ ═══════════════
  console.log("\n── M โมเดลจอ ──");
  await st("M-1", "dormReportModel DA ค่าเริ่ม 6M ณ 26 ส.ค.: range 6M · from 2026-03 to 2026-08 · aging/occupancy/revenue = ผลฟังก์ชันย่อยช่วงเดียวกันทุกไบต์ · unitName", async () => {
    needReady();
    const r = okRes(keep(await D.model()(cOwn(), { unitId: DA }, { now: new Date(NOW_A) })), "model");
    eq([r.range, r.fromMonth, r.toMonth, r.asOf, r.unitName], ["6M", "2026-03", "2026-08", "2026-08-26", "หอดีสิบเก้าเอ"], "ช่วง");
    const strip = (x: Any) => { const { ok: _ok, ...rest } = x ?? {}; void _ok; return rest; };
    eq(r.aging, strip(await D.aging()(cOwn(), { unitId: DA }, { now: new Date(NOW_A) })), "aging");
    eq(r.occupancy, strip(await D.occ()(cOwn(), { unitId: DA, fromMonth: "2026-03", toMonth: "2026-08" }, { now: new Date(NOW_A) })), "occupancy");
    eq(r.revenue, strip(await D.rev()(cOwn(), { unitId: DA, fromMonth: "2026-03", toMonth: "2026-08" }, { now: new Date(NOW_A) })), "revenue");
  });
  await st("M-2", "KPI: occupancyAvgBp = occupancy.averageBp · occupancyCurrentBp = เดือน toMonth · collected (งวด ส.ค.) billed = total.gross · collected = collectedSatang · rateBp ปัดครึ่งขึ้น · overdue = Σ ถัง 1–30..>90 · rooms = แถวที่เลยกำหนด > 0", async () => {
    needReady();
    const r = okRes(await D.model()(cOwn(), { unitId: DA }, { now: new Date(NOW_A) }), "model");
    const dec = (r.revenue.months as Any[]).find((m) => m.periodKey === "2026-08");
    const od = (b: Any) => b.d1_30Satang + b.d31_60Satang + b.d61_90Satang + b.d90plusSatang;
    eq(r.kpi, {
      occupancyAvgBp: r.occupancy.averageBp,
      occupancyCurrentBp: (r.occupancy.months as Any[]).at(-1).rateBp,
      collected: { periodKey: "2026-08", billedGrossSatang: dec.total.grossSatang, collectedSatang: dec.collectedSatang, rateBp: bp(dec.collectedSatang, dec.total.grossSatang) },
      overdue: { satang: od(r.aging.buckets), rooms: (r.aging.rows as Any[]).filter((x) => od(x.buckets) > 0).length },
    }, "kpi");
  });
  await st("M-3", "ช่วง MONTH = เดือนนี้ไทย · YEAR = ม.ค. ปีนี้ไทย…เดือนนี้ (now 1 ธ.ค. 00:30 ไทย ⇒ 2026-01…2026-12) · ค่าแปลก ⇒ INVALID_INPUT · maxMonths 2 ⇒ YEAR ตัดเหลือ 2 เดือนท้าย (ไม่ error)", async () => {
    needReady();
    const m = okRes(await D.model()(cOwn(), { unitId: DA, range: "MONTH" }, { now: new Date(NOW_EDGE) }), "MONTH");
    const y = okRes(await D.model()(cOwn(), { unitId: DA, range: "YEAR" }, { now: new Date(NOW_EDGE) }), "YEAR");
    eq([m.fromMonth, m.toMonth, y.fromMonth, y.toMonth], ["2026-12", "2026-12", "2026-01", "2026-12"], "ช่วง");
    ok(failIs(await D.model()(cOwn(), { unitId: DA, range: "ALL" }, { now: new Date(NOW_EDGE) }), "INVALID_INPUT"), "ค่าแปลก");
    await setVal(A, "rooms.report.maxMonths", "TENANT", A, 2);
    try {
      const t = okRes(await D.model()(cOwn(), { unitId: DA, range: "YEAR" }, { now: new Date(NOW_EDGE) }), "YEAR ตัด");
      eq([t.fromMonth, t.toMonth, t.revenue.months.length], ["2026-11", "2026-12", 2], "ตัด");
    } finally { await unsetTenant(A, "rooms.report.maxMonths"); }
  }, "MAJOR");

  // ═══════════════ E ส่งออก CSV ═══════════════
  console.log("\n── E ส่งออก CSV ──");
  const csvOf = async (ctx: Any, i: Any, now = NOW_A) => {
    const r = await D.csv()(ctx, i, { now: new Date(now) });
    okRes(r, `csv ${i.kind}`);
    ok(typeof r.csv === "string" && r.csv.startsWith("﻿"), "ไม่มี BOM");
    ok(typeof r.filename === "string" && /^[A-Za-z0-9._-]+\.csv$/.test(r.filename), `filename ${r.filename}`);
    const rows = parseCsv(r.csv.slice(1));
    ok(rows.length >= 1 && rows[0].every((h) => THAI.test(h)), `หัวตาราง ${J(rows[0])}`);
    eq(r.rows, rows.length - 1, "rows");
    return { r, head: rows[0], body: rows.slice(1) };
  };
  await st("E-1", "AGING CSV (DA): 1 แถวต่อบิลค้าง · Σ คอลัมน์ ค้าง (บาท) = aging total ทุกสตางค์ · จำนวนแถว = Σ บิลในรายงาน · อายุหนี้/วันเลยกำหนดตรงรายงาน", async () => {
    needReady();
    const { body, head } = await csvOf(cOwn(), { unitId: DA, kind: "AGING" });
    const a = okRes(await D.aging()(cOwn(), { unitId: DA }, { now: new Date(NOW_A) }), "aging");
    const n = (a.rows as Any[]).reduce((s, x) => s + x.bills.length, 0);
    const iAmt = head.length - 1;
    eq([body.length, body.reduce((s, r) => s + satOfBaht(r[iAmt]), 0)], [n, a.buckets.totalSatang], "แถว/ยอด");
    const days = body.map((r) => Number(r[4])).sort((x, y) => x - y), exp = (a.rows as Any[]).flatMap((x) => x.bills.map((b: Any) => b.daysLate)).sort((x, y) => x - y);
    eq(days, exp, "เลยกำหนด (วัน)");
  });
  await st("E-2", "กันสูตร (X6): ทุกช่องของทุกไฟล์ (AGING · OCCUPANCY · REVENUE) ไม่ขึ้นต้น = + - @ (ยกเว้นตัวเลขล้วน) · ชื่อสูตรในฉากออกมาเป็น '=HYPERLINK… '+66… '@SUM… '-2+3", async () => {
    needReady();
    const all: string[] = [];
    for (const kind of ["AGING", "OCCUPANCY", "REVENUE"]) { const { head, body } = await csvOf(cOwn(), { unitId: DA, kind }); all.push(...head, ...body.flat()); }
    eq(all.filter(dangerous).slice(0, 5), [], "ช่องอันตราย");
    for (const k of ["L1", "L2", "L3", "L4"]) ok(all.includes(`'${LS[k].first}`), `ไม่พบ '${LS[k].first}`);
  });
  await st("E-3", "OCCUPANCY + REVENUE CSV ตรงรายงาน: เดือน/ห้อง-วัน/อัตรา (% 2 ตำแหน่ง) · REVENUE 1 แถวต่อ (งวด × 7 ประเภท) · Σ รวม VAT = grand.total.gross · ไม่รวม VAT/VAT แยกช่อง", async () => {
    needReady();
    const o = await csvOf(cOwn(), { unitId: DO, kind: "OCCUPANCY", fromMonth: "2026-09", toMonth: "2026-11" }, NOW_O);
    const e = await expOcc(DO, "2026-09", "2026-11", NOW_O);
    eq(o.body.map((r) => [r[0], Number(r[1]), Number(r[2]), Number(r[3]), Number(r[4]), r[5]]), e.months.map((m) => [m.month, m.rooms, m.days, m.roomDays, m.occupiedRoomDays, (m.rateBp / 100).toFixed(2)]), "OCCUPANCY");
    const v = await csvOf(cOwn(), { unitId: DA, kind: "REVENUE", fromMonth: P0, toMonth: P4 });
    const rv = okRes(await D.rev()(cOwn(), { unitId: DA, fromMonth: P0, toMonth: P4 }, { now: new Date(NOW_A) }), "rev");
    eq(v.body.length, PERIODS.length * REV_TYPES.length, "แถว");
    eq([v.body.reduce((s, r) => s + satOfBaht(r[2]), 0), v.body.reduce((s, r) => s + satOfBaht(r[3]), 0), v.body.reduce((s, r) => s + satOfBaht(r[4]), 0)],
      [rv.grand.total.netSatang, rv.grand.total.vatSatang, rv.grand.total.grossSatang], "Σ net/vat/gross");
  });
  await st("E-4", "เพดานจากค่าตั้งร้าน: rooms.report.exportMaxRows = 2 ⇒ AGING (> 2 แถว) TOO_LARGE ไทย ไม่มี csv · OCCUPANCY 2 เดือนผ่าน · คืนค่าแล้วผ่าน · ช่วงเกิน maxMonths ⇒ INVALID_INPUT", async () => {
    needReady();
    await setVal(A, "rooms.report.exportMaxRows", "TENANT", A, 2);
    try {
      const r = await D.csv()(cOwn(), { unitId: DA, kind: "AGING" }, { now: new Date(NOW_A) });
      ok(failIs(r, "TOO_LARGE") && r.csv === undefined, `ได้ ${codeOf(r)}`);
      okRes(await D.csv()(cOwn(), { unitId: DO, kind: "OCCUPANCY", fromMonth: "2026-10", toMonth: "2026-11" }, { now: new Date(NOW_O) }), "2 แถว");
    } finally { await unsetTenant(A, "rooms.report.exportMaxRows"); }
    okRes(await D.csv()(cOwn(), { unitId: DA, kind: "AGING" }, { now: new Date(NOW_A) }), "คืนค่า");
    ok(failIs(await D.csv()(cOwn(), { unitId: DA, kind: "REVENUE", fromMonth: "2024-01", toMonth: P4 }, { now: new Date(NOW_A) }), "INVALID_INPUT"), "เกิน 24 เดือน");
    ok(failIs(await D.csv()(cOwn(), { unitId: DA, kind: "PAYROLL" }, { now: new Date(NOW_A) }), "INVALID_INPUT"), "kind แปลก");
  }, "MAJOR");
  await st("E-5", "PII ใน CSV: ชื่อแรกเท่านั้น (ไม่มีนามสกุล) · ไม่มีเบอร์", async () => {
    needReady();
    const { r } = await csvOf(cOwn(), { unitId: DA, kind: "AGING" });
    ok(!SURNAMES.some((n) => r.csv.includes(n)) && !PHONES.some((p) => r.csv.includes(p)) && !PHONE_RE.test(r.csv), "พบนามสกุล/เบอร์");
    ok(["L5", "L7"].every((k) => r.csv.includes(LS[k].first)), "ไม่มีชื่อแรก");
  }, "MAJOR");
  await st("E-6", "ขอบเขตอาคารใน CSV: CT ⇒ AGING เฉพาะห้อง 101–106 · Σ = aging ของ CT · CT2 ⇒ ไฟล์มีแต่หัว (rows 0)", async () => {
    needReady();
    const { body } = await csvOf(cCT(), { unitId: DA, kind: "AGING" });
    ok(body.every((r) => ["101", "102", "103", "104", "105", "106"].includes(r[0])), `ห้อง ${J([...new Set(body.map((r) => r[0]))])}`);
    const a = okRes(await D.aging()(cCT(), { unitId: DA }, { now: new Date(NOW_A) }), "aging CT");
    eq(body.reduce((s, r) => s + satOfBaht(r[r.length - 1]), 0), a.buckets.totalSatang, "Σ");
    const c2 = await csvOf({ tenantId: A, actorUserId: ids.CT2 }, { unitId: DA, kind: "AGING" });
    eq(c2.r.rows, 0, "CT2");
  });

  // ═══════════════ X ด่าน ═══════════════
  console.log("\n── X ด่าน ──");
  await st("X-1", "ไม่พบเดียวกันทุกไบต์ (5 ฟังก์ชัน): เจ้าของร้าน B กับหน่วยร้าน A · เจ้าของ A กับหน่วยร้าน B · dorm.view อย่างเดียว · คนจดมิเตอร์ · MANAGER หน่วยอื่น · สมาชิกที่ยังไม่ตอบรับ · หน่วยโรงแรม · id สุ่ม · unitId ไม่ใช่สตริง · ctx ผิดรูป", async () => {
    needReady();
    const nf = D.NF();
    const cases: [Any, Any][] = [[cOB(), DA], [cOwn(), DB], [{ tenantId: A, actorUserId: ids.VW }, DA], [{ tenantId: A, actorUserId: ids.MT }, DA], [{ tenantId: A, actorUserId: ids.MGR }, DA],
      [{ tenantId: A, actorUserId: ids.PEND }, DA], [cOwn(), HA], [cOwn(), `nope${STAMP}`], [cOwn(), 12345], [{ tenantId: A }, DA]];
    const calls = (ctx: Any, unitId: Any) => [D.aging()(ctx, { unitId }, { now: new Date(NOW_A) }), D.occ()(ctx, { unitId, fromMonth: P1, toMonth: P2 }, { now: new Date(NOW_A) }),
      D.rev()(ctx, { unitId, fromMonth: P1, toMonth: P2 }, { now: new Date(NOW_A) }), D.model()(ctx, { unitId }, { now: new Date(NOW_A) }), D.csv()(ctx, { unitId, kind: "AGING" }, { now: new Date(NOW_A) })];
    const rs = (await Promise.all(cases.map(([c, u]) => Promise.all(calls(c, u))))).flat();
    ok(rs.every((r) => r?.ok === false && r.code === "NOT_FOUND" && r.reason === nf), rs.map(codeOf).join(","));
    eq(new Set(rs.map((r) => J(r))).size, 1, "เนื้อคำตอบต่างกัน");
    // ตัวควบคุม: MANAGER หน่วยของตัวเอง (DQ ว่าง) ผ่าน · ด่านก่อนรูปแบบอินพุต (ผู้ไม่มีสิทธิ์ + เดือนผิด = NOT_FOUND)
    okRes(await D.aging()({ tenantId: A, actorUserId: ids.MGR }, { unitId: DQ }, { now: new Date(NOW_A) }), "MGR DQ");
    const pre = await D.occ()({ tenantId: A, actorUserId: ids.VW }, { unitId: DA, fromMonth: "bad", toMonth: "bad" }, { now: new Date(NOW_A) });
    ok(pre?.code === "NOT_FOUND", `ด่านก่อนอินพุต ${codeOf(pre)}`);
  });
  await st("X-2", "ขอบเขตอาคาร (#64): CT ⇒ ลูกหนี้ DA เฉพาะห้องอาคาร 1 = oracle ห้องเหล่านั้น = GL 1100 ของผู้เช่า L1–L6 · CT2 (ไม่มีรายชื่อ · fail closed) ⇒ ok ยอด 0 แถว 0", async () => {
    needReady();
    const vis = new Set(["L1", "L2", "L3", "L4", "L5", "L6"].map((k) => LS[k].roomId));
    const r = okRes(await D.aging()(cCT(), { unitId: DA }, { now: new Date(NOW_A) }), "CT");
    const e = await expAging(DA, NOW_A, vis);
    eq([r.buckets, gotRows(r)], [e.buckets, e.rows], "CT");
    eq(r.buckets.totalSatang, await glArOfLeases(A, BOOK_A, ["L1", "L2", "L3", "L4", "L5", "L6"]), "GL");
    const r2 = okRes(await D.aging()({ tenantId: A, actorUserId: ids.CT2 }, { unitId: DA }, { now: new Date(NOW_A) }), "CT2");
    eq([r2.buckets.totalSatang, r2.rows.length], [0, 0], "CT2");
  });
  await st("X-3", "Membership สด: ถอน dorm.slip.review ของ CT (เหลือ dorm.view) ⇒ NOT_FOUND ทันที · คืนสิทธิ์ ⇒ ผ่าน", async () => {
    needReady();
    await prisma.membership.update({ where: { id: ids.mb_ct }, data: { permissions: { "dorm.view": true } } });
    try { ok((await D.aging()(cCT(), { unitId: DA }, { now: new Date(NOW_A) }))?.code === "NOT_FOUND", "ยังเห็น"); }
    finally { await prisma.membership.update({ where: { id: ids.mb_ct }, data: { permissions: { "dorm.view": true, "dorm.slip.review": true } } }); }
    okRes(await D.aging()(cCT(), { unitId: DA }, { now: new Date(NOW_A) }), "คืนสิทธิ์");
  }, "MAJOR");
  await st("X-4", "ร้าน B: เจ้าของ B เห็นเฉพาะหน่วยตัวเอง · ลูกหนี้ = GL 1100 ร้าน B · รายได้ไม่ปนร้าน A", async () => {
    needReady();
    const r = okRes(await D.aging()(cOB(), { unitId: DB }, { now: new Date(NOW_A) }), "B");
    eq([r.rows.map((x: Any) => x.leaseId), r.buckets.totalSatang], [[LS.LB1.leaseId], await glArOfLeases(B, ids.BOOK_B, ["LB1"])], "B");
    const v = okRes(await D.rev()(cOB(), { unitId: DB, fromMonth: P2, toMonth: P2 }, { now: new Date(NOW_A) }), "B rev");
    eq((v.months as Any[])[0].bills, 1, "B bills");
  });

  // ═══════════════ W อ่านอย่างเดียว ═══════════════
  console.log("\n── W อ่านอย่างเดียว ──");
  await st("W-1", "เรียกทุกฟังก์ชัน (owner · CT · ผู้ไม่มีสิทธิ์ · CSV 3 แบบ) ⇒ จำนวนแถว AuditLog/OutboxEvent/SettingValue/ServiceMessageLog/AccountDocument/AccountDocumentPayment/AccountJournalEntry/DormBill/DormLease/RoomOccupancy + max(updatedAt) ของ DormBill/AccountDocument ไม่เปลี่ยน", async () => {
    needReady();
    const snap = async () => {
      const out: Record<string, unknown> = {};
      for (const t of ["AuditLog", "OutboxEvent", "SettingValue", "ServiceMessageLog", "AccountDocument", "AccountDocumentPayment", "AccountJournalEntry", "DormBill", "DormLease", "RoomOccupancy"]) {
        const r: { n: bigint }[] = await prisma.$queryRawUnsafe(`SELECT count(*)::bigint AS n FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, tenantIds);
        out[t] = Number(r[0]?.n ?? 0);
      }
      for (const t of ["DormBill", "AccountDocument"]) { const r: { m: Date | null }[] = await prisma.$queryRawUnsafe(`SELECT max("updatedAt") AS m FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, tenantIds); out[`${t}.updatedAt`] = r[0]?.m ? new Date(r[0].m).toISOString() : null; }
      return out;
    };
    const s0 = await snap();
    for (const ctx of [cOwn(), cCT(), { tenantId: A, actorUserId: ids.VW }]) {
      await D.aging()(ctx, { unitId: DA }, { now: new Date(NOW_A) });
      await D.occ()(ctx, { unitId: DO, fromMonth: "2026-09", toMonth: "2026-11" }, { now: new Date(NOW_O) });
      await D.rev()(ctx, { unitId: DA, fromMonth: P0, toMonth: P4 }, { now: new Date(NOW_A) });
      await D.model()(ctx, { unitId: DA }, { now: new Date(NOW_A) });
      for (const kind of ["AGING", "OCCUPANCY", "REVENUE"]) await D.csv()(ctx, { unitId: DA, kind }, { now: new Date(NOW_A) });
    }
    eq(await snap(), s0, "แถวในฐาน");
  });

  // ═══════════════ U DOM ═══════════════
  console.log("\n── U DOM ──");
  const compL = await loadIf(F.comp);
  const React = (await tryImport("react")).mod as Any;
  const RDS = (await tryImport("react-dom/server")).mod as Any;
  const render = (props: Any): string => {
    const Comp = compL.mod?.default;
    if (typeof Comp !== "function") throw new AssertFail(`โหลด ${F.comp} ไม่ได้: ${compL.err || "ไม่มี default export"}`);
    return String(RDS.renderToStaticMarkup(React.createElement(Comp, props))).replace(/<!-- -->/g, "");
  };
  const unesc = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'");
  const textOf = (h: string) => unesc(h.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
  /** เนื้อของแท็กแรกที่มี attr=val ถึงแท็กปิดชื่อเดียวกัน (ไม่ซ้อนลึก — พอสำหรับการ์ด/เซลล์) */
  const blockOf = (h: string, attr: string, val: string): string | null => {
    const re = new RegExp(`<([a-zA-Z0-9]+)[^>]*\\s${attr}="${val.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*>`);
    const m = re.exec(h);
    if (!m) return null;
    const tag = m[1];
    let depth = 0, i = m.index;
    const tre = new RegExp(`<\\/?${tag}\\b[^>]*>`, "g");
    tre.lastIndex = i;
    for (let t = tre.exec(h); t; t = tre.exec(h)) { if (t[0].startsWith("</")) depth--; else if (!t[0].endsWith("/>")) depth++; if (depth === 0) return h.slice(i, t.index + t[0].length); }
    return h.slice(i);
  };
  const props = async () => {
    const model = okRes(await D.model()(cOwn(), { unitId: DA }, { now: new Date(NOW_A) }), "model");
    return { model, unitSlug: `d19a-${STAMP}`, actions: { exportCsv: async () => ({ ok: true, filename: "x.csv", csv: "" }) } };
  };
  await st("U-1", "DormReports: ราก data-dorm-reports + data-from/data-to · หัว 'รายงานหอ' · ช่วง 3 ลิงก์ (เดือนนี้ · 6 เดือน · ปีนี้ · 6M aria-current) · KPI 3 การ์ด (occupancy % 1 ตำแหน่ง · collected 'เก็บแล้ว' ฿ จาก ฿ · overdue ฿)", async () => {
    needReady();
    const p = await props();
    const h = render(p);
    const m = p.model;
    const bad: string[] = [];
    if (!new RegExp(`data-dorm-reports[^>]*data-from="${m.fromMonth}"|data-from="${m.fromMonth}"[^>]*data-dorm-reports`).test(h) || !h.includes(`data-to="${m.toMonth}"`)) bad.push("ราก");
    if (!textOf(h).includes("รายงานหอ")) bad.push("หัว");
    for (const [v, lab] of [["MONTH", "เดือนนี้"], ["6M", "6 เดือน"], ["YEAR", "ปีนี้"]]) { const b = blockOf(h, "data-range", v); if (!b || !textOf(b).includes(lab) || !/href="[^"]*range=/.test(b)) bad.push(`ช่วง ${v}`); }
    if (!/data-range="6M"[^>]*aria-current="page"|aria-current="page"[^>]*data-range="6M"/.test(h)) bad.push("aria-current");
    const occ = blockOf(h, "data-report-kpi", "occupancy"), col = blockOf(h, "data-report-kpi", "collected"), od = blockOf(h, "data-report-kpi", "overdue");
    if (!occ || !textOf(occ).includes(`${(m.kpi.occupancyAvgBp / 100).toFixed(1)}%`)) bad.push(`occupancy ${occ ? textOf(occ) : "-"}`);
    if (!col || !textOf(col).includes("เก็บแล้ว") || !textOf(col).includes(`${(m.kpi.collected.rateBp / 100).toFixed(1)}%`) || !textOf(col).includes(baht(m.kpi.collected.collectedSatang)) || !textOf(col).includes(baht(m.kpi.collected.billedGrossSatang))) bad.push(`collected ${col ? textOf(col) : "-"}`);
    if (!od || !textOf(od).includes(baht(m.kpi.overdue.satang))) bad.push(`overdue ${od ? textOf(od) : "-"}`);
    ok(!bad.length, bad.join(" · "));
  }, "MAJOR");
  await st("U-2", "ลูกหนี้ 4 การ์ด (notDue · d1_30 · d31_60 · d60plus = 61–90 + >90) เงินรูป ฿ · 'ดึงจากบัญชี V2' · แถว data-aging-row ต่อสัญญา (เลขห้อง + ชื่อแรก) · รายเดือน data-report-month ทุกเดือน + data-occupancy-bp · รายได้ data-revenue-row ทุกงวด + data-rev ครบ 7 ประเภท + TOTAL · หัว 'ไม่รวม VAT' 'รวม VAT' · แถวรวม net/vat/gross · ปุ่มส่งออก 3 (มีคำ Excel)", async () => {
    needReady();
    const p = await props();
    const h = render(p);
    const m = p.model, b = m.aging.buckets;
    const bad: string[] = [];
    const cards: [string, number][] = [["notDue", b.notDueSatang], ["d1_30", b.d1_30Satang], ["d31_60", b.d31_60Satang], ["d60plus", b.d61_90Satang + b.d90plusSatang]];
    for (const [k, v] of cards) { const x = blockOf(h, "data-aging-bucket", k); if (!x || !textOf(x).includes(baht(v))) bad.push(`ถัง ${k} ${x ? textOf(x).slice(0, 60) : "-"}`); }
    if (!textOf(h).includes("ดึงจากบัญชี V2")) bad.push("ดึงจากบัญชี V2");
    for (const r of m.aging.rows as Any[]) { const x = blockOf(h, "data-aging-row", r.leaseId); if (!x || !textOf(x).includes(r.roomNumber) || (r.tenantFirstName && !textOf(x).includes(r.tenantFirstName))) bad.push(`แถว ${r.roomNumber}`); }
    for (const mo of m.occupancy.months as Any[]) if (!new RegExp(`data-report-month="${mo.month}"[^>]*data-occupancy-bp="${mo.rateBp}"|data-occupancy-bp="${mo.rateBp}"[^>]*data-report-month="${mo.month}"`).test(h)) bad.push(`เดือน ${mo.month}`);
    for (const rv of m.revenue.months as Any[]) {
      const row = blockOf(h, "data-revenue-row", rv.periodKey);
      if (!row) { bad.push(`งวด ${rv.periodKey}`); continue; }
      for (const t of [...REV_TYPES, "TOTAL"]) { const c = blockOf(row, "data-rev", t); const v = t === "TOTAL" ? rv.total.grossSatang : rv.types[t].grossSatang; if (!c || !textOf(c).includes(baht(Math.abs(v)))) bad.push(`${rv.periodKey} ${t}`); }
    }
    const tx = textOf(h);
    if (!tx.includes("ไม่รวม VAT") || !tx.includes("รวม VAT")) bad.push("หัว VAT");
    for (const [k, v] of [["net", m.revenue.grand.total.netSatang], ["vat", m.revenue.grand.total.vatSatang], ["gross", m.revenue.grand.total.grossSatang]] as const) { const c = blockOf(h, "data-rev-total", k); if (!c || !textOf(c).includes(baht(Math.abs(v)))) bad.push(`รวม ${k}`); }
    for (const k of ["AGING", "OCCUPANCY", "REVENUE"]) { const c = blockOf(h, "data-report-export", k); if (!c || !/Excel/.test(textOf(c))) bad.push(`ส่งออก ${k}`); }
    ok(!bad.length, bad.slice(0, 8).join(" · "));
  }, "MAJOR");
  await st("U-3", "HTML ไม่มีเบอร์ · นามสกุล · private:// · ไม่มีตัวเลขส่วน RP.2 (ต้นทุนน้ำไฟที่หอแบก · ผู้เช่าจ่ายช้าซ้ำ · รายได้ที่เสียจากห้องว่าง)", async () => {
    needReady();
    const h = render(await props());
    const t = textOf(h);
    ok(!PHONE_RE.test(t) && !PHONES.some((p) => t.includes(p)) && !SURNAMES.some((n) => t.includes(n)) && !h.includes("private://"), "พบ PII");
    ok(!/ต้นทุนน้ำไฟที่หอแบก|จ่ายช้าซ้ำ|รายได้ที่เสียจากห้องว่าง/.test(t), "มีส่วน RP.2");
  }, "MAJOR");

  // ═══════════════ P perf 300 ห้อง × 12 งวด ═══════════════
  console.log("\n── P perf ──");
  let perfReady = false;
  const PERF_NOW = "2026-11-20T03:00:00.000Z", PF = "2025-12", PT = "2026-11", PERF_ROOMS = 300, PERF_PERIODS = monthsOf(PF, PT);
  const PL = { RENT: 450_000, COMMON: 30_000, ELEC: 40_000, WATER: 10_000 }, PTOT = 530_000;
  try {
    const DP = await mkUnit(A, "p", "หอดีสิบเก้าเพอร์ฟ"); ids.DP = DP;
    const BOOK_P = await SYS.createSystem(A, "ACCOUNT", `บัญชีหอ D19 P ${STAMP}`).then((s: Any) => s.id as string); ids.BOOK_P = BOOK_P;
    await linkBook(A, BOOK_P, DP);
    const ty = await mkType(A, DP), bd = await mkBld(A, DP, "อาคาร เพอร์ฟ");
    const id = (p: string, i: number) => `qcd19${p}${STAMP}${String(i).padStart(5, "0")}`;
    const chunk = async <T,>(rows: T[], f: (x: T[]) => Promise<unknown>) => { for (let i = 0; i < rows.length; i += 1000) await f(rows.slice(i, i + 1000)); };
    const R = Array.from({ length: PERF_ROOMS }, (_, i) => i);
    await chunk(R.map((i) => ({ id: id("r", i), tenantId: A, unitId: DP, roomTypeId: ty, number: String(1001 + i), buildingId: bd, floorNo: 1, floor: "1" })), (x) => prisma.hotelRoom.createMany({ data: x }));
    await chunk(R.map((i) => ({ id: id("p", i), tenantId: A, name: `เพอร์ฟ${i} ทดสอบดีสิบเก้า` })), (x) => prisma.party.createMany({ data: x }));
    await chunk(R.map((i) => ({ id: id("l", i), tenantId: A, unitId: DP, roomId: id("r", i), partyId: id("p", i), status: "ACTIVE", startDate: dbDate("2025-12-01"), rentSatang: PL.RENT, commonFeeSatang: PL.COMMON, createdById: "qc-d19" })), (x) => prisma.dormLease.createMany({ data: x }));
    await prisma.dormBillRun.createMany({ data: PERF_PERIODS.map((p, j) => ({ id: id("run", j), tenantId: A, unitId: DP, periodKey: p, status: "SENT", billCount: PERF_ROOMS, totalSatang: PERF_ROOMS * PTOT, createdById: "qc-d19" })) });
    const lines = (Object.entries(PL) as [string, number][]).map(([code, a]) => ({ code, labelTh: code, qty: 1, unitPriceSatang: a, amountSatang: a, taxKind: code === "RENT" ? "EXEMPT" : "NONE", netSatang: a, vatSatang: 0, grossSatang: a }));
    const BR = PERF_PERIODS.flatMap((p, j) => R.map((i) => ({ i, j, p })));
    await chunk(BR.map(({ i, j }) => ({ id: id("d", j * 1000 + i), tenantId: A, systemId: BOOK_P, docType: "INVOICE", status: "AWAITING_PAYMENT", direction: "OUT", source: "DORM", refSystemId: DP, refType: "DormBill", refId: id("b", j * 1000 + i),
      subTotal: PTOT, vatAmount: 0, grandTotal: PTOT, issueDate: dbDate(`${PERF_PERIODS[j]}-01`), dueDate: dbDate(`${PERF_PERIODS[j]}-05`), tags: [] })), (x) => prisma.accountDocument.createMany({ data: x }));
    await chunk(BR.map(({ i, j, p }) => ({ id: id("b", j * 1000 + i), tenantId: A, unitId: DP, runId: id("run", j), leaseId: id("l", i), roomId: id("r", i), partyId: id("p", i), periodKey: p, status: "SENT",
      lines, subtotalSatang: PTOT, vatSatang: 0, totalSatang: PTOT, dueDate: dbDate(`${p}-05`), accountDocumentId: id("d", j * 1000 + i) })), (x) => prisma.dormBill.createMany({ data: x }));
    perfReady = true;
  } catch (e) { record("P-0", "ฉาก perf (createMany)", "FAIL", `สร้างไม่ได้: ${errMsg(e)}`, "CRITICAL"); }
  await st("PC-10", "ฉาก perf (ตัวควบคุม): DP มีบิล 3,600 · ใบแจ้งหนี้ 3,600 · billBalances ของบิลตัวอย่าง = 5,300.00 (สาขามีเอกสาร)", async () => {
    ok(perfReady, "ฉาก perf ไม่พร้อม");
    eq([await prisma.dormBill.count({ where: { unitId: ids.DP } }), await prisma.accountDocument.count({ where: { tenantId: A, refSystemId: ids.DP } })], [PERF_ROOMS * PERF_PERIODS.length, PERF_ROOMS * PERF_PERIODS.length], "จำนวน");
    const one = await prisma.dormBill.findFirst({ where: { unitId: ids.DP }, select: { id: true } });
    eq((await DORM.billBalances(A, [one.id])).get(one.id)?.ownOutstandingSatang, PTOT, "billBalances");
  });
  const timed = async <T,>(f: () => Promise<T>): Promise<{ ms: number; v: T }> => { const t = Date.now(); const v = await f(); return { ms: Date.now() - t, v }; };
  const best2 = async <T,>(f: () => Promise<T>) => { const a = await timed(f); const b = await timed(f); return a.ms <= b.ms ? a : b; };
  const PERF_MS = 10_000;
  await st("P-1", `perf ฟังก์ชัน: ${PERF_ROOMS} ห้อง × ${PERF_PERIODS.length} งวด (3,600 บิล + 3,600 ใบแจ้งหนี้) aging + occupancy 12 เดือน + revenue 12 เดือน รวม ≤ ${PERF_MS / 1000} วิ (ดีที่สุดใน 2 รอบ) · ผลถูก: ค้างรวม 3,600 × 5,300 · เข้าพัก 100% · รายได้ต่อเดือน 300 × 5,300`, async () => {
    ok(perfReady, "ฉาก perf ไม่พร้อม");
    const x = await best2(async () => [await D.aging()(cOwn(), { unitId: ids.DP }, { now: new Date(PERF_NOW) }), await D.occ()(cOwn(), { unitId: ids.DP, fromMonth: PF, toMonth: PT }, { now: new Date(PERF_NOW) }), await D.rev()(cOwn(), { unitId: ids.DP, fromMonth: PF, toMonth: PT }, { now: new Date(PERF_NOW) })]);
    const [a, o, r] = x.v as Any[];
    okRes(a, "aging"); okRes(o, "occ"); okRes(r, "rev");
    eq([a.buckets.totalSatang, a.rows.length], [PERF_ROOMS * PERF_PERIODS.length * PTOT, PERF_ROOMS], "aging");
    ok((o.months as Any[]).every((m) => m.rateBp === 10000) && o.months.length === 12, "occ");
    ok((r.months as Any[]).every((m) => m.bills === PERF_ROOMS && m.total.grossSatang === PERF_ROOMS * PTOT && m.types.ELEC.grossSatang === PERF_ROOMS * PL.ELEC), "rev");
    ok(x.ms <= PERF_MS, `ใช้ ${x.ms} ms > ${PERF_MS}`);
    console.log(`     (perf ฟังก์ชัน ${x.ms} ms)`);
  });
  await st("P-2", `perf ส่งออก: CSV AGING (3,600 แถว ≤ เพดานค่าเริ่ม 5,000) + REVENUE 12 เดือน รวม ≤ ${PERF_MS / 1000} วิ (ดีที่สุดใน 2 รอบ) · rows ถูก`, async () => {
    ok(perfReady, "ฉาก perf ไม่พร้อม");
    const x = await best2(async () => [await D.csv()(cOwn(), { unitId: ids.DP, kind: "AGING" }, { now: new Date(PERF_NOW) }), await D.csv()(cOwn(), { unitId: ids.DP, kind: "REVENUE", fromMonth: PF, toMonth: PT }, { now: new Date(PERF_NOW) })]);
    const [a, r] = x.v as Any[];
    eq([codeOf(a), a?.rows, codeOf(r), r?.rows], ["ok", PERF_ROOMS * PERF_PERIODS.length, "ok", PERF_PERIODS.length * REV_TYPES.length], "rows");
    ok(x.ms <= PERF_MS, `ใช้ ${x.ms} ms > ${PERF_MS}`);
    console.log(`     (perf ส่งออก ${x.ms} ms)`);
  }, "MAJOR");
  await st("P-3", "perf โมเดลจอ: dormReportModel YEAR ณ 20 พ.ย. ≤ 10 วิ (ดีที่สุดใน 2 รอบ)", async () => {
    ok(perfReady, "ฉาก perf ไม่พร้อม");
    const x = await best2(() => D.model()(cOwn(), { unitId: ids.DP, range: "YEAR" }, { now: new Date(PERF_NOW) }));
    okRes(x.v, "model");
    ok(x.ms <= PERF_MS, `ใช้ ${x.ms} ms > ${PERF_MS}`);
    console.log(`     (perf โมเดล ${x.ms} ms)`);
  }, "MAJOR");
  await st("M-4", "ไม่มีคำขอออกนอกเครื่อง", () => eq(BLOCKED, [], "คำขอนอกเครื่อง"), "MINOR");
} catch (e) {
  record("CRASH", "จบกลางทาง", "FAIL", errMsg(e), "CRITICAL");
} finally {
  // ═══════════════ Z ล้างข้อมูล ═══════════════
  console.log("\n── Z: ล้างข้อมูล ──");
  try { await cleanup(tenantIds); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); }
  await cleanupMisc();
  await st("Z-1", "หลังล้าง: tenant `qc-svc-d19-*` 0 · แถวของร้านทดสอบ 0 ทุกตาราง · ผู้ใช้ทดสอบ 0", async () => {
    eq(await prisma.tenant.count({ where: { slug: { startsWith: "qc-svc-d19-" } } }), 0, "tenant");
    const left: string[] = [];
    if (tenantIds.length) for (const t of await tablesWithTenant()) { const r: { n: bigint }[] = await prisma.$queryRawUnsafe(`SELECT count(*)::bigint AS n FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, tenantIds); if (Number(r[0]?.n ?? 0)) left.push(t); }
    eq(left, [], "ตารางที่ค้าง");
    eq(await prisma.user.count({ where: { email: { startsWith: "svc-d19-" } } }), 0, "user");
  }, "MAJOR");
  globalThis.fetch = REAL_FETCH;
}
void RESULTS;

// ═══════════════ S (git · ตอนรับใบเท่านั้น) ═══════════════
console.log("\n── S: ไฟล์ที่แตะ (git) ──");
const git = (args: string[]) => execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const dirty = (paths: string[]) => git(["status", "--porcelain", "--untracked-files=all", "--", ...paths]).split("\n").filter(Boolean).map((l) => l.slice(3).trim().replace(/^"|"$/g, ""));
const diffLines = (f: string) => git(["diff", "-U0", "HEAD", "--", f]).split("\n").filter((l) => /^[+-](?![+-])/.test(l));
const OWN_EDIT = [F.dormIndex, F.defs, F.unitHome];
const OWN_FIXED = new Set<string>([F.report, F.page, F.actions, F.comp, ...OWN_EDIT]);
{
  const ch = dirty(["src", "prisma", "public"]);
  const headHas = (() => { try { git(["cat-file", "-e", `HEAD:${F.report}`]); return true; } catch { return false; } })();
  if (ch.length === 0 && headHas) skip("S-1", "แตะเฉพาะไฟล์ของใบ (§1)", "D.19 merge แล้ว — ข้อนี้ตรวจเฉพาะตอนรับใบ (git status ของทรีงาน)");
  else await st("S-1", "แตะเฉพาะไฟล์ของใบ (§1 · git status ตอนรับใบ) · มีไฟล์ใหม่ครบ", () => {
    const outside = ch.filter((f) => !OWN_FIXED.has(f));
    ok(outside.length === 0, `ไฟล์นอกใบ: ${outside.slice(0, 8).join(", ")}`);
    const miss = [F.report, F.page, F.actions, F.comp].filter((f) => !existsSync(join(ROOT, f)));
    ok(miss.length === 0, `ยังไม่มี: ${miss.join(", ")}`);
  });
}
await st("S-2", "ไม่แตะชิ้นต้องห้าม: prisma · core (นอก defs/rooms.ts) · บัญชีทั้งโมดูล · โมดูลหอเดิม (นอก report/index) · components/dorm เดิม · platform · consumers · automation/webhooks labels · layout หอ", () => {
  const banned = dirty(["prisma", "src/lib/core", "src/lib/modules/account", "src/lib/modules/dorm", "src/components/dorm", "src/lib/platform", "src/lib/outbox-consumers.ts", "src/lib/automation/labels.ts", "src/lib/webhooks/labels.ts", "src/app/app/u/[unitSlug]/dorm/layout.tsx"])
    .filter((f) => ![F.defs, F.report, F.dormIndex, F.comp].includes(f as never));
  eq(banned, [], "ไฟล์");
});
await st("S-13", "แก้ไฟล์ร่วมแบบเพิ่ม: dorm/index.ts · defs/rooms.ts · หน้าแรกหน่วย ไม่ลบบรรทัด · fitness (ถ้าแตะ) ไม่ลบบรรทัด", () => {
  const rm = (f: string) => diffLines(f).filter((l) => l.startsWith("-") && l.slice(1).trim()).length;
  const bad: string[] = [];
  for (const f of OWN_EDIT) if (rm(f) > 0) bad.push(`${f} ลบ ${rm(f)}`);
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
    const nr = u ? await prisma.dormBillRun.count({ where: { tenantId: SQC_TENANT.id, unitId: u.id, createdById: SQC_DORM_HOME_SCENE.mark } }) : 0;
    if (!t || !u || nl === 0 || nr === 0) why = "ร้าน svcqc ยังไม่มีฉาก D.13 (reseed → roomboard → lease → billing → dorm-home ก่อน)";
    else unitId = u.id;
  } catch (e) { why = `อ่าน svcqc ไม่ได้: ${errMsg(e)}`; }
  const runScene = (args: string[] = []) => spawnSync("pnpm", ["exec", "tsx", F.scene, ...args], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  const summary = (out: string) => { const l = out.split("\n").reverse().find((x) => x.startsWith("SCENE_SUMMARY ")); try { return l ? JSON.parse(l.slice(14)) : null; } catch { return null; } };
  const sceneRuns = () => prisma.dormBillRun.findMany({ where: { tenantId: SQC_TENANT.id, createdById: SQC_DORM_REPORT_SCENE.mark }, select: { id: true, periodKey: true } });
  const otherSig = async () => { const r: Any[] = await prisma.$queryRawUnsafe(`SELECT b."periodKey", count(*)::int AS n, sum(b."totalSatang")::bigint AS t, sum(b."paidSatang")::bigint AS p, string_agg(b.status, ',' ORDER BY b.id) AS s FROM "DormBill" b JOIN "DormBillRun" r ON r.id = b."runId" WHERE b."tenantId" = $1 AND (r."createdById" IS NULL OR r."createdById" <> $2) GROUP BY b."periodKey" ORDER BY 1`, SQC_TENANT.id, SQC_DORM_REPORT_SCENE.mark); return J(r); };
  const counts = async () => [await prisma.settingValue.count({ where: { tenantId: SQC_TENANT.id } }), await prisma.outboxEvent.count({ where: { tenantId: SQC_TENANT.id } }), await prisma.serviceMessageLog.count({ where: { tenantId: SQC_TENANT.id } }), await prisma.accountDocument.count({ where: { tenantId: SQC_TENANT.id } })];
  const thisMonth = thaiYmd(new Date()).slice(0, 7);
  const histMonths = SQC_DORM_REPORT_SCENE.historyOffsets.map((o) => monthAdd(thisMonth, o));
  const n1 = `ฉาก svc-qc-report-scene: รันได้ · รันซ้ำ = 0/0/0 · รอบ mark ${SQC_DORM_REPORT_SCENE.mark} ที่งวด ${histMonths.join(" ")} · บิล PAID ไม่มีเอกสารบัญชี · ไม่เขียน SettingValue/OutboxEvent/ServiceMessageLog/AccountDocument · บิลของฉากอื่นไม่เปลี่ยน`;
  const n2 = "บนฉาก: dormReportModel(owner svcqc · 6M) ok · งวดประวัติ bills = จำนวนบิลฉาก · เก็บแล้ว = รวม VAT · ลูกหนี้ = Σ (total − paid) ของบิลที่เห็น · คนจดมิเตอร์ ⇒ NOT_FOUND · --clear ลบเฉพาะของฉาก แล้วรันคืน";
  if (why) { skip("Q-1", n1, why, "MAJOR"); skip("Q-2", n2, why, "MAJOR"); }
  else {
    await st("Q-1", n1, async () => {
      ok(existsSync(join(ROOT, F.scene)), `ยังไม่มี ${F.scene}`);
      runScene(["--clear"]);
      const c0 = await counts(), o0 = await otherSig();
      const a = runScene();
      ok(a.status === 0, `รอบแรก exit=${a.status} ${`${a.stdout}${a.stderr}`.split("\n").slice(-3).join(" | ").slice(0, 200)}`);
      const b = runScene();
      eq(summary(`${b.stdout}`), { created: 0, updated: 0, removed: 0 }, "รอบสอง");
      eq((await sceneRuns()).map((r: Any) => r.periodKey).sort(), [...histMonths].sort(), "งวดฉาก");
      const bs: Any[] = await prisma.dormBill.findMany({ where: { runId: { in: (await sceneRuns()).map((r: Any) => r.id) } } });
      ok(bs.length > 0 && bs.every((x) => x.status === "PAID" && x.paidSatang === x.totalSatang && !x.accountDocumentId && x.unitId === unitId), "บิลฉาก");
      eq([await counts(), await otherSig()], [c0, o0], "ฉากอื่น/ตาราง");
    }, "MAJOR");
    await st("Q-2", n2, async () => {
      const owner = SQC_USERS.find((u) => u.key === "owner")!, meter = SQC_USERS.find((u) => u.key === "meter")!;
      const now = new Date();
      const r = okRes(await fnOf(dormL, "dormReportModel", FIDX)({ tenantId: SQC_TENANT.id, actorUserId: owner.userId }, { unitId }, { now }), "model svcqc");
      const runs = await sceneRuns();
      for (const p of histMonths.filter((m) => m >= r.fromMonth)) {
        const m = (r.revenue.months as Any[]).find((x) => x.periodKey === p);
        const n = await prisma.dormBill.count({ where: { runId: { in: runs.filter((x: Any) => x.periodKey === p).map((x: Any) => x.id) } } });
        ok(m && m.bills === n && m.collectedSatang === m.total.grossSatang && m.noDocBills === n, `${p} ${J(m).slice(0, 160)}`);
      }
      const vis: Any[] = await prisma.dormBill.findMany({ where: { tenantId: SQC_TENANT.id, unitId, status: { in: SENTISH } }, select: { id: true, tenantId: true, accountDocumentId: true, totalSatang: true, paidSatang: true } });
      const bal = await DORM.billBalances(SQC_TENANT.id, vis.map((b) => b.id));
      eq(r.aging.buckets.totalSatang, [...bal.values()].reduce((a: number, x: Any) => a + x.ownOutstandingSatang, 0), "ลูกหนี้ svcqc");
      ok((await fnOf(dormL, "dormReportModel", FIDX)({ tenantId: SQC_TENANT.id, actorUserId: meter.userId }, { unitId }, { now }))?.code === "NOT_FOUND", "คนจดมิเตอร์");
      const c = runScene(["--clear"]);
      ok(c.status === 0 && (await sceneRuns()).length === 0, `--clear exit=${c.status}`);
      const back = runScene();
      ok(back.status === 0 && (await sceneRuns()).length === histMonths.length, "รันคืน");
    }, "MAJOR");
  }
}

// ═══════════════ V ภาพ ═══════════════
console.log("\n── V ภาพ ──");
{
  const base = process.env.QC_BASE ?? "";
  const n1 = "visual-svc d.19 (จอ 14 /dorm/reports · 1440 · HTTP < 400) — ผู้คุมเทียบ PARITY กับ 14-dorm-reports.png เฉพาะส่วนที่ทำ";
  if (!base) skip("V-1", n1, "ไม่มี QC_BASE — ผู้คุม build QC ผ่าน iso + reseed + ฉาก D.13 + ฉาก D.19 แล้วรันซ้ำด้วย QC_BASE", "MAJOR");
  else {
    const r = spawnSync("pnpm", ["exec", "tsx", "scripts/visual-svc.mts", "d.19", "--user", "owner", "--base", base], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
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
  { s: "qc-svc-d.8", args: ["--no-regression"], judge: judgeNoFail, note: "ไม่มี FAIL" },
  { s: "qc-svc-d.10", args: ["--no-regression"], judge: (out) => { const s = summaryOf(out); return !!s && s.failed.every((id) => id === "S-1" || id === "S-2"); }, note: "ไม่มี FAIL ยกเว้น S-1/S-2 = ข้อ 'ไฟล์ของใบ D.10'" },
  { s: "qc-svc-d.11", args: ["--no-regression"], judge: judgeNoFail, note: "ไม่มี FAIL" },
  { s: "qc-svc-smoke" },
];
{
  const hasWork = typeof dormL.mod?.dormAgingReport === "function" && typeof dormL.mod?.dormReportCsv === "function";
  const why = !hasWork ? "ยังไม่มีงานของใบ (dormAgingReport / dormReportCsv) — regression รันเมื่อมีงาน" : NO_REG ? "--no-regression / SVC_D19_NO_REGRESSION=1" : "";
  for (const [i, g] of REG.entries()) {
    const id = `G-${i + 1}`;
    const name = `${g.s}${g.args?.length ? ` ${g.args.join(" ")}` : ""}${g.note ? ` (${g.note})` : " exit 0"}`;
    if (why) { skip(id, name, why); continue; }
    if (!existsSync(join(ROOT, "scripts", `${g.s}.mts`))) { record(id, name, "FAIL", "ไม่มีไฟล์ชุด", "CRITICAL"); continue; }
    const t = Date.now();
    const r = spawnSync("pnpm", ["exec", "tsx", `scripts/${g.s}.mts`, ...(g.args ?? [])], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, timeout: 60 * 60_000 });
    const all = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
    const log = `/tmp/svc-d19-reg-${g.s}.log`;
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
console.log(`\n===== QC SVC D.19 · รายงานหลักหอ =====\nผ่าน ${passed}/${cks.length}${skipped.length ? ` (SKIP ${skipped.length})` : ""}`);
console.log(`FINDINGS: CRITICAL ${failed.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${failed.filter((c) => c.sev === "MAJOR").length} · MINOR ${failed.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), findings: [...failed, ...skipped].map((c) => c.id) })}`);
// รับใบ = ผ่านทุกข้อ (SKIP ที่ยอมได้ระหว่างทำ: G-* เมื่อ --no-regression · V-1 ไม่มี QC_BASE · Q-* svcqc ยังไม่มีฉาก D.13 · S-1 หลัง merge — ผู้คุมรันซ้ำครบก่อนรับ)
process.exit(failed.length + skipped.length > 0 ? 1 : 0);
