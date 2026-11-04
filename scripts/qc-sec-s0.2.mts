// QC — SECRETARY S0.2 · Airy theme in the app (RN) + render/parity tooling + shared UI oracle · oracle ของผู้คุม — builder ห้ามแก้ไฟล์นี้
// สัญญา: ledger/SECRETARY-MASTER-PLAN.md แถว S0.2 · ใบสั่ง ledger/secretary-briefs/sec-brief-S0.2.md (Deliverables 1–8 + "Also in this WO")
//
// กลุ่มข้อ:
//   S1  shim: `apps/mobile/src/theme.ts` ยังส่งออก C/R/S ค่าเดิมทุกคีย์ (จอ 1.0 ไม่เปลี่ยน)
//   S2  โทเคน: light/dark คีย์ชุดเดียวกัน · ทุกค่าเป็นสี/ตัวเลข · มี zone.customers/zone.team · ไม่มี mic ใน InputBar
//   S3  ไม่มีสีฝัง (#hex / rgba(/rgb() ใน components/airy/** และ app/(app)/secretary/**
//   S4  ทุก Pressable/TouchableOpacity ใน 2 โฟลเดอร์นั้นมี testID
//   S5  เครื่องมือ: shoot-sec.mjs parse ได้ · parity-sec.sh exit 2 เมื่อ arg ผิด · qc-sec-ui.mts มีอยู่และ parse ได้
//   S6  summary.json ของ /secretary สว่าง+มืด: overflow=false · unmocked=[] · errors=[] + ภาพคู่ C3 ทั้ง 2 โหมดมีอยู่
//   S7  _gallery ถูก guard (__DEV__ หรือ EXPO_PUBLIC_QC)
//   S8  apps/mobile typecheck 0 (รันในตัวข้อสอบ · ข้ามเมื่อ QC_SKIP_TSC=1 — ผู้คุมรันเองตอนรับใบ)
//   X10 fixture ไม่มีอะไรคล้าย token/คีย์จริง
//
// static ล้วน ไม่แตะฐานข้อมูล · unforced (ไม่มี QC_FORCE) + ยังไม่มีโฟลเดอร์ theme ⇒ SKIP exit 0 · forced ⇒ แดงด้วยเหตุผลที่ถูก
// รัน: bash scripts/iso.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-sec-s0.2.mts   (จากรากรีโป)
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const M = join(ROOT, "apps/mobile");
const LABEL = "qc-sec-s0.2";
const FORCED = process.env.QC_FORCE === "1";

