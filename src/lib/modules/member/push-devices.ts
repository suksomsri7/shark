// push-devices.ts — เครื่องของ "ลูกค้า" ที่รับแจ้งเตือนในแอป (M3.10 · ตาราง MemberPushDevice ของ M3.2)
//
// ผู้เรียก: REST `POST/DELETE /me/push-devices` (แอปลูกค้าเรียกหลังเข้าสู่ระบบ) · หน้า `/m/*` ในแอป (M3.11)
// ผู้อ่าน: แคมเปญ (M3.2) · journey (M3.3) · แจ้งเตือนสมาชิก (M3.6) ผ่าน `core/push.sendPushToCustomerTokens`
//
// 🔴 คนละตารางกับ `PushDevice` ของพนักงาน — ลูกค้าไม่มีทางไปรับแจ้งเตือนหลังร้าน (และกลับกัน)
// 🔴 token หนึ่งตัว = เครื่องหนึ่งเครื่อง (unique)
// 🔴 AUDIT L6: **ห้ามยึดเครื่องของคนอื่น** — เดิมใครก็ตามที่ส่ง Expo token ของเครื่องเครื่องหนึ่งมา
//    จะถูก upsert ให้กลายเป็นเจ้าของทันที ⇒ รู้/เดา token ของเหยื่อได้ = ดักแจ้งเตือนของเขา
//    (แต้มเข้า · voucher · ชื่อ-ระดับสมาชิก) · schema ไม่มี `installationId` ที่จะพิสูจน์ว่าเป็นเครื่องเดียวกัน
//    ⇒ กติกาสำรอง: token ที่ผูกกับลูกค้าคนอื่นอยู่แล้ว **คงเจ้าของเดิม** · คนใหม่ได้ข้อความไทยที่บอกทางออก
//    ⇒ "คนเก่าออกจากระบบ คนใหม่ล็อกอินบนเครื่องเดียวกัน" ยังทำได้: แอปเรียก `removePushDevice`
//       (DELETE /me/push-devices/{id หรือ expoToken}) ตอนออกจากระบบ แล้วค่อยลงทะเบียนใหม่
// 🔴 ลูกค้าแตะได้เฉพาะเครื่องของตัวเอง — ลบเครื่องของคนอื่น = "ไม่พบ" (404 ไม่ใช่ 403)

import { prisma } from "./db";
import type { MemberActor } from "./access";
import { MemberForbiddenError, MemberInputError, MemberNotFoundError } from "./errors";
import type { MemberCtx } from "./profile";

export const PUSH_PLATFORMS = ["ios", "android", "web"] as const;
export type PushPlatform = (typeof PUSH_PLATFORMS)[number];

/** รูป token ของ Expo (`ExponentPushToken[…]` / `ExpoPushToken[…]`) — ไม่ใช่รูปนี้ = ส่งไม่ถึงแน่นอน */
const EXPO_TOKEN_RE = /^Expo(nent)?PushToken\[[^\]\s]{1,200}\]$/;

export type PushDeviceDto = { id: string; platform: string; createdAt: Date; lastSeenAt: Date | null };

function selfOf(actor: MemberActor): string {
  if (actor.role !== "CUSTOMER" || !actor.customerId) {
    throw new MemberForbiddenError("ลงทะเบียนเครื่องรับแจ้งเตือนได้จากแอปของลูกค้าเท่านั้น");
  }
  return actor.customerId;
}

/** ลงทะเบียน (หรือต่ออายุ) เครื่องของลูกค้าที่ล็อกอินอยู่ — เรียกซ้ำด้วย token เดิมได้ผลเดิม */
export async function registerPushDevice(
  ctx: MemberCtx,
  actor: MemberActor,
  input: { expoToken: string; platform?: string | null },
): Promise<PushDeviceDto> {
  const customerId = selfOf(actor);
  const token = String(input?.expoToken ?? "").trim();
  if (!EXPO_TOKEN_RE.test(token)) {
    throw new MemberInputError("รหัสเครื่องสำหรับแจ้งเตือนไม่ถูกต้อง — ปิดแล้วเปิดแอปใหม่อีกครั้ง");
  }
  const platformRaw = String(input?.platform ?? "ios").trim().toLowerCase();
  if (!(PUSH_PLATFORMS as readonly string[]).includes(platformRaw)) {
    throw new MemberInputError("ระบบของเครื่องต้องเป็น ios · android หรือ web");
  }
  const now = new Date();
  // 🔴 AUDIT L6: token นี้เป็นของลูกค้าคนอื่นอยู่ → คงเจ้าของเดิมไว้ (ไม่มี installationId ให้พิสูจน์ว่าเครื่องเดียวกัน)
  const owned = await prisma.memberPushDevice.findUnique({ where: { token }, select: { customerId: true } });
  if (owned && owned.customerId !== customerId) {
    throw new MemberInputError(
      "เครื่องนี้ยังเปิดรับแจ้งเตือนให้บัญชีก่อนหน้าอยู่ — ออกจากระบบในแอปของบัญชีนั้นก่อน แล้วเปิดแจ้งเตือนอีกครั้ง",
    );
  }
  const row = await prisma.memberPushDevice.upsert({
    where: { token },
    create: { tenantId: ctx.tenantId, customerId, token, platform: platformRaw, lastSeenAt: now },
    // เจ้าของเดิม = คนเดียวกันเสมอ (ด่านด้านบน) ⇒ ต่ออายุ/อัปเดตระบบของเครื่องได้ตามปกติ
    update: { tenantId: ctx.tenantId, platform: platformRaw, lastSeenAt: now },
    select: { id: true, platform: true, createdAt: true, lastSeenAt: true },
  });
  return row;
}

/**
 * เลิกรับแจ้งเตือนบนเครื่องนี้ (ออกจากระบบในแอป) — เครื่องของคนอื่น = ไม่พบ
 * 🔴 AUDIT L6: รับได้ทั้ง `MemberPushDevice.id` และ Expo token — เวลาออกจากระบบ แอปมี token อยู่ในมือเสมอ
 *    (ไม่ต้องจำ id) ⇒ ปลดเครื่องได้ก่อนบัญชีถัดไปล็อกอินบนเครื่องเดียวกัน
 */
export async function removePushDevice(ctx: MemberCtx, actor: MemberActor, id: string): Promise<{ ok: true }> {
  const customerId = selfOf(actor);
  const key = String(id ?? "").trim();
  const res = await prisma.memberPushDevice.deleteMany({
    where: { tenantId: ctx.tenantId, customerId, OR: [{ id: key }, { token: key }] },
  });
  if (res.count === 0) throw new MemberNotFoundError("ไม่พบเครื่องนี้ในรายการรับแจ้งเตือนของคุณ");
  return { ok: true };
}
