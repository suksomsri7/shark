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
  // K2.3 — ลากตามระยะพิกเซล (ไม่ใช่ไปหา element ปลายทาง) ใช้กับแฮนเดิลลากขอบ/ตัวแถบไทม์ไลน์ที่ตำแหน่ง
  // ปลายทางไม่ผูกกับ element ใดเป็นพิเศษ (แค่ขยับ dx พิกเซลตามความกว้างวัน)
  | { dragBy: { on: string; dx: number; dy?: number; steps?: number } }
  | { wait: number }
  | { swipe: { on: string; dx: number } }
  | { upload: { on: string; filePath: string } }
  // K1.13: กดค้างแล้ว "ไม่ปล่อยนิ้ว" ก่อนถ่ายภาพ (ต่างจาก `drag` ที่ปล่อยตอนจบ) — ใช้โชว์ท่า "ยก" การ์ด
  // บนมือถือ (`MobileBoard.tsx` state `lifted` หลังกดค้างครบ 300ms) touchEnd จะถูกยิงตอนปิดหน้าเอง
  | { longPress: { on: string; ms?: number } };
type Spec = {
  name: string;
  path: string;
  note?: string;
  steps?: Step[];
  onlyDevice?: "desktop" | "mobile";
  expect?: string[];
  /**
   * K3.2 — งานที่ต้องทำ "ฝั่งข้อมูล" ก่อนสเปคนี้ (เช่น ปิดสวิตช์รายร้านเพื่อพิสูจน์ว่าปุ่มหายจริง)
   * รันครั้งเดียวต่อสเปค (ไม่ใช่ต่ออุปกรณ์) — ผลของมันต้องถูกคืนสภาพใน `restoreSeed()` เสมอ
   */
  before?: () => Promise<void>;
};

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

/** K3.1 — การ์ดตัวอย่างของบล็อก "เชื่อมข้อมูล SHARK" (บอร์ดซ่อมบำรุง = TENANT ⇒ ธนาเห็นแบบ VIEWER) */
const KB31_CARD: string = (E.boards.maint.cardIds as string[])[0]!;

// ── K3.2: หน้าแชทต้องมี "ห้องจริง" ให้กดปุ่มสร้างงาน ⇒ สร้างระบบ CHAT + ผู้ติดต่อ + ห้อง + ข้อความ 3 ใบ
//    (+ ไฟล์แนบ 1) แบบชั่วคราว แล้วเปิดสวิตช์ "สร้างงานจากแชท" ชี้บอร์ดซ่อมบำรุง — ลบคืนทั้งชุดใน restoreSeed()
//    🔴 ค่า `AppSystem.settings` เดิมของระบบ KANBAN ถูกจำไว้แล้วเขียนกลับ (ห้ามทิ้งสวิตช์เปิดค้างไว้ให้ชุดถัดไป)
const KB32 = {
  chatSystemId: "",
  conversationId: "",
  partyIds: [] as string[],
  settingsBefore: null as unknown,
};
if (WO === "3.2") {
  const integ = (await import("@/lib/modules/kanban/integrations" as string)) as Any;
  const membership = await prisma.membership.findFirst({
    where: { tenantId: E.tenantId, userId: E.users.owner.userId },
    select: { role: true, unitAccess: true, permissions: true },
  });
  const ownerActor = {
    userId: E.users.owner.userId as string,
    role: membership!.role,
    unitAccess: (membership!.unitAccess as string[] | null) ?? [],
    permissions: (membership!.permissions as Record<string, unknown> | null) ?? {},
  };
  const ctx32 = { tenantId: E.tenantId, systemId: SYS, actorUserId: E.users.owner.userId as string };

  // เศษของรอบก่อน (Ctrl-C กลางทาง) — ลบก่อนเสมอ ไม่งั้นห้องซ้อนกันทุกครั้งที่รัน
  const stale = await prisma.appSystem.findMany({ where: { tenantId: E.tenantId, type: "CHAT" as Any, name: "แชทลูกค้า (ภาพ K3.2)" }, select: { id: true } });
  for (const s of stale) await wipeChatSystem(s.id);

  const chatSys = await prisma.appSystem.create({ data: { tenantId: E.tenantId, type: "CHAT" as Any, name: "แชทลูกค้า (ภาพ K3.2)" } });
  KB32.chatSystemId = chatSys.id;
  const contact = await prisma.chatContact.create({
    data: { tenantId: E.tenantId, systemId: chatSys.id, channel: "LINE" as Any, externalUserId: `kb32-${Date.now()}`, displayName: "คุณสมชาย (บริษัท เอบีซี)", phone: "0812345678" },
  });
  const conv = await prisma.chatConversation.create({
    data: { tenantId: E.tenantId, systemId: chatSys.id, channel: "LINE" as Any, contactId: contact.id, status: "OPEN" as Any },
  });
  KB32.conversationId = conv.id;
  const t0 = Date.now();
  const m1 = await prisma.chatMessage.create({
    data: { tenantId: E.tenantId, systemId: chatSys.id, conversationId: conv.id, direction: "IN" as Any, type: "TEXT" as Any, body: "สวัสดีครับ พอดีบริษัทอยากจัดทริปดำน้ำให้พนักงาน 12 คน ช่วง 24–26 ต.ค. ครับ มีใบรับรอง 9 คน มือใหม่ 3 คน", createdAt: new Date(t0 - 3 * 60_000) },
  });
  await prisma.chatMessage.create({
    data: { tenantId: E.tenantId, systemId: chatSys.id, conversationId: conv.id, direction: "IN" as Any, type: "TEXT" as Any, body: "งบประมาณราว ๆ 15,000 ต่อคน ขอใบเสนอราคาในนามบริษัทด้วยครับ ต้องการคำตอบภายในศุกร์นี้", createdAt: new Date(t0 - 2 * 60_000) },
  });
  await prisma.chatMessage.create({
    data: { tenantId: E.tenantId, systemId: chatSys.id, conversationId: conv.id, direction: "OUT" as Any, type: "TEXT" as Any, body: "รับทราบครับ เดี๋ยวทีมขายทำใบเสนอราคาส่งกลับภายในพรุ่งนี้นะครับ", senderUserId: E.users.staff.pook.userId, createdAt: new Date(t0 - 60_000) },
  });
  await prisma.chatAttachment.create({
    data: { tenantId: E.tenantId, systemId: chatSys.id, messageId: m1.id, kind: "FILE" as Any, storageKey: `t/${E.tenantId}/chat/kb32.pdf`, url: "https://cdn.example.test/kb32-visual.pdf", fileName: "รายชื่อพนักงาน.pdf", mimeType: "application/pdf", sizeBytes: 12345 },
  });

  KB32.settingsBefore = (await prisma.appSystem.findUnique({ where: { id: SYS }, select: { settings: true } }))?.settings ?? {};
  const col0 = await prisma.kanbanColumn.findFirst({
    where: { boardId: B("maint"), tenantId: E.tenantId, systemId: SYS, status: "ACTIVE" },
    orderBy: [{ position: { sort: "asc", nulls: "first" } }, { sortOrder: "asc" }],
    select: { id: true },
  });
  await integ.setIntegrations(ctx32, ownerActor, { openTaskFromChat: { enabled: true, boardId: B("maint"), columnId: col0?.id ?? null } });
  console.log(`🧪 เตรียม K3.2: ระบบแชทชั่วคราว ${chatSys.id} · ห้อง ${conv.id} (3 ข้อความ + 1 ไฟล์แนบ) · เปิดสวิตช์ "สร้างงานจากแชท" → บอร์ดซ่อมบำรุง`);
}

/** ลบระบบแชทชั่วคราวของ K3.2 ทั้งชุด (ข้อความ/ไฟล์แนบ/ห้อง/ผู้ติดต่อ/ตั้งค่า/ช่องทาง) */
async function wipeChatSystem(systemId: string): Promise<void> {
  const P = prisma as Any;
  await P.chatAttachment.deleteMany({ where: { systemId } }).catch(() => null);
  await P.chatConversationEvent.deleteMany({ where: { systemId } }).catch(() => null);
  await P.chatConversationPref.deleteMany({ where: { systemId } }).catch(() => null);
  await P.chatReadState.deleteMany({ where: { systemId } }).catch(() => null);
  await P.chatMessage.deleteMany({ where: { systemId } }).catch(() => null);
  await P.chatConversation.deleteMany({ where: { systemId } }).catch(() => null);
  await P.chatContact.deleteMany({ where: { systemId } }).catch(() => null);
  await P.chatQuickReply.deleteMany({ where: { systemId } }).catch(() => null);
  await P.chatSetting.deleteMany({ where: { systemId } }).catch(() => null);
  await P.chatChannelConnection.deleteMany({ where: { systemId } }).catch(() => null);
  await P.appSystem.deleteMany({ where: { id: systemId } }).catch(() => null);
}

