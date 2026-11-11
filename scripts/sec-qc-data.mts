// sec-qc-data.mts — สัญญาข้อมูล QC ของ RUN "เลขา AI" (ใบ S0.3) · `SEC`
//
// แหล่งเดียวของ id · slug · อีเมล · สิทธิ์ · ห้องตัวอย่าง — seed / ข้อสอบ qc-sec-* / fixture แอป อ่านจากที่นี่ที่เดียว
// ที่มา: ledger/secretary-briefs/sec-brief-S0.3.md (Deliverable 3) · RESOLUTIONS R-K1 R-K11 R-K14 · docs/modules/31-secretary.md §1 §7
//
// 🔴 ไฟล์นี้เป็นค่าล้วน — ห้าม import อะไร (fitness/ข้อสอบ static ต้อง import ได้โดยไม่มี env)
// 🔴 ทุก id ขึ้นต้น `secqc-` · อีเมลเป็น @example.com · เบอร์เป็นเลขปลอม +668000000xx (ห้ามใส่ข้อมูลจริง)
// 🔴 id ห้อง AI ไม่อยู่ที่นี่ — seed ออกด้วย newConversationId (รูป u~<userId>~<สุ่ม>) แล้วจับคู่ห้องเดิมด้วย (ผู้สร้าง + ชื่อห้อง)
// 🔴 ค่าที่ "ยังไม่มีตาราง/คอลัมน์" (เบอร์ · สถานะห้อง · สมาชิกห้อง · งานในคิว · เลขา) เก็บไว้ใน `pending` —
//    ใบที่สร้างตารางนั้น (S1.1 migration · S1.4 ห้อง · S1.5 คิว · S1.6 ห้องร่วม · S1.19 เบอร์) ย้ายลงฐานเอง · seed ใบนี้ไม่เขียน

export const SEC_TAG = "secqc";

// ═══════════════ ร้าน ═══════════════
export const SEC_TENANT = { id: "secqc-tenant", slug: "sec-qc", name: "Sec QC Café" } as const;
/** ร้าน B — เจ้าของคนละคน (ข้อสอบข้ามร้าน · A6 กล่องรวมข้ามกิจการ) */
export const SEC_TENANT_B = { id: "secqc-tenant-b", slug: "sec-qc-b", name: "Sec QC Bistro" } as const;
export const SEC_TENANT_IDS = [SEC_TENANT.id, SEC_TENANT_B.id] as const;

export type SecSystemType = "POS" | "CRM" | "MEMBER" | "ACCOUNT" | "KANBAN" | "CHAT";
/** ระบบของร้าน A — แถว AppSystem ล้วน (ไม่ provision ข้อมูลภายในระบบ) */
export const SEC_SYSTEMS: Record<SecSystemType, { id: string; type: SecSystemType; name: string }> = {
  POS: { id: "secqc-sys-pos", type: "POS", name: "ขายหน้าร้าน (Sec QC)" },
  CRM: { id: "secqc-sys-crm", type: "CRM", name: "ลูกค้าสัมพันธ์ (Sec QC)" },
  MEMBER: { id: "secqc-sys-member", type: "MEMBER", name: "สมาชิก (Sec QC)" },
  ACCOUNT: { id: "secqc-sys-account", type: "ACCOUNT", name: "บัญชี (Sec QC)" },
  KANBAN: { id: "secqc-sys-kanban", type: "KANBAN", name: "บอร์ดงาน (Sec QC)" },
  CHAT: { id: "secqc-sys-chat", type: "CHAT", name: "แชทลูกค้า (Sec QC)" },
};

// ═══════════════ ผู้ใช้ + สิทธิ์ ═══════════════
export type SecRole = "OWNER" | "MANAGER" | "STAFF";
export type SecUser = {
  key: "owner" | "manager" | "sales" | "dorm" | "guard" | "ownerB";
  userId: string;
  membershipId: string;
  tenantId: string;
  email: string;
  name: string;
  role: SecRole;
  unitAccess: readonly string[];
  permissions: Record<string, boolean>;
};

