import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { canReadMember, toMemberActor } from "@/lib/modules/member/access";
import { listSegments } from "@/lib/modules/member/segments";
import { listTemplates } from "@/lib/modules/voucher";
import { canManageCampaigns } from "@/lib/modules/marketing";
import { PageHeader } from "@/components/ui/PageHeader";
import { MemberTabs } from "@/components/member/MemberTabs";
import { CampaignWizard, type WizardSegment, type WizardVoucher } from "@/components/member/CampaignWizard";

// หน้า "ระบบสมาชิก › แคมเปญ › สร้างแคมเปญใหม่" (M3.2 · ภาพ 21)
// `/app/sys/{id}/member/campaigns/new` — 3 ขั้น + แผงตัวอย่าง/ประมาณการทางขวา
//
// 🔴 คนที่ไม่มีสิทธิ์จัดการแคมเปญยังเปิดดูได้ (ตัวสร้างปิดปุ่มบันทึก/ส่งให้เอง) — ด่านจริงอยู่ที่ action
export default async function MemberCampaignNewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;

  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "MEMBER" } });
  if (!sys) notFound();

  const actor = toMemberActor(auth.user.id, auth.active);
  if (!canReadMember(actor)) notFound();
  const canManage = canManageCampaigns(actor);

  const ctx = { tenantId, systemId: id, actorUserId: auth.user.id };
  const [segments, templates, tenant] = await Promise.all([
    listSegments(ctx, actor),
    listTemplates(ctx),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
  ]);

  const kindLabel = (kind: string, value: number): string =>
    kind === "FIXED" ? `฿${Math.round(value / 100).toLocaleString("th-TH")}` : kind === "PERCENT" ? `ลด ${value}%` : "สิทธิ์ฟรี";

  const segmentViews: WizardSegment[] = segments.map((s) => ({
    id: s.id,
    name: s.name,
    summary: s.summary,
    lastCount: s.lastCount,
    definition: s.definition,
  }));
  const voucherViews: WizardVoucher[] = templates
    .filter((t) => t.active)
    .map((t) => ({ id: t.id, name: t.name, value: t.value, kindLabel: kindLabel(t.kind, t.value) }));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="สร้างแคมเปญใหม่"
        back={{ href: `/app/sys/${id}/member/campaigns`, label: "แคมเปญ" }}
        desc="เลือกกลุ่มเป้าหมาย เขียนข้อความ แล้วดูตัวอย่างกับต้นทุนก่อนกดส่งจริง"
      />
      <MemberTabs systemId={id} actor={actor} />

      <CampaignWizard
        systemId={id}
        shopName={tenant?.name ?? "ร้านของคุณ"}
        segments={segmentViews}
        vouchers={voucherViews}
        canManage={canManage}
      />
    </div>
  );
}
