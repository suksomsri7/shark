// svc-qc-today-line-scene.mts — SVC B.5 · ฉากจอคิววันนี้แถวเดียว (ภาพ จอง 01 · README "ส. 31 ต.ค. 14:20") บนร้าน svcqc หน่วยบาร์เบอร์
//
// ใช้:
//   bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/svc-qc-today-line-scene.mts            # สร้าง/ปรับฉาก ณ วันฉาก
//   bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/svc-qc-today-line-scene.mts --clear    # ลบฉาก + คืน employeeId ช่างเอก + ลบ HR ของฉาก
//
// ฉาก: ตาราง SQC_TODAY_LINE_SCENE (ใช้ร่วมกับข้อสอบ qc-svc-b.5 F-0) · วันฉาก = SQC_LINE_SCENE_DAY (เสาร์ ≥ วันนี้ไทย + 3 · อนาคตเสมอ)
//   1) แม่แบบ BARBER (applyTemplate KEEP_CUSTOM ในนามเจ้าของ svcqc) — โหมดแถวเดียว · ผ่อนผัน 10 · ไม่มา 30 · ข้ามหลังเรียก 10
//   2) hrLink: AppSystem HR "svcqc-scene-hr" + HrEmployee "svcqc-scene-emp-ek" (linkedUserId = svcqc-user-ek) → BookingStaff ช่างเอก.employeeId ("ของฉัน" ของ ek)
//   3) bookings (bookAppointment ช่อง STAFF · idempotencyKey "svcqc-line-<วันฉาก>-<key>" · PENDING ⇒ CONFIRMED) → events ตามเวลา (now ฉีด = วันฉาก + at ·
//      tick ส่ง tenantIds:[svcqc] เสมอ) → runPlanner ณ 14:20 — ลำดับเดียวกับข้อสอบ F-0
// idempotent: นัดของฉาก (idempotencyKey ขึ้นต้น svcqc-line-) ครบ 14 ของวันฉาก + HR ผูกแล้ว ⇒ ไม่ทำอะไร (0/0/0) ·
//   วันฉากเปลี่ยน/ไม่ครบ ⇒ ลบงาน + บัตร (refType APPOINTMENT) + ลำดับเลขบัตร ของหน่วยบาร์เบอร์ในวันฉากเดิม/ใหม่ แล้วสร้างใหม่ทั้งชุด
// ผู้คุมเคาะ Q-2 (ทาง ค): ตัวเลข expect = ภาพออกแบบ (พักขั้นต่ำ = ค่าแม่แบบ 0) ⇒ ก่อนสร้าง/ตรวจฉาก ล้าง override `booking.staff.minBreakMin` ระดับหน่วย barber
//   ที่ฉาก B.11 (svc-qc-booking-settings-scene · unitDiffs) ตั้งเป็น 5 — ล้างเฉพาะคีย์นี้ คีย์อื่นของฉาก B.11 คงไว้ · --clear ไม่คืนค่า
//   ⚠️ จะถ่ายภาพ B.11 (การ์ด "ปรับจากแม่แบบ 6 ข้อ" · ภาพ 12 พักขั้นต่ำ) ต้องรันฉาก B.11 ใหม่ก่อนถ่าย (และรันฉากนี้ใหม่ก่อนถ่ายภาพ B.5)
// 🔴 รันผ่าน scripts/qc-svc.sh เท่านั้น (ด่าน host qc-svc ใน loadSvcQcEnv) · ไม่ลบค่าตั้งแม่แบบ
// บรรทัดท้าย: SCENE_SUMMARY {"created":n,"updated":n,"removed":n}
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
import { SQC, SQC_TODAY_LINE_SCENE as SCENE, SQC_LINE_SCENE_DAY } from "./svc-qc-data.mjs";

const LABEL = "svc-qc-today-line-scene";
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
const { applyTemplate } = await import("@/lib/core/settings");
const { bookAppointment, setAppointmentStatus } = await import("@/lib/modules/booking/service");
const { checkIn, createWalkIn, startJob, completeJob, cancelByShop } = await import("@/lib/modules/booking/queue-line");
const { runLineTick, runPlanner } = await import("@/lib/modules/booking/planner-run");

const tenantId = SQC.tenant.id;
const unitId = SQC.units.barber.id;
const ctx = { tenantId, unitId };
const D = SQC_LINE_SCENE_DAY;
const KEY_PREFIX = "svcqc-line-";
const keyOf = (day: string, k: string) => `${KEY_PREFIX}${day}-${k}`;
const owner = SQC.users.find((u) => u.key === "owner")!;
const hr = SCENE.hrLink;
const hrUser = SQC.users.find((u) => u.key === hr.userKey)!;
const ekStaffId = SCENE.staffIds[hr.staff];

