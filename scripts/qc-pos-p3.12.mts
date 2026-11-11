// QC — POS RUN ใบ P3.12 (ปิดเฟส 3): ข้อสอบไขว้ทุกระบบ + parity + HANDOVER-P3 + ORACLE-EDIT ปิดเฟส — ข้อสอบสถิตล้วน (ไม่แตะ DB)
//   ผู้เขียนข้อสอบ (oracle writer · ผู้คุม B · 22 ต.ค. 2026) · เขียนก่อนทำ (fail-before) · แม่แบบ = ครึ่งสถิตของ qc-pos-p2.14
//
// สัญญา: ledger/pos-briefs/pos-brief-P3.12.md §4 (G/X/V/H/K/O/Z) · §4(a) Tier 1 · §4(b) parity · §4(c) HANDOVER-P3 · §4(d) triage · §10 มติ 1–10 ·
//        ledger/wo-notes/pos-P3.12-prep.md §(a) K2 · §(b) ตาราง triage 65 แถว · §(e) มติผู้คุม 1–8
//        โน้ต: ledger/wo-notes/pos-P3.12-oracle.md (ตาราง check ↔ brief · แดงก่อน · lint ต่อชุด · ตารางหมุดเลน · CD-P312-O3…)
// ผู้สร้างห้ามแก้ข้อสอบนี้ (แก้ได้เฉพาะผู้คุม · commit test(pos) ของตัวเอง + เหตุผล)
//
// 🔴 กติกาข้อสอบ: ไม่มี DB เลย (ไม่โหลด prisma · ไม่อ่าน env ฐานข้อมูล) · ไม่เขียนไฟล์ · ไม่มีเครือข่าย ·
//    --list = พิมพ์ทุก id · --no-db = ชุดเดียวกันทั้งหมด (ทุกข้อเป็นสถิต) · --self-test (probe) = พลิกข้อที่ "เขียวโดยออกแบบ" ด้วยอินพุตที่ถูกแก้ในหน่วยความจำ
//    ต้องแดงทุกข้อ (positive control) · ไม่มีด่าน SKIP (ไม่มีอะไรให้รอ ⇒ unforced ในแมนิเฟสต์)
//    หมุด: PIN = ปลายปิด P3 (env P312_PIN) · LANE_PIN = เป้าหมายตรึงหมุดเลนตอนปิด P3 (env P312_LANE_PIN · ค่าเริ่ม = PIN) — ไม่มีการเทียบไบต์กับหมุด
//    O2 เรียก scripts/pos-oracle-check.sh (python · อ่านอย่างเดียว) ต่อทุก qc-pos-p3* — ชุดนี้รันผ่าน iso.sh เหมือนชุดอื่น
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SUITE = "qc-pos-p3.12";
const ROOT = process.cwd();
const LIST = process.argv.includes("--list");
const NODB = process.argv.includes("--no-db");
const SELFTEST = process.argv.includes("--self-test");
const PFX = "P3.12";
const PIN = process.env.P312_PIN || "554a74d3"; // ปลาย session/pos ตอนปิด P3 (P3-SKEL U merge 321ddf57 + ledger · แถวแผน P3.1–3.11 ✅) — ผู้คุมย้ายด้วย env/แก้ข้อสอบเมื่อปลายปิดเฟสจริงเปลี่ยน
const LANE_PIN = process.env.P312_LANE_PIN || PIN; // เป้าหมายตรึงหมุดเลน (มติ §10.10 · ชุด re-pin ปิด P3 → หมุดทุกตัว = ค่านี้ หรือ commit ที่ใหม่กว่าบน session/pos)

