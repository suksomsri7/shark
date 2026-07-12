import { notFound } from "next/navigation";
import { prisma } from "@/lib/core/db";
import { ChatWidget } from "./ChatWidget";

// หน้า widget แชทหน้าเว็บ (public, embeddable) — ลูกค้าทักร้านผ่านเว็บ
export default async function WebchatWidgetPage({
  params,
}: {
  params: Promise<{ connectionId: string }>;
}) {
  const { connectionId } = await params;
  const conn = await prisma.chatChannelConnection.findUnique({ where: { id: connectionId } });
  if (!conn || conn.type !== "WEBCHAT" || conn.status === "DISABLED") notFound();

  let title = conn.displayName;
  const setting = await prisma.chatSetting.findUnique({ where: { systemId: conn.systemId } });
  const greeting = (setting?.greetingMessage as { th?: string } | null)?.th;

  const sys = await prisma.appSystem.findFirst({ where: { id: conn.systemId } });
  if (sys?.name) title = sys.name;

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-3 p-4">
      <ChatWidget connectionId={conn.id} title={title} greeting={greeting} />
    </div>
  );
}
