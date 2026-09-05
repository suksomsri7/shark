// backfill ชุด A ของ "บอร์ดงาน" (K1.1) — เติม position / cardNo / cardNoSeq / visibility ให้ข้อมูลเดิม
//
// รันซ้ำได้ (idempotent): แถวที่มีค่าแล้วจะถูกข้าม ⇒ รันกี่รอบผลเท่าเดิม
// ทำทีละบอร์ด ใน transaction เดียวต่อบอร์ด (บอร์ดหนึ่งล้ม ไม่ทิ้งครึ่ง ๆ กลาง ๆ · บอร์ดอื่นเดินต่อ)
//
// วิธีรัน
//   QC   :  pnpm exec tsx scripts/backfill-kanban-v2-a.mts            (ใช้ .env.qc · มีด่านกัน prod)
//   PROD :  ALLOW_PROD_BACKFILL=1 pnpm exec tsx scripts/backfill-kanban-v2-a.mts
//           (โหลด .env = production · ต้องจงใจตั้งตัวแปรเอง · รันหลัง deploy K1.1 ขึ้น Vercel แล้ว)
//
// 🔴 ทำไม visibility ของบอร์ดเก่าต้องเป็น TENANT ไม่ใช่ PRIVATE (ค่า default ของ schema):
//    ก่อน K1.1 บอร์ดไม่มีแนวคิด "สมาชิกบอร์ด" — ทุกคนในร้านที่มีสิทธิ์โมดูลเห็นทุกบอร์ด
//    ถ้าปล่อยเป็น PRIVATE ตาม default ⇒ วันที่ deploy พนักงานทั้งร้าน "บอร์ดหาย" พร้อมกัน
//    เครื่องหมายว่า "บอร์ดนี้มีมาก่อน K1.1" = คอลัมน์ ACTIVE ของบอร์ดยังไม่มี position สักตัว
//    (บอร์ดที่โค้ดใหม่สร้างมี position ตั้งแต่แรก ⇒ ไม่ถูกแตะ · บอร์ดใหม่คง PRIVATE ตามที่ออกแบบ)

import { existsSync } from "node:fs";

// ── env: QC เป็นค่าเริ่มต้น · prod ต้องจงใจ ──
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
  console.log(`[env] backfill-kanban-v2-a · DB ${host}`);
} else {
  console.error(
    `🔴 หยุด! ไม่พบ ${QC_FILE} และ env ก็ไม่มี DATABASE_URL+DIRECT_URL\n` +
      `   ถ้าจะรันกับฐานข้อมูลจริง ต้องตั้ง ALLOW_PROD_BACKFILL=1 มาเอง`,
  );
  process.exit(1);
}

const { prisma } = await import("@/lib/core/db");
const ord = (await import("@/lib/modules/kanban/ordering" as string)) as {
  keysBetween: (a: string | null, b: string | null, n: number) => string[];
};

type Row = { id: string; position: string | null };

/**
 * คืนคู่ (id, key) เฉพาะแถวที่ยังไม่มี position — เรียงตามลำดับที่ส่งเข้ามา
 * แถวที่มีค่าแล้วเป็น "หมุด": ช่องว่างระหว่างหมุดถูกเติมด้วยคีย์ระหว่างหมุดคู่นั้น
 * ⇒ ไม่มีการเขียนทับคีย์เดิมเลย ⇒ รันซ้ำไม่เปลี่ยนค่า
 */
function fillPositions(rows: Row[]): { id: string; position: string }[] {
  const out: { id: string; position: string }[] = [];
  let i = 0;
  let prev: string | null = null;
  while (i < rows.length) {
    if (rows[i]!.position) {
      prev = rows[i]!.position;
      i += 1;
      continue;
    }
    let j = i;
    while (j < rows.length && !rows[j]!.position) j += 1;
    const next: string | null = j < rows.length ? rows[j]!.position : null;
    let keys: string[];
    try {
      keys = ord.keysBetween(prev, next, j - i);
    } catch {
      // คีย์เดิมเรียงไม่สอดคล้องกับ sortOrder (ข้อมูลผิดรูป) — ต่อท้ายคีย์ก่อนหน้าแทน ไม่ให้ทั้งบอร์ดล้ม
      console.warn(`   ⚠️ คีย์เดิมเรียงไม่สอดคล้อง (${prev} → ${next}) — เติมต่อท้ายแทน`);
      keys = ord.keysBetween(prev, null, j - i);
    }
    for (let k = 0; k < keys.length; k += 1) out.push({ id: rows[i + k]!.id, position: keys[k]! });
    prev = keys.at(-1) ?? prev;
    i = j;
  }
  return out;
}

