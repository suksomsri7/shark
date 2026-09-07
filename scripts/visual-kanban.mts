// ถ่ายภาพหน้าจอจริงของ "บอร์ดงาน" (RUN kanban→Trello) — เดสก์ท็อป 1440×900 + มือถือ 390×844 (fullPage)
//
// ใช้:
//   bash scripts/acc-v2-serve.sh                 # production build บน .env.qc :3215 (ต้องมีก่อน)
//   pnpm exec tsx scripts/visual-kanban.mts 1.5  # ถ่ายชุดของ WO K1.5 (ดู SPECS ด้านล่าง)
//   pnpm exec tsx scripts/visual-kanban.mts 1.5 --user thana   # ถ่ายในสายตา STAFF (default owner)
//   pnpm exec tsx scripts/visual-kanban.mts path /app/sys/<sys>/kanban/boards  # หน้าเดียวตามใจ
//   bash scripts/acc-v2-serve.sh stop
//
// 🔴 ชื่อไฟล์จงใจไม่ขึ้นต้น qc- (ต้อง build+server+chromium — ไม่เข้า qc:all)
// 🔴 session ที่ mint ต้องถูกลบเสมอ — ปักธง userAgent = "qc-visual-kanban" (ลบใน finally)
// 🔴 ชื่อคุกกี้ผูกกับ APP_ENV: http = `shark_session` · https = `__Host-shark_session`
// ขั้น "ลาก/คลิก/พิมพ์" ทำผ่าน puppeteer บน production build (dev ไม่ hydrate ใน headless — บทเรียน 13 ส.ค.)

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
const kq = (await import("./kanban-qc-env.mts" as string)) as { KQC: Any };
const { KQC } = kq;
const { prisma } = await import("@/lib/core/db");
const { sha256 } = await import("@/lib/core/hash");

const argv = process.argv.slice(2);
const WO = argv[0] ?? "1.5";
const userKey = argv.includes("--user") ? argv[argv.indexOf("--user") + 1]! : "owner";
const BASE = process.env.QC_BASE ?? "http://127.0.0.1:3215";
const OUT = `${KQC.shotsDir}/${WO}`;
mkdirSync(OUT, { recursive: true });
if (!existsSync(KQC.expectedPath)) { console.error(`❌ ไม่พบเฉลย ${KQC.expectedPath} — รัน seed ก่อน`); process.exit(2); }
const E = JSON.parse(readFileSync(KQC.expectedPath, "utf8"));
const SYS: string = E.systemId;
const B = (k: "patong" | "maint" | "kata") => E.boards[k].id as string;

type Step =
  | { click: string }
  | { fill: string; value: string }
  | { press: string }
  | { waitFor: string; timeoutMs?: number }
  | { drag: { from: string; to: string; steps?: number } }
  | { wait: number }
  | { swipe: { on: string; dx: number } }
  | { upload: { on: string; filePath: string } }
  // K1.13: กดค้างแล้ว "ไม่ปล่อยนิ้ว" ก่อนถ่ายภาพ (ต่างจาก `drag` ที่ปล่อยตอนจบ) — ใช้โชว์ท่า "ยก" การ์ด
  // บนมือถือ (`MobileBoard.tsx` state `lifted` หลังกดค้างครบ 300ms) touchEnd จะถูกยิงตอนปิดหน้าเอง
  | { longPress: { on: string; ms?: number } };
type Spec = { name: string; path: string; note?: string; steps?: Step[]; onlyDevice?: "desktop" | "mobile"; expect?: string[] };

// K1.9 — PNG เล็ก ๆ (1×1 พิกเซล) เขียนลงดิสก์ให้ puppeteer `uploadFile()` เลือกได้จริง (input[type=file]
// ต้อง "เลือกไฟล์จริง" — DataTransfer/File ที่สร้างจาก JS ล้วนใช้กับ input ของเบราว์เซอร์จริงไม่ได้)
// 🔴 ต้องอยู่ใต้ /root/ ไม่ใช่ /tmp/ — chromium ตัวนี้คือ snap (strict confinement) มี /tmp ส่วนตัวของมันเอง
//    uploadFile("/tmp/...") จะเห็นไฟล์ "มีอยู่" ฝั่ง input.files แต่อ่านเนื้อไฟล์จริงไม่ได้ (เงียบ ๆ) —
//    ดู `reference_snap_chromium_headless.md` / บทเรียนเดียวกับ `visual-acc-v2.mts` WO 1.8
const KB_PNG_PATH = `${OUT}/kb-cover-fixture.png`;
if (WO === "1.9") {
  const KB_PNG_BASE64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
  writeFileSync(KB_PNG_PATH, Buffer.from(KB_PNG_BASE64, "base64"));
}

