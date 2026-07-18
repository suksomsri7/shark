import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { MeetingContent, meetingTabs } from "@/lib/modules/meeting/ui";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";
import { AutoRefresh } from "@/components/queue-auto-refresh";

// หน้าเต็มจอของ Meeting — สลับห้อง (?c=) + เปิดเธรด (?t=)
export default async function MeetingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ c?: string; t?: string }>;
}) {
  const { id } = await params;
  const { c, t } = await searchParams;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;

  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId } });
  if (!sys || sys.type !== "MEETING") notFound();

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      {/* เห็นข้อความ/สมาชิกใหม่โดยไม่ต้องกด F5 (P1 liveness — เหมือน chat/queue) */}
      <AutoRefresh ms={7000} />
      <PageHeader title={sys.name} back={{ href: `/app/sys/${id}`, label: sys.name }} />
      <ModuleTabs items={meetingTabs(id)} />
      <MeetingContent systemId={id} tenantId={tenantId} channelId={c} threadParentId={t} />
    </div>
  );
}
