// svc-qc-roomboard-scene.mts — SVC R0.9 · ฉากผังห้องหอบนร้าน svcqc (README หอ "อาคาร 36 ห้อง") สำหรับภาพ dorm-floorplan + ข้อ Q
//
// ใช้:
//   bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/svc-qc-roomboard-scene.mts            # สร้าง/ปรับฉากให้ตรงวันนี้
//   bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/svc-qc-roomboard-scene.mts --clear    # ลบทั้งฉาก
//
// ฉาก (สัญญาอยู่ที่ `SQC_DORM_BOARD_SCENE` ใน scripts/svc-qc-data.mts — ไม่ฮาร์ดโค้ดซ้ำ) · วันที่สัมพัทธ์กับวันนี้ไทย:
//   LEASE ทุกห้องยกเว้น vacant/booked/repair · booked = LEASE เริ่มในอนาคต · repair = BLOCK คร่อมวันนี้ · vacant ไม่มีแถว
//   refType `SvcQcScene` · refId `scene-<เลขห้อง>` · เขียนผ่าน claimRoom/resizeOccupancy/releaseOccupancy ใน tx (เคารพ EXCLUDE · มี event)
// idempotent: อ่านเทียบก่อน ต่างเท่านั้นถึงเขียน (วันเลื่อน ⇒ resize) · แถว SvcQcScene เกินฉาก ⇒ ลบ · รันซ้ำ = 0/0/0
// 🔴 ไม่แตะห้อง/hkStatus/occupancy refType อื่น (seed เป็นเจ้าของ) · ไม่ลบ hotelRoom
// 🔴 รันผ่าน scripts/qc-svc.sh เท่านั้น (ด่าน host qc-svc ใน loadSvcQcEnv)
// บรรทัดท้าย: SCENE_SUMMARY {"created":n,"updated":n,"removed":n}
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
import { SQC, SQC_DORM_BOARD_SCENE as SCENE } from "./svc-qc-data.mjs";

const LABEL = "svc-qc-roomboard-scene";
loadSvcQcEnv(LABEL);

const argv = process.argv.slice(2);
const unknown = argv.filter((a) => a !== "--clear");
if (unknown.length) {
  console.error(`🔴 ${LABEL}: ไม่รู้จัก ${unknown.join(" ")} (ใช้ได้: --clear)`);
  process.exit(2);
}
const clear = argv.includes("--clear");

const { prisma } = await import("@/lib/core/db");
const { claimRoom, resizeOccupancy, releaseOccupancy } = await import("@/lib/modules/rooms");

const tenantId = SQC.tenant.id;
const unitId = SQC.units.dorm.id;
const expectedRooms = SQC.dorm.rooms.length;
const DAY = 86_400_000;
const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const ymdOf = (d: Date) => d.toISOString().slice(0, 10);
const refIdOf = (no: string) => `scene-${no}`;

type Want = { roomId: string; number: string; kind: "LEASE" | "BLOCK"; start: string; end: string };
type Row = { id: string; unitId: string; roomId: string; kind: string; refId: string; active: boolean; startDate: Date; endDate: Date };

const sum = { created: 0, updated: 0, removed: 0 };
const errors: string[] = [];

/** ปล่อย (ถ้ายัง active · มี event) แล้วลบแถว — เฉพาะ refType ของฉาก */
async function removeRow(r: Row) {
  await prisma.$transaction(async (tx) => {
    if (r.active) await releaseOccupancy(tx, { tenantId, unitId: r.unitId, occupancyId: r.id, reason: "scene" });
    await tx.roomOccupancy.deleteMany({ where: { id: r.id, tenantId, refType: SCENE.refType } });
  });
  sum.removed++;
}