const SPECS: Record<string, Spec[]> = {
  // K1.5 — หน้าบอร์ดใหม่ + ลากวาง (เทียบภาพ 02)
  "1.5": [
    { name: "boards-home", path: `/app/sys/${SYS}/kanban/boards`, note: "หน้ารวมบอร์ดปัจจุบัน (ยังไม่ใช่แบบใหม่จนกว่า K1.12)" },
    // 🔴 K1.14 แก้หนี้ harness: ตั้งแต่ K1.13 มือถือเรนเดอร์ `MobileBoard.tsx` (testid `mobile-column`)
    //    ไม่ใช่คอลัมน์เดสก์ท็อป (`column`) ⇒ expect เดิมทำให้ชุดนี้แดงบนมือถือทั้งที่จอถูกต้อง
    //    (แดงปลอมแบบนี้อันตรายกว่าไม่ตรวจ — คนอ่านจะเริ่มมองข้ามสีแดงของชุดนี้)
    { name: "board-patong", path: `/app/sys/${SYS}/kanban/b/${B("patong")}`, onlyDevice: "desktop", note: "เทียบ mockup 02: หัวบอร์ด · รางไอคอน · คอลัมน์ 240px · การ์ดมีตรา", expect: ["[data-testid=board-header]", "[data-testid=column]", "[data-testid=card]"] },
    { name: "board-patong", path: `/app/sys/${SYS}/kanban/b/${B("patong")}`, onlyDevice: "mobile", note: "มือถือ = MobileBoard (เลื่อนทีละคอลัมน์ · K1.13)", expect: ["[data-testid=board-header]", "[data-testid=mobile-column]", "[data-testid=card]"] },
    { name: "board-patong-dragged", path: `/app/sys/${SYS}/kanban/b/${B("patong")}`, onlyDevice: "desktop", note: "ลากการ์ดใบแรกของคอลัมน์ 1 ไปวางระหว่างใบ 1-2 ของคอลัมน์ 3 แล้วถ่ายทันที (optimistic) → โหลดใหม่ต้องคง", steps: [{ waitFor: "[data-testid=card]" }, { drag: { from: "[data-testid=column]:nth-of-type(1) [data-testid=card]:nth-of-type(1)", to: "[data-testid=column]:nth-of-type(3) [data-testid=card]:nth-of-type(2)" } }, { wait: 800 }] },
    { name: "board-patong-after-reload", path: `/app/sys/${SYS}/kanban/b/${B("patong")}`, onlyDevice: "desktop", note: "โหลดใหม่หลังลาก — การ์ดต้องอยู่ที่วางไว้" },
    { name: "board-maint", path: `/app/sys/${SYS}/kanban/b/${B("maint")}`, note: "บอร์ด TENANT 4 คอลัมน์" },
    { name: "my-tasks", path: `/app/sys/${SYS}/kanban/my-tasks`, note: "งานของฉัน (แบบเดิมจนกว่า K1.13)" },
  ],
  // K1.6 — หลังการ์ด (เทียบภาพ 03)
  "1.6": [
    { name: "card-back", path: `/app/sys/${SYS}/kanban/b/${B("patong")}?card=${E.boards.patong.cardIds[6]}`, note: "เปิดหลังการ์ดตรงจาก URL", expect: ["[data-testid=card-back]"] },
    { name: "card-back-edit-title", path: `/app/sys/${SYS}/kanban/b/${B("patong")}?card=${E.boards.patong.cardIds[6]}`, onlyDevice: "desktop", steps: [{ waitFor: "[data-testid=card-back]" }, { click: "[data-testid=card-title]" }, { fill: "[data-testid=card-title-input]", value: "ทำใบเสนอราคาทริปเรือ Sea Fox — แก้ชื่อผ่าน QC" }, { press: "Enter" }, { wait: 800 }] },
  ],
  // K1.8 — ความเห็น + @กล่าวถึง (บล็อกล่างของภาพ 03)
  "1.8": [
    { name: "comment-mention-menu", path: `/app/sys/${SYS}/kanban/b/${B("patong")}?card=${E.boards.patong.cardIds[6]}`, onlyDevice: "desktop", note: "พิมพ์ @ แล้วเมนูรายชื่อต้องเด้ง (autocomplete)", expect: ["[data-testid=mention-menu]"], steps: [{ waitFor: "[data-testid=card-back]" }, { fill: "[data-testid=comment-input]", value: "เช็คกับกัปตันแล้ว เรือ Sea Fox ว่าง 24–26 ต.ค. @ธ" }, { wait: 600 }] },
    { name: "comment-posted", path: `/app/sys/${SYS}/kanban/b/${B("patong")}?card=${E.boards.patong.cardIds[6]}`, note: "เขียนความเห็นพร้อม @กล่าวถึง แล้วกดส่ง — ต้องเห็นความเห็นในสาย + ชิป @", expect: ["[data-testid=comments]"], steps: [{ waitFor: "[data-testid=card-back]" }, { fill: "[data-testid=comment-input]", value: "เช็คกับกัปตันแล้ว เรือ Sea Fox ว่าง 24–26 ต.ค. @ธ" }, { wait: 600 }, { press: "Enter" }, { wait: 200 }, { click: "[data-testid=comment-send]" }, { wait: 1200 }] },
  ],
  // K1.9 — ไฟล์แนบ + ปก (บล็อก "ไฟล์แนบ" ของภาพ 03 + ปกบนตัวการ์ดของภาพ 02)
  "1.9": [
    {
      name: "card-back-attachment-uploaded",
      path: `/app/sys/${SYS}/kanban/b/${B("patong")}?card=${E.boards.patong.cardIds[6]}`,
      onlyDevice: "desktop",
      note: "อัปโหลด PNG ผ่านช่องไฟล์แนบ — ต้องขึ้นในรายการทันที (thumbnail + ชื่อ + ขนาด)",
      expect: ["[data-testid=attachment-list]", "[data-testid=attachment-item]"],
      steps: [
        { waitFor: "[data-testid=card-back]" },
        { waitFor: "[data-testid=attachment-upload]" },
        { upload: { on: "[data-testid=attachment-upload]", filePath: KB_PNG_PATH } },
        { wait: 1500 },
        { waitFor: "[data-testid=attachment-item]" },
      ],
    },
    {
      // 🔴 คลิกครั้งเดียว (desktop เท่านั้น) — ถ้าให้สเปคเดียววนถ่ายทั้ง 2 device การกดครั้งที่ 2 (มือถือ)
      //    จะ "ปลดปก" ที่เพิ่งตั้งไว้กลับไปเป็น null (toggle) ⇒ ภาพบอร์ดถัดไปจะไม่มีปกให้เห็นเลย
      name: "card-back-cover-set",
      path: `/app/sys/${SYS}/kanban/b/${B("patong")}?card=${E.boards.patong.cardIds[6]}`,
      onlyDevice: "desktop",
      note: "ไฟล์จากสเปคก่อนหน้ายังอยู่ (persist จริงในฐานข้อมูล) — กด 'ตั้งเป็นปก' แถวต้องเปลี่ยนเป็น 'เอาออกจากปก'",
      expect: ["[data-testid=attachment-item]"],
      steps: [
        { waitFor: "[data-testid=card-back]" },
        { waitFor: "[data-testid=attachment-cover-toggle]" },
        { click: "[data-testid=attachment-cover-toggle]" },
        { wait: 1000 },
      ],
    },
    {
      // มือถือ: แค่เปิดดู (ปกตั้งไว้แล้วจากสเปคก่อนหน้า) — ไม่กดปุ่มซ้ำ กัน toggle ปลดปกโดยไม่ตั้งใจ
      name: "card-back-with-cover",
      path: `/app/sys/${SYS}/kanban/b/${B("patong")}?card=${E.boards.patong.cardIds[6]}`,
      onlyDevice: "mobile",
      note: "หลังตั้งปกแล้ว (จากขั้น desktop ก่อนหน้า) — แถวไฟล์แนบต้องขึ้น 'เอาออกจากปก'",
      expect: ["[data-testid=attachment-item]"],
      steps: [{ waitFor: "[data-testid=card-back]" }, { waitFor: "[data-testid=attachment-cover-toggle]" }],
    },
    {
      name: "board-patong-with-cover",
      path: `/app/sys/${SYS}/kanban/b/${B("patong")}`,
      note: "การ์ด #7 (ป่าตอง) ต้องมีรูปปกด้านบน + ตราคลิปไฟล์แนบ",
      expect: ["[data-testid=card]"],
      steps: [{ waitFor: "[data-testid=card]" }, { wait: 500 }],
    },
  ],
  // K1.10 — ความเห็นและกิจกรรม (บล็อกล่างของภาพ 03) + แผงประวัติกิจกรรมของบอร์ด
  // 🔴 ลำดับสเปคมีความหมาย: ใบแรกโพสต์ความเห็นจริงลงฐานข้อมูล ใบถัด ๆ ไปจึงเห็นทั้งความเห็นและกิจกรรม
  //    (การย้าย/มอบหมายถูกทำไว้ก่อนเปิดเบราว์เซอร์ด้านล่าง แล้วคืนสภาพทั้งหมดหลังถ่ายเสร็จ)
  "1.10": [
    {
      name: "timeline-all",
      path: `/app/sys/${SYS}/kanban/b/${B("patong")}?card=${E.boards.patong.cardIds[6]}`,
      note: "แท็บ 'ทั้งหมด' — ความเห็นที่เพิ่งเขียน + กิจกรรม (ย้ายคอลัมน์ · มอบหมาย) เรียงล่าสุดบน",
      expect: ["[data-testid=timeline]", "[data-testid=timeline-filter]", "[data-testid=activity]"],
      steps: [
        { waitFor: "[data-testid=card-back]" },
        { waitFor: "[data-testid=timeline]" },
        { fill: "[data-testid=comment-input]", value: "ยืนยันกับลูกค้าแล้ว เริ่มงานพรุ่งนี้เช้า" },
        { press: "Enter" },
        { wait: 1500 },
      ],
    },
    {
      name: "timeline-comments",
      path: `/app/sys/${SYS}/kanban/b/${B("patong")}?card=${E.boards.patong.cardIds[6]}`,
      onlyDevice: "desktop",
      note: "แท็บ 'ความเห็น' — เหลือเฉพาะความเห็น (ไม่มีแถวกิจกรรม)",
      expect: ["[data-testid=comment]"],
      steps: [
        { waitFor: "[data-testid=timeline-filter]" },
        { click: "[data-testid=timeline-filter] button:nth-child(2)" },
        { wait: 1200 },
      ],
    },
    {
      name: "timeline-activity",
      path: `/app/sys/${SYS}/kanban/b/${B("patong")}?card=${E.boards.patong.cardIds[6]}`,
      onlyDevice: "desktop",
      note: "แท็บ 'กิจกรรม' — เหลือเฉพาะประโยคไทย (ย้ายจาก… ไป… · มอบหมายให้… · เขียนความเห็น)",
      expect: ["[data-testid=activity]"],
      steps: [
        { waitFor: "[data-testid=timeline-filter]" },
        { click: "[data-testid=timeline-filter] button:nth-child(3)" },
        { wait: 1200 },
      ],
    },
    {
      name: "board-activity-panel",
      path: `/app/sys/${SYS}/kanban/b/${B("patong")}`,
      note: "เมนู ⋯ › ประวัติกิจกรรมของบอร์ด — แผงขวา (ทุกการ์ด + ระดับบอร์ด)",
      expect: ["[data-testid=board-activity]", "[data-testid=activity]"],
      steps: [
        { waitFor: "[data-testid=board-header]" },
        { click: '[aria-label="เมนูบอร์ด"]' },
        { wait: 300 },
        { click: "[data-testid=board-activity-open]" },
        { wait: 1500 },
      ],
    },
  ],
  "1.12": [
    { name: "boards-home-new", path: `/app/sys/${SYS}/kanban/boards`, note: "เทียบ mockup 01: ดาว · จัดกลุ่มสาขา · แถวเทมเพลต", expect: ["[data-testid=boards-starred]", "[data-testid=templates-row]"] },
    {
      name: "template-picker-open",
      path: `/app/sys/${SYS}/kanban/boards`,
      onlyDevice: "desktop",
      note: "คลิกการ์ดเทมเพลตใบแรก — ต้องเปิดพรีวิวคอลัมน์ + ปุ่ม 'ใช้เทมเพลตนี้'",
      expect: ["[data-testid=template-preview]", "[data-testid=template-use]"],
      steps: [
        { waitFor: "[data-testid=templates-row]" },
        { click: "[data-testid=template-card]:nth-of-type(1)" },
        { wait: 400 },
      ],
    },
    {
      name: "create-board-modal-filled",
      path: `/app/sys/${SYS}/kanban/boards`,
      note: "กด 'สร้างบอร์ด' แล้วกรอกชื่อ — โมดัลต้องขึ้นครบ (ชื่อ/หน่วยธุรกิจ/การมองเห็น/เทมเพลต) — ไม่กดยืนยัน (ไม่สร้างบอร์ดจริง)",
      expect: ["[data-testid=create-board-modal]"],
      steps: [
        { click: "[data-testid=create-board]" },
        { waitFor: "[data-testid=create-board-modal]" },
        { fill: "[data-testid=create-board-name]", value: "งานเปิดสาขาภูเก็ต (ทดสอบ QC ภาพ — ไม่บันทึก)" },
        { wait: 300 },
      ],
    },
  ],
  "1.13": [
    { name: "mobile-board", path: `/app/sys/${SYS}/kanban/b/${B("patong")}`, onlyDevice: "mobile", note: "เทียบภาพ 07(ก)", expect: ["[data-testid=mobile-board]", "[data-testid=column-dots]"] },
    {
      name: "mobile-board-lifted",
      path: `/app/sys/${SYS}/kanban/b/${B("patong")}`,
      onlyDevice: "mobile",
      note: "กดค้างการ์ดใบแรก 450ms (ไม่ปล่อยนิ้ว) — ต้องเห็นการ์ดยกขึ้น (เอียง/เงา) ก่อนถ่าย",
      steps: [{ waitFor: "[data-testid=mobile-board]" }, { waitFor: "[data-testid=card]" }, { longPress: { on: "[data-testid=mobile-board] [data-testid=card]:nth-of-type(1)", ms: 450 } }],
    },
    {
      name: "mobile-swipe-undo-toast",
      path: `/app/sys/${SYS}/kanban/b/${B("patong")}`,
      onlyDevice: "mobile",
      note: "ปัดขวาการ์ดใบแรก (=เสร็จ) — toast 'เลิกทำ' ต้องขึ้น (คืนสภาพการ์ดที่ถูกปัดหลังถ่ายเสร็จทั้งชุด)",
      expect: ["[data-testid=undo-toast]"],
      steps: [
        { waitFor: "[data-testid=mobile-board]" },
        { waitFor: "[data-testid=card]" },
        { swipe: { on: "[data-testid=mobile-board] [data-testid=card]:nth-of-type(1)", dx: 160 } },
        // completeCardAction เป็นทริปไป DB จริง (tx + undo token) — รอ toast ขึ้นจริงแทนที่จะเดา ms ตายตัว
        { waitFor: "[data-testid=undo-toast]", timeoutMs: 4000 },
      ],
    },
    { name: "mobile-card-back", path: `/app/sys/${SYS}/kanban/b/${B("patong")}?card=${E.boards.patong.cardIds[6]}`, onlyDevice: "mobile", note: "เทียบภาพ 07(ข)" },
    { name: "my-tasks", path: `/app/sys/${SYS}/kanban/my-tasks`, note: "เทียบภาพ 06 ฝั่งขวา — desktop + mobile", expect: ["[data-testid=my-tasks]"] },
    { name: "mobile-my-tasks", path: `/app/sys/${SYS}/kanban/my-tasks`, onlyDevice: "mobile", note: "เทียบภาพ 07(ค)/06" },
  ],
  // K1.14 — ปุ่มลัด · คลังเก็บ · empty state · หน้ารวมบอร์ดหลังเคลียร์หนี้ UI · ชิปวันที่ไทย
  "1.14": [
    {
      name: "shortcuts-help",
      path: `/app/sys/${SYS}/kanban/b/${B("patong")}`,
      onlyDevice: "desktop",
      note: "กด ? บนบอร์ด → หน้ารายการปุ่มลัดต้องเด้ง (14 แถว ตามแบบ §5.6)",
      expect: ["[data-testid=shortcuts-help]"],
      steps: [{ waitFor: "[data-testid=board-header]" }, { waitFor: "[data-testid=card]" }, { press: "?" }, { waitFor: "[data-testid=shortcuts-help]", timeoutMs: 4000 }],
    },
    {
      name: "archive-cards",
      path: `/app/sys/${SYS}/kanban/b/${B("patong")}/archive`,
      note: "หน้าคลังเก็บ แท็บ 'การ์ด' — มีการ์ดที่เตรียมไว้ + ปุ่มกู้คืน (desktop + mobile)",
      expect: ["[data-testid=archive-page]", "[data-testid=archive-card-row]", "[data-testid=archive-search]"],
      steps: [{ waitFor: "[data-testid=archive-page]" }, { waitFor: "[data-testid=archive-card-row]", timeoutMs: 6000 }],
    },
    {
      name: "archive-columns",
      path: `/app/sys/${SYS}/kanban/b/${B("patong")}/archive`,
      onlyDevice: "desktop",
      note: "แท็บ 'คอลัมน์' — คอลัมน์ที่ถูกเก็บ + จำนวนการ์ดที่ผูกอยู่",
      expect: ["[data-testid=archive-column-row]"],
      steps: [{ waitFor: "[data-testid=archive-page]" }, { click: "[data-testid=archive-tab-columns]" }, { waitFor: "[data-testid=archive-column-row]", timeoutMs: 6000 }],
    },
    {
      name: "archive-after-restore",
      path: `/app/sys/${SYS}/kanban/b/${B("patong")}/archive`,
      onlyDevice: "desktop",
      note: "กด 'กู้คืน' การ์ดใบแรก แล้วกู้คืนคอลัมน์ — ทั้งคู่ต้องหายจากคลังทันที (คืนสภาพใน finally)",
      steps: [
        { waitFor: "[data-testid=archive-restore-card]" },
        { click: "[data-testid=archive-restore-card]" },
        { wait: 1200 },
        { click: "[data-testid=archive-tab-columns]" },
        { waitFor: "[data-testid=archive-restore-column]", timeoutMs: 6000 },
        { click: "[data-testid=archive-restore-column]" },
        { wait: 1200 },
      ],
    },
    {
      name: "board-filter-empty",
      path: `/app/sys/${SYS}/kanban/b/${B("patong")}?q=ไม่มีทางเจอคำนี้ในบอร์ด`,
      note: "กรองแล้วไม่เจอสักใบ — empty state §5.7 'ไม่มีการ์ดตรงกับตัวกรอง' + ปุ่มล้างตัวกรอง",
      expect: ["[data-testid=filter-bar]"],
      steps: [{ waitFor: "[data-testid=board-header]" }, { wait: 500 }],
    },
    {
      name: "boards-home",
      path: `/app/sys/${SYS}/kanban/boards`,
      note: "หน้ารวมบอร์ดหลังเคลียร์หนี้ UI (แถบสีซ้าย · avatar · การ์ดเส้นประสร้างบอร์ด · ตัวกรองหน่วยธุรกิจ) — เทียบ mockup 01",
      expect: ["[data-testid=boards-starred]", "[data-testid=create-board-tile]", "[data-testid=boards-unit-filter]"],
      steps: [{ waitFor: "[data-testid=boards-starred]" }],
    },
    {
      name: "card-back-due-picker",
      path: `/app/sys/${SYS}/kanban/b/${B("patong")}?card=${E.boards.patong.cardIds[6]}`,
      note: "ชิปกำหนดส่งแบบไทย (พ.ศ.) + popover ปฏิทินไทย — แทนที่ native datetime-local เดิม (หนี้ K1.6)",
      expect: ["[data-testid=card-back]", "[data-testid=due-chip]", "[data-testid=due-picker]"],
      steps: [{ waitFor: "[data-testid=card-back]" }, { waitFor: "[data-testid=due-chip]", timeoutMs: 8000 }, { click: "[data-testid=due-chip]" }, { waitFor: "[data-testid=due-picker]", timeoutMs: 4000 }],
    },
  ],
  // K1.11 — ตัวกรอง (URL) + ค้นหาข้ามบอร์ด (เทียบบล็อกแถบตัวกรองใต้หัวบอร์ดของ mockup 02)
  "1.11": [
    {
      name: "board-filtered",
      path: `/app/sys/${SYS}/kanban/b/${B("patong")}?label=ด่วน&status=open`,
      note: "ตัวกรอง label=ด่วน&status=open จาก URL — แถบ 'กรองอยู่:' + ชิป + 'แสดง N จาก M การ์ด' ต้องขึ้นใต้หัวบอร์ด",
      expect: ["[data-testid=filter-bar]", "[data-testid=filter-count]"],
      steps: [{ waitFor: "[data-testid=board-header]" }, { waitFor: "[data-testid=filter-bar]" }, { wait: 300 }],
    },
    {
      name: "search-palette-sea-fox",
      path: `/app/sys/${SYS}/kanban/b/${B("patong")}`,
      note: "เปิดค้นหา (ปุ่มค้นหาที่หัวบอร์ด) พิมพ์ 'Sea Fox' — ผลลัพธ์ข้ามบอร์ดจัดกลุ่มตามชื่อบอร์ด",
      expect: ["[data-testid=search-palette]", "[data-testid=search-result]"],
      steps: [
        { waitFor: "[data-testid=board-header]" },
        { click: "[data-testid=search-open]" },
        { waitFor: "[data-testid=search-input]" },
        { fill: "[data-testid=search-input]", value: "Sea Fox" },
        { wait: 900 },
        { waitFor: "[data-testid=search-result]" },
      ],
    },
  ],
  // K2.1 — มุมมองตาราง (เทียบภาพ 04-table.png) — แก้ชื่อการ์ดแรกของบอร์ดป่าตองในช่องแล้วคืนค่าใน finally
  "2.1": [
    {
      name: "table-view",
      path: `/app/sys/${SYS}/kanban/b/${B("patong")}?view=table`,
      onlyDevice: "desktop",
      note: "มุมมองตาราง 8 คอลัมน์ (เทียบ 04-table.png)",
      expect: ["[data-testid=table-view]", "[data-testid=table-row]"],
      steps: [{ waitFor: "[data-testid=table-row]" }],
    },
    {
      name: "table-bulk-selected",
      path: `/app/sys/${SYS}/kanban/b/${B("patong")}?view=table`,
      onlyDevice: "desktop",
      note: "ติ๊ก 2 แถวแรก — แถบเลือกหลายรายการต้องเด้ง",
      expect: ["[data-testid=bulk-bar]"],
      steps: [
        { waitFor: "[data-testid=table-row]" },
        { click: "[data-testid=table-row]:nth-of-type(1) [data-testid=row-select]" },
        { click: "[data-testid=table-row]:nth-of-type(2) [data-testid=row-select]" },
        { wait: 300 },
      ],
    },
    {
      name: "table-grouped-column",
      path: `/app/sys/${SYS}/kanban/b/${B("patong")}?view=table&group=column`,
      onlyDevice: "desktop",
      note: "จัดกลุ่มตามคอลัมน์ — หัวกลุ่มต่อคอลัมน์ + จำนวน",
      expect: ["[data-testid=table-group]"],
      steps: [{ waitFor: "[data-testid=table-group]" }],
    },
    {
      name: "table-edit-title",
      path: `/app/sys/${SYS}/kanban/b/${B("patong")}?view=table`,
      onlyDevice: "desktop",
      note: "แก้ชื่อการ์ดแรกในช่อง (คลิก → พิมพ์ → Enter) — คืนชื่อเดิมใน finally",
      steps: [
        { waitFor: "[data-testid=table-row]" },
        { click: "[data-testid=table-row]:nth-of-type(1) [data-testid=table-title-cell]" },
        { fill: "[data-testid=table-title-input]", value: "แก้ชื่อผ่านตาราง (ทดสอบ QC ภาพ)" },
        { press: "Enter" },
        { wait: 700 },
      ],
    },
    {
      name: "table-view",
      path: `/app/sys/${SYS}/kanban/b/${B("patong")}?view=table`,
      onlyDevice: "mobile",
      note: "มือถือ — รายการ 2 บรรทัด ไม่มีแก้ในช่อง",
      expect: ["[data-testid=table-view]"],
    },
  ],
  // K2.2 — มุมมองปฏิทิน (เทียบภาพ 05-calendar.png) — ลากการ์ดจากถาดลงวันจริง แล้วคืน dueAt เดิมใน finally
  "2.2": [
    {
      name: "calendar-month",
      path: `/app/sys/${SYS}/kanban/b/${B("patong")}?view=calendar`,
      onlyDevice: "desktop",
      note: "โหมดเดือน (เทียบ 05-calendar.png): ถาดยังไม่กำหนดวัน · ตารางเดือน 7 คอลัมน์ · วันนี้ไฮไลต์",
      expect: ["[data-testid=calendar-view]", "[data-testid=calendar-unscheduled]", "[data-testid=calendar-day]"],
      steps: [{ waitFor: "[data-testid=calendar-day]" }],
    },
    {
      name: "calendar-week",
      path: `/app/sys/${SYS}/kanban/b/${B("patong")}?view=calendar&mode=week`,
      onlyDevice: "desktop",
      note: "โหมดสัปดาห์ — สลับปุ่ม 'สัปดาห์' แล้วเห็น 7 วันแถวเดียว",
      expect: ["[data-testid=calendar-day]"],
      steps: [{ waitFor: "[data-testid=calendar-day]" }],
    },
    {
      name: "calendar-drag-from-tray",
      path: `/app/sys/${SYS}/kanban/b/${B("patong")}?view=calendar`,
      onlyDevice: "desktop",
      note: "ลากการ์ดใบแรกจากถาด 'ยังไม่กำหนดวัน' ไปวางบนช่องวันที่ 3 ของกริด — ต้องเห็นการ์ดย้ายไปอยู่ในวันนั้น (optimistic)",
      steps: [
        { waitFor: "[data-testid=calendar-unscheduled-card]" },
        { drag: { from: "[data-testid=calendar-unscheduled-card]:nth-of-type(1)", to: "[data-testid=calendar-day]:nth-of-type(3)" } },
        { wait: 1000 },
      ],
    },
    {
      name: "calendar-month",
      path: `/app/sys/${SYS}/kanban/b/${B("patong")}?view=calendar`,
      onlyDevice: "mobile",
      note: "มือถือ — รายการวันต่อวัน ไม่มีลาก",
      expect: ["[data-testid=calendar-view]", "[data-testid=calendar-unscheduled]"],
    },
  ],
  // K2.4 — มุมมองสรุป (ไม่มี mockup — เกณฑ์ §3.7) — อ่านอย่างเดียวล้วน (ไม่มีการลาก/แก้ค่า) ⇒ ไม่ต้องมี
  // ขั้นเตรียม/คืนสภาพ seed เหมือน 2.1/2.2 (คลิกไทล์แค่ navigate ไป `?view=table&...` ไม่เขียน DB)
  "2.4": [
    {
      name: "summary-view",
      path: `/app/sys/${SYS}/kanban/b/${B("patong")}?view=summary`,
      onlyDevice: "desktop",
      note: "มุมมองสรุป (เกณฑ์ §3.7): ตัวเลขใหญ่ 5 ค่า + 4 ไทล์ (คอลัมน์/คน/กำหนดส่ง/ป้าย) + กราฟ throughput",
      expect: ["[data-testid=summary-view]", "[data-testid=summary-tile]", "[data-testid=summary-chart]"],
      steps: [{ waitFor: "[data-testid=summary-tile]" }],
    },
    {
      name: "summary-tile-clicked-table",
      path: `/app/sys/${SYS}/kanban/b/${B("patong")}?view=summary`,
      onlyDevice: "desktop",
      note: "กดไทล์ป้าย 'ด่วน' → ต้องไปมุมมองตารางที่กรองแล้ว จำนวนแถวต้องเท่ากับตัวเลขในไทล์ (ยืนยันด้วยตา)",
      expect: ["[data-testid=table-view]", "[data-testid=table-row]"],
      steps: [
        { waitFor: '[data-testid=summary-tile][data-tile-group="label"][data-tile-label="ด่วน"]' },
        { click: '[data-testid=summary-tile][data-tile-group="label"][data-tile-label="ด่วน"]' },
        { waitFor: "[data-testid=table-view]", timeoutMs: 6000 },
      ],
    },
    {
      name: "summary-view",
      path: `/app/sys/${SYS}/kanban/b/${B("patong")}?view=summary`,
      onlyDevice: "mobile",
      note: "มือถือ — ไทล์เรียง 1 คอลัมน์",
      expect: ["[data-testid=summary-view]"],
    },
  ],
};
const specs: Spec[] = WO === "path" ? [{ name: "custom", path: argv[1]! }] : (SPECS[WO] ?? []);
if (specs.length === 0) { console.error(`❌ ไม่มี spec ของ WO ${WO}`); process.exit(2); }

