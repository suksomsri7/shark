// visual-hr.mts — ถ่ายภาพหน้าจอจริงของหน้า HR (RUN HR V2 · ใบ H0.4 R4) — 1440×900 · 1024×768 · 390×844 (fullPage)
//
// ใช้:
//   pnpm exec tsx scripts/visual-hr.mts all --dry --user owner                       # พิมพ์ตาราง หน้า × ขนาดจอ (ไม่แตะ DB/เซิร์ฟเวอร์)
//   bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 \
//     pnpm exec tsx scripts/visual-hr.mts 0.4 --user staff --base http://127.0.0.1:3226  # ถ่ายจริง (CONTROLLER-RUN)
//   ผู้ใช้: owner · manager · payroll · staff · kiosk · member · payrollSelf · manager-branch (HQC.users) · ต้อง seed-hr-qc ก่อน (อ่าน scripts/hr-expected.json)
//   ใบ UI หลัง ๆ ลงทะเบียนหน้าของตัวเองใน SPECS["<wo>"] (SPECS["0.4"] = ทุกหน้าของวันนี้)
//
// 🔴 CONTROLLER-RUN: เซิร์ฟเวอร์ = `ACC_V2_PORT=3226 bash scripts/acc-v2-serve.sh start` (production build) — builder ส่งแค่ --dry
// 🔴 ไม่มี --base (และไม่ใช่ --dry) / ต่อ --base ไม่ได้ ⇒ exit 2 ทันทีพร้อมเหตุผล (ไม่โหลด env · ไม่แตะ DB · < 5 วิ)
// 🔴 session ที่ mint ปักธง userAgent = "qc-visual-hr" และลบ **เฉพาะแถวของรอบนี้** ใน finally ·
//    ไม่มี process.exit() ในกรอบ try (exit ข้าม finally = token ค้างในฐาน QC ที่ใช้ร่วมกัน) — ใช้ Fatal + exitCode
// 🔴 ล้นแนวนอน (scrollWidth > clientWidth ของ documentElement หรือ body) = ❌ (กติกา visual-crm) · HTTP 0/5xx = ❌ ·
//    4xx = ⚠️ (บางบทบาทถูกกันออกโดยตั้งใจ — บันทึกไว้ให้ผู้คุมงานดู) · console error = บันทึก + ⚠️
// 🔴 ชื่อคุกกี้ตาม APP_ENV (กติกาเดียวกับ src/lib/env.ts:32 `secureCookies = APP_ENV !== "development"` → session.ts:9):
//    อ่านหลัง loadHrQcEnv · secure = `__Host-shark_session` (+ `shark_tenant` secure) · development = `shark_session` — ไม่ดูจากโปรโตคอล
// 🔴 summary แยกไฟล์ต่อผู้ใช้ `summary-<user>.json` (รันหลายบทบาทในโฟลเดอร์เดียวกันไม่ทับกัน)
// 🔴 โปรไฟล์ chromium `/tmp/chr-hr-<pid>` (+ คู่ใน snap-private-tmp) ลบใน finally เสมอ

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { HQC, addDays, type HqcUserKey } from "./hr-qc-env.mjs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

// ═══════════════════ 1. args (ก่อนแตะ env/DB ใด ๆ) ═══════════════════
const argv = process.argv.slice(2);
const opt = (k: string) => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv[i + 1] : undefined;
};
const DRY = argv.includes("--dry");
const WO = argv[0] && !argv[0].startsWith("--") ? argv[0] : "";
const USER = (opt("--user") ?? "owner") as HqcUserKey;
const BASE = (opt("--base") ?? "").replace(/\/$/, "");
const USERS = Object.keys(HQC.users) as HqcUserKey[];

