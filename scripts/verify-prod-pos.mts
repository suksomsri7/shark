// verify-prod-pos.mts — POS P6.1 · ตรวจฐานข้อมูลหลัง deploy แบบ "อ่านอย่างเดียว" (แทน scripts/prodmig.cjs ที่ hard-code member/kanban · มติ P6 §10-3)
//
// ตรวจอะไร (พิมพ์ทุกข้อด้วย --list):
//   G*  ด่านเป้าหมาย: host อยู่ใน allowlist · prod ต้องตั้ง ALLOW_PROD_AUDIT=1 เอง · QC4 ใช้ได้เฉพาะ --self-test
//   RO  ธุรกรรมอ่านอย่างเดียวมีผลจริง (SHOW transaction_read_only = on) · --self-test ลองเขียน 1 ครั้งแล้วต้องโดนปฏิเสธ 25006 (positive control)
//   M*  _prisma_migrations: POS migration ทุกไฟล์ในทรีนี้ apply แล้ว · ไม่มีแถวค้าง/ล้ม · ฐานมี migration POS ที่ทรีนี้ไม่รู้จัก = เตือน
//   T/C/E/I  ตาราง · คอลัมน์ · ค่า enum · index ที่ POS migration สร้าง — คาดการณ์แบบสถิต (แกะ prisma/migrations/*_pos_* + prisma/schema/*.prisma ของทรีนี้ตอนรัน)
//   X*  index มือ CREATE INDEX CONCURRENTLY ของ runbook §5 (ยังไม่สร้าง = เตือน · สร้างแล้วแต่ indisvalid=false = ล้ม)
//   S*  ความสมเหตุผลของข้อมูล (นับอย่างเดียว): สต็อกติดลบ · บรรทัดบิลกำพร้า · การกระจายธง registerV2 · คีย์ค่าตั้ง credit/offline/… · ลิงก์แคตตาล็อก · คิว outbox pos.* · OpsEvent ERROR 24 ชม.
//   V1  env: พิมพ์ "ชื่อ" ที่ POS อ่าน ว่าตั้ง/ไม่ตั้ง ในโปรเซสนี้ — ไม่พิมพ์ค่าเด็ดขาด (env ของ Vercel ต้องดูใน dashboard — runbook §6)
//
// โหมดเพิ่ม (P6.1 fix1):
//   --counts  (CD-P61-R5 · R1 F5 · W33) ก่อน migrate ได้: จำนวนแถว (reltuples + count(*) จำกัดเวลา) ของตารางที่ตัดสินกลยุทธ์ index ใน runbook §3.2
//             + การกระจาย registerV2 + จำนวนที่โดน "พฤติกรรมที่เปลี่ยนตอน deploy โดยไม่มีธง" (runbook §4.5 · CD-P61-R4) — ทุกคิวรีอยู่ใน SAVEPOINT ของตัวเอง
//             ตารางที่ยังไม่มี (ก่อน migrate) = รายงาน "ยังไม่มีตาราง" ไม่ล้ม · อ่านอย่างเดียวเหมือนโหมดอื่น · prod ต้อง ALLOW_PROD_AUDIT=1 · QC4 ใช้ได้
//   --crons   (CD-P61-R6 · R1 F6 · W34) ไม่แตะ DB: crontab ของเครื่องนี้มีบรรทัด crm-cron ครบ 3 (minute/hourly/daily) ตามหัวไฟล์ scripts/crm-cron.mts ไหม ·
//             checkout ที่บรรทัดนั้น `cd` เข้าไป อยู่ที่ SHA เดียวกับ origin/main (ref ในเครื่อง — `git fetch` ก่อน) ไหม · มีงาน pos.* ในโค้ดของ checkout นั้นไหม
//             พิมพ์แค่ "ตาราง 5 ช่อง + โหมด + path" ของบรรทัด crontab (ส่วนอื่นของบรรทัดอาจมีความลับ — ไม่พิมพ์) · --post-merge = ตามไม่ทัน/ไม่มีงาน pos.* เป็น FAIL
//
// 🔴 ไม่เขียนอะไรเลย: ทุกคิวรีผ่าน q() ที่รับเฉพาะ SELECT/WITH/SHOW คำสั่งเดียว · อยู่ใน BEGIN → SET TRANSACTION READ ONLY → … → ROLLBACK
//    (ขอบเขต = ธุรกรรมนี้เท่านั้น ไม่ใช่ SET ระดับ session ที่รั่วข้าม client บน pooler) · SET LOCAL statement_timeout/lock_timeout กันการรอล็อกบน prod
//    ข้อยกเว้นเดียว = probe ของ --self-test (QC4 เท่านั้น) ที่ "ลอง" CREATE TEMP TABLE ใน SAVEPOINT เพื่อพิสูจน์ว่าฐานปฏิเสธจริง
// 🔴 ไม่โหลดไฟล์ .env ใด ๆ — ใช้ DATABASE_URL ที่ผู้เรียกส่งมาเท่านั้น (ไม่มี = หยุด) · ห้ามพิมพ์ URL/รหัสผ่าน (พิมพ์แค่ป้าย host)
//
// รัน
//   --list       : bash scripts/iso.sh pnpm exec tsx scripts/verify-prod-pos.mts --list            (ไม่แตะ DB)
//   --self-test  : bash scripts/iso.sh bash scripts/qc4.sh env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh pnpm exec tsx scripts/verify-prod-pos.mts --self-test
//   --counts     : (QC4) เหมือน --self-test แต่ใช้ --counts · (prod ⛔) env ALLOW_PROD_AUDIT=1 DATABASE_URL="$PROD_DIRECT_URL" … --counts
//   --crons      : bash scripts/iso.sh pnpm exec tsx scripts/verify-prod-pos.mts --crons [--post-merge]   (ไม่ต้องมี DATABASE_URL)
//   prod (⛔ เจ้าของสั่งเอง · runbook §10) : iso.sh ไม่ส่ง env ของผู้เรียก ⇒ ตั้งตัวแปรหลัง iso.sh ด้วย `env ALLOW_PROD_AUDIT=1 DATABASE_URL="$PROD_DIRECT_URL" …`
//                  ไม่มี --self-test · ไม่ต้องใช้ gate lock ของ QC
// exit: 0 = ไม่มีข้อ FAIL (WARN ได้) · 1 = มี FAIL · 2 = ไม่มี DATABASE_URL/ใช้ผิด · 4 = ด่านเป้าหมายปฏิเสธ
// บรรทัดท้าย = `JSON_SUMMARY {...}` (total · passed · fail · warn · ids ที่ล้ม/เตือน · ป้าย host · โหมด)
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const SUITE = "verify-prod-pos";
const ROOT = process.cwd();
const ARGV = process.argv.slice(2);
const LIST = ARGV.includes("--list");
const SELF = ARGV.includes("--self-test");
const COUNTS = ARGV.includes("--counts"); // P6.1 fix1 CD-P61-R5
const CRONS = ARGV.includes("--crons"); // P6.1 fix1 CD-P61-R6
const POST_MERGE = ARGV.includes("--post-merge");
const KNOWN_FLAGS = new Set(["--list", "--self-test", "--counts", "--crons", "--post-merge"]);
for (const a of ARGV) {
  if (!KNOWN_FLAGS.has(a)) {
    console.error(`🔴 ${SUITE}: ไม่รู้จัก ${a} (ใช้ได้: --list · --self-test · --counts · --crons [--post-merge])`);
    process.exit(2);
  }
}
if ([SELF, COUNTS, CRONS].filter(Boolean).length > 1 || (POST_MERGE && !CRONS)) {
  console.error(`🔴 ${SUITE}: เลือกได้โหมดเดียว (--self-test | --counts | --crons) · --post-merge ใช้คู่กับ --crons เท่านั้น`);
  process.exit(2);
}
export type Mode = "audit" | "self-test" | "counts";
const MODE: Mode = SELF ? "self-test" : COUNTS ? "counts" : "audit";
/** จำนวนแถวที่เกินแล้ว index ในไฟล์ migration ต้องเปลี่ยนเป็นทางมือ CONCURRENTLY (มติ addendum 2 P1 · W33 · runbook §3.2) */
export const COUNT_THRESHOLD = 100_000;
/** ตารางที่ตัดสินกลยุทธ์ index ของ runbook §3.2 (ทาง = ข้อย่อยใน §3.2) + ตารางเดิมอื่นที่ POS migration แตะ (ข้อมูลประกอบ) */
export const COUNT_TABLES: readonly { table: string; path: string }[] = [
  { table: "PosSale", path: "p111+p34 = ทางมือ (§3.2 ทาง ข) · #37 = resolve ก่อน + §5 (§3.2 ทาง ง)" },
  { table: "RestaurantOrder", path: "p26_kds = สร้าง index ล่วงหน้า CONCURRENTLY (§3.2 ทาง ค)" },
  { table: "GiftCard", path: "p29_tenders = สร้าง index ล่วงหน้า CONCURRENTLY (§3.2 ทาง ค)" },
  { table: "PosSaleLine", path: "#37 = resolve ก่อน + §5 (§3.2 ทาง ง)" },
  { table: "ShopProduct", path: "#37 = resolve ก่อน + §5 (§3.2 ทาง ง)" },
  { table: "ShopOrderLine", path: "#37 = resolve ก่อน + §5 (§3.2 ทาง ง)" },
  { table: "MenuItem", path: "#37 = resolve ก่อน + §5 (§3.2 ทาง ง)" },
  { table: "RestaurantOrderItem", path: "#37 = resolve ก่อน + §5 (§3.2 ทาง ง)" },
  { table: "InvItem", path: "#37 = resolve ก่อน + §5 (§3.2 ทาง ง)" },
  { table: "PosPayment", path: "" },
  { table: "AccountDocument", path: "" },
  { table: "RestaurantTable", path: "" },
  { table: "RestaurantSetting", path: "" },
  { table: "TableSession", path: "" },
];
const CRON_MODES = ["minute", "hourly", "daily"] as const;

