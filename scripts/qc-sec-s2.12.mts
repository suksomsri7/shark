// QC — SECRETARY S2.12 · สมัคร/เข้าด้วยเบอร์ (SMS OTP) · login Airy · บังคับผูกเบอร์ (R8) (static · ไม่แตะฐาน)
// สัญญา: ledger/secretary-briefs/sec-brief-S2.12.md · RESOLUTIONS §F
// กลุ่ม: R ไฟล์จอ 4 · G gate /phone เพิ่มเงื่อนไขเดียว · A logic auth (Apple/Google/อีเมลเดิมยังอยู่ · sms/verify/link ผ่าน auth-api) · I i18n auth.* · U qc-sec-ui 4 route (NO_PAIR login/phone) · M typecheck · D fitness
// รัน: bash scripts/iso.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-sec-s2.12.mts   (ต้องถ่าย shoot-sec --both ก่อน)
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const M = join(ROOT, "apps/mobile");
const LABEL = "qc-sec-s2.12";
const FORCED = process.env.QC_FORCE === "1";
const APP = join(M, "app/(app)");
if (!FORCED && !existsSync(join(M, "app/signup.tsx"))) {
  console.log(`⏭️  ${LABEL}: ยังไม่มี app/signup.tsx (ใบยังไม่เริ่ม) และไม่ได้ตั้ง QC_FORCE=1 — SKIP`);
  console.log("JSON_SUMMARY " + JSON.stringify({ total: 0, passed: 0, failed: [], skipped: ["ALL"], reason: "not-started" }));
  process.exit(0);
}
type Sev = "CRITICAL" | "MAJOR" | "MINOR"; type Res = "PASS" | "FAIL" | "SKIP";
const cks: { id: string; res: Res; sev: Sev; why: string }[] = [];
const chk = (id: string, name: string, ok: boolean, detail = "", sev: Sev = "CRITICAL") => { cks.push({ id, res: ok ? "PASS" : "FAIL", sev, why: detail }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${ok ? "" : " — " + detail}`); };
const rd = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const walk = (d: string): string[] => (existsSync(d) ? readdirSync(d).flatMap((f) => { const q = join(d, f); return statSync(q).isDirectory() ? walk(q) : /\.tsx?$/.test(f) ? [q] : []; }) : []);

console.log("── R: ไฟล์จอ ──");
const files = ["login.tsx", "signup.tsx", "otp.tsx", "phone.tsx"].map((f) => join(M, "app", f));
chk("R-1", "มี app/{login,signup,otp,phone}.tsx", files.every((f) => existsSync(f)), files.filter((f) => !existsSync(f)).map((f) => f.replace(M + "/", "")).join(" · "));
const login = rd(files[0]!), signup = rd(files[1]!), otp = rd(files[2]!), phone = rd(files[3]!);
chk("R-2", "login: Apple + Google + อีเมล OTP เดิมยังอยู่ (expo-apple-authentication · GoogleSignin · /api/mobile/auth/otp) + ทางเข้าเบอร์ (login-sms → /otp) + ลิงก์สมัคร", /expo-apple-authentication/.test(login) && /GoogleSignin/.test(login) && /\/api\/mobile\/auth\/otp/.test(login) && /login-sms/.test(login) && /\/otp/.test(login) && /login-signup/.test(login) && /\/signup/.test(login), "");
chk("R-3", "signup: testID ครบ · ส่ง sms/request · ไป /otp พร้อม mode=signup", ["signup-name", "signup-phone", "signup-email", "signup-submit"].every((t) => signup.includes(t)) && /mode=signup|mode: \"signup\"/.test(signup), "");
chk("R-4", "otp: 6 ช่อง · นับถอยหลัง · ส่งอีกครั้ง · แก้อีเมล (signup) · no_account → /signup · sms_unavailable", ["otp-input", "otp-resend", "otp-edit-email", "otp-submit"].every((t) => otp.includes(t)) && /no_account/.test(otp) && /sms_unavailable/.test(otp) && /resendAfterSec/.test(otp), "");
chk("R-5", "phone: ไม่มีปุ่มข้าม (R8) · มี phone-logout · phone/link · phone_taken", ["phone-input", "phone-request", "phone-otp", "phone-submit", "phone-logout"].every((t) => phone.includes(t)) && !/skip|ข้าม/i.test(strip(phone).replace(/\/\/.*$/gm, "")) && /phone\/link/.test(phone) && /phone_taken/.test(phone), "");

console.log("── G: gate ──");
const gateFiles = [join(APP, "_layout.tsx"), join(M, "app/_layout.tsx")].map(rd).join("\n");
chk("G-1", "gate: me.user.phone === null → /phone (ก่อน /dna) · ลำดับเดิม /login → /dna ยังอยู่", /phone/.test(gateFiles) && /\/phone/.test(gateFiles) && /\/dna/.test(gateFiles) && /\/login/.test(gateFiles) && gateFiles.indexOf("/phone") < gateFiles.lastIndexOf("/dna"), "");

console.log("── A: auth-api / phone ──");
const aapi = rd(join(M, "src/lib/auth-api.ts")), ph = rd(join(M, "src/lib/phone.ts"));
chk("A-1", "auth-api: smsRequest/smsVerify/phoneLink ห่อ api() · endpoints ถูก · phone.ts normalizeThaiMobile + maskPhone", /smsRequest/.test(aapi) && /smsVerify/.test(aapi) && /phoneLink/.test(aapi) && /auth\/sms\/request/.test(aapi) && /auth\/sms\/verify/.test(aapi) && /auth\/phone\/link/.test(aapi) && /normalizeThaiMobile/.test(ph) && /maskPhone/.test(ph), "");
chk("A-2", "ไม่มีสีฝัง / สตริงไทยฝัง ในจอ auth ใหม่ (signup/otp/phone) — login อนุโลมเฉพาะข้อความ error เดิม", ![signup, otp, phone].some((s) => /#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(strip(s)) || /[฀-๿]/.test(strip(s).replace(/testID=\"[^\"]*\"/g, ""))), "");

console.log("── I: i18n auth.* ──");
const th = rd(join(M, "src/i18n/th.ts")), en = rd(join(M, "src/i18n/en.ts"));
const authKeys = (s: string) => [...s.matchAll(/^\s*\"?(auth\.[a-zA-Z0-9_.]+)\"?\s*:/gm)].map((m) => m[1]);
const kt = new Set(authKeys(th)), ke = new Set(authKeys(en));
chk("I-1", "คีย์ auth.* ≥ 30 · th/en ชุดเดียวกัน", kt.size >= 30 && [...kt].every((k) => ke.has(k)) && [...ke].every((k) => kt.has(k)), `th ${kt.size} en ${ke.size}`);

console.log("── U: qc-sec-ui ──");
{
  const routeArg = ["/login=app/login.tsx", "/signup=app/signup.tsx", "/otp=app/otp.tsx", "/phone=app/phone.tsx"].join(",");
  const ui = spawnSync("pnpm", ["exec", "tsx", "scripts/qc-sec-ui.mts"], { cwd: ROOT, encoding: "utf8", env: { ...process.env, ROUTES: routeArg, NO_PAIR: "/login,/phone", FIXTURE: "apps/mobile/qc/fixtures/secretary/s2.12.json" }, timeout: 600_000, maxBuffer: 64 * 1024 * 1024 });
  const line = (ui.stdout ?? "").split("\n").find((l) => l.startsWith("JSON_SUMMARY")) ?? "";
  let failed: string[] = ["no-summary"];
  try { failed = JSON.parse(line.replace("JSON_SUMMARY ", "")).failed as string[]; } catch { /* */ }
  chk("U-1", "qc-sec-ui ผ่าน /login /signup /otp /phone (ภาพคู่ signup/otp สว่าง+มืด)", ui.status === 0 && failed.length === 0, failed.slice(0, 8).join(" · "));
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
