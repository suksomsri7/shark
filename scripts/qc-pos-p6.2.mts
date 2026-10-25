// QC — POS RUN ใบ P6.2 (ส่งมอบ): HANDOVER สุดท้าย + ดัชนีหลักฐาน · docs/modules/14-pos.md V2 · docs/sds/modules/pos.md AS-BUILT V2 ·
//   คู่มือในแอป /app/sys/[id]/pos/help · สกิล shark-pos-api — ข้อสอบสถิตล้วน (อ่านไฟล์ + git · ไม่แตะ DB · ไม่ build/serve)
//   brief = ledger/pos-briefs/pos-brief-P6.md §1 · §4 (oracle P6.2) · §5 · §10 มติ 6 7 8 9 · prompt ledger/pos-briefs/pos-prompt-accountA-P6.2-ORACLE.md
//   โน้ต = ledger/wo-notes/pos-P6.2-oracle.md (red-before ต่อข้อ · ของที่ builder ต้องสร้าง · CD-P62-O1…)
//
// รัน:  bash scripts/iso.sh pnpm exec tsx scripts/qc-pos-p6.2.mts                 (โหมดด่าน · ข้อสถิต + probe N1–N8)
//       bash scripts/iso.sh pnpm exec tsx scripts/qc-pos-p6.2.mts --list          (พิมพ์ทุก id)
//       bash scripts/iso.sh pnpm exec tsx scripts/qc-pos-p6.2.mts --no-db         (= โหมดด่าน · ทุกข้อสถิตอยู่แล้ว)
//       bash scripts/iso.sh pnpm exec tsx scripts/qc-pos-p6.2.mts --self-test     (probe N1–N8 อย่างเดียว · ตัวตัดสินต้องพลิกแดงได้จริง)
//       bash scripts/iso.sh pnpm exec tsx scripts/qc-pos-p6.2.mts --red-before    (ไฟล์ของหมุด PIN ผ่าน git show — แดงก่อนมีของใบนี้)
//       --rev <sha> = อ่านไฟล์ของ commit นั้นแทนดิสก์ (แบบ --red-before แต่เลือก commit เอง)
//   หมุด (env override · iso.sh ทิ้ง env ⇒ ใส่ `env P62_PIN=… pnpm exec tsx …` ในคำสั่ง):
//       P62_PIN      = ฐานของใบ (tip session/pos ตอนเขียน = 6c2352f7 · สินค้าเท่ากับ 8d0f5f37)
//       P62_LANE_PIN = หมุดเลนของข้อ Z1 (ไฟล์ที่ใบนี้แตะได้) — ค่าปริยาย = PIN · ย้ายหลัง merge ด้วย pos-repin-lane.sh โดยไม่ขยับหมุดใบ
//       P62_RUN_BASE = จุดเริ่ม RUN (บรรพบุรุษร่วมของ session/pos กับ origin/main = 71a1f363) — ช่วงนับ ORACLE-EDIT ของ H1
// ไม่มีด่าน SKIP ⇒ pos-gates.json mode unforced (ไม่เอ่ยชื่อตัวแปรบังคับรันของเลนในไฟล์นี้ — qc-pos-p2.14 G2) · ไม่มีหัว requires (ไม่ใช้ seed)
// ข้อ S1 + M1(ตาราง) เรียกเครื่องมือในรีโป: `bash scripts/sync-skills.sh --check` · `pnpm exec tsx scripts/gen-pos-api-docs.mts --check` (อ่านอย่างเดียวทั้งคู่) ·
//   import buildMatrix/renderMatrix ของ scripts/pos-authz-matrix-gen.mts (= --check) — สามอย่างนี้ตรวจทรีบนดิสก์เสมอ แม้โหมด --rev (CD-P62-O9)
// 🔴 probe N1–N8: ตัวตัดสินทุกข้อเป็นฟังก์ชันบริสุทธิ์ของ Inputs · probe สร้าง Inputs สังเคราะห์ที่ "ผ่าน" (positive control จากข้อมูลจริงของทรี)
//    แล้วทำเสียทีละจุด → ข้อเดียวกันต้องแดง · positive control ไม่เขียว หรือ probe ไม่แดง = ข้อ N นั้นแดง
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const SUITE = "qc-pos-p6.2";
const ROOT = process.cwd();
const ARGV = process.argv.slice(2);
const has = (f: string) => ARGV.includes(f);
const argOf = (f: string): string | null => (has(f) ? (ARGV[ARGV.indexOf(f) + 1] ?? null) : null);
const LIST = has("--list");
const NO_DB = has("--no-db"); // ทุกข้อสถิตอยู่แล้ว — รับแฟล็กไว้ให้ pos-gates/ผู้คุมเรียกแบบเดียวกับชุดอื่น
const SELF_ONLY = has("--self-test");
/** ฐานของใบ (tip session/pos ตอนเขียน oracle) — --red-before อ่านไฟล์ของหมุดนี้ */
const PIN = process.env.P62_PIN || "6c2352f7";
/** หมุดเลนของข้อ Z1 — ย้ายได้โดยไม่ขยับหมุดใบ (แม่แบบ LANE-RULES) */
const LANE_PIN = process.env.P62_LANE_PIN || "b1f6202b"; // ORACLE-EDIT ผู้คุม 25.10 (P4.3 fix10 merge CD-RP32 · re-pin 63116bb2 → b1f6202b) · ORACLE-EDIT ผู้คุม 25.10 (P4.3 fix9 merge CD-RP31 · re-pin 7f49d880 → 63116bb2) · ORACLE-EDIT ผู้คุม A 25.10 (CD-RP30 · re-pin Z1 → merge P4.3 fix8 7f49d880) · ORACLE-EDIT ผู้คุม A 24.10 (CD-RP28b · re-pin Z1 → merge P5.3 fix1 adfcee44 · เดิม CD-RP27 · re-pin หมุดเลน Z1 → merge P6.2 0bd8324e · หมุดใบ PIN คงเดิม)
/** จุดเริ่ม RUN ของ POS (session/pos แตกจาก origin/main ที่นี่) — ช่วงนับ ORACLE-EDIT */
const RUN_BASE = process.env.P62_RUN_BASE || "71a1f363";
const REV = has("--red-before") ? PIN : (argOf("--rev") ?? "");

// ═════════════════════════ ไฟล์ที่ใบนี้ตรวจ ═════════════════════════
const F = {
  handover: "ledger/HANDOVER-2026-10-POS.md",
  plan: "ledger/POS-MASTER-PLAN.md",
  op: "ledger/POS-OWNER-PENDING.md",
  contracts: "ledger/POS-CONTRACTS.md",
  runbook: "docs/pos/DEPLOY-RUNBOOK.md",
  doc14: "docs/modules/14-pos.md",
  sds: "docs/sds/modules/pos.md",
  restDoc: "docs/api/POS-API.md",
  perms: "src/lib/core/permissions.ts",
  outbox: "src/lib/outbox-consumers.ts",
  facade: "src/lib/modules/pos/index.ts",
  integrations: "src/lib/pos-integrations.ts",
  tabs: "src/lib/modules/pos/tabs.ts",
  registry: "src/lib/modules/pos/api/registry.ts",
  help: "src/app/app/sys/[id]/pos/help/page.tsx",
  settings: "src/app/app/sys/[id]/pos/settings/page.tsx",
  layout: "src/app/app/layout.tsx",
  registry2: "src/lib/pages/registry.ts", // ORACLE-EDIT ผู้คุม 24.10 (CD-P62-O1b qc-pages RG-1: เมนูข้างต้องมี widget ⇒ อนุญาต src/lib/pages/registry.ts กติกาเดียวกับ layout.tsx) // ORACLE-EDIT ผู้คุม 24.10 (CD-P62-O1 qc-nav-functions S5: อนุญาตบรรทัดเมนูข้าง /pos/help ใน layout.tsx ≤ 2 บรรทัดเพิ่ม · ลบ 0)
  msgThPos: "src/messages/th/pos.json",
  msgEnPos: "src/messages/en/pos.json",
  msgThCommon: "src/messages/th/common.json",
  msgEnCommon: "src/messages/en/common.json",
  inventory: "scripts/pos-ui-inventory.json",
  sweep: "scripts/pos-visual-sweep.json",
  qcEnv: "scripts/pos-qc-env.mts",
  authzPin: "scripts/qc-hf-pos-page-authz.mts",
  matrix: "scripts/pos-authz-matrix.json",
  skill: "skills/shark-pos-api/SKILL.md",
  gates: "scripts/pos-gates.json",
} as const;
const HELP_ROUTE = "/app/sys/[id]/pos/help";
const SETTINGS_ROUTE = "/app/sys/[id]/pos/settings";
const POS_ROUTE_BASE = "/app/sys/[id]/pos";
/** ใบในแผน 55 ใบ (MASTER-PLAN §4 · หัวเฟส 3+18+14+12+3+3+2) — P1.1 = P1.1a + P1.1b (สองแถวในตารางแผน · นับเป็นใบเดียว · CD-P62-O1) */
const range = (p: string, a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => `${p}${a + i}`);
const CARDS: readonly string[] = [
  ...range("P0.", 1, 3),
  "P1.1a", "P1.1b", ...range("P1.", 2, 18),
  ...range("P2.", 1, 14),
  ...range("P3.", 1, 12),
  ...range("P4.", 1, 3),
  ...range("P5.", 1, 3),
  ...range("P6.", 1, 2),
];
/** CD-P62-O2: ORACLE-EDIT ที่เกิดหลังจุดปลายช่วงที่ HANDOVER ระบุ (re-pin ตอน merge ใบนี้ ฯลฯ) ยอมได้ไม่เกินเท่านี้ */
const OE_TOL = 20;
/** CD-P62-O1: §0 สั้น (brief §6 "keep §0 to 10 lines" + หัวตาราง/ช่องว่าง) */
const S0_MAX_LINES = 15;
/** CD-P62-O7: ส่วนต่างของหน้า settings ที่ยอม (ลิงก์ทางเข้าคู่มือ · มติ 6) */
const SETTINGS_DIFF_MAX = 20;
const SETTINGS_REMOVED_MAX = 3;
const LAYOUT_ADDED_MAX = 2; // ORACLE-EDIT ผู้คุม 24.10 (CD-P62-O1 qc-nav-functions S5: อนุญาตบรรทัดเมนูข้าง /pos/help ใน layout.tsx ≤ 2 บรรทัดเพิ่ม · ลบ 0)
/** CD-P62-O5: import ที่หน้าคู่มือ (อ่านอย่างเดียว) ใช้ได้ */
const HELP_IMPORT_ALLOW: readonly RegExp[] = [
  /^next\/(link|navigation)$/,
  /^next-intl\/server$/,
  /^@\/lib\/core\/(context|db)$/,
  /^@\/lib\/systems$/,
  /^@\/lib\/modules\/pos\/(tabs|access)$/,
  /^@\/components\/(ui|module-tabs|icons?)(\/|$)/,
  /^lucide-react$/,
];
/** H2: ดัชนีหลักฐาน — CRM-MASTER-PLAN §10 ข้อ 1–8 (EV-C*) + POS-MASTER-PLAN §10 (EV-P*) · CD-P62-O3 */
const EV_CRM = ["EV-C1", "EV-C2", "EV-C3", "EV-C4", "EV-C5", "EV-C6", "EV-C7", "EV-C8"] as const;
const EV_POS = ["EV-P1", "EV-P2", "EV-P3", "EV-P4", "EV-P5", "EV-P6"] as const;
const EV_OWNER = ["EV-P1", "EV-P2", "EV-P3"] as const; // ขายจริงบน prod ร้านทดลอง (W5) · Z report · ออเดอร์ MANUAL → owner
const EV_OWNER_OK = ["EV-C7"] as const; // ซ้อม/ตรวจ migration บน prod — ขั้นของเจ้าของได้ (W31/W32) · ไม่บังคับ

