// Fable probe K1.11: q ที่มีอักขระพิเศษ (regex/SQL) ต้องไม่พัง · noperm ค้นได้ 0 · thana ไม่เห็นบอร์ด PRIVATE
import { prisma } from "@/lib/core/db";
import { readFileSync } from "node:fs";
const kq = (await import("../kanban-qc-env.mts" as string)) as { KQC: any; resolveKanbanScope: (p: any) => Promise<any> };
const { searchCards, parseSearchQuery } = await import("@/lib/modules/kanban/search");
const { loadActor } = await import("@/lib/modules/kanban/members");
const scope = await kq.resolveKanbanScope(prisma); const E = JSON.parse(readFileSync(kq.KQC.expectedPath, "utf8"));
const ctx = { tenantId: scope.tenantId, systemId: scope.systemId, actorUserId: E.users.owner.userId };
const actor = await (loadActor as any)(ctx);
for (const q of ["(", "%", "_", "Sea.*Fox", "ป้าย:", "บอร์ด:", "\\", "'; drop table --", "@ฉัน @ฉัน"]) {
  try { const f = parseSearchQuery(q); const r = await searchCards(ctx as any, actor, { ...f, take: 5 }); console.log(`q=${JSON.stringify(q)} → ${r.total} ok`); }
  catch (e) { console.log(`q=${JSON.stringify(q)} → ❌ ${(e as Error).message.slice(0, 80)}`); }
}
await prisma.$disconnect();