// ── mint session ของผู้ใช้ที่เลือก ──
const email = userKey === "owner" ? KQC.ownerEmail : userKey === "manager" ? KQC.managerEmail : userKey === "noperm" ? KQC.noPermEmail : (KQC.staff.find((s: Any) => s.key === userKey)?.email ?? KQC.ownerEmail);
const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
if (!user) { console.error(`❌ ไม่พบผู้ใช้ ${email}`); process.exit(2); }
const UA = "qc-visual-kanban";
const token = "kb" + Math.random().toString(36).slice(2) + Date.now().toString(36);
const ttl = new Date(Date.now() + 60 * 60 * 1000);
await prisma.session.create({ data: { userId: user.id, tokenHash: sha256(token), userAgent: UA, idleExpiresAt: ttl, expiresAt: ttl } });

// ── K1.10: เตรียมของจริงให้มีกิจกรรมให้ถ่าย (ย้ายคอลัมน์ + มอบหมาย) แล้วจำสภาพเดิมไว้คืนทีหลัง ──
// 🔴 ทุกอย่างผ่าน service จริง ไม่ใช่ยัดแถวเอง — ประวัติที่ถ่ายจึงเป็นของที่ระบบเขียนเองทั้งหมด
const KB110 = { at: new Date(), cardId: "", fromColumnId: "", assignees: [] as string[] };
if (WO === "1.10") {
  const moves = (await import("@/lib/modules/kanban/moves" as string)) as Any;
  const cardsSvc = (await import("@/lib/modules/kanban/cards" as string)) as Any;
  const ctx = { tenantId: E.tenantId, systemId: SYS, actorUserId: E.users.owner.userId as string };
  KB110.cardId = E.boards.patong.cardIds[6];
  const before = await prisma.kanbanCard.findUnique({ where: { id: KB110.cardId }, select: { columnId: true } });
  KB110.fromColumnId = before?.columnId ?? "";
  KB110.assignees = await cardsSvc.listCardAssignees(ctx, KB110.cardId);
  const cols = await prisma.kanbanColumn.findMany({
    where: { boardId: B("patong"), tenantId: E.tenantId, systemId: SYS, status: "ACTIVE" },
    orderBy: [{ position: "asc" }, { sortOrder: "asc" }],
    select: { id: true },
  });
  const target = cols.find((c) => c.id !== KB110.fromColumnId);
  if (target) await moves.moveCard(ctx, { cardId: KB110.cardId, toColumnId: target.id, force: true });
  await cardsSvc.setCardAssignees(ctx, KB110.cardId, [E.users.staff.pook.userId]);
  console.log(`🧪 เตรียม K1.10: ย้ายการ์ด + มอบหมาย (คืนสภาพหลังถ่ายเสร็จ)`);
}