type Def = readonly [string, string];
const CHECKS: readonly Def[] = [
  ["P6.2-H1", "ledger/HANDOVER-2026-10-POS.md มี §0–§8: §0 ≤ 15 บรรทัด + แทนที่ HANDOVER 4 ฉบับเดิม · §1 ตารางใบ 55 ใบ SHA เป็นบรรพบุรุษ · §2 บั๊กจริง High/Med (ครอบรายงาน hunter ทุกไฟล์) · §3 ORACLE-EDIT นับ = git ±20 · §4 หนี้ · §5 W1…W-last สถานะตรง OP · §6 ถอยกลับ (runbook §9) · §7 วิธีรัน · §8 ดัชนีหลักฐาน"],
  ["P6.2-H2", "§8 ดัชนีหลักฐาน: EV-C1…C8 (CRM §10) + EV-P1…P6 (POS §10) · EV-P1 ขายจริง prod (W5) / EV-P2 Z report / EV-P3 ออเดอร์ MANUAL = owner · แถวอื่นชี้ที่อยู่จริง · qc:all มีตัวเลข · parity 1440/1024/390"],
  ["P6.2-D1", "docs/modules/14-pos.md V2: หัว # …V2 · ชี้ HANDOVER-2026-10-POS.md + SHA · ตัวชี้ HANDOVER-P3 คงอยู่ (p3.12 K3) · 13 หมวด (register/pay/tenders · bills/refund · shifts · products/prices/channels · tables/KDS/orders/QR · customer display · multi-branch · reports · REST · integrations 13 การ์ด · offline · AI · permissions) · ตารางสิทธิ์ = คีย์ pos.* ของ permissions.ts ทั้งสองทาง · สเปกเดิมย้ายไปภาคผนวก v1 design notes"],
  ["P6.2-D2", "docs/sds/modules/pos.md AS-BUILT V2: หัว AS-BUILT V2 + SHA · ทุก model ใน prisma/schema/pos*.prisma · ทุกคีย์ outbox pos.* (ทะเบียน consumer ∪ ตาราง POS-CONTRACTS) · ทุก export ของ modules/pos/index.ts · ทุกคีย์สิทธิ์ pos.* (มติ 7)"],
  ["P6.2-M1", "หน้าคู่มือ src/app/app/sys/[id]/pos/help/page.tsx: อ่านอย่างเดียว (ด่านหน้าเดียว · import ในรายการ) · ทุก href ชี้หน้า POS ที่มีจริง + ครบแท็บ POS · ข้อความผ่าน t ครบ th+en · แถวทะเบียนปุ่มของทุกลิงก์ · แผนภาพ p2.14 V3 (หน้าใน POS_PAGES + รอบ th/en) · หมุดสิทธิ์ V4 · แถวตารางสิทธิ์ + ตัวสร้าง --check · ลิงก์ทางเข้าจากหน้า settings"],
  ["P6.2-S1", "สกิล: sync-skills.sh --check exit 0 · gen-pos-api-docs --check exit 0 · SKILL.md เอ่ย path ของทุกกลุ่ม op ในทะเบียน REST (/channels /devices … /sync /units)"],
  ["P6.2-Z1", "ขอบเขต (เทียบหมุดเลน): แตะได้เฉพาะ docs/ ledger/ skills/ scripts/ src/messages/ + หน้าคู่มือ + ลิงก์ทางเข้าในหน้า settings (≤ 20 บรรทัด · ลบ ≤ 3 · มี /pos/help) + บรรทัดเมนูข้าง /pos/help ใน src/app/app/layout.tsx และ widget ใน src/lib/pages/registry.ts (ไฟล์ละ เพิ่ม ≤ 2 · ลบ 0 · CD-P62-O1/O1b) — src/ อื่น = แดง"],
  ["P6.2-G1", "scripts/pos-gates.json มี qc-pos-p6.2 (mode unforced · ไม่มี needs)"],
  ["P6.2-N1", "self-test H1: fixture ผ่าน · ขาดแถว P4.2 / SHA ไม่ใช่บรรพบุรุษ / นับ ORACLE-EDIT ผิด 1 / W5 = closed / ไม่มี §6 / ไม่อ้างรายงาน hunter = แดง"],
  ["P6.2-N2", "self-test H2: fixture ผ่าน · EV-P1 ไม่ใช่ owner / ไม่มี EV-C4 / parity ไม่มี 390 / ที่อยู่ไม่มีจริง = แดง"],
  ["P6.2-N3", "self-test D1: fixture ผ่าน · ตารางสิทธิ์ขาดคีย์ / มีคีย์ปลอม / ไม่มีหมวด Offline / integrations ขาด KANBAN / ไม่มีหัว V2 = แดง"],
  ["P6.2-N4", "self-test D2: fixture ผ่าน · ขาด model / ขาดคีย์ outbox / ขาด export / หัวไม่ใช่ AS-BUILT V2 = แดง"],
  ["P6.2-N5", "self-test M1: fixture ผ่าน · import service / prisma อื่น / ข้อความไทยในโค้ด / href ไปหน้าไม่มี / คีย์ en ขาด / ไม่มีแถวทะเบียน / ไม่อยู่ใน POS_PAGES / ตัวสร้างตารางไม่ตรง = แดง"],
  ["P6.2-N6", "self-test S1: fixture ผ่าน · sync exit 1 / gen exit 1 / SKILL.md ไม่มี /sync = แดง"],
  ["P6.2-N7", "self-test Z1: fixture ผ่าน · แตะ src/lib/modules/pos/register.ts / settings 30 บรรทัด / settings ไม่มี /pos/help / prisma / layout ลบบรรทัด / layout 3 บรรทัด / layout ไม่มี /pos/help / registry ลบบรรทัด / registry 3 บรรทัด = แดง"],
  ["P6.2-N8", "self-test G1: unforced ผ่าน · forced / ไม่มีแถว / มี needs = แดง"],
];

if (LIST) {
  console.log(`${SUITE} · PIN ${PIN} · LANE_PIN ${LANE_PIN} · RUN_BASE ${RUN_BASE} · ${CHECKS.length} ข้อ`);
  for (const [id, t] of CHECKS) console.log(`  ${id.padEnd(8)} ${t}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, mode: "list", total: CHECKS.length, passed: 0, pin: PIN, ids: CHECKS.map((c) => c[0]) })}`);
  process.exit(0);
}

