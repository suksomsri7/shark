// ลบ "บัญชีผู้ใช้" (คนละเรื่องกับลบ "ร้าน" ใน pdpa.ts)
//
// ทำไมต้องมี: App Store Review 5.1.1(v) บังคับว่าแอปที่ให้สร้างบัญชีได้ **ต้องให้ลบบัญชีจากในแอปได้ด้วย**
// ของเดิมมีแต่ `requestTenantDeletion` (ลบร้าน) — เจ้าของร้านที่อยากลบตัวตนตัวเองทำไม่ได้เลย
// และพนักงาน (STAFF/MANAGER) ที่ไม่ได้เป็นเจ้าของร้านไหน ยิ่งไม่มีทางออกจากระบบถาวร
//
// 🔴 มติที่เคาะ (เจ้าของสั่ง "ทำเลย" — เลือกทางที่ไม่บล็อกผู้ใช้ และไม่ทำร้านกำพร้า):
//   1) ลบบัญชีได้เสมอ ไม่มีเงื่อนไขมาขวาง (Apple ไม่รับ flow ที่กันไม่ให้ลบ)
//   2) ร้านที่ผู้ใช้เป็น OWNER คนสุดท้าย **แต่ยังมีสมาชิกคนอื่น** → เลื่อนคนอื่นขึ้นเป็น OWNER อัตโนมัติ
//      (MANAGER ก่อน · ถ้าไม่มีก็คนที่เข้าร่วมนานที่สุด) — พนักงานคนอื่นต้องไม่เสียร้านเพราะเจ้าของลบตัวเอง
//   3) ร้านที่ไม่เหลือใครเลย → เข้าช่วงพักลบ 30 วันตามกลไก PDPA เดิม (ไม่ลบทันที เผื่อเป็นการกดพลาด
//      และมีเอกสารภาษีที่อาจต้องดึงกลับ)
//   4) ตัว User ถูกลบทันทีจริง ๆ (ไม่ใช่แค่ปิดใช้งาน) — Membership/Session cascade ตาม FK
//      คอลัมน์ที่เก็บ userId แบบไม่มี FK (audit log ฯลฯ) เก็บ id ค้างไว้ตามเดิมโดยตั้งใจ:
//      เป็นร่องรอยตรวจสอบย้อนหลัง ไม่ใช่ข้อมูลระบุตัวตน (ตัวตนจริงคืออีเมล/ชื่อ ซึ่งถูกลบไปแล้ว)

import { prisma } from "@/lib/core/db";
import { consumePhoneOtp, isPhonePlaceholderEmail, verifyPhoneOtp } from "@/lib/core/phone-auth";
import { requestTenantDeletion } from "./pdpa";

export type AccountDeletionImpact = {
  /** ร้านที่จะถูกส่งเข้าคิวลบ (ไม่เหลือสมาชิกอื่นเลย) */
  tenantsToDelete: { id: string; name: string }[];
  /** ร้านที่จะเปลี่ยนมือให้คนอื่น */
  tenantsHandedOver: { id: string; name: string; newOwner: string }[];
  /** ร้านที่ผู้ใช้เป็นแค่สมาชิก — ออกเฉย ๆ ไม่กระทบร้าน */
  tenantsLeftAlone: { id: string; name: string }[];
};

// SEC S3a.1-S2 ▸ R-Z26: บัญชีที่สมัครด้วยเบอร์ (อีเมล placeholder `<เบอร์>@phone.shark.in.th`) ไม่มีชื่อ ⇒ "สมาชิก" (ไม่โชว์เบอร์) ◂
const label = (u: { name: string | null; email: string }) => u.name?.trim() || (isPhonePlaceholderEmail(u.email) ? "สมาชิก" : u.email.split("@")[0]!);

/**
 * ดูผลกระทบก่อนลบ (ใช้โชว์บนจอยืนยัน — ผู้ใช้ต้องรู้ว่าจะเกิดอะไรกับร้านก่อนกด)
 * อ่านอย่างเดียว ไม่เปลี่ยนอะไร
 */
export async function previewAccountDeletion(userId: string): Promise<AccountDeletionImpact> {
  const memberships = await prisma.membership.findMany({
    where: { userId, acceptedAt: { not: null } },
    include: { tenant: { select: { id: true, name: true } } },
  });

  const out: AccountDeletionImpact = { tenantsToDelete: [], tenantsHandedOver: [], tenantsLeftAlone: [] };

  for (const m of memberships) {
    if (m.role !== "OWNER") {
      out.tenantsLeftAlone.push({ id: m.tenant.id, name: m.tenant.name });
      continue;
    }
    const successor = await findSuccessor(m.tenantId, userId);
    if (successor) {
      out.tenantsHandedOver.push({ id: m.tenant.id, name: m.tenant.name, newOwner: successor.label });
    } else {
      out.tenantsToDelete.push({ id: m.tenant.id, name: m.tenant.name });
    }
  }
  return out;
}

