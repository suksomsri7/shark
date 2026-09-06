// ซ่อมความคลาดเคลื่อนของ KanbanCard.labels (Json denormalized) ที่ไม่ตรงกับ KanbanCardLabel (join table)
// สาเหตุ: qc-kanban-k2.1.mts finally block คืนสภาพ join table ตรง ๆ (deleteMany + create) โดยไม่เรียก
// syncCardLabelJson ซ้ำ ⇒ การ์ดที่เคยถูกทดสอบเพิ่มป้ายชั่วคราว (S2.3) จะค้างชื่อป้ายใน Json ถาวร
// แม้ join table จะถูกลบคืนแล้วก็ตาม — สคริปต์นี้แค่ "ซ่อมข้อมูล" ไม่แตะ business logic
import { readFileSync } from "node:fs";
const accEnv = (await import("../acc-v2-env.mts" as string)) as { loadQcEnv: () => unknown };
accEnv.loadQcEnv();
const { prisma } = await import("@/lib/core/db");
const E = JSON.parse(readFileSync("scripts/kanban-expected.json", "utf8"));
const tenantId = E.tenantId as string;

const cards = await prisma.kanbanCard.findMany({ where: { tenantId }, select: { id: true, labels: true } });
let fixed = 0;
for (const card of cards) {
  const links = await (prisma as any).kanbanCardLabel.findMany({
    where: { cardId: card.id },
    select: { label: { select: { name: true, sortOrder: true } } },
  });
  const names: string[] = links
    .map((l: any) => l.label)
    .sort((a: any, b: any) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "th"))
    .map((l: any) => l.name);
  const current = Array.isArray(card.labels) ? (card.labels as string[]) : [];
  const same = current.length === names.length && current.every((v, i) => v === names[i]);
  if (!same) {
    await prisma.kanbanCard.update({ where: { id: card.id }, data: { labels: names } });
    fixed++;
    console.log(`fix ${card.id}: ${JSON.stringify(current)} -> ${JSON.stringify(names)}`);
  }
}
console.log(`ตรวจ ${cards.length} การ์ด · ซ่อม ${fixed} ใบ`);
await prisma.$disconnect();