/**
 * ร้าน A: เจ้าของ · ผู้จัดการ · พนักงาน 3 คน
 *   sales = เห็น+ตอบแชทลูกค้าได้ (`chat.conversation.read` + `chat.message.send` — R-K14)
 *   dorm  = ใช้เลขาได้ + สร้างการ์ดบอร์ดงาน · ไม่มีสิทธิ์แชท
 *   guard = ยาม — ใช้เลขาได้อย่างเดียว · **ไม่มีคีย์ chat.* เลย** (คำถามเจ้าของเรื่อง "ยาม" 4 พ.ย. · ไอคอนลูกค้าไม่แสดง)
 */
export const SEC_USERS: SecUser[] = [
  { key: "owner", userId: "secqc-owner", membershipId: "secqc-m-owner", tenantId: SEC_TENANT.id, email: "secqc-owner@example.com", name: "คุณสุข (เจ้าของ)", role: "OWNER", unitAccess: ["*"], permissions: {} },
  { key: "manager", userId: "secqc-manager", membershipId: "secqc-m-manager", tenantId: SEC_TENANT.id, email: "secqc-manager@example.com", name: "คุณมานี (ผู้จัดการ)", role: "MANAGER", unitAccess: ["*"], permissions: {} },
  {
    key: "sales",
    userId: "secqc-staff-sales",
    membershipId: "secqc-m-staff-sales",
    tenantId: SEC_TENANT.id,
    email: "secqc-staff-sales@example.com",
    name: "น้องขาย (ฝ่ายขาย)",
    role: "STAFF",
    unitAccess: ["*"],
    permissions: { "ai.chat.send": true, "chat.conversation.read": true, "chat.message.send": true, "kanban.card.create": true },
  },
  {
    key: "dorm",
    userId: "secqc-staff-dorm",
    membershipId: "secqc-m-staff-dorm",
    tenantId: SEC_TENANT.id,
    email: "secqc-staff-dorm@example.com",
    name: "พี่หอ (ดูแลหอ)",
    role: "STAFF",
    unitAccess: ["*"],
    permissions: { "ai.chat.send": true, "kanban.card.create": true },
  },
  { key: "guard", userId: "secqc-staff-guard", membershipId: "secqc-m-staff-guard", tenantId: SEC_TENANT.id, email: "secqc-staff-guard@example.com", name: "ลุงยาม (รปภ.)", role: "STAFF", unitAccess: ["*"], permissions: { "ai.chat.send": true } },
  { key: "ownerB", userId: "secqc-owner-b", membershipId: "secqc-m-owner-b", tenantId: SEC_TENANT_B.id, email: "secqc-owner-b@example.com", name: "คุณบี (เจ้าของร้าน B)", role: "OWNER", unitAccess: ["*"], permissions: {} },
];
export const SEC_EMAILS = SEC_USERS.map((u) => u.email);
/** acceptedAt/invitedAt ตายตัว (รันซ้ำไม่ขยับ) */
export const SEC_ACCEPTED_AT = "2026-11-01T02:00:00.000Z";

// ═══════════════ ห้องงาน AI (6 ห้อง · สถานะครบ) ═══════════════
export type SecRoomState = "open" | "running" | "waiting" | "done";
export type SecRoomMsg = { role: "USER" | "ASSISTANT"; content: string; at: string };
export type SecRoomSpec = {
  key: "open" | "running" | "waiting" | "done" | "sales" | "shared";
  ownerUserId: string;
  title: string;
  state: SecRoomState;
  messages: SecRoomMsg[];
};
/**
 * 🔴 ชื่อห้อง (`title`) = กุญแจจับคู่ห้องเดิม (คู่กับผู้สร้างในรหัสห้อง) — ห้ามซ้ำในผู้สร้างเดียวกัน
 *    แก้ชื่อห้องที่นี่ = seed รอบหน้าสร้างห้องใหม่และลบห้องเดิม (ห้องเกินของร้าน secqc)
 */
