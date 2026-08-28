import { notFound } from "next/navigation";
import { prisma } from "@/lib/core/db";
import { resolveLocale } from "@/lib/modules/chat/service";
import { ChatWidget } from "./ChatWidget";

// หน้า widget แชทหน้าเว็บ (public, embeddable) — ลูกค้าทักร้านผ่านเว็บ
export default async function WebchatWidgetPage({
  params,
  searchParams,
}: {
  params: Promise<{ connectionId: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { connectionId } = await params;
  const { lang } = await searchParams;
  const conn = await prisma.chatChannelConnection.findUnique({ where: { id: connectionId } });
  if (!conn || conn.type !== "WEBCHAT" || conn.status === "DISABLED") notFound();

  let title = conn.displayName;
  const setting = await prisma.chatSetting.findUnique({ where: { systemId: conn.systemId } });
  // เดิมฮาร์ดโค้ด `.th` — ร้านที่ตั้ง greeting ไว้ภาษาอื่นจึงไม่เคยแสดงเลย (B8)
  // resolveLocale ไม่กลืน "" ที่ร้านตั้งใจปิดข้อความ · null = ไม่มีภาษาไหนเลย → ซ่อนบรรทัด
  const greeting = resolveLocale(setting?.greetingMessage, lang, "th") ?? undefined;

  const sys = await prisma.appSystem.findFirst({ where: { id: conn.systemId } });
  if (sys?.name) title = sys.name;

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-3 p-4">
      <ChatWidget connectionId={conn.id} title={title} greeting={greeting} />
    </div>
  );
}
