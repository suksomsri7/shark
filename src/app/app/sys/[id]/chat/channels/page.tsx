import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { ChatChannelsSection, chatTabs } from "@/lib/modules/chat/ui";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";

// หน้าย่อย "เชื่อมช่องทาง" ของระบบแชท — LINE OA · แชทหน้าเว็บ · เชื่อมระบบสมาชิก
export default async function ChatChannelsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;

  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "CHAT" } });
  if (!sys) notFound();

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <PageHeader title={sys.name} back={{ href: `/app/sys/${id}`, label: sys.name }} desc="เชื่อมช่องทาง — LINE OA · แชทหน้าเว็บ · ระบบสมาชิก" />
      <ModuleTabs items={chatTabs(id)} />
      <ChatChannelsSection systemId={id} tenantId={tenantId} />
    </div>
  );
}