// ── K1.12: ติดดาวบอร์ดป่าตองไว้ก่อนถ่าย (ชุดข้อมูล QC ปกติไม่มีบอร์ดติดดาวเลย ⇒ แถบ "บอร์ดติดดาว"
//    จะไม่ปรากฏใน DOM ให้ selector หาเจอ) — เอาดาวออกคืนหลังถ่ายเสร็จ (finally ด้านล่าง)
if (WO === "1.12") {
  const members = (await import("@/lib/modules/kanban/members" as string)) as Any;
  const ctx = { tenantId: E.tenantId, systemId: SYS, actorUserId: E.users.owner.userId as string };
  await members.starBoard(ctx, B("patong"));
  console.log(`🧪 เตรียม K1.12: ติดดาวบอร์ดป่าตอง (คืนสภาพหลังถ่ายเสร็จ)`);
}

// ── K1.13 + K1.5: สเปคที่ "ขยับการ์ดจริง" บนบอร์ดป่าตอง ⇒ จับภาพ "ก่อน" ทุกใบ แล้ว diff คืนตอนจบ
//    K1.13 `mobile-swipe-undo-toast` ปัดจริงผ่าน completeCardAction (ไม่รู้ล่วงหน้าว่าปัดใบไหน)
//    K1.5  `board-patong-dragged` ลากใบแรกของคอลัมน์ 1 ไปคอลัมน์ 3 จริง
// 🔴 K1.14 เพิ่ม WO 1.5 เข้ามาที่นี่ (เดิมไม่มีตัวคืนสภาพเลย): ถ่ายชุด 1.5 หนึ่งครั้ง = การ์ดหาย
//    จากคอลัมน์แรกถาวร 1 ใบ · สะสมจนวันที่ 6 ก.ย. คอลัมน์ "กล่องงานเข้า" เหลือ 0 จาก 5 ใบ
//    (ล้างหนี้ที่ค้างด้วย `scripts/pending/restore-kanban-seed-inbox.mts` แล้ว)
//    ⚠️ คืนสภาพอยู่ใน finally และอยู่ **หลัง** ถ่ายครบทุกสเปค ⇒ สเปค `board-patong-after-reload`
//       ที่ต้องเห็นผลการลาก "หลังโหลดใหม่" ยังทำงานถูกต้องเหมือนเดิม
//    ⚠️ คืน `position` ด้วย ไม่ใช่แค่ columnId — ลากแล้วลำดับในคอลัมน์เปลี่ยน ถ้าไม่คืนจะเพี้ยนสะสมเงียบ ๆ
type KB113Snap = { id: string; columnId: string; status: string; completedAt: string | null; position: string | null };
let KB113_BEFORE: KB113Snap[] = [];
let KB113_DONE_COL: string | null = null;
if (WO === "1.13" || WO === "1.5") {
  const rows = await prisma.kanbanCard.findMany({
    where: { boardId: B("patong"), tenantId: E.tenantId, systemId: SYS },
    select: { id: true, columnId: true, status: true, completedAt: true, position: true },
  });
  KB113_BEFORE = rows.map((r) => ({ id: r.id, columnId: r.columnId, status: r.status, completedAt: r.completedAt?.toISOString() ?? null, position: r.position }));
  // ชุดข้อมูล QC ปกติไม่มีคอลัมน์ไหนตั้งธง isDoneColumn เลย (ตั้งชั่วคราวเฉพาะใน qc-kanban-k1.13.mts
  // แล้วปลดคืนตอนจบ) ⇒ ปัดขวา (=เสร็จ) บนบอร์ดป่าตองจะได้ NO_DONE_COLUMN เสมอถ้าไม่ตั้งเองก่อนถ่ายภาพ
  const moves = (await import("@/lib/modules/kanban/moves" as string)) as Any;
  const ctx = { tenantId: E.tenantId, systemId: SYS, actorUserId: E.users.owner.userId as string };
  const doneCol = WO === "1.13" ? await prisma.kanbanColumn.findFirst({ where: { boardId: B("patong"), name: "เสร็จแล้ว" }, select: { id: true } }) : null;
  if (doneCol) {
    await moves.setColumnDone(ctx, doneCol.id, true);
    KB113_DONE_COL = doneCol.id;
  }
  console.log(`🧪 เตรียม K${WO}: จับภาพก่อนของบอร์ดป่าตอง ${KB113_BEFORE.length} การ์ด${KB113_DONE_COL ? " · ตั้งคอลัมน์ 'เสร็จแล้ว' เป็น isDoneColumn ชั่วคราว" : ""} (คืนสภาพหลังถ่ายเสร็จ)`);
}

