// svc-qc-meter-scene.mts — SVC D.6 · ฉากจดมิเตอร์หอบนร้าน svcqc (ภาพ หอ 03 · README หอ "จดแล้ว 27 / 36 ห้อง") สำหรับภาพ dorm-meter-walk/flags + ข้อ Q
//
// ใช้ (ต้องมีฉากผัง R0.9 ก่อน — scripts/svc-qc-roomboard-scene.mts):
//   bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/svc-qc-meter-scene.mts            # สร้าง/ปรับฉากให้ตรงเดือนนี้ (ไทย)
//   bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/svc-qc-meter-scene.mts --clear    # ลบทั้งฉาก (เลขก่อน มิเตอร์ทีหลัง)
//
// ฉาก (งวดสัมพัทธ์กับเดือนนี้ไทย):
//   • มิเตอร์ ELEC + WATER ทุกห้อง (72) + MAIN ELEC อาคาร A · note "SvcQcScene" · สร้างผ่าน createMeter ของ facade
//   • ประวัติ 3 งวดก่อน (P−3..P−1) เขียนตรง source IMPORT · งวดนี้จด 27/36 ห้องผ่าน submitReadings จริง
//       ชั้น 1 ครบ 12 · ชั้น 2 = 201–206 + 210 (7/12) · ชั้น 3 = 301 303–309 (8/12)
//   • ผิดปกติ 3: 309 ไฟ HIGH (412 หน่วย · เฉลี่ย ~131) · 112 ไฟ BACKWARDS (8,904 → 126) · 210 ไฟ VACANT_USAGE (18 หน่วย · มีการ์ดบอร์ดงานถ้าร้านมีบอร์ด)
//   • ห้อง 204 ไฟ 1,287 → 1,412 (125 หน่วย · เฉลี่ย 118) · น้ำ 312 → 318 (6 หน่วย) ตาม README
// idempotent: อ่านเทียบก่อน ต่างเท่านั้นถึงเขียน · รันซ้ำ = SCENE_SUMMARY 0/0/0 · `--clear` ลบเฉพาะมิเตอร์ note SvcQcScene + แถวเลขของมิเตอร์เหล่านั้น
// 🔴 ไม่แตะห้อง/occupancy/ข้อมูลอื่น · รันผ่าน scripts/qc-svc.sh เท่านั้น (ด่าน host qc-svc ใน loadSvcQcEnv)
// บรรทัดท้าย: SCENE_SUMMARY {"created":n,"updated":n,"removed":n}
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
import { SQC, SQC_DORM_BOARD_SCENE as OCC_SCENE } from "./svc-qc-data.mjs";

const LABEL = "svc-qc-meter-scene";
loadSvcQcEnv(LABEL);

const argv = process.argv.slice(2);
const unknown = argv.filter((a) => a !== "--clear");
if (unknown.length) {
  console.error(`🔴 ${LABEL}: ไม่รู้จัก ${unknown.join(" ")} (ใช้ได้: --clear)`);
  process.exit(2);
}
const clear = argv.includes("--clear");

const { prisma } = await import("@/lib/core/db");
const { createMeter, submitReadings, meterWalk } = await import("@/lib/modules/dorm");

const NOTE = "SvcQcScene";
const tenantId = SQC.tenant.id;
const unitId = SQC.units.dorm.id;
const buildingId = SQC.dorm.building.id;
const ctx = { tenantId, actorUserId: null as string | null };
const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const P = (k: number) => {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7)) - 1 + k;
  return `${y + Math.floor(m / 12)}-${String(((m % 12) + 12) % 12 + 1).padStart(2, "0")}`;
};
const P0 = P(0);

const sum = { created: 0, updated: 0, removed: 0 };
const errors: string[] = [];

// ───────────────────────── แผนเลขต่อห้อง (ตายตัวจากเลขห้อง ⇒ รันซ้ำได้ค่าเดิม) ─────────────────────────
type Plan = { base: number; hist: [number, number, number]; value: number };
const DONE: Record<string, string[]> = {
  "1": ["101", "102", "103", "104", "105", "106", "107", "108", "109", "110", "111", "112"],
  "2": ["201", "202", "203", "204", "205", "206", "210"],
  "3": ["301", "303", "304", "305", "306", "307", "308", "309"],
};
const doneSet = new Set(Object.values(DONE).flat());
const vacantNos = new Set<string>(OCC_SCENE.vacant);

