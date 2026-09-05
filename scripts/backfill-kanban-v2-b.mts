// backfill ชุด B ของ "บอร์ดงาน" (K1.2) — ย้ายข้อมูลเดิมเข้าตารางใหม่
//   1) `KanbanCard.labels` (Json = ชื่อป้าย) → `KanbanLabel` ต่อบอร์ด + แถวเชื่อม `KanbanCardLabel`
//   2) `KanbanCard.assigneeUserId` → `KanbanCardAssignee`
//
// รันซ้ำได้ (idempotent): ป้ายที่มีชื่อนั้นแล้วไม่สร้างซ้ำ · แถวเชื่อม/ผู้รับผิดชอบใช้ createMany skipDuplicates
// ⇒ รันกี่รอบ id เดิม จำนวนแถวเดิม (ข้อสอบ K1.2-S2.5 ถ่าย snapshot เทียบก่อน/หลัง)
// ทำทีละบอร์ด ใน transaction เดียวต่อบอร์ด (บอร์ดหนึ่งล้ม ไม่ทิ้งครึ่ง ๆ กลาง ๆ · บอร์ดอื่นเดินต่อ)
//
// วิธีรัน
//   QC   :  pnpm exec tsx scripts/backfill-kanban-v2-b.mts            (ใช้ .env.qc · มีด่านกัน prod)
//   PROD :  ALLOW_PROD_BACKFILL=1 pnpm exec tsx scripts/backfill-kanban-v2-b.mts
//           (โหลด .env = production · ต้องจงใจตั้งตัวแปรเอง · รันหลัง deploy K1.2 ขึ้น Vercel แล้ว)
//
// 🔴 ไม่ลบ/ไม่แก้ `labels` Json และ `assigneeUserId` เดิมเลย — ทั้งสองที่ถูกเขียนคู่กันตลอด P1
//    (โค้ดรอบ deploy ก่อนยังอ่าน Json อยู่ · ตัดทิ้งเมื่อไม่มีใครอ่านแล้ว = คนละ WO)

import { existsSync } from "node:fs";

// ── env: QC เป็นค่าเริ่มต้น · prod ต้องจงใจ (สำเนากติกาเดียวกับ backfill A) ──
const QC_FILE = process.env.QC_ENV_FILE ?? ".env.qc";
const ALLOW_PROD = process.env.ALLOW_PROD_BACKFILL === "1";
if (ALLOW_PROD) {
  try {
    process.loadEnvFile(process.env.BACKFILL_ENV_FILE ?? ".env");
  } catch {
    /* env ถูก export มาแล้วก็ได้ */
  }
  console.warn("⚠️  ALLOW_PROD_BACKFILL=1 — กำลังรันบนฐานข้อมูลจริงตามที่สั่ง");
} else if (existsSync(QC_FILE) || (process.env.DATABASE_URL && process.env.DIRECT_URL)) {
  // loadQcEnv มีด่านกัน prod ในตัว (host ของ branch production = ตายทันที)
  const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
  const { host } = accEnv.loadQcEnv();
  console.log(`[env] backfill-kanban-v2-b · DB ${host}`);
} else {
  console.error(
    `🔴 หยุด! ไม่พบ ${QC_FILE} และ env ก็ไม่มี DATABASE_URL+DIRECT_URL\n` +
      `   ถ้าจะรันกับฐานข้อมูลจริง ต้องตั้ง ALLOW_PROD_BACKFILL=1 มาเอง`,
  );
  process.exit(1);
}

const { prisma } = await import("@/lib/core/db");
const lbl = (await import("@/lib/modules/kanban/labels" as string)) as {
  KANBAN_LABEL_COLORS: readonly ("SLATE" | "BLUE" | "GREEN" | "AMBER" | "RED" | "PURPLE")[];
  cardLabelNames: (v: unknown) => string[];
};
const COLORS = lbl.KANBAN_LABEL_COLORS;

const boards = await prisma.kanbanBoard.findMany({
  orderBy: { createdAt: "asc" },
  select: { id: true, name: true, tenantId: true, systemId: true },
});
let nBoardsTouched = 0;
let nLabels = 0;
let nLinks = 0;
let nAssignees = 0;

