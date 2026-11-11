// svc-qc-parcel-scene.mts — SVC D.18 · ฉากพัสดุบนหน่วยหอ svcqc (ใบสั่ง ledger/svc-briefs/svc-brief-d.18.md §7)
//
// ใช้ (ต้องมีฉาก roomboard → lease → dorm-home (D.13) ก่อน — สัญญา ACTIVE ของห้อง 106/204 บนหน่วยหอ svcqc):
//   bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/svc-qc-parcel-scene.mts            # สร้าง/ปรับฉาก
//   bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/svc-qc-parcel-scene.mts --clear    # ลบเฉพาะแถวของฉาก
//
// ฉาก (ค่าจาก SQC_DORM_PARCEL_SCENE เท่านั้น) — แถว DormParcel ล้วน ระบุตัวด้วย trackingNo ขึ้นต้น trackingPrefix:
//   ห้อง 106 WAITING รับเมื่อ (วันนี้ไทย − overdueDays) · ห้อง 204 WAITING รับวันนี้ · ห้อง 305 PICKED_UP (pickedUpAt = วันนี้)
//   receivedById = ผู้ใช้ owner ของ svcqc · ไม่มีรูป (photoFileId null)
// 🔴 ไม่เขียน SettingValue ใด ๆ (ระบบพัสดุบน svcqc คงปิด · มติ R9) · ไม่ยิง event/ข้อความ (ไม่มี OutboxEvent/ServiceMessageLog)
// idempotent: อ่านเทียบก่อน ต่างเท่านั้นถึงเขียน · รันซ้ำ = SCENE_SUMMARY 0/0/0 · ไม่มีสัญญาห้องของฉาก D.13 ⇒ exit 3
// 🔴 รันผ่าน scripts/qc-svc.sh เท่านั้น (ด่าน host qc-svc ใน loadSvcQcEnv)
// บรรทัดท้าย: SCENE_SUMMARY {"created":n,"updated":n,"removed":n}
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
import { SQC_TENANT, SQC_UNITS, SQC_USERS, SQC_DORM_PARCEL_SCENE as SCN } from "./svc-qc-data.mjs";

const LABEL = "svc-qc-parcel-scene";
const argv = process.argv.slice(2);
const unknown = argv.filter((a) => a !== "--clear");
if (unknown.length) {
  console.error(`🔴 ${LABEL}: ไม่รู้จัก ${unknown.join(" ")} (ใช้ได้: --clear)`);
  process.exit(2);
}
const clear = argv.includes("--clear");
loadSvcQcEnv(LABEL);

const { prisma } = await import("@/lib/core/db");

const tenantId = SQC_TENANT.id;
const unitId = SQC_UNITS.dorm.id;
const PREFIX = SCN.trackingPrefix;
const sum = { created: 0, updated: 0, removed: 0 };
const ownerId = SQC_USERS.find((u) => u.key === "owner")?.userId ?? "";
/** 00:05 ไทยของ (วันนี้ไทย − n วัน) — เวลาคงที่ต่อวัน (ไม่อยู่ในอนาคต) ⇒ รันซ้ำวันเดียวกันได้ค่าเดิม */
const thaiNoonDaysAgo = (n: number): Date => {
  const todayYmd = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
  return new Date(Date.parse(`${todayYmd}T00:05:00.000+07:00`) - n * 86_400_000);
};

type Want = { roomNumber: string; status: "WAITING" | "PICKED_UP"; receivedAt: Date; pickedUpAt: Date | null; carrier: string; trackingNo: string };
const wants: Want[] = [
  { roomNumber: SCN.rooms.waitingOverdue, status: "WAITING", receivedAt: thaiNoonDaysAgo(SCN.overdueDays), pickedUpAt: null },
  { roomNumber: SCN.rooms.waiting, status: "WAITING", receivedAt: thaiNoonDaysAgo(0), pickedUpAt: null },
  { roomNumber: SCN.rooms.pickedUp, status: "PICKED_UP", receivedAt: thaiNoonDaysAgo(0), pickedUpAt: thaiNoonDaysAgo(0) },
].map((w) => ({ ...w, status: w.status as Want["status"], carrier: SCN.carriers[w.roomNumber] ?? "พัสดุ", trackingNo: `${PREFIX}${w.roomNumber}` }));

