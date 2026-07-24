// QC — เพิ่มระบบเป็น Modal กลางจอ + ลิงก์ "ทำต่อ" checklist ชี้ถูกที่ (feedback เจ้าของ 24 ก.ค.) · Fable oracle
// ⚠️ standalone-typesafe: dynamic import + wide cast เท่านั้น
import { readFileSync, existsSync } from "node:fs";
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };

// ── 1. checklist "ทำต่อ" ต้องไม่โยนทุกอย่างไปหน้าเพิ่มระบบ ──
const page = readFileSync("src/app/app/page.tsx", "utf8");
chk("AS-1.1", "hasProduct ไม่ชี้ /app/settings/systems (ต้อง deep-link ระบบคลัง/เมนูจริงถ้าเปิดแล้ว)", !/hasProduct:\s*"\/app\/settings\/systems"/.test(page), "deep-link", "ยังชี้เพิ่มระบบ");
chk("AS-1.2", "hasTeam ไม่ชี้ /app/settings/systems (ต้อง deep-link ระบบ HR จริงถ้าเปิดแล้ว)", !/hasTeam:\s*"\/app\/settings\/systems"/.test(page), "deep-link", "ยังชี้เพิ่มระบบ");
chk("AS-1.3", "map ลิงก์แบบ dynamic ตามระบบที่เปิดจริง (มี AppSystem lookup)", /INVENTORY|HR/.test(page) && /\/app\/sys\//.test(page), "มี", "ไม่พบ");

// ── 2. Modal เพิ่มระบบ (กลางจอ · 2 จังหวะ: เลือกระบบ → ตั้งชื่อ) ──
const modalPath = "src/components/app-shell/AddSystemModal.tsx";
if (!existsSync(modalPath)) chk("AS-2.0", "มี AddSystemModal.tsx", false, "มี", "ยังไม่สร้าง");
else {
  const modal = readFileSync(modalPath, "utf8");
  chk("AS-2.1", "modal กลางจอ (overlay + จัดกลาง)", /fixed inset-0/.test(modal) && /items-center/.test(modal) && /justify-center/.test(modal), "มี", "ไม่ครบ");
  chk("AS-2.2", "2 จังหวะ: เลือกระบบ → modal ตั้งชื่อ (มี state step/เลือกแล้วค่อยกรอกชื่อ)", /step|selected|chosen/i.test(modal) && /ชื่อ/.test(modal), "มี", "ไม่ครบ");
  chk("AS-2.3", "ใช้ catalog ระบบจริง (SYSTEM_DEFS) — ห้ามพิมพ์รายชื่อเอง", /SYSTEM_DEFS|systems\b/.test(modal), "มี", "ไม่พบ");
  chk("AS-2.4", "สร้างผ่าน action เดิมของหน้า settings/systems (ห้าม fork logic)", /Action|action/.test(modal) && !/prisma/.test(modal), "reuse", "แตะ prisma ตรง");
  chk("AS-2.5", "ปิดได้: กดฉากหลัง/ปุ่มยกเลิก + ย้อนกลับจาก step ตั้งชื่อ", /onClose|ปิด|ยกเลิก/.test(modal) && /ย้อน|กลับ/.test(modal), "มี", "ไม่ครบ", "MAJOR");
}
const shell = readFileSync("src/components/app-shell/AppShell.tsx", "utf8");
chk("AS-3.1", "AppShell ประกอบ AddSystemModal (เปิดจากทุกจุดได้)", /AddSystemModal/.test(shell), "มี", "ไม่พบ");
const nav = readFileSync("src/components/app-shell/NavDrawer.tsx", "utf8");
chk("AS-3.2", "ปุ่ม + เพิ่มระบบ ใน drawer เปิด modal (ไม่ใช่ลิงก์ไปหน้า settings)", /addSystem|AddSystem|onAddSystem/.test(nav), "เปิด modal", "ยังเป็นลิงก์");

const crit = cks.filter((c) => !c.ok && c.sev === "CRITICAL").length;
console.log(`\nqc-add-system-modal: ${cks.filter((c) => c.ok).length}/${cks.length} ผ่าน · CRITICAL fail ${crit}`);
if (cks.some((c) => !c.ok)) process.exit(1);
