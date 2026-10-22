// QC — POS RUN ใบ P6.1 (ขึ้น production): runbook + สคริปต์ตรวจอ่านอย่างเดียว + ข้อความ PR — ข้อสอบสถิตล้วน (ไม่แตะ DB)
//   brief = ledger/pos-briefs/pos-brief-P6.md §4 (oracle P6.1) · §8 · §10 + addendum (มติ 1–9 · W31 W32) · โน้ต = ledger/wo-notes/pos-P6.1-prep.md
//
// รัน:  bash scripts/iso.sh bash scripts/qc4.sh env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-pos-p6.1.mts
//       (ไม่ใช้ DB เลย — สูตรเลนเดียวกับชุดอื่นเพื่อให้ pos-gates-all รันได้ · รันตรงผ่าน iso.sh ก็ได้)
//       --list  = พิมพ์ทุก id · --no-db = เหมือนปกติ (ทุกข้อสถิตอยู่แล้ว)
//       P61_PIN = ฐานของข้อสอบ (session/pos ตอนเขียน · ค่าเริ่มต้น 23c85130) · P61_LANE_PIN = หมุดเลนของข้อ Z (ค่าเริ่มต้น = PIN)
//       P61_REV = ตรวจ "ทรี ณ commit" แทนไฟล์บนดิสก์ (อ่านด้วย git show) — ใช้วัด red-before บนฐาน: `env P61_REV=23c85130 …`
// ไม่มีด่าน SKIP ⇒ QC_FORCE ไม่มีผล (pos-gates mode unforced) · ทุกข้อแดงตามเหตุเมื่อของยังไม่มี
// ข้อ R1 (ข้อความ PR) แดงจนกว่า P3.12/P4/P5 ปิด — ตั้งใจ (มติ P6 §10 addendum: PR body รอ)
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const SUITE = "qc-pos-p6.1";
const ROOT = process.cwd();
const LIST = process.argv.includes("--list");
/** ฐานของข้อสอบ (session/pos ตอนเขียน) — env override */
const PIN = process.env.P61_PIN || "23c85130";
/** หมุดเลนของข้อ Z (ไฟล์ที่ใบนี้แตะได้) — ย้ายได้โดยไม่ขยับหมุดใบ */
const LANE_PIN = process.env.P61_LANE_PIN || PIN;
const REV = process.env.P61_REV || "";

const RUNBOOK = "docs/pos/DEPLOY-RUNBOOK.md";
const DRAFT = "ledger/pos-briefs/pos-runbook-P6.1-DRAFT.md";
const VERIFY = "scripts/verify-prod-pos.mts";
const NOTES = "ledger/wo-notes/pos-P6.1-prep.md";
const PR_BODY = "ledger/pos-briefs/pos-PR-main.md";
const GATES = "scripts/pos-gates.json";
/** migration ตัวแรกของ POS V2 (ก่อนหน้านี้อยู่บน main/prod แล้ว เช่น 20260809100000_pos_service_split) */
const V2_FIRST = "20261120000000_pos_v2_a";

