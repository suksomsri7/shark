// QC — SECRETARY · ข้อสอบ UI ใช้ร่วม (static ล้วน ไม่แตะฐาน) — ทุกใบ S2 เรียกด้วยรายการ route ของตัวเอง
// สร้างในใบ S0.2 (มติ 16) · ใช้: ROUTES=/secretary,/secretary/new pnpm exec tsx scripts/qc-sec-ui.mts
//
// ต่อ route (R = ชื่อไฟล์ภาพ = path ตัด / หัวท้าย แทนอักขระอื่นด้วย - เช่น /secretary/new → secretary-new · ตรงกับ qc/shoot-sec.mjs):
//   U1  หาไฟล์จอเจอ: app/(app)<path>.tsx | app/(app)<path>/index.tsx | app<path>.tsx | app<path>/index.tsx
//       (route ที่มีค่าจริงของ segment เช่น /secretary/r1 ⇒ เขียน ROUTES=/secretary/r1=app/(app)/secretary/[id].tsx)
//   U2  ทุก <Pressable>/<TouchableOpacity> ในไฟล์จอมี testID (ใส่ testID เป็น prop แรก — regex หยุดที่ ">" ตัวแรก)
//   U3  ไม่มีสีฝัง (#hex / rgba( / rgb() ในไฟล์จอ — สีมาจาก src/theme เท่านั้น
//   U4  มี fixture ของ route: ไฟล์ใน apps/mobile/qc/fixtures/secretary/*.json ที่มี route นี้ใน `expect` หรือ `routes`
//       (ตั้ง FIXTURE=<ไฟล์> เพื่อบังคับไฟล์)
//   U5  apps/mobile/qc/shots-sec/summary.json มี R (สว่าง) และ R-dark (มืด) · ok · overflow=false · errors=[] · unmocked=[] · missing=[]
//   U6  มีภาพคู่ MOCKUP|RENDER (scripts/parity-sec.sh): shots-sec/R-<อะไรก็ได้>pair*.png (สว่าง) และ R-dark-<…>pair*.png (มืด)
// ทั้งชุด:
//   U7  components/airy/** + components/secretary/** ไม่มีสีฝัง และทุก Pressable/TouchableOpacity มี testID
//
// ROUTES ว่าง ⇒ ปริยาย "/secretary" · ไม่มี summary.json ⇒ U5 FAIL (ต้องรัน qc/shoot-sec.mjs --both ก่อน)
// รัน: bash scripts/iso.sh env ROUTES=/secretary pnpm exec tsx scripts/qc-sec-ui.mts
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const M = join(ROOT, "apps/mobile");
const SHOTS = join(M, "qc/shots-sec");
const FIX_DIR = join(M, "qc/fixtures/secretary");
const LABEL = "qc-sec-ui";