// HR H2.2 ▸ Ids + สาขา/สัปดาห์ตารางกะจาก seed (HQC.roster) · expect = HTTP ที่ต้องได้ต่อผู้ใช้ (ไม่ตรง = ❌ — ปิดหนี้ H0.4 "4xx = ⚠️ อย่างเดียว" เฉพาะหน้าที่ระบุ) ◂
// HR H4.4 ▸ emp = id พนักงานตามกุญแจ HQC (เฉลย employees) · click = selector ที่กดก่อนถ่าย (เช่นเปิดแผงยืนยันสิ้นสุดการจ้าง) ◂
type Ids = { hr: string; namfon: string; paidRun: string; huahin: string; suanphueng: string; rosterWeek: string; today: string; emp: Record<string, string> }; // HR H2.5 ▸ today ◂
type PageSpec = { key: string; path: (ids: Ids) => string; users: readonly HqcUserKey[] | "all"; why: string; expect?: Partial<Record<HqcUserKey, number>>; click?: string };
/** หน้าที่มีอยู่จริงวันนี้ (7 page.tsx ของ HR) */
const PAGES: readonly PageSpec[] = [
  { key: "employees", path: (i) => `/app/sys/${i.hr}/hr/employees`, users: "all", why: "ทะเบียนพนักงาน" },
  { key: "employee-namfon", path: (i) => `/app/sys/${i.hr}/hr/employees/${i.namfon}`, users: "all", why: "โปรไฟล์น้ำฝน (ช่องอ่อนไหวตามผู้ดู)" },
  { key: "attendance", path: (i) => `/app/sys/${i.hr}/hr/attendance`, users: "all", why: "ลงเวลา" },
  { key: "leave", path: (i) => `/app/sys/${i.hr}/hr/leave`, users: "all", why: "ใบลา" },
  { key: "kiosk", path: (i) => `/app/sys/${i.hr}/hr/kiosk`, users: "all", why: "kiosk PIN" },
  { key: "payroll", path: (i) => `/app/sys/${i.hr}/hr/payroll`, users: "all", why: "เงินเดือน (เห็นเฉพาะผู้ดูเงินเดือน)" },
  { key: "slip-namfon", path: (i) => `/app/sys/${i.hr}/payroll/${i.paidRun}/slip/${i.namfon}`, users: ["owner", "staff"], why: "สลิปน้ำฝน (เจ้าของ + ตัวน้ำฝนเอง)" },
];
/** ชุดหน้าต่อใบงาน — ใบ UI หลัง ๆ เพิ่มของตัวเอง (เช่น SPECS["<ใบ>"] = [หน้าของใบนั้น]) */
const SPECS: Record<string, readonly PageSpec[]> = {
  "0.4": PAGES,
  // HR H0.7 ▸ R5: หน้า "อนุมัติ" → คำขอของฉัน (ปุ่ม hr-leave-cancel-<leaveId>) — เห็นเฉพาะผู้ยื่น (มีใบลา PENDING ในสาย) ◂
  "0.7": [{ key: "approvals-my-requests", path: () => `/app/approvals`, users: ["owner", "manager", "staff"], why: "คำขอของฉัน + ปุ่มยกเลิกใบลา (H0.7)" }],
  // HR H1.1 ▸ R8 (mockup 02): ทะเบียนสาขา + ชิปกรอง (ผู้ดูทุกสาขา) · ผู้จัดการสาขา (manager-branch = สาขาหัวหิน · ไม่มีชิป) · ช่องสาขาประจำในโปรไฟล์ ◂
  "1.1": [
    { key: "register-branches", path: (i) => `/app/sys/${i.hr}/hr/employees`, users: ["owner", "staff"], why: "ทะเบียน: คอลัมน์สาขา + ชิปกรองสาขา + ป้ายสถานะ + ยังไม่ระบุสาขาประจำ (H1.1)" },
    { key: "register-branch-manager", path: (i) => `/app/sys/${i.hr}/hr/employees`, users: ["manager-branch"], why: "ทะเบียนของผู้จัดการสาขา: เฉพาะสาขาหัวหิน + เจที่ยืมตัวเข้ามา · ไม่มีชิป (H1.1)" },
    { key: "profile-unit", path: (i) => `/app/sys/${i.hr}/hr/employees/${i.namfon}`, users: ["owner", "manager-branch"], why: "โปรไฟล์: สาขาประจำ · สถานะการจ้าง · วันครบทดลองงาน/สิ้นสุดสัญญา (H1.1)" },
  ],
  // HR H1.2 ▸ R9 หน้าตั้งค่าแบบย่อ (กะ · ประเภทการลา · วันหยุด) — ไม่อ้างว่าตรงภาพ 08 · เจ้าของ (ทุกสาขา) + ผู้จัดการสาขา (เห็นทั้งร้าน + หัวหิน) ◂
  "1.2": [{ key: "settings-stub", path: (i) => `/app/sys/${i.hr}/hr/settings`, users: ["owner", "manager-branch"], why: "หน้าตั้งค่าแบบย่อ: กะ 4 · ประเภทการลา 4 · วันหยุด 2 (H1.2)" }],
  // HR H2.2 ▸ §4 บอร์ดตารางกะ (mockup 03) — สัปดาห์ของ seed (HQC.roster) · สัปดาห์ว่าง = +28 วัน · ผู้ไม่ใช่ผู้อ่าน = 404 (expect) ◂
  "2.2": [
    { key: "roster-huahin", path: (i) => `/app/sys/${i.hr}/hr/roster?week=${i.rosterWeek}&unit=${i.huahin}`, why: "บอร์ดสาขาหัวหิน: ชิป 3 แบบ · แถบแก้ 3 จุด · เจยืมตัว (ทับเวลา 14–20/12–18) · มิ้นท์เกิน 48 · แผงกฎ (H2.2)", expect: { owner: 200, manager: 200, "manager-branch": 200 }, users: ["owner", "manager", "manager-branch"] },
    { key: "roster-all", path: (i) => `/app/sys/${i.hr}/hr/roster?week=${i.rosterWeek}&unit=all`, why: "บอร์ดทุกสาขา + ชิปสาขา (H2.2)", expect: { owner: 200, manager: 200 }, users: ["owner", "manager"] },
    { key: "roster-empty", path: (i) => `/app/sys/${i.hr}/hr/roster?week=${addDays(i.rosterWeek, 28)}&unit=${i.huahin}`, why: "สัปดาห์ที่ยังไม่มีกะ: ทุกช่องหยุด / เผยแพร่แล้ว (H2.2)", expect: { owner: 200 }, users: ["owner"] },
    { key: "roster-refused", path: (i) => `/app/sys/${i.hr}/hr/roster`, why: "ไม่ใช่ผู้อ่านตารางกะ = 404 (H2.2 Q1)", expect: { staff: 404, payroll: 404, payrollSelf: 404, kiosk: 404, member: 404 }, users: ["staff", "payroll", "payrollSelf", "kiosk", "member"] },
  ],
  // HR H2.3 ▸ R11 หน้า "อนุมัติ": ส่วนคำขอสลับกะ (รับ/ไม่รับ · ยกเลิก) + แถวคำขอสลับกะใน "คำขอของฉัน" — ไม่มีหน้าใหม่ (Q14) · ไม่มี seed (Q15: ว่าง = ไม่มีส่วนนี้) ◂
  "2.3": [{ key: "approvals-swaps", path: () => `/app/approvals`, users: ["owner", "manager", "staff"], why: "คำขอสลับกะถึงคุณ + ยกเลิกคำขอสลับกะ (H2.3)" }],
  // HR H2.5 ▸ §7 หน้าลงเวลา (mockup 04): ทีมรายวันของเมื่อวาน (seed Q9 — ผลบันทึกแล้ว) · วันนี้ (phase/แถบเตือน) · ปฏิทินน้ำฝน · ปฏิทินของตัวเอง · 404 · การ์ดตั้งค่า ◂
  "2.5": [
    { key: "att-day-yesterday", path: (i) => `/app/sys/${i.hr}/hr/attendance?view=day&day=${addDays(i.today, -1)}`, why: "ทีมรายวันเมื่อวาน: สถานะบันทึกแล้ว · น้ำฝนสาย · ชม.จริง/OT (H2.5 04A)", expect: { owner: 200, manager: 200, "manager-branch": 200 }, users: ["owner", "manager", "manager-branch"] },
    { key: "att-day-today", path: (i) => `/app/sys/${i.hr}/hr/attendance?view=day`, why: "ทีมรายวันวันนี้ (seed VIS-1 A4: ตารางกะวันนี้ + เตือน 07:30 พี่เก่ง/น้ำฝน): ยังไม่ถึงเวลา/ยังไม่มา · แถบเตือน · ลงเวลาแทน (H2.5 04A)", expect: { owner: 200 }, users: ["owner"] },
    { key: "att-month-namfon", path: (i) => `/app/sys/${i.hr}/hr/attendance?view=month&employee=${i.namfon}`, why: "ปฏิทินรายคนน้ำฝน + สรุปเดือน (ไม่มีเงิน Q8) (H2.5 04B)", expect: { owner: 200, "manager-branch": 200 }, users: ["owner", "manager-branch"] },
    { key: "att-self", path: (i) => `/app/sys/${i.hr}/hr/attendance`, why: "พนักงาน (น้ำฝน) เห็นปฏิทินของตัวเอง (Q11)", expect: { staff: 200 }, users: ["staff"] },
    { key: "att-refused", path: (i) => `/app/sys/${i.hr}/hr/attendance`, why: "ไม่ใช่ผู้อ่าน/ไม่ผูกพนักงาน = 404", expect: { member: 404, payroll: 404, kiosk: 404 }, users: ["member", "payroll", "kiosk"] },
    { key: "settings-attendance", path: (i) => `/app/sys/${i.hr}/hr/settings`, why: "การ์ดตัดสินผล/การเตือน hr-settings-attendance-policy (R12)", expect: { owner: 200 }, users: ["owner"] },
  ],
  // HR H3.1 ▸ ชั่วโมงทำงาน (mockup 06 แผง · 04B สรุป/รายวัน) — seed ไม่สร้าง snapshot (seed คงเดิม) ⇒ แผงแสดง "ยังไม่ได้ดึง" จนเจ้าของกดดึง ·
  //   การ์ดชั่วโมงทำงานปกติต่อวันบนหน้าตั้งค่า (เจ้าของแก้ได้ · ผู้จัดการสาขาอ่านอย่างเดียว) ◂
  "3.1": [
    { key: "we-panel", path: (i) => `/app/sys/${i.hr}/hr/payroll?period=${i.today.slice(0, 7)}`, users: ["owner", "payroll", "manager-branch"], why: "แผงชั่วโมงทำงานของงวด: สถานะ · ปุ่มดึง (ผู้ดึง) · แถวต่อคน (H3.1 06)" },
    { key: "we-month", path: (i) => `/app/sys/${i.hr}/hr/attendance?view=month&employee=${i.namfon}`, users: ["owner", "manager-branch"], why: "ปฏิทินรายคน + สรุป/รายวันที่ดึงเข้าเงินเดือน (มีเมื่อดึงแล้ว) (H3.1 04B)" },
    { key: "we-settings", path: (i) => `/app/sys/${i.hr}/hr/settings#hr-we-normal`, users: ["owner", "manager-branch"], why: "การ์ดชั่วโมงทำงานปกติต่อวัน (เจ้าของแก้ · ผู้จัดการอ่าน) (H3.1 Q10)" },
  ],
  // HR H3.2 ▸ กฎหักสาย/ขาด — การ์ดกฎ (ตั้งค่า · เจ้าของแก้ · ข้อความ ม.76 เสมอ) · แผง "สรุปส่งเข้าเงินเดือน" บนปฏิทินรายคน (ภาพ 04B) ·
  //   รายการของฉัน (พนักงาน — มีเมื่อคำนวณแล้ว) · seed ปิดกฎ ⇒ แผงบอก "ยังไม่ได้เปิด" เว้นแต่ผู้ควบคุมเปิด + คำนวณก่อนถ่าย ◂
  // HR H3.5 ▸ ไฟล์โอนเงินเดือน (ภาพ 06: ปุ่ม "ไฟล์โอน" · hero "โอน N คน · ฿X" · เลขบัญชี •••4) — ส่วนบนหน้าเงินเดือน (ผู้ผ่านด่านเท่านั้น ·
  //   ผู้จัดการ/พนักงานต้องไม่เห็นส่วนนี้) · รอบที่จ่ายแล้วของ seed + ชุดทั่วไป CSV · การ์ดตั้งค่า (เจ้าของ) — seed ไม่มีบัญชีต้นทาง ⇒ รูปแบบธนาคารปิด ◂
  "3.5": [
    { key: "bank-section", path: (i) => `/app/sys/${i.hr}/hr/payroll?bank=${i.paidRun}#hr-bank`, users: ["owner", "payroll", "manager"], why: "ส่วนไฟล์โอน: รายการรอบ · รูปแบบ · hero โอน N คน · ไม่อยู่ในไฟล์ · คำเตือน · ข้อความ ม.55/77 (ผู้จัดการ = ไม่มีส่วนนี้) (H3.5 R15)" },
    { key: "bank-untested", path: (i) => `/app/sys/${i.hr}/hr/payroll?bank=${i.paidRun}&bfmt=KBANK_PCT#hr-bank`, users: ["owner"], why: "รูปแบบธนาคารที่ยังไม่เปิด ⇒ ข้อความ formatOff + ป้ายยังไม่ทดสอบ (เปิดแล้ว = ช่องติ๊กรับทราบก่อนสร้าง) (H3.5 R10)" },
    { key: "bank-settings", path: (i) => `/app/sys/${i.hr}/hr/settings#hr-bank-settings`, users: ["owner"], why: "การ์ดบัญชีต้นทาง + เปิดรูปแบบ (ป้ายยังไม่ทดสอบ + ติ๊กรับทราบ) + ชุดคอลัมน์ของร้าน (H3.5 R10 R8)" },
  ],
  "3.2": [
    { key: "attpay-settings", path: (i) => `/app/sys/${i.hr}/hr/settings#hr-attpay-policy`, users: ["owner", "manager-branch"], why: "การ์ดกฎหักสาย/ออกก่อน/ขาดงาน + ข้อความ ม.76 (เจ้าของแก้ · ผู้จัดการอ่าน) (H3.2 R2 R11)" },
    { key: "attpay-panel", path: (i) => `/app/sys/${i.hr}/hr/attendance?view=month&employee=${i.namfon}`, users: ["owner", "manager-branch"], why: "แผงสรุปส่งเข้าเงินเดือน: นาที · เงิน (เจ้าของ) · ปุ่มคำนวณ (H3.2 04B)" },
    { key: "attpay-mine", path: (i) => `/app/sys/${i.hr}/hr/attendance`, users: ["staff"], why: "รายการหักสาย/ขาดของฉัน (มีเมื่อคำนวณแล้ว) (H3.2 Q9)" },
  ],
  // HR H3.4 ▸ รอบจ่ายรุ่น 2 (ภาพ 06) — seed อยู่รุ่น 1 ⇒ ส่วน hr-run2 ไม่แสดงจนผู้ควบคุมเปิดรุ่น 2 (ต้องมีแถวกฎหมาย ACTIVE) + สร้างรอบก่อนถ่าย ·
  //   การ์ดรุ่นเครื่องบนหน้าตั้งค่า (เจ้าของแก้ · ผู้จัดการอ่าน) แสดงเสมอ ◂
  // HR H3.9 ▸ รายงาน HR + ทะเบียนลูกจ้าง (ไม่มีแท็บใหม่ — เข้าจากภาพรวม) — เจ้าของ: ทะเบียน + การ์ดตั้งค่าเลขเต็ม · ผู้ดูเงินเดือน: เงินเดือนรายงวด ·
  //   ผู้จัดการ: รายงานเวลา (ไม่มี ฿) · ผู้จัดการขอรายงานเงินเดือน = เห็นรายงานแรกที่เปิดได้แทน (ไม่มีชิปเงินเดือน) · 3 ขนาดจอตามชุดปกติ ◂
  "3.9": [
    { key: "report-register", path: (i) => `/app/sys/${i.hr}/hr/reports?report=register`, users: ["owner", "payroll"], why: "ทะเบียนลูกจ้าง: ตาราง · เลขประจำตัว •••4 · คำเตือนช่องว่าง · หมายเหตุ ม.112/115 · การ์ดเลขเต็ม (เจ้าของ) (H3.9 R10 R10b)" },
    { key: "report-payroll", path: (i) => `/app/sys/${i.hr}/hr/reports?report=payroll-month&period=${i.today.slice(0, 7)}`, users: ["owner", "payroll", "manager"], why: "สรุปเงินเดือนรายงวด: ฿ มีตัวคั่น · แถวรวมจากแถวที่เห็น (ผู้จัดการ = ไม่มีชิปเงินเดือน) (H3.9 R4 R12)" },
    { key: "report-time", path: (i) => `/app/sys/${i.hr}/hr/reports?report=time&period=${i.today.slice(0, 7)}`, users: ["owner", "manager-branch"], why: "รายงานเวลาทำงานรายเดือน (ภาพ 01 การ์ดเดือน) · ปุ่มไฟล์ CSV/Excel (H3.9 R12)" },
  ],
  "3.4": [
    { key: "run2-engine", path: (i) => `/app/sys/${i.hr}/hr/settings#hr-run2-engine`, users: ["owner", "manager"], why: "การ์ดรุ่นเครื่องคิดเงินเดือน + เพดานหัก ม.76 + ช่วงที่กฎหักสาย/ขาดมีผล (H3.4 R3)" },
    { key: "run2-run", path: (i) => `/app/sys/${i.hr}/hr/payroll?period=${i.today.slice(0, 7)}#hr-run2`, users: ["owner", "payroll", "manager-branch"], why: "รอบจ่ายรุ่น 2: ขั้น · ไทล์ · ตาราง + ที่มา · ต้องตรวจ · ยืนยันสาขา (ผู้จัดการ = นาทีเท่านั้น) (H3.4 06)" },
  ],
  // HR H2.9 ▸ คำขอ OT (mockup 05 การ์ด OT · 07a ขอ OT) — หน้าใบลา: ฟอร์ม + รายการ (เจ้าของ ฿ · ผู้จัดการไม่เห็น ฿ — Q11) · ตั้งค่า: กฎ OT · เงินเดือน: อัตรา OT #18 ◂
  "2.9": [
    { key: "ot-leave", path: (i) => `/app/sys/${i.hr}/hr/leave`, users: ["owner", "manager", "staff"], why: "ส่วนคำขอ OT: ฟอร์ม hr-ot-form · รายการ hr-ot-list · ปุ่มอนุมัติ/ไม่อนุมัติ/ยกเลิก (H2.9)" },
    { key: "ot-settings", path: (i) => `/app/sys/${i.hr}/hr/settings`, users: ["owner"], why: "การ์ดกฎคำขอ OT hr-settings-ot-policy (H2.9 R14)" },
    { key: "ot-salary-rate", path: (i) => `/app/sys/${i.hr}/hr/payroll`, users: ["owner"], why: "ช่องอัตรา OT ต่อชั่วโมง hr-salary-ot-rate ในฟอร์มเงินเดือน (#18)" },
  ],
  // HR H2.6 ▸ brief §5 คำขอแก้เวลา: 04A ปุ่ม "แก้เวลา" ต่อแถว + ฟอร์ม · ?view=corrections การ์ด (mockup 05 — seed ไม่มีคำขอ ⇒ ว่าง ยกเว้นผู้ควบคุมยื่นก่อนถ่าย) ·
  //   พนักงาน "ขอแก้เวลา" บนปฏิทินของตัวเอง + รายการของฉัน · ผู้ไม่ใช่ผู้อ่าน/ไม่ผูกพนักงาน = 404 ◂
  "2.6": [
    { key: "corr-day", path: (i) => `/app/sys/${i.hr}/hr/attendance?view=day&day=${addDays(i.today, -1)}`, why: "ทีมรายวันเมื่อวาน: ปุ่ม \"แก้เวลา\" ต่อแถว (H2.6 04A)", expect: { owner: 200, "manager-branch": 200 }, users: ["owner", "manager-branch"] },
    { key: "corr-day-form", path: (i) => `/app/sys/${i.hr}/hr/attendance?view=day&day=${addDays(i.today, -1)}`, click: '[data-testid="hr-corr-open"]', why: "ฟอร์มแก้เวลา: ชนิดคำขอ · ชนิด · เวลาเดิม · วันเวลา · เหตุผล — แผ่นเต็มกว้างติดล่าง (390) / กล่องกลางจอ (≥ sm) + ฉากหลังปิดได้ ไม่อยู่ในช่องการกระทำ (H2.12 VIS-2) (H2.6)", expect: { owner: 200 }, users: ["owner"] },
    { key: "corr-list", path: (i) => `/app/sys/${i.hr}/hr/attendance?view=corrections`, why: "การ์ดคำขอแก้เวลา: ชิป · ชื่อ · ยื่น · ลืมลงเวลาออก · หลักฐาน POS · ขอซ้ำ · อนุมัติ/ปฏิเสธ (H2.6 mockup 05)", expect: { owner: 200, manager: 200, "manager-branch": 200 }, users: ["owner", "manager", "manager-branch"] },
    { key: "corr-self-form", path: (i) => `/app/sys/${i.hr}/hr/attendance`, click: '[data-testid="hr-corr-open"]', why: "พนักงาน (น้ำฝน): \"ขอแก้เวลา\" บนปฏิทินของตัวเอง (H2.6 04B)", expect: { staff: 200 }, users: ["staff"] },
    { key: "corr-self-daylist", path: (i) => `/app/sys/${i.hr}/hr/attendance`, click: '[data-testid^="hr-att-dayrow-"]', why: "พนักงาน 390: แถวรายวัน (VIS-1 A3) มีปุ่ม \"ขอแก้เวลา\" ของวันนั้น (H2.6)", expect: { staff: 200 }, users: ["staff"] },
    { key: "corr-self-list", path: (i) => `/app/sys/${i.hr}/hr/attendance?view=corrections`, why: "คำขอแก้เวลาของฉัน + ยกเลิก (H2.6)", expect: { staff: 200 }, users: ["staff"] },
    { key: "corr-refused", path: (i) => `/app/sys/${i.hr}/hr/attendance?view=corrections`, why: "ไม่ใช่ผู้อ่าน/ไม่ผูกพนักงาน = 404 (H2.6)", expect: { member: 404, payroll: 404, kiosk: 404 }, users: ["member", "payroll", "kiosk"] },
  ],
  // HR H2.11 ▸ brief §5 (mockup 01 + 05): ภาพรวมทีมบน HrHub · กล่องคำขอรวม (ทุกชนิด · type=OT · ผลชุด · โควตา) · ผู้ไม่เห็นคำขอชนิดใด = 404 ·
  //   seed มีคำขอรอครบ 5 ชนิด (ลา · OT · สลับกะ · แก้เวลา · เบิกล่วงหน้า + หักค่าของ) · HQC ไม่มีผู้ถือคีย์ hr.employee.create ⇒ "key-holder" = manager (ทุกสาขา) ◂
  "2.11": [
    { key: "hub-overview", path: (i) => `/app/sys/${i.hr}`, users: ["owner", "manager-branch", "manager", "payroll", "staff"], why: "ภาพรวมทีม 01: อยู่กะวันนี้ · คำขอที่ตัดสินได้ · วันที่ต้องคิดผลใหม่ · ใกล้ครบกำหนด + ตัวอย่างคำขอ 5 รายการ — การ์ดย่อมีสรุป hr-inbox-summary-* (วัน/ช่วง · ชม./วัน · ฿ เฉพาะผู้ดูเงินเดือน) · รายการเงิน = ลิงก์ hr-inbox-open-* ไม่มีปุ่มอนุมัติ (H2.12 VIS-2) (staff = ไม่มีส่วนนี้) (H2.11)" },
    { key: "inbox", path: (i) => `/app/sys/${i.hr}/hr/requests`, users: ["owner", "manager-branch", "manager", "payroll"], expect: { owner: 200, "manager-branch": 200, manager: 200, payroll: 200 }, why: "กล่องคำขอรวม 05: ชิปชนิด+ตัวนับ · การ์ดมีป้าย (ไม่มีรหัสดิบ — H2.12 VIS-2) · ผลกระทบ · แถบเลือกบนสุด พื้นทึบ ติดใต้แถบบน (H2.12 VIS-2) · ตารางโควตา (payroll = OT/เงิน อ่านอย่างเดียว ไม่มีโควตา) (H2.11)" },
    { key: "inbox-ot", path: (i) => `/app/sys/${i.hr}/hr/requests?type=OT`, users: ["owner", "manager-branch"], why: "type=OT: นาที × อัตรา ไม่มี ฿ ถึงผู้จัดการ · ตัวนับไม่เปลี่ยน (H2.11)" },
    { key: "inbox-adj", path: (i) => `/app/sys/${i.hr}/hr/requests?type=ADJUSTMENT`, users: ["owner", "payroll"], why: "เพิ่ม/หักเงิน: ยอด · ที่มา · หนังสือยินยอมของหักค่าของ · ตัดสินทีละรายการ (H2.11)" },
    { key: "inbox-batch-result", path: (i) => `/app/sys/${i.hr}/hr/requests?type=SWAP`, click: '[data-testid^="hr-inbox-approve-"]', users: ["owner"], why: "ผลการตัดสิน (hr-inbox-result) ต่อรายการ — ⚠ กดจริง: ถ่ายหลังภาพอื่น แล้ว seed ใหม่ (H2.11)" },
    { key: "inbox-refused", path: (i) => `/app/sys/${i.hr}/hr/requests`, users: ["staff", "member", "kiosk"], expect: { staff: 404, member: 404, kiosk: 404 }, why: "ไม่เห็นคำขอชนิดใดเลย = 404 (H2.11)" },
  ],
  // HR H4.2 ▸ brief §7 (mockup 01 การ์ด labor % + เดือน · 03 หัวคอลัมน์ จัด/ต้องการ · แถบท้าย · แผงความต้องการคน) — seed ไม่มียอด POS ⇒ ยอดขาย/คาดการณ์ = 0 ·
  //   ความต้องการคนแสดงเมื่อตั้ง hrLabor.splhSatang (ผู้ควบคุมตั้งก่อนถ่าย) · ผู้จัดการ/พนักงาน = ไม่มีการ์ด ฿ ◂
  "4.2": [
    { key: "labor-card", path: (i) => `/app/sys/${i.hr}`, users: ["owner", "payroll", "manager"], why: "การ์ดค่าแรงต่อยอดขาย: labor % + เป้า · ค่าแรงวันนี้ · ยอดขายคาด · ขายแล้ว · กราฟรายชั่วโมง · กะ · เดือน · หมายเหตุ (manager = ไม่มีการ์ด) (H4.2 01)" },
    { key: "labor-roster", path: (i) => `/app/sys/${i.hr}/hr/roster`, users: ["owner", "manager-branch"], why: "หัวคอลัมน์ จัด/ต้องการ (ขาด = อำพัน) · แถบท้าย ชม./ค่าแรง/labor % คาด (ผู้จัดการ = ชม. เท่านั้น) · แผงความต้องการคนรายชั่วโมง (H4.2 03)" },
    { key: "labor-settings", path: (i) => `/app/sys/${i.hr}/hr/settings#labor-settings-title`, users: ["owner", "manager-branch"], why: "การ์ดค่าตั้งค่าแรงต่อยอดขาย (เจ้าของแก้ · ผู้จัดการสาขาอ่าน) (H4.2 R6)" },
  ],
  // HR H4.6 ▸ brief §5 (ไม่มี mockup — ตามฟอร์มรายการเพิ่ม/หักของหน้าเงินเดือน): ส่วน "หักค่าของ" #hr-stock · ฟอร์ม (ผู้ถือคีย์ยื่น) · รายการ/ยอด/หนังสือยินยอม/ธงเพดาน
  //   (ผู้ดูเงินเดือน) · seed ไม่มีรายการ ⇒ ว่าง เว้นแต่ผู้ควบคุมยื่นก่อนถ่าย · staff/member ไม่มีส่วนนี้ ◂
  "4.6": [
    { key: "stock-owner", path: (i) => `/app/sys/${i.hr}/hr/payroll#hr-stock`, users: ["owner"], expect: { owner: 200 }, why: "เจ้าของ: ฟอร์มหักค่าของ + รายการ + ข้อความ ม.76/77 (H4.6)" },
    { key: "stock-manager", path: (i) => `/app/sys/${i.hr}/hr/payroll#hr-stock`, users: ["manager", "manager-branch"], why: "ผู้จัดการ: ฟอร์มเท่านั้น (ไม่เห็นยอด/รายการ — ไม่ใช่ผู้ดูเงินเดือน) (H4.6)" },
    { key: "stock-payroll", path: (i) => `/app/sys/${i.hr}/hr/payroll#hr-stock`, users: ["payroll"], why: "ผู้ดูเงินเดือน: รายการ/ยอด/หนังสือยินยอม/ชิป hr-pay-src-stock (H4.6)" },
    { key: "stock-staff", path: (i) => `/app/sys/${i.hr}/hr/payroll`, users: ["staff", "member"], why: "พนักงาน/สมาชิก: ไม่มีส่วนหักค่าของ (H4.6)" },
  ],
  // HR H4.4 ▸ brief §5 (mockup 02) — ข้อมูลจาก seed (HQC.lifecycle: โบว์ ทดลองงาน + รายการรับเข้า 5/7 · เจ สัญญาถึงสิ้นเดือน · นัท ตักเตือนด้วยวาจา · ฝ้าย ผู้ลาออก) ◂
  "4.4": [
    { key: "life-due", path: (i) => `/app/sys/${i.hr}/hr/employees`, users: ["owner", "manager-branch", "staff"], why: "ทะเบียน: แผง \"ต้องจัดการ\" 4 ช่อง (ทดลองงาน · สัญญา · รับเข้าค้าง · ออกจากงานค้าง) — staff ไม่เห็นแผง (H4.4)" },
    { key: "life-probation", path: (i) => `/app/sys/${i.hr}/hr/employees/${i.emp.bow}`, users: ["owner", "manager-branch"], why: "โปรไฟล์โบว์: แถบทดลองงาน + ปุ่มผ่านทดลองงาน · รายการรับเข้า 5/7 · บันทึก (H4.4)" },
    { key: "life-notes", path: (i) => `/app/sys/${i.hr}/hr/employees/${i.emp.nat}`, users: ["owner", "manager-branch"], why: "โปรไฟล์นัท: บันทึกตักเตือนด้วยวาจา (พนักงานเห็น) + ฟอร์มเพิ่มบันทึก (H4.4)" },
    { key: "life-contract", path: (i) => `/app/sys/${i.hr}/hr/employees/${i.emp.jay}`, users: ["owner"], why: "โปรไฟล์เจ: สัญญาถึงสิ้นเดือน (H4.4)" },
    { key: "life-offboard-open", path: (i) => `/app/sys/${i.hr}/hr/employees/${i.emp.nat}`, click: '[data-testid="hr-life-offboard"] > summary', users: ["owner", "manager-branch"], why: "แผงยืนยันสิ้นสุดการจ้าง: วัน · เหตุผล · หมายเหตุ · ช่องถอนสิทธิ์ (ผู้จัดการ = ล็อก) · คำเตือนสลิปเงินเดือน (H4.4)" },
    { key: "life-ended-kept", path: (i) => `/app/sys/${i.hr}/hr/employees/${i.emp.fai}?life=ok.kept`, users: ["owner"], why: "โปรไฟล์ฝ้าย (สิ้นสุดแล้ว): แถบสิ้นสุด · รายการออกจากงาน · ข้อความ \"เก็บสิทธิ์บัญชีไว้\" (H4.4)" },
    { key: "life-settings", path: (i) => `/app/sys/${i.hr}/hr/settings#hr-life`, users: ["owner", "manager-branch"], why: "หน้าตั้งค่า: การ์ดวงจรพนักงาน (ผู้จัดการสาขา = ปิดแก้ · สวิตช์ถอนสิทธิ์ล็อก) (H4.4)" },
    // VIS-1 B3: "life-staff-self" ถอดออก — staff เปิดโปรไฟล์ตัวเอง = 404 มาก่อน H4.4 (หน้าบริการตัวเองมากับ H2.10 · หนี้ D-VIS1-selfprofile)
  ],
  // HR VISUAL batch1 ▸ H2.4 ลงเวลา v2 (mockup 04A/07ก): จอ kiosk PIN + ปุ่มลงเวลา/เริ่มพัก · การ์ดจุดลงเวลา hr-clock-site-* บนหน้าตั้งค่า · ผู้ไม่ใช่ผู้ตั้งค่า = 404 ◂
  "2.4": [
    { key: "clock-kiosk", path: (i) => `/app/sys/${i.hr}/hr/kiosk`, users: ["kiosk", "owner", "manager-branch"], expect: { kiosk: 200, owner: 200, "manager-branch": 200 }, why: "จอลงเวลา: รายชื่อ (ขั้น NAME) (H2.4 R9)" },
    { key: "clock-kiosk-refused", path: (i) => `/app/sys/${i.hr}/hr/kiosk`, users: ["member", "payrollSelf", "staff"], expect: { member: 404, payrollSelf: 404, staff: 404 }, why: "ไม่ใช่บัญชีจอ/เจ้าของ/ผู้จัดการ/ผู้ถือคีย์ลงเวลา = 404 (VIS-1 C)" },
    { key: "clock-kiosk-pin", path: (i) => `/app/sys/${i.hr}/hr/kiosk`, click: '[data-testid^="hr-kiosk-name-"]', users: ["kiosk"], why: "จอลงเวลา หลังกดชื่อ: PIN pad · ลงเวลา · เริ่มพัก (H2.4 R9)" },
    { key: "clock-settings", path: (i) => `/app/sys/${i.hr}/hr/settings`, users: ["owner", "manager-branch"], expect: { owner: 200, "manager-branch": 200 }, why: "การ์ดจุดลงเวลา/GPS/รัศมี/PDPA hr-clock-site-* (H2.4 R10)" },
    { key: "clock-settings-refused", path: (i) => `/app/sys/${i.hr}/hr/settings`, users: ["staff", "kiosk"], expect: { staff: 404, kiosk: 404 }, why: "ไม่ใช่ผู้ตั้งค่า = 404 (H2.4)" },
  ],
  // HR VISUAL batch1 ▸ H3.3 ตารางกฎหมาย (mockup 08, อ่านอย่างเดียว) + ลิงก์จากหน้าตั้งค่า ◂
  "3.3": [
    { key: "law", path: (i) => `/app/sys/${i.hr}/hr/settings/law`, users: ["owner", "manager-branch"], expect: { owner: 200, "manager-branch": 200 }, why: "hr-law-table · แถวต่อชนิด · รอนักบัญชียืนยัน (H3.3 R8)" },
    { key: "law-refused", path: (i) => `/app/sys/${i.hr}/hr/settings/law`, users: ["staff", "payroll", "member"], expect: { staff: 404, payroll: 404, member: 404 }, why: "ไม่ใช่ผู้ตั้งค่า = 404 (H3.3 Q8)" },
  ],
  // HR VISUAL batch1 ▸ H2.7+H2.8 ใบลา + วันหยุด (mockup 05/07ข): ฟอร์มยื่น (ประเภท · ครึ่งวัน · รายชั่วโมง) · ยอดคงเหลือ · รออนุมัติ · การ์ดนโยบายลา/วันหยุดบนหน้าตั้งค่า ◂
  "2.7": [
    { key: "leave", path: (i) => `/app/sys/${i.hr}/hr/leave`, users: ["owner", "manager", "manager-branch", "staff", "member"], why: "หน้าใบลา: ฟอร์ม · ยอดคงเหลือ · รออนุมัติ (H2.7)" },
    { key: "leave-settings", path: (i) => `/app/sys/${i.hr}/hr/settings`, users: ["owner"], expect: { owner: 200 }, why: "การ์ดประเภทการลา (ครึ่งวัน/รายชั่วโมง/แนบไฟล์) + วันหยุด + preset (H2.7/H2.8)" },
    // HR H2.12 ▸ F1/F5: ส่วนพับ "เพิ่มประเภทลาตามกฎหมาย" (ค่า · มาตรา/ถ้อยคำกลาง · มีแล้ว · ยังไม่รองรับ 50%) + คำเตือนใต้ประเภทที่ต่ำกว่า (ไม่บล็อก) ◂
    { key: "leave-law-presets", path: (i) => `/app/sys/${i.hr}/hr/settings`, click: '[data-testid="hr-settings-law-presets-open"]', users: ["owner"], expect: { owner: 200 }, why: "รายการประเภทลาตามกฎหมาย hr-settings-law-preset-* · ฟอร์มแก้ค่าได้ · มีแล้ว = ชื่อที่ตรง · ลาเลี้ยงดูบุตร = ปุ่มปิด (H2.12 F1)" },
  ],
  // HR VISUAL batch1 ▸ H4.1 บรรทัดผลกระทบบนการ์ดใบลา hr-leave-impact* (mockup 05) — staff ต้องไม่เห็น ◂
  // HR H2.10 ▸ "ของฉัน" (mockup 07a/07b · มือถือก่อน): staff (น้ำฝน) = 5 แท็บ + ฟอร์มยื่นลา · payrollSelf (ก้อย ผูกบัญชี) = หน้าเดียวกันของตัวเอง ·
  //   "member" (ไม่ผูก) + "owner" (seed ไม่ผูกเจ้าของกับพนักงาน — เจ้าของที่ผูกเห็นหน้าเดียวกับ staff · ข้อสอบ S5.2) = hr-self-empty (200) ·
  //   แท็บ HR ของ staff ไม่มี ตารางกะ/จอลงเวลา/ตั้งค่า/ตารางกฎหมาย · staff เปิดโปรไฟล์ตัวเอง ⇒ redirect /app/me/hr/profile ◂
  "2.10": [
    { key: "self-today", path: () => `/app/me/hr`, users: ["staff", "payrollSelf", "member", "owner"], expect: { staff: 200, payrollSelf: 200, member: 200, owner: 200 }, why: "วันนี้: กะ · ลงเวลา + GPS · เพื่อนร่วมกะ · สัปดาห์ · ทางลัด 6 · วันลาคงเหลือ / ไม่ผูก = hr-self-empty (H2.10)" },
    { key: "self-week", path: () => `/app/me/hr/week`, users: ["staff"], expect: { staff: 200 }, why: "ตารางรายสัปดาห์ของตัวเอง (H2.10)" },
    { key: "self-requests", path: () => `/app/me/hr/requests`, users: ["staff", "member"], expect: { staff: 200, member: 200 }, why: "คำขอของฉัน + ทางลัดฟอร์ม (H2.10)" },
    { key: "self-leave-form", path: () => `/app/me/hr/requests?form=leave`, users: ["staff"], expect: { staff: 200 }, why: "ฟอร์มยื่นลา 07b: ประเภท · วันที่ พ.ศ. · กระทบกะ · คงเหลือหลังลา · ปุ่มส่งติดล่าง (H2.10)" },
    { key: "self-advance-form", path: () => `/app/me/hr/requests?form=advance`, users: ["staff"], expect: { staff: 200 }, why: "ฟอร์มเบิกล่วงหน้า (H2.10 R6)" },
    { key: "self-pay", path: () => `/app/me/hr/pay`, users: ["staff"], expect: { staff: 200 }, why: "สลิปของตัวเอง (รอบที่จ่ายแล้ว) + ช่องหนังสือรับรอง (H2.10)" },
    { key: "self-profile", path: () => `/app/me/hr/profile`, users: ["staff", "owner"], expect: { staff: 200, owner: 200 }, why: "ฉัน: ข้อมูล · วันลา · บันทึก + รับทราบ (H2.10)" },
    { key: "self-hr-tabs", path: (i) => `/app/sys/${i.hr}/hr/leave`, users: ["staff"], expect: { staff: 200 }, why: "แท็บ HR ของ staff ไม่มีหน้าที่ 404 + มี \"ของฉัน\" (H2.10 R7)" },
    { key: "self-own-profile", path: (i) => `/app/sys/${i.hr}/hr/employees/${i.namfon}`, users: ["staff"], expect: { staff: 200 }, why: "staff เปิดโปรไฟล์ตัวเอง ⇒ redirect /app/me/hr/profile (H2.10 R7)" },
  ],
  "4.1": [{ key: "leave-impact", path: (i) => `/app/sys/${i.hr}/hr/leave`, users: ["owner", "manager-branch", "staff"], why: "กระทบ: กะ วัน เวลา — ยังมี n คน / ขาด 1 คน → ระบบเสนอ … (H4.1 R12)" }],
};
const VIEWPORTS = [
  { name: "desktop", w: 1440, h: 900, mobile: false, touch: false },
  { name: "ipad", w: 1024, h: 768, mobile: false, touch: true },
  { name: "mobile", w: 390, h: 844, mobile: true, touch: true },
] as const;

