// QC — SVC D.0 · migration `svc_d` (หอพัก 12 ตาราง + AccountDocSource.DORM + หนี้ดัชนี R0.6/R0.8) · oracle ของผู้คุม — builder ห้ามแก้ไฟล์นี้ (แย้ง = wo-notes)
// สัญญา: ledger/svc-briefs/svc-brief-d.0.md (ตาราง §2 ผูกตรงตัว) · ledger/SVC-MASTER-PLAN.md แถว D.0 · CC §6.2 §9 · DESIGN-DORM-HOTEL §10
//        ledger/wo-notes/svc-r0.8-carry.md (หนี้ดัชนี · partial unique STAY · PaymentSlip idempotencyKey) · ledger/wo-notes/svc-deploy-checklist.md
//
// กลุ่มข้อ:
//   P   ไฟล์: src แตะแค่ scope.ts + slip-verify.ts (findByKey) · qc-acc-v2-schema แก้แค่ข้อ enum · ชุดข้อสอบอื่นไม่แตะ
//   F   โมเดลใหม่ใน schema · scope registry (fitness F1) · Prisma client (โมเดล + AccountDocSource.DORM + boot assert) · ไม่มี DormSlip/DormLinkCode
//   M   migration `<ts>_svc_d` ตัวเดียว เรียงหลัง svc_b · additive · แตะเฉพาะตารางของใบ · ALTER TYPE = DORM ตัวเดียว · ไม่มี CONCURRENTLY/EXTENSION · ลงฐานแล้ว · schema แตะเฉพาะไฟล์ของใบ
//   T   ตาราง/คอลัมน์ตรงชุด (ชนิด · null · default) · เงินเป็น integer สตางค์
//   I K CK N   ดัชนี (+ partial/นิพจน์/NULLS NOT DISTINCT) · FK ตรงชุด · CHECK · enum AccountDocSource ต่อท้าย
//   O   พฤติกรรมจริง: unique บิล (lease, period) + ยิงพร้อมกัน 10 ทาง · มิเตอร์/อ่าน/อัตรา/ประกาศ/ย้ายออก · FK RESTRICT/CASCADE ·
//       STAY partial unique · PaymentSlip idempotencyKey · EXPLAIN ใช้ดัชนีใหม่ · เอกสารบัญชี source DORM · ข้อมูลเดิมยังอ่านได้ผ่าน client
//   G   regression: qc-hotel ×3 · qc-svc-r0.8 · qc-svc-r0.6 · qc-svc-d.1 · qc-svc-smoke · บัญชี V2 ที่เกี่ยว AccountDocSource 5 ชุด
//
// ตัดสินจาก DB จริงด้วย `pg` (ไม่พึ่ง client) ยกเว้น F-3/O-READ/O-ACC · ทุกแถวทดสอบอยู่ใต้ tenant ชั่วคราว slug `qc-svc-d0-*` (+ DormAuthorityTariff authority `QCD0*`) · ลบใน finally (+ กวาดค้างตอนเริ่ม)
// วันที่ทุกตัวสัมพัทธ์กับเวลาที่รัน (ไม่มีวันที่ตายตัว)
// รัน: bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-d.0.mts
//      (ห้าม timeout ครอบ · หมวด G เรียกชุดอื่นต่อกันหลายนาที · ตั้ง SVC_D0_NO_REGRESSION=1 = ข้าม G เป็น SKIP ซึ่งไม่นับผ่าน)
// หมวด P / M-6 / M-7 เทียบ git กับ BASE_SHA — ความหมายคือ "ตอนรับ D.0" (M-6/M-7 SKIP เองเมื่อมี migration SVC ใบหลัง)
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync, execFileSync } from "node:child_process";
import { isDeepStrictEqual } from "node:util";
import pg from "pg";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "qc-svc-d.0";
const SVC_HOST = "ep-mute-scene";
const FORBIDDEN_HOSTS = ["ep-royal-night", "ep-plain-art", "ep-cool-shadow", "ep-weathered-river", "ep-frosty-lab", "ep-fragrant-thunder"];
const BASE_SHA = "93a42093"; // tip ของ session/svc ก่อน D.0 (หลัง B.0)
const SVC_B = "20261222000000_svc_b";
const SELF = "scripts/qc-svc-d.0.mts";

// ═══════════════ 0. ด่านฐานข้อมูล (ในตัวข้อสอบเสมอ) ═══════════════
{
  for (const n of ["DATABASE_URL", "DIRECT_URL"] as const) {
    const u = process.env[n] ?? "";
    if (!u) { console.error(`🔴 ${LABEL}: ไม่มี ${n} — รันผ่าน: bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-d.0.mts`); process.exit(4); }
    const bad = FORBIDDEN_HOSTS.find((h) => u.includes(h));
    if (bad) { console.error(`🔴 ${LABEL}: ${n} ชี้ฐานต้องห้าม (${bad}) — หยุด`); process.exit(4); }
    let hn = "";
    try { hn = new URL(u).hostname; } catch { /* อ่านไม่ได้ = ปฏิเสธ */ }
    if (!hn.startsWith(SVC_HOST)) { console.error(`🔴 ${LABEL}: ${n} host ไม่ใช่ qc-svc (${SVC_HOST}) — หยุด`); process.exit(4); }
  }
  if (process.env.APP_ENV === "production") { console.error(`🔴 ${LABEL}: APP_ENV=production`); process.exit(4); }
}