const boards = await prisma.kanbanBoard.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, name: true, cardNoSeq: true } });
let nBoardsTouched = 0;
let nVisibility = 0;
let nColumns = 0;
let nCards = 0;
let nCardNo = 0;
let nSeq = 0;

for (const board of boards) {
  const changed = await prisma.$transaction(async (tx) => {
    let touched = false;

    // ── 1. คอลัมน์ ACTIVE (เรียงเดิม sortOrder → createdAt) ──
    const columns = await tx.kanbanColumn.findMany({
      where: { boardId: board.id, status: "ACTIVE" },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, position: true },
    });
    // เครื่องหมาย "บอร์ดนี้มีมาก่อน K1.1" — ต้องอ่าน **ก่อน** เติม position
    const predatesK11 = columns.length > 0 && columns.every((c) => !c.position);
    if (predatesK11) {
      const r = await tx.kanbanBoard.updateMany({
        where: { id: board.id, visibility: "PRIVATE" },
        data: { visibility: "TENANT" },
      });
      if (r.count > 0) {
        nVisibility += r.count;
        touched = true;
      }
    }
    for (const u of fillPositions(columns)) {
      await tx.kanbanColumn.update({ where: { id: u.id }, data: { position: u.position } });
      nColumns += 1;
      touched = true;
    }

    // ── 2. การ์ด ACTIVE ต่อคอลัมน์ (เรียงเดิม sortOrder → createdAt) ──
    for (const col of columns) {
      const cards = await tx.kanbanCard.findMany({
        where: { columnId: col.id, status: "ACTIVE" },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: { id: true, position: true },
      });
      for (const u of fillPositions(cards)) {
        await tx.kanbanCard.update({ where: { id: u.id }, data: { position: u.position } });
        nCards += 1;
        touched = true;
      }
    }

    // ── 3. เลขการ์ดต่อบอร์ด (เรียง createdAt) + cardNoSeq = เลขสูงสุด ──
    //    นับรวมการ์ดที่เก็บเข้าคลังด้วย — เลขการ์ดต้องไม่ซ้ำทั้งบอร์ด (K1.4 จะใส่ unique)
    const all = await tx.kanbanCard.findMany({
      where: { boardId: board.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, cardNo: true },
    });
    let next = Math.max(0, ...all.map((c) => c.cardNo ?? 0)) + 1;
    for (const c of all) {
      if (c.cardNo != null) continue;
      await tx.kanbanCard.update({ where: { id: c.id }, data: { cardNo: next } });
      next += 1;
      nCardNo += 1;
      touched = true;
    }
    const maxNo = next - 1;
    if (all.length > 0 && board.cardNoSeq !== maxNo) {
      await tx.kanbanBoard.update({ where: { id: board.id }, data: { cardNoSeq: maxNo } });
      nSeq += 1;
      touched = true;
    }
    return touched;
  }, { timeout: 120_000, maxWait: 30_000 }); // บอร์ดใหญ่ = update ทีละแถวหลายสิบครั้งใน tx เดียว
  if (changed) {
    nBoardsTouched += 1;
    console.log(`  ✏️  ${board.name}`);
  }
}

console.log(
  `\n✅ backfill kanban v2-A เสร็จ · บอร์ดทั้งหมด ${boards.length} · แก้จริง ${nBoardsTouched}\n` +
    `   visibility→TENANT ${nVisibility} บอร์ด · cardNoSeq ${nSeq} บอร์ด\n` +
    `   position: คอลัมน์ ${nColumns} · การ์ด ${nCards} · cardNo ${nCardNo} ใบ`,
);
console.log(`BACKFILL_SUMMARY ${JSON.stringify({ boards: boards.length, touched: nBoardsTouched, visibility: nVisibility, columns: nColumns, cards: nCards, cardNo: nCardNo, cardNoSeq: nSeq })}`);
await prisma.$disconnect();
