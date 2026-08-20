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
import { requestTenantDeletion } from "./pdpa";

export type AccountDeletionImpact = {
  /** ร้านที่จะถูกส่งเข้าคิวลบ (ไม่เหลือสมาชิกอื่นเลย) */
  tenantsToDelete: { id: string; name: string }[];
  /** ร้านที่จะเปลี่ยนมือให้คนอื่น */
  tenantsHandedOver: { id: string; name: string; newOwner: string }[];
  /** ร้านที่ผู้ใช้เป็นแค่สมาชิก — ออกเฉย ๆ ไม่กระทบร้าน */
  tenantsLeftAlone: { id: string; name: string }[];
};

const label = (u: { name: string | null; email: string }) => u.name?.trim() || u.email.split("@")[0]!;

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

  // 3) ลบ User จริง — Membership/Session cascade ตาม FK ใน core.prisma
  await prisma.user.delete({ where: { id: userId } });

  return { ok: true, impact };
}
