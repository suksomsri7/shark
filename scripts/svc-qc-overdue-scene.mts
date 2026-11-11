// svc-qc-overdue-scene.mts — SVC D.11 · ฉากจอ "ค้างชำระ · ทวง · ค่าปรับ" บนร้าน svcqc (ภาพ หอ 06 การ์ด "ค้างจาก ต.ค. · 106 · 305 · ส่งเตือนแล้ว 3 ครั้ง")
//
// ใช้ (ต้องมีฉาก roomboard → lease → dorm-home (D.13) ก่อน — บิลค้างงวด PP ของห้อง SQC_DORM_HOME_SCENE.prevUnpaid):
//   bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/svc-qc-overdue-scene.mts            # สร้าง/ปรับฉาก
//   bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/svc-qc-overdue-scene.mts --clear    # ลบเฉพาะแถวของฉาก
//
// ฉาก (ค่าจาก SQC_DORM_OVERDUE_SCENE เท่านั้น): ต่อบิลค้างเกินกำหนดล่าสุดของแต่ละห้องใน rooms (SENT · ครบกำหนดก่อนวันนี้ไทย · รอบของฉาก D.13)
//   ⇒ ServiceMessageLog สถานะ SENT ช่อง LINE ของขั้นทวง steps (dedupeKey rooms:dunning:<billId>:<ขั้น> ตามใบสั่ง §5.2) — ไม่ส่งข้อความจริง
//   แถวของฉากที่ชี้บิลอื่นของห้องเดียวกันในรอบของฉาก (วันก่อน/งวดเก่า) ⇒ ลบ
// idempotent: อ่านเทียบก่อน ต่างเท่านั้นถึงเขียน · รันซ้ำ = SCENE_SUMMARY 0/0/0 · ไม่มีบิลค้างของฉาก D.13 ⇒ exit 3
// 🔴 รันผ่าน scripts/qc-svc.sh เท่านั้น (ด่าน host qc-svc ใน loadSvcQcEnv)
// บรรทัดท้าย: SCENE_SUMMARY {"created":n,"updated":n,"removed":n}
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
import { SQC, SQC_DORM_OVERDUE_SCENE as SCN } from "./svc-qc-data.mjs";

const LABEL = "svc-qc-overdue-scene";
const argv = process.argv.slice(2);
const unknown = argv.filter((a) => a !== "--clear");
if (unknown.length) {
  console.error(`🔴 ${LABEL}: ไม่รู้จัก ${unknown.join(" ")} (ใช้ได้: --clear)`);
  process.exit(2);
}
const clear = argv.includes("--clear");
loadSvcQcEnv(LABEL);

const { prisma } = await import("@/lib/core/db");

const tenantId = SQC.tenant.id;
const unitId = SQC.units.dorm.id;
const MARK = SCN.mark;
const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const ymdOf = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T00:00:00.000Z`) + n * 86_400_000).toISOString().slice(0, 10);
const steps = [...SCN.steps];
const keyOf = (billId: string, step: number) => `rooms:dunning:${billId}:${step}`;
const sum = { created: 0, updated: 0, removed: 0 };

let exitCode = 0;
try {
  const rooms = await prisma.hotelRoom.findMany({ where: { tenantId, unitId, number: { in: [...SCN.rooms] } }, select: { id: true, number: true } });
  const runs = await prisma.dormBillRun.findMany({ where: { tenantId, unitId, createdById: MARK }, select: { id: true } });
  const sceneBills = rooms.length && runs.length
    ? await prisma.dormBill.findMany({
        where: { tenantId, unitId, runId: { in: runs.map((r) => r.id) }, roomId: { in: rooms.map((r) => r.id) } },
        select: { id: true, roomId: true, partyId: true, status: true, dueDate: true },
        orderBy: [{ dueDate: "desc" }],
      })
    : [];
  // เป้า: บิลค้างล่าสุดต่อห้อง (SENT · ครบกำหนดก่อนวันนี้)
  const target = new Map<string, (typeof sceneBills)[number]>();
  for (const b of sceneBills) if (b.status === "SENT" && b.dueDate && ymdOf(b.dueDate) < today && !target.has(b.roomId)) target.set(b.roomId, b);
  const wanted = clear ? [] : [...target.values()].flatMap((b) => steps.map((k) => ({ b, k, key: keyOf(b.id, k), at: new Date(`${addDays(ymdOf(b.dueDate), k)}T03:00:00.000Z`) })));
  const wantKeys = new Set(wanted.map((w) => w.key));
  // แถวของฉากทั้งหมด (ทุกบิลของห้องฉากในรอบของฉาก × ขั้นของฉาก) — ไม่อยู่ในเป้า ⇒ ลบ
  const sceneKeys = sceneBills.flatMap((b) => steps.map((k) => keyOf(b.id, k)));
  const stale = sceneKeys.filter((k) => !wantKeys.has(k));
  if (stale.length) sum.removed += (await prisma.serviceMessageLog.deleteMany({ where: { tenantId, unitId, dedupeKey: { in: stale } } })).count;
  if (!clear) {
    if (target.size !== SCN.rooms.length) {
      console.error(`🔴 ${LABEL}: ไม่พบบิลค้างเกินกำหนดของฉาก D.13 ครบทุกห้อง (${[...target.keys()].length}/${SCN.rooms.length}) — รันก่อน: svc-qc-roomboard-scene → svc-qc-lease-scene → svc-qc-dorm-home-scene`);
      exitCode = 3;
    } else {
      const cur = await prisma.serviceMessageLog.findMany({ where: { tenantId, dedupeKey: { in: [...wantKeys] } }, select: { id: true, dedupeKey: true, unitId: true, status: true, channel: true, partyId: true, at: true, domain: true, messageKey: true } });
      const byKey = new Map(cur.map((r) => [r.dedupeKey, r]));
      for (const w of wanted) {
        const data = { unitId, domain: "rooms", messageKey: "dunning", channel: "LINE", status: "SENT", partyId: w.b.partyId, at: w.at };
        const r = byKey.get(w.key);
        if (!r) {
          await prisma.serviceMessageLog.create({ data: { tenantId, dedupeKey: w.key, ...data } });
          sum.created++;
        } else if (r.unitId !== unitId || r.domain !== "rooms" || r.messageKey !== "dunning" || r.channel !== "LINE" || r.status !== "SENT" || r.partyId !== w.b.partyId || r.at.getTime() !== w.at.getTime()) {
          await prisma.serviceMessageLog.update({ where: { id: r.id }, data });
          sum.updated++;
        }
      }
      console.log(`${LABEL}: ห้อง ${SCN.rooms.join(" · ")} · ขั้นทวง ${steps.join("/")} ⇒ ส่งเตือนแล้ว ${SCN.delivered} ครั้ง/ห้อง`);
    }
  } else console.log(`${LABEL}: --clear ลบแถวข้อความของฉาก ${sum.removed}`);
} catch (e) {
  console.error(`🔴 ${LABEL}: ${e instanceof Error ? e.message : String(e)}`);
  exitCode = 1;
} finally {
  await prisma.$disconnect();
}
console.log(`SCENE_SUMMARY ${JSON.stringify(sum)}`);
process.exit(exitCode);