// ═════════════════════════ ทะเบียนข้อสอบ (id · กลุ่ม · หัวข้อ) ═════════════════════════
type Def = readonly [string, string, string];
const D = (id: string, g: string, title: string): Def => [`${PFX}-${id}`, g, title] as const;
const CHECKS: readonly Def[] = [
  // ── G ชุดด่าน (pos-gates.json) ──
  D("G1", "G", "[§4 G1 · §4(a)] pos-gates.json ครอบทุก scripts/qc-pos-*.mts · qc-hf-*.mts + Tier 1 ไขว้ระบบ 20 ชุด (chat ×4 · meeting · inventory ×3 · ai ×9 · money-mapping · catalog-services · booking-edit-schedule)"),
  D("G2", "G", "[§4 G2 · มติ §10.4] ไม่มีแถว accepted ที่ยอม id หมุดเลน ST* (W21 ต้องแก้ ไม่ใช่ยอม)"),
  D("G3", "G", "[§4 G3 · HF-FU2 runner (b)] ทุก accepted มี reason + owner + opRef ที่มีจริงใน POS-OWNER-PENDING.md + checks ไม่ว่าง · checks มี CRASH/*-ERR ⇒ มี match"),
  D("G4", "G", "[§4(a) · prep §(e) มติ 2] qc-crm-c2.7 อยู่ใน $pending (state pending-triage · reason · triage F-P3-xx · opRef ที่มีจริงใน OP) และไม่อยู่ใน suites"),
  // ── X qc:all QC7 ──
  D("X1", "X", "[§4 X1 · §4(a) 1–5] wo-notes/pos-P3.12.md §qcall: head (≥ PIN · บรรพบุรุษของ HEAD) · branch · result passed/total · ตาราง class|count|ref ทุกแถว ∈ คลาส HANDOVER-P2 §2 หรืออ้าง CD-* · Σcount = total − passed"),
  D("X2", "X", "[§4 X2] §qcall บันทึกว่าลบ branch แล้ว (บรรทัด \"ลบ QC7\")"),
  // ── V parity / owner-ack ──
  D("V1", "V", "[§4 V1] pos-visual-sweep.json มีแถวจริง th + en ของ p3.6u และ p3-skel-u (ไม่ใช่ placeholder: th มีรหัสรอบ vis-…-qc5-<UTC> + N/N · en locales [en])"),
  D("V2", "V", "[§4 V2 · §4(b) 5] wo-notes/pos-P3.12-parity.md มีตาราง status · มีแถว · OPEN 0 · DEVIATION ทุกแถวอ้างมติ (CD-*/มติ/ruling) หรือ W-id"),
  D("V3", "V", "[§4 V3 · prep §(c)] OP มีแถว W ของจออนุมานทุกใบ U ของ P3 (P3.4U · P3.5U · P3.6U · P3.7U · P3.8U · P3.9U · P3-SKEL U)"),
  // ── H ส่งมอบ ──
  D("H1", "H", "[§4 H1 · §4(c)] ledger/HANDOVER-2026-10-xx-POS-P3.md มี §0–§8 · ทุกใบ P3 (P3.4–P3.9 S/U · P3-SKEL S/U · HF-FU2) มีแถวใน §1 + SHA ทุกตัวในแถวเป็นบรรพบุรุษของ HEAD"),
  D("H2", "H", "[§4 H2 = p2.14 H2 PAR] POS-CONTRACTS.md ตาราง ## Event ⊇ ทุกคีย์ pos.* ใน src/lib/outbox-consumers.ts"),
  D("H3", "H", "[§4 H3] HANDOVER §4 triage: ทุกแถว bucket เดียว ∈ {P3.12 P4 P5 P6 OP S follow-up card} · แถว OP มี OP anchor ที่ชี้ W-id/หัวข้อ § ที่มีจริงใน OP"),
  D("H4", "H", "[§4(c) · งานผู้คุม] HANDOVER-P3 ไม่มีช่อง ⟨controller⟩ ค้าง (ผู้คุมเติมครบ)"),
  // ── K เอกสาร ──
  D("K1", "K", "[§4 K1 · มติ §10.6 · ⚠️6] pos-integrations.ts ไม่มี fact false ที่ติดป้ายเฟสปิดแล้ว P3 / P3.x / P3.n"),
  D("K2", "K", "[§4 K2 · ⚠️4 · prep §(e) มติ 6–7] OP มีหัวข้อ `## แจ้งเจ้าของโมดูล X` (มีบรรทัด (P3…) ใต้หัวข้อ) และ anchor §\"แจ้งเจ้าของ… X\" ของ Chat · CRM · platform/payment · app-shell · settings/staff + บรรทัด (P3.4 …) ของ core/permissions.ts · api-keys/scopes.ts · kds.ts"),
  D("K3", "K", "[§4 K3 · แบบ P2.14 มติ 7] docs/modules/14-pos.md บรรทัด > หัวไฟล์ชี้ HANDOVER-P3"),
  // ── O สุขภาพข้อสอบ ──
  D("O1", "O", "[§4 O1 · CD-P312-O1] qc-pos-p1.6 R2 สแกน src/lib/pos-*actions*.ts ครบทุกไฟล์ที่มีจริง"),
  D("O2", "O", "[§4 O2] pos-oracle-check.sh <tree> <suite> --base <HEAD> ไม่ red สำหรับทุก scripts/qc-pos-p3*.mts"),
  D("O3", "O", "[§4 O3] ทุก scripts/qc-pos-p3*.mts มีหมุดเลน env-override (const LANE_PIN|LANE_REV = process.env.X || …)"),
  D("O4", "O", "[§4 O4 · มติ §10.10] ตรึงหมุดเลน: ทุก LANE_PIN/LANE_REV ใน qc-pos-*/qc-hf-* = LANE_PIN ของชุดนี้ หรือ commit ที่ใหม่กว่าบน session/pos (ลูกหลานของ LANE_PIN · บรรพบุรุษของ HEAD)"),
  // ── T triage ──
  D("T1", "T", "[§4(d) · prep §(b) · มติ (e)4] HANDOVER §4 ครบ: id ไม่ซ้ำ ⊇ ทุก F-P3-xx ของ prep · ทุกแถวมี bucket · มีแถวที่มาจาก P3-SKEL U (หลัง SKEL-U merge)"),
  // ── Z คืนสภาพ ──
  D("Z1", "-", "[§4 Z1] ไม่มีรอย: git status ของทรีก่อน = หลังรัน · ชุดนี้ไม่ import ไคลเอนต์ฐานข้อมูล/ไม่อ่าน env ฐานข้อมูล (ไม่มี DB = ไม่มีแถวค้างโดยโครงสร้าง)"),
];
/** ข้อที่เขียวโดยออกแบบที่ฐาน — --self-test ต้องพลิกเป็นแดงได้ทุกข้อ */
const GREEN_BY_DESIGN = ["G1", "G2", "G3", "V1", "H2", "O1", "Z1"];

if (LIST) {
  console.log(`${SUITE} — ${CHECKS.length} ข้อ (id · กลุ่ม · หัวข้อ) · PIN ${PIN} · LANE_PIN ${LANE_PIN}`);
  for (const [id, g, t] of CHECKS) console.log(`${id}\t${g}\t${t}`);
  console.log(`green-by-design (self-test): ${GREEN_BY_DESIGN.map((x) => `${PFX}-${x}`).join(" ")}`);
  process.exit(0);
}

// ═════════════════════════ ตัวช่วย ═════════════════════════
const abs = (p: string) => join(ROOT, p);
const ex = (p: string) => existsSync(abs(p));
const rd = (p: string) => (ex(p) ? readFileSync(abs(p), "utf8") : "");
const short = (v: unknown, n = 200) => {
  let s: string;
  try {
    s = typeof v === "string" ? v : JSON.stringify(v);
  } catch {
    s = String(v);
  }
  return (s ?? "undefined").slice(0, n);
};
const isRecord = (v: unknown): v is Record<string, Any> => !!v && typeof v === "object" && !Array.isArray(v);
const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const PMAX = process.env.QC_ALL === "1" ? 99 : 8;
const joinP = (p: string[], ok = "ครบ") => (p.length ? p.slice(0, PMAX).join(" · ") + (p.length > PMAX ? ` …(+${p.length - PMAX})` : "") : ok);
function walk(dir: string, out: string[] = [], re = /\.(tsx|ts)$/): string[] {
  const a = abs(dir);
  if (!existsSync(a)) return out;
  for (const f of readdirSync(a)) {
    const rel = `${dir}/${f}`;
    if (statSync(abs(rel)).isDirectory()) walk(rel, out, re);
    else if (re.test(f)) out.push(rel);
  }
  return out;
}
const stripComments = (s: string) => s.replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1").replace(/\/\*[\s\S]*?\*\//g, "");
function git(args: string[]): string | null {
  try {
    return execFileSync("git", ["-C", ROOT, ...args], { stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 << 20 }).toString("utf8");
  } catch {
    return null;
  }
}
const revOf = (sha: string): string | null => git(["rev-parse", "--verify", "-q", `${sha}^{commit}`])?.trim() || null;
const ancCache = new Map<string, boolean>();
/** a เป็นบรรพบุรุษ (หรือตัวเดียวกัน) ของ b — rev-list a ^b ว่าง ⇔ ทุก commit ของ a อยู่ใน b */
function isAncestorOf(a: string, b: string): boolean {
  const k = `${a}>${b}`;
  if (!ancCache.has(k)) {
    const ra = revOf(a);
    const rb = revOf(b);
    const out = ra && rb ? git(["rev-list", "--max-count=1", ra, `^${rb}`]) : null;
    ancCache.set(k, out !== null && out.trim() === "");
  }
  return ancCache.get(k)!;
}
const subjectOf = (sha: string) => git(["log", "-1", "--format=%s", sha])?.trim() ?? "";
const HEAD8 = (git(["rev-parse", "--short=8", "HEAD"]) ?? "").trim();
const SHA_IN = /`([0-9a-f]{7,40})`/g;
const shasOf = (l: string) => [...l.matchAll(SHA_IN)].map((m) => m[1]!);
const cellsOf = (row: string) => row.split("|").slice(1, -1).map((c) => c.trim());
const unbold = (s: string) => s.replace(/\*\*/g, "").trim();
/** ตาราง markdown ตัวแรกหลังบรรทัดหัวที่ตรง pred → { head, rows } */
function tableAfter(lines: string[], start: number, pred: (cells: string[]) => boolean): { head: string[]; rows: string[][] } | null {
  for (let i = start; i < lines.length; i++) {
    if (!lines[i]!.startsWith("|")) continue;
    const head = cellsOf(lines[i]!).map((c) => unbold(c).toLowerCase());
    if (!pred(head)) continue;
    const rows: string[][] = [];
    for (let j = i + 2; j < lines.length && lines[j]!.startsWith("|"); j++) rows.push(cellsOf(lines[j]!));
    return { head, rows };
  }
  return null;
}
/** เนื้อหาของทุกหัวข้อ (## …) ที่บรรทัดหัวตรง re — แต่ละก้อนถึงหัวข้อ ## ถัดไป */
function sectionsOf(doc: string, re: RegExp): string[] {
  const lines = doc.split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^##\s/.test(lines[i]!) || !re.test(lines[i]!)) continue;
    let j = i + 1;
    while (j < lines.length && !/^##\s/.test(lines[j]!)) j++;
    out.push(lines.slice(i, j).join("\n"));
  }
  return out;
}
const sectionOf = (doc: string, re: RegExp): string => sectionsOf(doc, re)[0] ?? "";