// ═════════════════════════ allowlist ของ host (ข้อมูล — ไม่ใช่การเชื่อมต่อ) ═════════════════════════
/** mark = ส่วนหน้าของ Neon endpoint id (label แรกของ hostname เริ่มด้วย mark + "-") · ไม่มีรหัสผ่าน/URL เต็มในรีโป */
// host ซ้อม (W31 · CD-P61-P3 · R1 F16): ผู้คุมเพิ่ม { mark: "<endpoint ของ branch ซ้อม>", role: "rehearsal" } ใน commit วันเดียวกันแล้วลบหลังลบ branch —
//   **role ใหม่ ห้ามใช้ role prod** · rehearsal = กติกาเดียวกับ prod (ต้อง ALLOW_PROD_AUDIT=1 · ไม่มี --self-test) — G2 มีกรณีทดสอบ
export type HostRole = "prod" | "qc4" | "rehearsal";
export type AllowHost = { mark: string; role: HostRole; note: string };
export const HOST_ALLOWLIST: readonly AllowHost[] = [
  { mark: "ep-royal-night", role: "prod", note: "Neon branch production (PROD_HOST_MARK ใน scripts/qc-env-guard.mts · qc4.sh/qc-prisma.sh ปฏิเสธ host นี้)" },
  { mark: "ep-frosty-lab", role: "qc4", note: "QC4 wo-pos-qc4 (scripts/qc4.sh) — ใช้ได้เฉพาะ --self-test" },
];

type Target = { ok: true; role: HostRole; label: string } | { ok: false; code: string; reason: string };
const normUrl = (v: string): string => {
  let x = v;
  for (let i = 0; i < 5; i++) {
    let dd = x;
    try {
      dd = decodeURIComponent(x);
    } catch {
      /* ทิ้งไว้แบบเดิม */
    }
    if (dd === x) break;
    x = dd;
  }
  return x.trim();
};
/** ตัวตัดสินเป้าหมาย (บริสุทธิ์ · --self-test เรียกด้วยชุดทดสอบปลอมด้วย) */
export function decideTarget(env: Record<string, string | undefined>, mode: Mode, allow: readonly AllowHost[] = HOST_ALLOWLIST): Target {
  const selfTest = mode === "self-test";
  const raw = env.DATABASE_URL ?? "";
  if (!raw) return { ok: false, code: "NO_URL", reason: "ไม่มี DATABASE_URL" };
  if (env.PGHOST || env.PGHOSTADDR) return { ok: false, code: "PGHOST", reason: "ตั้ง PGHOST/PGHOSTADDR อยู่ — ไดรเวอร์อาจไปคนละ host กับ URL" };
  let u: URL;
  try {
    u = new URL(normUrl(raw));
  } catch {
    return { ok: false, code: "BAD_URL", reason: "อ่าน DATABASE_URL ไม่ได้" };
  }
  if (u.protocol !== "postgres:" && u.protocol !== "postgresql:") return { ok: false, code: "BAD_URL", reason: "ไม่ใช่ postgres URL" };
  for (const k of ["host", "hostaddr"]) if (u.searchParams.has(k)) return { ok: false, code: "HOST_PARAM", reason: `URL มี ?${k}= (ห้ามชี้ host ซ้อน)` };
  const label = u.hostname.toLowerCase().split(".")[0] ?? "";
  const hit = allow.find((h) => label === h.mark || label.startsWith(`${h.mark}-`));
  if (!hit) return { ok: false, code: "NOT_ALLOWLISTED", reason: `host ${label || "(ว่าง)"} ไม่อยู่ใน allowlist` };
  // DIRECT_URL ที่ตั้งมาด้วยต้องเป็น host บทบาทเดียวกัน (กันสภาพ "อ่านที่หนึ่ง เขียน/migrate อีกที่")
  const direct = env.DIRECT_URL ? normUrl(env.DIRECT_URL).toLowerCase() : "";
  for (const h of allow) if (h.role !== hit.role && direct.includes(h.mark)) return { ok: false, code: "MIXED", reason: "DIRECT_URL ชี้ host คนละบทบาทกับ DATABASE_URL" };
  if (hit.role === "prod" || hit.role === "rehearsal") {
    if (selfTest) return { ok: false, code: "SELFTEST_ON_PROD", reason: "--self-test รันบน QC4 เท่านั้น (prod/branch ซ้อม = โหมดตรวจ หรือ --counts)" };
    if (env.ALLOW_PROD_AUDIT !== "1") return { ok: false, code: "NO_ALLOW", reason: `host = ${hit.role} — ต้องตั้ง ALLOW_PROD_AUDIT=1 เอง (สคริปต์อ่านอย่างเดียว)` };
    return { ok: true, role: hit.role, label: `${hit.mark}…` };
  }
  // QC4 = ฐานข้อสอบ: โหมดตรวจเต็มไม่ได้ (กันอ่านผลผิดว่าเป็น prod) · --self-test / --counts ได้ (อ่านอย่างเดียว)
  if (mode === "audit") return { ok: false, code: "QC4_NEEDS_SELFTEST", reason: "QC4 ใช้ได้เฉพาะ --self-test หรือ --counts" };
  return { ok: true, role: "qc4", label: `${hit.mark}…` };
}

// ═════════════════════════ ความคาดหวังแบบสถิต (แกะ SQL + schema ของทรีนี้) ═════════════════════════
type MigInfo = { name: string; tables: string[]; cols: [string, string][]; types: string[]; enumAdds: [string, string][]; indexes: [string, string][] };
const MIG_DIR = join(ROOT, "prisma", "migrations");
const POS_MIG_RE = /^\d{14}_pos_[a-z0-9_]+$/;
function stripSqlComments(s: string): string {
  return s.replace(/--[^\n]*/g, "");
}
export function parseMigration(name: string, sqlRaw: string): MigInfo {
  const s = stripSqlComments(sqlRaw);
  const tables = [...s.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?"(\w+)"/gi)].map((m) => m[1] as string);
  const types = [...s.matchAll(/CREATE TYPE "(\w+)"/gi)].map((m) => m[1] as string);
  const enumAdds = [...s.matchAll(/ALTER TYPE "(\w+)" ADD VALUE (?:IF NOT EXISTS )?'(\w+)'/gi)].map((m) => [m[1], m[2]] as [string, string]);
  const cols: [string, string][] = [];
  for (const m of s.matchAll(/ALTER TABLE (?:ONLY )?"(\w+)"\s+([\s\S]*?);/gi)) {
    for (const c of (m[2] as string).matchAll(/ADD COLUMN\s+(?:IF NOT EXISTS\s+)?"(\w+)"/gi)) cols.push([m[1] as string, c[1] as string]);
  }
  const indexes = [...s.matchAll(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF NOT EXISTS\s+)?"(\w+)"\s+ON\s+"(\w+)"/gi)].map((m) => [m[1], m[2]] as [string, string]);
  return { name, tables, cols, types, enumAdds, indexes };
}
function loadPosMigrations(): MigInfo[] {
  if (!existsSync(MIG_DIR)) return [];
  return readdirSync(MIG_DIR)
    .filter((d) => POS_MIG_RE.test(d) && existsSync(join(MIG_DIR, d, "migration.sql")))
    .sort()
    .map((d) => parseMigration(d, readFileSync(join(MIG_DIR, d, "migration.sql"), "utf8")));
}
type SchemaModel = { file: string; scalars: string[] };
const PRISMA_SCALARS = new Set(["String", "Int", "BigInt", "Float", "Decimal", "Boolean", "DateTime", "Json", "Bytes"]);
function loadSchema(): { models: Map<string, SchemaModel>; enums: Map<string, string[]> } {
  const dir = join(ROOT, "prisma", "schema");
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".prisma")) : [];
  const enums = new Map<string, string[]>();
  const rawModels: { name: string; file: string; body: string }[] = [];
  for (const f of files) {
    const t = readFileSync(join(dir, f), "utf8");
    for (const m of t.matchAll(/^enum (\w+) \{([\s\S]*?)^\}/gm)) {
      const vals = (m[2] as string)
        .split("\n")
        .map((l) => l.replace(/\/\/.*$/, "").trim())
        .filter((l) => /^[A-Za-z_]\w*$/.test(l));
      enums.set(m[1] as string, vals);
    }
    for (const m of t.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) rawModels.push({ name: m[1] as string, file: f, body: m[2] as string });
  }
  const modelNames = new Set(rawModels.map((m) => m.name));
  const models = new Map<string, SchemaModel>();
  for (const m of rawModels) {
    const scalars: string[] = [];
    for (const line of m.body.split("\n")) {
      const l = line.replace(/\/\/.*$/, "").trim();
      const fm = /^(\w+)\s+(\w+)(\[\])?(\?)?(\s|$)/.exec(l);
      if (!fm || l.startsWith("@@")) continue;
      const type = fm[2] as string;
      if (modelNames.has(type)) continue; // ฟิลด์ relation ไม่ใช่คอลัมน์
      if (PRISMA_SCALARS.has(type) || enums.has(type)) scalars.push(fm[1] as string);
    }
    models.set(m.name, { file: m.file, scalars });
  }
  return { models, enums };
}

