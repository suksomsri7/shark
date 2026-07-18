import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { ChatInboxSection, chatTabs } from "@/lib/modules/chat/ui";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";
import { AutoRefresh } from "@/components/queue-auto-refresh";

// หน้าเต็มจอของ Chat — เลือกบทสนทนาด้วย ?c=
export default async function ChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ c?: string }>;
}) {
  const { id } = await params;
  const { c } = await searchParams;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;

  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId } });
  if (!sys || sys.type !== "CHAT") notFound();

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      {/* เห็นข้อความ/แจ้งเตือนใหม่โดยไม่ต้องกด F5 (P1 liveness — เหมือนจอคิว) */}
      <AutoRefresh ms={15000} />
      <PageHeader title={sys.name} back={{ href: `/app/sys/${id}`, label: sys.name }} />
      <ModuleTabs items={chatTabs(id)} />
      <ChatInboxSection systemId={id} tenantId={tenantId} conversationId={c} />
    </div>
  );
}