function elecPlan(no: string): Plan {
  const n = Number(no);
  if (no === "204") return { base: 933, hist: [115, 120, 119], value: 1412 };
  if (no === "309") return { base: 1807, hist: [130, 131, 132], value: 1807 + 130 + 131 + 132 + 412 };
  if (no === "112") return { base: 8600, hist: [100, 104, 100], value: 126 };
  const base = 500 + ((n * 37) % 3000);
  if (vacantNos.has(no)) {
    const hist: [number, number, number] = [2, 1, 3];
    return { base, hist, value: base + 6 + (no === "210" ? 18 : 2) };
  }
  const hist: [number, number, number] = [90 + ((n * 7) % 70), 90 + ((n * 13 + 5) % 70), 90 + ((n * 17 + 9) % 70)];
  const avg = Math.round((hist[0] + hist[1] + hist[2]) / 3);
  return { base, hist, value: base + hist[0] + hist[1] + hist[2] + avg + ((n * 11) % 31) - 15 };
}
function waterPlan(no: string): Plan {
  const n = Number(no);
  if (no === "204") return { base: 294, hist: [6, 6, 6], value: 318 };
  const base = 100 + (n % 7) * 53;
  if (vacantNos.has(no)) return { base, hist: [0, 0, 0], value: base };
  const w = 8 + (n % 5);
  return { base, hist: [w - 1, w, w + 1], value: base + 3 * w + w + ((n * 3) % 5) - 2 };
}
const mainPlan: Plan = { base: 100_000, hist: [3000, 3050, 2980], value: 100_000 + 3000 + 3050 + 2980 + 3010 };
const histValues = (p: Plan): [number, number, number] => {
  const v3 = p.base + p.hist[0];
  const v2 = v3 + p.hist[1];
  return [v3, v2, v2 + p.hist[2]];
};

