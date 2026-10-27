// QC — SVC R0.2 · ข้อมูล QC + เครื่องมือ (seed · smoke · visual · แม่แบบ wo-notes) · oracle ของผู้คุม — builder ห้ามแก้ไฟล์นี้
// สัญญา: ledger/SVC-MASTER-PLAN.md แถว R0.2 · ใบสั่ง ledger/svc-briefs/svc-brief-r0.2.md (§3 = ตัวเลขที่ตรวจตรงตัว)
//        ledger/design-booking/README.md (+ ภาพ 11/12 ร้านนวด) · ledger/design-dorm/README.md
//
// กลุ่มข้อ:
//   F  ไฟล์ส่งมอบครบ (seed · smoke · visual · SQC · TEMPLATE-svc)
//   G  seed/smoke/visual ปฏิเสธฐานที่ไม่ใช่ qc-svc (URL ปลอม .invalid — ไม่มีวันต่อได้จริง) ⇒ exit 4 · ไม่พิมพ์รหัสผ่าน
//   I  seed 2 รอบ = แถวเท่าเดิม + รอบ 2 ไม่เขียน · ค่าเพี้ยนแล้ว seed คืนค่า
//   O  ร้านอื่นบน qc-svc ไม่เปลี่ยน (ลายนิ้วมือทุกตารางที่มี tenantId ต่อร้าน + ผู้ใช้)
//   D  ข้อมูลร้านตัวอย่างตรง README (ช่าง/บริการ/ราคา · หอ 36 ห้อง 3 ชั้น · โรงแรม 14 ห้อง B205 รายเดือน · ร้าน B)
//   U  ผู้ใช้ครบบทบาท (role · unitAccess · สิทธิ์ขั้นต่ำ · ไม่ข้ามร้าน)
//   SM smoke เขียว · อ่านอย่างเดียว · แดงเมื่อชนิดหน่วยผิด (positive control)
//   V  visual-svc: --list · ไม่มี base/:3215/ผู้ใช้แปลก/ต่อไม่ได้ ⇒ exit 2 ไม่รั่ว session · ถ่ายจริง (ต้องมี QC_BASE — ไม่มี = SKIP)
//
// ต่อฐานด้วย `pg` ตรง (ไม่ผ่าน Prisma client) · seed/smoke/visual รันเป็นโปรเซสลูกด้วย env เดียวกับข้อสอบ
// 🔴 ข้อสอบนี้รัน seed (เขียนฐาน) — รันผ่าน gate lock: bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-r0.2.mts
//    (ข้อ O เทียบร้านอื่นทั้งฐาน — ข้อสอบอื่นเขียน qc-svc พร้อมกัน = O แดงปลอม · ร้านที่สร้างภายใน 2 ชม. ไม่นับ)
// ค่าที่ข้อสอบแก้ชั่วคราว (I-5 · SM-3) คืนใน finally เสมอ
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import pg from "pg";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "qc-svc-r0.2";
const SVC_HOST = "ep-mute-scene";
const FORBIDDEN_HOSTS = ["ep-royal-night", "ep-plain-art", "ep-cool-shadow", "ep-weathered-river", "ep-frosty-lab", "ep-fragrant-thunder"];