/** index มือของ runbook §5 (CREATE INDEX CONCURRENTLY นอก prisma migrate) — ชื่อตามแบบ prisma เพื่อให้ @@index ในอนาคตไม่ drift */
export const HAND_INDEXES: readonly { name: string; table: string; cols: string[]; unique?: boolean; where?: string; src: string }[] = [
  { name: "ShopProduct_posProductId_idx", table: "ShopProduct", cols: ["posProductId"], src: "P1.1a M1 · ecommerce.prisma:29" },
  { name: "ShopOrderLine_posProductId_idx", table: "ShopOrderLine", cols: ["posProductId"], src: "P1.1a M1 · ecommerce.prisma:71" },
  { name: "PosSaleLine_productId_idx", table: "PosSaleLine", cols: ["productId"], src: "P1.1a M1 · pos.prisma:186" },
  { name: "MenuItem_posProductId_idx", table: "MenuItem", cols: ["posProductId"], src: "P1.1a M1 · restaurant.prisma:187" },
  { name: "RestaurantOrderItem_productId_idx", table: "RestaurantOrderItem", cols: ["productId"], src: "P1.1a M1 · restaurant.prisma:469" },
  { name: "InvItem_tenantId_barcode_idx", table: "InvItem", cols: ["tenantId", "barcode"], src: "P1.1a notes :369 (byBarcode UNION ขาที่สอง)" },
  { name: "PosSale_shiftId_idx", table: "PosSale", cols: ["shiftId"], src: "P1.9 · pos.prisma:91" },
  { name: "PosSale_refSaleId_idx", table: "PosSale", cols: ["refSaleId"], src: "P1.8 · pos.prisma:100" },
  { name: "PosSale_channelId_idx", table: "PosSale", cols: ["channelId"], src: "P2.1 · pos.prisma:126 · TL-6" },
  { name: "PosSaleLine_refLineId_idx", table: "PosSaleLine", cols: ["refLineId"], src: "P1.8 · migration pos_p18_refund:4" },
  { name: "PosSale_customerPartyId_idx", table: "PosSale", cols: ["customerPartyId"], src: "P3.6 · pos.prisma:142 · migration pos_p36_credit:2" },
  { name: "PosSale_crmDealId_idx", table: "PosSale", cols: ["crmDealId"], src: "P3.6 · migration pos_p36_credit:2 (sweepDealIntents รายชั่วโมง)" },
  { name: "PosOrderLine_orderId_idx", table: "PosOrderLine", cols: ["orderId"], src: "TL-6 (HANDOVER-P2 :218)" },
  { name: "PosOrderEvent_orderId_idx", table: "PosOrderEvent", cols: ["orderId"], src: "TL-6 (HANDOVER-P2 :218)" },
  { name: "one_open_session_per_table", table: "TableSession", cols: ["tableId"], unique: true, where: `"status" = 'OPEN'`, src: "P2.4 มติ Q9 · restaurant.prisma:356 · TL-6" },
];

/** env ที่โค้ด POS อ่าน (E1 ของ qc-pos-p6.1 ตรวจว่าครบ) + กุญแจที่ runbook §6 สั่งตั้ง — พิมพ์ชื่อเท่านั้น */
export const ENV_NAMES: readonly { name: string; why: string }[] = [
  { name: "POS_CREDENTIALS_KEY", why: "W4 — กุญแจเข้ารหัส creds แพลตฟอร์ม/สลิป/e-Tax (secret-box) · ตั้งก่อนวาง creds" },
  { name: "POS_DEVICE_KEY", why: "W40 · CD-P61-R2 — กุญแจลงนามคุกกี้จับคู่เครื่องขาย (device-cookie.ts · ≥ 32 ตัว) · ตั้งบน Vercel ก่อน migrate (runbook ขั้น 1)" },
  { name: "APP_URL", why: "ลิงก์ใบเสร็จออนไลน์ /r · QR · webhook" },
  { name: "SESSION_SECRET", why: "โทเคนพนักงาน/จอลูกค้า (มีอยู่แล้วบน prod)" },
  { name: "CRON_SECRET", why: "route /api/cron/* (hourly · outbox) — ของเดิมของแพลตฟอร์ม" },
];

// ═════════════════════════ ทะเบียนข้อ ═════════════════════════
type Status = "OK" | "WARN" | "FAIL" | "INFO";
const CHECKS: readonly [string, string][] = [
  ["G1", "ด่านเป้าหมาย: host ใน allowlist · prod/ซ้อม ต้อง ALLOW_PROD_AUDIT=1 · QC4 เฉพาะ --self-test หรือ --counts"],
  ["G2", "--self-test: ชุดทดสอบปลอมของ decideTarget ปฏิเสธ/อนุญาตตรงทุกกรณี (ไม่แตะ DB)"],
  ["RO", "ธุรกรรมอ่านอย่างเดียวมีผล (SHOW transaction_read_only = on · --self-test: ลองเขียนแล้วโดน 25006)"],
  ["P0", "รุ่น Postgres ≥ 11 (ADD COLUMN … NOT NULL DEFAULT ค่าคงที่ = metadata-only) — แสดงรุ่น"],
  ["M1", "POS migration ทุกไฟล์ในทรี apply แล้ว (finished_at มีค่า · rolled_back_at ว่าง)"],
  ["M2", "ไม่มีแถว _prisma_migrations ที่ค้าง/ล้ม (finished_at ว่าง และไม่ได้ rolled back) ทั้งฐาน"],
  ["M3", "ฐานไม่มี migration POS ที่ทรีนี้ไม่รู้จัก (มี = เตือน: โค้ดเก่ากว่าฐาน)"],
  ["T1", "ตารางที่ POS migration สร้างมีครบ (และมี model ใน prisma/schema)"],
  ["C1", "คอลัมน์ครบ: ตารางใหม่ = ทุกฟิลด์ scalar ของ model · ตารางเดิม = คอลัมน์ที่ POS migration เพิ่ม"],
  ["E1", "ค่า enum ของ type ที่ POS migration สร้าง/เพิ่มค่า มีครบตาม schema"],
  ["I1", "index ที่ POS migration สร้างมีครบและ indisvalid"],
  ["X1", "index มือ CONCURRENTLY (runbook §5): ยังไม่สร้าง = เตือน · สร้างแล้วต้อง valid · นับแถว TableSession OPEN ซ้ำโต๊ะ"],
  ["S1", "สต็อกติดลบ (InvItem.onHand < 0 · InvLocationStock.onHand < 0) — นับ (เตือนเมื่อ > 0: ร้านที่ยอมขายเกินได้)"],
  ["S2", "บรรทัดกำพร้า: PosSaleLine/PosPayment ไม่มี PosSale · PosSaleLineOption ไม่มีบรรทัด = 0"],
  ["S3", "การกระจายธง settings.pos.registerV2 ของระบบ POS (true / ไม่ใช่ true)"],
  ["S4", "คีย์ค่าตั้ง POS ที่มีอยู่: credit · offline · shift.required · board · ai · chat · deposit"],
  ["S5", "ลิงก์แคตตาล็อก: PosProduct · MenuItem/ShopProduct ที่ posProductId ว่าง/มีค่า · InvItem PRODUCT ที่ยังไม่มี PosProduct"],
  ["S6", "คิว outbox pos.* (PENDING · FAILED) — FAILED > 0 = เตือน"],
  ["S7", "OpsEvent ERROR 24 ชม.ล่าสุด — > 0 = เตือน (C6.1: ต้อง 0 ตลอด 24 ชม. หลัง deploy)"],
  ["S8", "แถว creds (PosIntegrationCredential) · print agent · ช่องทางขาย — นับ (creds > 0 ต้องมี POS_CREDENTIALS_KEY บน Vercel)"],
  ["N1", "--self-test: canary — ตาราง/คอลัมน์/index/migration ปลอมต้องถูกรายงานว่าไม่มี และของจริง (PosSale.publicToken · PosSale_publicToken_key) ต้องเจอ"],
  ["V1", "env ที่ POS อ่าน: ตั้ง/ไม่ตั้งในโปรเซสนี้ (ชื่อเท่านั้น · ไม่พิมพ์ค่า)"],
];
/** --counts (CD-P61-R5 · W33): ก่อน migrate ได้ · ทุกข้อเป็นตัวเลขให้เจ้าของ/ผู้คุมตัดสินตามตาราง runbook §3.2 และ §4.5 */
const COUNT_CHECKS: readonly [string, string][] = [
  ["G1", "ด่านเป้าหมาย: host ใน allowlist · prod ต้อง ALLOW_PROD_AUDIT=1 · QC4 ได้ (--counts อ่านอย่างเดียว)"],
  ["RO", "ธุรกรรมอ่านอย่างเดียวมีผล (SHOW transaction_read_only = on)"],
  ["K1", `จำนวนแถว (reltuples + count(*) จำกัดเวลา) ตารางที่ตัดสินกลยุทธ์ index runbook §3.2 · เกิน ${COUNT_THRESHOLD.toLocaleString("en-US")} = เตือน + บอกทาง`],
  ["K2", "การกระจายธง settings.pos.registerV2 (active/ไม่ active × true/ไม่ใช่) — จำนวนระบบที่ §8.5 จะตั้ง shift.required.register=false"],
  ["K3", "พฤติกรรมที่เปลี่ยนตอน deploy โดยไม่มีธง (runbook §4.5 · CD-P61-R4): (a) สาขาร้านอาหารที่ผูก POS active · (b) มัดจำโมดูลที่ค้าง + ร้านที่เก็บมัดจำ · (c) คีย์ API กลางที่ยังใช้ได้ · (d) MANAGER ที่ไม่ใช่ \"*\" ในร้านที่มี POS · (e) เครื่องขายที่ลงทะเบียน"],
  ["K4", "โต๊ะที่มี TableSession OPEN ซ้ำ (ต้อง 0 ก่อนสร้าง one_open_session_per_table — §5)"],
];
/** --crons (CD-P61-R6 · W34): ไม่แตะ DB */
const CRON_CHECKS: readonly [string, string][] = [
  ["R1", "crontab มีบรรทัด crm-cron.mts ครบ minute/hourly/daily ตามหัวไฟล์ scripts/crm-cron.mts (ไม่มี minute = ล้ม)"],
  ["R2", "checkout ที่ crontab cd เข้าไป = SHA เดียวกับ origin/main ในเครื่อง (ตามไม่ทัน = เตือน · --post-merge = ล้ม)"],
  ["R3", "โค้ดของ checkout นั้นมีงานรายนาที pos.staffCommission.payroll + pos.slip.purge (ไม่มี = เตือน · --post-merge = ล้ม)"],
  ["R4", "checkout นั้นสะอาด (git status --porcelain ว่าง) — มีไฟล์ค้าง = เตือน (pull --ff-only อาจล้ม)"],
];
const ACTIVE_CHECKS = CRONS ? CRON_CHECKS : COUNTS ? COUNT_CHECKS : CHECKS;