type Def = readonly [string, string];
const CHECKS: readonly Def[] = [
  ["P6.1-D1", "runbook docs/pos/DEPLOY-RUNBOOK.md มี §0–§12 + ภาคผนวก ก (SQL ถอยกลับ) + ข (ต่างจาก DRAFT)"],
  ["P6.1-D2", "DRAFT 3 ต.ค. ถูกแช่แข็ง: บรรทัดแรกชี้ docs/pos/DEPLOY-RUNBOOK.md · ส่วนที่เหลือไบต์เท่าฐาน (ไม่ลบ ไม่แก้)"],
  ["P6.1-P1", "§1 เงื่อนไขก่อนเริ่ม: แถว 1.1–1.12 ระบุ 'ยังต้องทำไหม' ทุกแถว · ทุกการอ้าง path:บรรทัด ในเอกสารชี้ไฟล์ที่มีจริงและบรรทัดไม่เกินความยาวไฟล์"],
  ["P6.1-M1", "§2 ตาราง migration: ทุกไฟล์ prisma/migrations/*_pos_* ตั้งแต่ pos_v2_a อยู่ในตาราง เรียงตาม timestamp · คอลัมน์ tx (DO/stmt) และ lock_timeout ตรงกับ SQL"],
  ["P6.1-M2", "§3.1 pre-flight: ทุกตารางเดิม (ถูก ALTER/สร้าง index โดย POS migration แต่ไม่ได้สร้างโดย POS migration) อยู่ในรายการ"],
  ["P6.1-M3", "ภาคผนวก ก: ทุก migration มีบล็อก SQL ถอยกลับ · ทุกคำสั่ง IF EXISTS บรรทัดละคำสั่ง · ครบทุก index/คอลัมน์/ตาราง/type ที่ไฟล์นั้นสร้าง · ค่า enum ที่เพิ่มมีหมายเหตุ"],
  ["P6.1-M4", "§3.2: ทุก index ที่ POS migration สร้างบนตารางเดิม (ไม่ CONCURRENTLY) อยู่ในรายการ"],
  ["P6.1-M5", "§5 index มือ: ชุดใน SQL CONCURRENTLY = HAND_INDEXES ของ verify-prod-pos · ครอบทุก model ที่ schema จด 'P6.1 … CONCURRENTLY' · มีแถว pending P5.3"],
  ["P6.1-E1", "§6 env: ทุก process.env.X ใต้ path ของ POS (+ ค่าคงที่ *_ENV ของ pos) อยู่ในตาราง · POS_CREDENTIALS_KEY อ้าง W4 · กุญแจอุปกรณ์ P5.2 ระบุ pending"],
  ["P6.1-C1", "§7 cron: ทุกงาน POS ใน api/cron/hourly/route.ts และทุก registerMinuteJob ชื่อ pos.* อยู่ในตาราง"],
  ["P6.1-F1", "§9 ธง/สวิตช์: registerV2 · offline · credit · chat ×4 · board · ai · deposit · creds PLATFORM/SLIP_VERIFY/ETAX · print agent (LAN) · shift.required — ทุกแถวมีทางถอยกลับ"],
  ["P6.1-B1", "§8 backfill: pos-backfill-catalog --dry-run → จริง → --verify → backfillWebPrices → ข้อมูล P1.9 → ธง (ลำดับในเอกสาร) · มีคำว่า idempotent/รันซ้ำได้ · ช่องว่างสคริปต์ถูกจด"],
  ["P6.1-V1", "scripts/verify-prod-pos.mts อ่านอย่างเดียว: SET TRANSACTION READ ONLY · ROLLBACK · allowlist (prod + ep-frosty-lab) · ALLOW_PROD_AUDIT · --self-test · --list · JSON_SUMMARY · ไม่โหลด .env · ไม่มี prisma/$executeRaw · SQL เขียนมีแค่ probe ที่ติด RO-PROBE ในทาง --self-test"],
  ["P6.1-V2", "ผล --self-test บน QC4 บันทึกในโน้ต: JSON_SUMMARY verify-prod-pos mode self-test fail 0 พร้อม head ที่เป็น ancestor ของทรีนี้"],
  ["P6.1-R1", "ข้อความ PR ledger/pos-briefs/pos-PR-main.md: สรุป · รายการ migration · ธง · ถอยกลับ · หลักฐาน (รอ P3.12/P4/P5 — แดงตั้งใจจนถึงขั้นนั้น)"],
  ["P6.1-R2", "จุดเจ้าของ ⛔: §11 มี ≥ 10 ข้อ ⛔ · ทุกบรรทัดคำสั่งที่ชี้ prod (<PROD_DIRECT_URL> · ALLOW_PROD_BACKFILL=1 · ALLOW_PROD_AUDIT=1) มี ⛔ ในบรรทัดเดียวกันหรือ ≤ 6 บรรทัดก่อนหน้า"],
  ["P6.1-S1", "ไม่มีความลับ: runbook · โน้ต · verify script ไม่มี URL ที่มีรหัสผ่านจริง · npg_ · sk-ant- · hex ≥ 32 ตัว · *.neon.tech · host prod ปรากฏเฉพาะ allowlist/ชุดทดสอบใน verify script"],
  ["P6.1-Z1", "ขอบเขต: ทรีนี้เทียบหมุดเลนแตะเฉพาะ docs/ scripts/ ledger/ (ไม่มี src/ prisma/ package.json)"],
  ["P6.1-G1", "scripts/pos-gates.json มี qc-pos-p6.1 (mode unforced — ไม่มีด่าน SKIP)"],
];

if (LIST) {
  for (const [id, t] of CHECKS) console.log(`${id}  ${t}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, mode: "list", total: CHECKS.length, passed: 0, pin: PIN })}`);
  process.exit(0);
}

// ═════════════════════════ อ่านไฟล์: ดิสก์ หรือ git show REV ═════════════════════════
function git(...a: string[]): string {
  try {
    return execFileSync("git", ["-C", ROOT, ...a], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 });
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
  if (REV) {
    v = gitOk("cat-file", "-e", `${REV}:${p}`) ? git("show", `${REV}:${p}`) : null;
  } else v = existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), "utf8") : null;
  cache.set(p, v);
  return v;
}
function ls(dir: string): string[] {
  if (REV) return git("ls-tree", "--name-only", `${REV}:${dir}`).split("\n").filter(Boolean);
  return existsSync(join(ROOT, dir)) ? readdirSync(join(ROOT, dir)) : [];
}
function lsRec(dir: string): string[] {
  if (REV) return git("ls-tree", "-r", "--name-only", REV, "--", dir).split("\n").filter(Boolean);
  return git("ls-files", "--cached", "--others", "--exclude-standard", "--", dir).split("\n").filter(Boolean);
}

