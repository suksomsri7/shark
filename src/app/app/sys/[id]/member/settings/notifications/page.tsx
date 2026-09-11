import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { publicOrigin } from "@/lib/core/origin";
import { canManageSettings, toMemberActor } from "@/lib/modules/member/access";
import { getNotificationSettings, stats } from "@/lib/modules/member/notifications";
import { PageHeader } from "@/components/ui/PageHeader";
import { MemberSettingsTabs } from "@/components/member/MemberSettingsTabs";
import { NotificationsSettings } from "@/components/member/NotificationsSettings";

// หน้า "ระบบสมาชิก › ตั้งค่า › การแจ้งเตือน" (M3.6 · ภาพ ledger/design-member/30-notifications-templates.png)
//
// 🔴 ระบบต้องเป็น MEMBER ของร้านนี้จริง (ไม่ใช่ระบบอื่น/ร้านอื่น) → ไม่เจอ = notFound()
// 🔴 ไม่มี `member.settings.manage` → notFound() (404-not-403 §6.4 — เหมือนหน้าตั้งค่าอื่นของโมดูลนี้
//    ทั้งชุด fields/privacy/points/sources/api) — ต่างจาก S8.3 ที่คาดหวัง 403/302/307 (ดู wo-notes §3
//    "ข้อแย้ง" — ยึดกติกา §6.4 ที่เขียนไว้เป็นกฎตายตัวของทั้งโมดูล มากกว่าคาดเดาของข้อสอบข้อเดียว)
export default async function MemberNotificationsSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;

  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "MEMBER" } });
  if (!sys) notFound();

  const actor = toMemberActor(auth.user.id, auth.active);
  if (!canManageSettings(actor)) notFound();

  const ctx = { tenantId, systemId: id, actorUserId: auth.user.id };
  const [settings, monthStats, tenant, origin] = await Promise.all([
    getNotificationSettings(ctx),
    stats(ctx, actor, {}),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true, slug: true } }),
    publicOrigin(),
  ]);
  const walletUrl = `${origin.replace(/\/$/, "")}/m/${tenant?.slug ?? ""}/wallet`;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="การแจ้งเตือนสมาชิก"
        back={{ href: `/app/sys/${id}`, label: sys.name }}
        desc="เทมเพลตของแต่ละเหตุการณ์ต่อช่องทาง เคารพความยินยอม เวลาห้ามส่ง และรวมสรุปรายวัน"
      />
      <MemberSettingsTabs systemId={id} actor={actor} />
      <NotificationsSettings
        systemId={id}
        initialSettings={settings}
        monthStats={monthStats}
        tenantName={tenant?.name ?? ""}
        walletUrl={walletUrl}
      />
    </div>
  );
}