// ═══════════════ 0. ด่านฐานข้อมูล (ในตัวข้อสอบ — ไม่พึ่งไฟล์ของ builder) ═══════════════
{
  for (const n of ["DATABASE_URL", "DIRECT_URL"] as const) {
    const u = process.env[n] ?? "";
    if (!u) { console.error(`🔴 ${LABEL}: ไม่มี ${n} — รันผ่าน: bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/qc-svc-r0.2.mts`); process.exit(4); }
    const bad = FORBIDDEN_HOSTS.find((h) => u.includes(h));
    if (bad) { console.error(`🔴 ${LABEL}: ${n} ชี้ฐานต้องห้าม (${bad}) — หยุด`); process.exit(4); }
    let hn = "";
    try { hn = new URL(u).hostname; } catch { /* อ่านไม่ได้ = ปฏิเสธ */ }
    if (!hn.startsWith(SVC_HOST)) { console.error(`🔴 ${LABEL}: ${n} host ไม่ใช่ qc-svc (${SVC_HOST}) — หยุด`); process.exit(4); }
  }
  if (process.env.APP_ENV === "production") { console.error(`🔴 ${LABEL}: APP_ENV=production`); process.exit(4); }
}

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Res = "PASS" | "FAIL" | "SKIP";
const cks: { id: string; res: Res; sev: Sev; why: string; allowSkip: boolean }[] = [];
const chk = (id: string, name: string, ok: boolean, detail = "", sev: Sev = "CRITICAL") => {
  cks.push({ id, res: ok ? "PASS" : "FAIL", sev, why: detail, allowSkip: false });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${!ok && detail ? ` — ${detail}` : ""}`);
};
const skip = (id: string, name: string, why: string, sev: Sev = "CRITICAL", allowSkip = false) => {
  cks.push({ id, res: "SKIP", sev, why, allowSkip });
  console.log(`  ⏭️  [${id}] ${name} — SKIP: ${why}`);
};
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 220);

// ═══════════════ สัญญา (ใบสั่ง §3 — ตัวเลขจาก README · ข้อสอบถือเอง ไม่อ่านจาก SQC ของ builder) ═══════════════
const TA = "svcqc-tenant";
const TB = "svcqc-other-tenant";
const SVC_TENANTS = [TA, TB];
const U = { barber: "svcqc-unit-barber", massage: "svcqc-unit-massage", dorm: "svcqc-unit-dorm", hotel: "svcqc-unit-hotel" } as const;
const UB = { barber: "svcqc-other-unit-barber", hotel: "svcqc-other-unit-hotel" } as const;
const UNITS_A = [
  { id: U.barber, type: "BOOKING", slug: "barber-ari", name: "บาร์เบอร์ลุงหนวด สาขาอารีย์" },
  { id: U.massage, type: "BOOKING", slug: "massage-baitoey", name: "บ้านนวดใบเตย สุขุมวิท 49" },
  { id: U.dorm, type: "DORM", slug: "bansuan-apartment", name: "บ้านสวนอพาร์ตเมนต์" },
  { id: U.hotel, type: "HOTEL", slug: "bansuan-hotel", name: "บ้านสวน โฮเทล" },
];
// ชื่อเทียบแบบตัดช่องว่าง + ชื่อเรียกใน README (README: "ตัด+สระ" "ทำสี" "ดัด" · ภาพ: "ตัด + สระ" "ทำสีผม" "ดัดผม")
const norm = (s: string) => s.replace(/\s+/g, "");
const BARBER_SVC: { names: string[]; min: number; price: number; dep: number }[] = [
  { names: ["ตัดผมชาย"], min: 45, price: 25000, dep: 0 },
  { names: ["ตัด+สระ"], min: 60, price: 35000, dep: 0 },
  { names: ["ตัดเด็ก"], min: 30, price: 18000, dep: 0 },
  { names: ["โกน/แต่งหนวด"], min: 20, price: 12000, dep: 0 },
  { names: ["ทำสีผม", "ทำสี"], min: 90, price: 90000, dep: 20000 },
  { names: ["ดัดผม", "ดัด"], min: 120, price: 150000, dep: 30000 },
];
const BARBER_STAFF = ["ช่างเอก", "ช่างบอย", "ช่างนุ่น", "ช่างแจ๊ค"]; // sortOrder 1..4 = เก้าอี้
const MASSAGE_STAFF = ["พี่แดง", "พี่นก", "พี่จันทร์", "น้องฝ้าย", "น้องเมย์", "พี่ศรี"];
const MASSAGE_SVC: { names: string[]; min: number; price: number; dep: number; buf: number }[] = [
  { names: ["นวดไทย"], min: 60, price: 35000, dep: 0, buf: 5 },
  { names: ["นวดไทย+ประคบ"], min: 120, price: 80000, dep: 0, buf: 10 },
  { names: ["นวดเท้า"], min: 60, price: 35000, dep: 0, buf: 0 },
  { names: ["น้ำมันอโรมา"], min: 90, price: 90000, dep: 0, buf: 15 },
  { names: ["คู่รักVIP"], min: 90, price: 200000, dep: 50000, buf: 20 },
  { names: ["หินร้อน"], min: 90, price: 120000, dep: 30000, buf: 15 },
];
const DORM_ROOMS = [1, 2, 3].flatMap((f) => Array.from({ length: 12 }, (_, i) => `${f}${String(i + 1).padStart(2, "0")}`));
const DORM_LARGE = new Set(DORM_ROOMS.filter((n) => n.endsWith("01") || n.endsWith("12")));
const HOTEL_RATE: Record<string, number> = {
  B101: 99000, B102: 99000, B103: 99000, B104: 99000,
  B105: 129000, B106: 129000, B107: 129000, B201: 129000, B202: 129000, B203: 129000, B204: 129000, B205: 129000,
  B206: 189000, B207: 189000,
};
const ALL4 = [U.barber, U.massage, U.dorm, U.hotel];
const USERS: { key: string; role: string; units: string[] | "*"; perm?: string }[] = [
  { key: "owner", role: "OWNER", units: "*" },
  { key: "manager", role: "MANAGER", units: [U.barber, U.massage] },
  { key: "ek", role: "STAFF", units: [U.barber], perm: "booking.appointment.setStatus" },
  { key: "cashier", role: "STAFF", units: [U.barber, U.massage], perm: "pos.sale.create" },
  { key: "fai", role: "STAFF", units: [U.dorm], perm: "hotel.room.setStatus" },
  { key: "meter", role: "STAFF", units: [U.dorm] },
  { key: "accountant", role: "STAFF", units: ALL4, perm: "account.report.view" },
  { key: "frontdesk", role: "STAFF", units: [U.hotel], perm: "hotel.reservation.checkIn" },
];
const emailOf = (k: string) => `svc-qc-${k}@shark.local`;
const OTHER_OWNER_EMAIL = "svc-qc-other-owner@shark.local";
const SVC_EMAILS = [...USERS.map((u) => emailOf(u.key)), OTHER_OWNER_EMAIL];

// ═══════════════ ตัวช่วยโปรเซสลูก ═══════════════
const TSX = existsSync(join(ROOT, "node_modules/.bin/tsx")) ? join(ROOT, "node_modules/.bin/tsx") : "";
type RunOut = { code: number | null; out: string; ms: number; timedOut: boolean };
function runScript(file: string, args: string[] = [], env: Record<string, string | undefined> = {}, timeoutMs = 600_000): RunOut {
  const t = Date.now();
  const fullEnv = {} as NodeJS.ProcessEnv;
  for (const [k, v] of Object.entries({ ...process.env, ...env })) if (v !== undefined) fullEnv[k] = v;
  const r = TSX
    ? spawnSync(TSX, [file, ...args], { cwd: ROOT, env: fullEnv, encoding: "utf8", timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 })
    : spawnSync("pnpm", ["exec", "tsx", file, ...args], { cwd: ROOT, env: fullEnv, encoding: "utf8", timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 });
  const timedOut = (r.error as NodeJS.ErrnoException | undefined)?.code === "ETIMEDOUT";
  return { code: r.status, out: `${r.stdout ?? ""}\n${r.stderr ?? ""}`, ms: Date.now() - t, timedOut };
}
const tail = (s: string, n = 300) => s.replace(/\s+/g, " ").trim().slice(-n);
const jsonLine = (out: string, tag: string): unknown => {
  const line = out.split("\n").reverse().find((l) => l.startsWith(`${tag} `));
  if (!line) return null;
  try { return JSON.parse(line.slice(tag.length + 1)); } catch { return null; }
};

const FILES = {
  seed: "scripts/seed-svc-qc.mts",
  smoke: "scripts/qc-svc-smoke.mts",
  visual: "scripts/visual-svc.mts",
  data: "scripts/svc-qc-data.mts",
  template: "ledger/wo-notes/TEMPLATE-svc.md",
};
const has = (f: string) => existsSync(join(ROOT, f));

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 6 });
const q = async <T extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, params: unknown[] = []) => (await pool.query<T>(sql, params)).rows;

// ═══════════════ ลายนิ้วมือ: ทุกตารางที่มี tenantId → ต่อร้าน { จำนวน · updatedAt ล่าสุด } ═══════════════
type FP = Map<string, Map<string, string>>; // tenantId → table → "n|maxUpdated"
let TABLES: { name: string; upd: boolean }[] = [];
async function loadTables() {
  const rows = await q<{ table_name: string; has_upd: boolean }>(
    `SELECT c.table_name, bool_or(c2.column_name IS NOT NULL) AS has_upd
       FROM information_schema.columns c
       JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema AND t.table_type = 'BASE TABLE'
       LEFT JOIN information_schema.columns c2 ON c2.table_name = c.table_name AND c2.table_schema = c.table_schema AND c2.column_name = 'updatedAt'
      WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId'
      GROUP BY c.table_name ORDER BY c.table_name`);
  TABLES = rows.map((r) => ({ name: r.table_name, upd: r.has_upd }));
}
async function fingerprint(): Promise<FP> {
  const fp: FP = new Map();
  const put = (t: string, table: string, v: string) => {
    if (!fp.has(t)) fp.set(t, new Map());
    fp.get(t)!.set(table, v);
  };
  for (const t of TABLES) {
    const sel = t.upd ? `max("updatedAt") AS u` : `NULL::timestamp AS u`;
    const rows = await q<{ tid: string; n: number; u: Date | null }>(`SELECT "tenantId" AS tid, count(*)::int AS n, ${sel} FROM "${t.name}" GROUP BY 1`);
    for (const r of rows) put(r.tid, t.name, `${r.n}|${r.u ? new Date(r.u).toISOString() : "-"}`);
  }
  const tens = await q<{ id: string; u: Date }>(`SELECT id, "updatedAt" AS u FROM "Tenant"`);
  for (const r of tens) put(r.id, "Tenant", `1|${new Date(r.u).toISOString()}`);
  return fp;
}
/** เทียบ fp ของร้านที่กำหนด — คืนรายการต่าง (ตาราง:ก่อน→หลัง) · onlyCount = เทียบจำนวนอย่างเดียว */
function fpDiff(a: FP, b: FP, tenants: string[], onlyCount = false): string[] {
  const out: string[] = [];
  for (const t of tenants) {
    const ma = a.get(t) ?? new Map<string, string>();
    const mb = b.get(t) ?? new Map<string, string>();
    for (const k of new Set([...ma.keys(), ...mb.keys()])) {
      const va = ma.get(k) ?? "0|-";
      const vb = mb.get(k) ?? "0|-";
      const x = onlyCount ? va.split("|")[0] : va;
      const y = onlyCount ? vb.split("|")[0] : vb;
      if (x !== y) out.push(`${t === TA ? "A" : t === TB ? "B" : t.slice(0, 14)}.${k}: ${x}→${y}`);
    }
  }
  return out;
}
async function userFp(beforeTs: Date): Promise<string> {
  const r = await q<{ n: number; u: Date | null }>(
    `SELECT count(*)::int AS n, max("updatedAt") AS u FROM "User" WHERE "createdAt" < $1 AND NOT (email = ANY($2::text[]))`, [beforeTs, SVC_EMAILS]);
  const s = await q<{ n: number }>(
    `SELECT count(*)::int AS n FROM "Session" s JOIN "User" u ON u.id = s."userId" WHERE u."createdAt" < $1 AND NOT (u.email = ANY($2::text[]))`, [beforeTs, SVC_EMAILS]);
  return `users=${r[0].n}|${r[0].u ? new Date(r[0].u).toISOString() : "-"} sessions=${s[0].n}`;
}

// ═══════════════ ค่าที่ข้อสอบแก้ชั่วคราว (คืนใน finally) ═══════════════
const restores: { what: string; sql: string; params: unknown[] }[] = [];

const T_START = new Date();
try {
  await loadTables();

  // ─────────── F: ไฟล์ส่งมอบ ───────────
  console.log("\n── F: ไฟล์ส่งมอบ ──");
  chk("F-1", `มี ${FILES.seed}`, has(FILES.seed), "ยังไม่มีไฟล์");
  chk("F-2", `มี ${FILES.smoke}`, has(FILES.smoke), "ยังไม่มีไฟล์");
  chk("F-3", `มี ${FILES.visual}`, has(FILES.visual), "ยังไม่มีไฟล์");
  chk("F-4", `มี ${FILES.data} (สัญญา SQC · ไม่ import prisma/@/)`, has(FILES.data) && !/from\s+["']@\/|import\(\s*["']@\/|@prisma\/client|lib\/core\/db/.test(readFileSync(join(ROOT, FILES.data), "utf8")),
    has(FILES.data) ? "SQC import prisma/@/ (ต้องเป็นค่าล้วน)" : "ยังไม่มีไฟล์", "MAJOR");
  {
    const ok = has(FILES.template) && (() => {
      const s = readFileSync(join(ROOT, FILES.template), "utf8");
      return ["qc-svc.sh", "qc-svc-smoke", "fitness", "PARITY", "X1", "หนี้"].every((w) => s.includes(w));
    })();
    chk("F-5", `มี ${FILES.template} (อ้าง qc-svc.sh · smoke · fitness · PARITY · X1 · หนี้)`, ok, has(FILES.template) ? "ขาดหัวข้อตามกติกา SVC-RUN §1.4/§2" : "ยังไม่มีไฟล์", "MINOR");
  }
  for (const [id, f] of [["F-6", FILES.seed], ["F-7", FILES.smoke], ["F-8", FILES.visual]] as const) {
    if (!has(f)) { skip(id, `${f} เรียก loadSvcQcEnv ก่อน import @/lib/core/db · ไม่ใช้ .env.qc/acc-v2-env/pos-qc-env`, "ยังไม่มีไฟล์", "MAJOR"); continue; }
    const s = readFileSync(join(ROOT, f), "utf8");
    const iEnv = s.search(/loadSvcQcEnv\s*\(/);
    const iDb = s.search(/["']@\/lib\/core\/db["']/);
    const badEnv = /acc-v2-env|pos-qc-env|loadQcEnv\s*\(|loadPosQcEnv|["']\.env\.qc["']|loadEnvFile\(\s*["']\.env["']/.test(s);
    chk(id, `${f} เรียก loadSvcQcEnv ก่อน import @/lib/core/db · ไม่ใช้ .env.qc/acc-v2-env/pos-qc-env`, iEnv >= 0 && (iDb < 0 || iEnv < iDb) && !badEnv,
      `loadSvcQcEnv@${iEnv} db@${iDb}${badEnv ? " · ใช้ตัวโหลด env ของ RUN อื่น" : ""}`, "MAJOR");
  }
  {
    const s = has(FILES.seed) ? readFileSync(join(ROOT, FILES.seed), "utf8") : "";
    if (!s) skip("F-9", "seed ไม่ถือ gate lock เอง · ไม่เรียก drainAll", "ยังไม่มีไฟล์", "MINOR");
    else chk("F-9", "seed ไม่ถือ gate lock เอง · ไม่เรียก drainAll", !/flock|with-gate-lock|drainAll\s*\(/.test(s), "พบ flock/with-gate-lock/drainAll ใน seed", "MINOR");
  }

  // ─────────── G: ปฏิเสธฐานที่ไม่ใช่ qc-svc ───────────
  console.log("\n── G: seed/smoke/visual ปฏิเสธฐานที่ไม่ใช่ qc-svc ──");
  const FAKE_PW = "SVCR02FAKEPW";
  const fake = (host: string) => `postgresql://qcfake:${FAKE_PW}@${host}/neondb?sslmode=require`;
  const G_CASES: { tag: string; env: Record<string, string> }[] = [
    { tag: "prod", env: { DATABASE_URL: fake("ep-royal-night-qcfake.invalid"), DIRECT_URL: fake("ep-royal-night-qcfake.invalid") } },
    { tag: "QC ของ RUN อื่น", env: { DATABASE_URL: fake("ep-fragrant-thunder-qcfake.invalid"), DIRECT_URL: fake("ep-fragrant-thunder-qcfake.invalid") } },
    { tag: "host อื่น", env: { DATABASE_URL: fake("db.qcfake.invalid"), DIRECT_URL: fake("db.qcfake.invalid") } },
    { tag: "DIRECT ชี้ prod", env: { DIRECT_URL: fake("ep-royal-night-qcfake.invalid") } },
    { tag: "QC_ENV_FILE=.env", env: { QC_ENV_FILE: ".env" } },
  ];
  const guardRun = (id: string, f: string, extraArgs: string[]) => {
    const name = `${f} ปฏิเสธ ${G_CASES.map((c) => c.tag).join(" / ")} ⇒ exit 4 ทุกกรณี · ไม่พิมพ์รหัสผ่าน`;
    if (!has(f)) { skip(id, name, "ยังไม่มีไฟล์"); return; }
    const bad: string[] = [];
    for (const c of G_CASES) {
      const r = runScript(f, extraArgs, { QC_ENV_FILE: ".env.qc-svc", QC_BASE: "http://127.0.0.1:9", ...c.env }, 120_000);
      if (r.code !== 4) bad.push(`${c.tag}: exit ${r.code}${r.timedOut ? " (หมดเวลา)" : ""} ${tail(r.out, 120)}`);
      else if (r.out.includes(FAKE_PW)) bad.push(`${c.tag}: พิมพ์รหัสผ่านออกมา`);
    }
    chk(id, name, bad.length === 0, bad.join(" | "));
  };
  guardRun("G-1", FILES.seed, []);
  guardRun("G-2", FILES.smoke, []);
  guardRun("G-3", FILES.visual, ["r0.2", "--user", "owner", "--base", "http://127.0.0.1:9"]);

  // ─────────── ลายนิ้วมือก่อน ───────────
  const fpBefore = await fingerprint();
  const usersBefore = await userFp(T_START);
  const oldTenants = (await q<{ id: string }>(`SELECT id FROM "Tenant" WHERE "createdAt" < $1 AND NOT (id = ANY($2::text[]))`, [new Date(T_START.getTime() - 2 * 3600_000), SVC_TENANTS])).map((r) => r.id);

  // ─────────── I: seed รอบ 1/2 ───────────
  console.log("\n── I: seed idempotent ──");
  let seeded = false;
  let fp1: FP | null = null;
  if (!has(FILES.seed)) {
    for (const [id, n] of [["I-1", "seed รอบ 1 exit 0"], ["I-2", "seed รอบ 2 exit 0"], ["I-3", "รอบ 2: จำนวนแถวทุกตารางของร้าน SVC เท่ารอบ 1"], ["I-4", "รอบ 2: ไม่มีการเขียน (updatedAt ล่าสุดทุกตารางไม่ขยับ)"],
      ["I-5", "ค่าเพี้ยน 4 จุด (ราคา InvItem · active ช่าง · rentMode B205 · role manager) ⇒ seed คืนค่า + จำนวนแถวคงเดิม"],
      ["O-1", "ร้านอื่น: จำนวนแถว + updatedAt ล่าสุดทุกตารางที่มี tenantId เท่าเดิม"], ["O-2", "ผู้ใช้/เซสชันที่ไม่ใช่ของ SVC เท่าเดิม"],
      ["O-3", "ผู้ใช้ SVC = 9 คนพอดี"]] as const) skip(id, n, "ยังไม่มี seed");
  } else {
    const r1 = runScript(FILES.seed);
    chk("I-1", "seed รอบ 1 exit 0", r1.code === 0, `exit ${r1.code} · ${tail(r1.out)}`);
    seeded = r1.code === 0;
    fp1 = await fingerprint();
    const r2 = runScript(FILES.seed);
    chk("I-2", "seed รอบ 2 exit 0", r2.code === 0, `exit ${r2.code} · ${tail(r2.out)}`);
    const fp2 = await fingerprint();
    const dCount = fpDiff(fp1, fp2, SVC_TENANTS, true);
    chk("I-3", "รอบ 2: จำนวนแถวทุกตารางของร้าน SVC เท่ารอบ 1", seeded && r2.code === 0 && dCount.length === 0, dCount.slice(0, 8).join(" · ") || (seeded ? "" : "seed รอบ 1 ล้ม"));
    const uSvc = async () => (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "User" WHERE email = ANY($1::text[])`, [SVC_EMAILS]))[0].n;
    const dWrite = fpDiff(fp1, fp2, SVC_TENANTS, false);
    chk("I-4", "รอบ 2: ไม่มีการเขียน (updatedAt ล่าสุดทุกตารางของร้าน SVC ไม่ขยับ)", seeded && r2.code === 0 && dWrite.length === 0, dWrite.slice(0, 6).join(" · "), "MAJOR");
    // I-5 ค่าเพี้ยน → seed คืนค่า
    if (!seeded) skip("I-5", "ค่าเพี้ยน ⇒ seed คืนค่า", "seed รอบ 1 ล้ม", "MAJOR");
    else {
      // set = `UPDATE … SET <col> = $2 WHERE id = $1` · restore = เหมือน set แต่แตะเฉพาะเมื่อค่ายังต่างจากเดิม
      const muts: { what: string; read: string; rp: unknown[]; set: string; sp: unknown[]; want: (v: unknown) => boolean }[] = [];
      const guarded = (set: string) => set.replace(/SET ("?\w+"?) = (\$2(?:::"\w+")?) WHERE id = \$1$/, 'SET $1 = $2 WHERE id = $$1 AND $1 IS DISTINCT FROM $2');
      const inv = await q<{ id: string; priceSatang: number }>(
        `SELECT i.id, i."priceSatang" FROM "InvItem" i JOIN "BookingService" b ON b."itemId" = i.id WHERE b."unitId" = $1 AND regexp_replace(b.name,'\\s','','g') = 'ตัดผมชาย' LIMIT 1`, [U.barber]);
      if (inv[0]) muts.push({ what: "InvItem ตัดผมชาย ราคา", read: `SELECT "priceSatang" AS v FROM "InvItem" WHERE id = $1`, rp: [inv[0].id], set: `UPDATE "InvItem" SET "priceSatang" = $2 WHERE id = $1`, sp: [inv[0].id], want: (v) => v === 25000 });
      const jack = await q<{ id: string }>(`SELECT id FROM "BookingStaff" WHERE "unitId" = $1 AND name = 'ช่างแจ๊ค' LIMIT 1`, [U.barber]);
      if (jack[0]) muts.push({ what: "ช่างแจ๊ค active", read: `SELECT active AS v FROM "BookingStaff" WHERE id = $1`, rp: [jack[0].id], set: `UPDATE "BookingStaff" SET active = $2 WHERE id = $1`, sp: [jack[0].id], want: (v) => v === true });
      const b205 = await q<{ id: string }>(`SELECT id FROM "HotelRoom" WHERE "unitId" = $1 AND number = 'B205' LIMIT 1`, [U.hotel]);
      if (b205[0]) muts.push({ what: "B205 rentMode", read: `SELECT "rentMode" AS v FROM "HotelRoom" WHERE id = $1`, rp: [b205[0].id], set: `UPDATE "HotelRoom" SET "rentMode" = $2 WHERE id = $1`, sp: [b205[0].id], want: (v) => v === "MONTHLY" });
      const mgr = await q<{ id: string }>(`SELECT m.id FROM "Membership" m JOIN "User" u ON u.id = m."userId" WHERE u.email = $1 AND m."tenantId" = $2 LIMIT 1`, [emailOf("manager"), TA]);
      if (mgr[0]) muts.push({ what: "manager role", read: `SELECT role::text AS v FROM "Membership" WHERE id = $1`, rp: [mgr[0].id], set: `UPDATE "Membership" SET role = $2::"Role" WHERE id = $1`, sp: [mgr[0].id], want: (v) => v === "MANAGER" });
      if (muts.length < 4) chk("I-5", "ค่าเพี้ยน 4 จุด ⇒ seed คืนค่า", false, `หาแถวเป้าหมายไม่ครบ (${muts.map((m) => m.what).join(", ") || "ไม่มี"}) — ดูข้อ D/U`, "MAJOR");
      else {
        const badVals: Record<string, unknown> = { "InvItem ตัดผมชาย ราคา": 1, "ช่างแจ๊ค active": false, "B205 rentMode": null, "manager role": "STAFF" };
        for (const m of muts) {
          const orig = (await q<{ v: unknown }>(m.read, m.rp))[0]?.v;
          restores.push({ what: m.what, sql: guarded(m.set), params: [...m.sp, orig] });
          await q(m.set, [...m.sp, badVals[m.what]]);
        }
        const fpM = await fingerprint();
        const r3 = runScript(FILES.seed);
        const wrong: string[] = [];
        for (const m of muts) {
          const v = (await q<{ v: unknown }>(m.read, m.rp))[0]?.v;
          if (!m.want(v)) wrong.push(`${m.what}=${JSON.stringify(v)}`);
        }
        const fp3 = await fingerprint();
        const dc = fpDiff(fpM, fp3, SVC_TENANTS, true);
        chk("I-5", "ค่าเพี้ยน 4 จุด (ราคา InvItem · active ช่าง · rentMode B205 · role manager) ⇒ seed คืนค่า + จำนวนแถวคงเดิม",
          r3.code === 0 && wrong.length === 0 && dc.length === 0, `exit ${r3.code} · ยังเพี้ยน: ${wrong.join(", ") || "—"} · แถวต่าง: ${dc.slice(0, 5).join(" · ") || "—"}`, "MAJOR");
      }
    }
    // ร้านอื่น
    console.log("\n── O: ร้านอื่นบน qc-svc ไม่เปลี่ยน ──");
    const fpAfter = await fingerprint();
    const dOther = fpDiff(fpBefore, fpAfter, oldTenants.filter((t) => fpAfter.has(t)), false);
    chk("O-1", `ร้านอื่น ${oldTenants.length} ร้าน: จำนวนแถว + updatedAt ล่าสุดทุกตารางที่มี tenantId เท่าเดิม`, dOther.length === 0, dOther.slice(0, 8).join(" · "));
    const usersAfter = await userFp(T_START);
    chk("O-2", "ผู้ใช้/เซสชันที่ไม่ใช่ของ SVC เท่าเดิม", usersAfter === usersBefore, `${usersBefore} → ${usersAfter}`);
    const svcUsers = await uSvc();
    chk("O-3", "ผู้ใช้ SVC = 9 คนพอดี (8 ร้าน A + เจ้าของร้าน B)", svcUsers === 9, `มี ${svcUsers}`, "MAJOR");
  }

  // ─────────── D: ข้อมูลร้านตัวอย่าง ───────────
  console.log("\n── D: ข้อมูลร้านตัวอย่างตรง README ──");
  {
    const t = await q<{ id: string; slug: string; name: string }>(`SELECT id, slug, name FROM "Tenant" WHERE id = ANY($1::text[])`, [SVC_TENANTS]);
    const ta = t.find((r) => r.id === TA);
    const tb = t.find((r) => r.id === TB);
    chk("D-1", `ร้าน A id ${TA} slug svc-qc ชื่อ "SVC QC" · ร้าน B id ${TB} slug svc-qc-other`, ta?.slug === "svc-qc" && ta?.name === "SVC QC" && tb?.slug === "svc-qc-other",
      `A=${JSON.stringify(ta ?? null)} B=${JSON.stringify(tb ?? null)}`);
    const units = await q<{ id: string; type: string; slug: string; name: string }>(`SELECT id, type::text, slug, name FROM "BusinessUnit" WHERE "tenantId" = $1`, [TA]);
    const uBad = UNITS_A.filter((w) => { const r = units.find((x) => x.id === w.id); return !r || r.type !== w.type || r.slug !== w.slug || r.name !== w.name; }).map((w) => w.id);
    chk("D-2", "ร้าน A มี 4 หน่วยพอดี: barber/massage = BOOKING · dorm = DORM · hotel = HOTEL (id/slug/ชื่อตามใบสั่ง)", units.length === 4 && uBad.length === 0,
      `มี ${units.length} หน่วย · ผิด: ${uBad.join(", ") || "—"}`);

    // บาร์เบอร์
    const hours = await q<{ weekday: number; openMin: number; closeMin: number; closed: boolean }>(`SELECT weekday, "openMin", "closeMin", closed FROM "BookingHours" WHERE "unitId" = $1 ORDER BY weekday`, [U.barber]);
    const hOk = hours.length === 7 && hours.every((h) => (h.weekday === 1 ? h.closed : !h.closed && h.openMin === 600 && h.closeMin === 1200));
    chk("D-3", "บาร์เบอร์ BookingHours 7 วัน: จ. ปิด · อ.–อา. 10:00–20:00", hOk, JSON.stringify(hours).slice(0, 200));
    const staff = await q<{ id: string; name: string; sortOrder: number; active: boolean }>(`SELECT id, name, "sortOrder", active FROM "BookingStaff" WHERE "unitId" = $1 ORDER BY "sortOrder"`, [U.barber]);
    const sOk = staff.length === 4 && BARBER_STAFF.every((n, i) => staff.find((s) => s.name === n)?.sortOrder === i + 1) && staff.every((s) => s.active);
    chk("D-4", "บาร์เบอร์ช่าง 4 คนพอดี active · เก้าอี้ เอก1 บอย2 นุ่น3 แจ๊ค4", sOk, staff.map((s) => `${s.name}#${s.sortOrder}${s.active ? "" : "(ปิด)"}`).join(", ") || "ไม่มีช่าง");
    const sh = await q<{ name: string; weekday: number; startMin: number; endMin: number }>(
      `SELECT s.name, h.weekday, h."startMin", h."endMin" FROM "BookingStaffHours" h JOIN "BookingStaff" s ON s.id = h."staffId" WHERE s."unitId" = $1`, [U.barber]);
    const shBad: string[] = [];
    for (const n of BARBER_STAFF) {
      const rows = sh.filter((r) => r.name === n);
      const start = n === "ช่างแจ๊ค" ? 780 : 600;
      const days = rows.map((r) => r.weekday).sort().join("");
      if (rows.length !== 6 || days !== "023456" || rows.some((r) => r.startMin !== start || r.endMin !== 1200)) shBad.push(`${n}:${rows.length}แถว[${days}]`);
    }
    chk("D-5", "เวลาช่าง: เอก/บอย/นุ่น อ.–อา. 10–20 · แจ๊ค อ.–อา. 13–20 (พาร์ทไทม์)", shBad.length === 0, shBad.join(" "), "MAJOR");

    type SvcRow = { name: string; durationMin: number; priceSatang: number; depositSatang: number; bufferMin: number; active: boolean; bookable: boolean; itemId: string | null };
    const svcOf = (unitId: string) => q<SvcRow>(`SELECT name, "durationMin", "priceSatang", "depositSatang", "bufferMin", active, bookable, "itemId" FROM "BookingService" WHERE "unitId" = $1`, [unitId]);
    const bsv = await svcOf(U.barber);
    const svcBad = (rows: SvcRow[], spec: { names: string[]; min: number; price: number; dep: number; buf?: number }[]) => {
      const bad: string[] = [];
      for (const w of spec) {
        const hit = rows.filter((r) => w.names.includes(norm(r.name)));
        const r = hit[0];
        if (hit.length !== 1) bad.push(`${w.names[0]}:${hit.length}แถว`);
        else if (r.durationMin !== w.min || r.priceSatang !== w.price || r.depositSatang !== w.dep || (w.buf !== undefined && r.bufferMin !== w.buf) || !r.active || !r.bookable)
          bad.push(`${r.name}=${r.durationMin}น/${r.priceSatang}/${r.depositSatang}/buf${r.bufferMin}${r.active ? "" : "/ปิด"}`);
      }
      return bad;
    };
    const b1 = svcBad(bsv, BARBER_SVC);
    chk("D-6", "บาร์เบอร์บริการ 6 พอดี: ตัดผมชาย 45น ฿250 · ตัด+สระ 60 ฿350 · ตัดเด็ก 30 ฿180 · โกน/แต่งหนวด 20 ฿120 · ทำสี 90 ฿900 มัดจำ ฿200 · ดัด 120 ฿1,500 มัดจำ ฿300",
      bsv.length === 6 && b1.length === 0, `มี ${bsv.length} แถว · ${b1.join(" · ")}`);
    const inv = await q<{ ok: number; n: number }>(
      `SELECT count(*) FILTER (WHERE i.id IS NOT NULL AND i."tenantId" = b."tenantId" AND i.kind::text = 'SERVICE' AND i."systemId" = 'svcqc-sys-inv'
               AND i."priceSatang" = b."priceSatang" AND i."durationMin" = b."durationMin" AND i."depositSatang" = b."depositSatang" AND i."bufferMin" = b."bufferMin")::int AS ok,
              count(*)::int AS n
         FROM "BookingService" b LEFT JOIN "InvItem" i ON i.id = b."itemId" WHERE b."unitId" = ANY($1::text[])`, [[U.barber, U.massage]]);
    const links = await q<{ unitId: string; type: string; systemId: string }>(`SELECT "unitId", type::text, "systemId" FROM "AppSystemUnit" WHERE "tenantId" = $1`, [TA]);
    const linkOk = [U.barber, U.massage].every((u) => links.some((l) => l.unitId === u && l.type === "INVENTORY" && l.systemId === "svcqc-sys-inv") && links.some((l) => l.unitId === u && l.type === "POS" && l.systemId === "svcqc-sys-pos"));
    chk("D-7", "บริการทุกตัว (บาร์เบอร์+นวด) มีต้นฉบับ InvItem SERVICE ใน svcqc-sys-inv ค่าเท่ากัน · INVENTORY/POS ผูก barber+massage", inv[0].n === 12 && inv[0].ok === 12 && linkOk,
      `ตรง ${inv[0].ok}/${inv[0].n} (ต้อง 12/12) · ผูกระบบ ${linkOk ? "ครบ" : "ไม่ครบ"}`, "MAJOR");

    // ร้านนวด
    const ms = await q<{ name: string; active: boolean }>(`SELECT name, active FROM "BookingStaff" WHERE "unitId" = $1`, [U.massage]);
    chk("D-8", "ร้านนวดหมอนวด 6 คนพอดี (แดง นก จันทร์ ฝ้าย เมย์ ศรี)", ms.length === 6 && MASSAGE_STAFF.every((n) => ms.some((s) => s.name === n)),
      ms.map((s) => s.name).join(", ") || "ไม่มี", "MAJOR");
    const msv = await svcOf(U.massage);
    const m1 = svcBad(msv, MASSAGE_SVC);
    chk("D-9", "ร้านนวดบริการ 6 พอดี (ภาพ 11: นวดไทย ฿350 · +ประคบ ฿800 · เท้า 60น ฿350 · อโรมา ฿900 · คู่รัก VIP ฿2,000 มัดจำ ฿500 · หินร้อน ฿1,200 มัดจำ ฿300 · buffer ตามภาพ)",
      msv.length === 6 && m1.length === 0, `มี ${msv.length} แถว · ${m1.join(" · ")}`, "MAJOR");

    // หอ
    type RoomRow = { number: string; floorNo: number | null; floor: string | null; active: boolean; rentMode: string | null; bname: string | null; bunit: string | null; bfloors: number | null; tname: string; tunit: string; monthly: number | null; base: number; trent: string; area: string | null };
    const roomsOf = (unitId: string) => q<RoomRow>(
      `SELECT r.number, r."floorNo", r.floor, r.active, r."rentMode", b.name AS bname, b."unitId" AS bunit, b.floors AS bfloors,
              t.name AS tname, t."unitId" AS tunit, t."monthlyRateSatang" AS monthly, t."baseRateSatang" AS base, t."rentMode" AS trent, t."areaSqm"::text AS area
         FROM "HotelRoom" r JOIN "HotelRoomType" t ON t.id = r."roomTypeId" LEFT JOIN "RoomBuilding" b ON b.id = r."buildingId" WHERE r."unitId" = $1`, [unitId]);
    const dr = await roomsOf(U.dorm);
    const drNums = dr.map((r) => r.number).sort();
    const drBad = dr.filter((r) => !r.active || r.floorNo !== Number(r.number[0]) || r.bname !== "อาคาร A" || r.bfloors !== 3 || r.bunit !== U.dorm).map((r) => r.number);
    chk("D-10", "หอ: อาคาร A 3 ชั้น · 36 ห้องพอดี 101–112/201–212/301–312 · floorNo ตามชั้น · active",
      dr.length === 36 && JSON.stringify(drNums) === JSON.stringify([...DORM_ROOMS].sort()) && drBad.length === 0, `มี ${dr.length} ห้อง · ผิด: ${drBad.slice(0, 8).join(",") || "—"}`);
    const rateBad = dr.filter((r) => r.monthly !== (DORM_LARGE.has(r.number) ? 520000 : 450000) || r.trent !== "MONTHLY").map((r) => `${r.number}=${r.monthly}/${r.trent}`);
    const stdArea = dr.filter((r) => !DORM_LARGE.has(r.number)).every((r) => r.area !== null && Number(r.area) === 24);
    const dTypes = new Set(dr.map((r) => r.tname));
    chk("D-11", "หอ: ห้องมาตรฐาน ×30 ฿4,500 (24 ตร.ม.) · ห้องใหญ่หัวมุม x01/x12 ×6 ฿5,200 · ประเภท MONTHLY 2 แบบ",
      dr.length === 36 && rateBad.length === 0 && stdArea && dTypes.size === 2, `ราคาผิด: ${rateBad.slice(0, 6).join(",") || "—"} · 24ตร.ม.=${stdArea} · ประเภท ${dTypes.size}`);

    // โรงแรม
    const hr = await roomsOf(U.hotel);
    const hrBad = hr.filter((r) => HOTEL_RATE[r.number] === undefined || r.base !== HOTEL_RATE[r.number] || !r.active || r.floorNo !== Number(r.number[1]) || r.bname !== "อาคาร B" || r.bfloors !== 2 || r.trent !== "NIGHTLY")
      .map((r) => `${r.number}=${r.base}/ชั้น${r.floorNo}/${r.bname}/${r.trent}`);
    chk("D-12", "โรงแรม: อาคาร B 2 ชั้น · 14 ห้องพอดี · ซูพีเรีย B101–104 ฿990 · ดีลักซ์ B105–107,B201–205 ฿1,290 · แฟมิลี B206–207 ฿1,890 · ประเภท NIGHTLY 3 แบบ",
      hr.length === 14 && hrBad.length === 0 && new Set(hr.map((r) => r.tname)).size === 3, `มี ${hr.length} ห้อง · ผิด: ${hrBad.slice(0, 6).join(" ") || "—"}`);
    const b205 = hr.find((r) => r.number === "B205");
    const othersNull = hr.filter((r) => r.number !== "B205").every((r) => r.rentMode === null);
    chk("D-13", "โรงแรม: B205 rentMode MONTHLY (เช่ารายเดือนผ่านหอ) · อีก 13 ห้อง rentMode null (ตามประเภท)", b205?.rentMode === "MONTHLY" && othersNull,
      `B205=${b205?.rentMode ?? "ไม่มีห้อง"} · ห้องอื่น null ครบ=${othersNull}`);
    const tx = await q<{ n: number }>(
      `SELECT ((SELECT count(*) FROM "RoomOccupancy" WHERE "tenantId" = ANY($1::text[])) + (SELECT count(*) FROM "HotelReservation" WHERE "tenantId" = ANY($1::text[]))
             + (SELECT count(*) FROM "Appointment" WHERE "tenantId" = ANY($1::text[])))::int AS n`, [SVC_TENANTS]);
    chk("D-14", "ใบนี้ไม่มีธุรกรรม (RoomOccupancy/HotelReservation/Appointment = 0 · ใบหลังเติม)", tx[0].n === 0, `มี ${tx[0].n} แถว`, "MINOR");

    // ร้าน B
    const ub = await q<{ id: string; type: string; slug: string }>(`SELECT id, type::text, slug FROM "BusinessUnit" WHERE "tenantId" = $1`, [TB]);
    const bBar = ub.find((u) => u.id === UB.barber);
    const bHot = ub.find((u) => u.id === UB.hotel);
    const bStaff = await q<{ name: string }>(`SELECT name FROM "BookingStaff" WHERE "unitId" = $1`, [UB.barber]);
    const bSvc = await q<{ name: string }>(`SELECT name FROM "BookingService" WHERE "unitId" = $1`, [UB.barber]);
    const bRoom = await q<{ number: string }>(`SELECT number FROM "HotelRoom" WHERE "unitId" = $1`, [UB.hotel]);
    chk("D-15", "ร้าน B: BOOKING slug barber-ari (ช่างเอก 1 · ตัดผมชาย 1) + HOTEL slug bansuan-hotel (ห้อง B205 1) — slug ซ้ำร้าน A โดยตั้งใจ",
      bBar?.type === "BOOKING" && bBar.slug === "barber-ari" && bHot?.type === "HOTEL" && bHot.slug === "bansuan-hotel"
        && bStaff.length === 1 && bStaff[0].name === "ช่างเอก" && bSvc.length === 1 && norm(bSvc[0].name) === "ตัดผมชาย" && bRoom.length === 1 && bRoom[0].number === "B205",
      `หน่วย ${JSON.stringify(ub)} · ช่าง ${bStaff.length} · บริการ ${bSvc.length} · ห้อง ${bRoom.map((r) => r.number).join(",")}`);

    // ความถูกต้องข้ามแถว
    const cross = await q<{ what: string; n: number }>(`
      SELECT 'unit≠tenant:'||x.t AS what, count(*)::int AS n FROM (
        SELECT 'BookingService' t, "tenantId", "unitId" FROM "BookingService" UNION ALL SELECT 'BookingStaff', "tenantId", "unitId" FROM "BookingStaff"
        UNION ALL SELECT 'BookingStaffHours', "tenantId", "unitId" FROM "BookingStaffHours" UNION ALL SELECT 'BookingHours', "tenantId", "unitId" FROM "BookingHours"
        UNION ALL SELECT 'HotelRoomType', "tenantId", "unitId" FROM "HotelRoomType" UNION ALL SELECT 'HotelRoom', "tenantId", "unitId" FROM "HotelRoom"
        UNION ALL SELECT 'RoomBuilding', "tenantId", "unitId" FROM "RoomBuilding") x
        LEFT JOIN "BusinessUnit" u ON u.id = x."unitId" AND u."tenantId" = x."tenantId"
       WHERE x."tenantId" = ANY($1::text[]) AND u.id IS NULL GROUP BY x.t
      UNION ALL
      SELECT 'room↔type/building ต่างหน่วย', count(*)::int FROM "HotelRoom" r JOIN "HotelRoomType" t ON t.id = r."roomTypeId" LEFT JOIN "RoomBuilding" b ON b.id = r."buildingId"
       WHERE r."tenantId" = ANY($1::text[]) AND (t."unitId" <> r."unitId" OR (b.id IS NOT NULL AND b."unitId" <> r."unitId"))
      UNION ALL
      SELECT 'staffHours↔staff ต่างหน่วย', count(*)::int FROM "BookingStaffHours" h JOIN "BookingStaff" s ON s.id = h."staffId"
       WHERE h."tenantId" = ANY($1::text[]) AND (s."unitId" <> h."unitId" OR s."tenantId" <> h."tenantId")
      UNION ALL
      SELECT 'service.itemId ข้ามร้าน', count(*)::int FROM "BookingService" b JOIN "InvItem" i ON i.id = b."itemId"
       WHERE b."tenantId" = ANY($1::text[]) AND i."tenantId" <> b."tenantId"`, [SVC_TENANTS]);
    const crossBad = cross.filter((r) => r.n > 0);
    chk("D-16", "แถวของร้าน SVC ไม่ข้ามหน่วย/ข้ามร้าน (unit↔tenant · ห้อง↔ประเภท/อาคาร · เวลาช่าง↔ช่าง · บริการ↔InvItem)", crossBad.length === 0, crossBad.map((r) => `${r.what}=${r.n}`).join(" · "));
  }

  // ─────────── U: ผู้ใช้ครบบทบาท ───────────
  console.log("\n── U: ผู้ใช้ครบบทบาท ──");
  {
    const ms = await q<{ email: string; tenantId: string; role: string; unitAccess: unknown; permissions: Record<string, unknown> | null; acceptedAt: Date | null }>(
      `SELECT u.email, m."tenantId", m.role::text, m."unitAccess", m.permissions, m."acceptedAt" FROM "Membership" m JOIN "User" u ON u.id = m."userId" WHERE u.email = ANY($1::text[])`, [SVC_EMAILS]);
    const bad: string[] = [];
    for (const w of USERS) {
      const rows = ms.filter((m) => m.email === emailOf(w.key));
      const r = rows[0];
      const ua = Array.isArray(r?.unitAccess) ? (r!.unitAccess as string[]).slice().sort() : [];
      const want = w.units === "*" ? ["*"] : w.units.slice().sort();
      if (rows.length !== 1 || r.tenantId !== TA || r.role !== w.role || JSON.stringify(ua) !== JSON.stringify(want) || !r.acceptedAt)
        bad.push(`${w.key}:${rows.length}mb/${r?.role ?? "-"}/${JSON.stringify(ua)}`);
    }
    chk("U-1", "ผู้ใช้ร้าน A 8 บทบาท (owner manager ek cashier fai meter accountant frontdesk) · role + unitAccess ตามใบสั่ง · 1 membership · acceptedAt", bad.length === 0, bad.join(" "));
    const permBad = USERS.filter((w) => w.perm).filter((w) => {
      const r = ms.find((m) => m.email === emailOf(w.key));
      return !r || r.permissions?.[w.perm!] !== true;
    }).map((w) => `${w.key}:${w.perm}`);
    chk("U-2", "สิทธิ์ขั้นต่ำ: ek booking.appointment.setStatus · cashier pos.sale.create · fai hotel.room.setStatus · accountant account.report.view · frontdesk hotel.reservation.checkIn", permBad.length === 0, `ขาด ${permBad.join(", ")}`, "MAJOR");
    const ob = ms.filter((m) => m.email === OTHER_OWNER_EMAIL);
    chk("U-3", "เจ้าของร้าน B: OWNER ['*'] ในร้าน B เท่านั้น", ob.length === 1 && ob[0].tenantId === TB && ob[0].role === "OWNER", JSON.stringify(ob.map((m) => [m.tenantId, m.role])));
    const leak = await q<{ email: string; tenantId: string }>(
      `SELECT u.email, m."tenantId" FROM "Membership" m JOIN "User" u ON u.id = m."userId"
        WHERE (u.email = ANY($1::text[]) AND m."tenantId" <> $2) OR (u.email = $3 AND m."tenantId" <> $4)
           OR (m."tenantId" = ANY($5::text[]) AND NOT (u.email = ANY($6::text[])))`,
      [USERS.map((u) => emailOf(u.key)), TA, OTHER_OWNER_EMAIL, TB, SVC_TENANTS, SVC_EMAILS]);
    chk("U-4", "ไม่มี membership ข้ามร้าน (ผู้ใช้ A ไม่อยู่ร้าน B/ร้านอื่น · ร้าน SVC ไม่มีสมาชิกนอกชุด)", leak.length === 0, leak.slice(0, 5).map((r) => `${r.email}@${r.tenantId}`).join(", "));
  }

  // ─────────── SM: smoke ───────────
  console.log("\n── SM: qc-svc-smoke ──");
  if (!has(FILES.smoke)) {
    for (const [id, n] of [["SM-1", "smoke exit 0 · JSON_SUMMARY ไม่มี FAIL/SKIP · ≥ 5 ข้อ"], ["SM-2", "smoke อ่านอย่างเดียว (ลายนิ้วมือร้าน SVC เท่าเดิม)"], ["SM-3", "positive control: หน่วย barber เปลี่ยนชนิดชั่วคราว ⇒ smoke แดง"]] as const) skip(id, n, "ยังไม่มี smoke");
  } else {
    const fpS0 = await fingerprint();
    const s1 = runScript(FILES.smoke, [], {}, 300_000);
    const js = jsonLine(s1.out, "JSON_SUMMARY") as { total?: number; failed?: unknown[]; skipped?: unknown[] } | null;
    chk("SM-1", "smoke exit 0 · JSON_SUMMARY ไม่มี FAIL/SKIP · ≥ 5 ข้อ", s1.code === 0 && !!js && (js.total ?? 0) >= 5 && (js.failed?.length ?? 1) === 0 && (js.skipped?.length ?? 1) === 0,
      `exit ${s1.code} · ${js ? JSON.stringify(js).slice(0, 160) : "ไม่มี JSON_SUMMARY"} · ${tail(s1.out, 160)}`);
    const fpS1 = await fingerprint();
    const dS = fpDiff(fpS0, fpS1, SVC_TENANTS, false);
    chk("SM-2", "smoke อ่านอย่างเดียว/คืนสภาพ (ลายนิ้วมือร้าน SVC เท่าเดิม)", dS.length === 0, dS.slice(0, 6).join(" · "), "MAJOR");
    const cur = (await q<{ type: string }>(`SELECT type::text FROM "BusinessUnit" WHERE id = $1`, [U.barber]))[0]?.type;
    if (cur !== "BOOKING") skip("SM-3", "positive control: หน่วย barber เปลี่ยนชนิดชั่วคราว ⇒ smoke แดง", `หน่วย barber ยังไม่ใช่ BOOKING (${cur ?? "ไม่มี"})`, "MAJOR");
    else {
      restores.push({ what: "barber type", sql: `UPDATE "BusinessUnit" SET type = $2::"UnitType" WHERE id = $1 AND type IS DISTINCT FROM $2::"UnitType"`, params: [U.barber, "BOOKING"] });
      await q(`UPDATE "BusinessUnit" SET type = 'SHOP'::"UnitType" WHERE id = $1`, [U.barber]);
      let s2: RunOut;
      try { s2 = runScript(FILES.smoke, [], {}, 300_000); } finally { await q(`UPDATE "BusinessUnit" SET type = 'BOOKING'::"UnitType" WHERE id = $1`, [U.barber]); }
      chk("SM-3", "positive control: หน่วย barber เป็น SHOP ชั่วคราว ⇒ smoke exit ≠ 0 (และไม่ค้าง)", s2.code !== 0 && s2.code !== null, `exit ${s2.code}${s2.timedOut ? " หมดเวลา" : ""}`, "MAJOR");
    }
  }

  // ─────────── V: visual-svc ───────────
  console.log("\n── V: visual-svc ──");
  const SESS_SQL = `SELECT count(*)::int AS n FROM "Session" WHERE "userAgent" LIKE 'qc-visual-svc%'`;
  if (!has(FILES.visual)) {
    for (const [id, n] of [["V-1", "--list r0.2 ⇒ VISUAL_SPECS 3 หน้าเดิม · exit 0"], ["V-2", "ไม่มี --base/QC_BASE ⇒ exit 2"], ["V-3", "--base :3215 ⇒ exit 2"], ["V-4", "--user แปลก ⇒ exit 2"],
      ["V-5", "server ต่อไม่ได้ ⇒ exit 2 ≤ 30 วิ · ไม่ทิ้ง session"]] as const) skip(id, n, "ยังไม่มี visual-svc");
    skip("V-6", "ถ่ายจริง r0.2 owner 3 หน้า × 1440/390 ⇒ exit 0 · ≥ 6 ภาพ · ไม่ทิ้ง session", "ยังไม่มี visual-svc");
  } else {
    const noBase = { QC_BASE: undefined };
    const l = runScript(FILES.visual, ["r0.2", "--list"], noBase, 120_000);
    const specs = jsonLine(l.out, "VISUAL_SPECS") as { name: string; path: string }[] | null;
    const paths = Array.isArray(specs) ? specs.map((s) => s.path.split("?")[0]) : [];
    const want = ["/app/u/barber-ari/booking", "/app/u/barber-ari/booking/services", "/app/u/bansuan-hotel/hotel"];
    chk("V-1", "--list r0.2 ⇒ VISUAL_SPECS = 3 หน้าเดิม (booking · booking/services · hotel) · exit 0", l.code === 0 && paths.length === 3 && want.every((p) => paths.includes(p)),
      `exit ${l.code} · ${JSON.stringify(paths)} · ${tail(l.out, 120)}`, "MAJOR");
    const s0 = (await q<{ n: number }>(SESS_SQL))[0].n;
    const v2 = runScript(FILES.visual, ["r0.2", "--user", "owner"], noBase, 120_000);
    chk("V-2", "ไม่มี --base/QC_BASE ⇒ exit 2 (ไม่มีค่าปริยาย)", v2.code === 2, `exit ${v2.code} · ${tail(v2.out, 120)}`, "MAJOR");
    const v3 = runScript(FILES.visual, ["r0.2", "--user", "owner", "--base", "http://127.0.0.1:3215"], noBase, 120_000);
    chk("V-3", "--base :3215 (เซิร์ฟเวอร์ CRM) ⇒ exit 2", v3.code === 2, `exit ${v3.code} · ${tail(v3.out, 120)}`, "MAJOR");
    const v4 = runScript(FILES.visual, ["r0.2", "--user", "hacker", "--base", "http://127.0.0.1:9"], noBase, 120_000);
    chk("V-4", "--user ไม่รู้จัก ⇒ exit 2", v4.code === 2, `exit ${v4.code} · ${tail(v4.out, 120)}`, "MINOR");
    const t5 = Date.now();
    const v5 = runScript(FILES.visual, ["r0.2", "--user", "owner", "--base", "http://127.0.0.1:9"], noBase, 120_000);
    const s1 = (await q<{ n: number }>(SESS_SQL))[0].n;
    chk("V-5", "server ต่อไม่ได้ ⇒ exit 2 ภายใน 30 วิ (เวลาหลังบูต) · ไม่ทิ้ง session qc-visual-svc", v5.code === 2 && Date.now() - t5 < 60_000 && s1 === s0,
      `exit ${v5.code} · ${Math.round((Date.now() - t5) / 1000)} วิ · session ${s0}→${s1}`, "MAJOR");
    // V-6 ถ่ายจริง — ต้องมี QC server (production build บน .env.qc-svc) · ไม่มี = SKIP (ยอมได้ · ผู้คุมรันเองตอนรับงาน)
    const base = process.env.QC_BASE ?? "";
    let reach = "";
    if (!base) reach = "ไม่ได้ตั้ง QC_BASE (ต้อง build QC server ก่อน — builder ห้าม build)";
    else if (/:3215\b/.test(base)) reach = "QC_BASE เป็น :3215 (CRM) — ไม่ใช่ server ของ SVC";
    else {
      try { const r = await fetch(`${base}/`, { signal: AbortSignal.timeout(8000), redirect: "manual" }); if (r.status >= 500) reach = `server ตอบ ${r.status}`; }
      catch (e) { reach = `ต่อ ${base} ไม่ได้ (${errMsg(e).slice(0, 60)})`; }
    }
    if (reach) skip("V-6", "ถ่ายจริง r0.2 owner 3 หน้า × 1440/390 ⇒ exit 0 · ≥ 6 ภาพใหม่ · ไม่ทิ้ง session", reach, "MAJOR", true);
    else {
      const dir = join(ROOT, ".qc-shots/svc/r0.2");
      const t6 = Date.now();
      const v6 = runScript(FILES.visual, ["r0.2", "--user", "owner", "--base", base], {}, 900_000);
      const pngs = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".png")).filter((f) => { const s = statSync(join(dir, f)); return s.mtimeMs >= t6 - 1000 && s.size > 10_000; }) : [];
      const s2 = (await q<{ n: number }>(SESS_SQL))[0].n;
      chk("V-6", "ถ่ายจริง r0.2 owner 3 หน้า × 1440/390 ⇒ exit 0 · ≥ 6 ภาพใหม่ (> 10 KB) · ไม่ทิ้ง session", v6.code === 0 && pngs.length >= 6 && s2 === s0,
        `exit ${v6.code} · ภาพใหม่ ${pngs.length} · session ${s0}→${s2} · ${tail(v6.out, 200)}`, "MAJOR");
    }
  }
} catch (e) {
  chk("CRASH", "จบกลางทาง: " + errMsg(e), false);
} finally {
  for (const r of restores.reverse()) {
    try {
      // คืนเฉพาะเมื่อค่ายังเพี้ยน (seed/บล็อกเดิมคืนแล้ว = ไม่แตะ)
      await q(r.sql, r.params);
    } catch (e) { console.log(`  ⚠️ คืนค่า ${r.what} ไม่สำเร็จ: ${errMsg(e)}`); }
  }
  await pool.end();
}

const failed = cks.filter((c) => c.res === "FAIL");
const skipped = cks.filter((c) => c.res === "SKIP");
const blockingSkip = skipped.filter((c) => !c.allowSkip);
const passed = cks.length - failed.length - skipped.length;
console.log(`\n===== QC SVC R0.2 · ข้อมูล QC + เครื่องมือ =====\nผ่าน ${passed}/${cks.length}${skipped.length ? ` (SKIP ${skipped.length}${skipped.length > blockingSkip.length ? ` · ยอมได้ ${skipped.length - blockingSkip.length}: ต้องมี QC server` : ""})` : ""}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), allowedSkip: skipped.filter((c) => c.allowSkip).map((c) => c.id), findings: [...failed, ...blockingSkip].map((c) => c.id) })}`);
// รับใบ = ไม่มี FAIL และไม่มี SKIP นอกจาก V-6 (ไม่มี QC server — ผู้คุมรันเองตอนรับงาน)
process.exit(failed.length + blockingSkip.length > 0 ? 1 : 0);