// ═══════════════ ตัวช่วย ═══════════════
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Res = "PASS" | "FAIL" | "SKIP";
const cks: { id: string; res: Res; sev: Sev; why: string }[] = [];
class AssertFail extends Error {}
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);
const fmt = (v: unknown): string => { try { return JSON.stringify(v)?.slice(0, 160) ?? String(v); } catch { return String(v); } };
const ok = (cond: boolean, why: string): void => { if (!cond) throw new AssertFail(why); };
const eq = (act: unknown, exp: unknown, what: string): void => {
  if (!isDeepStrictEqual(act, exp)) throw new AssertFail(`${what}: ได้ ${fmt(act)} ต้องเป็น ${fmt(exp)}`);
};
const record = (id: string, name: string, res: Res, why: string, sev: Sev) => {
  cks.push({ id, res, sev, why });
  const icon = res === "PASS" ? "✅" : res === "FAIL" ? "❌" : "⏭️ ";
  console.log(`  ${icon} [${id}] ${name}${res !== "PASS" && why ? ` — ${res === "SKIP" ? "SKIP: " : ""}${why}` : ""}`);
};
const st = async (id: string, name: string, fn: () => unknown | Promise<unknown>, sev: Sev = "CRITICAL") => {
  try { await fn(); record(id, name, "PASS", "", sev); } catch (e) { record(id, name, "FAIL", errMsg(e), sev); }
};
const skip = (id: string, name: string, why: string, sev: Sev = "CRITICAL") => record(id, name, "SKIP", why, sev);
const pgCode = (e: unknown): string => (typeof e === "object" && e !== null && "code" in e ? String((e as { code: unknown }).code) : "");
const rid = (p: string) => `svcd0_${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const git = (args: string[]) => execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8" });
/** ไฟล์ที่ต่างจาก BASE (ไม่นับช่องว่าง) + ไฟล์ใหม่ที่ยังไม่ track ใต้ paths */
const changedFiles = (paths: string[]): string[] => {
  const a = git(["diff", "-w", "--ignore-blank-lines", "--name-only", BASE_SHA, "--", ...paths]).split("\n").filter(Boolean);
  const b = git(["ls-files", "--others", "--exclude-standard", "--", ...paths]).split("\n").filter(Boolean);
  return [...new Set([...a, ...b])];
};
/** ไฟล์ที่มีบรรทัดถูกลบ/แก้ (ไม่นับช่องว่าง) เทียบ BASE */
const deletedLines = (paths: string[]): string[] =>
  git(["diff", "-w", "--ignore-blank-lines", "--numstat", BASE_SHA, "--", ...paths]).split("\n").filter(Boolean)
    .map((l) => l.split("\t")).filter(([, d]) => d !== "-" && Number(d) > 0).map(([, d, f]) => `${f}(-${d})`);
/** บรรทัด +/- (ไม่นับคอมเมนต์ // และบรรทัดว่าง) ของไฟล์เดียวเทียบ BASE */
const diffLines = (file: string, sign: "+" | "-"): string[] =>
  git(["diff", "-w", "--ignore-blank-lines", "-U0", BASE_SHA, "--", file]).split("\n")
    .filter((l) => l.startsWith(sign) && !l.startsWith(sign.repeat(3)))
    .map((l) => l.slice(1).replace(/\/\/.*$/, "").trim()).filter(Boolean);
const tryImport = async <T,>(spec: string): Promise<{ mod: T | null; err: string }> => {
  try { return { mod: (await import(spec)) as T, err: "" }; } catch (e) { return { mod: null, err: errMsg(e) }; }
};
// วันที่สัมพัทธ์ (UTC ymd) · งวดสัมพัทธ์ (ปีหน้าขึ้นไป · ไม่ชนงวดจริง)
const day = (n: number): string => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const Y0 = new Date().getUTCFullYear() + 2;
let pkSeq = 0;
const nextPk = (): string => { const i = pkSeq++; return `${Y0 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`; };

// ═══════════════ สเปก (ใบสั่ง §2) ═══════════════
const DORM_UNIT_MODELS = ["DormLease", "DormMeter", "DormMeterReading", "DormUtilityRate", "DormBillRun", "DormBill", "DormMoveOut", "DormRepair", "DormAnnouncement", "DormAnnouncementRead", "DormParcel"];
const NEW_MODELS = [...DORM_UNIT_MODELS, "DormAuthorityTariff"];
const OLD_TOUCHED = ["RoomOccupancy", "HotelRoom", "PaymentSlip", "IntegrationCallLog"];
const OWN_TABLES = new Set([...NEW_MODELS, ...OLD_TOUCHED]);
const FK_REF_OK = new Set(["HotelRoom", "DormMeter", "DormBillRun", "DormLease", "DormAnnouncement"]);
const OLD_SOURCES = ["MANUAL", "AI", "IMPORT", "INBOX", "CRM", "POS", "RECURRING", "API"];

// ═══════════════ P. ไฟล์ ═══════════════
console.log("\n── P: ไฟล์ของใบ ──");
await st("P-1", "src แตะได้แค่ src/lib/core/scope.ts (เพิ่มอย่างเดียว) + src/lib/payment/slip-verify.ts (findByKey) — โค้ดหอ/บัญชีเป็นของ D.2+", () => {
  const ch = changedFiles(["src"]);
  const outside = ch.filter((f) => !["src/lib/core/scope.ts", "src/lib/payment/slip-verify.ts"].includes(f));
  const del = deletedLines(["src/lib/core/scope.ts"]);
  ok(outside.length === 0 && del.length === 0, `${outside.length ? `แตะนอกใบ: ${outside.slice(0, 6).join(", ")} ` : ""}${del.length ? `scope.ts ลบบรรทัด: ${del.join(", ")}` : ""}`);
}, "MAJOR");
await st("P-2", "slip-verify.ts: findByKey ใช้ raw query `(\"checks\"->>'idempotencyKey')` (ใช้ดัชนีนิพจน์) · ไม่มี JSON path ของ idempotencyKey · บรรทัดที่ลบเกี่ยวกับ keyWhere/findByKey เท่านั้น · advisory lock + จับ unique violation คงอยู่", () => {
  const src = readFileSync(join(ROOT, "src/lib/payment/slip-verify.ts"), "utf8");
  ok(!/path:\s*\[\s*["']idempotencyKey["']\s*\]/.test(src), "ยังค้นด้วย JSON path (checks: { path: [\"idempotencyKey\"] })");
  ok(/\$queryRaw[\s\S]{0,400}->>\s*'idempotencyKey'/.test(src), "ไม่พบ $queryRaw ที่ค้น (\"checks\"->>'idempotencyKey')");
  ok(/pg_advisory_xact_lock/.test(src) && /isUniqueViolation\(e\)/.test(src), "advisory lock / จับ unique violation หาย");
  const bad = diffLines("src/lib/payment/slip-verify.ts", "-").filter((l) => !/keyWhere|findByKey|paymentSlip\.findFirst|idempotencyKey/.test(l));
  ok(bad.length === 0, `ลบ/แก้บรรทัดนอก findByKey: ${bad.slice(0, 3).map((l) => l.slice(0, 70)).join(" | ")}`);
}, "MAJOR");
await st("P-3", "qc-acc-v2-schema.mts: แก้เฉพาะข้อ enum AccountDocSource → 9 ค่าลงท้าย DORM (ข้อสถิตเก่าที่ผูกจำนวนค่า)", () => {
  const f = "scripts/qc-acc-v2-schema.mts";
  ok(readFileSync(join(ROOT, f), "utf8").includes(`"${[...OLD_SOURCES, "DORM"].join(",")}"`), "ไม่พบค่าคาด 9 ค่า ลงท้าย DORM");
  const minus = diffLines(f, "-");
  const plus = diffLines(f, "+");
  ok(minus.every((l) => /AccountDocSource|MANUAL,AI,IMPORT/.test(l)) && plus.every((l) => /AccountDocSource|MANUAL,AI,IMPORT/.test(l)), `แก้บรรทัดอื่น: ${[...minus, ...plus].filter((l) => !/AccountDocSource|MANUAL,AI,IMPORT/.test(l)).slice(0, 2).join(" | ")}`);
  ok(minus.length <= 2 && plus.length <= 2, `แก้ ${minus.length}/${plus.length} บรรทัด (ต้อง ≤ 2)`);
}, "MAJOR");
await st("P-4", "ชุดข้อสอบอื่น (scripts/qc-*) ไม่ถูกแตะ ยกเว้น qc-acc-v2-schema.mts", () => {
  const ch = changedFiles(["scripts"]).filter((f) => /^scripts\/qc-/.test(f) && f !== SELF && f !== "scripts/qc-acc-v2-schema.mts");
  ok(ch.length === 0, `แตะ: ${ch.slice(0, 6).join(", ")}`);
}, "MAJOR");

// ═══════════════ F. schema + scope + client ═══════════════
console.log("\n── F: โมเดล · scope registry · Prisma client ──");
const schemaAll = readdirSync(join(ROOT, "prisma/schema")).filter((f) => f.endsWith(".prisma")).map((f) => readFileSync(join(ROOT, "prisma/schema", f), "utf8")).join("\n");
await st("F-1", `โมเดลใหม่ ${NEW_MODELS.length} ตัวอยู่ใน prisma/schema (dorm.prisma)`, () => {
  const miss = NEW_MODELS.filter((m) => !new RegExp(`^model\\s+${m}\\s*\\{`, "m").test(schemaAll));
  ok(miss.length === 0, `ขาด: ${miss.join(", ")}`);
  ok(existsSync(join(ROOT, "prisma/schema/dorm.prisma")), "ไม่มี prisma/schema/dorm.prisma");
});
await st("F-NO", "ไม่มี DormSlip / DormLinkCode / settingsSnapshot (CC §9 — ใช้ PaymentSlip · ChatLinkCode · policySnapshot)", () => {
  ok(!/^model\s+(DormSlip|DormLinkCode)\b/m.test(schemaAll), "มี model DormSlip/DormLinkCode");
  ok(!/settingsSnapshot/.test(schemaAll), "มี settingsSnapshot");
});
await st("F-2", "scope.ts: Dorm* 11 ตัว = unit · DormAuthorityTariff = global พร้อมเหตุผล (fitness F1)", async () => {
  const scope = await tryImport<{ scopeOf: (m: string) => { axis: string; why?: string } }>("@/lib/core/scope");
  if (!scope.mod) throw new AssertFail(`โหลด scope.ts ไม่ได้ (${scope.err})`);
  const bad: string[] = [];
  const ax = (m: string) => { try { return scope.mod!.scopeOf(m); } catch { return { axis: "(ไม่ลงทะเบียน)", why: "" }; } };
  for (const m of DORM_UNIT_MODELS) if (ax(m).axis !== "unit") bad.push(`${m}=${ax(m).axis}`);
  const t = ax("DormAuthorityTariff");
  if (t.axis !== "global" || !(t.why ?? "").trim()) bad.push(`DormAuthorityTariff=${t.axis}${t.why ? "" : " (ไม่มี why)"}`);
  ok(bad.length === 0, bad.join(" · "));
});
await st("F-3", "Prisma client generate แล้ว: โมเดลหอ 12 ตัว + AccountDocSource.DORM + RoomOccupancy/HotelRoom เดิม · boot assert (assertRegistryComplete) ผ่าน", async () => {
  const c = await tryImport<{ Prisma: { dmmf: { datamodel: { models: { name: string; fields: { name: string }[] }[] } } }; AccountDocSource?: Record<string, string> }>("@prisma/client");
  if (!c.mod) throw new AssertFail(`import @prisma/client ไม่ได้ (${c.err})`);
  const dm = c.mod.Prisma.dmmf.datamodel;
  const miss: string[] = NEW_MODELS.filter((m) => !dm.models.some((x) => x.name === m));
  const f = (m: string) => new Set(dm.models.find((x) => x.name === m)?.fields.map((x) => x.name) ?? []);
  for (const [m, k] of [["DormLease", "policySnapshot"], ["DormBill", "policySnapshot"], ["DormBill", "accountDocumentId"], ["HotelRoom", "dormLeases"], ["HotelRoom", "dormMeters"]] as const) if (!f(m).has(k)) miss.push(`${m}.${k}`);
  // Prisma 7.8: dmmf.datamodel.enums ว่าง ⇒ อ่าน export enum ของ client (แบบ ORACLE-EDIT B.0-F3)
  if (!Object.values(c.mod.AccountDocSource ?? {}).includes("DORM")) miss.push("AccountDocSource.DORM");
  ok(miss.length === 0, `client ขาด: ${miss.join(", ")}`);
  const scope = await tryImport<{ assertRegistryComplete: (m: string[]) => void }>("@/lib/core/scope");
  if (!scope.mod) throw new AssertFail(`โหลด scope.ts ไม่ได้ (${scope.err})`);
  scope.mod.assertRegistryComplete(dm.models.map((m) => m.name));
});

// ═══════════════ M. migration ═══════════════
console.log("\n── M: migration svc_d ──");
const migDir = join(ROOT, "prisma", "migrations");
const migs = readdirSync(migDir).filter((d) => /^\d{14}_/.test(d)).sort();
const mD = migs.filter((d) => /^\d{14}_svc_d$/.test(d));
const migName = mD.length === 1 ? mD[0] : "";
let stmts: string[] = [];
const laterSvc = migName ? migs.slice(migs.indexOf(migName) + 1) : [];
await st("M-1", "มีโฟลเดอร์ `<ts>_svc_d` ตัวเดียว · ts มากกว่า svc_b · หลังจากนี้มีได้แค่ migration ของ SVC ใบหลัง (`_svc_*`)", () => {
  ok(mD.length === 1, `พบ ${mD.length}: ${mD.join(", ")}`);
  ok(migName > SVC_B, `${migName} ต้องเรียงหลัง ${SVC_B}`);
  ok(migs.includes(SVC_B), `ไม่พบ ${SVC_B}`);
  const alien = laterSvc.filter((d) => !/_svc_[a-z0-9]+$/.test(d));
  ok(alien.length === 0, `มี migration ที่ไม่ใช่ SVC หลัง svc_d: ${alien.join(", ")}`);
});
const acceptOnly = async (id: string, name: string, fn: () => void, sev: Sev = "CRITICAL") =>
  laterSvc.length ? skip(id, name, `มี migration SVC ใบหลังแล้ว (${laterSvc[0]}) — ข้อนี้ตรวจเฉพาะตอนรับ D.0`, sev) : st(id, name, fn, sev);
if (migName) {
  const code = readFileSync(join(migDir, migName, "migration.sql"), "utf8").split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");
  stmts = code.split(";").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
}
const needMig = async (id: string, name: string, fn: () => void, sev: Sev = "CRITICAL") => (migName ? st(id, name, fn, sev) : skip(id, name, "ไม่มี migration svc_d", sev));
await needMig("M-2", "SQL additive ล้วน (ไม่มี DROP/RENAME/เปลี่ยนชนิด/SET NOT NULL/NOT NULL ไร้ DEFAULT บนตารางเดิม/UPDATE/DELETE · ALTER TYPE = ADD VALUE ต่อท้าย)", () => {
  const bad: string[] = [];
  for (const s of stmts) {
    if (/\bDROP\b/i.test(s)) bad.push(`DROP: ${s.slice(0, 80)}`);
    if (/\bRENAME\b/i.test(s)) bad.push(`RENAME: ${s.slice(0, 80)}`);
    if (/ALTER\s+COLUMN\s+\S+\s+(SET\s+DATA\s+)?TYPE/i.test(s)) bad.push(`เปลี่ยนชนิด: ${s.slice(0, 80)}`);
    if (/SET\s+NOT\s+NULL/i.test(s)) bad.push(`SET NOT NULL: ${s.slice(0, 80)}`);
    if (/^ALTER\s+TYPE/i.test(s) && !/ADD\s+VALUE/i.test(s)) bad.push(`ALTER TYPE: ${s.slice(0, 80)}`);
    if (/^ALTER\s+TYPE/i.test(s) && /\b(BEFORE|AFTER)\b/i.test(s)) bad.push(`ADD VALUE ไม่ต่อท้าย: ${s.slice(0, 80)}`);
    if (/^ALTER\s+TABLE/i.test(s)) for (const add of s.split(/,\s*(?=ADD\s+COLUMN)/i)) if (/ADD\s+COLUMN/i.test(add) && /NOT\s+NULL/i.test(add) && !/DEFAULT/i.test(add)) bad.push(`NOT NULL ไร้ DEFAULT: ${add.slice(0, 80)}`);
    if (/^(DELETE|UPDATE|TRUNCATE|INSERT)\b/i.test(s)) bad.push(`แก้ข้อมูล: ${s.slice(0, 80)}`);
  }
  ok(bad.length === 0, bad.slice(0, 4).join(" | "));
});
await needMig("M-3", "SQL แตะเฉพาะตาราง Dorm* 12 ตัว + ดัชนีบน RoomOccupancy/HotelRoom/PaymentSlip/IntegrationCallLog + type AccountDocSource · FK อ้างได้แค่ HotelRoom/ตารางหอ (diff ผิดฐาน/drift HR ⇒ แดง)", () => {
  const bad: string[] = [];
  for (const s of stmts) {
    if (/^ALTER\s+TYPE\s+"AccountDocSource"/i.test(s)) continue;
    const m = s.match(/^(?:ALTER\s+TABLE|CREATE\s+TABLE|CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?"?[\w]+"?\s+ON)\s+(?:ONLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?(?:"?public"?\.)?"?(\w+)"?/i);
    if (!m) { bad.push(`ไม่รู้จัก: ${s.slice(0, 70)}`); continue; }
    if (!OWN_TABLES.has(m[1])) bad.push(`${m[1]}: ${s.slice(0, 60)}`);
    if (/^ALTER\s+TABLE/i.test(s) && OLD_TOUCHED.includes(m[1])) bad.push(`ALTER TABLE ตารางเดิม (ใบนี้เพิ่มได้แค่ดัชนี): ${s.slice(0, 70)}`);
    const ref = s.match(/REFERENCES\s+"?(\w+)"?/i)?.[1];
    if (ref && !FK_REF_OK.has(ref)) bad.push(`FK → ${ref}`);
  }
  ok(bad.length === 0, bad.slice(0, 4).join(" | "));
});
await needMig("M-4", "ALTER TYPE มีตัวเดียว: \"AccountDocSource\" ADD VALUE 'DORM'", () => {
  const adds = stmts.filter((s) => /^ALTER\s+TYPE/i.test(s)).map((s) => `${s.match(/ALTER\s+TYPE\s+"?(\w+)"?/i)?.[1]}:${s.match(/ADD\s+VALUE\s+(?:IF\s+NOT\s+EXISTS\s+)?'(\w+)'/i)?.[1]}`);
  eq(adds, ["AccountDocSource:DORM"], "ALTER TYPE");
});
await needMig("M-HAND", "ไม่มี CONCURRENTLY / CREATE EXTENSION (Prisma รันทีละคำสั่ง · ห้ามปน) · ดัชนีมือ 6 ตัวอยู่ในไฟล์ (WHERE ×4 · นิพจน์ idempotencyKey · NULLS NOT DISTINCT)", () => {
  const bad = stmts.filter((s) => /CONCURRENTLY|CREATE\s+EXTENSION/i.test(s));
  ok(bad.length === 0, `ต้องห้าม: ${bad.slice(0, 2).map((s) => s.slice(0, 70)).join(" | ")}`);
  const where = stmts.filter((s) => /^CREATE\s+(UNIQUE\s+)?INDEX/i.test(s) && /\bWHERE\b/i.test(s)).length;
  ok(where >= 4, `CREATE INDEX … WHERE ${where} ตัว (ต้อง ≥ 4: DormMeter · DormMeterReading · RoomOccupancy ×2)`);
  ok(stmts.some((s) => /^CREATE\s+UNIQUE\s+INDEX[^]*"PaymentSlip"[^]*->>\s*'idempotencyKey'/i.test(s)), "ไม่มี unique นิพจน์ PaymentSlip idempotencyKey");
  ok(stmts.some((s) => /^CREATE\s+UNIQUE\s+INDEX[^]*"DormUtilityRate"[^]*NULLS\s+NOT\s+DISTINCT/i.test(s)), "ไม่มี unique NULLS NOT DISTINCT ของ DormUtilityRate");
});
await acceptOnly("M-6", "schema แตะเฉพาะ dorm.prisma (ใหม่) · hotel · account · integration · payment.prisma + ไม่ลบ/แก้บรรทัดเดิม (ไม่ prisma format ทั้งชุด)", () => {
  const ch = changedFiles(["prisma/schema"]).map((p) => p.split("/").pop() ?? p);
  const outside = ch.filter((f) => !["dorm.prisma", "hotel.prisma", "account.prisma", "integration.prisma", "payment.prisma"].includes(f));
  const del = deletedLines(["prisma/schema"]);
  ok(ch.includes("dorm.prisma"), "ยังไม่มี dorm.prisma");
  ok(outside.length === 0 && del.length === 0, `${outside.length ? `ไฟล์นอกใบ: ${outside.join(", ")} ` : ""}${del.length ? `ลบบรรทัด: ${del.join(", ")}` : ""}`);
}, "MAJOR");
await acceptOnly("M-7", "บรรทัดที่เพิ่มในไฟล์ schema เดิมตรงที่อนุญาต (account: DORM · integration: @@index([at]) · payment: คอมเมนต์ · hotel: 3 ดัชนี + dormLeases/dormMeters)", () => {
  const allow: Record<string, RegExp[]> = {
    "prisma/schema/account.prisma": [/^DORM$/],
    "prisma/schema/integration.prisma": [/^@@index\(\[at\]\)$/],
    "prisma/schema/payment.prisma": [],
    "prisma/schema/hotel.prisma": [/^@@index\(\[tenantId,\s*refType,\s*refId\]\)$/, /^@@index\(\[tenantId,\s*unitId,\s*startDate\]\)$/, /^@@index\(\[buildingId\]\)$/, /^dormLeases\s+DormLease\[\]$/, /^dormMeters\s+DormMeter\[\]$/],
  };
  const bad: string[] = [];
  for (const [f, rs] of Object.entries(allow)) for (const l of diffLines(f, "+")) if (!rs.some((r) => r.test(l))) bad.push(`${f.split("/").pop()}: ${l.slice(0, 60)}`);
  ok(bad.length === 0, bad.slice(0, 4).join(" | "));
  ok(diffLines("prisma/schema/account.prisma", "+").length === 1, "account.prisma ต้องเพิ่ม DORM บรรทัดเดียว");
});

// ═══════════════ ต่อฐาน ═══════════════
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 14 });
const q = async <T extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, params: unknown[] = []) => (await pool.query<T>(sql, params)).rows;
type ColRow = { column_name: string; data_type: string; is_nullable: string; column_default: string | null };
const colCache = new Map<string, ColRow[]>();
const cols = async (table: string) => {
  if (!colCache.has(table)) colCache.set(table, await q<ColRow>(`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1`, [table]));
  return colCache.get(table) ?? [];
};
async function insertRow(table: string, vals: Record<string, unknown>, client: pg.Pool | pg.PoolClient = pool): Promise<void> {
  const v: Record<string, unknown> = { ...vals };
  for (const c of await cols(table)) {
    if (c.column_name in v || c.is_nullable === "YES" || c.column_default !== null) continue;
    const t = c.data_type;
    v[c.column_name] = c.column_name === "id" ? rid("id") : t === "text" || t.startsWith("character") ? "qc" : ["integer", "bigint", "numeric", "double precision"].includes(t) ? 0
      : t === "boolean" ? false : t === "jsonb" || t === "json" ? "{}" : t.startsWith("timestamp") ? new Date() : t === "date" ? day(400) : t === "ARRAY" ? [] : null;
  }
  const keys = Object.keys(v);
  await client.query(`INSERT INTO "${table}" (${keys.map((k) => `"${k}"`).join(", ")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(", ")})`, keys.map((k) => v[k]));
}
const tryCode = async (f: () => Promise<unknown>) => { try { await f(); return ""; } catch (e) { return pgCode(e) || errMsg(e); } };

const SLUG = "qc-svc-d0-";
const TARIFF_AUTH = "QCD0";
const tenantIds: string[] = [];
const CLEAN_TABLES = [
  "DormAnnouncementRead", "DormAnnouncement", "DormMoveOut", "DormBill", "DormBillRun", "DormMeterReading", "DormMeter", "DormUtilityRate", "DormRepair", "DormParcel", "DormLease",
  "RoomOccupancy", "PaymentSlip", "AccountDocument", "OutboxEvent", "AuditLog", "HotelRoom", "HotelRoomType", "BusinessUnit",
];
async function cleanup(ids: string[]) {
  if (!ids.length) return;
  const existing = new Set((await q<{ table_name: string }>(`SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema()`)).map((r) => r.table_name));
  for (const t of CLEAN_TABLES) {
    if (!existing.has(t)) continue;
    try { await pool.query(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, [ids]); } catch (e) { console.log(`  ⚠️ ลบ ${t}: ${errMsg(e)}`); }
  }
  try { await pool.query(`DELETE FROM "Tenant" WHERE id = ANY($1::text[])`, [ids]); } catch (e) { console.log(`  ⚠️ ลบ Tenant: ${errMsg(e)}`); }
}
async function cleanupTariff() {
  try {
    const has = await q(`SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'DormAuthorityTariff'`);
    if (has.length) await pool.query(`DELETE FROM "DormAuthorityTariff" WHERE authority LIKE $1`, [`${TARIFF_AUTH}%`]);
  } catch (e) { console.log(`  ⚠️ ลบ DormAuthorityTariff: ${errMsg(e)}`); }
}

type Db = Record<string, { findMany: (a?: unknown) => Promise<Record<string, unknown>[]>; count: (a?: unknown) => Promise<number> }> & { $disconnect: () => Promise<void> };
let db: Db | null = null;
let migAt: Date | null = null;
try {
  const stale = (await q<{ id: string }>(`SELECT id FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`])).map((r) => r.id);
  if (stale.length) { console.log(`\n(กวาด tenant ค้างจากรอบก่อน ${stale.length} ร้าน)`); await cleanup(stale); }
  await cleanupTariff();

  // ═══════════════ T. ตาราง/คอลัมน์ ═══════════════
  console.log("\n── T: ตาราง/คอลัมน์ (ใบสั่ง §2 · ตรงชุด) ──");
  type Col = { t: string; n: boolean; d?: string };
  const TS = "timestamp without time zone";
  const S = (n = false, d?: string): Col => ({ t: "text", n, d });
  const I = (n = false, d?: string): Col => ({ t: "integer", n, d });
  const D = (n = false, d?: string): Col => ({ t: TS, n, d });
  const DT = (n = false): Col => ({ t: "date", n });
  const J = (n = true): Col => ({ t: "jsonb", n });
  const B = (n = false, d?: string): Col => ({ t: "boolean", n, d });
  const NOW = "CURRENT_TIMESTAMP";
  const base = (): Record<string, Col> => ({ id: S(), tenantId: S(), unitId: S(), createdAt: D(false, NOW), updatedAt: D() });
  const ns = (...names: string[]): Record<string, Col> => Object.fromEntries(names.map((n) => [n, S(true)]));
  const SPEC: [string, string, Record<string, Col>][] = [
    ["T-1", "DormLease", {
      ...base(), roomId: S(), partyId: S(), coTenants: J(), status: S(false, "DRAFT"), termType: S(false, "FIXED"), startDate: DT(), endDate: DT(true),
      rentSatang: I(), commonFeeSatang: I(false, "0"), depositSatang: I(false, "0"), advanceRentSatang: I(false, "0"), bookingFeeSatang: I(false, "0"),
      ...ns("occupancyId", "signatureFileId", "templateKey", "depositDocumentId", "previousLeaseId", "endReason", "createdById"),
      signedAt: D(true), templateVersion: I(true), moveInPhotos: J(), endedAt: D(true), policySnapshot: J(),
    }],
    ["T-2", "DormMeter", {
      ...base(), roomId: S(true), buildingId: S(true), kind: S(), role: S(false, "ROOM"), ...ns("serial", "replacedById", "note"),
      digits: I(true), startReading: I(false, "0"), installedAt: D(false, NOW), removedAt: D(true),
    }],
    ["T-3", "DormMeterReading", {
      ...base(), meterId: S(), periodKey: S(), kind: S(false, "PERIOD"), ...ns("leaseId", "photoFileId", "flag", "flagNote", "readById", "confirmedById"),
      value: I(), aiValue: I(true), readAt: D(false, NOW), source: S(false, "MANUAL"), confirmedAt: D(true),
    }],
    ["T-4", "DormUtilityRate", {
      ...base(), buildingId: S(true), kind: S(), periodKey: S(), mode: S(), authorityBillSatang: I(true), rateSatangPerUnit: I(true), authorityUnits: I(true),
      ...ns("billPhotoFileId", "enteredById"), legalCheck: J(),
    }],
    ["T-5", "DormAuthorityTariff", {
      id: S(), authority: S(), kind: S(), tariffCode: S(), ...ns("label", "sourceUrl", "note"), effectiveFrom: DT(), effectiveTo: DT(true),
      tiers: J(false), ftE4: I(false, "0"), serviceSatang: I(true), createdAt: D(false, NOW), updatedAt: D(),
    }],
    ["T-6", "DormBillRun", {
      ...base(), periodKey: S(), status: S(false, "DRAFT"), issueDate: DT(true), dueDate: DT(true), scheduledSendAt: D(true), sentAt: D(true),
      billCount: I(false, "0"), totalSatang: I(false, "0"), progress: J(), createdById: S(true),
    }],
    ["T-7", "DormBill", {
      ...base(), runId: S(), leaseId: S(), roomId: S(), partyId: S(), periodKey: S(), status: S(false, "DRAFT"), ...ns("holdReason", "accountDocumentId", "paymentRequestId", "sentVia"),
      lines: J(false), subtotalSatang: I(), totalSatang: I(), vatSatang: I(false, "0"), paidSatang: I(false, "0"), carriedSatang: I(false, "0"),
      dueDate: DT(true), sentAt: D(true), paidAt: D(true), policySnapshot: J(),
    }],
    ["T-8", "DormMoveOut", {
      ...base(), leaseId: S(), status: S(false, "NOTICE"), noticeAt: D(false, NOW), moveOutDate: DT(), inspection: J(), deductions: J(),
      depositSatang: I(false, "0"), deductSatang: I(false, "0"), refundSatang: I(false, "0"), refundDueAt: D(true), refundedAt: D(true),
      ...ns("settlementDocumentId", "approvalId", "createdById"),
    }],
    ["T-9", "DormRepair", {
      ...base(), roomId: S(), ...ns("leaseId", "partyId", "preferredTime", "kanbanCardId", "ratingNote"), category: S(), text: S(), files: J(),
      allowEntry: B(false, "false"), status: S(false, "OPEN"), rating: I(true), doneAt: D(true),
    }],
    ["T-10", "DormAnnouncement", { ...base(), title: S(), body: S(), audience: S(false, "ALL"), audienceIds: J(), publishedAt: D(true), createdById: S(true) }],
    ["T-11", "DormAnnouncementRead", { id: S(), tenantId: S(), unitId: S(), announcementId: S(), partyId: S(), readAt: D(false, NOW) }],
    ["T-12", "DormParcel", {
      ...base(), roomId: S(), ...ns("leaseId", "partyId", "carrier", "trackingNo", "photoFileId", "receivedById", "pickedUpByPartyId", "signatureFileId"),
      status: S(false, "WAITING"), receivedAt: D(false, NOW), pickedUpAt: D(true), lastRemindedAt: D(true), remindCount: I(false, "0"),
    }],
  ];
  for (const [id, table, spec] of SPEC) {
    await st(id, `${table} (${Object.keys(spec).length} คอลัมน์ ตรงชุด)`, async () => {
      const have = new Map((await cols(table)).map((c) => [c.column_name, c]));
      ok(have.size > 0, `ไม่มีตาราง ${table}`);
      const probs: string[] = [];
      for (const [c, w] of Object.entries(spec)) {
        const h = have.get(c);
        if (!h) { probs.push(`ขาด ${c}`); continue; }
        if (h.data_type !== w.t) probs.push(`${c}: ${h.data_type}≠${w.t}`);
        if ((h.is_nullable === "YES") !== w.n) probs.push(`${c}: ${w.n ? "ต้อง null ได้" : "ต้อง NOT NULL"}`);
        if (w.d && !(h.column_default ?? "").includes(w.d)) probs.push(`${c}: default ${h.column_default ?? "(ไม่มี)"}≠${w.d}`);
      }
      const extra = [...have.keys()].filter((c) => !(c in spec));
      if (extra.length) probs.push(`คอลัมน์เกินใบสั่ง: ${extra.join(", ")}`);
      ok(probs.length === 0, probs.slice(0, 5).join(" · "));
    });
  }
  await st("T-MONEY", "เงินในตารางหอ = integer สตางค์ (ทุกคอลัมน์ *Satang เป็น integer · ไม่มี numeric/double/real/bigint/money ในตาราง Dorm*)", async () => {
    const rows = await q<{ table_name: string; column_name: string; data_type: string }>(
      `SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = ANY($1::text[])`, [NEW_MODELS]);
    ok(rows.length > 0, "ไม่มีตารางหอ");
    const bad = rows.filter((r) => (/Satang$/.test(r.column_name) && r.data_type !== "integer") || ["numeric", "double precision", "real", "bigint", "money"].includes(r.data_type))
      .map((r) => `${r.table_name}.${r.column_name}=${r.data_type}`);
    ok(bad.length === 0, bad.slice(0, 5).join(" · "));
  });
  await st("T-NO", "DB ไม่มีตาราง DormSlip / DormLinkCode", async () => {
    const r = await q<{ t: string }>(`SELECT table_name AS t FROM information_schema.tables WHERE table_schema = current_schema() AND table_name IN ('DormSlip','DormLinkCode')`);
    eq(r.map((x) => x.t), [], "ตาราง");
  });

  // ═══════════════ I. ดัชนี ═══════════════
  console.log("\n── I: ดัชนี (+ หนี้ดัชนี R0.6/R0.8) ──");
  type IxRow = { name: string; uniq: boolean; cols: string[]; pred: string | null; def: string; nnd: boolean; nexpr: number };
  const ixOf = (table: string) => q<IxRow>(
    `SELECT i.relname AS name, ix.indisunique AS uniq, ix.indnullsnotdistinct AS nnd, pg_get_indexdef(ix.indexrelid) AS def,
            (SELECT count(*)::int FROM unnest(ix.indkey) k(n) WHERE k.n = 0) AS nexpr,
            ARRAY(SELECT a.attname::text FROM unnest(ix.indkey) WITH ORDINALITY k(n, o) JOIN pg_attribute a ON a.attrelid = ix.indrelid AND a.attnum = k.n ORDER BY k.o) AS cols,
            pg_get_expr(ix.indpred, ix.indrelid) AS pred
       FROM pg_index ix JOIN pg_class i ON i.oid = ix.indexrelid JOIN pg_class t ON t.oid = ix.indrelid JOIN pg_namespace ns ON ns.oid = t.relnamespace
      WHERE t.relname = $1 AND ns.nspname = current_schema()`, [table]);
  const IDX: [string, string, string[], boolean][] = [
    ["I-1", "DormLease", ["tenantId", "unitId", "status"], false],
    ["I-2", "DormLease", ["roomId"], false],
    ["I-3", "DormLease", ["partyId"], false],
    ["I-4", "DormMeter", ["tenantId", "unitId"], false],
    ["I-5", "DormMeterReading", ["tenantId", "unitId", "periodKey"], false],
    ["I-6", "DormMeterReading", ["meterId", "readAt"], false],
    ["I-7", "DormUtilityRate", ["tenantId", "unitId"], false],
    ["I-8", "DormAuthorityTariff", ["authority", "kind", "tariffCode", "effectiveFrom"], true],
    ["I-9", "DormBillRun", ["unitId", "periodKey"], true],
    ["I-10", "DormBillRun", ["tenantId", "unitId", "status"], false],
    ["I-11", "DormBill", ["leaseId", "periodKey"], true],
    ["I-12", "DormBill", ["accountDocumentId"], true],
    ["I-13", "DormBill", ["runId"], false],
    ["I-14", "DormBill", ["tenantId", "unitId", "periodKey"], false],
    ["I-15", "DormBill", ["tenantId", "unitId", "status"], false],
    ["I-16", "DormBill", ["partyId"], false],
    ["I-17", "DormMoveOut", ["leaseId"], true],
    ["I-18", "DormMoveOut", ["tenantId", "unitId", "status"], false],
    ["I-19", "DormMoveOut", ["refundDueAt"], false],
    ["I-20", "DormRepair", ["tenantId", "unitId", "status"], false],
    ["I-21", "DormRepair", ["roomId"], false],
    ["I-22", "DormAnnouncement", ["tenantId", "unitId", "publishedAt"], false],
    ["I-23", "DormAnnouncementRead", ["announcementId", "partyId"], true],
    ["I-24", "DormAnnouncementRead", ["tenantId", "unitId"], false],
    ["I-25", "DormParcel", ["tenantId", "unitId", "status"], false],
    ["I-26", "DormParcel", ["roomId"], false],
    ["I-27", "RoomOccupancy", ["tenantId", "refType", "refId"], false],
    ["I-28", "RoomOccupancy", ["tenantId", "unitId", "startDate"], false],
    ["I-29", "HotelRoom", ["buildingId"], false],
    ["I-30", "IntegrationCallLog", ["at"], false],
  ];
  for (const [id, table, c, u] of IDX) {
    await st(id, `${table} ${u ? "@@unique" : "@@index"}(${c.join(", ")})`, async () => {
      const rows = await ixOf(table);
      ok(rows.some((r) => r.pred === null && r.nexpr === 0 && r.uniq === u && r.cols.join(",") === c.join(",")), rows.length ? "ไม่พบดัชนีตรงคอลัมน์/ลำดับ/ชนิด" : "ไม่มีตาราง");
    });
  }
  const findIx = async (table: string, f: (r: IxRow) => boolean) => (await ixOf(table)).find(f);
  await st("I-31", "DormMeter partial unique (roomId, kind) WHERE removedAt IS NULL AND roomId IS NOT NULL", async () => {
    ok(!!(await findIx("DormMeter", (r) => r.uniq && r.cols.join(",") === "roomId,kind" && /"removedAt" IS NULL/i.test(r.pred ?? "") && /"roomId" IS NOT NULL/i.test(r.pred ?? ""))), "ไม่พบ");
  });
  await st("I-32", "DormMeterReading partial unique (meterId, periodKey) WHERE kind = 'PERIOD'", async () => {
    ok(!!(await findIx("DormMeterReading", (r) => r.uniq && r.cols.join(",") === "meterId,periodKey" && /kind = 'PERIOD'/i.test(r.pred ?? ""))), "ไม่พบ");
  });
  await st("I-33", "DormUtilityRate unique (unitId, buildingId, kind, periodKey) NULLS NOT DISTINCT", async () => {
    ok(!!(await findIx("DormUtilityRate", (r) => r.uniq && r.nnd && r.pred === null && r.cols.join(",") === "unitId,buildingId,kind,periodKey")), "ไม่พบ (ต้อง NULLS NOT DISTINCT)");
  });
  await st("I-34", "RoomOccupancy partial (holdExpiresAt) WHERE active AND kind IN ('HOLD','CHANNEL_HOLD') (carry R0.8 — expireHolds)", async () => {
    ok(!!(await findIx("RoomOccupancy", (r) => !r.uniq && r.cols.join(",") === "holdExpiresAt" && /active/i.test(r.pred ?? "") && /'HOLD'/.test(r.pred ?? "") && /'CHANNEL_HOLD'/.test(r.pred ?? ""))), "ไม่พบ");
  });
  await st("I-35", "RoomOccupancy partial unique (refType, refId) WHERE active AND kind = 'STAY' (มติ R0.8)", async () => {
    ok(!!(await findIx("RoomOccupancy", (r) => r.uniq && r.cols.join(",") === "refType,refId" && /active/i.test(r.pred ?? "") && /kind = 'STAY'/i.test(r.pred ?? ""))), "ไม่พบ");
  });
  await st("I-36", "PaymentSlip unique นิพจน์ (tenantId, (checks->>'idempotencyKey')) ไม่มี WHERE (carry R0.6)", async () => {
    ok(!!(await findIx("PaymentSlip", (r) => r.uniq && r.pred === null && r.nexpr === 1 && r.cols.join(",") === "tenantId" && /->>\s*'idempotencyKey'/.test(r.def))), "ไม่พบ");
  });
  await st("I-37", "ดัชนีเดิมของ RoomOccupancy/PaymentSlip ยังอยู่ (EXCLUDE no_overlap · partial unique imageHash/transRef)", async () => {
    const ro = await ixOf("RoomOccupancy");
    const ps = await ixOf("PaymentSlip");
    ok(ro.some((r) => r.name === "RoomOccupancy_no_overlap"), "RoomOccupancy_no_overlap หาย");
    ok(ps.some((r) => r.name === "PaymentSlip_tenantId_imageHash_active_key") && ps.some((r) => r.name === "PaymentSlip_tenantId_transRef_active_key"), "partial unique ของ PaymentSlip หาย");
  });

  // ═══════════════ K. FK ═══════════════
  await st("K-1", "FK ตรงชุด: Lease.roomId/Meter.roomId→HotelRoom (RESTRICT) · Reading.meterId→Meter · Bill.runId→Run · Bill.leaseId/MoveOut.leaseId→Lease (RESTRICT) · AnnouncementRead→Announcement (CASCADE) · ไม่มี FK อื่น", async () => {
    const fks = await q<{ src: string; dst: string; cols: string[]; del: string }>(
      `SELECT t.relname AS src, r.relname AS dst, c.confdeltype AS del,
              ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY k(n, o) JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.n ORDER BY k.o) AS cols
         FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid JOIN pg_class r ON r.oid = c.confrelid JOIN pg_namespace ns ON ns.oid = t.relnamespace
        WHERE c.contype = 'f' AND ns.nspname = current_schema() AND t.relname = ANY($1::text[])`, [NEW_MODELS]);
    const sig = fks.map((f) => `${f.src}.${f.cols.join("+")}->${f.dst}:${f.del}`).sort();
    eq(sig, [
      "DormAnnouncementRead.announcementId->DormAnnouncement:c",
      "DormBill.leaseId->DormLease:r",
      "DormBill.runId->DormBillRun:r",
      "DormLease.roomId->HotelRoom:r",
      "DormMeter.roomId->HotelRoom:r",
      "DormMeterReading.meterId->DormMeter:r",
      "DormMoveOut.leaseId->DormLease:r",
    ], "FK");
  });

  // ═══════════════ N. enum ═══════════════
  await st("N-1", "AccountDocSource = 8 ค่าเดิมคงลำดับ + DORM ต่อท้าย (DB) · account.prisma DORM อยู่ท้าย enum", async () => {
    const en = (await q<{ l: string }>(`SELECT e.enumlabel AS l FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'AccountDocSource' ORDER BY e.enumsortorder`)).map((r) => r.l);
    eq(en, [...OLD_SOURCES, "DORM"], "enum (DB)");
    const src = readFileSync(join(ROOT, "prisma/schema/account.prisma"), "utf8");
    const vals = (src.match(/enum AccountDocSource \{([\s\S]*?)\}/)?.[1] ?? "").split("\n").map((l) => l.replace(/\/\/.*$/, "").trim()).filter(Boolean);
    eq(vals, [...OLD_SOURCES, "DORM"], "enum (account.prisma)");
  });

  // ═══════════════ M-5 ลงฐาน ═══════════════
  if (migName) {
    await st("M-5", `migration ${migName} ลง qc-svc แล้ว (migrate deploy · finished · ไม่ rolled back)`, async () => {
      const m = await q<{ finished_at: Date | null; rolled_back_at: Date | null }>(`SELECT finished_at, rolled_back_at FROM "_prisma_migrations" WHERE migration_name = $1`, [migName]);
      ok(m.length === 1 && m[0].finished_at !== null && m[0].rolled_back_at === null, `แถว ${m.length}`);
      migAt = m[0].finished_at;
    });
  } else skip("M-5", "migration svc_d ลง qc-svc แล้ว", "ไม่มี migration svc_d");

  // ═══════════════ fixture ═══════════════
  const RUN = Date.now().toString(36);
  const tA = rid("ta");
  const tB = rid("tb");
  const uA = rid("ua");
  const uB = rid("ub");
  for (const [t, u, n] of [[tA, uA, "A"], [tB, uB, "B"]] as const) {
    await insertRow("Tenant", { id: t, name: `QC SVC D.0 หอ ${n}`, slug: `${SLUG}${n.toLowerCase()}${RUN}${Math.random().toString(36).slice(2, 6)}`, updatedAt: new Date() });
    tenantIds.push(t);
    await insertRow("BusinessUnit", { id: u, tenantId: t, type: "DORM", name: `หอทดสอบ D.0 ${n}`, slug: `u-d0-${n.toLowerCase()}-${RUN}`, updatedAt: new Date() });
  }
  const RT = rid("rt");
  await insertRow("HotelRoomType", { id: RT, tenantId: tA, unitId: uA, name: "ห้องพัดลม", updatedAt: new Date() });
  const rooms: string[] = [];
  for (let i = 1; i <= 6; i++) {
    const r = rid(`r${i}`);
    await insertRow("HotelRoom", { id: r, tenantId: tA, unitId: uA, roomTypeId: RT, number: `D0-${i}${RUN.slice(-3)}`, updatedAt: new Date() });
    rooms.push(r);
  }
  const [R1, R2, R3, R4, R5, R6] = rooms;
  const now = () => new Date();
  // ตัวสร้างแถวหอ (ค่าถูกต้องขั้นต่ำ · over ทับได้)
  const lease = (over: Record<string, unknown> = {}, c: pg.Pool | pg.PoolClient = pool) => insertRow("DormLease", { id: rid("ls"), tenantId: tA, unitId: uA, roomId: R1, partyId: rid("pt"), startDate: day(10), rentSatang: 450000, updatedAt: now(), ...over }, c);
  const meter = (over: Record<string, unknown> = {}) => insertRow("DormMeter", { id: rid("mt"), tenantId: tA, unitId: uA, kind: "ELEC", role: "MAIN", roomId: null, updatedAt: now(), ...over });
  const reading = (meterId: string, over: Record<string, unknown> = {}) => insertRow("DormMeterReading", { id: rid("rd"), tenantId: tA, unitId: uA, meterId, periodKey: nextPk(), value: 120, updatedAt: now(), ...over });
  const rate = (over: Record<string, unknown> = {}) => insertRow("DormUtilityRate", { id: rid("ur"), tenantId: tA, unitId: uA, buildingId: rid("bd"), kind: "ELEC", periodKey: nextPk(), mode: "ACTUAL_COST", updatedAt: now(), ...over });
  const tariff = (over: Record<string, unknown> = {}) => insertRow("DormAuthorityTariff", { id: rid("tf"), authority: `${TARIFF_AUTH}${RUN}`, kind: "ELEC", tariffCode: rid("tc"), effectiveFrom: day(0), tiers: JSON.stringify([{ uptoUnits: 150, rateE4: 32484 }, { uptoUnits: null, rateE4: 42218 }]), updatedAt: now(), ...over });
  const run = (over: Record<string, unknown> = {}) => insertRow("DormBillRun", { id: rid("rn"), tenantId: tA, unitId: uA, periodKey: nextPk(), updatedAt: now(), ...over });
  const moveOut = (leaseId: string, over: Record<string, unknown> = {}) => insertRow("DormMoveOut", { id: rid("mo"), tenantId: tA, unitId: uA, leaseId, moveOutDate: day(40), updatedAt: now(), ...over });
  const repair = (over: Record<string, unknown> = {}) => insertRow("DormRepair", { id: rid("rp"), tenantId: tA, unitId: uA, roomId: R2, category: "ELECTRIC", text: "ไฟห้องน้ำดับ", updatedAt: now(), ...over });
  const ann = (over: Record<string, unknown> = {}) => insertRow("DormAnnouncement", { id: rid("an"), tenantId: tA, unitId: uA, title: "ปิดน้ำซ่อมท่อ", body: "ปิดน้ำ 2 ชั่วโมง", updatedAt: now(), ...over });
  const parcel = (over: Record<string, unknown> = {}) => insertRow("DormParcel", { id: rid("pc"), tenantId: tA, unitId: uA, roomId: R2, updatedAt: now(), ...over });

  // แถวหลักสำหรับ O/CK (สร้างใน O-0 · ถ้าล้มทุกข้อที่พึ่งจะแดงพร้อมเหตุผล)
  type Fx = { L0: string; RUN0: string; MMAIN: string; party: string };
  let fx: Fx | null = null;
  const FX = (): Fx => { if (!fx) throw new AssertFail("ไม่มี fixture หอ (O-0 ไม่ผ่าน)"); return fx; };
  const bill = (over: Record<string, unknown> = {}, c: pg.Pool | pg.PoolClient = pool) =>
    insertRow("DormBill", { id: rid("bl"), tenantId: tA, unitId: uA, runId: FX().RUN0, leaseId: FX().L0, roomId: R1, partyId: FX().party, periodKey: nextPk(), lines: "[]", subtotalSatang: 450000, totalSatang: 450000, updatedAt: now(), ...over }, c);

  console.log("\n── O-0: fixture หอ ──");
  await st("O-0", "INSERT แบบค่าขั้นต่ำได้ทุกตาราง + ค่าเริ่มตามใบสั่ง (สัญญา DRAFT/FIXED/เงิน 0 · รอบบิล DRAFT · มิเตอร์ ROOM/0 · บิล DRAFT · ย้ายออก NOTICE · ซ่อม OPEN · ประกาศ ALL · พัสดุ WAITING)", async () => {
    const L0 = rid("L0"); const RUN0 = rid("RUN0"); const MMAIN = rid("MMAIN"); const party = rid("party");
    await lease({ id: L0, partyId: party });
    await run({ id: RUN0 });
    await meter({ id: MMAIN });
    fx = { L0, RUN0, MMAIN, party };
    const M1 = rid("m1");
    await insertRow("DormMeter", { id: M1, tenantId: tA, unitId: uA, kind: "ELEC", roomId: R1, updatedAt: now() });
    const [l] = await q<Record<string, unknown>>(`SELECT status, "termType", "commonFeeSatang", "depositSatang", "advanceRentSatang", "bookingFeeSatang", "endDate", "policySnapshot" FROM "DormLease" WHERE id = $1`, [L0]);
    eq(l, { status: "DRAFT", termType: "FIXED", commonFeeSatang: 0, depositSatang: 0, advanceRentSatang: 0, bookingFeeSatang: 0, endDate: null, policySnapshot: null }, "DormLease ค่าเริ่ม");
    const [m] = await q<Record<string, unknown>>(`SELECT role, "startReading", "removedAt" FROM "DormMeter" WHERE id = $1`, [M1]);
    eq(m, { role: "ROOM", startReading: 0, removedAt: null }, "DormMeter ค่าเริ่ม");
    const [r] = await q<Record<string, unknown>>(`SELECT status, "billCount", "totalSatang" FROM "DormBillRun" WHERE id = $1`, [RUN0]);
    eq(r, { status: "DRAFT", billCount: 0, totalSatang: 0 }, "DormBillRun ค่าเริ่ม");
    const B0 = rid("B0");
    await bill({ id: B0 });
    const [b] = await q<Record<string, unknown>>(`SELECT status, "vatSatang", "paidSatang", "carriedSatang" FROM "DormBill" WHERE id = $1`, [B0]);
    eq(b, { status: "DRAFT", vatSatang: 0, paidSatang: 0, carriedSatang: 0 }, "DormBill ค่าเริ่ม");
    const RD = rid("rd0");
    await reading(MMAIN, { id: RD });
    const [rd] = await q<Record<string, unknown>>(`SELECT kind, source FROM "DormMeterReading" WHERE id = $1`, [RD]);
    eq(rd, { kind: "PERIOD", source: "MANUAL" }, "DormMeterReading ค่าเริ่ม");
    const LM = rid("lm"); await lease({ id: LM }); const MO = rid("mo0"); await moveOut(LM, { id: MO });
    const [mo] = await q<Record<string, unknown>>(`SELECT status, "depositSatang", "deductSatang", "refundSatang" FROM "DormMoveOut" WHERE id = $1`, [MO]);
    eq(mo, { status: "NOTICE", depositSatang: 0, deductSatang: 0, refundSatang: 0 }, "DormMoveOut ค่าเริ่ม");
    const RP = rid("rp0"); await repair({ id: RP });
    const AN = rid("an0"); await ann({ id: AN });
    const PC = rid("pc0"); await parcel({ id: PC });
    const [x] = await q<{ rs: string; ae: boolean; au: string; ps: string; rc: number }>(
      `SELECT (SELECT status FROM "DormRepair" WHERE id = $1) AS rs, (SELECT "allowEntry" FROM "DormRepair" WHERE id = $1) AS ae,
              (SELECT audience FROM "DormAnnouncement" WHERE id = $2) AS au, (SELECT status FROM "DormParcel" WHERE id = $3) AS ps, (SELECT "remindCount" FROM "DormParcel" WHERE id = $3) AS rc`, [RP, AN, PC]);
    eq(x, { rs: "OPEN", ae: false, au: "ALL", ps: "WAITING", rc: 0 }, "ซ่อม/ประกาศ/พัสดุ ค่าเริ่ม");
    await rate();
    await tariff();
  });

  // ═══════════════ CK. CHECK ═══════════════
  console.log("\n── CK: CHECK constraint (SQL มือ · ตารางใหม่) ──");
  const expectCodes = async (cases: [string, () => Promise<unknown>, string][]) => {
    const bad: string[] = [];
    for (const [what, f, want] of cases) { const got = await tryCode(f); if (got !== want) bad.push(`${what}: ได้ ${got || "สำเร็จ"} ต้อง ${want || "สำเร็จ"}`); }
    ok(bad.length === 0, bad.slice(0, 4).join(" · "));
  };
  await st("CK-1", "DormLease: status นอกรายการ · endDate ≤ startDate · เงินติดลบ (5 ช่อง) ⇒ 23514 · endDate null / > start ได้", async () => {
    FX();
    await expectCodes([
      ["status=SIGNED", () => lease({ status: "SIGNED" }), "23514"],
      ["endDate=startDate", () => lease({ startDate: day(20), endDate: day(20) }), "23514"],
      ["endDate<startDate", () => lease({ startDate: day(20), endDate: day(19) }), "23514"],
      ["endDate>startDate", () => lease({ startDate: day(20), endDate: day(385) }), ""],
      ...(["rentSatang", "commonFeeSatang", "depositSatang", "advanceRentSatang", "bookingFeeSatang"].map((k) => [`${k}=-1`, () => lease({ [k]: -1 }), "23514"] as [string, () => Promise<unknown>, string])),
      ["status ทั้ง 5", async () => { for (const s of ["DRAFT", "ACTIVE", "NOTICE", "ENDED", "CANCELLED"]) await lease({ status: s }); }, ""],
    ]);
  });
  await st("CK-2", "DormMeter: kind นอก ELEC/WATER · role ROOM ไม่มีห้อง · role MAIN มีห้อง · startReading < 0 · digits 0/13 ⇒ 23514 · MAIN ไม่มีห้อง/WATER/digits 6 ได้", async () => {
    await expectCodes([
      ["kind=GAS", () => meter({ kind: "GAS" }), "23514"],
      ["ROOM ไม่มีห้อง", () => meter({ role: "ROOM", roomId: null }), "23514"],
      ["MAIN มีห้อง", () => meter({ role: "MAIN", roomId: R6 }), "23514"],
      ["startReading=-1", () => meter({ startReading: -1 }), "23514"],
      ["digits=0", () => meter({ digits: 0 }), "23514"],
      ["digits=13", () => meter({ digits: 13 }), "23514"],
      ["MAIN WATER digits 6", () => meter({ kind: "WATER", digits: 6 }), ""],
    ]);
  });
  await st("CK-3", "DormMeterReading: periodKey ผิดรูป (2026-13 · 202610 · 2026-1) · value < 0 · source/kind นอกรายการ ⇒ 23514 · MOVE_OUT/AI ได้", async () => {
    const M = FX().MMAIN;
    await expectCodes([
      ["periodKey=YYYY-13", () => reading(M, { periodKey: `${Y0}-13` }), "23514"],
      ["periodKey=YYYYMM", () => reading(M, { periodKey: `${Y0}10` }), "23514"],
      ["periodKey=YYYY-1", () => reading(M, { periodKey: `${Y0}-1` }), "23514"],
      ["value=-1", () => reading(M, { value: -1 }), "23514"],
      ["source=OCR", () => reading(M, { source: "OCR" }), "23514"],
      ["kind=ADJUST", () => reading(M, { kind: "ADJUST" }), "23514"],
      ["MOVE_OUT + AI", () => reading(M, { kind: "MOVE_OUT", source: "AI", aiValue: 130 }), ""],
    ]);
  });
  await st("CK-4", "DormUtilityRate: mode/kind นอกรายการ · periodKey ผิดรูป · ยอด/หน่วย/อัตราติดลบ ⇒ 23514 · TARIFF/FLAT/FIXED_RATE ได้", async () => {
    await expectCodes([
      ["mode=AVERAGE", () => rate({ mode: "AVERAGE" }), "23514"],
      ["kind=GAS", () => rate({ kind: "GAS" }), "23514"],
      ["periodKey=YYYY-00", () => rate({ periodKey: `${Y0}-00` }), "23514"],
      ["authorityBillSatang=-1", () => rate({ authorityBillSatang: -1 }), "23514"],
      ["authorityUnits=-1", () => rate({ authorityUnits: -1 }), "23514"],
      ["rateSatangPerUnit=-1", () => rate({ rateSatangPerUnit: -1 }), "23514"],
      ["3 mode", async () => { for (const m of ["TARIFF", "FLAT", "FIXED_RATE"]) await rate({ mode: m, kind: "WATER" }); }, ""],
    ]);
  });
  await st("CK-5", "DormAuthorityTariff: kind นอกรายการ · effectiveTo ≤ effectiveFrom · serviceSatang < 0 ⇒ 23514 · ftE4 ติดลบได้ (Ft เคยติดลบ) · ช่วงวันถูกได้", async () => {
    await expectCodes([
      ["kind=GAS", () => tariff({ kind: "GAS" }), "23514"],
      ["effectiveTo=effectiveFrom", () => tariff({ effectiveFrom: day(30), effectiveTo: day(30) }), "23514"],
      ["serviceSatang=-1", () => tariff({ serviceSatang: -1 }), "23514"],
      ["ftE4=-1160", () => tariff({ ftE4: -1160 }), ""],
      ["ช่วงวันถูก", () => tariff({ effectiveFrom: day(30), effectiveTo: day(150), serviceSatang: 3822 }), ""],
    ]);
  });
  await st("CK-6", "DormBillRun: status นอกรายการ · periodKey ผิดรูป · billCount/totalSatang < 0 ⇒ 23514", async () => {
    await expectCodes([
      ["status=OPEN", () => run({ status: "OPEN" }), "23514"],
      ["periodKey ผิดรูป", () => run({ periodKey: "next-month" }), "23514"],
      ["billCount=-1", () => run({ billCount: -1 }), "23514"],
      ["totalSatang=-1", () => run({ totalSatang: -1 }), "23514"],
      ["status ทั้ง 4", async () => { for (const s of ["DRAFT", "REVIEW", "SENT", "CLOSED"]) await run({ status: s }); }, ""],
    ]);
  });
  await st("CK-7", "DormBill: status นอกรายการ · periodKey ผิดรูป · เงินติดลบ (5 ช่อง) ⇒ 23514 · จ่ายเกินยอดได้ (ไม่บังคับความสัมพันธ์) · status 6 ค่าได้", async () => {
    FX();
    await expectCodes([
      ["status=OVERDUE", () => bill({ status: "OVERDUE" }), "23514"],
      ["periodKey ผิดรูป", () => bill({ periodKey: `${Y0}/01` }), "23514"],
      ...(["subtotalSatang", "totalSatang", "vatSatang", "paidSatang", "carriedSatang"].map((k) => [`${k}=-1`, () => bill({ [k]: -1 }), "23514"] as [string, () => Promise<unknown>, string])),
      ["จ่ายเกิน", () => bill({ paidSatang: 500000 }), ""],
      ["status ทั้ง 6", async () => { for (const s of ["DRAFT", "HELD", "SENT", "PARTIALLY_PAID", "PAID", "VOID"]) await bill({ status: s }); }, ""],
    ]);
  });
  await st("CK-8", "DormMoveOut: status นอกรายการ · deposit/deduct/refund ติดลบ ⇒ 23514", async () => {
    const mk = async (over: Record<string, unknown>) => { const L = rid("lmo"); await lease({ id: L }); return moveOut(L, over); };
    await expectCodes([
      ["status=DONE", () => mk({ status: "DONE" }), "23514"],
      ["depositSatang=-1", () => mk({ depositSatang: -1 }), "23514"],
      ["deductSatang=-1", () => mk({ deductSatang: -1 }), "23514"],
      ["refundSatang=-1", () => mk({ refundSatang: -1 }), "23514"],
      ["status ทั้ง 5", async () => { for (const s of ["NOTICE", "INSPECTED", "SETTLED", "REFUNDED", "CANCELLED"]) await mk({ status: s }); }, ""],
    ]);
  });
  await st("CK-9", "DormRepair status/rating · DormAnnouncement audience · DormParcel status/remindCount ⇒ 23514 นอกรายการ · rating 1/5 ได้", async () => {
    await expectCodes([
      ["repair status=CLOSED", () => repair({ status: "CLOSED" }), "23514"],
      ["rating=0", () => repair({ rating: 0 }), "23514"],
      ["rating=6", () => repair({ rating: 6 }), "23514"],
      ["rating=1,5", async () => { await repair({ rating: 1 }); await repair({ rating: 5, status: "DONE" }); }, ""],
      ["audience=TENANT", () => ann({ audience: "TENANT" }), "23514"],
      ["audience ทั้ง 4", async () => { for (const a of ["ALL", "BUILDING", "FLOOR", "ROOM"]) await ann({ audience: a }); }, ""],
      ["parcel status=LOST", () => parcel({ status: "LOST" }), "23514"],
      ["remindCount=-1", () => parcel({ remindCount: -1 }), "23514"],
      ["parcel PICKED_UP/RETURNED", async () => { await parcel({ status: "PICKED_UP" }); await parcel({ status: "RETURNED" }); }, ""],
    ]);
  });

  // ═══════════════ O. พฤติกรรมจริง ═══════════════
  console.log("\n── O: unique/FK จริง · ยิงพร้อมกัน · หนี้ดัชนี · ข้อมูลเดิม ──");
  await st("O-1", "บิล: สัญญาเดียวกัน งวดเดียวกัน 2 ใบ ⇒ 23505 · งวดอื่นได้ · สัญญาอื่นงวดเดียวกันได้ · accountDocumentId ซ้ำ ⇒ 23505", async () => {
    const pk = nextPk();
    const L2 = rid("l2"); await lease({ id: L2, roomId: R2 });
    const doc = rid("doc");
    await expectCodes([
      ["ใบ 1", () => bill({ periodKey: pk, accountDocumentId: doc }), ""],
      ["ใบ 2 สัญญา/งวดเดิม", () => bill({ periodKey: pk }), "23505"],
      ["งวดอื่น", () => bill({}), ""],
      ["สัญญาอื่นงวดเดิม", () => bill({ leaseId: L2, roomId: R2, periodKey: pk }), ""],
      ["accountDocumentId ซ้ำ", () => bill({ accountDocumentId: doc }), "23505"],
    ]);
  });
  await st("O-2", "บิล: ยิงพร้อมกัน 10 ทาง สัญญา×งวดเดียวกัน ⇒ สำเร็จ 1 · 23505 อีก 9 · แถว 1 (X3)", async () => {
    FX();
    const pk = nextPk();
    const clients = await Promise.all(Array.from({ length: 10 }, () => pool.connect()));
    let res: PromiseSettledResult<void>[] = [];
    try { res = await Promise.allSettled(clients.map((c) => bill({ periodKey: pk }, c))); } finally { for (const c of clients) c.release(); }
    const okN = res.filter((r) => r.status === "fulfilled").length;
    const dupN = res.filter((r) => r.status === "rejected" && pgCode(r.reason) === "23505").length;
    const [{ n }] = await q<{ n: number }>(`SELECT count(*)::int AS n FROM "DormBill" WHERE "leaseId" = $1 AND "periodKey" = $2`, [FX().L0, pk]);
    eq([okN, dupN, n], [1, 9, 1], "[สำเร็จ, 23505, แถว]");
  });
  await st("O-3", "รอบบิล: หน่วยเดียวกันงวดเดียวกัน 2 รอบ ⇒ 23505 · หน่วยอื่นงวดเดียวกันได้", async () => {
    const pk = nextPk();
    await expectCodes([
      ["รอบ 1", () => run({ periodKey: pk }), ""],
      ["รอบ 2", () => run({ periodKey: pk }), "23505"],
      ["หน่วย B", () => run({ tenantId: tB, unitId: uB, periodKey: pk }), ""],
    ]);
  });
  await st("O-4", "มิเตอร์: ห้องเดียวกันมิเตอร์ไฟใช้งาน 2 ตัว ⇒ 23505 · น้ำได้ · ถอดตัวเก่า (removedAt) แล้วติดตัวใหม่ได้ · MAIN หลายตัวได้", async () => {
    const old = rid("mold");
    await expectCodes([
      ["ไฟ ตัว 1", () => meter({ id: old, role: "ROOM", roomId: R3 }), ""],
      ["ไฟ ตัว 2 ห้องเดิม", () => meter({ role: "ROOM", roomId: R3 }), "23505"],
      ["น้ำ ห้องเดิม", () => meter({ role: "ROOM", roomId: R3, kind: "WATER" }), ""],
      ["ถอดตัวเก่า", () => pool.query(`UPDATE "DormMeter" SET "removedAt" = now() WHERE id = $1`, [old]), ""],
      ["ไฟ ตัวใหม่", () => meter({ role: "ROOM", roomId: R3, replacedById: null }), ""],
      ["MAIN 2 ตัว", async () => { await meter(); await meter(); }, ""],
    ]);
  });
  await st("O-5", "เลขมิเตอร์: งวดเดียวกัน (PERIOD) ซ้ำ ⇒ 23505 (ส่งซ้ำออฟไลน์ = 1) · MOVE_OUT/MOVE_IN งวดเดียวกันซ้ำได้", async () => {
    const M = FX().MMAIN; const pk = nextPk();
    await expectCodes([
      ["PERIOD 1", () => reading(M, { periodKey: pk }), ""],
      ["PERIOD 2", () => reading(M, { periodKey: pk, value: 125 }), "23505"],
      ["MOVE_OUT ×2", async () => { await reading(M, { periodKey: pk, kind: "MOVE_OUT" }); await reading(M, { periodKey: pk, kind: "MOVE_OUT" }); }, ""],
      ["MOVE_IN", () => reading(M, { periodKey: pk, kind: "MOVE_IN" }), ""],
    ]);
  });
  await st("O-6", "อัตราน้ำไฟ: หน่วย×อาคาร(null)×ชนิด×งวด ซ้ำ ⇒ 23505 (NULLS NOT DISTINCT) · อาคารระบุซ้ำ ⇒ 23505 · ชนิดอื่นได้", async () => {
    const pk = nextPk(); const bd = rid("bd");
    await expectCodes([
      ["null 1", () => rate({ buildingId: null, periodKey: pk }), ""],
      ["null 2", () => rate({ buildingId: null, periodKey: pk }), "23505"],
      ["อาคาร 1", () => rate({ buildingId: bd, periodKey: pk }), ""],
      ["อาคาร 2", () => rate({ buildingId: bd, periodKey: pk }), "23505"],
      ["WATER", () => rate({ buildingId: null, periodKey: pk, kind: "WATER" }), ""],
    ]);
  });
  await st("O-7", "ตารางอัตรารัฐ: authority×kind×tariffCode×effectiveFrom ซ้ำ ⇒ 23505 · วันมีผลใหม่ได้", async () => {
    const code = rid("tc");
    await expectCodes([
      ["ฉบับ 1", () => tariff({ tariffCode: code, effectiveFrom: day(0) }), ""],
      ["ฉบับ 1 ซ้ำ", () => tariff({ tariffCode: code, effectiveFrom: day(0) }), "23505"],
      ["ฉบับใหม่", () => tariff({ tariffCode: code, effectiveFrom: day(120) }), ""],
    ]);
  });
  await st("O-8", "ประกาศ: ผู้เช่าคนเดียวอ่านซ้ำ ⇒ 23505 (นับไม่ซ้ำ) · ลบประกาศ ⇒ แถวอ่านหายตาม (CASCADE)", async () => {
    const A = rid("ann"); await ann({ id: A, publishedAt: now() });
    const p = rid("p");
    const rd = (partyId: string) => insertRow("DormAnnouncementRead", { id: rid("ar"), tenantId: tA, unitId: uA, announcementId: A, partyId });
    await expectCodes([["อ่าน 1", () => rd(p), ""], ["อ่านซ้ำ", () => rd(p), "23505"], ["อีกคน", () => rd(rid("p2")), ""]]);
    await pool.query(`DELETE FROM "DormAnnouncement" WHERE id = $1`, [A]);
    const [{ n }] = await q<{ n: number }>(`SELECT count(*)::int AS n FROM "DormAnnouncementRead" WHERE "announcementId" = $1`, [A]);
    eq(n, 0, "แถวอ่านค้าง");
  });
  await st("O-9", "ย้ายออก: สัญญาเดียว 2 แถว ⇒ 23505", async () => {
    const L = rid("lmo2"); await lease({ id: L });
    await expectCodes([["แถว 1", () => moveOut(L), ""], ["แถว 2", () => moveOut(L), "23505"]]);
  });
  await st("O-10", "FK RESTRICT: ลบห้องที่มีสัญญา/มิเตอร์ ⇒ 23503 · ลบสัญญาที่มีบิล ⇒ 23503 · ลบมิเตอร์ที่มีเลขจด ⇒ 23503 · ลบรอบบิลที่มีบิล ⇒ 23503 · สัญญาอ้างห้องที่ไม่มี ⇒ 23503", async () => {
    FX();
    await expectCodes([
      ["ลบห้องมีสัญญา", () => pool.query(`DELETE FROM "HotelRoom" WHERE id = $1`, [R1]), "23503"],
      ["ลบห้องมีมิเตอร์", () => pool.query(`DELETE FROM "HotelRoom" WHERE id = $1`, [R3]), "23503"],
      ["ลบสัญญามีบิล", () => pool.query(`DELETE FROM "DormLease" WHERE id = $1`, [FX().L0]), "23503"],
      ["ลบมิเตอร์มีเลขจด", () => pool.query(`DELETE FROM "DormMeter" WHERE id = $1`, [FX().MMAIN]), "23503"],
      ["ลบรอบมีบิล", () => pool.query(`DELETE FROM "DormBillRun" WHERE id = $1`, [FX().RUN0]), "23503"],
      ["ห้องไม่มีจริง", () => lease({ roomId: rid("ghost") }), "23503"],
    ]);
  });
  // ── หนี้ดัชนี R0.8: STAY partial unique ──
  const occ = (over: Record<string, unknown>) => insertRow("RoomOccupancy", { id: rid("oc"), tenantId: tA, unitId: uA, kind: "STAY", refType: "HotelReservation", startDate: day(60), endDate: day(62), updatedAt: now(), ...over });
  await st("O-11", "RoomOccupancy: การจองเดียวกันถือห้อง STAY active 2 แถว ⇒ 23505 · แถว inactive ได้ · HOLD/LEASE อ้างเดียวกันหลายแถวได้", async () => {
    const ref = rid("resv");
    await expectCodes([
      ["STAY 1", () => occ({ roomId: R4, refId: ref }), ""],
      ["STAY 2 (ห้องอื่น)", () => occ({ roomId: R5, refId: ref }), "23505"],
      ["STAY inactive", () => occ({ roomId: R5, refId: ref, active: false }), ""],
      ["HOLD ×2", async () => { await occ({ roomId: R5, refId: ref, kind: "HOLD", startDate: day(70), endDate: day(71) }); await occ({ roomId: R6, refId: ref, kind: "HOLD", startDate: day(70), endDate: day(71) }); }, ""],
      ["LEASE ×2", async () => { const l = rid("lref"); await occ({ roomId: R5, refType: "DormLease", refId: l, kind: "LEASE", startDate: day(80), endDate: day(90) }); await occ({ roomId: R6, refType: "DormLease", refId: l, kind: "LEASE", startDate: day(80), endDate: day(90) }); }, ""],
    ]);
  });
  // ── หนี้ดัชนี R0.6: PaymentSlip idempotencyKey ──
  const slip = (tenantId: string, unitId: string, checks: Record<string, unknown>) =>
    insertRow("PaymentSlip", { id: rid("ps"), tenantId, unitId, domain: "DORM", refType: "DORM_BILL", refId: rid("bill"), fileId: rid("f"), imageHash: rid("h"), expectedSatang: 450000, checks: JSON.stringify(checks), status: "PENDING" });
  await st("O-12", "PaymentSlip: ร้านเดียวกัน idempotencyKey ซ้ำ ⇒ 23505 · ร้านอื่น key เดียวกันได้ · ไม่มี key หลายแถวได้", async () => {
    const k = `qc-d0-${RUN}-key`;
    await expectCodes([
      ["key 1", () => slip(tA, uA, { idempotencyKey: k }), ""],
      ["key ซ้ำ", () => slip(tA, uA, { idempotencyKey: k, items: [] }), "23505"],
      ["ร้าน B key เดิม", () => slip(tB, uB, { idempotencyKey: k }), ""],
      ["ไม่มี key ×2", async () => { await slip(tA, uA, {}); await slip(tA, uA, {}); }, ""],
    ]);
  });
  const planUses = async (sql: string, ixName: string) => {
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      await c.query("SET LOCAL enable_seqscan = off");
      const rows = (await c.query<{ "QUERY PLAN": string }>(`EXPLAIN ${sql}`)).rows.map((r) => r["QUERY PLAN"]).join("\n");
      return { used: rows.includes(ixName), plan: rows.replace(/\s+/g, " ").slice(0, 200) };
    } finally { await c.query("ROLLBACK").catch(() => undefined); c.release(); }
  };
  await st("O-13", "EXPLAIN: คิวรี findByKey ของ slip-verify (\"tenantId\" = … AND (\"checks\"->>'idempotencyKey') = …) ใช้ดัชนีนิพจน์", async () => {
    const ix = await findIx("PaymentSlip", (r) => r.uniq && /->>\s*'idempotencyKey'/.test(r.def));
    ok(!!ix, "ไม่มีดัชนี (I-36)");
    const r = await planUses(`SELECT "id" FROM "PaymentSlip" WHERE "tenantId" = 'x' AND ("checks"->>'idempotencyKey') = 'k' LIMIT 1`, ix!.name);
    ok(r.used, `ไม่ใช้ ${ix!.name}: ${r.plan}`);
  });
  await st("O-14", "EXPLAIN: คิวรีของ expireHolds (active = true AND kind IN ('HOLD','CHANNEL_HOLD') AND holdExpiresAt <= …) ใช้ partial index ใหม่", async () => {
    const ix = await findIx("RoomOccupancy", (r) => !r.uniq && r.cols.join(",") === "holdExpiresAt" && /'CHANNEL_HOLD'/.test(r.pred ?? ""));
    ok(!!ix, "ไม่มีดัชนี (I-34)");
    const r = await planUses(`SELECT "id" FROM "RoomOccupancy" WHERE "active" = true AND "kind" IN ('HOLD', 'CHANNEL_HOLD') AND "holdExpiresAt" IS NOT NULL AND "holdExpiresAt" <= now() ORDER BY "holdExpiresAt" ASC LIMIT 50`, ix!.name);
    ok(r.used, `ไม่ใช้ ${ix!.name}: ${r.plan}`);
  });
  // ── บัญชี: source DORM ──
  await st("O-15", "AccountDocument source = 'DORM' บันทึกได้ (SQL) และ client อ่าน/กรอง source DORM ได้", async () => {
    const [{ l: docType }] = await q<{ l: string }>(`SELECT e.enumlabel AS l FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'AccountDocType' ORDER BY e.enumsortorder LIMIT 1`);
    const id = rid("ad");
    eq(await tryCode(() => insertRow("AccountDocument", { id, tenantId: tA, systemId: rid("sys"), docType, source: "DORM", updatedAt: now() })), "", "INSERT source DORM");
    const m = await tryImport<{ prisma: unknown }>("@/lib/core/db");
    if (!m.mod) throw new AssertFail(`โหลด @/lib/core/db ไม่ได้ (${m.err})`);
    db = m.mod.prisma as Db;
    const rows = await db.accountDocument.findMany({ where: { tenantId: tA, source: "DORM" } });
    eq(rows.map((r) => [r.id, r.source]), [[id, "DORM"]], "client findMany source DORM");
  });
  await st("O-READ", "Prisma client อ่านข้อมูลเดิม (HotelRoom · RoomOccupancy · HotelReservation · Appointment · AccountDocument · PaymentSlip · IntegrationCallLog) + ตารางหอใหม่ได้", async () => {
    if (!db) {
      const m = await tryImport<{ prisma: unknown }>("@/lib/core/db");
      if (!m.mod) throw new AssertFail(`โหลด @/lib/core/db ไม่ได้ (${m.err})`);
      db = m.mod.prisma as Db;
    }
    const d = db;
    const reads: [string, () => Promise<unknown>][] = [
      ["hotelRoom", () => d.hotelRoom.findMany({ take: 50, orderBy: { createdAt: "asc" } })],
      ["roomOccupancy", () => d.roomOccupancy.findMany({ take: 50 })],
      ["hotelReservation", () => d.hotelReservation.findMany({ take: 50 })],
      ["appointment", () => d.appointment.findMany({ take: 50, orderBy: { createdAt: "asc" } })],
      ["accountDocument", () => d.accountDocument.findMany({ take: 50, orderBy: { createdAt: "asc" } })],
      ["paymentSlip", () => d.paymentSlip.findMany({ take: 50 })],
      ["integrationCallLog", () => d.integrationCallLog.findMany({ take: 50 })],
      ...["dormLease", "dormMeter", "dormMeterReading", "dormUtilityRate", "dormAuthorityTariff", "dormBillRun", "dormBill", "dormMoveOut", "dormRepair", "dormAnnouncement", "dormAnnouncementRead", "dormParcel"]
        .map((n) => [n, () => (d[n] ? d[n].findMany({ take: 5 }) : Promise.reject(new Error("client ไม่มีโมเดล")))] as [string, () => Promise<unknown>]),
    ];
    const bad: string[] = [];
    for (const [n, f] of reads) { try { await f(); } catch (e) { bad.push(`${n}: ${errMsg(e).slice(0, 100)}`); } }
    ok(bad.length === 0, bad.slice(0, 4).join(" | "));
  });
  await st("O-OLD", "แถวที่มีก่อน migration: HotelRoom/RoomOccupancy/PaymentSlip/IntegrationCallLog/AccountDocument นับได้ · AccountDocument เดิมไม่มี source DORM", async () => {
    ok(migAt !== null, "ไม่รู้เวลา migration (M-5)");
    const at = migAt as unknown as Date;
    const n = async (t: string, extra = "") => (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "${t}" WHERE "createdAt" < $1 ${extra}`, [at]))[0].n;
    const counts = { hotelRoom: await n("HotelRoom"), occ: await n("RoomOccupancy"), slip: await n("PaymentSlip"), doc: await n("AccountDocument") };
    console.log(`     ℹ️ แถวเดิม: ห้อง ${counts.hotelRoom} · occupancy ${counts.occ} · สลิป ${counts.slip} · เอกสารบัญชี ${counts.doc}`);
    eq(await n("AccountDocument", `AND source::text = 'DORM'`), 0, "เอกสารเดิมที่เป็น DORM");
  });
} catch (e) {
  record("CRASH", "จบกลางทาง: " + errMsg(e), "FAIL", errMsg(e), "CRITICAL");
} finally {
  try { await cleanup(tenantIds); await cleanupTariff(); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); }
  try {
    const left = tenantIds.length ? (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "Tenant" WHERE id = ANY($1::text[])`, [tenantIds]))[0].n : 0;
    console.log(`\n(ล้างแถวทดสอบ: tenant ค้าง ${left})`);
  } catch { /* ฐานหลุด */ }
  await pool.end();
  const dbx = db as Db | null;
  if (dbx) { try { await dbx.$disconnect(); } catch { /* ไม่เป็นไร */ } }
}

