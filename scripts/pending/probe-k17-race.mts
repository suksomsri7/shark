// probe: ติ๊ก 2 รายการสุดท้ายพร้อมกัน → ต้องได้ event kanban.checklist.completed 1 ใบ
import { prisma } from "@/lib/core/db";
const kq = (await import("../kanban-qc-env.mts" as string)) as { KQC: any; resolveKanbanScope: (p: any) => Promise<any> };
const { createChecklist, addItem, toggleItem } = await import("@/lib/modules/kanban/checklists");
import { readFileSync } from "node:fs";
const scope = await kq.resolveKanbanScope(prisma); const E = JSON.parse(readFileSync(kq.KQC.expectedPath, "utf8"));
const ctx = { tenantId: scope.tenantId, systemId: scope.systemId, actorUserId: E.users.owner.userId, role: "OWNER", permissions: new Set<string>() } as any;
const card = await prisma.kanbanCard.findFirst({ where: { boardId: E.boards.patong.id, status: "ACTIVE" } });
const cl = await createChecklist(ctx, card!.id, "race probe");
const a = await addItem(ctx, cl.id, "a"); const b = await addItem(ctx, cl.id, "b");
const before = await prisma.outboxEvent.count({ where: { type: "kanban.checklist.completed", payload: { path: ["checklistId"], equals: cl.id } } }).catch(() => 0);
await Promise.all([toggleItem(ctx, a.id, true), toggleItem(ctx, b.id, true)]);
const after = await prisma.outboxEvent.count({ where: { type: "kanban.checklist.completed", payload: { path: ["checklistId"], equals: cl.id } } }).catch(() => -1);
console.log(`completed events: ${after - before} (ต้องเป็น 1)`);
await prisma.kanbanChecklist.delete({ where: { id: cl.id } }); await prisma.$disconnect();
