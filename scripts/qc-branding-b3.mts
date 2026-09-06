// QC — ธีมกิจการ WO B3: โครงแอปใช้ธีม (token ที่ราก · แถบบนใหม่ · โทนแถบเมนู/ราง · รางทุกหน้า+จำสถานะ · ปัดขวา · แจ้งปัญหา · SHARK AI)
// Fable oracle · Builder ห้ามแตะ · สัญญาอยู่ที่ ledger/BRANDING-RUN.md §B3
// ⚠️ standalone-typesafe: dynamic import + wide cast · static ส่วนใหญ่ + preferences/issues ต่อ DB QC
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
import { existsSync, readFileSync, readdirSync } from "node:fs";
const THEME = "src/components/app-shell/ThemeRoot.tsx";
if (!existsSync(THEME)) {
  console.log(`⚠️  SKIPPED — WO ยังไม่สร้าง (${THEME})`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, findings: [], skipped: true })}`);
  process.exit(0);
}
const { prisma } = await import("@/lib/core/db");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
let uid = "";
try {
  const theme = read(THEME);
  const shell = read("src/components/app-shell/AppShell.tsx");
  const top = read("src/components/app-shell/Topbar.tsx");
  const drawer = read("src/components/app-shell/NavDrawer.tsx");
  const rail = read("src/components/app-shell/NavRail.tsx");
  const main = read("src/components/app-shell/AppMain.tsx");
  const layout = read("src/app/app/layout.tsx");
  const issue = read("src/components/app-shell/IssueReportSheet.tsx");
  const globals = read("src/app/globals.css");

  // ═══ S1 token ที่ราก ═══
  chk("B3-S1.1", "layout.tsx เรียก getBrandingTokens(tenantId) แล้วส่งให้ ThemeRoot (server → style var ที่ราก) · ThemeRoot ตั้ง --color-accent/--color-accent-fg/--color-accent-soft/--nav-bg/--nav-fg/--nav-fg2/--nav-on", /getBrandingTokens/.test(layout) && /ThemeRoot/.test(layout) && ["--color-accent", "--color-accent-fg", "--nav-bg", "--nav-fg", "--nav-fg2", "--nav-on"].every((v) => theme.includes(v)), "ครบ", "ขาด");
  chk("B3-S1.2", "globals.css ประกาศค่าปริยายของ --color-accent-fg / --nav-* (ธีมยังไม่ตั้ง = หน้าตาเดิม)", /--color-accent-fg/.test(globals) && /--nav-bg/.test(globals) && /--nav-fg/.test(globals), "มีปริยาย", "ขาด");
  chk("B3-S1.3", "?theme=preview: ThemeRoot อ่าน sessionStorage 'shark:branding:preview' แล้วทับ var ฝั่ง client (เฉพาะแท็บนั้น ไม่บันทึก)", /theme=preview|"preview"/.test(theme) && /sessionStorage/.test(theme) && /shark:branding:preview/.test(theme), "preview", "ไม่พบ", "MAJOR");

  // ═══ S2 แถบบนใหม่ (T7) ═══
  chk("B3-S2.1", "Topbar: ซ้าย = โลโก้ (img หรือตัวย่อบนพื้น accent) + ชื่อที่แสดง (displayName) · ไม่มีปุ่ม ☰ ที่ ≥lg (มีเฉพาะ <lg และไม่มีในแอป)", /logoUrl/.test(top) && /displayName/.test(top) && /lg:hidden/.test(top) && !/☰[\s\S]*flex(?![\s\S]*lg:hidden)/.test(top.split("☰")[0] ?? ""), "โลโก้+ชื่อ · ☰ เฉพาะจอเล็ก", "ไม่ตรง");
  chk("B3-S2.2", "Topbar ขวา = 2 ปุ่ม: 'แจ้งปัญหาการใช้งาน' (testid report-issue) + SHARK AI orb (testid ai-orb) · ไม่มีค้นหา/กระดิ่ง/avatar", /report-issue/.test(top) && /ai-orb/.test(top) && /แจ้งปัญหาการใช้งาน/.test(top) && !/aria-label="ค้นหา"|aria-label="แจ้งเตือน"/.test(top), "2 ปุ่ม", "ไม่ตรง");
  chk("B3-S2.3", "ในแอป (inApp): orb ส่ง postMessage {ev:'open-ai'} · บนเว็บเปิด AiDock (event/handler เดียวกับ AiDock) · AiDock ไม่ลอยปุ่มมุมล่างขวาซ้ำอีก (มุมล่างว่าง)", /open-ai/.test(top + shell) && /AiDock|app:ai-open/.test(shell) && !/fixed bottom-4 right-4/.test(read("src/components/app-shell/AiDock.tsx")), "orb เดียว", "ซ้ำ/ขาด", "MAJOR");

  // ═══ S3 แถบเมนู/ราง ตามโทน (T6) ═══
  chk("B3-S3.1", "NavDrawer ใช้ var --nav-bg/--nav-fg/--nav-on แทนสี hard-coded (โทนเปลี่ยนตามร้าน) · หัวแถบมีโลโก้+ชื่อกิจการ+▾", /--nav-bg/.test(drawer) && /--nav-fg/.test(drawer) && /--nav-on/.test(drawer) && /logoUrl/.test(drawer), "ใช้ var", "hard-coded");
  chk("B3-S3.2", "NavRail ใช้ทุกหน้า (ไม่ผูก isRailPath อีก) · โทนเดียวกับแถบ (--nav-bg) · ไม่มีโลโก้บนราง · มีปุ่ม › ขยาย (testid nav-expand) · แถบเต็มมี ‹ ย่อ (testid nav-collapse) · tooltip ชื่อระบบ · จุดแดงแจ้งเตือน", /--nav-bg/.test(rail) && /nav-expand/.test(rail) && /nav-collapse/.test(drawer + rail) && !/logoUrl/.test(rail) && /title=|tooltip/i.test(rail) && /badge|จุด|bg-\[#ef4444\]|bg-red/.test(rail), "ครบ", "ขาด");
  chk("B3-S3.3", "AppShell เลือก rail/แถบเต็มจาก preferences.navCollapsed (server prop) · บอร์ดงาน (isRailPath) ยังบังคับราง · เปลี่ยนแล้วเรียก setNavCollapsedAction (จำต่อผู้ใช้)", /navCollapsed/.test(shell) && /isRailPath/.test(shell) && /setNavCollapsedAction/.test(shell), "จำต่อผู้ใช้", "ไม่พบ");
  chk("B3-S3.4", "AppMain เว้นซ้ายตามสถานะจริง (rail 3.5rem / แถบ 18rem) ไม่ใช่ตาม path อย่างเดียว", /navCollapsed|collapsed/.test(main) && /lg:pl-14|3\.5rem/.test(main) && /18rem/.test(main), "ตามสถานะ", "ตาม path");

  // ═══ S4 preferences (ต่อ DB) ═══
  const prefs = (await import("@/lib/core/user-preferences" as string)) as Record<string, (...a: Any[]) => Promise<Any>> & { parsePreferences: (r: unknown) => Any };
  const u = await prisma.user.create({ data: { email: `qc-b3-${Date.now()}@shark.local`, name: "ผู้ทดสอบ B3" } }); uid = u.id;
  const p0 = await prefs.getUserPreferences(uid);
  chk("B3-S4.1", "user-preferences (core): ปริยาย navCollapsed=false · kanbanShortcuts=true (ย้าย/รวมของ K1.14 มาที่เดียว)", p0.navCollapsed === false && p0.kanbanShortcuts === true, "ปริยาย", JSON.stringify(p0));
  await prefs.setUserPreferences(uid, { navCollapsed: true });
  const p1 = await prefs.getUserPreferences(uid);
  const kp = (await import("@/lib/modules/kanban/preferences" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const k1 = await kp.getUserPreferences(uid);
  chk("B3-S4.2", "setUserPreferences({navCollapsed:true}) → true · ไม่ทับ kanbanShortcuts · kanban/preferences อ่านจากที่เดียวกัน", p1.navCollapsed === true && p1.kanbanShortcuts === true && k1.kanbanShortcuts === true, "true/true", JSON.stringify([p1, k1]));
  chk("B3-S4.3", "parsePreferences ทน prefs เพี้ยน (array/สตริง/null) → ปริยาย", prefs.parsePreferences([1]).navCollapsed === false && prefs.parsePreferences("x").navCollapsed === false && prefs.parsePreferences(null).kanbanShortcuts === true, "ปริยาย", "พัง", "MAJOR");

  // ═══ S5 มือถือปัดขวา + แจ้งปัญหา ═══
  chk("B3-S5.1", "จอ <lg / ในแอป: ปัดจากขอบซ้าย (≤24px) ไปทางขวา ≥60px เปิดเมนู (pointer/touch ใน AppShell หรือ SwipeEdge.tsx) · ไม่ทำงานเมื่อเริ่มในช่องพิมพ์/แนวนอนเลื่อนได้", /touchstart|pointerdown/.test(shell + read("src/components/app-shell/SwipeEdge.tsx")) && /clientX|touches\[0\]/.test(shell + read("src/components/app-shell/SwipeEdge.tsx")), "มี swipe", "ไม่พบ");
  chk("B3-S5.2", "IssueReportSheet.tsx: ประเภท 3 (BUG/DISPLAY/IDEA) · ข้อความ · แนบรูป (ไม่บังคับ) · แนบ pageUrl/userAgent/appVersion อัตโนมัติ · ส่งผ่าน reportIssueAction · ไม่ใช้ alert()", /BUG/.test(issue) && /DISPLAY/.test(issue) && /IDEA/.test(issue) && /pageUrl|location\.href/.test(issue) && /userAgent/.test(issue) && /reportIssueAction/.test(issue) && !/\balert\(/.test(issue), "ครบ", "ขาด");
  const actionsSrc = read("src/lib/branding/issue-actions.ts") + read("src/components/app-shell/issue-actions.ts") + read("src/app/app/actions/issue.ts");
  chk("B3-S5.3", "reportIssueAction: ต้องล็อกอิน (requireTenant) → createIssueReport(ctx,{userId,…}) · ไฟล์แนบผ่าน validateLogoFile-แบบรูป ≤2MB → uploadFile · คืน {ok} ไม่ throw", /requireTenant/.test(actionsSrc) && /createIssueReport/.test(actionsSrc) && /uploadFile|validateImage|validateLogoFile/.test(actionsSrc), "ครบ", "ขาด");
  const issues = (await import("@/lib/branding/issues" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  chk("B3-S5.4", "issues.ts มี assertCanReport/สิทธิ์: ผู้แจ้งต้องเป็นสมาชิกร้าน (membership accepted) ไม่งั้น throw ไทย", typeof issues.assertCanReport === "function" || /membership/.test(read("src/lib/branding/issues.ts")), "มีด่านสิทธิ์", "ไม่มี", "MAJOR");
  chk("B3-S5.5", "เมนูมือถือ (overlay) ท้ายเมนูมีรายการ 'แจ้งปัญหาการใช้งาน' (เพราะแถบบนจอเล็กไม่มีที่)", /แจ้งปัญหาการใช้งาน/.test(drawer), "มี", "ไม่มี", "MINOR");

  // ═══ S6 ภาพ ═══
  const vis = read("scripts/visual-branding.mts");
  const shots = existsSync(".qc-shots/branding/b3") ? readdirSync(".qc-shots/branding/b3").filter((f) => f.endsWith(".png")) : [];
  chk("B3-S6.1", "visual-branding.mts มี spec b3: โครงแอป 3 โทน (LIGHT/BRAND/DARK) × desktop · ราง (ย่อ) · มือถือหลังปัดขวา · แผ่นแจ้งปัญหา · finally คืนค่า", /"b3"/.test(vis) && /LIGHT/.test(vis) && /DARK/.test(vis) && /nav-expand|nav-collapse/.test(vis) && /report-issue/.test(vis), "มี", "ขาด");
  chk("B3-S6.2", "มีภาพจริง ≥ 8 ใบใน .qc-shots/branding/b3", shots.length >= 8, "≥8", `${shots.length}`, "MAJOR");
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? `${e.name}: ${e.message.slice(0, 240)}` : String(e));
} finally {
  if (uid) { try { await prisma.user.delete({ where: { id: uid } }); } catch { /* */ } }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Branding B3 =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
