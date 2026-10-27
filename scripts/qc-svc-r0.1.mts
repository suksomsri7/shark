// QC — SVC R0.1 · migration `svc_r0` (schema กลาง additive) · oracle ของผู้คุม — builder ห้ามแก้ไฟล์นี้
// สัญญา: ledger/SVC-CORE-CONTRACT.md §1.2 §2.2 §3.2 §4.2 §5.2 · ledger/SVC-MASTER-PLAN.md แถว R0.1 · ใบสั่ง ledger/svc-briefs/svc-brief-r0.1.md
//
// กลุ่มข้อ:
//   E  scripts/svc-qc-env.mts — ปฏิเสธ host ที่ไม่ใช่ qc-svc (ไฟล์ของ builder · ยังไม่มี = SKIP)
//   T  ตาราง/คอลัมน์ (ชนิด · null · ค่าเริ่ม) ครบตาม CC
//   I  ดัชนี/unique ครบตาม CC (+ partial unique ของ PaymentSlip · EXCLUDE ของ RoomOccupancy · btree_gist)
//   N  enum UnitType + DORM ต่อท้าย (ค่าเดิมคงลำดับ)
//   M  migration `*_svc_r0` additive ล้วน + ลงฐาน qc-svc แล้ว + แตะเฉพาะไฟล์ schema ของใบ
//   F  ทุกโมเดลใหม่ลงทะเบียน scope (fitness F1) + Prisma client รู้จัก + boot assert ผ่าน
//   O  RoomOccupancy กันจองซ้อนระดับ DB (ยิงพร้อมกัน 10 ทาง ได้ 1 · inactive ซ้อนได้ · ชนกันแบบ [) · UPDATE ก็โดน)
//   S  PaymentSlip partial unique (imageHash / transRef · REJECTED ไม่นับ · ข้ามร้านไม่ชน · ยิงพร้อมกัน 10 ทาง ได้ 1)
//
// ต่อฐานด้วย `pg` ตรง (ไม่ผ่าน Prisma client) — ข้อสอบต้องตัดสินจาก DB จริง แม้ client ยังไม่ generate
// ทุกแถวทดสอบอยู่ใต้ tenant ชั่วคราว slug `qc-svc-r01-*` · ลบใน finally ทุกครั้ง (+ กวาดของค้างจากรอบก่อนตอนเริ่ม)
// รัน: bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/qc-svc-r0.1.mts
import { existsSync, readFileSync, readdirSync, writeFileSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync, execFileSync } from "node:child_process";
import pg from "pg";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "qc-svc-r0.1";
const SVC_HOST = "ep-mute-scene"; // qc-svc (wo-svc-qc) — ดู scripts/qc-svc.sh
const FORBIDDEN_HOSTS = ["ep-royal-night", "ep-plain-art", "ep-cool-shadow", "ep-weathered-river", "ep-frosty-lab", "ep-fragrant-thunder"];
const BASE_SHA = "33e8272c"; // tip session/svc ตอน R0.0 (ก่อน R0.1)

