// QC — POS RUN ใบ P4.2: ข้อสอบสรุปผลของตัวกดทุกปุ่ม (scripts/qc-pos-buttons.mts) — ผู้เขียนตัวกด บัญชี B · 22 ต.ค. 2026
//   ข้อสอบสถิตล้วน: อ่าน .qc-shots/pos/buttons/summary-<user>-<device>[-en].json ของทุกช่องในตารางผ่าน + ทะเบียน + ข้อสอบ P4.1 ·
//   ไม่แตะ DB · ไม่เปิดเบราว์เซอร์ · ไม่เขียนไฟล์ในทรี (W10 เรียกตัวกด --list / โหมดด่าน ซึ่งอ่านอย่างเดียว)
//   requires: (ไม่มี seed — สรุปของรอบตัวกดเป็น CONTROLLER-RUN บนทรี d · QC5)
//
// สัญญา: ledger/pos-briefs/pos-brief-P4.md §4 (P4.2 W1–W6 · นโยบายเงิน ⚠️6) · §10 มติ 4 5 6 7 9 + addendum (W29 W30) ·
//        prompt ledger/pos-briefs/pos-prompt-accountB-P4.2-WALKER.md · โน้ต ledger/wo-notes/pos-P4.2-walker.md (CD-P42-W1…)
// แดงก่อนสร้าง: ยังไม่มีสรุปเลย ⇒ W1–W9 แดง (ไม่มีอะไรพิสูจน์) · W10/Z1 เขียว — ผู้คุมรันตัวกดครบ 19 ช่องแล้วข้อนี้จึงเขียวได้
// 🔴 ทุกข้อพิสูจน์ตัวเองว่าแดงได้ (probe): ชุดสรุปสังเคราะห์ที่ "ผ่านทุกข้อ" สร้างจากแผนของตัวกด (positive control — ข้อนั้นต้องเขียวบนชุดนี้)
//    แล้วพลิกทีละจุด → ข้อเดียวกันต้องแดง · ข้อที่ positive control ไม่เขียว หรือ probe ไม่แดง = ข้อนั้นแดง
//    --list = พิมพ์ทุก id · --no-db = โหมดเดียวกับปกติ (ข้อสอบนี้ไม่มีส่วน DB) · exit 1 เมื่อแดง
//    หมุด: PIN = ฐานของใบ (env P42_PIN) — W3: head ที่สรุปบันทึกต้องมี PIN อยู่ในประวัติ (ตัวกดรุ่นนี้หรือใหม่กว่า)
//    ที่อยู่สรุป: env P42_SUMMARY_DIR (ปริยาย .qc-shots/pos/buttons ของทรีที่รัน — ผู้คุมรันบนทรี d หลังรอบตัวกด)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BTN, PASS_MATRIX, QC5_HOST_MARK, REGISTRY_GAP_REASONS, SHOTS_DIR, SKIP_REASONS,
  cellName, cellRows, classify, loadP41Rules, oracleIdOk, planCell, readRegistry, rowKey, sha16,
  type P41Rules, type Registry,
} from "./pos-buttons-fixtures.mjs";

const SUITE = "qc-pos-p4.2";
const ROOT = process.cwd();
const LIST = process.argv.includes("--list");
const NODB = process.argv.includes("--no-db");
const PFX = "P4.2";
const PIN = process.env.P42_PIN || "537195ad"; // ฐานของใบ P4.2 (= หัว P4.1 oracle 22 ต.ค. 07:0xZ)
const SUM_DIR = process.env.P42_SUMMARY_DIR || SHOTS_DIR;