const SPECS: Record<string, Spec[]> = {
  // K3.2 — "สร้างงานจากแชท" · เทียบภาพ `ledger/design-kanban/09-from-chat.png`
  //   1) แผงซ้อนบนหน้าแชทจริง (เดสก์ท็อป = แผงขวา 380px · มือถือ = เต็มจอ)
  //   2) กด "สร้างการ์ด" จริง → toast "สร้างการ์ด #n แล้ว" + บันทึกภายในโผล่ในห้อง
  //   3) ปิดสวิตช์รายร้าน → ปุ่ม "สร้างงาน" ต้องหายจากหัวห้อง (ไม่ใช่แค่กดไม่ได้)
  "3.2": [
    {
      name: "task-from-chat-panel",
      path: `/app/sys/${KB32.chatSystemId}?c=${KB32.conversationId}`,
      note: 'กด "สร้างงาน" ในหัวห้อง → แผงเตรียมการ์ด (หัวข้อ · กล่องฟ้าผู้ช่วย AI · ชื่อการ์ด/บอร์ด/คอลัมน์/ผู้รับผิดชอบ/กำหนดส่ง/ป้าย/รายละเอียด · เชื่อมอัตโนมัติ 4 ติ๊ก · ท้ายแผง)',
      expect: ["[data-testid=task-from-chat-panel]", "[data-testid=task-from-chat-submit]"],
      steps: [
        { waitFor: "[data-testid=chat-create-task]" },
        { click: "[data-testid=chat-create-task]" },
        { waitFor: "[data-testid=task-from-chat-panel]" },
        { waitFor: "[data-testid=task-from-chat-title]", timeoutMs: 20_000 },
        { wait: 900 },
      ],
    },
    {
      name: "task-from-chat-created",
      path: `/app/sys/${KB32.chatSystemId}?c=${KB32.conversationId}`,
      onlyDevice: "desktop",
      note: 'กด "สร้างการ์ด" จริงบน production build → toast "สร้างการ์ด #n แล้ว" + บันทึกภายในถูกแปะกลับในห้อง (พิสูจน์เส้น action → chat → facade บอร์ดงาน → DB ครบทอด)',
      expect: ["[data-testid=task-from-chat-toast]"],
      steps: [
        { waitFor: "[data-testid=chat-create-task]" },
        { click: "[data-testid=chat-create-task]" },
        { waitFor: "[data-testid=task-from-chat-title]", timeoutMs: 20_000 },
        { wait: 500 },
        { click: "[data-testid=task-from-chat-submit]" },
        { waitFor: "[data-testid=task-from-chat-toast]", timeoutMs: 25_000 },
        { wait: 2000 },
      ],
    },
    {
      name: "task-from-chat-switch-off",
      path: `/app/sys/${KB32.chatSystemId}?c=${KB32.conversationId}`,
      onlyDevice: "desktop",
      note: 'ปิดสวิตช์ "สร้างงานจากแชท" ในตั้งค่าบอร์ดงาน → หัวห้องต้อง **ไม่มี** ปุ่มสร้างงานอีกเลย',
      expect: ["[data-qc=room-header]"],
      steps: [{ waitFor: "[data-qc=room-header]" }, { wait: 600 }],
      before: async () => {
        const integ = (await import("@/lib/modules/kanban/integrations" as string)) as Any;
        const membership = await prisma.membership.findFirst({
          where: { tenantId: E.tenantId, userId: E.users.owner.userId },
          select: { role: true, unitAccess: true, permissions: true },
        });
        await integ.setIntegrations(
          { tenantId: E.tenantId, systemId: SYS, actorUserId: E.users.owner.userId as string },
          {
            userId: E.users.owner.userId as string,
            role: membership!.role,
            unitAccess: (membership!.unitAccess as string[] | null) ?? [],
            permissions: (membership!.permissions as Record<string, unknown> | null) ?? {},
          },
          { openTaskFromChat: { enabled: false } },
        );
        console.log('  🔧 ปิดสวิตช์ "สร้างงานจากแชท" ก่อนถ่ายภาพสุดท้าย');
      },
    },
  ],
  // K3.1 — บล็อก "เชื่อมข้อมูล SHARK" ในหลังการ์ด (ไม่มี mockup เดี่ยว — เทียบบล็อกในภาพ 03)
  // 🔴 ถ่าย 2 รอบ: `--user owner` (เห็นครบ + เปิดป๊อปอัปเพิ่มได้) และ `--user thana`
  //    (VIEWER ของบอร์ด + ไม่มีสิทธิ์โมดูลปลายทาง ⇒ ต้องเห็นแถวครบแต่เป็น "(ไม่มีสิทธิ์เข้าถึง)")
  //    ชื่อไฟล์ผูกกับผู้ใช้ ไม่งั้นรอบที่สองจะทับภาพของรอบแรก
  "3.1": [
    {
      name: `card-links-${userKey}`,
      path: `/app/sys/${SYS}/kanban/b/${B("maint")}?card=${KB31_CARD}`,
      onlyDevice: "desktop",
      note: `หลังการ์ด — บล็อก "เชื่อมข้อมูล SHARK" ของ ${userKey} (owner เห็นชื่อลูกค้า+ลิงก์ · thana ต้องเห็น "(ไม่มีสิทธิ์เข้าถึง)")`,
      expect: ["[data-testid=card-back]", "[data-testid=card-links]"],
      steps: [{ waitFor: "[data-testid=card-links]" }, { wait: 600 }],
    },
    ...(userKey === "owner"
      ? [
          {
            name: "card-link-added",
            path: `/app/sys/${SYS}/kanban/b/${B("maint")}?card=${KB31_CARD}`,
            onlyDevice: "desktop" as const,
            note: 'กด "เพิ่มการเชื่อม" → กรอก URL → กด "เชื่อมลิงก์" จริงบน production build (พิสูจน์เส้น action → service → DB ครบทอด)',
            expect: ["[data-testid=card-links]"],
            steps: [
              { waitFor: "[data-testid=card-link-add]" },
              { click: "[data-testid=card-link-add]" },
              { waitFor: "[data-testid=card-link-url]" },
              { fill: "[data-testid=card-link-url]", value: "https://example.com/qc/k3-1-ui.pdf" },
              { fill: "[data-testid=card-link-label]", value: "ใบเสนอราคาอะไหล่ (เพิ่มจากหน้าจอจริง)" },
              { click: "[data-testid=card-link-submit]" },
              { wait: 1500 },
            ],
          },
          {
            name: "card-link-removed",
            path: `/app/sys/${SYS}/kanban/b/${B("maint")}?card=${KB31_CARD}`,
            onlyDevice: "desktop" as const,
            note: "กด × ของแถวล่างสุด → ยืนยัน 'ถอดออก' — แถวต้องหายจริง (soft delete) เหลือ 2 แถว",
            expect: ["[data-testid=card-links]"],
            steps: [
              { waitFor: "[data-testid=card-link-row]" },
              { click: "[data-testid=card-link-row]:last-of-type [data-testid=card-link-remove]" },
              { waitFor: "[data-testid=card-link-remove-confirm]" },
              { click: "[data-testid=card-link-remove-confirm]" },
              { wait: 1500 },
            ],
          },
          {
            name: "card-link-add",
            path: `/app/sys/${SYS}/kanban/b/${B("maint")}?card=${KB31_CARD}`,
            onlyDevice: "desktop" as const,
            note: 'ป๊อปอัป "เพิ่มการเชื่อม" — 2 แท็บ: ลิงก์ภายนอก (กรอก URL + ป้าย) · ผู้ติดต่อ (ค้นชื่อ)',
            expect: ["[data-testid=card-link-add-panel]"],
            steps: [
              { waitFor: "[data-testid=card-link-add]" },
              { click: "[data-testid=card-link-add]" },
              { waitFor: "[data-testid=card-link-add-panel]" },
              { wait: 400 },
            ],
          },
        ]
      : []),
  ],
  // Fable 7 ก.ย. — หัวบอร์ด: dropdown ต้องไม่ถูก overflow ของ <header> ครอบตัด (บั๊กที่ K2.5 พบ · แก้ด้วย lg:overflow-visible)
  "hdr": [
    {
      name: "board-menu-open",
      path: `/app/sys/${SYS}/kanban/b/${B("patong")}`,
      onlyDevice: "desktop",
      note: "เปิดเมนู ⋯ ของหัวบอร์ด — ต้องเห็นรายการเมนู",
      steps: [{ waitFor: "[aria-label=\"เมนูบอร์ด\"]" }, { click: "[aria-label=\"เมนูบอร์ด\"]" }, { wait: 400 }],
    },
    {
      name: "filter-panel-open",
      path: `/app/sys/${SYS}/kanban/b/${B("patong")}`,
      onlyDevice: "desktop",
      note: "เปิดแผงตัวกรอง — ต้องเห็นแผง",
      steps: [{ waitFor: "[data-testid=filter-button]" }, { click: "[data-testid=filter-button]" }, { wait: 400 }],
    },
  ],
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
  // K2.3 — มุมมองไทม์ไลน์ (ไม่มี mockup — เกณฑ์ §3.6/§13 K2.3) — ทุกช็อตปักหมุด `from=2026-09-16` (ใกล้วัน
  // อ้างอิงของ seed `KQC.today = 2026-09-30` — ไม่ใช้ `?view=timeline` เฉย ๆ เพราะ `board.now` ของหน้าจริง
  // คือเวลาปัจจุบันจริง (server clock) ไม่ใช่วันอ้างอิงของ seed ⇒ ช่วงปริยายที่ยึดวันนี้จริงจะไม่ครอบวันที่
  // การ์ด QC ถูกตั้งไว้ (รอบ ๆ 30 ก.ย. 69) แล้วจะไม่เห็นแถบเลย — ลากขวาให้ยาวขึ้นแล้วคืนค่าใน finally
  "2.3": [
    {
      name: "timeline-month",
      path: `/app/sys/${SYS}/kanban/b/${B("patong")}?view=timeline&from=2026-09-16`,
      onlyDevice: "desktop",
      note: "ซูมเดือน (ปริยาย) — แถบตรงคอลัมน์ · เส้นวันนี้ (ถ้าอยู่ในช่วง) · ‹ วันนี้ ›",
      expect: ["[data-testid=timeline-view]", "[data-testid=timeline-zoom]", "[data-testid=timeline-bar]"],
      steps: [{ waitFor: "[data-testid=timeline-bar]" }],
    },
    {
      name: "timeline-quarter",
      path: `/app/sys/${SYS}/kanban/b/${B("patong")}?view=timeline&zoom=quarter&from=2026-09-16`,
      onlyDevice: "desktop",
      note: "ซูมไตรมาส — คอลัมน์วันแคบลงเห็น 13 สัปดาห์เต็ม",
      expect: ["[data-testid=timeline-bar]"],
      steps: [{ waitFor: "[data-testid=timeline-bar]" }],
    },
    {
      name: "timeline-group-assignee",
      path: `/app/sys/${SYS}/kanban/b/${B("patong")}?view=timeline&group=assignee&from=2026-09-16`,
      onlyDevice: "desktop",
      note: "จัดกลุ่มตามคน — แถวซ้ายเป็นชื่อคนแทนคอลัมน์ + แถว 'ไม่มีผู้รับผิดชอบ'",
      expect: ["[data-testid=timeline-group]", "[data-testid=timeline-bar]"],
      steps: [{ waitFor: "[data-testid=timeline-bar]" }],
    },
    {
      name: "timeline-resize-after",
      path: `/app/sys/${SYS}/kanban/b/${B("patong")}?view=timeline&from=2026-09-16`,
      onlyDevice: "desktop",
      note: "ลากแฮนเดิลขวาของแถบแรกยืดออก 3 วัน (81px ที่ dayWidth 27px) — ต้องเห็นแถบยาวขึ้น (คืนค่าใน finally)",
      steps: [
        { waitFor: "[data-testid=timeline-bar]" },
        { dragBy: { on: "[data-testid=timeline-bar]:nth-of-type(1) [data-testid=timeline-handle][data-side=end]", dx: 81 } },
        { wait: 900 },
      ],
    },
    {
      name: "timeline-mobile",
      path: `/app/sys/${SYS}/kanban/b/${B("patong")}?view=timeline`,
      onlyDevice: "mobile",
      note: "มือถือ — ข้อความชวนไปมุมมองตาราง ไม่วาดไทม์ไลน์",
      expect: ["[data-testid=timeline-view]", "[data-testid=timeline-mobile-hint]"],
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
  // K2.5 — มุมมองที่บันทึกไว้ (ไม่มี mockup เฉพาะ — ใช้ตัวอย่างประโยคจาก 10-board-settings.png:
  // "ตาราง · กรอง: เลยกำหนด · เรียงตามวันที่") — มุมมอง "ทั้งทีม" ถูกสร้างไว้แล้วก่อนถ่าย (ผ่าน `views.saveView`
  // ตรง ๆ ไม่ผ่านฟอร์ม — กันปัญหา revalidatePath ของ server action สั่งรีเฟรชหน้าแล้ว state dropdown ปิด
  // เงียบ ๆ ระหว่างที่ puppeteer กำลังจะกดปุ่มเดิมซ้ำ) ดู KB25 ด้านล่าง · ลบด้วย id ที่จำไว้ใน finally
  "2.5": [
    {
      name: "saved-views-dropdown",
      path: `/app/sys/${SYS}/kanban/b/${B("patong")}`,
      onlyDevice: "desktop",
      note: "เปิด ▾มุมมอง — เห็นมุมมอง 'ทั้งทีม' ที่เตรียมไว้ + คำบรรยายเงื่อนไข + ปุ่ม 'บันทึกมุมมองนี้'",
      expect: ["[data-testid=saved-views-list]", "[data-testid=saved-view-item]"],
      steps: [
        { waitFor: "[data-testid=board-header]" },
        { click: "[data-testid=saved-views]" },
        { waitFor: "[data-testid=saved-view-item]" },
        { wait: 300 },
      ],
    },
    {
      name: "saved-view-selected-changes-url",
      path: `/app/sys/${SYS}/kanban/b/${B("patong")}`,
      onlyDevice: "desktop",
      note: "โหลดบอร์ดเปล่า (ไม่มีตัวกรอง) → เปิดดรอปดาวน์ → กดมุมมองที่เตรียมไว้ → ต้องเด้งเป็นมุมมองตาราง+ตัวกรองเลยกำหนดทันที (ตาม §2.3)",
      expect: ["[data-testid=table-view]"],
      steps: [
        { waitFor: "[data-testid=board-header]" },
        { click: "[data-testid=saved-views]" },
        { waitFor: "[data-testid=saved-view-item]" },
        { click: "[data-testid=saved-view-item]" },
        { waitFor: "[data-testid=table-view]", timeoutMs: 8000 },
        { wait: 300 },
      ],
    },
    {
      name: "board-settings-views",
      path: `/app/sys/${SYS}/kanban/b/${B("patong")}/settings/views`,
      onlyDevice: "desktop",
      note: "ตั้งค่าบอร์ด › มุมมองที่บันทึกไว้ (ภาพ 10): รายการ + ป้ายทั้งทีม/ส่วนตัว + คำบรรยายเงื่อนไข",
      expect: ["[data-testid=board-settings-nav]", "[data-testid=saved-views-settings]"],
      steps: [{ waitFor: "[data-testid=saved-views-settings]" }, { wait: 300 }],
    },
  ],
  // K2.6 — ฟิลด์กำหนดเอง (ภาพ 10 บล็อกล่างขวา "ฟิลด์กำหนดเอง 3/20" + ภาพ 03 แถบขวา "ฟิลด์กำหนดเอง")
  // ฟิลด์ 2 ตัว (งบประมาณ NUMBER showOnCard · ความสำคัญ SELECT showOnCard) ถูกสร้าง+ตั้งค่าไว้ก่อนถ่าย
  // ผ่าน `fields.ts` ตรง ๆ (เหตุผลเดียวกับ KB25 — revalidatePath ของ action ชนจังหวะ puppeteer) ดู KB26 ด้านล่าง
  "2.6": [
    {
      name: "board-settings-fields",
      path: `/app/sys/${SYS}/kanban/b/${B("patong")}/settings/fields`,
      onlyDevice: "desktop",
      note: "ตั้งค่าบอร์ด › ฟิลด์กำหนดเอง (ภาพ 10): '2 / 20' + รายการ 2 ฟิลด์ (ชนิด/ตัวเลือก) + สลับแสดงบนการ์ด",
      expect: ["[data-testid=board-settings-nav]", "[data-testid=custom-fields-settings]", "[data-testid=custom-field-settings-row]"],
      steps: [{ waitFor: "[data-testid=custom-fields-settings]" }, { wait: 300 }],
    },
    {
      name: "card-back-custom-fields-value",
      path: `/app/sys/${SYS}/kanban/b/${B("patong")}?card=${E.boards.patong.cardIds[6]}`,
      onlyDevice: "desktop",
      note: "หลังการ์ด แถบขวา 'ฟิลด์กำหนดเอง' (ภาพ 03): งบประมาณ ฿12,500.50 · ความสำคัญ สูง — คลิกค่างบประมาณเปิดช่องแก้",
      expect: ["[data-testid=card-back]", "[data-testid=custom-fields]", "[data-testid=custom-field-row]", "[data-testid=custom-field-input]"],
      steps: [
        { waitFor: "[data-testid=custom-fields]" },
        { click: "[data-testid=custom-field-value]" },
        { wait: 200 },
      ],
    },
    {
      name: "board-card-field-chip",
      path: `/app/sys/${SYS}/kanban/b/${B("patong")}`,
      onlyDevice: "desktop",
      note: "การ์ดบนบอร์ด (เทียบ mockup 02 — จุดที่เพิ่ม): ชิปฟิลด์กำหนดเอง 'งบประมาณ: ฿12,500.50' + 'ความสำคัญ: สูง'",
      expect: ["[data-testid=card-field]"],
      steps: [{ waitFor: "[data-testid=card-field]" }],
    },
    {
      name: "table-custom-field-columns",
      path: `/app/sys/${SYS}/kanban/b/${B("patong")}?view=table`,
      onlyDevice: "desktop",
      note: "มุมมองตาราง (K2.1) เพิ่มคอลัมน์ฟิลด์ที่ showOnCard — คอลัมน์ 'งบประมาณ'/'ความสำคัญ' โผล่พร้อมค่า",
      expect: ["[data-testid=table-view]", "[data-testid=table-custom-field-column]"],
      steps: [{ waitFor: "[data-testid=table-custom-field-column]" }],
    },
    {
      name: "card-back-custom-fields",
      path: `/app/sys/${SYS}/kanban/b/${B("patong")}?card=${E.boards.patong.cardIds[6]}`,
      onlyDevice: "mobile",
      note: "มือถือ — แผ่นเต็มจอ ต้องเห็นบล็อก 'ฟิลด์กำหนดเอง' เหมือนกัน",
      expect: ["[data-testid=card-back]", "[data-testid=custom-fields]"],
      steps: [{ waitFor: "[data-testid=custom-fields]" }],
    },
  ],
  // K2.7 — เทมเพลตการ์ด + กำหนดส่งซ้ำ (ไม่มี mockup เฉพาะ) — เทมเพลต 1 ใบ + กำหนดส่งซ้ำของการ์ด
  // cardIds[7] ถูกเตรียมไว้แล้วผ่าน `card-templates.ts`/`recurrence.ts` ตรง ๆ ก่อนถ่าย (ดู KB27 ด้านล่าง)
  "2.7": [
    {
      name: "column-template-picker",
      path: `/app/sys/${SYS}/kanban/b/${B("patong")}`,
      onlyDevice: "desktop",
      note: "คอลัมน์แรกของบอร์ด: เปิดปุ่ม 'จากเทมเพลต ▾' ข้าง '+ เพิ่มการ์ด' — เห็นรายการเทมเพลตที่เตรียมไว้",
      expect: ["[data-testid=card-template-picker]"],
      steps: [{ waitFor: "[data-testid=card-template-picker]" }, { click: "[data-testid=card-template-picker] button" }, { wait: 300 }],
    },
    {
      name: "card-back-recurrence",
      path: `/app/sys/${SYS}/kanban/b/${B("patong")}?card=${E.boards.patong.cardIds[7]}`,
      onlyDevice: "desktop",
      note: "หลังการ์ด: บล็อก 'กำหนดส่งซ้ำ' ตั้งเป็น 'ทุกสัปดาห์ (วันจันทร์)' แล้ว + คำอธิบายไทย",
      expect: ["[data-testid=card-back]", "[data-testid=card-recurrence]"],
      steps: [{ waitFor: "[data-testid=card-recurrence]" }, { wait: 300 }],
    },
    {
      name: "board-settings-card-templates",
      path: `/app/sys/${SYS}/kanban/b/${B("patong")}/settings/card-templates`,
      onlyDevice: "desktop",
      note: "ตั้งค่าบอร์ด › เทมเพลตการ์ด: 'n / 30' + รายการเทมเพลตที่เตรียมไว้",
      expect: ["[data-testid=board-settings-nav]", "[data-testid=card-templates-settings]"],
      steps: [{ waitFor: "[data-testid=card-templates-settings]" }, { wait: 300 }],
    },
  ],
  // K2.9 — ตัวสร้างกฎอัตโนมัติ (เทียบภาพ 08) · ข้อมูลตัวอย่าง (กฎ 4 ใบ + บันทึกการทำงาน 3 แถว)
  // ถูกสร้างผ่าน service จริงในบล็อกเตรียมด้านล่าง แล้วลบคืนใน `restoreSeed()`
  "2.9": [
    {
      name: "automation-full",
      path: `/app/sys/${SYS}/kanban/automation?board=${B("maint")}`,
      onlyDevice: "desktop",
      note: "เทียบภาพ 08: หัว 'อัตโนมัติ — บอร์ด …' + ชิปโควตา + ปุ่มสร้างกฎใหม่ · ซ้าย ประเภทอัตโนมัติ 6 รายการ · กลาง ตัวสร้างกฎ (เมื่อ/และถ้า/ให้ทำ) · ล่าง ตารางกฎ + คำแนะนำจาก AI + บันทึกการทำงาน",
      expect: ["[data-testid=automation-usage]", "[data-testid=automation-kinds]", "[data-testid=rule-when]", "[data-testid=rule-then]", "[data-testid=rules-table]", "[data-testid=runs-log]"],
      steps: [{ waitFor: "[data-testid=rules-table]" }, { wait: 400 }],
    },
    {
      name: "automation-dry-run",
      path: `/app/sys/${SYS}/kanban/automation?board=${B("maint")}`,
      onlyDevice: "desktop",
      note: "กด 'แก้' กฎใบแรก (โหลดเข้าฟอร์ม) แล้วกด 'ทดลองรัน' — ต้องขึ้นรายการ 'จะทำอะไรกับใบไหน' โดยไม่เขียน DB",
      expect: ["[data-testid=rule-dry-run-result]"],
      steps: [
        { waitFor: "[data-testid=rule-edit]" },
        { click: "[data-testid=rule-edit]" },
        { wait: 400 },
        { click: "[data-testid=rule-dry-run]" },
        { wait: 1800 },
        { waitFor: "[data-testid=rule-dry-run-result]" },
      ],
    },
    {
      name: "automation-tables",
      path: `/app/sys/${SYS}/kanban/automation?board=${B("maint")}`,
      onlyDevice: "desktop",
      note: "ปิดตัวสร้างกฎ (ยกเลิก) — เห็นตาราง 'กฎที่เปิดใช้อยู่' + 'บันทึกการทำงานล่าสุด' เต็ม ๆ",
      expect: ["[data-testid=rules-table]", "[data-testid=runs-log]", "[data-testid=run-row]"],
      steps: [{ waitFor: "[data-testid=rule-cancel]" }, { click: "[data-testid=rule-cancel]" }, { wait: 500 }],
    },
    {
      name: "automation-card-button",
      path: `/app/sys/${SYS}/kanban/b/${B("maint")}?card=${E.boards.maint.cardIds[0]}`,
      onlyDevice: "desktop",
      note: "หลังการ์ด: บล็อก 'ปุ่มอัตโนมัติ' (กฎ CARD_BUTTON ของบอร์ด)",
      expect: ["[data-testid=card-back]", "[data-testid=card-button]"],
      steps: [{ waitFor: "[data-testid=card-back]" }, { wait: 600 }],
    },
    {
      name: "automation-mobile",
      path: `/app/sys/${SYS}/kanban/automation?board=${B("maint")}`,
      onlyDevice: "mobile",
      note: "มือถือ: ซ้าย/ขวาเรียงลง · ประโยคกฎเป็นบรรทัดละส่วน",
      expect: ["[data-testid=automation-kinds]", "[data-testid=rules-table]"],
      steps: [{ waitFor: "[data-testid=rules-table]" }, { wait: 400 }],
    },
  ],
  // K2.11 — ติดตาม + การแจ้งเตือนของฉัน (ไม่มี mockup — เกณฑ์ §7.4/§13 K2.11)
  //   เตรียมข้อมูล: ให้เจ้าของร้าน "ติดตาม" การ์ด 1 ใบ + คอลัมน์ 1 คอลัมน์ (ลบคืนหลังถ่าย)
  "2.11": [
    {
      name: "card-back-watch",
      path: `/app/sys/${SYS}/kanban/b/${B("patong")}?card=${(E.boards.patong.cardIds as string[])[2]}`,
      onlyDevice: "desktop",
      note: "หลังการ์ด — กลุ่ม 'ติดตาม' + ปุ่ม 👁 (ใบนี้เจ้าของติดตามอยู่แล้ว ⇒ ต้องขึ้น 'เลิกติดตาม')",
      expect: ["[data-testid=card-back]", "[data-testid=card-watch]"],
      steps: [{ waitFor: "[data-testid=card-watch]" }, { wait: 400 }],
    },
    {
      name: "column-menu-watch",
      path: `/app/sys/${SYS}/kanban/b/${B("patong")}`,
      onlyDevice: "desktop",
      note: "เมนู ⋯ ของคอลัมน์แรก — ต้องมี 'ติดตามคอลัมน์นี้' เป็นรายการบนสุด",
      expect: ["[data-testid=column-watch]"],
      steps: [
        { waitFor: "[data-testid=column]" },
        { click: "[data-testid=column]:nth-of-type(1) [aria-label=\"เมนูคอลัมน์\"]" },
        { waitFor: "[data-testid=column-watch]" },
        { wait: 300 },
      ],
    },
    {
      name: "board-menu-watch",
      path: `/app/sys/${SYS}/kanban/b/${B("patong")}`,
      onlyDevice: "desktop",
      note: "เมนู ⋯ ของหัวบอร์ด — ต้องมี 'ติดตามบอร์ด'",
      expect: ["[data-testid=board-watch]"],
      steps: [{ waitFor: "[aria-label=\"เมนูบอร์ด\"]" }, { click: "[aria-label=\"เมนูบอร์ด\"]" }, { waitFor: "[data-testid=board-watch]" }, { wait: 300 }],
    },
    {
      name: "notify-prefs",
      path: `/app/sys/${SYS}/kanban/settings`,
      note: "ตั้งค่า › การแจ้งเตือนของฉัน — 3 + 3 ตัวเลือก + บรรทัด 'ปิดไม่ได้' (desktop + mobile)",
      expect: ["[data-testid=notify-prefs]"],
      steps: [{ waitFor: "[data-testid=notify-prefs]" }, { wait: 300 }],
    },
    {
      name: "my-watched",
      path: `/app/sys/${SYS}/kanban/my-tasks`,
      onlyDevice: "desktop",
      note: "งานของฉัน — บล็อก 'ที่ฉันติดตาม (ไม่ได้รับผิดชอบ)' ท้ายคอลัมน์ขวา (ภาพ 06)",
      expect: ["[data-testid=my-tasks]", "[data-testid=my-watched]"],
      steps: [{ waitFor: "[data-testid=my-watched]" }, { wait: 400 }],
    },
  ],
  // K2.12 — ปิดหนี้ P2: ตาราง (แถบเลือกหลายรายการ = แถบฟ้าบนตาราง เทียบ 04) · ปฏิทินรวมระบบ · มือถือจากเทมเพลต
  "2.12": [
    {
      name: "table-bulk-selected",
      path: `/app/sys/${SYS}/kanban/b/${B("patong")}?view=table`,
      onlyDevice: "desktop",
      note: "ติ๊ก 2 แถวแรก — แถบฟ้าต้องอยู่บนหัวตาราง (ไม่ใช่ pill ลอยล่างจอ) เทียบ 04-table.png",
      expect: ["[data-testid=bulk-bar]"],
      steps: [
        { waitFor: "[data-testid=table-row]" },
        { click: "[data-testid=table-row]:nth-of-type(1) [data-testid=row-select]" },
        { click: "[data-testid=table-row]:nth-of-type(2) [data-testid=row-select]" },
        { wait: 300 },
      ],
    },
    {
      name: "system-calendar",
      path: `/app/sys/${SYS}/kanban/calendar`,
      onlyDevice: "desktop",
      note: "ปฏิทินรวมทุกบอร์ดที่มองเห็น — ชิปการ์ดมีสีตามบอร์ด + ชื่อบอร์ดกำกับ",
      expect: ["[data-testid=system-calendar]"],
      steps: [{ waitFor: "[data-testid=system-calendar]" }, { wait: 400 }],
    },
    {
      name: "mobile-template-create",
      path: `/app/sys/${SYS}/kanban/b/${B("patong")}`,
      onlyDevice: "mobile",
      note: "มือถือ: FAB → แผ่นเพิ่มการ์ดเร็ว → 'จากเทมเพลต ▾' เปิดรายการ",
      expect: ["[data-testid=mobile-quick-add]", "[data-testid=card-template-picker]"],
      steps: [
        { waitFor: "[data-testid=fab-add]" },
        { click: "[data-testid=fab-add]" },
        { waitFor: "[data-testid=mobile-quick-add]" },
        { click: "[data-testid=card-template-picker] button" },
        { wait: 400 },
      ],
    },
  ],
  // K2.10 — รายงานในแอป (ไม่มี mockup — เกณฑ์ §3.7/§13 K2.10) · อ่านอย่างเดียวล้วนเหมือน 2.4 — ไม่มีขั้น
  // เตรียม/คืนสภาพ seed (สลับแท็บฝั่ง client ล้วน ไม่ยิง server ซ้ำ นอกจากโหลดหน้าแรก)
  "2.10": [
    {
      name: "reports-open",
      path: `/app/sys/${SYS}/kanban/reports`,
      onlyDevice: "desktop",
      note: "แท็บเริ่มต้น 'ค้าง': ตัวเลขใหญ่ 4 ค่า + รายการค้างต่อบอร์ด",
      expect: ["[data-testid=reports-page]", "[data-testid=reports-tab]", "[data-testid=reports-board-filter]"],
      steps: [{ waitFor: "[data-testid=reports-page]" }, { wait: 400 }],
    },
    {
      name: "reports-overdue",
      path: `/app/sys/${SYS}/kanban/reports`,
      onlyDevice: "desktop",
      note: "กดแท็บ 'เลยกำหนด' — รายการเรียงเลยนานสุดก่อน คลิกแถวไปที่การ์ดจริงได้",
      expect: ["[data-testid=reports-page]"],
      steps: [
        { waitFor: '[data-testid=reports-tab][data-tab-key="overdue"]' },
        { click: '[data-testid=reports-tab][data-tab-key="overdue"]' },
        { wait: 400 },
      ],
    },
    {
      name: "reports-workload",
      path: `/app/sys/${SYS}/kanban/reports`,
      onlyDevice: "desktop",
      note: "กดแท็บ 'ภาระงาน' — กราฟ SVG แถบต่อคน (ค้าง/เลยกำหนด) + ตารางตัวเลข",
      expect: ["[data-testid=reports-workload-chart]"],
      steps: [
        { waitFor: '[data-testid=reports-tab][data-tab-key="workload"]' },
        { click: '[data-testid=reports-tab][data-tab-key="workload"]' },
        { waitFor: "[data-testid=reports-workload-chart]" },
        { wait: 400 },
      ],
    },
    {
      name: "reports-throughput-aging",
      path: `/app/sys/${SYS}/kanban/reports`,
      onlyDevice: "desktop",
      note: "กดแท็บ 'อายุงาน' — กราฟแท่ง 4 ช่วงอายุ + ตารางต่อคอลัมน์ (throughput ดูซ้ำแบบเดียวกันที่แท็บ 'ผลงานรายสัปดาห์')",
      expect: ["[data-testid=reports-aging-chart]"],
      steps: [
        { waitFor: '[data-testid=reports-tab][data-tab-key="aging"]' },
        { click: '[data-testid=reports-tab][data-tab-key="aging"]' },
        { waitFor: "[data-testid=reports-aging-chart]" },
        { wait: 400 },
      ],
    },
    {
      name: "reports-mobile",
      path: `/app/sys/${SYS}/kanban/reports`,
      onlyDevice: "mobile",
      note: "มือถือ: ตัวเลขเป็นชิปเลื่อนแนวนอน · แท็บเลื่อนแนวนอน",
      expect: ["[data-testid=reports-page]"],
      steps: [{ waitFor: "[data-testid=reports-page]" }, { wait: 400 }],
    },
  ],
  "2.8": [
    {
      name: "my-tasks-inbox",
      path: `/app/sys/${SYS}/kanban/my-tasks`,
      onlyDevice: "desktop",
      note: "เทียบภาพ 06: หัว 'สวัสดีตอน…' + วันที่ไทย + จดงานเร็ว · ซ้าย=กล่องงานเข้า (2 รายการเตรียมไว้ ใบหนึ่งมีป้าย AI) · ขวา=งานของฉัน",
      expect: ["[data-testid=my-tasks]", "[data-testid=inbox-panel]", "[data-testid=inbox-item]"],
      steps: [{ waitFor: "[data-testid=inbox-item]" }, { wait: 300 }],
    },
    {
      name: "inbox-quick-add",
      path: `/app/sys/${SYS}/kanban/my-tasks`,
      onlyDevice: "desktop",
      note: "พิมพ์ในช่อง 'พิมพ์แล้วกด Enter…' แล้วกด Enter จริง — รายการใหม่ต้องโผล่ในกล่องทันที (แถวบนสุด)",
      expect: ["[data-testid=inbox-panel]"],
      steps: [
        { waitFor: "[data-testid=inbox-quick-add]" },
        { fill: "[data-testid=inbox-quick-add]", value: "ทดสอบจดงานเร็ว QC" },
        { press: "Enter" },
        { wait: 700 },
      ],
    },
    {
      name: "inbox-move-popover",
      path: `/app/sys/${SYS}/kanban/my-tasks`,
      onlyDevice: "desktop",
      note: "กดปุ่ม 'ส่งเข้าบอร์ด' ของรายการแรก — popover เลือกบอร์ด → คอลัมน์ → กำหนดส่ง (ไม่บังคับ)",
      expect: ["[data-testid=inbox-move-popover]", "[data-testid=inbox-move-board]", "[data-testid=inbox-move-column]"],
      steps: [{ waitFor: "[data-testid=inbox-move-to-board]" }, { click: "[data-testid=inbox-move-to-board]" }, { wait: 400 }],
    },
    {
      name: "mobile-my-tasks-inbox",
      path: `/app/sys/${SYS}/kanban/my-tasks`,
      onlyDevice: "mobile",
      note: "เทียบภาพ 07(ค)/06 มือถือ: งานของฉันบนสุด กล่องงานเข้าถัดลงมา",
      expect: ["[data-testid=my-tasks]", "[data-testid=inbox-panel]"],
      steps: [{ waitFor: "[data-testid=inbox-item]" }, { wait: 300 }],
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

// ── K2.3: จำ startAt/dueAt ของ "ทุก" การ์ดบนบอร์ดป่าตอง (ไม่ใช่แค่ใบเดียว) ไว้คืนหลังถ่ายเสร็จ — สเปค
//    `timeline-resize-after` ลากแฮนเดิลของแถบ "แรกที่เรนเดอร์" ซึ่งขึ้นกับลำดับคอลัมน์/การ์ดจริงบนจอ
//    (ไม่รู้ล่วงหน้าแน่ชัดว่าเป็นใบไหน) — คืนค่าทุกใบให้ตรงเดิมปลอดภัยกว่าเดาใบเดียว ──
const KB23: { cardId: string; startAt: string | null; dueAt: string | null }[] = [];
if (WO === "2.3") {
  const patongCards = await prisma.kanbanCard.findMany({
    where: { boardId: B("patong"), tenantId: E.tenantId, systemId: SYS, status: "ACTIVE" },
    select: { id: true, startAt: true, dueAt: true },
  });
  for (const c of patongCards) {
    KB23.push({ cardId: c.id, startAt: c.startAt ? c.startAt.toISOString() : null, dueAt: c.dueAt ? c.dueAt.toISOString() : null });
  }
  console.log(`🧪 เตรียม K2.3: จำ startAt/dueAt ของการ์ดบอร์ดป่าตองทั้ง ${KB23.length} ใบไว้คืน (ลากแฮนเดิลจะแก้ใบใดใบหนึ่ง)`);
}

// ── K2.5: สร้างมุมมอง "ทั้งทีม" จริงผ่าน `views.saveView` ตรง ๆ ก่อนเริ่มถ่าย (ไม่ใช่ผ่านฟอร์มในหน้าเว็บ)
//    เหตุผล: `saveViewAction` เรียก `revalidatePath` ⇒ เบราว์เซอร์รีเฟรชหน้าเดิมหลังบันทึกไม่กี่ร้อย ms
//    ซึ่งชนกับจังหวะที่ puppeteer กด "มุมมอง" ซ้ำเพื่อเปิดดรอปดาวน์อีกครั้ง (state `open` ของ
//    `SavedViewsMenu` โดน remount กลับเป็น false เงียบ ๆ พอดีตอนจะถ่ายภาพ — เจอจริงตอนรันรอบแรก
//    ภาพออกมาเป็นบอร์ดเฉย ๆ ไม่มีดรอปดาวน์ค้างอยู่) ⇒ เตรียมข้อมูลผ่าน service แล้วให้ทุกสเปคเป็นแค่
//    "อ่าน/นำทาง" ล้วน ไม่มีการ mutate ระหว่างสเปคเดียวกันอีกต่อไป
const KB25 = { viewId: "" };
if (WO === "2.5") {
  const viewsSvc = (await import("@/lib/modules/kanban/views" as string)) as Any;
  const membership = await prisma.membership.findFirst({
    where: { tenantId: E.tenantId, userId: E.users.owner.userId },
    select: { role: true, unitAccess: true, permissions: true },
  });
  const ownerActor = {
    userId: E.users.owner.userId as string,
    role: membership!.role,
    unitAccess: (membership!.unitAccess as string[] | null) ?? [],
    permissions: (membership!.permissions as Record<string, unknown> | null) ?? {},
  };
  const ctx25 = { tenantId: E.tenantId, systemId: SYS, actorUserId: E.users.owner.userId as string };
  // ลบเศษของรอบก่อนที่อาจค้าง (สคริปต์ล่ม/Ctrl-C ก่อนถึง finally) — กันชื่อซ้ำสะสมทุกรอบที่รัน
  await (prisma as Any).kanbanBoardView.deleteMany({ where: { boardId: B("patong"), name: "งานเลยกำหนดทั้งบอร์ด" } });
  const view = await viewsSvc.saveView(ctx25, ownerActor, {
    boardId: B("patong"),
    name: "งานเลยกำหนดทั้งบอร์ด",
    scope: "BOARD",
    config: { view: "table", filters: { due: "overdue" }, sort: "due" },
  });
  KB25.viewId = view.id as string;
  console.log(`🧪 เตรียม K2.5: สร้างมุมมอง 'ทั้งทีม' ${KB25.viewId} (ตาราง · เลยกำหนด · เรียงวันที่) บนบอร์ดป่าตอง`);
}

// ── K2.6: สร้างฟิลด์กำหนดเอง 2 ตัว (งบประมาณ NUMBER · ความสำคัญ SELECT ทั้งคู่ showOnCard) บนบอร์ดป่าตอง
//    แล้วตั้งค่าให้การ์ด #7 (cardIds[6] — ใบเดียวกับที่ K1.6/K1.9 ใช้) ผ่าน `fields.ts` ตรง ๆ ก่อนถ่าย
//    (เหตุผลเดียวกับ KB25: `*Action` เรียก revalidatePath ชนจังหวะ puppeteer ตอนเปิดหลังการ์ดซ้ำ)
//    ⚠️ ใช้ actor = owner (ADMIN ทุกบอร์ด) ไม่ใช่ thana — บอร์ดป่าตองเป็น PRIVATE ผูกสาขาป่าตอง thana ไม่มี
//    สิทธิ์ EDITOR ที่นี่โดยนัย (เหมือนที่ K1.3-S2.3 ยืนยันไว้: STAFF ที่ไม่ใช่สมาชิก = มองไม่เห็นบอร์ด PRIVATE เลย)
const KB26 = { budgetFieldId: "", importanceFieldId: "" };
if (WO === "2.6") {
  const fieldsSvc = (await import("@/lib/modules/kanban/fields" as string)) as Any;
  const membership = await prisma.membership.findFirst({
    where: { tenantId: E.tenantId, userId: E.users.owner.userId },
    select: { role: true, unitAccess: true, permissions: true },
  });
  const ownerActor = {
    userId: E.users.owner.userId as string,
    role: membership!.role,
    unitAccess: (membership!.unitAccess as string[] | null) ?? [],
    permissions: (membership!.permissions as Record<string, unknown> | null) ?? {},
  };
  const ctx26 = { tenantId: E.tenantId, systemId: SYS, actorUserId: E.users.owner.userId as string };
  const cardId = E.boards.patong.cardIds[6];
  // ลบเศษของรอบก่อนที่อาจค้าง (สคริปต์ล่ม/Ctrl-C ก่อนถึง finally)
  await (prisma as Any).kanbanCustomField.deleteMany({ where: { boardId: B("patong"), name: { in: ["งบประมาณ", "ความสำคัญ"] } } });
  const budget = await fieldsSvc.createField(ctx26, ownerActor, B("patong"), { name: "งบประมาณ", type: "NUMBER", showOnCard: true, options: { unit: "บาท" } });
  const importance = await fieldsSvc.createField(ctx26, ownerActor, B("patong"), { name: "ความสำคัญ", type: "SELECT", showOnCard: true, options: { choices: ["สูง", "กลาง", "ต่ำ"] } });
  KB26.budgetFieldId = budget.id as string;
  KB26.importanceFieldId = importance.id as string;
  await fieldsSvc.setCardFieldValue(ctx26, ownerActor, cardId, budget.id, 12500.5);
  await fieldsSvc.setCardFieldValue(ctx26, ownerActor, cardId, importance.id, "สูง");
  console.log(`🧪 เตรียม K2.6: สร้างฟิลด์ 'งบประมาณ'/'ความสำคัญ' + ตั้งค่าการ์ด ${cardId} บนบอร์ดป่าตอง (คืนสภาพหลังถ่ายเสร็จ)`);
}

// ── K2.7: บันทึกการ์ด #7 (cardIds[6]) เป็นเทมเพลต + ตั้งกำหนดส่งซ้ำของการ์ด #8 (cardIds[7]) ผ่าน
//    `card-templates.ts`/`recurrence.ts` ตรง ๆ ก่อนถ่าย (เหตุผลเดียวกับ KB25/KB26 — revalidatePath ของ
//    server action ชนจังหวะ puppeteer) — คืนสภาพทั้งคู่ใน restoreSeed()
const KB27 = { templateId: "", recurCardId: "", recurBefore: null as string | null, dueBefore: null as string | null };
// K2.12 ใช้เทมเพลตเดียวกัน (ปุ่ม "จากเทมเพลต ▾" บนมือถือ — หนี้ K2.7) ⇒ เตรียมของก้อนเดียวกัน
if (WO === "2.7" || WO === "2.12") {
  const ctSvc = (await import("@/lib/modules/kanban/card-templates" as string)) as Any;
  const recurSvc = (await import("@/lib/modules/kanban/recurrence" as string)) as Any;
  const membership = await prisma.membership.findFirst({
    where: { tenantId: E.tenantId, userId: E.users.owner.userId },
    select: { role: true, unitAccess: true, permissions: true },
  });
  const ownerActor = {
    userId: E.users.owner.userId as string,
    role: membership!.role,
    unitAccess: (membership!.unitAccess as string[] | null) ?? [],
    permissions: (membership!.permissions as Record<string, unknown> | null) ?? {},
  };
  const ctx27 = { tenantId: E.tenantId, systemId: SYS, actorUserId: E.users.owner.userId as string };
  // ลบเศษของรอบก่อนที่อาจค้าง (สคริปต์ล่ม/Ctrl-C ก่อนถึง finally)
  await (prisma as Any).kanbanCardTemplate.deleteMany({ where: { boardId: B("patong"), name: "ตรวจถังอากาศ (ภาพ)" } });
  const tpl = await ctSvc.saveAsCardTemplate(ctx27, ownerActor, E.boards.patong.cardIds[6], { name: "ตรวจถังอากาศ (ภาพ)" });
  KB27.templateId = tpl.id as string;

  const recurCardId = E.boards.patong.cardIds[7] as string;
  const before = await prisma.kanbanCard.findUnique({ where: { id: recurCardId }, select: { dueAt: true, recurrenceRule: true } });
  KB27.recurCardId = recurCardId;
  KB27.recurBefore = before?.recurrenceRule ?? null;
  KB27.dueBefore = before?.dueAt ? before.dueAt.toISOString() : null;
  let dueAtMs = before?.dueAt?.getTime();
  if (!dueAtMs) {
    dueAtMs = Date.now() + 3 * 86_400_000;
    await prisma.kanbanCard.update({ where: { id: recurCardId }, data: { dueAt: new Date(dueAtMs) } });
  }
  // BYDAY ต้องตรงกับวันของ dueAt จริง (แบบเดียวกับที่ CardBack.tsx คำนวณฝั่ง client) ไม่งั้นป้ายในดรอปดาวน์
  // (คำนวณจาก dueAt) กับคำอธิบายที่เก็บไว้ (คำนวณจาก rule) จะเป็นคนละวันกันในภาพ
  const WEEK_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;
  const weekdayCode = WEEK_CODES[new Date(dueAtMs + 7 * 3_600_000).getUTCDay()]!;
  await recurSvc.setCardRecurrence(ctx27, ownerActor, recurCardId, `FREQ=WEEKLY;BYDAY=${weekdayCode}`);
  console.log(`🧪 เตรียม K2.7: สร้างเทมเพลต '${tpl.name}' ${KB27.templateId} · ตั้งกำหนดส่งซ้ำการ์ด ${recurCardId} เป็น 'ทุกสัปดาห์ BYDAY=${weekdayCode}' (ตรงวันของ dueAt) บนบอร์ดป่าตอง`);
}

const KB28 = { itemIds: [] as string[] };
if (WO === "2.8") {
  const inboxSvc = (await import("@/lib/modules/kanban/inbox" as string)) as Any;
  const ctx28 = { tenantId: E.tenantId, systemId: SYS, actorUserId: E.users.owner.userId as string };
  // ลบเศษของรอบก่อนที่อาจค้าง (สคริปต์ล่ม/Ctrl-C ก่อนถึง finally)
  await (prisma as Any).kanbanInboxItem.deleteMany({
    where: { tenantId: E.tenantId, OR: [{ sourceKey: { startsWith: "qc-visual-kanban:" } }, { title: "ทดสอบจดงานเร็ว QC" }] },
  });
  const quick = await inboxSvc.quickAdd(ctx28, { title: "โทรยืนยันคิวซ่อมพรุ่งนี้" });
  const fromEmail = await inboxSvc.addFromSource(ctx28, {
    ownerUserId: E.users.owner.userId,
    source: "EMAIL",
    sourceKey: `qc-visual-kanban:${Date.now()}`,
    title: "ใบแจ้งหนี้ค่าอากาศอัดเดือนนี้",
    note: "AI สรุป: ยอด 4,200 บาท ครบกำหนด 15 นี้ — ตรวจแล้วส่งบัญชี",
  });
  KB28.itemIds = [quick.id as string, fromEmail.id as string];
  console.log(`🧪 เตรียม K2.8: กล่องงานเข้าของเจ้าของร้าน — จดเร็ว ${quick.id} · จากอีเมล (มีป้าย AI) ${fromEmail.id}`);
}

// ── K2.9: กฎตัวอย่าง 4 ใบ + บันทึกการทำงาน 3 แถวบนบอร์ดซ่อมบำรุง (ตารางในภาพ 08 ต้องไม่ว่าง)
//    สร้างผ่าน `automation.createRule` จริง (ผ่านด่านตรวจทุกชั้น) แล้วลบคืนใน `restoreSeed()`
const KB29 = { ruleIds: [] as string[] };
if (WO === "2.9") {
  const au = (await import("@/lib/modules/kanban/automation" as string)) as Any;
  const membership = await prisma.membership.findFirst({
    where: { tenantId: E.tenantId, userId: E.users.owner.userId },
    select: { role: true, unitAccess: true, permissions: true },
  });
  const ownerActor = {
    userId: E.users.owner.userId as string,
    role: membership!.role,
    unitAccess: (membership!.unitAccess as string[] | null) ?? [],
    permissions: (membership!.permissions as Record<string, unknown> | null) ?? {},
  };
  const ctx29 = { tenantId: E.tenantId, systemId: SYS, actorUserId: E.users.owner.userId as string };
  const board = B("maint");
  // เศษของรอบก่อน (สคริปต์ล่ม/Ctrl-C ก่อนถึง finally) — ลบทิ้งก่อน กันกฎซ้ำสะสมทุกรอบ
  const stale = await (prisma as Any).automationRule.findMany({ where: { boardId: board, name: { startsWith: "QC ภาพ:" } }, select: { id: true } });
  if (stale.length) {
    await (prisma as Any).automationRun.deleteMany({ where: { ruleId: { in: stale.map((r: Any) => r.id) } } });
    await (prisma as Any).automationRule.deleteMany({ where: { id: { in: stale.map((r: Any) => r.id) } } });
  }
  const cols = await prisma.kanbanColumn.findMany({
    where: { boardId: board, tenantId: E.tenantId, systemId: SYS, status: "ACTIVE" },
    orderBy: [{ position: { sort: "asc", nulls: "first" } }, { sortOrder: "asc" }],
    select: { id: true, name: true },
  });
  const label = await prisma.kanbanLabel.findFirst({ where: { boardId: board, tenantId: E.tenantId }, select: { id: true } });
  const specs: Any[] = [
    {
      boardId: board,
      name: "QC ภาพ: ย้ายเข้ากำลังซ่อม → ติดป้าย + แจ้งช่าง",
      kind: "RULE",
      event: "kanban.card.moved",
      conditions: [{ field: "column", op: "is", value: cols[1]?.id ?? cols[0]!.id }],
      actions: [
        ...(label ? [{ type: "add_label", params: { labelId: label.id } }] : []),
        { type: "notify", params: { to: "assignees", message: "การ์ด {ชื่อการ์ด} เข้าคิวซ่อมแล้ว" } },
      ],
    },
    {
      boardId: board,
      name: "QC ภาพ: ทุกวันจันทร์ 08:00 เปิดงานตรวจอุปกรณ์",
      kind: "SCHEDULED",
      scheduleCron: "0 8 * * 1",
      conditions: [],
      actions: [{ type: "create_card", params: { boardId: board, columnId: cols[0]!.id, title: "ตรวจอุปกรณ์ประจำสัปดาห์" } }],
    },
    {
      boardId: board,
      name: "QC ภาพ: 2 วันก่อนครบกำหนด → เตือนผู้รับผิดชอบ",
      kind: "DUE_DATE",
      dueOffsetDays: -2,
      conditions: [],
      actions: [{ type: "notify", params: { to: "assignees", message: "การ์ด {ชื่อการ์ด} ใกล้ครบกำหนดแล้ว" } }],
    },
    {
      boardId: board,
      name: "QC ภาพ: ส่งให้ช่างกิตติ",
      kind: "CARD_BUTTON",
      conditions: [],
      actions: [{ type: "assign", params: { userId: E.users.staff.kitti.userId } }],
    },
  ];
  for (const spec of specs) {
    const row = await au.createRule(ctx29, ownerActor, spec);
    KB29.ruleIds.push(row.id as string);
  }
  // บันทึกการทำงานตัวอย่าง (แผงขวาในภาพ 08 มีทั้ง OK และ "ล้ม") — เขียนตรงเพราะเป็น "ประวัติ" ไม่ใช่การลงมือจริง
  const P29 = prisma as Any;
  await P29.automationRun.createMany({
    data: [
      { tenantId: E.tenantId, ruleId: KB29.ruleIds[0], boardId: board, cardId: E.boards.maint.cardIds[0], status: "OK", detail: null },
      { tenantId: E.tenantId, ruleId: KB29.ruleIds[2], boardId: board, cardId: E.boards.maint.cardIds[1], status: "OK", detail: "due:2026-09-29" },
      { tenantId: E.tenantId, ruleId: KB29.ruleIds[1], boardId: board, cardId: null, status: "FAILED", detail: "การกระทำที่ 1 (ยิงเว็บฮุค): ปลายทางตอบรหัส 500" },
    ],
  });
  console.log(`🧪 เตรียม K2.9: กฎตัวอย่าง ${KB29.ruleIds.length} ใบ + บันทึกการทำงาน 3 แถวบนบอร์ดซ่อมบำรุง (ลบคืนหลังถ่ายเสร็จ)`);
}

// ── K2.11: ให้เจ้าของร้าน "ติดตาม" การ์ด 1 ใบ + คอลัมน์ 1 คอลัมน์ (บล็อก "ที่ฉันติดตาม" ต้องไม่ว่าง)
//    เขียนผ่าน `watch.watch()` จริง (ผ่านด่านสิทธิ์ทุกชั้น) แล้วลบคืนใน `restoreSeed()`
const KB211 = { watcherUserId: "" };
if (WO === "2.11") {
  const w = (await import("@/lib/modules/kanban/watch" as string)) as Any;
  const membership = await prisma.membership.findFirst({
    where: { tenantId: E.tenantId, userId: E.users.owner.userId },
    select: { role: true, unitAccess: true, permissions: true },
  });
  const ownerActor = {
    userId: E.users.owner.userId as string,
    role: membership!.role,
    unitAccess: (membership!.unitAccess as string[] | null) ?? [],
    permissions: (membership!.permissions as Record<string, unknown> | null) ?? {},
  };
  const ctx211 = { tenantId: E.tenantId, systemId: SYS, actorUserId: E.users.owner.userId as string };
  const col = await prisma.kanbanColumn.findFirst({
    where: { boardId: B("maint"), tenantId: E.tenantId, systemId: SYS, status: "ACTIVE" },
    orderBy: [{ position: { sort: "asc", nulls: "first" } }, { sortOrder: "asc" }],
    select: { id: true, name: true },
  });
  await w.watch(ctx211, ownerActor, { targetType: "CARD", targetId: (E.boards.patong.cardIds as string[])[2] });
  if (col) await w.watch(ctx211, ownerActor, { targetType: "COLUMN", targetId: col.id });
  KB211.watcherUserId = ownerActor.userId;
  console.log(`🧪 เตรียม K2.11: เจ้าของร้านติดตามการ์ด ${(E.boards.patong.cardIds as string[])[2]} + คอลัมน์ '${col?.name ?? "-"}' (ลบคืนหลังถ่ายเสร็จ)`);
}

// ── K3.1: ผูก "เชื่อมข้อมูล SHARK" ตัวอย่างให้การ์ดใบแรกของบอร์ดซ่อมบำรุง (ผู้ติดต่อ + ลิงก์ภายนอก)
//    เขียนผ่าน `links.addLink()` จริง (ผ่านด่านสิทธิ์ทุกชั้น) แล้วลบคืนใน `restoreSeed()`
const KB31 = { partyId: "" };
if (WO === "3.1") {
  const lk = (await import("@/lib/modules/kanban/links" as string)) as Any;
  const party = (await import("@/lib/modules/party" as string)) as Any;
  const ctx31 = { tenantId: E.tenantId, systemId: SYS, actorUserId: E.users.owner.userId as string };
  const partyId: string | null = await party.safeFindOrCreate(E.tenantId, { name: "คุณสมชาย ใจดี (ลูกค้า)", phone: "0812345678" });
  if (partyId) {
    KB31.partyId = partyId;
    await lk.addLink(ctx31, KB31_CARD, { linkType: "PARTY", linkId: partyId, role: "RELATED" });
  }
  await lk.addLink(ctx31, KB31_CARD, {
    linkType: "URL",
    linkId: "https://example.com/manual/regulator-service.pdf",
    label: "คู่มือส่งซ่อมเรกูเลเตอร์",
  });
  // K3.1: ธนา (มีแค่คีย์ kanban.card.*) ต้องเปิดหลังการ์ดได้จริงหลังแก้ assertKanbanCan → canReadKanban (ไม่เติมคีย์ชั่วคราวแล้ว)
  console.log(`🧪 เตรียม K3.1: ผูกผู้ติดต่อ + ลิงก์ภายนอกกับการ์ด ${KB31_CARD} (ลบคืนหลังถ่ายเสร็จ)`);
}

async function restoreSeed(): Promise<void> {
  // K3.2 — ลบการ์ด/ผู้ติดต่อ/ไฟล์ที่เกิดจากการกด "สร้างการ์ด" จริงระหว่างถ่าย · ลบระบบแชทชั่วคราว ·
  //        คืนค่า `AppSystem.settings` ของระบบ KANBAN (สวิตช์ต้องกลับไปปิดเหมือนก่อนถ่าย)
  if (WO === "3.2") {
    const P = prisma as Any;
    const cards = await prisma.kanbanCard.findMany({
      where: { tenantId: E.tenantId, sourceType: "CHAT" as Any, sourceKey: { startsWith: `chat:conv:${KB32.conversationId}` } } as Any,
      select: { id: true },
    });
    const ids = cards.map((c) => c.id);
    if (ids.length) {
      const partyLinks = await P.kanbanCardLink.findMany({ where: { cardId: { in: ids }, linkType: "PARTY" as Any }, select: { linkId: true } });
      KB32.partyIds = partyLinks.map((l: Any) => String(l.linkId));
      const atts = await P.kanbanAttachment.findMany({ where: { cardId: { in: ids } }, select: { fileId: true } });
      await P.kanbanCardLink.deleteMany({ where: { cardId: { in: ids } } }).catch(() => null);
      await P.kanbanAttachment.deleteMany({ where: { cardId: { in: ids } } }).catch(() => null);
      if (atts.length) await prisma.fileAsset.deleteMany({ where: { id: { in: atts.map((a: Any) => String(a.fileId)) } } }).catch(() => null);
      await P.kanbanChecklistItem.deleteMany({ where: { checklist: { cardId: { in: ids } } } }).catch(() => null);
      await P.kanbanChecklist.deleteMany({ where: { cardId: { in: ids } } }).catch(() => null);
      await prisma.kanbanActivity.deleteMany({ where: { cardId: { in: ids } } }).catch(() => null);
      await prisma.kanbanCard.deleteMany({ where: { id: { in: ids } } });
      if (KB32.partyIds.length) await prisma.party.deleteMany({ where: { id: { in: KB32.partyIds } } }).catch(() => null);
    }
    if (KB32.chatSystemId) await wipeChatSystem(KB32.chatSystemId);
    if (KB32.settingsBefore !== null) {
      await prisma.appSystem.update({ where: { id: SYS }, data: { settings: KB32.settingsBefore as Any } }).catch(() => null);
    }
    await prisma.outboxEvent.deleteMany({ where: { tenantId: E.tenantId, createdAt: { gte: new Date(Date.now() - 30 * 60_000) }, type: { startsWith: "kanban.card" } } }).catch(() => null);
    await prisma.appNotification.deleteMany({ where: { tenantId: E.tenantId, createdAt: { gte: new Date(Date.now() - 30 * 60_000) } } }).catch(() => null);
    console.log(`🧹 คืนสภาพ K3.2: ลบการ์ดที่สร้างจากแชท ${ids.length} ใบ · ผู้ติดต่อ ${KB32.partyIds.length} · ลบระบบแชทชั่วคราว · คืนค่าสวิตช์การเชื่อมต่อ`);
  }

  // K3.1 — ลบแถวเชื่อม + ประวัติ LINK_* ที่สร้างไว้ถ่ายภาพ แล้วลบผู้ติดต่อตัวอย่าง
  if (WO === "3.1") {
    const P = prisma as Any;
    const links = await P.kanbanCardLink.deleteMany({ where: { cardId: KB31_CARD } });
    const acts = await prisma.kanbanActivity.deleteMany({
      where: { cardId: KB31_CARD, type: { in: ["LINK_ADDED", "LINK_REMOVED"] as Any } },
    });
    if (KB31.partyId) await prisma.party.deleteMany({ where: { id: KB31.partyId } }).catch(() => null);
    console.log(`🧹 คืนสภาพ K3.1: ลบแถวเชื่อม ${links.count} · ประวัติ ${acts.count} · ผู้ติดต่อตัวอย่าง`);
  }

  // K2.11 — ลบแถวติดตามที่สร้างไว้ถ่ายภาพ (รวมที่กดผ่านหน้าเว็บระหว่างถ่าย)
  if (WO === "2.11" && KB211.watcherUserId) {
    const del = await (prisma as Any).kanbanWatcher.deleteMany({ where: { tenantId: E.tenantId, userId: KB211.watcherUserId } });
    console.log(`🧹 คืนสภาพ K2.11: ลบแถวติดตาม ${del.count} แถว`);
  }

  // K2.9 — ลบกฎตัวอย่าง + บันทึกการทำงานที่สร้างไว้ถ่ายภาพ (รวมแถวที่กฎอาจเขียนเพิ่มระหว่างถ่าย)
  if (WO === "2.9" && KB29.ruleIds.length > 0) {
    const P = prisma as Any;
    const runs = await P.automationRun.deleteMany({ where: { ruleId: { in: KB29.ruleIds } } });
    const rules = await P.automationRule.deleteMany({ where: { id: { in: KB29.ruleIds } } });
    console.log(`🧹 คืนสภาพ K2.9: ลบกฎ ${rules.count} ใบ + บันทึกการทำงาน ${runs.count} แถว`);
  }

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

  // K2.3 — คืนสภาพ seed: สเปค `timeline-resize-after` ลากแฮนเดิลของแถบแรกผ่าน server action จริง (ทริป dueAt
  // ลง DB จริง) — ไม่รู้ล่วงหน้าว่าโดนใบไหน จึงคืน startAt/dueAt ของ "ทุกใบ" บนบอร์ดป่าตองให้ตรงกับที่จำไว้
  if (WO === "2.3" && KB23.length > 0) {
    let restored = 0;
    for (const c of KB23) {
      await prisma.kanbanCard.updateMany({
        where: { id: c.cardId },
        data: { startAt: c.startAt ? new Date(c.startAt) : null, dueAt: c.dueAt ? new Date(c.dueAt) : null, reminderSentAt: null },
      });
      restored += 1;
    }
    const P = prisma as Any;
    const ac = await P.kanbanActivity.deleteMany({
      where: { cardId: { in: KB23.map((c) => c.cardId) }, type: "CARD_DUE_SET", createdAt: { gte: new Date(Date.now() - 10 * 60_000) } },
    });
    console.log(`🧹 คืนสภาพ K2.3: คืน startAt/dueAt ของการ์ดบอร์ดป่าตอง ${restored} ใบ · ลบกิจกรรม CARD_DUE_SET ที่เพิ่งเกิด ${ac.count}`);
  }

  // K2.5 — คืนสภาพ seed: ลบมุมมอง "ทั้งทีม" ที่สร้างไว้ก่อนถ่าย (ผ่าน `views.saveView` ตรง ๆ — ดู KB25 ด้านบน)
  if (WO === "2.5" && KB25.viewId) {
    const P = prisma as Any;
    const del = await P.kanbanBoardView.deleteMany({ where: { id: KB25.viewId } });
    console.log(`🧹 คืนสภาพ K2.5: ลบมุมมอง ${KB25.viewId} (${del.count} แถว)`);
  }

  // K2.6 — คืนสภาพ seed: ลบฟิลด์กำหนดเอง 2 ตัวที่สร้างไว้ก่อนถ่าย (ค่าของการ์ด cascade ไปด้วย FK) +
  // ลบกิจกรรม BOARD_UPDATED/CARD_UPDATED ที่เพิ่งเกิดจากการเตรียม/คืนสภาพเอง
  if (WO === "2.6" && (KB26.budgetFieldId || KB26.importanceFieldId)) {
    const P = prisma as Any;
    const del = await P.kanbanCustomField.deleteMany({ where: { id: { in: [KB26.budgetFieldId, KB26.importanceFieldId].filter(Boolean) } } });
    const ac = await P.kanbanActivity.deleteMany({ where: { boardId: B("patong"), createdAt: { gte: new Date(Date.now() - 10 * 60_000) }, type: { in: ["BOARD_UPDATED", "CARD_UPDATED"] } } });
    console.log(`🧹 คืนสภาพ K2.6: ลบฟิลด์กำหนดเอง ${del.count} ตัว (ค่าการ์ด cascade) · ลบกิจกรรม ${ac.count}`);
  }

  // K2.7/K2.12 — คืนสภาพ seed: ลบเทมเพลตที่บันทึกไว้ก่อนถ่าย · คืน dueAt/recurrenceRule เดิมของการ์ดที่ใช้ตั้งกำหนดส่งซ้ำ
  if ((WO === "2.7" || WO === "2.12") && (KB27.templateId || KB27.recurCardId)) {
    const P = prisma as Any;
    if (KB27.templateId) {
      const del = await P.kanbanCardTemplate.deleteMany({ where: { id: KB27.templateId } });
      console.log(`🧹 คืนสภาพ K2.7: ลบเทมเพลต ${KB27.templateId} (${del.count} แถว)`);
    }
    if (KB27.recurCardId) {
      await P.kanbanCard.updateMany({
        where: { id: KB27.recurCardId },
        data: { recurrenceRule: KB27.recurBefore, dueAt: KB27.dueBefore ? new Date(KB27.dueBefore) : null },
      });
      console.log(`🧹 คืนสภาพ K2.7: คืน dueAt/recurrenceRule ของการ์ด ${KB27.recurCardId} เป็นค่าเดิม`);
    }
    const ac = await P.kanbanActivity.deleteMany({
      where: { boardId: B("patong"), createdAt: { gte: new Date(Date.now() - 10 * 60_000) }, type: { in: ["BOARD_UPDATED", "CARD_UPDATED"] } },
    });
    console.log(`🧹 คืนสภาพ K2.7: ลบกิจกรรมที่เพิ่งเกิด ${ac.count}`);
  }

  // K2.8 — คืนสภาพ seed: ลบรายการกล่องงานเข้าที่เตรียมไว้ก่อนถ่าย + รายการที่สเปค "inbox-quick-add" จดจริงผ่านหน้าเว็บ
  if (WO === "2.8") {
    const P = prisma as Any;
    const where = KB28.itemIds.length
      ? { OR: [{ id: { in: KB28.itemIds } }, { tenantId: E.tenantId, title: "ทดสอบจดงานเร็ว QC" }] }
      : { tenantId: E.tenantId, title: "ทดสอบจดงานเร็ว QC" };
    const del = await P.kanbanInboxItem.deleteMany({ where });
    console.log(`🧹 คืนสภาพ K2.8: ลบรายการกล่องงานเข้าที่ใช้ถ่ายภาพ ${del.count} แถว`);
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
      if (spec.before) await spec.before();
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
            } else if ("dragBy" in step) {
              // K2.3 — ลากตามระยะพิกเซล dx/dy จากกึ่งกลาง element (แฮนเดิลลากขอบ/ตัวแถบไทม์ไลน์)
              const el = await page.$(step.dragBy.on);
              if (!el) throw new Error(`ไม่พบ element สำหรับลาก ${step.dragBy.on}`);
              const bb = (await el.boundingBox())!;
              const sx = bb.x + bb.width / 2, sy = bb.y + bb.height / 2;
              const dx = step.dragBy.dx, dy = step.dragBy.dy ?? 0;
              await page.mouse.move(sx, sy); await page.mouse.down();
              await new Promise((r) => setTimeout(r, 250));
              const n = step.dragBy.steps ?? 10;
              for (let i = 1; i <= n; i++) { await page.mouse.move(sx + (dx * i) / n, sy + (dy * i) / n); await new Promise((r) => setTimeout(r, 30)); }
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
