// QC — SECRETARY S2.14 · ปิด S2: ทุก spec เขียว · ทะเบียนปุ่ม↔คลิก · ไม่มี fixture/console ในจอ · docs §2.3/§6 · typecheck · fitness (static · ไม่แตะฐาน)
// สัญญา: ledger/secretary-briefs/sec-brief-S2.14.md · RESOLUTIONS §F
// กลุ่ม: S ทุก spec ใน qc-sec-specs + qc-sec-s2.1/s2.12 (forced) · B buttons-sec.json ↔ clicks-sec.json · F ไม่มี import fixture / console.log ในจอ S2 · T three-chats ok · M typecheck · D fitness
// รัน: bash scripts/iso.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-sec-s2.14.mts   (ต้องถ่าย shoot-sec --both ก่อน)
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const M = join(ROOT, "apps/mobile");
const LABEL = "qc-sec-s2.14";
const FORCED = process.env.QC_FORCE === "1";
const APP = join(M, "app/(app)");
if (!FORCED && !existsSync(join(M, "qc/buttons-sec.json"))) {
  console.log(`⏭️  ${LABEL}: ยังไม่มี apps/mobile/qc/buttons-sec.json (ใบยังไม่เริ่ม) และไม่ได้ตั้ง QC_FORCE=1 — SKIP`);
  console.log("JSON_SUMMARY " + JSON.stringify({ total: 0, passed: 0, failed: [], skipped: ["ALL"], reason: "not-started" }));
  process.exit(0);
}
type Sev = "CRITICAL" | "MAJOR" | "MINOR"; type Res = "PASS" | "FAIL" | "SKIP";
const cks: { id: string; res: Res; sev: Sev; why: string }[] = [];
const chk = (id: string, name: string, ok: boolean, detail = "", sev: Sev = "CRITICAL") => { cks.push({ id, res: ok ? "PASS" : "FAIL", sev, why: detail }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${ok ? "" : " — " + detail}`); };
const rd = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const walk = (d: string): string[] => (existsSync(d) ? readdirSync(d).flatMap((f) => { const q = join(d, f); return statSync(q).isDirectory() ? walk(q) : /\.tsx?$/.test(f) ? [q] : []; }) : []);

console.log("── S: ทุก spec ──");
{
  const specs = readdirSync(join(ROOT, "scripts/qc-sec-specs")).filter((f) => f.endsWith(".json")).sort();
  const bad: string[] = [];
  for (const f of specs) {
    const r = spawnSync("pnpm", ["exec", "tsx", "scripts/qc-sec-screen.mts"], { cwd: ROOT, encoding: "utf8", env: { ...process.env, QC_FORCE: "1", QC_SKIP_TSC: "1", SPEC: `scripts/qc-sec-specs/${f}` }, timeout: 900_000, maxBuffer: 64 * 1024 * 1024 });
    const line = (r.stdout ?? "").split("\n").find((l) => l.startsWith("JSON_SUMMARY")) ?? "";
    let failed: string[] = ["no-summary"]; try { failed = JSON.parse(line.replace("JSON_SUMMARY ", "")).failed as string[]; } catch { /* */ }
    if (r.status !== 0 || failed.length) bad.push(`${f}:${failed.slice(0, 3).join("/")}`);
  }
  chk("S-1", `ทุก spec (${specs.length}) เขียว (forced)`, bad.length === 0, bad.slice(0, 6).join(" · "));
  for (const o of ["qc-sec-s2.1", "qc-sec-s2.12"]) {
    const r = spawnSync("pnpm", ["exec", "tsx", `scripts/${o}.mts`], { cwd: ROOT, encoding: "utf8", env: { ...process.env, QC_FORCE: "1", QC_SKIP_TSC: "1" }, timeout: 900_000, maxBuffer: 64 * 1024 * 1024 });
    chk(`S-${o}`, `${o} เขียว`, r.status === 0, ((r.stdout ?? "").split("\n").find((l) => l.startsWith("JSON_SUMMARY")) ?? "").slice(0, 120));
  }
}
console.log("── B: ทะเบียนปุ่ม ──");
{
  const inv = join(ROOT, "scripts/sec-ui-inventory.json"), btn = join(M, "qc/buttons-sec.json"), clk = join(M, "qc/shots-sec/clicks-sec.json");
  let ok = existsSync(btn) && existsSync(clk); let why = ok ? "" : "ไม่มี buttons-sec.json/clicks-sec.json";
  if (ok) {
    try {
      const B = JSON.parse(readFileSync(btn, "utf8")) as { testID: string; action: string }[];
      const C = JSON.parse(readFileSync(clk, "utf8")) as { testID: string; ok: boolean; effect?: string }[];
      const cmap = new Map(C.map((c) => [c.testID, c]));
      const screens = [...walk(join(APP, "secretary")), ...walk(join(APP, "customers")), ...walk(join(APP, "business")), join(M, "app/login.tsx"), join(M, "app/signup.tsx"), join(M, "app/otp.tsx"), join(M, "app/phone.tsx")].filter((f) => !/_gallery/.test(f));
      const ids = new Set<string>(); for (const f of screens) for (const m of strip(rd(f)).matchAll(/testID=["'`]([a-z][a-z0-9-]+)/g)) ids.add(m[1]!);
      const notInReg = [...ids].filter((id) => !B.some((b) => b.testID === id));
      const dead = B.filter((b) => !cmap.get(b.testID)?.ok);
      ok = notInReg.length === 0 && dead.length === 0 && B.length >= 150; why = JSON.stringify({ ids: ids.size, reg: B.length, notInReg: notInReg.slice(0, 5), dead: dead.slice(0, 5).map((d) => d.testID) });
    } catch (e) { ok = false; why = errMsg(e); }
  }
  chk("B-1", "ทุก testID ในจอ S2 อยู่ใน buttons-sec.json (≥150) และ clicks-sec.json ยืนยันว่ากดแล้วมีผล (ok) ทุกปุ่ม", ok, why);
}
console.log("── F: ไม่มี fixture/console ในจอ ──");
{
  const screens = [...walk(join(APP, "secretary")), ...walk(join(APP, "customers")), ...walk(join(APP, "business")), ...walk(join(M, "src/components/secretary")), ...walk(join(M, "src/components/customers")), join(M, "app/login.tsx"), join(M, "app/signup.tsx"), join(M, "app/otp.tsx"), join(M, "app/phone.tsx")].filter((f) => !/_gallery/.test(f));
  const fx = screens.filter((f) => /@\/qc\/fixtures/.test(rd(f))); const cl = screens.filter((f) => /console\.(log|debug)\(/.test(strip(rd(f))));
  chk("F-1", "ไม่มี import @/qc/fixtures และไม่มี console.log/debug ในจอ+คอมโพเนนต์ S2", fx.length === 0 && cl.length === 0, JSON.stringify({ fx: fx.map((f) => f.replace(M + "/", "")).slice(0, 4), cl: cl.map((f) => f.replace(M + "/", "")).slice(0, 4) }));
  const doc = rd(join(ROOT, "docs/modules/31-secretary.md"));
  chk("F-2", "docs §2.3 ตารางจอ↔route↔endpoint มี ≥ 30 แถว", (doc.match(/^\| \/(secretary|customers|business|login|signup|otp|phone)/gm) ?? []).length >= 30, String((doc.match(/^\| \/(secretary|customers|business|login|signup|otp|phone)/gm) ?? []).length));
}
console.log("── T: three-chats ──");
{
  const f = join(M, "qc/shots-sec/three-chats.json"); let ok = false, why = "ไม่มีไฟล์";
  if (existsSync(f)) { try { const j = JSON.parse(readFileSync(f, "utf8")) as { ok: boolean }; ok = j.ok === true; why = JSON.stringify(j).slice(0, 120); } catch (e) { why = errMsg(e); } }
  chk("T-1", "three-chats.json ok:true (S2.20)", ok, why);
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