let exitCode = 0;
try {
  const existing: Row[] = await prisma.roomOccupancy.findMany({
    where: { tenantId, refType: SCENE.refType },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, unitId: true, roomId: true, kind: true, refId: true, active: true, startDate: true, endDate: true },
  });

  if (clear) {
    for (const r of existing) await removeRow(r);
    console.log(`${LABEL}: --clear ลบฉาก ${sum.removed} แถว (refType ${SCENE.refType})`);
  } else {
    const rooms = await prisma.hotelRoom.findMany({ where: { tenantId, unitId }, select: { id: true, number: true } });
    if (rooms.length !== expectedRooms) {
      console.error(`🔴 ${LABEL}: หอ svcqc มีห้อง ${rooms.length} (ต้อง ${expectedRooms}) — รัน seed ก่อน: bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/seed-svc-qc.mts`);
      process.exit(3);
    }
    const skipNos = new Set<string>([...SCENE.vacant, SCENE.booked.number, SCENE.repair.number]);
    const want: Want[] = [];
    for (const r of rooms) {
      if (r.number === SCENE.booked.number) want.push({ roomId: r.id, number: r.number, kind: "LEASE", start: addDays(today, SCENE.booked.startOffset), end: addDays(today, SCENE.booked.endOffset) });
      else if (r.number === SCENE.repair.number) want.push({ roomId: r.id, number: r.number, kind: "BLOCK", start: addDays(today, SCENE.repair.startOffset), end: addDays(today, SCENE.repair.endOffset) });
      else if (!skipNos.has(r.number)) want.push({ roomId: r.id, number: r.number, kind: "LEASE", start: addDays(today, SCENE.lease.startOffset), end: addDays(today, SCENE.lease.endOffset) });
    }

    // จับคู่แถวเดิมกับฉาก: active · หน่วยหอ · ห้อง/refId/kind ตรง — ที่เหลือ = เกินฉาก ⇒ ลบก่อน (คืนช่วงให้ห้อง)
    const keep = new Map<string, Row>();
    const used = new Set<string>();
    for (const w of want) {
      const r = existing.find((x) => !used.has(x.id) && x.active && x.unitId === unitId && x.roomId === w.roomId && x.refId === refIdOf(w.number) && x.kind === w.kind);
      if (r) {
        keep.set(w.roomId, r);
        used.add(r.id);
      }
    }
    for (const r of existing) if (!used.has(r.id)) await removeRow(r);

    for (const w of want) {
      const r = keep.get(w.roomId);
      if (r) {
        if (ymdOf(r.startDate) === w.start && ymdOf(r.endDate) === w.end) continue;
        const res = await prisma.$transaction((tx) => resizeOccupancy(tx, { tenantId, unitId, occupancyId: r.id, start: w.start, end: w.end }));
        if (res.ok) sum.updated++;
        else errors.push(`${w.number} resize ${res.code}${res.conflict ? ` (ชน ${res.conflict.kind}/${res.conflict.refType})` : ""}`);
        continue;
      }
      const res = await prisma.$transaction((tx) =>
        claimRoom(tx, { tenantId, unitId, roomId: w.roomId, start: w.start, end: w.end, kind: w.kind, refType: SCENE.refType, refId: refIdOf(w.number) }),
      );
      if (res.ok) sum.created++;
      else errors.push(`${w.number} claim ${res.code}${res.conflict ? ` (ชน ${res.conflict.kind}/${res.conflict.refType})` : ""}`);
    }
    console.log(`${LABEL}: วันนี้ ${today} · ฉาก ${want.length} แถว (ว่าง ${SCENE.vacant.join("/")} · จอง ${SCENE.booked.number} · ซ่อม ${SCENE.repair.number})`);
  }
  if (errors.length) {
    exitCode = 1;
    console.error(`🔴 ${LABEL}: เขียนไม่สำเร็จ ${errors.length} ห้อง — ${errors.join(" · ")}`);
  }
} catch (e) {
  exitCode = 1;
  console.error(`🔴 ${LABEL}: ${e instanceof Error ? e.message : String(e)}`);
} finally {
  await prisma.$disconnect();
}
console.log(`SCENE_SUMMARY ${JSON.stringify(sum)}`);
process.exit(exitCode);
