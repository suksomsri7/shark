// QC — SECRETARY S1.1 · migration `secretary_a` (additive · secretary.prisma + nullable columns) · oracle ของผู้คุม — builder ห้ามแก้ไฟล์นี้
// สัญญา: ledger/secretary-briefs/sec-brief-S1.1.md (FINAL 4 พ.ย.) · sec-brief-RESOLUTIONS.md R-K2 R-K5 R-K9/K10 R-K11 R-K12 R-K20 §B.1 §B.4 §B.8
//
// กลุ่มข้อ:
//   T  ตาราง/คอลัมน์ใหม่ 16 โมเดล (ชนิด · null · ค่าเริ่ม) + คอลัมน์ nullable บน 5 ตารางเดิม · ไม่มี User.phone · ไม่มี AiScheduledTask.minute
//   I  unique/index ตามใบ
//   K  FK Cascade: AiRoom→AiConversation · AiRoomMember/AiRoomJob→AiRoom · AiSecretary/UserPhone→User · ChatConversationHelper→ChatConversation
//   M  migration `<ts>_secretary_a` ตัวเดียว · SQL additive ล้วน · ลงฐาน wo-sec-qc แล้ว · แตะเฉพาะ ai/support/secretary.prisma · core.prisma ไม่เปลี่ยน (FROZEN)
//   F  scope.ts ครบ + แกนถูก (global: AiSecretary UserPhone PhoneOtp AiNotifyPref · ที่เหลือ tenant) · Prisma client generate แล้ว · boot assert
//   C  พฤติกรรมจริงบนฐาน: insert ห้อง+สมาชิก · unique ซ้ำ ⇒ 23505 · ลบ AiConversation ⇒ AiRoom/AiRoomMember หายตาม (Cascade)
//   B  baseline 60 ชุดหลัง migration (ไฟล์ ledger/qc-baseline/sec-baseline-<sha>.txt ของ builder · ทุกชุด exit=0 · รายชื่อเท่ากับ 2c2062c7)
//
// ต่อฐานด้วย `pg` ตรง · unforced + ยังไม่มี prisma/schema/secretary.prisma ⇒ SKIP exit 0
// รัน: bash scripts/iso.sh bash scripts/qc-sec.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-sec-s1.1.mts
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import pg from "pg";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "qc-sec-s1.1";
const FORCED = process.env.QC_FORCE === "1";
const SEC_HOST = "ep-calm-flower-aosbmxhm";
const BASE_SHA = "5973db2e"; // tip session/secretary หลัง merge S0.2 (ก่อน S1.1)
const SCHEMA_NEW = join(ROOT, "prisma/schema/secretary.prisma");

