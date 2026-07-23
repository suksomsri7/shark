// QC — Mobile App Phase 1 (Expo) — static checks + typecheck ของ apps/mobile · Fable oracle
// ตรวจ: จอบังคับครบ / security (SecureStore เท่านั้น · ไม่มี secret · token ไม่เข้า WebView URL) / spec เจ้าของ / กัน Vercel พัง
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

const APP = "apps/mobile";
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };
const read = (p: string) => (existsSync(join(APP, p)) ? readFileSync(join(APP, p), "utf8") : "");
const walk = (dir: string): string[] => {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir)) {
    if (f === "node_modules" || f.startsWith(".")) continue;
    const p = join(dir, f);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(f)) out.push(p);
  }
  return out;
};

// ── 1. จอบังคับครบ (คำสั่งเจ้าของ 2026-07-22) ──
const required: [string, string][] = [
  ["app/_layout.tsx", "root gate บังคับ login"],
  ["app/login.tsx", "จอ login"],
  ["app/dna.tsx", "DNA Wizard native"],
  ["app/(app)/_layout.tsx", "drawer กิจการ"],
  ["app/(app)/index.tsx", "หน้าแรก = dashboard WebView + orb ลอย"],
  ["app/(app)/sessions.tsx", "หน้ารวม session"],
  ["app/(app)/chat/[id].tsx", "จอแชท"],
  ];
for (const [f, why] of required) chk("APP-1", `มี ${f} (${why})`, existsSync(join(APP, f)), "มี", "ไม่มี");

