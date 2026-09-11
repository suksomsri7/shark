import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { canReadMember, toMemberActor } from "@/lib/modules/member/access";
import {
  CAMPAIGN_CHANNEL_LABELS,
  CAMPAIGN_STATUS_LABELS,
  RECIPIENT_STATUS_LABELS,
  VARIANT_LABELS,
  campaignStats,
  canManageCampaigns,
  getCampaign,
  listRecipients,
  resolveCampaignCtx,
} from "@/lib/modules/marketing";
import { PageHeader } from "@/components/ui/PageHeader";
import { MemberTabs } from "@/components/member/MemberTabs";
import { CampaignDetail, type RecipientRowView, type VariantRowView } from "@/components/member/CampaignDetail";

// หน้า "ระบบสมาชิก › แคมเปญ › รายละเอียด" (M3.2 · ภาพ 07 ครึ่งล่าง)
// `/app/sys/{id}/member/campaigns/{campaignId}` — ผลต่อ variant + กลุ่มเทียบ + uplift + รายชื่อผู้รับ
export default async function MemberCampaignDetailPage({ params }: { params: Promise<{ id: string; campaignId: string }> }) {
  const { id, campaignId } = await params;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;

  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "MEMBER" } });
  if (!sys) notFound();

  const actor = toMemberActor(auth.user.id, auth.active);
  if (!canReadMember(actor)) notFound();
  const canManage = canManageCampaigns(actor);

  const ctx = await resolveCampaignCtx(tenantId, id, auth.user.id);
  if (!ctx.systemId) notFound();
  const campaign = await getCampaign(ctx, actor, campaignId).catch(() => null);
  if (!campaign) notFound();

  const [stats, recipients] = await Promise.all([campaignStats(ctx, actor, campaignId), listRecipients(ctx, actor, campaignId)]);

  const money = (satang: number): string => `฿${Math.round(satang / 100).toLocaleString("th-TH")}`;
  const dateFmt = new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "2-digit" });

  const variants: VariantRowView[] = stats.variants.map((v) => ({
    key: v.variant,
    label: VARIANT_LABELS[v.variant],
    sent: v.sent,
    opened: v.opened,
    used: v.used,
    usePctLabel: `(${Math.round(v.usePct)}%)`,
    saleBaht: v.saleSatang > 0 ? money(v.saleSatang) : "—",
    costBaht: money(v.costSatang),
    roiLabel: v.costSatang > 0 ? `${v.roi.toFixed(1)}x` : "—",
  }));

  const rows: RecipientRowView[] = recipients.map((r) => ({
    id: r.id,
    name: r.name,
    variantLabel: VARIANT_LABELS[r.variant],
    statusLabel: RECIPIENT_STATUS_LABELS[r.status],
    channelLabel: r.channel ? CAMPAIGN_CHANNEL_LABELS[r.channel] : "—",
    error: r.error,
    openedLabel: r.openedAt ? `เปิด ${dateFmt.format(r.openedAt)}` : "",
    usedLabel: r.usedAt ? `ใช้สิทธิ์ ${dateFmt.format(r.usedAt)}` : "",
  }));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={campaign.name}
        back={{ href: `/app/sys/${id}/member/campaigns`, label: "แคมเปญ" }}
        desc={campaign.sentAt ? `ส่งเมื่อ ${dateFmt.format(campaign.sentAt)}` : campaign.scheduledAt ? `ตั้งเวลาส่ง ${dateFmt.format(campaign.scheduledAt)}` : "ยังไม่ได้ส่ง"}
      />
      <MemberTabs systemId={id} actor={actor} />

      <CampaignDetail
        systemId={id}
        campaignId={campaign.id}
        statusLabel={CAMPAIGN_STATUS_LABELS[campaign.status]}
        segmentName={campaign.segmentName}
        channelsLabel={campaign.channels.map((ch) => CAMPAIGN_CHANNEL_LABELS[ch]).join(" · ")}
        canManage={canManage}
        canCancel={campaign.status !== "CANCELLED"}
        variants={variants}
        upliftUsePctLabel={`${stats.uplift.usePct >= 0 ? "+" : ""}${stats.uplift.usePct.toFixed(1)}%`}
        upliftPerHeadLabel={money(Math.round(stats.uplift.saleSatangPerHead))}
        totals={{
          audience: stats.total.audience,
          sent: stats.total.sent,
          opened: stats.total.opened,
          used: stats.total.used,
          saleBaht: money(stats.total.saleSatang),
          costBaht: money(stats.total.costSatang),
          roiLabel: stats.total.costSatang > 0 ? `${stats.total.roi.toFixed(1)}x` : "—",
        }}
        recipients={rows}
      />
    </div>
  );
}