function die(msg: string): never {
  console.error(`❌ visual-hr: ${msg}`);
  process.exit(2);
}
if (!WO) die(`ต้องระบุใบงาน: ${[...Object.keys(SPECS), "all"].join(" · ")} — เช่น pnpm exec tsx scripts/visual-hr.mts all --dry --user owner`);
if (WO !== "all" && !SPECS[WO]) die(`ใบงาน "${WO}" ยังไม่มีใน SPECS (มี: ${Object.keys(SPECS).join(" · ")} · all)`);
if (!USERS.includes(USER)) die(`--user ${USER} ไม่รู้จัก — ใช้ได้: ${USERS.join(" · ")}`);
const spec = (WO === "all" ? PAGES : SPECS[WO]!).filter((p) => p.users === "all" || p.users.includes(USER));
const OUT = `${HQC.shotsDir}/${WO === "all" ? "all" : WO}`;
const fileOf = (p: PageSpec, v: (typeof VIEWPORTS)[number]) => `${OUT}/${p.key}-${USER}-${v.w}x${v.h}.png`;

// ═══════════════════ 2. --dry: พิมพ์ตารางแล้วจบ (ไม่มี env · DB · เซิร์ฟเวอร์) ═══════════════════
if (DRY) {
  const ph: Ids = { hr: "<hr>", namfon: "<น้ำฝน>", paidRun: "<paidRun>", huahin: "<หัวหิน>", suanphueng: "<สวนผึ้ง>", rosterWeek: "2030-01-07", today: "2030-01-08", emp: new Proxy({}, { get: (_t, k) => `<${String(k)}>` }) as Record<string, string> }; // HR H2.2 ▸ ◂
  console.log(`🧪 visual-hr --dry · ใบ ${WO} · ผู้ใช้ ${USER} (${HQC.users[USER].role}) · ${spec.length} หน้า × ${VIEWPORTS.length} ขนาดจอ = ${spec.length * VIEWPORTS.length} ภาพ`);
  for (const p of spec) {
    console.log(`  ${p.key.padEnd(16)} ${p.path(ph)}${p.click ? ` · click ${p.click}` : ""}   — ${p.why}`);
    for (const v of VIEWPORTS) console.log(`      ${v.name.padEnd(8)} ${String(v.w).padStart(4)}×${String(v.h).padEnd(4)} → ${fileOf(p, v)}`);
  }
  const skipped = PAGES.filter((p) => !spec.includes(p) && (WO === "all" || SPECS[WO]!.includes(p)));
  for (const p of skipped) console.log(`  ⏭  ${p.key} — ไม่ถ่ายด้วย ${USER} (${p.why})`);
  console.log(`DRY_SUMMARY ${JSON.stringify({ wo: WO, user: USER, pages: spec.length, viewports: VIEWPORTS.length, shots: spec.length * VIEWPORTS.length })}`);
  process.exit(0);
}