let exitCode = 0;
try {
  const meters = await prisma.dormMeter.findMany({ where: { tenantId, unitId, note: NOTE }, select: { id: true, roomId: true, kind: true, role: true, removedAt: true } });

  if (clear) {
    const ids = meters.map((m: { id: string }) => m.id);
    if (ids.length) {
      sum.removed += (await prisma.dormMeterReading.deleteMany({ where: { tenantId, unitId, meterId: { in: ids } } })).count;
      sum.removed += (await prisma.dormMeter.deleteMany({ where: { tenantId, unitId, id: { in: ids } } })).count;
    }
    console.log(`${LABEL}: --clear ลบฉากมิเตอร์ (note ${NOTE}) ${sum.removed} แถว`);
  } else {
    const leases = await prisma.roomOccupancy.count({ where: { tenantId, unitId, refType: OCC_SCENE.refType, kind: "LEASE", active: true } });
    if (leases < 31) {
      console.error(`🔴 ${LABEL}: ยังไม่มีฉากผังห้อง (LEASE ${OCC_SCENE.refType} ${leases} < 31) — รันก่อน: bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/svc-qc-roomboard-scene.mts`);
      process.exit(3);
    }
    const rooms: { id: string; number: string }[] = await prisma.hotelRoom.findMany({ where: { tenantId, unitId }, select: { id: true, number: true } });
    if (rooms.length !== SQC.dorm.rooms.length) {
      console.error(`🔴 ${LABEL}: หอ svcqc มีห้อง ${rooms.length} (ต้อง ${SQC.dorm.rooms.length}) — รัน seed ก่อน`);
      process.exit(3);
    }
    const byNo = new Map(rooms.map((r) => [r.number, r.id]));

    /** มิเตอร์ที่ใช้งานอยู่ของฉาก (หรือสร้างใหม่ผ่าน createMeter) */
    const activeOf = (roomId: string | null, kind: string) => meters.find((m: { roomId: string | null; kind: string; removedAt: Date | null }) => m.roomId === roomId && m.kind === kind && m.removedAt === null);
    async function ensureMeter(roomId: string | null, kind: "ELEC" | "WATER", plan: Plan): Promise<string | null> {
      const found = activeOf(roomId, kind);
      if (found) return found.id;
      const r = await createMeter(ctx, {
        unitId,
        kind,
        ...(roomId ? { role: "ROOM" as const, roomId } : { role: "MAIN" as const, buildingId }),
        startReading: plan.base,
        digits: kind === "ELEC" ? 5 : 4,
        note: NOTE,
      });
      if (!r.ok) {
        errors.push(`createMeter ${kind} ${roomId ?? "MAIN"}: ${r.code}`);
        return null;
      }
      sum.created++;
      meters.push({ id: r.meterId, roomId, kind, role: roomId ? "ROOM" : "MAIN", removedAt: null });
      return r.meterId;
    }
    async function ensureHistory(meterId: string, plan: Plan) {
      const vals = histValues(plan);
      for (let i = 0; i < 3; i++) {
        const periodKey = P(i - 3);
        const has = await prisma.dormMeterReading.findFirst({ where: { tenantId, unitId, meterId, periodKey, kind: "PERIOD" }, select: { id: true } });
        if (has) continue;
        await prisma.dormMeterReading.create({
          data: { tenantId, unitId, meterId, periodKey, kind: "PERIOD", value: vals[i], source: "IMPORT", readAt: new Date(`${periodKey}-25T03:00:00Z`) },
        });
        sum.created++;
      }
    }

    const items: { meterId: string; value: number }[] = [];
    for (const rm of SQC.dorm.rooms) {
      const roomId = byNo.get(rm.number) ?? null;
      if (!roomId) continue;
      const ePlan = elecPlan(rm.number);
      const wPlan = waterPlan(rm.number);
      const e = await ensureMeter(roomId, "ELEC", ePlan);
      const w = await ensureMeter(roomId, "WATER", wPlan);
      if (e) await ensureHistory(e, ePlan);
      if (w) await ensureHistory(w, wPlan);
      if (doneSet.has(rm.number)) {
        if (e) items.push({ meterId: e, value: ePlan.value });
        if (w) items.push({ meterId: w, value: wPlan.value });
      }
    }
    const main = await ensureMeter(null, "ELEC", mainPlan);
    if (main) {
      await ensureHistory(main, mainPlan);
      items.push({ meterId: main, value: mainPlan.value });
    }

    // งวดนี้ — ผ่าน submitReadings จริง (ตรวจผิดปกติ · event · การ์ด) · ชุดละ ≤ 100
    for (let i = 0; i < items.length; i += 100) {
      const res = await submitReadings(ctx, { unitId, periodKey: P0, items: items.slice(i, i + 100) });
      if (!res.ok) {
        errors.push(`submitReadings ${res.code}: ${res.reason}`);
        continue;
      }
      for (const r of res.results) {
        if (r.status === "CREATED") sum.created++;
        else if (r.status === "UPDATED") sum.updated++;
        else if (r.status === "REJECTED" || r.status === "LOCKED") errors.push(`${r.meterId} ${r.status} ${r.code ?? ""}`);
      }
    }

    const w = await meterWalk(ctx, { unitId, periodKey: P0 });
    const flagged = w.floors.flatMap((f) => f.rooms).filter((r) => r.flag).map((r) => `${r.number}:${r.flag}`);
    console.log(`${LABEL}: งวด ${P0} · จดแล้ว ${w.progress.done}/${w.progress.rooms} ห้อง · ผิดปกติ ${w.progress.flagged} (${flagged.join(" ")}) · มิเตอร์หลัก ${w.main.length}`);
  }
  if (errors.length) {
    exitCode = 1;
    console.error(`🔴 ${LABEL}: ${errors.length} ปัญหา — ${errors.slice(0, 8).join(" · ")}`);
  }
} catch (e) {
  exitCode = 1;
  console.error(`🔴 ${LABEL}: ${e instanceof Error ? e.message : String(e)}`);
} finally {
  await prisma.$disconnect();
}
console.log(`SCENE_SUMMARY ${JSON.stringify(sum)}`);
process.exit(exitCode);
