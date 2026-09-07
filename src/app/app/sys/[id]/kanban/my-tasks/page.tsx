import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { toActor } from "@/lib/modules/kanban/access";
import { listInbox, listInboxTargets } from "@/lib/modules/kanban/inbox";
import { myTasksOverview } from "@/lib/modules/kanban/my-tasks";
import { KanbanTabs } from "@/components/kanban/KanbanTabs";
import { MyTasks } from "@/components/kanban/MyTasks";
import { PageHeader } from "@/components/ui/PageHeader";

// หน้าย่อย "งานของฉัน" + "กล่องงานเข้า" ของระบบบอร์ดงาน (K1.13 — เขียนใหม่ทั้งหน้า: เดิมเป็น
// `KanbanMyTasksSection` แบบ list เดียวไม่จัดกลุ่ม ใน `ui.tsx` — ตอนนี้เรียก `myTasksOverview` + จัดกลุ่ม
// ตามกำหนดส่ง · K2.8 เพิ่ม `listInbox`/`listInboxTargets` ให้คอลัมน์ซ้าย + หัวจอ "สวัสดีตอน…{ชื่อ}")
export default async function KanbanMyTasksPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;

  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "KANBAN" } });
  if (!sys) notFound();

  const ctx = { tenantId, systemId: id, actorUserId: auth.user.id };
  const actor = toActor(auth.user.id, auth.active);
  const now = new Date();
  const [overview, inboxItems, inboxBoards] = await Promise.all([
    myTasksOverview(ctx, actor, { now }),
    listInbox(ctx, auth.user.id),
    listInboxTargets(ctx, actor),
  ]);

  return (
    <div className="flex max-w-5xl flex-col gap-5">
      <PageHeader title={sys.name} back={{ href: `/app/sys/${id}`, label: sys.name }} desc="งานของฉัน — การ์ดที่มอบหมายให้ฉันข้ามทุกบอร์ด" />
      <KanbanTabs systemId={id} />
      <MyTasks
        systemId={id}
        overview={overview}
        nowMs={now.getTime()}
        userName={auth.user.name ?? auth.user.email ?? "คุณ"}
        inboxItems={inboxItems}
        inboxBoards={inboxBoards}
      />
    </div>
  );
}
