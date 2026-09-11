import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { canReadMember, toMemberActor } from "@/lib/modules/member/access";
import { CAMPAIGN_CHANNEL_LABELS, CAMPAIGN_STATUS_LABELS, canManageCampaigns, listCampaignsV2, resolveCampaignCtx } from "@/lib/modules/marketing";
import { PageHeader } from "@/components/ui/PageHeader";
import { MemberTabs } from "@/components/member/MemberTabs";
import { CampaignsTable, type CampaignRowView } from "@/components/member/CampaignsTable";

// หน้า "ระบบสมาชิก › แคมเปญ" (M3.2 · ภาพ ledger/design-member/07-promotion-journey.png ครึ่งล่าง)
// `/app/sys/{id}/member/campaigns` — ตารางแคมเปญพร้อมผลลัพธ์ต่อแถว + ทางเข้าตัวสร้าง 3 ขั้น
//
// 🔴 ระบบต้องเป็น MEMBER ของร้านนี้จริง + อ่านโมดูลสมาชิกได้ → ไม่งั้น notFound() (404-not-403 §6.4)
// 🔴 แคมเปญเก็บอยู่ใน "ระบบการตลาด" ของร้าน — เปิดใช้ให้อัตโนมัติเฉพาะคนที่จัดการแคมเปญได้
export default async function MemberCampaignsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;

  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "MEMBER" } });
  if (!sys) notFound();

  const actor = toMemberActor(auth.user.id, auth.active);
  if (!canReadMember(actor)) notFound();
  const canManage = canManageCampaigns(actor);

  const ctx = await resolveCampaignCtx(tenantId, id, auth.user.id, { create: canManage });
  const list = ctx.systemId ? await listCampaignsV2(ctx, actor) : [];

  const money = (satang: number): string => `฿${Math.round(satang / 100).toLocaleString("th-TH")}`;
  const rows: CampaignRowView[] = list.map((c) => ({
    id: c.id,
    name: c.name,
    statusLabel: CAMPAIGN_STATUS_LABELS[c.status],
    segmentName: c.segmentName,
    channelsLabel: c.channels.map((ch) => CAMPAIGN_CHANNEL_LABELS[ch]).join(" · "),
    sent: c.sent,
    opened: c.opened,
    used: c.used,
    usePctLabel: c.sent > 0 ? `(${Math.round((c.used / c.sent) * 100)}%)` : "",
    saleBaht: c.saleSatang > 0 ? money(c.saleSatang) : "—",
    costBaht: money(c.costSatang),
    roiLabel: c.costSatang > 0 ? `${c.roi.toFixed(1)}x` : "—",
  }));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="แคมเปญ"
        back={{ href: `/app/sys/${id}`, label: sys.name }}
        desc="เลือกกลุ่มเป้าหมาย เขียนข้อความ แล้ววัดผลจริงเทียบกับกลุ่มที่ไม่ได้ส่ง (holdout)"
        actions={
          canManage ? (
            <Link data-testid="campaigns-add" href={`/app/sys/${id}/member/campaigns/new`} className="btn btn-primary text-sm">
              สร้างแคมเปญ
            </Link>
          ) : null
        }
      />
      <MemberTabs systemId={id} actor={actor} />

      <div data-testid="campaigns-page" className="flex flex-col gap-4">
        <CampaignsTable systemId={id} rows={rows} />
      </div>
    </div>
  );
}