// ═══════════════ 0. ด่านฐานข้อมูล (ในตัวข้อสอบเสมอ — ไม่พึ่งไฟล์ของ builder) ═══════════════
{
  const db = process.env.DATABASE_URL ?? "";
  const direct = process.env.DIRECT_URL ?? "";
  for (const [n, u] of [["DATABASE_URL", db], ["DIRECT_URL", direct]] as const) {
    if (!u) { console.error(`🔴 ${LABEL}: ไม่มี ${n} — รันผ่าน: bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/qc-svc-r0.1.mts`); process.exit(4); }
    const bad = FORBIDDEN_HOSTS.find((h) => u.includes(h));
    if (bad) { console.error(`🔴 ${LABEL}: ${n} ชี้ฐานต้องห้าม (${bad}) — หยุด`); process.exit(4); }
    if (!u.includes(SVC_HOST)) { console.error(`🔴 ${LABEL}: ${n} ไม่ใช่ qc-svc (${SVC_HOST}) — หยุด`); process.exit(4); }
  }
  if (process.env.APP_ENV === "production") { console.error(`🔴 ${LABEL}: APP_ENV=production`); process.exit(4); }
}

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Res = "PASS" | "FAIL" | "SKIP";
const cks: { id: string; res: Res; sev: Sev; why: string }[] = [];
const chk = (id: string, name: string, ok: boolean, detail = "", sev: Sev = "CRITICAL") => {
  cks.push({ id, res: ok ? "PASS" : "FAIL", sev, why: detail });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${!ok && detail ? ` — ${detail}` : ""}`);
};
const skip = (id: string, name: string, why: string, sev: Sev = "CRITICAL") => {
  cks.push({ id, res: "SKIP", sev, why });
  console.log(`  ⏭️  [${id}] ${name} — SKIP: ${why}`);
};
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 220);
const pgCode = (e: unknown): string => (typeof e === "object" && e !== null && "code" in e ? String((e as { code: unknown }).code) : "");
const rid = (p: string) => `svcr01_${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

// ═══════════════ สเปกตามสัญญา (CC) ═══════════════
// t = ชนิดใน information_schema.columns.data_type · n = nullable · d = ข้อความที่ต้องอยู่ใน column_default (ถ้ากำหนด)
type Col = { t: string; n: boolean; d?: string };
const TS = "timestamp without time zone";
const TXT = "text";
const S = (n = false, d?: string): Col => ({ t: TXT, n, d });
const I = (n = false, d?: string): Col => ({ t: "integer", n, d });
const J = (n = false, d?: string): Col => ({ t: "jsonb", n, d });
const D = (n = false, d?: string): Col => ({ t: TS, n, d });
const B = (n = false, d?: string): Col => ({ t: "boolean", n, d });
const A = (n = false, d?: string): Col => ({ t: "ARRAY", n, d });

const NEW_TABLES: Record<string, Record<string, Col>> = {
  // CC §1.2
  SettingValue: { id: S(), tenantId: S(), key: S(), scope: S(), scopeId: S(), value: J(), effectiveFrom: D(false, "1970-01-01"), setById: S(true), overrideReason: S(true), createdAt: D(), updatedAt: D() },
  SettingProfile: { id: S(), tenantId: S(), unitId: S(), domain: S(), templateKey: S(), templateVersion: I(), appliedById: S(), appliedAt: D() },
  SettingChange: {
    id: S(), tenantId: S(), unitId: S(true), key: S(), scope: S(), scopeId: S(), before: J(true), after: J(true), effectiveFrom: D(),
    legalLevel: S(), legalCode: S(true), reason: S(true), approvalId: S(true), actorId: S(), at: D(),
  },
  // CC §2.2
  TenantIntegration: {
    id: S(), tenantId: S(), kind: S(), provider: S(), label: S(), unitIds: A(false, "{}"), status: S(false, "DRAFT"), publicFields: J(false, "{}"),
    secretBox: S(true), secretNames: A(false, "{}"), onFailure: S(false, "MANUAL"), lastTestAt: D(true), lastTestOk: B(true), lastError: S(true),
    consecutiveFailures: I(false, "0"), quota: J(true), createdById: S(), updatedById: S(), createdAt: D(), updatedAt: D(),
  },
  IntegrationCallLog: { id: S(), tenantId: S(), integrationId: S(), op: S(), ok: B(), ms: I(), code: S(true), at: D() },
  // CC §3.2
  PaymentSlip: {
    id: S(), tenantId: S(), unitId: S(), domain: S(), refType: S(), refId: S(), partyId: S(true), fileId: S(), imageHash: S(), transRef: S(true),
    expectedSatang: I(), amountSatang: I(true), payerName: S(true), bankCode: S(true), transferredAt: D(true), checks: J(),
    verifierIntegrationId: S(true), verifierResult: J(true), status: S(), reviewReason: S(true), decidedById: S(true), decidedAt: D(true), createdAt: D(),
  },
  // CC §4.2
  ChatLinkCode: {
    id: S(), tenantId: S(), connectionId: S(true), purpose: S(), refId: S(), codeHash: S(), codeLast4: S(), expiresAt: D(), usedAt: D(true),
    usedByChatContactId: S(true), createdAt: D(),
  },
  ServiceMessageLog: { id: S(), tenantId: S(), unitId: S(), domain: S(), messageKey: S(), dedupeKey: S(), channel: S(), status: S(), partyId: S(true), at: D() },
  // CC §5.2
  RoomBuilding: { id: S(), tenantId: S(), unitId: S(), name: S(), floors: I(), sortOrder: I() },
  RoomOccupancy: {
    id: S(), tenantId: S(), unitId: S(), roomId: S(), startDate: { t: "date", n: false }, endDate: { t: "date", n: false }, kind: S(), refType: S(), refId: S(),
    active: B(false, "true"), holdExpiresAt: D(true), createdAt: D(), updatedAt: D(),
  },
};
// คอลัมน์ที่เพิ่มบนตารางเดิม (CC §5.2) — คอลัมน์เดิมต้องอยู่ครบ
const ADDED_COLS: Record<string, Record<string, Col>> = {
  HotelRoomType: { monthlyRateSatang: I(true), areaSqm: { t: "numeric", n: true }, rentMode: S(false, "NIGHTLY"), amenities: J(true) },
  HotelRoom: { buildingId: S(true), floorNo: I(true), floor: S(true), rentMode: S(true), hkStatus: S(false, "CLEAN") },
};
// ดัชนีตาม CC: u = unique · cols ตามลำดับ
const IDX: { id: string; table: string; cols: string[]; u: boolean }[] = [
  { id: "I-1", table: "SettingValue", cols: ["tenantId", "key", "scope", "scopeId", "effectiveFrom"], u: true },
  { id: "I-2", table: "SettingValue", cols: ["tenantId", "scope", "scopeId"], u: false },
  { id: "I-3", table: "SettingProfile", cols: ["unitId", "domain"], u: true },
  { id: "I-4", table: "TenantIntegration", cols: ["tenantId", "kind", "provider", "label"], u: true },
  { id: "I-5", table: "TenantIntegration", cols: ["tenantId", "kind"], u: false },
  { id: "I-6", table: "IntegrationCallLog", cols: ["tenantId", "integrationId", "at"], u: false },
  { id: "I-7", table: "PaymentSlip", cols: ["tenantId", "unitId", "status", "createdAt"], u: false },
  { id: "I-8", table: "PaymentSlip", cols: ["refType", "refId"], u: false },
  { id: "I-9", table: "ChatLinkCode", cols: ["tenantId", "codeHash"], u: true },
  { id: "I-10", table: "ServiceMessageLog", cols: ["tenantId", "dedupeKey"], u: true },
];
const NEW_MODELS = Object.keys(NEW_TABLES);
const OLD_UNIT_TYPES = ["HOTEL", "RESTAURANT", "BOOKING", "QUEUE", "TICKET", "SHOP", "RENTAL", "SCHOOL", "CLINIC"];
const OWNED_SCHEMA = new Set(["settings.prisma", "integration.prisma", "payment.prisma", "chat.prisma", "hotel.prisma", "core.prisma"]);

// ═══════════════ E. scripts/svc-qc-env.mts (ไม่ต่อฐาน) ═══════════════
console.log("\n── E: scripts/svc-qc-env.mts ปฏิเสธ host ที่ไม่ใช่ qc-svc ──");
const ENV_FILE = join(ROOT, "scripts", "svc-qc-env.mts");
if (!existsSync(ENV_FILE)) {
  for (const [id, n] of [
    ["E-1", "มีไฟล์ + export loadSvcQcEnv / SVC_QC_HOST_MARK"],
    ["E-2", "production ⇒ exit 4"],
    ["E-3", "QC ของ RUN อื่น (QC4 ep-frosty-lab) ⇒ exit 4"],
    ["E-4", "host อื่นที่ไม่รู้จัก ⇒ exit 4"],
    ["E-5", "DATABASE_URL ถูกแต่ DIRECT_URL ผิด ⇒ exit 4"],
    ["E-6", "APP_ENV=production ⇒ exit 4"],
    ["E-7", "qc-svc (ep-mute-scene) ⇒ ผ่าน exit 0"],
    ["E-8", "ไฟล์ไม่ import prisma/@/ (import ได้จาก fitness)"],
  ] as const) skip(id, n, "ยังไม่มี scripts/svc-qc-env.mts (งานของ builder ใบ R0.1)");
} else {
  const src = readFileSync(ENV_FILE, "utf8");
  let modOk = false;
  try {
    const m = (await import(pathToFileURL(ENV_FILE).href)) as Record<string, unknown>;
    modOk = typeof m.loadSvcQcEnv === "function" && m.SVC_QC_HOST_MARK === SVC_HOST;
    chk("E-1", "มีไฟล์ + export loadSvcQcEnv(label) และ SVC_QC_HOST_MARK === \"ep-mute-scene\"", modOk, `loadSvcQcEnv=${typeof m.loadSvcQcEnv} mark=${String(m.SVC_QC_HOST_MARK)}`);
  } catch (e) {
    chk("E-1", "import scripts/svc-qc-env.mts ได้", false, errMsg(e));
  }
  const probe = `/tmp/svc-r01-envprobe-${process.pid}.mts`;
  writeFileSync(probe, `import { loadSvcQcEnv } from ${JSON.stringify(pathToFileURL(ENV_FILE).href)};\nloadSvcQcEnv("svc-r01-probe");\nconsole.log("PROBE_PASSED");\n`);
  const u = (h: string) => `postgresql://qc:qc@${h}.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`;
  const run = (db: string, direct: string, extra: Record<string, string> = {}) => {
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v;
    delete env.APP_ENV;
    Object.assign(env, { DATABASE_URL: db, DIRECT_URL: direct, QC_ENV_FILE: "/nonexistent/svc-r01-no-env-file", POS_QC_ALLOW_HOST: "" }, extra);
    const r = spawnSync(process.execPath, [...process.execArgv, probe], { cwd: ROOT, env, encoding: "utf8", timeout: 60_000 });
    return { code: r.status, passed: (r.stdout ?? "").includes("PROBE_PASSED") };
  };
  try {
    const good = u(`${SVC_HOST}-a1b2c3-pooler`);
    const cases: [string, string, ReturnType<typeof run>, boolean][] = [
      ["E-2", "production ⇒ exit 4", run(u("ep-royal-night-x1-pooler"), u("ep-royal-night-x1")), false],
      ["E-3", "QC ของ RUN อื่น (QC4 ep-frosty-lab) ⇒ exit 4", run(u("ep-frosty-lab-x1-pooler"), u("ep-frosty-lab-x1")), false],
      ["E-4", "host อื่นที่ไม่รู้จัก ⇒ exit 4", run(u("ep-some-other-x1-pooler"), u("ep-some-other-x1")), false],
      ["E-5", "DATABASE_URL ถูกแต่ DIRECT_URL ผิด ⇒ exit 4", run(good, u("ep-royal-night-x1")), false],
      ["E-6", "APP_ENV=production ⇒ exit 4", run(good, u(`${SVC_HOST}-a1b2c3`), { APP_ENV: "production" }), false],
      ["E-7", "qc-svc (ep-mute-scene) ⇒ ผ่าน exit 0", run(good, u(`${SVC_HOST}-a1b2c3`)), true],
    ];
    for (const [id, n, r, pass] of cases) {
      chk(id, n, pass ? r.code === 0 && r.passed : r.code === 4 && !r.passed, `exit=${r.code} passed=${r.passed}`);
    }
  } finally {
    try { unlinkSync(probe); } catch { /* ไม่มีก็ได้ */ }
  }
  const imports = [...src.matchAll(/^\s*import\s[^;]*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]);
  const badImp = imports.filter((p) => p.startsWith("@/") || p.includes("prisma") || p.includes("core/db"));
  chk("E-8", "ไฟล์ไม่ import prisma/`@/…` (import ได้จาก fitness/ที่ไม่มี env)", badImp.length === 0, badImp.join(", "), "MAJOR");
}

// ═══════════════ F. scope registry (fitness F1) + Prisma client ═══════════════
console.log("\n── F: ทุกโมเดลใหม่ลงทะเบียน scope (F1) + client ──");
{
  const schemaDir = join(ROOT, "prisma", "schema");
  const schemaModels = new Set<string>();
  for (const f of readdirSync(schemaDir).filter((x) => x.endsWith(".prisma"))) {
    for (const m of readFileSync(join(schemaDir, f), "utf8").matchAll(/^model\s+(\w+)\s*\{/gm)) schemaModels.add(m[1]);
  }
  const notInSchema = NEW_MODELS.filter((m) => !schemaModels.has(m));
  chk("F-1", `โมเดลใหม่ ${NEW_MODELS.length} ตัวอยู่ใน prisma/schema`, notInSchema.length === 0, `ขาด: ${notInSchema.join(", ")}`);
  const scopeSrc = readFileSync(join(ROOT, "src", "lib", "core", "scope.ts"), "utf8");
  const registered = new Set([...scopeSrc.matchAll(/^\s{2}(\w+):\s*(?:g\(|tenant|unit|sys\(|\{)/gm)].map((m) => m[1]));
  const missingAll = [...schemaModels].filter((m) => !registered.has(m));
  chk("F-2", "fitness F1.1: ทุก model ใน schema ลงทะเบียนใน scope.ts", missingAll.length === 0, `ยังไม่ลง: ${missingAll.join(", ")}`);
  // แกน: โมเดลใหม่ทุกตัวมี tenantId ⇒ ต้องเป็น tenant หรือ unit (unit ได้เฉพาะตัวที่ unitId บังคับ) — ห้าม global/platform/system
  try {
    const scope = (await import("@/lib/core/scope")) as { scopeOf: (m: string) => { axis: string } ; assertRegistryComplete: (m: string[]) => void };
    const unitRequired = new Set(Object.entries(NEW_TABLES).filter(([, c]) => c.unitId && !c.unitId.n).map(([t]) => t));
    const wrong: string[] = [];
    for (const m of NEW_MODELS) {
      let axis = "(ไม่ลงทะเบียน)";
      try { axis = scope.scopeOf(m).axis; } catch { /* โยน = ไม่ลงทะเบียน */ }
      const ok = axis === "tenant" || (axis === "unit" && unitRequired.has(m));
      if (!ok) wrong.push(`${m}=${axis}`);
    }
    chk("F-3", "แกน scope ของโมเดลใหม่ = tenant (หรือ unit เมื่อ unitId บังคับ)", wrong.length === 0, wrong.join(" · "));
    try {
      const { Prisma } = (await import("@prisma/client")) as unknown as { Prisma: { dmmf: { datamodel: { models: { name: string; fields: { name: string }[] }[] } } } };
      const dm = Prisma.dmmf.datamodel.models;
      const names = new Set(dm.map((m) => m.name));
      const noClient = NEW_MODELS.filter((m) => !names.has(m));
      const roomFields = new Set(dm.find((m) => m.name === "HotelRoom")?.fields.map((f) => f.name) ?? []);
      chk("F-4", "Prisma client generate แล้ว (รู้จักโมเดลใหม่ + HotelRoom.hkStatus)", noClient.length === 0 && roomFields.has("hkStatus"), `ขาดใน client: ${noClient.join(", ")}${roomFields.has("hkStatus") ? "" : " · HotelRoom.hkStatus"}`);
      let bootErr = "";
      try { scope.assertRegistryComplete(dm.map((m) => m.name)); } catch (e) { bootErr = errMsg(e); }
      chk("F-5", "boot assert (assertRegistryComplete ของ db.ts) ผ่านกับ client ปัจจุบัน", bootErr === "", bootErr);
    } catch (e) {
      chk("F-4", "import @prisma/client ได้", false, errMsg(e));
    }
  } catch (e) {
    chk("F-3", "import src/lib/core/scope.ts ได้", false, errMsg(e));
  }
}

// ═══════════════ M. ไฟล์ migration ═══════════════
console.log("\n── M: migration svc_r0 additive ล้วน ──");
const migDir = join(ROOT, "prisma", "migrations");
const migs = readdirSync(migDir).filter((d) => /^\d{14}_/.test(d)).sort();
const r0 = migs.filter((d) => /_svc_r0$/.test(d));
const laterSvc = r0.length === 1 ? migs.slice(migs.indexOf(r0[0]) + 1).filter((d) => /_svc_/.test(d)) : [];
let migName = "";
chk("M-1", "มีโฟลเดอร์ migration `<ts>_svc_r0` ตัวเดียว", r0.length === 1, `พบ ${r0.length}: ${r0.join(", ")}`);
if (r0.length === 1) {
  migName = r0[0];
  const sql = readFileSync(join(migDir, migName, "migration.sql"), "utf8");
  const code = sql.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");
  const stmts = code.split(";").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
  const bad: string[] = [];
  for (const s of stmts) {
    if (/\bDROP\b/i.test(s)) bad.push(`DROP: ${s.slice(0, 80)}`);
    if (/\bRENAME\b/i.test(s)) bad.push(`RENAME: ${s.slice(0, 80)}`);
    if (/ALTER\s+COLUMN\s+\S+\s+(SET\s+DATA\s+)?TYPE/i.test(s)) bad.push(`เปลี่ยนชนิด: ${s.slice(0, 80)}`);
    if (/SET\s+NOT\s+NULL/i.test(s)) bad.push(`SET NOT NULL: ${s.slice(0, 80)}`);
    if (/^ALTER\s+TYPE/i.test(s) && !/ADD\s+VALUE/i.test(s)) bad.push(`ALTER TYPE ไม่ใช่ ADD VALUE: ${s.slice(0, 80)}`);
    if (/^ALTER\s+TYPE/i.test(s) && /\b(BEFORE|AFTER)\b/i.test(s)) bad.push(`ADD VALUE ต้องต่อท้าย: ${s.slice(0, 80)}`);
    if (/^ALTER\s+TABLE/i.test(s)) {
      for (const add of s.split(/,\s*(?=ADD\s+COLUMN)/i)) {
        if (/ADD\s+COLUMN/i.test(add) && /NOT\s+NULL/i.test(add) && !/DEFAULT/i.test(add)) bad.push(`ADD COLUMN NOT NULL ไร้ DEFAULT: ${add.slice(0, 80)}`);
      }
    }
    if (/^DELETE\b|^UPDATE\b|^TRUNCATE\b/i.test(s)) bad.push(`แก้ข้อมูล: ${s.slice(0, 80)}`);
  }
  chk("M-2", "SQL additive ล้วน (ไม่มี DROP/RENAME/เปลี่ยนชนิด/SET NOT NULL/NOT NULL ไร้ default/ALTER TYPE อื่นนอก ADD VALUE ต่อท้าย)", bad.length === 0, bad.slice(0, 4).join(" | "));
  chk("M-3", "SQL มือ: CREATE EXTENSION IF NOT EXISTS btree_gist + EXCLUDE USING gist + partial unique 2 ตัวของ PaymentSlip",
    /CREATE\s+EXTENSION\s+IF\s+NOT\s+EXISTS\s+"?btree_gist"?/i.test(code) && /EXCLUDE\s+USING\s+gist/i.test(code) &&
      (code.match(/CREATE\s+UNIQUE\s+INDEX[^;]*"PaymentSlip"[^;]*WHERE/gi) ?? []).length >= 2,
    "ขาดบางชิ้น");
} else {
  skip("M-2", "SQL additive ล้วน", "ไม่มี migration svc_r0");
  skip("M-3", "SQL มือ (btree_gist · EXCLUDE · partial unique)", "ไม่มี migration svc_r0");
}
// แตะเฉพาะไฟล์ schema ของใบ + ไม่ reflow ทั้งชุด (ตรวจเฉพาะตอนยังไม่มีใบ migration ถัดไปของ SVC)
if (laterSvc.length > 0) {
  skip("M-4", "แตะเฉพาะไฟล์ schema ของใบ (ไม่ prisma format ทั้งชุด)", `มี migration SVC ใบถัดไปแล้ว (${laterSvc[0]}) — ข้อนี้ตรวจเฉพาะตอนรับ R0.1`, "MAJOR");
} else {
  try {
    const changed = execFileSync("git", ["-C", ROOT, "diff", "-w", "--ignore-blank-lines", "--name-only", BASE_SHA, "--", "prisma/schema"], { encoding: "utf8" })
      .split("\n").filter(Boolean);
    const untracked = execFileSync("git", ["-C", ROOT, "ls-files", "--others", "--exclude-standard", "prisma/schema"], { encoding: "utf8" }).split("\n").filter(Boolean);
    const outside = [...changed, ...untracked].map((p) => p.split("/").pop() ?? p).filter((f) => !OWNED_SCHEMA.has(f));
    const dels = execFileSync("git", ["-C", ROOT, "diff", "-w", "--ignore-blank-lines", "--numstat", BASE_SHA, "--", "prisma/schema"], { encoding: "utf8" })
      .split("\n").filter(Boolean).map((l) => l.split("\t")).filter(([, d]) => d !== "-" && Number(d) > 0).map(([, d, f]) => `${f}(-${d})`);
    chk("M-4", "แตะเฉพาะไฟล์ schema ของใบ + ไม่ลบ/แก้บรรทัดเดิม (ยกเว้นช่องว่าง)", outside.length === 0 && dels.length === 0,
      `${outside.length ? `ไฟล์นอกใบ: ${outside.join(", ")} ` : ""}${dels.length ? `ลบบรรทัด: ${dels.join(", ")}` : ""}`, "MAJOR");
  } catch (e) {
    chk("M-4", "อ่าน git diff ได้", false, errMsg(e), "MAJOR");
  }
}

// ═══════════════ ต่อฐาน ═══════════════
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 12 });
const q = async <T extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, params: unknown[] = []) => (await pool.query<T>(sql, params)).rows;

const colCache = new Map<string, { column_name: string; data_type: string; is_nullable: string; column_default: string | null }[]>();
async function cols(table: string) {
  if (!colCache.has(table)) {
    colCache.set(table, await q<{ column_name: string; data_type: string; is_nullable: string; column_default: string | null }>(
      `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1`, [table]));
  }
  return colCache.get(table) ?? [];
}
const autoFilled: string[] = [];
/** INSERT แถวทดสอบ — เติมคอลัมน์ NOT NULL ไร้ค่าเริ่มที่สัญญาไม่ได้ระบุให้เอง (จดชื่อไว้แจ้ง) */
async function insertRow(table: string, vals: Record<string, unknown>, client: pg.Pool | pg.PoolClient = pool): Promise<void> {
  const v: Record<string, unknown> = { ...vals };
  for (const c of await cols(table)) {
    if (c.column_name in v || c.is_nullable === "YES" || c.column_default !== null) continue;
    const t = c.data_type;
    v[c.column_name] = t === "text" || t.startsWith("character") ? "qc" : t === "integer" || t === "bigint" || t === "numeric" || t === "double precision" ? 0
      : t === "boolean" ? false : t === "jsonb" || t === "json" ? "{}" : t.startsWith("timestamp") ? new Date() : t === "date" ? "2031-01-01" : t === "ARRAY" ? [] : null;
    autoFilled.push(`${table}.${c.column_name}`);
  }
  const keys = Object.keys(v);
  await client.query(`INSERT INTO "${table}" (${keys.map((k) => `"${k}"`).join(", ")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(", ")})`, keys.map((k) => v[k]));
}

const tenantIds: string[] = [];
const NEW_WITH_TENANT = [...NEW_MODELS].reverse(); // ลบลูกก่อน
async function cleanup(ids: string[]) {
  if (ids.length === 0) return;
  const existing = new Set((await q<{ table_name: string }>(`SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema()`)).map((r) => r.table_name));
  for (const t of [...NEW_WITH_TENANT, "HotelRoom", "HotelRoomType", "BusinessUnit"]) {
    if (!existing.has(t)) continue;
    try { await pool.query(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, [ids]); } catch (e) { console.log(`  ⚠️ ลบ ${t} ไม่ได้: ${errMsg(e)}`); }
  }
  try { await pool.query(`DELETE FROM "Tenant" WHERE id = ANY($1::text[])`, [ids]); } catch (e) { console.log(`  ⚠️ ลบ Tenant ไม่ได้: ${errMsg(e)}`); }
}

try {
  // กวาดของค้างจากรอบก่อน (เฉพาะ tenant ของข้อสอบนี้)
  const stale = (await q<{ id: string }>(`SELECT id FROM "Tenant" WHERE slug LIKE 'qc-svc-r01-%'`)).map((r) => r.id);
  if (stale.length) { console.log(`\n(กวาด tenant ค้างจากรอบก่อน ${stale.length} ร้าน)`); await cleanup(stale); }

  // ═══════════════ T. ตาราง/คอลัมน์ ═══════════════
  console.log("\n── T: ตาราง/คอลัมน์ครบตาม CC ──");
  const tableOk = new Map<string, boolean>();
  let ti = 0;
  for (const [table, spec] of [...Object.entries(NEW_TABLES), ...Object.entries(ADDED_COLS)]) {
    ti++;
    const have = new Map((await cols(table)).map((c) => [c.column_name, c]));
    const probs: string[] = [];
    if (have.size === 0) probs.push("ไม่มีตาราง");
    else {
      for (const [c, want] of Object.entries(spec)) {
        const h = have.get(c);
        if (!h) { probs.push(`ขาด ${c}`); continue; }
        if (h.data_type !== want.t) probs.push(`${c}: ชนิด ${h.data_type} ≠ ${want.t}`);
        if ((h.is_nullable === "YES") !== want.n) probs.push(`${c}: ${want.n ? "ต้อง null ได้" : "ต้อง NOT NULL"}`);
        const defOk = !want.d || (h.column_default ?? "").includes(want.d) || (want.t === "ARRAY" && want.d === "{}" && /ARRAY\[\]/.test(h.column_default ?? ""));
        if (!defOk) probs.push(`${c}: default ${h.column_default ?? "(ไม่มี)"} ≠ ${want.d}`);
      }
    }
    tableOk.set(table, probs.length === 0);
    const isNew = table in NEW_TABLES;
    chk(`T-${ti}`, `${table}${isNew ? "" : " (คอลัมน์เพิ่ม)"} — ${Object.keys(spec).length} คอลัมน์`, probs.length === 0, probs.slice(0, 5).join(" · "));
  }
  // คอลัมน์เดิมของ HotelRoom/HotelRoomType ยังอยู่ (additive)
  {
    const r = new Set((await cols("HotelRoom")).map((c) => c.column_name));
    const rt = new Set((await cols("HotelRoomType")).map((c) => c.column_name));
    const lost = [...["id", "tenantId", "unitId", "roomTypeId", "number", "floor", "status", "active", "note"].filter((c) => !r.has(c)).map((c) => `HotelRoom.${c}`),
      ...["id", "tenantId", "unitId", "name", "capacity", "baseRateSatang", "depositSatang", "active"].filter((c) => !rt.has(c)).map((c) => `HotelRoomType.${c}`)];
    chk("T-13", "คอลัมน์เดิมของ HotelRoom/HotelRoomType อยู่ครบ (ไม่ rename · K11)", lost.length === 0, lost.join(", "));
  }

  // ═══════════════ I. ดัชนี ═══════════════
  console.log("\n── I: ดัชนี/unique ตาม CC ──");
  type IxRow = { name: string; uniq: boolean; cols: string[]; pred: string | null; def: string };
  const ixOf = (table: string) => q<IxRow>(
    `SELECT i.relname AS name, ix.indisunique AS uniq,
            ARRAY(SELECT a.attname::text FROM unnest(ix.indkey) WITH ORDINALITY k(n, o) JOIN pg_attribute a ON a.attrelid = ix.indrelid AND a.attnum = k.n ORDER BY k.o) AS cols,
            pg_get_expr(ix.indpred, ix.indrelid) AS pred, pg_get_indexdef(ix.indexrelid) AS def
       FROM pg_index ix JOIN pg_class i ON i.oid = ix.indexrelid JOIN pg_class t ON t.oid = ix.indrelid
       JOIN pg_namespace ns ON ns.oid = t.relnamespace
      WHERE t.relname = $1 AND ns.nspname = current_schema()`, [table]);
  for (const x of IDX) {
    const rows = await ixOf(x.table);
    const hit = rows.find((r) => r.pred === null && r.uniq === x.u && r.cols.join(",") === x.cols.join(","));
    chk(x.id, `${x.table} ${x.u ? "@@unique" : "@@index"}(${x.cols.join(", ")})`, !!hit, rows.length ? "ไม่พบดัชนีตรงคอลัมน์/ลำดับ" : "ไม่มีตาราง/ดัชนี");
  }
  {
    const rows = await ixOf("PaymentSlip");
    const pHash = rows.find((r) => r.uniq && r.cols.join(",") === "tenantId,imageHash" && /REJECTED/.test(r.pred ?? "") && !/transRef/.test(r.pred ?? ""));
    const pRef = rows.find((r) => r.uniq && r.cols.join(",") === "tenantId,transRef" && /REJECTED/.test(r.pred ?? "") && /transRef.*IS NOT NULL/i.test(r.pred ?? ""));
    chk("I-11", "PaymentSlip unique บางส่วน (tenantId, imageHash) WHERE status <> 'REJECTED'", !!pHash, pHash ? "" : "ไม่พบ");
    chk("I-12", "PaymentSlip unique บางส่วน (tenantId, transRef) WHERE transRef IS NOT NULL AND status <> 'REJECTED'", !!pRef, pRef ? "" : "ไม่พบ");
  }
  const ext = await q<{ extversion: string }>(`SELECT extversion FROM pg_extension WHERE extname = 'btree_gist'`);
  chk("I-13", "extension btree_gist ติดตั้งบน qc-svc", ext.length === 1, "ไม่มี btree_gist");
  const excl = await q<{ def: string }>(
    `SELECT pg_get_constraintdef(c.oid) AS def FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace ns ON ns.oid = t.relnamespace WHERE t.relname = 'RoomOccupancy' AND ns.nspname = current_schema() AND c.contype = 'x'`);
  const exclOk = excl.some((r) => /gist/i.test(r.def) && /"roomId" WITH =/.test(r.def) && /daterange\("startDate", "endDate", '\[\)'/.test(r.def) && /WITH &&/.test(r.def) && /WHERE \(active\)/.test(r.def));
  chk("I-14", "RoomOccupancy EXCLUDE USING gist (roomId =, daterange(startDate,endDate,'[)') &&) WHERE (active)", exclOk, excl.length ? excl.map((r) => r.def).join(" | ").slice(0, 200) : "ไม่มี exclusion constraint");

  // ═══════════════ N. enum ═══════════════
  console.log("\n── N: enum UnitType ──");
  const en = (await q<{ l: string }>(`SELECT e.enumlabel AS l FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'UnitType' ORDER BY e.enumsortorder`)).map((r) => r.l);
  chk("N-1", "UnitType มี DORM และอยู่ท้ายสุด", en[en.length - 1] === "DORM", `ได้ [${en.join(", ")}]`);
  chk("N-2", "ค่าเดิม 9 ตัวคงลำดับ (ต่อท้ายเท่านั้น)", OLD_UNIT_TYPES.every((v, i) => en[i] === v), `ได้ [${en.join(", ")}]`);
  const coreSrc = readFileSync(join(ROOT, "prisma", "schema", "core.prisma"), "utf8");
  const enumBlock = coreSrc.match(/enum UnitType \{([\s\S]*?)\}/)?.[1] ?? "";
  const vals = enumBlock.split("\n").map((l) => l.replace(/\/\/.*$/, "").trim()).filter(Boolean);
  chk("N-3", "core.prisma: DORM ต่อท้าย enum UnitType", vals[vals.length - 1] === "DORM", `ได้ [${vals.join(", ")}]`);

  // M-5 migration ลงฐานแล้ว
  if (migName) {
    const m = await q<{ finished_at: Date | null; rolled_back_at: Date | null }>(`SELECT finished_at, rolled_back_at FROM "_prisma_migrations" WHERE migration_name = $1`, [migName]);
    chk("M-5", `migration ${migName} ลง qc-svc แล้ว (finished · ไม่ rolled back)`, m.length === 1 && m[0].finished_at !== null && m[0].rolled_back_at === null, `แถว ${m.length}`);
  } else skip("M-5", "migration svc_r0 ลง qc-svc แล้ว", "ไม่มี migration svc_r0");

  // ═══════════════ fixture ═══════════════
  const mkTenant = async (tag: string) => {
    const id = rid(`t${tag}`);
    await insertRow("Tenant", { id, name: `QC SVC R0.1 ${tag}`, slug: `qc-svc-r01-${tag}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, updatedAt: new Date() });
    tenantIds.push(id);
    const unitId = rid(`u${tag}`);
    await insertRow("BusinessUnit", { id: unitId, tenantId: id, type: "HOTEL", name: "หอทดสอบ R0.1", slug: `u-${tag}-${Date.now().toString(36)}`, updatedAt: new Date() });
    return { tenantId: id, unitId };
  };
  const T1 = await mkTenant("a");
  const T2 = await mkTenant("b");

  // ═══════════════ O. RoomOccupancy ═══════════════
  console.log("\n── O: RoomOccupancy กันจองซ้อนระดับ DB ──");
  if (!tableOk.get("RoomOccupancy") || !exclOk) {
    for (const [id, n] of [
      ["O-1", "ยิง INSERT ช่วงซ้อนห้องเดียว active พร้อมกัน 10 ทาง ⇒ สำเร็จ 1 · ถูกปฏิเสธ 9 (23P01)"],
      ["O-2", "หลังชน: DB มีแถว active ของห้องนั้นในช่วงนั้น 1 แถว"],
      ["O-3", "ช่วงติดกันแบบ [) (จบ 15 · เริ่ม 15) ⇒ ได้"],
      ["O-4", "inactive ซ้อนกับ active ⇒ ได้ (2 แถว)"],
      ["O-5", "UPDATE แถว inactive ที่ซ้อน ⇒ active=true ⇒ DB ปฏิเสธ"],
      ["O-6", "UPDATE ขยายช่วง active ไปทับอีกแถว ⇒ DB ปฏิเสธ"],
      ["O-7", "ห้องอื่น ช่วงเดียวกัน ⇒ ได้"],
      ["O-8", "ปล่อยแถว (active=false) แล้วจองช่วงเดิมใหม่ ⇒ ได้"],
    ] as const) skip(id, n, !tableOk.get("RoomOccupancy") ? "ยังไม่มีตาราง RoomOccupancy ตาม CC §5.2" : "ยังไม่มี EXCLUDE constraint (I-14)");
  } else {
    const rtId = rid("rt");
    await insertRow("HotelRoomType", { id: rtId, tenantId: T1.tenantId, unitId: T1.unitId, name: "ห้องพัดลม", updatedAt: new Date() });
    const roomA = rid("ra"); const roomB = rid("rb");
    await insertRow("HotelRoom", { id: roomA, tenantId: T1.tenantId, unitId: T1.unitId, roomTypeId: rtId, number: "A101", updatedAt: new Date() });
    await insertRow("HotelRoom", { id: roomB, tenantId: T1.tenantId, unitId: T1.unitId, roomTypeId: rtId, number: "A102", updatedAt: new Date() });
    const occ = (roomId: string, start: string, end: string, extra: Record<string, unknown> = {}, client: pg.Pool | pg.PoolClient = pool) => {
      const id = rid("oc");
      return insertRow("RoomOccupancy", {
        id, tenantId: T1.tenantId, unitId: T1.unitId, roomId, startDate: start, endDate: end, kind: "LEASE", refType: "QC", refId: id,
        active: true, createdAt: new Date(), updatedAt: new Date(), ...extra,
      }, client).then(() => id);
    };
    // O-1: 10 ทางพร้อมกัน ทุกช่วงคร่อมวันที่ 2031-05-10 (ช่วงต่างกัน) — แต่ละทางถือ connection ของตัวเองก่อนยิง
    const clients = await Promise.all(Array.from({ length: 10 }, () => pool.connect()));
    let res: PromiseSettledResult<string>[] = [];
    try {
      res = await Promise.allSettled(clients.map((c, i) => occ(roomA, `2031-05-${String(10 - (i % 3)).padStart(2, "0")}`, `2031-05-${String(11 + (i % 4)).padStart(2, "0")}`, {}, c)));
    } finally {
      for (const c of clients) c.release();
    }
    const okN = res.filter((r) => r.status === "fulfilled").length;
    const exclN = res.filter((r) => r.status === "rejected" && pgCode(r.reason) === "23P01").length;
    const otherErr = res.filter((r): r is PromiseRejectedResult => r.status === "rejected" && pgCode(r.reason) !== "23P01").map((r) => `${pgCode(r.reason)} ${errMsg(r.reason)}`);
    chk("O-1", "ยิง INSERT ช่วงซ้อนห้องเดียว active พร้อมกัน 10 ทาง ⇒ สำเร็จ 1 · ถูกปฏิเสธ 9 (23P01)", okN === 1 && exclN === 9, `ok=${okN} 23P01=${exclN} อื่น=${otherErr.slice(0, 2).join(" | ")}`);
    const [{ n: activeN }] = await q<{ n: number }>(
      `SELECT count(*)::int AS n FROM "RoomOccupancy" WHERE "roomId" = $1 AND active AND daterange("startDate","endDate",'[)') && daterange('2031-05-01','2031-05-31','[)')`, [roomA]);
    chk("O-2", "หลังชน: DB มีแถว active ของห้องนั้นในช่วงนั้น 1 แถว", activeN === 1, `พบ ${activeN}`);
    const firstId = res.find((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled")?.value ?? "";
    // O-3: ติดกันแบบ [) — แถวแรกจบไม่เกิน 15 ⇒ เริ่ม 15 ได้
    let o3 = "";
    try { await occ(roomA, "2031-05-15", "2031-05-20"); } catch (e) { o3 = `${pgCode(e)} ${errMsg(e)}`; }
    chk("O-3", "ช่วงติดกันแบบ [) (เดิมจบ ≤15 · ใหม่เริ่ม 15) ⇒ ได้", o3 === "", o3);
    // O-4: inactive ซ้อนได้
    let o4 = ""; let inactiveId = "";
    try { inactiveId = await occ(roomA, "2031-05-09", "2031-05-12", { active: false }); } catch (e) { o4 = `${pgCode(e)} ${errMsg(e)}`; }
    chk("O-4", "inactive ซ้อนกับ active ⇒ ได้", o4 === "", o4);
    // O-5: เปิด inactive ที่ซ้อน ⇒ ปฏิเสธ
    if (inactiveId) {
      let code5 = "";
      try { await pool.query(`UPDATE "RoomOccupancy" SET active = true WHERE id = $1`, [inactiveId]); } catch (e) { code5 = pgCode(e); }
      chk("O-5", "UPDATE แถว inactive ที่ซ้อน ⇒ active=true ⇒ DB ปฏิเสธ (23P01)", code5 === "23P01", `code=${code5 || "(ผ่าน — ผิด)"}`);
    } else skip("O-5", "UPDATE inactive→active ที่ซ้อน ⇒ ปฏิเสธ", "O-4 สร้างแถวไม่ได้");
    // O-6: ขยายช่วงแถวแรกไปทับแถว O-3 ⇒ ปฏิเสธ
    if (firstId && !o3) {
      let code6 = "";
      try { await pool.query(`UPDATE "RoomOccupancy" SET "endDate" = '2031-05-18' WHERE id = $1`, [firstId]); } catch (e) { code6 = pgCode(e); }
      chk("O-6", "UPDATE ขยายช่วง active ไปทับอีกแถว ⇒ DB ปฏิเสธ (23P01)", code6 === "23P01", `code=${code6 || "(ผ่าน — ผิด)"}`);
    } else skip("O-6", "UPDATE ขยายช่วงทับ ⇒ ปฏิเสธ", "O-1/O-3 ไม่ได้แถวตั้งต้น");
    // O-7: ห้องอื่น
    let o7 = "";
    try { await occ(roomB, "2031-05-09", "2031-05-14"); } catch (e) { o7 = `${pgCode(e)} ${errMsg(e)}`; }
    chk("O-7", "ห้องอื่น ช่วงเดียวกัน ⇒ ได้", o7 === "", o7);
    // O-8: ปล่อยแล้วจองใหม่
    if (firstId) {
      let o8 = "";
      try {
        await pool.query(`UPDATE "RoomOccupancy" SET active = false WHERE id = $1`, [firstId]);
        await occ(roomA, "2031-05-10", "2031-05-11");
      } catch (e) { o8 = `${pgCode(e)} ${errMsg(e)}`; }
      chk("O-8", "ปล่อยแถว (active=false) แล้วจองช่วงเดิมใหม่ ⇒ ได้", o8 === "", o8);
    } else skip("O-8", "ปล่อยแล้วจองใหม่ ⇒ ได้", "O-1 ไม่มีแถวสำเร็จ");
  }

  // ═══════════════ S. PaymentSlip ═══════════════
  console.log("\n── S: PaymentSlip unique บางส่วน ──");
  const slipReady = tableOk.get("PaymentSlip");
  const S_LIST = [
    ["S-1", "สลิปรูปเดียวกัน (imageHash) ร้านเดียว 2 ใบที่ไม่ใช่ REJECTED ⇒ ใบที่ 2 ถูกปฏิเสธ (23505)"],
    ["S-2", "ใบเดิม REJECTED แล้ว ⇒ ส่งรูปเดิมใหม่ได้"],
    ["S-3", "REJECTED 2 ใบรูปเดียวกัน ⇒ ได้"],
    ["S-4", "transRef ซ้ำ (คนละรูป) ใบที่ไม่ใช่ REJECTED ⇒ ปฏิเสธ (23505)"],
    ["S-5", "transRef เป็น NULL หลายใบ ⇒ ได้"],
    ["S-6", "ร้านอื่น imageHash/transRef เดียวกัน ⇒ ได้ (unique ต่อร้าน)"],
    ["S-7", "ยิงสลิปรูปเดียวกันพร้อมกัน 10 ทาง ⇒ สำเร็จ 1 · ปฏิเสธ 9 (23505)"],
  ] as const;
  if (!slipReady) {
    for (const [id, n] of S_LIST) skip(id, n, "ยังไม่มีตาราง PaymentSlip ตาม CC §3.2");
  } else {
    const slip = (t: { tenantId: string; unitId: string }, hash: string, extra: Record<string, unknown> = {}, client: pg.Pool | pg.PoolClient = pool) => {
      const id = rid("sl");
      return insertRow("PaymentSlip", {
        id, tenantId: t.tenantId, unitId: t.unitId, domain: "DORM", refType: "DORM_BILL", refId: id, fileId: rid("f"), imageHash: hash, transRef: null,
        expectedSatang: 350000, checks: "{}", status: "PENDING", createdAt: new Date(), ...extra,
      }, client).then(() => id);
    };
    const tryCode = async (f: () => Promise<unknown>) => { try { await f(); return ""; } catch (e) { return pgCode(e) || errMsg(e); } };
    const h1 = rid("h");
    const a1 = await tryCode(() => slip(T1, h1));
    const a2 = await tryCode(() => slip(T1, h1, { status: "NEEDS_REVIEW" }));
    chk("S-1", S_LIST[0][1], a1 === "" && a2 === "23505", `ใบ1=${a1 || "ok"} ใบ2=${a2 || "ok (ผิด)"}`);
    const h2 = rid("h");
    const b1 = await tryCode(() => slip(T1, h2, { status: "REJECTED" }));
    const b2 = await tryCode(() => slip(T1, h2));
    chk("S-2", S_LIST[1][1], b1 === "" && b2 === "", `REJECTED=${b1 || "ok"} ใหม่=${b2 || "ok"}`);
    const h3 = rid("h");
    const c1 = await tryCode(() => slip(T1, h3, { status: "REJECTED" }));
    const c2 = await tryCode(() => slip(T1, h3, { status: "REJECTED" }));
    chk("S-3", S_LIST[2][1], c1 === "" && c2 === "", `${c1 || "ok"} / ${c2 || "ok"}`);
    const ref = rid("ref");
    const d1 = await tryCode(() => slip(T1, rid("h"), { transRef: ref, status: "AUTO_APPROVED" }));
    const d2 = await tryCode(() => slip(T1, rid("h"), { transRef: ref }));
    const d3 = await tryCode(() => slip(T1, rid("h"), { transRef: ref, status: "REJECTED" }));
    chk("S-4", S_LIST[3][1] + " · REJECTED ซ้ำได้", d1 === "" && d2 === "23505" && d3 === "", `ใบ1=${d1 || "ok"} ใบ2=${d2 || "ok (ผิด)"} REJECTED=${d3 || "ok"}`);
    const e1 = await tryCode(() => slip(T1, rid("h"), { transRef: null }));
    const e2 = await tryCode(() => slip(T1, rid("h"), { transRef: null }));
    chk("S-5", S_LIST[4][1], e1 === "" && e2 === "", `${e1 || "ok"} / ${e2 || "ok"}`);
    const f1 = await tryCode(() => slip(T2, h1, { transRef: ref }));
    chk("S-6", S_LIST[5][1], f1 === "", f1);
    const h7 = rid("h");
    const clients = await Promise.all(Array.from({ length: 10 }, () => pool.connect()));
    let res: PromiseSettledResult<string>[] = [];
    try { res = await Promise.allSettled(clients.map((c) => slip(T1, h7, {}, c))); } finally { for (const c of clients) c.release(); }
    const okN = res.filter((r) => r.status === "fulfilled").length;
    const dupN = res.filter((r) => r.status === "rejected" && pgCode(r.reason) === "23505").length;
    const [{ n: rowsN }] = await q<{ n: number }>(`SELECT count(*)::int AS n FROM "PaymentSlip" WHERE "tenantId" = $1 AND "imageHash" = $2`, [T1.tenantId, h7]);
    chk("S-7", S_LIST[6][1], okN === 1 && dupN === 9 && rowsN === 1, `ok=${okN} 23505=${dupN} แถว=${rowsN}`);
  }
  if (autoFilled.length) console.log(`\n  ℹ️ คอลัมน์ NOT NULL ไร้ค่าเริ่มที่สัญญาไม่ระบุ (ข้อสอบเติมให้เอง — ผู้คุมตรวจว่าตั้งใจ): ${[...new Set(autoFilled)].filter((c) => !/^(Tenant|BusinessUnit|HotelRoom|HotelRoomType)\./.test(c)).join(", ") || "—"}`);
} catch (e) {
  chk("CRASH", "จบกลางทาง: " + errMsg(e), false);
} finally {
  try { await cleanup(tenantIds); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); }
  try {
    const left = tenantIds.length ? (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "Tenant" WHERE id = ANY($1::text[])`, [tenantIds]))[0].n : 0;
    console.log(`\n(ล้างแถวทดสอบ: tenant ค้าง ${left})`);
  } catch { /* ฐานหลุด */ }
  await pool.end();
}

const failed = cks.filter((c) => c.res === "FAIL");
const skipped = cks.filter((c) => c.res === "SKIP");
const passed = cks.length - failed.length - skipped.length;
console.log(`\n===== QC SVC R0.1 · migration svc_r0 =====\nผ่าน ${passed}/${cks.length}${skipped.length ? ` (SKIP ${skipped.length})` : ""}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), findings: [...failed, ...skipped].map((c) => c.id) })}`);
// รับใบ = ผ่านทุกข้อ (SKIP ไม่นับว่าผ่าน)
process.exit(failed.length + skipped.length > 0 ? 1 : 0);