if (LIST) {
  for (const [id, t] of CHECKS) console.log(`${id.padEnd(3)} ${t}`);
  console.log("\n--counts:");
  for (const [id, t] of COUNT_CHECKS) console.log(`${id.padEnd(3)} ${t}`);
  console.log("\n--crons:");
  for (const [id, t] of CRON_CHECKS) console.log(`${id.padEnd(3)} ${t}`);
  console.log(`\nindex มือ ${HAND_INDEXES.length} ตัว · env ${ENV_NAMES.length} ชื่อ (${ENV_NAMES.map((e) => e.name).join(" ")}) · allowlist ${HOST_ALLOWLIST.map((h) => `${h.mark}=${h.role}`).join(" ")} · เกณฑ์แถว ${COUNT_THRESHOLD}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, mode: "list", total: CHECKS.length + COUNT_CHECKS.length + CRON_CHECKS.length, passed: 0 })}`);
  process.exit(0);
}

let crashed = "";
/** ข้อมูลเพิ่มใน JSON_SUMMARY (--counts: ตัวเลขดิบ + ทางที่ตาราง §3.2 ชี้) */
let extraSummary: Record<string, unknown> | undefined;
/** --self-test: migration ของทรีที่ใหม่กว่าตัวล่าสุดที่ฐาน QC apply (เช่นใบที่ยังไม่ merge — ไม่ deploy บน QC4 ที่ใช้ร่วม) = เตือน ไม่ล้ม */
let pendingMigs: string[] = [];
const dbTables = new Set<string>();
const dbCols = new Set<string>();
const dbIdx = new Map<string, boolean>();
const results = new Map<string, { st: Status; detail: string }>();
const put = (id: string, st: Status, detail: string) => results.set(id, { st, detail });

// ── --crons: ไม่แตะ DB · อ่าน crontab + git ของ checkout ที่ crontab ใช้ (อ่านอย่างเดียว · ไม่ fetch) ──
if (CRONS) {
  runCronChecks();
  printAndExit(null, "(ไม่ใช้ DB)", "crons");
}

// ── G1/G2: ด่านเป้าหมาย ──
const target = decideTarget(process.env, MODE);
if (SELF) {
  const fake = (mark: string) => `postgresql://u:x@${mark}-000000.example.invalid/db`;
  const reh: AllowHost[] = [...HOST_ALLOWLIST, { mark: "ep-rehearsal-test", role: "rehearsal", note: "ชุดทดสอบ G2 (F16)" }];
  const cases: [string, Record<string, string | undefined>, Mode, string | true, (readonly AllowHost[])?][] = [
    ["prod ไม่มี ALLOW", { DATABASE_URL: fake("ep-royal-night") }, "audit", "NO_ALLOW"],
    ["prod + ALLOW", { DATABASE_URL: fake("ep-royal-night"), ALLOW_PROD_AUDIT: "1" }, "audit", true],
    ["prod + --self-test", { DATABASE_URL: fake("ep-royal-night"), ALLOW_PROD_AUDIT: "1" }, "self-test", "SELFTEST_ON_PROD"],
    ["prod percent-encoded", { DATABASE_URL: `postgresql://u:x@%65p-royal-night-0.example.invalid/db` }, "audit", "NO_ALLOW"],
    ["prod --counts ไม่มี ALLOW", { DATABASE_URL: fake("ep-royal-night") }, "counts", "NO_ALLOW"],
    ["prod --counts + ALLOW", { DATABASE_URL: fake("ep-royal-night"), ALLOW_PROD_AUDIT: "1" }, "counts", true],
    ["QC4 ไม่มี --self-test", { DATABASE_URL: fake("ep-frosty-lab"), ALLOW_PROD_AUDIT: "1" }, "audit", "QC4_NEEDS_SELFTEST"],
    ["QC4 + --self-test", { DATABASE_URL: fake("ep-frosty-lab") }, "self-test", true],
    ["QC4 + --counts", { DATABASE_URL: fake("ep-frosty-lab") }, "counts", true],
    ["host อื่น (QC1)", { DATABASE_URL: fake("ep-plain-art"), ALLOW_PROD_AUDIT: "1" }, "audit", "NOT_ALLOWLISTED"],
    ["host ปลอมคำนำหน้า", { DATABASE_URL: fake("ep-royal-nightx"), ALLOW_PROD_AUDIT: "1" }, "audit", "NOT_ALLOWLISTED"],
    ["?host= ซ้อน", { DATABASE_URL: `${fake("ep-frosty-lab")}?host=ep-royal-night-0.example.invalid` }, "self-test", "HOST_PARAM"],
    ["PGHOST ตั้งอยู่", { DATABASE_URL: fake("ep-frosty-lab"), PGHOST: "x" }, "self-test", "PGHOST"],
    ["DIRECT_URL ชี้ prod", { DATABASE_URL: fake("ep-frosty-lab"), DIRECT_URL: fake("ep-royal-night") }, "self-test", "MIXED"],
    ["ไม่มี URL", {}, "self-test", "NO_URL"],
    // R1 F16: role ซ้อมต้องได้กติกา prod (ALLOW_PROD_AUDIT · ไม่มี --self-test) — ไม่ใช่ทางลัดของ QC4
    ["rehearsal ไม่มี ALLOW", { DATABASE_URL: fake("ep-rehearsal-test") }, "audit", "NO_ALLOW", reh],
    ["rehearsal + --self-test", { DATABASE_URL: fake("ep-rehearsal-test"), ALLOW_PROD_AUDIT: "1" }, "self-test", "SELFTEST_ON_PROD", reh],
    ["rehearsal + ALLOW", { DATABASE_URL: fake("ep-rehearsal-test"), ALLOW_PROD_AUDIT: "1" }, "audit", true, reh],
    ["rehearsal ไม่อยู่ใน allowlist วันนี้", { DATABASE_URL: fake("ep-rehearsal-test"), ALLOW_PROD_AUDIT: "1" }, "audit", "NOT_ALLOWLISTED"],
  ];
  const bad: string[] = [];
  for (const [label, env, st, want, allow] of cases) {
    const r = decideTarget(env, st, allow);
    const got = r.ok ? true : r.code;
    if (got !== want) bad.push(`${label}: ได้ ${String(got)} คาด ${String(want)}`);
  }
  put("G2", bad.length ? "FAIL" : "OK", bad.length ? bad.join(" · ") : `${cases.length}/${cases.length} กรณีตรง`);
} else {
  put("G2", "INFO", "ข้าม (เฉพาะ --self-test)");
}
if (!target.ok) {
  put("G1", "FAIL", `${target.code}: ${target.reason}`);
  for (const [id] of ACTIVE_CHECKS) if (!results.has(id)) put(id, "INFO", "ไม่ได้รัน (ด่านเป้าหมายปฏิเสธ)");
  printAndExit(target.code === "NO_URL" ? 2 : 4, "(ปฏิเสธ)", target.code);
  // (printAndExit ไม่คืนค่า)
}
put("G1", "OK", `host ${target.ok ? target.label : ""} (${target.ok ? target.role : ""})`);

