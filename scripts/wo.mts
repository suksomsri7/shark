// Work Order ledger — สถานะงานที่ "เครื่องอ่านได้" แทนการเล่าเป็นข้อความ
//
// ปัญหาที่แก้: _HANDOFF.md เป็นเรื่องเล่า 18KB ปนประวัติ+สถานะ+คำสั่งในบูลเล็ตเดียว
//   → agent ใหม่ต้อง "ตีความ" ว่าค้างตรงไหน = จุดที่ context หาย
//   → เขียนว่า "Finance-WHT เสร็จเกือบหมด" = resume ไม่ได้ ต้องไปไล่โค้ดเอง
//   → ป้าย "ห้าม deploy" ค้าง 3 วันทั้งที่งานเสร็จแล้ว เพราะไม่มีใครรันเทสต์ซ้ำ
//
// หลัก: **"เสร็จ" ต้องเป็นคำสั่งที่รันได้ ไม่ใช่คำบรรยาย**
//   `pnpm resume` = boot protocol ทั้งหมด — บอกว่างานไหน active, step ถัดไปคืออะไร,
//   และรัน doneWhen จริง ๆ ให้ดูว่าผ่าน/ไม่ผ่าน → agent ใหม่ไม่ต้องเดา
//
// ⚠️ ไฟล์ ledger ต้องเขียนด้วยเครื่องมือนี้เท่านั้น (pnpm wo:* / pnpm ckpt)
//    ถ้าให้คน/agent พิมพ์เอง มันจะกลายเป็น _HANDOFF.md v2 ใน 3 สัปดาห์
//
// ใช้:
//   pnpm resume                      → ดูงานค้าง + step ถัดไป + doneWhen สด ๆ
//   pnpm wo:new WO-0002 "หัวข้อ"      → เปิดงานใหม่
//   pnpm wo:list                     → ดูทั้งหมด
//   pnpm wo:claim WO-0002            → รับงาน (ผูก session ปัจจุบัน)
//   pnpm ckpt "ทำ X เสร็จ"            → ติ๊ก step ถัดไป + บันทึก log (ไม่ commit ให้ — commit เอง)

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { execSync } from "node:child_process";

const ROOT = resolve(import.meta.dirname, "..");
const DIR = join(ROOT, "ledger", "wo");

export type Step = { done: boolean; text: string };
export type DoneWhen = { cmd: string; expect?: string };
export type WO = {
  id: string;
  title: string;
  status: "queued" | "claimed" | "in_progress" | "blocked" | "review" | "done" | "abandoned";
  owner?: string;
  branch?: string;
  worktree?: string;
  neonBranch?: string;
  files: string[];
  closesFindings: string[];
  dependsOn: string[];
  doneWhen: DoneWhen[];
  steps: Step[];
  log: { at: string; note: string }[];
};

const path = (id: string) => join(DIR, `${id}.json`);
const load = (id: string): WO => JSON.parse(readFileSync(path(id), "utf8"));
const save = (w: WO) => writeFileSync(path(w.id), JSON.stringify(w, null, 2) + "\n");
const all = (): WO[] =>
  existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith(".json")).map((f) => load(f.replace(/\.json$/, ""))).sort((a, b) => a.id.localeCompare(b.id)) : [];

const ACTIVE: WO["status"][] = ["claimed", "in_progress", "blocked", "review"];
const nowIso = () => new Date().toISOString().replace(/\.\d+Z$/, "Z");

/** รัน doneWhen จริง — นี่คือหัวใจ: "เสร็จ" ตัดสินด้วยเครื่อง ไม่ใช่ด้วยความเห็น */
function runCheck(d: DoneWhen): { ok: boolean; detail: string } {
  try {
    const out = execSync(d.cmd, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 600_000 });
    if (d.expect && !out.includes(d.expect)) return { ok: false, detail: `ไม่เจอ "${d.expect}" ในผลลัพธ์` };
    return { ok: true, detail: d.expect ? `เจอ "${d.expect}"` : "exit 0" };
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    const tail = (err.stdout || err.stderr || err.message || "").trim().split("\n").slice(-1)[0] ?? "";
    return { ok: false, detail: tail.slice(0, 120) || "ล้มเหลว" };
  }
}

// ─────────────────── commands ───────────────────

function resume(opts: { check: boolean }) {
  const active = all().filter((w) => ACTIVE.includes(w.status));
  const queued = all().filter((w) => w.status === "queued");

  if (!active.length && !queued.length) {
    console.log("ไม่มีงานค้าง — เปิดงานใหม่ด้วย: pnpm wo:new WO-xxxx \"หัวข้อ\"");
    return;
  }

  for (const w of active) {
    console.log(`\n━━━ ${w.id} · ${w.title}`);
    console.log(`สถานะ: ${w.status}${w.owner ? ` · ถือโดย ${w.owner}` : ""}`);
    if (w.branch) console.log(`branch: ${w.branch}${w.worktree ? ` · worktree ${w.worktree}` : ""}${w.neonBranch ? ` · neon ${w.neonBranch}` : ""}`);
    if (w.files.length) console.log(`ไฟล์ที่ถือ: ${w.files.join(" · ")}`);

    const next = w.steps.find((s) => !s.done);
    console.log(`\nขั้นตอน (${w.steps.filter((s) => s.done).length}/${w.steps.length}):`);
    for (const s of w.steps) console.log(`  [${s.done ? "x" : " "}] ${s.text}`);
    console.log(next ? `\n👉 ทำต่อที่: ${next.text}` : `\n👉 ครบทุก step แล้ว — เหลือให้ doneWhen ผ่าน`);

    console.log(`\nเสร็จเมื่อ (${opts.check ? "รันจริง" : "ยังไม่รัน — ใส่ --check เพื่อรัน"}):`);
    for (const d of w.doneWhen) {
      if (!opts.check) { console.log(`  ?  ${d.cmd}${d.expect ? `  → ต้องเจอ "${d.expect}"` : ""}`); continue; }
      process.stdout.write(`  … ${d.cmd}\r`);
      const r = runCheck(d);
      console.log(`  ${r.ok ? "✅" : "❌"} ${d.cmd} — ${r.detail}`);
    }
    if (w.log.length) {
      const last = w.log[w.log.length - 1];
      console.log(`\nล่าสุด: ${last.at} — ${last.note}`);
    }
  }
  if (queued.length) {
    console.log(`\n━━━ รอคิว (${queued.length})`);
    for (const w of queued) {
      const blocked = w.dependsOn.filter((d) => { try { return load(d).status !== "done"; } catch { return true; } });
      console.log(`  ${w.id} · ${w.title}${blocked.length ? `  ⛔ ติด ${blocked.join(",")}` : "  ✅ รับได้"}`);
    }
  }
  console.log("");
}