// ── 2. Security ──
const allSrc = [...walk(join(APP, "app")), ...walk(join(APP, "src"))];
const allText = allSrc.map((p) => [p, readFileSync(p, "utf8")] as const);
const asyncStore = allText.filter(([, t]) => t.includes("AsyncStorage"));
chk("APP-2.1", "ไม่มี AsyncStorage (token ต้องอยู่ SecureStore เท่านั้น)", asyncStore.length === 0, "0 ไฟล์", asyncStore.map(([p]) => p).join(","));
const secretPat = /(sk-or-|sk-ant-|SHARK_AI_KEY|SHARK_CRON_SECRET|password\s*[:=]\s*["'][^"']+["'])/;
const leaked = allText.filter(([, t]) => secretPat.test(t));
chk("APP-2.2", "ไม่มี secret/key ฝังในแอป", leaked.length === 0, "0", leaked.map(([p]) => p).join(","));
const wv = read("app/(app)/index.tsx");
chk("APP-2.3", "WebView ใช้ one-time code (webview-session) — Bearer ห้ามเข้า URL", wv.includes("webview-session") && !/Bearer \$\{|token=\$\{|\?token=/.test(wv), "code only", "พบ token ใน URL หรือไม่ใช้ webview-session");
chk("APP-2.6", "WebView ส่ง UA SharkApp (เว็บใช้ซ่อน orb ตัวเอง กัน orb ซ้อน)", wv.includes("SharkApp"), "มี", "ไม่พบ");
chk("APP-2.4", "client ชี้ prod https://shark.in.th", read("src/api/client.ts").includes('BASE_URL = "https://shark.in.th"'), "ใช่", "ผิด");
chk("APP-2.5", "logout เรียก API (revoke ฝั่ง server ไม่ใช่แค่ลบ local)", read("src/lib/auth-context.tsx").includes("/api/mobile/auth/logout"), "ใช่", "ไม่พบ");

// ── 3. Spec เจ้าของ ──
const drawer = read("app/(app)/_layout.tsx");
chk("APP-3.1", "drawer มีปุ่มเพิ่มกิจการ → /dna", drawer.includes("เพิ่มกิจการ") && drawer.includes("/dna"), "มี", "ไม่พบ");
chk("APP-3.2", "drawer ไม่มีปุ่ม X ปิด (คำสั่งเจ้าของ)", !/[✕✖❌]|closeButton|CloseIcon/.test(drawer), "ไม่มี", "พบ X", "MAJOR");
const sessions = read("app/(app)/sessions.tsx");
chk("APP-3.3", "หน้ารวม session: สไลด์ซ้าย (Swipeable) + unread", /Swipeable|SwipeListView|renderRightActions/.test(sessions) && sessions.includes("unread"), "มี", "ไม่ครบ");
const chat = read("app/(app)/chat/[id].tsx");
chk("APP-3.4", "จอแชท: ใช้ sendChat (SSE) + การ์ด proposal + confirm2x (DESTRUCTIVE 2 จังหวะ)", chat.includes("sendChat") && chat.includes("confirm2x") && chat.includes("DESTRUCTIVE"), "ครบ", "ไม่ครบ");
const login = read("app/login.tsx");
chk("APP-3.5", "จอ login: OTP flow (otp→verify→signIn)", login.includes("/api/mobile/auth/otp") && login.includes("/api/mobile/auth/verify"), "ครบ", "ไม่ครบ");
const dna = read("app/dna.tsx");
chk("APP-3.7", "หน้าแรก: ปุ่ม orb ลอย → /sessions (feedback เจ้าของ: dashboard ขึ้นก่อน AI orb มุมล่างขวา)", wv.includes("/sessions"), "มี", "ไม่พบ");
chk("APP-3.6", "DNA: ดึงคำถามจาก API + answers + apply", dna.includes("/api/mobile/dna/questions") && dna.includes("/api/mobile/dna/answers") && dna.includes("/api/mobile/dna/apply"), "ครบ", "ไม่ครบ");

// ── 3.6 feedback รอบสอง 23 ก.ค.: header session เหลือ ‹ + · orb ใช้รูปจริง ──
chk("APP-3.8", "หน้ารวม session: ไม่มี ☰/openDrawer และไม่มีชื่อกิจการใน header (คำสั่งเจ้าของ)", !sessions.includes("openDrawer") && !sessions.includes("☰"), "ไม่มี", "ยังอยู่");
chk("APP-3.9", "ปุ่ม orb ลอยใช้รูป orb จริง (assets/orb.png — วงแหวนเรืองแสงแบบเว็บ)", wv.includes("orb.png"), "มี", "ไม่พบ");
chk("APP-3.10", "จอ login ใช้ orb จริง (assets/orb.png)", read("app/login.tsx").includes("orb.png") || read("src/components/auth/ui.tsx").includes("orb.png"), "มี", "ไม่พบ");

// ── 3.5 feedback เจ้าของ 23 ก.ค.: light mode + ฟอนต์ไทยตามเว็บ ──
const themeSrc = read("src/theme.ts");
chk("APP-6.1", "ธีม light mode (bg ขาว ไม่ใช่ดำ — feedback เจ้าของ)", /bg:\s*"#(fff|ffffff|f\w{5})"/i.test(themeSrc) && !/bg:\s*"#000/.test(themeSrc), "ขาว", themeSrc.match(/bg:[^,]+/)?.[0] ?? "?");
const rootLayout = read("app/_layout.tsx");
chk("APP-6.2", "โหลดฟอนต์ IBM Plex Sans Thai (ฟอนต์เดียวกับเว็บ)", /IBMPlexSansThai/.test(rootLayout) || /IBMPlexSansThai/.test(read("src/lib/fonts.ts")), "มี", "ไม่พบ");

// ── 4. config + กัน Vercel/root พัง ──
const appJson = JSON.parse(read("app.json") || "{}") as { expo?: { android?: { package?: string }; ios?: { bundleIdentifier?: string }; userInterfaceStyle?: string } };
chk("APP-4.1", "bundle th.in.shark.ai ทั้ง 2 platform + light", appJson.expo?.android?.package === "th.in.shark.ai" && appJson.expo?.ios?.bundleIdentifier === "th.in.shark.ai" && appJson.expo?.userInterfaceStyle === "light", "ครบ", JSON.stringify(appJson.expo?.android));
const rootTs = JSON.parse(readFileSync("tsconfig.json", "utf8")) as { exclude?: string[] };
chk("APP-4.2", "root tsconfig exclude apps (กัน Vercel typecheck RN)", rootTs.exclude?.includes("apps") === true, "มี", "ไม่มี");
chk("APP-4.3", ".vercelignore มี apps/", existsSync(".vercelignore") && readFileSync(".vercelignore", "utf8").includes("apps/"), "มี", "ไม่มี");

// ── 5. typecheck ของแอป ──
let tscOk = false; let tscOut = "";
try { execSync("npx tsc --noEmit", { cwd: APP, stdio: "pipe", timeout: 240000 }); tscOk = true; } catch (e) { tscOut = String((e as { stdout?: Buffer }).stdout ?? e).slice(0, 300); }
chk("APP-5.1", "tsc --noEmit ใน apps/mobile ผ่าน", tscOk, "ผ่าน", tscOut);

const crit = cks.filter((c) => !c.ok && c.sev === "CRITICAL").length;
console.log(`\nqc-mobile-app: ${cks.filter((c) => c.ok).length}/${cks.length} ผ่าน · CRITICAL fail ${crit}`);
if (cks.some((c) => !c.ok)) process.exit(1);
