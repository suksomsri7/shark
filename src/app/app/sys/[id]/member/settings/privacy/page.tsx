import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { canManagePrivacy, toMemberActor } from "@/lib/modules/member/access";
import {
  consentStats,
  getAutoEraseYears,
  hrPositionsSummary,
  listAccessLog,
  listPolicyVersions,
  listPrivacyRequests,
  sensitiveMatrix,
  type MemberCtx,
} from "@/lib/modules/member/privacy";
import { PageHeader } from "@/components/ui/PageHeader";
import { MemberTabs } from "@/components/member/MemberTabs";
import { MemberSettingsTabs } from "@/components/member/MemberSettingsTabs";
import { PrivacySettings } from "@/components/member/PrivacySettings";

// หน้า "ระบบสมาชิก › ตั้งค่า › ความเป็นส่วนตัวและสิทธิ์ข้อมูล" (M1.7 · ภาพ ledger/design-member/14-consent-pdpa-settings.png)
//
// 🔴 ระบบต้องเป็น MEMBER ของร้านนี้จริง → ไม่เจอ = notFound()
// 🔴 กติกา 404-not-403 (§6.4): ไม่มี `member.privacy.manage` → notFound() เหมือนกัน ไม่ใช่หน้า 403
//    (คีย์นี้ MANAGER ไม่ได้โดยปริยาย — §6.1 · ดูหมายเหตุที่หัวไฟล์ access.ts)
// 🔴 ข้อมูลทุกก้อนอ่านผ่าน `privacy.ts` เท่านั้น ยกเว้น 2 อย่างที่เป็นข้อมูลของหน้าเอง:
//    (1) AppSystem ของร้าน (ด่านเดียวกับหน้าอื่นในโมดูล) (2) ยอด "ยอมรับนโยบายแล้วกี่คน"

export default async function MemberPrivacySettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;

  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "MEMBER" } });
  if (!sys) notFound();

  const actor = toMemberActor(auth.user.id, auth.active);
  if (!canManagePrivacy(actor)) notFound();

  const ctx: MemberCtx = { tenantId, systemId: id, actorUserId: auth.user.id };
  const [policies, consents, matrix, hr, accessLog, requests, autoEraseYears, hrSystem] = await Promise.all([
    listPolicyVersions(ctx),
    consentStats(ctx, actor),
    sensitiveMatrix(ctx, actor),
    hrPositionsSummary(ctx),
    listAccessLog(ctx, actor, { take: 20 }),
    listPrivacyRequests(ctx, actor, 20),
    getAutoEraseYears(ctx),
    prisma.appSystem.findFirst({ where: { tenantId, type: "HR", active: true }, select: { id: true } }),
  ]);

  // "ยอมรับแล้วกี่คน" = สมาชิกที่ `privacyVersion` ตรงกับเวอร์ชันที่บังคับใช้อยู่ (ยังไม่มีเวอร์ชัน = 0)
  const currentVersion = policies.find((p) => p.isCurrent)?.version ?? null;
  const [total, accepted] = await Promise.all([
    prisma.customer.count({ where: { tenantId, memberSystemId: id, status: { notIn: ["MERGED"] } } }),
    currentVersion === null
      ? Promise.resolve(0)
      : prisma.customer.count({ where: { tenantId, memberSystemId: id, status: { notIn: ["MERGED"] }, privacyVersion: { gte: currentVersion } } }),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="ความเป็นส่วนตัวและสิทธิ์ข้อมูล"
        back={{ href: `/app/sys/${id}`, label: sys.name }}
        desc="นโยบายที่ลูกค้ายอมรับ ช่องทางที่ขอความยินยอมได้ ใครเปิดดูข้อมูลอ่อนไหวได้บ้าง และคำขอตามกฎหมายคุ้มครองข้อมูลส่วนบุคคล"
      />
      <MemberTabs systemId={id} actor={actor} />
      <MemberSettingsTabs systemId={id} actor={actor} />
      <PrivacySettings
        systemId={id}
        policies={policies}
        acceptance={{ accepted, total }}
        consents={consents.rows}
        matrix={matrix}
        hr={hr}
        accessLog={accessLog}
        requests={requests}
        autoEraseYears={autoEraseYears}
        hrHref={hrSystem ? `/app/sys/${hrSystem.id}/hr/employees` : null}
      />
    </div>
  );
}
