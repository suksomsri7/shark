// guard.ts — ด่าน "ขาอ่าน" ของกล่องแชทลูกค้า (WO-CW3 · ปิด G8)
//
// 🔴 ช่องโหว่ที่ไฟล์นี้ปิด (สำรวจโค้ดจริง 31 ส.ค. 2026)
//    `chat/actions.ts` มี `assertChatCan` ครบทุก export แล้ว (ขา **เขียน** ปลอดภัย)
//    แต่ขา **อ่าน** ไม่มีด่านเลย: `ChatInboxSection` เรียก `listConversations` / `getThread` /
//    `listStaff` ตรง ๆ ใน server component โดยกันแค่ `unitAccess`
//    ⇒ STAFF ที่เข้าถึงสาขานั้นได้ **อ่านข้อความลูกค้าทุกห้องในสาขา** ได้ แม้ไม่มีสิทธิ์แชทสักข้อ
//    (บทสนทนาลูกค้า = ชื่อ เบอร์ อีเมล ประวัติการซื้อ เรื่องร้องเรียน — ของอ่อนไหวที่สุดชิ้นหนึ่งในระบบ)
//
// 🔴 ทำไมต้องอยู่ที่นี่ ไม่ใช่ในหน้า page.tsx อย่างเดียว
//    หน้าเว็บมีหลายทางเข้า (/app/sys/<id> · /app/sys/<id>/chat · คอมโพเนนต์ที่ฝังในหน้าอื่น)
//    กันทีละหน้า = วันหนึ่งมีหน้าที่ 4 แล้วลืม · ด่านต้องอยู่ติดกับ "ตัวที่อ่านข้อมูล" ให้ทุกทางเข้าใช้ร่วมกัน
//    (บทเรียนเดียวกับ CUSTOMER_VISIBLE ใน service.ts — กติกาที่ห้ามหลุด ต้องประกาศที่เดียว)
//
// ⚠️ UI ที่ซ่อนเมนูอย่างเดียวไม่ใช่ความปลอดภัย — ซ่อนเมนูคือความสะดวก ด่านจริงคือฟังก์ชันในไฟล์นี้

import { requireTenant } from "@/lib/core/context";
import { assertCan, evaluate, type MembershipCtx } from "@/lib/core/rbac";

/** action ในทะเบียนกลาง `src/lib/core/permissions.ts` — ห้ามพิมพ์สตริงนี้ซ้ำที่อื่น */
export const CHAT_READ_ACTION = "chat.conversation.read";

type Auth = Awaited<ReturnType<typeof requireTenant>>;

/** แปลง session ของ Next เป็นบริบท RBAC (รูปเดียวกับที่ `chat/actions.ts` ใช้) */
export function membershipOf(auth: Auth): MembershipCtx {
  return {
    role: auth.active.role,
    unitAccess: auth.active.unitAccess as string[],
    permissions: auth.active.permissions as Record<string, unknown>,
  };
}

/**
 * ตรวจแบบ pure ว่าคนนี้เปิดกล่องแชทลูกค้าได้ไหม — **ใช้ซ่อนเมนู/ปุ่มเท่านั้น**
 *
 * 🔴 อย่าใช้ตัวนี้แทนด่าน: มันคืน boolean ไม่ได้หยุดอะไร · ที่กันจริงคือ `requireChatRead()`
 */
export function canReadChat(auth: Auth | null): boolean {
  if (!auth?.active) return false;
  return evaluate(membershipOf(auth), { module: "chat", action: CHAT_READ_ACTION });
}

/**
 * ด่านจริงของขาอ่าน — เรียกก่อนแตะข้อมูลแชททุกครั้ง
 *
 * ไม่มีสิทธิ์ → โยน `ForbiddenError` (กติกาเดิมของรีโป — `assertCan` เป็นตัวโยน)
 * 🔴 ต้องเรียก **ก่อน** `listConversations` / `getThread` ไม่ใช่หลัง — ไม่งั้น query วิ่งไปแล้ว
 *    ต่อให้ throw ทีหลัง ข้อมูลก็ถูกอ่านขึ้นมาจาก DB และไปโผล่ใน log/trace ได้
 *
 * คืน `auth` กลับไปให้ผู้เรียกใช้ต่อ (tenantId / userId / unitAccess) — จะได้ไม่ต้องเรียก
 * `requireTenant()` ซ้ำสองรอบต่อ 1 การเรนเดอร์
 */
export async function requireChatRead(): Promise<Auth> {
  const auth = await requireTenant();
  assertCan(membershipOf(auth), { module: "chat", action: CHAT_READ_ACTION });
  return auth;
}