/** ผู้รับช่วงต่อความเป็นเจ้าของร้าน — OWNER คนอื่น > MANAGER > สมาชิกที่เข้าร่วมนานที่สุด */
async function findSuccessor(
  tenantId: string,
  excludeUserId: string,
): Promise<{ membershipId: string; label: string } | null> {
  const others = await prisma.membership.findMany({
    where: { tenantId, acceptedAt: { not: null }, userId: { not: excludeUserId } },
    include: { user: { select: { name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });
  if (others.length === 0) return null;
  const rank = (r: string) => (r === "OWNER" ? 0 : r === "MANAGER" ? 1 : 2);
  const pick = [...others].sort((a, b) => rank(a.role) - rank(b.role))[0]!;
  return { membershipId: pick.id, label: label(pick.user) };
}

export type DeleteAccountResult = { ok: true; impact: AccountDeletionImpact } | { ok: false; reason: string };

/**
 * SEC S3a.1-S2 ▸ R-Z21 (L4 m10 · หนี้ S3): ยืนยันตัวตนซ้ำก่อนลบบัญชี — `code` = OTP ที่เพิ่งขอ
 *   มีเบอร์ผูก (UserPhone) ⇒ รหัส SMS ของเบอร์ตัวเอง (`auth/sms/request`) · ตรวจแล้ว consume ทันที (ใช้ซ้ำไม่ได้)
 *   ไม่มีเบอร์ (บัญชีอีเมล) ⇒ รหัสอีเมลเดิม (`auth/otp` → `verifyOtp` ซึ่ง consume ในตัว) ของอีเมลบัญชีนี้
 *   ผิด/หมดอายุ/ไม่มีรหัสค้าง ⇒ `invalid` (ไม่บอกว่าเพราะอะไร) · ผิดเกินเพดาน ⇒ `locked`
 */
export async function verifyDeletionStepUp(userId: string, code: string): Promise<{ ok: true } | { ok: false; reason: "invalid" | "locked" }> {
  const digits = String(code ?? "").replace(/\D/g, "");
  if (digits.length !== 6) return { ok: false, reason: "invalid" };
  const phone = await prisma.userPhone.findUnique({ where: { userId }, select: { phone: true } });
  if (phone) {
    const v = await verifyPhoneOtp(phone.phone, digits);
    if (!v.ok) return { ok: false, reason: v.reason === "locked" ? "locked" : "invalid" };
    if (v.userId !== userId) return { ok: false, reason: "invalid" };
    return (await consumePhoneOtp(v.otpId)) ? { ok: true } : { ok: false, reason: "invalid" };
  }
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user?.email || isPhonePlaceholderEmail(user.email)) return { ok: false, reason: "invalid" };
  const { verifyOtp } = await import("@/lib/core/auth"); // lazy — core/auth ลาก email/env มา
  const r = await verifyOtp(user.email, digits);
  if (!r.ok) return { ok: false, reason: r.reason === "locked" ? "locked" : "invalid" };
  return r.user.id === userId ? { ok: true } : { ok: false, reason: "invalid" };
}

/**
 * SEC S3a.1-S2 ▸ R-Z26 (L6): ข้อมูลส่วนตัวที่ผูก userId แบบไม่มี FK (ไม่ cascade) — ลบพร้อมบัญชี
 *   เครื่องรับแจ้งเตือน · ค่าการแจ้งเตือน · เวรแชท · ผู้ช่วยในห้องแชท · สมาชิกห้องเลขา · ความจำส่วนตัว `u~<uid>~`
 */
async function deleteUserTraces(userId: string): Promise<void> {
  await prisma.$transaction([
    prisma.pushDevice.deleteMany({ where: { userId } }),
    prisma.aiNotifyPref.deleteMany({ where: { userId } }),
    prisma.chatShift.deleteMany({ where: { userId } }),
    prisma.chatConversationHelper.deleteMany({ where: { userId } }),
    prisma.aiRoomMember.deleteMany({ where: { userId } }),
    prisma.aiMemory.deleteMany({ where: { id: { startsWith: `u~${userId}~` } } }),
  ]);
}

/**
 * ลบบัญชีจริง — เรียกจาก server action หลังผู้ใช้ยืนยันบนจอแล้วเท่านั้น
 * userId ต้องมาจาก session เสมอ ห้ามรับจาก client
 */
export async function deleteAccount(userId: string): Promise<DeleteAccountResult> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) return { ok: false, reason: "ไม่พบบัญชีนี้" };

  const impact = await previewAccountDeletion(userId);

  // 1) ส่งมอบร้านที่ยังมีคนอื่นอยู่ก่อน — ทำก่อนลบ user เพื่อไม่ให้มีจังหวะที่ร้านไม่มีเจ้าของ
  for (const t of impact.tenantsHandedOver) {
    const successor = await findSuccessor(t.id, userId);
    if (!successor) continue; // สมาชิกคนสุดท้ายเพิ่งออกไประหว่างนี้ → ตกไปเข้าเคสลบร้านด้านล่าง
    await prisma.membership.update({ where: { id: successor.membershipId }, data: { role: "OWNER" } });
  }

  // 2) ร้านที่ไม่เหลือใคร → เข้าช่วงพักลบ 30 วัน (ไม่ลบทันที)
  for (const t of impact.tenantsToDelete) {
    await requestTenantDeletion(t.id);
  }

  // 3) ลบ User จริง — Membership/Session cascade ตาม FK ใน core.prisma · + ร่องรอยที่ไม่มี FK (R-Z26) ก่อนลบ
  await deleteUserTraces(userId);
  await prisma.user.delete({ where: { id: userId } });

  return { ok: true, impact };
}
