// notify.ts — กติกา "ใครควรได้แจ้งเตือนของกล่องแชทลูกค้า" (WO-CW5 · ปิด G9)
//
// 🔴 ทำไมต้องมีไฟล์นี้แยกจาก push.ts
//    G9 ของแผน (§1.2): `sendPushToTenant` ยิงเข้า **ทุกเครื่องในร้าน** โดยไม่ดูสิทธิ์
//    ⇒ พ่อครัวที่ไม่มีสิทธิ์อ่านแชทลูกค้า ได้ "ตัวอย่างข้อความลูกค้า" เด้งขึ้นจอล็อกมือถือ
//    นี่คือข้อมูลรั่วที่ "ซ่อนเมนู" แก้ไม่ได้ — ต้องตัดที่ **ต้นทางของการส่ง**
//
// ไฟล์นี้เก็บเฉพาะ "การตัดสินใจ" แบบ pure (ไม่มี I/O ไม่แตะ prisma ไม่แตะเน็ต)
//   → ข้อสอบยิงตรงได้โดยไม่ต้องต่อ DB · เปลี่ยนกติกาที่เดียว ไม่กระจายไปตามจุดส่ง
//   ส่วนการอ่านข้อมูล (membership / read state / เครื่อง) อยู่ที่ `src/lib/core/push.ts`
//
// กติกา 4 ข้อ (PLAN-CHAT-WHATSAPP §7):
//   1. ต้องมีสิทธิ์ `chat.conversation.read` จริงตาม `evaluate()` ของ RBAC กลาง
//      (OWNER ได้เสมอ · MANAGER ได้ตามหน่วยที่คุม · STAFF ได้ตาม permissions)
//   2. ต้องเข้าถึง unit ของเธรดได้ — `evaluate()` ตรวจ `unitAccess` ให้แล้วเมื่อส่ง `unitId` เข้าไป
//   3. เธรดที่มอบหมายแล้ว → ผู้รับผิดชอบ **มาก่อน** คนอื่นในคิวส่ง (งานของใครต้องถึงคนนั้นก่อน)
//   4. คนที่ "กำลังเปิดห้องนั้นอยู่" ไม่ต้องเด้งซ้ำใส่หน้าที่เขามองอยู่ — วัดจาก
//      `ChatReadState.lastReadAt` ที่สด (`markReadOnOpenAction` เขียนค่านี้ทุกครั้งที่เปิดห้อง)

import type { Role } from "@prisma/client";
import { evaluate } from "@/lib/core/rbac";

/** โมดูล + action ที่ใช้ตัดสินสิทธิ์อ่านกล่องแชท — ต้องตรงกับทะเบียนใน `core/permissions.ts` เป๊ะ */
export const CHAT_NOTIFY_MODULE = "chat";
export const CHAT_READ_ACTION = "chat.conversation.read";

/**
 * `lastReadAt` สดกว่าเท่านี้ = ถือว่า "ยังเปิดห้องนั้นค้างอยู่"
 *
 * ⚖️ ข้อแลกเปลี่ยนที่ตั้งใจเลือก: สั้นไป = เด้งใส่คนที่กำลังมองจออยู่ (แค่รำคาญ)
 *    ยาวไป = คนที่เพิ่งอ่านแล้วปิดแอปเดินไปทำอย่างอื่น **ไม่ได้แจ้งเตือน** (พลาดงานลูกค้า — แพงกว่ามาก)
 *    ⇒ สั้นกว่าหน้าต่าง "ทักรอบใหม่" ของ `announceInbound` (`INBOUND_NOTIFY_GAP_MS` = 3 นาที)
 *      เพื่อไม่ให้ de-dup สองชั้นทับกันจนเงียบยาว
 *
 * 🔴 **มติ M-1 ของ Fable (31 ส.ค.) — 60 วิ → 20 วิ · ต้องอ่านคู่กับข้อบังคับด้านล่าง**
 *    ค่านี้จะถูกต้องได้ก็ต่อเมื่อ **หน้าจอกล่องแชทรีเฟรช `ChatReadState.lastReadAt` ทุกรอบ poll**
 *    (WO-CW4 D-2 · หน้าจอ poll ทุก 5 วิ ⇒ เปิดค้างอยู่ = ค่าสดตลอด · ปิดหน้าไป = ค่าเก่าเกิน 20 วิ
 *    แล้ว push กลับมาเองภายใน 20 วิ)
 *    ⚠️ **ถ้าวันไหนหน้าจอเลิกทำ heartbeat ค่านี้จะแปลว่า "เคยกดอ่านเมื่อไหร่" ไม่ใช่ "กำลังดูอยู่ไหม"**
 *    = ตัวชี้วัดผิดตัวทันที และร้านที่มีพนักงานคนเดียวจะไม่ได้แจ้งเตือนเลย
 *
 * ⚠️ ค่านี้คือปุ่มปรับตัวเดียวของกติกา "ไม่แจ้งห้องที่เปิดอยู่" — ถ้าเจ้าของรายงานว่า
 *    "อ่านแล้วปิดแอป แล้วลูกค้าตอบกลับมาไม่เห็นแจ้งเตือน" ให้ลดค่านี้ ไม่ใช่ไปแก้ที่จุดส่ง
 */
export const VIEWING_WINDOW_MS = 20_000;

/** สมาชิกในร้าน 1 คน เท่าที่การตัดสินใจนี้ต้องรู้ (ไม่ผูกกับรูปแถวของ Prisma) */
export type ChatNotifyMember = {
  userId: string;
  role: Role;
  unitAccess: string[];
  permissions: Record<string, unknown>;
};