export const SEC_ROOMS: SecRoomSpec[] = [
  {
    key: "open",
    ownerUserId: "secqc-owner",
    title: "สรุปยอดขายเมื่อวาน",
    state: "open",
    messages: [
      { role: "USER", content: "สรุปยอดขายเมื่อวานให้หน่อย", at: "2026-11-03T02:00:00.000Z" },
      { role: "ASSISTANT", content: "ยอดขายเมื่อวานรวม 12,480 บาท จาก 46 บิล สูงกว่าวันก่อนหน้า 8% ครับ", at: "2026-11-03T02:00:20.000Z" },
    ],
  },
  {
    key: "running",
    ownerUserId: "secqc-owner",
    title: "ตามลูกค้าที่เงียบเกิน 30 วัน",
    state: "running",
    messages: [{ role: "USER", content: "หาลูกค้าที่ไม่มาเกิน 30 วัน แล้วร่างข้อความชวนกลับมาให้ด้วย", at: "2026-11-04T01:00:00.000Z" }],
  },
  {
    key: "waiting",
    ownerUserId: "secqc-owner",
    title: "สร้างการ์ดสั่งเมล็ดกาแฟ",
    state: "waiting",
    messages: [
      { role: "USER", content: "เปิดการ์ดในบอร์ดงาน: สั่งเมล็ดกาแฟเพิ่ม 5 กิโล", at: "2026-11-04T01:10:00.000Z" },
      { role: "ASSISTANT", content: "ร่างการ์ด \"สั่งเมล็ดกาแฟเพิ่ม 5 กก.\" ไว้แล้ว รออนุมัติครับ", at: "2026-11-04T01:10:15.000Z" },
    ],
  },
  {
    key: "done",
    ownerUserId: "secqc-owner",
    title: "ตั้งการ์ดเช็กเครื่องชง",
    state: "done",
    messages: [
      { role: "USER", content: "เปิดการ์ด: เช็กเครื่องชงประจำเดือน", at: "2026-11-02T03:00:00.000Z" },
      { role: "ASSISTANT", content: "สร้างการ์ด \"เช็กเครื่องชงประจำเดือน\" แล้วครับ", at: "2026-11-02T03:05:00.000Z" },
    ],
  },
  {
    key: "sales",
    ownerUserId: "secqc-staff-sales",
    title: "ร่างใบเสนอราคากาแฟสำนักงาน",
    state: "open",
    messages: [
      { role: "USER", content: "ร่างใบเสนอราคากาแฟสำนักงาน 20 ถุงให้ลูกค้าบริษัท", at: "2026-11-04T02:00:00.000Z" },
      { role: "ASSISTANT", content: "ร่างใบเสนอราคา 20 ถุงไว้แล้ว ต้องการส่งทาง LINE ด้วยไหมครับ", at: "2026-11-04T02:00:30.000Z" },
    ],
  },
  {
    key: "shared",
    ownerUserId: "secqc-owner",
    title: "วางแผนโปรวันแม่ร่วมกับฝ่ายขาย",
    state: "open",
    messages: [
      { role: "USER", content: "ช่วยวางแผนโปรวันแม่ ให้ฝ่ายขายดูด้วย", at: "2026-11-04T03:00:00.000Z" },
      { role: "ASSISTANT", content: "เสนอ 3 โปร: ลด 10% เมนูชุด · แถมคุกกี้ · สะสมแต้มสองเท่า ครับ", at: "2026-11-04T03:00:40.000Z" },
    ],
  },
];

/** ข้อเสนอ — kind ต้องมีอยู่ใน KIND_ACCESS ของ proposals.ts · PENDING หมดอายุ = seed ต่ออายุ (expiresAt ≥ ตอนรัน + 1 ชม.) */
export const SEC_PROPOSALS = [
  {
    id: "secqc-prop-waiting",
    roomKey: "waiting",
    kind: "kanban_create_card",
    summary: "สร้างการ์ด \"สั่งเมล็ดกาแฟเพิ่ม 5 กก.\" ในบอร์ดงาน",
    payload: { title: "สั่งเมล็ดกาแฟเพิ่ม 5 กก." },
    status: "PENDING",
    createdAt: "2026-11-04T01:10:15.000Z",
  },
  {
    id: "secqc-prop-done",
    roomKey: "done",
    kind: "kanban_create_card",
    summary: "สร้างการ์ด \"เช็กเครื่องชงประจำเดือน\"",
    payload: { title: "เช็กเครื่องชงประจำเดือน" },
    status: "EXECUTED",
    resultNote: "สร้างการ์ดแล้ว",
    executedAt: "2026-11-02T03:05:00.000Z",
    expiresAt: "2026-11-03T03:00:00.000Z",
    createdAt: "2026-11-02T03:00:10.000Z",
  },
] as const;
/** อายุข้อเสนอ PENDING ตอนต่ออายุ (= TTL 24 ชม. ของ proposals.ts) · ต่ออายุเมื่อเหลือ < 1 ชม. */
export const SEC_PROPOSAL_TTL_MS = 24 * 3_600_000;
export const SEC_PROPOSAL_MIN_LEFT_MS = 3_600_000;