// ── K1.14: เตรียมของให้ "คลังเก็บ" มีของให้ถ่ายจริง (การ์ด 1 ใบ + คอลัมน์ 1 คอลัมน์) + ติดดาวบอร์ด
//    เพื่อให้แถว "บอร์ดติดดาว" (ที่มีการ์ดเส้นประ 'สร้างบอร์ดใหม่' อยู่ในนั้น) ปรากฏใน DOM
// 🔴 ทุกอย่างผ่าน service จริง — ของที่ถ่ายจึงเป็นของที่ระบบเขียนเอง · คืนสภาพใน finally ด้านล่าง
const KB114 = { cardId: "", columnId: "", starred: false, memberRows: [] as { boardId: string; userId: string }[] };
if (WO === "1.14") {
  const svc = (await import("@/lib/modules/kanban/service" as string)) as Any;
  const cardsSvc = (await import("@/lib/modules/kanban/cards" as string)) as Any;
  const moves = (await import("@/lib/modules/kanban/moves" as string)) as Any;
  const members = (await import("@/lib/modules/kanban/members" as string)) as Any;
  const tid = E.tenantId as string;
  const ctx = { tenantId: tid, systemId: SYS, actorUserId: E.users.owner.userId as string };
  const col = await prisma.kanbanColumn.findFirst({
    where: { boardId: B("patong"), tenantId: tid, systemId: SYS, status: "ACTIVE" },
    orderBy: { position: "asc" },
    select: { id: true },
  });
  if (col) {
    const card = await svc.createCard({ tenantId: tid, systemId: SYS, columnId: col.id, title: "เคลมประกันอุปกรณ์ที่หายจากทริป (QC ภาพ)" });
    KB114.cardId = card.id;
    await cardsSvc.archiveCard(ctx, card.id);
  }
  const tmp = await svc.createColumn(tid, SYS, B("patong"), "รอตรวจสอบ (QC ภาพ)");
  KB114.columnId = tmp.id;
  await moves.archiveColumn(ctx, tmp.id);
  await members.starBoard(ctx, B("patong"));
  KB114.starred = true;

  // 🔴 ชุดข้อมูล QC ไม่มีแถว `KanbanBoardMember` เลยสักบอร์ด (เจ้าของ/ผู้จัดการเห็นบอร์ดจาก "บทบาทในร้าน"
  //    ไม่ใช่จากการเป็นสมาชิกบอร์ด) ⇒ avatar สมาชิกบนการ์ดบอร์ด (หนี้ UI K1.12 · mockup 01) จะไม่มีอะไร
  //    ให้เรนเดอร์เลย และ "ภาพว่าง" จะถูกอ่านผิดว่า "ยังไม่ได้ทำ" · ใส่สมาชิกจริงผ่าน service แล้วถอดคืนใน finally
  //    (หมายเหตุถึง Fable: ควรใส่สมาชิกลงใน `seed-kanban-qc.mts` ตอนเปิด P2 — เหมือนหนี้ isDoneColumn ของ K1.13)
  for (const [boardKey, uids] of [
    ["patong", [E.users.manager.userId, E.users.staff.thana.userId, E.users.staff.pook.userId, E.users.staff.kitti.userId]],
    ["maint", [E.users.staff.kitti.userId, E.users.staff.thana.userId]],
  ] as const) {
    for (const uid of uids) {
      await members.addMember(ctx, B(boardKey as "patong" | "maint"), uid, "EDITOR").catch(() => null);
      KB114.memberRows.push({ boardId: B(boardKey as "patong" | "maint"), userId: uid as string });
    }
  }
  console.log(`🧪 เตรียม K1.14: การ์ด 1 ใบ + คอลัมน์ 1 คอลัมน์เข้าคลัง · ติดดาวบอร์ดป่าตอง · ใส่สมาชิกบอร์ด ${KB114.memberRows.length} แถว (คืนสภาพหลังถ่ายเสร็จ)`);
}