// ═══════════════ G. regression (process แยกทีละชุด · env เดียวกับข้อสอบนี้ = qc-svc) ═══════════════
console.log("\n── G: regression โรงแรม · ชิ้นกลาง R0.6/R0.8 · D.1 · smoke · บัญชี V2 (AccountDocSource) ──");
// ยอมแดง: qc-acc-v2-schema ข้อ `pnpm drift` = drift HR ของฐาน qc-svc (baseline 28 ต.ค. แดงข้อเดียวนี้ก่อนใบ) — ข้ออื่นต้องเขียว
const ALLOW_FAIL: Record<string, RegExp> = { "qc-acc-v2-schema": /pnpm drift/ };
const REG_SUITES = [
  "qc-hotel-money", "qc-hotel-public", "qc-hotel-refund", "qc-svc-r0.8", "qc-svc-r0.6", "qc-svc-d.1", "qc-svc-smoke",
  "qc-acc-v2-schema", "qc-acc-v2-recurring", "qc-acc-v2-import", "qc-account-api-write-docs", "qc-pos-account",
];
{
  const why = !migName ? "ยังไม่มี migration svc_d — regression รันเมื่อมีงานของใบให้ทดสอบ" : process.env.SVC_D0_NO_REGRESSION === "1" ? "ตั้ง SVC_D0_NO_REGRESSION=1" : "";
  for (const [i, s] of REG_SUITES.entries()) {
    const id = `G-${i + 1}`;
    const name = `${s} exit 0${ALLOW_FAIL[s] ? " (ยอมแดงเฉพาะ pnpm drift)" : ""}`;
    if (why) { skip(id, name, why); continue; }
    if (!existsSync(join(ROOT, "scripts", `${s}.mts`))) { record(id, name, "FAIL", "ไม่มีไฟล์ชุด", "CRITICAL"); continue; }
    const t = Date.now();
    const env = { ...process.env } as NodeJS.ProcessEnv;
    const r = spawnSync("pnpm", ["exec", "tsx", `scripts/${s}.mts`], { cwd: ROOT, env, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, timeout: 40 * 60_000 });
    const out = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
    const log = `/tmp/svc-d0-reg-${s}.log`;
    try { writeFileSync(log, out); } catch { /* ไม่เป็นไร */ }
    const fails = out.split("\n").filter((l) => /❌/.test(l));
    const allowed = ALLOW_FAIL[s];
    const pass = r.status === 0 || (!!allowed && r.status === 1 && fails.length > 0 && fails.every((l) => allowed.test(l)));
    const tail = out.split("\n").filter((l) => /ผ่าน|JSON_SUMMARY|หยุด|❌|Error/.test(l)).slice(-2).join(" ¦ ").slice(0, 220);
    record(id, `${name} (${Math.round((Date.now() - t) / 1000)} วิ)`, pass ? "PASS" : "FAIL", pass ? "" : `exit=${r.status ?? r.signal} · ${tail} · log ${log}`, "CRITICAL");
  }
}

const failed = cks.filter((c) => c.res === "FAIL");
const skipped = cks.filter((c) => c.res === "SKIP");
const passed = cks.length - failed.length - skipped.length;
console.log(`\n===== QC SVC D.0 · migration svc_d (หอพัก) =====\nผ่าน ${passed}/${cks.length}${skipped.length ? ` (SKIP ${skipped.length})` : ""}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), findings: [...failed, ...skipped].map((c) => c.id) })}`);
// รับใบ = ผ่านทุกข้อ (SKIP ไม่นับว่าผ่าน)
process.exit(failed.length + skipped.length > 0 ? 1 : 0);