// ═════════════════════════ git + อ่านไฟล์ (ดิสก์ หรือ git show REV) ═════════════════════════
function git(...a: string[]): string {
  try {
    return execFileSync("git", ["-C", ROOT, ...a], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 256 * 1024 * 1024 });
  } catch {
    return "";
  }
}
function gitOk(...a: string[]): boolean {
  try {
    execFileSync("git", ["-C", ROOT, ...a], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
const cache = new Map<string, string | null>();
function read(p: string): string | null {
  if (cache.has(p)) return cache.get(p) ?? null;
  let v: string | null = null;
  if (REV) v = gitOk("cat-file", "-e", `${REV}:${p}`) ? git("show", `${REV}:${p}`) : null;
  else v = existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), "utf8") : null;
  cache.set(p, v);
  return v;
}
const existsCache = new Map<string, boolean>();
function exists(p: string): boolean {
  const k = p.replace(/\/+$/, "");
  if (existsCache.has(k)) return existsCache.get(k)!;
  const v = REV ? gitOk("cat-file", "-e", `${REV}:${k}`) : existsSync(join(ROOT, k));
  existsCache.set(k, v);
  return v;
}
function ls(dir: string): string[] {
  if (REV) return git("ls-tree", "--name-only", `${REV}:${dir}`).split("\n").filter(Boolean);
  return existsSync(join(ROOT, dir)) ? readdirSync(join(ROOT, dir)) : [];
}
function readJson(p: string): Any {
  try {
    return JSON.parse(read(p) ?? "null");
  } catch {
    return null;
  }
}

// ── ชุดบรรพบุรุษของปลาย (tip = REV หรือ HEAD) — คีย์ 7 ตัวแรก → SHA เต็ม ──
const TIP = REV || "HEAD";
const TIP_FULL = git("rev-parse", "--verify", `${TIP}^{commit}`).trim();
const ancByPrefix = new Map<string, string[]>();
for (const s of git("rev-list", TIP).split("\n").filter(Boolean)) {
  const k = s.slice(0, 7);
  const arr = ancByPrefix.get(k);
  if (arr) arr.push(s);
  else ancByPrefix.set(k, [s]);
}
const RUN_BASE_FULL = git("rev-parse", "--verify", `${RUN_BASE}^{commit}`).trim();

type AncVerdict = "yes" | "no" | "skip";
type Git = {
  /** SHA สั้น/เต็ม → เป็นบรรพบุรุษของปลายไหม · ตัวเลขล้วนที่ไม่ใช่ commit ใด = skip (เช่น timestamp ของ migration) */
  anc: (sha: string) => AncVerdict;
  /** SHA เต็มของบรรพบุรุษ (null = ไม่ใช่บรรพบุรุษ/ไม่รู้จัก) */
  full: (sha: string) => string | null;
  /** commit ที่ข้อความมี ORACLE-EDIT ในช่วง RUN_BASE..end (SHA เต็ม) */
  oeList: (end: string) => string[];
  /** จำนวน ORACLE-EDIT ในช่วง RUN_BASE..ปลาย */
  oeTip: number;
  runBase: string;
};
function ancFull(sha: string): string | null {
  const s = sha.toLowerCase();
  if (s.length < 7) return null;
  const c = (ancByPrefix.get(s.slice(0, 7)) ?? []).filter((x) => x.startsWith(s));
  return c.length === 1 ? c[0]! : null;
}
const oeCache = new Map<string, string[]>();
const GIT: Git = {
  anc: (sha) => (ancFull(sha) ? "yes" : /^[0-9]+$/.test(sha) && !gitOk("cat-file", "-e", `${sha}^{commit}`) ? "skip" : "no"),
  full: ancFull,
  oeList: (end) => {
    if (oeCache.has(end)) return oeCache.get(end)!;
    const v = git("log", "--grep", "ORACLE-EDIT", "--format=%H", `${RUN_BASE}..${end}`).split("\n").filter(Boolean);
    oeCache.set(end, v);
    return v;
  },
  oeTip: 0,
  runBase: RUN_BASE,
};
GIT.oeTip = TIP_FULL ? GIT.oeList(TIP_FULL).length : 0;

// ═════════════════════════ ตัวช่วยข้อความ ═════════════════════════
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const joinP = (p: string[], n = 6) => (p.length ? `${p.length} ปัญหา: ${p.slice(0, n).join(" · ")}${p.length > n ? " · …" : ""}` : "");
/** ตัดคอมเมนต์ // และ /* *\/ ออก (ไม่แตะเนื้อในสตริง ' " `) */
function stripComments(src: string): string {
  let out = "";
  let i = 0;
  let q: string | null = null;
  while (i < src.length) {
    const c = src[i]!;
    const n = src[i + 1];
    if (q) {
      out += c;
      if (c === "\\") {
        out += n ?? "";
        i += 2;
        continue;
      }
      if (c === q) q = null;
      i++;
      continue;
    }
    if (c === "/" && n === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && n === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") q = c;
    out += c;
    i++;
  }
  return out;
}
/** หัวข้อ `## §k` → เนื้อหาจนถึง `## ` ถัดไป ("" = ไม่มี) */
function hsec(doc: string, k: number): string {
  const lines = doc.split("\n");
  const i = lines.findIndex((l) => new RegExp(`^##\\s+§\\s*${k}(?![0-9])`).test(l));
  if (i < 0) return "";
  let j = i + 1;
  while (j < lines.length && !lines[j]!.startsWith("## ")) j++;
  return lines.slice(i, j).join("\n");
}
const isRow = (l: string) => /^\s*\|/.test(l) && !/^\s*\|[\s:|-]+\|\s*$/.test(l);
const rowsOf = (sec: string) => sec.split("\n").filter(isRow);
const cellsOf = (row: string) => row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
const plainCell = (c: string) => c.replace(/[*`~]/g, "").trim();
const shaTokens = (s: string) => [...s.matchAll(/`([0-9a-f]{7,40})`/g)].map((m) => m[1]!);
const tokRe = (id: string) => new RegExp(`(^|[^\\w.])${esc(id)}(?![\\w.])`);
/** path ในรีโปที่เอกสารอ้าง (ตัด :บรรทัด · วงเล็บ/จุดท้าย) */
function repoPaths(s: string): string[] {
  const out: string[] = [];
  for (const m of s.matchAll(/(?:^|[^\w/.-])((?:src|scripts|prisma|docs|ledger|skills)\/[\w./[\]()@+-]+)/g)) {
    let p = m[1]!;
    for (;;) {
      const last = p[p.length - 1];
      if (!last) break;
      const opens = (p.match(/\(/g) ?? []).length;
      const closes = (p.match(/\)/g) ?? []).length;
      if (/[.,;:]/.test(last) || (last === ")" && closes > opens)) p = p.slice(0, -1);
      else break;
    }
    if (p.length > 6) out.push(p);
  }
  return [...new Set(out)];
}
const routeOf = (file: string) => file.replace(/^src\/app/, "").replace(/\/\([^/)]+\)/g, "").replace(/\/page\.tsx$/, "") || "/";
function getPath(obj: Any, path: string): Any {
  if (!path) return obj;
  let cur = obj;
  for (const k of path.split(".")) {
    if (cur === null || typeof cur !== "object" || !(k in cur)) return undefined;
    cur = cur[k];
  }
  return cur;
}
function flatKeys(obj: Any, pre = ""): string[] {
  if (obj === null || typeof obj !== "object") return [pre];
  return Object.keys(obj).flatMap((k) => flatKeys(obj[k], pre ? `${pre}.${k}` : k));
}

// ═════════════════════════ อินพุต (ทุกตัวตัดสินอ่านจากที่นี่เท่านั้น) ═════════════════════════
type Msgs = { thPos: Any; enPos: Any; thCommon: Any; enCommon: Any };
type Inputs = {
  exists: (p: string) => boolean;
  read: (p: string) => string | null;
  git: Git;
  tipFull: string;
  // H1/H2
  handover: string | null;
  oldHandovers: string[];
  huntFiles: string[];
  planP0to2: string[];
  opW: { id: number; closed: boolean }[];
  // D1/D2
  doc14: string | null;
  sds: string | null;
  permKeys: string[];
  integrationCodes: string[];
  models: string[];
  outboxKeys: string[];
  facadeNames: string[];
  facadeStar: string[];
  // M1
  help: string | null;
  settingsPage: string;
  msgs: Msgs;
  navPaths: string[];
  inventoryRows: Any[];
  sweep: Any;
  posPages: string[];
  authzPin: string;
  matrixRows: Any[];
  matrixGen: { ok: boolean; detail: string } | null;
  // S1
  syncExit: number | null;
  genExit: number | null;
  skill: string | null;
  opGroups: string[];
  // Z1
  changed: string[];
  settingsDiff: string;
  layoutDiff: string;
  registryDiff: string; // ORACLE-EDIT ผู้คุม 24.10 (CD-P62-O1b qc-pages RG-1: เมนูข้างต้องมี widget ⇒ อนุญาต src/lib/pages/registry.ts กติกาเดียวกับ layout.tsx)
  // ORACLE-EDIT ผู้คุม 24.10 (CD-P62-O1 qc-nav-functions S5: อนุญาตบรรทัดเมนูข้าง /pos/help ใน layout.tsx ≤ 2 บรรทัดเพิ่ม · ลบ 0)
  // G1
  manifest: Any;
};

// ── ตัวแยกของแหล่งความจริง ──
function permKeysOf(src: string): string[] {
  return [...new Set([...src.matchAll(/^\s*"(pos\.[\w.]+)":\s*"/gm)].map((m) => m[1]!))].sort();
}
function integrationCodesOf(src: string): string[] {
  const b = /POS_INTEGRATION_CODES\s*=\s*\[([^\]]*)\]/.exec(src)?.[1] ?? "";
  return [...b.matchAll(/"([A-Z_]+)"/g)].map((m) => m[1]!);
}
function modelsOf(files: string[]): string[] {
  return [...new Set(files.flatMap((t) => [...t.matchAll(/^model (\w+) \{/gm)].map((m) => m[1]!)))].sort();
}
function outboxKeysOf(outbox: string, contracts: string): string[] {
  const keys = new Set([...outbox.matchAll(/^\s*"(pos\.[\w.]+)"\s*:/gm)].map((m) => m[1]!));
  const at = contracts.search(/\n## Event/);
  if (at >= 0) {
    const nx = contracts.indexOf("\n## ", at + 4);
    const sec = contracts.slice(at + 1, nx < 0 ? contracts.length : nx);
    for (const l of sec.split("\n").filter((x) => x.startsWith("|"))) {
      const cell = (l.split("|")[1] ?? "").replace(/~~[^~]*~~/g, "");
      for (const m of cell.matchAll(/`(pos\.[\w./]+)`/g)) {
        const parts = m[1]!.split("/");
        const first = parts[0]!;
        keys.add(first);
        const pre = first.slice(0, first.lastIndexOf(".") + 1);
        for (const rest of parts.slice(1)) keys.add(rest.startsWith("pos.") ? rest : pre + rest);
      }
    }
  }
  return [...keys].sort();
}
function facadeOf(src: string): { names: string[]; star: string[] } {
  const s = stripComments(src);
  const names = new Set<string>();
  const star: string[] = [];
  for (const m of s.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g)) {
    for (const part of m[1]!.split(",")) {
      const p = part.trim().replace(/^type\s+/, "");
      if (!p) continue;
      const bits = p.split(/\s+as\s+/);
      const nm = (bits[1] ?? bits[0] ?? "").trim();
      if (/^\w+$/.test(nm)) names.add(nm);
    }
  }
  for (const m of s.matchAll(/export\s+(?:declare\s+)?(?:async\s+)?(?:const|let|var|function\*?|class|type|interface|enum)\s+(\w+)/g)) names.add(m[1]!);
  for (const m of s.matchAll(/export\s+(?:type\s+)?\*\s+(?:as\s+(\w+)\s+)?from\s+"([^"]+)"/g)) {
    if (m[1]) names.add(m[1]);
    else star.push(m[2]!.replace(/^\.\//, ""));
  }
  return { names: [...names].sort(), star };
}
function opWOf(op: string): { id: number; closed: boolean }[] {
  const out = new Map<number, boolean>();
  for (const l of op.split("\n")) {
    const m = /^\|\s*(~~)?\s*W(\d+)\b/.exec(l) ?? /^-\s*(~~)?\s*\*\*W(\d+)\b/.exec(l);
    if (!m) continue;
    const id = Number(m[2]);
    const closed = !!m[1] || /\[closed\]/i.test(l);
    out.set(id, (out.get(id) ?? false) || closed);
  }
  return [...out.entries()].sort((a, b) => a[0] - b[0]).map(([id, closed]) => ({ id, closed }));
}
function navPathsOf(tabs: string): string[] {
  const b = /POS_NAV_PATH[^=]*=\s*\{([\s\S]*?)\};/.exec(tabs)?.[1] ?? "";
  return [...b.matchAll(/"\/pos\/([\w/-]+)"/g)].map((m) => m[1]!);
}
function opGroupsOf(registry: string, readFn: (p: string) => string | null): string[] {
  const files = [...registry.matchAll(/from "\.\/ops\/([\w-]+)"/g)].map((m) => `src/lib/modules/pos/api/ops/${m[1]}.ts`);
  const g = new Set<string>();
  for (const f of files) for (const m of (readFn(f) ?? "").matchAll(/\bpath:\s*"\/([\w-]+)/g)) g.add(m[1]!);
  return [...g].sort();
}
function posPagesOf(qcEnv: string): string[] {
  const m = /export\s+const\s+POS_PAGES\s*=\s*\[([^\]]*)\]/.exec(qcEnv);
  return m ? [...m[1]!.matchAll(/"([a-z0-9-]+)"/g)].map((x) => x[1]!) : [];
}

// ═════════════════════════ ตัวตัดสิน (บริสุทธิ์ · Inputs → รายการปัญหา) ═════════════════════════
function judgeH1(inp: Inputs): string[] {
  const doc = inp.handover;
  if (doc === null) return [`ไม่มี ${F.handover}`];
  const p: string[] = [];
  for (let k = 0; k <= 8; k++) if (!hsec(doc, k)) p.push(`ไม่มีหัวข้อ "## §${k}"`);
  // §0 สั้น + แทนที่ฉบับเดิม
  const s0 = hsec(doc, 0);
  const s0n = s0.split("\n").slice(1).filter((l) => l.trim()).length;
  if (s0 && s0n > S0_MAX_LINES) p.push(`§0 ยาว ${s0n} บรรทัด (≤ ${S0_MAX_LINES})`);
  const notCited = inp.oldHandovers.filter((h) => !doc.includes(h));
  if (notCited.length) p.push(`ไม่อ้าง HANDOVER เดิมที่ถูกแทนที่: ${notCited.join(", ")}`);
  if (!/supersede|แทนที่/i.test(doc)) p.push("ไม่มีคำว่า supersedes/แทนที่ (ฉบับนี้แทน HANDOVER เฟสเดิม)");
  // §1 ตารางใบ 55 ใบ
  const s1 = rowsOf(hsec(doc, 1));
  const planMiss = inp.planP0to2.filter((x) => !CARDS.includes(x));
  if (planMiss.length) p.push(`ตารางแผน P0–P2 มีใบนอกรายการ 55 ใบ: ${planMiss.join(",")} (ORACLE-EDIT รายการ CARDS)`);
  const cardMiss: string[] = [];
  const badSha: string[] = [];
  for (const id of CARDS) {
    const rows = s1.filter((r) => tokRe(id).test(plainCell(cellsOf(r)[0] ?? "")));
    const shas = rows.flatMap(shaTokens).filter((s) => inp.git.anc(s) !== "skip");
    if (!rows.length || !shas.length) {
      cardMiss.push(id);
      continue;
    }
    for (const s of shas) if (inp.git.anc(s) !== "yes") badSha.push(`${id}:${s}`);
  }
  if (cardMiss.length) p.push(`§1 ไม่มีแถว+SHA ของ ${cardMiss.length} ใบ: ${cardMiss.slice(0, 8).join(",")}`);
  if (badSha.length) p.push(`§1 SHA ไม่ใช่บรรพบุรุษของ ${inp.tipFull.slice(0, 8)}: ${badSha.slice(0, 5).join(",")}`);
  // §2 บั๊กจริง (hunter/ผู้ตรวจ High/Med)
  const s2 = hsec(doc, 2);
  const bugRows = rowsOf(s2).filter((r) => /\b(High|HIGH|Med|MED|Medium|MEDIUM)\b/.test(r));
  if (!bugRows.length) p.push("§2 ไม่มีแถว High/Med");
  let bugBad = 0;
  for (const r of bugRows) {
    const c = cellsOf(r);
    const okId = /[A-Z][A-Za-z0-9-]*\d/.test(plainCell(c[0] ?? ""));
    const okCard = /\bP\d\.\d+[ab]?U?\b|\bHF-[A-Z0-9]+\b|\bP3-SKEL\b/.test(r);
    const shas = shaTokens(r).filter((s) => inp.git.anc(s) !== "skip");
    const okFix = (shas.length > 0 && shas.every((s) => inp.git.anc(s) === "yes")) || /\b(debt|OP|W\d+)\b|หนี้/.test(r);
    const src = repoPaths(r).filter((x) => x.startsWith("ledger/wo-notes/"));
    const okSrc = src.length > 0 && src.every((x) => inp.exists(x));
    if (!(okId && okCard && okFix && okSrc)) bugBad++;
  }
  if (bugBad) p.push(`§2 ${bugBad}/${bugRows.length} แถวขาด id/ใบ/การแก้ (SHA บรรพบุรุษ หรือ debt/OP/W)/ที่มา wo-notes ที่มีจริง`);
  const huntMiss = inp.huntFiles.filter((h) => !s2.includes(h));
  if (huntMiss.length) p.push(`§2 ไม่อ้างรายงาน hunter: ${huntMiss.join(", ")}`);
  if (bugRows.length < inp.huntFiles.length) p.push(`§2 มี ${bugRows.length} แถว (น้อยกว่ารายงาน hunter ${inp.huntFiles.length} ไฟล์)`);
  // §3 ORACLE-EDIT
  const s3 = hsec(doc, 3);
  const head = /ORACLE-EDIT[^\n]*?\b(\d{1,5})\s*(?:commits?|คอมมิต)[^\n]*?`([0-9a-f]{7,40})\.\.([0-9a-f]{7,40})`/.exec(s3);
  if (!head) p.push("§3 ไม่มีบรรทัด \"ORACLE-EDIT … N commits … `<RUN_BASE>..<end>`\"");
  else {
    const n = Number(head[1]);
    const [start, end] = [head[2]!, head[3]!];
    const endFull = inp.git.full(end);
    if (!(start.startsWith(inp.git.runBase) || inp.git.runBase.startsWith(start))) p.push(`§3 ช่วงเริ่ม ${start} ≠ RUN_BASE ${inp.git.runBase}`);
    if (!endFull) p.push(`§3 ปลายช่วง ${end} ไม่ใช่บรรพบุรุษ`);
    else {
      const list = inp.git.oeList(endFull);
      if (n !== list.length) p.push(`§3 บอก ${n} commit แต่ git log --grep ORACLE-EDIT ${inp.git.runBase}..${end} = ${list.length}`);
      if (inp.git.oeTip - list.length > OE_TOL) p.push(`§3 ปลายช่วงเก่าเกิน: ปลายทรีมี ORACLE-EDIT ${inp.git.oeTip} (ต่าง ${inp.git.oeTip - list.length} > ${OE_TOL})`);
      const set = new Set(list);
      let text = s3;
      for (const lp of repoPaths(s3).filter((x) => x.startsWith("ledger/") && x.endsWith(".md") && x !== F.handover)) text += `\n${inp.read(lp) ?? ""}`;
      const listed = new Set(shaTokens(text).map((s) => inp.git.full(s)).filter((x): x is string => !!x && set.has(x)));
      if (listed.size !== list.length) p.push(`§3 รายการมี ${listed.size} commit ORACLE-EDIT ของช่วง (ต้อง = ${list.length})`);
    }
  }
  // §4 หนี้
  const s4 = rowsOf(hsec(doc, 4)).slice(1);
  if (s4.length < 3) p.push(`§4 หนี้ ${s4.length} แถว (≥ 3)`);
  const debtBad = s4.filter((r) => !(/\bW\d+\b|POS-OWNER-PENDING|\bOP\b/.test(r) || repoPaths(r).some((x) => x.startsWith("ledger/wo-notes/") && inp.exists(x))));
  if (debtBad.length) p.push(`§4 ${debtBad.length} แถวไม่มีที่มา (W/OP/wo-notes)`);
  // §5 W1…W-last
  const s5 = rowsOf(hsec(doc, 5));
  if (!inp.opW.length) p.push(`อ่านรายการ W ของ ${F.op} ไม่ได้`);
  const wBad: string[] = [];
  const seenW = new Set<number>();
  for (const r of s5) {
    const c = cellsOf(r);
    const m = /^W(\d+)$/.exec(plainCell(c[0] ?? ""));
    if (!m) continue;
    const id = Number(m[1]);
    seenW.add(id);
    const st = c.slice(1).map((x) => /^(open|default|closed)\b/i.exec(plainCell(x))?.[1]?.toLowerCase()).find(Boolean);
    const want = inp.opW.find((w) => w.id === id);
    if (!want) wBad.push(`W${id} ไม่มีใน OP`);
    else if (!st) wBad.push(`W${id} ไม่มีสถานะ open/default/closed`);
    else if (want.closed !== (st === "closed")) wBad.push(`W${id} = ${st} แต่ OP ${want.closed ? "ปิดแล้ว" : "ยังไม่ปิด"}`);
  }
  const wMiss = inp.opW.filter((w) => !seenW.has(w.id)).map((w) => `W${w.id}`);
  if (wMiss.length) p.push(`§5 ขาด ${wMiss.length}: ${wMiss.slice(0, 8).join(",")}`);
  if (wBad.length) p.push(`§5 ${wBad.slice(0, 4).join(" · ")}`);
  // §6 ถอยกลับ
  const s6 = hsec(doc, 6);
  if (s6 && !(s6.includes(F.runbook) && /§\s*9(?![0-9])/.test(s6))) p.push(`§6 ไม่ชี้ ${F.runbook} §9`);
  const rb = inp.read(F.runbook) ?? "";
  if (!/^## 9\./m.test(rb)) p.push(`${F.runbook} ไม่มีหัวข้อ "## 9."`);
  // §7 วิธีรัน
  const s7 = hsec(doc, 7);
  if (s7) {
    for (const [tok, what] of [["scripts/pos-gates-all.sh", "ด่าน POS"], ["scripts/qc-pos-buttons.mts", "walker"], ["scripts/qc-pos-p5.3.mts", "perf"], ["scripts/iso.sh", "iso.sh"]] as const) if (!s7.includes(tok)) p.push(`§7 ไม่มี ${tok} (${what})`);
    if (!/qc:all|scripts\/qc-all\.mts/.test(s7)) p.push("§7 ไม่มีคำสั่ง qc:all");
    const gone = repoPaths(s7).filter((x) => x.startsWith("scripts/") && !inp.exists(x));
    if (gone.length) p.push(`§7 อ้างสคริปต์ที่ไม่มี: ${gone.slice(0, 3).join(", ")}`);
    if (/export\s+CI\b/.test(s7)) p.push("§7 มี export CI");
  }
  return p;
}

function judgeH2(inp: Inputs): string[] {
  const doc = inp.handover;
  if (doc === null) return [`ไม่มี ${F.handover}`];
  const s8 = hsec(doc, 8);
  if (!s8) return ["ไม่มีหัวข้อ \"## §8\" (ดัชนีหลักฐาน)"];
  const p: string[] = [];
  const rows = rowsOf(s8);
  const rowOf = (id: string) => rows.find((r) => plainCell(cellsOf(r)[0] ?? "") === id);
  for (const id of [...EV_CRM, ...EV_POS]) {
    const r = rowOf(id);
    if (!r) {
      p.push(`ไม่มีแถว ${id}`);
      continue;
    }
    const isOwner = /\bowner\b|เจ้าของ/i.test(r);
    if ((EV_OWNER as readonly string[]).includes(id)) {
      if (!isOwner) p.push(`${id} ต้องระบุ owner (ของเจ้าของ · ไม่บล็อกตัวนับ)`);
      if (id === "EV-P1" && !/\bW5\b/.test(r)) p.push("EV-P1 ไม่อ้าง W5 (ร้านทดลอง)");
      continue;
    }
    if ((EV_OWNER_OK as readonly string[]).includes(id) && isOwner) continue;
    const paths = repoPaths(r);
    const runs = /\/root\/pos-runs\/[\w./-]+/.test(r);
    const gone = paths.filter((x) => !inp.exists(x));
    if (!paths.length && !runs) p.push(`${id} ไม่มีที่อยู่หลักฐาน (path ในรีโป หรือ /root/pos-runs/…)`);
    if (gone.length) p.push(`${id} ชี้ path ที่ไม่มี: ${gone.slice(0, 2).join(", ")}`);
  }
  const r4 = rowOf("EV-P4") ?? "";
  if (r4 && !/\b\d+\/\d+\b/.test(r4)) p.push("EV-P4 (qc:all) ไม่มีตัวเลข passed/total");
  const r5 = rowOf("EV-P5") ?? "";
  if (r5 && !["1440", "1024", "390"].every((x) => r5.includes(x))) p.push("EV-P5 (parity) ไม่ครบ 3 ขนาด 1440/1024/390");
  const r6 = rowOf("EV-P6") ?? "";
  if (r6 && !r6.includes(F.handover)) p.push(`EV-P6 ไม่ชี้ ${F.handover}`);
  const c6 = rowOf("EV-C6") ?? "";
  if (c6 && !/wo-notes\/pos-[\w.-]*hunt/.test(c6)) p.push("EV-C6 ไม่ชี้รายงาน hunter (wo-notes/pos-*-hunt*)");
  const c8 = rowOf("EV-C8") ?? "";
  if (c8 && !(/\.env/.test(c8) && /EAS/.test(c8))) p.push("EV-C8 ไม่กล่าวถึง .env และ EAS");
  return p;
}

const D1_SECTIONS: readonly (readonly [string, readonly RegExp[]])[] = [
  ["register/pay/tenders", [/\bregister\b/i, /\bpay/i, /\btenders?\b/i]],
  ["bills/refund", [/\bbills?\b/i, /\brefunds?\b/i]],
  ["shifts", [/\bshifts?\b/i]],
  ["products/prices/channels", [/\bproducts?\b/i, /\bprices?\b/i, /\bchannels?\b/i]],
  ["tables/KDS/orders/QR", [/\btables?\b/i, /\bKDS\b/i, /\borders?\b/i, /\bQR\b/i]],
  ["customer display", [/\bcustomer display\b/i]],
  ["multi-branch", [/\bmulti-branch\b/i]],
  ["reports", [/\breports?\b/i]],
  ["REST", [/\bREST\b/]],
  ["integrations", [/\bintegrations?\b/i]],
  ["offline", [/\boffline\b/i]],
  ["AI", [/\bAI\b/]],
  ["permissions", [/\bpermissions?\b/i]],
];
function mdSections(text: string): { head: string; body: string }[] {
  const lines = text.split("\n");
  const out: { head: string; body: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^## /.test(lines[i]!)) continue;
    let j = i + 1;
    while (j < lines.length && !/^## /.test(lines[j]!)) j++;
    out.push({ head: lines[i]!, body: lines.slice(i + 1, j).join("\n") });
  }
  return out;
}
function judgeD1(inp: Inputs): string[] {
  const doc = inp.doc14;
  if (doc === null) return [`ไม่มี ${F.doc14}`];
  const p: string[] = [];
  const lines = doc.split("\n");
  if (!/^# .*\bV2\b/.test(lines[0] ?? "")) p.push("บรรทัดแรกไม่ใช่หัว \"# … V2\"");
  const topLine = lines.slice(0, 10).find((l) => l.includes(F.handover)) ?? "";
  if (!topLine) p.push(`10 บรรทัดแรกไม่ชี้ ${F.handover}`);
  else if (!shaTokens(topLine).some((s) => inp.git.anc(s) === "yes")) p.push("บรรทัดชี้ HANDOVER ไม่มี SHA (as-of) ที่เป็นบรรพบุรุษ");
  if (!lines.slice(0, 6).some((l) => l.startsWith(">") && /HANDOVER-P3|HANDOVER-2026-10-\d\d-POS-P3/.test(l))) p.push("6 บรรทัดแรกไม่มีบรรทัด > ชี้ HANDOVER-P3 (qc-pos-p3.12 K3 จะแดง)");
  const appIdx = lines.findIndex((l) => /^## .*v1 design notes/i.test(l));
  if (appIdx < 0) p.push("ไม่มีภาคผนวก \"## … v1 design notes\" (สเปกเดิม · มติ 7)");
  const v2 = appIdx < 0 ? doc : lines.slice(0, appIdx).join("\n");
  const secs = mdSections(v2);
  const found = new Map<string, { head: string; body: string }>();
  for (const [name, res] of D1_SECTIONS) {
    const s = secs.find((x) => res.every((r) => r.test(x.head)));
    if (!s) {
      p.push(`ไม่มีหมวด "${name}" (หัว ## ต้องมีคำ ${res.map((r) => r.source.replace(/\\b/g, "")).join(" + ")})`);
      continue;
    }
    found.set(name, s);
    const n = s.body.split("\n").filter((l) => l.trim()).length;
    const cites = repoPaths(s.body).filter((x) => inp.exists(x));
    if (n < 5) p.push(`หมวด ${name} สั้น ${n} บรรทัด (≥ 5)`);
    if (!cites.length) p.push(`หมวด ${name} ไม่อ้าง path ในรีโปที่มีจริง`);
  }
  const integ = found.get("integrations");
  if (integ) {
    if (!inp.integrationCodes.length) p.push(`อ่าน POS_INTEGRATION_CODES ของ ${F.integrations} ไม่ได้`);
    const miss = inp.integrationCodes.filter((c) => !new RegExp(`\\b${c}\\b`).test(integ.body));
    if (miss.length) p.push(`integrations ขาดการ์ด ${miss.join(",")} (${inp.integrationCodes.length} การ์ด)`);
  }
  const rest = found.get("REST");
  if (rest && !rest.body.includes(F.restDoc)) p.push(`หมวด REST ไม่ชี้ ${F.restDoc}`);
  const perm = found.get("permissions");
  if (perm) {
    if (!inp.permKeys.length) p.push(`อ่านคีย์ pos.* ของ ${F.perms} ไม่ได้`);
    const inTable = new Set(rowsOf(perm.body).flatMap((r) => [...r.matchAll(/\bpos\.[a-zA-Z]+(?:\.[a-zA-Z]+)+/g)].map((m) => m[0])));
    const miss = inp.permKeys.filter((k) => !inTable.has(k));
    const extra = [...inTable].filter((k) => !inp.permKeys.includes(k));
    if (!inTable.size) p.push("หมวด permissions ไม่มีตาราง (แถว | … |) ที่มีคีย์ pos.*");
    else {
      if (miss.length) p.push(`ตารางสิทธิ์ขาด ${miss.length}: ${miss.slice(0, 5).join(",")}`);
      if (extra.length) p.push(`ตารางสิทธิ์มีคีย์ที่ permissions.ts ไม่มี: ${extra.slice(0, 5).join(",")}`);
    }
  }
  return p;
}

function judgeD2(inp: Inputs): string[] {
  const doc = inp.sds;
  if (doc === null) return [`ไม่มี ${F.sds}`];
  const p: string[] = [];
  const lines = doc.split("\n");
  if (!/^# .*AS-BUILT/.test(lines[0] ?? "") || !/\bV2\b/.test(lines[0] ?? "")) p.push("บรรทัดแรกไม่ใช่หัว \"# … AS-BUILT … V2\"");
  if (!lines.slice(0, 6).some((l) => shaTokens(l).some((s) => inp.git.anc(s) === "yes"))) p.push("6 บรรทัดแรกไม่มี SHA (as-of) ที่เป็นบรรพบุรุษ");
  const word = (w: string) => new RegExp(`(^|[^\\w])${esc(w)}(?![\\w])`).test(doc);
  const key = (k: string) => new RegExp(`(^|[^\\w.])${esc(k)}(?![\\w])`).test(doc);
  for (const [what, list, fn] of [
    ["model", inp.models, word],
    ["คีย์ outbox", inp.outboxKeys, key],
    ["export ของ facade", inp.facadeNames, word],
    ["โมดูล export *", inp.facadeStar, word],
    ["คีย์สิทธิ์", inp.permKeys, key],
  ] as const) {
    if (!list.length && what !== "โมดูล export *") p.push(`อ่าน${what}จากโค้ดไม่ได้ (0 รายการ)`);
    const miss = list.filter((x) => !fn(x));
    if (miss.length) p.push(`ขาด${what} ${miss.length}/${list.length}: ${miss.slice(0, 5).join(",")}`);
  }
  return p;
}

type HelpLink = { raw: string; route: string | null; file: string | null };
function helpLinks(src: string): { links: HelpLink[]; bad: string[] } {
  const s = stripComments(src);
  const links: HelpLink[] = [];
  const bad: string[] = [];
  const add = (raw: string, path: string) => {
    const clean = path.split(/[?#]/)[0]!.replace(/\/+$/, "");
    let route: string | null = null;
    if (clean === "" || clean === POS_ROUTE_BASE) route = null;
    else if (clean.startsWith(`${POS_ROUTE_BASE}/`)) route = clean;
    else if (!clean.startsWith("/")) route = `${POS_ROUTE_BASE}/${clean}`;
    else if (clean === "/app/sys/[id]") route = "/app/sys/[id]";
    if (!route) {
      bad.push(`href "${raw}" ไม่ใช่หน้า POS`);
      return;
    }
    const file = `src/app${route}/page.tsx`;
    links.push({ raw, route, file });
  };
  const norm = (x: string) => x.replace(/\$\{\s*(?:params\.)?id\s*\}/g, "[id]");
  for (const m of s.matchAll(/\bhref:\s*["']([^"']*)["']/g)) {
    const v = m[1]!;
    if (/^(https?:)?\/\//.test(v)) bad.push(`ลิงก์ภายนอก ${v}`);
    else add(v, v.startsWith("/") ? norm(v) : v);
  }
  for (const m of s.matchAll(/\bhref=\s*["']([^"']*)["']/g)) {
    const v = m[1]!;
    if (/^(https?:)?\/\//.test(v)) bad.push(`ลิงก์ภายนอก ${v}`);
    else add(v, norm(v));
  }
  for (const m of s.matchAll(/\bhref=\{\s*`([^`]*)`\s*\}/g)) {
    const v = m[1]!;
    const b = /^\$\{\s*base\s*\}(\/.*)?$/.exec(v);
    if (b) {
      const rest = b[1] ?? "";
      if (/\$\{/.test(rest)) continue; // ตัวใช้ของรายการ href: "…" (นับจากรายการแล้ว)
      add(v, rest.replace(/^\//, ""));
      continue;
    }
    const n = norm(v);
    if (/\$\{/.test(n)) continue;
    if (/^(https?:)?\/\//.test(n)) bad.push(`ลิงก์ภายนอก ${v}`);
    else add(v, n);
  }
  return { links, bad };
}
function testidPatterns(src: string): RegExp[] {
  const s = stripComments(src);
  const out: RegExp[] = [];
  for (const m of s.matchAll(/data-testid=\s*"([^"]+)"/g)) out.push(new RegExp(`^${esc(m[1]!)}$`));
  for (const m of s.matchAll(/data-testid=\{\s*`([^`]+)`\s*\}/g)) out.push(new RegExp(`^${m[1]!.split(/\$\{[^}]*\}/).map(esc).join("[\\w*-]+")}$`));
  return out;
}
function judgeM1(inp: Inputs): string[] {
  const src = inp.help;
  if (src === null) return [`ไม่มี ${F.help}`];
  const p: string[] = [];
  const s = stripComments(src);
  // อ่านอย่างเดียว
  if (/^\s*["']use (client|server)["']/m.test(s)) p.push("หน้าคู่มือมี \"use client\"/\"use server\" (ต้องเป็นหน้าเซิร์ฟเวอร์อ่านอย่างเดียว)");
  const imports = [...s.matchAll(/^\s*import\s+(?:type\s+)?[\s\S]*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]!);
  const badImp = imports.filter((x) => !HELP_IMPORT_ALLOW.some((r) => r.test(x)));
  if (badImp.length) p.push(`import นอกรายการอ่านอย่างเดียว: ${badImp.join(", ")}`);
  const calls = [...s.matchAll(/\bprisma\.(\$?\w+)(?:\.(\w+))?/g)].map((m) => `${m[1]}${m[2] ? `.${m[2]}` : ""}`);
  const badCalls = calls.filter((c) => c !== "appSystem.findFirst");
  if (badCalls.length) p.push(`ใช้ prisma นอกด่านหน้า: ${badCalls.join(", ")}`);
  if (calls.length > 1) p.push(`เรียก prisma ${calls.length} ครั้ง (ด่านหน้า = 1)`);
  if (!/requireTenant\(/.test(s) || !/type:\s*"POS"/.test(s) || !/notFound\(/.test(s) || calls.length !== 1) p.push("ไม่มีด่านหน้า requireTenant + appSystem.findFirst({ … type: \"POS\" }) + notFound");
  for (const [re, what] of [[/\bfetch\(/, "fetch("], [/<form\b/, "<form"], [/\baction=/, "action="], [/\bon[A-Z]\w*=/, "ตัวจัดการเหตุการณ์ (onX=)"], [/\$(executeRaw|queryRaw|transaction)/, "$executeRaw/$queryRaw/$transaction"]] as const) if (re.test(s)) p.push(`มี ${what} (คู่มือต้องอ่านอย่างเดียว)`);
  // ข้อความผ่าน t ครบ th+en
  if (/[฀-๿]/.test(s)) p.push("มีอักษรไทยในโค้ด (ข้อความทุกคำต้องผ่าน t + src/messages/{th,en}/pos.json)");
  const vars = [...s.matchAll(/const\s+(\w+)\s*=\s*await\s+getTranslations\(\s*(?:"([\w.]+)"|\{[^}]*namespace:\s*"([\w.]+)"[^}]*\})\s*\)/g)].map((m) => ({ v: m[1]!, ns: (m[2] ?? m[3])! }));
  if (!vars.length) p.push("ไม่มี getTranslations(\"pos…\")");
  const loc = (lang: "th" | "en", full: string): Any => {
    const [root, ...rest] = full.split(".");
    if (root === "pos") return getPath(lang === "th" ? inp.msgs.thPos : inp.msgs.enPos, rest.join("."));
    return getPath(lang === "th" ? inp.msgs.thCommon : inp.msgs.enCommon, full);
  };
  let tCalls = 0;
  const keyBad: string[] = [];
  for (const { v, ns } of vars) {
    for (const m of s.matchAll(new RegExp(`\\b${esc(v)}(\\.(?:rich|raw|markup|has))?\\(\\s*(["'\`])((?:(?!\\2)[^\\\\]|\\\\.)*)\\2`, "g"))) {
      if (m[1] === ".has") continue;
      tCalls++;
      const k = m[3]!;
      if (m[2] === "`" && /\$\{/.test(k)) {
        const pre = k.slice(0, k.indexOf("${")).replace(/\.$/, "");
        const full = pre ? `${ns}.${pre}` : ns;
        const th = loc("th", full);
        const en = loc("en", full);
        if (th === undefined || en === undefined) keyBad.push(`${full}.* (${th === undefined ? "th" : "en"})`);
        else if (flatKeys(th).sort().join() !== flatKeys(en).sort().join()) keyBad.push(`${full}.* th/en คีย์ไม่ตรงกัน`);
        continue;
      }
      const full = `${ns}.${k}`;
      for (const lang of ["th", "en"] as const) if (loc(lang, full) === undefined) keyBad.push(`${full} (${lang})`);
    }
    if (ns !== "pos") {
      const th = loc("th", ns);
      const en = loc("en", ns);
      if (th !== undefined && en !== undefined && flatKeys(th).sort().join() !== flatKeys(en).sort().join()) keyBad.push(`${ns} th/en ชุดคีย์ไม่ตรงกัน`);
    }
  }
  if (vars.length && !tCalls) p.push("ไม่มีการเรียก t(…)");
  if (keyBad.length) p.push(`คีย์ข้อความขาด ${keyBad.length}: ${[...new Set(keyBad)].slice(0, 4).join(", ")}`);
  // ลิงก์
  const { links, bad } = helpLinks(src);
  p.push(...bad.slice(0, 3));
  const targets = [...new Set(links.map((l) => l.route!))];
  const gone = links.filter((l) => !inp.exists(l.file!)).map((l) => l.route);
  if (gone.length) p.push(`href ชี้หน้าที่ไม่มี: ${[...new Set(gone)].slice(0, 3).join(", ")}`);
  if (!inp.navPaths.length) p.push(`อ่าน POS_NAV_PATH ของ ${F.tabs} ไม่ได้`);
  const navMiss = inp.navPaths.filter((n) => !targets.includes(`${POS_ROUTE_BASE}/${n}`));
  if (navMiss.length) p.push(`คู่มือไม่ลิงก์แท็บ POS: ${navMiss.join(", ")}`);
  // ทะเบียนปุ่ม
  const pats = testidPatterns(src);
  const helpRows = inp.inventoryRows.filter((r) => r?.page === HELP_ROUTE);
  if (!helpRows.length) p.push(`${F.inventory} ไม่มีแถวของ ${HELP_ROUTE}`);
  const tgt = (r: Any) => String(r?.expect?.target ?? "").split(/[?#]/)[0]!;
  const linkRows = helpRows.filter((r) => r?.kind === "link" && r?.expect?.type === "navigate");
  const noRow = targets.filter((t) => !linkRows.some((r) => tgt(r) === t));
  if (noRow.length) p.push(`ลิงก์ไม่มีแถวทะเบียน (kind link · navigate · target): ${noRow.slice(0, 4).join(", ")}`);
  const ghost = helpRows.filter((r) => {
    const id = String(r?.testid ?? "");
    const probe = id.replace(/\*/g, "x0");
    return !pats.some((re) => re.test(id) || re.test(probe));
  });
  if (ghost.length) p.push(`แถวทะเบียนที่ testid ไม่อยู่ในหน้า: ${ghost.slice(0, 3).map((r) => r.testid).join(", ")}`);
  // แผนภาพ p2.14 V3 + หมุดสิทธิ์ V4
  const pages: Record<string, Any> = inp.sweep?.pages && typeof inp.sweep.pages === "object" ? inp.sweep.pages : {};
  const pg = Object.entries(pages).find(([, v]) => (Array.isArray(v) ? v : [v]).map(String).includes(F.help))?.[0];
  if (!pg) p.push(`${F.sweep} pages ไม่แมป ${F.help}`);
  else {
    if (!inp.posPages.includes(pg)) p.push(`หน้า "${pg}" ไม่อยู่ใน POS_PAGES ของ ${F.qcEnv}`);
    const runs: Any[] = Array.isArray(inp.sweep?.runs) ? inp.sweep.runs : [];
    for (const lc of ["th", "en"]) if (!runs.some((r) => Array.isArray(r?.pages) && r.pages.includes(pg) && Array.isArray(r?.locales) && r.locales.includes(lc))) p.push(`${F.sweep} ไม่มีรอบ ${lc} ของหน้า "${pg}"`);
  }
  const refusals: Record<string, Any> = inp.sweep?.refusals && typeof inp.sweep.refusals === "object" ? inp.sweep.refusals : {};
  const tid = typeof refusals[HELP_ROUTE] === "string" ? String(refusals[HELP_ROUTE]) : "";
  const refusalOk = !!tid && inp.inventoryRows.some((r) => r?.page === HELP_ROUTE && r?.testid === tid);
  if (!inp.authzPin.includes(F.help) && !refusalOk) p.push(`ไม่มีหมุดสิทธิ์ใน ${F.authzPin} หรือการ์ดปฏิเสธใน ${F.sweep} refusals (p2.14 V4)`);
  if (!inp.matrixRows.some((r) => r?.surface === F.help && r?.kind === "page")) p.push(`${F.matrix} ไม่มีแถว page ของ ${F.help}`);
  if (inp.matrixGen && !inp.matrixGen.ok) p.push(`pos-authz-matrix-gen --check: ${inp.matrixGen.detail}`);
  // ทางเข้า (มติ 6 · CD-P62-O7)
  if (!/\/pos\/help\b/.test(stripComments(inp.settingsPage))) p.push(`${F.settings} ไม่มีลิงก์ไป /pos/help`);
  if (!inp.inventoryRows.some((r) => r?.page === SETTINGS_ROUTE && tgt(r) === HELP_ROUTE)) p.push(`${F.inventory} ไม่มีแถวลิงก์ของหน้า settings → ${HELP_ROUTE}`);
  return p;
}

function judgeS1(inp: Inputs): string[] {
  const p: string[] = [];
  if (inp.syncExit !== 0) p.push(`bash scripts/sync-skills.sh --check exit ${inp.syncExit ?? "ไม่ได้รัน"}`);
  if (inp.genExit !== 0) p.push(`gen-pos-api-docs --check exit ${inp.genExit ?? "ไม่ได้รัน"}`);
  if (inp.skill === null) p.push(`ไม่มี ${F.skill}`);
  else {
    if (!inp.opGroups.length) p.push(`อ่านกลุ่ม op จาก ${F.registry} ไม่ได้`);
    const miss = inp.opGroups.filter((g) => !new RegExp(`/${esc(g)}(?![\\w-])`).test(inp.skill!));
    if (miss.length) p.push(`SKILL.md ไม่เอ่ย path ของกลุ่ม ${miss.map((g) => `/${g}`).join(" ")} (${inp.opGroups.length} กลุ่ม)`);
  }
  return p;
}

function judgeZ1(inp: Inputs): string[] {
  const p: string[] = [];
  const bad: string[] = [];
  let touchedSettings = false;
  let touchedLayout = false;
  let touchedRegistry = false; // ORACLE-EDIT ผู้คุม 24.10 (CD-P62-O1b qc-pages RG-1: เมนูข้างต้องมี widget ⇒ อนุญาต src/lib/pages/registry.ts กติกาเดียวกับ layout.tsx) // ORACLE-EDIT ผู้คุม 24.10 (CD-P62-O1 qc-nav-functions S5: อนุญาตบรรทัดเมนูข้าง /pos/help ใน layout.tsx ≤ 2 บรรทัดเพิ่ม · ลบ 0)
  for (const f of inp.changed) {
    if (/^(docs|ledger|skills|scripts)\//.test(f) || /^src\/messages\//.test(f) || f === F.help) continue;
    if (f === F.settings) {
      touchedSettings = true;
      continue;
    }
    if (f === F.registry2) { // ORACLE-EDIT ผู้คุม 24.10 (CD-P62-O1b qc-pages RG-1: เมนูข้างต้องมี widget ⇒ อนุญาต src/lib/pages/registry.ts กติกาเดียวกับ layout.tsx)
      touchedRegistry = true;
      continue;
    }
    if (f === F.layout) { // ORACLE-EDIT ผู้คุม 24.10 (CD-P62-O1 qc-nav-functions S5: อนุญาตบรรทัดเมนูข้าง /pos/help ใน layout.tsx ≤ 2 บรรทัดเพิ่ม · ลบ 0)
      touchedLayout = true;
      continue;
    }
    bad.push(f);
  }
  if (bad.length) p.push(`นอกขอบเขต ${bad.length}: ${bad.slice(0, 6).join(", ")}`);
  if (touchedSettings) {
    const lines = inp.settingsDiff.split("\n");
    const added = lines.filter((l) => l.startsWith("+") && !l.startsWith("+++"));
    const removed = lines.filter((l) => l.startsWith("-") && !l.startsWith("---"));
    if (added.length + removed.length > SETTINGS_DIFF_MAX) p.push(`${F.settings} เปลี่ยน ${added.length + removed.length} บรรทัด (≤ ${SETTINGS_DIFF_MAX} · ลิงก์ทางเข้าอย่างเดียว)`);
    if (removed.length > SETTINGS_REMOVED_MAX) p.push(`${F.settings} ลบ ${removed.length} บรรทัด (≤ ${SETTINGS_REMOVED_MAX})`);
    if (!added.some((l) => /\/pos\/help\b/.test(l))) p.push(`${F.settings} เปลี่ยนแต่ไม่มีบรรทัดลิงก์ /pos/help`);
  }
  const navRule = (file: string, diff: string): void => { // ORACLE-EDIT ผู้คุม 24.10 (CD-P62-O1b qc-pages RG-1: เมนูข้างต้องมี widget ⇒ อนุญาต src/lib/pages/registry.ts กติกาเดียวกับ layout.tsx)
    const lines = diff.split("\n");
    const added = lines.filter((l) => l.startsWith("+") && !l.startsWith("+++"));
    const removed = lines.filter((l) => l.startsWith("-") && !l.startsWith("---"));
    if (removed.length > 0) p.push(`${file} ลบ ${removed.length} บรรทัด (ต้อง 0)`);
    if (added.length > LAYOUT_ADDED_MAX) p.push(`${file} เพิ่ม ${added.length} บรรทัด (≤ ${LAYOUT_ADDED_MAX} · เมนู/widget อย่างเดียว)`);
    if (!added.every((l) => /\/pos\/help\b/.test(l))) p.push(`${file} มีบรรทัดเพิ่มที่ไม่ใช่ /pos/help`);
    if (!added.length) p.push(`${file} เปลี่ยนแต่ไม่มีบรรทัด /pos/help`);
  };
  if (touchedRegistry) navRule(F.registry2, inp.registryDiff);
  if (touchedLayout) { // ORACLE-EDIT ผู้คุม 24.10 (CD-P62-O1 qc-nav-functions S5: อนุญาตบรรทัดเมนูข้าง /pos/help ใน layout.tsx ≤ 2 บรรทัดเพิ่ม · ลบ 0)
    const lines = inp.layoutDiff.split("\n");
    const added = lines.filter((l) => l.startsWith("+") && !l.startsWith("+++"));
    const removed = lines.filter((l) => l.startsWith("-") && !l.startsWith("---"));
    if (removed.length > 0) p.push(`${F.layout} ลบ ${removed.length} บรรทัด (ต้อง 0)`);
    if (added.length > LAYOUT_ADDED_MAX) p.push(`${F.layout} เพิ่ม ${added.length} บรรทัด (≤ ${LAYOUT_ADDED_MAX} · เมนูข้างอย่างเดียว)`);
    if (!added.every((l) => /\/pos\/help\b/.test(l))) p.push(`${F.layout} มีบรรทัดเพิ่มที่ไม่ใช่เมนู /pos/help`);
    if (!added.length) p.push(`${F.layout} เปลี่ยนแต่ไม่มีบรรทัดเมนู /pos/help`);
  }
  return p;
}

function judgeG1(manifest: Any): string[] {
  const row = Array.isArray(manifest?.suites) ? manifest.suites.find((s: Any) => s?.suite === SUITE) : undefined;
  if (!row) return [`${F.gates} ยังไม่มีแถว ${SUITE}`];
  const p: string[] = [];
  if (row.mode !== "unforced") p.push(`mode ${row.mode} (ไม่มีด่าน SKIP → unforced)`);
  if (row.needs !== undefined && row.needs !== null) p.push(`needs ${row.needs} (ไม่ใช้ seed)`);
  return p;
}

// ═════════════════════════ อินพุตจริงจากทรี ═════════════════════════
function realInputs(): Inputs {
  const outbox = read(F.outbox) ?? "";
  const contracts = read(F.contracts) ?? "";
  const fac = facadeOf(read(F.facade) ?? "");
  const schemaFiles = ls("prisma/schema").filter((f) => /^pos.*\.prisma$/.test(f)).map((f) => read(`prisma/schema/${f}`) ?? "");
  const wo = ls("ledger/wo-notes");
  const plan = read(F.plan) ?? "";
  const changed = new Set<string>();
  if (gitOk("cat-file", "-e", `${LANE_PIN}^{commit}`)) {
    for (const f of git("diff", "--name-only", `${LANE_PIN}..${TIP}`).split("\n").filter(Boolean)) changed.add(f);
    if (!REV) for (const l of git("status", "--porcelain", "--untracked-files=all").split("\n").filter(Boolean)) changed.add(l.slice(3).replace(/^"|"$/g, "").replace(/^.* -> /, ""));
  } else changed.add(`(หมุดเลน ${LANE_PIN} ไม่มีในทรี)`);
  const settingsDiff = REV ? git("diff", "-U0", LANE_PIN, REV, "--", F.settings) : git("diff", "-U0", LANE_PIN, "--", F.settings);
  const layoutDiff = REV ? git("diff", "-U0", LANE_PIN, REV, "--", F.layout) : git("diff", "-U0", LANE_PIN, "--", F.layout);
  const registryDiff = REV ? git("diff", "-U0", LANE_PIN, REV, "--", F.registry2) : git("diff", "-U0", LANE_PIN, "--", F.registry2); // ORACLE-EDIT ผู้คุม 24.10 (CD-P62-O1b qc-pages RG-1: เมนูข้างต้องมี widget ⇒ อนุญาต src/lib/pages/registry.ts กติกาเดียวกับ layout.tsx) // ORACLE-EDIT ผู้คุม 24.10 (CD-P62-O1 qc-nav-functions S5: อนุญาตบรรทัดเมนูข้าง /pos/help ใน layout.tsx ≤ 2 บรรทัดเพิ่ม · ลบ 0)
  return {
    exists,
    read,
    git: GIT,
    tipFull: TIP_FULL,
    handover: read(F.handover),
    oldHandovers: ls("ledger").filter((f) => /^HANDOVER-2026-10-\d\d-POS-[\w.-]+\.md$/.test(f)).sort(),
    huntFiles: wo.filter((f) => /^pos-[\w.-]*hunt[\w.-]*\.md$/.test(f)).sort(),
    planP0to2: [...plan.matchAll(/^\|\s*(P[0-2]\.\d+[a-z]?)\s*\|/gm)].map((m) => m[1]!),
    opW: opWOf(read(F.op) ?? ""),
    doc14: read(F.doc14),
    sds: read(F.sds),
    permKeys: permKeysOf(read(F.perms) ?? ""),
    integrationCodes: integrationCodesOf(read(F.integrations) ?? ""),
    models: modelsOf(schemaFiles),
    outboxKeys: outboxKeysOf(outbox, contracts),
    facadeNames: fac.names,
    facadeStar: fac.star,
    help: read(F.help),
    settingsPage: read(F.settings) ?? "",
    msgs: { thPos: readJson(F.msgThPos) ?? {}, enPos: readJson(F.msgEnPos) ?? {}, thCommon: readJson(F.msgThCommon) ?? {}, enCommon: readJson(F.msgEnCommon) ?? {} },
    navPaths: navPathsOf(read(F.tabs) ?? ""),
    inventoryRows: (readJson(F.inventory)?.rows as Any[]) ?? [],
    sweep: readJson(F.sweep) ?? {},
    posPages: posPagesOf(read(F.qcEnv) ?? ""),
    authzPin: read(F.authzPin) ?? "",
    matrixRows: (readJson(F.matrix)?.rows as Any[]) ?? [],
    matrixGen: null,
    syncExit: null,
    genExit: null,
    skill: read(F.skill),
    opGroups: opGroupsOf(read(F.registry) ?? "", read),
    changed: [...changed].sort(),
    settingsDiff,
    layoutDiff,
    registryDiff,
    manifest: readJson(F.gates),
  };
}
function spawnExit(cmd: string, args: string[]): { code: number; tail: string } {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.CI;
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8", timeout: 300_000, env, maxBuffer: 64 * 1024 * 1024 });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim().split("\n").filter(Boolean);
  return { code: r.status ?? 1, tail: out.slice(-2).join(" | ").slice(0, 200) };
}

// ═════════════════════════ fixture (positive control) สำหรับ probe ═════════════════════════
function fixtureHandover(inp: Inputs): string {
  const t8 = inp.tipFull.slice(0, 8);
  const oe = inp.git.oeList(inp.tipFull);
  const L: string[] = [];
  L.push("# HANDOVER — POS (final)", "", "## §0 สรุป", `1. supersedes ${inp.oldHandovers.join(" · ")}`, "");
  L.push("## §1 ใบงาน 55 ใบ", "| ใบ | merge | หมายเหตุ |", "|---|---|---|");
  for (const id of CARDS) L.push(`| ${id} | \`${t8}\` | ok |`);
  L.push("", "## §2 บั๊กจริง", "| id | sev | ใบ | ที่มา | แก้ |", "|---|---|---|---|---|");
  inp.huntFiles.forEach((h, i) => L.push(`| F${i + 1} | High | P5.1 | \`ledger/wo-notes/${h}\` | \`${t8}\` |`));
  L.push("", "## §3 ORACLE-EDIT", `ORACLE-EDIT total: ${oe.length} commits · range \`${inp.git.runBase}..${t8}\``, "| sha |", "|---|");
  for (const s of oe) L.push(`| \`${s.slice(0, 10)}\` |`);
  L.push("", "## §4 หนี้", "| # | หนี้ | ที่มา |", "|---|---|---|", "| D1 | a | W21 |", "| D2 | b | W42 |", "| D3 | c | POS-OWNER-PENDING |");
  L.push("", "## §5 เจ้าของ", "| W | เรื่อง | สถานะ |", "|---|---|---|");
  for (const w of inp.opW) L.push(`| W${w.id} | x | ${w.closed ? "closed" : "default"} |`);
  L.push("", "## §6 ถอยกลับ", `ดู ${F.runbook} §9`, "");
  L.push("## §7 วิธีรัน", "bash scripts/iso.sh bash scripts/pos-gates-all.sh · pnpm qc:all · scripts/qc-pos-buttons.mts · scripts/qc-pos-p5.3.mts", "");
  L.push("## §8 ดัชนีหลักฐาน", "| id | หลักฐาน | ที่อยู่ | สถานะ |", "|---|---|---|---|");
  const hunt = inp.huntFiles[0] ?? "pos-P5.1-hunt-MA.md";
  const loc: Record<string, string> = {
    "EV-C1": `\`${F.plan}\``,
    "EV-C2": "`ledger/wo-notes/`",
    "EV-C3": "`scripts/qc-pos-p2.14.mts` · `git diff`",
    "EV-C4": "`/root/pos-runs/qcall-x/`",
    "EV-C5": "`/root/pos-runs/vis-x/`",
    "EV-C6": `\`ledger/wo-notes/${hunt}\``,
    "EV-C7": `\`${F.runbook}\``,
    "EV-C8": "`.env` mtime · no EAS · `ledger/POS-RESUME.md`",
    "EV-P4": "`/root/pos-runs/qcall-x/` 283/429",
    "EV-P5": "`/root/pos-runs/parity-x/` 1440 · 1024 · 390",
    "EV-P6": `\`${F.handover}\``,
  };
  for (const id of [...EV_CRM, ...EV_POS]) {
    if ((EV_OWNER as readonly string[]).includes(id)) L.push(`| ${id} | x | — | owner${id === "EV-P1" ? " (W5)" : ""} |`);
    else L.push(`| ${id} | x | ${loc[id]} | done |`);
  }
  return L.join("\n");
}
function fixtureDoc14(inp: Inputs): string {
  const t8 = inp.tipFull.slice(0, 8);
  const body = (extra = "") => ["- a", "- b", "- c", "- d", `- โค้ด \`${F.facade}\` ${extra}`].join("\n");
  const heads: Record<string, string> = {
    "register/pay/tenders": "Register · pay · tenders",
    "bills/refund": "Bills · refund",
    shifts: "Shifts",
    "products/prices/channels": "Products · prices · channels",
    "tables/KDS/orders/QR": "Tables · KDS · orders · QR",
    "customer display": "Customer display",
    "multi-branch": "Multi-branch",
    reports: "Reports",
    REST: "REST",
    integrations: "Integrations",
    offline: "Offline",
    AI: "AI",
    permissions: "Permissions",
  };
  const L = [`# โมดูล 14 — POS · V2`, "", `> V2 as-built · ${F.handover} · as of \`${t8}\``, "> P3 as-built: see HANDOVER-P3", ""];
  let n = 1;
  for (const [name] of D1_SECTIONS) {
    L.push(`## ${n++}. ${heads[name]}`);
    if (name === "integrations") L.push(body(inp.integrationCodes.join(" ")));
    else if (name === "REST") L.push(body(F.restDoc));
    else if (name === "permissions") L.push(body(), "| key | owner |", "|---|---|", ...inp.permKeys.map((k) => `| \`${k}\` | ✓ |`));
    else L.push(body());
    L.push("");
  }
  L.push("## ภาคผนวก — v1 design notes", "old spec");
  return L.join("\n");
}
function fixtureSds(inp: Inputs): string {
  return [`# POS — AS-BUILT V2 (\`${inp.tipFull.slice(0, 8)}\`)`, "", ...inp.models.map((m) => `- ${m}`), ...inp.outboxKeys.map((k) => `- \`${k}\``), ...inp.facadeNames.map((x) => `- \`${x}\``), ...inp.facadeStar.map((x) => `- ${x}`), ...inp.permKeys.map((k) => `- \`${k}\``)].join("\n");
}
function fixtureHelp(inp: Inputs): string {
  const links = inp.navPaths.map((n) => `{ key: "${n.replace(/\W/g, "")}", href: "${n}" }`).join(", ");
  return [
    'import Link from "next/link";',
    'import { notFound } from "next/navigation";',
    'import { getTranslations } from "next-intl/server";',
    'import { requireTenant } from "@/lib/core/context";',
    'import { prisma } from "@/lib/core/db";',
    'import { PageHeader } from "@/components/ui/PageHeader";',
    `const LINKS = [${links}];`,
    "export default async function PosHelpPage({ params }: { params: Promise<{ id: string }> }) {",
    "  const { id } = await params;",
    "  const auth = await requireTenant();",
    '  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId: auth.active.tenantId, type: "POS" } });',
    "  if (!sys) notFound();",
    '  const t = await getTranslations("pos.help");',
    "  const base = `/app/sys/${id}/pos`;",
    '  return (<div><PageHeader title={t("title")} desc={t("desc")} />{LINKS.map((l) => <Link key={l.key} data-testid={`pos-help-link-${l.key}`} href={`${base}/${l.href}`}>{t(`links.${l.key}`)}</Link>)}</div>);',
    "}",
  ].join("\n");
}
function fixtureM1(inp: Inputs): Inputs {
  const linkKeys = inp.navPaths.map((n) => n.replace(/\W/g, ""));
  const helpTh = { title: "คู่มือ", desc: "ใช้ POS", links: Object.fromEntries(linkKeys.map((k) => [k, `ไป ${k}`])) };
  const helpEn = { title: "Guide", desc: "Use POS", links: Object.fromEntries(linkKeys.map((k) => [k, `Go ${k}`])) };
  const rows: Any[] = inp.navPaths.map((n) => ({ page: HELP_ROUTE, testid: `pos-help-link-${n.replace(/\W/g, "")}`, kind: "link", expect: { type: "navigate", target: `${POS_ROUTE_BASE}/${n}` } }));
  rows.push({ page: SETTINGS_ROUTE, testid: "pos-settings-help", kind: "link", expect: { type: "navigate", target: HELP_ROUTE } });
  return {
    ...inp,
    help: fixtureHelp(inp),
    settingsPage: '<Link href={`/app/sys/${id}/pos/help`} data-testid="pos-settings-help">x</Link>',
    msgs: { ...inp.msgs, thPos: { ...inp.msgs.thPos, help: helpTh }, enPos: { ...inp.msgs.enPos, help: helpEn } },
    inventoryRows: rows,
    sweep: { pages: { help: F.help }, refusals: {}, runs: [{ pages: ["help"], locales: ["th"] }, { pages: ["help"], locales: ["en"] }] },
    posPages: [...inp.posPages, "help"],
    authzPin: `const help = norm("${F.help}");`,
    matrixRows: [{ surface: F.help, kind: "page" }],
    matrixGen: { ok: true, detail: "ตรง" },
  };
}

// ═════════════════════════ probe N1–N8 ═════════════════════════
type Probe = [string, (i: Inputs) => Inputs];
function runProbes(id: string, judge: (i: Inputs) => string[], good: Inputs, probes: Probe[]): void {
  const g = judge(good);
  const weak: string[] = [];
  for (const [name, mut] of probes) {
    let r: string[] = [];
    try {
      r = judge(mut(good));
    } catch (e) {
      r = [`โยน ${(e as Error).message}`];
    }
    if (!r.length) weak.push(name);
  }
  chk(id, g.length === 0 && weak.length === 0, g.length ? `positive control แดง: ${joinP(g, 3)}` : weak.length ? `probe ไม่แดง: ${weak.join(" · ")}` : `positive control เขียว · ${probes.length} probe แดงทุกตัว`);
}
function fakeSha(inp: Inputs): string {
  for (const c of ["fedcba9", "abcdef1", "fadedbe", "decaf00", "beefed1"]) if (!inp.git.full(c) && !gitOk("cat-file", "-e", `${c}^{commit}`)) return `${c}e`;
  return "ffffffff";
}
function selfTest(base: Inputs): void {
  if (!base.tipFull) {
    for (const id of ["N1", "N2", "N3", "N4", "N5", "N6", "N7", "N8"]) chk(`P6.2-${id}`, false, "อ่าน SHA ปลายทรีไม่ได้");
    return;
  }
  const t8 = base.tipFull.slice(0, 8);
  const H = fixtureHandover(base);
  const withH = (h: string): Inputs => ({ ...base, handover: h, exists: (p: string) => p === F.handover || base.exists(p) });
  const lastW = base.opW[base.opW.length - 1]?.id ?? 5;
  runProbes("P6.2-N1", judgeH1, withH(H), [
    ["ขาดแถว P4.2", (i) => withH(i.handover!.replace(/^\| P4\.2 \|.*\n/m, ""))],
    ["SHA ไม่ใช่บรรพบุรุษ", (i) => withH(i.handover!.replace(`| P3.6 | \`${t8}\``, `| P3.6 | \`${fakeSha(i)}\``))],
    ["นับ ORACLE-EDIT ผิด 1", (i) => withH(i.handover!.replace(/ORACLE-EDIT total: (\d+) commits/, (_m, n: string) => `ORACLE-EDIT total: ${Number(n) + 1} commits`))],
    ["W5 = closed", (i) => withH(i.handover!.replace(/^\| W5 \| x \| default \|/m, "| W5 | x | closed |"))],
    [`ขาด W${lastW}`, (i) => withH(i.handover!.replace(new RegExp(`^\\| W${lastW} \\|.*\\n?`, "m"), ""))],
    ["ไม่มี §6", (i) => withH(i.handover!.replace(/^## §6[^\n]*\n[^\n]*\n/m, ""))],
    ["ไม่อ้างรายงาน hunter", (i) => withH(i.handover!.replace(/^\| F1 \|.*\n/m, ""))],
    ["§0 ยาวเกิน", (i) => withH(i.handover!.replace("## §0 สรุป\n", `## §0 สรุป\n${Array.from({ length: 20 }, (_, k) => `${k}. x`).join("\n")}\n`))],
  ]);
  runProbes("P6.2-N2", judgeH2, withH(H), [
    ["EV-P1 ไม่ใช่ owner", (i) => withH(i.handover!.replace(/^\| EV-P1 \|.*$/m, "| EV-P1 | x | `/root/pos-runs/x/` | done |"))],
    ["ไม่มี EV-C4", (i) => withH(i.handover!.replace(/^\| EV-C4 \|.*\n/m, ""))],
    ["parity ไม่มี 390", (i) => withH(i.handover!.replace("1440 · 1024 · 390", "1440 · 1024"))],
    ["ที่อยู่ไม่มีจริง", (i) => withH(i.handover!.replace(/^\| EV-C1 \|.*$/m, "| EV-C1 | x | `ledger/NOPE-P62.md` | done |"))],
  ]);
  const D = fixtureDoc14(base);
  const withD = (d: string): Inputs => ({ ...base, doc14: d });
  const k0 = base.permKeys[0] ?? "pos.sale.create";
  runProbes("P6.2-N3", judgeD1, withD(D), [
    ["ตารางสิทธิ์ขาดคีย์", (i) => withD(i.doc14!.replace(`| \`${k0}\` | ✓ |\n`, ""))],
    ["คีย์ปลอม", (i) => withD(i.doc14!.replace("|---|---|\n", "|---|---|\n| `pos.fake.key` | ✓ |\n"))],
    ["ไม่มีหมวด Offline", (i) => withD(i.doc14!.replace(/^## (\d+)\. Offline$/m, "## $1. Sync"))],
    ["integrations ขาด KANBAN", (i) => withD(i.doc14!.replace(/\bKANBAN\b/g, "BOARD"))],
    ["ไม่มีหัว V2", (i) => withD(i.doc14!.replace("# โมดูล 14 — POS · V2", "# โมดูล 14 — POS"))],
  ]);
  const S = fixtureSds(base);
  const withS = (d: string): Inputs => ({ ...base, sds: d });
  const m0 = base.models[0] ?? "PosSale";
  const o0 = base.outboxKeys[0] ?? "pos.sale.paid";
  const f0 = base.facadeNames.find((x) => x.length > 5) ?? "createSale";
  runProbes("P6.2-N4", judgeD2, withS(S), [
    ["ขาด model", (i) => withS(i.sds!.replace(new RegExp(`^- ${esc(m0)}$`, "m"), "- x"))],
    ["ขาดคีย์ outbox", (i) => withS(i.sds!.split("\n").filter((l) => !l.includes(`\`${o0}\``)).join("\n"))],
    ["ขาด export", (i) => withS(i.sds!.split("\n").filter((l) => l !== `- \`${f0}\``).join("\n"))],
    ["หัวไม่ใช่ AS-BUILT V2", (i) => withS(i.sds!.replace("AS-BUILT V2", "AS-BUILT"))],
  ]);
  const M = fixtureM1(base);
  const withHelp = (i: Inputs, h: string): Inputs => ({ ...i, help: h });
  runProbes("P6.2-N5", judgeM1, M, [
    ["import service", (i) => withHelp(i, `import { createSale } from "@/lib/modules/pos/service";\n${i.help}`)],
    ["prisma อื่น", (i) => withHelp(i, i.help!.replace("if (!sys) notFound();", "if (!sys) notFound();\n  const x = await prisma.posSale.findMany({});"))],
    ["ข้อความไทยในโค้ด", (i) => withHelp(i, i.help!.replace("<div>", "<div>คู่มือ"))],
    ["href ไปหน้าไม่มี", (i) => withHelp(i, i.help!.replace("const LINKS = [", 'const LINKS = [{ key: "nope", href: "nope-p62" }, '))],
    ["คีย์ en ขาด", (i) => ({ ...i, msgs: { ...i.msgs, enPos: { ...i.msgs.enPos, help: { ...i.msgs.enPos.help, title: undefined } } } })],
    ["ไม่มีแถวทะเบียนลิงก์", (i) => ({ ...i, inventoryRows: i.inventoryRows.slice(1) })],
    ["ไม่อยู่ใน POS_PAGES", (i) => ({ ...i, posPages: i.posPages.filter((x) => x !== "help") })],
    ["ตัวสร้างตารางไม่ตรง", (i) => ({ ...i, matrixGen: { ok: false, detail: "ไม่ตรง" } })],
    ["ไม่มีลิงก์จาก settings", (i) => ({ ...i, settingsPage: "<div />" })],
    ["มี onClick", (i) => withHelp(i, i.help!.replace("<div>", "<div onClick={() => null}>"))],
  ]);
  const goodS1: Inputs = { ...base, syncExit: 0, genExit: 0, skill: base.opGroups.map((g) => `GET /${g}`).join("\n") };
  runProbes("P6.2-N6", judgeS1, goodS1, [
    ["sync exit 1", (i) => ({ ...i, syncExit: 1 })],
    ["gen exit 1", (i) => ({ ...i, genExit: 1 })],
    ["SKILL.md ไม่มี /sync", (i) => ({ ...i, skill: i.skill!.replace(/^GET \/sync$/m, "") })],
  ]);
  const goodZ: Inputs = { ...base, changed: ["docs/modules/14-pos.md", "ledger/HANDOVER-2026-10-POS.md", "src/messages/th/pos.json", F.help, F.settings, "scripts/pos-ui-inventory.json", "skills/shark-pos-api/SKILL.md", F.layout, F.registry2], settingsDiff: "@@ -1 +1 @@\n-  <PageHeader />\n+  <PageHeader actions={<Link href={`/app/sys/${id}/pos/help`} />} />\n+import Link from \"next/link\";", layoutDiff: "@@ -138,0 +139 @@\n+          { href: `${s}/pos/help`, label: posNav(\"settings.helpLink\") },", registryDiff: "@@ -78,0 +79 @@\n+  S(\"POS\", \"/pos/help\", \"คู่มือใช้งาน POS\", \"📖\")," }; // ORACLE-EDIT ผู้คุม 24.10 (CD-P62-O1 qc-nav-functions S5: อนุญาตบรรทัดเมนูข้าง /pos/help ใน layout.tsx ≤ 2 บรรทัดเพิ่ม · ลบ 0)
  runProbes("P6.2-N7", judgeZ1, goodZ, [
    ["แตะ register.ts", (i) => ({ ...i, changed: [...i.changed, "src/lib/modules/pos/register.ts"] })],
    ["settings 30 บรรทัด", (i) => ({ ...i, settingsDiff: `${i.settingsDiff}\n${Array.from({ length: 30 }, (_, k) => `+ line ${k}`).join("\n")}` })],
    ["settings ไม่มี /pos/help", (i) => ({ ...i, settingsDiff: "@@\n+  <span />" })],
    ["แตะ prisma", (i) => ({ ...i, changed: [...i.changed, "prisma/schema/pos.prisma"] })],
    ["layout ลบบรรทัด", (i) => ({ ...i, layoutDiff: `${i.layoutDiff}\n-          { href: \`\${s}/pos/settings\`, label: posNav("nav.settings") },` })], // ORACLE-EDIT ผู้คุม 24.10 (CD-P62-O1 qc-nav-functions S5: อนุญาตบรรทัดเมนูข้าง /pos/help ใน layout.tsx ≤ 2 บรรทัดเพิ่ม · ลบ 0)
    ["layout 3 บรรทัด", (i) => ({ ...i, layoutDiff: `${i.layoutDiff}\n+ /pos/help a\n+ /pos/help b` })],
    ["layout ไม่มี /pos/help", (i) => ({ ...i, layoutDiff: "@@\n+          { href: `${s}/pos/x`, label: posNav(\"x\") }," })],
    ["registry ลบบรรทัด", (i) => ({ ...i, registryDiff: `${i.registryDiff}\n-  S("POS", "/pos/settings", "x", "x"),` })], // ORACLE-EDIT ผู้คุม 24.10 (CD-P62-O1b qc-pages RG-1: เมนูข้างต้องมี widget ⇒ อนุญาต src/lib/pages/registry.ts กติกาเดียวกับ layout.tsx)
    ["registry 3 บรรทัด", (i) => ({ ...i, registryDiff: `${i.registryDiff}\n+ /pos/help a\n+ /pos/help b` })],
  ]);
  const gm = (rows: Any[]) => ({ suites: rows });
  const g1 = [judgeG1(gm([{ suite: SUITE, mode: "unforced" }])), judgeG1(gm([{ suite: SUITE, mode: "forced" }])), judgeG1(gm([])), judgeG1(gm([{ suite: SUITE, mode: "unforced", needs: "member-seed" }]))];
  chk("P6.2-N8", g1[0]!.length === 0 && g1.slice(1).every((x) => x.length > 0), `unforced ${g1[0]!.length} · forced ${g1[1]!.length} · ไม่มีแถว ${g1[2]!.length} · needs ${g1[3]!.length}`);
}

// ═════════════════════════ รัน ═════════════════════════
const results = new Map<string, { ok: boolean; detail: string }>();
function chk(id: string, ok: boolean, detail: string): void {
  results.set(id, { ok, detail });
}
const base = realInputs();
try {
  if (!SELF_ONLY) {
    // เครื่องมือในรีโป (อ่านอย่างเดียว · ตรวจทรีบนดิสก์ · CD-P62-O9)
    const sync = spawnExit("bash", ["scripts/sync-skills.sh", "--check"]);
    base.syncExit = sync.code;
    const gen = spawnExit("pnpm", ["exec", "tsx", "scripts/gen-pos-api-docs.mts", "--check"]);
    base.genExit = gen.code;
    try {
      const gm = (await import("./pos-authz-matrix-gen.mts" as string)) as Any;
      const text = gm.renderMatrix(gm.buildMatrix(ROOT)) as string;
      const cur = existsSync(join(ROOT, F.matrix)) ? readFileSync(join(ROOT, F.matrix), "utf8") : "";
      base.matrixGen = REV ? null : { ok: cur === text, detail: cur === text ? "ตรง" : "ไม่ตรงกับตัวสร้าง — รัน --write แล้วตรวจ diff" };
    } catch (e) {
      base.matrixGen = { ok: false, detail: `import ตัวสร้างไม่ได้: ${(e as Error).message.slice(0, 80)}` };
    }
    const one = (id: string, p: string[], okText: string) => chk(id, p.length === 0, p.length ? joinP(p) : okText);
    one("P6.2-H1", judgeH1(base), `§0–§8 ครบ · ${CARDS.length - 1} ใบ (P1.1a+b) SHA บรรพบุรุษ · W1–W${base.opW[base.opW.length - 1]?.id ?? "?"} · ORACLE-EDIT ${GIT.oeTip}`);
    one("P6.2-H2", judgeH2(base), `ดัชนี ${EV_CRM.length + EV_POS.length} แถวครบ · owner 3 แถว`);
    one("P6.2-D1", judgeD1(base), `V2 · ${D1_SECTIONS.length} หมวด · สิทธิ์ ${base.permKeys.length} คีย์ตรง · ${base.integrationCodes.length} การ์ด`);
    one("P6.2-D2", judgeD2(base), `model ${base.models.length} · outbox ${base.outboxKeys.length} · export ${base.facadeNames.length} · สิทธิ์ ${base.permKeys.length}`);
    one("P6.2-M1", judgeM1(base), "อ่านอย่างเดียว · ลิงก์ครบแท็บ · th/en · ทะเบียน · แผนภาพ · สิทธิ์ · ทางเข้า");
    const s1 = judgeS1(base);
    chk("P6.2-S1", s1.length === 0, s1.length ? `${joinP(s1)}${sync.code ? ` · sync: ${sync.tail}` : ""}${gen.code ? ` · gen: ${gen.tail}` : ""}` : `sync 0 · gen 0 · ${base.opGroups.length} กลุ่ม op (${base.opGroups.join(" ")})`);
    one("P6.2-Z1", judgeZ1(base), `${base.changed.length} ไฟล์ในขอบเขต (เทียบ ${LANE_PIN})`);
    one("P6.2-G1", judgeG1(base.manifest), "แถว unforced");
  }
  selfTest(base);
} catch (e) {
  console.error(`💥 ${SUITE}: ${(e as Error).stack ?? e}`);
}

const ids = SELF_ONLY ? CHECKS.filter(([id]) => /-N\d+$/.test(id)) : CHECKS;
for (const [id] of ids) if (!results.has(id)) results.set(id, { ok: false, detail: "ไม่ถึง (harness ล้ม)" });
console.log(`\n── ${SUITE} · ฐาน ${PIN} · หมุดเลน ${LANE_PIN} · RUN_BASE ${RUN_BASE} · ${REV ? `ไฟล์ ณ ${REV} (git show)` : "ทรีบนดิสก์"} · ปลาย ${TIP_FULL.slice(0, 8)} · ${NO_DB ? "--no-db · " : ""}${SELF_ONLY ? "--self-test" : "โหมดด่าน"} ──`);
for (const [id, t] of ids) {
  const r = results.get(id)!;
  console.log(`${r.ok ? "✅" : "❌"} ${id}  ${t}\n      → ${r.detail}`);
}
const failed = ids.map(([id]) => id).filter((id) => !results.get(id)!.ok);
console.log(`\n===== ${SUITE} ===== ผ่าน ${ids.length - failed.length}/${ids.length}${REV ? ` (rev ${REV})` : ""}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, mode: SELF_ONLY ? "self-test" : REV ? "red-before" : "gate", total: ids.length, passed: ids.length - failed.length, failed, skipped: false, pin: PIN, lanePin: LANE_PIN, runBase: RUN_BASE, rev: REV || null, tip: TIP_FULL.slice(0, 8), oracleEdits: GIT.oeTip })}`);
process.exit(failed.length ? 1 : 0);
