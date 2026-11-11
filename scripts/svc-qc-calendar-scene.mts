// svc-qc-calendar-scene.mts — SVC B.14 · ฉากปฏิทินนัดร้านนวด (ภาพ จอง 02 · README "บ้านนวดใบเตย · ส. 31 ต.ค. 14:20") บนร้าน svcqc หน่วยนวด
//
// ใช้ (หลัง seed → ฉาก B.11 → ฉาก B.13):
//   bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/svc-qc-calendar-scene.mts            # ตั้งฉาก (รันซ้ำ = 0/0/0)
//   bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/svc-qc-calendar-scene.mts --clear    # ลบนัด/บัตรของฉาก + ใบลา/พนักงานของฉาก + คืน employeeId พี่ศรี
//
// ฉาก (ค่าจาก SQC_CALENDAR_SCENE + SQC เท่านั้น · ใบสั่ง svc-brief-b.14 §8):
//   1) ลาพี่ศรี: AppSystem HR (leave.hrSystemId) + HrEmployee (leave.employeeId) → BookingStaff(พี่ศรี).employeeId → HrLeave APPROVED วันฉาก (VACATION)
//   2) นัด `bookings` ผ่าน bookAppointment ช่อง STAFF (idempotencyKey = idemPrefix + วันฉาก + "-" + key) · ลำดับจอง = ลำดับในตาราง (ห้องที่ด่านเลือก)
//   3) เหตุการณ์ตามเวลา (now ฉีด): เช็กอิน (arriveAt) · เริ่ม (startAt) · เสร็จ (doneAt) ของนัด + walk-in (createWalkIn ณ issueAt → เริ่ม/เสร็จ)
//   4) runPlanner ณ `at`
// 🔴 ไม่เขียนค่าตั้งชั้น TENANT/UNIT (ข้อสอบ Q-4) · ไม่แตะ src · idempotent: ครบแล้ว ⇒ 0/0/0 · ไม่ครบ/วันฉากเปลี่ยน ⇒ ลบงานของหน่วยนวดในวันฉาก แล้วสร้างใหม่
// 🔴 รันผ่าน scripts/qc-svc.sh เท่านั้น (ด่าน host qc-svc ใน loadSvcQcEnv)
// บรรทัดท้าย: SCENE_SUMMARY {"created":n,"updated":n,"removed":n}
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
import { SQC, SQC_CALENDAR_SCENE as SC } from "./svc-qc-data.mjs";

const LABEL = "svc-qc-calendar-scene";
loadSvcQcEnv(LABEL);
if (process.env.CI) {
  console.error(`🔴 ${LABEL}: ห้าม export CI`);
  process.exit(4);
}
const argv = process.argv.slice(2);
const unknown = argv.filter((a) => a !== "--clear");
if (unknown.length) {
  console.error(`🔴 ${LABEL}: ไม่รู้จัก ${unknown.join(" ")} (ใช้ได้: --clear)`);
  process.exit(2);
}
const clear = argv.includes("--clear");

const { prisma } = await import("@/lib/core/db");
const { bookAppointment, setAppointmentStatus } = await import("@/lib/modules/booking/service");
const { checkIn, createWalkIn, startJob, completeJob } = await import("@/lib/modules/booking/queue-line");
const { runPlanner } = await import("@/lib/modules/booking/planner-run");

const tenantId = SQC.tenant.id;
const unitId = SQC.units[SC.unit].id;
const ctx = { tenantId, unitId };
const D = SC.day;
const keyOf = (day: string, k: string) => `${SC.idemPrefix}${day}-${k}`;
const lv = SC.leave;
const sriId = SC.staffIds[lv.staff];
const sum = { created: 0, updated: 0, removed: 0 };

const hmMin = (s: string) => {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
};
const at = (ds: string, s: string) => {
  const [y, mo, d] = ds.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d) + (hmMin(s) - 420) * 60_000);
};
const dayRange = (ds: string) => ({ gte: at(ds, "00:00"), lt: new Date(at(ds, "00:00").getTime() + 86_400_000) });
const dbDate = (ds: string) => new Date(`${ds}T00:00:00.000Z`);

