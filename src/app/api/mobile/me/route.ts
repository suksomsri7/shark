// GET /api/mobile/me + Bearer (ไม่ต้องมี X-Tenant-Id — ยังไม่เลือกกิจการ) → user + รายชื่อกิจการ
// ใช้ mobileUser (แค่ยืนยันตัวตน) ไม่ใช่ requireMobile ที่บังคับ X-Tenant-Id
import { prisma } from "@/lib/core/db";
import { mobileUser } from "@/lib/mobile/auth";
import { getBrandingTokens } from "@/lib/branding/service";
import { phoneOfUser, publicEmailOf } from "@/lib/core/phone-auth";

const APPLE_RELAY = "@privaterelay.appleid.com";
function appleLinkedOf(email: string | null | undefined): true | null {
  return typeof email === "string" && email.trim().toLowerCase().endsWith(APPLE_RELAY) ? true : null;
}

export async function GET(req: Request): Promise<Response> {
  const user = await mobileUser(req);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  // เฉพาะ membership ที่ acceptedAt แล้ว (คำเชิญที่ตอบรับ) — Membership คือ global axis อ่าน prisma ตรงได้
  const memberships = await prisma.membership.findMany({
    where: { userId: user.id, acceptedAt: { not: null } },
    include: { tenant: true },
    orderBy: { createdAt: "asc" },
  });
  // ธีมของแต่ละกิจการ (B1/B5) — แอปเอาไปใช้กับจอล็อกอิน/ปุ่ม/หัวรายการแชท แล้วแคชไว้ในเครื่อง
  // 🔴 ร้านที่ปิดสวิตช์ "ใช้กับแอปมือถือ" → null (แอปต้องกลับไปใช้ธีม SHARK ปริยาย ไม่ใช่ค้างของเก่า)
  // getBrandingTokens แคช 60 วิต่อร้าน ⇒ คนที่อยู่หลายร้านไม่ได้ยิง query เพิ่มทุกครั้งที่เปิดแอป
  const tokens = await Promise.all(memberships.map((m) => getBrandingTokens(m.tenantId)));
  // S1.19 · R8: เบอร์ที่ผูก (E.164) — null ⇒ แอปบังคับผูกเบอร์ก่อนใช้งานต่อ
  // R-S1.19a: บัญชีที่สมัครด้วยเบอร์ email = null (placeholder) + pendingEmail (ยังไม่ยืนยัน)
  const phone = await phoneOfUser(user.id);
  return Response.json(
    {
      // S1.14b: appleLinked = true เมื่ออีเมลเป็นอีเมลซ่อนของ Apple · อื่น ๆ = null (ไม่รู้ — ยังไม่มีคอลัมน์ identity · หนี้ S3a · ห้ามเดา false)
      user: { id: user.id, ...publicEmailOf(user), name: user.name, phone, appleLinked: appleLinkedOf(user.email) },
      memberships: memberships.map((m, i) => {
        const t = tokens[i];
        return {
          tenantId: m.tenantId,
          name: m.tenant.name,
          role: m.role,
          branding: t.applyMobile
            ? {
                displayName: t.displayName,
                logoUrl: t.logoUrl,
                accent: t.accent,
                accentFg: t.accentFg,
                navTone: t.navTone,
              }
            : null,
        };
      }),
    },
    { status: 200 },
  );
}