function create(id: string, title: string) {
  mkdirSync(DIR, { recursive: true });
  if (existsSync(path(id))) throw new Error(`${id} มีอยู่แล้ว`);
  const w: WO = {
    id, title, status: "queued",
    branch: `wo/${id.replace(/^WO-/, "")}`,
    worktree: `/root/wt/${id.replace(/^WO-/, "")}`,
    neonBranch: `wo-${id.replace(/^WO-/, "")}`,
    files: [], closesFindings: [], dependsOn: [],
    doneWhen: [{ cmd: "pnpm fitness", expect: "FINDINGS: CRITICAL 0 · MAJOR 0" }, { cmd: "pnpm typecheck" }],
    steps: [], log: [{ at: nowIso(), note: "เปิดงาน" }],
  };
  save(w);
  console.log(`✅ สร้าง ${id} → ledger/wo/${id}.json`);
}

function claim(id: string) {
  const w = load(id);
  const blocked = w.dependsOn.filter((d) => { try { return load(d).status !== "done"; } catch { return true; } });
  if (blocked.length) throw new Error(`${id} ติด ${blocked.join(",")} — ยังรับไม่ได้`);
  w.owner = `session-${nowIso()}`;
  w.status = "in_progress";
  w.log.push({ at: nowIso(), note: "รับงาน" });
  save(w);
  console.log(`✅ รับ ${id} แล้ว · owner=${w.owner}`);
  resume({ check: false });
}

/** ติ๊ก step ถัดไป + บันทึก log — เรียกทุก ~20 นาที หรือทุก step ที่จบ (agent ตายเสีย ≤1 step) */
function ckpt(note: string) {
  const active = all().filter((w) => ACTIVE.includes(w.status));
  if (active.length !== 1) throw new Error(`มีงาน active ${active.length} ตัว — ระบุไม่ได้ว่าจะ ckpt อันไหน (ต้องมี 1)`);
  const w = active[0];
  const next = w.steps.find((s) => !s.done);
  if (next) next.done = true;
  w.log.push({ at: nowIso(), note });
  save(w);
  console.log(`✅ ${w.id}: ${next ? `ติ๊ก "${next.text}"` : "(ไม่มี step เหลือ)"} · ${w.steps.filter((s) => s.done).length}/${w.steps.length}`);
  const after = w.steps.find((s) => !s.done);
  if (after) console.log(`👉 ต่อไป: ${after.text}`);
}

/** ปิดงาน — ยอมปิดเฉพาะเมื่อ doneWhen ผ่านครบจริง (รันสดตอนนี้ ไม่เชื่อคำบอก) */
function done(id: string) {
  const w = load(id);
  const fails: string[] = [];
  for (const d of w.doneWhen) {
    process.stdout.write(`  … ${d.cmd}\r`);
    const r = runCheck(d);
    console.log(`  ${r.ok ? "✅" : "❌"} ${d.cmd} — ${r.detail}`);
    if (!r.ok) fails.push(d.cmd);
  }
  const unstepped = w.steps.filter((s) => !s.done);
  if (fails.length || unstepped.length) {
    throw new Error(
      `ปิด ${id} ไม่ได้ — ` +
        (fails.length ? `doneWhen แดง ${fails.length} ข้อ` : "") +
        (unstepped.length ? ` step ค้าง ${unstepped.length}` : ""),
    );
  }
  w.status = "done";
  w.log.push({ at: nowIso(), note: "ปิดงาน — doneWhen ผ่านครบ (รันสดยืนยัน)" });
  save(w);
  console.log(`\n🎉 ${w.id} ปิดแล้ว`);
}

function list() {
  const ws = all();
  if (!ws.length) return console.log("(ยังไม่มี WO)");
  for (const w of ws) {
    const done = w.steps.filter((s) => s.done).length;
    console.log(`  ${w.id.padEnd(9)} ${w.status.padEnd(12)} ${String(`${done}/${w.steps.length}`).padEnd(6)} ${w.title}`);
  }
}

const [cmd, ...rest] = process.argv.slice(2);
try {
  if (cmd === "resume") resume({ check: rest.includes("--check") });
  else if (cmd === "new") create(rest[0], rest.slice(1).join(" "));
  else if (cmd === "claim") claim(rest[0]);
  else if (cmd === "ckpt") ckpt(rest.join(" "));
  else if (cmd === "done") done(rest[0]);
  else if (cmd === "list") list();
  else { console.error("ใช้: wo.mts resume [--check] | new <id> <title> | claim <id> | ckpt <note> | list"); process.exit(1); }
} catch (e) {
  console.error(`❌ ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