type Res = "PASS" | "FAIL" | "SKIP";
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; name: string; res: Res; sev: Sev; why?: string }[] = [];
function chk(id: string, name: string, ok: boolean, why = "", sev: Sev = "CRITICAL") {
  cks.push({ id, name, res: ok ? "PASS" : "FAIL", sev, why });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${ok ? "" : ` — ${why}`}`);
}
function skip(id: string, name: string, why: string, sev: Sev = "CRITICAL") {
  cks.push({ id, name, res: "SKIP", sev, why });
  console.log(`  ⏭️  [${id}] ${name} — SKIP: ${why}`);
}
const rd = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|mjs)$/.test(e)) out.push(p);
  }
  return out;
}

// ── 0. unforced + ยังไม่มีของ builder ⇒ SKIP ทั้งชุด
const THEME = join(M, "src/theme");
if (!FORCED && !existsSync(THEME)) {
  console.log(`⏭️  ${LABEL}: ยังไม่มี apps/mobile/src/theme/ (ใบยังไม่เริ่ม) และไม่ได้ตั้ง QC_FORCE=1 — SKIP`);
  console.log("JSON_SUMMARY " + JSON.stringify({ total: 0, passed: 0, failed: [], skipped: ["ALL"], reason: "not-started" }));
  process.exit(0);
}

// ── S1 shim C/R/S (เฉลยจาก base e59e5707 — ค่าเดิมในไฟล์ 20 บรรทัด)
{
  const shim = rd(join(M, "src/theme.ts"));
  chk("S1.1", "src/theme.ts ยังมีอยู่และส่งออก C, R, S", /export (const|\{)[^;]*\bC\b/.test(shim) && /\bR\b/.test(shim) && /\bS\b/.test(shim), "ไม่พบ export C/R/S");
  const base = spawnSync("git", ["show", "e59e5707:apps/mobile/src/theme.ts"], { cwd: ROOT, encoding: "utf8" }).stdout ?? "";
  const keys = (src: string) => Array.from(src.matchAll(/^\s*([a-zA-Z]+):\s*("[^"]+"|\d+)/gm)).map((m) => `${m[1]}=${m[2]}`).sort();
  const baseKeys = keys(base);
  // shim อาจ re-export จาก theme/light — ถ้าใช่ ให้ตรวจที่ไฟล์ปลายทางด้วย
  const light = rd(join(THEME, "light.ts"));
  const have = new Set([...keys(shim), ...keys(light)]);
  const missing = baseKeys.filter((k) => !have.has(k));
  chk("S1.2", `ค่า C/R/S เดิมทุกคู่ (${baseKeys.length}) ยังมีค่าเท่าเดิม`, baseKeys.length > 0 && missing.length === 0, `หาย/เปลี่ยน: ${missing.slice(0, 6).join(", ")}`);
}

// ── S2 โทเคน
{
  const need = ["tokens.ts", "light.ts", "dark.ts", "index.ts"];
  for (const f of need) chk(`S2.0-${f}`, `มี src/theme/${f}`, existsSync(join(THEME, f)), "ไม่มีไฟล์");
  const keyset = (src: string) => new Set(Array.from(src.matchAll(/^\s{2,}([a-zA-Z]+):/gm)).map((m) => m[1]));
  const L = keyset(rd(join(THEME, "light.ts")));
  const D = keyset(rd(join(THEME, "dark.ts")));
  const onlyL = [...L].filter((k) => !D.has(k));
  const onlyD = [...D].filter((k) => !L.has(k));
  chk("S2.1", "light/dark คีย์ชุดเดียวกัน", L.size > 10 && onlyL.length === 0 && onlyD.length === 0, `light-only: ${onlyL.join(",")} · dark-only: ${onlyD.join(",")}`);
  const lt = rd(join(THEME, "light.ts")) + rd(join(THEME, "dark.ts"));
  for (const k of ["glass", "status", "sys", "zone", "accent", "bubbleUser", "warn"]) chk(`S2.2-${k}`, `มีกลุ่มโทเคน ${k}`, new RegExp(`\\b${k}\\s*[:=]`).test(lt), "ไม่พบ");
  chk("S2.3", "zone มี customers (#1f8f4a) และ team (#5a64d8)", /customers:\s*"#1f8f4a"/i.test(lt) && /team:\s*"#5a64d8"/i.test(lt), "สีโซนไม่ตรงแบบ");
  chk("S2.4", "index.ts ส่งออก useTheme + ThemeProvider", /export (function|const) useTheme/.test(rd(join(THEME, "index.ts"))) && /ThemeProvider/.test(rd(join(THEME, "index.ts"))), "ไม่พบ");
  chk("S2.5", "theme-store รองรับ system|light|dark", /system/.test(rd(join(M, "src/lib/theme-store.ts"))) && /dark/.test(rd(join(M, "src/lib/theme-store.ts"))), "ไม่มี src/lib/theme-store.ts หรือไม่มี 3 ค่า");
  const inp = rd(join(M, "src/components/airy/InputBar.tsx"));
  chk("S2.6", "InputBar ไม่มีปุ่มไมค์ (มติ 16)", inp.length > 0 && !/mic|Mic|microphone/.test(inp), inp ? "พบ mic ใน InputBar" : "ไม่มี InputBar.tsx");
}

// ── S3 ไม่มีสีฝัง · S4 testID
{
  const files = [...walk(join(M, "src/components/airy")), ...walk(join(M, "app/(app)/secretary"))];
  chk("S3.0", "มีคอมโพเนนต์ airy ≥ 12 ไฟล์ + จอ secretary ≥ 2 ไฟล์", walk(join(M, "src/components/airy")).length >= 12 && walk(join(M, "app/(app)/secretary")).length >= 2, `airy=${walk(join(M, "src/components/airy")).length} secretary=${walk(join(M, "app/(app)/secretary")).length}`);
  const hex: string[] = [];
  const noId: string[] = [];
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    const rel = f.slice(ROOT.length + 1);
    if (/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(src.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, ""))) hex.push(rel);
    const opens = src.match(/<(Pressable|TouchableOpacity)\b[^>]*>/gs) ?? [];
    for (const o of opens) if (!/testID=/.test(o)) noId.push(rel);
  }
  chk("S3.1", "ไม่มี #hex / rgb( ใน components/airy + app/(app)/secretary", hex.length === 0, hex.slice(0, 5).join(", "));
  chk("S4.1", "ทุก Pressable/TouchableOpacity มี testID", noId.length === 0, [...new Set(noId)].slice(0, 5).join(", "));
}

// ── S5 เครื่องมือ
{
  const shoot = join(M, "qc/shoot-sec.mjs");
  chk("S5.1", "มี apps/mobile/qc/shoot-sec.mjs และ parse ได้", existsSync(shoot) && spawnSync("node", ["--check", shoot], { encoding: "utf8" }).status === 0, "ไม่มีหรือ syntax error");
  const par = join(ROOT, "scripts/parity-sec.sh");
  const bad = existsSync(par) ? spawnSync("bash", [par], { encoding: "utf8" }).status : -1;
  chk("S5.2", "scripts/parity-sec.sh มี และ exit 2 เมื่อไม่มี arg", bad === 2, `exit=${bad}`);
  const ui = join(ROOT, "scripts/qc-sec-ui.mts");
  chk("S5.3", "มี scripts/qc-sec-ui.mts (ข้อสอบ UI ใช้ร่วม) และกล่าวถึง testID/overflow/unmocked/parity", existsSync(ui) && ["testID", "overflow", "unmocked", "parity"].every((k) => rd(ui).includes(k)), "ไม่มีหรือไม่ครบ 4 เกณฑ์");
  chk("S5.4", "shoot-sec รองรับ --dark และ FIXTURE", /--dark/.test(rd(shoot)) && /FIXTURE/.test(rd(shoot)), "ไม่พบ --dark/FIXTURE", "MAJOR");
}

// ── S6 summary + ภาพคู่
{
  const sum = join(M, "qc/shots-sec/summary.json");
  let ok = false, why = "ไม่มี summary.json";
  if (existsSync(sum)) {
    try {
      const j = JSON.parse(readFileSync(sum, "utf8"));
      const scr: { name: string; ok: boolean; overflow?: boolean; unmocked?: string[]; errors?: string[]; dark?: boolean; url?: string }[] = j.screens ?? [];
      const light = scr.find((s) => /secretary/.test(s.name ?? s.url ?? "") && !s.dark && !/dark/.test(s.name ?? ""));
      const dark = scr.find((s) => /secretary/.test(s.name ?? s.url ?? "") && (s.dark || /dark/.test(s.name ?? "")));
      const good = (s?: typeof scr[number]) => !!s && s.ok && !s.overflow && (s.unmocked ?? []).length === 0 && (s.errors ?? []).length === 0;
      ok = good(light) && good(dark);
      why = `light=${JSON.stringify(light && { ok: light.ok, overflow: light.overflow, unmocked: light.unmocked, errors: light.errors })} dark=${JSON.stringify(dark && { ok: dark.ok, overflow: dark.overflow })}`;
    } catch (e) { why = `parse: ${String(e)}`; }
  }
  chk("S6.1", "/secretary สว่าง+มืด: ok · overflow=false · unmocked=[] · errors=[]", ok, why);
  const pairs = existsSync(join(M, "qc/shots-sec")) ? readdirSync(join(M, "qc/shots-sec")).filter((f) => /pair.*\.png$/i.test(f)) : [];
  chk("S6.2", "มีภาพคู่ MOCKUP|RENDER ของ C3 ≥ 2 ไฟล์ (สว่าง/มืด)", pairs.length >= 2, `พบ ${pairs.length}: ${pairs.join(",")}`);
}

// ── S7 gallery guard
{
  const g = rd(join(M, "app/(app)/secretary/_gallery.tsx"));
  chk("S7.1", "_gallery.tsx ถูก guard ด้วย __DEV__ หรือ EXPO_PUBLIC_QC", g.length > 0 && (/__DEV__/.test(g) || /EXPO_PUBLIC_QC/.test(g)), g ? "ไม่มี guard" : "ไม่มีไฟล์");
}

// ── S8 mobile typecheck
if (process.env.QC_SKIP_TSC === "1") skip("S8.1", "apps/mobile typecheck", "QC_SKIP_TSC=1 (ผู้คุมรันแยก)");
else {
  const r = spawnSync("npm", ["run", "-s", "typecheck"], { cwd: M, encoding: "utf8", timeout: 600_000 });
  chk("S8.1", "apps/mobile `npm run typecheck` exit 0", r.status === 0, (r.stdout + r.stderr).split("\n").filter((l) => /error TS/.test(l)).slice(0, 3).join(" | "));
}

// ── X10 fixture ไม่มีของจริง
{
  const fx = rd(join(M, "qc/fixtures/secretary/s0.2.json"));
  chk("X10.1", "มี fixture s0.2.json และไม่มีสตริงคล้าย token/คีย์ (sk-, napi_, Bearer, eyJ)", fx.length > 0 && !/sk-[A-Za-z0-9]{10,}|napi_|Bearer |eyJ[A-Za-z0-9_-]{20,}/.test(fx), fx ? "พบสตริงคล้ายคีย์" : "ไม่มี fixture");
}

const failed = cks.filter((c) => c.res === "FAIL");
const skipped = cks.filter((c) => c.res === "SKIP");
const passed = cks.filter((c) => c.res === "PASS").length;
console.log(`\n===== QC SEC S0.2 · ธีม Airy + เครื่องมือเทียบภาพ =====\nผ่าน ${passed}/${cks.length}${skipped.length ? ` (SKIP ${skipped.length})` : ""}`);
console.log("JSON_SUMMARY " + JSON.stringify({ total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), findings: failed.map((c) => ({ id: c.id, sev: c.sev })) }));
// รับใบ = ผ่านทุกข้อ (SKIP S8 ยอมได้เฉพาะเมื่อผู้คุมรัน typecheck เองแล้ว)
process.exit(failed.some((c) => c.sev === "CRITICAL") ? 1 : 0);