const hm = (s: string) => {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
};
const at = (ds: string, s: string) => {
  const [y, mo, d] = ds.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d) + (hm(s) - 420) * 60_000);
};
const dayRange = (ds: string) => ({ gte: at(ds, "00:00"), lt: new Date(at(ds, "00:00").getTime() + 86_400_000) });

const sum = { created: 0, updated: 0, removed: 0 };

/**
 * ผู้คุม 30 ต.ค. — tick เฉพาะวันฉาก: runLineTick กวาด "สิ้นวัน" ยกเลิก walk-in QUEUED ของทุกวันก่อนหน้า (sweepEndOfDay ไม่จำกัดวัน) ⇒ ฉากอีกวันบนหน่วยเดียวกัน
 *   (ฉาก B.5 = วันฉาก · ฉาก B.6 = วันฉาก + 7) ถูกยกเลิกทิ้ง (A009–A011 ของฉาก B.5 กลายเป็น CANCELLED END_OF_DAY ⇒ ข้อสอบ b.5 Q-2 แดง)
 *   ⇒ ระหว่าง tick ซ่อน walk-in QUEUED ของวันอื่น (startAt < วันฉาก) ด้วยการสลับ kind เป็น BOOKED ชั่วคราว (นอกช่วงย้อนหลังของ tick ⇒ ไม่ถูกแตะ) แล้วคืน kind ใน finally
 *   — ไม่แตะ src · ผลต่อวันฉากเองเหมือนเดิมทุกอย่าง
 */
async function tickSceneDay(now: Date, ds: string): Promise<void> {
  const hidden = (await prisma.appointment.findMany({
    where: { tenantId, unitId, kind: "WALKIN", status: "QUEUED", startAt: { lt: at(ds, "00:00") } },
    select: { id: true },
  })).map((a) => a.id);
  if (hidden.length) await prisma.$executeRaw`UPDATE "Appointment" SET "kind" = 'BOOKED' WHERE "tenantId" = ${tenantId} AND "unitId" = ${unitId} AND "id" = ANY(${hidden}::text[]) AND "kind" = 'WALKIN'`;
  try {
    await runLineTick(now, { tenantIds: [tenantId] });
  } finally {
    if (hidden.length) await prisma.$executeRaw`UPDATE "Appointment" SET "kind" = 'WALKIN' WHERE "tenantId" = ${tenantId} AND "unitId" = ${unitId} AND "id" = ANY(${hidden}::text[]) AND "kind" = 'BOOKED'`;
  }
}

/**
 * ผู้คุม 30 ต.ค. — ฉากวันนั้นถูกงานวันอื่นทำเสีย? (tick ของวันหลังที่ไม่ได้กันไว้ เช่น cron จริง/ฉากรุ่นเก่า): walk-in ถูกยกเลิก END_OF_DAY ·
 *   บัตรถูกข้ามโดยระบบ (SKIPPED · SYSTEM) · จำนวน walk-in ไม่ครบ ⇒ ไม่นับว่าครบ ⇒ ลบแล้วสร้างใหม่ (เหตุการณ์ของฉากเองไม่เกิดสองอย่างแรก)
 */
async function sceneIntact(ds: string, walkIns: number): Promise<boolean> {
  const range = dayRange(ds);
  const [eod, wi, skipped] = await Promise.all([
    prisma.appointment.count({ where: { tenantId, unitId, startAt: range, cancelReason: "END_OF_DAY" } }),
    prisma.appointment.count({ where: { tenantId, unitId, startAt: range, kind: "WALKIN" } }),
    prisma.queueTicketEvent.count({ where: { tenantId, unitId, action: "SKIPPED", actorType: "SYSTEM", ticket: { businessDate: ds, refType: "APPOINTMENT" } } }),
  ]);
  return eod === 0 && wi === walkIns && skipped === 0;
}
const clearedKeys: string[] = [];
const CLEAR_UNIT_KEYS = ["booking.staff.minBreakMin"] as const;

/** ล้าง override ระดับหน่วย barber ที่ทำให้ฉากไม่ตรงภาพ (เฉพาะคีย์ใน CLEAR_UNIT_KEYS) · ไม่มีแถว = ไม่นับ (รันซ้ำ 0) */
async function clearUnitOverrides(): Promise<void> {
  for (const key of CLEAR_UNIT_KEYS) {
    const n = (await prisma.settingValue.deleteMany({ where: { tenantId, key, scope: "UNIT", scopeId: unitId } })).count;
    if (n > 0) {
      sum.removed += n;
      clearedKeys.push(key);
    }
  }
}

/** ลบงานทั้งหมดของหน่วยบาร์เบอร์ในวันนั้น + นัดของฉาก (คีย์ขึ้นต้น svcqc-line-) + บัตร refType APPOINTMENT + ลำดับเลขบัตรของวัน */
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