type Def = readonly [string, string, string];
const D = (id: string, x: string, title: string): Def => [`${PFX}-${id}`, x, title] as const;
const CHECKS: readonly Def[] = [
  D("W1", "S", "[§4 W1 · มติ 6] สรุปของทุกช่องในตารางผ่าน (19 ช่อง: th staff×3 จอ · en staff×1440+390 · public×1440+390×th/en) มีครบและอ่านได้"),
  D("W2", "S", "[prompt] ทุกแถวของทะเบียนในช่องนั้นอยู่ในสรุปครั้งเดียวพอดี (ไม่ขาด · ไม่ซ้ำ · ไม่เกิน) · ตัวเลข total/ok/skip… ตรงกับแถว"),
  D("W3", "S", "[§4 W1 W4] สรุปสด: registryHash = ทะเบียนตอนนี้ · กติกา P4.1 sha เดียวกัน · บันทึก head (มี PIN ในประวัติ) + base + DB host QC5"),
  D("W4", "S", "[มติ 7 · §4 W2] เกณฑ์ผ่าน: ok = total − skip · dead/wrongExpect/hiddenLeak/error = 0 · ไม่ fatal · คืนค่าทุกจุดสำเร็จ"),
  D("W5", "S", "[มติ 7] console error = 0 · hydration = 0 · ล้นแนวนอน = 0 ทุกช่อง"),
  D("W6", "S", "[§4 W3 · prompt] เหตุผล skip ⊆ ชุดที่อนุญาต · skip แบบสถิตตรงกับตัวจำแนก (ตัวกดห้ามข้ามแถวที่แผนบอกให้กด) · แถว external อ้าง oracle id ที่มีจริง"),
  D("W7", "S", "[มติ 5 · W30 · ⚠️6] แถว money/counter กดเฉพาะสาขา posqc-btn-unit · ไม่เกิน 1 ครั้งต่อรอบ · แถวเงินที่เกิดทุกแถวอยู่สาขานั้น"),
  D("W8", "S", "[P4.1 → P4.2] ไม่มีช่องโหว่ทะเบียนในสรุป (skip missing-target / missing-db / missing-safety = 0 — ผู้สร้าง P4.1 เติมครบแล้ว)"),
  D("W9", "S", "[มติ 5] แถว safety external (หรือที่ตัวจับ P4.1 ว่าภายนอก) ไม่ถูกกดเลยในทุกช่อง (class = skip เสมอ)"),
  D("W10", "S", "[prompt] ตัวกด --list นับแถวต่อช่อง = จำนวนแถวทะเบียนของช่อง (cellRows) ทั้ง 19 ช่อง · โหมดด่านของตัวกดเขียว"),
  D("Z1", "-", "ไม่มีของค้าง (ไม่มี DB): ทะเบียน/สถานะ git ของทรีก่อน-หลังรันเท่ากัน"),
];
if (LIST) {
  console.log(`${SUITE} — ${CHECKS.length} ข้อ (id · X · หัวข้อ)`);
  for (const [id, x, t] of CHECKS) console.log(`${id}\t${x}\t${t}`);
  console.log(`X-coverage: S=${CHECKS.filter((c) => c[1] === "S").length} -=${CHECKS.filter((c) => c[1] === "-").length}`);
  process.exit(0);
}

const TITLE = new Map(CHECKS.map(([id, , t]) => [id, t]));
const results = new Map<string, { ok: boolean; probe: string }>();
function chk(id: string, ok: boolean, expected: string, actual: string, probe = "-"): void {
  const full = `${PFX}-${id}`;
  if (!TITLE.has(full)) throw new Error(`id ไม่ได้ลงทะเบียน: ${full}`);
  results.set(full, { ok, probe });
  console.log(`  ${ok ? "✅" : "❌"} [${full}] ${TITLE.get(full)?.slice(0, 100)}${ok ? ` — ${actual.slice(0, 220)}` : ` — expected ${expected} | actual ${actual.slice(0, 900)}`} · probe: ${probe}`);
}
const joinP = (p: string[], n = 8) => (p.length ? `${p.length} ปัญหา: ${p.slice(0, n).join(" · ")}${p.length > n ? " · …" : ""}` : "ครบ");
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
function git(args: string[]): string | null {
  try {
    return execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 });
  } catch {
    return null;
  }
}