let exitCode = 0;
try {
  const existing = await prisma.dormParcel.findMany({ where: { tenantId, trackingNo: { startsWith: PREFIX } } });
  if (clear) {
    if (existing.length) sum.removed += (await prisma.dormParcel.deleteMany({ where: { tenantId, trackingNo: { startsWith: PREFIX } } })).count;
    console.log(`${LABEL}: --clear ลบแถวพัสดุของฉาก ${sum.removed}`);
  } else {
    const rooms = await prisma.hotelRoom.findMany({ where: { tenantId, unitId, number: { in: wants.map((w) => w.roomNumber) } }, select: { id: true, number: true } });
    const roomBy = new Map(rooms.map((r) => [r.number, r.id]));
    const leases = rooms.length
      ? await prisma.dormLease.findMany({ where: { tenantId, unitId, roomId: { in: rooms.map((r) => r.id) }, status: "ACTIVE", endedAt: null }, select: { id: true, roomId: true, partyId: true }, orderBy: { startDate: "desc" } })
      : [];
    const leaseBy = new Map<string, { id: string; partyId: string }>();
    for (const l of leases) if (!leaseBy.has(l.roomId)) leaseBy.set(l.roomId, { id: l.id, partyId: l.partyId });
    const missing = wants.filter((w) => !roomBy.get(w.roomNumber) || (w.status === "WAITING" && !leaseBy.get(roomBy.get(w.roomNumber) ?? "")));
    if (missing.length || !ownerId) {
      console.error(`🔴 ${LABEL}: ไม่พบห้อง/สัญญา ACTIVE ของฉาก D.13 (${missing.map((w) => w.roomNumber).join(", ")}) — รันก่อน: svc-qc-roomboard-scene → svc-qc-lease-scene → svc-qc-dorm-home-scene`);
      exitCode = 3;
    } else {
      const keep = new Set<string>();
      for (const w of wants) {
        const roomId = roomBy.get(w.roomNumber) as string;
        const lease = leaseBy.get(roomId) ?? null;
        const data = {
          unitId,
          roomId,
          leaseId: lease?.id ?? null,
          partyId: lease?.partyId ?? null,
          carrier: w.carrier,
          photoFileId: null,
          receivedById: ownerId,
          receivedAt: w.receivedAt,
          status: w.status,
          pickedUpAt: w.pickedUpAt,
          pickedUpByPartyId: w.status === "PICKED_UP" ? (lease?.partyId ?? null) : null,
          signatureFileId: null,
        };
        const cur = existing.find((x) => x.trackingNo === w.trackingNo);
        if (!cur) {
          const row = await prisma.dormParcel.create({ data: { tenantId, trackingNo: w.trackingNo, ...data } });
          keep.add(row.id);
          sum.created++;
          continue;
        }
        keep.add(cur.id);
        const same =
          cur.unitId === data.unitId && cur.roomId === data.roomId && cur.leaseId === data.leaseId && cur.partyId === data.partyId && cur.carrier === data.carrier &&
          cur.photoFileId === null && cur.receivedById === data.receivedById && cur.receivedAt.getTime() === data.receivedAt.getTime() && cur.status === data.status &&
          (cur.pickedUpAt?.getTime() ?? null) === (data.pickedUpAt?.getTime() ?? null) && cur.pickedUpByPartyId === data.pickedUpByPartyId && cur.signatureFileId === null;
        if (!same) {
          await prisma.dormParcel.update({ where: { id: cur.id }, data });
          sum.updated++;
        }
      }
      const stale = existing.filter((x) => !keep.has(x.id)).map((x) => x.id);
      if (stale.length) sum.removed += (await prisma.dormParcel.deleteMany({ where: { tenantId, id: { in: stale } } })).count;
      console.log(`${LABEL}: ห้อง ${wants.map((w) => `${w.roomNumber}:${w.status}`).join(" · ")} (ระบบพัสดุคงปิด · ไม่เขียนค่าตั้ง)`);
    }
  }
} catch (e) {
  console.error(`🔴 ${LABEL}: ${e instanceof Error ? e.message : String(e)}`);
  exitCode = 1;
} finally {
  await prisma.$disconnect();
}
console.log(`SCENE_SUMMARY ${JSON.stringify(sum)}`);
process.exit(exitCode);
