// push-devices.ts — เครื่องของ "ลูกค้า" ที่รับแจ้งเตือนในแอป (M3.10 · ตาราง MemberPushDevice ของ M3.2)
//
// ผู้เรียก: REST `POST/DELETE /me/push-devices` (แอปลูกค้าเรียกหลังเข้าสู่ระบบ) · หน้า `/m/*` ในแอป (M3.11)
// ผู้อ่าน: แคมเปญ (M3.2) · journey (M3.3) · แจ้งเตือนสมาชิก (M3.6) ผ่าน `core/push.sendPushToCustomerTokens`
//
// 🔴 คนละตารางกับ `PushDevice` ของพนักงาน — ลูกค้าไม่มีทางไปรับแจ้งเตือนหลังร้าน (และกลับกัน)
// 🔴 token หนึ่งตัว = เครื่องหนึ่งเครื่อง (unique) · เครื่องเดิมเปลี่ยนคนล็อกอิน = ย้ายเจ้าของไปคนใหม่
//    (ไม่งั้นแจ้งเตือนของคนเก่าจะเด้งบนเครื่องที่ตอนนี้เป็นของคนอื่น)
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
  const row = await prisma.memberPushDevice.upsert({
    where: { token },
    create: { tenantId: ctx.tenantId, customerId, token, platform: platformRaw, lastSeenAt: now },
    update: { tenantId: ctx.tenantId, customerId, platform: platformRaw, lastSeenAt: now },
    select: { id: true, platform: true, createdAt: true, lastSeenAt: true },
  });
  return row;
}

/** เลิกรับแจ้งเตือนบนเครื่องนี้ (ออกจากระบบในแอป) — เครื่องของคนอื่น = ไม่พบ */
export async function removePushDevice(ctx: MemberCtx, actor: MemberActor, id: string): Promise<{ ok: true }> {
  const customerId = selfOf(actor);
  const res = await prisma.memberPushDevice.deleteMany({
    where: { id: String(id ?? "").trim(), tenantId: ctx.tenantId, customerId },
  });
  if (res.count === 0) throw new MemberNotFoundError("ไม่พบเครื่องนี้ในรายการรับแจ้งเตือนของคุณ");
  return { ok: true };
}
