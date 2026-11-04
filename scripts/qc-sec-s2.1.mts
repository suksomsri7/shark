// QC — SECRETARY S2.1 · โครงแอป + นำทาง + i18n + แถบบน + ทางเข้าจากหน้าแรก 1.0 (static · ไม่แตะฐาน)
// สัญญา: ledger/secretary-briefs/sec-brief-S2.1.md · RESOLUTIONS §F
// กลุ่ม: R เส้นทางครบ · L _layout เพิ่มอย่างเดียว · T SecTopBar/BusinessSwitcher · I i18n ไม่มีไทยฝัง · E ทางเข้า 1.0 · F ค่า F ในธีม · U qc-sec-ui ทุก route (NO_PAIR ยกเว้น /secretary) · M typecheck mobile · D fitness
// รัน: bash scripts/iso.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-sec-s2.1.mts   (ต้องถ่าย shoot-sec --both ก่อน)
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const M = join(ROOT, "apps/mobile");
const LABEL = "qc-sec-s2.1";
const FORCED = process.env.QC_FORCE === "1";
const APP = join(M, "app/(app)");
if (!FORCED && !existsSync(join(APP, "secretary/new.tsx"))) {
  console.log(`⏭️  ${LABEL}: ยังไม่มี app/(app)/secretary/new.tsx (ใบยังไม่เริ่ม) และไม่ได้ตั้ง QC_FORCE=1 — SKIP`);
  console.log("JSON_SUMMARY " + JSON.stringify({ total: 0, passed: 0, failed: [], skipped: ["ALL"], reason: "not-started" }));
  process.exit(0);
}
type Sev = "CRITICAL" | "MAJOR" | "MINOR"; type Res = "PASS" | "FAIL" | "SKIP";
const cks: { id: string; res: Res; sev: Sev; why: string }[] = [];
const chk = (id: string, name: string, ok: boolean, detail = "", sev: Sev = "CRITICAL") => { cks.push({ id, res: ok ? "PASS" : "FAIL", sev, why: detail }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${ok ? "" : " — " + detail}`); };
const rd = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const walk = (d: string): string[] => (existsSync(d) ? readdirSync(d).flatMap((f) => { const q = join(d, f); return statSync(q).isDirectory() ? walk(q) : /\.tsx?$/.test(f) ? [q] : []; }) : []);

console.log("── R: เส้นทาง ──");
const ROUTES: [string, string][] = [
  ["/secretary", "secretary/index.tsx"], ["/secretary/new", "secretary/new.tsx"], ["/secretary/room/r1", "secretary/room/[id].tsx"], ["/secretary/inbox", "secretary/inbox.tsx"], ["/secretary/scheduled", "secretary/scheduled.tsx"],
  ["/secretary/staff", "secretary/staff/index.tsx"], ["/secretary/staff/m1", "secretary/staff/[membershipId].tsx"], ["/secretary/staff/invite", "secretary/staff/invite.tsx"],
  ["/secretary/settings", "secretary/settings/index.tsx"], ["/secretary/settings/secretary", "secretary/settings/secretary.tsx"], ["/secretary/settings/access", "secretary/settings/access.tsx"], ["/secretary/settings/rules", "secretary/settings/rules.tsx"], ["/secretary/settings/log", "secretary/settings/log.tsx"], ["/secretary/settings/knowledge", "secretary/settings/knowledge.tsx"], ["/secretary/settings/customers", "secretary/settings/customers.tsx"], ["/secretary/settings/account", "secretary/settings/account.tsx"], ["/secretary/settings/quota", "secretary/settings/quota.tsx"],
  ["/secretary/onboarding/name", "secretary/onboarding/name.tsx"], ["/secretary/help", "secretary/help/index.tsx"], ["/secretary/help/c1", "secretary/help/[caseId].tsx"],
  ["/customers", "customers/index.tsx"], ["/customers/x1", "customers/[id]/index.tsx"], ["/customers/x1/info", "customers/[id]/info.tsx"], ["/business/new", "business/new.tsx"],
];
const missing = ROUTES.filter(([, f]) => !existsSync(join(APP, f))).map(([r]) => r);
chk("R-1", `มีไฟล์จอครบ ${ROUTES.length} route`, missing.length === 0, missing.join(" · "));
const secLayout = rd(join(APP, "secretary/_layout.tsx"));
chk("R-2", "secretary/_layout.tsx เป็น Stack headerShown:false · ไม่ใช้ Tabs (ไม่มีแถบล่าง)", /Stack/.test(secLayout) && /headerShown:\s*false/.test(secLayout) && !/\bTabs\b/.test(secLayout), "");

console.log("── L: _layout 1.0 เพิ่มอย่างเดียว ──");
const layout = rd(join(APP, "_layout.tsx"));
const base = spawnSync("git", ["show", "9adb47a9:apps/mobile/app/(app)/_layout.tsx"], { cwd: ROOT, encoding: "utf8" }).stdout ?? "";
const baseLines = base.split("\n").filter((l) => l.trim());
const kept = baseLines.filter((l) => layout.includes(l.trim())).length;
chk("L-1", "_layout.tsx ของ 1.0: ทุกบรรทัดเดิมยังอยู่ (เพิ่ม Stack.Screen secretary/customers/business เท่านั้น)", base.length > 0 && kept === baseLines.length && /name=\"secretary\"/.test(layout) && /name=\"customers\"/.test(layout) && /name=\"business\"/.test(layout), `เดิม ${baseLines.length} คง ${kept}`);

console.log("── T: SecTopBar / BusinessSwitcher ──");
const top = rd(join(M, "src/components/secretary/SecTopBar.tsx")), sw = rd(join(M, "src/components/secretary/BusinessSwitcherSheet.tsx"));
chk("T-1", "SecTopBar: prop zone 3 ค่า · ไอคอน Feather message-circle/inbox/users/help-circle/plus · badges · ไม่มีรูปโปรไฟล์", /zone/.test(top) && /message-circle/.test(top) && /\"inbox\"/.test(top) && /\"users\"/.test(top) && /help-circle/.test(top) && /\"plus\"/.test(top) && /badges?/.test(top) && !/avatar|profileImage|Image\s/.test(top), "");
chk("T-2", "BusinessSwitcherSheet: ใช้ Sheet airy · แถว 'เลขาของฉัน' (คีย์ i18n) · ปุ่มเพิ่มกิจการ → /business/new · switchTenant จาก auth-context", /Sheet/.test(sw) && /\/business\/new/.test(sw) && /switchTenant/.test(sw) && /auth-context/.test(sw), "");

console.log("── I: i18n ──");
const i18n = rd(join(M, "src/i18n/index.ts")), th = rd(join(M, "src/i18n/th.ts")), en = rd(join(M, "src/i18n/en.ts"));
const keyOf = (s: string) => [...s.matchAll(/^\s*\"?([a-zA-Z0-9_.]+)\"?\s*:/gm)].map((m) => m[1]);
const thKeys = new Set(keyOf(th)), enKeys = new Set(keyOf(en));
const onlyTh = [...thKeys].filter((k) => !enKeys.has(k)), onlyEn = [...enKeys].filter((k) => !thKeys.has(k));
chk("I-1", "มี src/i18n/{index,th,en}.ts · useT export · th/en คีย์ชุดเดียวกัน (≥ 20 คีย์) · en ไม่มีอักษรไทย", /export (function|const) useT/.test(i18n) && thKeys.size >= 20 && onlyTh.length === 0 && onlyEn.length === 0 && !/[฀-๿]/.test(en), JSON.stringify({ th: thKeys.size, onlyTh: onlyTh.slice(0, 3), onlyEn: onlyEn.slice(0, 3) }));
const screens = [...walk(join(APP, "secretary")), ...walk(join(APP, "customers")), ...walk(join(APP, "business")), join(M, "src/components/secretary/SecTopBar.tsx"), join(M, "src/components/secretary/BusinessSwitcherSheet.tsx")].filter((f) => !/_gallery\.tsx$/.test(f));
const thaiIn = screens.filter((f) => /[฀-๿]/.test(strip(rd(f)).replace(/testID=\"[^\"]*\"/g, "")));
chk("I-2", "ไม่มีสตริงไทยฝังในไฟล์จอ secretary/customers/business + คอมโพเนนต์ secretary (นอกคอมเมนต์)", thaiIn.length === 0, thaiIn.map((f) => f.replace(M + "/", "")).slice(0, 5).join(" · "));

console.log("── E: ทางเข้า 1.0 · F ในธีม ──");
const home = rd(join(APP, "index.tsx"));
chk("E-1", "(app)/index.tsx มีปุ่ม testID home-open-secretary → /secretary · ไม่ import @/src/theme/index", /home-open-secretary/.test(home) && /\/secretary/.test(home) && !/@\/src\/theme\/index/.test(home), "");
const themeIdx = rd(join(M, "src/theme/index.ts")), secHome = rd(join(APP, "secretary/index.tsx"));
chk("F-1", "F (0.73) export จาก src/theme/index.ts · secretary/index.tsx ไม่ประกาศ F เอง", /export const F\b/.test(themeIdx) && !/^\s*const F\s*=/m.test(secHome), "");
const scheme = rd(join(M, "app.json"));
chk("E-2", "app.json scheme เดิม sharkai (ไม่เปลี่ยน)", /\"scheme\":\s*\"sharkai\"/.test(scheme), "");

console.log("── U: qc-sec-ui ทุก route ──");
{
  const routes = ROUTES.map(([r]) => r);
  const routeArg = ROUTES.map(([r, f]) => (/\[/.test(f) ? `${r}=app/(app)/${f}` : r)).join(",");
  const noPair = routes.filter((r) => r !== "/secretary").join(",");
  const ui = spawnSync("pnpm", ["exec", "tsx", "scripts/qc-sec-ui.mts"], { cwd: ROOT, encoding: "utf8", env: { ...process.env, ROUTES: routeArg, NO_PAIR: noPair, FIXTURE: "apps/mobile/qc/fixtures/secretary/s2.1.json" }, timeout: 600_000, maxBuffer: 64 * 1024 * 1024 });
  const line = (ui.stdout ?? "").split("\n").find((l) => l.startsWith("JSON_SUMMARY")) ?? "";
  let failed: string[] = ["no-summary"];
  try { failed = JSON.parse(line.replace("JSON_SUMMARY ", "")).failed as string[]; } catch { /* */ }
  chk("U-1", `qc-sec-ui ผ่านทุก route (${routes.length} · NO_PAIR ยกเว้น /secretary)`, ui.status === 0 && failed.length === 0, failed.slice(0, 8).join(" · "));
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