/** วันฉากเดิมจากคีย์ที่มีอยู่ ("svcqc-line-YYYY-MM-DD-…") */
async function sceneDays(): Promise<string[]> {
  const rows = await prisma.appointment.findMany({ where: { tenantId, unitId, idempotencyKey: { startsWith: KEY_PREFIX } }, select: { idempotencyKey: true } });
  return [...new Set(rows.map((r) => (r.idempotencyKey ?? "").slice(KEY_PREFIX.length, KEY_PREFIX.length + 10)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))];
}

async function ensureHr(): Promise<void> {
  const sys = await prisma.appSystem.findUnique({ where: { id: hr.systemId }, select: { id: true, tenantId: true } });
  if (!sys) {
    await prisma.appSystem.create({ data: { id: hr.systemId, tenantId, type: "HR", name: "ทีมงานบาร์เบอร์ (ฉาก B.5)" } });
    sum.created++;
  } else if (sys.tenantId !== tenantId) throw new Error(`AppSystem ${hr.systemId} เป็นของร้านอื่น — หยุด`);
  const emp = await prisma.hrEmployee.findUnique({ where: { id: hr.employeeId }, select: { id: true, linkedUserId: true, systemId: true, tenantId: true } });
  if (!emp) {
    await prisma.hrEmployee.create({ data: { id: hr.employeeId, tenantId, systemId: hr.systemId, name: "ช่างเอก", linkedUserId: hrUser.userId } });
    sum.created++;
  } else if (emp.tenantId !== tenantId) throw new Error(`HrEmployee ${hr.employeeId} เป็นของร้านอื่น — หยุด`);
  else if (emp.linkedUserId !== hrUser.userId || emp.systemId !== hr.systemId) {
    await prisma.hrEmployee.update({ where: { id: hr.employeeId }, data: { linkedUserId: hrUser.userId, systemId: hr.systemId } });
    sum.updated++;
  }
  const st = await prisma.bookingStaff.findFirst({ where: { id: ekStaffId, tenantId, unitId }, select: { employeeId: true } });
  if (!st) throw new Error(`ไม่พบ BookingStaff ${ekStaffId} — รัน seed ก่อน`);
  if (st.employeeId !== hr.employeeId) {
    await prisma.bookingStaff.updateMany({ where: { id: ekStaffId, tenantId, unitId }, data: { employeeId: hr.employeeId } });
    sum.updated++;
  }
}

async function hrLinked(): Promise<boolean> {
  const [sys, emp, st] = await Promise.all([
    prisma.appSystem.findFirst({ where: { id: hr.systemId, tenantId, type: "HR" }, select: { id: true } }),
    prisma.hrEmployee.findFirst({ where: { id: hr.employeeId, tenantId, systemId: hr.systemId, linkedUserId: hrUser.userId }, select: { id: true } }),
    prisma.bookingStaff.findFirst({ where: { id: ekStaffId, tenantId, unitId, employeeId: hr.employeeId }, select: { id: true } }),
  ]);
  return !!sys && !!emp && !!st;
}

/** บริการของหน่วยบาร์เบอร์ตาม SKU (BookingService = projection ของ InvItem SERVICE ใน svcqc) */
async function serviceIds(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const s of SQC.barber.services) {
    const items = await prisma.invItem.findMany({ where: { tenantId, sku: s.sku }, select: { id: true } });
    const proj = items.length
      ? await prisma.bookingService.findFirst({ where: { tenantId, unitId, itemId: { in: items.map((i) => i.id) } }, select: { id: true } })
      : null;
    const byName = proj ?? (await prisma.bookingService.findFirst({ where: { tenantId, unitId, name: s.name }, select: { id: true } }));
    if (!byName) throw new Error(`ไม่พบบริการ ${s.sku} ${s.name} ของหน่วยบาร์เบอร์ — รัน seed ก่อน`);
    out[s.sku] = byName.id;
  }
  return out;
}