// ═══════════════════ 3. ต้องมีเซิร์ฟเวอร์ที่ต่อได้ (ก่อนโหลด env) ═══════════════════
if (!BASE) die("ไม่ได้ส่ง --base http://127.0.0.1:<port> (เซิร์ฟเวอร์ QC เป็นงาน CONTROLLER-RUN · ใช้ --dry เพื่อดูตาราง)");
if (/:3215\b|:3225\b/.test(BASE)) die(`--base ${BASE} เป็นพอร์ตของเลนอื่น (3215 = CRM · 3225 = POS) — ใช้พอร์ตของ HR เช่น 3226`);
{
  const ping = await fetch(BASE, { redirect: "manual", signal: AbortSignal.timeout(4_000) }).catch((e: unknown) => e as Error);
  if (ping instanceof Error) die(`ต่อเซิร์ฟเวอร์ ${BASE} ไม่ได้ (${ping.message}) — ให้ผู้คุมงานเปิด ACC_V2_PORT=3226 bash scripts/acc-v2-serve.sh start`);
}

// ═══════════════════ 4. env + เฉลย ═══════════════════
const envMod = await import("./hr-qc-env.mjs");
await envMod.loadHrQcEnv("visual-hr");
if (!existsSync(HQC.expectedPath)) die(`ไม่พบ ${HQC.expectedPath} — รัน seed-hr-qc ก่อน`);
const E = JSON.parse(readFileSync(HQC.expectedPath, "utf8")) as Any;
const { prisma } = (await import("@/lib/core/db" as string)) as Any;
const { sha256 } = (await import("@/lib/core/hash" as string)) as Any;
const scope = await envMod.findQcTenant(prisma);
if (!scope || scope.tenantId !== E.tenant?.id) {
  await prisma.$disconnect?.();
  die(`เฉลย ${HQC.expectedPath} ไม่ตรงกับฐาน (ร้านในฐาน ${scope?.tenantId ?? "ไม่มี"} · เฉลย ${E.tenant?.id}) — รัน seed-hr-qc ใหม่`);
}
const IDS: Ids = { hr: E.systems.HR, namfon: E.employees.namfon, paidRun: E.paidRun.id, huahin: E.units?.huahin ?? "", suanphueng: E.units?.suanphueng ?? "", rosterWeek: E.roster?.week ?? "", today: E.dates?.today ?? "", emp: (E.employees ?? {}) as Record<string, string> }; // HR H2.2 ▸ ◂ · HR H2.5 ▸ today ◂
/** ตรงกับ src/lib/env.ts:32 — เซิร์ฟเวอร์ QC อ่าน env ชุดเดียวกัน (qc4.sh) */
const SECURE_COOKIES = (process.env.APP_ENV ?? "") !== "development";
console.log(`🍪 APP_ENV=${process.env.APP_ENV ?? "(ไม่ตั้ง)"} ⇒ คุกกี้ ${SECURE_COOKIES ? "__Host-shark_session (secure)" : "shark_session"}`);
mkdirSync(OUT, { recursive: true });