type Res = "PASS" | "FAIL" | "SKIP";
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; name: string; res: Res; sev: Sev; why?: string }[] = [];
function chk(id: string, name: string, ok: boolean, why = "", sev: Sev = "CRITICAL") {
  cks.push({ id, name, res: ok ? "PASS" : "FAIL", sev, why });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${ok ? "" : ` — ${why}`}`);
}
const rd = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const HEX = /#[0-9a-fA-F]{3,8}\b|rgba?\(/;
function pressablesWithoutId(src: string): number {
  const opens = src.match(/<(Pressable|TouchableOpacity)\b[^>]*>/g) ?? [];
  return opens.filter((o) => !/testID=/.test(o)).length;
}
function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e)) out.push(p);
  }
  return out;
}
const routeName = (r: string) => r.replace(/^\/+|\/+$/g, "").replace(/[^A-Za-z0-9_]+/g, "-") || "index";
const rel = (p: string) => p.slice(ROOT.length + 1);

type Shot = { name?: string; route?: string; dark?: boolean; ok?: boolean; overflow?: boolean; errors?: string[]; unmocked?: string[]; missing?: string[] };
let screens: Shot[] = [];
let sumErr = "";
try {
  screens = existsSync(join(SHOTS, "summary.json")) ? (JSON.parse(readFileSync(join(SHOTS, "summary.json"), "utf8")).screens ?? []) : [];
  if (!existsSync(join(SHOTS, "summary.json"))) sumErr = "ไม่มี apps/mobile/qc/shots-sec/summary.json (รัน qc/shoot-sec.mjs --both)";
} catch (e) {
  sumErr = `อ่าน summary.json ไม่ได้: ${String(e)}`;
}
const pairs = existsSync(SHOTS) ? readdirSync(SHOTS).filter((f) => /pair.*\.png$/i.test(f)) : [];
const fixtures = existsSync(FIX_DIR) ? readdirSync(FIX_DIR).filter((f) => f.endsWith(".json")).map((f) => join(FIX_DIR, f)) : [];
function fixtureFor(route: string): string | null {
  const forced = process.env.FIXTURE;
  const list = forced ? [forced.startsWith("/") ? forced : join(ROOT, forced)] : fixtures;
  for (const f of list) {
    try {
      const j = JSON.parse(rd(f));
      const routes: string[] = [...Object.keys(j.expect ?? {}), ...(Array.isArray(j.routes) ? j.routes : [])];
      if (routes.includes(route)) return f;
    } catch {
      /* ไฟล์เสีย = ไม่นับ */
    }
  }
  return null;
}

const ROUTES = String(process.env.ROUTES ?? "/secretary").split(",").map((s) => s.trim()).filter(Boolean);
console.log(`${LABEL}: ${ROUTES.length} route — ${ROUTES.join(", ")}`);

for (const spec of ROUTES) {
  const [route, forcedFile] = spec.split("=");
  const R = routeName(route);
  // U1 ไฟล์จอ
  const cands = forcedFile
    ? [join(M, forcedFile)]
    : [join(M, "app/(app)" + route + ".tsx"), join(M, "app/(app)" + route, "index.tsx"), join(M, "app" + route + ".tsx"), join(M, "app" + route, "index.tsx")];
  const file = cands.find((p) => existsSync(p) && statSync(p).isFile()) ?? null;
  chk(`U1-${R}`, `${route}: มีไฟล์จอ`, !!file, `ไม่พบ: ${cands.map(rel).join(" | ")}`);
  const src = file ? rd(file) : "";
  // U2 testID · U3 สีฝัง
  const noId = pressablesWithoutId(src);
  chk(`U2-${R}`, `${route}: ทุก Pressable/TouchableOpacity มี testID`, !!file && noId === 0, file ? `ขาด testID ${noId} จุด ใน ${rel(file)}` : "ไม่มีไฟล์");
  chk(`U3-${R}`, `${route}: ไม่มี #hex / rgba( / rgb( ในไฟล์จอ`, !!file && !HEX.test(stripComments(src)), file ? `พบสีฝังใน ${rel(file)}` : "ไม่มีไฟล์");
  // U4 fixture
  const fx = fixtureFor(route);
  chk(`U4-${R}`, `${route}: มี fixture ใน qc/fixtures/secretary ที่ระบุ route นี้`, !!fx, process.env.FIXTURE ? `FIXTURE=${process.env.FIXTURE} ไม่มี route นี้ใน expect/routes` : "ไม่มีไฟล์ไหนระบุ route นี้");
  // U5 summary สว่าง + มืด
  const find = (dark: boolean) => screens.find((s) => s.name === R + (dark ? "-dark" : "")) ?? screens.find((s) => s.route === route && !!s.dark === dark);
  const good = (s?: Shot) => !!s && s.ok === true && s.overflow === false && (s.errors ?? []).length === 0 && (s.unmocked ?? []).length === 0 && (s.missing ?? []).length === 0;
  for (const dark of [false, true]) {
    const s = find(dark);
    const tag = dark ? "มืด" : "สว่าง";
    chk(
      `U5-${R}${dark ? "-dark" : ""}`,
      `${route} (${tag}): summary ok · overflow=false · errors=[] · unmocked=[] · missing=[]`,
      !sumErr && good(s),
      sumErr || (s ? JSON.stringify({ ok: s.ok, overflow: s.overflow, errors: s.errors, unmocked: s.unmocked, missing: s.missing }) : `ไม่มี screen "${R}${dark ? "-dark" : ""}" ใน summary.json`),
    );
  }
  // U6 ภาพคู่ parity
  const lightPair = pairs.filter((f) => f.startsWith(R + "-") && !f.startsWith(R + "-dark-"));
  const darkPair = pairs.filter((f) => f.startsWith(R + "-dark-"));
  chk(`U6-${R}`, `${route}: มีภาพคู่ parity สว่าง (${R}-…pair.png) และมืด (${R}-dark-…pair.png)`, lightPair.length > 0 && darkPair.length > 0, `สว่าง ${lightPair.length} · มืด ${darkPair.length}`);
}

// U7 ทั้งชุดคอมโพเนนต์
{
  const files = [...walk(join(M, "src/components/airy")), ...walk(join(M, "src/components/secretary"))];
  const hex = files.filter((f) => HEX.test(stripComments(rd(f)))).map(rel);
  const noId = files.filter((f) => pressablesWithoutId(rd(f)) > 0).map(rel);
  chk("U7.1", `components/airy + components/secretary (${files.length} ไฟล์): ไม่มีสีฝัง`, hex.length === 0, hex.slice(0, 5).join(", "));
  chk("U7.2", "components/airy + components/secretary: ทุก Pressable/TouchableOpacity มี testID", noId.length === 0, noId.slice(0, 5).join(", "));
}

const failed = cks.filter((c) => c.res === "FAIL");
const skipped = cks.filter((c) => c.res === "SKIP");
const passed = cks.filter((c) => c.res === "PASS").length;
console.log(`\n===== QC SEC UI · ${ROUTES.join(", ")} =====\nผ่าน ${passed}/${cks.length}`);
console.log("JSON_SUMMARY " + JSON.stringify({ total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), findings: failed.map((c) => ({ id: c.id, sev: c.sev })) }));
process.exit(failed.some((c) => c.sev === "CRITICAL") ? 1 : 0);