// ═════════════════════════ ตัวช่วย ═════════════════════════
const results = new Map<string, { ok: boolean; detail: string }>();
const chk = (id: string, ok: boolean, detail: string) => results.set(`P6.1-${id}`, { ok, detail });
const rb = read(RUNBOOK) ?? "";
const hasRb = rb.length > 0;
/** หัวข้อ `## <prefix>` → เนื้อหาจนถึง `## ` ถัดไป */
function section(prefix: string): string {
  const lines = rb.split("\n");
  const i = lines.findIndex((l) => l.startsWith(`## ${prefix}`));
  if (i < 0) return "";
  let j = i + 1;
  while (j < lines.length && !lines[j]!.startsWith("## ")) j++;
  return lines.slice(i, j).join("\n");
}
function sub(sec: string, prefix: string): string {
  const lines = sec.split("\n");
  const i = lines.findIndex((l) => l.startsWith(`### ${prefix}`));
  if (i < 0) return "";
  let j = i + 1;
  while (j < lines.length && !lines[j]!.startsWith("### ") && !lines[j]!.startsWith("## ")) j++;
  return lines.slice(i, j).join("\n");
}
const stripSql = (s: string) => s.replace(/--[^\n]*/g, "");
type Mig = { name: string; sql: string; doTx: boolean; lock: string; tables: string[]; cols: [string, string][]; types: string[]; enumAdds: [string, string][]; idx: [string, string][]; altered: string[] };
function parseMig(name: string, raw: string): Mig {
  const s = stripSql(raw);
  const cols: [string, string][] = [];
  const altered: string[] = [];
  for (const m of s.matchAll(/ALTER TABLE (?:ONLY )?"(\w+)"\s+([\s\S]*?);/gi)) {
    altered.push(m[1] as string);
    for (const c of (m[2] as string).matchAll(/ADD COLUMN\s+(?:IF NOT EXISTS\s+)?"(\w+)"/gi)) cols.push([m[1] as string, c[1] as string]);
  }
  const idx = [...s.matchAll(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF NOT EXISTS\s+)?"(\w+)"\s+ON\s+"(\w+)"/gi)].map((m) => [m[1], m[2]] as [string, string]);
  return {
    name,
    sql: raw,
    doTx: /DO \$\$/.test(s),
    lock: /lock_timeout\s*=\s*'([^']+)'/i.exec(s)?.[1] ?? "",
    tables: [...s.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?"(\w+)"/gi)].map((m) => m[1] as string),
    cols,
    types: [...s.matchAll(/CREATE TYPE "(\w+)"/gi)].map((m) => m[1] as string),
    enumAdds: [...s.matchAll(/ALTER TYPE "(\w+)" ADD VALUE (?:IF NOT EXISTS )?'(\w+)'/gi)].map((m) => [m[1], m[2]] as [string, string]),
    idx,
    altered,
  };
}
const migNames = ls("prisma/migrations")
  .filter((d) => /^\d{14}_pos_[a-z0-9_]+$/.test(d) && d >= V2_FIRST)
  .sort();
const migs = migNames.map((n) => parseMig(n, read(`prisma/migrations/${n}/migration.sql`) ?? ""));
const created = new Set(migs.flatMap((m) => m.tables));
const existingTouched = new Set<string>();
for (const m of migs) {
  for (const t of m.altered) if (!created.has(t)) existingTouched.add(t);
  for (const [, t] of m.idx) if (!created.has(t)) existingTouched.add(t);
}