// ── K2.1: จำชื่อการ์ดแรกของบอร์ดป่าตอง (คือใบที่สเปค `table-edit-title` จะแก้) ไว้คืนหลังถ่ายเสร็จ ──
const KB21 = { cardId: "", title: "" };
if (WO === "2.1") {
  const firstCol = await prisma.kanbanColumn.findFirst({
    where: { boardId: B("patong"), tenantId: E.tenantId, systemId: SYS, status: "ACTIVE" },
    orderBy: [{ position: { sort: "asc", nulls: "first" } }, { sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  const firstCard = firstCol
    ? await prisma.kanbanCard.findFirst({
        where: { columnId: firstCol.id, tenantId: E.tenantId, systemId: SYS, status: "ACTIVE" },
        orderBy: [{ position: { sort: "asc", nulls: "first" } }, { sortOrder: "asc" }, { createdAt: "asc" }],
        select: { id: true, title: true },
      })
    : null;
  if (firstCard) {
    KB21.cardId = firstCard.id;
    KB21.title = firstCard.title;
  }
  console.log(`🧪 เตรียม K2.1: จำชื่อการ์ดแรกของบอร์ดป่าตอง ${KB21.cardId || "(ไม่พบ)"} ไว้คืน`);
}

// ── K2.2: จำการ์ดแรกในถาด "ยังไม่กำหนดวัน" ของบอร์ดป่าตอง (คือใบที่สเปค `calendar-drag-from-tray`
//    จะลากจริงลง DB ผ่าน `setCardDueFromCalendarAction`) ไว้คืนหลังถ่ายเสร็จ ──
const KB22 = { cardId: "", dueAt: null as string | null };
if (WO === "2.2") {
  const firstUnscheduled = await prisma.kanbanCard.findFirst({
    where: { boardId: B("patong"), tenantId: E.tenantId, systemId: SYS, status: "ACTIVE", dueAt: null },
    orderBy: [{ position: { sort: "asc", nulls: "first" } }, { sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, dueAt: true },
  });
  if (firstUnscheduled) {
    KB22.cardId = firstUnscheduled.id;
    KB22.dueAt = firstUnscheduled.dueAt ? firstUnscheduled.dueAt.toISOString() : null;
  }
  console.log(`🧪 เตรียม K2.2: จำการ์ดแรกในถาด 'ยังไม่กำหนดวัน' ของบอร์ดป่าตอง ${KB22.cardId || "(ไม่พบ)"} ไว้คืน`);
}

async function restoreSeed(): Promise<void> {
  // K1.9 — คืนสภาพ seed: ลบไฟล์แนบ/FileAsset ที่สร้างระหว่างถ่ายภาพ + ล้าง coverFileId ของการ์ดที่ใช้ทดสอบ
  if (WO === "1.9") {
    const P = prisma as Any;
    const cardId = E.boards.patong.cardIds[6];
    const rows = await P.kanbanAttachment.findMany({ where: { cardId }, select: { id: true, fileId: true } });
    await P.kanbanAttachment.deleteMany({ where: { cardId } });
    if (rows.length) await prisma.fileAsset.deleteMany({ where: { id: { in: rows.map((r: Any) => r.fileId) } } });
    await prisma.kanbanCard.updateMany({ where: { id: cardId }, data: { coverFileId: null } });
    console.log(`🧹 คืนสภาพ K1.9: ลบไฟล์แนบ ${rows.length} รายการ + ล้าง coverFileId ของการ์ด ${cardId}`);
  }
  // K1.10 — คืนสภาพ seed: ย้ายการ์ดกลับคอลัมน์เดิม · คืนผู้รับผิดชอบเดิม · ลบความเห็นที่เขียนระหว่างถ่าย
  // · แล้วค่อยลบแถวกิจกรรมทุกใบที่เกิดขึ้นในรอบนี้ (ทั้งของงานจริงและของขั้นคืนสภาพเอง)
  if (WO === "1.10" && KB110.cardId) {
    const P = prisma as Any;
    const moves = (await import("@/lib/modules/kanban/moves" as string)) as Any;
    const cardsSvc = (await import("@/lib/modules/kanban/cards" as string)) as Any;
    const ctx = { tenantId: E.tenantId, systemId: SYS, actorUserId: E.users.owner.userId as string };
    if (KB110.fromColumnId) await moves.moveCard(ctx, { cardId: KB110.cardId, toColumnId: KB110.fromColumnId, force: true });
    await cardsSvc.setCardAssignees(ctx, KB110.cardId, KB110.assignees);
    const cm = await P.kanbanComment.deleteMany({ where: { cardId: KB110.cardId, createdAt: { gte: KB110.at } } });
    const ac = await P.kanbanActivity.deleteMany({ where: { boardId: B("patong"), createdAt: { gte: KB110.at } } });
    console.log(`🧹 คืนสภาพ K1.10: การ์ดกลับคอลัมน์เดิม · ผู้รับผิดชอบ ${KB110.assignees.length} คน · ลบความเห็น ${cm.count} · ลบกิจกรรม ${ac.count}`);
  }
  // K1.12 — คืนสภาพ seed: เอาดาวออก (ไม่มีการสร้างบอร์ด/เทมเพลตจริงระหว่างถ่าย — สเปค create-board-modal-filled
  // ตั้งใจไม่กดยืนยันฟอร์ม จึงไม่มีบอร์ดเศษให้ลบ)
  if (WO === "1.12") {
    const members = (await import("@/lib/modules/kanban/members" as string)) as Any;
    const ctx = { tenantId: E.tenantId, systemId: SYS, actorUserId: E.users.owner.userId as string };
    await members.unstarBoard(ctx, B("patong"));
    console.log("🧹 คืนสภาพ K1.12: เอาดาวบอร์ดป่าตองออกแล้ว");
  }
  // K1.13 — คืนสภาพ seed: สเปค "mobile-swipe-undo-toast" ปัดจริงผ่าน completeCardAction ระหว่างถ่าย
  // (undo token ที่ได้ไม่ได้ถูกกด "เลิกทำ" จริงในหน้าเว็บ — คืนสภาพตรงด้วย diff ก่อน/หลังแทน)
  if ((WO === "1.13" || WO === "1.5") && KB113_BEFORE.length > 0) {
    const P = prisma as Any;
    const after = await prisma.kanbanCard.findMany({
      where: { boardId: B("patong"), tenantId: E.tenantId, systemId: SYS },
      select: { id: true, columnId: true, status: true, completedAt: true, position: true },
    });
    const beforeById = new Map(KB113_BEFORE.map((r) => [r.id, r]));
    let restored = 0;
    for (const row of after) {
      const before = beforeById.get(row.id);
      if (!before) continue;
      const completedAtIso = row.completedAt?.toISOString() ?? null;
      if (row.columnId !== before.columnId || row.status !== before.status || completedAtIso !== before.completedAt || row.position !== before.position) {
        await P.kanbanCard.update({
          where: { id: row.id },
          data: {
            columnId: before.columnId,
            position: before.position,
            status: before.status,
            completedAt: before.completedAt ? new Date(before.completedAt) : null,
            archivedAt: before.status === "ARCHIVED" ? undefined : null,
            archivedById: before.status === "ARCHIVED" ? undefined : null,
          },
        });
        restored++;
      }
    }
    const activeCount = await prisma.kanbanCard.count({ where: { boardId: B("patong"), tenantId: E.tenantId, systemId: SYS, status: "ACTIVE" } });
    if (KB113_DONE_COL) {
      const moves = (await import("@/lib/modules/kanban/moves" as string)) as Any;
      const ctx = { tenantId: E.tenantId, systemId: SYS, actorUserId: E.users.owner.userId as string };
      await moves.setColumnDone(ctx, KB113_DONE_COL, false);
    }
    console.log(`🧹 คืนสภาพ K${WO}: คืนการ์ดที่เปลี่ยนระหว่างถ่าย ${restored} ใบ${KB113_DONE_COL ? " · ปลดธง isDoneColumn คืน" : ""} · การ์ด ACTIVE บนบอร์ดป่าตองตอนนี้ = ${activeCount}`);
  }

  // K1.14 — คืนสภาพ seed: ลบการ์ด/คอลัมน์ที่สร้างขึ้นเพื่อถ่ายคลังเก็บ (สเปค archive-after-restore
  // กู้คืนของทั้งคู่กลับมาบนบอร์ดจริง ⇒ ต้องลบทิ้ง ไม่ใช่แค่เก็บกลับเข้าคลัง) + เอาดาวออก + คืนตัวนับเลขการ์ด
  if (WO === "1.14") {
    const P = prisma as Any;
    if (KB114.cardId) await P.kanbanCard.deleteMany({ where: { id: KB114.cardId } });
    if (KB114.columnId) {
      await P.kanbanCard.deleteMany({ where: { columnId: KB114.columnId } });
      await P.kanbanColumn.deleteMany({ where: { id: KB114.columnId } });
    }
    if (KB114.starred) {
      const members = (await import("@/lib/modules/kanban/members" as string)) as Any;
      await members.unstarBoard({ tenantId: E.tenantId, systemId: SYS, actorUserId: E.users.owner.userId }, B("patong")).catch(() => null);
    }
    // ถอดสมาชิกที่ใส่เข้าไปเพื่อถ่าย avatar — ลบตรงจากตาราง (ไม่ผ่าน `removeMember` เพราะไม่ต้องการ
    // แถวประวัติกิจกรรม "ถอดสมาชิก" ค้างในชุดข้อมูล QC ให้ข้อสอบ K1.10 นับเกิน)
    if (KB114.memberRows.length > 0) {
      await P.kanbanBoardMember.deleteMany({
        where: { OR: KB114.memberRows.map((m) => ({ boardId: m.boardId, userId: m.userId })) },
      });
      await P.kanbanActivity.deleteMany({
        where: { boardId: { in: [...new Set(KB114.memberRows.map((m) => m.boardId))] }, type: "MEMBER_ADDED" },
      });
    }
    await prisma.$executeRawUnsafe(
      `UPDATE "KanbanBoard" b SET "cardNoSeq" = COALESCE((SELECT MAX("cardNo") FROM "KanbanCard" c WHERE c."boardId" = b.id), 0) WHERE b.id = '${B("patong")}'`,
    );
    console.log("🧹 คืนสภาพ K1.14: ลบการ์ด/คอลัมน์ที่ใช้ถ่ายคลังเก็บ · เอาดาวออก · คืนตัวนับเลขการ์ด");
  }

  // K2.1 — คืนสภาพ seed: สเปค `table-edit-title` แก้ชื่อการ์ดแรกผ่านช่องของตาราง (ทริปจริงลง DB) — คืนชื่อเดิม
  if (WO === "2.1" && KB21.cardId) {
    await prisma.kanbanCard.updateMany({ where: { id: KB21.cardId }, data: { title: KB21.title } });
    console.log(`🧹 คืนสภาพ K2.1: คืนชื่อการ์ด ${KB21.cardId} เป็น "${KB21.title}"`);
  }

  // K2.2 — คืนสภาพ seed: สเปค `calendar-drag-from-tray` ลากการ์ดจากถาดลงวันจริงผ่าน server action — คืน dueAt เดิม
  if (WO === "2.2" && KB22.cardId) {
    await prisma.kanbanCard.updateMany({ where: { id: KB22.cardId }, data: { dueAt: KB22.dueAt ? new Date(KB22.dueAt) : null } });
    const P = prisma as Any;
    const ac = await P.kanbanActivity.deleteMany({ where: { cardId: KB22.cardId, type: "CARD_DUE_SET", createdAt: { gte: new Date(Date.now() - 10 * 60_000) } } });
    console.log(`🧹 คืนสภาพ K2.2: คืน dueAt ของการ์ด ${KB22.cardId} เป็น ${KB22.dueAt ?? "null (ยังไม่กำหนดวัน)"} · ลบกิจกรรม CARD_DUE_SET ที่เพิ่งเกิด ${ac.count}`);
  }
}

let failures = 0;
const shots: string[] = [];
try {
  const pptr = await import("/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js" as string);
  const browser = await pptr.default.launch({
    executablePath: "/usr/bin/chromium-browser",
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", `--user-data-dir=/tmp/chr-kanban-${process.pid}`],
  });
  try {
    const https = BASE.startsWith("https:");
    const host = new URL(BASE).hostname;
    const cookies = https
      ? [{ name: "__Host-shark_session", value: token, url: BASE, path: "/", secure: true }, { name: "shark_tenant", value: E.tenantId, url: BASE, path: "/", secure: true }]
      : [{ name: "shark_session", value: token, domain: host, path: "/" }, { name: "shark_tenant", value: E.tenantId, domain: host, path: "/" }];
    for (const spec of specs) {
      // KQC_VIEWPORTS="ipad-portrait:820x1180,ipad-landscape:1180x820" ใช้แทนชุดปริยาย (เช่น ถ่ายจอ iPad ของ WebView แอป) · KQC_UA ต่อท้าย user agent
      const viewports: readonly (readonly [string, number, number])[] = process.env.KQC_VIEWPORTS
        ? process.env.KQC_VIEWPORTS.split(",").map((v) => { const [name, wh] = v.split(":"); const [w, h] = wh!.split("x").map(Number); return [name!, w!, h!] as const; })
        : ([["desktop", 1440, 900], ["mobile", 390, 844]] as const);
      for (const [device, w, h] of viewports) {
        if (spec.onlyDevice && spec.onlyDevice !== device) continue;
        const page = await browser.newPage();
        if (process.env.KQC_UA) await page.setUserAgent(`${await browser.userAgent()} ${process.env.KQC_UA}`);
        await page.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: device === "mobile", hasTouch: device === "mobile" });
        await page.setCookie(...cookies);
        const errors: string[] = [];
        page.on("pageerror", (e: Error) => errors.push(e.message.slice(0, 120)));
        page.on("console", (m: Any) => { if (m.type() === "error") errors.push(String(m.text()).slice(0, 120)); });
        const resp = await page.goto(`${BASE}${spec.path}`, { waitUntil: "domcontentloaded", timeout: 60_000 }).catch(() => null);
        await new Promise((r) => setTimeout(r, 1200)); // ให้ hydrate
        for (const step of spec.steps ?? []) {
          try {
            if ("waitFor" in step) await page.waitForSelector(step.waitFor, { timeout: step.timeoutMs ?? 10_000 });
            else if ("click" in step) await page.click(step.click);
            else if ("fill" in step) { await page.click(step.fill, { clickCount: 3 }); await page.keyboard.type(step.value, { delay: 15 }); }
            else if ("press" in step) await page.keyboard.press(step.press as Any);
            else if ("wait" in step) await new Promise((r) => setTimeout(r, step.wait));
            else if ("drag" in step) {
              const from = await page.$(step.drag.from); const to = await page.$(step.drag.to);
              if (!from || !to) throw new Error(`ไม่พบ element สำหรับลาก ${!from ? step.drag.from : step.drag.to}`);
              const a = (await from.boundingBox())!; const b = (await to.boundingBox())!;
              const sx = a.x + a.width / 2, sy = a.y + a.height / 2, tx = b.x + b.width / 2, ty = b.y + 8; // วางเหนือใบเป้าหมาย
              await page.mouse.move(sx, sy); await page.mouse.down();
              await new Promise((r) => setTimeout(r, 350)); // กดค้าง (มือถือ 300ms)
              const n = step.drag.steps ?? 12;
              for (let i = 1; i <= n; i++) { await page.mouse.move(sx + ((tx - sx) * i) / n, sy + ((ty - sy) * i) / n); await new Promise((r) => setTimeout(r, 30)); }
              await page.mouse.up();
            } else if ("upload" in step) {
              const input = await page.$(step.upload.on);
              if (!input) throw new Error(`ไม่พบ input สำหรับอัปโหลด ${step.upload.on}`);
              await input.uploadFile(step.upload.filePath);
            } else if ("swipe" in step) {
              const el = await page.$(step.swipe.on); const bb = (await el!.boundingBox())!;
              const y = bb.y + bb.height / 2; const x0 = bb.x + bb.width / 2;
              await page.touchscreen.touchStart(x0, y); for (let i = 1; i <= 8; i++) await page.touchscreen.touchMove(x0 + (step.swipe.dx * i) / 8, y); await page.touchscreen.touchEnd();
            } else if ("longPress" in step) {
              // 🔴 จงใจไม่ touchEnd — ต้องถ่ายภาพตอนนิ้วยังกดอยู่เพื่อให้เห็นสถานะ "ยก" (MobileBoard.tsx)
              const el = await page.$(step.longPress.on);
              if (!el) throw new Error(`ไม่พบ element สำหรับกดค้าง ${step.longPress.on}`);
              const bb = (await el.boundingBox())!;
              await page.touchscreen.touchStart(bb.x + bb.width / 2, bb.y + bb.height / 2);
              await new Promise((r) => setTimeout(r, step.longPress.ms ?? 400));
            }
          } catch (e) { failures++; console.log(`  ❌ step ${JSON.stringify(step).slice(0, 80)} — ${e instanceof Error ? e.message.slice(0, 120) : e}`); }
        }
        await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
        await new Promise((r) => setTimeout(r, 250));
        const file = `${OUT}/${spec.name}-${device}.png`;
        await page.screenshot({ path: file, fullPage: true });
        shots.push(file);
        const missing: string[] = [];
        for (const sel of spec.expect ?? []) { if (!(await page.$(sel))) missing.push(sel); }
        const status = resp?.status() ?? 0;
        const ok = status < 400 && missing.length === 0 && errors.length === 0;
        if (!ok) failures++;
        console.log(`  ${ok ? "✅" : "❌"} ${spec.name} [${device}] HTTP ${status} → ${file}${missing.length ? ` · ไม่พบ ${missing.join(",")}` : ""}${errors.length ? ` · console error ${errors.length}: ${errors[0]}` : ""}${spec.note ? `\n       ↳ ${spec.note}` : ""}`);
        await page.close();
      }
    }
  } finally { await browser.close(); }
} finally {
  // 🔴 K1.14 — ทุกบล็อก "คืนสภาพ seed" ย้ายมาอยู่ใน finally (ข้อเสนอของผู้ทำ K1.13)
  //    เดิมอยู่ท้าย try ⇒ puppeteer พังกลางทาง/สเปคใดสเปคหนึ่ง throw = ชุดข้อมูล QC ค้างสภาพที่ถูกแก้ไป
  //    แล้วข้อสอบชุดถัดไปตกโดยไม่มีใครรู้ว่าเพราะภาพชุดก่อน · การคืนสภาพเองก็ต้องไม่ล้มทั้งกระบวน
  //    ⇒ ห่อ try/catch ของตัวเองไว้อีกชั้น (คืนไม่ได้ต้องรายงาน ไม่ใช่กลืนเงียบ)
  try {
    await restoreSeed();
  } catch (e) {
    failures++;
    console.log(`  ❌ คืนสภาพ seed ไม่สำเร็จ — ${e instanceof Error ? e.message.slice(0, 200) : e}`);
  }
  const { count } = await prisma.session.deleteMany({ where: { userAgent: UA } });
  await prisma.$disconnect();
  console.log(`\n🧹 ลบ session QC ${count} · ภาพ ${shots.length} ใบใน ${OUT}`);
}
console.log(`JSON_SUMMARY ${JSON.stringify({ wo: WO, user: userKey, shots, failures })}`);
process.exit(failures > 0 ? 1 : 0);