// ── ความคาดหวังสถิต ──
const migs = loadPosMigrations();
const schema = loadSchema();
const createdTables = new Set(migs.flatMap((m) => m.tables));

// ── DB (อ่านอย่างเดียว) ──
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, application_name: "verify-prod-pos" });
const READ_SQL = /^\s*(SELECT|WITH|SHOW)\b/i;
async function q<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  if (!READ_SQL.test(sql) || sql.includes(";")) throw new Error(`q() รับเฉพาะ SELECT/WITH/SHOW คำสั่งเดียว: ${sql.slice(0, 60)}`);
  return (await client.query(sql, params)).rows as T[];
}
const n = (v: unknown) => Number(v ?? 0);
/** แต่ละกลุ่มข้ออยู่ใน SAVEPOINT ของตัวเอง — ข้อหนึ่งล้ม (เช่น ตารางยังไม่มีก่อน migrate) ไม่ทำให้ธุรกรรมทั้งก้อน abort */
let spSeq = 0;
async function safe(ids: string[], fn: () => Promise<void>): Promise<void> {
  const sp = `verify_sp_${++spSeq}`;
  await client.query(`SAVEPOINT ${sp}`);
  try {
    await fn();
    await client.query(`RELEASE SAVEPOINT ${sp}`);
  } catch (e) {
    await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
    for (const id of ids) if (!results.has(id)) put(id, "FAIL", `คิวรีล้ม: ${(e as Error).message.slice(0, 160)}`);
  }
}
try {
  await client.connect();
  await client.query("BEGIN");
  await client.query("SET TRANSACTION READ ONLY");
  await client.query("SET LOCAL statement_timeout = '20s'");
  await client.query("SET LOCAL lock_timeout = '2s'");
  const ro = (await q<{ transaction_read_only: string }>("SHOW transaction_read_only"))[0]?.transaction_read_only;
  if (ro !== "on") throw new Error(`transaction_read_only = ${ro} — หยุด`);
  let roDetail = "transaction_read_only = on";
  if (SELF && target.ok && target.role === "qc4") {
    // positive control (QC4 เท่านั้น): ฐานต้องปฏิเสธการเขียนในธุรกรรมนี้ — โต๊ะชั่วคราว (หายตอน ROLLBACK แม้ไม่ถูกปฏิเสธ)
    await client.query("SAVEPOINT verify_ro_probe");
    let code = "";
    try {
      await client.query("CREATE TEMP TABLE verify_prod_pos_probe (x int)"); // RO-PROBE
      code = "ACCEPTED";
    } catch (e) {
      code = String((e as { code?: string }).code ?? "ERR");
    }
    await client.query("ROLLBACK TO SAVEPOINT verify_ro_probe");
    roDetail += ` · probe เขียน → ${code}`;
    put("RO", code === "25006" ? "OK" : "FAIL", roDetail);
  } else put("RO", "OK", roDetail);

  // ── --counts (CD-P61-R5 · W33): ตัวเลขก่อน migrate — ไม่รันข้อ P0…N1 ของโหมดตรวจ ──
  if (COUNTS) await runCountChecks();
  else {
  await safe(["P0"], async () => {
    const ver = (await q<{ server_version_num: string }>("SHOW server_version_num"))[0]?.server_version_num ?? "0";
    put("P0", Number(ver) >= 110000 ? "OK" : "FAIL", `server_version_num ${ver}`);
  });

  // M1–M3
  await safe(["M1", "M2", "M3"], async () => {
    const mrows = await q<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }>(
      `SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY migration_name`,
    );
    const applied = new Set(mrows.filter((r) => r.finished_at && !r.rolled_back_at).map((r) => r.migration_name));
    const missing0 = migs.map((m) => m.name).filter((x) => !applied.has(x));
    // P6.1 fix1: --self-test บน QC4 (ใช้ร่วมหลายเลน — ไม่ deploy migration ของใบที่ยังไม่ merge) ⇒ ไฟล์ที่ใหม่กว่าตัวล่าสุดที่ฐาน apply = "รอ" (เตือน) ·
    //   โหมดตรวจ prod = ยังล้มเหมือนเดิมทุกไฟล์ที่ขาด
    const lastApplied = [...applied].filter((x) => POS_MIG_RE.test(x)).sort().pop() ?? "";
    pendingMigs = SELF ? missing0.filter((x) => x > lastApplied) : [];
    const missing = missing0.filter((x) => !pendingMigs.includes(x));
    put(
      "M1",
      missing.length ? "FAIL" : pendingMigs.length ? "WARN" : "OK",
      missing.length
        ? `ยังไม่ apply ${missing.length}/${migs.length}: ${missing.slice(0, 6).join(", ")}${missing.length > 6 ? " …" : ""}`
        : `${migs.length - pendingMigs.length}/${migs.length} apply แล้ว${pendingMigs.length ? ` · รอ (ใหม่กว่าฐาน QC · self-test เท่านั้น): ${pendingMigs.join(", ")}` : ""}`,
    );
    const stuck = mrows.filter((r) => !r.finished_at && !r.rolled_back_at).map((r) => r.migration_name);
    put("M2", stuck.length ? "FAIL" : "OK", stuck.length ? `ค้าง/ล้ม: ${stuck.join(", ")} (P3009 — runbook §4)` : "0 แถวค้าง");
    const treeNames = new Set(migs.map((m) => m.name));
    const unknown = [...applied].filter((x) => POS_MIG_RE.test(x) && !treeNames.has(x));
    put("M3", unknown.length ? "WARN" : "OK", unknown.length ? `ฐานมีแต่ทรีไม่มี: ${unknown.join(", ")}` : "ไม่มี");
  });

  // T1 · C1
  await safe(["T1", "C1"], async () => {
    const trows = await q<{ table_name: string }>(`SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema()`);
    for (const r of trows) dbTables.add(r.table_name);
    const tMissing = [...createdTables].filter((t) => !dbTables.has(t));
    const tNoModel = [...createdTables].filter((t) => !schema.models.has(t));
    put("T1", tMissing.length || tNoModel.length ? "FAIL" : "OK", [tMissing.length ? `ไม่มีในฐาน: ${tMissing.join(", ")}` : "", tNoModel.length ? `ไม่มี model: ${tNoModel.join(", ")}` : "", `${createdTables.size - tMissing.length}/${createdTables.size} ตาราง`].filter(Boolean).join(" · "));
    const crows = await q<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = ANY($1::text[])`,
      [[...new Set([...createdTables, ...migs.flatMap((m) => m.cols.map((c) => c[0]))])]],
    );
    for (const r of crows) dbCols.add(`${r.table_name}.${r.column_name}`);
    const wantCols = new Set<string>();
    for (const t of createdTables) for (const c of schema.models.get(t)?.scalars ?? []) wantCols.add(`${t}.${c}`);
    for (const m of migs) for (const [t, c] of m.cols) wantCols.add(`${t}.${c}`);
    const cMissing = [...wantCols].filter((x) => !dbCols.has(x));
    put("C1", cMissing.length ? "FAIL" : "OK", cMissing.length ? `ขาด ${cMissing.length}: ${cMissing.slice(0, 8).join(", ")}${cMissing.length > 8 ? " …" : ""}` : `${wantCols.size}/${wantCols.size} คอลัมน์`);
  });

  // E1
  await safe(["E1"], async () => {
    const enumTypes = new Set([...migs.flatMap((m) => m.types), ...migs.flatMap((m) => m.enumAdds.map((x) => x[0]))]);
    const erows = await q<{ typname: string; enumlabel: string }>(
      `SELECT t.typname, e.enumlabel FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid JOIN pg_namespace ns ON ns.oid = t.typnamespace WHERE ns.nspname = current_schema() AND t.typname = ANY($1::text[])`,
      [[...enumTypes]],
    );
    const dbEnum = new Set(erows.map((r) => `${r.typname}.${r.enumlabel}`));
    const eMissing: string[] = [];
    let eWant = 0;
    for (const t of enumTypes) {
      const vals = schema.enums.get(t);
      if (!vals) {
        eMissing.push(`${t}(ไม่มีใน schema)`);
        continue;
      }
      for (const v of vals) {
        eWant++;
        if (!dbEnum.has(`${t}.${v}`)) eMissing.push(`${t}.${v}`);
      }
    }
    put("E1", eMissing.length ? "FAIL" : "OK", eMissing.length ? `ขาด: ${eMissing.slice(0, 8).join(", ")}` : `${enumTypes.size} type · ${eWant} ค่า`);
  });

  // I1 · X1
  await safe(["I1", "X1"], async () => {
    const irows = await q<{ relname: string; indisvalid: boolean }>(
      `SELECT c.relname, i.indisvalid FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE ns.nspname = current_schema()`,
    );
    for (const r of irows) dbIdx.set(r.relname, r.indisvalid);
    const wantIdx = migs.filter((m) => !pendingMigs.includes(m.name)).flatMap((m) => m.indexes.map((x) => x[0]));
    const pendingIdx = migs.filter((m) => pendingMigs.includes(m.name)).flatMap((m) => m.indexes.map((x) => x[0]));
    const iMissing = wantIdx.filter((x) => !dbIdx.has(x));
    const iInvalid = [...wantIdx, ...pendingIdx].filter((x) => dbIdx.get(x) === false);
    put(
      "I1",
      iMissing.length || iInvalid.length ? "FAIL" : "OK",
      [iMissing.length ? `ไม่มี: ${iMissing.slice(0, 6).join(", ")}` : "", iInvalid.length ? `invalid: ${iInvalid.join(", ")}` : "", `${wantIdx.length - iMissing.length}/${wantIdx.length}`, pendingIdx.length ? `ไม่นับ ${pendingIdx.length} index ของ migration ที่รอ` : ""].filter(Boolean).join(" · "),
    );
    const hMissing = HAND_INDEXES.filter((h) => !dbIdx.has(h.name)).map((h) => h.name);
    const hInvalid = HAND_INDEXES.filter((h) => dbIdx.get(h.name) === false).map((h) => h.name);
    const dupOpen = dbTables.has("TableSession")
      ? n((await q<{ n: number }>(`SELECT count(*)::int AS n FROM (SELECT "tableId" FROM "TableSession" WHERE "status" = 'OPEN' GROUP BY "tableId" HAVING count(*) > 1) d`))[0]?.n)
      : -1;
    put(
      "X1",
      hInvalid.length ? "FAIL" : hMissing.length || dupOpen > 0 ? "WARN" : "OK",
      `${HAND_INDEXES.length - hMissing.length}/${HAND_INDEXES.length} สร้างแล้ว${hMissing.length ? ` · ยังไม่สร้าง: ${hMissing.join(", ")}` : ""}${hInvalid.length ? ` · INVALID (DROP INDEX CONCURRENTLY แล้วสร้างใหม่): ${hInvalid.join(", ")}` : ""} · โต๊ะที่มี session OPEN ซ้ำ = ${dupOpen}${dupOpen > 0 ? " (ต้องเป็น 0 ก่อนสร้าง one_open_session_per_table — เจ้าของปิด session ซ้ำก่อน)" : ""}`,
    );
  });

  // S1–S8 (นับอย่างเดียว)
  await safe(["S1"], async () => {
    const negInv = n((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "InvItem" WHERE "onHand" < 0`))[0]?.n);
    const negLoc = n((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "InvLocationStock" WHERE "onHand" < 0`))[0]?.n);
    put("S1", negInv + negLoc > 0 ? "WARN" : "OK", `InvItem ${negInv} · InvLocationStock ${negLoc}`);
  });
  await safe(["S2"], async () => {
    const orphanLine = n((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "PosSaleLine" l WHERE NOT EXISTS (SELECT 1 FROM "PosSale" s WHERE s.id = l."saleId")`))[0]?.n);
    const orphanPay = n((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "PosPayment" p WHERE NOT EXISTS (SELECT 1 FROM "PosSale" s WHERE s.id = p."saleId")`))[0]?.n);
    const orphanOpt = n((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "PosSaleLineOption" o WHERE NOT EXISTS (SELECT 1 FROM "PosSaleLine" l WHERE l.id = o."lineId")`))[0]?.n);
    put("S2", orphanLine + orphanPay + orphanOpt > 0 ? "FAIL" : "OK", `PosSaleLine ${orphanLine} · PosPayment ${orphanPay} · PosSaleLineOption ${orphanOpt}`);
  });
  await safe(["S3"], async () => {
    const flags = await q<{ v2: boolean; active: boolean; n: number }>(
      `SELECT (settings->'pos'->'registerV2') = 'true'::jsonb AS v2, active, count(*)::int AS n FROM "AppSystem" WHERE type = 'POS' GROUP BY 1, 2 ORDER BY 1, 2`,
    );
    put("S3", "INFO", flags.map((r) => `${r.active ? "active" : "inactive"}·registerV2=${r.v2 ? "true" : "ไม่ใช่ true"}: ${r.n}`).join(" · ") || "ไม่มีระบบ POS");
  });
  await safe(["S4"], async () => {
    const keys = (await q<Record<string, number>>(
      `SELECT count(*)::int AS pos,
              count(*) FILTER (WHERE settings->'pos' ? 'credit')::int AS credit,
              count(*) FILTER (WHERE settings->'pos' ? 'offline')::int AS offline,
              count(*) FILTER (WHERE settings->'pos'->'shift' ? 'required')::int AS shift_required,
              count(*) FILTER (WHERE settings->'pos' ? 'board')::int AS board,
              count(*) FILTER (WHERE settings->'pos' ? 'ai')::int AS ai,
              count(*) FILTER (WHERE settings->'pos' ? 'chat')::int AS chat,
              count(*) FILTER (WHERE settings->'pos' ? 'deposit')::int AS deposit,
              count(*) FILTER (WHERE (settings->'pos'->'offline'->'enabled') = 'true'::jsonb)::int AS offline_on,
              count(*) FILTER (WHERE (settings->'pos'->'credit'->'enabled') = 'true'::jsonb)::int AS credit_on
         FROM "AppSystem" WHERE type = 'POS'`,
    ))[0] ?? {};
    put("S4", "INFO", Object.entries(keys).map(([k, v]) => `${k} ${v}`).join(" · "));
  });
  await safe(["S5"], async () => {
    const cat = (await q<Record<string, number>>(
      `SELECT (SELECT count(*)::int FROM "PosProduct") AS pos_product,
              (SELECT count(*)::int FROM "MenuItem" WHERE "posProductId" IS NULL) AS menu_unlinked,
              (SELECT count(*)::int FROM "MenuItem" WHERE "posProductId" IS NOT NULL) AS menu_linked,
              (SELECT count(*)::int FROM "ShopProduct" WHERE "posProductId" IS NULL) AS shop_unlinked,
              (SELECT count(*)::int FROM "ShopProduct" WHERE "posProductId" IS NOT NULL) AS shop_linked,
              (SELECT count(*)::int FROM "InvItem" i WHERE i.kind = 'PRODUCT' AND NOT EXISTS (SELECT 1 FROM "PosProduct" p WHERE p."invItemId" = i.id)) AS inv_product_unlinked`,
    ))[0] ?? {};
    put("S5", "INFO", `${Object.entries(cat).map(([k, v]) => `${k} ${v}`).join(" · ")} (ก่อน backfill = linked 0 · หลัง = pos-backfill-catalog --verify ต้อง 0)`);
  });
  await safe(["S6"], async () => {
    const ob = await q<{ status: string; n: number }>(`SELECT status::text AS status, count(*)::int AS n FROM "OutboxEvent" WHERE type LIKE 'pos.%' AND status <> 'DONE' GROUP BY 1`);
    const obFailed = n(ob.find((r) => r.status === "FAILED")?.n);
    put("S6", obFailed > 0 ? "WARN" : "OK", ob.map((r) => `${r.status} ${r.n}`).join(" · ") || "PENDING 0 · FAILED 0");
  });
  await safe(["S7"], async () => {
    const ops = await q<{ source: string; n: number }>(
      `SELECT source, count(*)::int AS n FROM "OpsEvent" WHERE level = 'ERROR' AND "createdAt" > now() - interval '24 hours' GROUP BY 1 ORDER BY 2 DESC LIMIT 8`,
    );
    const opsTotal = ops.reduce((a, r) => a + n(r.n), 0);
    put("S7", opsTotal > 0 ? "WARN" : "OK", ops.length ? `ERROR ${opsTotal} · ${ops.map((r) => `${r.source} ${r.n}`).join(" · ")}` : "ERROR 0");
  });
  await safe(["S8"], async () => {
    const integ = (await q<Record<string, number>>(
      `SELECT (SELECT count(*)::int FROM "PosIntegrationCredential") AS creds,
              (SELECT count(*)::int FROM "PosPrintAgent") AS print_agents,
              (SELECT count(*)::int FROM "SalesChannel") AS channels`,
    ))[0] ?? {};
    put("S8", "INFO", Object.entries(integ).map(([k, v]) => `${k} ${v}`).join(" · "));
  });
  if (SELF) {
    // negative control: ทางเปรียบเทียบเดียวกับ T1/C1/I1/M1 ต้อง "เห็นว่าไม่มี" ของปลอม และเห็นของจริง — กันข้อเขียวเพราะชุดข้อมูลว่าง
    await safe(["N1"], async () => {
      const fakeMig = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "_prisma_migrations" WHERE migration_name = $1`, ["29991231000000_pos_verify_canary"]))[0]?.n;
      const bad: string[] = [];
      if (dbTables.has("PosVerifyCanary")) bad.push("ตารางปลอมถูกนับว่ามี");
      if (dbCols.has("PosSale.verifyCanary")) bad.push("คอลัมน์ปลอมถูกนับว่ามี");
      if (dbIdx.has("PosVerifyCanary_idx")) bad.push("index ปลอมถูกนับว่ามี");
      if (n(fakeMig) !== 0) bad.push("migration ปลอมถูกนับว่ามี");
      if (!dbTables.has("PosSale") || !dbCols.has("PosSale.publicToken") || dbIdx.get("PosSale_publicToken_key") !== true) bad.push("ของจริงไม่ถูกเห็น (ชุดข้อมูลว่าง?)");
      put("N1", bad.length ? "FAIL" : "OK", bad.length ? bad.join(" · ") : `ของปลอม 4/4 = ไม่มี · ของจริง 3/3 = มี (ตาราง ${dbTables.size} · คอลัมน์ ${dbCols.size} · index ${dbIdx.size})`);
    });
  } else put("N1", "INFO", "ข้าม (เฉพาะ --self-test)");
  } // จบโหมดตรวจ/self-test
} catch (e) {
  crashed = (e as Error).message.slice(0, 300);
} finally {
  await client.query("ROLLBACK").catch(() => undefined);
  await client.end().catch(() => undefined);
}

// V1 — ชื่อเท่านั้น
put("V1", "INFO", ENV_NAMES.map((x) => `${x.name}=${process.env[x.name] ? "ตั้ง" : "ไม่ตั้ง"}`).join(" · ") + " (env ของโปรเซสนี้ ≠ env ของ Vercel)");
if (crashed) for (const [id] of ACTIVE_CHECKS) if (!results.has(id)) put(id, "FAIL", `ไม่ถึง (ล้ม: ${crashed})`);
printAndExit(null, target.ok ? target.label : "", target.ok ? target.role : "");

function printAndExit(forced: number | null, label: string, role: string): never {
  const rows = ACTIVE_CHECKS.map(([id, t]) => ({ id, t, ...(results.get(id) ?? { st: "FAIL" as Status, detail: "ไม่ถูกตรวจ" }) }));
  const icon: Record<Status, string> = { OK: "🟢", WARN: "🟡", FAIL: "🔴", INFO: "⚪" };
  const modeName = CRONS ? "crons" : COUNTS ? "counts" : SELF ? "self-test" : "prod-audit";
  console.log(`\n${SUITE} · โหมด ${modeName} · host ${label}`);
  console.log("ID  สถานะ  ข้อ / ผล");
  for (const r of rows) console.log(`${icon[r.st]} ${r.id.padEnd(3)} ${r.st.padEnd(4)} ${r.t}\n         → ${r.detail}`);
  const fail = rows.filter((r) => r.st === "FAIL").map((r) => r.id);
  const warn = rows.filter((r) => r.st === "WARN").map((r) => r.id);
  console.log(`\n===== ${SUITE} ===== FAIL ${fail.length} · WARN ${warn.length} · ทั้งหมด ${rows.length}`);
  console.log(
    `JSON_SUMMARY ${JSON.stringify({ suite: SUITE, mode: modeName, role, host: label, total: rows.length, passed: forced === null ? rows.length - fail.length : 0, refused: forced !== null ? role : undefined, fail: fail.length, warn: warn.length, failed: fail, warned: warn, posMigrations: migsCount(), pending: pendingMigs.length ? pendingMigs : undefined, crashed: crashed || undefined, ...(extraSummary ?? {}) })}`,
  );
  process.exit(forced ?? (fail.length ? 1 : 0));
}
function migsCount(): number {
  try {
    return loadPosMigrations().length;
  } catch {
    return -1;
  }
}


// ═════════════════════════ --counts (CD-P61-R5 · R1 F5 · W33 · CD-P61-R4) ═════════════════════════
async function tryQ<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<{ ok: true; rows: T[] } | { ok: false; code: string; msg: string }> {
  const sp = `verify_cnt_${++spSeq}`;
  await client.query(`SAVEPOINT ${sp}`);
  try {
    const rows = await q<T>(sql, params);
    await client.query(`RELEASE SAVEPOINT ${sp}`);
    return { ok: true, rows };
  } catch (e) {
    await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
    return { ok: false, code: String((e as { code?: string }).code ?? "ERR"), msg: (e as Error).message.slice(0, 120) };
  }
}
function fmt(v: number): string {
  return v.toLocaleString("en-US");
}
function why(r: { code: string; msg: string }): string {
  return r.code === "42P01" ? "ยังไม่มีตาราง (ก่อน migrate)" : r.code === "57014" ? "เกินเวลา (ใช้ค่าประมาณ)" : `ล้ม ${r.code}`;
}
async function runCountChecks(): Promise<void> {
  const counts: Record<string, { est: number | null; rows: number | null; note?: string }> = {};
  const over: string[] = [];
  const parts: string[] = [];
  for (const { table, path } of COUNT_TABLES) {
    const est = await tryQ<{ est: string }>(`SELECT c.reltuples::bigint AS est FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE ns.nspname = current_schema() AND c.relname = $1 AND c.relkind = 'r'`, [table]);
    const estN = est.ok && est.rows[0] ? Math.max(0, Number(est.rows[0].est)) : null;
    const cnt = await tryQ<{ n: string }>(`SELECT count(*)::bigint AS n FROM "${table}"`);
    const rowsN = cnt.ok ? Number(cnt.rows[0]?.n ?? 0) : null;
    counts[table] = { est: estN, rows: rowsN, note: cnt.ok ? undefined : why(cnt) };
    const best = rowsN ?? estN ?? 0;
    if (path && best > COUNT_THRESHOLD) over.push(`${table} ${fmt(best)} ⇒ ${path}`);
    parts.push(`${table} ${rowsN === null ? `? (${why(cnt as { code: string; msg: string })})` : fmt(rowsN)}${estN !== null ? ` [est ${fmt(estN)}]` : ""}`);
  }
  put("K1", over.length ? "WARN" : "OK", `${parts.join(" · ")}${over.length ? ` ‖ เกิน ${fmt(COUNT_THRESHOLD)}: ${over.join(" · ")}` : ` ‖ ไม่มีตารางตัดสินใดเกิน ${fmt(COUNT_THRESHOLD)} ⇒ ทาง ก (ให้ migrate deploy รันทุกไฟล์) ทุกแถวของ §3.2`}`);

  const flags = await tryQ<{ v2: boolean; active: boolean; n: number }>(
    `SELECT (settings->'pos'->'registerV2') = 'true'::jsonb AS v2, active, count(*)::int AS n FROM "AppSystem" WHERE type = 'POS' GROUP BY 1, 2 ORDER BY 1, 2`,
  );
  const v2 = flags.ok ? flags.rows.filter((r) => r.v2).reduce((a, r) => a + n(r.n), 0) : -1;
  put("K2", "INFO", flags.ok ? `${flags.rows.map((r) => `${r.active ? "active" : "inactive"}·registerV2=${r.v2 ? "true" : "ไม่ใช่ true"}: ${r.n}`).join(" · ") || "ไม่มีระบบ POS"} ‖ registerV2=true รวม ${v2} ระบบ (§8.5 pos-shift-required-off --dry-run ต้องได้ ≤ เท่านี้)` : why(flags));

  const k3: Record<string, unknown> = {};
  const line: string[] = [];
  const a = await tryQ<{ units: number; tenants: number }>(
    `SELECT count(DISTINCT su."unitId")::int AS units, count(DISTINCT su."tenantId")::int AS tenants FROM "AppSystemUnit" su JOIN "AppSystem" ps ON ps.id = su."systemId" AND ps.type = 'POS' AND ps.active JOIN "BusinessUnit" bu ON bu.id = su."unitId" WHERE su.type = 'POS' AND (bu.type = 'RESTAURANT' OR EXISTS (SELECT 1 FROM "RestaurantSetting" rs WHERE rs."unitId" = bu.id) OR EXISTS (SELECT 1 FROM "RestaurantTable" rt WHERE rt."unitId" = bu.id))`,
  );
  k3.restaurantUnitsOnPos = a.ok ? a.rows[0] : why(a);
  line.push(`(a) สาขาร้านอาหารผูก POS active ${a.ok ? `${a.rows[0]?.units} สาขา/${a.rows[0]?.tenants} ร้าน` : why(a)}`);
  const b = await tryQ<{ booking: number; hotel: number; rental: number; tenants_taking: number }>(
    `SELECT (SELECT count(*)::int FROM "Appointment" WHERE "depositPaidAt" IS NOT NULL AND status::text IN ('PENDING','CONFIRMED','ARRIVED')) AS booking,
            (SELECT count(*)::int FROM "HotelReservation" WHERE "depositPaidAt" IS NOT NULL AND status::text IN ('BOOKED','CHECKED_IN')) AS hotel,
            (SELECT count(*)::int FROM "RentalBooking" WHERE "depositPaidAt" IS NOT NULL AND status::text IN ('BOOKED','PICKED_UP')) AS rental,
            (SELECT count(DISTINCT x."tenantId")::int FROM (SELECT "tenantId" FROM "BookingService" WHERE "depositSatang" > 0 UNION SELECT "tenantId" FROM "HotelRoomType" WHERE "depositSatang" > 0 UNION SELECT "tenantId" FROM "RentalAsset" WHERE "depositSatang" > 0) x) AS tenants_taking`,
  );
  k3.moduleDeposits = b.ok ? b.rows[0] : why(b);
  line.push(`(b) มัดจำโมดูลค้าง booking ${b.ok ? b.rows[0]?.booking : "?"} · hotel ${b.ok ? b.rows[0]?.hotel : "?"} · rental ${b.ok ? b.rows[0]?.rental : "?"} · ร้านที่เก็บมัดจำ ${b.ok ? b.rows[0]?.tenants_taking : why(b)}`);
  const c = await tryQ<{ keys: number; used30d: number; tenants: number }>(
    `SELECT count(*)::int AS keys, count(*) FILTER (WHERE "lastUsedAt" > now() - interval '30 days')::int AS used30d, count(DISTINCT "tenantId")::int AS tenants FROM "ApiKey" WHERE "revokedAt" IS NULL AND ("expiresAt" IS NULL OR "expiresAt" > now()) AND "systemId" IS NULL AND "scopesJson" = '[]'::jsonb`,
  );
  k3.generalApiKeys = c.ok ? c.rows[0] : why(c);
  line.push(`(c) คีย์ API กลางที่ใช้ได้ ${c.ok ? `${c.rows[0]?.keys} (ใช้ใน 30 วัน ${c.rows[0]?.used30d}) · ${c.rows[0]?.tenants} ร้าน` : why(c)}`);
  const d = await tryQ<{ managers: number; tenants: number }>(
    `SELECT count(*)::int AS managers, count(DISTINCT m."tenantId")::int AS tenants FROM "Membership" m WHERE m.role::text = 'MANAGER' AND m."acceptedAt" IS NOT NULL AND NOT (m."unitAccess" @> '["*"]'::jsonb) AND EXISTS (SELECT 1 FROM "AppSystem" s WHERE s."tenantId" = m."tenantId" AND s.type = 'POS' AND s.active)`,
  );
  k3.managersNotStar = d.ok ? d.rows[0] : why(d);
  line.push(`(d) MANAGER ที่ไม่ใช่ "*" ในร้านที่มี POS ${d.ok ? `${d.rows[0]?.managers} คน/${d.rows[0]?.tenants} ร้าน` : why(d)}`);
  const e = await tryQ<{ devices: number; units: number }>(`SELECT count(*)::int AS devices, count(DISTINCT "unitId")::int AS units FROM "PosDevice" WHERE status::text = 'ACTIVE'`);
  k3.activeDevices = e.ok ? e.rows[0] : why(e);
  line.push(`(e) เครื่องขายที่ลงทะเบียน ${e.ok ? `${e.rows[0]?.devices} เครื่อง/${e.rows[0]?.units} สาขา` : `${why(e)} = 0`}`);
  put("K3", "INFO", line.join(" · "));

  const dup = await tryQ<{ n: number }>(`SELECT count(*)::int AS n FROM (SELECT "tableId" FROM "TableSession" WHERE status::text = 'OPEN' GROUP BY "tableId" HAVING count(*) > 1) x`);
  const dupN = dup.ok ? n(dup.rows[0]?.n) : -1;
  put("K4", dup.ok ? (dupN > 0 ? "WARN" : "OK") : "INFO", dup.ok ? `โต๊ะที่มี session OPEN ซ้ำ = ${dupN}${dupN > 0 ? " (เจ้าของปิด session ซ้ำในแอปก่อนสร้าง one_open_session_per_table)" : ""}` : why(dup));
  extraSummary = { threshold: COUNT_THRESHOLD, counts, overThreshold: over, registerV2On: v2, unflagged: k3, dupOpenSessions: dupN };
}

// ═════════════════════════ --crons (CD-P61-R6 · R1 F6 · W34) — ไม่แตะ DB ═════════════════════════
function sh(cmd: string, args: string[]): string | null {
  try {
    return execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 15_000 });
  } catch {
    return null;
  }
}
function runCronChecks(): void {
  const header = existsSync(join(ROOT, "scripts", "crm-cron.mts")) ? readFileSync(join(ROOT, "scripts", "crm-cron.mts"), "utf8") : "";
  const expected = [...header.matchAll(/^\/\/\s+((?:\S+\s+){4}\S+)\s+cd\s+(\S+)\s+&&[^\n]*crm-cron\.mts\s+(minute|hourly|daily)/gm)].map((m) => ({ sched: (m[1] as string).trim().replace(/\s+/g, " "), dir: m[2] as string, mode: m[3] as string }));
  const tab = sh("crontab", ["-l"]);
  if (tab === null) {
    put("R1", "FAIL", `อ่าน crontab ของผู้ใช้นี้ไม่ได้ / ไม่มี crontab · ที่คาด: ${expected.map((x) => `${x.mode} "${x.sched}" cd ${x.dir}`).join(" · ")}`);
    for (const id of ["R2", "R3", "R4"]) put(id, "INFO", "ไม่มี checkout ให้ตรวจ");
    extraSummary = { expected, entries: [] };
    return;
  }
  // พิมพ์เฉพาะ 5 ช่องเวลา + โหมด + path — ส่วนอื่นของบรรทัด (env/token ที่อาจมี) ไม่พิมพ์
  const entries = tab
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && /crm-cron\.mts/.test(l))
    .map((l) => ({ sched: l.split(/\s+/).slice(0, 5).join(" "), mode: /crm-cron\.mts\s+(minute|hourly|daily)\b/.exec(l)?.[1] ?? "?", dir: /\bcd\s+([^\s;&]+)/.exec(l)?.[1] ?? "?" }));
  const modes = new Set(entries.map((e) => e.mode));
  const missing = CRON_MODES.filter((m) => !modes.has(m));
  const schedDiff = expected.filter((x) => !entries.some((e) => e.mode === x.mode && e.sched === x.sched));
  put(
    "R1",
    missing.includes("minute") ? "FAIL" : missing.length || schedDiff.length ? "WARN" : "OK",
    `พบ ${entries.length} บรรทัด: ${entries.map((e) => `${e.mode} "${e.sched}" cd ${e.dir}`).join(" · ") || "-"}${missing.length ? ` · ขาด ${missing.join(", ")}` : ""}${schedDiff.length ? ` · เวลาไม่ตรงหัวไฟล์: ${schedDiff.map((x) => `${x.mode} คาด "${x.sched}"`).join(", ")}` : ""}`,
  );
  const dirs = [...new Set(entries.map((e) => e.dir).filter((d) => d !== "?"))];
  const r2: string[] = [];
  const r3: string[] = [];
  const r4: string[] = [];
  let behindAny = false;
  let jobsMissingAny = false;
  let dirtyAny = false;
  const per: Record<string, unknown>[] = [];
  for (const dir of dirs) {
    if (!existsSync(dir)) {
      r2.push(`${dir}: ไม่มีโฟลเดอร์`);
      behindAny = jobsMissingAny = true;
      continue;
    }
    const g = (...a: string[]) => sh("git", ["--no-optional-locks", "-C", dir, ...a])?.trim() ?? null;
    const head = g("rev-parse", "HEAD");
    const branch = g("rev-parse", "--abbrev-ref", "HEAD");
    const om = g("rev-parse", "--verify", "-q", "origin/main");
    const behind = om ? Number(g("rev-list", "--count", "HEAD..origin/main") ?? "-1") : -1;
    const ahead = om ? Number(g("rev-list", "--count", "origin/main..HEAD") ?? "-1") : -1;
    const fetchHead = g("rev-parse", "--git-path", "FETCH_HEAD");
    const fhPath = fetchHead ? (fetchHead.startsWith("/") ? fetchHead : join(dir, fetchHead)) : "";
    let fetchedAgo = "ไม่ทราบ";
    try {
      if (fhPath && existsSync(fhPath)) {
        const { mtimeMs } = statSync(fhPath);
        fetchedAgo = `${Math.round((Date.now() - mtimeMs) / 60000)} นาทีที่แล้ว`;
      }
    } catch {
      /* ไม่ทราบ */
    }
    const dirty = (g("status", "--porcelain") ?? "").split("\n").filter(Boolean).length;
    const mjPath = join(dir, "src", "lib", "platform", "minute-jobs.ts");
    const jobs = existsSync(mjPath) ? [...readFileSync(mjPath, "utf8").matchAll(/name: "(pos\.[\w.]+)"/g)].map((m) => m[1] as string) : [];
    const needJobs = ["pos.staffCommission.payroll", "pos.slip.purge"];
    const lacking = needJobs.filter((j) => !jobs.includes(j));
    const same = !!head && !!om && head === om;
    if (!same) behindAny = true;
    if (lacking.length) jobsMissingAny = true;
    if (dirty) dirtyAny = true;
    r2.push(`${dir}: ${branch ?? "?"} @ ${head?.slice(0, 8) ?? "?"} · origin/main ${om?.slice(0, 8) ?? "ไม่มี ref"} · ตามหลัง ${behind} · นำหน้า ${ahead} · fetch ล่าสุด ${fetchedAgo}`);
    r3.push(`${dir}: งาน pos.* ${jobs.length} (${jobs.join(" ") || "-"})${lacking.length ? ` · ขาด ${lacking.join(", ")}` : ""}`);
    r4.push(`${dir}: ไฟล์ค้าง ${dirty}`);
    per.push({ dir, branch, head: head?.slice(0, 12), originMain: om?.slice(0, 12), behind, ahead, posJobs: jobs, dirty });
  }
  const sev = (bad: boolean): Status => (bad ? (POST_MERGE ? "FAIL" : "WARN") : "OK");
  put("R2", dirs.length ? sev(behindAny) : "INFO", r2.join(" · ") || "ไม่มี checkout");
  put("R3", dirs.length ? sev(jobsMissingAny) : "INFO", r3.join(" · ") || "ไม่มี checkout");
  put("R4", dirs.length ? (dirtyAny ? "WARN" : "OK") : "INFO", r4.join(" · ") || "ไม่มี checkout");
  extraSummary = { expected, entries, checkouts: per, postMerge: POST_MERGE };
}
