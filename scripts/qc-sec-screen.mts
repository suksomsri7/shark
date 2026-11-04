// QC — SECRETARY จอ S2 (ทั่วไป · อ่าน SPEC=scripts/qc-sec-specs/<ใบ>.json) (static · ไม่แตะฐาน)
// สัญญา: ledger/secretary-briefs/sec-brief-S2.1.md · RESOLUTIONS §F
// กลุ่ม: R ไฟล์จอ+testID ตาม spec · X regex must/mustNot ต่อไฟล์ · U qc-sec-ui ทุก route (NO_PAIR ตาม spec) · M typecheck · D fitness
// รัน: bash scripts/iso.sh env QC_FORCE=1 SPEC=scripts/qc-sec-specs/s2.2.json pnpm exec tsx scripts/qc-sec-screen.mts
// รัน: bash scripts/iso.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-sec-screen.mts   (ต้องถ่าย shoot-sec --both ก่อน)
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const M = join(ROOT, "apps/mobile");
const LABEL = "qc-sec-screen";
const FORCED = process.env.QC_FORCE === "1";
const APP = join(M, "app/(app)");
const SPEC_PATH = process.env.SPEC ?? "";
type Spec = { wo: string; fixture: string; routes: { route: string; file: string; testIds: string[]; pair: boolean }[]; checks?: { id: string; name: string; file: string; must?: string[]; mustNot?: string[] }[] };
const SPEC = SPEC_PATH && existsSync(join(ROOT, SPEC_PATH)) ? (JSON.parse(readFileSync(join(ROOT, SPEC_PATH), "utf8")) as Spec) : null;
if (!SPEC) { console.error(`🔴 ${LABEL}: ต้องตั้ง SPEC=scripts/qc-sec-specs/<ใบ>.json`); process.exit(4); }
const FIRST = join(M, SPEC.routes[0]!.file);
if (!FORCED && !existsSync(FIRST)) {
  console.log(`⏭️  ${LABEL} (${SPEC.wo}): ยังไม่มี ${SPEC.routes[0]!.file} (ใบยังไม่เริ่ม) และไม่ได้ตั้ง QC_FORCE=1 — SKIP`);
  console.log("JSON_SUMMARY " + JSON.stringify({ total: 0, passed: 0, failed: [], skipped: ["ALL"], reason: "not-started" }));
  process.exit(0);
}
type Sev = "CRITICAL" | "MAJOR" | "MINOR"; type Res = "PASS" | "FAIL" | "SKIP";
const cks: { id: string; res: Res; sev: Sev; why: string }[] = [];
const chk = (id: string, name: string, ok: boolean, detail = "", sev: Sev = "CRITICAL") => { cks.push({ id, res: ok ? "PASS" : "FAIL", sev, why: detail }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${ok ? "" : " — " + detail}`); };
const rd = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const walk = (d: string): string[] => (existsSync(d) ? readdirSync(d).flatMap((f) => { const q = join(d, f); return statSync(q).isDirectory() ? walk(q) : /\.tsx?$/.test(f) ? [q] : []; }) : []);

console.log(`── R: ไฟล์จอ + testID (${SPEC.wo}) ──`);
for (const r of SPEC.routes) {
  const f = join(M, r.file); const s = strip(rd(f));
  const miss = r.testIds.filter((t) => !s.includes(`"${t}"`) && !s.includes(`'${t}'`) && !s.includes("`" + t));
  chk(`R-${r.route}`, `${r.route}: ไฟล์ ${r.file} มี · testID ครบ (${r.testIds.length}) · ไม่มีสีฝัง · ไม่มีไทยฝัง`, existsSync(f) && miss.length === 0 && !/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(s) && !/[฀-๿]/.test(s.replace(/testID=["'][^"']*["']/g, "")), existsSync(f) ? `ขาด testID: ${miss.join(",")}` + (/[฀-๿]/.test(s.replace(/testID=["'][^"']*["']/g, "")) ? " · ไทยฝัง" : "") : "ไม่มีไฟล์");
}
console.log("── X: regex ──");
for (const c of SPEC.checks ?? []) {
  const s = strip(rd(join(M, c.file)));
  const mustMiss = (c.must ?? []).filter((re) => !new RegExp(re).test(s)); const mustHit = (c.mustNot ?? []).filter((re) => new RegExp(re).test(s));
  chk(c.id, c.name, mustMiss.length === 0 && mustHit.length === 0, JSON.stringify({ miss: mustMiss.slice(0, 3), hit: mustHit.slice(0, 3) }));
}
console.log("── U: qc-sec-ui ──");
{
  const routeArg = SPEC.routes.map((r) => (/\[/.test(r.file) || !/^\/secretary|^\/customers|^\/business/.test(r.route) ? `${r.route}=${r.file}` : r.route)).join(",");
  const noPair = SPEC.routes.filter((r) => !r.pair).map((r) => r.route).join(",");
  const ui = spawnSync("pnpm", ["exec", "tsx", "scripts/qc-sec-ui.mts"], { cwd: ROOT, encoding: "utf8", env: { ...process.env, ROUTES: routeArg, NO_PAIR: noPair, FIXTURE: SPEC.fixture }, timeout: 600_000, maxBuffer: 64 * 1024 * 1024 });
  const line = (ui.stdout ?? "").split("\n").find((l) => l.startsWith("JSON_SUMMARY")) ?? "";
  let failed: string[] = ["no-summary"];
  try { failed = JSON.parse(line.replace("JSON_SUMMARY ", "")).failed as string[]; } catch { /* */ }
  chk("U-1", `qc-sec-ui ผ่านทุก route (${SPEC.routes.length} · ภาพคู่: ${SPEC.routes.filter((r) => r.pair).map((r) => r.route).join(",") || "-"})`, ui.status === 0 && failed.length === 0, failed.slice(0, 8).join(" · "));
}

console.log("── M: typecheck mobile ──");
if (process.env.QC_SKIP_TSC === "1") { cks.push({ id: "M-1", res: "SKIP", sev: "CRITICAL", why: "QC_SKIP_TSC" }); console.log("  ⏭️  [M-1] typecheck — SKIP"); }
else { const r = spawnSync("npm", ["run", "-s", "typecheck"], { cwd: M, encoding: "utf8", timeout: 600_000, maxBuffer: 64 * 1024 * 1024 }); chk("M-1", "apps/mobile typecheck 0", r.status === 0, (r.stdout + r.stderr).split("\n").filter((l) => /error TS/.test(l)).slice(0, 4).join(" | ")); }

console.log("── D: fitness ──");
{
  const f1 = spawnSync("pnpm", ["fitness"], { cwd: ROOT, encoding: "utf8", timeout: 600_000, maxBuffer: 64 * 1024 * 1024 });
  chk("D-1", "pnpm fitness (มี env) exit 0", f1.status === 0, (f1.stdout ?? "").split("\n").filter((l) => /❌|CRITICAL/.test(l)).slice(0, 3).join(" | "));
  const env2 = { ...process.env }; delete env2.DATABASE_URL; delete env2.DIRECT_URL;
  const f2 = spawnSync("pnpm", ["fitness"], { cwd: ROOT, encoding: "utf8", env: env2, timeout: 600_000, maxBuffer: 64 * 1024 * 1024 });
  chk("D-2", "pnpm fitness (ไม่มี env) exit 0", f2.status === 0, (f2.stdout ?? "").split("\n").filter((l) => /❌|CRITICAL/.test(l)).slice(0, 3).join(" | "));
}
const passed = cks.filter((c) => c.res === "PASS").length; const failed = cks.filter((c) => c.res === "FAIL"); const skipped = cks.filter((c) => c.res === "SKIP");
console.log(`\n${LABEL}: ${passed}/${cks.length} ผ่าน · แดง ${failed.length} · ข้าม ${skipped.length}`);
console.log("JSON_SUMMARY " + JSON.stringify({ total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), findings: failed.map((c) => ({ id: c.id, sev: c.sev })) }));
process.exit(failed.some((c) => c.sev === "CRITICAL") ? 1 : 0);
