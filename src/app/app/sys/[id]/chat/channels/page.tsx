import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { ChatChannelsSection, chatTabs } from "@/lib/modules/chat/ui";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";

// หน้าย่อย "เชื่อมช่องทาง" ของระบบแชท — LINE OA · แชทหน้าเว็บ · เชื่อมระบบสมาชิก
export default async function ChatChannelsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  // `?err=<ข้อความไทย>` — แสดง inline ในการ์ด (แบบเดียวกับโมดูลบัญชี/คลินิก) ไม่ใช่ Alert
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const errRaw = sp?.err;
  const err = Array.isArray(errRaw) ? errRaw[0] : errRaw;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;

  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "CHAT" } });
  if (!sys) notFound();

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <PageHeader title={sys.name} back={{ href: `/app/sys/${id}`, label: sys.name }} desc="เชื่อมช่องทาง · ผู้ช่วย AI · คลังตัวอย่างคำตอบ" />
      <ModuleTabs items={chatTabs(id)} />
      <ChatChannelsSection systemId={id} tenantId={tenantId} err={err} />
    </div>
  );
}