// ═══════════════ แชทลูกค้า (ระบบ CHAT ของร้าน A) ═══════════════
export type SecChatMsg = { id: string; direction: "IN" | "OUT"; body: string; isInternal: boolean; senderUserId: string | null; at: string };
export type SecChat = {
  id: string;
  channel: "LINE" | "WEBCHAT";
  contact: { id: string; externalUserId: string; displayName: string };
  assigneeUserId: string | null;
  messages: SecChatMsg[];
};
/**
 * 2 ห้อง (LINE + เว็บแชท) · ห้องละ 4 ข้อความ · มีบันทึกภายใน (isInternal) ห้องละ 1
 * ผู้ติดต่อ LINE: contact อย่างเดียว (`linkCustomer` ไม่บังคับมี party — ไม่ผูก CRM ในใบนี้) · ไม่มีแถวการเชื่อม LINE (ไม่มี credentials ใน QC)
 */
export const SEC_CHATS: SecChat[] = [
  {
    id: "secqc-chat-line",
    channel: "LINE",
    contact: { id: "secqc-contact-line", externalUserId: "secqc-line-user-1", displayName: "คุณแอน (LINE)" },
    assigneeUserId: "secqc-staff-sales",
    messages: [
      { id: "secqc-chat-line-m1", direction: "IN", body: "สวัสดีค่ะ มีเมล็ดกาแฟคั่วกลางขายไหมคะ", isInternal: false, senderUserId: null, at: "2026-11-04T04:00:00.000Z" },
      { id: "secqc-chat-line-m2", direction: "OUT", body: "มีครับ ถุงละ 350 บาท สนใจกี่ถุงครับ", isInternal: false, senderUserId: "secqc-staff-sales", at: "2026-11-04T04:02:00.000Z" },
      { id: "secqc-chat-line-m3", direction: "OUT", body: "ลูกค้าเคยสั่งเมื่อเดือนก่อน — ให้ส่วนลดลูกค้าเก่าได้", isInternal: true, senderUserId: "secqc-manager", at: "2026-11-04T04:03:00.000Z" },
      { id: "secqc-chat-line-m4", direction: "IN", body: "เอา 2 ถุงค่ะ ส่งใบเสนอราคาให้หน่อยได้ไหมคะ", isInternal: false, senderUserId: null, at: "2026-11-04T04:05:00.000Z" },
    ],
  },
  {
    id: "secqc-chat-web",
    channel: "WEBCHAT",
    contact: { id: "secqc-contact-web", externalUserId: "secqc-web-guest-1", displayName: "ผู้เยี่ยมชมเว็บ" },
    assigneeUserId: null,
    messages: [
      { id: "secqc-chat-web-m1", direction: "IN", body: "ร้านเปิดกี่โมงครับ", isInternal: false, senderUserId: null, at: "2026-11-04T05:00:00.000Z" },
      { id: "secqc-chat-web-m2", direction: "OUT", body: "เปิด 7:00–18:00 ทุกวันครับ", isInternal: false, senderUserId: "secqc-owner", at: "2026-11-04T05:01:00.000Z" },
      { id: "secqc-chat-web-m3", direction: "OUT", body: "ถามเรื่องที่จอดรถบ่อย — เพิ่มในตอบเร็ว", isInternal: true, senderUserId: "secqc-owner", at: "2026-11-04T05:02:00.000Z" },
      { id: "secqc-chat-web-m4", direction: "IN", body: "มีที่จอดรถไหมครับ", isInternal: false, senderUserId: null, at: "2026-11-04T05:03:00.000Z" },
    ],
  },
];

export const SEC_QUICK_REPLIES = [
  { id: "secqc-qr-hours", shortcut: "hours", title: "เวลาเปิดร้าน", body: "ร้านเปิด 7:00–18:00 ทุกวันครับ" },
  { id: "secqc-qr-parking", shortcut: "parking", title: "ที่จอดรถ", body: "มีที่จอดรถหน้าร้าน 4 คันครับ" },
] as const;