if (!FORCED && !existsSync(SCHEMA_NEW)) {
  console.log(`⏭️  ${LABEL}: ยังไม่มี prisma/schema/secretary.prisma (ใบยังไม่เริ่ม) และไม่ได้ตั้ง QC_FORCE=1 — SKIP`);
  console.log("JSON_SUMMARY " + JSON.stringify({ total: 0, passed: 0, failed: [], skipped: ["ALL"], reason: "not-started" }));
  process.exit(0);
}
// ด่านฐาน (ในตัวข้อสอบเสมอ)
{
  const hostOf = (u: string) => { try { return new URL(u).hostname.toLowerCase(); } catch { return ""; } };
  for (const n of ["DATABASE_URL", "DIRECT_URL"] as const) {
    const u = process.env[n] ?? "";
    if (!u) { console.error(`🔴 ${LABEL}: ไม่มี ${n} — รันผ่าน scripts/qc-sec.sh`); process.exit(4); }
    if (!hostOf(u).startsWith(SEC_HOST)) { console.error(`🔴 ${LABEL}: ${n} host "${hostOf(u)}" ไม่ใช่ฐาน QC เลขา — หยุด`); process.exit(4); }
  }
  if (process.env.SEC_QC_HOST !== SEC_HOST || process.env.APP_ENV === "production") { console.error(`🔴 ${LABEL}: SEC_QC_HOST/APP_ENV ไม่ถูก — หยุด`); process.exit(4); }
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
const rid = (p: string) => `secs11_${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

// ═══════════════ สเปก ═══════════════
type Col = { t: string; n: boolean; d?: string };
const TS = "timestamp without time zone";
const S = (n = false, d?: string): Col => ({ t: "text", n, d });
const I = (n = false, d?: string): Col => ({ t: "integer", n, d });
const J = (n = false, d?: string): Col => ({ t: "jsonb", n, d });
const D = (n = false, d?: string): Col => ({ t: TS, n, d });
const B = (n = false, d?: string): Col => ({ t: "boolean", n, d });
const A = (n = false, d?: string): Col => ({ t: "ARRAY", n, d });
const base = { id: S(), createdAt: D(false, "CURRENT_TIMESTAMP") };
const NEW_TABLES: Record<string, Record<string, Col>> = {
  AiRoom: { ...base, conversationId: S(), tenantId: S(), startedById: S(), title: S(), closedAt: D(true), systems: A(false, "ARRAY[]"), contextJson: J(true), jobsCounted: I(false, "1"), updatedAt: D() },
  AiRoomMember: { id: S(), roomId: S(), userId: S(), addedById: S(), addedAt: D(false, "CURRENT_TIMESTAMP"), seeHistory: B(false, "false") },
  AiRoomJob: { ...base, roomId: S(), messageId: S(), authorUserId: S(true), status: S(false, "QUEUED"), leaseUntil: D(true), attempts: I(false, "0"), error: S(true), startedAt: D(true), finishedAt: D(true), updatedAt: D() },
  AiSystemAccess: { ...base, tenantId: S(), module: S(), level: S(false, "DRAFT"), setById: S(), updatedAt: D() },
  AiApprovalRule: { ...base, tenantId: S(), key: S(), enabled: B(false, "true"), limitSatang: I(true), setById: S(), updatedAt: D() },
  AiActionLog: { ...base, tenantId: S(), roomId: S(true), userId: S(), approverId: S(true), module: S(), kind: S(), summary: S(), payload: J(), proposalId: S(true), entityType: S(true), entityId: S(true), undoableUntil: D(true), undoneAt: D(true), undoneById: S(true) },
  AiJobCounter: { ...base, tenantId: S(), month: S(), jobs: I(false, "0"), updatedAt: D() },
  AiLesson: { ...base, tenantId: S(), kind: S(), pattern: S(), example: S(), status: S(false, "PENDING"), occurrences: I(false, "1"), sourceRoomId: S(true), sourceUserId: S(), confirmedById: S(true), updatedAt: D() },
  StaffInvite: { ...base, tenantId: S(), phone: S(), name: S(), role: S(), unitAccess: J(false, "[]"), permissions: J(false, "{}"), codeHash: S(), expiresAt: D(), acceptedAt: D(true), acceptedUserId: S(true), invitedById: S() },
  ChatRoutingRule: { ...base, tenantId: S(), systemId: S(), channel: S(true), mode: S(), enabled: B(false, "false"), order: I(false, "0"), updatedAt: D() },
  ChatShift: { ...base, tenantId: S(), userId: S(), onDutyAt: D(), offDutyAt: D(true) },
  ChatConversationHelper: { ...base, tenantId: S(), conversationId: S(), userId: S(), calledById: S(), note: S(true) },
  AiSecretary: { ...base, userId: S(), name: S(false, "Shark"), suffix: S(false, "ครับ"), tone: S(false, "polite"), languages: A(false, "th"), prefs: J(false, "{}"), updatedAt: D() },
  UserPhone: { ...base, userId: S(), phone: S(), verifiedAt: D(true) },
  PhoneOtp: { ...base, phone: S(), codeHash: S(), expiresAt: D(), consumedAt: D(true), attempts: I(false, "0"), ip: S(true) },
  AiNotifyPref: { ...base, userId: S(), tenantId: S(true), kind: S(), mode: S(), updatedAt: D() },
};
const ADDED_COLS: Record<string, Record<string, Col>> = {
  AiMessage: { authorUserId: S(true) },
  AiMemory: { status: S(true) },
  AiScheduledTask: { ownerUserId: S(true), frequency: S(true), days: A(false, "ARRAY[]"), channels: A(false, "ARRAY[]") },
  AiTrainingSample: { outcome: S(true), editedReply: S(true), stepsJson: J(true), roomId: S(true), proposalId: S(true) },
  SupportCase: { source: S(true), category: S(true), roomId: S(true) },
};
const FORBIDDEN_COLS: [string, string][] = [["User", "phone"], ["AiScheduledTask", "minute"], ["AiProposal", "riskClass"]];
const IDX: { id: string; table: string; cols: string[]; u: boolean }[] = [
  { id: "I-1", table: "AiRoom", cols: ["conversationId"], u: true },
  { id: "I-2", table: "AiRoom", cols: ["tenantId", "startedById", "updatedAt"], u: false },
  { id: "I-3", table: "AiRoomMember", cols: ["roomId", "userId"], u: true },
  { id: "I-4", table: "AiRoomJob", cols: ["messageId"], u: true },
  { id: "I-5", table: "AiRoomJob", cols: ["status", "leaseUntil"], u: false },
  { id: "I-6", table: "AiSystemAccess", cols: ["tenantId", "module"], u: true },
  { id: "I-7", table: "AiApprovalRule", cols: ["tenantId", "key"], u: true },
  { id: "I-8", table: "AiActionLog", cols: ["tenantId", "createdAt"], u: false },
  { id: "I-9", table: "AiJobCounter", cols: ["tenantId", "month"], u: true },
  { id: "I-10", table: "AiLesson", cols: ["tenantId", "kind", "status"], u: false },
  { id: "I-11", table: "StaffInvite", cols: ["codeHash"], u: true },
  { id: "I-12", table: "StaffInvite", cols: ["tenantId", "phone"], u: false },
  { id: "I-13", table: "ChatRoutingRule", cols: ["tenantId", "systemId", "enabled", "order"], u: false },
  { id: "I-14", table: "ChatShift", cols: ["tenantId", "userId", "offDutyAt"], u: false },
  { id: "I-15", table: "ChatConversationHelper", cols: ["conversationId", "userId"], u: true },
  { id: "I-16", table: "AiSecretary", cols: ["userId"], u: true },
  { id: "I-17", table: "UserPhone", cols: ["userId"], u: true },
  { id: "I-18", table: "UserPhone", cols: ["phone"], u: true },
  { id: "I-19", table: "PhoneOtp", cols: ["phone", "createdAt"], u: false },
  { id: "I-20", table: "AiNotifyPref", cols: ["userId", "tenantId", "kind"], u: true },
];
const FKS: { id: string; table: string; col: string; ref: string; cascade: boolean }[] = [
  { id: "K-1", table: "AiRoom", col: "conversationId", ref: "AiConversation", cascade: true },
  { id: "K-2", table: "AiRoomMember", col: "roomId", ref: "AiRoom", cascade: true },
  { id: "K-3", table: "AiRoomJob", col: "roomId", ref: "AiRoom", cascade: true },
  { id: "K-4", table: "AiSecretary", col: "userId", ref: "User", cascade: true },
  { id: "K-5", table: "UserPhone", col: "userId", ref: "User", cascade: true },
  { id: "K-6", table: "ChatConversationHelper", col: "conversationId", ref: "ChatConversation", cascade: true },
];
const NEW_MODELS = Object.keys(NEW_TABLES);
const GLOBAL_MODELS = new Set(["AiSecretary", "UserPhone", "PhoneOtp", "AiNotifyPref"]);
const OWNED_SCHEMA = new Set(["secretary.prisma", "ai.prisma", "support.prisma"]);

// ═══════════════ M. migration file ═══════════════
console.log("── M: migration secretary_a ──");
const migDir = join(ROOT, "prisma", "migrations");
const migs = readdirSync(migDir).filter((d) => /^\d{14}_/.test(d)).sort();
const mine = migs.filter((d) => /_secretary_a$/.test(d));
let migName = "";
chk("M-1", "มีโฟลเดอร์ migration `<ts>_secretary_a` ตัวเดียว และเป็นตัวท้ายสุด", mine.length === 1 && migs[migs.length - 1] === mine[0], `พบ ${mine.length}: ${mine.join(", ")} · ท้ายสุด=${migs[migs.length - 1]}`);
if (mine.length === 1) {
  migName = mine[0];
  const sql = readFileSync(join(migDir, migName, "migration.sql"), "utf8");
  const code = sql.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");
  const stmts = code.split(";").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
  const bad: string[] = [];
  for (const s of stmts) {
    if (/\bDROP\b/i.test(s)) bad.push(`DROP: ${s.slice(0, 80)}`);
    if (/\bRENAME\b/i.test(s)) bad.push(`RENAME: ${s.slice(0, 80)}`);
    if (/ALTER\s+COLUMN\s+\S+\s+(SET\s+DATA\s+)?TYPE/i.test(s)) bad.push(`เปลี่ยนชนิด: ${s.slice(0, 80)}`);
    if (/SET\s+NOT\s+NULL/i.test(s)) bad.push(`SET NOT NULL: ${s.slice(0, 80)}`);
    if (/^ALTER\s+TYPE/i.test(s)) bad.push(`ALTER TYPE (ห้ามแตะ enum ในใบนี้): ${s.slice(0, 80)}`);
    if (/^ALTER\s+TABLE/i.test(s)) for (const add of s.split(/,\s*(?=ADD\s+COLUMN)/i)) if (/ADD\s+COLUMN/i.test(add) && /NOT\s+NULL/i.test(add) && !/DEFAULT/i.test(add)) bad.push(`ADD COLUMN NOT NULL ไร้ DEFAULT: ${add.slice(0, 80)}`);
    if (/^DELETE\b|^UPDATE\b|^TRUNCATE\b|^INSERT\b/i.test(s)) bad.push(`แก้ข้อมูล: ${s.slice(0, 80)}`);
  }
  chk("M-2", "SQL additive ล้วน (ไม่มี DROP/RENAME/เปลี่ยนชนิด/SET NOT NULL/NOT NULL ไร้ default/ALTER TYPE/แก้ข้อมูล)", bad.length === 0, bad.slice(0, 4).join(" | "));
  const created = [...code.matchAll(/CREATE\s+TABLE\s+"(\w+)"/gi)].map((m) => m[1]);
  const notCreated = NEW_MODELS.filter((m) => !created.includes(m));
  const extra = created.filter((t) => !NEW_MODELS.includes(t));
  chk("M-3", `SQL สร้างตาราง 16 ตัวตามใบ ไม่มีตารางเกิน`, notCreated.length === 0 && extra.length === 0, `ขาด: ${notCreated.join(", ")} · เกิน: ${extra.join(", ")}`);
} else { skip("M-2", "SQL additive ล้วน", "ไม่มี migration"); skip("M-3", "SQL สร้างตาราง 16 ตัว", "ไม่มี migration"); }
try {
  const changed = execFileSync("git", ["-C", ROOT, "diff", "--name-only", BASE_SHA, "--", "prisma/schema"], { encoding: "utf8" }).split("\n").filter(Boolean);
  const untracked = execFileSync("git", ["-C", ROOT, "ls-files", "--others", "--exclude-standard", "prisma/schema"], { encoding: "utf8" }).split("\n").filter(Boolean);
  const outside = [...changed, ...untracked].map((p) => p.split("/").pop() ?? p).filter((f) => !OWNED_SCHEMA.has(f));
  chk("M-4", "แตะเฉพาะ secretary.prisma / ai.prisma / support.prisma", outside.length === 0, `ไฟล์นอกใบ: ${outside.join(", ")}`, "MAJOR");
  const dels = execFileSync("git", ["-C", ROOT, "diff", "-w", "--ignore-blank-lines", "--numstat", BASE_SHA, "--", "prisma/schema/ai.prisma", "prisma/schema/support.prisma"], { encoding: "utf8" })
    .split("\n").filter(Boolean).map((l) => l.split("\t")).filter(([, d]) => d !== "-" && Number(d) > 0).map(([, d, f]) => `${f}(-${d})`);
  chk("M-5", "ai.prisma/support.prisma เพิ่มบรรทัดอย่างเดียว (ไม่ลบ/แก้บรรทัดเดิม)", dels.length === 0, dels.join(", "), "MAJOR");
  const core = execFileSync("git", ["-C", ROOT, "diff", "--stat", BASE_SHA, "--", "prisma/schema/core.prisma"], { encoding: "utf8" }).trim();
  chk("M-6", "core.prisma ไม่เปลี่ยน (FROZEN · §B.8)", core === "", core.slice(0, 120));
} catch (e) { chk("M-4", "อ่าน git diff ได้", false, errMsg(e), "MAJOR"); }

// ═══════════════ F. scope registry + client ═══════════════
console.log("── F: scope.ts + Prisma client ──");
{
  const schemaDir = join(ROOT, "prisma", "schema");
  const schemaModels = new Set<string>();
  for (const f of readdirSync(schemaDir).filter((x) => x.endsWith(".prisma"))) for (const m of readFileSync(join(schemaDir, f), "utf8").matchAll(/^model\s+(\w+)\s*\{/gm)) schemaModels.add(m[1]);
  const notInSchema = NEW_MODELS.filter((m) => !schemaModels.has(m));
  chk("F-1", "โมเดลใหม่ 16 ตัวอยู่ใน prisma/schema (secretary.prisma)", notInSchema.length === 0 && existsSync(SCHEMA_NEW), `ขาด: ${notInSchema.join(", ")}`);
  const scopeSrc = existsSync(join(ROOT, "src/lib/core/scope.ts")) ? readFileSync(join(ROOT, "src/lib/core/scope.ts"), "utf8") : "";
  const registered = new Set([...scopeSrc.matchAll(/^\s{2}(\w+):\s*(?:g\(|tenant|unit|sys\(|\{)/gm)].map((m) => m[1]));
  const missingAll = [...schemaModels].filter((m) => !registered.has(m));
  chk("F-2", "fitness F1: ทุก model ใน schema ลงทะเบียนใน scope.ts", missingAll.length === 0, `ยังไม่ลง: ${missingAll.join(", ")}`);
  try {
    const scope = (await import("@/lib/core/scope")) as { scopeOf: (m: string) => { axis: string }; assertRegistryComplete: (m: string[]) => void };
    const wrong: string[] = [];
    for (const m of NEW_MODELS) {
      let axis = "(ไม่ลงทะเบียน)";
      try { axis = scope.scopeOf(m).axis; } catch { /* โยน */ }
      const want = GLOBAL_MODELS.has(m) ? "global" : "tenant";
      if (axis !== want) wrong.push(`${m}=${axis}≠${want}`);
    }
    chk("F-3", "แกน scope: global = AiSecretary UserPhone PhoneOtp AiNotifyPref · ที่เหลือ tenant (§B.1)", wrong.length === 0, wrong.join(" · "));
    try {
      const { Prisma } = (await import("@prisma/client")) as unknown as { Prisma: { dmmf: { datamodel: { models: { name: string; fields: { name: string }[] }[] } } } };
      const dm = Prisma.dmmf.datamodel.models;
      const names = new Set(dm.map((m) => m.name));
      const noClient = NEW_MODELS.filter((m) => !names.has(m));
      const fieldsOf = (t: string) => new Set(dm.find((m) => m.name === t)?.fields.map((f) => f.name) ?? []);
      const addedMissing = Object.entries(ADDED_COLS).flatMap(([t, cs]) => Object.keys(cs).filter((c) => !fieldsOf(t).has(c)).map((c) => `${t}.${c}`));
      chk("F-4", "Prisma client generate แล้ว (รู้จักโมเดลใหม่ + คอลัมน์ที่เพิ่ม)", noClient.length === 0 && addedMissing.length === 0, `ขาดใน client: ${[...noClient, ...addedMissing].join(", ")}`);
      let bootErr = "";
      try { scope.assertRegistryComplete(dm.map((m) => m.name)); } catch (e) { bootErr = errMsg(e); }
      chk("F-5", "boot assert (assertRegistryComplete) ผ่านกับ client ปัจจุบัน", bootErr === "", bootErr);
    } catch (e) { chk("F-4", "import @prisma/client ได้", false, errMsg(e)); }
  } catch (e) { chk("F-3", "import src/lib/core/scope.ts ได้", false, errMsg(e)); }
}

// ═══════════════ ต่อฐาน ═══════════════
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
const q = async <T extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, params: unknown[] = []) => (await pool.query<T>(sql, params)).rows;
const colCache = new Map<string, { column_name: string; data_type: string; is_nullable: string; column_default: string | null }[]>();
async function cols(table: string) {
  if (!colCache.has(table)) colCache.set(table, await q(`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1`, [table]));
  return colCache.get(table) ?? [];
}
async function insertRow(table: string, vals: Record<string, unknown>): Promise<void> {
  const v: Record<string, unknown> = { ...vals };
  for (const c of await cols(table)) {
    if (c.column_name in v || c.is_nullable === "YES" || c.column_default !== null) continue;
    const t = c.data_type;
    v[c.column_name] = t === "text" || t.startsWith("character") ? "qc" : t === "integer" || t === "bigint" || t === "numeric" ? 0 : t === "boolean" ? false : t === "jsonb" || t === "json" ? "{}" : t.startsWith("timestamp") ? new Date() : t === "date" ? "2031-01-01" : t === "ARRAY" ? [] : t === "USER-DEFINED" ? null : null;
  }
  const keys = Object.keys(v);
  await pool.query(`INSERT INTO "${table}" (${keys.map((k) => `"${k}"`).join(", ")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(", ")})`, keys.map((k) => v[k]));
}
const tenantIds: string[] = [];
async function cleanup() {
  for (const t of tenantIds) {
    for (const tbl of ["AiRoomMember", "AiRoomJob", "AiRoom"]) { try { await q(`DELETE FROM "${tbl}" WHERE "tenantId" = $1`, [t]); } catch { /* ไม่มีคอลัมน์/ตาราง */ } }
    for (const tbl of ["AiMessage"]) { try { await q(`DELETE FROM "${tbl}" WHERE "conversationId" IN (SELECT id FROM "AiConversation" WHERE "tenantId" = $1)`, [t]); } catch { /* */ } }
    for (const tbl of ["AiConversation", "Membership", "Tenant"]) { try { await q(`DELETE FROM "${tbl}" WHERE ${tbl === "Tenant" ? "id" : '"tenantId"'} = $1`, [t]); } catch (e) { console.log(`  ⚠️ cleanup ${tbl}: ${errMsg(e)}`); } }
  }
  try { await q(`DELETE FROM "Tenant" WHERE slug LIKE 'qc-sec-s11-%' AND "createdAt" < now() - interval '1 hour'`); } catch { /* */ }
}

try {
  console.log("── T: ตาราง/คอลัมน์ ──");
  const existing = new Set((await q<{ table_name: string }>(`SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema()`)).map((r) => r.table_name));
  const tableOk = new Map<string, boolean>();
  const checkCols = async (id: string, table: string, spec: Record<string, Col>, mustExist: boolean) => {
    if (!existing.has(table)) { chk(id, `ตาราง ${table} มีอยู่`, false, "ไม่มีตาราง"); tableOk.set(table, false); return; }
    const have = new Map((await cols(table)).map((c) => [c.column_name, c]));
    const bad: string[] = [];
    for (const [name, c] of Object.entries(spec)) {
      const h = have.get(name);
      if (!h) { bad.push(`${name} ไม่มี`); continue; }
      if (h.data_type !== c.t) bad.push(`${name} ชนิด ${h.data_type}≠${c.t}`);
      if ((h.is_nullable === "YES") !== c.n) bad.push(`${name} null ${h.is_nullable}≠${c.n ? "YES" : "NO"}`);
      if (c.d !== undefined && !(h.column_default ?? "").includes(c.d)) bad.push(`${name} default "${h.column_default}" ไม่มี "${c.d}"`);
    }
    tableOk.set(table, bad.length === 0);
    chk(id, `${mustExist ? "ตารางใหม่" : "คอลัมน์เพิ่มบน"} ${table} (${Object.keys(spec).length} คอลัมน์: ชนิด/null/ค่าเริ่ม)`, bad.length === 0, bad.slice(0, 4).join(" · "));
  };
  let i = 1;
  for (const [t, spec] of Object.entries(NEW_TABLES)) await checkCols(`T-${i++}`, t, spec, true);
  for (const [t, spec] of Object.entries(ADDED_COLS)) await checkCols(`T-${i++}`, t, spec, false);
  {
    const found: string[] = [];
    for (const [t, c] of FORBIDDEN_COLS) if ((await cols(t)).some((x) => x.column_name === c)) found.push(`${t}.${c}`);
    chk(`T-${i++}`, "ไม่มี User.phone · AiScheduledTask.minute · AiProposal.riskClass (R-K3/K5/§B.8)", found.length === 0, found.join(", "));
  }

  console.log("── I: unique/index ──");
  const idxRows = await q<{ tablename: string; indexname: string; indexdef: string }>(`SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = current_schema() AND tablename = ANY($1)`, [[...new Set(IDX.map((x) => x.table))]]);
  for (const x of IDX) {
    const want = `(${x.cols.map((c) => `"${c}"`).join(", ")})`;
    const hit = idxRows.filter((r) => r.tablename === x.table && r.indexdef.replace(/\s+/g, " ").endsWith(want)).find((r) => (x.u ? /UNIQUE INDEX/.test(r.indexdef) : true));
    chk(x.id, `${x.u ? "unique" : "index"} ${x.table}${want}`, !!hit, `ไม่พบ · มี: ${idxRows.filter((r) => r.tablename === x.table).map((r) => r.indexdef.replace(/.*USING btree /, "")).join(" ; ").slice(0, 200)}`);
  }

  console.log("── K: FK Cascade ──");
  const fkRows = await q<{ table_name: string; column_name: string; ref_table: string; delete_rule: string }>(`
    SELECT tc.table_name, kcu.column_name, ccu.table_name AS ref_table, rc.delete_rule
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
    JOIN information_schema.referential_constraints rc ON rc.constraint_name = tc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = current_schema() AND tc.table_name = ANY($1)`, [[...new Set(FKS.map((f) => f.table))]]);
  for (const f of FKS) {
    const hit = fkRows.find((r) => r.table_name === f.table && r.column_name === f.col && r.ref_table === f.ref);
    chk(f.id, `FK ${f.table}.${f.col} → ${f.ref} ON DELETE CASCADE`, !!hit && (!f.cascade || hit.delete_rule === "CASCADE"), hit ? `delete_rule=${hit.delete_rule}` : "ไม่มี FK");
  }

  if (migName) {
    const m = await q<{ finished_at: Date | null; rolled_back_at: Date | null }>(`SELECT finished_at, rolled_back_at FROM "_prisma_migrations" WHERE migration_name = $1`, [migName]);
    chk("M-7", `migration ${migName} ลง wo-sec-qc แล้ว (finished · ไม่ rolled back)`, m.length === 1 && m[0].finished_at !== null && m[0].rolled_back_at === null, `แถว ${m.length}`);
  } else skip("M-7", "migration ลงฐานแล้ว", "ไม่มี migration");

  console.log("── C: พฤติกรรมบนฐาน ──");
  if (!tableOk.get("AiRoom") || !tableOk.get("AiRoomMember")) {
    for (const [id, n] of [["C-1", "insert AiConversation+AiRoom+AiRoomMember ได้"], ["C-2", "AiRoomMember ซ้ำ (roomId,userId) ⇒ 23505"], ["C-3", "AiRoom.conversationId ซ้ำ ⇒ 23505"], ["C-4", "ลบ AiConversation ⇒ AiRoom + AiRoomMember หายตาม (Cascade)"]]) skip(id, n, "ตารางไม่ครบ");
  } else {
    const tenantId = rid("t");
    tenantIds.push(tenantId);
    await insertRow("Tenant", { id: tenantId, name: "QC SEC S1.1", slug: `qc-sec-s11-${Date.now().toString(36)}`, updatedAt: new Date() });
    const convId = `u~secs11-user~${rid("c")}`;
    await insertRow("AiConversation", { id: convId, tenantId, updatedAt: new Date() });
    const roomId = rid("r");
    let ok = true, why = "";
    try {
      await insertRow("AiRoom", { id: roomId, conversationId: convId, tenantId, startedById: "secs11-user", title: "ห้องทดสอบ", updatedAt: new Date() });
      await insertRow("AiRoomMember", { id: rid("m"), roomId, userId: "secs11-staff", addedById: "secs11-user" });
    } catch (e) { ok = false; why = errMsg(e); }
    chk("C-1", "insert AiConversation+AiRoom+AiRoomMember ได้ (ค่าเริ่มครบ)", ok, why);
    let code = "";
    try { await insertRow("AiRoomMember", { id: rid("m"), roomId, userId: "secs11-staff", addedById: "secs11-user" }); } catch (e) { code = pgCode(e); }
    chk("C-2", "AiRoomMember ซ้ำ (roomId,userId) ⇒ 23505", code === "23505", `code=${code || "สำเร็จ(ผิด)"}`);
    code = "";
    try { await insertRow("AiRoom", { id: rid("r"), conversationId: convId, tenantId, startedById: "secs11-user", title: "ซ้ำ", updatedAt: new Date() }); } catch (e) { code = pgCode(e); }
    chk("C-3", "AiRoom.conversationId ซ้ำ ⇒ 23505", code === "23505", `code=${code || "สำเร็จ(ผิด)"}`);
    await q(`DELETE FROM "AiConversation" WHERE id = $1`, [convId]);
    const left = await q<{ n: string }>(`SELECT (SELECT count(*) FROM "AiRoom" WHERE id = $1) + (SELECT count(*) FROM "AiRoomMember" WHERE "roomId" = $1) AS n`, [roomId]);
    chk("C-4", "ลบ AiConversation ⇒ AiRoom + AiRoomMember หายตาม (Cascade)", left[0]?.n === "0", `เหลือ ${left[0]?.n}`);
  }

  console.log("── B: baseline หลัง migration ──");
  {
    const dir = join(ROOT, "ledger/qc-baseline");
    const ref = readFileSync(join(dir, "sec-baseline-2c2062c7.txt"), "utf8");
    const refSuites = [...ref.matchAll(/^== (qc-[\w.-]+) /gm)].map((m) => m[1]);
    const files = existsSync(dir) ? readdirSync(dir).filter((f) => /^sec-baseline-[0-9a-f]+\.txt$/.test(f) && f !== "sec-baseline-2c2062c7.txt") : [];
    const migTs = migName ? Number(migName.slice(0, 14)) : 0;
    const cand = files.map((f) => ({ f, txt: readFileSync(join(dir, f), "utf8") })).filter((x) => { const m = x.txt.match(/^== migrate status (\S+)/m); return m ? Number(m[1].replace(/\D/g, "").slice(0, 14)) >= migTs : false; });
    if (!migName || cand.length === 0) chk("B-1", "มีไฟล์ baseline ใหม่ (sec-baseline-<sha>.txt) ที่รันหลัง migration", false, "ไม่พบ — builder ต้องรัน bash scripts/sec-baseline.sh หลัง migrate deploy", "MAJOR");
    else {
      const latest = cand.sort((a, b) => a.txt.localeCompare(b.txt)).at(-1)!;
      const suites = [...latest.txt.matchAll(/^== (qc-[\w.-]+) /gm)].map((m) => m[1]);
      const exits = [...latest.txt.matchAll(/^exit=(\d+)/gm)].map((m) => Number(m[1]));
      const missing = refSuites.filter((s) => !suites.includes(s));
      const nonzero = exits.filter((e) => e !== 0).length;
      const done = /^== done /m.test(latest.txt);
      chk("B-1", `baseline ${latest.f}: ครบ ${refSuites.length} ชุด · exit=0 ทั้งหมด · จบ`, missing.length === 0 && nonzero === 0 && done && exits.length === refSuites.length, `ขาด ${missing.length} (${missing.slice(0, 3).join(",")}) · exit≠0 ${nonzero} · exits=${exits.length} · done=${done}`, "MAJOR");
      chk("B-2", "baseline ใหม่: migrate status บอก up to date + จำนวน migration = เดิม+1", /Database schema is up to date/.test(latest.txt) && /196 migrations found/.test(latest.txt), (latest.txt.match(/(\d+) migrations found|No pending|up to date|Following migration/g) ?? []).join(" · "), "MAJOR");
    }
  }
} finally {
  await cleanup();
  await pool.end();
}

const passed = cks.filter((c) => c.res === "PASS").length;
const failed = cks.filter((c) => c.res === "FAIL");
const skipped = cks.filter((c) => c.res === "SKIP");
console.log(`\n${LABEL}: ${passed}/${cks.length} ผ่าน · แดง ${failed.length} · ข้าม ${skipped.length}`);
console.log("JSON_SUMMARY " + JSON.stringify({ total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), findings: failed.map((c) => ({ id: c.id, sev: c.sev })) }));
process.exit(failed.some((c) => c.sev === "CRITICAL") ? 1 : 0);