for (const board of boards) {
  const changed = await prisma.$transaction(
    async (tx) => {
      let touched = false;

      // การ์ดทุกใบของบอร์ด (รวมที่เก็บเข้าคลัง — ป้ายของการ์ดเก่าต้องไม่หายตอนกู้คืน) เรียง createdAt
      // ⇒ ลำดับ "ชื่อป้ายที่พบครั้งแรก" คงที่ ⇒ สีที่ไล่ให้แต่ละป้ายคงที่ (รันซ้ำได้ผลเดิม)
      const cards = await tx.kanbanCard.findMany({
        where: { boardId: board.id },
        orderBy: { createdAt: "asc" },
        select: { id: true, labels: true, assigneeUserId: true },
      });

      const namesByCard = new Map<string, string[]>();
      const orderedNames: string[] = [];
      for (const c of cards) {
        const names = [...new Set(lbl.cardLabelNames(c.labels).map((n) => n.trim()).filter(Boolean))];
        namesByCard.set(c.id, names);
        for (const n of names) if (!orderedNames.includes(n)) orderedNames.push(n);
      }

      // ── 1. ป้ายของบอร์ด — ชื่อที่ยังไม่มีเท่านั้นที่ถูกสร้าง (ของเดิมไม่ถูกแตะ) ──
      const existing = await tx.kanbanLabel.findMany({
        where: { boardId: board.id },
        select: { id: true, name: true },
      });
      const idByName = new Map(existing.map((l) => [l.name, l.id]));
      let slot = existing.length;
      for (const name of orderedNames) {
        if (idByName.has(name)) continue;
        const created = await tx.kanbanLabel.create({
          data: {
            tenantId: board.tenantId,
            systemId: board.systemId,
            boardId: board.id,
            name,
            color: COLORS[slot % COLORS.length]!,
            sortOrder: slot,
          },
          select: { id: true },
        });
        idByName.set(name, created.id);
        slot += 1;
        nLabels += 1;
        touched = true;
      }

      // ── 2. แถวเชื่อมการ์ด × ป้าย ──
      const linkRows: { cardId: string; labelId: string; tenantId: string }[] = [];
      for (const c of cards) {
        for (const name of namesByCard.get(c.id) ?? []) {
          const labelId = idByName.get(name);
          if (labelId) linkRows.push({ cardId: c.id, labelId, tenantId: board.tenantId });
        }
      }
      if (linkRows.length > 0) {
        const r = await tx.kanbanCardLabel.createMany({ data: linkRows, skipDuplicates: true });
        if (r.count > 0) {
          nLinks += r.count;
          touched = true;
        }
      }

      // ── 3. ผู้รับผิดชอบ (ช่องเดิม → ตารางใหม่) ──
      const asgRows = cards
        .filter((c) => c.assigneeUserId)
        .map((c) => ({ cardId: c.id, userId: c.assigneeUserId!, tenantId: board.tenantId }));
      if (asgRows.length > 0) {
        const r = await tx.kanbanCardAssignee.createMany({ data: asgRows, skipDuplicates: true });
        if (r.count > 0) {
          nAssignees += r.count;
          touched = true;
        }
      }

      return touched;
    },
    { timeout: 120_000, maxWait: 30_000 },
  );
  if (changed) {
    nBoardsTouched += 1;
    console.log(`  ✏️  ${board.name}`);
  }
}

console.log(
  `\n✅ backfill kanban v2-B เสร็จ · บอร์ดทั้งหมด ${boards.length} · แก้จริง ${nBoardsTouched}\n` +
    `   ป้ายใหม่ ${nLabels} · แถวเชื่อมการ์ด×ป้าย ${nLinks} · ผู้รับผิดชอบ ${nAssignees}`,
);
console.log(
  `BACKFILL_SUMMARY ${JSON.stringify({ boards: boards.length, touched: nBoardsTouched, labels: nLabels, cardLabels: nLinks, assignees: nAssignees })}`,
);
await prisma.$disconnect();