/** วันฉากเดิมจากคีย์ ("svcqc-cal-YYYY-MM-DD-…") */
async function sceneDays(): Promise<string[]> {
  const rows = await prisma.appointment.findMany({ where: { tenantId, unitId, idempotencyKey: { startsWith: SC.idemPrefix } }, select: { idempotencyKey: true } });
  const p = SC.idemPrefix.length;
  return [...new Set(rows.map((r) => (r.idempotencyKey ?? "").slice(p, p + 10)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))];
}

/** ลบงานของหน่วยนวดในวันนั้น + นัดของฉาก + บัตร (refType APPOINTMENT) + ลำดับเลขบัตรของวัน */
async function wipeDay(ds: string): Promise<number> {
  const appts = await prisma.appointment.findMany({
    where: { tenantId, unitId, OR: [{ startAt: dayRange(ds) }, { idempotencyKey: { startsWith: keyOf(ds, "") } }] },
    select: { id: true },
  });
  const ids = appts.map((a) => a.id);
  await prisma.queueTicket.deleteMany({ where: { tenantId, unitId, refType: "APPOINTMENT", OR: [{ businessDate: ds }, ...(ids.length ? [{ refId: { in: ids } }] : [])] } });
  const sysTypes = await prisma.queueType.findMany({ where: { tenantId, unitId, isSystem: true }, select: { id: true } });
  if (sysTypes.length) await prisma.queueDailySequence.deleteMany({ where: { tenantId, unitId, businessDate: ds, typeId: { in: sysTypes.map((t) => t.id) } } });
  if (ids.length) await prisma.appointment.deleteMany({ where: { tenantId, unitId, id: { in: ids } } });
  return ids.length;
}

/** ใบลาของพี่ศรี (HR ของฉาก) — สร้าง/ปรับให้ตรงวันฉาก */
async function ensureLeave(): Promise<void> {
  const sys = await prisma.appSystem.findUnique({ where: { id: lv.hrSystemId }, select: { id: true, tenantId: true } });
  if (!sys) {
    await prisma.appSystem.create({ data: { id: lv.hrSystemId, tenantId, type: "HR", name: "ทีมหมอนวด (ฉาก B.14)" } });
    sum.created++;
  } else if (sys.tenantId !== tenantId) throw new Error(`AppSystem ${lv.hrSystemId} เป็นของร้านอื่น — หยุด`);
  const emp = await prisma.hrEmployee.findUnique({ where: { id: lv.employeeId }, select: { id: true, tenantId: true, systemId: true } });
  if (!emp) {
    await prisma.hrEmployee.create({ data: { id: lv.employeeId, tenantId, systemId: lv.hrSystemId, name: "พี่ศรี" } });
    sum.created++;
  } else if (emp.tenantId !== tenantId) throw new Error(`HrEmployee ${lv.employeeId} เป็นของร้านอื่น — หยุด`);
  else if (emp.systemId !== lv.hrSystemId) {
    await prisma.hrEmployee.update({ where: { id: lv.employeeId }, data: { systemId: lv.hrSystemId } });
    sum.updated++;
  }
  const st = await prisma.bookingStaff.findFirst({ where: { id: sriId, tenantId, unitId }, select: { employeeId: true } });
  if (!st) throw new Error(`ไม่พบ BookingStaff ${sriId} — รัน seed ก่อน`);
  if (st.employeeId !== lv.employeeId) {
    await prisma.bookingStaff.updateMany({ where: { id: sriId, tenantId, unitId }, data: { employeeId: lv.employeeId } });
    sum.updated++;
  }
  const leaves = await prisma.hrLeave.findMany({ where: { tenantId, employeeId: lv.employeeId }, select: { id: true, fromDate: true, toDate: true, status: true, type: true } });
  const want = dbDate(D).getTime();
  const ok = leaves.filter((l) => l.fromDate.getTime() === want && l.toDate.getTime() === want && l.status === "APPROVED" && l.type === lv.type);
  const stale = leaves.filter((l) => !ok.includes(l)).map((l) => l.id);
  if (stale.length) sum.removed += (await prisma.hrLeave.deleteMany({ where: { tenantId, id: { in: stale } } })).count;
  if (!ok.length) {
    await prisma.hrLeave.create({ data: { tenantId, systemId: lv.hrSystemId, employeeId: lv.employeeId, type: lv.type, fromDate: dbDate(D), toDate: dbDate(D), status: "APPROVED", reason: "ลาพักร้อน (ฉาก B.14)" } });
    sum.created++;
  }
}

