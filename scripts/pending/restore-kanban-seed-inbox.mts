// เครื่องมือครั้งเดียว (K1.14) — คืนการ์ด 5 ใบของคอลัมน์ "กล่องงานเข้า" บอร์ดป่าตองกลับที่เดิม
//
// ทำไมต้องมี: สเปคภาพ `board-patong-dragged` ของ WO 1.5 ลากการ์ดใบแรกของคอลัมน์ 1 ไปคอลัมน์ 3 จริง
// แล้ว **ไม่เคยคืนสภาพ** ⇒ ทุกครั้งที่ใครถ่ายภาพชุด 1.5 ชุดข้อมูล QC จะเสียไป 1 ใบอย่างถาวร
// วันนี้ (6 ก.ย.) สะสมจนคอลัมน์แรกเหลือ 0 จาก 5 · ตัวป้องกันถาวรอยู่ใน `visual-kanban.mts` แล้ว
// (snapshot/restore ของ WO 1.5) — ไฟล์นี้แค่ล้างหนี้ที่ค้างอยู่ก่อนหน้า
//
// รัน: pnpm exec tsx scripts/pending/restore-kanban-seed-inbox.mts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();
if (!host.includes("ep-plain-art")) throw new Error(`ปฏิเสธ: host ไม่ใช่ QC (${host})`);
const { prisma } = await import("@/lib/core/db");
const kq = (await import("../kanban-qc-env.mts" as string)) as { KQC: Any };
const { readFileSync } = await import("node:fs");
const E = JSON.parse(readFileSync(kq.KQC.expectedPath, "utf8"));

const TITLES = [
  "ลูกค้าถามคอร์ส Open Water รอบเสาร์นี้ — ยังไม่ตอบ",
  "ขอใบเสนอราคา ทริปกลุ่มบริษัท ABC 12 คน",
  "แจ้งซ่อม: ไฟใต้น้ำห้องล้างอุปกรณ์ดับ 2 ดวง",
  "หาครูสอนแทน พี่ก้อง ลาป่วย 8–9 ก.ย.",
  "ตอบรีวิว Google 3 ดาวของคุณสมหญิง",
];

const boardId = E.boards.patong.id as string;
const inboxId = E.boards.patong.columns["กล่องงานเข้า"] as string;
const ctx = { tenantId: E.tenantId as string, systemId: E.systemId as string, actorUserId: E.users.owner.userId as string };
const moves = (await import("@/lib/modules/kanban/moves" as string)) as Any;

let moved = 0;
// ลากกลับตามลำดับในไฟล์ seed — ใบแรกของ TITLES ต้องอยู่บนสุด ⇒ ย้ายจากท้ายรายการขึ้นมา
for (const title of [...TITLES].reverse()) {
  const card = await prisma.kanbanCard.findFirst({ where: { boardId, title, status: "ACTIVE" }, select: { id: true, columnId: true } });
  if (!card) { console.log(`  ⚠️  ไม่พบการ์ด "${title}" (ข้าม)`); continue; }
  if (card.columnId === inboxId) continue;
  const res = await moves.moveCard(ctx, { cardId: card.id, toColumnId: inboxId, force: true });
  if (res?.ok === false) { console.log(`  ❌ ${title} — ${res.message ?? res.code}`); continue; }
  moved++;
}
const counts = await prisma.kanbanColumn.findMany({
  where: { boardId, status: "ACTIVE" },
  orderBy: { position: "asc" },
  select: { name: true, _count: { select: { cards: { where: { status: "ACTIVE" } } } } },
});
console.log(`\n✅ ย้ายกลับ ${moved} ใบ · สภาพคอลัมน์ตอนนี้:`);
for (const c of counts) console.log(`   ${c.name} = ${c._count.cards}`);
await prisma.$disconnect();