// ═════════════════════════ ข้อเท็จจริง ═════════════════════════
type Sum = Any;
type Facts = { reg: Registry; rules: P41Rules; ids: Set<string>; want: Map<string, string[]>; plans: Map<string, Map<string, ReturnType<typeof classify>>>; headHasPin: (h: string) => boolean };
let REG: Registry;
let RULES: P41Rules;
let IDS: Set<string>;
try {
  REG = readRegistry(ROOT);
  RULES = loadP41Rules(ROOT);
  IDS = RULES.readDbCheckIds().ids;
} catch (e) {
  console.log(`❌ อ่านทะเบียน/ยืมกติกา P4.1 ไม่ได้: ${e instanceof Error ? e.message : e}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: CHECKS.length, passed: 0, failed: CHECKS.map((c) => c[0]), fatal: "registry/rules" })}`);
  process.exit(1);
}
const pinCache = new Map<string, boolean>();
const F: Facts = {
  reg: REG,
  rules: RULES,
  ids: IDS,
  want: new Map(PASS_MATRIX.map((c) => [cellName(c), cellRows(REG.rows, c, RULES).map(rowKey)])),
  plans: new Map(PASS_MATRIX.map((c) => [cellName(c), new Map(planCell(REG, c, RULES, IDS).items.map((it) => [it.key, it]))])),
  headHasPin: (h: string) => {
    if (!/^[0-9a-f]{7,40}$/.test(h)) return false;
    if (!pinCache.has(h)) pinCache.set(h, (git(["rev-list", "-n", "50000", h]) ?? "").split("\n").some((x) => x.startsWith(PIN)));
    return pinCache.get(h)!;
  },
};
const REG_SHA = REG.hash;
function readSummaries(dir: string): Map<string, Sum | string> {
  const m = new Map<string, Sum | string>();
  for (const c of PASS_MATRIX) {
    const f = join(ROOT, dir, `summary-${cellName(c)}.json`);
    if (!existsSync(f)) continue;
    try {
      m.set(cellName(c), JSON.parse(readFileSync(f, "utf8")));
    } catch (e) {
      m.set(cellName(c), `อ่านไม่ได้: ${(e as Error).message.slice(0, 60)}`);
    }
  }
  return m;
}
const SUMS = readSummaries(SUM_DIR);
const okSums = (S: Map<string, Sum | string>) => [...S.entries()].filter((e): e is [string, Sum] => typeof e[1] !== "string");
const none = (S: Map<string, Sum | string>) => (okSums(S).length ? [] : [`ไม่มีสรุปที่อ่านได้ใน ${SUM_DIR} — ยังไม่มีรอบตัวกด (CONTROLLER-RUN)`]);