async function serviceIds(): Promise<Map<string, string>> {
  const rows = await prisma.bookingService.findMany({ where: { tenantId, unitId, active: true }, select: { id: true, name: true } });
  const out = new Map(rows.map((r) => [r.name, r.id]));
  for (const n of [...new Set([...SC.bookings.map((b) => b.service), ...SC.walkIns.map((w) => w.service)])]) {
    if (!out.has(n)) throw new Error(`ไม่พบบริการ "${n}" ของหน่วยนวด — รัน seed ก่อน`);
  }
  return out;
}

type Ev = { at: string; ord: number; run: () => Promise<{ ok: boolean; code?: string; reason?: string }>; what: string };

async function build(): Promise<void> {
  const svc = await serviceIds();
  const fx = new Map<string, string>();
  for (const b of SC.bookings) {
    const r = await bookAppointment(ctx, {
      serviceId: svc.get(b.service)!, staffId: SC.staffIds[b.staff], dateStr: D, startMin: hmMin(b.start), channel: "STAFF",
      customerName: b.name, customerPhone: b.phone, idempotencyKey: keyOf(D, b.key),
    });
    if (!r.ok) throw new Error(`จอง ${b.key} ${b.start} ล้ม ${r.code} ${r.reason}`);
    fx.set(b.key, r.id);
    sum.created++;
    if (r.status === "PENDING") {
      const c = await setAppointmentStatus(tenantId, unitId, r.id, "CONFIRMED");
      if (!c.ok) throw new Error(`ยืนยัน ${b.key}: ${c.reason}`);
    }
  }
  const evs: Ev[] = [];
  let ord = 0;
  const idOf = (k: string) => {
    const id = fx.get(k);
    if (!id) throw new Error(`ไม่รู้จักคีย์ ${k}`);
    return id;
  };
  for (const b of SC.bookings) {
    if (!b.then) continue;
    if (b.arriveAt) { const t = b.arriveAt; evs.push({ at: t, ord: ord++, what: `${t} เช็กอิน ${b.key}`, run: () => checkIn(ctx, { appointmentId: idOf(b.key) }, { via: "STAFF", now: at(D, t) }) }); }
    if (b.then !== "ARRIVED" && b.startAt) { const t = b.startAt; evs.push({ at: t, ord: ord++, what: `${t} เริ่ม ${b.key}`, run: () => startJob(ctx, idOf(b.key), { now: at(D, t) }) }); }
    if (b.then === "DONE" && b.doneAt) { const t = b.doneAt; evs.push({ at: t, ord: ord++, what: `${t} เสร็จ ${b.key}`, run: () => completeJob(ctx, idOf(b.key), { now: at(D, t) }) }); }
  }
  for (const w of SC.walkIns) {
    evs.push({
      at: w.issueAt, ord: ord++, what: `${w.issueAt} walk-in ${w.key}`,
      run: async () => {
        const r = await createWalkIn(ctx, { serviceId: svc.get(w.service)!, staffId: SC.staffIds[w.staff], channel: "STAFF" }, { now: at(D, w.issueAt) });
        if (r.ok) { fx.set(w.key, r.appointmentId); sum.created++; }
        return r;
      },
    });
    { const t = w.startAt; evs.push({ at: t, ord: ord++, what: `${t} เริ่ม ${w.key}`, run: () => startJob(ctx, idOf(w.key), { now: at(D, t) }) }); }
    if (w.then === "DONE" && w.doneAt) { const t = w.doneAt; evs.push({ at: t, ord: ord++, what: `${t} เสร็จ ${w.key}`, run: () => completeJob(ctx, idOf(w.key), { now: at(D, t) }) }); }
  }
  evs.sort((a, b) => hmMin(a.at) - hmMin(b.at) || a.ord - b.ord);
  for (const e of evs) {
    const r = await e.run();
    if (!r.ok) throw new Error(`${e.what}: ${r.code ?? ""} ${r.reason ?? ""}`);
  }
  await runPlanner(ctx, { now: at(D, SC.at) });
}

