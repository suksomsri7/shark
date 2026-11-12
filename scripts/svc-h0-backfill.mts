// svc-h0-backfill.mts — SVC H.0 · เติมข้อมูลโรงแรม V2 ให้การจองเดิม (ใบสั่ง ledger/svc-briefs/svc-brief-h.0.md §3)
//   1. HotelReservation BOOKED → CONFIRMED (UPDATE ชุดเดียว ข้ามร้าน)
//   2. การจองที่ยังไม่มี HotelBookingNight → สร้างคืน [checkInDate, checkOutDate) ราคา ratePerNightSatang · priceSource MANUAL
//      CONFIRMED/CHECKED_IN = counted true · CHECKED_OUT/CANCELLED/NO_SHOW/REFUNDED = counted false (ประวัติ) · HOLD ข้าม (H.3 สร้างเอง)
//      roomId ของคืน = reservation.roomId ถ้ามี ไม่งั้นห้องจาก RoomOccupancy STAY active ของการจองนั้น ไม่งั้น null (มติผู้คุม 7 พ.ย.)
//   3. การจอง CONFIRMED/CHECKED_IN ที่เพิ่งได้คืนรอบนี้ · มี roomId · ไม่มี STAY active → claimRoom ผ่าน facade @/lib/modules/rooms
//      ชน ⇒ นับ occupancyConflict + พิมพ์ id (ไม่ทับ · ไม่ลองซ้ำรอบหลัง — รายการ CONFLICT ใช้ตัดสินถอดเส้น legacy ใน H.3)
//   4. การจอง CONFIRMED/CHECKED_IN ที่ไม่มี HotelFolio → folio OPEN (ไม่มีค่าห้อง · audit H.7 post) · มัดจำที่จ่ายแล้ว → item DEPOSIT ติดลบ
//   5. policySnapshot ไม่แตะ (การจองเดิมไม่มีนโยบาย)
//
// ใช้ (ฐาน QC ผ่าน qc-svc.sh · prod = ผู้คุมสั่งหลัง deploy ตามเช็กลิสต์):
//   bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/svc-h0-backfill.mts --dry   # จำลองใน tx แล้ว rollback (ไม่เขียนอะไร)
//   bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/svc-h0-backfill.mts         # เขียนจริง (idempotent · รันซ้ำ = 0 ทุกตัว)
//
// 🔴 ทำทั้งหมดใน transaction เดียว — --dry = ผลเหมือนรันจริงทุกตัวเลข (ชนกันเองระหว่างการจองก็เห็น) แล้ว rollback
// 🔴 แถวใหม่ทุกแถวถือ tenantId/unitId ของการจองตัวเอง (X1) · พิมพ์เฉพาะ id/ตัวเลข — ไม่มีชื่อแขก/เบอร์
// ⚠️ import ด้านล่างไม่แตะฐานตอนโหลด (PrismaClient ต่อเมื่อคิวรีแรก) — ด่าน host loadSvcQcEnv ทำงานก่อนคิวรีใดเสมอ
import type { HotelReservationStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/core/db";
import { claimRoom } from "@/lib/modules/rooms";
import { bkkYmd } from "@/lib/core/quiet-hours";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";

const LABEL = "svc-h0-backfill";
loadSvcQcEnv(LABEL);

const argv = process.argv.slice(2);
const unknown = argv.filter((a) => a !== "--dry");
if (unknown.length) {
  console.error(`🔴 ${LABEL}: ไม่รู้จัก ${unknown.join(" ")} (ใช้ได้แค่ --dry)`);
  process.exit(2);
}
const dry = argv.includes("--dry");

type Summary = { bookedToConfirmed: number; nightsCreated: number; occupancyClaimed: number; occupancyConflict: number; foliosCreated: number };
type Tx = Prisma.TransactionClient;

const HOTEL_REF = "HotelReservation";
const LIVE: readonly HotelReservationStatus[] = ["CONFIRMED", "CHECKED_IN"];
const HISTORY: readonly HotelReservationStatus[] = ["CHECKED_OUT", "CANCELLED", "NO_SHOW", "REFUNDED"];
const DAY = 86_400_000;
const ymdToDb = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

class DryRollback extends Error {
  constructor(readonly summary: Summary, readonly conflicts: string[]) {
    super("dry-run rollback");
  }
}

async function run(tx: Tx): Promise<{ summary: Summary; conflicts: string[] }> {
  const s: Summary = { bookedToConfirmed: 0, nightsCreated: 0, occupancyClaimed: 0, occupancyConflict: 0, foliosCreated: 0 };
  const conflicts: string[] = [];

  // 1. BOOKED → CONFIRMED (ชุดเดียว ข้ามร้าน)
  s.bookedToConfirmed = (await tx.hotelReservation.updateMany({ where: { status: "BOOKED" }, data: { status: "CONFIRMED" } })).count;

  // 2+3. การจองที่ยังไม่มีคืนรายแถว
  const pending = await tx.hotelReservation.findMany({
    where: { status: { in: [...LIVE, ...HISTORY] }, bookingNights: { none: {} } },
    orderBy: [{ checkInDate: "asc" }, { createdAt: "asc" }],
    select: { id: true, tenantId: true, unitId: true, status: true, roomTypeId: true, roomId: true, checkInDate: true, checkOutDate: true, ratePerNightSatang: true },
  });
  const byId = new Map(pending.map((r) => [r.id, r]));
  const held = new Map<string, string>();
  const occ = await tx.roomOccupancy.findMany({
    where: { refType: HOTEL_REF, refId: { in: [...byId.keys()] }, kind: "STAY", active: true },
    select: { refId: true, roomId: true, tenantId: true, unitId: true },
  });
  for (const o of occ) {
    const r = byId.get(o.refId);
    if (r && r.tenantId === o.tenantId && r.unitId === o.unitId) held.set(o.refId, o.roomId); // X1: ห้องของร้าน/หน่วยเดียวกันเท่านั้น
  }
  for (const r of pending) {
    const live = LIVE.includes(r.status);
    const start = r.checkInDate.getTime();
    const end = r.checkOutDate.getTime();
    const roomId = r.roomId ?? held.get(r.id) ?? null;
    const data: {
      tenantId: string; unitId: string; reservationId: string; roomTypeId: string; roomId: string | null; date: Date; priceSatang: number; priceSource: string; counted: boolean;
    }[] = [];
    for (let t = start; t < end; t += DAY) {
      data.push({ tenantId: r.tenantId, unitId: r.unitId, reservationId: r.id, roomTypeId: r.roomTypeId, roomId, date: new Date(t), priceSatang: Math.max(0, r.ratePerNightSatang), priceSource: "MANUAL", counted: live });
    }
    if (data.length) s.nightsCreated += (await tx.hotelBookingNight.createMany({ data, skipDuplicates: true })).count;

    if (!live || !r.roomId || held.has(r.id) || end <= start) continue;
    const c = await claimRoom(tx, {
      tenantId: r.tenantId, unitId: r.unitId, roomId: r.roomId, start: r.checkInDate, end: r.checkOutDate, kind: "STAY", refType: HOTEL_REF, refId: r.id,
    });
    if (c.ok) s.occupancyClaimed++;
    else {
      s.occupancyConflict++;
      conflicts.push(`${r.id} (${c.code})`);
    }
  }

  // 4. folio OPEN ให้การจองที่ยังพัก/รอเข้าพัก
  const noFolio = await tx.hotelReservation.findMany({
    where: { status: { in: ["CONFIRMED", "CHECKED_IN"] }, folio: { is: null } },
    select: { id: true, tenantId: true, unitId: true, depositSatang: true, depositPaidAt: true, depositSaleId: true },
  });
  for (const r of noFolio) {
    const paid = r.depositPaidAt !== null && r.depositSatang > 0;
    const folio = await tx.hotelFolio.create({
      data: { tenantId: r.tenantId, unitId: r.unitId, reservationId: r.id, status: "OPEN", balanceSatang: paid ? -r.depositSatang : 0 },
      select: { id: true },
    });
    if (paid && r.depositPaidAt) {
      await tx.hotelFolioItem.create({
        data: {
          tenantId: r.tenantId, unitId: r.unitId, folioId: folio.id, type: "DEPOSIT", description: "มัดจำการจอง (ยกมาจากระบบเดิม)",
          qty: 1, unitAmountSatang: -r.depositSatang, amountSatang: -r.depositSatang, businessDate: ymdToDb(bkkYmd(r.depositPaidAt)), refType: "PosSale", refId: r.depositSaleId,
        },
      });
    }
    s.foliosCreated++;
  }
  return { summary: s, conflicts };
}

let exitCode = 0;
try {
  console.log(`${LABEL}: ${dry ? "DRY-RUN (จำลองใน transaction แล้ว rollback · ไม่เขียน)" : "APPLY (เขียนจริง)"}`);
  let out: { summary: Summary; conflicts: string[] };
  try {
    out = await prisma.$transaction(
      async (tx) => {
        const r = await run(tx);
        if (dry) throw new DryRollback(r.summary, r.conflicts);
        return r;
      },
      { timeout: 600_000, maxWait: 30_000 },
    );
  } catch (e) {
    if (!(e instanceof DryRollback)) throw e;
    out = { summary: e.summary, conflicts: e.conflicts };
  }
  if (out.conflicts.length) {
    console.log(`⚠️ CONFLICT ${out.conflicts.length} การจอง (ห้องถูกใช้ช่วงนั้นแล้ว · ไม่ทับ — ให้พนักงานย้ายห้อง/ติดต่อแขก):`);
    for (const c of out.conflicts) console.log(`  CONFLICT ${c}`);
  }
  console.log(`BACKFILL_SUMMARY ${JSON.stringify(out.summary)}`);
} catch (e) {
  console.error(`🔴 ${LABEL}: ล้ม — ${e instanceof Error ? e.message : String(e)}`);
  exitCode = 1;
} finally {
  await prisma.$disconnect();
}
process.exit(exitCode);