try {
  // ── D1 ──
  {
    const want = ["0.", "1.", "2.", "3.", "4.", "5.", "6.", "7.", "8.", "9.", "10.", "11.", "12.", "ภาคผนวก ก", "ภาคผนวก ข"];
    const miss = hasRb ? want.filter((w) => !section(w)) : want;
    chk("D1", hasRb && !miss.length, hasRb ? (miss.length ? `ขาดหัวข้อ ${miss.join(", ")}` : `${want.length} หัวข้อครบ (${rb.split("\n").length} บรรทัด)`) : `ไม่มี ${RUNBOOK}`);
  }
  // ── D2 ──
  {
    const now = read(DRAFT);
    const base = gitOk("cat-file", "-e", `${PIN}:${DRAFT}`) ? git("show", `${PIN}:${DRAFT}`) : null;
    const p: string[] = [];
    if (!now) p.push("DRAFT หาย (ห้ามลบ)");
    else {
      const [first, ...rest] = now.split("\n");
      if (!first || !/docs\/pos\/DEPLOY-RUNBOOK\.md/.test(first) || !/FROZEN|แช่แข็ง/i.test(first)) p.push("บรรทัดแรกไม่ใช่ป้ายแช่แข็งที่ชี้ docs/pos/DEPLOY-RUNBOOK.md");
      if (base !== null && rest.join("\n") !== base) p.push("เนื้อหาเดิมถูกแก้ (ต้องเพิ่มแค่บรรทัดแรก)");
      if (base === null) p.push(`อ่าน DRAFT ที่ฐาน ${PIN} ไม่ได้`);
    }
    chk("D2", !p.length, p.length ? p.join(" · ") : "แช่แข็ง 1 บรรทัด · เนื้อหาเดิมไบต์เท่าฐาน");
  }
  // ── P1 ──
  {
    const p: string[] = [];
    const s1 = section("1.");
    if (!s1) p.push("ไม่มี §1");
    for (let i = 1; i <= 12; i++) {
      const row = s1.split("\n").find((l) => l.startsWith(`| 1.${i} |`));
      if (!row) {
        p.push(`ไม่มีแถว 1.${i}`);
        continue;
      }
      const cells = row.split("|").map((c) => c.trim());
      if ((cells[4] ?? "").length < 4) p.push(`1.${i} ไม่บอกว่ายังต้องทำไหม`);
    }
    let cites = 0;
    const bad: string[] = [];
    for (const m of rb.matchAll(/((?:src|scripts|prisma|ledger|docs)\/[\w\-./[\]]+\.(?:ts|tsx|mts|mjs|cjs|sh|json|prisma|md|sql)):(\d+)(?:-(\d+))?/g)) {
      cites++;
      const f = m[1] as string;
      const hi = Number(m[3] ?? m[2]);
      const body = read(f);
      if (body === null) bad.push(`${f} ไม่มี`);
      else if (body.split("\n").length < hi) bad.push(`${f}:${hi} เกินความยาว`);
    }
    if (hasRb && cites < 20) p.push(`อ้าง path:บรรทัด แค่ ${cites} จุด (คาด ≥ 20)`);
    if (bad.length) p.push(`อ้างผิด ${bad.length}: ${[...new Set(bad)].slice(0, 5).join(", ")}`);
    chk("P1", hasRb && !p.length, hasRb ? (p.length ? p.join(" · ") : `12 แถว · อ้าง ${cites} จุดชี้ไฟล์จริงทุกจุด`) : `ไม่มี ${RUNBOOK}`);
  }
  // ── M1 ──
  {
    const p: string[] = [];
    const rows = section("2.")
      .split("\n")
      .map((l) => /^\|\s*(\d+)\s*\|\s*`(\d{14}_pos_[a-z0-9_]+)`\s*\|\s*(DO|stmt)\s*\|\s*([^|]*)\|/.exec(l))
      .filter((m): m is RegExpExecArray => !!m);
    const names = rows.map((r) => r[2] as string);
    const missing = migNames.filter((n) => !names.includes(n));
    const extra = names.filter((n) => !migNames.includes(n));
    if (missing.length) p.push(`ไม่อยู่ในตาราง ${missing.length}: ${missing.slice(0, 4).join(", ")}`);
    if (extra.length) p.push(`ในตารางแต่ไม่มีไฟล์: ${extra.join(", ")}`);
    if (names.join() !== [...names].sort().join()) p.push("ไม่เรียงตาม timestamp");
    for (const r of rows) {
      const m = migs.find((x) => x.name === r[2]);
      if (!m) continue;
      if ((r[3] === "DO") !== m.doTx) p.push(`${m.name} tx ควรเป็น ${m.doTx ? "DO" : "stmt"}`);
      const lt = (r[4] as string).trim();
      if (m.lock ? !lt.startsWith(m.lock) : !/ไม่มี/.test(lt)) p.push(`${m.name} lock_timeout ควรเป็น ${m.lock || "ไม่มี"}`);
    }
    chk("M1", migNames.length > 0 && !p.length, p.length ? p.slice(0, 6).join(" · ") : `${migNames.length}/${migNames.length} ไฟล์ · เรียงถูก · tx/lock ตรง SQL`);
  }
  // ── M2 ──
  {
    const s31 = sub(section("3."), "3.1");
    const listed = new Set([...s31.matchAll(/^\|\s*`(\w+)`/gm)].map((m) => m[1] as string));
    const miss = [...existingTouched].filter((t) => !listed.has(t));
    chk("M2", existingTouched.size > 0 && !!s31 && !miss.length, s31 ? (miss.length ? `ขาด ${miss.join(", ")}` : `${existingTouched.size} ตารางเดิมครบ (${[...existingTouched].sort().join(" ")})`) : "ไม่มี §3.1");
  }
  // ── M3 ──
  {
    const ap = section("ภาคผนวก ก");
    const p: string[] = [];
    for (const m of migs) {
      const re = new RegExp(`^#### ${m.name}\\s*\\n\`\`\`sql\\n([\\s\\S]*?)\\n\`\`\``, "m");
      const blk = re.exec(ap)?.[1];
      if (!blk) {
        p.push(`${m.name}: ไม่มีบล็อก`);
        continue;
      }
      const stmts = blk.split("\n").filter((l) => l.trim() && !l.trim().startsWith("--"));
      for (const l of stmts) {
        if (/^(SET|RESET) lock_timeout/.test(l.trim())) continue;
        if (!/IF EXISTS/.test(l) || (l.match(/;/g) ?? []).length !== 1 || !l.trim().endsWith(";")) p.push(`${m.name}: "${l.trim().slice(0, 50)}" ไม่ใช่คำสั่งเดียว IF EXISTS`);
      }
      const need = [...m.idx.map((x) => `DROP INDEX IF EXISTS "${x[0]}"`), ...m.cols.map(([t, c]) => `ALTER TABLE "${t}" DROP COLUMN IF EXISTS "${c}"`), ...m.tables.map((t) => `DROP TABLE IF EXISTS "${t}"`), ...m.types.map((t) => `DROP TYPE IF EXISTS "${t}"`)];
      for (const nd of need) if (!blk.includes(nd)) p.push(`${m.name}: ขาด ${nd}`);
      for (const [t, v] of m.enumAdds) if (!new RegExp(`--.*${t}.*'${v}'`).test(blk)) p.push(`${m.name}: ไม่มีหมายเหตุ enum ${t} '${v}'`);
    }
    chk("M3", migs.length > 0 && !!ap && !p.length, ap ? (p.length ? `${p.length} ปัญหา: ${p.slice(0, 4).join(" · ")}` : `${migs.length} บล็อกครบ · ทุกคำสั่ง IF EXISTS`) : "ไม่มีภาคผนวก ก");
  }
  // ── M4 ──
  {
    const s32 = sub(section("3."), "3.2");
    const want = migs.flatMap((m) => m.idx.filter(([, t]) => !created.has(t)).map(([i]) => i));
    const miss = want.filter((i) => !s32.includes(`\`${i}\``));
    chk("M4", want.length > 0 && !!s32 && !miss.length, s32 ? (miss.length ? `ขาด ${miss.join(", ")}` : `${want.length} index บนตารางเดิมครบ`) : "ไม่มี §3.2");
  }
  // ── M5 ──
  {
    const s5 = section("5.");
    const p: string[] = [];
    const sqlIdx = new Set([...s5.matchAll(/CREATE (?:UNIQUE )?INDEX CONCURRENTLY IF NOT EXISTS "(\w+)" ON "(\w+)"/g)].map((m) => `${m[1]}@${m[2]}`));
    const vsrc = read(VERIFY) ?? "";
    const hand = new Set([...vsrc.matchAll(/\{ name: "(\w+)", table: "(\w+)"/g)].map((m) => `${m[1]}@${m[2]}`));
    for (const x of hand) if (!sqlIdx.has(x)) p.push(`HAND_INDEXES ${x} ไม่อยู่ใน SQL §5`);
    for (const x of sqlIdx) if (!hand.has(x)) p.push(`SQL §5 ${x} ไม่อยู่ใน HAND_INDEXES`);
    const tablesInSql = new Set([...sqlIdx].map((x) => x.split("@")[1]));
    for (const f of ls("prisma/schema").filter((x) => x.endsWith(".prisma"))) {
      const lines = (read(`prisma/schema/${f}`) ?? "").split("\n");
      let model = "";
      lines.forEach((l, i) => {
        const mm = /^model (\w+) /.exec(l);
        if (mm) model = mm[1] as string;
        if (/P6\.1/.test(l) && /CONCURRENTLY/.test(l) && model && !tablesInSql.has(model)) p.push(`${f}:${i + 1} (${model}) ไม่มี index มือใน §5`);
      });
    }
    if (!/pending P5\.3/.test(s5)) p.push("ไม่มีแถว pending P5.3");
    if (!/indisvalid/.test(s5)) p.push("ไม่มีขั้นตรวจ indisvalid");
    chk("M5", !!s5 && sqlIdx.size > 0 && !p.length, s5 ? (p.length ? p.slice(0, 5).join(" · ") : `${sqlIdx.size} index = HAND_INDEXES · schema ครอบ · pending P5.3 · indisvalid`) : "ไม่มี §5");
  }
  // ── E1 ──
  {
    const s6 = section("6.");
    const files = [
      ...lsRec("src/lib/modules/pos"),
      ...lsRec("src/app").filter((f) => /\/pos\//.test(f) || f.startsWith("src/app/r/") || f.startsWith("src/app/api/v1/pos")),
      ...lsRec("src/lib/actions").filter((f) => /\/pos[^/]*\.ts$/.test(f)),
    ].filter((f) => /\.(ts|tsx)$/.test(f));
    const names = new Set<string>();
    for (const f of files) {
      const t = read(f) ?? "";
      for (const m of t.matchAll(/process\.env\.([A-Z][A-Z0-9_]+)|process\.env\[["']([A-Z][A-Z0-9_]+)["']\]/g)) names.add((m[1] ?? m[2]) as string);
      if (f.startsWith("src/lib/modules/pos/")) for (const m of t.matchAll(/export const \w+_ENV = "([A-Z][A-Z0-9_]+)"/g)) names.add(m[1] as string);
    }
    names.delete("NODE_ENV");
    const miss = [...names].filter((x) => !s6.includes(`\`${x}\``));
    const p: string[] = [];
    if (miss.length) p.push(`ขาด ${miss.join(", ")}`);
    if (!/POS_CREDENTIALS_KEY[^\n]*W4/.test(s6)) p.push("แถว POS_CREDENTIALS_KEY ไม่อ้าง W4");
    if (!/P5\.2[^\n]*pending|pending[^\n]*P5\.2/.test(s6)) p.push("ไม่มีกุญแจอุปกรณ์ P5.2 (pending)");
    chk("E1", !!s6 && names.size > 0 && !p.length, s6 ? (p.length ? p.join(" · ") : `${names.size} env (${[...names].sort().join(" ")}) · W4 · P5.2 pending · สแกน ${files.length} ไฟล์`) : "ไม่มี §6");
  }
  // ── C1 ──
  {
    const s7 = section("7.");
    const hourly = read("src/app/api/cron/hourly/route.ts") ?? "";
    const want = new Set<string>();
    for (const m of hourly.matchAll(/import \{ ([^}]+) \} from "@\/lib\/modules\/pos\/[^"]+"/g)) for (const x of (m[1] as string).split(",")) want.add(x.trim().split(/\s+as\s+/)[0] as string);
    for (const m of hourly.matchAll(/import\("@\/lib\/(?:modules\/pos\/[\w-]+|pos-[\w-]+)"\)\)\.(\w+)/g)) want.add(m[1] as string);
    const mj = read("src/lib/platform/minute-jobs.ts") ?? "";
    for (const m of mj.matchAll(/name: "(pos\.[\w.]+)"/g)) want.add(m[1] as string);
    const miss = [...want].filter((x) => !s7.includes(`\`${x}\``));
    chk("C1", !!s7 && want.size > 0 && !miss.length, s7 ? (miss.length ? `ขาด ${miss.join(", ")}` : `${want.size} งานครบ (${[...want].join(" ")})`) : "ไม่มี §7");
  }
  // ── F1 ──
  {
    const s9 = section("9.");
    const chatShared = read("src/lib/modules/pos/chat-link-shared.ts") ?? "";
    const chatSw = /POS_CHAT_SWITCHES\s*=\s*\[([^\]]+)\]/.exec(chatShared)?.[1]?.match(/"(\w+)"/g)?.map((x) => `chat.${x.replace(/"/g, "")}`) ?? ["chat.receiptAuto", "chat.refundNotice", "chat.orderStatus", "chat.autoReply"];
    const want = ["registerV2", "offline.enabled", "credit.enabled", ...chatSw, "board.enabled", "ai.enabled", "deposit.enabled", "PLATFORM", "SLIP_VERIFY", "ETAX", "print agent", "shift.required"];
    const rows = s9.split("\n").filter((l) => l.startsWith("|") && !/^\|\s*-/.test(l));
    const p: string[] = [];
    for (const w of want) {
      const row = rows.find((r) => r.includes(w));
      if (!row) p.push(`ไม่มี ${w}`);
      else if ((row.split("|").map((c) => c.trim())[4] ?? "").length < 3) p.push(`${w} ไม่มีทางถอยกลับ`);
    }
    chk("F1", !!s9 && !p.length, s9 ? (p.length ? p.join(" · ") : `${want.length} สวิตช์ครบ + ทางถอยกลับ`) : "ไม่มี §9");
  }
  // ── B1 ──
  {
    const s8 = section("8.");
    const p: string[] = [];
    const at = (re: RegExp) => {
      const m = re.exec(s8);
      return m ? m.index : -1;
    };
    const iDry = at(/pos-backfill-catalog\.mts[^\n]*--dry-run/);
    const iVer = at(/pos-backfill-catalog\.mts[^\n]*--verify/);
    const iWeb = at(/⛔ `backfillWebPrices`/);
    const iShift = at(/shift\.required\.register = false/);
    if (iDry < 0) p.push("ไม่มี dry-run");
    if (iVer < 0) p.push("ไม่มี --verify");
    if (iWeb < 0) p.push("ไม่มี backfillWebPrices");
    if (iShift < 0) p.push("ไม่มีข้อมูล P1.9 (shift.required.register)");
    if (iDry >= 0 && iVer >= 0 && iWeb >= 0 && iShift >= 0 && !(iDry < iVer && iVer < iWeb && iWeb < iShift)) p.push("ลำดับไม่ใช่ dry-run → verify → web prices → P1.9");
    if (!/idempotent|รันซ้ำได้/.test(s8)) p.push("ไม่มีหมายเหตุ idempotent");
    if (!/CD-P61-P\d+/.test(s8)) p.push("ช่องว่างสคริปต์ (backfillWebPrices/P1.9 ไม่มี CLI) ไม่ถูกจดเป็น CD");
    if (!/catalog → `--verify` = 0 → `backfillWebPrices`/.test(rb)) p.push("ไม่มีประโยคลำดับ catalog → --verify 0 → backfillWebPrices");
    chk("B1", !!s8 && !p.length, s8 ? (p.length ? p.join(" · ") : "ลำดับ dry-run → --verify → backfillWebPrices → P1.9 · idempotent · CD จด") : "ไม่มี §8");
  }
  // ── V1 ──
  {
    const v = read(VERIFY);
    const p: string[] = [];
    if (!v) p.push(`ไม่มี ${VERIFY}`);
    else {
      for (const tok of ['"SET TRANSACTION READ ONLY"', '"ROLLBACK"', "ALLOW_PROD_AUDIT", "--self-test", "--list", "JSON_SUMMARY", 'mark: "ep-frosty-lab"', 'role: "prod"', "HOST_ALLOWLIST", "READ_SQL"]) if (!v.includes(tok)) p.push(`ไม่มี ${tok}`);
      if (/loadEnvFile|dotenv/.test(v)) p.push("โหลดไฟล์ env");
      if (/\$executeRaw|\$queryRaw|@prisma\/client|from "@\/lib\/db"|\bprisma\.(\$|[a-z]\w*\.)/.test(v)) p.push("ใช้ prisma/$executeRaw");
      const code = v.split("\n");
      code.forEach((l, i) => {
        const sqlish = l.replace(/\/\/.*$/, "");
        if (/["'`]\s*(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|CREATE|GRANT|COPY|VACUUM|REINDEX|CLUSTER|LOCK)\b/i.test(sqlish)) {
          if (!/RO-PROBE/.test(l)) p.push(`บรรทัด ${i + 1} มี SQL เขียน`);
          else if (!code.slice(Math.max(0, i - 12), i).some((x) => /if \(SELF/.test(x))) p.push(`บรรทัด ${i + 1} probe ไม่อยู่ในทาง --self-test`);
        }
      });
      if ((v.match(/RO-PROBE/g) ?? []).length !== 1) p.push("RO-PROBE ต้องมี 1 จุดเท่านั้น");
      if (!/\^\\s\*\(SELECT\|WITH\|SHOW\)/.test(v)) p.push("ตัวกั้น q() ไม่รับเฉพาะ SELECT/WITH/SHOW");
    }
    chk("V1", !!v && !p.length, p.length ? p.slice(0, 5).join(" · ") : "อ่านอย่างเดียว · allowlist · ALLOW_PROD_AUDIT · probe เดียวในทาง self-test");
  }
  // ── V2 ──
  {
    const n = read(NOTES) ?? "";
    const line = n.split("\n").find((l) => /JSON_SUMMARY \{"suite":"verify-prod-pos","mode":"self-test"/.test(l));
    const p: string[] = [];
    if (!n) p.push(`ไม่มี ${NOTES}`);
    else if (!line) p.push("โน้ตไม่มี JSON_SUMMARY ของ verify-prod-pos --self-test");
    else {
      if (!/"fail":0[,}]/.test(line)) p.push("self-test มี FAIL");
      const head = /head=([0-9a-f]{7,40})/.exec(n.slice(Math.max(0, n.indexOf(line) - 800), n.indexOf(line) + line.length))?.[1];
      if (!head) p.push("ไม่มี head=<sha> กำกับผล self-test");
      else if (!gitOk("cat-file", "-e", `${head}^{commit}`) || git("rev-list", `${REV || "HEAD"}..${head}`).trim() !== "") p.push(`head ${head} ไม่ใช่ ancestor ของ ${REV || "HEAD"}`);
    }
    chk("V2", !p.length, p.length ? p.join(" · ") : "self-test fail 0 · head เป็น ancestor");
  }
  // ── R1 ──
  {
    const pr = read(PR_BODY);
    const p: string[] = [];
    if (!pr) p.push(`ไม่มี ${PR_BODY} (รอ P3.12/P4/P5 ปิด — มติ P6 §10 addendum)`);
    else for (const w of [/สรุป|Summary/i, /migration/i, /ธง|flag/i, /ถอยกลับ|rollback/i, /หลักฐาน|evidence/i]) if (!w.test(pr)) p.push(`ขาด ${w.source}`);
    chk("R1", !p.length, p.length ? p.join(" · ") : "มีครบ 5 ส่วน");
  }
  // ── R2 ──
  {
    const p: string[] = [];
    const s11 = section("11.");
    const go = s11.split("\n").filter((l) => /^\d+\.\s.*⛔/.test(l)).length;
    if (go < 10) p.push(`§11 มี ⛔ ${go} ข้อ (คาด ≥ 10)`);
    const lines = rb.split("\n");
    let prodLines = 0;
    lines.forEach((l, i) => {
      if (/<PROD_DIRECT_URL>'|ALLOW_PROD_BACKFILL=1 |ALLOW_PROD_AUDIT=1 /.test(l) && !/^\s*\|/.test(l)) {
        prodLines++;
        if (!lines.slice(Math.max(0, i - 6), i + 1).some((x) => x.includes("⛔"))) p.push(`บรรทัด ${i + 1} ชี้ prod ไม่มี ⛔`);
      }
    });
    if (hasRb && prodLines < 5) p.push(`บรรทัดคำสั่ง prod แค่ ${prodLines}`);
    chk("R2", hasRb && !p.length, hasRb ? (p.length ? p.slice(0, 4).join(" · ") : `§11 ⛔ ${go} ข้อ · คำสั่ง prod ${prodLines} บรรทัดมี ⛔ ทุกบรรทัด`) : `ไม่มี ${RUNBOOK}`);
  }
  // ── S1 ──
  {
    const p: string[] = [];
    const files = [RUNBOOK, NOTES, VERIFY, DRAFT].map((f) => [f, read(f)] as const).filter((x) => x[1] !== null) as [string, string][];
    if (!hasRb) p.push(`ไม่มี ${RUNBOOK}`);
    for (const [f, t] of files) {
      for (const m of t.matchAll(/postgres(?:ql)?:\/\/[^\s'"`<>]+:[^\s'"`<>@]+@([^\s/'"`<>]+)/g)) if (!/\.example\.invalid$/.test(m[1] as string)) p.push(`${f}: URL มีรหัสผ่าน (${(m[1] as string).slice(0, 20)}…)`);
      if (/npg_[A-Za-z0-9]{6,}/.test(t)) p.push(`${f}: npg_`);
      if (/sk-ant-/.test(t)) p.push(`${f}: sk-ant-`);
      if (/\b[0-9a-f]{32,}\b/i.test(t)) p.push(`${f}: hex ≥ 32 ตัว`);
      if (/[\w-]+\.[\w-]+\.aws\.neon\.tech|neon\.tech\//.test(t)) p.push(`${f}: hostname neon.tech`);
      if (f !== VERIFY && /ep-royal-night/.test(t)) p.push(`${f}: host prod นอก allowlist`);
    }
    chk("S1", !p.length, p.length ? p.slice(0, 5).join(" · ") : `${files.length} ไฟล์สะอาด`);
  }
  // ── Z1 ──
  {
    const tip = REV || "HEAD";
    const changed = new Set(git("diff", "--name-only", `${LANE_PIN}..${tip}`).split("\n").filter(Boolean));
    if (!REV) for (const f of git("status", "--porcelain").split("\n").filter(Boolean)) changed.add(f.slice(3).replace(/^"|"$/g, ""));
    const bad = [...changed].filter((f) => !/^(docs|scripts|ledger)\//.test(f));
    chk("Z1", gitOk("cat-file", "-e", `${LANE_PIN}^{commit}`) && !bad.length, bad.length ? `นอกขอบเขต: ${bad.slice(0, 6).join(", ")}` : `${changed.size} ไฟล์ใน docs/ scripts/ ledger/ (เทียบ ${LANE_PIN})`);
  }
  // ── G1 ──
  {
    let ok = false;
    let d = "";
    try {
      const g = JSON.parse(read(GATES) ?? "{}") as { suites?: { suite: string; mode: string }[] };
      const row = g.suites?.find((s) => s.suite === SUITE);
      ok = !!row && row.mode === "unforced";
      d = row ? `mode ${row.mode}` : "ยังไม่ลงทะเบียน";
    } catch (e) {
      d = `อ่านไม่ได้: ${(e as Error).message}`;
    }
    chk("G1", ok, d);
  }
} catch (e) {
  console.error(`💥 ${SUITE}: ${(e as Error).stack ?? e}`);
}

for (const [id] of CHECKS) if (!results.has(id)) results.set(id, { ok: false, detail: "ไม่ถึง (harness ล้ม)" });
console.log(`\n── ${SUITE} · ฐาน ${PIN} · หมุดเลน ${LANE_PIN} · ${REV ? `ทรี ณ ${REV}` : "ทรีบนดิสก์"} · POS migration ${migNames.length} ไฟล์ · ตารางเดิม ${existingTouched.size} ──`);
for (const [id, t] of CHECKS) {
  const r = results.get(id)!;
  console.log(`${r.ok ? "✅" : "❌"} ${id}  ${t}\n      → ${r.detail}`);
}
const failed = CHECKS.map(([id]) => id).filter((id) => !results.get(id)!.ok);
console.log(`\n===== ${SUITE} ===== ผ่าน ${CHECKS.length - failed.length}/${CHECKS.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: CHECKS.length, passed: CHECKS.length - failed.length, failed, skipped: false, pin: PIN, lanePin: LANE_PIN, rev: REV || null, posMigrations: migNames.length, existingTables: existingTouched.size })}`);
process.exit(failed.length ? 1 : 0);
