import { notFound } from "next/navigation";
import { requireCrmV2Page } from "@/lib/modules/crm/ui-version";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { toMemberActor } from "@/lib/modules/member";
import { crmCan } from "@/lib/modules/crm/access";
import { getWebSettings, listLinks, webStats } from "@/lib/modules/crm/tracking";
import { RETENTION_MAX_DAYS, RETENTION_MIN_DAYS, TRACKING_MAX_DOMAINS, CONSENT_TEXT_MAX } from "@/lib/modules/crm/tracking-shared";
import { crmNavItems } from "@/lib/modules/crm/nav";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";
import { TrackingSettingsForm } from "@/components/crm/tracking/TrackingSettingsForm";
import type { CrmTrackingPageData } from "@/components/crm/tracking/types";

// ตั้งค่า — ติดตามเว็บ + ลิงก์ติดตาม (ใบ C2.6 · ภาพ 16 + ภาพ 11) — `/app/sys/{id}/crm/settings/tracking`
// 🔴 404-not-403: ระบบไม่ใช่ CRM ของร้านนี้ · ยังไม่เปิด CRM v2 · ไม่มีคีย์ `crm.tracking.manage` = notFound()
// 🔴 หน้า GET ไม่เขียนอะไรเลย (siteKey ออกตอนเจ้าของร้าน "เปิดใช้งาน" เท่านั้น — ไม่ใช่ตอนเปิดหน้า)
// 🔴 ด่าน F2.3: `src/components/**` ล้วงโมดูล CRM ไม่ได้ ⇒ เพดาน/ค่าคงที่แปลงเป็น props ที่นี่

export const dynamic = "force-dynamic";

export default async function CrmTrackingSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "CRM" } });
  if (!sys) notFound();
  // CRM uiVersion gate ▸ route นี้มีเฉพาะ CRM v2 ◂
  await requireCrmV2Page({ tenantId, systemId: id });
  const actor = toMemberActor(auth.user.id, auth.active);
  if (!crmCan(actor, "crm.tracking.manage")) notFound();
  const ctx = { tenantId, systemId: id, actorUserId: auth.user.id };

  const [settings, links, stats] = await Promise.all([
    getWebSettings(ctx, actor),
    listLinks(ctx, actor),
    webStats(ctx, actor, { days: 30 }).catch(() => ({ sessions: 0, consented: 0, identified: 0, webLeads: 0 })),
  ]);
  const data: CrmTrackingPageData = {
    systemId: id,
    settings,
    stats,
    links: links.map((l) => ({
      id: l.id,
      code: l.code,
      url: l.url,
      name: l.name,
      channel: l.channel,
      active: l.active,
      clicks: l.clicks,
      uniqueClicks: l.uniqueClicks,
      shortUrl: l.shortUrl,
      createdAtLabel: new Date(l.createdAt).toISOString().slice(0, 10),
    })),
    limits: { retentionMin: RETENTION_MIN_DAYS, retentionMax: RETENTION_MAX_DAYS, maxDomains: TRACKING_MAX_DOMAINS, consentTextMax: CONSENT_TEXT_MAX },
  };

  const def = systemDef(sys.type);
  return (
    <div className="flex min-w-0 max-w-5xl flex-col gap-4">
      <PageHeader
        title={`${def?.icon ?? ""} ${sys.name}`.trim()}
        back={{ href: `/app/sys/${id}/crm/settings`, label: "ตั้งค่า CRM" }}
        desc="ตั้งค่า — ติดตามเว็บและลิงก์ติดตาม: โดเมนที่อนุญาต · cookie consent + เวอร์ชัน · อายุการเก็บ · โค้ดฝัง · ลิงก์ติดตาม + QR"
      />
      <ModuleTabs items={crmNavItems(id)} />
      <TrackingSettingsForm data={data} />
    </div>
  );
}