// ═══════════════════ 5. ถ่าย ═══════════════════
const UA = "qc-visual-hr";
class Fatal extends Error {}
const MINE: string[] = []; // id แถว session ของรอบนี้เท่านั้น
type Shot = { page: string; user: string; viewport: string; path: string; file: string; status: number; finalUrl: string; consoleErrors: string[]; overflow: { html: boolean; body: boolean; scrollWidth: number; clientWidth: number }; ok: boolean; note?: string };
const shots: Shot[] = [];
let fatal = "";
const PROFILE = `/tmp/chr-hr-${process.pid}`;

async function mintSession(key: HqcUserKey): Promise<Any[]> {
  const userId: string | undefined = E.users?.[key]?.userId;
  if (!userId) throw new Fatal(`เฉลยไม่มีผู้ใช้ ${key}`);
  const token = "hrv" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  const ttl = new Date(Date.now() + 60 * 60 * 1000);
  const row = await prisma.session.create({ data: { userId, tokenHash: sha256(token), userAgent: UA, idleExpiresAt: ttl, expiresAt: ttl }, select: { id: true } });
  MINE.push(row.id);
  const host = new URL(BASE).hostname;
  return SECURE_COOKIES
    ? [{ name: "__Host-shark_session", value: token, url: BASE, path: "/", secure: true }, { name: "shark_tenant", value: E.tenant.id, url: BASE, path: "/", secure: true }]
    : [{ name: "shark_session", value: token, domain: host, path: "/" }, { name: "shark_tenant", value: E.tenant.id, domain: host, path: "/" }];
}