/** ฉากวันฉากครบไหม: นัดของฉากครบทุกคีย์ · walk-in ครบ · สถานะตามตาราง · ใบลา/ผูกพนักงานครบ */
async function complete(): Promise<boolean> {
  const rows = await prisma.appointment.findMany({ where: { tenantId, unitId, idempotencyKey: { in: SC.bookings.map((b) => keyOf(D, b.key)) } }, select: { idempotencyKey: true, status: true, serviceId: true, staffId: true } });
  if (rows.length !== SC.bookings.length) return false;
  const svc = await serviceIds();
  const st = new Map(rows.map((r) => [r.idempotencyKey, r]));
  for (const b of SC.bookings) {
    const r = st.get(keyOf(D, b.key));
    if (!r || String(r.status) !== (b.then ?? "CONFIRMED") || r.serviceId !== svc.get(b.service) || r.staffId !== SC.staffIds[b.staff]) return false;
  }
  const wi = await prisma.appointment.count({ where: { tenantId, unitId, kind: "WALKIN", startAt: dayRange(D), status: { not: "CANCELLED" } } });
  if (wi !== SC.walkIns.length) return false;
  const days = await sceneDays();
  if (days.length !== 1 || days[0] !== D) return false;
  const [sys, emp, staff, leave] = await Promise.all([
    prisma.appSystem.findFirst({ where: { id: lv.hrSystemId, tenantId, type: "HR" }, select: { id: true } }),
    prisma.hrEmployee.findFirst({ where: { id: lv.employeeId, tenantId, systemId: lv.hrSystemId }, select: { id: true } }),
    prisma.bookingStaff.findFirst({ where: { id: sriId, tenantId, unitId, employeeId: lv.employeeId }, select: { id: true } }),
    prisma.hrLeave.count({ where: { tenantId, employeeId: lv.employeeId, status: "APPROVED", type: lv.type, fromDate: dbDate(D), toDate: dbDate(D) } }),
  ]);
  return !!sys && !!emp && !!staff && leave === 1;
}

let exitCode = 0;
try {
  const unit = await prisma.businessUnit.findFirst({ where: { id: unitId, tenantId, type: "BOOKING" }, select: { id: true } });
  const staffN = await prisma.bookingStaff.count({ where: { tenantId, unitId, active: true } });
  if (!unit || staffN !== SQC.massage.staff.length) {
    console.error(`🔴 ${LABEL}: หน่วยนวด svcqc ไม่พร้อม (หมอ ${staffN} · ต้อง ${SQC.massage.staff.length}) — รัน seed → ฉาก B.11 → ฉาก B.13 ก่อน`);
    process.exit(3);
  }
  if (clear) {
    for (const ds of new Set([...(await sceneDays()), D])) sum.removed += await wipeDay(ds);
    sum.updated += (await prisma.bookingStaff.updateMany({ where: { id: sriId, tenantId, unitId, employeeId: lv.employeeId }, data: { employeeId: null } })).count;
    sum.removed += (await prisma.hrLeave.deleteMany({ where: { tenantId, employeeId: lv.employeeId } })).count;
    sum.removed += (await prisma.hrEmployee.deleteMany({ where: { id: lv.employeeId, tenantId } })).count;
    sum.removed += (await prisma.appSystem.deleteMany({ where: { id: lv.hrSystemId, tenantId, type: "HR" } })).count;
    console.log(`${LABEL}: --clear ลบฉาก (วัน ${D} + วันฉากเดิม) · ใบลา/พนักงานของฉาก · คืน employeeId พี่ศรี`);
  } else if (await complete()) {
    console.log(`${LABEL}: ฉากวัน ${D} ครบแล้ว — ไม่ทำอะไร`);
  } else {
    await ensureLeave();
    for (const ds of new Set([...(await sceneDays()), D])) sum.removed += await wipeDay(ds);
    await build();
    console.log(`${LABEL}: สร้างฉากวัน ${D} ณ ${SC.at} แล้ว (เปิดภาพด้วย ?at= ${at(D, SC.at).toISOString()} · server ต้องตั้ง SVC_QC_CLOCK=1)`);
  }
} catch (e) {
  exitCode = 1;
  console.error(`🔴 ${LABEL}: ${e instanceof Error ? e.message : String(e)}`);
} finally {
  await prisma.$disconnect();
}
console.log(`SCENE_SUMMARY ${JSON.stringify(sum)}`);
process.exit(exitCode);