/** สถานะการอ่านของห้องนี้รายคน — มาจาก `ChatReadState` */
export type ChatNotifyReader = {
  userId: string;
  lastReadAt: Date | null;
};

export type ChatNotifyInput = {
  /** สมาชิกที่ยังใช้งานอยู่ของร้าน (คนที่ถูกถอนสิทธิ์แล้วไม่ต้องส่งเข้ามา) */
  members: readonly ChatNotifyMember[];
  /** unit ของเธรด — `null` = เธรดระดับร้าน (ไม่ผูกสาขา) */
  unitId?: string | null;
  /** ผู้รับผิดชอบเธรด (ถ้ามี) — จะถูกจัดขึ้นหัวคิว */
  assigneeUserId?: string | null;
  /** คนที่ไม่ต้องแจ้ง เช่น ผู้ส่งข้อความเอง (ทีมตอบเอง = ห้ามเด้งใส่ตัวเอง) */
  excludeUserIds?: readonly string[];
  /** สถานะการอ่านของห้องนี้ — ใช้ตัดคนที่กำลังเปิดห้องอยู่ */
  readers?: readonly ChatNotifyReader[];
  now?: Date;
  viewingWindowMs?: number;
};

/**
 * แปลงแถว Membership ของ Prisma (unitAccess/permissions เป็น Json) ให้เป็นรูปที่ตัดสินใจได้
 * 🔴 รวมการ cast Json ไว้ที่เดียว — ถ้าค่าในฐานเพี้ยน (null / string / array) ต้องตกไปทาง
 *    "ไม่มีสิทธิ์" ไม่ใช่ throw กลางเส้นทางแจ้งเตือน
 */
export function toChatNotifyMember(row: {
  userId: string;
  role: Role;
  unitAccess: unknown;
  permissions: unknown;
}): ChatNotifyMember {
  const unitAccess = Array.isArray(row.unitAccess)
    ? row.unitAccess.filter((u): u is string => typeof u === "string")
    : [];
  const permissions =
    row.permissions && typeof row.permissions === "object" && !Array.isArray(row.permissions)
      ? (row.permissions as Record<string, unknown>)
      : {};
  return { userId: row.userId, role: row.role, unitAccess, permissions };
}

/** คนนี้มีสิทธิ์อ่านกล่องแชทของเธรดนี้ไหม (รวมด่าน unit) — ใช้ `evaluate()` ตัวเดียวกับทั้งระบบ */
export function canReadChatConversation(m: ChatNotifyMember, unitId?: string | null): boolean {
  return evaluate(
    { role: m.role, unitAccess: m.unitAccess, permissions: m.permissions },
    { module: CHAT_NOTIFY_MODULE, action: CHAT_READ_ACTION, unitId: unitId ?? undefined },
  );
}

/** ยังเปิดห้องนี้ค้างอยู่ไหม (lastReadAt สดพอ) */
export function isViewingNow(
  lastReadAt: Date | null | undefined,
  now: Date,
  windowMs: number = VIEWING_WINDOW_MS,
): boolean {
  if (!lastReadAt) return false;
  const diff = now.getTime() - lastReadAt.getTime();
  // เผื่อนาฬิกาเครื่องกับ DB เหลื่อมกันเล็กน้อย → ค่าติดลบยังถือว่า "เพิ่งอ่าน"
  return diff < windowMs;
}

/**
 * รายชื่อ userId ที่ควรได้รับแจ้งเตือนของห้องนี้ — **เรียงตามลำดับที่ควรส่ง**
 * (ผู้รับผิดชอบมาก่อน แล้วจึงคนอื่นตามลำดับที่ส่งเข้ามา)
 *
 * 🔴 fail-closed ทุกทาง: ไม่รู้จัก / ไม่มีสิทธิ์ / ข้อมูลเพี้ยน ⇒ **ไม่ส่ง**
 *    ผู้รับผิดชอบก็ไม่ได้รับข้อยกเว้นเรื่องสิทธิ์ — ถ้าเขาไม่มีสิทธิ์อ่านแชท การ assign เองนั่นแหละที่ผิด
 *    (ไม่ใช่เหตุให้ปล่อยข้อความลูกค้าไปโผล่บนจอเขา)
 */
export function selectChatNotifyRecipients(input: ChatNotifyInput): string[] {
  const now = input.now ?? new Date();
  const windowMs = input.viewingWindowMs ?? VIEWING_WINDOW_MS;
  const excluded = new Set(input.excludeUserIds ?? []);
  const viewing = new Set(
    (input.readers ?? [])
      .filter((r) => isViewingNow(r.lastReadAt, now, windowMs))
      .map((r) => r.userId),
  );

  const eligible: string[] = [];
  const seen = new Set<string>();
  for (const m of input.members) {
    if (!m.userId || seen.has(m.userId)) continue;
    seen.add(m.userId);
    if (excluded.has(m.userId)) continue;
    if (viewing.has(m.userId)) continue; // กำลังเปิดห้องนี้อยู่ — ไม่ต้องเด้งซ้ำ
    if (!canReadChatConversation(m, input.unitId)) continue; // ← ด่านที่ปิด G9
    eligible.push(m.userId);
  }

  const assignee = input.assigneeUserId ?? null;
  if (assignee && eligible.includes(assignee)) {
    return [assignee, ...eligible.filter((u) => u !== assignee)];
  }
  return eligible;
}