try {
  const cookies = await mintSession(USER);
  const pptr = (await import("/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js" as string)) as Any;
  const browser = await pptr.default.launch({ executablePath: "/usr/bin/chromium-browser", args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", `--user-data-dir=${PROFILE}`] });
  try {
    for (const p of spec) {
      const path = p.path(IDS);
      for (const v of VIEWPORTS) {
        const page = await browser.newPage();
        const cErr: string[] = [];
        try {
          await page.setViewport({ width: v.w, height: v.h, deviceScaleFactor: 1, isMobile: v.mobile, hasTouch: v.touch });
          // tsx (esbuild keepNames) ห่อฟังก์ชันด้วย __name(...) — ในเบราว์เซอร์ไม่มี ⇒ ใส่ตัวว่าง
          await page.evaluateOnNewDocument("window.__name = function (f) { return f; };");
          await page.setCookie(...cookies);
          page.on("pageerror", (e: Error) => cErr.push(e.message.slice(0, 160)));
          page.on("console", (m: Any) => {
            if (m.type() === "error") cErr.push(String(m.text()).slice(0, 160));
          });
          const resp = await page.goto(`${BASE}${path}`, { waitUntil: "networkidle2", timeout: 60_000 }).catch(() => null);
          await new Promise((r) => setTimeout(r, 600));
          // HR H4.4 ▸ กดก่อนถ่าย (ไม่เจอ selector = บันทึกใน console error ของภาพนั้น · ไม่ล้มทั้งรอบ) ◂
          if (p.click) {
            const sel = p.click;
            await page.click(sel).then(() => new Promise((r) => setTimeout(r, 400)), () => cErr.push(`click: ไม่พบ ${sel}`));
          }
          const ov = (await page.evaluate(() => {
            const d = document.documentElement;
            const b = document.body;
            return { html: d.scrollWidth > d.clientWidth, body: !!b && b.scrollWidth > b.clientWidth, scrollWidth: Math.max(d.scrollWidth, b?.scrollWidth ?? 0), clientWidth: d.clientWidth };
          })) as Shot["overflow"];
          const file = fileOf(p, v);
          await page.screenshot({ path: file, fullPage: true });
          const status = resp?.status() ?? 0;
          const want = p.expect?.[USER]; // HR H2.2 ▸ expect ต่อผู้ใช้ (ไม่ระบุ = กติกาเดิม) ◂
          const ok = !ov.html && !ov.body && status > 0 && status < 500 && (want === undefined || status === want);
          shots.push({ page: p.key, user: USER, viewport: `${v.w}x${v.h}`, path, file, status, finalUrl: page.url().replace(BASE, ""), consoleErrors: cErr, overflow: ov, ok, ...(status >= 400 && status < 500 ? { note: "4xx — ตรวจว่าตั้งใจกันบทบาทนี้" } : {}) });
          const mark = !ok ? "❌" : cErr.length || status >= 400 ? "⚠️ " : "✅";
          console.log(`  ${mark} ${p.key} [${USER} ${v.w}×${v.h}] HTTP ${status}${ov.html || ov.body ? ` · ล้นแนวนอน ${ov.scrollWidth}>${ov.clientWidth}` : ""}${cErr.length ? ` · console error ${cErr.length}` : ""} → ${file}`);
        } finally {
          await page.close().catch(() => {});
        }
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }
} catch (e) {
  fatal = e instanceof Fatal ? e.message : `ผิดพลาดกลางคัน — ${e instanceof Error ? (e.stack ?? e.message).slice(0, 400) : String(e)}`;
} finally {
  for (const d of [PROFILE, `/tmp/snap-private-tmp/snap.chromium/tmp/chr-hr-${process.pid}`]) {
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      /* ไม่มี/ไม่มีสิทธิ์ */
    }
  }
  const del = MINE.length ? (await prisma.session.deleteMany({ where: { id: { in: MINE }, userAgent: UA } })).count : 0;
  console.log(`🧹 ลบ session ของรอบนี้ ${del}/${MINE.length}`);
  await prisma.$disconnect?.();
}

const bad = shots.filter((s) => !s.ok);
writeFileSync(`${OUT}/summary-${USER}.json`, JSON.stringify({ wo: WO, user: USER, base: BASE, at: new Date().toISOString(), fatal: fatal || null, shots }, null, 1) + "\n");
if (fatal) console.error(`❌ ${fatal}`);
console.log(`\nJSON_SUMMARY ${JSON.stringify({ suite: "visual-hr", wo: WO, user: USER, total: shots.length, passed: shots.length - bad.length, findings: bad.map((s) => `${s.page}@${s.viewport}: HTTP ${s.status}${s.overflow.html || s.overflow.body ? " overflow" : ""}`), fatal: fatal || null })}`);
process.exit(fatal || bad.length ? 1 : 0);