// ═════════════════════════ ค่าคงที่ของสัญญา ═════════════════════════
const F = {
  gates: "scripts/pos-gates.json",
  sweep: "scripts/pos-visual-sweep.json",
  op: "ledger/POS-OWNER-PENDING.md",
  notes: "ledger/wo-notes/pos-P3.12.md",
  parity: "ledger/wo-notes/pos-P3.12-parity.md",
  prep: "ledger/wo-notes/pos-P3.12-prep.md",
  contracts: "ledger/POS-CONTRACTS.md",
  outbox: "src/lib/outbox-consumers.ts",
  integrations: "src/lib/pos-integrations.ts",
  posDoc: "docs/modules/14-pos.md",
  p16: "scripts/qc-pos-p1.6.mts",
  lint: "scripts/pos-oracle-check.sh",
  self: "scripts/qc-pos-p3.12.mts",
};
/** brief §4(a) Tier 1 (หลังรันทดลองเขียวทีละชุด · 9a6f51b5 + ace39ecd) — qc-crm-c2.7 = $pending (prep §(e) มติ 2) */
const TIER1 = [
  "qc-chat-security", "qc-chat-security-scope", "qc-chat-core-v2", "qc-chat-v2-context",
  "qc-meeting-invite",
  "qc-inventory", "qc-inventory-item", "qc-inventory-account",
  "qc-ai-tools", "qc-ai-tools2", "qc-ai-skills", "qc-ai-plan", "qc-ai-proposals", "qc-ai-phase-a", "qc-ai-phase-b1", "qc-ai-schedule", "qc-ai-proactive",
  "qc-money-mapping", "qc-catalog-services", "qc-booking-edit-schedule",
];
const PENDING_SUITE = "qc-crm-c2.7";
/** คลาสแดงของ qc:all ตาม HANDOVER-P2 §2 :55 (CD-P312-O3) */
const QCALL_CLASSES = ["QC4-ONLY", "ACCV2-SEED", "SCHEMA-DRIFT", "CRM-RAWSQL-S9", "SEED-EMPTY", "NEEDS-SERVER", "ACCEPTED"];
/** ใบ U ของ P3 ที่มีจออนุมาน (V3) */
const U_CARDS = ["P3.4U", "P3.5U", "P3.6U", "P3.7U", "P3.8U", "P3.9U", "P3-SKEL U"];
/** แถว §1 ของ HANDOVER-P3 (H1 · brief §4 H1 — ไม่รวม P3.12 เอง) */
const P3_CARDS = ["HF-FU2", "P3.5", "P3.4", "P3.9", "P3.8", "P3.7", "P3.5U", "P3.4U", "P3.6", "P3-SKEL", "P3.9U", "P3.7U", "P3.8U", "P3.6U", "P3-SKEL U"];
const BUCKETS = ["P3.12", "P4", "P5", "P6", "OP", "S follow-up card"];
const K2_MODULES = ["Chat", "CRM", "platform/payment", "app-shell", "settings/staff"];
const K2_P34_FILES = ["core/permissions.ts", "api-keys/scopes.ts", "kds.ts"];
const CTRL_TODO = "⟨controller⟩";

// ═════════════════════════ อินพุต (อ่านครั้งเดียว · self-test แก้สำเนา) ═════════════════════════
type Inputs = {
  manifest: Any;
  manifestErr: string;
  qcFiles: string[];
  op: string;
  notes: string;
  parity: string;
  sweep: Any;
  handoverName: string;
  handover: string;
  prep: string;
  contracts: string;
  outbox: string;
  integrations: string;
  posDoc: string;
  p16: string;
  posActionFiles: string[];
  p3Suites: { name: string; src: string }[];
  laneFiles: { name: string; src: string }[];
  selfSrc: string;
  porcelainBefore: string;
  porcelainAfter: string;
};
function readJson(p: string): { v: Any; err: string } {
  const raw = rd(p);
  if (!raw) return { v: null, err: `ไม่มี ${p}` };
  try {
    return { v: JSON.parse(raw), err: "" };
  } catch (e) {
    return { v: null, err: `${p} ไม่ใช่ JSON: ${(e as Error).message.slice(0, 60)}` };
  }
}
function loadInputs(): Inputs {
  const man = readJson(F.gates);
  const sw = readJson(F.sweep);
  const scripts = existsSync(abs("scripts")) ? readdirSync(abs("scripts")) : [];
  const hs = existsSync(abs("ledger")) ? readdirSync(abs("ledger")).filter((f) => /^HANDOVER-2026-10-\d\d-POS-P3\.md$/.test(f)).sort() : [];
  const p3 = scripts.filter((f) => /^qc-pos-p3[\w.-]*\.mts$/.test(f)).sort();
  const lanes = scripts.filter((f) => /^qc-(pos|hf)-[\w.-]+\.mts$/.test(f)).sort();
  return {
    manifest: man.v,
    manifestErr: man.err,
    qcFiles: scripts.filter((f) => /^qc-(pos|hf)-.*\.mts$/.test(f)).map((f) => f.replace(/\.mts$/, "")),
    op: rd(F.op),
    notes: rd(F.notes),
    parity: rd(F.parity),
    sweep: sw.v,
    handoverName: hs[hs.length - 1] ?? "",
    handover: hs.length ? rd(`ledger/${hs[hs.length - 1]}`) : "",
    prep: rd(F.prep),
    contracts: rd(F.contracts),
    outbox: rd(F.outbox),
    integrations: rd(F.integrations),
    posDoc: rd(F.posDoc),
    p16: rd(F.p16),
    posActionFiles: walk("src/lib").filter((f) => /^src\/lib\/pos-[\w-]*actions[\w-]*\.tsx?$/.test(f)),
    p3Suites: p3.map((f) => ({ name: f.replace(/\.mts$/, ""), src: rd(`scripts/${f}`) })),
    laneFiles: lanes.map((f) => ({ name: f.replace(/\.mts$/, ""), src: rd(`scripts/${f}`) })),
    selfSrc: rd(F.self),
    porcelainBefore: "",
    porcelainAfter: "",
  };
}