// ═════════════════════════ ฟังก์ชันตรวจ (บริสุทธิ์: (สรุป, ข้อเท็จจริง) → ปัญหา[]) ═════════════════════════
function w1(S: Map<string, Sum | string>): string[] {
  const p: string[] = [];
  for (const c of PASS_MATRIX) {
    const s = S.get(cellName(c));
    if (s === undefined) p.push(`${cellName(c)} ไม่มีสรุป`);
    else if (typeof s === "string") p.push(`${cellName(c)} ${s}`);
    else if (s?.cell?.user !== c.user || s?.cell?.device !== c.device || (s?.cell?.locale ?? "th") !== c.locale) p.push(`${cellName(c)} cell ในไฟล์ = ${JSON.stringify(s?.cell)}`);
    else if (s.page !== "all" || s.only) p.push(`${cellName(c)} ไม่ใช่รอบเต็ม (page ${s.page} · only ${s.only ?? "-"})`);
  }
  return p;
}
const CLASSES = ["ok", "dead", "wrongExpect", "hiddenLeak", "skip", "error"];
function w2(S: Map<string, Sum | string>, f: Facts): string[] {
  const p = [...none(S)];
  for (const [name, s] of okSums(S)) {
    const want = f.want.get(name) ?? [];
    const rows: Any[] = Array.isArray(s.rows) ? s.rows : [];
    const keys = rows.map((r) => String(r?.key));
    const seen = new Set<string>();
    const dup = keys.filter((k) => (seen.has(k) ? true : (seen.add(k), false)));
    const miss = want.filter((k) => !seen.has(k));
    const extra = keys.filter((k) => !want.includes(k));
    if (dup.length || miss.length || extra.length) p.push(`${name}: ขาด ${miss.length} · ซ้ำ ${dup.length} · เกิน ${extra.length}${miss.length ? ` (${miss.slice(0, 2).join(", ")})` : ""}`);
    const n = (c: string) => rows.filter((r) => r?.class === c).length;
    if (rows.some((r) => !CLASSES.includes(r?.class))) p.push(`${name}: class นอกชุด ${CLASSES.join("/")}`);
    if (s.total !== rows.length || CLASSES.some((c) => s[c] !== n(c))) p.push(`${name}: ตัวเลขสรุปไม่ตรงแถว (total ${s.total}/${rows.length})`);
  }
  return p;
}
function w3(S: Map<string, Sum | string>, f: Facts): string[] {
  const p = [...none(S)];
  for (const [name, s] of okSums(S)) {
    if (s.registryHash !== f.reg.hash) p.push(`${name}: registryHash ${s.registryHash} ≠ ทะเบียนตอนนี้ ${f.reg.hash} (ทะเบียนเปลี่ยนหลังรอบ — รันช่องนี้ใหม่)`);
    if (s.p41Sha !== f.rules.sourceHash) p.push(`${name}: กติกา P4.1 sha ${s.p41Sha} ≠ ${f.rules.sourceHash}`);
    if (s.oracleIdsHash !== sha16([...f.ids].sort().join(","))) p.push(`${name}: oracleIdsHash ${s.oracleIdsHash ?? "-"} ≠ ตอนนี้ (ชุด id ข้อสอบเปลี่ยน — การตรวจผล db/oracle ของแผนอาจต่าง · รันช่องนี้ใหม่)`);
    if (!f.headHasPin(String(s.head ?? ""))) p.push(`${name}: head ${s.head ?? "-"} ไม่มี PIN ${PIN} ในประวัติ`);
    if (!/^https?:\/\//.test(String(s.base ?? ""))) p.push(`${name}: ไม่บันทึก base`);
    if (!String(s.dbHost ?? "").includes(QC5_HOST_MARK)) p.push(`${name}: DB ${s.dbHost ?? "-"} ไม่ใช่ QC5`);
  }
  return p;
}
function w4(S: Map<string, Sum | string>): string[] {
  const p = [...none(S)];
  for (const [name, s] of okSums(S)) {
    const bad: string[] = [];
    if (s.ok !== s.total - s.skip) bad.push(`ok ${s.ok} ≠ total ${s.total} − skip ${s.skip}`);
    for (const k of ["dead", "wrongExpect", "hiddenLeak", "error"]) if (s[k]) bad.push(`${k} ${s[k]}`);
    if (s.fatal) bad.push(`fatal ${String(s.fatal).slice(0, 60)}`);
    const rf = (Array.isArray(s.restores) ? s.restores : []).filter((r: Any) => !r?.ok);
    if (rf.length) bad.push(`คืนค่าล้ม ${rf.length} (${rf[0]?.label})`);
    if (bad.length) p.push(`${name}: ${bad.join(" · ")}`);
  }
  return p;
}
function w5(S: Map<string, Sum | string>): string[] {
  const p = [...none(S)];
  for (const [name, s] of okSums(S)) {
    const len = (k: string) => (Array.isArray(s[k]) ? s[k].length : -1);
    const bad = ["consoleErrors", "hydration", "overflow"].filter((k) => len(k) !== 0).map((k) => `${k} ${len(k) < 0 ? "ไม่บันทึก" : len(k)}`);
    if (bad.length) p.push(`${name}: ${bad.join(" · ")}`);
  }
  return p;
}
const STATIC_REASONS = new Set(["no-role-claim", "not-pos-page", "missing-target", "missing-db", "missing-safety", "external"]);
const DYNAMIC_REASONS = new Set(["needs", "needs-fixture", "file-upload", "once-per-run"]);
function w6(S: Map<string, Sum | string>, f: Facts): string[] {
  const p = [...none(S)];
  for (const [name, s] of okSums(S)) {
    const plan = f.plans.get(name)!;
    for (const r of Array.isArray(s.rows) ? s.rows : []) {
      const it = plan.get(String(r?.key));
      if (!it) continue; // W2 รายงาน
      if (r.class === "skip" && !(String(r.reason) in SKIP_REASONS)) p.push(`${name} ${r.key}: เหตุผล "${r.reason}" นอกชุด`);
      else if (r.class === "skip" && STATIC_REASONS.has(r.reason) && it.reason !== r.reason) p.push(`${name} ${r.key}: skip ${r.reason} แต่ตัวจำแนก = ${it.action}${it.reason ? `:${it.reason}` : ""}`);
      else if (r.class === "skip" && DYNAMIC_REASONS.has(r.reason) && it.action === "skip") p.push(`${name} ${r.key}: skip ${r.reason} แต่แผน = skip:${it.reason}`);
      else if (r.class !== "skip" && it.action === "skip") p.push(`${name} ${r.key}: แผน skip:${it.reason} แต่สรุป = ${r.class}`);
      if (r.class === "skip" && r.reason === "external" && !oracleIdOk(f.reg.rows[it.idx]?.oracle, f.ids)) p.push(`${name} ${r.key}: external ไม่มี oracle id ที่มีจริง (${f.reg.rows[it.idx]?.oracle || "-"})`);
      if (p.length > 40) return p;
    }
  }
  return p;
}
function w7(S: Map<string, Sum | string>, f: Facts): string[] {
  const p = [...none(S)];
  for (const [name, s] of okSums(S)) {
    const plan = f.plans.get(name)!;
    if (s.unit !== BTN.unit.id) p.push(`${name}: สาขาของรอบ ${s.unit ?? "-"} ≠ ${BTN.unit.id}`);
    const pressed = new Map<string, number>();
    for (const m of Array.isArray(s.moneyPresses) ? s.moneyPresses : []) {
      pressed.set(String(m?.key), (pressed.get(String(m?.key)) ?? 0) + 1);
      const out = (Array.isArray(m?.units) ? m.units : []).filter((u: string) => u !== BTN.unit.id);
      if (out.length) p.push(`${name} ${m?.key}: แถวเงินลงสาขา ${out.join(",")}`);
    }
    for (const [k, n] of pressed) if (n > 1) p.push(`${name} ${k}: กดเงิน ${n} ครั้ง (เพดาน 1)`);
    for (const r of Array.isArray(s.rows) ? s.rows : []) {
      const it = plan.get(String(r?.key));
      if (!it?.moneyUnit || r.class === "skip" || it.action !== "press") continue;
      if (r.unit !== BTN.unit.id && r.class !== "dead") p.push(`${name} ${r.key}: แถว ${it.safety} class ${r.class} unit ${r.unit ?? "-"}`);
      if (!pressed.has(String(r.key)) && (r.class === "ok" || r.class === "wrongExpect")) p.push(`${name} ${r.key}: แถว ${it.safety} ไม่มีบันทึก moneyPresses`);
    }
  }
  return p;
}
function w8(S: Map<string, Sum | string>): string[] {
  const p = [...none(S)];
  for (const [name, s] of okSums(S)) {
    const gaps = REGISTRY_GAP_REASONS.map((r) => [r, Number(s?.perReason?.[r] ?? 0)] as const).filter(([, n]) => n > 0);
    if (gaps.length) p.push(`${name}: ${gaps.map(([r, n]) => `${r} ${n}`).join(" · ")}`);
  }
  return p;
}
function w9(S: Map<string, Sum | string>, f: Facts): string[] {
  const p = [...none(S)];
  for (const [name, s] of okSums(S)) {
    const plan = f.plans.get(name)!;
    for (const r of Array.isArray(s.rows) ? s.rows : []) {
      const it = plan.get(String(r?.key));
      if (it?.safety === "external" && r.class !== "skip") p.push(`${name} ${r.key}: แถวภายนอก class ${r.class} (ถูกกด)`);
    }
  }
  return p;
}

// ═════════════════════════ positive control + probe ═════════════════════════
/** ชุดสรุปที่ "ผ่านทุกข้อ": ทุกช่อง · ทุกแถว = ตามแผน (skip ตามเหตุผล · ที่เหลือ ok) · ไม่มีช่องโหว่ทะเบียน (แถว gap = ok แทน) */
function syntheticGood(f: Facts): Map<string, Sum | string> {
  const m = new Map<string, Sum | string>();
  const head = (git(["rev-parse", "--short=8", "HEAD"]) ?? "").trim();
  for (const c of PASS_MATRIX) {
    const plan = [...f.plans.get(cellName(c))!.values()];
    const rows = plan.map((it) => {
      const gap = !!it.reason && (REGISTRY_GAP_REASONS as readonly string[]).includes(it.reason);
      const ext = it.safety === "external";
      if (it.action === "skip" && !gap) return { key: it.key, class: "skip", reason: it.reason };
      if (ext) return { key: it.key, class: "skip", reason: "external" };
      return { key: it.key, class: "ok", unit: it.moneyUnit ? BTN.unit.id : undefined };
    });
    const n = (k: string) => rows.filter((r) => r.class === k).length;
    const perReason: Record<string, number> = {};
    for (const r of rows) if (r.class === "skip") perReason[r.reason!] = (perReason[r.reason!] ?? 0) + 1;
    const money = plan.filter((it) => it.moneyUnit && rows.find((r) => r.key === it.key)?.class === "ok").map((it) => ({ key: it.key, units: [BTN.unit.id], models: ["PosSale"] }));
    m.set(cellName(c), {
      cell: c, page: "all", only: null, unit: BTN.unit.id, head, oracleIdsHash: sha16([...f.ids].sort().join(",")), base: "http://127.0.0.1:3299", dbHost: `${QC5_HOST_MARK}-x.neon.tech`, registryHash: f.reg.hash, p41Sha: f.rules.sourceHash,
      total: rows.length, ok: n("ok"), dead: 0, wrongExpect: 0, hiddenLeak: 0, skip: n("skip"), error: 0, perReason, consoleErrors: [], hydration: [], overflow: [], moneyPresses: money, restores: [{ label: "จบรอบ", ok: true }], fatal: null, rows,
    });
  }
  return m;
}
/** ทะเบียนสังเคราะห์ "เติมครบแล้ว" (positive control): safety = ของแถวหรือที่ตัวจับ P4.1 พบ · target/db ที่ขาดถูกเติม · แถวภายนอกอ้าง oracle id ที่มีจริง —
 *  เท่ากับทะเบียนหลังผู้สร้าง P4.1 (ไม่มีช่องโหว่) ⇒ ชุดสรุปที่ดีจากแผนของทะเบียนนี้ต้องผ่านทุกข้อ */
function filledFacts(f: Facts): Facts {
  const anyId = [...f.ids][0] ?? "P0.0-X";
  const owner = PASS_MATRIX[0]!;
  const rows = f.reg.rows.map((r0) => {
    const r = clone(r0);
    const roles = Array.isArray(r.roles) && r.roles.length ? r.roles : ["owner"];
    // เติมตามเหตุผลของตัวจำแนกจริง (วนจนไม่มีช่องโหว่ · ≤ 4 รอบ) — ใช้ classify ตัวเดียวกับตัวกด
    for (let i = 0; i < 4; i++) {
      const cell = r.page.startsWith("/app/") ? owner : { ...owner, user: "public" as const };
      const it = classify({ ...r, roles: cell.user === "public" ? ["public"] : roles }, 0, cell, f.rules, f.ids);
      if (it.reason === "missing-safety") r.safety = String(it.detail ?? "").replace(/^.*= /, "") || "money";
      else if (it.reason === "missing-target") r.expect = { ...r.expect, target: "pos-p42-filled" };
      else if (it.reason === "missing-db") r.expect = { ...r.expect, db: "AuditLog action" }; // ไม่ใช่ตารางเงิน (ไม่เปลี่ยนผลตัวจับ P4.1)
      else break;
    }
    if (r.safety === "external" && !oracleIdOk(r.oracle, f.ids)) r.oracle = anyId;
    return r;
  });
  const reg: Registry = { ...f.reg, rows, json: { ...f.reg.json, rows } };
  return {
    ...f,
    reg,
    want: new Map(PASS_MATRIX.map((c) => [cellName(c), cellRows(rows, c, f.rules).map(rowKey)])),
    plans: new Map(PASS_MATRIX.map((c) => [cellName(c), new Map(planCell(reg, c, f.rules, f.ids).items.map((it) => [it.key, it]))])),
    headHasPin: () => true,
  };
}
const FN = F;
const FG = filledFacts(F);
const GOOD = syntheticGood(FG);
type Flip = (S: Map<string, Sum | string>) => void;
const first = (S: Map<string, Sum | string>) => okSums(S)[0]![1];
const firstRow = (S: Map<string, Sum | string>, pred: (r: Any) => boolean) => okSums(S).map(([, s]) => (s.rows as Any[]).find(pred)).find(Boolean);
const PROBES: Record<string, { fn: (S: Map<string, Sum | string>, f: Facts) => string[]; flip: Flip; what: string }> = {
  W1: { fn: (S) => w1(S), flip: (S) => S.delete(cellName(PASS_MATRIX[PASS_MATRIX.length - 1]!)), what: "ลบสรุป 1 ช่อง" },
  W2: { fn: w2, flip: (S) => (first(S).rows as Any[]).pop(), what: "ลบแถว 1 แถว" },
  W3: { fn: (S, f) => w3(S, { ...f, headHasPin: () => true }), flip: (S) => (first(S).registryHash = "stale0000000000"), what: "registryHash เก่า" },
  W4: { fn: (S) => w4(S), flip: (S) => (first(S).dead = 1), what: "dead 1" },
  W5: { fn: (S) => w5(S), flip: (S) => first(S).consoleErrors.push({ key: "x", detail: "probe" }), what: "console error 1" },
  W6: { fn: w6, flip: (S) => {
    const r = firstRow(S, (x) => x.class === "ok");
    if (r) Object.assign(r, { class: "skip", reason: "no-role-claim" });
  }, what: "แถวที่แผนให้กดถูก skip no-role-claim" },
  W7: { fn: w7, flip: (S) => {
    const s = first(S);
    s.moneyPresses.push({ key: "probe#money", units: ["posqc-coffee-unit-silom"], models: ["PosSale"] });
  }, what: "แถวเงินลงสาขาสีลม" },
  W8: { fn: (S) => w8(S), flip: (S) => (first(S).perReason["missing-db"] = 1), what: "skip missing-db 1" },
  W9: { fn: w9, flip: (S) => {
    // บังคับ: แถวแรกของช่องแรกถูกตั้งเป็น external ในแผน แล้วสรุป = ok
    const [name, s] = okSums(S)[0]!;
    const r = (s.rows as Any[]).find((x) => x.class === "ok");
    if (r) PROBE_EXT.add(`${name}|${r.key}`);
  }, what: "แถวภายนอกถูกกด (ok)" },
};
const PROBE_EXT = new Set<string>();
function withExt(f: Facts): Facts {
  if (!PROBE_EXT.size) return f;
  const plans = new Map(f.plans);
  for (const k of PROBE_EXT) {
    const [name, key] = k.split("|") as [string, string];
    const m = new Map(plans.get(name)!);
    const it = m.get(key);
    if (it) m.set(key, { ...it, safety: "external" });
    plans.set(name, m);
  }
  return { ...f, plans };
}
function judge(id: keyof typeof PROBES, expected: string, okText: string): void {
  const pr = PROBES[id]!;
  const real = pr.fn(SUMS, FN);
  const posCtl = pr.fn(GOOD, FG);
  const badMap = new Map([...GOOD.entries()].map(([k, v]) => [k, clone(v)]));
  PROBE_EXT.clear();
  pr.flip(badMap);
  const flipped = pr.fn(badMap, withExt(FG));
  PROBE_EXT.clear();
  const probeOk = posCtl.length === 0 && flipped.length > 0;
  const probeTxt = posCtl.length ? `positive control ไม่เขียว ❗ (${posCtl[0]!.slice(0, 80)})` : flipped.length ? `แดงตามคาด (${pr.what}: ${flipped[0]!.slice(0, 60)})` : `ไม่แดง ❗ (${pr.what})`;
  chk(id, real.length === 0 && probeOk, expected, real.length ? joinP(real) : probeOk ? okText : "probe ไม่ผ่าน", probeTxt);
}

// ═════════════════════════ รัน ═════════════════════════
console.log(`${SUITE} — ข้อสอบสถิต${NODB ? " (--no-db = โหมดเดียวกัน)" : ""} · ทรี ${ROOT} · head ${(git(["rev-parse", "--short=8", "HEAD"]) ?? "?").trim()} · PIN ${PIN} · สรุปที่ ${SUM_DIR} (${okSums(SUMS).length}/${PASS_MATRIX.length} ช่อง)`);
console.log(`   ทะเบียน ${REG.rows.length} แถว (hash ${REG_SHA}) · กติกา P4.1 sha ${RULES.sourceHash} · oracle id ${IDS.size} · แถวรวมทุกช่อง ${[...F.want.values()].reduce((a, v) => a + v.length, 0)}`);
const snapBefore = { reg: sha16(readFileSync(join(ROOT, "scripts/pos-ui-inventory.json"), "utf8")), status: git(["status", "--porcelain", "--untracked-files=all", "--", "scripts", "ledger", "src", "prisma"]) ?? "?" };
async function step(id: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
  } catch (e) {
    chk(id, false, "ตรวจได้ (ไม่ throw)", `THROW ${String((e as Error)?.message ?? e).slice(0, 200)}`);
  }
}
await step("W1", () => judge("W1", `${PASS_MATRIX.length} ช่องครบ`, `${PASS_MATRIX.length} ช่องครบ`));
await step("W2", () => judge("W2", "ทุกแถวครั้งเดียว", `${okSums(SUMS).reduce((a, [, s]) => a + (s.rows?.length ?? 0), 0)} แถวครบ`));
await step("W3", () => judge("W3", "สด · head/base/QC5", "สดทุกช่อง"));
await step("W4", () => judge("W4", "ok = total − skip · 0 dead/wrongExpect/hiddenLeak/error", "ผ่านเกณฑ์ทุกช่อง"));
await step("W5", () => judge("W5", "console/hydration/overflow 0", "0 ทุกช่อง"));
await step("W6", () => judge("W6", "skip ⊆ ชุด · ตรงตัวจำแนก · external มี oracle", "ตรงทุกแถว"));
await step("W7", () => judge("W7", "เงินเฉพาะ posqc-btn · ≤ 1", `แถวเงิน ${okSums(SUMS).reduce((a, [, s]) => a + (s.moneyPresses?.length ?? 0), 0)} ครั้ง ทั้งหมดสาขา ${BTN.unit.id}`));
await step("W8", () => judge("W8", "ช่องโหว่ทะเบียน 0", "ไม่มีช่องโหว่ทะเบียน"));
await step("W9", () => judge("W9", "external ไม่ถูกกด", "แถวภายนอกไม่ถูกกด"));
await step("W10", () => {
  const p: string[] = [];
  const env = { ...process.env, CI: "", LOCALE: "" };
  const run = (args: string[]) => spawnSync("pnpm", ["exec", "tsx", "scripts/qc-pos-buttons.mts", ...args], { cwd: ROOT, encoding: "utf8", timeout: 180_000, env, maxBuffer: 32 * 1024 * 1024 });
  const js = (out: string) => {
    const l = out.split("\n").filter((x) => x.startsWith("JSON_SUMMARY ")).pop();
    try {
      return l ? JSON.parse(l.slice("JSON_SUMMARY ".length)) : null;
    } catch {
      return null;
    }
  };
  const L = run(["--list"]);
  const lj = js(L.stdout ?? "");
  if (L.status !== 0 || !lj) p.push(`ตัวกด --list exit ${L.status} ${(L.stderr ?? "").slice(0, 80)}`);
  else {
    if (lj.registryHash !== REG.hash) p.push(`--list registryHash ${lj.registryHash} ≠ ${REG.hash}`);
    for (const c of PASS_MATRIX) {
      const want = F.want.get(cellName(c))!.length;
      const got = lj.cells?.[cellName(c)];
      if (got !== want) p.push(`${cellName(c)} --list ${got ?? "-"} ≠ ทะเบียน ${want}`);
    }
  }
  const G = run([]);
  const gj = js(G.stdout ?? "");
  if (G.status !== 0 || !gj || gj.mode !== "gate" || gj.total !== gj.passed) p.push(`โหมดด่านของตัวกด exit ${G.status} ${gj ? `${gj.passed}/${gj.total}` : "ไม่มีสรุป"}`);
  // probe: ทะเบียนที่ขาดแถว 1 แถวต้องนับไม่ตรง (ตัวนับของข้อนี้เทียบได้จริง)
  const cut = { ...REG, rows: REG.rows.slice(1) };
  const probeRed = PASS_MATRIX.some((c) => cellRows(cut.rows, c, RULES).length !== F.want.get(cellName(c))!.length);
  chk("W10", p.length === 0 && probeRed, "--list = cellRows ทุกช่อง · ด่านตัวกดเขียว", p.length ? joinP(p) : `${PASS_MATRIX.length} ช่องตรง (${lj.total} แถวรวม) · ด่านตัวกด ${gj.passed}/${gj.total}`, probeRed ? "แดงตามคาด (ทะเบียนขาด 1 แถว → นับไม่ตรง)" : "ไม่แดง ❗");
});
await step("Z1", () => {
  const after = { reg: sha16(readFileSync(join(ROOT, "scripts/pos-ui-inventory.json"), "utf8")), status: git(["status", "--porcelain", "--untracked-files=all", "--", "scripts", "ledger", "src", "prisma"]) ?? "?" };
  const residue = (b: typeof after, a: typeof after) => [...(b.reg !== a.reg ? ["ทะเบียนถูกแก้ระหว่างรัน"] : []), ...(b.status !== a.status ? ["สถานะ git เปลี่ยนระหว่างรัน"] : [])];
  const real = residue(snapBefore, after);
  const probe = residue(snapBefore, { reg: "probe", status: `${after.status}?? probe\n` });
  chk("Z1", real.length === 0 && probe.length > 0, "ไม่มีของค้าง", real.length ? real.join(" · ") : "ทะเบียน + git status เท่าเดิม", probe.length ? "แดงตามคาด" : "ไม่แดง ❗");
});

const failed = CHECKS.map(([id]) => id).filter((id) => !results.get(id)?.ok);
console.log(`\n${failed.length ? "❌" : "✅"} ${SUITE}: ${CHECKS.length - failed.length}/${CHECKS.length} ผ่าน${failed.length ? ` — แดง: ${failed.join(" ")}` : ""}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, mode: NODB ? "no-db" : "static", total: CHECKS.length, passed: CHECKS.length - failed.length, failed, skipped: false, registered: CHECKS.length, pin: PIN, summaries: okSums(SUMS).length, cells: PASS_MATRIX.length, probes: Object.fromEntries([...results.entries()].map(([id, r]) => [id, r.probe.startsWith("แดงตามคาด")])) })}`);
process.exit(failed.length ? 1 : 0);

// ─── หมายเหตุขอบเขต ───
// นอกขอบเขต: รอบตัวกดจริง (CONTROLLER-RUN · ทรี d · QC5 · มติ 9) · J-set J1–J6 และฟอร์ม double-submit/cancel (W5/W6 ของ brief §4 — รอบถัดไป
//   ดูโน้ต CD-P42-W) · การแก้บั๊กที่ตัวกดพบ (P4.3)