async function build(): Promise<void> {
  const tpl = await applyTemplate(
    { role: "OWNER", unitAccess: ["*"], permissions: {}, userId: owner.userId },
    { tenantId },
    { unitId, domain: "booking", templateKey: "BARBER", overwrite: "KEEP_CUSTOM" },
  );
  if (!tpl.ok) throw new Error(`applyTemplate BARBER: ${tpl.code} ${JSON.stringify(tpl.issues ?? null).slice(0, 200)}`);
  await ensureHr();
  const svc = await serviceIds();
  const fx: Record<string, string> = {};
  for (const b of SCENE.bookings) {
    const r = await bookAppointment(ctx, {
      serviceId: svc[b.sku], staffId: b.staff ? SCENE.staffIds[b.staff] : null, dateStr: D, startMin: hm(b.start), channel: "STAFF",
      customerName: b.name, customerPhone: b.phone, idempotencyKey: keyOf(D, b.key),
    });
    if (!r.ok) throw new Error(`จอง ${b.key} ${b.start} ล้ม ${r.code} ${r.reason}`);
    fx[b.key] = r.id;
    sum.created++;
    if (r.status === "PENDING") {
      const c = await setAppointmentStatus(tenantId, unitId, r.id, "CONFIRMED");
      if (!c.ok) throw new Error(`ยืนยัน ${b.key}: ${c.reason}`);
    }
  }
  for (const ev of SCENE.events) {
    const now = at(D, ev.at);
    const where = `${ev.at} ${ev.op}${"key" in ev ? ` ${ev.key}` : ""}`;
    if (ev.op === "tick") {
      await tickSceneDay(now, D); // ผู้คุม 30 ต.ค.: tick ไม่กวาดฉากวันอื่น
      continue;
    }
    if (ev.op === "walkIn") {
      const r = await createWalkIn(ctx, { serviceId: svc[ev.sku], staffId: ev.staff ? SCENE.staffIds[ev.staff] : null, channel: "STAFF" }, { now });
      if (!r.ok) throw new Error(`${where}: ${r.code} ${r.reason}`);
      fx[ev.key] = r.appointmentId;
      sum.created++;
      continue;
    }
    const id = fx[ev.key];
    if (!id) throw new Error(`${where}: ไม่รู้จักคีย์`);
    const r = ev.op === "checkIn" ? await checkIn(ctx, { appointmentId: id }, { via: "STAFF", now })
      : ev.op === "start" ? await startJob(ctx, id, { now })
      : ev.op === "done" ? await completeJob(ctx, id, { now })
      : await cancelByShop(ctx, id, { now });
    if (!r.ok) throw new Error(`${where}: ${r.code} ${r.reason}`);
  }
  await runPlanner(ctx, { now: at(D, SCENE.now) });
}

let exitCode = 0;
try {
  const unit = await prisma.businessUnit.findFirst({ where: { id: unitId, tenantId, type: "BOOKING" }, select: { id: true } });
  const staffN = await prisma.bookingStaff.count({ where: { tenantId, unitId, active: true } });
  if (!unit || staffN !== 4) {
    console.error(`🔴 ${LABEL}: หน่วยบาร์เบอร์ svcqc ไม่พร้อม (ช่าง ${staffN} · ต้อง 4) — รัน scripts/seed-svc-qc.mts ก่อน`);
    process.exit(3);
  }
  if (clear) {
    for (const ds of new Set([...(await sceneDays()), D])) sum.removed += await wipeDay(ds);
    const st = await prisma.bookingStaff.updateMany({ where: { id: ekStaffId, tenantId, unitId, employeeId: hr.employeeId }, data: { employeeId: null } });
    sum.updated += st.count;
    sum.removed += (await prisma.hrEmployee.deleteMany({ where: { id: hr.employeeId, tenantId } })).count;
    sum.removed += (await prisma.appSystem.deleteMany({ where: { id: hr.systemId, tenantId, type: "HR" } })).count;
    console.log(`${LABEL}: --clear ลบฉาก (วัน ${D} + วันฉากเดิม) · คืน employeeId ช่างเอก · ลบ HR ของฉาก`);
  } else {
    await clearUnitOverrides();
    const have = await prisma.appointment.count({ where: { tenantId, unitId, idempotencyKey: { in: SCENE.bookings.map((b) => keyOf(D, b.key)) } } });
    const days = await sceneDays();
    // ผู้คุม 30 ต.ค.: + sceneIntact — ฉากที่ถูก tick วันอื่นยกเลิก walk-in (END_OF_DAY) ⇒ สร้างใหม่ (เดิมนับแค่นัด ⇒ 0/0/0 ทั้งที่ A011 ถูกยกเลิก)
    const complete = have === SCENE.bookings.length && days.length === 1 && days[0] === D && (await hrLinked())
      && (await sceneIntact(D, SCENE.events.filter((e) => e.op === "walkIn").length));
    if (complete) {
      console.log(`${LABEL}: ฉากวัน ${D} ครบแล้ว (นัด ${have} · HR ผูกแล้ว) — ไม่ทำอะไร`);
    } else {
      for (const ds of new Set([...days, D])) sum.removed += await wipeDay(ds);
      await build();
      console.log(`${LABEL}: สร้างฉากวัน ${D} ณ ${SCENE.now} แล้ว (เปิดภาพด้วย ?at= ${at(D, SCENE.now).toISOString()} · server ต้องตั้ง SVC_QC_CLOCK=1)`);
    }
  }
} catch (e) {
  exitCode = 1;
  console.error(`🔴 ${LABEL}: ${e instanceof Error ? e.message : String(e)}`);
} finally {
  await prisma.$disconnect();
}
console.log(`SCENE_SUMMARY ${JSON.stringify({ ...sum, clearedKeys })}`);
process.exit(exitCode);