// ═════════════════════════ ข้อสอบ (ฟังก์ชันบริสุทธิ์ของอินพุต → รายการปัญหา) ═════════════════════════
const suitesOf = (inp: Inputs): Any[] => (Array.isArray(inp.manifest?.suites) ? inp.manifest.suites : []);
const namesOf = (inp: Inputs): string[] => suitesOf(inp).map((s) => String(s?.suite ?? ""));
const acceptedRows = (inp: Inputs): { name: string; a: Any }[] => [
  ...suitesOf(inp).filter((s) => s?.accepted !== undefined).map((s) => ({ name: String(s.suite), a: s.accepted })),
  ...(Array.isArray(inp.manifest?.commands) ? inp.manifest.commands : []).filter((c: Any) => c?.accepted !== undefined).map((c: Any) => ({ name: String(c.name), a: c.accepted })),
];

function checkG1(inp: Inputs): string[] {
  const p: string[] = [];
  if (inp.manifestErr) return [inp.manifestErr];
  const names = namesOf(inp);
  const missPos = inp.qcFiles.filter((f) => !names.includes(f));
  if (missPos.length) p.push(`qc-pos/qc-hf ขาด ${missPos.length}: ${missPos.slice(0, 6).join(",")}`);
  const missT1 = TIER1.filter((s) => !names.includes(s));
  if (missT1.length) p.push(`Tier 1 ขาด ${missT1.length}: ${missT1.join(",")}`);
  return p;
}
const ST_ID = /(^|[-.])ST\d+[a-z]?$/;
function checkG2(inp: Inputs): string[] {
  const p: string[] = [];
  for (const { name, a } of acceptedRows(inp)) {
    const ids: string[] = Array.isArray(a?.checks) ? a.checks.map(String) : [];
    const st = ids.filter((x) => ST_ID.test(x));
    if (st.length) p.push(`${name} ยอมหมุดเลน ${st.join(",")}`);
  }
  return p;
}
function checkG3(inp: Inputs): string[] {
  const p: string[] = [];
  for (const { name, a } of acceptedRows(inp)) {
    if (!isRecord(a)) {
      p.push(`${name} accepted ไม่ใช่วัตถุ`);
      continue;
    }
    if (typeof a.reason !== "string" || a.reason.length < 10) p.push(`${name} ไม่มี reason`);
    if (typeof a.owner !== "string" || !a.owner) p.push(`${name} ไม่มี owner`);
    if (typeof a.opRef !== "string" || !a.opRef || !inp.op.includes(a.opRef)) p.push(`${name} opRef "${short(a.opRef, 40)}" ไม่พบใน OP`);
    const ids: string[] = Array.isArray(a.checks) ? a.checks.map(String) : [];
    if (!ids.length) p.push(`${name} ไม่มี checks`);
    if (ids.some((x) => x === "CRASH" || /-ERR$/.test(x)) && (typeof a.match !== "string" || !a.match)) p.push(`${name} มี CRASH/-ERR แต่ไม่มี match`);
  }
  return p;
}
function checkG4(inp: Inputs): string[] {
  const p: string[] = [];
  if (inp.manifestErr) return [inp.manifestErr];
  if (namesOf(inp).includes(PENDING_SUITE)) p.push(`${PENDING_SUITE} อยู่ใน suites (ต้องรอ triage — มติ (e)2)`);
  const pend: Any[] = Array.isArray(inp.manifest?.$pending) ? inp.manifest.$pending : [];
  if (!Array.isArray(inp.manifest?.$pending)) p.push("pos-gates.json ไม่มี $pending (อาร์เรย์)");
  const row = pend.find((x) => x?.suite === PENDING_SUITE);
  if (!row) p.push(`$pending ไม่มี ${PENDING_SUITE}`);
  else {
    if (row.state !== "pending-triage") p.push(`state ${short(row.state, 30)} (คาด pending-triage)`);
    if (typeof row.reason !== "string" || row.reason.length < 10) p.push("ไม่มี reason");
    if (typeof row.triage !== "string" || !/F-P3-\d\d/.test(row.triage)) p.push("ไม่มี triage F-P3-xx");
    if (typeof row.opRef !== "string" || !row.opRef || !inp.op.includes(row.opRef)) p.push(`opRef "${short(row.opRef, 40)}" ไม่พบใน OP`);
  }
  for (const x of pend) if (typeof x?.suite !== "string" || !ex(`scripts/${x.suite}.mts`)) p.push(`$pending ชี้ไฟล์ที่ไม่มี ${short(x?.suite, 40)}`);
  return p;
}
function qcallSection(notes: string): string {
  return sectionOf(notes, /^##\s*§?\s*qcall\b/i);
}
function checkX1(inp: Inputs): string[] {
  const p: string[] = [];
  if (!inp.notes) return [`ไม่มี ${F.notes}`];
  const sec = qcallSection(inp.notes);
  if (!sec) return [`${F.notes} ไม่มีหัวข้อ ## §qcall`];
  const head = /^\s*-\s*head:\s*`([0-9a-f]{7,40})`/m.exec(sec)?.[1];
  if (!head) p.push("ไม่มีบรรทัด - head: `<sha>`");
  else {
    if (!revOf(head)) p.push(`head ${head} ไม่มีในทรี`);
    else {
      if (!isAncestorOf(PIN, head)) p.push(`head ${head} เก่ากว่า PIN ${PIN}`);
      if (!isAncestorOf(head, "HEAD")) p.push(`head ${head} ไม่ใช่บรรพบุรุษของ HEAD`);
    }
  }
  const br = /^\s*-\s*branch:\s*`([^`]+)`/m.exec(sec)?.[1];
  if (!br) p.push("ไม่มีบรรทัด - branch: `<neon branch>`");
  const res = /^\s*-\s*result:\s*(\d+)\s*\/\s*(\d+)/m.exec(sec);
  if (!res) p.push("ไม่มีบรรทัด - result: <passed>/<total>");
  const t = tableAfter(sec.split("\n"), 0, (h) => h.includes("class") && h.includes("count") && h.includes("ref"));
  if (!t) p.push("ไม่มีตาราง | class | count | ref |");
  else if (res) {
    const ci = t.head.indexOf("class");
    const ni = t.head.indexOf("count");
    const ri = t.head.indexOf("ref");
    let sum = 0;
    for (const r of t.rows) {
      const cls = unbold(r[ci] ?? "");
      const n = Number(unbold(r[ni] ?? ""));
      const ref = r[ri] ?? "";
      if (!Number.isFinite(n)) p.push(`count ไม่ใช่ตัวเลข: ${short(r.join("|"), 50)}`);
      else sum += n;
      if (!QCALL_CLASSES.includes(cls) && !/\bCD-[A-Z0-9][\w-]*/.test(`${cls} ${ref}`)) p.push(`คลาสใหม่ไม่มี CD-*: ${short(cls, 30)}`);
    }
    const passed = Number(res[1]);
    const total = Number(res[2]);
    if (passed > total) p.push(`passed ${passed} > total ${total}`);
    if (sum !== total - passed) p.push(`Σcount ${sum} ≠ total − passed ${total - passed}`);
  }
  return p;
}
function checkX2(inp: Inputs): string[] {
  const sec = qcallSection(inp.notes);
  if (!sec) return [`ไม่มี §qcall ใน ${F.notes}`];
  return /ลบ QC7/.test(sec) ? [] : ["§qcall ไม่มีบรรทัด \"ลบ QC7\""];
}
function checkV1(inp: Inputs): string[] {
  const p: string[] = [];
  const runs: Any[] = Array.isArray(inp.sweep?.runs) ? inp.sweep.runs : [];
  if (!inp.sweep) return [`อ่าน ${F.sweep} ไม่ได้`];
  for (const wo of ["p3.6u", "p3-skel-u"]) {
    const th = runs.filter((r) => r?.wo === wo && Array.isArray(r?.locales) && r.locales.length === 1 && r.locales[0] === "th");
    const en = runs.filter((r) => r?.wo === `${wo}-en` && Array.isArray(r?.locales) && r.locales.length === 1 && r.locales[0] === "en");
    const real = (r: Any) => !/placeholder/i.test(String(r?.why ?? "")) && r?.states === true && Array.isArray(r?.pages) && r.pages.length > 0;
    const thReal = th.filter((r) => real(r) && /vis-[\w-]+-qc5-\d{8}T\d{6}Z/.test(String(r.why)) && /\b(\d+)\/\1\b/.test(String(r.why)));
    if (!thReal.length) p.push(`${wo} ไม่มีแถว th จริง (รอบ vis-…-qc5 + N/N)`);
    if (!en.filter(real).length) p.push(`${wo}-en ไม่มีแถว en จริง`);
    if (runs.some((r) => (r?.wo === wo || r?.wo === `${wo}-en`) && /placeholder/i.test(String(r?.why ?? "")))) p.push(`${wo} ยังมีแถว placeholder`);
  }
  return p;
}
const CITES_RULING = /\bW\d{1,2}\b|\bCD-[A-Z0-9][\w-]*|มติ\s*\S|ruling\s*\S/i;
function checkV2(inp: Inputs): string[] {
  const p: string[] = [];
  if (!inp.parity) return [`ไม่มี ${F.parity}`];
  const t = tableAfter(inp.parity.split("\n"), 0, (h) => h.includes("status"));
  if (!t) return ["ไม่มีตารางที่มีคอลัมน์ status"];
  const si = t.head.indexOf("status");
  if (!t.rows.length) p.push("ตารางไม่มีแถว");
  let open = 0;
  for (const r of t.rows) {
    const c = unbold(r[si] ?? "");
    if (/^OPEN\b/i.test(c)) open++;
    else if (/^DEVIATION\b/i.test(c)) {
      if (!CITES_RULING.test(r.join(" | "))) p.push(`DEVIATION ไม่อ้างมติ/W: ${short(r.join("|"), 60)}`);
    } else if (!/^(MATCH|CTRL)\b/i.test(c)) p.push(`สถานะแปลก "${short(c, 30)}"`);
  }
  if (open) p.push(`OPEN ${open} แถว`);
  return p;
}
const wRows = (op: string) => op.split("\n").filter((l) => /^\|\s*W\d+\s*\|/.test(l));
function checkV3(inp: Inputs): string[] {
  const rows = wRows(inp.op);
  return U_CARDS.filter((c) => !rows.some((l) => new RegExp(`(^|[^\\w.-])${escRe(c)}(?![\\w.])`).test(l))).map((c) => `${c} ไม่มีแถว W ใน OP`);
}
function checkH1(inp: Inputs): string[] {
  const p: string[] = [];
  if (!inp.handover) return ["ยังไม่มี ledger/HANDOVER-2026-10-xx-POS-P3.md"];
  const doc = inp.handover;
  for (let k = 0; k <= 8; k++) if (!new RegExp(`^##\\s*§\\s*${k}(?![0-9])`, "m").test(doc)) p.push(`ไม่มีหัวข้อ ## §${k}`);
  const sec1 = sectionOf(doc, /^##\s*§\s*1(?![0-9])/);
  const rows = sec1.split("\n").filter((l) => l.startsWith("|")).map((l) => ({ l, id: unbold(cellsOf(l)[0] ?? "") }));
  for (const id of P3_CARDS) {
    const r = rows.filter((x) => x.id === id);
    if (!r.length) {
      p.push(`${id} ไม่มีแถวใน §1`);
      continue;
    }
    const shas = r.flatMap((x) => shasOf(x.l));
    if (!shas.length) p.push(`${id} ไม่มี SHA`);
    const bad = shas.filter((s) => !isAncestorOf(s, "HEAD"));
    if (bad.length) p.push(`${id} SHA ไม่ใช่บรรพบุรุษ: ${bad.join(",")}`);
  }
  return p;
}
function checkH2(inp: Inputs): string[] {
  const p: string[] = [];
  const keys = [...new Set([...inp.outbox.matchAll(/^\s*"(pos\.[\w.]+)"\s*:/gm)].map((m) => m[1]!))];
  if (!keys.length) p.push("อ่านคีย์ pos.* ของ outbox-consumers.ts ไม่ได้");
  const doc = inp.contracts;
  const at = doc.search(/\n## Event/);
  const nx = at < 0 ? -1 : doc.indexOf("\n## ", at + 4);
  const sec = at < 0 ? "" : doc.slice(at + 1, nx < 0 ? doc.length : nx);
  if (!sec) p.push("POS-CONTRACTS.md ไม่มีหัวข้อ ## Event");
  const listed = new Set<string>();
  for (const l of sec.split("\n").filter((x) => x.startsWith("|"))) {
    const cell = (l.split("|")[1] ?? "").replace(/~~[^~]*~~/g, "");
    for (const m of cell.matchAll(/`(pos\.[\w./]+)`/g)) {
      const parts = m[1]!.split("/");
      const first = parts[0]!;
      listed.add(first);
      const pre = first.slice(0, first.lastIndexOf(".") + 1);
      for (const rest of parts.slice(1)) listed.add(rest.startsWith("pos.") ? rest : pre + rest);
    }
  }
  const miss = keys.filter((k) => !listed.has(k));
  if (miss.length) p.push(`ตาราง event ขาด ${miss.length}: ${miss.join(",")}`);
  return p;
}
type TriRow = { id: string; source: string; bucket: string; anchor: string; raw: string };
function triageRows(doc: string, sectionRe: RegExp | null): TriRow[] | null {
  const src = sectionRe ? sectionOf(doc, sectionRe) : doc;
  if (!src) return null;
  const t = tableAfter(src.split("\n"), 0, (h) => h[0] === "id" && h.includes("bucket"));
  if (!t) return null;
  const bi = t.head.indexOf("bucket");
  const si = t.head.findIndex((h) => h.startsWith("source"));
  const ai = t.head.findIndex((h) => h.startsWith("op anchor"));
  return t.rows.map((r) => ({ id: unbold(r[0] ?? ""), source: r[si] ?? "", bucket: unbold(r[bi] ?? ""), anchor: ai < 0 ? "" : r[ai] ?? "", raw: r.join(" | ") }));
}
/** anchor ของแถว OP ต้องชี้สิ่งที่มีจริงใน OP: W-id (แถวตาราง) หรือ §<หัวข้อ> (มีบรรทัด ## ที่มีคำนั้น) */
function anchorProblems(anchor: string, op: string): string[] {
  const p: string[] = [];
  const ws = [...anchor.matchAll(/\bW(\d{1,2})\b/g)].map((m) => `W${m[1]}`);
  const ss = [...anchor.matchAll(/§\s*([A-Za-z][\w/.-]*|รอคำตอบ)/g)].map((m) => m[1]!.replace(/[.)]+$/, ""));
  if (!ws.length && !ss.length) return ["ไม่มี W-id หรือ §หัวข้อ"];
  const heads = op.split("\n").filter((l) => /^##\s/.test(l));
  const rows = wRows(op);
  for (const w of ws) if (!rows.some((l) => new RegExp(`^\\|\\s*${w}\\s*\\|`).test(l))) p.push(`${w} ไม่มีใน OP`);
  for (const s of ss) if (!heads.some((h) => h.includes(s))) p.push(`§${s} ไม่มีหัวข้อใน OP`);
  return p;
}
function checkH3(inp: Inputs): string[] {
  const p: string[] = [];
  if (!inp.handover) return ["ยังไม่มี HANDOVER-P3"];
  const rows = triageRows(inp.handover, /^##\s*§\s*4(?![0-9])/);
  if (!rows) return ["HANDOVER §4 ไม่มีตาราง | id | … | bucket | …"];
  for (const r of rows) {
    if (!BUCKETS.includes(r.bucket)) p.push(`${r.id} bucket "${short(r.bucket, 24)}"`);
    if (r.bucket === "OP") {
      const ap = anchorProblems(r.anchor, inp.op);
      if (ap.length) p.push(`${r.id} OP anchor: ${ap.join(",")}`);
    }
  }
  return p;
}
function checkH4(inp: Inputs): string[] {
  if (!inp.handover) return ["ยังไม่มี HANDOVER-P3"];
  const n = inp.handover.split(CTRL_TODO).length - 1;
  return n ? [`${CTRL_TODO} ค้าง ${n} จุด`] : [];
}
function checkT1(inp: Inputs): string[] {
  const p: string[] = [];
  if (!inp.handover) return ["ยังไม่มี HANDOVER-P3 §4"];
  const rows = triageRows(inp.handover, /^##\s*§\s*4(?![0-9])/);
  if (!rows || !rows.length) return ["HANDOVER §4 ไม่มีแถว triage"];
  const ids = rows.map((r) => r.id);
  const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
  if (dup.length) p.push(`id ซ้ำ ${[...new Set(dup)].join(",")}`);
  const prep = triageRows(inp.prep, null) ?? [];
  if (!prep.length) p.push("อ่านตาราง triage ของ prep ไม่ได้");
  const miss = prep.map((r) => r.id).filter((x) => !ids.includes(x));
  if (miss.length) p.push(`ขาดแถวจาก prep ${miss.length}: ${miss.slice(0, 6).join(",")}`);
  const noB = rows.filter((r) => !r.bucket);
  if (noB.length) p.push(`ไม่มี bucket ${noB.length}: ${noB.slice(0, 6).map((r) => r.id).join(",")}`);
  if (!rows.some((r) => /P3-SKEL-U/.test(r.source))) p.push("ยังไม่มีแถวจาก P3-SKEL U (มติ (e)4: ปิดตารางหลัง SKEL-U merge)");
  return p;
}
const PHASE_CLOSED = /^P3(\.\d+|\.x)?$/;
function checkK1(inp: Inputs): string[] {
  const at = inp.integrations.indexOf("const FACTS");
  if (at < 0) return ["ไม่พบ const FACTS ใน pos-integrations.ts"];
  const end = inp.integrations.indexOf("\n};", at);
  const block = stripComments(inp.integrations.slice(at, end < 0 ? undefined : end));
  const facts = [...block.matchAll(/\[\s*"(\w+)"\s*,\s*(true|false)\s*,\s*(null|"([^"]*)")\s*\]/g)].map((m) => ({ key: m[1]!, live: m[2] === "true", label: m[4] ?? null }));
  if (!facts.length) return ["อ่าน facts ไม่ได้"];
  return facts.filter((f) => !f.live && f.label !== null && PHASE_CLOSED.test(f.label)).map((f) => `${f.key} "${f.label}"`);
}
function checkK2(inp: Inputs): string[] {
  const p: string[] = [];
  for (const m of K2_MODULES) {
    const secs = sectionsOf(inp.op, new RegExp(`^##\\s*แจ้งเจ้าของโมดูล\\s+${escRe(m)}(?![\\w/-])`));
    if (!secs.length) p.push(`ไม่มีหัวข้อ ## แจ้งเจ้าของโมดูล ${m}`);
    else if (!secs.some((sec) => /^\s*-\s*\(P3/m.test(sec))) p.push(`หัวข้อ ${m} ไม่มีบรรทัด (P3…)`);
    if (!new RegExp(`§"แจ้งเจ้าของ(?:โมดูล)?\\s*${escRe(m)}"`).test(inp.op)) p.push(`ไม่มี anchor §"แจ้งเจ้าของ… ${m}"`);
  }
  const p34 = inp.op.split("\n").filter((l) => /^\s*-\s*\(P3\.4\b/.test(l));
  for (const f of K2_P34_FILES) if (!p34.some((l) => l.includes(f))) p.push(`ไม่มีบรรทัด (P3.4 …) ของ ${f}`);
  return p;
}
function checkK3(inp: Inputs): string[] {
  if (!inp.posDoc) return [`ไม่มี ${F.posDoc}`];
  const head = inp.posDoc.split("\n").slice(0, 6).filter((l) => l.startsWith(">"));
  return head.some((l) => /HANDOVER-P3|HANDOVER-2026-10-\d\d-POS-P3/.test(l)) ? [] : ["บรรทัด > หัวไฟล์ยังไม่ชี้ HANDOVER-P3"];
}
function checkO1(inp: Inputs): string[] {
  const p: string[] = [];
  const src = stripComments(inp.p16);
  if (!src) return [`ไม่มี ${F.p16}`];
  const m = /walk\(\s*"src\/lib"\s*\)\s*\.filter\(\s*\(\s*\w+\s*\)\s*=>\s*\/((?:\\\/|[^/\n])+)\/([a-z]*)\.test\(/.exec(src);
  if (!m) return ["R2 ไม่มี walk(\"src/lib\").filter(/…pos-…actions…/) — ไฟล์ action นอก modules/pos ไม่ถูกสแกน"];
  let re: RegExp;
  try {
    re = new RegExp(m[1]!, m[2]);
  } catch {
    return [`regex ของ R2 คอมไพล์ไม่ได้: ${short(m[1], 60)}`];
  }
  if (!inp.posActionFiles.length) p.push("ไม่พบ src/lib/pos-*actions*.ts เลย (คาด ≥ 3)");
  const miss = inp.posActionFiles.filter((f) => !re.test(f));
  if (miss.length) p.push(`R2 ไม่ครอบ ${miss.join(",")}`);
  return p;
}
type LintRow = { suite: string; verdict: string; reds: string[]; rc: number | null };
const lintRows: LintRow[] = [];
function runLint(inp: Inputs): LintRow[] {
  if (lintRows.length) return lintRows;
  for (const s of inp.p3Suites) {
    const r = spawnSync("bash", [abs(F.lint), ROOT, s.name, "--base", HEAD8 || "HEAD"], { cwd: ROOT, encoding: "utf8", timeout: 120_000, env: { ...process.env, CI: "" } });
    const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
    const verdict = /VERDICT\s+(green|warn|red)/.exec(out)?.[1] ?? "none";
    const reds = out.split("\n").filter((l) => /\bRED\s+O\d+/.test(l)).map((l) => (/RED\s+(O\d+)/.exec(l)?.[1] ?? "?"));
    lintRows.push({ suite: s.name, verdict, reds, rc: r.status });
  }
  return lintRows;
}
function checkO2(inp: Inputs): string[] {
  if (!ex(F.lint)) return [`ไม่มี ${F.lint}`];
  if (!inp.p3Suites.length) return ["ไม่พบ scripts/qc-pos-p3*.mts"];
  return runLint(inp).filter((r) => r.verdict !== "green" && r.verdict !== "warn").map((r) => `${r.suite} ${r.verdict}${r.reds.length ? ` (${r.reds.join(",")})` : ""}`);
}
const LANE_ENV = /const\s+(LANE_PIN|LANE_REV)\s*=\s*process\.env\.(\w+)\s*\|\|/;
function checkO3(inp: Inputs): string[] {
  if (!inp.p3Suites.length) return ["ไม่พบ scripts/qc-pos-p3*.mts"];
  return inp.p3Suites.filter((s) => !LANE_ENV.test(stripComments(s.src))).map((s) => `${s.name} ไม่มีหมุดเลน env-override`);
}
type PinRow = { suite: string; name: string; env: string | null; sha: string | null; alias: string | null; status: string };
function lanePins(inp: Inputs): PinRow[] {
  const out: PinRow[] = [];
  for (const f of inp.laneFiles) {
    const src = stripComments(f.src);
    for (const m of src.matchAll(/^const\s+(LANE_PIN|LANE_REV)\s*=\s*([^;\n]+)/gm)) {
      const rhs = m[2]!.trim();
      const env = /process\.env\.(\w+)/.exec(rhs)?.[1] ?? null;
      const sha = /"([0-9a-f]{7,40})"/.exec(rhs)?.[1] ?? null;
      const alias = !sha ? (/\|\|\s*(\w+)\s*$/.exec(rhs)?.[1] ?? rhs) : null;
      let status: string;
      if (!sha) status = `alias ${alias} (ไม่ใช่หมุดค่าคงที่ — ไม่นับ)`;
      else if (!revOf(sha)) status = "ไม่มีในทรี";
      else if (revOf(sha) === revOf(LANE_PIN)) status = "= LANE_PIN";
      else if (isAncestorOf(LANE_PIN, sha) && isAncestorOf(sha, "HEAD")) status = `ใหม่กว่า (${/re-?pin|CD-RP/i.test(subjectOf(sha)) ? "commit re-pin" : "commit บน session/pos"})`;
      else status = "ก่อน LANE_PIN (ยังไม่ตรึง)";
      out.push({ suite: f.name, name: m[1]!, env, sha, alias, status });
    }
  }
  return out;
}
function checkO4(inp: Inputs): string[] {
  if (!revOf(LANE_PIN)) return [`LANE_PIN ${LANE_PIN} ไม่มีในทรี`];
  const pins = lanePins(inp);
  if (!pins.length) return ["ไม่พบหมุดเลนเลย"];
  return pins.filter((r) => r.sha && !/^= LANE_PIN|^ใหม่กว่า/.test(r.status)).map((r) => `${r.suite} ${r.name} ${r.sha} ${r.status}`);
}
const DB_IMPORT = new RegExp(`^\\s*import[^;]*from\\s*["'](${["@prisma", "/client"].join("")}|@/lib/${"prisma"}|pg|postgres)["']`, "m");
const DB_ENV = new RegExp(["process", "env", "DATABASE_URL"].join("\\."));
function checkZ1(inp: Inputs): string[] {
  const p: string[] = [];
  if (!inp.selfSrc) p.push(`อ่าน ${F.self} ไม่ได้`);
  if (DB_IMPORT.test(inp.selfSrc)) p.push("ชุดนี้ import ไคลเอนต์ฐานข้อมูล");
  if (DB_ENV.test(inp.selfSrc)) p.push("ชุดนี้อ่าน env ฐานข้อมูล");
  if (inp.porcelainBefore !== inp.porcelainAfter) p.push(`git status เปลี่ยนระหว่างรัน: ${short(inp.porcelainAfter, 80)}`);
  return p;
}

const RUNNERS: Record<string, (inp: Inputs) => string[]> = {
  G1: checkG1, G2: checkG2, G3: checkG3, G4: checkG4, X1: checkX1, X2: checkX2, V1: checkV1, V2: checkV2, V3: checkV3,
  H1: checkH1, H2: checkH2, H3: checkH3, H4: checkH4, K1: checkK1, K2: checkK2, K3: checkK3,
  O1: checkO1, O2: checkO2, O3: checkO3, O4: checkO4, T1: checkT1, Z1: checkZ1,
};
for (const [id] of CHECKS) if (!RUNNERS[id.slice(PFX.length + 1)]) throw new Error(`ไม่มีตัวตรวจของ ${id}`);

// ═════════════════════════ --self-test: พลิกข้อที่เขียวโดยออกแบบ ═════════════════════════
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
function mutations(base: Inputs): Record<string, { what: string; inp: Inputs }[]> {
  const m = (what: string, f: (x: Inputs) => void) => {
    const x: Inputs = { ...base, manifest: clone(base.manifest), sweep: clone(base.sweep), qcFiles: [...base.qcFiles], posActionFiles: [...base.posActionFiles] };
    f(x);
    return { what, inp: x };
  };
  const firstAcc = (x: Inputs) => suitesOf(x).find((s) => isRecord(s?.accepted) && Array.isArray(s.accepted.checks) && s.accepted.checks.includes("CRASH"));
  return {
    G1: [
      m("ลบ qc-pos-p3.6 ออกจาก suites", (x) => (x.manifest.suites = suitesOf(x).filter((s) => s.suite !== "qc-pos-p3.6"))),
      m("ลบ Tier 1 qc-ai-plan ออกจาก suites", (x) => (x.manifest.suites = suitesOf(x).filter((s) => s.suite !== "qc-ai-plan"))),
      m("มีไฟล์ qc-hf-ghost ที่ไม่อยู่ในแผน", (x) => x.qcFiles.push("qc-hf-ghost")),
    ],
    G2: [m("accepted ของ qc-pos-p3.7 ยอม P3.7-ST3", (x) => {
      const s = suitesOf(x).find((y) => y.suite === "qc-pos-p3.7");
      if (s) s.accepted = { reason: "W21 hot-file pin", owner: "pos", opRef: "W21", checks: ["P3.7-ST3"] };
    })],
    G3: [
      m("accepted CRASH ไม่มี match", (x) => {
        const s = firstAcc(x);
        if (s) delete s.accepted.match;
      }),
      m("opRef ไม่มีใน OP", (x) => {
        const s = firstAcc(x);
        if (s) s.accepted.opRef = "ไม่มีบรรทัดนี้ใน OP 9f3c";
      }),
    ],
    V1: [
      m("ลบแถว p3-skel-u-th", (x) => (x.sweep.runs = (x.sweep.runs as Any[]).filter((r) => r.id !== "p3-skel-u-th"))),
      m("แถว p3.6u-th เป็น placeholder", (x) => {
        const r = (x.sweep.runs as Any[]).find((y) => y.id === "p3.6u-th");
        if (r) r.why = "P3.6U states · placeholder until the controller's QC5 round";
      }),
    ],
    H2: [m("outbox มีคีย์ pos.ghost.event ที่ตารางไม่มี", (x) => (x.outbox = `${x.outbox}\n  "pos.ghost.event": [],\n`))],
    O1: [
      m("p1.6 ไม่มีบรรทัด walk(src/lib)", (x) => (x.p16 = x.p16.replace(/walk\("src\/lib"\)/g, 'walk("src/lib/modules/pos")'))),
      m("มีไฟล์ src/lib/pos-ghost.actions.ts ที่ regex ไม่ครอบ", (x) => x.posActionFiles.push("src/lib/pos-ghost.actions.ts")),
    ],
    Z1: [
      m("ไฟล์ข้อสอบ import ไคลเอนต์ฐานข้อมูล", (x) => (x.selfSrc = `import { PrismaClient } from "${["@prisma", "/client"].join("")}";\n${x.selfSrc}`)),
      m("git status เปลี่ยน", (x) => (x.porcelainAfter = `${x.porcelainAfter}?? scripts/leftover.json\n`)),
    ],
  };
}

// ═════════════════════════ รัน ═════════════════════════
const TITLE = new Map(CHECKS.map(([id, , t]) => [id, t]));
const results = new Map<string, { ok: boolean; actual: string }>();
function chk(id: string, problems: string[]): void {
  const full = `${PFX}-${id}`;
  if (!TITLE.has(full)) throw new Error(`ข้อสอบเรียก id ที่ไม่ได้ลงทะเบียน: ${full}`);
  const ok = problems.length === 0;
  results.set(full, { ok, actual: joinP(problems) });
  console.log(`  ${ok ? "✅" : "❌"} [${full}] ${TITLE.get(full)?.slice(0, 110)}${ok ? "" : ` — ${joinP(problems)}`}`);
}
const porcelain = () => git(["status", "--porcelain"]) ?? "<git status ล้ม>";
console.log(`${SUITE} · HEAD ${HEAD8} · PIN ${PIN} · LANE_PIN ${LANE_PIN}${NODB ? " · --no-db (ทุกข้อสถิตอยู่แล้ว)" : ""}${SELFTEST ? " · --self-test" : ""}`);
const before = porcelain();
const INP = loadInputs();
INP.porcelainBefore = before;

if (SELFTEST) {
  INP.porcelainAfter = before;
  const muts = mutations(INP);
  const st: { id: string; base: boolean; what: string; red: boolean }[] = [];
  for (const id of GREEN_BY_DESIGN) {
    const baseOk = RUNNERS[id]!(INP).length === 0;
    for (const { what, inp } of muts[id] ?? []) {
      const red = RUNNERS[id]!(inp).length > 0;
      st.push({ id, base: baseOk, what, red });
      console.log(`  ${red ? "✅" : "❌"} SELFTEST [${PFX}-${id}] ฐาน ${baseOk ? "เขียว" : "แดง"} · ${what} → ${red ? "แดง (ถูก)" : "ยังเขียว (ข้อสอบอ่อน)"}`);
    }
    if (!(muts[id] ?? []).length) st.push({ id, base: baseOk, what: "ไม่มีตัวพลิก", red: false });
  }
  const weak = st.filter((x) => !x.red);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, mode: "self-test", total: st.length, passed: st.length - weak.length, failed: weak.map((x) => `${x.id}:${x.what}`), skipped: false })}`);
  process.exit(weak.length ? 1 : 0);
}

for (const [full] of CHECKS) {
  const id = full.slice(PFX.length + 1);
  if (id === "Z1") continue;
  try {
    chk(id, RUNNERS[id]!(INP));
  } catch (e) {
    chk(id, [`harness throw: ${String((e as Error)?.message ?? e).slice(0, 160)}`]);
  }
}
// ตารางประกอบโน้ต (lint ต่อชุด · หมุดเลน) — พิมพ์ทุกรอบ
for (const r of runLint(INP)) console.log(`  LINT ${r.suite}\t${r.verdict}\t${r.reds.join(",") || "-"}`);
for (const r of lanePins(INP)) console.log(`  LANEPIN ${r.suite}\t${r.name}\t${r.env ?? "-"}\t${r.sha ?? "-"}\t${r.status}`);
INP.porcelainAfter = porcelain();
chk("Z1", checkZ1(INP));

const failed = [...results.entries()].filter(([, r]) => !r.ok).map(([id]) => id);
console.log(`\n===== ${SUITE} ===== ผ่าน ${results.size - failed.length}/${results.size}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, mode: NODB ? "no-db" : "static", total: results.size, passed: results.size - failed.length, failed, skipped: false, head: HEAD8, pin: PIN, lanePin: LANE_PIN, residue: INP.porcelainBefore === INP.porcelainAfter ? 0 : 1 })}`);
process.exit(failed.length ? 1 : 0);