// ═══════════════ ช่วยเหลือ (Support Desk) ═══════════════
export const SEC_CASE = {
  id: "secqc-case-1",
  caseNo: 1,
  openedByUserId: "secqc-owner",
  subject: "เลขาสร้างการ์ดผิดบอร์ด",
  status: "OPEN",
  message: { id: "secqc-case-1-m1", body: "สั่งให้สร้างการ์ดในบอร์ดสต็อก แต่ไปอยู่บอร์ดทั่วไป", at: "2026-11-04T06:00:00.000Z" },
} as const;

// ═══════════════ ค่าที่รอตาราง (ใบหลังย้ายลงฐาน) ═══════════════
export const SEC_PENDING = {
  /** UserPhone (S1.1 ตาราง · S1.19 ยืนยันด้วย SMS) — เบอร์ปลอม E.164 */
  phones: {
    "secqc-owner": "+66800000001",
    "secqc-manager": "+66800000002",
    "secqc-staff-sales": "+66800000003",
    "secqc-staff-dorm": "+66800000004",
    "secqc-staff-guard": "+66800000005",
    "secqc-owner-b": "+66800000006",
  } as Record<string, string>,
  /** AiSecretary (S1.2) — ผู้ใช้ทุกคนได้ค่าเริ่มต้น Shark/ครับ/polite/["th"] · ยกเว้นนี้ */
  secretaries: { "secqc-staff-sales": { name: "น้องฉลาม", suffix: "ค่ะ", tone: "friendly", languages: ["th", "en"] } } as Record<string, { name: string; suffix: string; tone: string; languages: string[] }>,
  /** AiRoom/AiRoomJob/AiRoomMember (S1.4–S1.6) — เจตนาต่อห้อง (key ตาม SEC_ROOMS) */
  rooms: {
    open: { systems: ["POS"] },
    running: { systems: ["CRM", "MEMBER"], job: { status: "RUNNING" } },
    waiting: { systems: ["KANBAN"] },
    done: { systems: ["KANBAN"], closedAt: "2026-11-02T03:06:00.000Z" },
    sales: { systems: ["ACCOUNT", "CHAT"] },
    shared: { systems: ["POS", "MEMBER"], members: [{ userId: "secqc-staff-sales", seeHistory: false, addedAt: "2026-11-04T03:10:00.000Z" }] },
  } as Record<string, { systems: string[]; job?: { status: string }; closedAt?: string; members?: { userId: string; seeHistory: boolean; addedAt: string }[] }>,
  /** AiSystemAccess (S1.3) — ค่าเริ่มต้น DRAFT ทุกระบบ · CHAT = READ จนเชื่อมช่องทาง */
  access: { POS: "DRAFT", CRM: "DRAFT", MEMBER: "DRAFT", ACCOUNT: "DRAFT", KANBAN: "DRAFT", CHAT: "READ" } as Record<string, string>,
  /** AiJobCounter (S1.13) — งานที่ใช้ไปเดือนนี้ของร้าน A (ทดสอบวงแหวน % ใน B8) */
  jobsUsedThisMonth: 6,
  /** StaffInvite (S1.25) — คำเชิญที่ยังไม่รับ */
  invites: [{ phone: "+66800000007", name: "น้องใหม่ (รอรับคำเชิญ)", role: "STAFF" }],
} as const;

/** สัญญารวม — seed และข้อสอบอ่านจากชื่อนี้ */
export const SEC = {
  tag: SEC_TAG,
  tenant: SEC_TENANT,
  tenantB: SEC_TENANT_B,
  tenantIds: SEC_TENANT_IDS,
  systems: SEC_SYSTEMS,
  users: SEC_USERS,
  emails: SEC_EMAILS,
  acceptedAt: SEC_ACCEPTED_AT,
  rooms: SEC_ROOMS,
  proposals: SEC_PROPOSALS,
  proposalTtlMs: SEC_PROPOSAL_TTL_MS,
  proposalMinLeftMs: SEC_PROPOSAL_MIN_LEFT_MS,
  chats: SEC_CHATS,
  quickReplies: SEC_QUICK_REPLIES,
  supportCase: SEC_CASE,
  pending: SEC_PENDING,
} as const;
